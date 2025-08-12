/**
 * Whiteboard Permissions Hook
 * 
 * React hook for managing whiteboard permissions with:
 * - Real-time permission updates
 * - Optimistic UI updates
 * - Error handling and retry logic
 * - Permission caching
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSocket } from '@/hooks/useSocket';

// Types based on the permission service
interface WhiteboardPermission {
  id: string;
  whiteboardId: string;
  userId: string;
  userName?: string;
  userEmail?: string;
  role: 'owner' | 'editor' | 'commenter' | 'viewer' | 'custom';
  permissions: CustomPermissionSet;
  grantedBy: string;
  grantedAt: string;
  expiresAt?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface CustomPermissionSet {
  canView: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canComment: boolean;
  canCreateElements: boolean;
  canUpdateElements: boolean;
  canDeleteElements: boolean;
  canMoveElements: boolean;
  canResizeElements: boolean;
  canStyleElements: boolean;
  canLockElements: boolean;
  canGroupElements: boolean;
  canManagePermissions: boolean;
  canShare: boolean;
  canExport: boolean;
  canCreateTemplates: boolean;
  canViewHistory: boolean;
  canRestoreVersions: boolean;
  canManageComments: boolean;
  canSeePresence: boolean;
  canSeeCursors: boolean;
  canUseVoiceChat: boolean;
  canScreenShare: boolean;
  elementPermissions: ElementPermission[];
  areaPermissions: AreaPermission[];
  layerPermissions: LayerPermission[];
  timeBased?: TimeBasedPermission;
}

interface ElementPermission {
  elementId: string;
  elementType: string;
  canView: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canMove: boolean;
  canStyle: boolean;
  canComment: boolean;
}

interface AreaPermission {
  areaId: string;
  name: string;
  bounds: { x: number; y: number; width: number; height: number };
  canView: boolean;
  canEdit: boolean;
  canComment: boolean;
  priority: number;
}

interface LayerPermission {
  layerIndex: number;
  layerName?: string;
  canView: boolean;
  canEdit: boolean;
  canReorder: boolean;
}

interface TimeBasedPermission {
  startTime?: string;
  endTime?: string;
  timezone: string;
  isActive: boolean;
  recurringPattern: 'none' | 'daily' | 'weekly' | 'monthly';
}

interface PermissionUpdate {
  role?: 'owner' | 'editor' | 'commenter' | 'viewer' | 'custom';
  permissions?: Partial<CustomPermissionSet>;
  expiresAt?: string;
}

interface UseWhiteboardPermissionsReturn {
  permissions: WhiteboardPermission[];
  loading: boolean;
  error: string | null;
  grantPermission: (userEmail: string, grantedBy: string, role: 'editor' | 'commenter' | 'viewer', customPermissions?: Partial<CustomPermissionSet>, expiresAt?: string) => Promise<void>;
  revokePermission: (userId: string, revokedBy: string) => Promise<void>;
  updatePermission: (userId: string, updatedBy: string, updates: PermissionUpdate) => Promise<void>;
  refreshPermissions: () => Promise<void>;
  checkPermission: (userId: string, action: string, elementId?: string, position?: { x: number; y: number }, layerIndex?: number) => boolean;
  getUserPermissions: (userId: string) => WhiteboardPermission | null;
}

const PERMISSION_CACHE_KEY = 'whiteboard_permissions_cache';
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Hook for managing whiteboard permissions
 */
export function useWhiteboardPermissions(whiteboardId: string): UseWhiteboardPermissionsReturn {
  const [permissions, setPermissions] = useState<WhiteboardPermission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const socket = useSocket();

  // Load permissions from cache or API
  const loadPermissions = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Try to load from cache first
      const cached = loadFromCache(whiteboardId);
      if (cached && cached.timestamp > Date.now() - CACHE_DURATION) {
        setPermissions(cached.permissions);
        setLoading(false);
        return;
      }

      // Fetch from API
      const response = await fetch(`/api/whiteboards/${whiteboardId}/permissions`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error(`Failed to load permissions: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const permissionsData = data.permissions || [];
      
      setPermissions(permissionsData);
      
      // Cache the results
      saveToCache(whiteboardId, permissionsData);
      
    } catch (err) {
      console.error('Error loading permissions:', err);
      setError(err instanceof Error ? err.message : 'Failed to load permissions');
    } finally {
      setLoading(false);
    }
  }, [whiteboardId]);

  // Grant permission to a user
  const grantPermission = useCallback(async (
    userEmail: string,
    grantedBy: string,
    role: 'editor' | 'commenter' | 'viewer',
    customPermissions?: Partial<CustomPermissionSet>,
    expiresAt?: string
  ) => {
    try {
      const response = await fetch(`/api/whiteboards/${whiteboardId}/permissions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          userEmail,
          grantedBy,
          role,
          customPermissions,
          expiresAt,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `Failed to grant permission: ${response.status}`);
      }

      const newPermission = await response.json();
      
      // Optimistically update the UI
      setPermissions(prev => [...prev, newPermission]);
      
      // Clear cache to ensure fresh data on next load
      clearCache(whiteboardId);
      
      // Emit socket event for real-time updates
      if (socket) {
        socket.emit('whiteboard:permission_granted', {
          whiteboardId,
          permission: newPermission,
          grantedBy,
        });
      }
      
    } catch (err) {
      console.error('Error granting permission:', err);
      throw err;
    }
  }, [whiteboardId, socket]);

  // Revoke permission from a user
  const revokePermission = useCallback(async (userId: string, revokedBy: string) => {
    try {
      const response = await fetch(`/api/whiteboards/${whiteboardId}/permissions/${userId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ revokedBy }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `Failed to revoke permission: ${response.status}`);
      }

      // Optimistically update the UI
      setPermissions(prev => prev.filter(p => p.userId !== userId));
      
      // Clear cache
      clearCache(whiteboardId);
      
      // Emit socket event
      if (socket) {
        socket.emit('whiteboard:permission_revoked', {
          whiteboardId,
          userId,
          revokedBy,
        });
      }
      
    } catch (err) {
      console.error('Error revoking permission:', err);
      throw err;
    }
  }, [whiteboardId, socket]);

  // Update user permissions
  const updatePermission = useCallback(async (
    userId: string,
    updatedBy: string,
    updates: PermissionUpdate
  ) => {
    try {
      const response = await fetch(`/api/whiteboards/${whiteboardId}/permissions/${userId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          ...updates,
          updatedBy,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `Failed to update permission: ${response.status}`);
      }

      const updatedPermission = await response.json();
      
      // Optimistically update the UI
      setPermissions(prev => 
        prev.map(p => p.userId === userId ? updatedPermission : p)
      );
      
      // Clear cache
      clearCache(whiteboardId);
      
      // Emit socket event
      if (socket) {
        socket.emit('whiteboard:permission_updated', {
          whiteboardId,
          permission: updatedPermission,
          updatedBy,
        });
      }
      
    } catch (err) {
      console.error('Error updating permission:', err);
      throw err;
    }
  }, [whiteboardId, socket]);

  // Refresh permissions from server
  const refreshPermissions = useCallback(async () => {
    clearCache(whiteboardId);
    await loadPermissions();
  }, [whiteboardId, loadPermissions]);

  // Check if a user has a specific permission
  const checkPermission = useCallback((
    userId: string,
    action: string,
    elementId?: string,
    position?: { x: number; y: number },
    layerIndex?: number
  ): boolean => {
    const userPermission = permissions.find(p => p.userId === userId);
    if (!userPermission) return false;

    const { permissions: perms } = userPermission;

    // Check basic permission
    const hasBasicPermission = (perms as any)[action];
    if (!hasBasicPermission) return false;

    // Check element-specific permissions
    if (elementId && perms.elementPermissions.length > 0) {
      const elementPerm = perms.elementPermissions.find(ep => ep.elementId === elementId);
      if (elementPerm) {
        switch (action) {
          case 'canView':
            return elementPerm.canView;
          case 'canEdit':
          case 'canUpdateElements':
            return elementPerm.canEdit;
          case 'canDelete':
          case 'canDeleteElements':
            return elementPerm.canDelete;
          case 'canMoveElements':
            return elementPerm.canMove;
          case 'canStyleElements':
            return elementPerm.canStyle;
          case 'canComment':
            return elementPerm.canComment;
          default:
            return false;
        }
      }
    }

    // Check area-based permissions
    if (position && perms.areaPermissions.length > 0) {
      const matchingAreas = perms.areaPermissions
        .filter(area => isPointInArea(position, area.bounds))
        .sort((a, b) => b.priority - a.priority);
      
      if (matchingAreas.length > 0) {
        const area = matchingAreas[0];
        switch (action) {
          case 'canView':
            return area.canView;
          case 'canEdit':
          case 'canUpdateElements':
          case 'canCreateElements':
          case 'canMoveElements':
            return area.canEdit;
          case 'canComment':
            return area.canComment;
          default:
            return false;
        }
      }
    }

    // Check layer-based permissions
    if (layerIndex !== undefined && perms.layerPermissions.length > 0) {
      const layerPerm = perms.layerPermissions.find(lp => lp.layerIndex === layerIndex);
      if (layerPerm) {
        switch (action) {
          case 'canView':
            return layerPerm.canView;
          case 'canEdit':
          case 'canUpdateElements':
          case 'canCreateElements':
            return layerPerm.canEdit;
          case 'canManageLayerOrder':
            return layerPerm.canReorder;
          default:
            return false;
        }
      }
    }

    return hasBasicPermission;
  }, [permissions]);

  // Get permissions for a specific user
  const getUserPermissions = useCallback((userId: string): WhiteboardPermission | null => {
    return permissions.find(p => p.userId === userId) || null;
  }, [permissions]);

  // Set up socket listeners for real-time updates
  useEffect(() => {
    if (!socket) return;

    const handlePermissionGranted = (data: { whiteboardId: string; permission: WhiteboardPermission }) => {
      if (data.whiteboardId === whiteboardId) {
        setPermissions(prev => {
          const exists = prev.some(p => p.id === data.permission.id);
          return exists ? prev : [...prev, data.permission];
        });
        clearCache(whiteboardId);
      }
    };

    const handlePermissionRevoked = (data: { whiteboardId: string; userId: string }) => {
      if (data.whiteboardId === whiteboardId) {
        setPermissions(prev => prev.filter(p => p.userId !== data.userId));
        clearCache(whiteboardId);
      }
    };

    const handlePermissionUpdated = (data: { whiteboardId: string; permission: WhiteboardPermission }) => {
      if (data.whiteboardId === whiteboardId) {
        setPermissions(prev => 
          prev.map(p => p.id === data.permission.id ? data.permission : p)
        );
        clearCache(whiteboardId);
      }
    };

    socket.on('whiteboard:permission_granted', handlePermissionGranted);
    socket.on('whiteboard:permission_revoked', handlePermissionRevoked);
    socket.on('whiteboard:permission_updated', handlePermissionUpdated);

    return () => {
      socket.off('whiteboard:permission_granted', handlePermissionGranted);
      socket.off('whiteboard:permission_revoked', handlePermissionRevoked);
      socket.off('whiteboard:permission_updated', handlePermissionUpdated);
    };
  }, [socket, whiteboardId]);

  // Load permissions on mount and when whiteboardId changes
  useEffect(() => {
    if (whiteboardId) {
      loadPermissions();
    }
  }, [whiteboardId, loadPermissions]);

  return {
    permissions,
    loading,
    error,
    grantPermission,
    revokePermission,
    updatePermission,
    refreshPermissions,
    checkPermission,
    getUserPermissions,
  };
}

// Utility functions

function loadFromCache(whiteboardId: string): { permissions: WhiteboardPermission[]; timestamp: number } | null {
  try {
    const cached = localStorage.getItem(`${PERMISSION_CACHE_KEY}_${whiteboardId}`);
    return cached ? JSON.parse(cached) : null;
  } catch {
    return null;
  }
}

function saveToCache(whiteboardId: string, permissions: WhiteboardPermission[]): void {
  try {
    localStorage.setItem(`${PERMISSION_CACHE_KEY}_${whiteboardId}`, JSON.stringify({
      permissions,
      timestamp: Date.now(),
    }));
  } catch {
    // Ignore storage errors
  }
}

function clearCache(whiteboardId: string): void {
  try {
    localStorage.removeItem(`${PERMISSION_CACHE_KEY}_${whiteboardId}`);
  } catch {
    // Ignore storage errors
  }
}

function isPointInArea(
  point: { x: number; y: number },
  bounds: { x: number; y: number; width: number; height: number }
): boolean {
  return (
    point.x >= bounds.x &&
    point.x <= bounds.x + bounds.width &&
    point.y >= bounds.y &&
    point.y <= bounds.y + bounds.height
  );
}