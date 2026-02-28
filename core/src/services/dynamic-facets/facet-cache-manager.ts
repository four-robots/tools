/**
 * Facet Cache Manager
 * 
 * Handles performance optimization through caching, precomputation,
 * and cache invalidation strategies for dynamic facet system.
 */

import {
  type FacetCollection,
  type FacetDefinition,
  type FacetValue,
  type SearchResult
} from '@shared/types';

export interface CacheManagerOptions {
  /** Enable caching */
  enabled?: boolean;
  /** Default TTL in seconds */
  defaultTtl?: number;
  /** Maximum cache size (number of entries) */
  maxCacheSize?: number;
  /** Enable cache statistics */
  enableStats?: boolean;
  /** Precomputation interval in milliseconds */
  precomputeInterval?: number;
  /** Test mode - disables background timers */
  testMode?: boolean;
}

export interface CacheEntry<T = any> {
  data: T;
  timestamp: number;
  ttl: number;
  hitCount: number;
  lastAccessed: number;
}

export interface CacheStatistics {
  totalEntries: number;
  totalHits: number;
  totalMisses: number;
  hitRate: number;
  averageHitCount: number;
  oldestEntry?: number;
  newestEntry?: number;
  totalMemoryUsage: number;
}

export class FacetCacheManager {
  private readonly options: Required<CacheManagerOptions>;
  private cache = new Map<string, CacheEntry>();
  private statistics = {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0
  };
  
  private precomputeQueue = new Set<string>();
  private isPrecomputing = false;
  private cleanupInterval?: NodeJS.Timeout;
  private precomputeInterval?: NodeJS.Timeout;

  constructor(options: CacheManagerOptions = {}) {
    this.options = {
      enabled: true,
      defaultTtl: 3600, // 1 hour
      maxCacheSize: 10000,
      enableStats: true,
      precomputeInterval: 300000, // 5 minutes
      testMode: process.env.NODE_ENV === 'test',
      ...options
    };

    // Only start background processes in non-test environments
    if (this.options.enabled && !this.options.testMode) {
      this.startPeriodicCleanup();
      this.startPrecomputation();
    }
  }

  /**
   * Get cached data
   */
  async get<T = any>(key: string): Promise<T | null> {
    if (!this.options.enabled) {
      return null;
    }

    const entry = this.cache.get(key);
    
    if (!entry) {
      this.recordMiss();
      return null;
    }

    // Check if expired
    const now = Date.now();
    if (now - entry.timestamp > entry.ttl * 1000) {
      this.cache.delete(key);
      this.recordMiss();
      return null;
    }

    // Update access statistics
    entry.hitCount++;
    entry.lastAccessed = now;
    this.recordHit();

    return entry.data as T;
  }

  /**
   * Set cached data
   */
  async set<T = any>(key: string, data: T, ttl?: number): Promise<void> {
    if (!this.options.enabled) {
      return;
    }

    // Check cache size limit
    if (this.cache.size >= this.options.maxCacheSize) {
      await this.evictLeastRecentlyUsed();
    }

    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl: ttl || this.options.defaultTtl,
      hitCount: 0,
      lastAccessed: Date.now()
    };

    this.cache.set(key, entry);
    this.statistics.sets++;
  }

  /**
   * Delete cached data
   */
  async delete(key: string): Promise<boolean> {
    if (!this.options.enabled) {
      return false;
    }

    const deleted = this.cache.delete(key);
    if (deleted) {
      this.statistics.deletes++;
    }
    return deleted;
  }

  /**
   * Clear all cached data
   */
  async clear(): Promise<void> {
    this.cache.clear();
    this.resetStatistics();
  }

  /**
   * Generate cache key for facet operations
   */
  generateCacheKey(operation: string, params: Record<string, any>): string {
    // Create a deterministic key from operation and parameters
    const sortedParams = Object.keys(params)
      .sort()
      .reduce((obj: Record<string, any>, key) => {
        obj[key] = params[key];
        return obj;
      }, {});

    const paramsString = JSON.stringify(sortedParams);
    const hash = this.simpleHash(paramsString);
    
    return `facet:${operation}:${hash}`;
  }

  /**
   * Cache facet collection
   */
  async cacheFacetCollection(
    query: string,
    results: SearchResult[],
    collection: FacetCollection,
    ttl?: number
  ): Promise<void> {
    const key = this.generateCacheKey('collection', {
      query,
      resultHash: this.hashResults(results)
    });

    await this.set(key, collection, ttl);
  }

  /**
   * Get cached facet collection
   */
  async getCachedFacetCollection(
    query: string,
    results: SearchResult[]
  ): Promise<FacetCollection | null> {
    const key = this.generateCacheKey('collection', {
      query,
      resultHash: this.hashResults(results)
    });

    return this.get<FacetCollection>(key);
  }

  /**
   * Cache facet values for a specific facet
   */
  async cacheFacetValues(
    facetId: string,
    values: FacetValue[],
    ttl?: number
  ): Promise<void> {
    const key = `facet_values:${facetId}`;
    await this.set(key, values, ttl);
  }

  /**
   * Get cached facet values
   */
  async getCachedFacetValues(facetId: string): Promise<FacetValue[] | null> {
    const key = `facet_values:${facetId}`;
    return this.get<FacetValue[]>(key);
  }

  /**
   * Precompute facet data for better performance
   */
  async precomputeFacetData(facetId: string): Promise<void> {
    if (!this.options.enabled) {
      return;
    }

    // Add to precompute queue
    this.precomputeQueue.add(facetId);
  }

  /**
   * Invalidate cache entries related to a facet
   */
  async invalidateFacetCache(facetId: string): Promise<void> {
    const keysToDelete: string[] = [];
    
    for (const key of this.cache.keys()) {
      if (key.includes(facetId)) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      await this.delete(key);
    }
  }

  /**
   * Invalidate cache based on pattern
   */
  async invalidatePattern(pattern: string): Promise<number> {
    const regex = new RegExp(pattern);
    const keysToDelete: string[] = [];
    
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      await this.delete(key);
    }

    return keysToDelete.length;
  }

  /**
   * Get cache statistics
   */
  getStatistics(): CacheStatistics {
    if (!this.options.enableStats) {
      return {
        totalEntries: 0,
        totalHits: 0,
        totalMisses: 0,
        hitRate: 0,
        averageHitCount: 0,
        totalMemoryUsage: 0
      };
    }

    const entries = Array.from(this.cache.values());
    const totalHits = this.statistics.hits;
    const totalMisses = this.statistics.misses;
    const totalRequests = totalHits + totalMisses;

    let oldestEntry: number | undefined;
    let newestEntry: number | undefined;
    let totalHitCount = 0;

    if (entries.length > 0) {
      oldestEntry = Math.min(...entries.map(e => e.timestamp));
      newestEntry = Math.max(...entries.map(e => e.timestamp));
      totalHitCount = entries.reduce((sum, entry) => sum + entry.hitCount, 0);
    }

    return {
      totalEntries: this.cache.size,
      totalHits,
      totalMisses,
      hitRate: totalRequests > 0 ? totalHits / totalRequests : 0,
      averageHitCount: entries.length > 0 ? totalHitCount / entries.length : 0,
      oldestEntry,
      newestEntry,
      totalMemoryUsage: this.estimateMemoryUsage()
    };
  }

  /**
   * Warm up cache with frequently used facets
   */
  async warmupCache(facetIds: string[]): Promise<void> {
    for (const facetId of facetIds) {
      await this.precomputeFacetData(facetId);
    }
  }

  /**
   * Export cache data for backup
   */
  async exportCache(): Promise<Record<string, any>> {
    const exported: Record<string, any> = {};
    
    for (const [key, entry] of this.cache.entries()) {
      exported[key] = {
        data: entry.data,
        timestamp: entry.timestamp,
        ttl: entry.ttl
      };
    }

    return exported;
  }

  /**
   * Import cache data from backup
   */
  async importCache(data: Record<string, any>): Promise<void> {
    this.cache.clear();
    
    for (const [key, entryData] of Object.entries(data)) {
      const entry: CacheEntry = {
        data: entryData.data,
        timestamp: entryData.timestamp,
        ttl: entryData.ttl,
        hitCount: 0,
        lastAccessed: Date.now()
      };
      
      this.cache.set(key, entry);
    }
  }

  // Private methods

  private recordHit(): void {
    if (this.options.enableStats) {
      this.statistics.hits++;
    }
  }

  private recordMiss(): void {
    if (this.options.enableStats) {
      this.statistics.misses++;
    }
  }

  private resetStatistics(): void {
    this.statistics = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0
    };
  }

  private async evictLeastRecentlyUsed(): Promise<void> {
    let lruKey: string | null = null;
    let lruTime = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessed < lruTime) {
        lruTime = entry.lastAccessed;
        lruKey = key;
      }
    }

    if (lruKey) {
      await this.delete(lruKey);
    }
  }

  private startPeriodicCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredEntries();
    }, 60000); // Run every minute
  }

  private cleanupExpiredEntries(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl * 1000) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      this.cache.delete(key);
    }
  }

  private startPrecomputation(): void {
    if (this.precomputeInterval) {
      clearInterval(this.precomputeInterval);
    }
    
    this.precomputeInterval = setInterval(() => {
      this.processPrecomputeQueue().catch(error => {
        console.error('Facet precomputation failed:', error instanceof Error ? error.message : error);
      });
    }, this.options.precomputeInterval);
  }

  private async processPrecomputeQueue(): Promise<void> {
    if (this.isPrecomputing || this.precomputeQueue.size === 0) {
      return;
    }

    this.isPrecomputing = true;
    
    try {
      const facetIds = Array.from(this.precomputeQueue);
      this.precomputeQueue.clear();

      for (const facetId of facetIds) {
        try {
          await this.performPrecomputation(facetId);
        } catch (error) {
          console.error(`Error precomputing facet ${facetId}:`, error);
        }
      }
    } finally {
      this.isPrecomputing = false;
    }
  }

  private async performPrecomputation(facetId: string): Promise<void> {
    // In a full implementation, this would:
    // 1. Query recent search patterns
    // 2. Generate facet data for common queries
    // 3. Cache the results with appropriate TTL
    console.log(`Precomputing data for facet ${facetId}`);
  }

  private hashResults(results: SearchResult[]): string {
    // Create a stable hash of result IDs
    const ids = results.map(r => r.id).sort().join(',');
    return this.simpleHash(ids);
  }

  private simpleHash(str: string): string {
    // Simple hash function for cache keys
    let hash = 0;
    if (str.length === 0) return hash.toString();
    
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    return Math.abs(hash).toString(36);
  }

  private estimateMemoryUsage(): number {
    // Rough estimation of memory usage in bytes
    let totalSize = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      // Estimate key size
      totalSize += key.length * 2; // Assuming UTF-16
      
      // Estimate data size (rough approximation)
      const dataStr = JSON.stringify(entry.data);
      totalSize += dataStr.length * 2;
      
      // Add overhead for entry metadata
      totalSize += 64; // Rough estimate for timestamps, counters, etc.
    }
    
    return totalSize;
  }

  /**
   * Cleanup method to properly destroy the cache manager
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
    if (this.precomputeInterval) {
      clearInterval(this.precomputeInterval);
      this.precomputeInterval = undefined;
    }
    this.cache.clear();
    this.precomputeQueue.clear();
    this.resetStatistics();
  }
}