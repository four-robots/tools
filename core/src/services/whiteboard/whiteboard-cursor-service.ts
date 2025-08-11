/**
 * Whiteboard Cursor Service
 * 
 * Manages real-time cursor tracking, interpolation, and state management for collaborative whiteboards.
 * Provides smooth cursor movement with <100ms latency and handles disconnections gracefully.
 */

import { Logger } from '../../utils/logger.js';
import {
  LiveCursorPosition,
  LiveCursorState,
  CursorInterpolationConfig,
} from '@shared/types/whiteboard.js';
// Enhanced LRU Cache implementation with proper memory management
class SimpleLRUCache<K, V> {
  private cache = new Map<K, V>();
  private accessOrder = new Set<K>(); // Track access order separately
  private maxSize: number;
  private hits = 0;
  private misses = 0;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private weakRefs: Map<K, WeakRef<V>> = new Map();
  private finalizationRegistry: FinalizationRegistry<K>;

  constructor(private name: string, maxSize: number = 1000) {
    this.maxSize = maxSize;
    
    // Set up finalization registry to track when objects are garbage collected
    this.finalizationRegistry = new FinalizationRegistry((key: K) => {
      this.weakRefs.delete(key);
      this.accessOrder.delete(key);
    });

    // Periodic cleanup to prevent memory leaks
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 30000); // Clean up every 30 seconds
  }

  get(key: K): V | undefined {
    // First check if the value still exists
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Update access order
      this.accessOrder.delete(key);
      this.accessOrder.add(key);
      this.hits++;
      return value;
    }

    // Check weak reference
    const weakRef = this.weakRefs.get(key);
    if (weakRef) {
      const weakValue = weakRef.deref();
      if (weakValue) {
        // Restore to main cache
        this.cache.set(key, weakValue);
        this.accessOrder.delete(key);
        this.accessOrder.add(key);
        this.hits++;
        return weakValue;
      } else {
        // Object was garbage collected, clean up
        this.weakRefs.delete(key);
        this.accessOrder.delete(key);
      }
    }

    this.misses++;
    return undefined;
  }

  set(key: K, value: V): void {
    // Remove from access order if it exists
    this.accessOrder.delete(key);

    // Check if we need to evict
    while (this.cache.size >= this.maxSize) {
      this.evictLeastRecentlyUsed();
    }

    // Add to cache and access order
    this.cache.set(key, value);
    this.accessOrder.add(key);

    // Create weak reference for complex objects
    if (this.isComplexObject(value)) {
      const weakRef = new WeakRef(value);
      this.weakRefs.set(key, weakRef);
      this.finalizationRegistry.register(value, key);
    }
  }

  delete(key: K): boolean {
    this.accessOrder.delete(key);
    this.weakRefs.delete(key);
    return this.cache.delete(key);
  }

  size(): number {
    return this.cache.size;
  }

  entries(): IterableIterator<[K, V]> {
    return this.cache.entries();
  }

  values(): IterableIterator<V> {
    return this.cache.values();
  }

  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hits: this.hits,
      misses: this.misses,
      weakRefsCount: this.weakRefs.size,
    };
  }

  destroy(): void {
    // Clear cleanup interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // Clear all references
    this.cache.clear();
    this.accessOrder.clear();
    this.weakRefs.clear();
    
    // Reset stats
    this.hits = 0;
    this.misses = 0;
  }

  private evictLeastRecentlyUsed(): void {
    // Get the least recently used key
    const lruKey = this.accessOrder.keys().next().value;
    if (lruKey !== undefined) {
      const value = this.cache.get(lruKey);
      
      // Move to weak reference if it's a complex object
      if (value && this.isComplexObject(value)) {
        const weakRef = new WeakRef(value);
        this.weakRefs.set(lruKey, weakRef);
        this.finalizationRegistry.register(value, lruKey);
      }

      // Remove from main cache
      this.cache.delete(lruKey);
      this.accessOrder.delete(lruKey);
    }
  }

  private isComplexObject(value: V): boolean {
    return value !== null && typeof value === 'object';
  }

  private cleanup(): void {
    let cleanedCount = 0;
    
    // Clean up dead weak references
    for (const [key, weakRef] of this.weakRefs.entries()) {
      const value = weakRef.deref();
      if (!value) {
        this.weakRefs.delete(key);
        this.accessOrder.delete(key);
        cleanedCount++;
      }
    }

    // Clean up orphaned access order entries
    for (const key of this.accessOrder) {
      if (!this.cache.has(key) && !this.weakRefs.has(key)) {
        this.accessOrder.delete(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.debug(`${this.name} cache cleanup: removed ${cleanedCount} dead references`);
    }
  }
}

interface CursorUpdate {
  userId: string;
  position: LiveCursorPosition;
  timestamp: number;
  sequenceId: number;
}

interface CursorSessionInfo {
  userId: string;
  userName: string;
  userColor: string;
  sessionId: string;
  whiteboardId: string;
  lastSeen: number;
  isActive: boolean;
}

interface InterpolationState {
  startPosition: LiveCursorPosition;
  endPosition: LiveCursorPosition;
  startTime: number;
  duration: number;
  easing: string;
}

interface CursorUpdateQueue {
  updates: CursorUpdate[];
  processing: boolean;
  lastProcessedSequence: number;
}

/**
 * Core cursor tracking service with advanced interpolation and performance optimizations
 */
export class WhiteboardCursorService {
  private logger: Logger;
  private cursors: SimpleLRUCache<string, LiveCursorState>;
  private cursorSessions: SimpleLRUCache<string, CursorSessionInfo>;
  private interpolationStates: Map<string, InterpolationState>;
  private config: CursorInterpolationConfig;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private updateQueues: Map<string, CursorUpdateQueue>;
  private sequenceCounters: Map<string, number>;
  private readonly UPDATE_THROTTLE_MS = 16; // 60 FPS
  private readonly CURSOR_TIMEOUT_MS = 30000; // 30 seconds
  private readonly MAX_INTERPOLATION_DISTANCE = 500; // pixels
  private readonly MAX_QUEUE_SIZE = 100; // Maximum updates in queue
  
  // Input validation bounds
  private readonly MIN_COORDINATE = -1000000; // -1M pixels
  private readonly MAX_COORDINATE = 1000000; // 1M pixels  
  private readonly MAX_COORDINATE_PRECISION = 2; // 2 decimal places

  constructor(logger?: Logger) {
    this.logger = logger || new Logger('WhiteboardCursorService');
    this.cursors = new SimpleLRUCache<string, LiveCursorState>('cursors', 1000);
    this.cursorSessions = new SimpleLRUCache<string, CursorSessionInfo>('cursor-sessions', 500);
    this.interpolationStates = new Map();
    this.updateQueues = new Map();
    this.sequenceCounters = new Map();
    this.config = {
      enabled: true,
      duration: 200,
      easing: 'ease-out',
      threshold: 5,
    };

    this.startCleanupInterval();
    this.logger.info('WhiteboardCursorService initialized');
  }

  /**
   * Update cursor position with atomic operations and queue management
   */
  async updateCursorPosition(
    userId: string,
    whiteboardId: string,
    position: LiveCursorPosition,
    sessionInfo?: Partial<CursorSessionInfo>
  ): Promise<LiveCursorState> {
    try {
      // Validate all inputs
      this.validateUserId(userId);
      this.validateWhiteboardId(whiteboardId);
      const sanitizedPosition = this.validateAndSanitizePosition(position);
      
      const cursorKey = this.getCursorKey(userId, whiteboardId);
      const sequenceId = this.getNextSequenceId(cursorKey);
      
      const update: CursorUpdate = {
        userId,
        position: sanitizedPosition,
        timestamp: Date.now(),
        sequenceId,
      };

      // Add to queue for atomic processing
      await this.queueCursorUpdate(cursorKey, update, sessionInfo);
      
      // Process queue if not already processing
      this.processCursorUpdateQueue(cursorKey);

      // Return current state (may be previous state if update is still queued)
      const currentState = this.cursors.get(cursorKey);
      if (!currentState) {
        // Create initial state for immediate return
        const initialState: LiveCursorState = {
          userId,
          userName: sessionInfo?.userName || 'Unknown User',
          userColor: sessionInfo?.userColor || this.generateUserColor(userId),
          currentPosition: {
            ...sanitizedPosition,
            timestamp: update.timestamp,
            interpolated: false,
          },
          lastPosition: undefined,
          isActive: true,
          lastSeen: update.timestamp,
          sessionId: sessionInfo?.sessionId || `session_${userId}_${whiteboardId}`,
        };
        this.cursors.set(cursorKey, initialState);
        return initialState;
      }

      return currentState;
    } catch (error) {
      this.logger.error('Failed to update cursor position', { error, userId, whiteboardId });
      throw error;
    }
  }

  /**
   * Get all active cursors for a whiteboard
   */
  getActiveWhiteboardCursors(whiteboardId: string): LiveCursorState[] {
    const cursors: LiveCursorState[] = [];
    const now = Date.now();

    for (const [key, cursor] of this.cursors.entries()) {
      if (key.includes(whiteboardId) && cursor.isActive) {
        // Check if cursor is still active (not timed out)
        if (now - cursor.lastSeen <= this.CURSOR_TIMEOUT_MS) {
          cursors.push(cursor);
        } else {
          // Mark as inactive but don't delete yet
          cursor.isActive = false;
          this.cursors.set(key, cursor);
        }
      }
    }

    return cursors;
  }

  /**
   * Get specific cursor state
   */
  getCursorState(userId: string, whiteboardId: string): LiveCursorState | null {
    const cursorKey = this.getCursorKey(userId, whiteboardId);
    return this.cursors.get(cursorKey) || null;
  }

  /**
   * Remove cursor (user left or disconnected)
   */
  async removeCursor(
    userId: string, 
    whiteboardId: string, 
    reason: 'timeout' | 'disconnect' | 'leave' = 'disconnect'
  ): Promise<void> {
    try {
      const cursorKey = this.getCursorKey(userId, whiteboardId);
      const cursor = this.cursors.get(cursorKey);
      
      if (cursor) {
        // Mark as inactive for graceful fade-out
        cursor.isActive = false;
        cursor.lastSeen = Date.now();
        this.cursors.set(cursorKey, cursor);

        // Clean up interpolation state
        this.interpolationStates.delete(cursorKey);

        // Clean up session
        const sessionKey = this.getSessionKey(cursor.sessionId, whiteboardId);
        this.cursorSessions.delete(sessionKey);

        this.logger.info('Cursor removed', { userId, whiteboardId, reason });
      }
    } catch (error) {
      this.logger.error('Failed to remove cursor', { error, userId, whiteboardId });
    }
  }

  /**
   * Get interpolated position for smooth animation
   */
  getInterpolatedPosition(userId: string, whiteboardId: string, timestamp: number): LiveCursorPosition | null {
    if (!this.config.enabled) return null;

    const cursorKey = this.getCursorKey(userId, whiteboardId);
    const interpolationState = this.interpolationStates.get(cursorKey);
    
    if (!interpolationState) return null;

    const { startPosition, endPosition, startTime, duration, easing } = interpolationState;
    const elapsed = timestamp - startTime;
    
    if (elapsed >= duration) {
      // Animation complete
      this.interpolationStates.delete(cursorKey);
      return endPosition;
    }

    // Calculate interpolated position
    const progress = Math.min(elapsed / duration, 1);
    const easedProgress = this.applyEasing(progress, easing);

    const interpolatedPosition: LiveCursorPosition = {
      x: this.lerp(startPosition.x, endPosition.x, easedProgress),
      y: this.lerp(startPosition.y, endPosition.y, easedProgress),
      canvasX: this.lerp(startPosition.canvasX, endPosition.canvasX, easedProgress),
      canvasY: this.lerp(startPosition.canvasY, endPosition.canvasY, easedProgress),
      timestamp,
      interpolated: true,
    };

    return interpolatedPosition;
  }

  /**
   * Update interpolation configuration
   */
  updateInterpolationConfig(config: Partial<CursorInterpolationConfig>): void {
    this.config = { ...this.config, ...config };
    this.logger.info('Interpolation config updated', this.config);
  }

  /**
   * Get cursor tracking statistics
   */
  getStats(): {
    activeCursors: number;
    totalCursors: number;
    activeSessions: number;
    interpolatingCursors: number;
    memoryUsage: {
      cursors: ReturnType<SimpleLRUCache<string, LiveCursorState>['getStats']>;
      sessions: ReturnType<SimpleLRUCache<string, CursorSessionInfo>['getStats']>;
    };
  } {
    const now = Date.now();
    let activeCursors = 0;
    
    for (const cursor of this.cursors.values()) {
      if (cursor.isActive && (now - cursor.lastSeen <= this.CURSOR_TIMEOUT_MS)) {
        activeCursors++;
      }
    }

    return {
      activeCursors,
      totalCursors: this.cursors.size(),
      activeSessions: this.cursorSessions.size(),
      interpolatingCursors: this.interpolationStates.size,
      memoryUsage: {
        cursors: this.cursors.getStats(),
        sessions: this.cursorSessions.getStats(),
      },
    };
  }

  /**
   * Force cleanup of inactive cursors
   */
  async forceCleanup(): Promise<{ cleaned: number }> {
    const now = Date.now();
    let cleaned = 0;

    // Clean up cursors
    for (const [key, cursor] of this.cursors.entries()) {
      if (!cursor.isActive || (now - cursor.lastSeen > this.CURSOR_TIMEOUT_MS)) {
        this.cursors.delete(key);
        cleaned++;
      }
    }

    // Clean up sessions
    for (const [key, session] of this.cursorSessions.entries()) {
      if (!session.isActive || (now - session.lastSeen > this.CURSOR_TIMEOUT_MS)) {
        this.cursorSessions.delete(key);
        cleaned++;
      }
    }

    // Clean up interpolation states
    const staleInterpolations = [];
    for (const [key, state] of this.interpolationStates.entries()) {
      if (now - state.startTime > state.duration + 1000) { // 1s grace period
        staleInterpolations.push(key);
      }
    }
    
    staleInterpolations.forEach(key => {
      this.interpolationStates.delete(key);
      cleaned++;
    });

    if (cleaned > 0) {
      this.logger.info('Cursor cleanup completed', { cleaned });
    }

    return { cleaned };
  }

  /**
   * Shutdown service and clean up resources
   */
  async shutdown(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // Wait for all queues to finish processing
    const maxWaitMs = 5000; // 5 seconds max wait
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitMs) {
      let allQueuesIdle = true;
      for (const queue of this.updateQueues.values()) {
        if (queue.processing || queue.updates.length > 0) {
          allQueuesIdle = false;
          break;
        }
      }
      if (allQueuesIdle) break;
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    this.cursors.destroy();
    this.cursorSessions.destroy();
    this.interpolationStates.clear();
    this.updateQueues.clear();
    this.sequenceCounters.clear();

    this.logger.info('WhiteboardCursorService shutdown');
  }

  // Private helper methods

  private validateUserId(userId: string): void {
    if (!userId || typeof userId !== 'string') {
      throw new Error('Invalid userId: must be a non-empty string');
    }
    if (userId.length > 255) {
      throw new Error('Invalid userId: must be 255 characters or less');
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(userId)) {
      throw new Error('Invalid userId: contains invalid characters');
    }
  }

  private validateWhiteboardId(whiteboardId: string): void {
    if (!whiteboardId || typeof whiteboardId !== 'string') {
      throw new Error('Invalid whiteboardId: must be a non-empty string');
    }
    if (whiteboardId.length > 255) {
      throw new Error('Invalid whiteboardId: must be 255 characters or less');
    }
    // UUIDs or similar format
    if (!/^[a-zA-Z0-9_-]+$/.test(whiteboardId)) {
      throw new Error('Invalid whiteboardId: contains invalid characters');
    }
  }

  private validateAndSanitizePosition(position: LiveCursorPosition): LiveCursorPosition {
    if (!position || typeof position !== 'object') {
      throw new Error('Invalid position: must be an object');
    }

    const { x, y, canvasX, canvasY } = position;

    // Validate coordinate types
    if (typeof x !== 'number' || typeof y !== 'number') {
      throw new Error('Invalid position: x and y must be numbers');
    }
    if (typeof canvasX !== 'number' || typeof canvasY !== 'number') {
      throw new Error('Invalid position: canvasX and canvasY must be numbers');
    }

    // Check for invalid numbers (NaN, Infinity)
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(canvasX) || !Number.isFinite(canvasY)) {
      throw new Error('Invalid position: coordinates must be finite numbers');
    }

    // Apply bounds checking
    const sanitizedX = this.clampAndRoundCoordinate(x);
    const sanitizedY = this.clampAndRoundCoordinate(y);
    const sanitizedCanvasX = this.clampAndRoundCoordinate(canvasX);
    const sanitizedCanvasY = this.clampAndRoundCoordinate(canvasY);

    return {
      x: sanitizedX,
      y: sanitizedY,
      canvasX: sanitizedCanvasX,
      canvasY: sanitizedCanvasY,
      timestamp: position.timestamp,
      interpolated: position.interpolated || false,
    };
  }

  private clampAndRoundCoordinate(value: number): number {
    // Clamp to reasonable bounds
    const clamped = Math.max(this.MIN_COORDINATE, Math.min(this.MAX_COORDINATE, value));
    // Round to specified precision to prevent floating point issues
    return Math.round(clamped * Math.pow(10, this.MAX_COORDINATE_PRECISION)) / Math.pow(10, this.MAX_COORDINATE_PRECISION);
  }

  private getCursorKey(userId: string, whiteboardId: string): string {
    return `${whiteboardId}:${userId}`;
  }

  private getSessionKey(sessionId: string, whiteboardId: string): string {
    return `${whiteboardId}:${sessionId}`;
  }

  private generateUserColor(userId: string): string {
    const colors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
      '#DDA0DD', '#FFB347', '#98D8E8', '#F7DC6F', '#BB8FCE'
    ];
    
    // Use a simple hash of userId to assign consistent colors
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      const char = userId.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    return colors[Math.abs(hash) % colors.length];
  }

  private setupInterpolation(
    cursorKey: string, 
    fromPosition: LiveCursorPosition, 
    toPosition: LiveCursorPosition
  ): void {
    // Calculate distance to determine if interpolation is needed
    const distance = Math.sqrt(
      Math.pow(toPosition.x - fromPosition.x, 2) + 
      Math.pow(toPosition.y - fromPosition.y, 2)
    );

    // Skip interpolation for small movements or very large jumps
    if (distance < this.config.threshold || distance > this.MAX_INTERPOLATION_DISTANCE) {
      return;
    }

    // Setup interpolation state
    const interpolationState: InterpolationState = {
      startPosition: fromPosition,
      endPosition: toPosition,
      startTime: Date.now(),
      duration: this.config.duration,
      easing: this.config.easing,
    };

    this.interpolationStates.set(cursorKey, interpolationState);
  }

  private lerp(start: number, end: number, t: number): number {
    return start + (end - start) * t;
  }

  private applyEasing(t: number, easing: string): number {
    switch (easing) {
      case 'ease-in':
        return t * t;
      case 'ease-out':
        return 1 - (1 - t) * (1 - t);
      case 'ease-in-out':
        return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      case 'linear':
      default:
        return t;
    }
  }

  private getNextSequenceId(cursorKey: string): number {
    const current = this.sequenceCounters.get(cursorKey) || 0;
    const next = current + 1;
    this.sequenceCounters.set(cursorKey, next);
    return next;
  }

  private async queueCursorUpdate(
    cursorKey: string, 
    update: CursorUpdate, 
    sessionInfo?: Partial<CursorSessionInfo>
  ): Promise<void> {
    const queue = this.updateQueues.get(cursorKey) || {
      updates: [],
      processing: false,
      lastProcessedSequence: 0,
    };

    // Prevent queue overflow
    if (queue.updates.length >= this.MAX_QUEUE_SIZE) {
      // Remove oldest updates, keeping the most recent ones
      queue.updates.splice(0, queue.updates.length - this.MAX_QUEUE_SIZE + 1);
      this.logger.warn('Cursor update queue overflow, dropping old updates', { cursorKey });
    }

    // Store session info with the update
    (update as any).sessionInfo = sessionInfo;
    queue.updates.push(update);
    this.updateQueues.set(cursorKey, queue);
  }

  private async processCursorUpdateQueue(cursorKey: string): Promise<void> {
    const queue = this.updateQueues.get(cursorKey);
    if (!queue || queue.processing || queue.updates.length === 0) {
      return;
    }

    queue.processing = true;
    
    try {
      while (queue.updates.length > 0) {
        // Sort updates by sequence ID to ensure proper order
        queue.updates.sort((a, b) => a.sequenceId - b.sequenceId);
        
        // Process next update
        const update = queue.updates.shift();
        if (!update) break;

        // Skip if this update is out of order (already processed a later one)
        if (update.sequenceId <= queue.lastProcessedSequence) {
          continue;
        }

        await this.processAtomicCursorUpdate(cursorKey, update);
        queue.lastProcessedSequence = update.sequenceId;
        
        // Rate limit processing to avoid blocking
        if (queue.updates.length > 0) {
          await new Promise(resolve => setTimeout(resolve, 1));
        }
      }
    } catch (error) {
      this.logger.error('Error processing cursor update queue', { error, cursorKey });
    } finally {
      queue.processing = false;
      this.updateQueues.set(cursorKey, queue);
    }
  }

  private async processAtomicCursorUpdate(cursorKey: string, update: CursorUpdate): Promise<void> {
    const sessionInfo = (update as any).sessionInfo as Partial<CursorSessionInfo> | undefined;
    const now = update.timestamp;
    
    // Get existing cursor state
    const existingCursor = this.cursors.get(cursorKey);
    
    // Create or update cursor state atomically
    const cursorState: LiveCursorState = existingCursor ? {
      ...existingCursor,
      lastPosition: existingCursor.currentPosition,
      currentPosition: {
        ...update.position,
        timestamp: now,
        interpolated: false,
      },
      isActive: true,
      lastSeen: now,
    } : {
      userId: update.userId,
      userName: sessionInfo?.userName || 'Unknown User',
      userColor: sessionInfo?.userColor || this.generateUserColor(update.userId),
      currentPosition: {
        ...update.position,
        timestamp: now,
        interpolated: false,
      },
      lastPosition: undefined,
      isActive: true,
      lastSeen: now,
      sessionId: sessionInfo?.sessionId || `session_${update.userId}_${cursorKey.split(':')[0]}`,
    };

    // Store cursor state atomically
    this.cursors.set(cursorKey, cursorState);

    // Update session info if provided
    if (sessionInfo) {
      const whiteboardId = cursorKey.split(':')[0];
      const sessionKey = this.getSessionKey(sessionInfo.sessionId || cursorState.sessionId, whiteboardId);
      const sessionData: CursorSessionInfo = {
        userId: update.userId,
        userName: sessionInfo.userName || cursorState.userName,
        userColor: sessionInfo.userColor || cursorState.userColor,
        sessionId: sessionInfo.sessionId || cursorState.sessionId,
        whiteboardId,
        lastSeen: now,
        isActive: true,
      };
      this.cursorSessions.set(sessionKey, sessionData);
    }

    // Setup interpolation if needed
    if (this.config.enabled && existingCursor?.currentPosition) {
      this.setupInterpolation(cursorKey, existingCursor.currentPosition, update.position);
    }
  }

  private startCleanupInterval(): void {
    this.cleanupInterval = setInterval(async () => {
      try {
        await this.forceCleanup();
      } catch (error) {
        this.logger.error('Cleanup interval failed', { error });
      }
    }, 60000); // Run every minute
  }
}

// Singleton instance for the service
let cursorServiceInstance: WhiteboardCursorService | null = null;

/**
 * Get or create the singleton cursor service instance
 */
export function getCursorService(logger?: Logger): WhiteboardCursorService {
  if (!cursorServiceInstance) {
    cursorServiceInstance = new WhiteboardCursorService(logger);
    
    // Add process cleanup handlers to prevent memory leaks
    const cleanup = async () => {
      await shutdownCursorService();
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('exit', cleanup);
  }
  return cursorServiceInstance;
}

/**
 * Shutdown the cursor service singleton
 */
export async function shutdownCursorService(): Promise<void> {
  if (cursorServiceInstance) {
    try {
      await cursorServiceInstance.shutdown();
    } catch (error) {
      console.error('Error during cursor service shutdown:', error);
    } finally {
      cursorServiceInstance = null;
    }
  }
}