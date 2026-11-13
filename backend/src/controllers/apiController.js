const deploymentEngine = require('../services/deploymentEngineService');
const deploymentController = require('./deploymentController');
const Deployment = require('../models/Deployment');

const ACTIVE_STATUSES = ['queued', 'cloning', 'detecting', 'building', 'pushing', 'deploying', 'running'];

const COST_PER_HOUR_BY_INSTANCE = {
    't3.micro': 0.0104,
    't3.small': 0.0208,
    't3.medium': 0.0416,
    'fargate-256-512': 0.012,
};

const parseDays = (value, fallback = 30) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return fallback;
    }
    return Math.min(365, Math.floor(parsed));
};

const toObjectId = (value) => {
    if (!value) return null;
    try {
        return value;
    } catch (_error) {
        return null;
    }
};

const buildBaseQuery = (req, options = {}) => {
    const query = {};

    const loggedInUserId = req?.user?.id != null ? String(req.user.id) : null;
    if (loggedInUserId) {
        query.userId = loggedInUserId;
    } else if (req.query.userId) {
        query.userId = String(req.query.userId);
    }

    if (req.query.projectId) {
        query.projectId = toObjectId(req.query.projectId);
    }

    if (options.days) {
        const startDate = new Date(Date.now() - options.days * 24 * 60 * 60 * 1000);
        query.createdAt = { $gte: startDate };
    }

    if (options.statuses && options.statuses.length > 0) {
        query.status = { $in: options.statuses };
    }

    return query;
};

const percentile = (sortedValues, p) => {
    if (!sortedValues.length) return 0;
    const index = Math.min(sortedValues.length - 1, Math.max(0, Math.ceil((p / 100) * sortedValues.length) - 1));
    return sortedValues[index];
};

const healthCheck = (req, res) => {
    res.json({
        status: 'ok',
        message: 'CloudOps backend is healthy',
        timestamp: new Date().toISOString(),
    });
};

const listDeployments = async (req, res) => {
    try {
        const deployments = await deploymentEngine.listDeployments({
            projectId: req.query.projectId,
            userId: req.query.userId,
            status: req.query.status,
        });

        return res.status(200).json({
            success: true,
            data: deployments,
            count: deployments.length,
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            error: error.message || 'Failed to list deployments',
        });
    }
};

const createDeployment = (req, res) => {
    res.status(501).json({
        error: 'Deprecated endpoint. Use POST /api/deploy/start for real deployment creation.',
    });
};

const getDeploymentById = async (req, res) => {
    try {
        const deployment = await deploymentEngine.getDeploymentDetails(req.params.id);

        return res.status(200).json({
            success: true,
            deployment,
        });
    } catch (error) {
        return res.status(404).json({
            success: false,
            error: error.message || 'Deployment not found',
        });
    }
};

const getDeploymentLogs = async (req, res) => {
    try {
        const logs = await deploymentEngine.getDeploymentLogs(req.params.id, {
            source: req.query.source || null,
            level: req.query.level || null,
            limit: Number(req.query.limit || 100),
            skip: Number(req.query.skip || 0),
        });

        return res.status(200).json({
            success: true,
            logs,
        });
    } catch (error) {
        return res.status(404).json({
            success: false,
            error: error.message || 'Deployment logs not found',
        });
    }
};

const getDeploymentStatus = async (req, res) => {
    try {
        const deployment = await deploymentEngine.getDeploymentDetails(req.params.id);

        return res.status(200).json({
            success: true,
            deployment,
        });
    } catch (error) {
        return res.status(404).json({
            success: false,
            error: error.message || 'Deployment status not found',
        });
    }
};

const cancelDeployment = (req, res) => deploymentController.cancelDeployment(req, res);
const stopDeployment = (req, res) => deploymentController.stopDeployment(req, res);
const startDeployment = (req, res) => deploymentController.startDeployment(req, res);
const deleteDeployment = (req, res) => deploymentController.terminateDeployment(req, res);

const getAnalyticsDashboard = async (req, res) => {
    try {
        const days = parseDays(req.query.days, 30);
        const baseQuery = buildBaseQuery(req, { days });

        // For now, show all deployments if user has no deployments (temporary fix)
        const userDeploymentCount = await Deployment.countDocuments(buildBaseQuery(req, {}));
        const useUserFilter = userDeploymentCount > 0;

        const queryToUse = useUserFilter ? baseQuery : {};
        if (!useUserFilter && req.query.projectId) {
            queryToUse.projectId = toObjectId(req.query.projectId);
        }
        if (!useUserFilter && days) {
            const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
            queryToUse.createdAt = { $gte: startDate };
        }

        const [
            totalDeployments,
            successfulDeployments,
            activeDeployments,
            durationStats,
            statusBreakdown,
            frameworkBreakdown,
            trend,
            recentDeployments,
        ] = await Promise.all([
            Deployment.countDocuments(queryToUse),
            Deployment.countDocuments({ ...queryToUse, status: 'success' }),
            Deployment.countDocuments(buildBaseQuery(req, { statuses: ACTIVE_STATUSES })),
            Deployment.aggregate([
                { $match: { ...queryToUse, totalTime: { $gt: 0 } } },
                {
                    $group: {
                        _id: null,
                        avgDeployTimeMs: { $avg: '$totalTime' },
                        totalDeployTimeMs: { $sum: '$totalTime' },
                    },
                },
            ]),
            Deployment.aggregate([
                { $match: queryToUse },
                { $group: { _id: '$status', count: { $sum: 1 } } },
                { $sort: { count: -1 } },
            ]),
            Deployment.aggregate([
                { $match: queryToUse },
                { $group: { _id: { $ifNull: ['$framework', 'unknown'] }, count: { $sum: 1 } } },
                { $sort: { count: -1 } },
                { $limit: 8 },
            ]),
            Deployment.aggregate([
                { $match: queryToUse },
                {
                    $group: {
                        _id: {
                            year: { $year: '$createdAt' },
                            month: { $month: '$createdAt' },
                            day: { $dayOfMonth: '$createdAt' },
                        },
                        count: { $sum: 1 },
                        success: {
                            $sum: {
                                $cond: [{ $eq: ['$status', 'success'] }, 1, 0],
                            },
                        },
                        failed: {
                            $sum: {
                                $cond: [{ $eq: ['$status', 'failed'] }, 1, 0],
                            },
                        },
                    },
                },
                { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } },
            ]),
            Deployment.find(queryToUse)
                .sort({ createdAt: -1 })
                .limit(6)
                .select('_id repositoryName status framework totalTime createdAt publicUrl'),
        ]);

        const duration = durationStats[0] || { avgDeployTimeMs: 0, totalDeployTimeMs: 0 };

        return res.status(200).json({
            success: true,
            data: {
                summary: {
                    totalDeployments,
                    successfulDeployments,
                    activeDeployments,
                    successRate: totalDeployments > 0 ? Number(((successfulDeployments / totalDeployments) * 100).toFixed(2)) : 0,
                    avgDeployTimeMs: Math.round(duration.avgDeployTimeMs || 0),
                    totalDeployTimeMs: Math.round(duration.totalDeployTimeMs || 0),
                },
                statusBreakdown: statusBreakdown.map((item) => ({ status: item._id || 'unknown', count: item.count })),
                frameworkBreakdown: frameworkBreakdown.map((item) => ({ framework: item._id || 'unknown', count: item.count })),
                deploymentTrend: trend.map((item) => ({
                    date: `${item._id.year}-${String(item._id.month).padStart(2, '0')}-${String(item._id.day).padStart(2, '0')}`,
                    count: item.count,
                    success: item.success,
                    failed: item.failed,
                })),
                recentDeployments,
                generatedAt: new Date().toISOString(),
            },
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            error: error.message || 'Failed to load analytics dashboard',
        });
    }
};

const getAnalyticsDeployments = async (req, res) => {
    try {
        const days = parseDays(req.query.days, 90);
        const baseQuery = buildBaseQuery(req, { days });

        const [statusBreakdown, frameworkBreakdown, topRepositories, trend] = await Promise.all([
            Deployment.aggregate([
                { $match: baseQuery },
                { $group: { _id: '$status', count: { $sum: 1 } } },
                { $sort: { count: -1 } },
            ]),
            Deployment.aggregate([
                { $match: baseQuery },
                { $group: { _id: { $ifNull: ['$framework', 'unknown'] }, count: { $sum: 1 } } },
                { $sort: { count: -1 } },
            ]),
            Deployment.aggregate([
                { $match: baseQuery },
                {
                    $group: {
                        _id: { $ifNull: ['$repositoryName', 'unknown'] },
                        count: { $sum: 1 },
                        success: { $sum: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] } },
                        failed: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
                    },
                },
                { $sort: { count: -1 } },
                { $limit: 10 },
            ]),
            Deployment.aggregate([
                { $match: baseQuery },
                {
                    $group: {
                        _id: {
                            year: { $year: '$createdAt' },
                            week: { $isoWeek: '$createdAt' },
                        },
                        count: { $sum: 1 },
                    },
                },
                { $sort: { '_id.year': 1, '_id.week': 1 } },
            ]),
        ]);

        return res.status(200).json({
            success: true,
            data: {
                byStatus: statusBreakdown.map((item) => ({ status: item._id || 'unknown', count: item.count })),
                byFramework: frameworkBreakdown.map((item) => ({ framework: item._id || 'unknown', count: item.count })),
                topRepositories: topRepositories.map((item) => ({
                    repositoryName: item._id,
                    count: item.count,
                    success: item.success,
                    failed: item.failed,
                    successRate: item.count > 0 ? Number(((item.success / item.count) * 100).toFixed(2)) : 0,
                })),
                trendByWeek: trend.map((item) => ({
                    year: item._id.year,
                    week: item._id.week,
                    label: `${item._id.year}-W${String(item._id.week).padStart(2, '0')}`,
                    count: item.count,
                })),
                generatedAt: new Date().toISOString(),
            },
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            error: error.message || 'Failed to load deployment analytics',
        });
    }
};

const getAnalyticsCosts = async (req, res) => {
    try {
        const days = parseDays(req.query.days, 30);
        const baseQuery = buildBaseQuery(req, { days });

        const deployments = await Deployment.find(baseQuery)
            .select('totalTime instanceType infrastructure createdAt repositoryName status')
            .sort({ createdAt: 1 });

        const costByDayMap = new Map();
        let totalEstimatedCostUsd = 0;

        for (const deployment of deployments) {
            const deploymentDate = deployment.createdAt ? new Date(deployment.createdAt) : new Date();
            const dayKey = deploymentDate.toISOString().slice(0, 10);
            const runtimeMs = Number(deployment.totalTime || 0);
            const runtimeHours = runtimeMs > 0 ? runtimeMs / (1000 * 60 * 60) : 0;
            const instanceType = deployment?.infrastructure?.ec2?.instanceType || deployment.instanceType || 't3.micro';
            const hourlyRate = COST_PER_HOUR_BY_INSTANCE[instanceType] || COST_PER_HOUR_BY_INSTANCE['t3.micro'];
            const deploymentCost = Number((runtimeHours * hourlyRate).toFixed(6));

            totalEstimatedCostUsd += deploymentCost;

            if (!costByDayMap.has(dayKey)) {
                costByDayMap.set(dayKey, {
                    date: dayKey,
                    deployments: 0,
                    estimatedCostUsd: 0,
                });
            }

            const current = costByDayMap.get(dayKey);
            current.deployments += 1;
            current.estimatedCostUsd = Number((current.estimatedCostUsd + deploymentCost).toFixed(6));
            costByDayMap.set(dayKey, current);
        }

        const costByDay = Array.from(costByDayMap.values());

        return res.status(200).json({
            success: true,
            data: {
                currency: 'USD',
                windowDays: days,
                totalEstimatedCostUsd: Number(totalEstimatedCostUsd.toFixed(6)),
                averageDailyCostUsd: costByDay.length > 0 ? Number((totalEstimatedCostUsd / costByDay.length).toFixed(6)) : 0,
                costByDay,
                generatedAt: new Date().toISOString(),
            },
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            error: error.message || 'Failed to load cost analytics',
        });
    }
};

const getAnalyticsPerformance = async (req, res) => {
    try {
        const days = parseDays(req.query.days, 30);
        const baseQuery = buildBaseQuery(req, { days });

        const deployments = await Deployment.find(baseQuery)
            .select('_id repositoryName status phase totalTime framework createdAt')
            .sort({ createdAt: -1 });

        const timedDeployments = deployments.filter((item) => Number(item.totalTime || 0) > 0);
        const durations = timedDeployments
            .map((item) => Number(item.totalTime || 0))
            .filter((item) => Number.isFinite(item) && item > 0)
            .sort((a, b) => a - b);

        const totalCount = deployments.length;
        const failedCount = deployments.filter((item) => item.status === 'failed').length;
        const successCount = deployments.filter((item) => item.status === 'success').length;
        const avgDeployTimeMs = durations.length > 0 ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : 0;

        const slowestDeployments = timedDeployments
            .sort((a, b) => Number(b.totalTime || 0) - Number(a.totalTime || 0))
            .slice(0, 5)
            .map((item) => ({
                deploymentId: item._id,
                repositoryName: item.repositoryName || 'unknown',
                totalTimeMs: Number(item.totalTime || 0),
                status: item.status,
                framework: item.framework || 'unknown',
                createdAt: item.createdAt,
            }));

        return res.status(200).json({
            success: true,
            data: {
                sampleSize: totalCount,
                successfulDeployments: successCount,
                failedDeployments: failedCount,
                failureRate: totalCount > 0 ? Number(((failedCount / totalCount) * 100).toFixed(2)) : 0,
                avgDeployTimeMs,
                p50DeployTimeMs: Math.round(percentile(durations, 50)),
                p90DeployTimeMs: Math.round(percentile(durations, 90)),
                p95DeployTimeMs: Math.round(percentile(durations, 95)),
                slowestDeployments,
                generatedAt: new Date().toISOString(),
            },
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            error: error.message || 'Failed to load performance analytics',
        });
    }
};

const getBillingUsage = (req, res) => {
    res.json({ usage: 0 });
};

const getBillingPlans = (req, res) => {
    res.json({ plans: [] });
};

const updateBillingPlan = (req, res) => {
    res.json({ message: 'Plan updated' });
};

const predictCost = (req, res) => {
    res.json({ message: 'Cost calculation logic will live here' });
};

module.exports = {
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
};