const express = require('express');
const router = express.Router();
const deploymentController = require('../controllers/deploymentController');

// 1. Clones the repo
router.post('/init', deploymentController.initDeploy);

// 2. Application-type PaaS layer
router.get('/application-types', deploymentController.listApplicationTypes);
router.post('/scan', deploymentController.scanApplication);
router.post('/application', deploymentController.deployApplication);

// 3. Framework detection (static build wizard)
router.post('/detect', deploymentController.detectFramework);

// 3. Saves the .env and Dockerfile
router.post('/save-files', deploymentController.saveDeploymentFiles);

// 4. Starts the Docker deployment engine
router.post('/start', deploymentController.startBuild);
router.post('/start-build', deploymentController.startBuild);

// 5. Starts static build and S3 upload (streams logs via socket)
router.post('/start-static-build', deploymentController.startStaticBuild);

// 4. AWS EC2 Deployment
router.post('/aws-ec2', deploymentController.startAWSEC2Deployment);

// 5. Deployment lifecycle APIs
router.get('/:deploymentId/status', deploymentController.getDeploymentStatus);
router.get('/:deploymentId/logs', deploymentController.getDeploymentLogs);
router.get('/:deploymentId/app-logs', deploymentController.getAppRuntimeLogs);
router.get('/:deploymentId/service-logs', deploymentController.getDeploymentServiceLogs);
router.get('/:deploymentId/env', deploymentController.getDeploymentEnvVariables);
router.post('/:deploymentId/env', deploymentController.updateDeploymentEnvVariables);
router.delete('/:deploymentId/env/:key', deploymentController.deleteDeploymentEnvVariable);
router.post('/:deploymentId/cancel', deploymentController.cancelDeployment);
router.post('/:deploymentId/stop', deploymentController.stopDeployment);
router.post('/:deploymentId/start', deploymentController.startDeployment);
router.post('/:deploymentId/restart', deploymentController.restartDeployment);
router.delete('/:deploymentId', deploymentController.terminateDeployment);

module.exports = router;