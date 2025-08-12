/**
 * useWhiteboardPermissions Hook Tests
 * 
 * Comprehensive test suite for the whiteboard permissions React hook covering:
 * - Permission state management
 * - WebSocket integration
 * - Real-time permission updates
 * - CRUD operations for all permission types
 * - Error handling and recovery
 * - Performance optimization
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { renderHook, act, waitFor } from '@testing-library/react';
import { io, Socket } from 'socket.io-client';
import { useWhiteboardPermissions } from '../useWhiteboardPermissions.js';

// Mock socket.io-client
jest.mock('socket.io-client', () => ({
  io: jest.fn(),
}));

// Mock localStorage
const mockLocalStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};

Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage,
});

// Mock socket instance
const mockSocket = {
  id: 'socket_test_123',
  connected: false,
  on: jest.fn(),
  off: jest.fn(),
  emit: jest.fn(),
  disconnect: jest.fn(),
  join: jest.fn(),
  to: jest.fn().mockReturnThis(),
} as unknown as jest.Mocked<Socket>;

const mockIo = io as jest.MockedFunction<typeof io>;

describe('useWhiteboardPermissions', () => {
  const whiteboardId = 'wb_test_123';
  const currentUserId = 'user_test_123';

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock localStorage auth token
    mockLocalStorage.getItem.mockImplementation((key) => {
      if (key === 'authToken') return 'mock_auth_token';
      if (key === 'userId') return currentUserId;
      return null;
    });

    // Mock socket.io connection
    mockIo.mockReturnValue(mockSocket);
    
    // Default socket behavior
    mockSocket.on.mockImplementation((event, callback) => {
      if (event === 'connect') {
        setTimeout(() => callback(), 0);
      }
      return mockSocket;
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Hook Initialization', () => {
    it('should initialize with default state', () => {
      const { result } = renderHook(() => useWhiteboardPermissions(whiteboardId));

      expect(result.current.permissions).toEqual([]);
      expect(result.current.elementPermissions).toEqual([]);
      expect(result.current.areaPermissions).toEqual([]);
      expect(result.current.layerPermissions).toEqual([]);
      expect(result.current.customRoles).toEqual([]);
      expect(result.current.currentUserPermissions).toEqual({});
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
      expect(result.current.connected).toBe(false);
    });

    it('should establish WebSocket connection with correct configuration', () => {
      renderHook(() => useWhiteboardPermissions(whiteboardId));

      expect(mockIo).toHaveBeenCalledWith('/whiteboard', {
        auth: { token: 'mock_auth_token' },
        query: { whiteboardId },
      });
    });

    it('should set up event listeners for WebSocket events', () => {
      renderHook(() => useWhiteboardPermissions(whiteboardId));

      expect(mockSocket.on).toHaveBeenCalledWith('connect', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('disconnect', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('connect_error', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('whiteboard:permission_changed', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('whiteboard:permission_denied', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('whiteboard:approval_required', expect.any(Function));
    });
  });

  describe('Connection Management', () => {
    it('should update connection state on connect', async () => {
      const { result } = renderHook(() => useWhiteboardPermissions(whiteboardId));

      // Simulate connection
      act(() => {
        const connectCallback = mockSocket.on.mock.calls.find(call => call[0] === 'connect')?.[1];
        connectCallback?.();
      });

      await waitFor(() => {
        expect(result.current.connected).toBe(true);
        expect(result.current.error).toBeNull();
      });
    });

    it('should update connection state on disconnect', async () => {
      const { result } = renderHook(() => useWhiteboardPermissions(whiteboardId));

      // First connect
      act(() => {
        const connectCallback = mockSocket.on.mock.calls.find(call => call[0] === 'connect')?.[1];
        connectCallback?.();
      });

      // Then disconnect
      act(() => {
        const disconnectCallback = mockSocket.on.mock.calls.find(call => call[0] === 'disconnect')?.[1];
        disconnectCallback?.();
      });

      await waitFor(() => {
        expect(result.current.connected).toBe(false);
      });
    });

    it('should handle connection errors', async () => {
      const { result } = renderHook(() => useWhiteboardPermissions(whiteboardId));

      const connectionError = new Error('Connection failed');

      act(() => {
        const errorCallback = mockSocket.on.mock.calls.find(call => call[0] === 'connect_error')?.[1];
        errorCallback?.(connectionError);
      });

      await waitFor(() => {
        expect(result.current.error).toBe('Connection failed: Connection failed');
        expect(result.current.connected).toBe(false);
      });
    });

    it('should refresh permissions on connection', async () => {
      mockSocket.emit.mockImplementation((event, callback) => {
        if (event === 'whiteboard:get_permissions' && typeof callback === 'function') {
          setTimeout(() => {
            callback({
              success: true,
              permissions: {
                permissions: [
                  {
                    id: 'perm_1',
                    userId: currentUserId,
                    userName: 'Test User',
                    userEmail: 'test@example.com',
                    role: 'editor',
                    permissions: { canEdit: true, canComment: true },
                    grantedBy: 'admin',
                    grantedByName: 'Admin User',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                  }
                ],
                elementPermissions: [],
                areaPermissions: [],
                layerPermissions: []
              }
            });
          }, 0);
        }
        return mockSocket;
      });

      const { result } = renderHook(() => useWhiteboardPermissions(whiteboardId));

      // Connect and trigger permission refresh
      act(() => {
        const connectCallback = mockSocket.on.mock.calls.find(call => call[0] === 'connect')?.[1];
        connectCallback?.();
      });

      await waitFor(() => {
        expect(result.current.permissions).toHaveLength(1);
        expect(result.current.permissions[0].role).toBe('editor');
        expect(result.current.currentUserPermissions).toEqual({ canEdit: true, canComment: true });
      });
    });
  });

  describe('Permission CRUD Operations', () => {
    it('should grant permissions to a user', async () => {
      mockSocket.emit.mockImplementation((event, data, callback) => {
        if (event === 'whiteboard:grant_permission' && typeof callback === 'function') {
          setTimeout(() => {
            callback({
              success: true,
              permission: {
                id: 'perm_new',
                userId: data.targetUserId,
                userName: 'New User',
                userEmail: 'new@example.com',
                role: data.role,
                permissions: data.permissions || {},
                grantedBy: currentUserId,
                grantedByName: 'Current User',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
              }
            });
          }, 0);
        }
        return mockSocket;
      });

      const { result } = renderHook(() => useWhiteboardPermissions(whiteboardId));

      await act(async () => {
        await result.current.grantPermission(
          'user_new_123',
          'commenter',
          { canComment: true },
          undefined
        );
      });

      expect(mockSocket.emit).toHaveBeenCalledWith(
        'whiteboard:grant_permission',
        {
          targetUserId: 'user_new_123',
          role: 'commenter',
          permissions: { canComment: true },
          expiresAt: undefined,
        },
        expect.any(Function)
      );
    });

    it('should revoke permissions from a user', async () => {
      mockSocket.emit.mockImplementation((event, data, callback) => {
        if (event === 'whiteboard:revoke_permission' && typeof callback === 'function') {
          setTimeout(() => {
            callback({ success: true });
          }, 0);
        }
        return mockSocket;
      });

      const { result } = renderHook(() => useWhiteboardPermissions(whiteboardId));

      // Set initial permissions
      act(() => {
        result.current.permissions.push({
          id: 'perm_to_revoke',
          userId: 'user_to_revoke',
          userName: 'User To Revoke',
          userEmail: 'revoke@example.com',
          role: 'viewer',
          permissions: { canView: true },
          grantedBy: currentUserId,
          grantedByName: 'Current User',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      });

      await act(async () => {
        await result.current.revokePermission('user_to_revoke');
      });

      expect(mockSocket.emit).toHaveBeenCalledWith(
        'whiteboard:revoke_permission',
        { targetUserId: 'user_to_revoke' },
        expect.any(Function)
      );
    });

    it('should update existing permissions', async () => {
      mockSocket.emit.mockImplementation((event, data, callback) => {
        if (event === 'whiteboard:update_permission' && typeof callback === 'function') {
          setTimeout(() => {
            callback({
              success: true,
              permission: {
                id: data.permissionId,
                userId: 'user_update',
                userName: 'Updated User',
                userEmail: 'update@example.com',
                role: 'editor',
                permissions: { canEdit: true, canComment: true },
                grantedBy: currentUserId,
                grantedByName: 'Current User',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
              }
            });
          }, 0);
        }
        return mockSocket;
      });

      const { result } = renderHook(() => useWhiteboardPermissions(whiteboardId));

      await act(async () => {
        await result.current.updatePermission('perm_123', {
          role: 'editor',
          permissions: { canEdit: true, canComment: true }
        });
      });

      expect(mockSocket.emit).toHaveBeenCalledWith(
        'whiteboard:update_permission',
        {
          permissionId: 'perm_123',
          updates: {
            role: 'editor',
            permissions: { canEdit: true, canComment: true }
          }
        },
        expect.any(Function)
      );
    });
  });

  describe('Element Permissions', () => {
    it('should grant element-level permissions', async () => {
      mockSocket.emit.mockImplementation((event, data, callback) => {
        if (event === 'whiteboard:grant_element_permission' && typeof callback === 'function') {
          setTimeout(() => {
            callback({
              success: true,
              permission: {
                id: 'elem_perm_123',
                elementId: data.elementId,
                elementType: 'rectangle',
                userId: data.targetUserId,
                userName: 'Element User',
                permissionType: data.permissionType,
                granted: data.granted,
                scope: data.scope,
                reason: data.reason,
                expiresAt: data.expiresAt,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
              }
            });
          }, 0);
        }
        return mockSocket;
      });

      const { result } = renderHook(() => useWhiteboardPermissions(whiteboardId));

      await act(async () => {
        await result.current.grantElementPermission(
          'element_123',
          'user_element',
          'can_edit',
          true,
          {
            scope: { operations: ['update', 'style'] },
            reason: 'Designer needs to edit this element',
            expiresAt: new Date(Date.now() + 86400000).toISOString()
          }
        );
      });

      expect(mockSocket.emit).toHaveBeenCalledWith(
        'whiteboard:grant_element_permission',
        {
          elementId: 'element_123',
          targetUserId: 'user_element',
          permissionType: 'can_edit',
          granted: true,
          scope: { operations: ['update', 'style'] },
          reason: 'Designer needs to edit this element',
          expiresAt: expect.any(String)
        },
        expect.any(Function)
      );
    });

    it('should revoke element permissions', async () => {
      mockSocket.emit.mockImplementation((event, data, callback) => {
        if (event === 'whiteboard:revoke_element_permission' && typeof callback === 'function') {
          setTimeout(() => {
            callback({ success: true });
          }, 0);
        }
        return mockSocket;
      });

      const { result } = renderHook(() => useWhiteboardPermissions(whiteboardId));

      await act(async () => {
        await result.current.revokeElementPermission('elem_perm_123');
      });

      expect(mockSocket.emit).toHaveBeenCalledWith(
        'whiteboard:revoke_element_permission',
        { permissionId: 'elem_perm_123' },
        expect.any(Function)
      );
    });
  });

  describe('Area Permissions', () => {
    it('should grant area-based permissions', async () => {
      mockSocket.emit.mockImplementation((event, data, callback) => {
        if (event === 'whiteboard:grant_area_permission' && typeof callback === 'function') {
          setTimeout(() => {
            callback({
              success: true,
              permission: {
                id: 'area_perm_123',
                userId: data.targetUserId,
                userName: 'Area User',
                areaName: data.areaName,
                areaBounds: data.areaBounds,
                permissionType: data.permissionType,
                priority: data.priority || 1,
                inclusive: data.inclusive !== false,
                appliesToElements: data.appliesToElements || [],
                grantedBy: currentUserId,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
              }
            });
          }, 0);
        }
        return mockSocket;
      });

      const { result } = renderHook(() => useWhiteboardPermissions(whiteboardId));

      const areaBounds = { x: 100, y: 100, width: 500, height: 300 };

      await act(async () => {
        await result.current.grantAreaPermission(
          'user_area',
          'Design Zone',
          areaBounds,
          'can_edit',
          {
            priority: 2,
            inclusive: true,
            appliesToElements: ['element_1', 'element_2']
          }
        );
      });

      expect(mockSocket.emit).toHaveBeenCalledWith(
        'whiteboard:grant_area_permission',
        {
          targetUserId: 'user_area',
          areaName: 'Design Zone',
          areaBounds,
          permissionType: 'can_edit',
          priority: 2,
          inclusive: true,
          appliesToElements: ['element_1', 'element_2']
        },
        expect.any(Function)
      );
    });

    it('should revoke area permissions', async () => {
      mockSocket.emit.mockImplementation((event, data, callback) => {
        if (event === 'whiteboard:revoke_area_permission' && typeof callback === 'function') {
          setTimeout(() => {
            callback({ success: true });
          }, 0);
        }
        return mockSocket;
      });

      const { result } = renderHook(() => useWhiteboardPermissions(whiteboardId));

      await act(async () => {
        await result.current.revokeAreaPermission('area_perm_123');
      });

      expect(mockSocket.emit).toHaveBeenCalledWith(
        'whiteboard:revoke_area_permission',
        { permissionId: 'area_perm_123' },
        expect.any(Function)
      );
    });
  });

  describe('Layer Permissions', () => {
    it('should grant layer permissions', async () => {
      mockSocket.emit.mockImplementation((event, data, callback) => {
        if (event === 'whiteboard:grant_layer_permission' && typeof callback === 'function') {
          setTimeout(() => {
            callback({
              success: true,
              permission: {
                id: 'layer_perm_123',
                userId: data.targetUserId,
                userName: 'Layer User',
                layerIndex: data.layerIndex,
                layerName: data.layerName,
                permissions: data.permissions,
                grantedBy: currentUserId,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
              }
            });
          }, 0);
        }
        return mockSocket;
      });

      const { result } = renderHook(() => useWhiteboardPermissions(whiteboardId));

      const layerPermissions = {
        can_edit: true,
        can_create: true,
        can_delete: false,
        can_reorder: false
      };

      await act(async () => {
        await result.current.grantLayerPermission(
          'user_layer',
          2,
          layerPermissions,
          'Content Layer'
        );
      });

      expect(mockSocket.emit).toHaveBeenCalledWith(
        'whiteboard:grant_layer_permission',
        {
          targetUserId: 'user_layer',
          layerIndex: 2,
          permissions: layerPermissions,
          layerName: 'Content Layer'
        },
        expect.any(Function)
      );
    });

    it('should revoke layer permissions', async () => {
      mockSocket.emit.mockImplementation((event, data, callback) => {
        if (event === 'whiteboard:revoke_layer_permission' && typeof callback === 'function') {
          setTimeout(() => {
            callback({ success: true });
          }, 0);
        }
        return mockSocket;
      });

      const { result } = renderHook(() => useWhiteboardPermissions(whiteboardId));

      await act(async () => {
        await result.current.revokeLayerPermission('layer_perm_123');
      });

      expect(mockSocket.emit).toHaveBeenCalledWith(
        'whiteboard:revoke_layer_permission',
        { permissionId: 'layer_perm_123' },
        expect.any(Function)
      );
    });
  });

  describe('Custom Roles', () => {
    it('should create custom roles', async () => {
      mockSocket.emit.mockImplementation((event, data, callback) => {
        if (event === 'whiteboard:create_custom_role' && typeof callback === 'function') {
          setTimeout(() => {
            callback({
              success: true,
              customRole: {
                id: 'custom_role_123',
                workspaceId: data.workspaceId,
                roleName: data.roleName,
                roleDescription: data.roleDescription,
                rolePermissions: data.rolePermissions,
                defaultForNewUsers: data.defaultForNewUsers || false,
                canBeDelegated: data.canBeDelegated || false,
                createdBy: currentUserId,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
              }
            });
          }, 0);
        }
        return mockSocket;
      });

      const { result } = renderHook(() => useWhiteboardPermissions(whiteboardId));

      const rolePermissions = {
        canEdit: true,
        canStyle: true,
        canComment: true,
        canDelete: false,
        canManagePermissions: false
      };

      await act(async () => {
        await result.current.createCustomRole(
          'workspace_123',
          'Designer',
          rolePermissions,
          {
            roleDescription: 'Design-focused role with styling permissions',
            defaultForNewUsers: false,
            canBeDelegated: true
          }
        );
      });

      expect(mockSocket.emit).toHaveBeenCalledWith(
        'whiteboard:create_custom_role',
        {
          workspaceId: 'workspace_123',
          roleName: 'Designer',
          rolePermissions,
          roleDescription: 'Design-focused role with styling permissions',
          defaultForNewUsers: false,
          canBeDelegated: true
        },
        expect.any(Function)
      );
    });

    it('should delete custom roles', async () => {
      mockSocket.emit.mockImplementation((event, data, callback) => {
        if (event === 'whiteboard:delete_custom_role' && typeof callback === 'function') {
          setTimeout(() => {
            callback({ success: true });
          }, 0);
        }
        return mockSocket;
      });

      const { result } = renderHook(() => useWhiteboardPermissions(whiteboardId));

      await act(async () => {
        await result.current.deleteCustomRole('custom_role_123');
      });

      expect(mockSocket.emit).toHaveBeenCalledWith(
        'whiteboard:delete_custom_role',
        { roleId: 'custom_role_123' },
        expect.any(Function)
      );
    });
  });

  describe('Permission Delegation', () => {
    it('should delegate permissions to another user', async () => {
      mockSocket.emit.mockImplementation((event, data, callback) => {
        if (event === 'whiteboard:delegate_permissions' && typeof callback === 'function') {
          setTimeout(() => {
            callback({
              success: true,
              permission: {
                id: 'delegated_perm_123',
                userId: data.targetUserId,
                userName: 'Delegated User',
                userEmail: 'delegated@example.com',
                role: 'delegated',
                permissions: data.permissions,
                grantedBy: currentUserId,
                grantedByName: 'Current User',
                delegatedBy: currentUserId,
                expiresAt: data.expiresAt,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
              }
            });
          }, 0);
        }
        return mockSocket;
      });

      const { result } = renderHook(() => useWhiteboardPermissions(whiteboardId));

      const delegatedPermissions = {
        canEdit: true,
        canComment: true,
        canStyle: true
      };

      const expiresAt = new Date(Date.now() + 86400000).toISOString(); // 24 hours

      await act(async () => {
        await result.current.delegatePermissions(
          'user_delegate',
          delegatedPermissions,
          expiresAt
        );
      });

      expect(mockSocket.emit).toHaveBeenCalledWith(
        'whiteboard:delegate_permissions',
        {
          targetUserId: 'user_delegate',
          permissions: delegatedPermissions,
          expiresAt
        },
        expect.any(Function)
      );
    });
  });

  describe('Permission Validation', () => {
    it('should check permissions with context', async () => {
      mockSocket.emit.mockImplementation((event, data, callback) => {
        if (event === 'whiteboard:check_permission' && typeof callback === 'function') {
          setTimeout(() => {
            callback({
              success: true,
              result: {
                allowed: true,
                reason: undefined,
                restrictions: {},
                suggestions: [],
                alternativeActions: [],
                requiresApproval: false,
                auditRequired: false
              }
            });
          }, 0);
        }
        return mockSocket;
      });

      const { result } = renderHook(() => useWhiteboardPermissions(whiteboardId));

      const context = {
        elementId: 'element_123',
        position: { x: 200, y: 150 },
        layerIndex: 2,
        operationType: 'update'
      };

      let permissionResult;
      await act(async () => {
        permissionResult = await result.current.checkPermission('canEdit', context);
      });

      expect(permissionResult).toEqual({
        allowed: true,
        reason: undefined,
        restrictions: {},
        suggestions: [],
        alternativeActions: [],
        requiresApproval: false,
        auditRequired: false
      });

      expect(mockSocket.emit).toHaveBeenCalledWith(
        'whiteboard:check_permission',
        {
          permission: 'canEdit',
          context
        },
        expect.any(Function)
      );
    });
  });

  describe('Real-time Updates', () => {
    it('should handle permission changed events', async () => {
      const { result } = renderHook(() => useWhiteboardPermissions(whiteboardId));

      const permissionChangeData = {
        changeType: 'permission_granted',
        changeData: {
          role: 'editor',
          permissions: { canEdit: true, canComment: true }
        },
        timestamp: Date.now(),
        requiresReauth: false
      };

      act(() => {
        const changeCallback = mockSocket.on.mock.calls.find(
          call => call[0] === 'whiteboard:permission_changed'
        )?.[1];
        changeCallback?.(permissionChangeData);
      });

      // Should trigger permission refresh
      expect(mockSocket.emit).toHaveBeenCalledWith(
        'whiteboard:get_permissions',
        expect.any(Function)
      );
    });

    it('should handle permission denied events', async () => {
      const { result } = renderHook(() => useWhiteboardPermissions(whiteboardId));

      const permissionDeniedData = {
        event: 'whiteboard:element_update',
        error: {
          code: 'PERMISSION_DENIED',
          message: 'You do not have edit permissions for this element',
          suggestions: ['Request edit access from the owner'],
          alternativeActions: ['Add a comment instead']
        },
        timestamp: Date.now()
      };

      act(() => {
        const deniedCallback = mockSocket.on.mock.calls.find(
          call => call[0] === 'whiteboard:permission_denied'
        )?.[1];
        deniedCallback?.(permissionDeniedData);
      });

      await waitFor(() => {
        expect(result.current.error).toBe('You do not have edit permissions for this element');
      });
    });

    it('should handle approval required events', async () => {
      const { result } = renderHook(() => useWhiteboardPermissions(whiteboardId));

      const approvalRequiredData = {
        operationId: 'op_approval_123',
        workflow: 'Administrative approval required',
        timestamp: Date.now()
      };

      // Mock console.log to verify the event is handled
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      act(() => {
        const approvalCallback = mockSocket.on.mock.calls.find(
          call => call[0] === 'whiteboard:approval_required'
        )?.[1];
        approvalCallback?.(approvalRequiredData);
      });

      expect(consoleSpy).toHaveBeenCalledWith('Approval required:', approvalRequiredData);
      
      consoleSpy.mockRestore();
    });
  });

  describe('Utility Functions', () => {
    it('should refresh permissions manually', async () => {
      mockSocket.emit.mockImplementation((event, callback) => {
        if (event === 'whiteboard:get_permissions' && typeof callback === 'function') {
          setTimeout(() => {
            callback({
              success: true,
              permissions: {
                permissions: [],
                elementPermissions: [],
                areaPermissions: [],
                layerPermissions: []
              }
            });
          }, 0);
        }
        return mockSocket;
      });

      const { result } = renderHook(() => useWhiteboardPermissions(whiteboardId));

      await act(async () => {
        await result.current.refreshPermissions();
      });

      expect(mockSocket.emit).toHaveBeenCalledWith(
        'whiteboard:get_permissions',
        expect.any(Function)
      );
    });

    it('should search users', async () => {
      mockSocket.emit.mockImplementation((event, data, callback) => {
        if (event === 'whiteboard:search_users' && typeof callback === 'function') {
          setTimeout(() => {
            callback({
              success: true,
              users: [
                { id: 'user_1', name: 'Alice Johnson', email: 'alice@example.com' },
                { id: 'user_2', name: 'Bob Smith', email: 'bob@example.com' }
              ]
            });
          }, 0);
        }
        return mockSocket;
      });

      const { result } = renderHook(() => useWhiteboardPermissions(whiteboardId));

      let searchResults;
      await act(async () => {
        searchResults = await result.current.searchUsers('alice');
      });

      expect(searchResults).toEqual([
        { id: 'user_1', name: 'Alice Johnson', email: 'alice@example.com' },
        { id: 'user_2', name: 'Bob Smith', email: 'bob@example.com' }
      ]);

      expect(mockSocket.emit).toHaveBeenCalledWith(
        'whiteboard:search_users',
        { query: 'alice' },
        expect.any(Function)
      );
    });

    it('should get permission statistics', async () => {
      mockSocket.emit.mockImplementation((event, callback) => {
        if (event === 'whiteboard:get_permission_stats' && typeof callback === 'function') {
          setTimeout(() => {
            callback({
              success: true,
              stats: {
                validation: {
                  totalValidations: 1000,
                  averageLatency: 25.5,
                  successRate: 0.95
                },
                middleware: {
                  totalOperations: 2000,
                  blockedOperations: 100,
                  rateLimitHits: 50
                }
              }
            });
          }, 0);
        }
        return mockSocket;
      });

      const { result } = renderHook(() => useWhiteboardPermissions(whiteboardId));

      let stats;
      await act(async () => {
        stats = await result.current.getPermissionStats();
      });

      expect(stats).toEqual({
        validation: {
          totalValidations: 1000,
          averageLatency: 25.5,
          successRate: 0.95
        },
        middleware: {
          totalOperations: 2000,
          blockedOperations: 100,
          rateLimitHits: 50
        }
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle WebSocket operation failures', async () => {
      mockSocket.emit.mockImplementation((event, data, callback) => {
        if (typeof callback === 'function') {
          setTimeout(() => {
            callback({
              success: false,
              error: 'Operation failed due to server error'
            });
          }, 0);
        }
        return mockSocket;
      });

      const { result } = renderHook(() => useWhiteboardPermissions(whiteboardId));

      await expect(
        result.current.grantPermission('user_fail', 'editor')
      ).rejects.toThrow('Operation failed due to server error');
    });

    it('should handle disconnection during operations', async () => {
      const { result } = renderHook(() => useWhiteboardPermissions(whiteboardId));

      // Simulate disconnection
      act(() => {
        mockSocket.connected = false;
        const disconnectCallback = mockSocket.on.mock.calls.find(
          call => call[0] === 'disconnect'
        )?.[1];
        disconnectCallback?.();
      });

      await expect(
        result.current.grantPermission('user_disconnected', 'editor')
      ).rejects.toThrow('Not connected');
    });

    it('should handle refresh permission failures gracefully', async () => {
      mockSocket.emit.mockImplementation((event, callback) => {
        if (event === 'whiteboard:get_permissions' && typeof callback === 'function') {
          setTimeout(() => {
            callback({
              success: false,
              error: 'Failed to fetch permissions'
            });
          }, 0);
        }
        return mockSocket;
      });

      const { result } = renderHook(() => useWhiteboardPermissions(whiteboardId));

      await act(async () => {
        await result.current.refreshPermissions();
      });

      await waitFor(() => {
        expect(result.current.error).toBe('Failed to refresh permissions');
        expect(result.current.loading).toBe(false);
      });
    });
  });

  describe('Cleanup', () => {
    it('should disconnect socket on unmount', () => {
      const { unmount } = renderHook(() => useWhiteboardPermissions(whiteboardId));

      unmount();

      expect(mockSocket.disconnect).toHaveBeenCalled();
    });

    it('should handle multiple permission state updates correctly', async () => {
      const { result } = renderHook(() => useWhiteboardPermissions(whiteboardId));

      // Simulate rapid permission updates
      const updates = [
        { type: 'permission_granted', userId: 'user_1', role: 'editor' },
        { type: 'permission_revoked', userId: 'user_2' },
        { type: 'permission_updated', userId: 'user_3', role: 'commenter' }
      ];

      for (const update of updates) {
        act(() => {
          const changeCallback = mockSocket.on.mock.calls.find(
            call => call[0] === 'whiteboard:permission_changed'
          )?.[1];
          changeCallback?.({
            changeType: update.type,
            changeData: update,
            timestamp: Date.now()
          });
        });
      }

      // Should handle all updates without race conditions
      expect(mockSocket.emit).toHaveBeenCalledTimes(updates.length);
    });
  });
});