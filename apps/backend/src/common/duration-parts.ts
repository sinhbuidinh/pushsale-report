export type DurationParts = {
  ms: number;
  sec: string;
};

/** When you already have an elapsed duration in milliseconds (e.g. HTTP client timing). */
export function durationPartsFromMs(elapsedMs: number): DurationParts {
  const ms = Math.max(0, elapsedMs);
  return { ms, sec: (ms / 1000).toFixed(2) };
}

/** Wall-clock duration from `startMs` to `endMs` (default: now). */
export function durationPartsSince(
  startMs: number,
  endMs: number = Date.now(),
): DurationParts {
  return durationPartsFromMs(endMs - startMs);
}
