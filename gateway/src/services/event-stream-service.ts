import { WebSocket } from 'ws';
import { DomainEvent, EventBus } from '@mcp-tools/core';
import { 
  CollaborationEvent, 
  COLLABORATION_EVENT_TYPES 
} from '@mcp-tools/core';
import { logger } from '../utils/logger';
import { randomUUID } from 'crypto';

interface BackpressureStats {
  totalClientsWithBackpressure: number;
  slowConsumerCount: number;
  droppedEventCount: number;
  averageBufferSize: number;
  maxBufferSize: number;
}

class BackpressureHandler {
  private static readonly MAX_BUFFER_SIZE = 1000;
  private static readonly SLOW_CONSUMER_THRESHOLD = 100; // events
  private static readonly ERROR_THRESHOLD = 5; // consecutive errors
  private static readonly HEARTBEAT_TIMEOUT = 60000; // 1 minute
  private static readonly CRITICAL_BUFFER_SIZE = 800; // 80% of max buffer

  static handleSlowConsumer(client: WebSocketClient): void {
    if (client.buffer.length > this.SLOW_CONSUMER_THRESHOLD) {
      client.isSlowConsumer = true;
      
      // Drop oldest events to prevent memory leak
      const eventsToRetain = Math.min(client.buffer.length, this.MAX_BUFFER_SIZE);
      const droppedCount = client.buffer.length - eventsToRetain;
      client.buffer = client.buffer.slice(-eventsToRetain);
      
      logger.warn('Client marked as slow consumer', { 
        clientId: client.id,
        userId: client.userId, 
        bufferSize: client.buffer.length,
        eventsDropped: droppedCount,
        consecutiveErrors: client.consecutiveErrors
      });
    }
  }

  static shouldDropEvent(client: WebSocketClient): boolean {
    return client.isSlowConsumer && client.buffer.length >= this.MAX_BUFFER_SIZE;
  }

  static isClientHealthy(client: WebSocketClient): boolean {
    const now = Date.now();
    const heartbeatTimeout = now - client.lastHeartbeat.getTime() > this.HEARTBEAT_TIMEOUT;
    const tooManyErrors = client.consecutiveErrors >= this.ERROR_THRESHOLD;
    const socketClosed = client.socket.readyState !== WebSocket.OPEN;
    
    return !heartbeatTimeout && !tooManyErrors && !socketClosed;
  }

  static shouldThrottleClient(client: WebSocketClient): boolean {
    return client.buffer.length > this.CRITICAL_BUFFER_SIZE;
  }

  static calculateBackpressureDelay(bufferSize: number): number {
    if (bufferSize < this.SLOW_CONSUMER_THRESHOLD) return 0;
    if (bufferSize < this.CRITICAL_BUFFER_SIZE) return 100; // 100ms delay
    return 500; // 500ms delay for critical backpressure
  }

  static getClientStats(client: WebSocketClient): {
    isHealthy: boolean;
    isSlowConsumer: boolean;
    bufferUtilization: number;
    shouldThrottle: boolean;
  } {
    return {
      isHealthy: this.isClientHealthy(client),
      isSlowConsumer: client.isSlowConsumer,
      bufferUtilization: client.buffer.length / this.MAX_BUFFER_SIZE,
      shouldThrottle: this.shouldThrottleClient(client)
    };
  }

  static generateBackpressureStats(clients: Map<string, WebSocketClient>): BackpressureStats {
    let totalClientsWithBackpressure = 0;
    let slowConsumerCount = 0;
    let totalBufferSize = 0;
    let maxBufferSize = 0;

    for (const client of clients.values()) {
      if (client.buffer.length > 0) {
        totalClientsWithBackpressure++;
      }
      if (client.isSlowConsumer) {
        slowConsumerCount++;
      }
      totalBufferSize += client.buffer.length;
      maxBufferSize = Math.max(maxBufferSize, client.buffer.length);
    }

    return {
      totalClientsWithBackpressure,
      slowConsumerCount,
      droppedEventCount: 0, // This would be tracked separately
      averageBufferSize: clients.size > 0 ? totalBufferSize / clients.size : 0,
      maxBufferSize
    };
  }
}

export interface EventStreamConfig {
  maxConnectionsPerUser: number;
  heartbeatIntervalMs: number;
  eventBufferSize: number;
  compressionEnabled: boolean;
  authenticationRequired: boolean;
}

export interface WebSocketClient {
  id: string;
  userId: string;
  workspaceId?: string;
  sessionId?: string;
  socket: WebSocket;
  subscriptions: Set<string>;
  lastActivity: Date;
  buffer: DomainEvent[];
  maxBufferSize: number;
  isSlowConsumer: boolean;
  lastHeartbeat: Date;
  consecutiveErrors: number;
  metadata: {
    userAgent?: string;
    ipAddress?: string;
    connectionTime: Date;
    messagesReceived: number;
    messagesSent: number;
    bytesReceived: number;
    bytesSent: number;
  };
}

export interface EventFilter {
  eventTypes?: string[];
  streamIds?: string[];
  userId?: string;
  workspaceId?: string;
  sessionId?: string;
  customFilter?: (event: DomainEvent) => boolean;
}

export interface StreamSubscription {
  subscriptionId: string;
  clientId: string;
  filter: EventFilter;
  active: boolean;
  createdAt: Date;
}

export class EventStreamService {
  private readonly clients = new Map<string, WebSocketClient>();
  private readonly userConnections = new Map<string, Set<string>>();
  private readonly subscriptions = new Map<string, StreamSubscription>();
  private readonly eventBuffer = new Map<string, DomainEvent[]>();
  private readonly heartbeatInterval: NodeJS.Timeout;
  private readonly cleanupInterval: NodeJS.Timeout;
  private readonly config: EventStreamConfig;

  constructor(
    private readonly eventBus: EventBus,
    config: Partial<EventStreamConfig> = {}
  ) {
    this.config = {
      maxConnectionsPerUser: 5,
      heartbeatIntervalMs: 30000,
      eventBufferSize: 100,
      compressionEnabled: true,
      authenticationRequired: true,
      ...config
    };

    // Subscribe to all events for streaming
    this.subscribeToEvents();

    // Start heartbeat and cleanup intervals
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeats();
    }, this.config.heartbeatIntervalMs);

    this.cleanupInterval = setInterval(() => {
      this.cleanupInactiveClients();
    }, 5 * 60 * 1000); // Every 5 minutes
  }

  async addClient(
    socket: WebSocket,
    userId: string,
    metadata: {
      userAgent?: string;
      ipAddress?: string;
      workspaceId?: string;
      sessionId?: string;
    } = {}
  ): Promise<string> {
    const clientId = randomUUID();

    // Check connection limit per user
    const existingConnections = this.userConnections.get(userId) || new Set();
    if (existingConnections.size >= this.config.maxConnectionsPerUser) {
      socket.close(1008, 'Connection limit exceeded');
      throw new Error(`Connection limit exceeded for user ${userId}`);
    }

    const client: WebSocketClient = {
      id: clientId,
      userId,
      workspaceId: metadata.workspaceId,
      sessionId: metadata.sessionId,
      socket,
      subscriptions: new Set(),
      lastActivity: new Date(),
      buffer: [],
      maxBufferSize: 1000,
      isSlowConsumer: false,
      lastHeartbeat: new Date(),
      consecutiveErrors: 0,
      metadata: {
        userAgent: metadata.userAgent,
        ipAddress: metadata.ipAddress,
        connectionTime: new Date(),
        messagesReceived: 0,
        messagesSent: 0,
        bytesReceived: 0,
        bytesSent: 0
      }
    };

    this.clients.set(clientId, client);
    
    // Track user connections
    if (!this.userConnections.has(userId)) {
      this.userConnections.set(userId, new Set());
    }
    this.userConnections.get(userId)!.add(clientId);

    // Set up socket event handlers
    this.setupSocketHandlers(client);

    // Send welcome message
    this.sendToClient(clientId, {
      type: 'connection_established',
      data: {
        clientId,
        serverTime: new Date().toISOString(),
        config: {
          heartbeatInterval: this.config.heartbeatIntervalMs,
          compressionEnabled: this.config.compressionEnabled
        }
      }
    });

    logger.info(`WebSocket client connected`, {
      clientId,
      userId,
      workspaceId: metadata.workspaceId,
      sessionId: metadata.sessionId,
      userAgent: metadata.userAgent,
      totalClients: this.clients.size
    });

    return clientId;
  }

  removeClient(clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client) {
      return;
    }

    // Remove all subscriptions for this client
    for (const subscriptionId of client.subscriptions) {
      this.subscriptions.delete(subscriptionId);
    }

    // Remove from user connections
    const userConnections = this.userConnections.get(client.userId);
    if (userConnections) {
      userConnections.delete(clientId);
      if (userConnections.size === 0) {
        this.userConnections.delete(client.userId);
      }
    }

    // Remove client
    this.clients.delete(clientId);

    // Close socket if still open
    if (client.socket.readyState === WebSocket.OPEN) {
      client.socket.close();
    }

    logger.info(`WebSocket client disconnected`, {
      clientId,
      userId: client.userId,
      connectionDuration: Date.now() - client.metadata.connectionTime.getTime(),
      totalClients: this.clients.size
    });
  }

  subscribeToStream(clientId: string, filter: EventFilter): string {
    const client = this.clients.get(clientId);
    if (!client) {
      throw new Error(`Client not found: ${clientId}`);
    }

    const subscriptionId = randomUUID();
    const subscription: StreamSubscription = {
      subscriptionId,
      clientId,
      filter,
      active: true,
      createdAt: new Date()
    };

    this.subscriptions.set(subscriptionId, subscription);
    client.subscriptions.add(subscriptionId);

    // Send buffered events that match the filter
    const bufferedEvents = this.getBufferedEvents(filter);
    if (bufferedEvents.length > 0) {
      this.sendToClient(clientId, {
        type: 'buffered_events',
        data: {
          subscriptionId,
          events: bufferedEvents.map(event => this.transformEventForClient(event, clientId))
        }
      });
    }

    this.sendToClient(clientId, {
      type: 'subscription_created',
      data: {
        subscriptionId,
        filter,
        bufferedEventCount: bufferedEvents.length
      }
    });

    logger.info(`Created event stream subscription`, {
      subscriptionId,
      clientId,
      userId: client.userId,
      filter
    });

    return subscriptionId;
  }

  unsubscribeFromStream(clientId: string, subscriptionId: string): boolean {
    const client = this.clients.get(clientId);
    const subscription = this.subscriptions.get(subscriptionId);

    if (!client || !subscription || subscription.clientId !== clientId) {
      return false;
    }

    subscription.active = false;
    client.subscriptions.delete(subscriptionId);
    this.subscriptions.delete(subscriptionId);

    this.sendToClient(clientId, {
      type: 'subscription_removed',
      data: { subscriptionId }
    });

    logger.info(`Removed event stream subscription`, {
      subscriptionId,
      clientId,
      userId: client.userId
    });

    return true;
  }

  streamSessionEvents(sessionId: string, clientId: string): string {
    return this.subscribeToStream(clientId, {
      sessionId,
      eventTypes: Object.values(COLLABORATION_EVENT_TYPES)
    });
  }

  streamUserEvents(userId: string, clientId: string): string {
    return this.subscribeToStream(clientId, {
      userId,
      eventTypes: Object.values(COLLABORATION_EVENT_TYPES)
    });
  }

  streamWorkspaceEvents(workspaceId: string, clientId: string): string {
    return this.subscribeToStream(clientId, {
      workspaceId,
      eventTypes: Object.values(COLLABORATION_EVENT_TYPES)
    });
  }

  // Stream events to all relevant clients
  private async streamEvent(event: DomainEvent): Promise<void> {
    try {
      // Buffer the event
      this.bufferEvent(event);

      // Find matching subscriptions
      const matchingSubscriptions = this.findMatchingSubscriptions(event);

      // Group by client to avoid duplicate sends
      const clientEvents = new Map<string, { subscriptions: string[]; event: DomainEvent }>();

      for (const subscription of matchingSubscriptions) {
        const client = this.clients.get(subscription.clientId);
        if (!client || client.socket.readyState !== WebSocket.OPEN) {
          continue;
        }

        if (!clientEvents.has(subscription.clientId)) {
          clientEvents.set(subscription.clientId, {
            subscriptions: [],
            event
          });
        }
        
        clientEvents.get(subscription.clientId)!.subscriptions.push(subscription.subscriptionId);
      }

      // Send to clients with backpressure handling
      for (const [clientId, { subscriptions, event }] of clientEvents) {
        const client = this.clients.get(clientId)!;
        
        // Check if we should drop this event due to backpressure
        if (BackpressureHandler.shouldDropEvent(client)) {
          logger.warn('Dropping event due to client backpressure', {
            clientId,
            userId: client.userId,
            eventType: event.eventType,
            bufferSize: client.buffer.length
          });
          continue;
        }
        
        const transformedEvent = this.transformEventForClient(event, clientId);
        const message = {
          type: 'event_stream',
          data: {
            subscriptions,
            event: transformedEvent,
            timestamp: new Date().toISOString()
          }
        };
        
        // Apply backpressure delay if necessary
        const delay = BackpressureHandler.calculateBackpressureDelay(client.buffer.length);
        if (delay > 0) {
          setTimeout(() => {
            this.sendToClientWithBackpressure(clientId, message);
          }, delay);
        } else {
          this.sendToClientWithBackpressure(clientId, message);
        }
      }

    } catch (error) {
      logger.error(`Failed to stream event`, {
        eventType: event.eventType,
        eventId: event.id,
        error: error.message
      });
    }
  }

  private setupSocketHandlers(client: WebSocketClient): void {
    const { socket, id: clientId } = client;

    socket.on('message', (data) => {
      try {
        client.lastActivity = new Date();
        client.metadata.messagesReceived++;
        client.metadata.bytesReceived += data.length;
        
        const message = JSON.parse(data.toString());
        this.handleClientMessage(clientId, message);
      } catch (error) {
        client.consecutiveErrors++;
        logger.error(`Invalid message from client ${clientId}`, {
          clientId,
          consecutiveErrors: client.consecutiveErrors,
          error: error.message
        });
      }
    });

    socket.on('close', (code, reason) => {
      logger.info(`WebSocket client closed connection`, {
        clientId,
        userId: client.userId,
        code,
        reason: reason.toString()
      });
      this.removeClient(clientId);
    });

    socket.on('error', (error) => {
      logger.error(`WebSocket client error`, {
        clientId,
        userId: client.userId,
        error: error.message
      });
      this.removeClient(clientId);
    });

    socket.on('pong', () => {
      client.lastActivity = new Date();
    });
  }

  private handleClientMessage(clientId: string, message: any): void {
    const client = this.clients.get(clientId);
    if (!client) {
      return;
    }

    try {
      switch (message.type) {
        case 'subscribe':
          const subscriptionId = this.subscribeToStream(clientId, message.data.filter);
          break;

        case 'unsubscribe':
          this.unsubscribeFromStream(clientId, message.data.subscriptionId);
          break;

        case 'heartbeat':
          client.lastHeartbeat = new Date();
          this.sendToClient(clientId, {
            type: 'heartbeat_response',
            data: { serverTime: new Date().toISOString() }
          });
          break;

        case 'get_subscriptions':
          const activeSubscriptions = Array.from(client.subscriptions).map(subId => {
            const subscription = this.subscriptions.get(subId);
            return subscription ? {
              subscriptionId: subId,
              filter: subscription.filter,
              createdAt: subscription.createdAt
            } : null;
          }).filter(Boolean);

          this.sendToClient(clientId, {
            type: 'subscriptions_list',
            data: { subscriptions: activeSubscriptions }
          });
          break;

        default:
          logger.warn(`Unknown message type from client`, {
            clientId,
            messageType: message.type
          });
      }
    } catch (error) {
      this.sendToClient(clientId, {
        type: 'error',
        data: {
          message: error.message,
          originalMessage: message
        }
      });
    }
  }

  private sendToClient(clientId: string, message: any): void {
    const client = this.clients.get(clientId);
    if (!client || client.socket.readyState !== WebSocket.OPEN) {
      return;
    }

    try {
      const data = JSON.stringify(message);
      client.socket.send(data);
      
      // Update metadata
      client.metadata.messagesSent++;
      client.metadata.bytesSent += data.length;
      client.consecutiveErrors = 0; // Reset error count on success
      
    } catch (error) {
      client.consecutiveErrors++;
      logger.error(`Failed to send message to client`, {
        clientId,
        consecutiveErrors: client.consecutiveErrors,
        error: error.message
      });
      
      if (client.consecutiveErrors >= 5) {
        this.removeClient(clientId);
      }
    }
  }

  private sendToClientWithBackpressure(clientId: string, message: any): void {
    const client = this.clients.get(clientId);
    if (!client || client.socket.readyState !== WebSocket.OPEN) {
      return;
    }

    // Check client health before sending
    if (!BackpressureHandler.isClientHealthy(client)) {
      logger.warn('Removing unhealthy client', {
        clientId,
        userId: client.userId,
        consecutiveErrors: client.consecutiveErrors,
        lastHeartbeat: client.lastHeartbeat.toISOString()
      });
      this.removeClient(clientId);
      return;
    }

    try {
      const data = JSON.stringify(message);
      
      // Add to buffer first
      client.buffer.push(message.data.event);
      
      // Handle slow consumer
      BackpressureHandler.handleSlowConsumer(client);
      
      // Send the message
      client.socket.send(data);
      
      // Remove from buffer on successful send
      client.buffer.shift();
      
      // Update metadata
      client.metadata.messagesSent++;
      client.metadata.bytesSent += data.length;
      client.consecutiveErrors = 0;
      client.lastActivity = new Date();
      
    } catch (error) {
      client.consecutiveErrors++;
      logger.error(`Failed to send message with backpressure handling`, {
        clientId,
        userId: client.userId,
        bufferSize: client.buffer.length,
        consecutiveErrors: client.consecutiveErrors,
        error: error.message
      });
      
      if (client.consecutiveErrors >= BackpressureHandler['ERROR_THRESHOLD']) {
        this.removeClient(clientId);
      }
    }
  }

  private sendHeartbeats(): void {
    for (const [clientId, client] of this.clients) {
      if (client.socket.readyState === WebSocket.OPEN) {
        client.socket.ping();
      } else {
        this.removeClient(clientId);
      }
    }
  }

  private cleanupInactiveClients(): void {
    const now = Date.now();
    const inactiveThreshold = 10 * 60 * 1000; // 10 minutes

    for (const [clientId, client] of this.clients) {
      if (now - client.lastActivity.getTime() > inactiveThreshold) {
        logger.info(`Removing inactive client`, {
          clientId,
          userId: client.userId,
          inactiveDuration: now - client.lastActivity.getTime()
        });
        this.removeClient(clientId);
      }
    }
  }

  private subscribeToEvents(): void {
    // Subscribe to all collaboration events for streaming
    this.eventBus.subscribeToAll(
      async (event: DomainEvent) => {
        if (event.eventType.startsWith('collaboration.')) {
          await this.streamEvent(event);
        }
      },
      {
        subscriptionName: 'event_stream_service_global',
        eventTypeFilter: Object.values(COLLABORATION_EVENT_TYPES)
      }
    );

    logger.info('Event stream service subscribed to collaboration events');
  }

  private bufferEvent(event: DomainEvent): void {
    const bufferKey = this.getBufferKey(event);
    
    if (!this.eventBuffer.has(bufferKey)) {
      this.eventBuffer.set(bufferKey, []);
    }

    const buffer = this.eventBuffer.get(bufferKey)!;
    buffer.push(event);

    // Maintain buffer size
    if (buffer.length > this.config.eventBufferSize) {
      buffer.shift();
    }
  }

  private getBufferedEvents(filter: EventFilter): DomainEvent[] {
    const matchingEvents: DomainEvent[] = [];

    for (const [bufferKey, events] of this.eventBuffer) {
      for (const event of events) {
        if (this.eventMatchesFilter(event, filter)) {
          matchingEvents.push(event);
        }
      }
    }

    // Sort by timestamp
    return matchingEvents.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  private getBufferKey(event: DomainEvent): string {
    // Create buffer key based on event characteristics
    if (event.metadata.sessionId) {
      return `session:${event.metadata.sessionId}`;
    }
    if (event.metadata.workspaceId) {
      return `workspace:${event.metadata.workspaceId}`;
    }
    if (event.metadata.userId) {
      return `user:${event.metadata.userId}`;
    }
    return `global`;
  }

  private findMatchingSubscriptions(event: DomainEvent): StreamSubscription[] {
    const matching: StreamSubscription[] = [];

    for (const subscription of this.subscriptions.values()) {
      if (subscription.active && this.eventMatchesFilter(event, subscription.filter)) {
        matching.push(subscription);
      }
    }

    return matching;
  }

  private eventMatchesFilter(event: DomainEvent, filter: EventFilter): boolean {
    // Check event types
    if (filter.eventTypes && filter.eventTypes.length > 0) {
      if (!filter.eventTypes.includes(event.eventType)) {
        return false;
      }
    }

    // Check stream IDs
    if (filter.streamIds && filter.streamIds.length > 0) {
      if (!filter.streamIds.includes(event.streamId)) {
        return false;
      }
    }

    // Check user ID
    if (filter.userId && event.metadata.userId !== filter.userId) {
      return false;
    }

    // Check workspace ID
    if (filter.workspaceId && event.metadata.workspaceId !== filter.workspaceId) {
      return false;
    }

    // Check session ID
    if (filter.sessionId && event.metadata.sessionId !== filter.sessionId) {
      return false;
    }

    // Check custom filter
    if (filter.customFilter && !filter.customFilter(event)) {
      return false;
    }

    return true;
  }

  private transformEventForClient(event: DomainEvent, clientId: string): any {
    const client = this.clients.get(clientId);
    if (!client) {
      return event;
    }

    // Filter sensitive information based on client permissions
    const transformedEvent = {
      id: event.id,
      eventType: event.eventType,
      timestamp: event.timestamp,
      sequenceNumber: event.sequenceNumber,
      streamId: event.streamId,
      correlationId: event.correlationId,
      eventData: this.filterEventData(event.eventData, client),
      metadata: this.filterMetadata(event.metadata, client)
    };

    return transformedEvent;
  }

  private filterEventData(eventData: Record<string, unknown>, client: WebSocketClient): Record<string, unknown> {
    // This is where you'd implement permission-based filtering
    // For now, we'll just return the data as-is, but in production you'd check
    // user permissions and filter sensitive information
    
    const filtered = { ...eventData };

    // Example: Remove sensitive fields for certain users
    if (client.userId !== (eventData as any).userId) {
      // Could remove fields like internal IDs, detailed error messages, etc.
    }

    return filtered;
  }

  private filterMetadata(metadata: Record<string, unknown>, client: WebSocketClient): Record<string, unknown> {
    // Filter metadata based on client permissions
    const filtered = { ...metadata };

    // Remove sensitive metadata
    delete filtered.ipAddress;
    delete filtered.userAgent;

    return filtered;
  }

  // Public methods for getting service status
  getConnectedClients(): { clientId: string; userId: string; connectionTime: Date; subscriptions: number }[] {
    return Array.from(this.clients.values()).map(client => ({
      clientId: client.id,
      userId: client.userId,
      connectionTime: client.metadata.connectionTime,
      subscriptions: client.subscriptions.size
    }));
  }

  getActiveSubscriptions(): { subscriptionId: string; clientId: string; filter: EventFilter; createdAt: Date }[] {
    return Array.from(this.subscriptions.values()).map(sub => ({
      subscriptionId: sub.subscriptionId,
      clientId: sub.clientId,
      filter: sub.filter,
      createdAt: sub.createdAt
    }));
  }

  getServiceStats(): {
    totalClients: number;
    totalSubscriptions: number;
    eventBufferSize: number;
    uniqueUsers: number;
    backpressureStats: BackpressureStats;
    clientHealth: {
      healthyClients: number;
      unhealthyClients: number;
      slowConsumers: number;
      highBackpressureClients: number;
    };
  } {
    const backpressureStats = BackpressureHandler.generateBackpressureStats(this.clients);
    
    let healthyClients = 0;
    let unhealthyClients = 0;
    let slowConsumers = 0;
    let highBackpressureClients = 0;

    for (const client of this.clients.values()) {
      const stats = BackpressureHandler.getClientStats(client);
      if (stats.isHealthy) healthyClients++;
      else unhealthyClients++;
      if (stats.isSlowConsumer) slowConsumers++;
      if (stats.shouldThrottle) highBackpressureClients++;
    }

    return {
      totalClients: this.clients.size,
      totalSubscriptions: this.subscriptions.size,
      eventBufferSize: Array.from(this.eventBuffer.values()).reduce((sum, buffer) => sum + buffer.length, 0),
      uniqueUsers: this.userConnections.size,
      backpressureStats,
      clientHealth: {
        healthyClients,
        unhealthyClients,
        slowConsumers,
        highBackpressureClients
      }
    };
  }

  async close(): Promise<void> {
    clearInterval(this.heartbeatInterval);
    clearInterval(this.cleanupInterval);

    // Close all client connections
    for (const client of this.clients.values()) {
      client.socket.close();
    }

    // Clear all data structures
    this.clients.clear();
    this.userConnections.clear();
    this.subscriptions.clear();
    this.eventBuffer.clear();

    logger.info('Event stream service closed');
  }
}