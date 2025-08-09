/**
 * Search API Client Functions
 * 
 * API client functions for all search operations
 */

import { 
  UnifiedSearchRequest,
  UnifiedSearchResponse,
  SearchQueryAnalytics,
  SearchPerformanceMetrics
} from '@mcp-tools/core';
import { apiClient } from '@/lib/api-client';
import { SearchSuggestion, SearchAnalyticsData, DateRange } from '../types';

// ============================================================================
// Core Search API
// ============================================================================

/**
 * Perform unified search across all content types
 */
export async function performSearch(request: UnifiedSearchRequest): Promise<UnifiedSearchResponse> {
  try {
    const response = await apiClient.post('/api/search/unified', request);
    return response.data.data;
  } catch (error) {
    console.error('Search API error:', error);
    throw new Error(error instanceof Error ? error.message : 'Search failed');
  }
}

/**
 * Get search suggestions for autocomplete
 */
export async function getSearchSuggestions(
  query: string, 
  limit: number = 10
): Promise<SearchSuggestion[]> {
  try {
    const response = await apiClient.get('/api/search/suggestions', {
      params: { query, limit }
    });
    
    // Transform backend suggestions to frontend format
    return response.data.data.map((suggestion: any) => ({
      id: suggestion.id || `${suggestion.type}_${suggestion.query}`,
      query: suggestion.query,
      type: suggestion.type,
      confidence: suggestion.confidence,
      resultCount: suggestion.result_count,
      metadata: suggestion.metadata
    }));
  } catch (error) {
    console.error('Suggestions API error:', error);
    return [];
  }
}

/**
 * Get popular search queries
 */
export async function getPopularQueries(limit: number = 20): Promise<SearchSuggestion[]> {
  try {
    const response = await apiClient.get('/api/search/popular', {
      params: { limit }
    });
    
    return response.data.data.map((query: any) => ({
      id: `popular_${query.term}`,
      query: query.term,
      type: 'popular' as const,
      confidence: Math.min(query.count / 100, 1), // Normalize to 0-1
      resultCount: query.avg_results
    }));
  } catch (error) {
    console.error('Popular queries API error:', error);
    return [];
  }
}

// ============================================================================
// Search Analytics API
// ============================================================================

/**
 * Get search analytics data
 */
export async function getSearchAnalytics(
  dateRange?: DateRange,
  userId?: string
): Promise<SearchAnalyticsData> {
  try {
    const params: any = {};
    if (dateRange) {
      params.from = dateRange.from.toISOString();
      params.to = dateRange.to.toISOString();
    }
    if (userId) {
      params.user_id = userId;
    }
    
    const response = await apiClient.get('/api/search/analytics', { params });
    const data = response.data.data;
    
    // Transform backend data to frontend format
    return {
      totalSearches: data.total_searches,
      averageResponseTime: data.avg_response_time_ms,
      popularQueries: data.popular_terms.map((term: any) => ({
        query: term.term,
        count: term.count,
        avgResults: term.avg_results
      })),
      typeDistribution: data.type_distribution || {},
      successRate: data.success_rate,
      topTags: data.top_tags || [],
      dailyStats: data.daily_stats || []
    };
  } catch (error) {
    console.error('Analytics API error:', error);
    throw new Error('Failed to fetch search analytics');
  }
}

/**
 * Get search performance metrics
 */
export async function getSearchPerformanceMetrics(): Promise<SearchPerformanceMetrics> {
  try {
    const response = await apiClient.get('/api/search/performance');
    return response.data.data;
  } catch (error) {
    console.error('Performance metrics API error:', error);
    throw new Error('Failed to fetch performance metrics');
  }
}

/**
 * Record search query for analytics
 */
export async function recordSearchQuery(
  query: string,
  resultsCount: number,
  processingTimeMs: number,
  userId?: string
): Promise<void> {
  try {
    await apiClient.post('/api/search/analytics/record', {
      query,
      results_count: resultsCount,
      processing_time_ms: processingTimeMs,
      user_id: userId
    });
  } catch (error) {
    console.warn('Failed to record search query:', error);
    // Don't throw - analytics recording shouldn't break search
  }
}

// ============================================================================
// Cache Management API
// ============================================================================

/**
 * Clear search cache
 */
export async function clearSearchCache(): Promise<void> {
  try {
    await apiClient.delete('/api/search/cache');
  } catch (error) {
    console.error('Cache clear API error:', error);
    throw new Error('Failed to clear search cache');
  }
}

/**
 * Get cache statistics
 */
export async function getCacheStats(): Promise<{
  totalEntries: number;
  hitRate: number;
  memoryUsage: number;
}> {
  try {
    const response = await apiClient.get('/api/search/cache/stats');
    return response.data.data;
  } catch (error) {
    console.error('Cache stats API error:', error);
    throw new Error('Failed to fetch cache statistics');
  }
}

// ============================================================================
// Health and Status API
// ============================================================================

/**
 * Check search service health
 */
export async function getSearchHealth(): Promise<{
  status: 'healthy' | 'degraded' | 'unhealthy';
  services: Record<string, boolean>;
  responseTime: number;
}> {
  try {
    const response = await apiClient.get('/api/search/health');
    return response.data.data;
  } catch (error) {
    console.error('Search health API error:', error);
    return {
      status: 'unhealthy',
      services: {},
      responseTime: -1
    };
  }
}

/**
 * Get search index statistics
 */
export async function getIndexStats(): Promise<{
  totalDocuments: number;
  indexSize: number;
  lastIndexed: string;
  contentTypes: Record<string, number>;
}> {
  try {
    const response = await apiClient.get('/api/search/index/stats');
    return response.data.data;
  } catch (error) {
    console.error('Index stats API error:', error);
    throw new Error('Failed to fetch index statistics');
  }
}

// ============================================================================
// Error Types
// ============================================================================

export class SearchAPIError extends Error {
  constructor(
    message: string,
    public status?: number,
    public code?: string
  ) {
    super(message);
    this.name = 'SearchAPIError';
  }
}

export class SearchTimeoutError extends SearchAPIError {
  constructor() {
    super('Search request timed out', 408, 'SEARCH_TIMEOUT');
  }
}

export class SearchValidationError extends SearchAPIError {
  constructor(message: string) {
    super(`Search validation error: ${message}`, 400, 'VALIDATION_ERROR');
  }
}