/**
 * Redis-based session storage for horizontal WebSocket scaling
 * 
 * This implementation provides distributed session management using Redis,
 * enabling the WebSocket service to scale across multiple server instances.
 */

import Redis from 'ioredis';
import { Logger } from '@mcp-tools/core/utils/logger';

export interface SessionData {
  socketId: string;
  sessionToken: string;
  workspaceId: string;
  userId: string;
  tenantId: string;
  lastActivity: Date;
  connectionInfo: {
    userAgent?: string;
    ip?: string;
    clientInfo?: any;
  };
}

export interface SessionStorage {
  set(key: string, value: SessionData, ttl?: number): Promise<void>;
  get(key: string): Promise<SessionData | null>;
  delete(key: string): Promise<void>;
  getAll(): Promise<Map<string, SessionData>>;
  cleanup(threshold: number): Promise<void>;
  destroy?(): Promise<void>;
}

/**
 * Redis-based session storage implementation
 */
export class RedisSessionStorage implements SessionStorage {
  private redis: Redis;
  private logger: Logger;
  private keyPrefix: string;

  constructor(redisConfig?: {
    host?: string;
    port?: number;
    password?: string;
    db?: number;
    keyPrefix?: string;
  }) {
    this.logger = new Logger('RedisSessionStorage');
    this.keyPrefix = redisConfig?.keyPrefix || 'workspace:session:';

    // Initialize Redis connection with production-ready configuration
    this.redis = new Redis({
      host: redisConfig?.host || process.env.REDIS_HOST || 'localhost',
      port: redisConfig?.port || parseInt(process.env.REDIS_PORT || '6379'),
      password: redisConfig?.password || process.env.REDIS_PASSWORD,
      db: redisConfig?.db || parseInt(process.env.REDIS_DB || '0'),
      retryDelayOnFailover: 100,
      enableReadyCheck: true,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      // Connection pool settings
      family: 4,
      keepAlive: true,
      // Security settings
      connectTimeout: 10000,
      commandTimeout: 5000,
    });

    this.redis.on('error', (error) => {
      this.logger.error('Redis connection error', { error });
    });

    this.redis.on('connect', () => {
      this.logger.info('Redis connected successfully');
    });

    this.redis.on('reconnecting', () => {
      this.logger.warn('Redis reconnecting...');
    });
  }

  /**
   * Store session data with TTL
   */
  async set(key: string, value: SessionData, ttl: number = 30 * 60 * 1000): Promise<void> {
    try {
      const sessionKey = this.getSessionKey(key);
      const serializedValue = JSON.stringify({
        ...value,
        lastActivity: value.lastActivity.toISOString()
      });

      // Use Redis SETEX for atomic set with expiration
      await this.redis.setex(sessionKey, Math.floor(ttl / 1000), serializedValue);
      
      this.logger.debug('Session stored in Redis', { 
        key: sessionKey, 
        userId: value.userId,
        ttl: Math.floor(ttl / 1000)
      });
    } catch (error) {
      this.logger.error('Failed to store session in Redis', { 
        error: error instanceof Error ? error.message : String(error), 
        key 
      });
      throw new Error('Failed to store session data');
    }
  }

  /**
   * Retrieve session data
   */
  async get(key: string): Promise<SessionData | null> {
    try {
      const sessionKey = this.getSessionKey(key);
      const value = await this.redis.get(sessionKey);
      
      if (!value) {
        return null;
      }

      const parsed = JSON.parse(value);
      return {
        ...parsed,
        lastActivity: new Date(parsed.lastActivity)
      };
    } catch (error) {
      this.logger.error('Failed to retrieve session from Redis', { 
        error: error instanceof Error ? error.message : String(error), 
        key 
      });
      return null;
    }
  }

  /**
   * Delete session data
   */
  async delete(key: string): Promise<void> {
    try {
      const sessionKey = this.getSessionKey(key);
      await this.redis.del(sessionKey);
      
      this.logger.debug('Session deleted from Redis', { key: sessionKey });
    } catch (error) {
      this.logger.error('Failed to delete session from Redis', { 
        error: error instanceof Error ? error.message : String(error), 
        key 
      });
      // Don't throw here - deletion failures shouldn't break the flow
    }
  }

  /**
   * Get all active sessions (use with caution - can be expensive)
   */
  async getAll(): Promise<Map<string, SessionData>> {
    try {
      const pattern = `${this.keyPrefix}*`;
      const keys = await this.redis.keys(pattern);
      
      if (keys.length === 0) {
        return new Map();
      }

      // Use pipeline for efficient multi-get
      const pipeline = this.redis.pipeline();
      keys.forEach(key => pipeline.get(key));
      
      const results = await pipeline.exec();
      const sessions = new Map<string, SessionData>();

      if (results) {
        for (let i = 0; i < keys.length; i++) {
          const result = results[i];
          if (result && result[1]) {
            try {
              const parsed = JSON.parse(result[1] as string);
              const sessionData = {
                ...parsed,
                lastActivity: new Date(parsed.lastActivity)
              };
              
              // Extract original key from Redis key
              const originalKey = keys[i].replace(this.keyPrefix, '');
              sessions.set(originalKey, sessionData);
            } catch (parseError) {
              this.logger.warn('Failed to parse session data', { 
                key: keys[i], 
                error: parseError 
              });
            }
          }
        }
      }

      return sessions;
    } catch (error) {
      this.logger.error('Failed to retrieve all sessions from Redis', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      return new Map();
    }
  }

  /**
   * Cleanup expired sessions (Redis TTL handles this automatically)
   * This method is kept for interface compatibility
   */
  async cleanup(threshold: number): Promise<void> {
    // Redis handles TTL automatically, but we can implement additional cleanup if needed
    this.logger.debug('Redis TTL handles session cleanup automatically');
  }

  /**
   * Get session statistics
   */
  async getStats(): Promise<{
    totalSessions: number;
    memoryUsage: number;
  }> {
    try {
      const pattern = `${this.keyPrefix}*`;
      const keys = await this.redis.keys(pattern);
      
      // Get memory usage for session keys (approximate)
      let memoryUsage = 0;
      if (keys.length > 0) {
        const pipeline = this.redis.pipeline();
        keys.forEach(key => pipeline.memory('usage', key));
        const results = await pipeline.exec();
        
        if (results) {
          memoryUsage = results.reduce((total, result) => {
            return total + (result && result[1] ? (result[1] as number) : 0);
          }, 0);
        }
      }

      return {
        totalSessions: keys.length,
        memoryUsage
      };
    } catch (error) {
      this.logger.error('Failed to get session stats', { error });
      return { totalSessions: 0, memoryUsage: 0 };
    }
  }

  /**
   * Health check for Redis connection
   */
  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.redis.ping();
      return result === 'PONG';
    } catch (error) {
      this.logger.error('Redis health check failed', { error });
      return false;
    }
  }

  /**
   * Destroy Redis connection
   */
  async destroy(): Promise<void> {
    try {
      await this.redis.quit();
      this.logger.info('Redis connection closed');
    } catch (error) {
      this.logger.error('Error closing Redis connection', { error });
    }
  }

  /**
   * Generate Redis key with prefix
   */
  private getSessionKey(key: string): string {
    return `${this.keyPrefix}${key}`;
  }
}

/**
 * In-memory session storage (development/testing only)
 */
export class InMemorySessionStorage implements SessionStorage {
  private storage = new Map<string, { data: SessionData; timestamp: number }>();
  private cleanupInterval: NodeJS.Timeout;
  private logger: Logger;

  constructor() {
    this.logger = new Logger('InMemorySessionStorage');
    
    // Run cleanup every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanup(30 * 60 * 1000); // 30 minutes threshold
    }, 5 * 60 * 1000);
  }

  async set(key: string, value: SessionData, ttl: number = 30 * 60 * 1000): Promise<void> {
    this.storage.set(key, {
      data: value,
      timestamp: Date.now() + ttl
    });
  }

  async get(key: string): Promise<SessionData | null> {
    const entry = this.storage.get(key);
    if (!entry) return null;
    
    if (Date.now() > entry.timestamp) {
      this.storage.delete(key);
      return null;
    }
    
    return entry.data;
  }

  async delete(key: string): Promise<void> {
    this.storage.delete(key);
  }

  async getAll(): Promise<Map<string, SessionData>> {
    const result = new Map<string, SessionData>();
    const now = Date.now();
    
    for (const [key, entry] of this.storage.entries()) {
      if (now <= entry.timestamp) {
        result.set(key, entry.data);
      } else {
        this.storage.delete(key);
      }
    }
    
    return result;
  }

  async cleanup(threshold: number): Promise<void> {
    const now = Date.now();
    const expiredKeys: string[] = [];
    
    for (const [key, entry] of this.storage.entries()) {
      if (now > entry.timestamp) {
        expiredKeys.push(key);
      }
    }
    
    expiredKeys.forEach(key => this.storage.delete(key));
    
    if (expiredKeys.length > 0) {
      this.logger.debug('Cleaned up expired sessions', { count: expiredKeys.length });
    }
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.storage.clear();
    this.logger.info('In-memory session storage destroyed');
  }
}

/**
 * Session storage factory
 */
export function createSessionStorage(useRedis: boolean = true): SessionStorage {
  if (useRedis && (process.env.REDIS_HOST || process.env.NODE_ENV === 'production')) {
    return new RedisSessionStorage();
  } else {
    console.warn('Using in-memory session storage - not suitable for production');
    return new InMemorySessionStorage();
  }
}