// @ts-nocheck
/**
 * DEPLOYMENT PIPELINE VISUALIZATION
 * Integration Guide
 * 
 * This guide shows how to integrate the Deployment Pipeline Visualization
 * component into your CloudOps application.
 */

// ============================================================================
// 1. ROUTE SETUP
// ============================================================================

/**
 * Add to your router configuration (e.g., src/app/router.tsx or main routing file)
 */

import { RouteObject } from 'react-router-dom';
import DeploymentPipelineShowcase from '@/pages/DeploymentPipelineShowcase';

// Add to your route configuration:
const deploymentRoutes: RouteObject[] = [
  {
    path: '/deployments/:deploymentId',
    element: <DeploymentDetail />,
  },
  {
    path: '/deployments/:deploymentId/pipeline',
    element: <DeploymentPipelineVisualization />,
  },
  // Demo/showcase route
  {
    path: '/demo/deployment-pipeline',
    element: <DeploymentPipelineShowcase />,
  },
];

// ============================================================================
// 2. PAGE INTEGRATION (React Router)
// ============================================================================

/**
 * Example: src/pages/DeploymentDetail.tsx
 * Integrating the pipeline visualization into your deployment detail page
 */

import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout';
import { 
  DeploymentPipelineVisualization, 
  PipelineStage 
} from '@/components/deployments';
import { deploymentService } from '@/services/deployment-service';
import { Package, Cog, Download, Box, Cloud, Rocket, Globe, CheckCircle2 } from 'lucide-react';
import { io } from 'socket.io-client';

interface DeploymentData {
  _id: string;
  deploymentId: string;
  projectId: string;
  repositoryName: string;
  repositoryUrl: string;
  branch: string;
  commitHash: string;
  commitMessage: string;
  status: 'pending' | 'in-progress' | 'success' | 'failed';
  phase: string;
  publicUrl?: string;
  startedAt: string;
  completedAt?: string;
  stages: Array<{
    name: string;
    status: string;
    timestamp: string;
  }>;
}

interface LogEntry {
  timestamp: string;
  message: string;
  level: 'info' | 'success' | 'error' | 'warning';
  source?: string;
}

export function DeploymentDetailWithPipeline() {
  const { deploymentId } = useParams<{ deploymentId: string }>();
  const navigate = useNavigate();
  
  const [deployment, setDeployment] = useState<DeploymentData | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [socket, setSocket] = useState<any>(null);

  // Fetch initial deployment data
  useEffect(() => {
    const fetchDeployment = async () => {
      try {
        setIsLoading(true);
        const response = await deploymentService.getDeploymentById(deploymentId!);
        setDeployment(response.data);
        setError(null);
      } catch (err) {
        setError('Failed to load deployment details');
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };

    if (deploymentId) {
      fetchDeployment();
    }
  }, [deploymentId]);

  // Setup WebSocket connection for real-time logs
  useEffect(() => {
    if (!deploymentId) return;

    const socketConnection = io(import.meta.env.VITE_API_URL, {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
    });

    // Listen for deployment logs
    socketConnection.emit('join-deployment', { deploymentId });

    socketConnection.on('deployment:log', (logEntry: LogEntry) => {
      setLogs(prev => {
        const newLogs = [...prev, logEntry];
        // Keep only last 100 logs for performance
        return newLogs.slice(-100);
      });
    });

    socketConnection.on('deployment:update', (updateData: any) => {
      setDeployment(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          status: updateData.status,
          phase: updateData.phase,
          stages: updateData.stages,
          completedAt: updateData.completedAt,
        };
      });
    });

    socketConnection.on('error', (error: any) => {
      console.error('Socket error:', error);
      setError('Connection error: ' + error.message);
    });

    setSocket(socketConnection);

    return () => {
      socketConnection.emit('leave-deployment', { deploymentId });
      socketConnection.disconnect();
    };
  }, [deploymentId]);

  // Handle retry deployment
  const handleRetry = async () => {
    try {
      await deploymentService.retryDeployment(deploymentId!);
      // Optional: reset logs when retrying
      setLogs([]);
    } catch (err) {
      setError('Failed to retry deployment');
      console.error(err);
    }
  };

  // Handle cancel deployment
  const handleCancel = async () => {
    if (confirm('Are you sure you want to cancel this deployment?')) {
      try {
        await deploymentService.cancelDeployment(deploymentId!);
      } catch (err) {
        setError('Failed to cancel deployment');
        console.error(err);
      }
    }
  };

  // Handle rollback
  const handleRollback = async () => {
    if (confirm('Are you sure you want to rollback to the previous version?')) {
      try {
        await deploymentService.rollbackDeployment(deploymentId!);
        // Reset to show rollback in progress
        setLogs([]);
      } catch (err) {
        setError('Failed to rollback deployment');
        console.error(err);
      }
    }
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-foreground">Loading deployment details...</div>
        </div>
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-destructive">{error}</div>
        </div>
      </DashboardLayout>
    );
  }

  if (!deployment) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-muted-foreground">Deployment not found</div>
        </div>
      </DashboardLayout>
    );
  }

  // Calculate progress
  const completedStages = deployment.stages?.filter(s => s.status === 'success').length || 0;
  const totalStages = deployment.stages?.length || 8;
  const overallProgress = Math.round((completedStages / totalStages) * 100);

  // Map backend stages to component format
  const stageIcons = [
    Package,
    Cog,
    Download,
    Box,
    Cloud,
    Rocket,
    Globe,
    CheckCircle2,
  ];

  const componentStages = deployment.stages?.map((stage, idx) => ({
    label: stage.name,
    icon: stageIcons[idx] || Package,
    status: stage.status as any,
    timestamp: new Date(stage.timestamp).toLocaleTimeString(),
  })) || [];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <DeploymentPipelineVisualization
          deploymentId={deployment.deploymentId}
          deploymentName={`${deployment.repositoryName} - ${deployment.branch}`}
          repoName={deployment.repositoryName}
          repoUrl={deployment.repositoryUrl}
          branch={deployment.branch}
          commitId={deployment.commitHash}
          commitMessage={deployment.commitMessage}
          deploymentUrl={deployment.publicUrl}
          stages={componentStages}
          logs={logs}
          status={deployment.status}
          overallProgress={overallProgress}
          onRetry={handleRetry}
          onCancel={handleCancel}
          onRollback={handleRollback}
          onFullScreenLogs={() => console.log('Full screen')}
          isLoading={deployment.status === 'in-progress'}
        />
      </div>
    </DashboardLayout>
  );
}

// ============================================================================
// 3. BACKEND API INTEGRATION
// ============================================================================

/**
 * Example: src/services/deployment-service.ts
 * API service for deployment operations
 */

import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL;

class DeploymentService {
  /**
   * Get deployment details by ID
   */
  async getDeploymentById(deploymentId: string) {
    return axios.get(`${API_BASE}/deployments/${deploymentId}`);
  }

  /**
   * Get deployment logs
   */
  async getDeploymentLogs(deploymentId: string, limit = 100) {
    return axios.get(`${API_BASE}/deployments/${deploymentId}/logs`, {
      params: { limit },
    });
  }

  /**
   * Stream deployment logs (EventSource)
   */
  streamDeploymentLogs(deploymentId: string): EventSource {
    return new EventSource(`${API_BASE}/deployments/${deploymentId}/logs/stream`);
  }

  /**
   * Retry failed deployment
   */
  async retryDeployment(deploymentId: string) {
    return axios.post(`${API_BASE}/deployments/${deploymentId}/retry`);
  }

  /**
   * Cancel deployment
   */
  async cancelDeployment(deploymentId: string) {
    return axios.post(`${API_BASE}/deployments/${deploymentId}/cancel`);
  }

  /**
   * Rollback deployment
   */
  async rollbackDeployment(deploymentId: string) {
    return axios.post(`${API_BASE}/deployments/${deploymentId}/rollback`);
  }

  /**
   * Update deployment stage status
   */
  async updateStageStatus(
    deploymentId: string,
    stageName: string,
    status: string
  ) {
    return axios.patch(
      `${API_BASE}/deployments/${deploymentId}/stages/${stageName}`,
      { status }
    );
  }
}

export const deploymentService = new DeploymentService();

// ============================================================================
// 4. WEBSOCKET REAL-TIME UPDATES
// ============================================================================

/**
 * Example: Backend WebSocket events
 * These are the events your backend should emit
 */

// Client connects to deployment
// socket.emit('join-deployment', { deploymentId: 'deploy-123' });

// Server emits log entries
// socket.emit('deployment:log', {
//   timestamp: '14:32:01',
//   message: 'Build started',
//   level: 'info',
//   source: 'builder'
// });

// Server emits deployment status updates
// socket.emit('deployment:update', {
//   status: 'in-progress',
//   phase: 'build',
//   stages: [...],
//   progress: 50
// });

// Server emits stage completions
// socket.emit('deployment:stage-complete', {
//   stageName: 'Docker Image Build',
//   status: 'success',
//   timestamp: '14:32:25'
// });

// ============================================================================
// 5. HOOKS FOR COMMON PATTERNS
// ============================================================================

/**
 * Custom hook for deployment real-time updates
 * Example: src/hooks/useDeploymentStream.ts
 */

import { useEffect, useState, useCallback } from 'react';
import io from 'socket.io-client';

interface UseDeploymentStreamOptions {
  deploymentId?: string;
  onLogReceived?: (log: LogEntry) => void;
  onStatusChange?: (status: string) => void;
  onError?: (error: Error) => void;
}

export function useDeploymentStream({
  deploymentId,
  onLogReceived,
  onStatusChange,
  onError,
}: UseDeploymentStreamOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [status, setStatus] = useState<string>('pending');

  useEffect(() => {
    if (!deploymentId) return;

    const socket = io(import.meta.env.VITE_API_URL, {
      reconnection: true,
      reconnectionAttempts: 5,
    });

    socket.on('connect', () => {
      setIsConnected(true);
      socket.emit('join-deployment', { deploymentId });
    });

    socket.on('deployment:log', (log: LogEntry) => {
      setLogs(prev => [...prev, log].slice(-100));
      onLogReceived?.(log);
    });

    socket.on('deployment:update', (data: any) => {
      setStatus(data.status);
      onStatusChange?.(data.status);
    });

    socket.on('error', (error: any) => {
      const err = new Error(error.message || 'WebSocket error');
      onError?.(err);
    });

    return () => {
      socket.emit('leave-deployment', { deploymentId });
      socket.disconnect();
    };
  }, [deploymentId, onLogReceived, onStatusChange, onError]);

  return { isConnected, logs, status };
}

// ============================================================================
// 6. ENVIRONMENT VARIABLES
// ============================================================================

/**
 * Required .env variables
 */

// .env.local or .env
/*
VITE_API_URL=http://localhost:3000/api
VITE_WS_URL=http://localhost:3000
*/

// ============================================================================
// 7. TESTING SETUP
// ============================================================================

/**
 * Mock deployment data for testing
 * Example: __tests__/mocks/deployment.ts
 */

export const mockDeployment = {
  _id: '64f1234567890abcdef12345',
  deploymentId: 'deploy-2024-001',
  projectId: '64e9876543210fedcba98765',
  repositoryName: 'cloudops/main',
  repositoryUrl: 'https://github.com/cloudops/main',
  branch: 'main',
  commitHash: 'abc123def456gh789ij0klmnopqrstu',
  commitMessage: 'feat: Add deployment visualization',
  status: 'in-progress',
  phase: 'docker-push',
  publicUrl: 'https://app.cloudops.dev',
  startedAt: '2024-05-15T14:32:01Z',
  stages: [
    { name: 'GitHub Commit', status: 'success', timestamp: '2024-05-15T14:32:01Z' },
    { name: 'Build Started', status: 'success', timestamp: '2024-05-15T14:32:05Z' },
    { name: 'Installing Dependencies', status: 'success', timestamp: '2024-05-15T14:32:12Z' },
    { name: 'Docker Image Build', status: 'success', timestamp: '2024-05-15T14:32:25Z' },
    { name: 'Pushing to AWS ECR', status: 'in-progress', timestamp: '2024-05-15T14:32:30Z' },
    { name: 'Deploying to ECS', status: 'pending', timestamp: null },
    { name: 'NGINX Routing Setup', status: 'pending', timestamp: null },
    { name: 'Live Deployment', status: 'pending', timestamp: null },
  ],
};

// ============================================================================
// 8. TYPE DEFINITIONS
// ============================================================================

/**
 * src/types/deployment.ts
 */

export interface Deployment {
  _id: string;
  deploymentId: string;
  projectId: string | null;
  repositoryName: string;
  repositoryUrl: string;
  branch: string;
  commitHash: string;
  commitMessage: string;
  status: 'pending' | 'in-progress' | 'success' | 'failed';
  phase: string;
  publicUrl?: string;
  startedAt: string;
  completedAt?: string;
  stages: DeploymentStage[];
}

export interface DeploymentStage {
  name: string;
  status: 'pending' | 'in-progress' | 'success' | 'failed';
  timestamp?: string;
  logs?: string[];
}

export interface DeploymentLog {
  timestamp: string;
  message: string;
  level: 'info' | 'success' | 'error' | 'warning';
  source?: string;
}

// ============================================================================
// CHECKLIST FOR INTEGRATION
// ============================================================================

/*
[ ] Add routes to router configuration
[ ] Create/update deployment detail page
[ ] Setup WebSocket connection
[ ] Configure API service methods
[ ] Add environment variables
[ ] Create custom hooks if needed
[ ] Add error boundary wrapper
[ ] Setup real-time log streaming
[ ] Configure auto-refresh intervals
[ ] Add success/error notifications
[ ] Setup performance monitoring
[ ] Add accessibility features
[ ] Test responsive design
[ ] Test real-time updates
[ ] Configure log persistence
[ ] Add deployment history view
*/
