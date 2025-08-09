/**
 * Vector Scraping Engine
 * 
 * Handles vector processing capabilities for scraped content including
 * embeddings generation, content chunking, and vector storage operations.
 */

import { connect, NatsConnection } from 'nats';
import { randomUUID } from 'node:crypto';
import type {
  EmbeddingRequest,
  EmbeddingResponse,
  EmbeddingBatchRequest,
  EmbeddingBatchResponse
} from '../../shared/types/embedding.js';
import type { ContentChunk, ChunkingOptions } from '../../shared/types/content.js';
import type { ContentChunkingService } from '../chunking/ContentChunkingService.js';

/**
 * Vector processing configuration
 */
export interface VectorEngineConfig {
  natsUrl: string;
  embeddingModel?: string;
  timeout?: number;
  batchSize?: number;
  vectorSize?: number;
}

/**
 * Embedding generation result
 */
export interface EmbeddingResult {
  vectorId: string;
  embedding: number[];
  processingTimeMs: number;
  error?: string;
}

/**
 * Batch embedding result
 */
export interface BatchEmbeddingResult {
  results: EmbeddingResult[];
  totalProcessingTimeMs: number;
  successful: number;
  failed: number;
  errors: Array<{
    chunkId: string;
    error: string;
  }>;
}

/**
 * Vector search result
 */
export interface VectorSearchResult {
  chunkId: string;
  content: string;
  similarity: number;
  metadata: any;
}

export class VectorScrapingEngine {
  private natsConnection?: NatsConnection;
  private isConnected = false;

  constructor(
    private config: VectorEngineConfig,
    private chunkingService: ContentChunkingService
  ) {}

  /**
   * Initialize the vector engine and establish NATS connection
   */
  async initialize(): Promise<void> {
    try {
      this.natsConnection = await connect({ 
        servers: this.config.natsUrl,
        timeout: this.config.timeout || 30000
      });
      
      this.isConnected = true;
      console.log('✅ Vector scraping engine connected to NATS');
    } catch (error) {
      console.error('❌ Failed to connect to NATS for vector operations:', error);
      this.isConnected = false;
      // Don't throw - allow fallback operations
    }
  }

  /**
   * Process content into chunks and generate embeddings
   */
  async processContent(
    content: string,
    options: ChunkingOptions & {
      generateEmbeddings?: boolean;
      embeddingModel?: string;
    },
    parentId: string,
    parentType: 'scraped_page' | 'code_file' | 'wiki_page' | 'document'
  ): Promise<{
    chunks: ContentChunk[];
    embeddings: BatchEmbeddingResult;
  }> {
    const startTime = Date.now();

    try {
      // Step 1: Chunk the content
      const chunks = await this.chunkingService.chunkContent(
        content,
        options,
        parentId,
        parentType
      );

      console.log(`📝 Generated ${chunks.length} chunks for content processing`);

      // Step 2: Generate embeddings if requested
      let embeddings: BatchEmbeddingResult = {
        results: [],
        totalProcessingTimeMs: 0,
        successful: 0,
        failed: 0,
        errors: []
      };

      if (options.generateEmbeddings !== false && chunks.length > 0) {
        embeddings = await this.generateBatchEmbeddings(
          chunks.map(chunk => ({
            id: chunk.id,
            content: chunk.content
          })),
          options.embeddingModel
        );

        // Update chunks with vector IDs
        chunks.forEach((chunk, index) => {
          const embeddingResult = embeddings.results.find(r => 
            r.vectorId === chunk.id && !r.error
          );
          if (embeddingResult) {
            chunk.vector_id = embeddingResult.vectorId;
          }
        });
      }

      const processingTime = Date.now() - startTime;
      console.log(`⚡ Content processing completed in ${processingTime}ms`);

      return { chunks, embeddings };
    } catch (error) {
      console.error('❌ Content processing failed:', error);
      throw new Error(`Content processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate a single embedding for text content
   */
  async generateEmbedding(
    text: string,
    model?: string
  ): Promise<EmbeddingResult> {
    if (!this.isConnected || !this.natsConnection) {
      throw new Error('Vector engine not connected to NATS');
    }

    const requestId = randomUUID();
    const vectorId = randomUUID();
    const startTime = Date.now();

    try {
      const request: EmbeddingRequest = {
        id: vectorId,
        text,
        request_id: requestId,
        model: model || this.config.embeddingModel,
        user_id: 'scraper-service'
      };

      const response = await this.natsConnection.request(
        'workers.embeddings',
        JSON.stringify(request),
        { timeout: this.config.timeout || 30000 }
      );

      const result = JSON.parse(new TextDecoder().decode(response.data)) as EmbeddingResponse;
      
      if (result.error) {
        throw new Error(result.error);
      }

      return {
        vectorId,
        embedding: result.embedding,
        processingTimeMs: Date.now() - startTime
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error('❌ Failed to generate embedding:', error);
      
      return {
        vectorId,
        embedding: [],
        processingTimeMs: processingTime,
        error: error instanceof Error ? error.message : 'Unknown embedding error'
      };
    }
  }

  /**
   * Generate embeddings for multiple text chunks in batch
   */
  async generateBatchEmbeddings(
    chunks: Array<{ id: string; content: string }>,
    model?: string
  ): Promise<BatchEmbeddingResult> {
    if (!this.isConnected || !this.natsConnection) {
      console.warn('⚠️ NATS not connected, skipping embedding generation');
      return {
        results: chunks.map(chunk => ({
          vectorId: chunk.id,
          embedding: [],
          processingTimeMs: 0,
          error: 'NATS not connected'
        })),
        totalProcessingTimeMs: 0,
        successful: 0,
        failed: chunks.length,
        errors: chunks.map(chunk => ({
          chunkId: chunk.id,
          error: 'NATS not connected'
        }))
      };
    }

    const batchId = randomUUID();
    const startTime = Date.now();
    const batchSize = this.config.batchSize || 32;
    const results: EmbeddingResult[] = [];
    const errors: Array<{ chunkId: string; error: string }> = [];

    try {
      // Process in batches to avoid overwhelming the system
      for (let i = 0; i < chunks.length; i += batchSize) {
        const batch = chunks.slice(i, i + batchSize);
        
        const requests: EmbeddingRequest[] = batch.map(chunk => ({
          id: chunk.id,
          text: chunk.content,
          request_id: randomUUID(),
          model: model || this.config.embeddingModel,
          user_id: 'scraper-service'
        }));

        const batchRequest: EmbeddingBatchRequest = {
          batch_id: `${batchId}-${i}`,
          requests,
          priority: 'normal'
        };

        try {
          const response = await this.natsConnection.request(
            'workers.embeddings.batch',
            JSON.stringify(batchRequest),
            { timeout: (this.config.timeout || 30000) * 2 }
          );

          const batchResponse = JSON.parse(new TextDecoder().decode(response.data)) as EmbeddingBatchResponse;
          
          // Process successful responses
          batchResponse.responses.forEach(embeddingResponse => {
            const originalRequest = requests.find(req => req.request_id === embeddingResponse.request_id);
            if (originalRequest) {
              results.push({
                vectorId: originalRequest.id,
                embedding: embeddingResponse.embedding,
                processingTimeMs: embeddingResponse.processing_time_ms
              });
            }
          });

          // Process errors
          batchResponse.errors.forEach(embeddingError => {
            const originalRequest = requests.find(req => req.request_id === embeddingError.request_id);
            if (originalRequest) {
              results.push({
                vectorId: originalRequest.id,
                embedding: [],
                processingTimeMs: embeddingError.processing_time_ms,
                error: embeddingError.error
              });
              errors.push({
                chunkId: originalRequest.id,
                error: embeddingError.error
              });
            }
          });

          console.log(`✅ Processed batch ${i / batchSize + 1}/${Math.ceil(chunks.length / batchSize)}`);
        } catch (batchError) {
          console.error(`❌ Batch processing failed for batch starting at index ${i}:`, batchError);
          
          // Mark all chunks in this batch as failed
          batch.forEach(chunk => {
            results.push({
              vectorId: chunk.id,
              embedding: [],
              processingTimeMs: 0,
              error: batchError instanceof Error ? batchError.message : 'Batch processing failed'
            });
            errors.push({
              chunkId: chunk.id,
              error: batchError instanceof Error ? batchError.message : 'Batch processing failed'
            });
          });
        }
      }

      const totalProcessingTimeMs = Date.now() - startTime;
      const successful = results.filter(r => !r.error).length;
      const failed = results.filter(r => r.error).length;

      console.log(`📊 Batch embedding results: ${successful} successful, ${failed} failed in ${totalProcessingTimeMs}ms`);

      return {
        results,
        totalProcessingTimeMs,
        successful,
        failed,
        errors
      };
    } catch (error) {
      console.error('❌ Batch embedding generation failed:', error);
      
      return {
        results: chunks.map(chunk => ({
          vectorId: chunk.id,
          embedding: [],
          processingTimeMs: 0,
          error: error instanceof Error ? error.message : 'Unknown batch error'
        })),
        totalProcessingTimeMs: Date.now() - startTime,
        successful: 0,
        failed: chunks.length,
        errors: chunks.map(chunk => ({
          chunkId: chunk.id,
          error: error instanceof Error ? error.message : 'Unknown batch error'
        }))
      };
    }
  }

  /**
   * Search for similar content using vector similarity
   */
  async searchSimilar(
    query: string,
    options: {
      threshold?: number;
      limit?: number;
      collectionName?: string;
    } = {}
  ): Promise<VectorSearchResult[]> {
    try {
      // First, generate embedding for the query
      const queryEmbedding = await this.generateEmbedding(query);
      
      if (queryEmbedding.error || queryEmbedding.embedding.length === 0) {
        console.warn('⚠️ Failed to generate query embedding, returning empty results');
        return [];
      }

      // For now, return empty results since we don't have a vector database integrated
      // In a full implementation, this would query Qdrant or similar vector database
      console.log('🔍 Vector search would be performed here with real vector database');
      
      return [];
    } catch (error) {
      console.error('❌ Vector search failed:', error);
      return [];
    }
  }

  /**
   * Get the vector dimension size
   */
  getVectorDimension(): number {
    return this.config.vectorSize || 1536; // Default for text-embedding-3-small
  }

  /**
   * Check if the vector engine is ready for operations
   */
  isReady(): boolean {
    return this.isConnected;
  }

  /**
   * Close the vector engine and cleanup resources
   */
  async close(): Promise<void> {
    if (this.natsConnection) {
      await this.natsConnection.close();
      this.isConnected = false;
      console.log('🔌 Vector scraping engine disconnected from NATS');
    }
  }
}