import apiClient from './shared/api/apiClient';
import {
  AUTH_TOKEN_KEY,
  clearAuthStorage,
  getValidAuthToken,
  PANEL_PREFIX,
} from './shared/auth/authStorage';

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
    if (error.response?.status === 401) {
      redirectToLogin(true);
    }
    return Promise.reject(error);
  },
);

window.setInterval(() => {
  const token = getValidAuthToken();
  if (!token) return;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const expiry = payload.exp * 1000;
    if (Date.now() >= expiry) {
      redirectToLogin(true);
    }
  } catch {
    redirectToLogin(false);
  }
}, 30_000);
