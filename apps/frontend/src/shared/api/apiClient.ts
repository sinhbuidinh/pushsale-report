import axios, { type InternalAxiosRequestConfig } from 'axios';
import { getValidAuthToken } from '../auth/authStorage';
import { refreshAccessToken } from '../auth/authRefresh';

const apiClient = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:3001',
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

type RetriableConfig = InternalAxiosRequestConfig & { _retry?: boolean };

function isAuthEndpoint(url: string | undefined): boolean {
  if (!url) return false;
  return /\/auth\/(login|refresh|logout)(?:\?|$)/.test(url);
}

apiClient.interceptors.request.use((config) => {
  const token = getValidAuthToken();

  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error.response?.status;
    const config = error.config as RetriableConfig | undefined;
    if (status !== 401 || !config || config._retry || isAuthEndpoint(config.url)) {
      return Promise.reject(error);
    }

    config._retry = true;
    const refreshed = await refreshAccessToken();
    if (!refreshed) {
      return Promise.reject(error);
    }

    const token = getValidAuthToken();
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return apiClient(config);
  },
);

export default apiClient;
