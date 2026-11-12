import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useSearchParams } from 'react-router-dom';
import LiveProgressBar from '@/components/deployments/LiveProgressBar';
import TerminalStream from '@/components/deployments/TerminalStream';
import DeploymentTimeline from '@/components/deployments/DeploymentTimeline';
import { axiosClient } from '@/services/api/axios-client';

const STEPS = [
  'Preparing Deployment',
  'Cloning Repository',
  'Detecting Framework',
  'Generating Dockerfile',
  'Building Docker Image',
  'Pushing to AWS ECR',
  'Deploying to ECS',
  'Deployment Successful',
];

const phaseToStep: Record<string, number> = {
  preparation: 0,
  clone: 1,
  framework_detection: 2,
  dockerfile_generation: 3,
  docker_build: 4,
  push_ecr: 5,
  ecs_deploy: 6,
  dns_setup: 6,
  complete: 7,
};

type DeploymentLog = {
  timestamp?: string;
  source?: string;
  message?: string;
};

type DeploymentDetails = {
  _id: string;
  status: string;
  phase: string;
  publicUrl?: string;
  error?: {
    message?: string;
  };
};

export default function DeploymentLogsPage() {
  const [searchParams] = useSearchParams();
  const deploymentId = searchParams.get('deploymentId') || '';

  const [deployment, setDeployment] = useState<DeploymentDetails | null>(null);
  const [logs, setLogs] = useState<DeploymentLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!deploymentId) {
      setError('Missing deploymentId. Start a deployment from the dashboard to view real logs.');
      setLoading(false);
      return;
    }

    let disposed = false;

    const fetchDeployment = async () => {
      try {
        const [statusResponse, logsResponse] = await Promise.all([
          axiosClient.get(`/api/deploy/${deploymentId}`),
          axiosClient.get(`/api/deploy/${deploymentId}/logs`, { params: { limit: 200 } }),
        ]);

        if (disposed) return;

        const nextDeployment = statusResponse?.data?.deployment || null;
        const nextLogs = Array.isArray(logsResponse?.data?.logs) ? logsResponse.data.logs : [];

        setDeployment(nextDeployment);
        setLogs(
          [...nextLogs].sort((a: DeploymentLog, b: DeploymentLog) => {
            const aTime = a?.timestamp ? new Date(a.timestamp).getTime() : 0;
            const bTime = b?.timestamp ? new Date(b.timestamp).getTime() : 0;
            return aTime - bTime;
          })
        );
        setError(null);
      } catch (fetchError: any) {
        if (disposed) return;
        setError(fetchError?.response?.data?.error || fetchError?.message || 'Unable to load deployment logs.');
      } finally {
        if (!disposed) {
          setLoading(false);
        }
      }
    };

    void fetchDeployment();
    const timer = setInterval(fetchDeployment, 3000);

    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [deploymentId]);

  const currentStep = useMemo(() => {
    if (!deployment) return 0;
    if (deployment.status === 'success') return STEPS.length - 1;
    return phaseToStep[deployment.phase] ?? 0;
  }, [deployment]);

  const progress = useMemo(() => {
    if (!deployment) return 0;
    if (deployment.status === 'success') return 100;

    const stepPortion = Math.max(1, STEPS.length - 1);
    const base = (Math.min(currentStep, stepPortion) / stepPortion) * 100;

    if (deployment.status === 'failed' || deployment.status === 'cancelled') {
      return Math.max(5, Math.round(base));
    }

    return Math.min(95, Math.max(5, Math.round(base + 8)));
  }, [deployment, currentStep]);

  const isRunning = deployment ? !['success', 'failed', 'cancelled'].includes(deployment.status) : false;

  const timeline = useMemo(() => {
    return STEPS.map((label, index) => {
      if ((deployment?.status === 'failed' || deployment?.status === 'cancelled') && index === currentStep) {
        return { label, status: 'failed' };
      }
      if (index < currentStep) {
        return { label, status: 'success' };
      }
      if (index === currentStep && isRunning) {
        return { label, status: 'running' };
      }
      if (deployment?.status === 'success' && index === currentStep) {
        return { label, status: 'success' };
      }
      return { label, status: 'pending' };
    });
  }, [currentStep, deployment, isRunning]);

  const renderedLogs = logs.map((log) => {
    const ts = log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : '';
    const source = log.source ? `[${log.source}] ` : '';
    return `${ts ? `[${ts}] ` : ''}${source}${log.message || ''}`.trim();
  });

  return (
    <>
      <main className="space-y-8">
        <div className="max-w-6xl mx-auto">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
            <h1 className="text-3xl font-bold text-foreground">Deployment Logs</h1>
            <p className="text-muted-foreground">Showing only real-time backend logs for this deployment.</p>
          </motion.div>

          {error && (
            <div className="mb-4 rounded-xl border border-destructive bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              <div className=" bg-card border border-border rounded-xl p-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-full">
                    <LiveProgressBar steps={STEPS} current={currentStep} progress={progress} />
                  </div>
                </div>
                <TerminalStream logs={renderedLogs} />
              </div>

              <div className=" bg-card border border-border rounded-xl p-4">
                <h3 className="text-lg font-semibold text-foreground mb-3">Deployment Timeline</h3>
                <DeploymentTimeline steps={timeline as any} />
              </div>
            </div>

            <div className="space-y-4">
              <div className=" bg-card border border-border rounded-xl p-4">
                <h3 className="text-lg font-semibold text-foreground mb-2">Live Preview</h3>
                <div className="text-sm text-foreground mb-3">Live URL</div>
                <div className="flex items-center gap-2">
                  {deployment?.publicUrl ? (
                    <a href={deployment.publicUrl} target="_blank" rel="noreferrer" className="px-3 py-2 rounded-md bg-secondary hover:bg-secondary truncate">
                      {deployment.publicUrl}
                    </a>
                  ) : (
                    <span className="px-3 py-2 rounded-md bg-secondary text-muted-foreground">Not available yet</span>
                  )}
                </div>
              </div>

              <div className=" bg-card border border-border rounded-xl p-4">
                <h3 className="text-lg font-semibold text-foreground mb-2">Status</h3>
                <div className="text-sm text-foreground mb-2">{loading ? 'Loading...' : deployment?.status || 'Unknown'}</div>
                <div className="text-xs text-muted-foreground">Phase: {deployment?.phase || 'N/A'}</div>
                {deployment?.error?.message && (
                  <div className="mt-2 text-xs text-destructive">{deployment.error.message}</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
