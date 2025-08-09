/**
 * GraphCodeBERT Model Implementation
 * 
 * Microsoft GraphCodeBERT model for structure-aware code embeddings.
 * Incorporates control flow and data flow graphs for better code understanding.
 * 
 * Features:
 * - Structure-aware code embeddings
 * - Data flow and control flow awareness
 * - Enhanced code understanding through graph structure
 * - Support for multiple programming languages
 */

import { HfInference } from '@huggingface/inference';
import {
  EmbeddingModelInterface,
  EmbeddingModel,
  EmbeddingModelType,
  SupportedLanguage
} from '../../../../shared/types/codebase.js';

export class GraphCodeBertModel implements EmbeddingModelInterface {
  public readonly name = 'graphcodebert';
  public readonly modelType = EmbeddingModelType.GRAPHCODEBERT;
  public readonly dimension = 768;
  public readonly supportedLanguages: SupportedLanguage[] = [
    SupportedLanguage.TYPESCRIPT,
    SupportedLanguage.JAVASCRIPT,
    SupportedLanguage.PYTHON,
    SupportedLanguage.JAVA,
    SupportedLanguage.GO,
    SupportedLanguage.CPP,
    SupportedLanguage.C
  ];

  private hf: HfInference | null = null;
  private isInitialized = false;
  private readonly modelId = 'microsoft/graphcodebert-base';
  private readonly maxLength: number;
  private readonly batchSize: number;
  private readonly includeDataFlow: boolean;

  constructor(
    private config: EmbeddingModel,
    private apiKeys: Record<string, string>
  ) {
    this.maxLength = config.modelConfig.max_length || 512;
    this.batchSize = config.modelConfig.batch_size || 16; // Smaller batches for GraphCodeBERT
    this.includeDataFlow = config.modelConfig.include_data_flow || true;
  }

  /**
   * Initialize the GraphCodeBERT model
   */
  async initialize(): Promise<void> {
    try {
      const huggingfaceToken = this.apiKeys.huggingface || process.env.HUGGINGFACE_API_KEY;
      if (!huggingfaceToken) {
        throw new Error('Hugging Face API key is required for GraphCodeBERT model');
      }

      this.hf = new HfInference(huggingfaceToken);
      
      // Test the model with a simple query
      await this.testConnection();
      
      this.isInitialized = true;
      console.log(`GraphCodeBERT model initialized successfully`);
    } catch (error) {
      console.error('Failed to initialize GraphCodeBERT model:', error);
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
      await this.hf.featureExtraction({
        model: this.modelId,
        inputs: this.formatGraphInput('function test() { return 1; }')
      });
    } catch (error) {
      console.error('GraphCodeBERT connection test failed:', error);
      throw new Error('Failed to connect to GraphCodeBERT model');
    }
  }

  /**
   * Generate embedding for code content with graph structure
   */
  async generateEmbedding(content: string, metadata?: Record<string, any>): Promise<number[]> {
    if (!this.isReady()) {
      await this.initialize();
    }

    try {
      const graphInput = this.formatGraphInput(content, metadata);
      
      const result = await this.hf!.featureExtraction({
        model: this.modelId,
        inputs: graphInput
      });

      // Process the result considering graph structure
      const embedding = this.processGraphEmbedding(result as number[][]);
      
      return this.normalizeEmbedding(embedding);
    } catch (error) {
      console.error('GraphCodeBERT embedding generation failed:', error);
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
    
    // Process in smaller batches due to graph complexity
    for (let i = 0; i < contents.length; i += this.batchSize) {
      const batch = contents.slice(i, i + this.batchSize);
      const batchMetadata = metadata?.slice(i, i + this.batchSize);
      
      try {
        const preprocessedBatch = batch.map((content, index) => 
          this.formatGraphInput(content, batchMetadata?.[index])
        );

        const batchResults = await this.hf!.featureExtraction({
          model: this.modelId,
          inputs: preprocessedBatch
        });

        // Process each result considering graph structure
        const processedBatch = Array.isArray(batchResults[0][0]) 
          ? (batchResults as number[][][]).map(result => 
              this.normalizeEmbedding(this.processGraphEmbedding(result))
            )
          : [this.normalizeEmbedding(this.processGraphEmbedding(batchResults as number[][]))];

        results.push(...processedBatch);
      } catch (error) {
        console.error(`GraphCodeBERT batch processing failed for batch starting at ${i}:`, error);
        
        // Fallback to individual processing
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
   * Format input for graph-based processing
   */
  private formatGraphInput(content: string, metadata?: Record<string, any>): string {
    let processed = content;

    // Clean and normalize the content
    processed = this.preprocessCode(processed);

    // Add structural information for better graph understanding
    if (this.includeDataFlow) {
      processed = this.enhanceWithStructuralInfo(processed, metadata?.language);
    }

    return processed;
  }

  /**
   * Preprocess code content for GraphCodeBERT
   */
  private preprocessCode(content: string): string {
    let processed = content;

    // Preserve structural elements that are important for graph construction
    processed = processed.replace(/\r\n/g, '\n'); // Normalize line endings
    processed = processed.replace(/\t/g, '  '); // Convert tabs to spaces

    // Remove excessive blank lines but preserve structural separation
    processed = processed.replace(/\n\s*\n\s*\n/g, '\n\n');

    // Truncate intelligently, respecting code structure
    const maxChars = this.maxLength * 4;
    if (processed.length > maxChars) {
      processed = this.intelligentTruncate(processed, maxChars);
    }

    return processed;
  }

  /**
   * Intelligently truncate code preserving structure
   */
  private intelligentTruncate(content: string, maxLength: number): string {
    if (content.length <= maxLength) {
      return content;
    }

    // Find structural boundaries (functions, classes, blocks)
    const structuralMarkers = [
      /function\s+\w+[^{]*{/g,
      /class\s+\w+[^{]*{/g,
      /\w+\s*\([^)]*\)\s*{/g, // Method definitions
      /if\s*\([^)]*\)\s*{/g,
      /for\s*\([^)]*\)\s*{/g,
      /while\s*\([^)]*\)\s*{/g
    ];

    let bestCutPoint = maxLength;
    for (const marker of structuralMarkers) {
      let match;
      marker.lastIndex = 0;
      while ((match = marker.exec(content)) !== null) {
        if (match.index < maxLength && match.index > bestCutPoint - 100) {
          bestCutPoint = match.index;
        }
      }
    }

    // If we found a good structural boundary, use it
    if (bestCutPoint < maxLength - 100) {
      return content.substring(0, bestCutPoint);
    }

    // Otherwise, cut at the last complete line
    const truncated = content.substring(0, maxLength);
    const lastNewline = truncated.lastIndexOf('\n');
    return lastNewline > maxLength * 0.8 ? truncated.substring(0, lastNewline) : truncated;
  }

  /**
   * Enhance code with structural information for better graph understanding
   */
  private enhanceWithStructuralInfo(content: string, language?: string): string {
    // Add language-specific structural hints
    let enhanced = content;
    
    if (language) {
      enhanced = `// Language: ${language}\n${enhanced}`;
    }

    // Add simple control flow markers for better graph construction
    enhanced = enhanced.replace(
      /(if|while|for|switch)\s*\(/g, 
      '// CONTROL_FLOW_START\n$1('
    );
    
    enhanced = enhanced.replace(
      /(function|def|class)\s+(\w+)/g,
      '// DEFINITION: $2\n$1 $2'
    );

    return enhanced;
  }

  /**
   * Process graph-aware embeddings with structural weighting
   */
  private processGraphEmbedding(tokenEmbeddings: number[][]): number[] {
    if (tokenEmbeddings.length === 0) {
      return new Array(this.dimension).fill(0);
    }

    const embeddingDim = tokenEmbeddings[0].length;
    const weightedEmbedding = new Array(embeddingDim).fill(0);
    
    // Apply weighted pooling considering token importance
    let totalWeight = 0;
    
    for (let i = 0; i < tokenEmbeddings.length; i++) {
      const weight = this.calculateTokenWeight(i, tokenEmbeddings.length);
      totalWeight += weight;
      
      for (let j = 0; j < embeddingDim; j++) {
        weightedEmbedding[j] += tokenEmbeddings[i][j] * weight;
      }
    }

    // Normalize by total weight
    if (totalWeight > 0) {
      for (let i = 0; i < embeddingDim; i++) {
        weightedEmbedding[i] /= totalWeight;
      }
    }

    return weightedEmbedding;
  }

  /**
   * Calculate token weight for graph-aware pooling
   */
  private calculateTokenWeight(position: number, totalTokens: number): number {
    // Give more weight to tokens in the middle (likely to be more important structurally)
    const normalizedPosition = position / totalTokens;
    
    // Bell curve weighting with peak at 0.3 and 0.7 (typical function/class positions)
    const weight1 = Math.exp(-Math.pow(normalizedPosition - 0.3, 2) / 0.1);
    const weight2 = Math.exp(-Math.pow(normalizedPosition - 0.7, 2) / 0.1);
    
    return Math.max(0.1, Math.max(weight1, weight2)); // Minimum weight of 0.1
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
    console.log('GraphCodeBERT model cleaned up');
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