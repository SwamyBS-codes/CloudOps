/**
 * Enhanced Logging Service
 * Provides comprehensive logging with MongoDB persistence, audit trails, and sanitization
 * Follows industry best practices for logging and observability
 */

const Deployment = require('../models/Deployment');
const AuditLog = require('../models/AuditLog');
const { maskSecrets, sanitizeData } = require('./logSanitizer');

class EnhancedLogger {
  /**
   * Add a log entry to deployment logs with automatic sanitization
   */
  static async addDeploymentLog(deploymentId, {
    source, // 'system', 'git', 'framework', 'docker', 'aws', 'ecr', 'ecs', 'azure', 'acr', 'aci', 'app'
    level, // 'debug', 'info', 'warn', 'error', 'success'
    message,
    data = {},
    deploymentService = null, // 'aws', 'azure', 's3-static'
    phase = null,
    metadata = {},
  }) {
    try {
      const entry = {
        timestamp: new Date(),
        source: source || 'system',
        level: level || 'info',
        message: maskSecrets(message || ''),
        data: sanitizeData(data),
        deploymentService: deploymentService,
        phase: phase,
      };

      // Validate schema constraints
      const validSources = ['system', 'git', 'framework', 'docker', 'aws', 'ecr', 'ecs', 'route53', 'azure', 'acr', 'aci', 'app', 'storage', 'kaniko'];
      const validLevels = ['debug', 'info', 'warn', 'error', 'success'];

      if (!validSources.includes(entry.source)) {
        console.warn(`[Logger] Invalid source: ${entry.source}, defaulting to 'system'`);
        entry.source = 'system';
      }

      if (!validLevels.includes(entry.level)) {
        console.warn(`[Logger] Invalid level: ${entry.level}, defaulting to 'info'`);
        entry.level = 'info';
      }

      // Prepare update query
      const update = { $push: { logs: entry } };

      // Add to service-specific logs
      if (deploymentService === 'aws') {
        update.$push.awsLogs = {
          timestamp: entry.timestamp,
          source: entry.source,
          level: entry.level,
          message: entry.message,
          data: entry.data,
        };
      } else if (deploymentService === 'azure') {
        update.$push.azureLogs = {
          timestamp: entry.timestamp,
          source: entry.source,
          level: entry.level,
          message: entry.message,
          data: entry.data,
        };
      }

      // Also log to console in development
      const logLabel = `[${source.toUpperCase()}] [${level.toUpperCase()}]`;
      const logMessage = `${logLabel} ${message}`;
      if (level === 'error') {
        console.error(logMessage, data);
      } else if (level === 'warn') {
        console.warn(logMessage, data);
      } else {
        console.log(logMessage, data);
      }

      // Persist to database
      const result = await Deployment.findByIdAndUpdate(
        deploymentId,
        update,
        { new: false } // Don't return full doc for performance
      );

      return entry;
    } catch (error) {
      console.error('[Logger] Error adding deployment log:', error);
      // Don't throw - logging should never crash the deployment
      throw error;
    }
  }

  /**
   * Create an audit log entry for state changes
   */
  static async createAuditLog({
    entityType, // 'deployment', 'project', 'user', 'infrastructure', 'webhook', 'system'
    entityId,
    userId = 'system',
    action, // 'created', 'updated', 'deleted', 'status_changed', etc.
    changes = {}, // { before: {}, after: {} }
    reason = 'user_action',
    context = {},
    error = null,
    snapshot = {},
    duration = null,
    resourcesAffected = [],
  }) {
    try {
      const auditEntry = new AuditLog({
        entityType,
        entityId,
        userId,
        action,
        timestamp: new Date(),
        changes: changes || {},
        reason,
        context: {
          ipAddress: context.ipAddress || null,
          userAgent: context.userAgent || null,
          requestId: context.requestId || null,
          phase: context.phase || null,
          source: context.source || 'api',
          metadata: context.metadata || {},
        },
        error: error ? {
          code: error.code || error.name || 'UNKNOWN',
          message: error.message,
          stack: error.stack,
        } : null,
        snapshot: snapshot || {},
        duration: duration,
        resourcesAffected: resourcesAffected || [],
      });

      const saved = await auditEntry.save();

      console.log(`[Audit] ${action.toUpperCase()} ${entityType} ${entityId} by ${userId}`);

      return saved;
    } catch (error) {
      console.error('[Logger] Error creating audit log:', error);
      throw error;
    }
  }

  /**
   * Update deployment status with automatic audit logging
   */
  static async updateDeploymentStatus(deploymentId, {
    newStatus,
    newPhase = null,
    userId = 'system',
    reason = 'user_action',
    context = {},
    metadata = {},
  }) {
    try {
      const deployment = await Deployment.findById(deploymentId);

      if (!deployment) {
        throw new Error(`Deployment ${deploymentId} not found`);
      }

      const oldStatus = deployment.status;
      const oldPhase = deployment.phase;

      // Update deployment
      const updateData = {
        status: newStatus,
        updatedAt: new Date(),
      };

      if (newPhase) {
        updateData.phase = newPhase;
      }

      const updated = await Deployment.findByIdAndUpdate(
        deploymentId,
        updateData,
        { new: true }
      );

      // Create audit log
      if (oldStatus !== newStatus || oldPhase !== newPhase) {
        await this.createAuditLog({
          entityType: 'deployment',
          entityId: deploymentId,
          userId,
          action: 'status_changed',
          changes: {
            before: { status: oldStatus, phase: oldPhase },
            after: { status: newStatus, phase: newPhase },
          },
          reason,
          context: {
            ...context,
            phase: newPhase,
          },
          snapshot: {
            deploymentState: {
              status: newStatus,
              phase: newPhase,
              healthStatus: updated.healthStatus,
              infrastructure: updated.infrastructure,
            },
          },
        });
      }

      return updated;
    } catch (error) {
      console.error('[Logger] Error updating deployment status:', error);
      throw error;
    }
  }

  /**
   * Record error with full context for debugging
   */
  static async recordDeploymentError(deploymentId, {
    error,
    phase = null,
    source = 'system',
    userId = 'system',
    recoveryAction = null,
  }) {
    try {
      const deployment = await Deployment.findById(deploymentId);

      if (!deployment) {
        throw new Error(`Deployment ${deploymentId} not found`);
      }

      const errorEntry = {
        message: error.message || String(error),
        code: error.code || 'UNKNOWN_ERROR',
        phase: phase || deployment.phase,
        timestamp: new Date(),
        stack: error.stack,
      };

      // Store error in deployment
      await Deployment.findByIdAndUpdate(
        deploymentId,
        {
          error: errorEntry,
          failureReason: error.message,
        }
      );

      // Add error log
      await this.addDeploymentLog(deploymentId, {
        source: source,
        level: 'error',
        message: `Error in ${phase || 'unknown'} phase: ${error.message}`,
        data: {
          code: error.code,
          stack: error.stack,
          recoveryAction: recoveryAction,
        },
        phase: phase,
      });

      // Create audit log
      await this.createAuditLog({
        entityType: 'deployment',
        entityId: deploymentId,
        userId,
        action: 'error_occurred',
        error: errorEntry,
        reason: 'system_event',
        context: {
          phase: phase,
          source: source,
          metadata: {
            recoveryAction,
          },
        },
        snapshot: {
          deploymentState: {
            status: deployment.status,
            phase: phase,
            error: errorEntry,
          },
        },
      });

      console.error(`[Error] Deployment ${deploymentId} error: ${error.message}`);

      return errorEntry;
    } catch (error) {
      console.error('[Logger] Error recording deployment error:', error);
      throw error;
    }
  }

  /**
   * Get deployment audit history
   */
  static async getDeploymentAuditHistory(deploymentId, { limit = 100, skip = 0 } = {}) {
    try {
      const auditLogs = await AuditLog.find(
        {
          entityType: 'deployment',
          entityId: deploymentId,
        }
      )
        .sort({ timestamp: -1 })
        .limit(limit)
        .skip(skip)
        .lean();

      return auditLogs;
    } catch (error) {
      console.error('[Logger] Error fetching audit history:', error);
      throw error;
    }
  }

  /**
   * Get user activity audit log
   */
  static async getUserAuditHistory(userId, { limit = 100, skip = 0 } = {}) {
    try {
      const auditLogs = await AuditLog.find(
        { userId }
      )
        .sort({ timestamp: -1 })
        .limit(limit)
        .skip(skip)
        .lean();

      return auditLogs;
    } catch (error) {
      console.error('[Logger] Error fetching user audit history:', error);
      throw error;
    }
  }
}

module.exports = EnhancedLogger;
