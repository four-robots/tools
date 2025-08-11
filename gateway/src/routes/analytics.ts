import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { createHash } from 'crypto';
import { Database } from '@/utils/database';
import { 
  SystemMetricsCollector,
  AnalyticsQueryEngine,
  AlertManager,
  WidgetFactory,
  RealtimeAnalyticsService
} from '@mcp-tools/core';
import {
  DashboardConfiguration,
  DashboardWidget,
  AlertRule,
  Alert,
  AnalyticsQueryEngine as QueryEngineSchema,
  TimeRange,
  RealtimeMetricValue,
  AnalyticsSchemas,
  DashboardWidgetConfig,
  DataQuery,
  FilterCondition
} from '@shared/types';
import { authenticateToken } from '@/middleware/auth';
import { validateRequest } from '@/middleware/validation';
import { rateLimitByUser } from '@/middleware/rateLimit';
import { logger } from '@/utils/logger';
import { performance } from 'perf_hooks';
import { WebSocket } from '@/websocket/websocket-manager';

// Enhanced input validation schemas
const DashboardIdSchema = z.string().uuid('Invalid dashboard ID format');
const WidgetIdSchema = z.string().uuid('Invalid widget ID format');
const UserIdSchema = z.string().uuid('Invalid user ID format');
const TenantIdSchema = z.string().uuid('Invalid tenant ID format').optional();

// Sanitization utilities
function sanitizeString(input: string, maxLength: number = 1000): string {
  return input.replace(/[<>\"'&]/g, '').substring(0, maxLength).trim();
}

function validateAndSanitizeDashboardData(data: any): any {
  const sanitized = { ...data };
  
  if (sanitized.name) {
    sanitized.name = sanitizeString(sanitized.name, MAX_DASHBOARD_NAME_LENGTH);
  }
  
  if (sanitized.description) {
    sanitized.description = sanitizeString(sanitized.description, MAX_DESCRIPTION_LENGTH);
  }
  
  // Validate widget count
  if (sanitized.widgets && Array.isArray(sanitized.widgets)) {
    if (sanitized.widgets.length > MAX_WIDGET_COUNT) {
      throw new Error(`Too many widgets. Maximum allowed: ${MAX_WIDGET_COUNT}`);
    }
  }
  
  // Validate refresh interval bounds
  if (sanitized.refreshIntervalSeconds) {
    sanitized.refreshIntervalSeconds = Math.max(5, Math.min(3600, parseInt(sanitized.refreshIntervalSeconds)));
  }
  
  // Sanitize shared user arrays
  if (sanitized.sharedWithUsers && Array.isArray(sanitized.sharedWithUsers)) {
    sanitized.sharedWithUsers = sanitized.sharedWithUsers
      .filter((userId: string) => UserIdSchema.safeParse(userId).success)
      .slice(0, 100); // Limit shared users
  }
  
  if (sanitized.sharedWithWorkspaces && Array.isArray(sanitized.sharedWithWorkspaces)) {
    sanitized.sharedWithWorkspaces = sanitized.sharedWithWorkspaces
      .filter((workspaceId: string) => z.string().uuid().safeParse(workspaceId).success)
      .slice(0, 50); // Limit shared workspaces
  }
  
  return sanitized;
}

const router = Router();
const db = Database.getInstance();

// Performance optimization constants
const DASHBOARD_QUERY_TIMEOUT = 5000; // 5 seconds
const MAX_WIDGET_COUNT = 50;
const MAX_DASHBOARD_NAME_LENGTH = 255;
const MAX_DESCRIPTION_LENGTH = 2000;

// Initialize analytics services
const systemMetricsCollector = new SystemMetricsCollector('gateway');
const widgetFactory = new WidgetFactory();

// Analytics service instances per tenant
const analyticsServices = new Map<string, {
  queryEngine: AnalyticsQueryEngine;
  alertManager: AlertManager;
  realtimeService: RealtimeAnalyticsService;
}>();

function getAnalyticsServices(tenantId?: string) {
  const key = tenantId || 'default';
  
  if (!analyticsServices.has(key)) {
    const queryEngine = new AnalyticsQueryEngine(db, tenantId);
    const alertManager = new AlertManager(db, tenantId);
    const realtimeService = new RealtimeAnalyticsService(db, tenantId);
    
    analyticsServices.set(key, {
      queryEngine,
      alertManager,
      realtimeService
    });
  }
  
  return analyticsServices.get(key)!;
}

// Dashboard Configuration Management

/**
 * @route   GET /api/analytics/dashboards
 * @desc    Get all dashboard configurations for the user
 * @access  Private
 */
router.get('/dashboards', 
  authenticateToken,
  rateLimitByUser({ windowMs: 60000, max: 100 }),
  async (req: Request, res: Response, next: NextFunction) => {
    const startTime = performance.now();
    
    try {
      const userId = req.user?.id;
      const tenantId = req.user?.tenantId;
      
      // Build query with proper parameterization to prevent SQL injection
      const queryParts = [
        `SELECT 
          id, name, description, layout, widgets, owner_id,
          shared_with_users, shared_with_workspaces, is_public,
          refresh_interval_seconds, auto_refresh_enabled,
          created_at, updated_at
        FROM dashboard_configurations 
        WHERE (owner_id = $1 OR $1 = ANY(shared_with_users) OR is_public = true)`
      ];
      
      const params: any[] = [userId];
      
      if (tenantId) {
        queryParts.push('AND tenant_id = $' + (params.length + 1));
        params.push(tenantId);
      }
      
      queryParts.push('ORDER BY updated_at DESC');
      const query = queryParts.join(' ');
      const dashboards = await db.query(query, params);
      
      const queryTime = performance.now() - startTime;
      logger.info('Retrieved dashboard configurations', { 
        userId, 
        count: dashboards.length, 
        queryTime: Math.round(queryTime) 
      });
      
      res.json({
        success: true,
        data: dashboards,
        meta: {
          total: dashboards.length,
          queryTime: Math.round(queryTime)
        }
      });
      
    } catch (error) {
      logger.error('Failed to get dashboards', { error, userId: req.user?.id });
      next(error);
    }
  }
);

/**
 * @route   POST /api/analytics/dashboards
 * @desc    Create a new dashboard configuration
 * @access  Private
 */
router.post('/dashboards',
  authenticateToken,
  validateRequest(AnalyticsSchemas.DashboardConfiguration.omit({ 
    id: true, 
    createdAt: true, 
    updatedAt: true 
  })),
  rateLimitByUser({ windowMs: 300000, max: 10 }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id;
      const tenantId = req.user?.tenantId;
      
      // Sanitize dashboard data before processing
      const dashboardData = validateAndSanitizeDashboardData(req.body);
      
      // Validate widget configurations - Optimized single validation pass
      const widgetValidationErrors: any[] = [];
      dashboardData.widgets.forEach((widget: any, index: number) => {
        try {
          AnalyticsSchemas.DashboardWidget.parse(widget);
        } catch (validationError) {
          widgetValidationErrors.push({
            widgetIndex: index,
            widgetId: widget.id,
            error: validationError
          });
        }
      });
      
      if (widgetValidationErrors.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Invalid widget configurations',
          details: widgetValidationErrors
        });
      }
      
      const dashboardId = crypto.randomUUID();
      
      const query = `
        INSERT INTO dashboard_configurations (
          id, name, description, layout, widgets, owner_id,
          shared_with_users, shared_with_workspaces, is_public,
          refresh_interval_seconds, auto_refresh_enabled, tenant_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *
      `;
      
      const params = [
        dashboardId,
        dashboardData.name,
        dashboardData.description || null,
        JSON.stringify(dashboardData.layout),
        JSON.stringify(dashboardData.widgets),
        userId,
        dashboardData.sharedWithUsers || [],
        dashboardData.sharedWithWorkspaces || [],
        Boolean(dashboardData.isPublic),
        Math.max(1, Math.min(3600, dashboardData.refreshIntervalSeconds || 60)), // Limit range
        Boolean(dashboardData.autoRefreshEnabled),
        tenantId
      ];
      
      const [dashboard] = await db.query(query, params);
      
      logger.info('Created dashboard configuration', { 
        dashboardId, 
        userId, 
        name: dashboardData.name 
      });
      
      // Notify WebSocket clients about new dashboard
      WebSocket.broadcast('dashboard_created', {
        dashboard,
        userId,
        tenantId
      }, { tenantId });
      
      res.status(201).json({
        success: true,
        data: dashboard
      });
      
    } catch (error) {
      logger.error('Failed to create dashboard', { error, userId: req.user?.id });
      next(error);
    }
  }
);

/**
 * @route   GET /api/analytics/dashboards/:id
 * @desc    Get a specific dashboard configuration
 * @access  Private
 */
router.get('/dashboards/:id',
  authenticateToken,
  rateLimitByUser({ windowMs: 60000, max: 200 }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id: dashboardId } = req.params;
      
      // Validate dashboard ID format
      if (!DashboardIdSchema.safeParse(dashboardId).success) {
        return res.status(400).json({
          success: false,
          message: 'Invalid dashboard ID format'
        });
      }
      
      const userId = req.user?.id;
      const tenantId = req.user?.tenantId;
      
      // Build query with proper parameterization
      const queryParts = [
        'SELECT * FROM dashboard_configurations',
        'WHERE id = $1',
        'AND (owner_id = $2 OR $2 = ANY(shared_with_users) OR is_public = true)'
      ];
      
      const params: any[] = [dashboardId, userId];
      
      if (tenantId) {
        queryParts.push('AND tenant_id = $' + (params.length + 1));
        params.push(tenantId);
      }
      
      const query = queryParts.join(' ');
      const [dashboard] = await db.query(query, params);
      
      if (!dashboard) {
        return res.status(404).json({
          success: false,
          message: 'Dashboard not found or access denied'
        });
      }
      
      // Track dashboard access
      await systemMetricsCollector.recordResponseTime(
        'analytics_dashboard_access',
        50,
        200
      );
      
      res.json({
        success: true,
        data: dashboard
      });
      
    } catch (error) {
      logger.error('Failed to get dashboard', { error, dashboardId: req.params.id });
      next(error);
    }
  }
);

/**
 * @route   PUT /api/analytics/dashboards/:id
 * @desc    Update a dashboard configuration
 * @access  Private
 */
router.put('/dashboards/:id',
  authenticateToken,
  validateRequest(AnalyticsSchemas.DashboardConfiguration.omit({ 
    id: true, 
    createdAt: true, 
    updatedAt: true 
  }).partial()),
  rateLimitByUser({ windowMs: 300000, max: 20 }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id: dashboardId } = req.params;
      
      // Validate dashboard ID format
      if (!DashboardIdSchema.safeParse(dashboardId).success) {
        return res.status(400).json({
          success: false,
          message: 'Invalid dashboard ID format'
        });
      }
      
      const userId = req.user?.id;
      const tenantId = req.user?.tenantId;
      
      // Sanitize and validate updates
      const updates = validateAndSanitizeDashboardData(req.body);
      
      // Check ownership/permissions with proper parameterization
      const permissionParts = [
        'SELECT id, owner_id FROM dashboard_configurations',
        'WHERE id = $1 AND owner_id = $2'
      ];
      
      const permissionParams: any[] = [dashboardId, userId];
      
      if (tenantId) {
        permissionParts.push('AND tenant_id = $' + (permissionParams.length + 1));
        permissionParams.push(tenantId);
      }
      
      const permissionCheck = permissionParts.join(' ');
      const [dashboard] = await db.query(permissionCheck, permissionParams);
      
      if (!dashboard) {
        return res.status(404).json({
          success: false,
          message: 'Dashboard not found or permission denied'
        });
      }
      
      // Build update query dynamically
      const updateFields: string[] = [];
      const updateParams: any[] = [];
      let paramIndex = 1;
      
      if (updates.name) {
        updateFields.push(`name = $${paramIndex++}`);
        updateParams.push(updates.name);
      }
      
      if (updates.description !== undefined) {
        updateFields.push(`description = $${paramIndex++}`);
        updateParams.push(updates.description);
      }
      
      if (updates.layout) {
        updateFields.push(`layout = $${paramIndex++}`);
        updateParams.push(JSON.stringify(updates.layout));
      }
      
      if (updates.widgets) {
        // Validate widgets - Optimized validation
        const widgetValidationErrors: any[] = [];
        updates.widgets.forEach((widget: any, index: number) => {
          try {
            AnalyticsSchemas.DashboardWidget.parse(widget);
          } catch (validationError) {
            widgetValidationErrors.push({
              widgetIndex: index,
              widgetId: widget.id,
              error: validationError
            });
          }
        });
        
        if (widgetValidationErrors.length > 0) {
          return res.status(400).json({
            success: false,
            message: 'Invalid widget configurations',
            details: widgetValidationErrors
          });
        }
        
        updateFields.push(`widgets = $${paramIndex++}`);
        updateParams.push(JSON.stringify(updates.widgets));
      }
      
      if (updates.sharedWithUsers !== undefined) {
        updateFields.push(`shared_with_users = $${paramIndex++}`);
        updateParams.push(updates.sharedWithUsers);
      }
      
      if (updates.sharedWithWorkspaces !== undefined) {
        updateFields.push(`shared_with_workspaces = $${paramIndex++}`);
        updateParams.push(updates.sharedWithWorkspaces);
      }
      
      if (updates.isPublic !== undefined) {
        updateFields.push(`is_public = $${paramIndex++}`);
        updateParams.push(updates.isPublic);
      }
      
      if (updates.refreshIntervalSeconds) {
        updateFields.push(`refresh_interval_seconds = $${paramIndex++}`);
        updateParams.push(updates.refreshIntervalSeconds);
      }
      
      if (updates.autoRefreshEnabled !== undefined) {
        updateFields.push(`auto_refresh_enabled = $${paramIndex++}`);
        updateParams.push(updates.autoRefreshEnabled);
      }
      
      // Always update the updated_at timestamp
      updateFields.push(`updated_at = NOW()`);
      
      if (updateFields.length === 1) {
        return res.status(400).json({
          success: false,
          message: 'No valid update fields provided'
        });
      }
      
      // Add WHERE clause parameters
      updateParams.push(dashboardId);
      const whereClause = `WHERE id = $${paramIndex}`;
      
      const updateQuery = `
        UPDATE dashboard_configurations 
        SET ${updateFields.join(', ')} 
        ${whereClause}
        RETURNING *
      `;
      
      const [updatedDashboard] = await db.query(updateQuery, updateParams);
      
      logger.info('Updated dashboard configuration', { 
        dashboardId, 
        userId, 
        updatedFields: Object.keys(updates) 
      });
      
      // Notify WebSocket clients about dashboard update
      WebSocket.broadcast('dashboard_updated', {
        dashboard: updatedDashboard,
        userId,
        tenantId
      }, { tenantId });
      
      res.json({
        success: true,
        data: updatedDashboard
      });
      
    } catch (error) {
      logger.error('Failed to update dashboard', { error, dashboardId: req.params.id });
      next(error);
    }
  }
);

/**
 * @route   DELETE /api/analytics/dashboards/:id
 * @desc    Delete a dashboard configuration
 * @access  Private
 */
router.delete('/dashboards/:id',
  authenticateToken,
  rateLimitByUser({ windowMs: 300000, max: 10 }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id: dashboardId } = req.params;
      
      // Validate dashboard ID format
      if (!DashboardIdSchema.safeParse(dashboardId).success) {
        return res.status(400).json({
          success: false,
          message: 'Invalid dashboard ID format'
        });
      }
      
      const userId = req.user?.id;
      const tenantId = req.user?.tenantId;
      
      // Build delete query with proper parameterization
      const queryParts = [
        'DELETE FROM dashboard_configurations',
        'WHERE id = $1 AND owner_id = $2'
      ];
      
      const params: any[] = [dashboardId, userId];
      
      if (tenantId) {
        queryParts.push('AND tenant_id = $' + (params.length + 1));
        params.push(tenantId);
      }
      
      queryParts.push('RETURNING id, name');
      const query = queryParts.join(' ');
      const [deletedDashboard] = await db.query(query, params);
      
      if (!deletedDashboard) {
        return res.status(404).json({
          success: false,
          message: 'Dashboard not found or permission denied'
        });
      }
      
      logger.info('Deleted dashboard configuration', { 
        dashboardId, 
        userId, 
        name: deletedDashboard.name 
      });
      
      // Notify WebSocket clients about dashboard deletion
      WebSocket.broadcast('dashboard_deleted', {
        dashboardId,
        userId,
        tenantId
      }, { tenantId });
      
      res.json({
        success: true,
        message: 'Dashboard deleted successfully'
      });
      
    } catch (error) {
      logger.error('Failed to delete dashboard', { error, dashboardId: req.params.id });
      next(error);
    }
  }
);

// Widget Management

/**
 * @route   GET /api/analytics/widgets/templates
 * @desc    Get available widget templates
 * @access  Private
 */
router.get('/widgets/templates',
  authenticateToken,
  rateLimitByUser({ windowMs: 60000, max: 50 }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { category } = req.query;
      
      const templates = widgetFactory.getAvailableTemplates(
        category as any
      );
      
      res.json({
        success: true,
        data: templates,
        meta: {
          total: templates.length,
          categories: ['collaboration', 'performance', 'engagement', 'system', 'custom']
        }
      });
      
    } catch (error) {
      logger.error('Failed to get widget templates', { error });
      next(error);
    }
  }
);

/**
 * @route   POST /api/analytics/widgets/create
 * @desc    Create a widget from template
 * @access  Private
 */
router.post('/widgets/create',
  authenticateToken,
  validateRequest(z.object({
    templateName: z.string(),
    customConfig: z.record(z.any()).optional(),
    position: z.object({
      x: z.number().int().min(0),
      y: z.number().int().min(0),
      width: z.number().int().min(1),
      height: z.number().int().min(1),
    }).optional()
  })),
  rateLimitByUser({ windowMs: 300000, max: 50 }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { templateName, customConfig, position } = req.body;
      
      let widget: DashboardWidget;
      
      // Create widget based on template
      switch (templateName) {
        case 'active_users':
          widget = widgetFactory.createActiveUsersWidget(customConfig);
          break;
        case 'collaboration_activity':
          widget = widgetFactory.createCollaborationActivityWidget(customConfig);
          break;
        case 'system_performance':
          widget = widgetFactory.createSystemPerformanceWidget(customConfig);
          break;
        case 'error_rate':
          widget = widgetFactory.createErrorRateWidget(customConfig);
          break;
        case 'response_time':
          widget = widgetFactory.createResponseTimeWidget(customConfig);
          break;
        case 'feature_usage':
          widget = widgetFactory.createFeatureUsageWidget(customConfig);
          break;
        case 'conflict_resolution':
          widget = widgetFactory.createConflictResolutionWidget(customConfig);
          break;
        case 'search_analytics':
          widget = widgetFactory.createSearchAnalyticsWidget(customConfig);
          break;
        default:
          return res.status(400).json({
            success: false,
            message: `Unknown widget template: ${templateName}`
          });
      }
      
      // Apply custom position if provided
      if (position) {
        widget.position = position;
      }
      
      res.status(201).json({
        success: true,
        data: widget
      });
      
    } catch (error) {
      logger.error('Failed to create widget', { error, templateName: req.body.templateName });
      next(error);
    }
  }
);

// Real-time Metrics Streaming

/**
 * @route   GET /api/analytics/metrics/realtime
 * @desc    Get real-time metric values
 * @access  Private
 */
router.get('/metrics/realtime',
  authenticateToken,
  validateRequest(z.object({
    metrics: z.array(z.string()).min(1).max(20)
  }), 'query'),
  rateLimitByUser({ windowMs: 60000, max: 200 }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { metrics } = req.query as { metrics: string[] };
      const tenantId = req.user?.tenantId;
      
      const { queryEngine } = getAnalyticsServices(tenantId);
      
      const realtimeValues = await queryEngine.queryRealtimeMetrics(
        Array.isArray(metrics) ? metrics : [metrics]
      );
      
      res.json({
        success: true,
        data: realtimeValues,
        timestamp: new Date()
      });
      
    } catch (error) {
      logger.error('Failed to get realtime metrics', { error, metrics: req.query.metrics });
      next(error);
    }
  }
);

/**
 * @route   POST /api/analytics/metrics/query
 * @desc    Query historical metrics with aggregation
 * @access  Private
 */
router.post('/metrics/query',
  authenticateToken,
  validateRequest(AnalyticsSchemas.AnalyticsQueryEngine),
  rateLimitByUser({ windowMs: 60000, max: 100 }),
  async (req: Request, res: Response, next: NextFunction) => {
    const startTime = performance.now();
    
    try {
      const query = req.body;
      const tenantId = req.user?.tenantId;
      
      const { queryEngine } = getAnalyticsServices(tenantId);
      
      let result: any;
      
      if (query.aggregation && ['sum', 'avg', 'count', 'min', 'max', 'p50', 'p95', 'p99'].includes(query.aggregation)) {
        // Aggregation query
        result = await queryEngine.queryAggregation(
          query.metric,
          query.aggregation as any,
          query.groupBy,
          query.filters
        );
      } else {
        // Time series query
        result = await queryEngine.queryTimeSeries(
          query.metric,
          query.timeRange,
          query.granularity || '1h',
          query.filters
        );
      }
      
      const queryTime = performance.now() - startTime;
      
      res.json({
        success: true,
        data: result,
        meta: {
          queryTime: Math.round(queryTime),
          metric: query.metric,
          aggregation: query.aggregation,
          timeRange: query.timeRange
        }
      });
      
    } catch (error) {
      logger.error('Failed to query metrics', { error, query: req.body });
      next(error);
    }
  }
);

// Alert Management

/**
 * @route   GET /api/analytics/alerts
 * @desc    Get all alert rules
 * @access  Private
 */
router.get('/alerts',
  authenticateToken,
  rateLimitByUser({ windowMs: 60000, max: 100 }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.user?.tenantId;
      
      // Build alert rules query with proper parameterization
      const queryParts = [
        `SELECT 
          id, name, description, metric_name, condition_type,
          condition_config, notification_channels, escalation_policy,
          is_enabled, last_triggered_at, trigger_count,
          created_at, updated_at
        FROM analytics_alert_rules`
      ];
      
      const params: any[] = [];
      
      if (tenantId) {
        queryParts.push('WHERE tenant_id = $1');
        params.push(tenantId);
      }
      
      queryParts.push('ORDER BY created_at DESC');
      const query = queryParts.join(' ');
      const alertRules = await db.query(query, params);
      
      res.json({
        success: true,
        data: alertRules,
        meta: {
          total: alertRules.length
        }
      });
      
    } catch (error) {
      logger.error('Failed to get alert rules', { error });
      next(error);
    }
  }
);

/**
 * @route   POST /api/analytics/alerts
 * @desc    Create a new alert rule
 * @access  Private
 */
router.post('/alerts',
  authenticateToken,
  validateRequest(AnalyticsSchemas.AlertRule.omit({ 
    id: true, 
    createdAt: true, 
    updatedAt: true 
  })),
  rateLimitByUser({ windowMs: 300000, max: 20 }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const alertRuleData = req.body;
      const tenantId = req.user?.tenantId;
      
      const { alertManager } = getAnalyticsServices(tenantId);
      
      const alertRuleId = await alertManager.createAlertRule({
        ...alertRuleData,
        tenantId
      });
      
      logger.info('Created alert rule', { 
        alertRuleId, 
        name: alertRuleData.name,
        metric: alertRuleData.condition.metric 
      });
      
      // Get the created rule
      const query = `
        SELECT * FROM analytics_alert_rules WHERE id = $1
      `;
      const [alertRule] = await db.query(query, [alertRuleId]);
      
      // Notify WebSocket clients about new alert rule
      WebSocket.broadcast('alert_rule_created', {
        alertRule,
        tenantId
      }, { tenantId });
      
      res.status(201).json({
        success: true,
        data: alertRule
      });
      
    } catch (error) {
      logger.error('Failed to create alert rule', { error });
      next(error);
    }
  }
);

/**
 * @route   GET /api/analytics/alerts/history
 * @desc    Get alert history
 * @access  Private
 */
router.get('/alerts/history',
  authenticateToken,
  validateRequest(z.object({
    status: z.enum(['active', 'acknowledged', 'resolved']).optional(),
    level: z.enum(['info', 'warning', 'critical']).optional(),
    limit: z.number().int().min(1).max(100).default(50),
    offset: z.number().int().min(0).default(0)
  }), 'query'),
  rateLimitByUser({ windowMs: 60000, max: 100 }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { status, level, limit, offset } = req.query as any;
      const tenantId = req.user?.tenantId;
      
      let whereConditions: string[] = [];
      let params: any[] = [];
      let paramIndex = 1;
      
      if (tenantId) {
        whereConditions.push(`tenant_id = $${paramIndex++}`);
        params.push(tenantId);
      }
      
      if (status) {
        whereConditions.push(`status = $${paramIndex++}`);
        params.push(status);
      }
      
      if (level) {
        whereConditions.push(`alert_level = $${paramIndex++}`);
        params.push(level);
      }
      
      const whereClause = whereConditions.length > 0 
        ? `WHERE ${whereConditions.join(' AND ')}`
        : '';
      
      const query = `
        SELECT 
          ah.*,
          ar.name as rule_name,
          ar.metric_name
        FROM analytics_alert_history ah
        JOIN analytics_alert_rules ar ON ah.alert_rule_id = ar.id
        ${whereClause}
        ORDER BY ah.triggered_at DESC
        LIMIT $${paramIndex++} OFFSET $${paramIndex++}
      `;
      
      params.push(limit, offset);
      
      const alertHistory = await db.query(query, params);
      
      // Get total count
      const countQuery = `
        SELECT COUNT(*) as total
        FROM analytics_alert_history ah
        JOIN analytics_alert_rules ar ON ah.alert_rule_id = ar.id
        ${whereClause}
      `;
      
      const [{ total }] = await db.query(countQuery, params.slice(0, -2));
      
      res.json({
        success: true,
        data: alertHistory,
        meta: {
          total: parseInt(total),
          limit,
          offset,
          hasMore: (offset + limit) < total
        }
      });
      
    } catch (error) {
      logger.error('Failed to get alert history', { error });
      next(error);
    }
  }
);

/**
 * @route   POST /api/analytics/alerts/:id/acknowledge
 * @desc    Acknowledge an alert
 * @access  Private
 */
router.post('/alerts/:id/acknowledge',
  authenticateToken,
  validateRequest(z.object({
    notes: z.string().optional()
  })),
  rateLimitByUser({ windowMs: 300000, max: 50 }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id: alertId } = req.params;
      const { notes } = req.body;
      const userId = req.user?.id!;
      const tenantId = req.user?.tenantId;
      
      const { alertManager } = getAnalyticsServices(tenantId);
      
      await alertManager.acknowledgeAlert(alertId, userId, notes);
      
      logger.info('Alert acknowledged', { alertId, userId });
      
      // Notify WebSocket clients about alert acknowledgment
      WebSocket.broadcast('alert_acknowledged', {
        alertId,
        acknowledgedBy: userId,
        notes,
        tenantId
      }, { tenantId });
      
      res.json({
        success: true,
        message: 'Alert acknowledged successfully'
      });
      
    } catch (error) {
      logger.error('Failed to acknowledge alert', { error, alertId: req.params.id });
      next(error);
    }
  }
);

/**
 * @route   POST /api/analytics/alerts/:id/resolve
 * @desc    Resolve an alert
 * @access  Private
 */
router.post('/alerts/:id/resolve',
  authenticateToken,
  validateRequest(z.object({
    resolution: z.string().min(1).max(1000)
  })),
  rateLimitByUser({ windowMs: 300000, max: 50 }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id: alertId } = req.params;
      const { resolution } = req.body;
      const userId = req.user?.id!;
      const tenantId = req.user?.tenantId;
      
      const { alertManager } = getAnalyticsServices(tenantId);
      
      await alertManager.resolveAlert(alertId, userId, resolution);
      
      logger.info('Alert resolved', { alertId, userId, resolution });
      
      // Notify WebSocket clients about alert resolution
      WebSocket.broadcast('alert_resolved', {
        alertId,
        resolvedBy: userId,
        resolution,
        tenantId
      }, { tenantId });
      
      res.json({
        success: true,
        message: 'Alert resolved successfully'
      });
      
    } catch (error) {
      logger.error('Failed to resolve alert', { error, alertId: req.params.id });
      next(error);
    }
  }
);

// System Metrics and Health

/**
 * @route   GET /api/analytics/system/health
 * @desc    Get system health metrics
 * @access  Private
 */
router.get('/system/health',
  authenticateToken,
  rateLimitByUser({ windowMs: 60000, max: 100 }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.user?.tenantId;
      const { realtimeService } = getAnalyticsServices(tenantId);
      
      const healthMetrics = await realtimeService.getSystemHealthMetrics();
      
      res.json({
        success: true,
        data: healthMetrics,
        timestamp: new Date()
      });
      
    } catch (error) {
      logger.error('Failed to get system health metrics', { error });
      next(error);
    }
  }
);

/**
 * @route   GET /api/analytics/collaboration/metrics
 * @desc    Get collaboration metrics
 * @access  Private
 */
router.get('/collaboration/metrics',
  authenticateToken,
  validateRequest(z.object({
    timeRange: z.object({
      start: z.string().datetime(),
      end: z.string().datetime()
    })
  }), 'query'),
  rateLimitByUser({ windowMs: 60000, max: 100 }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { timeRange } = req.query as any;
      const tenantId = req.user?.tenantId;
      
      const { realtimeService } = getAnalyticsServices(tenantId);
      
      const parsedTimeRange: TimeRange = {
        start: new Date(timeRange.start),
        end: new Date(timeRange.end)
      };
      
      const collaborationMetrics = await realtimeService.getLiveCollaborationMetrics(parsedTimeRange);
      
      res.json({
        success: true,
        data: collaborationMetrics,
        meta: {
          timeRange: parsedTimeRange
        }
      });
      
    } catch (error) {
      logger.error('Failed to get collaboration metrics', { error });
      next(error);
    }
  }
);

/**
 * @route   GET /api/analytics/user/engagement
 * @desc    Get user engagement metrics
 * @access  Private
 */
router.get('/user/engagement',
  authenticateToken,
  validateRequest(z.object({
    timeRange: z.object({
      start: z.string().datetime(),
      end: z.string().datetime()
    })
  }), 'query'),
  rateLimitByUser({ windowMs: 60000, max: 100 }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { timeRange } = req.query as any;
      const tenantId = req.user?.tenantId;
      
      const { realtimeService } = getAnalyticsServices(tenantId);
      
      const parsedTimeRange: TimeRange = {
        start: new Date(timeRange.start),
        end: new Date(timeRange.end)
      };
      
      const engagementMetrics = await realtimeService.getUserEngagementMetrics(parsedTimeRange);
      
      res.json({
        success: true,
        data: engagementMetrics,
        meta: {
          timeRange: parsedTimeRange
        }
      });
      
    } catch (error) {
      logger.error('Failed to get user engagement metrics', { error });
      next(error);
    }
  }
);

// Widget Data Endpoints

/**
 * @route   GET /api/analytics/widgets/:id/data
 * @desc    Get data for a specific widget
 * @access  Private
 */
router.get('/widgets/:widgetId/data',
  authenticateToken,
  rateLimitByUser({ windowMs: 60000, max: 300 }),
  async (req: Request, res: Response, next: NextFunction) => {
    const startTime = performance.now();
    
    try {
      const { widgetId } = req.params;
      
      // Validate widget ID format
      if (!WidgetIdSchema.safeParse(widgetId).success) {
        return res.status(400).json({
          success: false,
          message: 'Invalid widget ID format'
        });
      }
      
      const tenantId = req.user?.tenantId;
      
      // This would need to be implemented based on widget configuration
      // For now, return sample data structure
      const widgetData = {
        labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May'],
        datasets: [{
          name: 'Active Users',
          data: [120, 135, 148, 162, 171],
          color: '#3B82F6',
          unit: 'users'
        }],
        metadata: {
          lastUpdated: new Date(),
          queryTime: Math.round(performance.now() - startTime)
        }
      };
      
      res.json({
        success: true,
        data: widgetData,
        meta: {
          widgetId,
          queryTime: Math.round(performance.now() - startTime)
        }
      });
      
    } catch (error) {
      logger.error('Failed to get widget data', { error, widgetId: req.params.widgetId });
      next(error);
    }
  }
);

// Analytics Event Tracking

/**
 * @route   POST /api/analytics/track
 * @desc    Track analytics event
 * @access  Private
 */
router.post('/track',
  authenticateToken,
  validateRequest(z.object({
    eventType: z.string(),
    eventData: z.record(z.any()),
    timestamp: z.string().datetime().optional()
  })),
  rateLimitByUser({ windowMs: 60000, max: 1000 }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { eventType, eventData, timestamp } = req.body;
      const userId = req.user?.id;
      const tenantId = req.user?.tenantId;
      
      const { realtimeService } = getAnalyticsServices(tenantId);
      
      // Track different types of events
      switch (eventType) {
        case 'feature_usage':
          await realtimeService.trackFeatureUsage(
            userId!, 
            eventData.feature, 
            eventData
          );
          break;
        
        case 'search_query':
          await realtimeService.trackSearchQuery(
            eventData.sessionId || `session_${userId}`,
            userId!,
            eventData.query,
            eventData.resultCount || 0
          );
          break;
        
        case 'api_response':
          await realtimeService.recordResponseTime(
            eventData.endpoint,
            eventData.duration,
            eventData.statusCode
          );
          break;
          
        default:
          logger.warn('Unknown event type', { eventType, userId });
      }
      
      res.status(202).json({
        success: true,
        message: 'Event tracked successfully'
      });
      
    } catch (error) {
      logger.error('Failed to track event', { error, eventType: req.body.eventType });
      next(error);
    }
  }
);

// Enhanced error handling middleware with security-focused logging
router.use((error: Error, req: Request, res: Response, next: NextFunction) => {
  // Generate correlation ID for tracking
  const correlationId = crypto.randomUUID();
  
  // Log error with correlation ID but without sensitive data
  const errorLog = {
    correlationId,
    error: {
      name: error.name,
      message: process.env.NODE_ENV === 'development' ? error.message : 'Internal error',
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    },
    request: {
      path: req.path,
      method: req.method,
      userAgent: req.get('User-Agent'),
      ip: req.ip,
      userId: req.user?.id // Only log user ID, not full user object
    },
    timestamp: new Date().toISOString()
  };
  
  // Validation errors
  if (error.name === 'ValidationError' || error.message?.includes('validation')) {
    logger.warn('Validation error', { ...errorLog, severity: 'low' });
    return res.status(400).json({
      success: false,
      message: 'Invalid request data',
      correlationId,
      // Only expose validation details in development
      ...(process.env.NODE_ENV === 'development' && { details: error.message })
    });
  }
  
  // Authentication/Authorization errors
  if (error.message?.includes('Authentication') || error.message?.includes('permission')) {
    logger.warn('Authentication/Authorization error', { ...errorLog, severity: 'medium' });
    return res.status(403).json({
      success: false,
      message: 'Access denied',
      correlationId
    });
  }
  
  // Not found errors
  if (error.message?.includes('not found')) {
    logger.info('Resource not found', { ...errorLog, severity: 'low' });
    return res.status(404).json({
      success: false,
      message: 'Resource not found',
      correlationId
    });
  }
  
  // Rate limit errors
  if (error.message?.includes('rate limit') || error.message?.includes('Too many')) {
    logger.warn('Rate limit exceeded', { ...errorLog, severity: 'medium' });
    return res.status(429).json({
      success: false,
      message: 'Rate limit exceeded',
      correlationId
    });
  }
  
  // Database errors - Never expose database structure
  if (error.message?.includes('database') || error.message?.includes('query') || error.name?.includes('Database')) {
    logger.error('Database error', { ...errorLog, severity: 'high' });
    return res.status(500).json({
      success: false,
      message: 'A system error occurred',
      correlationId
    });
  }
  
  // Generic server errors
  logger.error('Unhandled analytics API error', { ...errorLog, severity: 'high' });
  
  res.status(500).json({
    success: false,
    message: 'An unexpected error occurred',
    correlationId,
    // Only provide details in development
    ...(process.env.NODE_ENV === 'development' && { 
      details: error.message,
      stack: error.stack?.split('\n').slice(0, 5).join('\n') // Limit stack trace
    })
  });
});

export default router;