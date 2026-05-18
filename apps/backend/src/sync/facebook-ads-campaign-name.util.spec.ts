import {
  CAMPAIGN_NAME_PIPE_SEPARATOR,
  CAMPAIGN_NAME_SUFFIX_SEPARATOR,
  extractItemCodeKeyFromCampaignName,
} from './facebook-ads-campaign-name.util';

describe('extractItemCodeKeyFromCampaignName', () => {
  it('extracts item_code before date/metadata suffix', () => {
    expect(
      extractItemCodeKeyFromCampaignName('HVSH-SAC-AQ -06/05-C9 - 05'),
    ).toBe('hvsh-sac-aq');
  });

  it('extracts item_code before pipe separator (legacy format)', () => {
    expect(extractItemCodeKeyFromCampaignName('SKU123 | Summer promo')).toBe(
      'sku123',
    );
  });

  it('uses full trimmed name when no separator is present', () => {
    expect(extractItemCodeKeyFromCampaignName('HVSH-SAC-AQ')).toBe(
      'hvsh-sac-aq',
    );
    expect(extractItemCodeKeyFromCampaignName('  HVSH-SAC-AQ  ')).toBe(
      'hvsh-sac-aq',
    );
  });

  it('returns empty string for blank campaign names', () => {
    expect(extractItemCodeKeyFromCampaignName('')).toBe('');
    expect(extractItemCodeKeyFromCampaignName(undefined)).toBe('');
    expect(extractItemCodeKeyFromCampaignName('   ')).toBe('');
  });

  it('documents expected separator constants', () => {
    expect(CAMPAIGN_NAME_SUFFIX_SEPARATOR).toBe(' -');
    expect(CAMPAIGN_NAME_PIPE_SEPARATOR).toBe('|');
  });
});
