import React from 'react';
import { GitBranch, Plus, RefreshCcw } from 'lucide-react';
import FeedbackState from './FeedbackState';

const NoRepositoriesState: React.FC = () => {
  return (
    <FeedbackState
      tone="info"
      icon={GitBranch}
      title="No repositories connected"
      description="Connect a GitHub repository to start automated deployments, monitor builds, and view runtime insights in one place."
      actions={[
        { label: 'Connect GitHub', href: '/login' },
        { label: 'Refresh', onClick: () => window.location.reload(), variant: 'secondary' },
      ]}
      illustration={
        <div className="mx-auto flex items-center justify-center gap-3 text-muted-foreground">
          <div className="rounded-2xl border border-border bg-secondary p-4">
            <GitBranch className="h-7 w-7" />
          </div>
          <Plus className="h-5 w-5" />
          <div className="rounded-2xl border border-border bg-secondary p-4 text-primary">
            <GitBranch className="h-7 w-7" />
          </div>
        </div>
      }
    />
  );
};

export default NoRepositoriesState;
