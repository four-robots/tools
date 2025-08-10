import { Pool } from 'pg';
import {
  AlertAnalytics,
  UserAlertStats,
  AlertDefinition,
  AlertExecution,
  AlertNotification,
} from '../../shared/types/search-alerts.js';
import { DateRange } from '../../shared/types/saved-search.js';

/**
 * Alert Analytics Service
 * 
 * Provides comprehensive analytics and insights for search alerts with:
 * - Alert performance metrics and KPIs
 * - Delivery statistics and engagement tracking
 * - User behavior analysis and patterns
 * - Alert optimization recommendations
 * - Historical trend analysis
 * - System health monitoring
 */
export class AlertAnalyticsService {
  private db: Pool;

  constructor(db: Pool) {
    this.db = db;
  }

  /**
   * Get comprehensive alert analytics for a specific alert
   */
  async getAlertAnalytics(alertId: string, dateRange?: DateRange): Promise<AlertAnalytics> {
    const client = await this.db.connect();
    try {
      const { whereClause, params } = this.buildDateRangeQuery(['ae.executed_at'], dateRange, [alertId]);

      // Get basic execution statistics
      const executionStats = await client.query(`
        SELECT 
          COUNT(*) as total_executions,
          COUNT(*) FILTER (WHERE ae.status = 'success') as successful_executions,
          COUNT(*) FILTER (WHERE ae.status = 'failed') as failed_executions,
          AVG(ae.execution_duration_ms) as avg_execution_time,
          AVG(ae.result_count) as avg_results_per_alert
        FROM alert_executions ae
        WHERE ae.alert_definition_id = $1 ${whereClause}
      `, params);

      const execStats = executionStats.rows[0];

      // Get notification statistics
      const notificationStats = await client.query(`
        SELECT 
          COUNT(*) as total_notifications,
          COUNT(*) FILTER (WHERE an.delivery_status IN ('sent', 'delivered')) as successful_notifications,
          an.channel_type,
          COUNT(*) as channel_count
        FROM alert_notifications an
        JOIN alert_executions ae ON an.alert_execution_id = ae.id
        WHERE ae.alert_definition_id = $1 ${whereClause}
        GROUP BY an.channel_type
      `, params);

      // Get execution trends by day
      const dailyExecutions = await client.query(`
        SELECT 
          DATE(ae.executed_at) as execution_date,
          COUNT(*) as execution_count
        FROM alert_executions ae
        WHERE ae.alert_definition_id = $1 ${whereClause}
        GROUP BY DATE(ae.executed_at)
        ORDER BY execution_date
      `, params);

      // Build notification by channel stats
      const notificationsByChannel: Record<string, number> = {};
      let totalNotificationsSent = 0;
      let totalNotificationsSuccessful = 0;

      for (const row of notificationStats.rows) {
        notificationsByChannel[row.channel_type] = parseInt(row.channel_count);
        if (row.delivery_status === 'sent' || row.delivery_status === 'delivered') {
          totalNotificationsSuccessful += parseInt(row.channel_count);
        }
        totalNotificationsSent += parseInt(row.channel_count);
      }

      // Build daily executions stats
      const executionsByDay: Record<string, number> = {};
      for (const row of dailyExecutions.rows) {
        executionsByDay[row.execution_date] = parseInt(row.execution_count);
      }

      // Get top alerts by executions (for this specific alert, it's just itself)
      const topAlerts = await client.query(`
        SELECT 
          ad.id as alert_id,
          ad.name as alert_name,
          COUNT(ae.id) as execution_count
        FROM alert_definitions ad
        LEFT JOIN alert_executions ae ON ad.id = ae.alert_definition_id
        WHERE ad.id = $1 ${whereClause.replace('ae.executed_at', 'ae.executed_at')}
        GROUP BY ad.id, ad.name
      `, params);

      return {
        totalAlerts: 1, // Single alert
        activeAlerts: 1, // Assuming the alert exists and we're analyzing it
        totalExecutions: parseInt(execStats.total_executions) || 0,
        successfulExecutions: parseInt(execStats.successful_executions) || 0,
        failedExecutions: parseInt(execStats.failed_executions) || 0,
        averageExecutionTime: parseFloat(execStats.avg_execution_time) || 0,
        totalNotificationsSent,
        notificationSuccessRate: totalNotificationsSent > 0 ? totalNotificationsSuccessful / totalNotificationsSent : 0,
        topAlertsByExecutions: topAlerts.rows.map(row => ({
          alertId: row.alert_id,
          alertName: row.alert_name,
          executionCount: parseInt(row.execution_count) || 0,
        })),
        executionsByDay,
        notificationsByChannel,
        averageResultsPerAlert: parseFloat(execStats.avg_results_per_alert) || 0,
      };
    } finally {
      client.release();
    }
  }

  /**
   * Get user-level alert statistics
   */
  async getUserAlertStats(userId: string, dateRange?: DateRange): Promise<UserAlertStats> {
    const client = await this.db.connect();
    try {
      const { whereClause, params } = this.buildDateRangeQuery(['ae.executed_at'], dateRange, [userId]);

      // Get basic alert counts
      const basicStats = await client.query(`
        SELECT 
          COUNT(*) as total_alerts,
          COUNT(*) FILTER (WHERE ad.is_active = true) as active_alerts
        FROM alert_definitions ad
        WHERE ad.owner_id = $1
      `, [userId]);

      // Get execution and notification counts
      const executionStats = await client.query(`
        SELECT 
          COUNT(ae.id) as total_executions,
          COUNT(an.id) as total_notifications,
          COUNT(asu.id) as subscriptions
        FROM alert_definitions ad
        LEFT JOIN alert_executions ae ON ad.id = ae.alert_definition_id ${whereClause ? 'AND ' + whereClause.replace('WHERE ', '') : ''}
        LEFT JOIN alert_notifications an ON ae.id = an.alert_execution_id
        LEFT JOIN alert_subscriptions asu ON ad.id = asu.alert_definition_id AND asu.is_active = true
        WHERE ad.owner_id = $1
      `, [userId, ...params.slice(1)]);

      // Get alerts created by month
      const alertsByMonth = await client.query(`
        SELECT 
          TO_CHAR(ad.created_at, 'YYYY-MM') as month,
          COUNT(*) as count
        FROM alert_definitions ad
        WHERE ad.owner_id = $1
        GROUP BY TO_CHAR(ad.created_at, 'YYYY-MM')
        ORDER BY month
      `, [userId]);

      // Get executions by month
      const executionsByMonth = await client.query(`
        SELECT 
          TO_CHAR(ae.executed_at, 'YYYY-MM') as month,
          COUNT(*) as count
        FROM alert_executions ae
        JOIN alert_definitions ad ON ae.alert_definition_id = ad.id
        WHERE ad.owner_id = $1 ${whereClause}
        GROUP BY TO_CHAR(ae.executed_at, 'YYYY-MM')
        ORDER BY month
      `, params);

      // Get most used notification channels
      const channelStats = await client.query(`
        SELECT 
          an.channel_type,
          COUNT(*) as count
        FROM alert_notifications an
        JOIN alert_executions ae ON an.alert_execution_id = ae.id
        JOIN alert_definitions ad ON ae.alert_definition_id = ad.id
        WHERE ad.owner_id = $1 ${whereClause}
        GROUP BY an.channel_type
        ORDER BY count DESC
      `, params);

      const basicStatsRow = basicStats.rows[0] || {};
      const executionStatsRow = executionStats.rows[0] || {};

      // Build monthly stats
      const alertsCreatedByMonth: Record<string, number> = {};
      for (const row of alertsByMonth.rows) {
        alertsCreatedByMonth[row.month] = parseInt(row.count);
      }

      const executionsPerMonth: Record<string, number> = {};
      for (const row of executionsByMonth.rows) {
        executionsPerMonth[row.month] = parseInt(row.count);
      }

      const mostUsedChannels = channelStats.rows.map(row => ({
        channel: row.channel_type,
        count: parseInt(row.count),
      }));

      const totalAlerts = parseInt(basicStatsRow.total_alerts) || 0;
      const totalExecutions = parseInt(executionStatsRow.total_executions) || 0;

      return {
        totalAlerts,
        activeAlerts: parseInt(basicStatsRow.active_alerts) || 0,
        totalExecutions,
        totalNotifications: parseInt(executionStatsRow.total_notifications) || 0,
        subscriptions: parseInt(executionStatsRow.subscriptions) || 0,
        alertsCreatedByMonth,
        executionsByMonth: executionsPerMonth,
        mostUsedChannels,
        averageAlertsPerSearch: 0, // Would need to calculate based on saved searches
      };
    } finally {
      client.release();
    }
  }

  /**
   * Get system-wide alert analytics (admin view)
   */
  async getSystemAlertAnalytics(dateRange?: DateRange): Promise<{
    totalUsers: number;
    totalAlerts: number;
    activeAlerts: number;
    totalExecutions: number;
    systemHealth: {
      successRate: number;
      averageExecutionTime: number;
      notificationDeliveryRate: number;
      errorRate: number;
    };
    topPerformingAlerts: Array<{
      alertId: string;
      alertName: string;
      executionCount: number;
      successRate: number;
    }>;
    channelUsage: Record<string, number>;
    dailyActivity: Record<string, number>;
  }> {
    const client = await this.db.connect();
    try {
      const { whereClause, params } = this.buildDateRangeQuery(['ae.executed_at'], dateRange);

      // Get basic system stats
      const systemStats = await client.query(`
        SELECT 
          (SELECT COUNT(DISTINCT ad.owner_id) FROM alert_definitions ad) as total_users,
          COUNT(DISTINCT ad.id) as total_alerts,
          COUNT(DISTINCT ad.id) FILTER (WHERE ad.is_active = true) as active_alerts,
          COUNT(ae.id) as total_executions,
          COUNT(ae.id) FILTER (WHERE ae.status = 'success') as successful_executions,
          COUNT(ae.id) FILTER (WHERE ae.status = 'failed') as failed_executions,
          AVG(ae.execution_duration_ms) as avg_execution_time
        FROM alert_definitions ad
        LEFT JOIN alert_executions ae ON ad.id = ae.alert_definition_id ${whereClause}
      `, params);

      // Get notification delivery stats
      const notificationStats = await client.query(`
        SELECT 
          COUNT(*) as total_notifications,
          COUNT(*) FILTER (WHERE an.delivery_status IN ('sent', 'delivered')) as successful_notifications,
          an.channel_type,
          COUNT(*) as channel_count
        FROM alert_notifications an
        JOIN alert_executions ae ON an.alert_execution_id = ae.id
        ${whereClause}
        GROUP BY an.channel_type
      `, params);

      // Get top performing alerts
      const topAlerts = await client.query(`
        SELECT 
          ad.id as alert_id,
          ad.name as alert_name,
          COUNT(ae.id) as execution_count,
          COUNT(ae.id) FILTER (WHERE ae.status = 'success') as successful_executions
        FROM alert_definitions ad
        LEFT JOIN alert_executions ae ON ad.id = ae.alert_definition_id ${whereClause}
        GROUP BY ad.id, ad.name
        HAVING COUNT(ae.id) > 0
        ORDER BY execution_count DESC
        LIMIT 10
      `, params);

      // Get daily activity
      const dailyActivity = await client.query(`
        SELECT 
          DATE(ae.executed_at) as activity_date,
          COUNT(*) as execution_count
        FROM alert_executions ae
        ${whereClause}
        GROUP BY DATE(ae.executed_at)
        ORDER BY activity_date
      `, params);

      const systemStatsRow = systemStats.rows[0] || {};
      const totalExecutions = parseInt(systemStatsRow.total_executions) || 0;
      const successfulExecutions = parseInt(systemStatsRow.successful_executions) || 0;
      const failedExecutions = parseInt(systemStatsRow.failed_executions) || 0;

      // Build channel usage stats
      const channelUsage: Record<string, number> = {};
      let totalNotifications = 0;
      let successfulNotifications = 0;

      for (const row of notificationStats.rows) {
        channelUsage[row.channel_type] = parseInt(row.channel_count);
        totalNotifications += parseInt(row.channel_count);
        if (row.delivery_status === 'sent' || row.delivery_status === 'delivered') {
          successfulNotifications += parseInt(row.channel_count);
        }
      }

      // Build daily activity stats
      const dailyActivityStats: Record<string, number> = {};
      for (const row of dailyActivity.rows) {
        dailyActivityStats[row.activity_date] = parseInt(row.execution_count);
      }

      // Build top performing alerts
      const topPerformingAlerts = topAlerts.rows.map(row => ({
        alertId: row.alert_id,
        alertName: row.alert_name,
        executionCount: parseInt(row.execution_count),
        successRate: parseInt(row.execution_count) > 0 
          ? parseInt(row.successful_executions) / parseInt(row.execution_count)
          : 0,
      }));

      return {
        totalUsers: parseInt(systemStatsRow.total_users) || 0,
        totalAlerts: parseInt(systemStatsRow.total_alerts) || 0,
        activeAlerts: parseInt(systemStatsRow.active_alerts) || 0,
        totalExecutions,
        systemHealth: {
          successRate: totalExecutions > 0 ? successfulExecutions / totalExecutions : 0,
          averageExecutionTime: parseFloat(systemStatsRow.avg_execution_time) || 0,
          notificationDeliveryRate: totalNotifications > 0 ? successfulNotifications / totalNotifications : 0,
          errorRate: totalExecutions > 0 ? failedExecutions / totalExecutions : 0,
        },
        topPerformingAlerts,
        channelUsage,
        dailyActivity: dailyActivityStats,
      };
    } finally {
      client.release();
    }
  }

  /**
   * Get alert performance trends over time
   */
  async getAlertPerformanceTrends(
    alertId: string,
    dateRange: DateRange,
    granularity: 'hour' | 'day' | 'week' | 'month' = 'day'
  ): Promise<{
    executionTrends: Array<{
      period: string;
      executions: number;
      successRate: number;
      averageResultCount: number;
      averageExecutionTime: number;
    }>;
    notificationTrends: Array<{
      period: string;
      notificationsSent: number;
      deliveryRate: number;
      byChannel: Record<string, number>;
    }>;
  }> {
    const client = await this.db.connect();
    try {
      const dateFormat = this.getDateFormat(granularity);
      const { whereClause, params } = this.buildDateRangeQuery(['ae.executed_at'], dateRange, [alertId]);

      // Get execution trends
      const executionTrends = await client.query(`
        SELECT 
          TO_CHAR(ae.executed_at, $2) as period,
          COUNT(*) as executions,
          COUNT(*) FILTER (WHERE ae.status = 'success') as successful_executions,
          AVG(ae.result_count) as avg_result_count,
          AVG(ae.execution_duration_ms) as avg_execution_time
        FROM alert_executions ae
        WHERE ae.alert_definition_id = $1 ${whereClause}
        GROUP BY TO_CHAR(ae.executed_at, $2)
        ORDER BY period
      `, [alertId, dateFormat, ...params.slice(1)]);

      // Get notification trends
      const notificationTrends = await client.query(`
        SELECT 
          TO_CHAR(ae.executed_at, $2) as period,
          COUNT(an.id) as notifications_sent,
          COUNT(an.id) FILTER (WHERE an.delivery_status IN ('sent', 'delivered')) as notifications_delivered,
          an.channel_type,
          COUNT(an.id) as channel_count
        FROM alert_executions ae
        LEFT JOIN alert_notifications an ON ae.id = an.alert_execution_id
        WHERE ae.alert_definition_id = $1 ${whereClause}
        GROUP BY TO_CHAR(ae.executed_at, $2), an.channel_type
        ORDER BY period
      `, [alertId, dateFormat, ...params.slice(1)]);

      // Process execution trends
      const executionTrendsData = executionTrends.rows.map(row => ({
        period: row.period,
        executions: parseInt(row.executions),
        successRate: parseInt(row.executions) > 0 
          ? parseInt(row.successful_executions) / parseInt(row.executions)
          : 0,
        averageResultCount: parseFloat(row.avg_result_count) || 0,
        averageExecutionTime: parseFloat(row.avg_execution_time) || 0,
      }));

      // Process notification trends
      const notificationTrendsMap = new Map<string, {
        period: string;
        notificationsSent: number;
        notificationsDelivered: number;
        byChannel: Record<string, number>;
      }>();

      for (const row of notificationTrends.rows) {
        const period = row.period;
        const channelType = row.channel_type || 'unknown';
        const count = parseInt(row.channel_count) || 0;

        if (!notificationTrendsMap.has(period)) {
          notificationTrendsMap.set(period, {
            period,
            notificationsSent: 0,
            notificationsDelivered: parseInt(row.notifications_delivered) || 0,
            byChannel: {},
          });
        }

        const periodData = notificationTrendsMap.get(period)!;
        periodData.notificationsSent += count;
        periodData.byChannel[channelType] = count;
      }

      const notificationTrendsData = Array.from(notificationTrendsMap.values()).map(data => ({
        period: data.period,
        notificationsSent: data.notificationsSent,
        deliveryRate: data.notificationsSent > 0 
          ? data.notificationsDelivered / data.notificationsSent 
          : 0,
        byChannel: data.byChannel,
      }));

      return {
        executionTrends: executionTrendsData,
        notificationTrends: notificationTrendsData,
      };
    } finally {
      client.release();
    }
  }

  /**
   * Get alert optimization recommendations
   */
  async getAlertOptimizationRecommendations(alertId: string): Promise<{
    recommendations: Array<{
      type: 'performance' | 'reliability' | 'cost' | 'engagement';
      priority: 'high' | 'medium' | 'low';
      title: string;
      description: string;
      impact: string;
      actionRequired: string;
    }>;
    overallHealth: 'excellent' | 'good' | 'fair' | 'poor';
    healthScore: number;
  }> {
    const client = await this.db.connect();
    try {
      // Get recent performance data (last 30 days)
      const performanceData = await client.query(`
        SELECT 
          COUNT(*) as total_executions,
          COUNT(*) FILTER (WHERE ae.status = 'success') as successful_executions,
          COUNT(*) FILTER (WHERE ae.status = 'failed') as failed_executions,
          AVG(ae.execution_duration_ms) as avg_execution_time,
          AVG(ae.result_count) as avg_result_count,
          COUNT(an.id) as total_notifications,
          COUNT(an.id) FILTER (WHERE an.delivery_status IN ('sent', 'delivered')) as successful_notifications,
          COUNT(an.id) FILTER (WHERE an.retry_count > 0) as retried_notifications
        FROM alert_executions ae
        LEFT JOIN alert_notifications an ON ae.id = an.alert_execution_id
        WHERE ae.alert_definition_id = $1 
        AND ae.executed_at >= CURRENT_TIMESTAMP - INTERVAL '30 days'
      `, [alertId]);

      const data = performanceData.rows[0] || {};
      const totalExecs = parseInt(data.total_executions) || 0;
      const successfulExecs = parseInt(data.successful_executions) || 0;
      const failedExecs = parseInt(data.failed_executions) || 0;
      const avgExecTime = parseFloat(data.avg_execution_time) || 0;
      const totalNotifications = parseInt(data.total_notifications) || 0;
      const successfulNotifications = parseInt(data.successful_notifications) || 0;
      const retriedNotifications = parseInt(data.retried_notifications) || 0;

      const recommendations: any[] = [];
      let healthScore = 100;

      // Performance recommendations
      if (avgExecTime > 30000) { // > 30 seconds
        recommendations.push({
          type: 'performance',
          priority: 'high',
          title: 'Optimize Search Query Performance',
          description: 'Alert executions are taking longer than expected (avg: ' + Math.round(avgExecTime/1000) + 's)',
          impact: 'Faster alerts, reduced resource usage',
          actionRequired: 'Review and optimize the underlying saved search query',
        });
        healthScore -= 20;
      }

      // Reliability recommendations
      const failureRate = totalExecs > 0 ? failedExecs / totalExecs : 0;
      if (failureRate > 0.1) { // > 10% failure rate
        recommendations.push({
          type: 'reliability',
          priority: 'high',
          title: 'High Failure Rate Detected',
          description: `Alert has a ${(failureRate * 100).toFixed(1)}% failure rate`,
          impact: 'More reliable alert notifications',
          actionRequired: 'Investigate and fix underlying issues causing failures',
        });
        healthScore -= 30;
      }

      // Notification delivery recommendations
      const deliveryRate = totalNotifications > 0 ? successfulNotifications / totalNotifications : 0;
      if (deliveryRate < 0.9) { // < 90% delivery rate
        recommendations.push({
          type: 'reliability',
          priority: 'medium',
          title: 'Poor Notification Delivery Rate',
          description: `Only ${(deliveryRate * 100).toFixed(1)}% of notifications are being delivered successfully`,
          impact: 'Improved notification reliability',
          actionRequired: 'Check notification channel configurations and recipient validity',
        });
        healthScore -= 15;
      }

      // Retry rate recommendations
      const retryRate = totalNotifications > 0 ? retriedNotifications / totalNotifications : 0;
      if (retryRate > 0.2) { // > 20% retry rate
        recommendations.push({
          type: 'reliability',
          priority: 'medium',
          title: 'High Notification Retry Rate',
          description: `${(retryRate * 100).toFixed(1)}% of notifications require retries`,
          impact: 'Reduced system load and faster delivery',
          actionRequired: 'Review notification channel reliability and configurations',
        });
        healthScore -= 10;
      }

      // Cost optimization recommendations
      if (totalExecs > 1000) { // High execution volume
        recommendations.push({
          type: 'cost',
          priority: 'low',
          title: 'High Execution Volume',
          description: `Alert has executed ${totalExecs} times in the last 30 days`,
          impact: 'Reduced resource consumption',
          actionRequired: 'Consider adjusting alert frequency or conditions to reduce unnecessary executions',
        });
        healthScore -= 5;
      }

      // Engagement recommendations (placeholder - would need more detailed tracking)
      if (totalNotifications > 0) {
        recommendations.push({
          type: 'engagement',
          priority: 'low',
          title: 'Monitor Alert Engagement',
          description: 'Consider tracking user engagement with alert notifications',
          impact: 'Better understanding of alert value',
          actionRequired: 'Implement click and open tracking for notifications',
        });
      }

      // Determine overall health
      let overallHealth: 'excellent' | 'good' | 'fair' | 'poor';
      if (healthScore >= 90) overallHealth = 'excellent';
      else if (healthScore >= 70) overallHealth = 'good';
      else if (healthScore >= 50) overallHealth = 'fair';
      else overallHealth = 'poor';

      return {
        recommendations,
        overallHealth,
        healthScore,
      };
    } finally {
      client.release();
    }
  }

  /**
   * Get notification engagement metrics (opens, clicks)
   */
  async getNotificationEngagementMetrics(
    alertId?: string,
    dateRange?: DateRange
  ): Promise<{
    totalNotifications: number;
    opens: number;
    clicks: number;
    openRate: number;
    clickRate: number;
    engagementByChannel: Record<string, {
      notifications: number;
      opens: number;
      clicks: number;
      openRate: number;
      clickRate: number;
    }>;
  }> {
    const client = await this.db.connect();
    try {
      const { whereClause, params } = alertId 
        ? this.buildDateRangeQuery(['an.sent_at'], dateRange, [alertId], 'ae.alert_definition_id = $1')
        : this.buildDateRangeQuery(['an.sent_at'], dateRange);

      const engagementQuery = alertId 
        ? `
          SELECT 
            COUNT(*) as total_notifications,
            COUNT(*) FILTER (WHERE an.opened_at IS NOT NULL) as opens,
            COUNT(*) FILTER (WHERE an.clicked_at IS NOT NULL) as clicks,
            an.channel_type,
            COUNT(*) as channel_notifications,
            COUNT(*) FILTER (WHERE an.opened_at IS NOT NULL) as channel_opens,
            COUNT(*) FILTER (WHERE an.clicked_at IS NOT NULL) as channel_clicks
          FROM alert_notifications an
          JOIN alert_executions ae ON an.alert_execution_id = ae.id
          WHERE ae.alert_definition_id = $1 ${whereClause}
          GROUP BY an.channel_type
        `
        : `
          SELECT 
            COUNT(*) as total_notifications,
            COUNT(*) FILTER (WHERE an.opened_at IS NOT NULL) as opens,
            COUNT(*) FILTER (WHERE an.clicked_at IS NOT NULL) as clicks,
            an.channel_type,
            COUNT(*) as channel_notifications,
            COUNT(*) FILTER (WHERE an.opened_at IS NOT NULL) as channel_opens,
            COUNT(*) FILTER (WHERE an.clicked_at IS NOT NULL) as channel_clicks
          FROM alert_notifications an
          ${whereClause}
          GROUP BY an.channel_type
        `;

      const result = await client.query(engagementQuery, params);

      let totalNotifications = 0;
      let totalOpens = 0;
      let totalClicks = 0;
      const engagementByChannel: Record<string, any> = {};

      for (const row of result.rows) {
        const channelNotifications = parseInt(row.channel_notifications);
        const channelOpens = parseInt(row.channel_opens);
        const channelClicks = parseInt(row.channel_clicks);

        totalNotifications += channelNotifications;
        totalOpens += channelOpens;
        totalClicks += channelClicks;

        engagementByChannel[row.channel_type] = {
          notifications: channelNotifications,
          opens: channelOpens,
          clicks: channelClicks,
          openRate: channelNotifications > 0 ? channelOpens / channelNotifications : 0,
          clickRate: channelNotifications > 0 ? channelClicks / channelNotifications : 0,
        };
      }

      return {
        totalNotifications,
        opens: totalOpens,
        clicks: totalClicks,
        openRate: totalNotifications > 0 ? totalOpens / totalNotifications : 0,
        clickRate: totalNotifications > 0 ? totalClicks / totalNotifications : 0,
        engagementByChannel,
      };
    } finally {
      client.release();
    }
  }

  // =====================
  // Helper Methods
  // =====================

  /**
   * Build date range query conditions
   */
  private buildDateRangeQuery(
    dateColumns: string[],
    dateRange?: DateRange,
    baseParams: any[] = [],
    additionalWhereClause?: string
  ): { whereClause: string; params: any[] } {
    let whereClause = additionalWhereClause ? `WHERE ${additionalWhereClause}` : '';
    const params = [...baseParams];

    if (dateRange) {
      const dateConditions = dateColumns.map(column => 
        `${column} >= $${params.length + 1} AND ${column} <= $${params.length + 2}`
      ).join(' AND ');
      
      if (whereClause) {
        whereClause += ` AND ${dateConditions}`;
      } else {
        whereClause = `WHERE ${dateConditions}`;
      }
      
      params.push(dateRange.from, dateRange.to);
    }

    return { whereClause, params };
  }

  /**
   * Get date format string for different granularities
   */
  private getDateFormat(granularity: 'hour' | 'day' | 'week' | 'month'): string {
    switch (granularity) {
      case 'hour':
        return 'YYYY-MM-DD HH24';
      case 'day':
        return 'YYYY-MM-DD';
      case 'week':
        return 'YYYY-WW';
      case 'month':
        return 'YYYY-MM';
      default:
        return 'YYYY-MM-DD';
    }
  }
}