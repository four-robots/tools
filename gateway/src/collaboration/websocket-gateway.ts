/**
 * WebSocket Collaboration Gateway
 * 
 * Horizontally scalable WebSocket server with Redis clustering, room-based
 * collaboration, and comprehensive event management for real-time features.
 */

import { WebSocket, WebSocketServer } from 'ws';
import { IncomingMessage } from 'http';
import { Server as HttpServer } from 'http';
import { Pool } from 'pg';
import Redis from 'ioredis';
import jwt from 'jsonwebtoken';
import {
  CollaborationMessage,
  CollaborationMessageSchema,
  ConnectionState,
  WebSocketCollaborationGateway as IWebSocketCollaborationGateway,
  CollaborationSessionService,
  EventBroadcastingService,
  PresenceService,
  LiveSearchCollaborationService,
  SearchCollaborationMessage,
  SearchCollaborationMessageSchema
} from '@mcp-tools/core';
import { ConnectionManager } from './connection-manager.js';
import { RedisClusterManager } from './redis-cluster-manager.js';
import { RateLimiter } from './rate-limiter.js';
import { 
  AuthenticationRequiredError,
  InvalidTokenError,
  ServerCapacityExceededError,
  RateLimitExceededError,
  SessionNotFoundError,
  SessionInactiveError,
  InsufficientPermissionsError,
  MessageProcessingError,
  toCollaborationError,
  isCollaborationError
} from './errors.js';
import { SearchWebSocketHandler } from './search-websocket-handler.js';
import { logger } from '../utils/logger.js';
import crypto from 'crypto';
import { URL } from 'url';

interface AuthenticatedWebSocket extends WebSocket {
  connectionId: string;
  userId: string;
  sessionId?: string;
  isAuthenticated: boolean;
  lastHeartbeat: Date;
  messageCount: number;
  joinedRooms: Set<string>;
}

export class WebSocketCollaborationGateway implements IWebSocketCollaborationGateway {
  private wsServer: WebSocketServer;
  private connectionManager: ConnectionManager;
  private redisClusterManager: RedisClusterManager;
  private rateLimiter: RateLimiter;
  private searchHandler: SearchWebSocketHandler;
  private connections: Map<string, AuthenticatedWebSocket> = new Map();
  private rooms: Map<string, Set<string>> = new Map(); // roomId -> connectionIds
  private heartbeatInterval: NodeJS.Timeout;
  private cleanupInterval: NodeJS.Timeout;

  constructor(
    server: HttpServer,
    private db: Pool,
    private redis: Redis,
    private sessionService: CollaborationSessionService,
    private eventService: EventBroadcastingService,
    private presenceService: PresenceService,
    private searchService: LiveSearchCollaborationService,
    private jwtSecret: string = process.env.JWT_SECRET || '',
    private config: {
      heartbeatInterval: number;
      connectionTimeout: number;
      maxConnections: number;
      maxRoomsPerConnection: number;
      enableRateLimiting: boolean;
      rateLimitConfig: {
        maxMessagesPerSecond: number;
        burstAllowance: number;
        penaltyDuration: number;
      };
    } = {
      heartbeatInterval: 30000, // 30 seconds
      connectionTimeout: 60000, // 60 seconds
      maxConnections: 10000,
      maxRoomsPerConnection: 50,
      enableRateLimiting: true,
      rateLimitConfig: {
        maxMessagesPerSecond: 10,
        burstAllowance: 20,
        penaltyDuration: 5000
      }
    }
  ) {
    // Validate and configure PostgreSQL connection pool
    this.validateAndConfigurePostgreSQLPool();
    this.wsServer = new WebSocketServer({ 
      server,
      path: '/collaboration',
      perMessageDeflate: {
        deflate: {
          chunkSize: 1024,
          windowBits: 13,
          concurrencyLimit: 10,
        },
        inflate: {
          chunkSize: 1024,
        },
      },
      maxPayload: 1024 * 1024, // 1MB max message size
    });

    this.connectionManager = new ConnectionManager(this.db, this.redis);
    this.redisClusterManager = new RedisClusterManager(this.redis);
    this.rateLimiter = new RateLimiter(this.redis, this.config.rateLimitConfig);
    this.searchHandler = new SearchWebSocketHandler(
      this.searchService,
      this.broadcastToSession.bind(this)
    );

    this.setupWebSocketServer();
    this.setupRedisSubscriptions();
    this.startHeartbeatMonitoring();
    this.startPeriodicCleanup();
  }

  /**
   * Sets up the WebSocket server with connection handling
   */
  private setupWebSocketServer(): void {
    this.wsServer.on('connection', async (ws: AuthenticatedWebSocket, request: IncomingMessage) => {
      try {
        const connectionId = crypto.randomUUID();
        ws.connectionId = connectionId;
        ws.isAuthenticated = false;
        ws.lastHeartbeat = new Date();
        ws.messageCount = 0;
        ws.joinedRooms = new Set();

        // Check connection limits
        if (this.connections.size >= this.config.maxConnections) {
          const error = new ServerCapacityExceededError(this.config.maxConnections);
          ws.close(1008, error.message);
          logger.warn('Connection rejected due to capacity', {
            currentConnections: this.connections.size,
            maxConnections: this.config.maxConnections,
            userAgent: request.headers['user-agent']
          });
          return;
        }

        // Authenticate connection
        let userId: string;
        try {
          userId = await this.authenticateConnection(ws, request);
        } catch (authError) {
          const error = toCollaborationError(authError);
          ws.close(1008, error.message);
          logger.warn('Connection rejected due to authentication failure', {
            error: error.code,
            message: error.message,
            userAgent: request.headers['user-agent'],
            ip: this.getClientIP(request)
          });
          return;
        }

        ws.userId = userId;
        ws.isAuthenticated = true;
        this.connections.set(connectionId, ws);

        await this.handleConnection(connectionId, { userId, request });

        // Set up message handling
        ws.on('message', async (data: Buffer) => {
          await this.handleMessage(ws, data);
        });

        ws.on('close', async (code: number, reason: Buffer) => {
          await this.handleDisconnection(connectionId);
        });

        ws.on('error', (error: Error) => {
          logger.error('WebSocket connection error', { 
            connectionId, 
            userId, 
            error: error.message 
          });
        });

        ws.on('pong', () => {
          ws.lastHeartbeat = new Date();
        });

        // Send connection confirmation
        await this.sendToConnection(connectionId, {
          type: 'ack',
          sessionId: '',
          userId: userId,
          data: { message: 'Connection established', connectionId },
          timestamp: new Date(),
          sequenceNumber: 0,
          messageId: crypto.randomUUID()
        });

        logger.info('WebSocket connection established', { connectionId, userId });

      } catch (error) {
        logger.error('Failed to establish WebSocket connection', { error });
        ws.close(1011, 'Connection setup failed');
      }
    });

    this.wsServer.on('error', (error) => {
      logger.error('WebSocket server error', { error });
    });

    logger.info('WebSocket Collaboration Gateway initialized', {
      maxConnections: this.config.maxConnections,
      heartbeatInterval: this.config.heartbeatInterval,
      rateLimitingEnabled: this.config.enableRateLimiting
    });
  }

  /**
   * Authenticates a WebSocket connection
   */
  private async authenticateConnection(ws: AuthenticatedWebSocket, request: IncomingMessage): Promise<string | null> {
    try {
      // Extract token from query parameters or headers
      const url = new URL(request.url || '', 'http://localhost');
      const token = url.searchParams.get('token') || 
                   request.headers.authorization?.replace('Bearer ', '');

      if (!token) {
        throw new AuthenticationRequiredError('No token provided in query parameters or headers');
      }

      const decoded = jwt.verify(token, this.jwtSecret) as any;
      const userId = decoded.sub || decoded.id;
      
      if (!userId) {
        throw new InvalidTokenError('Token payload missing required user ID (sub or id field)');
      }

      logger.debug('WebSocket authentication successful', { 
        userId,
        tokenExp: decoded.exp ? new Date(decoded.exp * 1000) : undefined
      });

      return userId;

    } catch (error) {
      // Re-throw collaboration errors as-is
      if (isCollaborationError(error)) {
        throw error;
      }

      // Convert JWT verification errors to InvalidTokenError
      if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
        throw new InvalidTokenError(`JWT verification failed: ${error.message}`);
      }

      // Convert other errors to generic authentication error
      logger.error('WebSocket authentication failed', { 
        error: error.message,
        userAgent: request.headers['user-agent'],
        ip: this.getClientIP(request)
      });
      throw new AuthenticationRequiredError(`Authentication failed: ${error.message}`);
    }
  }

  /**
   * Handles new WebSocket connection
   */
  async handleConnection(connectionId: string, auth: any): Promise<void> {
    try {
      const connection = this.connections.get(connectionId);
      if (!connection) {
        throw new Error('Connection not found');
      }

      // Register connection with connection manager
      await this.connectionManager.registerConnection({
        connectionId,
        userId: auth.userId,
        sessionId: '',
        connected_at: new Date(),
        last_ping: new Date(),
        last_pong: new Date(),
        is_authenticated: true,
        user_agent: auth.request?.headers['user-agent'] || undefined,
        ip_address: this.getClientIP(auth.request),
        gateway_instance: process.env.GATEWAY_INSTANCE_ID || 'default',
        message_count: 0,
        rate_limit_remaining: this.config.rateLimitConfig.maxMessagesPerSecond
      });

      // Subscribe to user-specific Redis channel for cross-instance communication
      await this.redisClusterManager.subscribeToUserChannel(auth.userId);

      logger.info('Connection registered', { connectionId, userId: auth.userId });

    } catch (error) {
      logger.error('Failed to handle connection', { error, connectionId });
      throw error;
    }
  }

  /**
   * Handles WebSocket disconnection
   */
  async handleDisconnection(connectionId: string): Promise<void> {
    try {
      const connection = this.connections.get(connectionId);
      if (!connection) {
        return;
      }

      // Leave all rooms
      for (const roomId of connection.joinedRooms) {
        await this.leaveRoom(connectionId, roomId);
      }

      // Update presence for all sessions
      if (connection.sessionId) {
        await this.presenceService.removeConnection(
          connection.userId,
          connection.sessionId,
          connectionId
        );
      }

      // Unregister connection
      await this.connectionManager.unregisterConnection(connectionId);

      // Unsubscribe from Redis channels
      await this.redisClusterManager.unsubscribeFromUserChannel(connection.userId);

      // Remove from local connections
      this.connections.delete(connectionId);

      logger.info('Connection disconnected', { 
        connectionId, 
        userId: connection.userId,
        sessionId: connection.sessionId
      });

    } catch (error) {
      logger.error('Failed to handle disconnection', { error, connectionId });
    }
  }

  /**
   * Handles incoming WebSocket messages
   */
  private async handleMessage(ws: AuthenticatedWebSocket, data: Buffer): Promise<void> {
    try {
      // Rate limiting check
      if (this.config.enableRateLimiting) {
        const allowed = await this.rateLimiter.checkRateLimit(ws.userId, ws.connectionId);
        if (!allowed) {
          const error = new RateLimitExceededError(
            `${this.config.rateLimitConfig.maxMessagesPerSecond} messages per second`,
            ws.userId,
            ws.connectionId
          );
          
          await this.sendToConnection(ws.connectionId, {
            type: 'error',
            sessionId: ws.sessionId || '',
            userId: ws.userId,
            data: { 
              error: error.message, 
              code: error.code,
              statusCode: error.statusCode,
              details: error.details
            },
            timestamp: new Date(),
            sequenceNumber: 0,
            messageId: crypto.randomUUID()
          });
          return;
        }
      }

      // Parse message
      const rawMessage = JSON.parse(data.toString());
      
      // Check if this is a search collaboration message
      if (this.isSearchCollaborationMessage(rawMessage.type)) {
        const searchMessage = SearchCollaborationMessageSchema.parse({
          ...rawMessage,
          userId: ws.userId,
          timestamp: new Date(rawMessage.timestamp),
          messageId: rawMessage.messageId || crypto.randomUUID()
        });

        ws.messageCount++;
        ws.lastHeartbeat = new Date();

        await this.searchHandler.handleSearchMessage(searchMessage);
        return;
      }

      // Handle regular collaboration messages
      const message = CollaborationMessageSchema.parse({
        ...rawMessage,
        userId: ws.userId,
        timestamp: new Date(rawMessage.timestamp),
        messageId: rawMessage.messageId || crypto.randomUUID()
      });

      ws.messageCount++;
      ws.lastHeartbeat = new Date();

      // Handle different message types
      switch (message.type) {
        case 'join':
          await this.handleJoinSession(ws, message);
          break;
        
        case 'leave':
          await this.handleLeaveSession(ws, message);
          break;
        
        case 'heartbeat':
          await this.handleHeartbeat(ws, message);
          break;

        case 'search':
        case 'filter':
        case 'annotation':
        case 'cursor':
          await this.handleCollaborationEvent(ws, message);
          break;

        case 'presence':
          await this.handlePresenceUpdate(ws, message);
          break;

        default:
          logger.warn('Unknown message type', { 
            type: message.type, 
            connectionId: ws.connectionId 
          });
      }

    } catch (error) {
      const collaborationError = toCollaborationError(error);
      
      logger.error('Failed to handle message', { 
        error: collaborationError.code,
        message: collaborationError.message,
        details: collaborationError.details,
        connectionId: ws.connectionId,
        userId: ws.userId
      });

      await this.sendToConnection(ws.connectionId, {
        type: 'error',
        sessionId: ws.sessionId || '',
        userId: ws.userId,
        data: { 
          error: collaborationError.message, 
          code: collaborationError.code,
          statusCode: collaborationError.statusCode,
          details: collaborationError.details
        },
        timestamp: new Date(),
        sequenceNumber: 0,
        messageId: crypto.randomUUID()
      });
    }
  }

  /**
   * Handles session join requests
   */
  private async handleJoinSession(ws: AuthenticatedWebSocket, message: CollaborationMessage): Promise<void> {
    const sessionId = message.sessionId;
    
    // Validate session exists and user can join
    const session = await this.sessionService.getSession(sessionId);
    if (!session) {
      throw new SessionNotFoundError(sessionId);
    }

    if (!session.is_active) {
      throw new SessionInactiveError(sessionId);
    }

    // Check if user is already a participant or add them
    const participants = await this.sessionService.getSessionParticipants(sessionId);
    const existingParticipant = participants.find(p => p.user_id === ws.userId);

    if (!existingParticipant) {
      if (!session.allow_anonymous) {
        throw new InsufficientPermissionsError('join session - anonymous participants not allowed', sessionId, ws.userId);
      }

      await this.sessionService.addParticipant({
        session_id: sessionId,
        user_id: ws.userId,
        role: 'participant',
        is_active: true,
        permissions: {},
        can_invite_others: false,
        can_modify_session: false,
        can_broadcast_events: true,
        event_count: 0,
        total_active_time_ms: 0
      });
    }

    // Join session room
    ws.sessionId = sessionId;
    await this.joinRoom(ws.connectionId, `session:${sessionId}`);

    // Update presence
    await this.presenceService.addConnection(
      ws.userId,
      sessionId,
      ws.connectionId,
      message.data.deviceInfo
    );

    // Broadcast join event to other participants
    await this.broadcastToSession(sessionId, {
      type: 'presence',
      sessionId,
      userId: ws.userId,
      data: { 
        action: 'joined',
        connectionId: ws.connectionId,
        timestamp: new Date().toISOString()
      },
      timestamp: new Date(),
      sequenceNumber: 0,
      messageId: crypto.randomUUID()
    }, ws.connectionId);

    // Send acknowledgment with session history
    const recentEvents = await this.eventService.getEventHistory(sessionId, 0, 50);
    const sessionPresence = await this.presenceService.getSessionPresence(sessionId);

    await this.sendToConnection(ws.connectionId, {
      type: 'ack',
      sessionId,
      userId: ws.userId,
      data: { 
        message: 'Joined session successfully',
        session,
        recentEvents,
        presence: sessionPresence
      },
      timestamp: new Date(),
      sequenceNumber: 0,
      messageId: crypto.randomUUID()
    });

    logger.info('User joined collaboration session', { 
      userId: ws.userId, 
      sessionId,
      connectionId: ws.connectionId
    });
  }

  /**
   * Handles session leave requests
   */
  private async handleLeaveSession(ws: AuthenticatedWebSocket, message: CollaborationMessage): Promise<void> {
    const sessionId = message.sessionId || ws.sessionId;
    if (!sessionId) {
      return;
    }

    // Leave session room
    await this.leaveRoom(ws.connectionId, `session:${sessionId}`);

    // Update presence
    await this.presenceService.removeConnection(ws.userId, sessionId, ws.connectionId);

    // Broadcast leave event
    await this.broadcastToSession(sessionId, {
      type: 'presence',
      sessionId,
      userId: ws.userId,
      data: { 
        action: 'left',
        connectionId: ws.connectionId,
        timestamp: new Date().toISOString()
      },
      timestamp: new Date(),
      sequenceNumber: 0,
      messageId: crypto.randomUUID()
    }, ws.connectionId);

    ws.sessionId = undefined;

    logger.info('User left collaboration session', { 
      userId: ws.userId, 
      sessionId,
      connectionId: ws.connectionId
    });
  }

  /**
   * Handles heartbeat messages
   */
  private async handleHeartbeat(ws: AuthenticatedWebSocket, message: CollaborationMessage): Promise<void> {
    ws.lastHeartbeat = new Date();

    if (ws.sessionId) {
      await this.presenceService.updateHeartbeat(ws.userId, ws.sessionId);
    }

    // Send pong response
    await this.sendToConnection(ws.connectionId, {
      type: 'ack',
      sessionId: message.sessionId,
      userId: ws.userId,
      data: { message: 'pong', timestamp: new Date().toISOString() },
      timestamp: new Date(),
      sequenceNumber: 0,
      messageId: crypto.randomUUID()
    });
  }

  /**
   * Handles collaboration events (search, filter, annotation, cursor)
   */
  private async handleCollaborationEvent(ws: AuthenticatedWebSocket, message: CollaborationMessage): Promise<void> {
    if (!ws.sessionId) {
      throw new MessageProcessingError(message.type, 'Must join a session before sending collaboration events');
    }

    // Persist event
    const event = await this.eventService.broadcastEvent({
      session_id: ws.sessionId,
      user_id: ws.userId,
      event_type: message.type,
      event_category: 'user_action',
      event_data: message.data,
      sequence_number: message.sequenceNumber,
      message_id: message.messageId,
      broadcast_count: 0,
      delivery_status: 'pending',
      client_timestamp: message.timestamp,
      source_connection_id: ws.connectionId,
      requires_ack: message.requiresAck || false,
      parent_event_id: message.parentMessageId
    });

    // Broadcast to session participants
    await this.broadcastToSession(ws.sessionId, message, ws.connectionId);

    // Mark as delivered
    await this.eventService.markEventDelivered(event.id);

    logger.debug('Collaboration event processed', {
      eventId: event.id,
      sessionId: ws.sessionId,
      eventType: message.type,
      userId: ws.userId
    });
  }

  /**
   * Handles presence updates
   */
  private async handlePresenceUpdate(ws: AuthenticatedWebSocket, message: CollaborationMessage): Promise<void> {
    if (!ws.sessionId) {
      return;
    }

    // Update presence based on message data
    const updateData: any = {
      user_id: ws.userId,
      session_id: ws.sessionId,
      status: message.data.status || 'online',
      last_activity: new Date(),
      connection_count: 1,
      connection_ids: [ws.connectionId],
      last_heartbeat: new Date(),
      joined_session_at: new Date()
    };

    if (message.data.currentLocation) {
      updateData.current_location = message.data.currentLocation;
    }

    if (message.data.cursorPosition) {
      updateData.cursor_position = message.data.cursorPosition;
    }

    if (message.data.activeTools) {
      updateData.active_tools = message.data.activeTools;
    }

    await this.presenceService.updatePresence(updateData);

    // Broadcast presence update to other participants
    await this.broadcastToSession(ws.sessionId, message, ws.connectionId);
  }

  /**
   * Broadcasts a message to all participants in a room
   */
  async broadcastToRoom(roomId: string, message: CollaborationMessage, excludeConnectionId?: string): Promise<void> {
    try {
      const roomConnections = this.rooms.get(roomId);
      if (!roomConnections) {
        return;
      }

      const broadcastPromises: Promise<void>[] = [];

      for (const connectionId of roomConnections) {
        if (connectionId !== excludeConnectionId) {
          broadcastPromises.push(this.sendToConnection(connectionId, message));
        }
      }

      // Also broadcast via Redis for cross-instance communication
      await this.redisClusterManager.broadcastToRoom(roomId, message, excludeConnectionId);

      await Promise.allSettled(broadcastPromises);

      logger.debug('Message broadcasted to room', { 
        roomId, 
        participantCount: roomConnections.size,
        messageType: message.type
      });

    } catch (error) {
      logger.error('Failed to broadcast to room', { error, roomId });
      throw error;
    }
  }

  /**
   * Broadcasts a message to all participants in a session
   */
  async broadcastToSession(sessionId: string, message: CollaborationMessage, excludeConnectionId?: string): Promise<void> {
    await this.broadcastToRoom(`session:${sessionId}`, message, excludeConnectionId);
  }

  /**
   * Sends a message to a specific user (all their connections)
   */
  async sendToUser(userId: string, message: CollaborationMessage): Promise<void> {
    try {
      const userConnections: string[] = [];

      // Find all connections for this user
      for (const [connectionId, connection] of this.connections) {
        if (connection.userId === userId) {
          userConnections.push(connectionId);
        }
      }

      const sendPromises = userConnections.map(connectionId => 
        this.sendToConnection(connectionId, message)
      );

      // Also send via Redis for cross-instance communication
      await this.redisClusterManager.sendToUser(userId, message);

      await Promise.allSettled(sendPromises);

      logger.debug('Message sent to user', { 
        userId, 
        connectionCount: userConnections.length,
        messageType: message.type
      });

    } catch (error) {
      logger.error('Failed to send message to user', { error, userId });
      throw error;
    }
  }

  /**
   * Joins a connection to a room
   */
  async joinRoom(connectionId: string, roomId: string): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      throw new Error('Connection not found');
    }

    // Check room limits
    if (connection.joinedRooms.size >= this.config.maxRoomsPerConnection) {
      throw new Error('Maximum rooms per connection exceeded');
    }

    // Add to room
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, new Set());
    }
    
    this.rooms.get(roomId)!.add(connectionId);
    connection.joinedRooms.add(roomId);

    logger.debug('Connection joined room', { connectionId, roomId });
  }

  /**
   * Removes a connection from a room
   */
  async leaveRoom(connectionId: string, roomId: string): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (connection) {
      connection.joinedRooms.delete(roomId);
    }

    const room = this.rooms.get(roomId);
    if (room) {
      room.delete(connectionId);
      
      // Clean up empty rooms
      if (room.size === 0) {
        this.rooms.delete(roomId);
      }
    }

    logger.debug('Connection left room', { connectionId, roomId });
  }

  /**
   * Gets participants in a room
   */
  async getRoomParticipants(roomId: string): Promise<string[]> {
    const room = this.rooms.get(roomId);
    return room ? Array.from(room) : [];
  }

  /**
   * Gets connection state
   */
  async getConnection(connectionId: string): Promise<ConnectionState | null> {
    return await this.connectionManager.getConnection(connectionId);
  }

  /**
   * Gets active connections for a session
   */
  async getActiveConnections(sessionId?: string): Promise<ConnectionState[]> {
    if (sessionId) {
      const participants = await this.getRoomParticipants(`session:${sessionId}`);
      const connections: ConnectionState[] = [];
      
      for (const connectionId of participants) {
        const connection = await this.getConnection(connectionId);
        if (connection) {
          connections.push(connection);
        }
      }
      
      return connections;
    }

    return await this.connectionManager.getActiveConnections();
  }

  /**
   * Closes a connection
   */
  async closeConnection(connectionId: string, reason?: string): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (connection) {
      connection.close(1000, reason || 'Connection closed by server');
    }
  }

  /**
   * Sends a message to a specific connection
   */
  private async sendToConnection(connectionId: string, message: CollaborationMessage): Promise<void> {
    try {
      const connection = this.connections.get(connectionId);
      if (!connection || connection.readyState !== WebSocket.OPEN) {
        return;
      }

      const messageStr = JSON.stringify({
        ...message,
        timestamp: message.timestamp.toISOString()
      });

      connection.send(messageStr);

    } catch (error) {
      logger.error('Failed to send message to connection', { error, connectionId });
      // Don't throw - connection might be closed
    }
  }

  /**
   * Sets up Redis subscriptions for cross-instance communication
   */
  private setupRedisSubscriptions(): void {
    this.redisClusterManager.onRoomMessage = async (roomId: string, message: CollaborationMessage, excludeConnectionId?: string) => {
      await this.broadcastToRoom(roomId, message, excludeConnectionId);
    };

    this.redisClusterManager.onUserMessage = async (userId: string, message: CollaborationMessage) => {
      await this.sendToUser(userId, message);
    };
  }

  /**
   * Starts heartbeat monitoring
   */
  private startHeartbeatMonitoring(): void {
    this.heartbeatInterval = setInterval(async () => {
      const now = new Date();
      const timeout = this.config.connectionTimeout;

      for (const [connectionId, connection] of this.connections) {
        const timeSinceHeartbeat = now.getTime() - connection.lastHeartbeat.getTime();
        
        if (timeSinceHeartbeat > timeout) {
          logger.info('Connection timed out', { 
            connectionId, 
            userId: connection.userId,
            timeSinceHeartbeat
          });
          
          connection.close(1000, 'Connection timeout');
          continue;
        }

        // Send ping
        if (connection.readyState === WebSocket.OPEN) {
          connection.ping();
        }
      }
    }, this.config.heartbeatInterval);
  }

  /**
   * Starts periodic cleanup
   */
  private startPeriodicCleanup(): void {
    this.cleanupInterval = setInterval(async () => {
      try {
        // Clean up stale presence records
        const cleanedCount = await this.presenceService.cleanupStalePresence(5);
        
        if (cleanedCount > 0) {
          logger.info('Cleaned up stale presence records', { cleanedCount });
        }

        // Clean up failed events
        const failedEvents = await this.eventService.getFailedEvents();
        logger.debug('Found failed events for retry', { count: failedEvents.length });

      } catch (error) {
        logger.error('Periodic cleanup failed', { error });
      }
    }, 60000); // Every minute
  }

  /**
   * Extracts client IP address from request
   */
  private getClientIP(request?: IncomingMessage): string | undefined {
    if (!request) return undefined;
    
    return (request.headers['x-forwarded-for'] as string)?.split(',')[0] ||
           (request.headers['x-real-ip'] as string) ||
           request.socket.remoteAddress;
  }

  /**
   * Validates and configures PostgreSQL connection pool
   */
  private validateAndConfigurePostgreSQLPool(): void {
    // Get pool options (access internal options if available)
    const poolOptions = (this.db as any).options || {};
    
    // Set reasonable defaults if not configured
    const defaultMaxConnections = 50;
    const maxConnections = poolOptions.max || defaultMaxConnections;
    const idleTimeoutMs = poolOptions.idleTimeoutMillis || 30000;
    const connectionTimeoutMs = poolOptions.connectionTimeoutMillis || 5000;

    if (!poolOptions.max) {
      logger.warn('PostgreSQL pool max connections not configured, using default', {
        defaultMax: defaultMaxConnections,
        recommendedRange: '20-100 depending on workload'
      });
      // Note: We can't modify pool options after creation, this is just logging
    }

    if (maxConnections > 100) {
      logger.warn('PostgreSQL pool max connections is very high', {
        configuredMax: maxConnections,
        recommendation: 'Consider reducing to 50-80 for better resource management'
      });
    }

    if (idleTimeoutMs < 10000) {
      logger.warn('PostgreSQL pool idle timeout is very low', {
        configuredTimeout: idleTimeoutMs,
        recommendation: 'Consider increasing to at least 30 seconds'
      });
    }

    logger.info('PostgreSQL connection pool configuration validated', {
      maxConnections,
      idleTimeoutMs,
      connectionTimeoutMs,
      databaseName: process.env.POSTGRES_DB || 'unknown'
    });
  }

  /**
   * Checks if a message type is a search collaboration message
   */
  private isSearchCollaborationMessage(messageType: string): boolean {
    const searchMessageTypes = [
      'search_join',
      'search_leave',
      'search_query_update',
      'search_filter_update',
      'search_result_highlight',
      'search_annotation',
      'search_cursor_update',
      'search_selection_change',
      'search_bookmark',
      'search_state_sync',
      'search_conflict_resolution',
      'search_session_update'
    ];

    return searchMessageTypes.includes(messageType);
  }

  /**
   * Shuts down the WebSocket gateway
   */
  async shutdown(): Promise<void> {
    logger.info('Shutting down WebSocket Collaboration Gateway');

    // Clear intervals
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    // Close all connections
    for (const [connectionId, connection] of this.connections) {
      connection.close(1001, 'Server shutting down');
    }

    // Close WebSocket server
    this.wsServer.close();

    // Shutdown components
    await this.connectionManager.shutdown();
    await this.redisClusterManager.shutdown();
    await this.searchHandler.shutdown();

    logger.info('WebSocket Collaboration Gateway shut down complete');
  }
}