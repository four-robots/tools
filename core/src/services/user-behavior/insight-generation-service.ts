import { Kysely } from 'kysely';
import { EventEmitter } from 'events';
import {
  BehaviorEvent,
  UserSearchPattern,
  UserBehaviorSegment,
  UserBehaviorPrediction,
  UserBehaviorInsight,
  InsightCategories,
  InsightTypes,
  Recommendation,
} from '../../shared/types/user-behavior.js';
import { InsightGenerationConfig } from './types.js';
import { StatisticalAnalyzer, TrendAnalysis, StatisticalResult } from './utils/statistical-analyzer.js';
import { Logger } from '../../shared/utils/logger.js';

export interface InsightGenerationResult {
  insights: UserBehaviorInsight[];
  totalGenerated: number;
  significantInsights: number;
  categories: Record<string, number>;
  confidence: number;
  generatedAt: Date;
}

export interface SystemWideInsight {
  category: string;
  title: string;
  description: string;
  data: Record<string, any>;
  affectedUsers: number;
  recommendation: Recommendation;
  impact: 'low' | 'medium' | 'high';
  urgency: 'low' | 'medium' | 'high';
}

export interface UserJourney {
  userId: string;
  journey: Array<{
    step: number;
    action: string;
    timestamp: Date;
    success: boolean;
    duration: number;
  }>;
  overallSuccess: boolean;
  bottlenecks: Array<{
    step: number;
    issue: string;
    impact: number;
  }>;
  recommendations: string[];
}

export class InsightGenerationService extends EventEmitter {
  private db: Kysely<any>;
  private config: InsightGenerationConfig;
  private statisticalAnalyzer: StatisticalAnalyzer;
  private logger: Logger;

  constructor(
    db: Kysely<any>,
    config: InsightGenerationConfig = {
      enableAutomatedInsights: true,
      insightTypes: Object.values(InsightTypes),
      minImpactScore: 0.6,
      maxInsightsPerUser: 10,
      insightRetentionPeriod: 30,
      enableNotifications: true,
    }
  ) {
    super();
    this.db = db;
    this.config = config;
    this.statisticalAnalyzer = new StatisticalAnalyzer();
    this.logger = new Logger('InsightGenerationService');
  }

  /**
   * Generate insights for a specific user
   */
  async generateUserInsights(userId: string): Promise<InsightGenerationResult> {
    try {
      this.logger.info('Generating user insights', { userId });

      const insights: UserBehaviorInsight[] = [];
      
      // Get user data
      const events = await this.getUserEvents(userId, 30);
      const patterns = await this.getUserPatterns(userId);
      const segments = await this.getUserSegments(userId);
      const predictions = await this.getUserPredictions(userId);

      if (events.length === 0) {
        return this.createEmptyResult();
      }

      // Generate different types of insights
      if (this.config.insightTypes.includes(InsightTypes.USER_SPECIFIC)) {
        // Search optimization insights
        const searchInsights = await this.generateSearchOptimizationInsights(userId, events, patterns);
        insights.push(...searchInsights);

        // Engagement insights
        const engagementInsights = await this.generateEngagementInsights(userId, events, segments);
        insights.push(...engagementInsights);

        // Performance insights
        const performanceInsights = await this.generatePerformanceInsights(userId, events);
        insights.push(...performanceInsights);

        // Behavioral pattern insights
        const patternInsights = await this.generatePatternInsights(userId, patterns);
        insights.push(...patternInsights);

        // Personalization insights
        const personalizationInsights = await this.generatePersonalizationInsights(userId, predictions, segments);
        insights.push(...personalizationInsights);
      }

      // Filter by impact score
      const significantInsights = insights.filter(
        insight => (insight.impactScore || 0) >= this.config.minImpactScore
      );

      // Limit insights per user
      const finalInsights = significantInsights
        .sort((a, b) => (b.impactScore || 0) - (a.impactScore || 0))
        .slice(0, this.config.maxInsightsPerUser);

      // Store insights
      if (finalInsights.length > 0) {
        await this.storeInsights(finalInsights);
      }

      // Calculate metrics
      const categories = this.categorizeInsights(finalInsights);
      const avgConfidence = finalInsights.length > 0
        ? finalInsights.reduce((sum, insight) => sum + (insight.impactScore || 0), 0) / finalInsights.length
        : 0;

      const result = {
        insights: finalInsights,
        totalGenerated: insights.length,
        significantInsights: significantInsights.length,
        categories,
        confidence: avgConfidence,
        generatedAt: new Date(),
      };

      this.emit('insights:generated', { userId, result });
      this.logger.info('User insights generated', { 
        userId, 
        totalInsights: finalInsights.length,
        confidence: avgConfidence 
      });

      return result;

    } catch (error) {
      this.logger.error('Failed to generate user insights', error, { userId });
      throw error;
    }
  }

  /**
   * Generate system-wide insights across all users
   */
  async generateSystemWideInsights(): Promise<SystemWideInsight[]> {
    try {
      this.logger.info('Generating system-wide insights');

      const insights: SystemWideInsight[] = [];

      // Analyze overall user behavior trends
      const behaviorTrends = await this.analyzeGlobalBehaviorTrends();
      insights.push(...behaviorTrends);

      // Identify common user journey issues
      const journeyInsights = await this.analyzeCommonJourneyIssues();
      insights.push(...journeyInsights);

      // Search performance insights
      const searchPerformanceInsights = await this.analyzeSearchPerformance();
      insights.push(...searchPerformanceInsights);

      // Feature usage insights
      const featureUsageInsights = await this.analyzeFeatureUsage();
      insights.push(...featureUsageInsights);

      // Engagement and retention insights
      const retentionInsights = await this.analyzeUserRetention();
      insights.push(...retentionInsights);

      // Store system insights
      const systemInsights = insights.map(insight => this.convertToUserBehaviorInsight(insight));
      await this.storeInsights(systemInsights);

      this.emit('systemInsights:generated', insights);
      this.logger.info('System-wide insights generated', { count: insights.length });

      return insights;

    } catch (error) {
      this.logger.error('Failed to generate system-wide insights', error);
      throw error;
    }
  }

  /**
   * Analyze user journey and identify bottlenecks
   */
  async analyzeUserJourney(userId: string, timeWindow: number = 7): Promise<UserJourney> {
    try {
      const events = await this.getUserEvents(userId, timeWindow);
      
      if (events.length === 0) {
        return {
          userId,
          journey: [],
          overallSuccess: false,
          bottlenecks: [],
          recommendations: [],
        };
      }

      // Map events to journey steps
      const journey = this.mapEventsToJourney(events);
      
      // Identify bottlenecks
      const bottlenecks = this.identifyJourneyBottlenecks(journey);
      
      // Generate recommendations
      const recommendations = this.generateJourneyRecommendations(bottlenecks, journey);
      
      // Calculate overall success
      const overallSuccess = this.calculateJourneySuccess(journey);

      return {
        userId,
        journey,
        overallSuccess,
        bottlenecks,
        recommendations,
      };

    } catch (error) {
      this.logger.error('Failed to analyze user journey', error, { userId });
      throw error;
    }
  }

  /**
   * Generate A/B testing recommendations
   */
  async generateABTestRecommendations(): Promise<Array<{
    testName: string;
    hypothesis: string;
    variants: Array<{
      name: string;
      description: string;
      expectedImpact: number;
    }>;
    metrics: string[];
    targetSegment?: string;
    priority: 'low' | 'medium' | 'high';
    estimatedDuration: number; // days
  }>> {
    try {
      const recommendations = [];

      // Analyze search behavior patterns for testing opportunities
      const searchPatterns = await this.analyzeSearchPatternsForTesting();
      recommendations.push(...searchPatterns);

      // Analyze UI interaction patterns
      const uiPatterns = await this.analyzeUIInteractionsForTesting();
      recommendations.push(...uiPatterns);

      // Analyze content engagement patterns
      const contentPatterns = await this.analyzeContentEngagementForTesting();
      recommendations.push(...contentPatterns);

      this.emit('abTestRecommendations:generated', recommendations);
      return recommendations;

    } catch (error) {
      this.logger.error('Failed to generate A/B test recommendations', error);
      throw error;
    }
  }

  /**
   * Generate personalization recommendations
   */
  async generatePersonalizationRecommendations(userId: string): Promise<Array<{
    type: 'interface' | 'content' | 'search' | 'feature';
    title: string;
    description: string;
    implementation: string;
    expectedBenefit: string;
    confidence: number;
  }>> {
    try {
      const segments = await this.getUserSegments(userId);
      const patterns = await this.getUserPatterns(userId);
      const predictions = await this.getUserPredictions(userId);

      const recommendations = [];

      // Interface personalization
      const interfaceRecs = this.generateInterfacePersonalization(segments, patterns);
      recommendations.push(...interfaceRecs);

      // Content personalization
      const contentRecs = this.generateContentPersonalization(patterns, predictions);
      recommendations.push(...contentRecs);

      // Search personalization
      const searchRecs = this.generateSearchPersonalization(patterns);
      recommendations.push(...searchRecs);

      // Feature personalization
      const featureRecs = this.generateFeaturePersonalization(segments);
      recommendations.push(...featureRecs);

      return recommendations;

    } catch (error) {
      this.logger.error('Failed to generate personalization recommendations', error, { userId });
      throw error;
    }
  }

  /**
   * Get existing insights for a user
   */
  async getUserInsights(
    userId: string,
    options: {
      categories?: string[];
      minImpactScore?: number;
      limit?: number;
    } = {}
  ): Promise<UserBehaviorInsight[]> {
    try {
      let query = this.db
        .selectFrom('user_behavior_insights')
        .selectAll()
        .where('user_id', '=', userId);

      if (options.categories && options.categories.length > 0) {
        query = query.where('insight_category', 'in', options.categories);
      }

      if (options.minImpactScore !== undefined) {
        query = query.where('impact_score', '>=', options.minImpactScore);
      }

      const results = await query
        .orderBy('impact_score', 'desc')
        .limit(options.limit || 50)
        .execute();

      return results.map(this.mapDbRowToInsight);

    } catch (error) {
      this.logger.error('Failed to get user insights', error, { userId, options });
      throw error;
    }
  }

  /**
   * Mark insight as reviewed or implemented
   */
  async updateInsightStatus(
    insightId: string,
    status: 'reviewed' | 'approved' | 'implemented' | 'dismissed',
    reviewedBy?: string
  ): Promise<void> {
    try {
      const updateData: any = {
        status,
        updated_at: new Date(),
      };

      if (reviewedBy) {
        updateData.reviewed_by = reviewedBy;
        updateData.reviewed_at = new Date();
      }

      if (status === 'implemented') {
        updateData.implemented_at = new Date();
      }

      await this.db
        .updateTable('user_behavior_insights')
        .set(updateData)
        .where('id', '=', insightId)
        .execute();

      this.emit('insight:statusUpdated', { insightId, status, reviewedBy });

    } catch (error) {
      this.logger.error('Failed to update insight status', error, { insightId, status });
      throw error;
    }
  }

  // Private methods for generating specific types of insights

  private async generateSearchOptimizationInsights(
    userId: string,
    events: BehaviorEvent[],
    patterns: UserSearchPattern[]
  ): Promise<UserBehaviorInsight[]> {
    const insights: UserBehaviorInsight[] = [];
    
    const searchEvents = events.filter(e => e.eventType === 'search');
    if (searchEvents.length === 0) return insights;

    // Analyze search success rate
    const successRate = await this.calculateSearchSuccessRate(userId, searchEvents);
    if (successRate < 0.7) {
      insights.push({
        userId,
        insightType: 'user_specific',
        insightCategory: 'search_optimization',
        insightTitle: 'Low Search Success Rate',
        insightDescription: `User's search success rate is ${Math.round(successRate * 100)}%, below the optimal threshold`,
        insightData: {
          metric: 'search_success_rate',
          currentValue: successRate,
          targetValue: 0.8,
          changePercent: -((0.8 - successRate) / 0.8) * 100,
          trendDirection: 'down',
          timeframe: 'last_30_days',
        },
        recommendation: {
          action: 'Improve search suggestions and query understanding',
          description: 'Implement better query suggestion and auto-completion features',
          expectedImpact: 'Increase search success rate by 15-20%',
          priority: 'high',
          estimatedEffort: 'medium',
        },
        impactScore: 0.8,
        priorityScore: 85,
        confidenceLevel: 'high',
      });
    }

    // Analyze query refinement patterns
    const refinementRate = this.calculateQueryRefinementRate(searchEvents);
    if (refinementRate > 0.4) {
      insights.push({
        userId,
        insightType: 'user_specific',
        insightCategory: 'search_optimization',
        insightTitle: 'High Query Refinement Rate',
        insightDescription: `User refines queries ${Math.round(refinementRate * 100)}% of the time, indicating search difficulties`,
        insightData: {
          metric: 'query_refinement_rate',
          currentValue: refinementRate,
          targetValue: 0.3,
          details: { avgRefinementsPerQuery: refinementRate * 2 },
        },
        recommendation: {
          action: 'Provide better initial search results',
          description: 'Enhance search ranking algorithm and provide better query suggestions',
          expectedImpact: 'Reduce query refinements by 25%',
          priority: 'medium',
        },
        impactScore: 0.7,
        priorityScore: 70,
        confidenceLevel: 'medium',
      });
    }

    return insights;
  }

  private async generateEngagementInsights(
    userId: string,
    events: BehaviorEvent[],
    segments: UserBehaviorSegment[]
  ): Promise<UserBehaviorInsight[]> {
    const insights: UserBehaviorInsight[] = [];

    // Analyze session duration trends
    const sessionDurations = this.extractSessionDurations(events);
    if (sessionDurations.length > 0) {
      const avgDuration = sessionDurations.reduce((sum, d) => sum + d, 0) / sessionDurations.length;
      
      if (avgDuration < 300000) { // Less than 5 minutes
        insights.push({
          userId,
          insightType: 'user_specific',
          insightCategory: 'engagement',
          insightTitle: 'Short Session Duration',
          insightDescription: `Average session duration is ${Math.round(avgDuration / 1000 / 60)} minutes, indicating low engagement`,
          insightData: {
            metric: 'avg_session_duration',
            currentValue: avgDuration,
            targetValue: 600000, // 10 minutes
            timeframe: 'last_30_days',
          },
          recommendation: {
            action: 'Improve content discovery and engagement features',
            description: 'Add related content suggestions and interactive elements',
            expectedImpact: 'Increase session duration by 40%',
            priority: 'medium',
          },
          impactScore: 0.65,
          priorityScore: 65,
          confidenceLevel: 'medium',
        });
      }
    }

    // Analyze interaction depth
    const interactionDepth = this.calculateInteractionDepth(events);
    if (interactionDepth < 3) {
      insights.push({
        userId,
        insightType: 'user_specific',
        insightCategory: 'engagement',
        insightTitle: 'Low Interaction Depth',
        insightDescription: `User averages ${interactionDepth.toFixed(1)} interactions per session`,
        insightData: {
          metric: 'interaction_depth',
          currentValue: interactionDepth,
          targetValue: 5,
        },
        recommendation: {
          action: 'Encourage deeper exploration',
          description: 'Add guided tours and discovery features',
          priority: 'low',
        },
        impactScore: 0.5,
        priorityScore: 50,
      });
    }

    return insights;
  }

  private async generatePerformanceInsights(
    userId: string,
    events: BehaviorEvent[]
  ): Promise<UserBehaviorInsight[]> {
    const insights: UserBehaviorInsight[] = [];

    // Analyze response times
    const responseTimes = events
      .map(e => e.responseTimeMs)
      .filter((rt): rt is number => rt !== undefined && rt !== null);

    if (responseTimes.length > 0) {
      const avgResponseTime = responseTimes.reduce((sum, rt) => sum + rt, 0) / responseTimes.length;
      
      if (avgResponseTime > 2000) { // Slower than 2 seconds
        insights.push({
          userId,
          insightType: 'user_specific',
          insightCategory: 'performance',
          insightTitle: 'Slow Response Times',
          insightDescription: `Average response time is ${Math.round(avgResponseTime)}ms, affecting user experience`,
          insightData: {
            metric: 'avg_response_time',
            currentValue: avgResponseTime,
            targetValue: 1000,
            trendDirection: 'up',
          },
          recommendation: {
            action: 'Optimize system performance',
            description: 'Implement caching and query optimization',
            expectedImpact: 'Reduce response times by 50%',
            priority: 'high',
            estimatedEffort: 'high',
          },
          impactScore: 0.9,
          priorityScore: 90,
          confidenceLevel: 'high',
        });
      }
    }

    return insights;
  }

  private async generatePatternInsights(
    userId: string,
    patterns: UserSearchPattern[]
  ): Promise<UserBehaviorInsight[]> {
    const insights: UserBehaviorInsight[] = [];

    // Analyze temporal patterns
    const timePatterns = patterns.filter(p => p.patternType === 'time_pattern');
    if (timePatterns.length > 0) {
      const peakHours = timePatterns
        .flatMap(p => p.patternData.peakUsageHours || [])
        .filter((hour): hour is number => typeof hour === 'number');

      if (peakHours.length > 0) {
        insights.push({
          userId,
          insightType: 'user_specific',
          insightCategory: 'feature_usage',
          insightTitle: 'Usage Time Patterns Detected',
          insightDescription: `User is most active during hours: ${peakHours.join(', ')}`,
          insightData: {
            details: { peakHours, patternCount: timePatterns.length },
          },
          recommendation: {
            action: 'Optimize content delivery for peak hours',
            description: 'Pre-load content and optimize performance during peak usage times',
            priority: 'low',
          },
          impactScore: 0.4,
          priorityScore: 40,
        });
      }
    }

    return insights;
  }

  private async generatePersonalizationInsights(
    userId: string,
    predictions: UserBehaviorPrediction[],
    segments: UserBehaviorSegment[]
  ): Promise<UserBehaviorInsight[]> {
    const insights: UserBehaviorInsight[] = [];

    // Analyze churn risk predictions
    const churnPredictions = predictions.filter(p => p.predictionType === 'churn_risk');
    if (churnPredictions.length > 0) {
      const highRiskPredictions = churnPredictions.filter(p => 
        p.predictionValue && typeof p.predictionValue === 'object' && 
        'riskScore' in p.predictionValue && 
        (p.predictionValue as any).riskScore > 0.7
      );

      if (highRiskPredictions.length > 0) {
        insights.push({
          userId,
          insightType: 'user_specific',
          insightCategory: 'engagement',
          insightTitle: 'High Churn Risk Detected',
          insightDescription: 'User shows patterns indicating potential churn risk',
          insightData: {
            metric: 'churn_risk',
            currentValue: (highRiskPredictions[0].predictionValue as any).riskScore,
            targetValue: 0.3,
          },
          recommendation: {
            action: 'Implement retention strategies',
            description: 'Provide personalized content and engagement incentives',
            expectedImpact: 'Reduce churn probability by 60%',
            priority: 'high',
          },
          impactScore: 0.95,
          priorityScore: 95,
          confidenceLevel: 'high',
        });
      }
    }

    return insights;
  }

  // Helper methods

  private async calculateSearchSuccessRate(userId: string, searchEvents: BehaviorEvent[]): Promise<number> {
    // Simplified calculation - in production, define success criteria more precisely
    const searchesWithClicks = searchEvents.filter(event => {
      // Check if there was a click event shortly after search
      return true; // Placeholder logic
    });
    
    return searchEvents.length > 0 ? searchesWithClicks.length / searchEvents.length : 0;
  }

  private calculateQueryRefinementRate(searchEvents: BehaviorEvent[]): number {
    // Simplified refinement detection
    let refinements = 0;
    
    for (let i = 1; i < searchEvents.length; i++) {
      const currentQuery = searchEvents[i].searchQuery || '';
      const previousQuery = searchEvents[i - 1].searchQuery || '';
      
      // Check if queries are similar but not identical (refinement)
      if (currentQuery && previousQuery && 
          currentQuery !== previousQuery &&
          this.calculateQuerySimilarity(currentQuery, previousQuery) > 0.6) {
        refinements++;
      }
    }
    
    return searchEvents.length > 1 ? refinements / (searchEvents.length - 1) : 0;
  }

  private calculateQuerySimilarity(query1: string, query2: string): number {
    const words1 = new Set(query1.toLowerCase().split(/\s+/));
    const words2 = new Set(query2.toLowerCase().split(/\s+/));
    const intersection = new Set([...words1].filter(word => words2.has(word)));
    const union = new Set([...words1, ...words2]);
    
    return union.size > 0 ? intersection.size / union.size : 0;
  }

  private extractSessionDurations(events: BehaviorEvent[]): number[] {
    const sessions = new Map<string, BehaviorEvent[]>();
    
    events.forEach(event => {
      if (!sessions.has(event.sessionId)) {
        sessions.set(event.sessionId, []);
      }
      sessions.get(event.sessionId)!.push(event);
    });

    return Array.from(sessions.values()).map(sessionEvents => {
      if (sessionEvents.length < 2) return 0;
      
      const timestamps = sessionEvents.map(e => e.eventTimestamp.getTime()).sort((a, b) => a - b);
      return timestamps[timestamps.length - 1] - timestamps[0];
    }).filter(duration => duration > 0);
  }

  private calculateInteractionDepth(events: BehaviorEvent[]): number {
    const sessions = new Map<string, number>();
    
    events.forEach(event => {
      sessions.set(event.sessionId, (sessions.get(event.sessionId) || 0) + 1);
    });

    const depths = Array.from(sessions.values());
    return depths.length > 0 ? depths.reduce((sum, depth) => sum + depth, 0) / depths.length : 0;
  }

  private createEmptyResult(): InsightGenerationResult {
    return {
      insights: [],
      totalGenerated: 0,
      significantInsights: 0,
      categories: {},
      confidence: 0,
      generatedAt: new Date(),
    };
  }

  private categorizeInsights(insights: UserBehaviorInsight[]): Record<string, number> {
    const categories: Record<string, number> = {};
    
    insights.forEach(insight => {
      categories[insight.insightCategory] = (categories[insight.insightCategory] || 0) + 1;
    });

    return categories;
  }

  // Placeholder methods for system-wide insights and other features

  private async analyzeGlobalBehaviorTrends(): Promise<SystemWideInsight[]> {
    return [];
  }

  private async analyzeCommonJourneyIssues(): Promise<SystemWideInsight[]> {
    return [];
  }

  private async analyzeSearchPerformance(): Promise<SystemWideInsight[]> {
    return [];
  }

  private async analyzeFeatureUsage(): Promise<SystemWideInsight[]> {
    return [];
  }

  private async analyzeUserRetention(): Promise<SystemWideInsight[]> {
    return [];
  }

  private convertToUserBehaviorInsight(insight: SystemWideInsight): UserBehaviorInsight {
    return {
      insightType: 'system_wide',
      insightCategory: insight.category as any,
      insightTitle: insight.title,
      insightDescription: insight.description,
      insightData: insight.data,
      recommendation: insight.recommendation,
      impactScore: insight.impact === 'high' ? 0.9 : insight.impact === 'medium' ? 0.6 : 0.3,
      priorityScore: insight.urgency === 'high' ? 90 : insight.urgency === 'medium' ? 60 : 30,
    };
  }

  private mapEventsToJourney(events: BehaviorEvent[]): UserJourney['journey'] {
    return events.map((event, index) => ({
      step: index + 1,
      action: `${event.eventType}:${event.eventAction}`,
      timestamp: event.eventTimestamp,
      success: true, // Simplified
      duration: event.interactionDurationMs || 0,
    }));
  }

  private identifyJourneyBottlenecks(journey: UserJourney['journey']): UserJourney['bottlenecks'] {
    return [];
  }

  private generateJourneyRecommendations(bottlenecks: UserJourney['bottlenecks'], journey: UserJourney['journey']): string[] {
    return [];
  }

  private calculateJourneySuccess(journey: UserJourney['journey']): boolean {
    return journey.length > 0 && journey.some(step => step.success);
  }

  // Database operations

  private async getUserEvents(userId: string, days: number): Promise<BehaviorEvent[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const results = await this.db
      .selectFrom('user_behavior_events')
      .selectAll()
      .where('user_id', '=', userId)
      .where('event_timestamp', '>=', cutoffDate)
      .execute();

    return results.map(row => ({
      id: row.id,
      userId: row.user_id,
      sessionId: row.session_id,
      eventType: row.event_type,
      eventCategory: row.event_category,
      eventAction: row.event_action,
      searchQuery: row.search_query,
      searchContext: row.search_context,
      resultData: row.result_data,
      pageContext: row.page_context,
      eventTimestamp: row.event_timestamp,
      sessionSequence: row.session_sequence,
      pageSequence: row.page_sequence,
      userAgent: row.user_agent,
      ipAddress: row.ip_address,
      referrer: row.referrer,
      deviceInfo: row.device_info,
      responseTimeMs: row.response_time_ms,
      searchDurationMs: row.search_duration_ms,
      interactionDurationMs: row.interaction_duration_ms,
      createdAt: row.created_at,
    }));
  }

  private async getUserPatterns(userId: string): Promise<UserSearchPattern[]> {
    const results = await this.db
      .selectFrom('user_search_patterns')
      .selectAll()
      .where('user_id', '=', userId)
      .where('is_active', '=', true)
      .execute();

    return results.map(row => ({
      id: row.id,
      userId: row.user_id,
      patternType: row.pattern_type,
      patternName: row.pattern_name,
      patternDescription: row.pattern_description,
      patternData: row.pattern_data,
      confidenceScore: row.confidence_score ? parseFloat(row.confidence_score) : undefined,
      frequencyScore: row.frequency_score ? parseFloat(row.frequency_score) : undefined,
      occurrences: row.occurrences,
      lastOccurrenceAt: row.last_occurrence_at,
      firstDetectedAt: row.first_detected_at,
      modelVersion: row.model_version,
      learningAlgorithm: row.learning_algorithm,
      trainingDataSize: row.training_data_size,
      isActive: row.is_active,
      isSignificant: row.is_significant,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  private async getUserSegments(userId: string): Promise<UserBehaviorSegment[]> {
    const results = await this.db
      .selectFrom('user_behavior_segments')
      .selectAll()
      .where('user_id', '=', userId)
      .where('is_active', '=', true)
      .execute();

    return results.map(row => ({
      id: row.id,
      userId: row.user_id,
      segmentType: row.segment_type,
      segmentName: row.segment_name,
      segmentDescription: row.segment_description,
      segmentAttributes: row.segment_attributes,
      segmentScores: row.segment_scores,
      confidenceScore: row.confidence_score ? parseFloat(row.confidence_score) : undefined,
      stabilityScore: row.stability_score ? parseFloat(row.stability_score) : undefined,
      segmentSince: row.segment_since,
      lastUpdatedAt: row.last_updated_at,
      reassignmentCount: row.reassignment_count,
      classificationModel: row.classification_model,
      modelVersion: row.model_version,
      featureImportance: row.feature_importance,
      isActive: row.is_active,
      isPrimary: row.is_primary,
      createdAt: row.created_at,
    }));
  }

  private async getUserPredictions(userId: string): Promise<UserBehaviorPrediction[]> {
    const results = await this.db
      .selectFrom('user_behavior_predictions')
      .selectAll()
      .where('user_id', '=', userId)
      .execute();

    return results.map(row => ({
      id: row.id,
      userId: row.user_id,
      predictionType: row.prediction_type,
      predictionTarget: row.prediction_target,
      predictionValue: row.prediction_value,
      confidenceScore: row.confidence_score ? parseFloat(row.confidence_score) : undefined,
      probabilityScore: row.probability_score ? parseFloat(row.probability_score) : undefined,
      expectedOutcome: row.expected_outcome,
      modelName: row.model_name,
      modelVersion: row.model_version,
      algorithmUsed: row.algorithm_used,
      featureSet: row.feature_set,
      predictionMadeAt: row.prediction_made_at,
      predictionExpiresAt: row.prediction_expires_at,
      predictionHorizonDays: row.prediction_horizon_days,
      isValidated: row.is_validated,
      actualOutcome: row.actual_outcome,
      validationAccuracy: row.validation_accuracy ? parseFloat(row.validation_accuracy) : undefined,
      validatedAt: row.validated_at,
      createdAt: row.created_at,
    }));
  }

  private async storeInsights(insights: UserBehaviorInsight[]): Promise<void> {
    for (const insight of insights) {
      await this.db
        .insertInto('user_behavior_insights')
        .values({
          id: crypto.randomUUID(),
          user_id: insight.userId,
          insight_type: insight.insightType,
          insight_category: insight.insightCategory,
          insight_title: insight.insightTitle,
          insight_description: insight.insightDescription,
          insight_data: insight.insightData,
          evidence: insight.evidence,
          recommendation: insight.recommendation,
          impact_score: insight.impactScore,
          priority_score: insight.priorityScore,
          effort_estimate: insight.effortEstimate,
          status: insight.status || 'generated',
          reviewed_by: insight.reviewedBy,
          reviewed_at: insight.reviewedAt,
          implemented_at: insight.implementedAt,
          generated_by_model: insight.generatedByModel,
          model_version: insight.modelVersion,
          confidence_level: insight.confidenceLevel,
          created_at: insight.createdAt || new Date(),
          updated_at: insight.updatedAt || new Date(),
          expires_at: insight.expiresAt,
        })
        .execute();
    }
  }

  private mapDbRowToInsight(row: any): UserBehaviorInsight {
    return {
      id: row.id,
      userId: row.user_id,
      insightType: row.insight_type,
      insightCategory: row.insight_category,
      insightTitle: row.insight_title,
      insightDescription: row.insight_description,
      insightData: row.insight_data,
      evidence: row.evidence,
      recommendation: row.recommendation,
      impactScore: row.impact_score ? parseFloat(row.impact_score) : undefined,
      priorityScore: row.priority_score,
      effortEstimate: row.effort_estimate,
      status: row.status,
      reviewedBy: row.reviewed_by,
      reviewedAt: row.reviewed_at,
      implementedAt: row.implemented_at,
      generatedByModel: row.generated_by_model,
      modelVersion: row.model_version,
      confidenceLevel: row.confidence_level,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      expiresAt: row.expires_at,
    };
  }

  // Placeholder methods for advanced features

  private async analyzeSearchPatternsForTesting(): Promise<any[]> {
    return [];
  }

  private async analyzeUIInteractionsForTesting(): Promise<any[]> {
    return [];
  }

  private async analyzeContentEngagementForTesting(): Promise<any[]> {
    return [];
  }

  private generateInterfacePersonalization(segments: UserBehaviorSegment[], patterns: UserSearchPattern[]): any[] {
    return [];
  }

  private generateContentPersonalization(patterns: UserSearchPattern[], predictions: UserBehaviorPrediction[]): any[] {
    return [];
  }

  private generateSearchPersonalization(patterns: UserSearchPattern[]): any[] {
    return [];
  }

  private generateFeaturePersonalization(segments: UserBehaviorSegment[]): any[] {
    return [];
  }
}