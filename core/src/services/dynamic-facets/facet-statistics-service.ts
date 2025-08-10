/**
 * Facet Statistics Service
 * 
 * Handles real-time facet statistics, value counts, frequency calculations,
 * and usage analytics for dynamic facet system.
 */

import {
  type FacetStatistics,
  type FacetUsageAnalytics,
  type FacetValue,
  type SearchResult,
  DynamicFacetSchemas
} from '@shared/types';

export interface StatisticsServiceOptions {
  /** Database connection */
  database?: any;
  /** Enable real-time statistics updates */
  realTimeUpdates?: boolean;
  /** Statistics aggregation interval in milliseconds */
  aggregationInterval?: number;
  /** Maximum statistics history to keep */
  maxHistoryDays?: number;
  /** Test mode - disables background timers */
  testMode?: boolean;
}

export interface FacetValueStatistics {
  facetId: string;
  valueKey: string;
  count: number;
  frequency: number;
  trend: 'increasing' | 'decreasing' | 'stable';
  lastUpdated: string;
}

export interface GlobalFacetStatistics {
  totalFacets: number;
  activeFacets: number;
  totalValues: number;
  avgValuesPerFacet: number;
  mostUsedFacets: Array<{ facetId: string; usageCount: number }>;
  topPerformingFacets: Array<{ facetId: string; avgResponseTime: number }>;
}

export class FacetStatisticsService {
  private readonly options: Required<StatisticsServiceOptions>;
  private statisticsCache = new Map<string, FacetStatistics>();
  private usageTracker = new Map<string, number>();
  private aggregationInterval?: NodeJS.Timeout;
  
  constructor(database?: any, options: StatisticsServiceOptions = {}) {
    this.options = {
      database,
      realTimeUpdates: true,
      aggregationInterval: 300000, // 5 minutes
      maxHistoryDays: 30,
      testMode: process.env.NODE_ENV === 'test',
      ...options
    };

    // Only start periodic statistics aggregation in non-test environments
    if (this.options.realTimeUpdates && !this.options.testMode) {
      this.startPeriodicAggregation();
    }
  }

  /**
   * Refresh statistics for a specific facet
   */
  async refreshStatistics(facetId: string): Promise<FacetStatistics> {
    const startTime = Date.now();

    try {
      // In a full implementation, this would query the database
      const statistics = await this.calculateFacetStatistics(facetId);
      
      // Update cache
      this.statisticsCache.set(facetId, statistics);
      
      // Save to database if available
      if (this.options.database) {
        await this.saveFacetStatistics(statistics);
      }

      return statistics;
    } catch (error) {
      console.error(`Error refreshing statistics for facet ${facetId}:`, error);
      throw error;
    }
  }

  /**
   * Get current statistics for a facet
   */
  async getFacetStatistics(facetId: string): Promise<FacetStatistics | null> {
    // Check cache first
    if (this.statisticsCache.has(facetId)) {
      const cached = this.statisticsCache.get(facetId)!;
      
      // Return cached if recent (within 5 minutes)
      const age = Date.now() - new Date(cached.createdAt).getTime();
      if (age < 300000) {
        return cached;
      }
    }

    // Refresh if not cached or stale
    return this.refreshStatistics(facetId);
  }

  /**
   * Record facet usage analytics
   */
  async recordUsage(usage: Omit<FacetUsageAnalytics, 'id' | 'createdAt'>): Promise<void> {
    const usageRecord: FacetUsageAnalytics = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      ...usage
    };

    // Update usage counter
    const currentCount = this.usageTracker.get(usage.facetId) || 0;
    this.usageTracker.set(usage.facetId, currentCount + 1);

    // Save to database if available
    if (this.options.database) {
      await this.saveUsageAnalytics(usageRecord);
    }

    // Update real-time statistics if enabled
    if (this.options.realTimeUpdates) {
      await this.updateRealTimeStatistics(usage.facetId);
    }
  }

  /**
   * Calculate value statistics for a facet
   */
  async calculateValueStatistics(
    facetId: string,
    results: SearchResult[],
    sourceField: string
  ): Promise<FacetValueStatistics[]> {
    const valueMap = new Map<string, { count: number; firstSeen: number }>();
    const totalResults = results.length;

    // Count values
    for (const result of results) {
      const fieldValue = this.extractFieldValue(result, sourceField);
      if (fieldValue != null) {
        const valueKey = this.normalizeValue(fieldValue);
        const existing = valueMap.get(valueKey);
        
        if (existing) {
          existing.count++;
        } else {
          valueMap.set(valueKey, { count: 1, firstSeen: Date.now() });
        }
      }
    }

    // Convert to statistics
    const statistics: FacetValueStatistics[] = [];
    
    for (const [valueKey, data] of valueMap.entries()) {
      const frequency = totalResults > 0 ? data.count / totalResults : 0;
      
      statistics.push({
        facetId,
        valueKey,
        count: data.count,
        frequency,
        trend: await this.calculateValueTrend(facetId, valueKey),
        lastUpdated: new Date().toISOString()
      });
    }

    // Sort by count descending
    return statistics.sort((a, b) => b.count - a.count);
  }

  /**
   * Get global statistics across all facets
   */
  async getGlobalStatistics(): Promise<GlobalFacetStatistics> {
    if (this.options.database) {
      return this.calculateGlobalStatisticsFromDB();
    }

    // Fallback to cache-based statistics
    const activeFacets = this.statisticsCache.size;
    const totalValues = Array.from(this.statisticsCache.values())
      .reduce((sum, stats) => sum + stats.uniqueValues, 0);

    const mostUsed = Array.from(this.usageTracker.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([facetId, usageCount]) => ({ facetId, usageCount }));

    return {
      totalFacets: activeFacets,
      activeFacets,
      totalValues,
      avgValuesPerFacet: activeFacets > 0 ? totalValues / activeFacets : 0,
      mostUsedFacets: mostUsed,
      topPerformingFacets: [] // Would require performance data
    };
  }

  /**
   * Get facet performance metrics
   */
  async getFacetPerformanceMetrics(facetId: string): Promise<{
    avgResponseTime: number;
    p95ResponseTime: number;
    errorRate: number;
    usageCount: number;
  }> {
    // In a full implementation, this would query performance data
    return {
      avgResponseTime: 0,
      p95ResponseTime: 0,
      errorRate: 0,
      usageCount: this.usageTracker.get(facetId) || 0
    };
  }

  /**
   * Generate hourly statistics for a date range
   */
  async getHourlyStatistics(
    facetId: string,
    dateFrom: string,
    dateTo: string
  ): Promise<Record<string, number>> {
    if (!this.options.database) {
      return {};
    }

    // In a full implementation, this would query hourly aggregated data
    const hourlyStats: Record<string, number> = {};
    
    const start = new Date(dateFrom);
    const end = new Date(dateTo);
    
    for (let date = new Date(start); date <= end; date.setHours(date.getHours() + 1)) {
      const hourKey = date.toISOString().slice(0, 13) + ':00:00.000Z';
      hourlyStats[hourKey] = Math.floor(Math.random() * 100); // Mock data
    }

    return hourlyStats;
  }

  /**
   * Clean up old statistics data
   */
  async cleanupOldStatistics(): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.options.maxHistoryDays);

    if (this.options.database) {
      // In a full implementation, this would delete old records
      console.log(`Cleaning up statistics older than ${cutoffDate.toISOString()}`);
    }

    // Clean up cache
    const cutoffTime = cutoffDate.getTime();
    for (const [facetId, stats] of this.statisticsCache.entries()) {
      const statsTime = new Date(stats.createdAt).getTime();
      if (statsTime < cutoffTime) {
        this.statisticsCache.delete(facetId);
      }
    }
  }

  // Private methods

  private async calculateFacetStatistics(facetId: string): Promise<FacetStatistics> {
    // In a full implementation, this would query the database
    const mockStats: FacetStatistics = {
      id: crypto.randomUUID(),
      facetId,
      totalResults: Math.floor(Math.random() * 10000),
      uniqueValues: Math.floor(Math.random() * 500),
      nullCount: Math.floor(Math.random() * 100),
      statisticsDate: new Date().toISOString(),
      hourlyStats: await this.getHourlyStatistics(
        facetId, 
        new Date(Date.now() - 86400000).toISOString(), // 24 hours ago
        new Date().toISOString()
      ),
      createdAt: new Date().toISOString()
    };

    return mockStats;
  }

  private async calculateValueTrend(
    facetId: string, 
    valueKey: string
  ): Promise<'increasing' | 'decreasing' | 'stable'> {
    // In a full implementation, this would compare recent counts
    // with historical data to determine trend
    const trends: Array<'increasing' | 'decreasing' | 'stable'> = 
      ['increasing', 'decreasing', 'stable'];
    return trends[Math.floor(Math.random() * trends.length)];
  }

  private async saveFacetStatistics(statistics: FacetStatistics): Promise<void> {
    // In a full implementation, this would save to the facet_statistics table
    console.log(`Saving statistics for facet ${statistics.facetId}`);
  }

  private async saveUsageAnalytics(usage: FacetUsageAnalytics): Promise<void> {
    // In a full implementation, this would save to the facet_usage_analytics table
    console.log(`Saving usage analytics for facet ${usage.facetId}`);
  }

  private async updateRealTimeStatistics(facetId: string): Promise<void> {
    // Update cached statistics with latest usage
    const cached = this.statisticsCache.get(facetId);
    if (cached) {
      // Increment total results or other relevant metrics
      cached.totalResults++;
    }
  }

  private async calculateGlobalStatisticsFromDB(): Promise<GlobalFacetStatistics> {
    // In a full implementation, this would run aggregation queries
    return {
      totalFacets: 0,
      activeFacets: 0,
      totalValues: 0,
      avgValuesPerFacet: 0,
      mostUsedFacets: [],
      topPerformingFacets: []
    };
  }

  private startPeriodicAggregation(): void {
    if (this.aggregationInterval) {
      clearInterval(this.aggregationInterval);
    }
    
    this.aggregationInterval = setInterval(async () => {
      try {
        await this.performPeriodicAggregation();
      } catch (error) {
        console.error('Error in periodic aggregation:', error);
      }
    }, this.options.aggregationInterval);
  }

  /**
   * Cleanup method to properly destroy the statistics service
   */
  destroy(): void {
    if (this.aggregationInterval) {
      clearInterval(this.aggregationInterval);
      this.aggregationInterval = undefined;
    }
    this.statisticsCache.clear();
    this.usageTracker.clear();
  }

  private async performPeriodicAggregation(): Promise<void> {
    // Refresh statistics for all active facets
    const facetIds = Array.from(this.statisticsCache.keys());
    
    for (const facetId of facetIds) {
      try {
        await this.refreshStatistics(facetId);
      } catch (error) {
        console.error(`Error refreshing statistics for facet ${facetId}:`, error);
      }
    }

    // Clean up old data
    await this.cleanupOldStatistics();
  }

  private extractFieldValue(result: SearchResult, sourceField: string): any {
    const parts = sourceField.split('.');
    let value: any = result;
    
    for (const part of parts) {
      if (value && typeof value === 'object' && part in value) {
        value = value[part];
      } else {
        return null;
      }
    }
    
    return value;
  }

  private normalizeValue(value: any): string {
    if (value == null) return '';
    if (typeof value === 'string') return value.trim();
    if (Array.isArray(value)) return value.join(', ');
    return String(value);
  }
}