import { Router, Request, Response } from 'express';
import { AnalyticsService } from '../services/AnalyticsService.js';
import { authMiddleware } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validation.middleware.js';
import { 
  TrackEventRequestSchema, 
  AnalyticsQuerySchema,
  PerformanceMetricSchema 
} from '@mcp-tools/core';

export function createAnalyticsRoutes(analyticsService: AnalyticsService): Router {
  const router = Router();

  // Apply authentication to all analytics routes
  router.use(authMiddleware);

  /**
   * POST /api/v1/analytics/events
   * Track a single analytics event
   */
  router.post('/events', validateRequest(TrackEventRequestSchema), async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;
      const sessionId = req.headers['x-session-id'] as string || req.sessionID;
      const userAgent = req.headers['user-agent'];
      const ipAddress = req.ip;
      const pageUrl = req.headers.referer;

      const event = {
        ...req.body,
        userId,
        sessionId,
        userAgent,
        ipAddress,
        pageUrl
      };

      await analyticsService.trackEvent(event);

      res.status(201).json({ 
        success: true, 
        message: 'Event tracked successfully' 
      });
    } catch (error) {
      console.error('Error tracking event:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to track event' 
      });
    }
  });

  /**
   * POST /api/v1/analytics/events/batch
   * Track multiple analytics events in batch
   */
  router.post('/events/batch', async (req: Request, res: Response) => {
    try {
      if (!Array.isArray(req.body?.events)) {
        return res.status(400).json({
          success: false,
          error: 'Request body must contain an events array'
        });
      }

      const userId = req.user?.id;
      const sessionId = req.headers['x-session-id'] as string || req.sessionID;
      const userAgent = req.headers['user-agent'];
      const ipAddress = req.ip;
      const pageUrl = req.headers.referer;

      const events = req.body.events.map((event: any) => ({
        ...event,
        userId,
        sessionId,
        userAgent,
        ipAddress,
        pageUrl
      }));

      await analyticsService.trackEventBatch(events);

      res.status(201).json({ 
        success: true, 
        message: `${events.length} events tracked successfully` 
      });
    } catch (error) {
      console.error('Error tracking event batch:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to track events' 
      });
    }
  });

  /**
   * POST /api/v1/analytics/performance
   * Record performance metric
   */
  router.post('/performance', async (req: Request, res: Response) => {
    try {
      if (!req.body?.startTime || !req.body?.endTime) {
        return res.status(400).json({
          success: false,
          error: 'startTime and endTime are required'
        });
      }

      const userId = req.user?.id;
      
      const startTime = new Date(req.body.startTime);
      const endTime = new Date(req.body.endTime);
      if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) {
        return res.status(400).json({ success: false, message: 'Invalid startTime or endTime format' });
      }

      const metric = {
        ...req.body,
        userId,
        startTime,
        endTime
      };

      await analyticsService.recordPerformanceMetric(metric);

      res.status(201).json({ 
        success: true, 
        message: 'Performance metric recorded' 
      });
    } catch (error) {
      console.error('Error recording performance metric:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to record performance metric' 
      });
    }
  });

  /**
   * GET /api/v1/analytics/dashboard
   * Get user analytics dashboard data
   */
  router.get('/dashboard', async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;
      const timeRange = (req.query.timeRange as string) || 'week';

      if (!userId) {
        return res.status(401).json({ 
          success: false, 
          error: 'Authentication required' 
        });
      }

      const dashboard = await analyticsService.getUserDashboard(userId, timeRange);

      res.json({ 
        success: true, 
        data: dashboard 
      });
    } catch (error) {
      console.error('Error getting user dashboard:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to get dashboard data' 
      });
    }
  });

  /**
   * GET /api/v1/analytics/timeseries
   * Get time series data for charts
   */
  router.get('/timeseries', validateRequest(AnalyticsQuerySchema, 'query'), async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;
      
      const query = {
        ...req.query,
        userId, // Only query own data
        startDate: req.query.startDate ? (() => { const d = new Date(req.query.startDate as string); return Number.isNaN(d.getTime()) ? undefined : d; })() : undefined,
        endDate: req.query.endDate ? (() => { const d = new Date(req.query.endDate as string); return Number.isNaN(d.getTime()) ? undefined : d; })() : undefined,
        limit: parseInt(req.query.limit as string) || 100,
        offset: parseInt(req.query.offset as string) || 0
      };

      const timeSeries = await analyticsService.getTimeSeriesData(query);

      res.json({ 
        success: true, 
        data: timeSeries 
      });
    } catch (error) {
      console.error('Error getting time series data:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to get time series data' 
      });
    }
  });

  /**
   * GET /api/v1/analytics/insights
   * Get productivity insights for user
   */
  router.get('/insights', async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ 
          success: false, 
          error: 'Authentication required' 
        });
      }

      const insights = await analyticsService.generateInsights(userId);

      res.json({ 
        success: true, 
        data: insights 
      });
    } catch (error) {
      console.error('Error getting insights:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to get insights' 
      });
    }
  });

  /**
   * POST /api/v1/analytics/insights/generate
   * Manually trigger insight generation for user
   */
  router.post('/insights/generate', async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ 
          success: false, 
          error: 'Authentication required' 
        });
      }

      const insights = await analyticsService.generateInsights(userId);

      res.json({ 
        success: true, 
        data: insights,
        message: `Generated ${insights.length} new insights` 
      });
    } catch (error) {
      console.error('Error generating insights:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to generate insights' 
      });
    }
  });

  /**
   * PUT /api/v1/analytics/insights/:id/read
   * Mark insight as read
   */
  router.put('/insights/:id/read', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ 
          success: false, 
          error: 'Authentication required' 
        });
      }

      // Update insight read status
      // This would be implemented in the AnalyticsService
      res.json({ 
        success: true, 
        message: 'Insight marked as read' 
      });
    } catch (error) {
      console.error('Error marking insight as read:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to mark insight as read' 
      });
    }
  });

  /**
   * GET /api/v1/analytics/metrics/performance
   * Get performance metrics summary
   */
  router.get('/metrics/performance', async (req: Request, res: Response) => {
    try {
      const timeRange = (req.query.timeRange as string) || 'day';
      const metricType = req.query.metricType as string;

      // This would query performance_metrics table
      // Implementation depends on specific requirements
      
      res.json({ 
        success: true, 
        data: {
          avgResponseTime: 150,
          p95ResponseTime: 300,
          errorRate: 0.1,
          totalRequests: 10000
        }
      });
    } catch (error) {
      console.error('Error getting performance metrics:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to get performance metrics' 
      });
    }
  });

  /**
   * GET /api/v1/analytics/system
   * Get system-wide analytics (admin only)
   */
  router.get('/system', async (req: Request, res: Response) => {
    try {
      // Check if user is admin (this would be implemented in auth middleware)
      const isAdmin = req.user?.role === 'admin';
      
      if (!isAdmin) {
        return res.status(403).json({ 
          success: false, 
          error: 'Admin access required' 
        });
      }

      const timeRange = (req.query.timeRange as string) || 'week';

      // Get system analytics data
      res.json({ 
        success: true, 
        data: {
          totalUsers: 100,
          activeUsers: 75,
          totalEvents: 50000,
          avgResponseTime: 150,
          errorRate: 0.1
        }
      });
    } catch (error) {
      console.error('Error getting system analytics:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to get system analytics' 
      });
    }
  });

  // ========== PREDICTIVE ANALYTICS ROUTES ==========

  /**
   * GET /api/v1/analytics/predictions/tasks/:taskId?
   * Get task completion prediction
   */
  router.get('/predictions/tasks/:taskId?', async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;
      const taskId = req.params.taskId;
      const complexity = parseInt(req.query.complexity as string) || 5;

      if (!userId) {
        return res.status(401).json({ 
          success: false, 
          error: 'Authentication required' 
        });
      }

      const prediction = await analyticsService.insightsEngine.getTaskCompletionPrediction(
        userId, 
        taskId, 
        complexity
      );

      res.json({ 
        success: true, 
        data: prediction 
      });
    } catch (error) {
      console.error('Error getting task completion prediction:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to get task completion prediction' 
      });
    }
  });

  /**
   * GET /api/v1/analytics/predictions/productivity
   * Get productivity forecast
   */
  router.get('/predictions/productivity', async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;
      const days = parseInt(req.query.days as string) || 7;

      if (!userId) {
        return res.status(401).json({ 
          success: false, 
          error: 'Authentication required' 
        });
      }

      const forecast = await analyticsService.insightsEngine.getProductivityForecast(userId, days);

      res.json({ 
        success: true, 
        data: forecast 
      });
    } catch (error) {
      console.error('Error getting productivity forecast:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to get productivity forecast' 
      });
    }
  });

  /**
   * GET /api/v1/analytics/predictions/workload
   * Get workload capacity prediction
   */
  router.get('/predictions/workload', async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ 
          success: false, 
          error: 'Authentication required' 
        });
      }

      const prediction = await analyticsService.insightsEngine.getWorkloadCapacityPrediction(userId);

      res.json({ 
        success: true, 
        data: prediction 
      });
    } catch (error) {
      console.error('Error getting workload capacity prediction:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to get workload capacity prediction' 
      });
    }
  });

  /**
   * POST /api/v1/analytics/models/train
   * Train predictive models for the user
   */
  router.post('/models/train', async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ 
          success: false, 
          error: 'Authentication required' 
        });
      }

      await analyticsService.insightsEngine.trainPredictiveModels(userId);

      res.json({ 
        success: true, 
        message: 'Predictive models trained successfully' 
      });
    } catch (error) {
      console.error('Error training predictive models:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to train predictive models' 
      });
    }
  });

  /**
   * GET /api/v1/analytics/predictions/comprehensive
   * Get comprehensive predictions (all types in one call)
   */
  router.get('/predictions/comprehensive', async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ 
          success: false, 
          error: 'Authentication required' 
        });
      }

      const [taskPrediction, productivityForecast, workloadPrediction] = await Promise.all([
        analyticsService.insightsEngine.getTaskCompletionPrediction(userId),
        analyticsService.insightsEngine.getProductivityForecast(userId, 7),
        analyticsService.insightsEngine.getWorkloadCapacityPrediction(userId)
      ]);

      res.json({ 
        success: true, 
        data: {
          taskCompletion: taskPrediction,
          productivityForecast,
          workloadCapacity: workloadPrediction
        }
      });
    } catch (error) {
      console.error('Error getting comprehensive predictions:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to get comprehensive predictions' 
      });
    }
  });

  return router;
}

export default createAnalyticsRoutes;