/**
 * Embeddings NATS Worker
 * 
 * Simplified worker that only handles embedding generation requests via NATS.
 * Storage is handled by the requesting services.
 */

import { connect, NatsConnection, JSONCodec } from 'nats';
import { createLogger, format, transports } from 'winston';
import type { 
  EmbeddingsWorkerConfig, 
  EmbeddingRequest, 
  EmbeddingResponse,
  EmbeddingBatchRequest,
  EmbeddingBatchResponse, 
  EmbeddingsWorkerStats,
  EmbeddingProvider 
} from './types.js';
import { createEmbeddingProvider } from './providers/index.js';
import { EmbeddingProviderError } from './types.js';

export class EmbeddingsWorker {
  private natsConnection?: NatsConnection;
  private embeddingProvider: EmbeddingProvider;
  private logger;
  private startTime = Date.now();
  private config: EmbeddingsWorkerConfig;
  private jsonCodec = JSONCodec();
  
  private healthCheckInterval?: ReturnType<typeof setInterval>;

  // Statistics
  private stats = {
    totalRequests: 0,
    successfulEmbeddings: 0,
    failedEmbeddings: 0,
    totalProcessingTime: 0,
  };

  constructor(config: EmbeddingsWorkerConfig) {
    this.config = config;
    this.embeddingProvider = createEmbeddingProvider(config);
    
    this.logger = createLogger({
      level: config.logLevel,
      format: format.combine(
        format.timestamp(),
        format.errors({ stack: true }),
        format.json()
      ),
      transports: [
        new transports.Console({
          format: format.combine(
            format.colorize(),
            format.simple()
          )
        })
      ]
    });
  }

  async start(): Promise<void> {
    try {
      // Test embedding provider
      await this.testEmbeddingProvider();

      // Connect to NATS
      this.natsConnection = await connect({
        servers: this.config.natsUrl,
        reconnect: true,
        maxReconnectAttempts: -1,
        reconnectTimeWait: 1000
      });

      this.logger.info('Connected to NATS server', { url: this.config.natsUrl });

      // Set up message handlers
      await this.setupMessageHandlers();

      // Set up health check
      this.setupHealthCheck();

      this.logger.info('Embeddings worker started successfully', {
        provider: this.config.embeddingProvider,
        model: this.embeddingProvider.getModelName(),
        dimension: this.embeddingProvider.getDimension()
      });

      // Handle graceful shutdown
      this.setupGracefulShutdown();

    } catch (error) {
      this.logger.error('Failed to start embeddings worker', { error });
      throw error;
    }
  }

  private async testEmbeddingProvider(): Promise<void> {
    try {
      this.logger.info('Testing embedding provider...');
      const testEmbedding = await this.embeddingProvider.generateEmbedding('test');
      
      this.logger.info('Embedding provider test successful', {
        provider: this.config.embeddingProvider,
        model: this.embeddingProvider.getModelName(),
        dimension: testEmbedding.length
      });
    } catch (error) {
      this.logger.error('Embedding provider test failed', { error });
      throw new EmbeddingProviderError(
        'Failed to initialize embedding provider',
        this.config.embeddingProvider,
        undefined,
        this.config.workerId,
        error instanceof Error ? error : undefined
      );
    }
  }

  private async setupMessageHandlers(): Promise<void> {
    if (!this.natsConnection) throw new Error('NATS connection not established');

    // Handle single embedding requests
    const embeddingSub = this.natsConnection.subscribe('embeddings.request', {
      queue: 'embeddings-workers'
    });

    // Handle batch embedding requests
    const batchSub = this.natsConnection.subscribe('embeddings.batch', {
      queue: 'embeddings-workers'
    });

    // Handle stats requests
    const statsSub = this.natsConnection.subscribe('embeddings.stats');

    // Process single embedding messages
    (async () => {
      for await (const msg of embeddingSub) {
        try {
          await this.handleEmbeddingRequest(msg);
        } catch (error) {
          this.logger.error('Error handling embedding request', { error });
        }
      }
    })().catch(error => this.logger.error('Embedding subscription loop failed', { error }));

    // Process batch embedding messages
    (async () => {
      for await (const msg of batchSub) {
        try {
          await this.handleBatchRequest(msg);
        } catch (error) {
          this.logger.error('Error handling batch request', { error });
        }
      }
    })().catch(error => this.logger.error('Batch subscription loop failed', { error }));

    // Process stats requests
    (async () => {
      for await (const msg of statsSub) {
        try {
          await this.handleStatsRequest(msg);
        } catch (error) {
          this.logger.error('Error handling stats request', { error });
        }
      }
    })().catch(error => this.logger.error('Stats subscription loop failed', { error }));

    this.logger.info('Message handlers set up', {
      subjects: ['embeddings.request', 'embeddings.batch', 'embeddings.stats']
    });
  }

  private async handleEmbeddingRequest(msg: any): Promise<void> {
    const startTime = Date.now();
    this.stats.totalRequests++;
    
    try {
      const request = this.jsonCodec.decode(msg.data) as EmbeddingRequest;
      
      this.logger.debug('Processing embedding request', {
        requestId: request.request_id,
        textLength: request.text.length,
        subject: msg.subject
      });

      // Generate embedding
      const embedding = await this.embeddingProvider.generateEmbedding(request.text);
      const processingTimeMs = Date.now() - startTime;
      
      // Create response
      const response: EmbeddingResponse = {
        request_id: request.request_id,
        embedding,
        dimension: this.embeddingProvider.getDimension(),
        processing_time_ms: processingTimeMs,
      };
      
      // Send response
      msg.respond(this.jsonCodec.encode(response));
      
      // Update stats
      this.stats.successfulEmbeddings++;
      this.stats.totalProcessingTime += processingTimeMs;
      
      this.logger.info('Embedding request completed', {
        requestId: request.request_id,
        processingTimeMs,
        dimension: embedding.length
      });

    } catch (error) {
      const processingTimeMs = Date.now() - startTime;
      this.stats.failedEmbeddings++;
      
      this.logger.error('Error processing embedding request', { error });
      
      const response = {
        request_id: 'unknown',
        error: error instanceof Error ? error.message : 'Unknown error',
        processing_time_ms: processingTimeMs
      };
      
      msg.respond(this.jsonCodec.encode(response));
    }
  }

  private async handleBatchRequest(msg: any): Promise<void> {
    const startTime = Date.now();
    this.stats.totalRequests++;
    
    try {
      const request = this.jsonCodec.decode(msg.data) as EmbeddingBatchRequest;
      
      this.logger.debug('Processing batch embedding request', {
        batchId: request.batch_id,
        batchSize: request.requests.length,
        subject: msg.subject
      });

      // Extract texts from requests
      const texts = request.requests.map((r: EmbeddingRequest) => r.text);
      
      // Generate embeddings in batch
      const embeddings = await this.embeddingProvider.generateEmbeddingsBatch(texts);
      const processingTimeMs = Date.now() - startTime;
      
      // Create responses for each embedding
      const responses: EmbeddingResponse[] = request.requests.map((req: EmbeddingRequest, i: number) => ({
        request_id: req.request_id,
        embedding: embeddings[i],
        dimension: this.embeddingProvider.getDimension(),
        processing_time_ms: processingTimeMs / request.requests.length,
      }));
      
      // Create batch response
      const batchResponse: EmbeddingBatchResponse = {
        batch_id: request.batch_id,
        responses,
        errors: [],
        total_processing_time_ms: processingTimeMs,
        completed_at: Date.now(),
      };
      
      // Send response
      msg.respond(this.jsonCodec.encode(batchResponse));
      
      // Update stats
      this.stats.successfulEmbeddings += embeddings.length;
      this.stats.totalProcessingTime += processingTimeMs;
      
      this.logger.info('Batch embedding request completed', {
        batchId: request.batch_id,
        batchSize: embeddings.length,
        processingTimeMs,
        avgTimePerEmbedding: embeddings.length > 0 ? Math.round(processingTimeMs / embeddings.length) : 0
      });

    } catch (error) {
      const processingTimeMs = Date.now() - startTime;
      this.stats.failedEmbeddings++;
      
      this.logger.error('Error processing batch embedding request', { error });
      
      const response = {
        request_id: 'unknown',
        error: error instanceof Error ? error.message : 'Unknown error',
        processing_time_ms: processingTimeMs
      };
      
      msg.respond(this.jsonCodec.encode(response));
    }
  }

  private async handleStatsRequest(msg: any): Promise<void> {
    try {
      const avgProcessingTime = this.stats.totalRequests > 0 
        ? this.stats.totalProcessingTime / this.stats.totalRequests 
        : 0;
      
      const stats: EmbeddingsWorkerStats = {
        // Base WorkerMetrics fields
        workerId: this.config.workerId || 'embeddings-worker',
        timestamp: Date.now(),
        totalRequests: this.stats.totalRequests,
        successfulRequests: this.stats.successfulEmbeddings,
        failedRequests: this.stats.failedEmbeddings,
        averageResponseTime: Math.round(avgProcessingTime),
        
        // Embeddings-specific fields
        successfulEmbeddings: this.stats.successfulEmbeddings,
        failedEmbeddings: this.stats.failedEmbeddings,
        batchesProcessed: 0, // Not applicable for this simplified worker
        memoriesProcessed: 0, // Not applicable for this simplified worker
        relationshipsDetected: 0, // Not applicable for this simplified worker
      };
      
      msg.respond(this.jsonCodec.encode(stats));
      
    } catch (error) {
      this.logger.error('Error processing stats request', { error });
    }
  }

  private setupHealthCheck(): void {
    this.healthCheckInterval = setInterval(async () => {
      if (this.natsConnection) {
        // Test embedding provider periodically
        try {
          await this.embeddingProvider.generateEmbedding('health check');
          
          this.logger.debug('Health check passed', {
            connected: !this.natsConnection.isClosed(),
            provider: this.config.embeddingProvider,
            totalRequests: this.stats.totalRequests,
            successRate: this.stats.totalRequests > 0 
              ? (this.stats.successfulEmbeddings / this.stats.totalRequests * 100).toFixed(1) + '%'
              : '0%'
          });
        } catch (error) {
          this.logger.warn('Health check failed - embedding provider issue', { error });
        }
      }
    }, this.config.healthCheckInterval);
  }

  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      this.logger.info(`Received ${signal}, shutting down gracefully...`);
      
      try {
        // Stop health check timer
        if (this.healthCheckInterval) {
          clearInterval(this.healthCheckInterval);
        }

        // Stop accepting new work
        if (this.natsConnection) {
          await this.natsConnection.drain();
          await this.natsConnection.close();
        }

        // Clear any caches
        if ('clearCache' in this.embeddingProvider) {
          (this.embeddingProvider as any).clearCache();
        }
        
        this.logger.info('Embeddings worker shutdown complete', {
          totalRequests: this.stats.totalRequests,
          successfulEmbeddings: this.stats.successfulEmbeddings,
          failedEmbeddings: this.stats.failedEmbeddings,
          uptime: Date.now() - this.startTime
        });
        
        process.exit(0);
        
      } catch (error) {
        this.logger.error('Error during shutdown', { error });
        process.exit(1);
      }
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  }

  async stop(): Promise<void> {
    if (this.natsConnection) {
      await this.natsConnection.close();
    }
  }
}