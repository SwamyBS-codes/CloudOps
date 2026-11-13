const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const Project = require('../models/Project');
const Deployment = require('../models/Deployment');
const gitService = require('../services/gitService');
const deploymentEngine = require('../services/deploymentEngineService');
const frameworkDetector = require('../services/frameworkDetector');
const staticBuildService = require('../services/staticBuildService');
const deploymentManager = require('../services/deployment/DeploymentManager');
const {
    stopAzureDeployment,
    startAzureDeployment,
    cancelAzureDeployment,
    deleteAzureDeployment,
} = require('../services/azureDeployService');
const fs = require('fs');
const path = require('path');

// Helper function to read the directory structure
function getDirectoryTree(dirPath, depth = 0) {
    if (depth > 2) return []; // Limit depth so we don't crash reading huge node_modules
    const stats = fs.statSync(dirPath);
    if (!stats.isDirectory()) return [];
    
    const result = [];
    const files = fs.readdirSync(dirPath);
    
    for (const file of files) {
        if (file === '.git' || file === 'node_modules') continue;
        const fullPath = path.join(dirPath, file);
        const isDir = fs.statSync(fullPath).isDirectory();
        result.push({
            name: file,
            type: isDir ? 'directory' : 'file',
            children: isDir ? getDirectoryTree(fullPath, depth + 1) : []
        });
    }
    // Sort directories first, then files
    return result.sort((a, b) => (a.type === 'directory' ? -1 : 1));
}

async function resolveDeploymentContext(req) {
    const token = req.headers.authorization?.split(' ')[1];
    const body = req.body || {};

    let decoded = null;
    if (token) {
        decoded = jwt.verify(token, process.env.JWT_SECRET);
    }

    const userId = decoded?.id != null ? String(decoded.id) : (body.userId != null ? String(body.userId) : null);

    if (body.projectId) {
        const project = await Project.findById(body.projectId);
        if (!project) {
            throw new Error('Project not found');
        }

        return {
            project,
            userId: String(project.userId || userId || ''),
            repositoryUrl: project.repositoryUrl,
            repositoryName: project.repositoryName,
        };
    }

    if (body.repositoryName && body.repositoryOwner) {
        const query = {
            repositoryName: body.repositoryName,
            repositoryOwner: body.repositoryOwner,
        };

        if (userId) {
            query.userId = userId;
        }

        const project = await Project.findOne(query);
        if (project) {
            return {
                project,
                userId: String(project.userId || userId || ''),
                repositoryUrl: project.repositoryUrl,
                repositoryName: project.repositoryName,
            };
        }
    }

    return {
        project: null,
        userId,
        repositoryUrl: body.repositoryUrl,
        repositoryName: body.repositoryName,
    };
}

const initDeploy = async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const { repositoryName, repositoryOwner } = req.body;
        const userId = String(decoded.id);

        const project = await Project.findOne({ repositoryName, repositoryOwner, userId });
        if (!project) return res.status(404).json({ error: 'Project must be connected before deploying.' });

        const clonePath = await gitService.cloneRepository(project.repositoryUrl, {
            githubToken: decoded.githubToken,
        });

        const hasDockerfile = await gitService.checkFileExists(clonePath, 'Dockerfile');
        const fileTree = getDirectoryTree(clonePath);
        const suggestedRoots = await frameworkDetector.suggestRootDirectories(clonePath);
        const scanResult = await deploymentManager.scanRepository(clonePath);

        res.status(200).json({
            success: true,
            projectId: project._id,
            repositoryUrl: project.repositoryUrl,
            repositoryName: project.repositoryName,
            repositoryOwner: project.repositoryOwner,
            clonePath,
            hasDockerfile,
            fileTree,
            suggestedRoots,
            defaultBranch: project.defaultBranch || 'main',
            applicationScan: scanResult,
            message: 'Repository cloned successfully.'
        });

    } catch (error) {
        console.error('Init Deploy Error:', error);
        res.status(500).json({ error: 'Failed to initialize deployment.' });
    }
};

const scanApplication = async (req, res) => {
    try {
        const { clonePath } = req.body;
        if (!clonePath) return res.status(400).json({ error: 'clonePath is required.' });

        const scanResult = await deploymentManager.scanRepository(clonePath);
        res.status(200).json({ success: true, ...scanResult });
    } catch (error) {
        console.error('Scan Application Error:', error);
        res.status(500).json({ error: error.message || 'Failed to scan repository.' });
    }
};

const listApplicationTypes = async (req, res) => {
    res.status(200).json({
        success: true,
        applicationTypes: deploymentManager.listApplicationTypes(),
    });
};

const deployApplication = async (req, res) => {
    const io = req.app.get('io');

    try {
        const token = req.headers.authorization?.split(' ')[1];
        let userId = req.body.userId || 'anonymous';
        if (token) {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            userId = String(decoded.id || decoded.githubId || userId);
        }

        const context = await resolveDeploymentContext(req);
        const {
            applicationType,
            clonePath,
            rootDirectory,
            buildCommand,
            outputDirectory,
            environmentVariables = {},
            infrastructureOverride,
            socketId,
            instanceType,
        } = req.body;

        if (!applicationType) {
            return res.status(400).json({ success: false, error: 'applicationType is required' });
        }

        const repositoryUrl = context.repositoryUrl || context.project?.repositoryUrl || req.body.repositoryUrl;
        const repositoryName = context.repositoryName || context.project?.repositoryName || req.body.repositoryName;

        if (!repositoryUrl || !repositoryName) {
            return res.status(400).json({
                success: false,
                error: 'repositoryUrl and repositoryName are required',
            });
        }

        const deployInput = {
            userId,
            projectId: context.project?._id || req.body.projectId,
            repositoryUrl,
            repositoryName,
            repositoryOwner: req.body.repositoryOwner || context.project?.repositoryOwner,
            applicationType,
            applicationName: req.body.applicationName || repositoryName,
            clonePath,
            rootDirectory: rootDirectory || req.body.primaryRoot || './',
            buildCommand,
            outputDirectory,
            environmentVariables,
            infrastructureOverride,
            socketId: socketId || null,
            instanceType,
            branch: req.body.branch || 'main',
        };

        const result = await deploymentManager.deploy(deployInput, io);

        return res.status(202).json({
            success: true,
            message: 'Deployment started',
            applicationType,
            recommendation: deploymentManager.getRecommendation(applicationType),
            ...result,
        });
    } catch (error) {
        console.error('Deploy Application Error:', error);
        return res.status(400).json({ success: false, error: error.message || 'Failed to start deployment' });
    }
};

const detectFramework = async (req, res) => {
    try {
        const { clonePath, rootDirectory = './' } = req.body;

        if (!clonePath) return res.status(400).json({ error: 'Clone path is required.' });

        const normalizedRoot = rootDirectory === '/' || rootDirectory === '' ? './' : rootDirectory;
        const detection = await frameworkDetector.detectFramework(clonePath, {
            rootDirectory: normalizedRoot,
            mode: 'static',
        });

        res.status(200).json({
            success: true,
            ...detection,
        });
    } catch (error) {
        console.error('Detect Framework Error:', error);
        res.status(500).json({ error: error.message || 'Failed to detect framework.' });
    }
};

const saveDeploymentFiles = async (req, res) => {
    try {
        const { clonePath, envContent, envPath, rootDirectory, deployType } = req.body;

        if (deployType === 'static') {
            if (!clonePath) return res.status(400).json({ error: 'Clone path is required.' });

            const targetPath = rootDirectory && rootDirectory !== './'
                ? path.join(clonePath, rootDirectory.replace(/^\.\//, ''))
                : clonePath;

            if (envContent && envContent.trim() !== '') {
                const finalEnvPath = envPath || '.env';
                await gitService.writeFile(targetPath, finalEnvPath, envContent);
            }

            return res.status(200).json({ success: true, message: 'Configuration saved.' });
        }

        return res.status(200).json({
            success: true,
            message: 'Please commit your Dockerfile to your Git repository. Deployment will use the Dockerfile from your repo.',
            note: 'User-provided files during preview are no longer supported. Ensure your repo has a Dockerfile at the root.',
        });
    } catch (error) {
        console.error('Save Files Error:', error);
        res.status(500).json({ error: 'Failed to save configuration files.' });
    }
};

const startStaticBuild = async (req, res) => {
    const {
        repositoryName,
        clonePath,
        rootDirectory = './',
        buildCommand,
        outputDirectory,
        environmentVariables = {},
    } = req.body;

    const io = req.app.get('io');

    if (!clonePath || !repositoryName) {
        return res.status(400).json({ error: 'clonePath and repositoryName are required.' });
    }

    res.status(200).json({ message: 'Static build started' });

    const roomName = repositoryName;
    const sendLog = (text, type = 'info') => {
        io.to(roomName).emit('build-log', { text, type, timestamp: new Date().toISOString() });
    };

    const projectPath = rootDirectory && rootDirectory !== './'
        ? path.join(clonePath, rootDirectory.replace(/^\.\//, ''))
        : clonePath;

    try {
        sendLog('Starting static frontend deployment...', 'system');
        sendLog(`Project directory: ${rootDirectory || './'}`, 'info');
        sendLog('Building and publishing dist files to S3.', 'system');

        const backendNode = await frameworkDetector.isBackendNodeProject(projectPath);
        if (backendNode.isBackend) {
            throw new Error(
                'This repository is a Node.js backend API. Use Backend API deployment instead of S3 static hosting.'
            );
        }

        const siteSlug = staticBuildService.generateSiteSlug(repositoryName);

        const detection = await frameworkDetector.detectFramework(clonePath, {
            rootDirectory,
            mode: 'static',
        });

        if (detection.deployType === 'container') {
            throw new Error(`${detection.displayName} cannot be deployed as a static S3 website.`);
        }

        const finalBuildCommand = buildCommand || detection.buildCommand;
        const finalOutputDir = outputDirectory || detection.outputDirectory;

        if (!finalBuildCommand || finalBuildCommand.includes('No build needed')) {
            sendLog('Skipping build step and publishing existing static output.', 'system');
        } else {
            await staticBuildService.buildProject({
                projectPath,
                buildCommand: finalBuildCommand,
                environmentVariables,
                siteSlug,
                onLog: sendLog,
            });
        }

        sendLog('Publishing static assets to S3...', 'system');
        const publicUrl = await staticBuildService.deployStaticToS3({
            projectPath,
            outputDirectory: finalOutputDir,
            siteSlug,
            onLog: sendLog,
        });

        const publicIp = await staticBuildService.resolvePublicIp(publicUrl);

        sendLog('Deployment complete!', 'success');
        sendLog(`Live URL: ${publicUrl}`, 'success');
        sendLog(`Public IP: ${publicIp || 'Unavailable'}`, 'success');

        io.to(roomName).emit('build-complete', {
            status: 'success',
            publicUrl,
            publicIp,
            siteSlug,
            deployType: 'static',
        });
    } catch (error) {
        console.error('Static Build Error:', error);
        sendLog(`Deployment failed: ${error.message}`, 'error');
        io.to(roomName).emit('build-complete', { status: 'failed', error: error.message });
    }
};

const startBuild = async (req, res) => {
    const io = req.app.get('io');

    try {
        const context = await resolveDeploymentContext(req);
        
        // Ensure we have repositoryUrl - try multiple sources
        let repositoryUrl = context.repositoryUrl || context.project?.repositoryUrl || req.body.repositoryUrl;
        
        // If we have repositoryName and repositoryOwner but no URL, construct it
        if (!repositoryUrl && req.body.repositoryName && req.body.repositoryOwner) {
            repositoryUrl = `https://github.com/${req.body.repositoryOwner}/${req.body.repositoryName}.git`;
        }
        
        // Final validation - repositoryUrl is absolutely required
        if (!repositoryUrl) {
            return res.status(400).json({
                success: false,
                error: 'repositoryUrl, projectId, or (repositoryName + repositoryOwner) is required to start deployment',
            });
        }

        const result = await deploymentEngine.startDeployment({
            projectId: context.project?._id || req.body.projectId,
            userId: context.userId,
            repositoryUrl,
            repositoryName: context.repositoryName || context.project?.repositoryName || req.body.repositoryName,
            branch: req.body.branch || req.body.ref?.replace('refs/heads/', '') || 'main',
            environmentVariables: req.body.environmentVariables || context.project?.environmentVariables || {},
            target: req.body.target || req.body.ec2Target || req.body.remoteTarget || {},
            triggeredBy: req.body.triggeredBy || 'manual',
            webhookId: req.body.webhookId || context.project?.githubWebhookId || null,
        }, io);

        return res.status(202).json({
            success: true,
            message: 'Deployment queued successfully.',
            ...result,
        });
    } catch (error) {
        console.error('Start deployment error:', error);
        return res.status(400).json({
            success: false,
            error: error.message || 'Failed to start deployment',
        });
    }
};

const findDeploymentByIdOrKey = (id) => {
    if (!id) return Promise.resolve(null);
    const strId = String(id);
    const isObjectId = mongoose.Types.ObjectId.isValid(strId) && strId.length === 24;
    return Deployment.findOne({
        $or: [
            isObjectId ? { _id: strId } : null,
            { deploymentId: strId },
        ].filter(Boolean),
    });
};

const resolveAzureContainerGroupName = (deployment) => {
    if (!deployment) return null;
    return (
        deployment.infrastructure?.aci?.containerGroupName ||
        deployment.metadata?.containerName ||
        deployment.publicUrl?.match(/https?:\/\/(cg-[a-zA-Z0-9-]+)\./)?.[1] ||
        null
    );
};

const isAzureDeploymentRecord = (deployment) => {
    if (!deployment) return false;
    return (
        deployment.deploymentService === 'azure' ||
        deployment.provider === 'azure' ||
        Boolean(deployment.infrastructure?.aci) ||
        Boolean(deployment.infrastructure?.acr) ||
        Boolean(deployment.publicUrl && deployment.publicUrl.includes('azurecontainer.io'))
    );
};

const isAwsDeploymentRecord = (deployment) => {
    if (!deployment) return false;
    return (
        deployment.deploymentService === 'aws' ||
        deployment.provider === 'aws' ||
        deployment.infrastructure?.provider === 'aws' ||
        deployment.infrastructure?.targetType === 'aws' ||
        Boolean(deployment.infrastructure?.ec2?.instanceId) ||
        Boolean(deployment.metadata?.ec2?.instanceId) ||
        Boolean(deployment.metadata?.instanceId)
    );
};

const resolveAwsInstanceId = (deployment) => {
    if (!deployment) return null;
    return (
        deployment.infrastructure?.ec2?.instanceId ||
        deployment.metadata?.ec2?.instanceId ||
        deployment.metadata?.instanceId ||
        null
    );
};

const isStaticDeploymentRecord = (deployment) => {
    if (!deployment) return false;
    return (
        deployment.deploymentType === 'static-hosting' ||
        deployment.applicationType === 'frontend-website' ||
        Boolean(deployment.infrastructure?.s3?.bucketName) ||
        Boolean(deployment.publicUrl && deployment.publicUrl.includes('web.core.windows.net'))
    );
};

const getDeploymentStatus = async (req, res) => {
    try {
        const deploymentId = req.params.deploymentId || req.params.id;
        const deployment = await findDeploymentByIdOrKey(deploymentId);
        if (!deployment) {
            return res.status(404).json({ success: false, error: 'Deployment not found' });
        }

        // Live cloud probe if deployment is in completed/running state
        let liveCloudStatus = null;
        if (isAzureDeploymentRecord(deployment)) {
            const groupName = resolveAzureContainerGroupName(deployment);
            if (groupName && process.env.AZURE_SUBSCRIPTION_ID) {
                try {
                    const { getAzureAciStatus } = require('../services/azureDeployService');
                    const aciStatus = await getAzureAciStatus(groupName);
                    liveCloudStatus = aciStatus;

                    if (aciStatus && aciStatus.state) {
                        const previousStatus = deployment.status;
                        if (aciStatus.state === 'Running') {
                            deployment.status = 'success';
                            deployment.healthStatus = 'healthy';
                        } else if (aciStatus.state === 'Stopped' || aciStatus.state === 'Terminated') {
                            deployment.status = 'stopped';
                        } else if (aciStatus.detail_status?.includes('CrashLoopBackOff') || aciStatus.detail_status === 'Error') {
                            deployment.status = 'failed';
                            deployment.healthStatus = 'unhealthy';
                            deployment.error = {
                                message: aciStatus.detail_status || 'Container exited with error',
                                state: aciStatus.state,
                            };
                        }

                        if (deployment.infrastructure?.aci) {
                            deployment.infrastructure.aci.status = aciStatus.state;
                            deployment.infrastructure.aci.detailStatus = aciStatus.detail_status;
                            deployment.markModified('infrastructure');
                        }
                        await deployment.save();
                    }
                } catch (aciErr) {
                    console.warn(`[ACI Live Status Probe Warning] ${groupName}:`, aciErr.message);
                }
            }
        } else if (isAwsDeploymentRecord(deployment)) {
            const instanceId = resolveAwsInstanceId(deployment);
            if (instanceId && process.env.AWS_ACCESS_KEY_ID) {
                try {
                    const ec2Service = require('../services/aws/ec2Service');
                    const ec2Status = await ec2Service.getInstanceStatus(instanceId);
                    liveCloudStatus = ec2Status;
                    if (ec2Status && ec2Status.instanceState) {
                        if (ec2Status.instanceState === 'running') {
                            deployment.status = 'running';
                            deployment.healthStatus = 'healthy';
                        } else if (ec2Status.instanceState === 'stopped') {
                            deployment.status = 'stopped';
                        } else if (['shutting-down', 'terminated'].includes(ec2Status.instanceState)) {
                            deployment.status = 'closed';
                        }
                        await deployment.save();
                    }
                } catch (ec2Err) {
                    console.warn(`[EC2 Live Status Probe Warning] ${instanceId}:`, ec2Err.message);
                }
            }
        }

        const details = await deploymentEngine.getDeploymentDetails(deploymentId);
        return res.status(200).json({ success: true, deployment: details, liveCloudStatus });
    } catch (error) {
        return res.status(404).json({ success: false, error: error.message });
    }
};

const getAppRuntimeLogs = async (req, res) => {
    try {
        const deploymentId = req.params.deploymentId || req.params.id;
        const deployment = await findDeploymentByIdOrKey(deploymentId);
        if (!deployment) {
            return res.status(404).json({ success: false, error: 'Deployment not found' });
        }

        const tail = Number(req.query.tail || 300);

        // 1. Azure ACI Live Container Logs
        if (isAzureDeploymentRecord(deployment)) {
            const groupName = resolveAzureContainerGroupName(deployment);
            if (!groupName) {
                return res.status(200).json({
                    success: true,
                    deploymentId,
                    source: 'azure-aci',
                    logs: '',
                    notice: 'No active container group found for this deployment.',
                });
            }

            const { getAzureAciLogs } = require('../services/azureDeployService');
            const aciLogs = await getAzureAciLogs(groupName, tail);

            return res.status(200).json({
                success: true,
                deploymentId,
                source: 'azure-aci',
                containerName: aciLogs.container_name || 'task',
                state: aciLogs.state || null,
                detailStatus: aciLogs.detail_status || null,
                previousState: aciLogs.previous_state || null,
                logs: aciLogs.content || '',
            });
        }

        // 2. AWS EC2 System Console / Container Logs
        if (isAwsDeploymentRecord(deployment)) {
            const instanceId = resolveAwsInstanceId(deployment);
            if (!instanceId) {
                return res.status(200).json({
                    success: true,
                    deploymentId,
                    source: 'aws-ec2',
                    logs: '',
                    notice: 'No active EC2 instance found for this deployment.',
                });
            }

            const ec2Service = require('../services/aws/ec2Service');
            const consoleOutput = await ec2Service.getConsoleOutput(instanceId);

            return res.status(200).json({
                success: true,
                deploymentId,
                source: 'aws-ec2',
                instanceId,
                logs: consoleOutput || '',
            });
        }

        // 3. Local / Remote Docker Container Logs
        const containerName = deployment.metadata?.containerName;
        if (containerName) {
            const dockerService = require('../services/dockerService');
            const rawLogs = await dockerService.getContainerLogs(containerName, null, tail).catch(() => '');
            return res.status(200).json({
                success: true,
                deploymentId,
                source: 'docker',
                containerName,
                logs: rawLogs || '',
            });
        }

        return res.status(200).json({
            success: true,
            deploymentId,
            source: 'none',
            logs: '',
            notice: 'Live app runtime logs are not applicable for static storage hosting.',
        });
    } catch (error) {
        console.error('getAppRuntimeLogs error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
};

const getDeploymentLogs = async (req, res) => {
    try {
        const logs = await deploymentEngine.getDeploymentLogs(req.params.deploymentId, {
            source: req.query.source || null,
            level: req.query.level || null,
            limit: Number(req.query.limit || 100),
            skip: Number(req.query.skip || 0),
        });

        return res.status(200).json({ success: true, logs });
    } catch (error) {
        return res.status(404).json({ success: false, error: error.message });
    }
};

const getDeploymentServiceLogs = async (req, res) => {
    try {
        const Deployment = require('../models/Deployment');
        const { deploymentId } = req.params;
        const { service } = req.query; // 'aws' or 'azure'

        const deployment = await Deployment.findById(deploymentId);
        if (!deployment) {
            return res.status(404).json({ success: false, error: 'Deployment not found' });
        }

        let logs = [];
        if (service === 'aws') {
            logs = deployment.awsLogs || [];
        } else if (service === 'azure') {
            logs = deployment.azureLogs || [];
        } else {
            logs = deployment.logs || [];
        }

        const limit = Number(req.query.limit || 100);
        const skip = Number(req.query.skip || 0);
        const paginatedLogs = logs.slice(skip, skip + limit);

        return res.status(200).json({
            success: true,
            service: service || 'all',
            deploymentService: deployment.deploymentService,
            total: logs.length,
            logs: paginatedLogs,
        });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
};

const stopDeployment = async (req, res) => {
    try {
        const deploymentId = req.params.deploymentId || req.params.id;
        const deployment = await findDeploymentByIdOrKey(deploymentId);

        if (isStaticDeploymentRecord(deployment)) {
            return res.status(200).json({
                success: true,
                message: 'Static site is hosted on cloud storage CDN with zero idle compute cost.',
                status: deployment.status || 'success',
            });
        }

        if (deployment && isAzureDeploymentRecord(deployment)) {
            const result = await stopAzureDeployment(deployment._id, req.app.get('io'));
            return res.status(200).json(result);
        }

        if (deployment && isAwsDeploymentRecord(deployment)) {
            const instanceId = resolveAwsInstanceId(deployment);
            if (instanceId) {
                const ec2Service = require('../services/aws/ec2Service');
                await ec2Service.stopInstance(instanceId);
                deployment.status = 'stopped';
                deployment.phase = 'stopped';
                await deployment.save();

                const io = req.app.get('io');
                io?.to(`deployment:${deployment._id}`).emit('deployment-log', {
                    deploymentId: deployment._id.toString(),
                    source: 'aws',
                    level: 'info',
                    message: `[AWS EC2] Instance ${instanceId} stopped successfully.`,
                    timestamp: new Date().toISOString(),
                });
                return res.status(200).json({ success: true, status: 'stopped', instanceId });
            }
        }

        const result = await deploymentEngine.stopDeployment(deploymentId, req.app.get('io'));
        return res.status(200).json(result);
    } catch (error) {
        return res.status(400).json({ success: false, error: error.message });
    }
};

const startDeployment = async (req, res) => {
    try {
        const deploymentId = req.params.deploymentId || req.params.id;
        const deployment = await findDeploymentByIdOrKey(deploymentId);

        if (isStaticDeploymentRecord(deployment)) {
            return res.status(200).json({
                success: true,
                message: 'Static site is already active and served via CDN.',
                status: deployment.status || 'success',
            });
        }

        if (deployment && isAzureDeploymentRecord(deployment)) {
            const result = await startAzureDeployment(deployment._id, req.app.get('io'));
            return res.status(200).json(result);
        }

        if (deployment && isAwsDeploymentRecord(deployment)) {
            const instanceId = resolveAwsInstanceId(deployment);
            if (instanceId) {
                const ec2Service = require('../services/aws/ec2Service');
                await ec2Service.startInstance(instanceId);
                deployment.status = 'running';
                deployment.phase = 'running';
                await deployment.save();

                const io = req.app.get('io');
                io?.to(`deployment:${deployment._id}`).emit('deployment-log', {
                    deploymentId: deployment._id.toString(),
                    source: 'aws',
                    level: 'info',
                    message: `[AWS EC2] Instance ${instanceId} started successfully.`,
                    timestamp: new Date().toISOString(),
                });
                return res.status(200).json({ success: true, status: 'running', instanceId });
            }
        }

        const result = await deploymentEngine.restartDeployment(deploymentId, req.app.get('io'));
        return res.status(200).json(result);
    } catch (error) {
        return res.status(400).json({ success: false, error: error.message });
    }
};

const restartDeployment = startDeployment;

const cancelDeployment = async (req, res) => {
    try {
        const deploymentId = req.params.deploymentId || req.params.id;
        const deployment = await findDeploymentByIdOrKey(deploymentId);

        if (deployment && isAzureDeploymentRecord(deployment)) {
            const result = await cancelAzureDeployment(deployment._id, req.app.get('io'));
            return res.status(200).json(result);
        }

        try {
            const result = await deploymentEngine.cancelQueuedDeployment(deploymentId, req.app.get('io'));
            return res.status(200).json(result);
        } catch (_) {
            if (deployment) {
                deployment.status = 'cancelled';
                deployment.phase = 'complete';
                deployment.completedAt = new Date();
                await deployment.save();
            }
            return res.status(200).json({ success: true, status: 'cancelled' });
        }
    } catch (error) {
        return res.status(400).json({ success: false, error: error.message });
    }
};

const cancelQueuedDeployment = cancelDeployment;

const terminateDeployment = async (req, res) => {
    try {
        const deploymentId = req.params.deploymentId || req.params.id;
        const deployment = await findDeploymentByIdOrKey(deploymentId);

        if (!deployment) {
            return res.status(404).json({ success: false, error: 'Deployment not found' });
        }

        if (isAzureDeploymentRecord(deployment)) {
            const result = await deleteAzureDeployment(deployment._id, req.app.get('io'));
            return res.status(200).json(result);
        }

        if (isAwsDeploymentRecord(deployment)) {
            const instanceId = resolveAwsInstanceId(deployment);
            if (instanceId) {
                const ec2Service = require('../services/aws/ec2Service');
                await ec2Service.terminateInstance(instanceId).catch((err) => {
                    console.warn(`[AWS EC2 Terminate Warning] ${instanceId}:`, err.message);
                });
            }
            deployment.status = 'closed';
            deployment.phase = 'complete';
            deployment.completedAt = new Date();
            await deployment.save();

            const io = req.app.get('io');
            io?.to(`deployment:${deployment._id}`).emit('deployment-log', {
                deploymentId: deployment._id.toString(),
                source: 'aws',
                level: 'info',
                message: `[AWS EC2] Instance ${instanceId || ''} terminated. Deployment closed.`,
                timestamp: new Date().toISOString(),
            });
            return res.status(200).json({ success: true, status: 'closed', instanceId });
        }

        try {
            await deploymentEngine.stopDeployment(deploymentId, req.app.get('io'));
        } catch (_) {}
        deployment.status = 'closed';
        deployment.phase = 'complete';
        await deployment.save();
        return res.status(200).json({ success: true, status: 'closed' });
    } catch (error) {
        return res.status(400).json({ success: false, error: error.message });
    }
};

const handleWebhook = async (req, res) => {
    try {
        const repository = req.body.repository || {};
        const cloneUrl = repository.clone_url || repository.ssh_url || '';
        const project = await Project.findOne({
            $or: [
                cloneUrl ? { repositoryUrl: cloneUrl } : null,
                repository.name && repository.owner?.login ? {
                    repositoryName: repository.name,
                    repositoryOwner: repository.owner.login,
                } : null,
            ].filter(Boolean),
        });

        if (!project) {
            return res.status(404).json({ success: false, error: 'No matching project found for webhook' });
        }

        const signature = req.headers['x-hub-signature-256'];
        const isValid = deploymentEngine.verifyWebhookSignature(req.rawBody, project.webhookSecret, signature);
        if (!isValid) {
            return res.status(401).json({ success: false, error: 'Webhook signature verification failed' });
        }

        if (req.headers['x-github-event'] !== 'push') {
            return res.status(200).json({ success: true, message: 'Webhook acknowledged' });
        }

        const result = await deploymentEngine.handleWebhook(req.body, req.app.get('io'), {
            deliveryId: req.headers['x-github-delivery'] || null,
        });

        if (result?.skipped) {
            return res.status(200).json({
                success: true,
                message: result.reason || 'Webhook acknowledged and ignored',
                ...result,
            });
        }

        return res.status(202).json({ success: true, message: 'Webhook accepted and redeployment queued', ...result });
    } catch (error) {
        console.error('Webhook handling error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Start AWS EC2 deployment
 * POST /api/deploy/aws-ec2
 * Body: {
 *   repositoryUrl: string,
 *   repositoryName?: string,
 *   branch?: string,
 *   instanceType?: string (default: t3.micro),
 *   keyName?: string,
 *   securityGroupIds?: string[],
 *   environmentVariables?: object
 * }
 */
const startAWSEC2Deployment = async (req, res) => {
  const io = req.app.get('io');

  try {
    const token = req.headers.authorization?.split(' ')[1];
    const {
      repositoryUrl,
      repositoryName,
      repositoryOwner,
      branch = 'main',
      instanceType = 't3.micro',
      keyName,
      securityGroupIds = [],
      environmentVariables = {},
    } = req.body;

    if (!repositoryUrl || !repositoryName) {
      return res.status(400).json({
        success: false,
        error: 'repositoryUrl and repositoryName are required for AWS EC2 deployment',
      });
    }

    // Decode JWT to get userId
    let userId = 'anonymous';
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        userId = decoded.id || decoded.githubId || 'anonymous';
      } catch (err) {
        console.warn('Could not decode token:', err.message);
      }
    }

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`☁️  AWS EC2 DEPLOYMENT REQUEST`);
    console.log(`${'═'.repeat(60)}`);
    console.log(`📦 Repository: ${repositoryUrl}`);
    console.log(`🌿 Branch: ${branch}`);
    console.log(`📍 Instance Type: ${instanceType}`);
    console.log(`🔑 Key Name: ${keyName || 'default'}`);
    console.log(`👤 User ID: ${userId}`);
    console.log(`${'═'.repeat(60)}\n`);

    // Try to find existing project in MongoDB
    let project = null;
    if (repositoryOwner) {
      project = await Project.findOne({
        repositoryName,
        repositoryOwner,
        userId,
      });
    } else {
      // Try to extract owner from URL: https://github.com/owner/repo.git
      const urlMatch = repositoryUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
      if (urlMatch) {
        const [, owner, repo] = urlMatch;
        project = await Project.findOne({
          repositoryName: repo,
          repositoryOwner: owner,
          userId,
        });
      }
    }

    // If no project found, it's okay - we can still deploy
    // But we'll log it
    if (!project) {
      console.log(`⚠️  Project not found in database for ${repositoryName}. Creating temporary deployment without project link.`);
    }

    const result = await deploymentEngine.startDeployment({
      projectId: project?._id || null,  // Can be null for ad-hoc deployments
      userId,
      repositoryUrl,
      repositoryName,
      repositoryOwner: repositoryOwner || 'unknown',
      branch,
      environmentVariables,
      target: {
        type: 'aws',
        awsRegion: process.env.AWS_REGION || 'ap-south-1',
        instanceType,
        keyName: keyName || process.env.AWS_EC2_KEY_NAME,
        securityGroupIds,
      },
      triggeredBy: 'manual',
    }, io);

    console.log(`✅ AWS EC2 deployment initiated: ${result.deploymentId}`);

    return res.status(202).json({
      success: true,
      message: 'AWS EC2 deployment initiated',
      deploymentId: result.deploymentId,
      status: result.status,
    });

  } catch (error) {
    console.error('❌ AWS EC2 deployment error:', error);
    return res.status(400).json({
      success: false,
      error: error.message || 'Failed to start AWS EC2 deployment',
    });
  }
};

// Get deployment environment variables
const getDeploymentEnvVariables = async (req, res) => {
  try {
    const deploymentId = req.params.deploymentId || req.params.id;
    const deployment = await findDeploymentByIdOrKey(deploymentId);
    if (!deployment) return res.status(404).json({ error: 'Deployment not found' });

    return res.status(200).json({
      success: true,
      deploymentId,
      environmentVariables: deployment.environmentVariables || [],
    });
  } catch (error) {
    console.error('Get deployment env variables error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

// Add or update deployment environment variables
const updateDeploymentEnvVariables = async (req, res) => {
  const io = req.app.get('io');
  try {
    const deploymentId = req.params.deploymentId || req.params.id;
    const deployment = await findDeploymentByIdOrKey(deploymentId);
    if (!deployment) return res.status(404).json({ error: 'Deployment not found' });

    let updatedVars = Array.isArray(deployment.environmentVariables) ? [...deployment.environmentVariables] : [];

    // Check if bulk object or array passed
    if (req.body.environmentVariables) {
      if (Array.isArray(req.body.environmentVariables)) {
        updatedVars = req.body.environmentVariables.map((v) => ({
          key: String(v.key).trim().toUpperCase(),
          value: String(v.value ?? ''),
          encrypted: Boolean(v.encrypted),
        }));
      } else if (typeof req.body.environmentVariables === 'object') {
        updatedVars = Object.entries(req.body.environmentVariables).map(([k, v]) => ({
          key: String(k).trim().toUpperCase(),
          value: String(v ?? ''),
          encrypted: false,
        }));
      }
    } else if (req.body.key) {
      // Single key update
      const key = String(req.body.key).trim().toUpperCase();
      const value = String(req.body.value ?? '');
      const encrypted = Boolean(req.body.encrypted);
      const existingIdx = updatedVars.findIndex((v) => v.key === key);
      if (existingIdx >= 0) {
        updatedVars[existingIdx].value = value;
        if (typeof req.body.encrypted !== 'undefined') updatedVars[existingIdx].encrypted = encrypted;
      } else {
        updatedVars.push({ key, value, encrypted });
      }
    } else {
      return res.status(400).json({ error: 'key and value or environmentVariables object required' });
    }

    deployment.environmentVariables = updatedVars;
    deployment.updatedAt = new Date();
    await deployment.save();

    // Also update linked project if any
    const projectQuery = deployment.projectId
      ? { _id: deployment.projectId }
      : {
          $or: [
            { repositoryUrl: deployment.repositoryUrl },
            { repositoryName: deployment.repositoryName },
          ],
        };
    const project = await Project.findOne(projectQuery);
    if (project) {
      project.environmentVariables = updatedVars;
      project.updatedAt = new Date();
      await project.save();
    }

    // Hot-sync to ACI if this is an active or existing Azure deployment
    let aciSynced = false;
    let groupName =
      deployment.infrastructure?.aci?.containerGroupName ||
      deployment.metadata?.containerName ||
      deployment.publicUrl?.match(/https?:\/\/(cg-[a-zA-Z0-9-]+)\./)?.[1];

    if (groupName && process.env.AZURE_SUBSCRIPTION_ID) {
      const subId = process.env.AZURE_SUBSCRIPTION_ID;
      const rg =
        deployment.infrastructure?.aci?.resourceGroupName ||
        process.env.AZURE_RESOURCE_GROUP ||
        'cloudops-reg';

      const envMap = {};
      updatedVars.forEach((e) => {
        if (e && e.key) envMap[e.key] = e.value;
      });
      const port = envMap.PORT || deployment.metadata?.containerPort || 80;

      try {
        const { triggerAciUpdate } = require('./projectController');
        await triggerAciUpdate({
          subscriptionId: subId,
          resourceGroup: rg,
          groupName,
          envMap,
          port,
          io,
          deploymentId: deployment._id.toString(),
        });
        aciSynced = true;
      } catch (syncErr) {
        console.error('[Deployment Env Sync Warning]:', syncErr.message);
      }
    }

    return res.status(200).json({
      success: true,
      deploymentId,
      containerGroupName: groupName || null,
      aciSynced,
      environmentVariables: deployment.environmentVariables,
    });
  } catch (error) {
    console.error('Update deployment env variables error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

// Delete single deployment environment variable
const deleteDeploymentEnvVariable = async (req, res) => {
  const io = req.app.get('io');
  try {
    const deploymentId = req.params.deploymentId || req.params.id;
    const { key } = req.params;
    if (!key) return res.status(400).json({ error: 'key is required' });

    const deployment = await findDeploymentByIdOrKey(deploymentId);
    if (!deployment) return res.status(404).json({ error: 'Deployment not found' });

    const targetKey = String(key).trim().toUpperCase();
    deployment.environmentVariables = (deployment.environmentVariables || []).filter((v) => v.key !== targetKey);
    deployment.updatedAt = new Date();
    await deployment.save();

    // Also update linked project if any
    const projectQuery = deployment.projectId
      ? { _id: deployment.projectId }
      : {
          $or: [
            { repositoryUrl: deployment.repositoryUrl },
            { repositoryName: deployment.repositoryName },
          ],
        };
    const project = await Project.findOne(projectQuery);
    if (project) {
      project.environmentVariables = deployment.environmentVariables;
      project.updatedAt = new Date();
      await project.save();
    }

    // Hot-sync to ACI if this is an active or existing Azure deployment
    let aciSynced = false;
    let groupName =
      deployment.infrastructure?.aci?.containerGroupName ||
      deployment.metadata?.containerName ||
      deployment.publicUrl?.match(/https?:\/\/(cg-[a-zA-Z0-9-]+)\./)?.[1];

    if (groupName && process.env.AZURE_SUBSCRIPTION_ID) {
      const subId = process.env.AZURE_SUBSCRIPTION_ID;
      const rg =
        deployment.infrastructure?.aci?.resourceGroupName ||
        process.env.AZURE_RESOURCE_GROUP ||
        'cloudops-reg';

      const envMap = {};
      (deployment.environmentVariables || []).forEach((e) => {
        if (e && e.key) envMap[e.key] = e.value;
      });
      const port = envMap.PORT || deployment.metadata?.containerPort || 80;

      try {
        const { triggerAciUpdate } = require('./projectController');
        await triggerAciUpdate({
          subscriptionId: subId,
          resourceGroup: rg,
          groupName,
          envMap,
          port,
          io,
          deploymentId: deployment._id.toString(),
        });
        aciSynced = true;
      } catch (syncErr) {
        console.error('[Deployment Env Sync Warning]:', syncErr.message);
      }
    }

    return res.status(200).json({
      success: true,
      deploymentId,
      containerGroupName: groupName || null,
      aciSynced,
      environmentVariables: deployment.environmentVariables,
    });
  } catch (error) {
    console.error('Delete deployment env variable error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = {
    initDeploy,
    scanApplication,
    listApplicationTypes,
    deployApplication,
    detectFramework,
    saveDeploymentFiles,
    startBuild,
    startStaticBuild,
    startAWSEC2Deployment,
    getDeploymentStatus,
    getDeploymentLogs,
    getDeploymentServiceLogs,
    getAppRuntimeLogs,
    getDeploymentEnvVariables,
    updateDeploymentEnvVariables,
    deleteDeploymentEnvVariable,
    stopDeployment,
    startDeployment,
    cancelQueuedDeployment,
    cancelDeployment,
    restartDeployment,
    terminateDeployment,
    handleWebhook,
};
