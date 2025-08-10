/**
 * Facet Filter Engine Tests
 */

import { describe, test, expect, beforeEach } from '@jest/globals';
import { FacetFilterEngine } from '../facet-filter-engine.js';
import type { SearchResult, FacetFilter } from '../../../shared/types/index.js';

describe('FacetFilterEngine', () => {
  let filterEngine: FacetFilterEngine;
  let sampleResults: SearchResult[];

  beforeEach(() => {
    filterEngine = new FacetFilterEngine({
      enableOptimization: true,
      enableCaching: true
    });

    sampleResults = [
      {
        id: '1',
        type: 'wiki_page',
        title: 'JavaScript Guide',
        score: { relevance: 0.9 },
        metadata: {
          created_at: '2024-01-01T00:00:00Z',
          tags: ['javascript', 'frontend'],
          category: 'development',
          priority: 1,
          estimate: 8
        }
      },
      {
        id: '2',
        type: 'kanban_card',
        title: 'Python API',
        score: { relevance: 0.8 },
        metadata: {
          created_at: '2024-01-02T00:00:00Z',
          tags: ['python', 'backend'],
          category: 'development',
          priority: 2,
          estimate: 13
        }
      },
      {
        id: '3',
        type: 'memory_thought',
        title: 'Design Review',
        score: { relevance: 0.7 },
        metadata: {
          created_at: '2024-01-03T00:00:00Z',
          tags: ['design', 'review'],
          category: 'process',
          priority: 1,
          estimate: 5
        }
      },
      {
        id: '4',
        type: 'wiki_page',
        title: 'Testing Framework',
        score: { relevance: 0.6 },
        metadata: {
          created_at: '2024-01-04T00:00:00Z',
          tags: ['testing', 'framework'],
          category: 'development',
          priority: 3,
          estimate: 21
        }
      }
    ];
  });

  describe('applyFilters', () => {
    test('should return all results when no filters applied', async () => {
      const filters: FacetFilter[] = [];
      const results = await filterEngine.applyFilters(sampleResults, filters);
      
      expect(results).toEqual(sampleResults);
    });

    test('should filter by equals operation', async () => {
      const filters: FacetFilter[] = [
        {
          facetId: 'category-facet',
          operation: 'equals',
          values: ['development'],
          logic: 'AND'
        }
      ];

      const results = await filterEngine.applyFilters(sampleResults, filters);
      
      expect(results).toHaveLength(3);
      expect(results.every(r => r.metadata.category === 'development')).toBe(true);
    });

    test('should filter by multiple values with equals operation', async () => {
      const filters: FacetFilter[] = [
        {
          facetId: 'category-facet',
          operation: 'equals',
          values: ['development', 'process'],
          logic: 'AND'
        }
      ];

      const results = await filterEngine.applyFilters(sampleResults, filters);
      
      expect(results).toHaveLength(4); // All results match either value
      expect(results.every(r => 
        r.metadata.category === 'development' || r.metadata.category === 'process'
      )).toBe(true);
    });

    test('should filter by contains operation', async () => {
      const filters: FacetFilter[] = [
        {
          facetId: 'tags-facet',
          operation: 'contains',
          values: ['script'],
          logic: 'AND'
        }
      ];

      const results = await filterEngine.applyFilters(sampleResults, filters);
      
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('1'); // JavaScript Guide contains 'script'
    });

    test('should filter by range operation', async () => {
      const filters: FacetFilter[] = [
        {
          facetId: 'estimate-facet',
          operation: 'range',
          values: [],
          rangeMin: 5,
          rangeMax: 15,
          logic: 'AND'
        }
      ];

      const results = await filterEngine.applyFilters(sampleResults, filters);
      
      expect(results).toHaveLength(3);
      expect(results.every(r => r.metadata.estimate >= 5 && r.metadata.estimate <= 15)).toBe(true);
    });

    test('should filter by exists operation', async () => {
      const filters: FacetFilter[] = [
        {
          facetId: 'priority-facet',
          operation: 'exists',
          values: [],
          logic: 'AND'
        }
      ];

      const results = await filterEngine.applyFilters(sampleResults, filters);
      
      expect(results).toHaveLength(4); // All results have priority field
    });

    test('should filter by not_exists operation', async () => {
      // Add a result without priority field
      const resultsWithMissing = [
        ...sampleResults,
        {
          id: '5',
          type: 'wiki_page' as const,
          title: 'No Priority',
          score: { relevance: 0.5 },
          metadata: {
            created_at: '2024-01-05T00:00:00Z',
            tags: ['misc'],
            category: 'other'
            // No priority field
          }
        }
      ];

      const filters: FacetFilter[] = [
        {
          facetId: 'priority-facet',
          operation: 'not_exists',
          values: [],
          logic: 'AND'
        }
      ];

      const results = await filterEngine.applyFilters(resultsWithMissing, filters);
      
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('5');
    });

    test('should apply multiple filters with AND logic', async () => {
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

      const results = await filterEngine.applyFilters(sampleResults, filters, 'AND');
      
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('1'); // Only JavaScript Guide matches both
    });

    test('should apply multiple filters with OR logic', async () => {
      const filters: FacetFilter[] = [
        {
          facetId: 'category-facet',
          operation: 'equals',
          values: ['process'],
          logic: 'OR'
        },
        {
          facetId: 'priority-facet',
          operation: 'equals',
          values: ['3'],
          logic: 'OR'
        }
      ];

      const results = await filterEngine.applyFilters(sampleResults, filters, 'OR');
      
      expect(results).toHaveLength(2);
      expect(results.some(r => r.id === '3')).toBe(true); // Design Review (process)
      expect(results.some(r => r.id === '4')).toBe(true); // Testing Framework (priority 3)
    });

    test('should apply multiple filters with NOT logic', async () => {
      const filters: FacetFilter[] = [
        {
          facetId: 'category-facet',
          operation: 'equals',
          values: ['development'],
          logic: 'NOT'
        }
      ];

      const results = await filterEngine.applyFilters(sampleResults, filters, 'NOT');
      
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('3'); // Only Design Review is not development
    });

    test('should handle filtering with no matching results', async () => {
      const filters: FacetFilter[] = [
        {
          facetId: 'category-facet',
          operation: 'equals',
          values: ['non-existent-category'],
          logic: 'AND'
        }
      ];

      const results = await filterEngine.applyFilters(sampleResults, filters);
      
      expect(results).toHaveLength(0);
    });

    test('should handle array values in metadata correctly', async () => {
      const filters: FacetFilter[] = [
        {
          facetId: 'tags-facet',
          operation: 'equals',
          values: ['javascript, frontend'], // Normalized array representation
          logic: 'AND'
        }
      ];

      const results = await filterEngine.applyFilters(sampleResults, filters);
      
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('1');
    });

    test('should handle numeric range filtering correctly', async () => {
      const filters: FacetFilter[] = [
        {
          facetId: 'estimate-facet',
          operation: 'range',
          values: [],
          rangeMin: 10,
          logic: 'AND'
        }
      ];

      const results = await filterEngine.applyFilters(sampleResults, filters);
      
      expect(results).toHaveLength(2);
      expect(results.every(r => r.metadata.estimate >= 10)).toBe(true);
    });

    test('should handle string to number conversion for ranges', async () => {
      const resultsWithStringNumbers = sampleResults.map(r => ({
        ...r,
        metadata: {
          ...r.metadata,
          estimate: String(r.metadata.estimate) // Convert to string
        }
      }));

      const filters: FacetFilter[] = [
        {
          facetId: 'estimate-facet',
          operation: 'range',
          values: [],
          rangeMin: 8,
          rangeMax: 15,
          logic: 'AND'
        }
      ];

      const results = await filterEngine.applyFilters(resultsWithStringNumbers, filters);
      
      expect(results).toHaveLength(2); // Only estimates 8 and 13 are between 8-15
    });
  });

  describe('generateFilterStatistics', () => {
    test('should generate correct filter statistics', async () => {
      const originalResults = sampleResults;
      const filteredResults = sampleResults.slice(0, 2);
      const filters: FacetFilter[] = [
        {
          facetId: 'category-facet',
          operation: 'equals',
          values: ['development'],
          logic: 'AND'
        }
      ];
      const processingTime = 150;

      const stats = filterEngine.generateFilterStatistics(
        originalResults,
        filteredResults,
        filters,
        processingTime
      );

      expect(stats.originalCount).toBe(4);
      expect(stats.filteredCount).toBe(2);
      expect(stats.reductionPercentage).toBe(50);
      expect(stats.processingTimeMs).toBe(150);
      expect(stats.filtersApplied).toBe(1);
    });

    test('should handle zero original results', async () => {
      const stats = filterEngine.generateFilterStatistics(
        [],
        [],
        [],
        100
      );

      expect(stats.originalCount).toBe(0);
      expect(stats.filteredCount).toBe(0);
      expect(stats.reductionPercentage).toBe(0);
    });
  });

  describe('cache functionality', () => {
    test('should use cache for repeated filter operations', async () => {
      const filters: FacetFilter[] = [
        {
          facetId: 'category-facet',
          operation: 'equals',
          values: ['development'],
          logic: 'AND'
        }
      ];

      // First call
      const results1 = await filterEngine.applyFilters(sampleResults, filters);
      
      // Second call with same parameters (should use cache)
      const results2 = await filterEngine.applyFilters(sampleResults, filters);

      expect(results1).toEqual(results2);
    });

    test('should clear cache when requested', () => {
      filterEngine.clearCache();
      
      const stats = filterEngine.getCacheStatistics();
      expect(stats.size).toBe(0);
    });
  });

  describe('hierarchical filtering', () => {
    test('should apply hierarchical filter with children inclusion', async () => {
      const resultsWithHierarchy = [
        {
          id: '1',
          type: 'code_file' as const,
          title: 'Button.tsx',
          score: { relevance: 0.9 },
          metadata: {
            created_at: '2024-01-01T00:00:00Z',
            category: 'frontend/components/ui'
          }
        },
        {
          id: '2',
          type: 'code_file' as const,
          title: 'Modal.tsx',
          score: { relevance: 0.8 },
          metadata: {
            created_at: '2024-01-02T00:00:00Z',
            category: 'frontend/components/overlay'
          }
        },
        {
          id: '3',
          type: 'code_file' as const,
          title: 'UserService.ts',
          score: { relevance: 0.7 },
          metadata: {
            created_at: '2024-01-03T00:00:00Z',
            category: 'backend/services'
          }
        }
      ];

      const filters: FacetFilter[] = [
        {
          facetId: 'category-facet',
          operation: 'contains',
          values: ['frontend'],
          logic: 'AND'
        }
      ];

      const results = await filterEngine.applyHierarchicalFilter(
        resultsWithHierarchy,
        filters[0],
        true
      );

      expect(results).toHaveLength(2);
      expect(results.every(r => r.metadata.category.includes('frontend'))).toBe(true);
    });
  });

  describe('performance optimization', () => {
    test('should optimize filter order based on selectivity', async () => {
      const manyResults = Array.from({ length: 1000 }, (_, i) => ({
        id: `${i}`,
        type: 'wiki_page' as const,
        title: `Page ${i}`,
        score: { relevance: Math.random() },
        metadata: {
          created_at: '2024-01-01T00:00:00Z',
          common_field: 'common', // Low selectivity
          specific_field: i < 10 ? 'rare' : 'common' // High selectivity
        }
      }));

      const filters: FacetFilter[] = [
        {
          facetId: 'specific_field',
          operation: 'equals',
          values: ['rare'],
          logic: 'AND'
        }
      ];

      const startTime = Date.now();
      const results = await filterEngine.applyFilters(manyResults, filters, 'AND');
      const processingTime = Date.now() - startTime;

      expect(results).toHaveLength(10);
      expect(processingTime).toBeLessThan(1000); // Should complete quickly
    });
  });
});