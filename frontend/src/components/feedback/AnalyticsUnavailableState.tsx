import React from 'react';
import { BarChart3, RefreshCw, ShieldAlert } from 'lucide-react';
import FeedbackState from './FeedbackState';

const AnalyticsUnavailableState: React.FC = () => {
  return (
    <FeedbackState
      tone="warning"
      icon={BarChart3}
      title="Analytics unavailable"
      description="Metrics are temporarily unavailable while the telemetry service reconnects. You can refresh the dashboard or check the status page for updates."
      actions={[
        { label: 'Refresh analytics', onClick: () => window.location.reload() },
        { label: 'Status page', href: '/status', variant: 'secondary' },
      ]}
      illustration={
        <div className="mx-auto flex items-center gap-3 text-warning">
          <div className="rounded-2xl border border-warning bg-warning/10 p-4">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <div className="rounded-2xl border border-border bg-secondary p-4">
            <BarChart3 className="h-6 w-6" />
          </div>
          <RefreshCw className="h-5 w-5 animate-spin" />
        </div>
      }
    />
  );
};

export default AnalyticsUnavailableState;
