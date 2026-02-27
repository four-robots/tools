import {
  TimeSeriesData,
  AggregationResult,
  TimeRange,
  FilterCondition,
  RealtimeMetricValue,
  UserJourney,
  CollaborationPattern,
  Anomaly,
  AnalyticsQueryEngine as AnalyticsQuery,
  ANALYTICS_CONSTANTS
} from '@shared/types';
import { logger } from '@/utils/logger';
import { DatabaseConnection } from '@/utils/database';
import { performance } from 'perf_hooks';

interface QueryOptimization {
  useIndex: string;
  estimatedRows: number;
  executionPlan: string;
  cacheKey?: string;
  cacheTTL?: number;
}

interface OptimizedQuery extends AnalyticsQuery {
  optimization: QueryOptimization;
  sqlQuery: string;
  parameters: any[];
}

export class AnalyticsQueryEngine {
  private queryCache = new Map<string, { data: any; timestamp: Date; ttl: number }>();
  private queryStats = new Map<string, { count: number; avgDuration: number; lastExecuted: Date }>();

  constructor(
    private readonly db: DatabaseConnection,
    private readonly tenantId?: string
  ) {
    this.startCacheCleanup();
  }

  // Time-series queries
  async queryTimeSeries(
    metricName: string,
    timeRange: TimeRange,
    granularity: '1m' | '5m' | '1h' | '1d' = '1h',
    filters?: FilterCondition[]
  ): Promise<TimeSeriesData> {
    const startTime = performance.now();
    const cacheKey = this.generateCacheKey('timeseries', metricName, timeRange, granularity, filters);

    try {
      // Check cache first
      const cached = this.getCachedResult(cacheKey);
      if (cached) {
        logger.debug('Query cache hit', { cacheKey, metric: metricName });
        return cached;
      }

      // Build and optimize query
      const query = this.buildTimeSeriesQuery(metricName, timeRange, granularity, filters);
      const optimizedQuery = await this.optimizeQuery(query);

      // Execute query
      const results = await this.executeQuery(optimizedQuery);

      // Process results into TimeSeriesData format
      const timeSeriesData = this.processTimeSeriesResults(results, metricName, granularity);

      // Cache successful results
      this.setCacheResult(cacheKey, timeSeriesData, ANALYTICS_CONSTANTS.CACHE_TTL);

      const queryDuration = performance.now() - startTime;
      this.updateQueryStats(metricName, queryDuration);

      logger.debug('Time series query completed', {
        metric: metricName,
        granularity,
        duration: queryDuration,
        dataPoints: timeSeriesData.data.length
      });

      return timeSeriesData;

    } catch (error) {
      logger.error('Time series query failed', { error, metricName, timeRange, granularity });
      throw error;
    }
  }

  // Aggregation queries
  async queryAggregation(
    metricName: string,
    aggregationType: 'sum' | 'avg' | 'count' | 'min' | 'max' | 'p50' | 'p95' | 'p99',
    groupBy?: string[],
    filters?: FilterCondition[]
  ): Promise<AggregationResult> {
    const startTime = performance.now();
    const cacheKey = this.generateCacheKey('aggregation', metricName, undefined, aggregationType, filters);

    try {
      const cached = this.getCachedResult(cacheKey);
      if (cached) {
        return cached;
      }

      // Use materialized views for better performance when available
      const query = this.buildAggregationQuery(metricName, aggregationType, groupBy, filters);
      const optimizedQuery = await this.optimizeQuery(query);

      const results = await this.executeQuery(optimizedQuery);

      let aggregatedValue: number;
      let dimensions: Record<string, any> = {};

      if (results.length === 0) {
        aggregatedValue = 0;
      } else if (groupBy && groupBy.length > 0) {
        // Handle grouped aggregations
        aggregatedValue = this.calculateGroupedAggregation(results, aggregationType);
        dimensions = this.extractGroupDimensions(results, groupBy);
      } else {
        // Single aggregation
        aggregatedValue = this.calculateSingleAggregation(results, aggregationType);
      }

      const result: AggregationResult = {
        metric: metricName,
        aggregationType,
        value: aggregatedValue,
        timestamp: new Date(),
        dimensions: groupBy && groupBy.length > 0 ? dimensions : undefined,
      };

      this.setCacheResult(cacheKey, result, ANALYTICS_CONSTANTS.CACHE_TTL);

      const queryDuration = performance.now() - startTime;
      this.updateQueryStats(metricName, queryDuration);

      logger.debug('Aggregation query completed', {
        metric: metricName,
        aggregationType,
        duration: queryDuration,
        value: aggregatedValue
      });

      return result;

    } catch (error) {
      logger.error('Aggregation query failed', { error, metricName, aggregationType });
      throw error;
    }
  }

  // Real-time queries
  async queryRealtimeMetrics(metricNames: string[]): Promise<RealtimeMetricValue[]> {
    const startTime = performance.now();

    try {
      // Query the most recent values for each metric
      const query = `
        SELECT DISTINCT ON (metric_name)
          metric_name,
          metric_value,
          timestamp,
          dimensions
        FROM analytics_metrics
        WHERE metric_name = ANY($1)
        ${this.tenantId ? 'AND tenant_id = $2' : ''}
        ORDER BY metric_name, timestamp DESC
        LIMIT ${metricNames.length}
      `;

      const params = this.tenantId ? [metricNames, this.tenantId] : [metricNames];
      const results = await this.db.query(query, params);

      // Calculate trends by comparing with previous values
      const metricsWithTrends = await Promise.all(
        results.map(async (row: any) => {
          const previousValue = await this.getPreviousMetricValue(row.metric_name, row.timestamp);
          const change = previousValue ? ((row.metric_value - previousValue) / previousValue) * 100 : 0;

          let trend: 'up' | 'down' | 'stable' = 'stable';
          if (Math.abs(change) > 1) { // 1% threshold
            trend = change > 0 ? 'up' : 'down';
          }

          return {
            name: row.metric_name,
            value: parseFloat(row.metric_value),
            timestamp: new Date(row.timestamp),
            change: Math.round(change * 100) / 100, // Round to 2 decimal places
            trend,
            unit: row.dimensions?.unit || undefined,
          };
        })
      );

      const queryDuration = performance.now() - startTime;
      logger.debug('Real-time metrics query completed', {
        metrics: metricNames.length,
        duration: queryDuration
      });

      return metricsWithTrends;

    } catch (error) {
      logger.error('Real-time metrics query failed', { error, metricNames });
      throw error;
    }
  }

  // Complex analytics queries
  async queryUserJourneyAnalytics(userId: string, timeRange: TimeRange): Promise<UserJourney> {
    try {
      const query = `
        SELECT 
          session_id,
          timestamp,
          activity_type,
          feature,
          duration,
          metadata
        FROM user_engagement_metrics 
        WHERE user_id = $1 
        AND hour_bucket BETWEEN $2 AND $3
        ORDER BY timestamp ASC
      `;

      const results = await this.db.query(query, [userId, timeRange.start, timeRange.end]);

      const steps = results.map((row: any) => ({
        timestamp: new Date(row.timestamp),
        action: row.activity_type,
        feature: row.feature || 'unknown',
        duration: row.duration || 0,
        metadata: row.metadata || {},
      }));

      const totalDuration = steps.reduce((sum, step) => sum + step.duration, 0);
      const sessionId = results[0]?.session_id || `journey_${userId}_${timeRange.start.getTime()}`;

      // Analyze journey for goals and drop-off points
      const completedGoals = this.analyzeCompletedGoals(steps);
      const dropOffPoint = this.analyzeDropOffPoint(steps);

      return {
        userId,
        sessionId,
        steps,
        totalDuration,
        completedGoals,
        dropOffPoint,
      };

    } catch (error) {
      logger.error('User journey analytics query failed', { error, userId, timeRange });
      throw error;
    }
  }

  async queryCollaborationPatterns(workspaceId: string, timeRange: TimeRange): Promise<CollaborationPattern[]> {
    try {
      const query = `
        SELECT 
          session_type as pattern,
          COUNT(*) as frequency,
          array_agg(DISTINCT participants::jsonb) as all_participants,
          AVG(EXTRACT(EPOCH FROM (ended_at - started_at))) as avg_duration,
          (COUNT(*) FILTER (WHERE ended_at IS NOT NULL)::float / COUNT(*)) * 100 as success_rate,
          array_agg(DISTINCT metadata->>'primaryAction') FILTER (WHERE metadata->>'primaryAction' IS NOT NULL) as common_actions
        FROM collaboration_session_metrics 
        WHERE workspace_id = $1 
        AND started_at BETWEEN $2 AND $3
        GROUP BY session_type
        HAVING COUNT(*) > 2  -- Only include patterns with multiple occurrences
        ORDER BY frequency DESC
        LIMIT 20
      `;

      const results = await this.db.query(query, [workspaceId, timeRange.start, timeRange.end]);

      return results.map((row: any) => ({
        pattern: row.pattern,
        frequency: parseInt(row.frequency),
        participants: this.extractUniqueParticipants(row.all_participants),
        avgDuration: parseFloat(row.avg_duration) || 0,
        successRate: parseFloat(row.success_rate) || 0,
        commonActions: row.common_actions || [],
      }));

    } catch (error) {
      logger.error('Collaboration patterns query failed', { error, workspaceId, timeRange });
      throw error;
    }
  }

  async querySystemAnomalies(timeRange: TimeRange): Promise<Anomaly[]> {
    try {
      // Use statistical analysis to detect anomalies
      const query = `
        WITH metric_statistics AS (
          SELECT 
            metric_name,
            AVG(metric_value) as mean_value,
            STDDEV(metric_value) as std_deviation,
            COUNT(*) as sample_count
          FROM analytics_metrics 
          WHERE timestamp BETWEEN $1 AND $2
          ${this.tenantId ? 'AND tenant_id = $3' : ''}
          GROUP BY metric_name
          HAVING COUNT(*) >= 30  -- Need sufficient data for statistical analysis
        ),
        anomalous_points AS (
          SELECT 
            m.id,
            m.metric_name,
            m.metric_value,
            m.timestamp,
            m.dimensions,
            s.mean_value,
            s.std_deviation,
            ABS(m.metric_value - s.mean_value) / NULLIF(s.std_deviation, 0) as z_score
          FROM analytics_metrics m
          JOIN metric_statistics s ON m.metric_name = s.metric_name
          WHERE m.timestamp BETWEEN $1 AND $2
          ${this.tenantId ? 'AND m.tenant_id = $3' : ''}
          AND ABS(m.metric_value - s.mean_value) / NULLIF(s.std_deviation, 0) > 2.5
        )
        SELECT 
          id,
          metric_name,
          metric_value,
          timestamp,
          dimensions,
          mean_value,
          z_score
        FROM anomalous_points
        ORDER BY z_score DESC
        LIMIT 100
      `;

      const params = this.tenantId ? [timeRange.start, timeRange.end, this.tenantId] : [timeRange.start, timeRange.end];
      const results = await this.db.query(query, params);

      return results.map((row: any) => ({
        id: row.id,
        metric: row.metric_name,
        detectedAt: new Date(row.timestamp),
        severity: this.calculateAnomalySeverity(row.z_score),
        description: `Anomalous value detected for ${row.metric_name}: ${row.metric_value} (expected ~${Math.round(row.mean_value)})`,
        expectedValue: parseFloat(row.mean_value),
        actualValue: parseFloat(row.metric_value),
        confidence: Math.min(Math.abs(row.z_score) / 3, 1), // Normalize to 0-1
        metadata: {
          zScore: row.z_score,
          dimensions: row.dimensions || {},
        },
      }));

    } catch (error) {
      logger.error('System anomalies query failed', { error, timeRange });
      throw error;
    }
  }

  // Query optimization
  private async optimizeQuery(query: AnalyticsQuery): Promise<OptimizedQuery> {
    // Analyze query to determine best execution strategy
    const optimization: QueryOptimization = {
      useIndex: this.selectBestIndex(query),
      estimatedRows: await this.estimateRowCount(query),
      executionPlan: 'sequential_scan', // Would be determined by query analyzer
    };

    // Use materialized views for time-bucketed queries when possible
    const sqlQuery = this.shouldUseMaterializedView(query) 
      ? this.buildMaterializedViewQuery(query)
      : this.buildStandardQuery(query);

    // Set caching strategy based on query characteristics
    if (this.shouldCacheQuery(query)) {
      optimization.cacheKey = this.generateCacheKey(
        'optimized',
        query.metric,
        query.timeRange,
        query.aggregation.toString(),
        query.filters
      );
      optimization.cacheTTL = this.calculateCacheTTL(query);
    }

    return {
      ...query,
      optimization,
      sqlQuery,
      parameters: this.buildQueryParameters(query),
    };
  }

  private selectBestIndex(query: AnalyticsQuery): string {
    // Simple index selection logic - in production would use query planner stats
    if (query.timeRange && (query.timeRange.end.getTime() - query.timeRange.start.getTime()) < 3600000) {
      // Less than 1 hour - use fine-grained time index
      return 'idx_analytics_metrics_metric_name_time';
    } else if (this.tenantId) {
      return 'idx_analytics_metrics_tenant_time';
    } else {
      return 'idx_analytics_metrics_metric_name_time';
    }
  }

  private async estimateRowCount(query: AnalyticsQuery): Promise<number> {
    // Simplified row count estimation
    const timespanHours = (query.timeRange.end.getTime() - query.timeRange.start.getTime()) / (1000 * 60 * 60);
    const estimatedRatePerHour = 1000; // Assume 1000 metrics per hour per metric name
    return Math.floor(timespanHours * estimatedRatePerHour);
  }

  private shouldUseMaterializedView(query: AnalyticsQuery): boolean {
    const timespanHours = (query.timeRange.end.getTime() - query.timeRange.start.getTime()) / (1000 * 60 * 60);
    
    // Use materialized views for queries spanning more than 4 hours
    return timespanHours > 4 && ['sum', 'avg', 'count', 'p95', 'p99'].includes(query.aggregation);
  }

  private buildMaterializedViewQuery(query: AnalyticsQuery): string {
    const granularity = query.granularity || '1h';
    const viewName = granularity === '1d' ? 'daily_analytics_aggregates' : 'hourly_analytics_aggregates';
    const timeColumn = granularity === '1d' ? 'day_bucket' : 'hour_bucket';

    let aggregationColumn: string;
    switch (query.aggregation) {
      case 'sum':
        aggregationColumn = 'sum_value';
        break;
      case 'avg':
        aggregationColumn = 'avg_value';
        break;
      case 'count':
        aggregationColumn = 'metric_count';
        break;
      case 'p95':
        aggregationColumn = 'p95_value';
        break;
      case 'p99':
        aggregationColumn = 'p99_value';
        break;
      default:
        aggregationColumn = 'avg_value';
    }

    return `
      SELECT 
        ${timeColumn} as timestamp,
        ${aggregationColumn} as value
      FROM ${viewName}
      WHERE metric_name = $1
      AND ${timeColumn} BETWEEN $2 AND $3
      ${this.tenantId ? 'AND tenant_id = $4' : ''}
      ORDER BY ${timeColumn}
    `;
  }

  private buildStandardQuery(query: AnalyticsQuery): string {
    const { granularity = '1h', aggregation } = query;
    
    let timeFunction: string;
    switch (granularity) {
      case '1m':
        timeFunction = "date_trunc('minute', timestamp)";
        break;
      case '5m':
        timeFunction = "date_trunc('minute', timestamp - interval '1 minute' * (EXTRACT(minute FROM timestamp)::int % 5))";
        break;
      case '1h':
        timeFunction = "date_trunc('hour', timestamp)";
        break;
      case '1d':
        timeFunction = "date_trunc('day', timestamp)";
        break;
      default:
        timeFunction = "date_trunc('hour', timestamp)";
    }

    let aggregationFunction: string;
    switch (aggregation) {
      case 'sum':
        aggregationFunction = 'SUM(metric_value)';
        break;
      case 'avg':
        aggregationFunction = 'AVG(metric_value)';
        break;
      case 'count':
        aggregationFunction = 'COUNT(*)';
        break;
      case 'min':
        aggregationFunction = 'MIN(metric_value)';
        break;
      case 'max':
        aggregationFunction = 'MAX(metric_value)';
        break;
      case 'p50':
        aggregationFunction = 'PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY metric_value)';
        break;
      case 'p95':
        aggregationFunction = 'PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY metric_value)';
        break;
      case 'p99':
        aggregationFunction = 'PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY metric_value)';
        break;
      default:
        aggregationFunction = 'AVG(metric_value)';
    }

    return `
      SELECT 
        ${timeFunction} as timestamp,
        ${aggregationFunction} as value
      FROM analytics_metrics
      WHERE metric_name = $1
      AND timestamp BETWEEN $2 AND $3
      ${this.tenantId ? 'AND tenant_id = $4' : ''}
      ${this.buildFilterClause(query.filters)}
      GROUP BY ${timeFunction}
      ORDER BY timestamp
    `;
  }

  private buildTimeSeriesQuery(
    metricName: string,
    timeRange: TimeRange,
    granularity: '1m' | '5m' | '1h' | '1d',
    filters?: FilterCondition[]
  ): AnalyticsQuery {
    return {
      metric: metricName,
      aggregation: 'avg', // Default aggregation for time series
      timeRange,
      granularity,
      filters,
    };
  }

  private buildAggregationQuery(
    metricName: string,
    aggregationType: string,
    groupBy?: string[],
    filters?: FilterCondition[]
  ): AnalyticsQuery {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 3600000);

    return {
      metric: metricName,
      aggregation: aggregationType as any,
      timeRange: { start: oneHourAgo, end: now },
      filters,
      groupBy,
    };
  }

  private buildFilterClause(filters?: FilterCondition[]): string {
    if (!filters || filters.length === 0) return '';

    const conditions = filters.map((filter, index) => {
      const paramIndex = this.tenantId ? index + 5 : index + 4; // Account for base parameters
      return this.buildSingleFilterCondition(filter, paramIndex);
    });

    return `AND ${conditions.join(' AND ')}`;
  }

  private buildSingleFilterCondition(filter: FilterCondition, paramIndex: number): string {
    const field = this.sanitizeFieldName(filter.field);
    
    switch (filter.operator) {
      case 'eq':
        return `${field} = $${paramIndex}`;
      case 'ne':
        return `${field} != $${paramIndex}`;
      case 'gt':
        return `${field} > $${paramIndex}`;
      case 'gte':
        return `${field} >= $${paramIndex}`;
      case 'lt':
        return `${field} < $${paramIndex}`;
      case 'lte':
        return `${field} <= $${paramIndex}`;
      case 'in':
        return `${field} = ANY($${paramIndex})`;
      case 'not_in':
        return `${field} != ALL($${paramIndex})`;
      case 'contains':
        return `${field} ILIKE $${paramIndex}`;
      default:
        return `${field} = $${paramIndex}`;
    }
  }

  private sanitizeFieldName(fieldName: string): string {
    // Allow only specific known fields and sanitize input
    const allowedFields = [
      'metric_value', 'tenant_id', 'workspace_id', 'dimensions',
      'timestamp', 'metric_type'
    ];
    
    if (fieldName.startsWith('dimensions->')) {
      // Validate JSON field access pattern: dimensions->'key' or dimensions->>'key'
      if (!/^dimensions->>?'[a-zA-Z0-9_-]+'$/.test(fieldName)) {
        throw new Error(`Invalid dimensions field access: ${fieldName}`);
      }
      return fieldName;
    }
    
    if (allowedFields.includes(fieldName)) {
      return fieldName;
    }
    
    throw new Error(`Invalid field name: ${fieldName}`);
  }

  private buildQueryParameters(query: AnalyticsQuery): any[] {
    const params = [query.metric, query.timeRange.start, query.timeRange.end];
    
    if (this.tenantId) {
      params.push(this.tenantId);
    }
    
    if (query.filters) {
      query.filters.forEach(filter => {
        params.push(filter.value);
      });
    }
    
    return params;
  }

  private shouldCacheQuery(query: AnalyticsQuery): boolean {
    const timespanMinutes = (query.timeRange.end.getTime() - query.timeRange.start.getTime()) / (1000 * 60);
    
    // Cache queries that span more than 15 minutes
    return timespanMinutes > 15;
  }

  private calculateCacheTTL(query: AnalyticsQuery): number {
    const timespanHours = (query.timeRange.end.getTime() - query.timeRange.start.getTime()) / (1000 * 60 * 60);
    
    if (timespanHours > 24) {
      return 600; // 10 minutes for long-range queries
    } else if (timespanHours > 4) {
      return 300; // 5 minutes for medium-range queries
    } else {
      return 60; // 1 minute for short-range queries
    }
  }

  private async executeQuery(query: OptimizedQuery): Promise<any[]> {
    try {
      return await this.db.query(query.sqlQuery, query.parameters);
    } catch (error) {
      logger.error('Query execution failed', { 
        error, 
        query: query.sqlQuery,
        parameters: query.parameters 
      });
      throw error;
    }
  }

  private processTimeSeriesResults(results: any[], metricName: string, granularity: string): TimeSeriesData {
    const data = results.map(row => ({
      timestamp: new Date(row.timestamp),
      value: parseFloat(row.value) || 0,
      metadata: row.dimensions || {},
    }));

    return {
      name: metricName,
      data,
      unit: this.extractUnit(results),
      color: this.generateSeriesColor(metricName),
    };
  }

  private calculateGroupedAggregation(results: any[], aggregationType: string): number {
    // For grouped results, return the sum or average of all groups
    const values = results.map(r => parseFloat(r.value) || 0);
    
    switch (aggregationType) {
      case 'sum':
        return values.reduce((a, b) => a + b, 0);
      case 'avg':
        return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
      case 'count':
        return values.reduce((a, b) => a + b, 0);
      default:
        return values.reduce((a, b) => a + b, 0);
    }
  }

  private calculateSingleAggregation(results: any[], aggregationType: string): number {
    if (results.length === 0) return 0;
    return parseFloat(results[0].value) || 0;
  }

  private extractGroupDimensions(results: any[], groupBy: string[]): Record<string, any> {
    if (results.length === 0) return {};
    
    const dimensions: Record<string, any> = {};
    groupBy.forEach(field => {
      if (results[0][field] !== undefined) {
        dimensions[field] = results[0][field];
      }
    });
    
    return dimensions;
  }

  private extractUnit(results: any[]): string | undefined {
    if (results.length > 0 && results[0].dimensions?.unit) {
      return results[0].dimensions.unit;
    }
    return undefined;
  }

  private generateSeriesColor(metricName: string): string {
    // Simple hash-based color generation
    let hash = 0;
    for (let i = 0; i < metricName.length; i++) {
      hash = metricName.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 70%, 50%)`;
  }

  private async getPreviousMetricValue(metricName: string, currentTimestamp: Date): Promise<number | null> {
    try {
      const query = `
        SELECT metric_value 
        FROM analytics_metrics 
        WHERE metric_name = $1 
        AND timestamp < $2 
        ${this.tenantId ? 'AND tenant_id = $3' : ''}
        ORDER BY timestamp DESC 
        LIMIT 1
      `;

      const params = this.tenantId ? [metricName, currentTimestamp, this.tenantId] : [metricName, currentTimestamp];
      const results = await this.db.query(query, params);

      return results.length > 0 ? parseFloat(results[0].metric_value) : null;
    } catch (error) {
      logger.warn('Failed to get previous metric value', { error, metricName });
      return null;
    }
  }

  private analyzeCompletedGoals(steps: any[]): string[] {
    const goals: string[] = [];
    
    // Goal detection based on feature usage patterns
    const featureUsage = steps.reduce((acc, step) => {
      acc[step.feature] = (acc[step.feature] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    if (featureUsage.kanban >= 3) goals.push('task_management');
    if (featureUsage.wiki >= 2) goals.push('documentation');
    if (featureUsage.search >= 5) goals.push('information_discovery');
    if (featureUsage.collaboration >= 1) goals.push('team_collaboration');
    
    return goals;
  }

  private analyzeDropOffPoint(steps: any[]): string | undefined {
    if (steps.length === 0) return undefined;
    
    const lastStep = steps[steps.length - 1];
    
    // Consider it a drop-off if the last interaction was very brief
    if (lastStep.duration < 2000) { // Less than 2 seconds
      return lastStep.feature;
    }
    
    return undefined;
  }

  private extractUniqueParticipants(participantArrays: any[]): string[] {
    const uniqueParticipants = new Set<string>();
    
    participantArrays.forEach(array => {
      if (Array.isArray(array)) {
        array.forEach(participant => {
          if (typeof participant === 'string') {
            uniqueParticipants.add(participant);
          }
        });
      }
    });
    
    return Array.from(uniqueParticipants);
  }

  private calculateAnomalySeverity(zScore: number): 'low' | 'medium' | 'high' {
    const absZScore = Math.abs(zScore);
    
    if (absZScore > 3.5) return 'high';
    if (absZScore > 2.8) return 'medium';
    return 'low';
  }

  // Cache management
  private generateCacheKey(...parts: any[]): string {
    return parts
      .filter(p => p !== undefined)
      .map(p => typeof p === 'object' ? JSON.stringify(p) : String(p))
      .join('_');
  }

  private getCachedResult<T>(key: string): T | null {
    const cached = this.queryCache.get(key);
    if (!cached) return null;

    if (Date.now() > cached.timestamp.getTime() + cached.ttl * 1000) {
      this.queryCache.delete(key);
      return null;
    }

    return cached.data as T;
  }

  private setCacheResult<T>(key: string, data: T, ttl: number): void {
    this.queryCache.set(key, {
      data,
      timestamp: new Date(),
      ttl,
    });
  }

  private updateQueryStats(metricName: string, duration: number): void {
    const stats = this.queryStats.get(metricName) || { count: 0, avgDuration: 0, lastExecuted: new Date() };
    
    stats.count++;
    stats.avgDuration = ((stats.avgDuration * (stats.count - 1)) + duration) / stats.count;
    stats.lastExecuted = new Date();
    
    this.queryStats.set(metricName, stats);
  }

  private startCacheCleanup(): void {
    setInterval(() => {
      const now = Date.now();
      
      for (const [key, cached] of this.queryCache.entries()) {
        if (now > cached.timestamp.getTime() + cached.ttl * 1000) {
          this.queryCache.delete(key);
        }
      }
    }, 60000); // Clean up every minute
  }

  // Performance monitoring
  getQueryStats(): Record<string, any> {
    const stats = Object.fromEntries(this.queryStats.entries());
    return {
      queries: stats,
      cacheSize: this.queryCache.size,
      cacheHitRate: this.calculateCacheHitRate(),
    };
  }

  private calculateCacheHitRate(): number {
    // Simple cache hit rate calculation (would be more sophisticated in production)
    return 0.85; // Placeholder
  }

  async destroy(): void {
    this.queryCache.clear();
    this.queryStats.clear();
  }
}