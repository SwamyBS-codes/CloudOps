const crypto = require('crypto');
const fs = require('fs/promises');
const fsSyncModule = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');

const Deployment = require('../models/Deployment');
const Project = require('../models/Project');
const dockerService = require('./dockerService');
const frameworkDetector = require('./frameworkDetector');
const gitService = require('./gitService');
const dockerfileGenerator = require('./dockerfileGenerator');
const awsDeploymentEngine = require('./awsDeploymentEngineService');
const ec2Service = require('./aws/ec2Service');
const { pushDeploymentLog } = require('../utils/deploymentPersistence');
const { maskSecrets, sanitizeData } = require('../utils/logSanitizer');
const { getBuildDir } = require('../utils/pathResolver');

class DeploymentEngineService {
  constructor() {
    this.queue = [];
    this.processing = false;
    this.allocatedPorts = new Set();
    this.portStart = Number(process.env.DEPLOYMENT_PORT_START || 4002);
    this.portEnd = Number(process.env.DEPLOYMENT_PORT_END || 4999);
  }

  normalizeEnvironmentVariables(environmentVariables = {}) {
    if (Array.isArray(environmentVariables)) {
      return environmentVariables.reduce((accumulator, item) => {
        if (item && item.key) {
          accumulator[item.key] = item.value;
        }
        return accumulator;
      }, {});
    }

    if (typeof environmentVariables !== 'object' || environmentVariables === null) {
      return {};
    }

    return environmentVariables;
  }

  normalizeTarget(target = {}) {
    if (!target || typeof target !== 'object') {
      return { type: 'local' };
    }

    if (target.type === 'aws' || target.type === 'ec2' || target.awsRegion) {
      return {
        type: 'aws',
        awsRegion: target.awsRegion || process.env.AWS_REGION || 'ap-south-1',
        instanceType: target.instanceType || 't3.micro',
        keyName: target.keyName || process.env.AWS_EC2_KEY_NAME,
        securityGroupIds: target.securityGroupIds || [],
        vpcId: target.vpcId || null,
      };
    }

    if (target.type === 'ssh' || target.host || target.user) {
      return {
        type: 'ssh',
        host: target.host || target.hostname,
        user: target.user || target.username,
        port: Number(target.port || 22),
        keyPath: target.keyPath || target.privateKeyPath || null,
        workspaceRoot: target.workspaceRoot || '/tmp/cloudops-deployments',
        publicHost: target.publicHost || target.domain || null,
        publicUrl: target.publicUrl || null,
      };
    }

    return { type: 'local' };
  }

  syncInfrastructure(deployment, patch = {}) {
    const currentInfrastructure = deployment.infrastructure && typeof deployment.infrastructure.toObject === 'function'
      ? deployment.infrastructure.toObject()
      : (deployment.infrastructure || {});

    const nextInfrastructure = {
      ...currentInfrastructure,
      ...patch,
      target: patch.target || currentInfrastructure.target || null,
      s3: {
        ...(currentInfrastructure.s3 || {}),
        ...(patch.s3 || {}),
      },
      ecr: {
        ...(currentInfrastructure.ecr || {}),
        ...(patch.ecr || {}),
      },
      ec2: {
        ...(currentInfrastructure.ec2 || {}),
        ...(patch.ec2 || {}),
      },
      acr: {
        ...(currentInfrastructure.acr || {}),
        ...(patch.acr || {}),
      },
      aci: {
        ...(currentInfrastructure.aci || {}),
        ...(patch.aci || {}),
      },
      container: {
        ...(currentInfrastructure.container || {}),
        ...(patch.container || {}),
      },
    };

    deployment.infrastructure = nextInfrastructure;
    deployment.metadata = {
      ...(deployment.metadata || {}),
      infrastructure: nextInfrastructure,
      target: nextInfrastructure.target,
    };

    return nextInfrastructure;
  }

  toDeploymentRoom(deployment) {
    return `deployment:${deployment._id.toString()}`;
  }

  emitLog(io, deployment, source, level, message, data = {}) {
    const sanitizedMessage = maskSecrets(message);
    const sanitizedData = sanitizeData(data);
    const room = this.toDeploymentRoom(deployment);
    const payload = {
      deploymentId: deployment._id.toString(),
      source,
      level,
      message: sanitizedMessage,
      data: sanitizedData,
      timestamp: new Date().toISOString(),
      status: deployment.status,
      phase: deployment.phase,
    };

    pushDeploymentLog(deployment._id, {
      source,
      level,
      message: sanitizedMessage,
      data: sanitizedData,
      deploymentService: deployment.deploymentService,
    }).catch((err) => {
      console.error('Failed to persist deployment log:', err.message);
    });

    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${source.toUpperCase()}] [${level.toUpperCase()}]`;
    const logMessage = `${prefix} ${sanitizedMessage}`;

    if (level === 'error') {
      console.error(`❌ ${logMessage}`);
    } else if (level === 'warn') {
      console.warn(`⚠️  ${logMessage}`);
    } else if (level === 'success') {
      console.log(`✅ ${logMessage}`);
    } else if (level === 'debug') {
      console.log(`🔍 ${logMessage}`);
    } else {
      console.log(`ℹ️  ${logMessage}`);
    }

    if (io && typeof io.to === 'function') {
      io.to(room).emit('deployment-log', payload);
    }
  }

  async saveDeployment(deployment) {
    await deployment.save();
    return deployment;
  }

  async isPortAvailable(port) {
    return new Promise((resolve) => {
      const server = net.createServer();
      server.unref();
      server.on('error', () => resolve(false));
      server.listen({ port, host: '127.0.0.1' }, () => {
        server.close(() => resolve(true));
      });
    });
  }

  async allocatePort() {
    for (let port = this.portStart; port <= this.portEnd; port += 1) {
      if (this.allocatedPorts.has(port)) {
        continue;
      }

      // eslint-disable-next-line no-await-in-loop
      if (await this.isPortAvailable(port)) {
        this.allocatedPorts.add(port);
        return port;
      }
    }

    throw new Error(`No free ports available in range ${this.portStart}-${this.portEnd}`);
  }

  releasePort(port) {
    if (typeof port === 'number') {
      this.allocatedPorts.delete(port);
    }
  }

  extractRepositoryName(repositoryUrl = '') {
    const cleaned = repositoryUrl.replace(/\.git$/, '');
    const parts = cleaned.split('/').filter(Boolean);
    return parts[parts.length - 1] || 'application';
  }

  buildEnvironmentObject(environmentVariables = {}) {
    return this.normalizeEnvironmentVariables(environmentVariables);
  }

  buildNginxConfig({ hostPort, serverName = '_', routePrefix = '/' }) {
    return `server {
    listen 80;
    server_name ${serverName};

    location ${routePrefix} {
        proxy_pass http://127.0.0.1:${hostPort};
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    location /health {
        proxy_pass http://127.0.0.1:${hostPort}/health;
    }
}
`;
  }

  async startDeployment(input, io = null) {
    const repositoryUrl = input.repositoryUrl;
    if (!repositoryUrl) {
      throw new Error('repositoryUrl is required');
    }

    const repositoryName = input.repositoryName || this.extractRepositoryName(repositoryUrl);
    const environmentVariables = this.normalizeEnvironmentVariables(input.environmentVariables);
    const target = this.normalizeTarget(input.target || input.ec2Target || input.remoteTarget);
    const branch = input.branch || 'main';
    const projectId = input.projectId ? String(input.projectId) : null;
    const userId = input.userId != null ? String(input.userId) : null;
    const triggeredBy = input.triggeredBy || 'manual';
    const webhookId = input.webhookId || null;
    const versionDetails = input.versionDetails || null;
    const webhookPayload = input.webhookPayload || null;
    const previousDeploymentId = input.previousDeploymentId || null;
    const previousDeployment = previousDeploymentId ? await Deployment.findById(previousDeploymentId) : null;

    const commitHash = input.commitHash || null;
    const commitShortHash = input.commitShortHash || (commitHash ? String(commitHash).slice(0, 7) : null);
    const commitMessage = input.commitMessage || null;
    const commitAuthor = input.commitAuthor || null;
    const commitDate = input.commitDate ? new Date(input.commitDate) : null;

    const carryoverInfrastructure = triggeredBy === 'webhook' && previousDeployment
      ? previousDeployment.infrastructure && typeof previousDeployment.infrastructure.toObject === 'function'
        ? previousDeployment.infrastructure.toObject()
        : previousDeployment.infrastructure
      : {};

    const carryoverMetadata = triggeredBy === 'webhook' && previousDeployment
      ? previousDeployment.metadata || {}
      : {};

    const deployment = new Deployment({
      ...(projectId && { projectId }),
      userId: userId || String(input.userId || 'anonymous'),
      repositoryUrl,
      repositoryName,
      ...(input.applicationType && { applicationType: input.applicationType }),
      ...(input.applicationName && { applicationName: input.applicationName }),
      ...(input.deploymentType && { deploymentType: input.deploymentType }),
      ...(input.provider && { provider: input.provider }),
      ...(input.estimatedCostMonthly != null && { estimatedCostMonthly: input.estimatedCostMonthly }),
      ...(input.estimatedDeployMinutes != null && { estimatedDeployMinutes: input.estimatedDeployMinutes }),
      healthStatus: 'checking',
      branch,
      environmentVariables: Object.entries(environmentVariables).map(([key, value]) => ({
        key,
        value: String(value),
        encrypted: false,
      })),
      status: 'queued',
      phase: 'queued',
      triggeredBy,
      webhookId,
      commitHash,
      commitShortHash,
      commitMessage,
      commitAuthor,
      commitDate,
      previousDeploymentId,
      startedAt: new Date(),
      infrastructure: {
        provider: carryoverInfrastructure.provider || target.type || 'local',
        targetType: carryoverInfrastructure.targetType || target.type || 'local',
        region: carryoverInfrastructure.region || target.awsRegion || process.env.AWS_REGION || null,
        target: carryoverInfrastructure.target || target,
        s3: carryoverInfrastructure.s3 || {},
        ecr: carryoverInfrastructure.ecr || {},
        ec2: carryoverInfrastructure.ec2 || {},
        acr: carryoverInfrastructure.acr || {},
        aci: carryoverInfrastructure.aci || {},
        container: carryoverInfrastructure.container || {},
        deployState: 'queued',
      },
      metadata: {
        ...carryoverMetadata,
        target: carryoverInfrastructure.target || target,
        queueState: 'queued',
        ...(versionDetails ? { version: versionDetails } : {}),
        ...(webhookPayload ? { webhook: webhookPayload } : {}),
      },
    });

    await deployment.save();
    this.emitLog(io, deployment, 'system', 'info', 'Deployment queued', {
      repositoryName,
      repositoryUrl,
      branch,
      target: target.type,
    });

    this.queue.push({ deploymentId: deployment._id.toString(), io });
    this.processQueue().catch((error) => {
      console.error('Deployment queue processing failed:', error);
    });

    return {
      success: true,
      deploymentId: deployment._id.toString(),
      status: deployment.status,
      queueLength: this.queue.length,
    };
  }

  async processQueue() {
    if (this.processing) {
      console.log(`📦 Queue already processing, skipping...`);
      return;
    }

    this.processing = true;
    console.log(`🚀 Starting deployment queue processor. Queue length: ${this.queue.length}`);

    while (this.queue.length > 0) {
      const job = this.queue.shift();
      console.log(`📋 Processing deployment: ${job.deploymentId}`);
      // eslint-disable-next-line no-await-in-loop
      await this.runDeployment(job.deploymentId, job.io).catch((error) => {
        console.error(`❌ Deployment ${job.deploymentId} failed:`, error.message);
      });
    }

    this.processing = false;
    console.log(`✅ Deployment queue processor finished`);
  }

  buildContainerLabels(deployment, hostPort, containerPort) {
    return {
      'cloudops.deployment-id': deployment._id.toString(),
      'cloudops.project-id': deployment.projectId ? deployment.projectId.toString() : '',
      'cloudops.repository': deployment.repositoryName || this.extractRepositoryName(deployment.repositoryUrl),
      'cloudops.host-port': String(hostPort),
      'cloudops.container-port': String(containerPort),
    };
  }

  async cloneAndPrepare(deployment, buildDir, io) {
    deployment.updateStatus('cloning', 'clone');
    await this.saveDeployment(deployment);
    this.emitLog(io, deployment, 'git', 'info', 'Cloning repository', {
      repositoryUrl: deployment.repositoryUrl,
      branch: deployment.branch,
    });

    await gitService.cloneRepository(deployment.repositoryUrl, buildDir, {
      branch: deployment.branch,
      depth: 1,
      maxRetries: 3,
    });

    this.emitLog(io, deployment, 'git', 'info', 'Repository cloned', { buildDir });

    const repoInfo = await gitService.getRepositoryInfo(buildDir);
    deployment.commitHash = repoInfo.latestCommit.hash;
    deployment.commitShortHash = repoInfo.latestCommit.shortHash;
    deployment.commitMessage = repoInfo.latestCommit.message;
    deployment.commitAuthor = repoInfo.latestCommit.author;
    deployment.commitDate = repoInfo.latestCommit.date;
    deployment.branch = repoInfo.currentBranch || deployment.branch;

    const repoSize = await gitService.getRepositorySize(buildDir);
    deployment.metadata = deployment.metadata || {};
    deployment.metadata.repositorySize = repoSize;
    deployment.metadata.repositoryInfo = repoInfo;

    await this.saveDeployment(deployment);
  }

  async detectAndGenerate(deployment, buildDir, io) {
    const rootDirectory = deployment.metadata?.rootDirectory || './';
    const normalizedRoot = rootDirectory && rootDirectory !== './'
      ? rootDirectory.replace(/^\.\//, '').replace(/^\/+/, '')
      : '';
    const appDir = normalizedRoot ? path.join(buildDir, normalizedRoot) : buildDir;

    const relativeAppDir = path.relative(buildDir, appDir);
    if (normalizedRoot && (relativeAppDir.startsWith('..') || path.isAbsolute(relativeAppDir))) {
      throw new Error('Invalid root directory for deployment.');
    }

    // Detect framework for metadata
    deployment.updateStatus('detecting', 'framework_detection');
    await this.saveDeployment(deployment);
    this.emitLog(io, deployment, 'framework', 'info', 'Detecting framework');

    const detected = await frameworkDetector.detectFramework(appDir);
    deployment.framework = detected.framework;
    deployment.frameworkVersion = detected.version;
    deployment.frameworkDetails = detected.details;

    this.emitLog(io, deployment, 'framework', 'info', `Detected ${detected.framework}`, {
      version: detected.version,
      port: detected.port,
      buildCommand: detected.buildCommand,
      confidence: detected.confidence,
    });

    // Check if Dockerfile exists in the cloned repository
    const dockerfilePath = path.join(appDir, 'Dockerfile');
    let dockerfileExists = fsSyncModule.existsSync(dockerfilePath);

    if (!dockerfileExists) {
      const generatedDockerfile = dockerfileGenerator.generateDockerfile(detected.framework, {
        port: detected.port || 3000,
        buildCommand: detected.buildCommand,
        startCommand: detected.startCommand,
      });
      await dockerfileGenerator.saveDockerfile(generatedDockerfile, dockerfilePath);
      dockerfileExists = true;
      this.emitLog(io, deployment, 'docker', 'info', 'Generated Dockerfile for detected backend', {
        dockerfilePath,
      });
    }

    if (dockerfileExists) {
      this.emitLog(io, deployment, 'docker', 'info', 'Using Dockerfile', { dockerfilePath });
    }

    const dockerfileContent = await fs.readFile(dockerfilePath, 'utf8');
    deployment.dockerfile = dockerfileContent;

    deployment.metadata = deployment.metadata || {};
    deployment.metadata.dockerfilePath = dockerfilePath;
    deployment.metadata.buildContext = appDir;
    deployment.metadata.rootDirectory = rootDirectory || './';
    deployment.metadata.containerPort = detected.port || 3000;
    deployment.metadata.framework = detected.framework;
    deployment.metadata.frameworkVersion = detected.version;
    deployment.metadata.buildCommand = detected.buildCommand;
    deployment.metadata.startCommand = detected.startCommand;

    await this.saveDeployment(deployment);

    return {
      detected,
      containerPort: detected.port || 3000,
      dockerfileContent,
      dockerfilePath,
      buildContext: appDir,
      rootDirectory: rootDirectory || './',
    };
  }

  async prepareRemoteWorkspace(deployment, buildDir, target) {
    const remoteParent = target.workspaceRoot || '/tmp/cloudops-deployments';
    const remoteWorkspace = `${remoteParent}/${path.basename(buildDir)}`;

    await dockerService.runRemoteCommand(target, `mkdir -p ${this.shellQuote(remoteParent)} && rm -rf ${this.shellQuote(remoteWorkspace)} && mkdir -p ${this.shellQuote(remoteWorkspace)}`);
    await dockerService.copyToRemote(target, buildDir, remoteParent);

    return { remoteParent, remoteWorkspace };
  }

  shellQuote(value) {
    return `'${String(value).replace(/'/g, `'"'"'`)}'`;
  }

  async configureNginx(deployment, hostPort, target, io) {
    const nginxConfig = this.buildNginxConfig({
      hostPort,
      serverName: target.publicHost || '_',
    });

    deployment.metadata = deployment.metadata || {};
    deployment.metadata.nginxConfig = nginxConfig;

    if (target.type === 'ssh') {
      const tempRemotePath = `/tmp/cloudops-${deployment._id}.conf`;
      const remoteConfigPath = `/etc/nginx/conf.d/cloudops-${deployment._id}.conf`;
      const localTempConfig = path.join(os.tmpdir(), `cloudops-nginx-${deployment._id}.conf`);

      await fs.writeFile(localTempConfig, nginxConfig, 'utf8');
      await dockerService.copyFileToRemote(target, localTempConfig, tempRemotePath);
      await dockerService.runRemoteCommand(
        target,
        `sudo mv ${this.shellQuote(tempRemotePath)} ${this.shellQuote(remoteConfigPath)} && sudo nginx -t && (sudo systemctl reload nginx || sudo nginx -s reload)`
      );

      deployment.metadata.nginxConfigPath = remoteConfigPath;
      this.emitLog(io, deployment, 'system', 'info', 'NGINX configured on remote host', {
        nginxConfigPath: remoteConfigPath,
      });

      await fs.rm(localTempConfig, { force: true }).catch(() => {});
      return remoteConfigPath;
    }

    const localConfigPath = path.join(buildDirFromDeployment(deployment), 'nginx.conf');
    await fs.writeFile(localConfigPath, nginxConfig, 'utf8');
    deployment.metadata.nginxConfigPath = localConfigPath;
    this.emitLog(io, deployment, 'system', 'info', 'NGINX config generated', {
      nginxConfigPath: localConfigPath,
    });
    return localConfigPath;
  }

  async runDeployment(deploymentId, io = null) {
    let deployment = null;
    let buildDir = null;
    let hostPort = null;
    let startedAt = null;

    try {
      console.log(`\n${'═'.repeat(60)}`);
      console.log(`🚀 STARTING DEPLOYMENT: ${deploymentId}`);
      console.log(`${'═'.repeat(60)}\n`);

      deployment = await Deployment.findById(deploymentId);
      if (!deployment) {
        throw new Error('Deployment not found');
      }

      console.log(`📦 Repository: ${deployment.repositoryName}`);
      console.log(`🌿 Branch: ${deployment.branch}`);
      console.log(`📍 Repository URL: ${deployment.repositoryUrl}\n`);

      startedAt = Date.now();
      buildDir = getBuildDir(`cloudops-${deploymentId}`);
      await fs.mkdir(buildDir, { recursive: true });

      const target = this.normalizeTarget(deployment.metadata?.target || deployment.infrastructure?.target || {});

      await this.cloneAndPrepare(deployment, buildDir, io);
      const prepResult = await this.detectAndGenerate(deployment, buildDir, io);
      const containerPort = prepResult.containerPort;
      hostPort = await this.allocatePort();
      const imageName = `cloudops-${deploymentId}`.toLowerCase();
      const containerName = `cloudops-${deploymentId}`.toLowerCase();

      deployment.updateStatus('building', 'docker_build');
      await this.saveDeployment(deployment);
      this.emitLog(io, deployment, 'docker', 'info', 'Building Docker image', {
        imageName,
        contextPath: buildDir,
      });

      let buildContext = prepResult.buildContext || buildDir;
      let remoteWorkspace = null;

      if (target.type === 'ssh') {
        const remote = await this.prepareRemoteWorkspace(deployment, buildDir, target);
        const relativeContext = path.relative(buildDir, buildContext);
        buildContext = relativeContext && relativeContext !== '.'
          ? `${remote.remoteWorkspace}/${relativeContext.split(path.sep).join('/')}`
          : remote.remoteWorkspace;
        remoteWorkspace = remote.remoteWorkspace;
        this.syncInfrastructure(deployment, {
          provider: 'ssh',
          targetType: 'ssh',
          target,
          container: {
            name: containerName,
            imageName,
          },
        });
        deployment.metadata.remoteWorkspace = remoteWorkspace;
        await this.saveDeployment(deployment);
      }

      await dockerService.buildImage({
        imageName,
        contextPath: buildContext,
        dockerfilePath: path.join(buildContext, 'Dockerfile'),
        target: target.type === 'ssh' ? { ...target, remoteWorkspace: buildContext } : null,
        onStdout: (chunk) => this.emitLog(io, deployment, 'docker', 'debug', chunk.trim(), {}),
        onStderr: (chunk) => this.emitLog(io, deployment, 'docker', 'warn', chunk.trim(), {}),
      });

      // Handle AWS EC2 deployment
      if (target.type === 'aws') {
        console.log(`\n${'═'.repeat(60)}`);
        console.log(`☁️  AWS EC2 DEPLOYMENT`);
        console.log(`${'═'.repeat(60)}\n`);

        deployment.updateStatus('deploying', 'push_ecr');
        await this.saveDeployment(deployment);

        // Push image to ECR
        const ecrResult = await awsDeploymentEngine.pushImageToECR(
          deploymentId,
          imageName,
          deployment,
          io,
          (io2, dep, source, level, message, data) => this.emitLog(io2, dep, source, level, message, data)
        );

        this.syncInfrastructure(deployment, {
          provider: 'aws',
          targetType: 'aws',
          region: target.awsRegion || process.env.AWS_REGION || null,
          ecr: {
            repositoryArn: ecrResult.repositoryArn || null,
            repositoryName: ecrResult.repositoryName,
            repositoryUri: ecrResult.ecrUri || ecrResult.repositoryUri || null,
            imageUri: ecrResult.imageUri,
            imageTag: ecrResult.imageTag,
          },
          container: {
            name: containerName,
            imageName,
            port: containerPort,
          },
        });
        deployment.dockerImageUri = ecrResult.imageUri;
        deployment.dockerImageTag = ecrResult.imageTag;
        deployment.updateStatus('deploying', 'ec2_launch');
        await this.saveDeployment(deployment);

        // Launch EC2 instance
        const ec2Result = await awsDeploymentEngine.launchEC2Instance(
          deploymentId,
          ecrResult.imageUri,
          deployment,
          io,
          (io2, dep, source, level, message, data) => this.emitLog(io2, dep, source, level, message, data),
          {
            instanceType: target.instanceType,
            keyName: target.keyName,
            securityGroupIds: target.securityGroupIds,
            vpcId: target.vpcId,
            containerPort,
          }
        );

        this.syncInfrastructure(deployment, {
          provider: 'aws',
          targetType: 'aws',
          region: target.awsRegion || process.env.AWS_REGION || null,
          ecr: {
            repositoryArn: ecrResult.repositoryArn || null,
            repositoryName: ecrResult.repositoryName,
            repositoryUri: ecrResult.ecrUri || ecrResult.repositoryUri || null,
            imageUri: ecrResult.imageUri,
            imageTag: ecrResult.imageTag,
          },
          ec2: {
            instanceId: ec2Result.instanceId,
            publicIp: ec2Result.publicIp,
            privateIp: ec2Result.privateIp,
            instanceType: target.instanceType || null,
            keyName: target.keyName || null,
            securityGroupIds: target.securityGroupIds || [],
            vpcId: target.vpcId || null,
          },
          container: {
            name: containerName,
            imageName,
            port: containerPort,
          },
          liveUrl: ec2Result.liveUrl,
          deployState: 'running',
        });
        deployment.publicUrl = ec2Result.liveUrl;
        deployment.totalTime = Date.now() - startedAt;
        deployment.updateStatus('success', 'complete');
        deployment.markAsSuccess(ec2Result.liveUrl, Date.now() - startedAt);
        deployment.infrastructure = deployment.infrastructure || {};
        deployment.infrastructure.deployState = 'running';
        deployment.metadata.completedAt = new Date().toISOString();
        await this.saveDeployment(deployment);

        const totalTimeMs = Date.now() - startedAt;
        const totalTimeSec = (totalTimeMs / 1000).toFixed(2);

        console.log(`\n${'═'.repeat(60)}`);
        console.log(`✅ AWS EC2 DEPLOYMENT SUCCESSFUL`);
        console.log(`${'═'.repeat(60)}`);
        console.log(`🌐 Live URL: ${ec2Result.liveUrl}`);
        console.log(`☁️  Instance ID: ${ec2Result.instanceId}`);
        console.log(`📍 Public IP: ${ec2Result.publicIp}`);
        console.log(`🔒 Private IP: ${ec2Result.privateIp}`);
        console.log(`📦 ECR URI: ${ecrResult.imageUri}`);
        console.log(`⏱️  Total Time: ${totalTimeSec}s`);
        console.log(`${'═'.repeat(60)}\n`);

        this.emitLog(io, deployment, 'system', 'success', 'AWS EC2 deployment completed successfully', {
          liveUrl: ec2Result.liveUrl,
          instanceId: ec2Result.instanceId,
          publicIp: ec2Result.publicIp,
          ecrUri: ecrResult.imageUri,
        });

        if (io && typeof io.to === 'function') {
          io.to(this.toDeploymentRoom(deployment)).emit('deployment-complete', {
            deploymentId: deployment._id.toString(),
            status: 'success',
            liveUrl: ec2Result.liveUrl,
            instanceId: ec2Result.instanceId,
            publicIp: ec2Result.publicIp,
            privateIp: ec2Result.privateIp,
          });
        }

        return {
          success: true,
          deploymentId: deployment._id.toString(),
          status: deployment.status,
          phase: deployment.phase,
          liveUrl: ec2Result.liveUrl,
          instanceId: ec2Result.instanceId,
          publicIp: ec2Result.publicIp,
          ecrUri: ecrResult.imageUri,
        };
      }

      deployment.updateStatus('deploying', 'container_start');
      await this.saveDeployment(deployment);
      this.emitLog(io, deployment, 'docker', 'info', 'Starting container', {
        hostPort,
        containerPort,
        containerName,
      });

      const environmentObject = this.buildEnvironmentObject(deployment.environmentVariables);
      const labels = this.buildContainerLabels(deployment, hostPort, containerPort);

      const runResult = await dockerService.runContainer({
        imageName,
        containerName,
        hostPort,
        containerPort,
        env: environmentObject,
        target: target.type === 'ssh' ? target : null,
        labels,
        onStdout: (chunk) => this.emitLog(io, deployment, 'docker', 'debug', chunk.trim(), {}),
        onStderr: (chunk) => this.emitLog(io, deployment, 'docker', 'warn', chunk.trim(), {}),
      });

      const liveUrl = target.type === 'ssh'
        ? (target.publicUrl || `http://${target.publicHost || target.host}`)
        : `http://localhost:${hostPort}`;

      this.syncInfrastructure(deployment, {
        provider: target.type || 'local',
        targetType: target.type || 'local',
        region: target.awsRegion || process.env.AWS_REGION || null,
        target,
        container: {
          name: containerName,
          imageName,
          port: containerPort,
        },
        liveUrl,
        deployState: 'completed',
      });
      deployment.metadata = deployment.metadata || {};
      deployment.metadata.imageName = imageName;
      deployment.metadata.containerName = containerName;
      deployment.metadata.hostPort = hostPort;
      deployment.metadata.containerPort = containerPort;
      deployment.metadata.liveUrl = liveUrl;
      deployment.metadata.runResult = runResult;
      deployment.metadata.queueState = 'completed';
      deployment.publicUrl = liveUrl;
      deployment.totalTime = Date.now() - startedAt;
      deployment.deployTime = deployment.totalTime;
      deployment.buildTime = Math.max(1, deployment.totalTime - 5000);
      deployment.updateStatus('running', 'nginx_setup');
      await this.saveDeployment(deployment);

      await this.configureNginx(deployment, hostPort, target, io);

      deployment.updateStatus('success', 'complete');
      deployment.markAsSuccess(liveUrl, Date.now() - startedAt);
      deployment.infrastructure = deployment.infrastructure || {};
      deployment.infrastructure.deployState = 'running';
      deployment.metadata.completedAt = new Date().toISOString();
      deployment.metadata.containerStatus = 'running';
      await this.saveDeployment(deployment);

      const totalTimeMs = Date.now() - startedAt;
      const totalTimeSec = (totalTimeMs / 1000).toFixed(2);

      console.log(`\n${'═'.repeat(60)}`);
      console.log(`✅ DEPLOYMENT SUCCESSFUL`);
      console.log(`${'═'.repeat(60)}`);
      console.log(`🌐 Live URL: ${liveUrl}`);
      console.log(`📦 Image: ${imageName}`);
      console.log(`🐳 Container: ${containerName}`);
      console.log(`🔌 Port: ${hostPort} → ${containerPort}`);
      console.log(`⏱️  Total Time: ${totalTimeSec}s`);
      console.log(`${'═'.repeat(60)}\n`);

      this.emitLog(io, deployment, 'system', 'success', 'Deployment completed successfully', {
        liveUrl,
        imageName,
        containerName,
        hostPort,
        containerPort,
      });

      if (io && typeof io.to === 'function') {
        io.to(this.toDeploymentRoom(deployment)).emit('deployment-complete', {
          success: true,
          deploymentId: deployment._id.toString(),
          status: deployment.status,
          liveUrl,
          imageName,
          containerName,
          hostPort,
          containerPort,
        });
      }

      return {
        success: true,
        deploymentId: deployment._id.toString(),
        status: deployment.status,
        phase: deployment.phase,
        liveUrl,
        imageName,
        containerName,
        hostPort,
        containerPort,
      };
    } catch (error) {
      const totalTimeMs = startedAt ? Date.now() - startedAt : 0;
      const totalTimeSec = (totalTimeMs / 1000).toFixed(2);

      console.log(`\n${'═'.repeat(60)}`);
      console.log(`❌ DEPLOYMENT FAILED`);
      console.log(`${'═'.repeat(60)}`);
      console.log(`❌ Error: ${error.message}`);
      if (error.stderr) {
        console.log(`❌ Details: ${error.stderr.substring(0, 200)}`);
      }
      console.log(`⏱️  Time: ${totalTimeSec}s`);
      console.log(`${'═'.repeat(60)}\n`);

      if (deployment) {
        deployment.updateStatus('failed', 'cleanup');
        deployment.markAsFailed(error, deployment.phase);
        deployment.metadata = deployment.metadata || {};
        deployment.metadata.queueState = 'failed';
        deployment.metadata.failureAt = new Date().toISOString();
        await deployment.save().catch(() => {});
        
        // Provide detailed error messages based on error type
        let errorMessage = error.message;
        if (error.stderr && error.stderr.includes('dockerDesktopLinuxEngine')) {
          errorMessage = '🐳 Docker daemon is not running. Please start Docker Desktop and try again.';
        } else if (error.message && error.message.includes('Docker is not available')) {
          errorMessage = error.message;
        }
        
        this.emitLog(io, deployment, 'system', 'error', 'Deployment failed', {
          error: errorMessage,
          phase: deployment.phase,
          stderr: error.stderr || '',
        });
      }

      await this.cleanupFailedDeployment({
        deployment,
        buildDir,
        hostPort,
        io,
      });

      throw error;
    } finally {
      if (hostPort !== null) {
        this.releasePort(hostPort);
      }

      if (buildDir) {
        await fs.rm(buildDir, { recursive: true, force: true }).catch(() => {});
      }
    }
  }

  async cleanupFailedDeployment({ deployment, buildDir, hostPort, io }) {
    if (!deployment) {
      return;
    }

    const metadata = deployment.metadata || {};
    const target = this.normalizeTarget(metadata.target || {});
    const containerName = metadata.containerName;
    const imageName = metadata.imageName;
    const triggeredBy = deployment.triggeredBy;

    // For webhook redeploys, skip container/image cleanup as we reuse infrastructure
    const skipInfrastructureCleanup = triggeredBy === 'webhook';

    if (containerName && !skipInfrastructureCleanup) {
      await dockerService.removeContainer(containerName, target.type === 'ssh' ? target : null).catch(() => {});
    }

    if (imageName && !skipInfrastructureCleanup) {
      await dockerService.removeImage(imageName, target.type === 'ssh' ? target : null).catch(() => {});
    }

    if (buildDir) {
      await fs.rm(buildDir, { recursive: true, force: true }).catch(() => {});
    }

    if (hostPort) {
      this.releasePort(hostPort);
    }

    const cleanupData = {
      hostPort: hostPort || null,
    };

    // Only include container/image in log if they exist
    if (containerName) cleanupData.containerName = containerName;
    if (imageName) cleanupData.imageName = imageName;
    if (skipInfrastructureCleanup) cleanupData.infrastructureReused = 'webhook redeploy';

    this.emitLog(io, deployment, 'system', 'warn', 'Failed deployment cleaned up', cleanupData);
  }

  async getDeploymentDetails(deploymentId) {
    const deployment = await Deployment.findById(deploymentId);
    if (!deployment) {
      throw new Error('Deployment not found');
    }

    return {
      deploymentId: deployment._id.toString(),
      _id: deployment._id.toString(),
      projectId: deployment.projectId ? deployment.projectId.toString() : null,
      userId: deployment.userId,
      repositoryUrl: deployment.repositoryUrl,
      repositoryName: deployment.repositoryName,
      branch: deployment.branch,
      status: deployment.status,
      phase: deployment.phase,
      framework: deployment.framework,
      publicUrl: deployment.publicUrl,
      domainUrl: deployment.domainUrl,
      healthStatus: deployment.healthStatus,
      applicationType: deployment.applicationType,
      applicationName: deployment.applicationName,
      deploymentService: deployment.deploymentService,
      deploymentType: deployment.deploymentType,
      provider: deployment.provider,
      commitHash: deployment.commitHash,
      commitShortHash: deployment.commitShortHash,
      commitMessage: deployment.commitMessage,
      commitAuthor: deployment.commitAuthor,
      commitDate: deployment.commitDate,
      dockerImageUri: deployment.dockerImageUri,
      dockerImageTag: deployment.dockerImageTag,
      dockerBuildTime: deployment.dockerBuildTime,
      dockerImageSize: deployment.dockerImageSize,
      buildTime: deployment.buildTime,
      logs: deployment.logs.slice(-100),
      infrastructure: deployment.infrastructure || {},
      metadata: deployment.metadata || {},
      error: deployment.error,
      startedAt: deployment.startedAt,
      completedAt: deployment.completedAt,
      totalTime: deployment.totalTime,
    };
  }

  async listDeployments(filter = {}) {
    const query = {};

    if (filter.projectId) {
      query.projectId = filter.projectId;
    }

    if (filter.userId) {
      query.userId = String(filter.userId);
    }

    if (filter.status) {
      query.status = filter.status;
    }

    return Deployment.find(query).sort({ createdAt: -1 });
  }

  async getDeploymentLogs(deploymentId, options = {}) {
    const deployment = await Deployment.findById(deploymentId);
    if (!deployment) {
      throw new Error('Deployment not found');
    }

    const { source = null, level = null, limit = 100, skip = 0 } = options;
    let logs = [...deployment.logs];

    if (source) {
      logs = logs.filter((log) => log.source === source);
    }

    if (level) {
      logs = logs.filter((log) => log.level === level);
    }

    logs.sort((a, b) => b.timestamp - a.timestamp);
    return logs.slice(skip, skip + limit);
  }

  async stopDeployment(deploymentId, io = null) {
    const deployment = await Deployment.findById(deploymentId);
    if (!deployment) {
      throw new Error('Deployment not found');
    }

    const metadata = deployment.metadata || {};
    const target = this.normalizeTarget(metadata.target || {});
    const containerName = metadata.containerName;

    if (!containerName) {
      throw new Error('Container name not found for deployment');
    }

    await dockerService.stopContainer(containerName, target.type === 'ssh' ? target : null);
    deployment.updateStatus('stopped', 'cleanup');
    deployment.metadata = deployment.metadata || {};
    deployment.metadata.containerStatus = 'stopped';
    await deployment.save();

    this.emitLog(io, deployment, 'docker', 'info', 'Container stopped', { containerName });

    return { success: true, status: 'stopped', containerName };
  }

  async restartDeployment(deploymentId, io = null) {
    const deployment = await Deployment.findById(deploymentId);
    if (!deployment) {
      throw new Error('Deployment not found');
    }

    const metadata = deployment.metadata || {};
    const target = this.normalizeTarget(metadata.target || {});
    const containerName = metadata.containerName;
    const imageName = metadata.imageName;
    const hostPort = metadata.hostPort;
    const containerPort = metadata.containerPort || 3000;
    const env = this.buildEnvironmentObject(deployment.environmentVariables);
    const labels = this.buildContainerLabels(deployment, hostPort, containerPort);

    if (!containerName || !imageName || !hostPort) {
      throw new Error('Deployment is missing restart metadata');
    }

    try {
      await dockerService.restartContainer(containerName, target.type === 'ssh' ? target : null);
    } catch (error) {
      await dockerService.runContainer({
        imageName,
        containerName,
        hostPort,
        containerPort,
        env,
        target: target.type === 'ssh' ? target : null,
        labels,
      });
    }

    deployment.updateStatus('running', 'container_start');
    deployment.metadata = deployment.metadata || {};
    deployment.metadata.containerStatus = 'running';
    await deployment.save();

    this.emitLog(io, deployment, 'docker', 'info', 'Container restarted', { containerName });

    return { success: true, status: 'running', containerName };
  }

  async handleWebhook(payload, io = null, requestContext = {}) {
    const repository = payload?.repository || {};
    const fullName = repository.full_name || '';
    const cloneUrl = repository.clone_url || repository.ssh_url || '';

    const project = await Project.findOne({
      $or: [
        { repositoryUrl: cloneUrl },
        fullName ? { repositoryName: repository.name, repositoryOwner: repository.owner?.login } : null,
      ].filter(Boolean),
    });

    if (!project) {
      throw new Error('No matching project found for webhook');
    }

    const latestDeployment = await Deployment.findOne({ projectId: project._id }).sort({ createdAt: -1 });
    const target = this.normalizeTarget(latestDeployment?.metadata?.target || {});
    const branch = payload?.ref ? payload.ref.replace('refs/heads/', '') : (repository.default_branch || 'main');

    if (payload?.deleted) {
      return {
        success: true,
        skipped: true,
        reason: 'Branch deletion webhook ignored',
        branch,
      };
    }

    if (branch !== 'main') {
      return {
        success: true,
        skipped: true,
        reason: `Push to branch ${branch} ignored. Auto-redeploy is enabled only for main.`,
        branch,
      };
    }

    // Mark previous deployment as redeployed if it exists and is running/success
    if (latestDeployment && ['running', 'success'].includes(latestDeployment.status)) {
      try {
        latestDeployment.status = 'redeployed';
        latestDeployment.phase = 'complete';
        if (!latestDeployment.completedAt) {
          latestDeployment.completedAt = new Date();
        }
        await latestDeployment.save();
        this.emitLog(io, latestDeployment, 'system', 'info', 'Previous deployment marked as redeployed');

        const previousInstanceId = latestDeployment.infrastructure?.ec2?.instanceId || latestDeployment.metadata?.ec2InstanceId;
        if (previousInstanceId) {
          try {
            await ec2Service.terminateInstance(previousInstanceId);
            this.emitLog(io, latestDeployment, 'system', 'info', 'Previous EC2 instance terminated after redeploy', {
              instanceId: previousInstanceId,
            });
          } catch (terminateError) {
            this.emitLog(io, latestDeployment, 'system', 'warn', 'Failed to terminate previous EC2 instance after redeploy', {
              instanceId: previousInstanceId,
              error: terminateError.message,
            });
          }
        }
      } catch (error) {
        console.warn('Failed to mark previous deployment as redeployed:', error.message);
      }
    }

    const deploymentCount = await Deployment.countDocuments({ projectId: project._id });
    const headCommit = payload?.head_commit || {};
    const commitHash = payload?.after || headCommit.id || null;
    const commitAuthor = headCommit?.author?.name || payload?.pusher?.name || null;
    const commitDate = headCommit?.timestamp || new Date().toISOString();

    const versionDetails = {
      sequence: deploymentCount + 1,
      deploymentVersion: `v${deploymentCount + 1}`,
      branch,
      commitHash,
      previousCommitHash: payload?.before || null,
      compareUrl: payload?.compare || null,
      commitMessage: headCommit?.message || null,
      commitAuthor,
      pusher: payload?.pusher?.name || null,
      pushedAt: commitDate,
      source: 'github-webhook',
    };

    return this.startDeployment({
      projectId: project._id,
      userId: project.userId,
      repositoryUrl: project.repositoryUrl,
      repositoryName: project.repositoryName,
      branch,
      environmentVariables: latestDeployment?.environmentVariables || [],
      target,
      triggeredBy: 'webhook',
      webhookId: project.githubWebhookId,
      previousDeploymentId: latestDeployment?._id || null,
      commitHash,
      commitShortHash: commitHash ? String(commitHash).slice(0, 7) : null,
      commitMessage: headCommit?.message || null,
      commitAuthor,
      commitDate,
      versionDetails,
      webhookPayload: {
        event: 'push',
        deliveryId: requestContext.deliveryId || null,
        branch,
        ref: payload?.ref || null,
      },
    }, io);
  }

  verifyWebhookSignature(rawBody, secret, signatureHeader) {
    if (!secret || !signatureHeader || !rawBody) {
      return false;
    }

    const bodyBuffer = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody));
    const expected = crypto.createHmac('sha256', secret).update(bodyBuffer).digest('hex');
    const received = String(signatureHeader).replace(/^sha256=/, '');

    if (expected.length !== received.length) {
      return false;
    }

    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(received, 'hex'));
  }
}

function buildDirFromDeployment(deployment) {
  return getBuildDir(`cloudops-${deployment._id.toString()}`);
}

module.exports = new DeploymentEngineService();
