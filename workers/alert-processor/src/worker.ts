import { Pool } from 'pg';
import { createLogger, Logger } from 'winston';
import * as cron from 'node-cron';
import pLimit from 'p-limit';
import { Config } from './config.js';
import {
  AlertService,
  NotificationService, 
  AlertSchedulerService,
  SavedSearchService,
  UnifiedSearchService,
} from '@mcp-tools/core';

/**
 * Alert Processor Worker
 * 
 * Background worker responsible for:
 * - Processing scheduled alerts based on their schedule configuration
 * - Executing search queries and evaluating trigger conditions
 * - Sending notifications through various channels (email, webhook, SMS, in-app)
 * - Handling retries and error recovery
 * - Rate limiting and throttling
 * - Metrics collection and health monitoring
 */
export class AlertProcessorWorker {
  private db: Pool;
  private config: Config;
  private logger: Logger;
  
  // Services
  private alertService: AlertService;
  private notificationService: NotificationService;
  private alertSchedulerService: AlertSchedulerService;
  private savedSearchService: SavedSearchService;
  private unifiedSearchService: UnifiedSearchService;
  
  // Worker state
  private isRunning = false;
  private scheduledTasks: Map<string, any> = new Map();
  private processingLimit = pLimit(10); // Limit concurrent processing
  private shutdownRequested = false;
  
  // Metrics
  private metrics = {
    alertsProcessed: 0,
    alertsSucceeded: 0,
    alertsFailed: 0,
    notificationsSent: 0,
    notificationsFailed: 0,
    lastProcessedAt: new Date(),
    startedAt: new Date(),
  };

  constructor(config: Config, db: Pool, logger: Logger) {
    this.config = config;
    this.db = db;
    this.logger = logger;
    
    // Initialize services
    this.savedSearchService = new SavedSearchService(db);
    this.alertService = new AlertService(db, this.savedSearchService);
    this.notificationService = new NotificationService(db);
    this.unifiedSearchService = new UnifiedSearchService(/* configuration */);
    this.alertSchedulerService = new AlertSchedulerService(
      db,
      this.alertService,
      this.notificationService,
      this.savedSearchService,
      this.unifiedSearchService
    );
    
    this.processingLimit = pLimit(config.worker.maxConcurrentAlerts);
  }

  /**
   * Start the alert processor worker
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Alert processor is already running');
    }

    this.logger.info('Starting Alert Processor Worker', {
      config: {
        processInterval: this.config.worker.processInterval,
        maxConcurrentAlerts: this.config.worker.maxConcurrentAlerts,
        notifications: this.config.notifications,
      },
    });

    try {
      // Test database connection
      await this.testDatabaseConnection();
      
      // Start main processing loop
      this.startProcessingLoop();
      
      // Start scheduled tasks
      this.startScheduledTasks();
      
      // Start metrics endpoint if enabled
      if (this.config.monitoring.enableMetrics) {
        this.startMetricsServer();
      }
      
      this.isRunning = true;
      this.metrics.startedAt = new Date();
      
      this.logger.info('Alert Processor Worker started successfully');
    } catch (error) {
      this.logger.error('Failed to start Alert Processor Worker', { error });
      throw error;
    }
  }

  /**
   * Stop the alert processor worker gracefully
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.logger.info('Stopping Alert Processor Worker...');
    this.shutdownRequested = true;
    
    try {
      // Stop scheduled tasks
      for (const [taskId, task] of this.scheduledTasks) {
        task.stop();
        this.logger.debug(`Stopped scheduled task: ${taskId}`);
      }
      this.scheduledTasks.clear();
      
      // Wait for current processing to complete (with timeout)
      const shutdownTimeout = setTimeout(() => {
        this.logger.warn('Graceful shutdown timeout reached, forcing exit');
      }, this.config.worker.gracefulShutdownTimeoutMs);
      
      // Wait for processing to complete
      await this.waitForProcessingToComplete();
      clearTimeout(shutdownTimeout);
      
      // Close database connection
      await this.db.end();
      
      this.isRunning = false;
      this.logger.info('Alert Processor Worker stopped successfully');
    } catch (error) {
      this.logger.error('Error during worker shutdown', { error });
      throw error;
    }
  }

  /**
   * Get worker status and metrics
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      metrics: {
        ...this.metrics,
        uptime: Date.now() - this.metrics.startedAt.getTime(),
        tasksScheduled: this.scheduledTasks.size,
      },
      config: {
        processInterval: this.config.worker.processInterval,
        maxConcurrentAlerts: this.config.worker.maxConcurrentAlerts,
        enabledNotifications: {
          email: this.config.notifications.enableEmail,
          webhook: this.config.notifications.enableWebhook,
          sms: this.config.notifications.enableSms,
          inApp: this.config.notifications.enableInApp,
        },
      },
    };
  }

  /**
   * Test database connection
   */
  private async testDatabaseConnection(): Promise<void> {
    try {
      const client = await this.db.connect();
      await client.query('SELECT NOW()');
      client.release();
      this.logger.info('Database connection test successful');
    } catch (error) {
      this.logger.error('Database connection test failed', { error });
      throw new Error(`Database connection failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Start the main processing loop
   */
  private startProcessingLoop(): void {
    const processAlerts = async () => {
      if (this.shutdownRequested) {
        return;
      }

      try {
        await this.processScheduledAlerts();
        this.metrics.lastProcessedAt = new Date();
      } catch (error) {
        this.logger.error('Error in processing loop', { error });
      }

      // Schedule next processing cycle
      if (!this.shutdownRequested) {
        setTimeout(processAlerts, this.config.worker.processInterval);
      }
    };

    // Start the processing loop
    processAlerts();
  }

  /**
   * Start additional scheduled tasks
   */
  private startScheduledTasks(): void {
    // Retry failed notifications every 5 minutes
    const retryTask = cron.schedule('*/5 * * * *', async () => {
      if (this.shutdownRequested) return;
      
      try {
        this.logger.debug('Running retry failed notifications task');
        await this.notificationService.retryFailedNotifications(this.config.worker.maxRetryAttempts);
      } catch (error) {
        this.logger.error('Error in retry task', { error });
      }
    }, {
      scheduled: false,
    });
    
    retryTask.start();
    this.scheduledTasks.set('retry-notifications', retryTask);

    // Cleanup old executions daily at 2 AM
    const cleanupTask = cron.schedule('0 2 * * *', async () => {
      if (this.shutdownRequested) return;
      
      try {
        this.logger.debug('Running cleanup task');
        await this.cleanupOldExecutions();
      } catch (error) {
        this.logger.error('Error in cleanup task', { error });
      }
    }, {
      scheduled: false,
    });
    
    cleanupTask.start();
    this.scheduledTasks.set('cleanup-executions', cleanupTask);
    
    this.logger.info('Scheduled tasks started', {
      tasks: Array.from(this.scheduledTasks.keys()),
    });
  }

  /**
   * Process all scheduled alerts
   */
  private async processScheduledAlerts(): Promise<void> {
    try {
      this.logger.debug('Processing scheduled alerts...');
      
      // Get alerts ready for execution
      const alertsToProcess = await this.alertService.getAlertsReadyForExecution(
        this.config.worker.maxConcurrentAlerts
      );
      
      if (alertsToProcess.length === 0) {
        this.logger.debug('No alerts ready for processing');
        return;
      }
      
      this.logger.info(`Processing ${alertsToProcess.length} scheduled alerts`);
      
      // Process alerts with concurrency limit
      const processingPromises = alertsToProcess.map(alert => 
        this.processingLimit(() => this.processAlert(alert))
      );
      
      const results = await Promise.allSettled(processingPromises);
      
      // Update metrics
      results.forEach(result => {
        this.metrics.alertsProcessed++;
        if (result.status === 'fulfilled') {
          this.metrics.alertsSucceeded++;
        } else {
          this.metrics.alertsFailed++;
          this.logger.error('Alert processing failed', { 
            error: result.reason,
          });
        }
      });
      
      this.logger.info('Completed processing scheduled alerts', {
        total: alertsToProcess.length,
        succeeded: results.filter(r => r.status === 'fulfilled').length,
        failed: results.filter(r => r.status === 'rejected').length,
      });
    } catch (error) {
      this.logger.error('Error processing scheduled alerts', { error });
      throw error;
    }
  }

  /**
   * Process individual alert
   */
  private async processAlert(alert: any): Promise<void> {
    const startTime = Date.now();
    
    try {
      this.logger.debug('Processing alert', { 
        alertId: alert.id,
        alertName: alert.name,
        scheduleType: alert.scheduleType,
      });
      
      // Process this specific alert
      const result = await this.alertSchedulerService.processAlert(alert, 'scheduled');
      
      // Update metrics based on result
      if (result) {
        this.metrics.notificationsSent++;
      }
      
      const processingTime = Date.now() - startTime;
      this.logger.info('Alert processed successfully', {
        alertId: alert.id,
        alertName: alert.name,
        processingTimeMs: processingTime,
        triggered: result !== null,
      });
    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.metrics.notificationsFailed++;
      
      this.logger.error('Alert processing failed', {
        alertId: alert.id,
        alertName: alert.name,
        processingTimeMs: processingTime,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      
      throw error;
    }
  }

  /**
   * Cleanup old alert executions (older than 90 days)
   */
  private async cleanupOldExecutions(): Promise<void> {
    try {
      const client = await this.db.connect();
      
      try {
        // Delete old executions and their associated notifications
        const result = await client.query(`
          DELETE FROM alert_executions 
          WHERE executed_at < CURRENT_TIMESTAMP - INTERVAL '90 days'
        `);
        
        this.logger.info('Cleaned up old alert executions', {
          deletedCount: result.rowCount,
        });
      } finally {
        client.release();
      }
    } catch (error) {
      this.logger.error('Error cleaning up old executions', { error });
      throw error;
    }
  }

  /**
   * Start metrics server for monitoring
   */
  private startMetricsServer(): void {
    // In a production environment, you'd typically use a proper metrics library
    // like Prometheus client. For now, we'll just log metrics periodically.
    
    const metricsTask = cron.schedule('*/1 * * * *', () => { // Every minute
      if (this.shutdownRequested) return;
      
      this.logger.info('Worker metrics', this.getStatus());
    }, {
      scheduled: false,
    });
    
    metricsTask.start();
    this.scheduledTasks.set('metrics-logging', metricsTask);
    
    this.logger.info('Metrics logging started');
  }

  /**
   * Wait for all current processing to complete
   */
  private async waitForProcessingToComplete(): Promise<void> {
    // In a more sophisticated implementation, you'd track active promises
    // and wait for them to complete. For now, we'll just wait a short time.
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}