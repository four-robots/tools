/**
 * Web Scraper Types and Schemas
 */

import { z } from 'zod';

// Database entity interfaces
export interface ScrapedPage {
  id: string;
  url: string;
  title: string | null;
  content: string;
  content_hash: string;
  metadata: string; // JSON
  scraped_at: string;
  status: 'success' | 'error' | 'pending';
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface ScrapingJob {
  id: string;
  url: string;
  selector: string | null;
  options: string; // JSON
  status: 'pending' | 'running' | 'completed' | 'failed';
  priority: number;
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  result_page_id: string | null;
  created_at: string;
  updated_at: string;
}

// Input schemas
export const ScrapeUrlSchema = z.object({
  url: z.string().url(),
  selector: z.string().optional(),
  options: z.object({
    waitFor: z.number().optional(),
    screenshot: z.boolean().default(false),
    fullPage: z.boolean().default(false),
    removeAds: z.boolean().default(true),
    extractMainContent: z.boolean().default(true),
    followRedirects: z.boolean().default(true),
    timeout: z.number().min(1000).max(30000).default(10000),
    userAgent: z.string().optional(),
    headers: z.record(z.string()).optional(),
    cookies: z.array(z.object({
      name: z.string(),
      value: z.string(),
      domain: z.string().optional(),
      path: z.string().optional()
    })).optional()
  }).optional()
});

export const BatchScrapeSchema = z.object({
  urls: z.array(z.string().url()).min(1).max(100),
  selector: z.string().optional(),
  options: z.object({
    concurrency: z.number().min(1).max(10).default(3),
    delay: z.number().min(0).max(5000).default(1000),
    waitFor: z.number().optional(),
    screenshot: z.boolean().default(false),
    fullPage: z.boolean().default(false),
    removeAds: z.boolean().default(true),
    extractMainContent: z.boolean().default(true),
    followRedirects: z.boolean().default(true),
    timeout: z.number().min(1000).max(30000).default(10000),
    userAgent: z.string().optional(),
    headers: z.record(z.string()).optional(),
    cookies: z.array(z.object({
      name: z.string(),
      value: z.string(),
      domain: z.string().optional(),
      path: z.string().optional()
    })).optional()
  }).optional()
});

export const ScheduleJobSchema = z.object({
  url: z.string().url(),
  selector: z.string().optional(),
  priority: z.number().min(1).max(10).default(5),
  scheduledAt: z.string().datetime().optional(),
  options: ScrapeUrlSchema.shape.options.optional()
});

export const GetPageSchema = z.object({
  url: z.string().url().optional(),
  contentHash: z.string().optional(),
  limit: z.number().min(1).max(100).default(20),
  offset: z.number().min(0).default(0)
}).refine(data => data.url || data.contentHash, {
  message: "Either url or contentHash must be provided"
});

// Input types (for API inputs - can have undefined values)
export type ScrapeUrlInput = z.infer<typeof ScrapeUrlSchema>;
export type BatchScrapeInput = z.infer<typeof BatchScrapeSchema>;
export type ScheduleJobInput = z.infer<typeof ScheduleJobSchema>;
export type GetPageInput = z.infer<typeof GetPageSchema>;

// Processed types (for internal use - defaults applied)
export type ProcessedScrapeUrlInput = z.output<typeof ScrapeUrlSchema>;
export type ProcessedBatchScrapeInput = z.output<typeof BatchScrapeSchema>;
export type ProcessedScheduleJobInput = z.output<typeof ScheduleJobSchema>;
export type ProcessedGetPageInput = z.output<typeof GetPageSchema>;

// Response types
export interface ScrapedContent {
  id: string;
  url: string;
  title?: string;
  content: string;
  contentHash: string;
  metadata: {
    description?: string;
    keywords?: string[];
    author?: string;
    publishedDate?: string;
    language?: string;
    wordCount: number;
    readingTime: number;
    images?: string[];
    links?: string[];
    headers?: Array<{ level: number; text: string }>;
    screenshot?: string; // base64 encoded
  };
  scrapedAt: string;
  status: 'success' | 'error';
  errorMessage?: string;
}

export interface ScrapingJobInfo {
  id: string;
  url: string;
  selector?: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  priority: number;
  scheduledAt?: string;
  startedAt?: string;
  completedAt?: string;
  errorMessage?: string;
  result?: ScrapedContent;
  createdAt: string;
  updatedAt: string;
}

export interface BatchScrapeResults {
  successful: ScrapedContent[];
  failed: Array<{
    url: string;
    error: string;
  }>;
  summary: {
    total: number;
    successful: number;
    failed: number;
    processingTimeMs: number;
  };
}

export interface ScraperStats {
  totalPages: number;
  totalJobs: number;
  pendingJobs: number;
  runningJobs: number;
  completedJobs: number;
  failedJobs: number;
  averageProcessingTime: number;
  topDomains: Array<{
    domain: string;
    count: number;
  }>;
}

// Configuration types
export interface ScraperConfig {
  concurrency: number;
  defaultTimeout: number;
  retryAttempts: number;
  retryDelay: number;
  userAgent: string;
  headless: boolean;
  enableJavaScript: boolean;
  removeAds: boolean;
  extractMainContent: boolean;
}

// Error types
export class ScraperError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 400,
    public url?: string
  ) {
    super(message);
    this.name = 'ScraperError';
  }
}

export class ScrapingTimeoutError extends ScraperError {
  constructor(url: string, timeout: number) {
    super(`Scraping timeout after ${timeout}ms for URL: ${url}`, 'TIMEOUT', 408, url);
  }
}

export class InvalidUrlError extends ScraperError {
  constructor(url: string) {
    super(`Invalid URL provided: ${url}`, 'INVALID_URL', 400, url);
  }
}

export class NetworkError extends ScraperError {
  constructor(url: string, originalError: Error) {
    super(`Network error while scraping ${url}: ${originalError.message}`, 'NETWORK_ERROR', 502, url);
  }
}

// ============================================================================
// Enhanced Vector Scraper Types
// ============================================================================

/**
 * Vector scraping options extending base scrape options
 */
export const VectorScrapingOptionsSchema = ScrapeUrlSchema.extend({
  vector: z.object({
    /** Enable vector processing and embeddings */
    enabled: z.boolean().default(true),
    /** Generate embeddings for content chunks */
    generateEmbeddings: z.boolean().default(true),
    /** Convert HTML to markdown before processing */
    convertToMarkdown: z.boolean().default(true),
    /** Chunking configuration */
    chunkingOptions: z.object({
      strategy: z.enum(['fixed_size', 'paragraph', 'sentence']).default('paragraph'),
      target_size: z.number().int().min(100).max(8000).default(1000),
      max_size: z.number().int().min(100).max(10000).default(1500),
      min_size: z.number().int().min(50).max(1000).default(200),
      overlap_size: z.number().int().min(0).max(500).default(100)
    }).optional(),
    /** Vector storage collection name */
    collectionName: z.string().default('scraped_content'),
    /** Embedding model to use */
    embeddingModel: z.string().optional()
  }).optional()
});

export type VectorScrapingOptions = z.infer<typeof VectorScrapingOptionsSchema>;

/**
 * Enhanced scraped content with vector information
 */
export interface ScrapedContentWithVector extends ScrapedContent {
  /** Markdown converted content */
  markdownContent?: string;
  /** Vector embedding ID */
  vectorId?: string;
  /** Content chunks created */
  chunks?: Array<{
    id: string;
    content: string;
    vectorId?: string;
    startPosition: number;
    endPosition: number;
    chunkIndex: number;
    metadata: {
      type?: string;
      wordCount: number;
      qualityScore?: number;
    };
  }>;
  /** Embedding processing status */
  embeddingStatus: 'pending' | 'processing' | 'completed' | 'failed';
  /** Number of chunks created */
  chunkCount: number;
  /** Last vectorization timestamp */
  lastVectorized?: string;
}

/**
 * Search options for scraped content
 */
export const ScrapedContentSearchOptionsSchema = z.object({
  /** Search query */
  query: z.string().min(1),
  /** Minimum similarity threshold (0-1) */
  threshold: z.number().min(0).max(1).default(0.7),
  /** Maximum number of results */
  limit: z.number().int().min(1).max(100).default(10),
  /** Filter by domain */
  domain: z.string().optional(),
  /** Filter by date range */
  dateRange: z.object({
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional()
  }).optional(),
  /** Include chunks in results */
  includeChunks: z.boolean().default(true),
  /** Search type */
  searchType: z.enum(['vector', 'text', 'hybrid']).default('vector')
});

export type ScrapedContentSearchOptions = z.infer<typeof ScrapedContentSearchOptionsSchema>;

/**
 * Search results for scraped content
 */
export interface ScrapedContentSearchResults {
  /** Search results */
  results: Array<{
    /** Content item */
    content: ScrapedContentWithVector;
    /** Similarity score */
    similarity?: number;
    /** Matching chunks */
    matchingChunks?: Array<{
      id: string;
      content: string;
      similarity: number;
      startPosition: number;
      endPosition: number;
    }>;
  }>;
  /** Search metadata */
  metadata: {
    query: string;
    totalResults: number;
    searchTimeMs: number;
    searchType: 'vector' | 'text' | 'hybrid';
  };
}

/**
 * Backfill processing options
 */
export const BackfillOptionsSchema = z.object({
  /** Process only pages without embeddings */
  missingEmbeddingsOnly: z.boolean().default(true),
  /** Batch size for processing */
  batchSize: z.number().int().min(1).max(100).default(10),
  /** Domain filter */
  domain: z.string().optional(),
  /** Date range filter */
  dateRange: z.object({
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional()
  }).optional(),
  /** Chunking options to use */
  chunkingOptions: VectorScrapingOptionsSchema.shape.vector.shape.chunkingOptions.optional(),
  /** Force reprocessing even if embeddings exist */
  forceReprocess: z.boolean().default(false)
});

export type BackfillOptions = z.infer<typeof BackfillOptionsSchema>;

/**
 * Backfill processing results
 */
export interface BackfillResults {
  /** Number of pages processed */
  pagesProcessed: number;
  /** Number of pages that failed */
  pagesFailed: number;
  /** Total chunks created */
  chunksCreated: number;
  /** Total embeddings generated */
  embeddingsGenerated: number;
  /** Processing time in milliseconds */
  processingTimeMs: number;
  /** Failed items with reasons */
  failures: Array<{
    pageId: string;
    url: string;
    error: string;
  }>;
}