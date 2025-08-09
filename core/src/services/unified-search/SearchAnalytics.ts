/**
 * Search Analytics Service
 * 
 * Tracks search performance, user behavior, and provides insights
 * to improve the unified search experience.
 */

import crypto from 'crypto';
import type {
  UnifiedSearchRequest,
  UnifiedSearchResponse,
  SearchQueryAnalytics,
  SearchPerformanceMetrics,
  ContentType
} from '../../shared/types/search.js';
import type { ProcessedQuery } from './QueryProcessor.js';

/**
 * Search event for analytics tracking
 */
export interface SearchEvent {
  /** Unique event ID */
  id: string;
  /** Search request */
  request: UnifiedSearchRequest;
  /** Search response */
  response: UnifiedSearchResponse;
  /** Processed query details */
  processedQuery?: ProcessedQuery;
  /** User who performed search */
  userId?: string;
  /** Session identifier */
  sessionId?: string;
  /** Search timestamp */
  timestamp: Date;
  /** Additional metadata */
  metadata?: Record<string, any>;
}

/**
 * Search analytics configuration
 */
export interface SearchAnalyticsConfig {
  /** Enable detailed query tracking */
  enableQueryTracking: boolean;
  /** Enable performance metrics */
  enablePerformanceTracking: boolean;
  /** Enable user behavior tracking */
  enableUserTracking: boolean;
  /** Maximum analytics entries to keep in memory */
  maxMemoryEntries: number;
  /** Analytics data retention period in days */
  retentionDays: number;
}

/**
 * Aggregated analytics data
 */
export interface SearchAnalyticsData {
  /** Query analytics */
  queries: SearchQueryAnalytics[];
  /** Performance metrics */
  performance: SearchPerformanceMetrics;
  /** Popular search terms */
  popularTerms: Array<{
    term: string;
    count: number;
    avgResults: number;
    avgResponseTime: number;
  }>;
  /** Search trends over time */
  trends: Array<{
    date: string;
    queryCount: number;
    avgResponseTime: number;
    successRate: number;
  }>;
  /** User behavior patterns */
  userBehavior: {
    topUsers: Array<{
      userId: string;
      searchCount: number;
      avgResultsClicked: number;
    }>;
    commonFilters: Array<{
      filter: string;
      count: number;
    }>;
    contentTypePreferences: Record<ContentType, number>;
  };
}

export class SearchAnalytics {
  private events: SearchEvent[] = [];
  private queryCache = new Map<string, number>(); // Query hash -> count
  private userCache = new Map<string, number>(); // User ID -> search count

  constructor(private config: SearchAnalyticsConfig) {}

  /**
   * Record a search event
   */
  async recordSearch(
    request: UnifiedSearchRequest,
    response: UnifiedSearchResponse,
    processedQuery?: ProcessedQuery,
    userId?: string,
    sessionId?: string
  ): Promise<void> {
    if (!this.config.enableQueryTracking) {
      return;
    }

    const event: SearchEvent = {
      id: crypto.randomUUID(),
      request,
      response,
      processedQuery,
      userId,
      sessionId,
      timestamp: new Date(),
      metadata: {
        queryLength: request.query.length,
        hasFilters: !!request.filters && Object.keys(request.filters).length > 0,
        usesSemantic: request.use_semantic,
        usesFuzzy: request.use_fuzzy,
        resultCount: response.results.length,
        processingTime: response.performance.processing_time_ms
      }
    };

    // Add to memory cache
    this.events.push(event);
    this.trimMemoryCache();

    // Update query cache
    const queryHash = this.hashQuery(request.query);
    this.queryCache.set(queryHash, (this.queryCache.get(queryHash) || 0) + 1);

    // Update user cache
    if (userId) {
      this.userCache.set(userId, (this.userCache.get(userId) || 0) + 1);
    }

    // In a production system, you would persist this to a database
    await this.persistEvent(event);
  }

  /**
   * Record search result interaction (click, view, etc.)
   */
  async recordInteraction(
    searchEventId: string,
    resultId: string,
    interactionType: 'click' | 'view' | 'copy' | 'share',
    userId?: string
  ): Promise<void> {
    if (!this.config.enableUserTracking) {
      return;
    }

    const interactionEvent = {
      id: crypto.randomUUID(),
      searchEventId,
      resultId,
      interactionType,
      userId,
      timestamp: new Date()
    };

    // In a production system, persist interaction events
    await this.persistInteraction(interactionEvent);
  }

  /**
   * Get analytics data for a specific user
   */
  async getAnalytics(
    userId?: string,
    dateFrom?: Date,
    dateTo?: Date
  ): Promise<SearchAnalyticsData> {
    const filteredEvents = this.filterEvents(userId, dateFrom, dateTo);

    return {
      queries: this.generateQueryAnalytics(filteredEvents),
      performance: this.generatePerformanceMetrics(filteredEvents),
      popularTerms: this.generatePopularTerms(filteredEvents),
      trends: this.generateTrends(filteredEvents),
      userBehavior: this.generateUserBehavior(filteredEvents)
    };
  }

  /**
   * Get performance metrics for a time period
   */
  async getPerformanceMetrics(
    dateFrom?: Date,
    dateTo?: Date
  ): Promise<SearchPerformanceMetrics> {
    const filteredEvents = this.filterEvents(undefined, dateFrom, dateTo);
    return this.generatePerformanceMetrics(filteredEvents);
  }

  /**
   * Get popular search terms
   */
  async getPopularTerms(limit: number = 10): Promise<Array<{
    term: string;
    count: number;
    avgResults: number;
  }>> {
    const termStats = new Map<string, {
      count: number;
      totalResults: number;
      totalTime: number;
    }>();

    for (const event of this.events) {
      const terms = this.extractTerms(event.request.query);
      
      for (const term of terms) {
        const stats = termStats.get(term) || { count: 0, totalResults: 0, totalTime: 0 };
        stats.count++;
        stats.totalResults += event.response.results.length;
        stats.totalTime += event.response.performance.processing_time_ms;
        termStats.set(term, stats);
      }
    }

    return Array.from(termStats.entries())
      .map(([term, stats]) => ({
        term,
        count: stats.count,
        avgResults: stats.totalResults / stats.count
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  /**
   * Get search success rate
   */
  async getSuccessRate(dateFrom?: Date, dateTo?: Date): Promise<number> {
    const filteredEvents = this.filterEvents(undefined, dateFrom, dateTo);
    
    if (filteredEvents.length === 0) {
      return 0;
    }

    const successfulSearches = filteredEvents.filter(
      event => event.response.results.length > 0
    ).length;

    return successfulSearches / filteredEvents.length;
  }

  /**
   * Clear all analytics data
   */
  async clearAnalytics(): Promise<void> {
    this.events = [];
    this.queryCache.clear();
    this.userCache.clear();
  }

  /**
   * Filter events by criteria
   */
  private filterEvents(
    userId?: string,
    dateFrom?: Date,
    dateTo?: Date
  ): SearchEvent[] {
    return this.events.filter(event => {
      if (userId && event.userId !== userId) {
        return false;
      }
      
      if (dateFrom && event.timestamp < dateFrom) {
        return false;
      }
      
      if (dateTo && event.timestamp > dateTo) {
        return false;
      }
      
      return true;
    });
  }

  /**
   * Generate query analytics from events
   */
  private generateQueryAnalytics(events: SearchEvent[]): SearchQueryAnalytics[] {
    return events.map(event => ({
      id: event.id,
      query: event.request.query,
      user_id: event.userId,
      results_count: event.response.results.length,
      processing_time_ms: event.response.performance.processing_time_ms,
      result_types: event.response.aggregations.by_type,
      created_at: event.timestamp.toISOString()
    }));
  }

  /**
   * Generate performance metrics
   */
  private generatePerformanceMetrics(events: SearchEvent[]): SearchPerformanceMetrics {
    if (events.length === 0) {
      return {
        avg_response_time_ms: 0,
        p95_response_time_ms: 0,
        total_queries: 0,
        popular_terms: [],
        success_rate: 0
      };
    }

    const responseTimes = events.map(e => e.response.performance.processing_time_ms);
    const avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
    
    // Calculate 95th percentile
    const sortedTimes = responseTimes.sort((a, b) => a - b);
    const p95Index = Math.floor(0.95 * sortedTimes.length);
    const p95ResponseTime = sortedTimes[p95Index] || 0;

    // Generate popular terms
    const popularTerms = this.generatePopularTerms(events);

    // Calculate success rate
    const successfulSearches = events.filter(e => e.response.results.length > 0).length;
    const successRate = successfulSearches / events.length;

    return {
      avg_response_time_ms: avgResponseTime,
      p95_response_time_ms: p95ResponseTime,
      total_queries: events.length,
      popular_terms: popularTerms,
      success_rate: successRate
    };
  }

  /**
   * Generate popular terms from events
   */
  private generatePopularTerms(events: SearchEvent[]): Array<{
    term: string;
    count: number;
    avg_results: number;
  }> {
    const termStats = new Map<string, {
      count: number;
      totalResults: number;
    }>();

    for (const event of events) {
      const terms = this.extractTerms(event.request.query);
      
      for (const term of terms) {
        const stats = termStats.get(term) || { count: 0, totalResults: 0 };
        stats.count++;
        stats.totalResults += event.response.results.length;
        termStats.set(term, stats);
      }
    }

    return Array.from(termStats.entries())
      .map(([term, stats]) => ({
        term,
        count: stats.count,
        avg_results: stats.totalResults / stats.count
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }

  /**
   * Generate trends over time
   */
  private generateTrends(events: SearchEvent[]): Array<{
    date: string;
    queryCount: number;
    avgResponseTime: number;
    successRate: number;
  }> {
    const dailyStats = new Map<string, {
      count: number;
      totalTime: number;
      successCount: number;
    }>();

    for (const event of events) {
      const date = event.timestamp.toISOString().split('T')[0];
      const stats = dailyStats.get(date) || { count: 0, totalTime: 0, successCount: 0 };
      
      stats.count++;
      stats.totalTime += event.response.performance.processing_time_ms;
      if (event.response.results.length > 0) {
        stats.successCount++;
      }
      
      dailyStats.set(date, stats);
    }

    return Array.from(dailyStats.entries())
      .map(([date, stats]) => ({
        date,
        queryCount: stats.count,
        avgResponseTime: stats.totalTime / stats.count,
        successRate: stats.successCount / stats.count
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * Generate user behavior patterns
   */
  private generateUserBehavior(events: SearchEvent[]): SearchAnalyticsData['userBehavior'] {
    const userStats = new Map<string, { searchCount: number; clickCount: number }>();
    const filterStats = new Map<string, number>();
    const typePreferences: Record<string, number> = {};

    for (const event of events) {
      // User stats
      if (event.userId) {
        const stats = userStats.get(event.userId) || { searchCount: 0, clickCount: 0 };
        stats.searchCount++;
        userStats.set(event.userId, stats);
      }

      // Filter usage
      if (event.request.filters) {
        for (const [key, value] of Object.entries(event.request.filters)) {
          if (value) {
            const filterName = `${key}:${typeof value === 'object' ? 'complex' : value}`;
            filterStats.set(filterName, (filterStats.get(filterName) || 0) + 1);
          }
        }
      }

      // Content type preferences
      for (const [type, count] of Object.entries(event.response.aggregations.by_type)) {
        typePreferences[type] = (typePreferences[type] || 0) + count;
      }
    }

    const topUsers = Array.from(userStats.entries())
      .map(([userId, stats]) => ({
        userId,
        searchCount: stats.searchCount,
        avgResultsClicked: stats.clickCount / stats.searchCount
      }))
      .sort((a, b) => b.searchCount - a.searchCount)
      .slice(0, 10);

    const commonFilters = Array.from(filterStats.entries())
      .map(([filter, count]) => ({ filter, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      topUsers,
      commonFilters,
      contentTypePreferences: typePreferences as Record<ContentType, number>
    };
  }

  /**
   * Extract search terms from query
   */
  private extractTerms(query: string): string[] {
    return query
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(term => term.length > 2)
      .slice(0, 10); // Limit to prevent memory issues
  }

  /**
   * Hash query for caching
   */
  private hashQuery(query: string): string {
    return crypto.createHash('sha256').update(query).digest('hex');
  }

  /**
   * Trim memory cache to stay within limits
   */
  private trimMemoryCache(): void {
    if (this.events.length > this.config.maxMemoryEntries) {
      // Remove oldest events
      const toRemove = this.events.length - this.config.maxMemoryEntries;
      this.events.splice(0, toRemove);
    }
  }

  /**
   * Persist event to storage (placeholder for production implementation)
   */
  private async persistEvent(event: SearchEvent): Promise<void> {
    // In a production system, this would write to a database
    // For now, we just keep in memory
    console.log('Analytics event recorded:', { 
      query: event.request.query,
      resultCount: event.response.results.length,
      processingTime: event.response.performance.processing_time_ms
    });
  }

  /**
   * Persist interaction to storage (placeholder for production implementation)
   */
  private async persistInteraction(interaction: any): Promise<void> {
    // In a production system, this would write to a database
    console.log('User interaction recorded:', interaction);
  }
}

/**
 * Create a default search analytics service
 */
export function createSearchAnalytics(overrides: Partial<SearchAnalyticsConfig> = {}): SearchAnalytics {
  const defaultConfig: SearchAnalyticsConfig = {
    enableQueryTracking: true,
    enablePerformanceTracking: true,
    enableUserTracking: true,
    maxMemoryEntries: 10000,
    retentionDays: 90
  };

  const config = { ...defaultConfig, ...overrides };
  return new SearchAnalytics(config);
}