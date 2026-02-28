/**
 * InterestModelingService - Advanced user interest extraction and modeling
 * 
 * Provides comprehensive interest management capabilities:
 * - Automatic interest discovery from user behavior
 * - Explicit interest management (user-defined interests)
 * - Interest evolution tracking and trend analysis
 * - Topic modeling and keyword extraction
 * - Interest scoring and affinity calculation
 * - Interest-based content discovery and recommendations
 */

import {
  UserInterest,
  InterestType,
  TrendDirection,
  ConfidenceLevel,
  InterestModelingService as IInterestModelingService
} from '@shared/types/personalization.js';
import { Database } from '@shared/utils/database.js';
import { logger } from '@shared/utils/logger.js';

export interface InterestModelingConfig {
  minAffinityThreshold: number;
  maxInterestsPerUser: number;
  interestDecayRate: number;
  confidenceThreshold: number;
  trendAnalysisWindow: number; // days
  enableAutoDiscovery: boolean;
  enableTrendAnalysis: boolean;
  keywordExtractionEnabled: boolean;
}

interface BehaviorEvent {
  eventType: string;
  eventAction: string;
  searchQuery?: string;
  resultData?: any;
  eventTimestamp: Date;
  interactionDurationMs?: number;
}

interface InterestSignal {
  term: string;
  weight: number;
  source: string;
  timestamp: Date;
}

export class InterestModelingService implements IInterestModelingService {
  private db: Database;
  private config: InterestModelingConfig;
  private interestCache = new Map<string, UserInterest[]>();

  constructor(database: Database, config: InterestModelingConfig) {
    this.db = database;
    this.config = config;
  }

  /**
   * Get user's interests with optional filtering
   */
  async getUserInterests(userId: string, activeOnly: boolean = true): Promise<UserInterest[]> {
    try {
      // Check cache first
      const cacheKey = `${userId}:${activeOnly}`;
      if (this.interestCache.has(cacheKey)) {
        const cached = this.interestCache.get(cacheKey)!;
        if (this.isInterestDataFresh(cached[0])) {
          return cached;
        }
      }

      // Query database
      let query = this.db.selectFrom('user_interest_profiles')
        .selectAll()
        .where('user_id', '=', userId);

      if (activeOnly) {
        query = query.where('is_active', '=', true);
      }

      const interests = await query
        .orderBy('affinity_score', 'desc')
        .orderBy('last_updated_at', 'desc')
        .execute();

      const mappedInterests = interests.map(interest => this.mapDatabaseToInterest(interest));

      // Cache the results
      this.interestCache.set(cacheKey, mappedInterests);

      logger.debug(`Retrieved ${interests.length} interests for user ${userId}`);
      return mappedInterests;

    } catch (error) {
      logger.error(`Error getting user interests for ${userId}:`, error);
      throw new Error(`Failed to get user interests: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Add explicit user-defined interest
   */
  async addExplicitInterest(userId: string, interest: Partial<UserInterest>): Promise<UserInterest> {
    try {
      const now = new Date();
      const interestId = crypto.randomUUID();

      const newInterest: UserInterest = {
        id: interestId,
        userId,
        interestType: interest.interestType || 'topic',
        interestName: interest.interestName!,
        interestDescription: interest.interestDescription || '',
        affinityScore: interest.affinityScore || 0.8, // High initial score for explicit interests
        frequencyScore: 0.5, // Will be updated with usage
        recencyScore: 1.0, // Just added
        depthScore: 0.5, // Will be updated with engagement
        interestKeywords: interest.interestKeywords || [],
        relatedQueries: interest.relatedQueries || [],
        contentExamples: interest.contentExamples || [],
        firstDetectedAt: now,
        lastUpdatedAt: now,
        trendDirection: 'stable',
        trendStrength: 0.0,
        isActive: true,
        isExplicit: true,
        confidenceLevel: 'high', // High confidence for explicit interests
        createdAt: now
      };

      // Store in database
      await this.db.insertInto('user_interest_profiles')
        .values(this.mapInterestToDatabase(newInterest))
        .execute();

      // Clear cache
      this.clearUserInterestCache(userId);

      logger.info(`Added explicit interest "${interest.interestName}" for user ${userId}`);
      return newInterest;

    } catch (error) {
      logger.error(`Error adding explicit interest for user ${userId}:`, error);
      throw new Error(`Failed to add explicit interest: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Update existing interest
   */
  async updateInterest(userId: string, interestId: string, updates: Partial<UserInterest>): Promise<UserInterest> {
    try {
      const now = new Date();
      
      const dbUpdates = this.mapPartialInterestToDatabase(updates);
      dbUpdates.last_updated_at = now;

      const result = await this.db.updateTable('user_interest_profiles')
        .set(dbUpdates)
        .where('id', '=', interestId)
        .where('user_id', '=', userId)
        .returningAll()
        .executeTakeFirst();

      if (!result) {
        throw new Error(`Interest ${interestId} not found for user ${userId}`);
      }

      const updatedInterest = this.mapDatabaseToInterest(result);

      // Clear cache
      this.clearUserInterestCache(userId);

      logger.info(`Updated interest ${interestId} for user ${userId}`);
      return updatedInterest;

    } catch (error) {
      logger.error(`Error updating interest ${interestId} for user ${userId}:`, error);
      throw new Error(`Failed to update interest: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Remove interest
   */
  async removeInterest(userId: string, interestId: string): Promise<void> {
    try {
      const result = await this.db.deleteFrom('user_interest_profiles')
        .where('id', '=', interestId)
        .where('user_id', '=', userId)
        .execute();

      if (result.length === 0) {
        throw new Error(`Interest ${interestId} not found for user ${userId}`);
      }

      // Clear cache
      this.clearUserInterestCache(userId);

      logger.info(`Removed interest ${interestId} for user ${userId}`);

    } catch (error) {
      logger.error(`Error removing interest ${interestId} for user ${userId}:`, error);
      throw new Error(`Failed to remove interest: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Extract interests from user behavior events
   */
  async extractInterestsFromBehavior(userId: string, events: any[]): Promise<UserInterest[]> {
    try {
      if (!this.config.enableAutoDiscovery || events.length === 0) {
        return [];
      }

      // Convert events to behavior events
      const behaviorEvents = this.convertToBehaviorEvents(events);

      // Extract interest signals
      const signals = await this.extractInterestSignals(behaviorEvents);

      // Cluster signals into interests
      const potentialInterests = this.clusterSignalsIntoInterests(signals);

      // Score and validate interests
      const validInterests = this.scoreAndValidateInterests(potentialInterests, userId);

      // Create or update interests in database
      const discoveredInterests: UserInterest[] = [];

      for (const interest of validInterests) {
        const discovered = await this.createOrUpdateDiscoveredInterest(userId, interest);
        if (discovered) {
          discoveredInterests.push(discovered);
        }
      }

      logger.info(`Discovered ${discoveredInterests.length} interests from ${events.length} behavior events for user ${userId}`);
      return discoveredInterests;

    } catch (error) {
      logger.error(`Error extracting interests from behavior for user ${userId}:`, error);
      throw new Error(`Failed to extract interests from behavior: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Suggest potential interests for a user
   */
  async suggestInterests(userId: string, count: number = 5): Promise<UserInterest[]> {
    try {
      const suggestions: UserInterest[] = [];

      // Get user's existing interests
      const existingInterests = await this.getUserInterests(userId, true);
      const existingNames = new Set(existingInterests.map(i => i.interestName));

      // Get popular interests from similar users
      const popularInterests = await this.getPopularInterestsFromSimilarUsers(userId, count * 2);

      // Filter out existing interests and score suggestions
      for (const interest of popularInterests) {
        if (!existingNames.has(interest.interestName) && suggestions.length < count) {
          // Create suggestion with lower initial scores
          const suggestion: UserInterest = {
            ...interest,
            id: crypto.randomUUID(),
            userId,
            affinityScore: interest.affinityScore * 0.3, // Reduced initial score
            isExplicit: false,
            confidenceLevel: 'low',
            createdAt: new Date()
          };

          suggestions.push(suggestion);
        }
      }

      // Add trending topics if we need more suggestions
      if (suggestions.length < count) {
        const trendingTopics = await this.getTrendingTopics(count - suggestions.length);
        suggestions.push(...trendingTopics);
      }

      logger.debug(`Generated ${suggestions.length} interest suggestions for user ${userId}`);
      return suggestions;

    } catch (error) {
      logger.error(`Error suggesting interests for user ${userId}:`, error);
      throw new Error(`Failed to suggest interests: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Update interest trends and perform periodic analysis
   */
  async updateInterestTrends(userId: string): Promise<void> {
    try {
      if (!this.config.enableTrendAnalysis) {
        return;
      }

      const interests = await this.getUserInterests(userId, true);
      const windowStart = new Date(Date.now() - this.config.trendAnalysisWindow * 24 * 60 * 60 * 1000);

      for (const interest of interests) {
        const trend = await this.calculateInterestTrend(userId, interest.id, windowStart);
        
        if (Math.abs(trend.strength) > 0.1) { // Only update if significant change
          await this.updateInterest(userId, interest.id, {
            trendDirection: trend.direction,
            trendStrength: trend.strength,
            recencyScore: trend.recencyScore,
            frequencyScore: trend.frequencyScore
          });
        }
      }

      logger.debug(`Updated interest trends for user ${userId}`);

    } catch (error) {
      logger.error(`Error updating interest trends for user ${userId}:`, error);
    }
  }

  // =====================
  // PRIVATE METHODS
  // =====================

  /**
   * Convert raw events to structured behavior events
   */
  private convertToBehaviorEvents(events: any[]): BehaviorEvent[] {
    const behaviorEvents: BehaviorEvent[] = [];

    for (const event of events) {
      behaviorEvents.push({
        eventType: event.event_type || event.eventType,
        eventAction: event.event_action || event.eventAction,
        searchQuery: event.search_query || event.searchQuery,
        resultData: event.result_data || event.resultData,
        eventTimestamp: new Date(event.event_timestamp || event.eventTimestamp || event.timestamp),
        interactionDurationMs: event.interaction_duration_ms || event.interactionDurationMs
      });
    }

    return behaviorEvents;
  }

  /**
   * Extract interest signals from behavior events
   */
  private async extractInterestSignals(events: BehaviorEvent[]): Promise<InterestSignal[]> {
    const signals: InterestSignal[] = [];

    for (const event of events) {
      // Extract signals from search queries
      if (event.searchQuery) {
        const querySignals = this.extractSignalsFromQuery(event.searchQuery, event);
        signals.push(...querySignals);
      }

      // Extract signals from result interactions
      if (event.resultData && event.eventAction === 'click') {
        const resultSignals = this.extractSignalsFromResult(event.resultData, event);
        signals.push(...resultSignals);
      }

      // Extract signals from save/share actions (higher weight)
      if (event.eventAction === 'save' || event.eventAction === 'share') {
        const engagementSignals = this.extractSignalsFromEngagement(event);
        signals.push(...engagementSignals);
      }
    }

    return signals;
  }

  /**
   * Extract interest signals from search query
   */
  private extractSignalsFromQuery(query: string, event: BehaviorEvent): InterestSignal[] {
    const signals: InterestSignal[] = [];
    
    if (!this.config.keywordExtractionEnabled) {
      return signals;
    }

    // Simple keyword extraction (in production, use NLP libraries)
    const keywords = this.extractKeywords(query);
    const baseWeight = 0.3;

    for (const keyword of keywords) {
      signals.push({
        term: keyword,
        weight: baseWeight,
        source: 'query',
        timestamp: event.eventTimestamp
      });
    }

    return signals;
  }

  /**
   * Extract interest signals from result interactions
   */
  private extractSignalsFromResult(resultData: any, event: BehaviorEvent): InterestSignal[] {
    const signals: InterestSignal[] = [];
    const baseWeight = 0.4;

    // Extract from result title and description
    if (resultData.title) {
      const keywords = this.extractKeywords(resultData.title);
      for (const keyword of keywords) {
        signals.push({
          term: keyword,
          weight: baseWeight * 1.2, // Higher weight for clicked results
          source: 'result_title',
          timestamp: event.eventTimestamp
        });
      }
    }

    if (resultData.description) {
      const keywords = this.extractKeywords(resultData.description);
      for (const keyword of keywords.slice(0, 5)) { // Limit from descriptions
        signals.push({
          term: keyword,
          weight: baseWeight * 0.8,
          source: 'result_description',
          timestamp: event.eventTimestamp
        });
      }
    }

    // Extract from result categories/tags
    if (resultData.category) {
      signals.push({
        term: resultData.category,
        weight: baseWeight * 1.5, // High weight for categories
        source: 'result_category',
        timestamp: event.eventTimestamp
      });
    }

    return signals;
  }

  /**
   * Extract signals from high-engagement actions (save, share)
   */
  private extractSignalsFromEngagement(event: BehaviorEvent): InterestSignal[] {
    const signals: InterestSignal[] = [];
    const highWeight = 0.8; // High weight for explicit engagement

    if (event.searchQuery) {
      const keywords = this.extractKeywords(event.searchQuery);
      for (const keyword of keywords) {
        signals.push({
          term: keyword,
          weight: highWeight,
          source: 'engagement',
          timestamp: event.eventTimestamp
        });
      }
    }

    return signals;
  }

  /**
   * Simple keyword extraction from text
   */
  private extractKeywords(text: string): string[] {
    if (!text) return [];

    // Simple approach - in production, use NLP libraries like natural or compromise
    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2)
      .filter(word => !this.isStopWord(word));

    // Remove duplicates and return top words
    const unique = [...new Set(words)];
    return unique.slice(0, 10); // Limit keywords
  }

  /**
   * Simple stop word filter
   */
  private isStopWord(word: string): boolean {
    const stopWords = new Set([
      'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
      'from', 'up', 'about', 'into', 'through', 'during', 'before', 'after', 'above',
      'below', 'between', 'among', 'under', 'over', 'again', 'further', 'then', 'once',
      'is', 'are', 'was', 'were', 'been', 'being', 'have', 'has', 'had', 'having',
      'do', 'does', 'did', 'doing', 'will', 'would', 'could', 'should', 'may', 'might',
      'must', 'can', 'this', 'that', 'these', 'those', 'what', 'which', 'who', 'when',
      'where', 'why', 'how', 'all', 'any', 'both', 'each', 'few', 'more', 'most',
      'other', 'some', 'such', 'only', 'own', 'same', 'so', 'than', 'too', 'very'
    ]);

    return stopWords.has(word);
  }

  /**
   * Cluster interest signals into potential interests
   */
  private clusterSignalsIntoInterests(signals: InterestSignal[]): Array<{
    name: string;
    type: InterestType;
    totalWeight: number;
    frequency: number;
    keywords: string[];
    sources: string[];
  }> {
    const clusters = new Map<string, {
      totalWeight: number;
      frequency: number;
      keywords: Set<string>;
      sources: Set<string>;
    }>();

    // Group signals by term
    for (const signal of signals) {
      const term = signal.term.toLowerCase();
      
      if (!clusters.has(term)) {
        clusters.set(term, {
          totalWeight: 0,
          frequency: 0,
          keywords: new Set(),
          sources: new Set()
        });
      }

      const cluster = clusters.get(term)!;
      cluster.totalWeight += signal.weight;
      cluster.frequency += 1;
      cluster.keywords.add(signal.term);
      cluster.sources.add(signal.source);
    }

    // Convert to interest candidates
    const interests: Array<{
      name: string;
      type: InterestType;
      totalWeight: number;
      frequency: number;
      keywords: string[];
      sources: string[];
    }> = [];

    for (const [term, cluster] of clusters.entries()) {
      if (cluster.totalWeight >= this.config.minAffinityThreshold && cluster.frequency >= 2) {
        interests.push({
          name: term,
          type: this.inferInterestType(term, cluster.sources),
          totalWeight: cluster.totalWeight,
          frequency: cluster.frequency,
          keywords: Array.from(cluster.keywords),
          sources: Array.from(cluster.sources)
        });
      }
    }

    // Sort by total weight
    interests.sort((a, b) => b.totalWeight - a.totalWeight);

    return interests.slice(0, 10); // Limit to top candidates
  }

  /**
   * Infer interest type from term and sources
   */
  private inferInterestType(term: string, sources: Set<string>): InterestType {
    // Simple heuristics - in production, use ML classification
    if (sources.has('result_category')) {
      return 'category';
    }
    
    if (term.includes('programming') || term.includes('development') || term.includes('coding')) {
      return 'skill';
    }

    if (term.includes('tutorial') || term.includes('guide') || term.includes('how')) {
      return 'skill';
    }

    return 'topic'; // Default
  }

  /**
   * Score and validate potential interests
   */
  private scoreAndValidateInterests(
    potentialInterests: Array<{
      name: string;
      type: InterestType;
      totalWeight: number;
      frequency: number;
      keywords: string[];
      sources: string[];
    }>,
    userId: string
  ): UserInterest[] {
    const validatedInterests: UserInterest[] = [];
    const now = new Date();

    for (const potential of potentialInterests) {
      // Calculate scores
      const affinityScore = Math.min(1.0, potential.totalWeight);
      const frequencyScore = Math.min(1.0, potential.frequency / 10);
      const depthScore = potential.sources.has('engagement') ? 0.8 : 0.4;

      // Validate minimum thresholds
      if (affinityScore >= this.config.minAffinityThreshold) {
        const interest: UserInterest = {
          id: crypto.randomUUID(),
          userId,
          interestType: potential.type,
          interestName: potential.name,
          interestDescription: `Auto-discovered from user behavior`,
          affinityScore,
          frequencyScore,
          recencyScore: 1.0, // Just discovered
          depthScore,
          interestKeywords: potential.keywords,
          relatedQueries: [],
          contentExamples: [],
          firstDetectedAt: now,
          lastUpdatedAt: now,
          trendDirection: 'stable',
          trendStrength: 0.0,
          isActive: true,
          isExplicit: false,
          confidenceLevel: affinityScore > 0.7 ? 'high' : affinityScore > 0.4 ? 'medium' : 'low',
          createdAt: now
        };

        validatedInterests.push(interest);
      }
    }

    return validatedInterests;
  }

  /**
   * Create or update discovered interest in database
   */
  private async createOrUpdateDiscoveredInterest(userId: string, interest: UserInterest): Promise<UserInterest | null> {
    try {
      // Check if interest already exists
      const existing = await this.db.selectFrom('user_interest_profiles')
        .selectAll()
        .where('user_id', '=', userId)
        .where('interest_name', '=', interest.interestName)
        .where('interest_type', '=', interest.interestType)
        .executeTakeFirst();

      if (existing) {
        // Update existing interest with new scores
        const updatedAffinity = Math.min(1.0, 
          parseFloat(existing.affinity_score.toString()) + interest.affinityScore * 0.1
        );
        const updatedFrequency = Math.min(1.0,
          parseFloat(existing.frequency_score.toString()) + interest.frequencyScore * 0.1
        );

        const result = await this.db.updateTable('user_interest_profiles')
          .set({
            affinity_score: updatedAffinity,
            frequency_score: updatedFrequency,
            recency_score: 1.0,
            last_updated_at: new Date(),
            interest_keywords: JSON.stringify([
              ...JSON.parse(existing.interest_keywords || '[]'),
              ...interest.interestKeywords
            ])
          })
          .where('id', '=', existing.id)
          .returningAll()
          .executeTakeFirst();

        return result ? this.mapDatabaseToInterest(result) : null;

      } else {
        // Create new interest
        await this.db.insertInto('user_interest_profiles')
          .values(this.mapInterestToDatabase(interest))
          .execute();

        return interest;
      }

    } catch (error) {
      logger.error(`Error creating/updating discovered interest:`, error);
      return null;
    }
  }

  /**
   * Get popular interests from users with similar behavior
   */
  private async getPopularInterestsFromSimilarUsers(userId: string, count: number): Promise<UserInterest[]> {
    try {
      // Simple approach - get interests from users with similar search patterns
      const popularInterests = await this.db.selectFrom('user_interest_profiles')
        .selectAll()
        .where('user_id', '!=', userId)
        .where('is_active', '=', true)
        .where('affinity_score', '>', 0.5)
        .groupBy(['interest_name', 'interest_type'])
        .orderBy(this.db.fn.count('id'), 'desc')
        .limit(count)
        .execute();

      return popularInterests.map(interest => this.mapDatabaseToInterest(interest));

    } catch (error) {
      logger.error(`Error getting popular interests:`, error);
      return [];
    }
  }

  /**
   * Get trending topics across the platform
   */
  private async getTrendingTopics(count: number): Promise<UserInterest[]> {
    try {
      // Simple trending calculation - interests created recently with high frequency
      const trending = await this.db.selectFrom('user_interest_profiles')
        .selectAll()
        .where('created_at', '>', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)) // Last week
        .where('is_active', '=', true)
        .groupBy(['interest_name', 'interest_type'])
        .orderBy(this.db.fn.count('id'), 'desc')
        .limit(count)
        .execute();

      const trendingInterests: UserInterest[] = [];

      for (const trend of trending) {
        trendingInterests.push({
          ...this.mapDatabaseToInterest(trend),
          id: crypto.randomUUID(),
          userId: '', // Will be set when suggested
          affinityScore: 0.3, // Low initial score for suggestions
          confidenceLevel: 'low',
          isExplicit: false
        });
      }

      return trendingInterests;

    } catch (error) {
      logger.error(`Error getting trending topics:`, error);
      return [];
    }
  }

  /**
   * Calculate interest trend over time window
   */
  private async calculateInterestTrend(
    userId: string, 
    interestId: string, 
    windowStart: Date
  ): Promise<{
    direction: TrendDirection;
    strength: number;
    recencyScore: number;
    frequencyScore: number;
  }> {
    try {
      // Get recent behavior events related to this interest
      const interest = await this.db.selectFrom('user_interest_profiles')
        .selectAll()
        .where('id', '=', interestId)
        .executeTakeFirst();

      if (!interest) {
        return { direction: 'stable', strength: 0, recencyScore: 0.5, frequencyScore: 0.5 };
      }

      const keywords = JSON.parse(interest.interest_keywords || '[]');
      
      // Count recent interactions with interest-related content
      const recentEvents = await this.db.selectFrom('user_behavior_events')
        .selectAll()
        .where('user_id', '=', userId)
        .where('event_timestamp', '>', windowStart)
        .execute();

      let relevantEvents = 0;
      let recentEvents = 0;
      const now = Date.now();
      const windowSize = this.config.trendAnalysisWindow * 24 * 60 * 60 * 1000;

      for (const event of recentEvents) {
        let isRelevant = false;

        // Check if event relates to this interest
        if (event.search_query) {
          const query = event.search_query.toLowerCase();
          for (const keyword of keywords) {
            if (typeof keyword === 'string' && query.includes(keyword.toLowerCase())) {
              isRelevant = true;
              break;
            }
          }
        }

        if (isRelevant) {
          relevantEvents++;
          
          // Count recent events (last 25% of window)
          const eventAge = now - event.event_timestamp.getTime();
          if (eventAge < windowSize * 0.25) {
            recentEvents++;
          }
        }
      }

      // Calculate trend
      const totalEvents = recentEvents.length || 1;
      const relevantRatio = relevantEvents / totalEvents;
      const recentRatio = recentEvents / Math.max(1, relevantEvents);

      let direction: TrendDirection = 'stable';
      let strength = 0;

      if (recentRatio > 0.6 && relevantEvents > 2) {
        direction = 'growing';
        strength = Math.min(1.0, recentRatio * 0.8);
      } else if (recentRatio < 0.2 && relevantEvents > 0) {
        direction = 'declining';
        strength = Math.min(1.0, (1 - recentRatio) * 0.6);
      }

      return {
        direction,
        strength,
        recencyScore: Math.min(1.0, recentRatio),
        frequencyScore: Math.min(1.0, relevantRatio * 2)
      };

    } catch (error) {
      logger.error(`Error calculating interest trend:`, error);
      return { direction: 'stable', strength: 0, recencyScore: 0.5, frequencyScore: 0.5 };
    }
  }

  // =====================
  // HELPER METHODS
  // =====================

  private clearUserInterestCache(userId: string): void {
    const keysToDelete = Array.from(this.interestCache.keys()).filter(key => key.startsWith(userId));
    for (const key of keysToDelete) {
      this.interestCache.delete(key);
    }
  }

  private isInterestDataFresh(interest?: UserInterest): boolean {
    if (!interest) return false;
    const age = Date.now() - interest.lastUpdatedAt.getTime();
    return age < 15 * 60 * 1000; // 15 minutes
  }

  private mapDatabaseToInterest(dbInterest: any): UserInterest {
    return {
      id: dbInterest.id,
      userId: dbInterest.user_id,
      interestType: dbInterest.interest_type,
      interestName: dbInterest.interest_name,
      interestDescription: dbInterest.interest_description || '',
      affinityScore: parseFloat(dbInterest.affinity_score.toString()),
      frequencyScore: parseFloat(dbInterest.frequency_score.toString()),
      recencyScore: parseFloat(dbInterest.recency_score.toString()),
      depthScore: parseFloat(dbInterest.depth_score.toString()),
      interestKeywords: JSON.parse(dbInterest.interest_keywords || '[]'),
      relatedQueries: JSON.parse(dbInterest.related_queries || '[]'),
      contentExamples: JSON.parse(dbInterest.content_examples || '[]'),
      firstDetectedAt: dbInterest.first_detected_at,
      lastUpdatedAt: dbInterest.last_updated_at,
      trendDirection: dbInterest.trend_direction,
      trendStrength: parseFloat(dbInterest.trend_strength.toString()),
      isActive: dbInterest.is_active,
      isExplicit: dbInterest.is_explicit,
      confidenceLevel: dbInterest.confidence_level,
      createdAt: dbInterest.created_at
    };
  }

  private mapInterestToDatabase(interest: UserInterest): any {
    return {
      id: interest.id,
      user_id: interest.userId,
      interest_type: interest.interestType,
      interest_name: interest.interestName,
      interest_description: interest.interestDescription,
      affinity_score: interest.affinityScore,
      frequency_score: interest.frequencyScore,
      recency_score: interest.recencyScore,
      depth_score: interest.depthScore,
      interest_keywords: JSON.stringify(interest.interestKeywords),
      related_queries: JSON.stringify(interest.relatedQueries),
      content_examples: JSON.stringify(interest.contentExamples),
      first_detected_at: interest.firstDetectedAt,
      last_updated_at: interest.lastUpdatedAt,
      trend_direction: interest.trendDirection,
      trend_strength: interest.trendStrength,
      is_active: interest.isActive,
      is_explicit: interest.isExplicit,
      confidence_level: interest.confidenceLevel,
      created_at: interest.createdAt
    };
  }

  private mapPartialInterestToDatabase(updates: Partial<UserInterest>): any {
    const mapped: any = {};

    if (updates.interestName !== undefined) mapped.interest_name = updates.interestName;
    if (updates.interestDescription !== undefined) mapped.interest_description = updates.interestDescription;
    if (updates.affinityScore !== undefined) mapped.affinity_score = updates.affinityScore;
    if (updates.frequencyScore !== undefined) mapped.frequency_score = updates.frequencyScore;
    if (updates.recencyScore !== undefined) mapped.recency_score = updates.recencyScore;
    if (updates.depthScore !== undefined) mapped.depth_score = updates.depthScore;
    if (updates.interestKeywords !== undefined) mapped.interest_keywords = JSON.stringify(updates.interestKeywords);
    if (updates.relatedQueries !== undefined) mapped.related_queries = JSON.stringify(updates.relatedQueries);
    if (updates.contentExamples !== undefined) mapped.content_examples = JSON.stringify(updates.contentExamples);
    if (updates.trendDirection !== undefined) mapped.trend_direction = updates.trendDirection;
    if (updates.trendStrength !== undefined) mapped.trend_strength = updates.trendStrength;
    if (updates.isActive !== undefined) mapped.is_active = updates.isActive;
    if (updates.confidenceLevel !== undefined) mapped.confidence_level = updates.confidenceLevel;

    return mapped;
  }
}