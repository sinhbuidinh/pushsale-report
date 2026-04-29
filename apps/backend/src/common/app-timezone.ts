/**
 * Application wall-clock / scheduler IANA timezone (e.g. Asia/Ho_Chi_Minh for UTC+7).
 * Set APP_TIMEZONE in .env; defaults to Vietnam.
 */
export function getAppTimeZone(): string {
  const raw = process.env.APP_TIMEZONE?.trim();
  if (raw) {
    return raw;
  }
  return 'Asia/Ho_Chi_Minh';
}

/** YYYY-MM-DD for an instant in the given IANA zone. */
export function calendarDateInZone(
  date: Date,
  timeZone: string = getAppTimeZone(),
): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * First and last calendar day (YYYY-MM-DD) of the month containing `date` in `timeZone`.
 * Month length uses the Gregorian calendar (same in all zones).
 */
export function calendarMonthBoundsForDate(
  date: Date = new Date(),
  timeZone: string = getAppTimeZone(),
): { startStr: string; endStr: string; todayStr: string } {
  const todayStr = calendarDateInZone(date, timeZone);
  const [ys, ms] = todayStr.split('-');
  const y = parseInt(ys, 10);
  const mo = parseInt(ms, 10);
  const lastDay = new Date(y, mo, 0).getDate();
  const startStr = `${ys}-${ms}-01`;
  const endStr = `${ys}-${String(mo).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { startStr, endStr, todayStr };
}

/** Previous calendar day in the given zone (for default sync target). */
export function yesterdayCalendarInZone(
  timeZone: string = getAppTimeZone(),
): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const today = formatter.format(new Date());
  const [y, m, d] = today.split('-').map((x) => Number(x));
  const noonUtc = Date.UTC(y, m - 1, d, 12, 0, 0);
  return formatter.format(new Date(noonUtc - 24 * 60 * 60 * 1000));
}

/** Wall time + zone label for log lines (not UTC Zulu). */
export function formatLogTimestamp(
  date: Date = new Date(),
  timeZone: string = getAppTimeZone(),
): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
    hourCycle: 'h23',
  }).formatToParts(date);
  const pick = (t: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === t)?.value?.padStart(2, '0') ?? '00';
  const year = parts.find((p) => p.type === 'year')?.value ?? '1970';
  const month = pick('month');
  const day = pick('day');
  const hour = pick('hour');
  const minute = pick('minute');
  const second = pick('second');
  const frac = parts.find((p) => p.type === 'fractionalSecond')?.value ?? '000';
  return `${year}-${month}-${day}T${hour}:${minute}:${second}.${frac} [${timeZone}]`;
}
