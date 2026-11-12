import React from 'react';
import { motion } from 'framer-motion';
import { ExternalLink, GitBranch, GitCommit, Loader2 } from 'lucide-react';

interface DeploymentHeaderProps {
  deploymentName: string;
  repoUrl: string;
  repoName: string;
  branch: string;
  commitId: string;
  commitMessage?: string;
  overallProgress: number;
  status: 'pending' | 'in-progress' | 'success' | 'failed';
  deploymentUrl?: string;
}

const DeploymentHeader: React.FC<DeploymentHeaderProps> = ({
  deploymentName,
  repoUrl,
  repoName,
  branch,
  commitId,
  commitMessage,
  overallProgress,
  status,
  deploymentUrl,
}) => {
  const getStatusBadgeColor = () => {
    switch (status) {
      case 'success':
        return 'bg-success/10 text-success border-success';
      case 'failed':
        return 'bg-destructive/10 text-destructive border-destructive';
      case 'in-progress':
        return 'bg-primary/10 text-primary border-primary';
      default:
        return 'bg-secondary text-muted-foreground border-border';
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'success':
        return 'Deployed Successfully';
      case 'failed':
        return 'Deployment Failed';
      case 'in-progress':
        return 'Deploying...';
      default:
        return 'Pending';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-8 space-y-4"
    >
      {/* Title and Status */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-2">
            {deploymentName}
          </h1>
          <p className="text-muted-foreground text-sm">{commitMessage || 'Deployment in progress'}</p>
        </div>

        {/* Status Badge with Animation */}
        <motion.div
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg border ${getStatusBadgeColor()}`}
          animate={status === 'in-progress' ? { scale: [1, 1.05, 1] } : {}}
          transition={{ duration: 2, repeat: status === 'in-progress' ? Infinity : 0 }}
        >
          {status === 'in-progress' && (
            <Loader2 className="w-4 h-4 animate-spin" />
          )}
          <span className="text-sm font-semibold">{getStatusText()}</span>
        </motion.div>
      </div>

      {/* Progress Bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-muted-foreground">Overall Progress</span>
          <span className="text-sm font-semibold text-primary">{overallProgress}%</span>
        </div>
        <div className="relative h-2 bg-secondary rounded-full overflow-hidden border border-border">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${overallProgress}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className={`h-full rounded-full ${
              status === 'success'
                ? 'bg-gradient-to-r from-emerald-500 to-emerald-400'
                : status === 'failed'
                ? 'bg-gradient-to-r from-red-500 to-red-400'
                : 'bg-gradient-to-r from-cyan-500 to-blue-500'
            }`}
            style={{
              boxShadow: `0 0 20px ${
                status === 'success'
                  ? 'rgb(16, 185, 129, 0.5)'
                  : status === 'failed'
                  ? 'rgb(239, 68, 68, 0.5)'
                  : 'rgb(34, 211, 238, 0.5)'
              }`,
            }}
          />
        </div>
      </div>

      {/* Meta Information Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Repository */}
        <div className="bg-secondary border border-border rounded-lg p-3 hover:border-primary transition-colors">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Repository</p>
          <a
            href={repoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-primary hover:text-primary flex items-center gap-2 group transition-colors"
          >
            <span className="truncate">{repoName}</span>
            <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
          </a>
        </div>

        {/* Branch */}
        <div className="bg-secondary border border-border rounded-lg p-3 hover:border-primary transition-colors">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Branch</p>
          <div className="text-sm font-medium text-foreground flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-blue-400" />
            <span className="truncate">{branch}</span>
          </div>
        </div>

        {/* Commit ID */}
        <div className="bg-secondary border border-border rounded-lg p-3 hover:border-primary transition-colors">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Commit</p>
          <div className="text-sm font-medium text-foreground flex items-center gap-2">
            <GitCommit className="w-4 h-4 text-purple-400" />
            <code className="truncate font-mono text-xs">{commitId.substring(0, 8)}</code>
          </div>
        </div>

        {/* Deployment URL (if available) */}
        {deploymentUrl && (
          <div className="bg-secondary border border-border rounded-lg p-3 hover:border-primary transition-colors">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Live URL</p>
            <a
              href={deploymentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-success hover:text-success flex items-center gap-2 group transition-colors"
            >
              <span className="truncate">Visit Live</span>
              <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
            </a>
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default DeploymentHeader;
