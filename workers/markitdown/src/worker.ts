/**
 * MarkItDown NATS Worker
 */

import { connect, NatsConnection, JSONCodec } from 'nats';
import { createLogger, format, transports } from 'winston';
import { MarkItDownConverter } from './converter.js';
import type { 
  ConvertDocumentRequest, 
  ConvertDocumentResponse, 
  ConvertUrlRequest,
  WorkerConfig,
  WorkerStats 
} from './types.js';

export class MarkItDownWorker {
  private natsConnection?: NatsConnection;
  private converter: MarkItDownConverter;
  private logger;
  private startTime = Date.now();
  private config: WorkerConfig;
  private jsonCodec = JSONCodec();
  private healthCheckInterval?: ReturnType<typeof setInterval>;

  constructor(config: WorkerConfig) {
    this.config = config;
    this.converter = new MarkItDownConverter();
    
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

      this.logger.info('MarkItDown worker started successfully');

      // Handle graceful shutdown
      this.setupGracefulShutdown();

    } catch (error) {
      this.logger.error('Failed to start MarkItDown worker', { error });
      throw error;
    }
  }

  private async setupMessageHandlers(): Promise<void> {
    if (!this.natsConnection) throw new Error('NATS connection not established');

    // Handle document conversion requests
    const documentSub = this.natsConnection.subscribe('markitdown.convert.document', {
      queue: 'markitdown-workers'
    });

    // Handle URL conversion requests  
    const urlSub = this.natsConnection.subscribe('markitdown.convert.url', {
      queue: 'markitdown-workers'
    });

    // Handle stats requests
    const statsSub = this.natsConnection.subscribe('markitdown.stats');

    // Process document conversion messages
    (async () => {
      for await (const msg of documentSub) {
        await this.handleDocumentConversion(msg);
      }
    })();

    // Process URL conversion messages
    (async () => {
      for await (const msg of urlSub) {
        await this.handleUrlConversion(msg);
      }
    })();

    // Process stats requests
    (async () => {
      for await (const msg of statsSub) {
        await this.handleStatsRequest(msg);
      }
    })();

    this.logger.info('Message handlers set up', {
      subjects: ['markitdown.convert.document', 'markitdown.convert.url', 'markitdown.stats']
    });
  }

  private async handleDocumentConversion(msg: any): Promise<void> {
    const startTime = Date.now();
    
    try {
      const request = this.jsonCodec.decode(msg.data) as ConvertDocumentRequest;
      
      this.logger.debug('Processing document conversion request', {
        filename: request.filename,
        contentLength: request.content.length,
        subject: msg.subject
      });

      // Check if we're at max concurrency
      if (this.converter.getActiveJobCount() >= this.config.maxConcurrentJobs) {
        const response: ConvertDocumentResponse = {
          success: false,
          error: 'Worker at maximum capacity, please retry later',
          processingTimeMs: Date.now() - startTime
        };
        
        msg.respond(this.jsonCodec.encode(response));
        return;
      }

      // Process the conversion
      const response = await this.converter.convertDocument(request);
      
      // Send response
      msg.respond(this.jsonCodec.encode(response));
      
      this.logger.info('Document conversion completed', {
        success: response.success,
        processingTimeMs: response.processingTimeMs,
        wordCount: response.metadata?.wordCount
      });

    } catch (error) {
      this.logger.error('Error processing document conversion', { error });
      
      const response: ConvertDocumentResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTimeMs: Date.now() - startTime
      };
      
      msg.respond(this.jsonCodec.encode(response));
    }
  }

  private async handleUrlConversion(msg: any): Promise<void> {
    const startTime = Date.now();
    
    try {
      const request = this.jsonCodec.decode(msg.data) as ConvertUrlRequest;
      
      this.logger.debug('Processing URL conversion request', {
        url: request.url,
        subject: msg.subject
      });

      // Check if we're at max concurrency
      if (this.converter.getActiveJobCount() >= this.config.maxConcurrentJobs) {
        const response: ConvertDocumentResponse = {
          success: false,
          error: 'Worker at maximum capacity, please retry later',
          processingTimeMs: Date.now() - startTime
        };
        
        msg.respond(this.jsonCodec.encode(response));
        return;
      }

      // Process the conversion
      const response = await this.converter.convertFromUrl(request.url, request.options);
      
      // Send response
      msg.respond(this.jsonCodec.encode(response));
      
      this.logger.info('URL conversion completed', {
        success: response.success,
        processingTimeMs: response.processingTimeMs,
        url: request.url
      });

    } catch (error) {
      this.logger.error('Error processing URL conversion', { error });
      
      const response: ConvertDocumentResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTimeMs: Date.now() - startTime
      };
      
      msg.respond(this.jsonCodec.encode(response));
    }
  }

  private async handleStatsRequest(msg: any): Promise<void> {
    try {
      const converterStats = this.converter.getStats();
      const memoryUsage = process.memoryUsage();
      
      const stats: WorkerStats = {
        totalRequests: converterStats.totalRequests,
        successfulConversions: converterStats.successfulConversions,
        failedConversions: converterStats.failedConversions,
        averageProcessingTime: converterStats.averageProcessingTime,
        uptime: Date.now() - this.startTime,
        memoryUsage: {
          heapUsed: memoryUsage.heapUsed,
          heapTotal: memoryUsage.heapTotal,
          external: memoryUsage.external
        }
      };
      
      msg.respond(this.jsonCodec.encode(stats));
      
    } catch (error) {
      this.logger.error('Error processing stats request', { error });
    }
  }

  private setupHealthCheck(): void {
    this.healthCheckInterval = setInterval(() => {
      if (this.natsConnection) {
        const stats = this.converter.getStats();
        this.logger.debug('Health check', {
          connected: !this.natsConnection.isClosed(),
          activeJobs: stats.activeJobs,
          totalRequests: stats.totalRequests
        });
      }
    }, this.config.healthCheckInterval);
  }

  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      this.logger.info(`Received ${signal}, shutting down gracefully...`);
      
      try {
        // Clear health check interval
        if (this.healthCheckInterval) {
          clearInterval(this.healthCheckInterval);
        }

        // Stop accepting new work
        if (this.natsConnection) {
          await this.natsConnection.drain();
          await this.natsConnection.close();
        }
        
        // Wait for active jobs to complete (with timeout)
        const maxWaitTime = 30000; // 30 seconds
        const checkInterval = 1000; // 1 second
        let waitTime = 0;
        
        while (this.converter.getActiveJobCount() > 0 && waitTime < maxWaitTime) {
          this.logger.info(`Waiting for ${this.converter.getActiveJobCount()} active jobs to complete...`);
          await new Promise(resolve => setTimeout(resolve, checkInterval));
          waitTime += checkInterval;
        }
        
        this.logger.info('MarkItDown worker shutdown complete');
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