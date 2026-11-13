import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ExternalLink,
  GitBranch,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  Rocket,
  Trash2,
  X,
} from 'lucide-react';
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
  ['success', 'running', 'stopped'].includes(deployment.status || '');

const deploymentUrl = (deployment: LiveDeployment) =>
  deployment.domainUrl || deployment.publicUrl || deployment.metadata?.liveUrl || deployment.metadata?.infrastructure?.liveUrl;

const LiveProjectCard = ({
  deployment,
  onOpen,
  onAction,
  busy,
}: {
  deployment: LiveDeployment;
  onOpen: () => void;
  onAction: (action: 'stop' | 'restart' | 'terminate', deployment: LiveDeployment) => void;
  busy: boolean;
}) => {
  const liveUrl = deploymentUrl(deployment);
  const provider = resolveDeploymentProvider(deployment);
  const isStopped = deployment.status === 'stopped';

  return (
    <article className="flex min-w-0 flex-col border border-white/10 bg-[#0C0C0C] transition-colors hover:border-white/20">
      <button
        type="button"
        onClick={onOpen}
        className="min-w-0 p-4 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary sm:p-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 font-mono text-[9px] font-semibold uppercase tracking-[0.16em]">
              {isStopped ? (
                <span className="flex items-center gap-1.5 text-amber-300">
                  <span className="h-1.5 w-1.5 bg-amber-400" />
                  Paused (Compute $0/hr)
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-emerald-300">
                  <span className="h-1.5 w-1.5 bg-emerald-400" />
                  Live deployment
                </span>
              )}
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

      {/* Action controls row */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.07] px-4 py-2.5 sm:px-5 bg-[#090909]">
        <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          {isStopped ? (
            <button
              type="button"
              disabled={busy}
              onClick={(e) => {
                e.stopPropagation();
                onAction('restart', deployment);
              }}
              className="inline-flex items-center gap-1 rounded border border-emerald-400/40 bg-emerald-400/10 px-2.5 py-1 text-xs font-medium text-emerald-300 transition hover:bg-emerald-400/20 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
              Resume
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={(e) => {
                e.stopPropagation();
                onAction('stop', deployment);
              }}
              className="inline-flex items-center gap-1 rounded border border-amber-400/40 bg-amber-400/10 px-2.5 py-1 text-xs font-medium text-amber-300 transition hover:bg-amber-400/20 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Pause className="h-3 w-3" />}
              {provider === 'azure' ? 'Pause ($0/hr)' : 'Stop'}
            </button>
          )}

          <button
            type="button"
            disabled={busy}
            onClick={(e) => {
              e.stopPropagation();
              onAction('terminate', deployment);
            }}
            className="inline-flex items-center gap-1 rounded border border-destructive/40 bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive transition hover:bg-destructive/20 disabled:opacity-50"
          >
            <Trash2 className="h-3 w-3" />
            Terminate
          </button>
        </div>

        <button
          type="button"
          onClick={onOpen}
          className="text-xs font-medium text-neutral-400 transition hover:text-white"
        >
          Manage
        </button>
      </div>

      <div className="mt-auto flex items-center justify-between gap-3 border-t border-white/[0.07] px-4 py-2.5 sm:px-5">
        <span className="font-mono text-[10px] text-neutral-600">
          {deployment.completedAt ? new Date(deployment.completedAt).toLocaleDateString() : 'Active'}
        </span>
        {liveUrl && !isStopped ? (
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
          <span className="text-[10px] text-neutral-600">
            {isStopped ? 'Suspended ($0/hr)' : 'Live URL unavailable'}
          </span>
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
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);

  const [confirmModal, setConfirmModal] = useState<{
    action: 'stop' | 'restart' | 'terminate';
    deployment: LiveDeployment;
  } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

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

  const handleAction = (action: 'stop' | 'restart' | 'terminate', deployment: LiveDeployment) => {
    setConfirmModal({ action, deployment });
  };

  const handleExecuteAction = async () => {
    if (!confirmModal) return;
    const { action, deployment } = confirmModal;
    const id = deployment._id;
    const provider = resolveDeploymentProvider(deployment);
    const appName = deployment.applicationName || deployment.repositoryName || 'Project';

    setBusyId(id);
    setError(null);
    setActionSuccessMsg(null);

    try {
      if (action === 'stop') {
        await deploymentService.stop(id);
        setActionSuccessMsg(
          provider === 'azure'
            ? `Suspended compute for "${appName}". Billing paused ($0/hr).`
            : `Stopped container for "${appName}".`
        );
      } else if (action === 'restart') {
        await (provider === 'azure' ? deploymentService.start(id) : deploymentService.restart(id));
        setActionSuccessMsg(`Resumed container for "${appName}".`);
      } else if (action === 'terminate') {
        if (provider === 'azure') {
          await deploymentService.terminateAzureDeployment(id);
          setActionSuccessMsg(`Terminated Azure resources for "${appName}".`);
        } else {
          await deploymentService.delete(id);
          setActionSuccessMsg(`Terminated deployment for "${appName}".`);
        }
      }
      setConfirmModal(null);
      await loadDeployments(true);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || `Failed to ${action} deployment.`);
      setConfirmModal(null);
    } finally {
      setBusyId(null);
    }
  };

  const liveDeployments = deployments.filter(isLiveDeployment);

  return (
    <main className="space-y-6">
      <header className="flex flex-col gap-3 border-b border-white/10 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-neutral-500">Projects / Live</div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">Live projects</h1>
          <p className="mt-1 text-sm text-neutral-400">Manage live and suspended projects, control compute billing, or open live URLs.</p>
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

      {actionSuccessMsg && (
        <div role="status" className="border border-emerald-400/30 bg-emerald-400/[0.06] px-4 py-3 text-sm text-emerald-300">
          {actionSuccessMsg}
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
              onAction={handleAction}
              busy={busyId === deployment._id}
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

      {/* Confirmation Modal */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/75 backdrop-blur-sm"
            onClick={() => !busyId && setConfirmModal(null)}
          />
          <div className="relative z-10 w-full max-w-md rounded-2xl border border-white/10 bg-[#0E0E0E] p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-base font-semibold text-white">
                {confirmModal.action === 'stop'
                  ? (resolveDeploymentProvider(confirmModal.deployment) === 'azure' ? 'Pause Compute (Suspend Billing)' : 'Stop Container')
                  : confirmModal.action === 'restart'
                    ? 'Resume Container'
                    : 'Terminate Deployment & Resources'}
              </h3>
              <button
                type="button"
                disabled={Boolean(busyId)}
                onClick={() => setConfirmModal(null)}
                className="text-neutral-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 text-xs leading-relaxed text-neutral-300">
              <p className="font-medium text-white mb-2">
                Project: {confirmModal.deployment.applicationName || confirmModal.deployment.repositoryName || 'Project'}
              </p>
              {confirmModal.action === 'stop' && (
                <p>
                  {resolveDeploymentProvider(confirmModal.deployment) === 'azure'
                    ? 'Suspending this Azure Container Group stops compute billing ($0/hr). Your container image in ACR and environment configuration will remain intact, ready to resume anytime.'
                    : 'Stopping this container will halt execution while keeping configuration safe.'}
                </p>
              )}
              {confirmModal.action === 'restart' && (
                <p>
                  {resolveDeploymentProvider(confirmModal.deployment) === 'azure'
                    ? 'Resume this suspended Azure container? Compute will begin running again and your application will be accessible at its public URL.'
                    : 'Restart this container to resume running the application.'}
                </p>
              )}
              {confirmModal.action === 'terminate' && (
                <div className="space-y-2">
                  <p className="font-semibold text-destructive">
                    This action is permanent and cannot be undone.
                  </p>
                  <p>
                    {resolveDeploymentProvider(confirmModal.deployment) === 'azure'
                      ? 'This will permanently delete the Azure Container Group from your Azure subscription. Any unsaved container state will be lost.'
                      : 'This will terminate and delete the deployment resources.'}
                  </p>
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-3 border-t border-white/10 pt-4">
              <button
                type="button"
                disabled={Boolean(busyId)}
                onClick={() => setConfirmModal(null)}
                className="border border-white/10 bg-[#161616] px-4 py-2 text-xs font-medium text-neutral-300 hover:text-white"
              >
                Keep as is
              </button>
              <button
                type="button"
                disabled={Boolean(busyId)}
                onClick={() => void handleExecuteAction()}
                className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium disabled:opacity-50 ${
                  confirmModal.action === 'terminate'
                    ? 'border border-destructive/50 bg-destructive text-destructive-foreground hover:bg-destructive/90'
                    : confirmModal.action === 'stop'
                      ? 'border border-amber-400/50 bg-amber-500 text-black font-semibold hover:bg-amber-400'
                      : 'border border-emerald-400/50 bg-emerald-500 text-black font-semibold hover:bg-emerald-400'
                }`}
              >
                {busyId && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {confirmModal.action === 'terminate'
                  ? 'Confirm Termination'
                  : confirmModal.action === 'stop'
                    ? 'Confirm Pause'
                    : 'Confirm Resume'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
