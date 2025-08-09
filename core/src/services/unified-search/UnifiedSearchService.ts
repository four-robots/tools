/**
 * Unified Search Service
 * 
 * Core service that aggregates and ranks results from all content sources
 * (Memory, Kanban, Wiki, Scraper) to provide a unified search experience.
 */

import crypto from 'crypto';
import { validateInput } from '../../utils/validation.js';
import { MemoryService } from '../memory/service.js';
import { KanbanService } from '../kanban/service.js';
import { WikiService } from '../wiki/service.js';
import { EnhancedScraperService } from '../scraper/EnhancedScraperService.js';
import { QueryProcessor, type ProcessedQuery } from './QueryProcessor.js';
import { ResultMerger, type SearchSourceResult } from './ResultMerger.js';
import { SearchAnalytics } from './SearchAnalytics.js';
import { CacheService } from './CacheService.js';

import type {
  UnifiedSearchRequest,
  UnifiedSearchResponse,
  SearchResult,
  SearchScore,
  SearchAggregations,
  ContentType,
  SearchFilters,
  UnifiedSearchRequestSchema
} from '../../shared/types/search.js';

/**
 * Configuration for the unified search service
 */
export interface UnifiedSearchConfig {
  /** Enable caching of search results */
  enableCaching: boolean;
  /** Enable search analytics tracking */
  enableAnalytics: boolean;
  /** Maximum search timeout in milliseconds */
  maxSearchTimeoutMs: number;
  /** Maximum results to return per page */
  maxResultsPerPage: number;
  /** Similarity threshold for duplicate detection */
  similarityThreshold: number;
  /** Cache configuration overrides */
  cacheConfig?: {
    maxEntries: number;
    defaultTtl: number;
  };
}

/**
 * Search execution context
 */
interface SearchContext {
  /** Original request */
  request: UnifiedSearchRequest;
  /** Processed query */
  processedQuery: ProcessedQuery;
  /** Start time for performance tracking */
  startTime: number;
  /** User ID for personalization */
  userId?: string;
  /** Session ID for analytics */
  sessionId?: string;
}

/**
 * Individual service search result with metadata
 */
interface ServiceSearchResult {
  /** Service identifier */
  service: 'memory' | 'kanban' | 'wiki' | 'scraper';
  /** Search results */
  results: SearchResult[];
  /** Success status */
  success: boolean;
  /** Processing time in milliseconds */
  processingTimeMs: number;
  /** Error if search failed */
  error?: Error;
}

export class UnifiedSearchService {
  private queryProcessor: QueryProcessor;
  private resultMerger: ResultMerger;
  private searchAnalytics?: SearchAnalytics;
  private cacheService?: CacheService;

  constructor(
    private memoryService: MemoryService,
    private kanbanService: KanbanService,
    private wikiService: WikiService,
    private scraperService: EnhancedScraperService,
    private config: UnifiedSearchConfig
  ) {
    // Initialize components
    this.queryProcessor = new QueryProcessor();
    this.resultMerger = new ResultMerger();
    
    // Initialize optional services
    if (config.enableAnalytics) {
      this.searchAnalytics = new SearchAnalytics({
        enableQueryTracking: true,
        enablePerformanceTracking: true,
        enableUserTracking: true,
        maxMemoryEntries: 10000,
        retentionDays: 90
      });
    }

    if (config.enableCaching) {
      this.cacheService = new CacheService({
        maxEntries: config.cacheConfig?.maxEntries || 1000,
        defaultTtl: config.cacheConfig?.defaultTtl || 5 * 60 * 1000, // 5 minutes
        cleanupInterval: 60 * 1000, // 1 minute
        enableStats: true
      });
    }
  }

  /**
   * Search across all content sources
   */
  async searchAcrossSystem(
    request: UnifiedSearchRequest,
    userId?: string,
    sessionId?: string
  ): Promise<UnifiedSearchResponse> {
    // Step 1: Validate and process the request
    const validatedRequest = validateInput(UnifiedSearchRequestSchema, request);
    const startTime = Date.now();

    const context: SearchContext = {
      request: validatedRequest,
      processedQuery: await this.queryProcessor.processQuery(validatedRequest),
      startTime,
      userId,
      sessionId
    };

    try {
      // Step 2: Check cache if enabled
      if (this.cacheService) {
        const cachedResults = await this.cacheService.getCachedResults(
          validatedRequest,
          userId
        );
        if (cachedResults) {
          console.log(`📦 Returning cached results for query: "${validatedRequest.query}"`);
          return cachedResults;
        }
      }

      console.log(`🔍 Starting unified search for: "${validatedRequest.query}"`);
      console.log(`📊 Query complexity: ${context.processedQuery.complexity.toFixed(2)}, Intent: ${context.processedQuery.intent}`);

      // Step 3: Execute searches in parallel across all services
      const searchPromises = this.createSearchPromises(context);
      const sourceResults = await Promise.allSettled(searchPromises);

      // Step 4: Extract successful results and handle errors
      const processedResults = this.processSearchResults(sourceResults, context);

      // Step 5: Merge and rank all results
      const finalResults = await this.mergeAndRankResults(processedResults, context);

      // Step 6: Generate aggregations and facets
      const aggregations = this.resultMerger.generateAggregations(finalResults);

      // Step 7: Apply pagination
      const paginatedResults = this.applyPagination(finalResults, validatedRequest);

      // Step 8: Generate search suggestions
      const suggestions = await this.queryProcessor.generateSuggestions(
        context.processedQuery
      );

      // Step 9: Build final response
      const response = this.buildResponse(
        paginatedResults,
        finalResults.length,
        aggregations,
        context,
        suggestions
      );

      // Step 10: Cache results if enabled
      if (this.cacheService) {
        await this.cacheService.cacheResults(validatedRequest, response, userId);
      }

      // Step 11: Track analytics if enabled
      if (this.searchAnalytics) {
        await this.searchAnalytics.recordSearch(
          validatedRequest,
          response,
          context.processedQuery,
          userId,
          sessionId
        );
      }

      const totalTime = Date.now() - startTime;
      console.log(`⚡ Unified search completed in ${totalTime}ms with ${response.results.length} results`);

      return response;

    } catch (error) {
      console.error('❌ Unified search failed:', error);
      
      // Return empty results on error
      const errorResponse = this.buildErrorResponse(context, error as Error);
      
      // Still track analytics for failed searches
      if (this.searchAnalytics) {
        await this.searchAnalytics.recordSearch(
          validatedRequest,
          errorResponse,
          context.processedQuery,
          userId,
          sessionId
        );
      }

      return errorResponse;
    }
  }

  /**
   * Get search analytics data
   */
  async getAnalytics(userId?: string, dateFrom?: Date, dateTo?: Date) {
    if (!this.searchAnalytics) {
      throw new Error('Search analytics is not enabled');
    }
    
    return this.searchAnalytics.getAnalytics(userId, dateFrom, dateTo);
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    if (!this.cacheService) {
      throw new Error('Caching is not enabled');
    }
    
    return this.cacheService.getStats();
  }

  /**
   * Clear search cache
   */
  async clearCache(): Promise<void> {
    if (this.cacheService) {
      await this.cacheService.clear();
    }
  }

  /**
   * Shutdown the service and cleanup resources
   */
  async shutdown(): Promise<void> {
    console.log('🛑 Shutting down unified search service...');
    
    if (this.cacheService) {
      this.cacheService.shutdown();
    }
    
    if (this.searchAnalytics) {
      await this.searchAnalytics.clearAnalytics();
    }
    
    console.log('✅ Unified search service shutdown complete');
  }

  /**
   * Create search promises for all services
   */
  private createSearchPromises(context: SearchContext): Promise<ServiceSearchResult>[] {
    const { request, processedQuery } = context;
    const timeout = this.config.maxSearchTimeoutMs;

    return [
      this.searchMemoryService(request, processedQuery, timeout),
      this.searchKanbanService(request, processedQuery, timeout),
      this.searchWikiService(request, processedQuery, timeout),
      this.searchScraperService(request, processedQuery, timeout)
    ];
  }

  /**
   * Search memory service
   */
  private async searchMemoryService(
    request: UnifiedSearchRequest,
    processedQuery: ProcessedQuery,
    timeout: number
  ): Promise<ServiceSearchResult> {
    const startTime = Date.now();
    
    try {
      // Filter for memory content if specified
      if (request.filters?.content_types?.length && 
          !request.filters.content_types.includes('memory_thought')) {
        return {
          service: 'memory',
          results: [],
          success: true,
          processingTimeMs: Date.now() - startTime
        };
      }

      // Use the existing memory service search method
      // Note: This assumes the memory service has a search method
      // You may need to adapt based on the actual MemoryService interface
      const memoryResults = await Promise.race([
        this.callMemorySearch(request, processedQuery),
        this.createTimeoutPromise(timeout)
      ]);

      return {
        service: 'memory',
        results: memoryResults,
        success: true,
        processingTimeMs: Date.now() - startTime
      };

    } catch (error) {
      console.warn('⚠️ Memory search failed:', error);
      return {
        service: 'memory',
        results: [],
        success: false,
        processingTimeMs: Date.now() - startTime,
        error: error as Error
      };
    }
  }

  /**
   * Search kanban service
   */
  private async searchKanbanService(
    request: UnifiedSearchRequest,
    processedQuery: ProcessedQuery,
    timeout: number
  ): Promise<ServiceSearchResult> {
    const startTime = Date.now();
    
    try {
      // Filter for kanban content if specified
      if (request.filters?.content_types?.length && 
          !request.filters.content_types.includes('kanban_card')) {
        return {
          service: 'kanban',
          results: [],
          success: true,
          processingTimeMs: Date.now() - startTime
        };
      }

      const kanbanResults = await Promise.race([
        this.callKanbanSearch(request, processedQuery),
        this.createTimeoutPromise(timeout)
      ]);

      return {
        service: 'kanban',
        results: kanbanResults,
        success: true,
        processingTimeMs: Date.now() - startTime
      };

    } catch (error) {
      console.warn('⚠️ Kanban search failed:', error);
      return {
        service: 'kanban',
        results: [],
        success: false,
        processingTimeMs: Date.now() - startTime,
        error: error as Error
      };
    }
  }

  /**
   * Search wiki service
   */
  private async searchWikiService(
    request: UnifiedSearchRequest,
    processedQuery: ProcessedQuery,
    timeout: number
  ): Promise<ServiceSearchResult> {
    const startTime = Date.now();
    
    try {
      // Filter for wiki content if specified
      if (request.filters?.content_types?.length && 
          !request.filters.content_types.includes('wiki_page')) {
        return {
          service: 'wiki',
          results: [],
          success: true,
          processingTimeMs: Date.now() - startTime
        };
      }

      const wikiResults = await Promise.race([
        this.callWikiSearch(request, processedQuery),
        this.createTimeoutPromise(timeout)
      ]);

      return {
        service: 'wiki',
        results: wikiResults,
        success: true,
        processingTimeMs: Date.now() - startTime
      };

    } catch (error) {
      console.warn('⚠️ Wiki search failed:', error);
      return {
        service: 'wiki',
        results: [],
        success: false,
        processingTimeMs: Date.now() - startTime,
        error: error as Error
      };
    }
  }

  /**
   * Search scraper service
   */
  private async searchScraperService(
    request: UnifiedSearchRequest,
    processedQuery: ProcessedQuery,
    timeout: number
  ): Promise<ServiceSearchResult> {
    const startTime = Date.now();
    
    try {
      // Filter for scraped content if specified
      if (request.filters?.content_types?.length && 
          !request.filters.content_types.some(t => t.startsWith('scraped_'))) {
        return {
          service: 'scraper',
          results: [],
          success: true,
          processingTimeMs: Date.now() - startTime
        };
      }

      const scraperResults = await Promise.race([
        this.callScraperSearch(request, processedQuery),
        this.createTimeoutPromise(timeout)
      ]);

      return {
        service: 'scraper',
        results: scraperResults,
        success: true,
        processingTimeMs: Date.now() - startTime
      };

    } catch (error) {
      console.warn('⚠️ Scraper search failed:', error);
      return {
        service: 'scraper',
        results: [],
        success: false,
        processingTimeMs: Date.now() - startTime,
        error: error as Error
      };
    }
  }

  /**
   * Call memory service search (placeholder - adapt to actual interface)
   */
  private async callMemorySearch(
    request: UnifiedSearchRequest,
    processedQuery: ProcessedQuery
  ): Promise<SearchResult[]> {
    // This is a placeholder implementation
    // You'll need to adapt this based on the actual MemoryService search interface
    
    // For now, return empty results - replace with actual memory service call
    console.log('🧠 Memory search placeholder - implement based on actual MemoryService interface');
    return [];
  }

  /**
   * Call kanban service search (placeholder - adapt to actual interface)
   */
  private async callKanbanSearch(
    request: UnifiedSearchRequest,
    processedQuery: ProcessedQuery
  ): Promise<SearchResult[]> {
    // This is a placeholder implementation
    // You'll need to adapt this based on the actual KanbanService search interface
    
    console.log('📋 Kanban search placeholder - implement based on actual KanbanService interface');
    return [];
  }

  /**
   * Call wiki service search (placeholder - adapt to actual interface)
   */
  private async callWikiSearch(
    request: UnifiedSearchRequest,
    processedQuery: ProcessedQuery
  ): Promise<SearchResult[]> {
    // This is a placeholder implementation
    // You'll need to adapt this based on the actual WikiService search interface
    
    console.log('📚 Wiki search placeholder - implement based on actual WikiService interface');
    return [];
  }

  /**
   * Call scraper service search
   */
  private async callScraperSearch(
    request: UnifiedSearchRequest,
    processedQuery: ProcessedQuery
  ): Promise<SearchResult[]> {
    try {
      // Use the enhanced scraper service search functionality
      const searchResults = await this.scraperService.searchScrapedContent(
        request.query,
        {
          limit: request.pagination.limit,
          semanticSearch: request.use_semantic,
          includeChunks: true,
          filters: {
            dateFrom: request.filters?.date_from,
            dateTo: request.filters?.date_to,
            minQuality: request.filters?.min_quality
          }
        }
      );

      // Convert scraper results to unified format
      return searchResults.results.map(result => this.convertScraperResult(result));
      
    } catch (error) {
      console.warn('Scraper search failed, returning empty results:', error);
      return [];
    }
  }

  /**
   * Convert scraper result to unified search result format
   */
  private convertScraperResult(scraperResult: any): SearchResult {
    // This is a simplified conversion - adapt based on actual scraper result format
    return {
      id: scraperResult.id || crypto.randomUUID(),
      type: 'scraped_page',
      title: scraperResult.title || 'Untitled',
      preview: scraperResult.preview ? {
        text: scraperResult.preview,
        length: scraperResult.preview.length,
        truncated: false
      } : undefined,
      url: scraperResult.url,
      score: {
        relevance: scraperResult.score || 0.5,
        semantic_similarity: scraperResult.vectorScore,
        text_match: scraperResult.textScore
      },
      metadata: {
        created_at: scraperResult.scrapedAt || new Date().toISOString(),
        updated_at: scraperResult.updatedAt
      }
    };
  }

  /**
   * Create timeout promise for search operations
   */
  private createTimeoutPromise(timeoutMs: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Search timeout after ${timeoutMs}ms`));
      }, timeoutMs);
    });
  }

  /**
   * Process search results from promise.allSettled
   */
  private processSearchResults(
    settledResults: PromiseSettledResult<ServiceSearchResult>[],
    context: SearchContext
  ): SearchSourceResult[] {
    const sourceResults: SearchSourceResult[] = [];

    settledResults.forEach((settled, index) => {
      const serviceName = ['memory', 'kanban', 'wiki', 'scraper'][index] as 'memory' | 'kanban' | 'wiki' | 'scraper';
      
      if (settled.status === 'fulfilled') {
        const result = settled.value;
        sourceResults.push({
          source: serviceName,
          results: result.results,
          processingTimeMs: result.processingTimeMs,
          error: result.error
        });
      } else {
        console.warn(`❌ ${serviceName} search promise rejected:`, settled.reason);
        sourceResults.push({
          source: serviceName,
          results: [],
          processingTimeMs: 0,
          error: settled.reason
        });
      }
    });

    return sourceResults;
  }

  /**
   * Merge and rank results from all sources
   */
  private async mergeAndRankResults(
    sourceResults: SearchSourceResult[],
    context: SearchContext
  ): Promise<SearchResult[]> {
    return this.resultMerger.mergeAndRank(
      sourceResults,
      context.processedQuery,
      this.config.similarityThreshold
    );
  }

  /**
   * Apply pagination to results
   */
  private applyPagination(
    results: SearchResult[],
    request: UnifiedSearchRequest
  ): SearchResult[] {
    const { page = 1, limit = 20, offset = 0 } = request.pagination;
    
    const startIndex = offset || ((page - 1) * limit);
    const endIndex = startIndex + limit;
    
    return results.slice(startIndex, endIndex);
  }

  /**
   * Build the final search response
   */
  private buildResponse(
    paginatedResults: SearchResult[],
    totalCount: number,
    aggregations: SearchAggregations,
    context: SearchContext,
    suggestions: Array<{ query: string; type: string; confidence: number }>
  ): UnifiedSearchResponse {
    const { request, startTime } = context;
    const { page = 1, limit = 20 } = request.pagination;
    const totalPages = Math.ceil(totalCount / limit);

    return {
      results: paginatedResults,
      total_count: totalCount,
      pagination: {
        current_page: page,
        per_page: limit,
        total_pages: totalPages,
        has_next: page < totalPages,
        has_prev: page > 1
      },
      aggregations,
      performance: {
        processing_time_ms: Date.now() - startTime,
        documents_searched: totalCount
      },
      suggestions: suggestions.map(s => ({
        query: s.query,
        type: s.type as 'spelling' | 'completion' | 'related',
        confidence: s.confidence
      }))
    };
  }

  /**
   * Build error response
   */
  private buildErrorResponse(
    context: SearchContext,
    error: Error
  ): UnifiedSearchResponse {
    const { request, startTime } = context;
    const { page = 1, limit = 20 } = request.pagination;

    return {
      results: [],
      total_count: 0,
      pagination: {
        current_page: page,
        per_page: limit,
        total_pages: 0,
        has_next: false,
        has_prev: false
      },
      aggregations: {
        by_type: {},
        by_date: { last_day: 0, last_week: 0, last_month: 0, older: 0 },
        top_tags: []
      },
      performance: {
        processing_time_ms: Date.now() - startTime,
        documents_searched: 0
      },
      suggestions: []
    };
  }
}

/**
 * Create a unified search service with default configuration
 */
export function createUnifiedSearchService(
  memoryService: MemoryService,
  kanbanService: KanbanService,
  wikiService: WikiService,
  scraperService: EnhancedScraperService,
  overrides: Partial<UnifiedSearchConfig> = {}
): UnifiedSearchService {
  const defaultConfig: UnifiedSearchConfig = {
    enableCaching: true,
    enableAnalytics: true,
    maxSearchTimeoutMs: 10000, // 10 seconds
    maxResultsPerPage: 100,
    similarityThreshold: 0.8
  };

  const config = { ...defaultConfig, ...overrides };
  return new UnifiedSearchService(
    memoryService,
    kanbanService,
    wikiService,
    scraperService,
    config
  );
}