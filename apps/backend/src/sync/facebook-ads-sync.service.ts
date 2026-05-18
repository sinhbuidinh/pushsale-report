import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import type { AxiosResponse } from 'axios';
import { InjectRepository } from '@nestjs/typeorm';
import * as crypto from 'crypto';
import { firstValueFrom } from 'rxjs';
import { Repository } from 'typeorm';
import {
  getAppTimeZone,
  yesterdayCalendarInZone,
} from '../common/app-timezone';
import { Product } from '../products/product.entity';
import { AdsAccount } from '../users/ads-account.entity';
import { User } from '../users/user.entity';
import { FacebookAdsDailyCost } from './facebook-ads-daily-cost.entity';
import { FacebookAdsInsightsSnapshot } from './facebook-ads-insights-snapshot.entity';
import { generateGraphUrl } from 'src/common/helpers';

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const GRAPH_API_VERSION = process.env.META_GRAPH_API_VERSION?.trim() || 'v23.0';

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
}

type SpendBucket = {
  productId: number | null;
  productItemCode: string | null;
  spend: number;
  matchedAdsCount: number;
  unmatchedAdsCount: number;
};

@Injectable()
export class FacebookAdsSyncService {
  private readonly logger = new Logger(FacebookAdsSyncService.name);

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
      countByUserId.set(
        row.user_id,
        (countByUserId.get(row.user_id) ?? 0) + 1,
      );
    }

    return users.map((user) => ({
      user_id: user.id,
      display_name: user.display_name,
      ads_account_count: countByUserId.get(user.id) ?? 0,
    }));
  }

  private async resolveMarketingUserWithAdsAccounts(marketingUserId: number) {
    const user = await this.userRepo.findOne({ where: { id: marketingUserId } });
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

  async getSyncStatusForMarketingUser(
    marketingUserId: number,
    date?: string,
  ) {
    const { user, adsAccounts } =
      await this.resolveMarketingUserWithAdsAccounts(marketingUserId);
    const syncDate = this.resolveSyncDate(date);

    const ads_accounts = await Promise.all(
      adsAccounts.map(async (account) => ({
        ad_account_id: account.ad_account_id,
        ad_account_name: account.ad_account_name,
        synced: await this.isAlreadySynced(syncDate, account.ad_account_id),
      })),
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

    for (const account of pending) {
      const result = await this.syncDailyProductCosts({
        date: status.sync_date,
        adAccountId: account.ad_account_id,
      });
      results.push(result);
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

  async getDailyCostsForMarketingUser(
    marketingUserId: number,
    date?: string,
  ) {
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
        spend: Number(row.spend),
        currency: row.currency,
        matched_ads_count: row.matched_ads_count,
        unmatched_ads_count: row.unmatched_ads_count,
        notes: row.notes,
        can_resync: row.unmatched_ads_count > 0,
      })),
    };
  }

  /** Force re-fetch from Meta for one ad account + date (replaces daily cost rows). */
  async resyncAdAccountForMarketingUser(input: {
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
    const result = await this.syncDailyProductCosts({
      date: syncDate,
      adAccountId,
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
      accessToken,
    );

    // Step-2: Derive item_code candidates from insight campaign_name ("item_code | …"); only load those products.
    const itemCodeKeys = this.collectDistinctItemCodeKeysFromInsights(insights);
    const products = await this.findProductsByItemCodeKeys(itemCodeKeys);

    // Step-3: Map normalized item_code -> matcher for exact lookup when aggregating.
    const matcherByItemCodeKey = this.buildMatcherMapByItemCodeKey(products);

    // Step-4: Aggregate spend into buckets per product and one bucket for ads that matched nothing;
    const buckets = this.aggregateSpendByProduct(insights, matcherByItemCodeKey);

    const currency = insights.find((row) => row.account_currency)?.account_currency || 'VND';

    // Step-5: Map buckets to DB rows, delete existing rows for this sync_date + ad_account_id, then save (full replace for idempotency);
    const payload = buckets.map((bucket) => ({
      sync_date: syncDate,
      ad_account_id: adAccountId,
      product_id: bucket.productId,
      product_code: bucket.productItemCode,
      spend: Number(bucket.spend.toFixed(2)),
      currency,
      matched_ads_count: bucket.matchedAdsCount,
      unmatched_ads_count: bucket.unmatchedAdsCount,
      notes:
        bucket.productId == null
          ? 'Campaign name did not match a known product item_code (expected "item_code | …").'
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
    const mappedRows = payload.filter((row) => row.product_id != null);
    const unmappedSpend = payload
      .filter((row) => row.product_id == null)
      .reduce((sum, row) => sum + Number(row.spend), 0);

    this.logger.log(
      `Facebook Ads sync completed for ${syncDate} on ${adAccountId}: ${insights.length} ads, ${mappedRows.length} mapped products, total spend ${totalSpend.toFixed(2)} ${currency}`,
    );

    return {
      sync_date: syncDate,
      ad_account_id: adAccountId,
      app_id: appId,
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

  /**
   * Campaign names use `item_code | …`. Returns a lowercase key for DB lookup, or "" if empty.
   * If there is no `|`, the whole trimmed name is used (exact match to `product.item_code`).
   */
  private extractItemCodeKeyFromCampaignName(
    campaignName: string | undefined,
  ): string {
    const raw = (campaignName ?? '').trim();
    if (!raw) {
      return '';
    }

    const pipeIdx = raw.indexOf('|');
    const segment = pipeIdx >= 0 ? raw.slice(0, pipeIdx).trim() : raw;

    return segment.toLowerCase();
  }

  private collectDistinctItemCodeKeysFromInsights(
    insights: FacebookAdInsight[],
  ): string[] {
    const keys = new Set<string>();
    for (const row of insights) {
      const key = this.extractItemCodeKeyFromCampaignName(row.campaign_name);
      if (key) {
        keys.add(key);
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

  private aggregateSpendByProduct(
    insights: FacebookAdInsight[],
    matcherByItemCodeKey: Map<string, ProductMatcher>,
  ): SpendBucket[] {
    const grouped = new Map<string, SpendBucket>();
    const unmatchedKey = '__unmatched__';

    for (const row of insights) {
      const spend = Number.parseFloat(row.spend || '0');
      if (!Number.isFinite(spend) || spend <= 0) {
        continue;
      }

      const codeKey = this.extractItemCodeKeyFromCampaignName(
        row.campaign_name,
      );
      const matched = codeKey ? matcherByItemCodeKey.get(codeKey) : undefined;
      const key = matched ? String(matched.id) : unmatchedKey;
      const bucket =
        grouped.get(key) ||
        ({
          productId: matched?.id ?? null,
          productItemCode: matched?.itemCode ?? null,
          spend: 0,
          matchedAdsCount: 0,
          unmatchedAdsCount: 0,
        } satisfies SpendBucket);

      bucket.spend += spend;
      if (matched) {
        bucket.matchedAdsCount += 1;
      } else {
        bucket.unmatchedAdsCount += 1;
      }
      grouped.set(key, bucket);
    }

    return Array.from(grouped.values());
  }

  private async fetchAdInsightsForDate(
    syncDate: string,
    adAccountId: string,
    accessToken: string,
  ): Promise<FacebookAdInsight[]> {
    const allRows: FacebookAdInsight[] = [];
    const graphNodeId = `act_${adAccountId}`;
    const graphBase = `https://graph.facebook.com/${GRAPH_API_VERSION}/${graphNodeId}/insights`;
    const appSecretProof = this.buildAppSecretProof(accessToken);

    // Field list: https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/insights
    // Many `cost_per_*` names appear in the doc but are not valid `fields` at `level=ad` (Graph returns #100).
    // Use `cost_per_action_type` + `actions` for per-action costs (e.g. submit_application).
    const params = {
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

    let nextUrl: string | null = graphBase;
    let page = 1;
    while (nextUrl) {
      // only first request will include all params
      // next request param will be include into url already
      const requestConfig = { params: page === 1 ? params : undefined };
      this.logger.log(
        '-- fetchAdInsightsForDate: ' +
          (page === 1
            ? generateGraphUrl(nextUrl, params)
            : nextUrl),
      );

      const response: AxiosResponse<FacebookInsightsResponse> =
        await firstValueFrom(
          this.httpService.get<FacebookInsightsResponse>(nextUrl, requestConfig),
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
    params: Record<string, string | number | undefined>,
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
