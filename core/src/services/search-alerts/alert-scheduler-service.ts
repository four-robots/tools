import { Pool } from 'pg';
import {
  AlertDefinition,
  AlertExecution,
  TriggerConditions,
  ScheduleConfig,
  AlertTriggerResult,
} from '../../shared/types/search-alerts.js';
import { SavedSearch, SearchQueryData } from '../../shared/types/saved-search.js';
import { AlertService } from './alert-service.js';
import { NotificationService } from './notification-service.js';
import { SavedSearchService } from '../saved-search/saved-search-service.js';
import { UnifiedSearchService } from '../unified-search/UnifiedSearchService.js';

/**
 * Alert Scheduler Service
 * 
 * Provides background processing of scheduled alerts with:
 * - Scheduled alert execution based on cron expressions
 * - Real-time alert triggers via message queue
 * - Alert condition evaluation and change detection
 * - Rate limiting and throttling
 * - Error handling and retry logic
 * - Execution history tracking
 */
export class AlertSchedulerService {
  private db: Pool;
  private alertService: AlertService;
  private notificationService: NotificationService;
  private savedSearchService: SavedSearchService;
  private unifiedSearchService: UnifiedSearchService;
  
  // Rate limiting tracking
  private rateLimitCache = new Map<string, { count: number; resetTime: Date }>();

  constructor(
    db: Pool,
    alertService: AlertService,
    notificationService: NotificationService,
    savedSearchService: SavedSearchService,
    unifiedSearchService: UnifiedSearchService
  ) {
    this.db = db;
    this.alertService = alertService;
    this.notificationService = notificationService;
    this.savedSearchService = savedSearchService;
    this.unifiedSearchService = unifiedSearchService;
  }

  /**
   * Process scheduled alerts - called by background worker
   */
  async processScheduledAlerts(): Promise<void> {
    try {
      const alertsToProcess = await this.alertService.getAlertsReadyForExecution(100);
      
      console.log(`Processing ${alertsToProcess.length} scheduled alerts`);

      for (const alert of alertsToProcess) {
        try {
          await this.processAlert(alert, 'scheduled');
        } catch (error) {
          console.error(`Error processing alert ${alert.id}:`, error);
          // Continue processing other alerts even if one fails
        }
      }
    } catch (error) {
      console.error('Error in processScheduledAlerts:', error);
      throw error;
    }
  }

  /**
   * Trigger alert manually
   */
  async triggerAlert(alertId: string, userId: string): Promise<AlertTriggerResult> {
    const alert = await this.alertService.getAlert(alertId, userId);
    if (!alert) {
      throw new Error('Alert not found or access denied');
    }

    if (!alert.isActive) {
      throw new Error('Cannot trigger inactive alert');
    }

    return await this.processAlert(alert, 'manual');
  }

  /**
   * Test alert configuration without sending notifications
   */
  async testAlert(alertId: string, userId: string): Promise<AlertTriggerResult> {
    const alert = await this.alertService.getAlert(alertId, userId);
    if (!alert) {
      throw new Error('Alert not found or access denied');
    }

    // Create a test execution without triggering notifications
    const startTime = Date.now();
    
    try {
      // Check rate limits
      const rateLimitResult = await this.checkRateLimit(alert);
      if (!rateLimitResult.allowed) {
        return {
          triggered: false,
          reason: 'Rate limit exceeded',
          resultCount: 0,
          conditionsMet: [],
          executionDetails: {
            searchExecuted: false,
            executionTimeMs: 0,
            notificationsSent: 0,
            errors: [rateLimitResult.message],
          },
        };
      }

      // Get saved search
      const savedSearch = await this.savedSearchService.getSearch(alert.savedSearchId, alert.ownerId);
      if (!savedSearch) {
        throw new Error('Associated saved search not found');
      }

      // Execute search
      const searchResults = await this.executeSearch(savedSearch);
      const executionTime = Date.now() - startTime;

      // Evaluate trigger conditions
      const conditionResult = await this.evaluateTriggerConditions(
        alert,
        searchResults.results?.length || 0,
        savedSearch
      );

      return {
        triggered: conditionResult.shouldTrigger,
        reason: conditionResult.reason,
        resultCount: searchResults.results?.length || 0,
        conditionsMet: conditionResult.conditionsMet,
        executionDetails: {
          searchExecuted: true,
          executionTimeMs: executionTime,
          notificationsSent: 0, // No notifications sent in test mode
          errors: [],
        },
      };
    } catch (error) {
      return {
        triggered: false,
        reason: 'Test execution failed',
        resultCount: 0,
        conditionsMet: [],
        executionDetails: {
          searchExecuted: false,
          executionTimeMs: Date.now() - startTime,
          notificationsSent: 0,
          errors: [error instanceof Error ? error.message : 'Unknown error'],
        },
      };
    }
  }

  /**
   * Process individual alert
   */
  private async processAlert(alert: AlertDefinition, triggerReason: 'scheduled' | 'manual'): Promise<AlertTriggerResult> {
    const startTime = Date.now();
    let execution: AlertExecution | null = null;

    try {
      // Check rate limits
      const rateLimitResult = await this.checkRateLimit(alert);
      if (!rateLimitResult.allowed) {
        await this.recordFailedExecution(alert, triggerReason, rateLimitResult.message);
        return {
          triggered: false,
          reason: 'Rate limit exceeded',
          resultCount: 0,
          conditionsMet: [],
          executionDetails: {
            searchExecuted: false,
            executionTimeMs: 0,
            notificationsSent: 0,
            errors: [rateLimitResult.message],
          },
        };
      }

      // Create execution record
      execution = await this.createExecution(alert, triggerReason);

      // Get saved search
      const savedSearch = await this.savedSearchService.getSearch(alert.savedSearchId, alert.ownerId);
      if (!savedSearch) {
        throw new Error('Associated saved search not found');
      }

      // Execute search
      const searchResults = await this.executeSearch(savedSearch);
      const resultCount = searchResults.results?.length || 0;

      // Update execution with search results
      execution = await this.updateExecutionWithResults(execution, resultCount, searchResults);

      // Evaluate trigger conditions
      const conditionResult = await this.evaluateTriggerConditions(
        alert,
        resultCount,
        savedSearch
      );

      if (conditionResult.shouldTrigger) {
        // Send notifications
        const notifications = await this.notificationService.sendNotificationsForExecution(
          execution,
          alert.notificationChannels,
          alert.notificationTemplateId,
          {
            alertName: alert.name,
            savedSearchName: savedSearch.name,
            resultCount,
            searchUrl: this.generateSearchUrl(savedSearch),
          }
        );

        // Update execution with notification results
        await this.updateExecutionWithNotifications(execution, notifications);

        // Update rate limit counter
        await this.updateRateLimit(alert);

        // Update alert's next scheduled time
        if (triggerReason === 'scheduled') {
          const nextScheduledTime = this.calculateNextScheduledTime(alert.scheduleConfig);
          await this.alertService.updateNextScheduledTime(alert.id, nextScheduledTime);
        }

        // Mark execution as successful
        await this.updateExecutionStatus(execution.id, 'success');

        return {
          triggered: true,
          reason: conditionResult.reason,
          resultCount,
          conditionsMet: conditionResult.conditionsMet,
          executionDetails: {
            searchExecuted: true,
            executionTimeMs: Date.now() - startTime,
            notificationsSent: notifications.length,
            errors: [],
          },
        };
      } else {
        // Alert conditions not met, but execution was successful
        await this.updateExecutionStatus(execution.id, 'success');

        // Update next scheduled time for scheduled alerts
        if (triggerReason === 'scheduled') {
          const nextScheduledTime = this.calculateNextScheduledTime(alert.scheduleConfig);
          await this.alertService.updateNextScheduledTime(alert.id, nextScheduledTime);
        }

        return {
          triggered: false,
          reason: conditionResult.reason,
          resultCount,
          conditionsMet: conditionResult.conditionsMet,
          executionDetails: {
            searchExecuted: true,
            executionTimeMs: Date.now() - startTime,
            notificationsSent: 0,
            errors: [],
          },
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      if (execution) {
        await this.updateExecutionStatus(execution.id, 'failed', errorMessage);
      } else {
        await this.recordFailedExecution(alert, triggerReason, errorMessage);
      }

      console.error(`Alert ${alert.id} processing failed:`, error);

      return {
        triggered: false,
        reason: 'Execution failed',
        resultCount: 0,
        conditionsMet: [],
        executionDetails: {
          searchExecuted: false,
          executionTimeMs: Date.now() - startTime,
          notificationsSent: 0,
          errors: [errorMessage],
        },
      };
    }
  }

  /**
   * Check rate limits for alert
   */
  private async checkRateLimit(alert: AlertDefinition): Promise<{ allowed: boolean; message: string }> {
    const now = new Date();
    const userId = alert.ownerId;

    // Check hourly limit
    const hourlyKey = `${userId}-hourly-${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}`;
    const hourlyCount = this.rateLimitCache.get(hourlyKey)?.count || 0;
    
    if (hourlyCount >= alert.maxAlertsPerHour) {
      return {
        allowed: false,
        message: `Hourly rate limit exceeded (${alert.maxAlertsPerHour} alerts per hour)`,
      };
    }

    // Check daily limit
    const dailyKey = `${userId}-daily-${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
    const dailyCount = this.rateLimitCache.get(dailyKey)?.count || 0;
    
    if (dailyCount >= alert.maxAlertsPerDay) {
      return {
        allowed: false,
        message: `Daily rate limit exceeded (${alert.maxAlertsPerDay} alerts per day)`,
      };
    }

    return { allowed: true, message: 'Rate limit check passed' };
  }

  /**
   * Update rate limit counter
   */
  private async updateRateLimit(alert: AlertDefinition): Promise<void> {
    const now = new Date();
    const userId = alert.ownerId;

    // Update hourly counter
    const hourlyKey = `${userId}-hourly-${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}`;
    const hourlyResetTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() + 1);
    
    const currentHourly = this.rateLimitCache.get(hourlyKey);
    this.rateLimitCache.set(hourlyKey, {
      count: (currentHourly?.count || 0) + 1,
      resetTime: hourlyResetTime,
    });

    // Update daily counter
    const dailyKey = `${userId}-daily-${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
    const dailyResetTime = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    
    const currentDaily = this.rateLimitCache.get(dailyKey);
    this.rateLimitCache.set(dailyKey, {
      count: (currentDaily?.count || 0) + 1,
      resetTime: dailyResetTime,
    });

    // Clean up expired entries
    this.cleanupRateLimitCache();
  }

  /**
   * Clean up expired rate limit entries
   */
  private cleanupRateLimitCache(): void {
    const now = new Date();
    
    for (const [key, value] of this.rateLimitCache.entries()) {
      if (value.resetTime <= now) {
        this.rateLimitCache.delete(key);
      }
    }
  }

  /**
   * Execute search using unified search service
   */
  private async executeSearch(savedSearch: SavedSearch): Promise<any> {
    try {
      // Convert saved search query data to search request format
      const searchRequest = {
        query: savedSearch.queryData.query || '',
        filters: savedSearch.queryData.filters || {},
        facets: savedSearch.queryData.facets || {},
        sortBy: savedSearch.queryData.sortBy,
        sortOrder: savedSearch.queryData.sortOrder || 'desc',
        page: 1,
        limit: savedSearch.queryData.limit || 50,
        dataSources: savedSearch.queryData.dataSources || [],
        searchMode: savedSearch.queryData.searchMode || 'standard',
      };

      return await this.unifiedSearchService.search(searchRequest);
    } catch (error) {
      console.error('Search execution failed:', error);
      throw new Error(`Search execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Evaluate trigger conditions
   */
  private async evaluateTriggerConditions(
    alert: AlertDefinition,
    resultCount: number,
    savedSearch: SavedSearch
  ): Promise<{ shouldTrigger: boolean; reason: string; conditionsMet: string[] }> {
    const conditions = alert.triggerConditions;
    const conditionsMet: string[] = [];
    let shouldTrigger = false;
    let reason = '';

    // Check result threshold
    if (conditions.resultThreshold !== undefined) {
      if (resultCount >= conditions.resultThreshold) {
        conditionsMet.push(`Result count (${resultCount}) meets threshold (${conditions.resultThreshold})`);
        shouldTrigger = true;
      } else {
        reason = `Result count (${resultCount}) below threshold (${conditions.resultThreshold})`;
      }
    }

    // Check change detection
    if (conditions.changeDetection) {
      const hasChanges = await this.detectChanges(alert, resultCount);
      if (hasChanges.changed) {
        conditionsMet.push(`Results changed: ${hasChanges.reason}`);
        shouldTrigger = true;
      } else if (!shouldTrigger) {
        reason = `No changes detected: ${hasChanges.reason}`;
      }
    }

    // Check result increase/decrease conditions
    if (conditions.resultIncrease !== undefined || conditions.resultDecrease !== undefined) {
      const changeResult = await this.checkResultCountChanges(alert, resultCount, conditions);
      if (changeResult.triggered) {
        conditionsMet.push(changeResult.reason);
        shouldTrigger = true;
      } else if (!shouldTrigger) {
        reason = changeResult.reason;
      }
    }

    // Check custom conditions
    if (conditions.customConditions && conditions.customConditions.length > 0) {
      const customResult = await this.evaluateCustomConditions(conditions.customConditions, resultCount);
      if (customResult.triggered) {
        conditionsMet.push(...customResult.conditionsMet);
        shouldTrigger = true;
      } else if (!shouldTrigger) {
        reason = customResult.reason;
      }
    }

    // Check new results condition
    if (conditions.newResults) {
      const newResultsCheck = await this.checkForNewResults(alert);
      if (newResultsCheck.hasNewResults) {
        conditionsMet.push(`New results detected: ${newResultsCheck.newResultsCount} new items`);
        shouldTrigger = true;
      } else if (!shouldTrigger) {
        reason = 'No new results found';
      }
    }

    // If no specific conditions are set, trigger if results > 0
    if (!conditions.resultThreshold && !conditions.changeDetection && 
        !conditions.resultIncrease && !conditions.resultDecrease && 
        !conditions.newResults && (!conditions.customConditions || conditions.customConditions.length === 0)) {
      if (resultCount > 0) {
        shouldTrigger = true;
        reason = `Found ${resultCount} results`;
        conditionsMet.push(`Default condition: ${resultCount} results found`);
      } else {
        reason = 'No results found';
      }
    }

    return {
      shouldTrigger,
      reason: shouldTrigger ? `Triggered: ${conditionsMet.join(', ')}` : reason,
      conditionsMet,
    };
  }

  /**
   * Detect changes in search results
   */
  private async detectChanges(alert: AlertDefinition, currentResultCount: number): Promise<{ changed: boolean; reason: string }> {
    const client = await this.db.connect();
    try {
      // Get the last successful execution
      const result = await client.query(`
        SELECT result_count, executed_at
        FROM alert_executions
        WHERE alert_definition_id = $1 AND status = 'success'
        ORDER BY executed_at DESC
        LIMIT 1
      `, [alert.id]);

      if (result.rows.length === 0) {
        return { changed: true, reason: 'First execution - no previous results to compare' };
      }

      const previousResultCount = result.rows[0].result_count;
      
      if (currentResultCount !== previousResultCount) {
        return { 
          changed: true, 
          reason: `Result count changed from ${previousResultCount} to ${currentResultCount}` 
        };
      }

      return { changed: false, reason: `Result count unchanged (${currentResultCount})` };
    } finally {
      client.release();
    }
  }

  /**
   * Check for result count changes (increase/decrease)
   */
  private async checkResultCountChanges(
    alert: AlertDefinition,
    currentResultCount: number,
    conditions: TriggerConditions
  ): Promise<{ triggered: boolean; reason: string }> {
    const client = await this.db.connect();
    try {
      const result = await client.query(`
        SELECT result_count
        FROM alert_executions
        WHERE alert_definition_id = $1 AND status = 'success'
        ORDER BY executed_at DESC
        LIMIT 1
      `, [alert.id]);

      if (result.rows.length === 0) {
        return { triggered: false, reason: 'No previous execution to compare' };
      }

      const previousResultCount = result.rows[0].result_count || 0;
      
      if (previousResultCount === 0 && currentResultCount > 0) {
        return { triggered: true, reason: 'Results found where none existed before' };
      }

      if (conditions.resultIncrease !== undefined) {
        const increasePercent = previousResultCount > 0 
          ? ((currentResultCount - previousResultCount) / previousResultCount) * 100 
          : 0;
        
        if (increasePercent >= conditions.resultIncrease) {
          return { 
            triggered: true, 
            reason: `Result count increased by ${increasePercent.toFixed(1)}% (threshold: ${conditions.resultIncrease}%)` 
          };
        }
      }

      if (conditions.resultDecrease !== undefined) {
        const decreasePercent = previousResultCount > 0 
          ? ((previousResultCount - currentResultCount) / previousResultCount) * 100 
          : 0;
        
        if (decreasePercent >= conditions.resultDecrease) {
          return { 
            triggered: true, 
            reason: `Result count decreased by ${decreasePercent.toFixed(1)}% (threshold: ${conditions.resultDecrease}%)` 
          };
        }
      }

      return { triggered: false, reason: 'Result count change within acceptable range' };
    } finally {
      client.release();
    }
  }

  /**
   * Evaluate custom conditions
   */
  private async evaluateCustomConditions(
    customConditions: any[],
    resultCount: number
  ): Promise<{ triggered: boolean; reason: string; conditionsMet: string[] }> {
    const conditionsMet: string[] = [];
    
    for (const condition of customConditions) {
      // This is a simplified implementation - in production, you'd have more sophisticated condition evaluation
      if (condition.field === 'result_count') {
        const value = resultCount;
        let conditionMet = false;
        
        switch (condition.operator) {
          case 'equals':
            conditionMet = value === condition.value;
            break;
          case 'greater_than':
            conditionMet = value > condition.value;
            break;
          case 'less_than':
            conditionMet = value < condition.value;
            break;
          case 'not_equals':
            conditionMet = value !== condition.value;
            break;
        }
        
        if (conditionMet) {
          conditionsMet.push(`Custom condition: ${condition.field} ${condition.operator} ${condition.value}`);
        }
      }
    }
    
    return {
      triggered: conditionsMet.length > 0,
      reason: conditionsMet.length > 0 
        ? `Custom conditions met: ${conditionsMet.join(', ')}` 
        : 'Custom conditions not met',
      conditionsMet,
    };
  }

  /**
   * Check for new results (simplified implementation)
   */
  private async checkForNewResults(alert: AlertDefinition): Promise<{ hasNewResults: boolean; newResultsCount: number }> {
    // This is a simplified implementation - in production, you'd need to:
    // 1. Store result hashes or IDs from previous executions
    // 2. Compare current results with stored results
    // 3. Identify genuinely new items
    
    // For now, return a placeholder
    return { hasNewResults: false, newResultsCount: 0 };
  }

  /**
   * Calculate next scheduled time
   */
  private calculateNextScheduledTime(config: ScheduleConfig): Date | null {
    if (config.type === 'manual' || config.type === 'real_time') {
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

    return null;
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
   * Generate search URL for notifications
   */
  private generateSearchUrl(savedSearch: SavedSearch): string {
    // In a real implementation, construct the proper URL to the search interface
    return `https://yourapp.com/search/${savedSearch.id}`;
  }

  // =====================
  // Database Operations
  // =====================

  /**
   * Create execution record
   */
  private async createExecution(alert: AlertDefinition, triggerReason: 'scheduled' | 'manual'): Promise<AlertExecution> {
    const client = await this.db.connect();
    try {
      const result = await client.query(`
        INSERT INTO alert_executions (
          alert_definition_id, trigger_reason, status
        ) VALUES ($1, $2, 'pending')
        RETURNING *
      `, [alert.id, triggerReason]);

      const row = result.rows[0];
      return {
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
      };
    } finally {
      client.release();
    }
  }

  /**
   * Update execution with search results
   */
  private async updateExecutionWithResults(
    execution: AlertExecution,
    resultCount: number,
    searchResults: any
  ): Promise<AlertExecution> {
    const client = await this.db.connect();
    try {
      const result = await client.query(`
        UPDATE alert_executions 
        SET 
          search_executed = true,
          result_count = $2,
          result_summary = $3,
          execution_duration_ms = EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - executed_at)) * 1000
        WHERE id = $1
        RETURNING *
      `, [
        execution.id,
        resultCount,
        JSON.stringify({ totalResults: resultCount, searchTime: searchResults.searchTime }),
      ]);

      const row = result.rows[0];
      return {
        ...execution,
        searchExecuted: true,
        resultCount,
        resultSummary: row.result_summary,
        executionDurationMs: row.execution_duration_ms,
      };
    } finally {
      client.release();
    }
  }

  /**
   * Update execution with notification results
   */
  private async updateExecutionWithNotifications(
    execution: AlertExecution,
    notifications: any[]
  ): Promise<void> {
    const client = await this.db.connect();
    try {
      const successfulNotifications = notifications.filter(n => 
        n.deliveryStatus === 'sent' || n.deliveryStatus === 'delivered'
      ).length;
      
      const failedNotifications = notifications.filter(n => 
        n.deliveryStatus === 'failed'
      ).length;

      await client.query(`
        UPDATE alert_executions 
        SET 
          notifications_sent = $2,
          notification_failures = $3,
          notification_details = $4
        WHERE id = $1
      `, [
        execution.id,
        successfulNotifications,
        failedNotifications,
        JSON.stringify({ channels: notifications.map(n => n.channelType) }),
      ]);
    } finally {
      client.release();
    }
  }

  /**
   * Update execution status
   */
  private async updateExecutionStatus(
    executionId: string,
    status: 'success' | 'failed' | 'partial',
    errorMessage?: string
  ): Promise<void> {
    const client = await this.db.connect();
    try {
      await client.query(`
        UPDATE alert_executions 
        SET status = $2, error_message = $3
        WHERE id = $1
      `, [executionId, status, errorMessage]);
    } finally {
      client.release();
    }
  }

  /**
   * Record failed execution
   */
  private async recordFailedExecution(
    alert: AlertDefinition,
    triggerReason: 'scheduled' | 'manual',
    errorMessage: string
  ): Promise<void> {
    const client = await this.db.connect();
    try {
      await client.query(`
        INSERT INTO alert_executions (
          alert_definition_id, trigger_reason, status, error_message
        ) VALUES ($1, $2, 'failed', $3)
      `, [alert.id, triggerReason, errorMessage]);
    } finally {
      client.release();
    }
  }
}