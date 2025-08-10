/**
 * Facet Discovery Engine Tests
 */

import { describe, test, expect, beforeEach } from '@jest/globals';
import { FacetDiscoveryEngine } from '../facet-discovery-engine.js';
import type { SearchResult } from '../../../shared/types/search.js';

describe('FacetDiscoveryEngine', () => {
  let discoveryEngine: FacetDiscoveryEngine;

  beforeEach(() => {
    discoveryEngine = new FacetDiscoveryEngine();
  });

  describe('discoverFacets', () => {
    test('should return empty array for empty results', async () => {
      const results: SearchResult[] = [];
      const discovered = await discoveryEngine.discoverFacets(results);
      
      expect(discovered).toEqual([]);
    });

    test('should discover categorical facets from metadata tags', async () => {
      const results: SearchResult[] = [
        {
          id: '1',
          type: 'wiki_page',
          title: 'Test Page 1',
          score: { relevance: 0.8 },
          metadata: {
            created_at: '2024-01-01T00:00:00Z',
            tags: ['javascript', 'web'],
            category: 'development'
          }
        },
        {
          id: '2',
          type: 'wiki_page',
          title: 'Test Page 2',
          score: { relevance: 0.7 },
          metadata: {
            created_at: '2024-01-02T00:00:00Z',
            tags: ['python', 'api'],
            category: 'development'
          }
        },
        {
          id: '3',
          type: 'kanban_card',
          title: 'Test Card',
          score: { relevance: 0.6 },
          metadata: {
            created_at: '2024-01-03T00:00:00Z',
            tags: ['feature'],
            category: 'project'
          }
        }
      ];

      const discovered = await discoveryEngine.discoverFacets(results, {
        maxFacets: 5,
        minQualityScore: 0.3
      });

      expect(discovered.length).toBeGreaterThan(0);
      
      // Should discover category facet
      const categoryFacet = discovered.find(f => f.sourceField === 'metadata.category');
      expect(categoryFacet).toBeDefined();
      expect(categoryFacet?.facetType).toBe('categorical');
      expect(categoryFacet?.uniqueValueCount).toBe(2);
      expect(categoryFacet?.sampleValues).toContain('development');
      expect(categoryFacet?.sampleValues).toContain('project');
    });

    test('should discover numeric range facets', async () => {
      const results: SearchResult[] = [
        {
          id: '1',
          type: 'kanban_card',
          title: 'Card 1',
          score: { relevance: 0.8 },
          metadata: {
            created_at: '2024-01-01T00:00:00Z',
            priority: 1,
            estimate: 8
          }
        },
        {
          id: '2',
          type: 'kanban_card',
          title: 'Card 2',
          score: { relevance: 0.7 },
          metadata: {
            created_at: '2024-01-02T00:00:00Z',
            priority: 3,
            estimate: 13
          }
        },
        {
          id: '3',
          type: 'kanban_card',
          title: 'Card 3',
          score: { relevance: 0.6 },
          metadata: {
            created_at: '2024-01-03T00:00:00Z',
            priority: 2,
            estimate: 5
          }
        }
      ];

      const discovered = await discoveryEngine.discoverFacets(results, {
        maxFacets: 10,
        minQualityScore: 0.3,
        includeRanges: true
      });

      // Should discover priority as categorical (low cardinality)
      const priorityFacet = discovered.find(f => f.sourceField === 'metadata.priority');
      expect(priorityFacet).toBeDefined();
      expect(priorityFacet?.dataType).toBe('number');
      
      // Should discover estimate as range facet if cardinality is high enough
      const estimateFacet = discovered.find(f => f.sourceField === 'metadata.estimate');
      expect(estimateFacet).toBeDefined();
      expect(estimateFacet?.dataType).toBe('number');
    });

    test('should discover date facets', async () => {
      const results: SearchResult[] = [
        {
          id: '1',
          type: 'wiki_page',
          title: 'Page 1',
          score: { relevance: 0.8 },
          metadata: {
            created_at: '2024-01-01T00:00:00Z',
            published_date: '2024-01-15T12:00:00Z'
          }
        },
        {
          id: '2',
          type: 'wiki_page',
          title: 'Page 2',
          score: { relevance: 0.7 },
          metadata: {
            created_at: '2024-01-02T00:00:00Z',
            published_date: '2024-02-01T08:00:00Z'
          }
        }
      ];

      const discovered = await discoveryEngine.discoverFacets(results, {
        maxFacets: 5,
        minQualityScore: 0.3,
        includeDates: true
      });

      const publishedDateFacet = discovered.find(f => f.sourceField === 'metadata.published_date');
      expect(publishedDateFacet).toBeDefined();
      expect(publishedDateFacet?.facetType).toBe('date');
      expect(publishedDateFacet?.dataType).toBe('date');
    });

    test('should discover hierarchical facets from path-like values', async () => {
      const results: SearchResult[] = [
        {
          id: '1',
          type: 'code_file',
          title: 'Component.tsx',
          score: { relevance: 0.8 },
          metadata: {
            created_at: '2024-01-01T00:00:00Z',
            file_path: '/src/components/Button.tsx',
            category: 'frontend/components'
          }
        },
        {
          id: '2',
          type: 'code_file',
          title: 'Service.ts',
          score: { relevance: 0.7 },
          metadata: {
            created_at: '2024-01-02T00:00:00Z',
            file_path: '/src/services/UserService.ts',
            category: 'backend/services'
          }
        }
      ];

      const discovered = await discoveryEngine.discoverFacets(results, {
        maxFacets: 5,
        minQualityScore: 0.3,
        includeHierarchical: true
      });

      const categoryFacet = discovered.find(f => f.sourceField === 'metadata.category');
      expect(categoryFacet).toBeDefined();
      expect(categoryFacet?.facetType).toBe('hierarchical');
      
      const filePathFacet = discovered.find(f => f.sourceField === 'metadata.file_path');
      expect(filePathFacet).toBeDefined();
      expect(filePathFacet?.facetType).toBe('hierarchical');
    });

    test('should respect quality score threshold', async () => {
      const results: SearchResult[] = [
        {
          id: '1',
          type: 'wiki_page',
          title: 'Page 1',
          score: { relevance: 0.8 },
          metadata: {
            created_at: '2024-01-01T00:00:00Z',
            rarely_used_field: 'value1' // Low coverage field
          }
        },
        {
          id: '2',
          type: 'wiki_page',
          title: 'Page 2',
          score: { relevance: 0.7 },
          metadata: {
            created_at: '2024-01-02T00:00:00Z',
            // Missing rarely_used_field
          }
        }
      ];

      const discoveredHigh = await discoveryEngine.discoverFacets(results, {
        maxFacets: 10,
        minQualityScore: 0.8 // High threshold
      });

      const discoveredLow = await discoveryEngine.discoverFacets(results, {
        maxFacets: 10,
        minQualityScore: 0.3 // Low threshold
      });

      expect(discoveredLow.length).toBeGreaterThanOrEqual(discoveredHigh.length);
    });

    test('should limit number of facets returned', async () => {
      const results: SearchResult[] = Array.from({ length: 5 }, (_, i) => ({
        id: `${i}`,
        type: 'wiki_page' as const,
        title: `Page ${i}`,
        score: { relevance: 0.8 },
        metadata: {
          created_at: '2024-01-01T00:00:00Z',
          [`field_${i}`]: `value_${i}`,
          [`category_${i}`]: `cat_${i}`,
          [`tag_${i}`]: [`tag1_${i}`, `tag2_${i}`]
        }
      }));

      const discovered = await discoveryEngine.discoverFacets(results, {
        maxFacets: 3,
        minQualityScore: 0.1
      });

      expect(discovered.length).toBeLessThanOrEqual(3);
    });

    test('should calculate coverage correctly', async () => {
      const results: SearchResult[] = [
        {
          id: '1',
          type: 'wiki_page',
          title: 'Page 1',
          score: { relevance: 0.8 },
          metadata: {
            created_at: '2024-01-01T00:00:00Z',
            common_field: 'value1'
          }
        },
        {
          id: '2',
          type: 'wiki_page',
          title: 'Page 2',
          score: { relevance: 0.7 },
          metadata: {
            created_at: '2024-01-02T00:00:00Z',
            common_field: 'value2'
          }
        },
        {
          id: '3',
          type: 'wiki_page',
          title: 'Page 3',
          score: { relevance: 0.6 },
          metadata: {
            created_at: '2024-01-03T00:00:00Z',
            // Missing common_field
          }
        }
      ];

      const discovered = await discoveryEngine.discoverFacets(results, {
        maxFacets: 5,
        minQualityScore: 0.1,
        minCoverage: 0.5 // Require at least 50% coverage
      });

      const commonFieldFacet = discovered.find(f => f.sourceField === 'metadata.common_field');
      expect(commonFieldFacet).toBeDefined();
      expect(commonFieldFacet?.coverage).toBeCloseTo(0.67, 2); // 2/3 results have the field
    });

    test('should handle array values in metadata', async () => {
      const results: SearchResult[] = [
        {
          id: '1',
          type: 'wiki_page',
          title: 'Page 1',
          score: { relevance: 0.8 },
          metadata: {
            created_at: '2024-01-01T00:00:00Z',
            tags: ['javascript', 'frontend']
          }
        },
        {
          id: '2',
          type: 'wiki_page',
          title: 'Page 2',
          score: { relevance: 0.7 },
          metadata: {
            created_at: '2024-01-02T00:00:00Z',
            tags: ['python', 'backend', 'api']
          }
        }
      ];

      const discovered = await discoveryEngine.discoverFacets(results, {
        maxFacets: 5,
        minQualityScore: 0.3
      });

      const tagsFacet = discovered.find(f => f.sourceField === 'metadata.tags');
      expect(tagsFacet).toBeDefined();
      expect(tagsFacet?.facetType).toBe('categorical');
      expect(tagsFacet?.sampleValues).toContain('javascript, frontend');
    });

    test('should skip system fields', async () => {
      const results: SearchResult[] = [
        {
          id: '1',
          type: 'wiki_page',
          title: 'Page 1',
          score: { relevance: 0.8 },
          metadata: {
            id: 'internal-id-1', // Should be skipped
            created_at: '2024-01-01T00:00:00Z', // Should be skipped
            _internal_field: 'internal', // Should be skipped
            category: 'valid-field' // Should be included
          }
        }
      ];

      const discovered = await discoveryEngine.discoverFacets(results, {
        maxFacets: 10,
        minQualityScore: 0.1
      });

      // Should not discover system fields
      expect(discovered.find(f => f.sourceField.includes('id'))).toBeUndefined();
      expect(discovered.find(f => f.sourceField.includes('created_at'))).toBeUndefined();
      expect(discovered.find(f => f.sourceField.includes('_internal'))).toBeUndefined();
      
      // Should discover valid fields
      expect(discovered.find(f => f.sourceField === 'metadata.category')).toBeDefined();
    });
  });
});