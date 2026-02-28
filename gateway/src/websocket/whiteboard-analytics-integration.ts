/**
 * Whiteboard Analytics Integration
 * 
 * This module provides analytics collection integration for the whiteboard WebSocket handler.
 * It tracks user interactions, performance metrics, and collaboration patterns with minimal
 * performance impact on the main whiteboard operations.
 */

import { Socket } from 'socket.io';
import { Logger } from '@mcp-tools/core/utils/logger';
import { WhiteboardAnalyticsService } from '@mcp-tools/core/services/whiteboard/whiteboard-analytics-service';
import { DatabasePool } from '@mcp-tools/core/utils/database-pool';

// Types for analytics integration
interface AnalyticsEvent {
  type: 'user_action' | 'collaboration' | 'performance' | 'error';
  action: string;
  targetType: string;
  targetId?: string;
  coordinates?: { x: number; y: number };
  elementType?: string;
  toolType?: string;
  duration?: number;
  metadata?: Record<string, unknown>;
}

interface PerformanceTracker {
  operationStart: number;
  operationType: string;
  context: Record<string, unknown>;
}

interface WhiteboardAnalyticsSocket extends Socket {
  user: {
    id: string;
    name: string;
    email?: string;
    avatar?: string;
  };
  whiteboardSession?: {
    whiteboardId: string;
    workspaceId: string;
    sessionToken: string;
    sessionId: string;
  };
  performanceTrackers?: Map<string, PerformanceTracker>;
}

/**
 * Analytics integration class for whiteboard WebSocket operations
 */
export class WhiteboardAnalyticsIntegration {
  private analyticsService: WhiteboardAnalyticsService;
  private logger: Logger;
  private performanceThresholds: Record<string, number>;

  constructor(
    db: DatabasePool,
    options?: {
      performanceThresholds?: Record<string, number>;
      enableDebugLogging?: boolean;
    }
  ) {
    this.analyticsService = new WhiteboardAnalyticsService(db);
    this.logger = new Logger('WhiteboardAnalyticsIntegration');
    
    // Default performance thresholds in milliseconds
    this.performanceThresholds = {
      canvas_operation: 100,
      ot_transform: 50,
      comment_create: 200,
      presence_update: 25,
      session_join: 1000,
      ...options?.performanceThresholds,
    };

    if (options?.enableDebugLogging) {
      this.logger.setLevel('debug');
    }
  }

  /**
   * Initialize analytics for a socket connection
   */
  initializeSocketAnalytics(socket: WhiteboardAnalyticsSocket): void {
    // Initialize performance trackers
    socket.performanceTrackers = new Map<string, PerformanceTracker>();

    // Add socket disconnect handler for analytics
    socket.on('disconnect', (reason: string) => {
      this.handleSocketDisconnect(socket, reason).catch(error => {
        this.logger.warn('Failed to handle socket disconnect analytics', { error, socketId: socket.id });
      });
    });
  }

  /**
   * Track a user action event
   */
  async trackUserAction(
    socket: WhiteboardAnalyticsSocket,
    action: string,
    targetType: string,
    options?: {
      targetId?: string;
      coordinates?: { x: number; y: number };
      elementType?: string;
      toolType?: string;
      metadata?: Record<string, unknown>;
    }
  ): Promise<void> {
    try {
      if (!socket.whiteboardSession) {
        return; // No active whiteboard session
      }

      const eventData: AnalyticsEvent = {
        type: 'user_action',
        action,
        targetType,
        targetId: options?.targetId,
        coordinates: options?.coordinates,
        elementType: options?.elementType,
        toolType: options?.toolType,
        metadata: {
          ...options?.metadata,
          socketId: socket.id,
          timestamp: Date.now(),
        },
      };

      await this.analyticsService.trackEvent(
        socket.whiteboardSession.whiteboardId,
        socket.user.id,
        eventData,
        socket.whiteboardSession.sessionId,
        this.getClientMetadata(socket)
      );

      this.logger.debug('User action tracked', { 
        action, 
        targetType, 
        whiteboardId: socket.whiteboardSession.whiteboardId 
      });
    } catch (error) {
      this.logger.warn('Failed to track user action', { error, action, targetType });
      // Don't throw - analytics failures shouldn't break main functionality
    }
  }

  /**
   * Track a collaboration event
   */
  async trackCollaborationEvent(
    socket: WhiteboardAnalyticsSocket,
    action: string,
    targetType: string,
    options?: {
      targetId?: string;
      collaboratorIds?: string[];
      conflictResolved?: boolean;
      metadata?: Record<string, unknown>;
    }
  ): Promise<void> {
    try {
      if (!socket.whiteboardSession) {
        return;
      }

      const eventData: AnalyticsEvent = {
        type: 'collaboration',
        action,
        targetType,
        targetId: options?.targetId,
        metadata: {
          ...options?.metadata,
          collaboratorIds: options?.collaboratorIds,
          conflictResolved: options?.conflictResolved,
          socketId: socket.id,
          timestamp: Date.now(),
        },
      };

      await this.analyticsService.trackEvent(
        socket.whiteboardSession.whiteboardId,
        socket.user.id,
        eventData,
        socket.whiteboardSession.sessionId,
        this.getClientMetadata(socket)
      );

      this.logger.debug('Collaboration event tracked', { 
        action, 
        targetType, 
        whiteboardId: socket.whiteboardSession.whiteboardId 
      });
    } catch (error) {
      this.logger.warn('Failed to track collaboration event', { error, action, targetType });
    }
  }

  /**
   * Start performance tracking for an operation
   */
  startPerformanceTracking(
    socket: WhiteboardAnalyticsSocket,
    operationType: string,
    context?: Record<string, unknown>
  ): string {
    const trackerId = `${operationType}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    
    if (socket.performanceTrackers) {
      socket.performanceTrackers.set(trackerId, {
        operationStart: performance.now(),
        operationType,
        context: context || {},
      });
    }

    return trackerId;
  }

  /**
   * End performance tracking and record metrics
   */
  async endPerformanceTracking(
    socket: WhiteboardAnalyticsSocket,
    trackerId: string,
    success: boolean = true,
    errorInfo?: Record<string, unknown>
  ): Promise<void> {
    try {
      if (!socket.performanceTrackers || !socket.whiteboardSession) {
        return;
      }

      const tracker = socket.performanceTrackers.get(trackerId);
      if (!tracker) {
        this.logger.warn('Performance tracker not found', { trackerId });
        return;
      }

      const duration = performance.now() - tracker.operationStart;
      const threshold = this.performanceThresholds[tracker.operationType] || 1000;

      // Track performance metric
      await this.analyticsService.trackPerformanceMetric(
        socket.whiteboardSession.whiteboardId,
        {
          type: this.mapOperationTypeToMetricType(tracker.operationType),
          value: duration,
          unit: 'ms',
          threshold,
        },
        socket.whiteboardSession.sessionId,
        {
          ...tracker.context,
          success,
          errorInfo,
          socketId: socket.id,
          userAgent: socket.handshake.headers['user-agent'],
        }
      );

      // Track as event if operation was slow or failed
      if (!success || duration > threshold) {
        const eventData: AnalyticsEvent = {
          type: 'performance',
          action: success ? 'slow_operation' : 'operation_failed',
          targetType: tracker.operationType,
          duration,
          metadata: {
            ...tracker.context,
            threshold,
            success,
            errorInfo,
          },
        };

        await this.analyticsService.trackEvent(
          socket.whiteboardSession.whiteboardId,
          socket.user.id,
          eventData,
          socket.whiteboardSession.sessionId,
          this.getClientMetadata(socket)
        );
      }

      this.logger.debug('Performance tracking completed', { 
        operationType: tracker.operationType,
        duration,
        success,
        whiteboardId: socket.whiteboardSession.whiteboardId,
      });
    } catch (error) {
      this.logger.warn('Failed to end performance tracking', { error, trackerId });
    } finally {
      // Always clean up tracker, even if errors occur
      if (socket.performanceTrackers) {
        socket.performanceTrackers.delete(trackerId);
      }
    }
  }

  /**
   * Track an error event
   */
  async trackError(
    socket: WhiteboardAnalyticsSocket,
    error: Error | Record<string, unknown>,
    context: {
      operation: string;
      targetType?: string;
      targetId?: string;
      metadata?: Record<string, unknown>;
    }
  ): Promise<void> {
    try {
      if (!socket.whiteboardSession) {
        return;
      }

      const errorInfo = error instanceof Error ? {
        message: error.message,
        name: error.name,
        stack: error.stack,
      } : error;

      const eventData: AnalyticsEvent = {
        type: 'error',
        action: 'error_occurred',
        targetType: context.targetType || 'unknown',
        targetId: context.targetId,
        metadata: {
          operation: context.operation,
          errorInfo,
          ...context.metadata,
          socketId: socket.id,
          timestamp: Date.now(),
        },
      };

      await this.analyticsService.trackEvent(
        socket.whiteboardSession.whiteboardId,
        socket.user.id,
        eventData,
        socket.whiteboardSession.sessionId,
        this.getClientMetadata(socket)
      );

      this.logger.debug('Error event tracked', { 
        operation: context.operation,
        whiteboardId: socket.whiteboardSession.whiteboardId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    } catch (analyticsError) {
      this.logger.warn('Failed to track error event', { 
        error: analyticsError, 
        originalError: error,
        operation: context.operation,
      });
    }
  }

  /**
   * Start session analytics when user joins whiteboard
   */
  async startSessionAnalytics(socket: WhiteboardAnalyticsSocket): Promise<void> {
    try {
      if (!socket.whiteboardSession) {
        this.logger.warn('Cannot start session analytics: no whiteboard session');
        return;
      }

      await this.analyticsService.startSessionAnalytics(
        socket.whiteboardSession.sessionId,
        socket.whiteboardSession.whiteboardId,
        socket.user.id
      );

      this.logger.debug('Session analytics started', { 
        sessionId: socket.whiteboardSession.sessionId,
        whiteboardId: socket.whiteboardSession.whiteboardId,
        userId: socket.user.id,
      });
    } catch (error) {
      this.logger.warn('Failed to start session analytics', { error, socketId: socket.id });
    }
  }

  /**
   * Update session analytics with new metrics
   */
  async updateSessionAnalytics(
    socket: WhiteboardAnalyticsSocket,
    updates: {
      totalActions?: number;
      elementsCreated?: number;
      elementsModified?: number;
      elementsDeleted?: number;
      commentsCreated?: number;
      toolsUsed?: string[];
      collaborationScore?: number;
      errorCount?: number;
    }
  ): Promise<void> {
    try {
      if (!socket.whiteboardSession) {
        return;
      }

      await this.analyticsService.updateSessionAnalytics(
        socket.whiteboardSession.sessionId,
        updates
      );

      this.logger.debug('Session analytics updated', { 
        sessionId: socket.whiteboardSession.sessionId,
        updates,
      });
    } catch (error) {
      this.logger.warn('Failed to update session analytics', { error, socketId: socket.id });
    }
  }

  /**
   * Handle socket disconnect and end session analytics
   */
  private async handleSocketDisconnect(
    socket: WhiteboardAnalyticsSocket,
    reason: string
  ): Promise<void> {
    try {
      if (!socket.whiteboardSession) {
        return;
      }

      // End any remaining performance trackers with proper cleanup
      if (socket.performanceTrackers) {
        const trackerIds = Array.from(socket.performanceTrackers.keys());
        for (const trackerId of trackerIds) {
          try {
            await this.endPerformanceTracking(socket, trackerId, false, {
              reason: 'socket_disconnect',
              disconnectReason: reason,
            });
          } catch (error) {
            this.logger.warn('Failed to end performance tracker during disconnect', { 
              error, 
              trackerId, 
              socketId: socket.id 
            });
          }
        }
        
        // Force cleanup of any remaining trackers
        socket.performanceTrackers.clear();
      }

      // End session analytics
      await this.analyticsService.endSessionAnalytics(
        socket.whiteboardSession.sessionId,
        reason
      );

      this.logger.debug('Socket disconnect analytics completed', { 
        sessionId: socket.whiteboardSession.sessionId,
        reason,
      });
    } catch (error) {
      this.logger.warn('Failed to handle socket disconnect analytics', { error, socketId: socket.id, reason });
    } finally {
      // Ensure cleanup even if errors occur
      if (socket.performanceTrackers) {
        socket.performanceTrackers.clear();
      }
    }
  }

  /**
   * Get client metadata from socket
   */
  private getClientMetadata(socket: WhiteboardAnalyticsSocket): Record<string, unknown> {
    return {
      userAgent: socket.handshake.headers['user-agent'],
      origin: socket.handshake.headers.origin,
      referer: socket.handshake.headers.referer,
      ip: socket.handshake.address,
      socketId: socket.id,
      userId: socket.user.id,
      connectTime: socket.handshake.time,
    };
  }

  /**
   * Map operation type to performance metric type
   */
  private mapOperationTypeToMetricType(operationType: string): 'load_time' | 'ot_latency' | 'render_time' | 'memory_usage' | 'fps' | 'connection_quality' {
    const mapping: Record<string, any> = {
      canvas_operation: 'render_time',
      ot_transform: 'ot_latency',
      comment_create: 'render_time',
      presence_update: 'connection_quality',
      session_join: 'load_time',
    };

    return mapping[operationType] || 'render_time';
  }
}

/**
 * Helper functions for integrating analytics into existing WebSocket handlers
 */

/**
 * Wrap a WebSocket handler with analytics tracking
 */
export function withAnalytics<T extends any[]>(
  analytics: WhiteboardAnalyticsIntegration,
  operationType: string,
  handler: (socket: WhiteboardAnalyticsSocket, ...args: T) => Promise<void>
) {
  return async (socket: WhiteboardAnalyticsSocket, ...args: T): Promise<void> => {
    const trackerId = analytics.startPerformanceTracking(socket, operationType, {
      args: args.map((arg, index) => ({ [`arg${index}`]: typeof arg === 'object' ? Object.keys(arg) : arg })),
    });

    try {
      await handler(socket, ...args);
      await analytics.endPerformanceTracking(socket, trackerId, true);
    } catch (error) {
      await analytics.endPerformanceTracking(socket, trackerId, false, {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      await analytics.trackError(socket, error instanceof Error ? error : { error }, {
        operation: operationType,
        targetType: 'websocket_handler',
      });
      
      throw error; // Re-throw to maintain original behavior
    }
  };
}

/**
 * Create analytics middleware for socket events
 */
export function createAnalyticsMiddleware(analytics: WhiteboardAnalyticsIntegration) {
  return (eventName: string, trackUserAction: boolean = true) => {
    return (socket: WhiteboardAnalyticsSocket, next: (err?: Error) => void) => {
      if (trackUserAction && socket.whiteboardSession) {
        analytics.trackUserAction(socket, eventName, 'websocket_event', {
          metadata: { eventName },
        }).catch(error => {
          // Log but don't fail the request
          console.warn('Analytics middleware error:', error);
        });
      }
      next();
    };
  };
}

/**
 * Batch analytics updates for high-frequency events
 */
export class AnalyticsBatcher {
  private batches = new Map<string, { events: AnalyticsEvent[]; lastUpdate: number }>();
  private batchTimeout = 1000; // 1 second
  private maxBatchSize = 50;
  private batchProcessingInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    private analytics: WhiteboardAnalyticsIntegration,
    private logger: Logger,
    options?: { batchTimeout?: number; maxBatchSize?: number }
  ) {
    if (options?.batchTimeout) this.batchTimeout = options.batchTimeout;
    if (options?.maxBatchSize) this.maxBatchSize = options.maxBatchSize;

    // Process batches periodically
    this.batchProcessingInterval = setInterval(() => {
      this.processBatches().catch(error => {
        this.logger.warn('Batch processing failed', { error });
      });
    }, this.batchTimeout);
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.batchProcessingInterval) {
      clearInterval(this.batchProcessingInterval);
      this.batchProcessingInterval = null;
    }
    this.batches.clear();
  }

  /**
   * Add event to batch for processing
   */
  addToBatch(
    socket: WhiteboardAnalyticsSocket,
    action: string,
    targetType: string,
    options?: Record<string, unknown>
  ): void {
    if (!socket.whiteboardSession) return;

    const batchKey = `${socket.whiteboardSession.whiteboardId}_${socket.user.id}`;
    const batch = this.batches.get(batchKey) || { events: [], lastUpdate: Date.now() };

    batch.events.push({
      type: 'user_action',
      action,
      targetType,
      metadata: {
        ...options,
        socketId: socket.id,
        timestamp: Date.now(),
      },
    });

    batch.lastUpdate = Date.now();
    this.batches.set(batchKey, batch);

    // Process batch if it's full
    if (batch.events.length >= this.maxBatchSize) {
      this.processBatch(batchKey, batch).catch(error => {
        this.logger.warn('Immediate batch processing failed', { error, batchKey });
      });
    }
  }

  /**
   * Process all pending batches
   */
  private async processBatches(): Promise<void> {
    const now = Date.now();
    const promises: Promise<void>[] = [];

    for (const [batchKey, batch] of this.batches.entries()) {
      if (now - batch.lastUpdate >= this.batchTimeout && batch.events.length > 0) {
        promises.push(this.processBatch(batchKey, batch));
      }
    }

    await Promise.allSettled(promises);
  }

  /**
   * Process a single batch
   */
  private async processBatch(batchKey: string, batch: { events: AnalyticsEvent[]; lastUpdate: number }): Promise<void> {
    try {
      // Group events by type and process them
      const eventGroups = batch.events.reduce((groups, event) => {
        const key = `${event.action}_${event.targetType}`;
        if (!groups[key]) groups[key] = [];
        groups[key].push(event);
        return groups;
      }, {} as Record<string, AnalyticsEvent[]>);

      // Process each group (this could be optimized further with bulk inserts)
      for (const [groupKey, events] of Object.entries(eventGroups)) {
        this.logger.debug('Processing event batch', { 
          batchKey,
          groupKey, 
          eventCount: events.length,
        });
        
        // For now, we'll process events individually
        // In a production system, you might want to implement bulk processing
        for (const event of events) {
          // Extract whiteboard and user info from batch key
          const [whiteboardId, userId] = batchKey.split('_');
          if (whiteboardId && userId) {
            // This would need to be implemented in the analytics service
            // await this.analytics.trackEventBatch(whiteboardId, userId, [event]);
          }
        }
      }

      // Clear processed batch
      this.batches.delete(batchKey);

      this.logger.debug('Batch processed successfully', { 
        batchKey,
        eventCount: batch.events.length,
      });
    } catch (error) {
      this.logger.warn('Failed to process batch', { error, batchKey });
      // Keep the batch for retry, but limit retries
      batch.lastUpdate = Date.now();
    }
  }

  /**
   * Get current batcher statistics
   */
  getStats(): {
    totalBatches: number;
    totalEvents: number;
    isProcessing: boolean;
    oldestBatchAge: number;
  } {
    const now = Date.now();
    let totalEvents = 0;
    let oldestBatchAge = 0;

    for (const batch of this.batches.values()) {
      totalEvents += batch.events.length;
      const batchAge = now - batch.lastUpdate;
      if (batchAge > oldestBatchAge) {
        oldestBatchAge = batchAge;
      }
    }

    return {
      totalBatches: this.batches.size,
      totalEvents,
      isProcessing: this.isProcessing,
      oldestBatchAge,
    };
  }

  /**
   * Clean shutdown - process remaining batches
   */
  async shutdown(): Promise<void> {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }

    // Process any remaining batches
    if (this.batches.size > 0) {
      this.logger.info('Processing remaining batches during shutdown', { 
        batchCount: this.batches.size,
        totalEvents: Array.from(this.batches.values()).reduce((sum, batch) => sum + batch.events.length, 0)
      });
      
      await this.processBatches();
    }

    this.logger.info('Analytics batcher shutdown complete');
  }
}

export default WhiteboardAnalyticsIntegration;