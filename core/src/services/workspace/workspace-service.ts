import { DatabasePool } from '../../utils/database-pool.js';
import { Logger } from '../../utils/logger.js';
import {
  CollaborativeWorkspace,
  WorkspaceWithStats,
  CreateWorkspaceRequest,
  UpdateWorkspaceRequest,
  WorkspaceFilter,
  WorkspaceSort,
  PaginatedWorkspaces,
  WorkspaceAnalytics,
  WorkspaceExportOptions,
  WorkspaceError,
  WorkspaceStatus,
  WorkspaceVisibility,
} from '@shared/types/workspace.js';
import { z } from 'zod';
import { randomUUID } from 'crypto';

/**
 * Input sanitization utility to prevent injection attacks
 */
const sanitizeInput = (input: string): string => {
  if (!input || typeof input !== 'string') {
    return '';
  }
  // Remove potential SQL injection characters and normalize
  return input
    .replace(/[\x00\x08\x09\x1a\n\r"'\\%]/g, '')
    .trim()
    .substring(0, 1000); // Limit length
};

/**
 * Build safe WHERE clause with proper parameterization
 */
const buildSafeWhereClause = (filters: WorkspaceFilter | undefined, baseValues: any[]) => {
  const conditions: string[] = [];
  const values: any[] = [...baseValues];
  let paramIndex = baseValues.length + 1;

  if (filters) {
    if (filters.status && Array.isArray(filters.status) && filters.status.length > 0) {
      // Validate status values against allowed enum
      const validStatuses = ['active', 'inactive', 'archived', 'suspended'];
      const sanitizedStatuses = filters.status.filter(s => validStatuses.includes(s));
      if (sanitizedStatuses.length > 0) {
        conditions.push(`w.status = ANY($${paramIndex++})`);
        values.push(sanitizedStatuses);
      }
    }

    if (filters.visibility && Array.isArray(filters.visibility) && filters.visibility.length > 0) {
      // Validate visibility values against allowed enum
      const validVisibilities = ['private', 'internal', 'public'];
      const sanitizedVisibilities = filters.visibility.filter(v => validVisibilities.includes(v));
      if (sanitizedVisibilities.length > 0) {
        conditions.push(`w.visibility = ANY($${paramIndex++})`);
        values.push(sanitizedVisibilities);
      }
    }

    if (filters.memberRole) {
      // Validate role against allowed enum
      const validRoles = ['owner', 'admin', 'member', 'viewer'];
      if (validRoles.includes(filters.memberRole)) {
        conditions.push(`wm.role = $${paramIndex++}`);
        values.push(filters.memberRole);
      }
    }

    if (filters.search && typeof filters.search === 'string') {
      const sanitizedSearch = sanitizeInput(filters.search);
      if (sanitizedSearch.length > 0) {
        conditions.push(`(w.name ILIKE $${paramIndex} OR w.description ILIKE $${paramIndex + 1})`);
        const searchPattern = `%${sanitizedSearch}%`;
        values.push(searchPattern, searchPattern);
        paramIndex += 2;
      }
    }

    if (filters.createdAfter) {
      // Validate date format
      const date = new Date(filters.createdAfter);
      if (!isNaN(date.getTime())) {
        conditions.push(`w.created_at >= $${paramIndex++}`);
        values.push(filters.createdAfter);
      }
    }

    if (filters.createdBefore) {
      // Validate date format
      const date = new Date(filters.createdBefore);
      if (!isNaN(date.getTime())) {
        conditions.push(`w.created_at <= $${paramIndex++}`);
        values.push(filters.createdBefore);
      }
    }
  }

  return {
    whereClause: conditions.length > 0 ? conditions.join(' AND ') : '',
    values,
    nextParamIndex: paramIndex
  };
};

/**
 * Build safe ORDER BY clause to prevent injection
 */
const buildSafeOrderClause = (sort: WorkspaceSort | undefined): string => {
  if (!sort) {
    return 'ORDER BY w.created_at DESC';
  }

  const validFields = ['name', 'createdAt', 'updatedAt', 'memberCount', 'activityCount'];
  const validDirections = ['asc', 'desc'];
  
  const field = validFields.includes(sort.field) ? sort.field : 'createdAt';
  const direction = validDirections.includes(sort.direction || 'desc') ? sort.direction : 'desc';
  
  switch (field) {
    case 'name':
      return `ORDER BY w.name ${direction}`;
    case 'updatedAt':
      return `ORDER BY w.updated_at ${direction}`;
    case 'memberCount':
      return `ORDER BY member_count ${direction}`;
    case 'activityCount':
      return `ORDER BY activity_count ${direction}`;
    default:
      return `ORDER BY w.created_at ${direction}`;
  }
};

/**
 * Core workspace management service
 * Handles CRUD operations, analytics, and workspace lifecycle management
 */
export class WorkspaceService {
  private logger: Logger;

  constructor(
    private db: DatabasePool,
    logger?: Logger
  ) {
    this.logger = logger || new Logger('WorkspaceService');
  }

  /**
   * Create a new collaborative workspace
   */
  async createWorkspace(
    tenantId: string,
    ownerId: string,
    request: CreateWorkspaceRequest
  ): Promise<CollaborativeWorkspace> {
    try {
      const workspaceId = randomUUID();
      const now = new Date().toISOString();

      // Validate tenant access and limits
      await this.validateTenantLimits(tenantId);

      // Create workspace with default settings
      const workspace: CollaborativeWorkspace = {
        id: workspaceId,
        name: request.name,
        description: request.description,
        tenantId,
        ownerId,
        templateId: request.templateId,
        status: 'active' as WorkspaceStatus,
        settings: request.settings || {},
        metadata: request.metadata || {},
        visibility: request.visibility || 'private',
        maxMembers: 100,
        currentMembers: 1,
        createdAt: now,
        updatedAt: now,
      };

      const query = `
        INSERT INTO collaborative_workspaces (
          id, name, description, tenant_id, owner_id, template_id,
          status, settings, metadata, visibility, max_members, current_members,
          created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING *
      `;

      const result = await this.db.query(query, [
        workspace.id,
        workspace.name,
        workspace.description,
        workspace.tenantId,
        workspace.ownerId,
        workspace.templateId,
        workspace.status,
        JSON.stringify(workspace.settings),
        JSON.stringify(workspace.metadata),
        workspace.visibility,
        workspace.maxMembers,
        workspace.currentMembers,
        workspace.createdAt,
        workspace.updatedAt,
      ]);

      if (result.rows.length === 0) {
        throw new Error('Failed to create workspace');
      }

      // Apply template if specified
      if (request.templateId) {
        await this.applyTemplate(workspaceId, request.templateId, ownerId);
      }

      // Add owner as admin member
      await this.addInitialMember(workspaceId, ownerId, tenantId);

      this.logger.info('Workspace created successfully', { workspaceId, tenantId, ownerId });
      
      return this.mapDatabaseRowToWorkspace(result.rows[0]);
    } catch (error) {
      this.logger.error('Failed to create workspace', { error, request });
      throw error;
    }
  }

  /**
   * Get workspace by ID with permission check
   */
  async getWorkspace(
    workspaceId: string,
    userId: string,
    tenantId: string
  ): Promise<CollaborativeWorkspace | null> {
    try {
      const query = `
        SELECT w.*, 
               COALESCE(wm.role, 'none') as user_role,
               COALESCE(wm.status, 'none') as member_status
        FROM collaborative_workspaces w
        LEFT JOIN workspace_members wm ON w.id = wm.workspace_id AND wm.user_id = $2
        WHERE w.id = $1 AND w.tenant_id = $3 AND w.deleted_at IS NULL
      `;

      const result = await this.db.query(query, [workspaceId, userId, tenantId]);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      
      // Check access permissions
      if (!this.hasWorkspaceAccess(row.visibility, row.user_role, row.member_status)) {
        throw this.createWorkspaceError('WORKSPACE_ACCESS_DENIED', 'Access denied to workspace');
      }

      return this.mapDatabaseRowToWorkspace(row);
    } catch (error) {
      this.logger.error('Failed to get workspace', { error, workspaceId, userId });
      throw error;
    }
  }

  /**
   * Update workspace
   */
  async updateWorkspace(
    workspaceId: string,
    userId: string,
    tenantId: string,
    request: UpdateWorkspaceRequest
  ): Promise<CollaborativeWorkspace> {
    try {
      // Check permissions
      await this.checkWorkspacePermission(workspaceId, userId, tenantId, 'canEditSettings');

      const updates: string[] = [];
      const values: any[] = [];
      let valueIndex = 1;

      if (request.name !== undefined) {
        updates.push(`name = $${valueIndex++}`);
        values.push(request.name);
      }

      if (request.description !== undefined) {
        updates.push(`description = $${valueIndex++}`);
        values.push(request.description);
      }

      if (request.visibility !== undefined) {
        updates.push(`visibility = $${valueIndex++}`);
        values.push(request.visibility);
      }

      if (request.settings !== undefined) {
        updates.push(`settings = $${valueIndex++}`);
        values.push(JSON.stringify(request.settings));
      }

      if (request.metadata !== undefined) {
        updates.push(`metadata = $${valueIndex++}`);
        values.push(JSON.stringify(request.metadata));
      }

      updates.push(`updated_at = $${valueIndex++}`);
      values.push(new Date().toISOString());

      values.push(workspaceId);
      values.push(tenantId);

      const query = `
        UPDATE collaborative_workspaces
        SET ${updates.join(', ')}
        WHERE id = $${valueIndex++} AND tenant_id = $${valueIndex++} AND deleted_at IS NULL
        RETURNING *
      `;

      const result = await this.db.query(query, values);

      if (result.rows.length === 0) {
        throw this.createWorkspaceError('WORKSPACE_NOT_FOUND', 'Workspace not found');
      }

      this.logger.info('Workspace updated successfully', { workspaceId, userId });

      return this.mapDatabaseRowToWorkspace(result.rows[0]);
    } catch (error) {
      this.logger.error('Failed to update workspace', { error, workspaceId, userId });
      throw error;
    }
  }

  /**
   * Delete workspace (soft delete)
   */
  async deleteWorkspace(
    workspaceId: string,
    userId: string,
    tenantId: string
  ): Promise<void> {
    try {
      // Only owner can delete workspace
      const workspace = await this.getWorkspace(workspaceId, userId, tenantId);
      
      if (!workspace) {
        throw this.createWorkspaceError('WORKSPACE_NOT_FOUND', 'Workspace not found');
      }

      if (workspace.ownerId !== userId) {
        throw this.createWorkspaceError('WORKSPACE_ACCESS_DENIED', 'Only workspace owner can delete workspace');
      }

      const query = `
        UPDATE collaborative_workspaces
        SET deleted_at = $1, updated_at = $1
        WHERE id = $2 AND tenant_id = $3
      `;

      await this.db.query(query, [new Date().toISOString(), workspaceId, tenantId]);

      this.logger.info('Workspace deleted successfully', { workspaceId, userId });
    } catch (error) {
      this.logger.error('Failed to delete workspace', { error, workspaceId, userId });
      throw error;
    }
  }

  /**
   * Get workspaces with stats
   */
  async getWorkspacesWithStats(
    userId: string,
    tenantId: string,
    filters?: WorkspaceFilter,
    sort?: WorkspaceSort,
    limit: number = 20,
    offset: number = 0
  ): Promise<PaginatedWorkspaces> {
    try {
      // Validate input parameters
      if (!userId || !tenantId) {
        throw this.createWorkspaceError('INVALID_PARAMETERS', 'User ID and tenant ID are required');
      }
      
      // Validate and sanitize pagination parameters
      const sanitizedLimit = Math.min(Math.max(1, limit), 100);
      const sanitizedOffset = Math.max(0, offset);

      // Build base WHERE clause with tenant and deletion filter
      let baseWhereClause = 'WHERE w.tenant_id = $1 AND w.deleted_at IS NULL';
      const baseValues = [tenantId];
      
      // Build safe WHERE clause using parameterized queries
      const { whereClause: filterWhereClause, values: filterValues, nextParamIndex } = buildSafeWhereClause(filters, baseValues);
      
      // Combine WHERE clauses
      let fullWhereClause = baseWhereClause;
      if (filterWhereClause) {
        fullWhereClause += ` AND ${filterWhereClause}`;
      }
      
      // Add user membership filter (secure parameterized query)
      fullWhereClause += ` AND (w.visibility = 'public' OR wm.user_id = $${nextParamIndex})`;
      filterValues.push(userId);
      
      const finalParamIndex = nextParamIndex + 1;
      
      // Build safe ORDER BY clause
      const orderClause = buildSafeOrderClause(sort);

      // Optimized main query with single aggregation to prevent performance bottleneck
      const query = `
        WITH workspace_stats AS (
          SELECT 
            w.id,
            COUNT(DISTINCT wm.id) FILTER (WHERE wm.status = 'active') as member_count,
            COUNT(DISTINCT wm.id) FILTER (WHERE wm.status = 'active' AND wm.last_active_at > NOW() - INTERVAL '30 days') as active_members,
            COUNT(DISTINCT wr.id) FILTER (WHERE wr.deleted_at IS NULL) as resource_count,
            COUNT(DISTINCT wal.id) FILTER (WHERE wal.created_at > NOW() - INTERVAL '30 days') as activity_count,
            COUNT(DISTINCT wi.id) FILTER (WHERE wi.status = 'active') as integration_count
          FROM collaborative_workspaces w
          LEFT JOIN workspace_members wm ON w.id = wm.workspace_id
          LEFT JOIN workspace_resources wr ON w.id = wr.workspace_id
          LEFT JOIN workspace_activity_log wal ON w.id = wal.workspace_id
          LEFT JOIN workspace_integrations wi ON w.id = wi.workspace_id
          ${fullWhereClause}
          GROUP BY w.id
        )
        SELECT w.*, 
               COALESCE(ws.member_count, 0) as member_count,
               COALESCE(ws.active_members, 0) as active_members,
               COALESCE(ws.resource_count, 0) as resource_count,
               COALESCE(ws.activity_count, 0) as activity_count,
               COALESCE(ws.integration_count, 0) as integration_count
        FROM collaborative_workspaces w
        LEFT JOIN workspace_members wm ON w.id = wm.workspace_id AND wm.status = 'active'
        LEFT JOIN workspace_stats ws ON w.id = ws.id
        ${fullWhereClause}
        GROUP BY w.id, ws.member_count, ws.active_members, ws.resource_count, ws.activity_count, ws.integration_count
        ${orderClause}
        LIMIT $${finalParamIndex} OFFSET $${finalParamIndex + 1}
      `;

      filterValues.push(sanitizedLimit, sanitizedOffset);

      // Get total count with optimized query
      const countQuery = `
        SELECT COUNT(DISTINCT w.id) as total
        FROM collaborative_workspaces w
        LEFT JOIN workspace_members wm ON w.id = wm.workspace_id AND wm.status = 'active'
        ${fullWhereClause}
      `;

      const countValues = filterValues.slice(0, -2); // Remove limit and offset for count

      const [dataResult, countResult] = await Promise.all([
        this.db.query(query, filterValues),
        this.db.query(countQuery, countValues)
      ]);

      const total = parseInt(countResult.rows[0]?.total || '0');
      const workspaces = dataResult.rows.map(row => this.mapDatabaseRowToWorkspaceWithStats(row));

      return {
        items: workspaces,
        total,
        limit: sanitizedLimit,
        offset: sanitizedOffset,
        hasMore: sanitizedOffset + sanitizedLimit < total,
      };
    } catch (error) {
      this.logger.error('Failed to get workspaces with stats', { error, userId, tenantId });
      throw error;
    }
  }

  /**
   * Get workspace analytics with optimized single-query approach
   */
  async getWorkspaceAnalytics(
    workspaceId: string,
    userId: string,
    tenantId: string,
    startDate: string,
    endDate: string
  ): Promise<WorkspaceAnalytics> {
    try {
      // Validate input parameters
      if (!workspaceId || !userId || !tenantId || !startDate || !endDate) {
        throw this.createWorkspaceError('INVALID_PARAMETERS', 'All parameters are required for analytics');
      }

      // Validate date formats
      const startDateTime = new Date(startDate);
      const endDateTime = new Date(endDate);
      if (isNaN(startDateTime.getTime()) || isNaN(endDateTime.getTime())) {
        throw this.createWorkspaceError('INVALID_DATE_FORMAT', 'Invalid date format provided');
      }

      // Check permissions
      await this.checkWorkspacePermission(workspaceId, userId, tenantId, 'canViewAnalytics');

      // Optimized single analytics query to prevent COUNT DISTINCT performance bottleneck
      const metricsQuery = `
        WITH analytics_data AS (
          SELECT 
            -- Member metrics
            COUNT(DISTINCT CASE WHEN wm.status = 'active' THEN wm.id END) as total_members,
            COUNT(DISTINCT CASE WHEN wm.status = 'active' AND wm.last_active_at >= $2 THEN wm.id END) as active_members,
            COUNT(DISTINCT CASE WHEN wm.created_at >= $2 THEN wm.id END) as new_members,
            
            -- Session metrics  
            COUNT(DISTINCT ws.id) as total_sessions,
            AVG(EXTRACT(EPOCH FROM (ws.ended_at - ws.started_at))) FILTER (WHERE ws.ended_at IS NOT NULL) as avg_session_duration,
            
            -- Activity metrics
            COUNT(DISTINCT wal.id) as total_activities,
            COUNT(DISTINCT CASE WHEN wal.action IN ('content_created', 'content_updated', 'comment_added') THEN wal.id END) as collaboration_events,
            
            -- Resource metrics
            COUNT(DISTINCT CASE WHEN wr.created_at >= $2 THEN wr.id END) as resources_uploaded,
            COALESCE(SUM(wr.download_count), 0) as resources_downloaded,
            
            -- Integration metrics
            COUNT(DISTINCT CASE WHEN wi.last_sync_at >= $2 THEN wi.id END) as integration_events
            
          FROM collaborative_workspaces w
          LEFT JOIN workspace_members wm ON w.id = wm.workspace_id
          LEFT JOIN workspace_sessions ws ON w.id = ws.workspace_id AND ws.started_at >= $2 AND ws.started_at <= $3
          LEFT JOIN workspace_activity_log wal ON w.id = wal.workspace_id AND wal.created_at >= $2 AND wal.created_at <= $3
          LEFT JOIN workspace_resources wr ON w.id = wr.workspace_id AND wr.deleted_at IS NULL
          LEFT JOIN workspace_integrations wi ON w.id = wi.workspace_id
          WHERE w.id = $1 AND w.tenant_id = $4
        )
        SELECT * FROM analytics_data
      `;

      const metricsResult = await this.db.query(metricsQuery, [workspaceId, startDate, endDate, tenantId]);
      
      if (metricsResult.rows.length === 0) {
        throw this.createWorkspaceError('WORKSPACE_NOT_FOUND', 'Workspace not found or access denied');
      }
      
      const metrics = metricsResult.rows[0];

      // Get trends
      const trendsQuery = `
        SELECT 
          date_trunc('day', wm.created_at) as date,
          COUNT(wm.id) as member_count,
          0 as activity_count
        FROM workspace_members wm
        WHERE wm.workspace_id = $1 AND wm.created_at >= $2 AND wm.created_at <= $3
        GROUP BY date_trunc('day', wm.created_at)
        UNION ALL
        SELECT 
          date_trunc('day', wal.created_at) as date,
          0 as member_count,
          COUNT(wal.id) as activity_count
        FROM workspace_activity_log wal
        WHERE wal.workspace_id = $1 AND wal.created_at >= $2 AND wal.created_at <= $3
        GROUP BY date_trunc('day', wal.created_at)
        ORDER BY date
      `;

      const trendsResult = await this.db.query(trendsQuery, [workspaceId, startDate, endDate]);

      // Process trends data
      const memberGrowth: { date: string; count: number }[] = [];
      const activityTrend: { date: string; count: number }[] = [];

      trendsResult.rows.forEach(row => {
        const date = row.date.toISOString();
        if (row.member_count > 0) {
          memberGrowth.push({ date, count: row.member_count });
        }
        if (row.activity_count > 0) {
          activityTrend.push({ date, count: row.activity_count });
        }
      });

      // Get top users
      const topUsersQuery = `
        SELECT 
          u.id as user_id,
          u.name,
          COUNT(DISTINCT wal.id) as activity_count,
          COUNT(DISTINCT ws.id) as session_count,
          MAX(wm.last_active_at) as last_active
        FROM workspace_members wm
        JOIN users u ON wm.user_id = u.id
        LEFT JOIN workspace_activity_log wal ON wm.workspace_id = wal.workspace_id AND wm.user_id = wal.user_id AND wal.created_at >= $2 AND wal.created_at <= $3
        LEFT JOIN workspace_sessions ws ON wm.workspace_id = ws.workspace_id AND wm.user_id = ws.user_id AND ws.started_at >= $2 AND ws.started_at <= $3
        WHERE wm.workspace_id = $1 AND wm.status = 'active'
        GROUP BY u.id, u.name
        ORDER BY activity_count DESC, session_count DESC
        LIMIT 10
      `;

      const topUsersResult = await this.db.query(topUsersQuery, [workspaceId, startDate, endDate]);

      // Calculate engagement score (simplified)
      const totalPossibleActivities = parseInt(metrics.total_members) * 10; // Assume 10 activities per member as ideal
      const actualActivities = parseInt(metrics.total_activities) || 0;
      const engagementScore = Math.min(100, Math.round((actualActivities / Math.max(1, totalPossibleActivities)) * 100));

      return {
        workspaceId,
        period: {
          start: startDate,
          end: endDate,
        },
        metrics: {
          totalMembers: parseInt(metrics.total_members) || 0,
          activeMembers: parseInt(metrics.active_members) || 0,
          newMembers: parseInt(metrics.new_members) || 0,
          totalSessions: parseInt(metrics.total_sessions) || 0,
          averageSessionDuration: parseFloat(metrics.avg_session_duration) || 0,
          totalActivities: parseInt(metrics.total_activities) || 0,
          resourcesUploaded: parseInt(metrics.resources_uploaded) || 0,
          resourcesDownloaded: parseInt(metrics.resources_downloaded) || 0,
          integrationEvents: parseInt(metrics.integration_events) || 0,
          collaborationEvents: parseInt(metrics.collaboration_events) || 0,
        },
        trends: {
          memberGrowth,
          activityTrend,
          engagementScore,
        },
        topUsers: topUsersResult.rows.map(row => ({
          userId: row.user_id,
          name: row.name,
          activityCount: parseInt(row.activity_count) || 0,
          sessionCount: parseInt(row.session_count) || 0,
          lastActive: row.last_active?.toISOString() || new Date().toISOString(),
        })),
      };
    } catch (error) {
      this.logger.error('Failed to get workspace analytics', { error, workspaceId, userId });
      throw error;
    }
  }

  /**
   * Export workspace data
   */
  async exportWorkspace(
    workspaceId: string,
    userId: string,
    tenantId: string,
    options: WorkspaceExportOptions
  ): Promise<any> {
    try {
      // Check permissions
      await this.checkWorkspacePermission(workspaceId, userId, tenantId, 'canExportData');

      const exportData: any = {
        workspace: await this.getWorkspace(workspaceId, userId, tenantId),
        exportedAt: new Date().toISOString(),
        exportedBy: userId,
        options,
      };

      if (options.includeMembers) {
        const membersQuery = `
          SELECT wm.*, u.name, u.email
          FROM workspace_members wm
          LEFT JOIN users u ON wm.user_id = u.id
          WHERE wm.workspace_id = $1
          ORDER BY wm.created_at
        `;
        const membersResult = await this.db.query(membersQuery, [workspaceId]);
        exportData.members = membersResult.rows;
      }

      if (options.includeResources) {
        let resourcesQuery = `
          SELECT * FROM workspace_resources
          WHERE workspace_id = $1 AND deleted_at IS NULL
        `;
        const resourcesValues = [workspaceId];

        if (options.dateRange) {
          resourcesQuery += ' AND created_at >= $2 AND created_at <= $3';
          resourcesValues.push(options.dateRange.start, options.dateRange.end);
        }

        resourcesQuery += ' ORDER BY created_at';
        
        const resourcesResult = await this.db.query(resourcesQuery, resourcesValues);
        exportData.resources = resourcesResult.rows;
      }

      if (options.includeActivity) {
        let activityQuery = `
          SELECT wal.*, u.name as user_name
          FROM workspace_activity_log wal
          LEFT JOIN users u ON wal.user_id = u.id
          WHERE wal.workspace_id = $1
        `;
        const activityValues = [workspaceId];

        if (options.dateRange) {
          activityQuery += ' AND wal.created_at >= $2 AND wal.created_at <= $3';
          activityValues.push(options.dateRange.start, options.dateRange.end);
        }

        activityQuery += ' ORDER BY wal.created_at';
        
        const activityResult = await this.db.query(activityQuery, activityValues);
        exportData.activities = activityResult.rows;
      }

      if (options.includeSettings) {
        const settingsQuery = `
          SELECT * FROM workspace_settings
          WHERE workspace_id = $1 AND is_sensitive = false
          ORDER BY category, key
        `;
        const settingsResult = await this.db.query(settingsQuery, [workspaceId]);
        exportData.settings = settingsResult.rows;
      }

      if (options.includeIntegrations) {
        const integrationsQuery = `
          SELECT id, workspace_id, integration_type, status, created_at, updated_at
          FROM workspace_integrations
          WHERE workspace_id = $1
          ORDER BY created_at
        `;
        const integrationsResult = await this.db.query(integrationsQuery, [workspaceId]);
        exportData.integrations = integrationsResult.rows;
      }

      this.logger.info('Workspace exported successfully', { workspaceId, userId, options });

      return exportData;
    } catch (error) {
      this.logger.error('Failed to export workspace', { error, workspaceId, userId });
      throw error;
    }
  }

  // Private helper methods

  private async validateTenantLimits(tenantId: string): Promise<void> {
    const countQuery = `
      SELECT COUNT(*) as count
      FROM collaborative_workspaces
      WHERE tenant_id = $1 AND deleted_at IS NULL
    `;

    const result = await this.db.query(countQuery, [tenantId]);
    const count = parseInt(result.rows[0]?.count || '0');

    // TODO: Get actual tenant limits from tenant service
    const maxWorkspaces = 100; // Default limit

    if (count >= maxWorkspaces) {
      throw this.createWorkspaceError('WORKSPACE_LIMIT_EXCEEDED', 'Workspace limit exceeded for tenant');
    }
  }

  private async applyTemplate(workspaceId: string, templateId: string, userId: string): Promise<void> {
    // TODO: Implement template application
    this.logger.info('Applying template to workspace', { workspaceId, templateId, userId });
  }

  private async addInitialMember(workspaceId: string, ownerId: string, tenantId: string): Promise<void> {
    const memberQuery = `
      INSERT INTO workspace_members (
        id, workspace_id, user_id, role, status, joined_at, created_at, updated_at
      )
      VALUES ($1, $2, $3, 'owner', 'active', $4, $4, $4)
    `;

    const now = new Date().toISOString();
    await this.db.query(memberQuery, [randomUUID(), workspaceId, ownerId, now]);
  }

  private hasWorkspaceAccess(
    visibility: string,
    userRole: string,
    memberStatus: string
  ): boolean {
    if (visibility === 'public') return true;
    if (userRole === 'none') return false;
    return memberStatus === 'active';
  }

  private async checkWorkspacePermission(
    workspaceId: string,
    userId: string,
    tenantId: string,
    permission: string
  ): Promise<void> {
    const query = `
      SELECT wm.role, wm.permissions, w.owner_id
      FROM workspace_members wm
      JOIN collaborative_workspaces w ON wm.workspace_id = w.id
      WHERE wm.workspace_id = $1 AND wm.user_id = $2 AND w.tenant_id = $3 AND wm.status = 'active'
    `;

    const result = await this.db.query(query, [workspaceId, userId, tenantId]);

    if (result.rows.length === 0) {
      throw this.createWorkspaceError('WORKSPACE_ACCESS_DENIED', 'Access denied to workspace');
    }

    const row = result.rows[0];
    
    // Owners have all permissions
    if (row.owner_id === userId) {
      return;
    }

    // Check role-based permissions
    const role = row.role;
    const permissions = row.permissions || {};

    if (role === 'admin') {
      return; // Admins have most permissions
    }

    // Check specific permission
    if (permissions[permission] === true) {
      return;
    }

    // Check default role permissions
    if (this.hasRolePermission(role, permission)) {
      return;
    }

    throw this.createWorkspaceError('WORKSPACE_ACCESS_DENIED', `Permission denied: ${permission}`);
  }

  private hasRolePermission(role: string, permission: string): boolean {
    const rolePermissions = {
      owner: [
        'canInviteMembers', 'canRemoveMembers', 'canEditSettings', 'canManageResources',
        'canCreateContent', 'canDeleteContent', 'canManageIntegrations', 'canViewAnalytics', 'canExportData'
      ],
      admin: [
        'canInviteMembers', 'canRemoveMembers', 'canManageResources',
        'canCreateContent', 'canDeleteContent', 'canViewAnalytics'
      ],
      member: ['canCreateContent', 'canManageResources'],
      viewer: [],
    };

    return rolePermissions[role as keyof typeof rolePermissions]?.includes(permission) || false;
  }

  private mapDatabaseRowToWorkspace(row: any): CollaborativeWorkspace {
    // Sanitize and validate row data to prevent data leakage
    if (!row || !row.id) {
      throw this.createWorkspaceError('INVALID_ROW_DATA', 'Invalid workspace data received from database');
    }

    return {
      id: row.id,
      name: sanitizeInput(row.name || ''),
      description: sanitizeInput(row.description || ''),
      tenantId: row.tenant_id,
      ownerId: row.owner_id,
      templateId: row.template_id,
      status: row.status,
      settings: this.sanitizeJsonField(row.settings),
      metadata: this.sanitizeJsonField(row.metadata),
      visibility: row.visibility,
      maxMembers: parseInt(row.max_members) || 100,
      currentMembers: parseInt(row.current_members) || 0,
      createdAt: row.created_at?.toISOString() || new Date().toISOString(),
      updatedAt: row.updated_at?.toISOString() || new Date().toISOString(),
      deletedAt: row.deleted_at?.toISOString(),
    };
  }

  private mapDatabaseRowToWorkspaceWithStats(row: any): WorkspaceWithStats {
    const workspace = this.mapDatabaseRowToWorkspace(row);
    return {
      ...workspace,
      memberCount: parseInt(row.member_count) || 0,
      activeMembers: parseInt(row.active_members) || 0,
      resourceCount: parseInt(row.resource_count) || 0,
      activityCount: parseInt(row.activity_count) || 0,
      integrationCount: parseInt(row.integration_count) || 0,
    };
  }

  /**
   * Sanitize JSONB field data to prevent injection and data corruption
   */
  private sanitizeJsonField(field: any): any {
    if (!field) {
      return {};
    }
    
    try {
      // If it's already an object, validate it doesn't contain dangerous patterns
      const data = typeof field === 'string' ? JSON.parse(field) : field;
      
      // Remove any potentially dangerous keys or values
      if (typeof data === 'object' && data !== null) {
        const sanitized: any = {};
        for (const [key, value] of Object.entries(data)) {
          // Skip keys that could be dangerous
          if (typeof key === 'string' && key.length > 0 && key.length < 100) {
            const sanitizedKey = sanitizeInput(key);
            if (sanitizedKey) {
              // Recursively sanitize nested objects, but limit depth
              sanitized[sanitizedKey] = this.sanitizeValue(value, 3);
            }
          }
        }
        return sanitized;
      }
      
      return {};
    } catch (error) {
      this.logger.warn('Failed to parse JSON field, returning empty object', { field, error });
      return {};
    }
  }

  /**
   * Sanitize individual values recursively with depth limit
   */
  private sanitizeValue(value: any, maxDepth: number): any {
    if (maxDepth <= 0) {
      return null;
    }

    if (value === null || value === undefined) {
      return value;
    }

    if (typeof value === 'string') {
      return sanitizeInput(value);
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return value;
    }

    if (Array.isArray(value)) {
      return value.slice(0, 100).map(item => this.sanitizeValue(item, maxDepth - 1));
    }

    if (typeof value === 'object') {
      const sanitized: any = {};
      let count = 0;
      for (const [key, val] of Object.entries(value)) {
        if (count++ >= 50) break; // Limit object size
        const sanitizedKey = sanitizeInput(key);
        if (sanitizedKey) {
          sanitized[sanitizedKey] = this.sanitizeValue(val, maxDepth - 1);
        }
      }
      return sanitized;
    }

    return null; // Unknown type, reject
  }

  private createWorkspaceError(code: string, message: string, details?: any): WorkspaceError {
    // Sanitize error details to prevent information leakage
    const sanitizedDetails = details ? this.sanitizeValue(details, 2) : undefined;
    
    const error = new Error(message) as any;
    error.code = code;
    error.details = sanitizedDetails;
    return error;
  }
}