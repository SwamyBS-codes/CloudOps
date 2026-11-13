/**
 * Deployment Model
 * Stores deployment records and status
 */

const mongoose = require('mongoose');
const { maskSecrets, sanitizeData } = require('../utils/logSanitizer');

const DeploymentSchema = new mongoose.Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: false,  // Can be null for ad-hoc deployments without a connected project
      index: true,
    },
    userId: {
      type: String,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['pending', 'queued', 'cloning', 'detecting', 'building', 'pushing', 'deploying', 'running', 'stopped', 'success', 'failed', 'cancelled', 'closed', 'redeployed'],
      default: 'pending',
      index: true,
    },
    phase: {
      type: String,
      enum: ['preparation', 'queued', 'clone', 'framework_detection', 'dockerfile_generation', 'docker_build', 'container_start', 'nginx_setup', 'push_ecr', 'ec2_launch', 'ecs_deploy', 'dns_setup', 'cleanup', 'complete'],
      default: 'preparation',
    },
    // Git information
    commitHash: String,
    commitShortHash: String,
    commitMessage: String,
    commitAuthor: String,
    commitDate: Date,
    branch: {
      type: String,
      default: 'main',
    },
    repositoryUrl: String,
    repositoryName: String,

    // User-facing application classification (PaaS layer)
    applicationType: {
      type: String,
      enum: ['frontend-website', 'backend-api', 'full-stack'],
      index: true,
    },
    applicationName: String,
    deploymentType: {
      type: String,
      enum: ['static-hosting', 'container-hosting', 'server-hosting'],
    },
    provider: {
      type: String,
      enum: ['aws', 'azure', 'cloudops'],
    },
    healthStatus: {
      type: String,
      enum: ['unknown', 'healthy', 'unhealthy', 'checking'],
      default: 'unknown',
      index: true,
    },
    domainUrl: String,
    estimatedCostMonthly: Number,
    estimatedDeployMinutes: Number,

    // Framework detection
    framework: {
      type: String,
      enum: ['nodejs', 'node', 'python', 'java', 'go', 'ruby', 'php', 'rust', 'dotnet', 'static', 'custom', 'generic'],
    },
    frameworkVersion: String,
    frameworkDetails: mongoose.Schema.Types.Mixed,

    // Docker information
    dockerImageUri: String,
    dockerImageTag: String,
    dockerBuildTime: Number, // in milliseconds
    dockerImageSize: Number, // in bytes
    dockerfile: String, // Dockerfile content

    // Deployment service type (AWS or Azure)
    deploymentService: {
      type: String,
      enum: ['local', 'aws', 'azure', 's3-static', 'azure-static'],
      default: 'azure',
      index: true,
    },

    // Infrastructure / cloud deployment details
    infrastructure: {
      type: {
        provider: {
          type: String,
          default: 'azure',
        },
        targetType: {
          type: String,
          enum: ['local', 'ssh', 'aws', 'azure', 's3-static', 'azure-static'],
        },
        s3: {
          bucket: { type: String, default: null },
          prefix: { type: String, default: null },
          siteSlug: { type: String, default: null },
          websiteUrl: { type: String, default: null },
          publicIp: { type: String, default: null },
        },
        region: { type: String, default: null },
        target: { type: mongoose.Schema.Types.Mixed, default: null },
        ecr: {
          repositoryArn: { type: String, default: null },
          repositoryName: { type: String, default: null },
          repositoryUri: { type: String, default: null },
          imageUri: { type: String, default: null },
          imageTag: { type: String, default: null },
        },
        ec2: {
          instanceId: { type: String, default: null },
          publicIp: { type: String, default: null },
          privateIp: { type: String, default: null },
          instanceType: { type: String, default: null },
          keyName: { type: String, default: null },
          securityGroupIds: { type: [String], default: [] },
          vpcId: { type: String, default: null },
        },
        acr: {
          loginServer: { type: String, default: null },
          repositoryName: { type: String, default: null },
          imageUri: { type: String, default: null },
          imageTag: { type: String, default: null },
          imageName: { type: String, default: null },
        },
        aci: {
          containerGroupName: { type: String, default: null },
          containerName: { type: String, default: null },
          resourceGroupName: { type: String, default: null },
          location: { type: String, default: null },
          cpu: { type: Number, default: null },
          memoryInGb: { type: Number, default: null },
          status: { type: String, default: null },
          fqdn: { type: String, default: null },
          ipAddress: { type: String, default: null },
          containerGroupId: { type: String, default: null },
        },
        container: {
          name: { type: String, default: null },
          imageName: { type: String, default: null },
          port: { type: Number, default: null },
        },
        liveUrl: { type: String, default: null },
        deployState: { type: String, default: null },
      },
      default: () => ({
        provider: 'aws',
        ecr: {},
        ec2: {},
        acr: {},
        aci: {},
        s3: {},
        container: {},
      }),
    },

    // ECS deployment
    ecsClusterName: String,
    ecsServiceName: String,
    ecsTaskDefinitionArn: String,
    ecsServiceArn: String,
    ecsTaskArn: String,
    ecsDomainName: String,
    ecsPublicIp: String,

    // DNS/URL information
    publicUrl: String,
    subdomainName: String,
    customDomain: String,

    // Timing
    buildTime: Number, // in milliseconds
    deployTime: Number, // in milliseconds
    totalTime: Number, // in milliseconds
    startedAt: Date,
    completedAt: Date,

    // Environment & configuration
    environmentVariables: [{
      key: String,
      value: String,
      encrypted: {
        type: Boolean,
        default: false,
      },
    }],
    instanceType: {
      type: String,
      default: 'fargate-256-512', // 256 CPU units, 512 MB memory
    },
    desiredCount: {
      type: Number,
      default: 1,
    },

    // Trigger information
    triggeredBy: {
      type: String,
      enum: ['manual', 'webhook'],
      default: 'manual',
    },
    webhookId: String,

    // Error handling
    error: {
      message: String,
      code: String,
      phase: String,
      timestamp: Date,
      stack: String,
    },
    failureReason: String,
    retryCount: {
      type: Number,
      default: 0,
    },
    maxRetries: {
      type: Number,
      default: 3,
    },

    // Logs with service separation
    logs: [{
      timestamp: Date,
      source: {
        type: String,
        enum: ['system', 'git', 'framework', 'docker', 'aws', 'ecr', 'ecs', 'route53', 'azure', 'acr', 'aci', 'app', 'storage', 'kaniko'],
      },
      level: {
        type: String,
        enum: ['debug', 'info', 'warn', 'error', 'success'],
      },
      message: String,
      deploymentService: {
        type: String,
        enum: ['local', 'aws', 'azure', 's3-static', 'azure-static'],
      },
      data: mongoose.Schema.Types.Mixed,
    }],

    // Separate log collections for easier querying
    awsLogs: [{
      timestamp: Date,
      source: {
        type: String,
        enum: ['system', 'git', 'framework', 'docker', 'aws', 'ecr', 'ecs', 'route53', 'app'],
      },
      level: {
        type: String,
        enum: ['debug', 'info', 'warn', 'error', 'success'],
      },
      message: String,
      data: mongoose.Schema.Types.Mixed,
    }],

    azureLogs: [{
      timestamp: Date,
      source: {
        type: String,
        enum: ['system', 'git', 'framework', 'docker', 'azure', 'acr', 'aci', 'app', 'storage', 'kaniko'],
      },
      level: {
        type: String,
        enum: ['debug', 'info', 'warn', 'error', 'success'],
      },
      message: String,
      data: mongoose.Schema.Types.Mixed,
    }],

    // Rollback information
    previousDeploymentId: mongoose.Schema.Types.ObjectId,
    canRollback: {
      type: Boolean,
      default: true,
    },

    // Metadata
    metadata: mongoose.Schema.Types.Mixed,

    // Audit trail and compliance fields
    deploymentVersion: {
      type: Number,
      default: 1, // Track redeploys/iterations
    },
    requestContext: {
      ipAddress: String,
      userAgent: String,
      requestId: String, // Correlate with HTTP logs
      originalRequest: {
        method: String,
        path: String,
        timestamp: Date,
      },
    },
    phaseMetrics: {
      cloneStartedAt: Date,
      cloneDuration: Number, // ms
      detectStartedAt: Date,
      detectDuration: Number,
      buildStartedAt: Date,
      buildDuration: Number,
      pushStartedAt: Date,
      pushDuration: Number,
      deployStartedAt: Date,
      deployDuration: Number,
      totalDuration: Number, // Complete deployment time
    },
    // Archive for older deployments
    archivedAt: Date,
    archived: {
      type: Boolean,
      default: false,
      index: true,
    },
    // For tracking redeploys
    redeploys: [{
      deploymentId: mongoose.Schema.Types.ObjectId,
      timestamp: Date,
      reason: String,
      initiatedBy: String,
    }],
    // Health check tracking
    healthCheckHistory: [{
      timestamp: Date,
      status: { type: String, enum: ['unknown', 'healthy', 'unhealthy'] },
      responseTime: Number,
      message: String,
    }],
  },
  {
    timestamps: true,
    collection: 'deployments',
  }
);

const INFRASTRUCTURE_OBJECT_KEYS = ['ecr', 'ec2', 'acr', 'aci', 's3', 'container'];
const DEFAULT_INFRASTRUCTURE = {
  provider: 'aws',
  ecr: {},
  ec2: {},
  acr: {},
  aci: {},
  s3: {},
  container: {},
};

function normalizeInfrastructureValue(value) {
  const normalized = (!value || typeof value !== 'object' || Array.isArray(value))
    ? { ...DEFAULT_INFRASTRUCTURE }
    : { ...DEFAULT_INFRASTRUCTURE, ...value };

  for (const key of INFRASTRUCTURE_OBJECT_KEYS) {
    if (
      normalized[key] == null
      || typeof normalized[key] !== 'object'
      || Array.isArray(normalized[key])
    ) {
      normalized[key] = {};
    }
  }

  return normalized;
}

function normalizeInfrastructureUpdate(update = {}) {
  const set = update.$set || update;

  if (set.infrastructure !== undefined) {
    set.infrastructure = normalizeInfrastructureValue(set.infrastructure);
  }

  for (const key of INFRASTRUCTURE_OBJECT_KEYS) {
    const dottedKey = `infrastructure.${key}`;
    if (
      set[dottedKey] !== undefined
      && (set[dottedKey] == null || typeof set[dottedKey] !== 'object' || Array.isArray(set[dottedKey]))
    ) {
      set[dottedKey] = {};
    }
  }

  if (update.$set) {
    update.$set = set;
  }
}

DeploymentSchema.pre('save', function normalizeInfrastructure() {
  this.infrastructure = normalizeInfrastructureValue(this.infrastructure);
});

function normalizeInfrastructureOnUpdate() {
  normalizeInfrastructureUpdate(this.getUpdate());
}

DeploymentSchema.pre('updateOne', normalizeInfrastructureOnUpdate);
DeploymentSchema.pre('findOneAndUpdate', normalizeInfrastructureOnUpdate);
DeploymentSchema.pre('updateMany', normalizeInfrastructureOnUpdate);

// Indexes for efficient querying
DeploymentSchema.index({ projectId: 1, createdAt: -1 });
DeploymentSchema.index({ userId: 1, createdAt: -1 });
DeploymentSchema.index({ status: 1, createdAt: -1 });
DeploymentSchema.index({ publicUrl: 1 }, { sparse: true });

// Additional indexes for audit and performance
DeploymentSchema.index({ userId: 1, deploymentService: 1, createdAt: -1 });
DeploymentSchema.index({ status: 1, healthStatus: 1, createdAt: -1 });
DeploymentSchema.index({ archived: 1, createdAt: -1 });
DeploymentSchema.index({ 'requestContext.requestId': 1 }, { sparse: true });
DeploymentSchema.index({ provider: 1, createdAt: -1 });
DeploymentSchema.index({ deploymentVersion: 1 });

// Methods
DeploymentSchema.methods.addLog = function (source, level, message, data = {}, deploymentService = null) {
  const logEntry = {
    timestamp: new Date(),
    source,
    level,
    message: maskSecrets(message || ''),
    data: sanitizeData(data),
  };

  // Add to unified logs
  this.logs.push({
    ...logEntry,
    deploymentService: deploymentService || this.deploymentService,
  });

  // Add to service-specific logs
  if (deploymentService === 'aws' || (!deploymentService && this.deploymentService === 'aws')) {
    this.awsLogs.push(logEntry);
  } else if (deploymentService === 'azure' || (!deploymentService && this.deploymentService === 'azure')) {
    this.azureLogs.push(logEntry);
  }
};

// Get logs for a specific service
DeploymentSchema.methods.getServiceLogs = function (service) {
  if (service === 'aws') {
    return this.awsLogs || [];
  } else if (service === 'azure') {
    return this.azureLogs || [];
  }
  return this.logs || [];
};

DeploymentSchema.methods.updateStatus = function (status, phase = null) {
  this.status = status;
  if (phase) {
    this.phase = phase;
  }
};

DeploymentSchema.methods.markAsSuccess = function (publicUrl, totalTime) {
  this.status = 'success';
  this.phase = 'complete';
  this.publicUrl = publicUrl;
  this.domainUrl = publicUrl;
  this.healthStatus = 'healthy';
  this.totalTime = totalTime;
  this.completedAt = new Date();
};

DeploymentSchema.methods.markAsFailed = function (error, phase) {
  this.healthStatus = 'unhealthy';
  this.status = 'failed';
  this.failureReason = error.message;
  this.error = {
    message: error.message,
    code: error.code,
    phase,
    timestamp: new Date(),
    stack: error.stack,
  };
  this.completedAt = new Date();
};

DeploymentSchema.methods.incrementRetry = function () {
  this.retryCount += 1;
};

DeploymentSchema.methods.canRetry = function () {
  return this.retryCount < this.maxRetries;
};

// Statics
DeploymentSchema.statics.getLatestByProject = function (projectId) {
  return this.findOne({ projectId }).sort({ createdAt: -1 });
};

DeploymentSchema.statics.getByStatus = function (status) {
  return this.find({ status }).sort({ createdAt: -1 });
};

DeploymentSchema.statics.getSuccessfulDeployments = function (projectId, limit = 10) {
  return this.find({ projectId, status: 'success' })
    .sort({ createdAt: -1 })
    .limit(limit);
};

const Deployment = mongoose.model('Deployment', DeploymentSchema);

module.exports = Deployment;
