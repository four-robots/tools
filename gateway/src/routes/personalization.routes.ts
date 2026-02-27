/**
 * Personalization API Routes
 * 
 * Comprehensive REST API endpoints for personalized search experiences:
 * - User personalization profile management
 * - Personalized search result generation
 * - Interest modeling and management
 * - Personalized recommendations
 * - Adaptive interface customization
 * - A/B testing and experiments
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import {
  PersonalizationSystem,
  PersonalizeSearchRequestSchema,
  RecommendationRequestSchema,
  UserPersonalizationProfileSchema,
  UserInterestSchema,
  InterfacePreferencesSchema,
  SearchPreferencesSchema,
} from '@mcp-tools/core';
import { getDatabaseConnection } from '../database/index.js';
import { Logger } from '../utils/logger.js';
import { authMiddleware } from '../middleware/auth.js';
import { validationMiddleware } from '../middleware/validation.middleware.js';

const router = Router();
const logger = new Logger('PersonalizationRoutes');

// Initialize personalization system (lazy initialization)
let personalizationSystem: PersonalizationSystem | null = null;

async function getPersonalizationSystem(): Promise<PersonalizationSystem> {
  if (!personalizationSystem) {
    const db = getDatabaseConnection();
    personalizationSystem = await PersonalizationSystem.initialize(db);
    logger.info('Personalization system initialized');
  }
  return personalizationSystem;
}

// Authentication middleware for all personalization routes
router.use(authMiddleware);

// Request validation schemas
const UpdateProfileRequestSchema = z.object({
  profileName: z.string().min(1).max(255).optional(),
  profileDescription: z.string().max(500).optional(),
  personalizationLevel: z.enum(['low', 'medium', 'high', 'custom']).optional(),
  learningEnabled: z.boolean().optional(),
  suggestionEnabled: z.boolean().optional(),
  recommendationEnabled: z.boolean().optional(),
  searchPreferences: SearchPreferencesSchema.optional(),
  interfacePreferences: InterfacePreferencesSchema.optional(),
});

const AddInterestRequestSchema = z.object({
  interestType: z.enum(['topic', 'category', 'content_type', 'entity', 'skill', 'domain']),
  interestName: z.string().min(1).max(255),
  interestDescription: z.string().max(500).optional(),
  interestKeywords: z.array(z.string()).optional(),
});

const FeedbackRequestSchema = z.object({
  feedbackScore: z.number().int().min(-2).max(2),
  implicitSignals: z.record(z.unknown()).optional(),
});

const ExperimentInteractionSchema = z.object({
  interactionType: z.string(),
  interactionData: z.record(z.unknown()),
  timestamp: z.string().datetime().optional(),
});

// =====================
// PERSONALIZATION PROFILES
// =====================

/**
 * GET /api/v1/personalization/profile
 * Get user's personalization profile
 */
router.get('/profile', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const system = await getPersonalizationSystem();
    const profile = await system.engine.getPersonalizationProfile(userId);

    res.json({
      success: true,
      data: profile
    });

  } catch (error) {
    logger.error('Error getting personalization profile:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get personalization profile'
    });
  }
});

/**
 * PUT /api/v1/personalization/profile
 * Update user's personalization profile
 */
router.put('/profile', validationMiddleware(UpdateProfileRequestSchema), async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const updates = req.body;
    const system = await getPersonalizationSystem();
    const updatedProfile = await system.engine.updatePersonalizationProfile(userId, updates);

    res.json({
      success: true,
      data: updatedProfile
    });

  } catch (error) {
    logger.error('Error updating personalization profile:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update personalization profile'
    });
  }
});

/**
 * POST /api/v1/personalization/profile/reset
 * Reset user's personalization profile to defaults
 */
router.post('/profile/reset', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const system = await getPersonalizationSystem();
    const resetProfile = await system.engine.resetPersonalizationProfile(userId);

    res.json({
      success: true,
      data: resetProfile,
      message: 'Personalization profile reset to defaults'
    });

  } catch (error) {
    logger.error('Error resetting personalization profile:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reset personalization profile'
    });
  }
});

// =====================
// PERSONALIZED SEARCH
// =====================

/**
 * POST /api/v1/personalization/search
 * Execute personalized search with result ranking
 */
router.post('/search', validationMiddleware(PersonalizeSearchRequestSchema), async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id || 'anonymous';
    const { query, originalResults, context } = req.body;
    
    const system = await getPersonalizationSystem();
    const result = await system.personalizedSearch(userId, query, originalResults, context);

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    logger.error('Error executing personalized search:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to execute personalized search'
    });
  }
});

/**
 * GET /api/v1/personalization/search/history
 * Get user's personalized search history
 */
router.get('/search/history', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;

    const db = getDatabaseConnection();
    const searchHistory = await db.selectFrom('personalized_search_results')
      .selectAll()
      .where('user_id', '=', userId)
      .orderBy('search_timestamp', 'desc')
      .limit(limit)
      .offset(offset)
      .execute();

    res.json({
      success: true,
      data: searchHistory.map(search => ({
        id: search.id,
        query: search.search_query,
        timestamp: search.search_timestamp,
        confidenceScore: search.confidence_score,
        responseTime: search.response_time_ms,
        factorCount: JSON.parse(search.personalization_factors).length
      }))
    });

  } catch (error) {
    logger.error('Error getting search history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get search history'
    });
  }
});

/**
 * POST /api/v1/personalization/search/feedback
 * Submit feedback on personalized search results
 */
router.post('/search/feedback', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { searchId, resultsClicked, resultsSaved, resultsShared } = req.body;

    const db = getDatabaseConnection();
    await db.updateTable('personalized_search_results')
      .set({
        results_clicked: JSON.stringify(resultsClicked || []),
        results_saved: JSON.stringify(resultsSaved || []),
        results_shared: JSON.stringify(resultsShared || [])
      })
      .where('id', '=', searchId)
      .where('user_id', '=', userId)
      .execute();

    res.json({
      success: true,
      message: 'Search feedback recorded'
    });

  } catch (error) {
    logger.error('Error recording search feedback:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to record search feedback'
    });
  }
});

// =====================
// RECOMMENDATIONS
// =====================

/**
 * GET /api/v1/personalization/recommendations
 * Get personalized recommendations
 */
router.get('/recommendations', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const type = req.query.type as string;
    const category = req.query.category as string;
    const count = parseInt(req.query.count as string) || 10;

    const system = await getPersonalizationSystem();
    const recommendations = await system.recommendations.generateRecommendations(
      userId,
      type as any,
      count,
      { category }
    );

    res.json({
      success: true,
      data: recommendations
    });

  } catch (error) {
    logger.error('Error getting recommendations:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get recommendations'
    });
  }
});

/**
 * GET /api/v1/personalization/suggestions
 * Get query suggestions based on user interests
 */
router.get('/suggestions', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const count = parseInt(req.query.count as string) || 5;
    let context = {};
    if (req.query.context) {
      try { context = JSON.parse(req.query.context as string); } catch { /* invalid JSON, use default */ }
    }

    const system = await getPersonalizationSystem();
    const suggestions = await system.recommendations.generateRecommendations(
      userId,
      'search_query',
      count,
      context
    );

    res.json({
      success: true,
      data: suggestions.map(suggestion => ({
        id: suggestion.id,
        query: suggestion.recommendationData.query,
        title: suggestion.recommendationTitle,
        description: suggestion.recommendationDescription,
        relevanceScore: suggestion.relevanceScore
      }))
    });

  } catch (error) {
    logger.error('Error getting suggestions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get suggestions'
    });
  }
});

/**
 * POST /api/v1/personalization/recommendations/:id/feedback
 * Provide feedback on a recommendation
 */
router.post('/recommendations/:id/feedback', validationMiddleware(FeedbackRequestSchema), async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const recommendationId = req.params.id;
    const { feedbackScore, implicitSignals } = req.body;

    const system = await getPersonalizationSystem();
    await system.recommendations.provideFeedback(userId, recommendationId, feedbackScore, implicitSignals);

    res.json({
      success: true,
      message: 'Recommendation feedback recorded'
    });

  } catch (error) {
    logger.error('Error recording recommendation feedback:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to record recommendation feedback'
    });
  }
});

// =====================
// INTEREST MANAGEMENT
// =====================

/**
 * GET /api/v1/personalization/interests
 * Get user's interests
 */
router.get('/interests', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const activeOnly = req.query.activeOnly === 'true';
    
    const system = await getPersonalizationSystem();
    const interests = await system.interests.getUserInterests(userId, activeOnly);

    res.json({
      success: true,
      data: interests
    });

  } catch (error) {
    logger.error('Error getting user interests:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get user interests'
    });
  }
});

/**
 * POST /api/v1/personalization/interests
 * Add explicit user interest
 */
router.post('/interests', validationMiddleware(AddInterestRequestSchema), async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const interestData = req.body;
    
    const system = await getPersonalizationSystem();
    const interest = await system.interests.addExplicitInterest(userId, interestData);

    res.status(201).json({
      success: true,
      data: interest,
      message: 'Interest added successfully'
    });

  } catch (error) {
    logger.error('Error adding user interest:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add user interest'
    });
  }
});

/**
 * PUT /api/v1/personalization/interests/:id
 * Update user interest
 */
router.put('/interests/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const interestId = req.params.id;
    const updates = req.body;

    const system = await getPersonalizationSystem();
    const updatedInterest = await system.interests.updateInterest(userId, interestId, updates);

    res.json({
      success: true,
      data: updatedInterest,
      message: 'Interest updated successfully'
    });

  } catch (error) {
    logger.error('Error updating user interest:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update user interest'
    });
  }
});

/**
 * DELETE /api/v1/personalization/interests/:id
 * Remove user interest
 */
router.delete('/interests/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const interestId = req.params.id;

    const system = await getPersonalizationSystem();
    await system.interests.removeInterest(userId, interestId);

    res.json({
      success: true,
      message: 'Interest removed successfully'
    });

  } catch (error) {
    logger.error('Error removing user interest:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to remove user interest'
    });
  }
});

/**
 * GET /api/v1/personalization/interests/suggestions
 * Get suggested interests for user
 */
router.get('/interests/suggestions', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const count = parseInt(req.query.count as string) || 5;

    const system = await getPersonalizationSystem();
    const suggestions = await system.interests.suggestInterests(userId, count);

    res.json({
      success: true,
      data: suggestions
    });

  } catch (error) {
    logger.error('Error getting interest suggestions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get interest suggestions'
    });
  }
});

// =====================
// ADAPTIVE INTERFACE
// =====================

/**
 * GET /api/v1/personalization/interface
 * Get adaptive interface configuration
 */
router.get('/interface', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    let context = {};
    if (req.query.context) {
      try { context = JSON.parse(req.query.context as string); } catch { /* invalid JSON, use default */ }
    }

    const system = await getPersonalizationSystem();
    const adaptiveLayout = await system.adaptiveInterface.getAdaptiveLayout(userId, context);

    res.json({
      success: true,
      data: adaptiveLayout
    });

  } catch (error) {
    logger.error('Error getting adaptive interface:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get adaptive interface'
    });
  }
});

/**
 * PUT /api/v1/personalization/interface
 * Update interface preferences
 */
router.put('/interface', validationMiddleware(InterfacePreferencesSchema), async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const preferences = req.body;

    const system = await getPersonalizationSystem();
    await system.adaptiveInterface.customizeSearchInterface(userId, preferences);

    res.json({
      success: true,
      message: 'Interface preferences updated successfully'
    });

  } catch (error) {
    logger.error('Error updating interface preferences:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update interface preferences'
    });
  }
});

/**
 * GET /api/v1/personalization/interface/layout
 * Get personalized layout configuration
 */
router.get('/interface/layout', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    let deviceInfo = {};
    if (req.query.device) {
      try { deviceInfo = JSON.parse(req.query.device as string); } catch { /* invalid JSON, use default */ }
    }
    const context = { device: deviceInfo, ...req.query };

    const system = await getPersonalizationSystem();
    const layout = await system.adaptiveInterface.getAdaptiveLayout(userId, context);

    res.json({
      success: true,
      data: layout
    });

  } catch (error) {
    logger.error('Error getting personalized layout:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get personalized layout'
    });
  }
});

/**
 * POST /api/v1/personalization/interface/sync
 * Synchronize personalization across devices
 */
router.post('/interface/sync', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const system = await getPersonalizationSystem();
    await system.adaptiveInterface.syncPersonalizationAcrossDevices(userId);

    res.json({
      success: true,
      message: 'Personalization synchronized across devices'
    });

  } catch (error) {
    logger.error('Error syncing personalization:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to sync personalization'
    });
  }
});

// =====================
// ANALYTICS & INSIGHTS
// =====================

/**
 * GET /api/v1/personalization/analytics
 * Get personalization analytics for user
 */
router.get('/analytics', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const system = await getPersonalizationSystem();
    const analytics = await system.analyzeUser(userId);

    // Calculate analytics metrics
    const metrics = {
      totalInterests: analytics.interests.length,
      activeInterests: analytics.interests.filter((i: any) => i.isActive).length,
      explicitInterests: analytics.interests.filter((i: any) => i.isExplicit).length,
      averageAffinityScore: analytics.interests.reduce((sum: number, i: any) => sum + i.affinityScore, 0) / analytics.interests.length || 0,
      activeRecommendations: analytics.recommendations.length,
      personalizationLevel: analytics.profile?.personalizationLevel || 'medium'
    };

    res.json({
      success: true,
      data: {
        profile: analytics.profile,
        metrics,
        topInterests: analytics.interests.slice(0, 10),
        recentRecommendations: analytics.recommendations.slice(0, 5)
      }
    });

  } catch (error) {
    logger.error('Error getting personalization analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get personalization analytics'
    });
  }
});

/**
 * POST /api/v1/personalization/behavior-update
 * Update personalization from behavior events
 */
router.post('/behavior-update', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { events } = req.body;
    
    if (!Array.isArray(events) || events.length === 0) {
      return res.status(400).json({ error: 'Events array is required' });
    }

    const system = await getPersonalizationSystem();
    const result = await system.updateUserFromBehavior(userId, events);

    res.json({
      success: true,
      data: result,
      message: `Processed ${events.length} events, discovered ${result.newInterests.length} new interests`
    });

  } catch (error) {
    logger.error('Error updating from behavior:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update from behavior events'
    });
  }
});

export default router;