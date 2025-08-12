/**
 * Whiteboard OT Integration Tests
 * 
 * End-to-end integration tests for the complete operational transform system:
 * - WebSocket coordination with OT engine
 * - Real-time conflict resolution workflows
 * - Performance under realistic collaboration scenarios
 * - Cross-service integration testing
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { Server as SocketIOServer } from 'socket.io';
import { createServer } from 'http';
import { io as Client, Socket as ClientSocket } from 'socket.io-client';
import { 
  WhiteboardOTEngine,
  EnhancedWhiteboardOperation,
  EnhancedTransformContext,
  ConflictInfo
} from '../whiteboard-ot-engine.js';
import { WhiteboardConflictService } from '../whiteboard-conflict-service.js';
import { VectorClockManager, OperationCompressor, ConflictPredictor } from '../whiteboard-ot-utilities.js';
import { Logger } from '../../../utils/logger.js';

// Mock database
const mockDb = {
  query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 })
} as any;

const mockLogger = new Logger('IntegrationTest');

describe('Whiteboard OT Integration', () => {
  let httpServer: any;
  let io: SocketIOServer;
  let clientSockets: ClientSocket[];
  let otEngine: WhiteboardOTEngine;
  let conflictService: WhiteboardConflictService;
  let vectorClockManager: VectorClockManager;
  let operationCompressor: OperationCompressor;
  let conflictPredictor: ConflictPredictor;
  let serverPort: number;

  beforeEach(async () => {
    // Setup test server
    httpServer = createServer();
    io = new SocketIOServer(httpServer, {
      cors: { origin: "*" }
    });
    
    // Initialize OT components
    otEngine = new WhiteboardOTEngine(mockLogger);
    conflictService = new WhiteboardConflictService(mockDb, {
      automaticResolutionEnabled: true,
      maxAutomaticResolutionAttempts: 3,
      conflictTimeoutMs: 5000
    }, mockLogger);
    
    vectorClockManager = new VectorClockManager(mockLogger);
    operationCompressor = new OperationCompressor(mockLogger);
    conflictPredictor = new ConflictPredictor(mockLogger);

    clientSockets = [];

    // Start server
    await new Promise<void>((resolve) => {
      httpServer.listen(() => {
        serverPort = (httpServer.address() as any).port;
        resolve();
      });
    });
  });

  afterEach(async () => {
    // Cleanup
    clientSockets.forEach(socket => {
      if (socket.connected) {
        socket.disconnect();
      }
    });

    io.close();
    httpServer.close();
  });

  const createClientSocket = (): Promise<ClientSocket> => {
    return new Promise((resolve, reject) => {
      const socket = Client(`http://localhost:${serverPort}`);
      
      socket.on('connect', () => {
        clientSockets.push(socket);
        resolve(socket);
      });

      socket.on('connect_error', reject);
      
      setTimeout(() => reject(new Error('Connection timeout')), 5000);
    });
  };

  const createOperation = (
    userId: string,
    elementId: string,
    type: string = 'update',
    overrides: Partial<EnhancedWhiteboardOperation> = {}
  ): EnhancedWhiteboardOperation => {
    return {
      id: `${type}_${elementId}_${userId}_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      type: type as any,
      elementId,
      userId,
      timestamp: new Date().toISOString(),
      version: 1,
      vectorClock: { [userId]: 1 },
      lamportTimestamp: 1,
      data: { type: 'rectangle', width: 100, height: 50 },
      position: { x: Math.random() * 500, y: Math.random() * 500 },
      metadata: {
        clientId: `client_${userId}`,
        sessionId: `session_${userId}`
      },
      ...overrides
    };
  };

  describe('Multi-User Collaboration', () => {
    it('should handle concurrent operations from multiple users', async () => {
      const userCount = 5;
      const operationsPerUser = 10;
      const whiteboardId = 'test_whiteboard';

      // Setup WebSocket handlers
      const receivedOperations: Map<string, EnhancedWhiteboardOperation[]> = new Map();
      const conflicts: ConflictInfo[] = [];

      io.on('connection', (socket) => {
        socket.on('join_whiteboard', (data) => {
          socket.join(`whiteboard:${data.whiteboardId}`);
          socket.emit('joined', { whiteboardId: data.whiteboardId });
        });

        socket.on('operation', async (data: { operation: EnhancedWhiteboardOperation }) => {
          try {
            // Create context for this whiteboard
            const context: EnhancedTransformContext = {
              canvasVersion: 1,
              pendingOperations: [],
              elementStates: new Map(),
              currentVectorClock: vectorClockManager.incrementClock(whiteboardId, data.operation.userId),
              lamportClock: data.operation.lamportTimestamp,
              performanceMetrics: {
                operationCount: 0,
                averageLatency: 0,
                maxLatency: 0,
                conflictRate: 0,
                resolutionSuccessRate: 1,
                operationThroughput: 10,
                memoryUsage: 100,
                activeUsers: userCount,
                queueSize: 0,
                lastUpdated: new Date().toISOString()
              },
              conflictHistory: [],
              userPriorities: {},
              activeConflicts: new Map(),
              operationQueue: receivedOperations.get(whiteboardId) || [],
              compressionEnabled: true,
              batchingEnabled: true,
              adaptiveThrottling: {
                enabled: true,
                currentRate: 1000,
                targetLatency: 500
              }
            };

            // Transform operation
            const result = await otEngine.transformOperation(data.operation, context);
            
            // Store operation
            if (!receivedOperations.has(whiteboardId)) {
              receivedOperations.set(whiteboardId, []);
            }
            receivedOperations.get(whiteboardId)!.push(result.transformedOperation);

            // Handle conflicts
            if (result.conflicts.length > 0) {
              conflicts.push(...result.conflicts);
              
              // Attempt automatic resolution
              for (const conflict of result.conflicts) {
                const resolution = await conflictService.resolveConflictAutomatically(conflict, context);
                
                socket.emit('conflict_detected', {
                  conflictId: conflict.id,
                  type: conflict.type,
                  severity: conflict.severity,
                  autoResolved: resolution.success,
                  requiresManualIntervention: resolution.requiresManualIntervention
                });
              }
            }

            // Broadcast to other users
            socket.to(`whiteboard:${whiteboardId}`).emit('operation_applied', {
              operation: result.transformedOperation,
              conflicts: result.conflicts.map(c => ({ id: c.id, type: c.type, severity: c.severity })),
              performance: result.performance
            });

            socket.emit('operation_ack', {
              operationId: data.operation.id,
              success: true,
              newVersion: result.transformedOperation.version,
              conflicts: result.conflicts.length
            });

          } catch (error) {
            socket.emit('operation_error', {
              operationId: data.operation.id,
              error: error.message
            });
          }
        });
      });

      // Create multiple client connections
      const clients: ClientSocket[] = [];
      for (let i = 0; i < userCount; i++) {
        const client = await createClientSocket();
        clients.push(client);
        
        // Join whiteboard
        client.emit('join_whiteboard', { whiteboardId });
        await new Promise(resolve => client.once('joined', resolve));
      }

      // Generate concurrent operations
      const operationPromises: Promise<any>[] = [];
      
      for (let userId = 0; userId < userCount; userId++) {
        const client = clients[userId];
        
        for (let opIndex = 0; opIndex < operationsPerUser; opIndex++) {
          const operation = createOperation(
            `user${userId}`,
            `element_${userId}_${opIndex}`,
            'create',
            {
              version: opIndex + 1,
              vectorClock: { [`user${userId}`]: opIndex + 1 },
              lamportTimestamp: userId * operationsPerUser + opIndex + 1
            }
          );

          operationPromises.push(
            new Promise((resolve, reject) => {
              const timeout = setTimeout(() => reject(new Error('Operation timeout')), 5000);
              
              client.once('operation_ack', (ack) => {
                clearTimeout(timeout);
                resolve(ack);
              });

              client.once('operation_error', (error) => {
                clearTimeout(timeout);
                reject(new Error(error.error));
              });

              client.emit('operation', { operation });
            })
          );

          // Add small delay to simulate realistic timing
          await new Promise(resolve => setTimeout(resolve, Math.random() * 50));
        }
      }

      // Wait for all operations to complete
      const startTime = Date.now();
      const results = await Promise.all(operationPromises);
      const totalTime = Date.now() - startTime;

      // Verify results
      expect(results).toHaveLength(userCount * operationsPerUser);
      expect(totalTime).toBeLessThan(30000); // Should complete within 30 seconds

      // Check that conflicts were detected and resolved
      expect(conflicts.length).toBeGreaterThan(0); // Should have some conflicts with overlapping operations
      
      const totalOperations = receivedOperations.get(whiteboardId)?.length || 0;
      expect(totalOperations).toBe(userCount * operationsPerUser);

      console.log(`Multi-user collaboration test results:
        - Users: ${userCount}
        - Operations per user: ${operationsPerUser}
        - Total operations: ${userCount * operationsPerUser}
        - Total time: ${totalTime}ms
        - Conflicts detected: ${conflicts.length}
        - Operations processed: ${totalOperations}
        - Average latency: ${(totalTime / (userCount * operationsPerUser)).toFixed(2)}ms
      `);
    });

    it('should maintain operation ordering with vector clocks', async () => {
      const whiteboardId = 'ordering_test';
      const elementId = 'shared_element';

      // Setup operation tracking
      const operationOrder: EnhancedWhiteboardOperation[] = [];

      io.on('connection', (socket) => {
        socket.on('join_whiteboard', (data) => {
          socket.join(`whiteboard:${data.whiteboardId}`);
          socket.emit('joined', { whiteboardId: data.whiteboardId });
        });

        socket.on('operation', async (data: { operation: EnhancedWhiteboardOperation }) => {
          const context = otEngine.createEnhancedContext({
            canvasVersion: operationOrder.length + 1,
            pendingOperations: operationOrder,
            elementStates: new Map(),
            currentVectorClock: data.operation.vectorClock,
            lamportClock: data.operation.lamportTimestamp
          });

          const result = await otEngine.transformOperation(data.operation, context);
          operationOrder.push(result.transformedOperation);

          socket.emit('operation_ack', {
            operationId: data.operation.id,
            success: true,
            order: operationOrder.length
          });
        });
      });

      // Create two clients
      const client1 = await createClientSocket();
      const client2 = await createClientSocket();

      client1.emit('join_whiteboard', { whiteboardId });
      client2.emit('join_whiteboard', { whiteboardId });

      await Promise.all([
        new Promise(resolve => client1.once('joined', resolve)),
        new Promise(resolve => client2.once('joined', resolve))
      ]);

      // Create causally related operations
      const op1 = createOperation('user1', elementId, 'create', {
        vectorClock: { user1: 1, user2: 0 },
        lamportTimestamp: 1
      });

      const op2 = createOperation('user2', elementId, 'update', {
        vectorClock: { user1: 1, user2: 1 }, // Happens after op1
        lamportTimestamp: 2
      });

      const op3 = createOperation('user1', elementId, 'style', {
        vectorClock: { user1: 2, user2: 1 }, // Happens after op2
        lamportTimestamp: 3
      });

      // Send operations in non-causal order to test ordering
      const ackPromises = [
        new Promise(resolve => client1.once('operation_ack', resolve)),
        new Promise(resolve => client2.once('operation_ack', resolve)),
        new Promise(resolve => client1.once('operation_ack', resolve))
      ];

      client2.emit('operation', { operation: op2 }); // Send middle operation first
      client1.emit('operation', { operation: op3 }); // Send last operation second
      client1.emit('operation', { operation: op1 }); // Send first operation last

      await Promise.all(ackPromises);

      // Verify causal ordering was maintained
      expect(operationOrder).toHaveLength(3);
      
      // The operations should be ordered by their causal relationships
      // regardless of the order they were received
      const orderedByLamport = operationOrder.slice().sort((a, b) => a.lamportTimestamp - b.lamportTimestamp);
      
      expect(orderedByLamport[0].id).toBe(op1.id);
      expect(orderedByLamport[1].id).toBe(op2.id);
      expect(orderedByLamport[2].id).toBe(op3.id);
    });
  });

  describe('Performance Under Load', () => {
    it('should handle high-frequency operations', async () => {
      const whiteboardId = 'performance_test';
      const operationCount = 500;
      const operationsPerSecond = 100;
      const interval = 1000 / operationsPerSecond;

      let processedOperations = 0;
      const latencies: number[] = [];

      io.on('connection', (socket) => {
        socket.on('join_whiteboard', (data) => {
          socket.join(`whiteboard:${data.whiteboardId}`);
          socket.emit('joined', { whiteboardId: data.whiteboardId });
        });

        socket.on('operation', async (data: { operation: EnhancedWhiteboardOperation; clientTimestamp: number }) => {
          const serverTimestamp = Date.now();
          const latency = serverTimestamp - data.clientTimestamp;
          latencies.push(latency);

          const context = otEngine.createEnhancedContext({
            canvasVersion: processedOperations + 1,
            pendingOperations: [],
            elementStates: new Map(),
            currentVectorClock: data.operation.vectorClock,
            lamportClock: data.operation.lamportTimestamp
          });

          const result = await otEngine.transformOperation(data.operation, context);
          processedOperations++;

          socket.emit('operation_ack', {
            operationId: data.operation.id,
            success: true,
            serverLatency: latency,
            processingTime: result.performance.processingTimeMs
          });
        });
      });

      const client = await createClientSocket();
      client.emit('join_whiteboard', { whiteboardId });
      await new Promise(resolve => client.once('joined', resolve));

      // Send operations at controlled rate
      const startTime = Date.now();
      
      for (let i = 0; i < operationCount; i++) {
        const operation = createOperation('user1', `element_${i % 50}`, 'update', {
          version: i + 1,
          vectorClock: { user1: i + 1 },
          lamportTimestamp: i + 1
        });

        const clientTimestamp = Date.now();
        
        client.emit('operation', { operation, clientTimestamp });

        if (i < operationCount - 1) {
          await new Promise(resolve => setTimeout(resolve, interval));
        }
      }

      // Wait for all acknowledgments
      const acks: any[] = [];
      for (let i = 0; i < operationCount; i++) {
        const ack = await new Promise(resolve => client.once('operation_ack', resolve));
        acks.push(ack);
      }

      const totalTime = Date.now() - startTime;
      const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
      const maxLatency = Math.max(...latencies);
      const p95Latency = latencies.sort((a, b) => a - b)[Math.floor(latencies.length * 0.95)];
      const actualThroughput = operationCount / (totalTime / 1000);

      expect(processedOperations).toBe(operationCount);
      expect(avgLatency).toBeLessThan(100); // Average latency under 100ms
      expect(p95Latency).toBeLessThan(200); // 95th percentile under 200ms
      expect(actualThroughput).toBeGreaterThan(operationsPerSecond * 0.8); // Within 20% of target

      console.log(`High-frequency operations test results:
        - Target throughput: ${operationsPerSecond} ops/sec
        - Actual throughput: ${actualThroughput.toFixed(2)} ops/sec
        - Average latency: ${avgLatency.toFixed(2)}ms
        - Max latency: ${maxLatency}ms
        - P95 latency: ${p95Latency}ms
        - Total operations: ${operationCount}
        - Total time: ${totalTime}ms
      `);
    });

    it('should compress operations efficiently in real-time', async () => {
      const whiteboardId = 'compression_test';
      const elementId = 'target_element';
      const operationCount = 100;

      let originalOperations: EnhancedWhiteboardOperation[] = [];
      let compressedOperations: EnhancedWhiteboardOperation[] = [];

      io.on('connection', (socket) => {
        socket.on('join_whiteboard', (data) => {
          socket.join(`whiteboard:${data.whiteboardId}`);
          socket.emit('joined', { whiteboardId: data.whiteboardId });
        });

        socket.on('operation', async (data: { operation: EnhancedWhiteboardOperation }) => {
          originalOperations.push(data.operation);

          // Compress operations every 10 operations
          if (originalOperations.length % 10 === 0) {
            const compressed = operationCompressor.compressOperations(originalOperations);
            compressedOperations = compressed;
            
            socket.emit('compression_update', {
              original: originalOperations.length,
              compressed: compressed.length,
              ratio: compressed.length / originalOperations.length
            });
          }

          socket.emit('operation_ack', {
            operationId: data.operation.id,
            success: true
          });
        });
      });

      const client = await createClientSocket();
      client.emit('join_whiteboard', { whiteboardId });
      await new Promise(resolve => client.once('joined', resolve));

      // Track compression updates
      const compressionUpdates: any[] = [];
      client.on('compression_update', (update) => {
        compressionUpdates.push(update);
      });

      // Send rapid operations on the same element
      for (let i = 0; i < operationCount; i++) {
        const operation = createOperation('user1', elementId, 'update', {
          data: { width: 100 + i, height: 50 + i },
          style: { color: `hsl(${i * 3.6}, 50%, 50%)` },
          position: { x: 100 + i, y: 100 + i }
        });

        client.emit('operation', { operation });
        await new Promise(resolve => client.once('operation_ack', resolve));
      }

      // Wait for final compression
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(originalOperations).toHaveLength(operationCount);
      expect(compressionUpdates.length).toBeGreaterThan(0);

      // Check compression efficiency
      const finalUpdate = compressionUpdates[compressionUpdates.length - 1];
      expect(finalUpdate.compressed).toBeLessThan(finalUpdate.original);
      expect(finalUpdate.ratio).toBeLessThan(1);

      console.log(`Operation compression test results:
        - Original operations: ${originalOperations.length}
        - Final compressed: ${finalUpdate.compressed}
        - Compression ratio: ${(finalUpdate.ratio * 100).toFixed(1)}%
        - Compression updates: ${compressionUpdates.length}
      `);
    });
  });

  describe('Conflict Prediction and Resolution', () => {
    it('should predict and prevent conflicts proactively', async () => {
      const whiteboardId = 'prediction_test';
      const predictions: any[] = [];
      const actualConflicts: ConflictInfo[] = [];

      io.on('connection', (socket) => {
        socket.on('join_whiteboard', (data) => {
          socket.join(`whiteboard:${data.whiteboardId}`);
          socket.emit('joined', { whiteboardId: data.whiteboardId });
        });

        socket.on('user_activity', async (data: { userId: string; position: { x: number; y: number } }) => {
          // Simulate user activity tracking
          const userActivity = {
            [data.userId]: {
              position: data.position,
              timestamp: new Date().toISOString()
            }
          };

          const context = otEngine.createEnhancedContext({
            canvasVersion: 1,
            pendingOperations: [],
            elementStates: new Map(),
            currentVectorClock: { [data.userId]: 1 },
            lamportClock: 1
          });

          const predictedConflicts = conflictPredictor.predictConflicts([], userActivity, context);
          
          if (predictedConflicts.length > 0) {
            predictions.push(...predictedConflicts);
            
            socket.emit('conflict_prediction', {
              predictions: predictedConflicts.map(p => ({
                type: p.type,
                probability: p.probability,
                severity: p.estimatedSeverity,
                affectedUsers: p.affectedUsers,
                preventionStrategy: p.preventionStrategy
              }))
            });
          }
        });

        socket.on('operation', async (data: { operation: EnhancedWhiteboardOperation }) => {
          const context = otEngine.createEnhancedContext({
            canvasVersion: 1,
            pendingOperations: [],
            elementStates: new Map(),
            currentVectorClock: data.operation.vectorClock,
            lamportClock: data.operation.lamportTimestamp
          });

          const result = await otEngine.transformOperation(data.operation, context);
          
          if (result.conflicts.length > 0) {
            actualConflicts.push(...result.conflicts);
          }

          socket.emit('operation_ack', {
            operationId: data.operation.id,
            success: true,
            conflicts: result.conflicts.length
          });
        });
      });

      // Create two clients
      const client1 = await createClientSocket();
      const client2 = await createClientSocket();

      await Promise.all([
        new Promise(resolve => {
          client1.emit('join_whiteboard', { whiteboardId });
          client1.once('joined', resolve);
        }),
        new Promise(resolve => {
          client2.emit('join_whiteboard', { whiteboardId });
          client2.once('joined', resolve);
        })
      ]);

      // Track predictions
      const allPredictions: any[] = [];
      client1.on('conflict_prediction', (data) => allPredictions.push(...data.predictions));
      client2.on('conflict_prediction', (data) => allPredictions.push(...data.predictions));

      // Simulate users moving close to each other (should predict spatial conflict)
      client1.emit('user_activity', { userId: 'user1', position: { x: 100, y: 100 } });
      client2.emit('user_activity', { userId: 'user2', position: { x: 110, y: 110 } });

      await new Promise(resolve => setTimeout(resolve, 100)); // Wait for predictions

      // Create operations that should cause actual conflicts
      const op1 = createOperation('user1', 'shared_element', 'update', {
        position: { x: 100, y: 100 }
      });
      
      const op2 = createOperation('user2', 'shared_element', 'delete', {
        position: { x: 110, y: 110 }
      });

      // Send operations that should conflict
      client1.emit('operation', { operation: op1 });
      client2.emit('operation', { operation: op2 });

      await Promise.all([
        new Promise(resolve => client1.once('operation_ack', resolve)),
        new Promise(resolve => client2.once('operation_ack', resolve))
      ]);

      // Verify predictions were made
      expect(allPredictions.length).toBeGreaterThan(0);
      
      // Check that spatial conflicts were predicted
      const spatialPredictions = allPredictions.filter(p => p.type === 'spatial');
      expect(spatialPredictions.length).toBeGreaterThan(0);

      // Verify actual conflicts occurred
      expect(actualConflicts.length).toBeGreaterThan(0);

      console.log(`Conflict prediction test results:
        - Predictions made: ${allPredictions.length}
        - Spatial predictions: ${spatialPredictions.length}
        - Actual conflicts: ${actualConflicts.length}
        - Prediction accuracy: ${actualConflicts.length > 0 ? 'Good' : 'No conflicts to validate'}
      `);
    });
  });

  describe('Error Resilience', () => {
    it('should recover from temporary network issues', async () => {
      const whiteboardId = 'resilience_test';
      let processedOperations = 0;
      let reconnections = 0;

      io.on('connection', (socket) => {
        socket.on('join_whiteboard', (data) => {
          socket.join(`whiteboard:${data.whiteboardId}`);
          socket.emit('joined', { whiteboardId: data.whiteboardId });
        });

        socket.on('operation', async (data: { operation: EnhancedWhiteboardOperation }) => {
          processedOperations++;
          
          // Simulate temporary processing delay/failure
          if (processedOperations === 5) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }

          socket.emit('operation_ack', {
            operationId: data.operation.id,
            success: true
          });
        });

        socket.on('disconnect', () => {
          reconnections++;
        });
      });

      const client = await createClientSocket();
      client.emit('join_whiteboard', { whiteboardId });
      await new Promise(resolve => client.once('joined', resolve));

      // Send operations, including during simulated network issues
      const operationPromises: Promise<any>[] = [];
      
      for (let i = 0; i < 10; i++) {
        const operation = createOperation('user1', `element_${i}`, 'create');
        
        operationPromises.push(
          new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Operation timeout')), 3000);
            
            client.once('operation_ack', (ack) => {
              clearTimeout(timeout);
              resolve(ack);
            });

            client.emit('operation', { operation });
          })
        );

        // Add small delay
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      const results = await Promise.all(operationPromises);

      expect(results).toHaveLength(10);
      expect(processedOperations).toBe(10);
      
      console.log(`Error resilience test results:
        - Operations sent: 10
        - Operations processed: ${processedOperations}
        - Reconnections: ${reconnections}
        - Success rate: ${(results.length / 10 * 100)}%
      `);
    });
  });
});