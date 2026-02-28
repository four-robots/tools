import {
  AlertRule,
  Alert,
  AlertCondition,
  AlertAction,
  ANALYTICS_CONSTANTS
} from '@shared/types';
import { logger } from '@/utils/logger';
import { DatabaseConnection } from '@/utils/database';
import { EventEmitter } from 'events';

interface ThresholdAlertRule extends AlertRule {
  condition: AlertCondition & { type: 'threshold' };
}

interface AnomalyAlertRule extends AlertRule {
  condition: AlertCondition & { type: 'anomaly' };
}

interface RateAlertRule extends AlertRule {
  condition: AlertCondition & { type: 'rate_of_change' };
}

interface NotificationChannel {
  type: 'email' | 'slack' | 'webhook';
  config: Record<string, any>;
  isHealthy: boolean;
  lastError?: Error;
}

interface EscalationLevel {
  level: number;
  delayMinutes: number;
  actions: AlertAction[];
  condition?: (alert: Alert) => boolean;
}

export class AlertManager extends EventEmitter {
  private activeRules = new Map<string, AlertRule>();
  private activeAlerts = new Map<string, Alert>();
  private notificationChannels = new Map<string, NotificationChannel>();
  private escalationPolicies = new Map<string, EscalationLevel[]>();
  private evaluationInterval: NodeJS.Timer;
  private metricCache = new Map<string, { values: number[]; timestamps: Date[] }>();

  constructor(
    private readonly db: DatabaseConnection,
    private readonly tenantId?: string
  ) {
    super();
    this.setupNotificationChannels();
    this.startAlertEvaluation();
  }

  // Alert rule evaluation
  async evaluateAlertRules(): Promise<void> {
    const startTime = Date.now();
    let rulesEvaluated = 0;
    let alertsTriggered = 0;

    try {
      for (const [ruleId, rule] of this.activeRules.entries()) {
        if (!rule.isEnabled) continue;

        try {
          const shouldAlert = await this.evaluateRule(rule);
          rulesEvaluated++;

          if (shouldAlert) {
            await this.triggerAlert(rule);
            alertsTriggered++;
          }
        } catch (error) {
          logger.error('Failed to evaluate alert rule', { error, ruleId, ruleName: rule.name });
        }
      }

      const evaluationTime = Date.now() - startTime;
      logger.debug('Alert rule evaluation completed', {
        rulesEvaluated,
        alertsTriggered,
        evaluationTimeMs: evaluationTime
      });

    } catch (error) {
      logger.error('Alert evaluation failed', { error });
    }
  }

  async checkThresholdAlert(rule: ThresholdAlertRule, currentValue: number): Promise<boolean> {
    const { condition } = rule;

    if (!condition.threshold || !condition.operator) {
      logger.warn('Threshold alert rule missing threshold or operator', { ruleId: rule.id });
      return false;
    }

    const isTriggered = this.evaluateThresholdCondition(
      currentValue,
      condition.operator,
      condition.threshold
    );

    if (isTriggered) {
      // Check if this alert is in cooldown period
      if (await this.isInCooldown(rule.id!, condition.evaluationInterval || 60)) {
        return false;
      }

      logger.info('Threshold alert triggered', {
        ruleId: rule.id,
        metric: condition.metric,
        currentValue,
        threshold: condition.threshold,
        operator: condition.operator
      });
    }

    return isTriggered;
  }

  async checkAnomalyAlert(rule: AnomalyAlertRule, timeSeries: number[]): Promise<boolean> {
    const { condition } = rule;

    if (timeSeries.length < 10) {
      // Need sufficient data for anomaly detection
      return false;
    }

    const sensitivity = condition.sensitivity || 0.8;
    const isAnomaly = await this.detectAnomaly(timeSeries, sensitivity);

    if (isAnomaly) {
      if (await this.isInCooldown(rule.id!, condition.evaluationInterval || 300)) {
        return false;
      }

      logger.info('Anomaly alert triggered', {
        ruleId: rule.id,
        metric: condition.metric,
        sensitivity,
        dataPoints: timeSeries.length
      });
    }

    return isAnomaly;
  }

  async checkRateOfChangeAlert(rule: RateAlertRule, currentRate: number): Promise<boolean> {
    const { condition } = rule;
    const maxChangePercent = condition.threshold || 50; // Default 50% change threshold

    const previousRate = await this.getPreviousRate(condition.metric);
    if (previousRate === null || previousRate === 0) {
      return false; // No previous data to compare or zero baseline
    }

    const changePercent = Math.abs((currentRate - previousRate) / previousRate) * 100;
    const isTriggered = changePercent > maxChangePercent;

    if (isTriggered) {
      if (await this.isInCooldown(rule.id!, condition.evaluationInterval || 120)) {
        return false;
      }

      logger.info('Rate of change alert triggered', {
        ruleId: rule.id,
        metric: condition.metric,
        currentRate,
        previousRate,
        changePercent,
        threshold: maxChangePercent
      });
    }

    return isTriggered;
  }

  // Notification dispatch
  async sendEmailAlert(alert: Alert, recipients: string[]): Promise<void> {
    try {
      const emailChannel = this.notificationChannels.get('email');
      if (!emailChannel || !emailChannel.isHealthy) {
        throw new Error('Email notification channel is not available');
      }

      // In a real implementation, this would integrate with an email service
      logger.info('Sending email alert', {
        alertId: alert.id,
        recipients,
        level: alert.level,
        title: alert.title
      });

      // Mock email sending
      await this.mockEmailSend(alert, recipients);

      // Update alert with notification sent
      await this.updateAlertNotificationStatus(alert.id!, 'email', 'sent', recipients);

    } catch (error) {
      logger.error('Failed to send email alert', { error, alertId: alert.id, recipients });
      await this.updateAlertNotificationStatus(alert.id!, 'email', 'failed', recipients, error.message);
      throw error;
    }
  }

  async sendSlackAlert(alert: Alert, channel: string): Promise<void> {
    try {
      const slackChannel = this.notificationChannels.get('slack');
      if (!slackChannel || !slackChannel.isHealthy) {
        throw new Error('Slack notification channel is not available');
      }

      // In a real implementation, this would use Slack Web API
      logger.info('Sending Slack alert', {
        alertId: alert.id,
        channel,
        level: alert.level,
        title: alert.title
      });

      // Mock Slack message sending
      await this.mockSlackSend(alert, channel);

      await this.updateAlertNotificationStatus(alert.id!, 'slack', 'sent', [channel]);

    } catch (error) {
      logger.error('Failed to send Slack alert', { error, alertId: alert.id, channel });
      await this.updateAlertNotificationStatus(alert.id!, 'slack', 'failed', [channel], error.message);
      throw error;
    }
  }

  async sendWebhookAlert(alert: Alert, url: string): Promise<void> {
    try {
      const webhookChannel = this.notificationChannels.get('webhook');
      if (!webhookChannel || !webhookChannel.isHealthy) {
        throw new Error('Webhook notification channel is not available');
      }

      const payload = {
        alertId: alert.id,
        title: alert.title,
        message: alert.message,
        level: alert.level,
        currentValue: alert.currentValue,
        thresholdValue: alert.thresholdValue,
        triggeredAt: alert.triggeredAt,
        tenantId: alert.tenantId,
      };

      // In a real implementation, this would make HTTP POST request
      logger.info('Sending webhook alert', {
        alertId: alert.id,
        url,
        level: alert.level
      });

      // Mock webhook sending
      await this.mockWebhookSend(payload, url);

      await this.updateAlertNotificationStatus(alert.id!, 'webhook', 'sent', [url]);

    } catch (error) {
      logger.error('Failed to send webhook alert', { error, alertId: alert.id, url });
      await this.updateAlertNotificationStatus(alert.id!, 'webhook', 'failed', [url], error.message);
      throw error;
    }
  }

  // Alert lifecycle management
  async acknowledgeAlert(alertId: string, userId: string, notes?: string): Promise<void> {
    try {
      const alert = this.activeAlerts.get(alertId);
      if (!alert) {
        throw new Error(`Alert ${alertId} not found`);
      }

      if (alert.status !== 'active') {
        throw new Error(`Alert ${alertId} is not active (current status: ${alert.status})`);
      }

      // Update alert status
      alert.status = 'acknowledged';
      alert.acknowledgedBy = userId;
      alert.acknowledgedAt = new Date();

      // Update in database
      await this.updateAlertInDatabase(alert);

      // Stop escalation for this alert
      this.emit('alert_acknowledged', { alert, acknowledgedBy: userId, notes });

      logger.info('Alert acknowledged', {
        alertId,
        acknowledgedBy: userId,
        title: alert.title
      });

    } catch (error) {
      logger.error('Failed to acknowledge alert', { error, alertId, userId });
      throw error;
    }
  }

  async resolveAlert(alertId: string, userId: string, resolution: string): Promise<void> {
    try {
      const alert = this.activeAlerts.get(alertId);
      if (!alert) {
        throw new Error(`Alert ${alertId} not found`);
      }

      // Update alert status
      alert.status = 'resolved';
      alert.resolvedBy = userId;
      alert.resolvedAt = new Date();

      // Update in database with resolution notes
      await this.updateAlertInDatabase(alert);
      await this.storeAlertResolution(alertId, userId, resolution);

      // Remove from active alerts
      this.activeAlerts.delete(alertId);

      this.emit('alert_resolved', { alert, resolvedBy: userId, resolution });

      logger.info('Alert resolved', {
        alertId,
        resolvedBy: userId,
        title: alert.title,
        resolution
      });

    } catch (error) {
      logger.error('Failed to resolve alert', { error, alertId, userId });
      throw error;
    }
  }

  async escalateAlert(alertId: string, escalationLevel: number): Promise<void> {
    try {
      const alert = this.activeAlerts.get(alertId);
      if (!alert) {
        logger.warn('Cannot escalate non-existent alert', { alertId });
        return;
      }

      const rule = this.activeRules.get(alert.ruleId);
      if (!rule) {
        logger.warn('Cannot escalate alert without rule', { alertId, ruleId: alert.ruleId });
        return;
      }

      const escalationPolicy = this.escalationPolicies.get(alert.ruleId);
      if (!escalationPolicy || escalationLevel >= escalationPolicy.length) {
        logger.warn('No escalation policy or level exceeded', {
          alertId,
          escalationLevel,
          maxLevel: escalationPolicy?.length || 0
        });
        return;
      }

      const escalation = escalationPolicy[escalationLevel];

      // Check if escalation condition is met (if specified)
      if (escalation.condition && !escalation.condition(alert)) {
        logger.debug('Escalation condition not met', { alertId, escalationLevel });
        return;
      }

      // Execute escalation actions
      for (const action of escalation.actions) {
        await this.executeAlertAction(action, alert);
      }

      // Schedule next escalation if available
      if (escalationLevel + 1 < escalationPolicy.length) {
        const nextEscalation = escalationPolicy[escalationLevel + 1];
        setTimeout(
          () => this.escalateAlert(alertId, escalationLevel + 1),
          nextEscalation.delayMinutes * 60 * 1000
        );
      }

      // Update alert escalation status
      await this.updateAlertEscalation(alertId, escalationLevel);

      this.emit('alert_escalated', { alert, escalationLevel });

      logger.info('Alert escalated', {
        alertId,
        escalationLevel,
        title: alert.title
      });

    } catch (error) {
      logger.error('Failed to escalate alert', { error, alertId, escalationLevel });
    }
  }

  // Rule management
  async createAlertRule(rule: Omit<AlertRule, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const ruleId = `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const newRule: AlertRule = {
      ...rule,
      id: ruleId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Validate rule
    this.validateAlertRule(newRule);

    // Store in database
    await this.storeAlertRule(newRule);

    // Add to active rules
    this.activeRules.set(ruleId, newRule);

    logger.info('Created alert rule', { ruleId, name: rule.name, metric: rule.condition.metric });

    return ruleId;
  }

  async updateAlertRule(ruleId: string, updates: Partial<AlertRule>): Promise<void> {
    const rule = this.activeRules.get(ruleId);
    if (!rule) {
      throw new Error(`Alert rule ${ruleId} not found`);
    }

    const updatedRule = {
      ...rule,
      ...updates,
      updatedAt: new Date(),
    };

    // Validate updated rule
    this.validateAlertRule(updatedRule);

    // Update in database
    await this.updateAlertRuleInDatabase(updatedRule);

    // Update in memory
    this.activeRules.set(ruleId, updatedRule);

    logger.info('Updated alert rule', { ruleId, name: updatedRule.name });
  }

  async deleteAlertRule(ruleId: string): Promise<void> {
    const rule = this.activeRules.get(ruleId);
    if (!rule) {
      throw new Error(`Alert rule ${ruleId} not found`);
    }

    // Resolve any active alerts for this rule
    for (const [alertId, alert] of this.activeAlerts.entries()) {
      if (alert.ruleId === ruleId) {
        await this.resolveAlert(alertId, 'system', 'Alert rule deleted');
      }
    }

    // Remove from database
    await this.deleteAlertRuleFromDatabase(ruleId);

    // Remove from memory
    this.activeRules.delete(ruleId);
    this.escalationPolicies.delete(ruleId);

    logger.info('Deleted alert rule', { ruleId, name: rule.name });
  }

  // Private helper methods
  private async evaluateRule(rule: AlertRule): Promise<boolean> {
    const { condition } = rule;

    try {
      switch (condition.type) {
        case 'threshold':
          const currentValue = await this.getCurrentMetricValue(condition.metric);
          if (currentValue === null) return false;
          return await this.checkThresholdAlert(rule as ThresholdAlertRule, currentValue);

        case 'anomaly':
          const timeSeries = await this.getTimeSeriesData(condition.metric, condition.timeWindow || 3600);
          return await this.checkAnomalyAlert(rule as AnomalyAlertRule, timeSeries);

        case 'rate_of_change':
          const currentRate = await this.getCurrentMetricValue(condition.metric);
          if (currentRate === null) return false;
          return await this.checkRateOfChangeAlert(rule as RateAlertRule, currentRate);

        default:
          logger.warn('Unknown alert condition type', { ruleId: rule.id, conditionType: condition.type });
          return false;
      }
    } catch (error) {
      logger.error('Rule evaluation failed', { error, ruleId: rule.id, metric: condition.metric });
      return false;
    }
  }

  private evaluateThresholdCondition(value: number, operator: string, threshold: number): boolean {
    switch (operator) {
      case 'gt': return value > threshold;
      case 'gte': return value >= threshold;
      case 'lt': return value < threshold;
      case 'lte': return value <= threshold;
      case 'eq': return Math.abs(value - threshold) < 0.001; // Float equality with tolerance
      case 'ne': return Math.abs(value - threshold) >= 0.001;
      default:
        logger.warn('Unknown threshold operator', { operator });
        return false;
    }
  }

  private async detectAnomaly(timeSeries: number[], sensitivity: number): Promise<boolean> {
    if (timeSeries.length < 10) return false;

    // Simple statistical anomaly detection using z-score
    const mean = timeSeries.reduce((a, b) => a + b, 0) / timeSeries.length;
    const variance = timeSeries.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / timeSeries.length;
    const stdDev = Math.sqrt(variance);

    const latestValue = timeSeries[timeSeries.length - 1];
    if (stdDev === 0) return false; // All values identical, no anomaly
    const zScore = Math.abs(latestValue - mean) / stdDev;

    // Higher sensitivity = lower z-score threshold
    const threshold = 2.5 / sensitivity;

    return zScore > threshold;
  }

  private async triggerAlert(rule: AlertRule): Promise<void> {
    const alertId = `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const currentValue = await this.getCurrentMetricValue(rule.condition.metric);
    
    const alert: Alert = {
      id: alertId,
      ruleId: rule.id!,
      level: this.determineAlertLevel(rule.condition, currentValue || 0),
      title: `${rule.name} Alert`,
      message: this.generateAlertMessage(rule, currentValue || 0),
      currentValue: currentValue || 0,
      thresholdValue: rule.condition.threshold,
      status: 'active',
      triggeredAt: new Date(),
      tenantId: rule.tenantId,
    };

    // Store alert
    await this.storeAlert(alert);
    this.activeAlerts.set(alertId, alert);

    // Execute alert actions
    for (const action of rule.actions) {
      try {
        await this.executeAlertAction(action, alert);
      } catch (error) {
        logger.error('Failed to execute alert action', { error, alertId, actionType: action.type });
      }
    }

    // Setup escalation if configured
    this.setupAlertEscalation(alert, rule);

    this.emit('alert_triggered', { alert, rule });

    logger.warn('Alert triggered', {
      alertId,
      ruleId: rule.id,
      metric: rule.condition.metric,
      level: alert.level,
      currentValue: alert.currentValue
    });
  }

  private determineAlertLevel(condition: AlertCondition, currentValue: number): 'info' | 'warning' | 'critical' {
    if (!condition.threshold) return 'warning';

    const deviation = Math.abs(currentValue - condition.threshold) / condition.threshold;

    if (deviation > 0.5) return 'critical';  // 50%+ deviation
    if (deviation > 0.2) return 'warning';   // 20%+ deviation
    return 'info';
  }

  private generateAlertMessage(rule: AlertRule, currentValue: number): string {
    const { condition } = rule;
    
    switch (condition.type) {
      case 'threshold':
        return `${condition.metric} value ${currentValue} ${condition.operator} threshold ${condition.threshold}`;
      case 'anomaly':
        return `Anomalous behavior detected for ${condition.metric}: ${currentValue}`;
      case 'rate_of_change':
        return `High rate of change detected for ${condition.metric}: ${currentValue}`;
      default:
        return `Alert condition met for ${condition.metric}`;
    }
  }

  private async executeAlertAction(action: AlertAction, alert: Alert): Promise<void> {
    switch (action.type) {
      case 'email':
        await this.sendEmailAlert(alert, [action.target]);
        break;
      case 'slack':
        await this.sendSlackAlert(alert, action.target);
        break;
      case 'webhook':
        await this.sendWebhookAlert(alert, action.target);
        break;
      case 'dashboard':
        this.emit('dashboard_alert', { alert, target: action.target });
        break;
      default:
        logger.warn('Unknown alert action type', { actionType: action.type, alertId: alert.id });
    }
  }

  private setupAlertEscalation(alert: Alert, rule: AlertRule): void {
    const escalationPolicy = this.escalationPolicies.get(rule.id!);
    if (!escalationPolicy || escalationPolicy.length === 0) return;

    const firstEscalation = escalationPolicy[0];
    setTimeout(
      () => this.escalateAlert(alert.id!, 0),
      firstEscalation.delayMinutes * 60 * 1000
    );
  }

  private validateAlertRule(rule: AlertRule): void {
    if (!rule.name || rule.name.trim().length === 0) {
      throw new Error('Alert rule name is required');
    }

    if (!rule.condition.metric || rule.condition.metric.trim().length === 0) {
      throw new Error('Alert rule metric is required');
    }

    if (rule.condition.type === 'threshold') {
      if (rule.condition.threshold === undefined || rule.condition.operator === undefined) {
        throw new Error('Threshold alerts require threshold value and operator');
      }
    }

    if (!rule.actions || rule.actions.length === 0) {
      throw new Error('Alert rule must have at least one action');
    }

    // Validate actions
    for (const action of rule.actions) {
      if (!action.type || !action.target) {
        throw new Error('Alert action must have type and target');
      }
    }
  }

  private setupNotificationChannels(): void {
    // Setup email channel
    this.notificationChannels.set('email', {
      type: 'email',
      config: {
        smtpServer: process.env.SMTP_SERVER || 'localhost',
        port: process.env.SMTP_PORT || 587,
        username: process.env.SMTP_USERNAME,
        password: process.env.SMTP_PASSWORD,
      },
      isHealthy: true,
    });

    // Setup Slack channel
    this.notificationChannels.set('slack', {
      type: 'slack',
      config: {
        botToken: process.env.SLACK_BOT_TOKEN,
        signingSecret: process.env.SLACK_SIGNING_SECRET,
      },
      isHealthy: !!process.env.SLACK_BOT_TOKEN,
    });

    // Setup webhook channel
    this.notificationChannels.set('webhook', {
      type: 'webhook',
      config: {
        timeout: 10000,
        retries: 3,
      },
      isHealthy: true,
    });

    logger.info('Notification channels initialized', {
      email: this.notificationChannels.get('email')?.isHealthy,
      slack: this.notificationChannels.get('slack')?.isHealthy,
      webhook: this.notificationChannels.get('webhook')?.isHealthy,
    });
  }

  private startAlertEvaluation(): void {
    const interval = 30000; // 30 seconds

    this.evaluationInterval = setInterval(async () => {
      try {
        await this.evaluateAlertRules();
      } catch (error) {
        logger.error('Alert evaluation interval failed', { error });
      }
    }, interval);

    logger.info('Alert evaluation started', { intervalMs: interval });
  }

  // Database operations (simplified implementations)
  private async getCurrentMetricValue(metricName: string): Promise<number | null> {
    try {
      const query = `
        SELECT metric_value 
        FROM analytics_metrics 
        WHERE metric_name = $1 
        ${this.tenantId ? 'AND tenant_id = $2' : ''}
        ORDER BY timestamp DESC 
        LIMIT 1
      `;

      const params = this.tenantId ? [metricName, this.tenantId] : [metricName];
      const results = await this.db.query(query, params);

      return results.length > 0 ? parseFloat(results[0].metric_value) : null;
    } catch (error) {
      logger.error('Failed to get current metric value', { error, metricName });
      return null;
    }
  }

  private async getTimeSeriesData(metricName: string, timeWindowSeconds: number): Promise<number[]> {
    try {
      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - timeWindowSeconds * 1000);

      const query = `
        SELECT metric_value 
        FROM analytics_metrics 
        WHERE metric_name = $1 
        AND timestamp BETWEEN $2 AND $3
        ${this.tenantId ? 'AND tenant_id = $4' : ''}
        ORDER BY timestamp DESC 
        LIMIT 100
      `;

      const params = this.tenantId 
        ? [metricName, startTime, endTime, this.tenantId]
        : [metricName, startTime, endTime];

      const results = await this.db.query(query, params);
      return results.map((row: any) => parseFloat(row.metric_value));
    } catch (error) {
      logger.error('Failed to get time series data', { error, metricName });
      return [];
    }
  }

  private async getPreviousRate(metricName: string): Promise<number | null> {
    // Implementation would query previous rate value
    return null;
  }

  private async isInCooldown(ruleId: string, cooldownSeconds: number): Promise<boolean> {
    // Check if alert was recently triggered for this rule
    const query = `
      SELECT triggered_at 
      FROM analytics_alert_history 
      WHERE alert_rule_id = $1 
      ORDER BY triggered_at DESC 
      LIMIT 1
    `;

    try {
      const results = await this.db.query(query, [ruleId]);
      if (results.length === 0) return false;

      const lastTriggered = new Date(results[0].triggered_at);
      const cooldownEnd = new Date(lastTriggered.getTime() + cooldownSeconds * 1000);

      return new Date() < cooldownEnd;
    } catch (error) {
      logger.warn('Failed to check cooldown status', { error, ruleId });
      return false;
    }
  }

  // Mock implementations for notification services
  private async mockEmailSend(alert: Alert, recipients: string[]): Promise<void> {
    // Simulate email sending delay
    await new Promise(resolve => setTimeout(resolve, 100));
    logger.debug('Mock email sent', { alertId: alert.id, recipients });
  }

  private async mockSlackSend(alert: Alert, channel: string): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 50));
    logger.debug('Mock Slack message sent', { alertId: alert.id, channel });
  }

  private async mockWebhookSend(payload: any, url: string): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 75));
    logger.debug('Mock webhook sent', { url, alertId: payload.alertId });
  }

  // Database operations (would be implemented)
  private async storeAlertRule(rule: AlertRule): Promise<void> {}
  private async updateAlertRuleInDatabase(rule: AlertRule): Promise<void> {}
  private async deleteAlertRuleFromDatabase(ruleId: string): Promise<void> {}
  private async storeAlert(alert: Alert): Promise<void> {}
  private async updateAlertInDatabase(alert: Alert): Promise<void> {}
  private async updateAlertNotificationStatus(
    alertId: string, 
    channel: string, 
    status: string, 
    targets: string[], 
    error?: string
  ): Promise<void> {}
  private async updateAlertEscalation(alertId: string, level: number): Promise<void> {}
  private async storeAlertResolution(alertId: string, userId: string, resolution: string): Promise<void> {}

  async destroy(): void {
    if (this.evaluationInterval) {
      clearInterval(this.evaluationInterval);
    }
    
    this.activeRules.clear();
    this.activeAlerts.clear();
    this.notificationChannels.clear();
    this.escalationPolicies.clear();
    this.metricCache.clear();
  }
}