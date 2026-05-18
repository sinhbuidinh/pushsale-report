/** Legacy pipe format: "item_code | campaign label". */
export const CAMPAIGN_NAME_PIPE_SEPARATOR = '|';

/**
 * Separates product item_code from campaign date/metadata suffix
 * (e.g. "HVSH-SAC-AQ -06/05-C9 - 05" → item_code "HVSH-SAC-AQ").
 */
export const CAMPAIGN_NAME_SUFFIX_SEPARATOR = ' ';

/**
 * Derives a lowercase product item_code key from a Meta campaign name.
 * Tries pipe format first, then suffix separator; otherwise uses the full name.
 */
export function extractItemCodeKeyFromCampaignName(
  campaignName: string | undefined,
): string {
  const raw = (campaignName ?? '').trim();
  if (!raw) {
    return '';
  }

  const pipeIdx = raw.indexOf(CAMPAIGN_NAME_PIPE_SEPARATOR);
  if (pipeIdx >= 0) {
    return raw.slice(0, pipeIdx).trim().toLowerCase();
  }

  const suffixIdx = raw.indexOf(CAMPAIGN_NAME_SUFFIX_SEPARATOR);
  if (suffixIdx >= 0) {
    return raw.slice(0, suffixIdx).trim().toLowerCase();
  }

  return raw.toLowerCase();
}
