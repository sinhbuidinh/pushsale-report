import {
  clearAuthStorage,
  getStoredUser,
  updateAccessToken,
} from './authStorage';

type RefreshResponse = {
  status: boolean;
  data?: {
    access_token: string;
    expires_in?: number;
    user?: {
      id?: number;
      username?: string;
      display_name?: string;
      type?: string;
    };
  };
  error?: string;
};

const apiBase = process.env.REACT_APP_API_URL || 'http://localhost:3001';

let refreshPromise: Promise<boolean> | null = null;

async function requestRefresh(): Promise<boolean> {
  const res = await fetch(`${apiBase}/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!res.ok) return false;

  const body = (await res.json()) as RefreshResponse;
  if (!body.status || !body.data?.access_token) {
    return false;
  }

  updateAccessToken(body.data.access_token);
  return getStoredUser() != null;
}

/** Refresh the access token using the HttpOnly refresh cookie. De-duplicates concurrent calls. */
export async function refreshAccessToken(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = requestRefresh()
    .catch(() => false)
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}

export async function logoutSession(): Promise<void> {
  try {
    await fetch(`${apiBase}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    // Best-effort server revocation; always clear local storage.
  }
  clearAuthStorage();
}
