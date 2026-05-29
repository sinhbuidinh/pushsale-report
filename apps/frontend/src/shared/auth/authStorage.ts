const PANEL_PREFIX = process.env.REACT_APP_PANEL_PREFIX || 'x-panel-5661';
const AUTH_TOKEN_KEY = process.env.REACT_APP_AUTH_TOKEN_KEY || 'analyze_data_agent_auth';
const AUTH_USER_KEY = process.env.REACT_APP_AUTH_USER_KEY || 'analyze_data_agent_user';

function readRawToken(): string | null {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

/** Non-empty stored value that is not the string "undefined" / "null" from bad setItem calls. */
function isPlausibleStoredString(value: string | null): value is string {
  if (value == null) return false;
  const t = value.trim();
  return t.length > 0 && t !== 'undefined' && t !== 'null';
}

/** JWT-shaped bearer token, or null if missing or corrupted. */
export function getValidAuthToken(): string | null {
  const t = readRawToken();
  if (!isPlausibleStoredString(t)) return null;
  if (t.split('.').length !== 3) return null;
  return t;
}

export function getStoredUser(): {
  id?: number;
  username?: string;
  display_name?: string;
  type?: string;
} | null {
  const raw = localStorage.getItem(AUTH_USER_KEY);
  if (!isPlausibleStoredString(raw)) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as {
      id?: number;
      username?: string;
      display_name?: string;
      type?: string;
    };
  } catch {
    return null;
  }
}

export function clearAuthStorage(): void {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
}

/** True only when we have a real JWT and stored user profile (avoids login ⟷ dashboard loops). */
export function hasValidSession(): boolean {
  return getValidAuthToken() != null && typeof getStoredUser()?.type === 'string';
}

/**
 * Default landing route inside the admin panel for a given user role.
 * Marketing users don't have the sync dashboard, so they land on their own
 * Marketing Summary page instead.
 */
export function getDefaultLandingPath(userType: string | null | undefined): string {
  const base = `/${PANEL_PREFIX}`;
  if (userType === 'marketing') return `${base}/marketing-summary`;
  return `${base}/dashboard`;
}

export { PANEL_PREFIX, AUTH_TOKEN_KEY, AUTH_USER_KEY };
