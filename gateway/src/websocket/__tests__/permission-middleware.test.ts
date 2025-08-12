/**
 * WebSocket Permission Middleware Tests
 * 
 * Comprehensive test suite for WebSocket permission middleware covering:
 * - Real-time permission enforcement
 * - WebSocket event validation
 * - Rate limiting and security
 * - Connection management
 * - Permission change broadcasting
 * - Error handling and recovery
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { 
  WhiteboardPermissionMiddleware,
  PermissionAwareSocket,
  PermissionValidationError
} from '../permission-middleware.js';
import { WhiteboardPermissionService } from '@mcp-tools/core/services/whiteboard/whiteboard-permission-service.js';
import { WhiteboardPermissionValidator } from '@mcp-tools/core/services/whiteboard/whiteboard-permission-validator.js';
import { Logger } from '@mcp-tools/core/utils/logger.js';

// Mock services
const mockPermissionService = {
  checkPermission: jest.fn(),
  grantPermission: jest.fn(),
  revokePermission: jest.fn(),
  getWhiteboardPermissionsDetailed: jest.fn(),
} as jest.Mocked<Partial<WhiteboardPermissionService>>;

const mockValidator = {
  validateOperation: jest.fn(),
  getValidationStats: jest.fn(),
} as jest.Mocked<Partial<WhiteboardPermissionValidator>>;

const mockLogger = {
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
} as jest.Mocked<Logger>;

// Mock Socket.IO
const mockSocket = {
  id: 'socket_test_123',
  emit: jest.fn(),
  to: jest.fn().mockReturnThis(),
  join: jest.fn(),
  leave: jest.fn(),
  disconnect: jest.fn(),
  on: jest.fn(),
  off: jest.fn(),
  handshake: {
    query: { whiteboardId: 'wb_test_123' },
    headers: { 'user-agent': 'test-client' },
    address: '192.168.1.1'
  },
  user: { id: 'user_test_123', name: 'Test User' },
  whiteboardPermissions: {
    whiteboardId: 'wb_test_123',
    sessionId: 'session_test_123',
    permissions: { canEdit: true },
    lastValidated: new Date()
  }
} as unknown as PermissionAwareSocket;

const mockNamespace = {
  to: jest.fn().mockReturnThis(),
  emit: jest.fn(),
  sockets: new Map([['socket_test_123', mockSocket]]),
} as unknown as any;

describe('WhiteboardPermissionMiddleware', () => {
  let middleware: WhiteboardPermissionMiddleware;
  const whiteboardId = 'wb_test_123';
  const userId = 'user_test_123';
  const sessionId = 'session_test_123';

  beforeEach(() => {
    jest.clearAllMocks();
    
    middleware = new WhiteboardPermissionMiddleware(
      mockPermissionService as WhiteboardPermissionService,
      mockValidator as WhiteboardPermissionValidator,
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

    mockValidator.validateOperation!.mockResolvedValue({
      allowed: true,
      blockedReason: undefined,
      suggestions: [],
      alternativeActions: []
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Permission Context Initialization', () => {
    it('should initialize permission context for socket', async () => {
      await middleware.initializePermissionContext(
        mockSocket,
        whiteboardId,
        userId,
        sessionId
      );

      expect(mockSocket.whiteboardPermissions).toEqual({
        whiteboardId,
        sessionId,
        userId,
        permissions: {},
        lastValidated: expect.any(Date),
        rateLimiter: expect.any(Object)
      });

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Permission context initialized',
        expect.objectContaining({
          socketId: mockSocket.id,
          whiteboardId,
          userId,
          sessionId
        })
      );
    });

    it('should handle initialization errors gracefully', async () => {
      const errorSocket = { ...mockSocket, id: undefined } as any;

      await expect(
        middleware.initializePermissionContext(
          errorSocket,
          whiteboardId,
          userId,
          sessionId
        )
      ).rejects.toThrow('Invalid socket or parameters');
    });

    it('should set up rate limiting for user', async () => {
      await middleware.initializePermissionContext(
        mockSocket,
        whiteboardId,
        userId,
        sessionId
      );

      expect(mockSocket.whiteboardPermissions?.rateLimiter).toBeDefined();
      expect(mockSocket.whiteboardPermissions?.rateLimiter.maxOperations).toBe(100);
      expect(mockSocket.whiteboardPermissions?.rateLimiter.windowMs).toBe(60000); // 1 minute
    });
  });

  describe('Permission Validation Middleware', () => {
    it('should validate operation permissions before execution', async () => {
      const validationMiddleware = middleware.validatePermission();
      const mockEventData = {
        elementId: 'element_123',
        type: 'update',
        data: { width: 150 }
      };
      const mockCallback = jest.fn();
      const mockNext = jest.fn();

      await validationMiddleware.call(
        mockSocket,
        mockEventData,
        mockCallback,
        mockNext
      );

      expect(mockValidator.validateOperation).toHaveBeenCalledWith(
        expect.objectContaining({
          elementId: 'element_123',
          type: 'update',
          data: { width: 150 }
        }),
        expect.objectContaining({
          whiteboardId,
          userId,
          sessionId
        })
      );

      expect(mockNext).toHaveBeenCalled();
    });

    it('should block operations when validation fails', async () => {
      mockValidator.validateOperation!.mockResolvedValueOnce({
        allowed: false,
        blockedReason: 'Insufficient permissions',
        suggestions: ['Request edit access'],
        alternativeActions: ['Add comment instead']
      });

      const validationMiddleware = middleware.validatePermission();
      const mockEventData = {
        elementId: 'element_123',
        type: 'delete'
      };
      const mockCallback = jest.fn();
      const mockNext = jest.fn();

      await validationMiddleware.call(
        mockSocket,
        mockEventData,
        mockCallback,
        mockNext
      );

      expect(mockCallback).toHaveBeenCalledWith({
        success: false,
        error: 'Insufficient permissions',
        suggestions: ['Request edit access'],
        alternativeActions: ['Add comment instead']
      });

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockSocket.emit).toHaveBeenCalledWith(
        'whiteboard:permission_denied',
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'PERMISSION_DENIED',
            message: 'Insufficient permissions'
          })
        })
      );
    });

    it('should handle rate limiting', async () => {
      // Set up rate limiter to be at limit
      if (mockSocket.whiteboardPermissions?.rateLimiter) {
        mockSocket.whiteboardPermissions.rateLimiter.operationCount = 100;
        mockSocket.whiteboardPermissions.rateLimiter.windowStart = Date.now();
      }

      const validationMiddleware = middleware.validatePermission();
      const mockEventData = { type: 'create' };
      const mockCallback = jest.fn();
      const mockNext = jest.fn();

      await validationMiddleware.call(
        mockSocket,
        mockEventData,
        mockCallback,
        mockNext
      );

      expect(mockCallback).toHaveBeenCalledWith({
        success: false,
        error: 'Rate limit exceeded. Too many operations in the current time window.',
        retryAfter: expect.any(Number)
      });

      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should skip validation for always-allowed operations', async () => {
      const validationMiddleware = middleware.validatePermission();
      const mockEventData = {
        type: 'cursor_move',
        position: { x: 100, y: 100 }
      };
      const mockCallback = jest.fn();
      const mockNext = jest.fn();

      await validationMiddleware.call(
        mockSocket,
        mockEventData,
        mockCallback,
        mockNext
      );

      expect(mockValidator.validateOperation).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('Permission Change Broadcasting', () => {
    it('should broadcast permission changes to affected users', async () => {
      const affectedUserIds = ['user_123', 'user_456'];
      const changeType = 'permission_granted';
      const changeData = {
        role: 'editor',
        permissions: { canEdit: true, canComment: true }
      };

      await middleware.broadcastPermissionChange(
        mockNamespace,
        whiteboardId,
        affectedUserIds,
        changeType,
        changeData
      );

      expect(mockNamespace.to).toHaveBeenCalledWith(`whiteboard:${whiteboardId}`);
      expect(mockNamespace.emit).toHaveBeenCalledWith(
        'whiteboard:permission_changed',
        expect.objectContaining({
          changeType,
          changeData,
          affectedUsers: affectedUserIds,
          timestamp: expect.any(Number)
        })
      );
    });

    it('should handle permission revocation notifications', async () => {
      const revokedUserId = 'user_revoked_123';

      await middleware.broadcastPermissionChange(
        mockNamespace,
        whiteboardId,
        [revokedUserId],
        'permission_revoked',
        { reason: 'Administrative action' }
      );

      expect(mockNamespace.emit).toHaveBeenCalledWith(
        'whiteboard:permission_changed',
        expect.objectContaining({
          changeType: 'permission_revoked',
          changeData: { reason: 'Administrative action' },
          affectedUsers: [revokedUserId],
          requiresReauth: true
        })
      );
    });

    it('should notify users requiring approval', async () => {
      const pendingUserId = 'user_pending_123';
      const operationId = 'op_approval_123';

      await middleware.notifyApprovalRequired(
        mockNamespace,
        whiteboardId,
        operationId,
        pendingUserId,
        'Administrative approval required for this operation'
      );

      expect(mockNamespace.to).toHaveBeenCalledWith(`whiteboard:${whiteboardId}`);
      expect(mockNamespace.emit).toHaveBeenCalledWith(
        'whiteboard:approval_required',
        expect.objectContaining({
          operationId,
          userId: pendingUserId,
          workflow: 'Administrative approval required for this operation',
          timestamp: expect.any(Number)
        })
      );
    });
  });

  describe('Connection Management', () => {
    it('should handle user disconnection cleanup', async () => {
      await middleware.handleDisconnection(mockSocket);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Cleaning up permission context for disconnected socket',
        expect.objectContaining({
          socketId: mockSocket.id,
          userId,
          sessionId
        })
      );
    });

    it('should update permission cache on reconnection', async () => {
      mockPermissionService.getWhiteboardPermissionsDetailed!.mockResolvedValueOnce({
        permissions: [
          {
            id: 'perm_123',
            userId,
            role: 'editor',
            permissions: { canEdit: true, canComment: true }
          }
        ],
        elementPermissions: [],
        areaPermissions: [],
        layerPermissions: []
      });

      await middleware.refreshPermissionCache(mockSocket);

      expect(mockPermissionService.getWhiteboardPermissionsDetailed).toHaveBeenCalledWith(
        whiteboardId,
        userId
      );

      expect(mockSocket.whiteboardPermissions?.permissions).toEqual({
        canEdit: true,
        canComment: true
      });
    });

    it('should handle permission refresh errors', async () => {
      mockPermissionService.getWhiteboardPermissionsDetailed!.mockRejectedValueOnce(
        new Error('Database connection failed')
      );

      await middleware.refreshPermissionCache(mockSocket);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to refresh permission cache',
        expect.objectContaining({
          error: expect.any(Error),
          socketId: mockSocket.id
        })
      );
    });
  });

  describe('Security Measures', () => {
    it('should detect and block suspicious operation patterns', async () => {
      const validationMiddleware = middleware.validatePermission();
      const suspiciousOperations = [];

      // Rapid deletion operations (potential malicious activity)
      for (let i = 0; i < 15; i++) {
        suspiciousOperations.push({
          type: 'delete',
          elementId: `element_${i}`,
          timestamp: new Date().toISOString()
        });
      }

      const mockCallback = jest.fn();
      const mockNext = jest.fn();

      // Process operations rapidly
      for (const operation of suspiciousOperations) {
        await validationMiddleware.call(
          mockSocket,
          operation,
          mockCallback,
          mockNext
        );
      }

      // Should detect suspicious pattern and start blocking
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Suspicious activity detected'),
        expect.any(Object)
      );

      // Later operations should be blocked
      const laterCalls = mockCallback.mock.calls.slice(-5);
      const blockedCalls = laterCalls.filter(call => 
        call[0].success === false && 
        call[0].error?.includes('suspicious')
      );
      
      expect(blockedCalls.length).toBeGreaterThan(0);
    });

    it('should enforce IP-based restrictions', async () => {
      mockPermissionService.checkPermission!.mockResolvedValueOnce({
        allowed: false,
        reason: 'IP address not allowed',
        restrictions: { ipBlocked: true },
        suggestions: ['Contact administrator'],
        alternativeActions: [],
        requiresApproval: false,
        auditRequired: true
      });

      const validationMiddleware = middleware.validatePermission();
      const mockEventData = { type: 'create' };
      const mockCallback = jest.fn();
      const mockNext = jest.fn();

      await validationMiddleware.call(
        mockSocket,
        mockEventData,
        mockCallback,
        mockNext
      );

      expect(mockCallback).toHaveBeenCalledWith({
        success: false,
        error: 'IP address not allowed',
        suggestions: ['Contact administrator']
      });

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Security block: IP restriction',
        expect.objectContaining({
          userId,
          ipAddress: mockSocket.handshake.address
        })
      );
    });

    it('should audit high-risk operations', async () => {
      mockPermissionService.checkPermission!.mockResolvedValueOnce({
        allowed: true,
        reason: undefined,
        restrictions: {},
        suggestions: [],
        alternativeActions: [],
        requiresApproval: false,
        auditRequired: true
      });

      const validationMiddleware = middleware.validatePermission();
      const highRiskOperation = {
        type: 'batch_delete',
        elementIds: ['elem1', 'elem2', 'elem3', 'elem4', 'elem5']
      };
      const mockCallback = jest.fn();
      const mockNext = jest.fn();

      await validationMiddleware.call(
        mockSocket,
        highRiskOperation,
        mockCallback,
        mockNext
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        'High-risk operation audited',
        expect.objectContaining({
          operation: highRiskOperation,
          userId,
          whiteboardId,
          timestamp: expect.any(String)
        })
      );
    });
  });

  describe('Performance Monitoring', () => {
    it('should track middleware performance metrics', () => {
      const stats = middleware.getMiddlewareStats();

      expect(stats).toMatchObject({
        totalOperations: expect.any(Number),
        blockedOperations: expect.any(Number),
        averageLatency: expect.any(Number),
        rateLimitHits: expect.any(Number),
        securityBlocks: expect.any(Number),
        cacheHits: expect.any(Number),
        cacheMisses: expect.any(Number),
        lastUpdated: expect.any(String)
      });
    });

    it('should maintain performance under high load', async () => {
      const operationCount = 200;
      const concurrentUsers = 10;
      const promises: Promise<void>[] = [];

      for (let user = 0; user < concurrentUsers; user++) {
        const userSocket = {
          ...mockSocket,
          id: `socket_${user}`,
          user: { id: `user_${user}`, name: `User ${user}` },
          whiteboardPermissions: {
            whiteboardId,
            sessionId: `session_${user}`,
            userId: `user_${user}`,
            permissions: { canEdit: true },
            lastValidated: new Date(),
            rateLimiter: {
              operationCount: 0,
              windowStart: Date.now(),
              maxOperations: 100,
              windowMs: 60000
            }
          }
        } as PermissionAwareSocket;

        for (let op = 0; op < operationCount / concurrentUsers; op++) {
          const validationMiddleware = middleware.validatePermission();
          const mockEventData = {
            type: 'update',
            elementId: `element_${user}_${op}`,
            data: { value: Math.random() }
          };
          const mockCallback = jest.fn();
          const mockNext = jest.fn();

          promises.push(
            validationMiddleware.call(
              userSocket,
              mockEventData,
              mockCallback,
              mockNext
            )
          );
        }
      }

      const startTime = Date.now();
      await Promise.all(promises);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(3000); // Should complete within 3 seconds
      
      const stats = middleware.getMiddlewareStats();
      expect(stats.averageLatency).toBeLessThan(50); // Average latency < 50ms
    });
  });

  describe('Error Recovery', () => {
    it('should recover from validation service failures', async () => {
      mockValidator.validateOperation!.mockRejectedValueOnce(
        new Error('Validation service timeout')
      );

      const validationMiddleware = middleware.validatePermission();
      const mockEventData = { type: 'create' };
      const mockCallback = jest.fn();
      const mockNext = jest.fn();

      await validationMiddleware.call(
        mockSocket,
        mockEventData,
        mockCallback,
        mockNext
      );

      expect(mockCallback).toHaveBeenCalledWith({
        success: false,
        error: 'Permission validation temporarily unavailable. Please try again.',
        retryAfter: expect.any(Number)
      });

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Permission validation error',
        expect.any(Object)
      );
    });

    it('should handle malformed event data gracefully', async () => {
      const validationMiddleware = middleware.validatePermission();
      const malformedData = {
        // Missing required fields
        data: null,
        timestamp: 'invalid-date'
      };
      const mockCallback = jest.fn();
      const mockNext = jest.fn();

      await validationMiddleware.call(
        mockSocket,
        malformedData,
        mockCallback,
        mockNext
      );

      expect(mockCallback).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid operation data format'
      });
    });

    it('should maintain operation order during recovery', async () => {
      // Mock intermittent failures
      mockValidator.validateOperation!
        .mockResolvedValueOnce({ allowed: true })
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockResolvedValueOnce({ allowed: true });

      const validationMiddleware = middleware.validatePermission();
      const operations = [
        { id: 'op1', type: 'create' },
        { id: 'op2', type: 'update' },
        { id: 'op3', type: 'delete' }
      ];

      const results: any[] = [];
      const mockCallback = (result: any) => results.push(result);
      const mockNext = jest.fn();

      for (const operation of operations) {
        await validationMiddleware.call(
          mockSocket,
          operation,
          mockCallback,
          mockNext
        );
      }

      expect(results).toHaveLength(3);
      expect(results[0].success).toBe(true); // op1 succeeds
      expect(results[1].success).toBe(false); // op2 fails
      expect(results[2].success).toBe(true); // op3 succeeds
    });
  });
});