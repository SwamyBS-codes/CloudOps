import { Routes as RouterRoutes, Route, Navigate } from 'react-router-dom';
import ProtectedRoutes from './protected-routes';
import { lazy, Suspense } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import {
  DashboardStatsLoadingState,
  AnalyticsChartSkeleton,
  NavbarLoadingState,
  DeploymentLogsSkeleton,
} from '@/components/skeletons';
import DeployProject from '../../pages/DeployProject';

// Lazy load pages
const HomePage = lazy(() => import('@/pages/Home'));
const LoginPage = lazy(() => import('@/pages/Login'));
const DashboardPage = lazy(() => import('@/pages/Dashboard'));
const AnalyticsPage = lazy(() => import('@/pages/Analytics'));
const BillingPage = lazy(() => import('@/pages/Billing'));
const SettingsPage = lazy(() => import('@/pages/Settings'));
const DeploymentsPage = lazy(() => import('@/pages/Deployments'));
const DeploymentDetailPage = lazy(() => import('@/pages/DeploymentDetail'));
const LiveProjectsPage = lazy(() => import('@/pages/LiveProjects'));
const EnvironmentVariablesPage = lazy(() => import('@/pages/EnvironmentVariables'));
const DocsPage = lazy(() => import('@/pages/Docs'));
const DeploymentPipelineShowcase = lazy(() => import('@/pages/DeploymentPipelineShowcase'));

const PageLoader = () => (
  <div className="page-shell page-shell--wide">
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-4">
        <NavbarLoadingState />
        <DashboardStatsLoadingState />
        <AnalyticsChartSkeleton />
      </div>
      <div className="space-y-4">
        <DeploymentLogsSkeleton />
      </div>
    </div>
  </div>
);

function Routes() {
  return (
    <Suspense fallback={<PageLoader />}>
      <RouterRoutes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/demo/deployment-pipeline" element={<DeploymentPipelineShowcase />} />

        <Route element={<ProtectedRoutes />}>
          <Route element={<DashboardLayout />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route path="/billing" element={<BillingPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/deployments" element={<DeploymentsPage />} />
            <Route path="/deployments/:id" element={<DeploymentDetailPage />} />
            <Route path="/live-projects" element={<LiveProjectsPage />} />
            <Route path="/environment-variables" element={<EnvironmentVariablesPage />} />
          </Route>
          <Route path="/deploy/:owner/:repo" element={<DeployProject />} />
        </Route>

        <Route path="/docs" element={<DocsPage />} />

        <Route path="*" element={<Navigate replace to="/" />} />
      </RouterRoutes>
    </Suspense>
  );
}

export default Routes;
