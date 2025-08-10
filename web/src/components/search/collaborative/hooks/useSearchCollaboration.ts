/**
 * useSearchCollaboration Hook
 * 
 * Custom hook for managing WebSocket connections and real-time messaging
 * for collaborative search sessions.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from '../../../ui/toast';

export interface SearchCollaborationMessage {
  type: 'search_join' | 'search_leave' | 'search_query_update' | 'search_filter_update' | 
        'search_result_highlight' | 'search_annotation' | 'search_cursor_update' | 
        'search_selection_change' | 'search_bookmark' | 'search_state_sync' | 
        'search_conflict_resolution' | 'search_session_update';
  searchSessionId: string;
  userId?: string;
  data: Record<string, any>;
  timestamp?: Date;
  sequenceNumber?: number;
  messageId?: string;
  searchContext?: {
    query?: string;
    filters?: Record<string, any>;
    resultIds?: string[];
    cursorPosition?: Record<string, any>;
  };
  debounceGroupId?: string;
  batchId?: string;
  isDebounced?: boolean;
  targetUserId?: string;
  requiresAck?: boolean;
  parentMessageId?: string;
}

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';

export interface UseSearchCollaborationOptions {
  sessionId?: string;
  enabled?: boolean;
  autoReconnect?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  heartbeatInterval?: number;
  messageTimeout?: number;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Error) => void;
  onReconnect?: (attempt: number) => void;
}

export interface UseSearchCollaborationReturn {
  connectionState: ConnectionState;
  isConnected: boolean;
  lastError: Error | null;
  reconnectAttempts: number;
  
  // Message handling
  sendMessage: (message: SearchCollaborationMessage) => Promise<void>;
  onMessage: (handler: (message: SearchCollaborationMessage) => void) => () => void;
  
  // Connection management
  connect: () => Promise<void>;
  disconnect: () => void;
  reconnect: () => Promise<void>;
  
  // Statistics
  messagesSent: number;
  messagesReceived: number;
  connectionDuration: number; // in seconds
}

export function useSearchCollaboration({
  sessionId,
  enabled = true,
  autoReconnect = true,
  reconnectInterval = 3000,
  maxReconnectAttempts = 5,
  heartbeatInterval = 30000,
  messageTimeout = 10000,
  onConnect,
  onDisconnect,
  onError,
  onReconnect
}: UseSearchCollaborationOptions): UseSearchCollaborationReturn {

  // ========================================================================
  // State Management
  // ========================================================================

  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [lastError, setLastError] = useState<Error | null>(null);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [messagesSent, setMessagesSent] = useState(0);
  const [messagesReceived, setMessagesReceived] = useState(0);
  const [connectionDuration, setConnectionDuration] = useState(0);

  // ========================================================================
  // Refs for Persistent Values
  // ========================================================================

  const wsRef = useRef<WebSocket | null>(null);
  const messageHandlersRef = useRef<Set<(message: SearchCollaborationMessage) => void>>(new Set());
  const heartbeatTimerRef = useRef<NodeJS.Timeout>();
  const reconnectTimerRef = useRef<NodeJS.Timeout>();
  const connectionStartTimeRef = useRef<number>(0);
  const durationTimerRef = useRef<NodeJS.Timeout>();
  const pendingMessagesRef = useRef<Map<string, { resolve: () => void; reject: (error: Error) => void; timeout: NodeJS.Timeout }>>(new Map());
  const sequenceNumberRef = useRef<number>(0);

  // ========================================================================
  // Derived State
  // ========================================================================

  const isConnected = connectionState === 'connected';

  // ========================================================================
  // WebSocket Management
  // ========================================================================

  const getWebSocketUrl = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const token = localStorage.getItem('auth_token') || 'test-token'; // This would come from auth context
    
    return `${protocol}//${host}/collaboration?token=${encodeURIComponent(token)}`;
  }, []);

  const cleanup = useCallback(() => {
    // Clear timers
    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = undefined;
    }
    
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = undefined;
    }
    
    if (durationTimerRef.current) {
      clearInterval(durationTimerRef.current);
      durationTimerRef.current = undefined;
    }

    // Clear pending message promises
    pendingMessagesRef.current.forEach(({ timeout, reject }) => {
      clearTimeout(timeout);
      reject(new Error('Connection closed'));
    });
    pendingMessagesRef.current.clear();

    // Close WebSocket
    if (wsRef.current) {
      wsRef.current.onopen = null;
      wsRef.current.onclose = null;
      wsRef.current.onmessage = null;
      wsRef.current.onerror = null;
      
      if (wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.close(1000, 'Component unmounting');
      }
      
      wsRef.current = null;
    }
  }, []);

  const startHeartbeat = useCallback(() => {
    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current);
    }

    heartbeatTimerRef.current = setInterval(() => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        try {
          const heartbeatMessage = {
            type: 'heartbeat' as const,
            sessionId: sessionId || '',
            userId: 'current-user-id', // This would come from auth context
            data: { timestamp: new Date().toISOString() },
            timestamp: new Date(),
            sequenceNumber: 0,
            messageId: crypto.randomUUID()
          };
          
          wsRef.current.send(JSON.stringify(heartbeatMessage));
        } catch (error) {
          console.error('Failed to send heartbeat:', error);
        }
      }
    }, heartbeatInterval);
  }, [sessionId, heartbeatInterval]);

  const startDurationTimer = useCallback(() => {
    connectionStartTimeRef.current = Date.now();
    
    if (durationTimerRef.current) {
      clearInterval(durationTimerRef.current);
    }
    
    durationTimerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - connectionStartTimeRef.current) / 1000);
      setConnectionDuration(elapsed);
    }, 1000);
  }, []);

  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const rawMessage = JSON.parse(event.data);
      
      // Handle different message types
      if (rawMessage.type === 'ack' && rawMessage.data?.messageId) {
        // Handle acknowledgment for sent messages
        const pendingMessage = pendingMessagesRef.current.get(rawMessage.data.messageId);
        if (pendingMessage) {
          clearTimeout(pendingMessage.timeout);
          pendingMessage.resolve();
          pendingMessagesRef.current.delete(rawMessage.data.messageId);
        }
        return;
      }

      // Handle error messages
      if (rawMessage.type === 'error') {
        const error = new Error(rawMessage.data?.error || 'WebSocket error');
        setLastError(error);
        onError?.(error);
        return;
      }

      // Parse and validate search collaboration message
      const message: SearchCollaborationMessage = {
        ...rawMessage,
        timestamp: rawMessage.timestamp ? new Date(rawMessage.timestamp) : new Date()
      };

      // Update statistics
      setMessagesReceived(prev => prev + 1);

      // Notify all message handlers
      messageHandlersRef.current.forEach(handler => {
        try {
          handler(message);
        } catch (error) {
          console.error('Error in message handler:', error);
        }
      });

    } catch (error) {
      console.error('Failed to parse WebSocket message:', error);
      const parseError = new Error('Failed to parse message');
      setLastError(parseError);
      onError?.(parseError);
    }
  }, [onError]);

  const connect = useCallback(async (): Promise<void> => {
    if (!enabled || !sessionId) {
      return;
    }

    if (wsRef.current && wsRef.current.readyState === WebSocket.CONNECTING) {
      return; // Already connecting
    }

    cleanup();
    
    setConnectionState('connecting');
    setLastError(null);

    return new Promise((resolve, reject) => {
      try {
        const ws = new WebSocket(getWebSocketUrl());
        wsRef.current = ws;

        const connectionTimeout = setTimeout(() => {
          reject(new Error('Connection timeout'));
          ws.close();
        }, 10000);

        ws.onopen = () => {
          clearTimeout(connectionTimeout);
          setConnectionState('connected');
          setReconnectAttempts(0);
          setLastError(null);
          
          startHeartbeat();
          startDurationTimer();
          
          onConnect?.();
          resolve();

          // Join the search session
          const joinMessage: SearchCollaborationMessage = {
            type: 'search_join',
            searchSessionId: sessionId!,
            data: { 
              timestamp: new Date().toISOString(),
              deviceInfo: {
                userAgent: navigator.userAgent,
                screen: {
                  width: screen.width,
                  height: screen.height
                }
              }
            },
            timestamp: new Date(),
            sequenceNumber: ++sequenceNumberRef.current,
            messageId: crypto.randomUUID()
          };

          ws.send(JSON.stringify(joinMessage));
        };

        ws.onclose = (event) => {
          clearTimeout(connectionTimeout);
          
          if (connectionState === 'connected') {
            onDisconnect?.();
          }

          setConnectionState('disconnected');
          
          // Attempt reconnection if enabled and not a clean close
          if (autoReconnect && event.code !== 1000 && reconnectAttempts < maxReconnectAttempts) {
            setConnectionState('reconnecting');
            
            reconnectTimerRef.current = setTimeout(() => {
              setReconnectAttempts(prev => {
                const newAttempts = prev + 1;
                onReconnect?.(newAttempts);
                return newAttempts;
              });
              
              connect().catch(error => {
                console.error('Reconnection failed:', error);
                setLastError(error);
                setConnectionState('error');
              });
            }, reconnectInterval * Math.pow(1.5, reconnectAttempts)); // Exponential backoff
          } else {
            setConnectionState('disconnected');
          }
        };

        ws.onmessage = handleMessage;

        ws.onerror = (event) => {
          clearTimeout(connectionTimeout);
          console.error('WebSocket error:', event);
          
          const error = new Error('WebSocket connection error');
          setLastError(error);
          setConnectionState('error');
          
          onError?.(error);
          reject(error);
        };

      } catch (error) {
        console.error('Failed to create WebSocket:', error);
        const wsError = new Error('Failed to create WebSocket connection');
        setLastError(wsError);
        setConnectionState('error');
        onError?.(wsError);
        reject(wsError);
      }
    });
  }, [
    enabled, 
    sessionId, 
    getWebSocketUrl, 
    autoReconnect, 
    maxReconnectAttempts, 
    reconnectInterval, 
    reconnectAttempts,
    connectionState,
    onConnect,
    onDisconnect,
    onError,
    onReconnect,
    cleanup,
    startHeartbeat,
    startDurationTimer,
    handleMessage
  ]);

  const disconnect = useCallback(() => {
    cleanup();
    setConnectionState('disconnected');
    setReconnectAttempts(0);
    setConnectionDuration(0);
  }, [cleanup]);

  const reconnect = useCallback(async () => {
    setReconnectAttempts(0);
    await connect();
  }, [connect]);

  // ========================================================================
  // Message Handling
  // ========================================================================

  const sendMessage = useCallback(async (message: SearchCollaborationMessage): Promise<void> => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }

    const messageWithDefaults: SearchCollaborationMessage = {
      ...message,
      userId: message.userId || 'current-user-id', // This would come from auth context
      timestamp: message.timestamp || new Date(),
      sequenceNumber: message.sequenceNumber || ++sequenceNumberRef.current,
      messageId: message.messageId || crypto.randomUUID()
    };

    return new Promise((resolve, reject) => {
      try {
        const messageData = JSON.stringify(messageWithDefaults);
        wsRef.current!.send(messageData);
        
        setMessagesSent(prev => prev + 1);

        // Set up acknowledgment handling if required
        if (messageWithDefaults.requiresAck) {
          const timeout = setTimeout(() => {
            pendingMessagesRef.current.delete(messageWithDefaults.messageId!);
            reject(new Error('Message timeout'));
          }, messageTimeout);

          pendingMessagesRef.current.set(messageWithDefaults.messageId!, {
            resolve,
            reject,
            timeout
          });
        } else {
          resolve();
        }

      } catch (error) {
        console.error('Failed to send message:', error);
        reject(error);
      }
    });
  }, [messageTimeout]);

  const onMessage = useCallback((handler: (message: SearchCollaborationMessage) => void) => {
    messageHandlersRef.current.add(handler);
    
    return () => {
      messageHandlersRef.current.delete(handler);
    };
  }, []);

  // ========================================================================
  // Effects
  // ========================================================================

  // Connect when enabled and session is available
  useEffect(() => {
    if (enabled && sessionId) {
      connect().catch(error => {
        console.error('Initial connection failed:', error);
      });
    } else {
      disconnect();
    }

    return cleanup;
  }, [enabled, sessionId, connect, disconnect, cleanup]);

  // Send leave message when disconnecting
  useEffect(() => {
    return () => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && sessionId) {
        const leaveMessage: SearchCollaborationMessage = {
          type: 'search_leave',
          searchSessionId: sessionId,
          data: { timestamp: new Date().toISOString() },
          timestamp: new Date(),
          sequenceNumber: ++sequenceNumberRef.current,
          messageId: crypto.randomUUID()
        };

        try {
          wsRef.current.send(JSON.stringify(leaveMessage));
        } catch (error) {
          console.error('Failed to send leave message:', error);
        }
      }
    };
  }, [sessionId]);

  // ========================================================================
  // Return Hook Interface
  // ========================================================================

  return {
    connectionState,
    isConnected,
    lastError,
    reconnectAttempts,
    
    // Message handling
    sendMessage,
    onMessage,
    
    // Connection management
    connect,
    disconnect,
    reconnect,
    
    // Statistics
    messagesSent,
    messagesReceived,
    connectionDuration
  };
}