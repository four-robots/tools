import { LRUCache } from 'lru-cache';
import { Logger } from '../../utils/logger';

/**
 * Rate limiting configuration
 */
export interface RateLimitConfig {
  windowMs: number;         // Time window in milliseconds
  maxRequests: number;      // Maximum requests per window
  skipSuccessfulHits: boolean; // Don't count successful cache hits against limit
  skipFailedRequests: boolean; // Don't count failed requests against limit
  keyGenerator: (userId: string, workspaceId: string, requestType: string) => string;
  onLimitReached?: (key: string, hits: number, windowMs: number) => void;
}

/**
 * Request tracking information
 */
interface RequestInfo {
  count: number;
  resetTime: number;
  firstRequestTime: number;
}

/**
 * Rate limit result
 */
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  totalHits: number;
  retryAfter?: number; // Seconds until next request is allowed
}

/**
 * Different rate limit policies for different types of search requests
 */
export const SEARCH_RATE_LIMIT_POLICIES = {
  // General search requests
  SEARCH: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 30,     // 30 requests per minute
    skipSuccessfulHits: true,
    skipFailedRequests: false,
  },
  
  // Search suggestions (more lenient due to real-time nature)
  SUGGESTIONS: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 60,     // 60 requests per minute
    skipSuccessfulHits: true,
    skipFailedRequests: false,
  },
  
  // Full-text search (more resource intensive)
  FULLTEXT: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 20,     // 20 requests per minute
    skipSuccessfulHits: false,
    skipFailedRequests: false,
  },
  
  // Advanced search (most resource intensive)
  ADVANCED: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 15,     // 15 requests per minute
    skipSuccessfulHits: false,
    skipFailedRequests: false,
  },
  
  // Search history operations
  HISTORY: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 100,    // 100 requests per minute
    skipSuccessfulHits: true,
    skipFailedRequests: true,
  },
};

/**
 * Advanced rate limiter for whiteboard search operations
 * Supports multiple policies and sophisticated tracking
 */
export class WhiteboardSearchRateLimiter {
  private requestTracker: LRUCache<string, RequestInfo>;
  private logger: Logger;
  private policies: Map<string, RateLimitConfig>;

  constructor(logger: Logger, maxKeys: number = 10000) {
    this.logger = logger;
    this.policies = new Map();
    
    // Initialize request tracker with TTL cleanup
    this.requestTracker = new LRUCache({
      max: maxKeys,
      ttl: 5 * 60 * 1000, // 5 minutes TTL for cleanup
      updateAgeOnGet: false,
      updateAgeOnHas: false,
    });

    // Initialize default policies
    this.initializeDefaultPolicies();
  }

  /**
   * Initialize default rate limiting policies
   */
  private initializeDefaultPolicies(): void {
    Object.entries(SEARCH_RATE_LIMIT_POLICIES).forEach(([type, policy]) => {
      this.addPolicy(type, {
        ...policy,
        keyGenerator: (userId, workspaceId, requestType) => 
          `${requestType}:${userId}:${workspaceId}`,
        onLimitReached: (key, hits, windowMs) => {
          this.logger.warn('Rate limit exceeded', {
            key,
            hits,
            windowMs,
            timestamp: new Date().toISOString(),
          });
        },
      });
    });
  }

  /**
   * Add a new rate limiting policy
   */
  addPolicy(policyName: string, config: RateLimitConfig): void {
    this.policies.set(policyName, config);
  }

  /**
   * Get rate limiting policy
   */
  getPolicy(policyName: string): RateLimitConfig | undefined {
    return this.policies.get(policyName);
  }

  /**
   * Check if request is allowed under rate limit
   */
  checkRateLimit(
    userId: string,
    workspaceId: string,
    requestType: string,
    options: {
      wasSuccessful?: boolean;
      wasCacheHit?: boolean;
      hadError?: boolean;
    } = {}
  ): RateLimitResult {
    const policy = this.policies.get(requestType);
    
    if (!policy) {
      // No policy found, allow the request
      return {
        allowed: true,
        remaining: Infinity,
        resetTime: Date.now() + 60000,
        totalHits: 0,
      };
    }

    const key = policy.keyGenerator(userId, workspaceId, requestType);
    const now = Date.now();
    const windowStart = now - policy.windowMs;

    // Get or create request info
    let requestInfo = this.requestTracker.get(key);
    
    if (!requestInfo || requestInfo.resetTime <= now) {
      // Create new window
      requestInfo = {
        count: 0,
        resetTime: now + policy.windowMs,
        firstRequestTime: now,
      };
    }

    // Check if we should skip this request based on policy
    const shouldSkip = this.shouldSkipRequest(policy, options);
    
    if (!shouldSkip) {
      requestInfo.count++;
    }

    // Update the tracker
    this.requestTracker.set(key, requestInfo);

    // Check if limit is exceeded
    const isAllowed = requestInfo.count <= policy.maxRequests;
    const remaining = Math.max(0, policy.maxRequests - requestInfo.count);

    // Call rate limit reached callback if applicable
    if (!isAllowed && policy.onLimitReached) {
      policy.onLimitReached(key, requestInfo.count, policy.windowMs);
    }

    // Calculate retry after time
    const retryAfter = isAllowed ? undefined : 
      Math.ceil((requestInfo.resetTime - now) / 1000);

    return {
      allowed: isAllowed,
      remaining,
      resetTime: requestInfo.resetTime,
      totalHits: requestInfo.count,
      retryAfter,
    };
  }

  /**
   * Determine if request should be skipped based on policy
   */
  private shouldSkipRequest(
    policy: RateLimitConfig,
    options: {
      wasSuccessful?: boolean;
      wasCacheHit?: boolean;
      hadError?: boolean;
    }
  ): boolean {
    // Skip successful cache hits if policy allows
    if (policy.skipSuccessfulHits && options.wasCacheHit && options.wasSuccessful) {
      return true;
    }

    // Skip failed requests if policy allows
    if (policy.skipFailedRequests && options.hadError) {
      return true;
    }

    return false;
  }

  /**
   * Get current rate limit status without incrementing counter
   */
  getRateLimitStatus(
    userId: string,
    workspaceId: string,
    requestType: string
  ): RateLimitResult {
    const policy = this.policies.get(requestType);
    
    if (!policy) {
      return {
        allowed: true,
        remaining: Infinity,
        resetTime: Date.now() + 60000,
        totalHits: 0,
      };
    }

    const key = policy.keyGenerator(userId, workspaceId, requestType);
    const requestInfo = this.requestTracker.get(key);
    const now = Date.now();

    if (!requestInfo || requestInfo.resetTime <= now) {
      return {
        allowed: true,
        remaining: policy.maxRequests,
        resetTime: now + policy.windowMs,
        totalHits: 0,
      };
    }

    const isAllowed = requestInfo.count < policy.maxRequests;
    const remaining = Math.max(0, policy.maxRequests - requestInfo.count);
    const retryAfter = isAllowed ? undefined : 
      Math.ceil((requestInfo.resetTime - now) / 1000);

    return {
      allowed: isAllowed,
      remaining,
      resetTime: requestInfo.resetTime,
      totalHits: requestInfo.count,
      retryAfter,
    };
  }

  /**
   * Reset rate limit for specific key
   */
  resetRateLimit(userId: string, workspaceId: string, requestType: string): void {
    const policy = this.policies.get(requestType);
    if (!policy) return;

    const key = policy.keyGenerator(userId, workspaceId, requestType);
    this.requestTracker.delete(key);
  }

  /**
   * Get rate limiting statistics
   */
  getStatistics(): {
    totalTrackedKeys: number;
    policiesCount: number;
    policies: Array<{
      name: string;
      windowMs: number;
      maxRequests: number;
    }>;
    memoryUsage: {
      trackerSize: number;
      maxTrackerSize: number;
    };
  } {
    return {
      totalTrackedKeys: this.requestTracker.size,
      policiesCount: this.policies.size,
      policies: Array.from(this.policies.entries()).map(([name, policy]) => ({
        name,
        windowMs: policy.windowMs,
        maxRequests: policy.maxRequests,
      })),
      memoryUsage: {
        trackerSize: this.requestTracker.size,
        maxTrackerSize: this.requestTracker.max,
      },
    };
  }

  /**
   * Clean up expired entries
   */
  cleanup(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    // Find expired entries
    this.requestTracker.forEach((requestInfo, key) => {
      if (requestInfo.resetTime <= now) {
        expiredKeys.push(key);
      }
    });

    // Remove expired entries
    expiredKeys.forEach(key => {
      this.requestTracker.delete(key);
    });

    if (expiredKeys.length > 0) {
      this.logger.debug('Rate limiter cleanup completed', {
        expiredKeys: expiredKeys.length,
        remainingKeys: this.requestTracker.size,
      });
    }
  }

  /**
   * Clear all rate limiting data
   */
  clear(): void {
    this.requestTracker.clear();
    this.logger.info('Rate limiter cleared');
  }

  /**
   * Dispose and cleanup resources
   */
  dispose(): void {
    this.clear();
    this.policies.clear();
  }
}