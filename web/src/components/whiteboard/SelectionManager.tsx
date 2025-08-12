/**
 * SelectionManager Component
 * 
 * Manages all selection highlights for a whiteboard, coordinating multiple users'
 * selections and handling conflicts. Provides performance optimization through
 * virtualization and efficient rendering.
 */

'use client';

import React, { useMemo, useCallback, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import SelectionHighlight, {
  SelectionHighlightData,
  SelectionConflictData,
  SelectionOwnership,
} from './SelectionHighlight';
import boundsCache from './utils/bounds-cache';
import inputValidator from './utils/input-validation';

export interface SelectionState {
  userId: string;
  userName: string;
  userColor: string;
  whiteboardId: string;
  sessionId: string;
  elementIds: string[];
  selectionBounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  timestamp: number;
  isMultiSelect: boolean;
  priority: number;
  isActive: boolean;
  lastSeen: number;
}

interface SelectionManagerProps {
  /** Current whiteboard ID */
  whiteboardId: string;

  /** Current user ID */
  currentUserId: string;

  /** All active selections */
  selections: SelectionState[];

  /** Active selection conflicts */
  conflicts: SelectionConflictData[];

  /** Element ownerships */
  ownerships: SelectionOwnership[];

  /** Canvas transform for coordinate conversion */
  canvasTransform: {
    x: number;
    y: number;
    zoom: number;
  };

  /** Viewport bounds for performance optimization */
  viewportBounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };

  /** Callback for getting element bounds */
  getElementBounds: (elementId: string) => { x: number; y: number; width: number; height: number } | null;

  /** Selection event handlers */
  onSelectionClick?: (highlight: SelectionHighlightData) => void;
  onConflictResolve?: (conflictId: string, resolution: 'ownership' | 'shared' | 'cancel') => void;

  /** Performance settings */
  performanceMode?: 'high' | 'balanced' | 'low';
  maxVisibleSelections?: number;
  enableVirtualization?: boolean;
}

/**
 * Performance-optimized viewport visibility calculator
 */
const useViewportVisibility = (
  bounds: { x: number; y: number; width: number; height: number },
  viewportBounds: { x: number; y: number; width: number; height: number },
  canvasTransform: { x: number; y: number; zoom: number }
) => {
  return useMemo(() => {
    // Convert element bounds to screen coordinates
    const screenBounds = {
      x: (bounds.x + canvasTransform.x) * canvasTransform.zoom,
      y: (bounds.y + canvasTransform.y) * canvasTransform.zoom,
      width: bounds.width * canvasTransform.zoom,
      height: bounds.height * canvasTransform.zoom,
    };

    // Add buffer zone for smooth transitions
    const buffer = 50;
    const expandedViewport = {
      x: viewportBounds.x - buffer,
      y: viewportBounds.y - buffer,
      width: viewportBounds.width + buffer * 2,
      height: viewportBounds.height + buffer * 2,
    };

    // Check intersection
    const isVisible = !(
      screenBounds.x + screenBounds.width < expandedViewport.x ||
      screenBounds.x > expandedViewport.x + expandedViewport.width ||
      screenBounds.y + screenBounds.height < expandedViewport.y ||
      screenBounds.y > expandedViewport.y + expandedViewport.height
    );

    return isVisible;
  }, [bounds, viewportBounds, canvasTransform]);
};

/**
 * Selection highlight with visibility optimization
 */
const OptimizedSelectionHighlight: React.FC<{
  highlight: SelectionHighlightData;
  conflicts: SelectionConflictData[];
  ownerships: SelectionOwnership[];
  canvasTransform: { x: number; y: number; zoom: number };
  viewportBounds: { x: number; y: number; width: number; height: number };
  isCurrentUser: boolean;
  getElementBounds: (elementId: string) => { x: number; y: number; width: number; height: number } | null;
  onSelectionClick?: (highlight: SelectionHighlightData) => void;
  onConflictResolve?: (conflictId: string, resolution: 'ownership' | 'shared' | 'cancel') => void;
  enableVirtualization?: boolean;
}> = ({
  highlight,
  conflicts,
  ownerships,
  canvasTransform,
  viewportBounds,
  isCurrentUser,
  getElementBounds,
  onSelectionClick,
  onConflictResolve,
  enableVirtualization = true,
}) => {
  // Calculate combined bounds for visibility check using cache
  const combinedBounds = useMemo(() => {
    if (highlight.bounds) {
      return highlight.bounds;
    }

    // Use bounds cache to avoid O(n²) recalculation
    return boundsCache.getCombined(
      highlight.elementIds, 
      getElementBounds,
      false // Don't force refresh
    ) || { x: 0, y: 0, width: 0, height: 0 };
  }, [highlight.bounds, highlight.elementIds, getElementBounds]);

  // Check if visible in viewport (for performance optimization)
  const isVisible = useViewportVisibility(
    combinedBounds,
    viewportBounds,
    canvasTransform
  );

  // Skip rendering if virtualization is enabled and not visible
  if (enableVirtualization && !isVisible) {
    return null;
  }

  return (
    <SelectionHighlight
      key={highlight.userId}
      highlight={highlight}
      conflicts={conflicts}
      ownerships={ownerships}
      canvasTransform={canvasTransform}
      isCurrentUser={isCurrentUser}
      getElementBounds={getElementBounds}
      onSelectionClick={onSelectionClick}
      onConflictResolve={onConflictResolve}
      isVisible={isVisible}
    />
  );
};

/**
 * Performance statistics component
 */
const SelectionPerformanceStats: React.FC<{
  totalSelections: number;
  visibleSelections: number;
  conflictCount: number;
  ownershipCount: number;
  performanceMode: string;
  renderTime?: number;
}> = ({
  totalSelections,
  visibleSelections,
  conflictCount,
  ownershipCount,
  performanceMode,
  renderTime,
}) => {
  const [showStats, setShowStats] = React.useState(false);

  // Only show in development or when explicitly enabled
  if (process.env.NODE_ENV !== 'development' && !showStats) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <button
        className="bg-gray-800 text-white text-xs px-2 py-1 rounded mb-2 opacity-50 hover:opacity-100"
        onClick={() => setShowStats(!showStats)}
      >
        Selection Stats
      </button>
      
      {showStats && (
        <div className="bg-gray-800 text-white text-xs p-3 rounded shadow-lg">
          <div>Mode: {performanceMode}</div>
          <div>Total: {totalSelections}</div>
          <div>Visible: {visibleSelections}</div>
          <div>Conflicts: {conflictCount}</div>
          <div>Owned: {ownershipCount}</div>
          {renderTime && <div>Render: {renderTime.toFixed(1)}ms</div>}
        </div>
      )}
    </div>
  );
};

/**
 * Main selection manager component
 */
export const SelectionManager: React.FC<SelectionManagerProps> = ({
  whiteboardId,
  currentUserId,
  selections,
  conflicts,
  ownerships,
  canvasTransform,
  viewportBounds,
  getElementBounds,
  onSelectionClick,
  onConflictResolve,
  performanceMode = 'balanced',
  maxVisibleSelections = 25,
  enableVirtualization = true,
}) => {
  const renderStartTime = useRef<number>(0);
  const [renderTime, setRenderTime] = React.useState<number>(0);

  // Performance optimization: filter and sort selections
  const optimizedSelections = useMemo(() => {
    renderStartTime.current = performance.now();

    // Filter active selections
    const activeSelections = selections.filter(selection => 
      selection.isActive && selection.whiteboardId === whiteboardId
    );

    // Sort by priority and timestamp (higher priority and more recent first)
    const sortedSelections = activeSelections.sort((a, b) => {
      if (a.priority !== b.priority) {
        return b.priority - a.priority; // Higher priority first
      }
      return b.timestamp - a.timestamp; // More recent first
    });

    // Apply performance mode limits
    let limitedSelections = sortedSelections;
    
    if (performanceMode === 'low') {
      limitedSelections = sortedSelections.slice(0, Math.min(10, maxVisibleSelections));
    } else if (performanceMode === 'balanced') {
      limitedSelections = sortedSelections.slice(0, Math.min(15, maxVisibleSelections));
    } else {
      // High performance mode - show all up to limit
      limitedSelections = sortedSelections.slice(0, maxVisibleSelections);
    }

    // Prioritize current user's selection
    const currentUserSelection = limitedSelections.find(s => s.userId === currentUserId);
    const otherSelections = limitedSelections.filter(s => s.userId !== currentUserId);
    
    return currentUserSelection 
      ? [currentUserSelection, ...otherSelections] 
      : otherSelections;
  }, [
    selections, 
    whiteboardId, 
    currentUserId, 
    performanceMode, 
    maxVisibleSelections
  ]);

  // Convert selections to highlight data with validation
  const highlights = useMemo(() => {
    return optimizedSelections.map((selection): SelectionHighlightData => {
      // Validate and sanitize element IDs to prevent injection attacks
      const elementIdsValidation = inputValidator.validateElementIds(
        selection.elementIds, 
        selection.userId // Pass user ID for rate limiting and suspicious behavior tracking
      );
      const sanitizedElementIds = elementIdsValidation.isValid && elementIdsValidation.sanitized 
        ? elementIdsValidation.sanitized 
        : [];

      if (!elementIdsValidation.isValid) {
        console.warn('[SelectionManager] Invalid element IDs detected:', {
          userId: selection.userId,
          errors: elementIdsValidation.errors,
          originalIds: selection.elementIds
        });
        
        // If this is a security violation, log it for monitoring
        const hasSecurityViolation = elementIdsValidation.errors.some(
          error => error.code === 'INVALID_ELEMENT_ID_FORMAT' || error.code === 'CLIENT_BLOCKED'
        );
        if (hasSecurityViolation) {
          console.error('[SelectionManager] Security violation detected:', {
            userId: selection.userId,
            violations: elementIdsValidation.errors,
          });
        }
      }

      // Validate user data to prevent XSS
      const userValidation = inputValidator.validateUser({
        id: selection.userId,
        name: selection.userName,
        color: selection.userColor,
      });

      const sanitizedUser = userValidation.isValid && userValidation.sanitized
        ? userValidation.sanitized
        : { id: 'unknown', name: 'Unknown User', color: '#000000' };

      if (!userValidation.isValid) {
        console.warn('[SelectionManager] Invalid user data detected:', {
          userId: selection.userId,
          errors: userValidation.errors,
          originalData: {
            id: selection.userId,
            name: selection.userName,
            color: selection.userColor,
          }
        });
      }

      // Validate bounds
      const boundsValidation = inputValidator.validateBounds(selection.selectionBounds);
      const sanitizedBounds = boundsValidation.isValid ? boundsValidation.sanitized : undefined;

      // Determine highlight style based on conflicts and performance mode
      const hasConflicts = conflicts.some(conflict =>
        sanitizedElementIds.includes(conflict.elementId)
      );

      const isCurrentUser = sanitizedUser.id === currentUserId;

      // Adjust opacity and animation based on performance mode and conflicts
      let opacity = isCurrentUser ? 0.4 : 0.3;
      let animation: 'none' | 'pulse' | 'glow' = 'none';
      let style: 'solid' | 'dashed' | 'dotted' = 'solid';

      if (hasConflicts) {
        opacity = 0.5;
        animation = performanceMode === 'high' ? 'pulse' : 'none';
        style = 'dashed';
      }

      // Reduce animations in low performance mode
      if (performanceMode === 'low') {
        animation = 'none';
      }

      return {
        userId: sanitizedUser.id,
        userName: sanitizedUser.name,
        userColor: sanitizedUser.color,
        elementIds: sanitizedElementIds,
        bounds: sanitizedBounds,
        timestamp: selection.timestamp,
        opacity,
        style,
        animation,
      };
    }).filter(highlight => highlight.elementIds.length > 0); // Remove highlights with no valid elements
  }, [optimizedSelections, conflicts, currentUserId, performanceMode]);

  // Track render performance
  React.useEffect(() => {
    const endTime = performance.now();
    const duration = endTime - renderStartTime.current;
    setRenderTime(duration);
  }, [highlights]);

  // Group conflicts and ownerships by relevance
  const relevantConflicts = useMemo(() => {
    const elementIds = new Set(highlights.flatMap(h => h.elementIds));
    return conflicts.filter(conflict => elementIds.has(conflict.elementId));
  }, [conflicts, highlights]);

  const relevantOwnerships = useMemo(() => {
    const elementIds = new Set(highlights.flatMap(h => h.elementIds));
    return ownerships.filter(ownership => elementIds.has(ownership.elementId));
  }, [ownerships, highlights]);

  // Handle selection click with debouncing
  const handleSelectionClick = useCallback((highlight: SelectionHighlightData) => {
    if (onSelectionClick) {
      onSelectionClick(highlight);
    }
  }, [onSelectionClick]);

  // Handle conflict resolution
  const handleConflictResolve = useCallback((conflictId: string, resolution: 'ownership' | 'shared' | 'cancel') => {
    if (onConflictResolve) {
      onConflictResolve(conflictId, resolution);
    }
  }, [onConflictResolve]);

  return (
    <>
      {/* Selection highlights overlay */}
      <div className="absolute inset-0 pointer-events-none z-10">
        <AnimatePresence mode="popLayout">
          {highlights.map((highlight) => {
            const isCurrentUser = highlight.userId === currentUserId;
            
            return (
              <OptimizedSelectionHighlight
                key={`${highlight.userId}-${highlight.timestamp}`}
                highlight={highlight}
                conflicts={relevantConflicts}
                ownerships={relevantOwnerships}
                canvasTransform={canvasTransform}
                viewportBounds={viewportBounds}
                isCurrentUser={isCurrentUser}
                getElementBounds={getElementBounds}
                onSelectionClick={handleSelectionClick}
                onConflictResolve={handleConflictResolve}
                enableVirtualization={enableVirtualization}
              />
            );
          })}
        </AnimatePresence>
      </div>

      {/* Performance statistics (development only) */}
      <SelectionPerformanceStats
        totalSelections={selections.length}
        visibleSelections={highlights.length}
        conflictCount={relevantConflicts.length}
        ownershipCount={relevantOwnerships.length}
        performanceMode={performanceMode}
        renderTime={renderTime}
      />
    </>
  );
};

export default SelectionManager;