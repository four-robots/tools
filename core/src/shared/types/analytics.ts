import { z } from 'zod';

// Base analytics event schema
export const AnalyticsEventSchema = z.object({
  id: z.string().uuid().optional(),
  userId: z.string().uuid().nullable().optional(),
  sessionId: z.string().optional(),
  eventType: z.enum(['page_view', 'action', 'feature_use', 'error', 'performance']),
  eventCategory: z.enum(['kanban', 'wiki', 'memory', 'auth', 'dashboard', 'system']),
  eventAction: z.string().min(1).max(100),
  eventLabel: z.string().max(255).optional(),
  properties: z.record(z.any()).default({}),
  pageUrl: z.string().url().optional(),
  referrer: z.string().url().optional(),
  userAgent: z.string().optional(),
  ipAddress: z.string().optional(),
  loadTime: z.number().int().positive().optional(),
  interactionTime: z.number().int().positive().optional(),
  boardId: z.string().uuid().optional(),
  pageId: z.string().uuid().optional(),
  memoryId: z.string().uuid().optional(),
  createdAt: z.date().optional(),
});

export type AnalyticsEvent = z.infer<typeof AnalyticsEventSchema>;

// User analytics daily summary
export const UserAnalyticsSchema = z.object({
  id: z.string().uuid().optional(),
  userId: z.string().uuid(),
  date: z.date(),
  sessionCount: z.number().int().min(0).default(0),
  totalSessionDuration: z.number().int().min(0).default(0),
  avgSessionDuration: z.number().min(0).default(0),
  actionsPerformed: z.number().int().min(0).default(0),
  pagesVisited: z.number().int().min(0).default(0),
  featuresUsed: z.array(z.string()).default([]),
  tasksCreated: z.number().int().min(0).default(0),
  tasksCompleted: z.number().int().min(0).default(0),
  tasksMoved: z.number().int().min(0).default(0),
  wikiPagesCreated: z.number().int().min(0).default(0),
  wikiPagesEdited: z.number().int().min(0).default(0),
  memoriesStored: z.number().int().min(0).default(0),
  searchesPerformed: z.number().int().min(0).default(0),
  boardsShared: z.number().int().min(0).default(0),
  commentsAdded: z.number().int().min(0).default(0),
  realTimeSessions: z.number().int().min(0).default(0),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export type UserAnalytics = z.infer<typeof UserAnalyticsSchema>;

// System-wide analytics
export const SystemAnalyticsSchema = z.object({
  id: z.string().uuid().optional(),
  date: z.date(),
  dailyActiveUsers: z.number().int().min(0).default(0),
  newUserRegistrations: z.number().int().min(0).default(0),
  userRetentionRate: z.number().min(0).max(100).default(0),
  avgApiResponseTime: z.number().min(0).default(0),
  totalApiRequests: z.number().int().min(0).default(0),
  errorRate: z.number().min(0).max(100).default(0),
  websocketConnections: z.number().int().min(0).default(0),
  kanbanBoardsCreated: z.number().int().min(0).default(0),
  wikiPagesCreated: z.number().int().min(0).default(0),
  memoriesStored: z.number().int().min(0).default(0),
  realTimeCollaborations: z.number().int().min(0).default(0),
  databaseQueries: z.number().int().min(0).default(0),
  cacheHitRate: z.number().min(0).max(100).default(0),
  storageUsedMb: z.number().min(0).default(0),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export type SystemAnalytics = z.infer<typeof SystemAnalyticsSchema>;

// Performance metrics
export const PerformanceMetricSchema = z.object({
  id: z.string().uuid().optional(),
  metricType: z.enum(['api_response', 'db_query', 'websocket', 'page_load', 'feature_interaction']),
  endpoint: z.string().max(255).optional(),
  responseTimeMs: z.number().int().positive(),
  startTime: z.date(),
  endTime: z.date(),
  method: z.string().max(10).optional(),
  statusCode: z.number().int().optional(),
  userId: z.string().uuid().optional(),
  metadata: z.record(z.any()).default({}),
  errorMessage: z.string().optional(),
  createdAt: z.date().optional(),
});

export type PerformanceMetric = z.infer<typeof PerformanceMetricSchema>;

// Productivity insights
export const ProductivityInsightSchema = z.object({
  id: z.string().uuid().optional(),
  userId: z.string().uuid(),
  insightType: z.enum(['peak_hours', 'task_patterns', 'collaboration_style', 'productivity_trends', 'feature_usage']),
  title: z.string().min(1).max(255),
  description: z.string().min(1),
  recommendation: z.string().optional(),
  confidenceScore: z.number().min(0).max(1).default(0),
  dataPoints: z.record(z.any()).default({}),
  timePeriodStart: z.date().optional(),
  timePeriodEnd: z.date().optional(),
  isActive: z.boolean().default(true),
  isRead: z.boolean().default(false),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export type ProductivityInsight = z.infer<typeof ProductivityInsightSchema>;

// Analytics dashboard data
export const DashboardMetricsSchema = z.object({
  user: z.object({
    totalTasks: z.number().int().min(0),
    completedTasks: z.number().int().min(0),
    completionRate: z.number().min(0).max(100),
    wikiPages: z.number().int().min(0),
    memories: z.number().int().min(0),
    activeDays: z.number().int().min(0),
    avgSessionDuration: z.number().min(0),
    lastActivity: z.date().optional(),
  }),
  productivity: z.object({
    todayTasks: z.number().int().min(0),
    weekTasks: z.number().int().min(0),
    monthTasks: z.number().int().min(0),
    streakDays: z.number().int().min(0),
    peakHours: z.array(z.number().int().min(0).max(23)),
    topFeatures: z.array(z.string()),
  }),
  system: z.object({
    totalUsers: z.number().int().min(0),
    activeToday: z.number().int().min(0),
    avgResponseTime: z.number().min(0),
    errorRate: z.number().min(0).max(100),
    uptime: z.number().min(0).max(100),
  }),
  insights: z.array(ProductivityInsightSchema),
});

export type DashboardMetrics = z.infer<typeof DashboardMetricsSchema>;

// Analytics API requests
export const AnalyticsQuerySchema = z.object({
  timeRange: z.enum(['today', 'week', 'month', 'quarter', 'year', 'custom']).default('week'),
  startDate: z.date().optional(),
  endDate: z.date().optional(),
  userId: z.string().uuid().optional(),
  eventType: z.string().optional(),
  eventCategory: z.string().optional(),
  groupBy: z.enum(['hour', 'day', 'week', 'month']).default('day'),
  limit: z.number().int().positive().max(1000).default(100),
  offset: z.number().int().min(0).default(0),
});

export type AnalyticsQuery = z.infer<typeof AnalyticsQuerySchema>;

// Event tracking helpers
export const TrackEventRequestSchema = z.object({
  eventType: AnalyticsEventSchema.shape.eventType,
  eventCategory: AnalyticsEventSchema.shape.eventCategory,
  eventAction: AnalyticsEventSchema.shape.eventAction,
  eventLabel: AnalyticsEventSchema.shape.eventLabel.optional(),
  properties: AnalyticsEventSchema.shape.properties.optional(),
  loadTime: AnalyticsEventSchema.shape.loadTime.optional(),
  interactionTime: AnalyticsEventSchema.shape.interactionTime.optional(),
  boardId: AnalyticsEventSchema.shape.boardId.optional(),
  pageId: AnalyticsEventSchema.shape.pageId.optional(),
  memoryId: AnalyticsEventSchema.shape.memoryId.optional(),
});

export type TrackEventRequest = z.infer<typeof TrackEventRequestSchema>;

// Time series data for charts
export const TimeSeriesDataPointSchema = z.object({
  timestamp: z.date(),
  value: z.number(),
  label: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

export type TimeSeriesDataPoint = z.infer<typeof TimeSeriesDataPointSchema>;

export const TimeSeriesDataSchema = z.object({
  name: z.string(),
  data: z.array(TimeSeriesDataPointSchema),
  color: z.string().optional(),
  unit: z.string().optional(),
});

export type TimeSeriesData = z.infer<typeof TimeSeriesDataSchema>;

// Chart configuration
export const ChartConfigSchema = z.object({
  type: z.enum(['line', 'bar', 'pie', 'area', 'scatter', 'heatmap']),
  title: z.string(),
  xAxisLabel: z.string().optional(),
  yAxisLabel: z.string().optional(),
  series: z.array(TimeSeriesDataSchema),
  height: z.number().int().positive().default(400),
  showLegend: z.boolean().default(true),
  showGrid: z.boolean().default(true),
  animation: z.boolean().default(true),
});

export type ChartConfig = z.infer<typeof ChartConfigSchema>;

// Export all schemas for validation
export const AnalyticsSchemas = {
  AnalyticsEvent: AnalyticsEventSchema,
  UserAnalytics: UserAnalyticsSchema,
  SystemAnalytics: SystemAnalyticsSchema,
  PerformanceMetric: PerformanceMetricSchema,
  ProductivityInsight: ProductivityInsightSchema,
  DashboardMetrics: DashboardMetricsSchema,
  AnalyticsQuery: AnalyticsQuerySchema,
  TrackEventRequest: TrackEventRequestSchema,
  TimeSeriesDataPoint: TimeSeriesDataPointSchema,
  TimeSeriesData: TimeSeriesDataSchema,
  ChartConfig: ChartConfigSchema,
  
  // Real-time dashboard schemas
  DashboardWidgetConfig: DashboardWidgetConfigSchema,
  DataQuery: DataQuerySchema,
  DashboardWidget: DashboardWidgetSchema,
  DashboardConfiguration: DashboardConfigurationSchema,
  MetricValue: MetricValueSchema,
  StreamMetric: StreamMetricSchema,
  CollaborationEvent: CollaborationEventSchema,
  SystemMetric: SystemMetricSchema,
  UserActivity: UserActivitySchema,
  TimeWindow: TimeWindowSchema,
  AggregationResult: AggregationResultSchema,
  AlertCondition: AlertConditionSchema,
  AlertAction: AlertActionSchema,
  AlertRule: AlertRuleSchema,
  Alert: AlertSchema,
  RealtimeMetricValue: RealtimeMetricValueSchema,
  MetricUpdate: MetricUpdateSchema,
  CollaborationMetrics: CollaborationMetricsSchema,
  UserEngagementMetrics: UserEngagementMetricsSchema,
  SystemHealthMetrics: SystemHealthMetricsSchema,
  AlertMetrics: AlertMetricsSchema,
  UserJourney: UserJourneySchema,
  CollaborationPattern: CollaborationPatternSchema,
  Anomaly: AnomalySchema,
  ReportConfig: ReportConfigSchema,
  Report: ReportSchema,
  TimeRange: TimeRangeSchema,
  FilterCondition: FilterConditionSchema,
  AnalyticsQueryEngine: AnalyticsQueryEngineSchema,
  WidgetData: WidgetDataSchema,
};

// Utility types for analytics
export type AnalyticsMetricType = 'tasks' | 'wiki' | 'memory' | 'collaboration' | 'performance';
export type AnalyticsTimeframe = 'hour' | 'day' | 'week' | 'month' | 'quarter' | 'year';
export type AnalyticsAggregation = 'sum' | 'avg' | 'count' | 'min' | 'max' | 'percentile';

// Real-time analytics dashboard types
export const DashboardWidgetConfigSchema = z.object({
  chartType: z.enum(['line', 'bar', 'pie', 'gauge', 'number', 'table', 'heatmap']).optional(),
  timeRange: z.object({
    start: z.date(),
    end: z.date(),
    preset: z.enum(['1h', '4h', '24h', '7d', '30d', 'custom']).optional(),
  }),
  dimensions: z.array(z.string()).optional(),
  filters: z.array(z.object({
    field: z.string(),
    operator: z.enum(['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'in', 'not_in', 'contains']),
    value: z.any(),
  })).optional(),
  aggregation: z.enum(['sum', 'avg', 'count', 'min', 'max', 'p50', 'p95', 'p99']).optional(),
  groupBy: z.array(z.string()).optional(),
});

export type DashboardWidgetConfig = z.infer<typeof DashboardWidgetConfigSchema>;

export const DataQuerySchema = z.object({
  metric: z.string(),
  aggregation: z.enum(['sum', 'avg', 'count', 'min', 'max', 'p50', 'p95', 'p99']),
  timeRange: DashboardWidgetConfigSchema.shape.timeRange,
  filters: DashboardWidgetConfigSchema.shape.filters.optional(),
  groupBy: z.array(z.string()).optional(),
  limit: z.number().int().positive().max(10000).optional(),
});

export type DataQuery = z.infer<typeof DataQuerySchema>;

export const DashboardWidgetSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(['metric_card', 'time_series', 'bar_chart', 'pie_chart', 'gauge', 'data_table', 'heatmap', 'alert_panel']),
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  config: DashboardWidgetConfigSchema,
  dataQuery: DataQuerySchema,
  position: z.object({
    x: z.number().int().min(0),
    y: z.number().int().min(0),
    width: z.number().int().min(1),
    height: z.number().int().min(1),
  }),
  refreshInterval: z.number().int().min(5).max(3600).default(30), // 5 seconds to 1 hour
  isVisible: z.boolean().default(true),
});

export type DashboardWidget = z.infer<typeof DashboardWidgetSchema>;

export const DashboardConfigurationSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  layout: z.object({
    columns: z.number().int().min(1).max(24).default(12),
    rowHeight: z.number().int().min(10).default(150),
    margin: z.tuple([z.number(), z.number()]).default([10, 10]),
  }),
  widgets: z.array(DashboardWidgetSchema),
  ownerId: z.string().uuid(),
  sharedWithUsers: z.array(z.string().uuid()).default([]),
  sharedWithWorkspaces: z.array(z.string().uuid()).default([]),
  isPublic: z.boolean().default(false),
  refreshIntervalSeconds: z.number().int().min(10).max(3600).default(30),
  autoRefreshEnabled: z.boolean().default(true),
  tenantId: z.string().uuid().optional(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export type DashboardConfiguration = z.infer<typeof DashboardConfigurationSchema>;

// Real-time metrics and streaming types
export const MetricValueSchema = z.object({
  value: z.number(),
  timestamp: z.date(),
  dimensions: z.record(z.string(), z.any()).optional(),
});

export type MetricValue = z.infer<typeof MetricValueSchema>;

export const StreamMetricSchema = z.object({
  name: z.string(),
  type: z.enum(['gauge', 'counter', 'histogram', 'summary']),
  value: z.number(),
  dimensions: z.record(z.string(), z.any()).default({}),
  timestamp: z.date().default(() => new Date()),
  tenantId: z.string().uuid().optional(),
  workspaceId: z.string().uuid().optional(),
});

export type StreamMetric = z.infer<typeof StreamMetricSchema>;

export const CollaborationEventSchema = z.object({
  sessionId: z.string().uuid(),
  eventType: z.enum(['session_start', 'user_join', 'user_leave', 'content_modification', 'conflict_detected', 'conflict_resolved']),
  userId: z.string().uuid(),
  resourceType: z.enum(['kanban', 'wiki', 'memory', 'search']),
  resourceId: z.string().uuid(),
  metadata: z.record(z.any()).default({}),
  timestamp: z.date().default(() => new Date()),
  tenantId: z.string().uuid().optional(),
  workspaceId: z.string().uuid().optional(),
});

export type CollaborationEvent = z.infer<typeof CollaborationEventSchema>;

export const SystemMetricSchema = z.object({
  serviceName: z.string(),
  serviceInstance: z.string().optional(),
  metricType: z.enum(['cpu', 'memory', 'disk', 'network', 'database', 'websocket', 'api_response']),
  metricName: z.string(),
  value: z.number(),
  unit: z.string().optional(),
  metadata: z.record(z.any()).default({}),
  timestamp: z.date().default(() => new Date()),
});

export type SystemMetric = z.infer<typeof SystemMetricSchema>;

export const UserActivitySchema = z.object({
  userId: z.string().uuid(),
  sessionId: z.string().uuid(),
  activityType: z.enum(['page_view', 'click', 'input', 'scroll', 'feature_use', 'collaboration']),
  feature: z.string().optional(),
  duration: z.number().int().min(0).optional(),
  metadata: z.record(z.any()).default({}),
  timestamp: z.date().default(() => new Date()),
  tenantId: z.string().uuid().optional(),
});

export type UserActivity = z.infer<typeof UserActivitySchema>;

// Time window and aggregation types
export const TimeWindowSchema = z.object({
  id: z.string(),
  windowSize: z.number().int().min(1), // in seconds
  slideInterval: z.number().int().min(1), // in seconds
  startTime: z.date(),
  endTime: z.date(),
});

export type TimeWindow = z.infer<typeof TimeWindowSchema>;

export const AggregationResultSchema = z.object({
  metric: z.string(),
  aggregationType: z.enum(['sum', 'avg', 'count', 'min', 'max', 'p50', 'p95', 'p99']),
  value: z.number(),
  timestamp: z.date(),
  dimensions: z.record(z.string(), z.any()).optional(),
  windowId: z.string().optional(),
});

export type AggregationResult = z.infer<typeof AggregationResultSchema>;

// Alert types
export const AlertConditionSchema = z.object({
  type: z.enum(['threshold', 'anomaly', 'rate_of_change']),
  metric: z.string(),
  operator: z.enum(['gt', 'gte', 'lt', 'lte', 'eq', 'ne']).optional(),
  threshold: z.number().optional(),
  sensitivity: z.number().min(0).max(1).optional(), // for anomaly detection
  timeWindow: z.number().int().min(60).optional(), // in seconds
  evaluationInterval: z.number().int().min(30).default(60), // in seconds
});

export type AlertCondition = z.infer<typeof AlertConditionSchema>;

export const AlertActionSchema = z.object({
  type: z.enum(['email', 'slack', 'webhook', 'dashboard']),
  target: z.string(), // email, slack channel, webhook URL, etc.
  template: z.string().optional(),
  escalationDelay: z.number().int().min(0).optional(), // in seconds
});

export type AlertAction = z.infer<typeof AlertActionSchema>;

export const AlertRuleSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  condition: AlertConditionSchema,
  actions: z.array(AlertActionSchema),
  isEnabled: z.boolean().default(true),
  tenantId: z.string().uuid().optional(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export type AlertRule = z.infer<typeof AlertRuleSchema>;

export const AlertSchema = z.object({
  id: z.string().uuid().optional(),
  ruleId: z.string().uuid(),
  level: z.enum(['info', 'warning', 'critical']),
  title: z.string(),
  message: z.string(),
  currentValue: z.number(),
  thresholdValue: z.number().optional(),
  status: z.enum(['active', 'acknowledged', 'resolved']).default('active'),
  acknowledgedBy: z.string().uuid().optional(),
  acknowledgedAt: z.date().optional(),
  resolvedBy: z.string().uuid().optional(),
  resolvedAt: z.date().optional(),
  triggeredAt: z.date().default(() => new Date()),
  tenantId: z.string().uuid().optional(),
});

export type Alert = z.infer<typeof AlertSchema>;

// Real-time dashboard data types
export const RealtimeMetricValueSchema = z.object({
  name: z.string(),
  value: z.number(),
  timestamp: z.date(),
  change: z.number().optional(), // percentage change
  trend: z.enum(['up', 'down', 'stable']).optional(),
  unit: z.string().optional(),
});

export type RealtimeMetricValue = z.infer<typeof RealtimeMetricValueSchema>;

export const MetricUpdateSchema = z.object({
  metricName: z.string(),
  value: z.number(),
  timestamp: z.date(),
  dashboardId: z.string().uuid().optional(),
  widgetId: z.string().uuid().optional(),
});

export type MetricUpdate = z.infer<typeof MetricUpdateSchema>;

// Collaboration and user engagement metrics
export const CollaborationMetricsSchema = z.object({
  activeSessions: z.number().int().min(0),
  totalParticipants: z.number().int().min(0),
  avgSessionDuration: z.number().min(0),
  conflictsDetected: z.number().int().min(0),
  conflictsResolved: z.number().int().min(0),
  avgResolutionTime: z.number().min(0),
  topCollaborativeFeatures: z.array(z.object({
    feature: z.string(),
    usageCount: z.number().int().min(0),
  })),
});

export type CollaborationMetrics = z.infer<typeof CollaborationMetricsSchema>;

export const UserEngagementMetricsSchema = z.object({
  activeUsers: z.number().int().min(0),
  newUsers: z.number().int().min(0),
  returningUsers: z.number().int().min(0),
  avgSessionDuration: z.number().min(0),
  avgInteractionsPerSession: z.number().min(0),
  topFeatures: z.array(z.object({
    feature: z.string(),
    usageCount: z.number().int().min(0),
    uniqueUsers: z.number().int().min(0),
  })),
  retentionRate: z.number().min(0).max(100),
});

export type UserEngagementMetrics = z.infer<typeof UserEngagementMetricsSchema>;

export const SystemHealthMetricsSchema = z.object({
  uptime: z.number().min(0).max(100), // percentage
  avgResponseTime: z.number().min(0),
  errorRate: z.number().min(0).max(100), // percentage
  activeConnections: z.number().int().min(0),
  databaseConnections: z.number().int().min(0),
  memoryUsage: z.number().min(0).max(100), // percentage
  cpuUsage: z.number().min(0).max(100), // percentage
  diskUsage: z.number().min(0).max(100), // percentage
  services: z.array(z.object({
    name: z.string(),
    status: z.enum(['healthy', 'degraded', 'unhealthy']),
    responseTime: z.number().min(0),
  })),
});

export type SystemHealthMetrics = z.infer<typeof SystemHealthMetricsSchema>;

export const AlertMetricsSchema = z.object({
  activeAlerts: z.number().int().min(0),
  alertsByLevel: z.object({
    info: z.number().int().min(0),
    warning: z.number().int().min(0),
    critical: z.number().int().min(0),
  }),
  avgResolutionTime: z.number().min(0),
  escalatedAlerts: z.number().int().min(0),
  recentAlerts: z.array(AlertSchema),
});

export type AlertMetrics = z.infer<typeof AlertMetricsSchema>;

// User journey and pattern analysis
export const UserJourneySchema = z.object({
  userId: z.string().uuid(),
  sessionId: z.string().uuid(),
  steps: z.array(z.object({
    timestamp: z.date(),
    action: z.string(),
    feature: z.string(),
    duration: z.number().int().min(0),
    metadata: z.record(z.any()).optional(),
  })),
  totalDuration: z.number().int().min(0),
  completedGoals: z.array(z.string()),
  dropOffPoint: z.string().optional(),
});

export type UserJourney = z.infer<typeof UserJourneySchema>;

export const CollaborationPatternSchema = z.object({
  pattern: z.string(),
  frequency: z.number().int().min(0),
  participants: z.array(z.string().uuid()),
  avgDuration: z.number().min(0),
  successRate: z.number().min(0).max(100),
  commonActions: z.array(z.string()),
});

export type CollaborationPattern = z.infer<typeof CollaborationPatternSchema>;

export const AnomalySchema = z.object({
  id: z.string().uuid().optional(),
  metric: z.string(),
  detectedAt: z.date(),
  severity: z.enum(['low', 'medium', 'high']),
  description: z.string(),
  expectedValue: z.number(),
  actualValue: z.number(),
  confidence: z.number().min(0).max(1),
  metadata: z.record(z.any()).optional(),
});

export type Anomaly = z.infer<typeof AnomalySchema>;

// Report generation types
export const ReportConfigSchema = z.object({
  name: z.string().min(1).max(255),
  type: z.enum(['daily', 'weekly', 'monthly', 'custom']),
  metrics: z.array(z.string()),
  timeRange: DashboardWidgetConfigSchema.shape.timeRange,
  filters: DashboardWidgetConfigSchema.shape.filters.optional(),
  format: z.enum(['pdf', 'excel', 'csv', 'json']),
  recipients: z.array(z.string().email()).optional(),
  schedule: z.string().optional(), // cron expression
  tenantId: z.string().uuid().optional(),
  workspaceId: z.string().uuid().optional(),
});

export type ReportConfig = z.infer<typeof ReportConfigSchema>;

export const ReportSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string(),
  config: ReportConfigSchema,
  generatedAt: z.date().default(() => new Date()),
  data: z.record(z.any()),
  summary: z.object({
    totalMetrics: z.number().int().min(0),
    keyFindings: z.array(z.string()),
    recommendations: z.array(z.string()).optional(),
  }),
  fileUrl: z.string().url().optional(),
});

export type Report = z.infer<typeof ReportSchema>;

// Enhanced analytics query types
export const TimeRangeSchema = z.object({
  start: z.date(),
  end: z.date(),
  preset: z.enum(['1h', '4h', '24h', '7d', '30d', 'custom']).optional(),
});

export type TimeRange = z.infer<typeof TimeRangeSchema>;

export const FilterConditionSchema = z.object({
  field: z.string(),
  operator: z.enum(['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'in', 'not_in', 'contains', 'starts_with', 'ends_with']),
  value: z.any(),
});

export type FilterCondition = z.infer<typeof FilterConditionSchema>;

export const AnalyticsQueryEngineSchema = z.object({
  metric: z.string(),
  aggregation: z.enum(['sum', 'avg', 'count', 'min', 'max', 'p50', 'p95', 'p99']),
  timeRange: TimeRangeSchema,
  granularity: z.enum(['1m', '5m', '1h', '1d']).optional(),
  filters: z.array(FilterConditionSchema).optional(),
  groupBy: z.array(z.string()).optional(),
  limit: z.number().int().positive().max(10000).optional(),
  offset: z.number().int().min(0).optional(),
});

export type AnalyticsQueryEngine = z.infer<typeof AnalyticsQueryEngineSchema>;

// Widget-specific types
export const WidgetDataSchema = z.object({
  labels: z.array(z.string()).optional(),
  datasets: z.array(z.object({
    name: z.string(),
    data: z.array(z.number()),
    color: z.string().optional(),
    unit: z.string().optional(),
  })),
  metadata: z.record(z.any()).optional(),
});

export type WidgetData = z.infer<typeof WidgetDataSchema>;

// Constants for analytics
export const ANALYTICS_CONSTANTS = {
  MAX_EVENT_BATCH_SIZE: 100,
  MAX_QUERY_LIMIT: 1000,
  DEFAULT_RETENTION_DAYS: 365,
  REAL_TIME_UPDATE_INTERVAL: 30000, // 30 seconds
  CACHE_TTL: 300, // 5 minutes
  INSIGHT_CONFIDENCE_THRESHOLD: 0.7,
  MAX_DASHBOARD_WIDGETS: 50,
  MAX_ALERT_RULES: 100,
  DEFAULT_AGGREGATION_WINDOW: 300, // 5 minutes in seconds
  MAX_TIME_WINDOW_SIZE: 86400, // 24 hours in seconds
} as const;