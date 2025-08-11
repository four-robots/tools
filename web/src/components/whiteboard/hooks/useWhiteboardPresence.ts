/**
 * Whiteboard Presence Hook
 * 
 * Manages user presence, cursor tracking, and viewport synchronization for collaborative whiteboards.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { WhiteboardPresence } from '../utils/collaboration-events';
import {
  calculateCanvasCursorPosition,
  calculateClientCursorPosition,
  isCursorInCanvas,
  createCursorAnimation,
  filterStalePresences,
  getUserColor,
} from '../utils/presence-utils';

interface UseWhiteboardPresenceOptions {
  canvasElement: HTMLElement | null;
  viewport: {
    x: number;
    y: number;
    width: number;
    height: number;
    zoom: number;
  };
  onPresenceUpdate: (presence: {
    cursor?: { x: number; y: number };
    viewport?: { x: number; y: number; width: number; height: number; zoom: number };
    selection?: string[];
  }) => void;
}

interface PresenceState {
  // Current mouse position
  clientCursor: { x: number; y: number } | null;
  canvasCursor: { x: number; y: number } | null;
  
  // Cursor visibility
  showCursor: boolean;
  cursorInCanvas: boolean;
  
  // Selection
  selectedElements: string[];
  
  // Animation state
  animatingCursors: Map<string, () => void>; // Cancel functions for animations
}

export function useWhiteboardPresence(options: UseWhiteboardPresenceOptions) {
  const { canvasElement, viewport, onPresenceUpdate } = options;
  
  const [state, setState] = useState<PresenceState>({
    clientCursor: null,
    canvasCursor: null,
    showCursor: true,
    cursorInCanvas: false,
    selectedElements: [],
    animatingCursors: new Map(),
  });

  // Refs for tracking
  const lastUpdateTime = useRef(0);
  const updateThrottle = 50; // ms
  const presenceCache = useRef<Map<string, WhiteboardPresence>>(new Map());
  
  // ==================== CURSOR TRACKING ====================

  const handleMouseMove = useCallback((event: MouseEvent) => {
    if (!canvasElement) return;

    const now = Date.now();
    if (now - lastUpdateTime.current < updateThrottle) {
      return; // Throttle updates
    }
    lastUpdateTime.current = now;

    const clientX = event.clientX;
    const clientY = event.clientY;
    
    // Calculate canvas coordinates
    const canvasCursor = calculateCanvasCursorPosition(
      clientX,
      clientY,
      canvasElement,
      viewport
    );

    // Check if cursor is within canvas
    const canvasBounds = canvasElement.getBoundingClientRect();
    const cursorInCanvas = (
      clientX >= canvasBounds.left &&
      clientX <= canvasBounds.right &&
      clientY >= canvasBounds.top &&
      clientY <= canvasBounds.bottom
    );

    setState(prev => ({
      ...prev,
      clientCursor: { x: clientX, y: clientY },
      canvasCursor,
      cursorInCanvas,
    }));

    // Send presence update
    if (cursorInCanvas) {
      onPresenceUpdate({
        cursor: canvasCursor,
        viewport,
      });
    }
  }, [canvasElement, viewport, onPresenceUpdate]);

  const handleMouseLeave = useCallback(() => {
    setState(prev => ({
      ...prev,
      cursorInCanvas: false,
      showCursor: false,
    }));
  }, []);

  const handleMouseEnter = useCallback(() => {
    setState(prev => ({
      ...prev,
      showCursor: true,
    }));
  }, []);

  // ==================== SELECTION TRACKING ====================

  const updateSelection = useCallback((elementIds: string[]) => {
    setState(prev => ({
      ...prev,
      selectedElements: elementIds,
    }));

    onPresenceUpdate({
      selection: elementIds,
    });
  }, [onPresenceUpdate]);

  // ==================== VIEWPORT TRACKING ====================

  const updateViewport = useCallback((newViewport: {
    x: number;
    y: number;
    width: number;
    height: number;
    zoom: number;
  }) => {
    onPresenceUpdate({
      viewport: newViewport,
    });
  }, [onPresenceUpdate]);

  // ==================== EVENT LISTENERS ====================

  useEffect(() => {
    if (!canvasElement) return;

    // Mouse events
    canvasElement.addEventListener('mousemove', handleMouseMove);
    canvasElement.addEventListener('mouseleave', handleMouseLeave);
    canvasElement.addEventListener('mouseenter', handleMouseEnter);

    // Prevent context menu on right click
    const handleContextMenu = (e: MouseEvent) => e.preventDefault();
    canvasElement.addEventListener('contextmenu', handleContextMenu);

    return () => {
      canvasElement.removeEventListener('mousemove', handleMouseMove);
      canvasElement.removeEventListener('mouseleave', handleMouseLeave);
      canvasElement.removeEventListener('mouseenter', handleMouseEnter);
      canvasElement.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [canvasElement, handleMouseMove, handleMouseLeave, handleMouseEnter]);

  // ==================== PRESENCE RENDERING ====================

  const renderPresenceCursor = useCallback((
    presence: WhiteboardPresence,
    container: HTMLElement
  ) => {
    if (!canvasElement || !state.cursorInCanvas) return null;

    // Calculate client position for the cursor
    const clientPosition = calculateClientCursorPosition(
      presence.cursor.x,
      presence.cursor.y,
      canvasElement,
      viewport
    );

    // Check if cursor should be visible in current viewport
    if (!isCursorInCanvas(presence.cursor, viewport)) {
      return null;
    }

    // Create or update cursor element
    let cursorElement = container.querySelector(`[data-presence-cursor="${presence.userId}"]`) as HTMLElement;
    
    if (!cursorElement) {
      cursorElement = document.createElement('div');
      cursorElement.setAttribute('data-presence-cursor', presence.userId);
      cursorElement.className = 'absolute pointer-events-none z-50 transition-transform duration-200';
      container.appendChild(cursorElement);
    }

    // Update cursor style and position
    const color = presence.color || getUserColor(presence.userId);
    cursorElement.style.cssText = `
      position: absolute;
      left: ${clientPosition.x}px;
      top: ${clientPosition.y}px;
      width: 20px;
      height: 20px;
      pointer-events: none;
      z-index: 1000;
      transform: translate(-2px, -2px);
    `;

    cursorElement.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path
          d="M3 3L16 8L10 10L8 16L3 3Z"
          fill="${color}"
          stroke="white"
          stroke-width="1"
        />
      </svg>
      <div
        class="absolute top-5 left-3 px-2 py-1 text-xs font-medium text-white rounded shadow-lg whitespace-nowrap"
        style="background-color: ${color};"
      >
        ${presence.userName}
      </div>
    `;

    return cursorElement;
  }, [canvasElement, viewport, state.cursorInCanvas]);

  const animatePresenceCursor = useCallback((
    presence: WhiteboardPresence,
    fromPosition: { x: number; y: number },
    toPosition: { x: number; y: number }
  ) => {
    // Cancel existing animation
    const existingCancel = state.animatingCursors.get(presence.userId);
    if (existingCancel) {
      existingCancel();
    }

    const cancelAnimation = createCursorAnimation(
      fromPosition,
      toPosition,
      200,
      (currentPosition) => {
        // Update cursor position during animation
        const cursorElement = document.querySelector(`[data-presence-cursor="${presence.userId}"]`) as HTMLElement;
        if (cursorElement && canvasElement) {
          const clientPosition = calculateClientCursorPosition(
            currentPosition.x,
            currentPosition.y,
            canvasElement,
            viewport
          );
          cursorElement.style.left = `${clientPosition.x}px`;
          cursorElement.style.top = `${clientPosition.y}px`;
        }
      },
      () => {
        // Clean up animation reference
        setState(prev => {
          const newAnimatingCursors = new Map(prev.animatingCursors);
          newAnimatingCursors.delete(presence.userId);
          return { ...prev, animatingCursors: newAnimatingCursors };
        });
      }
    );

    setState(prev => {
      const newAnimatingCursors = new Map(prev.animatingCursors);
      newAnimatingCursors.set(presence.userId, cancelAnimation);
      return { ...prev, animatingCursors: newAnimatingCursors };
    });
  }, [state.animatingCursors, canvasElement, viewport]);

  const renderSelectionIndicators = useCallback((
    presence: WhiteboardPresence,
    container: HTMLElement
  ) => {
    if (!presence.selection.length || !canvasElement) return;

    const color = presence.color || getUserColor(presence.userId);
    
    presence.selection.forEach(elementId => {
      // Find the element on the canvas
      const element = document.querySelector(`[data-element-id="${elementId}"]`) as HTMLElement;
      if (!element) return;

      // Create selection indicator
      let indicator = container.querySelector(`[data-selection-indicator="${presence.userId}-${elementId}"]`) as HTMLElement;
      
      if (!indicator) {
        indicator = document.createElement('div');
        indicator.setAttribute('data-selection-indicator', `${presence.userId}-${elementId}`);
        indicator.className = 'absolute pointer-events-none border-2 border-dashed rounded';
        container.appendChild(indicator);
      }

      // Position indicator over element
      const elementRect = element.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      
      indicator.style.cssText = `
        position: absolute;
        left: ${elementRect.left - containerRect.left - 2}px;
        top: ${elementRect.top - containerRect.top - 2}px;
        width: ${elementRect.width + 4}px;
        height: ${elementRect.height + 4}px;
        border-color: ${color};
        border-width: 2px;
        border-style: dashed;
        border-radius: 4px;
        pointer-events: none;
        z-index: 999;
      `;
    });
  }, [canvasElement]);

  // ==================== CLEANUP ====================

  const cleanupPresenceElements = useCallback((userId: string, container: HTMLElement) => {
    // Remove cursor
    const cursorElement = container.querySelector(`[data-presence-cursor="${userId}"]`);
    if (cursorElement) {
      cursorElement.remove();
    }

    // Remove selection indicators
    const indicators = container.querySelectorAll(`[data-selection-indicator^="${userId}-"]`);
    indicators.forEach(indicator => indicator.remove());

    // Cancel animations
    const cancelAnimation = state.animatingCursors.get(userId);
    if (cancelAnimation) {
      cancelAnimation();
      setState(prev => {
        const newAnimatingCursors = new Map(prev.animatingCursors);
        newAnimatingCursors.delete(userId);
        return { ...prev, animatingCursors: newAnimatingCursors };
      });
    }
  }, [state.animatingCursors]);

  // ==================== PUBLIC API ====================

  return {
    // Current state
    clientCursor: state.clientCursor,
    canvasCursor: state.canvasCursor,
    cursorInCanvas: state.cursorInCanvas,
    selectedElements: state.selectedElements,
    
    // Actions
    updateSelection,
    updateViewport,
    
    // Rendering functions
    renderPresenceCursor,
    animatePresenceCursor,
    renderSelectionIndicators,
    cleanupPresenceElements,
    
    // Utilities
    isAnimating: (userId: string) => state.animatingCursors.has(userId),
  };
}