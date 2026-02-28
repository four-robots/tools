import { 
  CollaborationEvent, 
  SystemMetric, 
  UserActivity, 
  TimeWindow,
  AlertCondition,
  AlertAction,
  StreamMetric,
  AggregationResult,
  ANALYTICS_CONSTANTS 
} from '@shared/types';
import { logger } from '@/utils/logger';
import { EventEmitter } from 'events';
import { DatabaseConnection } from '@/utils/database';

export interface StreamProcessor {
  // Real-time event processing
  processCollaborationEvent(event: CollaborationEvent): Promise<void>;
  processSystemMetric(metric: SystemMetric): Promise<void>;
  processUserActivity(activity: UserActivity): Promise<void>;
  
  // Aggregation windows
  createTimeWindow(windowSize: number, slideInterval: number): TimeWindow;
  aggregateMetrics(windowId: string, aggregationType: 'sum' | 'avg' | 'count' | 'p95'): Promise<AggregationResult[]>;
  
  // Real-time alerts
  configureAlert(condition: AlertCondition, action: AlertAction): Promise<string>;
  triggerAlert(alertId: string, data: any): Promise<void>;
}

interface MetricBuffer {
  metrics: StreamMetric[];
  windowId: string;
  startTime: Date;
  endTime: Date;
  slideInterval: number;
}

interface AlertRule {
  id: string;
  condition: AlertCondition;
  action: AlertAction;
  isEnabled: boolean;
  lastTriggered?: Date;
}

export class KafkaStreamProcessor extends EventEmitter implements StreamProcessor {
  private metricBuffers = new Map<string, MetricBuffer>();
  private alertRules = new Map<string, AlertRule>();
  private aggregationCache = new Map<string, AggregationResult[]>();
  private readonly batchSize = ANALYTICS_CONSTANTS.MAX_EVENT_BATCH_SIZE;
  private readonly windowCleanupInterval = 5 * 60 * 1000; // 5 minutes
  
  constructor(
    private readonly db: DatabaseConnection,
    private readonly tenantId?: string
  ) {
    super();
    this.setupEventHandlers();
    this.startBackgroundTasks();
  }

  async processCollaborationEvent(event: CollaborationEvent): Promise<void> {
    try {
      // Convert collaboration event to stream metrics
      const metrics = this.collaborationEventToMetrics(event);
      
      // Process each metric through the stream pipeline
      for (const metric of metrics) {
        await this.processStreamMetric(metric);
      }

      // Store raw event for detailed analytics
      await this.storeCollaborationEvent(event);
      
      logger.info('Processed collaboration event', { 
        eventType: event.eventType,
        sessionId: event.sessionId,
        metricsGenerated: metrics.length
      });
      
    } catch (error) {
      logger.error('Failed to process collaboration event', { error, event });
      throw error;
    }
  }

  async processSystemMetric(metric: SystemMetric): Promise<void> {
    try {
      const streamMetric: StreamMetric = {
        name: `system.${metric.serviceName}.${metric.metricName}`,
        type: this.getMetricType(metric.metricType),
        value: metric.value,
        dimensions: {
          service: metric.serviceName,
          instance: metric.serviceInstance || 'unknown',
          metricType: metric.metricType,
          unit: metric.unit || '',
          ...metric.metadata
        },
        timestamp: metric.timestamp,
      };

      await this.processStreamMetric(streamMetric);
      
      // Check for system alerts
      await this.checkSystemAlerts(streamMetric);
      
      logger.debug('Processed system metric', { 
        metric: streamMetric.name,
        value: streamMetric.value,
        service: metric.serviceName
      });
      
    } catch (error) {
      logger.error('Failed to process system metric', { error, metric });
      throw error;
    }
  }

  async processUserActivity(activity: UserActivity): Promise<void> {
    try {
      const streamMetric: StreamMetric = {
        name: `user_activity.${activity.activityType}`,
        type: 'counter',
        value: 1,
        dimensions: {
          userId: activity.userId,
          sessionId: activity.sessionId,
          feature: activity.feature || 'unknown',
          duration: activity.duration?.toString() || '0',
          ...activity.metadata
        },
        timestamp: activity.timestamp,
        tenantId: activity.tenantId,
      };

      await this.processStreamMetric(streamMetric);
      
      // Track user engagement metrics
      if (activity.duration) {
        const engagementMetric: StreamMetric = {
          name: 'user_engagement.duration',
          type: 'summary',
          value: activity.duration,
          dimensions: {
            userId: activity.userId,
            feature: activity.feature || 'unknown',
          },
          timestamp: activity.timestamp,
          tenantId: activity.tenantId,
        };
        await this.processStreamMetric(engagementMetric);
      }
      
    } catch (error) {
      logger.error('Failed to process user activity', { error, activity });
      throw error;
    }
  }

  createTimeWindow(windowSize: number, slideInterval: number): TimeWindow {
    const now = new Date();
    const windowId = `window_${now.getTime()}_${windowSize}_${slideInterval}`;
    
    const window: TimeWindow = {
      id: windowId,
      windowSize,
      slideInterval,
      startTime: now,
      endTime: new Date(now.getTime() + windowSize * 1000),
    };

    // Initialize metric buffer for this window
    this.metricBuffers.set(windowId, {
      metrics: [],
      windowId,
      startTime: window.startTime,
      endTime: window.endTime,
      slideInterval,
    });

    logger.debug('Created time window', { windowId, windowSize, slideInterval });
    
    return window;
  }

  async aggregateMetrics(
    windowId: string, 
    aggregationType: 'sum' | 'avg' | 'count' | 'p95'
  ): Promise<AggregationResult[]> {
    try {
      const cacheKey = `${windowId}_${aggregationType}`;
      
      // Check cache first
      if (this.aggregationCache.has(cacheKey)) {
        return this.aggregationCache.get(cacheKey)!;
      }

      const buffer = this.metricBuffers.get(windowId);
      if (!buffer) {
        throw new Error(`Time window ${windowId} not found`);
      }

      const results: AggregationResult[] = [];
      const metricGroups = this.groupMetricsByName(buffer.metrics);
      
      for (const [metricName, metrics] of metricGroups.entries()) {
        const result = await this.calculateAggregation(
          metricName,
          metrics,
          aggregationType,
          buffer.endTime
        );
        results.push(result);
      }

      // Cache results
      this.aggregationCache.set(cacheKey, results);
      
      // Store aggregated results in database
      await this.storeAggregationResults(results);
      
      logger.debug('Completed metric aggregation', {
        windowId,
        aggregationType,
        resultCount: results.length
      });
      
      return results;
      
    } catch (error) {
      logger.error('Failed to aggregate metrics', { error, windowId, aggregationType });
      throw error;
    }
  }

  async configureAlert(condition: AlertCondition, action: AlertAction): Promise<string> {
    const alertId = `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const rule: AlertRule = {
      id: alertId,
      condition,
      action,
      isEnabled: true,
    };
    
    this.alertRules.set(alertId, rule);
    
    // Store alert rule in database
    await this.storeAlertRule(rule);
    
    logger.info('Configured alert rule', { alertId, condition: condition.type });
    
    return alertId;
  }

  async triggerAlert(alertId: string, data: any): Promise<void> {
    try {
      const rule = this.alertRules.get(alertId);
      if (!rule || !rule.isEnabled) {
        return;
      }

      // Check cooldown period to prevent alert spam
      if (rule.lastTriggered) {
        const cooldown = 5 * 60 * 1000; // 5 minutes
        const timeSinceLastTrigger = Date.now() - rule.lastTriggered.getTime();
        if (timeSinceLastTrigger < cooldown) {
          return;
        }
      }

      // Execute alert action
      await this.executeAlertAction(rule.action, data);
      
      // Update last triggered time
      rule.lastTriggered = new Date();
      
      // Store alert history
      await this.storeAlertHistory(alertId, data);
      
      // Emit alert event
      this.emit('alert_triggered', { alertId, rule, data });
      
      logger.warn('Alert triggered', { alertId, data });
      
    } catch (error) {
      logger.error('Failed to trigger alert', { error, alertId, data });
      throw error;
    }
  }

  private async processStreamMetric(metric: StreamMetric): Promise<void> {
    // Add metric to all active time windows
    for (const [windowId, buffer] of this.metricBuffers.entries()) {
      if (this.isMetricInWindow(metric, buffer)) {
        buffer.metrics.push(metric);
        
        // Check if window is full and needs processing
        if (buffer.metrics.length >= this.batchSize) {
          await this.processWindowBatch(windowId);
        }
      }
    }

    // Store raw metric for real-time queries
    await this.storeStreamMetric(metric);
    
    // Emit metric update event
    this.emit('metric_update', metric);
  }

  private collaborationEventToMetrics(event: CollaborationEvent): StreamMetric[] {
    const baseMetric = {
      timestamp: event.timestamp,
      tenantId: event.tenantId,
      workspaceId: event.workspaceId,
    };

    const metrics: StreamMetric[] = [];

    // Session metrics
    metrics.push({
      ...baseMetric,
      name: `collaboration.${event.eventType}`,
      type: 'counter' as const,
      value: 1,
      dimensions: {
        sessionId: event.sessionId,
        userId: event.userId,
        resourceType: event.resourceType,
        resourceId: event.resourceId,
        ...event.metadata,
      },
    });

    // Resource-specific metrics
    metrics.push({
      ...baseMetric,
      name: `collaboration.${event.resourceType}.activity`,
      type: 'counter' as const,
      value: 1,
      dimensions: {
        eventType: event.eventType,
        resourceId: event.resourceId,
        userId: event.userId,
      },
    });

    // User activity metrics
    if (event.eventType === 'content_modification') {
      metrics.push({
        ...baseMetric,
        name: 'user.productivity.modifications',
        type: 'counter' as const,
        value: 1,
        dimensions: {
          userId: event.userId,
          resourceType: event.resourceType,
        },
      });
    }

    return metrics;
  }

  private getMetricType(systemMetricType: string): 'gauge' | 'counter' | 'histogram' | 'summary' {
    switch (systemMetricType) {
      case 'cpu':
      case 'memory':
      case 'disk':
        return 'gauge';
      case 'api_response':
        return 'histogram';
      case 'database':
      case 'websocket':
        return 'counter';
      case 'network':
        return 'summary';
      default:
        return 'gauge';
    }
  }

  private groupMetricsByName(metrics: StreamMetric[]): Map<string, StreamMetric[]> {
    const groups = new Map<string, StreamMetric[]>();
    
    for (const metric of metrics) {
      if (!groups.has(metric.name)) {
        groups.set(metric.name, []);
      }
      groups.get(metric.name)!.push(metric);
    }
    
    return groups;
  }

  private async calculateAggregation(
    metricName: string,
    metrics: StreamMetric[],
    aggregationType: 'sum' | 'avg' | 'count' | 'p95',
    timestamp: Date
  ): Promise<AggregationResult> {
    const values = metrics.map(m => m.value);
    let aggregatedValue: number;

    switch (aggregationType) {
      case 'sum':
        aggregatedValue = values.reduce((a, b) => a + b, 0);
        break;
      case 'avg':
        aggregatedValue = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
        break;
      case 'count':
        aggregatedValue = values.length;
        break;
      case 'p95':
        const sorted = [...values].sort((a, b) => a - b);
        const index = Math.min(Math.ceil(0.95 * sorted.length) - 1, sorted.length - 1);
        aggregatedValue = sorted[index] || 0;
        break;
      default:
        throw new Error(`Unsupported aggregation type: ${aggregationType}`);
    }

    return {
      metric: metricName,
      aggregationType,
      value: aggregatedValue,
      timestamp,
      dimensions: this.mergeDimensions(metrics),
    };
  }

  private mergeDimensions(metrics: StreamMetric[]): Record<string, any> {
    const merged: Record<string, any> = {};
    
    for (const metric of metrics) {
      Object.assign(merged, metric.dimensions);
    }
    
    return merged;
  }

  private isMetricInWindow(metric: StreamMetric, buffer: MetricBuffer): boolean {
    const metricTime = metric.timestamp.getTime();
    const windowStart = buffer.startTime.getTime();
    const windowEnd = buffer.endTime.getTime();
    
    return metricTime >= windowStart && metricTime < windowEnd;
  }

  private async processWindowBatch(windowId: string): Promise<void> {
    const buffer = this.metricBuffers.get(windowId);
    if (!buffer) return;

    try {
      // Process aggregations for common aggregation types
      const aggregationTypes: Array<'sum' | 'avg' | 'count' | 'p95'> = ['sum', 'avg', 'count', 'p95'];
      
      for (const aggType of aggregationTypes) {
        await this.aggregateMetrics(windowId, aggType);
      }
      
      // Clear processed metrics from buffer
      buffer.metrics = [];
      
      logger.debug('Processed window batch', { windowId, bufferSize: buffer.metrics.length });
      
    } catch (error) {
      logger.error('Failed to process window batch', { error, windowId });
    }
  }

  private async checkSystemAlerts(metric: StreamMetric): Promise<void> {
    for (const [alertId, rule] of this.alertRules.entries()) {
      if (rule.condition.metric === metric.name) {
        const shouldTrigger = await this.evaluateAlertCondition(rule.condition, metric);
        if (shouldTrigger) {
          await this.triggerAlert(alertId, { metric, rule });
        }
      }
    }
  }

  private async evaluateAlertCondition(condition: AlertCondition, metric: StreamMetric): Promise<boolean> {
    switch (condition.type) {
      case 'threshold':
        if (!condition.threshold || !condition.operator) return false;
        return this.evaluateThreshold(metric.value, condition.operator, condition.threshold);
      
      case 'anomaly':
        return await this.evaluateAnomaly(metric, condition.sensitivity || 0.8);
      
      case 'rate_of_change':
        return await this.evaluateRateOfChange(metric, condition.threshold || 50);
      
      default:
        return false;
    }
  }

  private evaluateThreshold(value: number, operator: string, threshold: number): boolean {
    switch (operator) {
      case 'gt': return value > threshold;
      case 'gte': return value >= threshold;
      case 'lt': return value < threshold;
      case 'lte': return value <= threshold;
      case 'eq': return value === threshold;
      case 'ne': return value !== threshold;
      default: return false;
    }
  }

  private async evaluateAnomaly(metric: StreamMetric, sensitivity: number): Promise<boolean> {
    // Simplified anomaly detection - in production, use more sophisticated algorithms
    try {
      const historicalValues = await this.getHistoricalValues(metric.name, 24 * 60 * 60 * 1000); // 24 hours
      
      if (historicalValues.length < 10) return false; // Need enough data points
      
      const mean = historicalValues.reduce((a, b) => a + b, 0) / historicalValues.length;
      const variance = historicalValues.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / historicalValues.length;
      const stdDev = Math.sqrt(variance);
      
      const threshold = mean + (stdDev * (1 / sensitivity)); // Higher sensitivity = lower threshold
      
      return Math.abs(metric.value - mean) > threshold;
      
    } catch (error) {
      logger.error('Failed to evaluate anomaly', { error, metric: metric.name });
      return false;
    }
  }

  private async evaluateRateOfChange(metric: StreamMetric, maxChangePercent: number): Promise<boolean> {
    try {
      const previousValue = await this.getPreviousValue(metric.name);
      if (previousValue === null) return false;
      
      const changePercent = Math.abs((metric.value - previousValue) / previousValue) * 100;
      return changePercent > maxChangePercent;
      
    } catch (error) {
      logger.error('Failed to evaluate rate of change', { error, metric: metric.name });
      return false;
    }
  }

  private async executeAlertAction(action: AlertAction, data: any): Promise<void> {
    switch (action.type) {
      case 'email':
        await this.sendEmailAlert(action.target, data, action.template);
        break;
      case 'slack':
        await this.sendSlackAlert(action.target, data, action.template);
        break;
      case 'webhook':
        await this.sendWebhookAlert(action.target, data);
        break;
      case 'dashboard':
        this.emit('dashboard_alert', { target: action.target, data });
        break;
    }
  }

  private async sendEmailAlert(email: string, data: any, template?: string): Promise<void> {
    // Implementation would integrate with email service
    logger.info('Sending email alert', { email, data });
  }

  private async sendSlackAlert(channel: string, data: any, template?: string): Promise<void> {
    // Implementation would integrate with Slack API
    logger.info('Sending Slack alert', { channel, data });
  }

  private async sendWebhookAlert(url: string, data: any): Promise<void> {
    // Implementation would send HTTP POST to webhook URL
    logger.info('Sending webhook alert', { url, data });
  }

  private setupEventHandlers(): void {
    this.on('metric_update', (metric: StreamMetric) => {
      // Handle real-time metric updates
      logger.debug('Metric updated', { name: metric.name, value: metric.value });
    });

    this.on('alert_triggered', ({ alertId, rule, data }) => {
      // Handle alert events
      logger.warn('Alert event', { alertId, condition: rule.condition.type });
    });
  }

  private startBackgroundTasks(): void {
    // Clean up old time windows periodically
    setInterval(() => {
      this.cleanupOldWindows();
    }, this.windowCleanupInterval);

    // Refresh materialized views
    setInterval(() => {
      this.refreshMaterializedViews().catch(error => {
        logger.error('Failed to refresh materialized views', { error });
      });
    }, 5 * 60 * 1000); // Every 5 minutes
  }

  private cleanupOldWindows(): void {
    const now = Date.now();
    const maxAge = ANALYTICS_CONSTANTS.MAX_TIME_WINDOW_SIZE * 1000; // Convert to milliseconds
    
    for (const [windowId, buffer] of this.metricBuffers.entries()) {
      if (now - buffer.endTime.getTime() > maxAge) {
        this.metricBuffers.delete(windowId);
        this.aggregationCache.delete(`${windowId}_sum`);
        this.aggregationCache.delete(`${windowId}_avg`);
        this.aggregationCache.delete(`${windowId}_count`);
        this.aggregationCache.delete(`${windowId}_p95`);
      }
    }
  }

  private async refreshMaterializedViews(): Promise<void> {
    try {
      await this.db.query('SELECT refresh_analytics_aggregates()');
      logger.debug('Refreshed analytics materialized views');
    } catch (error) {
      logger.error('Failed to refresh materialized views', { error });
      throw error;
    }
  }

  // Database operations
  private async storeCollaborationEvent(event: CollaborationEvent): Promise<void> {
    // Implementation would store event in collaboration_session_metrics table
  }

  private async storeStreamMetric(metric: StreamMetric): Promise<void> {
    // Implementation would store metric in analytics_metrics table
  }

  private async storeAggregationResults(results: AggregationResult[]): Promise<void> {
    // Implementation would store aggregated results
  }

  private async storeAlertRule(rule: AlertRule): Promise<void> {
    // Implementation would store alert rule in database
  }

  private async storeAlertHistory(alertId: string, data: any): Promise<void> {
    // Implementation would store alert history
  }

  private async getHistoricalValues(metricName: string, timeRange: number): Promise<number[]> {
    // Implementation would query historical metric values
    return [];
  }

  private async getPreviousValue(metricName: string): Promise<number | null> {
    // Implementation would get the most recent value for a metric
    return null;
  }
}

// Factory function for creating stream processors
export function createStreamProcessor(
  db: DatabaseConnection,
  tenantId?: string
): StreamProcessor {
  return new KafkaStreamProcessor(db, tenantId);
}

export default KafkaStreamProcessor;