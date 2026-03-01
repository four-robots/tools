import { Pool } from 'pg';
import { 
  TimeRange, 
  EventSourcingError
} from '../../shared/types/event-sourcing';
import { COLLABORATION_EVENT_TYPES } from '../../shared/types/collaboration-events';
import { EventStore } from './event-store-service';
import { logger } from '../../utils/logger';

export interface CollaborationMetrics {
  timeRange: TimeRange;
  sessions: {
    total: number;
    active: number;
    completed: number;
    averageDuration: number;
    participantDistribution: Record<number, number>; // participant count -> session count
    typeDistribution: Record<string, number>;
  };
  participants: {
    unique: number;
    averageSessionsPerUser: number;
    mostActiveUsers: Array<{
      userId: string;
      sessionCount: number;
      totalEvents: number;
      averageSessionDuration: number;
    }>;
  };
  events: {
    total: number;
    byType: Record<string, number>;
    byHour: Array<{ hour: number; count: number }>;
    averagePerSession: number;
    peakActivity: {
      timestamp: Date;
      eventCount: number;
      period: string;
    };
  };
  conflicts: {
    total: number;
    resolved: number;
    escalated: number;
    averageResolutionTime: number;
    resolutionRate: number;
    byType: Record<string, number>;
    bySeverity: Record<string, number>;
    topResolvers: Array<{
      userId: string;
      resolved: number;
      averageTime: number;
      successRate: number;
    }>;
  };
  search: {
    totalQueries: number;
    uniqueQueries: number;
    collaborativeQueries: number;
    averageQueryLength: number;
    mostCommonTerms: Array<{ term: string; frequency: number }>;
    queryEvolutionPatterns: Array<{
      pattern: string;
      frequency: number;
      averageIterations: number;
    }>;
  };
  annotations: {
    total: number;
    resolved: number;
    resolutionRate: number;
    averageResolutionTime: number;
    byType: Record<string, number>;
    byPriority: Record<string, number>;
    mostActiveAnnotators: Array<{
      userId: string;
      count: number;
      resolutionRate: number;
    }>;
  };
}

export interface EngagementPattern {
  userId: string;
  timeRange: TimeRange;
  engagementLevel: 'low' | 'medium' | 'high';
  activityPatterns: {
    dailyActivity: Array<{ date: string; eventCount: number; sessionCount: number }>;
    hourlyDistribution: Array<{ hour: number; activity: number }>;
    weekdayDistribution: Array<{ day: string; activity: number }>;
    peakHours: number[];
  };
  collaborationStyle: {
    initiatesConversations: number;
    respondsToOthers: number;
    leadsConflictResolution: number;
    participatesInGroupWork: number;
    preferredSessionTypes: string[];
    collaborationRating: number; // 0-100
  };
  behaviorTrends: {
    sessionFrequencyTrend: 'increasing' | 'decreasing' | 'stable';
    engagementDepthTrend: 'increasing' | 'decreasing' | 'stable';
    collaborationTrend: 'increasing' | 'decreasing' | 'stable';
  };
  insights: Array<{
    type: 'strength' | 'opportunity' | 'concern';
    description: string;
    recommendation: string;
    confidence: number;
  }>;
}

export interface ConflictTrends {
  timeRange: TimeRange;
  overview: {
    totalConflicts: number;
    resolutionRate: number;
    averageResolutionTime: number;
    escalationRate: number;
  };
  trends: {
    conflictFrequency: Array<{
      period: string;
      conflicts: number;
      resolutions: number;
      rate: number;
    }>;
    resolutionTimetrend: Array<{
      period: string;
      averageTime: number;
      median: number;
      percentile90: number;
    }>;
    severityTrends: Array<{
      period: string;
      low: number;
      medium: number;
      high: number;
      critical: number;
    }>;
  };
  patterns: {
    commonTriggers: Array<{
      trigger: string;
      frequency: number;
      typicalSeverity: string;
      averageResolutionTime: number;
    }>;
    resolutionStrategies: Array<{
      strategy: string;
      usage: number;
      successRate: number;
      averageTime: number;
    }>;
    userBehaviorPatterns: Array<{
      pattern: string;
      description: string;
      frequency: number;
      impact: 'positive' | 'neutral' | 'negative';
    }>;
  };
  predictions: Array<{
    metric: string;
    predicted: number;
    confidence: number;
    timeframe: string;
    factors: string[];
  }>;
}

export interface SessionInsights {
  sessionId: string;
  overview: {
    duration: number;
    participantCount: number;
    eventCount: number;
    conflictCount: number;
    resolutionCount: number;
  };
  participantAnalysis: Array<{
    userId: string;
    contribution: 'leader' | 'active' | 'moderate' | 'minimal';
    eventCount: number;
    engagementScore: number;
    collaborationStyle: string;
    keyContributions: string[];
  }>;
  collaborationQuality: {
    score: number; // 0-100
    factors: {
      communication: number;
      conflictManagement: number;
      productivitye: number;
      inclusion: number;
    };
    strengths: string[];
    improvements: string[];
  };
  temporalAnalysis: {
    phasees: Array<{
      phase: string;
      startTime: Date;
      endTime: Date;
      description: string;
      keyEvents: string[];
      participantActivity: Record<string, number>;
    }>;
    momentumChanges: Array<{
      timestamp: Date;
      change: 'acceleration' | 'deceleration' | 'plateau';
      cause: string;
      impact: number;
    }>;
  };
  outcomes: {
    achieved: string[];
    partiallyAchieved: string[];
    notAchieved: string[];
    unexpectedOutcomes: string[];
  };
  recommendations: Array<{
    category: 'process' | 'tooling' | 'team' | 'facilitation';
    recommendation: string;
    rationale: string;
    priority: 'low' | 'medium' | 'high';
  }>;
}

export class TemporalAnalyticsService {
  constructor(
    private readonly eventStore: EventStore,
    private readonly pool: Pool
  ) {}

  async getCollaborationMetrics(timeRange: TimeRange): Promise<CollaborationMetrics> {
    try {
      logger.info('Generating collaboration metrics', { timeRange });

      const [
        sessionMetrics,
        participantMetrics,
        eventMetrics,
        conflictMetrics,
        searchMetrics,
        annotationMetrics
      ] = await Promise.all([
        this.calculateSessionMetrics(timeRange),
        this.calculateParticipantMetrics(timeRange),
        this.calculateEventMetrics(timeRange),
        this.calculateConflictMetrics(timeRange),
        this.calculateSearchMetrics(timeRange),
        this.calculateAnnotationMetrics(timeRange)
      ]);

      const metrics: CollaborationMetrics = {
        timeRange,
        sessions: sessionMetrics,
        participants: participantMetrics,
        events: eventMetrics,
        conflicts: conflictMetrics,
        search: searchMetrics,
        annotations: annotationMetrics
      };

      logger.info('Collaboration metrics generated successfully', {
        timeRange,
        sessionCount: sessionMetrics.total,
        participantCount: participantMetrics.unique,
        eventCount: eventMetrics.total
      });

      return metrics;

    } catch (error) {
      logger.error('Failed to generate collaboration metrics', {
        timeRange,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  async getUserEngagementPatterns(userId: string, timeRange: TimeRange): Promise<EngagementPattern> {
    try {
      logger.info('Analyzing user engagement patterns', { userId, timeRange });

      const [
        activityData,
        collaborationData,
        behaviorData
      ] = await Promise.all([
        this.calculateUserActivity(userId, timeRange),
        this.calculateCollaborationStyle(userId, timeRange),
        this.analyzeBehaviorTrends(userId, timeRange)
      ]);

      // Determine engagement level
      const totalEvents = activityData.dailyActivity.reduce((sum, day) => sum + day.eventCount, 0);
      const sessionCount = activityData.dailyActivity.reduce((sum, day) => sum + day.sessionCount, 0);
      const avgEventsPerSession = sessionCount > 0 ? totalEvents / sessionCount : 0;

      let engagementLevel: 'low' | 'medium' | 'high' = 'low';
      if (avgEventsPerSession > 50 && sessionCount > 10) {
        engagementLevel = 'high';
      } else if (avgEventsPerSession > 20 && sessionCount > 5) {
        engagementLevel = 'medium';
      }

      // Generate insights
      const insights = this.generateEngagementInsights(
        activityData,
        collaborationData,
        behaviorData,
        engagementLevel
      );

      const pattern: EngagementPattern = {
        userId,
        timeRange,
        engagementLevel,
        activityPatterns: activityData,
        collaborationStyle: collaborationData,
        behaviorTrends: behaviorData,
        insights
      };

      return pattern;

    } catch (error) {
      logger.error('Failed to analyze user engagement patterns', {
        userId,
        timeRange,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  async getConflictResolutionTrends(timeRange: TimeRange): Promise<ConflictTrends> {
    try {
      logger.info('Analyzing conflict resolution trends', { timeRange });

      const client = await this.pool.connect();

      try {
        // Get conflict overview
        const overviewQuery = `
          SELECT 
            COUNT(*) as total_conflicts,
            COUNT(CASE WHEN status = 'resolved' THEN 1 END) as resolved_conflicts,
            COUNT(CASE WHEN status = 'escalated' THEN 1 END) as escalated_conflicts,
            AVG(EXTRACT(EPOCH FROM (resolved_at - detected_at)) * 1000) as avg_resolution_time
          FROM conflict_instances 
          WHERE detected_at BETWEEN $1 AND $2
        `;

        const overviewResult = await client.query(overviewQuery, [timeRange.start, timeRange.end]);
        const overview = overviewResult.rows[0];

        // Get conflict frequency trends (by week)
        const frequencyQuery = `
          SELECT 
            DATE_TRUNC('week', detected_at) as period,
            COUNT(*) as conflicts,
            COUNT(CASE WHEN status = 'resolved' THEN 1 END) as resolutions,
            CASE 
              WHEN COUNT(*) > 0 
              THEN COUNT(CASE WHEN status = 'resolved' THEN 1 END)::float / COUNT(*)::float 
              ELSE 0 
            END as rate
          FROM conflict_instances 
          WHERE detected_at BETWEEN $1 AND $2
          GROUP BY DATE_TRUNC('week', detected_at)
          ORDER BY period
        `;

        const frequencyResult = await client.query(frequencyQuery, [timeRange.start, timeRange.end]);

        // Get resolution time trends
        const resolutionTimeQuery = `
          SELECT 
            DATE_TRUNC('week', resolved_at) as period,
            AVG(EXTRACT(EPOCH FROM (resolved_at - detected_at)) * 1000) as average_time,
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (resolved_at - detected_at)) * 1000) as median,
            PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (resolved_at - detected_at)) * 1000) as percentile90
          FROM conflict_instances 
          WHERE resolved_at BETWEEN $1 AND $2
          GROUP BY DATE_TRUNC('week', resolved_at)
          ORDER BY period
        `;

        const resolutionTimeResult = await client.query(resolutionTimeQuery, [timeRange.start, timeRange.end]);

        // Get severity trends
        const severityQuery = `
          SELECT 
            DATE_TRUNC('week', detected_at) as period,
            COUNT(CASE WHEN severity = 'low' THEN 1 END) as low,
            COUNT(CASE WHEN severity = 'medium' THEN 1 END) as medium,
            COUNT(CASE WHEN severity = 'high' THEN 1 END) as high,
            COUNT(CASE WHEN severity = 'critical' THEN 1 END) as critical
          FROM conflict_instances 
          WHERE detected_at BETWEEN $1 AND $2
          GROUP BY DATE_TRUNC('week', detected_at)
          ORDER BY period
        `;

        const severityResult = await client.query(severityQuery, [timeRange.start, timeRange.end]);

        // Analyze patterns (this would be more sophisticated in a real implementation)
        const patterns = await this.analyzeConflictPatterns(timeRange, client);
        const predictions = await this.generateConflictPredictions(timeRange, client);

        const trends: ConflictTrends = {
          timeRange,
          overview: {
            totalConflicts: parseInt(overview.total_conflicts),
            resolutionRate: parseInt(overview.total_conflicts) > 0
              ? parseInt(overview.resolved_conflicts) / parseInt(overview.total_conflicts)
              : 0,
            averageResolutionTime: parseFloat(overview.avg_resolution_time) || 0,
            escalationRate: parseInt(overview.total_conflicts) > 0
              ? parseInt(overview.escalated_conflicts) / parseInt(overview.total_conflicts)
              : 0
          },
          trends: {
            conflictFrequency: frequencyResult.rows.map(row => ({
              period: row.period.toISOString(),
              conflicts: parseInt(row.conflicts),
              resolutions: parseInt(row.resolutions),
              rate: parseFloat(row.rate)
            })),
            resolutionTimetrend: resolutionTimeResult.rows.map(row => ({
              period: row.period.toISOString(),
              averageTime: parseFloat(row.average_time),
              median: parseFloat(row.median),
              percentile90: parseFloat(row.percentile90)
            })),
            severityTrends: severityResult.rows.map(row => ({
              period: row.period.toISOString(),
              low: parseInt(row.low),
              medium: parseInt(row.medium),
              high: parseInt(row.high),
              critical: parseInt(row.critical)
            }))
          },
          patterns,
          predictions
        };

        return trends;

      } finally {
        client.release();
      }

    } catch (error) {
      logger.error('Failed to analyze conflict resolution trends', {
        timeRange,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  async generateSessionInsights(sessionId: string): Promise<SessionInsights> {
    try {
      logger.info('Generating session insights', { sessionId });

      const client = await this.pool.connect();

      try {
        // Get session overview
        const overviewQuery = `
          SELECT 
            s.session_id,
            s.session_type,
            s.status,
            s.created_at,
            s.updated_at,
            s.ended_at,
            COUNT(DISTINCT p.user_id) as participant_count,
            COUNT(DISTINCT c.conflict_id) as conflict_count,
            COUNT(DISTINCT CASE WHEN c.status = 'resolved' THEN c.conflict_id END) as resolution_count
          FROM collaboration_sessions s
          LEFT JOIN collaboration_participants p ON p.session_id = s.session_id
          LEFT JOIN conflict_instances c ON c.session_id = s.session_id
          WHERE s.session_id = $1
          GROUP BY s.session_id, s.session_type, s.status, s.created_at, s.updated_at, s.ended_at
        `;

        const overviewResult = await client.query(overviewQuery, [sessionId]);
        if (overviewResult.rows.length === 0) {
          throw new EventSourcingError(`Session not found: ${sessionId}`, 'SESSION_NOT_FOUND', { sessionId });
        }

        const sessionData = overviewResult.rows[0];

        // Get event count for session
        const eventCountQuery = `
          SELECT COUNT(*) as event_count
          FROM events 
          WHERE (metadata->>'sessionId')::uuid = $1
        `;

        const eventCountResult = await client.query(eventCountQuery, [sessionId]);
        const eventCount = parseInt(eventCountResult.rows[0]?.event_count || '0');

        // Calculate duration
        const duration = sessionData.ended_at 
          ? sessionData.ended_at.getTime() - sessionData.created_at.getTime()
          : Date.now() - sessionData.created_at.getTime();

        // Get participant analysis
        const participantAnalysis = await this.analyzeSessionParticipants(sessionId, client);
        
        // Analyze collaboration quality
        const collaborationQuality = await this.analyzeCollaborationQuality(sessionId, participantAnalysis);
        
        // Perform temporal analysis
        const temporalAnalysis = await this.analyzeSessionTemporal(sessionId, sessionData.created_at, sessionData.ended_at);
        
        // Determine outcomes (this would be more sophisticated in practice)
        const outcomes = {
          achieved: ['Collaborative session completed'],
          partiallyAchieved: [],
          notAchieved: [],
          unexpectedOutcomes: []
        };

        // Generate recommendations
        const recommendations = this.generateSessionRecommendations(
          participantAnalysis,
          collaborationQuality,
          temporalAnalysis,
          {
            duration,
            eventCount,
            conflictCount: parseInt(sessionData.conflict_count),
            participantCount: parseInt(sessionData.participant_count)
          }
        );

        const insights: SessionInsights = {
          sessionId,
          overview: {
            duration,
            participantCount: parseInt(sessionData.participant_count),
            eventCount,
            conflictCount: parseInt(sessionData.conflict_count),
            resolutionCount: parseInt(sessionData.resolution_count)
          },
          participantAnalysis,
          collaborationQuality,
          temporalAnalysis,
          outcomes,
          recommendations
        };

        return insights;

      } finally {
        client.release();
      }

    } catch (error) {
      logger.error('Failed to generate session insights', {
        sessionId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  private async calculateSessionMetrics(timeRange: TimeRange) {
    const client = await this.pool.connect();
    
    try {
      const query = `
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN status = 'active' THEN 1 END) as active,
          COUNT(CASE WHEN status = 'ended' THEN 1 END) as completed,
          AVG(CASE 
            WHEN ended_at IS NOT NULL 
            THEN EXTRACT(EPOCH FROM (ended_at - created_at)) * 1000
            ELSE NULL 
          END) as avg_duration,
          session_type,
          COUNT(*) as type_count
        FROM collaboration_sessions 
        WHERE created_at BETWEEN $1 AND $2
        GROUP BY session_type
      `;

      const result = await client.query(query, [timeRange.start, timeRange.end]);
      
      let total = 0;
      let active = 0;
      let completed = 0;
      let avgDuration = 0;
      const typeDistribution: Record<string, number> = {};

      for (const row of result.rows) {
        total += parseInt(row.total);
        active += parseInt(row.active);
        completed += parseInt(row.completed);
        avgDuration += parseFloat(row.avg_duration || '0') * parseInt(row.type_count);
        typeDistribution[row.session_type] = parseInt(row.type_count);
      }

      avgDuration = total > 0 ? avgDuration / total : 0;

      // Get participant distribution
      const participantQuery = `
        SELECT 
          participant_count,
          COUNT(*) as session_count
        FROM (
          SELECT 
            s.session_id,
            COUNT(p.user_id) as participant_count
          FROM collaboration_sessions s
          LEFT JOIN collaboration_participants p ON p.session_id = s.session_id
          WHERE s.created_at BETWEEN $1 AND $2
          GROUP BY s.session_id
        ) participant_counts
        GROUP BY participant_count
        ORDER BY participant_count
      `;

      const participantResult = await client.query(participantQuery, [timeRange.start, timeRange.end]);
      const participantDistribution: Record<number, number> = {};
      
      for (const row of participantResult.rows) {
        participantDistribution[parseInt(row.participant_count)] = parseInt(row.session_count);
      }

      return {
        total,
        active,
        completed,
        averageDuration: avgDuration,
        participantDistribution,
        typeDistribution
      };

    } finally {
      client.release();
    }
  }

  private async calculateParticipantMetrics(timeRange: TimeRange) {
    const client = await this.pool.connect();
    
    try {
      const query = `
        SELECT 
          COUNT(DISTINCT user_id) as unique_participants,
          AVG(sessions_per_user) as avg_sessions_per_user
        FROM (
          SELECT 
            user_id,
            COUNT(DISTINCT session_id) as sessions_per_user
          FROM collaboration_participants p
          JOIN collaboration_sessions s ON s.session_id = p.session_id
          WHERE s.created_at BETWEEN $1 AND $2
          GROUP BY user_id
        ) user_sessions
      `;

      const result = await client.query(query, [timeRange.start, timeRange.end]);
      const row = result.rows[0];

      // Get most active users
      const activeUsersQuery = `
        SELECT 
          p.user_id,
          COUNT(DISTINCT p.session_id) as session_count,
          COUNT(e.id) as total_events,
          AVG(CASE 
            WHEN s.ended_at IS NOT NULL 
            THEN EXTRACT(EPOCH FROM (s.ended_at - s.created_at)) * 1000
            ELSE NULL 
          END) as avg_session_duration
        FROM collaboration_participants p
        JOIN collaboration_sessions s ON s.session_id = p.session_id
        LEFT JOIN events e ON (e.metadata->>'userId')::uuid = p.user_id 
          AND e.timestamp BETWEEN $1 AND $2
        WHERE s.created_at BETWEEN $1 AND $2
        GROUP BY p.user_id
        ORDER BY session_count DESC, total_events DESC
        LIMIT 10
      `;

      const activeUsersResult = await client.query(activeUsersQuery, [timeRange.start, timeRange.end]);

      return {
        unique: parseInt(row.unique_participants || '0'),
        averageSessionsPerUser: parseFloat(row.avg_sessions_per_user || '0'),
        mostActiveUsers: activeUsersResult.rows.map(userRow => ({
          userId: userRow.user_id,
          sessionCount: parseInt(userRow.session_count),
          totalEvents: parseInt(userRow.total_events || '0'),
          averageSessionDuration: parseFloat(userRow.avg_session_duration || '0')
        }))
      };

    } finally {
      client.release();
    }
  }

  private async calculateEventMetrics(timeRange: TimeRange) {
    const client = await this.pool.connect();
    
    try {
      // Get event counts by type
      const typeQuery = `
        SELECT 
          event_type,
          COUNT(*) as count
        FROM events 
        WHERE timestamp BETWEEN $1 AND $2
        GROUP BY event_type
      `;

      const typeResult = await client.query(typeQuery, [timeRange.start, timeRange.end]);
      const byType: Record<string, number> = {};
      let total = 0;

      for (const row of typeResult.rows) {
        byType[row.event_type] = parseInt(row.count);
        total += parseInt(row.count);
      }

      // Get hourly distribution
      const hourlyQuery = `
        SELECT 
          EXTRACT(HOUR FROM timestamp) as hour,
          COUNT(*) as count
        FROM events 
        WHERE timestamp BETWEEN $1 AND $2
        GROUP BY EXTRACT(HOUR FROM timestamp)
        ORDER BY hour
      `;

      const hourlyResult = await client.query(hourlyQuery, [timeRange.start, timeRange.end]);
      const byHour = hourlyResult.rows.map(row => ({
        hour: parseInt(row.hour),
        count: parseInt(row.count)
      }));

      // Find peak activity
      const peakQuery = `
        SELECT 
          DATE_TRUNC('hour', timestamp) as hour_period,
          COUNT(*) as event_count
        FROM events 
        WHERE timestamp BETWEEN $1 AND $2
        GROUP BY DATE_TRUNC('hour', timestamp)
        ORDER BY event_count DESC
        LIMIT 1
      `;

      const peakResult = await client.query(peakQuery, [timeRange.start, timeRange.end]);
      const peakActivity = peakResult.rows[0] ? {
        timestamp: peakResult.rows[0].hour_period,
        eventCount: parseInt(peakResult.rows[0].event_count),
        period: 'hour'
      } : {
        timestamp: new Date(),
        eventCount: 0,
        period: 'hour'
      };

      // Get average per session
      const sessionCountQuery = `
        SELECT COUNT(*) as session_count
        FROM collaboration_sessions
        WHERE created_at BETWEEN $1 AND $2
      `;

      const sessionCountResult = await client.query(sessionCountQuery, [timeRange.start, timeRange.end]);
      const sessionCount = parseInt(sessionCountResult.rows[0]?.session_count || '1');
      const averagePerSession = total / sessionCount;

      return {
        total,
        byType,
        byHour,
        averagePerSession,
        peakActivity
      };

    } finally {
      client.release();
    }
  }

  private async calculateConflictMetrics(timeRange: TimeRange) {
    const client = await this.pool.connect();
    
    try {
      const query = `
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN status = 'resolved' THEN 1 END) as resolved,
          COUNT(CASE WHEN status = 'escalated' THEN 1 END) as escalated,
          AVG(CASE 
            WHEN resolved_at IS NOT NULL 
            THEN EXTRACT(EPOCH FROM (resolved_at - detected_at)) * 1000
            ELSE NULL 
          END) as avg_resolution_time,
          conflict_type,
          severity,
          COUNT(*) as type_count
        FROM conflict_instances 
        WHERE detected_at BETWEEN $1 AND $2
        GROUP BY conflict_type, severity
      `;

      const result = await client.query(query, [timeRange.start, timeRange.end]);
      
      let total = 0;
      let resolved = 0;
      let escalated = 0;
      let totalResolutionTime = 0;
      let resolvedCount = 0;
      const byType: Record<string, number> = {};
      const bySeverity: Record<string, number> = {};

      for (const row of result.rows) {
        const count = parseInt(row.type_count);
        total += count;
        resolved += parseInt(row.resolved);
        escalated += parseInt(row.escalated);
        
        if (row.avg_resolution_time) {
          totalResolutionTime += parseFloat(row.avg_resolution_time) * parseInt(row.resolved);
          resolvedCount += parseInt(row.resolved);
        }

        byType[row.conflict_type] = (byType[row.conflict_type] || 0) + count;
        bySeverity[row.severity] = (bySeverity[row.severity] || 0) + count;
      }

      const averageResolutionTime = resolvedCount > 0 ? totalResolutionTime / resolvedCount : 0;
      const resolutionRate = total > 0 ? resolved / total : 0;

      // Get top resolvers
      const resolversQuery = `
        SELECT 
          resolved_by as user_id,
          COUNT(*) as resolved,
          AVG(EXTRACT(EPOCH FROM (resolved_at - detected_at)) * 1000) as avg_time,
          COUNT(*)::float / (
            SELECT COUNT(*) 
            FROM conflict_instances 
            WHERE resolved_by = c.resolved_by 
            AND detected_at BETWEEN $1 AND $2
          ) as success_rate
        FROM conflict_instances c
        WHERE resolved_at BETWEEN $1 AND $2
        AND resolved_by IS NOT NULL
        GROUP BY resolved_by
        ORDER BY resolved DESC
        LIMIT 5
      `;

      const resolversResult = await client.query(resolversQuery, [timeRange.start, timeRange.end]);
      const topResolvers = resolversResult.rows.map(row => ({
        userId: row.user_id,
        resolved: parseInt(row.resolved),
        averageTime: parseFloat(row.avg_time),
        successRate: parseFloat(row.success_rate)
      }));

      return {
        total,
        resolved,
        escalated,
        averageResolutionTime,
        resolutionRate,
        byType,
        bySeverity,
        topResolvers
      };

    } finally {
      client.release();
    }
  }

  private async calculateSearchMetrics(timeRange: TimeRange) {
    // This would analyze search collaboration events
    // For now, return placeholder data
    return {
      totalQueries: 0,
      uniqueQueries: 0,
      collaborativeQueries: 0,
      averageQueryLength: 0,
      mostCommonTerms: [],
      queryEvolutionPatterns: []
    };
  }

  private async calculateAnnotationMetrics(timeRange: TimeRange) {
    const client = await this.pool.connect();
    
    try {
      const query = `
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN status = 'resolved' THEN 1 END) as resolved,
          AVG(CASE 
            WHEN resolved_at IS NOT NULL 
            THEN EXTRACT(EPOCH FROM (resolved_at - created_at)) * 1000
            ELSE NULL 
          END) as avg_resolution_time,
          annotation_type,
          priority,
          COUNT(*) as count
        FROM annotation_instances 
        WHERE created_at BETWEEN $1 AND $2
        GROUP BY annotation_type, priority
      `;

      const result = await client.query(query, [timeRange.start, timeRange.end]);
      
      let total = 0;
      let resolved = 0;
      let totalResolutionTime = 0;
      let resolvedCount = 0;
      const byType: Record<string, number> = {};
      const byPriority: Record<string, number> = {};

      for (const row of result.rows) {
        const count = parseInt(row.count);
        total += count;
        resolved += parseInt(row.resolved);
        
        if (row.avg_resolution_time) {
          totalResolutionTime += parseFloat(row.avg_resolution_time) * parseInt(row.resolved);
          resolvedCount += parseInt(row.resolved);
        }

        byType[row.annotation_type] = (byType[row.annotation_type] || 0) + count;
        byPriority[row.priority] = (byPriority[row.priority] || 0) + count;
      }

      const averageResolutionTime = resolvedCount > 0 ? totalResolutionTime / resolvedCount : 0;
      const resolutionRate = total > 0 ? resolved / total : 0;

      // Get most active annotators
      const annotatorsQuery = `
        SELECT 
          user_id,
          COUNT(*) as count,
          COUNT(CASE WHEN status = 'resolved' THEN 1 END)::float / COUNT(*)::float as resolution_rate
        FROM annotation_instances 
        WHERE created_at BETWEEN $1 AND $2
        GROUP BY user_id
        ORDER BY count DESC
        LIMIT 5
      `;

      const annotatorsResult = await client.query(annotatorsQuery, [timeRange.start, timeRange.end]);
      const mostActiveAnnotators = annotatorsResult.rows.map(row => ({
        userId: row.user_id,
        count: parseInt(row.count),
        resolutionRate: parseFloat(row.resolution_rate)
      }));

      return {
        total,
        resolved,
        resolutionRate,
        averageResolutionTime,
        byType,
        byPriority,
        mostActiveAnnotators
      };

    } finally {
      client.release();
    }
  }

  private async calculateUserActivity(userId: string, timeRange: TimeRange) {
    const client = await this.pool.connect();
    
    try {
      // Daily activity
      const dailyQuery = `
        SELECT 
          DATE(timestamp) as date,
          COUNT(*) as event_count,
          COUNT(DISTINCT (metadata->>'sessionId')) as session_count
        FROM events
        WHERE (metadata->>'userId')::uuid = $1
        AND timestamp BETWEEN $2 AND $3
        GROUP BY DATE(timestamp)
        ORDER BY date
      `;

      const dailyResult = await client.query(dailyQuery, [userId, timeRange.start, timeRange.end]);
      const dailyActivity = dailyResult.rows.map(row => ({
        date: row.date.toISOString().split('T')[0],
        eventCount: parseInt(row.event_count),
        sessionCount: parseInt(row.session_count)
      }));

      // Hourly distribution
      const hourlyQuery = `
        SELECT 
          EXTRACT(HOUR FROM timestamp) as hour,
          COUNT(*) as activity
        FROM events
        WHERE (metadata->>'userId')::uuid = $1
        AND timestamp BETWEEN $2 AND $3
        GROUP BY EXTRACT(HOUR FROM timestamp)
        ORDER BY hour
      `;

      const hourlyResult = await client.query(hourlyQuery, [userId, timeRange.start, timeRange.end]);
      const hourlyDistribution = hourlyResult.rows.map(row => ({
        hour: parseInt(row.hour),
        activity: parseInt(row.activity)
      }));

      // Weekday distribution
      const weekdayQuery = `
        SELECT 
          TO_CHAR(timestamp, 'Day') as day,
          COUNT(*) as activity
        FROM events
        WHERE (metadata->>'userId')::uuid = $1
        AND timestamp BETWEEN $2 AND $3
        GROUP BY TO_CHAR(timestamp, 'Day')
        ORDER BY activity DESC
      `;

      const weekdayResult = await client.query(weekdayQuery, [userId, timeRange.start, timeRange.end]);
      const weekdayDistribution = weekdayResult.rows.map(row => ({
        day: row.day.trim(),
        activity: parseInt(row.activity)
      }));

      // Peak hours (hours with above-average activity)
      const avgHourlyActivity = hourlyDistribution.length > 0 
        ? hourlyDistribution.reduce((sum, h) => sum + h.activity, 0) / hourlyDistribution.length
        : 0;
      
      const peakHours = hourlyDistribution
        .filter(h => h.activity > avgHourlyActivity)
        .map(h => h.hour);

      return {
        dailyActivity,
        hourlyDistribution,
        weekdayDistribution,
        peakHours
      };

    } finally {
      client.release();
    }
  }

  private async calculateCollaborationStyle(userId: string, timeRange: TimeRange) {
    // This would analyze collaboration patterns from events
    // For now, return placeholder data
    return {
      initiatesConversations: 0,
      respondsToOthers: 0,
      leadsConflictResolution: 0,
      participatesInGroupWork: 0,
      preferredSessionTypes: ['search'],
      collaborationRating: 75
    };
  }

  private async analyzeBehaviorTrends(userId: string, timeRange: TimeRange) {
    // This would analyze behavior trends over time
    // For now, return placeholder data
    return {
      sessionFrequencyTrend: 'stable' as const,
      engagementDepthTrend: 'increasing' as const,
      collaborationTrend: 'stable' as const
    };
  }

  private generateEngagementInsights(activityData: any, collaborationData: any, behaviorData: any, engagementLevel: string) {
    const insights = [];

    if (engagementLevel === 'high') {
      insights.push({
        type: 'strength' as const,
        description: 'Highly engaged user with consistent participation',
        recommendation: 'Consider peer mentoring opportunities',
        confidence: 0.9
      });
    }

    if (activityData.peakHours.length > 0) {
      insights.push({
        type: 'opportunity' as const,
        description: `Most active during hours: ${activityData.peakHours.join(', ')}`,
        recommendation: 'Schedule important collaborations during peak hours',
        confidence: 0.8
      });
    }

    return insights;
  }

  private async analyzeConflictPatterns(timeRange: TimeRange, client: any) {
    // Placeholder implementation
    return {
      commonTriggers: [],
      resolutionStrategies: [],
      userBehaviorPatterns: []
    };
  }

  private async generateConflictPredictions(timeRange: TimeRange, client: any) {
    // Placeholder implementation  
    return [];
  }

  private async analyzeSessionParticipants(sessionId: string, client: any) {
    // Placeholder implementation
    return [];
  }

  private async analyzeCollaborationQuality(sessionId: string, participantAnalysis: any) {
    // Placeholder implementation
    return {
      score: 80,
      factors: {
        communication: 85,
        conflictManagement: 75,
        productivitye: 80,
        inclusion: 85
      },
      strengths: ['Good communication'],
      improvements: ['Faster conflict resolution']
    };
  }

  private async analyzeSessionTemporal(sessionId: string, startTime: Date, endTime?: Date) {
    // Placeholder implementation
    return {
      phasees: [],
      momentumChanges: []
    };
  }

  private generateSessionRecommendations(participantAnalysis: any, collaborationQuality: any, temporalAnalysis: any, overview: any) {
    // Placeholder implementation
    return [
      {
        category: 'process' as const,
        recommendation: 'Establish clear session goals at the beginning',
        rationale: 'Would help maintain focus throughout the session',
        priority: 'medium' as const
      }
    ];
  }
}