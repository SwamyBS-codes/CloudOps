import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ExternalLink, GitBranch, Loader2, RefreshCw, Rocket } from 'lucide-react';
import { authService, deploymentService } from '@/services/auth-service';
import { resolveDeploymentProvider } from '@/lib/application-types';

type LiveDeployment = {
  _id: string;
  userId?: string;
  repositoryName?: string;
  applicationName?: string;
  applicationType?: string;
  deploymentType?: string;
  provider?: string;
  deploymentService?: string;
  repositoryUrl?: string;
  branch?: string;
  framework?: string;
  status?: string;
  publicUrl?: string;
  domainUrl?: string;
  createdAt?: string;
  completedAt?: string;
  metadata?: Record<string, any>;
};

const isLiveDeployment = (deployment: LiveDeployment) =>
  deployment.status === 'success' || deployment.status === 'running';

const deploymentUrl = (deployment: LiveDeployment) =>
  deployment.domainUrl || deployment.publicUrl || deployment.metadata?.liveUrl || deployment.metadata?.infrastructure?.liveUrl;

const LiveProjectCard = ({
  deployment,
  onOpen,
}: {
  deployment: LiveDeployment;
  onOpen: () => void;
}) => {
  const liveUrl = deploymentUrl(deployment);
  const provider = resolveDeploymentProvider(deployment);

  return (
    <article className="flex min-w-0 flex-col border border-white/10 bg-[#0C0C0C] transition-colors hover:border-white/20">
      <button type="button" onClick={onOpen} className="min-w-0 p-4 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-emerald-300">
              <span className="h-1.5 w-1.5 bg-emerald-400" />
              Live deployment
            </div>
            <h2 className="mt-2 truncate text-base font-semibold text-white">
              {deployment.applicationName || deployment.repositoryName || 'Unnamed project'}
            </h2>
            <p className="mt-1 truncate text-xs text-neutral-500">
              {deployment.repositoryName || deployment.repositoryUrl || 'Repository unavailable'}
            </p>
          </div>
          <Rocket className="mt-0.5 h-4 w-4 shrink-0 text-neutral-600" />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 font-mono text-[10px] uppercase tracking-wider text-neutral-500">
          <span className="border border-white/[0.07] bg-[#101010] px-2 py-1">{provider}</span>
          {deployment.framework && (
            <span className="border border-white/[0.07] bg-[#101010] px-2 py-1">{deployment.framework}</span>
          )}
          <span className="inline-flex items-center gap-1">
            <GitBranch className="h-3 w-3" />
            {deployment.branch || 'main'}
          </span>
        </div>
      </button>

      <div className="mt-auto flex items-center justify-between gap-3 border-t border-white/[0.07] px-4 py-3 sm:px-5">
        <button
          type="button"
          onClick={onOpen}
          className="text-xs font-medium text-neutral-300 transition hover:text-white"
        >
          Manage deployment
        </button>
        {liveUrl ? (
          <a
            href={liveUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(event) => event.stopPropagation()}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-300 transition hover:text-emerald-200"
          >
            Open live site
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        ) : (
          <span className="text-[10px] text-neutral-600">Live URL unavailable</span>
        )}
      </div>
    </article>
  );
};

export default function LiveProjectsPage() {
  const navigate = useNavigate();
  const [deployments, setDeployments] = useState<LiveDeployment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDeployments = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);

    try {
      const meResponse = await authService.getMe();
      const meData = meResponse?.data as any;
      const userId = String(meData?.user?.id || '');
      if (!userId) throw new Error('Unable to resolve your account. Please sign in again.');

      const response = await deploymentService.getAll({ userId });
      const payload = response?.data as any;
      const records = payload?.data || payload?.deployments || payload || [];
      if (!Array.isArray(records)) throw new Error('The deployment service returned an invalid project list.');

      setDeployments(
        records
          .filter((record: LiveDeployment) => String(record.userId || '') === userId && isLiveDeployment(record))
          .sort((a: LiveDeployment, b: LiveDeployment) =>
            new Date(b.completedAt || b.createdAt || 0).getTime() - new Date(a.completedAt || a.createdAt || 0).getTime()
          )
      );
      setError(null);
    } catch (loadError: any) {
      setError(loadError?.response?.data?.error || loadError?.message || 'Unable to load live projects.');
      setDeployments([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadDeployments();
  }, [loadDeployments]);

  const liveDeployments = deployments.filter(isLiveDeployment);

  return (
    <main className="space-y-6">
      <header className="flex flex-col gap-3 border-b border-white/10 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-neutral-500">Projects / Live</div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">Live projects</h1>
          <p className="mt-1 text-sm text-neutral-400">Open a deployment to manage it, or visit its live site separately.</p>
        </div>
        <button
          type="button"
          onClick={() => void loadDeployments(true)}
          disabled={refreshing}
          className="inline-flex h-9 items-center gap-2 self-start border border-white/10 bg-[#101010] px-3 text-xs font-medium text-neutral-300 transition hover:border-white/25 hover:text-white disabled:opacity-50 sm:self-auto"
        >
          {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Refresh
        </button>
      </header>

      {error && (
        <div role="alert" className="border border-destructive/40 bg-destructive/[0.06] px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="Loading live projects">
          {[0, 1, 2].map((item) => <div key={item} className="h-40 animate-pulse border border-white/[0.07] bg-[#0C0C0C]" />)}
        </div>
      ) : liveDeployments.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {liveDeployments.map((deployment) => (
            <LiveProjectCard
              key={deployment._id}
              deployment={deployment}
              onOpen={() => navigate(`/deployments/${encodeURIComponent(deployment._id)}`)}
            />
          ))}
        </div>
      ) : !error ? (
        <div className="border border-dashed border-white/10 bg-[#0C0C0C] px-6 py-10 text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center border border-white/10 bg-[#101010] text-neutral-500">
            <Rocket className="h-4 w-4" />
          </div>
          <h2 className="mt-3 text-sm font-medium text-neutral-200">No live deployments yet</h2>
          <p className="mt-1 text-xs text-neutral-500">Successful frontend, static-hosting, and container deployments will appear here.</p>
        </div>
      ) : null}
    </main>
  );
}
