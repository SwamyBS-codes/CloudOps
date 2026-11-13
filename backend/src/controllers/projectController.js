const jwt = require('jsonwebtoken');
const path = require('path');
const { spawn } = require('child_process');
const Project = require('../models/Project');
const Deployment = require('../models/Deployment');
const { pushDeploymentLog } = require('../utils/deploymentPersistence');

// Extract user id from req (either authMiddleware or direct header)
function getUserIdFromReq(req) {
  if (req.user) {
    return String(req.user.id || req.user.githubId || req.user._id || req.user.username || '');
  }
  const token = req.headers.authorization?.split(' ')[1];
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      return String(decoded.id || decoded.githubId || decoded._id || decoded.username || '');
    } catch (_) {}
  }
  return null;
}

// Helper to execute Python ACI update
function triggerAciUpdate({ subscriptionId, resourceGroup, groupName, envMap, port, io, deploymentId }) {
  return new Promise((resolve, reject) => {
    const orchestratorCwd = path.resolve(__dirname, '..', '..', '..', 'azure');
    const python = process.env.PYTHON || 'python3';
    const child = spawn(
      python,
      [
        '-m',
        'orchestrator.core.update_aci_env',
        '--subscription-id',
        subscriptionId,
        '--resource-group',
        resourceGroup,
        '--group-name',
        groupName,
        '--env-json',
        JSON.stringify(envMap),
        '--port',
        String(port || 80),
      ],
      { cwd: orchestratorCwd, env: process.env }
    );

    const emit = (msg, level = 'info') => {
      if (!msg) return;
      if (deploymentId) {
        pushDeploymentLog(deploymentId, {
          source: 'aci',
          level,
          message: msg,
          deploymentService: 'azure',
        }).catch(() => {});
        io?.to(`deployment:${deploymentId}`).emit('deployment-log', {
          deploymentId,
          source: 'aci',
          level,
          message: msg,
          timestamp: new Date().toISOString(),
        });
      }
    };

    emit(`[ACI Env Sync] Updating environment configuration for container group "${groupName}"...`, 'info');

    let output = '';
    child.stdout.on('data', (d) => {
      const text = d.toString();
      output += text;
      text.split('\n').map((l) => l.trim()).filter(Boolean).forEach((l) => emit(l, 'info'));
    });
    child.stderr.on('data', (d) => {
      const text = d.toString();
      output += text;
      text.split('\n').map((l) => l.trim()).filter(Boolean).forEach((l) => emit(`[Error] ${l}`, 'error'));
    });
    child.on('close', (code) => {
      if (code === 0) {
        emit(`[ACI Env Sync] SUCCESS: Container updated and restarted with new environment configuration.`, 'success');
        resolve(output);
      } else {
        emit(`[ACI Env Sync] FAILED: Container update exited with code ${code}.`, 'error');
        reject(new Error(output || `Failed with exit code ${code}`));
      }
    });
  });
}

// Helper to hot-sync updated environment variables to active ACI deployment
async function syncToActiveAciDeployment(project, io = null) {
  const activeDeployment = await Deployment.findOne({
    $or: [
      { projectId: project._id },
      { repositoryName: project.repositoryName, repositoryOwner: project.repositoryOwner },
      { repositoryUrl: project.repositoryUrl },
    ],
    'infrastructure.provider': 'azure',
    status: { $in: ['success', 'running', 'stopped', 'failed'] },
  }).sort({ createdAt: -1 });

  if (!activeDeployment) return { synced: false, deploymentId: null, containerGroupName: null };

  const groupName =
    activeDeployment.infrastructure?.aci?.containerGroupName ||
    activeDeployment.metadata?.containerName ||
    (activeDeployment.publicUrl?.match(/https?:\/\/(cg-[a-zA-Z0-9-]+)\./)?.[1]);

  if (!groupName) return { synced: false, deploymentId: activeDeployment._id.toString(), containerGroupName: null };

  const subId = process.env.AZURE_SUBSCRIPTION_ID;
  if (!subId) return { synced: false, deploymentId: activeDeployment._id.toString(), containerGroupName: groupName };

  const rg =
    activeDeployment.infrastructure?.aci?.resourceGroupName ||
    process.env.AZURE_RESOURCE_GROUP ||
    'cloudops-reg';

  const envMap = {};
  (project.environmentVariables || []).forEach((e) => {
    if (e && e.key) envMap[e.key] = e.value;
  });

  // Keep deployment record in sync
  activeDeployment.environmentVariables = project.environmentVariables;
  await activeDeployment.save();

  // Determine port: check if PORT is specified in envMap, else check deployment metadata
  const port = envMap.PORT || activeDeployment.metadata?.containerPort || 80;

  try {
    const deploymentId = activeDeployment._id.toString();
    const msg = await triggerAciUpdate({
      subscriptionId: subId,
      resourceGroup: rg,
      groupName,
      envMap,
      port,
      io,
      deploymentId,
    });
    console.log(`[ACI Sync] Updated live container ${groupName}:`, msg);
    return { synced: true, deploymentId, containerGroupName: groupName };
  } catch (err) {
    console.error(`[ACI Sync Warning] Failed to update container ${groupName}:`, err.message);
    return { synced: false, deploymentId: activeDeployment._id.toString(), containerGroupName: groupName, error: err.message };
  }
}

// List all projects (with attached latest deployment status)
const listProjects = async (req, res) => {
  try {
    const userId = getUserIdFromReq(req);
    const query = userId ? { $or: [{ userId }, { userId: 'anonymous' }] } : {};
    let projects = await Project.find(query).sort({ updatedAt: -1 });

    if (projects.length === 0) {
      projects = await Project.find({}).sort({ updatedAt: -1 });
    }

    const enrichedProjects = await Promise.all(
      projects.map(async (p) => {
        const obj = p.toObject();
        const latestDep = await Deployment.findOne({
          $or: [
            { projectId: p._id },
            { repositoryName: p.repositoryName, repositoryOwner: p.repositoryOwner },
            { repositoryUrl: p.repositoryUrl },
          ],
        }).sort({ createdAt: -1 });

        obj.latestDeployment = latestDep
          ? {
              _id: latestDep._id,
              status: latestDep.status,
              liveUrl: latestDep.publicUrl || latestDep.infrastructure?.liveUrl,
              provider: latestDep.deploymentService || latestDep.provider,
              containerGroupName: latestDep.infrastructure?.aci?.containerGroupName,
              updatedAt: latestDep.updatedAt,
            }
          : null;

        return obj;
      })
    );

    return res.status(200).json({ success: true, projects: enrichedProjects, count: enrichedProjects.length });
  } catch (error) {
    console.error('List projects error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

// Get a single project by id
const getProject = async (req, res) => {
  try {
    const projectId = req.params.id;
    const project = await Project.findById(projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const obj = project.toObject();
    const latestDep = await Deployment.findOne({
      $or: [
        { projectId: project._id },
        { repositoryName: project.repositoryName, repositoryOwner: project.repositoryOwner },
        { repositoryUrl: project.repositoryUrl },
      ],
    }).sort({ createdAt: -1 });

    obj.latestDeployment = latestDep
      ? {
          _id: latestDep._id,
          status: latestDep.status,
          liveUrl: latestDep.publicUrl || latestDep.infrastructure?.liveUrl,
          provider: latestDep.deploymentService || latestDep.provider,
          containerGroupName: latestDep.infrastructure?.aci?.containerGroupName,
          updatedAt: latestDep.updatedAt,
        }
      : null;

    return res.status(200).json({ success: true, project: obj });
  } catch (error) {
    console.error('Get project error:', error);
    return res.status(400).json({ success: false, error: error.message });
  }
};

// Update project (used to update environment variables or project settings)
const updateProject = async (req, res) => {
  try {
    const projectId = req.params.id;
    const project = await Project.findById(projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    // 1. Full environment variables array or object update
    const { environmentVariables } = req.body;
    if (environmentVariables) {
      if (!Array.isArray(environmentVariables) && typeof environmentVariables === 'object') {
        project.environmentVariables = Object.entries(environmentVariables).map(([k, v]) => ({
          key: k,
          value: String(v),
          encrypted: false,
        }));
      } else if (Array.isArray(environmentVariables)) {
        project.environmentVariables = environmentVariables.map((e) => ({
          key: e.key,
          value: String(e.value ?? ''),
          encrypted: Boolean(e.encrypted),
        }));
      }
    }

    // 2. Single key/value update or add
    const { key, value, encrypted } = req.body;
    if (key && typeof value !== 'undefined') {
      const existingIndex = project.environmentVariables?.findIndex((v) => v.key === key);
      if (existingIndex >= 0) {
        project.environmentVariables[existingIndex].value = String(value);
        if (typeof encrypted !== 'undefined') {
          project.environmentVariables[existingIndex].encrypted = Boolean(encrypted);
        }
      } else {
        project.environmentVariables = project.environmentVariables || [];
        project.environmentVariables.push({
          key,
          value: String(value),
          encrypted: Boolean(encrypted),
        });
      }
    }

    // 3. Delete key if requested
    const { deleteKey } = req.body;
    if (deleteKey) {
      project.environmentVariables = (project.environmentVariables || []).filter((v) => v.key !== deleteKey);
    }

    project.updatedAt = new Date();
    await project.save();

    // Hot-sync to active deployment (e.g. ACI)
    const io = req.app.get('io');
    const syncResult = await syncToActiveAciDeployment(project, io);

    return res.status(200).json({
      success: true,
      project,
      aciSynced: syncResult.synced,
      deploymentId: syncResult.deploymentId,
      containerGroupName: syncResult.containerGroupName,
    });
  } catch (error) {
    console.error('Update project error:', error);
    return res.status(400).json({ success: false, error: error.message });
  }
};

// Dedicated route: Add or update an environment variable
const addOrUpdateEnvVariable = async (req, res) => {
  try {
    const projectId = req.params.id;
    const { key, value, encrypted } = req.body;
    if (!key || typeof value === 'undefined') {
      return res.status(400).json({ error: 'key and value are required' });
    }

    const project = await Project.findById(projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    project.environmentVariables = project.environmentVariables || [];
    const idx = project.environmentVariables.findIndex((v) => v.key === key);
    if (idx >= 0) {
      project.environmentVariables[idx].value = String(value);
      if (typeof encrypted !== 'undefined') {
        project.environmentVariables[idx].encrypted = Boolean(encrypted);
      }
    } else {
      project.environmentVariables.push({
        key,
        value: String(value),
        encrypted: Boolean(encrypted),
      });
    }

    project.updatedAt = new Date();
    await project.save();

    const io = req.app.get('io');
    const syncResult = await syncToActiveAciDeployment(project, io);
    return res.status(200).json({
      success: true,
      project,
      aciSynced: syncResult.synced,
      deploymentId: syncResult.deploymentId,
      containerGroupName: syncResult.containerGroupName,
    });
  } catch (error) {
    console.error('Add/update env variable error:', error);
    return res.status(400).json({ success: false, error: error.message });
  }
};

// Dedicated route: Delete an environment variable by key
const deleteEnvVariable = async (req, res) => {
  try {
    const projectId = req.params.id;
    const key = req.params.key;
    if (!key) return res.status(400).json({ error: 'key is required' });

    const project = await Project.findById(projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    project.environmentVariables = (project.environmentVariables || []).filter((v) => v.key !== key);
    project.updatedAt = new Date();
    await project.save();

    const io = req.app.get('io');
    const syncResult = await syncToActiveAciDeployment(project, io);
    return res.status(200).json({
      success: true,
      project,
      aciSynced: syncResult.synced,
      deploymentId: syncResult.deploymentId,
      containerGroupName: syncResult.containerGroupName,
    });
  } catch (error) {
    console.error('Delete env variable error:', error);
    return res.status(400).json({ success: false, error: error.message });
  }
};

module.exports = {
  listProjects,
  getProject,
  updateProject,
  addOrUpdateEnvVariable,
  deleteEnvVariable,
  syncToActiveAciDeployment,
  triggerAciUpdate,
};
