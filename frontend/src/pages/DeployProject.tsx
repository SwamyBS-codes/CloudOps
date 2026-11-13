import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2, Folder, File, ArrowLeft, CheckCircle2, Cloud, Server, Box, Globe, ExternalLink, GitBranch, Activity, ArrowUpRight, AlertTriangle, RotateCcw } from 'lucide-react';
import { deploymentService, type ApplicationScanResult, type SuggestedRoot } from '../services/deployment-service';
import StaticDeployPanel from '@/components/deployments/StaticDeployPanel';
import ApplicationDeployPanel from '@/components/deployments/ApplicationDeployPanel';
import { io, Socket } from 'socket.io-client';
import { useToast } from '@/components/ui/ToastProvider';
import { SOCKET_URL, DEPLOYED_PROJECTS_STORAGE_KEY } from '@/lib/constants';

type FileNode = { name: string; type: 'file' | 'directory'; children?: FileNode[] };

export default function DeployProject() {
  const { owner, repo } = useParams<{ owner: string, repo: string }>();
  const navigate = useNavigate();
  const { notify } = useToast();

  // Socket reference (persists across re-renders)
  const socketRef = useRef<Socket | null>(null);
  const activeDeploymentIdRef = useRef('');
  const completionHandledRef = useRef(false);
  const scanAttemptedRef = useRef(false);

  // Process States
  const [step, setStep] = useState<'cloning' | 'review' | 'type' | 'env' | 'dockerfile' | 'aws' | 'azure' | 's3-folder' | 's3-framework' | 's3-env' | 'deploying' | 'complete'>('cloning');
  const [clonePath, setClonePath] = useState('');
  const [hasDockerfile, setHasDockerfile] = useState(true);
  const [fileTree, setFileTree] = useState<FileNode[]>([]);
  const [suggestedRoots, setSuggestedRoots] = useState<SuggestedRoot[]>([]);
  const [applicationScan, setApplicationScan] = useState<ApplicationScanResult | null>(null);
  const [primaryRoot, setPrimaryRoot] = useState('./');
  const [publicUrl, setPublicUrl] = useState('');
  const [projectId, setProjectId] = useState('');
  const [repositoryOwner, setRepositoryOwner] = useState('');
  const [repositoryUrl, setRepositoryUrl] = useState('');
  const [activeDeploymentId, setActiveDeploymentId] = useState('');
  const [initError, setInitError] = useState<string | null>(null);

  // Deployment Type
  const [deploymentType, setDeploymentType] = useState<'local' | 'aws' | 'azure' | 's3-static'>('local');

  // Form States - Local
  const [envContent, setEnvContent] = useState('');

  // Form States - AWS
  const [awsInstanceType, setAwsInstanceType] = useState('t3.micro');
  const [awsEnvironmentVars, setAwsEnvironmentVars] = useState('');

  // Form States - Azure
  const [azureAppName, setAzureAppName] = useState(repo || '');

  // Socket & Logs
  const [logs, setLogs] = useState<{ id: number, text: string, type: string, time: string }[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    activeDeploymentIdRef.current = activeDeploymentId;
  }, [activeDeploymentId]);

  const addLog = (text: string, type = 'info') => {
    const time = new Date().toLocaleTimeString([], { hour12: false });
    setLogs(prev => [...prev, { id: Date.now() + Math.random(), text, type, time }]);
  };

  useEffect(() => { logsEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [logs]);

  const saveDeployedProject = (url: string) => {
    if (!owner || !repo) return;
    try {
      const raw = localStorage.getItem(DEPLOYED_PROJECTS_STORAGE_KEY);
      const existing = raw ? JSON.parse(raw) : [];
      const project = {
        id: `${owner}/${repo}`,
        name: repo,
        fullName: `${owner}/${repo}`,
        language: 'Frontend (S3)',
        deployedAt: new Date().toISOString(),
        liveUrl: url,
      };
      const updated = [project, ...existing.filter((p: { id: string }) => p.id !== project.id)];
      localStorage.setItem(DEPLOYED_PROJECTS_STORAGE_KEY, JSON.stringify(updated));
      window.dispatchEvent(new Event('cloudops:deployed-projects-updated'));
    } catch {
      // ignore
    }
  };

  // 1. Initial Clone & Fetch Tree
  const startClone = useCallback(async () => {
    if (!owner || !repo) return;
    setInitError(null);
    scanAttemptedRef.current = false;
    completionHandledRef.current = false;
    addLog(`Initializing workspace for ${owner}/${repo}...`, 'system');
    try {
      const result = await deploymentService.initDeploy(repo, owner);
      setClonePath(result.clonePath);
      setHasDockerfile(result.hasDockerfile ?? true);
      setFileTree(result.fileTree || []);
      setSuggestedRoots(result.suggestedRoots || [{ path: './', label: 'Root (./)', hasPackageJson: false }]);
      if (result.applicationScan) {
        setApplicationScan(result.applicationScan);
        setPrimaryRoot(result.applicationScan.primaryRoot || './');
        addLog(
          `Detected ${result.applicationScan.recommendation?.label || result.applicationScan.applicationType} (${Math.round((result.applicationScan.confidence || 0) * 100)}% confidence)`,
          'success'
        );
      }
      setProjectId(result.projectId || '');
      setRepositoryOwner(result.repositoryOwner || owner);
      setRepositoryUrl(result.repositoryUrl || `https://github.com/${owner}/${repo}.git`);

      addLog(`Repository cloned successfully.`, 'success');
      setStep('review');
    } catch (err: any) {
      const message = err?.message || 'Failed to clone repository';
      addLog(`Failed to clone: ${message}`, 'error');
      setInitError(message);
      notify({ title: 'Could not prepare repository', message, variant: 'error' });
    }
  }, [owner, repo, notify]);

  useEffect(() => {
    startClone();
  }, [startClone]);

  // 2. Initialize Socket Connection (Persistent)
  useEffect(() => {
    const socket = io(SOCKET_URL, { autoConnect: true });

    const handleCompletion = (url?: string, publicIp?: string, deploymentId?: string, status?: string, error?: string) => {
      // Backend emits both `build-complete` and `deployment-complete` for the same
      // deployment — dedupe so logs/saves/UI transitions fire only once.
      if (completionHandledRef.current) return;
      if (status === 'failed') {
        completionHandledRef.current = true;
        addLog(`❌ Deployment failed${error ? `: ${error}` : ''}`, 'error');
        notify({ title: 'Deployment failed', message: error || 'Check the logs for details.', variant: 'error' });
        setStep((prev) => (prev === 'deploying' ? 'review' : prev));
        return;
      }
      completionHandledRef.current = true;
      addLog(`✅ Deployment completed successfully!`, 'success');
      if (url) {
        addLog(`🔗 Live URL: ${url}`, 'success');
        setPublicUrl(url);
        saveDeployedProject(url);
      }
      if (publicIp) {
        addLog(`Public IP: ${publicIp}`, 'success');
      }
      if (deploymentId) {
        setActiveDeploymentId(deploymentId);
      }
      setStep('complete');
      notify({ title: 'Deployment live', message: url ? `Your app is live at ${url}` : 'Deployment finished successfully.', variant: 'success' });
    };

    // Azure deployment logs
    socket.on('deploy:log', (message) => {
      addLog(message, 'info');
    });

    socket.on('deploy:done', (data) => {
      handleCompletion(data?.url, undefined, data?.deploymentId);
    });

    socket.on('deploy:error', (data) => {
      handleCompletion(undefined, undefined, data?.deploymentId, 'failed', data?.message);
    });

    // AWS/Local deployment logs
    socket.on('deployment-log', (data) => {
      addLog(data.message, data.level);
    });

    socket.on('build-log', (data) => {
      addLog(data.text, data.type);
    });

    socket.on('build-complete', (data?: { status?: string; publicUrl?: string; liveUrl?: string; publicIp?: string; deploymentId?: string; error?: string }) => {
      const url = data?.publicUrl || data?.liveUrl;
      if (data?.status === 'success' && !url) {
        // No URL yet (e.g. EC2 still provisioning) — keep waiting, don't mark complete.
        return;
      }
      handleCompletion(url, data?.publicIp, data?.deploymentId, data?.status, data?.error);
    });

    socket.on('deployment-complete', (data) => {
      handleCompletion(data?.liveUrl || data?.publicUrl, data?.publicIp, data?.deploymentId, data?.status);
    });

    // Store socket in ref
    socketRef.current = socket;

    // Cleanup on unmount
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notify, owner, repo]);

  // 3. Join deployment room when deploying
  useEffect(() => {
    if (step !== 'deploying' || !activeDeploymentId || !socketRef.current) return;
    socketRef.current.emit('join-deployment', activeDeploymentId);
  }, [step, activeDeploymentId]);

  // 4. Fallback: scan the repository when the init payload had no scan result
  useEffect(() => {
    if (step !== 'review' || applicationScan || !clonePath || scanAttemptedRef.current) return;
    scanAttemptedRef.current = true;
    deploymentService.scanApplication(clonePath)
      .then((scan) => {
        setApplicationScan(scan);
        setPrimaryRoot(scan.primaryRoot || './');
        addLog(
          `Detected ${scan.recommendation?.label || scan.applicationType} (${Math.round((scan.confidence || 0) * 100)}% confidence)`,
          'success'
        );
      })
      .catch((err: unknown) => {
        addLog(`Application scan failed: ${err instanceof Error ? err.message : 'unknown error'}`, 'error');
      });
  }, [step, applicationScan, clonePath]);

  const handleStartBuild = async () => {
    completionHandledRef.current = false;
    setStep('deploying');
    const deploymentLabel = deploymentType === 'aws' ? 'AWS EC2' : deploymentType === 'azure' ? 'Azure ACI' : 'local';
    addLog(`🚀 Starting ${deploymentLabel} deployment...`, 'system');

    try {
      if (deploymentType === 'aws') {
        // AWS Deployment
        const envVars: Record<string, string> = {};
        if (awsEnvironmentVars) {
          awsEnvironmentVars.split('\n').forEach(line => {
            const [key, value] = line.split('=');
            if (key && value) envVars[key.trim()] = value.trim();
          });
        }

        addLog(`☁️  Pushing image to AWS ECR...`, 'info');
        const result = await deploymentService.startAWSDeployment({
          repositoryUrl,
          repositoryName: repo!,
          repositoryOwner: owner || repositoryOwner,
          branch: 'main',
          instanceType: awsInstanceType,
          environmentVariables: envVars,
        });

        addLog(`✅ AWS deployment initiated!`, 'success');
        addLog(`🆔 Deployment ID: ${result.deploymentId}`, 'info');
        setActiveDeploymentId(result.deploymentId);
        notify({ title: 'AWS deployment queued', message: 'Live logs will stream below.', variant: 'info' });
      } else if (deploymentType === 'azure') {
        // Azure Deployment
        addLog(`☁️  Building Docker image and pushing to Azure Container Registry...`, 'info');
        const result = await deploymentService.startAzureDeployment({
          repoUrl: repositoryUrl,
          appName: azureAppName,
          socketId: socketRef.current?.id || '',
        });

        addLog(`✅ Azure deployment initiated!`, 'success');
        addLog(`🆔 App Name: ${azureAppName}`, 'info');
        if (result.message) addLog(result.message, 'info');
        if (result.deploymentId) {
          setActiveDeploymentId(result.deploymentId);
          socketRef.current?.emit('join-deployment', result.deploymentId);
        }
        notify({ title: 'Azure deployment queued', message: 'Live logs will stream below.', variant: 'info' });
      } else {
        // Local Deployment — env vars are passed to the build engine directly;
        // the engine auto-generates a Dockerfile when the repo lacks one.
        const envVars: Record<string, string> = {};
        envContent.split('\n').forEach(line => {
          const [key, ...rest] = line.split('=');
          if (key?.trim() && rest.length > 0) envVars[key.trim()] = rest.join('=').trim();
        });

        addLog(`Starting build engine...`, 'system');
        const result = await deploymentService.startBuild({
          projectId,
          repositoryName: repo!,
          repositoryOwner,
          environmentVariables: envVars,
        });
        if (result.deploymentId) {
          setActiveDeploymentId(result.deploymentId);
        }
        notify({ title: 'Local deployment queued', message: 'Live logs will stream below.', variant: 'info' });
      }
    } catch (err: any) {
      addLog(`❌ Error: ${err.message}`, 'error');
      notify({ title: 'Deployment failed to start', message: err.message, variant: 'error' });
      const stepMap: Record<string, typeof step> = {
        aws: 'aws',
        azure: 'azure',
        local: 'env',
        's3-static': 's3-env',
      };
      setStep(stepMap[deploymentType] || 'env');
    }
  };

  // Helper to render the File Tree recursively
  const renderTree = (nodes: FileNode[], depth = 0) => {
    return nodes.map((node, i) => (
      <div key={i} style={{ paddingLeft: `${depth * 12}px` }} className="flex items-center gap-2 py-1 text-xs text-foreground hover:text-primary">
        {node.type === 'directory' ? <Folder className="w-3.5 h-3.5 text-primary" /> : <File className="w-3.5 h-3.5 text-foreground/40" />}
        <span>{node.name}</span>
        {node.children && <div className="w-full mt-1">{renderTree(node.children, depth + 1)}</div>}
      </div>
    ));
  };

  return (
    <div className="min-h-screen bg-[#070707] px-4 py-5 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1680px]">
        <header className="mb-4 flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => step === 'deploying'
                ? navigate(activeDeploymentId ? `/deployments/${encodeURIComponent(activeDeploymentId)}` : '/deployments')
                : navigate(-1)}
              className="inline-flex shrink-0 items-center gap-2 border border-white/10 bg-[#101010] px-3 py-2 text-xs font-medium text-neutral-300 transition hover:border-white/25 hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              {step === 'deploying' ? 'Continue in background' : 'Exit setup'}
            </button>
            <div className="min-w-0 border-l border-white/10 pl-3">
              <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-500">
                <Activity className="h-3.5 w-3.5 text-emerald-400" />
                CloudOps / deployment
              </div>
              <h1 className="mt-1 truncate text-lg font-semibold tracking-tight text-white">
                {owner && repo ? `${owner}/${repo}` : 'Preparing repository'}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs text-neutral-400">
            <span className="inline-flex items-center gap-1.5 border border-white/10 bg-[#101010] px-2.5 py-1.5">
              <GitBranch className="h-3.5 w-3.5 text-neutral-500" />
              main
            </span>
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 ${
              step === 'complete' ? 'border border-emerald-400/30 bg-emerald-400/10 text-emerald-300'
                : step === 'deploying' ? 'border border-amber-300/30 bg-amber-300/10 text-amber-200'
                  : 'border border-white/10 bg-[#101010] text-neutral-300'
            }`}>
              <span className={`h-1.5 w-1.5 ${step === 'complete' ? 'bg-emerald-400' : step === 'deploying' ? 'animate-pulse bg-amber-300 motion-reduce:animate-none' : 'bg-neutral-500'}`} />
              {step === 'complete' ? 'Live' : step === 'deploying' ? 'Deploying' : step === 'cloning' ? 'Preparing' : 'Ready to configure'}
            </span>
          </div>
        </header>

        <nav aria-label="Deployment progress" className="mb-4 grid grid-cols-3 border border-white/10 bg-[#0C0C0C]">
          {[
            { label: 'Clone repository', done: step !== 'cloning', current: step === 'cloning' },
            { label: 'Configure', done: step === 'deploying' || step === 'complete', current: step !== 'cloning' && step !== 'deploying' && step !== 'complete' },
            { label: 'Build and deploy', done: step === 'complete', current: step === 'deploying' },
          ].map((stage, index) => (
            <div
              key={stage.label}
              aria-current={stage.current ? 'step' : undefined}
              className={`flex min-w-0 items-center gap-3 border-r border-white/10 px-3 py-3 last:border-r-0 sm:px-5 ${
                stage.current ? 'bg-white/[0.035]' : ''
              }`}
            >
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center border text-[10px] font-semibold ${
                stage.done ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300'
                  : stage.current ? 'border-white/40 text-white'
                    : 'border-white/10 text-neutral-600'
              }`}>
                {stage.done ? <CheckCircle2 className="h-3.5 w-3.5" /> : `0${index + 1}`}
              </span>
              <span className={`truncate text-xs font-medium sm:text-sm ${
                stage.current ? 'text-white' : stage.done ? 'text-neutral-300' : 'text-neutral-600'
              }`}>{stage.label}</span>
              {stage.current && <span className="ml-auto hidden h-1.5 w-1.5 shrink-0 animate-pulse bg-emerald-400 motion-reduce:animate-none sm:block" />}
            </div>
          ))}
        </nav>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(360px,0.9fr)_minmax(0,1.6fr)]">
        {/* SETUP */}
        <section className="min-w-0 space-y-3">
          <details className="group border border-white/10 bg-[#0C0C0C]">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-xs font-medium text-neutral-400 transition hover:text-white [&::-webkit-details-marker]:hidden">
              <Folder className="h-4 w-4 text-neutral-500" />
              <span>Repository files</span>
              <span className="ml-auto text-[10px] uppercase tracking-wider text-neutral-600">
                {fileTree.length > 0 ? 'Browse source' : 'Preparing'}
              </span>
              <span className="text-neutral-600 transition-transform group-open:rotate-180">⌄</span>
            </summary>
            <div className="max-h-56 overflow-y-auto border-t border-white/10 px-4 py-3">
              {fileTree.length > 0 ? renderTree(fileTree) : (
                <div className="text-xs italic text-neutral-500">Files will appear after the repository is ready.</div>
              )}
            </div>
          </details>

          {/* Configuration Form */}
          {(step === 'cloning' || step === 'review' || step === 'type' || step === 'env' || step === 'dockerfile' || step === 'aws' || step === 'azure' || step === 's3-folder' || step === 's3-framework' || step === 's3-env' || step === 'deploying') && (
            <div className="min-w-0 border border-white/10 bg-[#0C0C0C] p-4 sm:p-5">
              {initError && (
                <div className="mb-4 rounded-lg border border-destructive bg-destructive/10 p-4">
                  <div className="flex items-start gap-2 text-sm text-destructive">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <div>
                      <div className="font-medium">Repository setup failed</div>
                      <div className="mt-1 text-xs opacity-80">{initError}</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void startClone()}
                    className="mt-3 inline-flex items-center gap-2 rounded-lg border border-destructive px-3 py-1.5 text-xs font-medium text-destructive transition hover:bg-destructive/10"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Retry
                  </button>
                </div>
              )}

              {step === 'cloning' && !initError && (
                <div className="flex items-center gap-3 py-5">
                  <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
                  <div>
                    <p className="text-sm font-medium text-neutral-200">Preparing repository</p>
                    <p className="mt-1 text-xs text-neutral-500">Cloning source and detecting the application stack.</p>
                  </div>
                </div>
              )}

              {step === 'review' && applicationScan && repo && (
                <ApplicationDeployPanel
                  scan={applicationScan}
                  clonePath={clonePath}
                  repositoryUrl={repositoryUrl}
                  repositoryName={repo}
                  repositoryOwner={repositoryOwner || owner}
                  projectId={projectId}
                  primaryRoot={primaryRoot}
                  onPrimaryRootChange={setPrimaryRoot}
                  onDeploying={() => setStep('deploying')}
                  onDeploymentStarted={(deploymentId) => {
                    setActiveDeploymentId(deploymentId);
                  }}
                  onError={() => setStep('review')}
                  addLog={addLog}
                  socketRef={socketRef}
                />
              )}

              {step === 'review' && !applicationScan && (
                <div className="text-sm text-muted-foreground">
                  <p>Scanning repository...</p>
                  <button
                    type="button"
                    onClick={() => setStep('type')}
                    className="mt-3 text-xs text-primary hover:underline"
                  >
                    Use advanced deployment options
                  </button>
                </div>
              )}

              {step === 'review' && applicationScan && (
                <button
                  type="button"
                  onClick={() => setStep('type')}
                  className="mt-4 w-full text-center text-xs text-foreground/40 hover:text-muted-foreground"
                >
                  Advanced deployment options (Local, AWS, Azure, S3)
                </button>
              )}

              {/* Deployment Type Selection */}
              {step === 'type' && (
                <>
                  <h3 className="text-sm font-bold mb-4">1. Select Deployment Type</h3>
                  <div className="flex gap-3 mb-4 flex-wrap">
                    <button
                      type="button"
                      onClick={() => { setDeploymentType('local'); setStep('env'); }}
                      className={`flex-1 min-w-[100px] flex items-center justify-center gap-2 p-3 rounded-lg font-medium transition ${
                        deploymentType === 'local'
                          ? 'bg-primary/10 text-primary border border-primary'
                          : 'bg-secondary text-muted-foreground border border-border hover:border-border'
                      }`}
                    >
                      <Server className="w-4 h-4" /> Local
                    </button>
                    <button
                      type="button"
                      onClick={() => { setDeploymentType('aws'); setStep('aws'); }}
                      className={`flex-1 min-w-[100px] flex items-center justify-center gap-2 p-3 rounded-lg font-medium transition ${
                        deploymentType === 'aws'
                          ? 'bg-orange-500/30 text-orange-300 border border-orange-500/50'
                          : 'bg-secondary text-muted-foreground border border-border hover:border-border'
                      }`}
                    >
                      <Cloud className="w-4 h-4" /> AWS EC2
                    </button>
                    <button
                      type="button"
                      onClick={() => { setDeploymentType('azure'); setStep('azure'); }}
                      className={`flex-1 min-w-[100px] flex items-center justify-center gap-2 p-3 rounded-lg font-medium transition ${
                        deploymentType === 'azure'
                          ? 'bg-blue-500/30 text-blue-300 border border-blue-500/50'
                          : 'bg-secondary text-muted-foreground border border-border hover:border-border'
                      }`}
                    >
                      <Box className="w-4 h-4" /> Azure ACI
                    </button>
                    <button
                      type="button"
                      onClick={() => { setDeploymentType('s3-static'); setStep('s3-folder'); }}
                      className={`flex-1 min-w-[100px] flex items-center justify-center gap-2 p-3 rounded-lg font-medium transition ${
                        deploymentType === 's3-static'
                          ? 'bg-success/10 text-success border border-success'
                          : 'bg-secondary text-muted-foreground border border-border hover:border-border'
                      }`}
                    >
                      <Globe className="w-4 h-4" /> S3 Static
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground mb-4">
                    <strong>Local:</strong> Runs on this server (localhost:4002+)<br/>
                    <strong>AWS:</strong> Runs on EC2 with public IP<br/>
                    <strong>Azure:</strong> Runs on Container Instances<br/>
                    <strong>S3 Static:</strong> Build frontend and upload to S3 (no Docker)
                  </p>
                </>
              )}

              {/* Local Deployment - Environment & Runtime */}
              {step === 'env' && deploymentType === 'local' && (
                <>
                  <h3 className="text-sm font-bold mb-3">2. Environment Variables</h3>
                  <p className="text-xs text-muted-foreground mb-3">
                    Injected into the container at runtime. The build engine auto-generates a Dockerfile
                    {hasDockerfile ? ' (your repository already has one)' : ' since your repository has none'}.
                  </p>
                  <textarea
                    value={envContent}
                    onChange={(e) => setEnvContent(e.target.value)}
                    placeholder="API_KEY=123..."
                    aria-label="Environment variables"
                    className="w-full h-24 bg-secondary border border-border rounded-lg p-2 text-xs font-mono mb-4 focus:border-primary outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleStartBuild}
                    className="w-full bg-primary/10 text-primary py-2 rounded-lg font-medium hover:bg-primary/90 text-sm"
                  >
                    ▶️ Deploy to Local
                  </button>
                </>
              )}

              {/* AWS Deployment Configuration */}
              {step === 'aws' && deploymentType === 'aws' && (
                <>
                  <h3 className="text-sm font-bold mb-4 text-orange-300">⚡ Automated AWS EC2 Deployment</h3>
                  <p className="text-xs text-muted-foreground mb-4">EC2 Key Pair and Security Group will be automatically created for you.</p>
                  
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Instance Type</label>
                      <select
                        value={awsInstanceType}
                        onChange={(e) => setAwsInstanceType(e.target.value)}
                        className="w-full bg-secondary border border-border rounded-lg p-2 text-xs focus:border-orange-500/50 outline-none"
                      >
                        <option value="t3.micro">t3.micro (free tier, recommended)</option>
                        <option value="t3.small">t3.small</option>
                        <option value="t3.medium">t3.medium</option>
                        <option value="t3.large">t3.large</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Environment Variables (optional)</label>
                      <textarea
                        value={awsEnvironmentVars}
                        onChange={(e) => setAwsEnvironmentVars(e.target.value)}
                        placeholder="NODE_ENV=production&#10;API_KEY=xxx"
                        className="w-full h-20 bg-secondary border border-border rounded-lg p-2 text-xs font-mono focus:border-orange-500/50 outline-none"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={handleStartBuild}
                      className="w-full bg-orange-500/20 text-orange-300 py-2 rounded-lg font-medium hover:bg-orange-500/30 text-sm"
                    >
                      🚀 Deploy to AWS EC2
                    </button>
                  </div>
                </>
              )}

              {/* S3 Static Deployment */}
              {deploymentType === 's3-static' && ['s3-folder', 's3-framework', 's3-env'].includes(step) && owner && repo && (
                <StaticDeployPanel
                  clonePath={clonePath}
                  fileTree={fileTree}
                  suggestedRoots={suggestedRoots}
                  repo={repo}
                  repositoryUrl={repositoryUrl}
                  repositoryOwner={repositoryOwner || owner}
                  projectId={projectId}
                  step={step as 's3-folder' | 's3-framework' | 's3-env'}
                  setStep={setStep}
                  onDeploying={() => setStep('deploying')}
                  onDeploymentStarted={(deploymentId) => {
                    setActiveDeploymentId(deploymentId);
                  }}
                  addLog={addLog}
                />
              )}

              {/* Azure Deployment Configuration */}
              {step === 'azure' && deploymentType === 'azure' && (
                <>
                  <h3 className="text-sm font-bold mb-4 text-blue-300">☁️ Azure Container Instance Deployment</h3>
                  <p className="text-xs text-muted-foreground mb-4">Deploy your application to Azure Container Instances (ACI). Logs will stream in real-time below.</p>
                  
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Application Name</label>
                      <input
                        type="text"
                        value={azureAppName}
                        onChange={(e) => setAzureAppName(e.target.value)}
                        placeholder="my-app"
                        className="w-full bg-secondary border border-border rounded-lg p-2 text-xs focus:border-blue-500/50 outline-none"
                      />
                      <p className="text-xs text-foreground/40 mt-1">Must be lowercase, alphanumeric and dashes only</p>
                    </div>

                    <button
                      type="button"
                      onClick={handleStartBuild}
                      disabled={!azureAppName || !/^[a-z0-9-]+$/.test(azureAppName)}
                      className="w-full bg-blue-500/20 text-blue-300 py-2 rounded-lg font-medium hover:bg-blue-500/30 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      🚀 Deploy to Azure ACI
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </section>

        {/* DEPLOYMENT ACTIVITY */}
        <section className="flex min-h-[480px] min-w-0 flex-col overflow-hidden border border-white/10 bg-[#0A0A0A] lg:sticky lg:top-4 lg:h-[calc(100vh-14rem)] lg:min-h-[460px]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-[#101010] px-4 py-3 sm:px-5">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-white">Deployment activity</h2>
                <p className="mt-0.5 text-[11px] text-neutral-500">Repository setup, build output, and live status</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-flex shrink-0 items-center gap-1.5 border border-white/10 px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-neutral-400">
                  {step === 'deploying' ? <><span className="h-1.5 w-1.5 animate-pulse bg-amber-300 motion-reduce:animate-none" />Streaming</>
                    : step === 'complete' ? <><span className="h-1.5 w-1.5 bg-emerald-400" />Complete</>
                      : <><span className="h-1.5 w-1.5 bg-neutral-600" />Console</>}
                </span>
                {step === 'complete' && (
                  <>
                    {publicUrl && (
                      <a
                        href={publicUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 border border-emerald-400/30 px-2.5 py-1.5 text-xs text-emerald-300 hover:bg-emerald-400/10"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Open site
                      </a>
                    )}
                    {activeDeploymentId && (
                      <button
                        type="button"
                        onClick={() => navigate(`/deployments/${encodeURIComponent(activeDeploymentId)}`)}
                        className="inline-flex shrink-0 items-center gap-2 border border-white/10 bg-[#0C0C0C] px-3 py-2 text-xs font-medium text-neutral-300 transition hover:border-white/25 hover:text-white"
                      >
                        View details
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </>
                )}
                {step === 'deploying' && (
                  <button
                    type="button"
                    onClick={() => navigate(activeDeploymentId ? `/deployments/${encodeURIComponent(activeDeploymentId)}` : '/deployments')}
                    className="inline-flex shrink-0 items-center gap-2 border border-white/15 bg-white/[0.04] px-3 py-2 text-xs font-medium text-white transition hover:bg-white/[0.08]"
                  >
                    View deployment
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          
          {/* The Terminal Screen */}
          <div className="flex-1 space-y-1 overflow-y-auto bg-[#070707] p-4 font-mono text-[11px] leading-relaxed sm:p-5 sm:text-xs">
            {logs.length === 0 && (
              <div className="flex min-h-[300px] flex-col items-center justify-center px-6 text-center">
                <div className="mb-4 flex h-12 w-12 items-center justify-center border border-white/10 bg-[#101010]">
                  {step === 'cloning'
                    ? <Loader2 className="h-5 w-5 animate-spin text-emerald-400 motion-reduce:animate-none" />
                    : <Activity className="h-5 w-5 text-neutral-500" />}
                </div>
                <p className="text-sm font-medium text-neutral-300">
                  {step === 'cloning' ? 'Preparing your repository' : 'Build output will appear here'}
                </p>
                <p className="mt-1 max-w-xs text-xs leading-5 text-neutral-500">
                  {step === 'cloning'
                    ? 'Connecting to GitHub and indexing project files.'
                    : 'Start a deployment to stream build steps and status updates.'}
                </p>
              </div>
            )}
            {logs.map((log) => (
              <div key={log.id} className="flex gap-4">
                <span className="shrink-0 select-none text-neutral-600">[{log.time}]</span>
                <span className={`min-w-0 break-words ${
                  log.type === 'error' ? 'text-destructive' : ''
                } ${
                  log.type === 'success' ? 'text-success font-bold' : ''
                } ${
                  log.type === 'system' ? 'text-emerald-300' : ''
                } ${
                  log.type === 'info' ? 'text-neutral-300' : ''
                }`}>
                  {log.text}
                </span>
              </div>
            ))}
            {step === 'deploying' && (
              <div className="flex gap-4 text-primary animate-pulse mt-2">
                <span className="text-transparent">[{logs[logs.length-1]?.time}]</span>
                <span>Wait...</span>
              </div>
            )}
            <div ref={logsEndRef} />
          </div>
        </section>

      </div>
      </div>
    </div>
  );
}
