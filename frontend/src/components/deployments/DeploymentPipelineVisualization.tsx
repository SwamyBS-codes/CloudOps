import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Package,
  Cog,
  Download,
  Box,
  Cloud,
  Rocket,
  Globe,
  CheckCircle2,
  AlertTriangle,
  LucideIcon,
  Play,
  RotateCcw,
  Maximize2,
  XCircle,
  Terminal,
} from 'lucide-react';

const PipelineStage: React.FC<{
  stage: number;
  totalStages: number;
  label: string;
  status: string;
  icon: LucideIcon;
  timestamp?: string;
  logs?: string[];
  isLast: boolean;
}> = ({ label, status, icon: Icon, isLast }) => {
  const isDone = status === 'success';
  const isInProgress = status === 'in-progress';
  const isFailed = status === 'failed';

  return (
    <div className="flex items-center gap-2">
      <div
        className={`flex h-10 w-10 items-center justify-center rounded-xl border text-xs font-medium transition ${
          isDone
            ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-400'
            : isInProgress
              ? 'border-primary/40 bg-primary/10 text-primary animate-pulse'
              : isFailed
                ? 'border-destructive/40 bg-destructive/10 text-destructive'
                : 'border-border bg-secondary text-muted-foreground'
        }`}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-[80px]">
        <div className="text-xs font-medium text-foreground">{label}</div>
        <div className="text-[10px] capitalize text-muted-foreground">{status}</div>
      </div>
      {!isLast && <div className="h-0.5 w-6 bg-border" />}
    </div>
  );
};

const DeploymentHeader: React.FC<any> = ({
  deploymentName,
  repoName,
  branch,
  status,
  progress,
  deploymentUrl,
}) => (
  <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 className="text-xl font-bold text-foreground">{deploymentName || repoName || 'Deployment Pipeline'}</h1>
        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
          <span>Branch: {branch || 'main'}</span>
          <span>•</span>
          <span className="capitalize">{status}</span>
          {deploymentUrl && (
            <>
              <span>•</span>
              <a href={deploymentUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                {deploymentUrl}
              </a>
            </>
          )}
        </div>
      </div>
      {typeof progress === 'number' && (
        <div className="w-36 text-right">
          <div className="text-xs font-semibold text-foreground">{Math.round(progress)}%</div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
            <div className="h-full bg-primary transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}
    </div>
  </div>
);

const LiveLogsPanel: React.FC<{
  logs?: any[];
  isLoading?: boolean;
  onFullScreen?: () => void;
  onClear?: () => void;
}> = ({ logs = [], onClear }) => (
  <div className="flex flex-col h-[400px] rounded-2xl border border-border bg-[#0C0C0C] p-4 font-mono text-xs text-neutral-300 shadow-inner">
    <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-3">
      <div className="flex items-center gap-2 text-xs text-neutral-400">
        <Terminal className="h-3.5 w-3.5" />
        <span>Live Logs</span>
      </div>
      {onClear && (
        <button type="button" onClick={onClear} className="text-[11px] text-neutral-500 hover:text-white">
          Clear
        </button>
      )}
    </div>
    <div className="flex-1 overflow-y-auto space-y-1">
      {logs.map((log: any, idx: number) => (
        <div key={idx} className="leading-relaxed">
          <span className="text-neutral-600 mr-2">[{log.timestamp || `${idx}`}]</span>
          <span className={log.level === 'error' ? 'text-destructive' : log.level === 'success' ? 'text-emerald-400' : 'text-neutral-300'}>
            {log.message}
          </span>
        </div>
      ))}
      {logs.length === 0 && (
        <div className="text-neutral-600 text-center py-10">No log output yet...</div>
      )}
    </div>
  </div>
);

const PipelineControls: React.FC<{
  status?: string;
  onRetry?: () => void;
  onCancel?: () => void;
  onFullScreen?: () => void;
  onRollback?: () => void;
  isLoading?: boolean;
}> = ({ onRetry, onCancel, isLoading }) => (
  <div className="flex flex-wrap items-center gap-2">
    {onRetry && (
      <button
        type="button"
        disabled={isLoading}
        onClick={onRetry}
        className="inline-flex items-center gap-1.5 rounded-xl border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 disabled:opacity-50"
      >
        <RotateCcw className="h-3.5 w-3.5" />
        Retry
      </button>
    )}
    {onCancel && (
      <button
        type="button"
        disabled={isLoading}
        onClick={onCancel}
        className="inline-flex items-center gap-1.5 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/20 disabled:opacity-50"
      >
        <XCircle className="h-3.5 w-3.5" />
        Cancel
      </button>
    )}
  </div>
);

interface StageConfig {
  label: string;
  icon: LucideIcon;
  status: 'pending' | 'in-progress' | 'success' | 'failed';
  timestamp?: string;
  logs?: string[];
}

interface LogEntry {
  timestamp: string;
  message: string;
  level: 'info' | 'success' | 'error' | 'warning';
  source?: string;
}

interface DeploymentPipelineVisualizationProps {
  deploymentId?: string;
  deploymentName?: string;
  repoName?: string;
  repoUrl?: string;
  branch?: string;
  commitId?: string;
  commitMessage?: string;
  deploymentUrl?: string;
  stages?: StageConfig[];
  logs?: LogEntry[];
  status?: 'pending' | 'in-progress' | 'success' | 'failed';
  overallProgress?: number;
  onRetry?: () => void;
  onCancel?: () => void;
  onRollback?: () => void;
  onFullScreenLogs?: () => void;
  onClearLogs?: () => void;
  isLoading?: boolean;
  showFlightAnimation?: boolean;
}

// Mock data for demo
const DEFAULT_STAGES: StageConfig[] = [
  {
    label: 'GitHub Commit',
    icon: Package,
    status: 'success',
    timestamp: '2 sec ago',
    logs: ['Detected new commit: abc123def'],
  },
  {
    label: 'Build Started',
    icon: Cog,
    status: 'success',
    timestamp: '5 sec ago',
    logs: ['Build environment initialized'],
  },
  {
    label: 'Installing Dependencies',
    icon: Download,
    status: 'success',
    timestamp: '12 sec ago',
    logs: ['npm install completed: 245 packages'],
  },
  {
    label: 'Docker Image Build',
    icon: Box,
    status: 'success',
    timestamp: '25 sec ago',
    logs: ['Docker image built: cloudops:v1.2.3'],
  },
  {
    label: 'Pushing to AWS ECR',
    icon: Cloud,
    status: 'in-progress',
    timestamp: 'Just now',
    logs: ['Uploading to AWS ECR repository...'],
  },
  {
    label: 'Deploying to ECS',
    icon: Rocket,
    status: 'pending',
    logs: [],
  },
  {
    label: 'NGINX Routing Setup',
    icon: Globe,
    status: 'pending',
    logs: [],
  },
  {
    label: 'Live Deployment',
    icon: CheckCircle2,
    status: 'pending',
    logs: [],
  },
];

const DEFAULT_LOGS: LogEntry[] = [
  {
    timestamp: '14:32:01',
    message: 'Starting deployment pipeline...',
    level: 'info',
  },
  {
    timestamp: '14:32:02',
    message: 'GitHub webhook received successfully',
    level: 'success',
  },
  {
    timestamp: '14:32:05',
    message: 'Build environment initialized',
    level: 'info',
  },
  {
    timestamp: '14:32:12',
    message: 'npm install completed: 245 packages installed',
    level: 'success',
  },
  {
    timestamp: '14:32:25',
    message: 'Docker image built successfully: cloudops:v1.2.3',
    level: 'success',
  },
  {
    timestamp: '14:32:30',
    message: 'Uploading image to AWS ECR...',
    level: 'info',
  },
];

const DeploymentPipelineVisualization: React.FC<DeploymentPipelineVisualizationProps> = ({
  deploymentId = 'deploy-2024-001',
  deploymentName = 'Production Deployment',
  repoName = 'cloudops/main',
  repoUrl = 'https://github.com/cloudops/main',
  branch = 'main',
  commitId = 'abc123def456gh789ij',
  commitMessage = 'feat: Add deployment visualization',
  deploymentUrl = 'https://app.cloudops.dev',
  stages = DEFAULT_STAGES,
  logs = DEFAULT_LOGS,
  status = 'in-progress',
  overallProgress = 62,
  onRetry,
  onCancel,
  onRollback,
  onFullScreenLogs,
  onClearLogs,
  isLoading = false,
  showFlightAnimation = true,
}) => {
  const [displayLogs, setDisplayLogs] = useState<LogEntry[]>(logs);
  const [isSimulating, setIsSimulating] = useState(false);

  // Simulate log streaming
  useEffect(() => {
    if (!isSimulating) return;

    const interval = setInterval(() => {
      const newLogs = [
        ...displayLogs,
        {
          timestamp: new Date().toLocaleTimeString(),
          message: `Deployment step in progress... (simulated)`,
          level: 'info' as const,
        },
      ];
      setDisplayLogs(newLogs.slice(-50)); // Keep last 50 logs
    }, 2000);

    return () => clearInterval(interval);
  }, [isSimulating, displayLogs]);

  const handleRetry = () => {
    console.log('Retry clicked');
    onRetry?.();
  };

  const handleCancel = () => {
    console.log('Cancel clicked');
    onCancel?.();
  };

  const handleFullScreen = () => {
    console.log('Full screen logs clicked');
    onFullScreenLogs?.();
  };

  const handleClearLogs = () => {
    setDisplayLogs([]);
    onClearLogs?.();
  };

  const handleRollback = () => {
    console.log('Rollback clicked');
    onRollback?.();
  };

  // Calculate overall progress
  const completedStages = stages.filter(s => s.status === 'success').length;
  const progressPercentage = Math.round((completedStages / stages.length) * 100);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="w-full space-y-8"
    >
      {/* Flight Takeoff Animation */}
      {showFlightAnimation && status === 'in-progress' && (
        <motion.div
          initial={{ y: 0, opacity: 0 }}
          animate={{ y: -10, opacity: [0, 1, 0.8] }}
          transition={{
            duration: 3,
            repeat: Infinity,
            repeatDelay: 2,
            ease: 'easeInOut',
          }}
          className="text-center text-4xl"
        >
          ✈️
        </motion.div>
      )}

      {/* Header Section */}
      <DeploymentHeader
        deploymentName={deploymentName}
        repoUrl={repoUrl}
        repoName={repoName}
        branch={branch}
        commitId={commitId}
        commitMessage={commitMessage}
        overallProgress={progressPercentage}
        status={status}
        deploymentUrl={deploymentUrl}
      />

      {/* Main Layout: Pipeline + Logs */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Pipeline Section */}
        <div className="lg:col-span-2">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-secondary border border-border rounded-lg lg:rounded-xl p-6 "
          >
            {/* Desktop: Horizontal Pipeline */}
            <div className="hidden lg:flex flex-col">
              <h2 className="text-lg font-bold text-foreground mb-8">
                Deployment Pipeline
              </h2>
              <div className="flex items-center justify-between gap-2">
                {stages.map((stage, index) => (
                  <PipelineStage
                    key={stage.label}
                    stage={index}
                    totalStages={stages.length}
                    label={stage.label}
                    status={stage.status}
                    icon={stage.icon}
                    timestamp={stage.timestamp}
                    logs={stage.logs}
                    isLast={index === stages.length - 1}
                  />
                ))}
              </div>
            </div>

            {/* Mobile: Vertical Pipeline */}
            <div className="lg:hidden flex flex-col">
              <h2 className="text-lg font-bold text-foreground mb-6">
                Deployment Pipeline
              </h2>
              <div className="flex flex-col items-center gap-0">
                {stages.map((stage, index) => (
                  <PipelineStage
                    key={stage.label}
                    stage={index}
                    totalStages={stages.length}
                    label={stage.label}
                    status={stage.status}
                    icon={stage.icon}
                    timestamp={stage.timestamp}
                    logs={stage.logs}
                    isLast={index === stages.length - 1}
                  />
                ))}
              </div>
            </div>
          </motion.div>

          {/* Controls Section */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="mt-6"
          >
            <PipelineControls
              status={status}
              onRetry={handleRetry}
              onCancel={handleCancel}
              onFullScreen={handleFullScreen}
              onRollback={handleRollback}
              isLoading={isLoading}
            />
          </motion.div>
        </div>

        {/* Live Logs Panel */}
        <div className="lg:col-span-1">
          <LiveLogsPanel
            logs={displayLogs}
            isLoading={status === 'in-progress'}
            onFullScreen={handleFullScreen}
            onClear={handleClearLogs}
          />
        </div>
      </div>

      {/* Footer Info */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="grid grid-cols-2 md:grid-cols-3 gap-4 text-center"
      >
        <div className="bg-secondary border border-border rounded-lg p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
            Status
          </p>
          <p className="text-sm font-semibold text-foreground capitalize">
            {status === 'in-progress' ? '🔄 In Progress' : status}
          </p>
        </div>
        <div className="bg-secondary border border-border rounded-lg p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
            Completed
          </p>
          <p className="text-sm font-semibold text-success">
            {completedStages}/{stages.length} stages
          </p>
        </div>
        <div className="bg-secondary border border-border rounded-lg p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
            Deployment ID
          </p>
          <p className="text-sm font-mono text-primary">{deploymentId}</p>
        </div>
      </motion.div>

      {/* Simulation Toggle Button (for demo) */}
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsSimulating(!isSimulating)}
        className="mx-auto px-4 py-2 bg-secondary border border-border hover:border-primary text-muted-foreground hover:text-primary rounded-lg text-sm font-medium transition-colors"
      >
        {isSimulating ? 'Stop Simulation' : 'Start Log Simulation'}
      </motion.button>
    </motion.div>
  );
};

export default DeploymentPipelineVisualization;
