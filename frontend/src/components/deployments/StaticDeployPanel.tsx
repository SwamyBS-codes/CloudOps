import { useState, useCallback } from 'react';
import { Plus, Trash2, Loader2, Globe } from 'lucide-react';
import {
  deploymentService,
  type FileNode,
  type FrameworkDetection,
  type SuggestedRoot,
} from '@/services/deployment-service';
import { API_BASE_URL } from '@/lib/constants';
import RepositoryFileTree from './RepositoryFileTree';

type StaticStep = 's3-folder' | 's3-framework' | 's3-env';

type EnvVar = { id: number; key: string; value: string };

const normalizeRoot = (path: string) => path.replace(/^\.\//, '').replace(/\/$/, '') || '.';

type Props = {
  clonePath: string;
  fileTree: FileNode[];
  suggestedRoots: SuggestedRoot[];
  repo: string;
  repositoryUrl: string;
  repositoryOwner?: string;
  projectId?: string;
  initialRoot: string;
  step: StaticStep;
  setStep: (step: StaticStep) => void;
  onDeploying: () => void;
  onDeploymentQueued: () => void;
  onDeploymentStarted: (deploymentId: string) => void;
  addLog: (text: string, type?: string) => void;
};

export default function StaticDeployPanel({
  clonePath,
  fileTree,
  suggestedRoots,
  repo,
  repositoryUrl,
  repositoryOwner,
  projectId,
  initialRoot,
  step,
  setStep,
  onDeploying,
  onDeploymentQueued,
  onDeploymentStarted,
  addLog,
}: Props) {
  const [rootDirectory, setRootDirectory] = useState(initialRoot);
  const [detection, setDetection] = useState<FrameworkDetection | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [buildCommand, setBuildCommand] = useState('npm run build');
  const [outputDirectory, setOutputDirectory] = useState('dist');
  const [envError, setEnvError] = useState<string | null>(null);
  const [envVars, setEnvVars] = useState<EnvVar[]>([
    { id: 1, key: 'NODE_ENV', value: 'production' },
    { id: 2, key: 'VITE_API_URL', value: API_BASE_URL },
  ]);

  const applyDetection = useCallback((result: FrameworkDetection) => {
    setDetection(result);
    setBuildCommand(result.buildCommand || 'npm run build');
    setOutputDirectory(result.outputDirectory || 'dist');

    const suggested = result.suggestedEnvVars || [];
    if (suggested.length > 0) {
      setEnvVars(suggested.map((v, i) => ({ id: i + 1, key: v.key, value: v.value })));
    } else {
      setEnvVars([{ id: 1, key: 'NODE_ENV', value: 'production' }]);
    }
  }, []);

  const runDetection = useCallback(async (root: string) => {
    if (!clonePath) return;
    setRootDirectory(root);
    setIsDetecting(true);
    addLog(`Detecting framework in ${root === './' ? 'root' : root}...`, 'system');
    try {
      const result = await deploymentService.detectFramework(clonePath, root);
      if (result.deployType === 'container' || result.preset === 'backend-api') {
        addLog(
          `${result.displayName} is a backend API. Use "Backend API" deployment (npm install + npm start), not S3 static hosting.`,
          'error'
        );
        return;
      }
      applyDetection(result);
      addLog(`Detected ${result.displayName} — static deploy ready.`, 'success');
      setStep('s3-framework');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Framework detection failed';
      addLog(message, 'error');
    } finally {
      setIsDetecting(false);
    }
  }, [clonePath, addLog, applyDetection, setStep]);

  const addEnvVar = () => {
    setEnvError(null);
    setEnvVars((c) => [...c, { id: Date.now(), key: '', value: '' }]);
  };
  const updateEnvVar = (id: number, field: 'key' | 'value', val: string) =>
  {
    setEnvError(null);
    setEnvVars((c) => c.map((v) => (v.id === id ? { ...v, [field]: val } : v)));
  };
  const removeEnvVar = (id: number) => {
    setEnvError(null);
    setEnvVars((c) => c.filter((v) => v.id !== id));
  };

  const handleDeploy = async () => {
    if (!repo || !clonePath) return;

    const populated = envVars.filter((variable) => variable.key.trim() || variable.value.trim());
    const invalid = populated.find((variable) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(variable.key.trim()));
    if (invalid) {
      setEnvError('Use a valid variable name (letters, numbers, and underscores; it cannot start with a number).');
      return;
    }

    const keys = populated.map((variable) => variable.key.trim());
    if (new Set(keys).size !== keys.length) {
      setEnvError('Variable names must be unique.');
      return;
    }

    const environmentVariables = populated.reduce<Record<string, string>>((acc, variable) => {
      acc[variable.key.trim()] = variable.value;
      return acc;
    }, {});
    setEnvError(null);

    onDeploying();
    addLog('Starting S3 static deployment...', 'system');

    setIsDeploying(true);
    try {
      const envContent = envVars
        .filter((v) => v.key.trim())
        .map((v) => `${v.key.trim()}=${v.value}`)
        .join('\n');

      await deploymentService.saveFiles({
        clonePath,
        envPath: '.env',
        envContent,
        rootDirectory,
        deployType: 'static',
      });

      const result = await deploymentService.deployApplication({
        applicationType: 'frontend-website',
        repositoryUrl,
        repositoryName: repo,
        repositoryOwner,
        projectId,
        clonePath,
        primaryRoot: rootDirectory,
        rootDirectory,
        buildCommand,
        outputDirectory,
        environmentVariables,
        applicationName: repo,
      });

      if (!result.deploymentId) {
        throw new Error('The deployment was accepted without a deployment ID. Refresh Deployments to check its status.');
      }

      addLog(`Deployment queued. ID: ${result.deploymentId}`, 'success');
      onDeploymentQueued();
      onDeploymentStarted(result.deploymentId);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Deployment failed';
      addLog(message, 'error');
      setStep('s3-env');
      setIsDeploying(false);
    }
  };

  if (step === 's3-folder') {
    return (
      <>
        <h3 className="text-sm font-bold mb-3 text-success flex items-center gap-2">
          <Globe className="w-4 h-4" /> S3 Static — Root Directory
        </h3>
        <p className="text-xs text-muted-foreground mb-3">Select the folder containing your frontend app (package.json or index.html).</p>
        {suggestedRoots.length > 1 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {suggestedRoots.map((root) => (
              <button
                key={root.path}
                type="button"
                onClick={() => setRootDirectory(root.path)}
                className={`border px-3 py-1.5 text-xs transition ${
                  normalizeRoot(rootDirectory) === normalizeRoot(root.path)
                    ? 'border-success bg-success/10 text-success'
                    : 'border-border text-muted-foreground hover:border-border'
                }`}
              >
                {root.label}
              </button>
            ))}
          </div>
        )}
        <div className="scroll-mt-20">
          <RepositoryFileTree fileTree={fileTree} rootDirectory={rootDirectory} onSelectRoot={setRootDirectory} />
        </div>
        {isDetecting && (
          <div className="flex items-center gap-2 text-xs text-primary">
            <Loader2 className="h-4 w-4 animate-spin" /> Detecting framework...
          </div>
        )}
        <button
          type="button"
          onClick={() => void runDetection(rootDirectory)}
          disabled={isDetecting}
          className="mt-3 flex w-full items-center justify-center gap-2 border border-emerald-400/30 bg-emerald-400/[0.08] px-3 py-2.5 text-xs font-medium text-emerald-300 transition hover:bg-emerald-400/[0.14] disabled:cursor-wait disabled:opacity-50"
        >
          {isDetecting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {isDetecting ? 'Detecting framework…' : 'Detect framework in selected root'}
        </button>
      </>
    );
  }

  if (step === 's3-framework') {
    return (
      <>
        <h3 className="text-sm font-bold mb-3 text-success">Framework Preset</h3>
        {detection && (
          <div className="mb-4 rounded-lg border border-success bg-success/10 p-3">
            <p className="text-sm font-medium text-success">{detection.displayName}</p>
            <p className="text-xs text-muted-foreground mt-1">Root: {rootDirectory}</p>
          </div>
        )}
        <div className="space-y-3 mb-4">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Build Command</label>
            <input
              type="text"
              value={buildCommand}
              onChange={(e) => setBuildCommand(e.target.value)}
              className="w-full bg-secondary border border-border rounded-lg p-2 text-xs font-mono focus:border-success outline-none"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Output Directory</label>
            <input
              type="text"
              value={outputDirectory}
              onChange={(e) => setOutputDirectory(e.target.value)}
              className="w-full bg-secondary border border-border rounded-lg p-2 text-xs font-mono focus:border-success outline-none"
            />
          </div>
        </div>
        <button
          onClick={() => setStep('s3-env')}
          className="w-full bg-success/10 text-success py-2 rounded-lg font-medium hover:bg-success/90 text-sm"
        >
          Next: Environment Variables
        </button>
      </>
    );
  }

  if (step === 's3-env') {
    return (
      <>
        <h3 className="text-sm font-bold mb-3 text-success">Build Environment Variables</h3>
        <p className="text-xs text-muted-foreground mb-3">
          VITE_*, NEXT_PUBLIC_*, and REACT_APP_* vars are embedded at build time.
        </p>
        <div data-setup-section="environment" className="scroll-mt-20 space-y-2 mb-4 max-h-40 overflow-y-auto">
          {envVars.map((v) => (
            <div key={v.id} className="flex gap-2">
              <input
                type="text"
                value={v.key}
                onChange={(e) => updateEnvVar(v.id, 'key', e.target.value)}
                aria-label={`Variable name ${v.id}`}
                placeholder="KEY"
                className="flex-1 bg-secondary border border-border rounded-lg p-2 text-xs font-mono focus:border-success outline-none"
              />
              <input
                type="text"
                value={v.value}
                onChange={(e) => updateEnvVar(v.id, 'value', e.target.value)}
                aria-label={`Value for ${v.key || `variable ${v.id}`}`}
                placeholder="value"
                className="flex-1 bg-secondary border border-border rounded-lg p-2 text-xs font-mono focus:border-success outline-none"
              />
              <button
                type="button"
                onClick={() => removeEnvVar(v.id)}
                aria-label={`Remove ${v.key || `variable ${v.id}`}`}
                className="p-2 text-foreground/40 hover:text-destructive transition"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addEnvVar}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-4 transition"
        >
          <Plus className="h-3.5 w-3.5" /> Add variable
        </button>
        {envError && <p role="alert" className="mb-3 text-xs text-red-300">{envError}</p>}
        <button
          data-setup-section="review"
          disabled={isDeploying}
          onClick={handleDeploy}
          className="w-full bg-success/10 text-success py-2 font-medium hover:bg-success/20 text-sm disabled:cursor-wait disabled:opacity-60"
        >
          {isDeploying ? 'Starting deployment…' : 'Deploy to S3'}
        </button>
      </>
    );
  }

  return null;
}
