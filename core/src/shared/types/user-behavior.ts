import { z } from 'zod';

// Device Information Schema
export const DeviceInfoSchema = z.object({
  browser: z.string().optional(),
  browserVersion: z.string().optional(),
  os: z.string().optional(),
  osVersion: z.string().optional(),
  screenWidth: z.number().optional(),
  screenHeight: z.number().optional(),
  viewportWidth: z.number().optional(),
  viewportHeight: z.number().optional(),
  isMobile: z.boolean().optional(),
  isTablet: z.boolean().optional(),
  userAgent: z.string().optional(),
});

// Search Context Schema
export const SearchContextSchema = z.object({
  query: z.string().optional(),
  filters: z.record(z.any()).optional(),
  facets: z.array(z.string()).optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  page: z.number().optional(),
  pageSize: z.number().optional(),
  searchType: z.string().optional(),
  searchMode: z.string().optional(),
});

// Result Interaction Schema
export const ResultInteractionSchema = z.object({
  resultId: z.string().optional(),
  resultType: z.string().optional(),
  resultTitle: z.string().optional(),
  resultUrl: z.string().optional(),
  clickPosition: z.number().optional(),
  interactionType: z.string().optional(),
  dwellTime: z.number().optional(),
  savedToFavorites: z.boolean().optional(),
  shared: z.boolean().optional(),
});

// Page Context Schema
export const PageContextSchema = z.object({
  currentPage: z.string().optional(),
  previousPage: z.string().optional(),
  navigationPath: z.array(z.string()).optional(),
  pageLoadTime: z.number().optional(),
  timeOnPage: z.number().optional(),
  scrollDepth: z.number().optional(),
  interactions: z.number().optional(),
});

// Event Timing Schema
export const EventTimingSchema = z.object({
  eventTimestamp: z.date(),
  sessionStart: z.date().optional(),
  pageLoadStart: z.date().optional(),
  interactionStart: z.date().optional(),
  interactionEnd: z.date().optional(),
  responseTime: z.number().optional(),
  searchDuration: z.number().optional(),
  interactionDuration: z.number().optional(),
});

// Base Behavior Event Schema
export const BehaviorEventSchema = z.object({
  id: z.string().uuid().optional(),
  userId: z.string().uuid(),
  sessionId: z.string().uuid(),
  
  // Event details
  eventType: z.enum(['search', 'click', 'view', 'save', 'share', 'filter', 'navigate', 'scroll', 'hover', 'focus']),
  eventCategory: z.enum(['search', 'navigation', 'interaction', 'preference', 'engagement']),
  eventAction: z.string(),
  
  // Context data
  searchQuery: z.string().optional(),
  searchContext: SearchContextSchema.optional(),
  resultData: ResultInteractionSchema.optional(),
  pageContext: PageContextSchema.optional(),
  
  // Timing and sequence
  eventTimestamp: z.date().default(() => new Date()),
  sessionSequence: z.number().optional(),
  pageSequence: z.number().optional(),
  
  // Technical context
  userAgent: z.string().optional(),
  ipAddress: z.string().optional(),
  referrer: z.string().optional(),
  deviceInfo: DeviceInfoSchema.optional(),
  
  // Performance metrics
  responseTimeMs: z.number().optional(),
  searchDurationMs: z.number().optional(),
  interactionDurationMs: z.number().optional(),
  
  // Metadata
  metadata: z.record(z.any()).optional(),
  createdAt: z.date().default(() => new Date()),
});

// User Pattern Data Schema
export const PatternDataSchema = z.object({
  queryComplexity: z.enum(['simple', 'moderate', 'complex']).optional(),
  topicAffinity: z.record(z.number()).optional(), // topic -> affinity score
  peakUsageHours: z.array(z.number()).optional(), // hours 0-23
  preferredContentTypes: z.array(z.string()).optional(),
  searchStrategyStyle: z.enum(['explorer', 'focused', 'researcher']).optional(),
  avgSessionDuration: z.number().optional(),
  avgQueriesPerSession: z.number().optional(),
  preferredFilters: z.array(z.string()).optional(),
  commonQueryTerms: z.array(z.string()).optional(),
  seasonalPatterns: z.record(z.number()).optional(),
});

// User Search Pattern Schema
export const UserSearchPatternSchema = z.object({
  id: z.string().uuid().optional(),
  userId: z.string().uuid(),
  
  // Pattern identification
  patternType: z.enum(['query_style', 'topic_preference', 'time_pattern', 'interaction_style', 'content_preference']),
  patternName: z.string(),
  patternDescription: z.string().optional(),
  
  // Pattern data
  patternData: PatternDataSchema,
  confidenceScore: z.number().min(0).max(1).optional(),
  frequencyScore: z.number().min(0).max(1).optional(),
  
  // Statistics
  occurrences: z.number().default(1),
  lastOccurrenceAt: z.date().default(() => new Date()),
  firstDetectedAt: z.date().default(() => new Date()),
  
  // Learning metadata
  modelVersion: z.string().optional(),
  learningAlgorithm: z.string().optional(),
  trainingDataSize: z.number().optional(),
  
  // Status
  isActive: z.boolean().default(true),
  isSignificant: z.boolean().default(false),
  
  createdAt: z.date().default(() => new Date()),
  updatedAt: z.date().default(() => new Date()),
});

// Segment Attributes Schema
export const SegmentAttributesSchema = z.object({
  searchExpertise: z.enum(['novice', 'intermediate', 'expert']).optional(),
  usageFrequency: z.enum(['light', 'moderate', 'heavy']).optional(),
  contentPreference: z.array(z.string()).optional(),
  behaviorStyle: z.string().optional(),
  engagementLevel: z.enum(['low', 'medium', 'high']).optional(),
  sessionLength: z.enum(['short', 'medium', 'long']).optional(),
  queryComplexity: z.enum(['simple', 'moderate', 'complex']).optional(),
});

// Segment Scores Schema
export const SegmentScoresSchema = z.object({
  engagementScore: z.number().optional(),
  expertiseScore: z.number().optional(),
  loyaltyScore: z.number().optional(),
  satisfactionScore: z.number().optional(),
  churnRisk: z.number().optional(),
  valueScore: z.number().optional(),
});

// User Behavior Segment Schema
export const UserBehaviorSegmentSchema = z.object({
  id: z.string().uuid().optional(),
  userId: z.string().uuid(),
  
  // Segment classification
  segmentType: z.enum(['search_style', 'expertise_level', 'usage_pattern', 'content_preference', 'engagement_level']),
  segmentName: z.string(),
  segmentDescription: z.string().optional(),
  
  // Segment characteristics
  segmentAttributes: SegmentAttributesSchema,
  segmentScores: SegmentScoresSchema.optional(),
  
  // Confidence and stability
  confidenceScore: z.number().min(0).max(1).optional(),
  stabilityScore: z.number().min(0).max(1).optional(),
  
  // Temporal data
  segmentSince: z.date().default(() => new Date()),
  lastUpdatedAt: z.date().default(() => new Date()),
  reassignmentCount: z.number().default(0),
  
  // Learning metadata
  classificationModel: z.string().optional(),
  modelVersion: z.string().optional(),
  featureImportance: z.record(z.number()).optional(),
  
  // Status
  isActive: z.boolean().default(true),
  isPrimary: z.boolean().default(false),
  
  createdAt: z.date().default(() => new Date()),
});

// Prediction Value Schema
export const PredictionValueSchema = z.object({
  predictedAction: z.string().optional(),
  predictedContent: z.array(z.string()).optional(),
  predictedQuery: z.string().optional(),
  riskScore: z.number().optional(),
  recommendedActions: z.array(z.string()).optional(),
  expectedEngagement: z.number().optional(),
  timeToAction: z.number().optional(),
});

// User Behavior Prediction Schema
export const UserBehaviorPredictionSchema = z.object({
  id: z.string().uuid().optional(),
  userId: z.string().uuid(),
  
  // Prediction details
  predictionType: z.enum(['next_search', 'preferred_content', 'churn_risk', 'engagement_level', 'session_length']),
  predictionTarget: z.string(),
  predictionValue: PredictionValueSchema,
  
  // Prediction metrics
  confidenceScore: z.number().min(0).max(1).optional(),
  probabilityScore: z.number().min(0).max(1).optional(),
  expectedOutcome: z.string().optional(),
  
  // Model information
  modelName: z.string(),
  modelVersion: z.string().optional(),
  algorithmUsed: z.string().optional(),
  featureSet: z.record(z.any()).optional(),
  
  // Temporal aspects
  predictionMadeAt: z.date().default(() => new Date()),
  predictionExpiresAt: z.date().optional(),
  predictionHorizonDays: z.number().optional(),
  
  // Validation
  isValidated: z.boolean().default(false),
  actualOutcome: z.record(z.any()).optional(),
  validationAccuracy: z.number().min(0).max(1).optional(),
  validatedAt: z.date().optional(),
  
  createdAt: z.date().default(() => new Date()),
});

// Insight Data Schema
export const InsightDataSchema = z.object({
  metric: z.string().optional(),
  currentValue: z.any().optional(),
  targetValue: z.any().optional(),
  changePercent: z.number().optional(),
  trendDirection: z.enum(['up', 'down', 'stable']).optional(),
  affectedUsers: z.number().optional(),
  timeframe: z.string().optional(),
  details: z.record(z.any()).optional(),
});

// Recommendation Schema
export const RecommendationSchema = z.object({
  action: z.string(),
  description: z.string(),
  expectedImpact: z.string().optional(),
  implementation: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  estimatedEffort: z.enum(['low', 'medium', 'high']).optional(),
  resources: z.array(z.string()).optional(),
});

// User Behavior Insight Schema
export const UserBehaviorInsightSchema = z.object({
  id: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
  
  // Insight classification
  insightType: z.enum(['user_specific', 'cohort_based', 'system_wide']),
  insightCategory: z.enum(['search_optimization', 'ui_improvement', 'feature_usage', 'performance', 'engagement']),
  insightTitle: z.string(),
  insightDescription: z.string(),
  
  // Insight data
  insightData: InsightDataSchema,
  evidence: z.record(z.any()).optional(),
  recommendation: RecommendationSchema.optional(),
  
  // Impact assessment
  impactScore: z.number().min(0).max(1).optional(),
  priorityScore: z.number().optional(),
  effortEstimate: z.enum(['low', 'medium', 'high']).optional(),
  
  // Status and lifecycle
  status: z.enum(['generated', 'reviewed', 'approved', 'implemented', 'dismissed']).default('generated'),
  reviewedBy: z.string().uuid().optional(),
  reviewedAt: z.date().optional(),
  implementedAt: z.date().optional(),
  
  // Metadata
  generatedByModel: z.string().optional(),
  modelVersion: z.string().optional(),
  confidenceLevel: z.enum(['low', 'medium', 'high']).optional(),
  
  createdAt: z.date().default(() => new Date()),
  updatedAt: z.date().default(() => new Date()),
  expiresAt: z.date().optional(),
});

// Privacy Settings Schema
export const UserPrivacySettingsSchema = z.object({
  id: z.string().uuid().optional(),
  userId: z.string().uuid(),
  
  // Consent levels
  behaviorTrackingEnabled: z.boolean().default(true),
  analyticsConsent: z.boolean().default(true),
  personalizationConsent: z.boolean().default(true),
  dataRetentionConsent: z.boolean().default(true),
  
  // Granular permissions
  eventTrackingTypes: z.array(z.string()).default([]),
  dataSharingPermissions: z.record(z.boolean()).default({}),
  
  // Preferences
  dataRetentionPeriodDays: z.number().min(1).max(3650).default(365),
  anonymizationPreference: z.enum(['none', 'partial', 'full']).default('partial'),
  
  // Consent tracking
  consentVersion: z.string().optional(),
  consentGivenAt: z.date().default(() => new Date()),
  consentExpiresAt: z.date().optional(),
  lastUpdatedAt: z.date().default(() => new Date()),
  
  // Audit trail
  consentHistory: z.array(z.record(z.any())).default([]),
  ipAddressAtConsent: z.string().optional(),
  userAgentAtConsent: z.string().optional(),
  
  createdAt: z.date().default(() => new Date()),
});

// ML Model Information Schema
export const MLModelSchema = z.object({
  modelId: z.string(),
  modelType: z.enum(['classification', 'clustering', 'regression', 'recommendation', 'neural_network']),
  algorithm: z.enum([
    'random_forest', 'svm', 'neural_network', 'collaborative_filtering',
    'kmeans', 'dbscan', 'linear_regression', 'logistic_regression'
  ]),
  version: z.string(),
  trainingDate: z.date(),
  features: z.array(z.string()),
  hyperparameters: z.record(z.any()),
  performance: z.object({
    accuracy: z.number().optional(),
    precision: z.number().optional(),
    recall: z.number().optional(),
    f1Score: z.number().optional(),
    rmse: z.number().optional(),
    mae: z.number().optional(),
  }),
  isActive: z.boolean().default(true),
  description: z.string().optional(),
});

// Analytics Request Schemas
export const BehaviorAnalyticsRequestSchema = z.object({
  userId: z.string().uuid().optional(),
  dateRange: z.object({
    start: z.date(),
    end: z.date(),
  }).optional(),
  eventTypes: z.array(z.string()).optional(),
  groupBy: z.enum(['hour', 'day', 'week', 'month']).optional(),
  metrics: z.array(z.string()).optional(),
});

export const PatternAnalysisRequestSchema = z.object({
  userId: z.string().uuid().optional(),
  patternTypes: z.array(z.string()).optional(),
  minConfidence: z.number().min(0).max(1).optional(),
  minSignificance: z.boolean().optional(),
  timeframe: z.enum(['week', 'month', 'quarter', 'year']).optional(),
});

// Export TypeScript types
export type DeviceInfo = z.infer<typeof DeviceInfoSchema>;
export type SearchContext = z.infer<typeof SearchContextSchema>;
export type ResultInteraction = z.infer<typeof ResultInteractionSchema>;
export type PageContext = z.infer<typeof PageContextSchema>;
export type EventTiming = z.infer<typeof EventTimingSchema>;
export type BehaviorEvent = z.infer<typeof BehaviorEventSchema>;
export type PatternData = z.infer<typeof PatternDataSchema>;
export type UserSearchPattern = z.infer<typeof UserSearchPatternSchema>;
export type SegmentAttributes = z.infer<typeof SegmentAttributesSchema>;
export type SegmentScores = z.infer<typeof SegmentScoresSchema>;
export type UserBehaviorSegment = z.infer<typeof UserBehaviorSegmentSchema>;
export type PredictionValue = z.infer<typeof PredictionValueSchema>;
export type UserBehaviorPrediction = z.infer<typeof UserBehaviorPredictionSchema>;
export type InsightData = z.infer<typeof InsightDataSchema>;
export type Recommendation = z.infer<typeof RecommendationSchema>;
export type UserBehaviorInsight = z.infer<typeof UserBehaviorInsightSchema>;
export type UserPrivacySettings = z.infer<typeof UserPrivacySettingsSchema>;
export type MLModel = z.infer<typeof MLModelSchema>;
export type BehaviorAnalyticsRequest = z.infer<typeof BehaviorAnalyticsRequestSchema>;
export type PatternAnalysisRequest = z.infer<typeof PatternAnalysisRequestSchema>;

// Event type enums for easy reference
export const EventTypes = {
  SEARCH: 'search',
  CLICK: 'click',
  VIEW: 'view',
  SAVE: 'save',
  SHARE: 'share',
  FILTER: 'filter',
  NAVIGATE: 'navigate',
  SCROLL: 'scroll',
  HOVER: 'hover',
  FOCUS: 'focus',
} as const;

export const EventCategories = {
  SEARCH: 'search',
  NAVIGATION: 'navigation',
  INTERACTION: 'interaction',
  PREFERENCE: 'preference',
  ENGAGEMENT: 'engagement',
} as const;

export const PatternTypes = {
  QUERY_STYLE: 'query_style',
  TOPIC_PREFERENCE: 'topic_preference',
  TIME_PATTERN: 'time_pattern',
  INTERACTION_STYLE: 'interaction_style',
  CONTENT_PREFERENCE: 'content_preference',
} as const;

export const SegmentTypes = {
  SEARCH_STYLE: 'search_style',
  EXPERTISE_LEVEL: 'expertise_level',
  USAGE_PATTERN: 'usage_pattern',
  CONTENT_PREFERENCE: 'content_preference',
  ENGAGEMENT_LEVEL: 'engagement_level',
} as const;

export const PredictionTypes = {
  NEXT_SEARCH: 'next_search',
  PREFERRED_CONTENT: 'preferred_content',
  CHURN_RISK: 'churn_risk',
  ENGAGEMENT_LEVEL: 'engagement_level',
  SESSION_LENGTH: 'session_length',
} as const;

export const InsightTypes = {
  USER_SPECIFIC: 'user_specific',
  COHORT_BASED: 'cohort_based',
  SYSTEM_WIDE: 'system_wide',
} as const;

export const InsightCategories = {
  SEARCH_OPTIMIZATION: 'search_optimization',
  UI_IMPROVEMENT: 'ui_improvement',
  FEATURE_USAGE: 'feature_usage',
  PERFORMANCE: 'performance',
  ENGAGEMENT: 'engagement',
} as const;