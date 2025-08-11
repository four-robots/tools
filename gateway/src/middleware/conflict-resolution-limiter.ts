/**
 * Gateway Conflict Resolution Rate Limiter Middleware
 * 
 * Express middleware for applying conflict resolution rate limiting
 * to gateway API endpoints. Integrates with the core rate limiting
 * service to provide consistent rate limiting across the system.
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';

// Import from core module (would be available after core is built)
// import { ConflictResolutionRateLimiter, RateLimitResult } from '@mcp-tools/core';

// Temporary interface definitions (would be imported from core)
interface RateLimitConfig {
  maxConcurrentMerges: number;
  maxConcurrentTransforms: number;
  maxConcurrentAIAnalysis: number;
  maxOperationsPerMinute: number;
  maxOperationsPerHour: number;
  maxContentSize: number;
  maxParticipantsPerSession: number;
}

enum RateLimitResult {
  ALLOWED = 'allowed',
  USER_CONCURRENT_LIMIT = 'user_concurrent_limit',
  USER_RATE_LIMIT = 'user_rate_limit',
  USER_CONTENT_LIMIT = 'user_content_limit',
  SESSION_LIMIT = 'session_limit',
  GLOBAL_LIMIT = 'global_limit',
  CONTENT_TOO_LARGE = 'content_too_large'
}

// Mock implementation for development (would use real implementation in production)
class MockConflictResolutionRateLimiter {
  static async checkLimits(
    userId: string,
    operation: string,
    sessionId?: string,
    contentSize?: number
  ): Promise<RateLimitResult> {
    // Mock implementation - always allow during development
    return RateLimitResult.ALLOWED;
  }

  static async recordOperation(
    userId: string,
    operation: string,
    sessionId?: string,
    contentSize?: number
  ): Promise<void> {
    // Mock implementation
    logger.debug('Mock: Recording operation', { userId, operation, sessionId, contentSize });
  }

  static async completeOperation(
    userId: string,
    operation: string,
    sessionId?: string
  ): Promise<void> {
    // Mock implementation
    logger.debug('Mock: Completing operation', { userId, operation, sessionId });
  }

  static async getRateLimitStatus(userId: string): Promise<{
    limits: RateLimitConfig;
    current: any;
    remaining: any;
  }> {
    return {
      limits: {
        maxConcurrentMerges: 5,
        maxConcurrentTransforms: 10,
        maxConcurrentAIAnalysis: 2,
        maxOperationsPerMinute: 100,
        maxOperationsPerHour: 1000,
        maxContentSize: 1024 * 1024,
        maxParticipantsPerSession: 20
      },
      current: {},
      remaining: {}
    };
  }
}

// Use mock during development, real implementation in production
const RateLimiter = MockConflictResolutionRateLimiter;

export interface ConflictResolutionRequest extends Request {
  userId?: string;
  sessionId?: string;
  operationType?: string;
  contentSize?: number;
}

/**
 * Middleware factory for conflict resolution rate limiting
 */
export function createConflictResolutionLimiter(options: {
  operationType: string;
  extractUserId?: (req: Request) => string | undefined;
  extractSessionId?: (req: Request) => string | undefined;
  extractContentSize?: (req: Request) => number | undefined;
} = { operationType: 'general' }) {
  return async (req: ConflictResolutionRequest, res: Response, next: NextFunction) => {
    try {
      // Extract user information
      const userId = options.extractUserId ? 
        options.extractUserId(req) : 
        req.headers['x-user-id'] as string || req.body?.userId || 'anonymous';

      // Extract session information
      const sessionId = options.extractSessionId ? 
        options.extractSessionId(req) : 
        req.headers['x-session-id'] as string || req.body?.sessionId;

      // Extract content size
      const contentSize = options.extractContentSize ? 
        options.extractContentSize(req) : 
        req.body?.content ? Buffer.byteLength(JSON.stringify(req.body.content), 'utf8') : undefined;

      // Store in request for later use
      req.userId = userId;
      req.sessionId = sessionId;
      req.operationType = options.operationType;
      req.contentSize = contentSize;

      // Check rate limits
      const rateLimitResult = await RateLimiter.checkLimits(
        userId,
        options.operationType,
        sessionId,
        contentSize
      );

      if (rateLimitResult !== RateLimitResult.ALLOWED) {
        const errorResponse = createRateLimitErrorResponse(rateLimitResult, userId);
        
        logger.warn('Rate limit exceeded', {
          userId,
          sessionId,
          operationType: options.operationType,
          rateLimitResult,
          contentSize,
          userAgent: req.headers['user-agent'],
          ip: req.ip
        });

        return res.status(errorResponse.statusCode)
          .set(errorResponse.headers)
          .json(errorResponse.body);
      }

      // Record the operation start
      await RateLimiter.recordOperation(userId, options.operationType, sessionId, contentSize);

      // Set up completion tracking
      const originalSend = res.send.bind(res);
      res.send = function(body: any) {
        // Record operation completion
        RateLimiter.completeOperation(userId, options.operationType, sessionId).catch(error => {
          logger.warn('Failed to record operation completion', { error, userId, operationType: options.operationType });
        });
        
        return originalSend(body);
      };

      // Set up error handling for operation completion
      const originalNext = next;
      const wrappedNext = (error?: any) => {
        if (error) {
          // Record operation completion even on error
          RateLimiter.completeOperation(userId, options.operationType, sessionId).catch(completionError => {
            logger.warn('Failed to record operation completion on error', { 
              error: completionError, 
              userId, 
              operationType: options.operationType 
            });
          });
        }
        return originalNext(error);
      };

      next = wrappedNext;
      next();

    } catch (error) {
      logger.error('Rate limiter middleware error', { 
        error, 
        operationType: options.operationType,
        url: req.url 
      });
      
      // On rate limiter error, allow the request to proceed but log it
      next();
    }
  };
}

/**
 * Middleware for merge operations
 */
export const mergeOperationLimiter = createConflictResolutionLimiter({
  operationType: 'merge_operation',
  extractContentSize: (req) => {
    const content = req.body?.baseContent || req.body?.versionAContent || req.body?.versionBContent;
    return content ? Buffer.byteLength(content, 'utf8') : undefined;
  }
});

/**
 * Middleware for operational transform operations
 */
export const operationalTransformLimiter = createConflictResolutionLimiter({
  operationType: 'operation_transform',
  extractContentSize: (req) => {
    const operations = req.body?.operations;
    return operations ? Buffer.byteLength(JSON.stringify(operations), 'utf8') : undefined;
  }
});

/**
 * Middleware for AI analysis operations
 */
export const aiAnalysisLimiter = createConflictResolutionLimiter({
  operationType: 'ai_analysis',
  extractContentSize: (req) => {
    const content = req.body?.content || req.body?.conflictContent;
    return content ? Buffer.byteLength(content, 'utf8') : undefined;
  }
});

/**
 * Rate limit status endpoint middleware
 */
export async function getRateLimitStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.headers['x-user-id'] as string || req.query.userId as string || 'anonymous';
    
    const status = await RateLimiter.getRateLimitStatus(userId);
    
    res.json({
      success: true,
      data: {
        userId,
        rateLimits: status,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('Failed to get rate limit status', { error, userId: req.headers['x-user-id'] });
    next(error);
  }
}

/**
 * Creates appropriate error response for rate limit violations
 */
function createRateLimitErrorResponse(result: RateLimitResult, userId: string) {
  const baseHeaders = {
    'X-RateLimit-UserId': userId,
    'X-RateLimit-Reset': new Date(Date.now() + 60000).toISOString() // Reset in 1 minute
  };

  switch (result) {
    case RateLimitResult.USER_CONCURRENT_LIMIT:
      return {
        statusCode: 429,
        headers: {
          ...baseHeaders,
          'Retry-After': '30' // Retry after 30 seconds
        },
        body: {
          error: 'Too Many Concurrent Operations',
          code: 'USER_CONCURRENT_LIMIT',
          message: 'You have too many concurrent conflict resolution operations running. Please wait for some to complete before starting new ones.',
          retryAfter: 30
        }
      };

    case RateLimitResult.USER_RATE_LIMIT:
      return {
        statusCode: 429,
        headers: {
          ...baseHeaders,
          'Retry-After': '60'
        },
        body: {
          error: 'Rate Limit Exceeded',
          code: 'USER_RATE_LIMIT',
          message: 'You have exceeded the rate limit for conflict resolution operations. Please wait before making more requests.',
          retryAfter: 60
        }
      };

    case RateLimitResult.USER_CONTENT_LIMIT:
      return {
        statusCode: 429,
        headers: {
          ...baseHeaders,
          'Retry-After': '3600' // 1 hour
        },
        body: {
          error: 'Content Limit Exceeded',
          code: 'USER_CONTENT_LIMIT',
          message: 'You have exceeded the content processing limit for this hour. Please wait or try with smaller content.',
          retryAfter: 3600
        }
      };

    case RateLimitResult.CONTENT_TOO_LARGE:
      return {
        statusCode: 413,
        headers: baseHeaders,
        body: {
          error: 'Content Too Large',
          code: 'CONTENT_TOO_LARGE',
          message: 'The content size exceeds the maximum allowed limit. Please reduce the content size and try again.'
        }
      };

    case RateLimitResult.SESSION_LIMIT:
      return {
        statusCode: 429,
        headers: baseHeaders,
        body: {
          error: 'Session Limit Exceeded',
          code: 'SESSION_LIMIT',
          message: 'The collaboration session has reached its limits (participants or duration). Please start a new session.'
        }
      };

    case RateLimitResult.GLOBAL_LIMIT:
      return {
        statusCode: 503,
        headers: {
          ...baseHeaders,
          'Retry-After': '60'
        },
        body: {
          error: 'Service Temporarily Unavailable',
          code: 'GLOBAL_LIMIT',
          message: 'The service is temporarily overloaded. Please try again in a few minutes.',
          retryAfter: 60
        }
      };

    default:
      return {
        statusCode: 429,
        headers: baseHeaders,
        body: {
          error: 'Rate Limit Exceeded',
          code: 'UNKNOWN_LIMIT',
          message: 'A rate limit has been exceeded. Please try again later.'
        }
      };
  }
}

/**
 * General rate limiting middleware for conflict resolution endpoints
 */
export const conflictResolutionLimiter = createConflictResolutionLimiter({
  operationType: 'conflict_resolution'
});

/**
 * Session management middleware
 */
export async function handleSessionParticipant(req: Request, res: Response, next: NextFunction) {
  try {
    const sessionId = req.headers['x-session-id'] as string || req.body?.sessionId;
    const userId = req.headers['x-user-id'] as string || req.body?.userId || 'anonymous';
    const action = req.body?.action || 'join'; // 'join' or 'leave'

    if (!sessionId) {
      return next();
    }

    if (action === 'join') {
      // This would use the real implementation in production
      logger.debug('Mock: Adding session participant', { sessionId, userId });
    } else if (action === 'leave') {
      // This would use the real implementation in production
      logger.debug('Mock: Removing session participant', { sessionId, userId });
    }

    next();
  } catch (error) {
    logger.error('Session participant management error', { error });
    next(); // Don't block on session management errors
  }
}

/**
 * Middleware to add rate limit headers to successful responses
 */
export function addRateLimitHeaders(req: ConflictResolutionRequest, res: Response, next: NextFunction) {
  if (req.userId) {
    // This would include actual rate limit information in production
    res.set({
      'X-RateLimit-User': req.userId,
      'X-RateLimit-Operation': req.operationType || 'unknown',
      'X-RateLimit-Timestamp': new Date().toISOString()
    });
  }
  next();
}