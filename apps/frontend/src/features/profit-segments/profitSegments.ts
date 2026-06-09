/**
 * Shared types + helpers for the four-band profit evaluation.
 *
 * The four bands and their visual treatment are described by the user spec:
 *   - 🔴 Danger    – likely a net loss after operating costs
 *   - 🟡 Warning   – break-even / fragile margin
 *   - 🔵 Good      – healthy margin
 *   - 🟢 Excellent – scale up aggressively
 *
 * All segments share the same band semantics but pick different cut-offs.
 */

export interface PoasSettings {
  id: number;
  /** Exclusive upper bound of the Danger band (ratio). */
  danger_max: number;
  /** Exclusive upper bound of the Warning band (ratio). */
  warning_max: number;
  /** Exclusive upper bound of the Good band; above → Excellent (ratio). */
  good_max: number;
}

export interface ProfitSegment {
  id: number;
  code: string;
  name: string;
  /** Inclusive lower bound (VND) of the selling-price window for this segment. */
  min_price_vnd: number;
  /** Exclusive upper bound (VND), or null for open-ended. */
  max_price_vnd: number | null;
  /** Exclusive upper bound (%) of the Danger band. */
  danger_max_pct: number;
  /** Exclusive upper bound (%) of the Warning band. */
  warning_max_pct: number;
  /** Exclusive upper bound (%) of the Good band; above → Excellent. */
  good_max_pct: number;
  sort_order: number;
}

export type ProfitBand = 'danger' | 'warning' | 'good' | 'excellent';

export interface ProfitBandTheme {
  label: string;
  emoji: string;
  /** Background tint, intentionally soft so cells remain readable. */
  bg: string;
  /** Foreground colour used for the value text. */
  fg: string;
  /** Solid colour used for swatches / chips. */
  swatch: string;
}

export const BAND_THEME: Record<ProfitBand, ProfitBandTheme> = {
  danger: {
    label: 'Đỏ (Nguy hiểm)',
    emoji: '🔴',
    bg: 'rgba(244, 67, 54, 0.14)',
    fg: '#b71c1c',
    swatch: '#e53935',
  },
  warning: {
    label: 'Cam (Hoà vốn / Cảnh báo)',
    emoji: '🟡',
    bg: 'rgba(255, 152, 0, 0.18)',
    fg: '#9a6300',
    swatch: '#fb8c00',
  },
  good: {
    label: 'Xanh dương (Tốt)',
    emoji: '🔵',
    bg: 'rgba(33, 150, 243, 0.16)',
    fg: '#0d47a1',
    swatch: '#1e88e5',
  },
  excellent: {
    label: 'Xanh lá (Xuất sắc)',
    emoji: '🟢',
    bg: 'rgba(76, 175, 80, 0.18)',
    fg: '#1b5e20',
    swatch: '#43a047',
  },
};

/**
 * Picks the segment whose price window contains `sellingPriceVnd`.
 * Falls back to the first segment whose `min_price_vnd <= price` and the very
 * first segment when nothing else matches (so colouring always degrades to
 * "some" feedback rather than silently dropping the cell colour).
 */
export function findSegmentForPrice(
  segments: ProfitSegment[],
  sellingPriceVnd: number,
): ProfitSegment | null {
  if (segments.length === 0) return null;
  const sorted = [...segments].sort(
    (a, b) => a.min_price_vnd - b.min_price_vnd,
  );
  for (const s of sorted) {
    const min = s.min_price_vnd;
    const max = s.max_price_vnd;
    if (sellingPriceVnd >= min && (max == null || sellingPriceVnd < max)) {
      return s;
    }
  }
  // Price above the highest defined segment → reuse the last segment's rules.
  if (sellingPriceVnd >= sorted[sorted.length - 1].min_price_vnd) {
    return sorted[sorted.length - 1];
  }
  return null;
}

/**
 * Classifies a POAS ratio against global settings.
 * Returns null when `ratio` is null/non-finite so callers can render an em-dash.
 */
export function classifyPoasRatio(
  settings: PoasSettings,
  ratio: number | null,
): ProfitBand | null {
  if (ratio == null || !Number.isFinite(ratio)) return null;
  if (ratio < settings.danger_max) return 'danger';
  if (ratio < settings.warning_max) return 'warning';
  if (ratio < settings.good_max) return 'good';
  return 'excellent';
}

/**
 * Classifies a ROS (%) value against a segment.
 * Returns null when `pct` is null/non-finite so callers can render an em-dash.
 */
export function classifyProfitPct(
  segment: ProfitSegment,
  pct: number | null,
): ProfitBand | null {
  if (pct == null || !Number.isFinite(pct)) return null;
  if (pct < segment.danger_max_pct) return 'danger';
  if (pct < segment.warning_max_pct) return 'warning';
  if (pct < segment.good_max_pct) return 'good';
  return 'excellent';
}

/** Convenience helper: segment-first lookup → band. */
export function evaluateProfit(
  segments: ProfitSegment[],
  sellingPriceVnd: number,
  profitPct: number | null,
): { segment: ProfitSegment | null; band: ProfitBand | null } {
  const segment = findSegmentForPrice(segments, sellingPriceVnd);
  const band = segment ? classifyProfitPct(segment, profitPct) : null;
  return { segment, band };
}

export const formatVnd = (n: number | null): string => {
  if (n == null || !Number.isFinite(n)) return '∞';
  return n.toLocaleString('vi-VN', { maximumFractionDigits: 0 });
};

export const formatPct = (n: number): string =>
  `${Number(n).toLocaleString('vi-VN', { maximumFractionDigits: 2 })}%`;

export const formatRatio = (n: number): string =>
  Number(n).toLocaleString('vi-VN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
