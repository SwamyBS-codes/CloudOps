import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CheckCircle2, Clock3, Loader2, ShieldAlert, TrendingUp, Cloud } from 'lucide-react';
import { analyticsService } from '@/services/auth-service';
import { PageHeader, MetricCard, Alert, ChartContainer, Card } from '@/components/ui';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

type DashboardAnalytics = {
  summary?: {
    totalDeployments?: number;
    successfulDeployments?: number;
    activeDeployments?: number;
    successRate?: number;
    avgDeployTimeMs?: number;
    totalDeployTimeMs?: number;
    awsDeployments?: number;
    azureDeployments?: number;
  };
  statusBreakdown?: Array<{ status: string; count: number }>;
  frameworkBreakdown?: Array<{ framework: string; count: number }>;
  deploymentTrend?: Array<{ date: string; count: number; success: number; failed: number }>;
};

type PerformanceAnalytics = {
  sampleSize?: number;
  failureRate?: number;
  avgDeployTimeMs?: number;
  p50DeployTimeMs?: number;
  p95DeployTimeMs?: number;
  slowestDeployments?: Array<{
    deploymentId: string;
    repositoryName: string;
    totalTimeMs: number;
    status: string;
    createdAt: string;
  }>;
};

type DeploymentsAnalytics = {
  topRepositories?: Array<{
    repositoryName: string;
    count: number;
    successRate: number;
  }>;
};

const STATUS_COLORS: Record<string, string> = {
  success: 'hsl(var(--success))',
  failed: 'hsl(var(--destructive))',
  running: 'hsl(var(--chart-1))',
  deploying: 'hsl(var(--chart-2))',
  queued: 'hsl(var(--warning))',
  default: 'hsl(var(--chart-3))',
};

const formatDuration = (ms = 0) => {
  if (!ms || Number.isNaN(ms)) return '0s';
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.round(seconds % 60);
  return `${minutes}m ${remaining}s`;
};

const formatUsd = (value = 0) => `$${value.toFixed(4)}`;

const chartTooltipStyle = {
  background: 'hsl(var(--popover))',
  border: '1px solid hsl(var(--border))',
  borderRadius: 0,
  color: 'hsl(var(--popover-foreground))',
};

export default function AnalyticsPage(){
  const [days, setDays] = useState(30);
  const isDark = true;
  const tooltipStyle = chartTooltipStyle;
  const queryParams = useMemo(() => ({ days }), [days]);

  const dashboardQuery = useQuery({
    queryKey: ['analytics-dashboard-live', queryParams],
    queryFn: async () => {
      const response = await analyticsService.getDashboard(queryParams);
      const payload = response.data as any;
      return (payload?.data || payload || {}) as DashboardAnalytics;
    },
  });

  const deploymentsQuery = useQuery({
    queryKey: ['analytics-deployments-live', queryParams],
    queryFn: async () => {
      const response = await analyticsService.getDeploymentAnalytics(queryParams);
      const payload = response.data as any;
      return (payload?.data || payload || {}) as DeploymentsAnalytics;
    },
  });



  const performanceQuery = useQuery({
    queryKey: ['analytics-performance-live', queryParams],
    queryFn: async () => {
      const response = await analyticsService.getPerformanceMetrics(queryParams);
      const payload = response.data as any;
      return (payload?.data || payload || {}) as PerformanceAnalytics;
    },
  });

  const loading = dashboardQuery.isLoading || deploymentsQuery.isLoading || performanceQuery.isLoading;
  const loadError = dashboardQuery.error || deploymentsQuery.error || performanceQuery.error;

  const dashboard = dashboardQuery.data || {};
  const performance = performanceQuery.data || {};
  const deployments = deploymentsQuery.data || {};

  const statCards = [
    { label: 'Total deployments', value: String(dashboard.summary?.totalDeployments || 0), icon: TrendingUp },
    { label: 'Success rate', value: `${Number(dashboard.summary?.successRate || 0).toFixed(1)}%`, icon: CheckCircle2 },
    { label: 'Avg deploy time', value: formatDuration(performance.avgDeployTimeMs || dashboard.summary?.avgDeployTimeMs || 0), icon: Clock3 },
    { label: 'Failure rate', value: `${Number(performance.failureRate || 0).toFixed(1)}%`, icon: ShieldAlert },
    { label: 'AWS deploys', value: String(dashboard.summary?.awsDeployments || 0), icon: TrendingUp },
    { label: 'Azure deploys', value: String(dashboard.summary?.azureDeployments || 0), icon: Cloud },
  ];

  return (
    <>
      <PageHeader
        title="Analytics"
        description="Real deployment analytics powered by your deployment history."
        actions={
          <Tabs value={String(days)} onValueChange={(v) => setDays(Number(v))}>
            <TabsList>
              {[7, 30, 90].map((value) => (
                <TabsTrigger key={value} value={String(value)}>
                  {value}d
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        }
      />

      {loadError && (
        <Alert variant="destructive" title="Failed to load analytics" className="mb-6">
          {(loadError as any)?.message || 'Failed to load analytics data.'}
        </Alert>
      )}

      {loading ? (
        <Card className="flex items-center gap-3 p-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading analytics...
        </Card>
      ) : (
        <>
          <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {statCards.map((card, i) => (
              <MetricCard key={card.label} label={card.label} value={card.value} icon={card.icon} delay={i * 0.05} />
            ))}
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              <ChartContainer title="Deployment trend" description="Daily success vs failure">
                <div style={{ width: '100%', height: 260 }}>
                  <ResponsiveContainer>
                    <AreaChart data={dashboard.deploymentTrend || []}>
                      <defs>
                        <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity={0.4} />
                          <stop offset="100%" stopColor="hsl(var(--chart-1))" stopOpacity={0.05} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'} />
                      <XAxis dataKey="date" tick={{ fill: isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)', fontSize: 11 }} />
                      <YAxis tick={{ fill: isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)', fontSize: 11 }} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Area type="monotone" dataKey="count" stroke="hsl(var(--chart-1))" fill="url(#trendGradient)" strokeWidth={2} />
                      <Line type="monotone" dataKey="success" stroke="hsl(var(--success))" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="failed" stroke="hsl(var(--destructive))" strokeWidth={2} dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </ChartContainer>
            </div>

            <div className="space-y-6">
              <ChartContainer title="Status distribution">
                <div style={{ width: '100%', height: 220 }}>
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={dashboard.statusBreakdown || []} dataKey="count" nameKey="status" cx="50%" cy="50%" outerRadius={80} label>
                        {(dashboard.statusBreakdown || []).map((entry, index) => (
                          <Cell key={`${entry.status}-${index}`} fill={STATUS_COLORS[entry.status] || STATUS_COLORS.default} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </ChartContainer>

              <ChartContainer title="Framework usage">
                <div style={{ width: '100%', height: 220 }}>
                  <ResponsiveContainer>
                    <BarChart data={dashboard.frameworkBreakdown || []}>
                      <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'} />
                      <XAxis dataKey="framework" tick={{ fill: isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)', fontSize: 11 }} />
                      <YAxis tick={{ fill: isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)', fontSize: 11 }} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Bar dataKey="count" fill="hsl(var(--chart-1))" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </ChartContainer>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <ChartContainer title="Slowest deployments">
              <div className="space-y-2">
                {(performance.slowestDeployments || []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No timed deployments in this window.</p>
                ) : (
                  (performance.slowestDeployments || []).map((item) => (
                    <div key={item.deploymentId} className="rounded-lg border border-border bg-secondary/50 px-3 py-2">
                      <div className="text-sm font-medium text-foreground">{item.repositoryName}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {formatDuration(item.totalTimeMs)} · {new Date(item.createdAt).toLocaleString()} · {item.status}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ChartContainer>

            <ChartContainer title="Top repositories">
              <div className="space-y-2">
                {(deployments.topRepositories || []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No repository activity in this window.</p>
                ) : (
                  (deployments.topRepositories || []).map((item) => (
                    <div key={item.repositoryName} className="rounded-lg border border-border bg-secondary/50 px-3 py-2">
                      <div className="text-sm font-medium text-foreground">{item.repositoryName}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {item.count} deployments · {item.successRate.toFixed(1)}% success
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ChartContainer>
          </div>
        </>
      )}
    </>
  );
}
