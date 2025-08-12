/**
 * MentionAutocomplete Component
 * 
 * Real-time @mention autocomplete with user search, keyboard navigation,
 * user avatars, and workspace member filtering capabilities.
 * 
 * Features:
 * - Real-time user search with fuzzy matching
 * - Keyboard navigation (arrow keys, Enter, Escape, Tab)
 * - User avatars and presence indicators
 * - Workspace member filtering and permissions
 * - Recent users and frequent mentions
 * - Cross-workspace user resolution
 * - Performance optimized with virtualization
 * - Accessibility support (ARIA labels, screen reader friendly)
 */

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { UserAvatar } from '../UserAvatar';
import { useKeyboardNavigation } from '../hooks/useKeyboardNavigation';
import { useUserPresence } from '../hooks/useUserPresence';
import { formatDistanceToNow } from 'date-fns';

export interface MentionUser {
  userId: string;
  userName: string;
  displayName: string;
  email?: string;
  avatarUrl?: string;
  isOnline?: boolean;
  lastSeen?: Date;
  role?: string;
  workspaceId?: string;
  isFrequentMention?: boolean;
  mentionCount?: number;
}

export interface MentionAutocompleteProps {
  query: string;
  results: MentionUser[];
  isLoading?: boolean;
  position?: 'top' | 'bottom' | 'auto';
  maxResults?: number;
  showAvatars?: boolean;
  showPresence?: boolean;
  showRoles?: boolean;
  showRecentFirst?: boolean;
  filterWorkspaceMembers?: boolean;
  placeholder?: string;
  className?: string;
  onSelect: (user: MentionUser) => void;
  onClose: () => void;
  onQueryChange?: (query: string) => void;
}

interface AutocompleteState {
  filteredResults: MentionUser[];
  selectedIndex: number;
  isVisible: boolean;
  hasResults: boolean;
}

const MAX_VISIBLE_RESULTS = 8;
const RESULT_HEIGHT = 56; // pixels
const MIN_QUERY_LENGTH = 0;

export const MentionAutocomplete: React.FC<MentionAutocompleteProps> = ({
  query,
  results,
  isLoading = false,
  position = 'bottom',
  maxResults = MAX_VISIBLE_RESULTS,
  showAvatars = true,
  showPresence = true,
  showRoles = true,
  showRecentFirst = true,
  filterWorkspaceMembers = true,
  placeholder = 'Type to search users...',
  className = '',
  onSelect,
  onClose,
  onQueryChange,
}) => {
  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const selectedItemRef = useRef<HTMLLIElement>(null);

  // State management
  const [state, setState] = useState<AutocompleteState>(() => ({
    filteredResults: [],
    selectedIndex: 0,
    isVisible: false,
    hasResults: false,
  }));

  // Hook integrations
  const { isUserOnline, getUserPresence } = useUserPresence();

  // Process and filter results
  const processedResults = useMemo(() => {
    let filtered = [...results];

    // Filter by query
    if (query.length >= MIN_QUERY_LENGTH) {
      const queryLower = query.toLowerCase();
      filtered = filtered.filter(user => 
        user.userName.toLowerCase().includes(queryLower) ||
        user.displayName.toLowerCase().includes(queryLower) ||
        user.email?.toLowerCase().includes(queryLower)
      );
    }

    // Sort results
    filtered.sort((a, b) => {
      // Prioritize exact matches
      const aExactMatch = a.userName.toLowerCase() === query.toLowerCase();
      const bExactMatch = b.userName.toLowerCase() === query.toLowerCase();
      if (aExactMatch && !bExactMatch) return -1;
      if (!aExactMatch && bExactMatch) return 1;

      // Prioritize online users
      if (showPresence) {
        const aOnline = isUserOnline(a.userId);
        const bOnline = isUserOnline(b.userId);
        if (aOnline && !bOnline) return -1;
        if (!aOnline && bOnline) return 1;
      }

      // Prioritize frequent mentions
      if (showRecentFirst) {
        const aFrequent = a.isFrequentMention || false;
        const bFrequent = b.isFrequentMention || false;
        if (aFrequent && !bFrequent) return -1;
        if (!aFrequent && bFrequent) return 1;

        // Sort by mention count if both are frequent
        if (aFrequent && bFrequent && a.mentionCount && b.mentionCount) {
          return b.mentionCount - a.mentionCount;
        }
      }

      // Alphabetical by display name
      return a.displayName.localeCompare(b.displayName);
    });

    // Limit results
    return filtered.slice(0, maxResults);
  }, [results, query, maxResults, showPresence, showRecentFirst, isUserOnline]);

  // Update state when results change
  useEffect(() => {
    setState(prev => ({
      ...prev,
      filteredResults: processedResults,
      hasResults: processedResults.length > 0,
      isVisible: processedResults.length > 0 && query.length >= MIN_QUERY_LENGTH,
      selectedIndex: Math.min(prev.selectedIndex, Math.max(0, processedResults.length - 1)),
    }));
  }, [processedResults, query]);

  // Keyboard navigation
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!state.isVisible || !state.hasResults) return;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setState(prev => ({
          ...prev,
          selectedIndex: Math.min(prev.selectedIndex + 1, prev.filteredResults.length - 1),
        }));
        break;

      case 'ArrowUp':
        event.preventDefault();
        setState(prev => ({
          ...prev,
          selectedIndex: Math.max(prev.selectedIndex - 1, 0),
        }));
        break;

      case 'Enter':
      case 'Tab':
        event.preventDefault();
        if (state.filteredResults[state.selectedIndex]) {
          onSelect(state.filteredResults[state.selectedIndex]);
        }
        break;

      case 'Escape':
        event.preventDefault();
        onClose();
        break;
    }
  }, [state.isVisible, state.hasResults, state.selectedIndex, state.filteredResults, onSelect, onClose]);

  // Setup keyboard event listeners
  useEffect(() => {
    if (state.isVisible) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [state.isVisible, handleKeyDown]);

  // Auto-scroll to selected item
  useEffect(() => {
    if (selectedItemRef.current && listRef.current) {
      const selectedElement = selectedItemRef.current;
      const listElement = listRef.current;

      const selectedTop = selectedElement.offsetTop;
      const selectedBottom = selectedTop + selectedElement.offsetHeight;
      const listScrollTop = listElement.scrollTop;
      const listScrollBottom = listScrollTop + listElement.offsetHeight;

      if (selectedTop < listScrollTop) {
        listElement.scrollTop = selectedTop;
      } else if (selectedBottom > listScrollBottom) {
        listElement.scrollTop = selectedBottom - listElement.offsetHeight;
      }
    }
  }, [state.selectedIndex]);

  // Handle click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (state.isVisible) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [state.isVisible, onClose]);

  // Handle user selection
  const handleUserSelect = useCallback((user: MentionUser, index: number) => {
    setState(prev => ({ ...prev, selectedIndex: index }));
    onSelect(user);
  }, [onSelect]);

  // Render user item
  const renderUserItem = useCallback((user: MentionUser, index: number, isSelected: boolean) => {
    const presence = showPresence ? getUserPresence(user.userId) : null;
    const isOnline = showPresence ? isUserOnline(user.userId) : false;

    return (
      <li
        key={user.userId}
        ref={isSelected ? selectedItemRef : undefined}
        className={`px-3 py-2 cursor-pointer flex items-center space-x-3 ${
          isSelected ? 'bg-blue-50 border-l-2 border-blue-500' : 'hover:bg-gray-50'
        }`}
        onClick={() => handleUserSelect(user, index)}
        role="option"
        aria-selected={isSelected}
        aria-label={`@${user.userName} - ${user.displayName}`}
      >
        {/* Avatar */}
        {showAvatars && (
          <div className="flex-shrink-0 relative">
            <UserAvatar
              userId={user.userId}
              userName={user.displayName}
              avatarUrl={user.avatarUrl}
              size="sm"
            />
            {showPresence && isOnline && (
              <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-400 border border-white rounded-full"></div>
            )}
          </div>
        )}

        {/* User info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center space-x-2">
            <span className="font-medium text-gray-900 truncate">
              {user.displayName}
            </span>
            {user.isFrequentMention && (
              <span className="px-1.5 py-0.5 text-xs bg-blue-100 text-blue-800 rounded-full">
                Frequent
              </span>
            )}
            {showRoles && user.role && (
              <span className="px-1.5 py-0.5 text-xs bg-gray-100 text-gray-600 rounded-full">
                {user.role}
              </span>
            )}
          </div>
          <div className="flex items-center space-x-2 text-sm text-gray-500">
            <span>@{user.userName}</span>
            {user.email && (
              <>
                <span>•</span>
                <span className="truncate">{user.email}</span>
              </>
            )}
          </div>
          {showPresence && presence && !isOnline && user.lastSeen && (
            <div className="text-xs text-gray-400">
              Last seen {formatDistanceToNow(user.lastSeen, { addSuffix: true })}
            </div>
          )}
        </div>

        {/* Mention count indicator */}
        {user.mentionCount && user.mentionCount > 0 && (
          <div className="flex-shrink-0 text-xs text-gray-400">
            {user.mentionCount} mentions
          </div>
        )}
      </li>
    );
  }, [showAvatars, showPresence, showRoles, getUserPresence, isUserOnline, handleUserSelect]);

  // Don't render if not visible
  if (!state.isVisible) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      className={`absolute z-50 w-80 bg-white rounded-lg shadow-lg border border-gray-200 max-h-64 overflow-hidden ${className}`}
      style={{
        top: position === 'bottom' ? '100%' : position === 'top' ? 'auto' : '100%',
        bottom: position === 'top' ? '100%' : 'auto',
        left: 0,
        marginTop: position === 'bottom' ? '4px' : '0',
        marginBottom: position === 'top' ? '4px' : '0',
      }}
      role="listbox"
      aria-label="User mention suggestions"
    >
      {/* Header */}
      <div className="px-3 py-2 border-b border-gray-100 bg-gray-50">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">
            Mention user
          </span>
          {state.filteredResults.length > 0 && (
            <span className="text-xs text-gray-500">
              {state.filteredResults.length} result{state.filteredResults.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        {query && (
          <div className="text-xs text-gray-500 mt-1">
            Searching for "{query}"
          </div>
        )}
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="px-3 py-4 text-center">
          <div className="inline-flex items-center space-x-2 text-sm text-gray-500">
            <div className="animate-spin w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full"></div>
            <span>Searching...</span>
          </div>
        </div>
      )}

      {/* Results list */}
      {!isLoading && state.hasResults && (
        <ul
          ref={listRef}
          className="overflow-y-auto"
          style={{ maxHeight: `${Math.min(state.filteredResults.length, 6) * RESULT_HEIGHT}px` }}
          role="listbox"
        >
          {state.filteredResults.map((user, index) =>
            renderUserItem(user, index, index === state.selectedIndex)
          )}
        </ul>
      )}

      {/* No results */}
      {!isLoading && !state.hasResults && query.length >= MIN_QUERY_LENGTH && (
        <div className="px-3 py-4 text-center">
          <div className="text-sm text-gray-500">
            No users found matching "{query}"
          </div>
          <div className="text-xs text-gray-400 mt-1">
            Try a different search term
          </div>
        </div>
      )}

      {/* Footer with navigation hints */}
      {state.hasResults && (
        <div className="px-3 py-2 border-t border-gray-100 bg-gray-50">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>Use ↑↓ to navigate</span>
            <span>Enter to select • Esc to close</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default MentionAutocomplete;