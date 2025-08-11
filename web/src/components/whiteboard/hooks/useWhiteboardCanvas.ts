'use client';

import { useState, useEffect, useCallback } from 'react';
import { useApi } from '@/hooks/use-api';

interface CanvasState {
  canvasState: any | null;
  isLoading: boolean;
  error: string | null;
  updateCanvasState: (data: any) => void;
  resetCanvas: () => void;
}

export const useWhiteboardCanvas = (whiteboardId: string): CanvasState => {
  const [canvasState, setCanvasState] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { get } = useApi();

  // Load canvas data from API
  const loadCanvasData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await get(`/api/v1/whiteboards/${whiteboardId}/canvas`);
      
      if (response.success && response.data) {
        setCanvasState(response.data.canvasData);
      }
    } catch (err) {
      console.error('Failed to load canvas data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load canvas');
    } finally {
      setIsLoading(false);
    }
  }, [whiteboardId, get]);

  // Load canvas data on mount
  useEffect(() => {
    if (whiteboardId) {
      loadCanvasData();
    }
  }, [whiteboardId, loadCanvasData]);

  // Update canvas state
  const updateCanvasState = useCallback((data: any) => {
    setCanvasState(data);
  }, []);

  // Reset canvas to empty state
  const resetCanvas = useCallback(() => {
    setCanvasState(null);
    setError(null);
  }, []);

  return {
    canvasState,
    isLoading,
    error,
    updateCanvasState,
    resetCanvas,
  };
};