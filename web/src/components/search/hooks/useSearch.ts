/**
 * Main Search Hook
 * 
 * Core hook for search functionality with debouncing, caching, and state management
 */

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { 
  UnifiedSearchRequest, 
  UnifiedSearchResponse,
  SearchFilters,
  SearchSort,
  SearchResult
} from '@mcp-tools/core';
import { 
  UseSearchOptions,
  UseSearchReturn,
  PaginationData,
  SearchState,
  DEFAULT_PAGINATION,
  DEFAULT_SEARCH_FILTERS
} from '../types';
import { 
  performSearch, 
  recordSearchQuery,
  SearchAPIError 
} from '../utils/searchAPI';
import { 
  debounce, 
  normalizeQuery, 
  calculatePagination 
} from '../utils/searchHelpers';

/**
 * Main search hook providing comprehensive search functionality
 */
export function useSearch(options: UseSearchOptions = {}): UseSearchReturn {
  const {
    initialQuery = '',
    initialFilters = DEFAULT_SEARCH_FILTERS,
    autoSearch = false,
    debounceMs = 300,
    enableAnalytics = true,
    enableCache = true,
    maxRetries = 3
  } = options;

  // ========================================================================
  // State Management
  // ========================================================================

  const [state, setState] = useState<SearchState>({
    query: initialQuery,
    filters: initialFilters,
    sort: 'relevance' as SearchSort,
    pagination: DEFAULT_PAGINATION,
    results: [],
    isLoading: false,
    error: null,
    lastSearch: null
  });

  // Additional state for analytics and performance
  const [searchCount, setSearchCount] = useState(0);
  const [lastSearchTime, setLastSearchTime] = useState<number | null>(null);
  const [aggregations, setAggregations] = useState(null);

  // Refs for handling cancellation and retries
  const abortControllerRef = useRef<AbortController | null>(null);
  const retryCountRef = useRef(0);
  const searchCacheRef = useRef<Map<string, UnifiedSearchResponse>>(new Map());

  // ========================================================================
  // Core Search Function
  // ========================================================================

  const executeSearch = useCallback(async (
    query: string,
    filters: SearchFilters,
    sort: SearchSort,
    page: number,
    itemsPerPage: number
  ): Promise<void> => {
    // Cancel any ongoing search
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new abort controller
    abortControllerRef.current = new AbortController();

    const startTime = performance.now();
    const normalizedQuery = normalizeQuery(query);

    // Don't search empty queries
    if (!normalizedQuery && Object.keys(filters).length === 0) {
      setState(prev => ({
        ...prev,
        results: [],
        totalCount: 0,
        error: null,
        isLoading: false,
        pagination: DEFAULT_PAGINATION
      }));
      return;
    }

    // Set loading state
    setState(prev => ({
      ...prev,
      isLoading: true,
      error: null
    }));

    try {
      // Build search request
      const searchRequest: UnifiedSearchRequest = {
        query: normalizedQuery,
        filters,
        sort,
        pagination: {
          page,
          limit: itemsPerPage,
          offset: (page - 1) * itemsPerPage
        },
        use_semantic: true,
        use_fuzzy: true,
        include_preview: true,
        include_highlights: true
      };

      // Check cache if enabled
      const cacheKey = JSON.stringify(searchRequest);
      if (enableCache && searchCacheRef.current.has(cacheKey)) {
        const cachedResponse = searchCacheRef.current.get(cacheKey)!;
        const endTime = performance.now();
        
        setState(prev => ({
          ...prev,
          results: cachedResponse.results,
          isLoading: false,
          error: null,
          pagination: calculatePagination(
            cachedResponse.total_count,
            page,
            itemsPerPage
          ),
          lastSearch: new Date()
        }));

        setAggregations(cachedResponse.aggregations);
        setLastSearchTime(endTime - startTime);
        setSearchCount(prev => prev + 1);
        return;
      }

      // Perform search
      const response = await performSearch(searchRequest);
      const endTime = performance.now();
      const searchTime = endTime - startTime;

      // Cache the response
      if (enableCache) {
        // Limit cache size to 100 entries
        if (searchCacheRef.current.size >= 100) {
          const firstKey = searchCacheRef.current.keys().next().value;
          searchCacheRef.current.delete(firstKey);
        }
        searchCacheRef.current.set(cacheKey, response);
      }

      // Update state with results
      setState(prev => ({
        ...prev,
        results: response.results,
        isLoading: false,
        error: null,
        pagination: calculatePagination(
          response.total_count,
          page,
          itemsPerPage
        ),
        lastSearch: new Date()
      }));

      setAggregations(response.aggregations);
      setLastSearchTime(searchTime);
      setSearchCount(prev => prev + 1);
      retryCountRef.current = 0;

      // Record analytics if enabled
      if (enableAnalytics) {
        await recordSearchQuery(
          normalizedQuery,
          response.results.length,
          response.performance.processing_time_ms
        ).catch(console.warn);
      }

    } catch (error) {
      // Handle cancellation
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }

      const endTime = performance.now();
      setLastSearchTime(endTime - startTime);

      // Handle retries for non-validation errors
      if (
        retryCountRef.current < maxRetries &&
        !(error instanceof SearchAPIError && error.status === 400)
      ) {
        retryCountRef.current++;
        
        // Exponential backoff
        const delay = Math.pow(2, retryCountRef.current) * 1000;
        setTimeout(() => {
          executeSearch(query, filters, sort, page, itemsPerPage);
        }, delay);
        
        return;
      }

      // Set error state
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Search failed'
      }));
    }
  }, [enableAnalytics, enableCache, maxRetries]);

  // ========================================================================
  // Debounced Search
  // ========================================================================

  const debouncedSearch = useMemo(
    () => debounce(executeSearch, debounceMs),
    [executeSearch, debounceMs]
  );

  // ========================================================================
  // Public API Functions
  // ========================================================================

  const performSearchAction = useCallback(async (): Promise<void> => {
    await executeSearch(
      state.query,
      state.filters,
      state.sort,
      state.pagination.currentPage,
      state.pagination.itemsPerPage
    );
  }, [executeSearch, state.query, state.filters, state.sort, state.pagination.currentPage, state.pagination.itemsPerPage]);

  const setQuery = useCallback((query: string) => {
    setState(prev => ({ ...prev, query }));
    
    if (autoSearch) {
      debouncedSearch(
        query,
        state.filters,
        state.sort,
        1, // Reset to first page on new query
        state.pagination.itemsPerPage
      );
    }
  }, [autoSearch, debouncedSearch, state.filters, state.sort, state.pagination.itemsPerPage]);

  const setFilters = useCallback((filters: SearchFilters) => {
    setState(prev => ({ 
      ...prev, 
      filters,
      pagination: { ...prev.pagination, currentPage: 1 } // Reset to first page
    }));
    
    if (autoSearch && state.query) {
      debouncedSearch(
        state.query,
        filters,
        state.sort,
        1,
        state.pagination.itemsPerPage
      );
    }
  }, [autoSearch, debouncedSearch, state.query, state.sort, state.pagination.itemsPerPage]);

  const changeSort = useCallback((sort: SearchSort) => {
    setState(prev => ({ 
      ...prev, 
      sort,
      pagination: { ...prev.pagination, currentPage: 1 } // Reset to first page
    }));
    
    if (autoSearch && state.query) {
      debouncedSearch(
        state.query,
        state.filters,
        sort,
        1,
        state.pagination.itemsPerPage
      );
    }
  }, [autoSearch, debouncedSearch, state.query, state.filters, state.pagination.itemsPerPage]);

  const goToPage = useCallback((page: number) => {
    setState(prev => ({ 
      ...prev, 
      pagination: { ...prev.pagination, currentPage: page } 
    }));
    
    if (state.query) {
      executeSearch(
        state.query,
        state.filters,
        state.sort,
        page,
        state.pagination.itemsPerPage
      );
    }
  }, [executeSearch, state.query, state.filters, state.sort, state.pagination.itemsPerPage]);

  const changePageSize = useCallback((itemsPerPage: number) => {
    setState(prev => ({ 
      ...prev, 
      pagination: { 
        ...prev.pagination, 
        itemsPerPage, 
        currentPage: 1 // Reset to first page
      } 
    }));
    
    if (state.query) {
      executeSearch(
        state.query,
        state.filters,
        state.sort,
        1,
        itemsPerPage
      );
    }
  }, [executeSearch, state.query, state.filters, state.sort]);

  const clearResults = useCallback(() => {
    // Cancel any ongoing search
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    setState(prev => ({
      ...prev,
      results: [],
      pagination: DEFAULT_PAGINATION,
      error: null,
      isLoading: false
    }));
    
    setAggregations(null);
    searchCacheRef.current.clear();
  }, []);

  const retrySearch = useCallback(() => {
    retryCountRef.current = 0;
    performSearchAction();
  }, [performSearchAction]);

  // ========================================================================
  // Auto-search Effect
  // ========================================================================

  useEffect(() => {
    if (autoSearch && initialQuery) {
      debouncedSearch(
        initialQuery,
        initialFilters,
        state.sort,
        1,
        state.pagination.itemsPerPage
      );
    }
  }, []); // Only run on mount

  // ========================================================================
  // Cleanup Effect
  // ========================================================================

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // ========================================================================
  // Return API
  // ========================================================================

  return {
    // State
    query: state.query,
    filters: state.filters,
    results: state.results,
    totalCount: state.pagination.totalItems,
    isLoading: state.isLoading,
    error: state.error,
    pagination: state.pagination,
    aggregations,
    
    // Actions
    setQuery,
    setFilters,
    performSearch: performSearchAction,
    clearResults,
    retrySearch,
    
    // Pagination
    goToPage,
    changePageSize,
    
    // Sorting
    changeSort,
    
    // Performance metrics
    lastSearchTime,
    searchCount
  };
}