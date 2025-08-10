/**
 * Dynamic Facet Service Tests
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { DynamicFacetService } from '../dynamic-facet-service.js';
import type { SearchResult, FacetFilter } from '../../../shared/types/index.js';

describe('DynamicFacetService', () => {
  let facetService: DynamicFacetService;
  let sampleResults: SearchResult[];

  beforeEach(() => {
    facetService = new DynamicFacetService({
      cacheEnabled: false, // Disable cache for testing
      performanceTracking: true,
      maxProcessingTime: 10000
    });

    sampleResults = [
      {
        id: '1',
        type: 'wiki_page',
        title: 'JavaScript Fundamentals',
        score: { relevance: 0.9 },
        metadata: {
          created_at: '2024-01-01T00:00:00Z',
          tags: ['javascript', 'fundamentals'],
          category: 'development',
          language: 'javascript',
          difficulty: 'beginner',
          priority: 1,
          estimate: 8
        }
      },
      {
        id: '2',
        type: 'kanban_card',
        title: 'Python API Development',
        score: { relevance: 0.8 },
        metadata: {
          created_at: '2024-01-02T00:00:00Z',
          tags: ['python', 'api'],
          category: 'development',
          language: 'python',
          difficulty: 'intermediate',
          priority: 2,
          estimate: 13
        }
      },
      {
        id: '3',
        type: 'memory_thought',
        title: 'Design System Review',
        score: { relevance: 0.7 },
        metadata: {
          created_at: '2024-01-03T00:00:00Z',
          tags: ['design', 'system'],
          category: 'design',
          difficulty: 'advanced',
          priority: 1,
          estimate: 5
        }
      },
      {
        id: '4',
        type: 'code_file',
        title: 'UserService.ts',
        score: { relevance: 0.6 },
        metadata: {
          created_at: '2024-01-04T00:00:00Z',
          tags: ['typescript', 'service'],
          category: 'development',
          language: 'typescript',
          difficulty: 'intermediate',
          priority: 3,
          estimate: 21,
          file_path: '/src/services/UserService.ts'
        }
      }
    ];
  });

  describe('generateFacets', () => {
    test('should generate facets from search results', async () => {
      const facetCollection = await facetService.generateFacets(
        sampleResults,
        'javascript development'
      );

      expect(facetCollection).toBeDefined();
      expect(facetCollection.facets).toBeInstanceOf(Array);
      expect(facetCollection.totalResults).toBe(4);
      expect(facetCollection.appliedFilters).toEqual([]);
      expect(facetCollection.performance).toBeDefined();
      expect(facetCollection.generatedAt).toBeDefined();
    });

    test('should handle empty results gracefully', async () => {
      const facetCollection = await facetService.generateFacets([], 'empty query');

      expect(facetCollection).toBeDefined();
      expect(facetCollection.facets).toEqual([]);
      expect(facetCollection.totalResults).toBe(0);
    });

    test('should respect maxFacets option', async () => {
      const facetCollection = await facetService.generateFacets(
        sampleResults,
        'test query',
        { maxFacets: 2 }
      );

      expect(facetCollection.facets.length).toBeLessThanOrEqual(2);
    });

    test('should respect minQualityScore option', async () => {
      const facetCollectionHigh = await facetService.generateFacets(
        sampleResults,
        'test query',
        { minQualityScore: 0.9 }
      );

      const facetCollectionLow = await facetService.generateFacets(
        sampleResults,
        'test query',
        { minQualityScore: 0.3 }
      );

      expect(facetCollectionLow.facets.length).toBeGreaterThanOrEqual(
        facetCollectionHigh.facets.length
      );
    });

    test('should include performance metrics', async () => {
      const facetCollection = await facetService.generateFacets(
        sampleResults,
        'performance test'
      );

      expect(facetCollection.performance).toMatchObject({
        avgProcessingTime: expect.any(Number),
        p95ProcessingTime: expect.any(Number),
        cacheHitRate: expect.any(Number),
        totalOperations: expect.any(Number),
        errorRate: expect.any(Number)
      });
    });
  });

  describe('discoverFacets', () => {
    test('should discover facets from results', async () => {
      const discovered = await facetService.discoverFacets(sampleResults);

      expect(discovered).toBeInstanceOf(Array);
      expect(discovered.length).toBeGreaterThan(0);

      // Check that discovered facets have required properties
      discovered.forEach(facet => {
        expect(facet).toMatchObject({
          facetName: expect.any(String),
          facetType: expect.stringMatching(/^(categorical|range|hierarchical|date)$/),
          dataType: expect.stringMatching(/^(string|number|date|boolean)$/),
          sourceField: expect.any(String),
          displayName: expect.any(String),
          qualityScore: expect.any(Number),
          usefulnessScore: expect.any(Number),
          uniqueValueCount: expect.any(Number),
          sampleValues: expect.any(Array),
          cardinality: expect.stringMatching(/^(low|medium|high|very_high)$/),
          coverage: expect.any(Number),
          reasons: expect.any(Array)
        });
      });
    });

    test('should handle discovery options', async () => {
      const discovered = await facetService.discoverFacets(sampleResults, {
        maxFacets: 5,
        minQualityScore: 0.5,
        includeRanges: true,
        includeHierarchical: true
      });

      expect(discovered.length).toBeLessThanOrEqual(5);
    });
  });

  describe('buildHierarchicalFacets', () => {
    test('should build hierarchical facets from path-like data', async () => {
      const resultsWithPaths = [
        {
          id: '1',
          type: 'code_file' as const,
          title: 'Component.tsx',
          score: { relevance: 0.9 },
          metadata: {
            created_at: '2024-01-01T00:00:00Z',
            file_path: '/src/components/ui/Button.tsx',
            category: 'frontend/components/ui'
          }
        },
        {
          id: '2',
          type: 'code_file' as const,
          title: 'Service.ts',
          score: { relevance: 0.8 },
          metadata: {
            created_at: '2024-01-02T00:00:00Z',
            file_path: '/src/services/UserService.ts',
            category: 'backend/services'
          }
        }
      ];

      const hierarchicalFacets = await facetService.buildHierarchicalFacets(resultsWithPaths);

      expect(hierarchicalFacets).toBeInstanceOf(Array);
      
      hierarchicalFacets.forEach(facet => {
        expect(facet.facetType).toBe('hierarchical');
        expect(facet.levels).toBeInstanceOf(Array);
        expect(facet.maxDepth).toBeGreaterThan(0);
        expect(facet.expansion).toBeDefined();
      });
    });
  });

  describe('applyFacetFilters', () => {
    test('should apply filters to results', async () => {
      const filters: FacetFilter[] = [
        {
          facetId: 'category-facet',
          operation: 'equals',
          values: ['development'],
          logic: 'AND'
        }
      ];

      const filteredResults = await facetService.applyFacetFilters(sampleResults, filters);

      expect(filteredResults.length).toBeLessThanOrEqual(sampleResults.length);
      filteredResults.forEach(result => {
        expect(result.metadata.category).toBe('development');
      });
    });

    test('should handle empty filters array', async () => {
      const filteredResults = await facetService.applyFacetFilters(sampleResults, []);

      expect(filteredResults).toEqual(sampleResults);
    });

    test('should handle multiple filters', async () => {
      const filters: FacetFilter[] = [
        {
          facetId: 'category-facet',
          operation: 'equals',
          values: ['development'],
          logic: 'AND'
        },
        {
          facetId: 'priority-facet',
          operation: 'equals',
          values: ['1'],
          logic: 'AND'
        }
      ];

      const filteredResults = await facetService.applyFacetFilters(sampleResults, filters);

      expect(filteredResults.length).toBeLessThanOrEqual(sampleResults.length);
      filteredResults.forEach(result => {
        expect(result.metadata.category).toBe('development');
        expect(result.metadata.priority).toBe(1);
      });
    });
  });

  describe('calculateFacetCounts', () => {
    test('should calculate counts for facet values', async () => {
      const mockFacets = [
        {
          id: 'category-facet',
          facetName: 'category',
          facetType: 'categorical' as const,
          dataType: 'string' as const,
          sourceField: 'metadata.category',
          displayName: 'Category',
          isActive: true,
          sortOrder: 0,
          configuration: {},
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z'
        }
      ];

      const counts = await facetService.calculateFacetCounts(sampleResults, mockFacets);

      expect(counts).toHaveProperty('category-facet');
      expect(counts['category-facet']).toHaveProperty('development');
      expect(counts['category-facet']).toHaveProperty('design');
      expect(counts['category-facet']['development']).toBe(3);
      expect(counts['category-facet']['design']).toBe(1);
    });

    test('should handle facets with no matching values', async () => {
      const mockFacets = [
        {
          id: 'nonexistent-facet',
          facetName: 'nonexistent',
          facetType: 'categorical' as const,
          dataType: 'string' as const,
          sourceField: 'metadata.nonexistent_field',
          displayName: 'Nonexistent',
          isActive: true,
          sortOrder: 0,
          configuration: {},
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z'
        }
      ];

      const counts = await facetService.calculateFacetCounts(sampleResults, mockFacets);

      expect(counts).toHaveProperty('nonexistent-facet');
      expect(Object.keys(counts['nonexistent-facet'])).toHaveLength(0);
    });
  });

  describe('generateRangeFacets', () => {
    test('should generate range facets for numeric fields', async () => {
      const rangeFacet = await facetService.generateRangeFacets(
        'metadata.estimate',
        sampleResults
      );

      expect(rangeFacet).toBeDefined();
      expect(rangeFacet?.facetType).toBe('range');
      expect(rangeFacet?.dataType).toBe('number');
      expect(rangeFacet?.ranges).toBeInstanceOf(Array);
      expect(rangeFacet?.distribution).toBeDefined();
      expect(rangeFacet?.optimalBuckets).toBeGreaterThan(0);
    });

    test('should return null for non-numeric fields', async () => {
      const rangeFacet = await facetService.generateRangeFacets(
        'metadata.category',
        sampleResults
      );

      expect(rangeFacet).toBeNull();
    });

    test('should handle empty results', async () => {
      const rangeFacet = await facetService.generateRangeFacets(
        'metadata.estimate',
        []
      );

      expect(rangeFacet).toBeNull();
    });
  });

  describe('calculateOptimalRanges', () => {
    test('should calculate optimal ranges for numeric values', async () => {
      const values = [1, 5, 8, 13, 21, 34, 55, 89];
      const ranges = await facetService.calculateOptimalRanges(values);

      expect(ranges).toBeInstanceOf(Array);
      expect(ranges.length).toBeGreaterThan(0);
      expect(ranges.length).toBeLessThanOrEqual(15); // Max buckets

      ranges.forEach(range => {
        expect(range).toMatchObject({
          label: expect.any(String),
          min: expect.any(Number),
          max: expect.any(Number),
          count: expect.any(Number),
          selected: expect.any(Boolean)
        });
      });

      // Check that ranges cover all values
      const totalCount = ranges.reduce((sum, range) => sum + range.count, 0);
      expect(totalCount).toBe(values.length);
    });

    test('should handle single value', async () => {
      const values = [42];
      const ranges = await facetService.calculateOptimalRanges(values);

      expect(ranges).toHaveLength(1); // Single value = single bucket
      expect(ranges[0].count).toBe(1);
      expect(ranges[0].min).toBe(42);
      expect(ranges[0].max).toBe(42);
      expect(ranges[0].label).toBe('42');
    });

    test('should handle empty values', async () => {
      const ranges = await facetService.calculateOptimalRanges([]);

      expect(ranges).toEqual([]);
    });
  });

  describe('refreshFacetStatistics', () => {
    test('should refresh statistics for a facet', async () => {
      const facetId = 'test-facet-id';
      const statistics = await facetService.refreshFacetStatistics(facetId);

      expect(statistics).toBeDefined();
      expect(statistics.facetId).toBe(facetId);
      expect(statistics).toMatchObject({
        id: expect.any(String),
        facetId: expect.any(String),
        totalResults: expect.any(Number),
        uniqueValues: expect.any(Number),
        nullCount: expect.any(Number),
        statisticsDate: expect.any(String),
        hourlyStats: expect.any(Object),
        createdAt: expect.any(String)
      });
    });
  });

  describe('error handling', () => {
    test('should handle errors in facet generation gracefully', async () => {
      // Create a service with very short timeout to force timeout errors
      const timeoutService = new DynamicFacetService({
        maxProcessingTime: 1 // 1ms timeout
      });

      await expect(timeoutService.generateFacets(sampleResults, 'test')).resolves.toBeDefined();
    });

    test('should handle malformed search results', async () => {
      const malformedResults = [
        {
          id: '1',
          type: 'wiki_page',
          title: 'Test',
          score: { relevance: 0.8 },
          metadata: null // Malformed metadata
        }
      ] as any;

      await expect(
        facetService.generateFacets(malformedResults, 'test')
      ).resolves.toBeDefined();
    });
  });

  describe('performance', () => {
    test('should complete facet generation within reasonable time', async () => {
      const startTime = Date.now();
      
      await facetService.generateFacets(sampleResults, 'performance test');
      
      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
    });

    test('should handle large result sets efficiently', async () => {
      const largeResults = Array.from({ length: 1000 }, (_, i) => ({
        id: `${i}`,
        type: 'wiki_page' as const,
        title: `Page ${i}`,
        score: { relevance: Math.random() },
        metadata: {
          created_at: '2024-01-01T00:00:00Z',
          category: `category_${i % 10}`,
          priority: (i % 3) + 1,
          estimate: Math.floor(Math.random() * 50) + 1,
          tags: [`tag${i % 5}`, `tag${i % 7}`]
        }
      }));

      const startTime = Date.now();
      
      const facetCollection = await facetService.generateFacets(largeResults, 'large dataset');
      
      const duration = Date.now() - startTime;
      
      expect(facetCollection).toBeDefined();
      expect(duration).toBeLessThan(10000); // Should complete within 10 seconds
    });
  });
});