# Unified Search & Vector-Enhanced Content System - Detailed Roadmap

## **Project Overview**

**Goal**: Implement a comprehensive unified search system that enables semantic similarity search across all content types: Memory, Kanban, Wiki, Scraped web pages, and Codebase analysis.

**Total Effort**: 14-20 days  
**Timeline**: 3-4 weeks  
**Architecture**: Vector embeddings + semantic search across multiple content sources

---

## **Phase 1: Foundation & Core Search (8-10 days)**

### **Sprint 1.1: Database & Infrastructure (2 days)**

#### **Work Item 1.1.1: Enhanced Database Schema Migration**
**Agent**: @agent-nodejs-backend-engineer  
**Effort**: 1.5 days  
**Priority**: Critical  

**Description**: Create comprehensive database schema enhancements to support vector embeddings, content chunking, and unified search across all content types.

**Files to Create/Modify**:
- `migrations/src/migrations/003_unified_search_foundation.ts` (NEW)
- `core/src/shared/types/search.ts` (NEW)
- `core/src/shared/types/embedding.ts` (EXTEND)

**Detailed Tasks**:
1. **Scraped Pages Enhancements**:
   ```sql
   ALTER TABLE scraped_pages ADD COLUMN vector_id TEXT;
   ALTER TABLE scraped_pages ADD COLUMN markdown_content TEXT;
   ALTER TABLE scraped_pages ADD COLUMN embedding_status TEXT DEFAULT 'pending';
   ALTER TABLE scraped_pages ADD COLUMN chunk_count INTEGER DEFAULT 0;
   ALTER TABLE scraped_pages ADD COLUMN last_vectorized TIMESTAMP;
   ```

2. **Content Chunks Table**:
   ```sql
   CREATE TABLE scraped_content_chunks (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     page_id UUID REFERENCES scraped_pages(id) ON DELETE CASCADE,
     content TEXT NOT NULL,
     vector_id TEXT,
     start_position INTEGER,
     end_position INTEGER,
     chunk_index INTEGER,
     metadata JSONB DEFAULT '{}',
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
   );
   ```

3. **Search Analytics Table**:
   ```sql
   CREATE TABLE search_queries (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     query TEXT NOT NULL,
     user_id UUID,
     results_count INTEGER,
     processing_time_ms INTEGER,
     result_types JSONB DEFAULT '{}',
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
   );
   ```

4. **Code Analysis Tables** (prepare for Phase 2):
   ```sql
   CREATE TABLE code_repositories (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     name TEXT NOT NULL,
     path TEXT NOT NULL,
     status TEXT DEFAULT 'pending',
     last_indexed TIMESTAMP,
     file_count INTEGER DEFAULT 0,
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
   );

   CREATE TABLE code_files (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     repository_id UUID REFERENCES code_repositories(id) ON DELETE CASCADE,
     file_path TEXT NOT NULL,
     language TEXT NOT NULL,
     content TEXT NOT NULL,
     vector_id TEXT,
     function_count INTEGER DEFAULT 0,
     class_count INTEGER DEFAULT 0,
     last_modified TIMESTAMP,
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
   );

   CREATE TABLE code_chunks (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     file_id UUID REFERENCES code_files(id) ON DELETE CASCADE,
     chunk_type TEXT NOT NULL, -- 'function', 'class', 'comment', 'documentation'
     name TEXT,
     content TEXT NOT NULL,
     vector_id TEXT,
     line_start INTEGER,
     line_end INTEGER,
     metadata JSONB DEFAULT '{}',
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
   );
   ```

5. **Performance Indexes**:
   ```sql
   -- Scraped content indexes
   CREATE INDEX idx_scraped_pages_vector_id ON scraped_pages(vector_id);
   CREATE INDEX idx_scraped_pages_embedding_status ON scraped_pages(embedding_status);
   CREATE INDEX idx_scraped_content_chunks_page_id ON scraped_content_chunks(page_id);
   CREATE INDEX idx_scraped_content_chunks_vector_id ON scraped_content_chunks(vector_id);
   
   -- Search analytics indexes
   CREATE INDEX idx_search_queries_user_id ON search_queries(user_id);
   CREATE INDEX idx_search_queries_created_at ON search_queries(created_at);
   
   -- Code analysis indexes
   CREATE INDEX idx_code_files_repository_id ON code_files(repository_id);
   CREATE INDEX idx_code_files_language ON code_files(language);
   CREATE INDEX idx_code_files_vector_id ON code_files(vector_id);
   CREATE INDEX idx_code_chunks_file_id ON code_chunks(file_id);
   CREATE INDEX idx_code_chunks_chunk_type ON code_chunks(chunk_type);
   CREATE INDEX idx_code_chunks_vector_id ON code_chunks(vector_id);
   ```

**Acceptance Criteria**:
- [ ] All migration scripts execute successfully on fresh database
- [ ] All migration scripts execute successfully on existing database with data
- [ ] All indexes are created and performance tested
- [ ] TypeScript types are updated to reflect new schema
- [ ] Migration includes proper rollback (down) functions
- [ ] No data loss occurs during migration

---

#### **Work Item 1.1.2: Shared Types and Interfaces**
**Agent**: @agent-nodejs-backend-engineer  
**Effort**: 0.5 days  
**Priority**: Critical  

**Description**: Define comprehensive TypeScript types and interfaces for the unified search system.

**Files to Create/Modify**:
- `core/src/shared/types/search.ts` (NEW)
- `core/src/shared/types/content.ts` (NEW)
- `core/src/shared/types/index.ts` (EXTEND)

**Detailed Implementation**:
```typescript
// core/src/shared/types/search.ts
export interface UnifiedSearchRequest {
  query: string;
  sources?: SearchSource[];
  limit?: number;
  similarityThreshold?: number;
  includeMetadata?: boolean;
  filters?: SearchFilters;
}

export interface UnifiedSearchResults {
  query: string;
  total: number;
  processingTimeMs: number;
  results: SearchResult[];
  facets: SearchFacets;
  suggestions?: string[];
}

export interface SearchResult {
  id: string;
  type: SearchResultType;
  title: string;
  content: string;
  snippet: string;
  similarity: number;
  metadata: SearchResultMetadata;
  url?: string;
  highlights?: TextHighlight[];
}

export type SearchSource = 'memory' | 'kanban' | 'wiki' | 'scraped' | 'code';
export type SearchResultType = 'memory' | 'kanban_card' | 'wiki_page' | 'scraped_page' | 'code_function' | 'code_class' | 'code_file';

export interface SearchFilters {
  dateRange?: {
    start: Date;
    end: Date;
  };
  sources?: SearchSource[];
  languages?: string[]; // for code search
  domains?: string[]; // for scraped content
}

export interface ContentChunk {
  id: string;
  content: string;
  vectorId?: string;
  startPosition: number;
  endPosition: number;
  chunkIndex: number;
  metadata: Record<string, any>;
}

export interface ChunkingOptions {
  maxChunkSize: number;
  overlap: number;
  preserveContext: boolean;
  strategy?: 'paragraph' | 'sentence' | 'fixed';
}
```

**Acceptance Criteria**:
- [ ] All types are properly exported and accessible
- [ ] Types compile without errors in strict TypeScript mode
- [ ] Types are comprehensive enough for all planned features
- [ ] Documentation comments are included for complex types
- [ ] Types are consistent with existing codebase patterns

---

### **Sprint 1.2: Content Processing Services (3 days)**

#### **Work Item 1.2.1: Content Chunking Service**
**Agent**: @agent-nodejs-backend-engineer  
**Effort**: 1 day  
**Priority**: High  

**Description**: Implement intelligent content chunking service that can split large documents into semantically meaningful chunks while preserving context.

**Files to Create/Modify**:
- `core/src/services/chunking/ContentChunkingService.ts` (NEW)
- `core/src/services/chunking/strategies/index.ts` (NEW)
- `core/src/services/chunking/strategies/ParagraphStrategy.ts` (NEW)
- `core/src/services/chunking/strategies/SentenceStrategy.ts` (NEW)
- `core/src/services/chunking/strategies/FixedSizeStrategy.ts` (NEW)
- `core/src/services/chunking/__tests__/ContentChunkingService.test.ts` (NEW)

**Detailed Implementation**:
```typescript
// core/src/services/chunking/ContentChunkingService.ts
export class ContentChunkingService {
  constructor(private config: ChunkingConfig) {}

  async chunkContent(
    content: string, 
    options: ChunkingOptions
  ): Promise<ContentChunk[]> {
    // 1. Choose optimal chunking strategy
    const strategy = this.selectStrategy(content, options);
    
    // 2. Apply chunking strategy
    const chunks = await strategy.chunk(content, options);
    
    // 3. Apply overlap if specified
    if (options.overlap > 0) {
      return this.addOverlap(chunks, options.overlap);
    }
    
    return chunks;
  }

  private selectStrategy(content: string, options: ChunkingOptions): ChunkingStrategy {
    // Smart strategy selection based on content analysis
    const paragraphCount = (content.match(/\n\s*\n/g) || []).length;
    const avgParagraphLength = content.length / Math.max(paragraphCount, 1);
    
    if (options.strategy === 'paragraph' || (avgParagraphLength < options.maxChunkSize && paragraphCount > 1)) {
      return new ParagraphStrategy();
    } else if (options.strategy === 'sentence' || this.containsWellFormedSentences(content)) {
      return new SentenceStrategy();
    } else {
      return new FixedSizeStrategy();
    }
  }

  private addOverlap(chunks: ContentChunk[], overlapSize: number): ContentChunk[] {
    // Implementation for adding context overlap between chunks
    // This ensures semantic continuity across chunk boundaries
  }

  private containsWellFormedSentences(content: string): boolean {
    // Heuristic to determine if content has clear sentence boundaries
    const sentenceEnders = /[.!?]+\s+[A-Z]/g;
    const matches = content.match(sentenceEnders) || [];
    return matches.length > 3; // Arbitrary threshold
  }
}
```

**Strategy Implementations**:
- **ParagraphStrategy**: Split on double newlines, preserve paragraph integrity
- **SentenceStrategy**: Split on sentence boundaries using NLP techniques
- **FixedSizeStrategy**: Split at fixed character counts with word boundary preservation

**Acceptance Criteria**:
- [ ] Service can chunk content using multiple strategies
- [ ] Chunk overlap functionality works correctly
- [ ] Performance is acceptable for documents up to 100KB
- [ ] Unit tests cover all chunking strategies
- [ ] Edge cases handled (empty content, very short content, etc.)
- [ ] Context preservation validated across chunk boundaries

---

#### **Work Item 1.2.2: Enhanced Scraper Service with Vector Integration**
**Agent**: @agent-fullstack-feature-developer  
**Effort**: 2 days  
**Priority**: Critical  

**Description**: Enhance the existing scraper service to support vector embeddings, content chunking, and markitdown conversion for improved search capabilities.

**Files to Create/Modify**:
- `core/src/services/scraper/service.ts` (EXTEND)
- `core/src/services/scraper/VectorScrapingEngine.ts` (NEW)
- `core/src/services/scraper/MarkdownProcessor.ts` (NEW)
- `core/src/services/scraper/types.ts` (EXTEND)
- `core/src/services/scraper/database.ts` (EXTEND)
- `core/src/services/scraper/__tests__/enhanced-service.test.ts` (NEW)
- `gateway/src/routes/scraper.routes.ts` (EXTEND)

**Enhanced Scraper Service Implementation**:
```typescript
// core/src/services/scraper/service.ts (enhanced)
export class EnhancedScraperService extends ScraperService {
  constructor(
    database: ScraperDatabaseManager,
    engine: ScrapingEngine,
    private chunkingService: ContentChunkingService,
    private embeddingsWorker: EmbeddingsWorkerClient,
    private vectorEngine: VectorEngine,
    private markdownProcessor: MarkdownProcessor
  ) {
    super(database, engine);
  }

  async scrapeUrlWithEmbeddings(
    input: ScrapeUrlInput & VectorScrapingOptions
  ): Promise<ScrapedContentWithVector> {
    try {
      // 1. Execute standard scraping
      const scrapedContent = await this.scrapeUrl(input);
      
      // 2. Convert to markdown if requested
      if (input.convertToMarkdown) {
        const markdownContent = await this.markdownProcessor.convert(
          scrapedContent.content,
          { sourceUrl: scrapedContent.url, preserveImages: input.preserveImages }
        );
        
        await this.database.updatePageMarkdown(scrapedContent.id, markdownContent);
        scrapedContent.markdown = markdownContent;
      }
      
      // 3. Process for vector embeddings
      if (input.generateEmbeddings !== false) {
        await this.processContentForVectorSearch(scrapedContent, input);
      }
      
      return scrapedContent as ScrapedContentWithVector;
    } catch (error) {
      console.error('Enhanced scraping failed:', error);
      throw error;
    }
  }

  private async processContentForVectorSearch(
    content: ScrapedContent,
    options: VectorScrapingOptions
  ): Promise<void> {
    try {
      // Update embedding status
      await this.database.updateEmbeddingStatus(content.id, 'processing');

      // Choose content for embedding (prefer markdown if available)
      const contentForEmbedding = content.markdown || content.content;

      // Chunk the content intelligently
      const chunks = await this.chunkingService.chunkContent(contentForEmbedding, {
        maxChunkSize: options.chunkSize || 8000,
        overlap: options.chunkOverlap || 200,
        preserveContext: true,
        strategy: options.chunkingStrategy || 'paragraph'
      });

      // Process chunks in parallel (with concurrency limit)
      const chunkProcessingPromises = chunks.map(async (chunk, index) => {
        // Generate embedding
        const embeddingResponse = await this.embeddingsWorker.generateEmbedding({
          text: chunk.content,
          metadata: {
            sourceUrl: content.url,
            sourceTitle: content.title,
            chunkIndex: index,
            totalChunks: chunks.length,
            contentType: 'scraped_page'
          }
        });

        // Store in vector database
        const vectorId = await this.vectorEngine.indexContent(
          `scraper_${content.id}_${index}`,
          chunk.content,
          embeddingResponse.embedding,
          {
            sourceType: 'scraped_page',
            sourceId: content.id,
            url: content.url,
            title: content.title,
            domain: new URL(content.url).hostname,
            chunkIndex: index,
            scrapedAt: content.createdAt
          }
        );

        // Save chunk to database
        await this.database.createContentChunk({
          pageId: content.id,
          content: chunk.content,
          vectorId,
          startPosition: chunk.startPosition,
          endPosition: chunk.endPosition,
          chunkIndex: index,
          metadata: chunk.metadata
        });

        return vectorId;
      });

      await Promise.all(chunkProcessingPromises);

      // Update final status
      await this.database.updateEmbeddingStatus(content.id, 'completed', chunks.length);
      
    } catch (error) {
      await this.database.updateEmbeddingStatus(content.id, 'failed');
      throw error;
    }
  }

  async searchScrapedContent(
    query: string,
    options: ScrapedContentSearchOptions = {}
  ): Promise<ScrapedContentSearchResults> {
    const startTime = Date.now();
    
    try {
      // Generate query embedding
      const queryEmbedding = await this.embeddingsWorker.generateEmbedding({
        text: query,
        metadata: { purpose: 'search' }
      });

      // Search in vector database
      const similarChunks = await this.vectorEngine.findSimilar(
        queryEmbedding.embedding,
        options.similarityThreshold || 0.7,
        options.limit || 20,
        { sourceType: 'scraped_page', ...options.filters }
      );

      // Group chunks by source page and rank
      const groupedResults = this.groupChunksByPage(similarChunks);

      // Convert to search results with snippets
      const searchResults = await this.convertToSearchResults(groupedResults, query);

      return {
        results: searchResults,
        total: searchResults.length,
        processingTimeMs: Date.now() - startTime,
        query
      };
    } catch (error) {
      console.error('Scraped content search failed:', error);
      throw error;
    }
  }

  async backfillExistingContent(options: BackfillOptions = {}): Promise<BackfillResults> {
    // Process existing scraped content that doesn't have embeddings
    const unprocessedPages = await this.database.getPagesWithEmbeddingStatus('pending');
    
    let processed = 0;
    let failed = 0;
    
    for (const page of unprocessedPages) {
      try {
        await this.processContentForVectorSearch(page, options);
        processed++;
      } catch (error) {
        console.error(`Failed to backfill page ${page.id}:`, error);
        failed++;
      }
      
      // Respect rate limits
      if (options.rateLimitMs) {
        await new Promise(resolve => setTimeout(resolve, options.rateLimitMs));
      }
    }
    
    return { processed, failed, total: unprocessedPages.length };
  }
}
```

**Markitdown Integration**:
```typescript
// core/src/services/scraper/MarkdownProcessor.ts
export class MarkdownProcessor {
  constructor(private natsConnection: NatsConnection) {}

  async convert(htmlContent: string, options: MarkdownOptions): Promise<string> {
    try {
      const response = await this.natsConnection.request('markitdown.convert', 
        JSON.stringify({
          content: htmlContent,
          options: {
            preserveImages: options.preserveImages,
            cleanupLevel: options.cleanupLevel || 'basic',
            includeMetadata: options.includeMetadata
          }
        }),
        { timeout: 30000 } // 30 second timeout
      );
      
      const result = JSON.parse(response.data);
      return result.markdown;
    } catch (error) {
      console.error('Markdown conversion failed:', error);
      throw new Error(`Failed to convert to markdown: ${error.message}`);
    }
  }
}
```

**Acceptance Criteria**:
- [ ] Enhanced scraper integrates with embeddings worker via NATS
- [ ] Content chunking works correctly with configurable strategies
- [ ] Markitdown conversion integration functional
- [ ] Vector embeddings are generated and stored properly
- [ ] Search functionality returns relevant results
- [ ] Backfill process can handle existing content
- [ ] Performance acceptable for pages up to 1MB
- [ ] Error handling prevents system crashes
- [ ] Unit tests cover all new functionality
- [ ] Integration tests with real embeddings worker

---

### **Sprint 1.3: Unified Search Core (3 days)**

#### **Work Item 1.3.1: Unified Search Service Implementation**
**Agent**: @agent-fullstack-feature-developer  
**Effort**: 2 days  
**Priority**: Critical  

**Description**: Implement the core unified search service that aggregates and ranks results from all content sources (Memory, Kanban, Wiki, Scraper).

**Files to Create/Modify**:
- `core/src/services/unified-search/UnifiedSearchService.ts` (NEW)
- `core/src/services/unified-search/ResultMerger.ts` (NEW)
- `core/src/services/unified-search/SearchAnalytics.ts` (NEW)
- `core/src/services/unified-search/QueryProcessor.ts` (NEW)
- `core/src/services/unified-search/__tests__/UnifiedSearchService.test.ts` (NEW)
- `core/src/services/unified-search/index.ts` (NEW)

**Core Service Implementation**:
```typescript
// core/src/services/unified-search/UnifiedSearchService.ts
export class UnifiedSearchService {
  constructor(
    private memoryService: MemoryService,
    private kanbanService: KanbanService,
    private wikiService: WikiService,
    private scraperService: EnhancedScraperService,
    private resultMerger: ResultMerger,
    private searchAnalytics: SearchAnalytics,
    private queryProcessor: QueryProcessor,
    private cacheService: CacheService
  ) {}

  async searchAcrossSystem(
    request: UnifiedSearchRequest,
    userId?: string
  ): Promise<UnifiedSearchResults> {
    const startTime = Date.now();
    
    try {
      // 1. Process and validate query
      const processedQuery = await this.queryProcessor.process(request.query);
      
      // 2. Check cache first
      const cacheKey = this.generateCacheKey(request);
      const cachedResult = await this.cacheService.get(cacheKey);
      if (cachedResult) {
        return cachedResult;
      }

      // 3. Execute searches in parallel
      const searchPromises = this.buildSearchPromises(request, processedQuery);
      const searchResults = await Promise.allSettled(searchPromises);

      // 4. Extract successful results
      const successfulResults = this.extractSuccessfulResults(searchResults);

      // 5. Merge and rank all results
      const mergedResults = await this.resultMerger.mergeAndRank(
        successfulResults,
        request.query,
        request.similarityThreshold || 0.7
      );

      // 6. Apply post-processing filters
      const filteredResults = this.applyFilters(mergedResults, request.filters);

      // 7. Generate facets and suggestions
      const facets = this.generateFacets(filteredResults);
      const suggestions = await this.generateSuggestions(request.query, filteredResults);

      // 8. Build final response
      const response: UnifiedSearchResults = {
        query: request.query,
        total: filteredResults.length,
        processingTimeMs: Date.now() - startTime,
        results: filteredResults.slice(0, request.limit || 20),
        facets,
        suggestions
      };

      // 9. Cache results
      await this.cacheService.set(cacheKey, response, 300); // 5 minute cache

      // 10. Track analytics
      await this.searchAnalytics.recordSearch(request, response, userId);

      return response;
    } catch (error) {
      console.error('Unified search failed:', error);
      throw error;
    }
  }

  private buildSearchPromises(
    request: UnifiedSearchRequest,
    processedQuery: ProcessedQuery
  ): Promise<SearchSourceResult>[] {
    const promises: Promise<SearchSourceResult>[] = [];
    const sources = request.sources || ['memory', 'kanban', 'wiki', 'scraped'];

    if (sources.includes('memory')) {
      promises.push(
        this.searchMemories(processedQuery, request).catch(error => ({
          source: 'memory',
          results: [],
          error: error.message
        }))
      );
    }

    if (sources.includes('kanban')) {
      promises.push(
        this.searchKanban(processedQuery, request).catch(error => ({
          source: 'kanban',
          results: [],
          error: error.message
        }))
      );
    }

    if (sources.includes('wiki')) {
      promises.push(
        this.searchWiki(processedQuery, request).catch(error => ({
          source: 'wiki',
          results: [],
          error: error.message
        }))
      );
    }

    if (sources.includes('scraped')) {
      promises.push(
        this.searchScraped(processedQuery, request).catch(error => ({
          source: 'scraped',
          results: [],
          error: error.message
        }))
      );
    }

    return promises;
  }

  private async searchMemories(
    query: ProcessedQuery,
    request: UnifiedSearchRequest
  ): Promise<SearchSourceResult> {
    const results = await this.memoryService.searchMemories({
      query: query.text,
      limit: request.limit || 20,
      similarityThreshold: request.similarityThreshold || 0.7
    });

    return {
      source: 'memory',
      results: results.memories.map(memory => ({
        id: memory.id,
        type: 'memory',
        title: this.extractTitleFromContent(memory.content),
        content: memory.content,
        snippet: this.generateSnippet(memory.content, query.text),
        similarity: memory.similarity || 0,
        metadata: {
          createdAt: memory.createdAt,
          concepts: memory.concepts?.map(c => c.name) || [],
          importance: memory.importance
        },
        highlights: this.generateHighlights(memory.content, query.text)
      }))
    };
  }

  private async searchKanban(
    query: ProcessedQuery,
    request: UnifiedSearchRequest
  ): Promise<SearchSourceResult> {
    const results = await this.kanbanService.searchCards({
      query: query.text,
      limit: request.limit || 20
    });

    return {
      source: 'kanban',
      results: results.map(card => ({
        id: card.id,
        type: 'kanban_card',
        title: card.title,
        content: card.description || '',
        snippet: this.generateSnippet(card.description || card.title, query.text),
        similarity: card.similarity || 0,
        metadata: {
          boardName: card.boardName,
          columnName: card.columnName,
          assignees: card.assignees,
          labels: card.labels,
          dueDate: card.dueDate
        },
        url: `/kanban/boards/${card.boardId}/cards/${card.id}`,
        highlights: this.generateHighlights(card.title + ' ' + (card.description || ''), query.text)
      }))
    };
  }

  private async searchWiki(
    query: ProcessedQuery,
    request: UnifiedSearchRequest
  ): Promise<SearchSourceResult> {
    const results = await this.wikiService.searchPages({
      query: query.text,
      limit: request.limit || 20
    });

    return {
      source: 'wiki',
      results: results.map(page => ({
        id: page.id,
        type: 'wiki_page',
        title: page.title,
        content: page.content,
        snippet: this.generateSnippet(page.content, query.text),
        similarity: page.similarity || 0,
        metadata: {
          category: page.category,
          tags: page.tags,
          lastModified: page.lastModified,
          author: page.author
        },
        url: `/wiki/pages/${page.id}`,
        highlights: this.generateHighlights(page.title + ' ' + page.content, query.text)
      }))
    };
  }

  private async searchScraped(
    query: ProcessedQuery,
    request: UnifiedSearchRequest
  ): Promise<SearchSourceResult> {
    const results = await this.scraperService.searchScrapedContent(query.text, {
      limit: request.limit || 20,
      similarityThreshold: request.similarityThreshold || 0.7,
      filters: request.filters
    });

    return {
      source: 'scraped',
      results: results.results.map(result => ({
        id: result.id,
        type: 'scraped_page',
        title: result.title,
        content: result.content,
        snippet: this.generateSnippet(result.content, query.text),
        similarity: result.similarity,
        metadata: {
          domain: result.domain,
          scrapedAt: result.scrapedAt,
          url: result.url
        },
        url: result.url,
        highlights: this.generateHighlights(result.content, query.text)
      }))
    };
  }
}
```

**Result Merger Implementation**:
```typescript
// core/src/services/unified-search/ResultMerger.ts
export class ResultMerger {
  async mergeAndRank(
    sourceResults: SearchSourceResult[],
    originalQuery: string,
    similarityThreshold: number
  ): Promise<SearchResult[]> {
    // 1. Flatten all results
    const allResults: SearchResult[] = [];
    for (const sourceResult of sourceResults) {
      allResults.push(...sourceResult.results);
    }

    // 2. Remove duplicates based on content similarity
    const dedupedResults = await this.deduplicateResults(allResults);

    // 3. Filter by similarity threshold
    const filteredResults = dedupedResults.filter(
      result => result.similarity >= similarityThreshold
    );

    // 4. Apply advanced ranking algorithm
    const rankedResults = this.rankResults(filteredResults, originalQuery);

    return rankedResults;
  }

  private async deduplicateResults(results: SearchResult[]): Promise<SearchResult[]> {
    // Advanced deduplication logic
    // - Compare content hashes
    // - Check URL similarity for scraped content
    // - Merge results that are clearly duplicates
    
    const deduped: SearchResult[] = [];
    const seenHashes = new Set<string>();

    for (const result of results) {
      const contentHash = this.generateContentHash(result.content);
      if (!seenHashes.has(contentHash)) {
        seenHashes.add(contentHash);
        deduped.push(result);
      }
    }

    return deduped;
  }

  private rankResults(results: SearchResult[], query: string): SearchResult[] {
    // Advanced ranking algorithm considering:
    // - Semantic similarity score
    // - Content freshness
    // - Source reliability/importance
    // - User interaction history
    // - Query intent matching

    return results.sort((a, b) => {
      const scoreA = this.calculateRankingScore(a, query);
      const scoreB = this.calculateRankingScore(b, query);
      return scoreB - scoreA; // Descending order
    });
  }

  private calculateRankingScore(result: SearchResult, query: string): number {
    let score = result.similarity * 100; // Base similarity score

    // Boost recent content
    if (result.metadata.createdAt) {
      const daysSinceCreated = this.getDaysSince(result.metadata.createdAt);
      score += Math.max(0, 10 - daysSinceCreated); // Up to 10 point boost for recent content
    }

    // Boost based on content type preferences
    const typeBoosts = {
      'wiki_page': 5,      // Documentation is important
      'memory': 4,         // Personal knowledge is valuable
      'kanban_card': 3,    // Active work items are relevant
      'scraped_page': 2    // External content gets lower boost
    };
    score += typeBoosts[result.type] || 0;

    // Title match boost
    if (this.titleContainsQuery(result.title, query)) {
      score += 15;
    }

    return score;
  }
}
```

**Acceptance Criteria**:
- [ ] Service successfully aggregates results from all sources
- [ ] Results are properly merged and ranked by relevance
- [ ] Duplicate detection and removal works correctly
- [ ] Performance is acceptable with < 2 second response time
- [ ] Caching reduces repeated query processing time
- [ ] Analytics tracking captures all search activities
- [ ] Error handling prevents single source failures from breaking entire search
- [ ] Unit tests cover all ranking and merging logic
- [ ] Integration tests verify end-to-end functionality

---

#### **Work Item 1.3.2: API Gateway Search Routes**
**Agent**: @agent-nodejs-backend-engineer  
**Effort**: 1 day  
**Priority**: High  

**Description**: Implement REST API endpoints for the unified search service with proper validation, error handling, and OpenAPI documentation.

**Files to Create/Modify**:
- `gateway/src/routes/search.routes.ts` (NEW)
- `gateway/src/middleware/search-validation.ts` (NEW)
- `gateway/src/index.ts` (EXTEND - add search routes)
- `gateway/src/openapi.yaml` (EXTEND - add search endpoints)
- `gateway/docs/openapi.yaml` (EXTEND - add search endpoints)

**Search Routes Implementation**:
```typescript
// gateway/src/routes/search.routes.ts
import { Router } from 'express';
import { UnifiedSearchService } from '@mcp-tools/core';
import { validateSearchRequest } from '../middleware/search-validation.js';
import { requireAuth } from '../middleware/auth.js';
import { rateLimiter } from '../middleware/rate-limiter.js';

const router = Router();

// POST /api/search/unified - Main unified search endpoint
router.post('/unified', 
  requireAuth,
  rateLimiter({ windowMs: 60000, max: 60 }), // 60 requests per minute
  validateSearchRequest,
  async (req, res) => {
    try {
      const searchRequest: UnifiedSearchRequest = {
        query: req.body.query,
        sources: req.body.sources,
        limit: Math.min(req.body.limit || 20, 100), // Cap at 100 results
        similarityThreshold: req.body.similarityThreshold || 0.7,
        includeMetadata: req.body.includeMetadata !== false,
        filters: req.body.filters || {}
      };

      const results = await req.app.locals.unifiedSearchService.searchAcrossSystem(
        searchRequest,
        req.user?.id
      );

      res.json({
        success: true,
        data: results,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Search API error:', error);
      res.status(500).json({
        success: false,
        error: 'Search failed',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
);

// GET /api/search/suggestions - Search suggestions/autocomplete
router.get('/suggestions',
  requireAuth,
  rateLimiter({ windowMs: 60000, max: 120 }), // 120 requests per minute
  async (req, res) => {
    try {
      const query = req.query.q as string;
      if (!query || query.length < 2) {
        return res.json({ success: true, data: { suggestions: [] } });
      }

      const suggestions = await req.app.locals.unifiedSearchService.getSuggestions(
        query,
        req.user?.id
      );

      res.json({
        success: true,
        data: { suggestions },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Search suggestions error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get suggestions',
        timestamp: new Date().toISOString()
      });
    }
  }
);

// GET /api/search/analytics - Search analytics for dashboard
router.get('/analytics',
  requireAuth,
  async (req, res) => {
    try {
      const analytics = await req.app.locals.searchAnalyticsService.getAnalytics(
        req.user?.id,
        {
          timeRange: req.query.timeRange as string || '7d',
          includePopularQueries: true,
          includePerformanceMetrics: true
        }
      );

      res.json({
        success: true,
        data: analytics,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Search analytics error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get search analytics',
        timestamp: new Date().toISOString()
      });
    }
  }
);

export default router;
```

**Request Validation Middleware**:
```typescript
// gateway/src/middleware/search-validation.ts
import { body, validationResult } from 'express-validator';
import { Request, Response, NextFunction } from 'express';

export const validateSearchRequest = [
  body('query')
    .isString()
    .trim()
    .isLength({ min: 1, max: 500 })
    .withMessage('Query must be between 1 and 500 characters'),
  
  body('sources')
    .optional()
    .isArray()
    .withMessage('Sources must be an array')
    .custom((sources) => {
      const validSources = ['memory', 'kanban', 'wiki', 'scraped', 'code'];
      return sources.every((source: string) => validSources.includes(source));
    })
    .withMessage('Invalid source specified'),
  
  body('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  
  body('similarityThreshold')
    .optional()
    .isFloat({ min: 0, max: 1 })
    .withMessage('Similarity threshold must be between 0 and 1'),
  
  (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array(),
        timestamp: new Date().toISOString()
      });
    }
    next();
  }
];
```

**OpenAPI Documentation Extension**:
```yaml
# gateway/src/openapi.yaml (additions)
paths:
  /api/search/unified:
    post:
      summary: Unified search across all content types
      description: Performs semantic similarity search across Memory, Kanban, Wiki, and Scraped content
      tags:
        - Search
      security:
        - bearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required:
                - query
              properties:
                query:
                  type: string
                  description: Search query text
                  example: "machine learning algorithms"
                  minLength: 1
                  maxLength: 500
                sources:
                  type: array
                  description: Content sources to search (default: all)
                  items:
                    type: string
                    enum: [memory, kanban, wiki, scraped, code]
                  example: ["memory", "wiki", "scraped"]
                limit:
                  type: integer
                  description: Maximum number of results
                  minimum: 1
                  maximum: 100
                  default: 20
                similarityThreshold:
                  type: number
                  description: Minimum similarity score for results
                  minimum: 0
                  maximum: 1
                  default: 0.7
                includeMetadata:
                  type: boolean
                  description: Include detailed metadata in results
                  default: true
                filters:
                  type: object
                  description: Additional search filters
                  properties:
                    dateRange:
                      type: object
                      properties:
                        start:
                          type: string
                          format: date-time
                        end:
                          type: string
                          format: date-time
                    domains:
                      type: array
                      description: Filter scraped content by domain
                      items:
                        type: string
      responses:
        200:
          description: Search results successfully retrieved
          content:
            application/json:
              schema:
                type: object
                properties:
                  success:
                    type: boolean
                    example: true
                  data:
                    $ref: '#/components/schemas/UnifiedSearchResults'
                  timestamp:
                    type: string
                    format: date-time
        400:
          description: Invalid request parameters
        401:
          description: Authentication required
        429:
          description: Rate limit exceeded
        500:
          description: Internal server error

components:
  schemas:
    UnifiedSearchResults:
      type: object
      properties:
        query:
          type: string
          description: Original search query
        total:
          type: integer
          description: Total number of results found
        processingTimeMs:
          type: integer
          description: Time taken to process search
        results:
          type: array
          items:
            $ref: '#/components/schemas/SearchResult'
        facets:
          $ref: '#/components/schemas/SearchFacets'
        suggestions:
          type: array
          items:
            type: string
    
    SearchResult:
      type: object
      properties:
        id:
          type: string
          description: Unique identifier for the result
        type:
          type: string
          enum: [memory, kanban_card, wiki_page, scraped_page, code_function, code_class, code_file]
        title:
          type: string
          description: Result title or name
        content:
          type: string
          description: Result content
        snippet:
          type: string
          description: Highlighted snippet from content
        similarity:
          type: number
          description: Similarity score (0-1)
        metadata:
          type: object
          description: Additional metadata specific to result type
        url:
          type: string
          description: URL to access the result (if applicable)
        highlights:
          type: array
          items:
            $ref: '#/components/schemas/TextHighlight'
    
    SearchFacets:
      type: object
      properties:
        memory:
          type: integer
        kanban:
          type: integer
        wiki:
          type: integer
        scraped:
          type: integer
        code:
          type: integer
    
    TextHighlight:
      type: object
      properties:
        start:
          type: integer
        end:
          type: integer
        text:
          type: string
```

**Acceptance Criteria**:
- [ ] POST /api/search/unified endpoint works correctly
- [ ] Request validation prevents invalid queries
- [ ] Rate limiting protects against abuse
- [ ] Authentication is properly enforced
- [ ] OpenAPI documentation is complete and accurate
- [ ] Error responses are consistent and informative
- [ ] Performance logging captures response times
- [ ] Integration tests cover all endpoints
- [ ] Suggestions endpoint provides useful autocomplete

---

### **Sprint 1.4: Frontend Components (2 days)**

#### **Work Item 1.4.1: Core Search React Components**
**Agent**: @agent-fullstack-feature-developer  
**Effort**: 1.5 days  
**Priority**: High  

**Description**: Create comprehensive React components for the unified search interface with modern UX patterns and accessibility features.

**Files to Create/Modify**:
- `web/src/components/search/UniversalSearchBar.tsx` (NEW)
- `web/src/components/search/SearchResultsList.tsx` (NEW)
- `web/src/components/search/SearchResult.tsx` (NEW)
- `web/src/components/search/SearchFilters.tsx` (NEW)
- `web/src/components/search/SearchHighlights.tsx` (NEW)
- `web/src/components/search/SearchSuggestions.tsx` (NEW)
- `web/src/components/search/SearchStats.tsx` (NEW)
- `web/src/components/search/index.ts` (NEW)
- `web/src/hooks/useUnifiedSearch.ts` (NEW)
- `web/src/hooks/useSearchSuggestions.ts` (NEW)
- `web/src/types/search.ts` (NEW)

**Universal Search Bar Component**:
```tsx
// web/src/components/search/UniversalSearchBar.tsx
import React, { useState, useRef, useEffect } from 'react';
import { Search, X, Filter, Clock } from 'lucide-react';
import { SearchSuggestions } from './SearchSuggestions';
import { SearchFilters } from './SearchFilters';
import { useSearchSuggestions } from '../../hooks/useSearchSuggestions';
import { cn } from '../../lib/utils';

interface UniversalSearchBarProps {
  onSearch: (query: string, filters?: SearchFilters) => void;
  placeholder?: string;
  className?: string;
  showFilters?: boolean;
  recentSearches?: string[];
  isLoading?: boolean;
}

export function UniversalSearchBar({
  onSearch,
  placeholder = "Search across all your content...",
  className,
  showFilters = true,
  recentSearches = [],
  isLoading = false
}: UniversalSearchBarProps) {
  const [query, setQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [filters, setFilters] = useState<SearchFilters>({});
  
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const {
    suggestions,
    isLoadingSuggestions,
    getSuggestions
  } = useSearchSuggestions();

  // Handle input changes with debounced suggestions
  useEffect(() => {
    if (query.length >= 2) {
      const timeoutId = setTimeout(() => {
        getSuggestions(query);
        setShowSuggestions(true);
      }, 300);
      return () => clearTimeout(timeoutId);
    } else {
      setShowSuggestions(false);
    }
  }, [query, getSuggestions]);

  // Handle click outside to close suggestions
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
        setShowFilterPanel(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      onSearch(query.trim(), filters);
      setShowSuggestions(false);
    }
  };

  const handleSuggestionSelect = (suggestion: string) => {
    setQuery(suggestion);
    onSearch(suggestion, filters);
    setShowSuggestions(false);
    inputRef.current?.blur();
  };

  const handleClearQuery = () => {
    setQuery('');
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setShowSuggestions(false);
      setShowFilterPanel(false);
    }
  };

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  return (
    <div ref={containerRef} className={cn("relative w-full", className)}>
      {/* Main Search Bar */}
      <form onSubmit={handleSubmit} className="relative">
        <div className="relative flex items-center">
          {/* Search Icon */}
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          
          {/* Input Field */}
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => query.length >= 2 && setShowSuggestions(true)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className={cn(
              "w-full pl-10 pr-20 py-3 text-sm border border-gray-200 rounded-lg",
              "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent",
              "placeholder:text-gray-500",
              isLoading && "bg-gray-50"
            )}
            disabled={isLoading}
          />
          
          {/* Action Buttons */}
          <div className="absolute right-2 flex items-center space-x-1">
            {/* Clear Button */}
            {query && (
              <button
                type="button"
                onClick={handleClearQuery}
                className="p-1 hover:bg-gray-100 rounded"
                aria-label="Clear search"
              >
                <X className="w-4 h-4 text-gray-400" />
              </button>
            )}
            
            {/* Filter Button */}
            {showFilters && (
              <button
                type="button"
                onClick={() => setShowFilterPanel(!showFilterPanel)}
                className={cn(
                  "p-2 hover:bg-gray-100 rounded relative",
                  showFilterPanel && "bg-gray-100",
                  activeFilterCount > 0 && "text-blue-600"
                )}
                aria-label="Search filters"
              >
                <Filter className="w-4 h-4" />
                {activeFilterCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-blue-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                    {activeFilterCount}
                  </span>
                )}
              </button>
            )}
            
            {/* Loading Indicator */}
            {isLoading && (
              <div className="animate-spin w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full" />
            )}
          </div>
        </div>
      </form>

      {/* Search Suggestions Dropdown */}
      {showSuggestions && (
        <SearchSuggestions
          suggestions={suggestions}
          recentSearches={recentSearches}
          query={query}
          onSelect={handleSuggestionSelect}
          isLoading={isLoadingSuggestions}
        />
      )}

      {/* Filter Panel */}
      {showFilterPanel && (
        <SearchFilters
          filters={filters}
          onFiltersChange={setFilters}
          onApply={() => {
            setShowFilterPanel(false);
            if (query.trim()) {
              onSearch(query.trim(), filters);
            }
          }}
        />
      )}
    </div>
  );
}
```

**Search Results List Component**:
```tsx
// web/src/components/search/SearchResultsList.tsx
import React from 'react';
import { SearchResult } from './SearchResult';
import { SearchStats } from './SearchStats';
import { Loader2 } from 'lucide-react';
import { UnifiedSearchResults, SearchResult as SearchResultType } from '../../types/search';

interface SearchResultsListProps {
  results?: UnifiedSearchResults;
  isLoading: boolean;
  error?: string;
  query: string;
  onResultClick?: (result: SearchResultType) => void;
}

export function SearchResultsList({
  results,
  isLoading,
  error,
  query,
  onResultClick
}: SearchResultsListProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        <span className="ml-3 text-gray-600">Searching...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <div className="text-red-600 mb-2">Search failed</div>
        <div className="text-gray-600 text-sm">{error}</div>
      </div>
    );
  }

  if (!results || results.results.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-600 mb-2">No results found</div>
        <div className="text-gray-500 text-sm">
          Try different keywords or check your filters
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Search Statistics */}
      <SearchStats
        results={results}
        query={query}
      />

      {/* Results List */}
      <div className="space-y-4">
        {results.results.map((result, index) => (
          <SearchResult
            key={`${result.type}-${result.id}-${index}`}
            result={result}
            query={query}
            onClick={onResultClick}
          />
        ))}
      </div>

      {/* Load More */}
      {results.total > results.results.length && (
        <div className="text-center py-4">
          <button className="text-blue-600 hover:text-blue-800 text-sm font-medium">
            Load {Math.min(20, results.total - results.results.length)} more results
          </button>
        </div>
      )}
    </div>
  );
}
```

**Individual Search Result Component**:
```tsx
// web/src/components/search/SearchResult.tsx
import React from 'react';
import { FileText, Kanban, Brain, Globe, Code, Calendar, Clock } from 'lucide-react';
import { SearchHighlights } from './SearchHighlights';
import { SearchResult as SearchResultType } from '../../types/search';
import { cn } from '../../lib/utils';

interface SearchResultProps {
  result: SearchResultType;
  query: string;
  onClick?: (result: SearchResultType) => void;
}

const resultTypeConfig = {
  memory: {
    icon: Brain,
    color: 'text-purple-600 bg-purple-50',
    label: 'Memory'
  },
  kanban_card: {
    icon: Kanban,
    color: 'text-blue-600 bg-blue-50',
    label: 'Kanban'
  },
  wiki_page: {
    icon: FileText,
    color: 'text-green-600 bg-green-50',
    label: 'Wiki'
  },
  scraped_page: {
    icon: Globe,
    color: 'text-orange-600 bg-orange-50',
    label: 'Web'
  },
  code_function: {
    icon: Code,
    color: 'text-gray-600 bg-gray-50',
    label: 'Code'
  },
  code_class: {
    icon: Code,
    color: 'text-gray-600 bg-gray-50',
    label: 'Code'
  },
  code_file: {
    icon: Code,
    color: 'text-gray-600 bg-gray-50',
    label: 'Code'
  }
};

export function SearchResult({ result, query, onClick }: SearchResultProps) {
  const config = resultTypeConfig[result.type] || resultTypeConfig.memory;
  const IconComponent = config.icon;

  const handleClick = () => {
    if (onClick) {
      onClick(result);
    } else if (result.url) {
      // Default behavior: navigate to result
      if (result.url.startsWith('http')) {
        window.open(result.url, '_blank');
      } else {
        window.location.href = result.url;
      }
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return null;
    const date = new Date(dateString);
    return new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(
      Math.ceil((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
      'day'
    );
  };

  return (
    <div
      className={cn(
        "p-4 border border-gray-200 rounded-lg hover:shadow-md transition-shadow cursor-pointer",
        "hover:border-gray-300"
      )}
      onClick={handleClick}
    >
      <div className="flex items-start space-x-3">
        {/* Result Type Icon */}
        <div className={cn("p-2 rounded-lg flex-shrink-0", config.color)}>
          <IconComponent className="w-4 h-4" />
        </div>

        {/* Result Content */}
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-2">
              <span className={cn("text-xs font-medium px-2 py-1 rounded", config.color)}>
                {config.label}
              </span>
              <span className="text-xs text-gray-500">
                {Math.round(result.similarity * 100)}% match
              </span>
            </div>
            {result.metadata.createdAt && (
              <div className="flex items-center text-xs text-gray-500">
                <Clock className="w-3 h-3 mr-1" />
                {formatDate(result.metadata.createdAt)}
              </div>
            )}
          </div>

          {/* Title */}
          <h3 className="text-lg font-semibold text-gray-900 mb-2 line-clamp-2">
            <SearchHighlights text={result.title} query={query} />
          </h3>

          {/* Snippet */}
          <p className="text-gray-700 text-sm mb-3 line-clamp-3">
            <SearchHighlights text={result.snippet} query={query} />
          </p>

          {/* Metadata */}
          <div className="flex items-center justify-between text-xs text-gray-500">
            <div className="flex items-center space-x-4">
              {/* Source-specific metadata */}
              {result.type === 'scraped_page' && result.metadata.domain && (
                <span className="flex items-center">
                  <Globe className="w-3 h-3 mr-1" />
                  {result.metadata.domain}
                </span>
              )}
              
              {result.type === 'kanban_card' && result.metadata.boardName && (
                <span>{result.metadata.boardName}</span>
              )}
              
              {result.type === 'wiki_page' && result.metadata.category && (
                <span>{result.metadata.category}</span>
              )}
              
              {result.metadata.tags && result.metadata.tags.length > 0 && (
                <div className="flex items-center space-x-1">
                  {result.metadata.tags.slice(0, 3).map((tag: string) => (
                    <span key={tag} className="bg-gray-100 px-2 py-0.5 rounded text-xs">
                      {tag}
                    </span>
                  ))}
                  {result.metadata.tags.length > 3 && (
                    <span>+{result.metadata.tags.length - 3} more</span>
                  )}
                </div>
              )}
            </div>

            {/* URL for scraped content */}
            {result.url && result.url.startsWith('http') && (
              <span className="text-blue-600 hover:underline truncate max-w-xs">
                {result.url.replace(/^https?:\/\//, '')}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
```

**Search Hooks**:
```tsx
// web/src/hooks/useUnifiedSearch.ts
import { useState, useCallback } from 'react';
import { useApi } from './useApi';
import { UnifiedSearchRequest, UnifiedSearchResults } from '../types/search';

export function useUnifiedSearch() {
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<UnifiedSearchResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { apiClient } = useApi();

  const search = useCallback(async (request: UnifiedSearchRequest) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await apiClient.post('/api/search/unified', request);
      
      if (response.data.success) {
        setResults(response.data.data);
      } else {
        setError(response.data.error || 'Search failed');
      }
    } catch (err: any) {
      console.error('Search error:', err);
      setError(err.response?.data?.error || 'Search failed');
    } finally {
      setIsLoading(false);
    }
  }, [apiClient]);

  const clearResults = useCallback(() => {
    setResults(null);
    setError(null);
  }, []);

  return {
    search,
    clearResults,
    isLoading,
    results,
    error
  };
}
```

**Acceptance Criteria**:
- [ ] Search bar provides intuitive typing experience with suggestions
- [ ] Results display clearly with proper type indicators and metadata
- [ ] Text highlighting shows search term matches
- [ ] Filter panel allows refinement by content type and date
- [ ] Performance is smooth with debounced search suggestions
- [ ] Accessibility features work with screen readers
- [ ] Mobile-responsive design works on all screen sizes
- [ ] Error states are handled gracefully
- [ ] Loading states provide clear feedback
- [ ] Components are reusable and well-documented

---

#### **Work Item 1.4.2: Search Page Integration & Navigation**
**Agent**: @agent-fullstack-feature-developer  
**Effort**: 0.5 days  
**Priority**: High  

**Description**: Create dedicated search page and integrate search functionality into existing application navigation and dashboard.

**Files to Create/Modify**:
- `web/src/app/search/page.tsx` (NEW)
- `web/src/app/search/layout.tsx` (NEW)
- `web/src/app/dashboard/page.tsx` (EXTEND)
- `web/src/components/layout/Header.tsx` (EXTEND)
- `web/src/components/layout/Sidebar.tsx` (EXTEND)

**Search Page Implementation**:
```tsx
// web/src/app/search/page.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { UniversalSearchBar } from '../../components/search/UniversalSearchBar';
import { SearchResultsList } from '../../components/search/SearchResultsList';
import { useUnifiedSearch } from '../../hooks/useUnifiedSearch';
import { SearchFilters } from '../../types/search';
import { PageWrapper } from '../../components/PageWrapper';

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [appliedFilters, setAppliedFilters] = useState<SearchFilters>({});
  const { search, isLoading, results, error, clearResults } = useUnifiedSearch();

  // Handle URL search params for deep linking
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const urlQuery = urlParams.get('q');
    if (urlQuery) {
      setQuery(urlQuery);
      handleSearch(urlQuery);
    }
  }, []);

  const handleSearch = async (searchQuery: string, filters?: SearchFilters) => {
    if (!searchQuery.trim()) {
      clearResults();
      return;
    }

    setQuery(searchQuery);
    setAppliedFilters(filters || {});

    // Update URL for sharing/bookmarking
    const url = new URL(window.location.href);
    url.searchParams.set('q', searchQuery);
    window.history.replaceState({}, '', url.toString());

    await search({
      query: searchQuery,
      sources: filters?.sources,
      limit: 20,
      similarityThreshold: filters?.similarityThreshold || 0.7,
      filters: filters
    });
  };

  return (
    <PageWrapper>
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Page Header */}
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Search Everything
          </h1>
          <p className="text-gray-600">
            Find information across your memories, projects, wiki, and web content
          </p>
        </div>

        {/* Search Interface */}
        <div className="mb-8">
          <UniversalSearchBar
            onSearch={handleSearch}
            placeholder="Search across all your content..."
            showFilters={true}
            isLoading={isLoading}
          />
        </div>

        {/* Search Results */}
        <SearchResultsList
          results={results}
          isLoading={isLoading}
          error={error}
          query={query}
        />
      </div>
    </PageWrapper>
  );
}
```

**Dashboard Integration**:
```tsx
// web/src/app/dashboard/page.tsx (additions)
import { UniversalSearchBar } from '../../components/search/UniversalSearchBar';

// Add to existing dashboard component
<div className="mb-8">
  <div className="max-w-2xl mx-auto">
    <UniversalSearchBar
      onSearch={(query, filters) => {
        // Navigate to search page with query
        const searchParams = new URLSearchParams({ q: query });
        window.location.href = `/search?${searchParams.toString()}`;
      }}
      placeholder="Quick search across all content..."
      showFilters={false}
    />
  </div>
</div>
```

**Navigation Updates**:
```tsx
// web/src/components/layout/Header.tsx (additions)
import { Search } from 'lucide-react';

// Add to navigation items
<Link
  href="/search"
  className="flex items-center space-x-2 px-3 py-2 rounded-md text-gray-700 hover:text-gray-900 hover:bg-gray-100"
>
  <Search className="w-5 h-5" />
  <span>Search</span>
</Link>
```

**Acceptance Criteria**:
- [ ] Dedicated search page is fully functional
- [ ] Search functionality integrated into dashboard
- [ ] Navigation includes search page link
- [ ] URL parameters support deep linking to search results
- [ ] Mobile-responsive design works across all screen sizes
- [ ] Page transitions are smooth
- [ ] SEO metadata is properly configured

---

This completes Phase 1 of the roadmap. The implementation provides a solid foundation for unified search across all content types with professional UI components and comprehensive backend services. Each work item includes detailed acceptance criteria and specific file references to guide the implementation agents.

Would you like me to continue with Phase 2 (Codebase Analysis) and Phase 3 (Advanced Features) in the roadmap?