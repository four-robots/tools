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
import {
  authenticateWebSocketConnection,
  validateTokenFreshness,
  extractTokenFromHandshake,
  AuthenticatedSocket
} from './auth-handler.js';
import { getGlobalRateLimiter } from './rate-limiter.js';
import { LRUCache, createLRUCache } from './lru-cache.js';
import { getCursorService } from '@mcp-tools/core/services/whiteboard/whiteboard-cursor-service';
import { getPresenceService } from '@mcp-tools/core/services/whiteboard/whiteboard-presence-service';
import { getSelectionService } from '@mcp-tools/core/services/whiteboard/whiteboard-selection-service';
import {
  validateUserInfo,
  validateActivityInfo,
  validateWhiteboardId,
  validateSessionId,
  validatePresenceUpdateRequest,
  validateSelectionData
} from '@mcp-tools/core/utils/input-validation';

interface WhiteboardAuthenticatedSocket extends AuthenticatedSocket {
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
  selectionBounds?: { x: number; y: number; width: number; height: number };
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
  
  // Track active whiteboard sessions with LRU eviction
  const activeWhiteboardSessions = createLRUCache<string, WhiteboardSession>('sessions');
  
  // Track canvas state versions for operational transforms with LRU eviction
  const canvasVersions = createLRUCache<string, number>('versions');
  
  // User color assignments for presence with LRU eviction
  const userColors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#FFB347'];
  const assignedColors = createLRUCache<string, string>('colors');
  
  // Rate limiting warning tracking to prevent spam
  const lastCursorRateWarning = new Map<string, number>();
  
  // Initialize presence service
  const presenceService = getPresenceService({
    idleTimeoutMs: 5 * 60 * 1000, // 5 minutes
    awayTimeoutMs: 15 * 60 * 1000, // 15 minutes
    offlineTimeoutMs: 30 * 60 * 1000, // 30 minutes
    enableActivityAwareness: true,
    enableAvatars: true,
    presenceUpdateThrottleMs: 1000,
  }, logger);
  
  // Initialize selection service
  const selectionService = getSelectionService({
    maxConcurrentUsers: 25,
    selectionTimeoutMs: 30 * 1000, // 30 seconds
    conflictResolutionTimeoutMs: 5 * 1000, // 5 seconds
    syncLatencyTargetMs: 200,
    enableAutomaticConflictResolution: true,
    conflictResolutionStrategy: 'priority',
    highlightOpacity: 0.3,
  }, logger);
  
  logger.info('Whiteboard WebSocket initialized', { 
    type: options?.useRedis ? 'Redis' : 'In-Memory',
    sessionTtl: sessionTtl / 1000 + 's',
    maxSessions: activeWhiteboardSessions.getStats().maxSize,
    maxVersions: canvasVersions.getStats().maxSize,
    maxColors: assignedColors.getStats().maxSize
  });

  io.on('connection', async (socket: WhiteboardAuthenticatedSocket) => {
    logger.debug('Whiteboard socket connection attempt', { socketId: socket.id });

    // Authenticate the WebSocket connection with proper JWT validation
    const token = extractTokenFromHandshake(socket);
    if (!token) {
      logger.warn('WebSocket connection rejected - no token provided', { socketId: socket.id });
      socket.emit('error', { code: 'AUTH_REQUIRED', message: 'Authentication token required' });
      socket.disconnect(true);
      return;
    }

    const authResult = await authenticateWebSocketConnection(socket, token);
    if (!authResult.success) {
      logger.warn('WebSocket authentication failed', { 
        socketId: socket.id, 
        error: authResult.error,
        clientIp: socket.handshake.address
      });
      socket.emit('error', { 
        code: 'AUTH_FAILED', 
        message: 'Authentication failed',
        details: authResult.error 
      });
      socket.disconnect(true);
      return;
    }

    logger.info('Whiteboard socket authenticated successfully', { 
      socketId: socket.id, 
      userId: socket.user?.id 
    });

    // ==================== WHITEBOARD SESSIONS ====================

    // Join whiteboard
    socket.on('whiteboard:join', async (data: { 
      whiteboardId: string; 
      workspaceId: string;
      clientInfo?: any;
    }) => {
      try {
        // Validate token freshness and user authentication
        const validation = validateUserAndToken(socket);
        if (!validation.valid) {
          socket.emit('error', validation.error);
          if (validation.error.code === 'TOKEN_INVALID') {
            socket.disconnect(true);
          }
          return;
        }

        // Check rate limiting
        const rateLimitCheck = checkRateLimit(socket, 'whiteboard:join');
        if (!rateLimitCheck.allowed) {
          socket.emit('error', rateLimitCheck.error);
          return;
        }

        const { whiteboardId, workspaceId, clientInfo } = data;
        
        // Assign user color for presence
        if (!assignedColors.has(socket.user.id)) {
          const colorIndex = assignedColors.size() % userColors.length;
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
        if (!canvasVersions.has(sanitizedWhiteboardId)) {
          canvasVersions.set(sanitizedWhiteboardId, 1);
        }

        // Join whiteboard rooms
        socket.join(`whiteboard:${sanitizedWhiteboardId}`);
        socket.join(`whiteboard:${sanitizedWhiteboardId}:presence`);
        socket.join(`whiteboard:${sanitizedWhiteboardId}:comments`);

        // Validate input data before processing
        const whiteboardValidation = validateWhiteboardId(whiteboardId);
        if (!whiteboardValidation.valid) {
          socket.emit('error', {
            code: 'INVALID_INPUT',
            message: 'Invalid whiteboard ID',
            details: whiteboardValidation.error
          });
          return;
        }
        
        const userInfoValidation = validateUserInfo({
          userName: socket.user.name,
          userEmail: socket.user.email,
          avatar: socket.user.avatar
        });
        
        if (!userInfoValidation.valid) {
          socket.emit('error', {
            code: 'INVALID_INPUT',
            message: 'Invalid user information',
            details: userInfoValidation.errors.join(', ')
          });
          return;
        }
        
        // Use sanitized data
        const sanitizedWhiteboardId = whiteboardValidation.sanitized;
        const sanitizedUserInfo = userInfoValidation.sanitizedData;
        
        // Update whiteboard session with sanitized ID
        socket.whiteboardSession.whiteboardId = sanitizedWhiteboardId;
        whiteboardSession.whiteboardId = sanitizedWhiteboardId;
        
        // Register with presence service using sanitized data
        const presenceState = await presenceService.joinWhiteboard(
          socket.user.id,
          sanitizedWhiteboardId,
          whiteboardSession.sessionToken,
          {
            userName: sanitizedUserInfo.userName,
            userEmail: sanitizedUserInfo.userEmail,
            avatar: sanitizedUserInfo.avatar,
            connectionId: socket.id,
          }
        );

        // Emit session started
        socket.emit('whiteboard:session_started', {
          sessionId: whiteboardSession.sessionToken,
          whiteboardId: sanitizedWhiteboardId,
          workspaceId,
          permissions: whiteboardSession.permissions,
          canvasVersion: canvasVersions.get(sanitizedWhiteboardId),
          presenceState,
        });

        // Broadcast user joined to other participants with presence info
        socket.to(`whiteboard:${sanitizedWhiteboardId}`).emit('whiteboard:user_joined', {
          user: {
            id: socket.user.id,
            name: sanitizedUserInfo.userName,
            avatar: sanitizedUserInfo.avatar,
          },
          presenceState,
          timestamp: new Date().toISOString(),
        });

        // Send current presence information to new user
        const allPresences = presenceService.getWhiteboardPresence(sanitizedWhiteboardId);
        socket.emit('whiteboard:presence_list', allPresences);

        logger.info('User joined whiteboard', { 
          whiteboardId: sanitizedWhiteboardId, 
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
        // Validate token freshness for critical operations
        const validation = validateUserAndToken(socket);
        if (!validation.valid) {
          socket.emit('error', validation.error);
          if (validation.error.code === 'TOKEN_INVALID') {
            socket.disconnect(true);
          }
          return;
        }

        // Check rate limiting for canvas changes with comprehensive feedback
        const rateLimitCheck = checkRateLimit(socket, 'whiteboard:canvas_change');
        if (!rateLimitCheck.allowed) {
          socket.emit('whiteboard:canvas_ack', {
            operationId: data.operation.elementId,
            success: false,
            error: rateLimitCheck.error.message,
            rateLimited: true,
            retryAfterMs: rateLimitCheck.error.retryAfterMs,
            guidance: 'Please slow down canvas operations to maintain performance for all users'
          });
          
          // Also emit a general rate limit notification
          socket.emit('whiteboard:rate_limit_warning', {
            operation: 'canvas_change',
            message: 'Canvas operations are being rate limited',
            retryAfterMs: rateLimitCheck.error.retryAfterMs,
            timestamp: new Date().toISOString()
          });
          return;
        }

        if (!socket.whiteboardSession) {
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

        // Check rate limiting for sync requests with detailed feedback
        const rateLimitCheck = checkRateLimit(socket, 'whiteboard:request_sync');
        if (!rateLimitCheck.allowed) {
          socket.emit('whiteboard:sync_rate_limited', {
            code: rateLimitCheck.error.code,
            message: 'Sync requests are being rate limited',
            retryAfterMs: rateLimitCheck.error.retryAfterMs,
            guidance: 'Please wait before requesting another sync',
            timestamp: new Date().toISOString()
          });
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

        // Check rate limiting for presence updates with user feedback
        const rateLimitCheck = checkRateLimit(socket, 'whiteboard:presence');
        if (!rateLimitCheck.allowed) {
          // Implement backpressure with user notification
          socket.emit('whiteboard:presence_rate_limited', {
            code: rateLimitCheck.error.code,
            message: 'Presence updates are being rate limited to maintain performance',
            retryAfterMs: rateLimitCheck.error.retryAfterMs,
            guidance: 'Please reduce the frequency of presence updates',
            timestamp: new Date().toISOString()
          });
          
          logger.warn('Presence update rate limited with user notification', {
            userId: socket.user.id,
            socketId: socket.id,
            retryAfterMs: rateLimitCheck.error.retryAfterMs
          });
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

    // ==================== ENHANCED PRESENCE INDICATORS ====================

    // Update presence status (active/idle/away/busy)
    socket.on('whiteboard:presence_status', async (data: {
      status: 'online' | 'idle' | 'away' | 'busy';
      customStatus?: string;
    }) => {
      try {
        if (!socket.whiteboardSession || !socket.user) {
          return;
        }

        const { whiteboardId } = socket.whiteboardSession;
        const { status, customStatus } = data;

        // Update presence status
        const presenceState = await presenceService.updatePresenceStatus(
          socket.user.id,
          whiteboardId,
          status,
          customStatus
        );

        if (presenceState) {
          // Broadcast status update to other participants
          socket.to(`whiteboard:${whiteboardId}:presence`).emit('whiteboard:presence_status_updated', {
            userId: socket.user.id,
            status,
            customStatus,
            presenceState,
            timestamp: new Date().toISOString(),
          });
        }

        logger.debug('Presence status updated', { 
          userId: socket.user.id, 
          whiteboardId, 
          status,
          customStatus 
        });

      } catch (error) {
        logger.error('Failed to update presence status', { error, data });
      }
    });

    // Update activity awareness (drawing, typing, selecting, etc.)
    socket.on('whiteboard:activity', async (data: {
      type: 'drawing' | 'typing' | 'selecting' | 'commenting' | 'idle';
      elementId?: string;
      description?: string;
    }) => {
      try {
        if (!socket.whiteboardSession || !socket.user) {
          return;
        }

        const { whiteboardId } = socket.whiteboardSession;
        const activity = {
          ...data,
          timestamp: Date.now(),
        };

        // Update activity in presence service
        const presenceState = await presenceService.updateActivity(
          socket.user.id,
          whiteboardId,
          activity
        );

        if (presenceState) {
          // Broadcast activity update to other participants
          socket.to(`whiteboard:${whiteboardId}:presence`).emit('whiteboard:activity_updated', {
            userId: socket.user.id,
            userName: socket.user.name,
            activity,
            presenceState,
            timestamp: new Date().toISOString(),
          });
        }

        logger.debug('Activity updated', { 
          userId: socket.user.id, 
          whiteboardId, 
          activity: activity.type 
        });

      } catch (error) {
        logger.error('Failed to update activity', { error, data });
      }
    });

    // Send heartbeat to maintain presence
    socket.on('whiteboard:heartbeat', async () => {
      try {
        if (!socket.whiteboardSession || !socket.user) {
          return;
        }

        const { whiteboardId, sessionId } = socket.whiteboardSession;

        // Send heartbeat to presence service
        await presenceService.sendHeartbeat(socket.user.id, whiteboardId, sessionId);

        // Respond with heartbeat acknowledgment
        socket.emit('whiteboard:heartbeat_ack', {
          timestamp: new Date().toISOString(),
        });

      } catch (error) {
        logger.error('Failed to handle heartbeat', { error });
      }
    });

    // Request current presence information
    socket.on('whiteboard:request_presence', async (data: {
      whiteboardId?: string;
    }) => {
      try {
        if (!socket.user) {
          return;
        }

        const whiteboardId = data.whiteboardId || socket.whiteboardSession?.whiteboardId;
        if (!whiteboardId) {
          return;
        }

        // Get all presence information for the whiteboard
        const allPresences = presenceService.getWhiteboardPresence(whiteboardId);
        
        socket.emit('whiteboard:presence_list', allPresences);

        logger.debug('Presence list requested', { 
          userId: socket.user.id, 
          whiteboardId,
          presenceCount: allPresences.length
        });

      } catch (error) {
        logger.error('Failed to get presence list', { error, data });
      }
    });

    // Get user activity history
    socket.on('whiteboard:request_activity_history', async (data: {
      userId?: string;
      whiteboardId?: string;
    }) => {
      try {
        if (!socket.user) {
          return;
        }

        const whiteboardId = data.whiteboardId || socket.whiteboardSession?.whiteboardId;
        const targetUserId = data.userId || socket.user.id;
        
        if (!whiteboardId) {
          return;
        }

        // Get activity history for the user
        const activityHistory = presenceService.getUserActivityHistory(targetUserId, whiteboardId);
        
        socket.emit('whiteboard:activity_history', {
          userId: targetUserId,
          whiteboardId,
          activities: activityHistory,
          timestamp: new Date().toISOString(),
        });

      } catch (error) {
        logger.error('Failed to get activity history', { error, data });
      }
    });

    // ==================== LIVE CURSOR TRACKING ====================

    // Cursor enter (user starts tracking)
    socket.on('whiteboard:cursor_enter', async (data: {
      whiteboardId: string;
      sessionId: string;
      userInfo: {
        userId: string;
        userName: string;
        userColor: string;
      };
    }) => {
      try {
        if (!socket.whiteboardSession || !socket.user) {
          return;
        }

        // Check rate limiting for cursor events with user feedback
        const rateLimitCheck = checkRateLimit(socket, 'whiteboard:cursor_enter');
        if (!rateLimitCheck.allowed) {
          socket.emit('whiteboard:cursor_rate_limited', {
            code: rateLimitCheck.error.code,
            message: 'Cursor operations are being rate limited',
            retryAfterMs: rateLimitCheck.error.retryAfterMs,
            guidance: 'Please wait before attempting cursor operations',
            timestamp: new Date().toISOString()
          });
          return;
        }

        const { whiteboardId, sessionId, userInfo } = data;
        
        // Get cursor service with proper error handling
        let cursorService;
        try {
          cursorService = getCursorService(logger);
          if (!cursorService) {
            throw new Error('Cursor service unavailable');
          }
        } catch (error) {
          logger.error('Failed to get cursor service', { error, whiteboardId, sessionId });
          socket.emit('whiteboard:cursor_service_error', {
            code: 'CURSOR_SERVICE_UNAVAILABLE',
            message: 'Cursor tracking service is temporarily unavailable',
            timestamp: new Date().toISOString()
          });
          return;
        }

        // Initialize cursor tracking for this user with error boundary
        try {
          await cursorService.updateCursorPosition(
            userInfo.userId,
            whiteboardId,
            {
              x: 0,
              y: 0,
              canvasX: 0,
              canvasY: 0,
              timestamp: Date.now(),
              interpolated: false,
            },
            {
              userId: userInfo.userId,
              userName: userInfo.userName,
              userColor: userInfo.userColor,
              sessionId,
              whiteboardId,
              lastSeen: Date.now(),
              isActive: true,
            }
          );
        } catch (error) {
          logger.error('Failed to initialize cursor tracking', {
            error,
            userId: userInfo.userId,
            whiteboardId,
            sessionId
          });
          // Continue without cursor tracking rather than failing completely
          socket.emit('whiteboard:cursor_tracking_degraded', {
            code: 'CURSOR_INIT_FAILED',
            message: 'Cursor tracking initialization failed, continuing without cursor features',
            timestamp: new Date().toISOString()
          });
        }

        // Broadcast cursor enter to other participants
        socket.to(`whiteboard:${whiteboardId}:presence`).emit('whiteboard:cursor_updated', {
          userId: userInfo.userId,
          userName: userInfo.userName,
          userColor: userInfo.userColor,
          position: {
            x: 0,
            y: 0,
            canvasX: 0,
            canvasY: 0,
          },
          timestamp: Date.now(),
          sessionId,
        });

        logger.debug('Cursor tracking started', { 
          userId: userInfo.userId, 
          whiteboardId,
          sessionId 
        });

      } catch (error) {
        logger.error('Failed to handle cursor enter', { error, data });
      }
    });

    // Cursor move (high-frequency updates)
    socket.on('whiteboard:cursor_move', async (data: {
      whiteboardId: string;
      position: {
        x: number;
        y: number;
        canvasX: number;
        canvasY: number;
      };
      timestamp: number;
      sessionId: string;
    }) => {
      try {
        if (!socket.whiteboardSession || !socket.user) {
          return;
        }

        // Aggressive rate limiting for cursor moves (60 FPS max) with backpressure
        const rateLimitCheck = checkRateLimit(socket, 'whiteboard:cursor_move');
        if (!rateLimitCheck.allowed) {
          // For high-frequency cursor moves, emit warning less frequently to avoid spam
          const warningKey = `cursor_warning_${socket.user.id}`;
          const lastWarning = lastCursorRateWarning.get(warningKey) || 0;
          const now = Date.now();
          
          if (now - lastWarning > 5000) { // Warn at most every 5 seconds
            socket.emit('whiteboard:cursor_rate_limited', {
              code: 'RATE_LIMITED',
              message: 'Cursor updates are being throttled for optimal performance',
              guidance: 'High-frequency updates are automatically managed',
              timestamp: new Date().toISOString()
            });
            
            lastCursorRateWarning.set(warningKey, now);
          }
          
          return; // Drop high-frequency updates but inform user occasionally
        }

        const { whiteboardId, position, timestamp, sessionId } = data;
        
        // Get cursor service with error handling
        let cursorService;
        let cursorState = null;
        
        try {
          cursorService = getCursorService(logger);
          if (!cursorService) {
            throw new Error('Cursor service unavailable');
          }
          
          // Update cursor position with interpolation
          cursorState = await cursorService.updateCursorPosition(
            socket.user.id,
            whiteboardId,
            {
              ...position,
              timestamp,
              interpolated: false,
            }
          );
        } catch (error) {
          // Log but don't fail cursor tracking - continue with degraded functionality
          logger.debug('Cursor service error during move, continuing with degraded functionality', {
            error: error instanceof Error ? error.message : String(error),
            userId: socket.user.id,
            whiteboardId
          });
          
          // Create minimal cursor state for broadcast
          cursorState = {
            userId: socket.user.id,
            userName: socket.user.name,
            userColor: assignedColors.get(socket.user.id) || userColors[0],
            position,
            timestamp,
            sessionId,
            isActive: true,
            lastSeen: Date.now()
          };
        }

        // Broadcast cursor position to other participants
        socket.to(`whiteboard:${whiteboardId}:presence`).emit('whiteboard:cursor_updated', {
          userId: socket.user.id,
          userName: socket.user.name,
          userColor: cursorState?.userColor || assignedColors.get(socket.user.id) || userColors[0],
          position,
          timestamp,
          sessionId,
        });

      } catch (error) {
        // Log but don't disrupt cursor tracking
        logger.debug('Failed to handle cursor move', { error: error.message });
      }
    });

    // Cursor leave (user stops tracking)
    socket.on('whiteboard:cursor_leave', async (data: {
      whiteboardId: string;
      sessionId: string;
      userId: string;
    }) => {
      try {
        if (!socket.whiteboardSession || !socket.user) {
          return;
        }

        const { whiteboardId, sessionId, userId } = data;
        
        // Remove cursor tracking with error handling
        try {
          const cursorService = getCursorService(logger);
          if (cursorService) {
            await cursorService.removeCursor(userId, whiteboardId, 'leave');
          } else {
            logger.warn('Cursor service unavailable during cursor leave', { userId, whiteboardId });
          }
        } catch (error) {
          logger.warn('Failed to remove cursor tracking', {
            error: error instanceof Error ? error.message : String(error),
            userId,
            whiteboardId
          });
          // Continue with disconnect even if cursor removal fails
        }

        // Broadcast cursor disconnect to other participants
        socket.to(`whiteboard:${whiteboardId}:presence`).emit('whiteboard:cursor_disconnected', {
          userId,
          sessionId,
          timestamp: Date.now(),
          reason: 'leave',
        });

        logger.debug('Cursor tracking stopped', { userId, whiteboardId, sessionId });

      } catch (error) {
        logger.error('Failed to handle cursor leave', { error, data });
      }
    });

    // ==================== SELECTION HIGHLIGHTING ====================

    // Update selection (multi-user selection tracking)
    socket.on('whiteboard:selection_changed', async (data: {
      whiteboardId: string;
      elementIds: string[];
      bounds?: { x: number; y: number; width: number; height: number };
      isMultiSelect?: boolean;
      sessionId: string;
    }) => {
      try {
        if (!socket.whiteboardSession || !socket.user) {
          socket.emit('error', { code: 'NO_SESSION', message: 'No active whiteboard session' });
          return;
        }

        // Validate token freshness
        const validation = validateUserAndToken(socket);
        if (!validation.valid) {
          socket.emit('error', validation.error);
          if (validation.error.code === 'TOKEN_INVALID') {
            socket.disconnect(true);
          }
          return;
        }

        // Check rate limiting for selection updates
        const rateLimitCheck = checkRateLimit(socket, 'whiteboard:selection_changed');
        if (!rateLimitCheck.allowed) {
          socket.emit('whiteboard:selection_rate_limited', {
            code: rateLimitCheck.error.code,
            message: 'Selection updates are being rate limited',
            retryAfterMs: rateLimitCheck.error.retryAfterMs,
            guidance: 'Please reduce the frequency of selection changes',
            timestamp: new Date().toISOString()
          });
          return;
        }

        const { whiteboardId, elementIds, bounds, isMultiSelect = false, sessionId } = data;

        // Validate whiteboard ID
        const whiteboardValidation = validateWhiteboardId(whiteboardId);
        if (!whiteboardValidation.valid) {
          socket.emit('error', {
            code: 'INVALID_INPUT',
            message: 'Invalid whiteboard ID',
            details: whiteboardValidation.error
          });
          return;
        }

        // Validate selection data
        const selectionValidation = validateSelectionData({
          elementIds,
          bounds,
          isMultiSelect
        });
        if (!selectionValidation.valid) {
          socket.emit('error', {
            code: 'INVALID_INPUT',
            message: 'Invalid selection data',
            details: selectionValidation.errors.join(', ')
          });
          return;
        }

        const sanitizedWhiteboardId = whiteboardValidation.sanitized;
        const sanitizedSelection = selectionValidation.sanitizedData;

        // Update selection using the selection service
        const result = await selectionService.updateSelection(
          socket.user.id,
          socket.user.name,
          assignedColors.get(socket.user.id) || userColors[0],
          sanitizedWhiteboardId,
          sessionId,
          sanitizedSelection.elementIds || [],
          sanitizedSelection.bounds
        );

        if (!result.success) {
          socket.emit('whiteboard:selection_ack', {
            success: false,
            error: result.error,
            latency: result.latency,
            timestamp: new Date().toISOString()
          });
          return;
        }

        // Update session activity
        const session = activeWhiteboardSessions.get(socket.id);
        if (session) {
          session.lastActivity = new Date();
          // Update selection data in presence
          if (session.presence) {
            session.presence.selection = sanitizedSelection.elementIds || [];
            session.presence.selectionBounds = sanitizedSelection.bounds;
            session.presence.timestamp = new Date().toISOString();
          }
          await sessionStorage.set(socket.id, session, sessionTtl);
        }

        // Broadcast selection change to other participants
        socket.to(`whiteboard:${sanitizedWhiteboardId}:presence`).emit('whiteboard:selection_updated', {
          userId: socket.user.id,
          userName: socket.user.name,
          userColor: assignedColors.get(socket.user.id) || userColors[0],
          elementIds: sanitizedSelection.elementIds || [],
          bounds: sanitizedSelection.bounds,
          isMultiSelect: sanitizedSelection.isMultiSelect || false,
          timestamp: new Date().toISOString(),
          selectionState: result.selectionState,
        });

        // Handle conflicts if any
        if (result.conflicts && result.conflicts.length > 0) {
          // Broadcast conflicts to all participants
          io.to(`whiteboard:${sanitizedWhiteboardId}`).emit('whiteboard:selection_conflicts', {
            conflicts: result.conflicts,
            timestamp: new Date().toISOString(),
          });

          logger.info('Selection conflicts detected', {
            whiteboardId: sanitizedWhiteboardId,
            userId: socket.user.id,
            conflictCount: result.conflicts.length,
            elementIds: result.conflicts.map(c => c.elementId)
          });
        }

        // Handle ownerships if any
        if (result.ownerships && result.ownerships.length > 0) {
          // Broadcast ownership changes
          io.to(`whiteboard:${sanitizedWhiteboardId}`).emit('whiteboard:element_ownership_changed', {
            ownerships: result.ownerships,
            timestamp: new Date().toISOString(),
          });
        }

        // Send acknowledgment
        socket.emit('whiteboard:selection_ack', {
          success: true,
          latency: result.latency,
          selectionState: result.selectionState,
          conflicts: result.conflicts,
          ownerships: result.ownerships,
          timestamp: new Date().toISOString()
        });

        logger.debug('Selection updated', {
          whiteboardId: sanitizedWhiteboardId,
          userId: socket.user.id,
          elementCount: sanitizedSelection.elementIds?.length || 0,
          hasConflicts: (result.conflicts?.length || 0) > 0,
          latency: result.latency
        });

      } catch (error) {
        logger.error('Failed to update selection', { error, data });
        socket.emit('whiteboard:selection_ack', {
          success: false,
          error: 'Failed to update selection',
          timestamp: new Date().toISOString()
        });
      }
    });

    // Clear user selections
    socket.on('whiteboard:selection_cleared', async (data: {
      whiteboardId: string;
      sessionId: string;
    }) => {
      try {
        if (!socket.whiteboardSession || !socket.user) {
          socket.emit('error', { code: 'NO_SESSION', message: 'No active whiteboard session' });
          return;
        }

        const { whiteboardId, sessionId } = data;

        // Validate whiteboard ID
        const whiteboardValidation = validateWhiteboardId(whiteboardId);
        if (!whiteboardValidation.valid) {
          socket.emit('error', {
            code: 'INVALID_INPUT',
            message: 'Invalid whiteboard ID',
            details: whiteboardValidation.error
          });
          return;
        }

        // Validate session ID
        const sessionValidation = validateSessionId(sessionId);
        if (!sessionValidation.valid) {
          socket.emit('error', {
            code: 'INVALID_INPUT',
            message: 'Invalid session ID',
            details: sessionValidation.error
          });
          return;
        }

        const sanitizedWhiteboardId = whiteboardValidation.sanitized;
        const sanitizedSessionId = sessionValidation.sanitized;

        // Clear selections using the selection service
        const result = await selectionService.clearUserSelections(
          socket.user.id,
          sanitizedWhiteboardId,
          sanitizedSessionId
        );

        if (result.success) {
          // Update session presence
          const session = activeWhiteboardSessions.get(socket.id);
          if (session && session.presence) {
            session.presence.selection = [];
            session.presence.selectionBounds = undefined;
            session.presence.timestamp = new Date().toISOString();
            await sessionStorage.set(socket.id, session, sessionTtl);
          }

          // Broadcast selection clear to other participants
          socket.to(`whiteboard:${sanitizedWhiteboardId}:presence`).emit('whiteboard:selection_cleared', {
            userId: socket.user.id,
            userName: socket.user.name,
            clearedCount: result.cleared,
            timestamp: new Date().toISOString(),
          });

          logger.debug('Selection cleared', {
            whiteboardId: sanitizedWhiteboardId,
            userId: socket.user.id,
            cleared: result.cleared
          });
        }

        // Send acknowledgment
        socket.emit('whiteboard:selection_clear_ack', {
          success: result.success,
          cleared: result.cleared,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        logger.error('Failed to clear selection', { error, data });
        socket.emit('whiteboard:selection_clear_ack', {
          success: false,
          error: 'Failed to clear selection',
          timestamp: new Date().toISOString()
        });
      }
    });

    // Request current selections (for new users or reconnection)
    socket.on('whiteboard:request_selections', async (data: { 
      whiteboardId: string 
    }) => {
      try {
        if (!socket.whiteboardSession || !socket.user) {
          return;
        }

        // Check rate limiting
        const rateLimitCheck = checkRateLimit(socket, 'whiteboard:request_selections');
        if (!rateLimitCheck.allowed) {
          socket.emit('whiteboard:selections_rate_limited', {
            code: rateLimitCheck.error.code,
            message: 'Selection requests are being rate limited',
            retryAfterMs: rateLimitCheck.error.retryAfterMs,
            guidance: 'Please wait before requesting selections again',
            timestamp: new Date().toISOString()
          });
          return;
        }

        const { whiteboardId } = data;

        // Validate whiteboard ID
        const whiteboardValidation = validateWhiteboardId(whiteboardId);
        if (!whiteboardValidation.valid) {
          socket.emit('error', {
            code: 'INVALID_INPUT',
            message: 'Invalid whiteboard ID',
            details: whiteboardValidation.error
          });
          return;
        }

        const sanitizedWhiteboardId = whiteboardValidation.sanitized;

        // Get all active selections for the whiteboard
        const selections = selectionService.getWhiteboardSelections(sanitizedWhiteboardId);
        const highlights = selectionService.getSelectionHighlights(sanitizedWhiteboardId);
        const conflicts = selectionService.getWhiteboardConflicts(sanitizedWhiteboardId);

        // Send current state to requesting user
        socket.emit('whiteboard:selections_state', {
          selections,
          highlights,
          conflicts,
          timestamp: new Date().toISOString(),
        });

        logger.debug('Selections state sent', {
          whiteboardId: sanitizedWhiteboardId,
          userId: socket.user.id,
          selectionCount: selections.length,
          highlightCount: highlights.length,
          conflictCount: conflicts.length
        });

      } catch (error) {
        logger.error('Failed to get selections state', { error, data });
        socket.emit('error', {
          code: 'SELECTIONS_REQUEST_FAILED',
          message: 'Failed to get selections state'
        });
      }
    });

    // Resolve selection conflict (manual resolution)
    socket.on('whiteboard:resolve_selection_conflict', async (data: {
      whiteboardId: string;
      conflictId: string;
      resolution: 'ownership' | 'shared' | 'cancel';
    }) => {
      try {
        if (!socket.whiteboardSession || !socket.user) {
          socket.emit('error', { code: 'NO_SESSION', message: 'No active whiteboard session' });
          return;
        }

        const { whiteboardId, conflictId, resolution } = data;

        // Validate whiteboard ID
        const whiteboardValidation = validateWhiteboardId(whiteboardId);
        if (!whiteboardValidation.valid) {
          socket.emit('error', {
            code: 'INVALID_INPUT',
            message: 'Invalid whiteboard ID',
            details: whiteboardValidation.error
          });
          return;
        }

        // Validate conflict ID
        if (!conflictId || typeof conflictId !== 'string' || conflictId.length > 100) {
          socket.emit('error', {
            code: 'INVALID_INPUT',
            message: 'Invalid conflict ID'
          });
          return;
        }

        // Validate resolution type
        const validResolutions = ['ownership', 'shared', 'cancel'];
        if (!resolution || !validResolutions.includes(resolution)) {
          socket.emit('error', {
            code: 'INVALID_INPUT',
            message: 'Invalid resolution type'
          });
          return;
        }

        const sanitizedWhiteboardId = whiteboardValidation.sanitized;

        // Resolve conflict using the selection service
        const result = await selectionService.resolveConflict(
          conflictId,
          socket.user.id,
          resolution
        );

        if (result.success) {
          // Broadcast conflict resolution to all participants
          io.to(`whiteboard:${sanitizedWhiteboardId}`).emit('whiteboard:selection_conflict_resolved', {
            conflictId,
            resolution,
            resolvedBy: {
              id: socket.user.id,
              name: socket.user.name,
            },
            ownership: result.ownership,
            timestamp: new Date().toISOString(),
          });

          logger.info('Selection conflict resolved', {
            whiteboardId: sanitizedWhiteboardId,
            conflictId,
            resolution,
            resolvedBy: socket.user.id
          });
        }

        // Send acknowledgment
        socket.emit('whiteboard:conflict_resolve_ack', {
          success: result.success,
          conflictId,
          resolution,
          ownership: result.ownership,
          error: result.error,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        logger.error('Failed to resolve selection conflict', { error, data });
        socket.emit('whiteboard:conflict_resolve_ack', {
          success: false,
          conflictId: data.conflictId,
          error: 'Failed to resolve conflict',
          timestamp: new Date().toISOString()
        });
      }
    });

    // Get element ownership status
    socket.on('whiteboard:request_element_ownership', async (data: {
      whiteboardId: string;
      elementId: string;
    }) => {
      try {
        if (!socket.whiteboardSession || !socket.user) {
          return;
        }

        const { whiteboardId, elementId } = data;

        // Validate whiteboard ID
        const whiteboardValidation = validateWhiteboardId(whiteboardId);
        if (!whiteboardValidation.valid) {
          socket.emit('error', {
            code: 'INVALID_INPUT',
            message: 'Invalid whiteboard ID',
            details: whiteboardValidation.error
          });
          return;
        }

        // Validate element ID
        const elementIdValidation = validateElementId(elementId);
        if (!elementIdValidation.valid) {
          socket.emit('error', {
            code: 'INVALID_INPUT',
            message: 'Invalid element ID',
            details: elementIdValidation.error
          });
          return;
        }

        const sanitizedWhiteboardId = whiteboardValidation.sanitized;
        const sanitizedElementId = elementIdValidation.sanitized;

        // Get ownership information
        const ownership = selectionService.getElementOwnership(sanitizedElementId, sanitizedWhiteboardId);

        // Send ownership info
        socket.emit('whiteboard:element_ownership_info', {
          elementId: sanitizedElementId,
          ownership,
          timestamp: new Date().toISOString(),
        });

      } catch (error) {
        logger.error('Failed to get element ownership', { error, data });
        socket.emit('error', {
          code: 'OWNERSHIP_REQUEST_FAILED',
          message: 'Failed to get element ownership'
        });
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
      const disconnectKey = `disconnect:${socket.id}`;
      
      // Prevent concurrent disconnect handling
      if (cleanupOperations.has(disconnectKey)) {
        logger.debug('Disconnect cleanup already in progress', { 
          socketId: socket.id, 
          userId: socket.user?.id,
          reason 
        });
        return;
      }
      
      const disconnectCleanup = performDisconnectCleanup(socket, reason);
      cleanupOperations.set(disconnectKey, disconnectCleanup);
      
      try {
        await disconnectCleanup;
      } finally {
        cleanupOperations.delete(disconnectKey);
      }
    });
    
  async function performDisconnectCleanup(
    socket: WhiteboardAuthenticatedSocket,
    reason: string
  ): Promise<void> {
    try {
      // Handle whiteboard leave with atomic cleanup
      if (socket.whiteboardSession) {
        await handleWhiteboardLeave(socket, socket.whiteboardSession.whiteboardId, reason);
      }

      // Additional session cleanup (defensive - should be done in handleWhiteboardLeave)
      try {
        await sessionStorage.delete(socket.id);
        activeWhiteboardSessions.delete(socket.id);
      } catch (sessionError) {
        logger.warn('Additional session cleanup error during disconnect', {
          error: sessionError instanceof Error ? sessionError.message : String(sessionError),
          socketId: socket.id
        });
      }
      
      // Clean up rate limiting warning cache
      const warningKey = `cursor_warning_${socket.user?.id}`;
      lastCursorRateWarning.delete(warningKey);

      logger.info('Whiteboard socket disconnect cleanup completed', { 
        socketId: socket.id, 
        userId: socket.user?.id,
        reason 
      });

    } catch (error) {
      logger.error('Failed to handle whiteboard disconnect cleanup', {
        error: error instanceof Error ? error.message : String(error),
        socketId: socket.id,
        userId: socket.user?.id,
        reason
      });
      // Don't throw - we want disconnect to complete even if cleanup fails
    }
  }

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

  /**
   * Validates token freshness and user authentication for operations
   */
  function validateUserAndToken(socket: WhiteboardAuthenticatedSocket): { valid: boolean; error?: any } {
    if (!socket.user) {
      return { 
        valid: false, 
        error: { code: 'AUTH_REQUIRED', message: 'Authentication required' } 
      };
    }

    const tokenValidation = validateTokenFreshness(socket);
    if (!tokenValidation.valid) {
      logger.warn('Token validation failed', {
        userId: socket.user.id,
        reason: tokenValidation.reason,
        socketId: socket.id
      });
      return {
        valid: false,
        error: { 
          code: 'TOKEN_INVALID', 
          message: 'Token validation failed',
          details: tokenValidation.reason 
        }
      };
    }

    return { valid: true };
  }

  // Removed separate cursor rate limiting - now using global rate limiter for consistency

  /**
   * Checks rate limiting for a user operation using global rate limiter
   */
  function checkRateLimit(socket: WhiteboardAuthenticatedSocket, operation: string): { allowed: boolean; error?: any } {
    if (!socket.user) {
      return {
        allowed: false,
        error: { code: 'AUTH_REQUIRED', message: 'Authentication required' }
      };
    }

    const rateLimiter = getGlobalRateLimiter();
    const clientIp = socket.handshake.address;
    const result = rateLimiter.checkRateLimit(socket.user.id, operation, clientIp);

    if (!result.allowed) {
      logger.warn('Rate limit exceeded for WebSocket operation', {
        userId: socket.user.id,
        operation,
        clientIp,
        error: result.error,
        retryAfterMs: result.retryAfterMs
      });

      return {
        allowed: false,
        error: {
          code: result.error,
          message: 'Rate limit exceeded',
          retryAfterMs: result.retryAfterMs
        }
      };
    }

    return { allowed: true };
  }

  // Atomic cleanup operations state
  const cleanupOperations = new Map<string, Promise<void>>();
  
  async function handleWhiteboardLeave(
    socket: WhiteboardAuthenticatedSocket, 
    whiteboardId: string, 
    reason?: string
  ): Promise<void> {
    if (!socket.user || !socket.whiteboardSession) {
      return;
    }

    const cleanupKey = `${socket.id}:${whiteboardId}`;
    
    // Prevent concurrent cleanup operations for the same socket/whiteboard
    if (cleanupOperations.has(cleanupKey)) {
      logger.debug('Cleanup already in progress, waiting for completion', { 
        socketId: socket.id, 
        whiteboardId, 
        userId: socket.user.id 
      });
      await cleanupOperations.get(cleanupKey);
      return;
    }

    // Create atomic cleanup operation
    const cleanupPromise = performAtomicCleanup(socket, whiteboardId, reason);
    cleanupOperations.set(cleanupKey, cleanupPromise);

    try {
      await cleanupPromise;
    } finally {
      cleanupOperations.delete(cleanupKey);
    }
  }
  
  async function performAtomicCleanup(
    socket: WhiteboardAuthenticatedSocket,
    whiteboardId: string,
    reason?: string
  ): Promise<void> {
    const userId = socket.user!.id;
    const sessionId = socket.whiteboardSession!.sessionId;
    const cleanupErrors: string[] = [];
    
    logger.debug('Starting atomic cleanup', { userId, whiteboardId, sessionId, reason });

    // Step 1: Clean up cursor tracking (non-critical)
    try {
      const cursorService = getCursorService(logger);
      if (cursorService) {
        await cursorService.removeCursor(userId, whiteboardId, 'disconnect');
        logger.debug('Cursor cleanup completed', { userId, whiteboardId });
      } else {
        logger.warn('Cursor service unavailable during cleanup', { userId, whiteboardId });
      }
    } catch (cursorError) {
      const errorMsg = `Cursor cleanup failed: ${cursorError instanceof Error ? cursorError.message : String(cursorError)}`;
      cleanupErrors.push(errorMsg);
      logger.warn('Cursor cleanup error (non-critical)', { userId, whiteboardId, error: errorMsg });
      // Continue with other cleanup operations
    }

    // Step 2: Clean up selection tracking (critical)
    try {
      await selectionService.clearUserSelections(userId, whiteboardId, sessionId);
      logger.debug('Selection cleanup completed', { userId, whiteboardId, sessionId });
    } catch (selectionError) {
      const errorMsg = `Selection cleanup failed: ${selectionError instanceof Error ? selectionError.message : String(selectionError)}`;
      cleanupErrors.push(errorMsg);
      logger.error('Selection cleanup error (critical)', { userId, whiteboardId, error: errorMsg });
      // Continue despite error - we need to complete other cleanup
    }

    // Step 3: Clean up presence tracking (critical)
    try {
      await presenceService.leaveWhiteboard(userId, whiteboardId, sessionId, socket.id);
      logger.debug('Presence cleanup completed', { userId, whiteboardId, sessionId });
    } catch (presenceError) {
      const errorMsg = `Presence cleanup failed: ${presenceError instanceof Error ? presenceError.message : String(presenceError)}`;
      cleanupErrors.push(errorMsg);
      logger.error('Presence cleanup error (critical)', { userId, whiteboardId, error: errorMsg });
      // Continue despite error - we need to complete other cleanup
    }

    // Step 4: Leave rooms (critical for preventing memory leaks)
    try {
      socket.leave(`whiteboard:${whiteboardId}`);
      socket.leave(`whiteboard:${whiteboardId}:presence`);
      socket.leave(`whiteboard:${whiteboardId}:comments`);
      logger.debug('Room cleanup completed', { userId, whiteboardId });
    } catch (roomError) {
      const errorMsg = `Room cleanup failed: ${roomError instanceof Error ? roomError.message : String(roomError)}`;
      cleanupErrors.push(errorMsg);
      logger.error('Room cleanup error (critical)', { userId, whiteboardId, error: errorMsg });
    }

    // Step 5: Clean up session data (critical for memory management)
    try {
      socket.whiteboardSession = undefined;
      activeWhiteboardSessions.delete(socket.id);
      await sessionStorage.delete(socket.id);
      logger.debug('Session cleanup completed', { userId, whiteboardId, sessionId });
    } catch (sessionError) {
      const errorMsg = `Session cleanup failed: ${sessionError instanceof Error ? sessionError.message : String(sessionError)}`;
      cleanupErrors.push(errorMsg);
      logger.error('Session cleanup error (critical)', { userId, whiteboardId, error: errorMsg });
    }

    // Step 6: Broadcast notifications (best effort)
    try {
      // Broadcast cursor disconnect
      socket.to(`whiteboard:${whiteboardId}:presence`).emit('whiteboard:cursor_disconnected', {
        userId,
        sessionId,
        timestamp: Date.now(),
        reason: reason === 'inactivity_timeout' ? 'timeout' : 'disconnect',
      });

      // Broadcast user left
      socket.to(`whiteboard:${whiteboardId}`).emit('whiteboard:user_left', {
        user: {
          id: userId,
          name: socket.user!.name,
        },
        reason,
        timestamp: new Date().toISOString(),
      });
      
      logger.debug('Broadcast notifications completed', { userId, whiteboardId });
    } catch (broadcastError) {
      const errorMsg = `Broadcast cleanup failed: ${broadcastError instanceof Error ? broadcastError.message : String(broadcastError)}`;
      cleanupErrors.push(errorMsg);
      logger.warn('Broadcast cleanup error (non-critical)', { userId, whiteboardId, error: errorMsg });
    }

    // Log cleanup completion with any errors
    if (cleanupErrors.length > 0) {
      logger.warn('Atomic cleanup completed with errors', { 
        userId, 
        whiteboardId, 
        reason, 
        errors: cleanupErrors,
        errorCount: cleanupErrors.length
      });
    } else {
      logger.info('Atomic cleanup completed successfully', { 
        userId, 
        whiteboardId, 
        reason 
      });
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

  // Cleanup inactive sessions with enhanced monitoring
  const cleanupInterval = setInterval(enhancedCleanup, 5 * 60 * 1000); // Run every 5 minutes

  // Enhanced cleanup with memory monitoring and atomic operations
  let isGlobalCleanupRunning = false;
  
  const enhancedCleanup = async () => {
    // Prevent concurrent global cleanups
    if (isGlobalCleanupRunning) {
      logger.debug('Global whiteboard cleanup already running, skipping');
      return;
    }
    
    isGlobalCleanupRunning = true;
    
    try {
      const now = new Date();
      const inactiveThreshold = 30 * 60 * 1000; // 30 minutes
      let cleanedSessions = 0;
      const cleanupPromises: Promise<void>[] = [];

      // Clean up inactive sessions from LRU caches with atomic operations
      for (const socketId of activeWhiteboardSessions.keys()) {
        const session = activeWhiteboardSessions.get(socketId);
        if (!session) continue;
        
        const timeSinceActivity = now.getTime() - session.lastActivity.getTime();
        
        if (timeSinceActivity > inactiveThreshold) {
          const cleanupPromise = (async () => {
            const socket = io.sockets.sockets.get(socketId);
            if (socket) {
              try {
                await handleWhiteboardLeave(
                  socket as WhiteboardAuthenticatedSocket, 
                  session.whiteboardId, 
                  'inactivity_timeout'
                );
                cleanedSessions++;
              } catch (error) {
                logger.error('Failed to cleanup inactive session', {
                  error: error instanceof Error ? error.message : String(error),
                  socketId,
                  whiteboardId: session.whiteboardId
                });
              }
            } else {
              // Socket doesn't exist, clean up directly
              try {
                activeWhiteboardSessions.delete(socketId);
                await sessionStorage.delete(socketId);
                cleanedSessions++;
              } catch (error) {
                logger.error('Failed to cleanup orphaned session', {
                  error: error instanceof Error ? error.message : String(error),
                  socketId
                });
              }
            }
          })();
          
          cleanupPromises.push(cleanupPromise);
          
          // Limit concurrent cleanup operations to prevent overwhelming the system
          if (cleanupPromises.length >= 10) {
            await Promise.allSettled(cleanupPromises);
            cleanupPromises.length = 0;
          }
        }
      }
      
      // Wait for remaining cleanup operations
      if (cleanupPromises.length > 0) {
        await Promise.allSettled(cleanupPromises);
      }

      // Run LRU cache cleanup
      const expiredSessions = activeWhiteboardSessions.cleanup();
      const expiredVersions = canvasVersions.cleanup();
      const expiredColors = assignedColors.cleanup();
      
      // Clean up rate limiting warning cache
      const warningCutoff = now.getTime() - (10 * 60 * 1000); // 10 minutes
      for (const [key, timestamp] of lastCursorRateWarning.entries()) {
        if (timestamp < warningCutoff) {
          lastCursorRateWarning.delete(key);
        }
      }

      // Log memory statistics
      const sessionStats = activeWhiteboardSessions.getStats();
      const versionStats = canvasVersions.getStats();
      const colorStats = assignedColors.getStats();

      if (cleanedSessions > 0 || expiredSessions > 0 || expiredVersions > 0 || expiredColors > 0) {
        logger.info('Whiteboard memory cleanup completed', {
          cleanedSessions,
          expiredSessions,
          expiredVersions,
          expiredColors,
          warningCacheSize: lastCursorRateWarning.size,
          activeCleanupOperations: cleanupOperations.size,
          memoryStats: {
            sessions: `${sessionStats.size}/${sessionStats.maxSize}`,
            versions: `${versionStats.size}/${versionStats.maxSize}`,
            colors: `${colorStats.size}/${colorStats.maxSize}`,
          }
        });
      }

    } catch (error) {
      logger.error('Failed to perform enhanced whiteboard cleanup', {
        error: error instanceof Error ? error.message : String(error)
      });
    } finally {
      isGlobalCleanupRunning = false;
    }
  };

  // Graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down whiteboard WebSocket handlers');
    
    if (cleanupInterval) {
      clearInterval(cleanupInterval);
    }
    
    // Destroy LRU caches
    activeWhiteboardSessions.destroy();
    canvasVersions.destroy();
    assignedColors.destroy();
    
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
    getActiveSessionCount: () => activeWhiteboardSessions.size(),
    getCanvasVersion: (whiteboardId: string) => canvasVersions.get(whiteboardId) || 1,
    getMemoryStats: () => ({
      sessions: activeWhiteboardSessions.getStats(),
      versions: canvasVersions.getStats(),
      colors: assignedColors.getStats(),
    }),
    forceCleanup: enhancedCleanup,
    resizeCaches: (maxSessions: number, maxVersions: number, maxColors: number) => {
      activeWhiteboardSessions.resize(maxSessions);
      canvasVersions.resize(maxVersions);
      assignedColors.resize(maxColors);
      logger.info('Whiteboard cache sizes updated', {
        maxSessions,
        maxVersions,
        maxColors
      });
    }
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

// ==================== SELECTION HIGHLIGHTING BROADCAST UTILITIES ====================

/**
 * Broadcast selection update to whiteboard participants
 */
export function broadcastSelectionUpdate(
  io: SocketIOServer,
  whiteboardId: string,
  data: {
    userId: string;
    userName: string;
    userColor: string;
    elementIds: string[];
    bounds?: { x: number; y: number; width: number; height: number };
    isMultiSelect: boolean;
    selectionState?: any;
  }
): void {
  io.to(`whiteboard:${whiteboardId}:presence`).emit('whiteboard:selection_updated', {
    ...data,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Broadcast selection clear to whiteboard participants
 */
export function broadcastSelectionClear(
  io: SocketIOServer,
  whiteboardId: string,
  data: {
    userId: string;
    userName: string;
    clearedCount: number;
  }
): void {
  io.to(`whiteboard:${whiteboardId}:presence`).emit('whiteboard:selection_cleared', {
    ...data,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Broadcast selection conflicts to whiteboard participants
 */
export function broadcastSelectionConflicts(
  io: SocketIOServer,
  whiteboardId: string,
  data: {
    conflicts: any[];
  }
): void {
  io.to(`whiteboard:${whiteboardId}`).emit('whiteboard:selection_conflicts', {
    ...data,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Broadcast selection conflict resolution to whiteboard participants
 */
export function broadcastSelectionConflictResolution(
  io: SocketIOServer,
  whiteboardId: string,
  data: {
    conflictId: string;
    resolution: 'ownership' | 'shared' | 'cancel';
    resolvedBy: { id: string; name: string };
    ownership?: any;
  }
): void {
  io.to(`whiteboard:${whiteboardId}`).emit('whiteboard:selection_conflict_resolved', {
    ...data,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Broadcast element ownership changes to whiteboard participants
 */
export function broadcastElementOwnershipChanged(
  io: SocketIOServer,
  whiteboardId: string,
  data: {
    ownerships: any[];
  }
): void {
  io.to(`whiteboard:${whiteboardId}`).emit('whiteboard:element_ownership_changed', {
    ...data,
    timestamp: new Date().toISOString(),
  });
}