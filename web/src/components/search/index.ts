/**
 * Main Search Components Export
 * 
 * Unified export for all search-related components, hooks, types, and utilities
 */

// ============================================================================
// Core Components
// ============================================================================

// Search Input
export { SearchInput } from './SearchInput';
export { default as SearchInputDefault } from './SearchInput';

// Search Suggestions
export { SearchSuggestions } from './SearchSuggestions';
export { default as SearchSuggestionsDefault } from './SearchSuggestions';

// Search Filters
export { SearchFilters } from './SearchFilters';
export { default as SearchFiltersDefault } from './SearchFilters';

// Search Results
export { SearchResults, SearchResultCard } from './SearchResults';
export { default as SearchResultsDefault } from './SearchResults';

// Search Pagination
export { SearchPagination } from './SearchPagination';
export { default as SearchPaginationDefault } from './SearchPagination';

// Search Analytics
export { SearchAnalytics } from './SearchAnalytics';
export { default as SearchAnalyticsDefault } from './SearchAnalytics';

// ============================================================================
// Common Components
// ============================================================================

export { 
  SearchLoading, 
  SearchEmpty, 
  SearchError 
} from './common';

export { 
  default as SearchLoadingDefault,
  default as SearchEmptyDefault,
  default as SearchErrorDefault
} from './common';

// ============================================================================
// Hooks
// ============================================================================

export {
  useSearch,
  useSearchSuggestions, 
  useSearchAnalytics
} from './hooks';

// ============================================================================
// Types
// ============================================================================

export type {
  // Component Props Types
  SearchInputProps,
  SearchSuggestionsProps,
  SearchFiltersProps,
  SearchResultsProps,
  SearchResultCardProps,
  SearchPaginationProps,
  SearchAnalyticsProps,
  
  // Hook Types
  UseSearchOptions,
  UseSearchReturn,
  UseSearchSuggestionsReturn,
  UseSearchAnalyticsReturn,
  
  // Data Types
  SearchSuggestion,
  PaginationData,
  SortOption,
  DateRange,
  SearchAnalyticsData,
  SearchState,
  SearchContextType
} from './types';

// ============================================================================
// Constants
// ============================================================================

export {
  SORT_OPTIONS,
  PAGE_SIZE_OPTIONS,
  CONTENT_TYPE_LABELS,
  DEFAULT_SEARCH_FILTERS,
  DEFAULT_PAGINATION
} from './types';

// ============================================================================
// Utilities
// ============================================================================

export {
  // Search API
  searchAPI,
  
  // Helper Functions
  formatContentType,
  formatRelativeDate,
  formatDuration,
  formatNumber,
  formatPercentage,
  buildSearchQuery,
  parseSearchFilters,
  validateSearchQuery
} from './utils';