/** Legacy pipe format: "item_code | campaign label". */
export const CAMPAIGN_NAME_PIPE_SEPARATOR = '|';

/** UI separator when showing multiple item_codes in a campaign group column. */
export const CAMPAIGN_GROUP_DISPLAY_SEPARATOR = ', ';

/**
 * Separates product item_code from campaign date/metadata suffix
 * (e.g. "HVSH-SAC-AQ -06/05-C9 - 05" → item_code "HVSH-SAC-AQ").
 */
export const CAMPAIGN_NAME_SUFFIX_SEPARATOR = ' ';

/**
 * Derives lowercase product item_code keys from a Meta campaign name.
 * Takes the segment before the first space, then splits on `|` for multi-size
 * campaigns (e.g. "HVSH-BB-26|HVSH-BB-18|HVSH-BB-30 note" → three keys).
 */
export function extractItemCodeKeysFromCampaignName(
  campaignName: string | undefined,
): string[] {
  const raw = (campaignName ?? '').trim();
  if (!raw) {
    return [];
  }

  const suffixIdx = raw.indexOf(CAMPAIGN_NAME_SUFFIX_SEPARATOR);
  const codesSegment = suffixIdx >= 0 ? raw.slice(0, suffixIdx).trim() : raw;
  if (!codesSegment) {
    return [];
  }

  return codesSegment
    .split(CAMPAIGN_NAME_PIPE_SEPARATOR)
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part.length > 0);
}

/**
 * Derives a single lowercase product item_code key from a Meta campaign name.
 * Returns the first key from {@link extractItemCodeKeysFromCampaignName}.
 */
export function extractItemCodeKeyFromCampaignName(
  campaignName: string | undefined,
): string {
  return extractItemCodeKeysFromCampaignName(campaignName)[0] ?? '';
}

/** Joins item_codes for display in tables (e.g. "HVSH-BB-26, HVSH-BB-18"). */
export function formatItemCodesForDisplay(itemCodes: string[]): string {
  return itemCodes.join(CAMPAIGN_GROUP_DISPLAY_SEPARATOR);
}

/**
 * Normalizes a stored multi-item_code product_code for display.
 * Handles legacy rows that used `|` as the join character.
 */
export function formatGroupProductCodeForDisplay(productCode: string): string {
  if (!productCode.includes(CAMPAIGN_NAME_PIPE_SEPARATOR)) {
    return productCode;
  }
  return formatItemCodesForDisplay(
    productCode
      .split(CAMPAIGN_NAME_PIPE_SEPARATOR)
      .map((part) => part.trim())
      .filter((part) => part.length > 0),
  );
}
