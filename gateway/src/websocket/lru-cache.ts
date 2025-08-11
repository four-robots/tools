/**
 * LRU Cache Implementation with TTL support
 * 
 * Provides bounded memory usage with automatic eviction of least recently used items.
 * Includes time-to-live (TTL) support for automatic expiration.
 */

interface CacheEntry<T> {
  value: T;
  timestamp: number;
  ttl?: number;
  accessCount: number;
}

export class LRUCache<K, V> {
  private cache = new Map<K, CacheEntry<V>>();
  private accessOrder: K[] = [];
  private maxSize: number;
  private defaultTtl?: number;
  private cleanupInterval?: NodeJS.Timeout;
  
  constructor(
    maxSize: number = 1000,
    options: {
      defaultTtl?: number; // Default TTL in milliseconds
      cleanupIntervalMs?: number; // How often to run cleanup (default 5 minutes)
    } = {}
  ) {
    this.maxSize = maxSize;
    this.defaultTtl = options.defaultTtl;
    
    // Start cleanup interval if TTL is enabled
    if (options.defaultTtl || options.cleanupIntervalMs) {
      const intervalMs = options.cleanupIntervalMs || 5 * 60 * 1000; // 5 minutes
      this.cleanupInterval = setInterval(() => {
        this.cleanup();
      }, intervalMs);
    }
  }

  /**
   * Gets a value from the cache
   */
  get(key: K): V | undefined {
    const entry = this.cache.get(key);
    if (!entry) {
      return undefined;
    }

    // Check if expired
    if (this.isExpired(entry)) {
      this.cache.delete(key);
      this.removeFromAccessOrder(key);
      return undefined;
    }

    // Update access order and count
    this.updateAccessOrder(key);
    entry.accessCount++;
    entry.timestamp = Date.now(); // Update last access time
    
    return entry.value;
  }

  /**
   * Sets a value in the cache
   */
  set(key: K, value: V, ttl?: number): void {
    const now = Date.now();
    
    // Remove existing entry if it exists
    if (this.cache.has(key)) {
      this.removeFromAccessOrder(key);
    } else if (this.cache.size >= this.maxSize) {
      // Evict least recently used item
      this.evictLRU();
    }

    // Add new entry
    this.cache.set(key, {
      value,
      timestamp: now,
      ttl: ttl || this.defaultTtl,
      accessCount: 1,
    });

    this.accessOrder.push(key);
  }

  /**
   * Checks if a key exists in the cache (without updating access order)
   */
  has(key: K): boolean {
    const entry = this.cache.get(key);
    if (!entry) {
      return false;
    }

    if (this.isExpired(entry)) {
      this.cache.delete(key);
      this.removeFromAccessOrder(key);
      return false;
    }

    return true;
  }

  /**
   * Deletes a key from the cache
   */
  delete(key: K): boolean {
    const existed = this.cache.delete(key);
    if (existed) {
      this.removeFromAccessOrder(key);
    }
    return existed;
  }

  /**
   * Clears all entries from the cache
   */
  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
  }

  /**
   * Returns the current size of the cache
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Returns all keys in the cache (from most to least recently used)
   */
  keys(): K[] {
    return [...this.accessOrder].reverse();
  }

  /**
   * Returns all values in the cache
   */
  values(): V[] {
    return this.keys().map(key => this.cache.get(key)!.value);
  }

  /**
   * Returns cache statistics
   */
  getStats(): {
    size: number;
    maxSize: number;
    hitCount: number;
    accessCount: number;
    oldestEntryAge: number;
    averageAge: number;
  } {
    const now = Date.now();
    let totalAccessCount = 0;
    let totalAge = 0;
    let oldestAge = 0;
    
    for (const entry of this.cache.values()) {
      totalAccessCount += entry.accessCount;
      const age = now - entry.timestamp;
      totalAge += age;
      oldestAge = Math.max(oldestAge, age);
    }

    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hitCount: totalAccessCount,
      accessCount: totalAccessCount,
      oldestEntryAge: oldestAge,
      averageAge: this.cache.size > 0 ? totalAge / this.cache.size : 0,
    };
  }

  /**
   * Manually trigger cleanup of expired entries
   */
  cleanup(): number {
    const now = Date.now();
    let removedCount = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      if (this.isExpired(entry)) {
        this.cache.delete(key);
        this.removeFromAccessOrder(key);
        removedCount++;
      }
    }
    
    return removedCount;
  }

  /**
   * Resize the cache (may trigger evictions)
   */
  resize(newMaxSize: number): void {
    this.maxSize = newMaxSize;
    
    // Evict excess items if needed
    while (this.cache.size > this.maxSize) {
      this.evictLRU();
    }
  }

  /**
   * Destroy the cache and cleanup resources
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
    this.clear();
  }

  private isExpired(entry: CacheEntry<V>): boolean {
    if (!entry.ttl) {
      return false;
    }
    
    return Date.now() - entry.timestamp > entry.ttl;
  }

  private updateAccessOrder(key: K): void {
    this.removeFromAccessOrder(key);
    this.accessOrder.push(key);
  }

  private removeFromAccessOrder(key: K): void {
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
  }

  private evictLRU(): void {
    if (this.accessOrder.length === 0) {
      return;
    }

    const lruKey = this.accessOrder.shift()!;
    this.cache.delete(lruKey);
  }
}

/**
 * Factory function for creating commonly used cache configurations
 */
export function createLRUCache<K, V>(
  type: 'sessions' | 'versions' | 'colors' | 'custom',
  customConfig?: {
    maxSize?: number;
    defaultTtl?: number;
    cleanupIntervalMs?: number;
  }
): LRUCache<K, V> {
  switch (type) {
    case 'sessions':
      return new LRUCache<K, V>(10000, { // 10k max sessions
        defaultTtl: 30 * 60 * 1000, // 30 minutes
        cleanupIntervalMs: 5 * 60 * 1000, // 5 minutes
      });
      
    case 'versions':
      return new LRUCache<K, V>(1000, { // 1k max versions
        defaultTtl: 60 * 60 * 1000, // 1 hour
        cleanupIntervalMs: 10 * 60 * 1000, // 10 minutes
      });
      
    case 'colors':
      return new LRUCache<K, V>(5000, { // 5k max color assignments
        defaultTtl: 24 * 60 * 60 * 1000, // 24 hours
        cleanupIntervalMs: 60 * 60 * 1000, // 1 hour
      });
      
    case 'custom':
    default:
      return new LRUCache<K, V>(
        customConfig?.maxSize || 1000,
        {
          defaultTtl: customConfig?.defaultTtl,
          cleanupIntervalMs: customConfig?.cleanupIntervalMs,
        }
      );
  }
}