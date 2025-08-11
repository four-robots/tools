'use client';

import { useState, useCallback } from 'react';
import { useApi } from '@/hooks/use-api';
import { 
  Whiteboard,
  CreateWhiteboardRequest,
  UpdateWhiteboardRequest,
} from '@shared/types/whiteboard.js';

interface WhiteboardOperations {
  whiteboards: Whiteboard[];
  isLoading: boolean;
  error: string | null;
  createWhiteboard: (data: CreateWhiteboardRequest) => Promise<Whiteboard | null>;
  updateWhiteboard: (id: string, data: UpdateWhiteboardRequest) => Promise<Whiteboard | null>;
  deleteWhiteboard: (id: string) => Promise<boolean>;
  loadWhiteboards: () => Promise<void>;
  getWhiteboard: (id: string) => Promise<Whiteboard | null>;
}

export const useWhiteboard = (workspaceId: string): WhiteboardOperations => {
  const [whiteboards, setWhiteboards] = useState<Whiteboard[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { get, post, put, del } = useApi();

  // Load whiteboards for workspace
  const loadWhiteboards = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await get(`/api/v1/workspaces/${workspaceId}/whiteboards`);
      
      if (response.success) {
        setWhiteboards(response.data.items || []);
      } else {
        throw new Error(response.error || 'Failed to load whiteboards');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load whiteboards';
      setError(errorMessage);
      console.error('Load whiteboards error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId, get]);

  // Get single whiteboard
  const getWhiteboard = useCallback(async (id: string): Promise<Whiteboard | null> => {
    try {
      const response = await get(`/api/v1/workspaces/${workspaceId}/whiteboards/${id}`);
      
      if (response.success) {
        return response.data;
      } else {
        throw new Error(response.error || 'Failed to get whiteboard');
      }
    } catch (err) {
      console.error('Get whiteboard error:', err);
      setError(err instanceof Error ? err.message : 'Failed to get whiteboard');
      return null;
    }
  }, [workspaceId, get]);

  // Create whiteboard
  const createWhiteboard = useCallback(async (data: CreateWhiteboardRequest): Promise<Whiteboard | null> => {
    try {
      setError(null);

      const response = await post(`/api/v1/workspaces/${workspaceId}/whiteboards`, data);
      
      if (response.success) {
        const newWhiteboard = response.data;
        setWhiteboards(prev => [newWhiteboard, ...prev]);
        return newWhiteboard;
      } else {
        throw new Error(response.error || 'Failed to create whiteboard');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create whiteboard';
      setError(errorMessage);
      console.error('Create whiteboard error:', err);
      return null;
    }
  }, [workspaceId, post]);

  // Update whiteboard
  const updateWhiteboard = useCallback(async (id: string, data: UpdateWhiteboardRequest): Promise<Whiteboard | null> => {
    try {
      setError(null);

      const response = await put(`/api/v1/workspaces/${workspaceId}/whiteboards/${id}`, data);
      
      if (response.success) {
        const updatedWhiteboard = response.data;
        setWhiteboards(prev => 
          prev.map(w => w.id === id ? updatedWhiteboard : w)
        );
        return updatedWhiteboard;
      } else {
        throw new Error(response.error || 'Failed to update whiteboard');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update whiteboard';
      setError(errorMessage);
      console.error('Update whiteboard error:', err);
      return null;
    }
  }, [workspaceId, put]);

  // Delete whiteboard
  const deleteWhiteboard = useCallback(async (id: string): Promise<boolean> => {
    try {
      setError(null);

      const response = await del(`/api/v1/workspaces/${workspaceId}/whiteboards/${id}`);
      
      if (response.success) {
        setWhiteboards(prev => prev.filter(w => w.id !== id));
        return true;
      } else {
        throw new Error(response.error || 'Failed to delete whiteboard');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete whiteboard';
      setError(errorMessage);
      console.error('Delete whiteboard error:', err);
      return false;
    }
  }, [workspaceId, del]);

  return {
    whiteboards,
    isLoading,
    error,
    createWhiteboard,
    updateWhiteboard,
    deleteWhiteboard,
    loadWhiteboards,
    getWhiteboard,
  };
};