/**
 * WebSocket Permission Middleware
 * 
 * Real-time permission enforcement middleware for whiteboard WebSocket operations
 * Integrates with the enhanced permission system to provide:
 * - Pre-operation permission validation
 * - Real-time permission change broadcasting
 * - Operation filtering based on permissions
 * - Performance-optimized permission checking
 */

import { Socket } from 'socket.io';
import { Logger } from '@mcp-tools/core/utils/logger';
import { 
  WhiteboardPermissionService,
  WhiteboardPermissionValidator,
  PermissionCheckResult,
  OperationContext 
} from '@mcp-tools/core/services/whiteboard/whiteboard-permission-service';
import { EnhancedWhiteboardOperation } from '@mcp-tools/core/services/whiteboard/whiteboard-ot-engine';
import { randomUUID } from 'crypto';

// WebSocket events that require permission validation
const PERMISSION_REQUIRED_EVENTS = new Set([
  'whiteboard:element_create',
  'whiteboard:element_update', 
  'whiteboard:element_delete',
  'whiteboard:element_move',
  'whiteboard:element_style',
  'whiteboard:element_group',
  'whiteboard:element_ungroup',
  'whiteboard:element_lock',
  'whiteboard:element_unlock',
  'whiteboard:whiteboard_update',
  'whiteboard:whiteboard_settings',
  'whiteboard:comment_create',
  'whiteboard:comment_update',
  'whiteboard:comment_delete',
  'whiteboard:comment_resolve',
  'whiteboard:permission_grant',
  'whiteboard:permission_revoke',
  'whiteboard:share_whiteboard',
  'whiteboard:export_whiteboard',
  'whiteboard:version_save',
  'whiteboard:version_restore',
]);

// Events that are always allowed (presence, cursor tracking, etc.)
const ALWAYS_ALLOWED_EVENTS = new Set([
  'whiteboard:join',
  'whiteboard:leave',
  'whiteboard:cursor_move',
  'whiteboard:selection_change',
  'whiteboard:presence_update',
  'whiteboard:typing_start',
  'whiteboard:typing_stop',
  'whiteboard:ping',
  'whiteboard:heartbeat',
]);

// Permission error types
export interface PermissionError {
  code: string;
  message: string;
  suggestions?: string[];
  alternativeActions?: string[];
  canRetry?: boolean;
  retryAfter?: number;
}

// Enhanced socket interface with permission context
export interface PermissionAwareSocket extends Socket {
  whiteboardPermissions?: {
    whiteboardId: string;
    userId: string;
    sessionId: string;
    lastPermissionCheck: number;
    cachedPermissions: Record<string, boolean>;
    rateLimitTokens: number;
    rateLimitResetTime: number;
  };
}

/**
 * Permission enforcement middleware for WebSocket operations
 */
export class WhiteboardPermissionMiddleware {
  private logger: Logger;
  private operationQueue = new Map<string, Array<{ operation: any; callback: Function }>>();
  private rateLimitWindows = new Map<string, { count: number; resetTime: number }>();

  constructor(
    private permissionService: WhiteboardPermissionService,
    private permissionValidator: WhiteboardPermissionValidator,
    logger?: Logger
  ) {
    this.logger = logger || new Logger('WhiteboardPermissionMiddleware');
  }

  /**
   * Initialize permission context for socket connection
   */
  async initializePermissionContext(
    socket: PermissionAwareSocket,
    whiteboardId: string,
    userId: string,
    sessionId: string
  ): Promise<void> {
    try {
      // Get user's base permissions for caching
      const basePermissions = await this.permissionService.getUserPermissions(whiteboardId, userId);
      
      socket.whiteboardPermissions = {
        whiteboardId,
        userId,
        sessionId,
        lastPermissionCheck: Date.now(),
        cachedPermissions: this.flattenPermissions(basePermissions),
        rateLimitTokens: 100, // Start with full tokens
        rateLimitResetTime: Date.now() + 60000, // Reset every minute
      };

      this.logger.debug('Permission context initialized', { whiteboardId, userId, sessionId });
    } catch (error) {
      this.logger.error('Failed to initialize permission context', { error, whiteboardId, userId });
      throw error;
    }
  }

  /**
   * Main permission validation middleware function
   */
  validatePermission() {
    return async (socket: PermissionAwareSocket, next: Function) => {
      const eventName = socket.eventNames()[0] as string;
      const eventData = arguments[0];

      try {
        // Skip validation for always allowed events
        if (ALWAYS_ALLOWED_EVENTS.has(eventName)) {
          return next();
        }

        // Check if event requires permission validation
        if (!PERMISSION_REQUIRED_EVENTS.has(eventName)) {
          return next();
        }

        // Ensure permission context is initialized
        if (!socket.whiteboardPermissions) {
          throw new Error('Permission context not initialized');
        }

        // Rate limiting check
        const rateLimitResult = this.checkRateLimit(socket);
        if (!rateLimitResult.allowed) {
          return this.handlePermissionDenied(socket, eventName, {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many operations, please slow down',
            canRetry: true,
            retryAfter: rateLimitResult.retryAfter,
          });
        }

        // Validate the specific operation
        const validationResult = await this.validateOperation(socket, eventName, eventData);
        
        if (!validationResult.allowed) {
          return this.handlePermissionDenied(socket, eventName, {
            code: 'PERMISSION_DENIED',
            message: validationResult.reason || 'Operation not permitted',
            suggestions: validationResult.suggestions,
            alternativeActions: validationResult.alternativeActions,
            canRetry: !validationResult.requiresApproval,
          });
        }

        // Operation approved, consume rate limit token
        this.consumeRateLimitToken(socket);

        // Add audit logging for high-risk operations
        if (validationResult.auditRequired) {
          await this.logAuditEvent(socket, eventName, eventData, validationResult);
        }

        // Continue with the operation
        next();

      } catch (error) {
        this.logger.error('Permission validation error', { 
          error, 
          eventName, 
          userId: socket.whiteboardPermissions?.userId 
        });
        
        this.handlePermissionDenied(socket, eventName, {
          code: 'VALIDATION_ERROR',
          message: 'Permission validation failed',
          canRetry: true,
        });
      }
    };
  }

  /**
   * Validate specific WebSocket operation
   */
  private async validateOperation(
    socket: PermissionAwareSocket,
    eventName: string,
    eventData: any
  ): Promise<PermissionCheckResult> {
    const context = socket.whiteboardPermissions!;
    const operationType = eventName.replace('whiteboard:', '');

    // Check cached permissions first for simple operations
    const cacheKey = `${operationType}:${eventData.elementId || 'global'}`;
    if (this.shouldUseCachedPermission(context, cacheKey)) {
      const cached = context.cachedPermissions[cacheKey];
      if (cached !== undefined) {
        return {
          allowed: cached,
          reason: cached ? undefined : 'Cached permission denial',
        };
      }
    }

    // Get client IP for context
    const ipAddress = this.getClientIP(socket);

    // Perform full validation
    const validationResult = await this.permissionValidator.validateWebSocketOperation(
      operationType,
      eventData,
      {
        whiteboardId: context.whiteboardId,
        userId: context.userId,
        sessionId: context.sessionId,
        ipAddress,
      }
    );

    // Cache the result for simple permissions
    if (!validationResult.requiresApproval && !validationResult.restrictions) {
      context.cachedPermissions[cacheKey] = validationResult.allowed;
    }

    return validationResult;
  }

  /**
   * Handle permission denied scenarios
   */
  private handlePermissionDenied(
    socket: PermissionAwareSocket,
    eventName: string,
    error: PermissionError
  ): void {
    // Emit permission denied event to client
    socket.emit('whiteboard:permission_denied', {
      event: eventName,
      error,
      timestamp: Date.now(),
    });

    // Log the denial for monitoring
    this.logger.warn('Permission denied', {
      eventName,
      userId: socket.whiteboardPermissions?.userId,
      whiteboardId: socket.whiteboardPermissions?.whiteboardId,
      error: error.code,
      reason: error.message,
    });

    // Track denial metrics (could integrate with monitoring system)
    this.trackPermissionDenial(socket, eventName, error.code);
  }

  /**
   * Broadcast permission changes to affected users
   */
  async broadcastPermissionChange(
    io: any, // Socket.IO server instance
    whiteboardId: string,
    affectedUserIds: string[],
    changeType: string,
    changeData: any
  ): Promise<void> {
    try {
      // Find all sockets for affected users in this whiteboard
      const sockets = await io.in(`whiteboard:${whiteboardId}`).fetchSockets();
      
      for (const socket of sockets) {
        const permSocket = socket as PermissionAwareSocket;
        if (permSocket.whiteboardPermissions && 
            affectedUserIds.includes(permSocket.whiteboardPermissions.userId)) {
          
          // Invalidate cached permissions
          permSocket.whiteboardPermissions.cachedPermissions = {};
          permSocket.whiteboardPermissions.lastPermissionCheck = 0;

          // Notify client of permission change
          socket.emit('whiteboard:permission_changed', {
            changeType,
            changeData,
            timestamp: Date.now(),
            requiresReauth: changeType === 'role_revoked',
          });

          this.logger.debug('Permission change broadcasted', {
            whiteboardId,
            userId: permSocket.whiteboardPermissions.userId,
            changeType,
          });
        }
      }
    } catch (error) {
      this.logger.error('Failed to broadcast permission change', { error, whiteboardId });
    }
  }

  /**
   * Handle user disconnection and cleanup
   */
  async handleDisconnection(socket: PermissionAwareSocket): Promise<void> {
    try {
      if (socket.whiteboardPermissions) {
        const { whiteboardId, userId, sessionId } = socket.whiteboardPermissions;
        
        // Clean up any queued operations
        this.operationQueue.delete(sessionId);
        
        // Log session end
        this.logger.debug('Permission context cleaned up', { whiteboardId, userId, sessionId });
      }
    } catch (error) {
      this.logger.error('Error during permission cleanup', { error });
    }
  }

  /**
   * Queue operations that require approval
   */
  async queueOperationForApproval(
    socket: PermissionAwareSocket,
    operation: any,
    approvalWorkflow: string
  ): Promise<void> {
    const sessionId = socket.whiteboardPermissions!.sessionId;
    
    if (!this.operationQueue.has(sessionId)) {
      this.operationQueue.set(sessionId, []);
    }

    this.operationQueue.get(sessionId)!.push({
      operation,
      callback: (approved: boolean) => {
        if (approved) {
          socket.emit('whiteboard:operation_approved', { operation });
        } else {
          socket.emit('whiteboard:operation_rejected', { operation });
        }
      },
    });

    // Notify client that operation requires approval
    socket.emit('whiteboard:approval_required', {
      operationId: operation.id,
      workflow: approvalWorkflow,
      timestamp: Date.now(),
    });
  }

  /**
   * Process approval decision
   */
  async processApprovalDecision(
    sessionId: string,
    operationId: string,
    approved: boolean,
    decidedBy: string
  ): Promise<void> {
    const queue = this.operationQueue.get(sessionId);
    if (!queue) return;

    const operationIndex = queue.findIndex(item => item.operation.id === operationId);
    if (operationIndex === -1) return;

    const { operation, callback } = queue[operationIndex];
    queue.splice(operationIndex, 1);

    // Execute the callback
    callback(approved);

    this.logger.info('Operation approval processed', {
      operationId,
      approved,
      decidedBy,
      sessionId,
    });
  }

  // Private helper methods

  private checkRateLimit(socket: PermissionAwareSocket): { allowed: boolean; retryAfter?: number } {
    const context = socket.whiteboardPermissions!;
    const now = Date.now();

    // Reset tokens if window expired
    if (now >= context.rateLimitResetTime) {
      context.rateLimitTokens = 100;
      context.rateLimitResetTime = now + 60000;
    }

    if (context.rateLimitTokens <= 0) {
      return {
        allowed: false,
        retryAfter: Math.ceil((context.rateLimitResetTime - now) / 1000),
      };
    }

    return { allowed: true };
  }

  private consumeRateLimitToken(socket: PermissionAwareSocket): void {
    const context = socket.whiteboardPermissions!;
    context.rateLimitTokens = Math.max(0, context.rateLimitTokens - 1);
  }

  private shouldUseCachedPermission(context: any, cacheKey: string): boolean {
    const cacheAge = Date.now() - context.lastPermissionCheck;
    return cacheAge < 30000 && context.cachedPermissions.hasOwnProperty(cacheKey); // 30 second cache
  }

  private flattenPermissions(permissions: any): Record<string, boolean> {
    const flattened: Record<string, boolean> = {};
    
    // Flatten permission object for easier caching
    for (const [key, value] of Object.entries(permissions)) {
      if (typeof value === 'boolean') {
        flattened[key] = value;
      } else if (typeof value === 'object' && value !== null) {
        for (const [subKey, subValue] of Object.entries(value)) {
          if (typeof subValue === 'boolean') {
            flattened[`${key}.${subKey}`] = subValue;
          }
        }
      }
    }

    return flattened;
  }

  private getClientIP(socket: Socket): string {
    const forwarded = socket.handshake.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
      return forwarded.split(',')[0].trim();
    }
    return socket.handshake.address || 'unknown';
  }

  private async logAuditEvent(
    socket: PermissionAwareSocket,
    eventName: string,
    eventData: any,
    validationResult: PermissionCheckResult
  ): Promise<void> {
    const context = socket.whiteboardPermissions!;
    
    // This would integrate with your audit logging system
    this.logger.info('Audit: High-risk operation performed', {
      eventName,
      whiteboardId: context.whiteboardId,
      userId: context.userId,
      sessionId: context.sessionId,
      ipAddress: this.getClientIP(socket),
      userAgent: socket.handshake.headers['user-agent'],
      eventData: JSON.stringify(eventData),
      validationLatency: validationResult.validationLatency,
      timestamp: Date.now(),
    });
  }

  private trackPermissionDenial(
    socket: PermissionAwareSocket,
    eventName: string,
    errorCode: string
  ): void {
    // This would integrate with your metrics/monitoring system
    // For now, just log it
    this.logger.info('Permission denial tracked', {
      eventName,
      errorCode,
      userId: socket.whiteboardPermissions?.userId,
      whiteboardId: socket.whiteboardPermissions?.whiteboardId,
    });
  }

  /**
   * Get middleware statistics
   */
  getMiddlewareStats(): {
    activeContexts: number;
    queuedOperations: number;
    rateLimitedSockets: number;
  } {
    let queuedOperations = 0;
    for (const queue of this.operationQueue.values()) {
      queuedOperations += queue.length;
    }

    return {
      activeContexts: this.operationQueue.size,
      queuedOperations,
      rateLimitedSockets: 0, // Would need to track this
    };
  }

  /**
   * Clear middleware cache and reset state
   */
  reset(): void {
    this.operationQueue.clear();
    this.rateLimitWindows.clear();
  }
}