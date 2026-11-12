import React from 'react';
import { CloudOff, RefreshCw, KeyRound } from 'lucide-react';
import FeedbackState from './FeedbackState';

const AWSConnectionErrorState: React.FC = () => {
  return (
    <FeedbackState
      tone="error"
      icon={CloudOff}
      title="AWS connection error"
      description="CloudOps could not reach your AWS account. Check credentials, region settings, and IAM permissions, then reconnect to continue deployments."
      actions={[
        { label: 'Reconnect AWS', href: '/settings' },
        { label: 'Retry', onClick: () => window.location.reload(), variant: 'secondary' },
      ]}
      illustration={
        <div className="mx-auto flex items-center gap-3 text-muted-foreground">
          <div className="rounded-2xl border border-destructive bg-destructive/10 p-4 text-destructive">
            <CloudOff className="h-6 w-6" />
          </div>
          <RefreshCw className="h-5 w-5" />
          <div className="rounded-2xl border border-border bg-secondary p-4 text-primary">
            <KeyRound className="h-6 w-6" />
          </div>
        </div>
      }
    />
  );
};

export default AWSConnectionErrorState;
