/**
 * WebSocket Rate Limiting System
 * 
 * Implements comprehensive rate limiting to prevent DoS attacks and abuse
 * with different limits for different types of operations.
 */

import { Logger } from '@mcp-tools/core/utils/logger';

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  blockDurationMs?: number;
}

interface UserRateLimit {
  requests: number[];
  blocked: boolean;
  blockExpiresAt: number;
}

interface OperationConfig {
  [operation: string]: RateLimitConfig;
}

// Rate limiting configurations for different operation types
const RATE_LIMIT_CONFIGS: OperationConfig = {
  // Critical operations - very restrictive
  'whiteboard:join': {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 5, // 5 joins per minute
    blockDurationMs: 5 * 60 * 1000, // 5 minute block
  },
  
  'whiteboard:canvas_change': {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 120, // 120 changes per minute (2 per second average)
    blockDurationMs: 2 * 60 * 1000, // 2 minute block
  },
  
  // Moderate operations
  'whiteboard:presence': {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 300, // 300 presence updates per minute (5 per second)
    blockDurationMs: 60 * 1000, // 1 minute block
  },
  
  // Comment system operations with enhanced security
  'whiteboard:create_comment': {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 10, // 10 new comments per minute to prevent spam
    blockDurationMs: 5 * 60 * 1000, // 5 minute block
  },
  
  'whiteboard:update_comment': {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 20, // 20 comment edits per minute
    blockDurationMs: 3 * 60 * 1000, // 3 minute block
  },
  
  'whiteboard:resolve_comment': {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 30, // 30 resolve actions per minute
    blockDurationMs: 2 * 60 * 1000, // 2 minute block
  },
  
  'whiteboard:delete_comment': {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 15, // 15 delete actions per minute
    blockDurationMs: 5 * 60 * 1000, // 5 minute block
  },
  
  'whiteboard:get_comment_thread': {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 100, // 100 thread fetches per minute
    blockDurationMs: 2 * 60 * 1000, // 2 minute block
  },
  
  'whiteboard:get_comments': {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 50, // 50 comment list fetches per minute
    blockDurationMs: 2 * 60 * 1000, // 2 minute block
  },
  
  'whiteboard:comment_typing': {
    windowMs: 1000, // 1 second
    maxRequests: 5, // 5 typing indicators per second
    blockDurationMs: 30 * 1000, // 30 second block
  },
  
  'whiteboard:comment_activity': {
    windowMs: 10 * 1000, // 10 seconds
    maxRequests: 20, // 20 activity updates per 10 seconds
    blockDurationMs: 60 * 1000, // 1 minute block
  },
  
  // High frequency operations
  'whiteboard:request_sync': {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 10, // 10 sync requests per minute
    blockDurationMs: 2 * 60 * 1000, // 2 minute block
  },
  
  // Cursor operations - very high frequency, low impact with throttling
  'whiteboard:cursor_move': {
    windowMs: 1000, // 1 second
    maxRequests: 30, // Reduced to 30 FPS for better performance
    blockDurationMs: 10 * 1000, // 10 second block
  },
  
  'whiteboard:selection_change': {
    windowMs: 1000, // 1 second
    maxRequests: 20, // 20 selection changes per second
    blockDurationMs: 10 * 1000, // 10 second block
  },
  
  // Resource operations
  'whiteboard:resource_attached': {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 60, // 60 attachments per minute
    blockDurationMs: 2 * 60 * 1000, // 2 minute block
  },
  
  // Search operations (can be expensive)
  'whiteboard:search_initiated': {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 20, // 20 searches per minute
    blockDurationMs: 3 * 60 * 1000, // 3 minute block
  },
  
  // Default rate limit for unspecified operations
  'default': {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 100, // 100 operations per minute
    blockDurationMs: 60 * 1000, // 1 minute block
  }
};

export class WebSocketRateLimiter {
  private userLimits = new Map<string, Map<string, UserRateLimit>>();
  private logger: Logger;
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    this.logger = new Logger('WebSocketRateLimiter');
    
    // Clean up expired data every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredLimits();
    }, 5 * 60 * 1000);
  }

  /**
   * Checks if a user is allowed to perform an operation
   */
  checkRateLimit(userId: string, operation: string, clientIp?: string): {
    allowed: boolean;
    retryAfterMs?: number;
    error?: string;
    remainingRequests?: number;
  } {
    const now = Date.now();
    const config = RATE_LIMIT_CONFIGS[operation] || RATE_LIMIT_CONFIGS.default;
    
    // Get or create user's rate limit data
    const userOperationLimits = this.getUserOperationLimits(userId);
    const rateLimitData = userOperationLimits.get(operation) || {
      requests: [],
      blocked: false,
      blockExpiresAt: 0,
    };

    // Check if user is currently blocked
    if (rateLimitData.blocked && now < rateLimitData.blockExpiresAt) {
      const retryAfterMs = rateLimitData.blockExpiresAt - now;
      this.logger.warn('Rate limit blocked request', {
        userId,
        operation,
        clientIp,
        retryAfterMs,
      });
      
      return {
        allowed: false,
        retryAfterMs,
        error: 'RATE_LIMIT_BLOCKED',
      };
    }

    // Clear block if expired
    if (rateLimitData.blocked && now >= rateLimitData.blockExpiresAt) {
      rateLimitData.blocked = false;
      rateLimitData.blockExpiresAt = 0;
      rateLimitData.requests = [];
    }

    // Remove old requests outside the window
    const windowStart = now - config.windowMs;
    rateLimitData.requests = rateLimitData.requests.filter(
      timestamp => timestamp > windowStart
    );

    // Check if within rate limit
    if (rateLimitData.requests.length >= config.maxRequests) {
      // User exceeded rate limit - block them
      rateLimitData.blocked = true;
      rateLimitData.blockExpiresAt = now + (config.blockDurationMs || config.windowMs);
      
      this.logger.warn('Rate limit exceeded - blocking user', {
        userId,
        operation,
        clientIp,
        requestCount: rateLimitData.requests.length,
        maxRequests: config.maxRequests,
        blockDurationMs: config.blockDurationMs,
      });

      userOperationLimits.set(operation, rateLimitData);

      return {
        allowed: false,
        retryAfterMs: config.blockDurationMs || config.windowMs,
        error: 'RATE_LIMIT_EXCEEDED',
      };
    }

    // Allow the request and record it
    rateLimitData.requests.push(now);
    userOperationLimits.set(operation, rateLimitData);

    const remainingRequests = config.maxRequests - rateLimitData.requests.length;
    
    this.logger.debug('Rate limit check passed', {
      userId,
      operation,
      requestCount: rateLimitData.requests.length,
      maxRequests: config.maxRequests,
      remainingRequests,
    });

    return {
      allowed: true,
      remainingRequests,
    };
  }

  /**
   * Records a successful operation (for monitoring and analytics)
   */
  recordOperation(userId: string, operation: string, clientIp?: string): void {
    // This is already handled in checkRateLimit, but we could add
    // additional analytics or success tracking here if needed
    this.logger.debug('Operation recorded', { userId, operation, clientIp });
  }

  /**
   * Gets current rate limit status for a user and operation
   */
  getRateLimitStatus(userId: string, operation: string): {
    requestCount: number;
    maxRequests: number;
    windowMs: number;
    blocked: boolean;
    blockExpiresAt: number;
    remainingRequests: number;
  } {
    const config = RATE_LIMIT_CONFIGS[operation] || RATE_LIMIT_CONFIGS.default;
    const userOperationLimits = this.getUserOperationLimits(userId);
    const rateLimitData = userOperationLimits.get(operation) || {
      requests: [],
      blocked: false,
      blockExpiresAt: 0,
    };

    const now = Date.now();
    const windowStart = now - config.windowMs;
    const currentRequests = rateLimitData.requests.filter(
      timestamp => timestamp > windowStart
    );

    return {
      requestCount: currentRequests.length,
      maxRequests: config.maxRequests,
      windowMs: config.windowMs,
      blocked: rateLimitData.blocked && now < rateLimitData.blockExpiresAt,
      blockExpiresAt: rateLimitData.blockExpiresAt,
      remainingRequests: Math.max(0, config.maxRequests - currentRequests.length),
    };
  }

  /**
   * Manually blocks a user for a specific operation (for admin intervention)
   */
  blockUser(userId: string, operation: string, durationMs: number, reason?: string): void {
    const userOperationLimits = this.getUserOperationLimits(userId);
    const now = Date.now();
    
    const rateLimitData = userOperationLimits.get(operation) || {
      requests: [],
      blocked: false,
      blockExpiresAt: 0,
    };

    rateLimitData.blocked = true;
    rateLimitData.blockExpiresAt = now + durationMs;
    userOperationLimits.set(operation, rateLimitData);

    this.logger.warn('User manually blocked', {
      userId,
      operation,
      durationMs,
      reason,
    });
  }

  /**
   * Manually unblocks a user for a specific operation
   */
  unblockUser(userId: string, operation: string): void {
    const userOperationLimits = this.getUserOperationLimits(userId);
    const rateLimitData = userOperationLimits.get(operation);
    
    if (rateLimitData) {
      rateLimitData.blocked = false;
      rateLimitData.blockExpiresAt = 0;
      userOperationLimits.set(operation, rateLimitData);

      this.logger.info('User manually unblocked', { userId, operation });
    }
  }

  /**
   * Gets aggregated rate limit statistics (for monitoring)
   */
  getStatistics(): {
    totalUsers: number;
    totalBlocked: number;
    operationStats: Array<{
      operation: string;
      totalRequests: number;
      blockedUsers: number;
    }>;
  } {
    let totalUsers = 0;
    let totalBlocked = 0;
    const operationStats = new Map<string, { totalRequests: number; blockedUsers: number }>();

    for (const [userId, operationLimits] of this.userLimits.entries()) {
      totalUsers++;
      let userBlocked = false;

      for (const [operation, rateLimitData] of operationLimits.entries()) {
        const stats = operationStats.get(operation) || { totalRequests: 0, blockedUsers: 0 };
        
        stats.totalRequests += rateLimitData.requests.length;
        
        if (rateLimitData.blocked && Date.now() < rateLimitData.blockExpiresAt) {
          stats.blockedUsers++;
          userBlocked = true;
        }
        
        operationStats.set(operation, stats);
      }

      if (userBlocked) {
        totalBlocked++;
      }
    }

    return {
      totalUsers,
      totalBlocked,
      operationStats: Array.from(operationStats.entries()).map(([operation, stats]) => ({
        operation,
        ...stats,
      })),
    };
  }

  /**
   * Clears all rate limit data (for testing or emergency reset)
   */
  clearAll(): void {
    this.userLimits.clear();
    this.logger.info('All rate limit data cleared');
  }

  /**
   * Destroys the rate limiter and cleans up resources
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.userLimits.clear();
    this.logger.info('Rate limiter destroyed');
  }

  private getUserOperationLimits(userId: string): Map<string, UserRateLimit> {
    let userOperationLimits = this.userLimits.get(userId);
    if (!userOperationLimits) {
      userOperationLimits = new Map();
      this.userLimits.set(userId, userOperationLimits);
    }
    return userOperationLimits;
  }

  private cleanupExpiredLimits(): void {
    const now = Date.now();
    let cleanedUsers = 0;
    let cleanedOperations = 0;

    for (const [userId, operationLimits] of this.userLimits.entries()) {
      const operationsToDelete: string[] = [];

      for (const [operation, rateLimitData] of operationLimits.entries()) {
        const config = RATE_LIMIT_CONFIGS[operation] || RATE_LIMIT_CONFIGS.default;
        const windowStart = now - config.windowMs;
        
        // Remove old requests
        const oldRequestCount = rateLimitData.requests.length;
        rateLimitData.requests = rateLimitData.requests.filter(
          timestamp => timestamp > windowStart
        );

        // Clear expired blocks
        if (rateLimitData.blocked && now >= rateLimitData.blockExpiresAt) {
          rateLimitData.blocked = false;
          rateLimitData.blockExpiresAt = 0;
        }

        // If no recent requests and not blocked, remove the operation data
        if (rateLimitData.requests.length === 0 && !rateLimitData.blocked) {
          operationsToDelete.push(operation);
          cleanedOperations++;
        }
      }

      // Remove empty operation limits
      operationsToDelete.forEach(operation => {
        operationLimits.delete(operation);
      });

      // Remove user if no operations left
      if (operationLimits.size === 0) {
        this.userLimits.delete(userId);
        cleanedUsers++;
      }
    }

    if (cleanedUsers > 0 || cleanedOperations > 0) {
      this.logger.debug('Rate limit cleanup completed', {
        cleanedUsers,
        cleanedOperations,
        remainingUsers: this.userLimits.size,
      });
    }
  }
}

// Global rate limiter instance
let globalRateLimiter: WebSocketRateLimiter | null = null;

export function getGlobalRateLimiter(): WebSocketRateLimiter {
  if (!globalRateLimiter) {
    globalRateLimiter = new WebSocketRateLimiter();
  }
  return globalRateLimiter;
}

export function destroyGlobalRateLimiter(): void {
  if (globalRateLimiter) {
    globalRateLimiter.destroy();
    globalRateLimiter = null;
  }
}