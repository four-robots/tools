/**
 * Connection Manager
 * 
 * Handles connection lifecycle, heartbeat monitoring, and connection state
 * tracking for WebSocket collaborations with Redis-backed persistence.
 */

import { Pool } from 'pg';
import Redis from 'ioredis';
import { ConnectionState, ConnectionStateSchema } from '@mcp-tools/core';
import { logger } from '../utils/logger.js';

export class ConnectionManager {
  private connections: Map<string, ConnectionState> = new Map();
  private readonly CONNECTION_TTL = 300; // 5 minutes in seconds
  private readonly HEARTBEAT_THRESHOLD = 60000; // 1 minute in milliseconds
  private heartbeatInterval: NodeJS.Timeout;

  constructor(
    private db: Pool,
    private redis: Redis
  ) {
    this.startHeartbeatMonitoring();
  }

  /**
   * Registers a new WebSocket connection
   */
  async registerConnection(connectionData: Omit<ConnectionState, 'last_message_at'>): Promise<ConnectionState> {
    try {
      const validatedData = ConnectionStateSchema.omit({
        last_message_at: true
      }).parse(connectionData);

      const connection: ConnectionState = {
        ...validatedData,
        last_message_at: undefined
      };

      // Store in local memory
      this.connections.set(connection.connectionId, connection);

      // Store in Redis for cross-instance visibility
      await this.redis.setex(
        `connection:${connection.connectionId}`,
        this.CONNECTION_TTL,
        JSON.stringify({
          ...connection,
          connected_at: connection.connected_at.toISOString(),
          last_ping: connection.last_ping.toISOString(),
          last_pong: connection.last_pong.toISOString()
        })
      );

      // Add to user connection set
      await this.redis.sadd(`user_connections:${connection.userId}`, connection.connectionId);
      await this.redis.expire(`user_connections:${connection.userId}`, this.CONNECTION_TTL);

      // Add to session connection set if applicable
      if (connection.sessionId) {
        await this.redis.sadd(`session_connections:${connection.sessionId}`, connection.connectionId);
        await this.redis.expire(`session_connections:${connection.sessionId}`, this.CONNECTION_TTL);
      }

      // Add to gateway instance set
      if (connection.gateway_instance) {
        await this.redis.sadd(`gateway_connections:${connection.gateway_instance}`, connection.connectionId);
        await this.redis.expire(`gateway_connections:${connection.gateway_instance}`, this.CONNECTION_TTL);
      }

      // Track global connection count
      await this.redis.incr('global_connection_count');

      logger.info('Connection registered', {
        connectionId: connection.connectionId,
        userId: connection.userId,
        sessionId: connection.sessionId,
        gatewayInstance: connection.gateway_instance
      });

      return connection;

    } catch (error) {
      logger.error('Failed to register connection', { error, connectionData });
      throw new Error(`Failed to register connection: ${error.message}`);
    }
  }

  /**
   * Unregisters a WebSocket connection
   */
  async unregisterConnection(connectionId: string): Promise<void> {
    try {
      const connection = this.connections.get(connectionId);
      
      if (connection) {
        // Remove from user connection set
        await this.redis.srem(`user_connections:${connection.userId}`, connectionId);

        // Remove from session connection set
        if (connection.sessionId) {
          await this.redis.srem(`session_connections:${connection.sessionId}`, connectionId);
        }

        // Remove from gateway instance set
        if (connection.gateway_instance) {
          await this.redis.srem(`gateway_connections:${connection.gateway_instance}`, connectionId);
        }

        // Decrement global connection count
        await this.redis.decr('global_connection_count');
      }

      // Remove from Redis
      await this.redis.del(`connection:${connectionId}`);

      // Remove from local memory
      this.connections.delete(connectionId);

      logger.info('Connection unregistered', { 
        connectionId, 
        userId: connection?.userId 
      });

    } catch (error) {
      logger.error('Failed to unregister connection', { error, connectionId });
      throw new Error(`Failed to unregister connection: ${error.message}`);
    }
  }

  /**
   * Updates connection heartbeat information
   */
  async updateHeartbeat(connectionId: string, type: 'ping' | 'pong' = 'pong'): Promise<void> {
    try {
      const connection = this.connections.get(connectionId);
      if (!connection) {
        logger.warn('Attempted to update heartbeat for unknown connection', { connectionId });
        return;
      }

      const now = new Date();
      
      if (type === 'ping') {
        connection.last_ping = now;
      } else {
        connection.last_pong = now;
      }

      // Update in Redis
      await this.redis.setex(
        `connection:${connectionId}`,
        this.CONNECTION_TTL,
        JSON.stringify({
          ...connection,
          connected_at: connection.connected_at.toISOString(),
          last_ping: connection.last_ping.toISOString(),
          last_pong: connection.last_pong.toISOString(),
          last_message_at: connection.last_message_at?.toISOString()
        })
      );

      logger.debug('Connection heartbeat updated', { connectionId, type });

    } catch (error) {
      logger.error('Failed to update connection heartbeat', { error, connectionId, type });
      // Don't throw - heartbeat updates are non-critical
    }
  }

  /**
   * Records message activity for a connection
   */
  async recordMessageActivity(connectionId: string): Promise<void> {
    try {
      const connection = this.connections.get(connectionId);
      if (!connection) {
        return;
      }

      connection.message_count += 1;
      connection.last_message_at = new Date();

      // Update rate limiting information
      if (connection.rate_limit_remaining > 0) {
        connection.rate_limit_remaining -= 1;
      }

      // Update in Redis (throttle updates to every 10 messages to reduce load)
      if (connection.message_count % 10 === 0) {
        await this.redis.setex(
          `connection:${connectionId}`,
          this.CONNECTION_TTL,
          JSON.stringify({
            ...connection,
            connected_at: connection.connected_at.toISOString(),
            last_ping: connection.last_ping.toISOString(),
            last_pong: connection.last_pong.toISOString(),
            last_message_at: connection.last_message_at?.toISOString()
          })
        );
      }

      logger.debug('Message activity recorded', { 
        connectionId, 
        messageCount: connection.message_count 
      });

    } catch (error) {
      logger.error('Failed to record message activity', { error, connectionId });
      // Don't throw - activity recording is non-critical
    }
  }

  /**
   * Updates connection session association
   */
  async updateConnectionSession(connectionId: string, sessionId: string | null): Promise<void> {
    try {
      const connection = this.connections.get(connectionId);
      if (!connection) {
        throw new Error('Connection not found');
      }

      const oldSessionId = connection.sessionId;

      // Remove from old session set
      if (oldSessionId) {
        await this.redis.srem(`session_connections:${oldSessionId}`, connectionId);
      }

      // Add to new session set
      if (sessionId) {
        await this.redis.sadd(`session_connections:${sessionId}`, connectionId);
        await this.redis.expire(`session_connections:${sessionId}`, this.CONNECTION_TTL);
      }

      // Update connection
      connection.sessionId = sessionId;

      // Update in Redis
      await this.redis.setex(
        `connection:${connectionId}`,
        this.CONNECTION_TTL,
        JSON.stringify({
          ...connection,
          connected_at: connection.connected_at.toISOString(),
          last_ping: connection.last_ping.toISOString(),
          last_pong: connection.last_pong.toISOString(),
          last_message_at: connection.last_message_at?.toISOString()
        })
      );

      logger.info('Connection session updated', { 
        connectionId, 
        oldSessionId, 
        newSessionId: sessionId 
      });

    } catch (error) {
      logger.error('Failed to update connection session', { error, connectionId, sessionId });
      throw new Error(`Failed to update connection session: ${error.message}`);
    }
  }

  /**
   * Gets connection information by ID
   */
  async getConnection(connectionId: string): Promise<ConnectionState | null> {
    try {
      // Try local memory first
      const localConnection = this.connections.get(connectionId);
      if (localConnection) {
        return localConnection;
      }

      // Fallback to Redis (for cross-instance access)
      const connectionData = await this.redis.get(`connection:${connectionId}`);
      if (!connectionData) {
        return null;
      }

      const parsed = JSON.parse(connectionData);
      return {
        ...parsed,
        connected_at: new Date(parsed.connected_at),
        last_ping: new Date(parsed.last_ping),
        last_pong: new Date(parsed.last_pong),
        last_message_at: parsed.last_message_at ? new Date(parsed.last_message_at) : undefined
      };

    } catch (error) {
      logger.error('Failed to get connection', { error, connectionId });
      return null;
    }
  }

  /**
   * Gets all active connections for this gateway instance
   */
  async getActiveConnections(): Promise<ConnectionState[]> {
    try {
      return Array.from(this.connections.values());
    } catch (error) {
      logger.error('Failed to get active connections', { error });
      return [];
    }
  }

  /**
   * Gets connections for a specific user
   */
  async getUserConnections(userId: string): Promise<ConnectionState[]> {
    try {
      const connectionIds = await this.redis.smembers(`user_connections:${userId}`);
      const connections: ConnectionState[] = [];

      for (const connectionId of connectionIds) {
        const connection = await this.getConnection(connectionId);
        if (connection) {
          connections.push(connection);
        }
      }

      return connections;

    } catch (error) {
      logger.error('Failed to get user connections', { error, userId });
      return [];
    }
  }

  /**
   * Gets connections for a specific session
   */
  async getSessionConnections(sessionId: string): Promise<ConnectionState[]> {
    try {
      const connectionIds = await this.redis.smembers(`session_connections:${sessionId}`);
      const connections: ConnectionState[] = [];

      for (const connectionId of connectionIds) {
        const connection = await this.getConnection(connectionId);
        if (connection) {
          connections.push(connection);
        }
      }

      return connections;

    } catch (error) {
      logger.error('Failed to get session connections', { error, sessionId });
      return [];
    }
  }

  /**
   * Gets connections for a specific gateway instance
   */
  async getGatewayConnections(gatewayInstance: string): Promise<ConnectionState[]> {
    try {
      const connectionIds = await this.redis.smembers(`gateway_connections:${gatewayInstance}`);
      const connections: ConnectionState[] = [];

      for (const connectionId of connectionIds) {
        const connection = await this.getConnection(connectionId);
        if (connection) {
          connections.push(connection);
        }
      }

      return connections;

    } catch (error) {
      logger.error('Failed to get gateway connections', { error, gatewayInstance });
      return [];
    }
  }

  /**
   * Gets connection statistics including memory usage
   */
  async getConnectionStats(): Promise<{
    totalConnections: number;
    localConnections: number;
    averageMessageCount: number;
    healthyConnections: number;
    staleConnections: number;
    memory: {
      heapUsed: number;
      heapTotal: number; 
      rss: number;
      external: number;
      memoryPerConnection: number;
    };
  }> {
    try {
      const totalConnections = parseInt(await this.redis.get('global_connection_count') || '0');
      const localConnections = this.connections.size;

      let totalMessages = 0;
      let healthyConnections = 0;
      let staleConnections = 0;
      const now = Date.now();

      for (const connection of this.connections.values()) {
        totalMessages += connection.message_count;
        
        const timeSinceHeartbeat = now - connection.last_pong.getTime();
        if (timeSinceHeartbeat < this.HEARTBEAT_THRESHOLD) {
          healthyConnections++;
        } else {
          staleConnections++;
        }
      }

      const averageMessageCount = localConnections > 0 ? totalMessages / localConnections : 0;

      // Get memory usage
      const memoryUsage = process.memoryUsage();
      const heapUsedMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
      const heapTotalMB = Math.round(memoryUsage.heapTotal / 1024 / 1024);
      const rssMB = Math.round(memoryUsage.rss / 1024 / 1024);
      const externalMB = Math.round(memoryUsage.external / 1024 / 1024);
      const memoryPerConnection = localConnections > 0 ? Math.round(rssMB / localConnections) : 0;

      // Check for memory alerts
      this.checkMemoryUsage(memoryUsage, localConnections);

      return {
        totalConnections,
        localConnections,
        averageMessageCount,
        healthyConnections,
        staleConnections,
        memory: {
          heapUsed: heapUsedMB,
          heapTotal: heapTotalMB,
          rss: rssMB,
          external: externalMB,
          memoryPerConnection
        }
      };

    } catch (error) {
      logger.error('Failed to get connection stats', { error });
      return {
        totalConnections: 0,
        localConnections: 0,
        averageMessageCount: 0,
        healthyConnections: 0,
        staleConnections: 0,
        memory: {
          heapUsed: 0,
          heapTotal: 0,
          rss: 0,
          external: 0,
          memoryPerConnection: 0
        }
      };
    }
  }

  /**
   * Checks if a connection is healthy (recent heartbeat)
   */
  isConnectionHealthy(connectionId: string): boolean {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return false;
    }

    const timeSinceHeartbeat = Date.now() - connection.last_pong.getTime();
    return timeSinceHeartbeat < this.HEARTBEAT_THRESHOLD;
  }

  /**
   * Gets stale connections that need cleanup
   */
  getStaleConnections(): ConnectionState[] {
    const staleConnections: ConnectionState[] = [];
    const now = Date.now();

    for (const connection of this.connections.values()) {
      const timeSinceHeartbeat = now - connection.last_pong.getTime();
      if (timeSinceHeartbeat > this.HEARTBEAT_THRESHOLD) {
        staleConnections.push(connection);
      }
    }

    return staleConnections;
  }

  /**
   * Checks memory usage and logs warnings if thresholds are exceeded
   */
  private checkMemoryUsage(memoryUsage: NodeJS.MemoryUsage, connectionCount: number): void {
    const heapUsedMB = memoryUsage.heapUsed / 1024 / 1024;
    const heapTotalMB = memoryUsage.heapTotal / 1024 / 1024;
    const rssMB = memoryUsage.rss / 1024 / 1024;
    
    // Memory thresholds
    const HIGH_MEMORY_THRESHOLD_MB = 512; // 512MB
    const CRITICAL_MEMORY_THRESHOLD_MB = 1024; // 1GB
    const HIGH_HEAP_UTILIZATION = 0.9; // 90%
    const CRITICAL_HEAP_UTILIZATION = 0.95; // 95%
    
    const heapUtilization = heapUsedMB / heapTotalMB;
    
    // Check RSS memory usage
    if (rssMB > CRITICAL_MEMORY_THRESHOLD_MB) {
      logger.error('Critical memory usage detected', {
        rssMB: Math.round(rssMB),
        heapUsedMB: Math.round(heapUsedMB),
        connectionCount,
        memoryPerConnection: connectionCount > 0 ? Math.round(rssMB / connectionCount) : 0,
        recommendation: 'Consider reducing connection limits or restarting service'
      });
    } else if (rssMB > HIGH_MEMORY_THRESHOLD_MB) {
      logger.warn('High memory usage detected', {
        rssMB: Math.round(rssMB),
        heapUsedMB: Math.round(heapUsedMB),
        connectionCount,
        memoryPerConnection: connectionCount > 0 ? Math.round(rssMB / connectionCount) : 0,
        recommendation: 'Monitor memory usage closely'
      });
    }
    
    // Check heap utilization
    if (heapUtilization > CRITICAL_HEAP_UTILIZATION) {
      logger.error('Critical heap utilization detected', {
        heapUtilization: Math.round(heapUtilization * 100),
        heapUsedMB: Math.round(heapUsedMB),
        heapTotalMB: Math.round(heapTotalMB),
        recommendation: 'Immediate garbage collection needed or service restart'
      });
    } else if (heapUtilization > HIGH_HEAP_UTILIZATION) {
      logger.warn('High heap utilization detected', {
        heapUtilization: Math.round(heapUtilization * 100),
        heapUsedMB: Math.round(heapUsedMB),
        heapTotalMB: Math.round(heapTotalMB),
        recommendation: 'Consider garbage collection or reducing memory usage'
      });
    }
    
    // Log memory stats periodically at debug level
    if (connectionCount > 0 && connectionCount % 100 === 0) {
      logger.debug('Memory usage stats', {
        rssMB: Math.round(rssMB),
        heapUsedMB: Math.round(heapUsedMB),
        heapTotalMB: Math.round(heapTotalMB),
        heapUtilization: Math.round(heapUtilization * 100),
        connectionCount,
        memoryPerConnection: Math.round(rssMB / connectionCount)
      });
    }
  }

  /**
   * Starts heartbeat monitoring
   */
  private startHeartbeatMonitoring(): void {
    this.heartbeatInterval = setInterval(async () => {
      try {
        const staleConnections = this.getStaleConnections();

        if (staleConnections.length > 0) {
          logger.info('Found stale connections', { count: staleConnections.length });

          for (const connection of staleConnections) {
            logger.info('Cleaning up stale connection', {
              connectionId: connection.connectionId,
              userId: connection.userId,
              timeSinceHeartbeat: Date.now() - connection.last_pong.getTime()
            });

            await this.unregisterConnection(connection.connectionId);
          }
        }

        // Refresh TTL for healthy connections
        const refreshPromises: Promise<void>[] = [];
        for (const connection of this.connections.values()) {
          if (this.isConnectionHealthy(connection.connectionId)) {
            refreshPromises.push(
              this.redis.expire(`connection:${connection.connectionId}`, this.CONNECTION_TTL)
            );
          }
        }

        await Promise.allSettled(refreshPromises);

      } catch (error) {
        logger.error('Heartbeat monitoring failed', { error });
      }
    }, 30000); // Every 30 seconds
  }

  /**
   * Shuts down the connection manager
   */
  async shutdown(): Promise<void> {
    logger.info('Shutting down Connection Manager');

    // Clear heartbeat monitoring
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    // Clean up all connections
    const cleanupPromises: Promise<void>[] = [];
    for (const connectionId of this.connections.keys()) {
      cleanupPromises.push(this.unregisterConnection(connectionId));
    }

    await Promise.allSettled(cleanupPromises);

    logger.info('Connection Manager shutdown complete');
  }
}