import { DatabasePool } from '../../utils/database-pool.js';
import { Logger } from '../../utils/logger.js';
import {
  WhiteboardElement,
  CreateElementRequest,
  UpdateElementRequest,
  BulkElementOperation,
  PaginatedElements,
  WhiteboardError,
  WhiteboardElementType,
  ElementStyle,
} from '@shared/types/whiteboard.js';
import { randomUUID } from 'crypto';

/**
 * Input sanitization utility
 */
const sanitizeInput = (input: string): string => {
  if (!input || typeof input !== 'string') {
    return '';
  }
  return input
    .replace(/[\x00\x08\x09\x1a\n\r"'\\%]/g, '')
    .trim()
    .substring(0, 1000);
};

/**
 * Whiteboard element management service
 * Handles CRUD operations for individual whiteboard elements
 */
export class WhiteboardElementService {
  private logger: Logger;

  constructor(
    private db: DatabasePool,
    logger?: Logger
  ) {
    this.logger = logger || new Logger('WhiteboardElementService');
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

      // Validate whiteboard access
      await this.validateWhiteboardAccess(whiteboardId, userId, 'canEdit');

      // Get next layer index if not specified
      const layerIndex = request.layerIndex ?? await this.getNextLayerIndex(whiteboardId);

      const element: WhiteboardElement = {
        id: elementId,
        whiteboardId,
        elementType: request.elementType,
        elementData: request.elementData,
        layerIndex,
        parentId: request.parentId,
        locked: false,
        visible: true,
        styleData: request.styleData || {},
        metadata: {},
        version: 1,
        createdBy: userId,
        lastModifiedBy: userId,
        createdAt: now,
        updatedAt: now,
      };

      const query = `
        INSERT INTO whiteboard_elements (
          id, whiteboard_id, element_type, element_data, layer_index,
          parent_id, locked, visible, style_data, metadata, version,
          created_by, last_modified_by, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        RETURNING *
      `;

      const result = await this.db.query(query, [
        element.id,
        element.whiteboardId,
        element.elementType,
        JSON.stringify(element.elementData),
        element.layerIndex,
        element.parentId,
        element.locked,
        element.visible,
        JSON.stringify(element.styleData),
        JSON.stringify(element.metadata),
        element.version,
        element.createdBy,
        element.lastModifiedBy,
        element.createdAt,
        element.updatedAt,
      ]);

      if (result.rows.length === 0) {
        throw new Error('Failed to create element');
      }

      // Update whiteboard version and last modified
      await this.updateWhiteboardVersion(whiteboardId, userId);

      // Log activity
      await this.logActivity(whiteboardId, userId, 'element_created', 'element', elementId, {
        elementType: element.elementType,
        layerIndex: element.layerIndex,
      });

      this.logger.info('Element created successfully', { elementId, whiteboardId, userId });

      return this.mapDatabaseRowToElement(result.rows[0]);
    } catch (error) {
      this.logger.error('Failed to create element', { error, whiteboardId, request });
      throw error;
    }
  }

  /**
   * Get element by ID
   */
  async getElement(
    elementId: string,
    userId: string
  ): Promise<WhiteboardElement | null> {
    try {
      const query = `
        SELECT we.*, w.workspace_id
        FROM whiteboard_elements we
        JOIN whiteboards w ON we.whiteboard_id = w.id
        WHERE we.id = $1 AND we.deleted_at IS NULL AND w.deleted_at IS NULL
      `;

      const result = await this.db.query(query, [elementId]);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      
      // Check whiteboard access
      await this.validateWhiteboardAccess(row.whiteboard_id, userId, 'canEdit');

      return this.mapDatabaseRowToElement(row);
    } catch (error) {
      this.logger.error('Failed to get element', { error, elementId, userId });
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
      // Get current element to validate access
      const currentElement = await this.getElement(elementId, userId);
      if (!currentElement) {
        throw this.createWhiteboardError('ELEMENT_NOT_FOUND', 'Element not found');
      }

      // Check if element is locked
      if (currentElement.locked) {
        throw this.createWhiteboardError('ELEMENT_ACCESS_DENIED', 'Element is locked');
      }

      const updates: string[] = [];
      const values: any[] = [];
      let valueIndex = 1;

      if (request.elementData !== undefined) {
        updates.push(`element_data = $${valueIndex++}`);
        values.push(JSON.stringify(request.elementData));
      }

      if (request.styleData !== undefined) {
        updates.push(`style_data = $${valueIndex++}`);
        values.push(JSON.stringify(request.styleData));
      }

      if (request.layerIndex !== undefined) {
        updates.push(`layer_index = $${valueIndex++}`);
        values.push(request.layerIndex);
      }

      if (request.locked !== undefined) {
        updates.push(`locked = $${valueIndex++}`);
        values.push(request.locked);
      }

      if (request.visible !== undefined) {
        updates.push(`visible = $${valueIndex++}`);
        values.push(request.visible);
      }

      if (request.parentId !== undefined) {
        updates.push(`parent_id = $${valueIndex++}`);
        values.push(request.parentId);
      }

      updates.push(`last_modified_by = $${valueIndex++}`);
      values.push(userId);

      updates.push(`updated_at = $${valueIndex++}`);
      values.push(new Date().toISOString());

      updates.push(`version = version + 1`);

      values.push(elementId);

      const query = `
        UPDATE whiteboard_elements
        SET ${updates.join(', ')}
        WHERE id = $${valueIndex++} AND deleted_at IS NULL
        RETURNING *
      `;

      const result = await this.db.query(query, values);

      if (result.rows.length === 0) {
        throw this.createWhiteboardError('ELEMENT_NOT_FOUND', 'Element not found');
      }

      // Update whiteboard version
      await this.updateWhiteboardVersion(currentElement.whiteboardId, userId);

      // Log activity
      await this.logActivity(currentElement.whiteboardId, userId, 'element_updated', 'element', elementId, {
        changes: Object.keys(request),
      });

      this.logger.info('Element updated successfully', { elementId, userId });

      return this.mapDatabaseRowToElement(result.rows[0]);
    } catch (error) {
      this.logger.error('Failed to update element', { error, elementId, request });
      throw error;
    }
  }

  /**
   * Delete element
   */
  async deleteElement(
    elementId: string,
    userId: string
  ): Promise<void> {
    try {
      // Get current element to validate access
      const currentElement = await this.getElement(elementId, userId);
      if (!currentElement) {
        throw this.createWhiteboardError('ELEMENT_NOT_FOUND', 'Element not found');
      }

      // Check if element is locked
      if (currentElement.locked) {
        throw this.createWhiteboardError('ELEMENT_ACCESS_DENIED', 'Cannot delete locked element');
      }

      const query = `
        UPDATE whiteboard_elements
        SET deleted_at = $1, last_modified_by = $2, updated_at = $1
        WHERE id = $3 AND deleted_at IS NULL
      `;

      const result = await this.db.query(query, [new Date().toISOString(), userId, elementId]);

      if (result.rowCount === 0) {
        throw this.createWhiteboardError('ELEMENT_NOT_FOUND', 'Element not found');
      }

      // Delete child elements if this is a group/frame
      await this.deleteChildElements(elementId, userId);

      // Update whiteboard version
      await this.updateWhiteboardVersion(currentElement.whiteboardId, userId);

      // Log activity
      await this.logActivity(currentElement.whiteboardId, userId, 'element_deleted', 'element', elementId, {
        elementType: currentElement.elementType,
      });

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
    userId: string,
    limit: number = 1000,
    offset: number = 0
  ): Promise<PaginatedElements> {
    try {
      // Validate whiteboard access
      await this.validateWhiteboardAccess(whiteboardId, userId, 'canEdit');

      // Validate and sanitize pagination parameters
      const sanitizedLimit = Math.min(Math.max(1, limit), 1000);
      const sanitizedOffset = Math.max(0, offset);

      const query = `
        SELECT * FROM whiteboard_elements
        WHERE whiteboard_id = $1 AND deleted_at IS NULL
        ORDER BY layer_index ASC, created_at ASC
        LIMIT $2 OFFSET $3
      `;

      const countQuery = `
        SELECT COUNT(*) as total FROM whiteboard_elements
        WHERE whiteboard_id = $1 AND deleted_at IS NULL
      `;

      const [dataResult, countResult] = await Promise.all([
        this.db.query(query, [whiteboardId, sanitizedLimit, sanitizedOffset]),
        this.db.query(countQuery, [whiteboardId])
      ]);

      const total = parseInt(countResult.rows[0]?.total || '0');
      const elements = dataResult.rows
        .map(row => this.mapDatabaseRowToElement(row))
        .filter(element => element !== null);

      return {
        items: elements,
        total,
        limit: sanitizedLimit,
        offset: sanitizedOffset,
        hasMore: sanitizedOffset + sanitizedLimit < total,
      };
    } catch (error) {
      this.logger.error('Failed to get elements', { error, whiteboardId, userId });
      throw error;
    }
  }

  /**
   * Bulk operations on elements
   */
  async bulkOperation(
    whiteboardId: string,
    userId: string,
    operation: BulkElementOperation
  ): Promise<void> {
    try {
      // Validate whiteboard access
      await this.validateWhiteboardAccess(whiteboardId, userId, 'canEdit');

      const operationId = randomUUID();
      const now = new Date().toISOString();

      switch (operation.operation) {
        case 'delete':
          await this.bulkDelete(operation.elementIds, userId, operationId);
          break;
        case 'move':
          await this.bulkMove(operation.elementIds, operation.layerIndexDelta || 0, userId, operationId);
          break;
        case 'style':
          await this.bulkStyle(operation.elementIds, operation.data || {}, userId, operationId);
          break;
        case 'group':
          await this.bulkGroup(operation.elementIds, operation.targetParentId, userId, operationId);
          break;
        case 'ungroup':
          await this.bulkUngroup(operation.elementIds, userId, operationId);
          break;
        default:
          throw this.createWhiteboardError('INVALID_OPERATION', `Unsupported bulk operation: ${operation.operation}`);
      }

      // Update whiteboard version
      await this.updateWhiteboardVersion(whiteboardId, userId);

      // Log bulk activity
      await this.logActivity(whiteboardId, userId, 'element_bulk_operation' as any, 'bulk', operationId, {
        operation: operation.operation,
        elementCount: operation.elementIds.length,
      });

      this.logger.info('Bulk operation completed successfully', { whiteboardId, operation: operation.operation, userId });
    } catch (error) {
      this.logger.error('Failed to perform bulk operation', { error, whiteboardId, operation });
      throw error;
    }
  }

  /**
   * Duplicate element
   */
  async duplicateElement(
    elementId: string,
    userId: string,
    offsetX: number = 20,
    offsetY: number = 20
  ): Promise<WhiteboardElement> {
    try {
      const originalElement = await this.getElement(elementId, userId);
      if (!originalElement) {
        throw this.createWhiteboardError('ELEMENT_NOT_FOUND', 'Element not found');
      }

      // Create duplicate with offset position
      const duplicateData = { ...originalElement.elementData };
      if (duplicateData.position) {
        duplicateData.position = {
          x: duplicateData.position.x + offsetX,
          y: duplicateData.position.y + offsetY,
        };
      }

      const duplicateRequest: CreateElementRequest = {
        elementType: originalElement.elementType,
        elementData: duplicateData,
        styleData: originalElement.styleData,
        layerIndex: originalElement.layerIndex + 1,
      };

      const duplicate = await this.createElement(originalElement.whiteboardId, userId, duplicateRequest);

      // Log activity
      await this.logActivity(originalElement.whiteboardId, userId, 'element_duplicated' as any, 'element', duplicate.id, {
        originalElementId: elementId,
        elementType: originalElement.elementType,
      });

      return duplicate;
    } catch (error) {
      this.logger.error('Failed to duplicate element', { error, elementId, userId });
      throw error;
    }
  }

  // Private helper methods

  private async validateWhiteboardAccess(whiteboardId: string, userId: string, permission: string): Promise<void> {
    const query = `
      SELECT wp.role, wp.permissions, w.created_by
      FROM whiteboards w
      LEFT JOIN whiteboard_permissions wp ON w.id = wp.whiteboard_id AND wp.user_id = $2
      WHERE w.id = $1 AND w.deleted_at IS NULL
    `;

    const result = await this.db.query(query, [whiteboardId, userId]);

    if (result.rows.length === 0) {
      throw this.createWhiteboardError('WHITEBOARD_NOT_FOUND', 'Whiteboard not found');
    }

    const row = result.rows[0];
    
    // Check if user is creator (creators have all permissions)
    if (row.created_by === userId) {
      return;
    }

    // Check role-based permissions
    if (row.role === 'owner' || row.role === 'editor') {
      return;
    }

    // Check specific permissions
    const permissions = row.permissions || {};
    if (permissions[permission] === true) {
      return;
    }

    throw this.createWhiteboardError('WHITEBOARD_ACCESS_DENIED', `Permission denied: ${permission}`);
  }

  private async getNextLayerIndex(whiteboardId: string): Promise<number> {
    const query = `
      SELECT COALESCE(MAX(layer_index), 0) + 1 as next_layer
      FROM whiteboard_elements
      WHERE whiteboard_id = $1 AND deleted_at IS NULL
    `;

    const result = await this.db.query(query, [whiteboardId]);
    return parseInt(result.rows[0]?.next_layer || '1');
  }

  private async updateWhiteboardVersion(whiteboardId: string, userId: string): Promise<void> {
    const query = `
      UPDATE whiteboards
      SET updated_at = $1, last_modified_by = $2, version = version + 1
      WHERE id = $3
    `;

    await this.db.query(query, [new Date().toISOString(), userId, whiteboardId]);
  }

  private async logActivity(
    whiteboardId: string,
    userId: string,
    action: string,
    targetType: string,
    targetId: string,
    actionData: any
  ): Promise<void> {
    const query = `
      INSERT INTO whiteboard_activity_log (
        id, whiteboard_id, user_id, action, target_type, target_id,
        action_data, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `;

    await this.db.query(query, [
      randomUUID(),
      whiteboardId,
      userId,
      action,
      targetType,
      targetId,
      JSON.stringify(actionData),
      new Date().toISOString(),
    ]);
  }

  private async deleteChildElements(parentId: string, userId: string): Promise<void> {
    const query = `
      UPDATE whiteboard_elements
      SET deleted_at = $1, last_modified_by = $2, updated_at = $1
      WHERE parent_id = $3 AND deleted_at IS NULL
    `;

    await this.db.query(query, [new Date().toISOString(), userId, parentId]);
  }

  private async bulkDelete(elementIds: string[], userId: string, operationId: string): Promise<void> {
    if (elementIds.length === 0) return;

    const query = `
      UPDATE whiteboard_elements
      SET deleted_at = $1, last_modified_by = $2, updated_at = $1
      WHERE id = ANY($3) AND deleted_at IS NULL
    `;

    await this.db.query(query, [new Date().toISOString(), userId, elementIds]);
  }

  private async bulkMove(elementIds: string[], layerIndexDelta: number, userId: string, operationId: string): Promise<void> {
    if (elementIds.length === 0 || layerIndexDelta === 0) return;

    const query = `
      UPDATE whiteboard_elements
      SET layer_index = layer_index + $1, last_modified_by = $2, updated_at = $3, version = version + 1
      WHERE id = ANY($4) AND deleted_at IS NULL
    `;

    await this.db.query(query, [layerIndexDelta, userId, new Date().toISOString(), elementIds]);
  }

  private async bulkStyle(elementIds: string[], styleData: any, userId: string, operationId: string): Promise<void> {
    if (elementIds.length === 0) return;

    const query = `
      UPDATE whiteboard_elements
      SET style_data = style_data || $1, last_modified_by = $2, updated_at = $3, version = version + 1
      WHERE id = ANY($4) AND deleted_at IS NULL
    `;

    await this.db.query(query, [JSON.stringify(styleData), userId, new Date().toISOString(), elementIds]);
  }

  private async bulkGroup(elementIds: string[], parentId: string | undefined, userId: string, operationId: string): Promise<void> {
    if (elementIds.length === 0) return;

    const query = `
      UPDATE whiteboard_elements
      SET parent_id = $1, last_modified_by = $2, updated_at = $3, version = version + 1
      WHERE id = ANY($4) AND deleted_at IS NULL
    `;

    await this.db.query(query, [parentId, userId, new Date().toISOString(), elementIds]);
  }

  private async bulkUngroup(elementIds: string[], userId: string, operationId: string): Promise<void> {
    if (elementIds.length === 0) return;

    const query = `
      UPDATE whiteboard_elements
      SET parent_id = NULL, last_modified_by = $1, updated_at = $2, version = version + 1
      WHERE id = ANY($3) AND deleted_at IS NULL
    `;

    await this.db.query(query, [userId, new Date().toISOString(), elementIds]);
  }

  private mapDatabaseRowToElement(row: any): WhiteboardElement | null {
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

  /**
   * Sanitize JSONB field data
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
   * Sanitize individual values recursively
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
        if (count++ >= 100) break;
        const sanitizedKey = sanitizeInput(key);
        if (sanitizedKey) {
          sanitized[sanitizedKey] = this.sanitizeValue(val, maxDepth - 1);
        }
      }
      return sanitized;
    }

    return null;
  }

  private createWhiteboardError(code: string, message: string, details?: any): WhiteboardError {
    const sanitizedDetails = details ? this.sanitizeValue(details, 2) : undefined;
    
    const error = new Error(message) as any;
    error.code = code;
    error.details = sanitizedDetails;
    return error;
  }
}