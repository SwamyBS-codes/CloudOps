import React from 'react';
import { History, Rocket, Plus } from 'lucide-react';
import FeedbackState from './FeedbackState';

const NoDeploymentHistoryState: React.FC = () => {
  return (
    <FeedbackState
      tone="neutral"
      icon={History}
      title="No deployment history"
      description="Once you deploy your first service, CloudOps will capture the release timeline, logs, and performance history here."
      actions={[
        { label: 'Deploy first app', href: '/dashboard' },
        { label: 'View repositories', href: '/dashboard', variant: 'secondary' },
      ]}
      illustration={
        <div className="mx-auto flex items-center justify-center gap-3 text-muted-foreground">
          <div className="rounded-2xl border border-border bg-secondary p-4">
            <History className="h-6 w-6" />
          </div>
          <Plus className="h-5 w-5" />
          <div className="rounded-2xl border border-primary bg-primary/10 p-4 text-primary">
            <Rocket className="h-6 w-6" />
          </div>
        </div>
      }
    />
  );
};

export default NoDeploymentHistoryState;
