import { HttpService } from '@nestjs/axios';
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { CronJob } from 'cron';
import type { AxiosResponse } from 'axios';
import { InjectRepository } from '@nestjs/typeorm';
import * as crypto from 'crypto';
import { firstValueFrom } from 'rxjs';
import { In, Repository } from 'typeorm';
import {
  getAppTimeZone,
  yesterdayCalendarInZone,
} from '../common/app-timezone';
import { Product } from '../products/product.entity';
import { AdsAccount } from '../users/ads-account.entity';
import { User } from '../users/user.entity';
import { FacebookAdsDailyCost } from './facebook-ads-daily-cost.entity';
import { FacebookAdsInsightsSnapshot } from './facebook-ads-insights-snapshot.entity';
import { generateGraphUrl, type GraphQueryParams } from 'src/common/helpers';
import { extractItemCodeKeysFromCampaignName } from './facebook-ads-campaign-name.util';
import {
  aggregateSpendByProduct,
  formatUnmatchedCampaignNotes,
} from './facebook-ads-spend-aggregate.util';

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const GRAPH_API_VERSION = process.env.META_GRAPH_API_VERSION?.trim() || 'v23.0';

/** Pause between Meta insights fetches per ad account (cron + manual sync). */
function facebookAdsAdAccountIntervalMs(): number {
  const raw = process.env.FACEBOOK_ADS_AD_ACCOUNT_INTERVAL_MS?.trim();
  if (!raw) {
    return 5000;
  }
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 5000;
}

export interface FacebookAdInsight {
  // account
  account_id?: string;
  account_name?: string;
  account_currency?: string;
  // hierarchy metrics
  campaign_id?: string;
  campaign_name?: string;
  adset_id?: string;
  adset_name?: string;
  ad_id?: string;
  ad_name?: string;
  // delivery metrics
  impressions?: string;
  clicks?: string;
  reach?: string;
  frequency?: string;
  spend?: string;
  // rates/costs
  cpm?: string;
  cpc?: string;
  ctr?: string;
  cpp?: string;
  date_start?: string;
  date_stop?: string;
  // actions?: string;
  // cost_per_action_type?: string;
}

interface FacebookInsightsResponse {
  data?: FacebookAdInsight[];
  paging?: {
    next?: string;
  };
}

export interface FacebookCampaign {
  id?: string;
  name?: string;
  status?: string;
  effective_status?: string;
  objective?: string;
  daily_budget?: string;
  lifetime_budget?: string;
  start_time?: string;
  stop_time?: string;
  created_time?: string;
  updated_time?: string;
}
interface ProductMatcher {
  id: number;
  itemCode: string;
  matchToken: string;
}

interface SyncFacebookAdsInput {
  date?: string;
  /** Meta ad account id: digits only (no act_ prefix). */
  adAccountId: string;
  filterIsActiveCampaign: boolean;
}

@Injectable()
export class FacebookAdsSyncService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FacebookAdsSyncService.name);
  private dailyFacebookAdsCronJob: CronJob | null = null;
  private isDailyCronRunning = false;

  constructor(
    private readonly httpService: HttpService,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(AdsAccount)
    private readonly adsAccountRepo: Repository<AdsAccount>,
    @InjectRepository(FacebookAdsDailyCost)
    private readonly dailyCostRepo: Repository<FacebookAdsDailyCost>,
    @InjectRepository(FacebookAdsInsightsSnapshot)
    private readonly insightsSnapshotRepo: Repository<FacebookAdsInsightsSnapshot>,
  ) {}

  onModuleInit(): void {
    void this.dailyFacebookAdsCronJob?.stop();
    const timeZone = getAppTimeZone();
    const cronExpression =
      process.env.FACEBOOK_ADS_SYNC_CRON_EXPRESSION?.trim() || '15 0 * * *';
    this.dailyFacebookAdsCronJob = new CronJob(
      cronExpression,
      () => void this.handleDailyFacebookAdsSync(),
      null,
      false,
      timeZone,
    );
    this.dailyFacebookAdsCronJob.start();
    this.logger.log(
      `Daily Facebook Ads sync cron registered: "${cronExpression}" (${timeZone}).`,
    );

    void this.catchUpMissedDailyFacebookAdsSync();
  }

  onModuleDestroy(): void {
    void this.dailyFacebookAdsCronJob?.stop();
    this.dailyFacebookAdsCronJob = null;
  }

  /**
   * Runs once at boot. If yesterday's ads costs are not fully synced for every
   * marketing user with ad accounts, triggers the daily sync flow now.
   */
  private async catchUpMissedDailyFacebookAdsSync(): Promise<void> {
    if (this.isDailyCronRunning) {
      return;
    }

    try {
      const yesterday = yesterdayCalendarInZone(getAppTimeZone());
      const fullySynced = await this.isFullySyncedForDate(yesterday);
      if (fullySynced) {
        this.logger.log(
          `Startup catch-up Facebook Ads: ${yesterday} already fully synced; nothing to do.`,
        );
        return;
      }

      this.logger.warn(
        `Startup catch-up Facebook Ads: incomplete sync for ${yesterday}; triggering sync now.`,
      );
      this.isDailyCronRunning = true;
      const summary = await this.syncAllMarketingUsers(yesterday);
      this.logger.log(
        `Startup catch-up Facebook Ads finished: ${summary.users_synced} user(s) synced, ${summary.users_skipped_already_synced} already complete, ${summary.users_failed} failed.`,
      );
    } catch (err) {
      this.logger.error(
        `Startup catch-up Facebook Ads failed: ${err instanceof Error ? err.message : String(err)}. Daily cron will still run as scheduled.`,
      );
    } finally {
      this.isDailyCronRunning = false;
    }
  }

  /** True when every marketing user with ad accounts has all accounts synced. */
  private async isFullySyncedForDate(syncDate: string): Promise<boolean> {
    const marketingUsers = await this.listMarketingUsers();
    const withAccounts = marketingUsers.filter(
      (user) => user.ads_account_count > 0,
    );
    if (withAccounts.length === 0) {
      return true;
    }

    for (const user of withAccounts) {
      const status = await this.getSyncStatusForMarketingUser(
        user.user_id,
        syncDate,
      );
      if (!status.synced) {
        return false;
      }
    }
    return true;
  }

  /** Cron entry: sync yesterday's ads costs for every marketing user with ad accounts. */
  handleDailyFacebookAdsSync(): void {
    if (this.isDailyCronRunning) {
      this.logger.warn(
        'Daily Facebook Ads sync skipped: previous run still in progress.',
      );
      return;
    }
    this.isDailyCronRunning = true;
    const syncDate = yesterdayCalendarInZone(getAppTimeZone());
    this.logger.log(
      `Starting automated daily Facebook Ads sync for ${syncDate}...`,
    );
    void this.syncAllMarketingUsers(syncDate)
      .then((summary) => {
        this.logger.log(
          `Automated daily Facebook Ads sync finished: ${summary.users_synced} user(s) synced, ${summary.users_skipped_already_synced} already complete, ${summary.users_failed} failed.`,
        );
      })
      .catch((err) => {
        this.logger.error(
          `Automated daily Facebook Ads sync failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      })
      .finally(() => {
        this.isDailyCronRunning = false;
      });
  }

  /**
   * Same flow as POST /sync/facebook-ads/marketing-user for each marketing user
   * that has at least one linked ad account.
   */
  async syncAllMarketingUsers(syncDate?: string): Promise<{
    sync_date: string;
    users_total: number;
    users_synced: number;
    users_skipped_already_synced: number;
    users_failed: number;
    results: Array<{
      marketing_user_id: number;
      display_name: string;
      ok: boolean;
      already_synced?: boolean;
      error?: string;
    }>;
  }> {
    const date = this.resolveSyncDate(syncDate);
    const marketingUsers = await this.listMarketingUsers();
    const withAccounts = marketingUsers.filter(
      (user) => user.ads_account_count > 0,
    );

    const results: Array<{
      marketing_user_id: number;
      display_name: string;
      ok: boolean;
      already_synced?: boolean;
      error?: string;
    }> = [];
    let usersSynced = 0;
    let usersSkippedAlreadySynced = 0;
    let usersFailed = 0;

    for (const user of withAccounts) {
      try {
        const outcome = await this.syncForMarketingUser(user.user_id, date);
        if (outcome.already_synced) {
          usersSkippedAlreadySynced += 1;
        } else {
          usersSynced += 1;
        }
        results.push({
          marketing_user_id: user.user_id,
          display_name: user.display_name,
          ok: true,
          already_synced: outcome.already_synced,
        });
      } catch (err) {
        usersFailed += 1;
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(
          `Facebook Ads sync failed for marketing user ${user.user_id} (${user.display_name}) on ${date}: ${message}`,
        );
        results.push({
          marketing_user_id: user.user_id,
          display_name: user.display_name,
          ok: false,
          error: message,
        });
      }
    }

    return {
      sync_date: date,
      users_total: withAccounts.length,
      users_synced: usersSynced,
      users_skipped_already_synced: usersSkippedAlreadySynced,
      users_failed: usersFailed,
      results,
    };
  }

  private sleepMs(ms: number): Promise<void> {
    if (ms <= 0) {
      return Promise.resolve();
    }
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /** All users with role marketing (for sync UI dropdown). */
  async listMarketingUsers() {
    const users = await this.userRepo.find({
      where: { type: 'marketing' },
      order: { display_name: 'ASC' },
      select: ['id', 'display_name'],
    });

    const accountRows = await this.adsAccountRepo.find({
      select: ['user_id'],
    });
    const countByUserId = new Map<number, number>();
    for (const row of accountRows) {
      countByUserId.set(row.user_id, (countByUserId.get(row.user_id) ?? 0) + 1);
    }

    return users.map((user) => ({
      user_id: user.id,
      display_name: user.display_name,
      ads_account_count: countByUserId.get(user.id) ?? 0,
    }));
  }

  private async resolveMarketingUserWithAdsAccounts(marketingUserId: number) {
    const user = await this.userRepo.findOne({
      where: { id: marketingUserId },
    });
    if (!user) {
      throw new Error('User not found.');
    }
    if (user.type !== 'marketing') {
      throw new Error('Selected user is not a marketing user.');
    }

    const adsAccounts = await this.adsAccountRepo.find({
      where: { user_id: marketingUserId },
      order: { ad_account_id: 'ASC' },
    });
    if (adsAccounts.length === 0) {
      throw new Error('No Facebook ad accounts linked to this marketing user.');
    }

    return { user, adsAccounts };
  }

  async getSyncStatusForMarketingUser(marketingUserId: number, date?: string) {
    const { user, adsAccounts } =
      await this.resolveMarketingUserWithAdsAccounts(marketingUserId);
    const syncDate = this.resolveSyncDate(date);

    const adAccountIds = adsAccounts.map((account) => account.ad_account_id);
    const syncedAtByAccountId =
      await this.getLatestDailyCostUpdatedAtByAdAccount(syncDate, adAccountIds);

    const ads_accounts = await Promise.all(
      adsAccounts.map(async (account) => {
        const syncedAt = syncedAtByAccountId.get(account.ad_account_id);
        return {
          ad_account_id: account.ad_account_id,
          ad_account_name: account.ad_account_name,
          synced: await this.isAlreadySynced(syncDate, account.ad_account_id),
          synced_at: syncedAt?.toISOString() ?? null,
        };
      }),
    );

    const syncedAccountsCount = ads_accounts.filter((a) => a.synced).length;
    return {
      marketing_user_id: marketingUserId,
      display_name: user.display_name,
      sync_date: syncDate,
      ads_accounts,
      synced: syncedAccountsCount === ads_accounts.length,
      synced_accounts_count: syncedAccountsCount,
      total_accounts_count: ads_accounts.length,
    };
  }

  /**
   * Sync daily product costs for every ad account linked to the marketing user.
   * Skips accounts already synced for that date; returns early if all are done.
   */
  async syncForMarketingUser(marketingUserId: number, date?: string) {
    const status = await this.getSyncStatusForMarketingUser(
      marketingUserId,
      date,
    );
    if (status.synced) {
      return {
        already_synced: true as const,
        message: `Facebook ads data for ${status.display_name} on ${status.sync_date} is already synced (${status.total_accounts_count} ad account(s)).`,
        ...status,
      };
    }

    const pending = status.ads_accounts.filter((account) => !account.synced);
    const results: Awaited<
      ReturnType<FacebookAdsSyncService['syncDailyProductCosts']>
    >[] = [];
    const intervalMs = facebookAdsAdAccountIntervalMs();

    for (let i = 0; i < pending.length; i++) {
      const account = pending[i];
      const result = await this.syncDailyProductCosts({
        date: status.sync_date,
        adAccountId: account.ad_account_id,
        filterIsActiveCampaign: false,
      });
      results.push(result);
      if (i < pending.length - 1 && intervalMs > 0) {
        await this.sleepMs(intervalMs);
      }
    }

    const totalSpend = results.reduce(
      (sum, row) => sum + Number(row.total_spend ?? 0),
      0,
    );
    const fetchedAdsCount = results.reduce(
      (sum, row) => sum + Number(row.fetched_ads_count ?? 0),
      0,
    );
    const mappedProductsCount = results.reduce(
      (sum, row) => sum + Number(row.mapped_products_count ?? 0),
      0,
    );

    return {
      already_synced: false as const,
      message: `Facebook ads data synced for ${status.display_name} on ${status.sync_date} (${results.length} ad account(s)).`,
      marketing_user_id: marketingUserId,
      display_name: status.display_name,
      sync_date: status.sync_date,
      accounts_synced: results.length,
      accounts_skipped: status.synced_accounts_count,
      total_accounts_count: status.total_accounts_count,
      total_spend: Number(totalSpend.toFixed(2)),
      currency: results[0]?.currency ?? 'VND',
      fetched_ads_count: fetchedAdsCount,
      mapped_products_count: mappedProductsCount,
      results,
    };
  }

  async getDailyCostsForMarketingUser(marketingUserId: number, date?: string) {
    const { user, adsAccounts } =
      await this.resolveMarketingUserWithAdsAccounts(marketingUserId);
    const syncDate = this.resolveSyncDate(date);
    const adAccountIds = adsAccounts.map((account) => account.ad_account_id);
    const nameByAccountId = new Map(
      adsAccounts.map((account) => [
        account.ad_account_id,
        account.ad_account_name,
      ]),
    );

    if (adAccountIds.length === 0) {
      return {
        marketing_user_id: marketingUserId,
        display_name: user.display_name,
        sync_date: syncDate,
        rows: [],
      };
    }

    const rows = await this.dailyCostRepo
      .createQueryBuilder('cost')
      .where('cost.sync_date = :syncDate', { syncDate })
      .andWhere('cost.ad_account_id IN (:...adAccountIds)', { adAccountIds })
      .orderBy('cost.ad_account_id', 'ASC')
      .addOrderBy('cost.spend', 'DESC')
      .getMany();

    const snapshots = await this.insightsSnapshotRepo.find({
      where: { sync_date: syncDate, ad_account_id: In(adAccountIds) },
      select: ['ad_account_id', 'response'],
    });
    const canNormalizeByAccountId = new Map(
      snapshots.map((snapshot) => [
        snapshot.ad_account_id,
        this.hasNonEmptySnapshotResponse(snapshot.response),
      ]),
    );

    return {
      marketing_user_id: marketingUserId,
      display_name: user.display_name,
      sync_date: syncDate,
      rows: rows.map((row) => ({
        id: row.id,
        sync_date: row.sync_date,
        ad_account_id: row.ad_account_id,
        ad_account_name: nameByAccountId.get(row.ad_account_id) ?? null,
        product_id: row.product_id,
        product_code: row.product_code,
        product_ids: row.product_ids,
        campaign_group_key: row.campaign_group_key,
        spend: Number(row.spend),
        currency: row.currency,
        matched_ads_count: row.matched_ads_count,
        unmatched_ads_count: row.unmatched_ads_count,
        notes: row.notes,
        can_resync: row.unmatched_ads_count > 0,
        can_normalize: canNormalizeByAccountId.get(row.ad_account_id) ?? false,
        updated_at: row.updated_at?.toISOString() ?? null,
      })),
    };
  }

  /**
   * Rebuild facebook_ads_daily_cost rows from a stored insights snapshot
   * (no Meta API fetch).
   */
  async normalizeDailyCostsFromSnapshot(input: {
    marketingUserId: number;
    adAccountId: string;
    date?: string;
  }) {
    const { user, adsAccounts } =
      await this.resolveMarketingUserWithAdsAccounts(input.marketingUserId);
    const adAccountId = this.requireNumericAdAccountId(input.adAccountId);
    const owned = adsAccounts.some(
      (account) => account.ad_account_id === adAccountId,
    );
    if (!owned) {
      throw new Error('Ad account is not linked to this marketing user.');
    }

    const syncDate = this.resolveSyncDate(input.date);
    const snapshot = await this.insightsSnapshotRepo.findOne({
      where: { sync_date: syncDate, ad_account_id: adAccountId },
    });
    if (!snapshot) {
      throw new Error(
        'No insights snapshot found for this ad account and date.',
      );
    }
    if (!this.hasNonEmptySnapshotResponse(snapshot.response)) {
      throw new Error('Insights snapshot has no response data to normalize.');
    }

    const insights = snapshot.response as FacebookAdInsight[];

    this.logger.log(
      `Normalizing daily costs from snapshot for ${syncDate} on ${adAccountId}: ${insights.length} ads`,
    );

    const result = await this.persistDailyCostsFromInsights(
      syncDate,
      adAccountId,
      insights,
    );

    return {
      message: `Normalized daily costs from snapshot for ${user.display_name} on ${syncDate} (act_${adAccountId}).`,
      marketing_user_id: input.marketingUserId,
      display_name: user.display_name,
      ...result,
    };
  }

  /** Force re-fetch from Meta for one ad account + date (replaces daily cost rows). */
  async resyncAdAccountForMarketingUser(input: {
    marketingUserId: number;
    adAccountId: string;
    filterIsActiveCampaign: boolean;
    date?: string;
  }) {
    const { user, adsAccounts } =
      await this.resolveMarketingUserWithAdsAccounts(input.marketingUserId);
    const adAccountId = this.requireNumericAdAccountId(input.adAccountId);
    const owned = adsAccounts.some(
      (account) => account.ad_account_id === adAccountId,
    );
    if (!owned) {
      throw new Error('Ad account is not linked to this marketing user.');
    }

    const syncDate = this.resolveSyncDate(input.date);
    const result = await this.syncDailyProductCosts({
      date: syncDate,
      adAccountId,
      filterIsActiveCampaign: input.filterIsActiveCampaign,
    });

    return {
      message: `Re-synced Facebook ads for ${user.display_name} on ${syncDate} (act_${adAccountId}).`,
      marketing_user_id: input.marketingUserId,
      display_name: user.display_name,
      ...result,
    };
  }

  private async isAlreadySynced(
    syncDate: string,
    adAccountId: string,
  ): Promise<boolean> {
    const count = await this.insightsSnapshotRepo.count({
      where: { sync_date: syncDate, ad_account_id: adAccountId },
    });
    return count > 0;
  }

  /** Latest `updated_at` per ad account for a sync date (from daily cost rows). */
  private async getLatestDailyCostUpdatedAtByAdAccount(
    syncDate: string,
    adAccountIds: string[],
  ): Promise<Map<string, Date>> {
    if (adAccountIds.length === 0) {
      return new Map();
    }

    const rows = await this.dailyCostRepo
      .createQueryBuilder('cost')
      .select('cost.ad_account_id', 'ad_account_id')
      .addSelect('MAX(cost.updated_at)', 'synced_at')
      .where('cost.sync_date = :syncDate', { syncDate })
      .andWhere('cost.ad_account_id IN (:...adAccountIds)', { adAccountIds })
      .groupBy('cost.ad_account_id')
      .getRawMany<{ ad_account_id: string; synced_at: Date | string | null }>();

    return new Map(
      rows
        .filter((row) => row.synced_at != null)
        .map((row) => [row.ad_account_id, new Date(row.synced_at as Date)]),
    );
  }

  async syncDailyProductCosts(input: SyncFacebookAdsInput) {
    const syncDate = this.resolveSyncDate(input.date);
    const appId = process.env.META_APP_ID?.trim();
    const accessToken = process.env.META_ACCESS_TOKEN?.trim();
    const adAccountId = this.requireNumericAdAccountId(input.adAccountId);

    if (!appId) {
      throw new Error('META_APP_ID is required in .env');
    }
    if (!accessToken) {
      throw new Error('META_ACCESS_TOKEN is required in .env');
    }

    // Step-1: fetch ad-level insights from Meta (spend, ad_name, currency);
    const insights = await this.fetchAdInsightsForDate(
      syncDate,
      adAccountId,
      input.filterIsActiveCampaign,
      accessToken,
    );

    const result = await this.persistDailyCostsFromInsights(
      syncDate,
      adAccountId,
      insights,
    );

    this.logger.log(
      `Facebook Ads sync completed for ${syncDate} on ${adAccountId}: ${insights.length} ads, ${result.mapped_products_count} mapped products, total spend ${result.total_spend.toFixed(2)} ${result.currency}`,
    );

    return {
      app_id: appId,
      ...result,
    };
  }

  private hasNonEmptySnapshotResponse(response: unknown): boolean {
    return Array.isArray(response) && response.length > 0;
  }

  private async persistDailyCostsFromInsights(
    syncDate: string,
    adAccountId: string,
    insights: FacebookAdInsight[],
  ) {
    // Step-1: Collect distinct item_code keys from insights.
    const itemCodeKeys = this.collectDistinctItemCodeKeysFromInsights(insights);

    // Step-2: Find products by item_code keys.
    const products = await this.findProductsByItemCodeKeys(itemCodeKeys);

    // Step-3: Map normalized item_code -> matcher for exact lookup when aggregating.
    const matcherByItemCodeKey = this.buildMatcherMapByItemCodeKey(products);

    // Step-4: Aggregate spend into buckets per product and one bucket for ads that matched nothing;
    const buckets = aggregateSpendByProduct(insights, matcherByItemCodeKey);

    const currency =
      insights.find((row) => row.account_currency)?.account_currency || 'VND';

    // Step-5: Map buckets to DB rows, delete existing rows for this sync_date + ad_account_id, then save (full replace for idempotency);
    const payload = buckets.map((bucket) => ({
      sync_date: syncDate,
      ad_account_id: adAccountId,
      product_id: bucket.productId,
      product_code: bucket.productItemCode,
      product_ids: bucket.productIds,
      campaign_group_key: bucket.campaignGroupKey,
      spend: Number(bucket.spend.toFixed(2)),
      currency,
      matched_ads_count: bucket.matchedAdsCount,
      unmatched_ads_count: bucket.unmatchedAdsCount,
      notes:
        bucket.productId == null && !bucket.productIds?.length
          ? formatUnmatchedCampaignNotes(bucket.unmatchedCampaignNames)
          : null,
    }));

    await this.dailyCostRepo.delete({
      sync_date: syncDate,
      ad_account_id: adAccountId,
    });
    if (payload.length > 0) {
      await this.dailyCostRepo.save(payload);
    }

    const totalSpend = payload.reduce((sum, row) => sum + Number(row.spend), 0);
    const isMappedRow = (row: (typeof payload)[number]) =>
      row.product_id != null || (row.product_ids?.length ?? 0) > 0;
    const mappedRows = payload.filter(isMappedRow);
    const groupRows = payload.filter(
      (row) => (row.product_ids?.length ?? 0) > 0,
    );
    const unmappedSpend = payload
      .filter((row) => !isMappedRow(row))
      .reduce((sum, row) => sum + Number(row.spend), 0);

    this.logger.log(
      `Facebook Ads sync completed for ${syncDate} on ${adAccountId}: ${insights.length} ads, ${mappedRows.length} mapped rows (${groupRows.length} product groups), total spend ${totalSpend.toFixed(2)} ${currency}`,
    );

    return {
      sync_date: syncDate,
      ad_account_id: adAccountId,
      fetched_ads_count: insights.length,
      rows_persisted: payload.length,
      mapped_products_count: mappedRows.length,
      unmapped_spend: Number(unmappedSpend.toFixed(2)),
      total_spend: Number(totalSpend.toFixed(2)),
      currency,
      rows: payload
        .sort((a, b) => Number(b.spend) - Number(a.spend))
        .map((row) => ({
          product_id: row.product_id,
          product_code: row.product_code,
          product_ids: row.product_ids,
          campaign_group_key: row.campaign_group_key,
          spend: Number(row.spend),
          currency: row.currency,
          matched_ads_count: row.matched_ads_count,
          unmatched_ads_count: row.unmatched_ads_count,
          notes: row.notes,
        })),
    };
  }

  /**
   * Loads ad-level Meta Marketing API insights for one calendar day (Graph
   * `time_range` since/until). Does not write to the database.
   */
  async getAdInsightsForAccountAndDate(input: {
    adAccountId: string;
    date?: string;
    filterIsActiveCampaign: boolean;
  }) {
    const appId = process.env.META_APP_ID?.trim();
    const accessToken = process.env.META_ACCESS_TOKEN?.trim();
    if (!appId) {
      throw new Error('META_APP_ID is missing');
    }
    if (!accessToken) {
      throw new Error('META_ACCESS_TOKEN is missing');
    }

    const syncDate = this.resolveSyncDate(input.date);
    const adAccountId = this.requireNumericAdAccountId(input.adAccountId);
    const insights = await this.fetchAdInsightsForDate(
      syncDate,
      adAccountId,
      input.filterIsActiveCampaign,
      accessToken,
    );
    return {
      sync_date: syncDate,
      ad_account_id: adAccountId,
      count: insights.length,
      insights: insights,
    };
  }

  async getDailyProductCosts(date?: string, adAccountId?: string) {
    const syncDate = this.resolveSyncDate(date);
    const resolvedAccount = this.normalizeAdAccountId(
      adAccountId || process.env.META_AD_ACCOUNT_ID?.trim() || '',
    );
    if (!resolvedAccount) {
      throw new Error(
        'META_AD_ACCOUNT_ID is required in .env or query param adAccountId',
      );
    }

    const rows = await this.dailyCostRepo.find({
      where: { sync_date: syncDate, ad_account_id: resolvedAccount },
      order: { spend: 'DESC' },
      select: [
        'product_id',
        'product_code',
        'product_ids',
        'campaign_group_key',
        'spend',
        'currency',
        'matched_ads_count',
        'unmatched_ads_count',
        'notes',
      ],
    });

    const totalSpend = rows.reduce((sum, row) => sum + Number(row.spend), 0);
    return {
      sync_date: syncDate,
      ad_account_id: resolvedAccount,
      total_spend: Number(totalSpend.toFixed(2)),
      rows: rows.map((row) => ({
        product_id: row.product_id,
        product_code: row.product_code,
        product_ids: row.product_ids,
        campaign_group_key: row.campaign_group_key,
        spend: Number(row.spend),
        currency: row.currency,
        matched_ads_count: row.matched_ads_count,
        unmatched_ads_count: row.unmatched_ads_count,
        notes: row.notes,
      })),
    };
  }

  private resolveSyncDate(date?: string): string {
    if (!date) {
      return yesterdayCalendarInZone(getAppTimeZone());
    }
    if (!YMD_RE.test(date)) {
      throw new Error('Invalid date format. Expected YYYY-MM-DD.');
    }
    return date;
  }

  /** Digits only, or empty if missing / invalid after optional legacy `act_` strip. */
  private normalizeAdAccountId(raw: string): string {
    const cleaned = raw.trim();
    if (!cleaned) {
      return '';
    }
    const idPart = cleaned.toLowerCase().startsWith('act_')
      ? cleaned.slice(4)
      : cleaned;
    return /^\d+$/.test(idPart) ? idPart : '';
  }

  /** Digits-only Meta ad account id. Throws if missing or non-numeric. */
  private requireNumericAdAccountId(raw: string): string {
    const cleaned = raw.trim();
    if (!cleaned) {
      throw new Error('adAccountId is required.');
    }
    if (!/^\d+$/.test(cleaned)) {
      throw new Error('adAccountId must be numeric (digits only).');
    }
    return cleaned;
  }

  private collectDistinctItemCodeKeysFromInsights(
    insights: FacebookAdInsight[],
  ): string[] {
    const keys = new Set<string>();
    for (const row of insights) {
      for (const key of extractItemCodeKeysFromCampaignName(
        row.campaign_name,
      )) {
        if (key) {
          keys.add(key);
        }
      }
    }

    return [...keys];
  }

  private async findProductsByItemCodeKeys(keys: string[]): Promise<Product[]> {
    if (keys.length === 0) {
      return [];
    }

    return this.productRepo
      .createQueryBuilder('p')
      .where('LOWER(p.item_code) IN (:...keys)', { keys })
      .select(['p.id', 'p.item_code'])
      .orderBy('p.item_code', 'ASC')
      .getMany();
  }

  private buildMatcherMapByItemCodeKey(
    products: Product[],
  ): Map<string, ProductMatcher> {
    const map = new Map<string, ProductMatcher>();
    for (const product of products) {
      const matchToken = product.item_code.trim().toLowerCase();
      if (!matchToken) {
        continue;
      }
      map.set(matchToken, {
        id: product.id,
        itemCode: product.item_code,
        matchToken,
      });
    }

    return map;
  }

  private async fetchAdInsightsForDate(
    syncDate: string,
    adAccountId: string,
    filterIsActiveCampaign: boolean,
    accessToken: string,
  ): Promise<FacebookAdInsight[]> {
    const allRows: FacebookAdInsight[] = [];
    const graphNodeId = `act_${adAccountId}`;
    const graphBase = `https://graph.facebook.com/${GRAPH_API_VERSION}/${graphNodeId}/insights`;
    const appSecretProof = this.buildAppSecretProof(accessToken);

    // Field list: https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/insights
    // Many `cost_per_*` names appear in the doc but are not valid `fields` at `level=ad` (Graph returns #100).
    // Use `cost_per_action_type` + `actions` for per-action costs (e.g. submit_application).
    const params: GraphQueryParams = {
      access_token: accessToken,
      fields: [
        // account
        'account_id',
        'account_name',
        'account_currency',
        // hierarchy metrics
        'campaign_id',
        'campaign_name', // compare with value in campaign name in dashboard of adsmanager/mamange/campaigns -> this is using for mapping product item_code
        'adset_id',
        'adset_name',
        'ad_id',
        'ad_name',
        // delivery metrics
        'impressions', // The number of times your ads were on screen.
        'clicks',
        'reach',
        'frequency', // The average number of times each person saw your ad. This metric is estimated.
        'spend',
        // rates/costs
        'cpm', // The average cost for 1,000 impressions.
        'cpc', // The average cost for each click (all).
        'ctr', // The percentage of times Accounts Center accounts saw your ad and performed a click (all).
        'cpp', // The average cost to reach 1,000 Accounts Center accounts. This metric is estimated.
        // actions
        // 'actions',
        // 'cost_per_action_type',
      ].join(','),
      level: 'ad',
      limit: 500,
      time_range: JSON.stringify({ since: syncDate, until: syncDate }),
      ...(appSecretProof ? { appsecret_proof: appSecretProof } : {}),
    };

    if (filterIsActiveCampaign === true) {
      this.logger.log('-- Filtering active campaigns ONLY');

      params.filtering = JSON.stringify([
        {
          field: 'campaign.effective_status',
          operator: 'IN',
          value: ['ACTIVE'],
        },
      ]);
    }

    let nextUrl: string | null = graphBase;
    let page = 1;
    while (nextUrl) {
      // only first request will include all params
      // next request param will be include into url already
      const requestConfig = { params: page === 1 ? params : undefined };
      this.logger.log(
        '-- Try fetch AdInsights by: ' +
          (page === 1 ? generateGraphUrl(nextUrl, params) : nextUrl),
      );

      const response: AxiosResponse<FacebookInsightsResponse> =
        await firstValueFrom(
          this.httpService.get<FacebookInsightsResponse>(
            nextUrl,
            requestConfig,
          ),
        );
      const body: FacebookInsightsResponse = response.data;
      if (Array.isArray(body?.data)) {
        allRows.push(...body.data);
      }

      // if have next page, that will be include all params already
      nextUrl = body?.paging?.next || null;
      page += 1;
    }

    await this.upsertInsightsSnapshot(
      syncDate,
      adAccountId,
      this.sanitizeInsightsRequestParams(nextUrl ?? '', params),
      allRows,
    );

    return allRows;
  }

  private sanitizeInsightsRequestParams(
    nextUrl: string,
    params: Record<string, unknown>,
  ): Record<string, unknown> {
    const out: Record<string, unknown> = { ...params };
    out.nextUrl = nextUrl;
    if (out.access_token != null) {
      out.access_token = '[REDACTED]';
    }
    if (out.appsecret_proof != null) {
      out.appsecret_proof = '[REDACTED]';
    }
    return out;
  }

  private async upsertInsightsSnapshot(
    syncDate: string,
    adAccountId: string,
    requestParams: Record<string, unknown>,
    response: FacebookAdInsight[],
  ): Promise<void> {
    let row = await this.insightsSnapshotRepo.findOne({
      where: { sync_date: syncDate, ad_account_id: adAccountId },
    });
    if (!row) {
      row = this.insightsSnapshotRepo.create({
        sync_date: syncDate,
        ad_account_id: adAccountId,
      });
    }
    row.request_params = requestParams;
    row.response = response;
    await this.insightsSnapshotRepo.save(row);
  }

  private buildAppSecretProof(accessToken: string): string | null {
    const appSecret = process.env.META_APP_SECRET?.trim();
    if (!appSecret) {
      return null;
    }
    return crypto
      .createHmac('sha256', appSecret)
      .update(accessToken)
      .digest('hex');
  }
}
