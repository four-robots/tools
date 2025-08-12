import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import { WhiteboardSearchPerformance, BenchmarkConfig } from './whiteboard-search-performance';
import { DatabasePool } from '../../utils/database-pool';
import { Logger } from '../../utils/logger';
import { AdvancedSearchQuery, PaginatedSearchResults } from '@shared/types/whiteboard';

// Mock dependencies
vi.mock('../../utils/database-pool');
vi.mock('../../utils/logger');
vi.mock('lru-cache');

describe('WhiteboardSearchPerformance', () => {
  let performanceService: WhiteboardSearchPerformance;
  let mockDb: DatabasePool;
  let mockLogger: Logger;

  beforeEach(() => {
    mockDb = {
      query: vi.fn(),
      getClient: vi.fn(),
    } as unknown as DatabasePool;

    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    } as unknown as Logger;

    performanceService = new WhiteboardSearchPerformance(mockDb, mockLogger);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Cache Management', () => {
    it('should initialize caches with default configuration', () => {
      expect(performanceService).toBeDefined();
      
      const cacheStats = performanceService.getCacheStats();
      expect(cacheStats.searchCache.maxSize).toBe(1000);
      expect(cacheStats.suggestionCache.maxSize).toBe(500);
    });

    it('should clear all caches', () => {
      performanceService.clearCaches();
      
      expect(mockLogger.info).toHaveBeenCalledWith('Search caches cleared');
    });

    it('should provide cache statistics', () => {
      const stats = performanceService.getCacheStats();
      
      expect(stats).toMatchObject({
        searchCache: {
          size: expect.any(Number),
          maxSize: expect.any(Number),
          hitRate: expect.any(Number),
        },
        suggestionCache: {
          size: expect.any(Number),
          maxSize: expect.any(Number),
        },
      });
    });
  });

  describe('Performance Metrics', () => {
    it('should record search metrics', async () => {
      const mockSearchFunction = vi.fn().mockResolvedValue({
        items: [],
        total: 0,
        limit: 20,
        offset: 0,
        hasMore: false,
        searchMetadata: {
          query: 'test',
          syntaxType: 'natural',
          executionTimeMs: 100,
          totalMatches: 0,
          filters: {},
          suggestions: [],
        },
      });

      const query: AdvancedSearchQuery = {
        query: 'test query',
        syntaxType: 'natural',
      };

      const cacheKey = 'test-cache-key';
      const queryComplexity = 2.5;

      const { results, metrics } = await performanceService.executeSearchWithCache(
        mockSearchFunction,
        cacheKey,
        queryComplexity
      );

      expect(metrics.executionTime).toBeGreaterThan(0);
      expect(metrics.cacheHit).toBe(false); // First time should be cache miss
      expect(metrics.queryComplexity).toBe(queryComplexity);
      expect(metrics.resultCount).toBe(0);
    });

    it('should return cached results on second request', async () => {
      const mockSearchFunction = vi.fn().mockResolvedValue({
        items: [],
        total: 5,
        limit: 20,
        offset: 0,
        hasMore: false,
        searchMetadata: {
          query: 'test',
          syntaxType: 'natural',
          executionTimeMs: 100,
          totalMatches: 5,
          filters: {},
          suggestions: [],
        },
      });

      const cacheKey = 'test-cache-key-2';
      const queryComplexity = 1.0;

      // First request - cache miss
      const { metrics: firstMetrics } = await performanceService.executeSearchWithCache(
        mockSearchFunction,
        cacheKey,
        queryComplexity
      );
      expect(firstMetrics.cacheHit).toBe(false);
      expect(mockSearchFunction).toHaveBeenCalledTimes(1);

      // Second request - should be cache hit
      const { metrics: secondMetrics } = await performanceService.executeSearchWithCache(
        mockSearchFunction,
        cacheKey,
        queryComplexity
      );
      expect(secondMetrics.cacheHit).toBe(true);
      expect(mockSearchFunction).toHaveBeenCalledTimes(1); // Should not be called again
    });

    it('should provide performance statistics', () => {
      const stats = performanceService.getPerformanceStats();
      
      expect(stats).toMatchObject({
        totalRequests: expect.any(Number),
        averageResponseTime: expect.any(Number),
        cacheHitRate: expect.any(Number),
        slowQueries: expect.any(Number),
        complexityDistribution: {
          low: expect.any(Number),
          medium: expect.any(Number),
          high: expect.any(Number),
        },
      });
    });
  });

  describe('Query Complexity Calculation', () => {
    it('should calculate low complexity for simple queries', () => {
      const simpleQuery: AdvancedSearchQuery = {
        query: 'test',
        syntaxType: 'natural',
      };

      // Access private method using bracket notation
      const complexity = performanceService['calculateQueryComplexity'](simpleQuery);
      expect(complexity).toBeLessThanOrEqual(3);
    });

    it('should calculate high complexity for complex queries', () => {
      const complexQuery: AdvancedSearchQuery = {
        query: 'complex search query with multiple terms',
        syntaxType: 'regex',
        searchFields: ['title', 'description', 'content', 'comments'],
        includeHighlights: true,
        includePreviews: true,
        fuzzyMatch: true,
        dateRange: {
          field: 'modified',
          start: '2023-01-01T00:00:00Z',
          end: '2023-12-31T23:59:59Z',
        },
        createdBy: ['user1', 'user2', 'user3'],
        elementTypes: ['text', 'shape', 'image'],
        includeTags: ['tag1', 'tag2'],
        excludeTags: ['tag3'],
      };

      const complexity = performanceService['calculateQueryComplexity'](complexQuery);
      expect(complexity).toBeGreaterThan(7);
    });
  });

  describe('Benchmark Execution', () => {
    it('should run search benchmark successfully', async () => {
      const mockSearchFunction = vi.fn().mockResolvedValue({
        items: [],
        total: 10,
        limit: 20,
        offset: 0,
        hasMore: false,
        searchMetadata: {
          query: 'test',
          syntaxType: 'natural',
          executionTimeMs: 50,
          totalMatches: 10,
          filters: {},
          suggestions: [],
        },
      });

      const benchmarkConfig: BenchmarkConfig = {
        concurrentUsers: 2,
        requestsPerUser: 5,
        rampUpTime: 1,
        testDuration: 10,
      };

      const results = await performanceService.runSearchBenchmark(
        mockSearchFunction,
        benchmarkConfig
      );

      expect(results.totalRequests).toBe(10); // 2 users × 5 requests
      expect(results.successfulRequests).toBeLessThanOrEqual(results.totalRequests);
      expect(results.averageResponseTime).toBeGreaterThan(0);
      expect(results.requestsPerSecond).toBeGreaterThan(0);
      expect(results.errorRate).toBeGreaterThanOrEqual(0);
      expect(results.memoryUsage).toBeDefined();
    });

    it('should handle benchmark errors gracefully', async () => {
      const mockSearchFunction = vi.fn().mockRejectedValue(new Error('Search failed'));

      const benchmarkConfig: BenchmarkConfig = {
        concurrentUsers: 1,
        requestsPerUser: 3,
        rampUpTime: 0,
        testDuration: 5,
      };

      const results = await performanceService.runSearchBenchmark(
        mockSearchFunction,
        benchmarkConfig
      );

      expect(results.totalRequests).toBe(3);
      expect(results.failedRequests).toBe(3);
      expect(results.successfulRequests).toBe(0);
      expect(results.errorRate).toBe(1.0); // 100% error rate
    });

    it('should calculate correct performance percentiles', async () => {
      // Mock search function with predictable response times
      const responseTimes = [50, 100, 150, 200, 250, 300, 350, 400, 450, 500];
      let callCount = 0;
      
      const mockSearchFunction = vi.fn().mockImplementation(() => {
        const delay = responseTimes[callCount % responseTimes.length];
        callCount++;
        return new Promise(resolve => 
          setTimeout(() => resolve({
            items: [],
            total: 1,
            limit: 20,
            offset: 0,
            hasMore: false,
            searchMetadata: {
              query: 'test',
              syntaxType: 'natural',
              executionTimeMs: delay,
              totalMatches: 1,
              filters: {},
              suggestions: [],
            },
          }), delay)
        );
      });

      const benchmarkConfig: BenchmarkConfig = {
        concurrentUsers: 1,
        requestsPerUser: 10,
        rampUpTime: 0,
        testDuration: 30,
      };

      const results = await performanceService.runSearchBenchmark(
        mockSearchFunction,
        benchmarkConfig
      );

      expect(results.minResponseTime).toBeGreaterThan(0);
      expect(results.maxResponseTime).toBeGreaterThan(results.minResponseTime);
      expect(results.p95ResponseTime).toBeGreaterThan(results.averageResponseTime);
      expect(results.p99ResponseTime).toBeGreaterThanOrEqual(results.p95ResponseTime);
    });
  });

  describe('Query Optimization', () => {
    it('should provide optimization recommendations', async () => {
      // Simulate some slow queries
      const mockMetrics = [
        { executionTime: 1200, queryComplexity: 8, cacheHit: false, resultCount: 100 },
        { executionTime: 800, queryComplexity: 9, cacheHit: false, resultCount: 50 },
        { executionTime: 600, queryComplexity: 7, cacheHit: true, resultCount: 25 },
      ];

      // Set metrics history
      performanceService['metricsHistory'] = mockMetrics;

      const recommendations = await performanceService.optimizeQueries();

      expect(recommendations.recommendedIndexes).toBeInstanceOf(Array);
      expect(recommendations.queryOptimizations).toBeInstanceOf(Array);
      expect(recommendations.performanceImprovements).toBeInstanceOf(Array);
    });

    it('should identify high complexity queries for optimization', async () => {
      const highComplexityMetrics = Array.from({ length: 60 }, (_, i) => ({
        executionTime: 200,
        queryComplexity: 8 + Math.random() * 2, // High complexity (8-10)
        cacheHit: false,
        resultCount: 50,
      }));

      performanceService['metricsHistory'] = highComplexityMetrics;

      const recommendations = await performanceService.optimizeQueries();

      expect(recommendations.performanceImprovements.length).toBeGreaterThan(0);
      expect(recommendations.performanceImprovements.some(imp => 
        imp.includes('pre-computation')
      )).toBe(true);
    });

    it('should identify low cache hit rates', async () => {
      const lowCacheMetrics = Array.from({ length: 100 }, (_, i) => ({
        executionTime: 300,
        queryComplexity: 3,
        cacheHit: i < 20, // Only 20% cache hits
        resultCount: 30,
      }));

      performanceService['metricsHistory'] = lowCacheMetrics;

      const recommendations = await performanceService.optimizeQueries();

      expect(recommendations.performanceImprovements.some(imp =>
        imp.includes('cache')
      )).toBe(true);
    });
  });

  describe('Memory Management', () => {
    it('should maintain metrics history size limit', () => {
      const maxHistory = performanceService['maxMetricsHistory'];
      
      // Add metrics beyond the limit
      for (let i = 0; i < maxHistory + 100; i++) {
        performanceService['recordMetrics']({
          executionTime: 100,
          queryComplexity: 2,
          cacheHit: false,
          resultCount: 10,
        });
      }

      expect(performanceService['metricsHistory'].length).toBeLessThanOrEqual(maxHistory);
    });

    it('should log slow queries', () => {
      const slowMetrics = {
        executionTime: 1500, // Slow query
        queryComplexity: 5,
        cacheHit: false,
        resultCount: 100,
      };

      performanceService['recordMetrics'](slowMetrics);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Slow search query detected',
        expect.objectContaining({
          executionTime: 1500,
          queryComplexity: 5,
          cacheHit: false,
          resultCount: 100,
        })
      );
    });
  });
});