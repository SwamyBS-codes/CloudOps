import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  ChevronDown,
  Clock3,
  ExternalLink,
  GitBranch,
  Globe2,
  HardDriveDownload,
  Loader2,
  Pause,
  Play,
  Power,
  Trash2,
  X,
} from 'lucide-react';
import { deploymentService } from '@/services/auth-service';
import { resolveDeploymentProvider } from '@/lib/application-types';
import { SOCKET_URL } from '@/lib/constants';
import LiveProgressBar from '@/components/deployments/LiveProgressBar';
import TerminalStream from '@/components/deployments/TerminalStream';
import DeploymentTimeline from '@/components/deployments/DeploymentTimeline';

type DeploymentLog = {
  timestamp?: string;
  source?: string;
  level?: string;
  message?: string;
};

type DeploymentDetails = {
  _id?: string;
  deploymentId?: string;
  projectId?: string | null;
  userId?: string;
  repositoryName?: string;
  repositoryUrl?: string;
  branch?: string;
  status?: string;
  phase?: string;
  framework?: string;
  publicUrl?: string;
  startedAt?: string;
  completedAt?: string;
  totalTime?: number;
  createdAt?: string;
  commitHash?: string;
  commitShortHash?: string;
  commitMessage?: string;
  commitAuthor?: string;
  commitDate?: string;
  dockerImageUri?: string;
  dockerImageTag?: string;
  dockerBuildTime?: number;
  dockerImageSize?: number;
  buildTime?: number;
  infrastructure?: {
    provider?: string;
    targetType?: string;
    region?: string;
    target?: {
      type?: string;
      awsRegion?: string;
      instanceType?: string;
      keyName?: string | null;
      securityGroupIds?: string[];
      vpcId?: string | null;
      host?: string;
      user?: string;
      publicHost?: string | null;
      publicUrl?: string | null;
    };
    s3?: {
      bucket?: string | null;
      prefix?: string | null;
      siteSlug?: string | null;
      websiteUrl?: string | null;
      publicIp?: string | null;
    };
    ecr?: {
      repositoryArn?: string | null;
      repositoryName?: string | null;
      repositoryUri?: string | null;
      imageUri?: string | null;
      imageTag?: string | null;
    };
    acr?: {
      loginServer?: string | null;
      repositoryName?: string | null;
      imageUri?: string | null;
      imageTag?: string | null;
      imageName?: string | null;
    };
    aci?: {
      containerGroupName?: string | null;
      containerName?: string | null;
      resourceGroupName?: string | null;
      resourceGroup?: string | null;
      location?: string | null;
      cpu?: number | null;
      memoryInGb?: number | null;
      status?: string | null;
      fqdn?: string | null;
      ipAddress?: string | null;
    };
    ec2?: {
      instanceId?: string | null;
      publicIp?: string | null;
      privateIp?: string | null;
      instanceType?: string | null;
      keyName?: string | null;
      securityGroupIds?: string[];
      vpcId?: string | null;
    };
    container?: {
      name?: string | null;
      imageName?: string | null;
      port?: number | null;
    };
    liveUrl?: string;
    deployState?: string;
  };
  applicationType?: string;
  applicationName?: string;
  deploymentService?: string;
  provider?: string;
  domainUrl?: string;
  healthStatus?: string;
  error?: {
    message?: string;
    phase?: string;
  };
  metadata?: Record<string, any>;
};

const DOCKER_STEPS = [
  'Preparing Deployment',
  'Cloning Repository',
  'Detecting Framework',
  'Generating Dockerfile',
  'Building Docker Image',
  'Pushing to AWS ECR',
  'Launching EC2',
  'Starting Container',
  'Deployment Successful',
];

const STATIC_STEPS = [
  'Preparing Deployment',
  'Verifying S3 Access',
  'Building Website',
  'Publishing to S3',
  'Deployment Successful',
];

const phaseToStep: Record<string, number> = {
  preparation: 0,
  queued: 0,
  clone: 1,
  framework_detection: 2,
  dockerfile_generation: 3,
  docker_build: 4,
  push_ecr: 5,
  ec2_launch: 6,
  container_start: 7,
  nginx_setup: 7,
  complete: 8,
};

const staticPhaseToStep: Record<string, number> = {
  preparation: 0,
  queued: 0,
  docker_build: 2,
  complete: 4,
};

const statusStyles: Record<string, string> = {
  success: 'bg-success/10 text-success border-success',
  deploying: 'bg-primary/10 text-primary border-primary',
  running: 'bg-primary/10 text-primary border-primary',
  building: 'bg-warning/10 text-warning border-warning',
  pushing: 'bg-warning/10 text-warning border-warning',
  pending: 'bg-secondary text-muted-foreground border-border',
  failed: 'bg-destructive/10 text-destructive border-destructive',
  cancelled: 'bg-secondary text-muted-foreground border-border',
  stopped: 'bg-secondary text-muted-foreground border-border',
  closed: 'bg-secondary text-muted-foreground border-border',
};

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

export default function DeploymentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [deployment, setDeployment] = useState<DeploymentDetails | null>(null);
  const [logs, setLogs] = useState<DeploymentLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bringingDown, setBringingDown] = useState(false);
  const [bringDownConfirmOpen, setBringDownConfirmOpen] = useState(false);
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const [confirmLifecycleAction, setConfirmLifecycleAction] = useState<'cancel' | 'stop' | 'restart' | 'terminate' | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [showMetadata, setShowMetadata] = useState(false);

  const deploymentKey = deployment?._id || deployment?.deploymentId || '';
  const metadata = (deployment?.metadata || {}) as Record<string, any>;
  const infrastructure = (deployment?.infrastructure || metadata.infrastructure || {}) as NonNullable<DeploymentDetails['infrastructure']> & Record<string, any>;
  const deploymentProvider = resolveDeploymentProvider({
    deploymentService: deployment?.deploymentService,
    provider: deployment?.provider,
    infrastructure: { provider: infrastructure?.provider, targetType: infrastructure?.targetType },
  });
  const targetType = infrastructure?.targetType || infrastructure?.target?.type || 'unknown';
  const commitHash = deployment?.commitShortHash || deployment?.commitHash || metadata?.repositoryInfo?.latestCommit?.shortHash || 'Unknown';
  const fullCommitHash = deployment?.commitHash || metadata?.repositoryInfo?.latestCommit?.hash || 'Unknown';
  const commitMessage = deployment?.commitMessage || metadata?.repositoryInfo?.latestCommit?.message || 'Unknown';
  const commitAuthor = deployment?.commitAuthor || metadata?.repositoryInfo?.latestCommit?.author || 'Unknown';
  const commitDate = deployment?.commitDate || metadata?.repositoryInfo?.latestCommit?.date;
  const ecrRepository = infrastructure?.ecr?.repositoryName || deployment?.metadata?.ecrRepository || 'Pending';
  const ecrRepositoryUri = infrastructure?.ecr?.repositoryUri || 'Pending';
  const ecrImageUri = infrastructure?.ecr?.imageUri || deployment?.dockerImageUri || metadata?.ecrImageUri || metadata?.dockerImageUri || 'Pending';
  const ecrImageTag = deployment?.dockerImageTag || infrastructure?.ecr?.imageTag || infrastructure?.acr?.imageTag || metadata?.dockerImageTag || 'Pending';
  const ec2InstanceId = infrastructure?.ec2?.instanceId || deployment?.metadata?.ec2InstanceId || 'Pending';
  const deploymentPublicIp = infrastructure?.ec2?.publicIp
    || infrastructure?.s3?.publicIp
    || infrastructure?.aci?.ipAddress
    || deployment?.metadata?.ec2PublicIp
    || deployment?.metadata?.publicIp
    || 'Pending';
  const ec2PrivateIp = infrastructure?.ec2?.privateIp || deployment?.metadata?.ec2PrivateIp || 'Pending';
  const containerPort = infrastructure?.container?.port || deployment?.metadata?.containerPort || 80;
  const containerName = infrastructure?.container?.name || deployment?.metadata?.containerName || infrastructure?.aci?.containerName || 'Pending';
  const liveInfrastructureUrl = infrastructure?.liveUrl || deployment?.publicUrl || deployment?.metadata?.liveUrl;
  const dockerBuildTime = deployment?.dockerBuildTime || deployment?.buildTime || metadata?.dockerBuildTime;
  const dockerImageSize = deployment?.dockerImageSize || metadata?.dockerImageSize;
  const azureAcrRepository = infrastructure?.acr?.repositoryName || 'Pending';
  const azureAcrLoginServer = infrastructure?.acr?.loginServer || 'Pending';
  const azureAcrImageUri = infrastructure?.acr?.imageUri || ecrImageUri;
  const azureAcrImageName = infrastructure?.acr?.imageName || 'Pending';
  const azureAciContainerGroup = infrastructure?.aci?.containerGroupName || 'Pending';
  const azureAciResourceGroup = infrastructure?.aci?.resourceGroupName || infrastructure?.aci?.resourceGroup || 'Pending';
  const azureAciLocation = infrastructure?.aci?.location || infrastructure?.region || 'Pending';
  const azureAciFqdn = infrastructure?.aci?.fqdn || infrastructure?.aci?.ipAddress || 'Pending';
  const azureAciStatus = infrastructure?.aci?.status || 'Pending';
  const azureAciCpu = infrastructure?.aci?.cpu || 'Pending';
  const azureAciMemory = infrastructure?.aci?.memoryInGb || 'Pending';
  const isStaticDeployment =
    deploymentProvider === 's3'
    || deployment?.applicationType === 'frontend-website';
  const isAwsDeployment =
    !isStaticDeployment && deploymentProvider === 'aws';
  const isAzureDeployment = !isStaticDeployment && deploymentProvider === 'azure';
  const activeSteps = isStaticDeployment ? STATIC_STEPS : DOCKER_STEPS;
  const activePhaseMap = isStaticDeployment ? staticPhaseToStep : phaseToStep;
  const s3Bucket = infrastructure?.s3?.bucket || 'Pending';
  const s3Prefix = infrastructure?.s3?.prefix || infrastructure?.s3?.siteSlug || 'Pending';

  useEffect(() => {
    if (!id) {
      setError('Missing deployment id.');
      setLoading(false);
      return;
    }


    let disposed = false;

    const fetchDeployment = async () => {
      try {
        const [statusResponse, logsResponse] = await Promise.all([
          deploymentService.getById(id),
          deploymentService.getLogs(id, { limit: 250 }),
        ]);

        if (disposed) return;

        const statusPayload = statusResponse.data as any;
        const logsPayload = logsResponse.data as any;
        const nextDeployment = statusPayload?.deployment || statusPayload?.data || statusPayload || null;
        const nextLogs = Array.isArray(logsPayload?.logs) ? logsPayload.logs : [];

        setDeployment(nextDeployment);
        setLogs([...nextLogs].sort((a: DeploymentLog, b: DeploymentLog) => {
          const aTime = a?.timestamp ? new Date(a.timestamp).getTime() : 0;
          const bTime = b?.timestamp ? new Date(b.timestamp).getTime() : 0;
          return aTime - bTime;
        }));
        setError(null);
      } catch (fetchError: any) {
        if (disposed) return;
        setError(fetchError?.response?.data?.error || fetchError?.message || 'Unable to load deployment details.');
      } finally {
        if (!disposed) {
          setLoading(false);
        }
      }
    };

    void fetchDeployment();
    const timer = setInterval(() => {
      const terminal = deployment?.status && ['success', 'failed', 'cancelled', 'stopped', 'closed'].includes(deployment.status);
      if (!terminal) {
        void fetchDeployment();
      }
    }, 4000);

    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [id, deployment?.status]);

  useEffect(() => {
    if (!id) return;

    const socketUrl = SOCKET_URL;
    const socket = io(socketUrl, { autoConnect: true });
    const deploymentRoom = `deployment:${id}`;

    const seenLogKeys = new Set<string>();

    const appendLog = (entry: DeploymentLog) => {
      const dedupeKey = `${entry.timestamp || ''}:${entry.message || ''}:${entry.level || ''}`;
      if (seenLogKeys.has(dedupeKey)) return;
      seenLogKeys.add(dedupeKey);

      setLogs((prev) => {
        const next = [...prev, entry];
        return next.sort((a, b) => {
          const aTime = a?.timestamp ? new Date(a.timestamp).getTime() : 0;
          const bTime = b?.timestamp ? new Date(b.timestamp).getTime() : 0;
          return aTime - bTime;
        });
      });
    };

    const onDeploymentLog = (data: { deploymentId?: string; message?: string; level?: string; timestamp?: string }) => {
      if (data.deploymentId && data.deploymentId !== id) return;
      if (!data.message) return;
      appendLog({
        timestamp: data.timestamp || new Date().toISOString(),
        source: 'live',
        level: data.level || 'info',
        message: data.message,
      });
    };

    socket.on('connect', () => {
      socket.emit('join-deployment', deploymentRoom);
    });

    socket.on('deployment-log', onDeploymentLog);

    return () => {
      socket.off('deployment-log', onDeploymentLog);
      socket.disconnect();
    };
  }, [id]);

  const currentStep = useMemo(() => {
    if (!deployment) return 0;
    if (deployment.status === 'success') return activeSteps.length - 1;
    return activePhaseMap[deployment.phase || 'preparation'] ?? 0;
  }, [deployment, activeSteps.length, activePhaseMap]);

  const progress = useMemo(() => {
    if (!deployment) return 0;
    if (deployment.status === 'success') return 100;

    const stepPortion = Math.max(1, activeSteps.length - 1);
    const base = (Math.min(currentStep, stepPortion) / stepPortion) * 100;

    if (deployment.status === 'failed' || deployment.status === 'cancelled') {
      return Math.max(5, Math.round(base));
    }

    return Math.min(95, Math.max(5, Math.round(base + 8)));
  }, [deployment, currentStep, activeSteps.length]);

  const timeline = useMemo(() => {
    return activeSteps.map((label, index) => {
      if ((deployment?.status === 'failed' || deployment?.status === 'cancelled') && index === currentStep) {
        return { label, status: 'failed' };
      }
      if (index < currentStep) {
        return { label, status: 'success' };
      }
      if (index === currentStep && deployment && !['success', 'failed', 'cancelled'].includes(deployment.status || '')) {
        return { label, status: 'running' };
      }
      if (deployment?.status === 'success' && index === currentStep) {
        return { label, status: 'success' };
      }
      return { label, status: 'pending' };
    });
  }, [currentStep, deployment, activeSteps]);

  const renderedLogs = useMemo(() => {
    return logs.map((log) => {
      const ts = log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : '';
      const source = log.source ? `[${log.source}] ` : '';
      const level = log.level ? `${log.level.toUpperCase()}: ` : '';
      return `${ts ? `[${ts}] ` : ''}${source}${level}${log.message || ''}`.trim();
    });
  }, [logs]);

  const status = deployment?.status || 'pending';
  const liveUrl = ['stopped', 'closed'].includes(status)
    ? undefined
    : deployment?.publicUrl || deployment?.metadata?.liveUrl;
  const badgeClass = statusStyles[status] || statusStyles.pending;
  const deploymentInstanceId = infrastructure?.ec2?.instanceId || (deployment?.metadata as any)?.ec2InstanceId || '';
  const isCloudOpsContainer = !isStaticDeployment && !isAwsDeployment && !isAzureDeployment;
  const canCancel = ['pending', 'queued', 'cloning', 'detecting', 'building', 'pushing', 'deploying'].includes(status);
  const canStopContainer = ['success', 'running'].includes(status) && !isStaticDeployment;
  const canRestartContainer = status === 'stopped' && !isStaticDeployment;
  const canTerminateAws = isAwsDeployment && ['success', 'running', 'stopped', 'failed', 'cancelled'].includes(status) && Boolean(deploymentInstanceId);
  const canTerminateAzure = isAzureDeployment && ['success', 'running', 'stopped', 'failed', 'cancelled'].includes(status);
  const canTerminateGeneric = !isAzureDeployment && !isAwsDeployment && ['success', 'running', 'stopped', 'failed', 'cancelled'].includes(status);

  const focusSection = (sectionId: string, requiresMetadata = false) => {
    if (requiresMetadata) setShowMetadata(true);
    window.setTimeout(() => {
      document.getElementById(sectionId)?.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'start',
      });
    }, 0);
  };

  const runLifecycleAction = async (action: 'cancel' | 'stop' | 'restart' | 'terminate') => {
    if (!deploymentKey) return;
    setLifecycleBusy(true);
    setError(null);
    setActionMessage(null);

    try {
      if (action === 'cancel') {
        await deploymentService.cancel(deploymentKey);
        setDeployment((current) => current ? { ...current, status: 'cancelled', phase: 'complete' } : current);
        setActionMessage('Deployment cancelled.');
      } else if (action === 'stop') {
        await deploymentService.stop(deploymentKey);
        setDeployment((current) => current
          ? {
              ...current,
              status: 'stopped',
              infrastructure: {
                ...current.infrastructure,
                aci: {
                  ...current.infrastructure?.aci,
                  status: 'stopped',
                },
              },
              metadata: { ...current.metadata, containerStatus: 'stopped' },
            }
          : current);
        setActionMessage(isAzureDeployment ? 'Azure container suspended. Compute billing paused.' : 'Deployment stopped. Its configuration and image are retained.');
      } else if (action === 'restart') {
        await (isAzureDeployment ? deploymentService.start(deploymentKey) : deploymentService.restart(deploymentKey));
        setDeployment((current) => current
          ? {
              ...current,
              status: 'running',
              infrastructure: {
                ...current.infrastructure,
                aci: {
                  ...current.infrastructure?.aci,
                  status: 'running',
                },
              },
              metadata: { ...current.metadata, containerStatus: 'running' },
            }
          : current);
        setActionMessage(isAzureDeployment ? 'Azure container resumed and running.' : 'Deployment restarted.');
      } else if (action === 'terminate') {
        if (isAzureDeployment) {
          await deploymentService.terminateAzureDeployment(deploymentKey);
        } else {
          await deploymentService.delete(deploymentKey);
        }
        setDeployment((current) => current
          ? {
              ...current,
              status: 'closed',
              phase: 'complete',
              publicUrl: undefined,
              infrastructure: {
                ...current.infrastructure,
                aci: {
                  ...current.infrastructure?.aci,
                  status: 'deleted',
                },
              },
            }
          : current);
        setActionMessage(isAzureDeployment ? 'Azure Container Group terminated and removed.' : 'Deployment terminated and closed.');
      }
    } catch (actionError: any) {
      setError(actionError?.response?.data?.error || actionError?.message || `Unable to ${action} deployment.`);
    } finally {
      setLifecycleBusy(false);
      setConfirmLifecycleAction(null);
    }
  };

  const handleBringDown = async () => {
    if (!deploymentInstanceId) {
      setError('No EC2 instance id found for this deployment.');
      return;
    }

    const effectiveEcrRepositoryName =
      infrastructure?.ecr?.repositoryName ||
      (deployment?.repositoryName ? `cloudops-${deployment.repositoryName}`.toLowerCase().substring(0, 256) : undefined);

    try {
      setBringingDown(true);
      setBringDownConfirmOpen(false); 
      

      await deploymentService.terminateAwsDeployment(deploymentInstanceId, {
        repositoryName: effectiveEcrRepositoryName,
        cleanupECR: true,
        deploymentId: deployment?._id,
      });

      setDeployment((current) =>
        current
          ? {
              ...current,
              status: 'closed',
              phase: 'complete',
              publicUrl: undefined,
              domainUrl: undefined,
              metadata: { ...current.metadata, liveUrl: undefined },
            }
          : current
      );
      setActionMessage('AWS resources terminated and the deployment was closed.');
    } catch (err: any) {
      console.error('Bring down error:', err);
      setError(err?.response?.data?.error || err?.message || 'Failed to bring down deployment');
    } finally {
      setBringingDown(false);
    }
  };

  return (
    <>
      <main className="min-h-screen bg-[#070707] py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => navigate('/deployments')}
            className="inline-flex items-center gap-2 border border-white/10 bg-[#101010] px-3 py-2 text-xs font-medium text-neutral-300 transition hover:border-white/25 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to deployments
          </button>

          {error && (
            <div className="mt-4 flex items-start gap-3 border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {actionMessage && (
            <div role="status" className="mt-4 border border-emerald-400/30 bg-emerald-400/[0.05] px-4 py-3 text-sm text-emerald-300">
              {actionMessage}
            </div>
          )}

          {deployment && (
            <nav aria-label="Deployment sections" className="mt-4 flex min-w-0 overflow-x-auto border border-white/10 bg-[#0C0C0C]">
              {[
                { label: 'Overview', id: 'deployment-overview' },
                { label: 'Progress', id: 'deployment-progress' },
                { label: 'Logs', id: 'deployment-logs' },
                { label: 'Source & build', id: 'deployment-source', metadata: true },
                { label: 'Infrastructure', id: 'deployment-infrastructure', metadata: true },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => focusSection(item.id, item.metadata)}
                  className="shrink-0 border-r border-white/[0.07] px-3 py-3 text-xs font-medium text-neutral-500 transition hover:bg-white/[0.03] hover:text-white sm:px-4"
                >
                  {item.label}
                </button>
              ))}
            </nav>
          )}

          {loading && !deployment ? (
            <div className="mt-8 space-y-4">
              <div className="h-48 animate-pulse border border-white/10 bg-[#101010]" />
              <div className="h-[420px] animate-pulse border border-white/10 bg-[#0C0C0C]" />
            </div>
          ) : deployment ? (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mt-5 space-y-4">
              <div className="min-w-0 space-y-4">
                <div id="deployment-overview" className="min-w-0 scroll-mt-20 border border-white/10 bg-[#0C0C0C] p-4 sm:p-5">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
                        <HardDriveDownload className="h-3.5 w-3.5 text-emerald-400" />
                        {deploymentProvider} deployment
                        <span className="text-neutral-700">/</span>
                        <span className="font-mono tracking-normal">{deploymentKey.slice(-8)}</span>
                      </div>
                      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                        {deployment.repositoryName || 'Deployment'}
                      </h1>
                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-neutral-400">
                        <span className={`inline-flex items-center gap-1.5 border px-2 py-1 text-[10px] font-semibold uppercase tracking-wider ${badgeClass}`}>
                          <span className={`h-1.5 w-1.5 ${status === 'success' ? 'bg-emerald-400' : status === 'failed' ? 'bg-destructive' : 'bg-amber-300'}`} />
                          {status}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <GitBranch className="h-4 w-4" />
                          {deployment.branch || 'main'}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <Clock3 className="h-4 w-4" />
                          {formatDuration(deployment.totalTime)}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {liveUrl ? (
                        <a
                          href={liveUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-2 border border-emerald-400/40 bg-emerald-400/[0.08] px-4 py-3 text-sm font-medium text-emerald-300 transition hover:bg-emerald-400/[0.14]"
                        >
                          <Globe2 className="h-4 w-4" />
                          Open live site
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      ) : (
                        <div className="border border-white/10 bg-[#101010] px-4 py-3 text-xs text-neutral-500">
                          Live URL pending
                        </div>
                      )}
                      {canCancel && (
                        <button
                          type="button"
                          disabled={lifecycleBusy}
                          onClick={() => setConfirmLifecycleAction('cancel')}
                          className="inline-flex items-center gap-2 border border-amber-400/40 bg-amber-400/10 px-3.5 py-2 text-xs font-medium text-amber-300 transition hover:bg-amber-400/20 disabled:opacity-50"
                        >
                          {lifecycleBusy && confirmLifecycleAction === 'cancel' ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Ban className="h-3.5 w-3.5" />
                          )}
                          Cancel deployment
                        </button>
                      )}

                      {canStopContainer && (
                        <button
                          type="button"
                          disabled={lifecycleBusy}
                          onClick={() => setConfirmLifecycleAction('stop')}
                          className="inline-flex items-center gap-2 border border-amber-400/30 bg-[#141414] px-3.5 py-2 text-xs font-medium text-amber-300 transition hover:bg-amber-400/10 disabled:opacity-50"
                        >
                          {lifecycleBusy && confirmLifecycleAction === 'stop' ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Pause className="h-3.5 w-3.5" />
                          )}
                          {isAzureDeployment ? 'Pause compute ($0/hr)' : 'Stop container'}
                        </button>
                      )}

                      {canRestartContainer && (
                        <button
                          type="button"
                          disabled={lifecycleBusy}
                          onClick={() => setConfirmLifecycleAction('restart')}
                          className="inline-flex items-center gap-2 border border-emerald-400/40 bg-emerald-400/10 px-3.5 py-2 text-xs font-medium text-emerald-300 transition hover:bg-emerald-400/20 disabled:opacity-50"
                        >
                          {lifecycleBusy && confirmLifecycleAction === 'restart' ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Play className="h-3.5 w-3.5" />
                          )}
                          {isAzureDeployment ? 'Resume container' : 'Restart container'}
                        </button>
                      )}

                      {(canTerminateAzure || canTerminateGeneric) && (
                        <button
                          type="button"
                          disabled={lifecycleBusy}
                          onClick={() => setConfirmLifecycleAction('terminate')}
                          className="inline-flex items-center gap-2 border border-destructive/40 bg-destructive/10 px-3.5 py-2 text-xs font-medium text-destructive transition hover:bg-destructive/20 disabled:opacity-50"
                        >
                          {lifecycleBusy && confirmLifecycleAction === 'terminate' ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                          {isAzureDeployment ? 'Terminate Azure' : 'Terminate'}
                        </button>
                      )}

                      {canTerminateAws && (
                        <button
                          type="button"
                          disabled={bringingDown}
                          onClick={() => setBringDownConfirmOpen(true)}
                          className="inline-flex items-center gap-2 border border-destructive/40 bg-destructive/10 px-3.5 py-2 text-xs font-medium text-destructive transition hover:bg-destructive/20 disabled:opacity-50"
                        >
                          {bringingDown ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Power className="h-3.5 w-3.5" />
                          )}
                          Terminate AWS
                        </button>
                      )}
                  </div>
                  </div>

                  <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                    {[
                      { label: 'Application', value: deployment.applicationName || deployment.repositoryName || 'Unknown' },
                      { label: 'Runtime', value: deployment.framework || metadata?.framework || 'Auto-detected' },
                      { label: 'Health', value: deployment.healthStatus || 'Unknown' },
                      { label: 'Region', value: infrastructure?.region || azureAciLocation || metadata?.target?.awsRegion || 'Managed' },
                    ].map((item) => (
                      <div key={item.label} className="min-w-0 border border-white/[0.07] bg-[#101010] px-3 py-2.5">
                        <div className="text-[9px] font-medium uppercase tracking-[0.16em] text-neutral-600">{item.label}</div>
                        <div className="mt-1 truncate text-xs font-medium text-neutral-200">{item.value}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {deployment.error?.message && (
                  <div className="flex items-start gap-3 border border-destructive/40 bg-destructive/[0.06] p-4 text-sm text-destructive">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <div>
                      <div className="font-semibold">Deployment failed</div>
                      <p className="mt-1 text-xs leading-5">{deployment.error.message}</p>
                    </div>
                  </div>
                )}

                <div id="deployment-progress" className="min-w-0 scroll-mt-20 border border-white/10 bg-[#0C0C0C] p-4 sm:p-5">
                  <h2 className="text-sm font-semibold text-white">Build progress</h2>
                  <div className="mt-4">
                    <LiveProgressBar steps={activeSteps} current={currentStep} progress={progress} />
                  </div>
                  <details className="mt-4 border-t border-white/[0.07] pt-3">
                    <summary className="cursor-pointer text-xs font-medium text-neutral-500 transition hover:text-neutral-200">
                      View all deployment steps
                    </summary>
                    <div className="mt-4">
                      <DeploymentTimeline steps={timeline as any} />
                    </div>
                  </details>
                </div>

                <div id="deployment-logs" className="min-w-0 scroll-mt-20 border border-white/10 bg-[#0C0C0C] p-4 sm:p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h2 className="text-sm font-semibold text-white">Build logs</h2>
                      <p className="mt-1 text-[11px] text-neutral-500">Live output from this deployment</p>
                    </div>
                    <span className="font-mono text-[10px] uppercase tracking-wider text-neutral-600">
                      {logs.length} {logs.length === 1 ? 'entry' : 'entries'}
                    </span>
                  </div>
                  <div className="mt-3">
                    {loading ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading logs...
                      </div>
                    ) : renderedLogs.length > 0 ? (
                      <TerminalStream logs={renderedLogs} />
                    ) : (
                      <div className="border border-white/10 bg-[#101010] px-4 py-3 text-sm text-neutral-500">
                        {deployment.status === 'building' || deployment.status === 'deploying'
                          ? 'Waiting for deployment logs...'
                          : deployment.error?.message || 'No logs recorded for this deployment.'}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <details open={showMetadata} onToggle={(event) => setShowMetadata(event.currentTarget.open)} className="group scroll-mt-20 border border-white/10 bg-[#0C0C0C]">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-4 text-sm font-medium text-neutral-300 transition hover:text-white sm:px-5">
                  <span>Repository, build and infrastructure details</span>
                  <span className="text-[10px] uppercase tracking-wider text-neutral-600 group-open:hidden">Show</span>
                  <span className="hidden text-[10px] uppercase tracking-wider text-neutral-600 group-open:inline">Hide</span>
                </summary>
                <div className="space-y-4 border-t border-white/[0.07] p-4 sm:p-5">
                <div id="deployment-source" className="min-w-0 scroll-mt-20 border border-white/[0.07] bg-[#0A0A0A] p-4">
                  <h2 className="text-sm font-semibold text-neutral-200">Project info</h2>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                    {[
                      { label: 'Repository name', value: deployment.repositoryName || 'Unknown' },
                      { label: 'Repository URL', value: deployment.repositoryUrl || 'Unknown' },
                      { label: 'Branch', value: deployment.branch || 'main' },
                      { label: 'User ID', value: deployment.userId || 'Unknown' },
                      { label: 'Project ID', value: deployment.projectId || 'Not linked' },
                    ].map((item) => (
                      <div key={item.label} className="min-w-0 border border-border bg-secondary px-4 py-3">
                        <div className="text-[11px] uppercase tracking-[0.22em] text-foreground/40">{item.label}</div>
                        <div className="mt-2 break-words text-sm text-foreground">{item.value}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div id="deployment-infrastructure" className="min-w-0 scroll-mt-20 border border-white/[0.07] bg-[#0A0A0A] p-4">
                  <h2 className="text-sm font-semibold text-neutral-200">Source and build</h2>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {[
                      { label: 'Last commit', value: `${commitHash} ${fullCommitHash !== commitHash ? `(${fullCommitHash})` : ''}`.trim() },
                      { label: 'Commit author', value: commitAuthor },
                      { label: 'Commit message', value: commitMessage },
                      { label: 'Commit date', value: formatDate(commitDate) },
                      { label: 'Framework', value: deployment.framework || metadata?.framework || 'auto-detected' },
                      { label: 'Docker image tag', value: ecrImageTag },
                      { label: 'Docker image URI', value: ecrImageUri },
                      { label: 'Docker build time', value: dockerBuildTime ? formatDuration(dockerBuildTime) : 'Pending' },
                      { label: 'Docker image size', value: dockerImageSize ? `${(dockerImageSize / (1024 * 1024)).toFixed(2)} MB` : 'Pending' },
                    ].map((item) => (
                      <div key={item.label} className="min-w-0 border border-border bg-secondary px-4 py-3">
                        <div className="text-[11px] uppercase tracking-[0.22em] text-foreground/40">{item.label}</div>
                        <div className="mt-2 break-all text-sm font-medium text-foreground">{item.value}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="min-w-0 border border-white/[0.07] bg-[#0A0A0A] p-4">
                  <h2 className="mb-4 text-sm font-semibold text-neutral-200">Infrastructure details</h2>
                  {isAzureDeployment && (
                    <div className="mb-5 border border-primary/20 bg-primary/[0.04] p-3 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <span className={`h-2 w-2 rounded-full ${['running', 'success'].includes(status) ? 'bg-emerald-400' : status === 'stopped' ? 'bg-amber-400' : 'bg-neutral-500'}`} />
                          <span className="font-medium text-neutral-200">
                            {status === 'stopped' ? 'Azure Container Group is Suspended' : status === 'closed' ? 'Azure Container Group is Terminated' : 'Azure Container Group is Active'}
                          </span>
                          <span className="text-neutral-400">
                            {status === 'stopped' ? '(Compute billing paused: $0/hr)' : status === 'closed' ? '(Resources deleted)' : '(Billed per second of compute)'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {canStopContainer && (
                            <button
                              type="button"
                              disabled={lifecycleBusy}
                              onClick={() => setConfirmLifecycleAction('stop')}
                              className="inline-flex items-center gap-1 border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-[11px] font-medium text-amber-300 transition hover:bg-amber-400/20 disabled:opacity-50"
                            >
                              <Pause className="h-3 w-3" />
                              Pause compute
                            </button>
                          )}
                          {canRestartContainer && (
                            <button
                              type="button"
                              disabled={lifecycleBusy}
                              onClick={() => setConfirmLifecycleAction('restart')}
                              className="inline-flex items-center gap-1 border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-medium text-emerald-300 transition hover:bg-emerald-400/20 disabled:opacity-50"
                            >
                              <Play className="h-3 w-3" />
                              Resume container
                            </button>
                          )}
                          {canTerminateAzure && (
                            <button
                              type="button"
                              disabled={lifecycleBusy}
                              onClick={() => setConfirmLifecycleAction('terminate')}
                              className="inline-flex items-center gap-1 border border-destructive/40 bg-destructive/10 px-2.5 py-1 text-[11px] font-medium text-destructive transition hover:bg-destructive/20 disabled:opacity-50"
                            >
                              <Trash2 className="h-3 w-3" />
                              Terminate
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* AWS EC2 Deployment */}
                  {isAwsDeployment && !isStaticDeployment && (
                    <div className="space-y-6">
                      <div className="border-l-2 border-orange-400/30 pl-4">
                        <h3 className="text-sm font-semibold text-orange-400 mb-3">AWS Deployment</h3>
                        <div className="grid gap-3 sm:grid-cols-2">
                          {[
                            { label: 'Region', value: infrastructure?.region || metadata?.target?.awsRegion || 'Pending' },
                            { label: 'Instance ID', value: ec2InstanceId },
                            { label: 'Instance Type', value: infrastructure?.ec2?.instanceType || metadata?.target?.instanceType || 'Pending' },
                            { label: 'Public IP', value: deploymentPublicIp },
                            { label: 'Private IP', value: ec2PrivateIp },
                            { label: 'Key Name', value: infrastructure?.ec2?.keyName || 'Pending' },
                            { label: 'VPC ID', value: infrastructure?.ec2?.vpcId || 'Pending' },
                            { label: 'Security Groups', value: (infrastructure?.ec2?.securityGroupIds || []).join(', ') || 'Pending' },
                          ].map((item) => (
                            <div key={item.label} className="min-w-0 border border-orange-400/10 bg-orange-500/5 px-4 py-3">
                              <div className="text-[11px] uppercase tracking-[0.22em] text-orange-400/60">{item.label}</div>
                              <div className="mt-2 break-all text-sm font-medium text-orange-200">{item.value}</div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="border-l-2 border-warning pl-4">
                        <h3 className="text-sm font-semibold text-warning mb-3">ECR (Docker Registry)</h3>
                        <div className="grid gap-3 sm:grid-cols-2">
                          {[
                            { label: 'Repository Name', value: ecrRepository },
                            { label: 'Repository URI', value: ecrRepositoryUri },
                            { label: 'Image URI', value: ecrImageUri },
                            { label: 'Image Tag', value: ecrImageTag },
                            { label: 'Build Time', value: dockerBuildTime ? formatDuration(dockerBuildTime) : 'Pending' },
                            { label: 'Image Size', value: dockerImageSize ? `${(dockerImageSize / (1024 * 1024)).toFixed(2)} MB` : 'Pending' },
                          ].map((item) => (
                            <div key={item.label} className="min-w-0 border border-warning bg-warning/10 px-4 py-3">
                              <div className="text-[11px] uppercase tracking-[0.22em] text-warning">{item.label}</div>
                              <div className="mt-2 break-all text-sm font-medium text-warning">{item.value}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* S3 Static Deployment */}
                  {isStaticDeployment && (
                    <div className="border-l-2 border-success pl-4">
                      <h3 className="text-sm font-semibold text-success mb-3">S3 Static Hosting</h3>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {[
                          { label: 'Region', value: infrastructure?.region || 'Pending' },
                          { label: 'S3 Bucket', value: s3Bucket },
                          { label: 'Prefix', value: s3Prefix },
                          { label: 'Website URL', value: infrastructure?.s3?.websiteUrl || 'Pending' },
                          { label: 'Public IP', value: deploymentPublicIp },
                          { label: 'Live URL', value: deployment.domainUrl || liveInfrastructureUrl || 'Pending' },
                        ].map((item) => (
                          <div key={item.label} className="min-w-0 border border-success bg-success/10 px-4 py-3">
                            <div className="text-[11px] uppercase tracking-[0.22em] text-success">{item.label}</div>
                            <div className="mt-2 break-all text-sm font-medium text-success">{item.value}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Azure ACI/ACR Deployment */}
                  {isAzureDeployment && (
                    <div className="space-y-6">
                      <div className="border-l-2 border-sky-400/30 pl-4">
                        <h3 className="text-sm font-semibold text-sky-400 mb-3">Azure Container Registry (ACR)</h3>
                        <div className="grid gap-3 sm:grid-cols-2">
                          {[
                            { label: 'Login Server', value: azureAcrLoginServer },
                            { label: 'Repository Name', value: azureAcrRepository },
                            { label: 'Image URI', value: azureAcrImageUri },
                            { label: 'Image Name', value: azureAcrImageName },
                            { label: 'Build Time', value: dockerBuildTime ? formatDuration(dockerBuildTime) : 'Pending' },
                            { label: 'Image Size', value: dockerImageSize ? `${(dockerImageSize / (1024 * 1024)).toFixed(2)} MB` : 'Pending' },
                          ].map((item) => (
                            <div key={item.label} className="min-w-0 border border-border bg-secondary px-4 py-3">
                              <div className="text-[11px] uppercase tracking-[0.22em] text-sky-400/60">{item.label}</div>
                              <div className="mt-2 break-all text-sm font-medium text-sky-200">{item.value}</div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="border-l-2 border-primary pl-4">
                        <h3 className="text-sm font-semibold text-primary mb-3">Azure Container Instances (ACI)</h3>
                        <div className="grid gap-3 sm:grid-cols-2">
                          {[
                            { label: 'Resource Group', value: azureAciResourceGroup },
                            { label: 'Container Group', value: azureAciContainerGroup },
                            { label: 'Container Name', value: containerName },
                            { label: 'Location', value: azureAciLocation },
                            { label: 'CPU', value: azureAciCpu },
                            { label: 'Memory (GB)', value: azureAciMemory },
                            { label: 'FQDN / IP', value: azureAciFqdn },
                            { label: 'Status', value: azureAciStatus },
                          ].map((item) => (
                            <div key={item.label} className="min-w-0 border border-primary bg-primary/10 px-4 py-3">
                              <div className="text-[11px] uppercase tracking-[0.22em] text-primary">{item.label}</div>
                              <div className="mt-2 break-all text-sm font-medium text-primary">{item.value}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Common Info */}
                  <div className="mt-6 border-t border-border pt-6">
                    <h3 className="text-sm font-semibold text-foreground mb-3">General</h3>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {[
                        { label: 'Provider', value: deploymentProvider.toUpperCase() },
                        { label: 'Target Type', value: targetType },
                        { label: 'Container Port', value: containerPort },
                        { label: 'Live URL', value: deployment.domainUrl || liveInfrastructureUrl || 'Pending' },
                        { label: 'Deploy State', value: infrastructure?.deployState || 'Pending' },
                      ].map((item) => (
                        <div key={item.label} className="min-w-0 border border-border bg-secondary px-4 py-3">
                          <div className="text-[11px] uppercase tracking-[0.22em] text-foreground/40">{item.label}</div>
                          <div className="mt-2 break-all text-sm font-medium text-foreground">{item.value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                </div>
              </details>
            </motion.div>
          ) : (
            <div className="mt-8 border border-border bg-card p-10 text-center text-muted-foreground">
              Deployment not found.
            </div>
          )}
        </div>

        {/* Lifecycle Action Modal */}
        {confirmLifecycleAction && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-black/75 backdrop-blur-sm"
              onClick={() => !lifecycleBusy && setConfirmLifecycleAction(null)}
            />
            <div className="relative z-10 w-full max-w-md rounded-2xl border border-white/10 bg-[#0E0E0E] p-6 shadow-2xl">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <h3 className="text-base font-semibold text-white">
                  {confirmLifecycleAction === 'cancel'
                    ? 'Cancel Deployment'
                    : confirmLifecycleAction === 'stop'
                      ? (isAzureDeployment ? 'Pause Compute (Suspend Billing)' : 'Stop Container')
                      : confirmLifecycleAction === 'restart'
                        ? (isAzureDeployment ? 'Resume Container' : 'Restart Container')
                        : 'Terminate Deployment & Resources'}
                </h3>
                <button
                  type="button"
                  disabled={lifecycleBusy}
                  onClick={() => setConfirmLifecycleAction(null)}
                  className="text-neutral-400 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-4 text-xs leading-relaxed text-neutral-300">
                {confirmLifecycleAction === 'cancel' && (
                  <p>
                    Are you sure you want to cancel this deployment? Any active build, push, or container provisioning jobs will be aborted immediately.
                  </p>
                )}
                {confirmLifecycleAction === 'stop' && (
                  <p>
                    {isAzureDeployment
                      ? 'Suspending this Azure Container Group stops compute billing ($0/hr). Your Docker image in ACR and configuration are retained so you can resume anytime.'
                      : 'Stopping this container will halt execution while preserving the deployment record and build artifact.'}
                  </p>
                )}
                {confirmLifecycleAction === 'restart' && (
                  <p>
                    {isAzureDeployment
                      ? 'Resume this suspended Azure container? Compute will begin running again and your application will be reachable at its public URL.'
                      : 'Restart this container to resume running the application.'}
                  </p>
                )}
                {confirmLifecycleAction === 'terminate' && (
                  <div className="space-y-2">
                    <p className="font-semibold text-destructive">
                      This action is permanent and cannot be undone.
                    </p>
                    <p>
                      {isAzureDeployment
                        ? 'This will permanently delete the Azure Container Group from your Azure subscription. Any ephemeral container state will be lost.'
                        : 'This will permanently terminate and delete this deployment resource.'}
                    </p>
                  </div>
                )}
              </div>

              <div className="mt-6 flex justify-end gap-3 border-t border-white/10 pt-4">
                <button
                  type="button"
                  disabled={lifecycleBusy}
                  onClick={() => setConfirmLifecycleAction(null)}
                  className="border border-white/10 bg-[#161616] px-4 py-2 text-xs font-medium text-neutral-300 hover:text-white"
                >
                  Keep as is
                </button>
                <button
                  type="button"
                  disabled={lifecycleBusy}
                  onClick={() => void runLifecycleAction(confirmLifecycleAction)}
                  className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium disabled:opacity-50 ${
                    confirmLifecycleAction === 'terminate'
                      ? 'border border-destructive/50 bg-destructive text-destructive-foreground hover:bg-destructive/90'
                      : confirmLifecycleAction === 'stop'
                        ? 'border border-amber-400/50 bg-amber-500 text-black font-semibold hover:bg-amber-400'
                        : confirmLifecycleAction === 'cancel'
                          ? 'border border-amber-400/50 bg-amber-500 text-black font-semibold hover:bg-amber-400'
                          : 'border border-emerald-400/50 bg-emerald-500 text-black font-semibold hover:bg-emerald-400'
                  }`}
                >
                  {lifecycleBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {confirmLifecycleAction === 'terminate'
                    ? 'Confirm Termination'
                    : confirmLifecycleAction === 'cancel'
                      ? 'Confirm Cancel'
                      : confirmLifecycleAction === 'stop'
                        ? 'Confirm Pause'
                        : 'Confirm Resume'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* AWS Bring Down Modal */}
        {bringDownConfirmOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-black/75 backdrop-blur-sm"
              onClick={() => !bringingDown && setBringDownConfirmOpen(false)}
            />
            <div className="relative z-10 w-full max-w-md rounded-2xl border border-white/10 bg-[#0E0E0E] p-6 shadow-2xl">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <h3 className="text-base font-semibold text-white">Terminate AWS Resources</h3>
                <button
                  type="button"
                  disabled={bringingDown}
                  onClick={() => setBringDownConfirmOpen(false)}
                  className="text-neutral-400 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-4 text-xs leading-relaxed text-destructive space-y-2">
                <p className="font-semibold">This action cannot be undone.</p>
                <p className="text-neutral-300">
                  This will terminate the EC2 instance ({deploymentInstanceId}) and delete the associated ECR container image repository.
                </p>
              </div>
              <div className="mt-6 flex justify-end gap-3 border-t border-white/10 pt-4">
                <button
                  type="button"
                  disabled={bringingDown}
                  onClick={() => setBringDownConfirmOpen(false)}
                  className="border border-white/10 bg-[#161616] px-4 py-2 text-xs font-medium text-neutral-300 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={bringingDown}
                  onClick={() => void handleBringDown()}
                  className="inline-flex items-center gap-1.5 border border-destructive/50 bg-destructive px-4 py-2 text-xs font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
                >
                  {bringingDown && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Confirm Termination
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
