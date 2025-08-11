'use client';

import { useState, useCallback, useRef } from 'react';
import { useApi } from '@/hooks/use-api';
import { useDebounce } from '@/hooks/useDebounce';

interface PersistenceState {
  saveCanvasData: (data: any) => void;
  isSaving: boolean;
  lastSaved: Date | null;
  saveError: string | null;
}

export const useWhiteboardPersistence = (
  whiteboardId: string,
  workspaceId: string
): PersistenceState => {
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const { put } = useApi();
  
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Debounced save function - saves after 5 seconds of inactivity
  const saveCanvasData = useCallback(
    useDebounce(async (canvasData: any) => {
      if (!whiteboardId || !workspaceId) return;

      try {
        setIsSaving(true);
        setSaveError(null);

        const response = await put(
          `/api/v1/workspaces/${workspaceId}/whiteboards/${whiteboardId}`,
          {
            canvasData,
          }
        );

        if (response.success) {
          setLastSaved(new Date());
        } else {
          throw new Error(response.error || 'Failed to save canvas');
        }
      } catch (error) {
        console.error('Canvas save error:', error);
        setSaveError(error instanceof Error ? error.message : 'Save failed');
      } finally {
        setIsSaving(false);
      }
    }, 5000), // 5 second debounce
    [whiteboardId, workspaceId, put]
  );

  return {
    saveCanvasData,
    isSaving,
    lastSaved,
    saveError,
  };
};