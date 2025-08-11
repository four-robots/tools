import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import {
  ConnectionState,
  RealtimeSubscription,
  SocketEvents,
  AlertNotification,
  WidgetData
} from '../types';
import { Alert, RealtimeMetricValue, MetricUpdate } from '@shared/types';

interface UseAnalyticsSocketOptions {
  autoConnect?: boolean;
  reconnectDelay?: number;
  maxReconnectAttempts?: number;
  heartbeatInterval?: number;
}

interface UseAnalyticsSocketReturn {
  socket: Socket | null;
  connectionState: ConnectionState;
  subscriptions: RealtimeSubscription[];
  
  // Connection methods
  connect: () => void;
  disconnect: () => void;
  reconnect: () => void;
  
  // Subscription methods
  subscribeToDashboard: (dashboardId: string) => void;
  unsubscribeFromDashboard: (dashboardId: string) => void;
  subscribeToWidget: (dashboardId: string, widgetId: string, refreshInterval?: number) => void;
  unsubscribeFromWidget: (dashboardId: string, widgetId: string) => void;
  subscribeToMetrics: (metricNames: string[], interval?: number, filters?: any) => void;
  unsubscribeFromMetrics: () => void;
  subscribeToAlerts: () => void;
  subscribeToSystemHealth: () => void;
  
  // Dashboard collaboration
  joinDashboard: (dashboardId: string) => void;
  leaveDashboard: (dashboardId: string) => void;
  updateCursor: (dashboardId: string, position: { x: number; y: number }) => void;
  
  // Event tracking
  trackEvent: (eventType: string, eventData: any) => void;
  acknowledgeAlert: (alertId: string, notes?: string) => void;
  
  // Event listeners
  onDashboardUpdated: (callback: (data: { dashboardId: string; update: any }) => void) => void;
  onWidgetData: (callback: (data: { dashboardId: string; widgetId: string; data: WidgetData }) => void) => void;
  onMetricsData: (callback: (data: { metrics: RealtimeMetricValue[] }) => void) => void;
  onAlert: (callback: (alert: Alert) => void) => void;
  onSystemHealth: (callback: (data: any) => void) => void;
  onUserPresence: (callback: (data: { dashboardId: string; userId: string; action: 'joined' | 'left' }) => void) => void;
}

export default function useAnalyticsSocket(
  userId: string,
  tenantId?: string,
  options: UseAnalyticsSocketOptions = {}
): UseAnalyticsSocketReturn {
  const {
    autoConnect = true,
    reconnectDelay = 3000,
    maxReconnectAttempts = 5,
    heartbeatInterval = 30000
  } = options;
  
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>({
    status: 'disconnected'
  });
  const [subscriptions, setSubscriptions] = useState<RealtimeSubscription[]>([]);
  
  const reconnectAttempts = useRef(0);
  const heartbeatTimer = useRef<NodeJS.Timer>();
  const connectionStartTime = useRef<number>();
  const eventCallbacks = useRef<Map<string, Function[]>>(new Map());
  
  // Initialize socket connection
  const connect = useCallback(() => {
    if (socket?.connected) return;
    
    setConnectionState(prev => ({
      ...prev,
      status: 'connecting',
      error: undefined
    }));
    
    connectionStartTime.current = performance.now();
    
    const newSocket = io('/analytics', {
      transports: ['websocket'],
      upgrade: true,
      rememberUpgrade: true,
      timeout: 10000,
      forceNew: true,
      auth: {
        userId,
        tenantId
      }
    });
    
    // Connection event handlers
    newSocket.on('connect', () => {
      const latency = connectionStartTime.current 
        ? performance.now() - connectionStartTime.current 
        : undefined;
        
      setConnectionState({
        status: 'connected',
        latency: Math.round(latency || 0),
        lastPing: new Date(),
        reconnectAttempts: 0
      });
      
      reconnectAttempts.current = 0;
      
      // Authenticate with the server
      newSocket.emit('authenticate', { userId, tenantId });
      
      // Start heartbeat
      startHeartbeat(newSocket);
      
      console.log('Analytics socket connected', { userId, tenantId, latency });
    });
    
    newSocket.on('authenticated', (data) => {
      console.log('Analytics socket authenticated', data);
    });
    
    newSocket.on('auth_error', (error) => {
      console.error('Analytics socket authentication failed', error);
      setConnectionState(prev => ({
        ...prev,
        status: 'error',
        error: error.message
      }));
    });
    
    newSocket.on('disconnect', (reason) => {
      console.log('Analytics socket disconnected', { reason });
      
      setConnectionState(prev => ({
        ...prev,
        status: 'disconnected',
        error: reason === 'io server disconnect' ? 'Server disconnected' : undefined
      }));
      
      // Clear subscriptions
      setSubscriptions([]);
      
      // Stop heartbeat
      if (heartbeatTimer.current) {
        clearInterval(heartbeatTimer.current);
        heartbeatTimer.current = undefined;
      }
      
      // Auto-reconnect logic
      if (reason !== 'io client disconnect' && reconnectAttempts.current < maxReconnectAttempts) {
        setTimeout(() => {
          reconnectAttempts.current++;
          setConnectionState(prev => ({
            ...prev,
            reconnectAttempts: reconnectAttempts.current
          }));
          connect();
        }, reconnectDelay);
      }
    });
    
    newSocket.on('connect_error', (error) => {
      console.error('Analytics socket connection error', error);
      
      setConnectionState(prev => ({
        ...prev,
        status: 'error',
        error: error.message
      }));
    });
    
    // Data event handlers
    setupEventHandlers(newSocket);
    
    setSocket(newSocket);
  }, [userId, tenantId, reconnectDelay, maxReconnectAttempts]);
  
  const disconnect = useCallback(() => {
    if (socket) {
      socket.disconnect();
      setSocket(null);
    }
    
    if (heartbeatTimer.current) {
      clearInterval(heartbeatTimer.current);
      heartbeatTimer.current = undefined;
    }
    
    setConnectionState({
      status: 'disconnected'
    });
    
    setSubscriptions([]);
  }, [socket]);
  
  const reconnect = useCallback(() => {
    disconnect();
    setTimeout(connect, 1000);
  }, [disconnect, connect]);
  
  // Heartbeat mechanism
  const startHeartbeat = (socketInstance: Socket) => {
    if (heartbeatTimer.current) {
      clearInterval(heartbeatTimer.current);
    }
    
    heartbeatTimer.current = setInterval(() => {
      if (socketInstance.connected) {
        const pingStart = performance.now();
        
        socketInstance.emit('ping');
        
        socketInstance.once('pong', (data) => {
          const latency = performance.now() - pingStart;
          
          setConnectionState(prev => ({
            ...prev,
            latency: Math.round(latency),
            lastPing: new Date()
          }));
        });
      }
    }, heartbeatInterval);
  };
  
  // Setup all event handlers
  const setupEventHandlers = (socketInstance: Socket) => {
    // Dashboard events
    socketInstance.on('dashboard_subscribed', (data) => {
      addSubscription({
        type: 'dashboard',
        id: data.dashboardId,
        active: true,
        lastUpdate: new Date()
      });
      
      triggerCallback('dashboard_subscribed', data);
    });
    
    socketInstance.on('dashboard_updated', (data) => {
      updateSubscription('dashboard', data.dashboardId, { lastUpdate: new Date() });
      triggerCallback('dashboard_updated', data);
    });
    
    // Widget events
    socketInstance.on('widget_data', (data) => {
      updateSubscription('widget', `${data.dashboardId}:${data.widgetId}`, { lastUpdate: new Date() });
      triggerCallback('widget_data', data);
    });
    
    socketInstance.on('widget_subscribed', (data) => {
      addSubscription({
        type: 'widget',
        id: `${data.dashboardId}:${data.widgetId}`,
        active: true,
        lastUpdate: new Date()
      });
    });
    
    // Metrics events
    socketInstance.on('metrics_data', (data) => {
      updateSubscription('metrics', 'global', { lastUpdate: new Date() });
      triggerCallback('metrics_data', data);
    });
    
    socketInstance.on('metrics_subscribed', () => {
      addSubscription({
        type: 'metrics',
        id: 'global',
        active: true,
        lastUpdate: new Date()
      });
    });
    
    // Alert events
    socketInstance.on('alert_triggered', (data) => {
      triggerCallback('alert_triggered', data.alert);
    });
    
    socketInstance.on('alert_acknowledged', (data) => {
      triggerCallback('alert_acknowledged', data);
    });
    
    socketInstance.on('alert_resolved', (data) => {
      triggerCallback('alert_resolved', data);
    });
    
    socketInstance.on('alerts_subscribed', () => {
      addSubscription({
        type: 'alerts',
        id: 'global',
        active: true,
        lastUpdate: new Date()
      });
    });
    
    // System health events
    socketInstance.on('system_health_data', (data) => {
      updateSubscription('system_health', 'global', { lastUpdate: new Date() });
      triggerCallback('system_health_data', data);
    });
    
    socketInstance.on('system_health_subscribed', () => {
      addSubscription({
        type: 'system_health',
        id: 'global',
        active: true,
        lastUpdate: new Date()
      });
    });
    
    // Collaboration events
    socketInstance.on('user_joined', (data) => {
      triggerCallback('user_joined', data);
    });
    
    socketInstance.on('user_left', (data) => {
      triggerCallback('user_left', data);
    });
    
    socketInstance.on('cursor_update', (data) => {
      triggerCallback('cursor_update', data);
    });
    
    // Error events
    socketInstance.on('error', (error) => {
      console.error('Analytics socket error', error);
      setConnectionState(prev => ({
        ...prev,
        error: error.message
      }));
    });
  };
  
  // Subscription management
  const addSubscription = (subscription: RealtimeSubscription) => {
    setSubscriptions(prev => {
      const existing = prev.find(sub => sub.type === subscription.type && sub.id === subscription.id);
      if (existing) {
        return prev.map(sub => 
          sub.type === subscription.type && sub.id === subscription.id 
            ? { ...sub, ...subscription }
            : sub
        );
      }
      return [...prev, subscription];
    });
  };
  
  const updateSubscription = (type: RealtimeSubscription['type'], id: string, updates: Partial<RealtimeSubscription>) => {
    setSubscriptions(prev => 
      prev.map(sub => 
        sub.type === type && sub.id === id
          ? { ...sub, ...updates }
          : sub
      )
    );
  };
  
  const removeSubscription = (type: RealtimeSubscription['type'], id: string) => {
    setSubscriptions(prev => 
      prev.filter(sub => !(sub.type === type && sub.id === id))
    );
  };
  
  // Event callback management
  const triggerCallback = (event: string, data: any) => {
    const callbacks = eventCallbacks.current.get(event) || [];
    callbacks.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error('Analytics socket callback error', error);
      }
    });
  };
  
  const addEventCallback = (event: string, callback: Function) => {
    const callbacks = eventCallbacks.current.get(event) || [];
    eventCallbacks.current.set(event, [...callbacks, callback]);
    
    return () => {
      const currentCallbacks = eventCallbacks.current.get(event) || [];
      const filtered = currentCallbacks.filter(cb => cb !== callback);
      if (filtered.length === 0) {
        eventCallbacks.current.delete(event);
      } else {
        eventCallbacks.current.set(event, filtered);
      }
    };
  };
  
  // Subscription methods
  const subscribeToDashboard = useCallback((dashboardId: string) => {
    if (!socket?.connected) return;
    socket.emit('subscribe_dashboard', { dashboardId });
  }, [socket]);
  
  const unsubscribeFromDashboard = useCallback((dashboardId: string) => {
    if (!socket?.connected) return;
    socket.emit('unsubscribe_dashboard', { dashboardId });
    removeSubscription('dashboard', dashboardId);
  }, [socket]);
  
  const subscribeToWidget = useCallback((dashboardId: string, widgetId: string, refreshInterval = 30) => {
    if (!socket?.connected) return;
    socket.emit('subscribe_widget', { dashboardId, widgetId, refreshInterval });
  }, [socket]);
  
  const unsubscribeFromWidget = useCallback((dashboardId: string, widgetId: string) => {
    if (!socket?.connected) return;
    socket.emit('unsubscribe_widget', { dashboardId, widgetId });
    removeSubscription('widget', `${dashboardId}:${widgetId}`);
  }, [socket]);
  
  const subscribeToMetrics = useCallback((metricNames: string[], interval = 30, filters?: any) => {
    if (!socket?.connected) return;
    socket.emit('subscribe_metrics', { metricNames, interval, filters });
  }, [socket]);
  
  const unsubscribeFromMetrics = useCallback(() => {
    if (!socket?.connected) return;
    socket.emit('unsubscribe_metrics');
    removeSubscription('metrics', 'global');
  }, [socket]);
  
  const subscribeToAlerts = useCallback(() => {
    if (!socket?.connected) return;
    socket.emit('subscribe_alerts');
  }, [socket]);
  
  const subscribeToSystemHealth = useCallback(() => {
    if (!socket?.connected) return;
    socket.emit('subscribe_system_health');
  }, [socket]);
  
  // Collaboration methods
  const joinDashboard = useCallback((dashboardId: string) => {
    if (!socket?.connected) return;
    socket.emit('join_dashboard', { dashboardId });
  }, [socket]);
  
  const leaveDashboard = useCallback((dashboardId: string) => {
    if (!socket?.connected) return;
    socket.emit('leave_dashboard', { dashboardId });
  }, [socket]);
  
  const updateCursor = useCallback((dashboardId: string, position: { x: number; y: number }) => {
    if (!socket?.connected) return;
    socket.emit('dashboard_cursor', { dashboardId, position });
  }, [socket]);
  
  // Action methods
  const trackEvent = useCallback((eventType: string, eventData: any) => {
    if (!socket?.connected) return;
    socket.emit('track_event', { eventType, eventData });
  }, [socket]);
  
  const acknowledgeAlert = useCallback((alertId: string, notes?: string) => {
    if (!socket?.connected) return;
    socket.emit('acknowledge_alert', { alertId, notes });
  }, [socket]);
  
  // Event listener methods
  const onDashboardUpdated = useCallback((callback: (data: { dashboardId: string; update: any }) => void) => {
    return addEventCallback('dashboard_updated', callback);
  }, []);
  
  const onWidgetData = useCallback((callback: (data: { dashboardId: string; widgetId: string; data: WidgetData }) => void) => {
    return addEventCallback('widget_data', callback);
  }, []);
  
  const onMetricsData = useCallback((callback: (data: { metrics: RealtimeMetricValue[] }) => void) => {
    return addEventCallback('metrics_data', callback);
  }, []);
  
  const onAlert = useCallback((callback: (alert: Alert) => void) => {
    return addEventCallback('alert_triggered', callback);
  }, []);
  
  const onSystemHealth = useCallback((callback: (data: any) => void) => {
    return addEventCallback('system_health_data', callback);
  }, []);
  
  const onUserPresence = useCallback((callback: (data: { dashboardId: string; userId: string; action: 'joined' | 'left' }) => void) => {
    const unsubscribeJoin = addEventCallback('user_joined', (data: any) => 
      callback({ ...data, action: 'joined' })
    );
    const unsubscribeLeave = addEventCallback('user_left', (data: any) => 
      callback({ ...data, action: 'left' })
    );
    
    return () => {
      unsubscribeJoin();
      unsubscribeLeave();
    };
  }, []);
  
  // Auto-connect on mount
  useEffect(() => {
    if (autoConnect && userId) {
      connect();
    }
    
    return () => {
      disconnect();
    };
  }, [userId, tenantId, autoConnect, connect, disconnect]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (heartbeatTimer.current) {
        clearInterval(heartbeatTimer.current);
      }
      eventCallbacks.current.clear();
    };
  }, []);
  
  return {
    socket,
    connectionState,
    subscriptions,
    
    // Connection methods
    connect,
    disconnect,
    reconnect,
    
    // Subscription methods
    subscribeToDashboard,
    unsubscribeFromDashboard,
    subscribeToWidget,
    unsubscribeFromWidget,
    subscribeToMetrics,
    unsubscribeFromMetrics,
    subscribeToAlerts,
    subscribeToSystemHealth,
    
    // Collaboration methods
    joinDashboard,
    leaveDashboard,
    updateCursor,
    
    // Action methods
    trackEvent,
    acknowledgeAlert,
    
    // Event listener methods
    onDashboardUpdated,
    onWidgetData,
    onMetricsData,
    onAlert,
    onSystemHealth,
    onUserPresence
  };
}