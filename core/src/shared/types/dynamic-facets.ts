/**
 * Dynamic Facet Generation System Types
 * 
 * Comprehensive types for the dynamic faceting functionality including
 * facet discovery, filtering, statistics, and performance optimization.
 */

import { z } from 'zod';

// ============================================================================
// Base Facet Types
// ============================================================================

/**
 * Supported facet types for dynamic facet generation
 */
export const FacetTypeSchema = z.enum([
  'categorical',
  'range',
  'hierarchical',
  'date'
]);

export type FacetType = z.infer<typeof FacetTypeSchema>;

/**
 * Supported data types for facet values
 */
export const FacetDataTypeSchema = z.enum([
  'string',
  'number', 
  'date',
  'boolean'
]);

export type FacetDataType = z.infer<typeof FacetDataTypeSchema>;

/**
 * Facet filter logic operators
 */
export const FacetFilterLogicSchema = z.enum([
  'AND',
  'OR',
  'NOT'
]);

export type FacetFilterLogic = z.infer<typeof FacetFilterLogicSchema>;

// ============================================================================
// Facet Definition Types
// ============================================================================

/**
 * Core facet definition configuration
 */
export const FacetDefinitionSchema = z.object({
  /** Unique facet identifier */
  id: z.string().uuid(),
  /** Internal facet name for code reference */
  facetName: z.string().min(1).max(200),
  /** Type of facet */
  facetType: FacetTypeSchema,
  /** Data type of facet values */
  dataType: FacetDataTypeSchema,
  /** Field path in search results (e.g., 'metadata.tags', 'content.language') */
  sourceField: z.string().min(1).max(200),
  /** Human-readable display name */
  displayName: z.string().min(1).max(200),
  /** Optional description of the facet */
  description: z.string().optional(),
  /** Whether facet is active and should be used */
  isActive: z.boolean().default(true),
  /** Sort order for facet display */
  sortOrder: z.number().int().default(0),
  /** Parent facet ID for hierarchical facets */
  parentFacetId: z.string().uuid().optional(),
  /** Facet-specific configuration */
  configuration: z.record(z.string(), z.any()).default({}),
  /** Creation timestamp */
  createdAt: z.string().datetime(),
  /** Last update timestamp */
  updatedAt: z.string().datetime()
});

export type FacetDefinition = z.infer<typeof FacetDefinitionSchema>;

/**
 * Discovered facet value with statistics
 */
export const FacetValueSchema = z.object({
  /** Unique value identifier */
  id: z.string().uuid(),
  /** Associated facet ID */
  facetId: z.string().uuid(),
  /** Raw value key */
  valueKey: z.string().max(500),
  /** Human-readable display value */
  displayValue: z.string().max(500),
  /** Number of results containing this value */
  valueCount: z.number().int().min(0).default(0),
  /** Relative frequency (0.0 to 1.0) */
  relativeFrequency: z.number().min(0).max(1).default(0),
  /** Parent value ID for hierarchical values */
  parentValueId: z.string().uuid().optional(),
  /** Additional value metadata */
  metadata: z.record(z.string(), z.any()).default({}),
  /** Last time this value was seen in data */
  lastSeenAt: z.string().datetime(),
  /** Creation timestamp */
  createdAt: z.string().datetime()
});

export type FacetValue = z.infer<typeof FacetValueSchema>;

// ============================================================================
// Range Facet Types
// ============================================================================

/**
 * Range bucket definition
 */
export const RangeBucketSchema = z.object({
  /** Bucket label */
  label: z.string(),
  /** Minimum value (inclusive) */
  min: z.number(),
  /** Maximum value (exclusive) */
  max: z.number(),
  /** Number of results in this bucket */
  count: z.number().int().min(0),
  /** Whether this is the selected range */
  selected: z.boolean().default(false)
});

export type RangeBucket = z.infer<typeof RangeBucketSchema>;

/**
 * Number distribution statistics
 */
export const NumberDistributionSchema = z.object({
  /** Minimum value */
  min: z.number(),
  /** Maximum value */
  max: z.number(),
  /** Mean value */
  mean: z.number(),
  /** Median value */
  median: z.number(),
  /** Standard deviation */
  standardDeviation: z.number(),
  /** 25th percentile */
  q25: z.number(),
  /** 75th percentile */
  q75: z.number()
});

export type NumberDistribution = z.infer<typeof NumberDistributionSchema>;

/**
 * Range facet configuration
 */
export const FacetRangeSchema = z.object({
  /** Unique range configuration ID */
  id: z.string().uuid(),
  /** Associated facet ID */
  facetId: z.string().uuid(),
  /** Minimum range value */
  rangeMin: z.number().optional(),
  /** Maximum range value */
  rangeMax: z.number().optional(),
  /** Bucket size for automatic bucketing */
  bucketSize: z.number().optional(),
  /** Number of buckets */
  bucketCount: z.number().int().optional(),
  /** Auto-calculated optimal ranges */
  optimalRanges: z.array(RangeBucketSchema).optional(),
  /** Creation timestamp */
  createdAt: z.string().datetime()
});

export type FacetRange = z.infer<typeof FacetRangeSchema>;

/**
 * Range facet with extended properties
 */
export const RangeFacetSchema = FacetDefinitionSchema.extend({
  /** Range buckets */
  ranges: z.array(RangeBucketSchema),
  /** Statistical distribution */
  distribution: NumberDistributionSchema,
  /** Optimal number of buckets */
  optimalBuckets: z.number().int().positive()
});

export type RangeFacet = z.infer<typeof RangeFacetSchema>;

// ============================================================================
// Hierarchical Facet Types
// ============================================================================

/**
 * Facet level in hierarchy
 */
export const FacetLevelSchema = z.object({
  /** Level depth (0 = root) */
  level: z.number().int().min(0),
  /** Level name */
  name: z.string(),
  /** Values at this level */
  values: z.array(FacetValueSchema),
  /** Number of values at this level */
  valueCount: z.number().int().min(0)
});

export type FacetLevel = z.infer<typeof FacetLevelSchema>;

/**
 * Facet expansion state for hierarchical facets
 */
export const FacetExpansionStateSchema = z.object({
  /** Expanded value IDs */
  expandedValues: z.array(z.string().uuid()),
  /** Default expansion level */
  defaultLevel: z.number().int().min(0).default(0),
  /** Whether to show all levels by default */
  showAllLevels: z.boolean().default(false)
});

export type FacetExpansionState = z.infer<typeof FacetExpansionStateSchema>;

/**
 * Hierarchical facet with tree structure
 */
export const HierarchicalFacetSchema = FacetDefinitionSchema.extend({
  /** Hierarchy levels */
  levels: z.array(FacetLevelSchema),
  /** Maximum hierarchy depth */
  maxDepth: z.number().int().min(0),
  /** Expansion state */
  expansion: FacetExpansionStateSchema
});

export type HierarchicalFacet = z.infer<typeof HierarchicalFacetSchema>;

// ============================================================================
// Facet Filter Types
// ============================================================================

/**
 * Individual facet filter
 */
export const FacetFilterSchema = z.object({
  /** Facet ID to filter on */
  facetId: z.string().uuid(),
  /** Filter operation type */
  operation: z.enum(['equals', 'contains', 'range', 'exists', 'not_exists']),
  /** Filter values */
  values: z.array(z.string()),
  /** Range filter bounds (for range operations) */
  rangeMin: z.number().optional(),
  /** Range filter bounds (for range operations) */
  rangeMax: z.number().optional(),
  /** Logic operator with other filters */
  logic: FacetFilterLogicSchema.default('AND')
});

export type FacetFilter = z.infer<typeof FacetFilterSchema>;

/**
 * Available filter option
 */
export const AvailableFilterSchema = z.object({
  /** Facet ID */
  facetId: z.string().uuid(),
  /** Available values for this facet */
  availableValues: z.array(FacetValueSchema),
  /** Whether this facet can be filtered */
  canFilter: z.boolean(),
  /** Estimated result count if this filter is applied */
  estimatedResults: z.number().int().min(0)
});

export type AvailableFilter = z.infer<typeof AvailableFilterSchema>;

// ============================================================================
// Facet Statistics Types
// ============================================================================

/**
 * Real-time facet statistics
 */
export const FacetStatisticsSchema = z.object({
  /** Unique statistics ID */
  id: z.string().uuid(),
  /** Associated facet ID */
  facetId: z.string().uuid(),
  /** Total number of results */
  totalResults: z.number().int().min(0).default(0),
  /** Number of unique values */
  uniqueValues: z.number().int().min(0).default(0),
  /** Number of null/missing values */
  nullCount: z.number().int().min(0).default(0),
  /** Statistics date */
  statisticsDate: z.string().datetime(),
  /** Hourly statistics breakdown */
  hourlyStats: z.record(z.string(), z.number()).default({}),
  /** Creation timestamp */
  createdAt: z.string().datetime()
});

export type FacetStatistics = z.infer<typeof FacetStatisticsSchema>;

/**
 * Facet usage analytics
 */
export const FacetUsageAnalyticsSchema = z.object({
  /** Unique usage record ID */
  id: z.string().uuid(),
  /** Associated facet ID */
  facetId: z.string().uuid(),
  /** User ID (optional) */
  userId: z.string().uuid().optional(),
  /** Type of usage */
  usageType: z.enum(['filter_applied', 'facet_expanded', 'value_selected']),
  /** Selected values in the interaction */
  selectedValues: z.array(z.string()).default([]),
  /** Number of results after filter */
  resultsCount: z.number().int().min(0).default(0),
  /** Session identifier */
  sessionId: z.string().optional(),
  /** Search query when facet was used */
  searchQuery: z.string().optional(),
  /** Usage timestamp */
  createdAt: z.string().datetime()
});

export type FacetUsageAnalytics = z.infer<typeof FacetUsageAnalyticsSchema>;

/**
 * Facet performance metrics
 */
export const FacetPerformanceMetricsSchema = z.object({
  /** Average facet processing time in milliseconds */
  avgProcessingTime: z.number().min(0),
  /** 95th percentile processing time */
  p95ProcessingTime: z.number().min(0),
  /** Cache hit rate (0.0 to 1.0) */
  cacheHitRate: z.number().min(0).max(1),
  /** Total operations processed */
  totalOperations: z.number().int().min(0),
  /** Error rate (0.0 to 1.0) */
  errorRate: z.number().min(0).max(1),
  /** Memory usage in MB */
  memoryUsageMB: z.number().min(0).optional()
});

export type FacetPerformanceMetrics = z.infer<typeof FacetPerformanceMetricsSchema>;

// ============================================================================
// User Preference Types
// ============================================================================

/**
 * User facet preferences
 */
export const UserFacetPreferencesSchema = z.object({
  /** Unique preference ID */
  id: z.string().uuid(),
  /** User ID */
  userId: z.string().uuid(),
  /** Associated facet ID */
  facetId: z.string().uuid(),
  /** Whether facet is visible to user */
  isVisible: z.boolean().default(true),
  /** User's preferred sort order */
  sortOrder: z.number().int().default(0),
  /** Whether facet is expanded by default */
  defaultExpanded: z.boolean().default(false),
  /** Custom display name set by user */
  customDisplayName: z.string().max(200).optional(),
  /** Creation timestamp */
  createdAt: z.string().datetime()
});

export type UserFacetPreferences = z.infer<typeof UserFacetPreferencesSchema>;

// ============================================================================
// Facet Discovery Types
// ============================================================================

/**
 * Discovered facet candidate
 */
export const DiscoveredFacetSchema = z.object({
  /** Suggested facet name */
  facetName: z.string(),
  /** Detected facet type */
  facetType: FacetTypeSchema,
  /** Detected data type */
  dataType: FacetDataTypeSchema,
  /** Source field path */
  sourceField: z.string(),
  /** Suggested display name */
  displayName: z.string(),
  /** Quality score (0.0 to 1.0) */
  qualityScore: z.number().min(0).max(1),
  /** Usefulness score (0.0 to 1.0) */
  usefulnessScore: z.number().min(0).max(1),
  /** Number of unique values found */
  uniqueValueCount: z.number().int().min(0),
  /** Sample values */
  sampleValues: z.array(z.string()),
  /** Cardinality category */
  cardinality: z.enum(['low', 'medium', 'high', 'very_high']),
  /** Whether this field exists in most results */
  coverage: z.number().min(0).max(1),
  /** Reasons for recommendation */
  reasons: z.array(z.string())
});

export type DiscoveredFacet = z.infer<typeof DiscoveredFacetSchema>;

// ============================================================================
// Facet Collection Types
// ============================================================================

/**
 * Base facet interface
 */
export const BaseFacetSchema = z.discriminatedUnion('facetType', [
  FacetDefinitionSchema.extend({ facetType: z.literal('categorical') }),
  RangeFacetSchema.extend({ facetType: z.literal('range') }),
  HierarchicalFacetSchema.extend({ facetType: z.literal('hierarchical') }),
  FacetDefinitionSchema.extend({ facetType: z.literal('date') })
]);

export type BaseFacet = z.infer<typeof BaseFacetSchema>;

/**
 * Complete facet collection with metadata
 */
export const FacetCollectionSchema = z.object({
  /** Available facets */
  facets: z.array(BaseFacetSchema),
  /** Total number of results being faceted */
  totalResults: z.number().int().min(0),
  /** Currently applied filters */
  appliedFilters: z.array(FacetFilterSchema),
  /** Available filter options */
  availableFilters: z.array(AvailableFilterSchema),
  /** Performance metrics for this collection */
  performance: FacetPerformanceMetricsSchema,
  /** Collection generation timestamp */
  generatedAt: z.string().datetime(),
  /** Cache information */
  cacheInfo: z.object({
    /** Whether this collection was served from cache */
    fromCache: z.boolean(),
    /** Cache key used */
    cacheKey: z.string().optional(),
    /** Cache expiration time */
    expiresAt: z.string().datetime().optional()
  }).optional()
});

export type FacetCollection = z.infer<typeof FacetCollectionSchema>;

/**
 * Facet operation result
 */
export const FacetOperationResultSchema = z.object({
  /** Whether operation was successful */
  success: z.boolean(),
  /** Result data (varies by operation) */
  data: z.any().optional(),
  /** Error message if operation failed */
  error: z.string().optional(),
  /** Operation processing time in milliseconds */
  processingTimeMs: z.number().int().min(0),
  /** Number of items processed */
  itemsProcessed: z.number().int().min(0),
  /** Performance metadata */
  performance: z.object({
    /** Cache hit indicator */
    cacheHit: z.boolean(),
    /** Memory usage in MB */
    memoryUsageMB: z.number().min(0).optional(),
    /** Database queries executed */
    dbQueries: z.number().int().min(0).optional()
  }).optional()
});

export type FacetOperationResult = z.infer<typeof FacetOperationResultSchema>;

// ============================================================================
// API Request/Response Types
// ============================================================================

/**
 * Generate facets request
 */
export const GenerateFacetsRequestSchema = z.object({
  /** Search results to generate facets from */
  results: z.array(z.any()), // SearchResult type from search.ts
  /** Search query context */
  query: z.string(),
  /** User ID for personalization */
  userId: z.string().uuid().optional(),
  /** Maximum number of facets to generate */
  maxFacets: z.number().int().positive().default(10),
  /** Minimum quality score for facets */
  minQualityScore: z.number().min(0).max(1).default(0.5),
  /** Whether to include range facets */
  includeRanges: z.boolean().default(true),
  /** Whether to include hierarchical facets */
  includeHierarchical: z.boolean().default(true)
});

export type GenerateFacetsRequest = z.infer<typeof GenerateFacetsRequestSchema>;

/**
 * Apply facet filters request
 */
export const ApplyFiltersRequestSchema = z.object({
  /** Search results to filter */
  results: z.array(z.any()), // SearchResult type from search.ts
  /** Filters to apply */
  filters: z.array(FacetFilterSchema),
  /** Filter logic (AND/OR) */
  filterLogic: FacetFilterLogicSchema.default('AND'),
  /** Whether to return filtered results */
  returnResults: z.boolean().default(true),
  /** Whether to return updated facet counts */
  returnFacetCounts: z.boolean().default(true)
});

export type ApplyFiltersRequest = z.infer<typeof ApplyFiltersRequestSchema>;

/**
 * Facet statistics request
 */
export const FacetStatisticsRequestSchema = z.object({
  /** Facet IDs to get statistics for */
  facetIds: z.array(z.string().uuid()),
  /** Date range for statistics */
  dateFrom: z.string().datetime().optional(),
  /** Date range for statistics */
  dateTo: z.string().datetime().optional(),
  /** Whether to include hourly breakdown */
  includeHourlyStats: z.boolean().default(false),
  /** User ID for user-specific statistics */
  userId: z.string().uuid().optional()
});

export type FacetStatisticsRequest = z.infer<typeof FacetStatisticsRequestSchema>;

// ============================================================================
// Export Schema Objects for Runtime Validation
// ============================================================================

export const DynamicFacetSchemas = {
  // Base types
  FacetType: FacetTypeSchema,
  FacetDataType: FacetDataTypeSchema,
  FacetFilterLogic: FacetFilterLogicSchema,
  
  // Core schemas
  FacetDefinition: FacetDefinitionSchema,
  FacetValue: FacetValueSchema,
  FacetRange: FacetRangeSchema,
  RangeFacet: RangeFacetSchema,
  HierarchicalFacet: HierarchicalFacetSchema,
  
  // Filter types
  FacetFilter: FacetFilterSchema,
  AvailableFilter: AvailableFilterSchema,
  
  // Statistics
  FacetStatistics: FacetStatisticsSchema,
  FacetUsageAnalytics: FacetUsageAnalyticsSchema,
  FacetPerformanceMetrics: FacetPerformanceMetricsSchema,
  
  // User preferences
  UserFacetPreferences: UserFacetPreferencesSchema,
  
  // Discovery
  DiscoveredFacet: DiscoveredFacetSchema,
  
  // Collections
  FacetCollection: FacetCollectionSchema,
  FacetOperationResult: FacetOperationResultSchema,
  
  // API requests
  GenerateFacetsRequest: GenerateFacetsRequestSchema,
  ApplyFiltersRequest: ApplyFiltersRequestSchema,
  FacetStatisticsRequest: FacetStatisticsRequestSchema,
  
  // Component types
  RangeBucket: RangeBucketSchema,
  NumberDistribution: NumberDistributionSchema,
  FacetLevel: FacetLevelSchema,
  FacetExpansionState: FacetExpansionStateSchema
} as const;