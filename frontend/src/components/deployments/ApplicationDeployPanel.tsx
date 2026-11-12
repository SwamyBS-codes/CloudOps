import { useState } from 'react';
import {
  Globe,
  Server,
  Layers,
  Clock,
  DollarSign,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Plus,
  Trash2,
} from 'lucide-react';
import {
  deploymentService,
  type ApplicationScanResult,
  type ApplicationType,
} from '@/services/deployment-service';
import {
  APPLICATION_TYPE_DESCRIPTIONS,
  APPLICATION_TYPE_LABELS,
} from '@/lib/application-types';
import { API_BASE_URL } from '@/lib/constants';
import type { Socket } from 'socket.io-client';

type EnvVar = { id: number; key: string; value: string };

const TYPE_ICONS: Record<ApplicationType, typeof Globe> = {
  'frontend-website': Globe,
  'backend-api': Server,
  'full-stack': Layers,
};

type Props = {
  scan: ApplicationScanResult;
  clonePath: string;
  repositoryUrl: string;
  repositoryName: string;
  repositoryOwner?: string;
  projectId?: string;
  primaryRoot: string;
  onPrimaryRootChange: (root: string) => void;
  onDeploying: () => void;
  onDeploymentStarted?: (deploymentId: string) => void;
  onComplete: (url: string, deploymentId?: string) => void;
  onError: () => void;
  addLog: (text: string, type?: string) => void;
  socketRef: React.RefObject<Socket | null>;
};

export default function ApplicationDeployPanel({
  scan,
  clonePath,
  repositoryUrl,
  repositoryName,
  repositoryOwner,
  projectId,
  primaryRoot,
  onPrimaryRootChange,
  onDeploying,
  onDeploymentStarted,
  onComplete,
  onError,
  addLog,
  socketRef,
}: Props) {
  const [applicationType, setApplicationType] = useState<ApplicationType>(scan.applicationType);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [envVars, setEnvVars] = useState<EnvVar[]>([
    { id: 1, key: 'NODE_ENV', value: 'production' },
    { id: 2, key: 'VITE_API_URL', value: API_BASE_URL },
  ]);
  const [isDeploying, setIsDeploying] = useState(false);

  const recommendation = scan.recommendation;
  const selectedLabel = APPLICATION_TYPE_LABELS[applicationType];
  const SelectedIcon = TYPE_ICONS[applicationType];

  const estimatedCost = recommendation?.estimatedCostMonthlyUsd ?? 0;
  const estimatedMinutes = recommendation?.estimatedDeployMinutes ?? 5;

  const addEnvVar = () => setEnvVars((c) => [...c, { id: Date.now(), key: '', value: '' }]);
  const updateEnvVar = (id: number, field: 'key' | 'value', val: string) =>
    setEnvVars((c) => c.map((v) => (v.id === id ? { ...v, [field]: val } : v)));
  const removeEnvVar = (id: number) => setEnvVars((c) => c.filter((v) => v.id !== id));

  const handleDeploy = async () => {
    setIsDeploying(true);
    onDeploying();
    addLog(`Deploying ${selectedLabel}...`, 'system');

    // Room join happens after deploymentId is returned from the API.

    const environmentVariables = envVars
      .filter((v) => v.key.trim())
      .reduce<Record<string, string>>((acc, v) => {
        acc[v.key.trim()] = v.value;
        return acc;
      }, {});

    const onCompleteEvent = (data: {
      status?: string;
      publicUrl?: string;
      liveUrl?: string;
      publicIp?: string;
      deploymentId?: string;
      error?: string;
    }) => {
      const url = data.publicUrl || data.liveUrl;
      if (data.status === 'success' && url) {
        addLog(`Live at ${url}`, 'success');
        if (data.publicIp) {
          addLog(`Public IP: ${data.publicIp}`, 'success');
        }
        onComplete(url, data.deploymentId);
      } else if (data.status === 'failed') {
        addLog(data.error || 'Deployment failed', 'error');
        if (data.deploymentId) {
          addLog(`View details: /deployments/${data.deploymentId}`, 'info');
        }
        onError();
      }
      socketRef.current?.off('build-complete', onCompleteEvent);
      socketRef.current?.off('deployment-complete', onCompleteEvent);
      setIsDeploying(false);
    };

    socketRef.current?.on('build-complete', onCompleteEvent);
    socketRef.current?.on('deployment-complete', onCompleteEvent);

    try {
      if (applicationType === 'frontend-website' && envVars.some((v) => v.key.trim())) {
        const envContent = envVars
          .filter((v) => v.key.trim())
          .map((v) => `${v.key.trim()}=${v.value}`)
          .join('\n');
        await deploymentService.saveFiles({
          clonePath,
          envPath: '.env',
          envContent,
          rootDirectory: primaryRoot,
          deployType: 'static',
        });
      }

      const result = await deploymentService.deployApplication({
        applicationType,
        repositoryUrl,
        repositoryName,
        repositoryOwner,
        projectId,
        clonePath,
        rootDirectory: primaryRoot,
        primaryRoot,
        environmentVariables,
        applicationName: repositoryName,
        socketId: socketRef.current?.id,
      });

      addLog('Deployment queued successfully', 'success');
      if (result.deploymentId) {
        addLog(`Deployment ID: ${result.deploymentId}`, 'info');
        socketRef.current?.emit('join-deployment', `deployment:${result.deploymentId}`);
        onDeploymentStarted?.(result.deploymentId);
      }

      if (result.deploymentId && applicationType !== 'frontend-website') {
        return;
      }

      if (result.publicUrl) {
        onComplete(result.publicUrl, result.deploymentId);
        setIsDeploying(false);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Deployment failed';
      addLog(message, 'error');
      onError();
      setIsDeploying(false);
      socketRef.current?.off('build-complete', onCompleteEvent);
      socketRef.current?.off('deployment-complete', onCompleteEvent);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-success">
        <Sparkles className="h-4 w-4" />
        <span>CloudOps detected your application</span>
      </div>

      {/* Detected type card */}
      <div className="rounded-xl border border-success bg-success/10 p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/10">
            <SelectedIcon className="h-5 w-5 text-success" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs uppercase tracking-wider text-success">Recommended</p>
            <h3 className="text-base font-semibold text-foreground">{selectedLabel}</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {APPLICATION_TYPE_DESCRIPTIONS[applicationType]}
            </p>
            {scan.detectedFrameworks.length > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                Detected: {scan.detectedFrameworks.join(', ')}
              </p>
            )}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-secondary px-3 py-2">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <DollarSign className="h-3.5 w-3.5" /> Est. monthly cost
            </div>
            <p className="mt-1 text-sm font-medium text-foreground">~${estimatedCost}/mo</p>
          </div>
          <div className="rounded-lg bg-secondary px-3 py-2">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" /> Est. deploy time
            </div>
            <p className="mt-1 text-sm font-medium text-foreground">~{estimatedMinutes} min</p>
          </div>
        </div>

        <p className="mt-3 text-xs text-success">
          {recommendation?.userFacingSummary || 'Optimized hosting selected for your app'}
        </p>
      </div>

      {/* Override application type */}
      <div>
        <label className="mb-2 block text-xs font-medium text-muted-foreground">Application type</label>
        <div className="grid gap-2">
          {(Object.keys(APPLICATION_TYPE_LABELS) as ApplicationType[]).map((type) => {
            const Icon = TYPE_ICONS[type];
            const isSelected = applicationType === type;
            return (
              <button
                key={type}
                type="button"
                onClick={() => setApplicationType(type)}
                className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition ${
                  isSelected
                    ? 'border-success bg-success/10 text-foreground'
                    : 'border-border bg-secondary text-foreground hover:border-border'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <div>
                  <div className="font-medium">{APPLICATION_TYPE_LABELS[type]}</div>
                  <div className="text-xs opacity-70">{APPLICATION_TYPE_DESCRIPTIONS[type]}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Root directory for frontend */}
      {applicationType === 'frontend-website' && scan.suggestedRoots.length > 1 && (
        <div>
          <label className="mb-2 block text-xs font-medium text-muted-foreground">Project folder</label>
          <select
            value={primaryRoot}
            onChange={(e) => onPrimaryRootChange(e.target.value)}
            className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-xs focus:border-success outline-none"
          >
            {scan.suggestedRoots.map((root) => (
              <option key={root.path} value={root.path}>
                {root.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Env vars for frontend builds */}
      {applicationType === 'frontend-website' && (
        <div>
          <label className="mb-2 block text-xs font-medium text-muted-foreground">
            Build environment variables
          </label>
          <div className="max-h-32 space-y-2 overflow-y-auto">
            {envVars.map((v) => (
              <div key={v.id} className="flex gap-2">
                <input
                  type="text"
                  value={v.key}
                  onChange={(e) => updateEnvVar(v.id, 'key', e.target.value)}
                  placeholder="VITE_API_URL"
                  className="flex-1 rounded-lg border border-border bg-secondary px-2 py-1.5 text-xs font-mono outline-none focus:border-success"
                />
                <input
                  type="text"
                  value={v.value}
                  onChange={(e) => updateEnvVar(v.id, 'value', e.target.value)}
                  placeholder="value"
                  className="flex-1 rounded-lg border border-border bg-secondary px-2 py-1.5 text-xs font-mono outline-none focus:border-success"
                />
                <button
                  type="button"
                  onClick={() => removeEnvVar(v.id)}
                  className="text-foreground/40 hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addEnvVar}
            className="mt-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" /> Add variable
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={handleDeploy}
        disabled={isDeploying}
        className="w-full rounded-lg bg-success/10 py-2.5 text-sm font-semibold text-success transition hover:bg-success/90 disabled:opacity-50"
      >
        {isDeploying ? 'Deploying...' : `Deploy ${selectedLabel}`}
      </button>

      <button
        type="button"
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="flex w-full items-center justify-center gap-1 text-xs text-foreground/40 hover:text-muted-foreground"
      >
        {showAdvanced ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        Advanced settings
      </button>

      {showAdvanced && (
        <div className="rounded-lg border border-border bg-secondary p-3 text-xs text-muted-foreground">
          Infrastructure is managed automatically. CloudOps maps your application type to the best
          hosting option. Contact your administrator to override provider settings.
        </div>
      )}
    </div>
  );
}
