/**
 * Unified Search Service Module
 * 
 * Comprehensive unified search system that aggregates and ranks results 
 * from all content sources (Memory, Kanban, Wiki, Scraper) to provide 
 * a seamless search experience across the entire platform.
 * 
 * @example
 * ```typescript
 * import { createUnifiedSearchService } from '@mcp-tools/core';
 * 
 * const unifiedSearch = createUnifiedSearchService(
 *   memoryService,
 *   kanbanService, 
 *   wikiService,
 *   scraperService,
 *   {
 *     enableCaching: true,
 *     enableAnalytics: true,
 *     maxSearchTimeoutMs: 10000
 *   }
 * );
 * 
 * const results = await unifiedSearch.searchAcrossSystem({
 *   query: 'machine learning algorithms',
 *   filters: { content_types: ['wiki_page', 'scraped_page'] },
 *   use_semantic: true,
 *   pagination: { page: 1, limit: 20 }
 * });
 * ```
 */

// Core service exports
export { 
  UnifiedSearchService,
  createUnifiedSearchService,
  type UnifiedSearchConfig 
} from './UnifiedSearchService.js';

// Query processing exports
export { 
  QueryProcessor,
  type ProcessedQuery,
  type QueryIntent,
  type SearchStrategy,
  type QuerySuggestion,
  type QueryEnhancementOptions
} from './QueryProcessor.js';

// Result merging exports
export { 
  ResultMerger,
  type SearchSourceResult,
  type RankingConfig
} from './ResultMerger.js';

// Analytics exports
export { 
  SearchAnalytics,
  createSearchAnalytics,
  type SearchEvent,
  type SearchAnalyticsConfig,
  type SearchAnalyticsData
} from './SearchAnalytics.js';

// Caching exports
export { 
  CacheService,
  createCacheService,
  type CacheStats,
  type CacheConfig
} from './CacheService.js';

// Re-export search types from shared types for convenience
export type {
  UnifiedSearchRequest,
  UnifiedSearchResponse,
  SearchResult,
  SearchScore,
  SearchFilters,
  SearchSort,
  SearchPagination,
  ContentType,
  ContentPreview,
  SearchAggregations,
  SearchQueryAnalytics,
  SearchPerformanceMetrics
} from '../../shared/types/search.js';

/**
 * Default configuration for unified search service
 */
export const DEFAULT_UNIFIED_SEARCH_CONFIG: UnifiedSearchConfig = {
  enableCaching: true,
  enableAnalytics: true,
  maxSearchTimeoutMs: 10000, // 10 seconds
  maxResultsPerPage: 100,
  similarityThreshold: 0.8,
  cacheConfig: {
    maxEntries: 1000,
    defaultTtl: 5 * 60 * 1000 // 5 minutes
  }
};

/**
 * Utility function to validate search query
 */
export function validateSearchQuery(query: string): boolean {
  if (!query || typeof query !== 'string') {
    return false;
  }
  
  const trimmed = query.trim();
  return trimmed.length > 0 && trimmed.length <= 1000;
}

/**
 * Utility function to create optimal search filters based on query
 */
export function createOptimalFilters(
  query: string,
  userPreferences?: {
    preferredContentTypes?: ContentType[];
    dateRange?: { from: string; to: string };
    language?: string;
  }
): SearchFilters {
  const filters: SearchFilters = {};

  // Apply user preferences
  if (userPreferences?.preferredContentTypes?.length) {
    filters.content_types = userPreferences.preferredContentTypes;
  }

  if (userPreferences?.dateRange) {
    filters.date_from = userPreferences.dateRange.from;
    filters.date_to = userPreferences.dateRange.to;
  }

  if (userPreferences?.language) {
    filters.language = userPreferences.language;
  }

  // Infer filters from query content
  const queryLower = query.toLowerCase();

  // Code-related queries
  if (/\b(code|function|class|algorithm|programming)\b/.test(queryLower)) {
    if (!filters.content_types) {
      filters.content_types = ['code_file', 'code_chunk', 'wiki_page'];
    }
  }

  // Task-related queries
  if (/\b(task|todo|project|card|board)\b/.test(queryLower)) {
    if (!filters.content_types) {
      filters.content_types = ['kanban_card'];
    }
  }

  // Documentation queries
  if (/\b(documentation|docs|guide|tutorial|manual)\b/.test(queryLower)) {
    if (!filters.content_types) {
      filters.content_types = ['wiki_page', 'scraped_page'];
    }
  }

  return filters;
}

/**
 * Utility function to format search results for display
 */
export function formatSearchResultsForDisplay(
  response: UnifiedSearchResponse
): {
  formattedResults: Array<{
    id: string;
    title: string;
    preview: string;
    type: string;
    relevanceScore: number;
    url?: string;
    createdAt: string;
    source: string;
  }>;
  metadata: {
    totalResults: number;
    processingTime: number;
    currentPage: number;
    totalPages: number;
    hasMore: boolean;
  };
} {
  return {
    formattedResults: response.results.map(result => ({
      id: result.id,
      title: result.title,
      preview: result.preview?.text || '',
      type: result.type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()),
      relevanceScore: Math.round(result.score.relevance * 100),
      url: result.url,
      createdAt: new Date(result.metadata.created_at).toLocaleDateString(),
      source: (result.metadata as any).source || 'unknown'
    })),
    metadata: {
      totalResults: response.total_count,
      processingTime: response.performance.processing_time_ms,
      currentPage: response.pagination.current_page,
      totalPages: response.pagination.total_pages,
      hasMore: response.pagination.has_next
    }
  };
}

/**
 * Utility function to extract search insights from analytics
 */
export function extractSearchInsights(analytics: SearchAnalyticsData): {
  topQueries: string[];
  averageResponseTime: number;
  successRate: number;
  popularContentTypes: Array<{ type: ContentType; percentage: number }>;
  searchTrends: Array<{ date: string; count: number }>;
} {
  const topQueries = analytics.popularTerms
    .slice(0, 5)
    .map(term => term.term);

  const totalQueries = analytics.performance.total_queries;
  const totalContentResults = Object.values(analytics.userBehavior.contentTypePreferences)
    .reduce((sum, count) => sum + count, 0);

  const popularContentTypes = Object.entries(analytics.userBehavior.contentTypePreferences)
    .map(([type, count]) => ({
      type: type as ContentType,
      percentage: Math.round((count / totalContentResults) * 100)
    }))
    .sort((a, b) => b.percentage - a.percentage)
    .slice(0, 5);

  return {
    topQueries,
    averageResponseTime: analytics.performance.avg_response_time_ms,
    successRate: Math.round(analytics.performance.success_rate * 100),
    popularContentTypes,
    searchTrends: analytics.trends.slice(-7) // Last 7 days
  };
}

/**
 * Module metadata
 */
export const MODULE_INFO = {
  name: 'UnifiedSearchService',
  version: '1.0.0',
  description: 'Comprehensive unified search system for aggregating results across all content sources',
  features: [
    'Multi-source search aggregation',
    'Intelligent result ranking and deduplication', 
    'Query processing and enhancement',
    'Real-time search analytics',
    'Performance-optimized caching',
    'Semantic and fuzzy search capabilities',
    'Comprehensive error handling',
    'Extensible architecture'
  ],
  supportedContentTypes: [
    'memory_thought',
    'kanban_card', 
    'wiki_page',
    'scraped_page',
    'scraped_content_chunk',
    'code_file',
    'code_chunk'
  ] as ContentType[]
};

// Export module info for runtime inspection
export default MODULE_INFO;