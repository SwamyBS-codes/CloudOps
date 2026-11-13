/**
 * Centralized deployment router — application type in, infrastructure strategy out.
 */

const applicationTypeDetector = require('../applicationTypeDetector');
const { getMappingForApplicationType, getRecommendation, listApplicationTypes } = require('../../config/deploymentMapping');
const staticStrategy = require('./strategies/StaticDeploymentStrategy');
const containerStrategy = require('./strategies/ContainerDeploymentStrategy');
const serverStrategy = require('./strategies/ServerDeploymentStrategy');

const STRATEGY_MAP = {
  static: staticStrategy,
  container: containerStrategy,
  server: serverStrategy,
};

const APPLICATION_TYPE_STRATEGY = {
  'frontend-website': 'static',
  'backend-api': 'container',
  'full-stack': 'server',
};

class DeploymentManager {
  listApplicationTypes() {
    return listApplicationTypes();
  }

  async scanRepository(clonePath) {
    if (!clonePath) {
      throw new Error('clonePath is required to scan the repository');
    }
    return applicationTypeDetector.detect(clonePath);
  }

  getRecommendation(applicationType, overrides = {}) {
    return getRecommendation(applicationType, overrides);
  }

  resolveStrategy(applicationType, infrastructureOverride = null) {
    if (infrastructureOverride && STRATEGY_MAP[infrastructureOverride]) {
      return STRATEGY_MAP[infrastructureOverride];
    }

    const mapping = getMappingForApplicationType(applicationType);
    const strategyKey = APPLICATION_TYPE_STRATEGY[applicationType] || mapping.strategy;
    const strategy = STRATEGY_MAP[strategyKey];

    if (!strategy) {
      throw new Error(`No deployment strategy for application type: ${applicationType}`);
    }

    return strategy;
  }

  async deploy(input, io = null) {
    const { applicationType, infrastructureOverride } = input;

    if (!applicationType) {
      throw new Error('applicationType is required');
    }

    const mapping = getMappingForApplicationType(applicationType);
    const strategy = this.resolveStrategy(applicationType, infrastructureOverride);

    const requestedProvider = input.provider || (input.target?.type === 'aws' ? 'aws' : mapping.provider);
    const enrichedInput = {
      ...input,
      applicationType,
      deploymentType: mapping.deploymentType,
      provider: requestedProvider,
      applicationName: input.applicationName || input.repositoryName,
    };

    return strategy.deploy(enrichedInput, io);
  }
}

module.exports = new DeploymentManager();
