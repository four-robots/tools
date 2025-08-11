import {
  DashboardWidget,
  DashboardWidgetConfig,
  DataQuery,
  TimeRange,
  FilterCondition,
  ANALYTICS_CONSTANTS
} from '@shared/types';
import { logger } from '@/utils/logger';

export interface WidgetTemplate {
  id: string;
  name: string;
  description: string;
  type: DashboardWidget['type'];
  defaultConfig: DashboardWidgetConfig;
  defaultQuery: DataQuery;
  category: 'collaboration' | 'performance' | 'engagement' | 'system' | 'custom';
  tags: string[];
}

export class WidgetFactory {
  private templates = new Map<string, WidgetTemplate>();

  constructor() {
    this.initializeBuiltInTemplates();
  }

  // Pre-built widget templates
  createActiveUsersWidget(customConfig?: Partial<DashboardWidgetConfig>): DashboardWidget {
    const template = this.templates.get('active_users');
    if (!template) {
      throw new Error('Active users widget template not found');
    }

    const config: DashboardWidgetConfig = {
      ...template.defaultConfig,
      ...customConfig,
    };

    const query: DataQuery = {
      ...template.defaultQuery,
      timeRange: customConfig?.timeRange || this.getDefaultTimeRange('24h'),
    };

    return {
      id: this.generateWidgetId(),
      type: 'metric_card',
      title: 'Active Users',
      description: 'Current number of active users in the system',
      config,
      dataQuery: query,
      position: { x: 0, y: 0, width: 2, height: 2 },
      refreshInterval: 30,
      isVisible: true,
    };
  }

  createCollaborationActivityWidget(customConfig?: Partial<DashboardWidgetConfig>): DashboardWidget {
    const template = this.templates.get('collaboration_activity');
    if (!template) {
      throw new Error('Collaboration activity widget template not found');
    }

    const config: DashboardWidgetConfig = {
      ...template.defaultConfig,
      ...customConfig,
    };

    return {
      id: this.generateWidgetId(),
      type: 'time_series',
      title: 'Collaboration Activity',
      description: 'Real-time collaboration activity across all workspaces',
      config,
      dataQuery: {
        ...template.defaultQuery,
        timeRange: customConfig?.timeRange || this.getDefaultTimeRange('4h'),
      },
      position: { x: 2, y: 0, width: 6, height: 4 },
      refreshInterval: 15,
      isVisible: true,
    };
  }

  createSystemPerformanceWidget(customConfig?: Partial<DashboardWidgetConfig>): DashboardWidget {
    const template = this.templates.get('system_performance');
    if (!template) {
      throw new Error('System performance widget template not found');
    }

    const config: DashboardWidgetConfig = {
      ...template.defaultConfig,
      ...customConfig,
    };

    return {
      id: this.generateWidgetId(),
      type: 'gauge',
      title: 'System Performance',
      description: 'Overall system performance metrics including response time and resource utilization',
      config,
      dataQuery: {
        ...template.defaultQuery,
        timeRange: customConfig?.timeRange || this.getDefaultTimeRange('1h'),
      },
      position: { x: 8, y: 0, width: 4, height: 4 },
      refreshInterval: 10,
      isVisible: true,
    };
  }

  createErrorRateWidget(customConfig?: Partial<DashboardWidgetConfig>): DashboardWidget {
    const template = this.templates.get('error_rate');
    if (!template) {
      throw new Error('Error rate widget template not found');
    }

    const config: DashboardWidgetConfig = {
      ...template.defaultConfig,
      ...customConfig,
    };

    return {
      id: this.generateWidgetId(),
      type: 'time_series',
      title: 'Error Rate',
      description: 'API error rate over time with threshold indicators',
      config,
      dataQuery: {
        ...template.defaultQuery,
        timeRange: customConfig?.timeRange || this.getDefaultTimeRange('24h'),
      },
      position: { x: 0, y: 4, width: 6, height: 3 },
      refreshInterval: 30,
      isVisible: true,
    };
  }

  createResponseTimeWidget(customConfig?: Partial<DashboardWidgetConfig>): DashboardWidget {
    const template = this.templates.get('response_time');
    if (!template) {
      throw new Error('Response time widget template not found');
    }

    const config: DashboardWidgetConfig = {
      ...template.defaultConfig,
      ...customConfig,
    };

    return {
      id: this.generateWidgetId(),
      type: 'time_series',
      title: 'API Response Time',
      description: 'Average API response times with percentile breakdown',
      config,
      dataQuery: {
        ...template.defaultQuery,
        timeRange: customConfig?.timeRange || this.getDefaultTimeRange('4h'),
      },
      position: { x: 6, y: 4, width: 6, height: 3 },
      refreshInterval: 20,
      isVisible: true,
    };
  }

  createFeatureUsageWidget(customConfig?: Partial<DashboardWidgetConfig>): DashboardWidget {
    const template = this.templates.get('feature_usage');
    if (!template) {
      throw new Error('Feature usage widget template not found');
    }

    const config: DashboardWidgetConfig = {
      ...template.defaultConfig,
      ...customConfig,
    };

    return {
      id: this.generateWidgetId(),
      type: 'pie_chart',
      title: 'Feature Usage Distribution',
      description: 'Distribution of feature usage across the platform',
      config,
      dataQuery: {
        ...template.defaultQuery,
        timeRange: customConfig?.timeRange || this.getDefaultTimeRange('7d'),
      },
      position: { x: 0, y: 7, width: 4, height: 4 },
      refreshInterval: 300, // 5 minutes - less frequent for aggregate data
      isVisible: true,
    };
  }

  createConflictResolutionWidget(customConfig?: Partial<DashboardWidgetConfig>): DashboardWidget {
    const template = this.templates.get('conflict_resolution');
    if (!template) {
      throw new Error('Conflict resolution widget template not found');
    }

    const config: DashboardWidgetConfig = {
      ...template.defaultConfig,
      ...customConfig,
    };

    return {
      id: this.generateWidgetId(),
      type: 'bar_chart',
      title: 'Conflict Resolution',
      description: 'Collaboration conflict detection and resolution metrics',
      config,
      dataQuery: {
        ...template.defaultQuery,
        timeRange: customConfig?.timeRange || this.getDefaultTimeRange('7d'),
      },
      position: { x: 4, y: 7, width: 4, height: 4 },
      refreshInterval: 60,
      isVisible: true,
    };
  }

  createSearchAnalyticsWidget(customConfig?: Partial<DashboardWidgetConfig>): DashboardWidget {
    const template = this.templates.get('search_analytics');
    if (!template) {
      throw new Error('Search analytics widget template not found');
    }

    const config: DashboardWidgetConfig = {
      ...template.defaultConfig,
      ...customConfig,
    };

    return {
      id: this.generateWidgetId(),
      type: 'data_table',
      title: 'Search Analytics',
      description: 'Top search queries and results analytics',
      config,
      dataQuery: {
        ...template.defaultQuery,
        timeRange: customConfig?.timeRange || this.getDefaultTimeRange('24h'),
      },
      position: { x: 8, y: 7, width: 4, height: 4 },
      refreshInterval: 120,
      isVisible: true,
    };
  }

  // Custom widget builder
  createCustomWidget(
    type: DashboardWidget['type'],
    title: string,
    config: DashboardWidgetConfig,
    query: DataQuery,
    position?: { x: number; y: number; width: number; height: number }
  ): DashboardWidget {
    // Validate widget configuration
    this.validateWidgetConfig(type, config, query);

    return {
      id: this.generateWidgetId(),
      type,
      title,
      description: `Custom ${type} widget`,
      config,
      dataQuery: query,
      position: position || { x: 0, y: 0, width: 4, height: 3 },
      refreshInterval: 60,
      isVisible: true,
    };
  }

  // Widget template management
  getAvailableTemplates(category?: WidgetTemplate['category']): WidgetTemplate[] {
    const templates = Array.from(this.templates.values());
    
    if (category) {
      return templates.filter(t => t.category === category);
    }
    
    return templates;
  }

  getTemplateByName(name: string): WidgetTemplate | undefined {
    return Array.from(this.templates.values()).find(t => t.name === name);
  }

  registerCustomTemplate(template: WidgetTemplate): void {
    this.templates.set(template.id, template);
    logger.info('Registered custom widget template', { templateId: template.id, name: template.name });
  }

  // Widget creation helpers
  createDashboardFromTemplate(templateName: string, customizations?: any): DashboardWidget[] {
    switch (templateName) {
      case 'collaboration_overview':
        return this.createCollaborationOverviewDashboard(customizations);
      case 'system_monitoring':
        return this.createSystemMonitoringDashboard(customizations);
      case 'user_engagement':
        return this.createUserEngagementDashboard(customizations);
      case 'performance_analytics':
        return this.createPerformanceAnalyticsDashboard(customizations);
      default:
        throw new Error(`Unknown dashboard template: ${templateName}`);
    }
  }

  private createCollaborationOverviewDashboard(customizations?: any): DashboardWidget[] {
    return [
      this.createActiveUsersWidget(customizations?.activeUsers),
      this.createCollaborationActivityWidget(customizations?.activity),
      this.createConflictResolutionWidget(customizations?.conflicts),
      this.createFeatureUsageWidget(customizations?.features),
    ];
  }

  private createSystemMonitoringDashboard(customizations?: any): DashboardWidget[] {
    return [
      this.createSystemPerformanceWidget(customizations?.performance),
      this.createResponseTimeWidget(customizations?.responseTime),
      this.createErrorRateWidget(customizations?.errorRate),
    ];
  }

  private createUserEngagementDashboard(customizations?: any): DashboardWidget[] {
    return [
      this.createActiveUsersWidget(customizations?.users),
      this.createFeatureUsageWidget(customizations?.features),
      this.createSearchAnalyticsWidget(customizations?.search),
    ];
  }

  private createPerformanceAnalyticsDashboard(customizations?: any): DashboardWidget[] {
    return [
      this.createSystemPerformanceWidget(customizations?.system),
      this.createResponseTimeWidget(customizations?.api),
      this.createErrorRateWidget(customizations?.errors),
    ];
  }

  private initializeBuiltInTemplates(): void {
    // Active Users Template
    this.templates.set('active_users', {
      id: 'active_users',
      name: 'Active Users',
      description: 'Real-time active user count',
      type: 'metric_card',
      category: 'engagement',
      tags: ['users', 'real-time', 'engagement'],
      defaultConfig: {
        chartType: 'number',
        timeRange: this.getDefaultTimeRange('1h'),
        aggregation: 'count',
      },
      defaultQuery: {
        metric: 'user_activity.active_users',
        aggregation: 'count',
        timeRange: this.getDefaultTimeRange('1h'),
      },
    });

    // Collaboration Activity Template
    this.templates.set('collaboration_activity', {
      id: 'collaboration_activity',
      name: 'Collaboration Activity',
      description: 'Real-time collaboration events and sessions',
      type: 'time_series',
      category: 'collaboration',
      tags: ['collaboration', 'real-time', 'sessions'],
      defaultConfig: {
        chartType: 'line',
        timeRange: this.getDefaultTimeRange('4h'),
        aggregation: 'sum',
      },
      defaultQuery: {
        metric: 'collaboration.session_activity',
        aggregation: 'sum',
        timeRange: this.getDefaultTimeRange('4h'),
        groupBy: ['eventType'],
      },
    });

    // System Performance Template
    this.templates.set('system_performance', {
      id: 'system_performance',
      name: 'System Performance',
      description: 'CPU, Memory, and overall system health',
      type: 'gauge',
      category: 'system',
      tags: ['performance', 'system', 'monitoring'],
      defaultConfig: {
        chartType: 'gauge',
        timeRange: this.getDefaultTimeRange('1h'),
        aggregation: 'avg',
      },
      defaultQuery: {
        metric: 'system.performance.overall',
        aggregation: 'avg',
        timeRange: this.getDefaultTimeRange('1h'),
      },
    });

    // Error Rate Template
    this.templates.set('error_rate', {
      id: 'error_rate',
      name: 'Error Rate',
      description: 'API and system error rates over time',
      type: 'time_series',
      category: 'performance',
      tags: ['errors', 'api', 'monitoring'],
      defaultConfig: {
        chartType: 'line',
        timeRange: this.getDefaultTimeRange('24h'),
        aggregation: 'avg',
      },
      defaultQuery: {
        metric: 'system.api_gateway.error_rate',
        aggregation: 'avg',
        timeRange: this.getDefaultTimeRange('24h'),
        filters: [
          { field: 'statusCode', operator: 'gte', value: 400 }
        ],
      },
    });

    // Response Time Template
    this.templates.set('response_time', {
      id: 'response_time',
      name: 'Response Time',
      description: 'API response times with percentile analysis',
      type: 'time_series',
      category: 'performance',
      tags: ['performance', 'api', 'latency'],
      defaultConfig: {
        chartType: 'line',
        timeRange: this.getDefaultTimeRange('4h'),
        aggregation: 'p95',
      },
      defaultQuery: {
        metric: 'system.api_gateway.response_time',
        aggregation: 'p95',
        timeRange: this.getDefaultTimeRange('4h'),
      },
    });

    // Feature Usage Template
    this.templates.set('feature_usage', {
      id: 'feature_usage',
      name: 'Feature Usage',
      description: 'Distribution of feature usage across the platform',
      type: 'pie_chart',
      category: 'engagement',
      tags: ['features', 'usage', 'distribution'],
      defaultConfig: {
        chartType: 'pie',
        timeRange: this.getDefaultTimeRange('7d'),
        aggregation: 'count',
      },
      defaultQuery: {
        metric: 'user_activity.feature_use',
        aggregation: 'count',
        timeRange: this.getDefaultTimeRange('7d'),
        groupBy: ['feature'],
      },
    });

    // Conflict Resolution Template
    this.templates.set('conflict_resolution', {
      id: 'conflict_resolution',
      name: 'Conflict Resolution',
      description: 'Collaboration conflicts detected and resolved',
      type: 'bar_chart',
      category: 'collaboration',
      tags: ['conflicts', 'collaboration', 'resolution'],
      defaultConfig: {
        chartType: 'bar',
        timeRange: this.getDefaultTimeRange('7d'),
        aggregation: 'count',
      },
      defaultQuery: {
        metric: 'collaboration.conflicts',
        aggregation: 'count',
        timeRange: this.getDefaultTimeRange('7d'),
        groupBy: ['status'],
        filters: [
          { field: 'eventType', operator: 'in', value: ['conflict_detected', 'conflict_resolved'] }
        ],
      },
    });

    // Search Analytics Template
    this.templates.set('search_analytics', {
      id: 'search_analytics',
      name: 'Search Analytics',
      description: 'Search query performance and popular searches',
      type: 'data_table',
      category: 'engagement',
      tags: ['search', 'queries', 'analytics'],
      defaultConfig: {
        timeRange: this.getDefaultTimeRange('24h'),
        aggregation: 'count',
      },
      defaultQuery: {
        metric: 'user_activity.search_queries',
        aggregation: 'count',
        timeRange: this.getDefaultTimeRange('24h'),
        groupBy: ['query'],
        limit: 100,
      },
    });

    logger.info('Initialized built-in widget templates', { count: this.templates.size });
  }

  private getDefaultTimeRange(preset: '1h' | '4h' | '24h' | '7d' | '30d'): TimeRange {
    const end = new Date();
    const start = new Date();

    switch (preset) {
      case '1h':
        start.setHours(start.getHours() - 1);
        break;
      case '4h':
        start.setHours(start.getHours() - 4);
        break;
      case '24h':
        start.setHours(start.getHours() - 24);
        break;
      case '7d':
        start.setDate(start.getDate() - 7);
        break;
      case '30d':
        start.setDate(start.getDate() - 30);
        break;
    }

    return { start, end, preset };
  }

  private generateWidgetId(): string {
    return `widget_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private validateWidgetConfig(
    type: DashboardWidget['type'],
    config: DashboardWidgetConfig,
    query: DataQuery
  ): void {
    // Basic validation
    if (!config.timeRange || !config.timeRange.start || !config.timeRange.end) {
      throw new Error('Widget config must include a valid time range');
    }

    if (!query.metric || !query.aggregation) {
      throw new Error('Widget query must include metric and aggregation');
    }

    // Type-specific validation
    switch (type) {
      case 'time_series':
        if (!config.chartType || !['line', 'bar', 'area'].includes(config.chartType)) {
          throw new Error('Time series widgets must have a valid chart type (line, bar, area)');
        }
        break;
      
      case 'pie_chart':
        if (!query.groupBy || query.groupBy.length === 0) {
          throw new Error('Pie charts must have groupBy fields for categorization');
        }
        break;
      
      case 'gauge':
        if (query.aggregation === 'count' && !query.groupBy) {
          throw new Error('Gauge widgets with count aggregation should specify groupBy');
        }
        break;
      
      case 'data_table':
        if (query.limit && query.limit > 1000) {
          throw new Error('Data table widgets cannot have more than 1000 rows');
        }
        break;
    }

    logger.debug('Widget configuration validated', { type, metric: query.metric });
  }

  // Widget cloning and modification
  cloneWidget(widget: DashboardWidget, modifications?: Partial<DashboardWidget>): DashboardWidget {
    return {
      ...widget,
      id: this.generateWidgetId(),
      ...modifications,
    };
  }

  // Batch widget creation
  createWidgetBatch(templates: Array<{ templateName: string; customConfig?: any }>): DashboardWidget[] {
    const widgets: DashboardWidget[] = [];

    for (const { templateName, customConfig } of templates) {
      try {
        const template = this.templates.get(templateName);
        if (!template) {
          logger.warn('Template not found, skipping', { templateName });
          continue;
        }

        const widget = this.createCustomWidget(
          template.type,
          template.name,
          { ...template.defaultConfig, ...customConfig },
          { ...template.defaultQuery, ...customConfig?.query }
        );

        widgets.push(widget);
      } catch (error) {
        logger.error('Failed to create widget from template', { error, templateName });
      }
    }

    return widgets;
  }
}

// Export factory instance
export const widgetFactory = new WidgetFactory();