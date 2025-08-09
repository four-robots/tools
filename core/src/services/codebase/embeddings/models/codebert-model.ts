/**
 * CodeBERT Model Implementation
 * 
 * Microsoft CodeBERT model for code understanding and representation.
 * Supports code-natural language embedding generation using the Hugging Face API.
 * 
 * Features:
 * - Pre-trained on code and natural language pairs
 * - Support for multiple programming languages
 * - Batch processing for efficiency
 * - Automatic tokenization and preprocessing
 */

import { HfInference } from '@huggingface/inference';
import {
  EmbeddingModelInterface,
  EmbeddingModel,
  EmbeddingModelType,
  SupportedLanguage
} from '../../../../shared/types/codebase.js';

export class CodeBertModel implements EmbeddingModelInterface {
  public readonly name = 'codebert';
  public readonly modelType = EmbeddingModelType.CODEBERT;
  public readonly dimension = 768;
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

  private hf: HfInference | null = null;
  private isInitialized = false;
  private readonly modelId = 'microsoft/codebert-base';
  private readonly maxLength: number;
  private readonly batchSize: number;

  constructor(
    private config: EmbeddingModel,
    private apiKeys: Record<string, string>
  ) {
    this.maxLength = config.modelConfig.max_length || 512;
    this.batchSize = config.modelConfig.batch_size || 32;
  }

  /**
   * Initialize the CodeBERT model
   */
  async initialize(): Promise<void> {
    try {
      const huggingfaceToken = this.apiKeys.huggingface || process.env.HUGGINGFACE_API_KEY;
      if (!huggingfaceToken) {
        throw new Error('Hugging Face API key is required for CodeBERT model');
      }

      this.hf = new HfInference(huggingfaceToken);
      
      // Test the model with a simple query
      await this.testConnection();
      
      this.isInitialized = true;
      console.log(`CodeBERT model initialized successfully`);
    } catch (error) {
      console.error('Failed to initialize CodeBERT model:', error);
      throw error;
    }
  }

  /**
   * Test connection to the model
   */
  private async testConnection(): Promise<void> {
    if (!this.hf) {
      throw new Error('HuggingFace client not initialized');
    }

    try {
      // Simple test embedding
      await this.hf.featureExtraction({
        model: this.modelId,
        inputs: 'function test() { return 1; }'
      });
    } catch (error) {
      console.error('CodeBERT connection test failed:', error);
      throw new Error('Failed to connect to CodeBERT model');
    }
  }

  /**
   * Generate embedding for code content
   */
  async generateEmbedding(content: string, metadata?: Record<string, any>): Promise<number[]> {
    if (!this.isReady()) {
      await this.initialize();
    }

    try {
      const preprocessedContent = this.preprocessCode(content, metadata);
      
      const result = await this.hf!.featureExtraction({
        model: this.modelId,
        inputs: preprocessedContent
      });

      // HuggingFace returns nested arrays, we want the mean pooling
      const embedding = this.meanPooling(result as number[][]);
      
      // Normalize the embedding
      return this.normalizeEmbedding(embedding);
    } catch (error) {
      console.error('CodeBERT embedding generation failed:', error);
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
    
    // Process in batches to avoid API limits
    for (let i = 0; i < contents.length; i += this.batchSize) {
      const batch = contents.slice(i, i + this.batchSize);
      const batchMetadata = metadata?.slice(i, i + this.batchSize);
      
      try {
        const preprocessedBatch = batch.map((content, index) => 
          this.preprocessCode(content, batchMetadata?.[index])
        );

        const batchResults = await this.hf!.featureExtraction({
          model: this.modelId,
          inputs: preprocessedBatch
        });

        // Process each result in the batch
        const processedBatch = Array.isArray(batchResults[0][0]) 
          ? (batchResults as number[][][]).map(result => 
              this.normalizeEmbedding(this.meanPooling(result))
            )
          : [this.normalizeEmbedding(this.meanPooling(batchResults as number[][]))];

        results.push(...processedBatch);
      } catch (error) {
        console.error(`CodeBERT batch processing failed for batch starting at ${i}:`, error);
        
        // Fallback to individual processing for this batch
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
   * Preprocess code content for CodeBERT
   */
  private preprocessCode(content: string, metadata?: Record<string, any>): string {
    let processed = content;

    // Remove excessive whitespace while preserving structure
    processed = processed.replace(/\n\s*\n\s*\n/g, '\n\n');
    processed = processed.replace(/\t/g, '  '); // Convert tabs to spaces
    
    // Truncate to max length (approximate token count)
    const maxChars = this.maxLength * 4; // Rough approximation
    if (processed.length > maxChars) {
      processed = processed.substring(0, maxChars);
      
      // Try to cut at a meaningful boundary
      const lastNewline = processed.lastIndexOf('\n');
      const lastBrace = processed.lastIndexOf('}');
      const lastSemicolon = processed.lastIndexOf(';');
      
      const cutPoint = Math.max(lastNewline, lastBrace, lastSemicolon);
      if (cutPoint > maxChars * 0.8) {
        processed = processed.substring(0, cutPoint + 1);
      }
    }

    // Add language hint if available
    if (metadata?.language) {
      processed = `// Language: ${metadata.language}\n${processed}`;
    }

    return processed;
  }

  /**
   * Perform mean pooling on token embeddings
   */
  private meanPooling(tokenEmbeddings: number[][]): number[] {
    if (tokenEmbeddings.length === 0) {
      return new Array(this.dimension).fill(0);
    }

    const embeddingDim = tokenEmbeddings[0].length;
    const meanEmbedding = new Array(embeddingDim).fill(0);

    for (const embedding of tokenEmbeddings) {
      for (let i = 0; i < embeddingDim; i++) {
        meanEmbedding[i] += embedding[i];
      }
    }

    // Calculate mean
    for (let i = 0; i < embeddingDim; i++) {
      meanEmbedding[i] /= tokenEmbeddings.length;
    }

    return meanEmbedding;
  }

  /**
   * Normalize embedding vector to unit length
   */
  private normalizeEmbedding(embedding: number[]): number[] {
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    
    if (magnitude === 0) {
      return embedding;
    }

    return embedding.map(val => val / magnitude);
  }

  /**
   * Cleanup model resources
   */
  async cleanup(): Promise<void> {
    this.hf = null;
    this.isInitialized = false;
    console.log('CodeBERT model cleaned up');
  }

  /**
   * Check if model is ready for inference
   */
  isReady(): boolean {
    return this.isInitialized && this.hf !== null;
  }

  /**
   * Get model information
   */
  getModelInfo() {
    return {
      name: this.name,
      version: '1.0',
      dimension: this.dimension,
      maxTokens: this.maxLength,
      supportedLanguages: this.supportedLanguages
    };
  }
}