import { Pool } from 'pg';
import { z } from 'zod';
import {
  AlertDefinition,
  AlertDefinitionSchema,
  CreateAlertRequest,
  CreateAlertRequestSchema,
  UpdateAlertRequest,
  UpdateAlertRequestSchema,
  AlertListOptions,
  AlertListOptionsSchema,
  AlertWithDetails,
  AlertWithDetailsSchema,
  PaginatedAlertsResponse,
  TriggerConditions,
  ScheduleConfig,
  NotificationChannelConfig,
} from '../../shared/types/search-alerts.js';
import { SavedSearchService } from '../saved-search/saved-search-service.js';

/**
 * Alert Management Service
 * 
 * Provides comprehensive CRUD operations for search alert definitions including:
 * - Create, read, update, delete alert definitions
 * - Schedule validation and parsing
 * - Alert condition evaluation
 * - Integration with saved search service
 * - Alert activation and deactivation
 * - Bulk operations for alert management
 */
export class AlertService {
  private db: Pool;
  private savedSearchService: SavedSearchService;

  constructor(db: Pool, savedSearchService: SavedSearchService) {
    this.db = db;
    this.savedSearchService = savedSearchService;
  }

  /**
   * Create a new alert definition
   */
  async createAlert(userId: string, request: CreateAlertRequest): Promise<AlertDefinition> {
    // Validate request
    const validatedRequest = CreateAlertRequestSchema.parse(request);
    
    // Verify user owns the saved search
    const savedSearch = await this.savedSearchService.getSearch(validatedRequest.savedSearchId, userId);
    if (!savedSearch) {
      throw new Error('Saved search not found or access denied');
    }

    // Validate schedule configuration
    this.validateScheduleConfig(validatedRequest.scheduleConfig);
    
    // Validate trigger conditions
    this.validateTriggerConditions(validatedRequest.triggerConditions);

    const client = await this.db.connect();
    try {
      const nextScheduledAt = this.calculateNextScheduledTime(validatedRequest.scheduleConfig);
      
      const result = await client.query(`
        INSERT INTO alert_definitions (
          saved_search_id, owner_id, name, description, is_active,
          trigger_conditions, result_threshold, change_detection,
          schedule_type, schedule_config, timezone,
          notification_channels, notification_template_id,
          max_alerts_per_day, max_alerts_per_hour,
          next_scheduled_at
        ) VALUES (
          $1, $2, $3, $4, true,
          $5, $6, $7,
          $8, $9, $10,
          $11, $12,
          $13, $14,
          $15
        ) RETURNING *
      `, [
        validatedRequest.savedSearchId,
        userId,
        validatedRequest.name,
        validatedRequest.description,
        JSON.stringify(validatedRequest.triggerConditions),
        validatedRequest.triggerConditions.resultThreshold,
        validatedRequest.triggerConditions.changeDetection,
        validatedRequest.scheduleConfig.type,
        JSON.stringify(validatedRequest.scheduleConfig),
        validatedRequest.scheduleConfig.timezone,
        JSON.stringify(validatedRequest.notificationChannels),
        validatedRequest.notificationTemplateId,
        validatedRequest.maxAlertsPerDay,
        validatedRequest.maxAlertsPerHour,
        nextScheduledAt,
      ]);

      return this.mapDatabaseRowToAlert(result.rows[0]);
    } finally {
      client.release();
    }
  }

  /**
   * Get alert definition by ID with access control
   */
  async getAlert(alertId: string, userId: string): Promise<AlertDefinition | null> {
    const client = await this.db.connect();
    try {
      const result = await client.query(`
        SELECT ad.*, ss.name as saved_search_name, ss.query_data
        FROM alert_definitions ad
        JOIN saved_searches ss ON ad.saved_search_id = ss.id
        WHERE ad.id = $1 AND ad.owner_id = $2
      `, [alertId, userId]);

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapDatabaseRowToAlert(result.rows[0]);
    } finally {
      client.release();
    }
  }

  /**
   * Get alert with full details including related data
   */
  async getAlertWithDetails(alertId: string, userId: string): Promise<AlertWithDetails | null> {
    const client = await this.db.connect();
    try {
      const result = await client.query(`
        SELECT 
          ad.*,
          ss.name as saved_search_name,
          ss.query_data,
          nt.name as template_name,
          nt.template_type,
          nt.body_template,
          (SELECT COUNT(*) FROM alert_subscriptions WHERE alert_definition_id = ad.id AND is_active = true) as subscription_count,
          (SELECT COUNT(*) FROM alert_executions WHERE alert_definition_id = ad.id) as execution_count
        FROM alert_definitions ad
        JOIN saved_searches ss ON ad.saved_search_id = ss.id
        LEFT JOIN notification_templates nt ON ad.notification_template_id = nt.id
        WHERE ad.id = $1 AND ad.owner_id = $2
      `, [alertId, userId]);

      if (result.rows.length === 0) {
        return null;
      }

      const alertData = result.rows[0];
      
      // Get recent executions
      const executionsResult = await client.query(`
        SELECT * FROM alert_executions
        WHERE alert_definition_id = $1
        ORDER BY executed_at DESC
        LIMIT 10
      `, [alertId]);

      const alert = this.mapDatabaseRowToAlert(alertData);
      
      return {
        ...alert,
        savedSearch: {
          id: alertData.saved_search_id,
          name: alertData.saved_search_name,
          queryData: alertData.query_data,
        },
        notificationTemplate: alertData.template_name ? {
          id: alertData.notification_template_id,
          ownerId: userId,
          name: alertData.template_name,
          templateType: alertData.template_type,
          subjectTemplate: '',
          bodyTemplate: alertData.body_template,
          templateVariables: {},
          format: 'plain' as const,
          stylingOptions: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        } : undefined,
        recentExecutions: executionsResult.rows.map(row => ({
          id: row.id,
          alertDefinitionId: row.alert_definition_id,
          executedAt: row.executed_at,
          executionDurationMs: row.execution_duration_ms,
          triggerReason: row.trigger_reason,
          searchExecuted: row.search_executed,
          resultCount: row.result_count,
          resultSummary: row.result_summary,
          resultsChanged: row.results_changed,
          changeSummary: row.change_summary,
          status: row.status,
          errorMessage: row.error_message,
          notificationsSent: row.notifications_sent,
          notificationFailures: row.notification_failures,
          notificationDetails: row.notification_details,
        })),
        subscriptionCount: parseInt(alertData.subscription_count),
        nextExecution: alertData.next_scheduled_at,
      } as AlertWithDetails;
    } finally {
      client.release();
    }
  }

  /**
   * List alerts with pagination and filtering
   */
  async listAlerts(userId: string, options: AlertListOptions = {}): Promise<PaginatedAlertsResponse<AlertDefinition>> {
    const validatedOptions = AlertListOptionsSchema.parse(options);
    
    const client = await this.db.connect();
    try {
      let whereConditions = ['ad.owner_id = $1'];
      let params: any[] = [userId];
      let paramIndex = 2;

      // Add filters
      if (validatedOptions.isActive !== undefined) {
        whereConditions.push(`ad.is_active = $${paramIndex}`);
        params.push(validatedOptions.isActive);
        paramIndex++;
      }

      if (validatedOptions.scheduleType) {
        whereConditions.push(`ad.schedule_type = $${paramIndex}`);
        params.push(validatedOptions.scheduleType);
        paramIndex++;
      }

      if (validatedOptions.savedSearchId) {
        whereConditions.push(`ad.saved_search_id = $${paramIndex}`);
        params.push(validatedOptions.savedSearchId);
        paramIndex++;
      }

      if (validatedOptions.query) {
        whereConditions.push(`(ad.name ILIKE $${paramIndex} OR ad.description ILIKE $${paramIndex})`);
        params.push(`%${validatedOptions.query}%`);
        paramIndex++;
      }

      const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

      // Get total count
      const countResult = await client.query(`
        SELECT COUNT(*) as total
        FROM alert_definitions ad
        ${whereClause}
      `, params);

      const totalItems = parseInt(countResult.rows[0].total);
      const totalPages = Math.ceil(totalItems / validatedOptions.limit);

      // Get paginated results
      const offset = (validatedOptions.page - 1) * validatedOptions.limit;
      
      const result = await client.query(`
        SELECT ad.*, ss.name as saved_search_name, ss.query_data
        FROM alert_definitions ad
        JOIN saved_searches ss ON ad.saved_search_id = ss.id
        ${whereClause}
        ORDER BY ad.${validatedOptions.sortBy} ${validatedOptions.sortOrder}
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `, [...params, validatedOptions.limit, offset]);

      const alerts = result.rows.map(row => this.mapDatabaseRowToAlert(row));

      return {
        items: alerts,
        totalItems,
        totalPages,
        currentPage: validatedOptions.page,
        hasNextPage: validatedOptions.page < totalPages,
        hasPreviousPage: validatedOptions.page > 1,
      };
    } finally {
      client.release();
    }
  }

  /**
   * Update alert definition
   */
  async updateAlert(alertId: string, userId: string, request: UpdateAlertRequest): Promise<AlertDefinition> {
    const validatedRequest = UpdateAlertRequestSchema.parse(request);
    
    // Verify user owns the alert
    const existingAlert = await this.getAlert(alertId, userId);
    if (!existingAlert) {
      throw new Error('Alert not found or access denied');
    }

    // Validate updated schedule config if provided
    if (validatedRequest.scheduleConfig) {
      this.validateScheduleConfig(validatedRequest.scheduleConfig);
    }

    // Validate updated trigger conditions if provided
    if (validatedRequest.triggerConditions) {
      this.validateTriggerConditions(validatedRequest.triggerConditions);
    }

    const client = await this.db.connect();
    try {
      const updates: string[] = [];
      const params: any[] = [alertId, userId];
      let paramIndex = 3;

      if (validatedRequest.name !== undefined) {
        updates.push(`name = $${paramIndex}`);
        params.push(validatedRequest.name);
        paramIndex++;
      }

      if (validatedRequest.description !== undefined) {
        updates.push(`description = $${paramIndex}`);
        params.push(validatedRequest.description);
        paramIndex++;
      }

      if (validatedRequest.triggerConditions !== undefined) {
        updates.push(`trigger_conditions = $${paramIndex}`);
        params.push(JSON.stringify(validatedRequest.triggerConditions));
        paramIndex++;

        if (validatedRequest.triggerConditions.resultThreshold !== undefined) {
          updates.push(`result_threshold = $${paramIndex}`);
          params.push(validatedRequest.triggerConditions.resultThreshold);
          paramIndex++;
        }

        if (validatedRequest.triggerConditions.changeDetection !== undefined) {
          updates.push(`change_detection = $${paramIndex}`);
          params.push(validatedRequest.triggerConditions.changeDetection);
          paramIndex++;
        }
      }

      if (validatedRequest.scheduleConfig !== undefined) {
        updates.push(`schedule_type = $${paramIndex}`);
        params.push(validatedRequest.scheduleConfig.type);
        paramIndex++;

        updates.push(`schedule_config = $${paramIndex}`);
        params.push(JSON.stringify(validatedRequest.scheduleConfig));
        paramIndex++;

        updates.push(`timezone = $${paramIndex}`);
        params.push(validatedRequest.scheduleConfig.timezone);
        paramIndex++;

        const nextScheduledAt = this.calculateNextScheduledTime(validatedRequest.scheduleConfig);
        updates.push(`next_scheduled_at = $${paramIndex}`);
        params.push(nextScheduledAt);
        paramIndex++;
      }

      if (validatedRequest.notificationChannels !== undefined) {
        updates.push(`notification_channels = $${paramIndex}`);
        params.push(JSON.stringify(validatedRequest.notificationChannels));
        paramIndex++;
      }

      if (validatedRequest.notificationTemplateId !== undefined) {
        updates.push(`notification_template_id = $${paramIndex}`);
        params.push(validatedRequest.notificationTemplateId);
        paramIndex++;
      }

      if (validatedRequest.isActive !== undefined) {
        updates.push(`is_active = $${paramIndex}`);
        params.push(validatedRequest.isActive);
        paramIndex++;
      }

      if (validatedRequest.maxAlertsPerDay !== undefined) {
        updates.push(`max_alerts_per_day = $${paramIndex}`);
        params.push(validatedRequest.maxAlertsPerDay);
        paramIndex++;
      }

      if (validatedRequest.maxAlertsPerHour !== undefined) {
        updates.push(`max_alerts_per_hour = $${paramIndex}`);
        params.push(validatedRequest.maxAlertsPerHour);
        paramIndex++;
      }

      updates.push(`updated_at = CURRENT_TIMESTAMP`);

      const result = await client.query(`
        UPDATE alert_definitions 
        SET ${updates.join(', ')}
        WHERE id = $1 AND owner_id = $2
        RETURNING *
      `, params);

      if (result.rows.length === 0) {
        throw new Error('Alert not found or update failed');
      }

      return this.mapDatabaseRowToAlert(result.rows[0]);
    } finally {
      client.release();
    }
  }

  /**
   * Delete alert definition
   */
  async deleteAlert(alertId: string, userId: string): Promise<void> {
    const client = await this.db.connect();
    try {
      const result = await client.query(`
        DELETE FROM alert_definitions 
        WHERE id = $1 AND owner_id = $2
      `, [alertId, userId]);

      if (result.rowCount === 0) {
        throw new Error('Alert not found or access denied');
      }
    } finally {
      client.release();
    }
  }

  /**
   * Activate or deactivate an alert
   */
  async setAlertActive(alertId: string, userId: string, isActive: boolean): Promise<AlertDefinition> {
    const client = await this.db.connect();
    try {
      const nextScheduledAt = isActive ? await this.calculateNextScheduledTimeFromDatabase(alertId) : null;
      
      const result = await client.query(`
        UPDATE alert_definitions 
        SET is_active = $3, next_scheduled_at = $4, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND owner_id = $2
        RETURNING *
      `, [alertId, userId, isActive, nextScheduledAt]);

      if (result.rows.length === 0) {
        throw new Error('Alert not found or access denied');
      }

      return this.mapDatabaseRowToAlert(result.rows[0]);
    } finally {
      client.release();
    }
  }

  /**
   * Get alerts ready for execution
   */
  async getAlertsReadyForExecution(limit: number = 100): Promise<AlertDefinition[]> {
    const client = await this.db.connect();
    try {
      const result = await client.query(`
        SELECT ad.*, ss.name as saved_search_name, ss.query_data
        FROM alert_definitions ad
        JOIN saved_searches ss ON ad.saved_search_id = ss.id
        WHERE ad.is_active = true 
        AND ad.next_scheduled_at IS NOT NULL 
        AND ad.next_scheduled_at <= CURRENT_TIMESTAMP
        ORDER BY ad.next_scheduled_at ASC
        LIMIT $1
      `, [limit]);

      return result.rows.map(row => this.mapDatabaseRowToAlert(row));
    } finally {
      client.release();
    }
  }

  /**
   * Update alert's next scheduled time after execution
   */
  async updateNextScheduledTime(alertId: string, nextScheduledAt: Date | null): Promise<void> {
    const client = await this.db.connect();
    try {
      await client.query(`
        UPDATE alert_definitions 
        SET next_scheduled_at = $2, last_triggered_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [alertId, nextScheduledAt]);
    } finally {
      client.release();
    }
  }

  /**
   * Validate schedule configuration
   */
  private validateScheduleConfig(config: ScheduleConfig): void {
    if (config.type === 'interval' && !config.interval) {
      throw new Error('Interval configuration is required for interval schedule type');
    }

    if (config.type === 'cron' && !config.cronExpression) {
      throw new Error('Cron expression is required for cron schedule type');
    }

    if (config.interval) {
      if (config.interval.value <= 0) {
        throw new Error('Interval value must be positive');
      }

      if (config.interval.unit === 'minutes' && config.interval.value < 5) {
        throw new Error('Minimum interval is 5 minutes');
      }
    }

    if (config.cronExpression) {
      // Basic cron validation - would use a proper cron parser in production
      const parts = config.cronExpression.split(' ');
      if (parts.length < 5 || parts.length > 6) {
        throw new Error('Invalid cron expression format');
      }
    }
  }

  /**
   * Validate trigger conditions
   */
  private validateTriggerConditions(conditions: TriggerConditions): void {
    if (conditions.resultThreshold !== undefined && conditions.resultThreshold < 0) {
      throw new Error('Result threshold must be non-negative');
    }

    if (conditions.resultIncrease !== undefined) {
      if (conditions.resultIncrease < 0 || conditions.resultIncrease > 100) {
        throw new Error('Result increase must be between 0 and 100 percent');
      }
    }

    if (conditions.resultDecrease !== undefined) {
      if (conditions.resultDecrease < 0 || conditions.resultDecrease > 100) {
        throw new Error('Result decrease must be between 0 and 100 percent');
      }
    }

    if (conditions.customConditions) {
      for (const condition of conditions.customConditions) {
        if (!condition.field || !condition.operator || condition.value === undefined) {
          throw new Error('Custom conditions must have field, operator, and value');
        }
      }
    }
  }

  /**
   * Calculate next scheduled time based on configuration
   */
  private calculateNextScheduledTime(config: ScheduleConfig): Date | null {
    if (config.type === 'manual') {
      return null;
    }

    const now = new Date();

    if (config.type === 'interval' && config.interval) {
      const milliseconds = this.intervalToMilliseconds(config.interval);
      return new Date(now.getTime() + milliseconds);
    }

    if (config.type === 'cron' && config.cronExpression) {
      // In a real implementation, use a proper cron parser like 'cron-parser'
      // For now, return a basic daily schedule
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(9, 0, 0, 0); // 9 AM
      return tomorrow;
    }

    if (config.type === 'real_time') {
      // Real-time alerts don't have scheduled times
      return null;
    }

    return null;
  }

  /**
   * Calculate next scheduled time from database configuration
   */
  private async calculateNextScheduledTimeFromDatabase(alertId: string): Promise<Date | null> {
    const client = await this.db.connect();
    try {
      const result = await client.query(`
        SELECT schedule_config FROM alert_definitions WHERE id = $1
      `, [alertId]);

      if (result.rows.length === 0) {
        return null;
      }

      const scheduleConfig = result.rows[0].schedule_config;
      return this.calculateNextScheduledTime(scheduleConfig);
    } finally {
      client.release();
    }
  }

  /**
   * Convert interval to milliseconds
   */
  private intervalToMilliseconds(interval: { value: number; unit: 'minutes' | 'hours' | 'days' }): number {
    const { value, unit } = interval;
    switch (unit) {
      case 'minutes':
        return value * 60 * 1000;
      case 'hours':
        return value * 60 * 60 * 1000;
      case 'days':
        return value * 24 * 60 * 60 * 1000;
      default:
        throw new Error(`Unknown interval unit: ${unit}`);
    }
  }

  /**
   * Map database row to AlertDefinition object
   */
  private mapDatabaseRowToAlert(row: any): AlertDefinition {
    return {
      id: row.id,
      savedSearchId: row.saved_search_id,
      ownerId: row.owner_id,
      name: row.name,
      description: row.description,
      isActive: row.is_active,
      triggerConditions: row.trigger_conditions,
      resultThreshold: row.result_threshold,
      changeDetection: row.change_detection,
      scheduleType: row.schedule_type,
      scheduleConfig: row.schedule_config,
      timezone: row.timezone,
      notificationChannels: row.notification_channels,
      notificationTemplateId: row.notification_template_id,
      maxAlertsPerDay: row.max_alerts_per_day,
      maxAlertsPerHour: row.max_alerts_per_hour,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastTriggeredAt: row.last_triggered_at,
      nextScheduledAt: row.next_scheduled_at,
    };
  }
}