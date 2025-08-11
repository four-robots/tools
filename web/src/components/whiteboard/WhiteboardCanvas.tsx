'use client';

import React, { useCallback, useEffect, useRef } from 'react';
import { 
  Tldraw, 
  Editor,
  TldrawUiComponents,
} from '@tldraw/tldraw';
import { useWhiteboardCanvas } from './hooks/useWhiteboardCanvas';
import { useWhiteboardPersistence } from './hooks/useWhiteboardPersistence';
import { serializeCanvasData, deserializeCanvasData } from './utils/tldraw-serialization';

interface WhiteboardCanvasProps {
  whiteboardId: string;
  workspaceId: string;
  isReadOnly?: boolean;
  onCanvasChange?: (data: any) => void;
  onMount?: (editor: Editor) => void;
  className?: string;
}

export const WhiteboardCanvas: React.FC<WhiteboardCanvasProps> = ({
  whiteboardId,
  workspaceId,
  isReadOnly = false,
  onCanvasChange,
  onMount,
  className = '',
}) => {
  const editorRef = useRef<Editor | null>(null);
  
  // Canvas state management
  const {
    canvasState,
    isLoading,
    error,
    updateCanvasState,
    resetCanvas,
  } = useWhiteboardCanvas(whiteboardId);

  // Auto-save persistence
  const {
    saveCanvasData,
    isSaving,
    lastSaved,
    saveError,
  } = useWhiteboardPersistence(whiteboardId, workspaceId);

  // Handle editor mount
  const handleMount = useCallback((editor: Editor) => {
    editorRef.current = editor;
    
    // Call parent onMount if provided
    onMount?.(editor);
    
    // Load saved canvas data if available
    if (canvasState) {
      try {
        const deserializedData = deserializeCanvasData(canvasState);
        if (deserializedData) {
          editor.loadSnapshot(deserializedData);
        }
      } catch (error) {
        console.error('Failed to load canvas state:', error);
      }
    }
  }, [canvasState, onMount]);

  // Handle canvas changes with debounced save
  const handleChange = useCallback((editor: Editor) => {
    if (isReadOnly) return;

    try {
      const snapshot = editor.getSnapshot();
      const serializedData = serializeCanvasData(snapshot);
      
      // Update local state
      updateCanvasState(serializedData);
      
      // Trigger callback
      onCanvasChange?.(serializedData);
      
      // Auto-save after 5 seconds of inactivity
      saveCanvasData(serializedData);
    } catch (error) {
      console.error('Failed to save canvas changes:', error);
    }
  }, [isReadOnly, updateCanvasState, onCanvasChange, saveCanvasData]);

  // Custom UI components for workspace integration
  const customUiComponents: Partial<TldrawUiComponents> = {
    // Remove help menu and add workspace branding
    HelpMenu: null,
    DebugMenu: null,
    // Add custom menu items as needed
  };

  // Error boundary fallback
  if (error) {
    return (
      <div className="flex items-center justify-center h-full bg-red-50 border border-red-200 rounded-lg">
        <div className="text-center">
          <div className="text-red-600 font-semibold mb-2">Canvas Error</div>
          <div className="text-red-500 text-sm mb-4">{error}</div>
          <button
            onClick={resetCanvas}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Reset Canvas
          </button>
        </div>
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-50">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
          <div className="text-gray-600">Loading Canvas...</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`whiteboard-canvas-container ${className}`}>
      {/* Auto-save indicator */}
      <div className="absolute top-4 right-4 z-10">
        {isSaving && (
          <div className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-sm">
            Saving...
          </div>
        )}
        {saveError && (
          <div className="bg-red-100 text-red-700 px-3 py-1 rounded-full text-sm">
            Save failed
          </div>
        )}
        {lastSaved && !isSaving && !saveError && (
          <div className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-sm">
            Saved {new Date(lastSaved).toLocaleTimeString()}
          </div>
        )}
      </div>

      {/* Main tldraw component */}
      <div className="w-full h-full">
        <Tldraw
          onMount={handleMount}
          onChange={handleChange}
          components={customUiComponents}
          options={{
            readOnly: isReadOnly,
          }}
          persistenceKey={`whiteboard-${workspaceId}-${whiteboardId}`}
        />
      </div>
    </div>
  );
};

export default WhiteboardCanvas;