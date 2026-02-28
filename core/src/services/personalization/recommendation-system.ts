/**
 * RecommendationSystem - Advanced personalized content recommendation service
 * 
 * Provides sophisticated recommendation capabilities:
 * - Content-based filtering using user interests and preferences
 * - Collaborative filtering based on similar user behavior
 * - Hybrid recommendations combining multiple approaches
 * - Real-time recommendation generation and scoring
 * - Feedback learning and recommendation improvement
 */

import {
  PersonalizedRecommendation,
  RecommendationType,
  RecommendationCategory,
  UserInterest,
  RecommendationSystem as IRecommendationSystem,
  PersonalizationFactor
} from '@shared/types/personalization.js';
import { Database } from '@shared/utils/database.js';
import { logger } from '@shared/utils/logger.js';

export interface RecommendationConfig {
  maxRecommendationsPerType: number;
  minConfidenceThreshold: number;
  diversityThreshold: number;
  noveltyWeight: number;
  popularityWeight: number;
  personalRelevanceWeight: number;
  enableCollaborativeFiltering: boolean;
  enableContentBasedFiltering: boolean;
  enableHybridRecommendations: boolean;
  recommendationTTL: number; // Time to live in minutes
}

export interface SimilarUser {
  userId: string;
  similarityScore: number;
  commonInterests: string[];
  behaviorAlignment: number;
}

export class RecommendationSystem implements IRecommendationSystem {
  private db: Database;
  private config: RecommendationConfig;
  private recommendationCache = new Map<string, PersonalizedRecommendation[]>();

  constructor(database: Database, config: RecommendationConfig) {
    this.db = database;
    this.config = config;
  }

  /**
   * Generate personalized recommendations for a user
   */
  async generateRecommendations(
    userId: string,
    type: RecommendationType = 'content',
    count: number = 10,
    context?: Record<string, any>
  ): Promise<PersonalizedRecommendation[]> {
    try {
      const startTime = Date.now();
      
      // Check cache first
      const cacheKey = `${userId}:${type}:${count}`;
      if (this.recommendationCache.has(cacheKey)) {
        const cached = this.recommendationCache.get(cacheKey)!;
        if (this.isRecommendationFresh(cached[0])) {
          logger.debug(`Using cached recommendations for user ${userId}`);
          return cached;
        }
      }

      // Generate new recommendations
      let recommendations: PersonalizedRecommendation[] = [];

      if (this.config.enableContentBasedFiltering) {
        const contentBased = await this.generateContentBasedRecommendations(
          userId, type, count, context
        );
        recommendations.push(...contentBased);
      }

      if (this.config.enableCollaborativeFiltering) {
        const collaborative = await this.generateCollaborativeRecommendations(
          userId, type, Math.ceil(count / 2), context
        );
        recommendations.push(...collaborative);
      }

      if (this.config.enableHybridRecommendations && recommendations.length > 0) {
        recommendations = this.createHybridRecommendations(recommendations, count);
      }

      // Score and rank recommendations
      recommendations = await this.scoreAndRankRecommendations(recommendations, userId, context);

      // Apply diversity filtering
      recommendations = this.ensureRecommendationDiversity(recommendations);

      // Limit to requested count
      recommendations = recommendations.slice(0, count);

      // Store recommendations
      await this.storeRecommendations(recommendations);

      // Cache recommendations
      this.recommendationCache.set(cacheKey, recommendations);

      const processingTime = Date.now() - startTime;
      logger.info(`Generated ${recommendations.length} recommendations for user ${userId} in ${processingTime}ms`);

      return recommendations;

    } catch (error) {
      logger.error(`Error generating recommendations for user ${userId}:`, error);
      throw new Error(`Failed to generate recommendations: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Provide feedback on a recommendation
   */
  async provideFeedback(
    userId: string,
    recommendationId: string,
    feedbackScore: number,
    implicitSignals?: Record<string, any>
  ): Promise<void> {
    try {
      const now = new Date();
      
      // Update recommendation with feedback
      await this.db.updateTable('personalized_recommendations')
        .set({
          feedback_score: feedbackScore,
          implicit_feedback: JSON.stringify(implicitSignals || {}),
          updated_at: now
        })
        .where('id', '=', recommendationId)
        .where('user_id', '=', userId)
        .execute();

      // Learn from feedback to improve future recommendations
      await this.learnFromFeedback(userId, recommendationId, feedbackScore, implicitSignals);

      logger.debug(`Recorded feedback ${feedbackScore} for recommendation ${recommendationId}`);

    } catch (error) {
      logger.error(`Error providing feedback for recommendation ${recommendationId}:`, error);
      throw new Error(`Failed to provide feedback: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get active recommendations for a user
   */
  async getActiveRecommendations(userId: string): Promise<PersonalizedRecommendation[]> {
    try {
      const recommendations = await this.db.selectFrom('personalized_recommendations')
        .selectAll()
        .where('user_id', '=', userId)
        .where('is_active', '=', true)
        .where('expires_at', '>', new Date())
        .orderBy('priority_score', 'desc')
        .orderBy('relevance_score', 'desc')
        .execute();

      return recommendations.map(rec => this.mapDatabaseToRecommendation(rec));

    } catch (error) {
      logger.error(`Error getting active recommendations for user ${userId}:`, error);
      throw new Error(`Failed to get active recommendations: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // =====================
  // CONTENT-BASED FILTERING
  // =====================

  /**
   * Generate content-based recommendations using user interests
   */
  private async generateContentBasedRecommendations(
    userId: string,
    type: RecommendationType,
    count: number,
    context?: Record<string, any>
  ): Promise<PersonalizedRecommendation[]> {
    const recommendations: PersonalizedRecommendation[] = [];

    try {
      // Get user interests
      const interests = await this.getUserActiveInterests(userId);
      if (interests.length === 0) {
        return recommendations;
      }

      // Generate recommendations based on each interest
      for (const interest of interests.slice(0, 5)) { // Limit to top 5 interests
        const interestRecommendations = await this.generateInterestBasedRecommendations(
          userId, interest, type, Math.ceil(count / interests.length), context
        );
        recommendations.push(...interestRecommendations);
      }

      return recommendations;

    } catch (error) {
      logger.error(`Error generating content-based recommendations for user ${userId}:`, error);
      return [];
    }
  }

  /**
   * Generate recommendations based on specific user interest
   */
  private async generateInterestBasedRecommendations(
    userId: string,
    interest: UserInterest,
    type: RecommendationType,
    count: number,
    context?: Record<string, any>
  ): Promise<PersonalizedRecommendation[]> {
    const recommendations: PersonalizedRecommendation[] = [];

    try {
      switch (type) {
        case 'search_query':
          recommendations.push(...await this.generateQueryRecommendations(userId, interest, count));
          break;
        case 'content':
          recommendations.push(...await this.generateContentRecommendations(userId, interest, count));
          break;
        case 'topic':
          recommendations.push(...await this.generateTopicRecommendations(userId, interest, count));
          break;
        case 'action':
          recommendations.push(...await this.generateActionRecommendations(userId, interest, count));
          break;
      }

      return recommendations;

    } catch (error) {
      logger.error(`Error generating interest-based recommendations:`, error);
      return [];
    }
  }

  /**
   * Generate search query recommendations
   */
  private async generateQueryRecommendations(
    userId: string,
    interest: UserInterest,
    count: number
  ): Promise<PersonalizedRecommendation[]> {
    const recommendations: PersonalizedRecommendation[] = [];

    // Generate query suggestions based on interest keywords
    const keywords = interest.interestKeywords || [];
    const relatedQueries = interest.relatedQueries || [];

    const allQueries = [...relatedQueries, ...this.generateKeywordCombinations(keywords)];

    for (let i = 0; i < Math.min(count, allQueries.length); i++) {
      const query = allQueries[i];
      if (typeof query === 'string' && query.trim()) {
        recommendations.push(this.createRecommendation(
          userId,
          'search_query',
          'suggestion',
          `Try searching: "${query}"`,
          `Based on your interest in ${interest.interestName}`,
          { query, interestId: interest.id },
          interest.affinityScore,
          0.8, // High confidence for query suggestions
          0.6, // Moderate novelty
          0.7  // Good diversity contribution
        ));
      }
    }

    return recommendations;
  }

  /**
   * Generate content recommendations
   */
  private async generateContentRecommendations(
    userId: string,
    interest: UserInterest,
    count: number
  ): Promise<PersonalizedRecommendation[]> {
    const recommendations: PersonalizedRecommendation[] = [];

    // Look for content related to user's interests
    // In a real implementation, this would query a content database
    const contentExamples = interest.contentExamples || [];

    for (let i = 0; i < Math.min(count, contentExamples.length); i++) {
      const content = contentExamples[i];
      if (typeof content === 'object' && content !== null) {
        recommendations.push(this.createRecommendation(
          userId,
          'content',
          'related',
          content.title || `Content related to ${interest.interestName}`,
          `Recommended based on your interest in ${interest.interestName}`,
          content,
          interest.affinityScore * 0.9,
          0.7,
          0.5,
          0.8
        ));
      }
    }

    return recommendations;
  }

  /**
   * Generate topic recommendations
   */
  private async generateTopicRecommendations(
    userId: string,
    interest: UserInterest,
    count: number
  ): Promise<PersonalizedRecommendation[]> {
    const recommendations: PersonalizedRecommendation[] = [];

    // Generate related topic suggestions
    const relatedTopics = this.generateRelatedTopics(interest);

    for (let i = 0; i < Math.min(count, relatedTopics.length); i++) {
      const topic = relatedTopics[i];
      recommendations.push(this.createRecommendation(
        userId,
        'topic',
        'related',
        `Explore: ${topic}`,
        `Related to your interest in ${interest.interestName}`,
        { topic, sourceInterest: interest.interestName },
        interest.affinityScore * 0.8,
        0.6,
        0.8, // High novelty for new topics
        0.9  // High diversity contribution
      ));
    }

    return recommendations;
  }

  /**
   * Generate action recommendations
   */
  private async generateActionRecommendations(
    userId: string,
    interest: UserInterest,
    count: number
  ): Promise<PersonalizedRecommendation[]> {
    const recommendations: PersonalizedRecommendation[] = [];

    const actions = [
      {
        action: 'save_search',
        title: `Save searches about ${interest.interestName}`,
        description: 'Get notified when new content is available'
      },
      {
        action: 'create_alert',
        title: `Set up alerts for ${interest.interestName}`,
        description: 'Stay updated with the latest information'
      },
      {
        action: 'explore_similar',
        title: `Find similar topics to ${interest.interestName}`,
        description: 'Discover related areas of interest'
      }
    ];

    for (let i = 0; i < Math.min(count, actions.length); i++) {
      const action = actions[i];
      recommendations.push(this.createRecommendation(
        userId,
        'action',
        'suggestion',
        action.title,
        action.description,
        { action: action.action, interestId: interest.id },
        interest.affinityScore * 0.7,
        0.8,
        0.7,
        0.6
      ));
    }

    return recommendations;
  }

  // =====================
  // COLLABORATIVE FILTERING
  // =====================

  /**
   * Generate collaborative filtering recommendations
   */
  private async generateCollaborativeRecommendations(
    userId: string,
    type: RecommendationType,
    count: number,
    context?: Record<string, any>
  ): Promise<PersonalizedRecommendation[]> {
    const recommendations: PersonalizedRecommendation[] = [];

    try {
      // Find similar users
      const similarUsers = await this.findSimilarUsers(userId, 10);
      
      if (similarUsers.length === 0) {
        return recommendations;
      }

      // Get recommendations from similar users' behavior
      for (const similarUser of similarUsers) {
        const userRecommendations = await this.getRecommendationsFromSimilarUser(
          userId, similarUser, type, Math.ceil(count / similarUsers.length)
        );
        recommendations.push(...userRecommendations);
      }

      return recommendations;

    } catch (error) {
      logger.error(`Error generating collaborative recommendations for user ${userId}:`, error);
      return [];
    }
  }

  /**
   * Find users with similar interests and behavior
   */
  private async findSimilarUsers(userId: string, limit: number): Promise<SimilarUser[]> {
    try {
      // Get current user's interests
      const userInterests = await this.getUserActiveInterests(userId);
      const userInterestNames = new Set(userInterests.map(i => i.interestName));

      // Find users with overlapping interests
      const similarUsersQuery = await this.db.selectFrom('user_interest_profiles as uip1')
        .innerJoin('user_interest_profiles as uip2', 'uip1.interest_name', 'uip2.interest_name')
        .select([
          'uip2.user_id',
          this.db.fn.count('uip1.id').as('common_interests'),
          this.db.fn.avg('uip2.affinity_score').as('avg_affinity')
        ])
        .where('uip1.user_id', '=', userId)
        .where('uip2.user_id', '!=', userId)
        .where('uip1.is_active', '=', true)
        .where('uip2.is_active', '=', true)
        .groupBy('uip2.user_id')
        .having(this.db.fn.count('uip1.id'), '>=', 2) // At least 2 common interests
        .orderBy('common_interests', 'desc')
        .orderBy('avg_affinity', 'desc')
        .limit(limit)
        .execute();

      const similarUsers: SimilarUser[] = [];

      for (const result of similarUsersQuery) {
        const commonInterestCount = Number(result.common_interests);
        const avgAffinity = Number(result.avg_affinity);
        
        // Calculate similarity score
        const similarityScore = this.calculateUserSimilarity(
          userInterests.length,
          commonInterestCount,
          avgAffinity
        );

        if (similarityScore > 0.1) {
          // Get common interests
          const commonInterests = await this.getCommonInterests(userId, result.user_id);
          
          similarUsers.push({
            userId: result.user_id,
            similarityScore,
            commonInterests,
            behaviorAlignment: avgAffinity
          });
        }
      }

      return similarUsers;

    } catch (error) {
      logger.error(`Error finding similar users for ${userId}:`, error);
      return [];
    }
  }

  /**
   * Get recommendations from similar user's behavior
   */
  private async getRecommendationsFromSimilarUser(
    userId: string,
    similarUser: SimilarUser,
    type: RecommendationType,
    count: number
  ): Promise<PersonalizedRecommendation[]> {
    const recommendations: PersonalizedRecommendation[] = [];

    try {
      // Get similar user's successful interactions
      const behaviorEvents = await this.db.selectFrom('user_behavior_events')
        .selectAll()
        .where('user_id', '=', similarUser.userId)
        .where('event_type', 'in', ['click', 'save', 'share'])
        .where('event_timestamp', '>', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)) // Last 30 days
        .orderBy('event_timestamp', 'desc')
        .limit(50)
        .execute();

      // Extract content/queries from successful interactions
      const interestingContent = this.extractContentFromBehavior(behaviorEvents);

      for (let i = 0; i < Math.min(count, interestingContent.length); i++) {
        const content = interestingContent[i];
        
        recommendations.push(this.createRecommendation(
          userId,
          type,
          'trending',
          `Similar users liked: ${content.title}`,
          `Recommended based on users with similar interests`,
          content,
          similarUser.similarityScore,
          0.6, // Moderate confidence for collaborative
          0.8, // High novelty
          0.7  // Good diversity
        ));
      }

      return recommendations;

    } catch (error) {
      logger.error(`Error getting recommendations from similar user ${similarUser.userId}:`, error);
      return [];
    }
  }

  // =====================
  // HYBRID RECOMMENDATIONS
  // =====================

  /**
   * Create hybrid recommendations combining multiple approaches
   */
  private createHybridRecommendations(
    recommendations: PersonalizedRecommendation[],
    targetCount: number
  ): PersonalizedRecommendation[] {
    // Group recommendations by source (content-based vs collaborative)
    const contentBased: PersonalizedRecommendation[] = [];
    const collaborative: PersonalizedRecommendation[] = [];

    for (const rec of recommendations) {
      const generatedBy = rec.generatedByModel;
      if (generatedBy.includes('content')) {
        contentBased.push(rec);
      } else if (generatedBy.includes('collaborative')) {
        collaborative.push(rec);
      }
    }

    // Merge recommendations with hybrid scoring
    const hybrid: PersonalizedRecommendation[] = [];
    const maxLength = Math.max(contentBased.length, collaborative.length);

    for (let i = 0; i < maxLength && hybrid.length < targetCount; i++) {
      // Alternate between content-based and collaborative
      if (i < contentBased.length) {
        const rec = contentBased[i];
        rec.generatedByModel = 'hybrid_content_based';
        hybrid.push(rec);
      }
      
      if (i < collaborative.length && hybrid.length < targetCount) {
        const rec = collaborative[i];
        rec.generatedByModel = 'hybrid_collaborative';
        hybrid.push(rec);
      }
    }

    return hybrid;
  }

  // =====================
  // SCORING AND RANKING
  // =====================

  /**
   * Score and rank recommendations
   */
  private async scoreAndRankRecommendations(
    recommendations: PersonalizedRecommendation[],
    userId: string,
    context?: Record<string, any>
  ): Promise<PersonalizedRecommendation[]> {
    // Apply additional scoring factors
    for (const rec of recommendations) {
      // Apply novelty boost for new content
      if (rec.noveltyScore > 0.8) {
        rec.relevanceScore *= (1 + this.config.noveltyWeight);
      }

      // Apply popularity adjustment (slight boost for popular items)
      const popularityBoost = this.calculatePopularityScore(rec);
      rec.relevanceScore *= (1 + popularityBoost * this.config.popularityWeight);

      // Calculate final priority score
      rec.priorityScore = Math.round(
        (rec.relevanceScore * 0.4 + 
         rec.confidenceScore * 0.3 + 
         rec.noveltyScore * 0.2 + 
         rec.diversityScore * 0.1) * 100
      );
    }

    // Sort by priority score
    recommendations.sort((a, b) => b.priorityScore - a.priorityScore);

    return recommendations;
  }

  /**
   * Ensure recommendation diversity
   */
  private ensureRecommendationDiversity(
    recommendations: PersonalizedRecommendation[]
  ): PersonalizedRecommendation[] {
    const diverse: PersonalizedRecommendation[] = [];
    const seenTypes = new Set<string>();
    const seenCategories = new Set<string>();

    for (const rec of recommendations) {
      const typeKey = `${rec.recommendationType}:${rec.recommendationCategory}`;
      
      // Skip if we have too many of this type/category combination
      if (seenTypes.has(typeKey) && seenTypes.size >= 3) {
        continue;
      }

      diverse.push(rec);
      seenTypes.add(typeKey);
      seenCategories.add(rec.recommendationCategory);
    }

    return diverse;
  }

  // =====================
  // HELPER METHODS
  // =====================

  private async getUserActiveInterests(userId: string): Promise<UserInterest[]> {
    try {
      const interests = await this.db.selectFrom('user_interest_profiles')
        .selectAll()
        .where('user_id', '=', userId)
        .where('is_active', '=', true)
        .orderBy('affinity_score', 'desc')
        .execute();

      return interests.map(interest => ({
        id: interest.id,
        userId: interest.user_id,
        interestType: interest.interest_type as any,
        interestName: interest.interest_name,
        interestDescription: interest.interest_description,
        affinityScore: parseFloat(interest.affinity_score.toString()),
        frequencyScore: parseFloat(interest.frequency_score.toString()),
        recencyScore: parseFloat(interest.recency_score.toString()),
        depthScore: parseFloat(interest.depth_score.toString()),
        interestKeywords: interest.interest_keywords || [],
        relatedQueries: interest.related_queries || [],
        contentExamples: interest.content_examples || [],
        firstDetectedAt: interest.first_detected_at,
        lastUpdatedAt: interest.last_updated_at,
        trendDirection: interest.trend_direction as any,
        trendStrength: parseFloat(interest.trend_strength.toString()),
        isActive: interest.is_active,
        isExplicit: interest.is_explicit,
        confidenceLevel: interest.confidence_level as any,
        createdAt: interest.created_at
      }));
    } catch (error) {
      logger.error(`Error getting user interests for ${userId}:`, error);
      return [];
    }
  }

  private generateKeywordCombinations(keywords: string[]): string[] {
    const combinations: string[] = [];
    
    // Single keywords
    for (const keyword of keywords) {
      if (typeof keyword === 'string') {
        combinations.push(keyword);
      }
    }

    // Two-keyword combinations
    for (let i = 0; i < keywords.length; i++) {
      for (let j = i + 1; j < keywords.length; j++) {
        if (typeof keywords[i] === 'string' && typeof keywords[j] === 'string') {
          combinations.push(`${keywords[i]} ${keywords[j]}`);
        }
      }
    }

    return combinations;
  }

  private generateRelatedTopics(interest: UserInterest): string[] {
    const related: string[] = [];
    
    // Simple topic expansion based on interest type
    switch (interest.interestType) {
      case 'topic':
        related.push(`Advanced ${interest.interestName}`);
        related.push(`${interest.interestName} tutorials`);
        related.push(`${interest.interestName} best practices`);
        break;
      case 'skill':
        related.push(`${interest.interestName} certifications`);
        related.push(`${interest.interestName} career paths`);
        break;
      case 'domain':
        related.push(`${interest.interestName} trends`);
        related.push(`${interest.interestName} tools`);
        break;
    }

    return related;
  }

  private calculateUserSimilarity(
    userInterestCount: number,
    commonInterestCount: number,
    avgAffinity: number
  ): number {
    // Jaccard similarity with affinity weighting
    const jaccard = commonInterestCount / (userInterestCount + commonInterestCount - commonInterestCount);
    const affinityWeight = avgAffinity / 1.0; // Normalize to 0-1
    return jaccard * affinityWeight;
  }

  private async getCommonInterests(userId1: string, userId2: string): Promise<string[]> {
    try {
      const commonInterests = await this.db.selectFrom('user_interest_profiles as uip1')
        .innerJoin('user_interest_profiles as uip2', 'uip1.interest_name', 'uip2.interest_name')
        .select('uip1.interest_name')
        .where('uip1.user_id', '=', userId1)
        .where('uip2.user_id', '=', userId2)
        .where('uip1.is_active', '=', true)
        .where('uip2.is_active', '=', true)
        .execute();

      return commonInterests.map(row => row.interest_name);
    } catch (error) {
      logger.error(`Error getting common interests:`, error);
      return [];
    }
  }

  private extractContentFromBehavior(events: any[]): any[] {
    const content: any[] = [];

    for (const event of events) {
      if (event.result_data && typeof event.result_data === 'object') {
        const resultData = event.result_data;
        content.push({
          title: resultData.title || 'Interesting content',
          description: resultData.description || '',
          source: resultData.source || '',
          url: resultData.url || '',
          type: resultData.type || 'content'
        });
      }
    }

    return content.slice(0, 10); // Limit to top 10
  }

  private calculatePopularityScore(recommendation: PersonalizedRecommendation): number {
    // Simple popularity calculation - in production, use real metrics
    const data = recommendation.recommendationData;
    if (data && typeof data === 'object' && data.views) {
      const views = Number(data.views) || 0;
      return Math.min(0.2, views / 10000); // Cap at 0.2 boost
    }
    return 0;
  }

  private createRecommendation(
    userId: string,
    type: RecommendationType,
    category: RecommendationCategory,
    title: string,
    description: string,
    data: Record<string, any>,
    relevanceScore: number,
    confidenceScore: number,
    noveltyScore: number,
    diversityScore: number
  ): PersonalizedRecommendation {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.config.recommendationTTL * 60 * 1000);

    return {
      id: crypto.randomUUID(),
      userId,
      recommendationType: type,
      recommendationCategory: category,
      recommendationTitle: title,
      recommendationDescription: description,
      recommendationData: data,
      contextData: {},
      relevanceScore: Math.min(1.0, relevanceScore),
      confidenceScore: Math.min(1.0, confidenceScore),
      noveltyScore: Math.min(1.0, noveltyScore),
      diversityScore: Math.min(1.0, diversityScore),
      generatedByModel: `recommendation_system_v1.0_${category}`,
      modelVersion: '1.0.0',
      generationFactors: [],
      presentedAt: undefined,
      clickedAt: undefined,
      dismissedAt: undefined,
      feedbackScore: undefined,
      implicitFeedback: {},
      isActive: true,
      expiresAt,
      priorityScore: 50,
      createdAt: now,
      updatedAt: now
    };
  }

  private async learnFromFeedback(
    userId: string,
    recommendationId: string,
    feedbackScore: number,
    implicitSignals?: Record<string, any>
  ): Promise<void> {
    try {
      // Get the recommendation to understand what was liked/disliked
      const recommendation = await this.db.selectFrom('personalized_recommendations')
        .selectAll()
        .where('id', '=', recommendationId)
        .executeTakeFirst();

      if (!recommendation) return;

      // Adjust user interests based on feedback
      if (feedbackScore >= 1) {
        // Positive feedback - boost related interests
        await this.boostRelatedInterests(userId, recommendation);
      } else if (feedbackScore <= -1) {
        // Negative feedback - reduce related interests
        await this.reduceRelatedInterests(userId, recommendation);
      }

      logger.debug(`Learned from feedback ${feedbackScore} for user ${userId}`);
    } catch (error) {
      logger.error(`Error learning from feedback:`, error);
    }
  }

  private async boostRelatedInterests(userId: string, recommendation: any): Promise<void> {
    // Simple learning - boost interests that match recommendation content
    const data = recommendation.recommendation_data;
    if (data && typeof data === 'object') {
      const keywords = this.extractKeywordsFromRecommendation(data);
      
      for (const keyword of keywords) {
        await this.db.updateTable('user_interest_profiles')
          .set(eb => ({
            affinity_score: eb('affinity_score', '+', 0.05), // Small boost
            last_updated_at: new Date()
          }))
          .where('user_id', '=', userId)
          .where('interest_name', '=', keyword)
          .where('is_active', '=', true)
          .execute();
      }
    }
  }

  private async reduceRelatedInterests(userId: string, recommendation: any): Promise<void> {
    // Simple learning - reduce interests that match recommendation content
    const data = recommendation.recommendation_data;
    if (data && typeof data === 'object') {
      const keywords = this.extractKeywordsFromRecommendation(data);
      
      for (const keyword of keywords) {
        await this.db.updateTable('user_interest_profiles')
          .set(eb => ({
            affinity_score: eb('affinity_score', '-', 0.03), // Small reduction
            last_updated_at: new Date()
          }))
          .where('user_id', '=', userId)
          .where('interest_name', '=', keyword)
          .where('is_active', '=', true)
          .where('affinity_score', '>', 0.1) // Don't go too low
          .execute();
      }
    }
  }

  private extractKeywordsFromRecommendation(data: any): string[] {
    const keywords: string[] = [];
    
    if (data.query) keywords.push(data.query);
    if (data.topic) keywords.push(data.topic);
    if (data.title) keywords.push(...data.title.toLowerCase().split(' '));
    
    return keywords.filter(k => k.length > 2); // Remove short words
  }

  private async storeRecommendations(recommendations: PersonalizedRecommendation[]): Promise<void> {
    try {
      if (recommendations.length === 0) return;

      await this.db.insertInto('personalized_recommendations')
        .values(recommendations.map(rec => ({
          id: rec.id,
          user_id: rec.userId,
          recommendation_type: rec.recommendationType,
          recommendation_category: rec.recommendationCategory,
          recommendation_title: rec.recommendationTitle,
          recommendation_description: rec.recommendationDescription,
          recommendation_data: JSON.stringify(rec.recommendationData),
          context_data: JSON.stringify(rec.contextData),
          relevance_score: rec.relevanceScore,
          confidence_score: rec.confidenceScore,
          novelty_score: rec.noveltyScore,
          diversity_score: rec.diversityScore,
          generated_by_model: rec.generatedByModel,
          model_version: rec.modelVersion,
          generation_factors: JSON.stringify(rec.generationFactors),
          is_active: rec.isActive,
          expires_at: rec.expiresAt,
          priority_score: rec.priorityScore,
          created_at: rec.createdAt,
          updated_at: rec.updatedAt
        })))
        .execute();

    } catch (error) {
      logger.error('Error storing recommendations:', error);
    }
  }

  private isRecommendationFresh(recommendation: PersonalizedRecommendation): boolean {
    const age = Date.now() - recommendation.createdAt.getTime();
    const maxAge = this.config.recommendationTTL * 60 * 1000;
    return age < maxAge;
  }

  private mapDatabaseToRecommendation(dbRec: any): PersonalizedRecommendation {
    return {
      id: dbRec.id,
      userId: dbRec.user_id,
      recommendationType: dbRec.recommendation_type,
      recommendationCategory: dbRec.recommendation_category,
      recommendationTitle: dbRec.recommendation_title,
      recommendationDescription: dbRec.recommendation_description,
      recommendationData: JSON.parse(dbRec.recommendation_data || '{}'),
      contextData: JSON.parse(dbRec.context_data || '{}'),
      relevanceScore: parseFloat(dbRec.relevance_score.toString()),
      confidenceScore: parseFloat(dbRec.confidence_score.toString()),
      noveltyScore: parseFloat(dbRec.novelty_score.toString()),
      diversityScore: parseFloat(dbRec.diversity_score.toString()),
      generatedByModel: dbRec.generated_by_model,
      modelVersion: dbRec.model_version,
      generationFactors: JSON.parse(dbRec.generation_factors || '[]'),
      presentedAt: dbRec.presented_at,
      clickedAt: dbRec.clicked_at,
      dismissedAt: dbRec.dismissed_at,
      feedbackScore: dbRec.feedback_score,
      implicitFeedback: JSON.parse(dbRec.implicit_feedback || '{}'),
      isActive: dbRec.is_active,
      expiresAt: dbRec.expires_at,
      priorityScore: dbRec.priority_score,
      createdAt: dbRec.created_at,
      updatedAt: dbRec.updated_at
    };
  }
}