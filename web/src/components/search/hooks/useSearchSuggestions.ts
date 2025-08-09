/**
 * Search Suggestions Hook
 * 
 * Hook for managing search autocomplete and suggestions
 */

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { 
  UseSearchSuggestionsReturn,
  SearchSuggestion 
} from '../types';
import { 
  getSearchSuggestions, 
  getPopularQueries 
} from '../utils/searchAPI';
import { 
  debounce,
  generateQuerySuggestions,
  normalizeQuery 
} from '../utils/searchHelpers';

interface UseSearchSuggestionsOptions {
  debounceMs?: number;
  maxSuggestions?: number;
  includePopular?: boolean;
  includeGenerated?: boolean;
  enableCaching?: boolean;
  minQueryLength?: number;
}

/**
 * Hook for managing search suggestions and autocomplete
 */
export function useSearchSuggestions(
  options: UseSearchSuggestionsOptions = {}
): UseSearchSuggestionsReturn {
  const {
    debounceMs = 200,
    maxSuggestions = 8,
    includePopular = true,
    includeGenerated = true,
    enableCaching = true,
    minQueryLength = 2
  } = options;

  // ========================================================================
  // State Management
  // ========================================================================

  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [popularQueries, setPopularQueries] = useState<SearchSuggestion[]>([]);

  // Refs for caching and request management
  const cacheRef = useRef<Map<string, SearchSuggestion[]>>(new Map());
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastQueryRef = useRef<string>('');

  // ========================================================================
  // Core Suggestion Fetching
  // ========================================================================

  const fetchSuggestionsInternal = useCallback(async (query: string): Promise<void> => {
    const normalizedQuery = normalizeQuery(query);
    
    // Don't fetch for empty or too short queries
    if (!normalizedQuery || normalizedQuery.length < minQueryLength) {
      setSuggestions(includePopular ? popularQueries : []);
      setError(null);
      setIsLoading(false);
      return;
    }

    // Cancel any ongoing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();
    lastQueryRef.current = normalizedQuery;

    // Check cache first
    const cacheKey = normalizedQuery.toLowerCase();
    if (enableCaching && cacheRef.current.has(cacheKey)) {
      const cachedSuggestions = cacheRef.current.get(cacheKey)!;
      setSuggestions(cachedSuggestions);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Fetch API suggestions
      const apiSuggestions = await getSearchSuggestions(
        normalizedQuery,
        Math.floor(maxSuggestions * 0.7) // Reserve some space for generated suggestions
      );

      // Generate additional suggestions if enabled
      const generatedSuggestions = includeGenerated
        ? generateQuerySuggestions(normalizedQuery, apiSuggestions)
        : apiSuggestions;

      // Combine with popular queries if query is short
      let combinedSuggestions = generatedSuggestions;
      if (includePopular && normalizedQuery.length <= 3) {
        const relevantPopular = popularQueries.filter(popular =>
          popular.query.toLowerCase().includes(normalizedQuery.toLowerCase())
        );
        combinedSuggestions = [
          ...generatedSuggestions,
          ...relevantPopular.slice(0, Math.floor(maxSuggestions * 0.3))
        ];
      }

      // Remove duplicates and sort by confidence
      const uniqueSuggestions = combinedSuggestions
        .filter((suggestion, index, array) =>
          array.findIndex(s => s.query.toLowerCase() === suggestion.query.toLowerCase()) === index
        )
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, maxSuggestions);

      // Cache the result
      if (enableCaching) {
        // Limit cache size
        if (cacheRef.current.size >= 50) {
          const firstKey = cacheRef.current.keys().next().value;
          cacheRef.current.delete(firstKey);
        }
        cacheRef.current.set(cacheKey, uniqueSuggestions);
      }

      setSuggestions(uniqueSuggestions);
      setError(null);

    } catch (err) {
      // Handle cancellation gracefully
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }

      console.warn('Error fetching search suggestions:', err);
      
      // Fall back to generated suggestions
      if (includeGenerated) {
        const fallbackSuggestions = generateQuerySuggestions(normalizedQuery)
          .slice(0, maxSuggestions);
        setSuggestions(fallbackSuggestions);
      } else {
        setSuggestions([]);
      }
      
      setError('Failed to fetch suggestions');
    } finally {
      setIsLoading(false);
    }
  }, [
    minQueryLength,
    includePopular,
    includeGenerated,
    enableCaching,
    maxSuggestions,
    popularQueries
  ]);

  // ========================================================================
  // Debounced Suggestion Fetching
  // ========================================================================

  const debouncedFetchSuggestions = useMemo(
    () => debounce(fetchSuggestionsInternal, debounceMs),
    [fetchSuggestionsInternal, debounceMs]
  );

  // ========================================================================
  // Public API Functions
  // ========================================================================

  const fetchSuggestions = useCallback(async (query: string): Promise<void> => {
    debouncedFetchSuggestions(query);
  }, [debouncedFetchSuggestions]);

  const clearSuggestions = useCallback(() => {
    // Cancel any ongoing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    setSuggestions([]);
    setError(null);
    setIsLoading(false);
    lastQueryRef.current = '';
  }, []);

  const refreshPopularQueries = useCallback(async () => {
    try {
      const popular = await getPopularQueries(20);
      setPopularQueries(popular);
    } catch (err) {
      console.warn('Failed to fetch popular queries:', err);
    }
  }, []);

  // ========================================================================
  // Load Popular Queries on Mount
  // ========================================================================

  useEffect(() => {
    if (includePopular) {
      refreshPopularQueries();
    }
  }, [includePopular, refreshPopularQueries]);

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
    suggestions,
    isLoading,
    error,
    fetchSuggestions,
    clearSuggestions
  };
}