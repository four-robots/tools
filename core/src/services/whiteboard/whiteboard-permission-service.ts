import { DatabasePool } from '../../utils/database-pool.js';
import { Logger } from '../../utils/logger.js';
import {
  WhiteboardPermission,
  WhiteboardPermissions,
  GrantPermissionRequest,
  WhiteboardRole,
  WhiteboardError,
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
 * Default permissions for each role
 */
const DEFAULT_ROLE_PERMISSIONS: Record<WhiteboardRole, WhiteboardPermissions> = {
  owner: {
    canEdit: true,
    canDelete: true,
    canComment: true,
    canShare: true,
    canManagePermissions: true,
    canExport: true,
    canCreateTemplates: true,
    canViewHistory: true,
    canRestoreVersions: true,
    elementPermissions: {
      canCreateElements: true,
      canEditElements: true,
      canDeleteElements: true,
      canMoveElements: true,
      canStyleElements: true,
      canGroupElements: true,
      restrictedElementTypes: [],
    },
  },
  editor: {
    canEdit: true,
    canDelete: false,
    canComment: true,
    canShare: true,
    canManagePermissions: false,
    canExport: true,
    canCreateTemplates: false,
    canViewHistory: true,
    canRestoreVersions: false,
    elementPermissions: {
      canCreateElements: true,
      canEditElements: true,
      canDeleteElements: true,
      canMoveElements: true,
      canStyleElements: true,
      canGroupElements: true,
      restrictedElementTypes: [],
    },
  },
  commenter: {
    canEdit: false,
    canDelete: false,
    canComment: true,
    canShare: false,
    canManagePermissions: false,
    canExport: false,
    canCreateTemplates: false,
    canViewHistory: false,
    canRestoreVersions: false,
    elementPermissions: {
      canCreateElements: false,
      canEditElements: false,
      canDeleteElements: false,
      canMoveElements: false,
      canStyleElements: false,
      canGroupElements: false,
      restrictedElementTypes: [],
    },
  },
  viewer: {
    canEdit: false,
    canDelete: false,
    canComment: false,
    canShare: false,
    canManagePermissions: false,
    canExport: false,
    canCreateTemplates: false,
    canViewHistory: false,
    canRestoreVersions: false,
    elementPermissions: {
      canCreateElements: false,
      canEditElements: false,
      canDeleteElements: false,
      canMoveElements: false,
      canStyleElements: false,
      canGroupElements: false,
      restrictedElementTypes: [],
    },
  },
};

/**
 * Whiteboard permission management service
 * Handles access control and permission management for whiteboards
 */
export class WhiteboardPermissionService {
  private logger: Logger;

  constructor(
    private db: DatabasePool,
    logger?: Logger
  ) {
    this.logger = logger || new Logger('WhiteboardPermissionService');
  }

  /**
   * Grant permission to a user
   */
  async grantPermission(
    whiteboardId: string,
    grantedBy: string,
    request: GrantPermissionRequest
  ): Promise<WhiteboardPermission> {
    try {
      const permissionId = randomUUID();
      const now = new Date().toISOString();

      // Validate that the granter has permission management rights
      await this.checkPermissionManagementAccess(whiteboardId, grantedBy);

      // Get default permissions for role, then merge with custom permissions
      const defaultPermissions = DEFAULT_ROLE_PERMISSIONS[request.role];
      const finalPermissions = request.permissions 
        ? this.mergePermissions(defaultPermissions, request.permissions)
        : defaultPermissions;

      const permission: WhiteboardPermission = {
        id: permissionId,
        whiteboardId,
        userId: request.userId,
        role: request.role,
        permissions: finalPermissions,
        grantedBy,
        expiresAt: request.expiresAt,
        createdAt: now,
        updatedAt: now,
      };

      // Check if permission already exists
      const existingQuery = `
        SELECT id FROM whiteboard_permissions
        WHERE whiteboard_id = $1 AND user_id = $2
      `;

      const existingResult = await this.db.query(existingQuery, [whiteboardId, request.userId]);

      let query: string;
      let values: any[];

      if (existingResult.rows.length > 0) {
        // Update existing permission
        query = `
          UPDATE whiteboard_permissions
          SET role = $1, permissions = $2, granted_by = $3, expires_at = $4, updated_at = $5
          WHERE whiteboard_id = $6 AND user_id = $7
          RETURNING *
        `;
        values = [
          permission.role,
          JSON.stringify(permission.permissions),
          permission.grantedBy,
          permission.expiresAt,
          permission.updatedAt,
          whiteboardId,
          request.userId,
        ];
      } else {
        // Create new permission
        query = `
          INSERT INTO whiteboard_permissions (
            id, whiteboard_id, user_id, role, permissions, granted_by,
            expires_at, created_at, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING *
        `;
        values = [
          permission.id,
          permission.whiteboardId,
          permission.userId,
          permission.role,
          JSON.stringify(permission.permissions),
          permission.grantedBy,
          permission.expiresAt,
          permission.createdAt,
          permission.updatedAt,
        ];
      }

      const result = await this.db.query(query, values);

      if (result.rows.length === 0) {
        throw new Error('Failed to grant permission');
      }

      // Log activity
      await this.logActivity(whiteboardId, grantedBy, 'permission_granted', request.userId, {
        role: request.role,
        expiresAt: request.expiresAt,
      });

      this.logger.info('Permission granted successfully', { whiteboardId, userId: request.userId, role: request.role });

      return this.mapDatabaseRowToPermission(result.rows[0]);
    } catch (error) {
      this.logger.error('Failed to grant permission', { error, whiteboardId, request });
      throw error;
    }
  }

  /**
   * Revoke permission from a user
   */
  async revokePermission(
    whiteboardId: string,
    userId: string,
    revokedBy: string
  ): Promise<void> {
    try {
      // Validate that the revoker has permission management rights
      await this.checkPermissionManagementAccess(whiteboardId, revokedBy);

      // Check if user is the whiteboard creator (cannot revoke creator permissions)
      const creatorQuery = `
        SELECT created_by FROM whiteboards
        WHERE id = $1 AND deleted_at IS NULL
      `;

      const creatorResult = await this.db.query(creatorQuery, [whiteboardId]);
      
      if (creatorResult.rows.length === 0) {
        throw this.createWhiteboardError('WHITEBOARD_NOT_FOUND', 'Whiteboard not found');
      }

      if (creatorResult.rows[0].created_by === userId) {
        throw this.createWhiteboardError('PERMISSION_DENIED', 'Cannot revoke permissions from whiteboard creator');
      }

      const query = `
        DELETE FROM whiteboard_permissions
        WHERE whiteboard_id = $1 AND user_id = $2
      `;

      const result = await this.db.query(query, [whiteboardId, userId]);

      if (result.rowCount === 0) {
        throw this.createWhiteboardError('PERMISSION_DENIED', 'Permission not found or already revoked');
      }

      // Log activity
      await this.logActivity(whiteboardId, revokedBy, 'permission_revoked', userId, {});

      this.logger.info('Permission revoked successfully', { whiteboardId, userId, revokedBy });
    } catch (error) {
      this.logger.error('Failed to revoke permission', { error, whiteboardId, userId });
      throw error;
    }
  }

  /**
   * Get user permissions for a whiteboard
   */
  async getUserPermissions(
    whiteboardId: string,
    userId: string
  ): Promise<WhiteboardPermissions> {
    try {
      // Check if user is the creator (creators have all permissions)
      const creatorQuery = `
        SELECT created_by FROM whiteboards
        WHERE id = $1 AND deleted_at IS NULL
      `;

      const creatorResult = await this.db.query(creatorQuery, [whiteboardId]);
      
      if (creatorResult.rows.length === 0) {
        throw this.createWhiteboardError('WHITEBOARD_NOT_FOUND', 'Whiteboard not found');
      }

      if (creatorResult.rows[0].created_by === userId) {
        return DEFAULT_ROLE_PERMISSIONS.owner;
      }

      // Get explicit permissions
      const permissionQuery = `
        SELECT role, permissions, expires_at
        FROM whiteboard_permissions
        WHERE whiteboard_id = $1 AND user_id = $2
      `;

      const permissionResult = await this.db.query(permissionQuery, [whiteboardId, userId]);

      if (permissionResult.rows.length === 0) {
        // No explicit permissions, check whiteboard visibility
        const visibilityQuery = `
          SELECT visibility FROM whiteboards
          WHERE id = $1 AND deleted_at IS NULL
        `;

        const visibilityResult = await this.db.query(visibilityQuery, [whiteboardId]);
        
        if (visibilityResult.rows.length > 0 && visibilityResult.rows[0].visibility === 'public') {
          return DEFAULT_ROLE_PERMISSIONS.viewer;
        }

        // No access
        return DEFAULT_ROLE_PERMISSIONS.viewer;
      }

      const row = permissionResult.rows[0];

      // Check if permission is expired
      if (row.expires_at && new Date(row.expires_at) < new Date()) {
        return DEFAULT_ROLE_PERMISSIONS.viewer;
      }

      // Return custom permissions if available, otherwise default role permissions
      return row.permissions ? this.sanitizeJsonField(row.permissions) : DEFAULT_ROLE_PERMISSIONS[row.role];
    } catch (error) {
      this.logger.error('Failed to get user permissions', { error, whiteboardId, userId });
      throw error;
    }
  }

  /**
   * Check if user has specific permission
   */
  async hasPermission(
    whiteboardId: string,
    userId: string,
    permission: keyof WhiteboardPermissions
  ): Promise<boolean> {
    try {
      const permissions = await this.getUserPermissions(whiteboardId, userId);
      return permissions[permission] === true;
    } catch (error) {
      this.logger.error('Failed to check permission', { error, whiteboardId, userId, permission });
      return false;
    }
  }

  /**
   * List all permissions for a whiteboard
   */
  async listPermissions(
    whiteboardId: string,
    requesterId: string
  ): Promise<WhiteboardPermission[]> {
    try {
      // Validate that the requester can view permissions
      await this.checkPermissionManagementAccess(whiteboardId, requesterId);

      const query = `
        SELECT * FROM whiteboard_permissions
        WHERE whiteboard_id = $1
        ORDER BY created_at ASC
      `;

      const result = await this.db.query(query, [whiteboardId]);

      return result.rows.map(row => this.mapDatabaseRowToPermission(row));
    } catch (error) {
      this.logger.error('Failed to list permissions', { error, whiteboardId, requesterId });
      throw error;
    }
  }

  /**
   * Cleanup expired permissions
   */
  async cleanupExpiredPermissions(): Promise<number> {
    try {
      const query = `
        DELETE FROM whiteboard_permissions
        WHERE expires_at IS NOT NULL AND expires_at < NOW()
      `;

      const result = await this.db.query(query);
      const deletedCount = result.rowCount || 0;

      if (deletedCount > 0) {
        this.logger.info('Expired permissions cleaned up', { deletedCount });
      }

      return deletedCount;
    } catch (error) {
      this.logger.error('Failed to cleanup expired permissions', { error });
      throw error;
    }
  }

  // Private helper methods

  private async checkPermissionManagementAccess(whiteboardId: string, userId: string): Promise<void> {
    // Check if user is the creator
    const creatorQuery = `
      SELECT created_by FROM whiteboards
      WHERE id = $1 AND deleted_at IS NULL
    `;

    const creatorResult = await this.db.query(creatorQuery, [whiteboardId]);
    
    if (creatorResult.rows.length === 0) {
      throw this.createWhiteboardError('WHITEBOARD_NOT_FOUND', 'Whiteboard not found');
    }

    if (creatorResult.rows[0].created_by === userId) {
      return; // Creator can manage permissions
    }

    // Check if user has permission management rights
    const permissionQuery = `
      SELECT role, permissions FROM whiteboard_permissions
      WHERE whiteboard_id = $1 AND user_id = $2
    `;

    const permissionResult = await this.db.query(permissionQuery, [whiteboardId, userId]);

    if (permissionResult.rows.length === 0) {
      throw this.createWhiteboardError('PERMISSION_DENIED', 'Access denied: cannot manage permissions');
    }

    const row = permissionResult.rows[0];

    // Owners can manage permissions
    if (row.role === 'owner') {
      return;
    }

    // Check specific permission
    const permissions = row.permissions ? this.sanitizeJsonField(row.permissions) : DEFAULT_ROLE_PERMISSIONS[row.role];
    if (permissions.canManagePermissions === true) {
      return;
    }

    throw this.createWhiteboardError('PERMISSION_DENIED', 'Access denied: cannot manage permissions');
  }

  private mergePermissions(
    defaultPermissions: WhiteboardPermissions,
    customPermissions: Partial<WhiteboardPermissions>
  ): WhiteboardPermissions {
    const merged = { ...defaultPermissions };

    // Merge top-level permissions
    Object.keys(customPermissions).forEach(key => {
      if (key !== 'elementPermissions' && customPermissions[key as keyof WhiteboardPermissions] !== undefined) {
        (merged as any)[key] = (customPermissions as any)[key];
      }
    });

    // Merge element permissions
    if (customPermissions.elementPermissions) {
      merged.elementPermissions = {
        ...merged.elementPermissions,
        ...customPermissions.elementPermissions,
      };
    }

    return merged;
  }

  private async logActivity(
    whiteboardId: string,
    userId: string,
    action: string,
    targetUserId: string,
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
      'permission',
      targetUserId,
      JSON.stringify(actionData),
      new Date().toISOString(),
    ]);
  }

  private mapDatabaseRowToPermission(row: any): WhiteboardPermission {
    if (!row || !row.id) {
      throw this.createWhiteboardError('INVALID_ROW_DATA', 'Invalid permission data received from database');
    }

    return {
      id: row.id,
      whiteboardId: row.whiteboard_id,
      userId: row.user_id,
      role: row.role,
      permissions: this.sanitizeJsonField(row.permissions),
      grantedBy: row.granted_by,
      expiresAt: row.expires_at?.toISOString(),
      createdAt: row.created_at?.toISOString() || new Date().toISOString(),
      updatedAt: row.updated_at?.toISOString() || new Date().toISOString(),
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
      return value.slice(0, 100).map(item => this.sanitizeValue(item, maxDepth - 1));
    }

    if (typeof value === 'object') {
      const sanitized: any = {};
      let count = 0;
      for (const [key, val] of Object.entries(value)) {
        if (count++ >= 50) break;
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