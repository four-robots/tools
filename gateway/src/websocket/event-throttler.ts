/**
 * WebSocket Event Throttling System
 * 
 * Prevents memory leaks and performance issues by throttling high-frequency
 * events, batching similar operations, and implementing backpressure handling.
 */

import { Logger } from '@mcp-tools/core/utils/logger';

interface ThrottleConfig {
  intervalMs: number;
  maxBatchSize?: number;
  maxPendingEvents?: number;
  dropOldest?: boolean;
}

interface PendingEvent {
  eventName: string;
  data: any;
  timestamp: number;
  userId?: string;
  socketId: string;
}

interface ThrottledEventHandler {
  config: ThrottleConfig;
  pendingEvents: PendingEvent[];
  lastEmit: number;
  timer?: NodeJS.Timeout;
  isProcessing: boolean;
}

interface EventBatch {
  eventName: string;
  events: PendingEvent[];
  batchSize: number;
}

export class WebSocketEventThrottler {
  private handlers = new Map<string, ThrottledEventHandler>();
  private logger: Logger;
  private globalEventQueue = new Map<string, PendingEvent[]>();
  private maxGlobalPendingEvents = 10000; // Global limit to prevent memory exhaustion
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    this.logger = new Logger('WebSocketEventThrottler');
    
    // Periodic cleanup of stale events and memory optimization
    this.cleanupInterval = setInterval(() => {
      this.performMaintenanceCleanup();
    }, 30 * 1000); // Every 30 seconds
  }

  /**
   * Register a throttled event handler
   */
  registerHandler(eventName: string, config: ThrottleConfig): void {
    if (this.handlers.has(eventName)) {
      this.logger.warn('Overwriting existing throttled event handler', { eventName });
    }

    const handler: ThrottledEventHandler = {
      config: {
        maxBatchSize: 100,
        maxPendingEvents: 1000,
        dropOldest: true,
        ...config,
      },
      pendingEvents: [],
      lastEmit: 0,
      isProcessing: false,
    };

    this.handlers.set(eventName, handler);
    
    this.logger.debug('Registered throttled event handler', {
      eventName,
      config: handler.config,
    });
  }

  /**
   * Throttle an event with batching and backpressure handling
   */
  throttleEvent(
    eventName: string,
    data: any,
    socketId: string,
    userId?: string
  ): {
    queued: boolean;
    dropped: boolean;
    queueSize: number;
    reason?: string;
  } {
    const handler = this.handlers.get(eventName);
    if (!handler) {
      // No throttling configured - pass through immediately
      return { queued: false, dropped: false, queueSize: 0 };
    }

    const now = Date.now();
    const event: PendingEvent = {
      eventName,
      data,
      timestamp: now,
      userId,
      socketId,
    };

    // Check global event limit to prevent memory exhaustion
    const totalPendingEvents = this.getTotalPendingEvents();
    if (totalPendingEvents >= this.maxGlobalPendingEvents) {
      this.logger.error('Global event queue limit exceeded', {
        totalPendingEvents,
        maxGlobalPendingEvents: this.maxGlobalPendingEvents,
        eventName,
        socketId,
      });
      return {
        queued: false,
        dropped: true,
        queueSize: handler.pendingEvents.length,
        reason: 'GLOBAL_QUEUE_FULL',
      };
    }

    // Check per-handler event limit
    if (handler.pendingEvents.length >= handler.config.maxPendingEvents!) {
      if (handler.config.dropOldest) {
        // Drop oldest event to make room
        const dropped = handler.pendingEvents.shift();
        this.logger.debug('Dropped oldest event due to queue limit', {
          eventName,
          droppedEvent: dropped?.timestamp,
          queueSize: handler.pendingEvents.length,
        });
      } else {
        // Drop current event
        this.logger.warn('Event dropped due to queue limit', {
          eventName,
          queueSize: handler.pendingEvents.length,
          maxPendingEvents: handler.config.maxPendingEvents,
        });
        return {
          queued: false,
          dropped: true,
          queueSize: handler.pendingEvents.length,
          reason: 'HANDLER_QUEUE_FULL',
        };
      }
    }

    // Add event to queue
    handler.pendingEvents.push(event);

    // Deduplicate similar events for specific event types
    this.deduplicateEvents(eventName, handler);

    // Check if we should emit immediately or schedule for later
    const timeSinceLastEmit = now - handler.lastEmit;
    
    if (timeSinceLastEmit >= handler.config.intervalMs) {
      // Emit immediately if enough time has passed
      this.processHandler(eventName, handler);
    } else if (!handler.timer) {
      // Schedule emission for later
      const delay = handler.config.intervalMs - timeSinceLastEmit;
      handler.timer = setTimeout(() => {
        this.processHandler(eventName, handler);
      }, delay);
    }

    return {
      queued: true,
      dropped: false,
      queueSize: handler.pendingEvents.length,
    };
  }

  /**
   * Force immediate processing of a specific event type
   */
  flushEvents(eventName: string): Promise<void> {
    const handler = this.handlers.get(eventName);
    if (!handler || handler.pendingEvents.length === 0) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      if (handler.timer) {
        clearTimeout(handler.timer);
        handler.timer = undefined;
      }
      
      this.processHandler(eventName, handler);
      resolve();
    });
  }

  /**
   * Flush all pending events (for shutdown or emergency)
   */
  flushAllEvents(): Promise<void> {
    const promises = Array.from(this.handlers.keys()).map(eventName => 
      this.flushEvents(eventName)
    );
    return Promise.all(promises).then(() => {});
  }

  /**
   * Get statistics about current throttling state
   */
  getStatistics(): {
    totalHandlers: number;
    totalPendingEvents: number;
    handlerStats: Array<{
      eventName: string;
      pendingEvents: number;
      lastEmit: number;
      isProcessing: boolean;
      config: ThrottleConfig;
    }>;
  } {
    const handlerStats = Array.from(this.handlers.entries()).map(([eventName, handler]) => ({
      eventName,
      pendingEvents: handler.pendingEvents.length,
      lastEmit: handler.lastEmit,
      isProcessing: handler.isProcessing,
      config: handler.config,
    }));

    return {
      totalHandlers: this.handlers.size,
      totalPendingEvents: this.getTotalPendingEvents(),
      handlerStats,
    };
  }

  /**
   * Clear all handlers and pending events
   */
  destroy(): void {
    // Clear all timers
    for (const handler of this.handlers.values()) {
      if (handler.timer) {
        clearTimeout(handler.timer);
      }
    }
    
    // Clear cleanup interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    // Clear all data
    this.handlers.clear();
    this.globalEventQueue.clear();
    
    this.logger.info('Event throttler destroyed');
  }

  /**
   * Process a throttled event handler
   */
  private processHandler(eventName: string, handler: ThrottledEventHandler): void {
    if (handler.isProcessing || handler.pendingEvents.length === 0) {
      return;
    }

    handler.isProcessing = true;
    handler.lastEmit = Date.now();

    // Clear the timer since we're processing now
    if (handler.timer) {
      clearTimeout(handler.timer);
      handler.timer = undefined;
    }

    try {
      // Create batches for processing
      const batches = this.createEventBatches(eventName, handler);
      
      // Process each batch
      for (const batch of batches) {
        this.emitEventBatch(batch);
      }

      // Clear processed events
      handler.pendingEvents = [];

      this.logger.debug('Processed throttled events', {
        eventName,
        batchCount: batches.length,
        totalEvents: batches.reduce((sum, batch) => sum + batch.batchSize, 0),
      });

    } catch (error) {
      this.logger.error('Error processing throttled events', {
        error: error instanceof Error ? error.message : String(error),
        eventName,
        pendingCount: handler.pendingEvents.length,
      });
    } finally {
      handler.isProcessing = false;
    }
  }

  /**
   * Create optimized batches from pending events
   */
  private createEventBatches(eventName: string, handler: ThrottledEventHandler): EventBatch[] {
    const batches: EventBatch[] = [];
    const maxBatchSize = handler.config.maxBatchSize || 100;
    
    // Group events by similar characteristics for better batching
    const eventGroups = this.groupEventsByCharacteristics(handler.pendingEvents);
    
    for (const [groupKey, events] of eventGroups.entries()) {
      // Split large groups into smaller batches
      for (let i = 0; i < events.length; i += maxBatchSize) {
        const batchEvents = events.slice(i, i + maxBatchSize);
        batches.push({
          eventName,
          events: batchEvents,
          batchSize: batchEvents.length,
        });
      }
    }
    
    return batches;
  }

  /**
   * Group events by characteristics for better batching
   */
  private groupEventsByCharacteristics(events: PendingEvent[]): Map<string, PendingEvent[]> {
    const groups = new Map<string, PendingEvent[]>();
    
    for (const event of events) {
      // Create a grouping key based on event characteristics
      let groupKey = event.eventName;
      
      // Add user-specific grouping for user-scoped events
      if (event.userId) {
        groupKey += `_user_${event.userId}`;
      }
      
      // Add data-specific grouping for certain event types
      if (event.eventName.includes('cursor') && event.data?.whiteboardId) {
        groupKey += `_wb_${event.data.whiteboardId}`;
      }
      
      if (!groups.has(groupKey)) {
        groups.set(groupKey, []);
      }
      groups.get(groupKey)!.push(event);
    }
    
    return groups;
  }

  /**
   * Emit a batch of events (to be overridden by implementation)
   */
  private emitEventBatch(batch: EventBatch): void {
    // This is a placeholder - in real implementation, this would emit to WebSocket
    this.logger.debug('Would emit event batch', {
      eventName: batch.eventName,
      batchSize: batch.batchSize,
    });
  }

  /**
   * Remove duplicate events to reduce memory usage
   */
  private deduplicateEvents(eventName: string, handler: ThrottledEventHandler): void {
    // For certain event types, keep only the latest event per user/socket
    const deduplicateEventTypes = [
      'whiteboard:cursor_move',
      'whiteboard:presence',
      'whiteboard:comment_typing',
      'whiteboard:selection_change',
    ];
    
    if (!deduplicateEventTypes.includes(eventName)) {
      return;
    }
    
    // Keep only the latest event per socket for these event types
    const latestBySocket = new Map<string, PendingEvent>();
    
    for (const event of handler.pendingEvents) {
      const key = event.socketId + (event.userId ? `_${event.userId}` : '');
      const existing = latestBySocket.get(key);
      
      if (!existing || event.timestamp > existing.timestamp) {
        latestBySocket.set(key, event);
      }
    }
    
    const originalLength = handler.pendingEvents.length;
    handler.pendingEvents = Array.from(latestBySocket.values());
    
    if (handler.pendingEvents.length < originalLength) {
      this.logger.debug('Deduplicated events', {
        eventName,
        originalCount: originalLength,
        deduplicatedCount: handler.pendingEvents.length,
        removed: originalLength - handler.pendingEvents.length,
      });
    }
  }

  /**
   * Get total pending events across all handlers
   */
  private getTotalPendingEvents(): number {
    return Array.from(this.handlers.values())
      .reduce((total, handler) => total + handler.pendingEvents.length, 0);
  }

  /**
   * Perform periodic maintenance cleanup
   */
  private performMaintenanceCleanup(): void {
    const now = Date.now();
    const maxAge = 5 * 60 * 1000; // 5 minutes
    let cleanedEvents = 0;

    for (const [eventName, handler] of this.handlers.entries()) {
      const originalLength = handler.pendingEvents.length;
      
      // Remove events older than maxAge
      handler.pendingEvents = handler.pendingEvents.filter(event => 
        now - event.timestamp < maxAge
      );
      
      const cleaned = originalLength - handler.pendingEvents.length;
      cleanedEvents += cleaned;
      
      if (cleaned > 0) {
        this.logger.debug('Cleaned stale events', {
          eventName,
          cleanedCount: cleaned,
          remainingCount: handler.pendingEvents.length,
        });
      }
    }

    if (cleanedEvents > 0) {
      this.logger.info('Maintenance cleanup completed', {
        cleanedEvents,
        totalPendingEvents: this.getTotalPendingEvents(),
      });
    }
  }
}

// Global throttler instance
let globalEventThrottler: WebSocketEventThrottler | null = null;

export function getGlobalEventThrottler(): WebSocketEventThrottler {
  if (!globalEventThrottler) {
    globalEventThrottler = new WebSocketEventThrottler();
    
    // Register common throttled events
    globalEventThrottler.registerHandler('whiteboard:cursor_move', {
      intervalMs: 33, // ~30 FPS
      maxBatchSize: 50,
      maxPendingEvents: 200,
      dropOldest: true,
    });
    
    globalEventThrottler.registerHandler('whiteboard:presence', {
      intervalMs: 500, // 2 times per second
      maxBatchSize: 25,
      maxPendingEvents: 100,
      dropOldest: true,
    });
    
    globalEventThrottler.registerHandler('whiteboard:comment_typing', {
      intervalMs: 200, // 5 times per second
      maxBatchSize: 10,
      maxPendingEvents: 50,
      dropOldest: true,
    });
    
    globalEventThrottler.registerHandler('whiteboard:selection_change', {
      intervalMs: 100, // 10 times per second
      maxBatchSize: 20,
      maxPendingEvents: 100,
      dropOldest: true,
    });
  }
  
  return globalEventThrottler;
}

export function destroyGlobalEventThrottler(): void {
  if (globalEventThrottler) {
    globalEventThrottler.destroy();
    globalEventThrottler = null;
  }
}