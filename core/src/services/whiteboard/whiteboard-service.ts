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
import { sanitizeInput, escapeLikePattern, createSafeSearchPattern } from '../../utils/sql-security.js';

// Input sanitization and LIKE escaping utilities are now imported from shared utils

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
      const safeSearch = createSafeSearchPattern(filters.search);
      if (safeSearch.escapedTerm.length > 0) {
        // Use safe search pattern with proper escaping
        conditions.push(`(w.name ILIKE $${paramIndex} ESCAPE '\\' OR w.description ILIKE $${paramIndex + 1} ESCAPE '\\')`);
        values.push(safeSearch.pattern, safeSearch.pattern);
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

  private async applyTemplate(
    whiteboardId: string, 
    templateId: string, 
    userId: string,
    options?: {
      position?: { x: number; y: number };
      scale?: number;
      replaceContent?: boolean;
    }
  ): Promise<{
    success: boolean;
    elementsCreated: string[];
    errors?: string[];
  }> {
    const errors: string[] = [];
    const elementsCreated: string[] = [];
    let rollbackOperations: (() => Promise<void>)[] = [];

    try {
      this.logger.info('Starting template application', { whiteboardId, templateId, userId, options });

      // 1. Validate user permissions to edit the whiteboard
      const whiteboardQuery = `
        SELECT w.id, w.workspace_id, w.name, w.canvas_data, w.version, w.created_by, w.visibility
        FROM whiteboards w
        WHERE w.id = $1 AND w.deleted_at IS NULL
      `;
      
      const whiteboardResult = await this.db.query(whiteboardQuery, [whiteboardId]);
      
      if (whiteboardResult.rows.length === 0) {
        throw this.createWhiteboardError('WHITEBOARD_NOT_FOUND', 'Whiteboard not found');
      }
      
      const whiteboard = whiteboardResult.rows[0];

      const hasEditPermission = await this.hasUserEditPermission(whiteboardId, userId);
      if (!hasEditPermission) {
        throw this.createWhiteboardError('PERMISSION_DENIED', 'User does not have edit permissions for this whiteboard');
      }

      // 2. Get template data from WhiteboardTemplateService
      const templateService = new (await import('./whiteboard-template-service.js')).WhiteboardTemplateService(this.db, this.logger);
      const template = await templateService.getTemplate(templateId, userId, whiteboard.workspaceId);
      
      if (!template) {
        throw this.createWhiteboardError('TEMPLATE_NOT_FOUND', 'Template not found or access denied');
      }

      if (!template.templateData || !template.templateData.defaultElements) {
        throw this.createWhiteboardError('INVALID_TEMPLATE', 'Template has no elements to apply');
      }

      this.logger.debug('Retrieved template data', { 
        templateId, 
        elementCount: template.templateData.defaultElements.length,
        hasCanvasData: !!template.templateData.canvasData
      });

      // 3. Replace content if requested
      if (options?.replaceContent) {
        const deleteQuery = `
          UPDATE whiteboard_elements 
          SET deleted_at = $1, last_modified_by = $2, updated_at = $1
          WHERE whiteboard_id = $3 AND deleted_at IS NULL
        `;
        
        await this.db.query(deleteQuery, [new Date().toISOString(), userId, whiteboardId]);
        this.logger.debug('Cleared existing whiteboard content');
      }

      // 4. Apply canvas settings if present
      if (template.templateData.canvasData && Object.keys(template.templateData.canvasData).length > 0) {
        const currentCanvasData = whiteboard.canvas_data ? 
          JSON.parse(whiteboard.canvas_data) : {};
        const mergedCanvasData = {
          ...currentCanvasData,
          ...template.templateData.canvasData
        };

        const updateCanvasQuery = `
          UPDATE whiteboards 
          SET canvas_data = $1, updated_at = $2, last_modified_by = $3, version = version + 1
          WHERE id = $4
        `;

        await this.db.query(updateCanvasQuery, [
          JSON.stringify(mergedCanvasData),
          new Date().toISOString(),
          userId,
          whiteboardId
        ]);

        this.logger.debug('Applied template canvas settings');
      }

      // 5. Create transform context for OT operations
      const transformContext = {
        canvasVersion: whiteboard.version + 1,
        pendingOperations: [],
        elementStates: new Map(),
        currentVectorClock: { [userId]: 0 },
        lamportClock: Date.now(),
        userId,
        userRole: 'editor',
        permissions: {
          canCreate: true,
          canEdit: hasEditPermission,
          canDelete: hasEditPermission,
        },
        operationStartTime: Date.now(),
        maxProcessingTime: 30000, // 30 second timeout
      };

      // 6. Transform and create elements with proper positioning
      const positionOffset = options?.position || { x: 0, y: 0 };
      const scale = options?.scale || 1;
      const now = new Date().toISOString();

      for (let i = 0; i < template.templateData.defaultElements.length; i++) {
        const templateElement = template.templateData.defaultElements[i];
        
        try {
          // Generate new UUID for the element
          const newElementId = randomUUID();
          elementsCreated.push(newElementId);

          // Transform element data with positioning
          const transformedElementData = this.transformTemplateElementData(
            templateElement.elementData, 
            positionOffset, 
            scale
          );

          // Create OT operation for element creation
          const { createOperation } = await import('@shared/whiteboard-ot.js');
          
          const operation = createOperation(
            'create',
            newElementId,
            userId,
            transformContext,
            {
              elementType: templateElement.elementType,
              data: transformedElementData,
              position: transformedElementData.position,
              bounds: transformedElementData.bounds,
              style: templateElement.styleData,
              zIndex: templateElement.layerIndex + i, // Maintain relative ordering
            }
          );

          // Validate the operation
          const { validateAndSanitizeOperation } = await import('@shared/whiteboard-ot.js');
          const { operation: validatedOperation, errors: validationErrors } = validateAndSanitizeOperation(
            operation,
            transformContext
          );

          if (!validatedOperation || validationErrors.length > 0) {
            errors.push(`Failed to validate element ${i + 1}: ${validationErrors.join(', ')}`);
            continue;
          }

          // Insert element into database
          const elementQuery = `
            INSERT INTO whiteboard_elements (
              id, whiteboard_id, element_type, element_data, layer_index, 
              parent_id, locked, visible, style_data, metadata, version,
              created_by, last_modified_by, created_at, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
          `;

          await this.db.query(elementQuery, [
            newElementId,
            whiteboardId,
            templateElement.elementType,
            JSON.stringify(transformedElementData),
            templateElement.layerIndex + i,
            templateElement.parentId || null,
            false, // Not locked by default
            true,  // Visible by default
            JSON.stringify(templateElement.styleData || {}),
            JSON.stringify({}), // Empty metadata
            1, // Initial version
            userId,
            userId,
            now,
            now
          ]);

          // Add rollback operation
          rollbackOperations.push(async () => {
            await this.db.query(`DELETE FROM whiteboard_elements WHERE id = $1`, [newElementId]);
          });

          // Update transform context
          const { updateTransformContext } = await import('@shared/whiteboard-ot.js');
          Object.assign(transformContext, updateTransformContext(transformContext, validatedOperation));

          this.logger.debug('Created template element', { 
            elementId: newElementId, 
            type: templateElement.elementType,
            position: transformedElementData.position
          });

        } catch (elementError) {
          this.logger.error('Failed to create template element', { 
            error: elementError, 
            elementIndex: i,
            elementType: templateElement.elementType 
          });
          errors.push(`Failed to create element ${i + 1}: ${elementError instanceof Error ? elementError.message : 'Unknown error'}`);
        }
      }

      // 7. Update template usage statistics
      try {
        await templateService.applyTemplate(templateId, whiteboardId, userId, whiteboard.workspaceId);
      } catch (usageError) {
        this.logger.warn('Failed to update template usage statistics', { 
          error: usageError,
          templateId,
          whiteboardId 
        });
        // Don't fail the main operation for usage tracking errors
      }

      // 8. Log activity
      try {
        const activityId = randomUUID();
        const activityQuery = `
          INSERT INTO whiteboard_activity_log (
            id, whiteboard_id, user_id, action, target_type, target_id,
            action_data, created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `;

        await this.db.query(activityQuery, [
          activityId,
          whiteboardId,
          userId,
          'template_applied',
          'template',
          templateId,
          JSON.stringify({
            templateName: template.name,
            elementsCreated: elementsCreated.length,
            errors: errors.length,
          }),
          new Date().toISOString(),
        ]);
      } catch (logError) {
        this.logger.warn('Failed to log template application activity', { error: logError });
      }

      // 9. Broadcast real-time updates to connected users
      try {
        await this.broadcastTemplateApplied(whiteboardId, userId, {
          templateId,
          templateName: template.name,
          elementsCreated,
          errors,
        });
      } catch (broadcastError) {
        this.logger.warn('Failed to broadcast template application', { error: broadcastError });
      }

      // 10. Return results
      const success = elementsCreated.length > 0;
      
      this.logger.info('Template application completed', { 
        whiteboardId, 
        templateId, 
        userId,
        success,
        elementsCreated: elementsCreated.length,
        errors: errors.length 
      });

      return {
        success,
        elementsCreated,
        errors: errors.length > 0 ? errors : undefined,
      };

    } catch (error) {
      this.logger.error('Template application failed', { 
        error, 
        whiteboardId, 
        templateId, 
        userId,
        elementsCreated: elementsCreated.length
      });

      // Rollback created elements on failure
      if (rollbackOperations.length > 0) {
        this.logger.info('Rolling back template application', { operationCount: rollbackOperations.length });
        
        for (const rollback of rollbackOperations.reverse()) {
          try {
            await rollback();
          } catch (rollbackError) {
            this.logger.error('Rollback operation failed', { error: rollbackError });
          }
        }
      }

      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred during template application';
      return {
        success: false,
        elementsCreated: [],
        errors: [errorMessage, ...errors],
      };
    }
  }

  /**
   * Transform template element data with positioning and scaling
   */
  private transformTemplateElementData(
    elementData: any, 
    positionOffset: { x: number; y: number }, 
    scale: number
  ): any {
    const transformedData = JSON.parse(JSON.stringify(elementData)); // Deep copy
    
    // Transform position if present
    if (transformedData.position) {
      transformedData.position.x = (transformedData.position.x * scale) + positionOffset.x;
      transformedData.position.y = (transformedData.position.y * scale) + positionOffset.y;
    }
    
    // Transform bounds if present
    if (transformedData.bounds) {
      transformedData.bounds.x = (transformedData.bounds.x * scale) + positionOffset.x;
      transformedData.bounds.y = (transformedData.bounds.y * scale) + positionOffset.y;
      transformedData.bounds.width *= scale;
      transformedData.bounds.height *= scale;
    }
    
    // Transform size if present
    if (transformedData.size) {
      transformedData.size.width *= scale;
      transformedData.size.height *= scale;
    }
    
    // Transform line element points
    if (transformedData.start && transformedData.end) {
      transformedData.start.x = (transformedData.start.x * scale) + positionOffset.x;
      transformedData.start.y = (transformedData.start.y * scale) + positionOffset.y;
      transformedData.end.x = (transformedData.end.x * scale) + positionOffset.x;
      transformedData.end.y = (transformedData.end.y * scale) + positionOffset.y;
    }
    
    // Transform freehand points
    if (Array.isArray(transformedData.points)) {
      transformedData.points = transformedData.points.map((point: any) => ({
        x: (point.x * scale) + positionOffset.x,
        y: (point.y * scale) + positionOffset.y,
      }));
    }
    
    // Transform control points for curves
    if (Array.isArray(transformedData.controlPoints)) {
      transformedData.controlPoints = transformedData.controlPoints.map((point: any) => ({
        x: (point.x * scale) + positionOffset.x,
        y: (point.y * scale) + positionOffset.y,
      }));
    }
    
    return transformedData;
  }

  /**
   * Check if user has edit permissions for the whiteboard
   */
  private async hasUserEditPermission(whiteboardId: string, userId: string): Promise<boolean> {
    try {
      const query = `
        SELECT wp.can_edit, wp.element_permissions
        FROM whiteboard_permissions wp
        WHERE wp.whiteboard_id = $1 AND wp.user_id = $2
      `;
      
      const result = await this.db.query(query, [whiteboardId, userId]);
      
      if (result.rows.length > 0) {
        const permissions = result.rows[0];
        return permissions.can_edit && 
               (!permissions.element_permissions || 
                permissions.element_permissions.canCreateElements !== false);
      }
      
      // Fallback: check if user is the creator or has workspace access
      const whiteboardQuery = `
        SELECT w.created_by, w.workspace_id, w.visibility
        FROM whiteboards w
        WHERE w.id = $1
      `;
      
      const whiteboardResult = await this.db.query(whiteboardQuery, [whiteboardId]);
      
      if (whiteboardResult.rows.length === 0) {
        return false;
      }
      
      const whiteboard = whiteboardResult.rows[0];
      
      // Owner always has edit permissions
      if (whiteboard.created_by === userId) {
        return true;
      }
      
      // Check workspace membership for workspace visibility
      if (whiteboard.visibility === 'workspace' && whiteboard.workspace_id) {
        const memberQuery = `
          SELECT wm.role
          FROM workspace_members wm
          WHERE wm.workspace_id = $1 AND wm.user_id = $2 AND wm.status = 'active'
        `;
        
        const memberResult = await this.db.query(memberQuery, [whiteboard.workspace_id, userId]);
        
        if (memberResult.rows.length > 0) {
          const role = memberResult.rows[0].role;
          return role === 'owner' || role === 'admin' || role === 'editor';
        }
      }
      
      // Public whiteboards allow editing by default (can be restricted by explicit permissions)
      return whiteboard.visibility === 'public';
      
    } catch (error) {
      this.logger.error('Failed to check user edit permissions', { error, whiteboardId, userId });
      return false;
    }
  }

  /**
   * Broadcast template application to connected users via WebSocket
   */
  private async broadcastTemplateApplied(
    whiteboardId: string, 
    userId: string, 
    data: {
      templateId: string;
      templateName: string;
      elementsCreated: string[];
      errors: string[];
    }
  ): Promise<void> {
    try {
      // WebSocket broadcasting would be handled by the gateway service
      // The activity log entry will be picked up by the gateway for real-time updates
      this.logger.info('Template application broadcast intent', {
        whiteboardId,
        userId,
        templateId: data.templateId,
        templateName: data.templateName,
        elementCount: data.elementsCreated.length,
        errorCount: data.errors.length,
        type: 'template_applied'
      });
    } catch (error) {
      this.logger.warn('Failed to broadcast template application', { 
        error, 
        whiteboardId,
        userId 
      });
      // Don't throw - broadcasting errors shouldn't fail the main operation
    }
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