'use client';

import { useState, useEffect, useCallback } from 'react';
import type { CollaborativeWorkspace } from '@shared/types/workspace';

interface UseWorkspaceReturn {
  workspace: CollaborativeWorkspace | null;
  loading: boolean;
  error: string | null;
  refreshWorkspace: () => Promise<void>;
  updateWorkspace: (updates: Partial<CollaborativeWorkspace>) => Promise<void>;
  deleteWorkspace: () => Promise<void>;
}

/**
 * Hook for managing workspace data
 */
export function useWorkspace(workspaceId: string): UseWorkspaceReturn {
  const [workspace, setWorkspace] = useState<CollaborativeWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchWorkspace = useCallback(async () => {
    if (!workspaceId) return;

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/workspace/${workspaceId}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Workspace not found');
        }
        if (response.status === 403) {
          throw new Error('Access denied to workspace');
        }
        throw new Error(`Failed to load workspace: ${response.statusText}`);
      }

      const data = await response.json();
      setWorkspace(data.data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      console.error('Failed to fetch workspace:', err);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  const refreshWorkspace = useCallback(async () => {
    await fetchWorkspace();
  }, [fetchWorkspace]);

  const updateWorkspace = useCallback(async (updates: Partial<CollaborativeWorkspace>) => {
    if (!workspaceId || !workspace) return;

    try {
      const response = await fetch(`/api/workspace/${workspaceId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        throw new Error(`Failed to update workspace: ${response.statusText}`);
      }

      const data = await response.json();
      setWorkspace(data.data);
    } catch (err) {
      console.error('Failed to update workspace:', err);
      throw err;
    }
  }, [workspaceId, workspace]);

  const deleteWorkspace = useCallback(async () => {
    if (!workspaceId) return;

    try {
      const response = await fetch(`/api/workspace/${workspaceId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to delete workspace: ${response.statusText}`);
      }

      setWorkspace(null);
    } catch (err) {
      console.error('Failed to delete workspace:', err);
      throw err;
    }
  }, [workspaceId]);

  // Load workspace on mount and when workspaceId changes
  useEffect(() => {
    fetchWorkspace();
  }, [fetchWorkspace]);

  return {
    workspace,
    loading,
    error,
    refreshWorkspace,
    updateWorkspace,
    deleteWorkspace,
  };
}