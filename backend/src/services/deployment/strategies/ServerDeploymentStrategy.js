const deploymentEngine = require('../../deploymentEngineService');
const containerStrategy = require('./ContainerDeploymentStrategy');
const { getMappingForApplicationType } = require('../../../config/deploymentMapping');

class ServerDeploymentStrategy {
  async deploy(input, io) {
    const mapping = getMappingForApplicationType('full-stack');
    const {
      userId,
      projectId,
      repositoryUrl,
      repositoryName,
      repositoryOwner,
      branch = 'main',
      environmentVariables = {},
      applicationType = 'full-stack',
      applicationName,
      instanceType = 't3.micro',
    } = input;

    const requestedProvider = input.provider || (input.target?.type === 'aws' ? 'aws' : null);
    const hasAzure = Boolean(process.env.AZURE_CLIENT_ID && process.env.ACR_LOGIN_SERVER);

    // If Azure is explicitly requested or default when Azure is configured
    if (requestedProvider === 'azure' || (!requestedProvider && hasAzure)) {
      return containerStrategy.deploy({
        ...input,
        provider: 'azure',
        applicationType,
      }, io);
    }

    // Otherwise deploy to AWS EC2
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
      provider: 'aws',
      estimatedCostMonthly: mapping.estimatedCostMonthlyUsd,
      estimatedDeployMinutes: mapping.estimatedDeployMinutes,
      target: {
        type: 'aws',
        awsRegion: input.awsRegion || process.env.AWS_REGION || 'ap-south-1',
        instanceType: input.instanceType || instanceType,
        keyName: input.keyName || process.env.AWS_EC2_KEY_NAME,
        securityGroupIds: input.securityGroupIds || [],
      },
      triggeredBy: 'manual',
      metadata: {
        userFacingSummary: 'AWS EC2 server hosting',
        hideInfrastructure: true,
      },
    }, io);

    return result;
  }
}

module.exports = new ServerDeploymentStrategy();
