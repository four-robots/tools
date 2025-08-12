import { useState, useEffect, useCallback, useRef } from 'react';
import { SearchSuggestion } from '@shared/types/whiteboard';
import { useApi } from './use-api';
import { useDebounce } from './useDebounce';

export interface SearchSuggestionsState {
  suggestions: SearchSuggestion[];
  isLoadingSuggestions: boolean;
  error: string | null;
  lastQuery: string | null;
}

export interface SearchSuggestionsActions {
  generateSuggestions: (partialQuery: string) => Promise<void>;
  clearSuggestions: () => void;
  invalidateCache: () => void;
  recordSuggestionUsage: (suggestion: SearchSuggestion) => Promise<void>;
}

export function useSearchSuggestions(
  workspaceId: string,
  userId: string,
  options: {
    debounceMs?: number;
    maxSuggestions?: number;
    enableCaching?: boolean;
    enablePersonalization?: boolean;
  } = {}
): SearchSuggestionsState & SearchSuggestionsActions {
  const [state, setState] = useState<SearchSuggestionsState>({
    suggestions: [],
    isLoadingSuggestions: false,
    error: null,
    lastQuery: null,
  });

  const { post } = useApi();
  const abortControllerRef = useRef<AbortController>();
  const cacheRef = useRef<Map<string, { suggestions: SearchSuggestion[]; timestamp: number }>>(
    new Map()
  );

  const {
    debounceMs = 300,
    maxSuggestions = 10,
    enableCaching = true,
    enablePersonalization = true,
  } = options;

  // Rate limiting for suggestions
  const lastSuggestionRequestRef = useRef(0);
  const suggestionRequestCountRef = useRef(0);
  const SUGGESTION_RATE_LIMIT = 50; // Max 50 suggestion requests per minute
  const SUGGESTION_RATE_WINDOW = 60000; // 1 minute window

  /**
   * Check if suggestion request should be rate limited
   */
  const isSuggestionRateLimited = useCallback((): boolean => {
    const now = Date.now();
    const timeSinceLastRequest = now - lastSuggestionRequestRef.current;
    
    // Reset counter if window has passed
    if (timeSinceLastRequest > SUGGESTION_RATE_WINDOW) {
      suggestionRequestCountRef.current = 0;
    }

    return suggestionRequestCountRef.current >= SUGGESTION_RATE_LIMIT;
  }, []);

  /**
   * Update suggestion rate limiting counters
   */
  const updateSuggestionRateLimiting = useCallback((): void => {
    lastSuggestionRequestRef.current = Date.now();
    suggestionRequestCountRef.current += 1;
  }, []);

  /**
   * Generate cache key for suggestions
   */
  const generateCacheKey = useCallback((query: string): string => {
    return `${workspaceId}-${userId}-${query.toLowerCase().trim()}`;
  }, [workspaceId, userId]);

  /**
   * Check if cached suggestions are still valid
   */
  const isCacheValid = useCallback((timestamp: number): boolean => {
    const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
    return Date.now() - timestamp < CACHE_TTL;
  }, []);

  /**
   * Get suggestions from cache
   */
  const getCachedSuggestions = useCallback((query: string): SearchSuggestion[] | null => {
    if (!enableCaching) return null;

    const cacheKey = generateCacheKey(query);
    const cached = cacheRef.current.get(cacheKey);
    
    if (cached && isCacheValid(cached.timestamp)) {
      return cached.suggestions;
    }
    
    return null;
  }, [enableCaching, generateCacheKey, isCacheValid]);

  /**
   * Cache suggestions
   */
  const cacheSuggestions = useCallback((query: string, suggestions: SearchSuggestion[]): void => {
    if (!enableCaching) return;

    const cacheKey = generateCacheKey(query);
    cacheRef.current.set(cacheKey, {
      suggestions,
      timestamp: Date.now(),
    });

    // Cleanup old cache entries
    if (cacheRef.current.size > 100) {
      const entries = Array.from(cacheRef.current.entries());
      const sortedEntries = entries.sort((a, b) => b[1].timestamp - a[1].timestamp);
      
      // Keep only the 50 most recent entries
      cacheRef.current.clear();
      sortedEntries.slice(0, 50).forEach(([key, value]) => {
        cacheRef.current.set(key, value);
      });
    }
  }, [enableCaching, generateCacheKey]);

  /**
   * Fetch suggestions from API
   */
  const fetchSuggestionsFromAPI = useCallback(async (query: string): Promise<SearchSuggestion[]> => {
    try {
      const requestPayload = {
        partialQuery: query,
        workspaceId,
        userId,
        maxSuggestions,
        enablePersonalization,
        includeRecentQueries: true,
        includePopularTerms: true,
        includeTagSuggestions: true,
        includeUserSuggestions: true,
      };

      const response = await post('/api/whiteboard/search/suggestions', requestPayload, {
        signal: abortControllerRef.current?.signal,
      });

      return response.data?.suggestions || [];
    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw error; // Re-throw to handle properly
      }

      console.error('Failed to fetch search suggestions:', error);
      throw new Error(error?.response?.data?.message || 'Failed to load suggestions');
    }
  }, [workspaceId, userId, maxSuggestions, enablePersonalization, post]);

  /**
   * Generate search suggestions for partial query
   */
  const generateSuggestions = useCallback(async (partialQuery: string): Promise<void> => {
    // Validate input
    if (!partialQuery || partialQuery.trim().length < 2) {
      setState(prev => ({
        ...prev,
        suggestions: [],
        isLoadingSuggestions: false,
        error: null,
        lastQuery: partialQuery,
      }));
      return;
    }

    // Check rate limiting
    if (isSuggestionRateLimited()) {
      setState(prev => ({
        ...prev,
        error: 'Too many suggestion requests. Please slow down.',
        isLoadingSuggestions: false,
      }));
      return;
    }

    const trimmedQuery = partialQuery.trim();

    // Check cache first
    const cachedSuggestions = getCachedSuggestions(trimmedQuery);
    if (cachedSuggestions) {
      setState(prev => ({
        ...prev,
        suggestions: cachedSuggestions,
        isLoadingSuggestions: false,
        error: null,
        lastQuery: trimmedQuery,
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
      isLoadingSuggestions: true,
      error: null,
      lastQuery: trimmedQuery,
    }));

    updateSuggestionRateLimiting();

    try {
      const suggestions = await fetchSuggestionsFromAPI(trimmedQuery);

      if (abortControllerRef.current?.signal.aborted) {
        return;
      }

      // Cache the results
      cacheSuggestions(trimmedQuery, suggestions);

      setState(prev => ({
        ...prev,
        suggestions,
        isLoadingSuggestions: false,
        error: null,
      }));
    } catch (error: any) {
      if (error.name === 'AbortError') {
        return; // Request was cancelled, do nothing
      }

      setState(prev => ({
        ...prev,
        suggestions: [],
        isLoadingSuggestions: false,
        error: error.message,
      }));
    }
  }, [
    isSuggestionRateLimited,
    getCachedSuggestions,
    updateSuggestionRateLimiting,
    fetchSuggestionsFromAPI,
    cacheSuggestions,
  ]);

  /**
   * Clear all suggestions and reset state
   */
  const clearSuggestions = useCallback(() => {
    // Cancel any pending requests
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    setState({
      suggestions: [],
      isLoadingSuggestions: false,
      error: null,
      lastQuery: null,
    });
  }, []);

  /**
   * Invalidate suggestion cache
   */
  const invalidateCache = useCallback(() => {
    cacheRef.current.clear();
  }, []);

  /**
   * Record suggestion usage for personalization
   */
  const recordSuggestionUsage = useCallback(async (suggestion: SearchSuggestion): Promise<void> => {
    if (!enablePersonalization) return;

    try {
      await post('/api/whiteboard/search/suggestions/usage', {
        suggestionId: suggestion.id,
        suggestionText: suggestion.text,
        suggestionType: suggestion.type,
        workspaceId,
        userId,
      });
    } catch (error) {
      // Non-critical operation, just log the error
      console.warn('Failed to record suggestion usage:', error);
    }
  }, [enablePersonalization, post, workspaceId, userId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Auto-cleanup old cache entries periodically
  useEffect(() => {
    const cleanup = setInterval(() => {
      const now = Date.now();
      const entriesToDelete: string[] = [];

      cacheRef.current.forEach((value, key) => {
        if (!isCacheValid(value.timestamp)) {
          entriesToDelete.push(key);
        }
      });

      entriesToDelete.forEach(key => {
        cacheRef.current.delete(key);
      });
    }, 10 * 60 * 1000); // Cleanup every 10 minutes

    return () => clearInterval(cleanup);
  }, [isCacheValid]);

  return {
    ...state,
    generateSuggestions,
    clearSuggestions,
    invalidateCache,
    recordSuggestionUsage,
  };
}