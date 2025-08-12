/**
 * Whiteboard Permissions Hook
 * 
 * React hook for managing whiteboard permissions including:
 * - Real-time permission state management
 * - WebSocket integration for permission updates
 * - Permission validation and caching
 * - CRUD operations for all permission types
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

// Permission types
interface WhiteboardPermission {
  id: string;
  whiteboardId: string;
  userId: string;
  userName: string;
  userEmail: string;
  role: 'owner' | 'editor' | 'commenter' | 'viewer';
  permissions: Record<string, boolean>;
  grantedBy: string;
  grantedByName: string;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

interface ElementPermission {
  id: string;
  elementId: string;
  elementType: string;
  userId: string;
  userName: string;
  permissionType: string;
  granted: boolean;
  scope?: Record<string, any>;
  reason?: string;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

interface AreaPermission {
  id: string;
  userId: string;
  userName: string;
  areaName: string;
  areaBounds: { x: number; y: number; width: number; height: number };
  permissionType: string;
  priority: number;
  inclusive: boolean;
  appliesToElements: string[];
  grantedBy: string;
  createdAt: string;
  updatedAt: string;
}

interface LayerPermission {
  id: string;
  userId: string;
  userName: string;
  layerIndex: number;
  layerName?: string;
  permissions: Record<string, boolean>;
  grantedBy: string;
  createdAt: string;
  updatedAt: string;
}

interface CustomRole {
  id: string;
  workspaceId: string;
  roleName: string;
  roleDescription?: string;
  rolePermissions: Record<string, boolean>;
  defaultForNewUsers: boolean;
  canBeDelegated: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

interface PermissionCheckResult {
  allowed: boolean;
  reason?: string;
  restrictions?: Record<string, any>;
  suggestions?: string[];
  alternativeActions?: string[];
  requiresApproval?: boolean;
  auditRequired?: boolean;
}

interface UseWhiteboardPermissionsReturn {
  // State
  permissions: WhiteboardPermission[];
  elementPermissions: ElementPermission[];
  areaPermissions: AreaPermission[];
  layerPermissions: LayerPermission[];
  customRoles: CustomRole[];
  currentUserPermissions: Record<string, boolean>;
  loading: boolean;
  error: string | null;
  connected: boolean;

  // Permission CRUD operations
  grantPermission: (userId: string, role: string, permissions?: Record<string, boolean>, expiresAt?: string) => Promise<void>;
  revokePermission: (userId: string) => Promise<void>;
  updatePermission: (permissionId: string, updates: Partial<WhiteboardPermission>) => Promise<void>;
  
  // Element permissions
  grantElementPermission: (elementId: string, userId: string, permissionType: string, granted: boolean, options?: {
    scope?: Record<string, any>;
    reason?: string;
    expiresAt?: string;
  }) => Promise<void>;
  revokeElementPermission: (permissionId: string) => Promise<void>;
  
  // Area permissions
  grantAreaPermission: (userId: string, areaName: string, areaBounds: { x: number; y: number; width: number; height: number }, permissionType: string, options?: {
    priority?: number;
    inclusive?: boolean;
    appliesToElements?: string[];
  }) => Promise<void>;
  revokeAreaPermission: (permissionId: string) => Promise<void>;
  
  // Layer permissions
  grantLayerPermission: (userId: string, layerIndex: number, permissions: Record<string, boolean>, layerName?: string) => Promise<void>;
  revokeLayerPermission: (permissionId: string) => Promise<void>;
  
  // Custom roles
  createCustomRole: (workspaceId: string, roleName: string, rolePermissions: Record<string, boolean>, options?: {
    roleDescription?: string;
    defaultForNewUsers?: boolean;
    canBeDelegated?: boolean;
  }) => Promise<void>;
  deleteCustomRole: (roleId: string) => Promise<void>;
  
  // Permission delegation
  delegatePermissions: (userId: string, permissions: Record<string, boolean>, expiresAt?: string) => Promise<void>;
  
  // Permission validation
  checkPermission: (permission: string, context?: {
    elementId?: string;
    position?: { x: number; y: number };
    layerIndex?: number;
    operationType?: string;
  }) => Promise<PermissionCheckResult>;
  
  // Utility functions
  refreshPermissions: () => Promise<void>;
  searchUsers: (query: string) => Promise<Array<{ id: string; name: string; email: string; }>>;
  getPermissionStats: () => Promise<{ validation: any; middleware: any; }>;
}

/**
 * Hook for managing whiteboard permissions
 */
export const useWhiteboardPermissions = (whiteboardId: string): UseWhiteboardPermissionsReturn => {
  // State
  const [permissions, setPermissions] = useState<WhiteboardPermission[]>([]);
  const [elementPermissions, setElementPermissions] = useState<ElementPermission[]>([]);
  const [areaPermissions, setAreaPermissions] = useState<AreaPermission[]>([]);
  const [layerPermissions, setLayerPermissions] = useState<LayerPermission[]>([]);
  const [customRoles, setCustomRoles] = useState<CustomRole[]>([]);
  const [currentUserPermissions, setCurrentUserPermissions] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  // WebSocket connection
  const socketRef = useRef<Socket | null>(null);

  // Initialize WebSocket connection
  useEffect(() => {
    const token = localStorage.getItem('authToken'); // Adjust based on your auth system
    
    const socket = io('/whiteboard', {
      auth: { token },
      query: { whiteboardId },
    });

    socketRef.current = socket;

    // Connection events
    socket.on('connect', () => {
      setConnected(true);
      setError(null);
      console.log('Connected to whiteboard permissions WebSocket');
    });

    socket.on('disconnect', () => {
      setConnected(false);
      console.log('Disconnected from whiteboard permissions WebSocket');
    });

    socket.on('connect_error', (error) => {
      setError(`Connection failed: ${error.message}`);
      setConnected(false);
    });

    // Permission events
    socket.on('whiteboard:permission_changed', handlePermissionChanged);
    socket.on('whiteboard:permission_denied', handlePermissionDenied);
    socket.on('whiteboard:approval_required', handleApprovalRequired);

    return () => {
      socket.disconnect();
    };
  }, [whiteboardId]);

  // Load initial permissions
  useEffect(() => {
    if (connected) {
      refreshPermissions();
    }
  }, [connected]);

  // Event handlers
  const handlePermissionChanged = useCallback((data: {
    changeType: string;
    changeData: any;
    timestamp: number;
    requiresReauth?: boolean;
  }) => {
    console.log('Permission changed:', data);
    
    if (data.requiresReauth) {
      // Handle re-authentication if permission was revoked
      setError('Your permissions have been revoked. Please refresh the page.');
      return;
    }

    // Refresh permissions to get latest state
    refreshPermissions();
  }, []);

  const handlePermissionDenied = useCallback((data: {
    event: string;
    error: {
      code: string;
      message: string;
      suggestions?: string[];
      alternativeActions?: string[];
    };
    timestamp: number;
  }) => {
    console.warn('Permission denied:', data);
    setError(data.error.message);
    
    // Show user-friendly error notification
    // This could integrate with your notification system
  }, []);

  const handleApprovalRequired = useCallback((data: {
    operationId: string;
    workflow: string;
    timestamp: number;
  }) => {
    console.log('Approval required:', data);
    // Handle approval workflow UI
  }, []);

  // Permission CRUD operations
  const grantPermission = useCallback(async (
    userId: string, 
    role: string, 
    permissions?: Record<string, boolean>, 
    expiresAt?: string
  ) => {
    return new Promise<void>((resolve, reject) => {
      if (!socketRef.current) {
        reject(new Error('Not connected'));
        return;
      }

      socketRef.current.emit('whiteboard:grant_permission', {
        targetUserId: userId,
        role,
        permissions,
        expiresAt,
      }, (response: { success: boolean; error?: string; permission?: WhiteboardPermission }) => {
        if (response.success) {
          if (response.permission) {
            setPermissions(prev => [...prev.filter(p => p.userId !== userId), response.permission!]);
          }
          resolve();
        } else {
          reject(new Error(response.error || 'Failed to grant permission'));
        }
      });
    });
  }, []);

  const revokePermission = useCallback(async (userId: string) => {
    return new Promise<void>((resolve, reject) => {
      if (!socketRef.current) {
        reject(new Error('Not connected'));
        return;
      }

      socketRef.current.emit('whiteboard:revoke_permission', {
        targetUserId: userId,
      }, (response: { success: boolean; error?: string }) => {
        if (response.success) {
          setPermissions(prev => prev.filter(p => p.userId !== userId));
          resolve();
        } else {
          reject(new Error(response.error || 'Failed to revoke permission'));
        }
      });
    });
  }, []);

  const updatePermission = useCallback(async (
    permissionId: string, 
    updates: Partial<WhiteboardPermission>
  ) => {
    return new Promise<void>((resolve, reject) => {
      if (!socketRef.current) {
        reject(new Error('Not connected'));
        return;
      }

      socketRef.current.emit('whiteboard:update_permission', {
        permissionId,
        updates,
      }, (response: { success: boolean; error?: string; permission?: WhiteboardPermission }) => {
        if (response.success && response.permission) {
          setPermissions(prev => prev.map(p => 
            p.id === permissionId ? response.permission! : p
          ));
          resolve();
        } else {
          reject(new Error(response.error || 'Failed to update permission'));
        }
      });
    });
  }, []);

  // Element permissions
  const grantElementPermission = useCallback(async (
    elementId: string,
    userId: string,
    permissionType: string,
    granted: boolean,
    options?: {
      scope?: Record<string, any>;
      reason?: string;
      expiresAt?: string;
    }
  ) => {
    return new Promise<void>((resolve, reject) => {
      if (!socketRef.current) {
        reject(new Error('Not connected'));
        return;
      }

      socketRef.current.emit('whiteboard:grant_element_permission', {
        elementId,
        targetUserId: userId,
        permissionType,
        granted,
        ...options,
      }, (response: { success: boolean; error?: string; permission?: ElementPermission }) => {
        if (response.success) {
          if (response.permission) {
            setElementPermissions(prev => {
              const filtered = prev.filter(p => 
                !(p.elementId === elementId && p.userId === userId && p.permissionType === permissionType)
              );
              return [...filtered, response.permission!];
            });
          }
          resolve();
        } else {
          reject(new Error(response.error || 'Failed to grant element permission'));
        }
      });
    });
  }, []);

  const revokeElementPermission = useCallback(async (permissionId: string) => {
    return new Promise<void>((resolve, reject) => {
      if (!socketRef.current) {
        reject(new Error('Not connected'));
        return;
      }

      socketRef.current.emit('whiteboard:revoke_element_permission', {
        permissionId,
      }, (response: { success: boolean; error?: string }) => {
        if (response.success) {
          setElementPermissions(prev => prev.filter(p => p.id !== permissionId));
          resolve();
        } else {
          reject(new Error(response.error || 'Failed to revoke element permission'));
        }
      });
    });
  }, []);

  // Area permissions
  const grantAreaPermission = useCallback(async (
    userId: string,
    areaName: string,
    areaBounds: { x: number; y: number; width: number; height: number },
    permissionType: string,
    options?: {
      priority?: number;
      inclusive?: boolean;
      appliesToElements?: string[];
    }
  ) => {
    return new Promise<void>((resolve, reject) => {
      if (!socketRef.current) {
        reject(new Error('Not connected'));
        return;
      }

      socketRef.current.emit('whiteboard:grant_area_permission', {
        targetUserId: userId,
        areaName,
        areaBounds,
        permissionType,
        ...options,
      }, (response: { success: boolean; error?: string; permission?: AreaPermission }) => {
        if (response.success) {
          if (response.permission) {
            setAreaPermissions(prev => [...prev, response.permission!]);
          }
          resolve();
        } else {
          reject(new Error(response.error || 'Failed to grant area permission'));
        }
      });
    });
  }, []);

  const revokeAreaPermission = useCallback(async (permissionId: string) => {
    return new Promise<void>((resolve, reject) => {
      if (!socketRef.current) {
        reject(new Error('Not connected'));
        return;
      }

      socketRef.current.emit('whiteboard:revoke_area_permission', {
        permissionId,
      }, (response: { success: boolean; error?: string }) => {
        if (response.success) {
          setAreaPermissions(prev => prev.filter(p => p.id !== permissionId));
          resolve();
        } else {
          reject(new Error(response.error || 'Failed to revoke area permission'));
        }
      });
    });
  }, []);

  // Layer permissions
  const grantLayerPermission = useCallback(async (
    userId: string,
    layerIndex: number,
    permissions: Record<string, boolean>,
    layerName?: string
  ) => {
    return new Promise<void>((resolve, reject) => {
      if (!socketRef.current) {
        reject(new Error('Not connected'));
        return;
      }

      socketRef.current.emit('whiteboard:grant_layer_permission', {
        targetUserId: userId,
        layerIndex,
        permissions,
        layerName,
      }, (response: { success: boolean; error?: string; permission?: LayerPermission }) => {
        if (response.success) {
          if (response.permission) {
            setLayerPermissions(prev => {
              const filtered = prev.filter(p => 
                !(p.userId === userId && p.layerIndex === layerIndex)
              );
              return [...filtered, response.permission!];
            });
          }
          resolve();
        } else {
          reject(new Error(response.error || 'Failed to grant layer permission'));
        }
      });
    });
  }, []);

  const revokeLayerPermission = useCallback(async (permissionId: string) => {
    return new Promise<void>((resolve, reject) => {
      if (!socketRef.current) {
        reject(new Error('Not connected'));
        return;
      }

      socketRef.current.emit('whiteboard:revoke_layer_permission', {
        permissionId,
      }, (response: { success: boolean; error?: string }) => {
        if (response.success) {
          setLayerPermissions(prev => prev.filter(p => p.id !== permissionId));
          resolve();
        } else {
          reject(new Error(response.error || 'Failed to revoke layer permission'));
        }
      });
    });
  }, []);

  // Custom roles
  const createCustomRole = useCallback(async (
    workspaceId: string,
    roleName: string,
    rolePermissions: Record<string, boolean>,
    options?: {
      roleDescription?: string;
      defaultForNewUsers?: boolean;
      canBeDelegated?: boolean;
    }
  ) => {
    return new Promise<void>((resolve, reject) => {
      if (!socketRef.current) {
        reject(new Error('Not connected'));
        return;
      }

      socketRef.current.emit('whiteboard:create_custom_role', {
        workspaceId,
        roleName,
        rolePermissions,
        ...options,
      }, (response: { success: boolean; error?: string; customRole?: CustomRole }) => {
        if (response.success) {
          if (response.customRole) {
            setCustomRoles(prev => [...prev, response.customRole!]);
          }
          resolve();
        } else {
          reject(new Error(response.error || 'Failed to create custom role'));
        }
      });
    });
  }, []);

  const deleteCustomRole = useCallback(async (roleId: string) => {
    return new Promise<void>((resolve, reject) => {
      if (!socketRef.current) {
        reject(new Error('Not connected'));
        return;
      }

      socketRef.current.emit('whiteboard:delete_custom_role', {
        roleId,
      }, (response: { success: boolean; error?: string }) => {
        if (response.success) {
          setCustomRoles(prev => prev.filter(r => r.id !== roleId));
          resolve();
        } else {
          reject(new Error(response.error || 'Failed to delete custom role'));
        }
      });
    });
  }, []);

  // Permission delegation
  const delegatePermissions = useCallback(async (
    userId: string,
    permissions: Record<string, boolean>,
    expiresAt?: string
  ) => {
    return new Promise<void>((resolve, reject) => {
      if (!socketRef.current) {
        reject(new Error('Not connected'));
        return;
      }

      socketRef.current.emit('whiteboard:delegate_permissions', {
        targetUserId: userId,
        permissions,
        expiresAt,
      }, (response: { success: boolean; error?: string; permission?: WhiteboardPermission }) => {
        if (response.success) {
          if (response.permission) {
            setPermissions(prev => [...prev, response.permission!]);
          }
          resolve();
        } else {
          reject(new Error(response.error || 'Failed to delegate permissions'));
        }
      });
    });
  }, []);

  // Permission validation
  const checkPermission = useCallback(async (
    permission: string,
    context?: {
      elementId?: string;
      position?: { x: number; y: number };
      layerIndex?: number;
      operationType?: string;
    }
  ): Promise<PermissionCheckResult> => {
    return new Promise((resolve, reject) => {
      if (!socketRef.current) {
        reject(new Error('Not connected'));
        return;
      }

      socketRef.current.emit('whiteboard:check_permission', {
        permission,
        context,
      }, (response: { success: boolean; error?: string; result?: PermissionCheckResult }) => {
        if (response.success && response.result) {
          resolve(response.result);
        } else {
          reject(new Error(response.error || 'Failed to check permission'));
        }
      });
    });
  }, []);

  // Utility functions
  const refreshPermissions = useCallback(async () => {
    if (!socketRef.current) return;

    setLoading(true);
    setError(null);

    try {
      await new Promise<void>((resolve, reject) => {
        socketRef.current!.emit('whiteboard:get_permissions', (response: {
          success: boolean;
          error?: string;
          permissions?: {
            permissions: WhiteboardPermission[];
            elementPermissions: ElementPermission[];
            areaPermissions: AreaPermission[];
            layerPermissions: LayerPermission[];
          };
        }) => {
          if (response.success && response.permissions) {
            setPermissions(response.permissions.permissions);
            setElementPermissions(response.permissions.elementPermissions);
            setAreaPermissions(response.permissions.areaPermissions);
            setLayerPermissions(response.permissions.layerPermissions);
            
            // Update current user permissions
            const currentUser = response.permissions.permissions.find(p => 
              p.userId === getCurrentUserId() // You'll need to implement this
            );
            if (currentUser) {
              setCurrentUserPermissions(currentUser.permissions);
            }
            
            resolve();
          } else {
            reject(new Error(response.error || 'Failed to fetch permissions'));
          }
        });
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh permissions');
    } finally {
      setLoading(false);
    }
  }, []);

  const searchUsers = useCallback(async (query: string): Promise<Array<{ id: string; name: string; email: string; }>> => {
    return new Promise((resolve, reject) => {
      if (!socketRef.current) {
        reject(new Error('Not connected'));
        return;
      }

      socketRef.current.emit('whiteboard:search_users', {
        query,
      }, (response: { success: boolean; error?: string; users?: Array<{ id: string; name: string; email: string; }> }) => {
        if (response.success && response.users) {
          resolve(response.users);
        } else {
          reject(new Error(response.error || 'Failed to search users'));
        }
      });
    });
  }, []);

  const getPermissionStats = useCallback(async () => {
    return new Promise<{ validation: any; middleware: any; }>((resolve, reject) => {
      if (!socketRef.current) {
        reject(new Error('Not connected'));
        return;
      }

      socketRef.current.emit('whiteboard:get_permission_stats', (response: {
        success: boolean;
        error?: string;
        stats?: { validation: any; middleware: any; };
      }) => {
        if (response.success && response.stats) {
          resolve(response.stats);
        } else {
          reject(new Error(response.error || 'Failed to get permission stats'));
        }
      });
    });
  }, []);

  return {
    // State
    permissions,
    elementPermissions,
    areaPermissions,
    layerPermissions,
    customRoles,
    currentUserPermissions,
    loading,
    error,
    connected,

    // Operations
    grantPermission,
    revokePermission,
    updatePermission,
    grantElementPermission,
    revokeElementPermission,
    grantAreaPermission,
    revokeAreaPermission,
    grantLayerPermission,
    revokeLayerPermission,
    createCustomRole,
    deleteCustomRole,
    delegatePermissions,
    checkPermission,
    refreshPermissions,
    searchUsers,
    getPermissionStats,
  };
};

// Helper function to get current user ID
// This should be implemented based on your authentication system
const getCurrentUserId = (): string => {
  // Implementation depends on your auth system
  // This is just a placeholder
  return localStorage.getItem('userId') || '';
};

export default useWhiteboardPermissions;