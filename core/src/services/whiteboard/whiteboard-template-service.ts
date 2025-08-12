import { DatabasePool } from '../../utils/database-pool.js';
import { Logger } from '../../utils/logger.js';
import {
  WhiteboardTemplate,
  WhiteboardTemplateData,
  CreateTemplateRequest,
  PaginatedTemplates,
  WhiteboardError,
  WhiteboardActivityAction,
} from '@shared/types/whiteboard.js';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { sanitizeInput, escapeLikePattern, createSafeSearchPattern } from '../../utils/sql-security.js';

/**
 * Template filter for search and organization
 */
export const TemplateFilter = z.object({
  category: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  isPublic: z.boolean().optional(),
  workspaceId: z.string().uuid().optional(),
  createdBy: z.string().uuid().optional(),
  search: z.string().optional(),
  minRating: z.number().min(0).max(5).optional(),
  minUsage: z.number().min(0).optional(),
});
export type TemplateFilter = z.infer<typeof TemplateFilter>;

/**
 * Template sort options
 */
export const TemplateSort = z.object({
  field: z.enum(['name', 'createdAt', 'updatedAt', 'usageCount', 'rating', 'category']),
  direction: z.enum(['asc', 'desc']).default('desc'),
});
export type TemplateSort = z.infer<typeof TemplateSort>;

/**
 * Template categories enum
 */
export const TEMPLATE_CATEGORIES = [
  'Brainstorming',
  'Project Planning',
  'User Journey',
  'Wireframes',
  'Retrospectives',
  'Analysis',
  'Business Model',
  'Flowcharts',
  'Meeting Notes',
  'Design System',
  'Custom'
] as const;

/**
 * Update template request
 */
export const UpdateTemplateRequest = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  category: z.string().optional(),
  templateData: WhiteboardTemplateData.optional(),
  tags: z.array(z.string()).optional(),
  isPublic: z.boolean().optional(),
});
export type UpdateTemplateRequest = z.infer<typeof UpdateTemplateRequest>;

/**
 * Template usage tracking
 */
export const TemplateUsageEvent = z.object({
  templateId: z.string().uuid(),
  whiteboardId: z.string().uuid(),
  userId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  eventType: z.enum(['applied', 'viewed', 'searched', 'favorited']),
  metadata: z.record(z.string(), z.any()).default({}),
});
export type TemplateUsageEvent = z.infer<typeof TemplateUsageEvent>;

/**
 * Template analytics data
 */
export const TemplateAnalytics = z.object({
  templateId: z.string().uuid(),
  totalUsage: z.number().min(0),
  uniqueUsers: z.number().min(0),
  workspaceUsage: z.number().min(0),
  averageRating: z.number().min(0).max(5),
  ratingCount: z.number().min(0),
  period: z.object({
    start: z.string().datetime(),
    end: z.string().datetime(),
  }),
  usageTimeline: z.array(z.object({
    date: z.string().datetime(),
    count: z.number(),
  })),
  topWorkspaces: z.array(z.object({
    workspaceId: z.string().uuid(),
    workspaceName: z.string(),
    usageCount: z.number(),
  })),
});
export type TemplateAnalytics = z.infer<typeof TemplateAnalytics>;

/**
 * Build safe WHERE clause for template filtering
 */
const buildTemplateWhereClause = (filters: TemplateFilter | undefined, baseValues: any[]) => {
  const conditions: string[] = [];
  const values: any[] = [...baseValues];
  let paramIndex = baseValues.length + 1;

  if (filters) {
    if (filters.category && Array.isArray(filters.category) && filters.category.length > 0) {
      conditions.push(`wt.category = ANY($${paramIndex++})`);
      values.push(filters.category);
    }

    if (filters.tags && Array.isArray(filters.tags) && filters.tags.length > 0) {
      conditions.push(`wt.tags && $${paramIndex++}`);
      values.push(filters.tags);
    }

    if (filters.isPublic !== undefined) {
      conditions.push(`wt.is_public = $${paramIndex++}`);
      values.push(filters.isPublic);
    }

    if (filters.workspaceId) {
      if (filters.isPublic === false) {
        conditions.push(`wt.workspace_id = $${paramIndex++}`);
        values.push(filters.workspaceId);
      } else {
        conditions.push(`(wt.workspace_id = $${paramIndex++} OR wt.is_public = true)`);
        values.push(filters.workspaceId);
      }
    }

    if (filters.createdBy) {
      conditions.push(`wt.created_by = $${paramIndex++}`);
      values.push(filters.createdBy);
    }

    if (filters.minRating) {
      conditions.push(`wt.rating >= $${paramIndex++}`);
      values.push(filters.minRating);
    }

    if (filters.minUsage) {
      conditions.push(`wt.usage_count >= $${paramIndex++}`);
      values.push(filters.minUsage);
    }

    if (filters.search && typeof filters.search === 'string') {
      const safeSearch = createSafeSearchPattern(filters.search);
      if (safeSearch.escapedTerm.length > 0) {
        conditions.push(`(wt.name ILIKE $${paramIndex} ESCAPE '\\' OR wt.description ILIKE $${paramIndex + 1} ESCAPE '\\' OR EXISTS (SELECT 1 FROM unnest(wt.tags) tag WHERE tag ILIKE $${paramIndex + 2} ESCAPE '\\'))`);
        values.push(safeSearch.pattern, safeSearch.pattern, safeSearch.pattern);
        paramIndex += 3;
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
 * Build safe ORDER BY clause for templates
 */
const buildTemplateOrderClause = (sort: TemplateSort | undefined): string => {
  if (!sort) {
    return 'ORDER BY wt.rating DESC, wt.usage_count DESC, wt.updated_at DESC';
  }

  const validFields = ['name', 'createdAt', 'updatedAt', 'usageCount', 'rating', 'category'];
  const validDirections = ['asc', 'desc'];
  
  const field = validFields.includes(sort.field) ? sort.field : 'updatedAt';
  const direction = validDirections.includes(sort.direction || 'desc') ? sort.direction : 'desc';
  
  switch (field) {
    case 'name':
      return `ORDER BY wt.name ${direction}`;
    case 'createdAt':
      return `ORDER BY wt.created_at ${direction}`;
    case 'usageCount':
      return `ORDER BY wt.usage_count ${direction}`;
    case 'rating':
      return `ORDER BY wt.rating ${direction}`;
    case 'category':
      return `ORDER BY wt.category ${direction}`;
    default:
      return `ORDER BY wt.updated_at ${direction}`;
  }
};

/**
 * Comprehensive whiteboard template management service
 * Handles template CRUD operations, search, analytics, and usage tracking
 */
export class WhiteboardTemplateService {
  private logger: Logger;

  constructor(
    private db: DatabasePool,
    logger?: Logger
  ) {
    this.logger = logger || new Logger('WhiteboardTemplateService');
  }

  /**
   * Create a new template
   */
  async createTemplate(
    userId: string,
    request: CreateTemplateRequest,
    workspaceId?: string
  ): Promise<WhiteboardTemplate> {
    try {
      const templateId = randomUUID();
      const now = new Date().toISOString();

      // Validate category
      if (request.category && !TEMPLATE_CATEGORIES.includes(request.category as any)) {
        throw this.createTemplateError('VALIDATION_ERROR', 'Invalid template category');
      }

      // Validate workspace access if not public
      if (!request.isPublic && workspaceId) {
        await this.validateWorkspaceAccess(workspaceId, userId);
      }

      // Create template data
      const template: WhiteboardTemplate = {
        id: templateId,
        name: request.name,
        description: request.description,
        category: request.category || 'Custom',
        thumbnail: undefined,
        templateData: request.templateData || {
          canvasData: {},
          defaultElements: [],
          defaultSettings: {},
          placeholders: [],
        },
        defaultSettings: {},
        tags: request.tags || [],
        isPublic: request.isPublic || false,
        workspaceId: request.isPublic ? undefined : workspaceId,
        usageCount: 0,
        rating: undefined,
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      };

      const query = `
        INSERT INTO whiteboard_templates (
          id, name, description, category, template_data, default_settings,
          tags, is_public, workspace_id, usage_count, rating,
          created_by, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING *
      `;

      const result = await this.db.query(query, [
        template.id,
        template.name,
        template.description,
        template.category,
        JSON.stringify(template.templateData),
        JSON.stringify(template.defaultSettings),
        template.tags,
        template.isPublic,
        template.workspaceId,
        template.usageCount,
        template.rating,
        template.createdBy,
        template.createdAt,
        template.updatedAt,
      ]);

      if (result.rows.length === 0) {
        throw new Error('Failed to create template');
      }

      this.logger.info('Template created successfully', { templateId, userId, workspaceId });

      return this.mapDatabaseRowToTemplate(result.rows[0]);
    } catch (error) {
      this.logger.error('Failed to create template', { error, request });
      throw error;
    }
  }

  /**
   * Get template by ID with access validation
   */
  async getTemplate(
    templateId: string,
    userId: string,
    workspaceId?: string
  ): Promise<WhiteboardTemplate | null> {
    try {
      const query = `
        SELECT wt.*
        FROM whiteboard_templates wt
        WHERE wt.id = $1
        AND (wt.is_public = true OR wt.workspace_id = $2 OR wt.created_by = $3)
      `;

      const result = await this.db.query(query, [templateId, workspaceId, userId]);

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapDatabaseRowToTemplate(result.rows[0]);
    } catch (error) {
      this.logger.error('Failed to get template', { error, templateId, userId });
      throw error;
    }
  }

  /**
   * Update template
   */
  async updateTemplate(
    templateId: string,
    userId: string,
    request: UpdateTemplateRequest,
    workspaceId?: string
  ): Promise<WhiteboardTemplate> {
    try {
      // Check permissions
      const template = await this.getTemplate(templateId, userId, workspaceId);
      if (!template) {
        throw this.createTemplateError('TEMPLATE_NOT_FOUND', 'Template not found');
      }

      if (template.createdBy !== userId && !template.isPublic) {
        throw this.createTemplateError('PERMISSION_DENIED', 'Access denied to template');
      }

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

      if (request.category !== undefined) {
        if (!TEMPLATE_CATEGORIES.includes(request.category as any)) {
          throw this.createTemplateError('VALIDATION_ERROR', 'Invalid template category');
        }
        updates.push(`category = $${valueIndex++}`);
        values.push(request.category);
      }

      if (request.templateData !== undefined) {
        updates.push(`template_data = $${valueIndex++}`);
        values.push(JSON.stringify(request.templateData));
      }

      if (request.tags !== undefined) {
        updates.push(`tags = $${valueIndex++}`);
        values.push(request.tags);
      }

      if (request.isPublic !== undefined) {
        updates.push(`is_public = $${valueIndex++}`);
        values.push(request.isPublic);
      }

      updates.push(`updated_at = $${valueIndex++}`);
      values.push(new Date().toISOString());

      values.push(templateId);

      const query = `
        UPDATE whiteboard_templates
        SET ${updates.join(', ')}
        WHERE id = $${valueIndex++}
        RETURNING *
      `;

      const result = await this.db.query(query, values);

      if (result.rows.length === 0) {
        throw this.createTemplateError('TEMPLATE_NOT_FOUND', 'Template not found');
      }

      this.logger.info('Template updated successfully', { templateId, userId });

      return this.mapDatabaseRowToTemplate(result.rows[0]);
    } catch (error) {
      this.logger.error('Failed to update template', { error, templateId, userId });
      throw error;
    }
  }

  /**
   * Delete template
   */
  async deleteTemplate(
    templateId: string,
    userId: string,
    workspaceId?: string
  ): Promise<void> {
    try {
      // Check permissions
      const template = await this.getTemplate(templateId, userId, workspaceId);
      if (!template) {
        throw this.createTemplateError('TEMPLATE_NOT_FOUND', 'Template not found');
      }

      if (template.createdBy !== userId) {
        throw this.createTemplateError('PERMISSION_DENIED', 'Access denied to template');
      }

      const query = `DELETE FROM whiteboard_templates WHERE id = $1`;
      const result = await this.db.query(query, [templateId]);

      if (result.rowCount === 0) {
        throw this.createTemplateError('TEMPLATE_NOT_FOUND', 'Template not found');
      }

      this.logger.info('Template deleted successfully', { templateId, userId });
    } catch (error) {
      this.logger.error('Failed to delete template', { error, templateId, userId });
      throw error;
    }
  }

  /**
   * Search and list templates with filtering
   */
  async searchTemplates(
    userId: string,
    workspaceId?: string,
    filters?: TemplateFilter,
    sort?: TemplateSort,
    limit: number = 20,
    offset: number = 0
  ): Promise<PaginatedTemplates> {
    try {
      // Validate pagination parameters
      const sanitizedLimit = Math.min(Math.max(1, limit), 100);
      const sanitizedOffset = Math.max(0, offset);

      // Build base WHERE clause with access control
      let baseWhereClause = '(wt.is_public = true';
      const baseValues = [];
      
      if (workspaceId) {
        baseWhereClause += ' OR wt.workspace_id = $1 OR wt.created_by = $2)';
        baseValues.push(workspaceId, userId);
      } else {
        baseWhereClause += ' OR wt.created_by = $1)';
        baseValues.push(userId);
      }

      // Build filter WHERE clause
      const { whereClause: filterWhereClause, values: filterValues, nextParamIndex } = buildTemplateWhereClause(filters, baseValues);
      
      // Combine WHERE clauses
      let fullWhereClause = `WHERE ${baseWhereClause}`;
      if (filterWhereClause) {
        fullWhereClause += ` AND ${filterWhereClause}`;
      }
      
      // Build ORDER BY clause
      const orderClause = buildTemplateOrderClause(sort);

      // Main query
      const query = `
        SELECT wt.*
        FROM whiteboard_templates wt
        ${fullWhereClause}
        ${orderClause}
        LIMIT $${nextParamIndex} OFFSET $${nextParamIndex + 1}
      `;

      filterValues.push(sanitizedLimit, sanitizedOffset);

      // Count query
      const countQuery = `
        SELECT COUNT(*) as total
        FROM whiteboard_templates wt
        ${fullWhereClause}
      `;

      const countValues = filterValues.slice(0, -2);

      const [dataResult, countResult] = await Promise.all([
        this.db.query(query, filterValues),
        this.db.query(countQuery, countValues)
      ]);

      const total = parseInt(countResult.rows[0]?.total || '0');
      const templates = dataResult.rows.map(row => this.mapDatabaseRowToTemplate(row));

      return {
        items: templates,
        total,
        limit: sanitizedLimit,
        offset: sanitizedOffset,
        hasMore: sanitizedOffset + sanitizedLimit < total,
      };
    } catch (error) {
      this.logger.error('Failed to search templates', { error, userId });
      throw error;
    }
  }

  /**
   * Apply template to whiteboard
   */
  async applyTemplate(
    templateId: string,
    whiteboardId: string,
    userId: string,
    workspaceId?: string
  ): Promise<void> {
    try {
      const template = await this.getTemplate(templateId, userId, workspaceId);
      if (!template) {
        throw this.createTemplateError('TEMPLATE_NOT_FOUND', 'Template not found');
      }

      // Track usage
      await this.trackTemplateUsage({
        templateId,
        whiteboardId,
        userId,
        workspaceId: workspaceId || '',
        eventType: 'applied',
        metadata: {},
      });

      // Increment usage count
      await this.incrementUsageCount(templateId);

      this.logger.info('Template applied successfully', { templateId, whiteboardId, userId });
    } catch (error) {
      this.logger.error('Failed to apply template', { error, templateId, whiteboardId, userId });
      throw error;
    }
  }

  /**
   * Generate thumbnail for template
   */
  async generateThumbnail(
    templateId: string,
    thumbnailData: string,
    userId: string
  ): Promise<void> {
    try {
      const query = `
        UPDATE whiteboard_templates
        SET thumbnail = $1, updated_at = $2
        WHERE id = $3 AND created_by = $4
      `;

      const result = await this.db.query(query, [
        thumbnailData,
        new Date().toISOString(),
        templateId,
        userId
      ]);

      if (result.rowCount === 0) {
        throw this.createTemplateError('TEMPLATE_NOT_FOUND', 'Template not found or access denied');
      }

      this.logger.info('Template thumbnail updated', { templateId, userId });
    } catch (error) {
      this.logger.error('Failed to generate thumbnail', { error, templateId, userId });
      throw error;
    }
  }

  /**
   * Track template usage event
   */
  async trackTemplateUsage(event: TemplateUsageEvent): Promise<void> {
    try {
      const eventId = randomUUID();
      const now = new Date().toISOString();

      const query = `
        INSERT INTO whiteboard_activity_log (
          id, whiteboard_id, user_id, action, target_type, target_id,
          action_data, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `;

      await this.db.query(query, [
        eventId,
        event.whiteboardId,
        event.userId,
        'template_applied',
        'template',
        event.templateId,
        JSON.stringify({
          eventType: event.eventType,
          workspaceId: event.workspaceId,
          metadata: event.metadata,
        }),
        now,
      ]);

      this.logger.debug('Template usage tracked', event);
    } catch (error) {
      this.logger.error('Failed to track template usage', { error, event });
      // Don't throw - usage tracking shouldn't break the main flow
    }
  }

  /**
   * Get template analytics
   */
  async getTemplateAnalytics(
    templateId: string,
    userId: string,
    periodStart?: string,
    periodEnd?: string
  ): Promise<TemplateAnalytics> {
    try {
      const template = await this.getTemplate(templateId, userId);
      if (!template) {
        throw this.createTemplateError('TEMPLATE_NOT_FOUND', 'Template not found');
      }

      if (template.createdBy !== userId) {
        throw this.createTemplateError('PERMISSION_DENIED', 'Access denied to template analytics');
      }

      const start = periodStart || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const end = periodEnd || new Date().toISOString();

      // Get basic analytics
      const analyticsQuery = `
        SELECT 
          COUNT(*) as total_usage,
          COUNT(DISTINCT user_id) as unique_users,
          COUNT(DISTINCT CASE WHEN action_data->>'workspaceId' IS NOT NULL 
                          THEN action_data->>'workspaceId' END) as workspace_usage
        FROM whiteboard_activity_log
        WHERE target_id = $1 AND target_type = 'template' AND action = 'template_applied'
        AND created_at BETWEEN $2 AND $3
      `;

      const analyticsResult = await this.db.query(analyticsQuery, [templateId, start, end]);
      const analytics = analyticsResult.rows[0];

      // Get usage timeline
      const timelineQuery = `
        SELECT 
          DATE(created_at) as date,
          COUNT(*) as count
        FROM whiteboard_activity_log
        WHERE target_id = $1 AND target_type = 'template' AND action = 'template_applied'
        AND created_at BETWEEN $2 AND $3
        GROUP BY DATE(created_at)
        ORDER BY date
      `;

      const timelineResult = await this.db.query(timelineQuery, [templateId, start, end]);

      return {
        templateId,
        totalUsage: parseInt(analytics.total_usage || '0'),
        uniqueUsers: parseInt(analytics.unique_users || '0'),
        workspaceUsage: parseInt(analytics.workspace_usage || '0'),
        averageRating: template.rating || 0,
        ratingCount: 0, // TODO: Implement rating system
        period: {
          start,
          end,
        },
        usageTimeline: timelineResult.rows.map(row => ({
          date: row.date.toISOString(),
          count: parseInt(row.count),
        })),
        topWorkspaces: [], // TODO: Implement workspace analytics
      };
    } catch (error) {
      this.logger.error('Failed to get template analytics', { error, templateId, userId });
      throw error;
    }
  }

  /**
   * Get template categories
   */
  getTemplateCategories(): string[] {
    return [...TEMPLATE_CATEGORIES];
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
      throw this.createTemplateError('WORKSPACE_ACCESS_DENIED', 'Access denied to workspace');
    }
  }

  private async incrementUsageCount(templateId: string): Promise<void> {
    try {
      const query = `
        UPDATE whiteboard_templates
        SET usage_count = usage_count + 1, updated_at = $1
        WHERE id = $2
      `;

      await this.db.query(query, [new Date().toISOString(), templateId]);
    } catch (error) {
      this.logger.error('Failed to increment usage count', { error, templateId });
      // Don't throw - usage count increment shouldn't break the main flow
    }
  }

  private mapDatabaseRowToTemplate(row: any): WhiteboardTemplate {
    if (!row || !row.id) {
      throw this.createTemplateError('INVALID_ROW_DATA', 'Invalid template data received from database');
    }

    return {
      id: row.id,
      name: sanitizeInput(row.name || ''),
      description: sanitizeInput(row.description || ''),
      category: row.category,
      thumbnail: row.thumbnail,
      templateData: this.sanitizeJsonField(row.template_data) || {
        canvasData: {},
        defaultElements: [],
        defaultSettings: {},
        placeholders: [],
      },
      defaultSettings: this.sanitizeJsonField(row.default_settings) || {},
      tags: Array.isArray(row.tags) ? row.tags : [],
      isPublic: row.is_public || false,
      workspaceId: row.workspace_id,
      usageCount: parseInt(row.usage_count) || 0,
      rating: row.rating ? parseFloat(row.rating) : undefined,
      createdBy: row.created_by,
      createdAt: row.created_at?.toISOString() || new Date().toISOString(),
      updatedAt: row.updated_at?.toISOString() || new Date().toISOString(),
    };
  }

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

  private createTemplateError(code: string, message: string, details?: any): WhiteboardError {
    const sanitizedDetails = details ? this.sanitizeValue(details, 2) : undefined;
    
    const error = new Error(message) as any;
    error.code = code;
    error.details = sanitizedDetails;
    return error;
  }
}