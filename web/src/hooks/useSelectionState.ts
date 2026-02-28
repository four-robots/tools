/**
 * useSelectionState Hook
 * 
 * Manages selection state synchronization and provides real-time selection
 * tracking for collaborative whiteboard editing with conflict resolution.
 */

'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { io, Socket } from 'socket.io-client';
import { SelectionState } from '@/components/whiteboard/SelectionManager';
import {
  SelectionHighlightData,
  SelectionConflictData,
  SelectionOwnership,
} from '@/components/whiteboard/SelectionHighlight';
import { selectionQueue } from './utils/atomic-operations';

export interface SelectionStateConfig {
  /** WebSocket server URL */
  serverUrl: string;
  
  /** Authentication token */
  token: string;
  
  /** Whiteboard ID */
  whiteboardId: string;
  
  /** Session ID */
  sessionId: string;
  
  /** Current user information */
  user: {
    id: string;
    name: string;
    color: string;
  };
  
  /** Performance optimization settings */
  throttleMs?: number; // Throttle selection updates (default: 100ms)
  maxRetries?: number; // Max retry attempts (default: 3)
  reconnectDelay?: number; // Reconnection delay (default: 1000ms)
  
  /** Debug mode */
  debug?: boolean;
}

export interface SelectionUpdatePayload {
  elementIds: string[];
  bounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  isMultiSelect?: boolean;
}

export interface SelectionHookState {
  // Connection state
  connected: boolean;
  connecting: boolean;
  error: string | null;
  
  // Selection data
  selections: SelectionState[];
  conflicts: SelectionConflictData[];
  ownerships: SelectionOwnership[];
  highlights: SelectionHighlightData[];
  
  // Current user selection
  currentSelection: string[];
  
  // Performance metrics
  latency: number;
  updateCount: number;
  conflictCount: number;
  
  // Actions
  updateSelection: (payload: SelectionUpdatePayload) => Promise<boolean>;
  clearSelection: () => Promise<boolean>;
  resolveConflict: (conflictId: string, resolution: 'ownership' | 'shared' | 'cancel') => Promise<boolean>;
  requestSelectionState: () => Promise<boolean>;
  getElementOwnership: (elementId: string) => Promise<SelectionOwnership | null>;
  
  // Connection management
  connect: () => void;
  disconnect: () => void;
  reconnect: () => void;
}

/**
 * Throttle helper for selection updates
 */
const useThrottle = <T extends any[]>(
  callback: (...args: T) => void,
  delay: number
): [(...args: T) => void, () => void] => {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const argsRef = useRef<T | null>(null);

  const throttledFunction = useCallback((...args: T) => {
    argsRef.current = args;

    if (timeoutRef.current) {
      return; // Already scheduled
    }

    timeoutRef.current = setTimeout(() => {
      if (argsRef.current) {
        callback(...argsRef.current);
        argsRef.current = null;
      }
      timeoutRef.current = null;
    }, delay);
  }, [callback, delay]);

  const flush = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (argsRef.current) {
      callback(...argsRef.current);
      argsRef.current = null;
    }
  }, [callback]);

  return [throttledFunction, flush];
};

/**
 * Retry mechanism for failed operations
 */
const useRetry = (maxRetries: number = 3) => {
  const retryCount = useRef(0);

  const executeWithRetry = useCallback(async <T>(
    operation: () => Promise<T>,
    onRetry?: (attempt: number, error: Error) => void
  ): Promise<T> => {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await operation();
        retryCount.current = 0; // Reset on success
        return result;
      } catch (error) {
        if (attempt === maxRetries) {
          throw error; // Final attempt failed
        }
        
        retryCount.current = attempt + 1;
        if (onRetry) {
          onRetry(attempt + 1, error as Error);
        }
        
        // Exponential backoff
        const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw new Error('Max retries exceeded'); // Should not reach here
  }, [maxRetries]);

  return { executeWithRetry, currentRetryCount: retryCount.current };
};

/**
 * Main selection state hook
 */
export const useSelectionState = (config: SelectionStateConfig): SelectionHookState => {
  // Socket connection
  const socketRef = useRef<Socket | null>(null);
  const eventTimeoutsRef = useRef<NodeJS.Timeout[]>([]);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Selection state
  const [selections, setSelections] = useState<SelectionState[]>([]);
  const [conflicts, setConflicts] = useState<SelectionConflictData[]>([]);
  const [ownerships, setOwnerships] = useState<SelectionOwnership[]>([]);
  const [currentSelection, setCurrentSelection] = useState<string[]>([]);
  
  // Performance metrics
  const [latency, setLatency] = useState(0);
  const [updateCount, setUpdateCount] = useState(0);
  const [conflictCount, setConflictCount] = useState(0);
  
  // Retry mechanism
  const { executeWithRetry } = useRetry(config.maxRetries || 3);
  
  // Debug logging
  const debug = useCallback((...args: any[]) => {
    if (config.debug) {
      console.log('[SelectionState]', ...args);
    }
  }, [config.debug]);

  // Connect to WebSocket server
  const connect = useCallback(() => {
    if (socketRef.current?.connected || connecting) {
      return;
    }

    setConnecting(true);
    setError(null);
    debug('Connecting to selection service...', { whiteboardId: config.whiteboardId });

    const socket = io(config.serverUrl, {
      auth: {
        token: config.token,
      },
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: config.reconnectDelay || 1000,
      reconnectionAttempts: 5,
    });

    // Connection events
    socket.on('connect', () => {
      debug('Connected to selection service');
      setConnected(true);
      setConnecting(false);
      setError(null);

      // Join whiteboard
      socket.emit('whiteboard:join', {
        whiteboardId: config.whiteboardId,
        workspaceId: 'default', // TODO: Get from config
        clientInfo: {
          userAgent: navigator.userAgent,
          viewport: {
            width: window.innerWidth,
            height: window.innerHeight,
          },
        },
      });
    });

    socket.on('disconnect', (reason) => {
      debug('Disconnected from selection service:', reason);
      setConnected(false);
      setError(`Disconnected: ${reason}`);
    });

    socket.on('connect_error', (err) => {
      debug('Connection error:', err);
      setConnecting(false);
      setError(`Connection error: ${err.message}`);
    });

    // Selection events
    socket.on('whiteboard:selection_updated', (data) => {
      debug('Selection updated:', data);
      
      const newSelection: SelectionState = {
        userId: data.userId,
        userName: data.userName,
        userColor: data.userColor,
        whiteboardId: config.whiteboardId,
        sessionId: config.sessionId,
        elementIds: data.elementIds || [],
        selectionBounds: data.bounds,
        timestamp: Date.now(),
        isMultiSelect: data.isMultiSelect || false,
        priority: data.selectionState?.priority || 0,
        isActive: true,
        lastSeen: Date.now(),
      };

      setSelections(prev => {
        const filtered = prev.filter(s => s.userId !== data.userId);
        return [...filtered, newSelection];
      });
      
      setUpdateCount(prev => prev + 1);
    });

    socket.on('whiteboard:selection_cleared', (data) => {
      debug('Selection cleared:', data);
      setSelections(prev => prev.filter(s => s.userId !== data.userId));
    });

    socket.on('whiteboard:selection_conflicts', (data) => {
      debug('Selection conflicts:', data);
      setConflicts(data.conflicts || []);
      setConflictCount(prev => prev + (data.conflicts?.length || 0));
    });

    socket.on('whiteboard:selection_conflict_resolved', (data) => {
      debug('Conflict resolved:', data);
      setConflicts(prev => prev.filter(c => c.conflictId !== data.conflictId));
      
      if (data.ownership) {
        setOwnerships(prev => {
          const filtered = prev.filter(o => o.elementId !== data.ownership.elementId);
          return [...filtered, data.ownership];
        });
      }
    });

    socket.on('whiteboard:element_ownership_changed', (data) => {
      debug('Ownership changed:', data);
      if (data.ownerships) {
        setOwnerships(prev => {
          const elementIds = data.ownerships.map((o: any) => o.elementId);
          const filtered = prev.filter(o => !elementIds.includes(o.elementId));
          return [...filtered, ...data.ownerships];
        });
      }
    });

    socket.on('whiteboard:selections_state', (data) => {
      debug('Selections state received:', data);
      if (data.selections) setSelections(data.selections);
      if (data.conflicts) setConflicts(data.conflicts);
      if (data.highlights) {
        // Convert highlights to selections if needed
        const highlightSelections = data.highlights.map((h: any) => ({
          userId: h.userId,
          userName: h.userName,
          userColor: h.userColor,
          whiteboardId: config.whiteboardId,
          sessionId: config.sessionId,
          elementIds: h.elementIds,
          selectionBounds: h.bounds,
          timestamp: h.timestamp,
          isMultiSelect: h.elementIds.length > 1,
          priority: 0,
          isActive: true,
          lastSeen: Date.now(),
        }));
        setSelections(highlightSelections);
      }
    });

    // Enhanced rate limiting events with backpressure
    socket.on('whiteboard:selection_rate_limited', (data) => {
      debug('Selection rate limited:', data);
      const retryAfterMs = data.retryAfterMs || 1000;
      setError(`Rate limited: ${data.message} (retry after ${Math.ceil(retryAfterMs / 1000)}s)`);
      
      // Implement exponential backoff for severe rate limiting
      const backoffMultiplier = data.severity === 'high' ? 2 : 1;
      const timeout = setTimeout(() => {
        setError(null);
        if (data.shouldRefresh) {
          requestSelectionState();
        }
      }, retryAfterMs * backoffMultiplier);
      eventTimeoutsRef.current.push(timeout);
    });

    // Backpressure handling
    socket.on('whiteboard:backpressure', (data) => {
      debug('Server backpressure detected:', data);
      setError(`Server busy: ${data.message}`);
      
      // Reduce update frequency temporarily
      const currentThrottle = config.throttleMs || 100;
      const increasedThrottle = Math.min(currentThrottle * 2, 1000);
      
      const bpTimeout = setTimeout(() => {
        setError(null);
      }, data.retryAfterMs || 2000);
      eventTimeoutsRef.current.push(bpTimeout);
    });

    // Error events
    socket.on('error', (data) => {
      debug('Selection error:', data);
      setError(data.message || 'Unknown error');
    });

    socketRef.current = socket;
  }, [config, connecting, debug]);

  // Disconnect from WebSocket
  const disconnect = useCallback(() => {
    if (socketRef.current) {
      debug('Disconnecting from selection service');
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    // Clear any pending event timeouts
    for (const timeout of eventTimeoutsRef.current) {
      clearTimeout(timeout);
    }
    eventTimeoutsRef.current = [];
    setConnected(false);
    setConnecting(false);
    setSelections([]);
    setConflicts([]);
    setOwnerships([]);
    setCurrentSelection([]);
  }, [debug]);

  // Reconnect
  const reconnect = useCallback(() => {
    disconnect();
    setTimeout(connect, 100);
  }, [disconnect, connect]);

  // Enhanced atomic selection update with better error handling
  const updateSelectionInternal = useCallback(async (payload: SelectionUpdatePayload): Promise<boolean> => {
    if (!socketRef.current?.connected) {
      setError('Not connected to selection service');
      return false;
    }

    // Check selection queue health before adding operation
    const queueStatus = selectionQueue.getStatus();
    if (queueStatus.queueHealth === 'critical') {
      debug('Selection queue critical, throttling operation');
      // Allow critical operations to proceed but warn
      console.warn('[SelectionState] Selection queue under stress:', queueStatus);
    }

    // Use atomic queue to prevent concurrent selection updates
    const result = await selectionQueue.enqueue({
      operation: async () => {
        const startTime = Date.now();
        
        const result = await new Promise<boolean>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Selection update timeout'));
          }, 5000);

          // Include client info for server-side rate limiting
          socketRef.current!.emit('whiteboard:selection_changed', {
            whiteboardId: config.whiteboardId,
            elementIds: payload.elementIds,
            bounds: payload.bounds,
            isMultiSelect: payload.isMultiSelect,
            sessionId: config.sessionId,
            clientInfo: {
              timestamp: startTime,
              queueHealth: queueStatus.queueHealth,
              userAgent: navigator.userAgent.substring(0, 100), // Truncated for security
            },
          });

          socketRef.current!.once('whiteboard:selection_ack', (data) => {
            clearTimeout(timeout);
            
            const endTime = Date.now();
            setLatency(endTime - startTime);
            
            if (data.success) {
              setCurrentSelection(payload.elementIds);
              setError(null);
              
              // Handle server suggestions for optimization
              if (data.suggestions) {
                debug('Server optimization suggestions:', data.suggestions);
                // Could implement automatic throttling adjustments here
              }
              
              resolve(true);
            } else {
              // Enhanced error handling
              const errorMessage = data.error || 'Selection update failed';
              setError(errorMessage);
              
              // Handle specific error types
              if (data.errorCode === 'RATE_LIMITED') {
                debug('Rate limited, will retry with backoff');
              } else if (data.errorCode === 'VALIDATION_FAILED') {
                debug('Validation failed:', data.validationErrors);
              }
              
              resolve(false);
            }
          });
        });

        return result;
      },
      priority: 1,
      timeout: 5000,
      retries: 2,
      onError: (error) => {
        debug('Selection update error:', error);
        setError(error.message);
        
        // Additional error context for debugging
        if (config.debug) {
          console.error('[SelectionState] Operation failed:', {
            error,
            payload,
            queueStatus: selectionQueue.getStatus(),
          });
        }
      },
    });

    return result.success;
  }, [config.whiteboardId, config.sessionId, config.debug, debug]);

  // Throttle selection updates
  const [throttledUpdateSelection] = useThrottle(
    updateSelectionInternal,
    config.throttleMs || 100
  );

  // Update selection with retry
  const updateSelection = useCallback(async (payload: SelectionUpdatePayload): Promise<boolean> => {
    try {
      return await executeWithRetry(() => throttledUpdateSelection(payload));
    } catch (error) {
      // Final fallback error handling
      const errorMessage = error instanceof Error ? error.message : 'Selection update failed';
      setError(`Update failed: ${errorMessage}`);
      debug('Selection update final error:', error);
      return false;
    }
  }, [executeWithRetry, throttledUpdateSelection]);

  // Clear selection with atomic operation
  const clearSelection = useCallback(async (): Promise<boolean> => {
    if (!socketRef.current?.connected) {
      setError('Not connected to selection service');
      return false;
    }

    // Use atomic queue to prevent race conditions with clear operations
    const result = await selectionQueue.enqueue({
      operation: async () => {
        const result = await new Promise<boolean>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Clear selection timeout'));
          }, 5000);

          socketRef.current!.emit('whiteboard:selection_cleared', {
            whiteboardId: config.whiteboardId,
            sessionId: config.sessionId,
          });

          socketRef.current!.once('whiteboard:selection_clear_ack', (data) => {
            clearTimeout(timeout);
            
            if (data.success) {
              setCurrentSelection([]);
              setError(null);
              resolve(true);
            } else {
              setError(data.error || 'Clear selection failed');
              resolve(false);
            }
          });
        });

        return result;
      },
      priority: 2, // Higher priority than regular updates
      timeout: 5000,
      retries: 1,
      onError: (error) => {
        debug('Clear selection error:', error);
        setError(error.message);
      },
    });

    return result.success;
  }, [config.whiteboardId, config.sessionId, debug]);

  // Resolve conflict
  const resolveConflict = useCallback(async (
    conflictId: string,
    resolution: 'ownership' | 'shared' | 'cancel'
  ): Promise<boolean> => {
    if (!socketRef.current?.connected) {
      setError('Not connected to selection service');
      return false;
    }

    try {
      const result = await new Promise<boolean>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Conflict resolution timeout'));
        }, 5000);

        socketRef.current!.emit('whiteboard:resolve_selection_conflict', {
          whiteboardId: config.whiteboardId,
          conflictId,
          resolution,
        });

        socketRef.current!.once('whiteboard:conflict_resolve_ack', (data) => {
          clearTimeout(timeout);
          
          if (data.success) {
            setError(null);
            resolve(true);
          } else {
            setError(data.error || 'Conflict resolution failed');
            resolve(false);
          }
        });
      });

      return result;
    } catch (error) {
      debug('Conflict resolution error:', error);
      setError(error instanceof Error ? error.message : 'Conflict resolution failed');
      return false;
    }
  }, [config.whiteboardId, debug]);

  // Request current selection state
  const requestSelectionState = useCallback(async (): Promise<boolean> => {
    if (!socketRef.current?.connected) {
      setError('Not connected to selection service');
      return false;
    }

    try {
      socketRef.current.emit('whiteboard:request_selections', {
        whiteboardId: config.whiteboardId,
      });
      return true;
    } catch (error) {
      debug('Request selection state error:', error);
      setError(error instanceof Error ? error.message : 'Request selection state failed');
      return false;
    }
  }, [config.whiteboardId, debug]);

  // Get element ownership
  const getElementOwnership = useCallback(async (elementId: string): Promise<SelectionOwnership | null> => {
    if (!socketRef.current?.connected) {
      setError('Not connected to selection service');
      return null;
    }

    try {
      const result = await new Promise<SelectionOwnership | null>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Ownership request timeout'));
        }, 5000);

        socketRef.current!.emit('whiteboard:request_element_ownership', {
          whiteboardId: config.whiteboardId,
          elementId,
        });

        socketRef.current!.once('whiteboard:element_ownership_info', (data) => {
          clearTimeout(timeout);
          resolve(data.ownership || null);
        });
      });

      return result;
    } catch (error) {
      debug('Element ownership error:', error);
      setError(error instanceof Error ? error.message : 'Element ownership request failed');
      return null;
    }
  }, [config.whiteboardId, debug]);

  // Generate highlights from selections
  const highlights = useMemo((): SelectionHighlightData[] => {
    return selections.map((selection): SelectionHighlightData => {
      const hasConflicts = conflicts.some(conflict =>
        selection.elementIds.includes(conflict.elementId)
      );

      return {
        userId: selection.userId,
        userName: selection.userName,
        userColor: selection.userColor,
        elementIds: selection.elementIds,
        bounds: selection.selectionBounds,
        timestamp: selection.timestamp,
        opacity: hasConflicts ? 0.5 : 0.3,
        style: hasConflicts ? 'dashed' : 'solid',
        animation: hasConflicts ? 'pulse' : 'none',
      };
    });
  }, [selections, conflicts]);

  // Auto-connect on mount
  useEffect(() => {
    connect();
    return disconnect;
  }, [connect, disconnect]);

  // Auto-request selection state when connected
  useEffect(() => {
    if (connected) {
      requestSelectionState();
    }
  }, [connected, requestSelectionState]);

  // Cleanup expired selections
  useEffect(() => {
    const cleanup = setInterval(() => {
      const now = Date.now();
      const timeout = 30000; // 30 seconds

      setSelections(prev => 
        prev.filter(s => now - s.lastSeen <= timeout)
      );

      setOwnerships(prev => 
        prev.filter(o => now <= o.expiresAt)
      );
    }, 5000);

    return () => clearInterval(cleanup);
  }, []);

  return {
    // Connection state
    connected,
    connecting,
    error,

    // Selection data
    selections,
    conflicts,
    ownerships,
    highlights,
    currentSelection,

    // Performance metrics
    latency,
    updateCount,
    conflictCount,

    // Actions
    updateSelection,
    clearSelection,
    resolveConflict,
    requestSelectionState,
    getElementOwnership,

    // Connection management
    connect,
    disconnect,
    reconnect,
  };
};