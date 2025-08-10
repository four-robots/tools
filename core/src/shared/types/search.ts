/**
 * Unified Search System Types
 * 
 * Comprehensive types for the unified search functionality across
 * scraped content, wiki pages, kanban cards, and memory thoughts.
 */

import { z } from 'zod';

// ============================================================================
// Base Search Types
// ============================================================================

/**
 * Supported content types for unified search
 */
export const ContentTypeSchema = z.enum([
  'scraped_page',
  'scraped_content_chunk', 
  'wiki_page',
  'kanban_card',
  'memory_thought',
  'code_file',
  'code_chunk'
]);

export type ContentType = z.infer<typeof ContentTypeSchema>;

/**
 * Search result ranking and scoring
 */
export const SearchScoreSchema = z.object({
  /** Overall relevance score (0.0 to 1.0) */
  relevance: z.number().min(0).max(1),
  /** Vector similarity score (0.0 to 1.0) */
  semantic_similarity: z.number().min(0).max(1).optional(),
  /** Text matching score (0.0 to 1.0) */
  text_match: z.number().min(0).max(1).optional(),
  /** Recency boost factor */
  recency_boost: z.number().min(0).max(1).optional(),
  /** Content quality score */
  quality_score: z.number().min(0).max(1).optional()
});

export type SearchScore = z.infer<typeof SearchScoreSchema>;

// ============================================================================
// Search Request Types
// ============================================================================

/**
 * Search filtering options
 */
export const SearchFiltersSchema = z.object({
  /** Filter by content types */
  content_types: z.array(ContentTypeSchema).optional(),
  /** Filter by date range */
  date_from: z.string().datetime().optional(),
  date_to: z.string().datetime().optional(),
  /** Filter by specific user/creator */
  created_by: z.string().uuid().optional(),
  /** Filter by tags */
  tags: z.array(z.string()).optional(),
  /** Filter by minimum quality score */
  min_quality: z.number().min(0).max(1).optional(),
  /** Language filter for code content */
  language: z.string().optional(),
  /** Repository filter for code content */
  repository: z.string().optional()
});

export type SearchFilters = z.infer<typeof SearchFiltersSchema>;

/**
 * Search sorting options
 */
export const SearchSortSchema = z.enum([
  'relevance',
  'date_desc',
  'date_asc',
  'title_asc',
  'title_desc',
  'quality_desc'
]);

export type SearchSort = z.infer<typeof SearchSortSchema>;

/**
 * Pagination options for search results
 */
export const SearchPaginationSchema = z.object({
  /** Page number (1-based) */
  page: z.number().int().min(1).default(1),
  /** Results per page */
  limit: z.number().int().min(1).max(100).default(20),
  /** Offset for cursor-based pagination */
  offset: z.number().int().min(0).optional()
});

export type SearchPagination = z.infer<typeof SearchPaginationSchema>;

/**
 * Comprehensive unified search request
 */
export const UnifiedSearchRequestSchema = z.object({
  /** Search query text */
  query: z.string().min(1).max(1000),
  /** Search filters */
  filters: SearchFiltersSchema.optional(),
  /** Sorting preference */
  sort: SearchSortSchema.default('relevance'),
  /** Pagination options */
  pagination: SearchPaginationSchema.default({}),
  /** Enable semantic search using vector embeddings */
  use_semantic: z.boolean().default(true),
  /** Enable fuzzy text matching */
  use_fuzzy: z.boolean().default(true),
  /** Include content preview in results */
  include_preview: z.boolean().default(true),
  /** Include highlighted matches */
  include_highlights: z.boolean().default(true),
  /** User ID for personalization and analytics */
  user_id: z.string().uuid().optional()
});

export type UnifiedSearchRequest = z.infer<typeof UnifiedSearchRequestSchema>;

// ============================================================================
// Search Result Types
// ============================================================================

/**
 * Content preview with highlighting
 */
export const ContentPreviewSchema = z.object({
  /** Preview text (truncated if needed) */
  text: z.string(),
  /** Highlighted query matches */
  highlights: z.array(z.object({
    start: z.number(),
    end: z.number(),
    match: z.string()
  })).optional(),
  /** Preview length in characters */
  length: z.number(),
  /** Whether content was truncated */
  truncated: z.boolean()
});

export type ContentPreview = z.infer<typeof ContentPreviewSchema>;

/**
 * Individual search result
 */
export const SearchResultSchema = z.object({
  /** Unique result identifier */
  id: z.string().uuid(),
  /** Content type */
  type: ContentTypeSchema,
  /** Result title */
  title: z.string(),
  /** Content preview */
  preview: ContentPreviewSchema.optional(),
  /** Direct URL/link to content */
  url: z.string().optional(),
  /** Search scoring information */
  score: SearchScoreSchema,
  /** Content metadata */
  metadata: z.object({
    /** Creation timestamp */
    created_at: z.string().datetime(),
    /** Last modified timestamp */
    updated_at: z.string().datetime().optional(),
    /** Content creator/author */
    created_by: z.string().uuid().optional(),
    /** Associated tags */
    tags: z.array(z.string()).optional(),
    /** Content language (for code) */
    language: z.string().optional(),
    /** Repository name (for code) */
    repository: z.string().optional(),
    /** File path (for code/files) */
    file_path: z.string().optional(),
    /** Line numbers (for code chunks) */
    line_range: z.object({
      start: z.number(),
      end: z.number()
    }).optional()
  }),
  /** Related/linked content references */
  relationships: z.array(z.object({
    id: z.string().uuid(),
    type: ContentTypeSchema,
    title: z.string(),
    relationship_type: z.string()
  })).optional()
});

export type SearchResult = z.infer<typeof SearchResultSchema>;

/**
 * Search result aggregations and facets
 */
export const SearchAggregationsSchema = z.object({
  /** Count by content type */
  by_type: z.record(ContentTypeSchema, z.number()),
  /** Count by date ranges */
  by_date: z.object({
    last_day: z.number(),
    last_week: z.number(),
    last_month: z.number(),
    older: z.number()
  }),
  /** Top tags found in results */
  top_tags: z.array(z.object({
    tag: z.string(),
    count: z.number()
  })),
  /** Languages for code content */
  languages: z.array(z.object({
    language: z.string(),
    count: z.number()
  })).optional(),
  /** Repositories for code content */
  repositories: z.array(z.object({
    repository: z.string(),
    count: z.number()
  })).optional()
});

export type SearchAggregations = z.infer<typeof SearchAggregationsSchema>;

/**
 * Complete unified search response
 */
export const UnifiedSearchResponseSchema = z.object({
  /** Search results */
  results: z.array(SearchResultSchema),
  /** Total number of matches */
  total_count: z.number().int().min(0),
  /** Current page information */
  pagination: z.object({
    current_page: z.number().int().min(1),
    per_page: z.number().int().min(1),
    total_pages: z.number().int().min(0),
    has_next: z.boolean(),
    has_prev: z.boolean()
  }),
  /** Result aggregations and facets */
  aggregations: SearchAggregationsSchema,
  /** Search performance metrics */
  performance: z.object({
    /** Total query processing time in milliseconds */
    processing_time_ms: z.number().int().min(0),
    /** Time spent on vector search */
    vector_search_ms: z.number().int().min(0).optional(),
    /** Time spent on text search */
    text_search_ms: z.number().int().min(0).optional(),
    /** Number of documents searched */
    documents_searched: z.number().int().min(0)
  }),
  /** Search suggestions for query refinement */
  suggestions: z.array(z.object({
    query: z.string(),
    type: z.enum(['spelling', 'completion', 'related']),
    confidence: z.number().min(0).max(1)
  })).optional(),
  /** Dynamic facets collection (if enabled) */
  facets: z.any().optional() // Will be FacetCollection from dynamic-facets.ts
});

export type UnifiedSearchResponse = z.infer<typeof UnifiedSearchResponseSchema>;

// ============================================================================
// Search Analytics Types
// ============================================================================

/**
 * Search query analytics record
 */
export const SearchQueryAnalyticsSchema = z.object({
  /** Unique query ID */
  id: z.string().uuid(),
  /** Search query text */
  query: z.string(),
  /** User who performed search */
  user_id: z.string().uuid().optional(),
  /** Number of results returned */
  results_count: z.number().int().min(0),
  /** Query processing time in milliseconds */
  processing_time_ms: z.number().int().min(0),
  /** Result types breakdown */
  result_types: z.record(ContentTypeSchema, z.number()),
  /** Query timestamp */
  created_at: z.string().datetime()
});

export type SearchQueryAnalytics = z.infer<typeof SearchQueryAnalyticsSchema>;

/**
 * Search performance metrics
 */
export const SearchPerformanceMetricsSchema = z.object({
  /** Average query response time */
  avg_response_time_ms: z.number(),
  /** 95th percentile response time */
  p95_response_time_ms: z.number(),
  /** Total queries processed */
  total_queries: z.number().int().min(0),
  /** Most common search terms */
  popular_terms: z.array(z.object({
    term: z.string(),
    count: z.number().int(),
    avg_results: z.number()
  })),
  /** Search success rate (queries with results) */
  success_rate: z.number().min(0).max(1)
});

export type SearchPerformanceMetrics = z.infer<typeof SearchPerformanceMetricsSchema>;

// ============================================================================
// Export Schema Objects for Runtime Validation
// ============================================================================

export const SearchSchemas = {
  ContentType: ContentTypeSchema,
  SearchScore: SearchScoreSchema,
  SearchFilters: SearchFiltersSchema,
  SearchSort: SearchSortSchema,
  SearchPagination: SearchPaginationSchema,
  UnifiedSearchRequest: UnifiedSearchRequestSchema,
  ContentPreview: ContentPreviewSchema,
  SearchResult: SearchResultSchema,
  SearchAggregations: SearchAggregationsSchema,
  UnifiedSearchResponse: UnifiedSearchResponseSchema,
  SearchQueryAnalytics: SearchQueryAnalyticsSchema,
  SearchPerformanceMetrics: SearchPerformanceMetricsSchema
} as const;