/**
 * MCP Tools for Whiteboard Analytics
 * 
 * Provides access to whiteboard analytics data, insights, and reporting capabilities
 * for AI-powered analysis and recommendations.
 */

import { z } from 'zod';
import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { WhiteboardAnalyticsService } from '@mcp-tools/core/services/whiteboard/whiteboard-analytics-service';
import { getDatabasePool } from '../../../core/src/utils/database-pool.js';

// Initialize analytics service
const db = getDatabasePool();
const analyticsService = new WhiteboardAnalyticsService(db);

// Input validation schemas
const WhiteboardIdSchema = z.string().uuid('Invalid whiteboard ID format');
const UserIdSchema = z.string().uuid('Invalid user ID format').optional();
const TimeRangeSchema = z.enum(['day', 'week', 'month', 'quarter', 'year']).default('week');
const DateSchema = z.string().datetime('Invalid datetime format').optional();

const AnalyticsFiltersSchema = z.object({
  whiteboardId: WhiteboardIdSchema.optional(),
  userId: UserIdSchema,
  startDate: DateSchema,
  endDate: DateSchema,
  eventType: z.enum(['user_action', 'collaboration', 'performance', 'error']).optional(),
  metricType: z.enum(['load_time', 'ot_latency', 'render_time', 'memory_usage', 'fps', 'connection_quality']).optional(),
  insightType: z.string().optional(),
}).strict();

const PaginationSchema = z.object({
  limit: z.number().min(1).max(1000).default(50),
  offset: z.number().min(0).default(0),
}).strict();

/**
 * Get comprehensive whiteboard analytics
 */
export const getWhiteboardAnalytics: Tool = {
  name: 'get_whiteboard_analytics',
  description: 'Retrieve comprehensive analytics data for a whiteboard including metrics, sessions, insights, user behavior, and performance data',
  inputSchema: {
    type: 'object',
    properties: {
      whiteboardId: {
        type: 'string',
        description: 'UUID of the whiteboard to get analytics for',
      },
      filters: {
        type: 'object',
        description: 'Optional filters to apply to the analytics query',
        properties: {
          userId: { type: 'string', description: 'Filter by specific user ID' },
          startDate: { type: 'string', description: 'ISO datetime string for start of date range' },
          endDate: { type: 'string', description: 'ISO datetime string for end of date range' },
          eventType: { 
            type: 'string', 
            enum: ['user_action', 'collaboration', 'performance', 'error'],
            description: 'Filter by event type' 
          },
          metricType: { 
            type: 'string', 
            enum: ['load_time', 'ot_latency', 'render_time', 'memory_usage', 'fps', 'connection_quality'],
            description: 'Filter by performance metric type' 
          },
          insightType: { type: 'string', description: 'Filter by insight type' },
        },
      },
      pagination: {
        type: 'object',
        description: 'Pagination options',
        properties: {
          limit: { type: 'number', minimum: 1, maximum: 1000, default: 50 },
          offset: { type: 'number', minimum: 0, default: 0 },
        },
      },
    },
    required: ['whiteboardId'],
  },
  handler: async (request) => {
    try {
      const { whiteboardId, filters, pagination } = request.params as {
        whiteboardId: string;
        filters?: z.infer<typeof AnalyticsFiltersSchema>;
        pagination?: z.infer<typeof PaginationSchema>;
      };

      // Validate inputs
      const validatedWhiteboardId = WhiteboardIdSchema.parse(whiteboardId);
      const validatedFilters = filters ? AnalyticsFiltersSchema.parse(filters) : undefined;
      const validatedPagination = pagination ? PaginationSchema.parse(pagination) : { limit: 50, offset: 0 };

      // Get analytics data
      const analyticsData = await analyticsService.getWhiteboardAnalytics(
        validatedWhiteboardId,
        validatedFilters,
        validatedPagination
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              data: analyticsData,
              metadata: {
                whiteboardId: validatedWhiteboardId,
                filtersApplied: validatedFilters,
                pagination: validatedPagination,
                generatedAt: new Date().toISOString(),
              },
            }, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error occurred',
              code: error instanceof Error && 'code' in error ? (error as any).code : 'ANALYTICS_ERROR',
            }, null, 2),
          },
        ],
        isError: true,
      };
    }
  },
};

/**
 * Generate comprehensive analytics report
 */
export const generateAnalyticsReport: Tool = {
  name: 'generate_analytics_report',
  description: 'Generate a comprehensive analytics report with summary, trends, insights, and recommendations for a whiteboard',
  inputSchema: {
    type: 'object',
    properties: {
      whiteboardId: {
        type: 'string',
        description: 'UUID of the whiteboard to generate report for',
      },
      timePeriod: {
        type: 'object',
        description: 'Time period for the report',
        properties: {
          start: { type: 'string', description: 'ISO datetime string for start of period' },
          end: { type: 'string', description: 'ISO datetime string for end of period' },
        },
        required: ['start', 'end'],
      },
      includeRecommendations: {
        type: 'boolean',
        description: 'Whether to include AI-generated recommendations',
        default: true,
      },
    },
    required: ['whiteboardId', 'timePeriod'],
  },
  handler: async (request) => {
    try {
      const { whiteboardId, timePeriod, includeRecommendations = true } = request.params as {
        whiteboardId: string;
        timePeriod: { start: string; end: string };
        includeRecommendations?: boolean;
      };

      // Validate inputs
      const validatedWhiteboardId = WhiteboardIdSchema.parse(whiteboardId);
      const validatedTimePeriod = z.object({
        start: z.string().datetime(),
        end: z.string().datetime(),
      }).parse(timePeriod);

      // Generate report
      const report = await analyticsService.generateAnalyticsReport(
        validatedWhiteboardId,
        validatedTimePeriod
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              report,
              metadata: {
                whiteboardId: validatedWhiteboardId,
                timePeriod: validatedTimePeriod,
                includeRecommendations,
                generatedAt: new Date().toISOString(),
                reportType: 'comprehensive_analytics',
              },
            }, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error occurred',
              code: error instanceof Error && 'code' in error ? (error as any).code : 'REPORT_ERROR',
            }, null, 2),
          },
        ],
        isError: true,
      };
    }
  },
};

/**
 * Get usage insights for optimization
 */
export const getUsageInsights: Tool = {
  name: 'get_usage_insights',
  description: 'Get AI-powered insights and recommendations based on whiteboard usage patterns and analytics',
  inputSchema: {
    type: 'object',
    properties: {
      whiteboardId: {
        type: 'string',
        description: 'UUID of the whiteboard to analyze',
      },
      insightTypes: {
        type: 'array',
        items: { 
          type: 'string',
          enum: ['usage_pattern', 'performance_issue', 'collaboration_trend', 'productivity_optimization'],
        },
        description: 'Types of insights to generate',
        default: ['usage_pattern', 'performance_issue', 'collaboration_trend'],
      },
      activeOnly: {
        type: 'boolean',
        description: 'Whether to return only active (unresolved) insights',
        default: true,
      },
      minConfidence: {
        type: 'number',
        minimum: 0,
        maximum: 1,
        description: 'Minimum confidence score for insights (0-1)',
        default: 0.5,
      },
    },
    required: ['whiteboardId'],
  },
  handler: async (request) => {
    try {
      const { 
        whiteboardId, 
        insightTypes = ['usage_pattern', 'performance_issue', 'collaboration_trend'],
        activeOnly = true,
        minConfidence = 0.5,
      } = request.params as {
        whiteboardId: string;
        insightTypes?: string[];
        activeOnly?: boolean;
        minConfidence?: number;
      };

      // Validate inputs
      const validatedWhiteboardId = WhiteboardIdSchema.parse(whiteboardId);

      // Get all analytics data first
      const analytics = await analyticsService.getWhiteboardAnalytics(validatedWhiteboardId);

      // Filter insights based on criteria
      const filteredInsights = analytics.insights.filter(insight => {
        // Check if insight type is requested
        if (insightTypes.length > 0 && !insightTypes.includes(insight.insightType)) {
          return false;
        }

        // Check if insight is active (if requested)
        if (activeOnly && !insight.isActive) {
          return false;
        }

        // Check confidence threshold
        if (insight.confidenceScore < minConfidence) {
          return false;
        }

        return true;
      });

      // Sort by severity and confidence
      const sortedInsights = filteredInsights.sort((a, b) => {
        // First by severity (higher is more important)
        if (a.severityScore !== b.severityScore) {
          return b.severityScore - a.severityScore;
        }
        // Then by confidence (higher is better)
        return b.confidenceScore - a.confidenceScore;
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              insights: sortedInsights,
              summary: {
                totalInsights: sortedInsights.length,
                criticalInsights: sortedInsights.filter(i => i.insightCategory === 'critical').length,
                warningInsights: sortedInsights.filter(i => i.insightCategory === 'warning').length,
                positiveInsights: sortedInsights.filter(i => i.insightCategory === 'positive').length,
                avgConfidence: sortedInsights.reduce((sum, i) => sum + i.confidenceScore, 0) / sortedInsights.length || 0,
                avgSeverity: sortedInsights.reduce((sum, i) => sum + i.severityScore, 0) / sortedInsights.length || 0,
              },
              metadata: {
                whiteboardId: validatedWhiteboardId,
                filters: {
                  insightTypes,
                  activeOnly,
                  minConfidence,
                },
                generatedAt: new Date().toISOString(),
              },
            }, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error occurred',
              code: error instanceof Error && 'code' in error ? (error as any).code : 'INSIGHTS_ERROR',
            }, null, 2),
          },
        ],
        isError: true,
      };
    }
  },
};

/**
 * Track a custom analytics event
 */
export const trackWhiteboardEvent: Tool = {
  name: 'track_whiteboard_event',
  description: 'Manually track a custom analytics event for integration purposes',
  inputSchema: {
    type: 'object',
    properties: {
      whiteboardId: {
        type: 'string',
        description: 'UUID of the whiteboard',
      },
      userId: {
        type: 'string',
        description: 'UUID of the user performing the action',
      },
      eventData: {
        type: 'object',
        description: 'Event data to track',
        properties: {
          type: { type: 'string', description: 'Event type (user_action, collaboration, performance, error)' },
          action: { type: 'string', description: 'Specific action performed' },
          targetType: { type: 'string', description: 'Type of target (element, canvas, user, tool)' },
          targetId: { type: 'string', description: 'ID of the target (optional)' },
          coordinates: {
            type: 'object',
            description: 'Spatial coordinates (optional)',
            properties: {
              x: { type: 'number' },
              y: { type: 'number' },
            },
          },
          elementType: { type: 'string', description: 'Type of element (optional)' },
          toolType: { type: 'string', description: 'Tool used (optional)' },
          duration: { type: 'number', description: 'Duration in milliseconds (optional)' },
          metadata: { type: 'object', description: 'Additional metadata (optional)' },
        },
        required: ['type', 'action', 'targetType'],
      },
      sessionId: {
        type: 'string',
        description: 'Session ID (optional)',
      },
      clientMetadata: {
        type: 'object',
        description: 'Client metadata (browser, device info, etc.)',
      },
    },
    required: ['whiteboardId', 'userId', 'eventData'],
  },
  handler: async (request) => {
    try {
      const { whiteboardId, userId, eventData, sessionId, clientMetadata } = request.params as {
        whiteboardId: string;
        userId: string;
        eventData: any;
        sessionId?: string;
        clientMetadata?: Record<string, unknown>;
      };

      // Validate inputs
      const validatedWhiteboardId = WhiteboardIdSchema.parse(whiteboardId);
      const validatedUserId = z.string().uuid().parse(userId);

      // Track the event
      const event = await analyticsService.trackEvent(
        validatedWhiteboardId,
        validatedUserId,
        eventData,
        sessionId,
        clientMetadata
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              event,
              message: 'Event tracked successfully',
              metadata: {
                whiteboardId: validatedWhiteboardId,
                userId: validatedUserId,
                sessionId,
                trackedAt: new Date().toISOString(),
              },
            }, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error occurred',
              code: error instanceof Error && 'code' in error ? (error as any).code : 'TRACK_ERROR',
            }, null, 2),
          },
        ],
        isError: true,
      };
    }
  },
};

/**
 * Get performance metrics summary
 */
export const getPerformanceMetrics: Tool = {
  name: 'get_performance_metrics',
  description: 'Get performance metrics summary for a whiteboard with threshold analysis',
  inputSchema: {
    type: 'object',
    properties: {
      whiteboardId: {
        type: 'string',
        description: 'UUID of the whiteboard',
      },
      metricTypes: {
        type: 'array',
        items: { 
          type: 'string',
          enum: ['load_time', 'ot_latency', 'render_time', 'memory_usage', 'fps', 'connection_quality'],
        },
        description: 'Types of metrics to retrieve',
      },
      timeRange: {
        type: 'string',
        enum: ['hour', 'day', 'week', 'month'],
        description: 'Time range for metrics',
        default: 'day',
      },
      aggregation: {
        type: 'string',
        enum: ['avg', 'min', 'max', 'p95', 'p99'],
        description: 'Aggregation method',
        default: 'avg',
      },
    },
    required: ['whiteboardId'],
  },
  handler: async (request) => {
    try {
      const { 
        whiteboardId, 
        metricTypes,
        timeRange = 'day',
        aggregation = 'avg',
      } = request.params as {
        whiteboardId: string;
        metricTypes?: string[];
        timeRange?: string;
        aggregation?: string;
      };

      // Validate inputs
      const validatedWhiteboardId = WhiteboardIdSchema.parse(whiteboardId);

      // Get analytics data
      const analytics = await analyticsService.getWhiteboardAnalytics(validatedWhiteboardId);

      // Filter performance metrics
      let filteredMetrics = analytics.performance;
      if (metricTypes && metricTypes.length > 0) {
        filteredMetrics = filteredMetrics.filter(metric => 
          metricTypes.includes(metric.metricType)
        );
      }

      // Filter by time range
      const now = new Date();
      let startTime: Date;
      switch (timeRange) {
        case 'hour':
          startTime = new Date(now.getTime() - 60 * 60 * 1000);
          break;
        case 'day':
          startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          break;
        case 'week':
          startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
          startTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        default:
          startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      }

      filteredMetrics = filteredMetrics.filter(metric => 
        new Date(metric.recordedAt) >= startTime
      );

      // Group by metric type and aggregate
      const groupedMetrics = filteredMetrics.reduce((groups, metric) => {
        if (!groups[metric.metricType]) {
          groups[metric.metricType] = [];
        }
        groups[metric.metricType].push(metric);
        return groups;
      }, {} as Record<string, typeof filteredMetrics>);

      const aggregatedMetrics = Object.entries(groupedMetrics).map(([metricType, metrics]) => {
        const values = metrics.map(m => m.metricValue).sort((a, b) => a - b);
        let aggregatedValue: number;

        switch (aggregation) {
          case 'min':
            aggregatedValue = Math.min(...values);
            break;
          case 'max':
            aggregatedValue = Math.max(...values);
            break;
          case 'p95':
            aggregatedValue = values[Math.floor(values.length * 0.95)] || 0;
            break;
          case 'p99':
            aggregatedValue = values[Math.floor(values.length * 0.99)] || 0;
            break;
          default: // avg
            aggregatedValue = values.reduce((sum, val) => sum + val, 0) / values.length;
        }

        const thresholdExceeded = metrics.filter(m => m.isAboveThreshold).length;
        const unit = metrics[0]?.metricUnit || '';

        return {
          metricType,
          value: aggregatedValue,
          unit,
          sampleCount: metrics.length,
          thresholdExceeded,
          thresholdExceededPercentage: (thresholdExceeded / metrics.length) * 100,
          trend: values.length > 1 ? (values[values.length - 1] - values[0]) / values[0] * 100 : 0,
        };
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              metrics: aggregatedMetrics,
              summary: {
                timeRange,
                aggregation,
                totalSamples: filteredMetrics.length,
                metricsWithThresholdIssues: aggregatedMetrics.filter(m => m.thresholdExceeded > 0).length,
                overallHealth: aggregatedMetrics.every(m => m.thresholdExceededPercentage < 5) ? 'good' : 
                              aggregatedMetrics.some(m => m.thresholdExceededPercentage > 20) ? 'poor' : 'fair',
              },
              metadata: {
                whiteboardId: validatedWhiteboardId,
                timeRange,
                aggregation,
                metricTypes: metricTypes || 'all',
                generatedAt: new Date().toISOString(),
              },
            }, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error occurred',
              code: error instanceof Error && 'code' in error ? (error as any).code : 'METRICS_ERROR',
            }, null, 2),
          },
        ],
        isError: true,
      };
    }
  },
};

// Export all tools
export const analyticsTools = [
  getWhiteboardAnalytics,
  generateAnalyticsReport,
  getUsageInsights,
  trackWhiteboardEvent,
  getPerformanceMetrics,
];