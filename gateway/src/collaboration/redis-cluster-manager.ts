/**
 * Redis Cluster Manager
 * 
 * Coordinates multi-instance WebSocket gateway communication via Redis pub/sub,
 * enabling horizontal scaling with consistent message delivery across instances.
 */

import Redis from 'ioredis';
import { CollaborationMessage } from '@mcp-tools/core';
import { logger } from '../utils/logger.js';
import crypto from 'crypto';

interface RedisMessage {
  type: 'room_broadcast' | 'user_message' | 'instance_sync' | 'presence_update';
  gatewayInstanceId: string;
  timestamp: string;
  data: any;
  messageId: string;
}

export class RedisClusterManager {
  private subscriber: Redis;
  private publisher: Redis;
  private readonly gatewayInstanceId: string;
  private readonly channelPrefix = 'collaboration:';
  private subscribedChannels = new Set<string>();
  private heartbeatIntervalId: ReturnType<typeof setInterval> | null = null;

  // Callback functions for handling messages
  public onRoomMessage?: (roomId: string, message: CollaborationMessage, excludeConnectionId?: string) => Promise<void>;
  public onUserMessage?: (userId: string, message: CollaborationMessage) => Promise<void>;
  public onInstanceSync?: (data: any) => Promise<void>;
  public onPresenceUpdate?: (sessionId: string, userId: string, presence: any) => Promise<void>;

  constructor(
    private redis: Redis,
    gatewayInstanceId?: string
  ) {
    this.gatewayInstanceId = gatewayInstanceId || process.env.GATEWAY_INSTANCE_ID || crypto.randomUUID();
    
    // Create separate Redis connections for pub/sub
    this.subscriber = redis.duplicate();
    this.publisher = redis.duplicate();

    this.setupSubscriber();
    this.registerInstance();

    logger.info('Redis Cluster Manager initialized', {
      gatewayInstanceId: this.gatewayInstanceId,
      redisHost: redis.options.host,
      redisPort: redis.options.port
    });
  }

  /**
   * Sets up Redis subscriber for cross-instance communication
   */
  private setupSubscriber(): void {
    this.subscriber.on('message', async (channel: string, data: string) => {
      try {
        const message: RedisMessage = JSON.parse(data);

        // Ignore messages from the same instance to prevent loops
        if (message.gatewayInstanceId === this.gatewayInstanceId) {
          return;
        }

        await this.handleRedisMessage(channel, message);

      } catch (error) {
        logger.error('Failed to process Redis message', { error, channel, data });
      }
    });

    this.subscriber.on('pmessage', async (pattern: string, channel: string, data: string) => {
      try {
        const message: RedisMessage = JSON.parse(data);

        // Ignore messages from the same instance
        if (message.gatewayInstanceId === this.gatewayInstanceId) {
          return;
        }

        await this.handleRedisMessage(channel, message);

      } catch (error) {
        logger.error('Failed to process Redis pattern message', { error, pattern, channel, data });
      }
    });

    this.subscriber.on('error', (error) => {
      logger.error('Redis subscriber error', { error });
    });

    this.subscriber.on('connect', () => {
      logger.info('Redis subscriber connected');
    });

    this.subscriber.on('disconnect', () => {
      logger.warn('Redis subscriber disconnected');
    });
  }

  /**
   * Handles incoming Redis messages
   */
  private async handleRedisMessage(channel: string, message: RedisMessage): Promise<void> {
    try {
      switch (message.type) {
        case 'room_broadcast':
          if (this.onRoomMessage) {
            await this.onRoomMessage(
              message.data.roomId,
              message.data.collaborationMessage,
              message.data.excludeConnectionId
            );
          }
          break;

        case 'user_message':
          if (this.onUserMessage) {
            await this.onUserMessage(
              message.data.userId,
              message.data.collaborationMessage
            );
          }
          break;

        case 'instance_sync':
          if (this.onInstanceSync) {
            await this.onInstanceSync(message.data);
          }
          break;

        case 'presence_update':
          if (this.onPresenceUpdate) {
            await this.onPresenceUpdate(
              message.data.sessionId,
              message.data.userId,
              message.data.presence
            );
          }
          break;

        default:
          logger.warn('Unknown Redis message type', { type: message.type, channel });
      }

    } catch (error) {
      logger.error('Failed to handle Redis message', { error, channel, messageType: message.type });
    }
  }

  /**
   * Registers this gateway instance in Redis
   */
  private async registerInstance(): Promise<void> {
    try {
      const instanceData = {
        instanceId: this.gatewayInstanceId,
        hostname: require('os').hostname(),
        pid: process.pid,
        startTime: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0'
      };

      // Register instance with TTL
      await this.publisher.setex(
        `${this.channelPrefix}instance:${this.gatewayInstanceId}`,
        60, // 1 minute TTL
        JSON.stringify(instanceData)
      );

      // Add to active instances set
      await this.publisher.sadd(`${this.channelPrefix}active_instances`, this.gatewayInstanceId);

      // Subscribe to instance management channels
      await this.subscriber.subscribe(`${this.channelPrefix}instance_sync`);

      // Start instance heartbeat
      this.startInstanceHeartbeat();

      logger.info('Gateway instance registered', { instanceData });

    } catch (error) {
      logger.error('Failed to register gateway instance', { error });
      throw error;
    }
  }

  /**
   * Starts instance heartbeat to maintain registration
   */
  private startInstanceHeartbeat(): void {
    this.heartbeatIntervalId = setInterval(async () => {
      try {
        await this.publisher.setex(
          `${this.channelPrefix}instance:${this.gatewayInstanceId}`,
          60,
          JSON.stringify({
            instanceId: this.gatewayInstanceId,
            hostname: require('os').hostname(),
            pid: process.pid,
            lastHeartbeat: new Date().toISOString(),
            uptime: process.uptime()
          })
        );

        await this.publisher.sadd(`${this.channelPrefix}active_instances`, this.gatewayInstanceId);

      } catch (error) {
        logger.error('Instance heartbeat failed', { error });
      }
    }, 30000); // Every 30 seconds
  }

  /**
   * Broadcasts a message to all instances handling a specific room
   */
  async broadcastToRoom(roomId: string, message: CollaborationMessage, excludeConnectionId?: string): Promise<void> {
    try {
      const redisMessage: RedisMessage = {
        type: 'room_broadcast',
        gatewayInstanceId: this.gatewayInstanceId,
        timestamp: new Date().toISOString(),
        messageId: crypto.randomUUID(),
        data: {
          roomId,
          collaborationMessage: {
            ...message,
            timestamp: message.timestamp.toISOString()
          },
          excludeConnectionId
        }
      };

      // Publish to room-specific channel
      const channel = `${this.channelPrefix}room:${roomId}`;
      await this.publisher.publish(channel, JSON.stringify(redisMessage));

      logger.debug('Message broadcasted to room via Redis', { 
        roomId, 
        messageType: message.type,
        channel
      });

    } catch (error) {
      logger.error('Failed to broadcast message to room via Redis', { error, roomId });
      throw error;
    }
  }

  /**
   * Sends a message to all instances handling a specific user
   */
  async sendToUser(userId: string, message: CollaborationMessage): Promise<void> {
    try {
      const redisMessage: RedisMessage = {
        type: 'user_message',
        gatewayInstanceId: this.gatewayInstanceId,
        timestamp: new Date().toISOString(),
        messageId: crypto.randomUUID(),
        data: {
          userId,
          collaborationMessage: {
            ...message,
            timestamp: message.timestamp.toISOString()
          }
        }
      };

      // Publish to user-specific channel
      const channel = `${this.channelPrefix}user:${userId}`;
      await this.publisher.publish(channel, JSON.stringify(redisMessage));

      logger.debug('Message sent to user via Redis', { 
        userId, 
        messageType: message.type,
        channel
      });

    } catch (error) {
      logger.error('Failed to send message to user via Redis', { error, userId });
      throw error;
    }
  }

  /**
   * Broadcasts presence updates across instances
   */
  async broadcastPresenceUpdate(sessionId: string, userId: string, presence: any): Promise<void> {
    try {
      const redisMessage: RedisMessage = {
        type: 'presence_update',
        gatewayInstanceId: this.gatewayInstanceId,
        timestamp: new Date().toISOString(),
        messageId: crypto.randomUUID(),
        data: {
          sessionId,
          userId,
          presence
        }
      };

      // Publish to session-specific presence channel
      const channel = `${this.channelPrefix}presence:${sessionId}`;
      await this.publisher.publish(channel, JSON.stringify(redisMessage));

      logger.debug('Presence update broadcasted via Redis', { 
        sessionId, 
        userId,
        channel
      });

    } catch (error) {
      logger.error('Failed to broadcast presence update via Redis', { error, sessionId, userId });
      throw error;
    }
  }

  /**
   * Subscribes to room-specific Redis channels
   */
  async subscribeToRoomChannel(roomId: string): Promise<void> {
    try {
      const channel = `${this.channelPrefix}room:${roomId}`;
      
      if (!this.subscribedChannels.has(channel)) {
        await this.subscriber.subscribe(channel);
        this.subscribedChannels.add(channel);
        
        logger.debug('Subscribed to room channel', { roomId, channel });
      }

    } catch (error) {
      logger.error('Failed to subscribe to room channel', { error, roomId });
      throw error;
    }
  }

  /**
   * Unsubscribes from room-specific Redis channels
   */
  async unsubscribeFromRoomChannel(roomId: string): Promise<void> {
    try {
      const channel = `${this.channelPrefix}room:${roomId}`;
      
      if (this.subscribedChannels.has(channel)) {
        await this.subscriber.unsubscribe(channel);
        this.subscribedChannels.delete(channel);
        
        logger.debug('Unsubscribed from room channel', { roomId, channel });
      }

    } catch (error) {
      logger.error('Failed to unsubscribe from room channel', { error, roomId });
      // Don't throw - unsubscription failures are non-critical
    }
  }

  /**
   * Subscribes to user-specific Redis channels
   */
  async subscribeToUserChannel(userId: string): Promise<void> {
    try {
      const channel = `${this.channelPrefix}user:${userId}`;
      
      if (!this.subscribedChannels.has(channel)) {
        await this.subscriber.subscribe(channel);
        this.subscribedChannels.add(channel);
        
        logger.debug('Subscribed to user channel', { userId, channel });
      }

    } catch (error) {
      logger.error('Failed to subscribe to user channel', { error, userId });
      throw error;
    }
  }

  /**
   * Unsubscribes from user-specific Redis channels
   */
  async unsubscribeFromUserChannel(userId: string): Promise<void> {
    try {
      const channel = `${this.channelPrefix}user:${userId}`;
      
      if (this.subscribedChannels.has(channel)) {
        await this.subscriber.unsubscribe(channel);
        this.subscribedChannels.delete(channel);
        
        logger.debug('Unsubscribed from user channel', { userId, channel });
      }

    } catch (error) {
      logger.error('Failed to unsubscribe from user channel', { error, userId });
      // Don't throw - unsubscription failures are non-critical
    }
  }

  /**
   * Subscribes to session presence channels
   */
  async subscribeToPresenceChannel(sessionId: string): Promise<void> {
    try {
      const channel = `${this.channelPrefix}presence:${sessionId}`;
      
      if (!this.subscribedChannels.has(channel)) {
        await this.subscriber.subscribe(channel);
        this.subscribedChannels.add(channel);
        
        logger.debug('Subscribed to presence channel', { sessionId, channel });
      }

    } catch (error) {
      logger.error('Failed to subscribe to presence channel', { error, sessionId });
      throw error;
    }
  }

  /**
   * Synchronizes instance state with other gateway instances
   */
  async syncInstanceState(data: any): Promise<void> {
    try {
      const redisMessage: RedisMessage = {
        type: 'instance_sync',
        gatewayInstanceId: this.gatewayInstanceId,
        timestamp: new Date().toISOString(),
        messageId: crypto.randomUUID(),
        data
      };

      await this.publisher.publish(`${this.channelPrefix}instance_sync`, JSON.stringify(redisMessage));

      logger.debug('Instance state synchronized', { data });

    } catch (error) {
      logger.error('Failed to sync instance state', { error });
      throw error;
    }
  }

  /**
   * Gets list of active gateway instances
   */
  async getActiveInstances(): Promise<string[]> {
    try {
      const instances = await this.publisher.smembers(`${this.channelPrefix}active_instances`);
      
      // Filter out stale instances
      const activeInstances: string[] = [];
      for (const instanceId of instances) {
        const exists = await this.publisher.exists(`${this.channelPrefix}instance:${instanceId}`);
        if (exists) {
          activeInstances.push(instanceId);
        } else {
          // Remove stale instance from set
          await this.publisher.srem(`${this.channelPrefix}active_instances`, instanceId);
        }
      }

      return activeInstances;

    } catch (error) {
      logger.error('Failed to get active instances', { error });
      return [];
    }
  }

  /**
   * Gets detailed information about all active instances
   */
  async getInstanceDetails(): Promise<any[]> {
    try {
      const instances = await this.getActiveInstances();
      const details: any[] = [];

      for (const instanceId of instances) {
        const data = await this.publisher.get(`${this.channelPrefix}instance:${instanceId}`);
        if (data) {
          details.push(JSON.parse(data));
        }
      }

      return details;

    } catch (error) {
      logger.error('Failed to get instance details', { error });
      return [];
    }
  }

  /**
   * Gets cluster statistics
   */
  async getClusterStats(): Promise<{
    totalInstances: number;
    totalConnections: number;
    messagesPerSecond: number;
    activeChannels: number;
  }> {
    try {
      const instances = await this.getActiveInstances();
      const totalInstances = instances.length;
      
      // Get total connections across all instances
      const totalConnections = parseInt(await this.publisher.get('global_connection_count') || '0');
      
      // Get messages per second (approximation based on recent activity)
      const messagesPerSecond = await this.getRecentMessageRate();
      
      const activeChannels = this.subscribedChannels.size;

      return {
        totalInstances,
        totalConnections,
        messagesPerSecond,
        activeChannels
      };

    } catch (error) {
      logger.error('Failed to get cluster stats', { error });
      return {
        totalInstances: 0,
        totalConnections: 0,
        messagesPerSecond: 0,
        activeChannels: 0
      };
    }
  }

  /**
   * Estimates recent message rate
   */
  private async getRecentMessageRate(): Promise<number> {
    try {
      // This is a simple approximation - in production, you might want
      // a more sophisticated message rate tracking system
      const key = `${this.channelPrefix}message_rate:${Math.floor(Date.now() / 1000)}`;
      const rate = await this.publisher.get(key);
      return parseInt(rate || '0');

    } catch (error) {
      logger.error('Failed to get recent message rate', { error });
      return 0;
    }
  }

  /**
   * Records a message for rate tracking
   */
  async recordMessage(): Promise<void> {
    try {
      const key = `${this.channelPrefix}message_rate:${Math.floor(Date.now() / 1000)}`;
      await this.publisher.incr(key);
      await this.publisher.expire(key, 60); // Expire after 1 minute

    } catch (error) {
      logger.error('Failed to record message rate', { error });
      // Don't throw - rate recording is non-critical
    }
  }

  /**
   * Shuts down the Redis cluster manager
   */
  async shutdown(): Promise<void> {
    logger.info('Shutting down Redis Cluster Manager');

    try {
      // Stop heartbeat
      if (this.heartbeatIntervalId) {
        clearInterval(this.heartbeatIntervalId);
        this.heartbeatIntervalId = null;
      }

      // Unsubscribe from all channels
      const unsubscribePromises: Promise<number>[] = [];
      for (const channel of this.subscribedChannels) {
        unsubscribePromises.push(this.subscriber.unsubscribe(channel));
      }
      await Promise.allSettled(unsubscribePromises);

      // Remove instance from active set
      await this.publisher.srem(`${this.channelPrefix}active_instances`, this.gatewayInstanceId);
      
      // Delete instance key
      await this.publisher.del(`${this.channelPrefix}instance:${this.gatewayInstanceId}`);

      // Disconnect Redis connections
      this.subscriber.disconnect();
      this.publisher.disconnect();

      logger.info('Redis Cluster Manager shutdown complete');

    } catch (error) {
      logger.error('Error during Redis Cluster Manager shutdown', { error });
    }
  }
}