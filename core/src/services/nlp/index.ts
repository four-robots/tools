/**
 * NLP Query Processing Service
 * 
 * This module provides comprehensive natural language processing capabilities for query understanding,
 * intent classification, entity extraction, and intelligent query expansion.
 */

// Core services
export { LLMService } from './llm-service.js';
export type { LLMResponse } from './llm-service.js';

export { IntentClassifier } from './intent-classifier.js';
export type { IntentFeatures } from './intent-classifier.js';

export { EntityExtractor } from './entity-extractor.js';
export type { EntityExtractionOptions } from './entity-extractor.js';

export { NLPQueryProcessor } from './nlp-query-processor.js';
export type { 
  NLPProcessingOptions,
  CacheService 
} from './nlp-query-processor.js';

// Repository
export { NLPCacheRepository } from './repositories/nlp-cache-repository.js';
export type {
  CacheQueryOptions,
  CacheStatistics
} from './repositories/nlp-cache-repository.js';

// Re-export types from shared types
export type {
  // Main types
  ProcessedQuery,
  QueryContext,
  ProcessQueryRequest,
  ProcessQueryResponse,
  
  // Intent types
  QueryIntent,
  IntentClassification,
  IntentSuggestion,
  IntentFeedback,
  IntentTrainingData,
  
  // Entity types
  NamedEntity,
  TechnicalEntity,
  EnrichedEntity,
  EntityType,
  EntityLink,
  AbbreviationResolution,
  
  // Query expansion types
  QueryExpansion,
  RelatedQuery,
  SpellCorrection,
  
  // Language types
  LanguageDetection,
  
  // Configuration types
  LLMConfig,
  LLMProvider,
  
  // Search types
  SearchStrategy,
  ContentType,
  QueryUnderstanding,
  
  // Database types
  QueryProcessingCache,
  QueryFeedback,
  NLPModel,
  
  // Performance types
  ProcessingMetrics
} from '../../shared/types/nlp.js';

/**
 * Factory function to create a complete NLP processing pipeline
 */
export function createNLPProcessor(options: {
  database?: DatabaseManager;
  cacheService?: CacheService;
  llmConfigs?: LLMConfig[];
}) {
  return new NLPQueryProcessor(
    options.database,
    options.cacheService,
    options.llmConfigs || []
  );
}

/**
 * Factory function to create NLP services individually
 */
export function createNLPServices(options: {
  database?: DatabaseManager;
  llmConfigs?: LLMConfig[];
}) {
  const llmService = new LLMService(options.database, options.llmConfigs || []);
  const intentClassifier = new IntentClassifier(llmService, options.database);
  const entityExtractor = new EntityExtractor(llmService, options.database);
  
  return {
    llmService,
    intentClassifier,
    entityExtractor
  };
}

/**
 * Utility function to validate NLP processing configuration
 */
export function validateNLPConfig(configs: LLMConfig[]): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (configs.length === 0) {
    errors.push('No LLM configurations provided');
  }

  const providerCounts = new Map<string, number>();

  for (const config of configs) {
    // Check required fields
    if (!config.provider) {
      errors.push('LLM config missing provider');
    }

    if (!config.model) {
      errors.push(`LLM config for ${config.provider} missing model`);
    }

    // Count providers
    const count = providerCounts.get(config.provider) || 0;
    providerCounts.set(config.provider, count + 1);

    // Check API keys for cloud providers
    if (['openai', 'anthropic', 'google'].includes(config.provider) && !config.apiKey) {
      warnings.push(`${config.provider} configuration missing API key`);
    }

    // Check reasonable parameter values
    if (config.temperature !== undefined && (config.temperature < 0 || config.temperature > 2)) {
      warnings.push(`Temperature ${config.temperature} outside recommended range (0-2) for ${config.provider}`);
    }

    if (config.maxTokens !== undefined && config.maxTokens > 8000) {
      warnings.push(`Max tokens ${config.maxTokens} is very high for ${config.provider}`);
    }
  }

  // Check for redundant providers
  for (const [provider, count] of providerCounts.entries()) {
    if (count > 1) {
      warnings.push(`Multiple configurations found for ${provider} provider`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Helper function to create default LLM configurations
 */
export function createDefaultLLMConfigs(apiKeys: {
  openai?: string;
  anthropic?: string;
  google?: string;
}): LLMConfig[] {
  const configs: LLMConfig[] = [];

  if (apiKeys.openai) {
    configs.push({
      provider: 'openai',
      model: 'gpt-4',
      apiKey: apiKeys.openai,
      temperature: 0.1,
      maxTokens: 1000,
      timeout: 30000,
      retryAttempts: 3,
      systemPrompt: 'You are an expert at understanding technical queries and extracting relevant information.'
    });
  }

  if (apiKeys.anthropic) {
    configs.push({
      provider: 'anthropic',
      model: 'claude-3-haiku-20240307',
      apiKey: apiKeys.anthropic,
      temperature: 0.1,
      maxTokens: 1000,
      timeout: 30000,
      retryAttempts: 3,
      systemPrompt: 'You are an expert at understanding technical queries and extracting relevant information.'
    });
  }

  if (apiKeys.google) {
    configs.push({
      provider: 'google',
      model: 'gemini-pro',
      apiKey: apiKeys.google,
      temperature: 0.1,
      maxTokens: 1000,
      timeout: 30000,
      retryAttempts: 3,
      systemPrompt: 'You are an expert at understanding technical queries and extracting relevant information.'
    });
  }

  return configs;
}

// Import the database manager type
import type { DatabaseManager } from '../../utils/database.js';