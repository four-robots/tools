import { BehaviorEvent, UserSearchPattern, SegmentAttributes } from '../../../shared/types/user-behavior.js';
import { StatisticalAnalyzer } from './statistical-analyzer.js';
import { Logger } from '../../../shared/utils/logger.js';

export interface FeatureVector {
  userId: string;
  features: Record<string, number>;
  metadata?: Record<string, any>;
}

export interface TemporalFeatures {
  hourOfDay: number;
  dayOfWeek: number;
  weekOfYear: number;
  monthOfYear: number;
  isWeekend: boolean;
  isBusinessHours: boolean;
  timeZoneOffset: number;
}

export interface BehavioralFeatures {
  sessionDuration: number;
  eventsPerSession: number;
  queryComplexity: number;
  interactionDepth: number;
  searchFrequency: number;
  engagementScore: number;
  explorationRatio: number;
  successRate: number;
}

export interface ContentFeatures {
  topicDiversity: number;
  contentTypePreference: Record<string, number>;
  queryLength: number;
  filterUsage: number;
  facetUsage: number;
  resultClickPosition: number;
  dwellTime: number;
}

export class MLFeatureExtractor {
  private statisticalAnalyzer: StatisticalAnalyzer;
  private logger: Logger;

  constructor() {
    this.statisticalAnalyzer = new StatisticalAnalyzer();
    this.logger = new Logger('MLFeatureExtractor');
  }

  /**
   * Extract comprehensive feature vector from user events
   */
  extractUserFeatures(
    userId: string,
    events: BehaviorEvent[],
    timeWindow: number = 30 // days
  ): FeatureVector {
    try {
      const recentEvents = this.filterRecentEvents(events, timeWindow);
      
      const temporalFeatures = this.extractTemporalFeatures(recentEvents);
      const behavioralFeatures = this.extractBehavioralFeatures(recentEvents);
      const contentFeatures = this.extractContentFeatures(recentEvents);
      const interactionFeatures = this.extractInteractionFeatures(recentEvents);
      const sessionFeatures = this.extractSessionFeatures(recentEvents);

      const features = {
        ...this.normalizeTemporalFeatures(temporalFeatures),
        ...this.normalizeBehavioralFeatures(behavioralFeatures),
        ...this.normalizeContentFeatures(contentFeatures),
        ...interactionFeatures,
        ...sessionFeatures,
      };

      return {
        userId,
        features,
        metadata: {
          extractedAt: new Date(),
          eventCount: recentEvents.length,
          timeWindow,
        },
      };

    } catch (error) {
      this.logger.error('Failed to extract user features', error, { userId });
      throw error;
    }
  }

  /**
   * Extract features for search behavior clustering
   */
  extractSearchBehaviorFeatures(events: BehaviorEvent[]): FeatureVector {
    const searchEvents = events.filter(e => e.eventType === 'search');
    
    if (searchEvents.length === 0) {
      return {
        userId: events[0]?.userId || '',
        features: {},
      };
    }

    const features = {
      // Query characteristics
      avgQueryLength: this.calculateAverageQueryLength(searchEvents),
      queryComplexityScore: this.calculateQueryComplexityScore(searchEvents),
      uniqueTermsRatio: this.calculateUniqueTermsRatio(searchEvents),
      
      // Search patterns
      searchFrequency: this.calculateSearchFrequency(searchEvents),
      refinementRate: this.calculateRefinementRate(searchEvents),
      explorationDepth: this.calculateExplorationDepth(searchEvents),
      
      // Temporal patterns
      searchTimeVariability: this.calculateSearchTimeVariability(searchEvents),
      sessionSearchDensity: this.calculateSessionSearchDensity(searchEvents),
      
      // Success indicators
      clickThroughRate: this.calculateClickThroughRate(events, searchEvents),
      searchSuccessRate: this.calculateSearchSuccessRate(events, searchEvents),
      averageDwellTime: this.calculateAverageDwellTime(events),
    };

    return {
      userId: searchEvents[0].userId,
      features,
    };
  }

  /**
   * Extract features for user segmentation
   */
  extractSegmentationFeatures(
    userId: string,
    events: BehaviorEvent[],
    patterns: UserSearchPattern[]
  ): FeatureVector {
    const features = {
      // Activity level
      totalEvents: events.length,
      activeDays: this.calculateActiveDays(events),
      avgEventsPerDay: this.calculateAvgEventsPerDay(events),
      
      // Engagement metrics
      sessionCount: this.getUniqueSessionCount(events),
      avgSessionDuration: this.calculateAvgSessionDuration(events),
      interactionDepth: this.calculateInteractionDepth(events),
      
      // Content preferences
      contentDiversity: this.calculateContentDiversity(events),
      topicFocusScore: this.calculateTopicFocusScore(patterns),
      
      // Search sophistication
      queryComplexity: this.calculateOverallQueryComplexity(events),
      filterUsageRate: this.calculateFilterUsageRate(events),
      facetUsageRate: this.calculateFacetUsageRate(events),
      
      // Behavioral patterns
      explorationVsExploitation: this.calculateExplorationRatio(events),
      consistencyScore: this.calculateBehaviorConsistency(events),
      adaptabilityScore: this.calculateAdaptabilityScore(events),
      
      // Temporal characteristics
      timeRegularity: this.calculateTimeRegularity(events),
      peakUsageHour: this.calculatePeakUsageHour(events),
      weekendUsage: this.calculateWeekendUsageRatio(events),
    };

    return {
      userId,
      features,
    };
  }

  /**
   * Extract features for prediction models
   */
  extractPredictionFeatures(
    events: BehaviorEvent[],
    lookbackDays: number = 7
  ): FeatureVector {
    const recentEvents = this.filterRecentEvents(events, lookbackDays);
    
    const features = {
      // Recent activity trends
      recentActivityTrend: this.calculateActivityTrend(recentEvents),
      engagementTrend: this.calculateEngagementTrend(recentEvents),
      searchPatternStability: this.calculatePatternStability(recentEvents),
      
      // Predictive indicators
      sessionGapVariability: this.calculateSessionGapVariability(recentEvents),
      queryRepetitionRate: this.calculateQueryRepetitionRate(recentEvents),
      interactionConsistency: this.calculateInteractionConsistency(recentEvents),
      
      // Contextual features
      recentErrorRate: this.calculateRecentErrorRate(recentEvents),
      helpSeekingBehavior: this.calculateHelpSeekingBehavior(recentEvents),
      experimentationRate: this.calculateExperimentationRate(recentEvents),
      
      // Seasonal adjustments
      dayOfWeekEffect: this.calculateDayOfWeekEffect(recentEvents),
      timeOfDayEffect: this.calculateTimeOfDayEffect(recentEvents),
    };

    return {
      userId: recentEvents[0]?.userId || '',
      features,
    };
  }

  /**
   * Create feature vectors for clustering analysis
   */
  createClusteringFeatures(userFeatures: FeatureVector[]): number[][] {
    if (userFeatures.length === 0) return [];

    // Get all unique feature keys
    const allFeatureKeys = new Set<string>();
    userFeatures.forEach(uf => {
      Object.keys(uf.features).forEach(key => allFeatureKeys.add(key));
    });

    const featureKeys = Array.from(allFeatureKeys).sort();
    
    // Create feature matrix
    const featureMatrix = userFeatures.map(uf => {
      return featureKeys.map(key => uf.features[key] || 0);
    });

    // Normalize features
    return this.normalizeFeatureMatrix(featureMatrix);
  }

  /**
   * Calculate feature importance scores
   */
  calculateFeatureImportance(
    features: FeatureVector[],
    target: number[]
  ): Record<string, number> {
    if (features.length !== target.length) {
      throw new Error('Features and target arrays must have same length');
    }

    const importance: Record<string, number> = {};
    const featureKeys = Object.keys(features[0]?.features || {});

    for (const featureKey of featureKeys) {
      const featureValues = features.map(f => f.features[featureKey] || 0);
      const correlation = this.statisticalAnalyzer.calculateCorrelation(featureValues, target);
      importance[featureKey] = Math.abs(correlation.coefficient);
    }

    return importance;
  }

  // Private helper methods

  private filterRecentEvents(events: BehaviorEvent[], days: number): BehaviorEvent[] {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    return events.filter(event => 
      event.eventTimestamp >= cutoffDate
    );
  }

  private extractTemporalFeatures(events: BehaviorEvent[]): TemporalFeatures {
    if (events.length === 0) {
      return {
        hourOfDay: 0,
        dayOfWeek: 0,
        weekOfYear: 0,
        monthOfYear: 0,
        isWeekend: false,
        isBusinessHours: false,
        timeZoneOffset: 0,
      };
    }

    const timestamps = events.map(e => e.eventTimestamp);
    const avgTimestamp = new Date(
      timestamps.reduce((sum, ts) => sum + ts.getTime(), 0) / timestamps.length
    );

    return {
      hourOfDay: avgTimestamp.getHours(),
      dayOfWeek: avgTimestamp.getDay(),
      weekOfYear: this.getWeekOfYear(avgTimestamp),
      monthOfYear: avgTimestamp.getMonth(),
      isWeekend: avgTimestamp.getDay() === 0 || avgTimestamp.getDay() === 6,
      isBusinessHours: avgTimestamp.getHours() >= 9 && avgTimestamp.getHours() <= 17,
      timeZoneOffset: avgTimestamp.getTimezoneOffset(),
    };
  }

  private extractBehavioralFeatures(events: BehaviorEvent[]): BehavioralFeatures {
    const sessions = this.groupEventsBySession(events);
    const searchEvents = events.filter(e => e.eventType === 'search');
    
    return {
      sessionDuration: this.calculateAvgSessionDuration(events),
      eventsPerSession: this.calculateAvgEventsPerSession(sessions),
      queryComplexity: this.calculateOverallQueryComplexity(searchEvents),
      interactionDepth: this.calculateInteractionDepth(events),
      searchFrequency: this.calculateSearchFrequency(searchEvents),
      engagementScore: this.calculateEngagementScore(events),
      explorationRatio: this.calculateExplorationRatio(events),
      successRate: this.calculateSearchSuccessRate(events, searchEvents),
    };
  }

  private extractContentFeatures(events: BehaviorEvent[]): ContentFeatures {
    const searchEvents = events.filter(e => e.eventType === 'search');
    
    return {
      topicDiversity: this.calculateContentDiversity(events),
      contentTypePreference: this.calculateContentTypePreference(events),
      queryLength: this.calculateAverageQueryLength(searchEvents),
      filterUsage: this.calculateFilterUsageRate(events),
      facetUsage: this.calculateFacetUsageRate(events),
      resultClickPosition: this.calculateAvgClickPosition(events),
      dwellTime: this.calculateAverageDwellTime(events),
    };
  }

  private extractInteractionFeatures(events: BehaviorEvent[]): Record<string, number> {
    const eventTypeCounts = new Map<string, number>();
    
    events.forEach(event => {
      eventTypeCounts.set(
        event.eventType, 
        (eventTypeCounts.get(event.eventType) || 0) + 1
      );
    });

    const features: Record<string, number> = {};
    for (const [eventType, count] of eventTypeCounts) {
      features[`${eventType}_rate`] = count / events.length;
    }

    return features;
  }

  private extractSessionFeatures(events: BehaviorEvent[]): Record<string, number> {
    const sessions = this.groupEventsBySession(events);
    
    return {
      session_count: sessions.length,
      avg_session_length: this.calculateAvgEventsPerSession(sessions),
      session_duration_variance: this.calculateSessionDurationVariance(sessions),
      intersession_gap_avg: this.calculateAvgIntersessionGap(sessions),
    };
  }

  private normalizeTemporalFeatures(features: TemporalFeatures): Record<string, number> {
    return {
      hour_of_day_normalized: features.hourOfDay / 23,
      day_of_week_normalized: features.dayOfWeek / 6,
      week_of_year_normalized: features.weekOfYear / 52,
      month_of_year_normalized: features.monthOfYear / 11,
      is_weekend: features.isWeekend ? 1 : 0,
      is_business_hours: features.isBusinessHours ? 1 : 0,
    };
  }

  private normalizeBehavioralFeatures(features: BehavioralFeatures): Record<string, number> {
    return {
      session_duration_normalized: Math.min(features.sessionDuration / (60 * 60 * 1000), 1), // max 1 hour
      events_per_session_normalized: Math.min(features.eventsPerSession / 100, 1), // max 100 events
      query_complexity_normalized: Math.min(features.queryComplexity, 1),
      interaction_depth_normalized: Math.min(features.interactionDepth / 10, 1), // max 10 levels
      search_frequency_normalized: Math.min(features.searchFrequency / 100, 1), // max 100 per day
      engagement_score_normalized: Math.min(features.engagementScore, 1),
      exploration_ratio_normalized: Math.min(features.explorationRatio, 1),
      success_rate_normalized: Math.min(features.successRate, 1),
    };
  }

  private normalizeContentFeatures(features: ContentFeatures): Record<string, number> {
    const normalized: Record<string, number> = {
      topic_diversity_normalized: Math.min(features.topicDiversity, 1),
      query_length_normalized: Math.min(features.queryLength / 100, 1), // max 100 chars
      filter_usage_normalized: Math.min(features.filterUsage, 1),
      facet_usage_normalized: Math.min(features.facetUsage, 1),
      result_click_position_normalized: Math.min(features.resultClickPosition / 10, 1), // max position 10
      dwell_time_normalized: Math.min(features.dwellTime / (5 * 60 * 1000), 1), // max 5 minutes
    };

    // Add content type preferences
    for (const [contentType, preference] of Object.entries(features.contentTypePreference)) {
      normalized[`content_${contentType}_preference`] = preference;
    }

    return normalized;
  }

  private normalizeFeatureMatrix(matrix: number[][]): number[][] {
    if (matrix.length === 0) return [];
    
    const featureCount = matrix[0].length;
    const normalizedMatrix: number[][] = [];

    // Calculate min/max for each feature
    const featureMins: number[] = new Array(featureCount).fill(Infinity);
    const featureMaxs: number[] = new Array(featureCount).fill(-Infinity);

    matrix.forEach(row => {
      row.forEach((value, index) => {
        featureMins[index] = Math.min(featureMins[index], value);
        featureMaxs[index] = Math.max(featureMaxs[index], value);
      });
    });

    // Normalize each row
    matrix.forEach(row => {
      const normalizedRow = row.map((value, index) => {
        const min = featureMins[index];
        const max = featureMaxs[index];
        return max === min ? 0 : (value - min) / (max - min);
      });
      normalizedMatrix.push(normalizedRow);
    });

    return normalizedMatrix;
  }

  // Implementation of specific calculation methods
  // (These would contain the actual business logic for each metric)

  private calculateAverageQueryLength(searchEvents: BehaviorEvent[]): number {
    const queries = searchEvents
      .map(e => e.searchQuery)
      .filter((q): q is string => !!q);
    
    if (queries.length === 0) return 0;
    return queries.reduce((sum, query) => sum + query.length, 0) / queries.length;
  }

  private calculateQueryComplexityScore(events: BehaviorEvent[]): number {
    // Implementation would analyze query structure, operators, etc.
    return 0.5; // Placeholder
  }

  private calculateUniqueTermsRatio(events: BehaviorEvent[]): number {
    // Implementation would analyze term uniqueness
    return 0.7; // Placeholder
  }

  private calculateSearchFrequency(events: BehaviorEvent[]): number {
    if (events.length === 0) return 0;
    
    const daySpan = this.calculateDaySpan(events);
    return daySpan > 0 ? events.length / daySpan : events.length;
  }

  private calculateRefinementRate(events: BehaviorEvent[]): number {
    // Implementation would detect query refinements
    return 0.3; // Placeholder
  }

  private calculateExplorationDepth(events: BehaviorEvent[]): number {
    // Implementation would analyze search exploration patterns
    return 2.5; // Placeholder
  }

  private calculateSearchTimeVariability(events: BehaviorEvent[]): number {
    if (events.length < 2) return 0;
    
    const intervals = [];
    for (let i = 1; i < events.length; i++) {
      intervals.push(events[i].eventTimestamp.getTime() - events[i-1].eventTimestamp.getTime());
    }
    
    const stats = this.statisticalAnalyzer.calculateDescriptiveStats(intervals);
    return stats.stdDev / stats.mean || 0;
  }

  private calculateSessionSearchDensity(events: BehaviorEvent[]): number {
    const sessions = this.groupEventsBySession(events);
    if (sessions.length === 0) return 0;
    
    const searchDensities = sessions.map(sessionEvents => {
      const sessionDuration = this.getSessionDuration(sessionEvents);
      return sessionDuration > 0 ? sessionEvents.length / sessionDuration : 0;
    });
    
    return this.statisticalAnalyzer.calculateDescriptiveStats(searchDensities).mean;
  }

  private calculateClickThroughRate(allEvents: BehaviorEvent[], searchEvents: BehaviorEvent[]): number {
    if (searchEvents.length === 0) return 0;
    
    const clickEvents = allEvents.filter(e => e.eventType === 'click');
    return clickEvents.length / searchEvents.length;
  }

  private calculateSearchSuccessRate(allEvents: BehaviorEvent[], searchEvents: BehaviorEvent[]): number {
    // Implementation would define success criteria
    return 0.8; // Placeholder
  }

  private calculateAverageDwellTime(events: BehaviorEvent[]): number {
    const dwellTimes = events
      .map(e => e.resultData?.dwellTime)
      .filter((dt): dt is number => typeof dt === 'number');
    
    if (dwellTimes.length === 0) return 0;
    return this.statisticalAnalyzer.calculateDescriptiveStats(dwellTimes).mean;
  }

  // Additional helper methods would continue with similar patterns...

  private groupEventsBySession(events: BehaviorEvent[]): BehaviorEvent[][] {
    const sessions = new Map<string, BehaviorEvent[]>();
    
    events.forEach(event => {
      if (!sessions.has(event.sessionId)) {
        sessions.set(event.sessionId, []);
      }
      sessions.get(event.sessionId)!.push(event);
    });
    
    return Array.from(sessions.values());
  }

  private getWeekOfYear(date: Date): number {
    const start = new Date(date.getFullYear(), 0, 1);
    const diff = (date.getTime() - start.getTime()) / (24 * 60 * 60 * 1000);
    return Math.ceil((diff + start.getDay() + 1) / 7);
  }

  private calculateDaySpan(events: BehaviorEvent[]): number {
    if (events.length === 0) return 0;
    
    const timestamps = events.map(e => e.eventTimestamp.getTime());
    const minTime = Math.min(...timestamps);
    const maxTime = Math.max(...timestamps);
    
    return (maxTime - minTime) / (24 * 60 * 60 * 1000);
  }

  private getSessionDuration(sessionEvents: BehaviorEvent[]): number {
    if (sessionEvents.length === 0) return 0;
    
    const timestamps = sessionEvents.map(e => e.eventTimestamp.getTime());
    return Math.max(...timestamps) - Math.min(...timestamps);
  }

  // Placeholder methods for remaining calculations
  private calculateActiveDays(events: BehaviorEvent[]): number { return 0; }
  private calculateAvgEventsPerDay(events: BehaviorEvent[]): number { return 0; }
  private getUniqueSessionCount(events: BehaviorEvent[]): number { return 0; }
  private calculateAvgSessionDuration(events: BehaviorEvent[]): number { return 0; }
  private calculateInteractionDepth(events: BehaviorEvent[]): number { return 0; }
  private calculateContentDiversity(events: BehaviorEvent[]): number { return 0; }
  private calculateTopicFocusScore(patterns: UserSearchPattern[]): number { return 0; }
  private calculateOverallQueryComplexity(events: BehaviorEvent[]): number { return 0; }
  private calculateFilterUsageRate(events: BehaviorEvent[]): number { return 0; }
  private calculateFacetUsageRate(events: BehaviorEvent[]): number { return 0; }
  private calculateExplorationRatio(events: BehaviorEvent[]): number { return 0; }
  private calculateBehaviorConsistency(events: BehaviorEvent[]): number { return 0; }
  private calculateAdaptabilityScore(events: BehaviorEvent[]): number { return 0; }
  private calculateTimeRegularity(events: BehaviorEvent[]): number { return 0; }
  private calculatePeakUsageHour(events: BehaviorEvent[]): number { return 0; }
  private calculateWeekendUsageRatio(events: BehaviorEvent[]): number { return 0; }
  private calculateActivityTrend(events: BehaviorEvent[]): number { return 0; }
  private calculateEngagementTrend(events: BehaviorEvent[]): number { return 0; }
  private calculatePatternStability(events: BehaviorEvent[]): number { return 0; }
  private calculateSessionGapVariability(events: BehaviorEvent[]): number { return 0; }
  private calculateQueryRepetitionRate(events: BehaviorEvent[]): number { return 0; }
  private calculateInteractionConsistency(events: BehaviorEvent[]): number { return 0; }
  private calculateRecentErrorRate(events: BehaviorEvent[]): number { return 0; }
  private calculateHelpSeekingBehavior(events: BehaviorEvent[]): number { return 0; }
  private calculateExperimentationRate(events: BehaviorEvent[]): number { return 0; }
  private calculateDayOfWeekEffect(events: BehaviorEvent[]): number { return 0; }
  private calculateTimeOfDayEffect(events: BehaviorEvent[]): number { return 0; }
  private calculateAvgEventsPerSession(sessions: BehaviorEvent[][]): number { return 0; }
  private calculateEngagementScore(events: BehaviorEvent[]): number { return 0; }
  private calculateContentTypePreference(events: BehaviorEvent[]): Record<string, number> { return {}; }
  private calculateAvgClickPosition(events: BehaviorEvent[]): number { return 0; }
  private calculateSessionDurationVariance(sessions: BehaviorEvent[][]): number { return 0; }
  private calculateAvgIntersessionGap(sessions: BehaviorEvent[][]): number { return 0; }
}