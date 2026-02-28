/**
 * Workspace WebSocket Handler
 * 
 * Real-time collaboration features for workspaces including:
 * - Session management and presence
 * - Real-time activity feeds
 * - Cursor tracking and live collaboration
 * - Member status updates
 */

import { Server as SocketIOServer, Socket } from 'socket.io';
import {
  WorkspaceSessionService,
  WorkspaceActivityService,
  WorkspaceMembershipService,
} from '@mcp-tools/core/services/workspace';
import {
  WorkspaceRealtimeEvent,
  WorkspacePresenceUpdate,
  WorkspaceActivityAction,
} from '@shared/types/workspace.js';
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
  workspaceSession?: {
    workspaceId: string;
    sessionToken: string;
    sessionId: string;
  };
}

interface WorkspaceServices {
  workspaceSessionService: WorkspaceSessionService;
  workspaceActivityService: WorkspaceActivityService;
  workspaceMembershipService: WorkspaceMembershipService;
}

/**
 * Setup workspace WebSocket handlers
 */
export function setupWorkspaceWebSocket(
  io: SocketIOServer, 
  services: WorkspaceServices,
  options?: {
    useRedis?: boolean;
    sessionTtl?: number;
  }
): any {
  const logger = new Logger('WorkspaceWebSocket');
  
  // Initialize scalable session storage (Redis in production, in-memory for development)
  const sessionStorage: SessionStorage = createSessionStorage(options?.useRedis);
  const sessionTtl = options?.sessionTtl || 30 * 60 * 1000; // 30 minutes default
  
  // Track failed authentication attempts for rate limiting
  const authFailures = new Map<string, { count: number; lastAttempt: Date }>();

  // Track active socket sessions for lifecycle management
  const activeSessions = new Map<string, any>();
  
  logger.info('WebSocket session storage initialized', { 
    type: options?.useRedis ? 'Redis' : 'In-Memory',
    sessionTtl: sessionTtl / 1000 + 's'
  });

  io.on('connection', (socket: AuthenticatedSocket) => {
    logger.debug('Socket connected', { socketId: socket.id, userId: socket.user?.id });

    // ==================== WORKSPACE SESSIONS ====================

    // Join workspace
    socket.on('workspace:join', async (data: { workspaceId: string; clientInfo?: any }) => {
      try {
        if (!socket.user) {
          socket.emit('error', { code: 'AUTH_REQUIRED', message: 'Authentication required' });
          return;
        }

        const { workspaceId, clientInfo } = data;
        
        // Start workspace session
        const session = await services.workspaceSessionService.startSession(
          workspaceId,
          socket.user.id,
          socket.user.tenantId,
          socket.id,
          clientInfo
        );

        // Store session info on socket
        socket.workspaceSession = {
          workspaceId,
          sessionToken: session.sessionToken,
          sessionId: session.id,
        };

        // Track active session
        activeSessions.set(socket.id, {
          socketId: socket.id,
          sessionToken: session.sessionToken,
          workspaceId,
          lastActivity: new Date(),
        });

        // Join workspace room
        socket.join(`workspace:${workspaceId}`);
        socket.join(`workspace:${workspaceId}:presence`);

        // Emit session started event
        socket.emit('workspace:session_started', {
          sessionId: session.id,
          sessionToken: session.sessionToken,
          workspaceId,
        });

        // Broadcast user joined to other workspace members
        socket.to(`workspace:${workspaceId}`).emit('workspace:user_joined', {
          user: {
            id: socket.user.id,
            name: socket.user.name,
          },
          sessionId: session.id,
          timestamp: new Date().toISOString(),
        });

        // Log activity
        await services.workspaceActivityService.logActivity(
          workspaceId,
          socket.user.id,
          'session_started',
          'session',
          session.id,
          { clientInfo },
          { socketId: socket.id },
          session.id
        );

        logger.info('User joined workspace', { 
          workspaceId, 
          userId: socket.user.id, 
          sessionId: session.id 
        });

      } catch (error) {
        logger.error('Failed to join workspace', { error, data });
        socket.emit('error', { 
          code: 'JOIN_FAILED', 
          message: 'Failed to join workspace',
          details: error instanceof Error ? error.message : String(error)
        });
      }
    });

    // Leave workspace
    socket.on('workspace:leave', async (data: { workspaceId: string; reason?: string }) => {
      try {
        await handleWorkspaceLeave(socket, data.workspaceId, data.reason);
      } catch (error) {
        logger.error('Failed to leave workspace', { error, data });
        socket.emit('error', { 
          code: 'LEAVE_FAILED', 
          message: 'Failed to leave workspace' 
        });
      }
    });

    // ==================== PRESENCE & CURSOR TRACKING ====================

    // Update presence
    socket.on('workspace:presence', async (data: {
      presenceData: any;
      cursorPosition?: any;
    }) => {
      try {
        if (!socket.workspaceSession) {
          socket.emit('error', { code: 'NO_SESSION', message: 'No active workspace session' });
          return;
        }

        const { presenceData, cursorPosition } = data;

        // Update presence in session service
        await services.workspaceSessionService.updatePresence(
          socket.workspaceSession.sessionToken,
          presenceData,
          cursorPosition
        );

        // Update activity timestamp in session storage
        const activeSession = await sessionStorage.get(socket.id);
        if (activeSession) {
          activeSession.lastActivity = new Date();
          await sessionStorage.set(socket.id, activeSession, 30 * 60 * 1000);
        }

        // Broadcast presence update to workspace
        const presenceUpdate: WorkspacePresenceUpdate = {
          sessionId: socket.workspaceSession.sessionId,
          userId: socket.user!.id,
          workspaceId: socket.workspaceSession.workspaceId,
          presenceData,
          cursorPosition,
          timestamp: new Date().toISOString(),
        };

        socket.to(`workspace:${socket.workspaceSession.workspaceId}:presence`).emit(
          'workspace:presence_updated', 
          presenceUpdate
        );

        // Log cursor movement activity (throttled)
        if (cursorPosition && Math.random() < 0.1) { // Only log 10% of cursor movements
          await services.workspaceActivityService.logActivity(
            socket.workspaceSession.workspaceId,
            socket.user!.id,
            'cursor_moved',
            undefined,
            undefined,
            { cursorPosition },
            { socketId: socket.id },
            socket.workspaceSession.sessionId
          );
        }

      } catch (error) {
        logger.error('Failed to update presence', { error, data });
      }
    });

    // Update active tool/resource
    socket.on('workspace:activity', async (data: {
      activeTool?: string;
      activeResource?: string;
      action?: WorkspaceActivityAction;
      resourceType?: string;
      resourceId?: string;
      details?: any;
    }) => {
      try {
        if (!socket.workspaceSession || !socket.user) {
          return;
        }

        const { activeTool, activeResource, action, resourceType, resourceId, details } = data;

        // Update session activity
        await services.workspaceSessionService.updateSessionActivity(
          socket.workspaceSession.sessionToken,
          activeTool,
          activeResource
        );

        // Update activity timestamp in session storage  
        const activeSession = await sessionStorage.get(socket.id);
        if (activeSession) {
          activeSession.lastActivity = new Date();
          await sessionStorage.set(socket.id, activeSession, 30 * 60 * 1000);
        }

        // Log activity if action is provided
        if (action) {
          await services.workspaceActivityService.logActivity(
            socket.workspaceSession.workspaceId,
            socket.user.id,
            action,
            resourceType,
            resourceId,
            details,
            { activeTool, activeResource, socketId: socket.id },
            socket.workspaceSession.sessionId
          );

          // Broadcast activity to workspace
          const realtimeEvent: WorkspaceRealtimeEvent = {
            type: 'activity_logged',
            workspaceId: socket.workspaceSession.workspaceId,
            userId: socket.user.id,
            data: {
              action,
              resourceType,
              resourceId,
              details,
              user: {
                id: socket.user.id,
                name: socket.user.name,
              },
            },
            timestamp: new Date().toISOString(),
          };

          socket.to(`workspace:${socket.workspaceSession.workspaceId}`).emit(
            'workspace:activity_logged',
            realtimeEvent
          );
        }

      } catch (error) {
        logger.error('Failed to update activity', { error, data });
      }
    });

    // ==================== COLLABORATIVE EDITING ====================

    // Content editing started
    socket.on('workspace:editing_started', (data: {
      resourceType: string;
      resourceId: string;
      section?: string;
    }) => {
      try {
        if (!socket.workspaceSession || !socket.user) {
          return;
        }

        const editingData = {
          workspaceId: socket.workspaceSession.workspaceId,
          resourceType: data.resourceType,
          resourceId: data.resourceId,
          section: data.section,
          user: {
            id: socket.user.id,
            name: socket.user.name,
          },
          timestamp: new Date().toISOString(),
        };

        // Broadcast to workspace
        socket.to(`workspace:${socket.workspaceSession.workspaceId}`).emit(
          'workspace:user_editing_started',
          editingData
        );

        // Join resource-specific room for fine-grained updates
        socket.join(`workspace:${socket.workspaceSession.workspaceId}:${data.resourceType}:${data.resourceId}`);

      } catch (error) {
        logger.error('Failed to handle editing started', { error, data });
      }
    });

    // Content editing stopped
    socket.on('workspace:editing_stopped', (data: {
      resourceType: string;
      resourceId: string;
    }) => {
      try {
        if (!socket.workspaceSession || !socket.user) {
          return;
        }

        const editingData = {
          workspaceId: socket.workspaceSession.workspaceId,
          resourceType: data.resourceType,
          resourceId: data.resourceId,
          user: {
            id: socket.user.id,
            name: socket.user.name,
          },
          timestamp: new Date().toISOString(),
        };

        // Broadcast to workspace
        socket.to(`workspace:${socket.workspaceSession.workspaceId}`).emit(
          'workspace:user_editing_stopped',
          editingData
        );

        // Leave resource-specific room
        socket.leave(`workspace:${socket.workspaceSession.workspaceId}:${data.resourceType}:${data.resourceId}`);

      } catch (error) {
        logger.error('Failed to handle editing stopped', { error, data });
      }
    });

    // Content changes (operational transforms)
    socket.on('workspace:content_change', (data: {
      resourceType: string;
      resourceId: string;
      operation: any;
      version: number;
    }) => {
      try {
        if (!socket.workspaceSession || !socket.user) {
          return;
        }

        const changeData = {
          workspaceId: socket.workspaceSession.workspaceId,
          resourceType: data.resourceType,
          resourceId: data.resourceId,
          operation: data.operation,
          version: data.version,
          user: {
            id: socket.user.id,
            name: socket.user.name,
          },
          timestamp: new Date().toISOString(),
        };

        // Broadcast to resource-specific room
        const resourceRoom = `workspace:${socket.workspaceSession.workspaceId}:${data.resourceType}:${data.resourceId}`;
        socket.to(resourceRoom).emit('workspace:content_changed', changeData);

      } catch (error) {
        logger.error('Failed to handle content change', { error, data });
      }
    });

    // ==================== RESOURCE UPDATES ====================

    // Resource created
    socket.on('workspace:resource_created', (data: {
      resourceType: string;
      resourceId: string;
      resource: any;
    }) => {
      try {
        if (!socket.workspaceSession || !socket.user) {
          return;
        }

        const resourceData = {
          workspaceId: socket.workspaceSession.workspaceId,
          resourceType: data.resourceType,
          resourceId: data.resourceId,
          resource: data.resource,
          createdBy: {
            id: socket.user.id,
            name: socket.user.name,
          },
          timestamp: new Date().toISOString(),
        };

        // Broadcast to workspace
        socket.to(`workspace:${socket.workspaceSession.workspaceId}`).emit(
          'workspace:resource_created',
          resourceData
        );

      } catch (error) {
        logger.error('Failed to handle resource created', { error, data });
      }
    });

    // Resource updated
    socket.on('workspace:resource_updated', (data: {
      resourceType: string;
      resourceId: string;
      resource: any;
      changes?: any;
    }) => {
      try {
        if (!socket.workspaceSession || !socket.user) {
          return;
        }

        const resourceData = {
          workspaceId: socket.workspaceSession.workspaceId,
          resourceType: data.resourceType,
          resourceId: data.resourceId,
          resource: data.resource,
          changes: data.changes,
          updatedBy: {
            id: socket.user.id,
            name: socket.user.name,
          },
          timestamp: new Date().toISOString(),
        };

        // Broadcast to workspace
        socket.to(`workspace:${socket.workspaceSession.workspaceId}`).emit(
          'workspace:resource_updated',
          resourceData
        );

      } catch (error) {
        logger.error('Failed to handle resource updated', { error, data });
      }
    });

    // Resource deleted
    socket.on('workspace:resource_deleted', (data: {
      resourceType: string;
      resourceId: string;
    }) => {
      try {
        if (!socket.workspaceSession || !socket.user) {
          return;
        }

        const resourceData = {
          workspaceId: socket.workspaceSession.workspaceId,
          resourceType: data.resourceType,
          resourceId: data.resourceId,
          deletedBy: {
            id: socket.user.id,
            name: socket.user.name,
          },
          timestamp: new Date().toISOString(),
        };

        // Broadcast to workspace
        socket.to(`workspace:${socket.workspaceSession.workspaceId}`).emit(
          'workspace:resource_deleted',
          resourceData
        );

      } catch (error) {
        logger.error('Failed to handle resource deleted', { error, data });
      }
    });

    // ==================== INTEGRATION EVENTS ====================

    // Integration sync started
    socket.on('workspace:integration_sync_started', (data: {
      integrationId: string;
      integrationType: string;
    }) => {
      try {
        if (!socket.workspaceSession || !socket.user) {
          return;
        }

        socket.to(`workspace:${socket.workspaceSession.workspaceId}`).emit(
          'workspace:integration_sync_started',
          {
            workspaceId: socket.workspaceSession.workspaceId,
            integrationId: data.integrationId,
            integrationType: data.integrationType,
            startedBy: {
              id: socket.user.id,
              name: socket.user.name,
            },
            timestamp: new Date().toISOString(),
          }
        );

      } catch (error) {
        logger.error('Failed to handle integration sync started', { error, data });
      }
    });

    // ==================== DISCONNECT HANDLING ====================

    socket.on('disconnect', async (reason: string) => {
      try {
        if (socket.workspaceSession) {
          await handleWorkspaceLeave(socket, socket.workspaceSession.workspaceId, reason);
        }
        
        // Clean up session storage
        await sessionStorage.delete(socket.id);

        logger.info('Socket disconnected', { 
          socketId: socket.id, 
          userId: socket.user?.id,
          reason 
        });

      } catch (error) {
        logger.error('Failed to handle disconnect', { error, reason });
      }
    });

    // ==================== ERROR HANDLING ====================

    socket.on('error', (error) => {
      logger.error('Socket error', { 
        socketId: socket.id, 
        userId: socket.user?.id,
        error 
      });
    });
  });

  // ==================== HELPER FUNCTIONS ====================

  async function handleWorkspaceLeave(
    socket: AuthenticatedSocket, 
    workspaceId: string, 
    reason?: string
  ): Promise<void> {
    if (!socket.user || !socket.workspaceSession) {
      return;
    }

    try {
      // End workspace session
      await services.workspaceSessionService.endSession(
        socket.workspaceSession.sessionId,
        socket.user.id,
        reason
      );

      // Leave workspace rooms
      socket.leave(`workspace:${workspaceId}`);
      socket.leave(`workspace:${workspaceId}:presence`);

      // Leave any resource-specific rooms
      const rooms = Array.from(socket.rooms);
      rooms.forEach(room => {
        if (room.startsWith(`workspace:${workspaceId}:`)) {
          socket.leave(room);
        }
      });

      // Broadcast user left to other workspace members
      socket.to(`workspace:${workspaceId}`).emit('workspace:user_left', {
        user: {
          id: socket.user.id,
          name: socket.user.name,
        },
        sessionId: socket.workspaceSession.sessionId,
        reason,
        timestamp: new Date().toISOString(),
      });

      // Log activity
      await services.workspaceActivityService.logActivity(
        workspaceId,
        socket.user.id,
        'session_ended',
        'session',
        socket.workspaceSession.sessionId,
        { reason },
        { socketId: socket.id },
        socket.workspaceSession.sessionId
      );

      // Clean up session info
      socket.workspaceSession = undefined;
      await sessionStorage.delete(socket.id);

      logger.info('User left workspace', { 
        workspaceId, 
        userId: socket.user.id,
        reason 
      });

    } catch (error) {
      logger.error('Failed to handle workspace leave', { error, workspaceId, reason });
      throw error;
    }
  }

  // ==================== CLEANUP & MAINTENANCE ====================

  // Enhanced periodic cleanup with proper error handling and longer timeout
  const cleanupInterval = setInterval(async () => {
    try {
      await cleanupInactiveSessions();
    } catch (error) {
      logger.error('Failed to run session cleanup', { error });
    }
  }, 5 * 60 * 1000); // Run every 5 minutes

  // Cleanup function with improved session management
  async function cleanupInactiveSessions(): Promise<void> {
    const now = new Date();
    const inactiveThreshold = 30 * 60 * 1000; // 30 minutes (increased from 5 minutes)
    const activeSessions = await sessionStorage.getAll();
    
    const cleanupPromises: Promise<void>[] = [];
    
    for (const [socketId, session] of activeSessions.entries()) {
      const timeSinceActivity = now.getTime() - session.lastActivity.getTime();
      
      if (timeSinceActivity > inactiveThreshold) {
        cleanupPromises.push(cleanupSession(socketId, session));
      }
    }
    
    // Process all cleanups in parallel but with proper error handling
    const results = await Promise.allSettled(cleanupPromises);
    
    // Log any cleanup failures
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        logger.warn('Session cleanup failed', { 
          error: result.reason,
          sessionIndex: index
        });
      }
    });
    
    logger.debug('Session cleanup completed', { 
      totalSessions: activeSessions.size,
      cleanupAttempts: cleanupPromises.length,
      failures: results.filter(r => r.status === 'rejected').length
    });
  }

  // Enhanced session cleanup with proper error handling
  async function cleanupSession(socketId: string, session: SessionData): Promise<void> {
    try {
      const socket = io.sockets.sockets.get(socketId);
      if (socket) {
        // Socket still exists, perform graceful cleanup
        await handleWorkspaceLeave(socket as AuthenticatedSocket, session.workspaceId, 'inactivity_timeout');
        logger.info('Cleaned up inactive session', { 
          socketId, 
          userId: session.userId, 
          workspaceId: session.workspaceId,
          lastActivity: session.lastActivity
        });
      } else {
        // Socket no longer exists, clean up storage only
        await sessionStorage.delete(socketId);
        logger.debug('Cleaned up orphaned session', { socketId, userId: session.userId });
      }
    } catch (error) {
      logger.error('Failed to clean up session', { 
        error: error instanceof Error ? error.message : String(error), 
        socketId, 
        userId: session.userId 
      });
      
      // Force cleanup from storage even if other operations failed
      try {
        await sessionStorage.delete(socketId);
      } catch (storageError) {
        logger.error('Failed to delete session from storage', { 
          error: storageError instanceof Error ? storageError.message : String(storageError),
          socketId 
        });
      }
    }
  }

  // Graceful shutdown handling
  const shutdown = async () => {
    logger.info('Shutting down workspace WebSocket handlers');
    
    if (cleanupInterval) {
      clearInterval(cleanupInterval);
    }
    
    // Clean up session storage
    if (sessionStorage && typeof (sessionStorage as any).destroy === 'function') {
      (sessionStorage as any).destroy();
    }
  };

  // Handle process termination (use once to prevent handler accumulation)
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);

  logger.info('Workspace WebSocket handlers configured with enhanced session management');

  // Return cleanup function for testing/shutdown
  return {
    cleanup: shutdown,
    getActiveSessionCount: async () => (await sessionStorage.getAll()).size
  };
}

// ==================== BROADCAST UTILITIES ====================

/**
 * Broadcast realtime event to workspace
 */
export function broadcastWorkspaceEvent(
  io: SocketIOServer,
  workspaceId: string,
  event: WorkspaceRealtimeEvent
): void {
  io.to(`workspace:${workspaceId}`).emit('workspace:realtime_event', event);
}

/**
 * Broadcast presence update to workspace
 */
export function broadcastPresenceUpdate(
  io: SocketIOServer,
  workspaceId: string,
  update: WorkspacePresenceUpdate
): void {
  io.to(`workspace:${workspaceId}:presence`).emit('workspace:presence_updated', update);
}

/**
 * Broadcast member update to workspace
 */
export function broadcastMemberUpdate(
  io: SocketIOServer,
  workspaceId: string,
  event: 'member_joined' | 'member_left' | 'member_updated',
  data: any
): void {
  io.to(`workspace:${workspaceId}`).emit(`workspace:${event}`, {
    workspaceId,
    ...data,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Broadcast resource update to workspace
 */
export function broadcastResourceUpdate(
  io: SocketIOServer,
  workspaceId: string,
  resourceType: string,
  resourceId: string,
  event: 'resource_created' | 'resource_updated' | 'resource_deleted',
  data: any
): void {
  io.to(`workspace:${workspaceId}`).emit(`workspace:${event}`, {
    workspaceId,
    resourceType,
    resourceId,
    ...data,
    timestamp: new Date().toISOString(),
  });

  // Also broadcast to resource-specific room
  io.to(`workspace:${workspaceId}:${resourceType}:${resourceId}`).emit(
    `workspace:${event}`, 
    {
      workspaceId,
      resourceType,
      resourceId,
      ...data,
      timestamp: new Date().toISOString(),
    }
  );
}

/**
 * Broadcast integration update to workspace
 */
export function broadcastIntegrationUpdate(
  io: SocketIOServer,
  workspaceId: string,
  integrationId: string,
  event: 'integration_created' | 'integration_updated' | 'integration_deleted' | 'integration_synced',
  data: any
): void {
  io.to(`workspace:${workspaceId}`).emit(`workspace:${event}`, {
    workspaceId,
    integrationId,
    ...data,
    timestamp: new Date().toISOString(),
  });
}