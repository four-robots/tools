/**
 * WebSocket client for real-time updates
 */

import { useRef, useEffect, useCallback, useState } from 'react';
import { useToast } from '@/hooks/use-toast';

export interface WebSocketMessage {
  type: string;
  payload: any;
  timestamp: string;
  id: string;
}

export interface WebSocketConfig {
  url?: string;
  protocols?: string | string[];
  onOpen?: (event: Event) => void;
  onClose?: (event: CloseEvent) => void;
  onError?: (event: Event) => void;
  onMessage?: (message: WebSocketMessage) => void;
  reconnectAttempts?: number;
  reconnectInterval?: number;
  heartbeatInterval?: number;
  maxReconnectDelay?: number;
  circuitBreakerThreshold?: number;
  circuitBreakerTimeout?: number;
  enableReconnect?: boolean;
}

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error' | 'reconnecting' | 'failed' | 'circuit-open';

export function useWebSocket(config: WebSocketConfig) {
  const {
    url = process.env.NEXT_PUBLIC_WS_BASE_URL || process.env.WS_BASE_URL || (typeof window !== 'undefined' ? `ws://${window.location.host}/ws` : 'ws://localhost:6100/ws'),
    protocols,
    onOpen,
    onClose,
    onError,
    onMessage,
    reconnectAttempts = 5,
    reconnectInterval = 1000,
    heartbeatInterval = 30000,
    maxReconnectDelay = 30000,
    circuitBreakerThreshold = 5,
    circuitBreakerTimeout = 60000,
    enableReconnect = true,
  } = config;

  const ws = useRef<WebSocket | null>(null);
  const reconnectTimeoutId = useRef<NodeJS.Timeout | null>(null);
  const heartbeatTimeoutId = useRef<NodeJS.Timeout | null>(null);
  const circuitBreakerTimeoutId = useRef<NodeJS.Timeout | null>(null);
  
  // Connection state tracking
  const reconnectCount = useRef(0);
  const consecutiveFailures = useRef(0);
  const lastConnectAttempt = useRef(0);
  const isCircuitOpen = useRef(false);
  
  const { toast } = useToast();

  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);

  // Calculate exponential backoff delay
  const calculateBackoffDelay = useCallback((attempt: number) => {
    const delay = Math.min(reconnectInterval * Math.pow(2, attempt - 1), maxReconnectDelay);
    // Add jitter to prevent thundering herd problem
    const jitter = Math.random() * 0.1 * delay;
    return delay + jitter;
  }, [reconnectInterval, maxReconnectDelay]);

  // Check if circuit breaker should be opened
  const shouldOpenCircuit = useCallback(() => {
    return consecutiveFailures.current >= circuitBreakerThreshold;
  }, [circuitBreakerThreshold]);

  // Open the circuit breaker
  const openCircuit = useCallback(() => {
    console.warn(`WebSocket circuit breaker opened after ${consecutiveFailures.current} consecutive failures`);
    isCircuitOpen.current = true;
    setConnectionStatus('circuit-open');
    
    toast({
      title: 'Connection temporarily disabled',
      description: `Too many connection failures. Retrying in ${Math.round(circuitBreakerTimeout / 1000)} seconds.`,
      variant: 'warning',
    });

    // Schedule circuit breaker to close (half-open state)
    circuitBreakerTimeoutId.current = setTimeout(() => {
      console.log('WebSocket circuit breaker entering half-open state');
      isCircuitOpen.current = false;
      consecutiveFailures.current = 0; // Reset failure count
      if (enableReconnect) {
        // Call connect directly here to avoid dependency cycle
        tryConnect();
      }
    }, circuitBreakerTimeout);
  }, [circuitBreakerTimeout, toast, enableReconnect]);

  // Reset circuit breaker on successful connection
  const closeCircuit = useCallback(() => {
    if (circuitBreakerTimeoutId.current) {
      clearTimeout(circuitBreakerTimeoutId.current);
      circuitBreakerTimeoutId.current = null;
    }
    isCircuitOpen.current = false;
    consecutiveFailures.current = 0;
    reconnectCount.current = 0;
  }, []);

  const sendHeartbeat = useCallback(() => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({
        type: 'heartbeat',
        payload: {},
        timestamp: new Date().toISOString(),
        id: Math.random().toString(36).substring(2, 9),
      }));
    }
  }, []);

  const startHeartbeat = useCallback(() => {
    if (heartbeatTimeoutId.current) {
      clearInterval(heartbeatTimeoutId.current);
    }
    heartbeatTimeoutId.current = setInterval(sendHeartbeat, heartbeatInterval);
  }, [sendHeartbeat, heartbeatInterval]);

  const stopHeartbeat = useCallback(() => {
    if (heartbeatTimeoutId.current) {
      clearInterval(heartbeatTimeoutId.current);
      heartbeatTimeoutId.current = null;
    }
  }, []);

  const tryConnect = useCallback(() => {
    // Check if circuit breaker is open
    if (isCircuitOpen.current) {
      console.log('WebSocket connection attempt blocked - circuit breaker is open');
      return;
    }

    // Check if we've exceeded max reconnection attempts
    if (reconnectCount.current >= reconnectAttempts) {
      if (shouldOpenCircuit()) {
        openCircuit();
        return;
      }
      setConnectionStatus('failed');
      console.error(`WebSocket connection failed after ${reconnectAttempts} attempts`);
      toast({
        title: 'Connection failed',
        description: 'Maximum reconnection attempts exceeded',
        variant: 'destructive',
      });
      return;
    }

    try {
      const now = Date.now();
      lastConnectAttempt.current = now;
      
      setConnectionStatus(reconnectCount.current === 0 ? 'connecting' : 'reconnecting');
      
      // Close existing connection if any
      if (ws.current) {
        ws.current.close();
        ws.current = null;
      }
      
      console.log(`WebSocket connection attempt ${reconnectCount.current + 1}/${reconnectAttempts} to ${url}`);
      ws.current = new WebSocket(url, protocols);

      ws.current.onopen = (event) => {
        console.log('WebSocket connected successfully');
        setConnectionStatus('connected');
        closeCircuit(); // Reset all failure counters
        startHeartbeat();
        onOpen?.(event);
        
        // Only show success toast for reconnections, not initial connections
        if (reconnectCount.current > 0) {
          toast({
            title: 'Reconnected',
            description: 'Real-time connection restored',
            variant: 'success',
          });
        }
      };

      ws.current.onclose = (event) => {
        console.log(`WebSocket closed: code=${event.code}, reason="${event.reason}", wasClean=${event.wasClean}`);
        stopHeartbeat();
        onClose?.(event);

        // Don't attempt to reconnect if this was a clean close or reconnection is disabled
        if (event.wasClean || !enableReconnect) {
          setConnectionStatus('disconnected');
          return;
        }

        // Increment failure counters
        reconnectCount.current++;
        consecutiveFailures.current++;

        // Check if we should open circuit breaker
        if (shouldOpenCircuit()) {
          openCircuit();
          return;
        }

        // Check if we've hit max attempts
        if (reconnectCount.current >= reconnectAttempts) {
          setConnectionStatus('failed');
          console.error(`WebSocket connection failed after ${reconnectAttempts} attempts`);
          toast({
            title: 'Connection failed',
            description: 'Unable to establish connection after multiple attempts',
            variant: 'destructive',
          });
          return;
        }

        // Schedule reconnection with exponential backoff
        setConnectionStatus('reconnecting');
        const delay = calculateBackoffDelay(reconnectCount.current);
        
        console.log(`WebSocket scheduling reconnection attempt ${reconnectCount.current + 1}/${reconnectAttempts} in ${Math.round(delay)}ms`);
        
        // Only show toast for first few reconnection attempts to avoid spam
        if (reconnectCount.current <= 3) {
          toast({
            title: 'Connection lost',
            description: `Reconnecting in ${Math.round(delay / 1000)} seconds... (${reconnectCount.current}/${reconnectAttempts})`,
            variant: 'warning',
          });
        }

        reconnectTimeoutId.current = setTimeout(() => {
          tryConnect();
        }, delay);
      };

      ws.current.onerror = (event) => {
        console.error('WebSocket error:', event);
        setConnectionStatus('error');
        onError?.(event);
        // Note: onclose will be called after onerror, so we handle reconnection there
      };

      ws.current.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          setLastMessage(message);
          
          // Skip heartbeat responses
          if (message.type !== 'heartbeat') {
            onMessage?.(message);
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };
    } catch (error) {
      console.error('WebSocket connection error:', error);
      consecutiveFailures.current++;
      
      if (shouldOpenCircuit()) {
        openCircuit();
      } else {
        setConnectionStatus('error');
        toast({
          title: 'Connection error',
          description: 'Failed to initialize WebSocket connection',
          variant: 'destructive',
        });
      }
    }
  }, [
    url,
    protocols,
    onOpen,
    onClose,
    onError,
    onMessage,
    reconnectAttempts,
    enableReconnect,
    startHeartbeat,
    stopHeartbeat,
    toast,
    calculateBackoffDelay,
    shouldOpenCircuit,
    openCircuit,
    closeCircuit
  ]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutId.current) {
      clearTimeout(reconnectTimeoutId.current);
      reconnectTimeoutId.current = null;
    }
    
    if (circuitBreakerTimeoutId.current) {
      clearTimeout(circuitBreakerTimeoutId.current);
      circuitBreakerTimeoutId.current = null;
    }
    
    stopHeartbeat();
    
    // Reset connection state
    reconnectCount.current = 0;
    consecutiveFailures.current = 0;
    isCircuitOpen.current = false;
    
    if (ws.current) {
      ws.current.close(1000, 'Client disconnect');
      ws.current = null;
    }
    
    setConnectionStatus('disconnected');
  }, [stopHeartbeat]);

  const sendMessage = useCallback((type: string, payload: any) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      const message: WebSocketMessage = {
        type,
        payload,
        timestamp: new Date().toISOString(),
        id: Math.random().toString(36).substring(2, 9),
      };
      
      ws.current.send(JSON.stringify(message));
      return message.id;
    } else {
      console.warn('WebSocket is not connected');
      return null;
    }
  }, []);

  // Auto-connect on mount with delay to prevent synchronous suspension
  useEffect(() => {
    // Delay connection to prevent synchronous suspension during SSR/hydration
    const timeoutId = setTimeout(() => {
      tryConnect();
    }, 100); // Small delay to allow component to mount fully

    return () => {
      clearTimeout(timeoutId);
      disconnect();
    };
  }, [tryConnect, disconnect]);

  // Create a stable connect function for external use
  const connect = useCallback(() => {
    tryConnect();
  }, [tryConnect]);

  return {
    connectionStatus,
    lastMessage,
    sendMessage,
    connect,
    disconnect,
    isConnected: connectionStatus === 'connected',
    isConnecting: connectionStatus === 'connecting' || connectionStatus === 'reconnecting',
    isCircuitOpen: isCircuitOpen.current,
    reconnectAttempt: reconnectCount.current,
    consecutiveFailures: consecutiveFailures.current,
  };
}

// Hook for specific message types
export function useWebSocketSubscription(
  messageType: string,
  handler: (payload: any) => void,
  config?: Omit<WebSocketConfig, 'onMessage'>
) {
  const { lastMessage, ...websocket } = useWebSocket({
    ...config,
    onMessage: (message) => {
      if (message.type === messageType) {
        handler(message.payload);
      }
      config?.onOpen?.()
    },
  });

  useEffect(() => {
    if (lastMessage && lastMessage.type === messageType) {
      handler(lastMessage.payload);
    }
  }, [lastMessage, messageType, handler]);

  return websocket;
}