/**
 * Tests for Whiteboard Analytics MCP Tools
 * 
 * Tests the MCP tool interfaces for whiteboard analytics including
 * input validation, error handling, and response formatting.
 */

import { 
  getWhiteboardAnalytics,
  generateAnalyticsReport,
  getUsageInsights,
  trackWhiteboardEvent,
  getPerformanceMetrics,
} from '../analytics-tools.js';

// Mock the analytics service
jest.mock('@mcp-tools/core/services/whiteboard/whiteboard-analytics-service', () => ({
  WhiteboardAnalyticsService: jest.fn().mockImplementation(() => ({
    getWhiteboardAnalytics: jest.fn(),
    generateAnalyticsReport: jest.fn(),
    trackEvent: jest.fn(),
  })),
}));

// Mock the database pool
jest.mock('@mcp-tools/core/utils/database-pool', () => ({
  getDatabasePool: jest.fn().mockReturnValue({}),
}));

describe('Analytics MCP Tools', () => {
  const validWhiteboardId = 'wb-123e4567-e89b-12d3-a456-426614174000';
  const validUserId = 'user-123e4567-e89b-12d3-a456-426614174000';

  describe('getWhiteboardAnalytics', () => {
    it('should return analytics data for valid whiteboard ID', async () => {
      const mockAnalyticsData = {
        metrics: [],
        sessions: [],
        insights: [],
        userBehavior: [],
        performance: [],
        total: 0,
      };

      // Mock the service method
      const { WhiteboardAnalyticsService } = require('@mcp-tools/core/services/whiteboard/whiteboard-analytics-service');
      const mockService = new WhiteboardAnalyticsService();
      mockService.getWhiteboardAnalytics.mockResolvedValue(mockAnalyticsData);

      const request = {
        params: {
          whiteboardId: validWhiteboardId,
        },
      };

      const result = await getWhiteboardAnalytics.handler(request);

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
      
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.data).toEqual(mockAnalyticsData);
      expect(response.metadata.whiteboardId).toBe(validWhiteboardId);
      expect(response.metadata.generatedAt).toBeDefined();
    });

    it('should apply filters when provided', async () => {
      const { WhiteboardAnalyticsService } = require('@mcp-tools/core/services/whiteboard/whiteboard-analytics-service');
      const mockService = new WhiteboardAnalyticsService();
      mockService.getWhiteboardAnalytics.mockResolvedValue({});

      const request = {
        params: {
          whiteboardId: validWhiteboardId,
          filters: {
            userId: validUserId,
            startDate: '2024-01-01T00:00:00Z',
            endDate: '2024-01-31T23:59:59Z',
            eventType: 'user_action',
          },
          pagination: {
            limit: 25,
            offset: 50,
          },
        },
      };

      const result = await getWhiteboardAnalytics.handler(request);
      
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.metadata.filtersApplied).toMatchObject({
        userId: validUserId,
        startDate: '2024-01-01T00:00:00Z',
        endDate: '2024-01-31T23:59:59Z',
        eventType: 'user_action',
      });
      expect(response.metadata.pagination).toMatchObject({
        limit: 25,
        offset: 50,
      });
    });

    it('should handle invalid whiteboard ID', async () => {
      const request = {
        params: {
          whiteboardId: 'invalid-uuid',
        },
      };

      const result = await getWhiteboardAnalytics.handler(request);

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error).toContain('Invalid whiteboard ID format');
    });

    it('should handle service errors gracefully', async () => {
      const { WhiteboardAnalyticsService } = require('@mcp-tools/core/services/whiteboard/whiteboard-analytics-service');
      const mockService = new WhiteboardAnalyticsService();
      mockService.getWhiteboardAnalytics.mockRejectedValue(new Error('Database connection failed'));

      const request = {
        params: {
          whiteboardId: validWhiteboardId,
        },
      };

      const result = await getWhiteboardAnalytics.handler(request);

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error).toBe('Database connection failed');
    });
  });

  describe('generateAnalyticsReport', () => {
    it('should generate report for valid time period', async () => {
      const mockReport = {
        summary: {
          totalUsers: 10,
          totalSessions: 50,
          avgEngagement: 75.5,
          performanceScore: 89.2,
        },
        trends: {
          userGrowth: 15.3,
          engagementTrend: 8.7,
          performanceTrend: 5.2,
        },
        insights: [],
        recommendations: ['Improve performance', 'Increase engagement'],
      };

      const { WhiteboardAnalyticsService } = require('@mcp-tools/core/services/whiteboard/whiteboard-analytics-service');
      const mockService = new WhiteboardAnalyticsService();
      mockService.generateAnalyticsReport.mockResolvedValue(mockReport);

      const request = {
        params: {
          whiteboardId: validWhiteboardId,
          timePeriod: {
            start: '2024-01-01T00:00:00Z',
            end: '2024-01-31T23:59:59Z',
          },
          includeRecommendations: true,
        },
      };

      const result = await generateAnalyticsReport.handler(request);

      expect(result.content).toHaveLength(1);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.report).toEqual(mockReport);
      expect(response.metadata.reportType).toBe('comprehensive_analytics');
    });

    it('should validate time period format', async () => {
      const request = {
        params: {
          whiteboardId: validWhiteboardId,
          timePeriod: {
            start: 'invalid-date',
            end: '2024-01-31T23:59:59Z',
          },
        },
      };

      const result = await generateAnalyticsReport.handler(request);

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error).toContain('Invalid datetime format');
    });

    it('should require both start and end dates', async () => {
      const request = {
        params: {
          whiteboardId: validWhiteboardId,
          timePeriod: {
            start: '2024-01-01T00:00:00Z',
            // missing end date
          },
        },
      };

      const result = await generateAnalyticsReport.handler(request);

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
    });
  });

  describe('getUsageInsights', () => {
    it('should filter insights by type and confidence', async () => {
      const mockInsights = [
        {
          id: '1',
          insightType: 'usage_pattern',
          insightCategory: 'positive',
          title: 'High Usage',
          description: 'Good usage patterns',
          severityScore: 3.0,
          confidenceScore: 0.9,
          recommendations: ['Keep up the good work'],
          isActive: true,
          createdAt: '2024-01-15T12:00:00Z',
        },
        {
          id: '2',
          insightType: 'performance_issue',
          insightCategory: 'warning',
          title: 'Slow Performance',
          description: 'Performance could be better',
          severityScore: 6.5,
          confidenceScore: 0.8,
          recommendations: ['Optimize rendering'],
          isActive: true,
          createdAt: '2024-01-15T11:00:00Z',
        },
        {
          id: '3',
          insightType: 'collaboration_trend',
          insightCategory: 'information',
          title: 'Low Confidence Insight',
          description: 'This insight has low confidence',
          severityScore: 2.0,
          confidenceScore: 0.3, // Below default threshold
          recommendations: [],
          isActive: true,
          createdAt: '2024-01-15T10:00:00Z',
        },
      ];

      const { WhiteboardAnalyticsService } = require('@mcp-tools/core/services/whiteboard/whiteboard-analytics-service');
      const mockService = new WhiteboardAnalyticsService();
      mockService.getWhiteboardAnalytics.mockResolvedValue({
        insights: mockInsights,
        metrics: [], sessions: [], userBehavior: [], performance: [], total: 0,
      });

      const request = {
        params: {
          whiteboardId: validWhiteboardId,
          insightTypes: ['usage_pattern', 'performance_issue'],
          activeOnly: true,
          minConfidence: 0.5,
        },
      };

      const result = await getUsageInsights.handler(request);

      expect(result.content).toHaveLength(1);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.insights).toHaveLength(2); // Third insight filtered out by confidence
      expect(response.summary.totalInsights).toBe(2);
      expect(response.summary.warningInsights).toBe(1);
      expect(response.summary.positiveInsights).toBe(1);
    });

    it('should sort insights by severity and confidence', async () => {
      const mockInsights = [
        { id: '1', severityScore: 3.0, confidenceScore: 0.9, insightCategory: 'positive', isActive: true },
        { id: '2', severityScore: 8.0, confidenceScore: 0.7, insightCategory: 'critical', isActive: true },
        { id: '3', severityScore: 8.0, confidenceScore: 0.9, insightCategory: 'critical', isActive: true },
      ];

      const { WhiteboardAnalyticsService } = require('@mcp-tools/core/services/whiteboard/whiteboard-analytics-service');
      const mockService = new WhiteboardAnalyticsService();
      mockService.getWhiteboardAnalytics.mockResolvedValue({
        insights: mockInsights,
        metrics: [], sessions: [], userBehavior: [], performance: [], total: 0,
      });

      const request = {
        params: {
          whiteboardId: validWhiteboardId,
        },
      };

      const result = await getUsageInsights.handler(request);

      const response = JSON.parse(result.content[0].text);
      const insights = response.insights;
      
      // Should be sorted by severity (descending), then confidence (descending)
      expect(insights[0].id).toBe('3'); // Highest severity and confidence
      expect(insights[1].id).toBe('2'); // Same severity, lower confidence
      expect(insights[2].id).toBe('1'); // Lowest severity
    });
  });

  describe('trackWhiteboardEvent', () => {
    it('should track event with valid data', async () => {
      const mockEvent = {
        id: 'event-123',
        whiteboardId: validWhiteboardId,
        userId: validUserId,
        eventType: 'user_action',
        action: 'create',
        targetType: 'element',
      };

      const { WhiteboardAnalyticsService } = require('@mcp-tools/core/services/whiteboard/whiteboard-analytics-service');
      const mockService = new WhiteboardAnalyticsService();
      mockService.trackEvent.mockResolvedValue(mockEvent);

      const request = {
        params: {
          whiteboardId: validWhiteboardId,
          userId: validUserId,
          eventData: {
            type: 'user_action',
            action: 'create',
            targetType: 'element',
            coordinates: { x: 100, y: 200 },
            elementType: 'rectangle',
            metadata: { color: 'blue' },
          },
          sessionId: 'session-123',
          clientMetadata: { browser: 'Chrome' },
        },
      };

      const result = await trackWhiteboardEvent.handler(request);

      expect(result.content).toHaveLength(1);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.event).toEqual(mockEvent);
      expect(response.message).toBe('Event tracked successfully');
    });

    it('should validate required event data fields', async () => {
      const request = {
        params: {
          whiteboardId: validWhiteboardId,
          userId: validUserId,
          eventData: {
            type: 'user_action',
            // missing required action and targetType
          },
        },
      };

      const result = await trackWhiteboardEvent.handler(request);

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
    });

    it('should validate user ID format', async () => {
      const request = {
        params: {
          whiteboardId: validWhiteboardId,
          userId: 'invalid-user-id',
          eventData: {
            type: 'user_action',
            action: 'create',
            targetType: 'element',
          },
        },
      };

      const result = await trackWhiteboardEvent.handler(request);

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error).toContain('Invalid uuid format');
    });
  });

  describe('getPerformanceMetrics', () => {
    it('should aggregate performance metrics by type', async () => {
      const mockPerformanceData = [
        {
          id: '1',
          metricType: 'load_time',
          metricValue: 800,
          metricUnit: 'ms',
          isAboveThreshold: false,
          recordedAt: '2024-01-15T12:00:00Z',
        },
        {
          id: '2',
          metricType: 'load_time',
          metricValue: 1200,
          metricUnit: 'ms',
          isAboveThreshold: true,
          recordedAt: '2024-01-15T12:01:00Z',
        },
        {
          id: '3',
          metricType: 'ot_latency',
          metricValue: 45,
          metricUnit: 'ms',
          isAboveThreshold: false,
          recordedAt: '2024-01-15T12:00:00Z',
        },
      ];

      const { WhiteboardAnalyticsService } = require('@mcp-tools/core/services/whiteboard/whiteboard-analytics-service');
      const mockService = new WhiteboardAnalyticsService();
      mockService.getWhiteboardAnalytics.mockResolvedValue({
        performance: mockPerformanceData,
        metrics: [], sessions: [], insights: [], userBehavior: [], total: 0,
      });

      const request = {
        params: {
          whiteboardId: validWhiteboardId,
          metricTypes: ['load_time', 'ot_latency'],
          timeRange: 'day',
          aggregation: 'avg',
        },
      };

      const result = await getPerformanceMetrics.handler(request);

      expect(result.content).toHaveLength(1);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.metrics).toHaveLength(2);
      
      const loadTimeMetric = response.metrics.find((m: any) => m.metricType === 'load_time');
      expect(loadTimeMetric.value).toBe(1000); // Average of 800 and 1200
      expect(loadTimeMetric.sampleCount).toBe(2);
      expect(loadTimeMetric.thresholdExceeded).toBe(1);
      expect(loadTimeMetric.thresholdExceededPercentage).toBe(50);

      const latencyMetric = response.metrics.find((m: any) => m.metricType === 'ot_latency');
      expect(latencyMetric.value).toBe(45);
      expect(latencyMetric.sampleCount).toBe(1);
      expect(latencyMetric.thresholdExceeded).toBe(0);
    });

    it('should support different aggregation methods', async () => {
      const mockPerformanceData = [
        { metricType: 'load_time', metricValue: 500, metricUnit: 'ms', isAboveThreshold: false, recordedAt: '2024-01-15T12:00:00Z' },
        { metricType: 'load_time', metricValue: 800, metricUnit: 'ms', isAboveThreshold: false, recordedAt: '2024-01-15T12:01:00Z' },
        { metricType: 'load_time', metricValue: 1200, metricUnit: 'ms', isAboveThreshold: true, recordedAt: '2024-01-15T12:02:00Z' },
        { metricType: 'load_time', metricValue: 600, metricUnit: 'ms', isAboveThreshold: false, recordedAt: '2024-01-15T12:03:00Z' },
      ];

      const { WhiteboardAnalyticsService } = require('@mcp-tools/core/services/whiteboard/whiteboard-analytics-service');
      const mockService = new WhiteboardAnalyticsService();
      mockService.getWhiteboardAnalytics.mockResolvedValue({
        performance: mockPerformanceData,
        metrics: [], sessions: [], insights: [], userBehavior: [], total: 0,
      });

      // Test p95 aggregation
      const request = {
        params: {
          whiteboardId: validWhiteboardId,
          metricTypes: ['load_time'],
          aggregation: 'p95',
        },
      };

      const result = await getPerformanceMetrics.handler(request);

      const response = JSON.parse(result.content[0].text);
      const metric = response.metrics[0];
      
      // P95 of [500, 600, 800, 1200] (sorted) should be around 1200 (95th percentile)
      expect(metric.value).toBe(1200);
    });

    it('should calculate overall health score', async () => {
      const mockGoodPerformance = [
        { metricType: 'load_time', metricValue: 500, metricUnit: 'ms', isAboveThreshold: false, recordedAt: '2024-01-15T12:00:00Z' },
        { metricType: 'ot_latency', metricValue: 30, metricUnit: 'ms', isAboveThreshold: false, recordedAt: '2024-01-15T12:00:00Z' },
      ];

      const { WhiteboardAnalyticsService } = require('@mcp-tools/core/services/whiteboard/whiteboard-analytics-service');
      const mockService = new WhiteboardAnalyticsService();
      mockService.getWhiteboardAnalytics.mockResolvedValue({
        performance: mockGoodPerformance,
        metrics: [], sessions: [], insights: [], userBehavior: [], total: 0,
      });

      const request = {
        params: {
          whiteboardId: validWhiteboardId,
        },
      };

      const result = await getPerformanceMetrics.handler(request);

      const response = JSON.parse(result.content[0].text);
      expect(response.summary.overallHealth).toBe('good'); // No threshold issues
    });
  });

  describe('Input Validation', () => {
    it('should validate whiteboard ID format in all tools', async () => {
      const invalidId = 'not-a-uuid';

      const tools = [
        getWhiteboardAnalytics,
        generateAnalyticsReport,
        getUsageInsights,
        trackWhiteboardEvent,
        getPerformanceMetrics,
      ];

      for (const tool of tools) {
        const request = {
          params: {
            whiteboardId: invalidId,
            userId: validUserId, // For tools that require it
            eventData: { type: 'user_action', action: 'test', targetType: 'element' }, // For track tool
            timePeriod: { start: '2024-01-01T00:00:00Z', end: '2024-01-31T23:59:59Z' }, // For report tool
          },
        };

        const result = await tool.handler(request);

        expect(result.isError).toBe(true);
        const response = JSON.parse(result.content[0].text);
        expect(response.success).toBe(false);
        expect(response.error).toContain('Invalid whiteboard ID format');
      }
    });

    it('should handle missing required parameters', async () => {
      const request = {
        params: {}, // Missing required whiteboardId
      };

      const result = await getWhiteboardAnalytics.handler(request);

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
    });
  });

  describe('Response Format', () => {
    it('should include consistent metadata in all responses', async () => {
      const { WhiteboardAnalyticsService } = require('@mcp-tools/core/services/whiteboard/whiteboard-analytics-service');
      const mockService = new WhiteboardAnalyticsService();
      mockService.getWhiteboardAnalytics.mockResolvedValue({});

      const request = {
        params: {
          whiteboardId: validWhiteboardId,
        },
      };

      const result = await getWhiteboardAnalytics.handler(request);

      const response = JSON.parse(result.content[0].text);
      expect(response.metadata).toBeDefined();
      expect(response.metadata.whiteboardId).toBe(validWhiteboardId);
      expect(response.metadata.generatedAt).toBeDefined();
      expect(new Date(response.metadata.generatedAt)).toBeInstanceOf(Date);
    });

    it('should return properly formatted JSON', async () => {
      const { WhiteboardAnalyticsService } = require('@mcp-tools/core/services/whiteboard/whiteboard-analytics-service');
      const mockService = new WhiteboardAnalyticsService();
      mockService.getWhiteboardAnalytics.mockResolvedValue({});

      const request = {
        params: {
          whiteboardId: validWhiteboardId,
        },
      };

      const result = await getWhiteboardAnalytics.handler(request);

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
      
      // Should be valid JSON
      expect(() => JSON.parse(result.content[0].text)).not.toThrow();
      
      // Should be pretty-printed (contain newlines)
      expect(result.content[0].text).toContain('\n');
    });
  });
});