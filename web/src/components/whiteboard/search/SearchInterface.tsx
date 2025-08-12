import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { debounce } from 'lodash';
import { 
  MagnifyingGlassIcon, 
  FunnelIcon, 
  XMarkIcon,
  AdjustmentsHorizontalIcon,
  ClockIcon,
  BookmarkIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline';
import { MagnifyingGlassIcon as MagnifyingGlassIconSolid } from '@heroicons/react/24/solid';
import SearchResults from './SearchResults';
import FilterPanel from './FilterPanel';
import SearchSuggestions from './SearchSuggestions';
import SavedSearches from './SavedSearches';
import SearchErrorBoundary from './SearchErrorBoundary';
import { useWhiteboardSearch } from '../../../hooks/useWhiteboardSearch';
import { useSearchSuggestions } from '../../../hooks/useSearchSuggestions';
import { useSearchHistory } from '../../../hooks/useSearchHistory';
import { 
  AdvancedSearchQuery, 
  SearchResultWithHighlights, 
  PaginatedSearchResults,
  SearchSuggestion,
  SearchFilterType,
  SearchSortType,
  SearchSyntaxType
} from '@shared/types/whiteboard';

interface SearchInterfaceProps {
  workspaceId: string;
  whiteboardId?: string;
  userId: string;
  initialQuery?: string;
  onResultSelect?: (result: SearchResultWithHighlights) => void;
  onSearchStateChange?: (isSearching: boolean) => void;
  className?: string;
  variant?: 'full' | 'compact' | 'modal';
  showSavedSearches?: boolean;
  showHistory?: boolean;
  enableRealTimeSearch?: boolean;
  maxResults?: number;
}

const SearchInterface: React.FC<SearchInterfaceProps> = ({
  workspaceId,
  whiteboardId,
  userId,
  initialQuery = '',
  onResultSelect,
  onSearchStateChange,
  className = '',
  variant = 'full',
  showSavedSearches = true,
  showHistory = true,
  enableRealTimeSearch = true,
  maxResults = 20,
}) => {
  // State management
  const [query, setQuery] = useState<string>(initialQuery);
  const [isActive, setIsActive] = useState<boolean>(false);
  const [showFilters, setShowFilters] = useState<boolean>(false);
  const [showSuggestions, setShowSuggestions] = useState<boolean>(false);
  const [showSaved, setShowSaved] = useState<boolean>(false);
  const [showHistory, setShowHistoryPanel] = useState<boolean>(false);
  const [currentPage, setCurrentPage] = useState<number>(0);
  const [syntaxType, setSyntaxType] = useState<SearchSyntaxType>('natural');
  const [selectedFilters, setSelectedFilters] = useState<Record<string, any>>({});
  const [sortConfig, setSortConfig] = useState<{
    field: SearchSortType;
    direction: 'asc' | 'desc';
  }>({
    field: 'relevance',
    direction: 'desc',
  });

  // Custom hooks
  const {
    searchResults,
    isSearching,
    error,
    performAdvancedSearch,
    performFullTextSearch,
    searchAnalytics,
  } = useWhiteboardSearch(workspaceId, userId);

  const {
    suggestions,
    isLoadingSuggestions,
    generateSuggestions,
    clearSuggestions,
  } = useSearchSuggestions(workspaceId, userId);

  const {
    searchHistory,
    addToHistory,
    clearHistory,
    removeFromHistory,
  } = useSearchHistory(userId);

  // Computed values
  const isCompact = variant === 'compact';
  const isModal = variant === 'modal';
  const hasResults = searchResults && searchResults.items.length > 0;
  const hasQuery = query.trim().length > 0;

  // Debounced search function
  const debouncedSearch = useCallback(
    debounce(async (searchQuery: string, filters: Record<string, any>) => {
      if (!searchQuery.trim() || searchQuery.length < 2) {
        return;
      }

      try {
        const searchRequest: AdvancedSearchQuery = {
          query: searchQuery,
          syntaxType,
          searchFields: filters.searchFields || ['all'],
          createdBy: filters.createdBy,
          modifiedBy: filters.modifiedBy,
          dateRange: filters.dateRange,
          elementTypes: filters.elementTypes,
          hasElements: filters.hasElements,
          hasComments: filters.hasComments,
          includeTags: filters.includeTags,
          excludeTags: filters.excludeTags,
          visibility: filters.visibility,
          activityLevel: filters.activityLevel,
          isCollaborating: filters.isCollaborating,
          isTemplate: filters.isTemplate,
          templateCategory: filters.templateCategory,
          includePreviews: true,
          includeHighlights: true,
          fuzzyMatch: filters.fuzzyMatch !== false,
          maxPreviewLength: 200,
        };

        if (syntaxType === 'natural' && searchQuery.length < 100) {
          // Use full-text search for short natural queries
          await performFullTextSearch(searchQuery, filters, maxResults, currentPage * maxResults);
        } else {
          // Use advanced search for complex queries
          await performAdvancedSearch(searchRequest, sortConfig, maxResults, currentPage * maxResults);
        }

        // Add to search history
        await addToHistory(searchQuery, 'advanced', searchResults?.total || 0);

      } catch (error) {
        console.error('Search failed:', error);
      }
    }, enableRealTimeSearch ? 300 : 500),
    [syntaxType, sortConfig, currentPage, maxResults, performAdvancedSearch, performFullTextSearch, addToHistory, searchResults?.total, enableRealTimeSearch]
  );

  // Debounced suggestions function
  const debouncedSuggestions = useCallback(
    debounce(async (partialQuery: string) => {
      if (partialQuery.length >= 2) {
        await generateSuggestions(partialQuery);
      } else {
        clearSuggestions();
      }
    }, 150),
    [generateSuggestions, clearSuggestions]
  );

  // Effects
  useEffect(() => {
    if (onSearchStateChange) {
      onSearchStateChange(isSearching);
    }
  }, [isSearching, onSearchStateChange]);

  useEffect(() => {
    if (hasQuery && isActive) {
      debouncedSearch(query, selectedFilters);
    }
  }, [query, selectedFilters, debouncedSearch, hasQuery, isActive]);

  useEffect(() => {
    if (hasQuery && showSuggestions && isActive) {
      debouncedSuggestions(query);
    }
  }, [query, showSuggestions, debouncedSuggestions, hasQuery, isActive]);

  // Event handlers
  const handleQueryChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newQuery = e.target.value;
    setQuery(newQuery);
    
    if (newQuery.length >= 2) {
      setShowSuggestions(true);
    } else {
      setShowSuggestions(false);
      clearSuggestions();
    }
  }, [clearSuggestions]);

  const handleQueryFocus = useCallback(() => {
    setIsActive(true);
    if (hasQuery && query.length >= 2) {
      setShowSuggestions(true);
    }
  }, [hasQuery, query.length]);

  const handleQueryBlur = useCallback(() => {
    // Delay hiding suggestions to allow clicks
    setTimeout(() => {
      setShowSuggestions(false);
    }, 200);
  }, []);

  const handleSuggestionSelect = useCallback((suggestion: SearchSuggestion) => {
    setQuery(suggestion.text);
    setShowSuggestions(false);
    
    // Apply suggestion-specific filters
    if (suggestion.type === 'tag') {
      setSelectedFilters(prev => ({
        ...prev,
        includeTags: [...(prev.includeTags || []), suggestion.text],
      }));
    } else if (suggestion.type === 'user') {
      setSelectedFilters(prev => ({
        ...prev,
        createdBy: [...(prev.createdBy || []), suggestion.metadata.userId],
      }));
    }
  }, []);

  const handleFilterChange = useCallback((filterType: string, value: any) => {
    setSelectedFilters(prev => ({
      ...prev,
      [filterType]: value,
    }));
    setCurrentPage(0); // Reset pagination
  }, []);

  const handleSortChange = useCallback((field: SearchSortType, direction: 'asc' | 'desc') => {
    setSortConfig({ field, direction });
    setCurrentPage(0); // Reset pagination
  }, []);

  const handleClearSearch = useCallback(() => {
    setQuery('');
    setSelectedFilters({});
    setCurrentPage(0);
    setShowSuggestions(false);
    clearSuggestions();
  }, [clearSuggestions]);

  const handleResultSelect = useCallback((result: SearchResultWithHighlights) => {
    if (onResultSelect) {
      onResultSelect(result);
    }
  }, [onResultSelect]);

  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page);
  }, []);

  const handleSaveSearch = useCallback(async () => {
    if (!hasQuery) return;
    
    try {
      // Implementation would save the current search configuration
      console.log('Saving search:', { query, selectedFilters, sortConfig });
    } catch (error) {
      console.error('Failed to save search:', error);
    }
  }, [hasQuery, query, selectedFilters, sortConfig]);

  // Render helpers
  const renderSearchInput = () => (
    <div className="relative">
      <div className="relative">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
          {isSearching ? (
            <ArrowPathIcon className="h-5 w-5 animate-spin text-gray-400" />
          ) : (
            <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
          )}
        </div>
        
        <input
          type="text"
          value={query}
          onChange={handleQueryChange}
          onFocus={handleQueryFocus}
          onBlur={handleQueryBlur}
          placeholder={isCompact ? "Search..." : "Search whiteboards, elements, comments..."}
          className={`
            block w-full rounded-lg border-0 py-2 pl-10 pr-12 text-gray-900 
            ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 
            focus:ring-2 focus:ring-inset focus:ring-blue-600 sm:text-sm sm:leading-6
            ${isCompact ? 'py-1.5' : 'py-2'}
          `}
          autoComplete="off"
          spellCheck="false"
        />
        
        <div className="absolute inset-y-0 right-0 flex items-center pr-3 space-x-1">
          {!isCompact && (
            <>
              <button
                type="button"
                onClick={() => setShowFilters(!showFilters)}
                className={`
                  p-1 rounded hover:bg-gray-100 transition-colors
                  ${showFilters ? 'text-blue-600 bg-blue-50' : 'text-gray-400'}
                `}
                title="Search filters"
              >
                <FunnelIcon className="h-4 w-4" />
              </button>
              
              {hasQuery && (
                <button
                  type="button"
                  onClick={handleSaveSearch}
                  className="p-1 rounded hover:bg-gray-100 text-gray-400 transition-colors"
                  title="Save search"
                >
                  <BookmarkIcon className="h-4 w-4" />
                </button>
              )}
            </>
          )}
          
          {hasQuery && (
            <button
              type="button"
              onClick={handleClearSearch}
              className="p-1 rounded hover:bg-gray-100 text-gray-400 transition-colors"
              title="Clear search"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
      
      {/* Search Suggestions */}
      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute z-10 w-full mt-1">
          <SearchSuggestions
            suggestions={suggestions}
            isLoading={isLoadingSuggestions}
            onSelect={handleSuggestionSelect}
            query={query}
          />
        </div>
      )}
    </div>
  );

  const renderSearchStats = () => {
    if (!searchResults || !hasQuery) return null;
    
    return (
      <div className="flex items-center justify-between py-3 border-b border-gray-200">
        <div className="flex items-center space-x-4 text-sm text-gray-600">
          <span>
            {searchResults.total.toLocaleString()} result{searchResults.total !== 1 ? 's' : ''}
          </span>
          {searchResults.searchMetadata.executionTimeMs && (
            <span>
              ({searchResults.searchMetadata.executionTimeMs}ms)
            </span>
          )}
          {syntaxType !== 'natural' && (
            <span className="text-xs bg-gray-100 px-2 py-1 rounded">
              {syntaxType.replace('_', ' ')}
            </span>
          )}
        </div>
        
        <div className="flex items-center space-x-2">
          {!isCompact && (
            <select
              value={`${sortConfig.field}-${sortConfig.direction}`}
              onChange={(e) => {
                const [field, direction] = e.target.value.split('-') as [SearchSortType, 'asc' | 'desc'];
                handleSortChange(field, direction);
              }}
              className="text-sm border-gray-300 rounded-md"
            >
              <option value="relevance-desc">Most Relevant</option>
              <option value="date_modified-desc">Recently Modified</option>
              <option value="date_created-desc">Recently Created</option>
              <option value="element_count-desc">Most Elements</option>
              <option value="collaboration_count-desc">Most Collaborative</option>
            </select>
          )}
        </div>
      </div>
    );
  };

  const renderError = () => {
    if (!error) return null;
    
    return (
      <div className="flex items-center space-x-2 p-4 bg-red-50 border border-red-200 rounded-lg">
        <ExclamationTriangleIcon className="h-5 w-5 text-red-400" />
        <div>
          <p className="text-sm font-medium text-red-800">Search Error</p>
          <p className="text-sm text-red-600">{error}</p>
        </div>
      </div>
    );
  };

  return (
    <SearchErrorBoundary
      title="Search Interface Error"
      onError={(error, errorInfo) => {
        console.error('Search interface error:', error, errorInfo);
        // Could send to error monitoring service here
      }}
      showRetry={true}
      showDetails={false}
    >
      <div className={`search-interface ${className}`}>
        {/* Search Input */}
        <div className="search-input-container">
          {renderSearchInput()}
        </div>

        {/* Filter Panel */}
        {showFilters && !isCompact && (
          <SearchErrorBoundary title="Filter Panel Error" showDetails={false}>
            <div className="mt-4">
              <FilterPanel
                filters={selectedFilters}
                onFilterChange={handleFilterChange}
                syntaxType={syntaxType}
                onSyntaxChange={setSyntaxType}
                workspaceId={workspaceId}
                userId={userId}
              />
            </div>
          </SearchErrorBoundary>
        )}

        {/* Saved Searches */}
        {showSaved && showSavedSearches && !isCompact && (
          <SearchErrorBoundary title="Saved Searches Error" showDetails={false}>
            <div className="mt-4">
              <SavedSearches
                workspaceId={workspaceId}
                userId={userId}
                onSearchSelect={(savedSearch) => {
                  setQuery(savedSearch.searchQuery);
                  setSelectedFilters(savedSearch.searchFilters);
                  setSortConfig(savedSearch.sortConfig || { field: 'relevance', direction: 'desc' });
                }}
              />
            </div>
          </SearchErrorBoundary>
        )}

        {/* Search Results */}
        {(hasQuery || hasResults) && (
          <SearchErrorBoundary title="Search Results Error" showDetails={false}>
            <div className="mt-4">
              {renderError()}
              {renderSearchStats()}
              
              <SearchResults
                results={searchResults}
                isLoading={isSearching}
                onResultSelect={handleResultSelect}
                onPageChange={handlePageChange}
                currentPage={currentPage}
                variant={isCompact ? 'compact' : 'full'}
                showPreviews={!isCompact}
                showMetadata={!isCompact}
                maxResults={maxResults}
              />
            </div>
          </SearchErrorBoundary>
        )}

        {/* Quick Actions */}
        {!isCompact && hasQuery && (
          <div className="mt-4 flex items-center justify-between">
            <div className="flex items-center space-x-2 text-xs text-gray-500">
              {showHistory && searchHistory.length > 0 && (
                <button
                  onClick={() => setShowHistoryPanel(!showHistory)}
                  className="flex items-center space-x-1 hover:text-gray-700"
                >
                  <ClockIcon className="h-3 w-3" />
                  <span>Recent searches</span>
                </button>
              )}
            </div>
            
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                <AdjustmentsHorizontalIcon className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </SearchErrorBoundary>
  );
};

export default SearchInterface;