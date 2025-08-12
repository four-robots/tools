import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  AdvancedSearchQuery, 
  PaginatedSearchResults,
  SearchResultWithHighlights,
  SearchSortType,
  SearchAnalytics,
} from '@shared/types/whiteboard';
import { useApi } from './use-api';
import { useToast } from './use-toast';

export interface WhiteboardSearchState {
  searchResults: PaginatedSearchResults | null;
  isSearching: boolean;
  error: string | null;
  searchAnalytics: SearchAnalytics | null;
  lastSearchQuery: string | null;
}

export interface WhiteboardSearchActions {
  performAdvancedSearch: (
    query: AdvancedSearchQuery,
    sortConfig: { field: SearchSortType; direction: 'asc' | 'desc' },
    limit?: number,
    offset?: number
  ) => Promise<void>;
  performFullTextSearch: (
    queryText: string,
    filters: Record<string, any>,
    limit?: number,
    offset?: number
  ) => Promise<void>;
  clearResults: () => void;
  retrySearch: () => Promise<void>;
}

export function useWhiteboardSearch(
  workspaceId: string,
  userId: string,
  options: {
    enableRealTime?: boolean;
    autoRetry?: boolean;
    maxRetries?: number;
  } = {}
): WhiteboardSearchState & WhiteboardSearchActions {
  const [state, setState] = useState<WhiteboardSearchState>({
    searchResults: null,
    isSearching: false,
    error: null,
    searchAnalytics: null,
    lastSearchQuery: null,
  });

  const { post } = useApi();
  const { showToast } = useToast();
  const retryCountRef = useRef(0);
  const lastSearchRef = useRef<() => Promise<void>>();
  const abortControllerRef = useRef<AbortController>();

  const {
    enableRealTime = true,
    autoRetry = true,
    maxRetries = 3,
  } = options;

  // Rate limiting state
  const lastRequestTimeRef = useRef(0);
  const requestCountRef = useRef(0);
  const RATE_LIMIT_WINDOW = 60000; // 1 minute
  const RATE_LIMIT_MAX_REQUESTS = 30;
  const MIN_REQUEST_INTERVAL = 300; // 300ms between requests

  /**
   * Check if request should be rate limited
   */
  const isRateLimited = useCallback((): boolean => {
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTimeRef.current;
    
    // Reset counter if window has passed
    if (timeSinceLastRequest > RATE_LIMIT_WINDOW) {
      requestCountRef.current = 0;
    }

    // Check if too many requests in window
    if (requestCountRef.current >= RATE_LIMIT_MAX_REQUESTS) {
      return true;
    }

    // Check minimum interval between requests
    if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
      return true;
    }

    return false;
  }, []);

  /**
   * Update rate limiting counters
   */
  const updateRateLimiting = useCallback((): void => {
    lastRequestTimeRef.current = Date.now();
    requestCountRef.current += 1;
  }, []);

  /**
   * Handle search errors with retry logic
   */
  const handleSearchError = useCallback((error: any, searchFunction?: () => Promise<void>) => {
    console.error('Whiteboard search error:', error);
    
    const errorMessage = error?.response?.data?.message || error?.message || 'Search failed. Please try again.';
    
    setState(prev => ({
      ...prev,
      error: errorMessage,
      isSearching: false,
    }));

    // Auto retry on network errors
    if (autoRetry && retryCountRef.current < maxRetries && searchFunction) {
      const isNetworkError = !error?.response || error?.response?.status >= 500;
      if (isNetworkError) {
        setTimeout(() => {
          retryCountRef.current += 1;
          searchFunction();
        }, Math.pow(2, retryCountRef.current) * 1000); // Exponential backoff
      }
    }

    // Show user-friendly error message
    if (errorMessage !== 'Search cancelled') {
      showToast({
        type: 'error',
        title: 'Search Error',
        message: errorMessage,
        duration: 5000,
      });
    }
  }, [autoRetry, maxRetries, showToast]);

  /**
   * Perform advanced search with full query configuration
   */
  const performAdvancedSearch = useCallback(async (
    query: AdvancedSearchQuery,
    sortConfig: { field: SearchSortType; direction: 'asc' | 'desc' },
    limit: number = 20,
    offset: number = 0
  ): Promise<void> => {
    // Check rate limiting
    if (isRateLimited()) {
      setState(prev => ({
        ...prev,
        error: 'Too many search requests. Please wait a moment.',
        isSearching: false,
      }));
      return;
    }

    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new abort controller
    abortControllerRef.current = new AbortController();

    setState(prev => ({
      ...prev,
      isSearching: true,
      error: null,
      lastSearchQuery: query.query,
    }));

    updateRateLimiting();

    const searchFunction = async () => {
      try {
        const requestPayload = {
          query,
          sortConfig,
          pagination: { limit, offset },
          userId,
          workspaceId,
        };

        const response = await post('/api/whiteboard/search/advanced', requestPayload, {
          signal: abortControllerRef.current?.signal,
        });

        if (abortControllerRef.current?.signal.aborted) {
          return;
        }

        setState(prev => ({
          ...prev,
          searchResults: response.data,
          searchAnalytics: response.analytics || null,
          isSearching: false,
          error: null,
        }));

        retryCountRef.current = 0; // Reset retry count on success
      } catch (error: any) {
        if (error.name === 'AbortError') {
          setState(prev => ({ ...prev, error: 'Search cancelled', isSearching: false }));
          return;
        }
        handleSearchError(error, searchFunction);
      }
    };

    lastSearchRef.current = searchFunction;
    await searchFunction();
  }, [workspaceId, userId, post, isRateLimited, updateRateLimiting, handleSearchError]);

  /**
   * Perform full-text search with simplified interface
   */
  const performFullTextSearch = useCallback(async (
    queryText: string,
    filters: Record<string, any> = {},
    limit: number = 20,
    offset: number = 0
  ): Promise<void> => {
    // Check rate limiting
    if (isRateLimited()) {
      setState(prev => ({
        ...prev,
        error: 'Too many search requests. Please wait a moment.',
        isSearching: false,
      }));
      return;
    }

    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new abort controller
    abortControllerRef.current = new AbortController();

    setState(prev => ({
      ...prev,
      isSearching: true,
      error: null,
      lastSearchQuery: queryText,
    }));

    updateRateLimiting();

    const searchFunction = async () => {
      try {
        const requestPayload = {
          query: queryText,
          filters,
          pagination: { limit, offset },
          userId,
          workspaceId,
        };

        const response = await post('/api/whiteboard/search/fulltext', requestPayload, {
          signal: abortControllerRef.current?.signal,
        });

        if (abortControllerRef.current?.signal.aborted) {
          return;
        }

        setState(prev => ({
          ...prev,
          searchResults: response.data,
          searchAnalytics: response.analytics || null,
          isSearching: false,
          error: null,
        }));

        retryCountRef.current = 0; // Reset retry count on success
      } catch (error: any) {
        if (error.name === 'AbortError') {
          setState(prev => ({ ...prev, error: 'Search cancelled', isSearching: false }));
          return;
        }
        handleSearchError(error, searchFunction);
      }
    };

    lastSearchRef.current = searchFunction;
    await searchFunction();
  }, [workspaceId, userId, post, isRateLimited, updateRateLimiting, handleSearchError]);

  /**
   * Clear search results and reset state
   */
  const clearResults = useCallback(() => {
    // Cancel any pending requests
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    setState({
      searchResults: null,
      isSearching: false,
      error: null,
      searchAnalytics: null,
      lastSearchQuery: null,
    });

    retryCountRef.current = 0;
    lastSearchRef.current = undefined;
  }, []);

  /**
   * Retry the last search operation
   */
  const retrySearch = useCallback(async (): Promise<void> => {
    if (lastSearchRef.current) {
      setState(prev => ({ ...prev, error: null }));
      retryCountRef.current = 0;
      await lastSearchRef.current();
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Real-time updates (if enabled)
  useEffect(() => {
    if (!enableRealTime || !workspaceId) return;

    // This would connect to WebSocket for real-time search result updates
    // Implementation depends on the real-time infrastructure setup
    // For now, we'll just log that real-time is enabled
    console.log('Real-time search updates enabled for workspace:', workspaceId);

    return () => {
      // Cleanup real-time connections
    };
  }, [enableRealTime, workspaceId]);

  return {
    ...state,
    performAdvancedSearch,
    performFullTextSearch,
    clearResults,
    retrySearch,
  };
}