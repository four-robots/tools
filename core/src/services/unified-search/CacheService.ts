/**
 * Simple Cache Service for Search Results
 * 
 * Provides in-memory caching for search results to improve performance
 * and reduce repeated query processing time.
 */

import crypto from 'crypto';
import type { UnifiedSearchRequest, UnifiedSearchResponse } from '../../shared/types/search.js';

/**
 * Cache entry with expiration
 */
interface CacheEntry<T> {
  /** Cached data */
  data: T;
  /** Cache timestamp */
  timestamp: number;
  /** Time-to-live in milliseconds */
  ttl: number;
  /** Number of cache hits */
  hits: number;
}

/**
 * Cache statistics
 */
export interface CacheStats {
  /** Total cache entries */
  totalEntries: number;
  /** Cache hit count */
  hits: number;
  /** Cache miss count */
  misses: number;
  /** Cache hit rate (0.0 to 1.0) */
  hitRate: number;
  /** Memory usage estimate in bytes */
  memoryUsageBytes: number;
}

/**
 * Cache configuration
 */
export interface CacheConfig {
  /** Maximum number of entries to store */
  maxEntries: number;
  /** Default TTL in milliseconds */
  defaultTtl: number;
  /** Cleanup interval in milliseconds */
  cleanupInterval: number;
  /** Enable cache statistics tracking */
  enableStats: boolean;
}

/**
 * Simple in-memory cache implementation
 */
export class CacheService {
  private cache = new Map<string, CacheEntry<any>>();
  private stats = {
    hits: 0,
    misses: 0
  };
  private cleanupTimer?: NodeJS.Timeout;

  constructor(private config: CacheConfig) {
    // Start cleanup timer
    if (config.cleanupInterval > 0) {
      this.cleanupTimer = setInterval(() => {
        this.cleanup();
      }, config.cleanupInterval);
    }
  }

  /**
   * Generate cache key for search request
   */
  private generateCacheKey(request: UnifiedSearchRequest, userId?: string): string {
    const keyData = {
      query: request.query,
      filters: request.filters || {},
      sort: request.sort,
      pagination: request.pagination,
      use_semantic: request.use_semantic,
      use_fuzzy: request.use_fuzzy,
      include_preview: request.include_preview,
      include_highlights: request.include_highlights,
      user_id: userId // Include user ID for user-specific caching
    };

    const keyString = JSON.stringify(keyData);
    return crypto.createHash('sha256').update(keyString).digest('hex');
  }

  /**
   * Get cached search results
   */
  async getCachedResults(
    request: UnifiedSearchRequest,
    userId?: string
  ): Promise<UnifiedSearchResponse | null> {
    const key = this.generateCacheKey(request, userId);
    const entry = this.cache.get(key);

    if (!entry) {
      if (this.config.enableStats) {
        this.stats.misses++;
      }
      return null;
    }

    // Check if entry has expired
    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      if (this.config.enableStats) {
        this.stats.misses++;
      }
      return null;
    }

    // Update hit count and stats
    entry.hits++;
    if (this.config.enableStats) {
      this.stats.hits++;
    }

    return entry.data;
  }

  /**
   * Cache search results
   */
  async cacheResults(
    request: UnifiedSearchRequest,
    response: UnifiedSearchResponse,
    userId?: string,
    customTtl?: number
  ): Promise<void> {
    const key = this.generateCacheKey(request, userId);
    const ttl = customTtl || this.config.defaultTtl;

    // Check cache size limit
    if (this.cache.size >= this.config.maxEntries) {
      // Remove oldest entries (simple LRU)
      this.evictOldest();
    }

    const entry: CacheEntry<UnifiedSearchResponse> = {
      data: response,
      timestamp: Date.now(),
      ttl,
      hits: 0
    };

    this.cache.set(key, entry);
  }

  /**
   * Cache arbitrary data with key
   */
  async cacheData<T>(
    key: string,
    data: T,
    ttl?: number
  ): Promise<void> {
    const customTtl = ttl || this.config.defaultTtl;

    // Check cache size limit
    if (this.cache.size >= this.config.maxEntries) {
      this.evictOldest();
    }

    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl: customTtl,
      hits: 0
    };

    this.cache.set(key, entry);
  }

  /**
   * Get cached data by key
   */
  async getCachedData<T>(key: string): Promise<T | null> {
    const entry = this.cache.get(key);

    if (!entry) {
      if (this.config.enableStats) {
        this.stats.misses++;
      }
      return null;
    }

    // Check expiration
    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      if (this.config.enableStats) {
        this.stats.misses++;
      }
      return null;
    }

    // Update stats
    entry.hits++;
    if (this.config.enableStats) {
      this.stats.hits++;
    }

    return entry.data;
  }

  /**
   * Invalidate cache entry
   */
  async invalidate(key: string): Promise<void> {
    this.cache.delete(key);
  }

  /**
   * Invalidate cache entries by pattern
   */
  async invalidatePattern(pattern: RegExp): Promise<number> {
    let count = 0;
    for (const key of this.cache.keys()) {
      if (pattern.test(key)) {
        this.cache.delete(key);
        count++;
      }
    }
    return count;
  }

  /**
   * Clear all cache entries
   */
  async clear(): Promise<void> {
    this.cache.clear();
    this.stats.hits = 0;
    this.stats.misses = 0;
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate = totalRequests > 0 ? this.stats.hits / totalRequests : 0;

    // Estimate memory usage (rough calculation)
    let memoryUsageBytes = 0;
    for (const [key, entry] of this.cache.entries()) {
      memoryUsageBytes += key.length * 2; // String overhead
      memoryUsageBytes += JSON.stringify(entry.data).length * 2; // Data size estimate
      memoryUsageBytes += 64; // Entry overhead estimate
    }

    return {
      totalEntries: this.cache.size,
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate,
      memoryUsageBytes
    };
  }

  /**
   * Cleanup expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      this.cache.delete(key);
    }
  }

  /**
   * Evict oldest entries when cache is full
   */
  private evictOldest(): void {
    // Remove 20% of oldest entries to make room
    const entriesToRemove = Math.max(1, Math.floor(this.config.maxEntries * 0.2));
    
    const entries = Array.from(this.cache.entries())
      .sort(([, a], [, b]) => a.timestamp - b.timestamp)
      .slice(0, entriesToRemove);

    for (const [key] of entries) {
      this.cache.delete(key);
    }
  }

  /**
   * Shutdown cache service
   */
  shutdown(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
    this.clear();
  }
}

/**
 * Create a default cache service instance
 */
export function createCacheService(overrides: Partial<CacheConfig> = {}): CacheService {
  const defaultConfig: CacheConfig = {
    maxEntries: 1000,
    defaultTtl: 5 * 60 * 1000, // 5 minutes
    cleanupInterval: 60 * 1000, // 1 minute
    enableStats: true
  };

  const config = { ...defaultConfig, ...overrides };
  return new CacheService(config);
}