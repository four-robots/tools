import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useWhiteboardSearch } from '../useWhiteboardSearch';

// Mock the API hook
vi.mock('../use-api', () => ({
  useApi: () => ({
    post: vi.fn(),
  }),
}));

// Mock the toast hook
vi.mock('../use-toast', () => ({
  useToast: () => ({
    showToast: vi.fn(),
  }),
}));

describe('useWhiteboardSearch', () => {
  const mockPost = vi.fn();
  const mockShowToast = vi.fn();
  
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Reset mocks
    const { useApi } = require('../use-api');
    const { useToast } = require('../use-toast');
    
    useApi.mockReturnValue({ post: mockPost });
    useToast.mockReturnValue({ showToast: mockShowToast });
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  describe('Initial State', () => {
    it('should initialize with correct default state', () => {
      const { result } = renderHook(() => 
        useWhiteboardSearch('workspace-1', 'user-1')
      );

      expect(result.current.searchResults).toBeNull();
      expect(result.current.isSearching).toBe(false);
      expect(result.current.error).toBeNull();
      expect(result.current.searchAnalytics).toBeNull();
      expect(result.current.lastSearchQuery).toBeNull();
    });

    it('should provide all required action functions', () => {
      const { result } = renderHook(() => 
        useWhiteboardSearch('workspace-1', 'user-1')
      );

      expect(typeof result.current.performAdvancedSearch).toBe('function');
      expect(typeof result.current.performFullTextSearch).toBe('function');
      expect(typeof result.current.clearResults).toBe('function');
      expect(typeof result.current.retrySearch).toBe('function');
    });
  });

  describe('Advanced Search', () => {
    it('should perform advanced search successfully', async () => {
      const mockResponse = {
        data: {
          items: [{ id: '1', title: 'Test Whiteboard' }],
          total: 1,
        },
        analytics: { executionTime: 150 },
      };

      mockPost.mockResolvedValueOnce(mockResponse);

      const { result } = renderHook(() => 
        useWhiteboardSearch('workspace-1', 'user-1')
      );

      const query = {
        query: 'test query',
        syntaxType: 'natural' as const,
        searchFields: ['all'],
      };

      const sortConfig = { field: 'relevance' as const, direction: 'desc' as const };

      await act(async () => {
        await result.current.performAdvancedSearch(query, sortConfig);
      });

      expect(mockPost).toHaveBeenCalledWith('/api/whiteboard/search/advanced', {
        query,
        sortConfig,
        pagination: { limit: 20, offset: 0 },
        userId: 'user-1',
        workspaceId: 'workspace-1',
      }, expect.any(Object));

      expect(result.current.searchResults).toEqual(mockResponse.data);
      expect(result.current.searchAnalytics).toEqual(mockResponse.analytics);
      expect(result.current.isSearching).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('should handle search errors gracefully', async () => {
      const mockError = {
        response: { data: { message: 'Search failed' } },
      };

      mockPost.mockRejectedValueOnce(mockError);

      const { result } = renderHook(() => 
        useWhiteboardSearch('workspace-1', 'user-1')
      );

      const query = {
        query: 'test query',
        syntaxType: 'natural' as const,
        searchFields: ['all'],
      };

      const sortConfig = { field: 'relevance' as const, direction: 'desc' as const };

      await act(async () => {
        await result.current.performAdvancedSearch(query, sortConfig);
      });

      expect(result.current.error).toBe('Search failed');
      expect(result.current.isSearching).toBe(false);
      expect(mockShowToast).toHaveBeenCalledWith({
        type: 'error',
        title: 'Search Error',
        message: 'Search failed',
        duration: 5000,
      });
    });

    it('should set loading state during search', async () => {
      let resolvePost: (value: any) => void;
      const postPromise = new Promise(resolve => {
        resolvePost = resolve;
      });

      mockPost.mockReturnValueOnce(postPromise);

      const { result } = renderHook(() => 
        useWhiteboardSearch('workspace-1', 'user-1')
      );

      const query = {
        query: 'test query',
        syntaxType: 'natural' as const,
        searchFields: ['all'],
      };

      const sortConfig = { field: 'relevance' as const, direction: 'desc' as const };

      // Start search
      act(() => {
        result.current.performAdvancedSearch(query, sortConfig);
      });

      // Should be loading
      expect(result.current.isSearching).toBe(true);
      expect(result.current.error).toBeNull();

      // Resolve the promise
      await act(async () => {
        resolvePost!({
          data: { items: [], total: 0 },
          analytics: null,
        });
        await postPromise;
      });

      // Should not be loading anymore
      expect(result.current.isSearching).toBe(false);
    });
  });

  describe('Full Text Search', () => {
    it('should perform full text search successfully', async () => {
      const mockResponse = {
        data: {
          items: [{ id: '1', title: 'Test Whiteboard' }],
          total: 1,
        },
        analytics: { executionTime: 100 },
      };

      mockPost.mockResolvedValueOnce(mockResponse);

      const { result } = renderHook(() => 
        useWhiteboardSearch('workspace-1', 'user-1')
      );

      await act(async () => {
        await result.current.performFullTextSearch('test query', {});
      });

      expect(mockPost).toHaveBeenCalledWith('/api/whiteboard/search/fulltext', {
        query: 'test query',
        filters: {},
        pagination: { limit: 20, offset: 0 },
        userId: 'user-1',
        workspaceId: 'workspace-1',
      }, expect.any(Object));

      expect(result.current.searchResults).toEqual(mockResponse.data);
    });
  });

  describe('Rate Limiting', () => {
    it('should prevent searches when rate limited', async () => {
      const { result } = renderHook(() => 
        useWhiteboardSearch('workspace-1', 'user-1')
      );

      // Mock the rate limiting by calling multiple searches rapidly
      const query = {
        query: 'test',
        syntaxType: 'natural' as const,
        searchFields: ['all'],
      };
      const sortConfig = { field: 'relevance' as const, direction: 'desc' as const };

      // First few searches should work (mocking that they don't trigger rate limit)
      mockPost.mockResolvedValue({ data: { items: [], total: 0 } });

      // Simulate rate limiting by making many rapid calls
      const promises: Promise<void>[] = [];
      for (let i = 0; i < 35; i++) {
        promises.push(result.current.performAdvancedSearch(query, sortConfig));
      }

      await act(async () => {
        await Promise.all(promises);
      });

      // At some point, rate limiting should kick in
      await waitFor(() => {
        expect(result.current.error).toContain('Too many search requests');
      }, { timeout: 1000 });
    });
  });

  describe('Clear Results', () => {
    it('should clear search results and reset state', async () => {
      const { result } = renderHook(() => 
        useWhiteboardSearch('workspace-1', 'user-1')
      );

      // First perform a search
      mockPost.mockResolvedValueOnce({
        data: { items: [{ id: '1', title: 'Test' }], total: 1 },
        analytics: { executionTime: 100 },
      });

      await act(async () => {
        await result.current.performAdvancedSearch(
          { query: 'test', syntaxType: 'natural', searchFields: ['all'] },
          { field: 'relevance', direction: 'desc' }
        );
      });

      // Verify search results exist
      expect(result.current.searchResults).not.toBeNull();
      expect(result.current.lastSearchQuery).toBe('test');

      // Clear results
      act(() => {
        result.current.clearResults();
      });

      // Verify state is reset
      expect(result.current.searchResults).toBeNull();
      expect(result.current.isSearching).toBe(false);
      expect(result.current.error).toBeNull();
      expect(result.current.searchAnalytics).toBeNull();
      expect(result.current.lastSearchQuery).toBeNull();
    });
  });

  describe('Auto Retry', () => {
    it('should retry failed network requests automatically', async () => {
      vi.useFakeTimers();
      
      const networkError = { message: 'Network Error' };
      
      // First call fails, second succeeds
      mockPost
        .mockRejectedValueOnce(networkError)
        .mockResolvedValueOnce({
          data: { items: [], total: 0 },
          analytics: null,
        });

      const { result } = renderHook(() => 
        useWhiteboardSearch('workspace-1', 'user-1', { autoRetry: true, maxRetries: 1 })
      );

      const query = {
        query: 'test',
        syntaxType: 'natural' as const,
        searchFields: ['all'],
      };
      const sortConfig = { field: 'relevance' as const, direction: 'desc' as const };

      await act(async () => {
        result.current.performAdvancedSearch(query, sortConfig);
        
        // Fast forward the retry timer
        vi.advanceTimersByTime(1000);
        
        // Wait for retry to complete
        await waitFor(() => {
          expect(mockPost).toHaveBeenCalledTimes(2);
        });
      });

      vi.useRealTimers();
    });

    it('should not retry non-network errors', async () => {
      const validationError = {
        response: { status: 400, data: { message: 'Invalid query' } },
      };

      mockPost.mockRejectedValueOnce(validationError);

      const { result } = renderHook(() => 
        useWhiteboardSearch('workspace-1', 'user-1', { autoRetry: true })
      );

      await act(async () => {
        await result.current.performAdvancedSearch(
          { query: 'test', syntaxType: 'natural', searchFields: ['all'] },
          { field: 'relevance', direction: 'desc' }
        );
      });

      expect(mockPost).toHaveBeenCalledTimes(1);
      expect(result.current.error).toBe('Invalid query');
    });
  });

  describe('Request Cancellation', () => {
    it('should cancel previous request when new search is initiated', async () => {
      const { result } = renderHook(() => 
        useWhiteboardSearch('workspace-1', 'user-1')
      );

      let firstRequestController: AbortController;
      let secondRequestController: AbortController;

      mockPost
        .mockImplementationOnce(async (url, data, config) => {
          firstRequestController = config.signal;
          return new Promise(resolve => {
            setTimeout(() => resolve({ data: { items: [], total: 0 } }), 1000);
          });
        })
        .mockImplementationOnce(async (url, data, config) => {
          secondRequestController = config.signal;
          return { data: { items: [], total: 0 } };
        });

      const query = {
        query: 'first search',
        syntaxType: 'natural' as const,
        searchFields: ['all'],
      };
      const sortConfig = { field: 'relevance' as const, direction: 'desc' as const };

      // Start first search
      act(() => {
        result.current.performAdvancedSearch(query, sortConfig);
      });

      // Start second search immediately
      await act(async () => {
        await result.current.performAdvancedSearch(
          { ...query, query: 'second search' },
          sortConfig
        );
      });

      // First request should be aborted
      expect(firstRequestController!.signal.aborted).toBe(true);
      expect(secondRequestController!.signal.aborted).toBe(false);
    });
  });
});