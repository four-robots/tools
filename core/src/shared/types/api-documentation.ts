/**
 * API Documentation Discovery Types
 * 
 * Types for automated discovery, analysis, and recommendation of API documentation
 * based on project dependencies and usage patterns.
 */

import { z } from 'zod';

// ============================================================================
// Package Dependency Types
// ============================================================================

/**
 * Supported package ecosystems
 */
export const PackageEcosystemSchema = z.enum([
  'npm',           // Node.js/JavaScript/TypeScript
  'pypi',          // Python
  'crates',        // Rust (crates.io)
  'go',            // Go modules
  'maven',         // Java/Kotlin/Scala
  'nuget',         // .NET (C#/F#/VB.NET)
  'composer',      // PHP
  'rubygems',      // Ruby
  'hackage'        // Haskell
]);

export type PackageEcosystem = z.infer<typeof PackageEcosystemSchema>;

/**
 * Package dependency types
 */
export const DependencyTypeSchema = z.enum([
  'production',     // Runtime dependency
  'development',    // Development-only dependency  
  'optional',       // Optional dependency
  'peer',          // Peer dependency (npm)
  'build',         // Build-time dependency
  'test',          // Test dependency
  'plugin'         // Plugin/extension
]);

export type DependencyType = z.infer<typeof DependencyTypeSchema>;

/**
 * Version constraint patterns
 */
export const VersionConstraintSchema = z.object({
  /** Raw version string from manifest */
  raw: z.string(),
  /** Parsed version constraint type */
  type: z.enum(['exact', 'range', 'caret', 'tilde', 'wildcard', 'latest']),
  /** Minimum version if range */
  min_version: z.string().optional(),
  /** Maximum version if range */
  max_version: z.string().optional(),
  /** Resolved exact version if available */
  resolved_version: z.string().optional()
});

export type VersionConstraint = z.infer<typeof VersionConstraintSchema>;

/**
 * Package dependency information
 */
export const PackageDependencySchema = z.object({
  /** Package name */
  name: z.string().min(1),
  /** Package ecosystem */
  ecosystem: PackageEcosystemSchema,
  /** Dependency type */
  type: DependencyTypeSchema,
  /** Version constraint */
  version_constraint: VersionConstraintSchema,
  /** Whether dependency is actively used in code */
  is_used: z.boolean().default(true),
  /** Confidence score of usage (0-1) */
  usage_confidence: z.number().min(0).max(1).default(0.5),
  /** File paths where dependency is referenced */
  file_references: z.array(z.string()).default([]),
  /** Import/require statements found */
  import_statements: z.array(z.string()).default([]),
  /** Package scope (for scoped packages like @types/node) */
  scope: z.string().optional(),
  /** Package description from manifest */
  description: z.string().optional(),
  /** Package homepage URL */
  homepage: z.string().url().optional(),
  /** Package repository URL */
  repository: z.string().url().optional(),
  /** Manifest file where dependency was found */
  source_file: z.string()
});

export type PackageDependency = z.infer<typeof PackageDependencySchema>;

// ============================================================================
// API Documentation Source Types
// ============================================================================

/**
 * API documentation source registry
 */
export const APIDocumentationSourceSchema = z.object({
  /** Unique source identifier */
  id: z.string().uuid(),
  /** Source name (npm, pypi, docs.rs, etc.) */
  name: z.string().min(1),
  /** Base URL for the documentation source */
  base_url: z.string().url(),
  /** URL pattern for package documentation ({package} placeholder) */
  documentation_pattern: z.string(),
  /** URL pattern for version-specific docs ({package}, {version} placeholders) */
  version_pattern: z.string().optional(),
  /** Supported programming languages */
  supported_languages: z.array(z.string()),
  /** Whether source is currently active */
  is_active: z.boolean().default(true),
  /** Last time source configuration was updated */
  last_updated: z.string().datetime()
});

export type APIDocumentationSource = z.infer<typeof APIDocumentationSourceSchema>;

// ============================================================================
// Discovered API Documentation Types  
// ============================================================================

/**
 * Documentation scraping status
 */
export const ScrapeStatusSchema = z.enum([
  'pending',       // Not yet scraped
  'in_progress',   // Currently being scraped
  'completed',     // Successfully scraped
  'failed',        // Scraping failed
  'stale',         // Needs re-scraping
  'unavailable'    // Documentation not available
]);

export type ScrapeStatus = z.infer<typeof ScrapeStatusSchema>;

/**
 * Health scoring components
 */
export const DocumentationHealthSchema = z.object({
  /** Overall health score (0-100) */
  overall_score: z.number().int().min(0).max(100),
  /** Components of health score */
  components: z.object({
    /** Documentation completeness (0-100) */
    completeness: z.number().int().min(0).max(100),
    /** Freshness of documentation (0-100) */
    freshness: z.number().int().min(0).max(100),
    /** Quality of examples (0-100) */
    examples_quality: z.number().int().min(0).max(100),
    /** API reference quality (0-100) */
    api_reference_quality: z.number().int().min(0).max(100),
    /** Community engagement (0-100) */
    community_score: z.number().int().min(0).max(100)
  })
});

export type DocumentationHealth = z.infer<typeof DocumentationHealthSchema>;

/**
 * Discovered API documentation metadata
 */
export const APIDocumentationMetadataSchema = z.object({
  /** Package popularity metrics */
  popularity: z.object({
    /** Weekly download count */
    weekly_downloads: z.number().int().min(0).optional(),
    /** GitHub stars */
    github_stars: z.number().int().min(0).optional(),
    /** Community ranking */
    ranking_score: z.number().min(0).max(1).optional()
  }).optional(),
  /** Documentation structure */
  structure: z.object({
    /** Has getting started guide */
    has_getting_started: z.boolean().default(false),
    /** Has API reference */
    has_api_reference: z.boolean().default(false),
    /** Has code examples */
    has_examples: z.boolean().default(false),
    /** Has changelog */
    has_changelog: z.boolean().default(false),
    /** Number of documented methods/functions */
    documented_apis: z.number().int().min(0).default(0)
  }).default({}),
  /** Package maintenance indicators */
  maintenance: z.object({
    /** Last release date */
    last_release: z.string().datetime().optional(),
    /** Release frequency per year */
    release_frequency: z.number().min(0).optional(),
    /** Number of maintainers */
    maintainer_count: z.number().int().min(0).optional(),
    /** Issue response time (hours) */
    avg_issue_response_time: z.number().min(0).optional()
  }).optional(),
  /** License information */
  license: z.string().optional(),
  /** Package keywords/tags */
  keywords: z.array(z.string()).default([]),
  /** Package categories */
  categories: z.array(z.string()).default([])
});

export type APIDocumentationMetadata = z.infer<typeof APIDocumentationMetadataSchema>;

/**
 * Discovered API documentation entry
 */
export const DiscoveredAPIDocSchema = z.object({
  /** Unique documentation entry ID */
  id: z.string().uuid(),
  /** Package name */
  package_name: z.string().min(1),
  /** Package version */
  package_version: z.string().min(1),
  /** Programming language */
  language: z.string().min(1),
  /** Source that provided this documentation */
  source_id: z.string().uuid(),
  /** Primary documentation URL */
  documentation_url: z.string().url(),
  /** API reference URL */
  api_reference_url: z.string().url().optional(),
  /** Examples/tutorials URL */
  examples_url: z.string().url().optional(),
  /** Changelog URL */
  changelog_url: z.string().url().optional(),
  /** Source code repository URL */
  repository_url: z.string().url().optional(),
  /** Health score (0-100) */
  health_score: z.number().int().min(0).max(100),
  /** Last time documentation was scraped */
  last_scraped: z.string().datetime().optional(),
  /** Current scraping status */
  scrape_status: ScrapeStatusSchema,
  /** Rich metadata about the documentation */
  metadata: APIDocumentationMetadataSchema.default({}),
  /** Creation timestamp */
  created_at: z.string().datetime()
});

export type DiscoveredAPIDoc = z.infer<typeof DiscoveredAPIDocSchema>;

// ============================================================================
// API Documentation Recommendation Types
// ============================================================================

/**
 * Recommendation confidence levels
 */
export const RecommendationConfidenceSchema = z.enum([
  'low',        // 0.0 - 0.4
  'medium',     // 0.4 - 0.7
  'high',       // 0.7 - 0.9
  'very_high'   // 0.9 - 1.0
]);

export type RecommendationConfidence = z.infer<typeof RecommendationConfidenceSchema>;

/**
 * Recommendation status
 */
export const RecommendationStatusSchema = z.enum([
  'recommended',    // System recommends indexing
  'accepted',       // User accepted recommendation
  'rejected',       // User rejected recommendation
  'indexed',        // Documentation has been indexed
  'ignored'         // System should ignore this recommendation
]);

export type RecommendationStatus = z.infer<typeof RecommendationStatusSchema>;

/**
 * API documentation recommendation
 */
export const APIDocumentationRecommendationSchema = z.object({
  /** Unique recommendation ID */
  id: z.string().uuid(),
  /** Repository being analyzed */
  repository_id: z.string().uuid(),
  /** Discovered documentation entry */
  discovered_doc_id: z.string().uuid(),
  /** Type of dependency relationship */
  dependency_type: DependencyTypeSchema,
  /** Confidence score of usage (0.0 - 1.0) */
  usage_confidence: z.number().min(0).max(1),
  /** Human-readable explanation of why this is recommended */
  recommendation_reason: z.string().min(1),
  /** Files that reference this dependency */
  file_references: z.array(z.string()).default([]),
  /** Current recommendation status */
  recommendation_status: RecommendationStatusSchema,
  /** Estimated indexing time (minutes) */
  estimated_indexing_time: z.number().min(0).optional(),
  /** Estimated storage requirements (MB) */
  estimated_storage_mb: z.number().min(0).optional(),
  /** Priority score for indexing order */
  priority_score: z.number().min(0).max(1).optional(),
  /** Creation timestamp */
  created_at: z.string().datetime(),
  /** Last update timestamp */
  updated_at: z.string().datetime()
});

export type APIDocumentationRecommendation = z.infer<typeof APIDocumentationRecommendationSchema>;

// ============================================================================
// Service Input/Output Types
// ============================================================================

/**
 * Repository analysis input
 */
export const RepositoryAnalysisInputSchema = z.object({
  /** Repository ID to analyze */
  repository_id: z.string().uuid(),
  /** Whether to force re-analysis */
  force_refresh: z.boolean().default(false),
  /** Package ecosystems to analyze (empty = all) */
  ecosystems: z.array(PackageEcosystemSchema).default([]),
  /** Minimum usage confidence to include */
  min_confidence: z.number().min(0).max(1).default(0.1),
  /** Maximum number of recommendations to generate */
  max_recommendations: z.number().int().min(1).max(100).default(50)
});

export type RepositoryAnalysisInput = z.infer<typeof RepositoryAnalysisInputSchema>;

/**
 * Repository analysis results
 */
export const RepositoryAnalysisResultSchema = z.object({
  /** Repository that was analyzed */
  repository_id: z.string().uuid(),
  /** Dependencies discovered */
  dependencies: z.array(PackageDependencySchema),
  /** Documentation recommendations generated */
  recommendations: z.array(APIDocumentationRecommendationSchema),
  /** Analysis statistics */
  statistics: z.object({
    /** Total dependencies found */
    total_dependencies: z.number().int().min(0),
    /** Dependencies with recommendations */
    dependencies_with_recommendations: z.number().int().min(0),
    /** High-confidence recommendations */
    high_confidence_recommendations: z.number().int().min(0),
    /** Total estimated indexing time (minutes) */
    estimated_total_indexing_time: z.number().min(0),
    /** Total estimated storage (MB) */
    estimated_total_storage_mb: z.number().min(0),
    /** Analysis processing time (ms) */
    processing_time_ms: z.number().int().min(0)
  }),
  /** Analysis timestamp */
  analyzed_at: z.string().datetime()
});

export type RepositoryAnalysisResult = z.infer<typeof RepositoryAnalysisResultSchema>;

/**
 * Package documentation discovery input
 */
export const PackageDiscoveryInputSchema = z.object({
  /** Package dependency to discover documentation for */
  dependency: PackageDependencySchema,
  /** Repository context for relevance scoring */
  repository_id: z.string().uuid(),
  /** Whether to force refresh of cached data */
  force_refresh: z.boolean().default(false)
});

export type PackageDiscoveryInput = z.infer<typeof PackageDiscoveryInputSchema>;

// ============================================================================
// Error and Status Types
// ============================================================================

/**
 * API documentation discovery error
 */
export const APIDiscoveryErrorSchema = z.object({
  /** Error code */
  code: z.string(),
  /** Human-readable error message */
  message: z.string(),
  /** Additional error context */
  details: z.record(z.any()).optional(),
  /** Package that caused the error */
  package_name: z.string().optional(),
  /** Source that caused the error */
  source_name: z.string().optional(),
  /** Error timestamp */
  timestamp: z.string().datetime()
});

export type APIDiscoveryError = z.infer<typeof APIDiscoveryErrorSchema>;

// ============================================================================
// Export Schema Objects for Runtime Validation
// ============================================================================

export const APIDocumentationSchemas = {
  PackageEcosystem: PackageEcosystemSchema,
  DependencyType: DependencyTypeSchema,
  VersionConstraint: VersionConstraintSchema,
  PackageDependency: PackageDependencySchema,
  APIDocumentationSource: APIDocumentationSourceSchema,
  ScrapeStatus: ScrapeStatusSchema,
  DocumentationHealth: DocumentationHealthSchema,
  APIDocumentationMetadata: APIDocumentationMetadataSchema,
  DiscoveredAPIDoc: DiscoveredAPIDocSchema,
  RecommendationConfidence: RecommendationConfidenceSchema,
  RecommendationStatus: RecommendationStatusSchema,
  APIDocumentationRecommendation: APIDocumentationRecommendationSchema,
  RepositoryAnalysisInput: RepositoryAnalysisInputSchema,
  RepositoryAnalysisResult: RepositoryAnalysisResultSchema,
  PackageDiscoveryInput: PackageDiscoveryInputSchema,
  APIDiscoveryError: APIDiscoveryErrorSchema
} as const;