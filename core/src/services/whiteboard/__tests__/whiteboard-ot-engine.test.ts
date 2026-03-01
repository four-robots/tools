/**
 * Enhanced Operational Transform Engine Tests
 * 
 * Comprehensive test suite for the advanced OT engine covering:
 * - Complex conflict detection and resolution
 * - Performance under high concurrency
 * - Vector clock consistency
 * - Compound operation handling
 * - Error scenarios and edge cases
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { 
  WhiteboardOTEngine,
  EnhancedWhiteboardOperation,
  EnhancedTransformContext,
  ConflictInfo,
  PerformanceMetrics,
  EnhancedOperationType
} from '../whiteboard-ot-engine.js';
import { Logger } from '../../../utils/logger.js';

describe('WhiteboardOTEngine', () => {
  let engine: WhiteboardOTEngine;
  let mockLogger: jest.Mocked<Logger>;
  let baseContext: EnhancedTransformContext;
  let sampleOperation: EnhancedWhiteboardOperation;

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as any;

    engine = new WhiteboardOTEngine(mockLogger);

    baseContext = {
      canvasVersion: 1,
      pendingOperations: [],
      elementStates: new Map(),
      currentVectorClock: { user1: 1 },
      lamportClock: 1,
      performanceMetrics: {
        operationCount: 0,
        averageLatency: 0,
        maxLatency: 0,
        conflictRate: 0,
        resolutionSuccessRate: 0,
        operationThroughput: 0,
        memoryUsage: 0,
        activeUsers: 1,
        queueSize: 0,
        lastUpdated: new Date().toISOString()
      },
      conflictHistory: [],
      userPriorities: {},
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

    sampleOperation = {
      id: 'op_1',
      type: 'create',
      elementId: 'element_1',
      elementType: 'rectangle',
      data: { width: 100, height: 50 },
      position: { x: 100, y: 100 },
      bounds: { x: 100, y: 100, width: 100, height: 50 },
      style: { fill: 'blue' },
      timestamp: new Date().toISOString(),
      version: 2,
      userId: 'user1',
      vectorClock: { user1: 2 },
      lamportTimestamp: 2,
      metadata: {
        clientId: 'client1',
        sessionId: 'session1',
        processingTime: 0
      }
    };
  });

  describe('Operation Transformation', () => {
    it('should transform simple operation without conflicts', async () => {
      const result = await engine.transformOperation(sampleOperation, baseContext);

      expect(result.transformedOperation).toBeDefined();
      expect(result.conflicts).toHaveLength(0);
      expect(result.performance.processingTimeMs).toBeGreaterThan(0);
      expect(result.transformedOperation.id).toBe(sampleOperation.id);
    });

    it('should detect spatial conflicts', async () => {
      const conflictingOperation: EnhancedWhiteboardOperation = {
        ...sampleOperation,
        id: 'op_2',
        userId: 'user2',
        elementId: 'element_2',
        position: { x: 110, y: 110 }, // Close to original position
        vectorClock: { user2: 1 },
        lamportTimestamp: 1
      };

      baseContext.operationQueue = [conflictingOperation];

      const result = await engine.transformOperation(sampleOperation, baseContext);

      expect(result.conflicts.length).toBeGreaterThan(0);
      expect(result.conflicts[0].type).toBe('spatial');
      expect(result.conflicts[0].spatialOverlap).toBeDefined();
    });

    it('should detect temporal conflicts', async () => {
      const temporalOperation: EnhancedWhiteboardOperation = {
        ...sampleOperation,
        id: 'op_2',
        userId: 'user2',
        elementId: 'element_1', // Same element
        timestamp: new Date(Date.now() - 100).toISOString(), // 100ms ago
        vectorClock: { user2: 1 },
        lamportTimestamp: 1
      };

      baseContext.operationQueue = [temporalOperation];

      const result = await engine.transformOperation(sampleOperation, baseContext);

      expect(result.conflicts.length).toBeGreaterThan(0);
      const temporalConflict = result.conflicts.find(c => c.type === 'temporal');
      expect(temporalConflict).toBeDefined();
      expect(temporalConflict?.temporalProximity?.timeDiffMs).toBeLessThan(1000);
    });

    it('should detect semantic conflicts', async () => {
      const semanticOperation: EnhancedWhiteboardOperation = {
        ...sampleOperation,
        id: 'op_2',
        type: 'delete',
        userId: 'user2',
        elementId: 'element_1', // Same element, different operation type
        vectorClock: { user2: 1 },
        lamportTimestamp: 1
      };

      baseContext.operationQueue = [semanticOperation];

      const result = await engine.transformOperation(sampleOperation, baseContext);

      expect(result.conflicts.length).toBeGreaterThan(0);
      const semanticConflict = result.conflicts.find(c => c.type === 'semantic');
      expect(semanticConflict).toBeDefined();
    });
  });

  describe('Compound Operations', () => {
    it('should handle compound move+resize+rotate operations', async () => {
      const compoundOperation: EnhancedWhiteboardOperation = {
        ...sampleOperation,
        type: 'compound',
        parentOperations: ['move_op', 'resize_op', 'rotate_op'],
        data: {
          moves: { x: 200, y: 200 },
          resize: { width: 150, height: 75 },
          rotation: { angle: 45 }
        }
      };

      const result = await engine.transformOperation(compoundOperation, baseContext);

      expect(result.transformedOperation.type).toBe('compound');
      expect(result.transformedOperation.data).toBeDefined();
      expect(result.performance.processingTimeMs).toBeGreaterThan(0);
    });

    it('should handle batch operations', async () => {
      const batchOperation: EnhancedWhiteboardOperation = {
        ...sampleOperation,
        type: 'batch',
        data: {
          operations: [
            { ...sampleOperation, id: 'batch_op_1' },
            { ...sampleOperation, id: 'batch_op_2', elementId: 'element_2' }
          ]
        }
      };

      const result = await engine.transformOperation(batchOperation, baseContext);

      expect(result.transformedOperation.type).toBe('batch');
      expect(result.transformedOperation.data.operations).toHaveLength(2);
    });
  });

  describe('Performance Optimization', () => {
    it('should compress multiple operations efficiently', () => {
      const operations: EnhancedWhiteboardOperation[] = [
        { ...sampleOperation, id: 'op_1', type: 'create' },
        { ...sampleOperation, id: 'op_2', type: 'update', data: { width: 120 } },
        { ...sampleOperation, id: 'op_3', type: 'style', style: { fill: 'red' } },
        { ...sampleOperation, id: 'op_4', type: 'move', position: { x: 150, y: 150 } }
      ];

      const compressed = engine.compressOperations(operations);

      expect(compressed.length).toBeLessThan(operations.length);
      // Should merge operations on the same element
      expect(compressed[0].data.width).toBe(120);
      expect(compressed[0].style.fill).toBe('red');
      expect(compressed[0].position.x).toBe(150);
    });

    it('should maintain performance under high load', async () => {
      const startTime = Date.now();
      const operations: Promise<any>[] = [];

      // Create 100 concurrent operations
      for (let i = 0; i < 100; i++) {
        const operation: EnhancedWhiteboardOperation = {
          ...sampleOperation,
          id: `op_${i}`,
          elementId: `element_${i % 10}`, // 10 different elements
          userId: `user${i % 5}`, // 5 different users
          vectorClock: { [`user${i % 5}`]: i + 1 },
          lamportTimestamp: i + 1
        };

        operations.push(engine.transformOperation(operation, baseContext));
      }

      const results = await Promise.all(operations);
      const totalTime = Date.now() - startTime;

      expect(results).toHaveLength(100);
      expect(totalTime).toBeLessThan(5000); // Should complete within 5 seconds
      
      // Check that all operations were processed
      results.forEach(result => {
        expect(result.transformedOperation).toBeDefined();
        expect(result.performance.processingTimeMs).toBeLessThan(500);
      });
    });

    it('should handle 25+ concurrent users efficiently', async () => {
      const userCount = 30;
      const operationsPerUser = 10;
      const operations: Promise<any>[] = [];

      for (let userId = 1; userId <= userCount; userId++) {
        for (let opIndex = 1; opIndex <= operationsPerUser; opIndex++) {
          const operation: EnhancedWhiteboardOperation = {
            ...sampleOperation,
            id: `user${userId}_op${opIndex}`,
            elementId: `element_${userId}_${opIndex}`,
            userId: `user${userId}`,
            vectorClock: { [`user${userId}`]: opIndex },
            lamportTimestamp: userId * 1000 + opIndex,
            position: { 
              x: (userId % 5) * 200 + Math.random() * 100, 
              y: Math.floor(userId / 5) * 200 + Math.random() * 100 
            }
          };

          operations.push(engine.transformOperation(operation, baseContext));
        }
      }

      const startTime = Date.now();
      const results = await Promise.all(operations);
      const totalTime = Date.now() - startTime;

      expect(results).toHaveLength(userCount * operationsPerUser);
      expect(totalTime).toBeLessThan(10000); // Should handle 300 operations within 10 seconds

      // Check conflict detection worked
      const conflictCount = results.reduce((total, result) => total + result.conflicts.length, 0);
      expect(conflictCount).toBeGreaterThan(0); // Should detect some conflicts with overlapping operations
    });
  });

  describe('Vector Clock Consistency', () => {
    it('should maintain causal consistency', async () => {
      const operation1: EnhancedWhiteboardOperation = {
        ...sampleOperation,
        id: 'op_1',
        userId: 'user1',
        vectorClock: { user1: 1, user2: 0 },
        lamportTimestamp: 1
      };

      const operation2: EnhancedWhiteboardOperation = {
        ...sampleOperation,
        id: 'op_2',
        userId: 'user2',
        vectorClock: { user1: 1, user2: 1 }, // Happens after operation1
        lamportTimestamp: 2,
        elementId: 'element_2'
      };

      baseContext.operationQueue = [operation1];
      const result = await engine.transformOperation(operation2, baseContext);

      expect(result.transformedOperation.vectorClock.user1).toBeGreaterThanOrEqual(1);
      expect(result.transformedOperation.vectorClock.user2).toBeGreaterThanOrEqual(1);
    });

    it('should detect concurrent operations correctly', async () => {
      const operation1: EnhancedWhiteboardOperation = {
        ...sampleOperation,
        id: 'op_1',
        userId: 'user1',
        vectorClock: { user1: 2, user2: 1 },
        lamportTimestamp: 3
      };

      const operation2: EnhancedWhiteboardOperation = {
        ...sampleOperation,
        id: 'op_2',
        userId: 'user2',
        vectorClock: { user1: 1, user2: 2 }, // Concurrent with operation1
        lamportTimestamp: 3,
        elementId: 'element_1' // Same element to force conflict
      };

      baseContext.operationQueue = [operation1];
      const result = await engine.transformOperation(operation2, baseContext);

      // Should detect temporal conflict due to concurrent operations on same element
      const conflicts = result.conflicts.filter(c => c.type === 'temporal' || c.type === 'semantic');
      expect(conflicts.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid operations gracefully', async () => {
      const invalidOperation = {
        ...sampleOperation,
        type: 'invalid_type' as EnhancedOperationType
      };

      // Should not throw but may produce warnings
      await expect(engine.transformOperation(invalidOperation, baseContext)).resolves.toBeDefined();
    });

    it('should handle corrupted vector clocks', async () => {
      const corruptedOperation: EnhancedWhiteboardOperation = {
        ...sampleOperation,
        vectorClock: null as any // Corrupted vector clock
      };

      await expect(engine.transformOperation(corruptedOperation, baseContext)).rejects.toThrow();
    });

    it('should handle memory pressure gracefully', async () => {
      // Simulate high memory usage
      const largeContext = {
        ...baseContext,
        operationQueue: new Array(10000).fill(null).map((_, i) => ({
          ...sampleOperation,
          id: `large_op_${i}`,
          elementId: `element_${i}`
        }))
      };

      const result = await engine.transformOperation(sampleOperation, largeContext);
      
      expect(result.transformedOperation).toBeDefined();
      expect(result.performance.memoryUsageMB).toBeGreaterThan(0);
    });
  });

  describe('Performance Metrics', () => {
    it('should provide accurate performance metrics', () => {
      const metrics = engine.getPerformanceMetrics();

      expect(metrics).toMatchObject({
        operationCount: expect.any(Number),
        averageLatency: expect.any(Number),
        maxLatency: expect.any(Number),
        conflictRate: expect.any(Number),
        resolutionSuccessRate: expect.any(Number),
        operationThroughput: expect.any(Number),
        memoryUsage: expect.any(Number),
        activeUsers: expect.any(Number),
        queueSize: expect.any(Number),
        lastUpdated: expect.any(String)
      });
    });

    it('should track conflict resolution success rate', async () => {
      // Create operations that will conflict
      const conflictingOps: EnhancedWhiteboardOperation[] = [
        { ...sampleOperation, id: 'op_1', userId: 'user1' },
        { ...sampleOperation, id: 'op_2', userId: 'user2', type: 'delete' }
      ];

      baseContext.operationQueue = [conflictingOps[0]];
      
      const result = await engine.transformOperation(conflictingOps[1], baseContext);
      
      expect(result.conflicts.length).toBeGreaterThan(0);
      
      const metrics = engine.getPerformanceMetrics();
      expect(metrics.conflictRate).toBeGreaterThan(0);
    });
  });

  describe('Context Management', () => {
    it('should create enhanced context from base context', () => {
      const baseCtx = {
        canvasVersion: 1,
        pendingOperations: [],
        elementStates: new Map(),
        currentVectorClock: { user1: 1 },
        lamportClock: 1
      };

      const enhancedCtx = engine.createEnhancedContext(baseCtx);

      expect(enhancedCtx).toMatchObject({
        ...baseCtx,
        performanceMetrics: expect.any(Object),
        conflictHistory: expect.any(Array),
        userPriorities: expect.any(Object),
        activeConflicts: expect.any(Map),
        operationQueue: expect.any(Array),
        compressionEnabled: true,
        batchingEnabled: true,
        adaptiveThrottling: expect.any(Object)
      });
    });

    it('should handle adaptive throttling', async () => {
      // Set very low target latency to trigger throttling
      baseContext.adaptiveThrottling.targetLatency = 10;
      
      const slowOperation: EnhancedWhiteboardOperation = {
        ...sampleOperation,
        metadata: {
          ...sampleOperation.metadata,
          processingTime: 100 // Simulated slow processing
        }
      };

      await engine.transformOperation(slowOperation, baseContext);
      
      // Throttling rate should increase due to slow processing
      expect(baseContext.adaptiveThrottling.currentRate).toBeGreaterThan(1000);
    });
  });

  describe('Edge Cases', () => {
    it('should handle operations with missing fields', async () => {
      const incompleteOperation: Partial<EnhancedWhiteboardOperation> = {
        id: 'incomplete_op',
        type: 'update',
        elementId: 'element_1',
        userId: 'user1',
        timestamp: new Date().toISOString(),
        version: 1,
        vectorClock: { user1: 1 },
        lamportTimestamp: 1
        // Missing other fields
      };

      await expect(
        engine.transformOperation(incompleteOperation as EnhancedWhiteboardOperation, baseContext)
      ).resolves.toBeDefined();
    });

    it('should handle operations on non-existent elements', async () => {
      const orphanOperation: EnhancedWhiteboardOperation = {
        ...sampleOperation,
        type: 'update',
        elementId: 'non_existent_element'
      };

      const result = await engine.transformOperation(orphanOperation, baseContext);
      
      expect(result.transformedOperation).toBeDefined();
      expect(result.transformedOperation.elementId).toBe('non_existent_element');
    });

    it('should handle extremely rapid operations', async () => {
      const rapidOperations: Promise<any>[] = [];
      const timestamp = new Date().toISOString();

      // Create 50 operations with identical timestamps
      for (let i = 0; i < 50; i++) {
        const operation: EnhancedWhiteboardOperation = {
          ...sampleOperation,
          id: `rapid_op_${i}`,
          timestamp, // Same timestamp
          elementId: 'rapid_element',
          userId: `user${i % 3}`, // 3 users
          vectorClock: { [`user${i % 3}`]: Math.floor(i / 3) + 1 },
          lamportTimestamp: Math.floor(i / 3) + 1
        };

        rapidOperations.push(engine.transformOperation(operation, baseContext));
      }

      const results = await Promise.all(rapidOperations);
      
      expect(results).toHaveLength(50);
      // Should detect multiple temporal conflicts
      const totalConflicts = results.reduce((sum, r) => sum + r.conflicts.length, 0);
      expect(totalConflicts).toBeGreaterThan(0);
    });
  });
});

describe('Performance Benchmarks', () => {
  let engine: WhiteboardOTEngine;
  let baseContext: EnhancedTransformContext;

  beforeEach(() => {
    engine = new WhiteboardOTEngine();
    baseContext = {
      canvasVersion: 1,
      pendingOperations: [],
      elementStates: new Map(),
      currentVectorClock: {},
      lamportClock: 1,
      performanceMetrics: {
        operationCount: 0,
        averageLatency: 0,
        maxLatency: 0,
        conflictRate: 0,
        resolutionSuccessRate: 0,
        operationThroughput: 0,
        memoryUsage: 0,
        activeUsers: 0,
        queueSize: 0,
        lastUpdated: new Date().toISOString()
      },
      conflictHistory: [],
      userPriorities: {},
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
  });

  it('should process 1000 operations within 500ms average latency', async () => {
    const operations: Promise<any>[] = [];
    const operationCount = 1000;

    for (let i = 0; i < operationCount; i++) {
      const operation: EnhancedWhiteboardOperation = {
        id: `benchmark_op_${i}`,
        type: i % 4 === 0 ? 'create' : i % 4 === 1 ? 'update' : i % 4 === 2 ? 'move' : 'style',
        elementId: `element_${i % 100}`, // 100 elements, multiple ops per element
        userId: `user${i % 25}`, // 25 users
        timestamp: new Date().toISOString(),
        version: i + 1,
        vectorClock: { [`user${i % 25}`]: Math.floor(i / 25) + 1 },
        lamportTimestamp: i + 1,
        data: { benchmark: true },
        position: { x: Math.random() * 1000, y: Math.random() * 1000 },
        metadata: { clientId: `client${i % 5}` }
      } as EnhancedWhiteboardOperation;

      operations.push(engine.transformOperation(operation, baseContext));
    }

    const startTime = Date.now();
    const results = await Promise.all(operations);
    const totalTime = Date.now() - startTime;

    const averageLatency = totalTime / operationCount;

    expect(results).toHaveLength(operationCount);
    expect(averageLatency).toBeLessThan(500); // Target: < 500ms average latency
    expect(totalTime).toBeLessThan(30000); // Total time < 30 seconds

    console.log(`Benchmark Results:
      - Operations: ${operationCount}
      - Total Time: ${totalTime}ms
      - Average Latency: ${averageLatency.toFixed(2)}ms
      - Throughput: ${(operationCount / totalTime * 1000).toFixed(2)} ops/sec
      - Conflicts Detected: ${results.reduce((sum, r) => sum + r.conflicts.length, 0)}
    `);
  });

  it('should handle canvas with 1000+ elements efficiently', async () => {
    // Pre-populate context with 1000 elements
    const largeQueue: EnhancedWhiteboardOperation[] = [];
    
    for (let i = 0; i < 1000; i++) {
      largeQueue.push({
        id: `existing_op_${i}`,
        type: 'create',
        elementId: `element_${i}`,
        userId: `user${i % 10}`,
        timestamp: new Date(Date.now() - (1000 - i) * 1000).toISOString(),
        version: i + 1,
        vectorClock: { [`user${i % 10}`]: Math.floor(i / 10) + 1 },
        lamportTimestamp: i + 1,
        data: { type: 'rectangle' },
        position: { x: (i % 20) * 50, y: Math.floor(i / 20) * 50 },
        metadata: {}
      } as EnhancedWhiteboardOperation);
    }

    baseContext.operationQueue = largeQueue;

    // Test new operation on this large canvas
    const newOperation: EnhancedWhiteboardOperation = {
      id: 'new_op_on_large_canvas',
      type: 'create',
      elementId: 'new_element',
      userId: 'new_user',
      timestamp: new Date().toISOString(),
      version: 1001,
      vectorClock: { new_user: 1 },
      lamportTimestamp: 1001,
      data: { type: 'circle' },
      position: { x: 500, y: 500 },
      metadata: {}
    } as EnhancedWhiteboardOperation;

    const startTime = Date.now();
    const result = await engine.transformOperation(newOperation, baseContext);
    const processingTime = Date.now() - startTime;

    expect(result.transformedOperation).toBeDefined();
    expect(processingTime).toBeLessThan(1000); // Should process within 1 second even with 1000 elements
    expect(result.performance.processingTimeMs).toBeLessThan(500);

    console.log(`Large Canvas Performance:
      - Elements: 1000
      - Processing Time: ${processingTime}ms
      - Memory Usage: ${result.performance.memoryUsageMB.toFixed(2)}MB
      - Conflicts: ${result.conflicts.length}
    `);
  });

  describe('Edge Cases - Safety Fixes', () => {
    it('should throw descriptive error when priority-user strategy receives empty operations', async () => {
      // Previously .reduce() without initial value would throw
      // "TypeError: Reduce of empty array with no initial value"
      // Fix: guard with operations.length check
      const emptyConflict: ConflictInfo = {
        id: 'conflict-empty',
        type: 'concurrent_modification',
        severity: 'high',
        operations: [],
        detectedAt: new Date(),
        affectedElements: [],
        vectorClockDivergence: 0,
      };

      const resolver = (engine as any).resolutionStrategies.get('priority-user');
      expect(resolver).toBeDefined();

      await expect(resolver(emptyConflict))
        .rejects.toThrow('Cannot resolve conflict with no operations');
    });

    it('should resolve priority-user strategy with single operation', async () => {
      const singleOpConflict: ConflictInfo = {
        id: 'conflict-single',
        type: 'concurrent_modification',
        severity: 'low',
        operations: [{
          ...sampleOperation,
          userId: 'user-alpha',
        }],
        detectedAt: new Date(),
        affectedElements: ['elem-1'],
        vectorClockDivergence: 0,
      };

      const resolver = (engine as any).resolutionStrategies.get('priority-user');
      const result = await resolver(singleOpConflict);

      expect(result).toBeDefined();
      expect(result.userId).toBe('user-alpha');
    });
  });
});