/**
 * Advanced Rate Limiting for Search Collaboration
 * 
 * Implements per-user and per-session rate limiting with Redis backend
 * for search operations to prevent abuse and ensure fair usage.
 */

import { Request, Response, NextFunction } from 'express';
import Redis from 'ioredis';
import { logger } from '../utils/logger.js';

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    name: string;
  };
}

interface RateLimitConfig {
  // Per-user limits
  maxRequestsPerMinute: number;
  maxSearchQueriesPerMinute: number;
  maxAnnotationsPerMinute: number;
  maxStateUpdatesPerMinute: number;
  
  // Per-session limits
  maxParticipantsPerSession: number;
  maxConcurrentSessions: number;
  
  // Burst limits
  burstAllowance: number;
  
  // Penalty settings
  penaltyDurationMs: number;
  
  // Window settings
  windowSizeMs: number;
}

const DEFAULT_CONFIG: RateLimitConfig = {
  maxRequestsPerMinute: 120,
  maxSearchQueriesPerMinute: 30,
  maxAnnotationsPerMinute: 15,
  maxStateUpdatesPerMinute: 60,
  maxParticipantsPerSession: 50,
  maxConcurrentSessions: 10,
  burstAllowance: 10,
  penaltyDurationMs: 5 * 60 * 1000, // 5 minutes
  windowSizeMs: 60 * 1000 // 1 minute
};

export class SearchRateLimiter {
  private redis: Redis;
  private config: RateLimitConfig;

  constructor(redis: Redis, config: Partial<RateLimitConfig> = {}) {
    this.redis = redis;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * General request rate limiter
   */
  createRequestLimiter() {
    return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (!req.user?.id) {
        return next();
      }

      const userId = req.user.id;
      const key = `rate_limit:requests:${userId}`;
      
      try {
        const { allowed, remaining, resetTime } = await this.checkRateLimit(
          key, 
          this.config.maxRequestsPerMinute,
          this.config.windowSizeMs
        );

        // Set rate limit headers
        res.set({
          'X-RateLimit-Limit': this.config.maxRequestsPerMinute.toString(),
          'X-RateLimit-Remaining': remaining.toString(),
          'X-RateLimit-Reset': resetTime.toString()
        });

        if (!allowed) {
          logger.warn('Request rate limit exceeded', {
            userId,
            endpoint: req.path,
            method: req.method,
            remaining,
            resetTime
          });

          return res.status(429).json({
            error: {
              code: 'RATE_LIMIT_EXCEEDED',
              message: 'Too many requests. Please slow down.',
              retryAfter: Math.ceil((resetTime - Date.now()) / 1000)
            }
          });
        }

        next();
      } catch (error) {
        logger.error('Rate limiter error', { error, userId, endpoint: req.path });
        // Fail open - allow request if rate limiter fails
        next();
      }
    };
  }

  /**
   * Search query specific rate limiter
   */
  createSearchQueryLimiter() {
    return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (!req.user?.id) {
        return next();
      }

      const userId = req.user.id;
      const key = `rate_limit:search_queries:${userId}`;
      
      try {
        const { allowed, remaining, resetTime } = await this.checkRateLimit(
          key, 
          this.config.maxSearchQueriesPerMinute,
          this.config.windowSizeMs
        );

        res.set({
          'X-RateLimit-SearchQueries-Limit': this.config.maxSearchQueriesPerMinute.toString(),
          'X-RateLimit-SearchQueries-Remaining': remaining.toString(),
          'X-RateLimit-SearchQueries-Reset': resetTime.toString()
        });

        if (!allowed) {
          logger.warn('Search query rate limit exceeded', {
            userId,
            remaining,
            resetTime
          });

          return res.status(429).json({
            error: {
              code: 'SEARCH_RATE_LIMIT_EXCEEDED',
              message: 'Too many search queries. Please wait before searching again.',
              retryAfter: Math.ceil((resetTime - Date.now()) / 1000)
            }
          });
        }

        next();
      } catch (error) {
        logger.error('Search query rate limiter error', { error, userId });
        next();
      }
    };
  }

  /**
   * Annotation rate limiter
   */
  createAnnotationLimiter() {
    return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (!req.user?.id) {
        return next();
      }

      const userId = req.user.id;
      const key = `rate_limit:annotations:${userId}`;
      
      try {
        const { allowed, remaining, resetTime } = await this.checkRateLimit(
          key, 
          this.config.maxAnnotationsPerMinute,
          this.config.windowSizeMs
        );

        res.set({
          'X-RateLimit-Annotations-Limit': this.config.maxAnnotationsPerMinute.toString(),
          'X-RateLimit-Annotations-Remaining': remaining.toString(),
          'X-RateLimit-Annotations-Reset': resetTime.toString()
        });

        if (!allowed) {
          logger.warn('Annotation rate limit exceeded', {
            userId,
            remaining,
            resetTime
          });

          return res.status(429).json({
            error: {
              code: 'ANNOTATION_RATE_LIMIT_EXCEEDED',
              message: 'Too many annotations. Please wait before creating more.',
              retryAfter: Math.ceil((resetTime - Date.now()) / 1000)
            }
          });
        }

        next();
      } catch (error) {
        logger.error('Annotation rate limiter error', { error, userId });
        next();
      }
    };
  }

  /**
   * State update rate limiter
   */
  createStateUpdateLimiter() {
    return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (!req.user?.id) {
        return next();
      }

      const userId = req.user.id;
      const key = `rate_limit:state_updates:${userId}`;
      
      try {
        const { allowed, remaining, resetTime } = await this.checkRateLimit(
          key, 
          this.config.maxStateUpdatesPerMinute,
          this.config.windowSizeMs
        );

        res.set({
          'X-RateLimit-StateUpdates-Limit': this.config.maxStateUpdatesPerMinute.toString(),
          'X-RateLimit-StateUpdates-Remaining': remaining.toString(),
          'X-RateLimit-StateUpdates-Reset': resetTime.toString()
        });

        if (!allowed) {
          logger.warn('State update rate limit exceeded', {
            userId,
            remaining,
            resetTime
          });

          return res.status(429).json({
            error: {
              code: 'STATE_UPDATE_RATE_LIMIT_EXCEEDED',
              message: 'Too many state updates. Please reduce update frequency.',
              retryAfter: Math.ceil((resetTime - Date.now()) / 1000)
            }
          });
        }

        next();
      } catch (error) {
        logger.error('State update rate limiter error', { error, userId });
        next();
      }
    };
  }

  /**
   * Session participation limiter
   */
  async checkSessionParticipationLimits(userId: string, sessionId: string): Promise<{
    canJoin: boolean;
    reason?: string;
    currentSessions?: number;
    maxSessions?: number;
  }> {
    try {
      // Check concurrent session limit
      const sessionsKey = `active_sessions:${userId}`;
      const currentSessions = await this.redis.scard(sessionsKey);

      if (currentSessions >= this.config.maxConcurrentSessions) {
        return {
          canJoin: false,
          reason: 'Maximum concurrent sessions reached',
          currentSessions,
          maxSessions: this.config.maxConcurrentSessions
        };
      }

      // Check session participant limit
      const participantsKey = `session_participants:${sessionId}`;
      const participantCount = await this.redis.scard(participantsKey);

      if (participantCount >= this.config.maxParticipantsPerSession) {
        return {
          canJoin: false,
          reason: 'Session has reached maximum participant limit',
          currentSessions: participantCount,
          maxSessions: this.config.maxParticipantsPerSession
        };
      }

      return { canJoin: true };
    } catch (error) {
      logger.error('Session participation check failed', { error, userId, sessionId });
      // Fail open - allow participation if check fails
      return { canJoin: true };
    }
  }

  /**
   * Track user joining a session
   */
  async trackSessionJoin(userId: string, sessionId: string): Promise<void> {
    try {
      const pipeline = this.redis.pipeline();
      
      // Add user to active sessions
      pipeline.sadd(`active_sessions:${userId}`, sessionId);
      pipeline.expire(`active_sessions:${userId}`, 3600); // 1 hour TTL
      
      // Add user to session participants
      pipeline.sadd(`session_participants:${sessionId}`, userId);
      pipeline.expire(`session_participants:${sessionId}`, 7200); // 2 hour TTL
      
      await pipeline.exec();
      
      logger.debug('Session join tracked', { userId, sessionId });
    } catch (error) {
      logger.error('Failed to track session join', { error, userId, sessionId });
    }
  }

  /**
   * Track user leaving a session
   */
  async trackSessionLeave(userId: string, sessionId: string): Promise<void> {
    try {
      const pipeline = this.redis.pipeline();
      
      // Remove user from active sessions
      pipeline.srem(`active_sessions:${userId}`, sessionId);
      
      // Remove user from session participants
      pipeline.srem(`session_participants:${sessionId}`, userId);
      
      await pipeline.exec();
      
      logger.debug('Session leave tracked', { userId, sessionId });
    } catch (error) {
      logger.error('Failed to track session leave', { error, userId, sessionId });
    }
  }

  /**
   * Core rate limiting logic using sliding window counter
   */
  private async checkRateLimit(
    key: string, 
    limit: number, 
    windowMs: number
  ): Promise<{ allowed: boolean; remaining: number; resetTime: number }> {
    const now = Date.now();
    const windowStart = now - windowMs;
    const resetTime = now + windowMs;

    // Use Redis pipeline for atomic operations
    const pipeline = this.redis.pipeline();
    
    // Remove expired entries
    pipeline.zremrangebyscore(key, '-inf', windowStart);
    
    // Count current requests in window
    pipeline.zcard(key);
    
    // Add current request
    pipeline.zadd(key, now, `${now}-${Math.random()}`);
    
    // Set expiration
    pipeline.expire(key, Math.ceil(windowMs / 1000));

    const results = await pipeline.exec();
    
    if (!results || results.length < 4) {
      throw new Error('Redis pipeline failed');
    }

    const currentCount = results[1][1] as number;
    const remaining = Math.max(0, limit - currentCount - 1);
    const allowed = currentCount < limit;

    // If limit exceeded, remove the request we just added
    if (!allowed) {
      await this.redis.zrem(key, `${now}-${Math.random()}`);
    }

    return {
      allowed,
      remaining,
      resetTime
    };
  }

  /**
   * Apply penalty for rate limit violations
   */
  async applyPenalty(userId: string, violationType: string): Promise<void> {
    try {
      const penaltyKey = `penalty:${violationType}:${userId}`;
      await this.redis.setex(penaltyKey, Math.ceil(this.config.penaltyDurationMs / 1000), '1');
      
      logger.warn('Rate limit penalty applied', {
        userId,
        violationType,
        durationMs: this.config.penaltyDurationMs
      });
    } catch (error) {
      logger.error('Failed to apply penalty', { error, userId, violationType });
    }
  }

  /**
   * Check if user is currently penalized
   */
  async isPenalized(userId: string, violationType: string): Promise<boolean> {
    try {
      const penaltyKey = `penalty:${violationType}:${userId}`;
      const exists = await this.redis.exists(penaltyKey);
      return exists === 1;
    } catch (error) {
      logger.error('Failed to check penalty', { error, userId, violationType });
      return false;
    }
  }

  /**
   * Get rate limit statistics
   */
  async getStats(userId: string): Promise<{
    requests: { current: number; limit: number; resetTime: number };
    searchQueries: { current: number; limit: number; resetTime: number };
    annotations: { current: number; limit: number; resetTime: number };
    stateUpdates: { current: number; limit: number; resetTime: number };
    activeSessions: number;
    penalties: string[];
  }> {
    try {
      const now = Date.now();
      const windowStart = now - this.config.windowSizeMs;
      
      const [requestCount, queryCount, annotationCount, stateUpdateCount, activeSessions] = await Promise.all([
        this.redis.zcount(`rate_limit:requests:${userId}`, windowStart, now),
        this.redis.zcount(`rate_limit:search_queries:${userId}`, windowStart, now),
        this.redis.zcount(`rate_limit:annotations:${userId}`, windowStart, now),
        this.redis.zcount(`rate_limit:state_updates:${userId}`, windowStart, now),
        this.redis.scard(`active_sessions:${userId}`)
      ]);

      // Check for active penalties
      const penaltyKeys = await this.redis.keys(`penalty:*:${userId}`);
      const penalties = penaltyKeys.map(key => key.split(':')[1]);

      return {
        requests: {
          current: requestCount,
          limit: this.config.maxRequestsPerMinute,
          resetTime: now + this.config.windowSizeMs
        },
        searchQueries: {
          current: queryCount,
          limit: this.config.maxSearchQueriesPerMinute,
          resetTime: now + this.config.windowSizeMs
        },
        annotations: {
          current: annotationCount,
          limit: this.config.maxAnnotationsPerMinute,
          resetTime: now + this.config.windowSizeMs
        },
        stateUpdates: {
          current: stateUpdateCount,
          limit: this.config.maxStateUpdatesPerMinute,
          resetTime: now + this.config.windowSizeMs
        },
        activeSessions,
        penalties
      };
    } catch (error) {
      logger.error('Failed to get rate limit stats', { error, userId });
      throw error;
    }
  }
}