const FALLBACK_MS = 60000;

function parsePositiveMs(raw: string | undefined): number {
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return FALLBACK_MS;
  }
  const n = Number.parseInt(String(raw).trim(), 10);
  if (!Number.isFinite(n) || n < 0) {
    return FALLBACK_MS;
  }
  return n;
}

/** Env `PUSHSALE_REQUEST_INTERVAL_MS` (default 60000): PushSale page pacing + default HTTP retry wait. */
export const PUSHSALE_REQUEST_INTERVAL_MS = parsePositiveMs(
  process.env.PUSHSALE_REQUEST_INTERVAL_MS,
);
