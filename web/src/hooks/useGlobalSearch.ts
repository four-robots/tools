/**
 * Global Search Hook
 * 
 * Manages global search state, keyboard shortcuts, and quick search functionality
 */

'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useSearch } from '@/components/search/hooks';

// Local storage key for recent searches
const RECENT_SEARCHES_KEY = 'mcp_recent_searches';
const MAX_RECENT_SEARCHES = 10;

export interface UseGlobalSearchReturn {
  // Modal state
  isOpen: boolean;
  query: string;
  recentSearches: string[];
  
  // Quick search results (limited)
  quickResults: any[];
  isSearching: boolean;
  
  // Actions
  openSearch: () => void;
  closeSearch: () => void;
  setQuery: (query: string) => void;
  performQuickSearch: (query: string) => void;
  navigateToSearch: (query: string, fromModal?: boolean) => void;
  clearRecentSearches: () => void;
  
  // Keyboard shortcut state
  shortcutPressed: boolean;
}

/**
 * Load recent searches from localStorage
 */
function loadRecentSearches(): string[] {
  if (typeof window === 'undefined') return [];
  
  try {
    const stored = localStorage.getItem(RECENT_SEARCHES_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

/**
 * Save recent searches to localStorage
 */
function saveRecentSearches(searches: string[]) {
  if (typeof window === 'undefined') return;
  
  try {
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(searches));
  } catch {
    // Ignore localStorage errors
  }
}

/**
 * Add a search to recent searches list
 */
function addToRecentSearches(query: string, currentSearches: string[]): string[] {
  if (!query.trim()) return currentSearches;
  
  const trimmedQuery = query.trim();
  const filtered = currentSearches.filter(q => q !== trimmedQuery);
  const updated = [trimmedQuery, ...filtered].slice(0, MAX_RECENT_SEARCHES);
  
  saveRecentSearches(updated);
  return updated;
}

/**
 * Global search hook with modal, keyboard shortcuts, and quick search
 */
export function useGlobalSearch(): UseGlobalSearchReturn {
  const router = useRouter();
  
  // Modal state
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQueryState] = useState('');
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [shortcutPressed, setShortcutPressed] = useState(false);
  
  // Quick search with limited results for modal
  const quickSearch = useSearch({
    autoSearch: true,
    debounceMs: 200,
    enableAnalytics: false, // Don't track quick searches
    enableCache: true
  });
  
  // Load recent searches on mount
  useEffect(() => {
    setRecentSearches(loadRecentSearches());
  }, []);
  
  // Keyboard shortcut handling
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      // Cmd+K (Mac) or Ctrl+K (Windows/Linux)
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault();
        setShortcutPressed(true);
        openSearch();
        return;
      }
      
      // ESC to close modal
      if (event.key === 'Escape' && isOpen) {
        event.preventDefault();
        closeSearch();
        return;
      }
    }
    
    function handleKeyUp(event: KeyboardEvent) {
      if ((event.key === 'Meta' || event.key === 'Control') && shortcutPressed) {
        setShortcutPressed(false);
      }
    }
    
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
    };
  }, [isOpen, shortcutPressed]);
  
  // Modal actions
  const openSearch = useCallback(() => {
    setIsOpen(true);
  }, []);
  
  const closeSearch = useCallback(() => {
    setIsOpen(false);
    setQueryState('');
    quickSearch.clearResults();
  }, [quickSearch]);
  
  // Query management
  const setQuery = useCallback((newQuery: string) => {
    setQueryState(newQuery);
    quickSearch.setQuery(newQuery);
  }, [quickSearch]);
  
  // Quick search for modal preview
  const performQuickSearch = useCallback((searchQuery: string) => {
    setQuery(searchQuery);
  }, [setQuery]);
  
  // Navigate to full search page
  const navigateToSearch = useCallback((searchQuery: string, fromModal = false) => {
    const trimmedQuery = searchQuery.trim();
    
    if (trimmedQuery) {
      // Add to recent searches
      setRecentSearches(current => addToRecentSearches(trimmedQuery, current));
      
      // Navigate to search page with query
      const searchUrl = `/search?q=${encodeURIComponent(trimmedQuery)}`;
      router.push(searchUrl);
    } else {
      // Navigate to empty search page
      router.push('/search');
    }
    
    // Close modal if opened from modal
    if (fromModal) {
      closeSearch();
    }
  }, [router, closeSearch]);
  
  // Clear recent searches
  const clearRecentSearches = useCallback(() => {
    setRecentSearches([]);
    saveRecentSearches([]);
  }, []);
  
  return {
    // Modal state
    isOpen,
    query,
    recentSearches,
    
    // Quick search results (limited to 5 for modal)
    quickResults: quickSearch.results.slice(0, 5),
    isSearching: quickSearch.isLoading,
    
    // Actions
    openSearch,
    closeSearch,
    setQuery,
    performQuickSearch,
    navigateToSearch,
    clearRecentSearches,
    
    // Keyboard shortcut state
    shortcutPressed
  };
}

/**
 * Hook for components that need to trigger global search
 */
export function useGlobalSearchTrigger() {
  const globalSearch = useGlobalSearch();
  
  return {
    openSearch: globalSearch.openSearch,
    navigateToSearch: globalSearch.navigateToSearch,
    shortcutPressed: globalSearch.shortcutPressed
  };
}