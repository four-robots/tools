import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import { WhiteboardSearchService } from './whiteboard-search-service';
import { DatabasePool } from '../../utils/database-pool';
import { Logger } from '../../utils/logger';
import { 
  AdvancedSearchQuery, 
  PaginatedSearchResults,
  SearchResultWithHighlights,
  SearchSuggestion,
  UnifiedSearchRequest,
} from '@shared/types/whiteboard';

// Mock dependencies
vi.mock('../../utils/database-pool');
vi.mock('../../utils/logger');

describe('WhiteboardSearchService', () => {
  let service: WhiteboardSearchService;
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

    service = new WhiteboardSearchService(mockDb, mockLogger);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('advancedSearch', () => {
    it('should perform advanced search with comprehensive filtering', async () => {
      // Mock database responses
      const mockSearchResults = {
        rows: [
          {
            id: 'whiteboard-1',
            name: 'Design System',
            description: 'Component library design',
            workspace_id: 'workspace-1',
            created_by: 'user-1',
            element_count: 25,
            collaborator_count: 3,
            comment_count: 8,
            relevance_score: 0.95,
            created_at: new Date(),
            updated_at: new Date(),
            visibility: 'workspace',
            is_collaborating: true,
            status: 'active',
            version: 1,
            last_modified_by: 'user-1',
            canvas_data: '{}',
            settings: '{}',
            template_id: null,
            is_template: false,
            last_activity: new Date(),
          }
        ]
      };

      const mockCountResult = {
        rows: [{ total: '1' }]
      };

      (mockDb.query as Mock)
        .mockResolvedValueOnce(mockSearchResults) // Main search query
        .mockResolvedValueOnce(mockCountResult);   // Count query

      const searchQuery: AdvancedSearchQuery = {
        query: 'design system',
        syntaxType: 'natural',
        searchFields: ['title', 'description'],
        includePreviews: true,
        includeHighlights: true,
        fuzzyMatch: true,
        maxPreviewLength: 200,
      };

      const result = await service.advancedSearch(
        'workspace-1',
        'user-1',
        searchQuery,
        { field: 'relevance', direction: 'desc' },
        20,
        0
      );

      // Verify the result structure
      expect(result).toMatchObject({
        items: expect.arrayContaining([
          expect.objectContaining({
            id: 'whiteboard-1',
            type: 'whiteboard',
            title: 'Design System',
            relevanceScore: expect.any(Number),
            metadata: expect.objectContaining({
              elementCount: 25,
              collaboratorCount: 3,
              commentCount: 8,
            }),
          })
        ]),
        total: 1,
        limit: 20,
        offset: 0,
        hasMore: false,
        searchMetadata: expect.objectContaining({
          query: 'design system',
          syntaxType: 'natural',
          executionTimeMs: expect.any(Number),
          totalMatches: 1,
        }),
      });

      // Verify database calls
      expect(mockDb.query).toHaveBeenCalledTimes(2);
    });

    it('should handle search errors gracefully', async () => {
      (mockDb.query as Mock).mockRejectedValue(new Error('Database error'));

      const searchQuery: AdvancedSearchQuery = {
        query: 'test query',
        syntaxType: 'natural',
      };

      await expect(
        service.advancedSearch('workspace-1', 'user-1', searchQuery)
      ).rejects.toThrow('Database error');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Advanced search failed',
        expect.objectContaining({ error: expect.any(Error) })
      );
    });

    it('should apply date range filters correctly', async () => {
      const mockSearchResults = { rows: [] };
      const mockCountResult = { rows: [{ total: '0' }] };

      (mockDb.query as Mock)
        .mockResolvedValueOnce(mockSearchResults)
        .mockResolvedValueOnce(mockCountResult);

      const searchQuery: AdvancedSearchQuery = {
        query: 'test',
        syntaxType: 'natural',
        dateRange: {
          field: 'created',
          start: '2023-01-01T00:00:00Z',
          end: '2023-12-31T23:59:59Z',
        },
      };

      await service.advancedSearch('workspace-1', 'user-1', searchQuery);

      // Verify that date filters are applied in the query
      const queryCall = (mockDb.query as Mock).mock.calls[0];
      expect(queryCall[0]).toContain('created_at >= $');
      expect(queryCall[0]).toContain('created_at <= $');
      expect(queryCall[1]).toContain('2023-01-01T00:00:00Z');
      expect(queryCall[1]).toContain('2023-12-31T23:59:59Z');
    });
  });

  describe('fullTextSearch', () => {
    it('should perform full-text search with PostgreSQL', async () => {
      const mockSearchResults = {
        rows: [
          {
            id: 'whiteboard-1',
            name: 'Test Whiteboard',
            description: 'A test whiteboard',
            workspace_id: 'workspace-1',
            created_by: 'user-1',
            element_count: 5,
            collaborator_count: 1,
            comment_count: 2,
            rank_score: 0.8,
            created_at: new Date(),
            updated_at: new Date(),
            visibility: 'workspace',
            is_collaborating: false,
            status: 'active',
            version: 1,
            last_modified_by: 'user-1',
            canvas_data: '{}',
            settings: '{}',
            template_id: null,
            is_template: false,
            last_activity: new Date(),
          }
        ]
      };

      const mockCountResult = { rows: [{ total: '1' }] };

      (mockDb.query as Mock)
        .mockResolvedValueOnce(mockSearchResults)
        .mockResolvedValueOnce(mockCountResult);

      const result = await service.fullTextSearch(
        'workspace-1',
        'user-1',
        'test whiteboard'
      );

      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toMatchObject({
        id: 'whiteboard-1',
        name: 'Test Whiteboard',
        elementCount: 5,
        collaboratorCount: 1,
        commentCount: 2,
      });

      // Verify full-text search query is used
      const queryCall = (mockDb.query as Mock).mock.calls[0];
      expect(queryCall[0]).toContain('search_vector');
      expect(queryCall[0]).toContain('plainto_tsquery');
    });

    it('should return empty results for short queries', async () => {
      const result = await service.fullTextSearch(
        'workspace-1',
        'user-1',
        'a' // Too short
      );

      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(mockDb.query).not.toHaveBeenCalled();
    });
  });

  describe('searchElements', () => {
    it('should search elements within a whiteboard', async () => {
      // Mock whiteboard access check
      (mockDb.query as Mock)
        .mockResolvedValueOnce({
          rows: [{ 
            id: 'whiteboard-1', 
            visibility: 'workspace', 
            created_by: 'user-1',
            user_id: 'user-1' 
          }]
        }) // Access verification
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'element-1',
              whiteboard_id: 'whiteboard-1',
              element_type: 'text',
              element_data: JSON.stringify({ text: 'Hello World', position: { x: 100, y: 200 } }),
              layer_index: 0,
              visible: true,
              locked: false,
              created_at: new Date(),
              updated_at: new Date(),
              created_by: 'user-1',
              last_modified_by: 'user-1',
              style_data: JSON.stringify({}),
              metadata: JSON.stringify({}),
              version: 1,
            }
          ]
        }) // Search results
        .mockResolvedValueOnce({ rows: [{ total: '1' }] }); // Count

      const result = await service.searchElements(
        'whiteboard-1',
        'user-1',
        'Hello',
        ['text'],
        10,
        0
      );

      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toMatchObject({
        id: 'element-1',
        elementType: 'text',
        whiteboardId: 'whiteboard-1',
        visible: true,
        locked: false,
      });
    });

    it('should throw error for unauthorized access', async () => {
      (mockDb.query as Mock).mockResolvedValueOnce({ rows: [] }); // No access

      await expect(
        service.searchElements('whiteboard-1', 'user-2', 'test')
      ).rejects.toThrow('Whiteboard not found');
    });
  });

  describe('searchComments', () => {
    it('should search comments within a whiteboard', async () => {
      // Mock whiteboard access check
      (mockDb.query as Mock)
        .mockResolvedValueOnce({
          rows: [{ 
            id: 'whiteboard-1', 
            visibility: 'workspace', 
            created_by: 'user-1',
            user_id: 'user-1' 
          }]
        }) // Access verification
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'comment-1',
              whiteboard_id: 'whiteboard-1',
              content: 'This is a test comment',
              thread_id: 'thread-1',
              status: 'open',
              priority: 'medium',
              resolved: false,
              mentions: JSON.stringify([]),
              attachments: JSON.stringify([]),
              tags: JSON.stringify(['feedback']),
              created_by: 'user-1',
              created_at: new Date(),
              updated_at: new Date(),
            }
          ]
        }) // Search results
        .mockResolvedValueOnce({ rows: [{ total: '1' }] }); // Count

      const result = await service.searchComments(
        'whiteboard-1',
        'user-1',
        'test comment',
        true,
        10,
        0
      );

      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toMatchObject({
        id: 'comment-1',
        whiteboardId: 'whiteboard-1',
        content: 'This is a test comment',
        threadId: 'thread-1',
        status: 'open',
        resolved: false,
        tags: ['feedback'],
      });
    });
  });

  describe('generateSearchSuggestions', () => {
    it('should generate search suggestions from multiple sources', async () => {
      // Mock tag suggestions
      (mockDb.query as Mock)
        .mockResolvedValueOnce({
          rows: [
            { tag: 'design', usage_count: 15 },
            { tag: 'prototype', usage_count: 8 },
          ]
        })
        // Mock user suggestions
        .mockResolvedValueOnce({
          rows: [
            { name: 'Designer Alice', activity_count: 25 },
          ]
        })
        // Mock category suggestions
        .mockResolvedValueOnce({
          rows: [
            { category: 'design-system', template_count: 5 },
          ]
        });

      const suggestions = await service.generateSearchSuggestions(
        'des',
        'workspace-1',
        'user-1',
        10
      );

      expect(suggestions).toHaveLength(3);
      
      // Check tag suggestion
      expect(suggestions).toContainEqual(
        expect.objectContaining({
          text: 'design',
          type: 'tag',
          score: expect.any(Number),
          metadata: expect.objectContaining({
            category: 'tag',
            usage: 15,
          }),
        })
      );

      // Check user suggestion
      expect(suggestions).toContainEqual(
        expect.objectContaining({
          text: 'Designer Alice',
          type: 'user',
          score: expect.any(Number),
        })
      );
    });

    it('should return empty array for short queries', async () => {
      const suggestions = await service.generateSearchSuggestions(
        'a', // Too short
        'workspace-1',
        'user-1'
      );

      expect(suggestions).toHaveLength(0);
      expect(mockDb.query).not.toHaveBeenCalled();
    });
  });

  describe('unifiedSearch', () => {
    it('should perform cross-service search', async () => {
      const mockRequest: UnifiedSearchRequest = {
        query: 'design system',
        services: ['whiteboard', 'kanban', 'wiki'],
        limit: 20,
      };

      // Mock whiteboard search results
      vi.spyOn(service, 'advancedSearch').mockResolvedValue({
        items: [
          {
            id: 'whiteboard-1',
            type: 'whiteboard',
            title: 'Design System',
            description: 'Component library',
            relevanceScore: 0.9,
            metadata: {},
            highlights: [],
            contextData: { createdBy: 'user-1' },
            matchedFields: ['title'],
            createdAt: '2023-01-01T00:00:00Z',
            updatedAt: '2023-06-01T00:00:00Z',
          }
        ],
        total: 1,
        limit: 20,
        offset: 0,
        hasMore: false,
        searchMetadata: {
          query: 'design system',
          syntaxType: 'natural',
          executionTimeMs: 150,
          totalMatches: 1,
          filters: {},
          suggestions: [],
        },
      } as PaginatedSearchResults);

      const result = await service.unifiedSearch(
        'workspace-1',
        'user-1',
        mockRequest
      );

      expect(result.results).toHaveLength(1);
      expect(result.results[0]).toMatchObject({
        id: 'whiteboard-1',
        type: 'whiteboard',
        title: 'Design System',
        service: 'whiteboard',
        score: 0.9,
      });

      expect(result.searchMetadata).toMatchObject({
        executionTimeMs: expect.any(Number),
        totalSources: 3,
        resultsCount: 1,
      });
    });
  });

  describe('error handling', () => {
    it('should sanitize malicious input in search queries', async () => {
      const maliciousQuery: AdvancedSearchQuery = {
        query: '<script>alert("xss")</script>',
        syntaxType: 'natural',
      };

      // Mock empty results to avoid database interaction
      (mockDb.query as Mock)
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: '0' }] });

      await service.advancedSearch('workspace-1', 'user-1', maliciousQuery);

      // Verify that the query was sanitized
      const queryCall = (mockDb.query as Mock).mock.calls[0];
      const sanitizedQuery = queryCall[1].find((param: string) => 
        typeof param === 'string' && param.includes('alert')
      );
      
      // Should not contain script tags after sanitization
      expect(sanitizedQuery).not.toContain('<script>');
      expect(sanitizedQuery).not.toContain('</script>');
    });

    it('should handle database connection errors', async () => {
      (mockDb.query as Mock).mockRejectedValue(new Error('Connection failed'));

      const searchQuery: AdvancedSearchQuery = {
        query: 'test',
        syntaxType: 'natural',
      };

      await expect(
        service.advancedSearch('workspace-1', 'user-1', searchQuery)
      ).rejects.toThrow('Connection failed');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Advanced search failed',
        expect.objectContaining({
          error: expect.any(Error),
          query: searchQuery,
        })
      );
    });

    it('should validate input parameters', async () => {
      const invalidQuery: AdvancedSearchQuery = {
        query: '', // Empty query
        syntaxType: 'natural',
      };

      // Should handle empty query gracefully
      (mockDb.query as Mock)
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: '0' }] });

      const result = await service.advancedSearch('workspace-1', 'user-1', invalidQuery);
      
      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  describe('performance', () => {
    it('should complete searches within performance thresholds', async () => {
      const mockSearchResults = { rows: [] };
      const mockCountResult = { rows: [{ total: '0' }] };

      (mockDb.query as Mock)
        .mockResolvedValueOnce(mockSearchResults)
        .mockResolvedValueOnce(mockCountResult);

      const searchQuery: AdvancedSearchQuery = {
        query: 'test query',
        syntaxType: 'natural',
      };

      const startTime = Date.now();
      const result = await service.advancedSearch('workspace-1', 'user-1', searchQuery);
      const endTime = Date.now();

      // Should complete within reasonable time
      expect(endTime - startTime).toBeLessThan(5000); // 5 seconds
      
      // Should report execution time
      expect(result.searchMetadata.executionTimeMs).toBeGreaterThan(0);
      expect(result.searchMetadata.executionTimeMs).toBeLessThan(1000); // 1 second
    });
  });

  describe('edge cases', () => {
    it('should handle special characters in search queries', async () => {
      const mockSearchResults = { rows: [] };
      const mockCountResult = { rows: [{ total: '0' }] };

      (mockDb.query as Mock)
        .mockResolvedValueOnce(mockSearchResults)
        .mockResolvedValueOnce(mockCountResult);

      const specialCharsQuery: AdvancedSearchQuery = {
        query: '@#$%^&*()[]{}|\\:";\'<>?,./`~',
        syntaxType: 'natural',
      };

      const result = await service.advancedSearch('workspace-1', 'user-1', specialCharsQuery);
      
      expect(result).toBeDefined();
      expect(result.items).toHaveLength(0);
    });

    it('should handle very long search queries', async () => {
      const mockSearchResults = { rows: [] };
      const mockCountResult = { rows: [{ total: '0' }] };

      (mockDb.query as Mock)
        .mockResolvedValueOnce(mockSearchResults)
        .mockResolvedValueOnce(mockCountResult);

      const longQuery: AdvancedSearchQuery = {
        query: 'a'.repeat(2000), // Very long query
        syntaxType: 'natural',
      };

      const result = await service.advancedSearch('workspace-1', 'user-1', longQuery);
      
      expect(result).toBeDefined();
      expect(result.searchMetadata.query).toHaveLength(1000); // Should be truncated
    });
  });
});