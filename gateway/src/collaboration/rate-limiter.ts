/**
 * Rate Limiter
 * 
 * Protects against abuse with Redis-backed rate limiting and connection throttling
 * using token bucket and sliding window algorithms for WebSocket collaborations.
 */

import Redis from 'ioredis';
import { logger } from '../utils/logger.js';

export interface RateLimitConfig {
  maxMessagesPerSecond: number;
  burstAllowance: number;
  penaltyDuration: number;
  windowSize?: number; // Sliding window size in seconds
  maxConnectionsPerUser?: number;
  maxConnectionsPerIP?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: Date;
  penaltyUntil?: Date;
  reason?: string;
}

export class RateLimiter {
  private readonly keyPrefix = 'rate_limit:';
  private readonly defaultConfig: Required<RateLimitConfig> = {
    maxMessagesPerSecond: 10,
    burstAllowance: 20,
    penaltyDuration: 5000,
    windowSize: 60,
    maxConnectionsPerUser: 10,
    maxConnectionsPerIP: 100
  };

  constructor(
    private redis: Redis,
    private config: RateLimitConfig = {}
  ) {
    // Merge with defaults
    this.config = { ...this.defaultConfig, ...config };

    logger.info('Rate Limiter initialized', {
      maxMessagesPerSecond: this.config.maxMessagesPerSecond,
      burstAllowance: this.config.burstAllowance,
      penaltyDuration: this.config.penaltyDuration,
      windowSize: this.config.windowSize,
      maxConnectionsPerUser: this.config.maxConnectionsPerUser,
      maxConnectionsPerIP: this.config.maxConnectionsPerIP
    });
  }

  /**
   * Checks if a user/connection is allowed to send a message
   */
  async checkRateLimit(userId: string, connectionId?: string, ipAddress?: string): Promise<boolean> {
    try {
      const results = await Promise.allSettled([
        this.checkMessageRateLimit(userId, connectionId),
        this.checkConnectionLimit(userId, 'user'),
        ipAddress ? this.checkConnectionLimit(ipAddress, 'ip') : Promise.resolve({ allowed: true } as RateLimitResult)
      ]);

      // Check if any rate limit was violated
      for (const result of results) {
        if (result.status === 'fulfilled' && !result.value.allowed) {
          logger.warn('Rate limit exceeded', {
            userId,
            connectionId,
            ipAddress,
            reason: result.value.reason
          });
          return false;
        }
      }

      return true;

    } catch (error) {
      logger.error('Failed to check rate limit', { error, userId, connectionId, ipAddress });
      // Fail open - allow the request if rate limiting fails
      return true;
    }
  }

  /**
   * Checks message rate limit using token bucket algorithm
   */
  async checkMessageRateLimit(userId: string, connectionId?: string): Promise<RateLimitResult> {
    try {
      const key = `${this.keyPrefix}messages:${userId}`;
      const penaltyKey = `${this.keyPrefix}penalty:${userId}`;
      const now = Math.floor(Date.now() / 1000);

      // Check if user is in penalty
      const penaltyUntil = await this.redis.get(penaltyKey);
      if (penaltyUntil && parseInt(penaltyUntil) > now) {
        return {
          allowed: false,
          remaining: 0,
          resetTime: new Date((parseInt(penaltyUntil)) * 1000),
          penaltyUntil: new Date((parseInt(penaltyUntil)) * 1000),
          reason: 'User in penalty period'
        };
      }

      // Use Lua script for atomic token bucket operations
      const luaScript = `
        local key = KEYS[1]
        local now = tonumber(ARGV[1])
        local max_tokens = tonumber(ARGV[2])
        local refill_rate = tonumber(ARGV[3])
        local burst_allowance = tonumber(ARGV[4])
        local penalty_key = KEYS[2]
        local penalty_duration = tonumber(ARGV[5])
        
        local bucket = redis.call('HMGET', key, 'tokens', 'last_refill')
        local tokens = tonumber(bucket[1]) or max_tokens
        local last_refill = tonumber(bucket[2]) or now
        
        -- Calculate tokens to add
        local time_passed = now - last_refill
        local tokens_to_add = math.floor(time_passed * refill_rate)
        tokens = math.min(tokens + tokens_to_add, max_tokens + burst_allowance)
        
        if tokens >= 1 then
          tokens = tokens - 1
          redis.call('HMSET', key, 'tokens', tokens, 'last_refill', now)
          redis.call('EXPIRE', key, 3600) -- 1 hour TTL
          return {1, tokens, now}
        else
          -- Apply penalty if user exceeded burst allowance significantly
          if tokens < -burst_allowance then
            redis.call('SET', penalty_key, now + penalty_duration, 'EX', penalty_duration)
          end
          
          redis.call('HMSET', key, 'tokens', tokens, 'last_refill', now)
          redis.call('EXPIRE', key, 3600)
          return {0, 0, now}
        end
      `;

      const result = await this.redis.eval(
        luaScript,
        2,
        key,
        penaltyKey,
        now.toString(),
        this.config.maxMessagesPerSecond!.toString(),
        (this.config.maxMessagesPerSecond! / this.config.windowSize!).toString(),
        this.config.burstAllowance!.toString(),
        Math.floor(this.config.penaltyDuration! / 1000).toString()
      ) as [number, number, number];

      const allowed = result[0] === 1;
      const remaining = result[1];
      const resetTime = new Date((result[2] + this.config.windowSize!) * 1000);

      if (allowed && connectionId) {
        // Track message for this connection
        await this.recordMessage(userId, connectionId);
      }

      return {
        allowed,
        remaining,
        resetTime,
        reason: allowed ? undefined : 'Message rate limit exceeded'
      };

    } catch (error) {
      logger.error('Failed to check message rate limit', { error, userId, connectionId });
      return {
        allowed: true,
        remaining: this.config.maxMessagesPerSecond!,
        resetTime: new Date(Date.now() + this.config.windowSize! * 1000)
      };
    }
  }

  /**
   * Checks connection limit for user or IP
   */
  async checkConnectionLimit(identifier: string, type: 'user' | 'ip'): Promise<RateLimitResult> {
    try {
      const key = `${this.keyPrefix}connections:${type}:${identifier}`;
      const maxConnections = type === 'user' ? this.config.maxConnectionsPerUser! : this.config.maxConnectionsPerIP!;

      const currentConnections = await this.redis.scard(key);
      const allowed = currentConnections < maxConnections;
      const remaining = Math.max(0, maxConnections - currentConnections);

      return {
        allowed,
        remaining,
        resetTime: new Date(Date.now() + 60000), // Reset in 1 minute
        reason: allowed ? undefined : `Too many connections for ${type}`
      };

    } catch (error) {
      logger.error('Failed to check connection limit', { error, identifier, type });
      return {
        allowed: true,
        remaining: type === 'user' ? this.config.maxConnectionsPerUser! : this.config.maxConnectionsPerIP!,
        resetTime: new Date(Date.now() + 60000)
      };
    }
  }

  /**
   * Registers a new connection for rate limiting
   */
  async registerConnection(userId: string, connectionId: string, ipAddress?: string): Promise<void> {
    try {
      const promises: Promise<any>[] = [
        // Add to user connections set
        this.redis.sadd(`${this.keyPrefix}connections:user:${userId}`, connectionId),
        this.redis.expire(`${this.keyPrefix}connections:user:${userId}`, 300) // 5 minutes
      ];

      if (ipAddress) {
        promises.push(
          this.redis.sadd(`${this.keyPrefix}connections:ip:${ipAddress}`, connectionId),
          this.redis.expire(`${this.keyPrefix}connections:ip:${ipAddress}`, 300)
        );
      }

      await Promise.all(promises);

      logger.debug('Connection registered for rate limiting', {
        userId,
        connectionId,
        ipAddress
      });

    } catch (error) {
      logger.error('Failed to register connection for rate limiting', {
        error,
        userId,
        connectionId,
        ipAddress
      });
    }
  }

  /**
   * Unregisters a connection from rate limiting
   */
  async unregisterConnection(userId: string, connectionId: string, ipAddress?: string): Promise<void> {
    try {
      const promises: Promise<any>[] = [
        this.redis.srem(`${this.keyPrefix}connections:user:${userId}`, connectionId)
      ];

      if (ipAddress) {
        promises.push(
          this.redis.srem(`${this.keyPrefix}connections:ip:${ipAddress}`, connectionId)
        );
      }

      await Promise.all(promises);

      logger.debug('Connection unregistered from rate limiting', {
        userId,
        connectionId,
        ipAddress
      });

    } catch (error) {
      logger.error('Failed to unregister connection from rate limiting', {
        error,
        userId,
        connectionId,
        ipAddress
      });
    }
  }

  /**
   * Records a message for analytics and monitoring
   */
  async recordMessage(userId: string, connectionId: string): Promise<void> {
    try {
      const now = Math.floor(Date.now() / 1000);
      const hourKey = `${this.keyPrefix}stats:hour:${Math.floor(now / 3600)}`;
      const minuteKey = `${this.keyPrefix}stats:minute:${Math.floor(now / 60)}`;

      await Promise.all([
        // Increment hourly stats
        this.redis.hincrby(hourKey, 'total_messages', 1),
        this.redis.hincrby(hourKey, `user:${userId}`, 1),
        this.redis.expire(hourKey, 3600 * 25), // 25 hours

        // Increment minutely stats
        this.redis.hincrby(minuteKey, 'total_messages', 1),
        this.redis.hincrby(minuteKey, `user:${userId}`, 1),
        this.redis.expire(minuteKey, 3600), // 1 hour

        // Track recent user activity
        this.redis.zadd(
          `${this.keyPrefix}recent_activity:${userId}`,
          now,
          connectionId
        ),
        this.redis.expire(`${this.keyPrefix}recent_activity:${userId}`, 300) // 5 minutes
      ]);

    } catch (error) {
      logger.error('Failed to record message for analytics', {
        error,
        userId,
        connectionId
      });
    }
  }

  /**
   * Applies a penalty to a user
   */
  async applyPenalty(userId: string, durationMs?: number): Promise<void> {
    try {
      const duration = durationMs || this.config.penaltyDuration!;
      const penaltyUntil = Math.floor((Date.now() + duration) / 1000);
      const penaltyKey = `${this.keyPrefix}penalty:${userId}`;

      await this.redis.set(penaltyKey, penaltyUntil, 'EX', Math.floor(duration / 1000));

      logger.warn('Penalty applied to user', {
        userId,
        durationMs: duration,
        penaltyUntil: new Date(penaltyUntil * 1000)
      });

    } catch (error) {
      logger.error('Failed to apply penalty to user', { error, userId, durationMs });
      throw error;
    }
  }

  /**
   * Removes a penalty from a user
   */
  async removePenalty(userId: string): Promise<void> {
    try {
      const penaltyKey = `${this.keyPrefix}penalty:${userId}`;
      await this.redis.del(penaltyKey);

      logger.info('Penalty removed from user', { userId });

    } catch (error) {
      logger.error('Failed to remove penalty from user', { error, userId });
      throw error;
    }
  }

  /**
   * Gets current rate limiting status for a user
   */
  async getRateLimitStatus(userId: string): Promise<{
    messageTokens: number;
    inPenalty: boolean;
    penaltyUntil?: Date;
    connections: number;
    recentActivity: number;
  }> {
    try {
      const [
        messageInfo,
        penaltyInfo,
        connectionCount,
        recentActivity
      ] = await Promise.all([
        this.redis.hmget(`${this.keyPrefix}messages:${userId}`, 'tokens'),
        this.redis.get(`${this.keyPrefix}penalty:${userId}`),
        this.redis.scard(`${this.keyPrefix}connections:user:${userId}`),
        this.redis.zcard(`${this.keyPrefix}recent_activity:${userId}`)
      ]);

      const messageTokens = parseInt(messageInfo[0] || '0');
      const penaltyUntil = penaltyInfo ? parseInt(penaltyInfo) : null;
      const inPenalty = penaltyUntil ? penaltyUntil > Math.floor(Date.now() / 1000) : false;

      return {
        messageTokens,
        inPenalty,
        penaltyUntil: penaltyUntil ? new Date(penaltyUntil * 1000) : undefined,
        connections: connectionCount,
        recentActivity
      };

    } catch (error) {
      logger.error('Failed to get rate limit status', { error, userId });
      return {
        messageTokens: 0,
        inPenalty: false,
        connections: 0,
        recentActivity: 0
      };
    }
  }

  /**
   * Gets rate limiting statistics
   */
  async getStats(periodMinutes: number = 60): Promise<{
    totalMessages: number;
    topUsers: Array<{ userId: string; messageCount: number }>;
    penalizedUsers: string[];
    averageMessagesPerMinute: number;
  }> {
    try {
      const now = Math.floor(Date.now() / 60); // Current minute
      const startMinute = now - periodMinutes;

      let totalMessages = 0;
      const userMessages: Record<string, number> = {};

      // Aggregate stats from multiple minute buckets
      for (let minute = startMinute; minute <= now; minute++) {
        const minuteKey = `${this.keyPrefix}stats:minute:${minute}`;
        const minuteStats = await this.redis.hgetall(minuteKey);

        for (const [key, value] of Object.entries(minuteStats)) {
          const count = parseInt(value);
          if (key === 'total_messages') {
            totalMessages += count;
          } else if (key.startsWith('user:')) {
            const userId = key.substring(5);
            userMessages[userId] = (userMessages[userId] || 0) + count;
          }
        }
      }

      // Get top users
      const topUsers = Object.entries(userMessages)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([userId, messageCount]) => ({ userId, messageCount }));

      // Get penalized users
      const penaltyKeys = await this.redis.keys(`${this.keyPrefix}penalty:*`);
      const penalizedUsers = penaltyKeys.map(key => key.replace(`${this.keyPrefix}penalty:`, ''));

      const averageMessagesPerMinute = periodMinutes > 0 ? totalMessages / periodMinutes : 0;

      return {
        totalMessages,
        topUsers,
        penalizedUsers,
        averageMessagesPerMinute
      };

    } catch (error) {
      logger.error('Failed to get rate limiting stats', { error, periodMinutes });
      return {
        totalMessages: 0,
        topUsers: [],
        penalizedUsers: [],
        averageMessagesPerMinute: 0
      };
    }
  }

  /**
   * Cleans up expired rate limiting data
   */
  async cleanup(olderThanHours: number = 24): Promise<number> {
    try {
      const cutoffTime = Math.floor(Date.now() / 1000) - (olderThanHours * 3600);
      let deletedKeys = 0;

      // Clean up old stats
      const statKeys = await this.redis.keys(`${this.keyPrefix}stats:*`);
      for (const key of statKeys) {
        const keyParts = key.split(':');
        if (keyParts.length >= 3) {
          const timestamp = parseInt(keyParts[3] || '0');
          if (timestamp < cutoffTime) {
            await this.redis.del(key);
            deletedKeys++;
          }
        }
      }

      logger.info('Rate limiting cleanup completed', {
        deletedKeys,
        olderThanHours
      });

      return deletedKeys;

    } catch (error) {
      logger.error('Failed to cleanup rate limiting data', { error, olderThanHours });
      return 0;
    }
  }

  /**
   * Updates rate limiting configuration
   */
  updateConfig(newConfig: Partial<RateLimitConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    logger.info('Rate limiting configuration updated', {
      newConfig,
      currentConfig: this.config
    });
  }

  /**
   * Gets current configuration
   */
  getConfig(): Required<RateLimitConfig> {
    return { ...this.config } as Required<RateLimitConfig>;
  }
}