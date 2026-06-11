import {
  CAMPAIGN_NAME_PIPE_SEPARATOR,
  CAMPAIGN_NAME_SUFFIX_SEPARATOR,
  extractItemCodeKeyFromCampaignName,
  extractItemCodeKeysFromCampaignName,
  formatGroupProductCodeForDisplay,
  formatItemCodesForDisplay,
} from './facebook-ads-campaign-name.util';

describe('extractItemCodeKeysFromCampaignName', () => {
  it('extracts item_code before date/metadata suffix', () => {
    expect(
      extractItemCodeKeysFromCampaignName('HVSH-SAC-AQ -06/05-C9 - 05'),
    ).toEqual(['hvsh-sac-aq']);
  });

  it('extracts item_code before pipe separator (legacy format)', () => {
    expect(extractItemCodeKeysFromCampaignName('SKU123 | Summer promo')).toEqual(
      ['sku123'],
    );
  });

  it('extracts multiple item_codes from pipe-separated prefix', () => {
    expect(
      extractItemCodeKeysFromCampaignName(
        'HVSH-BB-26|HVSH-BB-18|HVSH-BB-30 note of campaign',
      ),
    ).toEqual(['hvsh-bb-26', 'hvsh-bb-18', 'hvsh-bb-30']);
  });

  it('extracts multiple item_codes when no campaign note suffix', () => {
    expect(
      extractItemCodeKeysFromCampaignName('HVSH-BB-26|HVSH-BB-18|HVSH-BB-30'),
    ).toEqual(['hvsh-bb-26', 'hvsh-bb-18', 'hvsh-bb-30']);
  });

  it('uses full trimmed name when no separator is present', () => {
    expect(extractItemCodeKeysFromCampaignName('HVSH-SAC-AQ')).toEqual([
      'hvsh-sac-aq',
    ]);
    expect(extractItemCodeKeysFromCampaignName('  HVSH-SAC-AQ  ')).toEqual([
      'hvsh-sac-aq',
    ]);
  });

  it('returns empty array for blank campaign names', () => {
    expect(extractItemCodeKeysFromCampaignName('')).toEqual([]);
    expect(extractItemCodeKeysFromCampaignName(undefined)).toEqual([]);
    expect(extractItemCodeKeysFromCampaignName('   ')).toEqual([]);
  });

  it('documents expected separator constants', () => {
    expect(CAMPAIGN_NAME_SUFFIX_SEPARATOR).toBe(' ');
    expect(CAMPAIGN_NAME_PIPE_SEPARATOR).toBe('|');
  });
});

describe('formatItemCodesForDisplay', () => {
  it('joins item_codes with comma and space', () => {
    expect(
      formatItemCodesForDisplay(['HVSH-GCT-X', 'HVSH-GCT-V', 'HVSH-GCT-D']),
    ).toBe('HVSH-GCT-X, HVSH-GCT-V, HVSH-GCT-D');
  });

  it('normalizes legacy pipe-separated product_code for display', () => {
    expect(
      formatGroupProductCodeForDisplay('HVSH-GCT-X|HVSH-GCT-V|HVSH-GCT-D'),
    ).toBe('HVSH-GCT-X, HVSH-GCT-V, HVSH-GCT-D');
  });
});

describe('extractItemCodeKeyFromCampaignName', () => {
  it('returns the first key from multi-code campaigns', () => {
    expect(
      extractItemCodeKeyFromCampaignName(
        'HVSH-BB-26|HVSH-BB-18|HVSH-BB-30 note',
      ),
    ).toBe('hvsh-bb-26');
  });

  it('returns empty string for blank campaign names', () => {
    expect(extractItemCodeKeyFromCampaignName('')).toBe('');
    expect(extractItemCodeKeyFromCampaignName(undefined)).toBe('');
  });
});
