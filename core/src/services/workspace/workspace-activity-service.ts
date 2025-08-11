import { DatabasePool } from '../../utils/database-pool.js';
import { Logger } from '../../utils/logger.js';
import {
  WorkspaceActivityLog,
  WorkspaceActivityFeedItem,
  WorkspaceActivityAction,
  PaginatedActivities,
  WorkspaceError,
} from '@shared/types/workspace.js';
import { randomUUID } from 'crypto';

/**
 * Workspace activity tracking and audit service
 */
export class WorkspaceActivityService {
  private logger: Logger;

  constructor(
    private db: DatabasePool,
    logger?: Logger
  ) {
    this.logger = logger || new Logger('WorkspaceActivityService');
  }

  /**
   * Log a workspace activity
   */
  async logActivity(
    workspaceId: string,
    userId: string,
    action: WorkspaceActivityAction,
    resourceType?: string,
    resourceId?: string,
    details?: any,
    metadata?: any,
    sessionId?: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<WorkspaceActivityLog> {
    try {
      const activityId = randomUUID();
      const now = new Date().toISOString();

      const activity: WorkspaceActivityLog = {
        id: activityId,
        workspaceId,
        userId,
        action,
        resourceType,
        resourceId,
        details: details || {},
        metadata: metadata || {},
        ipAddress,
        userAgent,
        sessionId,
        createdAt: now,
      };

      const query = `
        INSERT INTO workspace_activity_log (
          id, workspace_id, user_id, action, resource_type, resource_id,
          details, metadata, ip_address, user_agent, session_id, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *
      `;

      const result = await this.db.query(query, [
        activity.id,
        activity.workspaceId,
        activity.userId,
        activity.action,
        activity.resourceType,
        activity.resourceId,
        JSON.stringify(activity.details),
        JSON.stringify(activity.metadata),
        activity.ipAddress,
        activity.userAgent,
        activity.sessionId,
        activity.createdAt,
      ]);

      if (result.rows.length === 0) {
        throw new Error('Failed to log activity');
      }

      this.logger.debug('Activity logged successfully', { 
        activityId, workspaceId, userId, action, resourceType 
      });

      return this.mapDatabaseRowToActivity(result.rows[0]);
    } catch (error) {
      this.logger.error('Failed to log activity', { 
        error, workspaceId, userId, action, resourceType 
      });
      throw error;
    }
  }

  /**
   * Get workspace activity feed with pagination
   */
  async getActivityFeed(
    workspaceId: string,
    userId: string,
    tenantId: string,
    actions?: WorkspaceActivityAction[],
    resourceTypes?: string[],
    userIds?: string[],
    startDate?: string,
    endDate?: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<PaginatedActivities> {
    try {
      // Validate workspace access
      await this.validateWorkspaceAccess(workspaceId, userId, tenantId);

      let whereClause = 'WHERE wal.workspace_id = $1';
      const values: any[] = [workspaceId];
      let valueIndex = 2;

      if (actions && actions.length > 0) {
        whereClause += ` AND wal.action = ANY($${valueIndex++})`;
        values.push(actions);
      }

      if (resourceTypes && resourceTypes.length > 0) {
        whereClause += ` AND wal.resource_type = ANY($${valueIndex++})`;
        values.push(resourceTypes);
      }

      if (userIds && userIds.length > 0) {
        whereClause += ` AND wal.user_id = ANY($${valueIndex++})`;
        values.push(userIds);
      }

      if (startDate) {
        whereClause += ` AND wal.created_at >= $${valueIndex++}`;
        values.push(startDate);
      }

      if (endDate) {
        whereClause += ` AND wal.created_at <= $${valueIndex++}`;
        values.push(endDate);
      }

      const query = `
        SELECT wal.*, 
               u.name as user_name, 
               u.avatar as user_avatar,
               w.name as workspace_name
        FROM workspace_activity_log wal
        LEFT JOIN users u ON wal.user_id = u.id
        LEFT JOIN collaborative_workspaces w ON wal.workspace_id = w.id
        ${whereClause}
        ORDER BY wal.created_at DESC
        LIMIT $${valueIndex++} OFFSET $${valueIndex++}
      `;

      values.push(limit);
      values.push(offset);

      // Get total count
      const countQuery = `
        SELECT COUNT(*) as total
        FROM workspace_activity_log wal
        ${whereClause}
      `;

      const [dataResult, countResult] = await Promise.all([
        this.db.query(query, values),
        this.db.query(countQuery, values.slice(0, -2)) // Remove limit and offset
      ]);

      const total = parseInt(countResult.rows[0]?.total || '0');
      const activities = dataResult.rows.map(row => this.mapDatabaseRowToActivityFeedItem(row));

      return {
        items: activities,
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      };
    } catch (error) {
      this.logger.error('Failed to get activity feed', { 
        error, workspaceId, userId 
      });
      throw error;
    }
  }

  /**
   * Get user activity summary
   */
  async getUserActivitySummary(
    workspaceId: string,
    targetUserId: string,
    requesterId: string,
    tenantId: string,
    days: number = 30
  ): Promise<any> {
    try {
      // Validate access
      await this.validateWorkspaceAccess(workspaceId, requesterId, tenantId);

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const query = `
        SELECT 
          action,
          resource_type,
          COUNT(*) as count,
          MAX(created_at) as last_occurrence
        FROM workspace_activity_log
        WHERE workspace_id = $1 
          AND user_id = $2 
          AND created_at >= $3
        GROUP BY action, resource_type
        ORDER BY count DESC, last_occurrence DESC
      `;

      const result = await this.db.query(query, [
        workspaceId, 
        targetUserId, 
        startDate.toISOString()
      ]);

      const summary = result.rows.reduce((acc, row) => {
        if (!acc[row.action]) {
          acc[row.action] = {
            totalCount: 0,
            resourceTypes: {},
            lastOccurrence: row.last_occurrence.toISOString(),
          };
        }

        acc[row.action].totalCount += parseInt(row.count);
        acc[row.action].resourceTypes[row.resource_type || 'general'] = parseInt(row.count);
        
        // Update last occurrence if this is more recent
        if (new Date(row.last_occurrence) > new Date(acc[row.action].lastOccurrence)) {
          acc[row.action].lastOccurrence = row.last_occurrence.toISOString();
        }

        return acc;
      }, {} as any);

      return {
        userId: targetUserId,
        workspaceId,
        period: {
          days,
          startDate: startDate.toISOString(),
          endDate: new Date().toISOString(),
        },
        activitySummary: summary,
      };
    } catch (error) {
      this.logger.error('Failed to get user activity summary', { 
        error, workspaceId, targetUserId 
      });
      throw error;
    }
  }

  /**
   * Get workspace activity statistics
   */
  async getActivityStatistics(
    workspaceId: string,
    userId: string,
    tenantId: string,
    days: number = 30
  ): Promise<any> {
    try {
      // Validate access
      await this.validateWorkspaceAccess(workspaceId, userId, tenantId);
      await this.checkAnalyticsPermission(workspaceId, userId, tenantId);

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      // Get overall statistics
      const statsQuery = `
        SELECT 
          COUNT(*) as total_activities,
          COUNT(DISTINCT user_id) as active_users,
          COUNT(DISTINCT action) as unique_actions,
          COUNT(DISTINCT resource_type) as resource_types,
          MAX(created_at) as last_activity
        FROM workspace_activity_log
        WHERE workspace_id = $1 AND created_at >= $2
      `;

      const statsResult = await this.db.query(statsQuery, [
        workspaceId, 
        startDate.toISOString()
      ]);

      // Get activity trends by day
      const trendsQuery = `
        SELECT 
          DATE(created_at) as date,
          COUNT(*) as activity_count,
          COUNT(DISTINCT user_id) as user_count
        FROM workspace_activity_log
        WHERE workspace_id = $1 AND created_at >= $2
        GROUP BY DATE(created_at)
        ORDER BY date
      `;

      const trendsResult = await this.db.query(trendsQuery, [
        workspaceId, 
        startDate.toISOString()
      ]);

      // Get top actions
      const actionsQuery = `
        SELECT 
          action,
          COUNT(*) as count
        FROM workspace_activity_log
        WHERE workspace_id = $1 AND created_at >= $2
        GROUP BY action
        ORDER BY count DESC
        LIMIT 10
      `;

      const actionsResult = await this.db.query(actionsQuery, [
        workspaceId, 
        startDate.toISOString()
      ]);

      // Get most active users
      const usersQuery = `
        SELECT 
          wal.user_id,
          u.name,
          COUNT(wal.id) as activity_count
        FROM workspace_activity_log wal
        LEFT JOIN users u ON wal.user_id = u.id
        WHERE wal.workspace_id = $1 AND wal.created_at >= $2
        GROUP BY wal.user_id, u.name
        ORDER BY activity_count DESC
        LIMIT 10
      `;

      const usersResult = await this.db.query(usersQuery, [
        workspaceId, 
        startDate.toISOString()
      ]);

      const stats = statsResult.rows[0];

      return {
        workspaceId,
        period: {
          days,
          startDate: startDate.toISOString(),
          endDate: new Date().toISOString(),
        },
        overview: {
          totalActivities: parseInt(stats.total_activities) || 0,
          activeUsers: parseInt(stats.active_users) || 0,
          uniqueActions: parseInt(stats.unique_actions) || 0,
          resourceTypes: parseInt(stats.resource_types) || 0,
          lastActivity: stats.last_activity?.toISOString(),
        },
        trends: trendsResult.rows.map(row => ({
          date: row.date.toISOString().split('T')[0],
          activityCount: parseInt(row.activity_count),
          userCount: parseInt(row.user_count),
        })),
        topActions: actionsResult.rows.map(row => ({
          action: row.action,
          count: parseInt(row.count),
        })),
        mostActiveUsers: usersResult.rows.map(row => ({
          userId: row.user_id,
          name: row.name || 'Unknown User',
          activityCount: parseInt(row.activity_count),
        })),
      };
    } catch (error) {
      this.logger.error('Failed to get activity statistics', { 
        error, workspaceId, userId 
      });
      throw error;
    }
  }

  /**
   * Get resource activity history
   */
  async getResourceActivity(
    workspaceId: string,
    resourceType: string,
    resourceId: string,
    userId: string,
    tenantId: string,
    limit: number = 20
  ): Promise<WorkspaceActivityFeedItem[]> {
    try {
      // Validate access
      await this.validateWorkspaceAccess(workspaceId, userId, tenantId);

      const query = `
        SELECT wal.*, 
               u.name as user_name, 
               u.avatar as user_avatar,
               w.name as workspace_name
        FROM workspace_activity_log wal
        LEFT JOIN users u ON wal.user_id = u.id
        LEFT JOIN collaborative_workspaces w ON wal.workspace_id = w.id
        WHERE wal.workspace_id = $1 
          AND wal.resource_type = $2 
          AND wal.resource_id = $3
        ORDER BY wal.created_at DESC
        LIMIT $4
      `;

      const result = await this.db.query(query, [
        workspaceId, 
        resourceType, 
        resourceId, 
        limit
      ]);

      return result.rows.map(row => this.mapDatabaseRowToActivityFeedItem(row));
    } catch (error) {
      this.logger.error('Failed to get resource activity', { 
        error, workspaceId, resourceType, resourceId 
      });
      throw error;
    }
  }

  /**
   * Delete old activities (for data retention)
   */
  async deleteOldActivities(
    workspaceId: string,
    retentionDays: number = 365
  ): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      const query = `
        DELETE FROM workspace_activity_log
        WHERE workspace_id = $1 AND created_at < $2
      `;

      const result = await this.db.query(query, [
        workspaceId, 
        cutoffDate.toISOString()
      ]);

      const deletedCount = result.rowCount || 0;

      if (deletedCount > 0) {
        this.logger.info('Deleted old activities', { 
          workspaceId, 
          retentionDays, 
          deletedCount 
        });
      }

      return deletedCount;
    } catch (error) {
      this.logger.error('Failed to delete old activities', { 
        error, workspaceId, retentionDays 
      });
      return 0;
    }
  }

  /**
   * Export activity log
   */
  async exportActivityLog(
    workspaceId: string,
    userId: string,
    tenantId: string,
    startDate?: string,
    endDate?: string,
    actions?: WorkspaceActivityAction[],
    format: 'json' | 'csv' = 'json'
  ): Promise<any> {
    try {
      // Validate access and permissions
      await this.validateWorkspaceAccess(workspaceId, userId, tenantId);
      await this.checkAnalyticsPermission(workspaceId, userId, tenantId);

      let whereClause = 'WHERE wal.workspace_id = $1';
      const values: any[] = [workspaceId];
      let valueIndex = 2;

      if (startDate) {
        whereClause += ` AND wal.created_at >= $${valueIndex++}`;
        values.push(startDate);
      }

      if (endDate) {
        whereClause += ` AND wal.created_at <= $${valueIndex++}`;
        values.push(endDate);
      }

      if (actions && actions.length > 0) {
        whereClause += ` AND wal.action = ANY($${valueIndex++})`;
        values.push(actions);
      }

      const query = `
        SELECT wal.*, 
               u.name as user_name, 
               u.email as user_email
        FROM workspace_activity_log wal
        LEFT JOIN users u ON wal.user_id = u.id
        ${whereClause}
        ORDER BY wal.created_at DESC
      `;

      const result = await this.db.query(query, values);

      const activities = result.rows.map(row => ({
        id: row.id,
        workspaceId: row.workspace_id,
        userId: row.user_id,
        userName: row.user_name,
        userEmail: row.user_email,
        action: row.action,
        resourceType: row.resource_type,
        resourceId: row.resource_id,
        details: row.details,
        metadata: row.metadata,
        ipAddress: row.ip_address,
        userAgent: row.user_agent,
        sessionId: row.session_id,
        createdAt: row.created_at.toISOString(),
      }));

      if (format === 'csv') {
        // Convert to CSV format
        return this.convertToCSV(activities);
      }

      return {
        workspaceId,
        exportedAt: new Date().toISOString(),
        exportedBy: userId,
        period: { startDate, endDate },
        filters: { actions },
        activities,
      };
    } catch (error) {
      this.logger.error('Failed to export activity log', { 
        error, workspaceId, userId 
      });
      throw error;
    }
  }

  // Private helper methods

  private async validateWorkspaceAccess(
    workspaceId: string,
    userId: string,
    tenantId: string
  ): Promise<void> {
    const query = `
      SELECT wm.status, w.visibility
      FROM collaborative_workspaces w
      LEFT JOIN workspace_members wm ON w.id = wm.workspace_id AND wm.user_id = $2
      WHERE w.id = $1 AND w.tenant_id = $3 AND w.deleted_at IS NULL
    `;

    const result = await this.db.query(query, [workspaceId, userId, tenantId]);

    if (result.rows.length === 0) {
      throw this.createActivityError('WORKSPACE_NOT_FOUND', 'Workspace not found');
    }

    const row = result.rows[0];
    
    if (row.visibility === 'public' || row.status === 'active') {
      return;
    }

    throw this.createActivityError('WORKSPACE_ACCESS_DENIED', 'Access denied to workspace');
  }

  private async checkAnalyticsPermission(
    workspaceId: string,
    userId: string,
    tenantId: string
  ): Promise<void> {
    const query = `
      SELECT wm.role, wm.permissions, w.owner_id
      FROM workspace_members wm
      JOIN collaborative_workspaces w ON wm.workspace_id = w.id
      WHERE wm.workspace_id = $1 AND wm.user_id = $2 AND w.tenant_id = $3 AND wm.status = 'active'
    `;

    const result = await this.db.query(query, [workspaceId, userId, tenantId]);

    if (result.rows.length === 0) {
      throw this.createActivityError('WORKSPACE_ACCESS_DENIED', 'Access denied to workspace');
    }

    const row = result.rows[0];
    
    // Owners and admins have analytics permissions
    if (row.owner_id === userId || row.role === 'admin') {
      return;
    }

    const permissions = row.permissions || {};
    if (permissions.canViewAnalytics === true) {
      return;
    }

    throw this.createActivityError('WORKSPACE_ACCESS_DENIED', 'Permission denied: analytics access required');
  }

  private convertToCSV(activities: any[]): string {
    if (activities.length === 0) {
      return '';
    }

    const headers = Object.keys(activities[0]).join(',');
    const rows = activities.map(activity => 
      Object.values(activity).map(value => 
        JSON.stringify(value || '')
      ).join(',')
    );

    return [headers, ...rows].join('\n');
  }

  private mapDatabaseRowToActivity(row: any): WorkspaceActivityLog {
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      userId: row.user_id,
      action: row.action,
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      details: row.details || {},
      metadata: row.metadata || {},
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      sessionId: row.session_id,
      createdAt: row.created_at.toISOString(),
    };
  }

  private mapDatabaseRowToActivityFeedItem(row: any): WorkspaceActivityFeedItem {
    const activity = this.mapDatabaseRowToActivity(row);
    return {
      ...activity,
      user: row.user_name ? {
        id: row.user_id,
        name: row.user_name,
        avatar: row.user_avatar,
      } : undefined,
      workspace: row.workspace_name ? {
        id: row.workspace_id,
        name: row.workspace_name,
      } : undefined,
    };
  }

  private createActivityError(code: string, message: string, details?: any): WorkspaceError {
    const error = new Error(message) as any;
    error.code = code;
    error.details = details;
    return error;
  }
}