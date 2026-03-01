import { Router, Request, Response } from 'express';
import { z } from 'zod';
import {
  BehaviorTrackingService,
  PatternRecognitionService,
  BehaviorLearningService,
  InsightGenerationService,
  PrivacyComplianceService,
  BehaviorAnalyticsService,
} from '@mcp-tools/core';
import {
  BehaviorEventSchema,
  UserPrivacySettingsSchema,
  BehaviorAnalyticsRequestSchema,
  PatternAnalysisRequestSchema,
} from '@mcp-tools/core';
import { getDatabaseConnection } from '../database/index.js';
import { Logger } from '../utils/logger.js';

const router = Router();
const logger = new Logger('UserBehaviorRoutes');

// Request validation schemas
const TrackEventRequestSchema = z.object({
  events: z.array(BehaviorEventSchema.partial()).min(1).max(100),
});

const UpdatePrivacySettingsRequestSchema = z.object({
  settings: UserPrivacySettingsSchema.partial(),
  metadata: z.object({
    ipAddress: z.string().optional(),
    userAgent: z.string().optional(),
    consentVersion: z.string().optional(),
  }).optional(),
});

const DataDeletionRequestSchema = z.object({
  requestType: z.enum(['full_deletion', 'anonymization', 'specific_data']).default('full_deletion'),
  dataTypes: z.array(z.string()).optional(),
  metadata: z.object({
    ipAddress: z.string().optional(),
    userAgent: z.string().optional(),
    reason: z.string().optional(),
  }).optional(),
});

const DataExportRequestSchema = z.object({
  dataTypes: z.array(z.string()).default(['events', 'patterns', 'segments', 'insights']),
  format: z.enum(['json', 'csv', 'xml']).default('json'),
  metadata: z.object({
    ipAddress: z.string().optional(),
    userAgent: z.string().optional(),
  }).optional(),
});

// Initialize services
let behaviorTrackingService: BehaviorTrackingService;
let patternRecognitionService: PatternRecognitionService;
let behaviorLearningService: BehaviorLearningService;
let insightGenerationService: InsightGenerationService;
let privacyComplianceService: PrivacyComplianceService;
let behaviorAnalyticsService: BehaviorAnalyticsService;

// Initialize services with database connection
const initializeServices = async () => {
  const db = await getDatabaseConnection();

  behaviorTrackingService = new BehaviorTrackingService(db);
  patternRecognitionService = new PatternRecognitionService(db);
  behaviorLearningService = new BehaviorLearningService(db);
  insightGenerationService = new InsightGenerationService(db);
  privacyComplianceService = new PrivacyComplianceService(db);
  behaviorAnalyticsService = new BehaviorAnalyticsService(db);
};

// Store the initialization promise so routes can await it
const servicesReady = initializeServices().catch(error => {
  logger.error('Failed to initialize user behavior services', error);
});

// Middleware to ensure services are initialized before handling requests
router.use(async (req: Request, res: Response, next) => {
  try {
    await servicesReady;
    if (!behaviorTrackingService) {
      return res.status(503).json({ success: false, message: 'Service initializing' });
    }
    next();
  } catch {
    res.status(503).json({ success: false, message: 'Service unavailable' });
  }
});

// Event Tracking Routes

/**
 * POST /api/v1/behavior/events
 * Track user behavior events
 */
router.post('/events', async (req: Request, res: Response) => {
  try {
    const { events } = TrackEventRequestSchema.parse(req.body);
    
    if (events.length === 1) {
      await behaviorTrackingService.trackEvent(events[0]);
    } else {
      await behaviorTrackingService.trackEventsBatch(events);
    }

    res.status(201).json({
      success: true,
      message: `${events.length} event(s) tracked successfully`,
      eventsProcessed: events.length,
    });

  } catch (error) {
    logger.error('Failed to track events', error);
    res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to track events',
    });
  }
});

/**
 * GET /api/v1/behavior/events
 * Get user event history
 */
router.get('/events', async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId as string;
    if (!userId) {
      return res.status(400).json({ success: false, message: 'userId is required' });
    }

    const options = {
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
      offset: req.query.offset ? parseInt(req.query.offset as string, 10) : undefined,
      eventTypes: req.query.eventTypes ? (req.query.eventTypes as string).split(',') : undefined,
      dateRange: req.query.startDate && req.query.endDate ? {
        start: new Date(req.query.startDate as string),
        end: new Date(req.query.endDate as string),
      } : undefined,
    };

    const events = await behaviorTrackingService.getUserEventHistory(userId, options);

    res.json({
      success: true,
      data: {
        events,
        count: events.length,
        options,
      },
    });

  } catch (error) {
    logger.error('Failed to get user events', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve user events',
    });
  }
});

/**
 * POST /api/v1/behavior/events/batch
 * Batch track multiple events
 */
router.post('/events/batch', async (req: Request, res: Response) => {
  try {
    const { events } = TrackEventRequestSchema.parse(req.body);
    
    await behaviorTrackingService.trackEventsBatch(events);

    res.status(201).json({
      success: true,
      message: `Batch of ${events.length} events tracked successfully`,
      eventsProcessed: events.length,
    });

  } catch (error) {
    logger.error('Failed to batch track events', error);
    res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to batch track events',
    });
  }
});

// Pattern Analysis Routes

/**
 * GET /api/v1/behavior/patterns
 * Get user behavior patterns
 */
router.get('/patterns', async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId as string;
    if (!userId) {
      return res.status(400).json({ success: false, message: 'userId is required' });
    }

    const options = {
      patternTypes: req.query.patternTypes ? (req.query.patternTypes as string).split(',') : undefined,
      minConfidence: req.query.minConfidence ? parseFloat(req.query.minConfidence as string) : undefined,
      activeOnly: req.query.activeOnly !== 'false',
    };

    const patterns = await patternRecognitionService.getUserPatterns(userId, options);

    res.json({
      success: true,
      data: {
        patterns,
        count: patterns.length,
        userId,
      },
    });

  } catch (error) {
    logger.error('Failed to get user patterns', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve user patterns',
    });
  }
});

/**
 * POST /api/v1/behavior/patterns/analyze
 * Analyze user patterns
 */
router.post('/patterns/analyze', async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId as string;
    const timeWindow = req.query.timeWindow ? parseInt(req.query.timeWindow as string, 10) : 30;

    if (!userId) {
      return res.status(400).json({ success: false, message: 'userId is required' });
    }

    const result = await patternRecognitionService.analyzeUserPatterns(userId, timeWindow);

    res.json({
      success: true,
      data: result,
    });

  } catch (error) {
    logger.error('Failed to analyze user patterns', error);
    res.status(500).json({
      success: false,
      message: 'Failed to analyze user patterns',
    });
  }
});

/**
 * GET /api/v1/behavior/segments
 * Get user behavior segments
 */
router.get('/segments', async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId as string;
    if (!userId) {
      return res.status(400).json({ success: false, message: 'userId is required' });
    }

    const segmentResult = await behaviorLearningService.segmentUser(userId);

    res.json({
      success: true,
      data: segmentResult,
    });

  } catch (error) {
    logger.error('Failed to get user segments', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve user segments',
    });
  }
});

// Predictions and Insights Routes

/**
 * GET /api/v1/behavior/predictions
 * Get user behavior predictions
 */
router.get('/predictions', async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId as string;
    if (!userId) {
      return res.status(400).json({ success: false, message: 'userId is required' });
    }

    const predictionTypes = req.query.predictionTypes 
      ? (req.query.predictionTypes as string).split(',')
      : undefined;

    const result = await behaviorLearningService.predictUserBehavior(userId, predictionTypes);

    res.json({
      success: true,
      data: result,
    });

  } catch (error) {
    logger.error('Failed to get user predictions', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve user predictions',
    });
  }
});

/**
 * GET /api/v1/behavior/insights
 * Get personalized user insights
 */
router.get('/insights', async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId as string;
    if (!userId) {
      return res.status(400).json({ success: false, message: 'userId is required' });
    }

    const options = {
      categories: req.query.categories ? (req.query.categories as string).split(',') : undefined,
      minImpactScore: req.query.minImpactScore ? parseFloat(req.query.minImpactScore as string) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
    };

    const insights = await insightGenerationService.getUserInsights(userId, options);

    res.json({
      success: true,
      data: {
        insights,
        count: insights.length,
        userId,
      },
    });

  } catch (error) {
    logger.error('Failed to get user insights', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve user insights',
    });
  }
});

/**
 * POST /api/v1/behavior/insights/generate
 * Generate new insights for a user
 */
router.post('/insights/generate', async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId as string;
    if (!userId) {
      return res.status(400).json({ success: false, message: 'userId is required' });
    }

    const result = await insightGenerationService.generateUserInsights(userId);

    res.json({
      success: true,
      data: result,
    });

  } catch (error) {
    logger.error('Failed to generate user insights', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate user insights',
    });
  }
});

/**
 * GET /api/v1/behavior/recommendations
 * Get behavior-based recommendations
 */
router.get('/recommendations', async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId as string;
    if (!userId) {
      return res.status(400).json({ success: false, message: 'userId is required' });
    }

    const recommendations = await insightGenerationService.generatePersonalizationRecommendations(userId);

    res.json({
      success: true,
      data: {
        recommendations,
        count: recommendations.length,
        userId,
      },
    });

  } catch (error) {
    logger.error('Failed to get recommendations', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve recommendations',
    });
  }
});

// Analytics and Dashboard Routes

/**
 * GET /api/v1/behavior/analytics/dashboard
 * Get behavior analytics dashboard data
 */
router.get('/analytics/dashboard', async (req: Request, res: Response) => {
  try {
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    const period = (req.query.period as string) || 'day';

    if (!startDate || !endDate) {
      return res.status(400).json({ 
        success: false, 
        message: 'startDate and endDate are required' 
      });
    }

    const timeframe = {
      start: new Date(startDate),
      end: new Date(endDate),
    };

    const dashboardMetrics = await behaviorAnalyticsService.generateDashboardMetrics(
      timeframe,
      period as any
    );

    res.json({
      success: true,
      data: dashboardMetrics,
    });

  } catch (error) {
    logger.error('Failed to get dashboard analytics', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve dashboard analytics',
    });
  }
});

/**
 * GET /api/v1/behavior/analytics/trends
 * Get behavior trends over time
 */
router.get('/analytics/trends', async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId as string;
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;

    if (!startDate || !endDate) {
      return res.status(400).json({ 
        success: false, 
        message: 'startDate and endDate are required' 
      });
    }

    const timeframe = {
      start: new Date(startDate),
      end: new Date(endDate),
    };

    if (userId) {
      // User-specific analytics
      const userAnalytics = await behaviorAnalyticsService.getUserAnalytics(userId, timeframe);
      res.json({
        success: true,
        data: userAnalytics,
      });
    } else {
      // System-wide real-time metrics
      const realTimeMetrics = await behaviorAnalyticsService.getRealTimeMetrics();
      res.json({
        success: true,
        data: realTimeMetrics,
      });
    }

  } catch (error) {
    logger.error('Failed to get analytics trends', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve analytics trends',
    });
  }
});

/**
 * GET /api/v1/behavior/analytics/cohorts
 * Get cohort analysis data
 */
router.get('/analytics/cohorts', async (req: Request, res: Response) => {
  try {
    const cohortPeriod = (req.query.cohortPeriod as string) || 'month';
    const lookbackPeriods = req.query.lookbackPeriods 
      ? parseInt(req.query.lookbackPeriods as string, 10)
      : 12;

    const cohortAnalysis = await behaviorAnalyticsService.performCohortAnalysis(
      cohortPeriod as any,
      lookbackPeriods
    );

    res.json({
      success: true,
      data: cohortAnalysis,
    });

  } catch (error) {
    logger.error('Failed to get cohort analysis', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve cohort analysis',
    });
  }
});

// Privacy and Consent Routes

/**
 * GET /api/v1/behavior/privacy
 * Get user privacy settings
 */
router.get('/privacy', async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId as string;
    if (!userId) {
      return res.status(400).json({ success: false, message: 'userId is required' });
    }

    const privacySettings = await privacyComplianceService.getUserPrivacySettings(userId);

    if (!privacySettings) {
      return res.status(404).json({
        success: false,
        message: 'Privacy settings not found for user',
      });
    }

    res.json({
      success: true,
      data: privacySettings,
    });

  } catch (error) {
    logger.error('Failed to get privacy settings', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve privacy settings',
    });
  }
});

/**
 * PUT /api/v1/behavior/privacy
 * Update user privacy settings
 */
router.put('/privacy', async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId as string;
    if (!userId) {
      return res.status(400).json({ success: false, message: 'userId is required' });
    }

    const { settings, metadata } = UpdatePrivacySettingsRequestSchema.parse(req.body);

    const updatedSettings = await privacyComplianceService.updatePrivacySettings(
      userId,
      settings,
      metadata || {}
    );

    res.json({
      success: true,
      data: updatedSettings,
      message: 'Privacy settings updated successfully',
    });

  } catch (error) {
    logger.error('Failed to update privacy settings', error);
    res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to update privacy settings',
    });
  }
});

/**
 * POST /api/v1/behavior/privacy/consent
 * Initialize or update user consent preferences
 */
router.post('/privacy/consent', async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId as string;
    if (!userId) {
      return res.status(400).json({ success: false, message: 'userId is required' });
    }

    const { settings, metadata } = UpdatePrivacySettingsRequestSchema.parse(req.body);

    const privacySettings = await privacyComplianceService.initializeUserPrivacySettings(
      userId,
      settings,
      metadata || {}
    );

    res.status(201).json({
      success: true,
      data: privacySettings,
      message: 'Privacy settings initialized successfully',
    });

  } catch (error) {
    logger.error('Failed to initialize privacy settings', error);
    res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to initialize privacy settings',
    });
  }
});

/**
 * DELETE /api/v1/behavior/data
 * Request data deletion (GDPR compliance)
 */
router.delete('/data', async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId as string;
    if (!userId) {
      return res.status(400).json({ success: false, message: 'userId is required' });
    }

    const { requestType, dataTypes, metadata } = DataDeletionRequestSchema.parse(req.body);

    const deletionRequest = await privacyComplianceService.requestDataDeletion(
      userId,
      requestType,
      dataTypes,
      metadata || {}
    );

    res.status(202).json({
      success: true,
      data: deletionRequest,
      message: 'Data deletion request submitted successfully',
    });

  } catch (error) {
    logger.error('Failed to request data deletion', error);
    res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to request data deletion',
    });
  }
});

/**
 * POST /api/v1/behavior/data/export
 * Request data export (GDPR compliance)
 */
router.post('/data/export', async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId as string;
    if (!userId) {
      return res.status(400).json({ success: false, message: 'userId is required' });
    }

    const { dataTypes, format, metadata } = DataExportRequestSchema.parse(req.body);

    const exportRequest = await privacyComplianceService.requestDataExport(
      userId,
      dataTypes,
      format,
      metadata || {}
    );

    res.status(202).json({
      success: true,
      data: exportRequest,
      message: 'Data export request submitted successfully',
    });

  } catch (error) {
    logger.error('Failed to request data export', error);
    res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to request data export',
    });
  }
});

// System Administration Routes

/**
 * POST /api/v1/behavior/admin/insights/system
 * Generate system-wide insights (admin only)
 */
router.post('/admin/insights/system', async (req: Request, res: Response) => {
  try {
    // Note: In production, add authentication and authorization middleware
    const systemInsights = await insightGenerationService.generateSystemWideInsights();

    res.json({
      success: true,
      data: {
        insights: systemInsights,
        count: systemInsights.length,
        generatedAt: new Date(),
      },
    });

  } catch (error) {
    logger.error('Failed to generate system insights', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate system insights',
    });
  }
});

/**
 * POST /api/v1/behavior/admin/models/retrain
 * Retrain machine learning models (admin only)
 */
router.post('/admin/models/retrain', async (req: Request, res: Response) => {
  try {
    // Note: In production, add authentication and authorization middleware
    const retrainResults = await behaviorLearningService.retrainModels();

    res.json({
      success: true,
      data: {
        results: retrainResults,
        modelsRetrained: retrainResults.length,
        completedAt: new Date(),
      },
      message: 'Model retraining completed successfully',
    });

  } catch (error) {
    logger.error('Failed to retrain models', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrain models',
    });
  }
});

/**
 * GET /api/v1/behavior/admin/health
 * Get service health status
 */
router.get('/admin/health', async (req: Request, res: Response) => {
  try {
    const health = behaviorAnalyticsService.getServiceHealth();
    const queueStatus = behaviorTrackingService.getQueueStatus();

    res.json({
      success: true,
      data: {
        serviceHealth: health,
        queueStatus,
        timestamp: new Date(),
      },
    });

  } catch (error) {
    logger.error('Failed to get service health', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get service health',
    });
  }
});

export default router;