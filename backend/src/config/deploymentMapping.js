/**
 * Application-type → infrastructure mapping (hidden from users by default).
 */

const APPLICATION_TYPES = {
  'frontend-website': {
    label: 'Frontend Website',
    description: 'Static sites and SPAs built with React, Vue, Angular, Vite, or plain HTML/CSS.',
    deploymentType: 'static-hosting',
    provider: 'azure',
    strategy: 'static',
    estimatedCostMonthlyUsd: 2,
    estimatedDeployMinutes: 3,
    userFacingSummary: 'Azure Blob static hosting',
    frameworks: ['React', 'Vue', 'Angular', 'Vite', 'Next.js', 'HTML/CSS'],
  },
  'backend-api': {
    label: 'Backend API',
    description: 'REST or GraphQL APIs built with Express, FastAPI, Django, Flask, NestJS, or Spring Boot.',
    deploymentType: 'container-hosting',
    provider: 'azure',
    strategy: 'container',
    estimatedCostMonthlyUsd: 15,
    estimatedDeployMinutes: 8,
    userFacingSummary: 'Managed container hosting (Azure ACI)',
    frameworks: ['Express', 'FastAPI', 'Django', 'Flask', 'NestJS', 'Spring Boot'],
  },
  'full-stack': {
    label: 'Full Stack Application',
    description: 'Projects with both a frontend UI and a backend API in the same repository.',
    deploymentType: 'server-hosting',
    provider: 'azure',
    strategy: 'container',
    estimatedCostMonthlyUsd: 15,
    estimatedDeployMinutes: 10,
    userFacingSummary: 'Managed container hosting (Azure ACI)',
    frameworks: ['React + API', 'Vue + API', 'Monorepo'],
  },
};

function getMappingForApplicationType(applicationType) {
  const mapping = APPLICATION_TYPES[applicationType];
  if (!mapping) {
    throw new Error(`Unknown application type: ${applicationType}`);
  }
  return mapping;
}

function getRecommendation(applicationType, overrides = {}) {
  const mapping = getMappingForApplicationType(applicationType);
  return {
    applicationType,
    label: mapping.label,
    description: mapping.description,
    deploymentType: mapping.deploymentType,
    provider: mapping.provider,
    estimatedCostMonthlyUsd: overrides.estimatedCostMonthlyUsd ?? mapping.estimatedCostMonthlyUsd,
    estimatedDeployMinutes: overrides.estimatedDeployMinutes ?? mapping.estimatedDeployMinutes,
    userFacingSummary: mapping.userFacingSummary,
    detectedFrameworks: overrides.detectedFrameworks || [],
    confidence: overrides.confidence ?? 1,
  };
}

function listApplicationTypes() {
  return Object.entries(APPLICATION_TYPES).map(([id, config]) => ({
    id,
    label: config.label,
    description: config.description,
    deploymentType: config.deploymentType,
    estimatedCostMonthlyUsd: config.estimatedCostMonthlyUsd,
    estimatedDeployMinutes: config.estimatedDeployMinutes,
    userFacingSummary: config.userFacingSummary,
  }));
}

module.exports = {
  APPLICATION_TYPES,
  getMappingForApplicationType,
  getRecommendation,
  listApplicationTypes,
};
