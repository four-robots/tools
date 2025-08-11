// Real-time analytics dashboard services
export { KafkaStreamProcessor, createStreamProcessor } from './stream-processor-service';
export { RealtimeAnalyticsService } from './realtime-analytics-service';
export { WidgetFactory, widgetFactory } from './widget-factory';
export { AnalyticsQueryEngine } from './query-engine';
export { AlertManager } from './alert-manager';

export type { StreamProcessor, WidgetTemplate } from './stream-processor-service';
export type { StreamProcessor as IStreamProcessor } from './stream-processor-service';

// Re-export analytics types for convenience
export type {
  DashboardWidget,
  DashboardConfiguration,
  DashboardWidgetConfig,
  StreamMetric,
  CollaborationEvent,
  SystemMetric,
  UserActivity,
  TimeWindow,
  AlertCondition,
  AlertAction,
  Alert,
  CollaborationMetrics,
  UserEngagementMetrics,
  SystemHealthMetrics,
  AlertMetrics,
  TimeSeriesData,
  AggregationResult,
  RealtimeMetricValue,
  UserJourney,
  CollaborationPattern,
  Anomaly,
  ReportConfig,
  Report,
  TimeRange,
  FilterCondition,
  MetricUpdate,
} from '@shared/types';