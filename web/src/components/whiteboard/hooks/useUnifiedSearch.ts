'use client';

import { useState, useEffect, useCallback } from 'react';
import { useApi } from '@/hooks/use-api';
import type { 
  UnifiedSearchResult, 
  UnifiedSearchRequest 
} from '@shared/types/whiteboard';

interface UnifiedSearchResponse {
  results: UnifiedSearchResult[];
  cached: boolean;
  totalResults: number;
}

interface UseUnifiedSearchResult {
  results: UnifiedSearchResult[];
  isLoading: boolean;
  error: string | null;
  totalResults: number;
  cached: boolean;
  refetch: () => Promise<void>;
}

export function useUnifiedSearch(
  whiteboardId: string,
  searchRequest: UnifiedSearchRequest
): UseUnifiedSearchResult {
  const [results, setResults] = useState<UnifiedSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalResults, setTotalResults] = useState(0);
  const [cached, setCached] = useState(false);
  
  const { client } = useApi();

  const performSearch = useCallback(async () => {
    // Don't search if query is empty
    if (!searchRequest.query.trim()) {
      setResults([]);
      setTotalResults(0);
      setCached(false);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await client.post<{ 
        success: boolean; 
        data: UnifiedSearchResponse; 
        message: string 
      }>(
        `/api/v1/whiteboards/${whiteboardId}/search`,
        searchRequest
      );

      if (response.data.success) {
        const { results: searchResults, cached: isCached, totalResults: total } = response.data.data;
        setResults(searchResults);
        setTotalResults(total);
        setCached(isCached);
      } else {
        throw new Error('Search failed');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Search failed';
      setError(errorMessage);
      setResults([]);
      setTotalResults(0);
      setCached(false);
      console.error('Unified search error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [client, whiteboardId, searchRequest]);

  // Trigger search when request changes
  useEffect(() => {
    performSearch();
  }, [performSearch]);

  return {
    results,
    isLoading,
    error,
    totalResults,
    cached,
    refetch: performSearch,
  };
}