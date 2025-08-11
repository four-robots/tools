import { Server as SocketIOServer, Socket } from 'socket.io';
import { Database } from '@/utils/database';
import { 
  SystemMetricsCollector,
  AnalyticsQueryEngine,
  AlertManager,
  RealtimeAnalyticsService
} from '@mcp-tools/core';
import {
  RealtimeMetricValue,
  MetricUpdate,
  DashboardConfiguration,
  Alert,
  StreamMetric,
  CollaborationEvent,
  SystemMetric,
  UserActivity,
  ANALYTICS_CONSTANTS
} from '@shared/types';
import { logger } from '@/utils/logger';
import { performance } from 'perf_hooks';
import { EventEmitter } from 'events';

interface AnalyticsSocketData {
  userId: string;
  tenantId?: string;
  dashboardId?: string;
  subscriptions: Set<string>;
  lastActivity: Date;
}

interface DashboardSubscription {
  dashboardId: string;
  userId: string;
  socketId: string;
  widgetRefreshIntervals: Map<string, NodeJS.Timer>;
  lastUpdate: Date;
}

interface MetricStreamSubscription {
  metricNames: string[];
  interval: number;
  filters?: any;
  lastSent: Date;
  timer?: NodeJS.Timer; // Track the subscription timer for cleanup
}

export class AnalyticsSocketHandler extends EventEmitter {
  private io: SocketIOServer;
  private db: Database;
  private socketData = new Map<string, AnalyticsSocketData>();
  private dashboardSubscriptions = new Map<string, DashboardSubscription[]>();
  private metricStreamSubscriptions = new Map<string, MetricStreamSubscription>();
  
  // Analytics services per tenant
  private analyticsServices = new Map<string, {
    queryEngine: AnalyticsQueryEngine;
    alertManager: AlertManager;
    realtimeService: RealtimeAnalyticsService;
    systemMetrics: SystemMetricsCollector;
  }>();
  
  // Real-time update intervals - Track for proper cleanup
  private globalMetricsTimer?: NodeJS.Timer;
  private presenceUpdateTimer?: NodeJS.Timer;
  private cleanupTimers = new Set<NodeJS.Timer>();
  private isDestroyed = false;
  private subscriptionLocks = new Map<string, Promise<void>>();
  
  constructor(io: SocketIOServer) {
    super();
    this.io = io;
    this.db = Database.getInstance();
    
    this.setupSocketHandlers();
    this.startGlobalUpdates();
  }
  
  private getAnalyticsServices(tenantId?: string) {
    const key = tenantId || 'default';
    
    if (!this.analyticsServices.has(key)) {
      const queryEngine = new AnalyticsQueryEngine(this.db, tenantId);
      const alertManager = new AlertManager(this.db, tenantId);
      const realtimeService = new RealtimeAnalyticsService(this.db, tenantId);
      const systemMetrics = new SystemMetricsCollector('websocket-analytics');
      
      // Set up event listeners for real-time updates
      this.setupAnalyticsEventListeners(key, {
        queryEngine,
        alertManager,
        realtimeService,
        systemMetrics
      });
      
      this.analyticsServices.set(key, {
        queryEngine,
        alertManager,
        realtimeService,
        systemMetrics
      });
    }
    
    return this.analyticsServices.get(key)!;
  }
  
  private setupSocketHandlers(): void {
    this.io.on('connection', (socket: Socket) => {
      logger.info('Analytics socket connected', { socketId: socket.id });
      
      // Authentication middleware - CRITICAL: Block unauthenticated events
      socket.use(([event, ...args], next) => {
        // Allow authentication event to proceed
        if (event === 'authenticate') {
          next();
          return;
        }
        
        // Block all other events if not authenticated
        if (!socket.data.user) {
          logger.error('Blocked unauthenticated analytics socket event', { 
            socketId: socket.id, 
            event,
            clientIP: socket.handshake.address 
          });
          next(new Error('Authentication required'));
          return;
        }
        
        // Verify user session is still valid
        const socketData = this.socketData.get(socket.id);
        if (!socketData || !socketData.userId) {
          logger.error('Invalid socket session', { socketId: socket.id, event });
          next(new Error('Invalid session'));
          return;
        }
        
        // Update last activity
        socketData.lastActivity = new Date();
        
        next();
      });
      
      // Initialize socket data
      socket.on('authenticate', (data: { userId: string; tenantId?: string }) => {
        this.handleAuthentication(socket, data);
      });
      
      // Dashboard subscriptions
      socket.on('subscribe_dashboard', (data: { dashboardId: string }) => {
        this.handleDashboardSubscription(socket, data);
      });
      
      socket.on('unsubscribe_dashboard', (data: { dashboardId: string }) => {
        this.handleDashboardUnsubscription(socket, data);
      });
      
      // Widget data subscriptions
      socket.on('subscribe_widget', (data: { 
        dashboardId: string; 
        widgetId: string; 
        refreshInterval?: number 
      }) => {
        this.handleWidgetSubscription(socket, data);
      });
      
      socket.on('unsubscribe_widget', (data: { 
        dashboardId: string; 
        widgetId: string 
      }) => {
        this.handleWidgetUnsubscription(socket, data);
      });
      
      // Metric streaming subscriptions
      socket.on('subscribe_metrics', (data: {
        metricNames: string[];
        interval?: number;
        filters?: any;
      }) => {
        this.handleMetricSubscription(socket, data);
      });
      
      socket.on('unsubscribe_metrics', () => {
        this.handleMetricUnsubscription(socket);
      });
      
      // Real-time analytics events
      socket.on('track_event', (data: {
        eventType: string;
        eventData: any;
      }) => {
        this.handleEventTracking(socket, data);
      });
      
      // Alert management
      socket.on('subscribe_alerts', () => {
        this.handleAlertSubscription(socket);
      });
      
      socket.on('acknowledge_alert', (data: { alertId: string; notes?: string }) => {
        this.handleAlertAcknowledgment(socket, data);
      });
      
      // Dashboard collaboration
      socket.on('join_dashboard', (data: { dashboardId: string }) => {
        this.handleDashboardJoin(socket, data);
      });
      
      socket.on('leave_dashboard', (data: { dashboardId: string }) => {
        this.handleDashboardLeave(socket, data);
      });
      
      socket.on('dashboard_cursor', (data: { 
        dashboardId: string; 
        position: { x: number; y: number } 
      }) => {
        this.handleDashboardCursor(socket, data);
      });
      
      // System health monitoring
      socket.on('subscribe_system_health', () => {
        this.handleSystemHealthSubscription(socket);
      });
      
      // Disconnect handling
      socket.on('disconnect', (reason) => {
        this.handleDisconnection(socket, reason);
      });
      
      // Heartbeat for connection health
      socket.on('ping', () => {
        socket.emit('pong', { timestamp: Date.now() });
      });
    });
  }
  
  private async handleAuthentication(socket: Socket, data: { userId: string; tenantId?: string }): Promise<void> {
    try {
      const { userId, tenantId } = data;
      
      // Validate user exists and has proper permissions
      const userQuery = `
        SELECT id, tenant_id FROM users 
        WHERE id = $1 ${tenantId ? 'AND tenant_id = $2' : ''}
      `;
      
      const params = tenantId ? [userId, tenantId] : [userId];
      const [user] = await this.db.query(userQuery, params);
      
      if (!user) {
        socket.emit('auth_error', { message: 'User not found or invalid tenant' });
        return;
      }
      
      // Store socket data
      this.socketData.set(socket.id, {
        userId,
        tenantId: user.tenant_id,
        subscriptions: new Set(),
        lastActivity: new Date()
      });
      
      // Join tenant room for broadcasts
      if (tenantId) {
        socket.join(`tenant:${tenantId}`);
      }
      
      socket.data.user = { id: userId, tenantId: user.tenant_id };
      
      socket.emit('authenticated', { 
        userId, 
        tenantId: user.tenant_id,
        timestamp: new Date()
      });
      
      logger.info('Analytics socket authenticated', { 
        socketId: socket.id, 
        userId, 
        tenantId: user.tenant_id 
      });
      
    } catch (error) {
      logger.error('Analytics socket authentication failed', { error, socketId: socket.id });
      socket.emit('auth_error', { message: 'Authentication failed' });
    }
  }
  
  private async handleDashboardSubscription(socket: Socket, data: { dashboardId: string }): Promise<void> {
    const { dashboardId } = data;
    const lockKey = `dashboard_sub:${socket.id}:${dashboardId}`;
    
    // Prevent race conditions with atomic subscription management
    if (this.subscriptionLocks.has(lockKey)) {
      await this.subscriptionLocks.get(lockKey);
    }
    
    const subscriptionPromise = this.performDashboardSubscription(socket, data);
    this.subscriptionLocks.set(lockKey, subscriptionPromise);
    
    try {
      await subscriptionPromise;
    } finally {
      this.subscriptionLocks.delete(lockKey);
    }
  }
  
  private async performDashboardSubscription(socket: Socket, data: { dashboardId: string }): Promise<void> {
    try {
      const { dashboardId } = data;
      const socketData = this.socketData.get(socket.id);
      
      if (!socketData) {
        socket.emit('error', { message: 'Not authenticated' });
        return;
      }
      
      // Check if already subscribed to prevent duplicates
      if (socketData.subscriptions.has(`dashboard:${dashboardId}`)) {
        socket.emit('dashboard_subscribed', { 
          dashboardId,
          message: 'Already subscribed' 
        });
        return;
      }
      
      // Verify dashboard access with proper parameterization
      const queryParts = [
        'SELECT id, name, widgets, refresh_interval_seconds',
        'FROM dashboard_configurations',
        'WHERE id = $1',
        'AND (owner_id = $2 OR $2 = ANY(shared_with_users) OR is_public = true)'
      ];
      
      const params: any[] = [dashboardId, socketData.userId];
      
      if (socketData.tenantId) {
        queryParts.push('AND tenant_id = $' + (params.length + 1));
        params.push(socketData.tenantId);
      }
      
      const dashboardQuery = queryParts.join(' ');
      const [dashboard] = await this.db.query(dashboardQuery, params);
      
      if (!dashboard) {
        socket.emit('error', { message: 'Dashboard not found or access denied' });
        return;
      }
      
      // Atomically add to dashboard subscriptions
      if (!this.dashboardSubscriptions.has(dashboardId)) {
        this.dashboardSubscriptions.set(dashboardId, []);
      }
      
      const subscription: DashboardSubscription = {
        dashboardId,
        userId: socketData.userId,
        socketId: socket.id,
        widgetRefreshIntervals: new Map(),
        lastUpdate: new Date()
      };
      
      this.dashboardSubscriptions.get(dashboardId)!.push(subscription);
      socketData.subscriptions.add(`dashboard:${dashboardId}`);
      
      // Join dashboard room
      socket.join(`dashboard:${dashboardId}`);
      
      // Set up widget refresh intervals
      const widgets = JSON.parse(dashboard.widgets || '[]');
      for (const widget of widgets) {
        this.setupWidgetRefresh(subscription, widget);
      }
      
      socket.emit('dashboard_subscribed', { 
        dashboardId,
        dashboard: {
          id: dashboard.id,
          name: dashboard.name,
          widgets: widgets
        }
      });
      
      logger.info('Dashboard subscription created', { 
        socketId: socket.id, 
        dashboardId, 
        userId: socketData.userId 
      });
      
    } catch (error) {
      logger.error('Dashboard subscription failed', { error, socketId: socket.id });
      socket.emit('error', { message: 'Dashboard subscription failed' });
    }
  }
  
  private handleDashboardUnsubscription(socket: Socket, data: { dashboardId: string }): void {
    const { dashboardId } = data;
    const socketData = this.socketData.get(socket.id);
    
    if (!socketData) return;
    
    // Remove from dashboard subscriptions
    const subscriptions = this.dashboardSubscriptions.get(dashboardId);
    if (subscriptions) {
      const index = subscriptions.findIndex(sub => sub.socketId === socket.id);
      if (index >= 0) {
        const subscription = subscriptions[index];
        
        // Clear widget refresh intervals
        for (const [widgetId, timer] of subscription.widgetRefreshIntervals) {
          clearInterval(timer);
        }
        
        subscriptions.splice(index, 1);
        
        // Clean up empty subscription arrays
        if (subscriptions.length === 0) {
          this.dashboardSubscriptions.delete(dashboardId);
        }
      }
    }
    
    socketData.subscriptions.delete(`dashboard:${dashboardId}`);
    socket.leave(`dashboard:${dashboardId}`);
    
    socket.emit('dashboard_unsubscribed', { dashboardId });
    
    logger.info('Dashboard unsubscription', { 
      socketId: socket.id, 
      dashboardId, 
      userId: socketData.userId 
    });
  }
  
  private async handleWidgetSubscription(socket: Socket, data: { 
    dashboardId: string; 
    widgetId: string; 
    refreshInterval?: number 
  }): Promise<void> {
    try {
      const { dashboardId, widgetId, refreshInterval = 30 } = data;
      const socketData = this.socketData.get(socket.id);
      
      if (!socketData) {
        socket.emit('error', { message: 'Not authenticated' });
        return;
      }
      
      // Get dashboard subscription
      const subscriptions = this.dashboardSubscriptions.get(dashboardId);
      const subscription = subscriptions?.find(sub => sub.socketId === socket.id);
      
      if (!subscription) {
        socket.emit('error', { message: 'Not subscribed to dashboard' });
        return;
      }
      
      // Get widget configuration from database
      const widgetData = await this.getWidgetData(dashboardId, widgetId, socketData.tenantId);
      
      if (!widgetData) {
        socket.emit('error', { message: 'Widget not found' });
        return;
      }
      
      // Send initial widget data
      socket.emit('widget_data', {
        dashboardId,
        widgetId,
        data: widgetData,
        timestamp: new Date()
      });
      
      // Set up refresh interval for this widget
      const timer = setInterval(async () => {
        try {
          const updatedData = await this.getWidgetData(dashboardId, widgetId, socketData.tenantId);
          socket.emit('widget_data', {
            dashboardId,
            widgetId,
            data: updatedData,
            timestamp: new Date()
          });
        } catch (error) {
          logger.error('Widget refresh failed', { error, widgetId, socketId: socket.id });
        }
      }, refreshInterval * 1000);
      
      subscription.widgetRefreshIntervals.set(widgetId, timer);
      
      socket.emit('widget_subscribed', { 
        dashboardId,
        widgetId,
        refreshInterval
      });
      
      logger.debug('Widget subscription created', { 
        socketId: socket.id, 
        dashboardId, 
        widgetId, 
        refreshInterval 
      });
      
    } catch (error) {
      logger.error('Widget subscription failed', { error, socketId: socket.id });
      socket.emit('error', { message: 'Widget subscription failed' });
    }
  }
  
  private handleWidgetUnsubscription(socket: Socket, data: { 
    dashboardId: string; 
    widgetId: string 
  }): void {
    const { dashboardId, widgetId } = data;
    
    const subscriptions = this.dashboardSubscriptions.get(dashboardId);
    const subscription = subscriptions?.find(sub => sub.socketId === socket.id);
    
    if (subscription) {
      const timer = subscription.widgetRefreshIntervals.get(widgetId);
      if (timer) {
        clearInterval(timer);
        subscription.widgetRefreshIntervals.delete(widgetId);
      }
    }
    
    socket.emit('widget_unsubscribed', { dashboardId, widgetId });
    
    logger.debug('Widget unsubscription', { 
      socketId: socket.id, 
      dashboardId, 
      widgetId 
    });
  }
  
  private handleMetricSubscription(socket: Socket, data: {
    metricNames: string[];
    interval?: number;
    filters?: any;
  }): void {
    const { metricNames, interval = 30, filters } = data;
    const socketData = this.socketData.get(socket.id);
    
    if (!socketData) {
      socket.emit('error', { message: 'Not authenticated' });
      return;
    }
    
    // Store metric subscription
    this.metricStreamSubscriptions.set(socket.id, {
      metricNames,
      interval,
      filters,
      lastSent: new Date()
    });
    
    socketData.subscriptions.add('metrics');
    
    socket.emit('metrics_subscribed', { 
      metricNames, 
      interval 
    });
    
    // Start sending real-time metrics
    this.startMetricStream(socket, socketData.tenantId);
    
    logger.info('Metric subscription created', { 
      socketId: socket.id, 
      metricNames, 
      interval, 
      userId: socketData.userId 
    });
  }
  
  private handleMetricUnsubscription(socket: Socket): void {
    // Clean up metric subscription timer
    const subscription = this.metricStreamSubscriptions.get(socket.id);
    if (subscription?.timer) {
      clearInterval(subscription.timer);
      this.cleanupTimers.delete(subscription.timer);
    }
    
    this.metricStreamSubscriptions.delete(socket.id);
    
    const socketData = this.socketData.get(socket.id);
    if (socketData) {
      socketData.subscriptions.delete('metrics');
    }
    
    socket.emit('metrics_unsubscribed');
    
    logger.info('Metric unsubscription', { socketId: socket.id });
  }
  
  private async handleEventTracking(socket: Socket, data: {
    eventType: string;
    eventData: any;
  }): Promise<void> {
    try {
      const { eventType, eventData } = data;
      const socketData = this.socketData.get(socket.id);
      
      if (!socketData) return;
      
      const { realtimeService } = this.getAnalyticsServices(socketData.tenantId);
      
      // Track different types of events
      switch (eventType) {
        case 'dashboard_view':
          await realtimeService.trackFeatureUsage(
            socketData.userId,
            'dashboard',
            { dashboardId: eventData.dashboardId }
          );
          break;
        
        case 'widget_interaction':
          await realtimeService.trackFeatureUsage(
            socketData.userId,
            'widget_interaction',
            eventData
          );
          break;
        
        case 'dashboard_edit':
          await realtimeService.trackFeatureUsage(
            socketData.userId,
            'dashboard_edit',
            eventData
          );
          break;
      }
      
      socket.emit('event_tracked', { eventType, timestamp: new Date() });
      
    } catch (error) {
      logger.error('Event tracking failed', { error, socketId: socket.id });
    }
  }
  
  private handleAlertSubscription(socket: Socket): void {
    const socketData = this.socketData.get(socket.id);
    
    if (!socketData) {
      socket.emit('error', { message: 'Not authenticated' });
      return;
    }
    
    socketData.subscriptions.add('alerts');
    
    // Join alerts room for tenant
    if (socketData.tenantId) {
      socket.join(`alerts:${socketData.tenantId}`);
    } else {
      socket.join('alerts:default');
    }
    
    socket.emit('alerts_subscribed');
    
    logger.info('Alert subscription created', { 
      socketId: socket.id, 
      userId: socketData.userId 
    });
  }
  
  private async handleAlertAcknowledgment(socket: Socket, data: { alertId: string; notes?: string }): Promise<void> {
    try {
      const { alertId, notes } = data;
      const socketData = this.socketData.get(socket.id);
      
      if (!socketData) return;
      
      const { alertManager } = this.getAnalyticsServices(socketData.tenantId);
      
      await alertManager.acknowledgeAlert(alertId, socketData.userId, notes);
      
      // Broadcast acknowledgment to all connected clients in tenant
      const room = socketData.tenantId ? `alerts:${socketData.tenantId}` : 'alerts:default';
      this.io.to(room).emit('alert_acknowledged', {
        alertId,
        acknowledgedBy: socketData.userId,
        notes,
        timestamp: new Date()
      });
      
    } catch (error) {
      logger.error('Alert acknowledgment failed', { error, socketId: socket.id });
      socket.emit('error', { message: 'Alert acknowledgment failed' });
    }
  }
  
  private handleDashboardJoin(socket: Socket, data: { dashboardId: string }): void {
    const { dashboardId } = data;
    const socketData = this.socketData.get(socket.id);
    
    if (!socketData) return;
    
    socket.join(`dashboard_collab:${dashboardId}`);
    
    // Broadcast user presence
    socket.to(`dashboard_collab:${dashboardId}`).emit('user_joined', {
      dashboardId,
      userId: socketData.userId,
      timestamp: new Date()
    });
    
    socket.emit('dashboard_joined', { dashboardId });
    
    logger.debug('User joined dashboard collaboration', { 
      socketId: socket.id, 
      dashboardId, 
      userId: socketData.userId 
    });
  }
  
  private handleDashboardLeave(socket: Socket, data: { dashboardId: string }): void {
    const { dashboardId } = data;
    const socketData = this.socketData.get(socket.id);
    
    if (!socketData) return;
    
    socket.leave(`dashboard_collab:${dashboardId}`);
    
    // Broadcast user leaving
    socket.to(`dashboard_collab:${dashboardId}`).emit('user_left', {
      dashboardId,
      userId: socketData.userId,
      timestamp: new Date()
    });
    
    socket.emit('dashboard_left', { dashboardId });
    
    logger.debug('User left dashboard collaboration', { 
      socketId: socket.id, 
      dashboardId, 
      userId: socketData.userId 
    });
  }
  
  private handleDashboardCursor(socket: Socket, data: { 
    dashboardId: string; 
    position: { x: number; y: number } 
  }): void {
    const { dashboardId, position } = data;
    const socketData = this.socketData.get(socket.id);
    
    if (!socketData) return;
    
    // Broadcast cursor position to other users in the dashboard
    socket.to(`dashboard_collab:${dashboardId}`).emit('cursor_update', {
      dashboardId,
      userId: socketData.userId,
      position,
      timestamp: new Date()
    });
  }
  
  private handleSystemHealthSubscription(socket: Socket): void {
    const socketData = this.socketData.get(socket.id);
    
    if (!socketData) {
      socket.emit('error', { message: 'Not authenticated' });
      return;
    }
    
    socketData.subscriptions.add('system_health');
    socket.join('system_health');
    
    socket.emit('system_health_subscribed');
    
    // Send initial system health data
    this.sendSystemHealthUpdate(socket, socketData.tenantId);
    
    logger.info('System health subscription created', { 
      socketId: socket.id, 
      userId: socketData.userId 
    });
  }
  
  private handleDisconnection(socket: Socket, reason: string): void {
    const socketData = this.socketData.get(socket.id);
    
    if (socketData) {
      // Clean up dashboard subscriptions
      for (const [dashboardId, subscriptions] of this.dashboardSubscriptions.entries()) {
        const index = subscriptions.findIndex(sub => sub.socketId === socket.id);
        if (index >= 0) {
          const subscription = subscriptions[index];
          
          // Clear all widget refresh intervals
          for (const timer of subscription.widgetRefreshIntervals.values()) {
            clearInterval(timer);
          }
          
          subscriptions.splice(index, 1);
          
          if (subscriptions.length === 0) {
            this.dashboardSubscriptions.delete(dashboardId);
          }
          
          // Broadcast user leaving dashboard collaboration
          socket.to(`dashboard_collab:${dashboardId}`).emit('user_left', {
            dashboardId,
            userId: socketData.userId,
            timestamp: new Date()
          });
        }
      }
      
      // Clean up metric subscriptions
      this.metricStreamSubscriptions.delete(socket.id);
      
      // Remove from socket data
      this.socketData.delete(socket.id);
    }
    
    logger.info('Analytics socket disconnected', { 
      socketId: socket.id, 
      reason, 
      userId: socketData?.userId 
    });
  }
  
  private setupWidgetRefresh(subscription: DashboardSubscription, widget: any): void {
    const { widgetId, refreshInterval = 30 } = widget;
    
    const timer = setInterval(async () => {
      try {
        const socket = this.io.sockets.sockets.get(subscription.socketId);
        if (socket) {
          const socketData = this.socketData.get(subscription.socketId);
          const widgetData = await this.getWidgetData(
            subscription.dashboardId, 
            widgetId, 
            socketData?.tenantId
          );
          
          socket.emit('widget_data', {
            dashboardId: subscription.dashboardId,
            widgetId,
            data: widgetData,
            timestamp: new Date()
          });
        }
      } catch (error) {
        logger.error('Widget refresh failed', { 
          error, 
          widgetId, 
          dashboardId: subscription.dashboardId 
        });
      }
    }, refreshInterval * 1000);
    
    subscription.widgetRefreshIntervals.set(widgetId, timer);
  }
  
  private async startMetricStream(socket: Socket, tenantId?: string): Promise<void> {
    const subscription = this.metricStreamSubscriptions.get(socket.id);
    
    if (!subscription || this.isDestroyed) return;
    
    const { queryEngine } = this.getAnalyticsServices(tenantId);
    
    const sendMetrics = async () => {
      try {
        // Check if subscription still exists and system isn't destroyed
        const currentSubscription = this.metricStreamSubscriptions.get(socket.id);
        if (!currentSubscription || this.isDestroyed) return;
        
        const realtimeValues = await queryEngine.queryRealtimeMetrics(currentSubscription.metricNames);
        
        // Check if socket is still connected
        if (socket.connected && !this.isDestroyed) {
          socket.emit('metrics_data', {
            metrics: realtimeValues,
            timestamp: new Date()
          });
          
          currentSubscription.lastSent = new Date();
        }
        
      } catch (error) {
        logger.error('Metric stream failed', { error, socketId: socket.id });
      }
    };
    
    // Send initial metrics immediately
    await sendMetrics();
    
    // Set up interval for continuous updates with proper cleanup tracking
    const timer = setInterval(sendMetrics, subscription.interval * 1000);
    subscription.timer = timer;
    this.cleanupTimers.add(timer);
    
    // Clean up timer on disconnect
    const cleanupTimer = () => {
      if (timer) {
        clearInterval(timer);
        this.cleanupTimers.delete(timer);
        if (subscription) {
          subscription.timer = undefined;
        }
      }
    };
    
    socket.once('disconnect', cleanupTimer);
  }
  
  private async getWidgetData(dashboardId: string, widgetId: string, tenantId?: string): Promise<any> {
    try {
      const { queryEngine } = this.getAnalyticsServices(tenantId);
      
      // Get widget configuration
      const query = `
        SELECT widgets FROM dashboard_configurations 
        WHERE id = $1 ${tenantId ? 'AND tenant_id = $2' : ''}
      `;
      
      const params = tenantId ? [dashboardId, tenantId] : [dashboardId];
      const [dashboard] = await this.db.query(query, params);
      
      if (!dashboard) return null;
      
      const widgets = JSON.parse(dashboard.widgets || '[]');
      const widget = widgets.find((w: any) => w.id === widgetId);
      
      if (!widget) return null;
      
      // Query data based on widget configuration
      const { dataQuery } = widget;
      
      let result;
      
      if (dataQuery.aggregation && dataQuery.aggregation !== 'none') {
        result = await queryEngine.queryAggregation(
          dataQuery.metric,
          dataQuery.aggregation,
          dataQuery.groupBy,
          dataQuery.filters
        );
      } else {
        result = await queryEngine.queryTimeSeries(
          dataQuery.metric,
          dataQuery.timeRange,
          '1h',
          dataQuery.filters
        );
      }
      
      return {
        widget: widget,
        data: result,
        lastUpdated: new Date()
      };
      
    } catch (error) {
      logger.error('Get widget data failed', { error, dashboardId, widgetId });
      return null;
    }
  }
  
  private async sendSystemHealthUpdate(socket: Socket, tenantId?: string): Promise<void> {
    try {
      const { realtimeService } = this.getAnalyticsServices(tenantId);
      
      const healthMetrics = await realtimeService.getSystemHealthMetrics();
      
      socket.emit('system_health_data', {
        data: healthMetrics,
        timestamp: new Date()
      });
      
    } catch (error) {
      logger.error('System health update failed', { error, socketId: socket.id });
    }
  }
  
  private setupAnalyticsEventListeners(serviceKey: string, services: any): void {
    const { alertManager, systemMetrics } = services;
    
    // Alert events
    alertManager.on('alert_triggered', (data: { alert: Alert; rule: any }) => {
      const tenantId = data.alert.tenantId;
      const room = tenantId ? `alerts:${tenantId}` : 'alerts:default';
      
      this.io.to(room).emit('alert_triggered', {
        alert: data.alert,
        rule: data.rule,
        timestamp: new Date()
      });
      
      logger.info('Alert broadcast', { 
        alertId: data.alert.id, 
        tenantId, 
        level: data.alert.level 
      });
    });
    
    alertManager.on('alert_resolved', (data: { alert: Alert; resolvedBy: string }) => {
      const tenantId = data.alert.tenantId;
      const room = tenantId ? `alerts:${tenantId}` : 'alerts:default';
      
      this.io.to(room).emit('alert_resolved', {
        alertId: data.alert.id,
        resolvedBy: data.resolvedBy,
        timestamp: new Date()
      });
    });
    
    // System metrics events
    systemMetrics.on('metric', (metric: SystemMetric) => {
      // Broadcast to system health subscribers
      this.io.to('system_health').emit('system_metric', {
        metric,
        timestamp: new Date()
      });
    });
    
    systemMetrics.on('health_check', (healthStatus: any) => {
      this.io.to('system_health').emit('health_status', {
        status: healthStatus,
        timestamp: new Date()
      });
    });
  }
  
  private startGlobalUpdates(): void {
    if (this.isDestroyed) return;
    
    // Global system metrics update every 30 seconds
    this.globalMetricsTimer = setInterval(async () => {
      if (this.isDestroyed) return;
      
      try {
        // Broadcast system-wide metrics to all subscribers
        for (const [serviceKey, services] of this.analyticsServices.entries()) {
          if (this.isDestroyed) break;
          
          const { realtimeService } = services;
          const tenantId = serviceKey === 'default' ? undefined : serviceKey;
          
          const healthMetrics = await realtimeService.getSystemHealthMetrics();
          
          if (!this.isDestroyed) {
            this.io.to('system_health').emit('global_health_update', {
              data: healthMetrics,
              tenantId,
              timestamp: new Date()
            });
          }
        }
      } catch (error) {
        if (!this.isDestroyed) {
          logger.error('Global metrics update failed', { error });
        }
      }
    }, ANALYTICS_CONSTANTS.REAL_TIME_UPDATE_INTERVAL);
    
    // Track global timer for cleanup
    if (this.globalMetricsTimer) {
      this.cleanupTimers.add(this.globalMetricsTimer);
    }
    
    // Presence and connection health check every 60 seconds
    this.presenceUpdateTimer = setInterval(() => {
      if (!this.isDestroyed) {
        this.updateConnectionHealth();
      }
    }, 60000);
    
    // Track presence timer for cleanup
    if (this.presenceUpdateTimer) {
      this.cleanupTimers.add(this.presenceUpdateTimer);
    }
    
    logger.info('Started global analytics updates', { 
      interval: ANALYTICS_CONSTANTS.REAL_TIME_UPDATE_INTERVAL 
    });
  }
  
  private updateConnectionHealth(): void {
    const now = Date.now();
    const staleThreshold = 5 * 60 * 1000; // 5 minutes
    
    for (const [socketId, socketData] of this.socketData.entries()) {
      if (now - socketData.lastActivity.getTime() > staleThreshold) {
        const socket = this.io.sockets.sockets.get(socketId);
        if (socket) {
          socket.disconnect(true);
        }
        this.socketData.delete(socketId);
      }
    }
  }
  
  // Public methods for external integration
  
  public broadcastDashboardUpdate(dashboardId: string, update: any): void {
    this.io.to(`dashboard:${dashboardId}`).emit('dashboard_updated', {
      dashboardId,
      update,
      timestamp: new Date()
    });
  }
  
  public broadcastMetricUpdate(metricUpdate: MetricUpdate): void {
    // Broadcast to relevant metric subscribers
    for (const [socketId, subscription] of this.metricStreamSubscriptions.entries()) {
      if (subscription.metricNames.includes(metricUpdate.metricName)) {
        const socket = this.io.sockets.sockets.get(socketId);
        if (socket) {
          socket.emit('metric_update', {
            update: metricUpdate,
            timestamp: new Date()
          });
        }
      }
    }
  }
  
  public broadcastAlert(alert: Alert, tenantId?: string): void {
    const room = tenantId ? `alerts:${tenantId}` : 'alerts:default';
    
    this.io.to(room).emit('alert_broadcast', {
      alert,
      timestamp: new Date()
    });
  }
  
  public getConnectedUsers(dashboardId?: string): string[] {
    if (dashboardId) {
      const subscriptions = this.dashboardSubscriptions.get(dashboardId) || [];
      return subscriptions.map(sub => sub.userId);
    }
    
    return Array.from(this.socketData.values()).map(data => data.userId);
  }
  
  public getConnectionStats(): {
    totalConnections: number;
    dashboardSubscriptions: number;
    metricSubscriptions: number;
    alertSubscriptions: number;
  } {
    const alertSubscriptions = Array.from(this.socketData.values())
      .filter(data => data.subscriptions.has('alerts')).length;
      
    const metricSubscriptions = this.metricStreamSubscriptions.size;
    
    const dashboardSubscriptions = Array.from(this.dashboardSubscriptions.values())
      .reduce((total, subs) => total + subs.length, 0);
    
    return {
      totalConnections: this.socketData.size,
      dashboardSubscriptions,
      metricSubscriptions,
      alertSubscriptions
    };
  }
  
  public async destroy(): Promise<void> {
    // Prevent further operations
    this.isDestroyed = true;
    
    // Clear all tracked timers first
    for (const timer of this.cleanupTimers) {
      clearInterval(timer);
    }
    this.cleanupTimers.clear();
    
    // Clear global timers
    if (this.globalMetricsTimer) {
      clearInterval(this.globalMetricsTimer);
      this.globalMetricsTimer = undefined;
    }
    
    if (this.presenceUpdateTimer) {
      clearInterval(this.presenceUpdateTimer);
      this.presenceUpdateTimer = undefined;
    }
    
    // Clear all widget refresh timers
    for (const subscriptions of this.dashboardSubscriptions.values()) {
      for (const subscription of subscriptions) {
        for (const timer of subscription.widgetRefreshIntervals.values()) {
          clearInterval(timer);
        }
        subscription.widgetRefreshIntervals.clear();
      }
    }
    
    // Clear metric subscription timers
    for (const subscription of this.metricStreamSubscriptions.values()) {
      if (subscription.timer) {
        clearInterval(subscription.timer);
        subscription.timer = undefined;
      }
    }
    
    // Destroy analytics services with error handling
    const destroyPromises: Promise<void>[] = [];
    
    for (const services of this.analyticsServices.values()) {
      if (services.systemMetrics && typeof services.systemMetrics.destroy === 'function') {
        destroyPromises.push(
          services.systemMetrics.destroy().catch(err => 
            logger.error('Failed to destroy system metrics', { error: err })
          )
        );
      }
      if (services.realtimeService && typeof services.realtimeService.destroy === 'function') {
        destroyPromises.push(
          services.realtimeService.destroy().catch(err => 
            logger.error('Failed to destroy realtime service', { error: err })
          )
        );
      }
      if (services.queryEngine && typeof services.queryEngine.destroy === 'function') {
        destroyPromises.push(
          services.queryEngine.destroy().catch(err => 
            logger.error('Failed to destroy query engine', { error: err })
          )
        );
      }
      if (services.alertManager && typeof services.alertManager.destroy === 'function') {
        destroyPromises.push(
          services.alertManager.destroy().catch(err => 
            logger.error('Failed to destroy alert manager', { error: err })
          )
        );
      }
    }
    
    // Wait for all destroy operations to complete
    await Promise.allSettled(destroyPromises);
    
    // Clear all data structures
    this.socketData.clear();
    this.dashboardSubscriptions.clear();
    this.metricStreamSubscriptions.clear();
    this.analyticsServices.clear();
    
    // Remove all event listeners
    this.removeAllListeners();
    
    logger.info('Analytics socket handler destroyed');
  }
}

export default AnalyticsSocketHandler;