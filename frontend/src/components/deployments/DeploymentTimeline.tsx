import React from 'react';
import { motion } from 'framer-motion';

const statusColor = (s: 'pending' | 'running' | 'success' | 'failed') => {
  switch (s) {
    case 'running':
      return 'bg-yellow-400';
    case 'success':
      return 'bg-success';
    case 'failed':
      return 'bg-destructive';
    default:
      return 'bg-secondary';
  }
};

const DeploymentTimeline: React.FC<{ steps: { label: string; status: string }[] }> = ({ steps }) => {
  return (
    <div className="space-y-3">
      {steps.map((s, i) => (
        <motion.div key={s.label} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.06 }} className="flex items-start gap-3">
          <div className={`mt-1 h-3 w-3 ${statusColor(s.status as any)}`} />
          <div>
            <div className="text-sm text-foreground font-medium">{s.label}</div>
            <div className="text-xs text-muted-foreground">{s.status}</div>
          </div>
        </motion.div>
      ))}
    </div>
  );
};

export default DeploymentTimeline;
