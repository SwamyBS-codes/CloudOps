const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const {
    healthCheck,
    listDeployments,
    createDeployment,
    getDeploymentById,
    getDeploymentLogs,
    getDeploymentStatus,
    cancelDeployment,
    stopDeployment,
    startDeployment,
    deleteDeployment,
    getAnalyticsDashboard,
    getAnalyticsDeployments,
    getAnalyticsCosts,
    getAnalyticsPerformance,
    getBillingUsage,
    getBillingPlans,
    updateBillingPlan,
    predictCost,
} = require('../controllers/apiController');

const router = express.Router();

router.get('/health', healthCheck);

router.get('/deployments', listDeployments);
router.post('/deployments/create', createDeployment);
router.get('/deployments/:id', getDeploymentById);
router.get('/deployments/:id/logs', getDeploymentLogs);
router.get('/deployments/:id/status', getDeploymentStatus);
router.post('/deployments/:id/cancel', cancelDeployment);
router.post('/deployments/:id/stop', stopDeployment);
router.post('/deployments/:id/start', startDeployment);
router.delete('/deployments/:id', deleteDeployment);

router.get('/analytics/dashboard', authMiddleware, getAnalyticsDashboard);
router.get('/analytics/deployments', authMiddleware, getAnalyticsDeployments);
router.get('/analytics/costs', authMiddleware, getAnalyticsCosts);
router.get('/analytics/performance', authMiddleware, getAnalyticsPerformance);

router.get('/billing/usage', getBillingUsage);
router.get('/billing/plans', getBillingPlans);
router.post('/billing/update-plan', updateBillingPlan);

router.post('/predict-cost', predictCost);

module.exports = router;