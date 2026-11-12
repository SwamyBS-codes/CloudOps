import React from 'react';
import { AlertTriangle, RotateCcw, FileText } from 'lucide-react';
import FeedbackState from './FeedbackState';

const DeploymentFailedState: React.FC = () => {
  return (
    <FeedbackState
      tone="error"
      icon={AlertTriangle}
      title="Deployment failed"
      description="The latest deployment stopped during the release pipeline. Review logs, retry the build, or roll back to the previous healthy version."
      actions={[
        { label: 'Retry deployment', onClick: () => undefined },
        { label: 'View deployments', href: '/deployments', variant: 'secondary' },
      ]}
      illustration={
        <div className="relative mx-auto flex items-center justify-center">
          <div className="absolute h-16 w-16 rounded-full bg-destructive/10 blur-xl" />
          <div className="relative flex items-center gap-3 rounded-2xl border border-destructive bg-destructive/10 px-4 py-3 text-destructive">
            <FileText className="h-5 w-5" />
            <RotateCcw className="h-5 w-5" />
          </div>
        </div>
      }
    />
  );
};

export default DeploymentFailedState;
