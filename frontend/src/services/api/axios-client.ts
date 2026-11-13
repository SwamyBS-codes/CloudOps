import axios, { AxiosInstance, AxiosError } from 'axios';
import { API_BASE_URL, API_TIMEOUT, AUTH_TOKEN_KEY } from '@/lib/constants';

const createAxiosClient = (): AxiosInstance => {
  const client = axios.create({
    baseURL: API_BASE_URL,
    timeout: API_TIMEOUT,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  // Request interceptor
  client.interceptors.request.use(
    (config) => {
      const token = localStorage.getItem(AUTH_TOKEN_KEY);
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    },
    (error) => Promise.reject(error)
  );

  // Response interceptor
  client.interceptors.response.use(
    (response) => response,
    (error: AxiosError) => {
      if (error.response?.status === 401) {
        // Handle unauthorized - clear stale token and redirect to login,
        // respecting the router basename so sub-path deploys still work.
        const hadToken = localStorage.getItem(AUTH_TOKEN_KEY) !== null;
        if (hadToken) {
          localStorage.removeItem(AUTH_TOKEN_KEY);
          const base = import.meta.env.BASE_URL && import.meta.env.BASE_URL !== './'
            ? import.meta.env.BASE_URL.replace(/\/?$/, '/')
            : '/';
          const loginPath = `${base}login`.replace(/\/{2,}/g, '/');
          const currentPath = window.location.pathname;
          if (currentPath !== loginPath) {
            window.location.href = loginPath;
          }
        }
      }
      return Promise.reject(error);
    }
  );

  return client;
};

export const axiosClient = createAxiosClient();
