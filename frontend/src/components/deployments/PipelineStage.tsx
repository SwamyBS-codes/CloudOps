import React from 'react';
import { motion } from 'framer-motion';
import { LucideIcon, AlertCircle } from 'lucide-react';

interface PipelineStageProps {
  stage: number;
  totalStages: number;
  label: string;
  status: 'pending' | 'in-progress' | 'success' | 'failed';
  icon: LucideIcon;
  timestamp?: string;
  logs?: string[];
  isLast?: boolean;
}

const PipelineStage: React.FC<PipelineStageProps> = ({
  stage,
  totalStages,
  label,
  status,
  icon: Icon,
  timestamp,
  logs = [],
  isLast = false,
}) => {
  const getStatusColor = () => {
    switch (status) {
      case 'success':
        return 'bg-success/10 border-success';
      case 'failed':
        return 'bg-destructive/10 border-destructive';
      case 'in-progress':
        return 'bg-primary/10 border-primary';
      default:
        return 'bg-secondary border-border';
    }
  };

  const getIconColor = () => {
    switch (status) {
      case 'success':
        return 'text-success';
      case 'failed':
        return 'text-destructive';
      case 'in-progress':
        return 'text-primary';
      default:
        return 'text-muted-foreground';
    }
  };

  const getGlowColor = () => {
    switch (status) {
      case 'success':
        return 'shadow-lg shadow-emerald-500/30';
      case 'failed':
        return 'shadow-lg shadow-red-500/30';
      case 'in-progress':
        return 'shadow-lg shadow-cyan-500/50';
      default:
        return 'shadow-lg shadow-slate-500/20';
    }
  };

  const isCompleted = status === 'success';
  const progressPercentage = isCompleted ? 100 : status === 'in-progress' ? 50 : 0;

  return (
    <div className="relative flex flex-col items-center lg:flex-row w-full lg:flex-1">
      {/* Vertical stage container */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: stage * 0.1 }}
        className="flex flex-col items-center w-full"
      >
        {/* Stage indicator circle */}
        <motion.div
          className={`relative w-16 h-16 rounded-full border-2 flex items-center justify-center transition-all duration-500 ${getStatusColor()} ${
            status === 'in-progress' ? getGlowColor() : ''
          }`}
          animate={
            status === 'in-progress'
              ? {
                  boxShadow: [
                    `0 0 20px rgba(34, 211, 238, 0.3)`,
                    `0 0 40px rgba(34, 211, 238, 0.6)`,
                    `0 0 20px rgba(34, 211, 238, 0.3)`,
                  ],
                }
              : {}
          }
          transition={{
            duration: 2,
            repeat: status === 'in-progress' ? Infinity : 0,
            ease: 'easeInOut',
          }}
        >
          {/* Progress ring background */}
          <svg
            className="absolute inset-0 w-full h-full -rotate-90"
            style={{ filter: 'drop-shadow(0 0 8px rgba(34, 211, 238, 0.2))' }}
          >
            <circle
              cx="32"
              cy="32"
              r="28"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="text-foreground"
            />
            <motion.circle
              cx="32"
              cy="32"
              r="28"
              fill="none"
              strokeWidth="2"
              className={`${getIconColor()} transition-all duration-500`}
              strokeDasharray={`${2 * Math.PI * 28}`}
              strokeDashoffset={`${2 * Math.PI * 28 * (1 - progressPercentage / 100)}`}
              strokeLinecap="round"
            />
          </svg>

          {/* Icon or status indicator */}
          <motion.div
            animate={status === 'in-progress' ? { rotate: 360 } : {}}
            transition={{
              duration: 2,
              repeat: status === 'in-progress' ? Infinity : 0,
              ease: 'linear',
            }}
            className="relative z-10"
          >
            {status === 'failed' ? (
              <AlertCircle className={`w-7 h-7 ${getIconColor()}`} />
            ) : (
              <Icon className={`w-7 h-7 ${getIconColor()}`} />
            )}
          </motion.div>
        </motion.div>

        {/* Stage label and status */}
        <div className="mt-3 text-center">
          <p className="text-sm font-semibold text-foreground">{label}</p>
          <p className={`text-xs mt-1 capitalize ${
            status === 'success'
              ? 'text-success'
              : status === 'failed'
              ? 'text-destructive'
              : status === 'in-progress'
              ? 'text-primary font-semibold'
              : 'text-muted-foreground'
          }`}>
            {status === 'in-progress' ? '● In Progress' : status}
          </p>
          {timestamp && (
            <p className="text-xs text-muted-foreground mt-1">{timestamp}</p>
          )}
        </div>

        {/* Logs preview tooltip */}
        {logs.length > 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileHover={{ opacity: 1, scale: 1 }}
            className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-secondary border border-border rounded-lg p-2 max-w-xs pointer-events-none group-hover:pointer-events-auto z-20 hidden group-hover:block"
          >
            <p className="text-xs text-muted-foreground font-mono line-clamp-3">
              {logs[logs.length - 1]}
            </p>
          </motion.div>
        )}
      </motion.div>

      {/* Connector line (horizontal on desktop, vertical on mobile) */}
      {!isLast && (
        <>
          {/* Desktop connector */}
          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ delay: stage * 0.1 + 0.2, duration: 0.6 }}
            className="hidden lg:block absolute top-8 left-1/2 h-0.5 w-[calc(100%-4rem)] origin-left"
            style={{
              background: isCompleted
                ? 'linear-gradient(to right, rgb(16, 185, 129), rgb(16, 185, 129))'
                : status === 'in-progress'
                ? 'linear-gradient(to right, rgb(16, 185, 129), rgb(34, 211, 238), rgb(100, 116, 139))'
                : 'linear-gradient(to right, rgb(100, 116, 139), rgb(100, 116, 139))',
            }}
          />

          {/* Mobile connector */}
          <motion.div
            initial={{ scaleY: 0 }}
            animate={{ scaleY: 1 }}
            transition={{ delay: stage * 0.1 + 0.2, duration: 0.6 }}
            className="lg:hidden w-0.5 h-12 origin-top mt-2"
            style={{
              background: isCompleted
                ? 'linear-gradient(to bottom, rgb(16, 185, 129), rgb(16, 185, 129))'
                : status === 'in-progress'
                ? 'linear-gradient(to bottom, rgb(16, 185, 129), rgb(34, 211, 238), rgb(100, 116, 139))'
                : 'linear-gradient(to bottom, rgb(100, 116, 139), rgb(100, 116, 139))',
            }}
          />
        </>
      )}
    </div>
  );
};

export default PipelineStage;
