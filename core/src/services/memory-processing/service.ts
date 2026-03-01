/**
 * Memory Processing Service
 * 
 * Handles content analysis and relationship detection for memories
 */

import { NatsConnection, JSONCodec } from 'nats';
import { EmbeddingRequest, EmbeddingResponse } from '../../shared/types/index.js';
import { ContentAnalyzer } from './analysis/content-analyzer.js';
import { RelationshipDetector } from './relationships/detector.js';
import type { 
  MemoryProcessingEvent,
  ProcessedMemoryEvent,
  MemoryRelationship,
  MemoryProcessingConfig,
  ProcessingStats,
  SimilarMemory
} from './types.js';
import { 
  MemoryProcessingError,
  defaultMemoryProcessingConfig
} from './types.js';

export interface MemoryProcessingServiceDeps {
  // Function to find similar memories (provided by memory service)
  findSimilarMemories: (
    embedding: number[], 
    userId: string, 
    projectName?: string, 
    limit?: number, 
    threshold?: number
  ) => Promise<SimilarMemory[]>;
  
  // Function to store relationships (optional, could publish to NATS instead)
  storeRelationships?: (relationships: MemoryRelationship[]) => Promise<void>;
  
  // NATS connection for embedding requests and event publishing
  natsConnection?: NatsConnection;
}

export class MemoryProcessingService {
  private contentAnalyzer: ContentAnalyzer;
  private relationshipDetector: RelationshipDetector;
  private jsonCodec = JSONCodec();
  private stats: ProcessingStats;

  constructor(
    private config: MemoryProcessingConfig = defaultMemoryProcessingConfig,
    private deps: MemoryProcessingServiceDeps
  ) {
    this.contentAnalyzer = new ContentAnalyzer(config);
    this.relationshipDetector = new RelationshipDetector(
      config,
      deps.findSimilarMemories
    );
    
    this.stats = {
      totalMemoriesProcessed: 0,
      totalAnalysesCompleted: 0,
      totalRelationshipsDetected: 0,
      averageProcessingTime: 0,
      relationshipsByType: {
        semantic_similarity: 0,
        topic_overlap: 0,
        tag_similarity: 0,
        temporal_proximity: 0,
        user_connection: 0,
        project_connection: 0,
      },
      languageDistribution: {},
      topicDistribution: {},
    };
  }

  /**
   * Process a memory: analyze content and detect relationships
   */
  async processMemory(memory: MemoryProcessingEvent): Promise<ProcessedMemoryEvent> {
    const startTime = Date.now();

    try {
      // Step 1: Analyze content
      const analysis = await this.contentAnalyzer.analyzeContent(
        memory.content,
        memory.memory_id,
        memory.user_id
      );

      // Update topic statistics
      for (const topic of analysis.topics) {
        this.stats.topicDistribution[topic] = (this.stats.topicDistribution[topic] || 0) + 1;
      }

      // Update language statistics
      this.stats.languageDistribution[analysis.language] = 
        (this.stats.languageDistribution[analysis.language] || 0) + 1;

      // Step 2: Get or request embedding
      let embedding = memory.embedding;
      if (!embedding) {
        embedding = await this.requestEmbedding(memory.content);
      }

      // Step 3: Detect relationships
      const relationships = await this.relationshipDetector.detectRelationships(
        memory,
        embedding
      );

      // Update relationship statistics
      for (const relationship of relationships) {
        this.stats.relationshipsByType[relationship.relationship_type]++;
      }

      // Step 4: Store relationships if handler provided
      if (this.deps.storeRelationships && relationships.length > 0) {
        await this.deps.storeRelationships(relationships);
      }

      // Update processing statistics
      const processingTime = Date.now() - startTime;
      this.updateProcessingStats(processingTime, relationships.length);

      const result: ProcessedMemoryEvent = {
        memory_id: memory.memory_id,
        analysis,
        relationships,
        processing_completed_at: Date.now(),
      };

      return result;

    } catch (error) {
      throw new MemoryProcessingError(
        `Failed to process memory ${memory.memory_id}`,
        'PROCESSING_FAILED',
        memory.memory_id,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Process a batch of memories
   */
  async processMemoryBatch(memories: MemoryProcessingEvent[]): Promise<ProcessedMemoryEvent[]> {
    const results: ProcessedMemoryEvent[] = [];
    const errors: Array<{ memoryId: string; error: Error }> = [];

    // Process memories concurrently (with limit to avoid overwhelming systems)
    const concurrency = 5;
    for (let i = 0; i < memories.length; i += concurrency) {
      const batch = memories.slice(i, i + concurrency);
      
      const batchPromises = batch.map(async (memory) => {
        try {
          const result = await this.processMemory(memory);
          results.push(result);
        } catch (error) {
          errors.push({
            memoryId: memory.memory_id,
            error: error instanceof Error ? error : new Error('Unknown error')
          });
        }
      });

      await Promise.all(batchPromises);
    }

    if (errors.length > 0) {
      console.warn(`Failed to process ${errors.length} memories:`, errors);
    }

    return results;
  }

  /**
   * Request embedding from embeddings worker via NATS
   */
  private async requestEmbedding(text: string): Promise<number[]> {
    if (!this.deps.natsConnection) {
      throw new MemoryProcessingError(
        'NATS connection required for embedding requests',
        'MISSING_NATS_CONNECTION'
      );
    }

    try {
      const request: EmbeddingRequest = {
        id: `memory-processing-${Date.now()}`,
        text,
        request_id: `req-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
      };

      const response = await this.deps.natsConnection.request(
        this.config.embeddingsWorkerSubject,
        this.jsonCodec.encode(request),
        { timeout: 30000 } // 30 second timeout
      );

      const embeddingResponse = this.jsonCodec.decode(response.data) as EmbeddingResponse;
      
      if (embeddingResponse.error) {
        throw new Error(embeddingResponse.error);
      }

      return embeddingResponse.embedding;

    } catch (error) {
      throw new MemoryProcessingError(
        'Failed to request embedding from worker',
        'EMBEDDING_REQUEST_FAILED',
        undefined,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Publish processed memory event to NATS
   */
  async publishProcessedEvent(event: ProcessedMemoryEvent): Promise<void> {
    if (!this.deps.natsConnection) {
      console.warn('No NATS connection available for publishing processed event');
      return;
    }

    try {
      await this.deps.natsConnection.publish(
        'memories.processed',
        this.jsonCodec.encode(event)
      );

      // Also publish relationships separately if any exist
      if (event.relationships.length > 0) {
        const relationshipEvent = {
          relationships: event.relationships,
          source_memory_id: event.memory_id,
          created_at: Date.now(),
        };

        await this.deps.natsConnection.publish(
          'memories.relationships',
          this.jsonCodec.encode(relationshipEvent)
        );
      }

    } catch (error) {
      console.error('Failed to publish processed memory event:', error);
      // Don't throw here as this is not critical to the processing pipeline
    }
  }

  /**
   * Get processing statistics
   */
  getStats(): ProcessingStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      totalMemoriesProcessed: 0,
      totalAnalysesCompleted: 0,
      totalRelationshipsDetected: 0,
      averageProcessingTime: 0,
      relationshipsByType: {
        semantic_similarity: 0,
        topic_overlap: 0,
        tag_similarity: 0,
        temporal_proximity: 0,
        user_connection: 0,
        project_connection: 0,
      },
      languageDistribution: {},
      topicDistribution: {},
    };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<MemoryProcessingConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.contentAnalyzer = new ContentAnalyzer(this.config);
    this.relationshipDetector = new RelationshipDetector(
      this.config,
      this.deps.findSimilarMemories
    );
  }

  private updateProcessingStats(processingTime: number, relationshipCount: number): void {
    this.stats.totalMemoriesProcessed++;
    this.stats.totalAnalysesCompleted++;
    this.stats.totalRelationshipsDetected += relationshipCount;

    // Update average processing time (exponential moving average)
    const alpha = 0.1; // Smoothing factor
    if (this.stats.averageProcessingTime === 0) {
      this.stats.averageProcessingTime = processingTime;
    } else {
      this.stats.averageProcessingTime = 
        alpha * processingTime + (1 - alpha) * this.stats.averageProcessingTime;
    }
  }
}