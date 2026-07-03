/** Env `ENABLE_CRON`: when explicitly `false`, scheduled cron jobs are not registered. */
export function isCronEnabled(): boolean {
  const raw = process.env.ENABLE_CRON?.trim().toLowerCase();
  return raw !== 'false';
}
