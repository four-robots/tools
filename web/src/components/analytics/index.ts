// Legacy Analytics Components (keeping existing for compatibility)
export { default as AnalyticsChart } from './AnalyticsChart';
export { default as InsightCard } from './InsightCard';
export { default as PredictiveDashboard } from './PredictiveDashboard';
export { default as RealtimeAnalytics } from './RealtimeAnalytics';
export { default as SmartRecommendations } from './SmartRecommendations';

// Real-time Analytics Dashboard Components
export { default as RealtimeAnalyticsDashboard } from './RealtimeAnalyticsDashboard';
export { default as DashboardGrid } from './DashboardGrid';
export { default as DashboardLayout } from './DashboardLayout';
export { default as DashboardConfigPanel } from './DashboardConfigPanel';

// Widget Components
export { default as WidgetContainer } from './widgets/WidgetContainer';
export { default as MetricCardWidget } from './widgets/MetricCardWidget';
export { default as TimeSeriesChart } from './widgets/TimeSeriesChart';
export { default as BarChart } from './widgets/BarChart';
export { default as PieChart } from './widgets/PieChart';
export { default as GaugeWidget } from './widgets/GaugeWidget';
export { default as DataTable } from './widgets/DataTable';
export { default as HeatmapWidget } from './widgets/HeatmapWidget';
export { default as AlertPanel } from './widgets/AlertPanel';

// Widget Configuration
export { default as WidgetSelector } from './widgets/WidgetSelector';
export { default as WidgetConfigPanel } from './widgets/WidgetConfigPanel';

// Alert Management
export { default as AlertManager } from './alerts/AlertManager';
export { default as AlertRuleForm } from './alerts/AlertRuleForm';
export { default as AlertHistory } from './alerts/AlertHistory';
export { default as AlertNotifications } from './alerts/AlertNotifications';

// Real-time Components
export { default as RealtimeIndicator } from './realtime/RealtimeIndicator';
export { default as ConnectionStatus } from './realtime/ConnectionStatus';
export { default as LiveMetrics } from './realtime/LiveMetrics';

// Utility Components
export { default as MetricQueryBuilder } from './utils/MetricQueryBuilder';
export { default as FilterBuilder } from './utils/FilterBuilder';

// Hooks
export { default as useAnalyticsSocket } from './hooks/useAnalyticsSocket';
export { default as useDashboardData } from './hooks/useDashboardData';
export { default as useRealtimeMetrics } from './hooks/useRealtimeMetrics';
export { default as useWidgetData } from './hooks/useWidgetData';

// Types and utilities
export * from './types';
export * from './utils/chartUtils';
export * from './utils/formatters';

// Keep existing components for backwards compatibility
export { default as AnalyticsDashboard } from './AnalyticsDashboard';
export { default as MetricCard } from './MetricCard';
export { default as TimeRangeSelector } from './TimeRangeSelector';