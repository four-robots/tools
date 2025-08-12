/**
 * Bounds Cache Utility
 * 
 * LRU cache for element bounds calculation to prevent O(n²) performance issues.
 * Provides cache invalidation strategies and efficient bounds calculation.
 */

export interface BoundsData {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CacheEntry {
  bounds: BoundsData;
  timestamp: number;
  accessCount: number;
}

export interface BoundsCacheConfig {
  maxSize: number;
  maxAge: number; // in milliseconds
  enableInvalidation: boolean;
  enableStats: boolean;
  preemptiveCleanup: boolean;
  maxCombinedCacheSize: number;
}

class BoundsCache {
  private cache = new Map<string, CacheEntry>();
  private accessOrder = new Set<string>();
  private config: BoundsCacheConfig;
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    invalidations: 0,
    combinedCacheHits: 0,
    totalCalculations: 0,
  };
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(config: Partial<BoundsCacheConfig> = {}) {
    this.config = {
      maxSize: config.maxSize ?? 2000, // Increased for 1000+ elements
      maxAge: config.maxAge ?? 30000, // 30 seconds default
      enableInvalidation: config.enableInvalidation ?? true,
      enableStats: config.enableStats ?? true,
      preemptiveCleanup: config.preemptiveCleanup ?? true,
      maxCombinedCacheSize: config.maxCombinedCacheSize ?? 500,
    };
    
    // Start preemptive cleanup if enabled
    if (this.config.preemptiveCleanup) {
      this.startCleanupInterval();
    }
  }

  /**
   * Get bounds from cache or calculate if not cached
   */
  get(
    elementId: string, 
    calculator: () => BoundsData | null,
    forceRefresh: boolean = false
  ): BoundsData | null {
    const now = Date.now();
    
    if (!forceRefresh && this.cache.has(elementId)) {
      const entry = this.cache.get(elementId)!;
      
      // Check if entry is still valid
      if (now - entry.timestamp <= this.config.maxAge) {
        // Update access order for LRU
        this.accessOrder.delete(elementId);
        this.accessOrder.add(elementId);
        entry.accessCount++;
        
        if (this.config.enableStats) {
          this.stats.hits++;
        }
        
        return entry.bounds;
      } else {
        // Entry expired, remove it
        this.invalidate(elementId);
      }
    }

    if (this.config.enableStats) {
      this.stats.misses++;
      this.stats.totalCalculations++;
    }

    // Calculate bounds
    const bounds = calculator();
    if (bounds) {
      this.set(elementId, bounds);
    }
    
    return bounds;
  }

  /**
   * Set bounds in cache
   */
  set(elementId: string, bounds: BoundsData): void {
    const now = Date.now();
    
    // Ensure cache size limit with batch eviction for better performance
    while (this.cache.size >= this.config.maxSize) {
      this.evictLRU();
      if (this.config.enableStats) {
        this.stats.evictions++;
      }
    }

    // Special handling for combined bounds to prevent cache explosion
    if (elementId.startsWith('combined:')) {
      const combinedCount = Array.from(this.cache.keys())
        .filter(key => key.startsWith('combined:')).length;
      
      if (combinedCount >= this.config.maxCombinedCacheSize) {
        this.evictOldestCombined();
      }
    }

    const entry: CacheEntry = {
      bounds: { ...bounds },
      timestamp: now,
      accessCount: 1,
    };

    this.cache.set(elementId, entry);
    
    // Update access order
    this.accessOrder.delete(elementId);
    this.accessOrder.add(elementId);
  }

  /**
   * Get combined bounds for multiple elements with caching
   */
  getCombined(
    elementIds: string[],
    getElementBounds: (id: string) => BoundsData | null,
    forceRefresh: boolean = false
  ): BoundsData | null {
    if (elementIds.length === 0) return null;

    // Try to get combined bounds from cache first
    const sortedIds = elementIds.slice().sort(); // Don't mutate input
    const combinedKey = `combined:${sortedIds.join(',')}`;
    const cachedCombined = this.get(combinedKey, () => null, forceRefresh);
    
    if (cachedCombined && !forceRefresh) {
      if (this.config.enableStats) {
        this.stats.combinedCacheHits++;
      }
      return cachedCombined;
    }

    // Calculate combined bounds
    const bounds: BoundsData[] = [];
    
    for (const elementId of elementIds) {
      const elementBounds = this.get(elementId, () => getElementBounds(elementId), forceRefresh);
      if (elementBounds) {
        bounds.push(elementBounds);
      }
    }

    if (bounds.length === 0) return null;

    const minX = Math.min(...bounds.map(b => b.x));
    const minY = Math.min(...bounds.map(b => b.y));
    const maxX = Math.max(...bounds.map(b => b.x + b.width));
    const maxY = Math.max(...bounds.map(b => b.y + b.height));

    const combinedBounds = {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    };

    // Cache the combined result
    this.set(combinedKey, combinedBounds);

    return combinedBounds;
  }

  /**
   * Invalidate specific element bounds
   */
  invalidate(elementId: string): void {
    if (this.cache.has(elementId)) {
      this.cache.delete(elementId);
      this.accessOrder.delete(elementId);
    }

    // Invalidate combined bounds that include this element
    if (this.config.enableInvalidation) {
      this.invalidateCombinedContaining(elementId);
    }

    if (this.config.enableStats) {
      this.stats.invalidations++;
    }
  }

  /**
   * Invalidate multiple element bounds
   */
  invalidateMultiple(elementIds: string[]): void {
    for (const elementId of elementIds) {
      this.invalidate(elementId);
    }
  }

  /**
   * Invalidate all combined bounds containing the element
   */
  private invalidateCombinedContaining(elementId: string): void {
    const keysToDelete: string[] = [];
    
    for (const key of this.cache.keys()) {
      if (key.startsWith('combined:') && key.includes(elementId)) {
        keysToDelete.push(key);
      }
    }
    
    for (const key of keysToDelete) {
      this.cache.delete(key);
      this.accessOrder.delete(key);
    }
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    if (this.accessOrder.size === 0) return;
    
    const lruKey = this.accessOrder.values().next().value;
    if (lruKey) {
      this.cache.delete(lruKey);
      this.accessOrder.delete(lruKey);
    }
  }

  /**
   * Clear all cached bounds
   */
  clear(): void {
    this.cache.clear();
    this.accessOrder.clear();
  }


  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    maxSize: number;
    hitRate: number;
    oldestEntry: number;
    stats: typeof this.stats;
    combinedCacheSize: number;
    memoryUsageEstimate: number;
  } {
    let totalAccess = 0;
    let oldestTimestamp = Date.now();
    let combinedCount = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      totalAccess += entry.accessCount;
      oldestTimestamp = Math.min(oldestTimestamp, entry.timestamp);
      
      if (key.startsWith('combined:')) {
        combinedCount++;
      }
    }
    
    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate = totalRequests > 0 ? this.stats.hits / totalRequests : 0;
    
    // Rough memory usage estimate (bounds object + metadata)
    const memoryUsageEstimate = this.cache.size * 150; // ~150 bytes per entry estimate
    
    return {
      size: this.cache.size,
      maxSize: this.config.maxSize,
      hitRate,
      oldestEntry: oldestTimestamp,
      stats: { ...this.stats },
      combinedCacheSize: combinedCount,
      memoryUsageEstimate,
    };
  }

  /**
   * Update cache configuration
   */
  updateConfig(newConfig: Partial<BoundsCacheConfig>): void {
    const oldConfig = this.config;
    this.config = { ...this.config, ...newConfig };
    
    // Adjust cache size if needed
    while (this.cache.size > this.config.maxSize) {
      this.evictLRU();
    }

    // Handle cleanup interval changes
    if (oldConfig.preemptiveCleanup !== this.config.preemptiveCleanup) {
      if (this.config.preemptiveCleanup) {
        this.startCleanupInterval();
      } else {
        this.stopCleanupInterval();
      }
    }
  }

  /**
   * Evict oldest combined bounds entries
   */
  private evictOldestCombined(): void {
    const combinedEntries: [string, CacheEntry][] = [];
    
    for (const [key, entry] of this.cache.entries()) {
      if (key.startsWith('combined:')) {
        combinedEntries.push([key, entry]);
      }
    }
    
    // Sort by timestamp and evict oldest
    combinedEntries.sort((a, b) => a[1].timestamp - b[1].timestamp);
    
    const toEvict = Math.ceil(combinedEntries.length * 0.1); // Evict 10%
    for (let i = 0; i < toEvict && i < combinedEntries.length; i++) {
      const [key] = combinedEntries[i];
      this.cache.delete(key);
      this.accessOrder.delete(key);
    }
  }

  /**
   * Start preemptive cleanup interval
   */
  private startCleanupInterval(): void {
    if (this.cleanupInterval) return;
    
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
      
      // Aggressive cleanup when cache is getting full
      if (this.cache.size > this.config.maxSize * 0.8) {
        const cleaned = this.cleanup();
        if (cleaned === 0) {
          // If cleanup didn't help, evict some LRU items
          this.evictLRU();
        }
      }
    }, 10000); // Every 10 seconds
  }

  /**
   * Stop preemptive cleanup interval
   */
  private stopCleanupInterval(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Enhanced cleanup with return count
   */
  cleanup(): number {
    const now = Date.now();
    const expiredKeys: string[] = [];
    
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.config.maxAge) {
        expiredKeys.push(key);
      }
    }
    
    for (const key of expiredKeys) {
      this.cache.delete(key);
      this.accessOrder.delete(key);
    }

    return expiredKeys.length;
  }

  /**
   * Destroy cache and cleanup resources
   */
  destroy(): void {
    this.stopCleanupInterval();
    this.clear();
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      invalidations: 0,
      combinedCacheHits: 0,
      totalCalculations: 0,
    };
  }
}

// Global bounds cache instance optimized for 1000+ elements
const boundsCache = new BoundsCache({
  maxSize: 2000, // Increased for better performance with many elements
  maxAge: 30000, // 30 seconds
  enableInvalidation: true,
  enableStats: true,
  preemptiveCleanup: true,
  maxCombinedCacheSize: 500,
});

// Cleanup on window unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    boundsCache.destroy();
  });
}

export default boundsCache;