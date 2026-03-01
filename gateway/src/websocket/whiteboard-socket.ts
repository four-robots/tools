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
import { WhiteboardCommentService } from '@mcp-tools/core/services/whiteboard/whiteboard-comment-service';
import { WhiteboardSearchService } from '@mcp-tools/core/services/whiteboard/whiteboard-search-service';
import { 
  WhiteboardPermissionService,
  PermissionCheckRequest,
  PermissionCheckResult 
} from '@mcp-tools/core/services/whiteboard/whiteboard-permission-service';
import { 
  WhiteboardOTEngine, 
  EnhancedWhiteboardOperation, 
  EnhancedTransformContext,
  ConflictInfo,
  PerformanceMetrics 
} from '@mcp-tools/core/services/whiteboard/whiteboard-ot-engine';
import { 
  WhiteboardConflictService,
  ConflictNotification 
} from '@mcp-tools/core/services/whiteboard/whiteboard-conflict-service';
import {
  validateUserInfo,
  validateActivityInfo,
  validateWhiteboardId,
  validateSessionId,
  validatePresenceUpdateRequest,
  validateSelectionData
} from '@mcp-tools/core/utils/input-validation';
import { 
  WhiteboardAnalyticsIntegration,
  withAnalytics,
  createAnalyticsMiddleware,
  AnalyticsBatcher 
} from './whiteboard-analytics-integration.js';
import { WhiteboardVersionService } from '@mcp-tools/core/services/whiteboard/whiteboard-version-service';

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
  db: any, // Database pool dependency
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

  // Initialize comment service for comprehensive threading and @mention support
  const commentService = new WhiteboardCommentService(
    db, // Assuming db is available in context
    {
      maxThreadDepth: 5,
      maxCommentsPerPage: 50,
      enableMentions: true,
      enableRichText: true,
      enableEditHistory: true,
    },
    logger
  );

  // Initialize search service for real-time search index updates
  const searchService = new WhiteboardSearchService(db, logger);

  // Initialize granular permission service for comprehensive RBAC
  const permissionService = new WhiteboardPermissionService(db, logger);

  // Initialize enhanced OT engine for complex conflict resolution
  const otEngine = new WhiteboardOTEngine(logger);

  // Initialize conflict resolution service
  const conflictService = new WhiteboardConflictService(
    db,
    {
      automaticResolutionEnabled: true,
      maxAutomaticResolutionAttempts: 3,
      conflictTimeoutMs: 30000,
      performanceThresholds: {
        maxLatencyMs: 500,
        maxMemoryUsageMB: 1024,
        maxQueueSize: 1000
      }
    },
    logger
  );

  // Initialize version service for version history and rollback
  const versionService = new WhiteboardVersionService(db, logger);

  // Initialize analytics integration for comprehensive tracking
  const analyticsIntegration = new WhiteboardAnalyticsIntegration(db, {
    performanceThresholds: {
      canvas_operation: 100,
      ot_transform: 50,
      comment_create: 200,
      presence_update: 25,
      session_join: 1000,
      session_leave: 500,
    },
    enableDebugLogging: process.env.NODE_ENV === 'development',
  });

  // Initialize analytics batcher for high-frequency events
  const analyticsBatcher = new AnalyticsBatcher(
    analyticsIntegration,
    logger,
    {
      batchTimeout: 2000, // 2 seconds
      maxBatchSize: 25,
    }
  );

  // Track operation queues and context for each whiteboard
  const whiteboardContexts = createLRUCache<string, EnhancedTransformContext>('contexts');
  const operationQueues = createLRUCache<string, EnhancedWhiteboardOperation[]>('operations');
  const pendingConflicts = createLRUCache<string, ConflictInfo[]>('conflicts');
  
  // Permission cache for performance optimization (with TTL for security)
  const permissionCache = createLRUCache<string, PermissionCheckResult>('permissions', { maxSize: 1000 });
  
  /**
   * Invalidate permission cache for a user on a specific whiteboard
   * Called when permissions are modified
   */
  function invalidatePermissionCache(userId: string, whiteboardId: string): void {
    // Remove all cached permissions for this user on this whiteboard
    const keysToDelete = Array.from(permissionCache.keys()).filter(key => 
      key.startsWith(`perm:${userId}:${whiteboardId}:`)
    );
    
    keysToDelete.forEach(key => permissionCache.delete(key));
    
    logger.debug('Permission cache invalidated', {
      userId,
      whiteboardId,
      clearedEntries: keysToDelete.length
    });
  }
  
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

    // Initialize analytics tracking for this socket
    analyticsIntegration.initializeSocketAnalytics(socket);

    // ==================== WHITEBOARD SESSIONS ====================

    // Join whiteboard
    socket.on('whiteboard:join', withAnalytics(analyticsIntegration, 'session_join', async (socket: WhiteboardAuthenticatedSocket, data: { 
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
          sessionToken: `wb_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
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

        // Start session analytics tracking
        await analyticsIntegration.startSessionAnalytics(socket);
        
        // Track user join action
        await analyticsIntegration.trackUserAction(socket, 'join', 'whiteboard', {
          targetId: whiteboardId,
          metadata: {
            workspaceId,
            hasClientInfo: !!clientInfo,
            sessionToken: whiteboardSession.sessionToken,
          },
        });

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

        // Initialize canvas version if not exists
        if (!canvasVersions.has(sanitizedWhiteboardId)) {
          canvasVersions.set(sanitizedWhiteboardId, 1);
        }

        // Join whiteboard rooms
        socket.join(`whiteboard:${sanitizedWhiteboardId}`);
        socket.join(`whiteboard:${sanitizedWhiteboardId}:presence`);
        socket.join(`whiteboard:${sanitizedWhiteboardId}:comments`);
        
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
    }));

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

    // Atomic batch operations for compound changes (move+resize+rotate, etc.)
    socket.on('whiteboard:canvas_batch_change', async (data: {
      operations: WhiteboardCanvasOperation[];
      clientVersion: number;
      transactionId?: string;
      metadata?: {
        clientId?: string;
        sessionId?: string;
        networkLatency?: number;
      };
    }) => {
      const processingStartTime = Date.now();
      
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

        if (!socket.whiteboardSession) {
          socket.emit('error', { code: 'NO_SESSION', message: 'No active whiteboard session' });
          return;
        }

        const { operations, clientVersion, transactionId, metadata } = data;
        const { whiteboardId } = socket.whiteboardSession;

        // Begin atomic transaction
        const txId = transactionId || otEngine.beginTransaction(socket.user.id);
        
        try {
          // Get user permissions for security context
          const userPermissions = await getUserWhiteboardPermissions(socket.user.id, whiteboardId);
          
          // Validate all operations before starting transaction
          for (const operation of operations) {
            // Include position and element context for granular permission checking
            await validateWhiteboardAccess(
              socket.user.id, 
              whiteboardId, 
              operation.type,
              operation.elementId,
              operation.position
            );
            
            if (operation.elementId) {
              await validateElementAccess(socket.user.id, whiteboardId, operation.elementId, operation.type);
            }
          }

          const currentVersion = canvasVersions.get(whiteboardId) || 1;
          const enhancedOperations: EnhancedWhiteboardOperation[] = [];

          // Convert all operations to enhanced format and add to transaction
          for (let i = 0; i < operations.length; i++) {
            const operation = operations[i];
            const enhancedOperation: EnhancedWhiteboardOperation = {
              id: `batch_${operation.type}_${operation.elementId}_${socket.user.id}_${Date.now()}_${i}`,
              type: operation.type as any,
              elementId: operation.elementId,
              elementType: operation.elementType,
              data: operation.data,
              position: operation.position,
              bounds: operation.bounds,
              style: operation.style,
              timestamp: new Date().toISOString(),
              version: currentVersion + i + 1,
              userId: socket.user.id,
              vectorClock: { [socket.user.id]: currentVersion + i + 1 },
              lamportTimestamp: currentVersion + i + 1,
              metadata: {
                clientId: metadata?.clientId || socket.id,
                sessionId: metadata?.sessionId || socket.whiteboardSession.sessionId,
                networkLatency: metadata?.networkLatency,
                processingTime: 0,
                batchIndex: i,
                batchSize: operations.length
              }
            };

            enhancedOperations.push(enhancedOperation);
            
            // Add operation to transaction with rollback data
            const rollbackData = {
              elementId: operation.elementId,
              previousState: null, // Would store actual previous state
              operationIndex: i
            };
            otEngine.addToTransaction(txId, enhancedOperation, rollbackData);
          }

          // Commit the transaction atomically
          const committedOperations = await otEngine.commitTransaction(txId);
          
          // Update canvas version atomically
          canvasVersions.set(whiteboardId, currentVersion + operations.length);

          // Broadcast all operations as a batch
          socket.to(`whiteboard:${whiteboardId}`).emit('whiteboard:canvas_batch_changed', {
            operations: committedOperations,
            user: {
              id: socket.user.id,
              name: socket.user.name,
            },
            batchId: txId,
            timestamp: new Date().toISOString(),
          });

          // Send success acknowledgment
          socket.emit('whiteboard:canvas_batch_ack', {
            batchId: txId,
            operationCount: committedOperations.length,
            success: true,
            newVersion: currentVersion + operations.length,
            processingTimeMs: Date.now() - processingStartTime,
            timestamp: new Date().toISOString()
          });

          logger.info('Atomic batch operation completed successfully', {
            whiteboardId,
            userId: socket.user.id,
            operationCount: operations.length,
            transactionId: txId,
            processingTimeMs: Date.now() - processingStartTime
          });

        } catch (transactionError) {
          // Rollback transaction on any error
          await otEngine.rollbackTransaction(txId);
          
          logger.error('Batch operation failed, transaction rolled back', {
            whiteboardId,
            userId: socket.user.id,
            transactionId: txId,
            error: transactionError.message,
            operationCount: operations.length
          });

          socket.emit('whiteboard:canvas_batch_ack', {
            batchId: txId,
            success: false,
            error: transactionError.message,
            code: 'BATCH_OPERATION_FAILED',
            timestamp: new Date().toISOString()
          });
        }

      } catch (error) {
        logger.error('Failed to process batch canvas change', { 
          error, 
          whiteboardId: socket.whiteboardSession?.whiteboardId,
          userId: socket.user.id 
        });
        
        socket.emit('error', { 
          code: 'BATCH_OPERATION_ERROR', 
          message: 'Failed to process batch operation',
          timestamp: new Date().toISOString()
        });
      }
    });

    // Enhanced canvas change with advanced operational transforms and conflict resolution
    socket.on('whiteboard:canvas_change', async (data: {
      operation: WhiteboardCanvasOperation;
      clientVersion: number;
      metadata?: {
        clientId?: string;
        sessionId?: string;
        networkLatency?: number;
      };
    }) => {
      const processingStartTime = Date.now();
      const trackerId = analyticsIntegration.startPerformanceTracking(socket, 'canvas_operation', {
        operationType: data.operation.type,
        elementType: data.operation.elementType,
        clientVersion: data.clientVersion,
        networkLatency: data.metadata?.networkLatency,
      });
      
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

        // Enhanced rate limiting with adaptive throttling
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

        const { operation, clientVersion, metadata } = data;
        const { whiteboardId, workspaceId } = socket.whiteboardSession;
        const currentVersion = canvasVersions.get(whiteboardId) || 1;

        // CRITICAL SECURITY: Validate user permissions before processing operation
        try {
          // Check if user has permission to modify this whiteboard with granular context
          await validateWhiteboardAccess(
            socket.user.id, 
            whiteboardId, 
            operation.type,
            operation.elementId,
            operation.position
          );
          
          // Validate element ownership and permissions
          if (operation.elementId) {
            await validateElementAccess(socket.user.id, whiteboardId, operation.elementId, operation.type);
          }
        } catch (error) {
          logger.warn('Unauthorized whiteboard operation attempt', {
            userId: socket.user.id,
            whiteboardId,
            operationType: operation.type,
            elementId: operation.elementId,
            error: error instanceof Error ? error.message : String(error)
          });

          socket.emit('whiteboard:operation_rejected', {
            operationId: operation.elementId,
            success: false,
            error: 'Permission denied',
            code: 'UNAUTHORIZED_OPERATION',
            timestamp: new Date().toISOString()
          });
          return;
        }

        // Convert legacy operation to enhanced format with comprehensive validation
        const enhancedOperation: EnhancedWhiteboardOperation = {
          id: `${operation.type}_${operation.elementId}_${socket.user.id}_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
          type: operation.type as any,
          elementId: operation.elementId,
          elementType: operation.elementType,
          data: operation.data,
          position: operation.position,
          bounds: operation.bounds,
          style: operation.style,
          timestamp: new Date().toISOString(),
          version: currentVersion + 1,
          userId: socket.user.id,
          vectorClock: { [socket.user.id]: currentVersion + 1 },
          lamportTimestamp: currentVersion + 1,
          metadata: {
            clientId: metadata?.clientId || socket.id,
            sessionId: metadata?.sessionId || socket.whiteboardSession.sessionId,
            networkLatency: metadata?.networkLatency,
            processingTime: 0 // Will be set later
          }
        };

        // Get user permissions for security context
        const userPermissions = await getUserWhiteboardPermissions(socket.user.id, whiteboardId);
        
        // Get or create enhanced transform context for this whiteboard with security context
        let context = whiteboardContexts.get(whiteboardId);
        if (!context) {
          context = otEngine.createEnhancedContext({
            canvasVersion: currentVersion,
            pendingOperations: [],
            elementStates: new Map(),
            currentVectorClock: { [socket.user.id]: currentVersion },
            lamportClock: currentVersion,
            // Security context
            userId: socket.user.id,
            userRole: socket.user.role || 'editor',
            permissions: userPermissions
          });
          whiteboardContexts.set(whiteboardId, context);
        }

        // Update context with current operation queue and security context
        const operationQueue = operationQueues.get(whiteboardId) || [];
        context.operationQueue = operationQueue;
        context.userId = socket.user.id;
        context.permissions = userPermissions;

        // Apply enhanced operational transforms with conflict detection
        const transformResult = await otEngine.transformOperation(enhancedOperation, context);
        const { transformedOperation, conflicts, performance } = transformResult;

        // Handle detected conflicts
        if (conflicts.length > 0) {
          logger.info('Conflicts detected during operation transformation', {
            whiteboardId,
            operationId: enhancedOperation.id,
            conflictCount: conflicts.length,
            conflictTypes: conflicts.map(c => c.type)
          });

          // Store conflicts for resolution
          const existingConflicts = pendingConflicts.get(whiteboardId) || [];
          pendingConflicts.set(whiteboardId, [...existingConflicts, ...conflicts]);

          // Attempt automatic conflict resolution
          for (const conflict of conflicts) {
            const resolutionResult = await conflictService.resolveConflictAutomatically(conflict, context);
            
            if (resolutionResult.success && resolutionResult.resolution) {
              logger.info('Conflict resolved automatically', {
                conflictId: conflict.id,
                whiteboardId,
                strategy: conflict.resolutionStrategy
              });
              
              // Use resolved operation
              Object.assign(transformedOperation, resolutionResult.resolution);
            } else if (resolutionResult.requiresManualIntervention) {
              // Notify users of manual intervention requirement
              socket.emit('whiteboard:conflict_intervention_required', {
                conflictId: conflict.id,
                type: conflict.type,
                severity: conflict.severity,
                message: 'Manual intervention required for complex conflict',
                affectedElements: conflict.affectedElements,
                timestamp: new Date().toISOString()
              });

              // Notify other participants
              socket.to(`whiteboard:${whiteboardId}`).emit('whiteboard:conflict_detected', {
                conflictId: conflict.id,
                type: conflict.type,
                severity: conflict.severity,
                affectedUsers: [socket.user.id],
                timestamp: new Date().toISOString()
              });
            }
          }
        }

        // Update operation processing time
        transformedOperation.metadata = {
          ...transformedOperation.metadata,
          processingTime: Date.now() - processingStartTime
        };

        // Update canvas version and context
        const newVersion = transformedOperation.version;
        canvasVersions.set(whiteboardId, newVersion);
        
        // Update operation queue (keep last 100 operations for conflict detection)
        operationQueue.push(transformedOperation);
        if (operationQueue.length > 100) {
          operationQueue.shift();
        }
        operationQueues.set(whiteboardId, operationQueue);

        // Update transform context
        context.canvasVersion = newVersion;
        context.currentVectorClock = transformedOperation.vectorClock;
        context.lamportClock = transformedOperation.lamportTimestamp;
        whiteboardContexts.set(whiteboardId, context);

        // Update session activity
        const session = activeWhiteboardSessions.get(socket.id);
        if (session) {
          session.lastActivity = new Date();
          await sessionStorage.set(socket.id, session, sessionTtl);
        }

        // Broadcast enhanced operation to other participants
        socket.to(`whiteboard:${whiteboardId}`).emit('whiteboard:canvas_changed', {
          operation: transformedOperation,
          user: {
            id: socket.user.id,
            name: socket.user.name,
          },
          conflicts: conflicts.map(c => ({
            id: c.id,
            type: c.type,
            severity: c.severity,
            resolved: !!c.resolvedAt
          })),
          performance: {
            processingTimeMs: performance.processingTimeMs,
            queueSize: performance.queueSize
          },
          timestamp: transformedOperation.timestamp,
        });

        // Send comprehensive acknowledgment back to sender
        socket.emit('whiteboard:canvas_ack', {
          operationId: enhancedOperation.id,
          newVersion,
          success: true,
          performance: {
            processingTimeMs: performance.processingTimeMs,
            memoryUsageMB: performance.memoryUsageMB,
            queueSize: performance.queueSize
          },
          conflicts: conflicts.length > 0 ? {
            detected: conflicts.length,
            resolved: conflicts.filter(c => c.resolvedAt).length,
            requiresIntervention: conflicts.filter(c => c.resolutionStrategy === 'manual').length
          } : undefined
        });

        // Handle auto-versioning for significant changes
        await handleAutoVersioning(whiteboardId, socket.user.id, {
          operation: data.operation,
          elementCount: newVersion,
          conflicts: conflicts.length,
          processingTime: performance.processingTimeMs,
        });

        // Performance monitoring and alerts
        if (performance.processingTimeMs > 500) {
          logger.warn('High operation processing latency detected', {
            whiteboardId,
            operationId: enhancedOperation.id,
            processingTimeMs: performance.processingTimeMs,
            queueSize: performance.queueSize,
            conflictCount: conflicts.length
          });

          // Notify client of performance issues
          socket.emit('whiteboard:performance_warning', {
            type: 'high_latency',
            processingTimeMs: performance.processingTimeMs,
            recommendation: 'Consider reducing operation frequency',
            timestamp: new Date().toISOString()
          });
        }

        logger.debug('Enhanced canvas change processed', {
          whiteboardId,
          userId: socket.user.id,
          operationType: transformedOperation.type,
          elementId: transformedOperation.elementId,
          version: newVersion,
          processingTimeMs: performance.processingTimeMs,
          conflictsDetected: conflicts.length,
          conflictsResolved: conflicts.filter(c => c.resolvedAt).length
        });

      } catch (error) {
        const processingTime = Date.now() - processingStartTime;
        
        logger.error('Failed to process enhanced canvas change', { 
          error, 
          data,
          processingTimeMs: processingTime
        });
        
        socket.emit('whiteboard:canvas_ack', {
          operationId: data.operation.elementId,
          success: false,
          error: 'Failed to process canvas change',
          performance: {
            processingTimeMs: processingTime,
            memoryUsageMB: 0,
            queueSize: 0
          }
        });

        // Send error notification to other participants
        if (socket.whiteboardSession) {
          socket.to(`whiteboard:${socket.whiteboardSession.whiteboardId}`).emit('whiteboard:operation_error', {
            userId: socket.user.id,
            operationId: data.operation.elementId,
            error: 'Operation processing failed',
            timestamp: new Date().toISOString()
          });
        }
      }
    });

    // ==================== ENHANCED CONFLICT MANAGEMENT ====================

    // Manual conflict resolution
    socket.on('whiteboard:resolve_conflict', async (data: {
      conflictId: string;
      resolution: 'accept' | 'reject' | 'merge';
      selectedOperation?: EnhancedWhiteboardOperation;
      mergeData?: any;
    }) => {
      try {
        if (!socket.whiteboardSession) {
          socket.emit('error', { code: 'NO_SESSION', message: 'No active whiteboard session' });
          return;
        }

        const { whiteboardId } = socket.whiteboardSession;
        const { conflictId, resolution, selectedOperation, mergeData } = data;

        // Find the conflict in pending conflicts
        const conflicts = pendingConflicts.get(whiteboardId) || [];
        const conflictIndex = conflicts.findIndex(c => c.id === conflictId);
        
        if (conflictIndex === -1) {
          socket.emit('error', { 
            code: 'CONFLICT_NOT_FOUND', 
            message: 'Conflict not found or already resolved' 
          });
          return;
        }

        const conflict = conflicts[conflictIndex];
        
        // Apply manual resolution
        let resolvedOperation: EnhancedWhiteboardOperation | null = null;

        switch (resolution) {
          case 'accept':
            resolvedOperation = selectedOperation || conflict.operations[0];
            break;
          case 'reject':
            // Mark conflict as resolved without applying changes
            conflict.resolvedAt = new Date().toISOString();
            conflict.resolution = {
              strategy: 'manual',
              resultOperation: null,
              manualInterventionRequired: false,
              confidence: 1.0
            };
            break;
          case 'merge':
            // Create merged operation from merge data
            resolvedOperation = {
              ...conflict.operations[0],
              data: mergeData,
              timestamp: new Date().toISOString()
            };
            break;
        }

        if (resolvedOperation) {
          // Apply the resolved operation
          const context = whiteboardContexts.get(whiteboardId);
          if (context) {
            const currentVersion = canvasVersions.get(whiteboardId) || 1;
            resolvedOperation.version = currentVersion + 1;
            canvasVersions.set(whiteboardId, currentVersion + 1);

            // Broadcast resolved operation
            socket.to(`whiteboard:${whiteboardId}`).emit('whiteboard:canvas_changed', {
              operation: resolvedOperation,
              user: {
                id: socket.user.id,
                name: socket.user.name,
              },
              conflictResolution: {
                conflictId,
                strategy: 'manual',
                resolvedBy: socket.user.id
              },
              timestamp: resolvedOperation.timestamp,
            });

            // Mark conflict as resolved
            conflict.resolvedAt = new Date().toISOString();
            conflict.resolution = {
              strategy: 'manual',
              resultOperation: resolvedOperation,
              manualInterventionRequired: false,
              confidence: 1.0
            };
          }
        }

        // Remove resolved conflict from pending list
        conflicts.splice(conflictIndex, 1);
        pendingConflicts.set(whiteboardId, conflicts);

        // Send confirmation
        socket.emit('whiteboard:conflict_resolved', {
          conflictId,
          resolution,
          success: true,
          timestamp: new Date().toISOString()
        });

        // Notify other participants
        socket.to(`whiteboard:${whiteboardId}`).emit('whiteboard:conflict_resolved_broadcast', {
          conflictId,
          resolvedBy: socket.user.id,
          resolution,
          timestamp: new Date().toISOString()
        });

        logger.info('Conflict resolved manually', {
          conflictId,
          whiteboardId,
          resolution,
          resolvedBy: socket.user.id
        });

      } catch (error) {
        logger.error('Failed to resolve conflict manually', { error, data });
        socket.emit('error', { 
          code: 'CONFLICT_RESOLUTION_FAILED', 
          message: 'Failed to resolve conflict' 
        });
      }
    });

    // Get active conflicts for current whiteboard
    socket.on('whiteboard:get_conflicts', (data: { whiteboardId: string }) => {
      try {
        if (!socket.whiteboardSession) {
          socket.emit('error', { code: 'NO_SESSION', message: 'No active whiteboard session' });
          return;
        }

        const conflicts = conflictService.getActiveConflicts();
        const whiteboardConflicts = conflicts.filter(c => 
          c.operations.some(op => op.metadata?.sessionId === socket.whiteboardSession?.sessionId)
        );

        socket.emit('whiteboard:conflicts_list', {
          conflicts: whiteboardConflicts.map(c => ({
            id: c.id,
            type: c.type,
            severity: c.severity,
            affectedElements: c.affectedElements,
            detectedAt: c.detectedAt,
            operations: c.operations.map(op => ({
              id: op.id,
              type: op.type,
              elementId: op.elementId,
              userId: op.userId,
              timestamp: op.timestamp
            }))
          })),
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        logger.error('Failed to get conflicts', { error, data });
        socket.emit('error', { 
          code: 'GET_CONFLICTS_FAILED', 
          message: 'Failed to retrieve conflicts' 
        });
      }
    });

    // ==================== PERFORMANCE MONITORING ====================

    // Get performance metrics
    socket.on('whiteboard:get_performance_metrics', () => {
      try {
        if (!socket.whiteboardSession) {
          socket.emit('error', { code: 'NO_SESSION', message: 'No active whiteboard session' });
          return;
        }

        const { whiteboardId } = socket.whiteboardSession;
        const context = whiteboardContexts.get(whiteboardId);
        const operationQueue = operationQueues.get(whiteboardId) || [];
        const conflicts = pendingConflicts.get(whiteboardId) || [];

        const metrics = {
          ...otEngine.getPerformanceMetrics(),
          queueSize: operationQueue.length,
          activeConflicts: conflicts.length,
          whiteboardVersion: canvasVersions.get(whiteboardId) || 1,
          context: context ? {
            operationCount: context.operationQueue.length,
            conflictHistory: context.conflictHistory.length,
            adaptiveThrottling: context.adaptiveThrottling
          } : null
        };

        socket.emit('whiteboard:performance_metrics', {
          metrics,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        logger.error('Failed to get performance metrics', { error });
        socket.emit('error', { 
          code: 'METRICS_FAILED', 
          message: 'Failed to retrieve performance metrics' 
        });
      }
    });

    // Batch operations for performance optimization
    socket.on('whiteboard:batch_operations', async (data: {
      operations: WhiteboardCanvasOperation[];
      clientVersion: number;
      batchId: string;
    }) => {
      const processingStartTime = Date.now();
      
      try {
        if (!socket.whiteboardSession) {
          socket.emit('error', { code: 'NO_SESSION', message: 'No active whiteboard session' });
          return;
        }

        const { operations, clientVersion, batchId } = data;
        const { whiteboardId } = socket.whiteboardSession;

        if (operations.length > 50) {
          socket.emit('error', { 
            code: 'BATCH_TOO_LARGE', 
            message: 'Batch size exceeds maximum of 50 operations' 
          });
          return;
        }

        // Convert to enhanced batch operation
        const batchOperation: EnhancedWhiteboardOperation = {
          id: `batch_${batchId}_${socket.user.id}_${Date.now()}`,
          type: 'batch',
          elementId: `batch_${batchId}`,
          data: { operations },
          timestamp: new Date().toISOString(),
          version: (canvasVersions.get(whiteboardId) || 1) + 1,
          userId: socket.user.id,
          vectorClock: { [socket.user.id]: (canvasVersions.get(whiteboardId) || 1) + 1 },
          lamportTimestamp: (canvasVersions.get(whiteboardId) || 1) + 1,
          metadata: {
            clientId: socket.id,
            sessionId: socket.whiteboardSession.sessionId,
            processingTime: 0
          }
        };

        // Process batch through OT engine
        const context = whiteboardContexts.get(whiteboardId);
        if (context) {
          const transformResult = await otEngine.transformOperation(batchOperation, context);
          const { transformedOperation, conflicts, performance } = transformResult;

          // Update version and broadcast
          const newVersion = transformedOperation.version;
          canvasVersions.set(whiteboardId, newVersion);

          socket.to(`whiteboard:${whiteboardId}`).emit('whiteboard:batch_processed', {
            batchId,
            operation: transformedOperation,
            user: {
              id: socket.user.id,
              name: socket.user.name,
            },
            performance,
            timestamp: transformedOperation.timestamp,
          });

          socket.emit('whiteboard:batch_ack', {
            batchId,
            newVersion,
            success: true,
            performance,
            operationsProcessed: operations.length
          });

          logger.info('Batch operations processed', {
            whiteboardId,
            batchId,
            operationCount: operations.length,
            processingTimeMs: performance.processingTimeMs
          });
        }

      } catch (error) {
        const processingTime = Date.now() - processingStartTime;
        
        logger.error('Failed to process batch operations', { error, data });
        socket.emit('whiteboard:batch_ack', {
          batchId: data.batchId,
          success: false,
          error: 'Failed to process batch operations',
          performance: {
            processingTimeMs: processingTime,
            memoryUsageMB: 0,
            queueSize: 0
          }
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
    socket.on('whiteboard:sync_response', async (data: {
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
        
        // End performance tracking with error
        await analyticsIntegration.endPerformanceTracking(trackerId, false, {
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        // Track error
        await analyticsIntegration.trackError(socket, error, {
          operation: 'canvas_change',
          targetType: data.operation?.type || 'unknown',
          targetId: data.operation?.elementId,
        });
      } finally {
        // Track user action
        if (socket.whiteboardSession && data.operation) {
          await analyticsIntegration.trackUserAction(socket, data.operation.type, 'element', {
            targetId: data.operation.elementId,
            elementType: data.operation.elementType,
            coordinates: data.operation.position,
            metadata: {
              clientVersion: data.clientVersion,
              networkLatency: data.metadata?.networkLatency,
            },
          });

          // End performance tracking with success
          await analyticsIntegration.endPerformanceTracking(trackerId, true);
        }
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

        // Use analytics batcher for high-frequency presence events
        analyticsBatcher.addToBatch(socket, 'presence_update', 'cursor', {
          coordinates: data.cursor,
          viewport: data.viewport,
          selectionCount: data.selection?.length || 0,
        });

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
        logger.debug('Failed to handle cursor move', { error: error instanceof Error ? error.message : String(error) });
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

    // ==================== ENHANCED COLLABORATIVE COMMENTS WITH THREADING & @MENTIONS ====================

    // Create comment (supports threading and @mentions)
    socket.on('whiteboard:create_comment', withAnalytics(analyticsIntegration, 'comment_create', async (socket: WhiteboardAuthenticatedSocket, data: any) => {
      try {
        if (!socket.whiteboardSession || !socket.user) {
          socket.emit('error', { code: 'NO_SESSION', message: 'No active whiteboard session' });
          return;
        }

        // Check rate limiting for comment creation
        const rateLimitCheck = checkRateLimit(socket, 'whiteboard:create_comment');
        if (!rateLimitCheck.allowed) {
          socket.emit('whiteboard:comment_ack', {
            success: false,
            error: rateLimitCheck.error.message,
            rateLimited: true,
            retryAfterMs: rateLimitCheck.error.retryAfterMs,
          });
          return;
        }

        const result = await commentService.createComment(
          socket.whiteboardSession.whiteboardId,
          socket.user.id,
          data
        );

        if (result.errors.length > 0) {
          socket.emit('whiteboard:comment_ack', {
            success: false,
            error: result.errors.join(', '),
            warnings: result.warnings,
          });
          return;
        }

        // Track comment creation for analytics
        await analyticsIntegration.trackUserAction(socket, 'create', 'comment', {
          targetId: result.comment?.id,
          coordinates: data.position,
          metadata: {
            elementId: data.elementId,
            parentId: data.parentId,
            mentionCount: result.mentions?.length || 0,
            contentLength: data.content?.length || 0,
            hasAttachments: data.attachments && Object.keys(data.attachments).length > 0,
          },
        });

        // Track collaboration event if this is a threaded comment
        if (data.parentId) {
          await analyticsIntegration.trackCollaborationEvent(socket, 'reply', 'comment', {
            targetId: data.parentId,
            metadata: { replyId: result.comment?.id },
          });
        }

        // Broadcast comment creation to all participants
        io.to(`whiteboard:${socket.whiteboardSession.whiteboardId}:comments`).emit('whiteboard:comment_created', {
          comment: result.comment,
          mentions: result.mentions,
          timestamp: new Date().toISOString(),
        });

        // Send @mention notifications
        if (result.notifications.length > 0) {
          for (const notification of result.notifications) {
            // Send notification to mentioned user if they're online
            const mentionedUserSockets = io.sockets.sockets;
            for (const [socketId, userSocket] of mentionedUserSockets) {
              const authenticatedSocket = userSocket as any;
              if (authenticatedSocket.user?.id === notification.userId) {
                userSocket.emit('whiteboard:mention_notification', notification);
              }
            }
          }
        }

        // Send acknowledgment with full result
        socket.emit('whiteboard:comment_ack', {
          success: true,
          comment: result.comment,
          mentions: result.mentions,
          notifications: result.notifications,
          warnings: result.warnings,
        });

        logger.info('Comment created successfully', {
          whiteboardId: socket.whiteboardSession.whiteboardId,
          commentId: result.comment.id,
          userId: socket.user.id,
          hasParent: !!data.parentId,
          mentionCount: result.mentions.length,
        });

      } catch (error) {
        logger.error('Failed to create comment', { error, data });
        socket.emit('whiteboard:comment_ack', {
          success: false,
          error: 'Failed to create comment',
        });
      }
    }));

    // Update comment (with revision tracking)
    socket.on('whiteboard:update_comment', async (data: {
      commentId: string;
      updates: any;
    }) => {
      try {
        if (!socket.whiteboardSession || !socket.user) {
          socket.emit('error', { code: 'NO_SESSION', message: 'No active whiteboard session' });
          return;
        }

        // Check rate limiting for comment updates
        const rateLimitCheck = checkRateLimit(socket, 'whiteboard:update_comment');
        if (!rateLimitCheck.allowed) {
          socket.emit('whiteboard:comment_update_ack', {
            success: false,
            error: rateLimitCheck.error.message,
            rateLimited: true,
            retryAfterMs: rateLimitCheck.error.retryAfterMs,
          });
          return;
        }

        const result = await commentService.updateComment(
          data.commentId,
          socket.user.id,
          data.updates
        );

        if (result.errors.length > 0) {
          socket.emit('whiteboard:comment_update_ack', {
            success: false,
            error: result.errors.join(', '),
            warnings: result.warnings,
          });
          return;
        }

        // Broadcast comment update to all participants
        io.to(`whiteboard:${socket.whiteboardSession.whiteboardId}:comments`).emit('whiteboard:comment_updated', {
          comment: result.comment,
          revision: result.revision,
          mentions: result.mentions,
          timestamp: new Date().toISOString(),
        });

        // Send new @mention notifications
        if (result.notifications.length > 0) {
          for (const notification of result.notifications) {
            const mentionedUserSockets = io.sockets.sockets;
            for (const [socketId, userSocket] of mentionedUserSockets) {
              const authenticatedSocket = userSocket as any;
              if (authenticatedSocket.user?.id === notification.userId) {
                userSocket.emit('whiteboard:mention_notification', notification);
              }
            }
          }
        }

        socket.emit('whiteboard:comment_update_ack', {
          success: true,
          comment: result.comment,
          revision: result.revision,
          mentions: result.mentions,
          notifications: result.notifications,
          warnings: result.warnings,
        });

        logger.info('Comment updated successfully', {
          commentId: data.commentId,
          userId: socket.user.id,
          hasNewMentions: result.notifications.length > 0,
        });

      } catch (error) {
        logger.error('Failed to update comment', { error, data });
        socket.emit('whiteboard:comment_update_ack', {
          success: false,
          error: 'Failed to update comment',
        });
      }
    });

    // Resolve/unresolve comment
    socket.on('whiteboard:resolve_comment', async (data: {
      commentId: string;
      resolved: boolean;
      reason?: string;
      status?: string;
    }) => {
      try {
        if (!socket.whiteboardSession || !socket.user) {
          socket.emit('error', { code: 'NO_SESSION', message: 'No active whiteboard session' });
          return;
        }

        const result = await commentService.resolveComment(
          data.commentId,
          socket.user.id,
          {
            resolved: data.resolved,
            reason: data.reason,
            status: data.status as any,
          }
        );

        if (!result.success) {
          socket.emit('whiteboard:comment_resolve_ack', {
            success: false,
            error: result.error,
          });
          return;
        }

        // Broadcast resolution status change
        io.to(`whiteboard:${socket.whiteboardSession.whiteboardId}:comments`).emit('whiteboard:comment_resolved', {
          comment: result.comment,
          resolved: data.resolved,
          resolvedBy: {
            id: socket.user.id,
            name: socket.user.name,
          },
          reason: data.reason,
          timestamp: new Date().toISOString(),
        });

        socket.emit('whiteboard:comment_resolve_ack', {
          success: true,
          comment: result.comment,
        });

        logger.info('Comment resolution updated', {
          commentId: data.commentId,
          userId: socket.user.id,
          resolved: data.resolved,
        });

      } catch (error) {
        logger.error('Failed to resolve comment', { error, data });
        socket.emit('whiteboard:comment_resolve_ack', {
          success: false,
          error: 'Failed to resolve comment',
        });
      }
    });

    // Delete comment
    socket.on('whiteboard:delete_comment', async (data: {
      commentId: string;
    }) => {
      try {
        if (!socket.whiteboardSession || !socket.user) {
          socket.emit('error', { code: 'NO_SESSION', message: 'No active whiteboard session' });
          return;
        }

        const result = await commentService.deleteComment(
          data.commentId,
          socket.user.id
        );

        if (!result.success) {
          socket.emit('whiteboard:comment_delete_ack', {
            success: false,
            error: result.error,
          });
          return;
        }

        // Broadcast comment deletion
        io.to(`whiteboard:${socket.whiteboardSession.whiteboardId}:comments`).emit('whiteboard:comment_deleted', {
          commentId: data.commentId,
          deletedBy: {
            id: socket.user.id,
            name: socket.user.name,
          },
          timestamp: new Date().toISOString(),
        });

        socket.emit('whiteboard:comment_delete_ack', {
          success: true,
        });

        logger.info('Comment deleted successfully', {
          commentId: data.commentId,
          userId: socket.user.id,
        });

      } catch (error) {
        logger.error('Failed to delete comment', { error, data });
        socket.emit('whiteboard:comment_delete_ack', {
          success: false,
          error: 'Failed to delete comment',
        });
      }
    });

    // Get comment thread (with nested replies)
    socket.on('whiteboard:get_comment_thread', async (data: {
      commentId: string;
      maxDepth?: number;
      limit?: number;
      offset?: number;
    }) => {
      try {
        if (!socket.whiteboardSession || !socket.user) {
          socket.emit('error', { code: 'NO_SESSION', message: 'No active whiteboard session' });
          return;
        }

        // Check rate limiting for thread requests
        const rateLimitCheck = checkRateLimit(socket, 'whiteboard:get_comment_thread');
        if (!rateLimitCheck.allowed) {
          socket.emit('whiteboard:comment_thread_ack', {
            success: false,
            error: rateLimitCheck.error.message,
            rateLimited: true,
            retryAfterMs: rateLimitCheck.error.retryAfterMs,
          });
          return;
        }

        const thread = await commentService.getCommentThread(
          data.commentId,
          socket.user.id,
          {
            maxDepth: data.maxDepth,
            limit: data.limit,
            offset: data.offset,
          }
        );

        socket.emit('whiteboard:comment_thread_ack', {
          success: true,
          thread,
        });

      } catch (error) {
        logger.error('Failed to get comment thread', { error, data });
        socket.emit('whiteboard:comment_thread_ack', {
          success: false,
          error: 'Failed to get comment thread',
        });
      }
    });

    // Get whiteboard comments (with filtering)
    socket.on('whiteboard:get_comments', async (data: {
      whiteboardId?: string;
      filters?: any;
      limit?: number;
      offset?: number;
    }) => {
      try {
        if (!socket.whiteboardSession || !socket.user) {
          socket.emit('error', { code: 'NO_SESSION', message: 'No active whiteboard session' });
          return;
        }

        // Check rate limiting for comment queries
        const rateLimitCheck = checkRateLimit(socket, 'whiteboard:get_comments');
        if (!rateLimitCheck.allowed) {
          socket.emit('whiteboard:comments_ack', {
            success: false,
            error: rateLimitCheck.error.message,
            rateLimited: true,
            retryAfterMs: rateLimitCheck.error.retryAfterMs,
          });
          return;
        }

        const whiteboardId = data.whiteboardId || socket.whiteboardSession.whiteboardId;
        const comments = await commentService.getWhiteboardComments(
          whiteboardId,
          socket.user.id,
          data.filters || {},
          data.limit || 20,
          data.offset || 0
        );

        socket.emit('whiteboard:comments_ack', {
          success: true,
          comments,
        });

      } catch (error) {
        logger.error('Failed to get comments', { error, data });
        socket.emit('whiteboard:comments_ack', {
          success: false,
          error: 'Failed to get comments',
        });
      }
    });

    // Comment typing indicator
    socket.on('whiteboard:comment_typing', async (data: {
      whiteboardId: string;
      commentId?: string; // For replies
      isTyping: boolean;
    }) => {
      try {
        if (!socket.whiteboardSession || !socket.user) {
          return;
        }

        // Check rate limiting for typing indicators
        const rateLimitCheck = checkRateLimit(socket, 'whiteboard:comment_typing');
        if (!rateLimitCheck.allowed) {
          return; // Silently drop typing indicators when rate limited
        }

        const { whiteboardId, commentId, isTyping } = data;

        // Broadcast typing indicator to other participants
        socket.to(`whiteboard:${whiteboardId}:comments`).emit('whiteboard:comment_typing_indicator', {
          userId: socket.user.id,
          userName: socket.user.name,
          commentId,
          isTyping,
          timestamp: new Date().toISOString(),
        });

        logger.debug('Comment typing indicator broadcasted', {
          whiteboardId,
          userId: socket.user.id,
          commentId,
          isTyping,
        });

      } catch (error) {
        logger.debug('Failed to handle comment typing indicator', { error, data });
      }
    });

    // Comment activity tracking
    socket.on('whiteboard:comment_activity', async (data: {
      whiteboardId: string;
      commentId?: string;
      activity: 'viewing' | 'composing_reply' | 'editing';
    }) => {
      try {
        if (!socket.whiteboardSession || !socket.user) {
          return;
        }

        // Check rate limiting for activity updates
        const rateLimitCheck = checkRateLimit(socket, 'whiteboard:comment_activity');
        if (!rateLimitCheck.allowed) {
          return; // Silently drop activity updates when rate limited
        }

        const { whiteboardId, commentId, activity } = data;

        // Broadcast activity to other participants
        socket.to(`whiteboard:${whiteboardId}:comments`).emit('whiteboard:comment_activity_updated', {
          userId: socket.user.id,
          userName: socket.user.name,
          commentId,
          activity,
          timestamp: new Date().toISOString(),
        });

        logger.debug('Comment activity updated', {
          whiteboardId,
          userId: socket.user.id,
          commentId,
          activity,
        });

      } catch (error) {
        logger.debug('Failed to handle comment activity', { error, data });
      }
    });

    // @mention autocomplete request
    socket.on('whiteboard:mention_search', async (data: {
      whiteboardId: string;
      query: string;
      limit?: number;
    }) => {
      try {
        if (!socket.whiteboardSession || !socket.user) {
          socket.emit('error', { code: 'NO_SESSION', message: 'No active whiteboard session' });
          return;
        }

        // Check rate limiting for mention searches
        const rateLimitCheck = checkRateLimit(socket, 'whiteboard:mention_search');
        if (!rateLimitCheck.allowed) {
          socket.emit('whiteboard:mention_search_ack', {
            success: false,
            error: rateLimitCheck.error.message,
            rateLimited: true,
            retryAfterMs: rateLimitCheck.error.retryAfterMs,
          });
          return;
        }

        // TODO: Implement mention search functionality
        // This would search workspace users for @mention autocomplete
        const users = []; // Placeholder for user search results

        socket.emit('whiteboard:mention_search_ack', {
          success: true,
          users,
          query: data.query,
        });

      } catch (error) {
        logger.error('Failed to search mentions', { error, data });
        socket.emit('whiteboard:mention_search_ack', {
          success: false,
          error: 'Failed to search mentions',
        });
      }
    });

    // ==================== GRANULAR PERMISSION MANAGEMENT ====================

    // Grant permission to a user
    socket.on('whiteboard:grant_permission', async (data: {
      whiteboardId: string;
      userEmail: string;
      role: 'editor' | 'commenter' | 'viewer';
      customPermissions?: Record<string, boolean>;
      expiresAt?: string;
    }) => {
      try {
        if (!socket.whiteboardSession || !socket.user) {
          socket.emit('error', { code: 'NOT_AUTHENTICATED', message: 'User not authenticated' });
          return;
        }

        const { whiteboardId, userEmail, role, customPermissions, expiresAt } = data;

        // Validate that current user can manage permissions
        const hasPermission = await permissionService.checkPermission({
          whiteboardId,
          userId: socket.user.id,
          action: 'canManagePermissions'
        });

        if (!hasPermission.allowed) {
          socket.emit('whiteboard:permission_error', {
            code: 'PERMISSION_DENIED',
            message: 'You do not have permission to manage whiteboard permissions',
            timestamp: new Date().toISOString()
          });
          return;
        }

        // Grant the permission
        const result = await permissionService.grantPermission(
          whiteboardId,
          userEmail,
          socket.user.id,
          role,
          customPermissions,
          expiresAt
        );

        // Invalidate permission cache for the user
        invalidatePermissionCache(result.userId, whiteboardId);

        // Notify the whiteboard room
        socket.to(`whiteboard:${whiteboardId}`).emit('whiteboard:permission_granted', {
          permission: result,
          grantedBy: {
            id: socket.user.id,
            name: socket.user.name
          },
          timestamp: new Date().toISOString()
        });

        socket.emit('whiteboard:permission_granted', {
          success: true,
          permission: result,
          timestamp: new Date().toISOString()
        });

        logger.info('Permission granted successfully', {
          whiteboardId,
          grantedTo: userEmail,
          role,
          grantedBy: socket.user.id
        });

      } catch (error) {
        logger.error('Failed to grant permission', { error, data });
        socket.emit('whiteboard:permission_error', {
          code: 'GRANT_PERMISSION_FAILED',
          message: error instanceof Error ? error.message : 'Failed to grant permission',
          timestamp: new Date().toISOString()
        });
      }
    });

    // Revoke permission from a user
    socket.on('whiteboard:revoke_permission', async (data: {
      whiteboardId: string;
      userId: string;
    }) => {
      try {
        if (!socket.whiteboardSession || !socket.user) {
          socket.emit('error', { code: 'NOT_AUTHENTICATED', message: 'User not authenticated' });
          return;
        }

        const { whiteboardId, userId } = data;

        // Validate that current user can manage permissions
        const hasPermission = await permissionService.checkPermission({
          whiteboardId,
          userId: socket.user.id,
          action: 'canManagePermissions'
        });

        if (!hasPermission.allowed) {
          socket.emit('whiteboard:permission_error', {
            code: 'PERMISSION_DENIED',
            message: 'You do not have permission to manage whiteboard permissions',
            timestamp: new Date().toISOString()
          });
          return;
        }

        // Revoke the permission
        await permissionService.revokePermission(whiteboardId, userId, socket.user.id);

        // Invalidate permission cache for the user
        invalidatePermissionCache(userId, whiteboardId);

        // Notify the whiteboard room
        socket.to(`whiteboard:${whiteboardId}`).emit('whiteboard:permission_revoked', {
          userId,
          revokedBy: {
            id: socket.user.id,
            name: socket.user.name
          },
          timestamp: new Date().toISOString()
        });

        socket.emit('whiteboard:permission_revoked', {
          success: true,
          userId,
          timestamp: new Date().toISOString()
        });

        logger.info('Permission revoked successfully', {
          whiteboardId,
          revokedFrom: userId,
          revokedBy: socket.user.id
        });

      } catch (error) {
        logger.error('Failed to revoke permission', { error, data });
        socket.emit('whiteboard:permission_error', {
          code: 'REVOKE_PERMISSION_FAILED',
          message: error instanceof Error ? error.message : 'Failed to revoke permission',
          timestamp: new Date().toISOString()
        });
      }
    });

    // Update user permission
    socket.on('whiteboard:update_permission', async (data: {
      whiteboardId: string;
      userId: string;
      updates: {
        role?: 'owner' | 'editor' | 'commenter' | 'viewer' | 'custom';
        permissions?: Record<string, boolean>;
        expiresAt?: string;
      };
    }) => {
      try {
        if (!socket.whiteboardSession || !socket.user) {
          socket.emit('error', { code: 'NOT_AUTHENTICATED', message: 'User not authenticated' });
          return;
        }

        const { whiteboardId, userId, updates } = data;

        // Validate that current user can manage permissions
        const hasPermission = await permissionService.checkPermission({
          whiteboardId,
          userId: socket.user.id,
          action: 'canManagePermissions'
        });

        if (!hasPermission.allowed) {
          socket.emit('whiteboard:permission_error', {
            code: 'PERMISSION_DENIED',
            message: 'You do not have permission to manage whiteboard permissions',
            timestamp: new Date().toISOString()
          });
          return;
        }

        // Update the permission
        const result = await permissionService.updatePermission(
          whiteboardId,
          userId,
          socket.user.id,
          updates
        );

        // Invalidate permission cache for the user
        invalidatePermissionCache(userId, whiteboardId);

        // Notify the whiteboard room
        socket.to(`whiteboard:${whiteboardId}`).emit('whiteboard:permission_updated', {
          permission: result,
          updatedBy: {
            id: socket.user.id,
            name: socket.user.name
          },
          timestamp: new Date().toISOString()
        });

        socket.emit('whiteboard:permission_updated', {
          success: true,
          permission: result,
          timestamp: new Date().toISOString()
        });

        logger.info('Permission updated successfully', {
          whiteboardId,
          updatedFor: userId,
          updates,
          updatedBy: socket.user.id
        });

      } catch (error) {
        logger.error('Failed to update permission', { error, data });
        socket.emit('whiteboard:permission_error', {
          code: 'UPDATE_PERMISSION_FAILED',
          message: error instanceof Error ? error.message : 'Failed to update permission',
          timestamp: new Date().toISOString()
        });
      }
    });

    // Get whiteboard permissions
    socket.on('whiteboard:get_permissions', async (data: {
      whiteboardId?: string;
    }) => {
      try {
        if (!socket.whiteboardSession || !socket.user) {
          socket.emit('error', { code: 'NOT_AUTHENTICATED', message: 'User not authenticated' });
          return;
        }

        const whiteboardId = data.whiteboardId || socket.whiteboardSession.whiteboardId;

        // Validate that current user can view permissions
        const hasPermission = await permissionService.checkPermission({
          whiteboardId,
          userId: socket.user.id,
          action: 'canView'
        });

        if (!hasPermission.allowed) {
          socket.emit('whiteboard:permission_error', {
            code: 'PERMISSION_DENIED',
            message: 'You do not have permission to view whiteboard permissions',
            timestamp: new Date().toISOString()
          });
          return;
        }

        // Get all permissions for this whiteboard
        const permissions = await permissionService.getWhiteboardPermissions(whiteboardId);

        socket.emit('whiteboard:permissions_list', {
          permissions,
          timestamp: new Date().toISOString()
        });

        logger.debug('Permissions retrieved successfully', {
          whiteboardId,
          requestedBy: socket.user.id,
          permissionCount: permissions.length
        });

      } catch (error) {
        logger.error('Failed to get permissions', { error, data });
        socket.emit('whiteboard:permission_error', {
          code: 'GET_PERMISSIONS_FAILED',
          message: error instanceof Error ? error.message : 'Failed to get permissions',
          timestamp: new Date().toISOString()
        });
      }
    });

    // Check specific permission
    socket.on('whiteboard:check_permission', async (data: {
      whiteboardId: string;
      action: string;
      elementId?: string;
      position?: { x: number; y: number };
      layerIndex?: number;
    }) => {
      try {
        if (!socket.whiteboardSession || !socket.user) {
          socket.emit('error', { code: 'NOT_AUTHENTICATED', message: 'User not authenticated' });
          return;
        }

        const { whiteboardId, action, elementId, position, layerIndex } = data;

        // Check the specific permission
        const result = await permissionService.checkPermission({
          whiteboardId,
          userId: socket.user.id,
          action,
          elementId,
          areaCoordinates: position,
          layerIndex
        });

        socket.emit('whiteboard:permission_check_result', {
          allowed: result.allowed,
          reason: result.reason,
          appliedRule: result.appliedRule,
          context: {
            action,
            elementId,
            position,
            layerIndex
          },
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        logger.error('Failed to check permission', { error, data });
        socket.emit('whiteboard:permission_error', {
          code: 'CHECK_PERMISSION_FAILED',
          message: error instanceof Error ? error.message : 'Failed to check permission',
          timestamp: new Date().toISOString()
        });
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

    // ==================== VERSION HISTORY AND ROLLBACK SYSTEM ====================
    
    // Create version checkpoint
    socket.on('whiteboard:create_version', async (data: {
      whiteboardId: string;
      changeType?: 'major' | 'minor' | 'patch' | 'manual';
      commitMessage?: string;
      isMilestone?: boolean;
      tags?: string[];
      branchName?: string;
      metadata?: any;
    }) => {
      try {
        if (!socket.whiteboardSession || !socket.user) {
          socket.emit('error', { code: 'NO_SESSION', message: 'No active whiteboard session' });
          return;
        }

        // Check permissions
        const hasEditPermission = await permissionService.checkPermission({
          whiteboardId: data.whiteboardId,
          userId: socket.user.id,
          action: 'canEdit',
        });

        if (!hasEditPermission.hasPermission) {
          socket.emit('error', { code: 'PERMISSION_DENIED', message: 'Insufficient permissions to create version' });
          return;
        }

        const version = await versionService.createVersion(
          data.whiteboardId,
          socket.user.id,
          {
            changeType: data.changeType || 'manual',
            commitMessage: data.commitMessage,
            isMilestone: data.isMilestone,
            tags: data.tags,
            branchName: data.branchName,
            metadata: data.metadata,
          }
        );

        // Notify all users in the whiteboard
        io.to(`whiteboard:${data.whiteboardId}`).emit('whiteboard:version_created', {
          version,
          createdBy: {
            id: socket.user.id,
            username: socket.user.username,
          },
          timestamp: new Date().toISOString(),
        });

        socket.emit('whiteboard:version_created_success', {
          version,
          timestamp: new Date().toISOString(),
        });

        logger.info('Version created via WebSocket', {
          versionId: version.id,
          whiteboardId: data.whiteboardId,
          userId: socket.user.id,
          versionNumber: version.versionNumber,
        });
      } catch (error) {
        logger.error('Failed to create version via WebSocket', { error, data, userId: socket.user?.id });
        socket.emit('whiteboard:version_create_error', {
          message: error.message,
          code: 'VERSION_CREATE_FAILED',
          timestamp: new Date().toISOString(),
        });
      }
    });

    // Get version history
    socket.on('whiteboard:get_version_history', async (data: {
      whiteboardId: string;
      filters?: {
        branchName?: string;
        changeType?: string[];
        createdBy?: string;
        isMilestone?: boolean;
        dateFrom?: string;
        dateTo?: string;
      };
      limit?: number;
      offset?: number;
    }) => {
      try {
        if (!socket.user) {
          socket.emit('error', { code: 'NO_AUTH', message: 'Authentication required' });
          return;
        }

        const { whiteboardId, filters, limit = 20, offset = 0 } = data;

        const versionHistory = await versionService.getVersionHistory(
          whiteboardId,
          socket.user.id,
          filters,
          limit,
          offset
        );

        socket.emit('whiteboard:version_history', {
          whiteboardId,
          versions: versionHistory,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        logger.error('Failed to get version history via WebSocket', { error, data, userId: socket.user?.id });
        socket.emit('whiteboard:version_history_error', {
          message: error.message,
          code: 'VERSION_HISTORY_FAILED',
          timestamp: new Date().toISOString(),
        });
      }
    });

    // Compare versions
    socket.on('whiteboard:compare_versions', async (data: {
      whiteboardId: string;
      versionAId: string;
      versionBId: string;
      comparisonType?: 'full' | 'elements_only' | 'canvas_only' | 'metadata_only';
    }) => {
      try {
        if (!socket.user) {
          socket.emit('error', { code: 'NO_AUTH', message: 'Authentication required' });
          return;
        }

        const comparison = await versionService.compareVersions(
          data.whiteboardId,
          socket.user.id,
          {
            versionAId: data.versionAId,
            versionBId: data.versionBId,
            comparisonType: data.comparisonType || 'full',
          }
        );

        socket.emit('whiteboard:version_comparison', {
          comparison,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        logger.error('Failed to compare versions via WebSocket', { error, data, userId: socket.user?.id });
        socket.emit('whiteboard:version_comparison_error', {
          message: error.message,
          code: 'VERSION_COMPARISON_FAILED',
          timestamp: new Date().toISOString(),
        });
      }
    });

    // Rollback to version
    socket.on('whiteboard:rollback_to_version', async (data: {
      whiteboardId: string;
      targetVersionId: string;
      rollbackType?: 'full' | 'partial' | 'elements_only' | 'canvas_only';
      conflictResolution?: 'overwrite' | 'merge' | 'manual' | 'cancel';
      confirmConflicts?: boolean;
    }) => {
      try {
        if (!socket.whiteboardSession || !socket.user) {
          socket.emit('error', { code: 'NO_SESSION', message: 'No active whiteboard session' });
          return;
        }

        // Check permissions - rollback requires edit permissions
        const hasEditPermission = await permissionService.checkPermission({
          whiteboardId: data.whiteboardId,
          userId: socket.user.id,
          action: 'canEdit',
        });

        if (!hasEditPermission.hasPermission) {
          socket.emit('error', { code: 'PERMISSION_DENIED', message: 'Insufficient permissions to rollback whiteboard' });
          return;
        }

        // Emit rollback started event
        socket.emit('whiteboard:rollback_started', {
          whiteboardId: data.whiteboardId,
          targetVersionId: data.targetVersionId,
          timestamp: new Date().toISOString(),
        });

        const rollback = await versionService.rollbackToVersion(
          data.whiteboardId,
          socket.user.id,
          {
            targetVersionId: data.targetVersionId,
            rollbackType: data.rollbackType || 'full',
            conflictResolution: data.conflictResolution || 'overwrite',
          }
        );

        // Handle different rollback statuses
        if (rollback.status === 'conflict' && !data.confirmConflicts) {
          // Send conflict information for manual resolution
          socket.emit('whiteboard:rollback_conflicts', {
            rollback,
            conflicts: rollback.conflictsData,
            timestamp: new Date().toISOString(),
          });
          return;
        }

        if (rollback.status === 'completed') {
          // Notify all users in the whiteboard about successful rollback
          io.to(`whiteboard:${data.whiteboardId}`).emit('whiteboard:rollback_completed', {
            rollback,
            rolledBackBy: {
              id: socket.user.id,
              username: socket.user.username,
            },
            timestamp: new Date().toISOString(),
          });

          // Request canvas sync for all connected clients
          io.to(`whiteboard:${data.whiteboardId}`).emit('whiteboard:request_full_sync', {
            reason: 'rollback_completed',
            rollbackId: rollback.id,
            timestamp: new Date().toISOString(),
          });
        } else {
          // Handle failed rollback
          socket.emit('whiteboard:rollback_failed', {
            rollback,
            error: rollback.errorMessage,
            timestamp: new Date().toISOString(),
          });
        }

        logger.info('Rollback initiated via WebSocket', {
          rollbackId: rollback.id,
          whiteboardId: data.whiteboardId,
          targetVersionId: data.targetVersionId,
          userId: socket.user.id,
          status: rollback.status,
        });
      } catch (error) {
        logger.error('Failed to rollback version via WebSocket', { error, data, userId: socket.user?.id });
        socket.emit('whiteboard:rollback_error', {
          message: error.message,
          code: 'ROLLBACK_FAILED',
          timestamp: new Date().toISOString(),
        });
      }
    });

    // Resolve rollback conflicts
    socket.on('whiteboard:resolve_rollback_conflicts', async (data: {
      rollbackId: string;
      resolution: 'overwrite' | 'merge' | 'cancel';
      selectedOperations?: string[];
    }) => {
      try {
        if (!socket.user) {
          socket.emit('error', { code: 'NO_AUTH', message: 'Authentication required' });
          return;
        }

        // Update rollback with conflict resolution
        // This would require extending the rollback service with conflict resolution methods
        // For now, emit a notification that conflicts are being resolved
        socket.emit('whiteboard:rollback_conflicts_resolving', {
          rollbackId: data.rollbackId,
          resolution: data.resolution,
          timestamp: new Date().toISOString(),
        });

        logger.info('Rollback conflict resolution initiated', {
          rollbackId: data.rollbackId,
          resolution: data.resolution,
          userId: socket.user.id,
        });
      } catch (error) {
        logger.error('Failed to resolve rollback conflicts', { error, data, userId: socket.user?.id });
        socket.emit('whiteboard:rollback_conflict_resolution_error', {
          message: error.message,
          code: 'CONFLICT_RESOLUTION_FAILED',
          timestamp: new Date().toISOString(),
        });
      }
    });

    // Get version branches
    socket.on('whiteboard:get_version_branches', async (data: {
      whiteboardId: string;
    }) => {
      try {
        if (!socket.user) {
          socket.emit('error', { code: 'NO_AUTH', message: 'Authentication required' });
          return;
        }

        // This would require implementing branch management methods
        // For now, return a simple response
        socket.emit('whiteboard:version_branches', {
          whiteboardId: data.whiteboardId,
          branches: [
            {
              id: 'main',
              name: 'main',
              isMain: true,
              headVersionId: null,
              createdBy: socket.user.id,
              createdAt: new Date().toISOString(),
            },
          ],
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        logger.error('Failed to get version branches', { error, data, userId: socket.user?.id });
        socket.emit('whiteboard:version_branches_error', {
          message: error.message,
          code: 'BRANCHES_FAILED',
          timestamp: new Date().toISOString(),
        });
      }
    });

    // Auto-version on significant changes
    const handleAutoVersioning = async (whiteboardId: string, userId: string, changeData: any) => {
      try {
        // Only create auto-versions for significant changes
        const shouldCreateVersion = await shouldCreateAutoVersion(whiteboardId, changeData);
        
        if (shouldCreateVersion) {
          const version = await versionService.createVersion(whiteboardId, userId, {
            changeType: 'auto_save',
            commitMessage: 'Automatic version created',
            isAutomatic: true,
            metadata: {
              changeType: changeData.operation?.type,
              elementCount: changeData.elementCount,
              trigger: 'canvas_change',
            },
          });

          // Silently notify connected clients about auto-version
          io.to(`whiteboard:${whiteboardId}`).emit('whiteboard:auto_version_created', {
            versionId: version.id,
            versionNumber: version.versionNumber,
            timestamp: new Date().toISOString(),
          });
        }
      } catch (error) {
        logger.warn('Auto-versioning failed', { error, whiteboardId, userId });
        // Don't emit error for auto-versioning failures
      }
    };

    // Helper function to determine if auto-version should be created
    const shouldCreateAutoVersion = async (whiteboardId: string, changeData: any): Promise<boolean> => {
      // Simple heuristics for auto-versioning
      const significantOperations = ['create', 'delete'];
      const operationType = changeData.operation?.type;
      
      // Create version for significant operations
      if (significantOperations.includes(operationType)) {
        return true;
      }

      // Create version every 10 minutes for active editing
      const lastAutoVersionTime = canvasVersions.get(`auto_version_time:${whiteboardId}`);
      const now = Date.now();
      const tenMinutes = 10 * 60 * 1000;

      if (!lastAutoVersionTime || (now - lastAutoVersionTime) > tenMinutes) {
        canvasVersions.set(`auto_version_time:${whiteboardId}`, now);
        return true;
      }

      return false;
    };

    // ==================== ADVANCED SEARCH FUNCTIONALITY ====================

    // Advanced whiteboard search
    socket.on('whiteboard:advanced_search', async (data: {
      workspaceId: string;
      searchQuery: any;
      sort?: any;
      limit?: number;
      offset?: number;
      requestId?: string;
    }) => {
      try {
        if (!socket.user) {
          socket.emit('error', { code: 'NO_AUTH', message: 'Authentication required' });
          return;
        }

        const { workspaceId, searchQuery, sort, limit = 20, offset = 0, requestId } = data;

        // Check rate limiting for search requests
        const rateLimitCheck = checkRateLimit(socket, 'whiteboard:advanced_search');
        if (!rateLimitCheck.allowed) {
          socket.emit('whiteboard:search_rate_limited', {
            code: rateLimitCheck.error.code,
            message: 'Search requests are being rate limited',
            retryAfterMs: rateLimitCheck.error.retryAfterMs,
            timestamp: new Date().toISOString()
          });
          return;
        }

        const searchResults = await searchService.advancedSearch(
          workspaceId,
          socket.user.id,
          searchQuery,
          sort,
          limit,
          offset
        );

        socket.emit('whiteboard:search_results', {
          requestId: requestId || crypto.randomUUID(),
          results: searchResults,
          timestamp: new Date().toISOString()
        });

        // Track search analytics
        if (socket.whiteboardSession) {
          await analyticsIntegration.trackUserAction(socket, 'search', 'whiteboard', {
            query: searchQuery.query,
            resultsCount: searchResults.total,
            executionTime: searchResults.searchMetadata.executionTimeMs,
            searchType: 'advanced',
            filters: searchResults.searchMetadata.filters,
          });
        }

      } catch (error) {
        logger.error('Failed to perform advanced search', { error, data });
        socket.emit('whiteboard:search_error', {
          requestId: data.requestId,
          error: 'Search failed',
          timestamp: new Date().toISOString()
        });
      }
    });

    // Full-text search across whiteboards
    socket.on('whiteboard:fulltext_search', async (data: {
      workspaceId: string;
      query: string;
      filters?: any;
      limit?: number;
      offset?: number;
      requestId?: string;
    }) => {
      try {
        if (!socket.user) {
          socket.emit('error', { code: 'NO_AUTH', message: 'Authentication required' });
          return;
        }

        const { workspaceId, query, filters, limit = 20, offset = 0, requestId } = data;

        // Check rate limiting
        const rateLimitCheck = checkRateLimit(socket, 'whiteboard:fulltext_search');
        if (!rateLimitCheck.allowed) {
          socket.emit('whiteboard:search_rate_limited', {
            code: rateLimitCheck.error.code,
            message: 'Search requests are being rate limited',
            retryAfterMs: rateLimitCheck.error.retryAfterMs,
            timestamp: new Date().toISOString()
          });
          return;
        }

        const searchResults = await searchService.fullTextSearch(
          workspaceId,
          socket.user.id,
          query,
          filters,
          limit,
          offset
        );

        socket.emit('whiteboard:fulltext_results', {
          requestId: requestId || crypto.randomUUID(),
          results: searchResults,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        logger.error('Failed to perform full-text search', { error, data });
        socket.emit('whiteboard:search_error', {
          requestId: data.requestId,
          error: 'Full-text search failed',
          timestamp: new Date().toISOString()
        });
      }
    });

    // Search whiteboard elements
    socket.on('whiteboard:search_elements', async (data: {
      whiteboardId: string;
      query: string;
      elementTypes?: string[];
      limit?: number;
      offset?: number;
      requestId?: string;
    }) => {
      try {
        if (!socket.user) {
          socket.emit('error', { code: 'NO_AUTH', message: 'Authentication required' });
          return;
        }

        const { whiteboardId, query, elementTypes, limit = 50, offset = 0, requestId } = data;

        // Check rate limiting
        const rateLimitCheck = checkRateLimit(socket, 'whiteboard:search_elements');
        if (!rateLimitCheck.allowed) {
          socket.emit('whiteboard:search_rate_limited', {
            code: rateLimitCheck.error.code,
            message: 'Element search requests are being rate limited',
            retryAfterMs: rateLimitCheck.error.retryAfterMs,
            timestamp: new Date().toISOString()
          });
          return;
        }

        const searchResults = await searchService.searchElements(
          whiteboardId,
          socket.user.id,
          query,
          elementTypes,
          limit,
          offset
        );

        socket.emit('whiteboard:element_search_results', {
          requestId: requestId || crypto.randomUUID(),
          whiteboardId,
          results: searchResults,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        logger.error('Failed to search whiteboard elements', { error, data });
        socket.emit('whiteboard:search_error', {
          requestId: data.requestId,
          error: 'Element search failed',
          timestamp: new Date().toISOString()
        });
      }
    });

    // Get search suggestions
    socket.on('whiteboard:search_suggestions', async (data: {
      workspaceId: string;
      partialQuery: string;
      limit?: number;
      requestId?: string;
    }) => {
      try {
        if (!socket.user) {
          socket.emit('error', { code: 'NO_AUTH', message: 'Authentication required' });
          return;
        }

        const { workspaceId, partialQuery, limit = 10, requestId } = data;

        // Check rate limiting - allow more frequent requests for suggestions
        const rateLimitCheck = checkRateLimit(socket, 'whiteboard:search_suggestions');
        if (!rateLimitCheck.allowed) {
          socket.emit('whiteboard:search_rate_limited', {
            code: rateLimitCheck.error.code,
            message: 'Search suggestion requests are being rate limited',
            retryAfterMs: rateLimitCheck.error.retryAfterMs,
            timestamp: new Date().toISOString()
          });
          return;
        }

        const suggestions = await searchService.generateSearchSuggestions(
          partialQuery,
          workspaceId,
          socket.user.id,
          limit
        );

        socket.emit('whiteboard:search_suggestions_results', {
          requestId: requestId || crypto.randomUUID(),
          partialQuery,
          suggestions,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        logger.error('Failed to generate search suggestions', { error, data });
        socket.emit('whiteboard:search_error', {
          requestId: data.requestId,
          error: 'Search suggestions failed',
          timestamp: new Date().toISOString()
        });
      }
    });

    // Unified cross-service search
    socket.on('whiteboard:unified_search', async (data: {
      workspaceId: string;
      searchRequest: any;
      requestId?: string;
    }) => {
      try {
        if (!socket.user) {
          socket.emit('error', { code: 'NO_AUTH', message: 'Authentication required' });
          return;
        }

        const { workspaceId, searchRequest, requestId } = data;

        // Check rate limiting
        const rateLimitCheck = checkRateLimit(socket, 'whiteboard:unified_search');
        if (!rateLimitCheck.allowed) {
          socket.emit('whiteboard:search_rate_limited', {
            code: rateLimitCheck.error.code,
            message: 'Unified search requests are being rate limited',
            retryAfterMs: rateLimitCheck.error.retryAfterMs,
            timestamp: new Date().toISOString()
          });
          return;
        }

        const searchResults = await searchService.unifiedSearch(
          workspaceId,
          socket.user.id,
          searchRequest
        );

        socket.emit('whiteboard:unified_search_results', {
          requestId: requestId || crypto.randomUUID(),
          results: searchResults.results,
          metadata: searchResults.searchMetadata,
          timestamp: new Date().toISOString()
        });

        // Track cross-service search analytics
        if (socket.whiteboardSession) {
          await analyticsIntegration.trackUserAction(socket, 'unified_search', 'cross_service', {
            query: searchRequest.query,
            services: searchRequest.services,
            resultsCount: searchResults.results.length,
            executionTime: searchResults.searchMetadata.executionTimeMs,
          });
        }

      } catch (error) {
        logger.error('Failed to perform unified search', { error, data });
        socket.emit('whiteboard:search_error', {
          requestId: data.requestId,
          error: 'Unified search failed',
          timestamp: new Date().toISOString()
        });
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

    // Step 6: Clean up operational data structures to prevent memory leaks
    try {
      // Check if this was the last user on the whiteboard by checking room membership
      const whiteboardRoom = io.sockets.adapter.rooms.get(`whiteboard:${whiteboardId}`);
      const remainingUsers = whiteboardRoom ? whiteboardRoom.size : 0;
      
      if (remainingUsers === 0) {
        // No more users, safe to clean up whiteboard-specific data structures
        operationQueues.delete(whiteboardId);
        whiteboardContexts.delete(whiteboardId);
        pendingConflicts.delete(whiteboardId);
        canvasVersions.delete(whiteboardId);
        
        // Clean up permission cache for this whiteboard
        const keysToDelete = Array.from(permissionCache.keys()).filter(key => 
          key.includes(`:${whiteboardId}:`)
        );
        keysToDelete.forEach(key => permissionCache.delete(key));
        
        logger.debug('Whiteboard data structures cleaned up', { 
          whiteboardId, 
          cleanedCacheEntries: keysToDelete.length 
        });
      } else {
        // Other users still connected, just clean up user-specific cache
        invalidatePermissionCache(userId, whiteboardId);
        logger.debug('User-specific cache cleaned up', { userId, whiteboardId });
      }
    } catch (cleanupError) {
      const errorMsg = `Memory cleanup failed: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`;
      cleanupErrors.push(errorMsg);
      logger.error('Memory cleanup error (critical)', { userId, whiteboardId, error: errorMsg });
    }

    // Step 7: Broadcast notifications (best effort)
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

  // Start cleanup interval (must be after enhancedCleanup is defined)
  const cleanupInterval = setInterval(enhancedCleanup, 5 * 60 * 1000); // Run every 5 minutes

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

  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);

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
 * Broadcast search results to whiteboard participants for collaborative awareness
 */
export function broadcastSearchResults(
  io: SocketIOServer,
  whiteboardId: string,
  data: {
    searchedBy: { id: string; name: string };
    query: string;
    resultsCount: number;
    searchType: string;
    executionTime: number;
  }
): void {
  io.to(`whiteboard:${whiteboardId}:presence`).emit('whiteboard:search_results_shared', {
    ...data,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Broadcast search filter updates for collaborative filtering
 */
export function broadcastSearchFilterUpdate(
  io: SocketIOServer,
  whiteboardId: string,
  data: {
    updatedBy: { id: string; name: string };
    filterType: string;
    filterValue: any;
    active: boolean;
  }
): void {
  io.to(`whiteboard:${whiteboardId}:presence`).emit('whiteboard:search_filter_updated', {
    ...data,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Broadcast search performance metrics for optimization
 */
export function broadcastSearchMetrics(
  io: SocketIOServer,
  workspaceId: string,
  data: {
    searchType: string;
    avgExecutionTime: number;
    totalSearches: number;
    popularQueries: string[];
    performanceAlert?: boolean;
  }
): void {
  io.to(`workspace:${workspaceId}:admins`).emit('whiteboard:search_metrics', {
    ...data,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Broadcast real-time search index updates
 */
export function broadcastSearchIndexUpdate(
  io: SocketIOServer,
  whiteboardId: string,
  data: {
    updatedBy: { id: string; name: string };
    updateType: 'content_added' | 'content_updated' | 'content_deleted';
    affectedContent: {
      type: 'whiteboard' | 'element' | 'comment';
      id: string;
      title?: string;
    };
    searchImpact: {
      indexUpdated: boolean;
      affectedQueries: string[];
    };
  }
): void {
  io.to(`whiteboard:${whiteboardId}:presence`).emit('whiteboard:search_index_updated', {
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

// ==================== SECURITY VALIDATION FUNCTIONS ====================

/**
 * Validate user access to whiteboard operations using granular permission service
 */
/**
 * Enhanced permission validation with caching and performance optimization
 */
async function validateWhiteboardAccess(
  userId: string, 
  whiteboardId: string, 
  operationType: string,
  elementId?: string,
  position?: { x: number; y: number },
  layerIndex?: number
): Promise<void> {
  const startTime = Date.now();
  
  try {
    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(userId) || !uuidRegex.test(whiteboardId)) {
      throw new Error('Invalid ID format');
    }
    
    // Basic operation type validation
    const validOperations = ['create', 'update', 'delete', 'move', 'style', 'view', 'comment'];
    if (!validOperations.includes(operationType)) {
      throw new Error('Invalid operation type');
    }
    
    // Map operation type to permission action
    const actionMap: Record<string, string> = {
      create: 'canCreateElements',
      update: 'canEdit',
      delete: 'canDelete',
      move: 'canMoveElements',
      style: 'canStyleElements',
      view: 'canView',
      comment: 'canComment'
    };
    
    const action = actionMap[operationType];
    if (!action) {
      throw new Error(`Unsupported operation type: ${operationType}`);
    }
    
    // Create cache key for performance
    const cacheKey = `perm:${userId}:${whiteboardId}:${action}:${elementId || 'none'}:${position ? `${position.x},${position.y}` : 'none'}:${layerIndex || 'none'}`;
    
    // Check cache first (with 5 second TTL for security)
    let result = permissionCache.get(cacheKey);
    let cacheHit = !!result;
    
    if (!result) {
      // Check granular permissions using the permission service
      const permissionCheck: PermissionCheckRequest = {
        whiteboardId,
        userId,
        action,
        elementId,
        areaCoordinates: position,
        layerIndex
      };
      
      result = await permissionService.checkPermission(permissionCheck);
      
      // Cache result for 5 seconds only (security vs performance balance)
      if (result.allowed) {
        permissionCache.set(cacheKey, result, 5000);
      }
    }
    
    const duration = Date.now() - startTime;
    if (duration > 50) {
      logger.warn('Slow permission check detected', {
        userId,
        whiteboardId,
        action,
        duration: `${duration}ms`,
        cacheHit
      });
    }
    
    if (!result.allowed) {
      const error = new Error(`Permission denied: ${result.reason}`);
      (error as any).code = 'PERMISSION_DENIED';
      (error as any).details = {
        action,
        reason: result.reason,
        appliedRule: result.appliedRule
      };
      throw error;
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('Permission validation failed', {
      userId,
      whiteboardId,
      operationType,
      duration: `${duration}ms`,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw error;
  }
}

/**
 * Validate user access to specific whiteboard elements using granular permission service
 * Note: This function now delegates to validateWhiteboardAccess for comprehensive checking
 */
async function validateElementAccess(
  userId: string, 
  whiteboardId: string, 
  elementId: string, 
  operationType: string
): Promise<void> {
  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(elementId)) {
    throw new Error('Invalid element ID format');
  }
  
  // Use the comprehensive validateWhiteboardAccess function which handles element-level permissions
  await validateWhiteboardAccess(userId, whiteboardId, operationType, elementId);
}

/**
 * Get user permissions for a specific whiteboard using granular permission service
 */
async function getUserWhiteboardPermissions(
  userId: string, 
  whiteboardId: string
): Promise<Record<string, boolean>> {
  try {
    const userPermissions = await permissionService.getUserPermissions(whiteboardId, userId);
    
    if (!userPermissions) {
      // User has no explicit permissions, return minimal access
      return {
        canCreate: false,
        canEdit: false,
        canDelete: false,
        canComment: false,
        canShare: false,
        canManagePermissions: false
      };
    }
    
    // Convert granular permissions to the format expected by OT engine
    return {
      canCreate: userPermissions.permissions.canCreateElements,
      canEdit: userPermissions.permissions.canEdit,
      canDelete: userPermissions.permissions.canDelete,
      canComment: userPermissions.permissions.canComment,
      canShare: userPermissions.permissions.canShare,
      canManagePermissions: userPermissions.permissions.canManagePermissions
    };
  } catch (error) {
    logger.error('Failed to get user permissions', { userId, whiteboardId, error });
    // Fail securely - deny all permissions on error
    return {
      canCreate: false,
      canEdit: false,
      canDelete: false,
      canComment: false,
      canShare: false,
      canManagePermissions: false
    };
  }
}