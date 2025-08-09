/**
 * OpenAI Model Implementation
 * 
 * OpenAI text-embedding-ada-002 model adapted for code embeddings.
 * Provides high-quality embeddings with large context support.
 * 
 * Features:
 * - Large context window (8k tokens)
 * - High-quality general embeddings
 * - API-based inference
 * - Cost-effective for production use
 */

import OpenAI from 'openai';
import {
  EmbeddingModelInterface,
  EmbeddingModel,
  EmbeddingModelType,
  SupportedLanguage
} from '../../../../shared/types/codebase.js';

export class OpenAIModel implements EmbeddingModelInterface {
  public readonly name = 'openai-code';
  public readonly modelType = EmbeddingModelType.OPENAI;
  public readonly dimension = 1536;
  public readonly supportedLanguages: SupportedLanguage[] = [
    SupportedLanguage.TYPESCRIPT,
    SupportedLanguage.JAVASCRIPT,
    SupportedLanguage.PYTHON,
    SupportedLanguage.JAVA,
    SupportedLanguage.GO,
    SupportedLanguage.CPP,
    SupportedLanguage.C,
    SupportedLanguage.RUST
  ];

  private openai: OpenAI | null = null;
  private isInitialized = false;
  private readonly modelId: string;
  private readonly maxTokens: number;
  private readonly batchSize: number;
  private rateLimitDelay = 0;

  constructor(
    private config: EmbeddingModel,
    private apiKeys: Record<string, string>
  ) {
    this.modelId = config.modelConfig.model_name || 'text-embedding-ada-002';
    this.maxTokens = config.modelConfig.max_tokens || 8000;
    this.batchSize = config.modelConfig.batch_size || 100; // OpenAI allows larger batches
  }

  /**
   * Initialize the OpenAI model
   */
  async initialize(): Promise<void> {
    try {
      const openaiApiKey = this.apiKeys.openai || process.env.OPENAI_API_KEY;
      if (!openaiApiKey) {
        throw new Error('OpenAI API key is required');
      }

      this.openai = new OpenAI({
        apiKey: openaiApiKey
      });

      // Test the connection
      await this.testConnection();
      
      this.isInitialized = true;
      console.log(`OpenAI model initialized successfully`);
    } catch (error) {
      console.error('Failed to initialize OpenAI model:', error);
      throw error;
    }
  }

  /**
   * Test connection to OpenAI API
   */
  private async testConnection(): Promise<void> {
    if (!this.openai) {
      throw new Error('OpenAI client not initialized');
    }

    try {
      await this.openai.embeddings.create({
        model: this.modelId,
        input: 'function test() { return 1; }'
      });
    } catch (error) {
      console.error('OpenAI connection test failed:', error);
      throw new Error('Failed to connect to OpenAI API');
    }
  }

  /**
   * Generate embedding for code content
   */
  async generateEmbedding(content: string, metadata?: Record<string, any>): Promise<number[]> {
    if (!this.isReady()) {
      await this.initialize();
    }

    await this.handleRateLimit();

    try {
      const preprocessedContent = this.preprocessCodeForOpenAI(content, metadata);
      
      const response = await this.openai!.embeddings.create({
        model: this.modelId,
        input: preprocessedContent
      });

      if (!response.data || response.data.length === 0) {
        throw new Error('No embedding data received from OpenAI');
      }

      return response.data[0].embedding;
    } catch (error) {
      await this.handleApiError(error);
      throw error;
    }
  }

  /**
   * Generate embeddings for multiple contents in batch
   */
  async batchGenerateEmbeddings(
    contents: string[],
    metadata?: Record<string, any>[]
  ): Promise<number[][]> {
    if (!this.isReady()) {
      await this.initialize();
    }

    const results: number[][] = [];
    
    // Process in batches to respect API limits
    for (let i = 0; i < contents.length; i += this.batchSize) {
      const batch = contents.slice(i, i + this.batchSize);
      const batchMetadata = metadata?.slice(i, i + this.batchSize);
      
      await this.handleRateLimit();

      try {
        const preprocessedBatch = batch.map((content, index) => 
          this.preprocessCodeForOpenAI(content, batchMetadata?.[index])
        );

        const response = await this.openai!.embeddings.create({
          model: this.modelId,
          input: preprocessedBatch
        });

        if (!response.data || response.data.length !== batch.length) {
          throw new Error(`Expected ${batch.length} embeddings, got ${response.data?.length || 0}`);
        }

        const batchResults = response.data.map(item => item.embedding);
        results.push(...batchResults);
      } catch (error) {
        await this.handleApiError(error);
        
        // Fallback to individual processing for this batch
        console.warn(`Batch processing failed, falling back to individual requests`);
        const fallbackResults = await Promise.all(
          batch.map((content, index) => 
            this.generateEmbedding(content, batchMetadata?.[index])
          )
        );
        results.push(...fallbackResults);
      }
    }

    return results;
  }

  /**
   * Preprocess code content for OpenAI
   */
  private preprocessCodeForOpenAI(content: string, metadata?: Record<string, any>): string {
    let processed = content;

    // Clean up the content
    processed = processed.replace(/\r\n/g, '\n');
    processed = processed.replace(/\t/g, '  ');
    processed = processed.replace(/\n\s*\n\s*\n/g, '\n\n');

    // Add context information for better embeddings
    if (metadata?.language) {
      processed = `// Programming Language: ${metadata.language}\n${processed}`;
    }

    if (metadata?.contextType) {
      processed = `// Context: ${metadata.contextType}\n${processed}`;
    }

    // Truncate to respect token limits (approximate)
    const maxChars = this.maxTokens * 3.5; // Rough estimate of chars per token
    if (processed.length > maxChars) {
      processed = this.intelligentTruncate(processed, maxChars);
    }

    return processed;
  }

  /**
   * Intelligently truncate content while preserving structure
   */
  private intelligentTruncate(content: string, maxLength: number): string {
    if (content.length <= maxLength) {
      return content;
    }

    // Find good breaking points
    const breakPoints = [
      /\n\s*function\s+\w+/g,
      /\n\s*class\s+\w+/g,
      /\n\s*\/\*\*[\s\S]*?\*\//g, // JSDoc comments
      /\n\s*\/\*[\s\S]*?\*\//g,   // Block comments
      /\n\s*#.*$/gm,              // Python comments
      /\n\s*\/\/.*$/gm            // Line comments
    ];

    let bestBreakPoint = maxLength;
    
    for (const breakPoint of breakPoints) {
      let match;
      breakPoint.lastIndex = 0;
      while ((match = breakPoint.exec(content)) !== null) {
        if (match.index < maxLength && match.index > maxLength - 500) {
          bestBreakPoint = Math.min(bestBreakPoint, match.index);
        }
      }
    }

    if (bestBreakPoint < maxLength - 200) {
      return content.substring(0, bestBreakPoint).trim();
    }

    // Fallback to sentence boundary
    const truncated = content.substring(0, maxLength);
    const lastPeriod = truncated.lastIndexOf('.');
    const lastNewline = truncated.lastIndexOf('\n');
    const lastSemicolon = truncated.lastIndexOf(';');
    
    const breakPoint = Math.max(lastPeriod, lastNewline, lastSemicolon);
    if (breakPoint > maxLength * 0.8) {
      return content.substring(0, breakPoint + 1).trim();
    }

    return truncated.trim() + '...';
  }

  /**
   * Handle rate limiting
   */
  private async handleRateLimit(): Promise<void> {
    if (this.rateLimitDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.rateLimitDelay));
    }
  }

  /**
   * Handle API errors and rate limiting
   */
  private async handleApiError(error: any): Promise<void> {
    if (error?.status === 429) {
      // Rate limited
      const retryAfter = error?.headers?.['retry-after'];
      this.rateLimitDelay = retryAfter ? parseInt(retryAfter) * 1000 : Math.min(this.rateLimitDelay * 2 + 1000, 30000);
      
      console.warn(`Rate limited. Waiting ${this.rateLimitDelay}ms before next request.`);
      await new Promise(resolve => setTimeout(resolve, this.rateLimitDelay));
    } else if (error?.status >= 500) {
      // Server error - retry with exponential backoff
      const delay = 1000 + Math.random() * 2000;
      console.warn(`Server error. Retrying in ${delay}ms.`);
      await new Promise(resolve => setTimeout(resolve, delay));
    } else {
      // Reset rate limit delay for non-rate-limit errors
      this.rateLimitDelay = 0;
    }
  }

  /**
   * Cleanup model resources
   */
  async cleanup(): Promise<void> {
    this.openai = null;
    this.isInitialized = false;
    this.rateLimitDelay = 0;
    console.log('OpenAI model cleaned up');
  }

  /**
   * Check if model is ready for inference
   */
  isReady(): boolean {
    return this.isInitialized && this.openai !== null;
  }

  /**
   * Get model information
   */
  getModelInfo() {
    return {
      name: this.name,
      version: '1.0',
      dimension: this.dimension,
      maxTokens: this.maxTokens,
      supportedLanguages: this.supportedLanguages
    };
  }
}