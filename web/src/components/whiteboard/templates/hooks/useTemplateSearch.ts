import { useState, useCallback, useRef, useMemo } from 'react';
import { WhiteboardTemplate } from '@/types/whiteboard';
import { useAuth } from '@/hooks/useAuth';
import { debounce } from 'lodash-es';

interface TemplateSearchFilters {
  category?: string[];
  tags?: string[];
  minRating?: number;
  minUsage?: number;
  isPublic?: boolean;
  workspaceId?: string;
  createdAfter?: string;
  createdBefore?: string;
}

interface TemplateSearchSort {
  field: 'name' | 'rating' | 'usage' | 'created' | 'updated';
  direction: 'asc' | 'desc';
}

interface TemplateSearchRequest {
  query: string;
  filters?: TemplateSearchFilters;
  sort?: TemplateSearchSort;
  limit?: number;
  offset?: number;
}

interface UseTemplateSearchReturn {
  searchResults: WhiteboardTemplate[];
  searchLoading: boolean;
  searchError: Error | null;
  searchTotal: number;
  hasMoreResults: boolean;
  search: (request: TemplateSearchRequest) => Promise<void>;
  searchMore: () => Promise<void>;
  clearSearch: () => void;
  searchHistory: string[];
  popularSearches: string[];
  searchSuggestions: string[];
  isSearching: boolean;
}

interface SearchCache {
  [key: string]: {
    results: WhiteboardTemplate[];
    total: number;
    timestamp: number;
    ttl: number;
  };
}

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_SIZE = 50;
const MAX_SEARCH_HISTORY = 20;

export function useTemplateSearch(workspaceId?: string): UseTemplateSearchReturn {
  // State
  const [searchResults, setSearchResults] = useState<WhiteboardTemplate[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<Error | null>(null);
  const [searchTotal, setSearchTotal] = useState(0);
  const [currentRequest, setCurrentRequest] = useState<TemplateSearchRequest | null>(null);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [popularSearches, setPopularSearches] = useState<string[]>([]);
  const [searchSuggestions, setSearchSuggestions] = useState<string[]>([]);
  const [offset, setOffset] = useState(0);
  
  // Refs
  const abortControllerRef = useRef<AbortController | null>(null);
  const cacheRef = useRef<SearchCache>({});
  
  // Hooks
  const { user } = useAuth();

  // Computed values
  const hasMoreResults = searchResults.length < searchTotal;
  const isSearching = searchLoading;

  // Generate cache key
  const generateCacheKey = useCallback((request: TemplateSearchRequest): string => {
    return JSON.stringify({
      query: request.query.toLowerCase().trim(),
      filters: request.filters,
      sort: request.sort,
      limit: request.limit,
      offset: request.offset,
      workspaceId,
    });
  }, [workspaceId]);

  // Check cache
  const getCachedResult = useCallback((key: string) => {
    const cached = cacheRef.current[key];
    if (cached && Date.now() - cached.timestamp < cached.ttl) {
      return cached;
    }
    return null;
  }, []);

  // Set cache
  const setCacheResult = useCallback((key: string, results: WhiteboardTemplate[], total: number) => {
    // Clean old cache entries if we're at capacity
    const cacheKeys = Object.keys(cacheRef.current);
    if (cacheKeys.length >= MAX_CACHE_SIZE) {
      const oldestKey = cacheKeys.reduce((oldest, current) => 
        cacheRef.current[current].timestamp < cacheRef.current[oldest].timestamp 
          ? current 
          : oldest
      );
      delete cacheRef.current[oldestKey];
    }

    cacheRef.current[key] = {
      results,
      total,
      timestamp: Date.now(),
      ttl: CACHE_TTL,
    };
  }, []);

  // Perform search API call
  const performSearch = useCallback(async (
    request: TemplateSearchRequest,
    append: boolean = false
  ): Promise<{ results: WhiteboardTemplate[], total: number }> => {
    if (!user) {
      throw new Error('User not authenticated');
    }

    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    const searchParams = new URLSearchParams();
    searchParams.set('q', request.query);
    searchParams.set('limit', (request.limit || 20).toString());
    searchParams.set('offset', (request.offset || 0).toString());

    if (workspaceId) {
      searchParams.set('workspaceId', workspaceId);
    }

    // Add filters
    if (request.filters) {
      const { filters } = request;
      
      if (filters.category && filters.category.length > 0) {
        searchParams.set('categories', filters.category.join(','));
      }
      
      if (filters.tags && filters.tags.length > 0) {
        searchParams.set('tags', filters.tags.join(','));
      }
      
      if (filters.minRating !== undefined) {
        searchParams.set('minRating', filters.minRating.toString());
      }
      
      if (filters.minUsage !== undefined) {
        searchParams.set('minUsage', filters.minUsage.toString());
      }
      
      if (filters.isPublic !== undefined) {
        searchParams.set('isPublic', filters.isPublic.toString());
      }
      
      if (filters.createdAfter) {
        searchParams.set('createdAfter', filters.createdAfter);
      }
      
      if (filters.createdBefore) {
        searchParams.set('createdBefore', filters.createdBefore);
      }
    }

    // Add sorting
    if (request.sort) {
      searchParams.set('sortBy', request.sort.field);
      searchParams.set('sortDirection', request.sort.direction);
    }

    const response = await fetch(`/api/whiteboard/templates/search?${searchParams}`, {
      signal: abortControllerRef.current.signal,
      headers: {
        'Authorization': `Bearer ${user.token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Search failed: ${response.statusText}`);
    }

    const data = await response.json();
    return {
      results: data.items || [],
      total: data.total || 0,
    };
  }, [user, workspaceId]);

  // Main search function
  const search = useCallback(async (request: TemplateSearchRequest) => {
    if (!request.query.trim()) {
      clearSearch();
      return;
    }

    try {
      setSearchLoading(true);
      setSearchError(null);
      setCurrentRequest(request);
      setOffset(request.offset || 0);

      // Check cache first
      const cacheKey = generateCacheKey(request);
      const cached = getCachedResult(cacheKey);
      
      if (cached) {
        setSearchResults(cached.results);
        setSearchTotal(cached.total);
        setSearchLoading(false);
        return;
      }

      // Perform search
      const { results, total } = await performSearch(request);
      
      setSearchResults(results);
      setSearchTotal(total);
      
      // Cache results
      setCacheResult(cacheKey, results, total);
      
      // Add to search history
      if (request.query.trim()) {
        setSearchHistory(prev => {
          const newHistory = [request.query.trim(), ...prev.filter(h => h !== request.query.trim())];
          return newHistory.slice(0, MAX_SEARCH_HISTORY);
        });
      }

    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return; // Request was cancelled
      }
      
      console.error('Search failed:', error);
      setSearchError(error instanceof Error ? error : new Error('Search failed'));
      setSearchResults([]);
      setSearchTotal(0);
    } finally {
      setSearchLoading(false);
    }
  }, [generateCacheKey, getCachedResult, performSearch, setCacheResult]);

  // Search more results (pagination)
  const searchMore = useCallback(async () => {
    if (!currentRequest || searchLoading || !hasMoreResults) {
      return;
    }

    try {
      setSearchLoading(true);
      
      const nextOffset = offset + (currentRequest.limit || 20);
      const paginatedRequest = {
        ...currentRequest,
        offset: nextOffset,
      };

      const { results } = await performSearch(paginatedRequest);
      
      setSearchResults(prev => [...prev, ...results]);
      setOffset(nextOffset);

    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }
      
      console.error('Load more search results failed:', error);
      setSearchError(error instanceof Error ? error : new Error('Failed to load more results'));
    } finally {
      setSearchLoading(false);
    }
  }, [currentRequest, searchLoading, hasMoreResults, offset, performSearch]);

  // Clear search results
  const clearSearch = useCallback(() => {
    setSearchResults([]);
    setSearchTotal(0);
    setSearchError(null);
    setCurrentRequest(null);
    setOffset(0);
    
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  // Debounced search function
  const debouncedSearch = useMemo(
    () => debounce((request: TemplateSearchRequest) => {
      search(request);
    }, 300),
    [search]
  );

  // Get search suggestions based on input
  const generateSuggestions = useCallback(async (query: string) => {
    if (!query.trim() || query.length < 2) {
      setSearchSuggestions([]);
      return;
    }

    try {
      const response = await fetch(`/api/whiteboard/templates/suggestions?q=${encodeURIComponent(query)}`, {
        headers: user ? { 'Authorization': `Bearer ${user.token}` } : {},
      });

      if (response.ok) {
        const suggestions = await response.json();
        setSearchSuggestions(suggestions.slice(0, 8));
      }
    } catch (error) {
      console.error('Failed to get search suggestions:', error);
    }
  }, [user]);

  // Load popular searches
  const loadPopularSearches = useCallback(async () => {
    try {
      const response = await fetch('/api/whiteboard/templates/popular-searches', {
        headers: user ? { 'Authorization': `Bearer ${user.token}` } : {},
      });

      if (response.ok) {
        const popular = await response.json();
        setPopularSearches(popular.slice(0, 10));
      }
    } catch (error) {
      console.error('Failed to load popular searches:', error);
    }
  }, [user]);

  // Load search history from localStorage
  const loadSearchHistory = useCallback(() => {
    try {
      const saved = localStorage.getItem('template-search-history');
      if (saved) {
        const history = JSON.parse(saved);
        setSearchHistory(Array.isArray(history) ? history : []);
      }
    } catch (error) {
      console.error('Failed to load search history:', error);
    }
  }, []);

  // Save search history to localStorage
  const saveSearchHistory = useCallback((history: string[]) => {
    try {
      localStorage.setItem('template-search-history', JSON.stringify(history));
    } catch (error) {
      console.error('Failed to save search history:', error);
    }
  }, []);

  // Effect to save search history
  React.useEffect(() => {
    if (searchHistory.length > 0) {
      saveSearchHistory(searchHistory);
    }
  }, [searchHistory, saveSearchHistory]);

  // Effect to load initial data
  React.useEffect(() => {
    loadSearchHistory();
    loadPopularSearches();
  }, [loadSearchHistory, loadPopularSearches]);

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      debouncedSearch.cancel();
    };
  }, [debouncedSearch]);

  return {
    searchResults,
    searchLoading,
    searchError,
    searchTotal,
    hasMoreResults,
    search: debouncedSearch,
    searchMore,
    clearSearch,
    searchHistory,
    popularSearches,
    searchSuggestions,
    isSearching,
  };
}