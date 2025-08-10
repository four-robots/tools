/**
 * AI-Generated Summaries Types
 * 
 * Comprehensive types for AI-powered search result summarization, 
 * including content synthesis, fact checking, and citation management.
 */

import { z } from 'zod';

// ============================================================================
// Core Summary Types
// ============================================================================

export const SummaryTypeSchema = z.enum([
  'general_summary',    // General overview of search results
  'answer_generation',  // Direct answer to a question
  'key_points',        // Bullet points of main information
  'synthesis',         // Combining information from multiple sources
  'comparison',        // Comparing different approaches/solutions
  'explanation'        // Detailed explanation of a concept
]);

export type SummaryType = z.infer<typeof SummaryTypeSchema>;

export const SummaryLengthSchema = z.enum([
  'brief',      // 1-2 sentences
  'short',      // 2-3 paragraphs
  'medium',     // 3-5 paragraphs
  'detailed',   // 5+ paragraphs
  'comprehensive' // Full detailed analysis
]);

export type SummaryLength = z.infer<typeof SummaryLengthSchema>;

// ============================================================================
// Source Attribution and Citations
// ============================================================================

export const ContentSourceSchema = z.object({
  /** Unique identifier for the source */
  id: z.string().uuid(),
  /** Type of content source */
  type: z.enum(['scraped_page', 'wiki_page', 'kanban_card', 'memory_thought', 'code_file', 'code_chunk']),
  /** Source title */
  title: z.string(),
  /** Source URL if available */
  url: z.string().url().optional(),
  /** Relevance score to the query (0.0-1.0) */
  relevance: z.number().min(0).max(1),
  /** How much this source contributed to the summary (0.0-1.0) */
  usageWeight: z.number().min(0).max(1),
  /** Content excerpt or full text */
  content: z.string(),
  /** Metadata from original source */
  metadata: z.record(z.unknown()).default({})
});

export type ContentSource = z.infer<typeof ContentSourceSchema>;

export const CitationSchema = z.object({
  /** Reference to the source */
  sourceId: z.string().uuid(),
  /** Specific text quoted or referenced */
  citedText: z.string(),
  /** Position in summary where citation appears */
  startIndex: z.number().min(0),
  /** End position of citation in summary */
  endIndex: z.number().min(0),
  /** Citation display format */
  format: z.enum(['inline', 'footnote', 'reference_list']).default('inline')
});

export type Citation = z.infer<typeof CitationSchema>;

export const SourceAttributionSchema = z.object({
  /** All sources used in summary generation */
  sources: z.array(ContentSourceSchema),
  /** Specific citations within the summary */
  citations: z.array(CitationSchema),
  /** Total number of sources consulted */
  totalSources: z.number().min(0),
  /** Primary sources (most important) */
  primarySources: z.array(z.string().uuid()),
  /** Source diversity score */
  diversityScore: z.number().min(0).max(1)
});

export type SourceAttribution = z.infer<typeof SourceAttributionSchema>;

// ============================================================================
// Key Points and Information Extraction
// ============================================================================

export const KeyPointCategorySchema = z.enum([
  'definition',      // What something is
  'example',         // Examples or use cases
  'process',         // How something works
  'benefit',         // Advantages or benefits
  'drawback',        // Disadvantages or limitations
  'requirement',     // Prerequisites or requirements
  'implementation',  // How to implement/use
  'comparison',      // Comparisons with alternatives
  'best_practice',   // Recommended approaches
  'warning'          // Important caveats or warnings
]);

export type KeyPointCategory = z.infer<typeof KeyPointCategorySchema>;

export const KeyPointSchema = z.object({
  /** The key point text */
  text: z.string(),
  /** Importance score (0.0-1.0) */
  importance: z.number().min(0).max(1),
  /** Confidence in this point (0.0-1.0) */
  confidence: z.number().min(0).max(1),
  /** Category of the key point */
  category: KeyPointCategorySchema.optional(),
  /** Sources that support this point */
  supportingSources: z.array(z.string().uuid()),
  /** Related concepts */
  relatedConcepts: z.array(z.string()),
  /** Position in the summary */
  position: z.number().min(0).optional()
});

export type KeyPoint = z.infer<typeof KeyPointSchema>;

// ============================================================================
// Fact Checking and Quality Assurance
// ============================================================================

export const FactualAccuracySchema = z.enum([
  'verified',       // Confirmed by multiple sources
  'likely_true',    // Supported by available evidence
  'uncertain',      // Insufficient evidence
  'likely_false',   // Contradicted by available evidence
  'contradicted'    // Directly contradicted by sources
]);

export type FactualAccuracy = z.infer<typeof FactualAccuracySchema>;

export const VerificationMethodSchema = z.enum([
  'source_cross_reference',  // Verified against source material
  'external_validation',     // Checked against external knowledge
  'llm_reasoning',          // LLM self-verification
  'consistency_check',       // Internal consistency validation
  'knowledge_base_lookup'    // Verified against knowledge base
]);

export type VerificationMethod = z.infer<typeof VerificationMethodSchema>;

export const FactCheckSchema = z.object({
  /** The claim being fact-checked */
  claim: z.string(),
  /** Position in summary */
  startIndex: z.number().min(0),
  endIndex: z.number().min(0),
  /** Accuracy assessment */
  accuracy: FactualAccuracySchema,
  /** Confidence in the fact check (0.0-1.0) */
  confidence: z.number().min(0).max(1),
  /** Method used for verification */
  method: VerificationMethodSchema,
  /** Sources that support this claim */
  supportingEvidence: z.array(z.string().uuid()),
  /** Sources that contradict this claim */
  contradictingEvidence: z.array(z.string().uuid()),
  /** Additional notes about verification */
  notes: z.string().optional()
});

export type FactCheck = z.infer<typeof FactCheckSchema>;

// ============================================================================
// Hallucination Detection
// ============================================================================

export const HallucinationTypeSchema = z.enum([
  'unsupported_claim',   // Claim not supported by sources
  'contradicted_fact',   // Contradicts available information
  'fabricated_detail',   // Made-up specific details
  'out_of_scope',       // Information outside source scope
  'temporal_confusion',  // Incorrect time references
  'false_attribution'    // Wrong attribution of quotes/ideas
]);

export type HallucinationType = z.infer<typeof HallucinationTypeSchema>;

export const RiskLevelSchema = z.enum([
  'low',      // Minor inaccuracy, unlikely to mislead
  'medium',   // Noticeable error, could confuse users
  'high',     // Significant error, likely to mislead
  'critical'  // Dangerous misinformation
]);

export type RiskLevel = z.infer<typeof RiskLevelSchema>;

export const RecommendationSchema = z.enum([
  'remove',    // Remove the problematic text
  'flag',      // Mark as uncertain/unverified
  'verify',    // Seek additional verification
  'rewrite',   // Rewrite with correct information
  'clarify'    // Add clarifying context
]);

export type Recommendation = z.infer<typeof RecommendationSchema>;

export const HallucinationCheckSchema = z.object({
  /** The potentially hallucinated text */
  flaggedText: z.string(),
  /** Position in summary */
  startIndex: z.number().min(0),
  endIndex: z.number().min(0),
  /** Type of hallucination */
  type: HallucinationTypeSchema,
  /** Risk level */
  riskLevel: RiskLevelSchema,
  /** Confidence in detection (0.0-1.0) */
  confidence: z.number().min(0).max(1),
  /** Detection method used */
  detectionMethod: VerificationMethodSchema,
  /** Whether any source supports this */
  hasSourceSupport: z.boolean(),
  /** Recommended action */
  recommendation: RecommendationSchema,
  /** Suggested alternative text */
  alternativeText: z.string().optional(),
  /** Additional notes */
  notes: z.string().optional(),
  /** Whether this has been resolved */
  resolved: z.boolean().default(false)
});

export type HallucinationCheck = z.infer<typeof HallucinationCheckSchema>;

// ============================================================================
// Content Synthesis and Comparison
// ============================================================================

export const SynthesizedContentSchema = z.object({
  /** The synthesized content text */
  content: z.string(),
  /** Sources that were synthesized */
  sourceIds: z.array(z.string().uuid()),
  /** Key themes identified */
  themes: z.array(z.string()),
  /** Consensus points (agreed upon by multiple sources) */
  consensusPoints: z.array(z.string()),
  /** Conflicting information identified */
  conflicts: z.array(z.object({
    topic: z.string(),
    conflictingSources: z.array(z.string().uuid()),
    description: z.string()
  })),
  /** Synthesis confidence score */
  confidence: z.number().min(0).max(1)
});

export type SynthesizedContent = z.infer<typeof SynthesizedContentSchema>;

export const ComparisonSchema = z.object({
  /** Items being compared */
  items: z.array(z.object({
    name: z.string(),
    description: z.string(),
    sources: z.array(z.string().uuid())
  })),
  /** Comparison criteria */
  criteria: z.array(z.string()),
  /** Comparison matrix */
  comparisonMatrix: z.record(z.record(z.string())), // item -> criterion -> value
  /** Summary of key differences */
  keyDifferences: z.array(z.string()),
  /** Recommendations based on comparison */
  recommendations: z.array(z.string()).optional()
});

export type Comparison = z.infer<typeof ComparisonSchema>;

export const ContentGapSchema = z.object({
  /** The gap identified */
  gapDescription: z.string(),
  /** What information is missing */
  missingInformation: z.array(z.string()),
  /** Potential sources that might fill the gap */
  potentialSources: z.array(z.string()),
  /** Impact of this gap on summary quality */
  impact: z.enum(['low', 'medium', 'high']),
  /** Suggested follow-up searches */
  suggestedQueries: z.array(z.string())
});

export type ContentGap = z.infer<typeof ContentGapSchema>;

// ============================================================================
// Generated Answers (Question-Specific)
// ============================================================================

export const AnswerTypeSchema = z.enum([
  'direct_answer',    // Direct factual answer
  'explanation',      // Detailed explanation
  'step_by_step',    // Process or procedure
  'comparison',       // Comparative answer
  'definition',       // Definition or concept explanation
  'troubleshooting',  // Problem-solving answer
  'opinion_synthesis' // Synthesized viewpoints
]);

export type AnswerType = z.infer<typeof AnswerTypeSchema>;

export const GeneratedAnswerSchema = z.object({
  /** The original question */
  question: z.string(),
  /** The generated answer */
  answer: z.string(),
  /** Type of answer provided */
  answerType: AnswerTypeSchema,
  /** Confidence in the answer (0.0-1.0) */
  confidence: z.number().min(0).max(1),
  /** How complete the answer is (0.0-1.0) */
  completeness: z.number().min(0).max(1),
  /** Primary sources for the answer */
  primarySources: z.array(z.string().uuid()),
  /** Suggested follow-up questions */
  followUpQuestions: z.array(z.string()),
  /** Alternative ways to phrase the question */
  alternativePhrasings: z.array(z.string()),
  /** Caveats or limitations */
  caveats: z.array(z.string()).optional()
});

export type GeneratedAnswer = z.infer<typeof GeneratedAnswerSchema>;

// ============================================================================
// Main Search Summary
// ============================================================================

export const SearchSummarySchema = z.object({
  /** Unique identifier */
  id: z.string().uuid(),
  /** Hash of the search results used */
  searchResultsHash: z.string(),
  /** Original search query */
  searchQuery: z.string(),
  /** Query intent */
  queryIntent: z.string(),
  /** Type of summary generated */
  summaryType: SummaryTypeSchema,
  /** The summary content */
  content: z.string(),
  /** Summary length in characters */
  length: z.number().min(0),
  /** Language of the summary */
  language: z.string().default('en'),
  /** LLM provider used */
  llmProvider: z.string(),
  /** Specific model used */
  llmModel: z.string(),
  /** Processing time in milliseconds */
  processingTimeMs: z.number().min(0),
  /** Source attribution */
  sources: SourceAttributionSchema,
  /** Key points extracted */
  keyPoints: z.array(KeyPointSchema),
  /** Fact checking results */
  factChecks: z.array(FactCheckSchema),
  /** Hallucination checks */
  hallucinationChecks: z.array(HallucinationCheckSchema),
  /** Generated answer (if question type) */
  generatedAnswer: GeneratedAnswerSchema.optional(),
  /** Synthesized content */
  synthesizedContent: SynthesizedContentSchema.optional(),
  /** Comparison results */
  comparison: ComparisonSchema.optional(),
  /** Content gaps identified */
  contentGaps: z.array(ContentGapSchema),
  /** Overall confidence score */
  overallConfidence: z.number().min(0).max(1),
  /** Quality metrics */
  qualityMetrics: z.object({
    accuracy: z.number().min(0).max(1),
    completeness: z.number().min(0).max(1),
    relevance: z.number().min(0).max(1),
    clarity: z.number().min(0).max(1),
    conciseness: z.number().min(0).max(1)
  }),
  /** User ID if available */
  userId: z.string().uuid().optional(),
  /** Session ID */
  sessionId: z.string().optional(),
  /** Creation timestamp */
  createdAt: z.date(),
  /** Last updated timestamp */
  updatedAt: z.date(),
  /** Access count */
  accessCount: z.number().min(0).default(1),
  /** Last accessed timestamp */
  lastAccessedAt: z.date()
});

export type SearchSummary = z.infer<typeof SearchSummarySchema>;

// ============================================================================
// API Request/Response Types
// ============================================================================

export const GenerateSummaryRequestSchema = z.object({
  /** Search query */
  query: z.string().min(1),
  /** Search results to summarize */
  searchResults: z.array(z.record(z.unknown())), // Will be typed from search results
  /** Preferred summary type */
  summaryType: SummaryTypeSchema.default('general_summary'),
  /** Preferred summary length */
  summaryLength: SummaryLengthSchema.default('medium'),
  /** Specific question (for answer generation) */
  question: z.string().optional(),
  /** Language preference */
  language: z.string().default('en'),
  /** LLM provider preference */
  llmProvider: z.string().optional(),
  /** Additional options */
  options: z.object({
    includeKeyPoints: z.boolean().default(true),
    includeCitations: z.boolean().default(true),
    includeFactChecking: z.boolean().default(true),
    includeHallucinationCheck: z.boolean().default(true),
    maxProcessingTime: z.number().min(1000).max(60000).default(30000),
    confidenceThreshold: z.number().min(0).max(1).default(0.7)
  }).optional(),
  /** User context */
  userId: z.string().uuid().optional(),
  sessionId: z.string().optional()
});

export type GenerateSummaryRequest = z.infer<typeof GenerateSummaryRequestSchema>;

export const GenerateSummaryResponseSchema = z.object({
  /** Success status */
  success: z.boolean(),
  /** Generated summary */
  summary: SearchSummarySchema.optional(),
  /** Error message if failed */
  error: z.string().optional(),
  /** Processing metadata */
  metadata: z.object({
    processingTime: z.number(),
    llmProvider: z.string(),
    llmModel: z.string(),
    tokensUsed: z.number().optional(),
    cached: z.boolean()
  }).optional()
});

export type GenerateSummaryResponse = z.infer<typeof GenerateSummaryResponseSchema>;

// ============================================================================
// Summary Feedback and Analytics
// ============================================================================

export const SummaryFeedbackSchema = z.object({
  /** Summary being reviewed */
  summaryId: z.string().uuid(),
  /** User providing feedback */
  userId: z.string().uuid().optional(),
  /** Type of feedback */
  feedbackType: z.enum([
    'helpful', 'not_helpful', 'inaccurate', 'incomplete', 
    'too_long', 'too_short', 'unclear', 'excellent'
  ]),
  /** Numeric rating (1-5) */
  rating: z.number().min(1).max(5).optional(),
  /** Specific issues identified */
  specificIssues: z.array(z.string()),
  /** Suggested improvements */
  suggestedImprovements: z.string().optional(),
  /** Preferred characteristics */
  preferences: z.object({
    length: z.enum(['shorter', 'longer', 'just_right']).optional(),
    style: z.enum(['more_detailed', 'more_concise', 'more_technical', 'simpler']).optional(),
    focus: z.enum(['more_examples', 'more_theory', 'more_practical', 'balanced']).optional()
  }).optional(),
  /** Free-form feedback text */
  feedbackText: z.string().optional(),
  /** Timestamp */
  createdAt: z.date()
});

export type SummaryFeedback = z.infer<typeof SummaryFeedbackSchema>;

// ============================================================================
// Export all schemas for runtime validation
// ============================================================================

export const AISummarySchemas = {
  SummaryType: SummaryTypeSchema,
  SummaryLength: SummaryLengthSchema,
  ContentSource: ContentSourceSchema,
  Citation: CitationSchema,
  SourceAttribution: SourceAttributionSchema,
  KeyPointCategory: KeyPointCategorySchema,
  KeyPoint: KeyPointSchema,
  FactualAccuracy: FactualAccuracySchema,
  VerificationMethod: VerificationMethodSchema,
  FactCheck: FactCheckSchema,
  HallucinationType: HallucinationTypeSchema,
  RiskLevel: RiskLevelSchema,
  Recommendation: RecommendationSchema,
  HallucinationCheck: HallucinationCheckSchema,
  SynthesizedContent: SynthesizedContentSchema,
  Comparison: ComparisonSchema,
  ContentGap: ContentGapSchema,
  AnswerType: AnswerTypeSchema,
  GeneratedAnswer: GeneratedAnswerSchema,
  SearchSummary: SearchSummarySchema,
  GenerateSummaryRequest: GenerateSummaryRequestSchema,
  GenerateSummaryResponse: GenerateSummaryResponseSchema,
  SummaryFeedback: SummaryFeedbackSchema
} as const;