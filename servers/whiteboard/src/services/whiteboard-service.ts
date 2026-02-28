import { DatabaseConnection } from '../database/index.js';
import { Logger } from '../utils/logger.js';
import {
  Whiteboard,
  WhiteboardWithElements,
  CreateWhiteboardRequest,
  UpdateWhiteboardRequest,
  WhiteboardFilter,
  WhiteboardSort,
  PaginatedWhiteboards,
} from '@shared/types/whiteboard.js';
import { randomUUID } from 'crypto';

/**
 * Whiteboard service for MCP server
 * Provides business logic for whiteboard operations
 */
export class WhiteboardService {
  private logger: Logger;

  constructor(
    private db: DatabaseConnection,
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

      const whiteboard = await this.db.getDb()
        .insertInto('whiteboards')
        .values({
          id: whiteboardId,
          workspace_id: workspaceId,
          name: request.name,
          description: request.description,
          canvas_data: request.canvasData || {},
          settings: request.settings || {},
          template_id: request.templateId,
          is_template: false,
          visibility: request.visibility || 'workspace',
          status: 'active',
          version: 1,
          created_by: userId,
          last_modified_by: userId,
          created_at: now,
          updated_at: now,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      this.logger.info('Whiteboard created successfully', { whiteboardId, workspaceId, userId });

      return this.mapDatabaseRowToWhiteboard(whiteboard);
    } catch (error) {
      this.logger.error('Failed to create whiteboard', { error, request });
      throw error;
    }
  }

  /**
   * Get whiteboard by ID
   */
  async getWhiteboard(whiteboardId: string): Promise<Whiteboard | null> {
    try {
      const whiteboard = await this.db.getDb()
        .selectFrom('whiteboards')
        .selectAll()
        .where('id', '=', whiteboardId)
        .where('deleted_at', 'is', null)
        .executeTakeFirst();

      if (!whiteboard) {
        return null;
      }

      return this.mapDatabaseRowToWhiteboard(whiteboard);
    } catch (error) {
      this.logger.error('Failed to get whiteboard', { error, whiteboardId });
      throw error;
    }
  }

  /**
   * Get whiteboard with elements
   */
  async getWhiteboardWithElements(whiteboardId: string): Promise<WhiteboardWithElements | null> {
    try {
      const whiteboard = await this.getWhiteboard(whiteboardId);
      if (!whiteboard) {
        return null;
      }

      const elements = await this.db.getDb()
        .selectFrom('whiteboard_elements')
        .selectAll()
        .where('whiteboard_id', '=', whiteboardId)
        .where('deleted_at', 'is', null)
        .orderBy('layer_index', 'asc')
        .orderBy('created_at', 'asc')
        .execute();

      const activeSessions = await this.db.getDb()
        .selectFrom('whiteboard_sessions')
        .select(({ fn }) => [fn.count('id').as('count')])
        .where('whiteboard_id', '=', whiteboardId)
        .where('is_active', '=', true)
        .executeTakeFirst();

      return {
        ...whiteboard,
        elements: elements.map(element => this.mapDatabaseRowToElement(element)),
        activeSessions: Number(activeSessions?.count || 0),
      };
    } catch (error) {
      this.logger.error('Failed to get whiteboard with elements', { error, whiteboardId });
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
      const updateData: any = {
        last_modified_by: userId,
        updated_at: new Date().toISOString(),
      };

      if (request.name !== undefined) updateData.name = request.name;
      if (request.description !== undefined) updateData.description = request.description;
      if (request.visibility !== undefined) updateData.visibility = request.visibility;
      if (request.settings !== undefined) updateData.settings = request.settings;
      if (request.canvasData !== undefined) updateData.canvas_data = request.canvasData;

      const whiteboard = await this.db.getDb()
        .updateTable('whiteboards')
        .set(updateData)
        .where('id', '=', whiteboardId)
        .where('deleted_at', 'is', null)
        .returningAll()
        .executeTakeFirstOrThrow();

      this.logger.info('Whiteboard updated successfully', { whiteboardId, userId });

      return this.mapDatabaseRowToWhiteboard(whiteboard);
    } catch (error) {
      this.logger.error('Failed to update whiteboard', { error, whiteboardId, request });
      throw error;
    }
  }

  /**
   * Delete whiteboard
   */
  async deleteWhiteboard(whiteboardId: string, userId: string): Promise<void> {
    try {
      const result = await this.db.getDb()
        .updateTable('whiteboards')
        .set({
          deleted_at: new Date().toISOString(),
          last_modified_by: userId,
          updated_at: new Date().toISOString(),
        })
        .where('id', '=', whiteboardId)
        .where('deleted_at', 'is', null)
        .execute();

      if (result.length === 0) {
        throw new Error('Whiteboard not found');
      }

      this.logger.info('Whiteboard deleted successfully', { whiteboardId, userId });
    } catch (error) {
      this.logger.error('Failed to delete whiteboard', { error, whiteboardId, userId });
      throw error;
    }
  }

  /**
   * List whiteboards for a workspace
   */
  async listWhiteboards(
    workspaceId: string,
    filters?: WhiteboardFilter,
    sort?: WhiteboardSort,
    limit: number = 20,
    offset: number = 0
  ): Promise<PaginatedWhiteboards> {
    try {
      let query = this.db.getDb()
        .selectFrom('whiteboards')
        .selectAll()
        .where('workspace_id', '=', workspaceId)
        .where('deleted_at', 'is', null);

      // Apply filters
      if (filters) {
        if (filters.status && filters.status.length > 0) {
          query = query.where('status', 'in', filters.status);
        }
        if (filters.visibility && filters.visibility.length > 0) {
          query = query.where('visibility', 'in', filters.visibility);
        }
        if (filters.createdBy) {
          query = query.where('created_by', '=', filters.createdBy);
        }
        if (filters.templateId) {
          query = query.where('template_id', '=', filters.templateId);
        }
        if (filters.search) {
          query = query.where(({ or, cmpr }) => or([
            cmpr('name', 'ilike', `%${filters.search}%`),
            cmpr('description', 'ilike', `%${filters.search}%`)
          ]));
        }
      }

      // Apply sorting
      if (sort) {
        const field = sort.field === 'createdAt' ? 'created_at' : 
                     sort.field === 'updatedAt' ? 'updated_at' : 
                     sort.field;
        query = query.orderBy(field as any, sort.direction || 'desc');
      } else {
        query = query.orderBy('updated_at', 'desc');
      }

      // Get total count
      const countQuery = this.db.getDb()
        .selectFrom('whiteboards')
        .select(({ fn }) => [fn.count('id').as('total')])
        .where('workspace_id', '=', workspaceId)
        .where('deleted_at', 'is', null);

      const [whiteboards, countResult] = await Promise.all([
        query.limit(limit).offset(offset).execute(),
        countQuery.executeTakeFirst()
      ]);

      const total = Number(countResult?.total || 0);

      const items = whiteboards.map(wb => ({
        ...this.mapDatabaseRowToWhiteboard(wb),
        elementCount: 0,
        collaboratorCount: 0,
        commentCount: 0,
        isCollaborating: false,
      }));

      return {
        items,
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      };
    } catch (error) {
      this.logger.error('Failed to list whiteboards', { error, workspaceId });
      throw error;
    }
  }

  // Private helper methods

  private mapDatabaseRowToWhiteboard(row: any): Whiteboard {
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      name: row.name || '',
      description: row.description,
      thumbnail: row.thumbnail,
      canvasData: typeof row.canvas_data === 'string' ? (() => { try { return JSON.parse(row.canvas_data); } catch { return {}; } })() : row.canvas_data || {},
      settings: typeof row.settings === 'string' ? (() => { try { return JSON.parse(row.settings); } catch { return {}; } })() : row.settings || {},
      templateId: row.template_id,
      isTemplate: row.is_template || false,
      visibility: row.visibility,
      status: row.status,
      version: row.version || 1,
      createdBy: row.created_by,
      lastModifiedBy: row.last_modified_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
    };
  }

  private mapDatabaseRowToElement(row: any): any {
    return {
      id: row.id,
      whiteboardId: row.whiteboard_id,
      elementType: row.element_type,
      elementData: typeof row.element_data === 'string' ? (() => { try { return JSON.parse(row.element_data); } catch { return {}; } })() : row.element_data || {},
      layerIndex: row.layer_index || 0,
      parentId: row.parent_id,
      locked: row.locked || false,
      visible: row.visible !== false,
      styleData: typeof row.style_data === 'string' ? (() => { try { return JSON.parse(row.style_data); } catch { return {}; } })() : row.style_data || {},
      metadata: typeof row.metadata === 'string' ? (() => { try { return JSON.parse(row.metadata); } catch { return {}; } })() : row.metadata || {},
      version: row.version || 1,
      createdBy: row.created_by,
      lastModifiedBy: row.last_modified_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
    };
  }
}