/**
 * Whiteboard Analytics Service
 * 
 * Comprehensive analytics system for whiteboards that provides insights into:
 * - User behavior and collaboration patterns
 * - Performance metrics and system health
 * - Usage statistics and engagement tracking
 * - Real-time event processing with privacy compliance
 */

import { DatabasePool } from '../../utils/database-pool.js';
import { Logger } from '../../utils/logger.js';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { sanitizeInput, createSafeSearchPattern, SafeWhereBuilder } from '../../utils/sql-security.js';

// UUID validation schemas
const UuidSchema = z.string().uuid();
const OptionalUuidSchema = z.string().uuid().optional();

// Event tracking schemas
const EventDataSchema = z.object({
  type: z.string().min(1).max(100),
  action: z.string().min(1).max(100),
  targetType: z.string().min(1).max(50),
  targetId: OptionalUuidSchema,
  coordinates: z.object({
    x: z.number(),
    y: z.number(),
  }).optional(),
  elementType: z.string().optional(),
  toolType: z.string().optional(),
  duration: z.number().optional(),
  metadata: z.record(z.unknown()).optional(),
}).strict();

const PerformanceMetricSchema = z.object({
  type: z.enum(['load_time', 'ot_latency', 'render_time', 'memory_usage', 'fps', 'connection_quality']),
  value: z.number().min(0),
  unit: z.enum(['ms', 'MB', 'fps', 'percent', 'mbps']),
  threshold: z.number().optional(),
  deviceInfo: z.record(z.unknown()).optional(),
  networkInfo: z.record(z.unknown()).optional(),
}).strict();

// Analytics query schemas
const AnalyticsFilterSchema = z.object({
  whiteboardId: OptionalUuidSchema,
  userId: OptionalUuidSchema,
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  eventType: z.string().optional(),
  metricType: z.string().optional(),
  insightType: z.string().optional(),
}).strict();

const AnalyticsPaginationSchema = z.object({
  limit: z.number().min(1).max(1000).default(50),
  offset: z.number().min(0).default(0),
}).strict();

// Response types
export interface WhiteboardEvent {
  id: string;
  whiteboardId: string;
  userId: string;
  sessionId?: string;
  eventType: string;
  action: string;
  targetType: string;
  targetId?: string;
  eventData: Record<string, unknown>;
  coordinates?: { x: number; y: number };
  durationMs?: number;
  clientTimestamp: string;
  serverTimestamp: string;
  clientMetadata: Record<string, unknown>;
}

export interface WhiteboardSessionAnalytics {
  id: string;
  sessionId: string;
  whiteboardId: string;
  userId: string;
  sessionStart: string;
  sessionEnd?: string;
  durationMinutes?: number;
  totalActions: number;
  elementsCreated: number;
  elementsModified: number;
  elementsDeleted: number;
  commentsCreated: number;
  toolsUsed: string[];
  collaborationScore: number;
  activityHeatmap: Record<string, unknown>;
  performanceMetrics: Record<string, unknown>;
  errorCount: number;
  disconnectReason?: string;
}

export interface WhiteboardMetrics {
  id: string;
  whiteboardId: string;
  metricDate: string;
  totalSessions: number;
  uniqueUsers: number;
  totalDurationMinutes: number;
  avgSessionDuration: number;
  totalActions: number;
  elementsCreated: number;
  elementsModified: number;
  elementsDeleted: number;
  commentsCreated: number;
  concurrentUsersPeak: number;
  collaborationEvents: number;
  conflictResolutions: number;
  templateApplications: number;
  performanceAvg: Record<string, unknown>;
  errorRate: number;
  toolUsageStats: Record<string, unknown>;
  activityPatterns: Record<string, unknown>;
}

export interface WhiteboardInsight {
  id: string;
  whiteboardId: string;
  insightType: string;
  insightCategory: 'positive' | 'warning' | 'critical' | 'information';
  title: string;
  description: string;
  severityScore: number;
  confidenceScore: number;
  insightData: Record<string, unknown>;
  recommendations: string[];
  timePeriod: { start: string; end: string };
  isActive: boolean;
  resolvedAt?: string;
  resolvedBy?: string;
  createdAt: string;
}

export interface UserBehaviorPattern {
  id: string;
  userId: string;
  whiteboardId: string;
  date: string;
  sessionCount: number;
  totalTimeMinutes: number;
  preferredTools: string[];
  interactionPatterns: Record<string, unknown>;
  collaborationStyle?: 'individual' | 'collaborative' | 'leader' | 'follower';
  engagementScore: number;
  productivityScore: number;
  featureAdoption: Record<string, unknown>;
}

export interface PerformanceMetric {
  id: string;
  whiteboardId: string;
  sessionId?: string;
  metricType: string;
  metricValue: number;
  metricUnit: string;
  thresholdValue?: number;
  isAboveThreshold: boolean;
  userAgent?: string;
  deviceInfo: Record<string, unknown>;
  networkInfo: Record<string, unknown>;
  contextData: Record<string, unknown>;
  recordedAt: string;
}

export interface AnalyticsReport {
  summary: {
    totalUsers: number;
    totalSessions: number;
    avgEngagement: number;
    performanceScore: number;
  };
  trends: {
    userGrowth: number;
    engagementTrend: number;
    performanceTrend: number;
  };
  insights: WhiteboardInsight[];
  recommendations: string[];
}

export interface AnalyticsError extends Error {
  code: string;
  details?: Record<string, unknown>;
}

/**
 * Core analytics service for whiteboard usage tracking and insights
 */
export class WhiteboardAnalyticsService {
  private logger: Logger;

  constructor(
    private db: DatabasePool,
    logger?: Logger
  ) {
    this.logger = logger || new Logger('WhiteboardAnalyticsService');
  }

  /**
   * Track a real-time event with privacy compliance
   */
  async trackEvent(
    whiteboardId: string,
    userId: string,
    eventData: z.infer<typeof EventDataSchema>,
    sessionId?: string,
    clientMetadata?: Record<string, unknown>
  ): Promise<WhiteboardEvent> {
    try {
      // Validate UUIDs first
      UuidSchema.parse(whiteboardId);
      UuidSchema.parse(userId);
      if (sessionId) {
        UuidSchema.parse(sessionId);
      }
      
      // Validate event data
      const validatedData = EventDataSchema.parse(eventData);
      
      // Check user consent (GDPR compliance)
      const hasConsent = await this.checkUserAnalyticsConsent(userId);
      if (!hasConsent) {
        this.logger.debug('User has not consented to analytics tracking', { userId });
        // Return a minimal event without storing
        return this.createMinimalEvent(whiteboardId, userId, validatedData);
      }

      const eventId = randomUUID();
      const now = new Date().toISOString();

      // Sanitize and prepare data
      const sanitizedMetadata = this.sanitizeMetadata(clientMetadata || {});
      const sanitizedEventData = this.sanitizeEventData(validatedData);

      // Use transaction to ensure data consistency
      return await this.db.executeTransaction(async (trx) => {
        const query = `
          INSERT INTO whiteboard_events (
            id, whiteboard_id, user_id, session_id, event_type, action, 
            target_type, target_id, event_data, coordinates, duration_ms, 
            client_timestamp, server_timestamp, client_metadata
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
          RETURNING *
        `;

        const result = await trx.query(query, [
          eventId,
          whiteboardId,
          userId,
          sessionId,
          validatedData.type,
          validatedData.action,
          validatedData.targetType,
          validatedData.targetId,
          JSON.stringify(sanitizedEventData),
          validatedData.coordinates ? JSON.stringify(validatedData.coordinates) : null,
          validatedData.duration,
          now, // Using server time for client timestamp as well for consistency
          now,
          JSON.stringify(sanitizedMetadata),
        ]);

        if (result.rows.length === 0) {
          throw this.createAnalyticsError('EVENT_CREATION_FAILED', 'Failed to create analytics event');
        }

        const event = this.mapDatabaseRowToEvent(result.rows[0]);

        // Async processing for real-time analytics (non-blocking)
        setImmediate(() => {
          this.processEventAsync(eventId, whiteboardId, userId, validatedData).catch(error => {
            this.logger.warn('Async event processing failed', { error, eventId });
          });
        });

        this.logger.debug('Analytics event tracked successfully', { eventId, whiteboardId, userId });

        return event;
      });
    } catch (error) {
      this.logger.error('Failed to track analytics event', { error, whiteboardId, userId });
      
      // Don't fail the main operation for analytics errors
      if (error instanceof z.ZodError) {
        throw this.createAnalyticsError('INVALID_EVENT_DATA', 'Invalid event data format', error.errors);
      }
      
      throw error;
    }
  }

  /**
   * Track performance metrics with threshold monitoring
   */
  async trackPerformanceMetric(
    whiteboardId: string,
    metricData: z.infer<typeof PerformanceMetricSchema>,
    sessionId?: string,
    contextData?: Record<string, unknown>
  ): Promise<PerformanceMetric> {
    try {
      // Validate UUIDs
      UuidSchema.parse(whiteboardId);
      if (sessionId) {
        UuidSchema.parse(sessionId);
      }
      
      const validatedData = PerformanceMetricSchema.parse(metricData);
      
      const metricId = randomUUID();
      const now = new Date().toISOString();
      const isAboveThreshold = validatedData.threshold ? 
        validatedData.value > validatedData.threshold : false;

      // Use transaction for consistency
      return await this.db.executeTransaction(async (trx) => {
        const query = `
          INSERT INTO whiteboard_performance_tracking (
            id, whiteboard_id, session_id, metric_type, metric_value, metric_unit,
            threshold_value, is_above_threshold, user_agent, device_info, 
            network_info, context_data, recorded_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          RETURNING *
        `;

        const result = await trx.query(query, [
          metricId,
          whiteboardId,
          sessionId,
          validatedData.type,
          validatedData.value,
          validatedData.unit,
          validatedData.threshold,
          isAboveThreshold,
          contextData?.userAgent,
          JSON.stringify(validatedData.deviceInfo || {}),
          JSON.stringify(validatedData.networkInfo || {}),
          JSON.stringify(this.sanitizeMetadata(contextData || {})),
          now,
        ]);

        if (result.rows.length === 0) {
          throw this.createAnalyticsError('METRIC_CREATION_FAILED', 'Failed to create performance metric');
        }

        const metric = this.mapDatabaseRowToPerformanceMetric(result.rows[0]);

        // Alert on performance issues (non-blocking)
        if (isAboveThreshold) {
          setImmediate(() => {
            this.handlePerformanceAlert(whiteboardId, validatedData).catch(error => {
              this.logger.warn('Performance alert handling failed', { error, metricId });
            });
          });
        }

        return metric;
      });
    } catch (error) {
      this.logger.error('Failed to track performance metric', { error, whiteboardId });
      throw error;
    }
  }

  /**
   * Start session analytics tracking
   */
  async startSessionAnalytics(
    sessionId: string,
    whiteboardId: string,
    userId: string
  ): Promise<WhiteboardSessionAnalytics> {
    try {
      // Validate UUIDs
      UuidSchema.parse(sessionId);
      UuidSchema.parse(whiteboardId);
      UuidSchema.parse(userId);
      
      const analyticsId = randomUUID();
      const now = new Date().toISOString();

      // Use transaction for consistency
      return await this.db.executeTransaction(async (trx) => {
        const query = `
          INSERT INTO whiteboard_session_analytics (
            id, session_id, whiteboard_id, user_id, session_start,
            total_actions, elements_created, elements_modified, elements_deleted,
            comments_created, tools_used, collaboration_score, activity_heatmap,
            performance_metrics, error_count
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
          RETURNING *
        `;

        const result = await trx.query(query, [
          analyticsId,
          sessionId,
          whiteboardId,
          userId,
          now,
          0, 0, 0, 0, 0, // Initial counters
          [], // Empty tools array
          0, // Initial collaboration score
          '{}', // Empty heatmap
          '{}', // Empty performance metrics
          0, // Initial error count
        ]);

        if (result.rows.length === 0) {
          throw this.createAnalyticsError('SESSION_ANALYTICS_CREATION_FAILED', 'Failed to create session analytics');
        }

        return this.mapDatabaseRowToSessionAnalytics(result.rows[0]);
      });
    } catch (error) {
      this.logger.error('Failed to start session analytics', { error, sessionId, whiteboardId });
      throw error;
    }
  }

  /**
   * Update session analytics with new data
   */
  async updateSessionAnalytics(
    sessionId: string,
    updates: Partial<{
      totalActions: number;
      elementsCreated: number;
      elementsModified: number;
      elementsDeleted: number;
      commentsCreated: number;
      toolsUsed: string[];
      collaborationScore: number;
      activityHeatmap: Record<string, unknown>;
      performanceMetrics: Record<string, unknown>;
      errorCount: number;
    }>
  ): Promise<WhiteboardSessionAnalytics> {
    try {
      // Validate UUID
      UuidSchema.parse(sessionId);
      
      // Use transaction for consistency
      return await this.db.executeTransaction(async (trx) => {
        const updateFields: string[] = [];
        const values: unknown[] = [];
        let paramIndex = 1;

        // Build dynamic update query using safe column names
        Object.entries(updates).forEach(([key, value]) => {
          if (value !== undefined) {
            switch (key) {
              case 'toolsUsed':
                updateFields.push(`tools_used = $${paramIndex++}`);
                values.push(value);
                break;
              case 'activityHeatmap':
              case 'performanceMetrics':
                updateFields.push(`${this.camelToSnakeCase(key)} = $${paramIndex++}`);
                values.push(JSON.stringify(this.sanitizeMetadata(value as Record<string, unknown>)));
                break;
              default:
                updateFields.push(`${this.camelToSnakeCase(key)} = $${paramIndex++}`);
                values.push(value);
                break;
            }
          }
        });

        if (updateFields.length === 0) {
          throw this.createAnalyticsError('NO_UPDATES_PROVIDED', 'No valid updates provided');
        }

        updateFields.push(`updated_at = $${paramIndex++}`);
        values.push(new Date().toISOString());
        values.push(sessionId);

        const query = `
          UPDATE whiteboard_session_analytics
          SET ${updateFields.join(', ')}
          WHERE session_id = $${paramIndex}
          RETURNING *
        `;

        const result = await trx.query(query, values);

        if (result.rows.length === 0) {
          throw this.createAnalyticsError('SESSION_NOT_FOUND', 'Session analytics not found');
        }

        return this.mapDatabaseRowToSessionAnalytics(result.rows[0]);
      });
    } catch (error) {
      this.logger.error('Failed to update session analytics', { error, sessionId });
      throw error;
    }
  }

  /**
   * End session analytics tracking
   */
  async endSessionAnalytics(
    sessionId: string,
    disconnectReason?: string
  ): Promise<WhiteboardSessionAnalytics> {
    try {
      // Validate UUID
      UuidSchema.parse(sessionId);
      
      const now = new Date().toISOString();
      const sanitizedReason = disconnectReason ? sanitizeInput(disconnectReason) : null;

      // Use transaction for consistency
      return await this.db.executeTransaction(async (trx) => {
        // Calculate duration and finalize metrics
        const query = `
          UPDATE whiteboard_session_analytics
          SET 
            session_end = $1,
            duration_minutes = EXTRACT(EPOCH FROM ($1::timestamptz - session_start)) / 60,
            disconnect_reason = $2,
            updated_at = $1
          WHERE session_id = $3
          RETURNING *
        `;

        const result = await trx.query(query, [now, sanitizedReason, sessionId]);

        if (result.rows.length === 0) {
          throw this.createAnalyticsError('SESSION_NOT_FOUND', 'Session analytics not found');
        }

        const sessionAnalytics = this.mapDatabaseRowToSessionAnalytics(result.rows[0]);

        // Async processing for insights and metrics (non-blocking)
        setImmediate(() => {
          this.processSessionEndAsync(sessionAnalytics).catch(error => {
            this.logger.warn('Async session end processing failed', { error, sessionId });
          });
        });

        return sessionAnalytics;
      });
    } catch (error) {
      this.logger.error('Failed to end session analytics', { error, sessionId });
      throw error;
    }
  }

  /**
   * Get comprehensive analytics for a whiteboard
   */
  async getWhiteboardAnalytics(
    whiteboardId: string,
    filters?: z.infer<typeof AnalyticsFilterSchema>,
    pagination?: z.infer<typeof AnalyticsPaginationSchema>
  ): Promise<{
    metrics: WhiteboardMetrics[];
    sessions: WhiteboardSessionAnalytics[];
    insights: WhiteboardInsight[];
    userBehavior: UserBehaviorPattern[];
    performance: PerformanceMetric[];
    total: number;
  }> {
    try {
      // Validate UUID
      UuidSchema.parse(whiteboardId);
      
      const validatedFilters = filters ? AnalyticsFilterSchema.parse(filters) : {};
      const validatedPagination = pagination ? AnalyticsPaginationSchema.parse(pagination) : { limit: 50, offset: 0 };

      // Build safe WHERE clauses using the SafeWhereBuilder
      const whereBuilder = new SafeWhereBuilder(2); // Start at param index 2 (after whiteboardId)
      
      if (validatedFilters.userId) {
        whereBuilder.addEqualCondition('user_id', validatedFilters.userId);
      }
      if (validatedFilters.startDate) {
        whereBuilder.addEqualCondition('created_at', `>= ${validatedFilters.startDate}`);
      }
      if (validatedFilters.endDate) {
        whereBuilder.addEqualCondition('created_at', `<= ${validatedFilters.endDate}`);
      }
      
      const { whereClause, values, nextParamIndex } = whereBuilder.build();
      const fullWhereClause = whereClause ? `AND ${whereClause}` : '';

      // Execute all queries in parallel for better performance
      const [metricsResult, sessionsResult, insightsResult, behaviorResult, performanceResult, countResult] = await Promise.all([
        // Get metrics
        this.db.query(`
          SELECT * FROM whiteboard_metrics
          WHERE whiteboard_id = $1 ${fullWhereClause}
          ORDER BY metric_date DESC
          LIMIT $${nextParamIndex} OFFSET $${nextParamIndex + 1}
        `, [whiteboardId, ...values, validatedPagination.limit, validatedPagination.offset]),
        
        // Get session analytics
        this.db.query(`
          SELECT * FROM whiteboard_session_analytics
          WHERE whiteboard_id = $1 ${fullWhereClause}
          ORDER BY session_start DESC
          LIMIT $${nextParamIndex}
        `, [whiteboardId, ...values, 20]),
        
        // Get insights
        this.db.query(`
          SELECT * FROM whiteboard_insights
          WHERE whiteboard_id = $1 AND is_active = true
          ORDER BY severity_score DESC, created_at DESC
          LIMIT 10
        `, [whiteboardId]),
        
        // Get user behavior patterns
        this.db.query(`
          SELECT * FROM whiteboard_user_behavior
          WHERE whiteboard_id = $1 ${fullWhereClause}
          ORDER BY date DESC
          LIMIT $${nextParamIndex}
        `, [whiteboardId, ...values, 50]),
        
        // Get performance metrics
        this.db.query(`
          SELECT * FROM whiteboard_performance_tracking
          WHERE whiteboard_id = $1 ${fullWhereClause}
          ORDER BY recorded_at DESC
          LIMIT $${nextParamIndex}
        `, [whiteboardId, ...values, 100]),
        
        // Get total count
        this.db.query(`
          SELECT COUNT(*) as total FROM whiteboard_metrics
          WHERE whiteboard_id = $1 ${fullWhereClause}
        `, [whiteboardId, ...values])
      ]);

      return {
        metrics: metricsResult.rows.map(row => this.mapDatabaseRowToMetrics(row)),
        sessions: sessionsResult.rows.map(row => this.mapDatabaseRowToSessionAnalytics(row)),
        insights: insightsResult.rows.map(row => this.mapDatabaseRowToInsight(row)),
        userBehavior: behaviorResult.rows.map(row => this.mapDatabaseRowToUserBehavior(row)),
        performance: performanceResult.rows.map(row => this.mapDatabaseRowToPerformanceMetric(row)),
        total: parseInt(countResult.rows[0]?.total || '0'),
      };
    } catch (error) {
      this.logger.error('Failed to get whiteboard analytics', { error, whiteboardId });
      throw error;
    }
  }

  /**
   * Generate comprehensive analytics report
   */
  async generateAnalyticsReport(
    whiteboardId: string,
    timePeriod: { start: string; end: string }
  ): Promise<AnalyticsReport> {
    try {
      // Validate UUID and time period
      UuidSchema.parse(whiteboardId);
      z.string().datetime().parse(timePeriod.start);
      z.string().datetime().parse(timePeriod.end);
      
      // Sanitize time period inputs
      const sanitizedStart = sanitizeInput(timePeriod.start);
      const sanitizedEnd = sanitizeInput(timePeriod.end);

      // Execute all queries in parallel for better performance using transactions
      const [summaryResult, trendsResult, insightsResult] = await Promise.all([
        // Get summary metrics
        this.db.query(`
          SELECT 
            COUNT(DISTINCT sa.user_id) as total_users,
            COUNT(DISTINCT sa.id) as total_sessions,
            AVG(ub.engagement_score) as avg_engagement,
            AVG(
              CASE 
                WHEN pm.metric_type = 'load_time' AND pm.metric_unit = 'ms' 
                THEN 100 - LEAST(pm.metric_value / 50, 100) -- Scale load time to performance score
                ELSE 0 
              END
            ) as performance_score
          FROM whiteboard_session_analytics sa
          LEFT JOIN whiteboard_user_behavior ub ON sa.user_id = ub.user_id AND sa.whiteboard_id = ub.whiteboard_id
          LEFT JOIN whiteboard_performance_tracking pm ON sa.whiteboard_id = pm.whiteboard_id
          WHERE sa.whiteboard_id = $1 
            AND sa.session_start >= $2::timestamptz
            AND sa.session_start <= $3::timestamptz
        `, [whiteboardId, sanitizedStart, sanitizedEnd]),
        
        // Get trend analysis
        this.db.query(`
          SELECT 
            DATE_TRUNC('day', session_start) as day,
            COUNT(DISTINCT user_id) as daily_users,
            AVG(collaboration_score) as daily_engagement
          FROM whiteboard_session_analytics
          WHERE whiteboard_id = $1 
            AND session_start >= $2::timestamptz
            AND session_start <= $3::timestamptz
          GROUP BY DATE_TRUNC('day', session_start)
          ORDER BY day
        `, [whiteboardId, sanitizedStart, sanitizedEnd]),
        
        // Get active insights
        this.db.query(`
          SELECT * FROM whiteboard_insights
          WHERE whiteboard_id = $1 
            AND is_active = true
            AND (time_period->>'start')::timestamptz >= $2::timestamptz
            AND (time_period->>'end')::timestamptz <= $3::timestamptz
          ORDER BY severity_score DESC, confidence_score DESC
          LIMIT 10
        `, [whiteboardId, sanitizedStart, sanitizedEnd])
      ]);
      
      const summary = summaryResult.rows[0] || {};
      const trends = this.calculateTrends(trendsResult.rows);
      const recommendations = this.generateRecommendations(summary, trends, insightsResult.rows);

      return {
        summary: {
          totalUsers: parseInt(summary.total_users || '0'),
          totalSessions: parseInt(summary.total_sessions || '0'),
          avgEngagement: parseFloat(summary.avg_engagement || '0'),
          performanceScore: parseFloat(summary.performance_score || '0'),
        },
        trends: {
          userGrowth: trends.userGrowth,
          engagementTrend: trends.engagementTrend,
          performanceTrend: trends.performanceTrend,
        },
        insights: insightsResult.rows.map(row => this.mapDatabaseRowToInsight(row)),
        recommendations,
      };
    } catch (error) {
      this.logger.error('Failed to generate analytics report', { error, whiteboardId });
      throw error;
    }
  }

  // Private helper methods

  private async checkUserAnalyticsConsent(userId: string): Promise<boolean> {
    try {
      // Check user's analytics consent in user preferences
      // For now, default to true - in production, this should check actual user consent
      return true;
    } catch (error) {
      this.logger.warn('Failed to check user analytics consent', { error, userId });
      return false;
    }
  }

  private createMinimalEvent(
    whiteboardId: string,
    userId: string,
    eventData: z.infer<typeof EventDataSchema>
  ): WhiteboardEvent {
    const now = new Date().toISOString();
    return {
      id: randomUUID(),
      whiteboardId,
      userId,
      eventType: eventData.type,
      action: eventData.action,
      targetType: eventData.targetType,
      targetId: eventData.targetId,
      eventData: {},
      coordinates: eventData.coordinates,
      durationMs: eventData.duration,
      clientTimestamp: now,
      serverTimestamp: now,
      clientMetadata: {},
    };
  }

  private sanitizeMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};
    const allowedKeys = ['userAgent', 'platform', 'screenSize', 'viewport', 'connectionType'];
    
    allowedKeys.forEach(key => {
      if (metadata[key] !== undefined) {
        if (typeof metadata[key] === 'string') {
          sanitized[key] = sanitizeInput(metadata[key] as string);
        } else if (typeof metadata[key] === 'object') {
          sanitized[key] = this.sanitizeObject(metadata[key] as Record<string, unknown>);
        } else {
          sanitized[key] = metadata[key];
        }
      }
    });

    return sanitized;
  }

  private sanitizeEventData(eventData: z.infer<typeof EventDataSchema>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {
      type: eventData.type,
      action: eventData.action,
      targetType: eventData.targetType,
    };

    if (eventData.elementType) {
      sanitized.elementType = eventData.elementType;
    }

    if (eventData.toolType) {
      sanitized.toolType = eventData.toolType;
    }

    if (eventData.metadata) {
      sanitized.metadata = this.sanitizeObject(eventData.metadata);
    }

    return sanitized;
  }

  private sanitizeObject(obj: Record<string, unknown>, depth: number = 0): Record<string, unknown> {
    if (depth > 3) return {}; // Prevent deep nesting

    const sanitized: Record<string, unknown> = {};
    let keyCount = 0;

    for (const [key, value] of Object.entries(obj)) {
      if (keyCount++ > 20) break; // Limit object size

      const sanitizedKey = sanitizeInput(key);
      if (!sanitizedKey) continue;

      if (typeof value === 'string') {
        sanitized[sanitizedKey] = sanitizeInput(value);
      } else if (typeof value === 'number' || typeof value === 'boolean') {
        sanitized[sanitizedKey] = value;
      } else if (typeof value === 'object' && value !== null) {
        if (Array.isArray(value)) {
          sanitized[sanitizedKey] = value.slice(0, 50).map(item => 
            typeof item === 'string' ? sanitizeInput(item) : item
          );
        } else {
          sanitized[sanitizedKey] = this.sanitizeObject(value as Record<string, unknown>, depth + 1);
        }
      }
    }

    return sanitized;
  }

  private async processEventAsync(
    eventId: string,
    whiteboardId: string,
    userId: string,
    eventData: z.infer<typeof EventDataSchema>
  ): Promise<void> {
    try {
      // Update user behavior patterns
      await this.updateUserBehaviorPatterns(userId, whiteboardId, eventData);

      // Check for insights generation
      await this.checkForInsights(whiteboardId, eventData);

      // Update real-time metrics if needed
      if (['create', 'update', 'delete'].includes(eventData.action)) {
        await this.updateRealTimeMetrics(whiteboardId);
      }
    } catch (error) {
      this.logger.warn('Async event processing failed', { error, eventId });
    }
  }

  private async updateUserBehaviorPatterns(
    userId: string,
    whiteboardId: string,
    eventData: z.infer<typeof EventDataSchema>
  ): Promise<void> {
    try {
      // Validate UUIDs
      UuidSchema.parse(userId);
      UuidSchema.parse(whiteboardId);
      
      const today = new Date().toISOString().split('T')[0];
      const sanitizedAction = sanitizeInput(eventData.action);
      const sanitizedToolType = eventData.toolType ? sanitizeInput(eventData.toolType) : null;

      // Use transaction for consistency
      await this.db.executeTransaction(async (trx) => {
        const query = `
          INSERT INTO whiteboard_user_behavior (
            id, user_id, whiteboard_id, date, session_count, total_time_minutes,
            preferred_tools, interaction_patterns, engagement_score, productivity_score,
            feature_adoption, created_at, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          ON CONFLICT (user_id, whiteboard_id, date) DO UPDATE SET
            interaction_patterns = jsonb_set(
              whiteboard_user_behavior.interaction_patterns,
              '{${sanitizedAction}}',
              COALESCE(whiteboard_user_behavior.interaction_patterns->'${sanitizedAction}', '0')::int + 1
            ),
            updated_at = $13
        `;

        await trx.query(query, [
          randomUUID(),
          userId,
          whiteboardId,
          today,
          1,
          0,
          sanitizedToolType ? [sanitizedToolType] : [],
          JSON.stringify({ [sanitizedAction]: 1 }),
          1.0,
          1.0,
          JSON.stringify({}),
          new Date().toISOString(),
          new Date().toISOString(),
        ]);
      });
    } catch (error) {
      this.logger.warn('Failed to update user behavior patterns', { error, userId });
    }
  }

  private async checkForInsights(
    whiteboardId: string,
    eventData: z.infer<typeof EventDataSchema>
  ): Promise<void> {
    try {
      // Check for performance issues
      if (eventData.duration && eventData.duration > 5000) { // 5 second threshold
        await this.createPerformanceInsight(whiteboardId, eventData);
      }

      // Check for collaboration patterns
      if (eventData.type === 'collaboration') {
        await this.checkCollaborationInsights(whiteboardId);
      }
    } catch (error) {
      this.logger.warn('Failed to check for insights', { error, whiteboardId });
    }
  }

  private async createPerformanceInsight(
    whiteboardId: string,
    eventData: z.infer<typeof EventDataSchema>
  ): Promise<void> {
    try {
      // Validate UUID
      UuidSchema.parse(whiteboardId);
      
      const insightId = randomUUID();
      const now = new Date().toISOString();
      
      // Sanitize inputs
      const sanitizedAction = sanitizeInput(eventData.action);
      const sanitizedTargetType = sanitizeInput(eventData.targetType);
      const sanitizedDescription = sanitizeInput(`Operation "${sanitizedAction}" took ${eventData.duration}ms to complete, which exceeds the recommended threshold.`);

      // Use transaction for consistency
      await this.db.executeTransaction(async (trx) => {
        const query = `
          INSERT INTO whiteboard_insights (
            id, whiteboard_id, insight_type, insight_category, title, description,
            severity_score, confidence_score, insight_data, recommendations,
            time_period, is_active, created_at, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
          ON CONFLICT (id) DO NOTHING
        `;

        await trx.query(query, [
          insightId,
          whiteboardId,
          'performance_issue',
          'warning',
          'Slow Operation Detected',
          sanitizedDescription,
          6.0,
          0.8,
          JSON.stringify(this.sanitizeMetadata({
            action: sanitizedAction,
            duration: eventData.duration,
            targetType: sanitizedTargetType,
          })),
          JSON.stringify([
            'Consider optimizing the operation',
            'Check network connectivity',
            'Review system performance',
          ]),
          JSON.stringify({ start: now, end: now }),
          true,
          now,
          now,
        ]);
      });
    } catch (error) {
      this.logger.warn('Failed to create performance insight', { error, whiteboardId });
    }
  }

  private async checkCollaborationInsights(whiteboardId: string): Promise<void> {
    try {
      // Check for high collaboration activity
      const collaborationQuery = `
        SELECT COUNT(*) as collaboration_count
        FROM whiteboard_events
        WHERE whiteboard_id = $1 
          AND event_type = 'collaboration'
          AND server_timestamp > NOW() - INTERVAL '1 hour'
      `;

      const result = await this.db.query(collaborationQuery, [whiteboardId]);
      const collaborationCount = parseInt(result.rows[0]?.collaboration_count || '0');

      if (collaborationCount > 50) {
        await this.createCollaborationInsight(whiteboardId, collaborationCount);
      }
    } catch (error) {
      this.logger.warn('Failed to check collaboration insights', { error, whiteboardId });
    }
  }

  private async createCollaborationInsight(whiteboardId: string, collaborationCount: number): Promise<void> {
    try {
      const insightId = randomUUID();
      const now = new Date().toISOString();
      const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

      const query = `
        INSERT INTO whiteboard_insights (
          id, whiteboard_id, insight_type, insight_category, title, description,
          severity_score, confidence_score, insight_data, recommendations,
          time_period, is_active, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        ON CONFLICT DO NOTHING
      `;

      await this.db.query(query, [
        insightId,
        whiteboardId,
        'collaboration_trend',
        'positive',
        'High Collaboration Activity',
        `This whiteboard has seen ${collaborationCount} collaboration events in the past hour, indicating very active teamwork.`,
        2.0,
        0.9,
        JSON.stringify({
          collaborationCount,
          timePeriod: 'last_hour',
        }),
        JSON.stringify([
          'Consider saving a snapshot of the current state',
          'Document key decisions made during this collaborative session',
          'Share insights with team members who missed the session',
        ]),
        JSON.stringify({ start: hourAgo, end: now }),
        true,
        now,
        now,
      ]);
    } catch (error) {
      this.logger.warn('Failed to create collaboration insight', { error, whiteboardId });
    }
  }

  private async updateRealTimeMetrics(whiteboardId: string): Promise<void> {
    // This would update real-time dashboard metrics
    // Implementation would depend on specific real-time requirements
  }

  private async handlePerformanceAlert(
    whiteboardId: string,
    metricData: z.infer<typeof PerformanceMetricSchema>
  ): Promise<void> {
    try {
      this.logger.warn('Performance threshold exceeded', {
        whiteboardId,
        metricType: metricData.type,
        value: metricData.value,
        threshold: metricData.threshold,
        unit: metricData.unit,
      });

      // Create performance insight
      await this.createPerformanceInsight(whiteboardId, {
        type: 'performance',
        action: 'threshold_exceeded',
        targetType: metricData.type,
        duration: metricData.value,
        metadata: {
          metricType: metricData.type,
          value: metricData.value,
          threshold: metricData.threshold,
          unit: metricData.unit,
        },
      });
    } catch (error) {
      this.logger.warn('Failed to handle performance alert', { error, whiteboardId });
    }
  }

  private async processSessionEndAsync(sessionAnalytics: WhiteboardSessionAnalytics): Promise<void> {
    try {
      // Calculate final collaboration score
      const collaborationScore = this.calculateCollaborationScore(sessionAnalytics);

      // Update session with final score
      await this.updateSessionAnalytics(sessionAnalytics.sessionId, {
        collaborationScore,
      });

      // Generate session insights
      await this.generateSessionInsights(sessionAnalytics);
    } catch (error) {
      this.logger.warn('Async session end processing failed', { error, sessionId: sessionAnalytics.sessionId });
    }
  }

  private calculateCollaborationScore(session: WhiteboardSessionAnalytics): number {
    let score = 0;

    // Base score from actions
    score += Math.min(session.totalActions / 10, 10); // Max 10 points for actions

    // Collaboration elements
    if (session.commentsCreated > 0) score += 5;
    if (session.elementsCreated > 0) score += 3;
    if (session.elementsModified > 0) score += 2;

    // Tool diversity
    score += Math.min(session.toolsUsed.length, 5);

    // Duration bonus
    if (session.durationMinutes && session.durationMinutes > 10) {
      score += 5;
    }

    return Math.min(score, 100);
  }

  private async generateSessionInsights(session: WhiteboardSessionAnalytics): Promise<void> {
    try {
      const insights: Array<{ type: string; category: string; title: string; description: string; severity: number }> = [];

      // High productivity session
      if (session.totalActions > 100) {
        insights.push({
          type: 'productivity_high',
          category: 'positive',
          title: 'Highly Productive Session',
          description: `User completed ${session.totalActions} actions in ${session.durationMinutes} minutes.`,
          severity: 3.0,
        });
      }

      // Long idle session
      if (session.durationMinutes && session.durationMinutes > 30 && session.totalActions < 5) {
        insights.push({
          type: 'idle_session',
          category: 'information',
          title: 'Long Idle Session Detected',
          description: 'User was connected for a long time with minimal activity.',
          severity: 4.0,
        });
      }

      // High error rate
      if (session.errorCount > 5) {
        insights.push({
          type: 'error_prone_session',
          category: 'warning',
          title: 'High Error Rate',
          description: `Session had ${session.errorCount} errors, which may indicate usability issues.`,
          severity: 7.0,
        });
      }

      // Create insights in database
      for (const insight of insights) {
        await this.createSessionInsight(session.whiteboardId, session.sessionId, insight);
      }
    } catch (error) {
      this.logger.warn('Failed to generate session insights', { error, sessionId: session.sessionId });
    }
  }

  private async createSessionInsight(
    whiteboardId: string,
    sessionId: string,
    insight: { type: string; category: string; title: string; description: string; severity: number }
  ): Promise<void> {
    try {
      const insightId = randomUUID();
      const now = new Date().toISOString();

      const query = `
        INSERT INTO whiteboard_insights (
          id, whiteboard_id, insight_type, insight_category, title, description,
          severity_score, confidence_score, insight_data, recommendations,
          time_period, is_active, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      `;

      await this.db.query(query, [
        insightId,
        whiteboardId,
        insight.type,
        insight.category,
        insight.title,
        insight.description,
        insight.severity,
        0.7,
        JSON.stringify({ sessionId }),
        JSON.stringify([]),
        JSON.stringify({ start: now, end: now }),
        true,
        now,
        now,
      ]);
    } catch (error) {
      this.logger.warn('Failed to create session insight', { error, whiteboardId, sessionId });
    }
  }


  private calculateTrends(trendData: Array<{ day: string; daily_users: string; daily_engagement: string }>): {
    userGrowth: number;
    engagementTrend: number;
    performanceTrend: number;
  } {
    if (trendData.length < 2) {
      return { userGrowth: 0, engagementTrend: 0, performanceTrend: 0 };
    }

    const firstDay = trendData[0];
    const lastDay = trendData[trendData.length - 1];

    const userGrowth = ((parseInt(lastDay.daily_users) - parseInt(firstDay.daily_users)) / parseInt(firstDay.daily_users)) * 100;
    const engagementTrend = ((parseFloat(lastDay.daily_engagement) - parseFloat(firstDay.daily_engagement)) / parseFloat(firstDay.daily_engagement)) * 100;

    return {
      userGrowth: isNaN(userGrowth) ? 0 : userGrowth,
      engagementTrend: isNaN(engagementTrend) ? 0 : engagementTrend,
      performanceTrend: 0, // Would need performance data
    };
  }

  private generateRecommendations(
    summary: Record<string, unknown>,
    trends: { userGrowth: number; engagementTrend: number; performanceTrend: number },
    insights: Array<Record<string, unknown>>
  ): string[] {
    const recommendations: string[] = [];

    // User growth recommendations
    if (trends.userGrowth < 0) {
      recommendations.push('User engagement is declining. Consider reviewing the whiteboard experience and gathering user feedback.');
    } else if (trends.userGrowth > 50) {
      recommendations.push('Excellent user growth! Consider documenting successful practices and scaling them to other whiteboards.');
    }

    // Engagement recommendations
    if (trends.engagementTrend < 0) {
      recommendations.push('Engagement is decreasing. Try introducing new interactive elements or collaboration features.');
    }

    // Performance recommendations
    if (parseFloat(summary.performance_score as string) < 70) {
      recommendations.push('Performance could be improved. Check for optimization opportunities and monitor system resources.');
    }

    // Insight-based recommendations
    const criticalInsights = insights.filter(insight => insight.insight_category === 'critical');
    if (criticalInsights.length > 0) {
      recommendations.push('Address critical issues identified in the insights section to maintain optimal whiteboard performance.');
    }

    // Default recommendations
    if (recommendations.length === 0) {
      recommendations.push('Continue monitoring analytics to identify optimization opportunities.');
      recommendations.push('Consider A/B testing new features to improve user engagement.');
    }

    return recommendations;
  }

  private camelToSnakeCase(str: string): string {
    return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
  }

  // Database row mapping methods

  private mapDatabaseRowToEvent(row: any): WhiteboardEvent {
    return {
      id: row.id,
      whiteboardId: row.whiteboard_id,
      userId: row.user_id,
      sessionId: row.session_id,
      eventType: row.event_type,
      action: row.action,
      targetType: row.target_type,
      targetId: row.target_id,
      eventData: this.parseJsonField(row.event_data),
      coordinates: this.parseJsonField(row.coordinates),
      durationMs: row.duration_ms,
      clientTimestamp: row.client_timestamp?.toISOString() || new Date().toISOString(),
      serverTimestamp: row.server_timestamp?.toISOString() || new Date().toISOString(),
      clientMetadata: this.parseJsonField(row.client_metadata),
    };
  }

  private mapDatabaseRowToSessionAnalytics(row: any): WhiteboardSessionAnalytics {
    return {
      id: row.id,
      sessionId: row.session_id,
      whiteboardId: row.whiteboard_id,
      userId: row.user_id,
      sessionStart: row.session_start?.toISOString() || new Date().toISOString(),
      sessionEnd: row.session_end?.toISOString(),
      durationMinutes: row.duration_minutes,
      totalActions: row.total_actions || 0,
      elementsCreated: row.elements_created || 0,
      elementsModified: row.elements_modified || 0,
      elementsDeleted: row.elements_deleted || 0,
      commentsCreated: row.comments_created || 0,
      toolsUsed: Array.isArray(row.tools_used) ? row.tools_used : [],
      collaborationScore: parseFloat(row.collaboration_score) || 0,
      activityHeatmap: this.parseJsonField(row.activity_heatmap),
      performanceMetrics: this.parseJsonField(row.performance_metrics),
      errorCount: row.error_count || 0,
      disconnectReason: row.disconnect_reason,
    };
  }

  private mapDatabaseRowToMetrics(row: any): WhiteboardMetrics {
    return {
      id: row.id,
      whiteboardId: row.whiteboard_id,
      metricDate: row.metric_date,
      totalSessions: row.total_sessions || 0,
      uniqueUsers: row.unique_users || 0,
      totalDurationMinutes: row.total_duration_minutes || 0,
      avgSessionDuration: parseFloat(row.avg_session_duration) || 0,
      totalActions: row.total_actions || 0,
      elementsCreated: row.elements_created || 0,
      elementsModified: row.elements_modified || 0,
      elementsDeleted: row.elements_deleted || 0,
      commentsCreated: row.comments_created || 0,
      concurrentUsersPeak: row.concurrent_users_peak || 0,
      collaborationEvents: row.collaboration_events || 0,
      conflictResolutions: row.conflict_resolutions || 0,
      templateApplications: row.template_applications || 0,
      performanceAvg: this.parseJsonField(row.performance_avg),
      errorRate: parseFloat(row.error_rate) || 0,
      toolUsageStats: this.parseJsonField(row.tool_usage_stats),
      activityPatterns: this.parseJsonField(row.activity_patterns),
    };
  }

  private mapDatabaseRowToInsight(row: any): WhiteboardInsight {
    return {
      id: row.id,
      whiteboardId: row.whiteboard_id,
      insightType: row.insight_type,
      insightCategory: row.insight_category,
      title: row.title,
      description: row.description,
      severityScore: parseFloat(row.severity_score) || 0,
      confidenceScore: parseFloat(row.confidence_score) || 0,
      insightData: this.parseJsonField(row.insight_data),
      recommendations: Array.isArray(row.recommendations) ? row.recommendations : 
        this.parseJsonField(row.recommendations) || [],
      timePeriod: this.parseJsonField(row.time_period) || { start: '', end: '' },
      isActive: row.is_active,
      resolvedAt: row.resolved_at?.toISOString(),
      resolvedBy: row.resolved_by,
      createdAt: row.created_at?.toISOString() || new Date().toISOString(),
    };
  }

  private mapDatabaseRowToUserBehavior(row: any): UserBehaviorPattern {
    return {
      id: row.id,
      userId: row.user_id,
      whiteboardId: row.whiteboard_id,
      date: row.date,
      sessionCount: row.session_count || 0,
      totalTimeMinutes: row.total_time_minutes || 0,
      preferredTools: Array.isArray(row.preferred_tools) ? row.preferred_tools : [],
      interactionPatterns: this.parseJsonField(row.interaction_patterns),
      collaborationStyle: row.collaboration_style,
      engagementScore: parseFloat(row.engagement_score) || 0,
      productivityScore: parseFloat(row.productivity_score) || 0,
      featureAdoption: this.parseJsonField(row.feature_adoption),
    };
  }

  private mapDatabaseRowToPerformanceMetric(row: any): PerformanceMetric {
    return {
      id: row.id,
      whiteboardId: row.whiteboard_id,
      sessionId: row.session_id,
      metricType: row.metric_type,
      metricValue: parseFloat(row.metric_value) || 0,
      metricUnit: row.metric_unit,
      thresholdValue: row.threshold_value ? parseFloat(row.threshold_value) : undefined,
      isAboveThreshold: row.is_above_threshold || false,
      userAgent: row.user_agent,
      deviceInfo: this.parseJsonField(row.device_info),
      networkInfo: this.parseJsonField(row.network_info),
      contextData: this.parseJsonField(row.context_data),
      recordedAt: row.recorded_at?.toISOString() || new Date().toISOString(),
    };
  }

  private parseJsonField(field: any): any {
    if (!field) return {};
    
    try {
      return typeof field === 'string' ? JSON.parse(field) : field;
    } catch (error) {
      this.logger.warn('Failed to parse JSON field', { field, error });
      return {};
    }
  }

  private createAnalyticsError(code: string, message: string, details?: unknown): AnalyticsError {
    const error = new Error(message) as AnalyticsError;
    error.code = code;
    if (details) {
      error.details = typeof details === 'object' ? details as Record<string, unknown> : { details };
    }
    return error;
  }
}