/**
 * Whiteboard Permission Validator Tests
 * 
 * Comprehensive test suite for permission validation middleware covering:
 * - Operation-level permission validation
 * - Context-aware permission checking
 * - Rate limiting and security measures
 * - Integration with OT engine
 * - Performance under high load
 * - Error handling and edge cases
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { 
  WhiteboardPermissionValidator,
  OperationContext,
  PermissionCheckResult,
  ValidationConfig,
  EnhancedWhiteboardOperation
} from '../whiteboard-permission-validator.js';
import { WhiteboardPermissionService } from '../whiteboard-permission-service.js';
import { Logger } from '../../../utils/logger.js';

// Mock permission service
const mockPermissionService = {
  checkPermission: jest.fn(),
  getValidationStats: jest.fn(),
  clearCache: jest.fn(),
} as jest.Mocked<Partial<WhiteboardPermissionService>>;

// Mock logger
const mockLogger = {
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
} as jest.Mocked<Logger>;

describe('WhiteboardPermissionValidator', () => {
  let validator: WhiteboardPermissionValidator;
  const whiteboardId = 'wb_test_123';
  const userId = 'user_test_123';

  beforeEach(() => {
    jest.clearAllMocks();
    validator = new WhiteboardPermissionValidator(
      mockPermissionService as WhiteboardPermissionService,
      mockLogger
    );

    // Default mock responses
    mockPermissionService.checkPermission!.mockResolvedValue({
      allowed: true,
      reason: undefined,
      restrictions: {},
      suggestions: [],
      alternativeActions: [],
      requiresApproval: false,
      auditRequired: false
    });

    mockPermissionService.getValidationStats!.mockReturnValue({
      totalValidations: 0,
      successfulValidations: 0,
      failedValidations: 0,
      averageLatency: 0,
      cacheHitRate: 0,
      securityBlocks: 0
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Basic Operation Validation', () => {
    it('should validate create operations', async () => {
      const operation: EnhancedWhiteboardOperation = {
        id: 'op_create_123',
        type: 'create',
        elementId: 'element_123',
        elementType: 'rectangle',
        userId,
        whiteboardId,
        timestamp: new Date().toISOString(),
        version: 1,
        vectorClock: { [userId]: 1 },
        lamportTimestamp: 1,
        data: { width: 100, height: 50 },
        position: { x: 100, y: 100 },
        metadata: { clientId: 'client_123' }
      };

      const context: OperationContext = {
        whiteboardId,
        userId,
        sessionId: 'session_123',
        ipAddress: '192.168.1.1',
        userAgent: 'test-client',
        operationTime: new Date(),
        previousOperations: []
      };

      const result = await validator.validateOperation(operation, context);

      expect(result.allowed).toBe(true);
      expect(result.blockedReason).toBeUndefined();
      expect(mockPermissionService.checkPermission).toHaveBeenCalledWith(
        whiteboardId,
        userId,
        'canCreate',
        expect.objectContaining({
          elementId: operation.elementId,
          position: operation.position,
          operationType: 'create'
        })
      );
    });

    it('should validate update operations', async () => {
      const operation: EnhancedWhiteboardOperation = {
        id: 'op_update_123',
        type: 'update',
        elementId: 'element_123',
        elementType: 'rectangle',
        userId,
        whiteboardId,
        timestamp: new Date().toISOString(),
        version: 2,
        vectorClock: { [userId]: 2 },
        lamportTimestamp: 2,
        data: { width: 150, height: 75 },
        position: { x: 100, y: 100 },
        metadata: { clientId: 'client_123' }
      };

      const context: OperationContext = {
        whiteboardId,
        userId,
        sessionId: 'session_123',
        ipAddress: '192.168.1.1',
        userAgent: 'test-client',
        operationTime: new Date(),
        previousOperations: []
      };

      const result = await validator.validateOperation(operation, context);

      expect(result.allowed).toBe(true);
      expect(mockPermissionService.checkPermission).toHaveBeenCalledWith(
        whiteboardId,
        userId,
        'canEdit',
        expect.objectContaining({
          elementId: operation.elementId,
          operationType: 'update'
        })
      );
    });

    it('should validate delete operations', async () => {
      const operation: EnhancedWhiteboardOperation = {
        id: 'op_delete_123',
        type: 'delete',
        elementId: 'element_123',
        elementType: 'rectangle',
        userId,
        whiteboardId,
        timestamp: new Date().toISOString(),
        version: 3,
        vectorClock: { [userId]: 3 },
        lamportTimestamp: 3,
        metadata: { clientId: 'client_123' }
      };

      const context: OperationContext = {
        whiteboardId,
        userId,
        sessionId: 'session_123',
        ipAddress: '192.168.1.1',
        userAgent: 'test-client',
        operationTime: new Date(),
        previousOperations: []
      };

      const result = await validator.validateOperation(operation, context);

      expect(result.allowed).toBe(true);
      expect(mockPermissionService.checkPermission).toHaveBeenCalledWith(
        whiteboardId,
        userId,
        'canDelete',
        expect.objectContaining({
          elementId: operation.elementId,
          operationType: 'delete'
        })
      );
    });

    it('should block operations when permission is denied', async () => {
      mockPermissionService.checkPermission!.mockResolvedValueOnce({
        allowed: false,
        reason: 'User does not have edit permissions',
        restrictions: { readOnly: true },
        suggestions: ['Request edit permissions from admin'],
        alternativeActions: ['Add comment instead'],
        requiresApproval: false,
        auditRequired: true
      });

      const operation: EnhancedWhiteboardOperation = {
        id: 'op_blocked_123',
        type: 'update',
        elementId: 'element_123',
        elementType: 'rectangle',
        userId,
        whiteboardId,
        timestamp: new Date().toISOString(),
        version: 2,
        vectorClock: { [userId]: 2 },
        lamportTimestamp: 2,
        data: { width: 150 },
        metadata: { clientId: 'client_123' }
      };

      const context: OperationContext = {
        whiteboardId,
        userId,
        sessionId: 'session_123',
        ipAddress: '192.168.1.1',
        userAgent: 'test-client',
        operationTime: new Date(),
        previousOperations: []
      };

      const result = await validator.validateOperation(operation, context);

      expect(result.allowed).toBe(false);
      expect(result.blockedReason).toBe('User does not have edit permissions');
      expect(result.suggestions).toContain('Request edit permissions from admin');
      expect(result.alternativeActions).toContain('Add comment instead');
    });
  });

  describe('Context-Aware Validation', () => {
    it('should validate layer-based operations', async () => {
      const operation: EnhancedWhiteboardOperation = {
        id: 'op_layer_123',
        type: 'layer_change',
        elementId: 'element_123',
        elementType: 'text',
        userId,
        whiteboardId,
        timestamp: new Date().toISOString(),
        version: 2,
        vectorClock: { [userId]: 2 },
        lamportTimestamp: 2,
        data: { newLayerIndex: 3 },
        metadata: { clientId: 'client_123' }
      };

      const context: OperationContext = {
        whiteboardId,
        userId,
        sessionId: 'session_123',
        ipAddress: '192.168.1.1',
        userAgent: 'test-client',
        operationTime: new Date(),
        previousOperations: []
      };

      const result = await validator.validateOperation(operation, context);

      expect(result.allowed).toBe(true);
      expect(mockPermissionService.checkPermission).toHaveBeenCalledWith(
        whiteboardId,
        userId,
        'canReorderLayers',
        expect.objectContaining({
          layerIndex: 3,
          operationType: 'layer_change'
        })
      );
    });

    it('should validate area-based permissions', async () => {
      const operation: EnhancedWhiteboardOperation = {
        id: 'op_move_123',
        type: 'move',
        elementId: 'element_123',
        elementType: 'rectangle',
        userId,
        whiteboardId,
        timestamp: new Date().toISOString(),
        version: 2,
        vectorClock: { [userId]: 2 },
        lamportTimestamp: 2,
        position: { x: 500, y: 300 },
        data: { oldPosition: { x: 100, y: 100 } },
        metadata: { clientId: 'client_123' }
      };

      const context: OperationContext = {
        whiteboardId,
        userId,
        sessionId: 'session_123',
        ipAddress: '192.168.1.1',
        userAgent: 'test-client',
        operationTime: new Date(),
        previousOperations: []
      };

      const result = await validator.validateOperation(operation, context);

      expect(result.allowed).toBe(true);
      expect(mockPermissionService.checkPermission).toHaveBeenCalledWith(
        whiteboardId,
        userId,
        'canMove',
        expect.objectContaining({
          elementId: operation.elementId,
          position: operation.position,
          operationType: 'move'
        })
      );
    });

    it('should handle compound operations', async () => {
      const operation: EnhancedWhiteboardOperation = {
        id: 'op_compound_123',
        type: 'compound',
        elementId: 'element_123',
        elementType: 'rectangle',
        userId,
        whiteboardId,
        timestamp: new Date().toISOString(),
        version: 2,
        vectorClock: { [userId]: 2 },
        lamportTimestamp: 2,
        parentOperations: ['move_op', 'resize_op', 'style_op'],
        data: {
          moves: { x: 200, y: 200 },
          resize: { width: 150, height: 100 },
          style: { fill: 'red' }
        },
        metadata: { clientId: 'client_123' }
      };

      const context: OperationContext = {
        whiteboardId,
        userId,
        sessionId: 'session_123',
        ipAddress: '192.168.1.1',
        userAgent: 'test-client',
        operationTime: new Date(),
        previousOperations: []
      };

      // Mock multiple permission checks for compound operation
      mockPermissionService.checkPermission!
        .mockResolvedValueOnce({ allowed: true }) // canMove
        .mockResolvedValueOnce({ allowed: true }) // canResize
        .mockResolvedValueOnce({ allowed: true }); // canStyle

      const result = await validator.validateOperation(operation, context);

      expect(result.allowed).toBe(true);
      expect(mockPermissionService.checkPermission).toHaveBeenCalledTimes(3);
    });
  });

  describe('Rate Limiting and Security', () => {
    it('should apply rate limiting per user', async () => {
      const operations: Promise<PermissionCheckResult>[] = [];
      const operationCount = 150; // Exceed default rate limit of 100/minute

      const baseOperation: EnhancedWhiteboardOperation = {
        id: 'op_rate_limit',
        type: 'create',
        elementId: 'element_123',
        elementType: 'rectangle',
        userId,
        whiteboardId,
        timestamp: new Date().toISOString(),
        version: 1,
        vectorClock: { [userId]: 1 },
        lamportTimestamp: 1,
        data: { width: 100, height: 50 },
        metadata: { clientId: 'client_123' }
      };

      const context: OperationContext = {
        whiteboardId,
        userId,
        sessionId: 'session_123',
        ipAddress: '192.168.1.1',
        userAgent: 'test-client',
        operationTime: new Date(),
        previousOperations: []
      };

      // Create rapid operations
      for (let i = 0; i < operationCount; i++) {
        const operation = {
          ...baseOperation,
          id: `op_rate_limit_${i}`,
          elementId: `element_${i}`
        };
        operations.push(validator.validateOperation(operation, context));
      }

      const results = await Promise.all(operations);

      // First 100 should be allowed, rest should be rate limited
      const allowedCount = results.filter(r => r.allowed).length;
      const rateLimitedCount = results.filter(r => r.blockedReason?.includes('rate limit')).length;

      expect(allowedCount).toBeLessThanOrEqual(100);
      expect(rateLimitedCount).toBeGreaterThan(0);
    });

    it('should detect suspicious activity patterns', async () => {
      const suspiciousOperations: Promise<PermissionCheckResult>[] = [];
      
      // Rapid deletion operations (potential malicious activity)
      for (let i = 0; i < 20; i++) {
        const operation: EnhancedWhiteboardOperation = {
          id: `op_suspicious_${i}`,
          type: 'delete',
          elementId: `element_${i}`,
          elementType: 'rectangle',
          userId,
          whiteboardId,
          timestamp: new Date().toISOString(),
          version: 1,
          vectorClock: { [userId]: 1 },
          lamportTimestamp: 1,
          metadata: { clientId: 'client_123' }
        };

        const context: OperationContext = {
          whiteboardId,
          userId,
          sessionId: 'session_123',
          ipAddress: '192.168.1.1',
          userAgent: 'test-client',
          operationTime: new Date(),
          previousOperations: []
        };

        suspiciousOperations.push(validator.validateOperation(operation, context));
      }

      const results = await Promise.all(suspiciousOperations);

      // Should detect and block suspicious pattern
      const blockedCount = results.filter(r => !r.allowed).length;
      expect(blockedCount).toBeGreaterThan(0);
      
      // Should log security warning
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Suspicious activity detected'),
        expect.any(Object)
      );
    });

    it('should validate IP address restrictions', async () => {
      mockPermissionService.checkPermission!.mockResolvedValueOnce({
        allowed: false,
        reason: 'IP address not allowed',
        restrictions: { allowedIPs: ['192.168.1.0/24'] },
        suggestions: ['Contact administrator to whitelist your IP'],
        alternativeActions: [],
        requiresApproval: false,
        auditRequired: true
      });

      const operation: EnhancedWhiteboardOperation = {
        id: 'op_ip_blocked',
        type: 'create',
        elementId: 'element_123',
        elementType: 'rectangle',
        userId,
        whiteboardId,
        timestamp: new Date().toISOString(),
        version: 1,
        vectorClock: { [userId]: 1 },
        lamportTimestamp: 1,
        data: { width: 100, height: 50 },
        metadata: { clientId: 'client_123' }
      };

      const context: OperationContext = {
        whiteboardId,
        userId,
        sessionId: 'session_123',
        ipAddress: '10.0.0.1', // Different network
        userAgent: 'test-client',
        operationTime: new Date(),
        previousOperations: []
      };

      const result = await validator.validateOperation(operation, context);

      expect(result.allowed).toBe(false);
      expect(result.blockedReason).toBe('IP address not allowed');
      expect(mockPermissionService.checkPermission).toHaveBeenCalledWith(
        whiteboardId,
        userId,
        'canCreate',
        expect.objectContaining({
          ipAddress: '10.0.0.1'
        })
      );
    });
  });

  describe('Performance Optimization', () => {
    it('should handle high-frequency validation efficiently', async () => {
      const userCount = 25;
      const operationsPerUser = 20;
      const promises: Promise<PermissionCheckResult>[] = [];

      for (let userId = 1; userId <= userCount; userId++) {
        for (let opIndex = 1; opIndex <= operationsPerUser; opIndex++) {
          const operation: EnhancedWhiteboardOperation = {
            id: `op_perf_${userId}_${opIndex}`,
            type: 'update',
            elementId: `element_${userId}_${opIndex}`,
            elementType: 'rectangle',
            userId: `user_${userId}`,
            whiteboardId,
            timestamp: new Date().toISOString(),
            version: opIndex,
            vectorClock: { [`user_${userId}`]: opIndex },
            lamportTimestamp: userId * 1000 + opIndex,
            data: { width: 100 + opIndex },
            metadata: { clientId: `client_${userId}` }
          };

          const context: OperationContext = {
            whiteboardId,
            userId: `user_${userId}`,
            sessionId: `session_${userId}`,
            ipAddress: '192.168.1.1',
            userAgent: 'test-client',
            operationTime: new Date(),
            previousOperations: []
          };

          promises.push(validator.validateOperation(operation, context));
        }
      }

      const startTime = Date.now();
      const results = await Promise.all(promises);
      const duration = Date.now() - startTime;

      expect(results).toHaveLength(userCount * operationsPerUser);
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
      
      // Check that most operations were allowed (within rate limits)
      const allowedCount = results.filter(r => r.allowed).length;
      expect(allowedCount).toBeGreaterThan(userCount * operationsPerUser * 0.8); // At least 80%
    });

    it('should provide accurate validation statistics', () => {
      mockPermissionService.getValidationStats!.mockReturnValue({
        totalValidations: 1000,
        successfulValidations: 950,
        failedValidations: 50,
        averageLatency: 25.5,
        cacheHitRate: 0.85,
        securityBlocks: 12
      });

      const stats = validator.getValidationStats();

      expect(stats).toEqual({
        totalValidations: 1000,
        successfulValidations: 950,
        failedValidations: 50,
        averageLatency: 25.5,
        cacheHitRate: 0.85,
        securityBlocks: 12
      });
    });

    it('should maintain performance targets under load', async () => {
      const operationCount = 500;
      const promises: Promise<PermissionCheckResult>[] = [];

      // Set up performance monitoring
      let totalLatency = 0;
      let processedCount = 0;

      for (let i = 0; i < operationCount; i++) {
        const operation: EnhancedWhiteboardOperation = {
          id: `op_load_test_${i}`,
          type: i % 4 === 0 ? 'create' : i % 4 === 1 ? 'update' : i % 4 === 2 ? 'move' : 'style',
          elementId: `element_${i % 100}`,
          elementType: 'rectangle',
          userId: `user_${i % 10}`,
          whiteboardId,
          timestamp: new Date().toISOString(),
          version: i + 1,
          vectorClock: { [`user_${i % 10}`]: Math.floor(i / 10) + 1 },
          lamportTimestamp: i + 1,
          data: { loadTest: true },
          metadata: { clientId: `client_${i % 5}` }
        };

        const context: OperationContext = {
          whiteboardId,
          userId: `user_${i % 10}`,
          sessionId: `session_${i % 10}`,
          ipAddress: '192.168.1.1',
          userAgent: 'test-client',
          operationTime: new Date(),
          previousOperations: []
        };

        const startTime = Date.now();
        const promise = validator.validateOperation(operation, context).then(result => {
          const latency = Date.now() - startTime;
          totalLatency += latency;
          processedCount++;
          return result;
        });

        promises.push(promise);
      }

      const results = await Promise.all(promises);
      const averageLatency = totalLatency / processedCount;

      expect(results).toHaveLength(operationCount);
      expect(averageLatency).toBeLessThan(50); // Target: < 50ms average latency
      
      console.log(`Load Test Results:
        - Operations: ${operationCount}
        - Average Latency: ${averageLatency.toFixed(2)}ms
        - Success Rate: ${(results.filter(r => r.allowed).length / operationCount * 100).toFixed(1)}%
      `);
    });
  });

  describe('Error Handling', () => {
    it('should handle permission service failures gracefully', async () => {
      mockPermissionService.checkPermission!.mockRejectedValueOnce(
        new Error('Permission service unavailable')
      );

      const operation: EnhancedWhiteboardOperation = {
        id: 'op_service_error',
        type: 'create',
        elementId: 'element_123',
        elementType: 'rectangle',
        userId,
        whiteboardId,
        timestamp: new Date().toISOString(),
        version: 1,
        vectorClock: { [userId]: 1 },
        lamportTimestamp: 1,
        data: { width: 100, height: 50 },
        metadata: { clientId: 'client_123' }
      };

      const context: OperationContext = {
        whiteboardId,
        userId,
        sessionId: 'session_123',
        ipAddress: '192.168.1.1',
        userAgent: 'test-client',
        operationTime: new Date(),
        previousOperations: []
      };

      const result = await validator.validateOperation(operation, context);

      expect(result.allowed).toBe(false);
      expect(result.blockedReason).toContain('Permission service error');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Permission validation failed',
        expect.any(Object)
      );
    });

    it('should handle malformed operation data', async () => {
      const malformedOperation = {
        id: 'op_malformed',
        type: 'create',
        // Missing required fields
        userId,
        timestamp: 'invalid-date',
        metadata: null
      } as any;

      const context: OperationContext = {
        whiteboardId,
        userId,
        sessionId: 'session_123',
        ipAddress: '192.168.1.1',
        userAgent: 'test-client',
        operationTime: new Date(),
        previousOperations: []
      };

      const result = await validator.validateOperation(malformedOperation, context);

      expect(result.allowed).toBe(false);
      expect(result.blockedReason).toContain('Invalid operation data');
    });

    it('should handle missing context gracefully', async () => {
      const operation: EnhancedWhiteboardOperation = {
        id: 'op_no_context',
        type: 'create',
        elementId: 'element_123',
        elementType: 'rectangle',
        userId,
        whiteboardId,
        timestamp: new Date().toISOString(),
        version: 1,
        vectorClock: { [userId]: 1 },
        lamportTimestamp: 1,
        data: { width: 100, height: 50 },
        metadata: { clientId: 'client_123' }
      };

      const incompleteContext = {
        whiteboardId,
        userId,
        // Missing required fields
      } as any;

      const result = await validator.validateOperation(operation, incompleteContext);

      expect(result.allowed).toBe(false);
      expect(result.blockedReason).toContain('Invalid context');
    });
  });

  describe('Integration with OT Engine', () => {
    it('should validate OT-specific operation metadata', async () => {
      const operation: EnhancedWhiteboardOperation = {
        id: 'op_ot_integration',
        type: 'update',
        elementId: 'element_123',
        elementType: 'rectangle',
        userId,
        whiteboardId,
        timestamp: new Date().toISOString(),
        version: 5,
        vectorClock: { [userId]: 5, user2: 3 },
        lamportTimestamp: 8,
        data: { width: 150 },
        metadata: {
          clientId: 'client_123',
          transformedFrom: ['op_original_456'],
          conflictResolution: 'last-writer-wins'
        }
      };

      const context: OperationContext = {
        whiteboardId,
        userId,
        sessionId: 'session_123',
        ipAddress: '192.168.1.1',
        userAgent: 'test-client',
        operationTime: new Date(),
        previousOperations: [
          {
            id: 'op_original_456',
            type: 'update',
            elementId: 'element_123',
            userId: 'user2',
            timestamp: new Date(Date.now() - 1000).toISOString()
          }
        ]
      };

      const result = await validator.validateOperation(operation, context);

      expect(result.allowed).toBe(true);
      expect(mockPermissionService.checkPermission).toHaveBeenCalledWith(
        whiteboardId,
        userId,
        'canEdit',
        expect.objectContaining({
          elementId: operation.elementId,
          operationType: 'update',
          previousOperations: context.previousOperations
        })
      );
    });
  });
});