/**
 * WhiteboardSelectionIntegration Component
 * 
 * Integrates multi-user selection highlighting with tldraw whiteboard editor.
 * Provides seamless integration between tldraw selection events and collaborative
 * selection highlighting system.
 */

'use client';

import React, { useCallback, useEffect, useRef, useMemo } from 'react';
import { Editor, TLShape, TLShapeId } from '@tldraw/tldraw';
import { SelectionManager } from './SelectionManager';
import { useSelectionState } from '../../hooks/useSelectionState';
import { useSelectionHighlight } from '../../hooks/useSelectionHighlight';
import { useSelectionConflicts } from '../../hooks/useSelectionConflicts';
import inputValidator from './utils/input-validation';
import { atomicQueue } from '../../hooks/utils/atomic-operations';

interface WhiteboardSelectionIntegrationProps {
  /** Tldraw editor instance */
  editor: Editor | null;

  /** Whiteboard configuration */
  whiteboardId: string;
  sessionId: string;
  
  /** User information */
  user: {
    id: string;
    name: string;
    color: string;
  };

  /** Canvas viewport for performance optimization */
  viewport: {
    x: number;
    y: number;
    width: number;
    height: number;
  };

  /** Canvas transform state */
  canvasTransform: {
    x: number;
    y: number;
    zoom: number;
  };

  /** WebSocket configuration */
  socketConfig: {
    serverUrl: string;
    token: string;
  };

  /** Performance and behavior settings */
  settings?: {
    performanceMode?: 'high' | 'balanced' | 'low';
    maxSelections?: number;
    enableConflictResolution?: boolean;
    autoResolveConflicts?: boolean;
    throttleMs?: number;
    debug?: boolean;
  };

  /** Event handlers */
  onSelectionConflict?: (conflictId: string, elementIds: string[]) => void;
  onOwnershipChanged?: (elementId: string, ownerId: string) => void;
}

/**
 * Convert tldraw shape to bounds
 */
const getShapeBounds = (editor: Editor, shapeId: TLShapeId) => {
  try {
    const shape = editor.getShape(shapeId);
    if (!shape) return null;

    const bounds = editor.getShapeGeometry(shape).bounds;
    const transform = editor.getShapePageTransform(shape);
    
    if (!bounds || !transform) return null;

    // Apply transform to get world coordinates
    const worldBounds = {
      x: bounds.x + transform.x,
      y: bounds.y + transform.y,
      width: bounds.width,
      height: bounds.height,
    };

    return worldBounds;
  } catch (error) {
    console.error('Error getting shape bounds:', error);
    return null;
  }
};

/**
 * Get combined bounds for multiple shapes
 */
const getCombinedBounds = (editor: Editor, shapeIds: TLShapeId[]) => {
  const bounds = shapeIds
    .map(id => getShapeBounds(editor, id))
    .filter(Boolean);

  if (bounds.length === 0) return null;

  const minX = Math.min(...bounds.map(b => b!.x));
  const minY = Math.min(...bounds.map(b => b!.y));
  const maxX = Math.max(...bounds.map(b => b!.x + b!.width));
  const maxY = Math.max(...bounds.map(b => b!.y + b!.height));

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
};

/**
 * Main selection integration component
 */
export const WhiteboardSelectionIntegration: React.FC<WhiteboardSelectionIntegrationProps> = ({
  editor,
  whiteboardId,
  sessionId,
  user,
  viewport,
  canvasTransform,
  socketConfig,
  settings = {},
  onSelectionConflict,
  onOwnershipChanged,
}) => {
  const lastSelectionRef = useRef<string[]>([]);
  const selectionUpdateInProgress = useRef(false);

  // Default settings
  const config = useMemo(() => ({
    performanceMode: settings.performanceMode || 'balanced',
    maxSelections: settings.maxSelections || 25,
    enableConflictResolution: settings.enableConflictResolution !== false,
    autoResolveConflicts: settings.autoResolveConflicts !== false,
    throttleMs: settings.throttleMs || 100,
    debug: settings.debug || false,
    ...settings,
  }), [settings]);

  // Selection state management
  const selectionState = useSelectionState({
    serverUrl: socketConfig.serverUrl,
    token: socketConfig.token,
    whiteboardId,
    sessionId,
    user,
    throttleMs: config.throttleMs,
    debug: config.debug,
  });

  // Conflict resolution
  const conflictManager = useSelectionConflicts(
    selectionState.conflicts,
    selectionState.ownerships,
    {
      currentUserId: user.id,
      strategy: {
        auto: config.autoResolveConflicts ? 'priority' : 'disabled',
        autoResolveTimeoutMs: 5000,
        enableManualResolution: config.enableConflictResolution,
        showNotifications: true,
        maxConflictsPerElement: 3,
      },
      onResolveConflict: selectionState.resolveConflict,
      onNotification: (notification) => {
        if (config.debug) {
          console.log('[SelectionIntegration] Conflict notification:', notification);
        }
      },
      debug: config.debug,
    }
  );

  // Selection highlighting
  const highlightManager = useSelectionHighlight(
    selectionState.highlights,
    conflictManager.conflicts,
    conflictManager.ownerships || [],
    {
      config: {
        performanceMode: config.performanceMode,
        maxHighlights: config.maxSelections,
        enableViewportCulling: true,
        animationEnabled: config.performanceMode !== 'low',
        animationDuration: 300,
        defaultOpacity: 0.3,
        conflictOpacity: 0.5,
        currentUserOpacity: 0.4,
        updateThrottleMs: config.throttleMs,
        debug: config.debug,
      },
      viewport,
      canvasTransform,
      currentUserId: user.id,
      getElementBounds: useCallback((elementId: string) => {
        if (!editor) return null;
        return getShapeBounds(editor, elementId as TLShapeId);
      }, [editor]),
      onHighlightClick: useCallback((highlight) => {
        if (config.debug) {
          console.log('[SelectionIntegration] Highlight clicked:', highlight);
        }
        // Could focus on the selected elements or show user info
      }, [config.debug]),
      onConflictResolve: selectionState.resolveConflict,
    }
  );

  // Handle tldraw selection changes with atomic operations
  const handleTldrawSelectionChange = useCallback(async () => {
    if (!editor || selectionUpdateInProgress.current) return;

    try {
      const selectedShapeIds = editor.getSelectedShapeIds();
      const selectedIds = Array.from(selectedShapeIds);

      // Check if selection actually changed
      const currentSelection = selectedIds.sort();
      const lastSelection = lastSelectionRef.current.sort();
      
      if (JSON.stringify(currentSelection) === JSON.stringify(lastSelection)) {
        return; // No change
      }

      lastSelectionRef.current = selectedIds;

      if (config.debug) {
        console.log('[SelectionIntegration] Tldraw selection changed:', selectedIds);
      }

      // Get combined bounds for the selection
      const bounds = selectedIds.length > 0 
        ? getCombinedBounds(editor, selectedIds as TLShapeId[])
        : undefined;

      // Enhanced validation with client context
      const validationResult = inputValidator.validateSelectionUpdate(
        {
          elementIds: selectedIds,
          bounds,
          isMultiSelect: selectedIds.length > 1,
        },
        user.id // Client ID for rate limiting and behavior tracking
      );

      if (!validationResult.isValid) {
        console.error('[SelectionIntegration] Invalid selection update:', {
          userId: user.id,
          errors: validationResult.errors,
          elementIds: selectedIds,
          bounds,
        });
        
        // Check if user is blocked due to suspicious behavior
        const isBlocked = validationResult.errors.some(error => error.code === 'CLIENT_BLOCKED');
        if (isBlocked) {
          console.warn('[SelectionIntegration] User blocked due to suspicious activity');
          // Could trigger a UI notification here
        }
        
        return;
      }

      if (validationResult.warnings) {
        console.warn('[SelectionIntegration] Selection validation warnings:', {
          userId: user.id,
          warnings: validationResult.warnings,
          sanitizedData: validationResult.sanitized,
        });
      }

      // Update selection state with validated data using atomic operations
      selectionUpdateInProgress.current = true;
      
      try {
        if (validationResult.sanitized!.elementIds.length > 0) {
          // Check if we should throttle based on recent activity
          const now = Date.now();
          const timeSinceLastUpdate = now - (lastSelectionRef.current as any).lastUpdateTime || 0;
          
          if (timeSinceLastUpdate < config.throttleMs / 2) {
            // Very rapid updates, add small delay to prevent overwhelming server
            await new Promise(resolve => setTimeout(resolve, 50));
          }
          
          const updateSuccess = await selectionState.updateSelection(validationResult.sanitized!);
          
          if (updateSuccess) {
            (lastSelectionRef.current as any).lastUpdateTime = now;
          } else if (config.debug) {
            console.warn('[SelectionIntegration] Selection update failed, possible rate limiting');
          }
        } else {
          await selectionState.clearSelection();
        }
      } finally {
        selectionUpdateInProgress.current = false;
      }
    } catch (error) {
      console.error('[SelectionIntegration] Error handling selection change:', error);
      selectionUpdateInProgress.current = false;
    }
  }, [editor, selectionState, config.debug, user.id]);

  // Handle external selection updates (from other users)
  const handleExternalSelectionUpdate = useCallback((newSelections: typeof selectionState.selections) => {
    if (!editor || !config.enableConflictResolution) return;

    // Check for conflicts with current user's selection
    const currentSelection = Array.from(editor.getSelectedShapeIds());
    if (currentSelection.length === 0) return;

    for (const selection of newSelections) {
      if (selection.userId === user.id) continue; // Skip own selections

      const conflictingElements = currentSelection.filter(id => 
        selection.elementIds.includes(id)
      );

      if (conflictingElements.length > 0 && onSelectionConflict) {
        // Find the actual conflict data
        const conflict = conflictManager.conflicts.find(c => 
          conflictingElements.includes(c.elementId)
        );
        
        if (conflict) {
          onSelectionConflict(conflict.conflictId, conflictingElements);
        }
      }
    }
  }, [editor, user.id, conflictManager.conflicts, onSelectionConflict, config.enableConflictResolution]);

  // Handle ownership changes
  useEffect(() => {
    if (!onOwnershipChanged) return;

    for (const ownership of selectionState.ownerships) {
      if (ownership.ownerId !== user.id) {
        onOwnershipChanged(ownership.elementId, ownership.ownerId);
      }
    }
  }, [selectionState.ownerships, onOwnershipChanged, user.id]);

  // Listen for tldraw selection changes
  useEffect(() => {
    if (!editor) return;

    // Use tldraw's selection change event
    const unsubscribe = editor.sideEffects.registerAfterChangeHandler('selection', () => {
      handleTldrawSelectionChange();
    });

    return unsubscribe;
  }, [editor, handleTldrawSelectionChange]);

  // Handle external selection updates
  useEffect(() => {
    handleExternalSelectionUpdate(selectionState.selections);
  }, [selectionState.selections, handleExternalSelectionUpdate]);

  // Handle incoming collaborative selections that should update tldraw with atomic operations
  useEffect(() => {
    if (!editor || selectionUpdateInProgress.current) return;

    // Find selections from current user that might need to be applied to tldraw
    const currentUserSelection = selectionState.selections.find(s => s.userId === user.id);
    
    if (currentUserSelection) {
      const currentTldrawSelection = Array.from(editor.getSelectedShapeIds());
      const expectedSelection = currentUserSelection.elementIds.sort();
      const actualSelection = currentTldrawSelection.sort();

      // If tldraw selection doesn't match our expected selection, update it atomically
      if (JSON.stringify(expectedSelection) !== JSON.stringify(actualSelection)) {
        // Use atomic queue to prevent race conditions
        atomicQueue.executeImmediate(async () => {
          try {
            if (expectedSelection.length > 0) {
              editor.setSelectedShapes(expectedSelection as TLShapeId[]);
            } else {
              editor.selectNone();
            }
          } catch (error) {
            console.error('[SelectionIntegration] Error updating tldraw selection:', error);
            throw error;
          }
        }, 1000);
      }
    }
  }, [editor, selectionState.selections, user.id]);

  // Auto-connect on mount
  useEffect(() => {
    if (!selectionState.connected) {
      selectionState.connect();
    }
  }, [selectionState]);

  // Debug logging
  useEffect(() => {
    if (config.debug) {
      console.log('[SelectionIntegration] State update:', {
        connected: selectionState.connected,
        selections: selectionState.selections.length,
        conflicts: conflictManager.conflicts.length,
        highlights: highlightManager.highlights.length,
        currentSelection: selectionState.currentSelection,
      });
    }
  }, [
    selectionState.connected,
    selectionState.selections,
    conflictManager.conflicts,
    highlightManager.highlights,
    selectionState.currentSelection,
    config.debug,
  ]);

  // Don't render anything if editor is not available
  if (!editor) {
    return null;
  }

  return (
    <>
      {/* Selection highlight overlay */}
      <SelectionManager
        whiteboardId={whiteboardId}
        currentUserId={user.id}
        selections={selectionState.selections}
        conflicts={conflictManager.conflicts}
        ownerships={selectionState.ownerships}
        canvasTransform={canvasTransform}
        viewportBounds={viewport}
        getElementBounds={highlightManager.getElementBounds}
        onSelectionClick={highlightManager.onHighlightClick}
        onConflictResolve={highlightManager.onConflictResolve}
        performanceMode={config.performanceMode}
        maxVisibleSelections={config.maxSelections}
        enableVirtualization={config.performanceMode !== 'high'}
      />

      {/* Connection status for debugging */}
      {config.debug && (
        <div className="fixed bottom-4 left-4 z-50 bg-black bg-opacity-75 text-white p-2 rounded text-xs">
          <div>Selection Service: {selectionState.connected ? '✓' : '✗'}</div>
          <div>Selections: {selectionState.selections.length}</div>
          <div>Conflicts: {conflictManager.conflicts.length}</div>
          <div>Highlights: {highlightManager.highlights.length}</div>
          <div>Latency: {selectionState.latency}ms</div>
          {selectionState.error && (
            <div className="text-red-300">Error: {selectionState.error}</div>
          )}
        </div>
      )}
    </>
  );
};

export default WhiteboardSelectionIntegration;