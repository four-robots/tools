import { Router } from 'express';
import { WebSocket } from 'ws';
import { EventStreamService } from '../services/event-stream-service';
import { SessionReconstructor, TemporalAnalyticsService } from '@mcp-tools/core';
import { logger } from '../utils/logger';

interface EventSourcingRouterDependencies {
  eventStreamService: EventStreamService;
  sessionReconstructor: SessionReconstructor;
  temporalAnalyticsService: TemporalAnalyticsService;
}

export function createEventSourcingRoutes(deps: EventSourcingRouterDependencies): Router {
  const router = Router();
  const { eventStreamService, sessionReconstructor, temporalAnalyticsService } = deps;

  // Session reconstruction endpoints
  router.get('/sessions/:sessionId/reconstruct', async (req, res) => {
    try {
      const { sessionId } = req.params;
      const { pointInTime } = req.query;

      const timestamp = pointInTime ? new Date(pointInTime as string) : undefined;
      
      if (pointInTime && (!timestamp || isNaN(timestamp.getTime()))) {
        return res.status(400).json({
          success: false,
          error: 'Invalid pointInTime format. Use ISO 8601 format.'
        });
      }

      const session = await sessionReconstructor.reconstructSession(sessionId, timestamp);

      res.json({
        success: true,
        data: {
          session,
          reconstructedAt: new Date().toISOString(),
          pointInTime: timestamp?.toISOString()
        }
      });

      logger.info('Session reconstructed via API', {
        sessionId,
        pointInTime: timestamp?.toISOString(),
        userId: req.user?.id
      });

    } catch (error) {
      logger.error('Failed to reconstruct session', {
        sessionId: req.params.sessionId,
        error: error instanceof Error ? error.message : String(error),
        userId: req.user?.id
      });

      res.status(500).json({
        success: false,
        error: 'Failed to reconstruct session',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  router.get('/sessions/:sessionId/timeline', async (req, res) => {
    try {
      const { sessionId } = req.params;
      const timeline = await sessionReconstructor.getSessionTimeline(sessionId);

      res.json({
        success: true,
        data: timeline
      });

    } catch (error) {
      logger.error('Failed to get session timeline', {
        sessionId: req.params.sessionId,
        error: error instanceof Error ? error.message : String(error),
        userId: req.user?.id
      });

      res.status(500).json({
        success: false,
        error: 'Failed to get session timeline',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  router.get('/sessions/:sessionId/state', async (req, res) => {
    try {
      const { sessionId } = req.params;
      const { timestamp } = req.query;

      if (!timestamp) {
        return res.status(400).json({
          success: false,
          error: 'timestamp query parameter is required'
        });
      }

      const timestampDate = new Date(timestamp as string);
      if (isNaN(timestampDate.getTime())) {
        return res.status(400).json({
          success: false,
          error: 'Invalid timestamp format. Use ISO 8601 format.'
        });
      }

      const sessionState = await sessionReconstructor.getSessionStateAtTime(sessionId, timestampDate);

      res.json({
        success: true,
        data: sessionState
      });

    } catch (error) {
      logger.error('Failed to get session state', {
        sessionId: req.params.sessionId,
        timestamp: req.query.timestamp,
        error: error instanceof Error ? error.message : String(error),
        userId: req.user?.id
      });

      res.status(500).json({
        success: false,
        error: 'Failed to get session state',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  router.get('/sessions/:sessionId/audit-trail', async (req, res) => {
    try {
      const { sessionId } = req.params;
      const auditTrail = await sessionReconstructor.generateAuditTrail(sessionId);

      res.json({
        success: true,
        data: auditTrail
      });

    } catch (error) {
      logger.error('Failed to generate audit trail', {
        sessionId: req.params.sessionId,
        error: error instanceof Error ? error.message : String(error),
        userId: req.user?.id
      });

      res.status(500).json({
        success: false,
        error: 'Failed to generate audit trail',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  router.post('/sessions/search', async (req, res) => {
    try {
      const { criteria, timeRange } = req.body;

      if (!timeRange || !timeRange.start || !timeRange.end) {
        return res.status(400).json({
          success: false,
          error: 'timeRange with start and end dates is required'
        });
      }

      const searchTimeRange = {
        start: new Date(timeRange.start),
        end: new Date(timeRange.end)
      };

      if (isNaN(searchTimeRange.start.getTime()) || isNaN(searchTimeRange.end.getTime())) {
        return res.status(400).json({
          success: false,
          error: 'Invalid date format in timeRange. Use ISO 8601 format.'
        });
      }

      const sessions = await sessionReconstructor.findSessionsWithCriteria(criteria || {}, searchTimeRange);

      res.json({
        success: true,
        data: {
          sessions,
          count: sessions.length,
          criteria,
          timeRange: searchTimeRange
        }
      });

    } catch (error) {
      logger.error('Failed to search sessions', {
        criteria: req.body.criteria,
        timeRange: req.body.timeRange,
        error: error instanceof Error ? error.message : String(error),
        userId: req.user?.id
      });

      res.status(500).json({
        success: false,
        error: 'Failed to search sessions',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  router.get('/users/:userId/activity', async (req, res) => {
    try {
      const { userId } = req.params;
      const { startDate, endDate } = req.query;

      if (!startDate || !endDate) {
        return res.status(400).json({
          success: false,
          error: 'startDate and endDate query parameters are required'
        });
      }

      const timeRange = {
        start: new Date(startDate as string),
        end: new Date(endDate as string)
      };

      if (isNaN(timeRange.start.getTime()) || isNaN(timeRange.end.getTime())) {
        return res.status(400).json({
          success: false,
          error: 'Invalid date format. Use ISO 8601 format.'
        });
      }

      const activity = await sessionReconstructor.getParticipantActivity(userId, timeRange);

      res.json({
        success: true,
        data: activity
      });

    } catch (error) {
      logger.error('Failed to get participant activity', {
        userId: req.params.userId,
        timeRange: { startDate: req.query.startDate, endDate: req.query.endDate },
        error: error instanceof Error ? error.message : String(error),
        authenticatedUserId: req.user?.id
      });

      res.status(500).json({
        success: false,
        error: 'Failed to get participant activity',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Event stream management endpoints
  router.get('/stream/clients', async (req, res) => {
    try {
      // Only allow admin users to see all connected clients
      if (!req.user?.isAdmin) {
        return res.status(403).json({
          success: false,
          error: 'Admin access required'
        });
      }

      const clients = eventStreamService.getConnectedClients();
      res.json({
        success: true,
        data: {
          clients,
          totalClients: clients.length
        }
      });

    } catch (error) {
      logger.error('Failed to get connected clients', {
        error: error instanceof Error ? error.message : String(error),
        userId: req.user?.id
      });

      res.status(500).json({
        success: false,
        error: 'Failed to get connected clients',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  router.get('/stream/subscriptions', async (req, res) => {
    try {
      const subscriptions = eventStreamService.getActiveSubscriptions();
      
      // Filter subscriptions to only show user's own
      const userId = req.user?.id;
      const filteredSubscriptions = subscriptions.filter(sub => {
        return (sub as any).userId === userId || (sub as any).clientId === userId;
      });

      res.json({
        success: true,
        data: {
          subscriptions: filteredSubscriptions,
          totalSubscriptions: filteredSubscriptions.length
        }
      });

    } catch (error) {
      logger.error('Failed to get active subscriptions', {
        error: error instanceof Error ? error.message : String(error),
        userId: req.user?.id
      });

      res.status(500).json({
        success: false,
        error: 'Failed to get active subscriptions',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  router.get('/stream/stats', async (req, res) => {
    try {
      const stats = eventStreamService.getServiceStats();
      res.json({
        success: true,
        data: stats
      });

    } catch (error) {
      logger.error('Failed to get stream service stats', {
        error: error instanceof Error ? error.message : String(error),
        userId: req.user?.id
      });

      res.status(500).json({
        success: false,
        error: 'Failed to get stream service stats',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Temporal analytics endpoints
  router.get('/analytics/collaboration-metrics', async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      if (!startDate || !endDate) {
        return res.status(400).json({
          success: false,
          error: 'startDate and endDate query parameters are required'
        });
      }

      const timeRange = {
        start: new Date(startDate as string),
        end: new Date(endDate as string)
      };

      if (isNaN(timeRange.start.getTime()) || isNaN(timeRange.end.getTime())) {
        return res.status(400).json({
          success: false,
          error: 'Invalid date format. Use ISO 8601 format.'
        });
      }

      const metrics = await temporalAnalyticsService.getCollaborationMetrics(timeRange);

      res.json({
        success: true,
        data: metrics
      });

    } catch (error) {
      logger.error('Failed to get collaboration metrics', {
        timeRange: { startDate: req.query.startDate, endDate: req.query.endDate },
        error: error instanceof Error ? error.message : String(error),
        userId: req.user?.id
      });

      res.status(500).json({
        success: false,
        error: 'Failed to get collaboration metrics',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  router.get('/analytics/users/:userId/engagement', async (req, res) => {
    try {
      const { userId } = req.params;
      const { startDate, endDate } = req.query;

      if (!startDate || !endDate) {
        return res.status(400).json({
          success: false,
          error: 'startDate and endDate query parameters are required'
        });
      }

      const timeRange = {
        start: new Date(startDate as string),
        end: new Date(endDate as string)
      };

      if (isNaN(timeRange.start.getTime()) || isNaN(timeRange.end.getTime())) {
        return res.status(400).json({
          success: false,
          error: 'Invalid date format. Use ISO 8601 format.'
        });
      }

      const engagement = await temporalAnalyticsService.getUserEngagementPatterns(userId, timeRange);

      res.json({
        success: true,
        data: engagement
      });

    } catch (error) {
      logger.error('Failed to get user engagement patterns', {
        targetUserId: req.params.userId,
        timeRange: { startDate: req.query.startDate, endDate: req.query.endDate },
        error: error instanceof Error ? error.message : String(error),
        authenticatedUserId: req.user?.id
      });

      res.status(500).json({
        success: false,
        error: 'Failed to get user engagement patterns',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  router.get('/analytics/conflict-resolution-trends', async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      if (!startDate || !endDate) {
        return res.status(400).json({
          success: false,
          error: 'startDate and endDate query parameters are required'
        });
      }

      const timeRange = {
        start: new Date(startDate as string),
        end: new Date(endDate as string)
      };

      if (isNaN(timeRange.start.getTime()) || isNaN(timeRange.end.getTime())) {
        return res.status(400).json({
          success: false,
          error: 'Invalid date format. Use ISO 8601 format.'
        });
      }

      const trends = await temporalAnalyticsService.getConflictResolutionTrends(timeRange);

      res.json({
        success: true,
        data: trends
      });

    } catch (error) {
      logger.error('Failed to get conflict resolution trends', {
        timeRange: { startDate: req.query.startDate, endDate: req.query.endDate },
        error: error instanceof Error ? error.message : String(error),
        userId: req.user?.id
      });

      res.status(500).json({
        success: false,
        error: 'Failed to get conflict resolution trends',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  router.get('/analytics/sessions/:sessionId/insights', async (req, res) => {
    try {
      const { sessionId } = req.params;
      const insights = await temporalAnalyticsService.generateSessionInsights(sessionId);

      res.json({
        success: true,
        data: insights
      });

    } catch (error) {
      logger.error('Failed to generate session insights', {
        sessionId: req.params.sessionId,
        error: error instanceof Error ? error.message : String(error),
        userId: req.user?.id
      });

      res.status(500).json({
        success: false,
        error: 'Failed to generate session insights',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  return router;
}

// WebSocket connection handler
export function handleEventStreamWebSocket(
  ws: WebSocket,
  req: any,
  eventStreamService: EventStreamService
): void {
  try {
    // Extract user info from request (this would come from authentication middleware)
    const userId = req.user?.id;
    const workspaceId = req.query.workspaceId;
    const sessionId = req.query.sessionId;

    if (!userId) {
      ws.close(1008, 'Authentication required');
      return;
    }

    const metadata = {
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip,
      workspaceId,
      sessionId
    };

    // Add client to event stream service
    eventStreamService.addClient(ws, userId, metadata).then(clientId => {
      logger.info('WebSocket connection established for event streaming', {
        clientId,
        userId,
        workspaceId,
        sessionId
      });
    }).catch(error => {
      logger.error('Failed to add WebSocket client', {
        userId,
        error: error instanceof Error ? error.message : String(error)
      });
      ws.close(1011, 'Failed to establish connection');
    });

  } catch (error) {
    logger.error('Failed to handle WebSocket connection', {
      error: error instanceof Error ? error.message : String(error),
      userId: req.user?.id
    });
    ws.close(1011, 'Internal server error');
  }
}