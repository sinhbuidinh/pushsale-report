import apiClient from './shared/api/apiClient';
import {
  AUTH_TOKEN_KEY,
  clearAuthStorage,
  getValidAuthToken,
  PANEL_PREFIX,
} from './shared/auth/authStorage';
import { refreshAccessToken } from './shared/auth/authRefresh';

function redirectToLogin(withExpired: boolean): void {
  clearAuthStorage();
  const suffix = withExpired ? '?expired=1' : '';
  const nextPath = `/${PANEL_PREFIX}${suffix}`;
  const current = `${window.location.pathname}${window.location.search}`;
  if (current === nextPath || (window.location.pathname === `/${PANEL_PREFIX}` && !withExpired)) {
    return;
  }
  window.location.replace(nextPath);
}

(() => {
  const valid = getValidAuthToken();
  if (!valid && localStorage.getItem(AUTH_TOKEN_KEY)) {
    clearAuthStorage();
  }
})();

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && error.config?._retry) {
      redirectToLogin(true);
    }
    return Promise.reject(error);
  },
);

const REFRESH_BEFORE_EXPIRY_MS = 60_000;

async function maintainSession(): Promise<void> {
  const token = getValidAuthToken();
  if (!token) return;

  try {
    const payload = JSON.parse(atob(token.split('.')[1])) as { exp?: number };
    const expiry = (payload.exp ?? 0) * 1000;
    if (!expiry) {
      redirectToLogin(false);
      return;
    }

    const msUntilExpiry = expiry - Date.now();
    if (msUntilExpiry <= 0) {
      const refreshed = await refreshAccessToken();
      if (!refreshed) redirectToLogin(true);
      return;
    }

    if (msUntilExpiry <= REFRESH_BEFORE_EXPIRY_MS) {
      const refreshed = await refreshAccessToken();
      if (!refreshed) redirectToLogin(true);
    }
  } catch {
    redirectToLogin(false);
  }
}

void maintainSession();
window.setInterval(() => {
  void maintainSession();
}, 30_000);
