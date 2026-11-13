const path = require('path');
const Deployment = require('../../../models/Deployment');
const staticBuildService = require('../../staticBuildService');
const azureStaticService = require('../../azureStaticService');
const frameworkDetector = require('../../frameworkDetector');
const { getMappingForApplicationType } = require('../../../config/deploymentMapping');
const { pushDeploymentLog, updateDeploymentFields } = require('../../../utils/deploymentPersistence');
const { maskSecrets } = require('../../../utils/logSanitizer');

class StaticDeploymentStrategy {
  normalizeLevel(level) {
    if (['debug', 'info', 'warn', 'error', 'success'].includes(level)) return level;
    return 'info';
  }

  deploymentRoom(deployment) {
    return `deployment:${deployment._id}`;
  }

  async emit(io, deployment, message, level = 'info', source = 'app') {
    const normalizedLevel = this.normalizeLevel(level);
    const validSource = ['system', 'git', 'framework', 'docker', 'aws', 'azure', 'acr', 'aci', 'app'].includes(source)
      ? source
      : 'app';

    const sanitizedMessage = maskSecrets(message);
    const logEntry = await pushDeploymentLog(deployment._id, {
      source: validSource,
      level: normalizedLevel,
      message: sanitizedMessage,
      deploymentService: 's3-static',
    });

    const payload = {
      deploymentId: deployment._id.toString(),
      message: sanitizedMessage,
      level: normalizedLevel,
      timestamp: (logEntry.timestamp || new Date()).toISOString(),
      applicationType: deployment.applicationType,
    };

    if (io) {
      const room = this.deploymentRoom(deployment);
      io.to(room).emit('deployment-log', payload);
    }
  }

  async deploy(input, io) {
    const mapping = getMappingForApplicationType('frontend-website');
    const {
      userId,
      projectId,
      repositoryUrl,
      repositoryName,
      clonePath,
      rootDirectory = './',
      applicationName,
      applicationType = 'frontend-website',
      environmentVariables = {},
    } = input;

    const isAzure = Boolean(process.env.AZURE_STORAGE_CONNECTION_STRING && (!process.env.AWS_S3_BUCKET_NAME || mapping.provider === 'azure'));
    const targetProvider = isAzure ? 'azure' : 'aws';

    const deployment = new Deployment({
      ...(projectId && { projectId }),
      userId: String(userId || 'anonymous'),
      repositoryUrl,
      repositoryName,
      applicationType,
      applicationName: applicationName || repositoryName,
      deploymentType: mapping.deploymentType,
      provider: targetProvider,
      deploymentService: isAzure ? 'azure-static' : 's3-static',
      status: 'building',
      phase: 'docker_build',
      branch: input.branch || 'main',
      environmentVariables: Object.entries(environmentVariables).map(([key, value]) => ({
        key,
        value: String(value),
        encrypted: false,
      })),
      estimatedCostMonthly: mapping.estimatedCostMonthlyUsd,
      estimatedDeployMinutes: mapping.estimatedDeployMinutes,
      healthStatus: 'checking',
      startedAt: new Date(),
      infrastructure: {
        provider: targetProvider,
        targetType: isAzure ? 'azure-static' : 's3-static',
        deployState: 'building',
        s3: {},
        ecr: {},
        ec2: {},
        acr: {},
        aci: {},
        container: {},
      },
      metadata: {
        rootDirectory,
        userFacingSummary: isAzure ? 'Azure Blob static website' : mapping.userFacingSummary,
        hideInfrastructure: true,
      },
    });

    await deployment.save();

    setImmediate(() => {
      this.runBuild(deployment, input, io).catch((error) => {
        console.error('Static deployment failed:', error.message);
      });
    });

    return {
      success: true,
      deploymentId: deployment._id.toString(),
      status: 'building',
    };
  }

  async runBuild(deployment, input, io) {
    const {
      repositoryName,
      clonePath,
      rootDirectory = './',
      buildCommand,
      outputDirectory,
      environmentVariables = {},
      applicationType = 'frontend-website',
    } = input;

    const projectPath = rootDirectory && rootDirectory !== './'
      ? path.join(clonePath, rootDirectory.replace(/^\.\//, ''))
      : clonePath;

    const deploymentRoom = this.deploymentRoom(deployment);

    try {
      await this.emit(io, deployment, 'Preparing your website for deployment...', 'info', 'system');

      const backendNode = await frameworkDetector.isBackendNodeProject(projectPath);
      if (backendNode.isBackend) {
        throw new Error(
          'Repository classified as Node.js backend API. '
          + 'Deploy it as Backend API (npm install + npm start), not S3 static hosting.'
        );
      }

      const isAzure = deployment.provider === 'azure';
      const siteSlug = staticBuildService.generateSiteSlug(repositoryName);

      if (isAzure) {
        await this.emit(io, deployment, 'Verifying Azure Blob Static Website storage...', 'info', 'azure');
        await azureStaticService.verifyStaticHosting((text, type) => this.emit(io, deployment, text, type, 'azure'));
      } else {
        const bucket = staticBuildService.getS3BucketName();
        if (!bucket) {
          throw new Error('AWS_S3_BUCKET_NAME is not configured in backend/.env');
        }
        await this.emit(io, deployment, `Verifying S3 access for bucket: ${bucket}...`, 'info', 'system');
        await staticBuildService.verifyBucketAccess(
          bucket,
          (text, type) => this.emit(io, deployment, text, type, 'aws')
        );
      }

      const detection = await frameworkDetector.detectFramework(clonePath, {
        rootDirectory,
        mode: 'static',
      });

      if (detection.deployType === 'container') {
        throw new Error(
          `${detection.displayName} is not a static frontend. Use Backend API deployment instead.`
        );
      }

      const finalBuildCommand = buildCommand || detection.buildCommand;
      const finalOutputDir = outputDirectory || detection.outputDirectory;

      if (finalBuildCommand && !finalBuildCommand.includes('No build needed')) {
        await staticBuildService.buildProject({
          projectPath,
          buildCommand: finalBuildCommand,
          environmentVariables,
          siteSlug,
          onLog: (text, type) => this.emit(io, deployment, text, type, 'app'),
        });
      } else {
        await this.emit(io, deployment, 'Publishing static files...', 'info', 'app');
      }

      let publicUrl;
      let publicIp = null;

      if (isAzure) {
        const { absolute: outputPath } = await staticBuildService.resolveOutputDir(projectPath, finalOutputDir);
        publicUrl = await azureStaticService.deployDirectory({
          outputPath,
          prefix: siteSlug,
          onLog: (text, type) => this.emit(io, deployment, text, type, 'azure'),
        });
        publicIp = await staticBuildService.resolvePublicIp(publicUrl);
      } else {
        publicUrl = await staticBuildService.deployStaticToS3({
          projectPath,
          outputDirectory: finalOutputDir,
          siteSlug,
          skipAccessVerify: true,
          onLog: (text, type) => this.emit(io, deployment, text, type, 'aws'),
        });
        publicIp = await staticBuildService.resolvePublicIp(publicUrl);
      }

      const totalTime = Date.now() - deployment.startedAt.getTime();

      await updateDeploymentFields(deployment._id, {
        publicUrl,
        domainUrl: publicUrl,
        status: 'success',
        phase: 'complete',
        healthStatus: 'healthy',
        completedAt: new Date(),
        totalTime,
        'infrastructure.provider': isAzure ? 'azure' : 'aws',
        'infrastructure.targetType': isAzure ? 'azure-static' : 's3-static',
        ...(isAzure
          ? {
              'infrastructure.azure': {
                container: '$web',
                siteSlug,
                websiteUrl: publicUrl,
                publicIp: publicIp || null,
              },
            }
          : {
              'infrastructure.s3.bucket': staticBuildService.getS3BucketName(),
              'infrastructure.s3.prefix': siteSlug,
              'infrastructure.s3.siteSlug': siteSlug,
              'infrastructure.s3.websiteUrl': publicUrl,
              'infrastructure.s3.publicIp': publicIp || null,
            }),
        'infrastructure.liveUrl': publicUrl,
        'infrastructure.deployState': 'live',
      });

      await this.emit(io, deployment, `Deployment complete! Live URL: ${publicUrl}`, 'success', 'system');
      await this.emit(io, deployment, `Public IP: ${publicIp || 'Unavailable'}`, 'success', 'system');

      const completePayload = {
        status: 'success',
        deploymentId: deployment._id.toString(),
        publicUrl,
        liveUrl: publicUrl,
        publicIp,
        applicationType,
        deployType: 'static',
      };

      if (io) {
        io.to(deploymentRoom).emit('build-complete', completePayload);
        io.to(deploymentRoom).emit('deployment-complete', completePayload);
      }

      return {
        success: true,
        deploymentId: deployment._id.toString(),
        publicUrl,
        publicIp,
        status: 'success',
      };
    } catch (error) {
      await this.emit(io, deployment, error.message || 'Deployment failed', 'error', 'system');

      await updateDeploymentFields(deployment._id, {
        status: 'failed',
        healthStatus: 'unhealthy',
        completedAt: new Date(),
        failureReason: error.message,
        error: {
          message: error.message,
          code: error.code,
          phase: 'docker_build',
          timestamp: new Date(),
          stack: error.stack,
        },
      });

      if (io) {
        const failPayload = {
          status: 'failed',
          error: error.message,
          deploymentId: deployment._id.toString(),
        };
        io.to(deploymentRoom).emit('build-complete', failPayload);
        io.to(deploymentRoom).emit('deployment-complete', failPayload);
      }

      throw error;
    }
  }
}

module.exports = new StaticDeploymentStrategy();
