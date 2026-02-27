import { Pool } from 'pg';
import { Redis } from 'ioredis';
import { 
  AnalyticsEvent, 
  UserAnalytics, 
  SystemAnalytics, 
  PerformanceMetric,
  ProductivityInsight,
  DashboardMetrics,
  AnalyticsQuery,
  TimeSeriesData,
  ANALYTICS_CONSTANTS
} from '@mcp-tools/core';
import InsightsEngine from './InsightsEngine.js';

export class AnalyticsService {
  private db: Pool;
  private redis: Redis;
  private insightsEngine: InsightsEngine;
  private eventBuffer: AnalyticsEvent[] = [];
  private flushInterval: NodeJS.Timeout;
  private realtimeCallbacks: Set<(event: AnalyticsEvent) => void> = new Set();

  constructor(db: Pool, redis: Redis) {
    this.db = db;
    this.redis = redis;
    this.insightsEngine = new InsightsEngine(db, redis);
    
    // Flush events every 30 seconds or when buffer is full
    this.flushInterval = setInterval(() => {
      this.flushEventBuffer();
    }, ANALYTICS_CONSTANTS.REAL_TIME_UPDATE_INTERVAL);
  }

  /**
   * Track a single analytics event
   */
  async trackEvent(event: Omit<AnalyticsEvent, 'id' | 'createdAt'>): Promise<void> {
    try {
      const eventWithTimestamp = {
        ...event,
        createdAt: new Date()
      };

      // Add to buffer for batch processing
      this.eventBuffer.push(eventWithTimestamp);

      // Notify real-time listeners
      this.notifyRealtimeListeners(eventWithTimestamp);

      // Flush if buffer is full
      if (this.eventBuffer.length >= ANALYTICS_CONSTANTS.MAX_EVENT_BATCH_SIZE) {
        await this.flushEventBuffer();
      }

      // Update real-time metrics
      await this.updateRealTimeMetrics(eventWithTimestamp);
    } catch (error) {
      console.error('Error tracking analytics event:', error);
    }
  }

  /**
   * Track multiple events in batch
   */
  async trackEventBatch(events: Omit<AnalyticsEvent, 'id' | 'createdAt'>[]): Promise<void> {
    try {
      const eventsWithTimestamp = events.map(event => ({
        ...event,
        createdAt: new Date()
      }));

      this.eventBuffer.push(...eventsWithTimestamp);

      // Flush if buffer would be too large
      if (this.eventBuffer.length >= ANALYTICS_CONSTANTS.MAX_EVENT_BATCH_SIZE) {
        await this.flushEventBuffer();
      }
    } catch (error) {
      console.error('Error tracking analytics event batch:', error);
    }
  }

  /**
   * Record performance metric
   */
  async recordPerformanceMetric(metric: Omit<PerformanceMetric, 'id' | 'createdAt'>): Promise<void> {
    try {
      await this.db.query(`
        INSERT INTO performance_metrics (
          metric_type, endpoint, response_time_ms, start_time, end_time,
          method, status_code, user_id, metadata, error_message
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, [
        metric.metricType,
        metric.endpoint,
        metric.responseTimeMs,
        metric.startTime,
        metric.endTime,
        metric.method,
        metric.statusCode,
        metric.userId,
        JSON.stringify(metric.metadata),
        metric.errorMessage
      ]);

      // Update system analytics in real-time
      await this.updateSystemPerformanceMetrics(metric);
    } catch (error) {
      console.error('Error recording performance metric:', error);
    }
  }

  /**
   * Get user analytics dashboard data
   */
  async getUserDashboard(userId: string, timeRange: string = 'week'): Promise<DashboardMetrics> {
    try {
      const cacheKey = `user_dashboard:${userId}:${timeRange}`;
      
      // Try cache first
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }

      const [userMetrics, productivityData, insights] = await Promise.all([
        this.getUserMetrics(userId, timeRange),
        this.getProductivityData(userId, timeRange),
        this.getUserInsights(userId)
      ]);

      const systemMetrics = await this.getSystemMetrics();

      const dashboard: DashboardMetrics = {
        user: userMetrics,
        productivity: productivityData,
        system: systemMetrics,
        insights: insights
      };

      // Cache for 5 minutes
      await this.redis.setex(cacheKey, ANALYTICS_CONSTANTS.CACHE_TTL, JSON.stringify(dashboard));

      return dashboard;
    } catch (error) {
      console.error('Error getting user dashboard:', error);
      throw error;
    }
  }

  /**
   * Get time series data for charts
   */
  async getTimeSeriesData(query: AnalyticsQuery): Promise<TimeSeriesData[]> {
    try {
      const cacheKey = `timeseries:${JSON.stringify(query)}`;
      
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }

      const { timeRange, groupBy, eventType, eventCategory, userId } = query;
      const dateFilter = this.buildDateFilter(timeRange, query.startDate, query.endDate);
      
      let sqlQuery = `
        SELECT 
          DATE_TRUNC($1, created_at) as timestamp,
          COUNT(*) as value,
          event_category as label
        FROM analytics_events 
        WHERE ${dateFilter}
      `;
      
      const params: any[] = [groupBy];
      let paramIndex = 2;

      if (userId) {
        sqlQuery += ` AND user_id = $${paramIndex}`;
        params.push(userId);
        paramIndex++;
      }

      if (eventType) {
        sqlQuery += ` AND event_type = $${paramIndex}`;
        params.push(eventType);
        paramIndex++;
      }

      if (eventCategory) {
        sqlQuery += ` AND event_category = $${paramIndex}`;
        params.push(eventCategory);
        paramIndex++;
      }

      sqlQuery += ` GROUP BY timestamp, event_category ORDER BY timestamp`;

      const result = await this.db.query(sqlQuery, params);
      
      // Group by category to create multiple series
      const seriesMap = new Map<string, any[]>();
      
      result.rows.forEach(row => {
        const category = row.label || 'Total';
        if (!seriesMap.has(category)) {
          seriesMap.set(category, []);
        }
        seriesMap.get(category)!.push({
          timestamp: new Date(row.timestamp),
          value: parseInt(row.value)
        });
      });

      const series: TimeSeriesData[] = Array.from(seriesMap.entries()).map(([name, data]) => ({
        name,
        data
      }));

      // Cache for 5 minutes
      await this.redis.setex(cacheKey, ANALYTICS_CONSTANTS.CACHE_TTL, JSON.stringify(series));

      return series;
    } catch (error) {
      console.error('Error getting time series data:', error);
      throw error;
    }
  }

  /**
   * Generate productivity insights for a user using advanced AI engine
   */
  async generateInsights(userId: string): Promise<ProductivityInsight[]> {
    try {
      // Use the advanced insights engine
      const insights = await this.insightsEngine.generateInsights(userId);
      
      // Cache insights for quick access
      const cacheKey = `insights:${userId}`;
      await this.redis.setex(cacheKey, 60 * 60, JSON.stringify(insights)); // 1 hour cache
      
      return insights;
    } catch (error) {
      console.error('Error generating insights:', error);
      throw error;
    }
  }

  /**
   * Flush buffered events to database
   */
  private async flushEventBuffer(): Promise<void> {
    if (this.eventBuffer.length === 0) return;

    try {
      const events = [...this.eventBuffer];
      this.eventBuffer.length = 0;

      const values = events.map((event, index) => {
        const baseIndex = index * 13;
        return `($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${baseIndex + 4}, $${baseIndex + 5}, $${baseIndex + 6}, $${baseIndex + 7}, $${baseIndex + 8}, $${baseIndex + 9}, $${baseIndex + 10}, $${baseIndex + 11}, $${baseIndex + 12}, $${baseIndex + 13})`;
      }).join(', ');

      const params = events.flatMap(event => [
        event.userId,
        event.sessionId,
        event.eventType,
        event.eventCategory,
        event.eventAction,
        event.eventLabel,
        JSON.stringify(event.properties),
        event.pageUrl,
        event.loadTime,
        event.boardId,
        event.pageId,
        event.memoryId,
        event.createdAt
      ]);

      await this.db.query(`
        INSERT INTO analytics_events (
          user_id, session_id, event_type, event_category, event_action,
          event_label, properties, page_url, load_time, board_id, page_id, memory_id, created_at
        ) VALUES ${values}
      `, params);

      // Update daily analytics
      await this.updateDailyAnalytics(events);
    } catch (error) {
      // Restore events to buffer to prevent data loss
      this.eventBuffer.unshift(...events);
      console.error('Error flushing event buffer:', error);
    }
  }

  /**
   * Update real-time metrics in Redis
   */
  private async updateRealTimeMetrics(event: AnalyticsEvent): Promise<void> {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      // Increment counters
      await this.redis.hincrby(`metrics:${today}`, 'total_events', 1);
      await this.redis.hincrby(`metrics:${today}:${event.eventCategory}`, event.eventAction, 1);
      
      if (event.userId) {
        await this.redis.hincrby(`user_metrics:${event.userId}:${today}`, event.eventAction, 1);
      }

      // Set expiry for 7 days
      await this.redis.expire(`metrics:${today}`, 7 * 24 * 60 * 60);
    } catch (error) {
      console.error('Error updating real-time metrics:', error);
    }
  }

  /**
   * Update system performance metrics
   */
  private async updateSystemPerformanceMetrics(metric: PerformanceMetric): Promise<void> {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      await this.redis.lpush(`perf:${today}:${metric.metricType}`, JSON.stringify({
        responseTime: metric.responseTimeMs,
        timestamp: Date.now()
      }));

      // Keep only last 1000 metrics
      await this.redis.ltrim(`perf:${today}:${metric.metricType}`, 0, 999);
      await this.redis.expire(`perf:${today}:${metric.metricType}`, 24 * 60 * 60);
    } catch (error) {
      console.error('Error updating system performance metrics:', error);
    }
  }

  /**
   * Update daily analytics aggregates
   */
  private async updateDailyAnalytics(events: AnalyticsEvent[]): Promise<void> {
    try {
      const userEventMap = new Map<string, AnalyticsEvent[]>();
      
      // Group events by user
      events.forEach(event => {
        if (event.userId) {
          if (!userEventMap.has(event.userId)) {
            userEventMap.set(event.userId, []);
          }
          userEventMap.get(event.userId)!.push(event);
        }
      });

      // Update user analytics for each user
      for (const [userId, userEvents] of userEventMap) {
        await this.updateUserDailyMetrics(userId, userEvents);
      }
    } catch (error) {
      console.error('Error updating daily analytics:', error);
    }
  }

  /**
   * Update user daily metrics
   */
  private async updateUserDailyMetrics(userId: string, events: AnalyticsEvent[]): Promise<void> {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      const metrics = {
        tasksCreated: events.filter(e => e.eventAction === 'create_task').length,
        tasksCompleted: events.filter(e => e.eventAction === 'complete_task').length,
        wikiPagesCreated: events.filter(e => e.eventAction === 'create_page').length,
        memoriesStored: events.filter(e => e.eventAction === 'store_memory').length,
        searchesPerformed: events.filter(e => e.eventAction === 'search').length,
        actionsPerformed: events.length
      };

      await this.db.query(`
        INSERT INTO user_analytics (user_id, date, tasks_created, tasks_completed, wiki_pages_created, memories_stored, searches_performed, actions_performed)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (user_id, date) 
        DO UPDATE SET 
          tasks_created = user_analytics.tasks_created + EXCLUDED.tasks_created,
          tasks_completed = user_analytics.tasks_completed + EXCLUDED.tasks_completed,
          wiki_pages_created = user_analytics.wiki_pages_created + EXCLUDED.wiki_pages_created,
          memories_stored = user_analytics.memories_stored + EXCLUDED.memories_stored,
          searches_performed = user_analytics.searches_performed + EXCLUDED.searches_performed,
          actions_performed = user_analytics.actions_performed + EXCLUDED.actions_performed,
          updated_at = NOW()
      `, [userId, today, metrics.tasksCreated, metrics.tasksCompleted, metrics.wikiPagesCreated, metrics.memoriesStored, metrics.searchesPerformed, metrics.actionsPerformed]);
    } catch (error) {
      console.error('Error updating user daily metrics:', error);
    }
  }

  // Additional helper methods would go here...
  
  /**
   * Build date filter for SQL queries
   */
  private buildDateFilter(timeRange: string, startDate?: Date, endDate?: Date): string {
    if (timeRange === 'custom' && startDate && endDate) {
      // Validate dates are actual Date objects to prevent injection
      if (!(startDate instanceof Date) || !(endDate instanceof Date) || isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return "created_at >= CURRENT_DATE - INTERVAL '7 days'";
      }
      return `created_at BETWEEN '${startDate.toISOString()}' AND '${endDate.toISOString()}'`;
    }

    const intervals = {
      today: "created_at >= CURRENT_DATE",
      week: "created_at >= CURRENT_DATE - INTERVAL '7 days'",
      month: "created_at >= CURRENT_DATE - INTERVAL '30 days'",
      quarter: "created_at >= CURRENT_DATE - INTERVAL '90 days'",
      year: "created_at >= CURRENT_DATE - INTERVAL '365 days'"
    };

    return intervals[timeRange as keyof typeof intervals] || intervals.week;
  }

  /**
   * Get user metrics summary
   */
  private async getUserMetrics(userId: string, timeRange: string) {
    const result = await this.db.query(`
      SELECT 
        COALESCE(SUM(tasks_created), 0) as total_tasks,
        COALESCE(SUM(tasks_completed), 0) as completed_tasks,
        COALESCE(SUM(wiki_pages_created), 0) as wiki_pages,
        COALESCE(SUM(memories_stored), 0) as memories,
        COUNT(date) as active_days,
        COALESCE(AVG(avg_session_duration), 0) as avg_session_duration
      FROM user_analytics 
      WHERE user_id = $1 AND ${this.buildDateFilter(timeRange)}
    `, [userId]);

    const row = result.rows[0];
    if (!row) {
      return {
        totalTasks: 0, completedTasks: 0, completionRate: 0,
        wikiPages: 0, memories: 0, activeDays: 0,
        avgSessionDuration: 0, lastActivity: new Date()
      };
    }
    const completionRate = row.total_tasks > 0 ? (row.completed_tasks / row.total_tasks) * 100 : 0;

    return {
      totalTasks: parseInt(row.total_tasks),
      completedTasks: parseInt(row.completed_tasks),
      completionRate: Math.round(completionRate * 100) / 100,
      wikiPages: parseInt(row.wiki_pages),
      memories: parseInt(row.memories),
      activeDays: parseInt(row.active_days),
      avgSessionDuration: parseFloat(row.avg_session_duration),
      lastActivity: new Date()
    };
  }

  /**
   * Get productivity data
   */
  private async getProductivityData(userId: string, timeRange: string) {
    // This would include more complex queries for productivity metrics
    return {
      todayTasks: 0,
      weekTasks: 0,
      monthTasks: 0,
      streakDays: 0,
      peakHours: [9, 10, 14, 15], // Example peak hours
      topFeatures: ['kanban', 'wiki', 'memory']
    };
  }

  /**
   * Get system metrics
   */
  private async getSystemMetrics() {
    return {
      totalUsers: 0,
      activeToday: 0,
      avgResponseTime: 0,
      errorRate: 0,
      uptime: 99.9
    };
  }

  /**
   * Get user insights
   */
  private async getUserInsights(userId: string): Promise<ProductivityInsight[]> {
    const result = await this.db.query(`
      SELECT * FROM productivity_insights 
      WHERE user_id = $1 AND is_active = true 
      ORDER BY created_at DESC LIMIT 5
    `, [userId]);

    return result.rows.map(row => ({
      id: row.id,
      userId: row.user_id,
      insightType: row.insight_type,
      title: row.title,
      description: row.description,
      recommendation: row.recommendation,
      confidenceScore: parseFloat(row.confidence_score),
      dataPoints: row.data_points,
      timePeriodStart: row.time_period_start,
      timePeriodEnd: row.time_period_end,
      isActive: row.is_active,
      isRead: row.is_read,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }

  // Placeholder methods for insight generation
  private async analyzePeakHours(userId: string): Promise<ProductivityInsight> {
    // Implementation would analyze user activity patterns
    return {
      userId,
      insightType: 'peak_hours',
      title: 'Your Peak Productivity Hours',
      description: 'You are most productive between 9-11 AM and 2-4 PM',
      recommendation: 'Schedule important tasks during these hours',
      confidenceScore: 0.8,
      dataPoints: { peakHours: [9, 10, 14, 15] }
    };
  }

  private async analyzeTaskPatterns(userId: string): Promise<ProductivityInsight> {
    return {
      userId,
      insightType: 'task_patterns',
      title: 'Task Completion Patterns',
      description: 'You complete most tasks on Tuesdays and Wednesdays',
      confidenceScore: 0.75,
      dataPoints: { bestDays: ['Tuesday', 'Wednesday'] }
    };
  }

  private async analyzeCollaborationStyle(userId: string): Promise<ProductivityInsight> {
    return {
      userId,
      insightType: 'collaboration_style',
      title: 'Collaboration Insights',
      description: 'You work well in small team environments',
      confidenceScore: 0.7,
      dataPoints: { preferredTeamSize: 3 }
    };
  }

  private async storeInsight(insight: ProductivityInsight): Promise<void> {
    await this.db.query(`
      INSERT INTO productivity_insights (
        user_id, insight_type, title, description, recommendation,
        confidence_score, data_points, time_period_start, time_period_end
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [
      insight.userId,
      insight.insightType,
      insight.title,
      insight.description,
      insight.recommendation,
      insight.confidenceScore,
      JSON.stringify(insight.dataPoints),
      insight.timePeriodStart,
      insight.timePeriodEnd
    ]);
  }

  /**
   * Register a real-time analytics listener
   */
  addRealtimeListener(callback: (event: AnalyticsEvent) => void): void {
    this.realtimeCallbacks.add(callback);
  }

  /**
   * Remove a real-time analytics listener
   */
  removeRealtimeListener(callback: (event: AnalyticsEvent) => void): void {
    this.realtimeCallbacks.delete(callback);
  }

  /**
   * Notify all real-time listeners of new events
   */
  private notifyRealtimeListeners(event: AnalyticsEvent): void {
    this.realtimeCallbacks.forEach(callback => {
      try {
        callback(event);
      } catch (error) {
        console.error('Error in real-time analytics callback:', error);
      }
    });
  }

  /**
   * Get real-time analytics stream for a user
   */
  async getRealtimeMetrics(userId: string): Promise<any> {
    const today = new Date().toISOString().split('T')[0];
    
    try {
      const [userMetrics, systemMetrics] = await Promise.all([
        this.redis.hgetall(`user_metrics:${userId}:${today}`),
        this.redis.hgetall(`metrics:${today}`)
      ]);

      return {
        user: {
          tasksCreated: parseInt(userMetrics.create_task || '0'),
          tasksCompleted: parseInt(userMetrics.complete_task || '0'),
          pagesCreated: parseInt(userMetrics.create_page || '0'),
          memoriesStored: parseInt(userMetrics.store_memory || '0'),
          searches: parseInt(userMetrics.search || '0'),
          totalActions: Object.values(userMetrics).reduce((sum, val) => sum + parseInt(val || '0'), 0)
        },
        system: {
          totalEvents: parseInt(systemMetrics.total_events || '0'),
          activeUsers: await this.getActiveUsersCount(),
          avgResponseTime: await this.getAvgResponseTime()
        },
        timestamp: new Date()
      };
    } catch (error) {
      console.error('Error getting real-time metrics:', error);
      return null;
    }
  }

  /**
   * Get active users count
   */
  private async getActiveUsersCount(): Promise<number> {
    const today = new Date().toISOString().split('T')[0];
    const keys = await this.redis.keys(`user_metrics:*:${today}`);
    return keys.length;
  }

  /**
   * Get average response time from recent performance data
   */
  private async getAvgResponseTime(): Promise<number> {
    const today = new Date().toISOString().split('T')[0];
    const perfData = await this.redis.lrange(`perf:${today}:api_response`, 0, 99);
    
    if (perfData.length === 0) return 0;
    
    const responseTimes = perfData.map(data => {
      const parsed = JSON.parse(data);
      return parsed.responseTime;
    });
    
    return responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length;
  }

  /**
   * Create analytics event stream for real-time updates
   */
  async createEventStream(userId?: string): Promise<AsyncGenerator<any, void, unknown>> {
    const self = this;
    
    return (async function* () {
      let lastEventTime = Date.now();
      
      while (true) {
        try {
          // Get recent events from buffer or database
          const recentEvents = self.eventBuffer.filter(event => {
            const eventTime = new Date(event.createdAt!).getTime();
            return eventTime > lastEventTime && (!userId || event.userId === userId);
          });

          if (recentEvents.length > 0) {
            yield {
              type: 'events',
              data: recentEvents,
              timestamp: new Date()
            };
            
            lastEventTime = Math.max(...recentEvents.map(e => new Date(e.createdAt!).getTime()));
          }

          // Get real-time metrics
          if (!userId) {
            const metrics = await self.getSystemRealtimeMetrics();
            yield {
              type: 'metrics',
              data: metrics,
              timestamp: new Date()
            };
          } else {
            const metrics = await self.getRealtimeMetrics(userId);
            if (metrics) {
              yield {
                type: 'user_metrics',
                data: metrics,
                timestamp: new Date()
              };
            }
          }

          // Wait before next update
          await new Promise(resolve => setTimeout(resolve, 5000)); // 5 second updates
        } catch (error) {
          console.error('Error in analytics event stream:', error);
          yield {
            type: 'error',
            error: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date()
          };
        }
      }
    })();
  }

  /**
   * Get system-wide real-time metrics
   */
  private async getSystemRealtimeMetrics(): Promise<any> {
    const today = new Date().toISOString().split('T')[0];
    
    try {
      const [systemMetrics, activeUsers, avgResponseTime] = await Promise.all([
        this.redis.hgetall(`metrics:${today}`),
        this.getActiveUsersCount(),
        this.getAvgResponseTime()
      ]);

      return {
        totalEvents: parseInt(systemMetrics.total_events || '0'),
        activeUsers,
        avgResponseTime: Math.round(avgResponseTime),
        eventsPerMinute: await this.getEventsPerMinute(),
        errorRate: await this.getRealtimeErrorRate(),
        timestamp: new Date()
      };
    } catch (error) {
      console.error('Error getting system real-time metrics:', error);
      return null;
    }
  }

  /**
   * Get events per minute rate
   */
  private async getEventsPerMinute(): Promise<number> {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    
    const recentEvents = this.eventBuffer.filter(event => {
      const eventTime = new Date(event.createdAt!).getTime();
      return eventTime > oneMinuteAgo;
    });
    
    return recentEvents.length;
  }

  /**
   * Get real-time error rate
   */
  private async getRealtimeErrorRate(): Promise<number> {
    const today = new Date().toISOString().split('T')[0];
    const perfData = await this.redis.lrange(`perf:${today}:api_response`, 0, 99);
    
    if (perfData.length === 0) return 0;
    
    const errorCount = perfData.filter(data => {
      const parsed = JSON.parse(data);
      return parsed.statusCode && parsed.statusCode >= 400;
    }).length;
    
    return (errorCount / perfData.length) * 100;
  }

  /**
   * Trigger insight generation for active users
   */
  async triggerInsightGeneration(): Promise<void> {
    try {
      // Get active users from today
      const today = new Date().toISOString().split('T')[0];
      const userKeys = await this.redis.keys(`user_metrics:*:${today}`);
      
      const userIds = userKeys.map(key => key.split(':')[1]);
      
      // Generate insights for each active user (in background)
      for (const userId of userIds) {
        this.generateInsights(userId).catch(error => {
          console.error(`Failed to generate insights for user ${userId}:`, error);
        });
      }
      
      console.log(`Triggered insight generation for ${userIds.length} active users`);
    } catch (error) {
      console.error('Error triggering insight generation:', error);
    }
  }

  /**
   * Cleanup method
   */
  destroy(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }
    this.realtimeCallbacks.clear();
  }
}