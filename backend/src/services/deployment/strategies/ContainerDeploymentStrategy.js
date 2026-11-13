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

    const isAzure = Boolean(process.env.AZURE_CLIENT_ID && process.env.ACR_LOGIN_SERVER);

    if (isAzure) {
      return new Promise((resolve, reject) => {
        let resolved = false;
        runAzureDeployment({
          repoUrl: repositoryUrl,
          appName: applicationName || repositoryName,
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
      provider: mapping.provider,
      estimatedCostMonthly: mapping.estimatedCostMonthlyUsd,
      estimatedDeployMinutes: mapping.estimatedDeployMinutes,
      target: { type: 'local' },
      triggeredBy: 'manual',
      metadata: {
        rootDirectory,
        userFacingSummary: mapping.userFacingSummary,
        hideInfrastructure: true,
        runtime: 'nodejs',
      },
    }, io);

    return {
      success: true,
      message: 'Backend API deployment started (npm install + npm start via container)',
      deploymentId: result.deploymentId,
      status: result.status || 'queued',
    };
  }
}

module.exports = new ContainerDeploymentStrategy();
