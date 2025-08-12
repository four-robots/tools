/**
 * WebSocket Connection Manager
 * 
 * Prevents memory leaks by properly managing WebSocket connections,
 * implementing connection pooling, and handling graceful cleanup.
 */

import { Socket } from 'socket.io';
import { Logger } from '@mcp-tools/core/utils/logger';
import { getGlobalEventThrottler } from './event-throttler.js';
import { getGlobalRateLimiter } from './rate-limiter.js';

interface ConnectionMetrics {
  connectedAt: number;
  lastActivity: number;
  messageCount: number;
  errorCount: number;
  bytesReceived: number;
  bytesSent: number;
}

interface ManagedConnection {
  socket: Socket;
  userId?: string;
  sessionId: string;
  whiteboardId?: string;
  metrics: ConnectionMetrics;
  cleanupTasks: Array<() => Promise<void> | void>;
  timeouts: Set<NodeJS.Timeout>;
  intervals: Set<NodeJS.Timeout>;
  eventListeners: Set<string>;
}

interface ConnectionLimits {
  maxConnectionsPerUser: number;
  maxConnectionsPerIP: number;
  maxConnectionsGlobal: number;
  maxIdleTimeMs: number;
  maxConnectionAgeMs: number;
  heartbeatIntervalMs: number;
  gracefulShutdownTimeoutMs: number;
}

export class WebSocketConnectionManager {
  private connections = new Map<string, ManagedConnection>();
  private userConnections = new Map<string, Set<string>>();
  private ipConnections = new Map<string, Set<string>>();
  private logger: Logger;
  private limits: ConnectionLimits;
  private cleanupInterval: NodeJS.Timeout;
  private heartbeatInterval: NodeJS.Timeout;
  private isShuttingDown = false;

  constructor(limits?: Partial<ConnectionLimits>) {
    this.logger = new Logger('WebSocketConnectionManager');
    
    this.limits = {
      maxConnectionsPerUser: 10,
      maxConnectionsPerIP: 25,
      maxConnectionsGlobal: 1000,
      maxIdleTimeMs: 30 * 60 * 1000, // 30 minutes
      maxConnectionAgeMs: 4 * 60 * 60 * 1000, // 4 hours
      heartbeatIntervalMs: 30 * 1000, // 30 seconds
      gracefulShutdownTimeoutMs: 10 * 1000, // 10 seconds
      ...limits,
    };

    // Periodic cleanup of stale connections
    this.cleanupInterval = setInterval(() => {
      this.performConnectionCleanup();
    }, 60 * 1000); // Every minute

    // Heartbeat to detect dead connections
    this.heartbeatInterval = setInterval(() => {
      this.performHeartbeat();
    }, this.limits.heartbeatIntervalMs);

    this.logger.info('Connection manager initialized', { limits: this.limits });
  }

  /**
   * Register a new WebSocket connection
   */
  registerConnection(
    socket: Socket,
    sessionId: string,
    userId?: string
  ): {
    allowed: boolean;
    reason?: string;
    connectionId?: string;
  } {
    const connectionId = socket.id;
    const clientIP = socket.handshake.address;
    const now = Date.now();

    // Check global connection limit
    if (this.connections.size >= this.limits.maxConnectionsGlobal) {
      this.logger.warn('Global connection limit exceeded', {
        current: this.connections.size,
        limit: this.limits.maxConnectionsGlobal,
        clientIP,
      });
      return { allowed: false, reason: 'GLOBAL_LIMIT_EXCEEDED' };
    }

    // Check per-user connection limit
    if (userId) {
      const userConnections = this.userConnections.get(userId);
      if (userConnections && userConnections.size >= this.limits.maxConnectionsPerUser) {
        this.logger.warn('Per-user connection limit exceeded', {
          userId,
          current: userConnections.size,
          limit: this.limits.maxConnectionsPerUser,
          clientIP,
        });
        return { allowed: false, reason: 'USER_LIMIT_EXCEEDED' };
      }
    }

    // Check per-IP connection limit
    const ipConnections = this.ipConnections.get(clientIP);
    if (ipConnections && ipConnections.size >= this.limits.maxConnectionsPerIP) {
      this.logger.warn('Per-IP connection limit exceeded', {
        clientIP,
        current: ipConnections.size,
        limit: this.limits.maxConnectionsPerIP,
      });
      return { allowed: false, reason: 'IP_LIMIT_EXCEEDED' };
    }

    // Create managed connection
    const managedConnection: ManagedConnection = {
      socket,
      userId,
      sessionId,
      metrics: {
        connectedAt: now,
        lastActivity: now,
        messageCount: 0,
        errorCount: 0,
        bytesReceived: 0,
        bytesSent: 0,
      },
      cleanupTasks: [],
      timeouts: new Set(),
      intervals: new Set(),
      eventListeners: new Set(),
    };

    // Register connection
    this.connections.set(connectionId, managedConnection);

    // Track by user
    if (userId) {
      if (!this.userConnections.has(userId)) {
        this.userConnections.set(userId, new Set());
      }
      this.userConnections.get(userId)!.add(connectionId);
    }

    // Track by IP
    if (!this.ipConnections.has(clientIP)) {
      this.ipConnections.set(clientIP, new Set());
    }
    this.ipConnections.get(clientIP)!.add(connectionId);

    // Set up connection monitoring
    this.setupConnectionMonitoring(managedConnection);

    this.logger.info('Connection registered', {
      connectionId,
      userId,
      sessionId,
      clientIP,
      totalConnections: this.connections.size,
    });

    return { allowed: true, connectionId };
  }

  /**
   * Unregister a WebSocket connection with proper cleanup
   */
  async unregisterConnection(connectionId: string, reason?: string): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return;
    }

    const { userId, socket, cleanupTasks, timeouts, intervals } = connection;
    const clientIP = socket.handshake.address;

    this.logger.info('Unregistering connection', {
      connectionId,
      userId,
      reason,
      clientIP,
      connectionAge: Date.now() - connection.metrics.connectedAt,
      messageCount: connection.metrics.messageCount,
    });

    try {
      // Execute cleanup tasks
      for (const cleanupTask of cleanupTasks) {
        try {
          await cleanupTask();
        } catch (error) {
          this.logger.error('Error in cleanup task', {
            error: error instanceof Error ? error.message : String(error),
            connectionId,
          });
        }
      }

      // Clear timeouts and intervals
      timeouts.forEach(timeout => clearTimeout(timeout));
      intervals.forEach(interval => clearInterval(interval));

      // Remove event listeners to prevent memory leaks
      connection.eventListeners.forEach(eventName => {
        socket.removeAllListeners(eventName);
      });

      // Remove from tracking maps
      this.connections.delete(connectionId);

      if (userId) {
        const userConnections = this.userConnections.get(userId);
        if (userConnections) {
          userConnections.delete(connectionId);
          if (userConnections.size === 0) {
            this.userConnections.delete(userId);
          }
        }
      }

      const ipConnections = this.ipConnections.get(clientIP);
      if (ipConnections) {
        ipConnections.delete(connectionId);
        if (ipConnections.size === 0) {
          this.ipConnections.delete(clientIP);
        }
      }

    } catch (error) {
      this.logger.error('Error during connection cleanup', {
        error: error instanceof Error ? error.message : String(error),
        connectionId,
        userId,
      });
    }
  }

  /**
   * Add a cleanup task to run when connection is closed
   */
  addCleanupTask(connectionId: string, task: () => Promise<void> | void): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      connection.cleanupTasks.push(task);
    }
  }

  /**
   * Track a timeout for automatic cleanup
   */
  addTimeout(connectionId: string, timeout: NodeJS.Timeout): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      connection.timeouts.add(timeout);
    }
  }

  /**
   * Track an interval for automatic cleanup
   */
  addInterval(connectionId: string, interval: NodeJS.Timeout): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      connection.intervals.add(interval);
    }
  }

  /**
   * Track an event listener for cleanup
   */
  addEventListener(connectionId: string, eventName: string): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      connection.eventListeners.add(eventName);
    }
  }

  /**
   * Update connection activity
   */
  updateActivity(connectionId: string, messageSize?: number): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      connection.metrics.lastActivity = Date.now();
      connection.metrics.messageCount++;
      if (messageSize) {
        connection.metrics.bytesReceived += messageSize;
      }
    }
  }

  /**
   * Record connection error
   */
  recordError(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      connection.metrics.errorCount++;
    }
  }

  /**
   * Get connection statistics
   */
  getStatistics(): {
    totalConnections: number;
    connectionsByUser: number;
    connectionsByIP: number;
    averageConnectionAge: number;
    averageMessagesPerConnection: number;
    totalErrors: number;
    memoryUsage: NodeJS.MemoryUsage;
  } {
    const now = Date.now();
    let totalAge = 0;
    let totalMessages = 0;
    let totalErrors = 0;

    for (const connection of this.connections.values()) {
      totalAge += now - connection.metrics.connectedAt;
      totalMessages += connection.metrics.messageCount;
      totalErrors += connection.metrics.errorCount;
    }

    const connectionCount = this.connections.size;

    return {
      totalConnections: connectionCount,
      connectionsByUser: this.userConnections.size,
      connectionsByIP: this.ipConnections.size,
      averageConnectionAge: connectionCount > 0 ? totalAge / connectionCount : 0,
      averageMessagesPerConnection: connectionCount > 0 ? totalMessages / connectionCount : 0,
      totalErrors,
      memoryUsage: process.memoryUsage(),
    };
  }

  /**
   * Gracefully shutdown all connections
   */
  async gracefulShutdown(): Promise<void> {
    this.isShuttingDown = true;
    
    this.logger.info('Starting graceful shutdown', {
      totalConnections: this.connections.size,
    });

    // Clear intervals
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    // Notify all connections of shutdown
    const shutdownPromises: Promise<void>[] = [];
    
    for (const [connectionId, connection] of this.connections.entries()) {
      shutdownPromises.push(
        this.gracefullyCloseConnection(connectionId, connection)
      );
    }

    // Wait for all connections to close or timeout
    try {
      await Promise.race([
        Promise.all(shutdownPromises),
        new Promise<void>(resolve => {
          setTimeout(resolve, this.limits.gracefulShutdownTimeoutMs);
        })
      ]);
    } catch (error) {
      this.logger.error('Error during graceful shutdown', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Force close any remaining connections
    for (const connectionId of this.connections.keys()) {
      await this.unregisterConnection(connectionId, 'FORCE_SHUTDOWN');
    }

    this.logger.info('Graceful shutdown completed');
  }

  /**
   * Set up monitoring for a connection
   */
  private setupConnectionMonitoring(connection: ManagedConnection): void {
    const { socket } = connection;

    // Monitor for disconnect
    socket.on('disconnect', async (reason) => {
      await this.unregisterConnection(socket.id, reason);
    });

    // Monitor for errors
    socket.on('error', (error) => {
      this.recordError(socket.id);
      this.logger.error('Socket error', {
        connectionId: socket.id,
        error: error instanceof Error ? error.message : String(error),
      });
    });

    // Track event listeners
    this.addEventListener(socket.id, 'disconnect');
    this.addEventListener(socket.id, 'error');
  }

  /**
   * Perform periodic connection cleanup
   */
  private performConnectionCleanup(): void {
    if (this.isShuttingDown) {
      return;
    }

    const now = Date.now();
    const connectionsToClose: string[] = [];

    for (const [connectionId, connection] of this.connections.entries()) {
      const age = now - connection.metrics.connectedAt;
      const idle = now - connection.metrics.lastActivity;

      // Check for maximum age
      if (age > this.limits.maxConnectionAgeMs) {
        connectionsToClose.push(connectionId);
        this.logger.info('Closing connection due to age limit', {
          connectionId,
          age,
          limit: this.limits.maxConnectionAgeMs,
        });
        continue;
      }

      // Check for idle timeout
      if (idle > this.limits.maxIdleTimeMs) {
        connectionsToClose.push(connectionId);
        this.logger.info('Closing connection due to idle timeout', {
          connectionId,
          idle,
          limit: this.limits.maxIdleTimeMs,
        });
        continue;
      }

      // Check for excessive errors
      if (connection.metrics.errorCount > 100) {
        connectionsToClose.push(connectionId);
        this.logger.warn('Closing connection due to excessive errors', {
          connectionId,
          errorCount: connection.metrics.errorCount,
        });
        continue;
      }
    }

    // Close problematic connections
    for (const connectionId of connectionsToClose) {
      const connection = this.connections.get(connectionId);
      if (connection) {
        connection.socket.disconnect(true);
      }
    }

    if (connectionsToClose.length > 0) {
      this.logger.info('Connection cleanup completed', {
        closedConnections: connectionsToClose.length,
        remainingConnections: this.connections.size,
      });
    }
  }

  /**
   * Perform heartbeat to detect dead connections
   */
  private performHeartbeat(): void {
    if (this.isShuttingDown) {
      return;
    }

    let deadConnections = 0;

    for (const [connectionId, connection] of this.connections.entries()) {
      try {
        // Check if socket is still connected
        if (!connection.socket.connected) {
          this.unregisterConnection(connectionId, 'HEARTBEAT_DEAD');
          deadConnections++;
        } else {
          // Send ping if needed (Socket.IO handles this automatically)
          connection.socket.emit('ping');
        }
      } catch (error) {
        this.logger.error('Error during heartbeat', {
          connectionId,
          error: error instanceof Error ? error.message : String(error),
        });
        this.unregisterConnection(connectionId, 'HEARTBEAT_ERROR');
        deadConnections++;
      }
    }

    if (deadConnections > 0) {
      this.logger.info('Heartbeat cleanup completed', {
        deadConnections,
        remainingConnections: this.connections.size,
      });
    }
  }

  /**
   * Gracefully close a single connection
   */
  private async gracefullyCloseConnection(
    connectionId: string,
    connection: ManagedConnection
  ): Promise<void> {
    try {
      // Send shutdown notification
      connection.socket.emit('system:shutdown', {
        reason: 'SERVER_SHUTDOWN',
        gracePeriodMs: this.limits.gracefulShutdownTimeoutMs,
      });

      // Wait briefly for client to close gracefully
      await new Promise<void>(resolve => {
        const timeout = setTimeout(resolve, 1000);
        connection.socket.once('disconnect', () => {
          clearTimeout(timeout);
          resolve();
        });
      });

    } catch (error) {
      this.logger.error('Error during graceful connection close', {
        connectionId,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      // Ensure connection is cleaned up
      await this.unregisterConnection(connectionId, 'GRACEFUL_SHUTDOWN');
    }
  }
}

// Global connection manager instance
let globalConnectionManager: WebSocketConnectionManager | null = null;

export function getGlobalConnectionManager(
  limits?: Partial<ConnectionLimits>
): WebSocketConnectionManager {
  if (!globalConnectionManager) {
    globalConnectionManager = new WebSocketConnectionManager(limits);
  }
  return globalConnectionManager;
}

export function destroyGlobalConnectionManager(): Promise<void> {
  if (globalConnectionManager) {
    const manager = globalConnectionManager;
    globalConnectionManager = null;
    return manager.gracefulShutdown();
  }
  return Promise.resolve();
}