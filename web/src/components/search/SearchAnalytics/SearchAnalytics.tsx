/**
 * SearchAnalytics Component
 * 
 * Admin dashboard component for displaying search performance metrics,
 * usage statistics, and analytics data
 */

import React, { useMemo, useCallback, useState } from 'react';
import { 
  Search,
  Clock,
  TrendingUp,
  BarChart3,
  Download,
  RefreshCw,
  Calendar,
  Users,
  Target,
  Activity
} from 'lucide-react';
import { SearchAnalyticsProps, DateRange } from '../types';
import { useSearchAnalytics } from '../hooks/useSearchAnalytics';
import { formatDuration, formatNumber, formatPercentage } from '../utils/searchHelpers';
import styles from './SearchAnalytics.module.css';

/**
 * Metric card component for displaying key statistics
 */
interface MetricCardProps {
  title: string;
  value: string | number;
  change?: number;
  icon: React.ReactNode;
  format?: 'number' | 'duration' | 'percentage';
  className?: string;
}

function MetricCard({ 
  title, 
  value, 
  change, 
  icon, 
  format = 'number',
  className = '' 
}: MetricCardProps) {
  const formattedValue = useMemo(() => {
    if (typeof value === 'string') return value;
    
    switch (format) {
      case 'duration':
        return formatDuration(value);
      case 'percentage':
        return formatPercentage(value);
      case 'number':
      default:
        return formatNumber(value);
    }
  }, [value, format]);

  const changeColor = useMemo(() => {
    if (!change) return '';
    return change > 0 ? 'text-green-600' : 'text-red-600';
  }, [change]);

  return (
    <div className={`${styles.metricCard} ${className}`}>
      <div className={styles.metricHeader}>
        <div className={styles.metricIcon}>
          {icon}
        </div>
        <div className={styles.metricTitle}>
          {title}
        </div>
      </div>
      <div className={styles.metricValue}>
        {formattedValue}
      </div>
      {change !== undefined && (
        <div className={`${styles.metricChange} ${changeColor}`}>
          {change > 0 ? '+' : ''}{formatPercentage(change)}
        </div>
      )}
    </div>
  );
}

/**
 * SearchAnalytics component for displaying search analytics and metrics
 */
export function SearchAnalytics({
  className = '',
  dateRange: propDateRange,
  onDateRangeChange,
  refreshInterval,
  showExportOptions = true
}: SearchAnalyticsProps) {

  // ========================================================================
  // State
  // ========================================================================

  const [localDateRange, setLocalDateRange] = useState<DateRange>(() => {
    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(now.getDate() - 30);
    
    return propDateRange || {
      from: thirtyDaysAgo,
      to: now
    };
  });

  const dateRange = propDateRange || localDateRange;

  // ========================================================================
  // Hooks
  // ========================================================================

  const {
    metrics,
    isLoading,
    error,
    refreshMetrics
  } = useSearchAnalytics({
    dateRange,
    refreshInterval
  });

  // ========================================================================
  // Event Handlers
  // ========================================================================

  const handleDateRangeChange = useCallback((range: DateRange) => {
    if (onDateRangeChange) {
      onDateRangeChange(range);
    } else {
      setLocalDateRange(range);
    }
  }, [onDateRangeChange]);

  const handleRefresh = useCallback(() => {
    refreshMetrics();
  }, [refreshMetrics]);

  const handleExport = useCallback(async (format: 'csv' | 'json') => {
    if (!metrics) return;

    try {
      const data = {
        dateRange,
        exportTime: new Date().toISOString(),
        metrics: {
          overview: {
            totalSearches: metrics.totalSearches,
            averageResponseTime: metrics.averageResponseTime,
            successRate: metrics.successRate
          },
          popularQueries: metrics.popularQueries,
          typeDistribution: metrics.typeDistribution,
          topTags: metrics.topTags,
          dailyStats: metrics.dailyStats
        }
      };

      let content: string;
      let mimeType: string;
      let filename: string;

      if (format === 'csv') {
        // Convert to CSV format
        const headers = ['Date', 'Searches', 'Avg Response Time'];
        const rows = metrics.dailyStats.map(stat => [
          stat.date,
          stat.searches.toString(),
          stat.avgResponseTime.toString()
        ]);
        
        content = [headers, ...rows]
          .map(row => row.join(','))
          .join('\n');
        mimeType = 'text/csv';
        filename = `search-analytics-${dateRange.from.toISOString().split('T')[0]}-to-${dateRange.to.toISOString().split('T')[0]}.csv`;
      } else {
        content = JSON.stringify(data, null, 2);
        mimeType = 'application/json';
        filename = `search-analytics-${dateRange.from.toISOString().split('T')[0]}-to-${dateRange.to.toISOString().split('T')[0]}.json`;
      }

      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting analytics:', error);
    }
  }, [metrics, dateRange]);

  // ========================================================================
  // Render Helpers
  // ========================================================================

  const renderMetricCards = useCallback(() => {
    if (!metrics) return null;

    return (
      <div className={styles.metricsGrid}>
        <MetricCard
          title="Total Searches"
          value={metrics.totalSearches}
          icon={<Search size={20} />}
          format="number"
        />
        
        <MetricCard
          title="Avg Response Time"
          value={metrics.averageResponseTime}
          icon={<Clock size={20} />}
          format="duration"
        />
        
        <MetricCard
          title="Success Rate"
          value={metrics.successRate}
          icon={<Target size={20} />}
          format="percentage"
        />
        
        <MetricCard
          title="Daily Average"
          value={metrics.totalSearches / Math.max(1, metrics.dailyStats.length)}
          icon={<Activity size={20} />}
          format="number"
        />
      </div>
    );
  }, [metrics]);

  const renderPopularQueries = useCallback(() => {
    if (!metrics?.popularQueries || metrics.popularQueries.length === 0) {
      return null;
    }

    return (
      <div className={styles.analyticsSection}>
        <h3 className={styles.sectionTitle}>Popular Search Queries</h3>
        <div className={styles.queriesList}>
          {metrics.popularQueries.slice(0, 10).map((query, index) => (
            <div key={query.query} className={styles.queryItem}>
              <div className={styles.queryRank}>
                {index + 1}
              </div>
              <div className={styles.queryText}>
                {query.query}
              </div>
              <div className={styles.queryStats}>
                <span className={styles.queryCount}>
                  {formatNumber(query.count)} searches
                </span>
                <span className={styles.queryResults}>
                  {formatNumber(query.avgResults)} avg results
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }, [metrics?.popularQueries]);

  const renderTypeDistribution = useCallback(() => {
    if (!metrics?.typeDistribution) return null;

    const entries = Object.entries(metrics.typeDistribution)
      .sort(([, a], [, b]) => b - a);

    if (entries.length === 0) return null;

    const total = entries.reduce((sum, [, count]) => sum + count, 0);

    return (
      <div className={styles.analyticsSection}>
        <h3 className={styles.sectionTitle}>Content Type Distribution</h3>
        <div className={styles.typesList}>
          {entries.map(([type, count]) => (
            <div key={type} className={styles.typeItem}>
              <div className={styles.typeName}>
                {type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
              </div>
              <div className={styles.typeBar}>
                <div 
                  className={styles.typeBarFill}
                  style={{ width: `${(count / (total || 1)) * 100}%` }}
                />
              </div>
              <div className={styles.typeStats}>
                <span>{formatNumber(count)}</span>
                <span>({formatPercentage(count / (total || 1))})</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }, [metrics?.typeDistribution]);

  const renderTopTags = useCallback(() => {
    if (!metrics?.topTags || metrics.topTags.length === 0) {
      return null;
    }

    return (
      <div className={styles.analyticsSection}>
        <h3 className={styles.sectionTitle}>Top Tags</h3>
        <div className={styles.tagsList}>
          {metrics.topTags.slice(0, 15).map(tag => (
            <div key={tag.tag} className={styles.tagItem}>
              <span className={styles.tagName}>{tag.tag}</span>
              <span className={styles.tagCount}>{formatNumber(tag.count)}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }, [metrics?.topTags]);

  const renderDateRangePicker = useCallback(() => {
    const formatDateForInput = (date: Date) => {
      return date.toISOString().split('T')[0];
    };

    const handleFromChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      const newDate = new Date(event.target.value);
      handleDateRangeChange({
        from: newDate,
        to: dateRange.to
      });
    };

    const handleToChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      const newDate = new Date(event.target.value);
      handleDateRangeChange({
        from: dateRange.from,
        to: newDate
      });
    };

    return (
      <div className={styles.dateRangePicker}>
        <div className={styles.dateInputGroup}>
          <label htmlFor="from-date" className={styles.dateLabel}>
            From:
          </label>
          <input
            id="from-date"
            type="date"
            value={formatDateForInput(dateRange.from)}
            onChange={handleFromChange}
            className={styles.dateInput}
            max={formatDateForInput(dateRange.to)}
          />
        </div>
        
        <div className={styles.dateInputGroup}>
          <label htmlFor="to-date" className={styles.dateLabel}>
            To:
          </label>
          <input
            id="to-date"
            type="date"
            value={formatDateForInput(dateRange.to)}
            onChange={handleToChange}
            className={styles.dateInput}
            min={formatDateForInput(dateRange.from)}
            max={formatDateForInput(new Date())}
          />
        </div>
      </div>
    );
  }, [dateRange, handleDateRangeChange]);

  // ========================================================================
  // Loading and Error States
  // ========================================================================

  if (isLoading) {
    return (
      <div className={`${styles.searchAnalytics} ${className}`}>
        <div className={styles.loadingState}>
          <RefreshCw className="animate-spin" size={24} />
          <span>Loading analytics...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`${styles.searchAnalytics} ${className}`}>
        <div className={styles.errorState}>
          <p className={styles.errorMessage}>
            Failed to load analytics: {error}
          </p>
          <button onClick={handleRefresh} className={styles.retryButton}>
            <RefreshCw size={16} />
            Retry
          </button>
        </div>
      </div>
    );
  }

  // ========================================================================
  // Main Render
  // ========================================================================

  return (
    <div className={`${styles.searchAnalytics} ${className}`}>
      {/* Header */}
      <div className={styles.analyticsHeader}>
        <div className={styles.headerTitle}>
          <BarChart3 size={24} />
          <h2>Search Analytics</h2>
        </div>
        
        <div className={styles.headerActions}>
          {renderDateRangePicker()}
          
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className={styles.refreshButton}
            title="Refresh data"
          >
            <RefreshCw size={16} />
          </button>
          
          {showExportOptions && metrics && (
            <div className={styles.exportButtons}>
              <button
                onClick={() => handleExport('csv')}
                className={styles.exportButton}
                title="Export as CSV"
              >
                <Download size={16} />
                CSV
              </button>
              <button
                onClick={() => handleExport('json')}
                className={styles.exportButton}
                title="Export as JSON"
              >
                <Download size={16} />
                JSON
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className={styles.analyticsContent}>
        {renderMetricCards()}
        
        <div className={styles.analyticsGrid}>
          {renderPopularQueries()}
          {renderTypeDistribution()}
          {renderTopTags()}
        </div>
      </div>
    </div>
  );
}

/**
 * Default export
 */
export default SearchAnalytics;