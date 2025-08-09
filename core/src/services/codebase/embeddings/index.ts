/**
 * Code Embeddings Module
 * 
 * Exports all embedding-related services and models for code semantic search.
 */

// Core services
export { EmbeddingModelManager } from './model-manager.js';

// Individual model implementations
export { CodeBertModel } from './models/codebert-model.js';
export { GraphCodeBertModel } from './models/graphcodebert-model.js';
export { UniXcoderModel } from './models/unixcoder-model.js';
export { OpenAIModel } from './models/openai-model.js';
export { LocalModel } from './models/local-model.js';

// Types and interfaces
export type {
  EmbeddingConfig,
  ModelMetadata,
  ModelInfo,
  EmbeddingResult
} from './model-manager.js';