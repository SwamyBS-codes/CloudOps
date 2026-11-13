/**
 * Azure Deployment Service
 * Handles ACR image build/push and ACI container deployment
 */

const path = require('path');
const fs = require('fs/promises');
const { existsSync } = require('fs');
const { spawn } = require('child_process');
const simpleGit = require('simple-git');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const Deployment = require('../models/Deployment');
const User = require('../models/User');
const blobBuildService = require('./blobBuildService');
const { maskSecrets } = require('../utils/logSanitizer');
const { pushDeploymentLog } = require('../utils/deploymentPersistence');
const { getBuildDir } = require('../utils/pathResolver');

const TEMP_ROOT = getBuildDir('azure');
const DEFAULT_CONTAINER_PORT = 3000;

// Registry of in-flight active deployments for cancellation
const activeDeployments = new Map();

// Azure settings — read from env at call time so .env is loaded first
function azureConfig() {
  return {
    acrLoginServer: process.env.ACR_LOGIN_SERVER,
    acrUsername: process.env.ACR_USERNAME,
    acrPassword: process.env.ACR_PASSWORD,
    resourceGroup: process.env.AZURE_RESOURCE_GROUP || 'cloud-ops-sea',
    location: process.env.AZURE_LOCATION || 'southeastasia',
    blobContainer: process.env.AZURE_BLOB_CONTAINER || 'cloudops-artifacts',
    prefixBase: process.env.AZURE_PREFIX_BASE || 'deployments',
    // Path to the orchestrator Python package — resolve from backend/ root
    orchestratorCwd: path.resolve(
      __dirname,  // backend/src/services
      '..', '..', // -> backend/
      '..', 'azure'  // -> SWAMY/azure (so `python -m orchestrator.core.aci_main` finds `orchestrator`)
    ),
    python: process.env.PYTHON || 'python3',
  };
}

function runCommand(command, args, options = {}, onData, activeItem = null) {
  return new Promise((resolve, reject) => {
    if (activeItem?.cancelled) {
      return reject(new Error('Deployment cancelled by user'));
    }
    // Always merge with full parent env so PATH/COMSPEC/SystemRoot are never lost
    const mergedEnv = { ...process.env, ...(options.env || {}) };
    const { env: _e, ...restOpts } = options;

    // Spawn directly without shell — works cross-platform and avoids cmd.exe lookup issues
    const child = spawn(command, args, { ...restOpts, env: mergedEnv, shell: false });
    if (activeItem) {
      activeItem.childProcesses.add(child);
    }
    let output = '';

    child.on('error', (err) => {
      if (activeItem) activeItem.childProcesses.delete(child);
      reject(err);
    });
    child.stdout.on('data', (chunk) => {
      const text = maskSecrets(chunk.toString());
      output += text;
      if (onData) onData(text);
    });
    child.stderr.on('data', (chunk) => {
      const text = maskSecrets(chunk.toString());
      output += text;
      if (onData) onData(text);
    });
    child.on('close', (code) => {
      if (activeItem) activeItem.childProcesses.delete(child);
      if (activeItem?.cancelled) {
        return reject(new Error('Deployment cancelled by user'));
      }
      if (code === 0) return resolve(output);
      reject(new Error(`${command} exited with code ${code}\n${output}`));
    });
  });
}

async function safeRemove(targetPath) {
  if (!existsSync(targetPath)) return;
  await fs.rm(targetPath, { recursive: true, force: true });
}

async function findNodeAppRelativePath(repoPath) {
  if (existsSync(path.join(repoPath, 'package.json'))) return '.';
  async function walk(currentPath, depth, baseRelative) {
    if (depth > 4) return null;
    let entries = [];
    try { entries = await fs.readdir(currentPath, { withFileTypes: true }); } catch { return null; }
    if (entries.some((e) => e.isFile() && e.name === 'package.json')) return baseRelative || '.';
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === '.git' || entry.name === 'node_modules') continue;
      const rel = baseRelative ? `${baseRelative}/${entry.name}` : entry.name;
      const found = await walk(path.join(currentPath, entry.name), depth + 1, rel);
      if (found) return found;
    }
    return null;
  }
  return walk(repoPath, 0, '');
}

async function findFirstMatchingDir(repoPath, matcher) {
  async function walk(currentPath, depth, baseRelative) {
    if (depth > 4) return null;
    let entries = [];
    try { entries = await fs.readdir(currentPath, { withFileTypes: true }); } catch { return null; }
    if (matcher(entries)) return baseRelative || '.';
    for (const entry of entries) {
      if (!entry.isDirectory() || ['git', 'node_modules', '__pycache__'].includes(entry.name)) continue;
      const rel = baseRelative ? `${baseRelative}/${entry.name}` : entry.name;
      const found = await walk(path.join(currentPath, entry.name), depth + 1, rel);
      if (found) return found;
    }
    return null;
  }
  return walk(repoPath, 0, '');
}

async function detectFramework(repoPath) {
  const nodePath = await findNodeAppRelativePath(repoPath);
  if (nodePath) return { framework: 'nodejs', appRelativePath: nodePath };

  const pythonPath = await findFirstMatchingDir(repoPath, (entries) =>
    entries.some((e) => e.isFile() && (e.name === 'requirements.txt' || e.name.toLowerCase().endsWith('.py')))
  );
  if (pythonPath) return { framework: 'python', appRelativePath: pythonPath };

  const htmlPath = await findFirstMatchingDir(repoPath, (entries) =>
    entries.some((e) => e.isFile() && e.name.toLowerCase().endsWith('.html'))
  );
  if (htmlPath) return { framework: 'static', appRelativePath: htmlPath };

  return { framework: 'generic', appRelativePath: '.' };
}

async function ensureDockerfile(repoPath) {
  const dockerfilePath = path.join(repoPath, 'Dockerfile');
  if (existsSync(dockerfilePath)) return { framework: 'custom', appRelativePath: '.', containerPort: DEFAULT_CONTAINER_PORT };

  const detection = await detectFramework(repoPath);
  const { appRelativePath } = detection;
  const cp = appRelativePath === '.' ? '' : `${appRelativePath}/`;

  const templates = {
    nodejs: `FROM node:20-alpine\nWORKDIR /app\nCOPY ${cp}package*.json ./\nRUN npm install\nCOPY ${cp}. .\nEXPOSE ${DEFAULT_CONTAINER_PORT}\nCMD ["npm", "start"]\n`,
    node: `FROM node:20-alpine\nWORKDIR /app\nCOPY ${cp}package*.json ./\nRUN npm install\nCOPY ${cp}. .\nEXPOSE ${DEFAULT_CONTAINER_PORT}\nCMD ["npm", "start"]\n`,
    python: `FROM python:3.12-alpine\nENV PYTHONUNBUFFERED=1\nWORKDIR /app\nCOPY ${cp}. .\nRUN if [ -f requirements.txt ]; then pip install --no-cache-dir -r requirements.txt; fi\nCMD ["sh", "-c", "if [ -f app.py ]; then python app.py; elif [ -f main.py ]; then python main.py; else exit 1; fi"]\n`,
    static: `FROM nginx:alpine\nCOPY ${cp}. /usr/share/nginx/html\nEXPOSE 80\nCMD ["nginx", "-g", "daemon off;"]\n`,
    generic: `FROM alpine:3.20\nWORKDIR /workspace\nCOPY . .\nCMD ["sh", "-c", "echo 'No runnable framework detected'; exit 1"]\n`,
  };

  const content = templates[detection.framework] || templates.generic;
  await fs.writeFile(dockerfilePath, content, 'utf8');
  return { framework: detection.framework, appRelativePath, containerPort: detection.framework === 'static' ? 80 : DEFAULT_CONTAINER_PORT };
}

async function runAciViaPython({ deploymentId, appName, image, socketId, logLines, io, deployment, environmentVariables = {}, port = 80, activeItem = null }) {
  const cfg = azureConfig();
  const groupName = activeItem?.containerGroupName || `cg-${appName}-${deploymentId}`.slice(0, 63);
  const logsBlobName = `${cfg.prefixBase}/${deploymentId}/aci.log.txt`;

  if (activeItem) {
    activeItem.containerGroupName = groupName;
  }

  const env = {
    ...process.env,
    AZURE_RESOURCE_GROUP: cfg.resourceGroup,
    AZURE_LOCATION: cfg.location,
    ACI_IMAGE: image,
    ACI_CONTAINER_GROUP_NAME: groupName,
    ACI_CONTAINER_NAME: 'task',
    ACI_PORT: String(port || 80),
    ACI_ENV_JSON: JSON.stringify(environmentVariables || {}),
    ACI_CPU: process.env.ACI_CPU || '1',
    ACI_MEMORY_GB: process.env.ACI_MEMORY_GB || '1.5',
    AZURE_LOGS_CONTAINER: cfg.blobContainer,
    AZURE_LOGS_BLOB_NAME: logsBlobName,
  };

  let publicIp = '';
  let fqdn = '';

  await emitLog(
    io,
    socketId,
    `[Azure] Starting ACI container in ${cfg.resourceGroup}/${cfg.location}...`,
    deployment,
    'aci'
  );

  let aciLogQueue = Promise.resolve();
  await runCommand(cfg.python, ['-m', 'orchestrator.core.aci_main'], { cwd: cfg.orchestratorCwd, env }, (line) => {
    const msg = line.trimEnd();
    if (!msg) return;
    aciLogQueue = aciLogQueue.then(() => emitLog(io, socketId, msg, deployment, 'aci'));
    logLines.push(msg);
    const ipMatch = msg.match(/public IP:\s+(\S+)/);
    if (ipMatch) publicIp = ipMatch[1];
    const fqdnMatch = msg.match(/FQDN:\s+(\S+)/);
    if (fqdnMatch) fqdn = fqdnMatch[1];
  }, activeItem);
  await aciLogQueue;

  const portSuffix = port && port !== 80 ? `:${port}` : '';
  const accessUrl = fqdn ? `http://${fqdn}${portSuffix}` : publicIp ? `http://${publicIp}${portSuffix}` : null;

  return {
    containerGroup: groupName,
    containerName: 'task',
    publicIp,
    fqdn,
    accessUrl,
  };
}

async function uploadArtifacts({ deploymentId, summaryPath, logsPath, activeItem = null }) {
  const cfg = azureConfig();
  const prefix = `${cfg.prefixBase}/${deploymentId}`;
  await runCommand(
    cfg.python,
    ['-m', 'orchestrator.core.cli_upload', '--container', cfg.blobContainer, '--prefix', prefix, '--summary-json', summaryPath, '--logs-json', logsPath],
    { cwd: cfg.orchestratorCwd },
    () => {},
    activeItem
  );
}

async function emitLog(io, socketId, message, deployment, source = 'azure', level = 'info') {
  const sanitizedMessage = maskSecrets(message);
  console.log(sanitizedMessage);
  const deploymentId = deployment?._id?.toString();
  if (deploymentId) {
    const logEntry = await pushDeploymentLog(deploymentId, {
      source,
      level,
      message: sanitizedMessage,
      deploymentService: 'azure',
    });
    io?.to(`deployment:${deploymentId}`).emit('deployment-log', {
      deploymentId,
      source,
      level,
      message: sanitizedMessage,
      timestamp: (logEntry.timestamp || new Date()).toISOString(),
    });
  }
  if (socketId && io) io.to(socketId).emit('deploy:log', sanitizedMessage);
}

/**
 * Main entry point — called from the route handler
 * Responds 202 immediately, then runs the pipeline async
 */
async function runAzureDeployment({
  repoUrl,
  appName,
  socketId,
  io,
  userId,
  applicationType = 'backend-api',
  deploymentType = 'container-hosting',
  provider = 'azure',
  applicationName,
  estimatedCostMonthly,
  estimatedDeployMinutes,
  environmentVariables = {},
  onStarted,
}) {
  const cfg = azureConfig();
  if (!cfg.acrLoginServer) throw new Error('ACR_LOGIN_SERVER is not configured in backend .env');

  const deploymentId = uuidv4().slice(0, 8);
  const sanitizedName = appName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const cloneDir = path.resolve(TEMP_ROOT, `${sanitizedName}-${deploymentId}`);
  const artifactsDir = `${cloneDir}-artifacts`;
  const summaryPath = path.join(artifactsDir, 'summary.json');
  const logsPath = path.join(artifactsDir, 'logs.json');
  const logLines = [];
  const git = simpleGit();

  const groupName = `cg-${sanitizedName}-${deploymentId}`.slice(0, 63);
  const activeItem = {
    cancelled: false,
    childProcesses: new Set(),
    cloneDir,
    artifactsDir,
    containerGroupName: groupName,
  };
  activeDeployments.set(deploymentId, activeItem);

  // Create deployment record
  let deployment = null;
  const envEntries = Array.isArray(environmentVariables)
    ? environmentVariables
    : Object.entries(environmentVariables || {}).map(([key, value]) => ({ key, value: String(value), encrypted: false }));

  try {
    deployment = new Deployment({
      userId: userId || 'anonymous',
      repositoryUrl: repoUrl,
      repositoryName: sanitizedName,
      applicationType,
      applicationName: applicationName || sanitizedName,
      deploymentType,
      provider,
      deploymentService: 'azure',
      environmentVariables: envEntries,
      estimatedCostMonthly,
      estimatedDeployMinutes,
      healthStatus: 'checking',
      status: 'building',
      phase: 'clone',
      metadata: {
        hideInfrastructure: true,
        userFacingSummary: 'Managed container hosting',
      },
      infrastructure: {
        provider: 'azure',
        targetType: 'azure',
        region: cfg.location,
        acr: {
          loginServer: cfg.acrLoginServer,
          repositoryName: sanitizedName,
        },
        aci: {
          containerGroupName: groupName,
          resourceGroupName: cfg.resourceGroup,
          location: cfg.location,
        },
      },
    });
    await deployment.save();
    activeDeployments.set(deployment._id.toString(), activeItem);
  } catch (dbErr) {
    console.error('[Azure] Failed to create deployment record:', dbErr);
    activeDeployments.delete(deploymentId);
    throw dbErr;
  }

  onStarted?.(deployment);

  try {
    if (activeItem.cancelled) throw new Error('Deployment cancelled by user');

    await emitLog(io, socketId, `[Azure] Starting deployment ${deploymentId}`, deployment, 'system');

    const fullImage = `${cfg.acrLoginServer}/${sanitizedName}:${deploymentId}`;
    let containerPort = DEFAULT_CONTAINER_PORT;

    // Zero-Disk Cloud-Native Architecture: Stream directly from GitHub to Azure Blob, build in Ephemeral ACI
    let buildMode = 'cloud-native';
    let blobInfo = null;

    if (repoUrl.includes('github.com')) {
      try {
        await emitLog(io, socketId, `[Azure CloudOps] Starting zero-disk deployment pipeline for ${sanitizedName}:${deploymentId}...`, deployment, 'system');

        let githubToken = null;
        if (userId && userId !== 'anonymous') {
          const userRecord = await User.findOne({
            $or: [
              mongoose.Types.ObjectId.isValid(userId) ? { _id: userId } : null,
              { githubId: String(userId) },
            ].filter(Boolean),
          });
          githubToken = userRecord?.githubAccessToken || null;
        }

        await emitLog(io, socketId, '[Azure CloudOps] Zero-disk pipe: Streaming repository tarball directly from GitHub into Azure Blob Storage...', deployment, 'storage');

        blobInfo = await blobBuildService.streamGitHubToBlob({
          repoUrl,
          deploymentId,
          appName: sanitizedName,
          githubToken,
          onLog: (msg, level) => emitLog(io, socketId, msg, deployment, 'storage', level),
        });

        activeItem.blobName = blobInfo.blobName;
        logLines.push(`[Azure CloudOps] Streamed archive to blob: ${blobInfo.blobName}`);

        const builderGroup = `build-${sanitizedName}-${deploymentId}`.slice(0, 63);
        activeItem.builderGroup = builderGroup;

        await emitLog(io, socketId, `[Azure CloudOps] Launching Ephemeral ACI Builder container (${builderGroup})...`, deployment, 'kaniko');
        await emitLog(io, socketId, `[Azure CloudOps] Server host disk usage: 0 KB. Building in isolated cloud container...`, deployment, 'kaniko');

        const builderArgs = [
          '-m', 'orchestrator.core.ephemeral_builder',
          '--context-url', blobInfo.sasUrl,
          '--destination', fullImage,
          '--builder-group', builderGroup,
          '--acr-server', cfg.acrLoginServer,
          '--acr-username', cfg.acrUsername,
          '--acr-password', cfg.acrPassword,
          '--subscription-id', process.env.AZURE_SUBSCRIPTION_ID,
          '--resource-group', cfg.resourceGroup,
          '--location', cfg.location,
          '--cpu', '1',
          '--memory-gb', '1.5',
        ];

        let buildLogQueue = Promise.resolve();
        await runCommand(cfg.python, builderArgs, { cwd: cfg.orchestratorCwd }, (line) => {
          buildLogQueue = buildLogQueue.then(() => emitLog(io, socketId, line, deployment, 'kaniko'));
          logLines.push(line);
        }, activeItem);
        await buildLogQueue;

        await emitLog(io, socketId, '[Azure CloudOps] Cloud build & push completed successfully. Image ready in ACR.', deployment, 'kaniko', 'success');

        if (deployment) {
          deployment.infrastructure = deployment.infrastructure || {};
          deployment.infrastructure.acr = deployment.infrastructure.acr || {};
          deployment.infrastructure.acr.imageUri = fullImage;
          deployment.infrastructure.acr.imageTag = deploymentId;
          deployment.infrastructure.acr.imageName = sanitizedName;
          await deployment.save();
        }
      } catch (cloudErr) {
        if (activeItem.cancelled) throw cloudErr;
        await emitLog(io, socketId, `[Azure CloudOps] Cloud builder note: ${cloudErr.message}. Executing local fallback pipeline...`, deployment, 'system', 'warning');
        buildMode = 'local-fallback';
      } finally {
        if (blobInfo?.blobName) {
          await blobBuildService.deleteBuildBlob(blobInfo.blobName);
        }
        activeItem.builderGroup = null;
        activeItem.blobName = null;
      }
    } else {
      buildMode = 'local-fallback';
    }

    if (buildMode === 'local-fallback') {
      await emitLog(io, socketId, `[Azure] Cloning ${repoUrl}`, deployment, 'git');

      await safeRemove(cloneDir);
      await safeRemove(artifactsDir);
      await fs.mkdir(cloneDir, { recursive: true });
      await fs.mkdir(artifactsDir, { recursive: true });

      if (activeItem.cancelled) throw new Error('Deployment cancelled by user');

      await git.clone(repoUrl, cloneDir);
      if (activeItem.cancelled) throw new Error('Deployment cancelled by user');

      await emitLog(io, socketId, '[Azure] Repository cloned.', deployment, 'git', 'success');
      logLines.push(`[Azure] Cloned ${repoUrl}`);

      const buildPlan = await ensureDockerfile(cloneDir);
      containerPort = buildPlan?.containerPort || DEFAULT_CONTAINER_PORT;
      await emitLog(io, socketId, `[Azure] Dockerfile ready. Framework: ${buildPlan.framework}`, deployment, 'framework');
      if (deployment) {
        deployment.framework = buildPlan.framework;
        deployment.frameworkVersion = buildPlan.frameworkVersion;
        await deployment.save();
      }
      logLines.push(`[Azure] Framework: ${buildPlan.framework}`);

      await emitLog(io, socketId, `[Azure] Building image ${fullImage}...`, deployment, 'docker');

      if (activeItem.cancelled) throw new Error('Deployment cancelled by user');

      let buildLogQueue = Promise.resolve();
      await runCommand('docker', ['build', '-t', fullImage, '.'], { cwd: cloneDir }, (line) => {
        buildLogQueue = buildLogQueue.then(() => emitLog(io, socketId, line, deployment, 'docker'));
        logLines.push(line);
      }, activeItem);
      await buildLogQueue;

      if (activeItem.cancelled) throw new Error('Deployment cancelled by user');

      if (deployment) {
        deployment.infrastructure = deployment.infrastructure || {};
        deployment.infrastructure.acr = deployment.infrastructure.acr || {};
        deployment.infrastructure.acr.imageUri = fullImage;
        deployment.infrastructure.acr.imageTag = deploymentId;
        deployment.infrastructure.acr.imageName = sanitizedName;
        await deployment.save();
      }

      if (cfg.acrUsername && cfg.acrPassword) {
        await emitLog(io, socketId, '[Azure] Logging into ACR...', deployment, 'acr');

        let loginLogQueue = Promise.resolve();
        await runCommand('docker', ['login', cfg.acrLoginServer, '-u', cfg.acrUsername, '-p', cfg.acrPassword], {}, (line) => {
          loginLogQueue = loginLogQueue.then(() => emitLog(io, socketId, line, deployment, 'acr'));
          logLines.push(line);
        }, activeItem);
        await loginLogQueue;
      }

      if (activeItem.cancelled) throw new Error('Deployment cancelled by user');

      await emitLog(io, socketId, '[Azure] Pushing image to ACR...', deployment, 'acr');

      let pushLogQueue = Promise.resolve();
      await runCommand('docker', ['push', fullImage], {}, (line) => {
        pushLogQueue = pushLogQueue.then(() => emitLog(io, socketId, line, deployment, 'acr'));
        logLines.push(line);
      }, activeItem);
      await pushLogQueue;

      await emitLog(io, socketId, 'Image pushed to ACR successfully', deployment, 'acr', 'success');
    }

    if (activeItem.cancelled) throw new Error('Deployment cancelled by user');

    // Convert env array or object into standard key-value map for container injection
    const envMap = {};
    if (Array.isArray(environmentVariables)) {
      environmentVariables.forEach((e) => {
        if (e && e.key) envMap[e.key] = e.value;
      });
    } else if (typeof environmentVariables === 'object' && environmentVariables !== null) {
      Object.assign(envMap, environmentVariables);
    }

    if (envMap.PORT) {
      const explicitPort = parseInt(envMap.PORT, 10);
      if (!Number.isNaN(explicitPort) && explicitPort > 0) {
        containerPort = explicitPort;
      }
    }

    const aciResult = await runAciViaPython({
      deploymentId,
      appName: sanitizedName,
      image: fullImage,
      socketId,
      logLines,
      io,
      deployment,
      environmentVariables: envMap,
      port: containerPort,
      activeItem,
    });

    if (activeItem.cancelled) throw new Error('Deployment cancelled by user');

    const appUrl = aciResult.accessUrl || `http://${aciResult.publicIp}`;
    await emitLog(io, socketId, `[Azure] Container running at: ${appUrl}`, deployment, 'aci', 'success');

    if (deployment) {
      deployment.infrastructure = deployment.infrastructure || {};
      deployment.infrastructure.aci = deployment.infrastructure.aci || {};
      deployment.infrastructure.aci.containerGroupName = aciResult.containerGroup;
      deployment.infrastructure.aci.containerName = aciResult.containerName;
      deployment.infrastructure.aci.fqdn = aciResult.fqdn;
      deployment.infrastructure.aci.ipAddress = aciResult.publicIp;
      deployment.infrastructure.aci.status = 'running';
      deployment.infrastructure.liveUrl = appUrl;
      deployment.publicUrl = appUrl;
      deployment.domainUrl = appUrl;
      deployment.healthStatus = 'healthy';
      deployment.status = 'success';
      deployment.phase = 'complete';
      deployment.completedAt = new Date();
      deployment.markModified('infrastructure');
    }

    const summary = {
      deploymentId, appName: sanitizedName, repoUrl,
      imageTag: fullImage, containerName: aciResult.containerGroup,
      appUrl, containerIp: aciResult.publicIp, containerFqdn: aciResult.fqdn,
      finishedAt: new Date().toISOString(), status: 'success',
      resourceGroup: cfg.resourceGroup, location: cfg.location,
    };

    await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2) + '\n', 'utf8');
    await fs.writeFile(logsPath, JSON.stringify({ deploymentId, logs: logLines }, null, 2) + '\n', 'utf8');

    await emitLog(io, socketId, '[Azure] Uploading artifacts to Azure Blob...', deployment, 'system');

    await uploadArtifacts({ deploymentId, summaryPath, logsPath, activeItem });

    await emitLog(io, socketId, `[Azure] Deployment complete! App URL: ${appUrl}`, deployment, 'system', 'success');
    if (deployment) {
      await deployment.save();
    }

    if (io && socketId) {
      io.to(socketId).emit('deploy:done', { 
        deploymentId: deployment?._id?.toString() || deploymentId, 
        url: appUrl 
      });
    }
  } catch (error) {
    if (activeItem?.cancelled || (error?.message && error.message.includes('cancelled'))) {
      await emitLog(io, socketId, '[Azure] Deployment cancelled by user.', deployment, 'system', 'warning');
      if (deployment) {
        deployment.status = 'cancelled';
        deployment.phase = 'complete';
        deployment.completedAt = new Date();
        await deployment.save().catch(err => console.error('[Azure] Failed to save cancelled state:', err));
      }
      if (io && socketId) {
        io.to(socketId).emit('deploy:cancelled', { 
          deploymentId: deployment?._id?.toString() || deploymentId,
        });
      }
      return;
    }

    const msg = error?.message || String(error);
    await emitLog(io, socketId, `[Azure] Deployment failed: ${msg}`, deployment, 'system', 'error');
    if (deployment) {
      deployment.status = 'failed';
      deployment.phase = 'complete';
      deployment.completedAt = new Date();
      deployment.failureReason = msg;
      await deployment.save().catch(err => console.error('[Azure] Failed to save error state:', err));
    }
    if (io && socketId) {
      io.to(socketId).emit('deploy:error', { 
        deploymentId: deployment?._id?.toString() || deploymentId, 
        message: msg 
      });
    }
  } finally {
    await safeRemove(artifactsDir).catch(() => {});
    activeDeployments.delete(deploymentId);
    if (deployment?._id) {
      activeDeployments.delete(deployment._id.toString());
    }
  }
}

/**
 * Manage Azure ACI Container Group lifecycle via orchestrator.core.aci_lifecycle
 */
async function manageAciLifecycle({ action, groupName }) {
  const cfg = azureConfig();
  const subscriptionId = process.env.AZURE_SUBSCRIPTION_ID;
  if (!subscriptionId) throw new Error('AZURE_SUBSCRIPTION_ID is missing from environment');
  const rg = cfg.resourceGroup;

  const resultStr = await runCommand(
    cfg.python,
    [
      '-m',
      'orchestrator.core.aci_lifecycle',
      '--action', action,
      '--subscription-id', subscriptionId,
      '--resource-group', rg,
      '--group-name', groupName,
    ],
    { cwd: cfg.orchestratorCwd }
  );

  try {
    const lines = resultStr.trim().split('\n');
    return JSON.parse(lines[lines.length - 1]);
  } catch (_e) {
    return { action, group_name: groupName, status: 'done' };
  }
}

function resolveAzureContainerGroupName(deployment) {
  if (deployment?.infrastructure?.aci?.containerGroupName) {
    return deployment.infrastructure.aci.containerGroupName;
  }
  if (deployment?.metadata?.containerName) {
    return deployment.metadata.containerName;
  }
  const url = deployment?.publicUrl || deployment?.domainUrl || deployment?.infrastructure?.liveUrl || '';
  const match = url.match(/https?:\/\/(cg-[a-zA-Z0-9-]+)\./);
  if (match) {
    return match[1];
  }
  return null;
}

function findDeploymentByIdOrKey(id) {
  if (!id) return Promise.resolve(null);
  const strId = String(id);
  const isObjectId = mongoose.Types.ObjectId.isValid(strId) && strId.length === 24;
  return Deployment.findOne({
    $or: [
      isObjectId ? { _id: strId } : null,
      { deploymentId: strId },
    ].filter(Boolean),
  });
}

async function cancelAzureDeployment(deploymentId, io) {
  const deploymentKey = String(deploymentId);
  const activeItem = activeDeployments.get(deploymentKey);

  const deployment = await findDeploymentByIdOrKey(deploymentId);

  if (activeItem) {
    activeItem.cancelled = true;
    for (const child of activeItem.childProcesses) {
      try { child.kill('SIGKILL'); } catch (_) {}
    }
    if (activeItem.containerGroupName) {
      manageAciLifecycle({ action: 'delete', groupName: activeItem.containerGroupName }).catch(() => {});
    }
    if (activeItem.builderGroup) {
      manageAciLifecycle({ action: 'delete', groupName: activeItem.builderGroup }).catch(() => {});
    }
    if (activeItem.blobName) {
      blobBuildService.deleteBuildBlob(activeItem.blobName).catch(() => {});
    }
    if (activeItem.cloneDir) safeRemove(activeItem.cloneDir).catch(() => {});
    if (activeItem.artifactsDir) safeRemove(activeItem.artifactsDir).catch(() => {});
    activeDeployments.delete(deploymentKey);
  }

  if (deployment) {
    const groupName = resolveAzureContainerGroupName(deployment);
    if (groupName && (!activeItem || !activeItem.containerGroupName)) {
      manageAciLifecycle({ action: 'delete', groupName }).catch(() => {});
    }
    deployment.status = 'cancelled';
    deployment.phase = 'complete';
    deployment.completedAt = new Date();
    await deployment.save();

    await emitLog(io, null, '[Azure] Deployment cancelled by user.', deployment, 'system', 'warning');
    io?.to(`deployment:${deployment._id}`).emit('deployment:cancelled', { deploymentId: deployment._id });
    return { success: true, status: 'cancelled' };
  }

  return { success: true, status: 'cancelled' };
}

async function stopAzureDeployment(deploymentId, io) {
  const deployment = await findDeploymentByIdOrKey(deploymentId);
  if (!deployment) throw new Error('Deployment not found');

  const groupName = resolveAzureContainerGroupName(deployment);
  if (!groupName) throw new Error('No Azure Container Group found for this deployment');

  await emitLog(io, null, `[Azure] Suspending container group ${groupName}...`, deployment, 'aci');
  const result = await manageAciLifecycle({ action: 'stop', groupName });

  deployment.status = 'stopped';
  if (deployment.infrastructure?.aci) {
    deployment.infrastructure.aci.status = 'stopped';
    deployment.markModified('infrastructure');
  }
  await deployment.save();

  await emitLog(io, null, `[Azure] Container group ${groupName} suspended. Compute billing paused.`, deployment, 'aci', 'success');
  io?.to(`deployment:${deployment._id}`).emit('deployment:stopped', { deploymentId: deployment._id, status: 'stopped' });
  return { success: true, status: 'stopped', groupName, result };
}

async function startAzureDeployment(deploymentId, io) {
  const deployment = await findDeploymentByIdOrKey(deploymentId);
  if (!deployment) throw new Error('Deployment not found');

  const groupName = resolveAzureContainerGroupName(deployment);
  if (!groupName) throw new Error('No Azure Container Group found for this deployment');

  await emitLog(io, null, `[Azure] Resuming container group ${groupName}...`, deployment, 'aci');
  const result = await manageAciLifecycle({ action: 'start', groupName });

  deployment.status = 'success';
  if (deployment.infrastructure?.aci) {
    deployment.infrastructure.aci.status = 'running';
    deployment.markModified('infrastructure');
  }
  await deployment.save();

  await emitLog(io, null, `[Azure] Container group ${groupName} resumed and running.`, deployment, 'aci', 'success');
  io?.to(`deployment:${deployment._id}`).emit('deployment:started', { deploymentId: deployment._id, status: 'running' });
  return { success: true, status: 'running', groupName, result };
}

async function deleteAzureDeployment(deploymentId, io) {
  const deployment = await findDeploymentByIdOrKey(deploymentId);
  if (!deployment) throw new Error('Deployment not found');

  const groupName = resolveAzureContainerGroupName(deployment);
  if (groupName) {
    await emitLog(io, null, `[Azure] Terminating container group ${groupName}...`, deployment, 'aci');
    await manageAciLifecycle({ action: 'delete', groupName });
  }

  // If azure-static, purge the files from $web container in Azure Storage
  const isAzureStatic = deployment.deploymentService === 'azure-static' ||
    deployment.infrastructure?.targetType === 'azure-static' ||
    Boolean(deployment.infrastructure?.s3?.bucket === '$web') ||
    Boolean(deployment.publicUrl && deployment.publicUrl.includes('.web.core.windows.net'));

  if (isAzureStatic) {
    const siteSlug = deployment.infrastructure?.s3?.siteSlug ||
      deployment.infrastructure?.s3?.prefix ||
      (deployment.publicUrl ? deployment.publicUrl.match(/core\.windows\.net\/([^/]+)/)?.[1] : null);
    if (siteSlug) {
      try {
        const azureStaticService = require('./azureStaticService');
        await emitLog(io, null, `[Azure] Deleting static files from storage account under /${siteSlug}...`, deployment, 'storage');
        const count = await azureStaticService.deleteDirectory(siteSlug);
        await emitLog(io, null, `[Azure] Purged ${count} files from static hosting storage.`, deployment, 'storage', 'success');
      } catch (err) {
        console.warn(`[Azure] Could not delete $web prefix ${siteSlug}:`, err.message);
      }
    }
  }

  deployment.status = 'closed';
  if (deployment.infrastructure?.aci) {
    deployment.infrastructure.aci.status = 'deleted';
    deployment.markModified('infrastructure');
  }
  deployment.publicUrl = null;
  deployment.domainUrl = null;
  await deployment.save();

  await emitLog(io, null, `[Azure] Deployment terminated and resources deleted.`, deployment, 'aci', 'success');
  io?.to(`deployment:${deployment._id}`).emit('deployment:terminated', { deploymentId: deployment._id, status: 'closed' });
  return { success: true, status: 'closed', groupName };
}

module.exports = {
  runAzureDeployment,
  cancelAzureDeployment,
  stopAzureDeployment,
  startAzureDeployment,
  deleteAzureDeployment,
  manageAciLifecycle,
};
