import { useState, useEffect, useCallback, useRef } from 'react';
import { useApi } from './use-api';

export interface SearchHistoryItem {
  id: string;
  searchQuery: string;
  searchType: 'full_text' | 'advanced' | 'unified' | 'element' | 'comment';
  resultsCount: number;
  clickedResultId?: string;
  sessionId?: string;
  createdAt: string;
  workspaceId: string;
  userId: string;
}

export interface SearchHistoryState {
  searchHistory: SearchHistoryItem[];
  isLoadingHistory: boolean;
  error: string | null;
  hasMoreHistory: boolean;
  totalHistoryCount: number;
}

export interface SearchHistoryActions {
  addToHistory: (query: string, searchType: SearchHistoryItem['searchType'], resultsCount: number, clickedResultId?: string) => Promise<void>;
  loadHistory: (limit?: number, offset?: number) => Promise<void>;
  clearHistory: () => Promise<void>;
  removeFromHistory: (id: string) => Promise<void>;
  searchInHistory: (searchQuery: string) => SearchHistoryItem[];
  getPopularQueries: (limit?: number) => SearchHistoryItem[];
  getRecentQueries: (limit?: number) => SearchHistoryItem[];
}

export function useSearchHistory(
  userId: string,
  options: {
    maxLocalHistory?: number;
    enablePersistence?: boolean;
    autoLoad?: boolean;
    sessionId?: string;
  } = {}
): SearchHistoryState & SearchHistoryActions {
  const [state, setState] = useState<SearchHistoryState>({
    searchHistory: [],
    isLoadingHistory: false,
    error: null,
    hasMoreHistory: true,
    totalHistoryCount: 0,
  });

  const { get, post, del } = useApi();
  const currentSessionId = useRef<string>(options.sessionId || crypto.randomUUID());
  const localStorageKey = `whiteboard-search-history-${userId}`;

  const {
    maxLocalHistory = 100,
    enablePersistence = true,
    autoLoad = true,
  } = options;

  /**
   * Load search history from localStorage for immediate display
   */
  const loadLocalHistory = useCallback((): SearchHistoryItem[] => {
    if (!enablePersistence) return [];

    try {
      const stored = localStorage.getItem(localStorageKey);
      if (stored) {
        const parsedHistory = JSON.parse(stored);
        return Array.isArray(parsedHistory) ? parsedHistory.slice(0, maxLocalHistory) : [];
      }
    } catch (error) {
      console.warn('Failed to load search history from localStorage:', error);
    }
    return [];
  }, [enablePersistence, localStorageKey, maxLocalHistory]);

  /**
   * Save search history to localStorage
   */
  const saveLocalHistory = useCallback((history: SearchHistoryItem[]): void => {
    if (!enablePersistence) return;

    try {
      const historyToStore = history.slice(0, maxLocalHistory);
      localStorage.setItem(localStorageKey, JSON.stringify(historyToStore));
    } catch (error) {
      console.warn('Failed to save search history to localStorage:', error);
    }
  }, [enablePersistence, localStorageKey, maxLocalHistory]);

  /**
   * Merge server and local history while avoiding duplicates
   */
  const mergeHistory = useCallback((
    serverHistory: SearchHistoryItem[],
    localHistory: SearchHistoryItem[]
  ): SearchHistoryItem[] => {
    const merged = [...serverHistory];
    const serverQuerySet = new Set(serverHistory.map(item => 
      `${item.searchQuery}-${item.searchType}-${new Date(item.createdAt).getTime()}`
    ));

    // Add local history items that aren't in server history
    localHistory.forEach(localItem => {
      const key = `${localItem.searchQuery}-${localItem.searchType}-${new Date(localItem.createdAt).getTime()}`;
      if (!serverQuerySet.has(key)) {
        merged.push(localItem);
      }
    });

    // Sort by creation date (newest first) and remove duplicates
    return merged
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, maxLocalHistory);
  }, [maxLocalHistory]);

  /**
   * Load search history from server
   */
  const loadHistory = useCallback(async (limit: number = 50, offset: number = 0): Promise<void> => {
    setState(prev => ({ ...prev, isLoadingHistory: true, error: null }));

    try {
      const response = await get(`/api/whiteboard/search/history`, {
        params: {
          userId,
          limit,
          offset,
        },
      });

      const serverHistory = response.data?.items || [];
      const totalCount = response.data?.total || 0;
      const hasMore = offset + serverHistory.length < totalCount;

      if (offset === 0) {
        // First load - merge with local history
        const localHistory = loadLocalHistory();
        const mergedHistory = mergeHistory(serverHistory, localHistory);
        
        setState(prev => ({
          ...prev,
          searchHistory: mergedHistory,
          isLoadingHistory: false,
          hasMoreHistory: hasMore,
          totalHistoryCount: totalCount,
        }));
      } else {
        // Pagination - append to existing history
        setState(prev => ({
          ...prev,
          searchHistory: [...prev.searchHistory, ...serverHistory],
          isLoadingHistory: false,
          hasMoreHistory: hasMore,
          totalHistoryCount: totalCount,
        }));
      }
    } catch (error: any) {
      console.error('Failed to load search history:', error);
      
      // Fallback to local history on server error
      if (offset === 0) {
        const localHistory = loadLocalHistory();
        setState(prev => ({
          ...prev,
          searchHistory: localHistory,
          isLoadingHistory: false,
          error: error?.response?.data?.message || 'Failed to load search history',
          hasMoreHistory: false,
          totalHistoryCount: localHistory.length,
        }));
      } else {
        setState(prev => ({
          ...prev,
          isLoadingHistory: false,
          error: error?.response?.data?.message || 'Failed to load more history',
        }));
      }
    }
  }, [userId, get, loadLocalHistory, mergeHistory]);

  /**
   * Add new search to history
   */
  const addToHistory = useCallback(async (
    query: string,
    searchType: SearchHistoryItem['searchType'],
    resultsCount: number,
    clickedResultId?: string
  ): Promise<void> => {
    const historyItem: Omit<SearchHistoryItem, 'id'> = {
      searchQuery: query.trim(),
      searchType,
      resultsCount,
      clickedResultId,
      sessionId: currentSessionId.current,
      createdAt: new Date().toISOString(),
      workspaceId: '', // Will be set by server
      userId,
    };

    // Add to local state immediately for responsive UI
    const tempItem: SearchHistoryItem = {
      id: crypto.randomUUID(),
      ...historyItem,
      workspaceId: 'pending', // Temporary value
    };

    setState(prev => {
      const updatedHistory = [tempItem, ...prev.searchHistory].slice(0, maxLocalHistory);
      saveLocalHistory(updatedHistory);
      
      return {
        ...prev,
        searchHistory: updatedHistory,
        totalHistoryCount: prev.totalHistoryCount + 1,
      };
    });

    // Save to server in background
    try {
      await post('/api/whiteboard/search/history', historyItem);
    } catch (error) {
      console.warn('Failed to save search history to server:', error);
      // Item is already in local storage, so user won't lose data
    }
  }, [userId, maxLocalHistory, post, saveLocalHistory]);

  /**
   * Clear all search history
   */
  const clearHistory = useCallback(async (): Promise<void> => {
    setState(prev => ({ ...prev, isLoadingHistory: true }));

    try {
      // Clear from server
      await del(`/api/whiteboard/search/history/${userId}`);
      
      // Clear from local storage
      if (enablePersistence) {
        localStorage.removeItem(localStorageKey);
      }

      setState(prev => ({
        ...prev,
        searchHistory: [],
        isLoadingHistory: false,
        hasMoreHistory: false,
        totalHistoryCount: 0,
      }));
    } catch (error: any) {
      console.error('Failed to clear search history:', error);
      
      setState(prev => ({
        ...prev,
        isLoadingHistory: false,
        error: error?.response?.data?.message || 'Failed to clear search history',
      }));
    }
  }, [userId, del, enablePersistence, localStorageKey]);

  /**
   * Remove specific item from history
   */
  const removeFromHistory = useCallback(async (id: string): Promise<void> => {
    // Remove from local state immediately
    setState(prev => {
      const updatedHistory = prev.searchHistory.filter(item => item.id !== id);
      saveLocalHistory(updatedHistory);
      
      return {
        ...prev,
        searchHistory: updatedHistory,
        totalHistoryCount: Math.max(0, prev.totalHistoryCount - 1),
      };
    });

    // Remove from server
    try {
      await del(`/api/whiteboard/search/history/item/${id}`);
    } catch (error) {
      console.warn('Failed to remove search history item from server:', error);
    }
  }, [del, saveLocalHistory]);

  /**
   * Search within history
   */
  const searchInHistory = useCallback((searchQuery: string): SearchHistoryItem[] => {
    if (!searchQuery.trim()) return state.searchHistory;
    
    const query = searchQuery.toLowerCase();
    return state.searchHistory.filter(item =>
      item.searchQuery.toLowerCase().includes(query)
    );
  }, [state.searchHistory]);

  /**
   * Get popular queries based on frequency
   */
  const getPopularQueries = useCallback((limit: number = 10): SearchHistoryItem[] => {
    const queryFrequency = new Map<string, { count: number; item: SearchHistoryItem }>();
    
    state.searchHistory.forEach(item => {
      const query = item.searchQuery.toLowerCase();
      const existing = queryFrequency.get(query);
      
      if (existing) {
        existing.count++;
        // Keep the most recent item for this query
        if (new Date(item.createdAt) > new Date(existing.item.createdAt)) {
          existing.item = item;
        }
      } else {
        queryFrequency.set(query, { count: 1, item });
      }
    });

    return Array.from(queryFrequency.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, limit)
      .map(entry => entry.item);
  }, [state.searchHistory]);

  /**
   * Get recent queries (last 24 hours)
   */
  const getRecentQueries = useCallback((limit: number = 10): SearchHistoryItem[] => {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    return state.searchHistory
      .filter(item => new Date(item.createdAt) > oneDayAgo)
      .slice(0, limit);
  }, [state.searchHistory]);

  // Initialize with local history and optionally load from server
  useEffect(() => {
    const localHistory = loadLocalHistory();
    setState(prev => ({
      ...prev,
      searchHistory: localHistory,
    }));

    if (autoLoad) {
      loadHistory();
    }
  }, [loadLocalHistory, autoLoad, loadHistory]);

  // Save to localStorage whenever history changes
  useEffect(() => {
    saveLocalHistory(state.searchHistory);
  }, [state.searchHistory, saveLocalHistory]);

  return {
    ...state,
    addToHistory,
    loadHistory,
    clearHistory,
    removeFromHistory,
    searchInHistory,
    getPopularQueries,
    getRecentQueries,
  };
}