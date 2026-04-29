import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as crypto from 'crypto';
import { firstValueFrom } from 'rxjs';
import { Repository } from 'typeorm';
import {
  getAppTimeZone,
  yesterdayCalendarInZone,
} from '../common/app-timezone';
import { Product } from '../products/product.entity';
import { FacebookAdsDailyCost } from './facebook-ads-daily-cost.entity';

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const GRAPH_API_VERSION = process.env.META_GRAPH_API_VERSION?.trim() || 'v23.0';

interface FacebookAdInsight {
  ad_id?: string;
  ad_name?: string;
  spend?: string;
  currency?: string;
}

interface FacebookInsightsResponse {
  data?: FacebookAdInsight[];
  paging?: {
    next?: string;
  };
}

interface ProductMatcher {
  id: number;
  itemCode: string;
  matchToken: string;
}

interface SyncFacebookAdsDto {
  date?: string;
  adAccountId?: string;
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
    @InjectRepository(FacebookAdsDailyCost)
    private readonly dailyCostRepo: Repository<FacebookAdsDailyCost>,
  ) {}

  async syncDailyProductCosts(input: SyncFacebookAdsDto = {}) {
    const syncDate = this.resolveSyncDate(input.date);
    const appId = process.env.META_APP_ID?.trim();
    const accessToken = process.env.META_ACCESS_TOKEN?.trim();
    const envAccountId = process.env.META_AD_ACCOUNT_ID?.trim();
    const adAccountId = this.normalizeAdAccountId(
      input.adAccountId || envAccountId || '',
    );

    if (!appId) {
      throw new Error('META_APP_ID is required in .env');
    }
    if (!accessToken) {
      throw new Error('META_ACCESS_TOKEN is required in .env');
    }
    if (!adAccountId) {
      throw new Error(
        'META_AD_ACCOUNT_ID is required in .env or request body adAccountId',
      );
    }

    const insights = await this.fetchAdInsightsForDate(
      syncDate,
      adAccountId,
      accessToken,
    );
    const products = await this.productRepo.find({
      order: { item_code: 'ASC' },
      select: ['id', 'item_code'],
    });
    const matchers = this.buildProductMatchers(products);
    const buckets = this.aggregateSpendByProduct(insights, matchers);
    const currency = insights.find((row) => row.currency)?.currency || 'VND';

    const payload = buckets.map((bucket) => ({
      sync_date: syncDate,
      ad_account_id: adAccountId,
      product_id: bucket.productId,
      product_item_code: bucket.productItemCode,
      spend: Number(bucket.spend.toFixed(2)),
      currency,
      matched_ads_count: bucket.matchedAdsCount,
      unmatched_ads_count: bucket.unmatchedAdsCount,
      notes:
        bucket.productId == null
          ? 'Ad name did not include a known product item_code.'
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
          product_item_code: row.product_item_code,
          spend: Number(row.spend),
          currency: row.currency,
          matched_ads_count: row.matched_ads_count,
          unmatched_ads_count: row.unmatched_ads_count,
          notes: row.notes,
        })),
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
        'product_item_code',
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
        product_item_code: row.product_item_code,
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

  private normalizeAdAccountId(raw: string): string {
    const cleaned = raw.trim();
    if (!cleaned) {
      return '';
    }
    return cleaned.startsWith('act_') ? cleaned : `act_${cleaned}`;
  }

  private buildProductMatchers(products: Product[]): ProductMatcher[] {
    return products
      .map((product) => ({
        id: product.id,
        itemCode: product.item_code,
        matchToken: product.item_code.trim().toLowerCase(),
      }))
      .filter((matcher) => matcher.matchToken.length > 0)
      .sort((a, b) => b.matchToken.length - a.matchToken.length);
  }

  private aggregateSpendByProduct(
    insights: FacebookAdInsight[],
    matchers: ProductMatcher[],
  ): SpendBucket[] {
    const grouped = new Map<string, SpendBucket>();
    const unmatchedKey = '__unmatched__';

    for (const row of insights) {
      const spend = Number.parseFloat(row.spend || '0');
      if (!Number.isFinite(spend) || spend <= 0) {
        continue;
      }

      const adName = (row.ad_name || '').toLowerCase();
      const matched = matchers.find((matcher) =>
        adName.includes(matcher.matchToken),
      );
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
    const graphBase = `https://graph.facebook.com/${GRAPH_API_VERSION}/${adAccountId}/insights`;
    const appSecretProof = this.buildAppSecretProof(accessToken);
    const params = {
      access_token: accessToken,
      fields: ['ad_id', 'ad_name', 'spend', 'currency'].join(','),
      level: 'ad',
      limit: 500,
      time_range: JSON.stringify({ since: syncDate, until: syncDate }),
      ...(appSecretProof ? { appsecret_proof: appSecretProof } : {}),
    };

    let nextUrl: string | null = graphBase;
    let page = 1;
    while (nextUrl) {
      const response = await firstValueFrom(
        this.httpService.get<FacebookInsightsResponse>(nextUrl, {
          params: page === 1 ? params : undefined,
        }),
      );
      const body = response.data;
      if (Array.isArray(body?.data)) {
        allRows.push(...body.data);
      }
      nextUrl = body?.paging?.next || null;
      page += 1;
    }

    return allRows;
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
