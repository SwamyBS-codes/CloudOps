/**
 * Deployment Service
 * Orchestrates the entire deployment process
 */

const path = require('path');
const os = require('os');
const frameworkDetector = require('./frameworkDetector');
const dockerfileGenerator = require('./dockerfileGenerator');
const gitService = require('./gitService');
const Deployment = require('../models/Deployment');
const { getBuildDir } = require('../utils/pathResolver');

class DeploymentService {
  /**
   * Start deployment process
   * @param {string} projectId - Project ID
   * @param {string} userId - User ID
   * @param {Object} deploymentData - Deployment data
   * @returns {Promise<Object>}
   */
  async startDeployment(projectId, userId, deploymentData) {
    try {
      const { repositoryUrl, environmentVariables = {}, branch = 'main' } = deploymentData;
      const normalizedUserId = String(userId);

      // Create deployment record
      const deployment = new Deployment({
        projectId,
        userId: normalizedUserId,
        repositoryUrl,
        branch,
        environmentVariables: Object.entries(environmentVariables).map(([key, value]) => ({
          key,
          value,
          encrypted: false,
        })),
        status: 'pending',
        phase: 'preparation',
        startedAt: new Date(),
      });

      await deployment.save();

      deployment.addLog('system', 'info', 'Deployment initialized', {
        projectId,
        deploymentId: deployment._id,
      });

      return {
        success: true,
        deploymentId: deployment._id,
        status: 'pending',
      };
    } catch (error) {
      throw new Error(`Failed to start deployment: ${error.message}`);
    }
  }

  /**
   * Execute deployment workflow
   * @param {string} deploymentId - Deployment ID
   * @returns {Promise<Object>}
   */
  async executeDeployment(deploymentId) {
    let deployment;
    const buildDir = path.resolve(__dirname, '../../temp', `cloudops-${deploymentId}`);

    try {
      deployment = await Deployment.findById(deploymentId);
      if (!deployment) {
        throw new Error('Deployment not found');
      }

      const startTime = Date.now();

      try {
        // Phase 1: Clone Repository
        deployment.updateStatus('cloning', 'clone');
        await deployment.save();
        deployment.addLog('system', 'info', 'Starting repository clone', { url: deployment.repositoryUrl });

        await this.clonePhase(deployment, buildDir);

        // Phase 2: Framework Detection
        deployment.updateStatus('detecting', 'framework_detection');
        await deployment.save();
        deployment.addLog('system', 'info', 'Detecting framework');

        await this.frameworkDetectionPhase(deployment, buildDir);

        // Phase 3: Dockerfile Generation
        deployment.updateStatus('building', 'dockerfile_generation');
        await deployment.save();
        deployment.addLog('system', 'info', 'Generating Dockerfile', { framework: deployment.framework });

        await this.dockerfileGenerationPhase(deployment, buildDir);

        // Stop here until real Docker/ECR/ECS phases are implemented.
        deployment.updateStatus('failed', 'docker_build');
        deployment.addLog('system', 'error', 'Deployment stopped: Docker build and AWS deployment phases are not implemented yet.');
        await deployment.save();

        const notImplementedError = new Error('Deployment stopped after Dockerfile generation. Docker build/ECR/ECS steps are not implemented yet.');
        notImplementedError.code = 'PHASE3_NOT_IMPLEMENTED';
        throw notImplementedError;
      } catch (error) {
        // Error during deployment phases
        deployment.markAsFailed(error, deployment.phase);
        deployment.addLog('system', 'error', `Deployment failed at ${deployment.phase}`, {
          error: error.message,
        });
        await deployment.save();
        await gitService.removeRepository(buildDir).catch(() => {});

        throw error;
      }
    } catch (error) {
      if (deployment) {
        deployment.markAsFailed(error, 'unknown');
        await deployment.save().catch(() => {});
      }
      throw error;
    }
  }

  /**
   * Phase 1: Clone Repository
   * @private
   */
  async clonePhase(deployment, buildDir) {
    try {
      const cloneResult = await gitService.cloneRepository(deployment.repositoryUrl, buildDir, {
        branch: deployment.branch,
        depth: 1,
        maxRetries: 3,
      });

      deployment.addLog('git', 'info', `Repository cloned successfully`, {
        path: buildDir,
        duration: `${(cloneResult.duration / 1000).toFixed(2)}s`,
      });

      // Get repository info
      const repoInfo = await gitService.getRepositoryInfo(buildDir);
      deployment.commitHash = repoInfo.latestCommit.hash;
      deployment.commitShortHash = repoInfo.latestCommit.shortHash;
      deployment.commitMessage = repoInfo.latestCommit.message;
      deployment.commitAuthor = repoInfo.latestCommit.author;
      deployment.commitDate = repoInfo.latestCommit.date;
      deployment.branch = repoInfo.currentBranch;

      deployment.addLog('git', 'info', 'Repository info extracted', repoInfo.latestCommit);

      // Get repository size
      const repoSize = await gitService.getRepositorySize(buildDir);
      deployment.metadata = deployment.metadata || {};
      deployment.metadata.repositorySize = repoSize;

      deployment.addLog('system', 'debug', `Repository size: ${(repoSize / 1024 / 1024).toFixed(2)} MB`);
    } catch (error) {
      deployment.addLog('git', 'error', 'Repository clone failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Phase 2: Framework Detection
   * @private
   */
  async frameworkDetectionPhase(deployment, buildDir) {
    try {
      const detected = await frameworkDetector.detectFramework(buildDir);

      deployment.framework = detected.framework;
      deployment.frameworkVersion = detected.version;
      deployment.frameworkDetails = detected.details;

      deployment.addLog('framework', 'info', `Framework detected: ${detected.framework}`, {
        version: detected.version,
        port: detected.port,
        buildCommand: detected.buildCommand,
        confidence: detected.confidence,
      });

      if (detected.confidence < 1) {
        deployment.addLog('framework', 'warn', 'Low confidence framework detection', {
          framework: detected.framework,
          confidence: detected.confidence,
        });
      }
    } catch (error) {
      deployment.addLog('framework', 'error', 'Framework detection failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Phase 3: Dockerfile Generation
   * @private
   */
  async dockerfileGenerationPhase(deployment, buildDir) {
    try {
      const dockerfileContent = dockerfileGenerator.generateDockerfile(deployment.framework, {
        port: deployment.frameworkDetails?.port || 3000,
        buildCommand: deployment.frameworkDetails?.buildCommand,
        startCommand: deployment.frameworkDetails?.startCommand,
      });

      deployment.dockerfile = dockerfileContent;

      // Save Dockerfile
      const dockerfilePath = path.join(buildDir, 'Dockerfile');
      await dockerfileGenerator.saveDockerfile(dockerfileContent, dockerfilePath);

      deployment.addLog('docker', 'info', 'Dockerfile generated and saved', {
        path: dockerfilePath,
        framework: deployment.framework,
      });

      // Save .dockerignore
      const dockerignorePath = path.join(buildDir, '.dockerignore');
      await dockerfileGenerator.saveDockerigno(dockerignorePath);

      deployment.addLog('docker', 'info', '.dockerignore generated', { path: dockerignorePath });

      // Count lines
      const lines = dockerfileContent.split('\n').length;
      deployment.addLog('docker', 'debug', `Dockerfile: ${lines} lines`);
    } catch (error) {
      deployment.addLog('docker', 'error', 'Dockerfile generation failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Get deployment details
   * @param {string} deploymentId - Deployment ID
   * @returns {Promise<Object>}
   */
  async getDeploymentDetails(deploymentId) {
    try {
      const deployment = await Deployment.findById(deploymentId);
      if (!deployment) {
        throw new Error('Deployment not found');
      }

      return {
        _id: deployment._id,
        projectId: deployment.projectId,
        status: deployment.status,
        phase: deployment.phase,
        framework: deployment.framework,
        commitHash: deployment.commitShortHash,
        commitMessage: deployment.commitMessage,
        publicUrl: deployment.publicUrl,
        totalTime: deployment.totalTime,
        buildTime: deployment.buildTime,
        deployTime: deployment.deployTime,
        startedAt: deployment.startedAt,
        completedAt: deployment.completedAt,
        error: deployment.error,
        logs: deployment.logs.slice(-50), // Last 50 logs
      };
    } catch (error) {
      throw new Error(`Failed to get deployment details: ${error.message}`);
    }
  }

  /**
   * Get deployment logs
   * @param {string} deploymentId - Deployment ID
   * @param {Object} options - Filter options
   * @returns {Promise<Array>}
   */
  async getDeploymentLogs(deploymentId, options = {}) {
    try {
      const { source = null, level = null, limit = 100, skip = 0 } = options;

      const deployment = await Deployment.findById(deploymentId);
      if (!deployment) {
        throw new Error('Deployment not found');
      }

      let logs = deployment.logs;

      // Filter by source
      if (source) {
        logs = logs.filter((log) => log.source === source);
      }

      // Filter by level
      if (level) {
        logs = logs.filter((log) => log.level === level);
      }

      // Sort by timestamp descending
      logs = logs.sort((a, b) => b.timestamp - a.timestamp);

      // Apply pagination
      logs = logs.slice(skip, skip + limit);

      return logs;
    } catch (error) {
      throw new Error(`Failed to get deployment logs: ${error.message}`);
    }
  }

  /**
   * List deployments for a project
   * @param {string} projectId - Project ID
   * @param {Object} options - Query options
   * @returns {Promise<Array>}
   */
  async listProjectDeployments(projectId, options = {}) {
    try {
      const { limit = 20, skip = 0, status = null } = options;

      let query = { projectId };

      if (status) {
        query.status = status;
      }

      const deployments = await Deployment.find(query)
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip(skip)
        .select({
          status: 1,
          phase: 1,
          framework: 1,
          commitShortHash: 1,
          commitMessage: 1,
          publicUrl: 1,
          totalTime: 1,
          createdAt: 1,
          error: 1,
        });

      const total = await Deployment.countDocuments(query);

      return {
        deployments,
        total,
        limit,
        skip,
      };
    } catch (error) {
      throw new Error(`Failed to list deployments: ${error.message}`);
    }
  }

  /**
   * Cancel deployment
   * @param {string} deploymentId - Deployment ID
   * @returns {Promise<Object>}
   */
  async cancelDeployment(deploymentId) {
    try {
      const deployment = await Deployment.findById(deploymentId);
      if (!deployment) {
        throw new Error('Deployment not found');
      }

      if (['success', 'failed', 'cancelled'].includes(deployment.status)) {
        throw new Error(`Cannot cancel ${deployment.status} deployment`);
      }

      deployment.status = 'cancelled';
      deployment.completedAt = new Date();
      deployment.addLog('system', 'info', 'Deployment cancelled by user');

      await deployment.save();

      return { success: true, status: 'cancelled' };
    } catch (error) {
      throw new Error(`Failed to cancel deployment: ${error.message}`);
    }
  }
}

module.exports = new DeploymentService();
