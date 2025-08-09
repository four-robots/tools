/**
 * Content Management and Chunking Types
 * 
 * Types for content processing, chunking strategies, and unified content handling
 * across different source types (scraped pages, code files, documents, etc.).
 */

import { z } from 'zod';

// ============================================================================
// Content Chunking Types
// ============================================================================

/**
 * Chunking strategy options
 */
export const ChunkingStrategySchema = z.enum([
  'fixed_size',      // Fixed character/token count
  'sentence',        // Sentence boundaries
  'paragraph',       // Paragraph boundaries
  'semantic',        // Semantic similarity boundaries
  'code_function',   // Function/method boundaries
  'code_class',      // Class boundaries
  'markdown_section' // Markdown header sections
]);

export type ChunkingStrategy = z.infer<typeof ChunkingStrategySchema>;

/**
 * Chunking configuration options
 */
export const ChunkingOptionsSchema = z.object({
  /** Chunking strategy to use */
  strategy: ChunkingStrategySchema,
  /** Target chunk size in characters */
  target_size: z.number().int().min(100).max(8000).default(1000),
  /** Maximum chunk size (hard limit) */
  max_size: z.number().int().min(100).max(10000).default(1500),
  /** Minimum chunk size (avoid tiny chunks) */
  min_size: z.number().int().min(50).max(1000).default(200),
  /** Overlap between adjacent chunks */
  overlap_size: z.number().int().min(0).max(500).default(100),
  /** Preserve specific boundaries */
  preserve_boundaries: z.object({
    sentences: z.boolean().default(true),
    paragraphs: z.boolean().default(true),
    code_blocks: z.boolean().default(true),
    list_items: z.boolean().default(true)
  }).default({}),
  /** Language-specific options for code */
  language_options: z.object({
    language: z.string().optional(),
    preserve_functions: z.boolean().default(true),
    preserve_classes: z.boolean().default(true),
    include_comments: z.boolean().default(true),
    include_docstrings: z.boolean().default(true)
  }).optional()
});

export type ChunkingOptions = z.infer<typeof ChunkingOptionsSchema>;

// ============================================================================
// Content Chunk Types
// ============================================================================

/**
 * Content chunk metadata
 */
export const ChunkMetadataSchema = z.object({
  /** Chunk type classification */
  type: z.enum([
    'text',
    'code',
    'documentation',
    'comment',
    'header',
    'list',
    'table',
    'quote'
  ]).optional(),
  /** Language for code chunks */
  language: z.string().optional(),
  /** Function/method name for code chunks */
  function_name: z.string().optional(),
  /** Class name for code chunks */
  class_name: z.string().optional(),
  /** Heading level for documentation */
  heading_level: z.number().int().min(1).max(6).optional(),
  /** Whether chunk contains complete sentences */
  complete_sentences: z.boolean().optional(),
  /** Number of words in chunk */
  word_count: z.number().int().min(0).optional(),
  /** Complexity score (for code) */
  complexity_score: z.number().min(0).max(1).optional(),
  /** Quality score */
  quality_score: z.number().min(0).max(1).optional()
});

export type ChunkMetadata = z.infer<typeof ChunkMetadataSchema>;

/**
 * Individual content chunk
 */
export const ContentChunkSchema = z.object({
  /** Unique chunk identifier */
  id: z.string().uuid(),
  /** Parent content identifier */
  parent_id: z.string().uuid(),
  /** Parent content type */
  parent_type: z.enum([
    'scraped_page',
    'code_file', 
    'wiki_page',
    'document'
  ]),
  /** Chunk content text */
  content: z.string().min(1),
  /** Vector embedding identifier */
  vector_id: z.string().optional(),
  /** Start position in original content */
  start_position: z.number().int().min(0),
  /** End position in original content */
  end_position: z.number().int().min(0),
  /** Sequential chunk index */
  chunk_index: z.number().int().min(0),
  /** Chunk metadata */
  metadata: ChunkMetadataSchema,
  /** Creation timestamp */
  created_at: z.string().datetime()
});

export type ContentChunk = z.infer<typeof ContentChunkSchema>;

// ============================================================================
// Content Processing Types
// ============================================================================

/**
 * Content extraction and processing status
 */
export const ProcessingStatusSchema = z.enum([
  'pending',
  'processing',
  'completed',
  'failed',
  'retrying'
]);

export type ProcessingStatus = z.infer<typeof ProcessingStatusSchema>;

/**
 * Content processing job
 */
export const ContentProcessingJobSchema = z.object({
  /** Unique job identifier */
  id: z.string().uuid(),
  /** Content identifier being processed */
  content_id: z.string().uuid(),
  /** Content type */
  content_type: z.enum([
    'scraped_page',
    'code_file',
    'wiki_page', 
    'document'
  ]),
  /** Processing operations requested */
  operations: z.array(z.enum([
    'extract_text',
    'chunk_content',
    'generate_embeddings',
    'analyze_quality',
    'extract_metadata'
  ])),
  /** Chunking configuration */
  chunking_options: ChunkingOptionsSchema.optional(),
  /** Current processing status */
  status: ProcessingStatusSchema,
  /** Progress information */
  progress: z.object({
    current_step: z.string(),
    completed_steps: z.number().int().min(0),
    total_steps: z.number().int().min(0),
    percentage: z.number().min(0).max(100)
  }).optional(),
  /** Processing results */
  results: z.object({
    chunks_created: z.number().int().min(0),
    embeddings_generated: z.number().int().min(0),
    quality_score: z.number().min(0).max(1).optional(),
    extracted_metadata: z.record(z.any()).optional()
  }).optional(),
  /** Error information if failed */
  error: z.object({
    message: z.string(),
    code: z.string().optional(),
    details: z.record(z.any()).optional()
  }).optional(),
  /** Timestamps */
  created_at: z.string().datetime(),
  started_at: z.string().datetime().optional(),
  completed_at: z.string().datetime().optional()
});

export type ContentProcessingJob = z.infer<typeof ContentProcessingJobSchema>;

// ============================================================================
// Code-Specific Types
// ============================================================================

/**
 * Code repository information
 */
export const CodeRepositorySchema = z.object({
  /** Unique repository identifier */
  id: z.string().uuid(),
  /** Repository display name */
  name: z.string().min(1),
  /** File system path */
  path: z.string().min(1),
  /** Processing status */
  status: ProcessingStatusSchema,
  /** Last indexing timestamp */
  last_indexed: z.string().datetime().optional(),
  /** Number of files in repository */
  file_count: z.number().int().min(0),
  /** Creation timestamp */
  created_at: z.string().datetime()
});

export type CodeRepository = z.infer<typeof CodeRepositorySchema>;

/**
 * Code file information
 */
export const CodeFileSchema = z.object({
  /** Unique file identifier */
  id: z.string().uuid(),
  /** Repository ID */
  repository_id: z.string().uuid(),
  /** File path relative to repository */
  file_path: z.string().min(1),
  /** Programming language */
  language: z.string().min(1),
  /** File content */
  content: z.string(),
  /** Vector embedding identifier */
  vector_id: z.string().optional(),
  /** Number of functions in file */
  function_count: z.number().int().min(0),
  /** Number of classes in file */
  class_count: z.number().int().min(0),
  /** File last modified timestamp */
  last_modified: z.string().datetime().optional(),
  /** Record creation timestamp */
  created_at: z.string().datetime()
});

export type CodeFile = z.infer<typeof CodeFileSchema>;

/**
 * Code chunk types
 */
export const CodeChunkTypeSchema = z.enum([
  'function',
  'class', 
  'method',
  'comment',
  'documentation',
  'import',
  'variable',
  'constant'
]);

export type CodeChunkType = z.infer<typeof CodeChunkTypeSchema>;

/**
 * Code-specific chunk
 */
export const CodeChunkSchema = z.object({
  /** Unique chunk identifier */
  id: z.string().uuid(),
  /** File ID */
  file_id: z.string().uuid(),
  /** Code chunk type */
  chunk_type: CodeChunkTypeSchema,
  /** Function/class/method name */
  name: z.string().optional(),
  /** Code content */
  content: z.string().min(1),
  /** Vector embedding identifier */
  vector_id: z.string().optional(),
  /** Starting line number */
  line_start: z.number().int().min(1),
  /** Ending line number */
  line_end: z.number().int().min(1),
  /** Additional metadata */
  metadata: z.object({
    /** Function parameters */
    parameters: z.array(z.string()).optional(),
    /** Return type */
    return_type: z.string().optional(),
    /** Visibility (public, private, protected) */
    visibility: z.string().optional(),
    /** Whether it's static */
    is_static: z.boolean().optional(),
    /** Whether it's async */
    is_async: z.boolean().optional(),
    /** Cyclomatic complexity */
    complexity: z.number().int().min(0).optional(),
    /** Lines of code */
    loc: z.number().int().min(0).optional()
  }).default({}),
  /** Creation timestamp */
  created_at: z.string().datetime()
});

export type CodeChunk = z.infer<typeof CodeChunkSchema>;

// ============================================================================
// Scraped Content Types
// ============================================================================

/**
 * Enhanced scraped page with embeddings support
 */
export const EnhancedScrapedPageSchema = z.object({
  /** Unique page identifier */
  id: z.string().uuid(),
  /** Page URL */
  url: z.string().url(),
  /** Page title */
  title: z.string().optional(),
  /** Raw HTML content */
  content: z.string(),
  /** Extracted markdown content */
  markdown_content: z.string().optional(),
  /** Content hash for deduplication */
  content_hash: z.string(),
  /** Vector embedding identifier */
  vector_id: z.string().optional(),
  /** Embedding processing status */
  embedding_status: ProcessingStatusSchema,
  /** Number of content chunks created */
  chunk_count: z.number().int().min(0),
  /** Last vectorization timestamp */
  last_vectorized: z.string().datetime().optional(),
  /** Page metadata */
  metadata: z.record(z.any()),
  /** Scraping timestamp */
  scraped_at: z.string().datetime(),
  /** Processing status */
  status: z.string(),
  /** Error message if failed */
  error_message: z.string().optional(),
  /** Creation timestamp */
  created_at: z.string().datetime(),
  /** Last update timestamp */
  updated_at: z.string().datetime()
});

export type EnhancedScrapedPage = z.infer<typeof EnhancedScrapedPageSchema>;

/**
 * Scraped content chunk
 */
export const ScrapedContentChunkSchema = z.object({
  /** Unique chunk identifier */
  id: z.string().uuid(),
  /** Parent page ID */
  page_id: z.string().uuid(),
  /** Chunk content */
  content: z.string().min(1),
  /** Vector embedding identifier */
  vector_id: z.string().optional(),
  /** Start position in original content */
  start_position: z.number().int().min(0).optional(),
  /** End position in original content */
  end_position: z.number().int().min(0).optional(),
  /** Sequential chunk index */
  chunk_index: z.number().int().min(0).optional(),
  /** Chunk metadata */
  metadata: ChunkMetadataSchema.default({}),
  /** Creation timestamp */
  created_at: z.string().datetime()
});

export type ScrapedContentChunk = z.infer<typeof ScrapedContentChunkSchema>;

// ============================================================================
// Export Schema Objects for Runtime Validation
// ============================================================================

export const ContentSchemas = {
  ChunkingStrategy: ChunkingStrategySchema,
  ChunkingOptions: ChunkingOptionsSchema,
  ChunkMetadata: ChunkMetadataSchema,
  ContentChunk: ContentChunkSchema,
  ProcessingStatus: ProcessingStatusSchema,
  ContentProcessingJob: ContentProcessingJobSchema,
  CodeRepository: CodeRepositorySchema,
  CodeFile: CodeFileSchema,
  CodeChunkType: CodeChunkTypeSchema,
  CodeChunk: CodeChunkSchema,
  EnhancedScrapedPage: EnhancedScrapedPageSchema,
  ScrapedContentChunk: ScrapedContentChunkSchema
} as const;