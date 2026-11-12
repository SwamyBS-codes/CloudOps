import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import {
  AlertTriangle,
  ArrowLeft,
  Clock3,
  ExternalLink,
  GitBranch,
  Globe2,
  HardDriveDownload,
  Loader2,
} from 'lucide-react';
import { deploymentService } from '@/services/auth-service';
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

  const deploymentKey = deployment?._id || deployment?.deploymentId || '';
  const metadata = (deployment?.metadata || {}) as Record<string, any>;
  const infrastructure = (deployment?.infrastructure || metadata.infrastructure || {}) as NonNullable<DeploymentDetails['infrastructure']> & Record<string, any>;
  const deploymentProvider = deployment?.deploymentService || infrastructure?.provider || 'aws';
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
    deploymentProvider === 's3-static'
    || infrastructure?.targetType === 's3-static'
    || deployment?.applicationType === 'frontend-website';
  const isAwsDeployment =
    !isStaticDeployment
    && (deploymentProvider === 'aws' || infrastructure?.provider === 'aws' || infrastructure?.targetType === 'aws');
  const isAzureDeployment = deploymentProvider === 'azure' || infrastructure?.provider === 'azure' || infrastructure?.targetType === 'azure';
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
      const terminal = deployment?.status && ['success', 'failed', 'cancelled'].includes(deployment.status);
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

    const socketUrl = (import.meta.env.VITE_API_URL as string) || 'http://localhost:5000';
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

  const liveUrl = deployment?.publicUrl || deployment?.metadata?.liveUrl;
  const status = deployment?.status || 'pending';
  const badgeClass = statusStyles[status] || statusStyles.pending;
  const deploymentInstanceId = infrastructure?.ec2?.instanceId || (deployment?.metadata as any)?.ec2InstanceId || '';

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
            }
          : current
      );
    } catch (err: any) {
      console.error('Bring down error:', err);
      setError(err?.response?.data?.error || err?.message || 'Failed to bring down deployment');
    } finally {
      setBringingDown(false);
    }
  };

  return (
    <>
      <main className="space-y-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => navigate('/deployments')}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-secondary px-3 py-2 text-sm text-foreground transition hover:bg-secondary"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to deployments
          </button>

          {error && (
            <div className="mt-4 flex items-start gap-3 rounded-2xl border border-destructive bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {loading && !deployment ? (
            <div className="mt-8 grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
              <div className="h-[560px] animate-pulse rounded-3xl border border-border bg-secondary" />
              <div className="h-[560px] animate-pulse rounded-3xl border border-border bg-secondary" />
            </div>
          ) : deployment ? (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
              <div className="min-w-0 space-y-6">
                <div className="min-w-0 rounded-3xl border border-border bg-card p-5 ">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div>
                      <div className="inline-flex items-center gap-2 rounded-full border border-border bg-secondary px-3 py-1 text-xs uppercase tracking-[0.24em] text-muted-foreground">
                        <HardDriveDownload className="h-3.5 w-3.5" />
                        Deployment details
                      </div>
                      <h1 className="mt-4 text-3xl font-semibold text-foreground">
                        {deployment.repositoryName || 'Deployment'}
                      </h1>
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                        <span className={`rounded-full border px-3 py-1 text-xs font-medium capitalize ${badgeClass}`}>{status}</span>
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

                    {liveUrl ? (
                      <a
                        href={liveUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded-2xl border border-primary bg-primary/10 px-4 py-3 text-sm font-medium text-primary transition hover:bg-primary/90"
                      >
                        <Globe2 className="h-4 w-4" />
                        Open live URL
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    ) : (
                      <div className="rounded-2xl border border-border bg-secondary px-4 py-3 text-sm text-muted-foreground">
                        Live URL will appear after the deployment finishes.
                      </div>
                    )}
                    {isAwsDeployment && deployment.status === 'success' && (
                      <div className="mt-3 space-y-3">
                        <button
                          type="button"
                          disabled={bringingDown}
                          onClick={() => setBringDownConfirmOpen(true)}
                          className="ml-3 inline-flex items-center gap-2 rounded-2xl border border-destructive bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive transition hover:bg-destructive/90"
                        >
                          {bringingDown ? 'Bringing down…' : 'Bring Down'}
                        </button>
                        {bringDownConfirmOpen && !bringingDown && (
                          <div className="rounded-2xl border border-destructive bg-destructive/10 p-4 text-sm text-destructive">
                            <div className="font-medium">Terminate the EC2 instance and clean up the ECR repository?</div>
                            <div className="mt-3 flex flex-wrap gap-3">
                              <button
                                type="button"
                                onClick={() => void handleBringDown()}
                                className="rounded-xl bg-destructive px-4 py-2 font-medium text-destructive-foreground transition hover:bg-destructive/90"
                              >
                                Confirm bring down
                              </button>
                              <button
                                type="button"
                                onClick={() => setBringDownConfirmOpen(false)}
                                className="rounded-xl border border-border bg-secondary px-4 py-2 font-medium text-foreground transition hover:bg-secondary"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    {isAzureDeployment && deployment.status === 'success' && (
                      <div className="mt-3 rounded-2xl border border-primary bg-primary/10 p-4 text-sm text-primary">
                        Azure deployments are managed through ACI/ACR. Use the Azure Portal to terminate resources.
                      </div>
                    )}
                  </div>

                  <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {[
                      { label: 'Deployment ID', value: deploymentKey },
                      { label: 'Application', value: deployment.applicationName || deployment.repositoryName || 'Unknown' },
                      { label: 'Application type', value: deployment.applicationType || 'Not set' },
                      { label: 'Project ID', value: deployment.projectId || 'Not linked' },
                      { label: 'Framework', value: deployment.framework || 'auto-detected' },
                      { label: 'Health', value: deployment.healthStatus || 'unknown' },
                      { label: 'Started at', value: formatDate(deployment.startedAt || deployment.createdAt) },
                      { label: 'Completed at', value: formatDate(deployment.completedAt) },
                      { label: 'Phase', value: deployment.phase || 'preparation' },
                      { label: 'Live URL', value: deployment.domainUrl || liveInfrastructureUrl || 'Pending' },
                    ].map((item) => (
                      <div key={item.label} className="min-w-0 rounded-2xl border border-border bg-secondary px-4 py-3">
                        <div className="text-[11px] uppercase tracking-[0.22em] text-foreground/40">{item.label}</div>
                        <div className="mt-2 break-words text-sm font-medium text-foreground">{item.value}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="min-w-0 rounded-3xl border border-border bg-card p-5 ">
                  <h2 className="text-lg font-semibold text-foreground">Progress</h2>
                  <div className="mt-4">
                    <LiveProgressBar steps={activeSteps} current={currentStep} progress={progress} />
                  </div>
                  <div className="mt-6">
                    <DeploymentTimeline steps={timeline as any} />
                  </div>
                </div>

                <div className="min-w-0 rounded-3xl border border-border bg-card p-5 ">
                  <h2 className="text-lg font-semibold text-foreground">Deployment logs</h2>
                  <div className="mt-4">
                    {loading ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading logs...
                      </div>
                    ) : renderedLogs.length > 0 ? (
                      <TerminalStream logs={renderedLogs} />
                    ) : (
                      <div className="rounded-xl border border-border bg-secondary px-4 py-3 text-sm text-muted-foreground">
                        {deployment.status === 'building' || deployment.status === 'deploying'
                          ? 'Waiting for deployment logs...'
                          : deployment.error?.message || 'No logs recorded for this deployment.'}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="min-w-0 space-y-6">
                <div className="min-w-0 rounded-3xl border border-border bg-card p-5 ">
                  <h2 className="text-lg font-semibold text-foreground">Project info</h2>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                    {[
                      { label: 'Repository name', value: deployment.repositoryName || 'Unknown' },
                      { label: 'Repository URL', value: deployment.repositoryUrl || 'Unknown' },
                      { label: 'Branch', value: deployment.branch || 'main' },
                      { label: 'User ID', value: deployment.userId || 'Unknown' },
                      { label: 'Project ID', value: deployment.projectId || 'Not linked' },
                    ].map((item) => (
                      <div key={item.label} className="min-w-0 rounded-2xl border border-border bg-secondary px-4 py-3">
                        <div className="text-[11px] uppercase tracking-[0.22em] text-foreground/40">{item.label}</div>
                        <div className="mt-2 break-words text-sm text-foreground">{item.value}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="min-w-0 rounded-3xl border border-border bg-card p-5 ">
                  <h2 className="text-lg font-semibold text-foreground">Source and build</h2>
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
                      <div key={item.label} className="min-w-0 rounded-2xl border border-border bg-secondary px-4 py-3">
                        <div className="text-[11px] uppercase tracking-[0.22em] text-foreground/40">{item.label}</div>
                        <div className="mt-2 break-all text-sm font-medium text-foreground">{item.value}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="min-w-0 rounded-3xl border border-border bg-card p-5 ">
                  <h2 className="text-lg font-semibold text-foreground mb-4">Infrastructure Details</h2>
                  
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
                            <div key={item.label} className="min-w-0 rounded-2xl border border-orange-400/10 bg-orange-500/5 px-4 py-3">
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
                            <div key={item.label} className="min-w-0 rounded-2xl border border-warning bg-warning/10 px-4 py-3">
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
                          <div key={item.label} className="min-w-0 rounded-2xl border border-success bg-success/10 px-4 py-3">
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
                            <div key={item.label} className="min-w-0 rounded-2xl border border-border bg-secondary px-4 py-3">
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
                            <div key={item.label} className="min-w-0 rounded-2xl border border-primary bg-primary/10 px-4 py-3">
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
                        <div key={item.label} className="min-w-0 rounded-2xl border border-border bg-secondary px-4 py-3">
                          <div className="text-[11px] uppercase tracking-[0.22em] text-foreground/40">{item.label}</div>
                          <div className="mt-2 break-all text-sm font-medium text-foreground">{item.value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {deployment.error?.message && (
                  <div className="min-w-0 rounded-3xl border border-destructive bg-destructive/10 p-5 ">
                    <div className="flex items-center gap-2 text-destructive">
                      <AlertTriangle className="h-5 w-5" />
                      <h2 className="text-lg font-semibold">Failure details</h2>
                    </div>
                    <p className="mt-3 text-sm text-destructive">{deployment.error.message}</p>
                  </div>
                )}
              </div>
            </motion.div>
          ) : (
            <div className="mt-8 rounded-3xl border border-border bg-card p-10 text-center text-muted-foreground">
              Deployment not found.
            </div>
          )}
        </div>
      </main>
    </>
  );
}
