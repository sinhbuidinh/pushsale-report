import {
  CAMPAIGN_NAME_PIPE_SEPARATOR,
  extractItemCodeKeysFromCampaignName,
  formatItemCodesForDisplay,
} from './facebook-ads-campaign-name.util';

export interface ProductMatcher {
  id: number;
  itemCode: string;
  matchToken: string;
}

export type SpendBucket = {
  productId: number | null;
  productIds: number[] | null;
  productItemCode: string | null;
  campaignGroupKey: string | null;
  spend: number;
  matchedAdsCount: number;
  unmatchedAdsCount: number;
};

export interface SpendAggregateInsight {
  campaign_name?: string;
  spend?: string;
}

function uniqueMatchersInCampaignOrder(
  codeKeys: string[],
  matcherByItemCodeKey: Map<string, ProductMatcher>,
): ProductMatcher[] {
  const seen = new Set<number>();
  const matchers: ProductMatcher[] = [];
  for (const codeKey of codeKeys) {
    const matched = matcherByItemCodeKey.get(codeKey);
    if (!matched || seen.has(matched.id)) {
      continue;
    }
    seen.add(matched.id);
    matchers.push(matched);
  }
  return matchers;
}

function buildCampaignGroupKey(matchers: ProductMatcher[]): string {
  return matchers
    .map((matcher) => matcher.matchToken)
    .sort()
    .join(CAMPAIGN_NAME_PIPE_SEPARATOR);
}

export function aggregateSpendByProduct(
  insights: SpendAggregateInsight[],
  matcherByItemCodeKey: Map<string, ProductMatcher>,
): SpendBucket[] {
  const grouped = new Map<string, SpendBucket>();
  const unmatchedKey = '__unmatched__';

  for (const row of insights) {
    const spend = Number.parseFloat(row.spend || '0');
    if (!Number.isFinite(spend) || spend <= 0) {
      continue;
    }

    const codeKeys = extractItemCodeKeysFromCampaignName(row.campaign_name);
    const matchedMatchers = uniqueMatchersInCampaignOrder(
      codeKeys,
      matcherByItemCodeKey,
    );

    let bucketKey: string;
    let bucketSeed: SpendBucket;

    if (matchedMatchers.length === 0) {
      bucketKey = unmatchedKey;
      bucketSeed = {
        productId: null,
        productIds: null,
        productItemCode: null,
        campaignGroupKey: null,
        spend: 0,
        matchedAdsCount: 0,
        unmatchedAdsCount: 0,
      };
    } else if (matchedMatchers.length === 1) {
      const matched = matchedMatchers[0];
      bucketKey = String(matched.id);
      bucketSeed = {
        productId: matched.id,
        productIds: null,
        productItemCode: matched.itemCode,
        campaignGroupKey: null,
        spend: 0,
        matchedAdsCount: 0,
        unmatchedAdsCount: 0,
      };
    } else {
      const campaignGroupKey = buildCampaignGroupKey(matchedMatchers);
      bucketKey = `group:${campaignGroupKey}`;
      bucketSeed = {
        productId: null,
        productIds: matchedMatchers.map((matcher) => matcher.id),
        productItemCode: formatItemCodesForDisplay(
          matchedMatchers.map((matcher) => matcher.itemCode),
        ),
        campaignGroupKey,
        spend: 0,
        matchedAdsCount: 0,
        unmatchedAdsCount: 0,
      };
    }

    const bucket = grouped.get(bucketKey) || bucketSeed;

    bucket.spend += spend;
    if (matchedMatchers.length > 0) {
      bucket.matchedAdsCount += 1;
    } else {
      bucket.unmatchedAdsCount += 1;
    }
    grouped.set(bucketKey, bucket);
  }

  return Array.from(grouped.values());
}
