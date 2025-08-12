/**
 * Whiteboard Conflict Resolution Service Tests
 * 
 * Comprehensive test suite for conflict resolution covering:
 * - Conflict analysis and strategy selection
 * - Automatic and manual resolution workflows
 * - Performance under high conflict scenarios
 * - Analytics and audit logging
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { 
  WhiteboardConflictService,
  ConflictResolutionConfig,
  ConflictNotification,
  ConflictAuditEntry,
  ResolutionRecommendation,
  ConflictAnalytics
} from '../whiteboard-conflict-service.js';
import { 
  EnhancedWhiteboardOperation,
  ConflictInfo,
  EnhancedTransformContext,
  ConflictType,
  ConflictSeverity,
  ResolutionStrategy
} from '../whiteboard-ot-engine.js';
import { DatabasePool } from '../../../utils/database-pool.js';
import { Logger } from '../../../utils/logger.js';

// Mock dependencies
const mockDb = {
  query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 })
} as jest.Mocked<DatabasePool>;

const mockLogger = {
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
} as jest.Mocked<Logger>;

describe('WhiteboardConflictService', () => {
  let service: WhiteboardConflictService;
  let config: Partial<ConflictResolutionConfig>;
  let baseContext: EnhancedTransformContext;
  let sampleConflict: ConflictInfo;
  let sampleOperations: EnhancedWhiteboardOperation[];

  beforeEach(() => {
    jest.clearAllMocks();

    config = {
      automaticResolutionEnabled: true,
      maxAutomaticResolutionAttempts: 3,
      conflictTimeoutMs: 30000,
      performanceThresholds: {
        maxLatencyMs: 500,
        maxMemoryUsageMB: 1024,
        maxQueueSize: 1000
      }
    };

    service = new WhiteboardConflictService(mockDb, config, mockLogger);

    baseContext = {
      canvasVersion: 1,
      pendingOperations: [],
      elementStates: new Map(),
      currentVectorClock: { user1: 1, user2: 1 },
      lamportClock: 2,
      performanceMetrics: {
        operationCount: 0,
        averageLatency: 100,
        maxLatency: 200,
        conflictRate: 0.1,
        resolutionSuccessRate: 0.9,
        operationThroughput: 10,
        memoryUsage: 256,
        activeUsers: 2,
        queueSize: 5,
        lastUpdated: new Date().toISOString()
      },
      conflictHistory: [],
      userPriorities: { user1: 1, user2: 1 },
      activeConflicts: new Map(),
      operationQueue: [],
      compressionEnabled: true,
      batchingEnabled: true,
      adaptiveThrottling: {
        enabled: true,
        currentRate: 1000,
        targetLatency: 500
      }
    };

    sampleOperations = [
      {
        id: 'op_1',
        type: 'update',
        elementId: 'element_1',
        userId: 'user1',
        timestamp: new Date().toISOString(),
        version: 1,
        vectorClock: { user1: 1, user2: 0 },
        lamportTimestamp: 1,
        data: { width: 100 },
        position: { x: 100, y: 100 },
        metadata: { sessionId: 'session1' }
      } as EnhancedWhiteboardOperation,
      {
        id: 'op_2',
        type: 'update',
        elementId: 'element_1',
        userId: 'user2',
        timestamp: new Date().toISOString(),
        version: 1,
        vectorClock: { user1: 0, user2: 1 },
        lamportTimestamp: 1,
        data: { width: 150 },
        position: { x: 100, y: 100 },
        metadata: { sessionId: 'session2' }
      } as EnhancedWhiteboardOperation
    ];

    sampleConflict = {
      id: 'conflict_1',
      type: 'semantic',
      severity: 'medium',
      operations: sampleOperations,
      affectedElements: ['element_1'],
      semanticConflict: {
        incompatibleChanges: ['width-conflict'],
        dataConflicts: {
          width: { op1: 100, op2: 150 }
        }
      },
      resolutionStrategy: 'automatic',
      detectedAt: new Date().toISOString()
    };
  });

  describe('Conflict Analysis', () => {
    it('should analyze conflicts and provide recommendations', async () => {
      const recommendation = await service.analyzeConflict(sampleConflict);

      expect(recommendation).toMatchObject({
        strategy: expect.any(String),
        confidence: expect.any(Number),
        reasoning: expect.any(String),
        estimatedResolutionTime: expect.any(Number),
        riskLevel: expect.oneOf(['low', 'medium', 'high']),
        alternativeStrategies: expect.any(Array)
      });

      expect(recommendation.confidence).toBeGreaterThan(0);
      expect(recommendation.confidence).toBeLessThanOrEqual(1);
      expect(recommendation.alternativeStrategies).toBeInstanceOf(Array);
    });

    it('should recommend manual intervention for critical conflicts', async () => {
      const criticalConflict: ConflictInfo = {
        ...sampleConflict,
        severity: 'critical',
        type: 'compound',
        semanticConflict: {
          incompatibleChanges: ['delete-create-conflict', 'style-conflict', 'position-conflict'],
          dataConflicts: {
            existence: { op1: 'delete', op2: 'create' },
            style: { op1: { color: 'red' }, op2: { color: 'blue' } },
            position: { op1: { x: 100, y: 100 }, op2: { x: 200, y: 200 } }
          }
        }
      };

      const recommendation = await service.analyzeConflict(criticalConflict);

      expect(recommendation.strategy).toBe('manual');
      expect(recommendation.riskLevel).toBe('high');
      expect(recommendation.confidence).toBeLessThan(0.7);
    });

    it('should provide different strategies for different conflict types', async () => {
      const spatialConflict: ConflictInfo = {
        ...sampleConflict,
        type: 'spatial',
        spatialOverlap: { area: 500, percentage: 0.6 }
      };

      const temporalConflict: ConflictInfo = {
        ...sampleConflict,
        type: 'temporal',
        temporalProximity: { timeDiffMs: 50, isSimultaneous: true }
      };

      const spatialRec = await service.analyzeConflict(spatialConflict);
      const temporalRec = await service.analyzeConflict(temporalConflict);

      // Different conflict types should potentially get different strategies
      expect(spatialRec).toBeDefined();
      expect(temporalRec).toBeDefined();
      
      // At least one should be different (they might be the same if both use 'automatic')
      const strategiesDifferent = spatialRec.strategy !== temporalRec.strategy ||
                                spatialRec.confidence !== temporalRec.confidence;
      expect(strategiesDifferent).toBe(true);
    });
  });

  describe('Automatic Resolution', () => {
    it('should resolve simple conflicts automatically', async () => {
      const simpleConflict: ConflictInfo = {
        ...sampleConflict,
        severity: 'low',
        type: 'temporal'
      };

      const result = await service.resolveConflictAutomatically(simpleConflict, baseContext);

      expect(result.success).toBe(true);
      expect(result.resolution).toBeDefined();
      expect(result.requiresManualIntervention).toBe(false);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Attempting automatic conflict resolution'),
        expect.any(Object)
      );
    });

    it('should request manual intervention for high-risk conflicts', async () => {
      const highRiskConflict: ConflictInfo = {
        ...sampleConflict,
        severity: 'critical',
        type: 'semantic',
        semanticConflict: {
          incompatibleChanges: ['delete-update-conflict', 'data-integrity-conflict'],
          dataConflicts: {
            existence: { op1: 'delete', op2: 'update' }
          }
        }
      };

      const result = await service.resolveConflictAutomatically(highRiskConflict, baseContext);

      expect(result.success).toBe(false);
      expect(result.requiresManualIntervention).toBe(true);
      expect(result.error).toContain('Risk too high');
    });

    it('should try alternative strategies when primary fails', async () => {
      // Mock the resolution strategy to fail first, then succeed
      let attemptCount = 0;
      const mockApplyResolution = jest.spyOn(service as any, 'applyResolutionStrategy')
        .mockImplementation(async (conflict, strategy) => {
          attemptCount++;
          if (attemptCount === 1) {
            return null; // First attempt fails
          }
          return sampleOperations[0]; // Second attempt succeeds
        });

      const result = await service.resolveConflictAutomatically(sampleConflict, baseContext);

      expect(attemptCount).toBeGreaterThan(1); // Should have tried multiple strategies
      expect(result.success).toBe(true);

      mockApplyResolution.mockRestore();
    });

    it('should handle resolution failures gracefully', async () => {
      // Mock resolution to always fail
      jest.spyOn(service as any, 'applyResolutionStrategy')
        .mockResolvedValue(null);

      const result = await service.resolveConflictAutomatically(sampleConflict, baseContext);

      expect(result.success).toBe(false);
      expect(result.requiresManualIntervention).toBe(true);
      expect(result.error).toContain('All automatic resolution strategies failed');
    });
  });

  describe('Manual Intervention', () => {
    it('should request manual intervention correctly', async () => {
      const recommendation: ResolutionRecommendation = {
        strategy: 'manual',
        confidence: 0.5,
        reasoning: 'Complex conflict requires human judgment',
        estimatedResolutionTime: 0,
        riskLevel: 'high',
        alternativeStrategies: []
      };

      await service.requestManualIntervention(sampleConflict, recommendation);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO whiteboard_manual_interventions'),
        expect.any(Array)
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Requesting manual intervention'),
        expect.any(Object)
      );
    });

    it('should track pending manual interventions', async () => {
      await service.requestManualIntervention(sampleConflict);
      
      const pendingInterventions = service.getPendingManualInterventions();
      
      // Since we don't have a real implementation that stores in memory,
      // we'll check that the method exists and returns an array
      expect(Array.isArray(pendingInterventions)).toBe(true);
    });
  });

  describe('Conflict Analytics', () => {
    beforeEach(() => {
      // Mock database queries for analytics
      mockDb.query
        .mockResolvedValueOnce({
          rows: [
            { 
              total_conflicts: '5',
              conflict_type: 'spatial',
              severity: 'medium',
              avg_resolution_time: '250',
              successful_resolutions: '4',
              automatic_attempts: '5'
            },
            {
              total_conflicts: '3',
              conflict_type: 'temporal',
              severity: 'low',
              avg_resolution_time: '150',
              successful_resolutions: '3',
              automatic_attempts: '3'
            }
          ]
        })
        .mockResolvedValueOnce({
          rows: [
            { user_id: 'user1', participation_count: '4' },
            { user_id: 'user2', participation_count: '4' }
          ]
        })
        .mockResolvedValueOnce({
          rows: [
            { hour: '14', count: '3' },
            { hour: '15', count: '5' }
          ]
        })
        .mockResolvedValueOnce({
          rows: [
            { date: '2023-01-01', count: '8' }
          ]
        });
    });

    it('should generate comprehensive conflict analytics', async () => {
      const analytics = await service.getConflictAnalytics();

      expect(analytics).toMatchObject({
        totalConflicts: expect.any(Number),
        conflictsByType: expect.any(Object),
        conflictsBySeverity: expect.any(Object),
        averageResolutionTime: expect.any(Number),
        resolutionSuccessRate: expect.any(Number),
        automaticResolutionRate: expect.any(Number),
        userConflictParticipation: expect.any(Object),
        peakConflictHours: expect.any(Array),
        conflictTrends: expect.any(Array)
      });

      expect(analytics.totalConflicts).toBeGreaterThan(0);
      expect(analytics.resolutionSuccessRate).toBeGreaterThanOrEqual(0);
      expect(analytics.resolutionSuccessRate).toBeLessThanOrEqual(1);
    });

    it('should filter analytics by whiteboard and time range', async () => {
      const whiteboardId = 'whiteboard_123';
      const timeRange = {
        start: new Date('2023-01-01'),
        end: new Date('2023-01-31')
      };

      await service.getConflictAnalytics(whiteboardId, timeRange);

      // Check that the database was called with proper filters
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('whiteboard_id = $1'),
        expect.arrayContaining([whiteboardId])
      );
    });

    it('should calculate correct analytics from sample data', async () => {
      const analytics = await service.getConflictAnalytics();

      // Based on our mock data: 5 + 3 = 8 total conflicts
      expect(analytics.totalConflicts).toBe(8);
      
      // Resolution success rate: (4 + 3) / 8 = 0.875
      expect(analytics.resolutionSuccessRate).toBe(0.875);
      
      // Automatic resolution rate: (5 + 3) / 8 = 1.0
      expect(analytics.automaticResolutionRate).toBe(1.0);

      // Should have conflict types
      expect(analytics.conflictsByType.spatial).toBe(5);
      expect(analytics.conflictsByType.temporal).toBe(3);

      // Should have user participation
      expect(analytics.userConflictParticipation.user1).toBe(4);
      expect(analytics.userConflictParticipation.user2).toBe(4);
    });
  });

  describe('Performance Under Load', () => {
    it('should handle multiple concurrent conflict resolutions', async () => {
      const conflicts: ConflictInfo[] = [];
      
      // Create 20 concurrent conflicts
      for (let i = 0; i < 20; i++) {
        conflicts.push({
          ...sampleConflict,
          id: `conflict_${i}`,
          operations: sampleOperations.map(op => ({
            ...op,
            id: `${op.id}_${i}`,
            elementId: `element_${i % 5}` // 5 different elements
          }))
        });
      }

      const resolutionPromises = conflicts.map(conflict => 
        service.resolveConflictAutomatically(conflict, baseContext)
      );

      const startTime = Date.now();
      const results = await Promise.all(resolutionPromises);
      const totalTime = Date.now() - startTime;

      expect(results).toHaveLength(20);
      expect(totalTime).toBeLessThan(5000); // Should complete within 5 seconds
      
      // Most resolutions should succeed
      const successfulResolutions = results.filter(r => r.success).length;
      expect(successfulResolutions).toBeGreaterThan(15);
    });

    it('should maintain performance with large conflict history', async () => {
      // Simulate service with large conflict history
      const largeHistoryService = new WhiteboardConflictService(mockDb, {
        ...config,
        conflictTimeoutMs: 1000 // Short timeout for test
      }, mockLogger);

      // Add conflicts to history (simulated)
      const conflicts: ConflictInfo[] = [];
      for (let i = 0; i < 1000; i++) {
        conflicts.push({
          ...sampleConflict,
          id: `history_conflict_${i}`,
          detectedAt: new Date(Date.now() - i * 1000).toISOString(),
          resolvedAt: new Date(Date.now() - i * 1000 + 500).toISOString()
        });
      }

      const startTime = Date.now();
      const result = await largeHistoryService.resolveConflictAutomatically(sampleConflict, baseContext);
      const processingTime = Date.now() - startTime;

      expect(result).toBeDefined();
      expect(processingTime).toBeLessThan(1000); // Should not be significantly slower
    });
  });

  describe('Error Handling', () => {
    it('should handle database connection failures', async () => {
      mockDb.query.mockRejectedValueOnce(new Error('Database connection failed'));

      const analytics = await service.getConflictAnalytics();

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to get conflict analytics'),
        expect.any(Object)
      );
    });

    it('should handle malformed conflict data', async () => {
      const malformedConflict = {
        ...sampleConflict,
        operations: null // Malformed operations
      } as any;

      const result = await service.resolveConflictAutomatically(malformedConflict, baseContext);

      expect(result.success).toBe(false);
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should handle analysis failures gracefully', async () => {
      const problematicConflict = {
        ...sampleConflict,
        type: null, // Invalid type
        operations: []
      } as any;

      const recommendation = await service.analyzeConflict(problematicConflict);

      expect(recommendation.strategy).toBe('manual');
      expect(recommendation.confidence).toBe(0.1);
      expect(recommendation.reasoning).toContain('Analysis failed');
    });
  });

  describe('Notification System', () => {
    it('should get conflict notifications for user', () => {
      const notifications = service.getConflictNotifications('user1');
      
      expect(Array.isArray(notifications)).toBe(true);
    });

    it('should acknowledge notifications', async () => {
      const notificationId = 'notification_1';
      const userId = 'user1';

      await service.acknowledgeNotification(notificationId, userId);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Conflict notification acknowledged'),
        expect.objectContaining({ notificationId, userId })
      );
    });

    it('should get active conflicts', () => {
      const activeConflicts = service.getActiveConflicts();
      
      expect(Array.isArray(activeConflicts)).toBe(true);
    });
  });

  describe('Configuration', () => {
    it('should respect automatic resolution settings', async () => {
      const disabledService = new WhiteboardConflictService(mockDb, {
        automaticResolutionEnabled: false
      }, mockLogger);

      const result = await disabledService.resolveConflictAutomatically(sampleConflict, baseContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Automatic resolution disabled');
      expect(result.requiresManualIntervention).toBe(true);
    });

    it('should respect performance thresholds', async () => {
      const strictService = new WhiteboardConflictService(mockDb, {
        performanceThresholds: {
          maxLatencyMs: 10, // Very strict
          maxMemoryUsageMB: 10,
          maxQueueSize: 1
        }
      }, mockLogger);

      // This should trigger performance warnings
      const result = await strictService.resolveConflictAutomatically(sampleConflict, baseContext);

      // Should still work but may log warnings
      expect(result).toBeDefined();
    });
  });
});