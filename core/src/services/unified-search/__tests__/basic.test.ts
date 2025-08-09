/**
 * Basic Tests for Unified Search Components
 * 
 * Simple unit tests to verify core functionality without external dependencies.
 */

import { QueryProcessor } from '../QueryProcessor.js';
import { ResultMerger } from '../ResultMerger.js';
import { createCacheService } from '../CacheService.js';
import { createSearchAnalytics } from '../SearchAnalytics.js';
import type { UnifiedSearchRequest, SearchResult } from '../../../shared/types/search.js';

describe('QueryProcessor', () => {
  let queryProcessor: QueryProcessor;

  beforeEach(() => {
    queryProcessor = new QueryProcessor();
  });

  describe('processQuery', () => {
    it('should process a simple query correctly', async () => {
      const request: UnifiedSearchRequest = {
        query: 'test search query',
        pagination: { page: 1, limit: 20 }
      };

      const result = await queryProcessor.processQuery(request);

      expect(result).toBeDefined();
      expect(result.original).toBe('test search query');
      expect(result.normalized).toBe('test search query');
      expect(result.keywords).toBeInstanceOf(Array);
      expect(result.keywords.length).toBeGreaterThan(0);
      expect(['informational', 'navigational', 'procedural', 'analytical', 'creative', 'troubleshooting'])
        .toContain(result.intent);
      expect(result.complexity).toBeGreaterThanOrEqual(0);
      expect(result.complexity).toBeLessThanOrEqual(1);
      expect(result.strategies).toBeInstanceOf(Array);
      expect(result.metadata).toBeDefined();
    });

    it('should classify different query intents correctly', async () => {
      const testCases = [
        { query: 'how to install software', expectedIntent: 'procedural' },
        { query: 'find user dashboard', expectedIntent: 'navigational' },
        { query: 'fix broken connection error', expectedIntent: 'troubleshooting' },
        { query: 'analyze performance metrics', expectedIntent: 'analytical' }
      ];

      for (const testCase of testCases) {
        const request: UnifiedSearchRequest = {
          query: testCase.query,
          pagination: { page: 1, limit: 20 }
        };
        const result = await queryProcessor.processQuery(request);
        expect(result.intent).toBe(testCase.expectedIntent);
      }
    });

    it('should extract keywords correctly', async () => {
      const request: UnifiedSearchRequest = {
        query: 'machine learning algorithms for data processing',
        pagination: { page: 1, limit: 20 }
      };

      const result = await queryProcessor.processQuery(request);

      expect(result.keywords).toContain('machine');
      expect(result.keywords).toContain('learning');
      expect(result.keywords).toContain('algorithms');
      expect(result.keywords).toContain('data');
      expect(result.keywords).toContain('processing');
      expect(result.keywords).not.toContain('for'); // Stop word should be filtered
    });
  });

  describe('generateSuggestions', () => {
    it('should generate suggestions for processed queries', async () => {
      const request: UnifiedSearchRequest = {
        query: 'test query',
        pagination: { page: 1, limit: 20 }
      };

      const processedQuery = await queryProcessor.processQuery(request);
      const suggestions = await queryProcessor.generateSuggestions(processedQuery);

      expect(suggestions).toBeInstanceOf(Array);
      // Suggestions may be empty for simple queries, just verify structure
      suggestions.forEach(suggestion => {
        expect(suggestion).toHaveProperty('query');
        expect(suggestion).toHaveProperty('type');
        expect(suggestion).toHaveProperty('confidence');
        expect(suggestion.confidence).toBeGreaterThanOrEqual(0);
        expect(suggestion.confidence).toBeLessThanOrEqual(1);
      });
    });
  });
});

describe('ResultMerger', () => {
  let resultMerger: ResultMerger;

  beforeEach(() => {
    resultMerger = new ResultMerger();
  });

  describe('generateAggregations', () => {
    it('should generate correct aggregations from search results', () => {
      const sampleResults: SearchResult[] = [
        {
          id: '1',
          type: 'memory_thought',
          title: 'Test Memory',
          score: { relevance: 0.8 },
          metadata: {
            created_at: '2024-01-01T00:00:00.000Z',
            tags: ['test', 'memory']
          }
        },
        {
          id: '2',
          type: 'kanban_card',
          title: 'Test Card',
          score: { relevance: 0.7 },
          metadata: {
            created_at: '2024-01-02T00:00:00.000Z',
            tags: ['test', 'kanban']
          }
        }
      ];

      const aggregations = resultMerger.generateAggregations(sampleResults);

      expect(aggregations.by_type['memory_thought']).toBe(1);
      expect(aggregations.by_type['kanban_card']).toBe(1);
      expect(aggregations.by_date).toBeDefined();
      expect(aggregations.top_tags).toBeInstanceOf(Array);
      
      // Check that tags are aggregated correctly
      const testTag = aggregations.top_tags.find(tag => tag.tag === 'test');
      expect(testTag?.count).toBe(2);
    });

    it('should handle empty results gracefully', () => {
      const aggregations = resultMerger.generateAggregations([]);

      expect(aggregations.by_type).toEqual({});
      expect(aggregations.by_date).toEqual({
        last_day: 0,
        last_week: 0,
        last_month: 0,
        older: 0
      });
      expect(aggregations.top_tags).toEqual([]);
    });
  });
});

describe('CacheService', () => {
  it('should create cache service with default configuration', () => {
    const cacheService = createCacheService({ cleanupInterval: 0 }); // Disable cleanup timer
    expect(cacheService).toBeDefined();
    
    const stats = cacheService.getStats();
    expect(stats.totalEntries).toBe(0);
    expect(stats.hits).toBe(0);
    expect(stats.misses).toBe(0);
    
    cacheService.shutdown();
  });

  it('should cache and retrieve data correctly', async () => {
    const cacheService = createCacheService({ cleanupInterval: 0 }); // Disable cleanup timer
    const testData = { message: 'test data' };

    // Cache some data
    await cacheService.cacheData('test-key', testData);

    // Retrieve cached data
    const cachedData = await cacheService.getCachedData('test-key');
    expect(cachedData).toEqual(testData);

    // Check stats
    const stats = cacheService.getStats();
    expect(stats.totalEntries).toBe(1);
    expect(stats.hits).toBe(1);
    
    cacheService.shutdown();
  });

  it('should handle cache misses correctly', async () => {
    const cacheService = createCacheService({ cleanupInterval: 0 }); // Disable cleanup timer

    const cachedData = await cacheService.getCachedData('non-existent-key');
    expect(cachedData).toBeNull();

    const stats = cacheService.getStats();
    expect(stats.misses).toBe(1);
    
    cacheService.shutdown();
  });
});

describe('SearchAnalytics', () => {
  it('should create search analytics with default configuration', () => {
    const analytics = createSearchAnalytics();
    expect(analytics).toBeDefined();
  });

  it('should handle empty analytics data gracefully', async () => {
    const analytics = createSearchAnalytics();
    
    const analyticsData = await analytics.getAnalytics();
    expect(analyticsData.queries).toEqual([]);
    expect(analyticsData.performance.total_queries).toBe(0);
    expect(analyticsData.popularTerms).toEqual([]);
  });
});

describe('Module Integration', () => {
  it('should export all required components from index', async () => {
    // Dynamic import to test the module exports
    const unifiedSearchModule = await import('../index.js');
    
    // Check that all main exports are available
    expect(unifiedSearchModule.UnifiedSearchService).toBeDefined();
    expect(unifiedSearchModule.createUnifiedSearchService).toBeDefined();
    expect(unifiedSearchModule.QueryProcessor).toBeDefined();
    expect(unifiedSearchModule.ResultMerger).toBeDefined();
    expect(unifiedSearchModule.SearchAnalytics).toBeDefined();
    expect(unifiedSearchModule.CacheService).toBeDefined();
    expect(unifiedSearchModule.DEFAULT_UNIFIED_SEARCH_CONFIG).toBeDefined();
    expect(unifiedSearchModule.MODULE_INFO).toBeDefined();
    
    // Check utility functions
    expect(unifiedSearchModule.validateSearchQuery).toBeDefined();
    expect(unifiedSearchModule.createOptimalFilters).toBeDefined();
    expect(unifiedSearchModule.formatSearchResultsForDisplay).toBeDefined();
  });

  it('should validate search queries correctly', async () => {
    const { validateSearchQuery } = await import('../index.js');
    
    expect(validateSearchQuery('valid query')).toBe(true);
    expect(validateSearchQuery('')).toBe(false);
    expect(validateSearchQuery('   ')).toBe(false);
    expect(validateSearchQuery(null as any)).toBe(false);
    expect(validateSearchQuery(undefined as any)).toBe(false);
    
    // Test length limits
    const longQuery = 'a'.repeat(1001);
    expect(validateSearchQuery(longQuery)).toBe(false);
    
    const maxLengthQuery = 'a'.repeat(1000);
    expect(validateSearchQuery(maxLengthQuery)).toBe(true);
  });

  it('should create optimal filters based on query content', async () => {
    const { createOptimalFilters } = await import('../index.js');
    
    // Test code-related queries
    const codeFilters = createOptimalFilters('javascript function implementation');
    expect(codeFilters.content_types).toContain('code_file');
    
    // Test task-related queries
    const taskFilters = createOptimalFilters('todo task management board');
    expect(taskFilters.content_types).toContain('kanban_card');
    
    // Test documentation queries
    const docFilters = createOptimalFilters('documentation guide tutorial');
    expect(docFilters.content_types).toContain('wiki_page');
    expect(docFilters.content_types).toContain('scraped_page');
  });
});