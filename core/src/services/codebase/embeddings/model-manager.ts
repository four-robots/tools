/**
 * Embedding Model Manager
 * 
 * Manages multiple embedding models for code embeddings generation.
 * Supports loading, unloading, and using different embedding models
 * including CodeBERT, GraphCodeBERT, UniXcoder, and custom models.
 * 
 * Features:
 * - Model lifecycle management (load/unload)
 * - Batch embedding generation
 * - Model selection and fallback
 * - Performance monitoring
 * - Memory management
 */

import { DatabaseManager } from '../../../utils/database.js';
import {
  EmbeddingModel,
  EmbeddingModelInterface,
  EmbeddingModelType,
  SupportedLanguage,
  embeddingModelSchema
} from '../../../shared/types/codebase.js';
import { CodeBertModel } from './models/codebert-model.js';
import { GraphCodeBertModel } from './models/graphcodebert-model.js';
import { UniXcoderModel } from './models/unixcoder-model.js';
import { OpenAIModel } from './models/openai-model.js';
import { LocalModel } from './models/local-model.js';

export interface EmbeddingConfig {
  defaultModel: string;
  maxConcurrentModels: number;
  modelCacheTTL: number;
  apiKeys: Record<string, string>;
  localModelPath?: string;
  memoryThreshold: number;
}

export interface ModelMetadata {
  language?: SupportedLanguage;
  contextType?: string;
  includeStructure?: boolean;
  customParams?: Record<string, any>;
}

export interface ModelInfo {
  name: string;
  version: string;
  dimension: number;
  maxTokens: number;
  supportedLanguages: SupportedLanguage[];
  memoryUsage: number;
  avgInferenceTime: number;
  isLoaded: boolean;
}

export interface EmbeddingResult {
  chunkId: string;
  embedding: number[];
  confidence: number;
  modelUsed: string;
  processingTime: number;
  error?: string;
}

export class EmbeddingModelManager {
  private loadedModels = new Map<string, EmbeddingModelInterface>();
  private modelConfigurations = new Map<string, EmbeddingModel>();
  private modelLoadTimes = new Map<string, number>();
  private modelUsageStats = new Map<string, { requests: number; totalTime: number }>();

  constructor(
    private db: DatabaseManager,
    private config: EmbeddingConfig
  ) {}

  // ===================
  // MODEL LIFECYCLE MANAGEMENT
  // ===================

  /**
   * Initialize the model manager and load default models
   */
  async initialize(): Promise<void> {
    try {
      // Load model configurations from database
      await this.loadModelConfigurations();
      
      // Load the default model
      if (this.config.defaultModel) {
        await this.loadModel(this.config.defaultModel);
      }

      console.log('Embedding model manager initialized successfully');
    } catch (error) {
      console.error('Failed to initialize embedding model manager:', error);
      throw error;
    }
  }

  /**
   * Load model configurations from database
   */
  private async loadModelConfigurations(): Promise<void> {
    const query = `
      SELECT * FROM embedding_models 
      WHERE is_active = true 
      ORDER BY is_default DESC, name ASC
    `;
    
    const results = await this.db.executeQuery(query);
    
    for (const row of results.rows) {
      const model = embeddingModelSchema.parse({
        id: row.id,
        name: row.name,
        displayName: row.display_name,
        description: row.description,
        modelType: row.model_type,
        embeddingDimension: row.embedding_dimension,
        supportedLanguages: row.supported_languages || [],
        modelConfig: row.model_config || {},
        apiEndpoint: row.api_endpoint,
        localPath: row.local_path,
        isActive: row.is_active,
        isDefault: row.is_default,
        performanceMetrics: row.performance_metrics || {},
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at)
      });
      
      this.modelConfigurations.set(model.name, model);
    }
  }

  /**
   * Load a specific model by name
   */
  async loadModel(modelName: string): Promise<EmbeddingModelInterface> {
    if (this.loadedModels.has(modelName)) {
      return this.loadedModels.get(modelName)!;
    }

    const config = this.modelConfigurations.get(modelName);
    if (!config) {
      throw new Error(`Model configuration not found: ${modelName}`);
    }

    // Check memory threshold
    if (this.loadedModels.size >= this.config.maxConcurrentModels) {
      await this.unloadLeastUsedModel();
    }

    const startTime = Date.now();
    let model: EmbeddingModelInterface;

    try {
      // Create model instance based on type
      switch (config.modelType) {
        case EmbeddingModelType.CODEBERT:
          model = new CodeBertModel(config, this.config.apiKeys);
          break;
        case EmbeddingModelType.GRAPHCODEBERT:
          model = new GraphCodeBertModel(config, this.config.apiKeys);
          break;
        case EmbeddingModelType.UNIXCODER:
          model = new UniXcoderModel(config, this.config.apiKeys);
          break;
        case EmbeddingModelType.OPENAI:
          model = new OpenAIModel(config, this.config.apiKeys);
          break;
        case EmbeddingModelType.CUSTOM:
          model = new LocalModel(config, this.config.localModelPath || '');
          break;
        default:
          throw new Error(`Unsupported model type: ${config.modelType}`);
      }

      await model.initialize();
      
      this.loadedModels.set(modelName, model);
      this.modelLoadTimes.set(modelName, Date.now() - startTime);
      this.modelUsageStats.set(modelName, { requests: 0, totalTime: 0 });

      console.log(`Model loaded successfully: ${modelName} (${Date.now() - startTime}ms)`);
      return model;
    } catch (error) {
      console.error(`Failed to load model ${modelName}:`, error);
      throw error;
    }
  }

  /**
   * Unload a specific model
   */
  async unloadModel(modelName: string): Promise<void> {
    const model = this.loadedModels.get(modelName);
    if (!model) {
      return;
    }

    try {
      await model.cleanup();
      this.loadedModels.delete(modelName);
      this.modelLoadTimes.delete(modelName);
      
      console.log(`Model unloaded: ${modelName}`);
    } catch (error) {
      console.error(`Failed to unload model ${modelName}:`, error);
      throw error;
    }
  }

  /**
   * Unload the least recently used model
   */
  private async unloadLeastUsedModel(): Promise<void> {
    let leastUsedModel = '';
    let minRequests = Infinity;

    for (const [modelName, stats] of this.modelUsageStats) {
      if (stats.requests < minRequests) {
        minRequests = stats.requests;
        leastUsedModel = modelName;
      }
    }

    if (leastUsedModel) {
      await this.unloadModel(leastUsedModel);
    }
  }

  /**
   * Get list of available models
   */
  getAvailableModels(): string[] {
    return Array.from(this.modelConfigurations.keys());
  }

  /**
   * Get list of loaded models
   */
  getLoadedModels(): string[] {
    return Array.from(this.loadedModels.keys());
  }

  // ===================
  // EMBEDDING GENERATION
  // ===================

  /**
   * Generate embedding using specified or default model
   */
  async generateEmbedding(
    content: string,
    modelName?: string,
    metadata?: ModelMetadata
  ): Promise<number[]> {
    const selectedModel = modelName || this.config.defaultModel;
    if (!selectedModel) {
      throw new Error('No model specified and no default model configured');
    }

    const model = await this.loadModel(selectedModel);
    const startTime = Date.now();

    try {
      const embedding = await model.generateEmbedding(content, metadata);
      
      // Update usage statistics
      const stats = this.modelUsageStats.get(selectedModel)!;
      stats.requests += 1;
      stats.totalTime += Date.now() - startTime;

      return embedding;
    } catch (error) {
      console.error(`Embedding generation failed for model ${selectedModel}:`, error);
      throw error;
    }
  }

  /**
   * Generate embeddings in batch
   */
  async batchGenerateEmbeddings(
    contents: string[],
    modelName?: string,
    metadata?: ModelMetadata[]
  ): Promise<number[][]> {
    const selectedModel = modelName || this.config.defaultModel;
    if (!selectedModel) {
      throw new Error('No model specified and no default model configured');
    }

    const model = await this.loadModel(selectedModel);
    const startTime = Date.now();

    try {
      const embeddings = await model.batchGenerateEmbeddings(contents, metadata);
      
      // Update usage statistics
      const stats = this.modelUsageStats.get(selectedModel)!;
      stats.requests += contents.length;
      stats.totalTime += Date.now() - startTime;

      return embeddings;
    } catch (error) {
      console.error(`Batch embedding generation failed for model ${selectedModel}:`, error);
      throw error;
    }
  }

  /**
   * Generate embeddings with automatic fallback
   */
  async generateEmbeddingWithFallback(
    content: string,
    primaryModel?: string,
    metadata?: ModelMetadata
  ): Promise<EmbeddingResult> {
    const models = primaryModel 
      ? [primaryModel, this.config.defaultModel]
      : [this.config.defaultModel];

    let lastError: Error | undefined;
    
    for (const modelName of models) {
      if (!modelName) continue;
      
      try {
        const startTime = Date.now();
        const embedding = await this.generateEmbedding(content, modelName, metadata);
        
        return {
          chunkId: '', // Set by caller
          embedding,
          confidence: this.calculateConfidence(embedding, modelName),
          modelUsed: modelName,
          processingTime: Date.now() - startTime
        };
      } catch (error) {
        console.warn(`Model ${modelName} failed, trying fallback:`, error);
        lastError = error as Error;
      }
    }

    throw lastError || new Error('All embedding models failed');
  }

  // ===================
  // MODEL INFORMATION
  // ===================

  /**
   * Get detailed information about a model
   */
  async getModelInfo(modelName: string): Promise<ModelInfo> {
    const config = this.modelConfigurations.get(modelName);
    if (!config) {
      throw new Error(`Model not found: ${modelName}`);
    }

    const model = this.loadedModels.get(modelName);
    const stats = this.modelUsageStats.get(modelName);
    
    return {
      name: config.name,
      version: config.modelConfig.model_version || '1.0',
      dimension: config.embeddingDimension,
      maxTokens: config.modelConfig.max_length || 512,
      supportedLanguages: config.supportedLanguages,
      memoryUsage: config.performanceMetrics.memory_usage_mb || 0,
      avgInferenceTime: stats ? stats.totalTime / Math.max(stats.requests, 1) : 0,
      isLoaded: !!model
    };
  }

  /**
   * Check if model supports a specific language
   */
  async validateModelCompatibility(modelName: string, language: string): Promise<boolean> {
    const config = this.modelConfigurations.get(modelName);
    if (!config) {
      return false;
    }

    return config.supportedLanguages.some(lang => lang === language);
  }

  /**
   * Get optimal model for a specific language
   */
  getOptimalModelForLanguage(language: SupportedLanguage): string | null {
    let bestModel: string | null = null;
    let highestAccuracy = 0;

    for (const [modelName, config] of this.modelConfigurations) {
      if (config.supportedLanguages.includes(language)) {
        const accuracy = config.performanceMetrics.accuracy_score || 0;
        if (accuracy > highestAccuracy) {
          highestAccuracy = accuracy;
          bestModel = modelName;
        }
      }
    }

    return bestModel || this.config.defaultModel;
  }

  // ===================
  // UTILITY METHODS
  // ===================

  /**
   * Calculate confidence score for an embedding
   */
  private calculateConfidence(embedding: number[], modelName: string): number {
    const config = this.modelConfigurations.get(modelName);
    const baseConfidence = config?.performanceMetrics.accuracy_score || 0.8;
    
    // Factor in embedding magnitude and distribution
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    const normalized = embedding.map(val => val / magnitude);
    const entropy = -normalized.reduce((sum, val) => {
      if (val !== 0) {
        return sum + val * Math.log2(Math.abs(val));
      }
      return sum;
    }, 0);
    
    // Combine base confidence with embedding quality metrics
    return Math.min(1.0, baseConfidence + (entropy / 100));
  }

  /**
   * Get usage statistics for all models
   */
  getUsageStatistics(): Record<string, any> {
    const stats: Record<string, any> = {};
    
    for (const [modelName, usage] of this.modelUsageStats) {
      stats[modelName] = {
        requests: usage.requests,
        totalTimeMs: usage.totalTime,
        avgTimeMs: usage.requests > 0 ? usage.totalTime / usage.requests : 0,
        isLoaded: this.loadedModels.has(modelName)
      };
    }
    
    return stats;
  }

  /**
   * Cleanup all models and resources
   */
  async cleanup(): Promise<void> {
    const cleanupPromises = Array.from(this.loadedModels.keys()).map(modelName =>
      this.unloadModel(modelName)
    );
    
    await Promise.allSettled(cleanupPromises);
    
    this.loadedModels.clear();
    this.modelConfigurations.clear();
    this.modelLoadTimes.clear();
    this.modelUsageStats.clear();
  }

  /**
   * Health check for all loaded models
   */
  async healthCheck(): Promise<Record<string, boolean>> {
    const health: Record<string, boolean> = {};
    
    for (const [modelName, model] of this.loadedModels) {
      try {
        health[modelName] = model.isReady();
      } catch (error) {
        console.error(`Health check failed for model ${modelName}:`, error);
        health[modelName] = false;
      }
    }
    
    return health;
  }
}