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
  onDeploymentQueued: () => void;
  onDeploymentStarted?: (deploymentId: string) => void;
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
  onDeploymentQueued,
  onDeploymentStarted,
  onError,
  addLog,
  socketRef,
}: Props) {
  const [applicationType, setApplicationType] = useState<ApplicationType>(scan.applicationType);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [envVars, setEnvVars] = useState<EnvVar[]>(() => [
    { id: 1, key: 'NODE_ENV', value: 'production' },
    ...(scan.applicationType === 'frontend-website' ? [{ id: 2, key: 'VITE_API_URL', value: API_BASE_URL }] : []),
  ]);
  const [isDeploying, setIsDeploying] = useState(false);
  const [envError, setEnvError] = useState<string | null>(null);

  const recommendation = scan.recommendation;
  const selectedLabel = APPLICATION_TYPE_LABELS[applicationType];
  const DetectedIcon = TYPE_ICONS[scan.applicationType];
  const detectedLabel = APPLICATION_TYPE_LABELS[scan.applicationType];

  const estimatedCost = recommendation?.estimatedCostMonthlyUsd ?? 0;
  const estimatedMinutes = recommendation?.estimatedDeployMinutes ?? 5;

  const addEnvVar = () => setEnvVars((c) => [...c, { id: Date.now(), key: '', value: '' }]);
  const updateEnvVar = (id: number, field: 'key' | 'value', val: string) =>
    setEnvVars((c) => c.map((v) => (v.id === id ? { ...v, [field]: val } : v)));
  const removeEnvVar = (id: number) => setEnvVars((c) => c.filter((v) => v.id !== id));

  const getEnvironmentVariables = () => {
    const populated = envVars.filter((variable) => variable.key.trim() || variable.value.trim());
    const invalidKey = populated.find((variable) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(variable.key.trim()));
    if (invalidKey) {
      setEnvError('Use a valid variable name (letters, numbers, and underscores; it cannot start with a number).');
      return null;
    }

    const keys = populated.map((variable) => variable.key.trim());
    if (new Set(keys).size !== keys.length) {
      setEnvError('Variable names must be unique.');
      return null;
    }

    setEnvError(null);
    return populated.reduce<Record<string, string>>((acc, variable) => {
      acc[variable.key.trim()] = variable.value;
      return acc;
    }, {});
  };

  const handleDeploy = async () => {
    const environmentVariables = getEnvironmentVariables();
    if (!environmentVariables) return;

    setIsDeploying(true);
    onDeploying();
    addLog(`Deploying ${selectedLabel}...`, 'system');

    try {
      if (applicationType === 'frontend-website' && Object.keys(environmentVariables).length > 0) {
        const envContent = Object.entries(environmentVariables)
          .map(([key, value]) => `${key}=${value}`)
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

      onDeploymentQueued();
      addLog('Deployment queued successfully', 'success');
      if (result.deploymentId) {
        addLog(`Deployment ID: ${result.deploymentId}`, 'info');
        socketRef.current?.emit('join-deployment', `deployment:${result.deploymentId}`);
        onDeploymentStarted?.(result.deploymentId);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Deployment failed';
      addLog(message, 'error');
      onError();
      setIsDeploying(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div data-setup-section="runtime">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Deployment setup</p>
          <h2 className="mt-1 text-base font-semibold text-white">Choose how to run this project</h2>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 border border-emerald-400/20 bg-emerald-400/[0.06] px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-emerald-300">
          <Sparkles className="h-3 w-3" />
          {Math.round((scan.confidence || 0) * 100)}% match
        </span>
      </div>

      {/* Detected type card */}
      <div data-setup-section="hosting" className="scroll-mt-20 border-l-2 border-emerald-400 bg-[#111111] px-3 py-3">
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center border border-emerald-400/20 bg-emerald-400/[0.06]">
            <DetectedIcon className="h-4 w-4 text-emerald-300" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-300">Recommended configuration</p>
            <h3 className="mt-0.5 text-sm font-semibold text-white">{detectedLabel}</h3>
            <p className="mt-1 text-[11px] leading-4 text-neutral-400">
              {APPLICATION_TYPE_DESCRIPTIONS[scan.applicationType]}
            </p>
            {scan.detectedFrameworks.length > 0 && (
              <p className="mt-1.5 truncate font-mono text-[10px] text-neutral-500" title={scan.detectedFrameworks.join(', ')}>
                STACK / {scan.detectedFrameworks.join(' · ')}
              </p>
            )}
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 border-t border-white/[0.07] pt-3">
          <div className="px-1">
            <div className="flex items-center gap-1.5 text-[10px] text-neutral-500">
              <DollarSign className="h-3.5 w-3.5" /> Est. monthly cost
            </div>
            <p className="mt-1 font-mono text-sm font-semibold text-neutral-100">~${estimatedCost}<span className="ml-1 text-[10px] font-normal text-neutral-500">/mo</span></p>
          </div>
          <div className="border-l border-white/[0.07] px-3">
            <div className="flex items-center gap-1.5 text-[10px] text-neutral-500">
              <Clock className="h-3.5 w-3.5" /> Est. deploy time
            </div>
            <p className="mt-1 font-mono text-sm font-semibold text-neutral-100">~{estimatedMinutes}<span className="ml-1 text-[10px] font-normal text-neutral-500">min</span></p>
          </div>
        </div>

        <p className="mt-2 text-[10px] leading-4 text-neutral-500">
          {recommendation?.userFacingSummary || 'Optimized hosting selected for your app'}
        </p>
      </div>

      {/* Override application type */}
      <div>
        <div className="mb-2 flex items-center justify-between gap-3">
          <label className="block text-xs font-medium text-neutral-300">Application type</label>
          <span className="text-[10px] text-neutral-600">Select a deployment target</span>
        </div>
        <div
          className="grid gap-2"
          style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 145px), 1fr))' }}
        >
          {(Object.keys(APPLICATION_TYPE_LABELS) as ApplicationType[]).map((type) => {
            const Icon = TYPE_ICONS[type];
            const isSelected = applicationType === type;
            return (
              <button
                key={type}
                type="button"
                onClick={() => setApplicationType(type)}
                aria-pressed={isSelected}
                title={APPLICATION_TYPE_DESCRIPTIONS[type]}
                className={`flex min-h-[112px] min-w-0 w-full flex-col items-start gap-2 border px-3 py-3 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 ${
                  isSelected
                    ? 'border-emerald-400/60 bg-emerald-400/[0.07] text-white'
                    : 'border-white/10 bg-[#111111] text-neutral-400 hover:border-white/25 hover:text-neutral-200'
                }`}
              >
                <span className="flex w-full items-center justify-between gap-1">
                  <Icon className={`h-4 w-4 shrink-0 ${isSelected ? 'text-emerald-300' : 'text-neutral-500'}`} />
                  {isSelected && <span className="h-1.5 w-1.5 bg-emerald-300" />}
                </span>
                <div className="min-w-0 w-full">
                  <div className="break-words text-xs font-semibold leading-4">{APPLICATION_TYPE_LABELS[type]}</div>
                  <div className="mt-1 break-words text-[10px] leading-4 text-neutral-500">{APPLICATION_TYPE_DESCRIPTIONS[type]}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Root directory for frontend */}
      {scan.suggestedRoots.length > 1 && (
        <div>
          <label className="mb-2 block text-xs font-medium text-neutral-300">Project root</label>
          <select
            value={primaryRoot}
            onChange={(e) => onPrimaryRootChange(e.target.value)}
            className="w-full border border-white/10 bg-[#111111] px-3 py-2 text-xs text-neutral-200 outline-none transition focus:border-emerald-400/60"
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
      <div data-setup-section="environment" className="scroll-mt-20 border border-white/[0.07] bg-[#0A0A0A] p-3">
          <div className="mb-3">
          <label className="mb-2 block text-xs font-medium text-neutral-300">
            Environment variables
          </label>
          <p className="text-[10px] leading-4 text-neutral-500">
            {applicationType === 'frontend-website'
              ? 'These values are supplied to the frontend build and embedded in its output.'
              : 'These values are passed to the deployment runtime. Do not include secrets in frontend builds.'}
          </p>
          </div>
          <div className="max-h-48 space-y-2 overflow-y-auto">
            {envVars.map((v) => (
              <div key={v.id} className="grid min-w-0 grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)_32px] gap-2">
                <input
                  type="text"
                  value={v.key}
                  onChange={(e) => {
                    updateEnvVar(v.id, 'key', e.target.value);
                    setEnvError(null);
                  }}
                  aria-label={`Variable name ${v.id}`}
                  placeholder="VARIABLE_NAME"
                  className="min-w-0 w-full border border-white/10 bg-[#111111] px-2 py-2 text-[11px] font-mono text-neutral-200 outline-none focus:border-emerald-400/60"
                />
                <input
                  type="text"
                  value={v.value}
                  onChange={(e) => {
                    updateEnvVar(v.id, 'value', e.target.value);
                    setEnvError(null);
                  }}
                  aria-label={`Value for ${v.key || `variable ${v.id}`}`}
                  placeholder="value"
                  className="min-w-0 w-full border border-white/10 bg-[#111111] px-2 py-2 text-[11px] font-mono text-neutral-200 outline-none focus:border-emerald-400/60"
                />
                <button
                  type="button"
                  onClick={() => removeEnvVar(v.id)}
                  aria-label={`Remove ${v.key || `variable ${v.id}`}`}
                  className="flex h-9 w-8 items-center justify-center border border-white/[0.07] text-neutral-500 hover:border-destructive/40 hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addEnvVar}
            className="mt-3 flex items-center gap-1 border border-white/10 px-2.5 py-2 text-xs text-neutral-300 hover:border-white/25 hover:text-white"
          >
            <Plus className="h-3.5 w-3.5" /> Add variable
          </button>
          {envError && <p role="alert" className="mt-2 text-xs text-red-300">{envError}</p>}
      </div>

      <div data-setup-section="review" className="scroll-mt-20 border border-white/[0.07] bg-[#0A0A0A] p-3">
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.15em] text-neutral-500">Review before deploying</h3>
        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-[11px]">
          <div className="min-w-0">
            <dt className="text-neutral-600">Repository</dt>
            <dd className="truncate font-mono text-neutral-200" title={`${repositoryOwner || ''}/${repositoryName}`}>
              {repositoryOwner ? `${repositoryOwner}/` : ''}{repositoryName}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-neutral-600">Application</dt>
            <dd className="truncate text-neutral-200">{selectedLabel}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-neutral-600">Project root</dt>
            <dd className="truncate font-mono text-neutral-200">{primaryRoot}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-neutral-600">Variables</dt>
            <dd className="truncate text-neutral-200">
              {envVars.filter((variable) => variable.key.trim()).length} configured
            </dd>
          </div>
        </dl>
        <button
          data-setup-section="review-action"
          type="button"
          onClick={handleDeploy}
          disabled={isDeploying}
          className="mt-3 w-full border border-emerald-400/40 bg-emerald-400/[0.08] py-3 text-sm font-semibold text-emerald-300 transition hover:border-emerald-300 hover:bg-emerald-400/[0.14] disabled:cursor-wait disabled:opacity-50"
        >
          {isDeploying ? 'Deploying...' : `Deploy ${selectedLabel}`}
        </button>
      </div>

      <button
        type="button"
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="flex w-full items-center justify-center gap-1 border-t border-white/[0.07] pt-3 text-xs text-neutral-500 hover:text-neutral-200"
      >
        {showAdvanced ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        Advanced settings
      </button>

      {showAdvanced && (
        <div className="border border-white/10 bg-[#111111] p-3 text-xs text-neutral-400">
          Infrastructure is managed automatically. CloudOps maps your application type to the best
          hosting option. Contact your administrator to override provider settings.
        </div>
      )}
    </div>
  );
}
