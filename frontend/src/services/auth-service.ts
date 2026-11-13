import { apiClient } from './api/interceptors';
import { ENDPOINTS, generateEndpoint } from './api/endpoints';

/**
 * Auth Service
 * Handles authentication-related API calls
 */
export const authService = {
  login: (email: string, password: string) =>
    apiClient.post(ENDPOINTS.AUTH.LOGIN, { email, password }),

  githubLogin: (code: string, state: string) =>
    apiClient.post(ENDPOINTS.AUTH.GITHUB_CALLBACK, { code, state }),

  logout: () =>
    apiClient.post(ENDPOINTS.AUTH.LOGOUT),

  refresh: (refreshToken: string) =>
    apiClient.post(ENDPOINTS.AUTH.REFRESH, { refreshToken }),

  verify: () =>
    apiClient.get(ENDPOINTS.AUTH.VERIFY),

  getMe: () =>
    apiClient.get(ENDPOINTS.USERS.ME),
};

/**
 * Deployment Service
 * Handles deployment-related API calls
 */
export const deploymentService = {
  getAll: (params?: Record<string, any>) =>
    apiClient.get(ENDPOINTS.DEPLOYMENTS.LIST, { params }),

  getById: (id: string) =>
    apiClient.get(generateEndpoint(ENDPOINTS.DEPLOYMENTS.GET, { id })),

  create: (data: any) =>
    apiClient.post(ENDPOINTS.DEPLOYMENTS.CREATE, data),

  update: (id: string, data: any) =>
    apiClient.put(generateEndpoint(ENDPOINTS.DEPLOYMENTS.UPDATE, { id }), data),

  delete: (id: string) =>
    apiClient.delete(generateEndpoint(ENDPOINTS.DEPLOYMENTS.DELETE, { id })),

  getLogs: (id: string, params?: Record<string, any>) =>
    apiClient.get(generateEndpoint(ENDPOINTS.DEPLOYMENTS.LOGS, { id }), { params }),

  getStatus: (id: string) =>
    apiClient.get(generateEndpoint(ENDPOINTS.DEPLOYMENTS.STATUS, { id })),

  cancel: (id: string) =>
    apiClient.post(generateEndpoint(ENDPOINTS.DEPLOYMENTS.CANCEL, { id })),

  stop: (id: string) =>
    apiClient.post(`/api/deployments/${encodeURIComponent(id)}/stop`),

  start: (id: string) =>
    apiClient.post(`/api/deployments/${encodeURIComponent(id)}/start`),

  restart: (id: string) =>
    apiClient.post(`/api/deployments/${encodeURIComponent(id)}/restart`),

  terminateAzureDeployment: (id: string) =>
    apiClient.delete(generateEndpoint(ENDPOINTS.DEPLOYMENTS.DELETE, { id })),

  rollback: (id: string) =>
    apiClient.post(generateEndpoint(ENDPOINTS.DEPLOYMENTS.ROLLBACK, { id })),
  // Terminate an AWS deployment (deletes EC2 instance and optionally ECR/S3)
  terminateAwsDeployment: (instanceId: string, data?: Record<string, any>) => {
    const payload = { data: { ...data, cleanupECR: data?.cleanupECR !== false } };
    return apiClient.delete(`/api/aws/deployments/${instanceId}`, payload);
  },
};

/**
 * Cost Service
 * Handles cost prediction and tracking API calls
 */
export const costService = {
  predictCost: (repositoryUrl: string, appType: string) =>
    apiClient.post(ENDPOINTS.COST.PREDICT, { repositoryUrl, appType }),

  getHistory: (params?: Record<string, any>) =>
    apiClient.get(ENDPOINTS.COST.HISTORY, { params }),

  getBreakdown: (deploymentId: string) =>
    apiClient.get(generateEndpoint(ENDPOINTS.COST.BREAKDOWN, { id: deploymentId })),

  estimateCost: (config: any) =>
    apiClient.post(ENDPOINTS.COST.ESTIMATE, config),
};

/**
 * Analytics Service
 * Handles analytics and reporting API calls
 */
export const analyticsService = {
  getDashboard: (params?: Record<string, any>) =>
    apiClient.get(ENDPOINTS.ANALYTICS.DASHBOARD, { params }),

  getDeploymentAnalytics: (params?: Record<string, any>) =>
    apiClient.get(ENDPOINTS.ANALYTICS.DEPLOYMENTS, { params }),

  getCostAnalytics: (params?: Record<string, any>) =>
    apiClient.get(ENDPOINTS.ANALYTICS.COSTS, { params }),

  getPerformanceMetrics: (params?: Record<string, any>) =>
    apiClient.get(ENDPOINTS.ANALYTICS.PERFORMANCE, { params }),
};

/**
 * Billing Service
 * Handles billing and subscription API calls
 */
export const billingService = {
  getUsage: () =>
    apiClient.get(ENDPOINTS.BILLING.USAGE),

  getInvoices: (params?: Record<string, any>) =>
    apiClient.get(ENDPOINTS.BILLING.INVOICES, { params }),

  getInvoiceDetail: (invoiceId: string) =>
    apiClient.get(generateEndpoint(ENDPOINTS.BILLING.INVOICES_DETAIL, { id: invoiceId })),

  getPlans: () =>
    apiClient.get(ENDPOINTS.BILLING.PLANS),

  updatePlan: (planId: string) =>
    apiClient.post(ENDPOINTS.BILLING.UPDATE_PLAN, { planId }),
};
