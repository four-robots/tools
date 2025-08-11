/**
 * Whiteboard Cursors Hook
 * 
 * Manages real-time cursor tracking state, WebSocket events, and cursor interpolation
 * for collaborative whiteboard sessions with <100ms latency.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { LiveCursorState, CursorInterpolationConfig } from '@shared/types/whiteboard';
import {
  CursorMoveEvent,
  CursorEnterEvent,
  CursorLeaveEvent,
  CursorUpdateEvent,
  CursorDisconnectedEvent,
} from '../utils/collaboration-events';

interface UseWhiteboardCursorsOptions {
  whiteboardId: string;
  sessionId: string;
  socket: any; // Socket.IO client instance
  containerRef: React.RefObject<HTMLElement>;
  viewport: {
    x: number;
    y: number;
    zoom: number;
    width: number;
    height: number;
  };
  userInfo: {
    userId: string;
    userName: string;
    userColor: string;
  };
  enabled?: boolean;
  maxCursors?: number;
  throttleMs?: number;
}

interface CursorTrackingState {
  cursors: Map<string, LiveCursorState>;
  isTracking: boolean;
  lastOwnUpdate: number;
  interpolationConfig: CursorInterpolationConfig;
  connectionStatus: 'connected' | 'disconnected' | 'reconnecting';
}

export function useWhiteboardCursors(options: UseWhiteboardCursorsOptions) {
  const {
    whiteboardId,
    sessionId,
    socket,
    containerRef,
    viewport,
    userInfo,
    enabled = true,
    maxCursors = 25,
    throttleMs = 16, // 60 FPS
  } = options;

  const [state, setState] = useState<CursorTrackingState>({
    cursors: new Map(),
    isTracking: false,
    lastOwnUpdate: 0,
    interpolationConfig: {
      enabled: true,
      duration: 200,
      easing: 'ease-out',
      threshold: 5,
    },
    connectionStatus: 'disconnected',
  });

  // Refs for performance
  const mouseMoveThrottleRef = useRef<number>();
  const ownCursorPositionRef = useRef({ x: 0, y: 0, canvasX: 0, canvasY: 0 });
  const lastEmitTimeRef = useRef(0);

  // ==================== CURSOR POSITION CALCULATIONS ====================

  const screenToCanvas = useCallback((screenX: number, screenY: number) => {
    if (!containerRef.current) return { x: screenX, y: screenY };

    const containerRect = containerRef.current.getBoundingClientRect();
    const canvasX = (screenX - containerRect.left) / viewport.zoom + viewport.x;
    const canvasY = (screenY - containerRect.top) / viewport.zoom + viewport.y;

    return { x: canvasX, y: canvasY };
  }, [viewport, containerRef]);

  const canvasToScreen = useCallback((canvasX: number, canvasY: number) => {
    if (!containerRef.current) return { x: canvasX, y: canvasY };

    const containerRect = containerRef.current.getBoundingClientRect();
    const screenX = (canvasX - viewport.x) * viewport.zoom + containerRect.left;
    const screenY = (canvasY - viewport.y) * viewport.zoom + containerRect.top;

    return { x: screenX, y: screenY };
  }, [viewport, containerRef]);

  // ==================== WEBSOCKET EVENT HANDLERS ====================

  const handleCursorUpdated = useCallback((data: CursorUpdateEvent) => {
    // Don't update our own cursor
    if (data.userId === userInfo.userId) return;

    setState(prev => {
      const newCursors = new Map(prev.cursors);
      const existingCursor = newCursors.get(data.userId);

      const cursorState: LiveCursorState = {
        userId: data.userId,
        userName: data.userName,
        userColor: data.userColor,
        currentPosition: {
          x: data.position.x,
          y: data.position.y,
          canvasX: data.position.canvasX,
          canvasY: data.position.canvasY,
          timestamp: data.timestamp,
          interpolated: false,
        },
        lastPosition: existingCursor?.currentPosition,
        isActive: true,
        lastSeen: data.timestamp,
        sessionId: data.sessionId,
      };

      newCursors.set(data.userId, cursorState);

      // Limit cursor count for performance
      if (newCursors.size > maxCursors) {
        const sortedCursors = Array.from(newCursors.entries())
          .sort(([,a], [,b]) => b.lastSeen - a.lastSeen);
        
        // Remove oldest cursors
        const cursorsToRemove = sortedCursors.slice(maxCursors);
        cursorsToRemove.forEach(([userId]) => newCursors.delete(userId));
      }

      return { ...prev, cursors: newCursors };
    });
  }, [userInfo.userId, maxCursors]);

  const handleCursorDisconnected = useCallback((data: CursorDisconnectedEvent) => {
    setState(prev => {
      const newCursors = new Map(prev.cursors);
      const cursor = newCursors.get(data.userId);
      
      if (cursor) {
        // Mark as inactive for fade-out animation
        newCursors.set(data.userId, {
          ...cursor,
          isActive: false,
          lastSeen: data.timestamp,
        });

        // Remove after delay to allow fade animation
        setTimeout(() => {
          setState(current => {
            const updatedCursors = new Map(current.cursors);
            updatedCursors.delete(data.userId);
            return { ...current, cursors: updatedCursors };
          });
        }, 1000);
      }

      return { ...prev, cursors: newCursors };
    });
  }, []);

  // ==================== CURSOR TRACKING CONTROL ====================

  const startTracking = useCallback(() => {
    if (!enabled || !socket || state.isTracking) return;

    const enterEvent: CursorEnterEvent = {
      whiteboardId,
      sessionId,
      userInfo,
      timestamp: Date.now(),
    };

    socket.emit('whiteboard:cursor_enter', enterEvent);

    setState(prev => ({ 
      ...prev, 
      isTracking: true, 
      connectionStatus: 'connected' 
    }));
  }, [enabled, socket, state.isTracking, whiteboardId, sessionId, userInfo]);

  const stopTracking = useCallback(() => {
    if (!socket || !state.isTracking) return;

    const leaveEvent: CursorLeaveEvent = {
      whiteboardId,
      sessionId,
      userId: userInfo.userId,
      timestamp: Date.now(),
    };

    socket.emit('whiteboard:cursor_leave', leaveEvent);

    setState(prev => ({ 
      ...prev, 
      isTracking: false, 
      connectionStatus: 'disconnected' 
    }));
  }, [socket, state.isTracking, whiteboardId, sessionId, userInfo.userId]);

  // ==================== MOUSE TRACKING ====================

  const handleMouseMove = useCallback((event: MouseEvent) => {
    if (!state.isTracking || !socket || !containerRef.current) return;

    const now = Date.now();
    
    // Throttle updates to maintain 60 FPS
    if (now - lastEmitTimeRef.current < throttleMs) return;
    lastEmitTimeRef.current = now;

    const screenX = event.clientX;
    const screenY = event.clientY;
    const { x: canvasX, y: canvasY } = screenToCanvas(screenX, screenY);

    // Check if cursor is within container bounds
    const containerRect = containerRef.current.getBoundingClientRect();
    const isWithinContainer = (
      screenX >= containerRect.left &&
      screenX <= containerRect.right &&
      screenY >= containerRect.top &&
      screenY <= containerRect.bottom
    );

    if (!isWithinContainer) return;

    const newPosition = {
      x: screenX,
      y: screenY,
      canvasX,
      canvasY,
    };

    // Update local position
    ownCursorPositionRef.current = newPosition;

    // Emit cursor move event
    const moveEvent: CursorMoveEvent = {
      whiteboardId,
      position: newPosition,
      timestamp: now,
      sessionId,
    };

    socket.emit('whiteboard:cursor_move', moveEvent);

    setState(prev => ({ ...prev, lastOwnUpdate: now }));
  }, [state.isTracking, socket, containerRef, throttleMs, screenToCanvas, whiteboardId, sessionId]);

  const handleMouseLeave = useCallback(() => {
    // Don't stop tracking on mouse leave, just stop sending updates
    // Cursor will fade out naturally due to inactivity
  }, []);

  const handleMouseEnter = useCallback(() => {
    // Resume tracking if needed
    if (enabled && !state.isTracking) {
      startTracking();
    }
  }, [enabled, state.isTracking, startTracking]);

  // ==================== EVENT LISTENERS ====================

  useEffect(() => {
    if (!socket) return;

    // Socket event listeners
    socket.on('whiteboard:cursor_updated', handleCursorUpdated);
    socket.on('whiteboard:cursor_disconnected', handleCursorDisconnected);

    // Connection event listeners
    socket.on('connect', () => {
      setState(prev => ({ ...prev, connectionStatus: 'connected' }));
      if (state.isTracking) {
        startTracking();
      }
    });

    socket.on('disconnect', () => {
      setState(prev => ({ ...prev, connectionStatus: 'disconnected' }));
    });

    socket.on('reconnect', () => {
      setState(prev => ({ ...prev, connectionStatus: 'connected' }));
      if (state.isTracking) {
        startTracking();
      }
    });

    return () => {
      socket.off('whiteboard:cursor_updated', handleCursorUpdated);
      socket.off('whiteboard:cursor_disconnected', handleCursorDisconnected);
      socket.off('connect');
      socket.off('disconnect');
      socket.off('reconnect');
    };
  }, [socket, handleCursorUpdated, handleCursorDisconnected, state.isTracking, startTracking]);

  // Mouse event listeners
  useEffect(() => {
    if (!containerRef.current || !enabled) return;

    const container = containerRef.current;

    container.addEventListener('mousemove', handleMouseMove);
    container.addEventListener('mouseleave', handleMouseLeave);
    container.addEventListener('mouseenter', handleMouseEnter);

    return () => {
      container.removeEventListener('mousemove', handleMouseMove);
      container.removeEventListener('mouseleave', handleMouseLeave);
      container.removeEventListener('mouseenter', handleMouseEnter);
    };
  }, [containerRef, enabled, handleMouseMove, handleMouseLeave, handleMouseEnter]);

  // ==================== CONFIGURATION ====================

  const updateInterpolationConfig = useCallback((config: Partial<CursorInterpolationConfig>) => {
    setState(prev => ({
      ...prev,
      interpolationConfig: { ...prev.interpolationConfig, ...config },
    }));
  }, []);

  // ==================== LIFECYCLE ====================

  // Auto-start tracking when enabled
  useEffect(() => {
    if (enabled && socket && !state.isTracking) {
      startTracking();
    }
  }, [enabled, socket, state.isTracking, startTracking]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopTracking();
    };
  }, [stopTracking]);

  // ==================== PUBLIC API ====================

  const cursorsArray = Array.from(state.cursors.values());

  return {
    // State
    cursors: cursorsArray,
    activeCursors: cursorsArray.filter(cursor => cursor.isActive),
    isTracking: state.isTracking,
    connectionStatus: state.connectionStatus,
    ownPosition: ownCursorPositionRef.current,
    lastUpdate: state.lastOwnUpdate,

    // Actions
    startTracking,
    stopTracking,
    updateInterpolationConfig,

    // Configuration
    interpolationConfig: state.interpolationConfig,
    maxCursors,
    throttleMs,

    // Statistics
    stats: {
      totalCursors: state.cursors.size,
      activeCursors: cursorsArray.filter(cursor => cursor.isActive).length,
      lastOwnUpdate: state.lastOwnUpdate,
    },
  };
}