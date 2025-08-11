import { DatabasePool } from '../../utils/database-pool.js';
import { Logger } from '../../utils/logger.js';
import {
  Whiteboard,
  WhiteboardWithStats,
  WhiteboardWithElements,
  CreateWhiteboardRequest,
  UpdateWhiteboardRequest,
  WhiteboardFilter,
  WhiteboardSort,
  PaginatedWhiteboards,
  WhiteboardAnalytics,
  WhiteboardError,
  WhiteboardStatus,
  WhiteboardVisibility,
  WhiteboardSettings,
  WhiteboardCanvasData,
  WhiteboardVersion,
  WhiteboardChangeType,
} from '@shared/types/whiteboard.js';
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
const buildSafeWhereClause = (filters: WhiteboardFilter | undefined, baseValues: any[]) => {
  const conditions: string[] = [];
  const values: any[] = [...baseValues];
  let paramIndex = baseValues.length + 1;

  if (filters) {
    if (filters.status && Array.isArray(filters.status) && filters.status.length > 0) {
      // Validate status values against allowed enum
      const validStatuses = ['active', 'archived', 'deleted'];
      const sanitizedStatuses = filters.status.filter(s => validStatuses.includes(s));
      if (sanitizedStatuses.length > 0) {
        conditions.push(`w.status = ANY($${paramIndex++})`);
        values.push(sanitizedStatuses);
      }
    }

    if (filters.visibility && Array.isArray(filters.visibility) && filters.visibility.length > 0) {
      // Validate visibility values against allowed enum
      const validVisibilities = ['workspace', 'members', 'public'];
      const sanitizedVisibilities = filters.visibility.filter(v => validVisibilities.includes(v));
      if (sanitizedVisibilities.length > 0) {
        conditions.push(`w.visibility = ANY($${paramIndex++})`);
        values.push(sanitizedVisibilities);
      }
    }

    if (filters.createdBy) {
      conditions.push(`w.created_by = $${paramIndex++}`);
      values.push(filters.createdBy);
    }

    if (filters.templateId) {
      conditions.push(`w.template_id = $${paramIndex++}`);
      values.push(filters.templateId);
    }

    if (filters.hasElements !== undefined) {
      if (filters.hasElements) {
        conditions.push(`(SELECT COUNT(*) FROM whiteboard_elements we WHERE we.whiteboard_id = w.id AND we.deleted_at IS NULL) > 0`);
      } else {
        conditions.push(`(SELECT COUNT(*) FROM whiteboard_elements we WHERE we.whiteboard_id = w.id AND we.deleted_at IS NULL) = 0`);
      }
    }

    if (filters.hasComments !== undefined) {
      if (filters.hasComments) {
        conditions.push(`(SELECT COUNT(*) FROM whiteboard_comments wc WHERE wc.whiteboard_id = w.id AND wc.deleted_at IS NULL) > 0`);
      } else {
        conditions.push(`(SELECT COUNT(*) FROM whiteboard_comments wc WHERE wc.whiteboard_id = w.id AND wc.deleted_at IS NULL) = 0`);
      }
    }

    if (filters.isCollaborating !== undefined) {
      if (filters.isCollaborating) {
        conditions.push(`(SELECT COUNT(*) FROM whiteboard_sessions ws WHERE ws.whiteboard_id = w.id AND ws.is_active = true) > 1`);
      } else {
        conditions.push(`(SELECT COUNT(*) FROM whiteboard_sessions ws WHERE ws.whiteboard_id = w.id AND ws.is_active = true) <= 1`);
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
      const date = new Date(filters.createdAfter);
      if (!isNaN(date.getTime())) {
        conditions.push(`w.created_at >= $${paramIndex++}`);
        values.push(filters.createdAfter);
      }
    }

    if (filters.createdBefore) {
      const date = new Date(filters.createdBefore);
      if (!isNaN(date.getTime())) {
        conditions.push(`w.created_at <= $${paramIndex++}`);
        values.push(filters.createdBefore);
      }
    }

    if (filters.updatedAfter) {
      const date = new Date(filters.updatedAfter);
      if (!isNaN(date.getTime())) {
        conditions.push(`w.updated_at >= $${paramIndex++}`);
        values.push(filters.updatedAfter);
      }
    }

    if (filters.updatedBefore) {
      const date = new Date(filters.updatedBefore);
      if (!isNaN(date.getTime())) {
        conditions.push(`w.updated_at <= $${paramIndex++}`);
        values.push(filters.updatedBefore);
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
const buildSafeOrderClause = (sort: WhiteboardSort | undefined): string => {
  if (!sort) {
    return 'ORDER BY w.updated_at DESC';
  }

  const validFields = ['name', 'createdAt', 'updatedAt', 'elementCount', 'collaboratorCount'];
  const validDirections = ['asc', 'desc'];
  
  const field = validFields.includes(sort.field) ? sort.field : 'updatedAt';
  const direction = validDirections.includes(sort.direction || 'desc') ? sort.direction : 'desc';
  
  switch (field) {
    case 'name':
      return `ORDER BY w.name ${direction}`;
    case 'createdAt':
      return `ORDER BY w.created_at ${direction}`;
    case 'elementCount':
      return `ORDER BY element_count ${direction}`;
    case 'collaboratorCount':
      return `ORDER BY collaborator_count ${direction}`;
    default:
      return `ORDER BY w.updated_at ${direction}`;
  }
};

/**
 * Core whiteboard management service
 * Handles CRUD operations, analytics, and whiteboard lifecycle management
 */
export class WhiteboardService {
  private logger: Logger;

  constructor(
    private db: DatabasePool,
    logger?: Logger
  ) {
    this.logger = logger || new Logger('WhiteboardService');
  }

  /**
   * Create a new whiteboard
   */
  async createWhiteboard(
    workspaceId: string,
    userId: string,
    request: CreateWhiteboardRequest
  ): Promise<Whiteboard> {
    try {
      const whiteboardId = randomUUID();
      const now = new Date().toISOString();

      // Validate workspace access
      await this.validateWorkspaceAccess(workspaceId, userId);

      // Create whiteboard with default settings
      const whiteboard: Whiteboard = {
        id: whiteboardId,
        workspaceId,
        name: request.name,
        description: request.description,
        thumbnail: undefined,
        canvasData: request.canvasData || {},
        settings: request.settings || {},
        templateId: request.templateId,
        isTemplate: false,
        visibility: request.visibility || 'workspace',
        status: 'active' as WhiteboardStatus,
        version: 1,
        createdBy: userId,
        lastModifiedBy: userId,
        createdAt: now,
        updatedAt: now,
      };

      const query = `
        INSERT INTO whiteboards (
          id, workspace_id, name, description, canvas_data, settings,
          template_id, is_template, visibility, status, version,
          created_by, last_modified_by, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        RETURNING *
      `;

      const result = await this.db.query(query, [
        whiteboard.id,
        whiteboard.workspaceId,
        whiteboard.name,
        whiteboard.description,
        JSON.stringify(whiteboard.canvasData),
        JSON.stringify(whiteboard.settings),
        whiteboard.templateId,
        whiteboard.isTemplate,
        whiteboard.visibility,
        whiteboard.status,
        whiteboard.version,
        whiteboard.createdBy,
        whiteboard.lastModifiedBy,
        whiteboard.createdAt,
        whiteboard.updatedAt,
      ]);

      if (result.rows.length === 0) {
        throw new Error('Failed to create whiteboard');
      }

      // Apply template if specified
      if (request.templateId) {
        await this.applyTemplate(whiteboardId, request.templateId, userId);
      }

      // Create initial version
      await this.createVersion(whiteboardId, userId, 'major', 'Initial whiteboard creation');

      this.logger.info('Whiteboard created successfully', { whiteboardId, workspaceId, userId });
      
      return this.mapDatabaseRowToWhiteboard(result.rows[0]);
    } catch (error) {
      this.logger.error('Failed to create whiteboard', { error, request });
      throw error;
    }
  }

  /**
   * Get whiteboard by ID with permission check
   */
  async getWhiteboard(
    whiteboardId: string,
    userId: string
  ): Promise<Whiteboard | null> {
    try {
      const query = `
        SELECT w.*, 
               COALESCE(wp.role, 'none') as user_role,
               CASE WHEN wp.id IS NOT NULL THEN true ELSE false END as has_permission
        FROM whiteboards w
        LEFT JOIN whiteboard_permissions wp ON w.id = wp.whiteboard_id AND wp.user_id = $2
        WHERE w.id = $1 AND w.deleted_at IS NULL
      `;

      const result = await this.db.query(query, [whiteboardId, userId]);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      
      // Check access permissions
      if (!this.hasWhiteboardAccess(row.visibility, row.user_role, row.has_permission, row.created_by, userId)) {
        throw this.createWhiteboardError('WHITEBOARD_ACCESS_DENIED', 'Access denied to whiteboard');
      }

      return this.mapDatabaseRowToWhiteboard(row);
    } catch (error) {
      this.logger.error('Failed to get whiteboard', { error, whiteboardId, userId });
      throw error;
    }
  }

  /**
   * Get whiteboard with elements
   */
  async getWhiteboardWithElements(
    whiteboardId: string,
    userId: string
  ): Promise<WhiteboardWithElements | null> {
    try {
      const whiteboard = await this.getWhiteboard(whiteboardId, userId);
      if (!whiteboard) {
        return null;
      }

      // Get elements
      const elementsQuery = `
        SELECT * FROM whiteboard_elements
        WHERE whiteboard_id = $1 AND deleted_at IS NULL
        ORDER BY layer_index ASC, created_at ASC
      `;

      const elementsResult = await this.db.query(elementsQuery, [whiteboardId]);

      // Get active sessions count
      const sessionsQuery = `
        SELECT COUNT(*) as count FROM whiteboard_sessions
        WHERE whiteboard_id = $1 AND is_active = true
      `;

      const sessionsResult = await this.db.query(sessionsQuery, [whiteboardId]);
      const activeSessions = parseInt(sessionsResult.rows[0]?.count || '0');

      // Get user permissions
      const permissionsQuery = `
        SELECT permissions FROM whiteboard_permissions
        WHERE whiteboard_id = $1 AND user_id = $2
      `;

      const permissionsResult = await this.db.query(permissionsQuery, [whiteboardId, userId]);
      const permissions = permissionsResult.rows[0]?.permissions || {};

      return {
        ...whiteboard,
        elements: elementsResult.rows.map(row => this.mapDatabaseRowToElement(row)),
        activeSessions,
        permissions: this.sanitizeJsonField(permissions),
      };
    } catch (error) {
      this.logger.error('Failed to get whiteboard with elements', { error, whiteboardId, userId });
      throw error;
    }
  }

  /**
   * Update whiteboard
   */
  async updateWhiteboard(
    whiteboardId: string,
    userId: string,
    request: UpdateWhiteboardRequest
  ): Promise<Whiteboard> {
    try {
      // Check permissions
      await this.checkWhiteboardPermission(whiteboardId, userId, 'canEdit');

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

      if (request.canvasData !== undefined) {
        updates.push(`canvas_data = $${valueIndex++}`);
        values.push(JSON.stringify(request.canvasData));
      }

      updates.push(`last_modified_by = $${valueIndex++}`);
      values.push(userId);

      updates.push(`updated_at = $${valueIndex++}`);
      values.push(new Date().toISOString());

      updates.push(`version = version + 1`);

      values.push(whiteboardId);

      const query = `
        UPDATE whiteboards
        SET ${updates.join(', ')}
        WHERE id = $${valueIndex++} AND deleted_at IS NULL
        RETURNING *
      `;

      const result = await this.db.query(query, values);

      if (result.rows.length === 0) {
        throw this.createWhiteboardError('WHITEBOARD_NOT_FOUND', 'Whiteboard not found');
      }

      // Create version snapshot for major updates
      if (request.name || request.settings || request.canvasData) {
        await this.createVersion(whiteboardId, userId, 'minor', 'Whiteboard updated');
      }

      this.logger.info('Whiteboard updated successfully', { whiteboardId, userId });

      return this.mapDatabaseRowToWhiteboard(result.rows[0]);
    } catch (error) {
      this.logger.error('Failed to update whiteboard', { error, whiteboardId, userId });
      throw error;
    }
  }

  /**
   * Delete whiteboard (soft delete)
   */
  async deleteWhiteboard(
    whiteboardId: string,
    userId: string
  ): Promise<void> {
    try {
      // Check permissions - only owner or admin can delete
      await this.checkWhiteboardPermission(whiteboardId, userId, 'canDelete');

      const query = `
        UPDATE whiteboards
        SET deleted_at = $1, updated_at = $1, last_modified_by = $2
        WHERE id = $3 AND deleted_at IS NULL
      `;

      const result = await this.db.query(query, [new Date().toISOString(), userId, whiteboardId]);

      if (result.rowCount === 0) {
        throw this.createWhiteboardError('WHITEBOARD_NOT_FOUND', 'Whiteboard not found');
      }

      this.logger.info('Whiteboard deleted successfully', { whiteboardId, userId });
    } catch (error) {
      this.logger.error('Failed to delete whiteboard', { error, whiteboardId, userId });
      throw error;
    }
  }

  /**
   * Get whiteboards with stats
   */
  async getWhiteboardsWithStats(
    workspaceId: string,
    userId: string,
    filters?: WhiteboardFilter,
    sort?: WhiteboardSort,
    limit: number = 20,
    offset: number = 0
  ): Promise<PaginatedWhiteboards> {
    try {
      // Validate input parameters
      if (!workspaceId || !userId) {
        throw this.createWhiteboardError('INVALID_PARAMETERS', 'Workspace ID and user ID are required');
      }
      
      // Validate and sanitize pagination parameters
      const sanitizedLimit = Math.min(Math.max(1, limit), 100);
      const sanitizedOffset = Math.max(0, offset);

      // Build base WHERE clause with workspace filter
      let baseWhereClause = 'WHERE w.workspace_id = $1 AND w.deleted_at IS NULL';
      const baseValues = [workspaceId];
      
      // Build safe WHERE clause using parameterized queries
      const { whereClause: filterWhereClause, values: filterValues, nextParamIndex } = buildSafeWhereClause(filters, baseValues);
      
      // Combine WHERE clauses
      let fullWhereClause = baseWhereClause;
      if (filterWhereClause) {
        fullWhereClause += ` AND ${filterWhereClause}`;
      }
      
      // Add user access filter
      fullWhereClause += ` AND (w.visibility = 'workspace' OR wp.user_id = $${nextParamIndex} OR w.created_by = $${nextParamIndex})`;
      filterValues.push(userId);
      
      const finalParamIndex = nextParamIndex + 1;
      
      // Build safe ORDER BY clause
      const orderClause = buildSafeOrderClause(sort);

      // Optimized main query
      const query = `
        WITH whiteboard_stats AS (
          SELECT 
            w.id,
            COUNT(DISTINCT we.id) FILTER (WHERE we.deleted_at IS NULL) as element_count,
            COUNT(DISTINCT ws.id) FILTER (WHERE ws.is_active = true) as collaborator_count,
            COUNT(DISTINCT wc.id) FILTER (WHERE wc.deleted_at IS NULL) as comment_count,
            MAX(wal.created_at) as last_activity
          FROM whiteboards w
          LEFT JOIN whiteboard_elements we ON w.id = we.whiteboard_id
          LEFT JOIN whiteboard_sessions ws ON w.id = ws.whiteboard_id
          LEFT JOIN whiteboard_comments wc ON w.id = wc.whiteboard_id
          LEFT JOIN whiteboard_activity_log wal ON w.id = wal.whiteboard_id
          LEFT JOIN whiteboard_permissions wp ON w.id = wp.whiteboard_id
          ${fullWhereClause}
          GROUP BY w.id
        )
        SELECT w.*, 
               COALESCE(ws.element_count, 0) as element_count,
               COALESCE(ws.collaborator_count, 0) as collaborator_count,
               COALESCE(ws.comment_count, 0) as comment_count,
               ws.last_activity,
               CASE WHEN ws.collaborator_count > 1 THEN true ELSE false END as is_collaborating
        FROM whiteboards w
        LEFT JOIN whiteboard_permissions wp ON w.id = wp.whiteboard_id
        LEFT JOIN whiteboard_stats ws ON w.id = ws.id
        ${fullWhereClause}
        GROUP BY w.id, ws.element_count, ws.collaborator_count, ws.comment_count, ws.last_activity
        ${orderClause}
        LIMIT $${finalParamIndex} OFFSET $${finalParamIndex + 1}
      `;

      filterValues.push(sanitizedLimit, sanitizedOffset);

      // Get total count
      const countQuery = `
        SELECT COUNT(DISTINCT w.id) as total
        FROM whiteboards w
        LEFT JOIN whiteboard_permissions wp ON w.id = wp.whiteboard_id
        ${fullWhereClause}
      `;

      const countValues = filterValues.slice(0, -2); // Remove limit and offset for count

      const [dataResult, countResult] = await Promise.all([
        this.db.query(query, filterValues),
        this.db.query(countQuery, countValues)
      ]);

      const total = parseInt(countResult.rows[0]?.total || '0');
      const whiteboards = dataResult.rows.map(row => this.mapDatabaseRowToWhiteboardWithStats(row));

      return {
        items: whiteboards,
        total,
        limit: sanitizedLimit,
        offset: sanitizedOffset,
        hasMore: sanitizedOffset + sanitizedLimit < total,
      };
    } catch (error) {
      this.logger.error('Failed to get whiteboards with stats', { error, workspaceId, userId });
      throw error;
    }
  }

  /**
   * Create version snapshot
   */
  async createVersion(
    whiteboardId: string,
    userId: string,
    changeType: WhiteboardChangeType,
    commitMessage?: string
  ): Promise<WhiteboardVersion> {
    try {
      const versionId = randomUUID();
      const now = new Date().toISOString();

      // Get current whiteboard data
      const whiteboard = await this.getWhiteboardWithElements(whiteboardId, userId);
      if (!whiteboard) {
        throw this.createWhiteboardError('WHITEBOARD_NOT_FOUND', 'Whiteboard not found');
      }

      // Get next version number
      const versionQuery = `
        SELECT COALESCE(MAX(version_number), 0) + 1 as next_version
        FROM whiteboard_versions
        WHERE whiteboard_id = $1
      `;

      const versionResult = await this.db.query(versionQuery, [whiteboardId]);
      const nextVersion = parseInt(versionResult.rows[0]?.next_version || '1');

      // Create snapshot
      const snapshotData = {
        whiteboardData: whiteboard,
        elements: whiteboard.elements,
        metadata: {
          createdAt: now,
          elementCount: whiteboard.elements.length,
          canvasSize: whiteboard.canvasData.dimensions,
        },
      };

      const insertQuery = `
        INSERT INTO whiteboard_versions (
          id, whiteboard_id, version_number, snapshot_data, change_type,
          created_by, commit_message, is_automatic, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *
      `;

      const result = await this.db.query(insertQuery, [
        versionId,
        whiteboardId,
        nextVersion,
        JSON.stringify(snapshotData),
        changeType,
        userId,
        commitMessage,
        changeType === 'auto_save',
        now,
      ]);

      if (result.rows.length === 0) {
        throw new Error('Failed to create version');
      }

      this.logger.info('Version created successfully', { whiteboardId, versionId, userId });

      return this.mapDatabaseRowToVersion(result.rows[0]);
    } catch (error) {
      this.logger.error('Failed to create version', { error, whiteboardId, userId });
      throw error;
    }
  }

  // Private helper methods

  private async validateWorkspaceAccess(workspaceId: string, userId: string): Promise<void> {
    const query = `
      SELECT wm.role, wm.status
      FROM workspace_members wm
      JOIN collaborative_workspaces w ON wm.workspace_id = w.id
      WHERE wm.workspace_id = $1 AND wm.user_id = $2 AND w.deleted_at IS NULL AND wm.status = 'active'
    `;

    const result = await this.db.query(query, [workspaceId, userId]);

    if (result.rows.length === 0) {
      throw this.createWhiteboardError('WORKSPACE_ACCESS_DENIED', 'Access denied to workspace');
    }
  }

  private async applyTemplate(whiteboardId: string, templateId: string, userId: string): Promise<void> {
    // TODO: Implement template application
    this.logger.info('Applying template to whiteboard', { whiteboardId, templateId, userId });
  }

  private hasWhiteboardAccess(
    visibility: string,
    userRole: string,
    hasPermission: boolean,
    createdBy: string,
    userId: string
  ): boolean {
    if (visibility === 'public') return true;
    if (createdBy === userId) return true;
    if (userRole !== 'none' && hasPermission) return true;
    return false;
  }

  private async checkWhiteboardPermission(
    whiteboardId: string,
    userId: string,
    permission: string
  ): Promise<void> {
    const query = `
      SELECT wp.role, wp.permissions, w.created_by
      FROM whiteboard_permissions wp
      JOIN whiteboards w ON wp.whiteboard_id = w.id
      WHERE wp.whiteboard_id = $1 AND wp.user_id = $2 AND w.deleted_at IS NULL
    `;

    const result = await this.db.query(query, [whiteboardId, userId]);

    if (result.rows.length === 0) {
      // Check if user is the creator
      const creatorQuery = `SELECT created_by FROM whiteboards WHERE id = $1 AND deleted_at IS NULL`;
      const creatorResult = await this.db.query(creatorQuery, [whiteboardId]);
      
      if (creatorResult.rows.length === 0 || creatorResult.rows[0].created_by !== userId) {
        throw this.createWhiteboardError('WHITEBOARD_ACCESS_DENIED', 'Access denied to whiteboard');
      }
      return; // Creator has all permissions
    }

    const row = result.rows[0];
    
    // Check if user is creator (creators have all permissions)
    if (row.created_by === userId) {
      return;
    }

    // Check role-based permissions
    const role = row.role;
    const permissions = row.permissions || {};

    if (role === 'owner' || role === 'editor') {
      return; // Owners and editors have most permissions
    }

    // Check specific permission
    if (permissions[permission] === true) {
      return;
    }

    // Check default role permissions
    if (this.hasRolePermission(role, permission)) {
      return;
    }

    throw this.createWhiteboardError('WHITEBOARD_ACCESS_DENIED', `Permission denied: ${permission}`);
  }

  private hasRolePermission(role: string, permission: string): boolean {
    const rolePermissions = {
      owner: [
        'canEdit', 'canDelete', 'canComment', 'canShare', 'canManagePermissions',
        'canExport', 'canCreateTemplates', 'canViewHistory', 'canRestoreVersions'
      ],
      editor: [
        'canEdit', 'canComment', 'canShare', 'canExport', 'canViewHistory'
      ],
      commenter: ['canComment'],
      viewer: [],
    };

    return rolePermissions[role as keyof typeof rolePermissions]?.includes(permission) || false;
  }

  private mapDatabaseRowToWhiteboard(row: any): Whiteboard {
    if (!row || !row.id) {
      throw this.createWhiteboardError('INVALID_ROW_DATA', 'Invalid whiteboard data received from database');
    }

    return {
      id: row.id,
      workspaceId: row.workspace_id,
      name: sanitizeInput(row.name || ''),
      description: sanitizeInput(row.description || ''),
      thumbnail: row.thumbnail,
      canvasData: this.sanitizeJsonField(row.canvas_data),
      settings: this.sanitizeJsonField(row.settings),
      templateId: row.template_id,
      isTemplate: row.is_template || false,
      visibility: row.visibility,
      status: row.status,
      version: parseInt(row.version) || 1,
      createdBy: row.created_by,
      lastModifiedBy: row.last_modified_by,
      createdAt: row.created_at?.toISOString() || new Date().toISOString(),
      updatedAt: row.updated_at?.toISOString() || new Date().toISOString(),
      deletedAt: row.deleted_at?.toISOString(),
    };
  }

  private mapDatabaseRowToWhiteboardWithStats(row: any): WhiteboardWithStats {
    const whiteboard = this.mapDatabaseRowToWhiteboard(row);
    return {
      ...whiteboard,
      elementCount: parseInt(row.element_count) || 0,
      collaboratorCount: parseInt(row.collaborator_count) || 0,
      commentCount: parseInt(row.comment_count) || 0,
      lastActivity: row.last_activity?.toISOString(),
      isCollaborating: row.is_collaborating || false,
    };
  }

  private mapDatabaseRowToElement(row: any): any {
    if (!row || !row.id) {
      return null;
    }

    return {
      id: row.id,
      whiteboardId: row.whiteboard_id,
      elementType: row.element_type,
      elementData: this.sanitizeJsonField(row.element_data),
      layerIndex: parseInt(row.layer_index) || 0,
      parentId: row.parent_id,
      locked: row.locked || false,
      visible: row.visible !== false,
      styleData: this.sanitizeJsonField(row.style_data),
      metadata: this.sanitizeJsonField(row.metadata),
      version: parseInt(row.version) || 1,
      createdBy: row.created_by,
      lastModifiedBy: row.last_modified_by,
      createdAt: row.created_at?.toISOString() || new Date().toISOString(),
      updatedAt: row.updated_at?.toISOString() || new Date().toISOString(),
      deletedAt: row.deleted_at?.toISOString(),
    };
  }

  private mapDatabaseRowToVersion(row: any): WhiteboardVersion {
    if (!row || !row.id) {
      throw this.createWhiteboardError('INVALID_ROW_DATA', 'Invalid version data received from database');
    }

    return {
      id: row.id,
      whiteboardId: row.whiteboard_id,
      versionNumber: parseInt(row.version_number) || 1,
      snapshotData: this.sanitizeJsonField(row.snapshot_data),
      changesSummary: this.sanitizeJsonField(row.changes_summary),
      changeType: row.change_type,
      createdBy: row.created_by,
      commitMessage: row.commit_message,
      isAutomatic: row.is_automatic || false,
      createdAt: row.created_at?.toISOString() || new Date().toISOString(),
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
      const data = typeof field === 'string' ? JSON.parse(field) : field;
      
      if (typeof data === 'object' && data !== null) {
        const sanitized: any = {};
        for (const [key, value] of Object.entries(data)) {
          if (typeof key === 'string' && key.length > 0 && key.length < 100) {
            const sanitizedKey = sanitizeInput(key);
            if (sanitizedKey) {
              sanitized[sanitizedKey] = this.sanitizeValue(value, 5);
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
      return value.slice(0, 1000).map(item => this.sanitizeValue(item, maxDepth - 1));
    }

    if (typeof value === 'object') {
      const sanitized: any = {};
      let count = 0;
      for (const [key, val] of Object.entries(value)) {
        if (count++ >= 100) break; // Limit object size
        const sanitizedKey = sanitizeInput(key);
        if (sanitizedKey) {
          sanitized[sanitizedKey] = this.sanitizeValue(val, maxDepth - 1);
        }
      }
      return sanitized;
    }

    return null; // Unknown type, reject
  }

  private createWhiteboardError(code: string, message: string, details?: any): WhiteboardError {
    const sanitizedDetails = details ? this.sanitizeValue(details, 2) : undefined;
    
    const error = new Error(message) as any;
    error.code = code;
    error.details = sanitizedDetails;
    return error;
  }
}