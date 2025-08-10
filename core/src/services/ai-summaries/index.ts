/**
 * AI Summaries Service - Main Export
 * 
 * Comprehensive AI-powered summarization service for search results.
 * Includes LLM-based content generation, fact checking, and citation management.
 */

// Main service exports
export { AISummaryService } from './ai-summary-service.js';
export type { AISummaryConfig } from './ai-summary-service.js';

// Core service components
export { SummaryGenerator } from './summary-generator.js';
export { SourceAttributionService } from './source-attribution-service.js';
export { FactChecker } from './fact-checker.js';
export { KeyPointsExtractor } from './key-points-extractor.js';

// Re-export all AI summary types for convenience
export type {
  // Core types
  SearchSummary,
  SummaryType,
  SummaryLength,
  
  // Content and sources
  ContentSource,
  Citation,
  SourceAttribution,
  
  // Key points
  KeyPoint,
  KeyPointCategory,
  
  // Fact checking
  FactCheck,
  FactualAccuracy,
  VerificationMethod,
  
  // Hallucination detection
  HallucinationCheck,
  HallucinationType,
  RiskLevel,
  Recommendation,
  
  // Content synthesis
  SynthesizedContent,
  Comparison,
  ContentGap,
  
  // Answer generation
  GeneratedAnswer,
  AnswerType,
  
  // API types
  GenerateSummaryRequest,
  GenerateSummaryResponse,
  
  // Feedback
  SummaryFeedback,
  
  // Schema objects
  AISummarySchemas
} from '../../shared/types/ai-summaries.js';

/**
 * Default configuration for AI Summary Service
 */
export const DEFAULT_AI_SUMMARY_CONFIG = {
  enableCaching: true,
  enableFactChecking: true,
  enableHallucinationCheck: true,
  maxProcessingTimeMs: 30000, // 30 seconds
  minConfidenceThreshold: 0.7,
  defaultLLMProvider: 'openai',
  cacheTtlMs: 5 * 60 * 1000, // 5 minutes
} as const;

/**
 * Factory function to create AISummaryService with default configuration
 */
export function createAISummaryService(
  llmService: any, // LLMService - importing would create circular dependency
  databaseManager: any, // DatabaseManager
  configOverrides?: Partial<typeof DEFAULT_AI_SUMMARY_CONFIG>
): AISummaryService {
  const config = { ...DEFAULT_AI_SUMMARY_CONFIG, ...configOverrides };
  return new AISummaryService(llmService, databaseManager, config);
}

/**
 * Version information
 */
export const AI_SUMMARY_SERVICE_VERSION = '1.0.0';

/**
 * Service capabilities and features
 */
export const AI_SUMMARY_FEATURES = {
  // Summary generation capabilities
  summaryTypes: [
    'general_summary',
    'answer_generation', 
    'key_points',
    'synthesis',
    'comparison',
    'explanation'
  ],
  
  // Quality assurance features
  qualityFeatures: [
    'fact_checking',
    'hallucination_detection',
    'source_attribution',
    'confidence_scoring',
    'citation_management'
  ],
  
  // Content analysis capabilities
  analysisFeatures: [
    'key_points_extraction',
    'content_synthesis',
    'gap_identification',
    'source_comparison',
    'theme_identification'
  ],
  
  // Supported content types
  supportedContentTypes: [
    'scraped_page',
    'wiki_page',
    'kanban_card',
    'memory_thought',
    'code_file',
    'code_chunk'
  ],
  
  // Available LLM providers
  supportedLLMProviders: [
    'openai',
    'anthropic',
    'google',
    'local'
  ]
} as const;