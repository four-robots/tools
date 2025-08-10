import { z } from 'zod';
import type { Kysely } from 'kysely';
import {
  type SearchAnalytics,
  type UserSearchStats,
  type DateRange,
  type SearchAction,
  type SearchAnalyticsEvent,
  DateRangeSchema,
} from '../../shared/types/saved-search.js';

/**
 * Search Analytics Service
 * 
 * Provides comprehensive analytics and insights for saved searches including:
 * - Usage tracking and pattern analysis
 * - Performance metrics and optimization insights
 * - User behavior analytics
 * - Popular content and trend identification
 * - Export and reporting capabilities
 */
export class SearchAnalyticsService {
  constructor(private db: Kysely<any>) {}

  /**
   * Track a search usage event
   */
  async trackSearchUsage(
    searchId: string,
    userId: string | undefined,
    action: SearchAction,
    metadata: {
      resultCount?: number;
      clickPosition?: number;
      dwellTime?: number;
      queryModifications?: Record<string, any>;
      executionTime?: number;
    } = {}
  ): Promise<void> {
    await this.db
      .insertInto('search_analytics')
      .values({
        search_id: searchId,
        user_id: userId,
        action_type: action,
        result_count: metadata.resultCount,
        click_position: metadata.clickPosition,
        dwell_time_seconds: metadata.dwellTime,
        query_modifications: metadata.queryModifications ? 
          JSON.stringify(metadata.queryModifications) : null,
      })
      .execute();
  }

  /**
   * Get comprehensive analytics for a specific search
   */
  async getSearchAnalytics(
    searchId: string,
    timeRange?: DateRange
  ): Promise<SearchAnalytics> {
    let query = this.db
      .selectFrom('search_analytics')
      .where('search_id', '=', searchId);

    if (timeRange) {
      const validatedRange = DateRangeSchema.parse(timeRange);
      query = query
        .where('created_at', '>=', validatedRange.from)
        .where('created_at', '<=', validatedRange.to);
    }

    const events = await query.selectAll().execute();

    // Calculate analytics metrics
    const executions = events.filter(e => e.action_type === 'execute');
    const views = events.filter(e => e.action_type === 'view');
    const edits = events.filter(e => e.action_type === 'edit');
    
    const totalExecutions = executions.length;
    const uniqueUsers = new Set(events.map(e => e.user_id).filter(Boolean)).size;
    
    const averageResultCount = executions.length > 0 
      ? executions.reduce((sum, e) => sum + (e.result_count || 0), 0) / executions.length 
      : 0;

    // Calculate click-through rates by position
    const clicksByPosition = events
      .filter(e => e.click_position !== null)
      .reduce((acc, e) => {
        const pos = e.click_position!;
        acc[pos] = (acc[pos] || 0) + 1;
        return acc;
      }, {} as Record<number, number>);

    const mostClickedPositions = Object.entries(clicksByPosition)
      .map(([position, clicks]) => ({ position: parseInt(position), clicks }))
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, 10);

    // Calculate usage by day
    const usageByDay = events.reduce((acc, e) => {
      const day = e.created_at.toISOString().split('T')[0];
      acc[day] = (acc[day] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Popular time ranges analysis
    const popularTimeRanges = this.analyzeTimeRangePatterns(events);

    // Query modification analysis
    const topModifications = this.analyzeQueryModifications(events);

    // Calculate click-through rates
    const clickThroughRates = this.calculateClickThroughRates(events);

    // Calculate error rate from execution data
    const errorRate = await this.calculateErrorRate(searchId, timeRange);

    return {
      totalExecutions,
      uniqueUsers,
      averageResultCount,
      averageExecutionTime: await this.calculateAverageExecutionTime(searchId, timeRange),
      popularTimeRanges,
      topModifications,
      clickThroughRates,
      usageByDay,
      errorRate,
      mostClickedPositions,
    };
  }

  /**
   * Get user-specific search statistics
   */
  async getUserSearchStats(userId: string, timeRange?: DateRange): Promise<UserSearchStats> {
    let baseQuery = this.db.selectFrom('saved_searches');
    
    if (timeRange) {
      const validatedRange = DateRangeSchema.parse(timeRange);
      baseQuery = baseQuery
        .where('created_at', '>=', validatedRange.from)
        .where('created_at', '<=', validatedRange.to);
    }

    const [
      searchStats,
      collectionStats,
      shareStats,
      scheduleStats,
      analyticsData
    ] = await Promise.all([
      // Basic search statistics
      baseQuery
        .select([
          this.db.fn.count('id').as('totalSearches'),
          this.db.fn.sum('execution_count').as('totalExecutions'),
          this.db.fn.count('id').filterWhere('is_favorite', '=', true).as('favoriteSearches'),
        ])
        .where('owner_id', '=', userId)
        .executeTakeFirst(),

      // Collection statistics
      this.db
        .selectFrom('search_collections')
        .select([
          this.db.fn.count('id').as('totalCollections'),
          this.db.fn.avg(
            this.db.selectFrom('search_collection_items')
              .select(this.db.fn.count('id').as('count'))
              .whereRef('collection_id', '=', 'search_collections.id')
          ).as('averageSearchesPerCollection')
        ])
        .where('owner_id', '=', userId)
        .executeTakeFirst(),

      // Sharing statistics
      this.db
        .selectFrom('search_shares')
        .innerJoin('saved_searches', 'search_shares.search_id', 'saved_searches.id')
        .select(this.db.fn.count('search_shares.id').as('sharedSearches'))
        .where('saved_searches.owner_id', '=', userId)
        .executeTakeFirst(),

      // Scheduling statistics
      this.db
        .selectFrom('search_schedules')
        .innerJoin('saved_searches', 'search_schedules.search_id', 'saved_searches.id')
        .select(this.db.fn.count('search_schedules.id').as('scheduledSearches'))
        .where('saved_searches.owner_id', '=', userId)
        .where('search_schedules.is_active', '=', true)
        .executeTakeFirst(),

      // Tag usage analysis
      this.getUserTagAnalysis(userId, timeRange),
    ]);

    // Monthly creation and execution trends
    const [creationTrends, executionTrends] = await Promise.all([
      this.getMonthlyCreationTrends(userId, timeRange),
      this.getMonthlyExecutionTrends(userId, timeRange),
    ]);

    return {
      totalSavedSearches: Number(searchStats?.totalSearches || 0),
      totalExecutions: Number(searchStats?.totalExecutions || 0),
      favoriteSearches: Number(searchStats?.favoriteSearches || 0),
      sharedSearches: Number(shareStats?.sharedSearches || 0),
      scheduledSearches: Number(scheduleStats?.scheduledSearches || 0),
      totalCollections: Number(collectionStats?.totalCollections || 0),
      averageSearchesPerCollection: Number(collectionStats?.averageSearchesPerCollection || 0),
      mostUsedTags: analyticsData.mostUsedTags,
      searchesCreatedByMonth: creationTrends,
      executionsByMonth: executionTrends,
    };
  }

  /**
   * Get analytics for all searches with aggregated insights
   */
  async getGlobalAnalytics(timeRange?: DateRange): Promise<{
    totalSearches: number;
    totalExecutions: number;
    activeUsers: number;
    popularTags: Array<{ tag: string; count: number }>;
    executionTrends: Record<string, number>;
    errorRateBySearch: Array<{ searchId: string; errorRate: number }>;
    topPerformingSearches: Array<{ searchId: string; name: string; executionCount: number }>;
  }> {
    let timeFilter = '';
    let timeParams: Date[] = [];
    
    if (timeRange) {
      const validatedRange = DateRangeSchema.parse(timeRange);
      timeFilter = 'AND created_at >= $1 AND created_at <= $2';
      timeParams = [validatedRange.from, validatedRange.to];
    }

    const [
      overallStats,
      tagStats,
      executionTrends,
      topSearches
    ] = await Promise.all([
      // Overall statistics
      this.db
        .selectFrom('saved_searches')
        .select([
          this.db.fn.count('id').as('totalSearches'),
          this.db.fn.sum('execution_count').as('totalExecutions'),
          this.db.fn.countDistinct('owner_id').as('activeUsers'),
        ])
        .$if(!!timeRange, (qb) => qb
          .where('created_at', '>=', timeRange!.from)
          .where('created_at', '<=', timeRange!.to)
        )
        .executeTakeFirst(),

      // Popular tags analysis
      this.getPopularTags(timeRange),

      // Execution trends by day
      this.getGlobalExecutionTrends(timeRange),

      // Top performing searches
      this.getTopPerformingSearches(timeRange, 10),
    ]);

    const errorRateBySearch = await this.getErrorRatesBySearch(timeRange);

    return {
      totalSearches: Number(overallStats?.totalSearches || 0),
      totalExecutions: Number(overallStats?.totalExecutions || 0),
      activeUsers: Number(overallStats?.activeUsers || 0),
      popularTags: tagStats,
      executionTrends,
      errorRateBySearch,
      topPerformingSearches: topSearches,
    };
  }

  /**
   * Get search performance insights and recommendations
   */
  async getSearchInsights(searchId: string, timeRange?: DateRange): Promise<{
    performanceScore: number;
    insights: Array<{
      type: 'optimization' | 'usage' | 'engagement';
      title: string;
      description: string;
      impact: 'high' | 'medium' | 'low';
    }>;
    recommendations: Array<{
      action: string;
      reason: string;
      expectedImpact: string;
    }>;
  }> {
    const analytics = await this.getSearchAnalytics(searchId, timeRange);
    const executionData = await this.getExecutionInsights(searchId, timeRange);
    
    const insights = [];
    const recommendations = [];
    
    // Performance score calculation (0-100)
    let performanceScore = 50; // Base score
    
    // Execution frequency insights
    if (analytics.totalExecutions > 10) {
      performanceScore += 20;
      insights.push({
        type: 'usage',
        title: 'High Usage Search',
        description: `This search has been executed ${analytics.totalExecutions} times`,
        impact: 'high',
      });
    } else if (analytics.totalExecutions < 3) {
      performanceScore -= 10;
      insights.push({
        type: 'usage',
        title: 'Low Usage Search',
        description: 'This search is rarely used, consider reviewing its relevance',
        impact: 'medium',
      });
    }
    
    // Error rate insights
    if (analytics.errorRate > 0.1) {
      performanceScore -= 15;
      insights.push({
        type: 'optimization',
        title: 'High Error Rate',
        description: `${(analytics.errorRate * 100).toFixed(1)}% of executions fail`,
        impact: 'high',
      });
      
      recommendations.push({
        action: 'Review and update search query parameters',
        reason: 'High failure rate indicates potential issues with search configuration',
        expectedImpact: 'Reduce error rate by 50-80%',
      });
    }
    
    // Execution time insights
    if (analytics.averageExecutionTime > 5000) {
      performanceScore -= 10;
      insights.push({
        type: 'optimization',
        title: 'Slow Execution',
        description: `Average execution time is ${(analytics.averageExecutionTime / 1000).toFixed(2)} seconds`,
        impact: 'medium',
      });
      
      recommendations.push({
        action: 'Optimize search filters and parameters',
        reason: 'Long execution times may indicate overly complex queries',
        expectedImpact: 'Improve response time by 30-50%',
      });
    }
    
    // User engagement insights
    if (analytics.uniqueUsers > analytics.totalExecutions * 0.8) {
      performanceScore += 10;
      insights.push({
        type: 'engagement',
        title: 'High User Diversity',
        description: 'This search is used by many different users',
        impact: 'high',
      });
    }
    
    // Result relevance insights
    const avgResultCount = analytics.averageResultCount;
    if (avgResultCount < 5) {
      insights.push({
        type: 'optimization',
        title: 'Low Result Count',
        description: `Average of only ${avgResultCount.toFixed(1)} results per execution`,
        impact: 'medium',
      });
      
      recommendations.push({
        action: 'Broaden search criteria or update data sources',
        reason: 'Low result counts may indicate overly restrictive parameters',
        expectedImpact: 'Increase result relevance and user satisfaction',
      });
    } else if (avgResultCount > 100) {
      insights.push({
        type: 'optimization',
        title: 'High Result Count',
        description: `Average of ${avgResultCount.toFixed(0)} results per execution`,
        impact: 'low',
      });
      
      recommendations.push({
        action: 'Add more specific filters to narrow results',
        reason: 'Too many results can overwhelm users',
        expectedImpact: 'Improve result quality and user experience',
      });
    }
    
    return {
      performanceScore: Math.max(0, Math.min(100, performanceScore)),
      insights,
      recommendations,
    };
  }

  /**
   * Export analytics data in various formats
   */
  async exportAnalytics(
    searchId: string | 'all',
    timeRange?: DateRange,
    format: 'json' | 'csv' | 'xlsx' = 'json'
  ): Promise<{ data: any; filename: string; mimeType: string }> {
    let data: any;
    let filename: string;
    
    if (searchId === 'all') {
      data = await this.getGlobalAnalytics(timeRange);
      filename = `global-analytics-${this.formatDateForFilename(new Date())}`;
    } else {
      data = await this.getSearchAnalytics(searchId, timeRange);
      filename = `search-analytics-${searchId}-${this.formatDateForFilename(new Date())}`;
    }
    
    switch (format) {
      case 'json':
        return {
          data: JSON.stringify(data, null, 2),
          filename: `${filename}.json`,
          mimeType: 'application/json',
        };
        
      case 'csv':
        const csv = this.convertToCSV(data);
        return {
          data: csv,
          filename: `${filename}.csv`,
          mimeType: 'text/csv',
        };
        
      case 'xlsx':
        // In a real implementation, you would use a library like xlsx
        return {
          data: JSON.stringify(data, null, 2), // Fallback to JSON
          filename: `${filename}.xlsx`,
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        };
        
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  private analyzeTimeRangePatterns(events: any[]): Record<string, number> {
    const hourlyUsage = events.reduce((acc, event) => {
      const hour = event.created_at.getHours();
      const range = this.getTimeRange(hour);
      acc[range] = (acc[range] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return hourlyUsage;
  }

  private getTimeRange(hour: number): string {
    if (hour >= 0 && hour < 6) return 'night';
    if (hour >= 6 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 18) return 'afternoon';
    return 'evening';
  }

  private analyzeQueryModifications(events: any[]): Record<string, number> {
    const modifications = events
      .filter(e => e.query_modifications)
      .reduce((acc, e) => {
        const mods = JSON.parse(e.query_modifications);
        Object.keys(mods).forEach(key => {
          acc[key] = (acc[key] || 0) + 1;
        });
        return acc;
      }, {} as Record<string, number>);

    return Object.fromEntries(
      Object.entries(modifications)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10)
    );
  }

  private calculateClickThroughRates(events: any[]): Record<string, number> {
    const views = events.filter(e => e.action_type === 'view').length;
    const clicks = events.filter(e => e.click_position !== null).length;
    
    return {
      overall: views > 0 ? clicks / views : 0,
      topPositions: views > 0 ? events.filter(e => e.click_position <= 3).length / views : 0,
    };
  }

  private async calculateErrorRate(searchId: string, timeRange?: DateRange): Promise<number> {
    let query = this.db
      .selectFrom('search_executions')
      .where('search_id', '=', searchId);

    if (timeRange) {
      query = query
        .where('executed_at', '>=', timeRange.from)
        .where('executed_at', '<=', timeRange.to);
    }

    const result = await query
      .select([
        this.db.fn.count('id').as('totalExecutions'),
        this.db.fn.count('id').filterWhere('status', '=', 'error').as('errorExecutions'),
      ])
      .executeTakeFirst();

    const total = Number(result?.totalExecutions || 0);
    const errors = Number(result?.errorExecutions || 0);
    
    return total > 0 ? errors / total : 0;
  }

  private async calculateAverageExecutionTime(searchId: string, timeRange?: DateRange): Promise<number> {
    let query = this.db
      .selectFrom('search_executions')
      .where('search_id', '=', searchId)
      .where('execution_time_ms', 'is not', null);

    if (timeRange) {
      query = query
        .where('executed_at', '>=', timeRange.from)
        .where('executed_at', '<=', timeRange.to);
    }

    const result = await query
      .select(this.db.fn.avg('execution_time_ms').as('avgTime'))
      .executeTakeFirst();

    return Number(result?.avgTime || 0);
  }

  private async getUserTagAnalysis(userId: string, timeRange?: DateRange): Promise<Array<{ tag: string; count: number }>> {
    // This would be a more complex query analyzing tag usage patterns
    const result = await this.db
      .selectFrom('saved_searches')
      .select('tags')
      .where('owner_id', '=', userId)
      .$if(!!timeRange, (qb) => qb
        .where('created_at', '>=', timeRange!.from)
        .where('created_at', '<=', timeRange!.to)
      )
      .execute();

    const tagCounts = result
      .flatMap(row => row.tags || [])
      .reduce((acc, tag) => {
        acc[tag] = (acc[tag] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

    return Object.entries(tagCounts)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }

  private async getMonthlyCreationTrends(userId: string, timeRange?: DateRange): Promise<Record<string, number>> {
    let query = this.db
      .selectFrom('saved_searches')
      .select([
        this.db.fn('date_trunc', ['month', 'created_at']).as('month'),
        this.db.fn.count('id').as('count'),
      ])
      .where('owner_id', '=', userId)
      .groupBy('month')
      .orderBy('month');

    if (timeRange) {
      query = query
        .where('created_at', '>=', timeRange.from)
        .where('created_at', '<=', timeRange.to);
    }

    const result = await query.execute();
    
    return result.reduce((acc, row) => {
      const monthKey = new Date(row.month).toISOString().slice(0, 7); // YYYY-MM
      acc[monthKey] = Number(row.count);
      return acc;
    }, {} as Record<string, number>);
  }

  private async getMonthlyExecutionTrends(userId: string, timeRange?: DateRange): Promise<Record<string, number>> {
    let query = this.db
      .selectFrom('search_executions')
      .innerJoin('saved_searches', 'search_executions.search_id', 'saved_searches.id')
      .select([
        this.db.fn('date_trunc', ['month', 'search_executions.executed_at']).as('month'),
        this.db.fn.count('search_executions.id').as('count'),
      ])
      .where('saved_searches.owner_id', '=', userId)
      .groupBy('month')
      .orderBy('month');

    if (timeRange) {
      query = query
        .where('search_executions.executed_at', '>=', timeRange.from)
        .where('search_executions.executed_at', '<=', timeRange.to);
    }

    const result = await query.execute();
    
    return result.reduce((acc, row) => {
      const monthKey = new Date(row.month).toISOString().slice(0, 7); // YYYY-MM
      acc[monthKey] = Number(row.count);
      return acc;
    }, {} as Record<string, number>);
  }

  private async getPopularTags(timeRange?: DateRange): Promise<Array<{ tag: string; count: number }>> {
    // Implementation would analyze tag usage across all searches
    return []; // Placeholder
  }

  private async getGlobalExecutionTrends(timeRange?: DateRange): Promise<Record<string, number>> {
    // Implementation would analyze execution trends globally
    return {}; // Placeholder
  }

  private async getTopPerformingSearches(
    timeRange?: DateRange, 
    limit: number = 10
  ): Promise<Array<{ searchId: string; name: string; executionCount: number }>> {
    let query = this.db
      .selectFrom('saved_searches')
      .select(['id as searchId', 'name', 'execution_count as executionCount'])
      .orderBy('execution_count', 'desc')
      .limit(limit);

    if (timeRange) {
      query = query
        .where('created_at', '>=', timeRange.from)
        .where('created_at', '<=', timeRange.to);
    }

    const result = await query.execute();
    
    return result.map(row => ({
      searchId: row.searchId,
      name: row.name,
      executionCount: Number(row.executionCount),
    }));
  }

  private async getErrorRatesBySearch(timeRange?: DateRange): Promise<Array<{ searchId: string; errorRate: number }>> {
    // Implementation would calculate error rates for all searches
    return []; // Placeholder
  }

  private async getExecutionInsights(searchId: string, timeRange?: DateRange): Promise<any> {
    // Implementation would provide detailed execution analysis
    return {}; // Placeholder
  }

  private formatDateForFilename(date: Date): string {
    return date.toISOString().slice(0, 10).replace(/-/g, '');
  }

  private convertToCSV(data: any): string {
    // Simple CSV conversion - in production, use a proper CSV library
    if (Array.isArray(data)) {
      if (data.length === 0) return '';
      
      const headers = Object.keys(data[0]);
      const csvHeaders = headers.join(',');
      const csvRows = data.map(row => 
        headers.map(header => JSON.stringify(row[header] || '')).join(',')
      );
      
      return [csvHeaders, ...csvRows].join('\n');
    }
    
    // For object data, create key-value pairs
    const entries = Object.entries(data);
    const csvHeaders = 'Key,Value';
    const csvRows = entries.map(([key, value]) => 
      `${JSON.stringify(key)},${JSON.stringify(String(value))}`
    );
    
    return [csvHeaders, ...csvRows].join('\n');
  }
}