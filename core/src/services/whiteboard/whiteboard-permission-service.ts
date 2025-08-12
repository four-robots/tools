/**
 * Whiteboard Permission Service
 * 
 * Implements comprehensive Role-Based Access Control (RBAC) for whiteboards with:
 * - Granular permission management
 * - Real-time permission updates
 * - Element-level permissions
 * - Area-based restrictions
 * - Time-based permissions
 * - Permission inheritance and delegation
 */

import { DatabasePool } from '../../utils/database-pool.js';
import { Logger } from '../../utils/logger.js';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { sanitizeInput } from '../../utils/sql-security.js';

// Permission-related types
export const WhiteboardPermissionRole = z.enum(['owner', 'editor', 'commenter', 'viewer', 'custom']);
export type WhiteboardPermissionRole = z.infer<typeof WhiteboardPermissionRole>;

export const WhiteboardPermissionAction = z.enum([
  // Basic CRUD permissions
  'canView', 'canEdit', 'canDelete', 'canComment',
  
  // Element permissions
  'canCreateElements', 'canUpdateElements', 'canDeleteElements', 'canMoveElements',
  'canResizeElements', 'canStyleElements', 'canLockElements', 'canGroupElements',
  
  // Advanced permissions
  'canManagePermissions', 'canShare', 'canExport', 'canCreateTemplates',
  'canViewHistory', 'canRestoreVersions', 'canManageComments',
  
  // Area-based permissions
  'canEditArea', 'canViewArea', 'canCommentArea',
  
  // Layer permissions
  'canEditLayer', 'canViewLayer', 'canManageLayerOrder',
  
  // Real-time collaboration
  'canSeePresence', 'canSeeCursors', 'canUseVoiceChat', 'canScreenShare'
]);
export type WhiteboardPermissionAction = z.infer<typeof WhiteboardPermissionAction>;

// Granular permission definitions
export const ElementPermission = z.object({
  elementId: z.string().uuid(),
  elementType: z.string(),
  canView: z.boolean().default(true),
  canEdit: z.boolean().default(false),
  canDelete: z.boolean().default(false),
  canMove: z.boolean().default(false),
  canStyle: z.boolean().default(false),
  canComment: z.boolean().default(true),
  inheritFromParent: z.boolean().default(true),
});
export type ElementPermission = z.infer<typeof ElementPermission>;

export const AreaPermission = z.object({
  areaId: z.string().uuid(),
  name: z.string(),
  bounds: z.object({
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
  }),
  canView: z.boolean().default(true),
  canEdit: z.boolean().default(false),
  canComment: z.boolean().default(true),
  priority: z.number().default(0), // Higher priority overrides lower
});
export type AreaPermission = z.infer<typeof AreaPermission>;

export const LayerPermission = z.object({
  layerIndex: z.number(),
  layerName: z.string().optional(),
  canView: z.boolean().default(true),
  canEdit: z.boolean().default(false),
  canReorder: z.boolean().default(false),
});
export type LayerPermission = z.infer<typeof LayerPermission>;

export const TimeBasedPermission = z.object({
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
  timezone: z.string().default('UTC'),
  isActive: z.boolean().default(true),
  recurringPattern: z.enum(['none', 'daily', 'weekly', 'monthly']).default('none'),
});
export type TimeBasedPermission = z.infer<typeof TimeBasedPermission>;

export const CustomPermissionSet = z.object({
  // Basic permissions
  canView: z.boolean().default(true),
  canEdit: z.boolean().default(false),
  canDelete: z.boolean().default(false),
  canComment: z.boolean().default(true),
  
  // Element permissions
  canCreateElements: z.boolean().default(false),
  canUpdateElements: z.boolean().default(false),
  canDeleteElements: z.boolean().default(false),
  canMoveElements: z.boolean().default(false),
  canResizeElements: z.boolean().default(false),
  canStyleElements: z.boolean().default(false),
  canLockElements: z.boolean().default(false),
  canGroupElements: z.boolean().default(false),
  
  // Advanced permissions
  canManagePermissions: z.boolean().default(false),
  canShare: z.boolean().default(false),
  canExport: z.boolean().default(false),
  canCreateTemplates: z.boolean().default(false),
  canViewHistory: z.boolean().default(false),
  canRestoreVersions: z.boolean().default(false),
  canManageComments: z.boolean().default(false),
  
  // Real-time permissions
  canSeePresence: z.boolean().default(true),
  canSeeCursors: z.boolean().default(true),
  canUseVoiceChat: z.boolean().default(false),
  canScreenShare: z.boolean().default(false),
  
  // Granular permissions
  elementPermissions: z.array(ElementPermission).default([]),
  areaPermissions: z.array(AreaPermission).default([]),
  layerPermissions: z.array(LayerPermission).default([]),
  timeBased: TimeBasedPermission.optional(),
});
export type CustomPermissionSet = z.infer<typeof CustomPermissionSet>;

export const WhiteboardUserPermission = z.object({
  id: z.string().uuid(),
  whiteboardId: z.string().uuid(),
  userId: z.string().uuid(),
  role: WhiteboardPermissionRole,
  permissions: CustomPermissionSet,
  grantedBy: z.string().uuid(),
  grantedAt: z.string().datetime(),
  expiresAt: z.string().datetime().optional(),
  isActive: z.boolean().default(true),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type WhiteboardUserPermission = z.infer<typeof WhiteboardUserPermission>;

export const PermissionCheckRequest = z.object({
  whiteboardId: z.string().uuid(),
  userId: z.string().uuid(),
  action: WhiteboardPermissionAction,
  elementId: z.string().uuid().optional(),
  areaCoordinates: z.object({
    x: z.number(),
    y: z.number(),
  }).optional(),
  layerIndex: z.number().optional(),
});
export type PermissionCheckRequest = z.infer<typeof PermissionCheckRequest>;

export const PermissionCheckResult = z.object({
  allowed: z.boolean(),
  reason: z.string().optional(),
  appliedRule: z.string().optional(),
  restrictions: z.array(z.string()).default([]),
  suggestions: z.array(z.string()).default([]),
});
export type PermissionCheckResult = z.infer<typeof PermissionCheckResult>;

// Role-based permission templates
const ROLE_PERMISSION_TEMPLATES: Record<string, CustomPermissionSet> = {
  owner: {
    canView: true,
    canEdit: true,
    canDelete: true,
    canComment: true,
    canCreateElements: true,
    canUpdateElements: true,
    canDeleteElements: true,
    canMoveElements: true,
    canResizeElements: true,
    canStyleElements: true,
    canLockElements: true,
    canGroupElements: true,
    canManagePermissions: true,
    canShare: true,
    canExport: true,
    canCreateTemplates: true,
    canViewHistory: true,
    canRestoreVersions: true,
    canManageComments: true,
    canSeePresence: true,
    canSeeCursors: true,
    canUseVoiceChat: true,
    canScreenShare: true,
    elementPermissions: [],
    areaPermissions: [],
    layerPermissions: [],
  },
  
  editor: {
    canView: true,
    canEdit: true,
    canDelete: false,
    canComment: true,
    canCreateElements: true,
    canUpdateElements: true,
    canDeleteElements: true,
    canMoveElements: true,
    canResizeElements: true,
    canStyleElements: true,
    canLockElements: false,
    canGroupElements: true,
    canManagePermissions: false,
    canShare: true,
    canExport: true,
    canCreateTemplates: false,
    canViewHistory: true,
    canRestoreVersions: false,
    canManageComments: false,
    canSeePresence: true,
    canSeeCursors: true,
    canUseVoiceChat: true,
    canScreenShare: false,
    elementPermissions: [],
    areaPermissions: [],
    layerPermissions: [],
  },
  
  commenter: {
    canView: true,
    canEdit: false,
    canDelete: false,
    canComment: true,
    canCreateElements: false,
    canUpdateElements: false,
    canDeleteElements: false,
    canMoveElements: false,
    canResizeElements: false,
    canStyleElements: false,
    canLockElements: false,
    canGroupElements: false,
    canManagePermissions: false,
    canShare: false,
    canExport: true,
    canCreateTemplates: false,
    canViewHistory: false,
    canRestoreVersions: false,
    canManageComments: false,
    canSeePresence: true,
    canSeeCursors: true,
    canUseVoiceChat: false,
    canScreenShare: false,
    elementPermissions: [],
    areaPermissions: [],
    layerPermissions: [],
  },
  
  viewer: {
    canView: true,
    canEdit: false,
    canDelete: false,
    canComment: false,
    canCreateElements: false,
    canUpdateElements: false,
    canDeleteElements: false,
    canMoveElements: false,
    canResizeElements: false,
    canStyleElements: false,
    canLockElements: false,
    canGroupElements: false,
    canManagePermissions: false,
    canShare: false,
    canExport: true,
    canCreateTemplates: false,
    canViewHistory: false,
    canRestoreVersions: false,
    canManageComments: false,
    canSeePresence: true,
    canSeeCursors: true,
    canUseVoiceChat: false,
    canScreenShare: false,
    elementPermissions: [],
    areaPermissions: [],
    layerPermissions: [],
  },
};

/**
 * Permission Service Error
 */
export class WhiteboardPermissionError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any
  ) {
    super(message);
    this.name = 'WhiteboardPermissionError';
  }
}

/**
 * Whiteboard Permission Service
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
   * Check if user has specific permission
   */
  async checkPermission(request: PermissionCheckRequest): Promise<PermissionCheckResult> {
    try {
      const validatedRequest = PermissionCheckRequest.parse(request);
      
      // Get user permissions
      const userPermissions = await this.getUserPermissions(
        validatedRequest.whiteboardId,
        validatedRequest.userId
      );

      if (!userPermissions) {
        // Check if user is whiteboard creator
        const isCreator = await this.isWhiteboardCreator(
          validatedRequest.whiteboardId,
          validatedRequest.userId
        );

        if (isCreator) {
          return { allowed: true, reason: 'User is whiteboard creator', appliedRule: 'creator' };
        }

        return {
          allowed: false,
          reason: 'No permissions found for user',
          suggestions: ['Request access from whiteboard owner'],
        };
      }

      // Check if permissions are expired
      if (userPermissions.expiresAt && new Date(userPermissions.expiresAt) < new Date()) {
        return {
          allowed: false,
          reason: 'Permissions have expired',
          suggestions: ['Request renewed access'],
        };
      }

      // Check time-based restrictions
      if (userPermissions.permissions.timeBased) {
        const timeCheck = this.checkTimeBasedPermission(userPermissions.permissions.timeBased);
        if (!timeCheck.allowed) {
          return timeCheck;
        }
      }

      // Check specific permission
      const permissionResult = this.evaluatePermission(
        userPermissions.permissions,
        validatedRequest
      );

      this.logger.debug('Permission check completed', {
        whiteboardId: validatedRequest.whiteboardId,
        userId: validatedRequest.userId,
        action: validatedRequest.action,
        result: permissionResult,
      });

      return permissionResult;
    } catch (error) {
      this.logger.error('Failed to check permission', { error, request });
      throw new WhiteboardPermissionError(
        'Permission check failed',
        'PERMISSION_CHECK_FAILED',
        { originalError: error }
      );
    }
  }

  /**
   * Grant permissions to user
   */
  async grantPermission(
    whiteboardId: string,
    userId: string,
    grantedByUserId: string,
    role: WhiteboardPermissionRole,
    customPermissions?: Partial<CustomPermissionSet>,
    expiresAt?: string
  ): Promise<WhiteboardUserPermission> {
    try {
      // Check if granter has permission management rights
      const granterCheck = await this.checkPermission({
        whiteboardId,
        userId: grantedByUserId,
        action: 'canManagePermissions',
      });

      if (!granterCheck.allowed) {
        throw new WhiteboardPermissionError(
          'Insufficient permissions to grant access',
          'INSUFFICIENT_PERMISSIONS'
        );
      }

      // Build permissions based on role and custom overrides
      let permissions = ROLE_PERMISSION_TEMPLATES[role] || ROLE_PERMISSION_TEMPLATES.viewer;
      
      if (customPermissions) {
        permissions = { ...permissions, ...customPermissions };
      }

      const validatedPermissions = CustomPermissionSet.parse(permissions);
      const permissionId = randomUUID();
      const now = new Date().toISOString();

      // Insert or update permission
      const query = `
        INSERT INTO whiteboard_permissions (
          id, whiteboard_id, user_id, role, permissions, granted_by, expires_at, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (whiteboard_id, user_id) 
        DO UPDATE SET
          role = EXCLUDED.role,
          permissions = EXCLUDED.permissions,
          granted_by = EXCLUDED.granted_by,
          expires_at = EXCLUDED.expires_at,
          updated_at = EXCLUDED.updated_at
        RETURNING *
      `;

      const result = await this.db.query(query, [
        permissionId,
        whiteboardId,
        userId,
        role,
        JSON.stringify(validatedPermissions),
        grantedByUserId,
        expiresAt || null,
        now,
        now,
      ]);

      if (result.rows.length === 0) {
        throw new Error('Failed to grant permission');
      }

      const grantedPermission = this.mapDatabaseRowToPermission(result.rows[0]);

      // Log permission grant
      await this.logPermissionChange(
        whiteboardId,
        userId,
        grantedByUserId,
        'permission_granted',
        { role, permissions: validatedPermissions, expiresAt }
      );

      this.logger.info('Permission granted successfully', {
        whiteboardId,
        userId,
        grantedBy: grantedByUserId,
        role,
        permissionId,
      });

      return grantedPermission;
    } catch (error) {
      this.logger.error('Failed to grant permission', { error, whiteboardId, userId });
      throw error;
    }
  }

  /**
   * Revoke user permissions
   */
  async revokePermission(
    whiteboardId: string,
    userId: string,
    revokedByUserId: string
  ): Promise<void> {
    try {
      // Check if revoker has permission management rights
      const revokerCheck = await this.checkPermission({
        whiteboardId,
        userId: revokedByUserId,
        action: 'canManagePermissions',
      });

      if (!revokerCheck.allowed) {
        throw new WhiteboardPermissionError(
          'Insufficient permissions to revoke access',
          'INSUFFICIENT_PERMISSIONS'
        );
      }

      // Cannot revoke owner permissions
      const targetPermissions = await this.getUserPermissions(whiteboardId, userId);
      if (targetPermissions?.role === 'owner') {
        throw new WhiteboardPermissionError(
          'Cannot revoke owner permissions',
          'CANNOT_REVOKE_OWNER'
        );
      }

      const query = `
        DELETE FROM whiteboard_permissions 
        WHERE whiteboard_id = $1 AND user_id = $2
      `;

      const result = await this.db.query(query, [whiteboardId, userId]);

      if (result.rowCount === 0) {
        throw new WhiteboardPermissionError(
          'No permissions found to revoke',
          'PERMISSION_NOT_FOUND'
        );
      }

      // Log permission revocation
      await this.logPermissionChange(
        whiteboardId,
        userId,
        revokedByUserId,
        'permission_revoked',
        {}
      );

      this.logger.info('Permission revoked successfully', {
        whiteboardId,
        userId,
        revokedBy: revokedByUserId,
      });
    } catch (error) {
      this.logger.error('Failed to revoke permission', { error, whiteboardId, userId });
      throw error;
    }
  }

  /**
   * Get user permissions for whiteboard
   */
  async getUserPermissions(
    whiteboardId: string,
    userId: string
  ): Promise<WhiteboardUserPermission | null> {
    try {
      // Optimized query with explicit index hints and targeted projection
      const query = `
        SELECT /*+ INDEX(wp idx_whiteboard_permissions_whiteboard_user) */
               wp.id, wp.whiteboard_id, wp.user_id, wp.role, wp.permissions,
               wp.granted_by, wp.expires_at, wp.created_at, wp.updated_at,
               w.created_by as whiteboard_creator
        FROM whiteboard_permissions wp
        INNER JOIN whiteboards w ON (wp.whiteboard_id = w.id)
        WHERE wp.whiteboard_id = $1 
        AND wp.user_id = $2 
        AND w.deleted_at IS NULL
        AND (wp.expires_at IS NULL OR wp.expires_at > NOW())
        LIMIT 1
      `;

      const startTime = Date.now();
      const result = await this.db.query(query, [whiteboardId, userId]);
      const queryDuration = Date.now() - startTime;

      if (queryDuration > 50) {
        this.logger.warn('Slow permission query detected', {
          whiteboardId,
          userId,
          duration: `${queryDuration}ms`
        });
      }

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapDatabaseRowToPermission(result.rows[0]);
    } catch (error) {
      this.logger.error('Failed to get user permissions', { error, whiteboardId, userId });
      throw error;
    }
  }

  /**
   * Get all users with permissions for whiteboard
   */
  async getWhiteboardPermissions(whiteboardId: string): Promise<WhiteboardUserPermission[]> {
    try {
      const query = `
        SELECT wp.*, u.name as user_name, u.email as user_email
        FROM whiteboard_permissions wp
        JOIN users u ON wp.user_id = u.id
        JOIN whiteboards w ON wp.whiteboard_id = w.id
        WHERE wp.whiteboard_id = $1 AND w.deleted_at IS NULL
        ORDER BY wp.created_at ASC
      `;

      const result = await this.db.query(query, [whiteboardId]);

      return result.rows.map(row => this.mapDatabaseRowToPermission(row));
    } catch (error) {
      this.logger.error('Failed to get whiteboard permissions', { error, whiteboardId });
      throw error;
    }
  }

  /**
   * Update user permissions
   */
  async updatePermission(
    whiteboardId: string,
    userId: string,
    updatedByUserId: string,
    updates: Partial<{
      role: WhiteboardPermissionRole;
      permissions: Partial<CustomPermissionSet>;
      expiresAt: string;
    }>
  ): Promise<WhiteboardUserPermission> {
    try {
      // Check if updater has permission management rights
      const updaterCheck = await this.checkPermission({
        whiteboardId,
        userId: updatedByUserId,
        action: 'canManagePermissions',
      });

      if (!updaterCheck.allowed) {
        throw new WhiteboardPermissionError(
          'Insufficient permissions to update access',
          'INSUFFICIENT_PERMISSIONS'
        );
      }

      const currentPermissions = await this.getUserPermissions(whiteboardId, userId);
      if (!currentPermissions) {
        throw new WhiteboardPermissionError(
          'User permissions not found',
          'PERMISSION_NOT_FOUND'
        );
      }

      const updateFields: string[] = [];
      const values: any[] = [];
      let valueIndex = 1;

      if (updates.role !== undefined) {
        // Update role and merge with template permissions
        const rolePermissions = ROLE_PERMISSION_TEMPLATES[updates.role] || ROLE_PERMISSION_TEMPLATES.viewer;
        const mergedPermissions = { ...rolePermissions, ...(updates.permissions || {}) };
        
        updateFields.push(`role = $${valueIndex++}`);
        values.push(updates.role);
        
        updateFields.push(`permissions = $${valueIndex++}`);
        values.push(JSON.stringify(mergedPermissions));
      } else if (updates.permissions !== undefined) {
        // Update only permissions
        const mergedPermissions = { ...currentPermissions.permissions, ...updates.permissions };
        updateFields.push(`permissions = $${valueIndex++}`);
        values.push(JSON.stringify(mergedPermissions));
      }

      if (updates.expiresAt !== undefined) {
        updateFields.push(`expires_at = $${valueIndex++}`);
        values.push(updates.expiresAt);
      }

      updateFields.push(`updated_at = $${valueIndex++}`);
      values.push(new Date().toISOString());

      values.push(whiteboardId, userId);

      const query = `
        UPDATE whiteboard_permissions
        SET ${updateFields.join(', ')}
        WHERE whiteboard_id = $${valueIndex++} AND user_id = $${valueIndex++}
        RETURNING *
      `;

      const result = await this.db.query(query, values);

      if (result.rows.length === 0) {
        throw new Error('Failed to update permission');
      }

      const updatedPermission = this.mapDatabaseRowToPermission(result.rows[0]);

      // Log permission update
      await this.logPermissionChange(
        whiteboardId,
        userId,
        updatedByUserId,
        'permission_updated',
        updates
      );

      this.logger.info('Permission updated successfully', {
        whiteboardId,
        userId,
        updatedBy: updatedByUserId,
        updates,
      });

      return updatedPermission;
    } catch (error) {
      this.logger.error('Failed to update permission', { error, whiteboardId, userId });
      throw error;
    }
  }

  // Private helper methods

  private async isWhiteboardCreator(whiteboardId: string, userId: string): Promise<boolean> {
    const query = `
      SELECT 1 FROM whiteboards
      WHERE id = $1 AND created_by = $2 AND deleted_at IS NULL
      LIMIT 1
    `;

    const startTime = Date.now();
    const result = await this.db.query(query, [whiteboardId, userId]);
    const queryDuration = Date.now() - startTime;

    if (queryDuration > 25) {
      this.logger.warn('Slow creator check query detected', {
        whiteboardId,
        userId,
        duration: `${queryDuration}ms`
      });
    }

    return result.rows.length > 0;
  }

  private checkTimeBasedPermission(timeBased: TimeBasedPermission): PermissionCheckResult {
    const now = new Date();

    if (!timeBased.isActive) {
      return {
        allowed: false,
        reason: 'Time-based permissions are inactive',
      };
    }

    if (timeBased.startTime && new Date(timeBased.startTime) > now) {
      return {
        allowed: false,
        reason: 'Permission access period has not started yet',
        suggestions: [`Access will be available starting ${timeBased.startTime}`],
      };
    }

    if (timeBased.endTime && new Date(timeBased.endTime) < now) {
      return {
        allowed: false,
        reason: 'Permission access period has ended',
        suggestions: ['Request extended access'],
      };
    }

    return { allowed: true };
  }

  private evaluatePermission(
    permissions: CustomPermissionSet,
    request: PermissionCheckRequest
  ): PermissionCheckResult {
    const { action, elementId, areaCoordinates, layerIndex } = request;

    // Check basic permission
    const hasBasicPermission = permissions[action as keyof CustomPermissionSet] as boolean;
    
    if (!hasBasicPermission) {
      return {
        allowed: false,
        reason: `Missing required permission: ${action}`,
        appliedRule: 'role_based',
      };
    }

    // Check element-specific permissions
    if (elementId && permissions.elementPermissions.length > 0) {
      const elementPermission = permissions.elementPermissions.find(
        ep => ep.elementId === elementId
      );

      if (elementPermission) {
        const elementCheck = this.checkElementPermission(elementPermission, action);
        if (!elementCheck.allowed) {
          return {
            ...elementCheck,
            appliedRule: 'element_specific',
          };
        }
      }
    }

    // Check area-based permissions
    if (areaCoordinates && permissions.areaPermissions.length > 0) {
      const areaCheck = this.checkAreaPermissions(permissions.areaPermissions, areaCoordinates, action);
      if (!areaCheck.allowed) {
        return {
          ...areaCheck,
          appliedRule: 'area_based',
        };
      }
    }

    // Check layer-based permissions
    if (layerIndex !== undefined && permissions.layerPermissions.length > 0) {
      const layerPermission = permissions.layerPermissions.find(
        lp => lp.layerIndex === layerIndex
      );

      if (layerPermission) {
        const layerCheck = this.checkLayerPermission(layerPermission, action);
        if (!layerCheck.allowed) {
          return {
            ...layerCheck,
            appliedRule: 'layer_based',
          };
        }
      }
    }

    return {
      allowed: true,
      appliedRule: 'role_based',
    };
  }

  private checkElementPermission(elementPermission: ElementPermission, action: string): PermissionCheckResult {
    switch (action) {
      case 'canView':
        if (!elementPermission.canView) {
          return { allowed: false, reason: 'View access denied for this element' };
        }
        break;
      case 'canEdit':
      case 'canUpdateElements':
        if (!elementPermission.canEdit) {
          return { allowed: false, reason: 'Edit access denied for this element' };
        }
        break;
      case 'canDelete':
      case 'canDeleteElements':
        if (!elementPermission.canDelete) {
          return { allowed: false, reason: 'Delete access denied for this element' };
        }
        break;
      case 'canMoveElements':
        if (!elementPermission.canMove) {
          return { allowed: false, reason: 'Move access denied for this element' };
        }
        break;
      case 'canStyleElements':
        if (!elementPermission.canStyle) {
          return { allowed: false, reason: 'Style access denied for this element' };
        }
        break;
      case 'canComment':
        if (!elementPermission.canComment) {
          return { allowed: false, reason: 'Comment access denied for this element' };
        }
        break;
    }

    return { allowed: true };
  }

  private checkAreaPermissions(
    areaPermissions: AreaPermission[],
    coordinates: { x: number; y: number },
    action: string
  ): PermissionCheckResult {
    // Find all areas that contain the coordinates
    const matchingAreas = areaPermissions
      .filter(area => this.isPointInArea(coordinates, area.bounds))
      .sort((a, b) => b.priority - a.priority); // Higher priority first

    if (matchingAreas.length === 0) {
      return { allowed: true }; // No area restrictions apply
    }

    // Use highest priority area
    const area = matchingAreas[0];

    switch (action) {
      case 'canView':
      case 'canViewArea':
        if (!area.canView) {
          return { allowed: false, reason: `View access denied in area: ${area.name}` };
        }
        break;
      case 'canEdit':
      case 'canEditArea':
      case 'canCreateElements':
      case 'canUpdateElements':
      case 'canMoveElements':
        if (!area.canEdit) {
          return { allowed: false, reason: `Edit access denied in area: ${area.name}` };
        }
        break;
      case 'canComment':
      case 'canCommentArea':
        if (!area.canComment) {
          return { allowed: false, reason: `Comment access denied in area: ${area.name}` };
        }
        break;
    }

    return { allowed: true };
  }

  private isPointInArea(point: { x: number; y: number }, bounds: { x: number; y: number; width: number; height: number }): boolean {
    return (
      point.x >= bounds.x &&
      point.x <= bounds.x + bounds.width &&
      point.y >= bounds.y &&
      point.y <= bounds.y + bounds.height
    );
  }

  private checkLayerPermission(layerPermission: LayerPermission, action: string): PermissionCheckResult {
    switch (action) {
      case 'canView':
      case 'canViewLayer':
        if (!layerPermission.canView) {
          return { allowed: false, reason: `View access denied for layer ${layerPermission.layerIndex}` };
        }
        break;
      case 'canEdit':
      case 'canEditLayer':
      case 'canCreateElements':
      case 'canUpdateElements':
        if (!layerPermission.canEdit) {
          return { allowed: false, reason: `Edit access denied for layer ${layerPermission.layerIndex}` };
        }
        break;
      case 'canManageLayerOrder':
        if (!layerPermission.canReorder) {
          return { allowed: false, reason: `Layer reordering denied for layer ${layerPermission.layerIndex}` };
        }
        break;
    }

    return { allowed: true };
  }

  private async logPermissionChange(
    whiteboardId: string,
    targetUserId: string,
    changedByUserId: string,
    action: string,
    data: any
  ): Promise<void> {
    try {
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
        changedByUserId,
        action,
        'permission',
        targetUserId,
        JSON.stringify(data),
        new Date().toISOString(),
      ]);
    } catch (error) {
      this.logger.warn('Failed to log permission change', { error });
    }
  }

  private mapDatabaseRowToPermission(row: any): WhiteboardUserPermission {
    return {
      id: row.id,
      whiteboardId: row.whiteboard_id,
      userId: row.user_id,
      role: row.role,
      permissions: typeof row.permissions === 'string' ? JSON.parse(row.permissions) : row.permissions,
      grantedBy: row.granted_by,
      grantedAt: row.created_at,
      expiresAt: row.expires_at,
      isActive: true,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}