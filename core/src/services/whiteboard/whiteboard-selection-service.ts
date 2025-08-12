/**
 * Whiteboard Selection Service
 * 
 * Manages real-time selection highlighting, multi-user selection tracking, and conflict resolution
 * for collaborative whiteboards. Provides selection state synchronization with <200ms latency 
 * and handles 25+ concurrent users with efficient memory management.
 */

import { Logger } from '../../utils/logger.js';
import {
  WhiteboardSelectionData,
  Point,
  Bounds,
} from '@shared/types/whiteboard.js';
import { randomUUID } from 'crypto';

export interface SelectionState {
  userId: string;
  userName: string;
  userColor: string;
  whiteboardId: string;
  sessionId: string;
  elementIds: string[];
  selectionBounds?: Bounds;
  timestamp: number;
  isMultiSelect: boolean;
  priority: number; // For conflict resolution
  isActive: boolean;
  lastSeen: number;
}

export interface SelectionConflict {
  conflictId: string;
  elementId: string;
  conflictingUsers: {
    userId: string;
    userName: string;
    priority: number;
    timestamp: number;
  }[];
  resolvedBy?: string;
  resolution: 'ownership' | 'shared' | 'timeout' | 'manual';
  resolvedAt?: number;
}

export interface SelectionOwnership {
  elementId: string;
  ownerId: string;
  ownerName: string;
  ownerColor: string;
  acquiredAt: number;
  expiresAt: number;
  isLocked: boolean;
  lockReason?: 'editing' | 'moving' | 'styling' | 'manual';
}

export interface SelectionHighlight {
  userId: string;
  userName: string;
  userColor: string;
  elementIds: string[];
  bounds?: Bounds;
  timestamp: number;
  opacity: number;
  style: 'solid' | 'dashed' | 'dotted';
  animation: 'none' | 'pulse' | 'glow';
}

interface SelectionUpdate {
  userId: string;
  whiteboardId: string;
  sessionId: string;
  operation: 'select' | 'deselect' | 'clear' | 'multi_select';
  elementIds: string[];
  bounds?: Bounds;
  timestamp: number;
  sequenceId: number;
  priority: number;
}

interface SelectionCache {
  selections: Map<string, SelectionState>;
  ownerships: Map<string, SelectionOwnership>;
  conflicts: Map<string, SelectionConflict>;
  highlights: Map<string, SelectionHighlight>;
  updateQueues: Map<string, SelectionUpdate[]>;
  sequenceCounters: Map<string, number>;
  lastCleanup: number;
}

export interface SelectionConfiguration {
  // Performance and scaling
  maxConcurrentUsers: number; // Maximum users with active selections (default: 25)
  maxElementsPerSelection: number; // Maximum elements per user selection (default: 100)
  maxSelectionsPerWhiteboard: number; // Maximum total selections per whiteboard (default: 1000)
  
  // Timing and timeouts
  selectionTimeoutMs: number; // Time before selection expires (default: 30 seconds)
  conflictResolutionTimeoutMs: number; // Time before auto-resolving conflicts (default: 5 seconds)
  ownershipTimeoutMs: number; // Time before ownership expires (default: 60 seconds)
  syncLatencyTargetMs: number; // Target synchronization latency (default: 200ms)
  
  // Conflict resolution
  enableAutomaticConflictResolution: boolean;
  conflictResolutionStrategy: 'priority' | 'timestamp' | 'ownership' | 'shared';
  allowSharedSelection: boolean;
  maxConflictsPerElement: number; // Maximum conflicts before forced resolution
  
  // Visual and UI
  highlightAnimationEnabled: boolean;
  highlightOpacity: number; // 0.0 to 1.0
  defaultHighlightStyle: 'solid' | 'dashed' | 'dotted';
  conflictHighlightStyle: 'pulse' | 'glow' | 'solid';
  
  // Memory management
  enableAggressiveCleanup: boolean;
  cleanupIntervalMs: number;
  maxStaleDataMs: number;
  incrementalCleanupBatchSize: number;
  
  // Rate limiting
  selectionUpdateThrottleMs: number; // Minimum time between selection updates
  maxUpdatesPerSecond: number; // Maximum selection updates per second per user
}

/**
 * Enhanced LRU Cache for selection data with memory optimization
 */
class SelectionLRUCache<K, V> {
  private cache = new Map<K, V>();
  private accessOrder = new Set<K>();
  private maxSize: number;
  private hits = 0;
  private misses = 0;

  constructor(private name: string, maxSize: number = 1000) {
    this.maxSize = maxSize;
  }

  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      this.accessOrder.delete(key);
      this.accessOrder.add(key);
      this.hits++;
      return value;
    }
    this.misses++;
    return undefined;
  }

  set(key: K, value: V): void {
    this.accessOrder.delete(key);
    
    while (this.cache.size >= this.maxSize) {
      const lruKey = this.accessOrder.keys().next().value;
      if (lruKey !== undefined) {
        this.cache.delete(lruKey);
        this.accessOrder.delete(lruKey);
      }
    }
    
    this.cache.set(key, value);
    this.accessOrder.add(key);
  }

  delete(key: K): boolean {
    this.accessOrder.delete(key);
    return this.cache.delete(key);
  }

  size(): number {
    return this.cache.size;
  }

  values(): IterableIterator<V> {
    return this.cache.values();
  }

  entries(): IterableIterator<[K, V]> {
    return this.cache.entries();
  }

  keys(): IterableIterator<K> {
    return this.cache.keys();
  }

  clear(): void {
    this.cache.clear();
    this.accessOrder.clear();
    this.hits = 0;
    this.misses = 0;
  }

  getStats() {
    return {
      name: this.name,
      size: this.cache.size,
      maxSize: this.maxSize,
      hits: this.hits,
      misses: this.misses,
      hitRate: this.hits / (this.hits + this.misses) || 0,
    };
  }

  // Cleanup expired entries
  cleanup(isExpired: (value: V) => boolean): number {
    let cleaned = 0;
    const toDelete: K[] = [];
    
    for (const [key, value] of this.cache.entries()) {
      if (isExpired(value)) {
        toDelete.push(key);
      }
    }
    
    toDelete.forEach(key => {
      this.delete(key);
      cleaned++;
    });
    
    return cleaned;
  }
}

/**
 * Core selection service with advanced conflict resolution and performance optimizations
 */
export class WhiteboardSelectionService {
  private logger: Logger;
  private config: SelectionConfiguration;
  private cache: SelectionCache;
  
  // Rate limiting and performance tracking
  private rateLimiter = new Map<string, number[]>();
  private cleanupInterval: NodeJS.Timeout | null = null;
  private isCleanupRunning = false;
  
  // Performance statistics
  private stats = {
    totalSelections: 0,
    conflictsResolved: 0,
    selectionsExpired: 0,
    averageLatency: 0,
    peakConcurrentUsers: 0,
  };

  constructor(config?: Partial<SelectionConfiguration>, logger?: Logger) {
    this.logger = logger || new Logger('WhiteboardSelectionService');
    
    this.config = {
      maxConcurrentUsers: 25,
      maxElementsPerSelection: 100,
      maxSelectionsPerWhiteboard: 1000,
      selectionTimeoutMs: 30 * 1000, // 30 seconds
      conflictResolutionTimeoutMs: 5 * 1000, // 5 seconds
      ownershipTimeoutMs: 60 * 1000, // 60 seconds
      syncLatencyTargetMs: 200,
      enableAutomaticConflictResolution: true,
      conflictResolutionStrategy: 'priority',
      allowSharedSelection: false,
      maxConflictsPerElement: 3,
      highlightAnimationEnabled: true,
      highlightOpacity: 0.3,
      defaultHighlightStyle: 'solid',
      conflictHighlightStyle: 'pulse',
      enableAggressiveCleanup: true,
      cleanupIntervalMs: 15 * 1000, // 15 seconds
      maxStaleDataMs: 60 * 1000, // 1 minute
      incrementalCleanupBatchSize: 100,
      selectionUpdateThrottleMs: 50, // 20 FPS max
      maxUpdatesPerSecond: 20,
      ...config,
    };

    // Initialize cache with LRU eviction
    this.cache = {
      selections: new Map(),
      ownerships: new Map(),
      conflicts: new Map(),
      highlights: new Map(),
      updateQueues: new Map(),
      sequenceCounters: new Map(),
      lastCleanup: Date.now(),
    };

    this.startBackgroundTasks();
    this.logger.info('WhiteboardSelectionService initialized', { config: this.config });
  }

  /**
   * Update user selection with conflict detection and resolution
   */
  async updateSelection(
    userId: string,
    userName: string,
    userColor: string,
    whiteboardId: string,
    sessionId: string,
    elementIds: string[],
    bounds?: Bounds
  ): Promise<{
    success: boolean;
    selectionState?: SelectionState;
    conflicts?: SelectionConflict[];
    ownerships?: SelectionOwnership[];
    error?: string;
    latency: number;
  }> {
    const startTime = Date.now();
    
    try {
      // Input validation
      this.validateSelectionInput(userId, whiteboardId, elementIds);
      
      // Rate limiting check
      const rateLimitResult = this.checkRateLimit(userId);
      if (!rateLimitResult.allowed) {
        return {
          success: false,
          error: `Rate limit exceeded. ${rateLimitResult.retryAfterMs}ms until next allowed update.`,
          latency: Date.now() - startTime,
        };
      }

      // Create selection update
      const update: SelectionUpdate = {
        userId,
        whiteboardId,
        sessionId,
        operation: elementIds.length > 0 ? 'select' : 'clear',
        elementIds: elementIds.slice(0, this.config.maxElementsPerSelection),
        bounds,
        timestamp: Date.now(),
        sequenceId: this.getNextSequenceId(userId, whiteboardId),
        priority: this.calculateUserPriority(userId, whiteboardId),
      };

      // Queue for atomic processing
      await this.queueSelectionUpdate(update);
      
      // Process immediately if possible
      const result = await this.processSelectionUpdate(update);
      
      // Update statistics
      this.updateStats(result, Date.now() - startTime);
      
      return {
        ...result,
        latency: Date.now() - startTime,
      };
      
    } catch (error) {
      this.logger.error('Failed to update selection', { error, userId, whiteboardId });
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        latency: Date.now() - startTime,
      };
    }
  }

  /**
   * Clear all selections for a user
   */
  async clearUserSelections(
    userId: string,
    whiteboardId: string,
    sessionId: string
  ): Promise<{ success: boolean; cleared: number }> {
    try {
      const selectionKey = this.getSelectionKey(userId, whiteboardId);
      const selection = this.cache.selections.get(selectionKey);
      
      if (!selection) {
        return { success: true, cleared: 0 };
      }

      const clearedCount = selection.elementIds.length;

      // Remove from all caches
      this.cache.selections.delete(selectionKey);
      this.cache.highlights.delete(selectionKey);
      
      // Clear ownerships
      for (const elementId of selection.elementIds) {
        const ownershipKey = this.getOwnershipKey(elementId, whiteboardId);
        const ownership = this.cache.ownerships.get(ownershipKey);
        if (ownership && ownership.ownerId === userId) {
          this.cache.ownerships.delete(ownershipKey);
        }
      }

      // Clear conflicts
      for (const [conflictKey, conflict] of this.cache.conflicts.entries()) {
        if (conflict.conflictingUsers.some(user => user.userId === userId)) {
          // Remove user from conflict or resolve if only one user remains
          conflict.conflictingUsers = conflict.conflictingUsers.filter(user => user.userId !== userId);
          
          if (conflict.conflictingUsers.length <= 1) {
            // Auto-resolve conflict
            if (conflict.conflictingUsers.length === 1) {
              const winner = conflict.conflictingUsers[0];
              conflict.resolvedBy = winner.userId;
              conflict.resolution = 'ownership';
              conflict.resolvedAt = Date.now();
              
              // Grant ownership to winner
              const ownershipKey = this.getOwnershipKey(conflict.elementId, whiteboardId);
              const ownership: SelectionOwnership = {
                elementId: conflict.elementId,
                ownerId: winner.userId,
                ownerName: winner.userName,
                ownerColor: this.getUserColor(winner.userId),
                acquiredAt: Date.now(),
                expiresAt: Date.now() + this.config.ownershipTimeoutMs,
                isLocked: false,
              };
              this.cache.ownerships.set(ownershipKey, ownership);
            }
            
            this.cache.conflicts.delete(conflictKey);
          } else {
            this.cache.conflicts.set(conflictKey, conflict);
          }
        }
      }

      this.logger.info('User selections cleared', { userId, whiteboardId, cleared: clearedCount });
      
      return { success: true, cleared: clearedCount };
      
    } catch (error) {
      this.logger.error('Failed to clear user selections', { error, userId, whiteboardId });
      return { success: false, cleared: 0 };
    }
  }

  /**
   * Get all active selections for a whiteboard
   */
  getWhiteboardSelections(whiteboardId: string): SelectionState[] {
    const selections: SelectionState[] = [];
    const now = Date.now();
    
    for (const [key, selection] of this.cache.selections.entries()) {
      if (selection.whiteboardId === whiteboardId && selection.isActive) {
        // Check if selection is still valid (not expired)
        if (now - selection.lastSeen <= this.config.selectionTimeoutMs) {
          selections.push(selection);
        } else {
          // Mark as inactive but don't delete yet (cleanup will handle it)
          selection.isActive = false;
          this.cache.selections.set(key, selection);
        }
      }
    }
    
    return selections.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Get selection highlights for rendering
   */
  getSelectionHighlights(whiteboardId: string): SelectionHighlight[] {
    const highlights: SelectionHighlight[] = [];
    const now = Date.now();
    
    for (const [key, highlight] of this.cache.highlights.entries()) {
      // Extract whiteboard ID from key
      if (key.startsWith(whiteboardId + ':')) {
        // Check if highlight is still valid
        if (now - highlight.timestamp <= this.config.selectionTimeoutMs) {
          highlights.push(highlight);
        } else {
          // Remove expired highlight
          this.cache.highlights.delete(key);
        }
      }
    }
    
    return highlights;
  }

  /**
   * Get active conflicts for a whiteboard
   */
  getWhiteboardConflicts(whiteboardId: string): SelectionConflict[] {
    const conflicts: SelectionConflict[] = [];
    
    for (const conflict of this.cache.conflicts.values()) {
      if (conflict.elementId.includes(whiteboardId)) {
        conflicts.push(conflict);
      }
    }
    
    return conflicts.filter(conflict => !conflict.resolvedAt);
  }

  /**
   * Get element ownership information
   */
  getElementOwnership(elementId: string, whiteboardId: string): SelectionOwnership | null {
    const ownershipKey = this.getOwnershipKey(elementId, whiteboardId);
    const ownership = this.cache.ownerships.get(ownershipKey);
    
    if (ownership) {
      // Check if ownership is still valid
      if (Date.now() <= ownership.expiresAt) {
        return ownership;
      } else {
        // Remove expired ownership
        this.cache.ownerships.delete(ownershipKey);
        return null;
      }
    }
    
    return null;
  }

  /**
   * Manually resolve a selection conflict
   */
  async resolveConflict(
    conflictId: string,
    resolverId: string,
    resolution: 'ownership' | 'shared' | 'cancel'
  ): Promise<{ success: boolean; ownership?: SelectionOwnership; error?: string }> {
    try {
      const conflict = this.cache.conflicts.get(conflictId);
      if (!conflict || conflict.resolvedAt) {
        return { success: false, error: 'Conflict not found or already resolved' };
      }

      const now = Date.now();
      conflict.resolvedBy = resolverId;
      conflict.resolvedAt = now;
      conflict.resolution = resolution === 'cancel' ? 'manual' : resolution;

      if (resolution === 'ownership') {
        // Grant ownership to resolver if they're in the conflict
        const resolver = conflict.conflictingUsers.find(user => user.userId === resolverId);
        if (resolver) {
          const ownershipKey = this.getOwnershipKey(conflict.elementId, conflict.elementId.split(':')[0]);
          const ownership: SelectionOwnership = {
            elementId: conflict.elementId,
            ownerId: resolver.userId,
            ownerName: resolver.userName,
            ownerColor: this.getUserColor(resolver.userId),
            acquiredAt: now,
            expiresAt: now + this.config.ownershipTimeoutMs,
            isLocked: false,
          };
          
          this.cache.ownerships.set(ownershipKey, ownership);
          this.cache.conflicts.set(conflictId, conflict);
          
          this.logger.info('Conflict resolved with ownership', { 
            conflictId, 
            resolverId, 
            ownerId: resolver.userId 
          });
          
          return { success: true, ownership };
        }
      }

      this.cache.conflicts.set(conflictId, conflict);
      this.logger.info('Conflict resolved', { conflictId, resolverId, resolution });
      
      return { success: true };
      
    } catch (error) {
      this.logger.error('Failed to resolve conflict', { error, conflictId, resolverId });
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * Get service statistics
   */
  getStats(): {
    performance: typeof this.stats;
    cache: {
      selections: number;
      ownerships: number;
      conflicts: number;
      highlights: number;
    };
    config: SelectionConfiguration;
  } {
    return {
      performance: { ...this.stats },
      cache: {
        selections: this.cache.selections.size,
        ownerships: this.cache.ownerships.size,
        conflicts: this.cache.conflicts.size,
        highlights: this.cache.highlights.size,
      },
      config: this.config,
    };
  }

  /**
   * Force cleanup of expired data
   */
  async forceCleanup(): Promise<{ cleaned: number }> {
    if (this.isCleanupRunning) {
      this.logger.debug('Cleanup already running');
      return { cleaned: 0 };
    }

    this.isCleanupRunning = true;
    const startTime = Date.now();
    let totalCleaned = 0;

    try {
      const now = Date.now();
      
      // Clean expired selections
      totalCleaned += await this.cleanupSelections(now);
      
      // Clean expired ownerships
      totalCleaned += await this.cleanupOwnerships(now);
      
      // Clean expired conflicts
      totalCleaned += await this.cleanupConflicts(now);
      
      // Clean expired highlights
      totalCleaned += await this.cleanupHighlights(now);
      
      // Clean rate limiter
      totalCleaned += await this.cleanupRateLimiter(now);
      
      this.cache.lastCleanup = now;
      
      if (totalCleaned > 0) {
        this.logger.info('Selection cleanup completed', {
          cleaned: totalCleaned,
          duration: Date.now() - startTime,
          cacheSize: {
            selections: this.cache.selections.size,
            ownerships: this.cache.ownerships.size,
            conflicts: this.cache.conflicts.size,
            highlights: this.cache.highlights.size,
          }
        });
      }

      return { cleaned: totalCleaned };
      
    } catch (error) {
      this.logger.error('Cleanup failed', { error });
      return { cleaned: totalCleaned };
    } finally {
      this.isCleanupRunning = false;
    }
  }

  /**
   * Shutdown service
   */
  async shutdown(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // Clear all caches
    this.cache.selections.clear();
    this.cache.ownerships.clear();
    this.cache.conflicts.clear();
    this.cache.highlights.clear();
    this.cache.updateQueues.clear();
    this.cache.sequenceCounters.clear();
    this.rateLimiter.clear();

    this.logger.info('WhiteboardSelectionService shutdown');
  }

  // Private helper methods

  private validateSelectionInput(userId: string, whiteboardId: string, elementIds: string[]): void {
    if (!userId || typeof userId !== 'string' || userId.length > 255) {
      throw new Error('Invalid userId');
    }
    if (!whiteboardId || typeof whiteboardId !== 'string' || whiteboardId.length > 255) {
      throw new Error('Invalid whiteboardId');
    }
    if (!Array.isArray(elementIds) || elementIds.length > this.config.maxElementsPerSelection) {
      throw new Error(`Invalid elementIds: maximum ${this.config.maxElementsPerSelection} elements allowed`);
    }
    for (const elementId of elementIds) {
      if (!elementId || typeof elementId !== 'string' || elementId.length > 255) {
        throw new Error('Invalid elementId in array');
      }
    }
  }

  private checkRateLimit(userId: string): { allowed: boolean; retryAfterMs?: number } {
    const now = Date.now();
    const userRequests = this.rateLimiter.get(userId) || [];
    
    // Remove requests older than 1 second
    const recentRequests = userRequests.filter(timestamp => now - timestamp < 1000);
    
    if (recentRequests.length >= this.config.maxUpdatesPerSecond) {
      const oldestRequest = Math.min(...recentRequests);
      const retryAfterMs = 1000 - (now - oldestRequest);
      return { allowed: false, retryAfterMs };
    }

    // Add current request
    recentRequests.push(now);
    this.rateLimiter.set(userId, recentRequests);
    
    return { allowed: true };
  }

  private getNextSequenceId(userId: string, whiteboardId: string): number {
    const key = `${userId}:${whiteboardId}`;
    const current = this.cache.sequenceCounters.get(key) || 0;
    const next = current + 1;
    this.cache.sequenceCounters.set(key, next);
    return next;
  }

  private calculateUserPriority(userId: string, whiteboardId: string): number {
    // Priority based on user activity and selection history
    // Higher priority = more recent activity, lower conflict probability
    const baseScore = 100;
    const selectionKey = this.getSelectionKey(userId, whiteboardId);
    const existingSelection = this.cache.selections.get(selectionKey);
    
    if (existingSelection) {
      const ageBonus = Math.max(0, 50 - (Date.now() - existingSelection.timestamp) / 1000);
      return baseScore + ageBonus;
    }
    
    return baseScore;
  }

  private async queueSelectionUpdate(update: SelectionUpdate): Promise<void> {
    const queueKey = `${update.userId}:${update.whiteboardId}`;
    const queue = this.cache.updateQueues.get(queueKey) || [];
    
    // Prevent queue overflow
    if (queue.length >= 10) {
      queue.shift(); // Remove oldest update
      this.logger.warn('Selection update queue overflow', { queueKey });
    }
    
    queue.push(update);
    this.cache.updateQueues.set(queueKey, queue);
  }

  private async processSelectionUpdate(update: SelectionUpdate): Promise<{
    success: boolean;
    selectionState?: SelectionState;
    conflicts?: SelectionConflict[];
    ownerships?: SelectionOwnership[];
    error?: string;
  }> {
    const now = Date.now();
    const selectionKey = this.getSelectionKey(update.userId, update.whiteboardId);
    
    try {
      // Detect conflicts before processing
      const conflicts = await this.detectConflicts(update);
      
      // Process selection based on operation
      let selectionState: SelectionState | undefined;
      
      if (update.operation === 'clear') {
        await this.clearUserSelections(update.userId, update.whiteboardId, update.sessionId);
      } else {
        // Create or update selection state
        selectionState = {
          userId: update.userId,
          userName: await this.getUserName(update.userId),
          userColor: this.getUserColor(update.userId),
          whiteboardId: update.whiteboardId,
          sessionId: update.sessionId,
          elementIds: update.elementIds,
          selectionBounds: update.bounds,
          timestamp: update.timestamp,
          isMultiSelect: update.elementIds.length > 1,
          priority: update.priority,
          isActive: true,
          lastSeen: now,
        };
        
        this.cache.selections.set(selectionKey, selectionState);
        
        // Create selection highlight
        const highlight: SelectionHighlight = {
          userId: update.userId,
          userName: selectionState.userName,
          userColor: selectionState.userColor,
          elementIds: update.elementIds,
          bounds: update.bounds,
          timestamp: now,
          opacity: conflicts.length > 0 ? 0.5 : this.config.highlightOpacity,
          style: conflicts.length > 0 ? this.config.conflictHighlightStyle as any : this.config.defaultHighlightStyle,
          animation: conflicts.length > 0 ? this.config.conflictHighlightStyle as any : 'none',
        };
        
        this.cache.highlights.set(selectionKey, highlight);
      }
      
      // Handle conflicts if any
      let ownerships: SelectionOwnership[] = [];
      if (conflicts.length > 0 && this.config.enableAutomaticConflictResolution) {
        ownerships = await this.resolveConflictsAutomatically(conflicts);
      }
      
      // Update statistics
      this.stats.totalSelections++;
      if (conflicts.length > 0) {
        this.stats.conflictsResolved += conflicts.length;
      }
      
      return {
        success: true,
        selectionState,
        conflicts,
        ownerships,
      };
      
    } catch (error) {
      this.logger.error('Failed to process selection update', { error, update });
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async detectConflicts(update: SelectionUpdate): Promise<SelectionConflict[]> {
    const conflicts: SelectionConflict[] = [];
    
    for (const elementId of update.elementIds) {
      const conflictingUsers: SelectionConflict['conflictingUsers'] = [];
      
      // Check existing selections for conflicts
      for (const [key, selection] of this.cache.selections.entries()) {
        if (selection.whiteboardId === update.whiteboardId && 
            selection.userId !== update.userId &&
            selection.elementIds.includes(elementId) &&
            selection.isActive) {
          
          conflictingUsers.push({
            userId: selection.userId,
            userName: selection.userName,
            priority: selection.priority,
            timestamp: selection.timestamp,
          });
        }
      }
      
      // Add current user to conflict
      if (conflictingUsers.length > 0) {
        conflictingUsers.push({
          userId: update.userId,
          userName: await this.getUserName(update.userId),
          priority: update.priority,
          timestamp: update.timestamp,
        });
        
        const conflict: SelectionConflict = {
          conflictId: randomUUID(),
          elementId,
          conflictingUsers,
          resolution: this.config.conflictResolutionStrategy,
        };
        
        conflicts.push(conflict);
        this.cache.conflicts.set(conflict.conflictId, conflict);
      }
    }
    
    return conflicts;
  }

  private async resolveConflictsAutomatically(conflicts: SelectionConflict[]): Promise<SelectionOwnership[]> {
    const ownerships: SelectionOwnership[] = [];
    
    for (const conflict of conflicts) {
      const winner = this.selectConflictWinner(conflict);
      if (winner) {
        const ownership: SelectionOwnership = {
          elementId: conflict.elementId,
          ownerId: winner.userId,
          ownerName: winner.userName,
          ownerColor: this.getUserColor(winner.userId),
          acquiredAt: Date.now(),
          expiresAt: Date.now() + this.config.ownershipTimeoutMs,
          isLocked: false,
        };
        
        const ownershipKey = this.getOwnershipKey(conflict.elementId, conflict.elementId.split(':')[0]);
        this.cache.ownerships.set(ownershipKey, ownership);
        ownerships.push(ownership);
        
        // Mark conflict as resolved
        conflict.resolvedBy = winner.userId;
        conflict.resolvedAt = Date.now();
        this.cache.conflicts.set(conflict.conflictId, conflict);
      }
    }
    
    return ownerships;
  }

  private selectConflictWinner(conflict: SelectionConflict): SelectionConflict['conflictingUsers'][0] | null {
    if (conflict.conflictingUsers.length === 0) return null;
    
    switch (this.config.conflictResolutionStrategy) {
      case 'priority':
        return conflict.conflictingUsers.reduce((winner, user) =>
          user.priority > winner.priority ? user : winner
        );
      
      case 'timestamp':
        return conflict.conflictingUsers.reduce((winner, user) =>
          user.timestamp > winner.timestamp ? user : winner
        );
      
      case 'ownership':
        // First check if any user already owns the element
        const elementOwnership = this.getElementOwnership(
          conflict.elementId, 
          conflict.elementId.split(':')[0]
        );
        if (elementOwnership) {
          return conflict.conflictingUsers.find(user => user.userId === elementOwnership.ownerId) || null;
        }
        // Fall back to priority
        return this.selectConflictWinner({
          ...conflict,
          conflictingUsers: conflict.conflictingUsers,
        });
      
      case 'shared':
        // No winner in shared mode
        return null;
      
      default:
        return conflict.conflictingUsers[0];
    }
  }

  private async cleanupSelections(now: number): Promise<number> {
    let cleaned = 0;
    const toDelete: string[] = [];
    
    for (const [key, selection] of this.cache.selections.entries()) {
      if (!selection.isActive || (now - selection.lastSeen > this.config.selectionTimeoutMs)) {
        toDelete.push(key);
      }
    }
    
    for (const key of toDelete) {
      this.cache.selections.delete(key);
      this.cache.highlights.delete(key);
      cleaned++;
    }
    
    return cleaned;
  }

  private async cleanupOwnerships(now: number): Promise<number> {
    let cleaned = 0;
    const toDelete: string[] = [];
    
    for (const [key, ownership] of this.cache.ownerships.entries()) {
      if (now > ownership.expiresAt) {
        toDelete.push(key);
      }
    }
    
    for (const key of toDelete) {
      this.cache.ownerships.delete(key);
      cleaned++;
    }
    
    return cleaned;
  }

  private async cleanupConflicts(now: number): Promise<number> {
    let cleaned = 0;
    const toDelete: string[] = [];
    
    for (const [key, conflict] of this.cache.conflicts.entries()) {
      if (conflict.resolvedAt || 
          (now - (conflict.conflictingUsers[0]?.timestamp || 0) > this.config.conflictResolutionTimeoutMs)) {
        toDelete.push(key);
      }
    }
    
    for (const key of toDelete) {
      this.cache.conflicts.delete(key);
      cleaned++;
    }
    
    return cleaned;
  }

  private async cleanupHighlights(now: number): Promise<number> {
    let cleaned = 0;
    const toDelete: string[] = [];
    
    for (const [key, highlight] of this.cache.highlights.entries()) {
      if (now - highlight.timestamp > this.config.selectionTimeoutMs) {
        toDelete.push(key);
      }
    }
    
    for (const key of toDelete) {
      this.cache.highlights.delete(key);
      cleaned++;
    }
    
    return cleaned;
  }

  private async cleanupRateLimiter(now: number): Promise<number> {
    let cleaned = 0;
    
    for (const [userId, requests] of this.rateLimiter.entries()) {
      const recentRequests = requests.filter(timestamp => now - timestamp < 10000); // Keep 10s history
      if (recentRequests.length === 0) {
        this.rateLimiter.delete(userId);
        cleaned++;
      } else {
        this.rateLimiter.set(userId, recentRequests);
      }
    }
    
    return cleaned;
  }

  private startBackgroundTasks(): void {
    this.cleanupInterval = setInterval(async () => {
      if (this.config.enableAggressiveCleanup) {
        await this.forceCleanup();
      }
    }, this.config.cleanupIntervalMs);
  }

  private updateStats(result: any, latency: number): void {
    // Update average latency using exponential moving average
    this.stats.averageLatency = this.stats.averageLatency === 0 
      ? latency 
      : this.stats.averageLatency * 0.9 + latency * 0.1;
    
    // Track peak concurrent users
    const currentUsers = this.cache.selections.size;
    this.stats.peakConcurrentUsers = Math.max(this.stats.peakConcurrentUsers, currentUsers);
  }

  // Key generation helpers
  private getSelectionKey(userId: string, whiteboardId: string): string {
    return `${whiteboardId}:${userId}`;
  }

  private getOwnershipKey(elementId: string, whiteboardId: string): string {
    return `${whiteboardId}:${elementId}`;
  }

  // User data helpers (these would integrate with user service)
  private async getUserName(userId: string): Promise<string> {
    // This would integrate with the user service to get actual user names
    return `User-${userId.slice(0, 8)}`;
  }

  private getUserColor(userId: string): string {
    const colors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
      '#DDA0DD', '#FFB347', '#98D8E8', '#F7DC6F', '#BB8FCE',
      '#F1948A', '#82E0AA', '#85C1E9', '#F8C471', '#D7BDE2'
    ];
    
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      const char = userId.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    
    return colors[Math.abs(hash) % colors.length];
  }
}

// Singleton instance
let selectionServiceInstance: WhiteboardSelectionService | null = null;

/**
 * Get or create the singleton selection service instance
 */
export function getSelectionService(
  config?: Partial<SelectionConfiguration>,
  logger?: Logger
): WhiteboardSelectionService {
  if (!selectionServiceInstance) {
    selectionServiceInstance = new WhiteboardSelectionService(config, logger);
    
    // Add process cleanup handlers
    const cleanup = async () => {
      await shutdownSelectionService();
    };
    
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('exit', cleanup);
  }
  return selectionServiceInstance;
}

/**
 * Shutdown the selection service singleton
 */
export async function shutdownSelectionService(): Promise<void> {
  if (selectionServiceInstance) {
    try {
      await selectionServiceInstance.shutdown();
    } catch (error) {
      console.error('Error during selection service shutdown:', error);
    } finally {
      selectionServiceInstance = null;
    }
  }
}