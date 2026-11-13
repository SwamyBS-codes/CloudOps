import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  Activity,
  CheckCircle2,
  Filter,
  Globe2,
  GitBranch,
  HeartPulse,
  Loader2,
  RefreshCw,
  Search,
  Server,
  Layers3,
  Cloud,
  Package,
} from 'lucide-react';
import { formatApplicationType, formatHealthStatus, resolveDeploymentProvider } from '@/lib/application-types';
import { authService, deploymentService } from '@/services/auth-service';
import {
  PageHeader,
  MetricCard,
  Alert,
  Card,
  Button,
  Input,
  StatusBadge,
  EmptyState,
} from '@/components/ui';

type DeploymentRecord = {
  _id: string;
  projectId?: string | null;
  repositoryName?: string;
  applicationName?: string;
  applicationType?: string;
  deploymentType?: string;
  repositoryUrl?: string;
  branch?: string;
  status?: string;
  phase?: string;
  framework?: string;
  publicUrl?: string;
  domainUrl?: string;
  healthStatus?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt?: string;
  updatedAt?: string;
  totalTime?: number;
  estimatedCostMonthly?: number;
  error?: {
    message?: string;
  };
  metadata?: Record<string, any>;
};

const ACTIVE_DEPLOYMENT_STATUSES = [
  'pending',
  'queued',
  'cloning',
  'detecting',
  'building',
  'pushing',
  'deploying',
  'running',
];

const isDeploymentActive = (deployment: DeploymentRecord) =>
  ACTIVE_DEPLOYMENT_STATUSES.includes(deployment.status || 'pending');

const formatDate = (value?: string) => {
  if (!value) return 'Unknown';
  return new Date(value).toLocaleString();
};

const formatDuration = (ms?: number) => {
  if (!ms || Number.isNaN(ms)) return 'Pending';
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.round(seconds % 60);
  return `${minutes}m ${remaining}s`;
};

export default function DeploymentsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const deploymentId = searchParams.get('deploymentId') || '';
  const [connectedUserId, setConnectedUserId] = useState<string>('');
  const [deployments, setDeployments] = useState<DeploymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    if (deploymentId) {
      navigate(`/deployments/${encodeURIComponent(deploymentId)}`, { replace: true });
    }
  }, [deploymentId, navigate]);

  useEffect(() => {
    let cancelled = false;

    const fetchDeployments = async (silent = false) => {
      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        let currentUserId = connectedUserId;
        if (!currentUserId) {
          const meResponse = await authService.getMe();
          const meData = meResponse?.data as any;
          currentUserId = String(meData?.user?.id || '');
          if (!currentUserId) {
            throw new Error('Unable to resolve connected GitHub user. Please sign in again.');
          }
          setConnectedUserId(currentUserId);
        }

        const response = await deploymentService.getAll({ userId: currentUserId });
        const responseData = response?.data as any;
        const raw = responseData?.data || responseData?.deployments || responseData || [];
        const nextDeployments = Array.isArray(raw) ? raw : [];

        if (cancelled) return;
        const userDeployments = nextDeployments
          .filter((item: DeploymentRecord) => String((item as any)?.userId || '') === String(currentUserId))
          .sort((a: DeploymentRecord, b: DeploymentRecord) => {
            const aTime = new Date(a.updatedAt || a.createdAt || 0).getTime();
            const bTime = new Date(b.updatedAt || b.createdAt || 0).getTime();
            return bTime - aTime;
          });

        setDeployments(userDeployments);
        setError(null);
      } catch (fetchError: any) {
        if (cancelled) return;
        setError(fetchError?.response?.data?.error || fetchError?.message || 'Unable to load deployments.');
      } finally {
        if (!cancelled) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    };

    void fetchDeployments();
    const timer = setInterval(() => void fetchDeployments(true), 8000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [connectedUserId]);

  const filteredDeployments = useMemo(() => {
    return deployments.filter((deployment) => {
      const matchesQuery = `${deployment.applicationName || ''} ${deployment.repositoryName || ''} ${deployment.applicationType || ''} ${deployment.repositoryUrl || ''}`.toLowerCase().includes(query.toLowerCase());
      const matchesStatus =
        statusFilter === 'all'
        || (statusFilter === 'deploying' && isDeploymentActive(deployment))
        || deployment.status === statusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [deployments, query, statusFilter]);

  const statusCounts = useMemo(() => {
    return deployments.reduce<Record<string, number>>((acc, deployment) => {
      const key = deployment.status || 'pending';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
  }, [deployments]);

  const activeDeployments = filteredDeployments.filter(isDeploymentActive);
  const historyDeployments = filteredDeployments.filter((deployment) => !isDeploymentActive(deployment));

  return (
    <>
      <PageHeader
        title="Deployments"
        description="Review every deployment, inspect live status, project info, and build logs."
        actions={
          <Button
            variant="outline"
            size="sm"
            disabled={refreshing}
            onClick={() => {
              setRefreshing(true);
              void (async () => {
                try {
                  let currentUserId = connectedUserId;
                  if (!currentUserId) {
                    const meResponse = await authService.getMe();
                    const meData = meResponse?.data as any;
                    currentUserId = String(meData?.user?.id || '');
                    setConnectedUserId(currentUserId);
                  }
                  const response = await deploymentService.getAll({ userId: currentUserId });
                  const responseData = response?.data as any;
                  const raw = responseData?.data || responseData?.deployments || responseData || [];
                  const nextDeployments = Array.isArray(raw) ? raw : [];
                  const userDeployments = nextDeployments
                    .filter((item: DeploymentRecord) => String((item as any)?.userId || '') === String(currentUserId))
                    .sort((a: DeploymentRecord, b: DeploymentRecord) => {
                      const aTime = new Date(a.updatedAt || a.createdAt || 0).getTime();
                      const bTime = new Date(b.updatedAt || b.createdAt || 0).getTime();
                      return bTime - aTime;
                    });
                  setDeployments(userDeployments);
                  setError(null);
                } catch (refreshError: any) {
                  setError(refreshError?.response?.data?.error || refreshError?.message || 'Unable to refresh deployments.');
                } finally {
                  setRefreshing(false);
                }
              })();
            }}
          >
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh
          </Button>
        }
      />

      {error && (
        <Alert variant="destructive" title="Error loading deployments" className="mb-6">
          {error}
        </Alert>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Total', value: String(deployments.length), icon: Server },
          { label: 'Successful', value: String(statusCounts.success || 0), icon: CheckCircle2 },
          { label: 'Running', value: String(ACTIVE_DEPLOYMENT_STATUSES.reduce((count, status) => count + (statusCounts[status] || 0), 0)), icon: Activity },
          { label: 'Failed', value: String(statusCounts.failed || 0), icon: AlertTriangle },
        ].map((item, i) => (
          <MetricCard key={item.label} label={item.label} value={item.value} icon={item.icon} loading={loading} delay={i * 0.06} />
        ))}
      </div>

      <Card className="mb-8 border-border/60 bg-card/80 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="w-full lg:max-w-lg">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search application name or type"
              icon={<Search className="h-4 w-4" />}
            />
          </div>
          <div className="flex flex-wrap items-center gap-1 border border-border bg-secondary/80 p-1">
            <Filter className="ml-2 h-4 w-4 text-muted-foreground" aria-hidden />
            {['all', 'deploying', 'success', 'failed'].map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(status)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize transition ${
                  statusFilter === status
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {status}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Card key={index} className="h-56 animate-pulse bg-secondary/50" />
          ))}
        </div>
      ) : filteredDeployments.length === 0 ? (
        <EmptyState
          icon={Layers3}
          title="No deployments found"
          description={query || statusFilter !== 'all' ? 'Try adjusting your search or filters.' : 'Deploy a repository to see it here.'}
        />
      ) : (
        <div className="space-y-8">
          {activeDeployments.length > 0 && (
            <section aria-labelledby="active-deployments-heading">
              <div className="mb-3 flex items-end justify-between gap-4">
                <div>
                  <h2 id="active-deployments-heading" className="text-lg font-semibold text-foreground">
                    Deploying now
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    These jobs continue on the server if you leave this page. Open any job to follow its live logs.
                  </p>
                </div>
                <span className="shrink-0 font-mono text-xs text-primary">{activeDeployments.length} ACTIVE</span>
              </div>
              <div className="space-y-2">
                {activeDeployments.map((deployment) => (
                  <button
                    key={deployment._id}
                    type="button"
                    onClick={() => navigate(`/deployments/${encodeURIComponent(deployment._id)}`)}
                    className="group flex w-full flex-wrap items-center justify-between gap-4 border border-primary/25 bg-card px-4 py-4 text-left transition hover:border-primary/60 hover:bg-secondary sm:px-5"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Activity className="h-4 w-4 text-primary" />
                        <h3 className="truncate font-semibold text-foreground group-hover:text-primary">
                          {deployment.applicationName || deployment.repositoryName || 'Unnamed application'}
                        </h3>
                        <StatusBadge status={deployment.status || 'pending'} />
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {deployment.repositoryName || deployment.repositoryUrl || 'Repository'}
                        {' · '}
                        {deployment.phase
                          ? deployment.phase.replace(/[_-]/g, ' ')
                          : 'Waiting for worker'}
                        {' · '}
                        {deployment.branch || 'main'}
                      </p>
                    </div>
                    <span className="inline-flex shrink-0 items-center gap-2 border border-border px-3 py-2 text-xs font-medium text-foreground transition group-hover:border-primary/50">
                      <Activity className="h-3.5 w-3.5 text-primary" />
                      View live logs
                      <ArrowRight className="h-3.5 w-3.5" />
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {historyDeployments.length > 0 && (
            <section aria-labelledby="deployment-history-heading">
              <h2 id="deployment-history-heading" className="mb-3 text-lg font-semibold text-foreground">
                Recent deployments
              </h2>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {historyDeployments.map((deployment, index) => {
            const status = deployment.status || 'pending';
            const liveUrl = deployment.domainUrl || deployment.publicUrl || deployment.metadata?.liveUrl;
            const appName = deployment.applicationName || deployment.repositoryName || 'Unnamed application';
            const appType = formatApplicationType(deployment.applicationType);
            const health = formatHealthStatus(deployment.healthStatus);
            
            // Determine provider (shared derivation, no shadowing)
            const provider = resolveDeploymentProvider(deployment as any);

            let providerBadge = { label: 'Cloud', color: 'bg-secondary text-blue-400 border-border' };
            if (provider === 'aws') {
              providerBadge = { label: 'AWS', color: 'bg-orange-500/10 text-orange-400 border-orange-500/20' };
            } else if (provider === 'azure') {
              providerBadge = { label: 'Azure', color: 'bg-secondary text-sky-400 border-border' };
            } else if (provider === 's3') {
              providerBadge = { label: 'S3', color: 'bg-success/10 text-success border-success' };
            }

            return (
              <motion.button
                key={deployment._id}
                type="button"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.04 }}
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.99 }}
                onClick={() => navigate(`/deployments/${deployment._id}`)}
                className="group rounded-xl border border-border/60 bg-card/80 p-5 text-left shadow-sm transition hover:border-primary/30 hover:shadow-glow"
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-xs">
                      <span className={`rounded-full border px-2.5 py-1 font-medium ${providerBadge.color}`}>
                        {providerBadge.label}
                      </span>
                      <span className="uppercase tracking-wider text-muted-foreground">
                        {appType}
                      </span>
                    </div>
                    <h3 className="mt-2 truncate font-display text-lg font-semibold text-foreground group-hover:text-primary">
                      {appName}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      {deployment.framework || 'Auto-detected'} • {deployment.branch || 'main'}
                    </p>
                  </div>
                  <StatusBadge status={status} />
                </div>

                {/* Provider-specific details */}
                <div className="mb-4 rounded-lg bg-secondary/30 p-3 text-xs space-y-2 border border-border/40">
                  {provider === 'aws' && (
                    <>
                      {(deployment as any)?.infrastructure?.ec2?.instanceId && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Instance:</span>
                          <span className="font-mono text-foreground">{(deployment as any).infrastructure.ec2.instanceId}</span>
                        </div>
                      )}
                      {(deployment as any)?.infrastructure?.region && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Region:</span>
                          <span className="text-foreground">{(deployment as any).infrastructure.region}</span>
                        </div>
                      )}
                    </>
                  )}
                  {provider === 'azure' && (
                    <>
                      {(deployment as any)?.infrastructure?.aci?.containerGroupName && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Container:</span>
                          <span className="font-mono text-foreground text-xs">{(deployment as any).infrastructure.aci.containerGroupName}</span>
                        </div>
                      )}
                      {(deployment as any)?.infrastructure?.aci?.location && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Location:</span>
                          <span className="text-foreground">{(deployment as any).infrastructure.aci.location}</span>
                        </div>
                      )}
                    </>
                  )}
                  {provider === 's3' && (
                    <>
                      {(deployment as any)?.infrastructure?.s3?.bucket && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Bucket:</span>
                          <span className="font-mono text-foreground text-xs">{(deployment as any).infrastructure.s3.bucket}</span>
                        </div>
                      )}
                      {(deployment as any)?.infrastructure?.region && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Region:</span>
                          <span className="text-foreground">{(deployment as any).infrastructure.region}</span>
                        </div>
                      )}
                    </>
                  )}
                </div>

                <div className="grid gap-2 text-sm">
                  {[
                    { label: 'Health', value: health, icon: HeartPulse },
                    { label: 'Duration', value: formatDuration(deployment.totalTime) },
                  ].map((row) => (
                    <div key={row.label} className="flex items-center justify-between rounded-lg bg-secondary/50 px-3 py-2">
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        {row.icon && <row.icon className="h-3.5 w-3.5" />}
                        {row.label}
                      </span>
                      <span className="font-medium text-foreground">{row.value}</span>
                    </div>
                  ))}
                  {(deployment as any)?.estimatedCostMonthly && (
                    <div className="flex items-center justify-between rounded-lg bg-secondary/50 px-3 py-2">
                      <span className="text-muted-foreground">Est. Cost</span>
                      <span className="font-medium text-foreground">${(deployment as any).estimatedCostMonthly.toFixed(2)}/mo</span>
                    </div>
                  )}
                </div>

                <div className="mt-4 flex items-center gap-2 border-t border-border/60 pt-4 text-sm text-muted-foreground">
                  <Globe2 className="h-4 w-4 shrink-0" />
                  {liveUrl ? (
                    <a
                      href={liveUrl}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(event) => event.stopPropagation()}
                      className="truncate text-primary hover:underline"
                    >
                      {liveUrl.replace(/^https?:\/\//, '')}
                    </a>
                  ) : (
                    <span>URL pending</span>
                  )}
                </div>

                <div className="mt-3 flex items-center justify-end gap-1 text-sm font-medium text-primary">
                  Open details <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                </div>
              </motion.button>
            );
          })}
              </div>
            </section>
          )}
        </div>
      )}
    </>
  );
}
