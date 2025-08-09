/**
 * Enhanced Scraper Service
 * 
 * Extends the base scraper service with vector integration, content chunking,
 * and markitdown conversion capabilities for improved search functionality.
 */

import { ScraperService } from './service.js';
import { ScraperDatabaseManager } from './database.js';
import { ScrapingEngine } from './engine.js';
import { VectorScrapingEngine } from './VectorScrapingEngine.js';
import { MarkdownProcessor } from './MarkdownProcessor.js';
import { ContentChunkingService } from '../chunking/ContentChunkingService.js';
import { VectorEngine } from '../memory/vectorEngine.js';
import { validateInput } from '../../utils/validation.js';
import { randomUUID } from 'node:crypto';

import type {
  VectorScrapingOptions,
  ScrapedContentWithVector,
  ScrapedContentSearchOptions,
  ScrapedContentSearchResults,
  BackfillOptions,
  BackfillResults,
  VectorScrapingOptionsSchema,
  ScrapedContentSearchOptionsSchema,
  BackfillOptionsSchema
} from './types.js';
import type { ChunkingOptions } from '../../shared/types/content.js';

/**
 * Configuration for the enhanced scraper service
 */
export interface EnhancedScraperConfig {
  natsUrl: string;
  vectorSize?: number;
  defaultEmbeddingModel?: string;
  defaultChunkingOptions?: ChunkingOptions;
  requestTimeout?: number;
  batchSize?: number;
}

export class EnhancedScraperService extends ScraperService {
  private vectorEngine: VectorScrapingEngine;
  private markdownProcessor: MarkdownProcessor;
  private vectorStore: VectorEngine;

  constructor(
    database: ScraperDatabaseManager,
    engine: ScrapingEngine,
    private chunkingService: ContentChunkingService,
    private config: EnhancedScraperConfig
  ) {
    super(database, engine);
    
    // Initialize enhanced components
    this.vectorEngine = new VectorScrapingEngine(
      {
        natsUrl: config.natsUrl,
        embeddingModel: config.defaultEmbeddingModel,
        timeout: config.requestTimeout || 30000,
        batchSize: config.batchSize || 32,
        vectorSize: config.vectorSize || 1536
      },
      this.chunkingService
    );

    this.markdownProcessor = new MarkdownProcessor({
      natsUrl: config.natsUrl,
      timeout: config.requestTimeout || 30000
    });

    this.vectorStore = new VectorEngine({
      vectorSize: config.vectorSize || 1536,
      natsUrl: config.natsUrl
    });
  }

  /**
   * Initialize all enhanced components
   */
  async initialize(): Promise<void> {
    console.log('🚀 Initializing enhanced scraper service...');
    
    try {
      await Promise.all([
        this.vectorEngine.initialize(),
        this.markdownProcessor.initialize(),
        this.vectorStore.initialize()
      ]);
      
      console.log('✅ Enhanced scraper service initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize enhanced scraper service:', error);
      // Don't throw - allow service to work with degraded functionality
      console.warn('⚠️ Service will run with limited functionality');
    }
  }

  /**
   * Scrape URL with enhanced vector processing and embeddings
   */
  async scrapeUrlWithEmbeddings(
    input: VectorScrapingOptions
  ): Promise<ScrapedContentWithVector> {
    const args = validateInput(VectorScrapingOptionsSchema, input);
    const startTime = Date.now();

    console.log(`🔍 Enhanced scraping started for: ${args.url}`);

    try {
      // Step 1: Perform basic scraping
      const baseContent = await super.scrapeUrl(args);
      
      // Initialize enhanced result
      const enhancedResult: ScrapedContentWithVector = {
        ...baseContent,
        embeddingStatus: 'pending',
        chunkCount: 0,
        chunks: []
      };

      // Step 2: Process with vector capabilities if enabled
      if (args.vector?.enabled !== false) {
        await this.processContentWithVector(enhancedResult, args);
      }

      const processingTime = Date.now() - startTime;
      console.log(`⚡ Enhanced scraping completed for ${args.url} in ${processingTime}ms`);

      return enhancedResult;
    } catch (error) {
      console.error(`❌ Enhanced scraping failed for ${args.url}:`, error);
      throw error;
    }
  }

  /**
   * Search scraped content using vector similarity and text search
   */
  async searchScrapedContent(
    query: string,
    options: ScrapedContentSearchOptions
  ): Promise<ScrapedContentSearchResults> {
    const searchOptions = validateInput(ScrapedContentSearchOptionsSchema, { query, ...options });
    const startTime = Date.now();

    console.log(`🔍 Searching scraped content for: "${query}"`);

    try {
      const results: ScrapedContentSearchResults['results'] = [];

      // Vector search (if supported and requested)
      if (searchOptions.searchType === 'vector' || searchOptions.searchType === 'hybrid') {
        try {
          const vectorResults = await this.vectorStore.findSimilar(
            query,
            searchOptions.threshold,
            searchOptions.limit
          );

          console.log(`📊 Found ${vectorResults.length} vector results`);

          // Convert vector results to search results format
          for (const vectorResult of vectorResults) {
            const page = await this.database.getPage(vectorResult.memoryId);
            if (page) {
              const enhancedPage = await this.convertToEnhancedContent(page);
              
              // Get matching chunks if requested
              let matchingChunks;
              if (searchOptions.includeChunks) {
                const chunks = await this.database.getContentChunks(page.id);
                matchingChunks = chunks.map(chunk => ({
                  id: chunk.id,
                  content: chunk.content,
                  similarity: vectorResult.similarity,
                  startPosition: chunk.start_position || 0,
                  endPosition: chunk.end_position || chunk.content.length
                }));
              }

              results.push({
                content: enhancedPage,
                similarity: vectorResult.similarity,
                matchingChunks
              });
            }
          }
        } catch (vectorError) {
          console.warn('⚠️ Vector search failed, falling back to text search:', vectorError);
        }
      }

      // Text search (if no vector results or hybrid mode)
      if (results.length === 0 || searchOptions.searchType === 'text' || searchOptions.searchType === 'hybrid') {
        const textResults = await this.database.searchContentChunks({
          query: searchOptions.query,
          limit: searchOptions.limit,
          offset: 0
        });

        console.log(`📊 Found ${textResults.length} text search results`);

        for (const textResult of textResults) {
          // Avoid duplicates in hybrid mode
          if (!results.find(r => r.content.id === textResult.page_id)) {
            const page = await this.database.getPage(textResult.page_id);
            if (page) {
              const enhancedPage = await this.convertToEnhancedContent(page);

              let matchingChunks;
              if (searchOptions.includeChunks) {
                matchingChunks = [{
                  id: textResult.id,
                  content: textResult.content,
                  similarity: 0.8, // Default similarity for text matches
                  startPosition: textResult.start_position || 0,
                  endPosition: textResult.end_position || textResult.content.length
                }];
              }

              results.push({
                content: enhancedPage,
                matchingChunks
              });
            }
          }
        }
      }

      // Apply additional filters
      let filteredResults = results;

      if (searchOptions.domain) {
        filteredResults = results.filter(result => 
          result.content.url.includes(searchOptions.domain)
        );
      }

      // Sort by similarity if available
      filteredResults.sort((a, b) => (b.similarity || 0) - (a.similarity || 0));

      // Apply limit
      if (searchOptions.limit) {
        filteredResults = filteredResults.slice(0, searchOptions.limit);
      }

      const searchTimeMs = Date.now() - startTime;
      console.log(`⚡ Search completed in ${searchTimeMs}ms with ${filteredResults.length} results`);

      return {
        results: filteredResults,
        metadata: {
          query: searchOptions.query,
          totalResults: filteredResults.length,
          searchTimeMs,
          searchType: searchOptions.searchType
        }
      };
    } catch (error) {
      console.error('❌ Search failed:', error);
      throw new Error(`Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Backfill existing content with embeddings and chunks
   */
  async backfillExistingContent(options: BackfillOptions): Promise<BackfillResults> {
    const backfillOptions = validateInput(BackfillOptionsSchema, options);
    const startTime = Date.now();

    console.log('🔄 Starting backfill process for existing content');

    const results: BackfillResults = {
      pagesProcessed: 0,
      pagesFailed: 0,
      chunksCreated: 0,
      embeddingsGenerated: 0,
      processingTimeMs: 0,
      failures: []
    };

    try {
      // Get pages that need processing
      const pages = await this.database.getPagesForVectorProcessing({
        missingEmbeddingsOnly: backfillOptions.missingEmbeddingsOnly,
        domain: backfillOptions.domain,
        limit: backfillOptions.batchSize * 10, // Get more than batch size for selection
        dateRange: backfillOptions.dateRange
      });

      console.log(`📋 Found ${pages.length} pages for backfill processing`);

      // Process in batches
      const batchSize = backfillOptions.batchSize || 10;
      for (let i = 0; i < pages.length; i += batchSize) {
        const batch = pages.slice(i, i + batchSize);
        
        console.log(`🔄 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(pages.length / batchSize)}`);

        await Promise.all(
          batch.map(async (page) => {
            try {
              // Skip if already processed and not forcing reprocessing
              if (!backfillOptions.forceReprocess && page.status === 'success') {
                const chunks = await this.database.getContentChunks(page.id);
                if (chunks.length > 0) {
                  console.log(`⏭️ Skipping already processed page: ${page.url}`);
                  return;
                }
              }

              // Convert to enhanced format and process
              const enhancedPage = await this.convertToEnhancedContent(page);
              
              const vectorOptions: VectorScrapingOptions = {
                url: page.url,
                vector: {
                  enabled: true,
                  generateEmbeddings: true,
                  convertToMarkdown: true,
                  chunkingOptions: backfillOptions.chunkingOptions
                }
              };

              await this.processContentWithVector(enhancedPage, vectorOptions);

              results.pagesProcessed++;
              results.chunksCreated += enhancedPage.chunkCount;
              results.embeddingsGenerated += enhancedPage.chunkCount;

              console.log(`✅ Processed page: ${page.url} (${enhancedPage.chunkCount} chunks)`);
            } catch (error) {
              console.error(`❌ Failed to process page ${page.url}:`, error);
              
              results.pagesFailed++;
              results.failures.push({
                pageId: page.id,
                url: page.url,
                error: error instanceof Error ? error.message : 'Unknown error'
              });
            }
          })
        );
      }

      results.processingTimeMs = Date.now() - startTime;
      
      console.log(`🎉 Backfill completed: ${results.pagesProcessed} processed, ${results.pagesFailed} failed in ${results.processingTimeMs}ms`);
      
      return results;
    } catch (error) {
      console.error('❌ Backfill process failed:', error);
      results.processingTimeMs = Date.now() - startTime;
      throw error;
    }
  }

  /**
   * Get enhanced statistics including vector processing info
   */
  async getEnhancedStats() {
    const [baseStats, vectorStats] = await Promise.all([
      super.getDetailedStats(),
      this.database.getVectorStats()
    ]);

    return {
      ...baseStats,
      vector: vectorStats,
      services: {
        vectorEngine: this.vectorEngine.isReady(),
        markdownProcessor: this.markdownProcessor.isReady(),
        vectorStore: true // VectorEngine doesn't have isReady method
      }
    };
  }

  /**
   * Process content with vector capabilities (private helper)
   */
  private async processContentWithVector(
    content: ScrapedContentWithVector,
    options: VectorScrapingOptions
  ): Promise<void> {
    try {
      // Mark as processing
      content.embeddingStatus = 'processing';
      await this.database.updatePageWithVectorInfo(content.id, {
        embeddingStatus: 'processing'
      });

      // Step 1: Convert to markdown if requested
      let processedContent = content.content;
      if (options.vector?.convertToMarkdown !== false) {
        try {
          const markdownResult = await this.markdownProcessor.convert(
            content.content,
            { preserveFormatting: true }
          );
          
          content.markdownContent = markdownResult.markdown;
          processedContent = markdownResult.markdown;
          
          await this.database.updatePageWithVectorInfo(content.id, {
            markdownContent: markdownResult.markdown
          });

          console.log(`📝 Converted content to markdown (${markdownResult.processingTimeMs}ms)`);
        } catch (markdownError) {
          console.warn('⚠️ Markdown conversion failed, using original content:', markdownError);
          processedContent = content.content;
        }
      }

      // Step 2: Chunk content and generate embeddings
      if (processedContent && processedContent.trim().length > 0) {
        const chunkingOptions: ChunkingOptions & { generateEmbeddings?: boolean; embeddingModel?: string } = {
          strategy: options.vector?.chunkingOptions?.strategy || 'paragraph',
          target_size: options.vector?.chunkingOptions?.target_size || 1000,
          max_size: options.vector?.chunkingOptions?.max_size || 1500,
          min_size: options.vector?.chunkingOptions?.min_size || 200,
          overlap_size: options.vector?.chunkingOptions?.overlap_size || 100,
          preserve_boundaries: {
            sentences: true,
            paragraphs: true,
            code_blocks: true,
            list_items: true
          },
          generateEmbeddings: options.vector?.generateEmbeddings !== false,
          embeddingModel: options.vector?.embeddingModel
        };

        const { chunks, embeddings } = await this.vectorEngine.processContent(
          processedContent,
          chunkingOptions,
          content.id,
          'scraped_page'
        );

        console.log(`📊 Generated ${chunks.length} chunks, ${embeddings.successful} embeddings`);

        // Step 3: Store chunks in database
        if (chunks.length > 0) {
          await this.database.createContentChunks(
            content.id,
            chunks.map(chunk => ({
              id: chunk.id,
              content: chunk.content,
              vectorId: chunk.vector_id,
              startPosition: chunk.start_position,
              endPosition: chunk.end_position,
              chunkIndex: chunk.chunk_index,
              metadata: chunk.metadata
            }))
          );

          // Update content with chunk information
          content.chunkCount = chunks.length;
          content.chunks = chunks.map(chunk => ({
            id: chunk.id,
            content: chunk.content,
            vectorId: chunk.vector_id,
            startPosition: chunk.start_position,
            endPosition: chunk.end_position,
            chunkIndex: chunk.chunk_index,
            metadata: {
              type: chunk.metadata.type,
              wordCount: chunk.metadata.word_count || 0,
              qualityScore: chunk.metadata.quality_score
            }
          }));
        }

        // Step 4: Update database with final status
        const finalStatus = embeddings.failed === 0 ? 'completed' : 'failed';
        content.embeddingStatus = finalStatus;
        content.lastVectorized = new Date().toISOString();

        await this.database.updatePageWithVectorInfo(content.id, {
          embeddingStatus: finalStatus,
          chunkCount: chunks.length,
          lastVectorized: content.lastVectorized
        });
      } else {
        // No content to process
        content.embeddingStatus = 'failed';
        await this.database.updatePageWithVectorInfo(content.id, {
          embeddingStatus: 'failed'
        });
      }
    } catch (error) {
      console.error('❌ Vector processing failed:', error);
      
      content.embeddingStatus = 'failed';
      await this.database.updatePageWithVectorInfo(content.id, {
        embeddingStatus: 'failed'
      });
      
      throw error;
    }
  }

  /**
   * Convert base scraped content to enhanced format (private helper)
   */
  private async convertToEnhancedContent(page: any): Promise<ScrapedContentWithVector> {
    const chunks = await this.database.getContentChunks(page.id);
    
    return {
      id: page.id,
      url: page.url,
      title: page.title || undefined,
      content: page.content,
      contentHash: page.content_hash,
      metadata: JSON.parse(page.metadata || '{}'),
      scrapedAt: page.scraped_at,
      status: page.status,
      errorMessage: page.error_message || undefined,
      markdownContent: page.markdown_content || undefined,
      vectorId: page.vector_id || undefined,
      embeddingStatus: page.embedding_status || 'pending',
      chunkCount: page.chunk_count || chunks.length,
      lastVectorized: page.last_vectorized || undefined,
      chunks: chunks.map(chunk => ({
        id: chunk.id,
        content: chunk.content,
        vectorId: chunk.vector_id,
        startPosition: chunk.start_position || 0,
        endPosition: chunk.end_position || chunk.content.length,
        chunkIndex: chunk.chunk_index || 0,
        metadata: JSON.parse(chunk.metadata || '{}')
      }))
    };
  }

  /**
   * Close all enhanced components
   */
  async close(): Promise<void> {
    console.log('🔌 Closing enhanced scraper service...');
    
    await Promise.all([
      this.vectorEngine.close(),
      this.markdownProcessor.close(),
      this.vectorStore.close()
    ]);
    
    console.log('✅ Enhanced scraper service closed');
  }
}