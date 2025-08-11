import {
  DashboardConfiguration,
  DashboardWidget,
  DashboardWidgetConfig,
  DataQuery,
  RealtimeMetricValue,
  MetricUpdate,
  Alert,
  TimeRange,
  FilterCondition
} from '@shared/types';

// Frontend-specific analytics types
export interface DashboardProps {
  dashboardId?: string;
  isEditable?: boolean;
  onDashboardChange?: (dashboard: DashboardConfiguration) => void;
  className?: string;
}

export interface WidgetProps {
  widget: DashboardWidget;
  data?: WidgetData;
  isLoading?: boolean;
  error?: string;
  onEdit?: (widget: DashboardWidget) => void;
  onDelete?: (widgetId: string) => void;
  onRefresh?: (widgetId: string) => void;
  isEditable?: boolean;
  className?: string;
}

export interface WidgetData {
  labels?: string[];
  datasets: WidgetDataset[];
  metadata?: Record<string, any>;
  lastUpdated?: Date;
  queryTime?: number;
}

export interface WidgetDataset {
  name: string;
  data: number[];
  color?: string;
  unit?: string;
  type?: 'line' | 'bar' | 'area';
}

export interface ChartProps {
  data: WidgetData;
  config: DashboardWidgetConfig;
  height?: number;
  width?: number;
  className?: string;
  onDataPointClick?: (dataPoint: any, dataset: WidgetDataset) => void;
}

export interface GridLayoutItem {
  i: string; // widget ID
  x: number;
  y: number;
  w: number; // width in grid units
  h: number; // height in grid units
  minW?: number;
  minH?: number;
  maxW?: number;
  maxH?: number;
  static?: boolean;
  isDraggable?: boolean;
  isResizable?: boolean;
}

export interface DashboardLayout {
  lg: GridLayoutItem[];
  md: GridLayoutItem[];
  sm: GridLayoutItem[];
  xs: GridLayoutItem[];
  xxs: GridLayoutItem[];
}

export interface AlertNotification {
  id: string;
  alert: Alert;
  timestamp: Date;
  isRead: boolean;
  dismissed?: boolean;
}

export interface ConnectionState {
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
  latency?: number;
  lastPing?: Date;
  reconnectAttempts?: number;
  error?: string;
}

export interface RealtimeSubscription {
  type: 'dashboard' | 'widget' | 'metrics' | 'alerts' | 'system_health';
  id: string;
  active: boolean;
  lastUpdate?: Date;
  errorCount?: number;
}

// Widget template types
export interface WidgetTemplate {
  id: string;
  name: string;
  description: string;
  type: DashboardWidget['type'];
  category: 'collaboration' | 'performance' | 'engagement' | 'system' | 'custom';
  tags: string[];
  preview?: string;
  defaultConfig: DashboardWidgetConfig;
  defaultQuery: DataQuery;
  customizable: {
    timeRange: boolean;
    metrics: boolean;
    filters: boolean;
    groupBy: boolean;
  };
}

// Form types
export interface DashboardFormData {
  name: string;
  description?: string;
  isPublic: boolean;
  sharedWithUsers: string[];
  sharedWithWorkspaces: string[];
  refreshIntervalSeconds: number;
  autoRefreshEnabled: boolean;
}

export interface WidgetFormData {
  title: string;
  description?: string;
  type: DashboardWidget['type'];
  config: DashboardWidgetConfig;
  dataQuery: DataQuery;
  refreshInterval: number;
}

export interface AlertRuleFormData {
  name: string;
  description?: string;
  condition: {
    type: 'threshold' | 'anomaly' | 'rate_of_change';
    metric: string;
    operator?: 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'ne';
    threshold?: number;
    sensitivity?: number;
    timeWindow?: number;
    evaluationInterval: number;
  };
  actions: Array<{
    type: 'email' | 'slack' | 'webhook' | 'dashboard';
    target: string;
    template?: string;
  }>;
  isEnabled: boolean;
}

// API response types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  meta?: Record<string, any>;
  error?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  meta: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

// Socket event types
export interface SocketEvents {
  // Connection events
  authenticated: { userId: string; tenantId?: string; timestamp: Date };
  auth_error: { message: string };
  
  // Dashboard events
  dashboard_subscribed: { dashboardId: string; dashboard: any };
  dashboard_updated: { dashboardId: string; update: any; timestamp: Date };
  dashboard_created: { dashboard: DashboardConfiguration; userId: string };
  dashboard_deleted: { dashboardId: string; userId: string };
  
  // Widget events
  widget_data: { dashboardId: string; widgetId: string; data: WidgetData; timestamp: Date };
  widget_subscribed: { dashboardId: string; widgetId: string; refreshInterval: number };
  
  // Metrics events
  metrics_data: { metrics: RealtimeMetricValue[]; timestamp: Date };
  metric_update: { update: MetricUpdate; timestamp: Date };
  
  // Alert events
  alert_triggered: { alert: Alert; rule: any; timestamp: Date };
  alert_acknowledged: { alertId: string; acknowledgedBy: string; notes?: string; timestamp: Date };
  alert_resolved: { alertId: string; resolvedBy: string; resolution: string; timestamp: Date };
  
  // System health events
  system_health_data: { data: any; timestamp: Date };
  health_status: { status: any; timestamp: Date };
  
  // Collaboration events
  user_joined: { dashboardId: string; userId: string; timestamp: Date };
  user_left: { dashboardId: string; userId: string; timestamp: Date };
  cursor_update: { dashboardId: string; userId: string; position: { x: number; y: number }; timestamp: Date };
  
  // General events
  error: { message: string; details?: any };
  event_tracked: { eventType: string; timestamp: Date };
}

// Context types
export interface AnalyticsContextValue {
  // Dashboard state
  currentDashboard?: DashboardConfiguration;
  dashboards: DashboardConfiguration[];
  isLoadingDashboards: boolean;
  dashboardError?: string;
  
  // Connection state
  connectionState: ConnectionState;
  subscriptions: RealtimeSubscription[];
  
  // Alert state
  alerts: AlertNotification[];
  unreadAlertCount: number;
  
  // Actions
  loadDashboard: (dashboardId: string) => Promise<void>;
  saveDashboard: (dashboard: DashboardConfiguration) => Promise<void>;
  deleteDashboard: (dashboardId: string) => Promise<void>;
  subscribeToWidget: (dashboardId: string, widgetId: string, refreshInterval?: number) => void;
  unsubscribeFromWidget: (dashboardId: string, widgetId: string) => void;
  acknowledgeAlert: (alertId: string, notes?: string) => Promise<void>;
  trackEvent: (eventType: string, eventData: any) => void;
}

// Theme and styling
export interface ChartTheme {
  primaryColor: string;
  secondaryColor: string;
  backgroundColor: string;
  textColor: string;
  gridColor: string;
  fontFamily: string;
  fontSize: number;
}

export interface DashboardTheme {
  name: string;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    surface: string;
    text: string;
    border: string;
    success: string;
    warning: string;
    error: string;
    info: string;
  };
  spacing: {
    xs: string;
    sm: string;
    md: string;
    lg: string;
    xl: string;
  };
  borderRadius: string;
  shadows: {
    sm: string;
    md: string;
    lg: string;
  };
}

// Utility types
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type RequiredExcept<T, K extends keyof T> = Required<Omit<T, K>> & Pick<T, K>;

export type OptionalExcept<T, K extends keyof T> = Partial<Omit<T, K>> & Required<Pick<T, K>>;

// Error types
export class AnalyticsError extends Error {
  constructor(
    message: string,
    public code?: string,
    public details?: any
  ) {
    super(message);
    this.name = 'AnalyticsError';
  }
}

export class ConnectionError extends AnalyticsError {
  constructor(message: string, details?: any) {
    super(message, 'CONNECTION_ERROR', details);
    this.name = 'ConnectionError';
  }
}

export class ValidationError extends AnalyticsError {
  constructor(message: string, details?: any) {
    super(message, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
  }
}