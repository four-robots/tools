/**
 * Enhanced Scraper Service Tests
 * 
 * Comprehensive tests for the enhanced scraper service including
 * vector processing, content chunking, and markdown conversion.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EnhancedScraperService } from '../EnhancedScraperService.js';
import { ScraperDatabaseManager } from '../database.js';
import { ScrapingEngine } from '../engine.js';
import { ContentChunkingService } from '../../chunking/ContentChunkingService.js';
import type { EnhancedScraperConfig, VectorScrapingOptions } from '../types.js';

// Mock dependencies
vi.mock('../database.js');
vi.mock('../engine.js');
vi.mock('../../chunking/ContentChunkingService.js');
vi.mock('../VectorScrapingEngine.js');
vi.mock('../MarkdownProcessor.js');
vi.mock('../../memory/vectorEngine.js');

describe('EnhancedScraperService', () => {
  let service: EnhancedScraperService;
  let mockDatabase: vi.Mocked<ScraperDatabaseManager>;
  let mockEngine: vi.Mocked<ScrapingEngine>;
  let mockChunkingService: vi.Mocked<ContentChunkingService>;
  let config: EnhancedScraperConfig;

  beforeEach(() => {
    // Setup mocks
    mockDatabase = {
      updatePageWithVectorInfo: vi.fn(),
      createContentChunks: vi.fn(),
      getContentChunks: vi.fn().mockResolvedValue([]),
      getPagesForVectorProcessing: vi.fn().mockResolvedValue([]),
      getVectorStats: vi.fn().mockResolvedValue({
        totalPages: 10,
        pagesWithEmbeddings: 5,
        pagesWithChunks: 5,
        totalChunks: 25,
        averageChunksPerPage: 2.5
      }),
      searchContentChunks: vi.fn().mockResolvedValue([]),
      getPage: vi.fn()
    } as any;

    mockEngine = {
      scrapeUrl: vi.fn()
    } as any;

    mockChunkingService = {
      chunkContent: vi.fn().mockResolvedValue([
        {
          id: 'chunk-1',
          content: 'Test chunk content',
          start_position: 0,
          end_position: 18,
          chunk_index: 0,
          metadata: { word_count: 3, quality_score: 0.8 }
        }
      ])
    } as any;

    config = {
      natsUrl: 'nats://localhost:4222',
      vectorSize: 1536,
      defaultEmbeddingModel: 'text-embedding-3-small',
      requestTimeout: 30000,
      batchSize: 32
    };

    // Create service instance
    service = new EnhancedScraperService(
      mockDatabase,
      mockEngine,
      mockChunkingService,
      config
    );

    // Mock parent class methods
    vi.spyOn(service as any, 'scrapeUrl').mockResolvedValue({
      id: 'page-1',
      url: 'https://example.com',
      title: 'Test Page',
      content: '<p>Test content</p>',
      contentHash: 'hash123',
      metadata: {},
      scrapedAt: '2024-01-01T00:00:00Z',
      status: 'success'
    });

    vi.spyOn(service as any, 'getDetailedStats').mockResolvedValue({
      totalPages: 10,
      totalJobs: 5,
      averageProcessingTime: 1500
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize all enhanced components', async () => {
      // Mock the internal components
      const vectorEngine = {
        initialize: vi.fn().mockResolvedValue(undefined),
        isReady: vi.fn().mockReturnValue(true),
        close: vi.fn()
      };
      
      const markdownProcessor = {
        initialize: vi.fn().mockResolvedValue(undefined),
        isReady: vi.fn().mockReturnValue(true),
        close: vi.fn()
      };

      const vectorStore = {
        initialize: vi.fn().mockResolvedValue(undefined),
        close: vi.fn()
      };

      (service as any).vectorEngine = vectorEngine;
      (service as any).markdownProcessor = markdownProcessor;
      (service as any).vectorStore = vectorStore;

      await service.initialize();

      expect(vectorEngine.initialize).toHaveBeenCalled();
      expect(markdownProcessor.initialize).toHaveBeenCalled();
      expect(vectorStore.initialize).toHaveBeenCalled();
    });

    it('should handle initialization failures gracefully', async () => {
      const vectorEngine = {
        initialize: vi.fn().mockRejectedValue(new Error('NATS connection failed')),
        isReady: vi.fn().mockReturnValue(false),
        close: vi.fn()
      };

      (service as any).vectorEngine = vectorEngine;
      (service as any).markdownProcessor = { initialize: vi.fn(), close: vi.fn() };
      (service as any).vectorStore = { initialize: vi.fn(), close: vi.fn() };

      // Should not throw, just log warnings
      await expect(service.initialize()).resolves.toBeUndefined();
    });
  });

  describe('scrapeUrlWithEmbeddings', () => {
    it('should scrape content with vector processing', async () => {
      const input: VectorScrapingOptions = {
        url: 'https://example.com',
        vector: {
          enabled: true,
          generateEmbeddings: true,
          convertToMarkdown: true,
          chunkingOptions: {
            strategy: 'paragraph',
            target_size: 1000
          }
        }
      };

      // Mock vector processing
      const mockProcessContentWithVector = vi.fn().mockImplementation(async (content) => {
        content.embeddingStatus = 'completed';
        content.chunkCount = 1;
        content.markdownContent = '# Test Content';
      });
      
      (service as any).processContentWithVector = mockProcessContentWithVector;

      const result = await service.scrapeUrlWithEmbeddings(input);

      expect(result).toMatchObject({
        url: 'https://example.com',
        title: 'Test Page',
        embeddingStatus: 'completed',
        chunkCount: 1
      });

      expect(mockProcessContentWithVector).toHaveBeenCalled();
    });

    it('should handle vector processing disabled', async () => {
      const input: VectorScrapingOptions = {
        url: 'https://example.com',
        vector: {
          enabled: false
        }
      };

      const result = await service.scrapeUrlWithEmbeddings(input);

      expect(result).toMatchObject({
        url: 'https://example.com',
        embeddingStatus: 'pending',
        chunkCount: 0
      });
    });

    it('should handle scraping errors', async () => {
      const input: VectorScrapingOptions = {
        url: 'https://invalid-url.com',
        vector: { enabled: true }
      };

      vi.spyOn(service as any, 'scrapeUrl').mockRejectedValue(new Error('Network error'));

      await expect(service.scrapeUrlWithEmbeddings(input)).rejects.toThrow('Network error');
    });
  });

  describe('searchScrapedContent', () => {
    beforeEach(() => {
      // Mock vector store
      const mockVectorStore = {
        findSimilar: vi.fn().mockResolvedValue([
          { memoryId: 'page-1', similarity: 0.85 }
        ])
      };
      (service as any).vectorStore = mockVectorStore;

      // Mock database responses
      mockDatabase.getPage.mockResolvedValue({
        id: 'page-1',
        url: 'https://example.com',
        title: 'Test Page',
        content: 'Test content',
        content_hash: 'hash123',
        metadata: '{}',
        scraped_at: '2024-01-01T00:00:00Z',
        status: 'success'
      });
    });

    it('should perform vector search', async () => {
      const results = await service.searchScrapedContent('test query', {
        query: 'test query',
        searchType: 'vector',
        threshold: 0.7,
        limit: 10
      });

      expect(results.results).toHaveLength(1);
      expect(results.results[0]).toMatchObject({
        content: {
          id: 'page-1',
          url: 'https://example.com'
        },
        similarity: 0.85
      });

      expect(results.metadata).toMatchObject({
        query: 'test query',
        searchType: 'vector',
        totalResults: 1
      });
    });

    it('should perform text search as fallback', async () => {
      // Mock vector search failure
      const mockVectorStore = {
        findSimilar: vi.fn().mockRejectedValue(new Error('Vector search failed'))
      };
      (service as any).vectorStore = mockVectorStore;

      mockDatabase.searchContentChunks.mockResolvedValue([
        {
          id: 'chunk-1',
          page_id: 'page-1',
          content: 'Matching content',
          metadata: '{}',
          created_at: '2024-01-01T00:00:00Z'
        }
      ]);

      const results = await service.searchScrapedContent('test query', {
        query: 'test query',
        searchType: 'vector',
        limit: 10
      });

      expect(results.results).toHaveLength(1);
      expect(mockDatabase.searchContentChunks).toHaveBeenCalled();
    });

    it('should perform hybrid search', async () => {
      mockDatabase.searchContentChunks.mockResolvedValue([
        {
          id: 'chunk-2',
          page_id: 'page-2',
          content: 'Text match content',
          metadata: '{}',
          created_at: '2024-01-01T00:00:00Z'
        }
      ]);

      mockDatabase.getPage.mockImplementation((id) => {
        if (id === 'page-1') {
          return Promise.resolve({
            id: 'page-1',
            url: 'https://example.com',
            title: 'Test Page',
            content: 'Test content',
            content_hash: 'hash123',
            metadata: '{}',
            scraped_at: '2024-01-01T00:00:00Z',
            status: 'success'
          });
        }
        return Promise.resolve({
          id: 'page-2',
          url: 'https://example2.com',
          title: 'Another Page',
          content: 'Another content',
          content_hash: 'hash456',
          metadata: '{}',
          scraped_at: '2024-01-01T00:00:00Z',
          status: 'success'
        });
      });

      const results = await service.searchScrapedContent('test query', {
        query: 'test query',
        searchType: 'hybrid',
        limit: 10
      });

      expect(results.results).toHaveLength(2);
    });

    it('should apply domain filter', async () => {
      const results = await service.searchScrapedContent('test query', {
        query: 'test query',
        domain: 'example.com',
        searchType: 'vector',
        limit: 10
      });

      expect(results.results.every(r => r.content.url.includes('example.com'))).toBe(true);
    });
  });

  describe('backfillExistingContent', () => {
    it('should process pages for backfill', async () => {
      const mockPages = [
        {
          id: 'page-1',
          url: 'https://example.com',
          content: 'Test content',
          status: 'success'
        }
      ];

      mockDatabase.getPagesForVectorProcessing.mockResolvedValue(mockPages);
      mockDatabase.getContentChunks.mockResolvedValue([]);
      
      const mockProcessContentWithVector = vi.fn();
      (service as any).processContentWithVector = mockProcessContentWithVector;
      (service as any).convertToEnhancedContent = vi.fn().mockResolvedValue({
        id: 'page-1',
        url: 'https://example.com',
        chunkCount: 2,
        embeddingStatus: 'completed'
      });

      const results = await service.backfillExistingContent({
        missingEmbeddingsOnly: true,
        batchSize: 5
      });

      expect(results.pagesProcessed).toBe(1);
      expect(results.pagesFailed).toBe(0);
      expect(results.chunksCreated).toBe(2);
      expect(mockProcessContentWithVector).toHaveBeenCalled();
    });

    it('should handle backfill failures gracefully', async () => {
      const mockPages = [
        { id: 'page-1', url: 'https://example.com', content: 'Test', status: 'success' },
        { id: 'page-2', url: 'https://error.com', content: 'Test2', status: 'success' }
      ];

      mockDatabase.getPagesForVectorProcessing.mockResolvedValue(mockPages);
      mockDatabase.getContentChunks.mockResolvedValue([]);
      
      (service as any).convertToEnhancedContent = vi.fn()
        .mockResolvedValueOnce({ id: 'page-1', chunkCount: 1 })
        .mockRejectedValueOnce(new Error('Processing failed'));

      const mockProcessContentWithVector = vi.fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('Processing failed'));
      
      (service as any).processContentWithVector = mockProcessContentWithVector;

      const results = await service.backfillExistingContent({
        missingEmbeddingsOnly: true,
        batchSize: 10
      });

      expect(results.pagesProcessed).toBe(1);
      expect(results.pagesFailed).toBe(1);
      expect(results.failures).toHaveLength(1);
      expect(results.failures[0].url).toBe('https://error.com');
    });

    it('should skip already processed pages when not forcing reprocessing', async () => {
      const mockPages = [
        { id: 'page-1', url: 'https://example.com', content: 'Test', status: 'success' }
      ];

      mockDatabase.getPagesForVectorProcessing.mockResolvedValue(mockPages);
      mockDatabase.getContentChunks.mockResolvedValue([
        { id: 'chunk-1', content: 'existing chunk' }
      ]);

      const results = await service.backfillExistingContent({
        missingEmbeddingsOnly: true,
        forceReprocess: false,
        batchSize: 10
      });

      expect(results.pagesProcessed).toBe(0);
      expect(results.pagesFailed).toBe(0);
    });
  });

  describe('getEnhancedStats', () => {
    it('should return enhanced statistics', async () => {
      const stats = await service.getEnhancedStats();

      expect(stats).toMatchObject({
        totalPages: 10,
        totalJobs: 5,
        vector: {
          totalPages: 10,
          pagesWithEmbeddings: 5,
          pagesWithChunks: 5,
          totalChunks: 25,
          averageChunksPerPage: 2.5
        },
        services: {
          vectorEngine: expect.any(Boolean),
          markdownProcessor: expect.any(Boolean),
          vectorStore: true
        }
      });
    });
  });

  describe('cleanup', () => {
    it('should close all enhanced components', async () => {
      const vectorEngine = {
        close: vi.fn().mockResolvedValue(undefined)
      };
      
      const markdownProcessor = {
        close: vi.fn().mockResolvedValue(undefined)
      };

      const vectorStore = {
        close: vi.fn().mockResolvedValue(undefined)
      };

      (service as any).vectorEngine = vectorEngine;
      (service as any).markdownProcessor = markdownProcessor;
      (service as any).vectorStore = vectorStore;

      await service.close();

      expect(vectorEngine.close).toHaveBeenCalled();
      expect(markdownProcessor.close).toHaveBeenCalled();
      expect(vectorStore.close).toHaveBeenCalled();
    });
  });

  describe('private helpers', () => {
    describe('convertToEnhancedContent', () => {
      it('should convert page data to enhanced format', async () => {
        const mockPage = {
          id: 'page-1',
          url: 'https://example.com',
          title: 'Test Page',
          content: 'Test content',
          content_hash: 'hash123',
          metadata: '{"test": "data"}',
          scraped_at: '2024-01-01T00:00:00Z',
          status: 'success'
        };

        const mockChunks = [
          {
            id: 'chunk-1',
            content: 'Chunk content',
            vector_id: 'vec-1',
            start_position: 0,
            end_position: 13,
            chunk_index: 0,
            metadata: '{"word_count": 2}'
          }
        ];

        mockDatabase.getContentChunks.mockResolvedValue(mockChunks);

        const result = await (service as any).convertToEnhancedContent(mockPage);

        expect(result).toMatchObject({
          id: 'page-1',
          url: 'https://example.com',
          title: 'Test Page',
          embeddingStatus: 'pending',
          chunkCount: 1,
          chunks: [
            {
              id: 'chunk-1',
              content: 'Chunk content',
              vectorId: 'vec-1',
              startPosition: 0,
              endPosition: 13,
              chunkIndex: 0
            }
          ]
        });
      });
    });
  });

  describe('error handling', () => {
    it('should handle vector processing errors gracefully', async () => {
      const mockContent = {
        id: 'page-1',
        content: 'Test content',
        embeddingStatus: 'pending' as const
      };

      const mockVectorEngine = {
        processContent: vi.fn().mockRejectedValue(new Error('Vector processing failed'))
      };

      (service as any).vectorEngine = mockVectorEngine;

      await expect((service as any).processContentWithVector(mockContent, {
        url: 'https://example.com',
        vector: { enabled: true }
      })).rejects.toThrow('Vector processing failed');

      expect(mockDatabase.updatePageWithVectorInfo).toHaveBeenCalledWith('page-1', {
        embeddingStatus: 'failed'
      });
    });

    it('should handle markdown conversion failures', async () => {
      const mockContent = {
        id: 'page-1',
        content: '<p>Test content</p>',
        embeddingStatus: 'processing' as const
      };

      const mockMarkdownProcessor = {
        convert: vi.fn().mockRejectedValue(new Error('Conversion failed'))
      };

      const mockVectorEngine = {
        processContent: vi.fn().mockResolvedValue({
          chunks: [],
          embeddings: { successful: 0, failed: 0, results: [], errors: [] }
        })
      };

      (service as any).markdownProcessor = mockMarkdownProcessor;
      (service as any).vectorEngine = mockVectorEngine;

      await (service as any).processContentWithVector(mockContent, {
        url: 'https://example.com',
        vector: { enabled: true, convertToMarkdown: true }
      });

      // Should continue processing with original content despite markdown failure
      expect(mockVectorEngine.processContent).toHaveBeenCalledWith(
        '<p>Test content</p>',
        expect.any(Object),
        'page-1',
        'scraped_page'
      );
    });
  });
});