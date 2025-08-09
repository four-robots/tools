/**
 * Local Model Implementation
 * 
 * Local model wrapper for ONNX or TensorFlow.js models.
 * Supports on-premise deployment and custom fine-tuned models.
 * 
 * Features:
 * - Local model inference
 * - ONNX runtime support
 * - Custom model loading
 * - No API dependencies
 */

import * as ort from 'onnxruntime-node';
import * as tf from '@tensorflow/tfjs-node';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  EmbeddingModelInterface,
  EmbeddingModel,
  EmbeddingModelType,
  SupportedLanguage
} from '../../../../shared/types/codebase.js';

interface LocalModelConfig {
  modelPath: string;
  vocabPath?: string;
  modelType: 'onnx' | 'tensorflow' | 'custom';
  inputName?: string;
  outputName?: string;
  maxLength?: number;
  dimension?: number;
}

export class LocalModel implements EmbeddingModelInterface {
  public readonly name = 'local-model';
  public readonly modelType = EmbeddingModelType.CUSTOM;
  public readonly dimension: number;
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

  private onnxSession: ort.InferenceSession | null = null;
  private tfModel: tf.LayersModel | null = null;
  private vocabulary: Map<string, number> = new Map();
  private isInitialized = false;
  private readonly localConfig: LocalModelConfig;

  constructor(
    private config: EmbeddingModel,
    private basePath: string
  ) {
    this.localConfig = {
      modelPath: path.join(basePath, config.localPath || 'model.onnx'),
      vocabPath: path.join(basePath, 'vocab.json'),
      modelType: config.modelConfig.model_type || 'onnx',
      inputName: config.modelConfig.input_name || 'input_ids',
      outputName: config.modelConfig.output_name || 'last_hidden_state',
      maxLength: config.modelConfig.max_length || 512,
      dimension: config.embeddingDimension || 768
    };
    
    this.dimension = this.localConfig.dimension!;
  }

  /**
   * Initialize the local model
   */
  async initialize(): Promise<void> {
    try {
      console.log(`Initializing local model: ${this.localConfig.modelPath}`);

      // Check if model file exists
      await this.validateModelPath();

      // Load vocabulary if available
      await this.loadVocabulary();

      // Initialize based on model type
      switch (this.localConfig.modelType) {
        case 'onnx':
          await this.initializeONNX();
          break;
        case 'tensorflow':
          await this.initializeTensorFlow();
          break;
        case 'custom':
          await this.initializeCustom();
          break;
        default:
          throw new Error(`Unsupported local model type: ${this.localConfig.modelType}`);
      }

      // Test the model
      await this.testModel();

      this.isInitialized = true;
      console.log('Local model initialized successfully');
    } catch (error) {
      console.error('Failed to initialize local model:', error);
      throw error;
    }
  }

  /**
   * Validate model path exists
   */
  private async validateModelPath(): Promise<void> {
    try {
      await fs.access(this.localConfig.modelPath);
    } catch (error) {
      throw new Error(`Model file not found: ${this.localConfig.modelPath}`);
    }
  }

  /**
   * Load vocabulary from JSON file
   */
  private async loadVocabulary(): Promise<void> {
    if (!this.localConfig.vocabPath) {
      console.warn('No vocabulary path specified, using basic tokenization');
      return;
    }

    try {
      const vocabData = await fs.readFile(this.localConfig.vocabPath, 'utf-8');
      const vocab = JSON.parse(vocabData);
      
      this.vocabulary = new Map(Object.entries(vocab));
      console.log(`Loaded vocabulary with ${this.vocabulary.size} tokens`);
    } catch (error) {
      console.warn('Could not load vocabulary, using basic tokenization:', error);
    }
  }

  /**
   * Initialize ONNX model
   */
  private async initializeONNX(): Promise<void> {
    try {
      this.onnxSession = await ort.InferenceSession.create(this.localConfig.modelPath, {
        executionProviders: ['cpu'], // Can be extended to support GPU
        logSeverityLevel: 3 // Warning level
      });
      
      console.log('ONNX session created successfully');
    } catch (error) {
      throw new Error(`Failed to create ONNX session: ${error}`);
    }
  }

  /**
   * Initialize TensorFlow model
   */
  private async initializeTensorFlow(): Promise<void> {
    try {
      this.tfModel = await tf.loadLayersModel(`file://${this.localConfig.modelPath}`);
      console.log('TensorFlow model loaded successfully');
    } catch (error) {
      throw new Error(`Failed to load TensorFlow model: ${error}`);
    }
  }

  /**
   * Initialize custom model (placeholder for future implementations)
   */
  private async initializeCustom(): Promise<void> {
    // Placeholder for custom model initialization
    throw new Error('Custom model type not yet implemented');
  }

  /**
   * Test model with a simple input
   */
  private async testModel(): Promise<void> {
    try {
      const testInput = 'function test() { return 1; }';
      await this.generateEmbedding(testInput);
      console.log('Model test completed successfully');
    } catch (error) {
      throw new Error(`Model test failed: ${error}`);
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
      // Tokenize input
      const tokens = this.tokenizeCode(content);
      
      // Generate embedding based on model type
      switch (this.localConfig.modelType) {
        case 'onnx':
          return await this.generateONNXEmbedding(tokens);
        case 'tensorflow':
          return await this.generateTensorFlowEmbedding(tokens);
        case 'custom':
          return await this.generateCustomEmbedding(tokens);
        default:
          throw new Error(`Unsupported model type: ${this.localConfig.modelType}`);
      }
    } catch (error) {
      console.error('Local model embedding generation failed:', error);
      throw error;
    }
  }

  /**
   * Generate embeddings in batch
   */
  async batchGenerateEmbeddings(
    contents: string[],
    metadata?: Record<string, any>[]
  ): Promise<number[][]> {
    if (!this.isReady()) {
      await this.initialize();
    }

    // For local models, process in parallel for better performance
    const batchSize = 8; // Reasonable batch size for local processing
    const results: number[][] = [];

    for (let i = 0; i < contents.length; i += batchSize) {
      const batch = contents.slice(i, i + batchSize);
      const batchMetadata = metadata?.slice(i, i + batchSize);

      const batchPromises = batch.map((content, index) =>
        this.generateEmbedding(content, batchMetadata?.[index])
      );

      try {
        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);
      } catch (error) {
        console.error(`Batch processing failed at index ${i}:`, error);
        
        // Fallback to sequential processing for this batch
        const fallbackResults: number[][] = [];
        for (let j = 0; j < batch.length; j++) {
          try {
            const result = await this.generateEmbedding(batch[j], batchMetadata?.[j]);
            fallbackResults.push(result);
          } catch (err) {
            console.error(`Individual processing failed for item ${i + j}:`, err);
            fallbackResults.push(new Array(this.dimension).fill(0));
          }
        }
        results.push(...fallbackResults);
      }
    }

    return results;
  }

  /**
   * Tokenize code content
   */
  private tokenizeCode(content: string): number[] {
    // Basic tokenization - can be enhanced with proper tokenizer
    const preprocessed = content
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(token => token.length > 0);

    const tokens: number[] = [101]; // [CLS] token
    
    for (const token of preprocessed.slice(0, this.localConfig.maxLength! - 2)) {
      const tokenId = this.vocabulary.get(token) || 100; // [UNK] token
      tokens.push(tokenId);
    }
    
    tokens.push(102); // [SEP] token

    // Pad to max length
    while (tokens.length < this.localConfig.maxLength!) {
      tokens.push(0); // [PAD] token
    }

    return tokens.slice(0, this.localConfig.maxLength!);
  }

  /**
   * Generate embedding using ONNX
   */
  private async generateONNXEmbedding(tokens: number[]): Promise<number[]> {
    if (!this.onnxSession) {
      throw new Error('ONNX session not initialized');
    }

    try {
      const inputTensor = new ort.Tensor('int64', BigInt64Array.from(tokens.map(t => BigInt(t))), [1, tokens.length]);
      
      const feeds: Record<string, ort.Tensor> = {};
      feeds[this.localConfig.inputName!] = inputTensor;

      const output = await this.onnxSession.run(feeds);
      const outputTensor = output[this.localConfig.outputName!];
      
      if (!outputTensor) {
        throw new Error(`Output tensor ${this.localConfig.outputName} not found`);
      }

      // Extract embedding (mean pooling of last hidden states)
      const embeddings = outputTensor.data as Float32Array;
      const embeddingDim = embeddings.length / tokens.length;
      
      const meanEmbedding = new Array(embeddingDim).fill(0);
      for (let i = 0; i < tokens.length; i++) {
        for (let j = 0; j < embeddingDim; j++) {
          meanEmbedding[j] += embeddings[i * embeddingDim + j];
        }
      }

      // Calculate mean and normalize
      for (let i = 0; i < embeddingDim; i++) {
        meanEmbedding[i] /= tokens.length;
      }

      return this.normalizeEmbedding(meanEmbedding);
    } catch (error) {
      throw new Error(`ONNX inference failed: ${error}`);
    }
  }

  /**
   * Generate embedding using TensorFlow
   */
  private async generateTensorFlowEmbedding(tokens: number[]): Promise<number[]> {
    if (!this.tfModel) {
      throw new Error('TensorFlow model not initialized');
    }

    try {
      const inputTensor = tf.tensor2d([tokens], [1, tokens.length]);
      
      const output = this.tfModel.predict(inputTensor) as tf.Tensor;
      const embeddings = await output.data();
      
      inputTensor.dispose();
      output.dispose();

      // Convert to array and perform mean pooling if needed
      const embeddingArray = Array.from(embeddings);
      const embeddingDim = embeddingArray.length / tokens.length;
      
      if (embeddingDim === this.dimension) {
        // Already pooled
        return this.normalizeEmbedding(embeddingArray);
      } else {
        // Perform mean pooling
        const meanEmbedding = new Array(embeddingDim).fill(0);
        for (let i = 0; i < tokens.length; i++) {
          for (let j = 0; j < embeddingDim; j++) {
            meanEmbedding[j] += embeddingArray[i * embeddingDim + j];
          }
        }

        for (let i = 0; i < embeddingDim; i++) {
          meanEmbedding[i] /= tokens.length;
        }

        return this.normalizeEmbedding(meanEmbedding);
      }
    } catch (error) {
      throw new Error(`TensorFlow inference failed: ${error}`);
    }
  }

  /**
   * Generate embedding using custom method
   */
  private async generateCustomEmbedding(tokens: number[]): Promise<number[]> {
    // Placeholder for custom embedding generation
    throw new Error('Custom embedding generation not implemented');
  }

  /**
   * Normalize embedding to unit length
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
    try {
      if (this.onnxSession) {
        await this.onnxSession.release();
        this.onnxSession = null;
      }

      if (this.tfModel) {
        this.tfModel.dispose();
        this.tfModel = null;
      }

      this.vocabulary.clear();
      this.isInitialized = false;
      
      console.log('Local model cleaned up');
    } catch (error) {
      console.error('Error during local model cleanup:', error);
    }
  }

  /**
   * Check if model is ready
   */
  isReady(): boolean {
    return this.isInitialized && (
      this.onnxSession !== null || 
      this.tfModel !== null
    );
  }

  /**
   * Get model information
   */
  getModelInfo() {
    return {
      name: this.name,
      version: '1.0',
      dimension: this.dimension,
      maxTokens: this.localConfig.maxLength || 512,
      supportedLanguages: this.supportedLanguages
    };
  }
}