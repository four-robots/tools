/**
 * Search Analytics Hook
 * 
 * Hook for managing search analytics data and metrics
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { 
  UseSearchAnalyticsReturn,
  SearchAnalyticsData,
  DateRange
} from '../types';
import { 
  getSearchAnalytics,
  getSearchPerformanceMetrics,
  getCacheStats 
} from '../utils/searchAPI';

interface UseSearchAnalyticsOptions {
  refreshInterval?: number; // in milliseconds
  autoRefresh?: boolean;
  userId?: string;
  initialDateRange?: DateRange;
}

/**
 * Hook for managing search analytics and performance metrics
 */
export function useSearchAnalytics(
  options: UseSearchAnalyticsOptions = {}
): UseSearchAnalyticsReturn {
  const {
    refreshInterval = 30000, // 30 seconds
    autoRefresh = false,
    userId,
    initialDateRange
  } = options;

  // ========================================================================
  // State Management
  // ========================================================================

  const [metrics, setMetrics] = useState<SearchAnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Date range state
  const [dateRange, setDateRange] = useState<DateRange>(
    initialDateRange || {
      from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
      to: new Date()
    }
  );

  // Additional metrics state
  const [performanceMetrics, setPerformanceMetrics] = useState(null);
  const [cacheStats, setCacheStats] = useState(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  // Refs for interval management
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // ========================================================================
  // Core Analytics Fetching
  // ========================================================================

  const fetchAnalyticsData = useCallback(async (): Promise<void> => {
    // Cancel any ongoing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();
    setIsLoading(true);
    setError(null);

    try {
      // Fetch main analytics data
      const analyticsData = await getSearchAnalytics(dateRange, userId);
      setMetrics(analyticsData);

      // Fetch performance metrics
      try {
        const perfMetrics = await getSearchPerformanceMetrics();
        setPerformanceMetrics(perfMetrics);
      } catch (perfError) {
        console.warn('Failed to fetch performance metrics:', perfError);
      }

      // Fetch cache statistics
      try {
        const cache = await getCacheStats();
        setCacheStats(cache);
      } catch (cacheError) {
        console.warn('Failed to fetch cache stats:', cacheError);
      }

      setLastRefresh(new Date());
      setError(null);

    } catch (err) {
      // Handle cancellation gracefully
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }

      console.error('Error fetching search analytics:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch analytics');
    } finally {
      setIsLoading(false);
    }
  }, [dateRange, userId]);

  // ========================================================================
  // Date Range Management
  // ========================================================================

  const updateDateRange = useCallback((newDateRange: DateRange) => {
    setDateRange(newDateRange);
  }, []);

  // Common date range presets
  const setDateRangePreset = useCallback((preset: string) => {
    const now = new Date();
    let from: Date;

    switch (preset) {
      case 'today':
        from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'yesterday':
        from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
        const to = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59);
        setDateRange({ from, to });
        return;
      case 'week':
        from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case 'quarter':
        from = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case 'year':
        from = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      default:
        from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }

    setDateRange({ from, to: now });
  }, []);

  // ========================================================================
  // Auto-refresh Management
  // ========================================================================

  const startAutoRefresh = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    intervalRef.current = setInterval(() => {
      fetchAnalyticsData();
    }, refreshInterval);
  }, [fetchAnalyticsData, refreshInterval]);

  const stopAutoRefresh = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // ========================================================================
  // Analytics Data Processing
  // ========================================================================

  const getAnalyticsInsights = useCallback(() => {
    if (!metrics) return null;

    const insights = [];

    // Search volume trend
    const recentSearches = metrics.dailyStats.slice(-7);
    if (recentSearches.length === 0) return insights;
    const avgRecentSearches = recentSearches.reduce((sum, stat) => sum + stat.searches, 0) / recentSearches.length;
    const previousSlice = metrics.dailyStats.slice(-14, -7);
    const previousAvg = previousSlice.length > 0 ? previousSlice.reduce((sum, stat) => sum + stat.searches, 0) / previousSlice.length : 0;

    if (previousAvg > 0 && avgRecentSearches > previousAvg * 1.1) {
      insights.push({
        type: 'positive',
        message: `Search volume increased by ${Math.round(((avgRecentSearches - previousAvg) / previousAvg) * 100)}% this week`
      });
    } else if (previousAvg > 0 && avgRecentSearches < previousAvg * 0.9) {
      insights.push({
        type: 'negative',
        message: `Search volume decreased by ${Math.round(((previousAvg - avgRecentSearches) / previousAvg) * 100)}% this week`
      });
    }

    // Response time trend
    const avgRecentResponseTime = recentSearches.reduce((sum, stat) => sum + stat.avgResponseTime, 0) / recentSearches.length;
    if (avgRecentResponseTime > metrics.averageResponseTime * 1.5) {
      insights.push({
        type: 'warning',
        message: 'Search response times have increased significantly'
      });
    }

    // Success rate
    if (metrics.successRate < 0.8) {
      insights.push({
        type: 'warning',
        message: `Search success rate is low (${Math.round(metrics.successRate * 100)}%)`
      });
    }

    // Popular query patterns
    const topQuery = metrics.popularQueries[0];
    if (topQuery && topQuery.count > metrics.totalSearches * 0.1) {
      insights.push({
        type: 'info',
        message: `"${topQuery.query}" accounts for ${Math.round((topQuery.count / metrics.totalSearches) * 100)}% of all searches`
      });
    }

    return insights;
  }, [metrics]);

  // ========================================================================
  // Export Functions
  // ========================================================================

  const exportAnalyticsData = useCallback((format: 'csv' | 'json' = 'csv') => {
    if (!metrics) return;

    const data = {
      dateRange,
      totalSearches: metrics.totalSearches,
      averageResponseTime: metrics.averageResponseTime,
      successRate: metrics.successRate,
      popularQueries: metrics.popularQueries,
      typeDistribution: metrics.typeDistribution,
      topTags: metrics.topTags,
      dailyStats: metrics.dailyStats,
      exportedAt: new Date().toISOString()
    };

    if (format === 'json') {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `search-analytics-${dateRange.from.toISOString().split('T')[0]}-to-${dateRange.to.toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      // CSV export
      const csvData = [
        ['Date', 'Searches', 'Avg Response Time (ms)'],
        ...metrics.dailyStats.map(stat => [stat.date, stat.searches.toString(), stat.avgResponseTime.toString()])
      ];

      const csvContent = csvData.map(row => row.join(',')).join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `search-analytics-${dateRange.from.toISOString().split('T')[0]}-to-${dateRange.to.toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }
  }, [metrics, dateRange]);

  // ========================================================================
  // Effects
  // ========================================================================

  // Initial data fetch
  useEffect(() => {
    fetchAnalyticsData();
  }, [dateRange]); // Re-fetch when date range changes

  // Auto-refresh management
  useEffect(() => {
    if (autoRefresh) {
      startAutoRefresh();
    } else {
      stopAutoRefresh();
    }

    return stopAutoRefresh;
  }, [autoRefresh, startAutoRefresh, stopAutoRefresh]);

  // Cleanup
  useEffect(() => {
    return () => {
      stopAutoRefresh();
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [stopAutoRefresh]);

  // ========================================================================
  // Return API
  // ========================================================================

  return {
    metrics,
    isLoading,
    error,
    refreshMetrics: fetchAnalyticsData,
    dateRange,
    setDateRange: updateDateRange,
    
    // Additional functionality
    setDateRangePreset,
    performanceMetrics,
    cacheStats,
    lastRefresh,
    getAnalyticsInsights,
    exportAnalyticsData,
    startAutoRefresh,
    stopAutoRefresh
  };
}