/**
 * Personalization types for adaptive search experiences
 * 
 * Comprehensive type definitions for:
 * - User personalization profiles and preferences
 * - Personalized search results and ranking
 * - Interest modeling and affinity tracking
 * - Recommendation systems and content discovery
 * - A/B testing and experiment management
 */

import { z } from 'zod';

// =====================
// PERSONALIZATION LEVELS
// =====================

export const PersonalizationLevelSchema = z.enum(['low', 'medium', 'high', 'custom']);
export type PersonalizationLevel = z.infer<typeof PersonalizationLevelSchema>;

export const ConfidenceLevelSchema = z.enum(['low', 'medium', 'high']);
export type ConfidenceLevel = z.infer<typeof ConfidenceLevelSchema>;

export const TrendDirectionSchema = z.enum(['growing', 'stable', 'declining']);
export type TrendDirection = z.infer<typeof TrendDirectionSchema>;

// =====================
// PERSONALIZATION PROFILES
// =====================

export const SearchPreferencesSchema = z.object({
  resultsPerPage: z.number().int().min(5).max(100).optional(),
  displayFormat: z.enum(['list', 'grid', 'cards']).optional(),
  sortPreference: z.enum(['relevance', 'date', 'popularity', 'custom']).optional(),
  showPreviews: z.boolean().optional(),
  showSummaries: z.boolean().optional(),
  compactView: z.boolean().optional(),
  autoRefresh: z.boolean().optional(),
  keyboardShortcuts: z.boolean().optional(),
});

export type SearchPreferences = z.infer<typeof SearchPreferencesSchema>;

export const ResultPreferencesSchema = z.object({
  contentTypeWeights: z.record(z.number().min(0).max(1)).optional(), // Weight different content types
  sourceWeights: z.record(z.number().min(0).max(1)).optional(), // Weight different sources
  recencyWeight: z.number().min(0).max(1).optional(), // How much to weight recent content
  popularityWeight: z.number().min(0).max(1).optional(), // How much to weight popular content
  personalRelevanceWeight: z.number().min(0).max(1).optional(), // Personal interest weighting
  diversityThreshold: z.number().min(0).max(1).optional(), // Diversity vs relevance tradeoff
});

export type ResultPreferences = z.infer<typeof ResultPreferencesSchema>;

export const InterfacePreferencesSchema = z.object({
  theme: z.enum(['light', 'dark', 'auto']).optional(),
  colorScheme: z.string().optional(),
  density: z.enum(['compact', 'comfortable', 'spacious']).optional(),
  animation: z.boolean().optional(),
  soundEffects: z.boolean().optional(),
  tooltips: z.boolean().optional(),
  advancedFeatures: z.boolean().optional(),
  betaFeatures: z.boolean().optional(),
});

export type InterfacePreferences = z.infer<typeof InterfacePreferencesSchema>;

export const BehaviorWeightsSchema = z.object({
  clickWeight: z.number().min(0).max(1).optional(), // Weight of click signals
  dwellTimeWeight: z.number().min(0).max(1).optional(), // Weight of time spent on results
  saveWeight: z.number().min(0).max(1).optional(), // Weight of save/bookmark actions
  shareWeight: z.number().min(0).max(1).optional(), // Weight of sharing actions
  queryRefinementWeight: z.number().min(0).max(1).optional(), // Weight of query modifications
  returnVisitWeight: z.number().min(0).max(1).optional(), // Weight of return visits
});

export type BehaviorWeights = z.infer<typeof BehaviorWeightsSchema>;

export const TemporalFactorsSchema = z.object({
  timeOfDayFactors: z.record(z.number().min(0).max(1)).optional(), // Different preferences by hour
  dayOfWeekFactors: z.record(z.number().min(0).max(1)).optional(), // Different preferences by day
  seasonalFactors: z.record(z.number().min(0).max(1)).optional(), // Seasonal preference changes
  recencyDecay: z.number().min(0).max(1).optional(), // How fast old preferences decay
});

export type TemporalFactors = z.infer<typeof TemporalFactorsSchema>;

export const ContextFactorsSchema = z.object({
  deviceFactors: z.record(z.number().min(0).max(1)).optional(), // Different by device type
  locationFactors: z.record(z.number().min(0).max(1)).optional(), // Different by location/timezone
  sessionContextFactors: z.record(z.number().min(0).max(1)).optional(), // Within-session adaptations
  taskContextFactors: z.record(z.number().min(0).max(1)).optional(), // Based on inferred task type
});

export type ContextFactors = z.infer<typeof ContextFactorsSchema>;

export const UserPersonalizationProfileSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  profileName: z.string().min(1).max(255),
  profileDescription: z.string().optional(),
  isActive: z.boolean(),
  isDefault: z.boolean(),
  
  // Preferences
  searchPreferences: SearchPreferencesSchema,
  resultPreferences: ResultPreferencesSchema,
  interfacePreferences: InterfacePreferencesSchema,
  
  // Personalization settings
  personalizationLevel: PersonalizationLevelSchema,
  learningEnabled: z.boolean(),
  suggestionEnabled: z.boolean(),
  recommendationEnabled: z.boolean(),
  
  // Behavioral factors
  behaviorWeights: BehaviorWeightsSchema,
  temporalFactors: TemporalFactorsSchema,
  contextFactors: ContextFactorsSchema,
  
  // Lifecycle
  createdAt: z.date(),
  updatedAt: z.date(),
  lastUsedAt: z.date(),
});

export type UserPersonalizationProfile = z.infer<typeof UserPersonalizationProfileSchema>;

// =====================
// PERSONALIZED SEARCH RESULTS
// =====================

export const PersonalizationFactorSchema = z.object({
  factorType: z.string(),
  factorName: z.string(),
  weight: z.number().min(0).max(1),
  contribution: z.number().min(-1).max(1), // Can boost or penalize
  explanation: z.string().optional(),
});

export type PersonalizationFactor = z.infer<typeof PersonalizationFactorSchema>;

export const SearchResultScoreSchema = z.object({
  resultId: z.string(),
  baseScore: z.number().min(0).max(1),
  personalizationBoost: z.number().min(-1).max(1),
  finalScore: z.number().min(0).max(1),
  factors: z.array(PersonalizationFactorSchema),
});

export type SearchResultScore = z.infer<typeof SearchResultScoreSchema>;

export const PersonalizedSearchResultsSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  searchQuery: z.string().min(1),
  searchContext: z.record(z.unknown()),
  
  // Result data
  originalResults: z.array(z.record(z.unknown())),
  personalizedResults: z.array(z.record(z.unknown())),
  personalizationApplied: z.record(z.unknown()),
  
  // Scoring
  baseScores: z.record(z.number()),
  personalizationScores: z.record(z.number()),
  finalScores: z.record(z.number()),
  
  // Interaction tracking
  resultsClicked: z.array(z.string()),
  resultsSaved: z.array(z.string()),
  resultsShared: z.array(z.string()),
  sessionFeedback: z.record(z.unknown()),
  
  // Metadata
  personalizationModelVersion: z.string().optional(),
  personalizationFactors: z.array(PersonalizationFactorSchema),
  confidenceScore: z.number().min(0).max(1).optional(),
  
  // Timing
  searchTimestamp: z.date(),
  responseTimeMs: z.number().int().optional(),
});

export type PersonalizedSearchResults = z.infer<typeof PersonalizedSearchResultsSchema>;

// =====================
// USER INTERESTS
// =====================

export const InterestTypeSchema = z.enum(['topic', 'category', 'content_type', 'entity', 'skill', 'domain']);
export type InterestType = z.infer<typeof InterestTypeSchema>;

export const UserInterestSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  
  // Interest identification
  interestType: InterestTypeSchema,
  interestName: z.string().min(1).max(255),
  interestDescription: z.string().optional(),
  
  // Interest strength
  affinityScore: z.number().min(0).max(1), // Overall interest strength
  frequencyScore: z.number().min(0).max(1), // How often user engages
  recencyScore: z.number().min(0).max(1), // How recently engaged
  depthScore: z.number().min(0).max(1), // How deeply engaged
  
  // Interest metadata
  interestKeywords: z.array(z.string()),
  relatedQueries: z.array(z.string()),
  contentExamples: z.array(z.record(z.unknown())),
  
  // Evolution tracking
  firstDetectedAt: z.date(),
  lastUpdatedAt: z.date(),
  trendDirection: TrendDirectionSchema,
  trendStrength: z.number().min(0).max(1),
  
  // Status
  isActive: z.boolean(),
  isExplicit: z.boolean(), // User explicitly indicated
  confidenceLevel: ConfidenceLevelSchema,
  
  createdAt: z.date(),
});

export type UserInterest = z.infer<typeof UserInterestSchema>;

// =====================
// RECOMMENDATIONS
// =====================

export const RecommendationTypeSchema = z.enum(['search_query', 'content', 'topic', 'action', 'tool', 'workflow']);
export type RecommendationType = z.infer<typeof RecommendationTypeSchema>;

export const RecommendationCategorySchema = z.enum(['suggestion', 'related', 'trending', 'new', 'popular', 'curated']);
export type RecommendationCategory = z.infer<typeof RecommendationCategorySchema>;

export const PersonalizedRecommendationSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  
  // Recommendation details
  recommendationType: RecommendationTypeSchema,
  recommendationCategory: RecommendationCategorySchema,
  recommendationTitle: z.string().min(1).max(255),
  recommendationDescription: z.string().optional(),
  
  // Content
  recommendationData: z.record(z.unknown()),
  contextData: z.record(z.unknown()),
  
  // Scoring
  relevanceScore: z.number().min(0).max(1),
  confidenceScore: z.number().min(0).max(1),
  noveltyScore: z.number().min(0).max(1),
  diversityScore: z.number().min(0).max(1),
  
  // Metadata
  generatedByModel: z.string(),
  modelVersion: z.string().optional(),
  generationFactors: z.array(PersonalizationFactorSchema),
  
  // User interaction
  presentedAt: z.date().optional(),
  clickedAt: z.date().optional(),
  dismissedAt: z.date().optional(),
  feedbackScore: z.number().int().min(-2).max(2).optional(), // -2 to +2
  implicitFeedback: z.record(z.unknown()),
  
  // Lifecycle
  isActive: z.boolean(),
  expiresAt: z.date().optional(),
  priorityScore: z.number().int().min(0).max(100),
  
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type PersonalizedRecommendation = z.infer<typeof PersonalizedRecommendationSchema>;

// =====================
// A/B TESTING EXPERIMENTS
// =====================

export const ExperimentTypeSchema = z.enum(['ui_variant', 'algorithm', 'ranking', 'interface', 'feature']);
export type ExperimentType = z.infer<typeof ExperimentTypeSchema>;

export const PersonalizationExperimentSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  
  // Experiment details
  experimentName: z.string().min(1).max(255),
  experimentType: ExperimentTypeSchema,
  variantName: z.string().min(1).max(100),
  experimentDescription: z.string().optional(),
  
  // Configuration
  experimentConfig: z.record(z.unknown()),
  startDate: z.date(),
  endDate: z.date(),
  
  // Assignment
  assignedAt: z.date(),
  assignmentHash: z.string(),
  isActive: z.boolean(),
  
  // Tracking
  interactions: z.array(z.record(z.unknown())),
  conversions: z.array(z.record(z.unknown())),
  feedback: z.record(z.unknown()),
  
  // Metrics
  engagementScore: z.number().min(0).max(1).optional(),
  satisfactionScore: z.number().min(0).max(1).optional(),
  taskSuccessRate: z.number().min(0).max(1).optional(),
  
  createdAt: z.date(),
});

export type PersonalizationExperiment = z.infer<typeof PersonalizationExperimentSchema>;

// =====================
// SERVICE INTERFACES
// =====================

export interface PersonalizationEngine {
  // Profile management
  getPersonalizationProfile(userId: string): Promise<UserPersonalizationProfile>;
  updatePersonalizationProfile(userId: string, updates: Partial<UserPersonalizationProfile>): Promise<UserPersonalizationProfile>;
  resetPersonalizationProfile(userId: string): Promise<UserPersonalizationProfile>;
  
  // Personalized search
  personalizeSearchResults(
    userId: string,
    originalResults: any[],
    query: string,
    context?: Record<string, any>
  ): Promise<PersonalizedSearchResults>;
  
  // Real-time adaptation
  adaptInterface(
    userId: string,
    baseInterface: Record<string, any>,
    context?: Record<string, any>
  ): Promise<Record<string, any>>;
}

export interface RecommendationSystem {
  // Generate recommendations
  generateRecommendations(
    userId: string,
    type: RecommendationType,
    count: number,
    context?: Record<string, any>
  ): Promise<PersonalizedRecommendation[]>;
  
  // Provide feedback
  provideFeedback(
    userId: string,
    recommendationId: string,
    feedbackScore: number,
    implicitSignals?: Record<string, any>
  ): Promise<void>;
  
  // Get active recommendations
  getActiveRecommendations(userId: string): Promise<PersonalizedRecommendation[]>;
}

export interface InterestModelingService {
  // Interest management
  getUserInterests(userId: string, activeOnly?: boolean): Promise<UserInterest[]>;
  addExplicitInterest(userId: string, interest: Partial<UserInterest>): Promise<UserInterest>;
  updateInterest(userId: string, interestId: string, updates: Partial<UserInterest>): Promise<UserInterest>;
  removeInterest(userId: string, interestId: string): Promise<void>;
  
  // Interest discovery
  extractInterestsFromBehavior(userId: string, events: any[]): Promise<UserInterest[]>;
  suggestInterests(userId: string, count: number): Promise<UserInterest[]>;
}

export interface AdaptiveInterfaceService {
  // Interface adaptation
  getAdaptiveLayout(userId: string, context?: Record<string, any>): Promise<Record<string, any>>;
  customizeSearchInterface(userId: string, preferences: InterfacePreferences): Promise<void>;
  
  // Cross-device sync
  syncPersonalizationAcrossDevices(userId: string): Promise<void>;
}

export interface PersonalizationExperimentService {
  // Experiment management
  assignUserToExperiment(userId: string, experimentName: string): Promise<PersonalizationExperiment>;
  trackExperimentInteraction(userId: string, experimentId: string, interaction: any): Promise<void>;
  getActiveExperiments(userId: string): Promise<PersonalizationExperiment[]>;
  
  // Experiment analysis
  recordExperimentConversion(userId: string, experimentId: string, conversionData: any): Promise<void>;
  calculateExperimentMetrics(experimentName: string): Promise<Record<string, any>>;
}

// =====================
// REQUEST/RESPONSE TYPES
// =====================

export const PersonalizeSearchRequestSchema = z.object({
  query: z.string().min(1),
  originalResults: z.array(z.record(z.unknown())),
  context: z.record(z.unknown()).optional(),
  userId: z.string().uuid().optional(), // Optional for anonymous users
});

export type PersonalizeSearchRequest = z.infer<typeof PersonalizeSearchRequestSchema>;

export const PersonalizeSearchResponseSchema = z.object({
  personalizedResults: z.array(z.record(z.unknown())),
  personalizationFactors: z.array(PersonalizationFactorSchema),
  confidenceScore: z.number().min(0).max(1),
  processingTimeMs: z.number().int(),
});

export type PersonalizeSearchResponse = z.infer<typeof PersonalizeSearchResponseSchema>;

export const RecommendationRequestSchema = z.object({
  userId: z.string().uuid(),
  type: RecommendationTypeSchema.optional(),
  category: RecommendationCategorySchema.optional(),
  count: z.number().int().min(1).max(50).default(10),
  context: z.record(z.unknown()).optional(),
});

export type RecommendationRequest = z.infer<typeof RecommendationRequestSchema>;

export const RecommendationResponseSchema = z.object({
  recommendations: z.array(PersonalizedRecommendationSchema),
  totalCount: z.number().int(),
  processingTimeMs: z.number().int(),
});

export type RecommendationResponse = z.infer<typeof RecommendationResponseSchema>;

// =====================
// EXPORT COLLECTIONS
// =====================

export const PersonalizationSchemas = {
  UserPersonalizationProfile: UserPersonalizationProfileSchema,
  PersonalizedSearchResults: PersonalizedSearchResultsSchema,
  UserInterest: UserInterestSchema,
  PersonalizedRecommendation: PersonalizedRecommendationSchema,
  PersonalizationExperiment: PersonalizationExperimentSchema,
  PersonalizeSearchRequest: PersonalizeSearchRequestSchema,
  PersonalizeSearchResponse: PersonalizeSearchResponseSchema,
  RecommendationRequest: RecommendationRequestSchema,
  RecommendationResponse: RecommendationResponseSchema,
} as const;

export type PersonalizationTypes = {
  UserPersonalizationProfile: UserPersonalizationProfile;
  PersonalizedSearchResults: PersonalizedSearchResults;
  UserInterest: UserInterest;
  PersonalizedRecommendation: PersonalizedRecommendation;
  PersonalizationExperiment: PersonalizationExperiment;
  PersonalizeSearchRequest: PersonalizeSearchRequest;
  PersonalizeSearchResponse: PersonalizeSearchResponse;
  RecommendationRequest: RecommendationRequest;
  RecommendationResponse: RecommendationResponse;
};