import LRU from 'lru-cache';
import type { Kysely } from 'kysely';
import { SavedSearchService } from './saved-search-service.js';
import type { 
  SavedSearch, 
  SaveSearchRequest, 
  UpdateSearchRequest, 
  SearchListOptions,
  PaginatedResponse,
  UserSearchStats,
  SearchAnalytics,
  DateRange 
} from '../../shared/types/saved-search.js';

/**
 * Cache configuration options
 */
interface CacheOptions {
  maxSize?: number;
  ttl?: number; // Time to live in milliseconds
  staleWhileRevalidate?: number; // Additional time to serve stale data while revalidating
}

/**
 * Enhanced Saved Search Service with LRU Caching
 * 
 * Extends the base SavedSearchService with intelligent caching for improved performance:
 * - Caches frequently accessed searches
 * - Caches collection trees
 * - Caches user statistics
 * - Invalidates cache on updates
 * - Supports stale-while-revalidate pattern for better UX
 */
export class CachedSavedSearchService extends SavedSearchService {
  private searchCache: LRU<string, SavedSearch>;
  private collectionsCache: LRU<string, any>;
  private statsCache: LRU<string, UserSearchStats>;
  private listCache: LRU<string, PaginatedResponse<SavedSearch>>;
  private analyticsCache: LRU<string, SearchAnalytics>;

  constructor(
    db: Kysely<any>, 
    cacheOptions: CacheOptions = {}
  ) {
    super(db);

    const {
      maxSize = 1000,
      ttl = 1000 * 60 * 15, // 15 minutes default
      staleWhileRevalidate = 1000 * 60 * 5, // 5 minutes stale time
    } = cacheOptions;

    // Initialize caches with different TTLs based on data volatility
    this.searchCache = new LRU({
      max: maxSize,
      ttl,
      allowStale: true,
      updateAgeOnGet: true,
    });

    this.collectionsCache = new LRU({
      max: 100, // Collections are less numerous
      ttl: ttl * 2, // Collections change less frequently
      allowStale: true,
      updateAgeOnGet: true,
    });

    this.statsCache = new LRU({
      max: 1000,
      ttl: ttl / 2, // Stats should be more current
      allowStale: true,
      updateAgeOnGet: true,
    });

    this.listCache = new LRU({
      max: 500, // List queries with pagination
      ttl: ttl / 3, // Lists should be fairly current
      allowStale: true,
      updateAgeOnGet: true,
    });

    this.analyticsCache = new LRU({
      max: 200,
      ttl: ttl * 4, // Analytics can be cached longer
      allowStale: true,
      updateAgeOnGet: true,
    });
  }

  /**
   * Get search by ID with caching
   */
  async getSearchById(searchId: string, userId: string): Promise<SavedSearch> {
    const cacheKey = `search:${searchId}:${userId}`;
    
    // Check cache first
    const cached = this.searchCache.get(cacheKey);
    if (cached && this.searchCache.getRemainingTTL(cacheKey) > 0) {
      return cached;
    }

    // Fetch from database
    const search = await super.getSearchById(searchId, userId);
    
    // Cache the result
    this.searchCache.set(cacheKey, search);
    
    return search;
  }

  /**
   * Get user searches with intelligent caching
   */
  async getUserSearches(
    userId: string, 
    options: SearchListOptions = {}
  ): Promise<PaginatedResponse<SavedSearch>> {
    // Create cache key from search options
    const cacheKey = `searches:${userId}:${JSON.stringify(options)}`;
    
    // Check cache first
    const cached = this.listCache.get(cacheKey);
    if (cached && this.listCache.getRemainingTTL(cacheKey) > 0) {
      return cached;
    }

    // Fetch from database
    const result = await super.getUserSearches(userId, options);
    
    // Cache the result
    this.listCache.set(cacheKey, result);
    
    // Also cache individual searches for future single lookups
    result.items.forEach(search => {
      const searchCacheKey = `search:${search.id}:${userId}`;
      this.searchCache.set(searchCacheKey, search);
    });
    
    return result;
  }

  /**
   * Get collections with caching
   */
  async getCollections(userId: string) {
    const cacheKey = `collections:${userId}`;
    
    const cached = this.collectionsCache.get(cacheKey);
    if (cached && this.collectionsCache.getRemainingTTL(cacheKey) > 0) {
      return cached;
    }

    const collections = await super.getCollections(userId);
    this.collectionsCache.set(cacheKey, collections);
    
    return collections;
  }

  /**
   * Get user statistics with caching
   */
  async getUserSearchStats(userId: string): Promise<UserSearchStats> {
    const cacheKey = `stats:${userId}`;
    
    const cached = this.statsCache.get(cacheKey);
    if (cached && this.statsCache.getRemainingTTL(cacheKey) > 0) {
      return cached;
    }

    const stats = await super.getUserSearchStats(userId);
    this.statsCache.set(cacheKey, stats);
    
    return stats;
  }

  /**
   * Get search analytics with caching
   */
  async getSearchAnalytics(
    searchId: string, 
    userId: string, 
    timeRange?: DateRange
  ): Promise<SearchAnalytics> {
    const cacheKey = `analytics:${searchId}:${userId}:${JSON.stringify(timeRange)}`;
    
    const cached = this.analyticsCache.get(cacheKey);
    if (cached && this.analyticsCache.getRemainingTTL(cacheKey) > 0) {
      return cached;
    }

    const analytics = await super.getSearchAnalytics(searchId, userId, timeRange);
    this.analyticsCache.set(cacheKey, analytics);
    
    return analytics;
  }

  /**
   * Save search with cache invalidation
   */
  async saveSearch(request: SaveSearchRequest, userId: string): Promise<SavedSearch> {
    const search = await super.saveSearch(request, userId);
    
    // Invalidate relevant caches
    this.invalidateUserCaches(userId);
    
    return search;
  }

  /**
   * Update search with cache invalidation
   */
  async updateSearch(
    searchId: string, 
    updates: UpdateSearchRequest, 
    userId: string
  ): Promise<SavedSearch> {
    const updatedSearch = await super.updateSearch(searchId, updates, userId);
    
    // Invalidate specific search cache
    const searchCacheKey = `search:${searchId}:${userId}`;
    this.searchCache.delete(searchCacheKey);
    
    // Invalidate user caches
    this.invalidateUserCaches(userId);
    
    // Cache the updated search
    this.searchCache.set(searchCacheKey, updatedSearch);
    
    return updatedSearch;
  }

  /**
   * Delete search with cache invalidation
   */
  async deleteSearch(searchId: string, userId: string): Promise<void> {
    await super.deleteSearch(searchId, userId);
    
    // Invalidate specific search cache
    const searchCacheKey = `search:${searchId}:${userId}`;
    this.searchCache.delete(searchCacheKey);
    
    // Invalidate user caches
    this.invalidateUserCaches(userId);
  }

  /**
   * Execute search with optimized caching
   */
  async executeSearch(searchId: string, userId: string): Promise<any> {
    const result = await super.executeSearch(searchId, userId);
    
    // Invalidate search cache as execution count changed
    const searchCacheKey = `search:${searchId}:${userId}`;
    this.searchCache.delete(searchCacheKey);
    
    // Invalidate stats cache
    const statsCacheKey = `stats:${userId}`;
    this.statsCache.delete(statsCacheKey);
    
    return result;
  }

  /**
   * Create collection with cache invalidation
   */
  async createCollection(request: any, userId: string) {
    const collection = await super.createCollection(request, userId);
    
    // Invalidate collections cache
    const collectionsCacheKey = `collections:${userId}`;
    this.collectionsCache.delete(collectionsCacheKey);
    
    return collection;
  }

  /**
   * Add to collection with cache invalidation
   */
  async addToCollection(searchId: string, collectionId: string, userId: string): Promise<void> {
    await super.addToCollection(searchId, collectionId, userId);
    
    // Invalidate collections and search list caches
    this.invalidateCollectionCaches(userId);
  }

  /**
   * Remove from collection with cache invalidation
   */
  async removeFromCollection(searchId: string, collectionId: string, userId: string): Promise<void> {
    await super.removeFromCollection(searchId, collectionId, userId);
    
    // Invalidate collections and search list caches
    this.invalidateCollectionCaches(userId);
  }

  /**
   * Track search usage with selective cache invalidation
   */
  async trackSearchUsage(
    searchId: string, 
    action: any, 
    metadata: Record<string, any> = {},
    transaction?: any
  ): Promise<void> {
    await super.trackSearchUsage(searchId, action, metadata, transaction);
    
    // Only invalidate analytics cache for tracking
    const userId = metadata.userId;
    if (userId) {
      // Invalidate analytics caches that might include this search
      for (const key of this.analyticsCache.keys()) {
        if (key.includes(searchId) || key.includes(userId)) {
          this.analyticsCache.delete(key);
        }
      }
    }
  }

  /**
   * Get cache statistics for monitoring
   */
  getCacheStats() {
    return {
      searches: {
        size: this.searchCache.size,
        max: this.searchCache.max,
        calculatedSize: this.searchCache.calculatedSize,
      },
      collections: {
        size: this.collectionsCache.size,
        max: this.collectionsCache.max,
        calculatedSize: this.collectionsCache.calculatedSize,
      },
      stats: {
        size: this.statsCache.size,
        max: this.statsCache.max,
        calculatedSize: this.statsCache.calculatedSize,
      },
      lists: {
        size: this.listCache.size,
        max: this.listCache.max,
        calculatedSize: this.listCache.calculatedSize,
      },
      analytics: {
        size: this.analyticsCache.size,
        max: this.analyticsCache.max,
        calculatedSize: this.analyticsCache.calculatedSize,
      },
    };
  }

  /**
   * Clear all caches (useful for testing or admin operations)
   */
  clearAllCaches(): void {
    this.searchCache.clear();
    this.collectionsCache.clear();
    this.statsCache.clear();
    this.listCache.clear();
    this.analyticsCache.clear();
  }

  /**
   * Preload frequently accessed searches for a user
   */
  async preloadUserSearches(userId: string, searchIds: string[]): Promise<void> {
    const promises = searchIds.map(async (searchId) => {
      try {
        const search = await this.getSearchById(searchId, userId);
        // Search is automatically cached by getSearchById
        return search;
      } catch (error) {
        // Log but don't fail the preload operation
        console.warn(`Failed to preload search ${searchId}:`, error);
      }
    });

    await Promise.allSettled(promises);
  }

  // Private helper methods

  private invalidateUserCaches(userId: string): void {
    // Invalidate user-specific caches
    const statsCacheKey = `stats:${userId}`;
    this.statsCache.delete(statsCacheKey);
    
    const collectionsCacheKey = `collections:${userId}`;
    this.collectionsCache.delete(collectionsCacheKey);
    
    // Invalidate all list caches for this user
    for (const key of this.listCache.keys()) {
      if (key.includes(userId)) {
        this.listCache.delete(key);
      }
    }
  }

  private invalidateCollectionCaches(userId: string): void {
    const collectionsCacheKey = `collections:${userId}`;
    this.collectionsCache.delete(collectionsCacheKey);
    
    // Invalidate search list caches as collection membership changed
    for (const key of this.listCache.keys()) {
      if (key.includes(userId)) {
        this.listCache.delete(key);
      }
    }
  }
}