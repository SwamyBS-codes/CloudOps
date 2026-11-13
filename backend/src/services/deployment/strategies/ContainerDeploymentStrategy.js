const deploymentEngine = require('../../deploymentEngineService');
const { runAzureDeployment } = require('../../azureDeployService');
const { getMappingForApplicationType } = require('../../../config/deploymentMapping');

class ContainerDeploymentStrategy {
  async deploy(input, io) {
    const mapping = getMappingForApplicationType('backend-api');
    const {
      userId,
      projectId,
      repositoryUrl,
      repositoryName,
      repositoryOwner,
      applicationName,
      applicationType = 'backend-api',
      branch = 'main',
      environmentVariables = {},
      rootDirectory = './',
      socketId,
    } = input;

    const requestedProvider = input.provider || (input.target?.type === 'aws' ? 'aws' : null);
    const isAzure = requestedProvider !== 'aws' && Boolean(process.env.AZURE_CLIENT_ID && process.env.ACR_LOGIN_SERVER);

    if (isAzure) {
      return new Promise((resolve, reject) => {
        let resolved = false;
        runAzureDeployment({
          repoUrl: repositoryUrl,
          appName: applicationName || repositoryName,
          branch: branch || 'main',
          socketId: socketId || null,
          io,
          userId: String(userId || 'anonymous'),
          applicationType,
          applicationName: applicationName || repositoryName,
          deploymentType: mapping.deploymentType,
          provider: 'azure',
          estimatedCostMonthly: mapping.estimatedCostMonthlyUsd,
          estimatedDeployMinutes: mapping.estimatedDeployMinutes,
          environmentVariables: environmentVariables || {},
          onStarted: (dep) => {
            resolved = true;
            resolve({
              success: true,
              message: 'Backend API deployment started on Azure Container Instances (ACI)',
              deploymentId: dep?._id?.toString() || 'azure-deploying',
              status: 'building',
            });
          },
        }).catch((err) => {
          if (!resolved) {
            reject(err);
          } else {
            console.error('[Azure] Background deployment pipeline error:', err);
          }
        });
      });
    }

    const targetType = requestedProvider === 'aws' ? 'aws' : 'local';
    const target = targetType === 'aws'
      ? {
          type: 'aws',
          awsRegion: input.awsRegion || process.env.AWS_REGION || 'ap-south-1',
          instanceType: input.instanceType || 't3.micro',
          keyName: input.keyName || process.env.AWS_EC2_KEY_NAME,
          securityGroupIds: input.securityGroupIds || [],
        }
      : { type: 'local' };

    const result = await deploymentEngine.startDeployment({
      projectId,
      userId: String(userId || 'anonymous'),
      repositoryUrl,
      repositoryName,
      repositoryOwner,
      branch,
      environmentVariables,
      applicationType,
      applicationName: applicationName || repositoryName,
      deploymentType: mapping.deploymentType,
      provider: requestedProvider === 'aws' ? 'aws' : mapping.provider,
      estimatedCostMonthly: mapping.estimatedCostMonthlyUsd,
      estimatedDeployMinutes: mapping.estimatedDeployMinutes,
      target,
      triggeredBy: 'manual',
      metadata: {
        rootDirectory,
        userFacingSummary: requestedProvider === 'aws' ? 'AWS EC2 container deployment' : mapping.userFacingSummary,
        hideInfrastructure: true,
        runtime: 'nodejs',
      },
    }, io);

    return {
      success: true,
      message: requestedProvider === 'aws'
        ? 'Backend API deployment started on AWS EC2'
        : 'Backend API deployment started (container runtime)',
      deploymentId: result.deploymentId,
      status: result.status || 'queued',
    };
  }
}

module.exports = new ContainerDeploymentStrategy();
