/**
 * CloudOps Constants
 * Centralized constant values for the application
 */

export const APP_NAME = 'CloudOps';
export const APP_VERSION = '1.0.0';
export const APP_DESCRIPTION = 'Automated deployment platform with predictive cost engine';

// API Configuration
const rawApiBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const normalizeApiBaseUrl = (url: string) => url.replace(/\/api\/?$/, '');
export const API_BASE_URL = normalizeApiBaseUrl(rawApiBaseUrl);
export const API_TIMEOUT = 30000;

// Socket Configuration
export const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';
export const SOCKET_TIMEOUT = 5000;

// Authentication
export const GITHUB_CLIENT_ID = import.meta.env.VITE_GITHUB_CLIENT_ID || '';
export const AUTH_TOKEN_KEY = 'cloudops_auth_token';
export const AUTH_REFRESH_TOKEN_KEY = 'cloudops_refresh_token';
export const USER_KEY = 'cloudops_user';

// Local storage keys
export const DEPLOYED_PROJECTS_STORAGE_KEY = 'cloudops_deployed_projects';
export const CONNECTED_REPOSITORIES_STORAGE_KEY = 'cloudops_connected_repositories';

// Routes
export const ROUTES = {
  HOME: '/',
  LOGIN: '/login',
  DASHBOARD: '/dashboard',
  DEPLOYMENTS: '/deployments',
  ANALYTICS: '/analytics',
  BILLING: '/billing',
  SETTINGS: '/settings',
};

// Deployment Status
export const DEPLOYMENT_STATUS = {
  PENDING: 'pending',
  QUEUED: 'queued',
  BUILDING: 'building',
  DEPLOYING: 'deploying',
  LIVE: 'live',
  FAILED: 'failed',
  ROLLED_BACK: 'rolled_back',
} as const;

// Pagination
export const DEFAULT_PAGE_SIZE = 20;
export const PAGE_SIZES = [10, 20, 50, 100];

// Debounce/Throttle
export const DEBOUNCE_DELAY = 300;
export const THROTTLE_DELAY = 500;

// Time Intervals
export const POLLING_INTERVAL = 5000; // 5 seconds
export const REFRESH_INTERVAL = 60000; // 1 minute

// Colors
export const COLORS = {
  PRIMARY: '#2458D3',
  ACCENT: '#218B60',
  SUCCESS: '#218B60',
  ERROR: '#D33B3B',
  WARNING: '#B97812',
  INFO: '#2458D3',
};

// Features
export const FEATURES = {
  GITHUB_OAUTH: true,
  COST_PREDICTION: true,
  DOCKER_BUILD: true,
  AWS_DEPLOYMENT: true,
  REAL_TIME_LOGS: true,
  ANALYTICS: true,
} as const;
