/**
 * Whiteboard WebSocket Handler
 * 
 * Real-time collaboration features for whiteboards including:
 * - Canvas synchronization with operational transforms
 * - User presence and cursor tracking
 * - Collaborative comments system
 * - Live collaborative editing
 */

import { Server as SocketIOServer, Socket } from 'socket.io';
import { Logger } from '@mcp-tools/core/utils/logger';
import { 
  SessionStorage, 
  SessionData, 
  createSessionStorage 
} from './redis-session-storage.js';

interface AuthenticatedSocket extends Socket {
  user?: {
    id: string;
    email: string;
    name: string;
    tenantId: string;
  };
  whiteboardSession?: {
    whiteboardId: string;
    workspaceId: string;
    sessionToken: string;
    sessionId: string;
  };
}

// Whiteboard-specific types
interface WhiteboardCanvasOperation {
  type: 'create' | 'update' | 'delete' | 'move' | 'style';
  elementId: string;
  elementType: string;
  data: any;
  position?: { x: number; y: number };
  bounds?: { x: number; y: number; width: number; height: number };
  style?: any;
  timestamp: string;
  version: number;
}

interface WhiteboardPresence {
  userId: string;
  userName: string;
  cursor: { x: number; y: number };
  viewport: { x: number; y: number; width: number; height: number; zoom: number };
  selection: string[];
  color: string;
  timestamp: string;
}

interface WhiteboardComment {
  id: string;
  whiteboardId: string;
  elementId?: string;
  position: { x: number; y: number };
  content: string;
  author: {
    id: string;
    name: string;
  };
  replies?: WhiteboardComment[];
  resolved?: boolean;
  createdAt: string;
  updatedAt: string;
}

interface WhiteboardSession extends SessionData {
  whiteboardId: string;
  workspaceId: string;
  permissions: {
    canEdit: boolean;
    canComment: boolean;
    canManage: boolean;
  };
  presence: WhiteboardPresence;
}

/**
 * Setup whiteboard WebSocket handlers
 */
export function setupWhiteboardWebSocket(
  io: SocketIOServer,
  options?: {
    useRedis?: boolean;
    sessionTtl?: number;
  }
): any {
  const logger = new Logger('WhiteboardWebSocket');
  
  // Initialize session storage for whiteboard sessions
  const sessionStorage: SessionStorage = createSessionStorage(options?.useRedis);
  const sessionTtl = options?.sessionTtl || 30 * 60 * 1000; // 30 minutes
  
  // Track active whiteboard sessions
  const activeWhiteboardSessions = new Map<string, WhiteboardSession>();
  
  // Track canvas state versions for operational transforms
  const canvasVersions = new Map<string, number>();
  
  // User color assignments for presence
  const userColors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#FFB347'];
  const assignedColors = new Map<string, string>();
  
  logger.info('Whiteboard WebSocket initialized', { 
    type: options?.useRedis ? 'Redis' : 'In-Memory',
    sessionTtl: sessionTtl / 1000 + 's'
  });

  io.on('connection', (socket: AuthenticatedSocket) => {
    logger.debug('Whiteboard socket connected', { socketId: socket.id, userId: socket.user?.id });

    // ==================== WHITEBOARD SESSIONS ====================

    // Join whiteboard
    socket.on('whiteboard:join', async (data: { 
      whiteboardId: string; 
      workspaceId: string;
      clientInfo?: any;
    }) => {
      try {
        if (!socket.user) {
          socket.emit('error', { code: 'AUTH_REQUIRED', message: 'Authentication required' });
          return;
        }

        const { whiteboardId, workspaceId, clientInfo } = data;
        
        // Assign user color for presence
        if (!assignedColors.has(socket.user.id)) {
          const colorIndex = assignedColors.size % userColors.length;
          assignedColors.set(socket.user.id, userColors[colorIndex]);
        }

        // Create whiteboard session
        const whiteboardSession: WhiteboardSession = {
          socketId: socket.id,
          sessionToken: `wb_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          workspaceId,
          whiteboardId,
          userId: socket.user.id,
          lastActivity: new Date(),
          permissions: {
            canEdit: true, // TODO: Check actual permissions from workspace/whiteboard
            canComment: true,
            canManage: false,
          },
          presence: {
            userId: socket.user.id,
            userName: socket.user.name,
            cursor: { x: 0, y: 0 },
            viewport: { x: 0, y: 0, width: 1920, height: 1080, zoom: 1 },
            selection: [],
            color: assignedColors.get(socket.user.id) || userColors[0],
            timestamp: new Date().toISOString(),
          },
        };

        // Store session info
        socket.whiteboardSession = {
          whiteboardId,
          workspaceId,
          sessionToken: whiteboardSession.sessionToken,
          sessionId: whiteboardSession.sessionToken,
        };

        // Store in session storage
        await sessionStorage.set(socket.id, whiteboardSession, sessionTtl);
        activeWhiteboardSessions.set(socket.id, whiteboardSession);

        // Initialize canvas version if not exists
        if (!canvasVersions.has(whiteboardId)) {
          canvasVersions.set(whiteboardId, 1);
        }

        // Join whiteboard rooms
        socket.join(`whiteboard:${whiteboardId}`);
        socket.join(`whiteboard:${whiteboardId}:presence`);
        socket.join(`whiteboard:${whiteboardId}:comments`);

        // Emit session started
        socket.emit('whiteboard:session_started', {
          sessionId: whiteboardSession.sessionToken,
          whiteboardId,
          workspaceId,
          permissions: whiteboardSession.permissions,
          canvasVersion: canvasVersions.get(whiteboardId),
        });

        // Broadcast user joined to other participants
        socket.to(`whiteboard:${whiteboardId}`).emit('whiteboard:user_joined', {
          user: {
            id: socket.user.id,
            name: socket.user.name,
          },
          presence: whiteboardSession.presence,
          timestamp: new Date().toISOString(),
        });

        // Send current presence information to new user
        const currentPresences = Array.from(activeWhiteboardSessions.values())
          .filter(session => 
            session.whiteboardId === whiteboardId && 
            session.socketId !== socket.id
          )
          .map(session => session.presence);

        socket.emit('whiteboard:presence_list', currentPresences);

        logger.info('User joined whiteboard', { 
          whiteboardId, 
          workspaceId,
          userId: socket.user.id,
          sessionToken: whiteboardSession.sessionToken
        });

      } catch (error) {
        logger.error('Failed to join whiteboard', { error, data });
        socket.emit('error', { 
          code: 'JOIN_FAILED', 
          message: 'Failed to join whiteboard',
          details: error instanceof Error ? error.message : String(error)
        });
      }
    });

    // Leave whiteboard
    socket.on('whiteboard:leave', async (data: { whiteboardId: string; reason?: string }) => {
      try {
        await handleWhiteboardLeave(socket, data.whiteboardId, data.reason);
      } catch (error) {
        logger.error('Failed to leave whiteboard', { error, data });
        socket.emit('error', { 
          code: 'LEAVE_FAILED', 
          message: 'Failed to leave whiteboard' 
        });
      }
    });

    // ==================== CANVAS SYNCHRONIZATION ====================

    // Canvas change (with operational transforms)
    socket.on('whiteboard:canvas_change', async (data: {
      operation: WhiteboardCanvasOperation;
      clientVersion: number;
    }) => {
      try {
        if (!socket.whiteboardSession || !socket.user) {
          socket.emit('error', { code: 'NO_SESSION', message: 'No active whiteboard session' });
          return;
        }

        const { operation, clientVersion } = data;
        const { whiteboardId } = socket.whiteboardSession;

        // Get current canvas version
        const currentVersion = canvasVersions.get(whiteboardId) || 1;

        // Check for version conflicts and apply operational transforms if needed
        let transformedOperation = operation;
        if (clientVersion < currentVersion) {
          // Client is behind, need to transform the operation
          transformedOperation = await transformOperation(operation, whiteboardId, clientVersion, currentVersion);
        }

        // Increment canvas version
        const newVersion = currentVersion + 1;
        canvasVersions.set(whiteboardId, newVersion);

        // Update operation with correct version and metadata
        transformedOperation.version = newVersion;
        transformedOperation.timestamp = new Date().toISOString();

        // Update session activity
        const session = activeWhiteboardSessions.get(socket.id);
        if (session) {
          session.lastActivity = new Date();
          await sessionStorage.set(socket.id, session, sessionTtl);
        }

        // Broadcast to other participants
        socket.to(`whiteboard:${whiteboardId}`).emit('whiteboard:canvas_changed', {
          operation: transformedOperation,
          user: {
            id: socket.user.id,
            name: socket.user.name,
          },
          timestamp: transformedOperation.timestamp,
        });

        // Send acknowledgment back to sender with new version
        socket.emit('whiteboard:canvas_ack', {
          operationId: operation.elementId,
          newVersion,
          success: true,
        });

        logger.debug('Canvas change processed', {
          whiteboardId,
          userId: socket.user.id,
          operationType: operation.type,
          elementId: operation.elementId,
          version: newVersion,
        });

      } catch (error) {
        logger.error('Failed to process canvas change', { error, data });
        socket.emit('whiteboard:canvas_ack', {
          operationId: data.operation.elementId,
          success: false,
          error: 'Failed to process canvas change',
        });
      }
    });

    // Request canvas sync (for new users or after reconnection)
    socket.on('whiteboard:request_sync', (data: { whiteboardId: string }) => {
      try {
        if (!socket.whiteboardSession || !socket.user) {
          return;
        }

        const { whiteboardId } = data;
        const currentVersion = canvasVersions.get(whiteboardId) || 1;

        // Request full canvas state from any participant
        socket.to(`whiteboard:${whiteboardId}`).emit('whiteboard:sync_requested', {
          requesterId: socket.user.id,
          requesterSocketId: socket.id,
          version: currentVersion,
        });

      } catch (error) {
        logger.error('Failed to request canvas sync', { error, data });
      }
    });

    // Provide canvas sync response
    socket.on('whiteboard:sync_response', (data: {
      requesterId: string;
      requesterSocketId: string;
      canvasData: any;
      version: number;
    }) => {
      try {
        if (!socket.whiteboardSession || !socket.user) {
          return;
        }

        // Send canvas data directly to requester
        io.to(data.requesterSocketId).emit('whiteboard:sync_data', {
          canvasData: data.canvasData,
          version: data.version,
          provider: {
            id: socket.user.id,
            name: socket.user.name,
          },
        });

      } catch (error) {
        logger.error('Failed to provide canvas sync', { error, data });
      }
    });

    // ==================== PRESENCE & CURSOR TRACKING ====================

    // Update presence (cursor, viewport, selection)
    socket.on('whiteboard:presence', async (data: {
      cursor?: { x: number; y: number };
      viewport?: { x: number; y: number; width: number; height: number; zoom: number };
      selection?: string[];
    }) => {
      try {
        if (!socket.whiteboardSession || !socket.user) {
          return;
        }

        const session = activeWhiteboardSessions.get(socket.id);
        if (!session) {
          return;
        }

        // Update presence data
        const updatedPresence: WhiteboardPresence = {
          ...session.presence,
          timestamp: new Date().toISOString(),
        };

        if (data.cursor) {
          updatedPresence.cursor = data.cursor;
        }
        if (data.viewport) {
          updatedPresence.viewport = data.viewport;
        }
        if (data.selection !== undefined) {
          updatedPresence.selection = data.selection;
        }

        // Update session
        session.presence = updatedPresence;
        session.lastActivity = new Date();
        activeWhiteboardSessions.set(socket.id, session);
        await sessionStorage.set(socket.id, session, sessionTtl);

        // Broadcast presence update to other participants
        socket.to(`whiteboard:${session.whiteboardId}:presence`).emit(
          'whiteboard:presence_updated',
          updatedPresence
        );

      } catch (error) {
        logger.error('Failed to update presence', { error, data });
      }
    });

    // ==================== COLLABORATIVE COMMENTS ====================

    // Add comment
    socket.on('whiteboard:add_comment', async (data: {
      whiteboardId: string;
      elementId?: string;
      position: { x: number; y: number };
      content: string;
    }) => {
      try {
        if (!socket.whiteboardSession || !socket.user) {
          socket.emit('error', { code: 'NO_SESSION', message: 'No active whiteboard session' });
          return;
        }

        const { whiteboardId, elementId, position, content } = data;

        const comment: WhiteboardComment = {
          id: `comment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          whiteboardId,
          elementId,
          position,
          content,
          author: {
            id: socket.user.id,
            name: socket.user.name,
          },
          replies: [],
          resolved: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        // Broadcast comment to all participants
        io.to(`whiteboard:${whiteboardId}:comments`).emit('whiteboard:comment_added', comment);

        // Send acknowledgment
        socket.emit('whiteboard:comment_ack', {
          tempId: data.elementId, // Assume client sends temp ID
          comment,
          success: true,
        });

        logger.info('Comment added to whiteboard', {
          whiteboardId,
          commentId: comment.id,
          userId: socket.user.id,
        });

      } catch (error) {
        logger.error('Failed to add comment', { error, data });
        socket.emit('whiteboard:comment_ack', {
          success: false,
          error: 'Failed to add comment',
        });
      }
    });

    // Reply to comment
    socket.on('whiteboard:reply_comment', async (data: {
      whiteboardId: string;
      commentId: string;
      content: string;
    }) => {
      try {
        if (!socket.whiteboardSession || !socket.user) {
          return;
        }

        const { whiteboardId, commentId, content } = data;

        const reply: WhiteboardComment = {
          id: `reply_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          whiteboardId,
          position: { x: 0, y: 0 }, // Replies don't have positions
          content,
          author: {
            id: socket.user.id,
            name: socket.user.name,
          },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        // Broadcast reply to all participants
        io.to(`whiteboard:${whiteboardId}:comments`).emit('whiteboard:comment_reply_added', {
          commentId,
          reply,
        });

        socket.emit('whiteboard:reply_ack', {
          commentId,
          reply,
          success: true,
        });

      } catch (error) {
        logger.error('Failed to reply to comment', { error, data });
        socket.emit('whiteboard:reply_ack', {
          success: false,
          error: 'Failed to reply to comment',
        });
      }
    });

    // Resolve/unresolve comment
    socket.on('whiteboard:resolve_comment', async (data: {
      whiteboardId: string;
      commentId: string;
      resolved: boolean;
    }) => {
      try {
        if (!socket.whiteboardSession || !socket.user) {
          return;
        }

        const { whiteboardId, commentId, resolved } = data;

        // Broadcast resolution status change
        io.to(`whiteboard:${whiteboardId}:comments`).emit('whiteboard:comment_resolved', {
          commentId,
          resolved,
          resolvedBy: {
            id: socket.user.id,
            name: socket.user.name,
          },
          timestamp: new Date().toISOString(),
        });

      } catch (error) {
        logger.error('Failed to resolve comment', { error, data });
      }
    });

    // Delete comment
    socket.on('whiteboard:delete_comment', async (data: {
      whiteboardId: string;
      commentId: string;
    }) => {
      try {
        if (!socket.whiteboardSession || !socket.user) {
          return;
        }

        const { whiteboardId, commentId } = data;

        // Broadcast comment deletion
        io.to(`whiteboard:${whiteboardId}:comments`).emit('whiteboard:comment_deleted', {
          commentId,
          deletedBy: {
            id: socket.user.id,
            name: socket.user.name,
          },
          timestamp: new Date().toISOString(),
        });

      } catch (error) {
        logger.error('Failed to delete comment', { error, data });
      }
    });

    // ==================== CROSS-SERVICE INTEGRATION EVENTS ====================

    // Resource attachment notification
    socket.on('whiteboard:resource_attached', async (data: {
      whiteboardId: string;
      elementId: string;
      resourceType: 'kanban_card' | 'wiki_page' | 'memory_node';
      resourceId: string;
      resourceMetadata: any;
    }) => {
      try {
        if (!socket.whiteboardSession || !socket.user) {
          return;
        }

        const { whiteboardId, elementId, resourceType, resourceId, resourceMetadata } = data;

        // Broadcast resource attachment to other participants
        socket.to(`whiteboard:${whiteboardId}`).emit('whiteboard:resource_attached', {
          elementId,
          resourceType,
          resourceId,
          resourceMetadata,
          attachedBy: {
            id: socket.user.id,
            name: socket.user.name,
          },
          timestamp: new Date().toISOString(),
        });

        logger.info('Resource attached to whiteboard', {
          whiteboardId,
          elementId,
          resourceType,
          resourceId,
          userId: socket.user.id,
        });

      } catch (error) {
        logger.error('Failed to broadcast resource attachment', { error, data });
      }
    });

    // Resource detachment notification
    socket.on('whiteboard:resource_detached', async (data: {
      whiteboardId: string;
      elementId: string;
      resourceType: 'kanban_card' | 'wiki_page' | 'memory_node';
      resourceId: string;
    }) => {
      try {
        if (!socket.whiteboardSession || !socket.user) {
          return;
        }

        const { whiteboardId, elementId, resourceType, resourceId } = data;

        // Broadcast resource detachment to other participants
        socket.to(`whiteboard:${whiteboardId}`).emit('whiteboard:resource_detached', {
          elementId,
          resourceType,
          resourceId,
          detachedBy: {
            id: socket.user.id,
            name: socket.user.name,
          },
          timestamp: new Date().toISOString(),
        });

        logger.info('Resource detached from whiteboard', {
          whiteboardId,
          elementId,
          resourceType,
          resourceId,
          userId: socket.user.id,
        });

      } catch (error) {
        logger.error('Failed to broadcast resource detachment', { error, data });
      }
    });

    // Resource synchronization notification
    socket.on('whiteboard:resource_synced', async (data: {
      whiteboardId: string;
      elementId: string;
      resourceType: 'kanban_card' | 'wiki_page' | 'memory_node';
      resourceId: string;
      resourceMetadata: any;
      changes?: any;
    }) => {
      try {
        if (!socket.whiteboardSession || !socket.user) {
          return;
        }

        const { whiteboardId, elementId, resourceType, resourceId, resourceMetadata, changes } = data;

        // Broadcast resource sync update to other participants
        socket.to(`whiteboard:${whiteboardId}`).emit('whiteboard:resource_synced', {
          elementId,
          resourceType,
          resourceId,
          resourceMetadata,
          changes,
          syncedBy: {
            id: socket.user.id,
            name: socket.user.name,
          },
          timestamp: new Date().toISOString(),
        });

        logger.debug('Resource synced in whiteboard', {
          whiteboardId,
          elementId,
          resourceType,
          resourceId,
          hasChanges: !!changes,
          userId: socket.user.id,
        });

      } catch (error) {
        logger.error('Failed to broadcast resource sync', { error, data });
      }
    });

    // Resource external update notification (from source service)
    socket.on('whiteboard:resource_updated_external', async (data: {
      whiteboardId: string;
      elementId: string;
      resourceType: 'kanban_card' | 'wiki_page' | 'memory_node';
      resourceId: string;
      resourceMetadata: any;
      updateSource: string; // 'kanban', 'wiki', 'memory'
    }) => {
      try {
        if (!socket.whiteboardSession || !socket.user) {
          return;
        }

        const { whiteboardId, elementId, resourceType, resourceId, resourceMetadata, updateSource } = data;

        // Broadcast external resource update to all participants
        io.to(`whiteboard:${whiteboardId}`).emit('whiteboard:resource_updated_external', {
          elementId,
          resourceType,
          resourceId,
          resourceMetadata,
          updateSource,
          timestamp: new Date().toISOString(),
        });

        logger.debug('External resource update broadcast', {
          whiteboardId,
          elementId,
          resourceType,
          resourceId,
          updateSource,
        });

      } catch (error) {
        logger.error('Failed to broadcast external resource update', { error, data });
      }
    });

    // Unified search initiated (for awareness)
    socket.on('whiteboard:search_initiated', async (data: {
      whiteboardId: string;
      query: string;
      services: string[];
    }) => {
      try {
        if (!socket.whiteboardSession || !socket.user) {
          return;
        }

        const { whiteboardId, query, services } = data;

        // Broadcast search activity to other participants (optional awareness feature)
        socket.to(`whiteboard:${whiteboardId}:presence`).emit('whiteboard:search_activity', {
          searchedBy: {
            id: socket.user.id,
            name: socket.user.name,
          },
          query,
          services,
          timestamp: new Date().toISOString(),
        });

        logger.debug('Search initiated in whiteboard', {
          whiteboardId,
          query,
          services,
          userId: socket.user.id,
        });

      } catch (error) {
        logger.error('Failed to broadcast search activity', { error, data });
      }
    });

    // Bulk resource synchronization status
    socket.on('whiteboard:bulk_sync_status', async (data: {
      whiteboardId: string;
      syncResult: {
        synced: number;
        failed: number;
        conflicts: number;
      };
    }) => {
      try {
        if (!socket.whiteboardSession || !socket.user) {
          return;
        }

        const { whiteboardId, syncResult } = data;

        // Broadcast bulk sync completion to other participants
        socket.to(`whiteboard:${whiteboardId}`).emit('whiteboard:bulk_sync_completed', {
          syncResult,
          syncedBy: {
            id: socket.user.id,
            name: socket.user.name,
          },
          timestamp: new Date().toISOString(),
        });

        logger.info('Bulk sync completed in whiteboard', {
          whiteboardId,
          syncResult,
          userId: socket.user.id,
        });

      } catch (error) {
        logger.error('Failed to broadcast bulk sync status', { error, data });
      }
    });

    // ==================== DISCONNECT HANDLING ====================

    socket.on('disconnect', async (reason: string) => {
      try {
        if (socket.whiteboardSession) {
          await handleWhiteboardLeave(socket, socket.whiteboardSession.whiteboardId, reason);
        }

        // Clean up session storage
        await sessionStorage.delete(socket.id);
        activeWhiteboardSessions.delete(socket.id);

        logger.info('Whiteboard socket disconnected', { 
          socketId: socket.id, 
          userId: socket.user?.id,
          reason 
        });

      } catch (error) {
        logger.error('Failed to handle whiteboard disconnect', { error, reason });
      }
    });

    // ==================== ERROR HANDLING ====================

    socket.on('error', (error) => {
      logger.error('Whiteboard socket error', { 
        socketId: socket.id, 
        userId: socket.user?.id,
        error 
      });
    });
  });

  // ==================== HELPER FUNCTIONS ====================

  async function handleWhiteboardLeave(
    socket: AuthenticatedSocket, 
    whiteboardId: string, 
    reason?: string
  ): Promise<void> {
    if (!socket.user || !socket.whiteboardSession) {
      return;
    }

    try {
      // Leave whiteboard rooms
      socket.leave(`whiteboard:${whiteboardId}`);
      socket.leave(`whiteboard:${whiteboardId}:presence`);
      socket.leave(`whiteboard:${whiteboardId}:comments`);

      // Broadcast user left to other participants
      socket.to(`whiteboard:${whiteboardId}`).emit('whiteboard:user_left', {
        user: {
          id: socket.user.id,
          name: socket.user.name,
        },
        reason,
        timestamp: new Date().toISOString(),
      });

      // Clean up session info
      socket.whiteboardSession = undefined;
      activeWhiteboardSessions.delete(socket.id);
      await sessionStorage.delete(socket.id);

      logger.info('User left whiteboard', { 
        whiteboardId, 
        userId: socket.user.id,
        reason 
      });

    } catch (error) {
      logger.error('Failed to handle whiteboard leave', { error, whiteboardId, reason });
      throw error;
    }
  }

  // Simple operational transform implementation
  async function transformOperation(
    operation: WhiteboardCanvasOperation,
    whiteboardId: string,
    clientVersion: number,
    currentVersion: number
  ): Promise<WhiteboardCanvasOperation> {
    // This is a simplified OT implementation
    // In production, you'd want more sophisticated conflict resolution
    
    // For now, just return the operation with adjusted timestamp
    // More complex transforms would handle position conflicts, etc.
    return {
      ...operation,
      timestamp: new Date().toISOString(),
      version: currentVersion + 1,
    };
  }

  // Cleanup inactive sessions
  const cleanupInterval = setInterval(async () => {
    try {
      const now = new Date();
      const inactiveThreshold = 30 * 60 * 1000; // 30 minutes

      for (const [socketId, session] of activeWhiteboardSessions.entries()) {
        const timeSinceActivity = now.getTime() - session.lastActivity.getTime();
        
        if (timeSinceActivity > inactiveThreshold) {
          const socket = io.sockets.sockets.get(socketId);
          if (socket) {
            await handleWhiteboardLeave(
              socket as AuthenticatedSocket, 
              session.whiteboardId, 
              'inactivity_timeout'
            );
          } else {
            // Socket doesn't exist, clean up storage
            activeWhiteboardSessions.delete(socketId);
            await sessionStorage.delete(socketId);
          }
        }
      }

    } catch (error) {
      logger.error('Failed to cleanup inactive whiteboard sessions', { error });
    }
  }, 5 * 60 * 1000); // Run every 5 minutes

  // Graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down whiteboard WebSocket handlers');
    
    if (cleanupInterval) {
      clearInterval(cleanupInterval);
    }
    
    // Clean up session storage
    if (sessionStorage && typeof (sessionStorage as any).destroy === 'function') {
      (sessionStorage as any).destroy();
    }
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  logger.info('Whiteboard WebSocket handlers configured');

  return {
    cleanup: shutdown,
    getActiveSessionCount: () => activeWhiteboardSessions.size,
    getCanvasVersion: (whiteboardId: string) => canvasVersions.get(whiteboardId) || 1,
  };
}

// ==================== BROADCAST UTILITIES ====================

/**
 * Broadcast canvas change to whiteboard participants
 */
export function broadcastCanvasChange(
  io: SocketIOServer,
  whiteboardId: string,
  operation: WhiteboardCanvasOperation,
  user: { id: string; name: string }
): void {
  io.to(`whiteboard:${whiteboardId}`).emit('whiteboard:canvas_changed', {
    operation,
    user,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Broadcast presence update to whiteboard participants
 */
export function broadcastPresenceUpdate(
  io: SocketIOServer,
  whiteboardId: string,
  presence: WhiteboardPresence
): void {
  io.to(`whiteboard:${whiteboardId}:presence`).emit('whiteboard:presence_updated', presence);
}

/**
 * Broadcast comment update to whiteboard participants
 */
export function broadcastCommentUpdate(
  io: SocketIOServer,
  whiteboardId: string,
  event: 'comment_added' | 'comment_updated' | 'comment_deleted' | 'comment_resolved',
  data: any
): void {
  io.to(`whiteboard:${whiteboardId}:comments`).emit(`whiteboard:${event}`, {
    ...data,
    timestamp: new Date().toISOString(),
  });
}

// ==================== CROSS-SERVICE INTEGRATION BROADCAST UTILITIES ====================

/**
 * Broadcast resource attachment to whiteboard participants
 */
export function broadcastResourceAttachment(
  io: SocketIOServer,
  whiteboardId: string,
  data: {
    elementId: string;
    resourceType: 'kanban_card' | 'wiki_page' | 'memory_node';
    resourceId: string;
    resourceMetadata: any;
    attachedBy: { id: string; name: string };
  }
): void {
  io.to(`whiteboard:${whiteboardId}`).emit('whiteboard:resource_attached', {
    ...data,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Broadcast resource detachment to whiteboard participants
 */
export function broadcastResourceDetachment(
  io: SocketIOServer,
  whiteboardId: string,
  data: {
    elementId: string;
    resourceType: 'kanban_card' | 'wiki_page' | 'memory_node';
    resourceId: string;
    detachedBy: { id: string; name: string };
  }
): void {
  io.to(`whiteboard:${whiteboardId}`).emit('whiteboard:resource_detached', {
    ...data,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Broadcast resource synchronization to whiteboard participants
 */
export function broadcastResourceSync(
  io: SocketIOServer,
  whiteboardId: string,
  data: {
    elementId: string;
    resourceType: 'kanban_card' | 'wiki_page' | 'memory_node';
    resourceId: string;
    resourceMetadata: any;
    changes?: any;
    syncedBy?: { id: string; name: string };
  }
): void {
  io.to(`whiteboard:${whiteboardId}`).emit('whiteboard:resource_synced', {
    ...data,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Broadcast external resource update to whiteboard participants
 * This is called when a resource is updated in its source service (Kanban, Wiki, Memory)
 */
export function broadcastExternalResourceUpdate(
  io: SocketIOServer,
  whiteboardId: string,
  data: {
    elementId: string;
    resourceType: 'kanban_card' | 'wiki_page' | 'memory_node';
    resourceId: string;
    resourceMetadata: any;
    updateSource: string;
  }
): void {
  io.to(`whiteboard:${whiteboardId}`).emit('whiteboard:resource_updated_external', {
    ...data,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Broadcast search activity to whiteboard participants (for awareness)
 */
export function broadcastSearchActivity(
  io: SocketIOServer,
  whiteboardId: string,
  data: {
    searchedBy: { id: string; name: string };
    query: string;
    services: string[];
  }
): void {
  io.to(`whiteboard:${whiteboardId}:presence`).emit('whiteboard:search_activity', {
    ...data,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Broadcast bulk synchronization completion to whiteboard participants
 */
export function broadcastBulkSyncCompleted(
  io: SocketIOServer,
  whiteboardId: string,
  data: {
    syncResult: {
      synced: number;
      failed: number;
      conflicts: number;
    };
    syncedBy: { id: string; name: string };
  }
): void {
  io.to(`whiteboard:${whiteboardId}`).emit('whiteboard:bulk_sync_completed', {
    ...data,
    timestamp: new Date().toISOString(),
  });
}