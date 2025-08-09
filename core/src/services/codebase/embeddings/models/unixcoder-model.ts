/**
 * UniXcoder Model Implementation
 * 
 * Microsoft UniXcoder model for multi-language code representation.
 * Designed for unified cross-language code understanding and generation.
 * 
 * Features:
 * - Cross-language code embeddings
 * - Multi-task learning architecture
 * - Support for code summarization and generation
 * - Enhanced cross-language semantic similarity
 */

import { HfInference } from '@huggingface/inference';
import {
  EmbeddingModelInterface,
  EmbeddingModel,
  EmbeddingModelType,
  SupportedLanguage
} from '../../../../shared/types/codebase.js';

export class UniXcoderModel implements EmbeddingModelInterface {
  public readonly name = 'unixcoder';
  public readonly modelType = EmbeddingModelType.UNIXCODER;
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
  private readonly modelId = 'microsoft/unixcoder-base';
  private readonly maxLength: number;
  private readonly batchSize: number;
  private readonly crossLanguage: boolean;

  constructor(
    private config: EmbeddingModel,
    private apiKeys: Record<string, string>
  ) {
    this.maxLength = config.modelConfig.max_length || 512;
    this.batchSize = config.modelConfig.batch_size || 24;
    this.crossLanguage = config.modelConfig.cross_language || true;
  }

  /**
   * Initialize the UniXcoder model
   */
  async initialize(): Promise<void> {
    try {
      const huggingfaceToken = this.apiKeys.huggingface || process.env.HUGGINGFACE_API_KEY;
      if (!huggingfaceToken) {
        throw new Error('Hugging Face API key is required for UniXcoder model');
      }

      this.hf = new HfInference(huggingfaceToken);
      
      // Test the model with a simple query
      await this.testConnection();
      
      this.isInitialized = true;
      console.log(`UniXcoder model initialized successfully`);
    } catch (error) {
      console.error('Failed to initialize UniXcoder model:', error);
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
        inputs: this.formatUniXcoderInput('function test() { return 1; }', 'javascript')
      });
    } catch (error) {
      console.error('UniXcoder connection test failed:', error);
      throw new Error('Failed to connect to UniXcoder model');
    }
  }

  /**
   * Generate embedding for code content with cross-language awareness
   */
  async generateEmbedding(content: string, metadata?: Record<string, any>): Promise<number[]> {
    if (!this.isReady()) {
      await this.initialize();
    }

    try {
      const formattedInput = this.formatUniXcoderInput(content, metadata?.language);
      
      const result = await this.hf!.featureExtraction({
        model: this.modelId,
        inputs: formattedInput
      });

      // Process with cross-language considerations
      const embedding = this.processCrossLanguageEmbedding(result as number[][], metadata?.language);
      
      return this.normalizeEmbedding(embedding);
    } catch (error) {
      console.error('UniXcoder embedding generation failed:', error);
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
    
    for (let i = 0; i < contents.length; i += this.batchSize) {
      const batch = contents.slice(i, i + this.batchSize);
      const batchMetadata = metadata?.slice(i, i + this.batchSize);
      
      try {
        const preprocessedBatch = batch.map((content, index) => 
          this.formatUniXcoderInput(content, batchMetadata?.[index]?.language)
        );

        const batchResults = await this.hf!.featureExtraction({
          model: this.modelId,
          inputs: preprocessedBatch
        });

        // Process each result with cross-language considerations
        const processedBatch = Array.isArray(batchResults[0][0]) 
          ? (batchResults as number[][][]).map((result, index) => 
              this.normalizeEmbedding(
                this.processCrossLanguageEmbedding(result, batchMetadata?.[index]?.language)
              )
            )
          : [this.normalizeEmbedding(
              this.processCrossLanguageEmbedding(batchResults as number[][], batchMetadata?.[0]?.language)
            )];

        results.push(...processedBatch);
      } catch (error) {
        console.error(`UniXcoder batch processing failed for batch starting at ${i}:`, error);
        
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
   * Format input for UniXcoder with cross-language considerations
   */
  private formatUniXcoderInput(content: string, language?: string): string {
    let processed = this.preprocessCode(content);

    // Add language-specific formatting for cross-language understanding
    if (this.crossLanguage && language) {
      processed = this.addCrossLanguageMarkers(processed, language);
    }

    return processed;
  }

  /**
   * Preprocess code content for UniXcoder
   */
  private preprocessCode(content: string): string {
    let processed = content;

    // Normalize whitespace while preserving code structure
    processed = processed.replace(/\r\n/g, '\n');
    processed = processed.replace(/\t/g, '  ');
    processed = processed.replace(/\n\s*\n\s*\n/g, '\n\n');

    // Intelligent truncation for multi-language content
    const maxChars = this.maxLength * 4;
    if (processed.length > maxChars) {
      processed = this.crossLanguageTruncate(processed, maxChars);
    }

    return processed;
  }

  /**
   * Add cross-language markers for better understanding
   */
  private addCrossLanguageMarkers(content: string, language: string): string {
    let enhanced = content;

    // Add language identifier
    enhanced = `<${language.toUpperCase()}>\n${enhanced}\n</${language.toUpperCase()}>`;

    // Add semantic markers for common programming constructs
    const languageMarkers = this.getLanguageSemanticMarkers(language);
    
    for (const [pattern, marker] of languageMarkers) {
      enhanced = enhanced.replace(pattern, `${marker}$&`);
    }

    return enhanced;
  }

  /**
   * Get language-specific semantic markers
   */
  private getLanguageSemanticMarkers(language: string): Array<[RegExp, string]> {
    const commonMarkers: Array<[RegExp, string]> = [
      [/\bfunction\b/g, '<FUNC>'],
      [/\bclass\b/g, '<CLASS>'],
      [/\bif\b/g, '<COND>'],
      [/\bfor\b/g, '<LOOP>'],
      [/\bwhile\b/g, '<LOOP>'],
      [/\breturn\b/g, '<RET>']
    ];

    const languageSpecific: Record<string, Array<[RegExp, string]>> = {
      python: [
        [/\bdef\b/g, '<FUNC>'],
        [/\bclass\b/g, '<CLASS>'],
        [/\belif\b/g, '<COND>'],
        [/\btry\b/g, '<EXCEPT>'],
        [/\bexcept\b/g, '<EXCEPT>']
      ],
      java: [
        [/\bpublic\s+static\s+void\s+main\b/g, '<MAIN>'],
        [/\bpublic\s+class\b/g, '<CLASS>'],
        [/\binterface\b/g, '<INTERFACE>'],
        [/\bthrows\b/g, '<EXCEPT>']
      ],
      javascript: [
        [/\basync\s+function\b/g, '<ASYNC_FUNC>'],
        [/\bconst\s+\w+\s*=/g, '<CONST>'],
        [/\blet\s+\w+\s*=/g, '<VAR>'],
        [/\bvar\s+\w+\s*=/g, '<VAR>']
      ],
      typescript: [
        [/\binterface\b/g, '<INTERFACE>'],
        [/\btype\b/g, '<TYPE>'],
        [/\benum\b/g, '<ENUM>'],
        [/\basync\s+function\b/g, '<ASYNC_FUNC>']
      ]
    };

    return [...commonMarkers, ...(languageSpecific[language.toLowerCase()] || [])];
  }

  /**
   * Cross-language aware truncation
   */
  private crossLanguageTruncate(content: string, maxLength: number): string {
    if (content.length <= maxLength) {
      return content;
    }

    // Find semantic boundaries across languages
    const semanticBoundaries = [
      /\n\s*(function|def|class|interface|struct)\s+\w+/g,
      /\n\s*\/\*[\s\S]*?\*\//g, // Block comments
      /\n\s*\/\/.*$/gm, // Line comments
      /\n\s*#.*$/gm, // Python comments
      /\n\s*"""[\s\S]*?"""/g, // Python docstrings
      /\n\s*(if|while|for|switch)\s*\(/g
    ];

    let bestCutPoint = maxLength;
    
    for (const boundary of semanticBoundaries) {
      let match;
      boundary.lastIndex = 0;
      while ((match = boundary.exec(content)) !== null) {
        if (match.index < maxLength && match.index > maxLength - 200) {
          bestCutPoint = Math.min(bestCutPoint, match.index);
        }
      }
    }

    if (bestCutPoint < maxLength - 100) {
      return content.substring(0, bestCutPoint);
    }

    // Fallback to line boundary
    const truncated = content.substring(0, maxLength);
    const lastNewline = truncated.lastIndexOf('\n');
    return lastNewline > maxLength * 0.8 ? truncated.substring(0, lastNewline) : truncated;
  }

  /**
   * Process embeddings with cross-language considerations
   */
  private processCrossLanguageEmbedding(tokenEmbeddings: number[][], language?: string): number[] {
    if (tokenEmbeddings.length === 0) {
      return new Array(this.dimension).fill(0);
    }

    const embeddingDim = tokenEmbeddings[0].length;
    let pooledEmbedding = new Array(embeddingDim).fill(0);

    if (this.crossLanguage) {
      // Apply language-aware pooling
      pooledEmbedding = this.languageAwarePooling(tokenEmbeddings, language);
    } else {
      // Standard mean pooling
      pooledEmbedding = this.meanPooling(tokenEmbeddings);
    }

    return pooledEmbedding;
  }

  /**
   * Language-aware pooling for cross-language understanding
   */
  private languageAwarePooling(tokenEmbeddings: number[][], language?: string): number[] {
    const embeddingDim = tokenEmbeddings[0].length;
    const pooledEmbedding = new Array(embeddingDim).fill(0);
    
    // Define attention weights based on token position and language
    const weights = this.calculateLanguageAwareWeights(tokenEmbeddings.length, language);
    let totalWeight = 0;

    for (let i = 0; i < tokenEmbeddings.length; i++) {
      const weight = weights[i];
      totalWeight += weight;

      for (let j = 0; j < embeddingDim; j++) {
        pooledEmbedding[j] += tokenEmbeddings[i][j] * weight;
      }
    }

    // Normalize by total weight
    if (totalWeight > 0) {
      for (let i = 0; i < embeddingDim; i++) {
        pooledEmbedding[i] /= totalWeight;
      }
    }

    return pooledEmbedding;
  }

  /**
   * Calculate language-aware attention weights
   */
  private calculateLanguageAwareWeights(tokenCount: number, language?: string): number[] {
    const weights = new Array(tokenCount).fill(1);

    if (!language) {
      return weights;
    }

    // Adjust weights based on language-specific patterns
    const languageWeightings: Record<string, (pos: number, total: number) => number> = {
      python: (pos, total) => {
        // Python functions/classes usually at beginning
        const normalized = pos / total;
        return normalized < 0.3 ? 1.5 : (normalized > 0.8 ? 0.7 : 1.0);
      },
      javascript: (pos, total) => {
        // JavaScript functions can be anywhere
        return 1.0;
      },
      java: (pos, total) => {
        // Java methods usually in middle sections
        const normalized = pos / total;
        return normalized > 0.2 && normalized < 0.8 ? 1.3 : 0.9;
      }
    };

    const weightFunc = languageWeightings[language.toLowerCase()];
    if (weightFunc) {
      for (let i = 0; i < tokenCount; i++) {
        weights[i] = weightFunc(i, tokenCount);
      }
    }

    return weights;
  }

  /**
   * Standard mean pooling
   */
  private meanPooling(tokenEmbeddings: number[][]): number[] {
    const embeddingDim = tokenEmbeddings[0].length;
    const meanEmbedding = new Array(embeddingDim).fill(0);

    for (const embedding of tokenEmbeddings) {
      for (let i = 0; i < embeddingDim; i++) {
        meanEmbedding[i] += embedding[i];
      }
    }

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
    console.log('UniXcoder model cleaned up');
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