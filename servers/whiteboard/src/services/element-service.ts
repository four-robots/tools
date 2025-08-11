import { DatabaseConnection } from '../database/index.js';
import { Logger } from '../utils/logger.js';
import {
  WhiteboardElement,
  CreateElementRequest,
  UpdateElementRequest,
  PaginatedElements,
} from '@shared/types/whiteboard.js';
import { randomUUID } from 'crypto';

/**
 * Whiteboard element service for MCP server
 * Provides business logic for element operations
 */
export class ElementService {
  private logger: Logger;

  constructor(
    private db: DatabaseConnection,
    logger?: Logger
  ) {
    this.logger = logger || new Logger('ElementService');
  }

  /**
   * Create a new whiteboard element
   */
  async createElement(
    whiteboardId: string,
    userId: string,
    request: CreateElementRequest
  ): Promise<WhiteboardElement> {
    try {
      const elementId = randomUUID();
      const now = new Date().toISOString();

      // Get next layer index if not specified
      const layerIndex = request.layerIndex ?? await this.getNextLayerIndex(whiteboardId);

      const element = await this.db.getDb()
        .insertInto('whiteboard_elements')
        .values({
          id: elementId,
          whiteboard_id: whiteboardId,
          element_type: request.elementType,
          element_data: request.elementData,
          layer_index: layerIndex,
          parent_id: request.parentId,
          locked: false,
          visible: true,
          style_data: request.styleData || {},
          metadata: {},
          version: 1,
          created_by: userId,
          last_modified_by: userId,
          created_at: now,
          updated_at: now,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      // Update whiteboard version
      await this.updateWhiteboardVersion(whiteboardId, userId);

      this.logger.info('Element created successfully', { elementId, whiteboardId, userId });

      return this.mapDatabaseRowToElement(element);
    } catch (error) {
      this.logger.error('Failed to create element', { error, whiteboardId, request });
      throw error;
    }
  }

  /**
   * Get element by ID
   */
  async getElement(elementId: string): Promise<WhiteboardElement | null> {
    try {
      const element = await this.db.getDb()
        .selectFrom('whiteboard_elements')
        .selectAll()
        .where('id', '=', elementId)
        .where('deleted_at', 'is', null)
        .executeTakeFirst();

      if (!element) {
        return null;
      }

      return this.mapDatabaseRowToElement(element);
    } catch (error) {
      this.logger.error('Failed to get element', { error, elementId });
      throw error;
    }
  }

  /**
   * Update element
   */
  async updateElement(
    elementId: string,
    userId: string,
    request: UpdateElementRequest
  ): Promise<WhiteboardElement> {
    try {
      const updateData: any = {
        last_modified_by: userId,
        updated_at: new Date().toISOString(),
      };

      if (request.elementData !== undefined) updateData.element_data = request.elementData;
      if (request.styleData !== undefined) updateData.style_data = request.styleData;
      if (request.layerIndex !== undefined) updateData.layer_index = request.layerIndex;
      if (request.locked !== undefined) updateData.locked = request.locked;
      if (request.visible !== undefined) updateData.visible = request.visible;
      if (request.parentId !== undefined) updateData.parent_id = request.parentId;

      const element = await this.db.getDb()
        .updateTable('whiteboard_elements')
        .set(updateData)
        .where('id', '=', elementId)
        .where('deleted_at', 'is', null)
        .returningAll()
        .executeTakeFirstOrThrow();

      // Update whiteboard version
      await this.updateWhiteboardVersion(element.whiteboard_id, userId);

      this.logger.info('Element updated successfully', { elementId, userId });

      return this.mapDatabaseRowToElement(element);
    } catch (error) {
      this.logger.error('Failed to update element', { error, elementId, request });
      throw error;
    }
  }

  /**
   * Delete element
   */
  async deleteElement(elementId: string, userId: string): Promise<void> {
    try {
      const result = await this.db.getDb()
        .updateTable('whiteboard_elements')
        .set({
          deleted_at: new Date().toISOString(),
          last_modified_by: userId,
          updated_at: new Date().toISOString(),
        })
        .where('id', '=', elementId)
        .where('deleted_at', 'is', null)
        .execute();

      if (result.length === 0) {
        throw new Error('Element not found');
      }

      // Get the element to find its whiteboard_id
      const element = await this.db.getDb()
        .selectFrom('whiteboard_elements')
        .select('whiteboard_id')
        .where('id', '=', elementId)
        .executeTakeFirst();

      if (element) {
        // Delete child elements
        await this.deleteChildElements(elementId, userId);
        // Update whiteboard version
        await this.updateWhiteboardVersion(element.whiteboard_id, userId);
      }

      this.logger.info('Element deleted successfully', { elementId, userId });
    } catch (error) {
      this.logger.error('Failed to delete element', { error, elementId, userId });
      throw error;
    }
  }

  /**
   * Get elements for whiteboard
   */
  async getElements(
    whiteboardId: string,
    limit: number = 1000,
    offset: number = 0
  ): Promise<PaginatedElements> {
    try {
      const elements = await this.db.getDb()
        .selectFrom('whiteboard_elements')
        .selectAll()
        .where('whiteboard_id', '=', whiteboardId)
        .where('deleted_at', 'is', null)
        .orderBy('layer_index', 'asc')
        .orderBy('created_at', 'asc')
        .limit(limit)
        .offset(offset)
        .execute();

      const countResult = await this.db.getDb()
        .selectFrom('whiteboard_elements')
        .select(({ fn }) => [fn.count('id').as('total')])
        .where('whiteboard_id', '=', whiteboardId)
        .where('deleted_at', 'is', null)
        .executeTakeFirst();

      const total = Number(countResult?.total || 0);

      return {
        items: elements.map(element => this.mapDatabaseRowToElement(element)),
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      };
    } catch (error) {
      this.logger.error('Failed to get elements', { error, whiteboardId });
      throw error;
    }
  }

  // Private helper methods

  private async getNextLayerIndex(whiteboardId: string): Promise<number> {
    const result = await this.db.getDb()
      .selectFrom('whiteboard_elements')
      .select(({ fn }) => [fn.max('layer_index').as('max_layer')])
      .where('whiteboard_id', '=', whiteboardId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();

    return (Number(result?.max_layer) || 0) + 1;
  }

  private async updateWhiteboardVersion(whiteboardId: string, userId: string): Promise<void> {
    await this.db.getDb()
      .updateTable('whiteboards')
      .set({
        updated_at: new Date().toISOString(),
        last_modified_by: userId,
      })
      .where('id', '=', whiteboardId)
      .execute();
  }

  private async deleteChildElements(parentId: string, userId: string): Promise<void> {
    await this.db.getDb()
      .updateTable('whiteboard_elements')
      .set({
        deleted_at: new Date().toISOString(),
        last_modified_by: userId,
        updated_at: new Date().toISOString(),
      })
      .where('parent_id', '=', parentId)
      .where('deleted_at', 'is', null)
      .execute();
  }

  private mapDatabaseRowToElement(row: any): WhiteboardElement {
    return {
      id: row.id,
      whiteboardId: row.whiteboard_id,
      elementType: row.element_type,
      elementData: typeof row.element_data === 'string' ? JSON.parse(row.element_data) : row.element_data || {},
      layerIndex: row.layer_index || 0,
      parentId: row.parent_id,
      locked: row.locked || false,
      visible: row.visible !== false,
      styleData: typeof row.style_data === 'string' ? JSON.parse(row.style_data) : row.style_data || {},
      metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata || {},
      version: row.version || 1,
      createdBy: row.created_by,
      lastModifiedBy: row.last_modified_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
    };
  }
}