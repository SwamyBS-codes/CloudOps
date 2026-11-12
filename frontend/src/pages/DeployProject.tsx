import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2, Folder, File, ArrowLeft, CheckCircle2, Cloud, Server, Box, Globe, ExternalLink } from 'lucide-react';
import { deploymentService, type ApplicationScanResult, type SuggestedRoot } from '../services/deployment-service';
import StaticDeployPanel from '@/components/deployments/StaticDeployPanel';
import ApplicationDeployPanel from '@/components/deployments/ApplicationDeployPanel';
import { io, Socket } from 'socket.io-client';

type FileNode = { name: string; type: 'file' | 'directory'; children?: FileNode[] };

const DEPLOYED_PROJECTS_KEY = 'cloudops_deployed_projects';

export default function DeployProject() {
  const { owner, repo } = useParams<{ owner: string, repo: string }>();
  const navigate = useNavigate();

  // Socket reference (persists across re-renders)
  const socketRef = useRef<Socket | null>(null);

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

  // Deployment Type
  const [deploymentType, setDeploymentType] = useState<'local' | 'aws' | 'azure' | 's3-static'>('local');

  // Form States - Local
  const [envPath, setEnvPath] = useState('.env');
  const [envContent, setEnvContent] = useState('');
  const [dockerfileContent, setDockerfileContent] = useState('');

  // Form States - AWS
  const [awsInstanceType, setAwsInstanceType] = useState('t3.micro');
  const [awsEnvironmentVars, setAwsEnvironmentVars] = useState('');

  // Form States - Azure
  const [azureAppName, setAzureAppName] = useState(repo || '');

  // Socket & Logs
  const [logs, setLogs] = useState<{ id: number, text: string, type: string, time: string }[]>([]);
  const [currentDeploymentId, setCurrentDeploymentId] = useState('');
  const logsEndRef = useRef<HTMLDivElement>(null);

  const addLog = (text: string, type = 'info') => {
    const time = new Date().toLocaleTimeString([], { hour12: false });
    setLogs(prev => [...prev, { id: Date.now() + Math.random(), text, type, time }]);
  };

  useEffect(() => { logsEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [logs]);

  const saveDeployedProject = (url: string) => {
    if (!owner || !repo) return;
    try {
      const raw = localStorage.getItem(DEPLOYED_PROJECTS_KEY);
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
      localStorage.setItem(DEPLOYED_PROJECTS_KEY, JSON.stringify(updated));
      window.dispatchEvent(new Event('cloudops:deployed-projects-updated'));
    } catch {
      // ignore
    }
  };

  // 1. Initial Clone & Fetch Tree
  useEffect(() => {
    if (!owner || !repo) return;
    
    const startClone = async () => {
      addLog(`Initializing workspace for ${owner}/${repo}...`, 'system');
      try {
        const result = await deploymentService.initDeploy(repo, owner);
        setClonePath(result.clonePath);
        setHasDockerfile(result.hasDockerfile);
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
        setProjectId(result.projectId);
        setRepositoryOwner(result.repositoryOwner);
        setRepositoryUrl(result.repositoryUrl || `https://github.com/${owner}/${repo}.git`);
        
        addLog(`Repository cloned successfully.`, 'success');
        setStep('review');
      } catch (err: any) {
        addLog(`Failed to clone: ${err.message}`, 'error');
      }
    };
    startClone();
  }, [owner, repo]);

  // 2. Initialize Socket Connection (Persistent)
  useEffect(() => {
    const socketUrl = (import.meta.env.VITE_API_URL as string) || 'http://localhost:5000';
    const socket = io(socketUrl, { autoConnect: true });

    socket.on('connect', () => {
      console.log('✅ Socket connected:', socket.id);
    });

    // Azure deployment logs
    socket.on('deploy:log', (message) => {
      addLog(message, 'info');
    });

    socket.on('deploy:done', (data) => {
      addLog(`✅ Deployment completed successfully!`, 'success');
      if (data?.url) {
        addLog(`🔗 Live URL: ${data.url}`, 'success');
      }
      setStep('complete');
      
      // Store deploymentId and navigate after a brief delay
      if (data?.deploymentId) {
        setCurrentDeploymentId(data.deploymentId);
        setTimeout(() => {
          navigate(`/deployments/${encodeURIComponent(data.deploymentId)}`);
        }, 2000);
      }
    });

    socket.on('deploy:error', (data) => {
      addLog(`❌ Deployment failed: ${data.message}`, 'error');
      
      // Navigate to deployment page to see error details
      if (data?.deploymentId) {
        setCurrentDeploymentId(data.deploymentId);
        setTimeout(() => {
          navigate(`/deployments/${encodeURIComponent(data.deploymentId)}`);
        }, 2000);
      }
    });

    // AWS/Local deployment logs
    socket.on('deployment-log', (data) => {
      addLog(data.message, data.level);
    });

    socket.on('build-log', (data) => {
      addLog(data.text, data.type);
    });

    socket.on('build-complete', (data?: { status?: string; publicUrl?: string; liveUrl?: string; publicIp?: string; deploymentId?: string }) => {
      const url = data?.publicUrl || data?.liveUrl;
      if (data?.status === 'success' && url) {
        setPublicUrl(url);
        if (data.publicIp) {
          addLog(`Public IP: ${data.publicIp}`, 'success');
        }
        saveDeployedProject(url);
        setStep('complete');
        if (data.deploymentId) {
          setActiveDeploymentId(data.deploymentId);
        }
        return;
      }
      if (data?.status === 'failed') {
        setStep('review');
        return;
      }

      setStep('complete');
      if (activeDeploymentId || data?.deploymentId) {
        const id = data?.deploymentId || activeDeploymentId;
        setTimeout(() => navigate(`/deployments/${encodeURIComponent(id)}`), 2000);
      }
    });

    socket.on('deployment-complete', (data) => {
      addLog(`✅ Deployment completed successfully!`, 'success');
      const url = data?.liveUrl || data?.publicUrl;
      if (url) {
        addLog(`🔗 Live URL: ${url}`, 'success');
        setPublicUrl(url);
        saveDeployedProject(url);
      }
      if (data?.publicIp) {
        addLog(`Public IP: ${data.publicIp}`, 'success');
      }
      setStep('complete');

      const deploymentIdToOpen = data?.deploymentId || activeDeploymentId;
      if (deploymentIdToOpen) {
        setCurrentDeploymentId(deploymentIdToOpen);
        setActiveDeploymentId(deploymentIdToOpen);
        setTimeout(() => {
          navigate(`/deployments/${encodeURIComponent(deploymentIdToOpen)}`);
        }, 2000);
      }
    });

    // Store socket in ref
    socketRef.current = socket;

    // Cleanup on unmount
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [deploymentType, activeDeploymentId, navigate]);

  // 3. Join deployment room when deploying
  useEffect(() => {
    if (step !== 'deploying' || !repo || !socketRef.current) return;
    socketRef.current.emit('join-deployment', repo);
  }, [step, repo]);

  const handleStartBuild = async () => {
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
        if (result.instanceId) addLog(`📍 Instance ID: ${result.instanceId}`, 'info');
        if (result.liveUrl) addLog(`🔗 Live URL: ${result.liveUrl}`, 'success');
        if (result.ecrUri) addLog(`🐳 ECR URI: ${result.ecrUri}`, 'info');
        // Don't set step to complete here - wait for Socket.io 'deployment-complete' event
        // which confirms the actual deployment succeeded
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
        // Wait for Socket.IO 'deploy:done' or 'deploy:error' events
      } else {
        // Local Deployment
        await deploymentService.saveFiles({
          clonePath,
          envPath,
          envContent,
          dockerfileContent: !hasDockerfile ? dockerfileContent : undefined
        });
        addLog(`Configuration saved. Starting build engine...`, 'success');
        
        await deploymentService.startBuild({
          projectId,
          repositoryName: repo!,
          repositoryOwner
        });
      }
    } catch (err: any) {
      addLog(`❌ Error: ${err.message}`, 'error');
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
    <div className="min-h-screen bg-[#020617] text-foreground p-6 pt-24">
      <div className="max-w-[1400px] mx-auto flex flex-col lg:flex-row gap-6 h-[80vh]">
        
        {/* LEFT COLUMN - WORKSPACE & CONFIG */}
        <div className="w-full lg:w-[400px] flex flex-col gap-4 h-full">
          <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-primary hover:text-primary transition text-sm">
            <ArrowLeft className="w-4 h-4" /> Exit Setup
          </button>
          
          {/* File Explorer */}
          <div className="bg-card border border-border rounded-xl p-4  flex-1 flex flex-col overflow-hidden">
            <h2 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2">
              <Folder className="w-4 h-4" /> Workspace Explorer
            </h2>
            <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
              {fileTree.length > 0 ? renderTree(fileTree) : (
                <div className="text-muted-foreground text-xs italic">Awaiting clone...</div>
              )}
            </div>
          </div>

          {/* Configuration Form */}
          {(step === 'review' || step === 'type' || step === 'env' || step === 'dockerfile' || step === 'aws' || step === 'azure' || step === 's3-folder' || step === 's3-framework' || step === 's3-env') && (
            <div className="bg-card border border-border rounded-xl p-5  shrink-0 max-h-[50vh] overflow-y-auto">
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
                    navigate(`/deployments/${encodeURIComponent(deploymentId)}`);
                  }}
                  onComplete={(url, deploymentId) => {
                    setPublicUrl(url);
                    saveDeployedProject(url);
                    if (deploymentId) {
                      setActiveDeploymentId(deploymentId);
                      navigate(`/deployments/${encodeURIComponent(deploymentId)}`);
                      return;
                    }
                    setStep('complete');
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

              {/* Local Deployment - Environment & Dockerfile */}
              {(step === 'env' || step === 'dockerfile') && deploymentType === 'local' && (
                <>
                  {step === 'env' ? (
                    <>
                      <h3 className="text-sm font-bold mb-3">2. Environment Secrets</h3>
                      <input type="text" value={envPath} onChange={(e) => setEnvPath(e.target.value)} placeholder=".env path" className="w-full bg-secondary border border-border rounded-lg p-2 text-xs mb-3 focus:border-primary outline-none" />
                      <textarea value={envContent} onChange={(e) => setEnvContent(e.target.value)} placeholder="API_KEY=123..." className="w-full h-24 bg-secondary border border-border rounded-lg p-2 text-xs font-mono mb-4 focus:border-primary outline-none" />
                      <button onClick={() => hasDockerfile ? handleStartBuild() : setStep('dockerfile')} className="w-full bg-primary/10 text-primary py-2 rounded-lg font-medium hover:bg-primary/90 text-sm">
                        {hasDockerfile ? '▶️ Deploy to Local' : 'Next Step'}
                      </button>
                    </>
                  ) : (
                    <>
                      <h3 className="text-sm font-bold mb-3 text-yellow-400">2. Missing Dockerfile</h3>
                      <textarea value={dockerfileContent} onChange={(e) => setDockerfileContent(e.target.value)} placeholder="FROM node:18..." className="w-full h-32 bg-secondary border border-border rounded-lg p-2 text-xs font-mono mb-4 focus:border-yellow-500/50 outline-none" />
                      <button onClick={handleStartBuild} disabled={!dockerfileContent} className="w-full bg-primary/10 text-primary py-2 rounded-lg font-medium hover:bg-primary/90 text-sm disabled:opacity-50">
                        ▶️ Deploy to Local
                      </button>
                    </>
                  )}
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
                  step={step as 's3-folder' | 's3-framework' | 's3-env'}
                  setStep={setStep}
                  onDeploying={() => setStep('deploying')}
                  onComplete={(url) => {
                    setPublicUrl(url);
                    saveDeployedProject(url);
                    setStep('complete');
                  }}
                  addLog={addLog}
                  socketRef={socketRef}
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
        </div>

        {/* RIGHT COLUMN - TERMINAL LOGS */}
        <div className="flex-1 bg-[#0a0a0a] border border-border rounded-xl overflow-hidden shadow-2xl flex flex-col h-full">
          {/* Progress Tracker Header */}
          <div className="bg-[#111] px-6 py-4 border-b border-border flex items-center justify-between overflow-x-auto">
            <div className="flex items-center gap-4">
              <div className={`flex items-center gap-2 text-xs whitespace-nowrap ${step !== 'cloning' ? 'text-success' : 'text-primary'}`}>
                {step === 'cloning' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Clone
              </div>
              <div className="w-4 h-[1px] bg-secondary" />
              <div className={`flex items-center gap-2 text-xs whitespace-nowrap ${step === 'cloning' ? 'text-muted-foreground' : ['review', 'type', 'env', 'dockerfile', 'aws', 'azure', 's3-folder', 's3-framework', 's3-env', 'deploying', 'complete'].includes(step) ? 'text-success' : 'text-primary'}`}>
                {step === 'cloning' ? <div className="w-4 h-4 rounded-full border border-border" /> : ['review', 'type', 'env', 'dockerfile', 'aws', 'azure', 's3-folder', 's3-framework', 's3-env', 'deploying', 'complete'].includes(step) ? <CheckCircle2 className="w-4 h-4" /> : <Loader2 className="w-4 h-4 animate-spin" />} Configure
              </div>
              <div className="w-4 h-[1px] bg-secondary" />
              <div className={`flex items-center gap-2 text-xs whitespace-nowrap ${['cloning', 'review', 'type', 'env', 'dockerfile', 'aws', 'azure', 's3-folder', 's3-framework', 's3-env'].includes(step) ? 'text-muted-foreground' : step === 'complete' ? 'text-success' : 'text-primary'}`}>
                {['cloning', 'review', 'type', 'env', 'dockerfile', 'aws', 'azure', 's3-folder', 's3-framework', 's3-env'].includes(step) ? <div className="w-4 h-4 rounded-full border border-border" /> : step === 'complete' ? <CheckCircle2 className="w-4 h-4" /> : <Loader2 className="w-4 h-4 animate-spin" />} Deploy
              </div>
            </div>
            {step === 'complete' && (
              <div className="flex items-center gap-3 ml-4">
                <span className="bg-success/10 text-success px-3 py-1 rounded-full text-xs font-bold animate-pulse">LIVE</span>
                {publicUrl && (
                  <a
                    href={publicUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-xs text-success hover:underline"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Open S3 site
                  </a>
                )}
              </div>
            )}
          </div>
          
          {/* The Terminal Screen */}
          <div className="p-5 flex-1 overflow-y-auto font-mono text-[13px] leading-relaxed space-y-1 bg-[#050505]">
            {logs.map((log) => (
              <div key={log.id} className="flex gap-4">
                <span className="text-foreground/20 shrink-0 select-none">[{log.time}]</span>
                <span className={`
                  ${log.type === 'error' ? 'text-destructive' : ''}
                  ${log.type === 'success' ? 'text-success font-bold' : ''}
                  ${log.type === 'system' ? 'text-primary' : ''}
                  ${log.type === 'info' ? 'text-foreground' : ''}
                `}>
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
        </div>

      </div>
    </div>
  );
}
