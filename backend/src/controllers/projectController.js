const jwt = require('jsonwebtoken');
const path = require('path');
const { spawn } = require('child_process');
const Project = require('../models/Project');
const Deployment = require('../models/Deployment');

// Helper to execute Python ACI update
function triggerAciUpdate({ subscriptionId, resourceGroup, groupName, envMap, port }) {
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

    let output = '';
    child.stdout.on('data', (d) => { output += d.toString(); });
    child.stderr.on('data', (d) => { output += d.toString(); });
    child.on('close', (code) => {
      if (code === 0) resolve(output);
      else reject(new Error(output || `Failed with exit code ${code}`));
    });
  });
}

// Update project (used to update environment variables)
const updateProject = async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = String(decoded.id);
    const projectId = req.params.id;

    const project = await Project.findById(projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (String(project.userId) !== String(userId)) return res.status(403).json({ error: 'Forbidden' });

    // Support updating environmentVariables via body.environmentVariables (object or array)
    const { environmentVariables } = req.body;
    if (environmentVariables) {
      // If object map provided, convert to array
      if (!Array.isArray(environmentVariables) && typeof environmentVariables === 'object') {
        project.environmentVariables = Object.entries(environmentVariables).map(([k, v]) => ({ key: k, value: String(v), encrypted: false }));
      } else if (Array.isArray(environmentVariables)) {
        project.environmentVariables = environmentVariables.map((e) => ({ key: e.key, value: e.value, encrypted: !!e.encrypted }));
      }
    }

    // Allow partial updates of a single key/value
    const { key, value } = req.body;
    if (key && typeof value !== 'undefined') {
      const existingIndex = project.environmentVariables?.findIndex((v) => v.key === key);
      if (existingIndex >= 0) {
        project.environmentVariables[existingIndex].value = String(value);
      } else {
        project.environmentVariables = project.environmentVariables || [];
        project.environmentVariables.push({ key, value: String(value), encrypted: false });
      }
    }

    await project.save();

    // Check if there is an active Azure deployment for this project and sync the environment variables to ACI!
    const activeDeployment = await Deployment.findOne({
      $or: [
        { projectId: project._id },
        { repositoryName: project.repositoryName, repositoryOwner: project.repositoryOwner }
      ],
      'infrastructure.provider': 'azure',
      'infrastructure.targetType': 'azure',
      status: { $in: ['success', 'running', 'building', 'deploying'] }
    }).sort({ createdAt: -1 });

    let aciSynced = false;
    if (activeDeployment && activeDeployment.infrastructure?.aci?.containerGroupName) {
      const groupName = activeDeployment.infrastructure.aci.containerGroupName;
      const subId = process.env.AZURE_SUBSCRIPTION_ID;
      const rg = activeDeployment.infrastructure.aci.resourceGroupName || process.env.AZURE_RESOURCE_GROUP || 'cloudops-reg';

      // Convert project.environmentVariables array to object map
      const envMap = {};
      (project.environmentVariables || []).forEach((e) => {
        if (e && e.key) envMap[e.key] = e.value;
      });

      // Synchronize to deployment record as well
      activeDeployment.environmentVariables = project.environmentVariables;
      await activeDeployment.save();

      // Asynchronously trigger ACI container restart with new environment variables
      triggerAciUpdate({
        subscriptionId: subId,
        resourceGroup: rg,
        groupName,
        envMap,
        port: 80,
      }).then((msg) => {
        console.log(`[ACI Sync] Updated live container ${groupName}:`, msg);
      }).catch((err) => {
        console.error(`[ACI Sync Warning] Failed to update container ${groupName}:`, err.message);
      });
      aciSynced = true;
    }

    return res.status(200).json({ success: true, project, aciSynced });
  } catch (error) {
    console.error('Update project error:', error);
    return res.status(400).json({ success: false, error: error.message });
  }
};

// Get a project by id
const getProject = async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = String(decoded.id);
    const projectId = req.params.id;

    const project = await Project.findById(projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (String(project.userId) !== String(userId)) return res.status(403).json({ error: 'Forbidden' });

    return res.status(200).json({ success: true, project });
  } catch (error) {
    console.error('Get project error:', error);
    return res.status(400).json({ success: false, error: error.message });
  }
};

module.exports = {
  updateProject,
  getProject,
};
