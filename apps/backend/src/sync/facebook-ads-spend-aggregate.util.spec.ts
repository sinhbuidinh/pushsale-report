import { aggregateSpendByProduct } from './facebook-ads-spend-aggregate.util';

describe('aggregateSpendByProduct', () => {
  const matcherMap = new Map([
    [
      'hvsh-bb-26',
      { id: 26, itemCode: 'HVSH-BB-26', matchToken: 'hvsh-bb-26' },
    ],
    [
      'hvsh-bb-18',
      { id: 18, itemCode: 'HVSH-BB-18', matchToken: 'hvsh-bb-18' },
    ],
    [
      'hvsh-bb-30',
      { id: 30, itemCode: 'HVSH-BB-30', matchToken: 'hvsh-bb-30' },
    ],
    ['hvsh-sac-aq', { id: 1, itemCode: 'HVSH-SAC-AQ', matchToken: 'hvsh-sac-aq' }],
  ]);

  it('maps single-code campaigns to one product bucket with full spend', () => {
    const buckets = aggregateSpendByProduct(
      [{ campaign_name: 'HVSH-SAC-AQ -06/05', spend: '100' }],
      matcherMap,
    );

    expect(buckets).toHaveLength(1);
    expect(buckets[0]).toMatchObject({
      productId: 1,
      productIds: null,
      productItemCode: 'HVSH-SAC-AQ',
      campaignGroupKey: null,
      spend: 100,
      matchedAdsCount: 1,
      unmatchedAdsCount: 0,
    });
  });

  it('maps multi-code campaigns to one group bucket with full spend', () => {
    const buckets = aggregateSpendByProduct(
      [
        {
          campaign_name: 'HVSH-BB-26|HVSH-BB-18|HVSH-BB-30 note of campaign',
          spend: '250',
        },
      ],
      matcherMap,
    );

    expect(buckets).toHaveLength(1);
    expect(buckets[0]).toMatchObject({
      productId: null,
      productIds: [26, 18, 30],
      productItemCode: 'HVSH-BB-26, HVSH-BB-18, HVSH-BB-30',
      campaignGroupKey: 'hvsh-bb-18|hvsh-bb-26|hvsh-bb-30',
      spend: 250,
      matchedAdsCount: 1,
      unmatchedAdsCount: 0,
    });
  });

  it('groups only known codes when some item_codes are unknown', () => {
    const buckets = aggregateSpendByProduct(
      [{ campaign_name: 'HVSH-BB-26|UNKNOWN-CODE note', spend: '80' }],
      matcherMap,
    );

    expect(buckets).toHaveLength(1);
    expect(buckets[0]).toMatchObject({
      productId: 26,
      productIds: null,
      spend: 80,
      matchedAdsCount: 1,
    });
  });

  it('sends fully unmatched campaigns to the unmatched bucket', () => {
    const buckets = aggregateSpendByProduct(
      [{ campaign_name: 'UNKNOWN-A|UNKNOWN-B note', spend: '50' }],
      matcherMap,
    );

    expect(buckets).toHaveLength(1);
    expect(buckets[0]).toMatchObject({
      productId: null,
      productIds: null,
      spend: 50,
      matchedAdsCount: 0,
      unmatchedAdsCount: 1,
    });
  });
});
