import {
  CollaborationMetrics,
  SystemHealthMetrics,
  UserEngagementMetrics,
  AlertMetrics,
  TimeRange,
  UserJourney,
  CollaborationPattern,
  Anomaly,
  CollaborationEvent,
  SystemMetric,
  UserActivity,
  StreamMetric,
  ANALYTICS_CONSTANTS
} from '@shared/types';
import { logger } from '@/utils/logger';
import { DatabaseConnection } from '@/utils/database';
import { StreamProcessor, createStreamProcessor } from './stream-processor-service';
import { performance } from 'perf_hooks';

interface MetricCache {
  value: any;
  timestamp: Date;
  ttl: number;
}

export class RealtimeAnalyticsService {
  private streamProcessor: StreamProcessor;
  private metricCache = new Map<string, MetricCache>();
  private readonly cacheGC: NodeJS.Timer;

  constructor(
    private readonly db: DatabaseConnection,
    private readonly tenantId?: string
  ) {
    this.streamProcessor = createStreamProcessor(db, tenantId);
    this.setupEventListeners();
    
    // Setup cache garbage collection
    this.cacheGC = setInterval(() => {
      this.cleanupExpiredCache();
    }, ANALYTICS_CONSTANTS.CACHE_TTL * 1000);
  }

  // Collaboration metrics tracking
  async trackSessionStart(sessionId: string, userId: string, metadata: any = {}): Promise<void> {
    const event: CollaborationEvent = {
      sessionId,
      eventType: 'session_start',
      userId,
      resourceType: metadata.resourceType || 'kanban',
      resourceId: metadata.resourceId || sessionId,
      metadata: {
        ...metadata,
        startTime: new Date().toISOString(),
      },
      timestamp: new Date(),
      tenantId: this.tenantId,
      workspaceId: metadata.workspaceId,
    };

    await this.streamProcessor.processCollaborationEvent(event);
    
    // Store in collaboration_session_metrics
    await this.storeCollaborationSessionStart(event);
    
    logger.info('Tracked session start', { sessionId, userId, resourceType: metadata.resourceType });
  }

  async trackUserJoin(sessionId: string, userId: string, role: string): Promise<void> {
    const event: CollaborationEvent = {
      sessionId,
      eventType: 'user_join',
      userId,
      resourceType: 'kanban', // Default, should be provided by context
      resourceId: sessionId,
      metadata: { role, joinTime: new Date().toISOString() },
      timestamp: new Date(),
      tenantId: this.tenantId,
    };

    await this.streamProcessor.processCollaborationEvent(event);
    
    // Update participant count in session
    await this.updateSessionParticipants(sessionId, userId, 'join');
    
    logger.info('Tracked user join', { sessionId, userId, role });
  }

  async trackContentModification(sessionId: string, userId: string, changeType: string, metadata: any = {}): Promise<void> {
    const event: CollaborationEvent = {
      sessionId,
      eventType: 'content_modification',
      userId,
      resourceType: metadata.resourceType || 'kanban',
      resourceId: metadata.resourceId || sessionId,
      metadata: {
        changeType,
        modificationTime: new Date().toISOString(),
        ...metadata,
      },
      timestamp: new Date(),
      tenantId: this.tenantId,
      workspaceId: metadata.workspaceId,
    };

    await this.streamProcessor.processCollaborationEvent(event);
    
    // Update modification count in session
    await this.updateSessionModifications(sessionId);
    
    logger.info('Tracked content modification', { sessionId, userId, changeType });
  }

  async trackConflictResolution(sessionId: string, conflictId: string, resolution: any): Promise<void> {
    const event: CollaborationEvent = {
      sessionId,
      eventType: 'conflict_resolved',
      userId: resolution.resolvedBy,
      resourceType: resolution.resourceType || 'kanban',
      resourceId: resolution.resourceId,
      metadata: {
        conflictId,
        resolutionStrategy: resolution.strategy,
        resolutionTime: new Date().toISOString(),
        duration: resolution.duration,
        ...resolution.metadata,
      },
      timestamp: new Date(),
      tenantId: this.tenantId,
    };

    await this.streamProcessor.processCollaborationEvent(event);
    
    // Update conflict resolution metrics
    await this.updateConflictResolutionMetrics(sessionId, resolution.duration);
    
    logger.info('Tracked conflict resolution', { sessionId, conflictId, duration: resolution.duration });
  }

  async trackSearchQuery(sessionId: string, userId: string, query: string, results: number): Promise<void> {
    const activity: UserActivity = {
      userId,
      sessionId,
      activityType: 'feature_use',
      feature: 'search',
      metadata: {
        query,
        resultCount: results,
        queryTime: new Date().toISOString(),
      },
      timestamp: new Date(),
      tenantId: this.tenantId,
    };

    await this.streamProcessor.processUserActivity(activity);
    
    logger.debug('Tracked search query', { userId, query, results });
  }

  // System performance metrics
  async recordResponseTime(endpoint: string, duration: number, statusCode: number): Promise<void> {
    const metric: SystemMetric = {
      serviceName: 'api_gateway',
      metricType: 'api_response',
      metricName: 'response_time',
      value: duration,
      unit: 'ms',
      metadata: {
        endpoint,
        statusCode: statusCode.toString(),
        success: statusCode < 400,
      },
      timestamp: new Date(),
    };

    await this.streamProcessor.processSystemMetric(metric);
    
    // Track error rates
    if (statusCode >= 400) {
      const errorMetric: SystemMetric = {
        ...metric,
        metricName: 'error_count',
        value: 1,
        unit: 'count',
      };
      await this.streamProcessor.processSystemMetric(errorMetric);
    }
  }

  async recordDatabaseQueryTime(operation: string, duration: number): Promise<void> {
    const metric: SystemMetric = {
      serviceName: 'database',
      metricType: 'database',
      metricName: 'query_time',
      value: duration,
      unit: 'ms',
      metadata: { operation },
      timestamp: new Date(),
    };

    await this.streamProcessor.processSystemMetric(metric);
  }

  async recordMemoryUsage(service: string, usage: number): Promise<void> {
    const metric: SystemMetric = {
      serviceName: service,
      metricType: 'memory',
      metricName: 'usage',
      value: usage,
      unit: 'bytes',
      timestamp: new Date(),
    };

    await this.streamProcessor.processSystemMetric(metric);
  }

  async recordCPUUtilization(service: string, utilization: number): Promise<void> {
    const metric: SystemMetric = {
      serviceName: service,
      metricType: 'cpu',
      metricName: 'utilization',
      value: utilization,
      unit: 'percent',
      timestamp: new Date(),
    };

    await this.streamProcessor.processSystemMetric(metric);
  }

  // User engagement analytics
  async trackFeatureUsage(userId: string, feature: string, context: any = {}): Promise<void> {
    const activity: UserActivity = {
      userId,
      sessionId: context.sessionId || `session_${userId}_${Date.now()}`,
      activityType: 'feature_use',
      feature,
      metadata: context,
      timestamp: new Date(),
      tenantId: this.tenantId,
    };

    await this.streamProcessor.processUserActivity(activity);
  }

  async trackUserSession(userId: string, sessionDuration: number, interactions: number): Promise<void> {
    const startTime = new Date();
    startTime.setMilliseconds(startTime.getMilliseconds() - sessionDuration);

    const activity: UserActivity = {
      userId,
      sessionId: `session_${userId}_${startTime.getTime()}`,
      activityType: 'page_view',
      duration: sessionDuration,
      metadata: {
        interactions,
        endTime: new Date().toISOString(),
      },
      timestamp: new Date(),
      tenantId: this.tenantId,
    };

    await this.streamProcessor.processUserActivity(activity);
    
    // Store in user_engagement_metrics table
    await this.storeUserEngagementMetrics(userId, sessionDuration, interactions);
  }

  async trackUserRetention(userId: string, firstSeen: Date, lastSeen: Date): Promise<void> {
    const retentionDays = Math.floor((lastSeen.getTime() - firstSeen.getTime()) / (1000 * 60 * 60 * 24));
    
    const metric: StreamMetric = {
      name: 'user.retention.days',
      type: 'gauge',
      value: retentionDays,
      dimensions: { userId },
      timestamp: new Date(),
      tenantId: this.tenantId,
    };

    await this.streamProcessor.processStreamMetric(metric);
  }

  // Real-time queries with caching
  async getLiveCollaborationMetrics(timeRange: TimeRange): Promise<CollaborationMetrics> {
    const cacheKey = `collaboration_metrics_${timeRange.start.getTime()}_${timeRange.end.getTime()}`;
    
    const cached = this.getCachedValue<CollaborationMetrics>(cacheKey);
    if (cached) return cached;

    const startTime = performance.now();
    
    try {
      const [
        sessionData,
        participantData,
        conflictData,
        featureData
      ] = await Promise.all([
        this.queryCollaborationSessions(timeRange),
        this.querySessionParticipants(timeRange),
        this.queryConflictMetrics(timeRange),
        this.queryCollaborativeFeatures(timeRange)
      ]);

      const metrics: CollaborationMetrics = {
        activeSessions: sessionData.activeSessions,
        totalParticipants: participantData.totalParticipants,
        avgSessionDuration: sessionData.avgDuration,
        conflictsDetected: conflictData.detected,
        conflictsResolved: conflictData.resolved,
        avgResolutionTime: conflictData.avgResolutionTime,
        topCollaborativeFeatures: featureData,
      };

      // Cache the result
      this.setCachedValue(cacheKey, metrics, ANALYTICS_CONSTANTS.CACHE_TTL);
      
      const queryTime = performance.now() - startTime;
      logger.debug('Retrieved collaboration metrics', { queryTime, cacheKey });
      
      return metrics;
      
    } catch (error) {
      logger.error('Failed to get live collaboration metrics', { error, timeRange });
      throw error;
    }
  }

  async getSystemHealthMetrics(): Promise<SystemHealthMetrics> {
    const cacheKey = 'system_health_metrics';
    
    const cached = this.getCachedValue<SystemHealthMetrics>(cacheKey);
    if (cached) return cached;

    try {
      const [
        uptime,
        responseTime,
        errorRate,
        connections,
        resourceUsage,
        serviceHealth
      ] = await Promise.all([
        this.querySystemUptime(),
        this.queryAverageResponseTime(),
        this.queryErrorRate(),
        this.queryActiveConnections(),
        this.queryResourceUsage(),
        this.queryServiceHealth()
      ]);

      const metrics: SystemHealthMetrics = {
        uptime,
        avgResponseTime: responseTime,
        errorRate,
        activeConnections: connections.websocket,
        databaseConnections: connections.database,
        memoryUsage: resourceUsage.memory,
        cpuUsage: resourceUsage.cpu,
        diskUsage: resourceUsage.disk,
        services: serviceHealth,
      };

      // Cache for shorter time due to rapid changes
      this.setCachedValue(cacheKey, metrics, 30); // 30 seconds
      
      return metrics;
      
    } catch (error) {
      logger.error('Failed to get system health metrics', { error });
      throw error;
    }
  }

  async getUserEngagementMetrics(timeRange: TimeRange): Promise<UserEngagementMetrics> {
    const cacheKey = `user_engagement_${timeRange.start.getTime()}_${timeRange.end.getTime()}`;
    
    const cached = this.getCachedValue<UserEngagementMetrics>(cacheKey);
    if (cached) return cached;

    try {
      const [
        userCounts,
        sessionData,
        featureUsage,
        retention
      ] = await Promise.all([
        this.queryUserCounts(timeRange),
        this.queryUserSessionData(timeRange),
        this.queryFeatureUsage(timeRange),
        this.queryUserRetention(timeRange)
      ]);

      const metrics: UserEngagementMetrics = {
        activeUsers: userCounts.active,
        newUsers: userCounts.new,
        returningUsers: userCounts.returning,
        avgSessionDuration: sessionData.avgDuration,
        avgInteractionsPerSession: sessionData.avgInteractions,
        topFeatures: featureUsage,
        retentionRate: retention,
      };

      this.setCachedValue(cacheKey, metrics, ANALYTICS_CONSTANTS.CACHE_TTL);
      
      return metrics;
      
    } catch (error) {
      logger.error('Failed to get user engagement metrics', { error, timeRange });
      throw error;
    }
  }

  async getAlertMetrics(): Promise<AlertMetrics> {
    const cacheKey = 'alert_metrics';
    
    const cached = this.getCachedValue<AlertMetrics>(cacheKey);
    if (cached) return cached;

    try {
      const [
        activeAlerts,
        alertsByLevel,
        resolutionTime,
        recentAlerts
      ] = await Promise.all([
        this.queryActiveAlerts(),
        this.queryAlertsByLevel(),
        this.queryAverageResolutionTime(),
        this.queryRecentAlerts()
      ]);

      const metrics: AlertMetrics = {
        activeAlerts: activeAlerts.total,
        alertsByLevel,
        avgResolutionTime: resolutionTime,
        escalatedAlerts: activeAlerts.escalated,
        recentAlerts,
      };

      this.setCachedValue(cacheKey, metrics, 60); // 1 minute cache
      
      return metrics;
      
    } catch (error) {
      logger.error('Failed to get alert metrics', { error });
      throw error;
    }
  }

  // Complex analytics queries
  async queryUserJourneyAnalytics(userId: string, timeRange: TimeRange): Promise<UserJourney> {
    try {
      const activities = await this.db.query(`
        SELECT 
          timestamp,
          activity_type as action,
          feature,
          duration,
          metadata
        FROM user_engagement_metrics 
        WHERE user_id = $1 
        AND hour_bucket BETWEEN $2 AND $3
        ORDER BY timestamp ASC
      `, [userId, timeRange.start, timeRange.end]);

      const steps = activities.map((activity: any) => ({
        timestamp: activity.timestamp,
        action: activity.action,
        feature: activity.feature || 'unknown',
        duration: activity.duration || 0,
        metadata: activity.metadata || {},
      }));

      const totalDuration = steps.reduce((sum, step) => sum + step.duration, 0);
      
      // Simple goal detection based on feature usage patterns
      const completedGoals = this.detectCompletedGoals(steps);
      const dropOffPoint = this.detectDropOffPoint(steps);

      return {
        userId,
        sessionId: `journey_${userId}_${timeRange.start.getTime()}`,
        steps,
        totalDuration,
        completedGoals,
        dropOffPoint,
      };
      
    } catch (error) {
      logger.error('Failed to query user journey analytics', { error, userId, timeRange });
      throw error;
    }
  }

  async queryCollaborationPatterns(workspaceId: string, timeRange: TimeRange): Promise<CollaborationPattern[]> {
    try {
      const patterns = await this.db.query(`
        SELECT 
          session_type as pattern,
          COUNT(*) as frequency,
          array_agg(DISTINCT participants::jsonb) as participants,
          AVG(duration_seconds) as avg_duration,
          (COUNT(*) FILTER (WHERE ended_at IS NOT NULL)::float / COUNT(*)) * 100 as success_rate,
          array_agg(DISTINCT metadata->>'action') as common_actions
        FROM collaboration_session_metrics 
        WHERE workspace_id = $1 
        AND started_at BETWEEN $2 AND $3
        GROUP BY session_type
        ORDER BY frequency DESC
      `, [workspaceId, timeRange.start, timeRange.end]);

      return patterns.map((pattern: any) => ({
        pattern: pattern.pattern,
        frequency: parseInt(pattern.frequency),
        participants: pattern.participants.flat(),
        avgDuration: parseFloat(pattern.avg_duration) || 0,
        successRate: parseFloat(pattern.success_rate) || 0,
        commonActions: pattern.common_actions.filter((action: string) => action !== null),
      }));
      
    } catch (error) {
      logger.error('Failed to query collaboration patterns', { error, workspaceId, timeRange });
      throw error;
    }
  }

  async querySystemAnomalies(timeRange: TimeRange): Promise<Anomaly[]> {
    try {
      // Query for statistical anomalies in metrics
      const anomalies = await this.db.query(`
        WITH metric_stats AS (
          SELECT 
            metric_name,
            AVG(metric_value) as mean_value,
            STDDEV(metric_value) as std_dev,
            COUNT(*) as data_points
          FROM analytics_metrics 
          WHERE timestamp BETWEEN $1 AND $2
          GROUP BY metric_name
          HAVING COUNT(*) > 10
        ),
        anomalous_metrics AS (
          SELECT 
            m.id,
            m.metric_name,
            m.metric_value,
            m.timestamp,
            s.mean_value,
            s.std_dev,
            ABS(m.metric_value - s.mean_value) / NULLIF(s.std_dev, 0) as z_score
          FROM analytics_metrics m
          JOIN metric_stats s ON m.metric_name = s.metric_name
          WHERE m.timestamp BETWEEN $1 AND $2
          AND ABS(m.metric_value - s.mean_value) / NULLIF(s.std_dev, 0) > 2.5
        )
        SELECT 
          id,
          metric_name,
          metric_value as actual_value,
          timestamp as detected_at,
          mean_value as expected_value,
          CASE 
            WHEN z_score > 3 THEN 'high'
            WHEN z_score > 2.5 THEN 'medium'
            ELSE 'low'
          END as severity,
          z_score
        FROM anomalous_metrics
        ORDER BY z_score DESC
        LIMIT 100
      `, [timeRange.start, timeRange.end]);

      return anomalies.map((anomaly: any) => ({
        id: anomaly.id,
        metric: anomaly.metric_name,
        detectedAt: new Date(anomaly.detected_at),
        severity: anomaly.severity as 'low' | 'medium' | 'high',
        description: `Anomalous value detected for ${anomaly.metric_name}`,
        expectedValue: parseFloat(anomaly.expected_value),
        actualValue: parseFloat(anomaly.actual_value),
        confidence: Math.min(Math.abs(anomaly.z_score) / 3, 1), // Normalize z-score to confidence
        metadata: {
          zScore: anomaly.z_score,
        },
      }));
      
    } catch (error) {
      logger.error('Failed to query system anomalies', { error, timeRange });
      throw error;
    }
  }

  // Cache management
  private getCachedValue<T>(key: string): T | null {
    const cached = this.metricCache.get(key);
    if (!cached) return null;
    
    if (Date.now() > cached.timestamp.getTime() + cached.ttl * 1000) {
      this.metricCache.delete(key);
      return null;
    }
    
    return cached.value as T;
  }

  private setCachedValue<T>(key: string, value: T, ttl: number): void {
    this.metricCache.set(key, {
      value,
      timestamp: new Date(),
      ttl,
    });
  }

  private cleanupExpiredCache(): void {
    const now = Date.now();
    
    for (const [key, cached] of this.metricCache.entries()) {
      if (now > cached.timestamp.getTime() + cached.ttl * 1000) {
        this.metricCache.delete(key);
      }
    }
  }

  private setupEventListeners(): void {
    this.streamProcessor.on('metric_update', (metric: StreamMetric) => {
      // Clear related cache entries when metrics update
      this.clearRelatedCache(metric.name);
    });
  }

  private clearRelatedCache(metricName: string): void {
    const keysToDelete: string[] = [];
    
    for (const [key] of this.metricCache.entries()) {
      if (key.includes('collaboration_metrics') || 
          key.includes('system_health') || 
          key.includes('user_engagement') ||
          key.includes('alert_metrics')) {
        keysToDelete.push(key);
      }
    }
    
    keysToDelete.forEach(key => this.metricCache.delete(key));
  }

  // Helper methods for goal detection and analysis
  private detectCompletedGoals(steps: any[]): string[] {
    const goals = [];
    
    // Example goal detection logic
    const hasKanbanActivity = steps.some(s => s.feature === 'kanban');
    const hasWikiActivity = steps.some(s => s.feature === 'wiki');
    const hasSearchActivity = steps.some(s => s.feature === 'search');
    
    if (hasKanbanActivity) goals.push('task_management');
    if (hasWikiActivity) goals.push('documentation');
    if (hasSearchActivity) goals.push('information_discovery');
    
    return goals;
  }

  private detectDropOffPoint(steps: any[]): string | undefined {
    if (steps.length === 0) return undefined;
    
    // Find the last significant activity
    const lastStep = steps[steps.length - 1];
    
    // If session ended abruptly (short duration for last step)
    if (lastStep.duration < 5000) { // Less than 5 seconds
      return lastStep.feature;
    }
    
    return undefined;
  }

  // Database query methods (simplified implementations)
  private async storeCollaborationSessionStart(event: CollaborationEvent): Promise<void> {
    // Implementation would insert into collaboration_session_metrics
  }

  private async updateSessionParticipants(sessionId: string, userId: string, action: 'join' | 'leave'): Promise<void> {
    // Implementation would update participants array in session
  }

  private async updateSessionModifications(sessionId: string): Promise<void> {
    // Implementation would increment modification count
  }

  private async updateConflictResolutionMetrics(sessionId: string, duration: number): Promise<void> {
    // Implementation would update conflict resolution metrics
  }

  private async storeUserEngagementMetrics(userId: string, duration: number, interactions: number): Promise<void> {
    // Implementation would insert into user_engagement_metrics table
  }

  // Query implementations would go here (simplified for brevity)
  private async queryCollaborationSessions(timeRange: TimeRange): Promise<any> {
    return { activeSessions: 10, avgDuration: 30000 };
  }

  private async querySessionParticipants(timeRange: TimeRange): Promise<any> {
    return { totalParticipants: 25 };
  }

  private async queryConflictMetrics(timeRange: TimeRange): Promise<any> {
    return { detected: 5, resolved: 4, avgResolutionTime: 15000 };
  }

  private async queryCollaborativeFeatures(timeRange: TimeRange): Promise<any[]> {
    return [
      { feature: 'kanban_boards', usageCount: 50 },
      { feature: 'wiki_pages', usageCount: 30 },
    ];
  }

  private async querySystemUptime(): Promise<number> {
    return 99.5;
  }

  private async queryAverageResponseTime(): Promise<number> {
    return 150;
  }

  private async queryErrorRate(): Promise<number> {
    return 1.2;
  }

  private async queryActiveConnections(): Promise<any> {
    return { websocket: 15, database: 8 };
  }

  private async queryResourceUsage(): Promise<any> {
    return { memory: 65, cpu: 45, disk: 30 };
  }

  private async queryServiceHealth(): Promise<any[]> {
    return [
      { name: 'api_gateway', status: 'healthy', responseTime: 120 },
      { name: 'database', status: 'healthy', responseTime: 50 },
      { name: 'websocket', status: 'healthy', responseTime: 80 },
    ];
  }

  private async queryUserCounts(timeRange: TimeRange): Promise<any> {
    return { active: 100, new: 15, returning: 85 };
  }

  private async queryUserSessionData(timeRange: TimeRange): Promise<any> {
    return { avgDuration: 25000, avgInteractions: 12 };
  }

  private async queryFeatureUsage(timeRange: TimeRange): Promise<any[]> {
    return [
      { feature: 'kanban', usageCount: 200, uniqueUsers: 50 },
      { feature: 'wiki', usageCount: 150, uniqueUsers: 40 },
      { feature: 'search', usageCount: 300, uniqueUsers: 60 },
    ];
  }

  private async queryUserRetention(timeRange: TimeRange): Promise<number> {
    return 75.5;
  }

  private async queryActiveAlerts(): Promise<any> {
    return { total: 3, escalated: 1 };
  }

  private async queryAlertsByLevel(): Promise<any> {
    return { info: 1, warning: 2, critical: 0 };
  }

  private async queryAverageResolutionTime(): Promise<number> {
    return 1800; // 30 minutes in seconds
  }

  private async queryRecentAlerts(): Promise<any[]> {
    return [];
  }

  async destroy(): void {
    clearInterval(this.cacheGC);
    this.metricCache.clear();
  }
}