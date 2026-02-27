/**
 * PersonalizationEngine - Core service for adaptive search personalization
 * 
 * Provides comprehensive personalization capabilities:
 * - User profile management and preferences
 * - Multi-factor personalized search result ranking
 * - Real-time interface adaptation 
 * - Behavioral signal integration
 * - A/B testing framework integration
 */

import { 
  UserPersonalizationProfile, 
  PersonalizedSearchResults,
  PersonalizationFactor,
  SearchResultScore,
  PersonalizationEngine as IPersonalizationEngine,
  BehaviorWeights,
  TemporalFactors,
  ContextFactors,
  PersonalizationLevel
} from '@shared/types/personalization.js';
import { Database } from '@shared/utils/database.js';
import { logger } from '@shared/utils/logger.js';
import crypto from 'crypto';

export interface PersonalizationConfig {
  defaultPersonalizationLevel: PersonalizationLevel;
  minConfidenceThreshold: number;
  maxPersonalizationBoost: number;
  behaviorSignalWeights: BehaviorWeights;
  temporalDecayRate: number;
  diversityThreshold: number;
  enableRealTimeAdaptation: boolean;
  cachePersonalizationResults: boolean;
}

export class PersonalizationEngine implements IPersonalizationEngine {
  private db: Database;
  private config: PersonalizationConfig;
  private profileCache = new Map<string, UserPersonalizationProfile>();

  constructor(database: Database, config: PersonalizationConfig) {
    this.db = database;
    this.config = config;
  }

  /**
   * Get user's personalization profile, creating default if none exists
   */
  async getPersonalizationProfile(userId: string): Promise<UserPersonalizationProfile> {
    try {
      // Check cache first
      if (this.profileCache.has(userId)) {
        return this.profileCache.get(userId)!;
      }

      // Query database
      const profile = await this.db.selectFrom('user_personalization_profiles')
        .selectAll()
        .where('user_id', '=', userId)
        .where('is_active', '=', true)
        .where('is_default', '=', true)
        .executeTakeFirst();

      if (profile) {
        const typedProfile = this.mapDatabaseProfileToType(profile);
        this.profileCache.set(userId, typedProfile);
        return typedProfile;
      }

      // Create default profile if none exists
      const defaultProfile = await this.createDefaultProfile(userId);
      this.profileCache.set(userId, defaultProfile);
      
      logger.info(`Created default personalization profile for user ${userId}`);
      return defaultProfile;

    } catch (error) {
      logger.error(`Error getting personalization profile for user ${userId}:`, error);
      throw new Error(`Failed to get personalization profile: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Update user's personalization profile
   */
  async updatePersonalizationProfile(
    userId: string, 
    updates: Partial<UserPersonalizationProfile>
  ): Promise<UserPersonalizationProfile> {
    try {
      const updatedAt = new Date();

      const result = await this.db.updateTable('user_personalization_profiles')
        .set({
          ...this.mapTypeToDatabase(updates),
          updated_at: updatedAt,
          last_used_at: updatedAt
        })
        .where('user_id', '=', userId)
        .where('is_active', '=', true)
        .where('is_default', '=', true)
        .returningAll()
        .executeTakeFirst();

      if (!result) {
        throw new Error(`Personalization profile not found for user ${userId}`);
      }

      const updatedProfile = this.mapDatabaseProfileToType(result);
      this.profileCache.set(userId, updatedProfile);
      
      logger.info(`Updated personalization profile for user ${userId}`);
      return updatedProfile;

    } catch (error) {
      logger.error(`Error updating personalization profile for user ${userId}:`, error);
      throw new Error(`Failed to update personalization profile: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Reset user's profile to default settings
   */
  async resetPersonalizationProfile(userId: string): Promise<UserPersonalizationProfile> {
    try {
      // Deactivate current profile
      await this.db.updateTable('user_personalization_profiles')
        .set({ is_active: false })
        .where('user_id', '=', userId)
        .execute();

      // Create new default profile
      const defaultProfile = await this.createDefaultProfile(userId);
      this.profileCache.delete(userId);
      
      logger.info(`Reset personalization profile for user ${userId}`);
      return defaultProfile;

    } catch (error) {
      logger.error(`Error resetting personalization profile for user ${userId}:`, error);
      throw new Error(`Failed to reset personalization profile: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Personalize search results based on user profile and behavior
   */
  async personalizeSearchResults(
    userId: string,
    originalResults: any[],
    query: string,
    context?: Record<string, any>
  ): Promise<PersonalizedSearchResults> {
    try {
      const startTime = Date.now();
      const profile = await this.getPersonalizationProfile(userId);

      if (!profile.learningEnabled || profile.personalizationLevel === 'low') {
        // Return minimal personalization for privacy-conscious users
        return this.createMinimalPersonalizedResults(userId, originalResults, query, context);
      }

      // Calculate personalization factors
      const factors = await this.calculatePersonalizationFactors(userId, query, context);
      
      // Score and rank results
      const scoredResults = await this.scoreResults(originalResults, factors, profile);
      
      // Apply personalization
      const personalizedResults = this.reorderResults(originalResults, scoredResults);
      
      // Create result record
      const result = await this.createPersonalizedSearchResults(
        userId,
        originalResults,
        personalizedResults,
        scoredResults,
        factors,
        query,
        context,
        startTime
      );

      // Update profile usage
      await this.updateProfileLastUsed(userId);

      logger.debug(`Personalized ${originalResults.length} results for user ${userId}`);
      return result;

    } catch (error) {
      logger.error(`Error personalizing search results for user ${userId}:`, error);
      throw new Error(`Failed to personalize search results: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Adapt interface based on user preferences and patterns
   */
  async adaptInterface(
    userId: string,
    baseInterface: Record<string, any>,
    context?: Record<string, any>
  ): Promise<Record<string, any>> {
    try {
      const profile = await this.getPersonalizationProfile(userId);
      
      if (!profile.learningEnabled) {
        return baseInterface;
      }

      const adaptedInterface = { ...baseInterface };

      // Apply interface preferences
      if (profile.interfacePreferences) {
        this.applyInterfacePreferences(adaptedInterface, profile.interfacePreferences);
      }

      // Apply search preferences
      if (profile.searchPreferences) {
        this.applySearchPreferences(adaptedInterface, profile.searchPreferences);
      }

      // Apply contextual adaptations
      if (context && profile.contextFactors) {
        this.applyContextualAdaptations(adaptedInterface, profile.contextFactors, context);
      }

      logger.debug(`Adapted interface for user ${userId}`);
      return adaptedInterface;

    } catch (error) {
      logger.error(`Error adapting interface for user ${userId}:`, error);
      return baseInterface; // Fallback to base interface on error
    }
  }

  // =====================
  // PRIVATE METHODS
  // =====================

  /**
   * Create default personalization profile for new user
   */
  private async createDefaultProfile(userId: string): Promise<UserPersonalizationProfile> {
    const now = new Date();
    const profileId = crypto.randomUUID();

    const defaultProfile = {
      id: profileId,
      user_id: userId,
      profile_name: 'Default',
      profile_description: 'Default personalization profile',
      is_active: true,
      is_default: true,
      search_preferences: {},
      result_preferences: {},
      interface_preferences: {},
      personalization_level: this.config.defaultPersonalizationLevel,
      learning_enabled: true,
      suggestion_enabled: true,
      recommendation_enabled: true,
      behavior_weights: this.config.behaviorSignalWeights,
      temporal_factors: {},
      context_factors: {},
      created_at: now,
      updated_at: now,
      last_used_at: now
    };

    await this.db.insertInto('user_personalization_profiles')
      .values(defaultProfile)
      .execute();

    return this.mapDatabaseProfileToType(defaultProfile);
  }

  /**
   * Calculate personalization factors for a search query
   */
  private async calculatePersonalizationFactors(
    userId: string,
    query: string,
    context?: Record<string, any>
  ): Promise<PersonalizationFactor[]> {
    const factors: PersonalizationFactor[] = [];

    try {
      // User interest factors
      const interests = await this.getUserInterestFactors(userId, query);
      factors.push(...interests);

      // Behavioral factors
      const behavioral = await this.getBehavioralFactors(userId, query);
      factors.push(...behavioral);

      // Temporal factors
      const temporal = this.getTemporalFactors(userId, context);
      factors.push(...temporal);

      // Contextual factors
      const contextual = this.getContextualFactors(userId, context);
      factors.push(...contextual);

      return factors;

    } catch (error) {
      logger.error(`Error calculating personalization factors for user ${userId}:`, error);
      return [];
    }
  }

  /**
   * Get user interest-based personalization factors
   */
  private async getUserInterestFactors(userId: string, query: string): Promise<PersonalizationFactor[]> {
    const factors: PersonalizationFactor[] = [];

    try {
      const interests = await this.db.selectFrom('user_interest_profiles')
        .selectAll()
        .where('user_id', '=', userId)
        .where('is_active', '=', true)
        .orderBy('affinity_score', 'desc')
        .limit(10)
        .execute();

      for (const interest of interests) {
        // Check if query relates to this interest
        const relevance = this.calculateQueryInterestRelevance(query, interest);
        
        if (relevance > 0.1) {
          factors.push({
            factorType: 'interest',
            factorName: `${interest.interest_type}:${interest.interest_name}`,
            weight: parseFloat(interest.affinity_score.toString()),
            contribution: relevance * parseFloat(interest.affinity_score.toString()),
            explanation: `User has shown ${interest.affinity_score} affinity for ${interest.interest_name}`
          });
        }
      }

      return factors;

    } catch (error) {
      logger.error(`Error getting user interest factors for user ${userId}:`, error);
      return [];
    }
  }

  /**
   * Get behavioral personalization factors
   */
  private async getBehavioralFactors(userId: string, query: string): Promise<PersonalizationFactor[]> {
    const factors: PersonalizationFactor[] = [];

    try {
      // Get recent behavior patterns related to similar queries
      const patterns = await this.db.selectFrom('user_search_patterns')
        .selectAll()
        .where('user_id', '=', userId)
        .where('is_active', '=', true)
        .where('pattern_type', 'in', ['query_style', 'content_preference', 'interaction_pattern'])
        .orderBy('confidence_score', 'desc')
        .limit(5)
        .execute();

      for (const pattern of patterns) {
        const relevance = this.calculatePatternQueryRelevance(query, pattern);
        
        if (relevance > 0.2) {
          factors.push({
            factorType: 'behavior',
            factorName: pattern.pattern_name,
            weight: parseFloat(pattern.confidence_score?.toString() || '0'),
            contribution: relevance * parseFloat(pattern.confidence_score?.toString() || '0'),
            explanation: `Behavioral pattern: ${pattern.pattern_description}`
          });
        }
      }

      return factors;

    } catch (error) {
      logger.error(`Error getting behavioral factors for user ${userId}:`, error);
      return [];
    }
  }

  /**
   * Get temporal personalization factors
   */
  private getTemporalFactors(userId: string, context?: Record<string, any>): PersonalizationFactor[] {
    const factors: PersonalizationFactor[] = [];
    const now = new Date();
    const hour = now.getHours();
    const dayOfWeek = now.getDay();

    // Time of day factor
    const timeOfDayWeight = this.getTimeOfDayWeight(hour);
    if (timeOfDayWeight !== 1.0) {
      factors.push({
        factorType: 'temporal',
        factorName: 'time_of_day',
        weight: 0.3,
        contribution: (timeOfDayWeight - 1.0) * 0.3,
        explanation: `Adjusted for time of day (${hour}:00)`
      });
    }

    // Day of week factor
    const dayOfWeekWeight = this.getDayOfWeekWeight(dayOfWeek);
    if (dayOfWeekWeight !== 1.0) {
      factors.push({
        factorType: 'temporal',
        factorName: 'day_of_week',
        weight: 0.2,
        contribution: (dayOfWeekWeight - 1.0) * 0.2,
        explanation: `Adjusted for day of week`
      });
    }

    return factors;
  }

  /**
   * Get contextual personalization factors
   */
  private getContextualFactors(userId: string, context?: Record<string, any>): PersonalizationFactor[] {
    const factors: PersonalizationFactor[] = [];

    if (!context) return factors;

    // Device type factor
    if (context.deviceType) {
      const deviceWeight = this.getDeviceTypeWeight(context.deviceType);
      if (deviceWeight !== 1.0) {
        factors.push({
          factorType: 'contextual',
          factorName: 'device_type',
          weight: 0.2,
          contribution: (deviceWeight - 1.0) * 0.2,
          explanation: `Adjusted for device type: ${context.deviceType}`
        });
      }
    }

    // Location factor
    if (context.location) {
      factors.push({
        factorType: 'contextual',
        factorName: 'location',
        weight: 0.1,
        contribution: 0.05,
        explanation: 'Adjusted for user location'
      });
    }

    return factors;
  }

  /**
   * Score search results using personalization factors
   */
  private async scoreResults(
    results: any[],
    factors: PersonalizationFactor[],
    profile: UserPersonalizationProfile
  ): Promise<SearchResultScore[]> {
    const scores: SearchResultScore[] = [];

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const baseScore = result.score || 1.0 - (i * 0.05); // Default scoring
      
      let personalizationBoost = 0;
      const appliedFactors: PersonalizationFactor[] = [];

      // Calculate personalization boost
      for (const factor of factors) {
        const resultRelevance = this.calculateFactorResultRelevance(result, factor);
        const boost = factor.contribution * resultRelevance;
        
        if (Math.abs(boost) > 0.01) {
          personalizationBoost += boost;
          appliedFactors.push({
            ...factor,
            contribution: boost
          });
        }
      }

      // Apply boost limits
      personalizationBoost = Math.max(
        -this.config.maxPersonalizationBoost,
        Math.min(this.config.maxPersonalizationBoost, personalizationBoost)
      );

      const finalScore = Math.max(0, Math.min(1, baseScore + personalizationBoost));

      scores.push({
        resultId: result.id || i.toString(),
        baseScore,
        personalizationBoost,
        finalScore,
        factors: appliedFactors
      });
    }

    return scores;
  }

  /**
   * Reorder results based on personalized scores
   */
  private reorderResults(originalResults: any[], scores: SearchResultScore[]): any[] {
    const resultsWithScores = originalResults.map((result, index) => ({
      result,
      score: scores[index]
    }));

    resultsWithScores.sort((a, b) => b.score.finalScore - a.score.finalScore);
    
    return resultsWithScores.map(item => item.result);
  }

  /**
   * Create personalized search results record
   */
  private async createPersonalizedSearchResults(
    userId: string,
    originalResults: any[],
    personalizedResults: any[],
    scores: SearchResultScore[],
    factors: PersonalizationFactor[],
    query: string,
    context: Record<string, any> = {},
    startTime: number
  ): Promise<PersonalizedSearchResults> {
    const responseTime = Date.now() - startTime;
    const now = new Date();

    const baseScores: Record<string, number> = {};
    const personalizationScores: Record<string, number> = {};
    const finalScores: Record<string, number> = {};

    scores.forEach(score => {
      baseScores[score.resultId] = score.baseScore;
      personalizationScores[score.resultId] = score.personalizationBoost;
      finalScores[score.resultId] = score.finalScore;
    });

    const confidenceScore = this.calculateOverallConfidence(factors);

    const result: PersonalizedSearchResults = {
      id: crypto.randomUUID(),
      userId,
      searchQuery: query,
      searchContext: context,
      originalResults,
      personalizedResults,
      personalizationApplied: {
        factorCount: factors.length,
        topFactors: factors.slice(0, 3),
        reorderingApplied: true
      },
      baseScores,
      personalizationScores,
      finalScores,
      resultsClicked: [],
      resultsSaved: [],
      resultsShared: [],
      sessionFeedback: {},
      personalizationModelVersion: '1.0.0',
      personalizationFactors: factors,
      confidenceScore,
      searchTimestamp: now,
      responseTimeMs: responseTime
    };

    // Store in database for analytics
    if (this.config.cachePersonalizationResults) {
      await this.storePersonalizedSearchResults(result);
    }

    return result;
  }

  /**
   * Create minimal personalized results for privacy-conscious users
   */
  private createMinimalPersonalizedResults(
    userId: string,
    originalResults: any[],
    query: string,
    context: Record<string, any> = {}
  ): PersonalizedSearchResults {
    return {
      id: crypto.randomUUID(),
      userId,
      searchQuery: query,
      searchContext: context,
      originalResults,
      personalizedResults: originalResults, // No reordering
      personalizationApplied: {
        factorCount: 0,
        personalizationDisabled: true
      },
      baseScores: {},
      personalizationScores: {},
      finalScores: {},
      resultsClicked: [],
      resultsSaved: [],
      resultsShared: [],
      sessionFeedback: {},
      personalizationModelVersion: '1.0.0',
      personalizationFactors: [],
      confidenceScore: 0,
      searchTimestamp: new Date(),
      responseTimeMs: 1
    };
  }

  // =====================
  // HELPER METHODS
  // =====================

  private calculateQueryInterestRelevance(query: string, interest: any): number {
    const queryLower = query.toLowerCase();
    const interestName = interest.interest_name.toLowerCase();
    const keywords = interest.interest_keywords || [];

    let relevance = 0;

    // Direct name match
    if (queryLower.includes(interestName) || interestName.includes(queryLower)) {
      relevance += 0.8;
    }

    // Keyword matches
    for (const keyword of keywords) {
      if (typeof keyword === 'string' && queryLower.includes(keyword.toLowerCase())) {
        relevance += 0.1;
      }
    }

    return Math.min(1.0, relevance);
  }

  private calculatePatternQueryRelevance(query: string, pattern: any): number {
    // Simple relevance calculation - in production, use NLP/embeddings
    const patternData = pattern.pattern_data || {};
    const relatedTerms = patternData.relatedTerms || [];
    
    let relevance = 0;
    for (const term of relatedTerms) {
      if (typeof term === 'string' && query.toLowerCase().includes(term.toLowerCase())) {
        relevance += 0.2;
      }
    }

    return Math.min(1.0, relevance);
  }

  private calculateFactorResultRelevance(result: any, factor: PersonalizationFactor): number {
    // Simple relevance calculation based on result content
    const resultText = (result.title + ' ' + (result.description || '')).toLowerCase();
    const factorName = factor.factorName.toLowerCase();
    
    if (resultText.includes(factorName)) {
      return 1.0;
    }
    
    // More sophisticated matching could be implemented here
    return 0.5; // Default moderate relevance
  }

  private calculateOverallConfidence(factors: PersonalizationFactor[]): number {
    if (factors.length === 0) return 0;
    
    const totalContribution = factors.reduce((sum, factor) => 
      sum + Math.abs(factor.contribution) * factor.weight, 0
    );
    
    return Math.min(1.0, totalContribution / factors.length);
  }

  private getTimeOfDayWeight(hour: number): number {
    // Simple time-based weighting - peak hours get slight boost
    if (hour >= 9 && hour <= 17) {
      return 1.1; // Work hours boost
    } else if (hour >= 19 && hour <= 22) {
      return 1.05; // Evening boost
    }
    return 1.0;
  }

  private getDayOfWeekWeight(day: number): number {
    // 0 = Sunday, 1 = Monday, etc.
    if (day >= 1 && day <= 5) {
      return 1.05; // Weekday boost
    }
    return 1.0;
  }

  private getDeviceTypeWeight(deviceType: string): number {
    switch (deviceType) {
      case 'mobile':
        return 1.1; // Mobile gets slight boost for local/quick results
      case 'desktop':
        return 1.0; // Baseline
      case 'tablet':
        return 1.02;
      default:
        return 1.0;
    }
  }

  private applyInterfacePreferences(interface: Record<string, any>, preferences: any): void {
    if (preferences.theme) {
      interface.theme = preferences.theme;
    }
    if (preferences.density) {
      interface.density = preferences.density;
    }
    if (typeof preferences.animation === 'boolean') {
      interface.animations = preferences.animation;
    }
  }

  private applySearchPreferences(interface: Record<string, any>, preferences: any): void {
    if (preferences.resultsPerPage) {
      interface.resultsPerPage = preferences.resultsPerPage;
    }
    if (preferences.displayFormat) {
      interface.displayFormat = preferences.displayFormat;
    }
    if (typeof preferences.showPreviews === 'boolean') {
      interface.showPreviews = preferences.showPreviews;
    }
  }

  private applyContextualAdaptations(
    interface: Record<string, any>, 
    factors: ContextFactors, 
    context: Record<string, any>
  ): void {
    // Apply device-specific adaptations
    if (context.deviceType && factors.deviceFactors) {
      const deviceFactor = factors.deviceFactors[context.deviceType];
      if (deviceFactor && deviceFactor > 1.0) {
        interface.mobileOptimized = true;
      }
    }
  }

  private async updateProfileLastUsed(userId: string): Promise<void> {
    try {
      await this.db.updateTable('user_personalization_profiles')
        .set({ last_used_at: new Date() })
        .where('user_id', '=', userId)
        .where('is_active', '=', true)
        .where('is_default', '=', true)
        .execute();
    } catch (error) {
      logger.error(`Error updating profile last used for user ${userId}:`, error);
    }
  }

  private async storePersonalizedSearchResults(results: PersonalizedSearchResults): Promise<void> {
    try {
      await this.db.insertInto('personalized_search_results')
        .values({
          id: results.id,
          user_id: results.userId,
          search_query: results.searchQuery,
          search_context: JSON.stringify(results.searchContext),
          original_results: JSON.stringify(results.originalResults),
          personalized_results: JSON.stringify(results.personalizedResults),
          personalization_applied: JSON.stringify(results.personalizationApplied),
          base_scores: JSON.stringify(results.baseScores),
          personalization_scores: JSON.stringify(results.personalizationScores),
          final_scores: JSON.stringify(results.finalScores),
          personalization_model_version: results.personalizationModelVersion,
          personalization_factors: JSON.stringify(results.personalizationFactors),
          confidence_score: results.confidenceScore,
          search_timestamp: results.searchTimestamp,
          response_time_ms: results.responseTimeMs
        })
        .execute();
    } catch (error) {
      logger.error('Error storing personalized search results:', error);
    }
  }

  // Type mapping helpers
  private mapDatabaseProfileToType(dbProfile: any): UserPersonalizationProfile {
    return {
      id: dbProfile.id,
      userId: dbProfile.user_id,
      profileName: dbProfile.profile_name,
      profileDescription: dbProfile.profile_description,
      isActive: dbProfile.is_active,
      isDefault: dbProfile.is_default,
      searchPreferences: dbProfile.search_preferences || {},
      resultPreferences: dbProfile.result_preferences || {},
      interfacePreferences: dbProfile.interface_preferences || {},
      personalizationLevel: dbProfile.personalization_level,
      learningEnabled: dbProfile.learning_enabled,
      suggestionEnabled: dbProfile.suggestion_enabled,
      recommendationEnabled: dbProfile.recommendation_enabled,
      behaviorWeights: dbProfile.behavior_weights || {},
      temporalFactors: dbProfile.temporal_factors || {},
      contextFactors: dbProfile.context_factors || {},
      createdAt: dbProfile.created_at,
      updatedAt: dbProfile.updated_at,
      lastUsedAt: dbProfile.last_used_at
    };
  }

  private mapTypeToDatabase(profile: Partial<UserPersonalizationProfile>): any {
    const mapped: any = {};
    
    if (profile.profileName !== undefined) mapped.profile_name = profile.profileName;
    if (profile.profileDescription !== undefined) mapped.profile_description = profile.profileDescription;
    if (profile.isActive !== undefined) mapped.is_active = profile.isActive;
    if (profile.isDefault !== undefined) mapped.is_default = profile.isDefault;
    if (profile.searchPreferences !== undefined) mapped.search_preferences = profile.searchPreferences;
    if (profile.resultPreferences !== undefined) mapped.result_preferences = profile.resultPreferences;
    if (profile.interfacePreferences !== undefined) mapped.interface_preferences = profile.interfacePreferences;
    if (profile.personalizationLevel !== undefined) mapped.personalization_level = profile.personalizationLevel;
    if (profile.learningEnabled !== undefined) mapped.learning_enabled = profile.learningEnabled;
    if (profile.suggestionEnabled !== undefined) mapped.suggestion_enabled = profile.suggestionEnabled;
    if (profile.recommendationEnabled !== undefined) mapped.recommendation_enabled = profile.recommendationEnabled;
    if (profile.behaviorWeights !== undefined) mapped.behavior_weights = profile.behaviorWeights;
    if (profile.temporalFactors !== undefined) mapped.temporal_factors = profile.temporalFactors;
    if (profile.contextFactors !== undefined) mapped.context_factors = profile.contextFactors;

    return mapped;
  }
}