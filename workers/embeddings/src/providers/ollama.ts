/**
 * Ollama embedding provider
 */

import { BaseEmbeddingProvider } from './base.js';
import { EmbeddingProviderError } from '../types.js';
import pLimit from 'p-limit';
import pRetry from 'p-retry';

export interface OllamaConfig {
  concurrency?: number;        // Default: 3, Max: 10
  batchSize?: number;         // Default: 10
  retryAttempts?: number;     // Default: 3
  retryDelay?: number;        // Default: 1000ms
  maxMemoryUsage?: number;    // Default: 512MB in bytes
  requestTimeout?: number;    // Default: 30000ms (30s)
}

export class OllamaEmbeddingProvider extends BaseEmbeddingProvider {
  protected modelName: string;
  protected dimension: number = 768; // Default, will be updated after first call
  private baseUrl: string;
  private config: Required<OllamaConfig>;
  private limit: ReturnType<typeof pLimit>;
  private memoryUsage: number = 0;

  constructor(baseUrl: string, modelName: string, config?: OllamaConfig) {
    super();
    this.baseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    this.modelName = modelName;
    
    // Apply configuration with defaults
    this.config = {
      concurrency: Math.min(config?.concurrency || 3, 10),
      batchSize: config?.batchSize || 10,
      retryAttempts: config?.retryAttempts || 3,
      retryDelay: config?.retryDelay || 1000,
      maxMemoryUsage: config?.maxMemoryUsage || 512 * 1024 * 1024, // 512MB
      requestTimeout: config?.requestTimeout || 30_000, // 30s
    };
    
    // Initialize concurrency limiter
    this.limit = pLimit(this.config.concurrency);
    
    console.log(`🔧 Ollama provider initialized with concurrency: ${this.config.concurrency}, batch size: ${this.config.batchSize}`);
  }

  async generateEmbedding(text: string): Promise<number[]> {
    if (!text.trim()) {
      return new Array(this.dimension).fill(0);
    }

    // Check cache first
    const cached = await this.getCachedEmbedding(text);
    if (cached) {
      return cached;
    }

    // Use retry logic for individual embedding generation
    return await pRetry(
      async () => await this.generateEmbeddingInternal(text),
      {
        retries: this.config.retryAttempts,
        minTimeout: this.config.retryDelay,
        factor: 2, // Exponential backoff
        onFailedAttempt: (error) => {
          console.warn(`🔄 Retry attempt ${error.attemptNumber}/${this.config.retryAttempts + 1} for text "${text.substring(0, 50)}...": ${error.message}`);
        }
      }
    );
  }

  private async generateEmbeddingInternal(text: string): Promise<number[]> {
    // Monitor memory usage
    this.trackMemoryUsage(text.length * 2); // Rough estimate: 2 bytes per character

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.requestTimeout);
      let response: Response;
      try {
        response = await fetch(`${this.baseUrl}/api/embeddings`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: this.modelName,
            prompt: text,
          }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (!response.ok) {
        throw new EmbeddingProviderError(
          `Ollama API returned ${response.status}: ${response.statusText}`,
          'ollama',
          response.status
        );
      }

      const data = await response.json();
      
      if (!data.embedding || !Array.isArray(data.embedding)) {
        throw new EmbeddingProviderError(
          'Invalid response format from Ollama API',
          'ollama'
        );
      }

      const embedding: number[] = data.embedding;
      
      // Update dimension if this is our first successful call
      if (this.dimension === 768 && embedding.length !== 768) {
        this.dimension = embedding.length;
      }

      // Validate dimension
      if (embedding.length !== this.dimension) {
        throw new EmbeddingProviderError(
          `Embedding dimension mismatch: expected ${this.dimension}, got ${embedding.length}`,
          'ollama'
        );
      }

      // Track memory usage for the embedding
      this.trackMemoryUsage(embedding.length * 8); // 8 bytes per float64

      // Cache the result
      this.setCachedEmbedding(text, embedding);

      return embedding;

    } catch (error) {
      this.releaseMemoryUsage(text.length * 2);
      
      if (error instanceof EmbeddingProviderError) {
        throw error;
      }

      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new EmbeddingProviderError(
          `Failed to connect to Ollama at ${this.baseUrl}`,
          'ollama',
          undefined,
          undefined,
          error
        );
      }

      throw new EmbeddingProviderError(
        `Unexpected error generating embedding: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'ollama',
        undefined,
        undefined,
        error instanceof Error ? error : undefined
      );
    }
  }

  async generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    console.log(`🚀 Processing batch of ${texts.length} texts with concurrency: ${this.config.concurrency}`);
    const startTime = Date.now();
    
    // Process in chunks to manage memory usage
    const chunks: string[][] = [];
    for (let i = 0; i < texts.length; i += this.config.batchSize) {
      chunks.push(texts.slice(i, i + this.config.batchSize));
    }

    const allEmbeddings: number[][] = [];
    
    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
      const chunk = chunks[chunkIndex];
      console.log(`📦 Processing chunk ${chunkIndex + 1}/${chunks.length} (${chunk.length} items)`);
      
      // Wait for memory to be available if needed
      await this.waitForMemoryAvailable();
      
      // Process chunk concurrently
      const chunkPromises = chunk.map((text, index) => 
        this.limit(async () => {
          try {
            const embedding = await this.generateEmbedding(text);
            console.log(`✅ Completed embedding ${chunkIndex * this.config.batchSize + index + 1}/${texts.length}`);
            return embedding;
          } catch (error) {
            console.error(`❌ Failed embedding ${chunkIndex * this.config.batchSize + index + 1}/${texts.length}:`, error);
            throw error;
          }
        })
      );
      
      try {
        const chunkEmbeddings = await Promise.all(chunkPromises);
        allEmbeddings.push(...chunkEmbeddings);
        
        // Log progress
        const progress = ((chunkIndex + 1) / chunks.length * 100).toFixed(1);
        const elapsed = Date.now() - startTime;
        const estimatedTotal = elapsed * chunks.length / (chunkIndex + 1);
        const remaining = estimatedTotal - elapsed;
        
        console.log(`📊 Progress: ${progress}% (${allEmbeddings.length}/${texts.length}) - ETA: ${Math.round(remaining / 1000)}s`);
        
      } catch (error) {
        console.error(`❌ Chunk ${chunkIndex + 1} failed:`, error);
        throw error;
      }
      
      // Optional delay between chunks to prevent overwhelming the server
      if (chunkIndex < chunks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    const totalTime = Date.now() - startTime;
    const avgTimePerEmbedding = totalTime / texts.length;
    
    console.log(`🎉 Batch complete! ${texts.length} embeddings in ${(totalTime / 1000).toFixed(2)}s (avg: ${avgTimePerEmbedding.toFixed(0)}ms/embedding)`);
    console.log(`📈 Performance: ${((texts.length / totalTime) * 1000).toFixed(2)} embeddings/second`);
    
    return allEmbeddings;
  }

  async healthCheck(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.requestTimeout);
      let response: Response;
      try {
        response = await fetch(`${this.baseUrl}/api/tags`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (!response.ok) {
        return false;
      }

      const data = await response.json();
      
      // Check if our model is available
      if (data.models && Array.isArray(data.models)) {
        return data.models.some((model: any) => 
          model.name === this.modelName || model.name.startsWith(this.modelName.split(':')[0])
        );
      }

      return false;

    } catch (error) {
      return false;
    }
  }

  async pullModel(): Promise<void> {
    try {
      const controller = new AbortController();
      // Model pulls can take longer — use 5x the normal timeout
      const pullTimeout = this.config.requestTimeout * 5;
      const timeoutId = setTimeout(() => controller.abort(), pullTimeout);
      let response: Response;
      try {
        response = await fetch(`${this.baseUrl}/api/pull`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: this.modelName,
          }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (!response.ok) {
        throw new EmbeddingProviderError(`Failed to pull model ${this.modelName}: ${response.status} ${response.statusText}`, 'ollama', response.status
        );
      }

      // Stream the response to handle pull progress
      const reader = response.body?.getReader();
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          // Optionally parse and log progress
          const chunk = new TextDecoder().decode(value);
          const lines = chunk.split('\n').filter(line => line.trim());
          
          for (const line of lines) {
            try {
              const data = JSON.parse(line);
              if (data.status) {
                console.log(`Model pull: ${data.status}`);
              }
            } catch {
              // Ignore invalid JSON lines
            }
          }
        }
      }

    } catch (error) {
      if (error instanceof EmbeddingProviderError) {
        throw error;
      }

      throw new EmbeddingProviderError(
        `Failed to pull model: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'ollama',
        undefined,
        undefined,
        error instanceof Error ? error : undefined
      );
    }
  }

  // Memory management methods
  private trackMemoryUsage(bytes: number): void {
    this.memoryUsage += bytes;
    if (this.memoryUsage > this.config.maxMemoryUsage) {
      console.warn(`⚠️  Memory usage (${(this.memoryUsage / 1024 / 1024).toFixed(2)}MB) exceeds limit (${(this.config.maxMemoryUsage / 1024 / 1024).toFixed(2)}MB)`);
    }
  }

  private releaseMemoryUsage(bytes: number): void {
    this.memoryUsage = Math.max(0, this.memoryUsage - bytes);
  }

  private async waitForMemoryAvailable(): Promise<void> {
    while (this.memoryUsage > this.config.maxMemoryUsage * 0.8) {
      console.log(`⏳ Waiting for memory to free up... Current usage: ${(this.memoryUsage / 1024 / 1024).toFixed(2)}MB`);
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Force garbage collection if available (only in development)
      if (global.gc) {
        global.gc();
      }
    }
  }

  // Performance metrics
  getPerformanceMetrics(): {
    concurrency: number;
    batchSize: number;
    memoryUsage: number;
    maxMemoryUsage: number;
    memoryUtilization: number;
  } {
    return {
      concurrency: this.config.concurrency,
      batchSize: this.config.batchSize,
      memoryUsage: this.memoryUsage,
      maxMemoryUsage: this.config.maxMemoryUsage,
      memoryUtilization: (this.memoryUsage / this.config.maxMemoryUsage) * 100
    };
  }

  // Update configuration at runtime
  updateConfig(newConfig: Partial<OllamaConfig>): void {
    const oldConcurrency = this.config.concurrency;
    
    Object.assign(this.config, newConfig);
    
    // Recreate limit if concurrency changed
    if (newConfig.concurrency && newConfig.concurrency !== oldConcurrency) {
      this.config.concurrency = Math.min(newConfig.concurrency, 10);
      this.limit = pLimit(this.config.concurrency);
      console.log(`🔧 Updated concurrency from ${oldConcurrency} to ${this.config.concurrency}`);
    }
    
    console.log(`🔧 Configuration updated:`, this.config);
  }
}