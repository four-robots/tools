/**
 * Whiteboard Permission Service Tests
 * 
 * Comprehensive test suite for the whiteboard permission system including:
 * - Basic RBAC functionality
 * - Granular permission checks
 * - Element-level permissions
 * - Area-based restrictions
 * - Time-based permissions
 * - Permission delegation
 * - Performance validation
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, jest } from '@jest/globals';
import { randomUUID } from 'crypto';
import {
  WhiteboardPermissionService,
  WhiteboardPermissionError,
  WhiteboardPermissionRole,
  WhiteboardPermissionAction,
  CustomPermissionSet,
  PermissionCheckRequest,
  PermissionCheckResult,
} from '../whiteboard-permission-service.js';
import { DatabasePool } from '../../../utils/database-pool.js';
import { Logger } from '../../../utils/logger.js';

// Mock database pool
const mockDb = {
  query: jest.fn(),
} as unknown as DatabasePool;

// Mock logger
const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
} as unknown as Logger;

describe('WhiteboardPermissionService', () => {
  let permissionService: WhiteboardPermissionService;
  
  // Test data
  const testWhiteboardId = randomUUID();
  const testUserId = randomUUID();
  const testGranterId = randomUUID();
  const testElementId = randomUUID();
  
  beforeEach(() => {
    permissionService = new WhiteboardPermissionService(mockDb, mockLogger);
    jest.clearAllMocks();
  });

  describe('Basic Permission Management', () => {
    it('should grant permissions to a user', async () => {
      const mockPermission = {
        id: randomUUID(),
        whiteboard_id: testWhiteboardId,
        user_id: testUserId,
        role: 'editor',
        permissions: JSON.stringify({
          canView: true,
          canEdit: true,
          canCreateElements: true,
        }),
        granted_by: testGranterId,
        expires_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Mock granter permission check
      (mockDb.query as any).mockResolvedValueOnce({
        rows: [{ id: '1', permissions: JSON.stringify({ canManagePermissions: true }) }],
      });

      // Mock permission insert
      (mockDb.query as any).mockResolvedValueOnce({
        rows: [mockPermission],
      });

      // Mock activity log
      (mockDb.query as any).mockResolvedValueOnce({ rows: [] });

      const result = await permissionService.grantPermission(
        testWhiteboardId,
        testUserId,
        testGranterId,
        'editor'
      );

      expect(result).toBeDefined();
      expect(result.role).toBe('editor');
      expect(result.userId).toBe(testUserId);
      expect(result.whiteboardId).toBe(testWhiteboardId);
      expect(mockDb.query).toHaveBeenCalledTimes(3);
    });

    it('should revoke permissions from a user', async () => {
      // Mock granter permission check
      (mockDb.query as any).mockResolvedValueOnce({
        rows: [{ id: '1', permissions: JSON.stringify({ canManagePermissions: true }) }],
      });

      // Mock permission check for target user
      (mockDb.query as any).mockResolvedValueOnce({
        rows: [{ role: 'editor' }],
      });

      // Mock permission deletion
      (mockDb.query as any).mockResolvedValueOnce({
        rowCount: 1,
      });

      // Mock activity log
      (mockDb.query as any).mockResolvedValueOnce({ rows: [] });

      await permissionService.revokePermission(testWhiteboardId, testUserId, testGranterId);

      expect(mockDb.query).toHaveBeenCalledTimes(4);
    });

    it('should update user permissions', async () => {
      const currentPermission = {
        id: randomUUID(),
        whiteboard_id: testWhiteboardId,
        user_id: testUserId,
        role: 'viewer',
        permissions: JSON.stringify({ canView: true }),
        granted_by: testGranterId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const updatedPermission = {
        ...currentPermission,
        role: 'editor',
        permissions: JSON.stringify({
          canView: true,
          canEdit: true,
          canCreateElements: true,
        }),
      };

      // Mock updater permission check
      (mockDb.query as any).mockResolvedValueOnce({
        rows: [{ id: '1', permissions: JSON.stringify({ canManagePermissions: true }) }],
      });

      // Mock current permissions
      (mockDb.query as any).mockResolvedValueOnce({
        rows: [currentPermission],
      });

      // Mock update query
      (mockDb.query as any).mockResolvedValueOnce({
        rows: [updatedPermission],
      });

      // Mock activity log
      (mockDb.query as any).mockResolvedValueOnce({ rows: [] });

      const result = await permissionService.updatePermission(
        testWhiteboardId,
        testUserId,
        testGranterId,
        { role: 'editor' }
      );

      expect(result.role).toBe('editor');
      expect(mockDb.query).toHaveBeenCalledTimes(4);
    });

    it('should throw error when non-owner tries to grant permissions', async () => {
      // Mock permission check that returns no management rights
      (mockDb.query as any).mockResolvedValueOnce({
        rows: [{ id: '1', permissions: JSON.stringify({ canManagePermissions: false }) }],
      });

      await expect(
        permissionService.grantPermission(
          testWhiteboardId,
          testUserId,
          testGranterId,
          'editor'
        )
      ).rejects.toThrow(WhiteboardPermissionError);
    });

    it('should prevent revoking owner permissions', async () => {
      // Mock granter permission check
      (mockDb.query as any).mockResolvedValueOnce({
        rows: [{ id: '1', permissions: JSON.stringify({ canManagePermissions: true }) }],
      });

      // Mock target permission check showing owner role
      (mockDb.query as any).mockResolvedValueOnce({
        rows: [{ role: 'owner' }],
      });

      await expect(
        permissionService.revokePermission(testWhiteboardId, testUserId, testGranterId)
      ).rejects.toThrow(WhiteboardPermissionError);
    });
  });

  describe('Permission Checking', () => {
    it('should check basic permissions correctly', async () => {
      const mockUserPermissions = {
        id: randomUUID(),
        whiteboard_id: testWhiteboardId,
        user_id: testUserId,
        role: 'editor',
        permissions: JSON.stringify({
          canView: true,
          canEdit: true,
          canCreateElements: true,
        }),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Mock user permissions query
      (mockDb.query as any).mockResolvedValueOnce({
        rows: [mockUserPermissions],
      });

      const result = await permissionService.checkPermission({
        whiteboardId: testWhiteboardId,
        userId: testUserId,
        action: 'canEdit',
      });

      expect(result.allowed).toBe(true);
      expect(result.appliedRule).toBe('role_based');
    });

    it('should deny permissions when user has no access', async () => {
      // Mock no permissions found
      (mockDb.query as any).mockResolvedValueOnce({
        rows: [],
      });

      // Mock not creator check
      (mockDb.query as any).mockResolvedValueOnce({
        rows: [{ created_by: 'different-user' }],
      });

      const result = await permissionService.checkPermission({
        whiteboardId: testWhiteboardId,
        userId: testUserId,
        action: 'canEdit',
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('No permissions found');
    });

    it('should allow access for whiteboard creator', async () => {
      // Mock no permissions found
      (mockDb.query as any).mockResolvedValueOnce({
        rows: [],
      });

      // Mock creator check
      (mockDb.query as any).mockResolvedValueOnce({
        rows: [{ created_by: testUserId }],
      });

      const result = await permissionService.checkPermission({
        whiteboardId: testWhiteboardId,
        userId: testUserId,
        action: 'canEdit',
      });

      expect(result.allowed).toBe(true);
      expect(result.reason).toContain('whiteboard creator');
    });

    it('should check expired permissions', async () => {
      const expiredDate = new Date(Date.now() - 1000 * 60 * 60).toISOString(); // 1 hour ago
      
      const mockUserPermissions = {
        id: randomUUID(),
        whiteboard_id: testWhiteboardId,
        user_id: testUserId,
        role: 'editor',
        permissions: JSON.stringify({ canEdit: true }),
        expires_at: expiredDate,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      (mockDb.query as any).mockResolvedValueOnce({
        rows: [mockUserPermissions],
      });

      const result = await permissionService.checkPermission({
        whiteboardId: testWhiteboardId,
        userId: testUserId,
        action: 'canEdit',
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('expired');
    });
  });

  describe('Element-Level Permissions', () => {
    it('should check element-specific permissions', async () => {
      const mockUserPermissions = {
        id: randomUUID(),
        whiteboard_id: testWhiteboardId,
        user_id: testUserId,
        role: 'custom',
        permissions: JSON.stringify({
          canEdit: true,
          elementPermissions: [
            {
              elementId: testElementId,
              elementType: 'rectangle',
              canView: true,
              canEdit: false,
              canDelete: false,
              canMove: true,
              canStyle: true,
              canComment: true,
            },
          ],
        }),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      (mockDb.query as any).mockResolvedValueOnce({
        rows: [mockUserPermissions],
      });

      // Test element edit permission (should be denied)
      const editResult = await permissionService.checkPermission({
        whiteboardId: testWhiteboardId,
        userId: testUserId,
        action: 'canEdit',
        elementId: testElementId,
      });

      expect(editResult.allowed).toBe(false);
      expect(editResult.appliedRule).toBe('element_specific');

      // Reset mock for next test
      jest.clearAllMocks();
      (mockDb.query as any).mockResolvedValueOnce({
        rows: [mockUserPermissions],
      });

      // Test element move permission (should be allowed)
      const moveResult = await permissionService.checkPermission({
        whiteboardId: testWhiteboardId,
        userId: testUserId,
        action: 'canMoveElements',
        elementId: testElementId,
      });

      expect(moveResult.allowed).toBe(true);
    });
  });

  describe('Area-Based Permissions', () => {
    it('should check area-based permissions', async () => {
      const mockUserPermissions = {
        id: randomUUID(),
        whiteboard_id: testWhiteboardId,
        user_id: testUserId,
        role: 'custom',
        permissions: JSON.stringify({
          canEdit: true,
          areaPermissions: [
            {
              areaId: randomUUID(),
              name: 'Restricted Zone',
              bounds: { x: 100, y: 100, width: 200, height: 200 },
              canView: true,
              canEdit: false,
              canComment: true,
              priority: 1,
            },
          ],
        }),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      (mockDb.query as any).mockResolvedValueOnce({
        rows: [mockUserPermissions],
      });

      // Test coordinates inside restricted area
      const result = await permissionService.checkPermission({
        whiteboardId: testWhiteboardId,
        userId: testUserId,
        action: 'canEdit',
        areaCoordinates: { x: 150, y: 150 },
      });

      expect(result.allowed).toBe(false);
      expect(result.appliedRule).toBe('area_based');
      expect(result.reason).toContain('Restricted Zone');
    });

    it('should handle overlapping areas with priority', async () => {
      const mockUserPermissions = {
        id: randomUUID(),
        whiteboard_id: testWhiteboardId,
        user_id: testUserId,
        role: 'custom',
        permissions: JSON.stringify({
          canEdit: true,
          areaPermissions: [
            {
              areaId: randomUUID(),
              name: 'Low Priority Area',
              bounds: { x: 0, y: 0, width: 300, height: 300 },
              canView: true,
              canEdit: true,
              canComment: true,
              priority: 1,
            },
            {
              areaId: randomUUID(),
              name: 'High Priority Restricted',
              bounds: { x: 100, y: 100, width: 100, height: 100 },
              canView: true,
              canEdit: false,
              canComment: false,
              priority: 2,
            },
          ],
        }),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      (mockDb.query as any).mockResolvedValueOnce({
        rows: [mockUserPermissions],
      });

      // Test coordinates in overlapping area - high priority should win
      const result = await permissionService.checkPermission({
        whiteboardId: testWhiteboardId,
        userId: testUserId,
        action: 'canEdit',
        areaCoordinates: { x: 150, y: 150 },
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('High Priority Restricted');
    });
  });

  describe('Layer-Based Permissions', () => {
    it('should check layer-based permissions', async () => {
      const mockUserPermissions = {
        id: randomUUID(),
        whiteboard_id: testWhiteboardId,
        user_id: testUserId,
        role: 'custom',
        permissions: JSON.stringify({
          canEdit: true,
          layerPermissions: [
            {
              layerIndex: 1,
              layerName: 'Background Layer',
              canView: true,
              canEdit: false,
              canReorder: false,
            },
          ],
        }),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      (mockDb.query as any).mockResolvedValueOnce({
        rows: [mockUserPermissions],
      });

      const result = await permissionService.checkPermission({
        whiteboardId: testWhiteboardId,
        userId: testUserId,
        action: 'canEdit',
        layerIndex: 1,
      });

      expect(result.allowed).toBe(false);
      expect(result.appliedRule).toBe('layer_based');
    });
  });

  describe('Time-Based Permissions', () => {
    it('should check time-based permission constraints', async () => {
      const futureTime = new Date(Date.now() + 1000 * 60 * 60).toISOString(); // 1 hour from now
      
      const mockUserPermissions = {
        id: randomUUID(),
        whiteboard_id: testWhiteboardId,
        user_id: testUserId,
        role: 'editor',
        permissions: JSON.stringify({
          canEdit: true,
          timeBased: {
            startTime: futureTime,
            endTime: null,
            timezone: 'UTC',
            isActive: true,
            recurringPattern: 'none',
          },
        }),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      (mockDb.query as any).mockResolvedValueOnce({
        rows: [mockUserPermissions],
      });

      const result = await permissionService.checkPermission({
        whiteboardId: testWhiteboardId,
        userId: testUserId,
        action: 'canEdit',
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('not started yet');
    });

    it('should allow access within time window', async () => {
      const pastTime = new Date(Date.now() - 1000 * 60 * 60).toISOString(); // 1 hour ago
      const futureTime = new Date(Date.now() + 1000 * 60 * 60).toISOString(); // 1 hour from now
      
      const mockUserPermissions = {
        id: randomUUID(),
        whiteboard_id: testWhiteboardId,
        user_id: testUserId,
        role: 'editor',
        permissions: JSON.stringify({
          canEdit: true,
          timeBased: {
            startTime: pastTime,
            endTime: futureTime,
            timezone: 'UTC',
            isActive: true,
            recurringPattern: 'none',
          },
        }),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      (mockDb.query as any).mockResolvedValueOnce({
        rows: [mockUserPermissions],
      });

      const result = await permissionService.checkPermission({
        whiteboardId: testWhiteboardId,
        userId: testUserId,
        action: 'canEdit',
      });

      expect(result.allowed).toBe(true);
    });

    it('should deny access when time-based permissions are inactive', async () => {
      const mockUserPermissions = {
        id: randomUUID(),
        whiteboard_id: testWhiteboardId,
        user_id: testUserId,
        role: 'editor',
        permissions: JSON.stringify({
          canEdit: true,
          timeBased: {
            startTime: null,
            endTime: null,
            timezone: 'UTC',
            isActive: false,
            recurringPattern: 'none',
          },
        }),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      (mockDb.query as any).mockResolvedValueOnce({
        rows: [mockUserPermissions],
      });

      const result = await permissionService.checkPermission({
        whiteboardId: testWhiteboardId,
        userId: testUserId,
        action: 'canEdit',
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('inactive');
    });
  });

  describe('Permission Queries', () => {
    it('should get user permissions', async () => {
      const mockPermission = {
        id: randomUUID(),
        whiteboard_id: testWhiteboardId,
        user_id: testUserId,
        role: 'editor',
        permissions: JSON.stringify({ canEdit: true }),
        granted_by: testGranterId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      (mockDb.query as any).mockResolvedValueOnce({
        rows: [mockPermission],
      });

      const result = await permissionService.getUserPermissions(testWhiteboardId, testUserId);

      expect(result).toBeDefined();
      expect(result?.role).toBe('editor');
    });

    it('should get all whiteboard permissions', async () => {
      const mockPermissions = [
        {
          id: randomUUID(),
          whiteboard_id: testWhiteboardId,
          user_id: testUserId,
          role: 'editor',
          permissions: JSON.stringify({ canEdit: true }),
          granted_by: testGranterId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          name: 'Test User',
          email: 'test@example.com',
        },
      ];

      (mockDb.query as any).mockResolvedValueOnce({
        rows: mockPermissions,
      });

      const result = await permissionService.getWhiteboardPermissions(testWhiteboardId);

      expect(result).toHaveLength(1);
      expect(result[0].role).toBe('editor');
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      (mockDb.query as any).mockRejectedValueOnce(new Error('Database connection failed'));

      await expect(
        permissionService.checkPermission({
          whiteboardId: testWhiteboardId,
          userId: testUserId,
          action: 'canEdit',
        })
      ).rejects.toThrow(WhiteboardPermissionError);
    });

    it('should validate input parameters', async () => {
      await expect(
        permissionService.checkPermission({
          whiteboardId: 'invalid-uuid',
          userId: testUserId,
          action: 'canEdit',
        })
      ).rejects.toThrow();
    });
  });

  describe('Performance', () => {
    it('should complete permission checks within performance targets', async () => {
      const mockUserPermissions = {
        id: randomUUID(),
        whiteboard_id: testWhiteboardId,
        user_id: testUserId,
        role: 'editor',
        permissions: JSON.stringify({ canEdit: true }),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      (mockDb.query as any).mockResolvedValueOnce({
        rows: [mockUserPermissions],
      });

      const start = Date.now();
      
      await permissionService.checkPermission({
        whiteboardId: testWhiteboardId,
        userId: testUserId,
        action: 'canEdit',
      });

      const elapsed = Date.now() - start;
      
      // Should complete within 50ms (well under the 500ms requirement for OT operations)
      expect(elapsed).toBeLessThan(50);
    });

    it('should handle complex permission checks efficiently', async () => {
      const complexPermissions = {
        id: randomUUID(),
        whiteboard_id: testWhiteboardId,
        user_id: testUserId,
        role: 'custom',
        permissions: JSON.stringify({
          canEdit: true,
          elementPermissions: Array(100).fill(0).map((_, i) => ({
            elementId: randomUUID(),
            elementType: 'rectangle',
            canEdit: i % 2 === 0,
            canView: true,
            canDelete: false,
            canMove: true,
            canStyle: true,
            canComment: true,
          })),
          areaPermissions: Array(50).fill(0).map((_, i) => ({
            areaId: randomUUID(),
            name: `Area ${i}`,
            bounds: { x: i * 10, y: i * 10, width: 100, height: 100 },
            canEdit: i % 3 === 0,
            canView: true,
            canComment: true,
            priority: i,
          })),
          layerPermissions: Array(20).fill(0).map((_, i) => ({
            layerIndex: i,
            layerName: `Layer ${i}`,
            canEdit: i % 4 === 0,
            canView: true,
            canReorder: false,
          })),
        }),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      (mockDb.query as any).mockResolvedValueOnce({
        rows: [complexPermissions],
      });

      const start = Date.now();
      
      await permissionService.checkPermission({
        whiteboardId: testWhiteboardId,
        userId: testUserId,
        action: 'canEdit',
        elementId: testElementId,
        areaCoordinates: { x: 250, y: 250 },
        layerIndex: 5,
      });

      const elapsed = Date.now() - start;
      
      // Even complex checks should complete quickly
      expect(elapsed).toBeLessThan(100);
    });
  });

  describe('Role-Based Permission Templates', () => {
    it('should apply correct permissions for owner role', async () => {
      // Mock granter permission check
      (mockDb.query as any).mockResolvedValueOnce({
        rows: [{ id: '1', permissions: JSON.stringify({ canManagePermissions: true }) }],
      });

      // Mock permission insert
      (mockDb.query as any).mockResolvedValueOnce({
        rows: [{
          id: randomUUID(),
          whiteboard_id: testWhiteboardId,
          user_id: testUserId,
          role: 'owner',
          permissions: JSON.stringify({
            canView: true,
            canEdit: true,
            canDelete: true,
            canManagePermissions: true,
            canShare: true,
            canExport: true,
            canCreateTemplates: true,
            canViewHistory: true,
            canRestoreVersions: true,
          }),
          granted_by: testGranterId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }],
      });

      // Mock activity log
      (mockDb.query as any).mockResolvedValueOnce({ rows: [] });

      const result = await permissionService.grantPermission(
        testWhiteboardId,
        testUserId,
        testGranterId,
        'owner'
      );

      expect(result.permissions.canManagePermissions).toBe(true);
      expect(result.permissions.canDelete).toBe(true);
      expect(result.permissions.canRestoreVersions).toBe(true);
    });

    it('should apply correct permissions for viewer role', async () => {
      // Mock granter permission check
      (mockDb.query as any).mockResolvedValueOnce({
        rows: [{ id: '1', permissions: JSON.stringify({ canManagePermissions: true }) }],
      });

      // Mock permission insert
      (mockDb.query as any).mockResolvedValueOnce({
        rows: [{
          id: randomUUID(),
          whiteboard_id: testWhiteboardId,
          user_id: testUserId,
          role: 'viewer',
          permissions: JSON.stringify({
            canView: true,
            canEdit: false,
            canDelete: false,
            canComment: false,
            canCreateElements: false,
            canManagePermissions: false,
            canExport: true,
          }),
          granted_by: testGranterId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }],
      });

      // Mock activity log
      (mockDb.query as any).mockResolvedValueOnce({ rows: [] });

      const result = await permissionService.grantPermission(
        testWhiteboardId,
        testUserId,
        testGranterId,
        'viewer'
      );

      expect(result.permissions.canView).toBe(true);
      expect(result.permissions.canEdit).toBe(false);
      expect(result.permissions.canManagePermissions).toBe(false);
      expect(result.permissions.canExport).toBe(true);
    });
  });

  describe('Integration Tests', () => {
    it('should handle complete permission workflow', async () => {
      // Step 1: Grant permission
      (mockDb.query as any)
        .mockResolvedValueOnce({ // Check granter permissions
          rows: [{ id: '1', permissions: JSON.stringify({ canManagePermissions: true }) }],
        })
        .mockResolvedValueOnce({ // Insert permission
          rows: [{
            id: randomUUID(),
            whiteboard_id: testWhiteboardId,
            user_id: testUserId,
            role: 'editor',
            permissions: JSON.stringify({
              canView: true,
              canEdit: true,
              canCreateElements: true,
            }),
            granted_by: testGranterId,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }],
        })
        .mockResolvedValueOnce({ rows: [] }); // Activity log

      const grantResult = await permissionService.grantPermission(
        testWhiteboardId,
        testUserId,
        testGranterId,
        'editor'
      );

      expect(grantResult.role).toBe('editor');

      // Step 2: Check permission
      jest.clearAllMocks();
      (mockDb.query as any).mockResolvedValueOnce({
        rows: [{
          id: randomUUID(),
          whiteboard_id: testWhiteboardId,
          user_id: testUserId,
          role: 'editor',
          permissions: JSON.stringify({
            canView: true,
            canEdit: true,
            canCreateElements: true,
          }),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }],
      });

      const checkResult = await permissionService.checkPermission({
        whiteboardId: testWhiteboardId,
        userId: testUserId,
        action: 'canEdit',
      });

      expect(checkResult.allowed).toBe(true);

      // Step 3: Update permission
      jest.clearAllMocks();
      (mockDb.query as any)
        .mockResolvedValueOnce({ // Check updater permissions
          rows: [{ id: '1', permissions: JSON.stringify({ canManagePermissions: true }) }],
        })
        .mockResolvedValueOnce({ // Get current permissions
          rows: [{
            id: randomUUID(),
            whiteboard_id: testWhiteboardId,
            user_id: testUserId,
            role: 'editor',
            permissions: JSON.stringify({
              canView: true,
              canEdit: true,
              canCreateElements: true,
            }),
            granted_by: testGranterId,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }],
        })
        .mockResolvedValueOnce({ // Update permission
          rows: [{
            id: randomUUID(),
            whiteboard_id: testWhiteboardId,
            user_id: testUserId,
            role: 'viewer',
            permissions: JSON.stringify({
              canView: true,
              canEdit: false,
              canCreateElements: false,
            }),
            granted_by: testGranterId,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }],
        })
        .mockResolvedValueOnce({ rows: [] }); // Activity log

      const updateResult = await permissionService.updatePermission(
        testWhiteboardId,
        testUserId,
        testGranterId,
        { role: 'viewer' }
      );

      expect(updateResult.role).toBe('viewer');

      // Step 4: Verify updated permissions
      jest.clearAllMocks();
      (mockDb.query as any).mockResolvedValueOnce({
        rows: [{
          id: randomUUID(),
          whiteboard_id: testWhiteboardId,
          user_id: testUserId,
          role: 'viewer',
          permissions: JSON.stringify({
            canView: true,
            canEdit: false,
            canCreateElements: false,
          }),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }],
      });

      const finalCheck = await permissionService.checkPermission({
        whiteboardId: testWhiteboardId,
        userId: testUserId,
        action: 'canEdit',
      });

      expect(finalCheck.allowed).toBe(false);
    });
  });
});