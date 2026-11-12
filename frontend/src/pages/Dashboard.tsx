import React, { Suspense, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Activity,
  CheckCircle2,
  Clock3,
  TrendingUp,
  ArrowRight,
  Github,
  Plus,
  Loader2,
} from 'lucide-react';
import {
  PageHeader,
  Card,
  Button,
  Skeleton,
} from '@/components/ui';
import { authService, deploymentService } from '@/services/auth-service';

const RepoList = React.lazy(() => import('@/components/dashboard/RepoList'));


export default function DashboardPage() {
  const [deploymentStats, setDeploymentStats] = useState({
    total: 0,
    success: 0,
    active: 0,
    failed: 0,
    avgTime: 0,
  });

  const { data: allDeployments, isLoading } = useQuery({
    queryKey: ['all-deployments'],
    queryFn: async () => {
      try {
        const meResponse = await authService.getMe();
        const meData = meResponse?.data as any;
        const userId = String(meData?.user?.id || '');
        
        const response = await deploymentService.getAll({ userId });
        const responseData = response.data as any;
        const deployments = Array.isArray(responseData) ? responseData : responseData?.deployments || responseData?.data || [];
        return deployments as any[];
      } catch (error) {
        console.error('Error fetching deployments:', error);
        return [];
      }
    },
    refetchInterval: 30000,
  });

  // Calculate stats from real data
  useEffect(() => {
    if (allDeployments && allDeployments.length > 0) {
      const successful = allDeployments.filter(d => d.status === 'success').length;
      const active = allDeployments.filter(d => d.status === 'building' || d.status === 'deploying' || d.status === 'pending').length;
      const failed = allDeployments.filter(d => d.status === 'failed').length;
      
      const completedWithTime = allDeployments
        .filter(d => d.totalTime && d.status === 'success')
        .map(d => d.totalTime || 0);
      
      const avgTime = completedWithTime.length > 0
        ? completedWithTime.reduce((a, b) => a + b, 0) / completedWithTime.length
        : 0;

      setDeploymentStats({
        total: allDeployments.length,
        success: successful,
        active: active,
        failed: failed,
        avgTime: avgTime,
      });
    }
  }, [allDeployments]);

  const formatDuration = (ms?: number) => {
    if (!ms || Number.isNaN(ms)) return '0s';
    const seconds = ms / 1000;
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    const minutes = Math.floor(seconds / 60);
    const remaining = Math.round(seconds % 60);
    return `${minutes}m ${remaining}s`;
  };

  const successRate = deploymentStats.total > 0 
    ? ((deploymentStats.success / deploymentStats.total) * 100).toFixed(1) 
    : '0';

  const stats = [
    {
      icon: TrendingUp,
      label: 'Total Deployments',
      value: String(deploymentStats.total),
      description: 'All time',
      tone: 'primary',
    },
    {
      icon: CheckCircle2,
      label: 'Success Rate',
      value: `${successRate}%`,
      description: 'Successful',
      tone: 'success',
    },
    {
      icon: Activity,
      label: 'Active',
      value: String(deploymentStats.active),
      description: 'In progress',
      tone: 'warning',
    },
    {
      icon: Clock3,
      label: 'Avg Time',
      value: formatDuration(deploymentStats.avgTime),
      description: 'Deployment',
      tone: 'neutral',
    },
  ];

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Real-time deployment metrics and repository management."
        actions={
          <Link to="/deployments">
            <Button variant="outline" size="sm" className="gap-2">
              View all deployments
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        }
      />

      {/* Metrics Grid */}
      <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        <span className="h-2 w-2 bg-primary" aria-hidden />
        Deployment overview
      </div>
      <div className="mb-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.08 }}
            >
              <Card className={`group border-t-2 p-5 transition-colors hover:border-primary ${
                stat.tone === 'success'
                  ? 'border-t-success'
                  : stat.tone === 'warning'
                    ? 'border-t-warning'
                    : stat.tone === 'neutral'
                      ? 'border-t-border'
                      : 'border-t-primary'
              }`}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{stat.label}</p>
                    <p className="mt-3 font-mono text-3xl font-semibold tracking-tight text-foreground">{stat.value}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{stat.description}</p>
                  </div>
                  <Icon className="h-5 w-5 text-muted-foreground" aria-hidden />
                </div>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* GitHub Repositories Section */}
      <section>
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Github className="h-6 w-6 text-foreground" />
                <h2 className="font-display text-xl font-semibold text-foreground">GitHub repositories</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                Connect your GitHub repositories to deploy with CloudOps.
              </p>
            </div>
            <Link to="/deploy">
              <Button size="sm" className="gap-2">
                <Plus className="h-4 w-4" />
                Connect Repository
              </Button>
            </Link>
          </div>

          <Suspense
            fallback={
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Card key={i} className="p-6 border-border/60 bg-card/50">
                    <div className="space-y-4">
                      <Skeleton className="h-6 w-3/4 rounded" />
                      <Skeleton className="h-4 w-full rounded" />
                      <Skeleton className="h-4 w-1/2 rounded" />
                      <div className="flex gap-2 pt-4">
                        <Skeleton className="h-8 w-20 rounded" />
                        <Skeleton className="h-8 w-20 rounded" />
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            }
          >
            <RepoList />
          </Suspense>
        </div>
      </section>
    </>
  );
}
