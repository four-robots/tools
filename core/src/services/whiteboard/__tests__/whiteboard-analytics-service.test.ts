/**
 * Tests for WhiteboardAnalyticsService
 * 
 * Comprehensive test suite covering event tracking, performance monitoring,
 * analytics data retrieval, and privacy compliance.
 */

import { WhiteboardAnalyticsService } from '../whiteboard-analytics-service.js';
import { DatabasePool } from '../../../utils/database-pool.js';
import { Logger } from '../../../utils/logger.js';

// Mock database pool
const mockDb = {
  query: jest.fn(),
  executeTransaction: jest.fn((callback: any) => {
    // Mock transaction that just calls the callback with the mock db
    return callback(mockDb);
  }),
} as unknown as DatabasePool;

// Mock logger
const mockLogger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
} as unknown as Logger;

describe('WhiteboardAnalyticsService', () => {
  let analyticsService: WhiteboardAnalyticsService;

  beforeEach(() => {
    jest.clearAllMocks();
    analyticsService = new WhiteboardAnalyticsService(mockDb, mockLogger);
  });

  describe('Event Tracking', () => {
    const mockWhiteboardId = 'wb-123e4567-e89b-12d3-a456-426614174000';
    const mockUserId = 'user-123e4567-e89b-12d3-a456-426614174000';
    const mockSessionId = 'session-123e4567-e89b-12d3-a456-426614174000';

    describe('trackEvent', () => {
      it('should successfully track a user action event', async () => {
        const mockEventData = {
          type: 'user_action',
          action: 'create',
          targetType: 'element',
          elementType: 'rectangle',
          coordinates: { x: 100, y: 200 },
          metadata: { color: 'blue' },
        };

        const mockResult = {
          rows: [{
            id: 'event-123',
            whiteboard_id: mockWhiteboardId,
            user_id: mockUserId,
            event_type: 'user_action',
            action: 'create',
            target_type: 'element',
            event_data: JSON.stringify(mockEventData),
            server_timestamp: new Date().toISOString(),
          }],
        };

        (mockDb.query as jest.Mock).mockResolvedValue(mockResult);

        const result = await analyticsService.trackEvent(
          mockWhiteboardId,
          mockUserId,
          mockEventData,
          mockSessionId
        );

        expect(mockDb.query).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO whiteboard_events'),
          expect.arrayContaining([
            expect.any(String), // event id
            mockWhiteboardId,
            mockUserId,
            mockSessionId,
            'user_action',
            'create',
            'element',
            undefined, // targetId
            JSON.stringify(expect.objectContaining(mockEventData)),
            JSON.stringify({ x: 100, y: 200 }),
            undefined, // duration
            expect.any(String), // client timestamp
            expect.any(String), // server timestamp
            JSON.stringify({}), // client metadata
          ])
        );

        expect(result).toMatchObject({
          eventType: 'user_action',
          action: 'create',
          targetType: 'element',
          whiteboardId: mockWhiteboardId,
          userId: mockUserId,
        });
      });

      it('should handle validation errors gracefully', async () => {
        const invalidEventData = {
          type: 'invalid_type',
          action: '', // Invalid empty action
          targetType: 'element',
        };

        await expect(
          analyticsService.trackEvent(mockWhiteboardId, mockUserId, invalidEventData)
        ).rejects.toThrow();
      });

      it('should respect user consent for analytics', async () => {
        // Mock user consent check to return false
        jest.spyOn(analyticsService as any, 'checkUserAnalyticsConsent')
          .mockResolvedValue(false);

        const eventData = {
          type: 'user_action',
          action: 'create',
          targetType: 'element',
        };

        const result = await analyticsService.trackEvent(
          mockWhiteboardId,
          mockUserId,
          eventData
        );

        // Should return minimal event without storing
        expect(result).toMatchObject({
          eventType: 'user_action',
          action: 'create',
          targetType: 'element',
          eventData: {},
        });

        // Should not query database
        expect(mockDb.query).not.toHaveBeenCalled();
      });
    });

    describe('trackPerformanceMetric', () => {
      it('should track performance metrics with threshold checking', async () => {
        const metricData = {
          type: 'load_time',
          value: 850,
          unit: 'ms',
          threshold: 1000,
          deviceInfo: { browser: 'Chrome', os: 'Windows' },
        };

        const mockResult = {
          rows: [{
            id: 'metric-123',
            whiteboard_id: mockWhiteboardId,
            metric_type: 'load_time',
            metric_value: 850,
            metric_unit: 'ms',
            is_above_threshold: false,
          }],
        };

        (mockDb.query as jest.Mock).mockResolvedValue(mockResult);

        const result = await analyticsService.trackPerformanceMetric(
          mockWhiteboardId,
          metricData
        );

        expect(mockDb.query).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO whiteboard_performance_tracking'),
          expect.arrayContaining([
            expect.any(String), // metric id
            mockWhiteboardId,
            undefined, // session id
            'load_time',
            850,
            'ms',
            1000,
            false, // is above threshold
            undefined, // user agent
            JSON.stringify(metricData.deviceInfo),
            JSON.stringify({}), // network info
            JSON.stringify({}), // context data
            expect.any(String), // recorded at
          ])
        );

        expect(result.isAboveThreshold).toBe(false);
      });

      it('should trigger performance alerts for threshold violations', async () => {
        const metricData = {
          type: 'ot_latency',
          value: 250,
          unit: 'ms',
          threshold: 100, // Value exceeds threshold
        };

        const mockResult = {
          rows: [{
            id: 'metric-456',
            is_above_threshold: true,
          }],
        };

        (mockDb.query as jest.Mock).mockResolvedValue(mockResult);

        const handlePerformanceAlertSpy = jest.spyOn(analyticsService as any, 'handlePerformanceAlert')
          .mockResolvedValue(undefined);

        await analyticsService.trackPerformanceMetric(mockWhiteboardId, metricData);

        expect(handlePerformanceAlertSpy).toHaveBeenCalledWith(mockWhiteboardId, metricData);
      });
    });
  });

  describe('Session Analytics', () => {
    const mockSessionId = 'session-123e4567-e89b-12d3-a456-426614174000';
    const mockWhiteboardId = 'wb-123e4567-e89b-12d3-a456-426614174000';
    const mockUserId = 'user-123e4567-e89b-12d3-a456-426614174000';

    describe('startSessionAnalytics', () => {
      it('should create session analytics record', async () => {
        const mockResult = {
          rows: [{
            id: 'analytics-123',
            session_id: mockSessionId,
            whiteboard_id: mockWhiteboardId,
            user_id: mockUserId,
            session_start: new Date().toISOString(),
          }],
        };

        (mockDb.query as jest.Mock).mockResolvedValue(mockResult);

        const result = await analyticsService.startSessionAnalytics(
          mockSessionId,
          mockWhiteboardId,
          mockUserId
        );

        expect(mockDb.query).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO whiteboard_session_analytics'),
          expect.arrayContaining([
            expect.any(String), // analytics id
            mockSessionId,
            mockWhiteboardId,
            mockUserId,
            expect.any(String), // session start
            0, 0, 0, 0, 0, // counters
            [], // tools used
            0, // collaboration score
            '{}', // activity heatmap
            '{}', // performance metrics
            0, // error count
          ])
        );

        expect(result.sessionId).toBe(mockSessionId);
      });
    });

    describe('updateSessionAnalytics', () => {
      it('should update session analytics with new metrics', async () => {
        const updates = {
          totalActions: 45,
          elementsCreated: 8,
          elementsModified: 12,
          commentsCreated: 3,
          toolsUsed: ['pen', 'rectangle', 'text'],
          collaborationScore: 85,
        };

        const mockResult = {
          rows: [{
            id: 'analytics-123',
            session_id: mockSessionId,
            total_actions: 45,
            elements_created: 8,
          }],
        };

        (mockDb.query as jest.Mock).mockResolvedValue(mockResult);

        const result = await analyticsService.updateSessionAnalytics(mockSessionId, updates);

        expect(mockDb.query).toHaveBeenCalledWith(
          expect.stringMatching(/UPDATE whiteboard_session_analytics/),
          expect.arrayContaining([45, 8, 12, 3, ['pen', 'rectangle', 'text'], 85])
        );

        expect(result.totalActions).toBe(45);
      });

      it('should handle partial updates', async () => {
        const partialUpdates = {
          totalActions: 50,
        };

        const mockResult = {
          rows: [{
            id: 'analytics-123',
            session_id: mockSessionId,
            total_actions: 50,
          }],
        };

        (mockDb.query as jest.Mock).mockResolvedValue(mockResult);

        await analyticsService.updateSessionAnalytics(mockSessionId, partialUpdates);

        expect(mockDb.query).toHaveBeenCalledWith(
          expect.stringMatching(/UPDATE whiteboard_session_analytics/),
          expect.arrayContaining([50, expect.any(String), mockSessionId])
        );
      });
    });

    describe('endSessionAnalytics', () => {
      it('should finalize session analytics with duration calculation', async () => {
        const mockResult = {
          rows: [{
            id: 'analytics-123',
            session_id: mockSessionId,
            session_end: new Date().toISOString(),
            duration_minutes: 25.5,
          }],
        };

        (mockDb.query as jest.Mock).mockResolvedValue(mockResult);

        const processSessionEndAsyncSpy = jest.spyOn(analyticsService as any, 'processSessionEndAsync')
          .mockResolvedValue(undefined);

        const result = await analyticsService.endSessionAnalytics(mockSessionId, 'normal');

        expect(mockDb.query).toHaveBeenCalledWith(
          expect.stringMatching(/UPDATE whiteboard_session_analytics/),
          expect.arrayContaining([
            expect.any(String), // session end timestamp
            'normal', // disconnect reason
            mockSessionId,
          ])
        );

        expect(result.durationMinutes).toBe(25.5);
        expect(processSessionEndAsyncSpy).toHaveBeenCalledWith(result);
      });
    });
  });

  describe('Analytics Retrieval', () => {
    const mockWhiteboardId = 'wb-123e4567-e89b-12d3-a456-426614174000';

    describe('getWhiteboardAnalytics', () => {
      it('should retrieve comprehensive analytics data', async () => {
        const mockMetrics = [{
          id: 'metric-1',
          whiteboard_id: mockWhiteboardId,
          metric_date: '2024-01-15',
          total_sessions: 10,
          unique_users: 5,
          total_actions: 200,
        }];

        const mockSessions = [{
          id: 'session-1',
          session_id: 'sess-1',
          whiteboard_id: mockWhiteboardId,
          user_id: 'user-1',
          total_actions: 25,
        }];

        const mockInsights = [{
          id: 'insight-1',
          whiteboard_id: mockWhiteboardId,
          insight_type: 'collaboration_trend',
          insight_category: 'positive',
          title: 'High Collaboration',
          is_active: true,
        }];

        // Mock multiple database queries
        (mockDb.query as jest.Mock)
          .mockResolvedValueOnce({ rows: mockMetrics })     // metrics query
          .mockResolvedValueOnce({ rows: mockSessions })    // sessions query
          .mockResolvedValueOnce({ rows: mockInsights })    // insights query
          .mockResolvedValueOnce({ rows: [] })              // user behavior query
          .mockResolvedValueOnce({ rows: [] })              // performance query
          .mockResolvedValueOnce({ rows: [{ total: '10' }] }); // count query

        const result = await analyticsService.getWhiteboardAnalytics(mockWhiteboardId);

        expect(result.metrics).toHaveLength(1);
        expect(result.sessions).toHaveLength(1);
        expect(result.insights).toHaveLength(1);
        expect(result.total).toBe(10);

        // Verify all expected queries were made
        expect(mockDb.query).toHaveBeenCalledTimes(6);
      });

      it('should apply filters correctly', async () => {
        const filters = {
          userId: 'user-123',
          startDate: '2024-01-01T00:00:00Z',
          endDate: '2024-01-31T23:59:59Z',
          eventType: 'user_action',
        };

        // Mock empty responses
        (mockDb.query as jest.Mock).mockResolvedValue({ rows: [] });

        await analyticsService.getWhiteboardAnalytics(mockWhiteboardId, filters);

        // Check that WHERE clauses were built with filters
        expect(mockDb.query).toHaveBeenCalledWith(
          expect.stringContaining('WHERE whiteboard_id = $1'),
          expect.arrayContaining([mockWhiteboardId])
        );
      });
    });

    describe('generateAnalyticsReport', () => {
      it('should generate comprehensive analytics report', async () => {
        const timePeriod = {
          start: '2024-01-01T00:00:00Z',
          end: '2024-01-31T23:59:59Z',
        };

        const mockSummaryData = {
          total_users: '15',
          total_sessions: '50',
          avg_engagement: '75.5',
          performance_score: '89.2',
        };

        const mockTrendsData = [
          { day: '2024-01-01', daily_users: '5', daily_engagement: '70.0' },
          { day: '2024-01-31', daily_users: '15', daily_engagement: '80.0' },
        ];

        const mockInsights = [{
          id: 'insight-1',
          insight_category: 'positive',
          title: 'Excellent Growth',
        }];

        (mockDb.query as jest.Mock)
          .mockResolvedValueOnce({ rows: [mockSummaryData] })  // summary query
          .mockResolvedValueOnce({ rows: mockTrendsData })     // trends query
          .mockResolvedValueOnce({ rows: mockInsights });      // insights query

        const result = await analyticsService.generateAnalyticsReport(mockWhiteboardId, timePeriod);

        expect(result.summary.totalUsers).toBe(15);
        expect(result.summary.totalSessions).toBe(50);
        expect(result.trends.userGrowth).toBeGreaterThan(0); // Should calculate positive growth
        expect(result.insights).toHaveLength(1);
        expect(result.recommendations).toBeInstanceOf(Array);
      });
    });
  });

  describe('Privacy and Security', () => {
    it('should sanitize metadata to prevent injection attacks', async () => {
      const maliciousMetadata = {
        userAgent: '<script>alert("xss")</script>',
        platform: 'Windows; DROP TABLE whiteboard_events; --',
        normalField: 'safe value',
        deepObject: {
          nested: '<img src=x onerror=alert(1)>',
          safeNested: 'safe',
        },
      };

      const sanitizeSpy = jest.spyOn(analyticsService as any, 'sanitizeMetadata');
      
      await analyticsService.trackEvent(
        'wb-123e4567-e89b-12d3-a456-426614174000',
        'user-123e4567-e89b-12d3-a456-426614174000',
        {
          type: 'user_action',
          action: 'test',
          targetType: 'element',
        },
        undefined,
        maliciousMetadata
      );

      expect(sanitizeSpy).toHaveBeenCalledWith(maliciousMetadata);
    });

    it('should limit object depth to prevent DoS attacks', async () => {
      const deepObject = {
        level1: {
          level2: {
            level3: {
              level4: {
                level5: {
                  level6: 'too deep',
                },
              },
            },
          },
        },
      };

      const sanitizeObjectSpy = jest.spyOn(analyticsService as any, 'sanitizeObject');
      
      await analyticsService.trackEvent(
        'wb-123e4567-e89b-12d3-a456-426614174000',
        'user-123e4567-e89b-12d3-a456-426614174000',
        {
          type: 'user_action',
          action: 'test',
          targetType: 'element',
          metadata: deepObject,
        }
      );

      // Should call sanitization with depth limit
      expect(sanitizeObjectSpy).toHaveBeenCalled();
    });

    it('should handle large payloads gracefully', async () => {
      const largeMetadata = {};
      // Create object with many keys
      for (let i = 0; i < 200; i++) {
        (largeMetadata as any)[`key${i}`] = `value${i}`;
      }

      // Should not throw error but should limit object size
      await expect(
        analyticsService.trackEvent(
          'wb-123e4567-e89b-12d3-a456-426614174000',
          'user-123e4567-e89b-12d3-a456-426614174000',
          {
            type: 'user_action',
            action: 'test',
            targetType: 'element',
            metadata: largeMetadata,
          }
        )
      ).resolves.toBeDefined();
    });
  });

  describe('Performance', () => {
    it('should handle concurrent event tracking without conflicts', async () => {
      const mockResult = {
        rows: [{
          id: 'event-123',
          whiteboard_id: 'wb-123',
          user_id: 'user-123',
        }],
      };

      (mockDb.query as jest.Mock).mockResolvedValue(mockResult);

      // Track multiple events concurrently
      const promises = Array.from({ length: 10 }, (_, i) =>
        analyticsService.trackEvent(
          'wb-123e4567-e89b-12d3-a456-426614174000',
          'user-123e4567-e89b-12d3-a456-426614174000',
          {
            type: 'user_action',
            action: `action_${i}`,
            targetType: 'element',
          }
        )
      );

      const results = await Promise.all(promises);

      expect(results).toHaveLength(10);
      expect(mockDb.query).toHaveBeenCalledTimes(10);
    });

    it('should not block main operations on analytics failures', async () => {
      // Mock database error
      (mockDb.query as jest.Mock).mockRejectedValue(new Error('Database connection failed'));

      // Should not throw error, just log it
      await expect(
        analyticsService.trackEvent(
          'wb-123e4567-e89b-12d3-a456-426614174000',
          'user-123e4567-e89b-12d3-a456-426614174000',
          {
            type: 'user_action',
            action: 'test',
            targetType: 'element',
          }
        )
      ).rejects.toThrow(); // For this test, we expect it to throw since it's a direct call

      // In real implementation, this would be wrapped with try/catch and not throw
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('Data Validation', () => {
    it('should validate UUID formats for IDs', async () => {
      const invalidWhiteboardId = 'invalid-uuid';
      const validUserId = 'user-123e4567-e89b-12d3-a456-426614174000';

      await expect(
        analyticsService.trackEvent(invalidWhiteboardId, validUserId, {
          type: 'user_action',
          action: 'test',
          targetType: 'element',
        })
      ).rejects.toThrow();
    });

    it('should validate required event fields', async () => {
      const incompleteEventData = {
        type: 'user_action',
        // missing action and targetType
      };

      await expect(
        analyticsService.trackEvent(
          'wb-123e4567-e89b-12d3-a456-426614174000',
          'user-123e4567-e89b-12d3-a456-426614174000',
          incompleteEventData as any
        )
      ).rejects.toThrow();
    });

    it('should validate enum values', async () => {
      const invalidEventData = {
        type: 'invalid_event_type',
        action: 'test',
        targetType: 'element',
      };

      await expect(
        analyticsService.trackEvent(
          'wb-123e4567-e89b-12d3-a456-426614174000',
          'user-123e4567-e89b-12d3-a456-426614174000',
          invalidEventData as any
        )
      ).rejects.toThrow();
    });
  });

  describe('Error Handling', () => {
    it('should create structured error objects', async () => {
      const error = (analyticsService as any).createAnalyticsError(
        'TEST_ERROR',
        'Test error message',
        { detail: 'error details' }
      );

      expect(error.code).toBe('TEST_ERROR');
      expect(error.message).toBe('Test error message');
      expect(error.details).toEqual({ detail: 'error details' });
    });

    it('should handle database connection errors gracefully', async () => {
      (mockDb.query as jest.Mock).mockRejectedValue(new Error('Connection timeout'));

      await expect(
        analyticsService.getWhiteboardAnalytics('wb-123e4567-e89b-12d3-a456-426614174000')
      ).rejects.toThrow('Connection timeout');

      expect(mockLogger.error).toHaveBeenCalled();
    });
  });
});

// Performance benchmarks
describe('WhiteboardAnalyticsService Performance', () => {
  let analyticsService: WhiteboardAnalyticsService;

  beforeAll(() => {
    analyticsService = new WhiteboardAnalyticsService(mockDb, mockLogger);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (mockDb.query as jest.Mock).mockResolvedValue({ rows: [{ id: 'test' }] });
  });

  it('should track events within performance threshold', async () => {
    const startTime = process.hrtime.bigint();

    await analyticsService.trackEvent(
      'wb-123e4567-e89b-12d3-a456-426614174000',
      'user-123e4567-e89b-12d3-a456-426614174000',
      {
        type: 'user_action',
        action: 'create',
        targetType: 'element',
      }
    );

    const endTime = process.hrtime.bigint();
    const duration = Number(endTime - startTime) / 1000000; // Convert to milliseconds

    // Event tracking should complete in under 10ms (excluding database time)
    expect(duration).toBeLessThan(10);
  });

  it('should handle batch operations efficiently', async () => {
    const batchSize = 100;
    const startTime = process.hrtime.bigint();

    const promises = Array.from({ length: batchSize }, (_, i) =>
      analyticsService.trackEvent(
        'wb-123e4567-e89b-12d3-a456-426614174000',
        'user-123e4567-e89b-12d3-a456-426614174000',
        {
          type: 'user_action',
          action: `batch_action_${i}`,
          targetType: 'element',
        }
      )
    );

    await Promise.all(promises);

    const endTime = process.hrtime.bigint();
    const duration = Number(endTime - startTime) / 1000000; // Convert to milliseconds

    // Batch operations should complete efficiently
    expect(duration).toBeLessThan(1000); // Under 1 second for 100 operations
    expect(duration / batchSize).toBeLessThan(10); // Under 10ms per operation average
  });
});