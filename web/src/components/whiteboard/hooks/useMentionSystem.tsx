/**
 * useMentionSystem Hook
 * 
 * Comprehensive @mention system hook providing parsing, autocomplete state,
 * notification management, and user resolution with cross-workspace support.
 * 
 * Features:
 * - Real-time @mention parsing and extraction
 * - User search with fuzzy matching and autocomplete
 * - Mention notification management
 * - Cross-workspace user resolution
 * - Mention validation and security
 * - Performance optimization with caching
 * - Keyboard navigation support
 * - Accessibility features
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { MentionParser } from '@mcp-tools/core/src/utils/mention-parser';
import { useDebounce } from './useDebounce';
import { CommentMention, WorkspaceUser } from '@shared/types/whiteboard';

export interface UseMentionSystemProps {
  whiteboardId: string;
  userId: string;
  workspaceId?: string;
  enabled?: boolean;
  enableCrossWorkspace?: boolean;
  searchDelay?: number;
  maxSearchResults?: number;
  cacheExpiry?: number;
}

export interface MentionUser {
  userId: string;
  userName: string;
  displayName: string;
  email?: string;
  avatarUrl?: string;
  workspaceId?: string;
  isFrequentMention?: boolean;
  mentionCount?: number;
  lastMentioned?: Date;
  permissions?: {
    canMention: boolean;
    canNotify: boolean;
  };
}

interface MentionState {
  searchQuery: string;
  searchResults: MentionUser[];
  isSearching: boolean;
  recentMentions: MentionUser[];
  frequentMentions: MentionUser[];
  extractedMentions: CommentMention[];
  error: Error | null;
  totalResults: number;
  hasMoreResults: boolean;
}

interface MentionCache {
  query: string;
  results: MentionUser[];
  timestamp: number;
  workspaceId?: string;
}

interface MentionAutocompleteState {
  isVisible: boolean;
  selectedIndex: number;
  query: string;
  position: { start: number; end: number };
  trigger: '@' | null;
}

const DEFAULT_SEARCH_DELAY = 300;
const DEFAULT_MAX_RESULTS = 20;
const DEFAULT_CACHE_EXPIRY = 5 * 60 * 1000; // 5 minutes
const MIN_SEARCH_LENGTH = 1;

export const useMentionSystem = ({
  whiteboardId,
  userId,
  workspaceId,
  enabled = true,
  enableCrossWorkspace = false,
  searchDelay = DEFAULT_SEARCH_DELAY,
  maxSearchResults = DEFAULT_MAX_RESULTS,
  cacheExpiry = DEFAULT_CACHE_EXPIRY,
}: UseMentionSystemProps) => {
  // Refs for performance
  const mentionParserRef = useRef<MentionParser>(new MentionParser());
  const searchCacheRef = useRef<Map<string, MentionCache>>(new Map());
  const abortControllerRef = useRef<AbortController | null>(null);

  // State management
  const [state, setState] = useState<MentionState>(() => ({
    searchQuery: '',
    searchResults: [],
    isSearching: false,
    recentMentions: [],
    frequentMentions: [],
    extractedMentions: [],
    error: null,
    totalResults: 0,
    hasMoreResults: false,
  }));

  const [autocompleteState, setAutocompleteState] = useState<MentionAutocompleteState>({
    isVisible: false,
    selectedIndex: 0,
    query: '',
    position: { start: 0, end: 0 },
    trigger: null,
  });

  // Debounced search query
  const debouncedSearchQuery = useDebounce(state.searchQuery, searchDelay);

  // Cache management
  const getCachedResults = useCallback((query: string, workspace?: string): MentionUser[] | null => {
    const cacheKey = `${query}-${workspace || 'default'}`;
    const cached = searchCacheRef.current.get(cacheKey);
    
    if (!cached) return null;
    
    // Check if cache is expired
    if (Date.now() - cached.timestamp > cacheExpiry) {
      searchCacheRef.current.delete(cacheKey);
      return null;
    }
    
    return cached.results;
  }, [cacheExpiry]);

  const setCachedResults = useCallback((query: string, results: MentionUser[], workspace?: string) => {
    const cacheKey = `${query}-${workspace || 'default'}`;
    
    // Limit cache size
    if (searchCacheRef.current.size >= 100) {
      const oldestKey = Array.from(searchCacheRef.current.keys())[0];
      searchCacheRef.current.delete(oldestKey);
    }
    
    searchCacheRef.current.set(cacheKey, {
      query,
      results: [...results],
      timestamp: Date.now(),
      workspaceId: workspace,
    });
  }, []);

  // Load frequent and recent mentions
  const loadMentionHistory = useCallback(async () => {
    if (!enabled) return;

    try {
      const [recentResponse, frequentResponse] = await Promise.all([
        fetch(`/api/whiteboards/${whiteboardId}/mentions/recent?userId=${userId}&limit=10`),
        fetch(`/api/whiteboards/${whiteboardId}/mentions/frequent?userId=${userId}&limit=10`),
      ]);

      const [recentData, frequentData] = await Promise.all([
        recentResponse.ok ? recentResponse.json() : { mentions: [] },
        frequentResponse.ok ? frequentResponse.json() : { mentions: [] },
      ]);

      setState(prev => ({
        ...prev,
        recentMentions: recentData.mentions || [],
        frequentMentions: frequentData.mentions || [],
      }));

    } catch (error) {
      console.warn('Failed to load mention history:', error);
    }
  }, [enabled, whiteboardId, userId]);

  // Search users for mentions
  const searchUsers = useCallback(async (query: string, workspace?: string): Promise<void> => {
    if (!enabled || query.length < MIN_SEARCH_LENGTH) {
      setState(prev => ({ ...prev, searchResults: [], isSearching: false }));
      return;
    }

    // Check cache first
    const cached = getCachedResults(query, workspace);
    if (cached) {
      setState(prev => ({
        ...prev,
        searchResults: cached,
        isSearching: false,
        totalResults: cached.length,
        hasMoreResults: false,
      }));
      return;
    }

    setState(prev => ({ ...prev, isSearching: true, error: null }));

    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();

    try {
      const searchParams = new URLSearchParams({
        query,
        userId,
        limit: maxSearchResults.toString(),
        includePermissions: 'true',
      });

      if (workspace) {
        searchParams.set('workspaceId', workspace);
      } else if (workspaceId) {
        searchParams.set('workspaceId', workspaceId);
      }

      if (enableCrossWorkspace) {
        searchParams.set('crossWorkspace', 'true');
      }

      const response = await fetch(
        `/api/whiteboards/${whiteboardId}/mentions/search?${searchParams}`,
        { signal: abortControllerRef.current.signal }
      );

      if (!response.ok) throw new Error('Search failed');

      const data = await response.json();
      const users: MentionUser[] = data.users || [];

      // Cache results
      setCachedResults(query, users, workspace);

      setState(prev => ({
        ...prev,
        searchResults: users,
        isSearching: false,
        totalResults: data.total || users.length,
        hasMoreResults: data.hasMore || false,
      }));

    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return; // Request was aborted, ignore
      }

      setState(prev => ({
        ...prev,
        isSearching: false,
        error: error instanceof Error ? error : new Error('Search failed'),
        searchResults: [],
      }));
    }
  }, [
    enabled,
    whiteboardId,
    userId,
    workspaceId,
    enableCrossWorkspace,
    maxSearchResults,
    getCachedResults,
    setCachedResults,
  ]);

  // Extract mentions from content
  const extractMentions = useCallback(async (content: string): Promise<CommentMention[]> => {
    if (!enabled || !content) return [];

    try {
      const extracted = await mentionParserRef.current.extractMentions(content, {
        whiteboardId,
        workspaceId: workspaceId || '',
      });

      setState(prev => ({ ...prev, extractedMentions: extracted }));
      return extracted;

    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error : new Error('Failed to extract mentions'),
        extractedMentions: [],
      }));
      return [];
    }
  }, [enabled, whiteboardId, workspaceId]);

  // Resolve mention to user
  const resolveMention = useCallback(async (mention: string): Promise<MentionUser | null> => {
    if (!enabled) return null;

    try {
      const response = await fetch(
        `/api/whiteboards/${whiteboardId}/mentions/resolve?mention=${encodeURIComponent(mention)}&workspaceId=${workspaceId || ''}`
      );

      if (!response.ok) return null;

      const data = await response.json();
      return data.user || null;

    } catch (error) {
      console.warn('Failed to resolve mention:', error);
      return null;
    }
  }, [enabled, whiteboardId, workspaceId]);

  // Parse mentions from text input
  const parseMentions = useCallback((
    text: string,
    cursorPosition: number
  ): { mentions: string[]; currentMention: string | null; position: { start: number; end: number } | null } => {
    if (!enabled) return { mentions: [], currentMention: null, position: null };

    const mentions = mentionParserRef.current.findMentions(text);
    const beforeCursor = text.substring(0, cursorPosition);
    
    // Find if cursor is in a mention
    const mentionMatch = beforeCursor.match(/@([a-zA-Z0-9._-]*)$/);
    
    if (mentionMatch) {
      const start = cursorPosition - mentionMatch[0].length;
      const end = cursorPosition;
      const query = mentionMatch[1];
      
      return {
        mentions: mentions.map(m => m.original),
        currentMention: query,
        position: { start, end },
      };
    }

    return {
      mentions: mentions.map(m => m.original),
      currentMention: null,
      position: null,
    };
  }, [enabled]);

  // Autocomplete management
  const showAutocomplete = useCallback((query: string, position: { start: number; end: number }) => {
    setAutocompleteState({
      isVisible: true,
      selectedIndex: 0,
      query,
      position,
      trigger: '@',
    });

    // Trigger search
    setState(prev => ({ ...prev, searchQuery: query }));
  }, []);

  const hideAutocomplete = useCallback(() => {
    setAutocompleteState(prev => ({
      ...prev,
      isVisible: false,
      selectedIndex: 0,
    }));
  }, []);

  const selectAutocompleteItem = useCallback((index: number) => {
    setAutocompleteState(prev => ({
      ...prev,
      selectedIndex: Math.max(0, Math.min(index, state.searchResults.length - 1)),
    }));
  }, [state.searchResults.length]);

  const getSelectedUser = useCallback((): MentionUser | null => {
    if (!autocompleteState.isVisible || state.searchResults.length === 0) return null;
    return state.searchResults[autocompleteState.selectedIndex] || null;
  }, [autocompleteState.isVisible, autocompleteState.selectedIndex, state.searchResults]);

  // Record mention usage
  const recordMentionUsage = useCallback(async (mentionedUserId: string) => {
    if (!enabled) return;

    try {
      await fetch(`/api/whiteboards/${whiteboardId}/mentions/usage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mentionedUserId,
          mentionedBy: userId,
          whiteboardId,
          workspaceId,
        }),
      });

      // Refresh mention history
      loadMentionHistory();

    } catch (error) {
      console.warn('Failed to record mention usage:', error);
    }
  }, [enabled, whiteboardId, userId, workspaceId, loadMentionHistory]);

  // Validate mention permissions
  const validateMentionPermissions = useCallback(async (
    targetUserId: string,
    workspace?: string
  ): Promise<{ canMention: boolean; canNotify: boolean; reason?: string }> => {
    if (!enabled) return { canMention: false, canNotify: false, reason: 'Mentions disabled' };

    try {
      const response = await fetch(
        `/api/whiteboards/${whiteboardId}/mentions/permissions?targetUserId=${targetUserId}&workspaceId=${workspace || workspaceId || ''}`
      );

      if (!response.ok) {
        return { canMention: false, canNotify: false, reason: 'Permission check failed' };
      }

      const data = await response.json();
      return {
        canMention: data.canMention || false,
        canNotify: data.canNotify || false,
        reason: data.reason,
      };

    } catch (error) {
      return { canMention: false, canNotify: false, reason: 'Permission check failed' };
    }
  }, [enabled, whiteboardId, workspaceId]);

  // Combined search results with recent/frequent mentions
  const combinedResults = useMemo(() => {
    if (!enabled) return [];

    const results = [...state.searchResults];
    const query = state.searchQuery.toLowerCase();

    // Add recent mentions that match query
    const matchingRecent = state.recentMentions.filter(user =>
      !results.some(r => r.userId === user.userId) &&
      (user.userName.toLowerCase().includes(query) ||
       user.displayName.toLowerCase().includes(query))
    );

    // Add frequent mentions that match query
    const matchingFrequent = state.frequentMentions.filter(user =>
      !results.some(r => r.userId === user.userId) &&
      !matchingRecent.some(r => r.userId === user.userId) &&
      (user.userName.toLowerCase().includes(query) ||
       user.displayName.toLowerCase().includes(query))
    );

    return [
      ...results,
      ...matchingRecent.slice(0, 3),
      ...matchingFrequent.slice(0, 3),
    ].slice(0, maxSearchResults);
  }, [enabled, state.searchResults, state.recentMentions, state.frequentMentions, state.searchQuery, maxSearchResults]);

  // Perform search when debounced query changes
  useEffect(() => {
    if (debouncedSearchQuery && enabled) {
      searchUsers(debouncedSearchQuery);
    }
  }, [debouncedSearchQuery, enabled, searchUsers]);

  // Load mention history on mount
  useEffect(() => {
    if (enabled) {
      loadMentionHistory();
    }
  }, [enabled, loadMentionHistory]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Memoized return value
  const returnValue = useMemo(() => ({
    // Data
    searchResults: combinedResults,
    recentMentions: state.recentMentions,
    frequentMentions: state.frequentMentions,
    extractedMentions: state.extractedMentions,
    
    // State
    isSearching: state.isSearching,
    error: state.error,
    totalResults: state.totalResults,
    hasMoreResults: state.hasMoreResults,
    
    // Autocomplete
    autocomplete: autocompleteState,
    showAutocomplete,
    hideAutocomplete,
    selectAutocompleteItem,
    getSelectedUser,
    
    // Actions
    searchUsers,
    extractMentions,
    resolveMention,
    parseMentions,
    recordMentionUsage,
    validateMentionPermissions,
    
    // Utilities
    loadMentionHistory,
  }), [
    combinedResults,
    state,
    autocompleteState,
    showAutocomplete,
    hideAutocomplete,
    selectAutocompleteItem,
    getSelectedUser,
    searchUsers,
    extractMentions,
    resolveMention,
    parseMentions,
    recordMentionUsage,
    validateMentionPermissions,
    loadMentionHistory,
  ]);

  return returnValue;
};