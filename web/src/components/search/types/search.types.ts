/**
 * Frontend Search Types
 * 
 * Extended types for the React search interface components
 */

import { 
  UnifiedSearchRequest,
  UnifiedSearchResponse,
  SearchResult,
  SearchFilters,
  SearchSort,
  SearchAggregations,
  ContentType
} from '@mcp-tools/core';

// ============================================================================
// Component-specific Types
// ============================================================================

/**
 * Search input component props
 */
export interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (query: string) => void;
  placeholder?: string;
  suggestions?: SearchSuggestion[];
  isLoading?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  showSuggestions?: boolean;
  className?: string;
  onSuggestionSelect?: (suggestion: SearchSuggestion) => void;
  onClear?: () => void;
  maxLength?: number;
}

/**
 * Search filters component props
 */
export interface SearchFiltersProps {
  filters: SearchFilters;
  onChange: (filters: SearchFilters) => void;
  availableTypes: ContentType[];
  isLoading?: boolean;
  showAdvanced?: boolean;
  onToggleAdvanced?: () => void;
  className?: string;
  onReset?: () => void;
}

/**
 * Search results component props
 */
export interface SearchResultsProps {
  results: SearchResult[];
  totalCount: number;
  isLoading: boolean;
  error?: string;
  pagination: PaginationData;
  onPageChange: (page: number) => void;
  onSortChange: (sort: SearchSort) => void;
  onResultClick: (result: SearchResult) => void;
  className?: string;
  showAggregations?: boolean;
  aggregations?: SearchAggregations;
  onFilterByType?: (type: ContentType) => void;
  onFilterByTag?: (tag: string) => void;
}

/**
 * Search result card component props
 */
export interface SearchResultCardProps {
  result: SearchResult;
  onClick: (result: SearchResult) => void;
  className?: string;
  showPreview?: boolean;
  showMetadata?: boolean;
  showRelationships?: boolean;
  isSelected?: boolean;
  onSelect?: (result: SearchResult, selected: boolean) => void;
}

/**
 * Search pagination component props
 */
export interface SearchPaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  hasNext: boolean;
  hasPrev: boolean;
  className?: string;
  showPageSizeSelector?: boolean;
  showItemCount?: boolean;
  maxPaginationLinks?: number;
}

/**
 * Search suggestions component props
 */
export interface SearchSuggestionsProps {
  query: string;
  suggestions: SearchSuggestion[];
  isVisible: boolean;
  isLoading: boolean;
  onSuggestionSelect: (suggestion: SearchSuggestion) => void;
  onClose: () => void;
  className?: string;
  maxSuggestions?: number;
  showTypes?: boolean;
}

/**
 * Search analytics component props
 */
export interface SearchAnalyticsProps {
  className?: string;
  dateRange?: DateRange;
  onDateRangeChange?: (range: DateRange) => void;
  refreshInterval?: number;
  showExportOptions?: boolean;
}

// ============================================================================
// Hook Types
// ============================================================================

/**
 * useSearch hook options
 */
export interface UseSearchOptions {
  initialQuery?: string;
  initialFilters?: SearchFilters;
  autoSearch?: boolean;
  debounceMs?: number;
  enableAnalytics?: boolean;
  enableCache?: boolean;
  maxRetries?: number;
}

/**
 * useSearch hook return type
 */
export interface UseSearchReturn {
  // State
  query: string;
  filters: SearchFilters;
  results: SearchResult[];
  totalCount: number;
  isLoading: boolean;
  error: string | null;
  pagination: PaginationData;
  aggregations: SearchAggregations | null;
  
  // Actions
  setQuery: (query: string) => void;
  setFilters: (filters: SearchFilters) => void;
  performSearch: () => Promise<void>;
  clearResults: () => void;
  retrySearch: () => void;
  
  // Pagination
  goToPage: (page: number) => void;
  changePageSize: (size: number) => void;
  
  // Sorting
  changeSort: (sort: SearchSort) => void;
  
  // Performance
  lastSearchTime: number | null;
  searchCount: number;
}

/**
 * useSearchSuggestions hook return type
 */
export interface UseSearchSuggestionsReturn {
  suggestions: SearchSuggestion[];
  isLoading: boolean;
  error: string | null;
  fetchSuggestions: (query: string) => Promise<void>;
  clearSuggestions: () => void;
}

/**
 * useSearchAnalytics hook return type
 */
export interface UseSearchAnalyticsReturn {
  metrics: SearchAnalyticsData | null;
  isLoading: boolean;
  error: string | null;
  refreshMetrics: () => Promise<void>;
  dateRange: DateRange;
  setDateRange: (range: DateRange) => void;
}

// ============================================================================
// Data Types
// ============================================================================

/**
 * Search suggestion
 */
export interface SearchSuggestion {
  id: string;
  query: string;
  type: 'completion' | 'spelling' | 'related' | 'popular';
  confidence: number;
  resultCount?: number;
  metadata?: {
    contentType?: ContentType;
    tags?: string[];
    category?: string;
  };
}

/**
 * Pagination data
 */
export interface PaginationData {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
  hasNext: boolean;
  hasPrev: boolean;
}

/**
 * Sort option
 */
export interface SortOption {
  key: SearchSort;
  label: string;
  direction?: 'asc' | 'desc';
}

/**
 * Date range for filtering and analytics
 */
export interface DateRange {
  from: Date;
  to: Date;
}

/**
 * Search analytics data
 */
export interface SearchAnalyticsData {
  totalSearches: number;
  averageResponseTime: number;
  popularQueries: Array<{
    query: string;
    count: number;
    avgResults: number;
  }>;
  typeDistribution: Record<ContentType, number>;
  successRate: number;
  topTags: Array<{
    tag: string;
    count: number;
  }>;
  dailyStats: Array<{
    date: string;
    searches: number;
    avgResponseTime: number;
  }>;
}

/**
 * Search component state
 */
export interface SearchState {
  query: string;
  filters: SearchFilters;
  sort: SearchSort;
  pagination: PaginationData;
  results: SearchResult[];
  isLoading: boolean;
  error: string | null;
  lastSearch: Date | null;
}

/**
 * Search context type for provider
 */
export interface SearchContextType {
  state: SearchState;
  actions: {
    search: (request: UnifiedSearchRequest) => Promise<void>;
    setQuery: (query: string) => void;
    setFilters: (filters: SearchFilters) => void;
    setSort: (sort: SearchSort) => void;
    goToPage: (page: number) => void;
    clearResults: () => void;
    reset: () => void;
  };
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Default sort options
 */
export const SORT_OPTIONS: SortOption[] = [
  { key: 'relevance', label: 'Relevance' },
  { key: 'date_desc', label: 'Date (Newest)' },
  { key: 'date_asc', label: 'Date (Oldest)' },
  { key: 'title_asc', label: 'Title (A-Z)' },
  { key: 'title_desc', label: 'Title (Z-A)' },
  { key: 'quality_desc', label: 'Quality (High to Low)' }
];

/**
 * Page size options
 */
export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

/**
 * Content type labels for UI
 */
export const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  'scraped_page': 'Web Pages',
  'scraped_content_chunk': 'Content Chunks',
  'wiki_page': 'Wiki Pages',
  'kanban_card': 'Kanban Cards',
  'memory_thought': 'Memory Thoughts',
  'code_file': 'Code Files',
  'code_chunk': 'Code Chunks'
};

/**
 * Default search filters
 */
export const DEFAULT_SEARCH_FILTERS: SearchFilters = {};

/**
 * Default pagination
 */
export const DEFAULT_PAGINATION: PaginationData = {
  currentPage: 1,
  totalPages: 0,
  totalItems: 0,
  itemsPerPage: 20,
  hasNext: false,
  hasPrev: false
};