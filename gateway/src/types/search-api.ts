/**
 * Search API Types
 * 
 * Gateway-specific types for search API endpoints, extending and adapting
 * core search types for REST API usage with proper request/response formatting.
 */

import { z } from 'zod';
import { 
  UnifiedSearchRequest,
  UnifiedSearchResponse,
  SearchResult,
  SearchAggregations,
  ContentType 
} from '@mcp-tools/core';

// ============================================================================
// API Request Types
// ============================================================================

/**
 * HTTP headers for search requests
 */
export interface SearchRequestHeaders {
  'user-id'?: string;
  'session-id'?: string;
  'x-request-id'?: string;
  'authorization'?: string;
}

/**
 * Search suggestions request parameters
 */
export const SearchSuggestionsRequestSchema = z.object({
  /** Query prefix for suggestions */
  q: z.string().min(1).max(100).optional(),
  /** Maximum number of suggestions to return */
  limit: z.coerce.number().int().min(1).max(20).default(5),
  /** User ID for personalized suggestions */
  user_id: z.string().uuid().optional(),
  /** Include popular searches */
  include_popular: z.coerce.boolean().default(true),
  /** Include query completions */
  include_completions: z.coerce.boolean().default(true),
  /** Include related searches */
  include_related: z.coerce.boolean().default(true)
});

export type SearchSuggestionsRequest = z.infer<typeof SearchSuggestionsRequestSchema>;

/**
 * Search analytics request parameters
 */
export const SearchAnalyticsRequestSchema = z.object({
  /** Filter by user ID */
  user_id: z.string().uuid().optional(),
  /** Start date for analytics range */
  date_from: z.string().datetime().optional(),
  /** End date for analytics range */
  date_to: z.string().datetime().optional(),
  /** Include performance metrics */
  include_performance: z.coerce.boolean().default(false),
  /** Include popular queries */
  include_popular_queries: z.coerce.boolean().default(true),
  /** Include query trends */
  include_trends: z.coerce.boolean().default(false),
  /** Group results by time period */
  group_by: z.enum(['hour', 'day', 'week', 'month']).default('day')
});

export type SearchAnalyticsRequest = z.infer<typeof SearchAnalyticsRequestSchema>;

// ============================================================================
// API Response Types
// ============================================================================

/**
 * Standard API response wrapper
 */
export interface ApiResponse<T = any> {
  /** Request success status */
  success: boolean;
  /** Response data */
  data?: T;
  /** Error information if request failed */
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  /** Response metadata */
  meta?: {
    timestamp: string;
    request_id?: string;
    processing_time_ms?: number;
  };
}

/**
 * Enhanced search response with API metadata
 */
export interface SearchApiResponse extends ApiResponse<UnifiedSearchResponse> {
  /** Search-specific metadata */
  meta: {
    timestamp: string;
    request_id?: string;
    processing_time_ms: number;
    gateway_version: string;
    search_version: string;
    cache_hit: boolean;
    services_queried: string[];
  };
}

/**
 * Search suggestion item
 */
export const SearchSuggestionSchema = z.object({
  /** Suggested query text */
  query: z.string(),
  /** Suggestion type */
  type: z.enum(['completion', 'popular', 'related', 'corrected']),
  /** Confidence score (0.0 to 1.0) */
  confidence: z.number().min(0).max(1),
  /** Additional context or reason for suggestion */
  context: z.string().optional(),
  /** Expected result count for this query */
  estimated_results: z.number().int().min(0).optional()
});

export type SearchSuggestion = z.infer<typeof SearchSuggestionSchema>;

/**
 * Search suggestions response
 */
export interface SearchSuggestionsResponse extends ApiResponse {
  data: {
    /** Array of search suggestions */
    suggestions: SearchSuggestion[];
    /** Original query prefix (if provided) */
    query_prefix?: string;
    /** Total number of suggestions generated */
    total_suggestions: number;
    /** Whether suggestions are personalized */
    personalized: boolean;
    /** Categories of suggestions included */
    categories: {
      completions: number;
      popular: number;
      related: number;
      corrections: number;
    };
  };
}

/**
 * Search analytics data point
 */
export const SearchAnalyticsDataPointSchema = z.object({
  /** Time period for this data point */
  timestamp: z.string().datetime(),
  /** Number of searches in this period */
  search_count: z.number().int().min(0),
  /** Number of unique users in this period */
  unique_users: z.number().int().min(0),
  /** Average response time in ms */
  avg_response_time: z.number().min(0),
  /** Most popular query in this period */
  top_query: z.string().optional()
});

export type SearchAnalyticsDataPoint = z.infer<typeof SearchAnalyticsDataPointSchema>;

/**
 * Popular query analytics
 */
export const PopularQuerySchema = z.object({
  /** Query text */
  query: z.string(),
  /** Number of times searched */
  count: z.number().int().min(1),
  /** Average number of results returned */
  avg_results: z.number().min(0),
  /** Average response time in ms */
  avg_response_time: z.number().min(0),
  /** Percentage of total searches */
  percentage: z.number().min(0).max(100),
  /** Trend compared to previous period */
  trend: z.enum(['up', 'down', 'stable']).optional()
});

export type PopularQuery = z.infer<typeof PopularQuerySchema>;

/**
 * Search analytics response
 */
export interface SearchAnalyticsResponse extends ApiResponse {
  data: {
    /** Time series data */
    timeline: SearchAnalyticsDataPoint[];
    /** Popular queries in the period */
    popular_queries: PopularQuery[];
    /** Summary statistics */
    summary: {
      total_searches: number;
      unique_users: number;
      avg_response_time: number;
      success_rate: number;
      most_searched_type: ContentType;
    };
    /** Performance metrics (if requested) */
    performance?: {
      cache_hit_rate: number;
      p95_response_time: number;
      error_rate: number;
      service_availability: Record<string, number>;
    };
    /** Date range covered */
    date_range: {
      from: string;
      to: string;
      period: string;
    };
  };
}

/**
 * Cache operation response
 */
export interface CacheOperationResponse extends ApiResponse {
  data: {
    /** Operation performed */
    operation: 'clear' | 'stats';
    /** Result of the operation */
    result: 'success' | 'failed';
    /** Cache statistics (for stats operation) */
    stats?: {
      entries: number;
      hit_rate: number;
      memory_usage: number;
      last_cleanup: string;
    };
    /** Operation timestamp */
    timestamp: string;
  };
}

/**
 * Search health check response
 */
export interface SearchHealthResponse extends ApiResponse {
  data: {
    /** Overall health status */
    status: 'healthy' | 'degraded' | 'unhealthy';
    /** Individual service statuses */
    services: {
      memory: 'available' | 'unavailable';
      kanban: 'available' | 'unavailable';
      wiki: 'available' | 'unavailable';
      scraper: 'available' | 'unavailable';
    };
    /** Search service features */
    features: {
      caching: boolean;
      analytics: boolean;
      semantic_search: boolean;
      fuzzy_search: boolean;
    };
    /** Performance indicators */
    performance: {
      avg_response_time: number;
      cache_hit_rate?: number;
      uptime_seconds: number;
    };
    /** Check timestamp */
    timestamp: string;
  };
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Search-specific error codes
 */
export enum SearchErrorCode {
  // Validation errors
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  SEARCH_VALIDATION_ERROR = 'SEARCH_VALIDATION_ERROR',
  SUGGESTIONS_VALIDATION_ERROR = 'SUGGESTIONS_VALIDATION_ERROR',
  ANALYTICS_VALIDATION_ERROR = 'ANALYTICS_VALIDATION_ERROR',
  
  // Rate limiting errors
  SEARCH_RATE_LIMITED = 'SEARCH_RATE_LIMITED',
  CACHE_RATE_LIMITED = 'CACHE_RATE_LIMITED',
  ANALYTICS_RATE_LIMITED = 'ANALYTICS_RATE_LIMITED',
  
  // Service errors
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  SEARCH_FAILED = 'SEARCH_FAILED',
  SEARCH_TIMEOUT = 'SEARCH_TIMEOUT',
  SUGGESTIONS_FAILED = 'SUGGESTIONS_FAILED',
  ANALYTICS_FAILED = 'ANALYTICS_FAILED',
  CACHE_CLEAR_FAILED = 'CACHE_CLEAR_FAILED',
  
  // Configuration errors
  INVALID_DATE_RANGE = 'INVALID_DATE_RANGE',
  DATE_RANGE_TOO_LARGE = 'DATE_RANGE_TOO_LARGE',
  
  // Generic errors
  HEALTH_CHECK_FAILED = 'HEALTH_CHECK_FAILED',
  INTERNAL_ERROR = 'INTERNAL_ERROR'
}

/**
 * Structured error response
 */
export interface SearchErrorResponse extends ApiResponse {
  success: false;
  error: {
    code: SearchErrorCode;
    message: string;
    details?: any;
    retry_after_seconds?: number;
    suggestions?: string[];
  };
}

// ============================================================================
// Request Context Types
// ============================================================================

/**
 * Extended Express Request with search context
 */
export interface SearchRequest extends Request {
  searchMeta?: {
    sanitized_query: string;
    has_filters: boolean;
    is_semantic: boolean;
    is_fuzzy: boolean;
    request_timestamp: string;
  };
  user?: {
    id: string;
    permissions: string[];
  };
  session?: {
    id: string;
    created_at: string;
  };
}

/**
 * Search request context for analytics
 */
export interface SearchRequestContext {
  /** Request ID for tracking */
  request_id: string;
  /** User ID if authenticated */
  user_id?: string;
  /** Session ID */
  session_id?: string;
  /** Client IP address */
  ip_address: string;
  /** User agent string */
  user_agent: string;
  /** Request timestamp */
  timestamp: string;
  /** Request path */
  path: string;
  /** Request method */
  method: string;
}

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Gateway search configuration
 */
export interface GatewaySearchConfiguration {
  /** Enable search caching */
  caching: {
    enabled: boolean;
    max_entries: number;
    default_ttl: number;
    cleanup_interval: number;
  };
  /** Enable search analytics */
  analytics: {
    enabled: boolean;
    retention_days: number;
    track_queries: boolean;
    track_performance: boolean;
  };
  /** Rate limiting settings */
  rate_limiting: {
    search_requests_per_window: number;
    cache_operations_per_window: number;
    analytics_requests_per_window: number;
    window_size_minutes: number;
  };
  /** Search timeouts */
  timeouts: {
    request_timeout_ms: number;
    search_timeout_ms: number;
    service_timeout_ms: number;
  };
  /** Result limits */
  limits: {
    max_results_per_page: number;
    max_query_length: number;
    max_date_range_days: number;
  };
}

// ============================================================================
// Export Schema Objects
// ============================================================================

export const SearchApiSchemas = {
  SearchSuggestionsRequest: SearchSuggestionsRequestSchema,
  SearchAnalyticsRequest: SearchAnalyticsRequestSchema,
  SearchSuggestion: SearchSuggestionSchema,
  SearchAnalyticsDataPoint: SearchAnalyticsDataPointSchema,
  PopularQuery: PopularQuerySchema
} as const;

export default {
  SearchErrorCode,
  SearchApiSchemas
};