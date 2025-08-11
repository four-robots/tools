/**
 * Conflict Resolution Rate Limiter
 * 
 * Advanced rate limiting and resource management for conflict resolution operations.
 * Provides per-user, per-session, and global rate limiting with automatic cleanup
 * and comprehensive resource usage tracking.
 */

import { logger } from '../utils/logger.js';
import { MetricsCollector } from '../utils/metrics-collector.js';

export interface RateLimitConfig {
  // Concurrent operation limits
  maxConcurrentMerges: number;         // e.g., 5 per user
  maxConcurrentTransforms: number;     // e.g., 10 per user
  maxConcurrentAIAnalysis: number;     // e.g., 2 per user (expensive)
  
  // Time-based limits
  maxOperationsPerMinute: number;      // e.g., 100 per user
  maxOperationsPerHour: number;        // e.g., 1000 per user
  maxAIOperationsPerHour: number;      // e.g., 50 per user (token limits)
  
  // Content size limits
  maxContentSize: number;              // e.g., 1MB per operation
  maxTotalContentPerHour: number;      // e.g., 100MB per user per hour
  
  // Session limits
  maxParticipantsPerSession: number;   // e.g., 20 collaborators
  maxSessionDuration: number;          // e.g., 8 hours
  
  // Global system limits
  globalMaxConcurrentOperations: number; // e.g., 1000 system-wide
  globalMaxOperationsPerMinute: number;  // e.g., 10000 system-wide
}

export interface UserLimitState {
  userId: string;
  concurrentMerges: number;
  concurrentTransforms: number;
  concurrentAIAnalysis: number;
  operationsThisMinute: number;
  operationsThisHour: number;
  aiOperationsThisHour: number;
  contentProcessedThisHour: number; // bytes
  lastOperationTime: number;
  lastCleanupTime: number;
}

export interface SessionLimitState {
  sessionId: string;
  participantCount: number;
  startTime: number;
  lastActivityTime: number;
  operationCount: number;
}

export interface GlobalLimitState {
  concurrentOperations: number;
  operationsThisMinute: number;
  lastMinuteReset: number;
}

export enum RateLimitResult {
  ALLOWED = 'allowed',
  USER_CONCURRENT_LIMIT = 'user_concurrent_limit',
  USER_RATE_LIMIT = 'user_rate_limit',
  USER_CONTENT_LIMIT = 'user_content_limit',
  SESSION_LIMIT = 'session_limit',
  GLOBAL_LIMIT = 'global_limit',
  CONTENT_TOO_LARGE = 'content_too_large'
}

/**
 * Comprehensive rate limiting service for conflict resolution operations
 */
export class ConflictResolutionRateLimiter {
  private static instance: ConflictResolutionRateLimiter;
  private userLimits = new Map<string, UserLimitState>();
  private sessionLimits = new Map<string, SessionLimitState>();
  private globalLimits: GlobalLimitState;
  private cleanupInterval: NodeJS.Timeout;

  private readonly defaultConfig: RateLimitConfig = {
    maxConcurrentMerges: 5,
    maxConcurrentTransforms: 10,
    maxConcurrentAIAnalysis: 2,
    maxOperationsPerMinute: 100,
    maxOperationsPerHour: 1000,
    maxAIOperationsPerHour: 50,
    maxContentSize: 1024 * 1024, // 1MB
    maxTotalContentPerHour: 100 * 1024 * 1024, // 100MB
    maxParticipantsPerSession: 20,
    maxSessionDuration: 8 * 60 * 60 * 1000, // 8 hours
    globalMaxConcurrentOperations: 1000,
    globalMaxOperationsPerMinute: 10000
  };

  constructor(private config: RateLimitConfig = {} as RateLimitConfig) {
    // Merge with defaults
    this.config = { ...this.defaultConfig, ...config };
    
    // Initialize global limits
    this.globalLimits = {
      concurrentOperations: 0,
      operationsThisMinute: 0,
      lastMinuteReset: Date.now()
    };

    // Start cleanup interval
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000); // Every minute
  }

  /**
   * Get singleton instance
   */
  public static getInstance(config?: RateLimitConfig): ConflictResolutionRateLimiter {
    if (!ConflictResolutionRateLimiter.instance) {
      ConflictResolutionRateLimiter.instance = new ConflictResolutionRateLimiter(config);
    }
    return ConflictResolutionRateLimiter.instance;
  }

  /**
   * Check if operation is allowed for user
   */
  static async checkLimits(
    userId: string, 
    operation: string, 
    sessionId?: string,
    contentSize?: number
  ): Promise<RateLimitResult> {
    const instance = ConflictResolutionRateLimiter.getInstance();
    return instance.checkUserLimits(userId, operation, sessionId, contentSize);
  }

  /**
   * Record operation for rate limiting
   */
  static async recordOperation(
    userId: string, 
    operation: string,
    sessionId?: string,
    contentSize?: number
  ): Promise<void> {
    const instance = ConflictResolutionRateLimiter.getInstance();
    return instance.recordUserOperation(userId, operation, sessionId, contentSize);
  }

  /**
   * Complete operation (decrement concurrent counters)
   */
  static async completeOperation(
    userId: string,
    operation: string,
    sessionId?: string
  ): Promise<void> {
    const instance = ConflictResolutionRateLimiter.getInstance();
    return instance.completeUserOperation(userId, operation, sessionId);
  }

  /**
   * Add participant to session
   */
  static async addSessionParticipant(sessionId: string, userId: string): Promise<RateLimitResult> {
    const instance = ConflictResolutionRateLimiter.getInstance();
    return instance.addParticipant(sessionId, userId);
  }

  /**
   * Remove participant from session
   */
  static async removeSessionParticipant(sessionId: string, userId: string): Promise<void> {
    const instance = ConflictResolutionRateLimiter.getInstance();
    return instance.removeParticipant(sessionId, userId);
  }

  /**
   * Get current rate limit status for user
   */
  static async getRateLimitStatus(userId: string): Promise<{
    limits: RateLimitConfig;
    current: UserLimitState;
    remaining: {
      concurrentMerges: number;
      concurrentTransforms: number;
      operationsThisMinute: number;
      operationsThisHour: number;
      contentThisHour: number;
    };
  }> {
    const instance = ConflictResolutionRateLimiter.getInstance();
    const userState = instance.getUserState(userId);
    
    return {
      limits: instance.config,
      current: userState,
      remaining: {
        concurrentMerges: Math.max(0, instance.config.maxConcurrentMerges - userState.concurrentMerges),
        concurrentTransforms: Math.max(0, instance.config.maxConcurrentTransforms - userState.concurrentTransforms),
        operationsThisMinute: Math.max(0, instance.config.maxOperationsPerMinute - userState.operationsThisMinute),
        operationsThisHour: Math.max(0, instance.config.maxOperationsPerHour - userState.operationsThisHour),
        contentThisHour: Math.max(0, instance.config.maxTotalContentPerHour - userState.contentProcessedThisHour)
      }
    };
  }

  /**
   * Internal method to check user limits
   */
  private async checkUserLimits(
    userId: string,
    operation: string,
    sessionId?: string,
    contentSize?: number
  ): Promise<RateLimitResult> {
    const now = Date.now();
    
    // Check global limits first
    const globalCheck = this.checkGlobalLimits();
    if (globalCheck !== RateLimitResult.ALLOWED) {
      return globalCheck;
    }

    // Check content size limit
    if (contentSize && contentSize > this.config.maxContentSize) {
      MetricsCollector.recordError(
        'rate_limiting',
        'content_too_large',
        `Content size ${contentSize} exceeds limit ${this.config.maxContentSize}`,
        0,
        { userId, contentSize }
      );
      return RateLimitResult.CONTENT_TOO_LARGE;
    }

    // Get or create user state
    const userState = this.getUserState(userId);
    
    // Check session limits
    if (sessionId) {
      const sessionCheck = this.checkSessionLimits(sessionId);
      if (sessionCheck !== RateLimitResult.ALLOWED) {
        return sessionCheck;
      }
    }

    // Check concurrent operation limits
    const concurrentCheck = this.checkConcurrentLimits(userState, operation);
    if (concurrentCheck !== RateLimitResult.ALLOWED) {
      return concurrentCheck;
    }

    // Check time-based rate limits
    const rateCheck = this.checkRateLimits(userState, operation, now);
    if (rateCheck !== RateLimitResult.ALLOWED) {
      return rateCheck;
    }

    // Check content limits
    if (contentSize) {
      const contentCheck = this.checkContentLimits(userState, contentSize, now);
      if (contentCheck !== RateLimitResult.ALLOWED) {
        return contentCheck;
      }
    }

    return RateLimitResult.ALLOWED;
  }

  /**
   * Record operation for user
   */
  private async recordUserOperation(
    userId: string,
    operation: string,
    sessionId?: string,
    contentSize?: number
  ): Promise<void> {
    const now = Date.now();
    const userState = this.getUserState(userId);
    
    // Update concurrent counters
    switch (operation) {
      case 'merge_operation':
        userState.concurrentMerges++;
        break;
      case 'operation_transform':
        userState.concurrentTransforms++;
        break;
      case 'ai_analysis':
        userState.concurrentAIAnalysis++;
        break;
    }

    // Update rate counters
    userState.operationsThisMinute++;
    userState.operationsThisHour++;
    if (operation === 'ai_analysis') {
      userState.aiOperationsThisHour++;
    }
    
    // Update content counter
    if (contentSize) {
      userState.contentProcessedThisHour += contentSize;
    }

    userState.lastOperationTime = now;

    // Update global counters
    this.globalLimits.concurrentOperations++;
    this.globalLimits.operationsThisMinute++;

    // Update session if provided
    if (sessionId) {
      const sessionState = this.getSessionState(sessionId);
      sessionState.operationCount++;
      sessionState.lastActivityTime = now;
    }

    logger.debug('Operation recorded for rate limiting', {
      userId,
      operation,
      sessionId,
      contentSize,
      currentState: {
        concurrentMerges: userState.concurrentMerges,
        concurrentTransforms: userState.concurrentTransforms,
        operationsThisMinute: userState.operationsThisMinute
      }
    });
  }

  /**
   * Complete operation for user
   */
  private async completeUserOperation(
    userId: string,
    operation: string,
    sessionId?: string
  ): Promise<void> {
    const userState = this.userLimits.get(userId);
    if (!userState) return;

    // Decrement concurrent counters
    switch (operation) {
      case 'merge_operation':
        userState.concurrentMerges = Math.max(0, userState.concurrentMerges - 1);
        break;
      case 'operation_transform':
        userState.concurrentTransforms = Math.max(0, userState.concurrentTransforms - 1);
        break;
      case 'ai_analysis':
        userState.concurrentAIAnalysis = Math.max(0, userState.concurrentAIAnalysis - 1);
        break;
    }

    // Decrement global counter
    this.globalLimits.concurrentOperations = Math.max(0, this.globalLimits.concurrentOperations - 1);

    logger.debug('Operation completed for rate limiting', {
      userId,
      operation,
      sessionId,
      remainingConcurrent: {
        merges: userState.concurrentMerges,
        transforms: userState.concurrentTransforms,
        aiAnalysis: userState.concurrentAIAnalysis
      }
    });
  }

  /**
   * Add participant to session
   */
  private async addParticipant(sessionId: string, userId: string): Promise<RateLimitResult> {
    const sessionState = this.getSessionState(sessionId);
    
    if (sessionState.participantCount >= this.config.maxParticipantsPerSession) {
      MetricsCollector.recordError(
        'rate_limiting',
        'session_participant_limit',
        `Session ${sessionId} has reached participant limit`,
        0,
        { sessionId, currentParticipants: sessionState.participantCount }
      );
      return RateLimitResult.SESSION_LIMIT;
    }

    sessionState.participantCount++;
    sessionState.lastActivityTime = Date.now();

    logger.debug('Participant added to session', {
      sessionId,
      userId,
      participantCount: sessionState.participantCount
    });

    return RateLimitResult.ALLOWED;
  }

  /**
   * Remove participant from session
   */
  private async removeParticipant(sessionId: string, userId: string): Promise<void> {
    const sessionState = this.sessionLimits.get(sessionId);
    if (!sessionState) return;

    sessionState.participantCount = Math.max(0, sessionState.participantCount - 1);
    sessionState.lastActivityTime = Date.now();

    // Clean up empty sessions
    if (sessionState.participantCount === 0) {
      this.sessionLimits.delete(sessionId);
      logger.debug('Empty session removed', { sessionId });
    }

    logger.debug('Participant removed from session', {
      sessionId,
      userId,
      remainingParticipants: sessionState.participantCount
    });
  }

  /**
   * Get or create user state
   */
  private getUserState(userId: string): UserLimitState {
    if (!this.userLimits.has(userId)) {
      const now = Date.now();
      this.userLimits.set(userId, {
        userId,
        concurrentMerges: 0,
        concurrentTransforms: 0,
        concurrentAIAnalysis: 0,
        operationsThisMinute: 0,
        operationsThisHour: 0,
        aiOperationsThisHour: 0,
        contentProcessedThisHour: 0,
        lastOperationTime: now,
        lastCleanupTime: now
      });
    }
    return this.userLimits.get(userId)!;
  }

  /**
   * Get or create session state
   */
  private getSessionState(sessionId: string): SessionLimitState {
    if (!this.sessionLimits.has(sessionId)) {
      const now = Date.now();
      this.sessionLimits.set(sessionId, {
        sessionId,
        participantCount: 0,
        startTime: now,
        lastActivityTime: now,
        operationCount: 0
      });
    }
    return this.sessionLimits.get(sessionId)!;
  }

  /**
   * Check global limits
   */
  private checkGlobalLimits(): RateLimitResult {
    const now = Date.now();
    
    // Reset minute counter if needed
    if (now - this.globalLimits.lastMinuteReset >= 60000) {
      this.globalLimits.operationsThisMinute = 0;
      this.globalLimits.lastMinuteReset = now;
    }

    // Check global concurrent limit
    if (this.globalLimits.concurrentOperations >= this.config.globalMaxConcurrentOperations) {
      MetricsCollector.recordError(
        'rate_limiting',
        'global_concurrent_limit',
        'Global concurrent operation limit exceeded',
        0,
        { currentOperations: this.globalLimits.concurrentOperations }
      );
      return RateLimitResult.GLOBAL_LIMIT;
    }

    // Check global rate limit
    if (this.globalLimits.operationsThisMinute >= this.config.globalMaxOperationsPerMinute) {
      MetricsCollector.recordError(
        'rate_limiting',
        'global_rate_limit',
        'Global rate limit exceeded',
        0,
        { operationsThisMinute: this.globalLimits.operationsThisMinute }
      );
      return RateLimitResult.GLOBAL_LIMIT;
    }

    return RateLimitResult.ALLOWED;
  }

  /**
   * Check session limits
   */
  private checkSessionLimits(sessionId: string): RateLimitResult {
    const sessionState = this.getSessionState(sessionId);
    const now = Date.now();

    // Check session duration
    if (now - sessionState.startTime > this.config.maxSessionDuration) {
      MetricsCollector.recordError(
        'rate_limiting',
        'session_duration_limit',
        'Session duration limit exceeded',
        0,
        { sessionId, duration: now - sessionState.startTime }
      );
      return RateLimitResult.SESSION_LIMIT;
    }

    return RateLimitResult.ALLOWED;
  }

  /**
   * Check concurrent operation limits
   */
  private checkConcurrentLimits(userState: UserLimitState, operation: string): RateLimitResult {
    switch (operation) {
      case 'merge_operation':
        if (userState.concurrentMerges >= this.config.maxConcurrentMerges) {
          return RateLimitResult.USER_CONCURRENT_LIMIT;
        }
        break;
      case 'operation_transform':
        if (userState.concurrentTransforms >= this.config.maxConcurrentTransforms) {
          return RateLimitResult.USER_CONCURRENT_LIMIT;
        }
        break;
      case 'ai_analysis':
        if (userState.concurrentAIAnalysis >= this.config.maxConcurrentAIAnalysis) {
          return RateLimitResult.USER_CONCURRENT_LIMIT;
        }
        break;
    }
    return RateLimitResult.ALLOWED;
  }

  /**
   * Check time-based rate limits
   */
  private checkRateLimits(userState: UserLimitState, operation: string, now: number): RateLimitResult {
    // Check per-minute limit
    if (userState.operationsThisMinute >= this.config.maxOperationsPerMinute) {
      return RateLimitResult.USER_RATE_LIMIT;
    }

    // Check per-hour limit
    if (userState.operationsThisHour >= this.config.maxOperationsPerHour) {
      return RateLimitResult.USER_RATE_LIMIT;
    }

    // Check AI-specific hourly limit
    if (operation === 'ai_analysis' && 
        userState.aiOperationsThisHour >= this.config.maxAIOperationsPerHour) {
      return RateLimitResult.USER_RATE_LIMIT;
    }

    return RateLimitResult.ALLOWED;
  }

  /**
   * Check content size limits
   */
  private checkContentLimits(userState: UserLimitState, contentSize: number, now: number): RateLimitResult {
    if (userState.contentProcessedThisHour + contentSize > this.config.maxTotalContentPerHour) {
      return RateLimitResult.USER_CONTENT_LIMIT;
    }
    return RateLimitResult.ALLOWED;
  }

  /**
   * Periodic cleanup of expired limits
   */
  private cleanup(): void {
    const now = Date.now();
    const oneMinute = 60 * 1000;
    const oneHour = 60 * 60 * 1000;
    
    // Clean up user limits
    for (const [userId, userState] of this.userLimits.entries()) {
      // Reset minute counters
      if (now - userState.lastCleanupTime >= oneMinute) {
        userState.operationsThisMinute = 0;
      }
      
      // Reset hourly counters
      if (now - userState.lastCleanupTime >= oneHour) {
        userState.operationsThisHour = 0;
        userState.aiOperationsThisHour = 0;
        userState.contentProcessedThisHour = 0;
      }
      
      userState.lastCleanupTime = now;
      
      // Remove inactive users (no operations in last hour)
      if (now - userState.lastOperationTime > oneHour && 
          userState.concurrentMerges === 0 &&
          userState.concurrentTransforms === 0 &&
          userState.concurrentAIAnalysis === 0) {
        this.userLimits.delete(userId);
      }
    }
    
    // Clean up inactive sessions
    for (const [sessionId, sessionState] of this.sessionLimits.entries()) {
      if (now - sessionState.lastActivityTime > this.config.maxSessionDuration ||
          sessionState.participantCount === 0) {
        this.sessionLimits.delete(sessionId);
      }
    }

    logger.debug('Rate limiter cleanup completed', {
      activeUsers: this.userLimits.size,
      activeSessions: this.sessionLimits.size,
      globalConcurrentOps: this.globalLimits.concurrentOperations
    });
  }

  /**
   * Graceful shutdown
   */
  public destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}

// Export static methods for easy use
export const checkRateLimit = ConflictResolutionRateLimiter.checkLimits;
export const recordOperation = ConflictResolutionRateLimiter.recordOperation;
export const completeOperation = ConflictResolutionRateLimiter.completeOperation;
export const addSessionParticipant = ConflictResolutionRateLimiter.addSessionParticipant;
export const removeSessionParticipant = ConflictResolutionRateLimiter.removeSessionParticipant;
export const getRateLimitStatus = ConflictResolutionRateLimiter.getRateLimitStatus;