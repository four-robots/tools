import { LRUCache } from 'lru-cache';
import { DatabasePool } from '../../utils/database-pool';
import { Logger } from '../../utils/logger';
import { 
  AdvancedSearchQuery, 
  PaginatedSearchResults,
  SearchResultWithHighlights,
  SearchSuggestion,
} from '@shared/types/whiteboard';

/**
 * Performance metrics for search operations
 */
export interface SearchMetrics {
  executionTime: number;
  cacheHit: boolean;
  queryComplexity: number;
  resultCount: number;
  dbQueryTime?: number;
  processingTime?: number;
}

/**
 * Cache configuration for search results
 */
export interface SearchCacheConfig {
  maxSize: number;
  ttl: number; // Time to live in milliseconds
  staleWhileRevalidate: number;
}

/**
 * Benchmark configuration for load testing
 */
export interface BenchmarkConfig {
  concurrentUsers: number;
  requestsPerUser: number;
  rampUpTime: number; // Seconds to ramp up to full load
  testDuration: number; // Total test duration in seconds
}

/**
 * Benchmark results
 */
export interface BenchmarkResults {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  minResponseTime: number;
  maxResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  requestsPerSecond: number;
  errorRate: number;
  cacheHitRate: number;
  memoryUsage: NodeJS.MemoryUsage;
}

/**
 * Search performance optimization service
 */
export class WhiteboardSearchPerformance {
  private searchCache: LRUCache<string, { data: any; timestamp: number; metrics: SearchMetrics }>;
  private suggestionCache: LRUCache<string, { suggestions: SearchSuggestion[]; timestamp: number }>;
  private metricsHistory: SearchMetrics[] = [];
  private readonly maxMetricsHistory = 1000;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private isDisposed = false;

  constructor(
    private db: DatabasePool,
    private logger: Logger,
    private cacheConfig: SearchCacheConfig = {
      maxSize: 1000,
      ttl: 5 * 60 * 1000, // 5 minutes
      staleWhileRevalidate: 2 * 60 * 1000, // 2 minutes
    }
  ) {
    this.initializeCaches();
    this.startCleanupTimer();
  }

  /**
   * Initialize LRU caches for search optimization
   */
  private initializeCaches(): void {
    this.searchCache = new LRUCache({
      max: this.cacheConfig.maxSize,
      ttl: this.cacheConfig.ttl,
      allowStale: true,
      updateAgeOnGet: true,
      updateAgeOnHas: true,
    });

    this.suggestionCache = new LRUCache({
      max: 500, // Smaller cache for suggestions
      ttl: 10 * 60 * 1000, // 10 minutes
      allowStale: true,
      updateAgeOnGet: true,
    });
  }

  /**
   * Start automatic cleanup timer
   */
  private startCleanupTimer(): void {
    // Run cleanup every 15 minutes
    this.cleanupInterval = setInterval(() => {
      if (!this.isDisposed) {
        this.cleanupOldMetrics();
        
        // Also force garbage collection of caches
        this.searchCache.purgeStale();
        this.suggestionCache.purgeStale();
      }
    }, 15 * 60 * 1000);
  }

  /**
   * Stop cleanup timer and dispose resources
   */
  dispose(): void {
    if (this.isDisposed) return;

    this.isDisposed = true;

    // Clear cleanup timer
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // Clear all caches and metrics
    this.searchCache.clear();
    this.suggestionCache.clear();
    this.metricsHistory = [];

    this.logger.info('WhiteboardSearchPerformance disposed');
  }

  /**
   * Generate cache key for search requests
   */
  private generateCacheKey(
    workspaceId: string,
    userId: string,
    query: AdvancedSearchQuery,
    sortConfig?: any,
    limit?: number,
    offset?: number
  ): string {
    const keyData = {
      workspaceId,
      userId,
      query: this.normalizeQuery(query),
      sort: sortConfig,
      limit,
      offset,
    };
    return Buffer.from(JSON.stringify(keyData)).toString('base64');
  }

  /**
   * Normalize query for consistent caching
   */
  private normalizeQuery(query: AdvancedSearchQuery): AdvancedSearchQuery {
    return {
      ...query,
      query: query.query.trim().toLowerCase(),
      searchFields: query.searchFields ? [...query.searchFields].sort() : undefined,
      elementTypes: query.elementTypes ? [...query.elementTypes].sort() : undefined,
      includeTags: query.includeTags ? [...query.includeTags].sort() : undefined,
      excludeTags: query.excludeTags ? [...query.excludeTags].sort() : undefined,
    };
  }

  /**
   * Calculate query complexity score for performance monitoring
   */
  private calculateQueryComplexity(query: AdvancedSearchQuery): number {
    let complexity = 1;
    
    // Base complexity from query length and syntax
    complexity += Math.min(query.query.length / 10, 5);
    if (query.syntaxType === 'regex') complexity += 3;
    if (query.syntaxType === 'boolean') complexity += 2;
    if (query.fuzzyMatch) complexity += 1;

    // Field-based complexity
    if (query.searchFields) complexity += query.searchFields.length * 0.5;
    if (query.elementTypes) complexity += query.elementTypes.length * 0.3;

    // Filter complexity
    if (query.dateRange) complexity += 1;
    if (query.createdBy?.length) complexity += query.createdBy.length * 0.2;
    if (query.modifiedBy?.length) complexity += query.modifiedBy.length * 0.2;
    if (query.includeTags?.length) complexity += query.includeTags.length * 0.1;
    if (query.excludeTags?.length) complexity += query.excludeTags.length * 0.1;

    // Advanced features
    if (query.includeHighlights) complexity += 0.5;
    if (query.includePreviews) complexity += 0.3;

    return Math.round(complexity * 10) / 10;
  }

  /**
   * Cached search execution with performance metrics
   */
  async executeSearchWithCache(
    searchFunction: () => Promise<PaginatedSearchResults>,
    cacheKey: string,
    queryComplexity: number
  ): Promise<{ results: PaginatedSearchResults; metrics: SearchMetrics }> {
    const startTime = performance.now();
    
    // Check cache first
    const cached = this.searchCache.get(cacheKey);
    if (cached && !this.isCacheStale(cached.timestamp)) {
      const executionTime = performance.now() - startTime;
      const metrics: SearchMetrics = {
        executionTime,
        cacheHit: true,
        queryComplexity,
        resultCount: cached.data.total,
      };
      
      this.recordMetrics(metrics);
      return { results: cached.data, metrics };
    }

    // Execute search
    const dbStartTime = performance.now();
    const results = await searchFunction();
    const dbQueryTime = performance.now() - dbStartTime;
    
    const processingTime = performance.now() - dbStartTime - dbQueryTime;
    const executionTime = performance.now() - startTime;

    const metrics: SearchMetrics = {
      executionTime,
      cacheHit: false,
      queryComplexity,
      resultCount: results.total,
      dbQueryTime,
      processingTime,
    };

    // Cache results
    this.searchCache.set(cacheKey, {
      data: results,
      timestamp: Date.now(),
      metrics,
    });

    this.recordMetrics(metrics);
    return { results, metrics };
  }

  /**
   * Check if cache entry is stale
   */
  private isCacheStale(timestamp: number): boolean {
    return Date.now() - timestamp > this.cacheConfig.staleWhileRevalidate;
  }

  /**
   * Record performance metrics with proper memory management
   */
  private recordMetrics(metrics: SearchMetrics): void {
    this.metricsHistory.push(metrics);
    
    // Maintain history size with efficient rotation
    if (this.metricsHistory.length > this.maxMetricsHistory) {
      // Remove multiple items at once to avoid constant shifting
      const itemsToRemove = Math.max(1, this.metricsHistory.length - this.maxMetricsHistory);
      this.metricsHistory.splice(0, itemsToRemove);
    }

    // Log slow queries
    if (metrics.executionTime > 1000) {
      this.logger.warn('Slow search query detected', {
        executionTime: metrics.executionTime,
        queryComplexity: metrics.queryComplexity,
        resultCount: metrics.resultCount,
        cacheHit: metrics.cacheHit,
      });
    }

    // Periodic cleanup of old metrics (every 100 records)
    if (this.metricsHistory.length % 100 === 0) {
      this.cleanupOldMetrics();
    }
  }

  /**
   * Clean up old metrics and optimize memory usage
   */
  private cleanupOldMetrics(): void {
    // Keep only the most recent 80% of metrics to prevent memory growth
    const targetSize = Math.floor(this.maxMetricsHistory * 0.8);
    if (this.metricsHistory.length > targetSize) {
      this.metricsHistory = this.metricsHistory.slice(-targetSize);
    }

    // Log cleanup activity
    this.logger.debug('Metrics history cleaned up', {
      currentSize: this.metricsHistory.length,
      maxSize: this.maxMetricsHistory,
    });
  }

  /**
   * Clear metrics history to free memory
   */
  clearMetricsHistory(): void {
    this.metricsHistory = [];
    this.logger.info('Metrics history cleared');
  }

  /**
   * Get performance statistics
   */
  getPerformanceStats(): {
    totalRequests: number;
    averageResponseTime: number;
    cacheHitRate: number;
    slowQueries: number;
    complexityDistribution: { low: number; medium: number; high: number };
  } {
    if (this.metricsHistory.length === 0) {
      return {
        totalRequests: 0,
        averageResponseTime: 0,
        cacheHitRate: 0,
        slowQueries: 0,
        complexityDistribution: { low: 0, medium: 0, high: 0 },
      };
    }

    const totalRequests = this.metricsHistory.length;
    const averageResponseTime = this.metricsHistory.reduce((sum, m) => sum + m.executionTime, 0) / totalRequests;
    const cacheHits = this.metricsHistory.filter(m => m.cacheHit).length;
    const cacheHitRate = cacheHits / totalRequests;
    const slowQueries = this.metricsHistory.filter(m => m.executionTime > 1000).length;

    const complexityDistribution = this.metricsHistory.reduce(
      (dist, m) => {
        if (m.queryComplexity <= 3) dist.low++;
        else if (m.queryComplexity <= 7) dist.medium++;
        else dist.high++;
        return dist;
      },
      { low: 0, medium: 0, high: 0 }
    );

    return {
      totalRequests,
      averageResponseTime: Math.round(averageResponseTime * 100) / 100,
      cacheHitRate: Math.round(cacheHitRate * 100) / 100,
      slowQueries,
      complexityDistribution,
    };
  }

  /**
   * Execute search benchmark
   */
  async runSearchBenchmark(
    searchFunction: () => Promise<PaginatedSearchResults>,
    config: BenchmarkConfig
  ): Promise<BenchmarkResults> {
    this.logger.info('Starting search benchmark', config);
    
    const startTime = Date.now();
    const results: number[] = [];
    const errors: Error[] = [];
    let cacheHits = 0;
    
    // Calculate request intervals
    const totalRequests = config.concurrentUsers * config.requestsPerUser;
    const rampUpInterval = (config.rampUpTime * 1000) / config.concurrentUsers;
    
    // Track memory usage
    const initialMemory = process.memoryUsage();
    
    const promises: Promise<void>[] = [];
    
    for (let user = 0; user < config.concurrentUsers; user++) {
      const userPromise = this.runUserBenchmark(
        searchFunction,
        config.requestsPerUser,
        user * rampUpInterval,
        results,
        errors
      );
      promises.push(userPromise);
    }
    
    // Wait for all users to complete or timeout
    await Promise.allSettled(promises);
    
    const endTime = Date.now();
    const totalTime = (endTime - startTime) / 1000; // Convert to seconds
    const finalMemory = process.memoryUsage();
    
    // Calculate statistics
    const successfulRequests = results.length;
    const failedRequests = errors.length;
    const sortedResults = results.sort((a, b) => a - b);
    
    const benchmarkResults: BenchmarkResults = {
      totalRequests,
      successfulRequests,
      failedRequests,
      averageResponseTime: results.reduce((sum, time) => sum + time, 0) / successfulRequests,
      minResponseTime: sortedResults[0] || 0,
      maxResponseTime: sortedResults[sortedResults.length - 1] || 0,
      p95ResponseTime: sortedResults[Math.floor(sortedResults.length * 0.95)] || 0,
      p99ResponseTime: sortedResults[Math.floor(sortedResults.length * 0.99)] || 0,
      requestsPerSecond: successfulRequests / totalTime,
      errorRate: failedRequests / totalRequests,
      cacheHitRate: this.metricsHistory.filter(m => m.cacheHit).length / this.metricsHistory.length,
      memoryUsage: {
        rss: finalMemory.rss - initialMemory.rss,
        heapTotal: finalMemory.heapTotal - initialMemory.heapTotal,
        heapUsed: finalMemory.heapUsed - initialMemory.heapUsed,
        external: finalMemory.external - initialMemory.external,
        arrayBuffers: finalMemory.arrayBuffers - initialMemory.arrayBuffers,
      },
    };
    
    this.logger.info('Benchmark completed', benchmarkResults);
    return benchmarkResults;
  }

  /**
   * Run benchmark for a single user
   */
  private async runUserBenchmark(
    searchFunction: () => Promise<PaginatedSearchResults>,
    requestCount: number,
    startDelay: number,
    results: number[],
    errors: Error[]
  ): Promise<void> {
    // Wait for ramp-up delay
    await new Promise(resolve => setTimeout(resolve, startDelay));
    
    const userPromises: Promise<void>[] = [];
    
    for (let i = 0; i < requestCount; i++) {
      const requestPromise = this.executeTimedRequest(searchFunction, results, errors);
      userPromises.push(requestPromise);
      
      // Add small delay between requests to avoid overwhelming the system
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    
    await Promise.allSettled(userPromises);
  }

  /**
   * Execute a single timed request
   */
  private async executeTimedRequest(
    searchFunction: () => Promise<PaginatedSearchResults>,
    results: number[],
    errors: Error[]
  ): Promise<void> {
    const startTime = performance.now();
    
    try {
      await searchFunction();
      const endTime = performance.now();
      results.push(endTime - startTime);
    } catch (error) {
      errors.push(error instanceof Error ? error : new Error('Unknown error'));
    }
  }

  /**
   * Clear all caches
   */
  clearCaches(): void {
    this.searchCache.clear();
    this.suggestionCache.clear();
    this.logger.info('Search caches cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    searchCache: { size: number; maxSize: number; hitRate: number };
    suggestionCache: { size: number; maxSize: number };
  } {
    return {
      searchCache: {
        size: this.searchCache.size,
        maxSize: this.searchCache.max,
        hitRate: this.searchCache.calculatedSize > 0 ? 
          this.metricsHistory.filter(m => m.cacheHit).length / this.metricsHistory.length : 0,
      },
      suggestionCache: {
        size: this.suggestionCache.size,
        maxSize: this.suggestionCache.max,
      },
    };
  }

  /**
   * Optimize database queries by analyzing slow queries
   */
  async optimizeQueries(): Promise<{
    recommendedIndexes: string[];
    queryOptimizations: string[];
    performanceImprovements: string[];
  }> {
    const slowQueries = this.metricsHistory.filter(m => m.executionTime > 500);
    const highComplexityQueries = this.metricsHistory.filter(m => m.queryComplexity > 7);
    
    const recommendations = {
      recommendedIndexes: [] as string[],
      queryOptimizations: [] as string[],
      performanceImprovements: [] as string[],
    };

    // Analyze patterns in slow queries
    if (slowQueries.length > this.metricsHistory.length * 0.1) {
      recommendations.recommendedIndexes.push(
        'CREATE INDEX CONCURRENTLY idx_whiteboards_search_compound ON whiteboards (workspace_id, visibility, created_at) WHERE status = \'active\';'
      );
      recommendations.queryOptimizations.push(
        'Consider adding compound indexes for frequently filtered fields'
      );
    }

    if (highComplexityQueries.length > 50) {
      recommendations.performanceImprovements.push(
        'Consider implementing query result pagination for complex searches'
      );
      recommendations.performanceImprovements.push(
        'Implement search result pre-computation for common queries'
      );
    }

    // Cache hit rate analysis
    const cacheHitRate = this.metricsHistory.filter(m => m.cacheHit).length / this.metricsHistory.length;
    if (cacheHitRate < 0.3) {
      recommendations.performanceImprovements.push(
        'Increase cache TTL or size to improve cache hit rate'
      );
    }

    return recommendations;
  }
}