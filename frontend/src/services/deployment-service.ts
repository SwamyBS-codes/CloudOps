import { axiosClient } from './api/axios-client';

export type FileNode = {
  name: string;
  type: 'file' | 'directory';
  path?: string;
  children?: FileNode[];
};

export type SuggestedRoot = {
  path: string;
  label: string;
  hasPackageJson: boolean;
};

export type SuggestedEnvVar = {
  key: string;
  value: string;
  isPublic: boolean;
};

export type ApplicationType = 'frontend-website' | 'backend-api' | 'full-stack';

export type ApplicationRecommendation = {
  applicationType: ApplicationType;
  label: string;
  description: string;
  deploymentType: string;
  provider: string;
  estimatedCostMonthlyUsd: number;
  estimatedDeployMinutes: number;
  userFacingSummary: string;
  detectedFrameworks?: string[];
  confidence?: number;
};

export type ApplicationScanResult = {
  applicationType: ApplicationType;
  confidence: number;
  primaryRoot: string;
  detectedFrameworks: string[];
  suggestedRoots: SuggestedRoot[];
  recommendation: ApplicationRecommendation;
};

export type FrameworkDetection = {
  framework: string;
  preset: string;
  displayName: string;
  buildCommand: string | null;
  installCommand: string;
  outputDirectory: string;
  deployType: 'static' | 'container';
  confidence: number;
  suggestedEnvVars: SuggestedEnvVar[];
  rootDirectory: string;
  details?: Record<string, unknown>;
};

export const deploymentService = {
  startBuild: async (data: { projectId?: string; repositoryName: string; repositoryOwner?: string; environmentVariables?: Record<string, string>; branch?: string }) => {
    try {
      const response = await axiosClient.post('/api/deploy/start-build', data);
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.error || 'Failed to start build engine');
    }
  },

  startAWSDeployment: async (data: {
    repositoryUrl: string;
    repositoryName: string;
    repositoryOwner?: string;
    branch?: string;
    instanceType?: string;
    keyName?: string;
    environmentVariables?: Record<string, string>;
  }) => {
    try {
      const response = await axiosClient.post('/api/deploy/aws-ec2', data);
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.error || 'Failed to start AWS deployment');
    }
  },

  startAzureDeployment: async (data: {
    repoUrl: string;
    appName: string;
    socketId?: string;
    environmentVariables?: Record<string, string>;
  }) => {
    try {
      const response = await axiosClient.post('/api/azure/deploy', data);
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.error || 'Failed to start Azure deployment');
    }
  },

  initDeploy: async (repositoryName: string, repositoryOwner: string) => {
    try {
      const response = await axiosClient.post('/api/deploy/init', { repositoryName, repositoryOwner });
      return response.data as {
        clonePath: string;
        fileTree: FileNode[];
        suggestedRoots?: SuggestedRoot[];
        applicationScan?: ApplicationScanResult;
        projectId?: string;
        repositoryUrl?: string;
        repositoryOwner?: string;
        hasDockerfile?: boolean;
      };
    } catch (error: any) {
      throw new Error(error.response?.data?.error || 'Failed to initialize deployment');
    }
  },

  listApplicationTypes: async () => {
    const response = await axiosClient.get('/api/deploy/application-types');
    return response.data;
  },

  scanApplication: async (clonePath: string) => {
    try {
      const response = await axiosClient.post('/api/deploy/scan', { clonePath });
      return response.data as ApplicationScanResult & { success?: boolean };
    } catch (error: any) {
      throw new Error(error.response?.data?.error || 'Failed to scan application');
    }
  },

  deployApplication: async (data: {
    applicationType: ApplicationType;
    repositoryUrl: string;
    repositoryName: string;
    repositoryOwner?: string;
    projectId?: string;
    clonePath?: string;
    rootDirectory?: string;
    primaryRoot?: string;
    buildCommand?: string;
    outputDirectory?: string;
    environmentVariables?: Record<string, string>;
    applicationName?: string;
    socketId?: string;
    instanceType?: string;
    infrastructureOverride?: string;
  }) => {
    try {
      const response = await axiosClient.post('/api/deploy/application', data);
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.error || 'Failed to start deployment');
    }
  },

  detectFramework: async (clonePath: string, rootDirectory: string) => {
    try {
      const response = await axiosClient.post('/api/deploy/detect', { clonePath, rootDirectory });
      return response.data as FrameworkDetection;
    } catch (error: any) {
      throw new Error(error.response?.data?.error || 'Failed to detect framework');
    }
  },

  saveFiles: async (data: {
    clonePath: string;
    envContent: string;
    envPath: string;
    dockerfileContent?: string;
    rootDirectory?: string;
    deployType?: 'static';
  }) => {
    try {
      const response = await axiosClient.post('/api/deploy/save-files', data);
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.error || 'Failed to save deployment files');
    }
  },

  startStaticBuild: async (data: {
    repositoryName: string;
    clonePath: string;
    rootDirectory: string;
    buildCommand?: string;
    outputDirectory?: string;
    environmentVariables?: Record<string, string>;
    deployType?: 'static';
  }) => {
    try {
      const response = await axiosClient.post('/api/deploy/start-static-build', data);
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.error || 'Failed to start static build');
    }
  },
};
