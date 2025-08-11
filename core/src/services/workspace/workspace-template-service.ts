import { DatabasePool } from '../../utils/database-pool.js';
import { Logger } from '../../utils/logger.js';
import {
  WorkspaceTemplate,
  CreateTemplateRequest,
  PaginatedTemplates,
  WorkspaceError,
} from '@shared/types/workspace.js';
import { randomUUID } from 'crypto';

/**
 * Workspace template management service
 */
export class WorkspaceTemplateService {
  private logger: Logger;

  constructor(
    private db: DatabasePool,
    logger?: Logger
  ) {
    this.logger = logger || new Logger('WorkspaceTemplateService');
  }

  /**
   * Create a new workspace template
   */
  async createTemplate(
    userId: string,
    tenantId: string,
    request: CreateTemplateRequest
  ): Promise<WorkspaceTemplate> {
    try {
      const templateId = randomUUID();
      const now = new Date().toISOString();

      const template: WorkspaceTemplate = {
        id: templateId,
        name: request.name,
        description: request.description,
        category: request.category,
        templateData: request.templateData,
        defaultSettings: request.defaultSettings || {},
        requiredTools: request.requiredTools || [],
        isPublic: request.isPublic || false,
        createdBy: userId,
        usageCount: 0,
        tags: request.tags || [],
        createdAt: now,
        updatedAt: now,
      };

      const query = `
        INSERT INTO workspace_templates (
          id, name, description, category, template_data, default_settings,
          required_tools, is_public, created_by, usage_count, tags,
          created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING *
      `;

      const result = await this.db.query(query, [
        template.id,
        template.name,
        template.description,
        template.category,
        JSON.stringify(template.templateData),
        JSON.stringify(template.defaultSettings),
        template.requiredTools,
        template.isPublic,
        template.createdBy,
        template.usageCount,
        template.tags,
        template.createdAt,
        template.updatedAt,
      ]);

      if (result.rows.length === 0) {
        throw new Error('Failed to create template');
      }

      this.logger.info('Template created successfully', { templateId, userId, name: request.name });

      return this.mapDatabaseRowToTemplate(result.rows[0]);
    } catch (error) {
      this.logger.error('Failed to create template', { error, userId, request });
      throw error;
    }
  }

  /**
   * Get template by ID
   */
  async getTemplate(
    templateId: string,
    userId?: string
  ): Promise<WorkspaceTemplate | null> {
    try {
      let query = `
        SELECT * FROM workspace_templates
        WHERE id = $1
      `;
      const values = [templateId];

      // If user is provided, check access permissions
      if (userId) {
        query += ` AND (is_public = true OR created_by = $2)`;
        values.push(userId);
      } else {
        query += ` AND is_public = true`;
      }

      const result = await this.db.query(query, values);

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
    updates: Partial<CreateTemplateRequest>
  ): Promise<WorkspaceTemplate> {
    try {
      // Check if user owns the template
      const existingTemplate = await this.getTemplate(templateId, userId);
      if (!existingTemplate) {
        throw this.createTemplateError('TEMPLATE_NOT_FOUND', 'Template not found');
      }

      if (existingTemplate.createdBy !== userId) {
        throw this.createTemplateError('TEMPLATE_ACCESS_DENIED', 'Only template creator can update template');
      }

      const updateFields: string[] = [];
      const values: any[] = [];
      let valueIndex = 1;

      if (updates.name !== undefined) {
        updateFields.push(`name = $${valueIndex++}`);
        values.push(updates.name);
      }

      if (updates.description !== undefined) {
        updateFields.push(`description = $${valueIndex++}`);
        values.push(updates.description);
      }

      if (updates.category !== undefined) {
        updateFields.push(`category = $${valueIndex++}`);
        values.push(updates.category);
      }

      if (updates.templateData !== undefined) {
        updateFields.push(`template_data = $${valueIndex++}`);
        values.push(JSON.stringify(updates.templateData));
      }

      if (updates.defaultSettings !== undefined) {
        updateFields.push(`default_settings = $${valueIndex++}`);
        values.push(JSON.stringify(updates.defaultSettings));
      }

      if (updates.requiredTools !== undefined) {
        updateFields.push(`required_tools = $${valueIndex++}`);
        values.push(updates.requiredTools);
      }

      if (updates.isPublic !== undefined) {
        updateFields.push(`is_public = $${valueIndex++}`);
        values.push(updates.isPublic);
      }

      if (updates.tags !== undefined) {
        updateFields.push(`tags = $${valueIndex++}`);
        values.push(updates.tags);
      }

      updateFields.push(`updated_at = $${valueIndex++}`);
      values.push(new Date().toISOString());

      values.push(templateId);

      const query = `
        UPDATE workspace_templates
        SET ${updateFields.join(', ')}
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
    userId: string
  ): Promise<void> {
    try {
      // Check if user owns the template
      const template = await this.getTemplate(templateId, userId);
      if (!template) {
        throw this.createTemplateError('TEMPLATE_NOT_FOUND', 'Template not found');
      }

      if (template.createdBy !== userId) {
        throw this.createTemplateError('TEMPLATE_ACCESS_DENIED', 'Only template creator can delete template');
      }

      const query = `
        DELETE FROM workspace_templates
        WHERE id = $1 AND created_by = $2
      `;

      const result = await this.db.query(query, [templateId, userId]);

      if (result.rowCount === 0) {
        throw this.createTemplateError('TEMPLATE_NOT_FOUND', 'Template not found or access denied');
      }

      this.logger.info('Template deleted successfully', { templateId, userId });
    } catch (error) {
      this.logger.error('Failed to delete template', { error, templateId, userId });
      throw error;
    }
  }

  /**
   * Search templates with pagination
   */
  async searchTemplates(
    userId?: string,
    category?: string,
    tags?: string[],
    search?: string,
    includePrivate: boolean = false,
    sortBy: 'name' | 'created_at' | 'usage_count' | 'rating' = 'usage_count',
    sortOrder: 'asc' | 'desc' = 'desc',
    limit: number = 20,
    offset: number = 0
  ): Promise<PaginatedTemplates> {
    try {
      let whereClause = 'WHERE 1=1';
      const values: any[] = [];
      let valueIndex = 1;

      // Access control
      if (userId && includePrivate) {
        whereClause += ` AND (is_public = true OR created_by = $${valueIndex++})`;
        values.push(userId);
      } else {
        whereClause += ' AND is_public = true';
      }

      // Category filter
      if (category) {
        whereClause += ` AND category = $${valueIndex++}`;
        values.push(category);
      }

      // Tags filter
      if (tags && tags.length > 0) {
        whereClause += ` AND tags && $${valueIndex++}`;
        values.push(tags);
      }

      // Search filter
      if (search) {
        whereClause += ` AND (name ILIKE $${valueIndex++} OR description ILIKE $${valueIndex++})`;
        const searchPattern = `%${search}%`;
        values.push(searchPattern);
        values.push(searchPattern);
      }

      // Order clause
      let orderClause = 'ORDER BY created_at DESC';
      switch (sortBy) {
        case 'name':
          orderClause = `ORDER BY name ${sortOrder}`;
          break;
        case 'created_at':
          orderClause = `ORDER BY created_at ${sortOrder}`;
          break;
        case 'usage_count':
          orderClause = `ORDER BY usage_count ${sortOrder}`;
          break;
        case 'rating':
          orderClause = `ORDER BY rating ${sortOrder} NULLS LAST`;
          break;
      }

      const query = `
        SELECT t.*, u.name as creator_name
        FROM workspace_templates t
        LEFT JOIN users u ON t.created_by = u.id
        ${whereClause}
        ${orderClause}
        LIMIT $${valueIndex++} OFFSET $${valueIndex++}
      `;

      values.push(limit);
      values.push(offset);

      // Get total count
      const countQuery = `
        SELECT COUNT(*) as total
        FROM workspace_templates t
        ${whereClause}
      `;

      const [dataResult, countResult] = await Promise.all([
        this.db.query(query, values),
        this.db.query(countQuery, values.slice(0, -2)) // Remove limit and offset
      ]);

      const total = parseInt(countResult.rows[0]?.total || '0');
      const templates = dataResult.rows.map(row => {
        const template = this.mapDatabaseRowToTemplate(row);
        // Add creator info
        (template as any).creatorName = row.creator_name;
        return template;
      });

      return {
        items: templates,
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      };
    } catch (error) {
      this.logger.error('Failed to search templates', { error, userId, category, search });
      throw error;
    }
  }

  /**
   * Get user's templates
   */
  async getUserTemplates(
    userId: string,
    limit: number = 20,
    offset: number = 0
  ): Promise<PaginatedTemplates> {
    try {
      const query = `
        SELECT * FROM workspace_templates
        WHERE created_by = $1
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3
      `;

      const countQuery = `
        SELECT COUNT(*) as total
        FROM workspace_templates
        WHERE created_by = $1
      `;

      const [dataResult, countResult] = await Promise.all([
        this.db.query(query, [userId, limit, offset]),
        this.db.query(countQuery, [userId])
      ]);

      const total = parseInt(countResult.rows[0]?.total || '0');
      const templates = dataResult.rows.map(row => this.mapDatabaseRowToTemplate(row));

      return {
        items: templates,
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      };
    } catch (error) {
      this.logger.error('Failed to get user templates', { error, userId });
      throw error;
    }
  }

  /**
   * Increment template usage count
   */
  async incrementUsageCount(templateId: string): Promise<void> {
    try {
      const query = `
        UPDATE workspace_templates
        SET usage_count = usage_count + 1, updated_at = NOW()
        WHERE id = $1
      `;

      await this.db.query(query, [templateId]);

      this.logger.debug('Template usage count incremented', { templateId });
    } catch (error) {
      this.logger.error('Failed to increment usage count', { error, templateId });
    }
  }

  /**
   * Rate template
   */
  async rateTemplate(
    templateId: string,
    userId: string,
    rating: number
  ): Promise<void> {
    try {
      if (rating < 1 || rating > 5) {
        throw this.createTemplateError('VALIDATION_ERROR', 'Rating must be between 1 and 5');
      }

      // Check if template exists and is accessible
      const template = await this.getTemplate(templateId, userId);
      if (!template) {
        throw this.createTemplateError('TEMPLATE_NOT_FOUND', 'Template not found');
      }

      // Store or update rating (in a ratings table - simplified here by updating average)
      // This is a simplified implementation; in production, you'd want a separate ratings table
      const currentRating = template.rating || 0;
      const currentUsage = template.usageCount || 1;
      
      // Simple average calculation (in real implementation, use proper rating aggregation)
      const newRating = ((currentRating * currentUsage) + rating) / (currentUsage + 1);

      const query = `
        UPDATE workspace_templates
        SET rating = $1, updated_at = NOW()
        WHERE id = $2
      `;

      await this.db.query(query, [newRating, templateId]);

      this.logger.info('Template rated successfully', { templateId, userId, rating });
    } catch (error) {
      this.logger.error('Failed to rate template', { error, templateId, userId, rating });
      throw error;
    }
  }

  /**
   * Get template categories
   */
  async getCategories(): Promise<{ category: string; count: number }[]> {
    try {
      const query = `
        SELECT category, COUNT(*) as count
        FROM workspace_templates
        WHERE is_public = true
        GROUP BY category
        ORDER BY count DESC, category
      `;

      const result = await this.db.query(query);

      return result.rows.map(row => ({
        category: row.category,
        count: parseInt(row.count),
      }));
    } catch (error) {
      this.logger.error('Failed to get categories', { error });
      throw error;
    }
  }

  /**
   * Get popular tags
   */
  async getPopularTags(limit: number = 20): Promise<{ tag: string; count: number }[]> {
    try {
      const query = `
        SELECT tag, COUNT(*) as count
        FROM (
          SELECT UNNEST(tags) as tag
          FROM workspace_templates
          WHERE is_public = true AND tags IS NOT NULL
        ) tag_list
        GROUP BY tag
        ORDER BY count DESC, tag
        LIMIT $1
      `;

      const result = await this.db.query(query, [limit]);

      return result.rows.map(row => ({
        tag: row.tag,
        count: parseInt(row.count),
      }));
    } catch (error) {
      this.logger.error('Failed to get popular tags', { error });
      throw error;
    }
  }

  /**
   * Clone template for user
   */
  async cloneTemplate(
    templateId: string,
    userId: string,
    newName?: string
  ): Promise<WorkspaceTemplate> {
    try {
      const originalTemplate = await this.getTemplate(templateId, userId);
      if (!originalTemplate) {
        throw this.createTemplateError('TEMPLATE_NOT_FOUND', 'Template not found');
      }

      const cloneRequest: CreateTemplateRequest = {
        name: newName || `${originalTemplate.name} (Copy)`,
        description: originalTemplate.description,
        category: originalTemplate.category,
        templateData: originalTemplate.templateData,
        defaultSettings: originalTemplate.defaultSettings,
        requiredTools: originalTemplate.requiredTools,
        isPublic: false, // Clones are private by default
        tags: [...(originalTemplate.tags || []), 'cloned'],
      };

      const clonedTemplate = await this.createTemplate(userId, 'tenant-id', cloneRequest);

      this.logger.info('Template cloned successfully', { 
        originalId: templateId, 
        clonedId: clonedTemplate.id, 
        userId 
      });

      return clonedTemplate;
    } catch (error) {
      this.logger.error('Failed to clone template', { error, templateId, userId });
      throw error;
    }
  }

  // Private helper methods

  private mapDatabaseRowToTemplate(row: any): WorkspaceTemplate {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      category: row.category,
      templateData: row.template_data,
      defaultSettings: row.default_settings || {},
      requiredTools: row.required_tools || [],
      isPublic: row.is_public,
      createdBy: row.created_by,
      usageCount: row.usage_count,
      rating: row.rating ? parseFloat(row.rating) : undefined,
      tags: row.tags || [],
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  private createTemplateError(code: string, message: string, details?: any): WorkspaceError {
    const error = new Error(message) as any;
    error.code = code;
    error.details = details;
    return error;
  }
}