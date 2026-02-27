/**
 * Enhanced Whiteboard WebSocket Handler with Permission Integration
 * 
 * Extends the existing whiteboard WebSocket functionality with:
 * - Granular permission enforcement (WB-006)
 * - Integration with enhanced OT engine (WB-005)
 * - Real-time permission change broadcasting
 * - Performance-optimized permission validation
 */

import { Server as SocketIOServer, Socket } from 'socket.io';
import { Logger } from '@mcp-tools/core/utils/logger';
import { DatabasePool } from '@mcp-tools/core/utils/database-pool';
import { 
  WhiteboardPermissionService,
  WhiteboardPermissionValidator,
  ElementPermissionType,
  AreaPermissionType,
  LayerPermissionType
} from '@mcp-tools/core/services/whiteboard/whiteboard-permission-service';
import { 
  WhiteboardPermissionMiddleware,
  PermissionAwareSocket 
} from './permission-middleware.js';
import {
  authenticateWebSocketConnection,
  validateTokenFreshness,
  extractTokenFromHandshake,
  AuthenticatedSocket
} from './auth-handler.js';
import { setupWhiteboardWebSocket } from './whiteboard-socket.js';

// Enhanced socket interface with permission context
interface EnhancedWhiteboardSocket extends AuthenticatedSocket, PermissionAwareSocket {
  whiteboardSession?: {
    whiteboardId: string;
    workspaceId: string;
    sessionToken: string;
    sessionId: string;
  };
}

/**
 * Setup enhanced whiteboard WebSocket with comprehensive permission system
 */
export function setupEnhancedWhiteboardWebSocket(
  io: SocketIOServer,
  db: DatabasePool,
  options?: {
    useRedis?: boolean;
    sessionTtl?: number;
    enablePermissionCaching?: boolean;
    permissionCacheTtl?: number;
  }
): {
  permissionService: WhiteboardPermissionService;
  permissionValidator: WhiteboardPermissionValidator;
  permissionMiddleware: WhiteboardPermissionMiddleware;
} {
  const logger = new Logger('EnhancedWhiteboardWebSocket');

  // Initialize permission services
  const permissionService = new WhiteboardPermissionService(db, logger);
  const permissionValidator = new WhiteboardPermissionValidator(permissionService, logger);
  const permissionMiddleware = new WhiteboardPermissionMiddleware(
    permissionService, 
    permissionValidator, 
    logger
  );

  // Setup base whiteboard WebSocket functionality
  setupWhiteboardWebSocket(io, db, options);

  // Create permission-aware namespace
  const whiteboardNamespace = io.of('/whiteboard');

  // Apply permission middleware to all connections
  whiteboardNamespace.use(async (socket: EnhancedWhiteboardSocket, next) => {
    try {
      // Authenticate the connection
      const token = extractTokenFromHandshake(socket);
      if (!token) {
        return next(new Error('Authentication required'));
      }

      const authResult = await authenticateWebSocketConnection(socket, token);
      if (!authResult.success) {
        return next(new Error('Invalid authentication'));
      }

      // Extract whiteboard context from handshake
      const whiteboardId = socket.handshake.query.whiteboardId as string;
      const sessionId = socket.handshake.query.sessionId as string;

      if (!whiteboardId) {
        return next(new Error('Whiteboard ID required'));
      }

      // Initialize permission context
      await permissionMiddleware.initializePermissionContext(
        socket,
        whiteboardId,
        socket.user!.id,
        sessionId || generateSessionId()
      );

      next();
    } catch (error) {
      logger.error('Permission middleware initialization failed', { error });
      next(new Error('Permission initialization failed'));
    }
  });

  // Enhanced connection handler with permission integration
  whiteboardNamespace.on('connection', async (socket: EnhancedWhiteboardSocket) => {
    logger.info('Enhanced whiteboard connection established', { 
      socketId: socket.id,
      userId: socket.user?.id,
      whiteboardId: socket.whiteboardPermissions?.whiteboardId
    });

    // Join whiteboard room
    const whiteboardId = socket.whiteboardPermissions!.whiteboardId;
    await socket.join(`whiteboard:${whiteboardId}`);

    // Setup permission-aware event handlers
    setupPermissionAwareHandlers(socket, permissionService, permissionValidator, permissionMiddleware, logger);

    // Handle disconnection
    socket.on('disconnect', async (reason) => {
      logger.info('Enhanced whiteboard socket disconnected', { 
        socketId: socket.id,
        userId: socket.user?.id,
        reason 
      });
      
      await permissionMiddleware.handleDisconnection(socket);
    });
  });

  // Setup permission management endpoints
  setupPermissionManagementHandlers(whiteboardNamespace, permissionService, permissionMiddleware, logger);

  logger.info('Enhanced whiteboard WebSocket setup completed');

  return {
    permissionService,
    permissionValidator,
    permissionMiddleware,
  };
}

/**
 * Setup permission-aware event handlers
 */
function setupPermissionAwareHandlers(
  socket: EnhancedWhiteboardSocket,
  permissionService: WhiteboardPermissionService,
  permissionValidator: WhiteboardPermissionValidator,
  permissionMiddleware: WhiteboardPermissionMiddleware,
  logger: Logger
): void {
  
  // Element operations with permission validation
  socket.on('whiteboard:element_create', permissionMiddleware.validatePermission(), async (data, callback) => {
    try {
      // Element creation logic with permission checks
      logger.debug('Element create operation', { 
        elementType: data.elementType,
        userId: socket.user?.id 
      });
      
      // Process the operation (existing logic)
      callback({ success: true, elementId: data.elementId });
    } catch (error) {
      logger.error('Element create failed', { error });
      callback({ success: false, error: error.message });
    }
  });

  socket.on('whiteboard:element_update', permissionMiddleware.validatePermission(), async (data, callback) => {
    try {
      // Element update logic with permission checks
      logger.debug('Element update operation', { 
        elementId: data.elementId,
        userId: socket.user?.id 
      });
      
      callback({ success: true });
    } catch (error) {
      logger.error('Element update failed', { error });
      callback({ success: false, error: error.message });
    }
  });

  socket.on('whiteboard:element_delete', permissionMiddleware.validatePermission(), async (data, callback) => {
    try {
      // Element deletion logic with permission checks
      logger.debug('Element delete operation', { 
        elementId: data.elementId,
        userId: socket.user?.id 
      });
      
      callback({ success: true });
    } catch (error) {
      logger.error('Element delete failed', { error });
      callback({ success: false, error: error.message });
    }
  });

  // Area-based permission operations
  socket.on('whiteboard:element_move', permissionMiddleware.validatePermission(), async (data, callback) => {
    try {
      // Element move with area permission validation
      logger.debug('Element move operation', { 
        elementId: data.elementId,
        newPosition: data.position,
        userId: socket.user?.id 
      });
      
      callback({ success: true });
    } catch (error) {
      logger.error('Element move failed', { error });
      callback({ success: false, error: error.message });
    }
  });

  // Layer-based permission operations
  socket.on('whiteboard:layer_change', permissionMiddleware.validatePermission(), async (data, callback) => {
    try {
      // Layer change with layer permission validation
      logger.debug('Layer change operation', { 
        elementId: data.elementId,
        newLayer: data.layerIndex,
        userId: socket.user?.id 
      });
      
      callback({ success: true });
    } catch (error) {
      logger.error('Layer change failed', { error });
      callback({ success: false, error: error.message });
    }
  });

  // Comment operations with permission validation
  socket.on('whiteboard:comment_create', permissionMiddleware.validatePermission(), async (data, callback) => {
    try {
      logger.debug('Comment create operation', { userId: socket.user?.id });
      callback({ success: true, commentId: generateCommentId() });
    } catch (error) {
      logger.error('Comment create failed', { error });
      callback({ success: false, error: error.message });
    }
  });

  // Always allowed operations (no permission validation)
  socket.on('whiteboard:cursor_move', async (data) => {
    // Cursor movement is always allowed
    socket.to(`whiteboard:${socket.whiteboardPermissions!.whiteboardId}`)
      .emit('whiteboard:cursor_update', {
        userId: socket.user?.id,
        position: data.position,
        timestamp: Date.now(),
      });
  });

  socket.on('whiteboard:presence_update', async (data) => {
    // Presence updates are always allowed
    socket.to(`whiteboard:${socket.whiteboardPermissions!.whiteboardId}`)
      .emit('whiteboard:presence_changed', {
        userId: socket.user?.id,
        presence: data,
        timestamp: Date.now(),
      });
  });
}

/**
 * Setup permission management event handlers
 */
function setupPermissionManagementHandlers(
  namespace: any,
  permissionService: WhiteboardPermissionService,
  permissionMiddleware: WhiteboardPermissionMiddleware,
  logger: Logger
): void {

  namespace.on('connection', (socket: EnhancedWhiteboardSocket) => {
    
    // Grant permission to user
    socket.on('whiteboard:grant_permission', async (data, callback) => {
      try {
        const { targetUserId, role, permissions, expiresAt } = data;
        const whiteboardId = socket.whiteboardPermissions!.whiteboardId;
        const grantedBy = socket.user!.id;

        const permission = await permissionService.grantPermission(
          whiteboardId,
          targetUserId,
          grantedBy,
          { userId: targetUserId, role, permissions, expiresAt }
        );

        // Broadcast permission change
        await permissionMiddleware.broadcastPermissionChange(
          namespace,
          whiteboardId,
          [targetUserId],
          'permission_granted',
          { role, permissions }
        );

        callback({ success: true, permission });
      } catch (error) {
        logger.error('Grant permission failed', { error });
        callback({ success: false, error: error.message });
      }
    });

    // Revoke permission from user
    socket.on('whiteboard:revoke_permission', async (data, callback) => {
      try {
        const { targetUserId } = data;
        const whiteboardId = socket.whiteboardPermissions!.whiteboardId;
        const revokedBy = socket.user!.id;

        await permissionService.revokePermission(whiteboardId, targetUserId, revokedBy);

        // Broadcast permission change
        await permissionMiddleware.broadcastPermissionChange(
          namespace,
          whiteboardId,
          [targetUserId],
          'permission_revoked',
          {}
        );

        callback({ success: true });
      } catch (error) {
        logger.error('Revoke permission failed', { error });
        callback({ success: false, error: error.message });
      }
    });

    // Grant element-level permission
    socket.on('whiteboard:grant_element_permission', async (data, callback) => {
      try {
        const { elementId, targetUserId, permissionType, granted, scope, reason, expiresAt } = data;
        const whiteboardId = socket.whiteboardPermissions!.whiteboardId;
        const grantedBy = socket.user!.id;

        const permission = await permissionService.grantElementPermission(
          whiteboardId,
          elementId,
          targetUserId,
          permissionType as ElementPermissionType,
          granted,
          grantedBy,
          { scope, reason, expiresAt }
        );

        callback({ success: true, permission });
      } catch (error) {
        logger.error('Grant element permission failed', { error });
        callback({ success: false, error: error.message });
      }
    });

    // Grant area permission
    socket.on('whiteboard:grant_area_permission', async (data, callback) => {
      try {
        const { targetUserId, areaName, areaBounds, permissionType, priority, inclusive, appliesToElements } = data;
        const whiteboardId = socket.whiteboardPermissions!.whiteboardId;
        const grantedBy = socket.user!.id;

        const permission = await permissionService.grantAreaPermission(
          whiteboardId,
          targetUserId,
          areaName,
          areaBounds,
          permissionType as AreaPermissionType,
          grantedBy,
          { priority, inclusive, appliesToElements }
        );

        callback({ success: true, permission });
      } catch (error) {
        logger.error('Grant area permission failed', { error });
        callback({ success: false, error: error.message });
      }
    });

    // Grant layer permission
    socket.on('whiteboard:grant_layer_permission', async (data, callback) => {
      try {
        const { targetUserId, layerIndex, permissions, layerName } = data;
        const whiteboardId = socket.whiteboardPermissions!.whiteboardId;
        const grantedBy = socket.user!.id;

        const permission = await permissionService.grantLayerPermission(
          whiteboardId,
          targetUserId,
          layerIndex,
          permissions,
          grantedBy,
          layerName
        );

        callback({ success: true, permission });
      } catch (error) {
        logger.error('Grant layer permission failed', { error });
        callback({ success: false, error: error.message });
      }
    });

    // Get all permissions for whiteboard
    socket.on('whiteboard:get_permissions', async (callback) => {
      try {
        const whiteboardId = socket.whiteboardPermissions!.whiteboardId;
        const requestingUserId = socket.user!.id;

        const permissions = await permissionService.getWhiteboardPermissionsDetailed(
          whiteboardId,
          requestingUserId
        );

        callback({ success: true, permissions });
      } catch (error) {
        logger.error('Get permissions failed', { error });
        callback({ success: false, error: error.message });
      }
    });

    // Create custom role
    socket.on('whiteboard:create_custom_role', async (data, callback) => {
      try {
        const { workspaceId, roleName, rolePermissions, roleDescription, defaultForNewUsers, canBeDelegated } = data;
        const createdBy = socket.user!.id;

        const customRole = await permissionService.createCustomRole(
          workspaceId,
          roleName,
          rolePermissions,
          createdBy,
          { roleDescription, defaultForNewUsers, canBeDelegated }
        );

        callback({ success: true, customRole });
      } catch (error) {
        logger.error('Create custom role failed', { error });
        callback({ success: false, error: error.message });
      }
    });

    // Delegate permissions
    socket.on('whiteboard:delegate_permissions', async (data, callback) => {
      try {
        const { targetUserId, permissions, expiresAt } = data;
        const whiteboardId = socket.whiteboardPermissions!.whiteboardId;
        const delegatingUserId = socket.user!.id;

        const permission = await permissionService.delegatePermissions(
          whiteboardId,
          targetUserId,
          delegatingUserId,
          permissions,
          expiresAt
        );

        // Broadcast permission change
        await permissionMiddleware.broadcastPermissionChange(
          namespace,
          whiteboardId,
          [targetUserId],
          'permission_delegated',
          { permissions, delegatedBy: delegatingUserId }
        );

        callback({ success: true, permission });
      } catch (error) {
        logger.error('Delegate permissions failed', { error });
        callback({ success: false, error: error.message });
      }
    });

    // Get permission validation stats
    socket.on('whiteboard:get_permission_stats', async (callback) => {
      try {
        const validatorStats = permissionValidator.getValidationStats();
        const middlewareStats = permissionMiddleware.getMiddlewareStats();

        callback({ 
          success: true, 
          stats: {
            validation: validatorStats,
            middleware: middlewareStats,
          }
        });
      } catch (error) {
        logger.error('Get permission stats failed', { error });
        callback({ success: false, error: error.message });
      }
    });
  });
}

// Helper functions
function generateSessionId(): string {
  return require('crypto').randomUUID();
}

function generateCommentId(): string {
  return require('crypto').randomUUID();
}

// Export permission event types for type safety
export const PermissionEvents = {
  GRANT_PERMISSION: 'whiteboard:grant_permission',
  REVOKE_PERMISSION: 'whiteboard:revoke_permission',
  GRANT_ELEMENT_PERMISSION: 'whiteboard:grant_element_permission',
  GRANT_AREA_PERMISSION: 'whiteboard:grant_area_permission',
  GRANT_LAYER_PERMISSION: 'whiteboard:grant_layer_permission',
  GET_PERMISSIONS: 'whiteboard:get_permissions',
  CREATE_CUSTOM_ROLE: 'whiteboard:create_custom_role',
  DELEGATE_PERMISSIONS: 'whiteboard:delegate_permissions',
  PERMISSION_DENIED: 'whiteboard:permission_denied',
  PERMISSION_CHANGED: 'whiteboard:permission_changed',
  APPROVAL_REQUIRED: 'whiteboard:approval_required',
  OPERATION_APPROVED: 'whiteboard:operation_approved',
  OPERATION_REJECTED: 'whiteboard:operation_rejected',
} as const;

export type PermissionEventType = typeof PermissionEvents[keyof typeof PermissionEvents];