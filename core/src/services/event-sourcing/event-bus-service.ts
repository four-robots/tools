import { EventEmitter } from 'events';
import { DomainEvent, EventHandler, EventSubscription } from '../../shared/types/event-sourcing';
import { CollaborationEvent, COLLABORATION_EVENT_TYPES } from '../../shared/types/collaboration-events';
import { logger } from '../../utils/logger';
import { Pool } from 'pg';

export interface EventBusConfig {
  maxListeners: number;
  retryAttempts: number;
  retryDelayMs: number;
  enableDuplicateDetection: boolean;
  eventTimeoutMs: number;
}

export class EventBus extends EventEmitter {
  private readonly subscriptions = new Map<string, EventSubscription>();
  private readonly handlerMap = new Map<string, EventHandler<any>[]>();
  private readonly recentEvents = new Set<string>(); // For duplicate detection
  private readonly config: EventBusConfig;
  private readonly cleanupInterval: NodeJS.Timeout;

  constructor(
    private readonly pool: Pool,
    config: Partial<EventBusConfig> = {}
  ) {
    super();
    
    this.config = {
      maxListeners: 100,
      retryAttempts: 3,
      retryDelayMs: 1000,
      enableDuplicateDetection: true,
      eventTimeoutMs: 30000,
      ...config
    };

    this.setMaxListeners(this.config.maxListeners);

    // Clean up recent events periodically to prevent memory leaks
    this.cleanupInterval = setInterval(() => {
      this.recentEvents.clear();
    }, this.config.eventTimeoutMs);

    // Initialize built-in event logging
    this.setupDefaultHandlers();
  }

  async publishEvent(event: DomainEvent): Promise<void> {
    try {
      // Duplicate detection
      if (this.config.enableDuplicateDetection) {
        const eventHash = this.createEventHash(event);
        if (this.recentEvents.has(eventHash)) {
          logger.warn('Duplicate event detected, skipping', { 
            eventId: event.id, 
            eventType: event.eventType 
          });
          return;
        }
        this.recentEvents.add(eventHash);
      }

      // Emit to local handlers
      this.emit(event.eventType, event);
      this.emit('*', event); // Wildcard subscription

      // Emit to stream-specific handlers
      this.emit(`stream:${event.streamId}`, event);

      // Emit to tenant-specific handlers if tenant is specified
      if (event.tenantId) {
        this.emit(`tenant:${event.tenantId}`, event);
      }

      logger.debug('Event published successfully', {
        eventId: event.id,
        eventType: event.eventType,
        streamId: event.streamId,
        correlationId: event.correlationId
      });

    } catch (error) {
      logger.error('Failed to publish event', {
        eventId: event.id,
        eventType: event.eventType,
        error: error.message
      });
      throw error;
    }
  }

  async publishEvents(events: DomainEvent[]): Promise<void> {
    const promises = events.map(event => this.publishEvent(event));
    await Promise.all(promises);
  }

  subscribe<T extends DomainEvent>(
    eventType: string, 
    handler: EventHandler<T>,
    options?: {
      subscriptionName?: string;
      filter?: (event: T) => boolean;
      retry?: boolean;
    }
  ): string {
    const subscriptionId = options?.subscriptionName || this.generateSubscriptionId();
    
    // Wrap handler with error handling and retries
    const wrappedHandler = this.wrapHandler(handler, options);
    
    // Add to handler map for management
    if (!this.handlerMap.has(eventType)) {
      this.handlerMap.set(eventType, []);
    }
    this.handlerMap.get(eventType)!.push(wrappedHandler);

    // Subscribe to EventEmitter
    this.on(eventType, wrappedHandler);

    // Store subscription metadata
    const subscription: EventSubscription & { handler: EventHandler<any> } = {
      id: subscriptionId,
      subscriptionName: subscriptionId,
      eventTypes: [eventType],
      streamFilter: options?.filter ? { hasFilter: true } : {},
      handlerConfig: { retry: options?.retry || true },
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      handler: wrappedHandler
    };

    this.subscriptions.set(subscriptionId, subscription);

    logger.info('Event subscription created', {
      subscriptionId,
      eventType,
      handlerName: handler.name || 'anonymous'
    });

    return subscriptionId;
  }

  subscribeToStream(
    streamId: string, 
    handler: EventHandler<DomainEvent>,
    options?: {
      subscriptionName?: string;
      fromVersion?: number;
    }
  ): string {
    const subscriptionId = options?.subscriptionName || this.generateSubscriptionId();
    const wrappedHandler = this.wrapHandler(handler);

    this.on(`stream:${streamId}`, wrappedHandler);

    const subscription: EventSubscription & { handler: EventHandler<any> } = {
      id: subscriptionId,
      subscriptionName: subscriptionId,
      eventTypes: ['stream:*'],
      streamFilter: { streamId },
      handlerConfig: { fromVersion: options?.fromVersion },
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      handler: wrappedHandler
    };

    this.subscriptions.set(subscriptionId, subscription);

    logger.info('Stream subscription created', {
      subscriptionId,
      streamId,
      fromVersion: options?.fromVersion
    });

    return subscriptionId;
  }

  subscribeToAll(
    handler: EventHandler<DomainEvent>,
    options?: {
      subscriptionName?: string;
      eventTypeFilter?: string[];
    }
  ): string {
    const subscriptionId = options?.subscriptionName || this.generateSubscriptionId();
    const wrappedHandler = options?.eventTypeFilter
      ? this.wrapHandlerWithTypeFilter(handler, options.eventTypeFilter)
      : this.wrapHandler(handler);

    this.on('*', wrappedHandler);

    const subscription: EventSubscription & { handler: EventHandler<any> } = {
      id: subscriptionId,
      subscriptionName: subscriptionId,
      eventTypes: options?.eventTypeFilter || ['*'],
      streamFilter: {},
      handlerConfig: {},
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      handler: wrappedHandler
    };

    this.subscriptions.set(subscriptionId, subscription);

    logger.info('Global subscription created', {
      subscriptionId,
      eventTypeFilter: options?.eventTypeFilter
    });

    return subscriptionId;
  }

  unsubscribe(subscriptionId: string): boolean {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) {
      return false;
    }

    const targetHandler = (subscription as any).handler;

    // Remove from EventEmitter
    for (const eventType of subscription.eventTypes) {
      const handlers = this.handlerMap.get(eventType);
      if (handlers) {
        this.removeAllListeners(eventType);
        // Re-add all handlers except the one being unsubscribed
        handlers.forEach(handler => {
          if (handler !== targetHandler) {
            this.on(eventType, handler);
          }
        });
        // Remove the target handler from the handlerMap array
        this.handlerMap.set(eventType, handlers.filter(handler => handler !== targetHandler));
      }
    }

    // Remove from maps
    this.subscriptions.delete(subscriptionId);

    logger.info('Subscription removed', { subscriptionId });
    return true;
  }

  getActiveSubscriptions(): EventSubscription[] {
    return Array.from(this.subscriptions.values()).filter(sub => sub.isActive);
  }

  // Real-time event streaming via async iterator
  async *streamEvents(
    streamId?: string, 
    fromVersion?: number
  ): AsyncIterableIterator<DomainEvent> {
    const eventQueue: DomainEvent[] = [];
    let resolveNext: ((event: DomainEvent) => void) | null = null;

    const handler = (event: DomainEvent) => {
      if (resolveNext) {
        resolveNext(event);
        resolveNext = null;
      } else {
        eventQueue.push(event);
      }
    };

    const eventPattern = streamId ? `stream:${streamId}` : '*';
    this.on(eventPattern, handler);

    try {
      while (true) {
        if (eventQueue.length > 0) {
          yield eventQueue.shift()!;
        } else {
          yield await new Promise<DomainEvent>((resolve) => {
            resolveNext = resolve;
          });
        }
      }
    } finally {
      this.removeListener(eventPattern, handler);
    }
  }

  // Event replay functionality
  async replayEvents(
    streamId: string,
    fromVersion: number = 0,
    toVersion?: number
  ): Promise<void> {
    try {
      const client = await this.pool.connect();
      
      let query = `
        SELECT id, stream_id, event_type, event_version, event_data, metadata,
               timestamp, sequence_number, causation_id, correlation_id, tenant_id
        FROM events 
        WHERE stream_id = $1 AND sequence_number >= $2
      `;
      
      const params: any[] = [streamId, fromVersion];

      if (toVersion !== undefined) {
        query += ' AND sequence_number <= $3';
        params.push(toVersion);
      }

      query += ' ORDER BY sequence_number ASC';

      const result = await client.query(query, params);
      client.release();

      for (const row of result.rows) {
        const event: DomainEvent = {
          id: row.id,
          streamId: row.stream_id,
          eventType: row.event_type,
          eventVersion: row.event_version,
          eventData: JSON.parse(row.event_data),
          metadata: JSON.parse(row.metadata),
          timestamp: new Date(row.timestamp),
          sequenceNumber: parseInt(row.sequence_number),
          causationId: row.causation_id,
          correlationId: row.correlation_id,
          tenantId: row.tenant_id
        };

        await this.publishEvent(event);
      }

      logger.info('Event replay completed', {
        streamId,
        fromVersion,
        toVersion,
        eventCount: result.rows.length
      });

    } catch (error) {
      logger.error('Event replay failed', {
        streamId,
        fromVersion,
        toVersion,
        error: error.message
      });
      throw error;
    }
  }

  async close(): Promise<void> {
    clearInterval(this.cleanupInterval);
    this.removeAllListeners();
    this.subscriptions.clear();
    this.handlerMap.clear();
    this.recentEvents.clear();
  }

  private wrapHandler<T extends DomainEvent>(
    handler: EventHandler<T>,
    options?: {
      filter?: (event: T) => boolean;
      retry?: boolean;
    }
  ): EventHandler<T> {
    return async (event: T) => {
      try {
        // Apply filter if provided
        if (options?.filter && !options.filter(event)) {
          return;
        }

        await this.executeWithRetry(
          () => handler(event),
          options?.retry !== false ? this.config.retryAttempts : 0,
          event
        );

      } catch (error) {
        logger.error('Event handler failed after retries', {
          eventId: event.id,
          eventType: event.eventType,
          handlerName: handler.name || 'anonymous',
          error: error.message
        });

        // Emit error event for monitoring
        this.emit('error', {
          error,
          event,
          handlerName: handler.name || 'anonymous'
        });
      }
    };
  }

  private wrapHandlerWithTypeFilter(
    handler: EventHandler<DomainEvent>,
    allowedTypes: string[]
  ): EventHandler<DomainEvent> {
    return async (event: DomainEvent) => {
      if (allowedTypes.includes(event.eventType)) {
        await handler(event);
      }
    };
  }

  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number,
    event: DomainEvent
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        
        if (attempt < maxRetries) {
          const delay = this.config.retryDelayMs * Math.pow(2, attempt); // Exponential backoff
          logger.warn(`Event handler retry ${attempt + 1}/${maxRetries}`, {
            eventId: event.id,
            eventType: event.eventType,
            delay,
            error: error.message
          });
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError;
  }

  private createEventHash(event: DomainEvent): string {
    return `${event.id}:${event.eventType}:${event.timestamp.getTime()}`;
  }

  private generateSubscriptionId(): string {
    return `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private setupDefaultHandlers(): void {
    // Log all collaboration events
    this.subscribe('collaboration.*', async (event: CollaborationEvent) => {
      logger.info('Collaboration event processed', {
        eventType: event.eventType,
        sessionId: event.metadata.sessionId,
        workspaceId: event.metadata.workspaceId,
        userId: event.metadata.userId
      });
    });

    // Handle critical events
    this.subscribe(COLLABORATION_EVENT_TYPES.CONFLICT_DETECTED, async (event: any) => {
      logger.warn('Conflict detected', {
        conflictId: event.eventData.conflictId,
        sessionId: event.eventData.sessionId,
        severity: event.eventData.severity
      });
    });

    // Monitor session lifecycle
    this.subscribe(COLLABORATION_EVENT_TYPES.SESSION_STARTED, async (event: any) => {
      logger.info('Collaboration session started', {
        sessionId: event.eventData.sessionId,
        sessionType: event.eventData.sessionType,
        initiator: event.eventData.initiatorId
      });
    });

    this.subscribe(COLLABORATION_EVENT_TYPES.SESSION_ENDED, async (event: any) => {
      logger.info('Collaboration session ended', {
        sessionId: event.eventData.sessionId,
        duration: event.eventData.duration,
        reason: event.eventData.reason,
        summary: event.eventData.summary
      });
    });
  }
}