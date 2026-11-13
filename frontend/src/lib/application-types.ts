export type ApplicationType = 'frontend-website' | 'backend-api' | 'full-stack';

export const APPLICATION_TYPE_LABELS: Record<ApplicationType, string> = {
  'frontend-website': 'Frontend Website',
  'backend-api': 'Backend API',
  'full-stack': 'Full Stack Application',
};

export const APPLICATION_TYPE_DESCRIPTIONS: Record<ApplicationType, string> = {
  'frontend-website': 'React, Vue, Angular, Vite, or static HTML/CSS sites',
  'backend-api': 'Express, FastAPI, Django, Flask, NestJS, or Spring Boot APIs',
  'full-stack': 'Repositories with both a frontend UI and backend API',
};

export function formatApplicationType(type?: string) {
  if (!type) return 'Application';
  return APPLICATION_TYPE_LABELS[type as ApplicationType] || type;
}

export function formatHealthStatus(status?: string) {
  switch (status) {
    case 'healthy':
      return 'Healthy';
    case 'unhealthy':
      return 'Unhealthy';
    case 'checking':
      return 'Checking';
    default:
      return 'Unknown';
  }
}

export type DeploymentProvider = 'aws' | 'azure' | 's3' | 'local' | 'unknown';

type ProviderSource = {
  deploymentService?: string;
  provider?: string;
  infrastructure?: { provider?: string; targetType?: string } | null;
};

/**
 * Single source of truth for deriving a deployment's provider from the
 * combination of `deploymentService`, `provider` and `infrastructure.targetType`.
 * Handles the static variants (`s3-static`, `azure-static`) and container/local targets.
 */
export function resolveDeploymentProvider(
  deployment?: ProviderSource | null
): DeploymentProvider {
  if (!deployment) return 'unknown';
  const candidates = [
    deployment.deploymentService,
    deployment.provider,
    deployment.infrastructure?.provider,
    deployment.infrastructure?.targetType,
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.toLowerCase());

  if (candidates.some((value) => value.startsWith('s3'))) return 's3';
  if (candidates.some((value) => value.startsWith('azure'))) return 'azure';
  if (candidates.some((value) => value.startsWith('aws'))) return 'aws';
  if (candidates.some((value) => value === 'local')) return 'local';
  return 'unknown';
}
