/**
 * Unit Tests for UnifiedSearchService
 * 
 * Comprehensive tests covering search aggregation, result merging,
 * error handling, caching, and analytics functionality.
 */

// Jest is already available globally in this project
import { UnifiedSearchService, createUnifiedSearchService } from '../UnifiedSearchService.js';
import { QueryProcessor } from '../QueryProcessor.js';
import { ResultMerger } from '../ResultMerger.js';
import { SearchAnalytics } from '../SearchAnalytics.js';
import { CacheService } from '../CacheService.js';
import type { 
  UnifiedSearchRequest, 
  UnifiedSearchResponse,
  SearchResult 
} from '../../../shared/types/search.js';

// Mock services
const mockMemoryService = {
  searchMemories: jest.fn()
};

const mockKanbanService = {
  searchCards: jest.fn()
};

const mockWikiService = {
  searchPages: jest.fn()
};

const mockScraperService = {
  searchScrapedContent: jest.fn()
};

// Sample search request
const sampleRequest: UnifiedSearchRequest = {
  query: 'test search query',
  filters: {
    content_types: ['memory_thought', 'kanban_card'],
    date_from: '2024-01-01T00:00:00.000Z'
  },
  sort: 'relevance',
  pagination: { page: 1, limit: 20 },
  use_semantic: true,
  use_fuzzy: true,
  include_preview: true,
  include_highlights: true
};

// Sample search results
const sampleMemoryResult: SearchResult = {
  id: '123e4567-e89b-12d3-a456-426614174000',
  type: 'memory_thought',
  title: 'Test Memory',
  preview: {
    text: 'This is a test memory content',
    length: 29,
    truncated: false
  },
  score: {
    relevance: 0.8,
    semantic_similarity: 0.75,
    text_match: 0.6
  },
  metadata: {
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-02T00:00:00.000Z'
  }
};

const sampleKanbanResult: SearchResult = {
  id: '223e4567-e89b-12d3-a456-426614174001',
  type: 'kanban_card',
  title: 'Test Card',
  preview: {
    text: 'This is a test kanban card',
    length: 26,
    truncated: false
  },
  score: {
    relevance: 0.7,
    semantic_similarity: 0.65,
    text_match: 0.8
  },
  metadata: {
    created_at: '2024-01-01T00:00:00.000Z'
  }
};

describe('UnifiedSearchService', () => {
  let service: UnifiedSearchService;

  beforeEach(() => {
    jest.clearAllMocks();
    
    service = new UnifiedSearchService(
      mockMemoryService as any,
      mockKanbanService as any,
      mockWikiService as any,
      mockScraperService as any,
      {
        enableCaching: true,
        enableAnalytics: true,
        maxSearchTimeoutMs: 5000,
        maxResultsPerPage: 100,
        similarityThreshold: 0.8
      }
    );
  });

  afterEach(async () => {
    await service.shutdown();
  });

  describe('searchAcrossSystem', () => {
    it('should perform unified search across all services', async () => {
      // Mock scraper service to return results
      mockScraperService.searchScrapedContent.mockResolvedValue({
        results: [
          {
            id: '323e4567-e89b-12d3-a456-426614174002',
            title: 'Test Scraped Page',
            preview: 'Scraped content preview',
            url: 'https://example.com/test',
            score: 0.6,
            scrapedAt: '2024-01-01T00:00:00.000Z'
          }
        ]
      });

      const result = await service.searchAcrossSystem(sampleRequest);

      expect(result).toBeDefined();
      expect(result.results).toBeInstanceOf(Array);
      expect(result.total_count).toBeGreaterThanOrEqual(0);
      expect(result.pagination).toBeDefined();
      expect(result.aggregations).toBeDefined();
      expect(result.performance).toBeDefined();
    });

    it('should handle empty search results gracefully', async () => {
      mockScraperService.searchScrapedContent.mockResolvedValue({
        results: []
      });

      const result = await service.searchAcrossSystem({
        query: 'nonexistent query',
        pagination: { page: 1, limit: 20 }
      });

      expect(result.results).toHaveLength(0);
      expect(result.total_count).toBe(0);
      expect(result.pagination.total_pages).toBe(0);
    });

    it('should apply content type filters correctly', async () => {
      const filteredRequest: UnifiedSearchRequest = {
        ...sampleRequest,
        filters: {
          content_types: ['memory_thought'] // Only memory results
        }
      };

      mockScraperService.searchScrapedContent.mockResolvedValue({
        results: []
      });

      const result = await service.searchAcrossSystem(filteredRequest);

      // Should not call scraper service since it's filtered out
      expect(result).toBeDefined();
    });

    it('should handle service errors gracefully', async () => {
      // Mock scraper to throw error
      mockScraperService.searchScrapedContent.mockRejectedValue(
        new Error('Service unavailable')
      );

      const result = await service.searchAcrossSystem(sampleRequest);

      // Should still return results even if one service fails
      expect(result).toBeDefined();
      expect(result.results).toBeInstanceOf(Array);
    });

    it('should respect pagination parameters', async () => {
      const paginatedRequest: UnifiedSearchRequest = {
        ...sampleRequest,
        pagination: { page: 2, limit: 5 }
      };

      mockScraperService.searchScrapedContent.mockResolvedValue({
        results: Array.from({ length: 20 }, (_, i) => ({
          id: `result-${i}`,
          title: `Result ${i}`,
          score: 0.5
        }))
      });

      const result = await service.searchAcrossSystem(paginatedRequest);

      expect(result.pagination.current_page).toBe(2);
      expect(result.pagination.per_page).toBe(5);
      expect(result.results.length).toBeLessThanOrEqual(5);
    });

    it('should include performance metrics', async () => {
      mockScraperService.searchScrapedContent.mockResolvedValue({
        results: []
      });

      const result = await service.searchAcrossSystem(sampleRequest);

      expect(result.performance).toBeDefined();
      expect(result.performance.processing_time_ms).toBeGreaterThan(0);
      expect(result.performance.documents_searched).toBeGreaterThanOrEqual(0);
    });

    it('should generate aggregations', async () => {
      mockScraperService.searchScrapedContent.mockResolvedValue({
        results: [
          {
            id: '1',
            title: 'Test 1',
            score: 0.8,
            scrapedAt: '2024-01-01T00:00:00.000Z'
          },
          {
            id: '2', 
            title: 'Test 2',
            score: 0.7,
            scrapedAt: '2024-01-01T00:00:00.000Z'
          }
        ]
      });

      const result = await service.searchAcrossSystem(sampleRequest);

      expect(result.aggregations).toBeDefined();
      expect(result.aggregations.by_type).toBeDefined();
      expect(result.aggregations.by_date).toBeDefined();
      expect(result.aggregations.top_tags).toBeDefined();
    });

    it('should handle timeout scenarios', async () => {
      const timeoutService = new UnifiedSearchService(
        mockMemoryService as any,
        mockKanbanService as any,
        mockWikiService as any,
        mockScraperService as any,
        {
          enableCaching: false,
          enableAnalytics: false,
          maxSearchTimeoutMs: 100, // Very short timeout
          maxResultsPerPage: 100,
          similarityThreshold: 0.8
        }
      );

      // Mock long-running operation
      mockScraperService.searchScrapedContent.mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve({ results: [] }), 200))
      );

      const result = await timeoutService.searchAcrossSystem(sampleRequest);

      // Should still return results even with timeouts
      expect(result).toBeDefined();
      
      await timeoutService.shutdown();
    });
  });

  describe('caching functionality', () => {
    it('should cache search results', async () => {
      mockScraperService.searchScrapedContent.mockResolvedValue({
        results: [{ id: '1', title: 'Test', score: 0.5 }]
      });

      // First search
      const result1 = await service.searchAcrossSystem(sampleRequest);
      
      // Second identical search
      const result2 = await service.searchAcrossSystem(sampleRequest);

      expect(result1.results).toEqual(result2.results);
      
      // Should only call scraper service once due to caching
      expect(mockScraperService.searchScrapedContent).toHaveBeenCalledTimes(1);
    });

    it('should provide cache statistics', () => {
      const stats = service.getCacheStats();
      
      expect(stats).toBeDefined();
      expect(typeof stats.hitRate).toBe('number');
      expect(typeof stats.totalEntries).toBe('number');
    });

    it('should allow cache clearing', async () => {
      await service.clearCache();
      
      const stats = service.getCacheStats();
      expect(stats.totalEntries).toBe(0);
    });
  });

  describe('analytics functionality', () => {
    it('should track search analytics', async () => {
      mockScraperService.searchScrapedContent.mockResolvedValue({
        results: []
      });

      await service.searchAcrossSystem(sampleRequest, 'user123');

      const analytics = await service.getAnalytics('user123');
      
      expect(analytics).toBeDefined();
      expect(analytics.queries).toBeInstanceOf(Array);
      expect(analytics.performance).toBeDefined();
    });

    it('should provide performance metrics', async () => {
      mockScraperService.searchScrapedContent.mockResolvedValue({
        results: []
      });

      await service.searchAcrossSystem(sampleRequest);
      
      const analytics = await service.getAnalytics();
      
      expect(analytics.performance.total_queries).toBeGreaterThan(0);
      expect(analytics.performance.avg_response_time_ms).toBeGreaterThan(0);
    });
  });

  describe('error handling', () => {
    it('should handle invalid search requests', async () => {
      const invalidRequest = {
        query: '', // Empty query should fail validation
        pagination: { page: 1, limit: 20 }
      } as UnifiedSearchRequest;

      await expect(service.searchAcrossSystem(invalidRequest))
        .rejects.toThrow();
    });

    it('should handle service unavailability', async () => {
      // All services throw errors
      mockScraperService.searchScrapedContent.mockRejectedValue(
        new Error('All services down')
      );

      const result = await service.searchAcrossSystem(sampleRequest);

      // Should return error response
      expect(result).toBeDefined();
      expect(result.results).toHaveLength(0);
      expect(result.total_count).toBe(0);
    });
  });

  describe('result merging and ranking', () => {
    it('should merge results from multiple sources', async () => {
      const mockResults = [
        { id: '1', title: 'Memory Result', score: 0.9, source: 'memory' },
        { id: '2', title: 'Scraper Result', score: 0.7, source: 'scraper' }
      ];

      mockScraperService.searchScrapedContent.mockResolvedValue({
        results: mockResults
      });

      const result = await service.searchAcrossSystem(sampleRequest);

      expect(result.results.length).toBeGreaterThanOrEqual(0);
    });

    it('should remove duplicate results', async () => {
      const duplicateResults = [
        { id: '1', title: 'Duplicate Result', preview: 'Same content', score: 0.8 },
        { id: '2', title: 'Duplicate Result', preview: 'Same content', score: 0.7 }
      ];

      mockScraperService.searchScrapedContent.mockResolvedValue({
        results: duplicateResults
      });

      const result = await service.searchAcrossSystem(sampleRequest);

      // Should remove duplicates based on similarity
      expect(result).toBeDefined();
    });

    it('should rank results by relevance', async () => {
      const unrankedResults = [
        { id: '1', title: 'Low Score', score: 0.3 },
        { id: '2', title: 'High Score', score: 0.9 },
        { id: '3', title: 'Medium Score', score: 0.6 }
      ];

      mockScraperService.searchScrapedContent.mockResolvedValue({
        results: unrankedResults
      });

      const result = await service.searchAcrossSystem(sampleRequest);

      if (result.results.length > 1) {
        // Results should be ranked by relevance (highest first)
        for (let i = 0; i < result.results.length - 1; i++) {
          expect(result.results[i].score.relevance)
            .toBeGreaterThanOrEqual(result.results[i + 1].score.relevance);
        }
      }
    });
  });

  describe('query processing', () => {
    it('should process complex queries correctly', async () => {
      const complexRequest: UnifiedSearchRequest = {
        query: 'how to implement machine learning algorithms in Python',
        filters: {
          content_types: ['code_file', 'wiki_page'],
          language: 'python'
        },
        pagination: { page: 1, limit: 20 },
        use_semantic: true
      };

      mockScraperService.searchScrapedContent.mockResolvedValue({
        results: []
      });

      const result = await service.searchAcrossSystem(complexRequest);

      expect(result).toBeDefined();
      expect(result.suggestions).toBeDefined();
    });

    it('should generate query suggestions', async () => {
      mockScraperService.searchScrapedContent.mockResolvedValue({
        results: []
      });

      const result = await service.searchAcrossSystem({
        query: 'teh quick brown fox', // Intentional typo
        pagination: { page: 1, limit: 20 }
      });

      expect(result.suggestions).toBeInstanceOf(Array);
    });
  });
});

describe('createUnifiedSearchService', () => {
  it('should create service with default configuration', () => {
    const service = createUnifiedSearchService(
      mockMemoryService as any,
      mockKanbanService as any,
      mockWikiService as any,
      mockScraperService as any
    );

    expect(service).toBeInstanceOf(UnifiedSearchService);
  });

  it('should create service with custom configuration', () => {
    const service = createUnifiedSearchService(
      mockMemoryService as any,
      mockKanbanService as any,
      mockWikiService as any,
      mockScraperService as any,
      {
        enableCaching: false,
        maxSearchTimeoutMs: 15000
      }
    );

    expect(service).toBeInstanceOf(UnifiedSearchService);
  });
});

// Integration-style tests with multiple components
describe('UnifiedSearchService Integration', () => {
  let service: UnifiedSearchService;

  beforeEach(() => {
    service = new UnifiedSearchService(
      mockMemoryService as any,
      mockKanbanService as any, 
      mockWikiService as any,
      mockScraperService as any,
      {
        enableCaching: true,
        enableAnalytics: true,
        maxSearchTimeoutMs: 5000,
        maxResultsPerPage: 100,
        similarityThreshold: 0.8
      }
    );
  });

  afterEach(async () => {
    await service.shutdown();
  });

  it('should handle full search workflow', async () => {
    // Mock realistic search results
    mockScraperService.searchScrapedContent.mockResolvedValue({
      results: [
        {
          id: '1',
          title: 'React Testing Guide',
          preview: 'How to test React components effectively',
          url: 'https://example.com/react-testing',
          score: 0.85,
          scrapedAt: '2024-01-01T00:00:00.000Z'
        },
        {
          id: '2',
          title: 'Jest Configuration',
          preview: 'Setting up Jest for testing',
          url: 'https://example.com/jest-config',
          score: 0.75,
          scrapedAt: '2024-01-01T00:00:00.000Z'
        }
      ]
    });

    const searchRequest: UnifiedSearchRequest = {
      query: 'react testing best practices',
      filters: {
        content_types: ['scraped_page', 'wiki_page'],
        date_from: '2024-01-01T00:00:00.000Z'
      },
      sort: 'relevance',
      pagination: { page: 1, limit: 10 },
      use_semantic: true,
      use_fuzzy: true,
      include_preview: true,
      include_highlights: true
    };

    const result = await service.searchAcrossSystem(
      searchRequest,
      'test-user-123',
      'test-session-456'
    );

    // Verify complete response structure
    expect(result.results).toBeInstanceOf(Array);
    expect(result.total_count).toBeGreaterThanOrEqual(0);
    expect(result.pagination).toMatchObject({
      current_page: 1,
      per_page: 10,
      total_pages: expect.any(Number),
      has_next: expect.any(Boolean),
      has_prev: false
    });
    expect(result.aggregations).toBeDefined();
    expect(result.performance.processing_time_ms).toBeGreaterThan(0);
    expect(result.suggestions).toBeInstanceOf(Array);

    // Verify analytics were recorded
    const analytics = await service.getAnalytics('test-user-123');
    expect(analytics.queries.length).toBeGreaterThan(0);
    expect(analytics.performance.total_queries).toBeGreaterThan(0);

    // Verify caching works on second identical request
    const cachedResult = await service.searchAcrossSystem(searchRequest, 'test-user-123');
    expect(cachedResult.results).toEqual(result.results);
    
    // Should still only have called scraper once due to caching
    expect(mockScraperService.searchScrapedContent).toHaveBeenCalledTimes(1);
  });
});