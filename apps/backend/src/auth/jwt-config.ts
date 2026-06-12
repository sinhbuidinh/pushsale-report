import type { StringValue } from 'ms';
// `ms` is a transitive dependency of `@nestjs/jwt` / `jsonwebtoken`.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ms = require('ms') as (value: string) => number | undefined;

function readDurationEnv(name: string, fallback: StringValue): StringValue {
  const raw = process.env[name]?.trim();
  const value = (raw || fallback) as StringValue;
  const parsed = ms(value);
  if (typeof parsed !== 'number' || !Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(
      `${name} must be a positive duration (e.g. 15m, 7d). Got: ${value}`,
    );
  }
  return value;
}

export function getJwtAccessExpiresIn(): StringValue {
  return readDurationEnv('JWT_ACCESS_EXPIRES_IN', '15m');
}

export function getJwtRefreshExpiresIn(): StringValue {
  return readDurationEnv('JWT_REFRESH_EXPIRES_IN', '7d');
}

export function durationToMs(value: string): number {
  const parsed = ms(value);
  if (typeof parsed !== 'number' || !Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid duration: ${value}`);
  }
  return parsed;
}

export function durationToSeconds(value: string): number {
  return Math.floor(durationToMs(value) / 1000);
}
