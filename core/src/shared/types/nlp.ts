import { z } from 'zod';

// Core NLP Processing Types

export const QueryIntentSchema = z.enum([
  'search',           // "find documents about AI"
  'question',         // "what is machine learning?"
  'navigation',       // "go to user settings"
  'comparison',       // "compare React vs Vue"
  'definition',       // "define microservice"
  'tutorial',         // "how to deploy app"
  'troubleshoot'      // "fix database connection error"
]);

export type QueryIntent = z.infer<typeof QueryIntentSchema>;

export const EntityTypeSchema = z.enum([
  'person',
  'organization',
  'technology',
  'programming_language',
  'framework',
  'concept',
  'file_type',
  'date',
  'location',
  'version',
  'url',
  'email',
  'command'
]);

export type EntityType = z.infer<typeof EntityTypeSchema>;

export const ContentTypeSchema = z.enum([
  'documentation',
  'code',
  'tutorial',
  'api_reference',
  'example',
  'troubleshooting',
  'configuration',
  'deployment',
  'testing'
]);

export type ContentType = z.infer<typeof ContentTypeSchema>;

export const SearchStrategySchema = z.enum([
  'semantic',         // Use vector similarity
  'keyword',          // Use traditional text search
  'hybrid',           // Combine semantic + keyword
  'structured',       // Query structured data
  'contextual',       // Use conversation context
  'exploratory'       // Browse and discover
]);

export type SearchStrategy = z.infer<typeof SearchStrategySchema>;

// Named Entity Recognition

export const EntityLinkSchema = z.object({
  linkedId: z.string().uuid().optional(),
  linkedType: z.string().optional(),
  linkedUrl: z.string().url().optional(),
  confidence: z.number().min(0).max(1),
  metadata: z.record(z.unknown()).default({})
});

export type EntityLink = z.infer<typeof EntityLinkSchema>;

export const NamedEntitySchema = z.object({
  text: z.string().min(1),
  type: EntityTypeSchema,
  confidence: z.number().min(0).max(1),
  startIndex: z.number().min(0),
  endIndex: z.number().min(0),
  metadata: z.record(z.unknown()).default({}),
  linkedData: EntityLinkSchema.optional()
});

export type NamedEntity = z.infer<typeof NamedEntitySchema>;

export const TechnicalEntitySchema = NamedEntitySchema.extend({
  category: z.enum(['language', 'framework', 'library', 'tool', 'concept', 'standard']),
  version: z.string().optional(),
  documentation: z.string().url().optional(),
  officialSite: z.string().url().optional()
});

export type TechnicalEntity = z.infer<typeof TechnicalEntitySchema>;

export const EnrichedEntitySchema = NamedEntitySchema.extend({
  synonyms: z.array(z.string()).default([]),
  relatedTerms: z.array(z.string()).default([]),
  description: z.string().optional(),
  wikipediaUrl: z.string().url().optional(),
  officialDocumentation: z.string().url().optional()
});

export type EnrichedEntity = z.infer<typeof EnrichedEntitySchema>;

// Query Expansion

export const QueryExpansionSchema = z.object({
  synonyms: z.array(z.string()).default([]),
  relatedTerms: z.array(z.string()).default([]),
  conceptualTerms: z.array(z.string()).default([]),
  alternativePhrasings: z.array(z.string()).default([]),
  technicalVariations: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1)
});

export type QueryExpansion = z.infer<typeof QueryExpansionSchema>;

export const RelatedQuerySchema = z.object({
  query: z.string().min(1),
  intent: QueryIntentSchema,
  confidence: z.number().min(0).max(1),
  similarity: z.number().min(0).max(1),
  reasoning: z.string().optional()
});

export type RelatedQuery = z.infer<typeof RelatedQuerySchema>;

// Spell Correction

export const SpellCorrectionSchema = z.object({
  original: z.string(),
  corrected: z.string(),
  confidence: z.number().min(0).max(1),
  suggestions: z.array(z.string()).default([])
});

export type SpellCorrection = z.infer<typeof SpellCorrectionSchema>;

export const AbbreviationResolutionSchema = z.object({
  abbreviation: z.string(),
  fullForm: z.string(),
  confidence: z.number().min(0).max(1),
  context: z.string().optional(),
  domain: z.string().optional()
});

export type AbbreviationResolution = z.infer<typeof AbbreviationResolutionSchema>;

// Query Context

export const QueryContextSchema = z.object({
  previousQueries: z.array(z.string()).default([]),
  sessionId: z.string().uuid(),
  userId: z.string().uuid().optional(),
  domain: z.string().optional(),
  timeContext: z.date(),
  locationContext: z.string().optional(),
  conversationTurn: z.number().min(0).default(0),
  userPreferences: z.record(z.unknown()).default({}),
  activeProjects: z.array(z.string()).default([])
});

export type QueryContext = z.infer<typeof QueryContextSchema>;

// Language Support

export const LanguageDetectionSchema = z.object({
  language: z.string().length(2), // ISO 639-1 codes
  confidence: z.number().min(0).max(1),
  alternatives: z.array(z.object({
    language: z.string().length(2),
    confidence: z.number().min(0).max(1)
  })).default([])
});

export type LanguageDetection = z.infer<typeof LanguageDetectionSchema>;

// Intent Classification

export const IntentClassificationSchema = z.object({
  intent: QueryIntentSchema,
  confidence: z.number().min(0).max(1),
  alternatives: z.array(z.object({
    intent: QueryIntentSchema,
    confidence: z.number().min(0).max(1)
  })).default([]),
  reasoning: z.string().optional(),
  features: z.record(z.unknown()).default({})
});

export type IntentClassification = z.infer<typeof IntentClassificationSchema>;

export const IntentSuggestionSchema = z.object({
  intent: QueryIntentSchema,
  confidence: z.number().min(0).max(1),
  suggestedQuery: z.string(),
  reasoning: z.string()
});

export type IntentSuggestion = z.infer<typeof IntentSuggestionSchema>;

export const IntentFeedbackSchema = z.object({
  queryHash: z.string(),
  predictedIntent: QueryIntentSchema,
  actualIntent: QueryIntentSchema,
  confidence: z.number().min(0).max(1),
  userId: z.string().uuid().optional(),
  feedbackType: z.enum(['correction', 'confirmation', 'suggestion']),
  timestamp: z.date()
});

export type IntentFeedback = z.infer<typeof IntentFeedbackSchema>;

export const IntentTrainingDataSchema = z.object({
  query: z.string().min(1),
  intent: QueryIntentSchema,
  confidence: z.number().min(0).max(1),
  entities: z.array(NamedEntitySchema).default([]),
  context: QueryContextSchema.optional(),
  source: z.enum(['user_feedback', 'expert_annotation', 'automated']),
  timestamp: z.date()
});

export type IntentTrainingData = z.infer<typeof IntentTrainingDataSchema>;

// Query Understanding

export const QueryUnderstandingSchema = z.object({
  mainIntent: z.string(),
  subIntents: z.array(z.string()).default([]),
  entities: z.array(NamedEntitySchema).default([]),
  concepts: z.array(z.string()).default([]),
  expectedResultTypes: z.array(ContentTypeSchema).default([]),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  searchStrategy: SearchStrategySchema,
  complexity: z.enum(['simple', 'moderate', 'complex']),
  ambiguity: z.number().min(0).max(1)
});

export type QueryUnderstanding = z.infer<typeof QueryUnderstandingSchema>;

// Main Processed Query

export const ProcessedQuerySchema = z.object({
  original: z.string().min(1),
  normalized: z.string().min(1),
  intent: QueryIntentSchema,
  entities: z.array(NamedEntitySchema).default([]),
  expansion: QueryExpansionSchema,
  confidence: z.number().min(0).max(1),
  language: z.string().length(2),
  corrections: z.array(SpellCorrectionSchema).default([]),
  context: QueryContextSchema,
  searchStrategy: SearchStrategySchema,
  processingTimeMs: z.number().min(0),
  cached: z.boolean().default(false),
  queryHash: z.string(),
  understanding: QueryUnderstandingSchema.optional()
});

export type ProcessedQuery = z.infer<typeof ProcessedQuerySchema>;

// LLM Configuration

export const LLMProviderSchema = z.enum([
  'openai',
  'anthropic',
  'google',
  'local'
]);

export type LLMProvider = z.infer<typeof LLMProviderSchema>;

export const LLMConfigSchema = z.object({
  provider: LLMProviderSchema,
  model: z.string(),
  apiKey: z.string().optional(),
  apiUrl: z.string().url().optional(),
  temperature: z.number().min(0).max(2).default(0.1),
  maxTokens: z.number().min(1).max(8000).default(1000),
  timeout: z.number().min(1000).max(60000).default(30000),
  retryAttempts: z.number().min(0).max(5).default(3),
  systemPrompt: z.string().optional()
});

export type LLMConfig = z.infer<typeof LLMConfigSchema>;

// Database Models

export const QueryProcessingCacheSchema = z.object({
  id: z.string().uuid(),
  queryHash: z.string(),
  originalQuery: z.string(),
  processedQuery: z.record(z.unknown()),
  intent: z.string().optional(),
  entities: z.array(z.unknown()).default([]),
  expansions: z.array(z.unknown()).default([]),
  language: z.string().optional(),
  confidence: z.number().optional(),
  processingTimeMs: z.number().optional(),
  createdAt: z.date(),
  accessedCount: z.number().default(1),
  lastAccessedAt: z.date()
});

export type QueryProcessingCache = z.infer<typeof QueryProcessingCacheSchema>;

export const QueryFeedbackSchema = z.object({
  id: z.string().uuid(),
  queryHash: z.string(),
  userId: z.string().uuid().optional(),
  feedbackType: z.enum(['helpful', 'not_helpful', 'wrong_intent', 'wrong_entities', 'suggestion']),
  feedbackData: z.record(z.unknown()).default({}),
  createdAt: z.date()
});

export type QueryFeedback = z.infer<typeof QueryFeedbackSchema>;

export const NLPModelSchema = z.object({
  id: z.string().uuid(),
  modelName: z.string(),
  modelType: z.enum(['intent_classifier', 'entity_extractor', 'query_expander']),
  version: z.string(),
  configuration: z.record(z.unknown()),
  performanceMetrics: z.record(z.unknown()).default({}),
  isActive: z.boolean().default(false),
  createdAt: z.date(),
  updatedAt: z.date()
});

export type NLPModel = z.infer<typeof NLPModelSchema>;

// Performance Metrics

export const ProcessingMetricsSchema = z.object({
  totalQueries: z.number().min(0),
  cacheHitRate: z.number().min(0).max(1),
  averageProcessingTime: z.number().min(0),
  intentAccuracy: z.number().min(0).max(1),
  entityPrecision: z.number().min(0).max(1),
  expansionEffectiveness: z.number().min(0).max(1),
  languageDistribution: z.record(z.number()),
  errorRate: z.number().min(0).max(1),
  timestamp: z.date()
});

export type ProcessingMetrics = z.infer<typeof ProcessingMetricsSchema>;

// API Request/Response Types

export const ProcessQueryRequestSchema = z.object({
  query: z.string().min(1),
  context: QueryContextSchema.optional(),
  options: z.object({
    skipCache: z.boolean().default(false),
    includeExpansion: z.boolean().default(true),
    includeEntities: z.boolean().default(true),
    maxProcessingTime: z.number().min(100).max(10000).default(5000)
  }).optional()
});

export type ProcessQueryRequest = z.infer<typeof ProcessQueryRequestSchema>;

export const ProcessQueryResponseSchema = z.object({
  success: z.boolean(),
  data: ProcessedQuerySchema.optional(),
  error: z.string().optional(),
  metadata: z.object({
    processingTime: z.number(),
    cached: z.boolean(),
    modelVersion: z.string().optional()
  }).optional()
});

export type ProcessQueryResponse = z.infer<typeof ProcessQueryResponseSchema>;

// Export all schemas for runtime validation
export const NLPSchemas = {
  QueryIntent: QueryIntentSchema,
  EntityType: EntityTypeSchema,
  ContentType: ContentTypeSchema,
  SearchStrategy: SearchStrategySchema,
  EntityLink: EntityLinkSchema,
  NamedEntity: NamedEntitySchema,
  TechnicalEntity: TechnicalEntitySchema,
  EnrichedEntity: EnrichedEntitySchema,
  QueryExpansion: QueryExpansionSchema,
  RelatedQuery: RelatedQuerySchema,
  SpellCorrection: SpellCorrectionSchema,
  AbbreviationResolution: AbbreviationResolutionSchema,
  QueryContext: QueryContextSchema,
  LanguageDetection: LanguageDetectionSchema,
  IntentClassification: IntentClassificationSchema,
  IntentSuggestion: IntentSuggestionSchema,
  IntentFeedback: IntentFeedbackSchema,
  IntentTrainingData: IntentTrainingDataSchema,
  QueryUnderstanding: QueryUnderstandingSchema,
  ProcessedQuery: ProcessedQuerySchema,
  LLMProvider: LLMProviderSchema,
  LLMConfig: LLMConfigSchema,
  QueryProcessingCache: QueryProcessingCacheSchema,
  QueryFeedback: QueryFeedbackSchema,
  NLPModel: NLPModelSchema,
  ProcessingMetrics: ProcessingMetricsSchema,
  ProcessQueryRequest: ProcessQueryRequestSchema,
  ProcessQueryResponse: ProcessQueryResponseSchema
} as const;