import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { z } from 'zod';
import {
  AlertService,
  NotificationService,
  AlertSchedulerService,
  AlertAnalyticsService,
  isSearchAlertError,
  formatErrorResponse,
  logError,
  validateCreateAlertRequest,
} from '@mcp-tools/core';
import {
  CreateAlertRequest,
  CreateAlertRequestSchema,
  UpdateAlertRequest,
  UpdateAlertRequestSchema,
  AlertListOptions,
  AlertListOptionsSchema,
  CreateTemplateRequest,
  CreateTemplateRequestSchema,
  AlertTestConfig,
  AlertTestConfigSchema,
} from '@mcp-tools/core';
import { SavedSearchService } from '@mcp-tools/core';
import { UnifiedSearchService } from '@mcp-tools/core';

/**
 * Search Alerts API Routes
 * 
 * Comprehensive REST API for search alerts and notifications management:
 * 
 * Alert Management:
 * - POST   /api/v1/search-alerts                 - Create alert
 * - GET    /api/v1/search-alerts                 - List user alerts
 * - GET    /api/v1/search-alerts/:id             - Get alert details
 * - PUT    /api/v1/search-alerts/:id             - Update alert
 * - DELETE /api/v1/search-alerts/:id             - Delete alert
 * 
 * Alert Execution:
 * - POST   /api/v1/search-alerts/:id/trigger     - Manual trigger
 * - GET    /api/v1/search-alerts/:id/executions  - Execution history
 * - POST   /api/v1/search-alerts/:id/test        - Test alert setup
 * 
 * Notification Management:
 * - GET    /api/v1/search-alerts/templates       - List templates
 * - POST   /api/v1/search-alerts/templates       - Create template
 * - PUT    /api/v1/search-alerts/templates/:id   - Update template
 * - DELETE /api/v1/search-alerts/templates/:id   - Delete template
 * 
 * Subscription Management:
 * - POST   /api/v1/search-alerts/:id/subscribe   - Subscribe to alert
 * - DELETE /api/v1/search-alerts/:id/unsubscribe - Unsubscribe
 * - GET    /api/v1/search-alerts/subscriptions   - List subscriptions
 * 
 * Analytics and Monitoring:
 * - GET    /api/v1/search-alerts/:id/analytics   - Alert performance
 * - GET    /api/v1/search-alerts/user-analytics  - User alert stats
 */

export function createSearchAlertsRoutes(db: Pool): Router {
  const router = Router();
  
  // Initialize services
  const savedSearchService = new SavedSearchService(db);
  const alertService = new AlertService(db, savedSearchService);
  const notificationService = new NotificationService(db);
  const unifiedSearchService = new UnifiedSearchService(/* configuration */);
  const alertSchedulerService = new AlertSchedulerService(
    db, 
    alertService, 
    notificationService, 
    savedSearchService, 
    unifiedSearchService
  );
  const alertAnalyticsService = new AlertAnalyticsService(db);

  // =====================
  // Alert Management
  // =====================

  /**
   * Create a new alert definition
   */
  router.post('/', async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const alertRequest = CreateAlertRequestSchema.parse(req.body);
      
      // Additional business validation
      validateCreateAlertRequest(alertRequest);
      
      const alert = await alertService.createAlert(userId, alertRequest);

      res.status(201).json({
        success: true,
        data: alert,
        message: 'Alert created successfully',
      });
    } catch (error) {
      logError(error, { 
        operation: 'createAlert', 
        userId, 
        alertName: req.body.name,
      });
      
      if (isSearchAlertError(error)) {
        return res.status(error.statusCode).json(formatErrorResponse(error));
      }

      return res.status(500).json(formatErrorResponse(error));
    }
  });

  /**
   * List user's alerts with filtering and pagination
   */
  router.get('/', async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const options = AlertListOptionsSchema.parse({
        page: req.query.page ? parseInt(req.query.page as string) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
        sortBy: req.query.sortBy || 'updatedAt',
        sortOrder: req.query.sortOrder || 'desc',
        isActive: req.query.isActive !== undefined ? req.query.isActive === 'true' : undefined,
        scheduleType: req.query.scheduleType as any,
        savedSearchId: req.query.savedSearchId as string,
        query: req.query.query as string,
      });

      const result = await alertService.listAlerts(userId, options);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error('Error listing alerts:', error);
      res.status(500).json({ error: 'Failed to list alerts' });
    }
  });

  /**
   * Get alert by ID with detailed information
   */
  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const alertId = req.params.id;
      const includeDetails = req.query.details === 'true';

      let alert;
      if (includeDetails) {
        alert = await alertService.getAlertWithDetails(alertId, userId);
      } else {
        alert = await alertService.getAlert(alertId, userId);
      }

      if (!alert) {
        return res.status(404).json({ error: 'Alert not found' });
      }

      res.json({
        success: true,
        data: alert,
      });
    } catch (error) {
      console.error('Error getting alert:', error);
      res.status(500).json({ error: 'Failed to get alert' });
    }
  });

  /**
   * Update alert definition
   */
  router.put('/:id', async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const alertId = req.params.id;
      const updateRequest = UpdateAlertRequestSchema.parse(req.body);

      const updatedAlert = await alertService.updateAlert(alertId, userId, updateRequest);

      res.json({
        success: true,
        data: updatedAlert,
        message: 'Alert updated successfully',
      });
    } catch (error) {
      console.error('Error updating alert:', error);
      
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Validation error',
          details: error.errors,
        });
      }

      if (error instanceof Error) {
        if (error.message.includes('not found') || error.message.includes('access denied')) {
          return res.status(404).json({ error: error.message });
        }
        if (error.message.includes('validation') || error.message.includes('invalid')) {
          return res.status(400).json({ error: error.message });
        }
      }

      res.status(500).json({ error: 'Failed to update alert' });
    }
  });

  /**
   * Delete alert definition
   */
  router.delete('/:id', async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const alertId = req.params.id;
      await alertService.deleteAlert(alertId, userId);

      res.json({
        success: true,
        message: 'Alert deleted successfully',
      });
    } catch (error) {
      console.error('Error deleting alert:', error);
      
      if (error instanceof Error && error.message.includes('not found')) {
        return res.status(404).json({ error: error.message });
      }

      res.status(500).json({ error: 'Failed to delete alert' });
    }
  });

  /**
   * Activate or deactivate alert
   */
  router.patch('/:id/active', async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const alertId = req.params.id;
      const { isActive } = req.body;

      if (typeof isActive !== 'boolean') {
        return res.status(400).json({ error: 'isActive must be a boolean value' });
      }

      const updatedAlert = await alertService.setAlertActive(alertId, userId, isActive);

      res.json({
        success: true,
        data: updatedAlert,
        message: `Alert ${isActive ? 'activated' : 'deactivated'} successfully`,
      });
    } catch (error) {
      console.error('Error updating alert status:', error);
      
      if (error instanceof Error && error.message.includes('not found')) {
        return res.status(404).json({ error: error.message });
      }

      res.status(500).json({ error: 'Failed to update alert status' });
    }
  });

  // =====================
  // Alert Execution
  // =====================

  /**
   * Manually trigger alert execution
   */
  router.post('/:id/trigger', async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const alertId = req.params.id;
      const result = await alertSchedulerService.triggerAlert(alertId, userId);

      res.json({
        success: true,
        data: result,
        message: result.triggered ? 'Alert triggered successfully' : 'Alert conditions not met',
      });
    } catch (error) {
      console.error('Error triggering alert:', error);
      
      if (error instanceof Error) {
        if (error.message.includes('not found')) {
          return res.status(404).json({ error: error.message });
        }
        if (error.message.includes('inactive')) {
          return res.status(400).json({ error: error.message });
        }
      }

      res.status(500).json({ error: 'Failed to trigger alert' });
    }
  });

  /**
   * Test alert configuration
   */
  router.post('/:id/test', async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const alertId = req.params.id;
      const result = await alertSchedulerService.testAlert(alertId, userId);

      res.json({
        success: true,
        data: result,
        message: 'Alert test completed',
      });
    } catch (error) {
      console.error('Error testing alert:', error);
      
      if (error instanceof Error && error.message.includes('not found')) {
        return res.status(404).json({ error: error.message });
      }

      res.status(500).json({ error: 'Failed to test alert' });
    }
  });

  /**
   * Get alert execution history
   */
  router.get('/:id/executions', async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const alertId = req.params.id;
      
      // Verify user owns the alert
      const alert = await alertService.getAlert(alertId, userId);
      if (!alert) {
        return res.status(404).json({ error: 'Alert not found' });
      }

      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;

      // Get execution history (simplified - in production, you'd have a proper service method)
      const client = await db.connect();
      try {
        const result = await client.query(`
          SELECT 
            ae.*,
            COUNT(an.id) as notification_count
          FROM alert_executions ae
          LEFT JOIN alert_notifications an ON ae.id = an.alert_execution_id
          WHERE ae.alert_definition_id = $1
          GROUP BY ae.id
          ORDER BY ae.executed_at DESC
          LIMIT $2 OFFSET $3
        `, [alertId, limit, offset]);

        const executions = result.rows.map(row => ({
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
          notificationCount: parseInt(row.notification_count),
        }));

        res.json({
          success: true,
          data: executions,
        });
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error getting execution history:', error);
      res.status(500).json({ error: 'Failed to get execution history' });
    }
  });

  // =====================
  // Notification Templates
  // =====================

  /**
   * List notification templates
   */
  router.get('/templates', async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const templateType = req.query.type as string;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;

      const templates = await notificationService.listTemplates(userId, templateType, limit);

      res.json({
        success: true,
        data: templates,
      });
    } catch (error) {
      console.error('Error listing templates:', error);
      res.status(500).json({ error: 'Failed to list templates' });
    }
  });

  /**
   * Create notification template
   */
  router.post('/templates', async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const templateRequest = CreateTemplateRequestSchema.parse(req.body);
      const template = await notificationService.createTemplate(userId, templateRequest);

      res.status(201).json({
        success: true,
        data: template,
        message: 'Template created successfully',
      });
    } catch (error) {
      console.error('Error creating template:', error);
      
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Validation error',
          details: error.errors,
        });
      }

      res.status(500).json({ error: 'Failed to create template' });
    }
  });

  /**
   * Get notification template by ID
   */
  router.get('/templates/:id', async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const templateId = req.params.id;
      const template = await notificationService.getTemplate(templateId, userId);

      if (!template) {
        return res.status(404).json({ error: 'Template not found' });
      }

      res.json({
        success: true,
        data: template,
      });
    } catch (error) {
      console.error('Error getting template:', error);
      res.status(500).json({ error: 'Failed to get template' });
    }
  });

  /**
   * Update notification template
   */
  router.put('/templates/:id', async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const templateId = req.params.id;
      const updates = req.body; // Could validate with partial schema

      const updatedTemplate = await notificationService.updateTemplate(templateId, userId, updates);

      res.json({
        success: true,
        data: updatedTemplate,
        message: 'Template updated successfully',
      });
    } catch (error) {
      console.error('Error updating template:', error);
      
      if (error instanceof Error && error.message.includes('not found')) {
        return res.status(404).json({ error: error.message });
      }

      res.status(500).json({ error: 'Failed to update template' });
    }
  });

  /**
   * Delete notification template
   */
  router.delete('/templates/:id', async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const templateId = req.params.id;
      await notificationService.deleteTemplate(templateId, userId);

      res.json({
        success: true,
        message: 'Template deleted successfully',
      });
    } catch (error) {
      console.error('Error deleting template:', error);
      
      if (error instanceof Error && error.message.includes('not found')) {
        return res.status(404).json({ error: error.message });
      }

      res.status(500).json({ error: 'Failed to delete template' });
    }
  });

  // =====================
  // Analytics
  // =====================

  /**
   * Get alert analytics
   */
  router.get('/:id/analytics', async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const alertId = req.params.id;
      
      // Verify user owns the alert
      const alert = await alertService.getAlert(alertId, userId);
      if (!alert) {
        return res.status(404).json({ error: 'Alert not found' });
      }

      // Parse date range if provided
      let dateRange;
      if (req.query.from && req.query.to) {
        dateRange = {
          from: new Date(req.query.from as string),
          to: new Date(req.query.to as string),
          granularity: (req.query.granularity as any) || 'day',
        };
      }

      const analytics = await alertAnalyticsService.getAlertAnalytics(alertId, dateRange);

      res.json({
        success: true,
        data: analytics,
      });
    } catch (error) {
      console.error('Error getting alert analytics:', error);
      res.status(500).json({ error: 'Failed to get alert analytics' });
    }
  });

  /**
   * Get user alert statistics
   */
  router.get('/user-analytics', async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      // Parse date range if provided
      let dateRange;
      if (req.query.from && req.query.to) {
        dateRange = {
          from: new Date(req.query.from as string),
          to: new Date(req.query.to as string),
          granularity: (req.query.granularity as any) || 'day',
        };
      }

      const stats = await alertAnalyticsService.getUserAlertStats(userId, dateRange);

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      console.error('Error getting user alert stats:', error);
      res.status(500).json({ error: 'Failed to get user alert statistics' });
    }
  });

  /**
   * Get alert optimization recommendations
   */
  router.get('/:id/recommendations', async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const alertId = req.params.id;
      
      // Verify user owns the alert
      const alert = await alertService.getAlert(alertId, userId);
      if (!alert) {
        return res.status(404).json({ error: 'Alert not found' });
      }

      const recommendations = await alertAnalyticsService.getAlertOptimizationRecommendations(alertId);

      res.json({
        success: true,
        data: recommendations,
      });
    } catch (error) {
      console.error('Error getting recommendations:', error);
      res.status(500).json({ error: 'Failed to get optimization recommendations' });
    }
  });

  /**
   * Get notification engagement metrics
   */
  router.get('/engagement-metrics', async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const alertId = req.query.alertId as string;
      
      // If alertId is provided, verify user owns the alert
      if (alertId) {
        const alert = await alertService.getAlert(alertId, userId);
        if (!alert) {
          return res.status(404).json({ error: 'Alert not found' });
        }
      }

      // Parse date range if provided
      let dateRange;
      if (req.query.from && req.query.to) {
        dateRange = {
          from: new Date(req.query.from as string),
          to: new Date(req.query.to as string),
          granularity: (req.query.granularity as any) || 'day',
        };
      }

      const engagement = await alertAnalyticsService.getNotificationEngagementMetrics(alertId, dateRange);

      res.json({
        success: true,
        data: engagement,
      });
    } catch (error) {
      console.error('Error getting engagement metrics:', error);
      res.status(500).json({ error: 'Failed to get engagement metrics' });
    }
  });

  return router;
}

// Type augmentation for Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email?: string;
        name?: string;
      };
    }
  }
}