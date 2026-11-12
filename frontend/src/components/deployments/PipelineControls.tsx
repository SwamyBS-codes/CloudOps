import React from 'react';
import { motion } from 'framer-motion';
import { 
  RotateCcw, 
  XCircle, 
  Maximize2, 
  RotateCw,
  ChevronDown,
  Loader2 
} from 'lucide-react';

interface PipelineControlsProps {
  status: 'pending' | 'in-progress' | 'success' | 'failed';
  onRetry?: () => void;
  onCancel?: () => void;
  onFullScreen?: () => void;
  onRollback?: () => void;
  isLoading?: boolean;
}

const PipelineControls: React.FC<PipelineControlsProps> = ({
  status,
  onRetry,
  onCancel,
  onFullScreen,
  onRollback,
  isLoading = false,
}) => {
  const canRetry = status === 'failed';
  const canCancel = status === 'in-progress' || status === 'pending';
  const canRollback = status === 'success';

  const buttonVariants = {
    hover: { scale: 1.05, y: -2 },
    tap: { scale: 0.95 },
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col md:flex-row gap-3 flex-wrap"
    >
      {/* Retry Button */}
      {canRetry && onRetry && (
        <motion.button
          variants={buttonVariants}
          whileHover="hover"
          whileTap="tap"
          onClick={onRetry}
          disabled={isLoading}
          className="flex items-center gap-2 px-4 py-2.5 bg-warning/10 hover:bg-warning/90 border border-warning hover:border-warning text-warning rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RotateCcw className="w-4 h-4" />
          <span className="font-medium text-sm">Retry Failed Step</span>
        </motion.button>
      )}

      {/* Cancel Button */}
      {canCancel && onCancel && (
        <motion.button
          variants={buttonVariants}
          whileHover="hover"
          whileTap="tap"
          onClick={onCancel}
          disabled={isLoading}
          className="flex items-center gap-2 px-4 py-2.5 bg-destructive/10 hover:bg-destructive/90 border border-destructive hover:border-destructive text-destructive rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <XCircle className="w-4 h-4" />
          <span className="font-medium text-sm">Cancel Deployment</span>
        </motion.button>
      )}

      {/* Full Screen Button */}
      {onFullScreen && (
        <motion.button
          variants={buttonVariants}
          whileHover="hover"
          whileTap="tap"
          onClick={onFullScreen}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/50 hover:border-blue-500 text-blue-300 rounded-lg transition-all duration-200"
        >
          <Maximize2 className="w-4 h-4" />
          <span className="font-medium text-sm">View Full Logs</span>
        </motion.button>
      )}

      {/* Rollback Button */}
      {canRollback && onRollback && (
        <motion.button
          variants={buttonVariants}
          whileHover="hover"
          whileTap="tap"
          onClick={onRollback}
          disabled={isLoading}
          className="flex items-center gap-2 px-4 py-2.5 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/50 hover:border-purple-500 text-purple-300 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RotateCw className="w-4 h-4" />
          <span className="font-medium text-sm">Rollback</span>
        </motion.button>
      )}

      {/* Loading Indicator */}
      {isLoading && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-secondary border border-border text-muted-foreground rounded-lg">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="font-medium text-sm">Processing...</span>
        </div>
      )}

      {/* No actions available */}
      {!canRetry && !canCancel && !onFullScreen && !canRollback && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-secondary border border-border text-muted-foreground rounded-lg text-sm">
          No actions available
        </div>
      )}
    </motion.div>
  );
};

export default PipelineControls;
