/**
 * Saved Search Management API Routes
 *
 * REST API endpoints for comprehensive saved search management including:
 * - Search CRUD operations
 * - Collection/folder organization
 * - Scheduling and automation
 * - Sharing and collaboration
 * - Version history management
 * - Analytics and insights
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { asyncHandler } from '../middleware/errorHandler.js';
import { validateRequest } from '../middleware/validation.middleware.js';
import { auth } from '../middleware/auth.js';
import {
  SavedSearchService,
  SearchSharingService,
  SearchSchedulerService,
  SearchAnalyticsService,
  SaveSearchRequestSchema,
  UpdateSearchRequestSchema,
  SearchListOptionsSchema,
  CreateCollectionRequestSchema,
  SearchSharingConfigSchema,
  DateRangeSchema,
  // Error classes for proper error handling
  isSavedSearchError,
  formatErrorResponse,
  SearchNotFoundError,
  PermissionDeniedError,
  CollectionNotFoundError,
  VersionNotFoundError,
  ValidationError,
} from '@mcp-tools/core';

const router = Router();

// ============================================================================
// AUTHENTICATION & TYPE EXTENSIONS
// ============================================================================

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    email: string;
    name: string;
  };
}

// Apply authentication middleware to all routes
router.use(auth);

// ============================================================================
// Rate Limiting
// ============================================================================

const standardRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many requests from this IP, please try again later.'
    }
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const schedulingRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // limit scheduling operations
  message: {
    error: {
      code: 'SCHEDULING_RATE_LIMITED',
      message: 'Too many scheduling operations from this IP, please try again later.'
    }
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// ============================================================================
// Validation Schemas
// ============================================================================

const UuidParamSchema = z.object({
  id: z.string().uuid(),
});

const SearchIdParamSchema = z.object({
  searchId: z.string().uuid(),
});

const ScheduleUpdateSchema = z.object({
  scheduleType: z.enum(['once', 'daily', 'weekly', 'monthly', 'custom']).optional(),
  cronExpression: z.string().optional(),
  timezone: z.string().default('UTC').optional(),
  isActive: z.boolean().optional(),
  maxExecutions: z.number().int().positive().optional(),
  notificationSettings: z.record(z.any()).optional(),
});

const SharePermissionSchema = z.object({
  permissionLevel: z.enum(['view', 'edit', 'admin']),
  expiresAt: z.string().datetime().optional().transform(val => val ? new Date(val) : undefined),
});

const AnalyticsQuerySchema = z.object({
  timeRange: z.object({
    from: z.string().datetime().transform(val => new Date(val)),
    to: z.string().datetime().transform(val => new Date(val)),
    granularity: z.enum(['hour', 'day', 'week', 'month']).default('day'),
  }).optional(),
  format: z.enum(['json', 'csv', 'xlsx']).default('json').optional(),
});

// ============================================================================
// SEARCH MANAGEMENT ROUTES
// ============================================================================

/**
 * POST /api/v1/saved-searches - Save a new search
 */
router.post('/', [
  standardRateLimit,
  validateRequest(SaveSearchRequestSchema, 'body')
], asyncHandler(async (req: AuthenticatedRequest, res: any) => {
  const userId = req.user.id;

  try {
    const savedSearchService = new SavedSearchService(req.app.locals.db);
    const savedSearch = await savedSearchService.saveSearch(req.body, userId);

    console.log(`💾 Search saved: "${savedSearch.name}" by user ${userId}`);

    res.success({
      search: savedSearch,
      message: 'Search saved successfully'
    });

  } catch (error) {
    console.error('❌ Failed to save search:', error);
    res.status(500).error(
      'SAVE_FAILED',
      'Failed to save search',
      { error_type: error?.constructor?.name || 'Unknown' }
    );
  }
}));

/**
 * GET /api/v1/saved-searches - List user's saved searches
 */
router.get('/', [
  standardRateLimit,
  validateRequest(SearchListOptionsSchema, 'query')
], asyncHandler(async (req: AuthenticatedRequest, res: any) => {
  const userId = req.user.id;

  try {
    const savedSearchService = new SavedSearchService(req.app.locals.db);
    const paginatedResults = await savedSearchService.getUserSearches(userId, req.query);

    res.success(paginatedResults);

  } catch (error) {
    console.error('❌ Failed to list saved searches:', error);
    res.status(500).error(
      'LIST_FAILED',
      'Failed to retrieve saved searches',
      { error_type: error?.constructor?.name || 'Unknown' }
    );
  }
}));

// ============================================================================
// COLLECTION MANAGEMENT ROUTES (static paths - must be before /:id)
// ============================================================================

/**
 * GET /api/v1/saved-searches/collections - Get user's collection tree
 */
router.get('/collections', [
  standardRateLimit
], asyncHandler(async (req: AuthenticatedRequest, res: any) => {
  const userId = req.user.id;

  try {
    const savedSearchService = new SavedSearchService(req.app.locals.db);
    const collections = await savedSearchService.getCollections(userId);

    res.success({ collections });

  } catch (error) {
    console.error('❌ Failed to get collections:', error);
    res.status(500).error(
      'COLLECTIONS_FAILED',
      'Failed to retrieve collections',
      { error_type: error?.constructor?.name || 'Unknown' }
    );
  }
}));

/**
 * POST /api/v1/saved-searches/collections - Create a new collection
 */
router.post('/collections', [
  standardRateLimit,
  validateRequest(CreateCollectionRequestSchema, 'body')
], asyncHandler(async (req: AuthenticatedRequest, res: any) => {
  const userId = req.user.id;

  try {
    const savedSearchService = new SavedSearchService(req.app.locals.db);
    const collection = await savedSearchService.createCollection(req.body, userId);

    console.log(`📁 Collection created: "${collection.name}" by user ${userId}`);

    res.success({
      collection,
      message: 'Collection created successfully'
    });

  } catch (error) {
    console.error('❌ Failed to create collection:', error);
    res.status(500).error(
      'CREATE_COLLECTION_FAILED',
      'Failed to create collection',
      { error_type: error?.constructor?.name || 'Unknown' }
    );
  }
}));

// ============================================================================
// SCHEDULING ROUTES (static paths - must be before /:id)
// ============================================================================

/**
 * GET /api/v1/saved-searches/schedules - Get user's scheduled searches
 */
router.get('/schedules', [
  standardRateLimit
], asyncHandler(async (req: AuthenticatedRequest, res: any) => {
  const userId = req.user.id;

  try {
    const schedulerService = new SearchSchedulerService(req.app.locals.db);
    const scheduledSearches = await schedulerService.getScheduledSearches(userId);

    res.success({ scheduled_searches: scheduledSearches });

  } catch (error) {
    console.error('❌ Failed to get scheduled searches:', error);
    res.status(500).error(
      'SCHEDULES_FAILED',
      'Failed to retrieve scheduled searches',
      { error_type: error?.constructor?.name || 'Unknown' }
    );
  }
}));

/**
 * PUT /api/v1/saved-searches/schedules/:id - Update a schedule
 */
router.put('/schedules/:id', [
  schedulingRateLimit,
  validateRequest(UuidParamSchema, 'params'),
  validateRequest(ScheduleUpdateSchema, 'body')
], asyncHandler(async (req: AuthenticatedRequest, res: any) => {
  const userId = req.user.id;
  const { id } = req.params;

  if (!userId) {
    return res.status(401).error('UNAUTHORIZED', 'User authentication required');
  }

  try {
    const schedulerService = new SearchSchedulerService(req.app.locals.db);
    const updatedSchedule = await schedulerService.updateSchedule(id, req.body, userId);

    console.log(`⏰ Schedule updated: ${id} by user ${userId}`);

    res.success({
      scheduled_search: updatedSchedule,
      message: 'Schedule updated successfully'
    });

  } catch (error) {
    console.error('❌ Failed to update schedule:', error);

    if (error instanceof Error && error.message === 'Access denied') {
      return res.status(403).error('ACCESS_DENIED', 'You do not have permission to modify this schedule');
    }

    if (error instanceof Error && error.message === 'Schedule not found') {
      return res.status(404).error('NOT_FOUND', 'Schedule not found');
    }

    res.status(500).error(
      'UPDATE_SCHEDULE_FAILED',
      'Failed to update schedule',
      { error_type: error?.constructor?.name || 'Unknown' }
    );
  }
}));

/**
 * DELETE /api/v1/saved-searches/schedules/:id - Delete a schedule
 */
router.delete('/schedules/:id', [
  standardRateLimit,
  validateRequest(UuidParamSchema, 'params')
], asyncHandler(async (req: AuthenticatedRequest, res: any) => {
  const userId = req.user.id;
  const { id } = req.params;

  if (!userId) {
    return res.status(401).error('UNAUTHORIZED', 'User authentication required');
  }

  try {
    const schedulerService = new SearchSchedulerService(req.app.locals.db);
    await schedulerService.deleteSchedule(id, userId);

    console.log(`🗑️ Schedule deleted: ${id} by user ${userId}`);

    res.success({ message: 'Schedule deleted successfully' });

  } catch (error) {
    console.error('❌ Failed to delete schedule:', error);

    if (error instanceof Error && error.message === 'Access denied') {
      return res.status(403).error('ACCESS_DENIED', 'You do not have permission to delete this schedule');
    }

    if (error instanceof Error && error.message === 'Schedule not found') {
      return res.status(404).error('NOT_FOUND', 'Schedule not found');
    }

    res.status(500).error(
      'DELETE_SCHEDULE_FAILED',
      'Failed to delete schedule',
      { error_type: error?.constructor?.name || 'Unknown' }
    );
  }
}));

// ============================================================================
// SHARING ROUTES (static paths - must be before /:id)
// ============================================================================

/**
 * GET /api/v1/saved-searches/shared - Get searches shared with user
 */
router.get('/shared', [
  standardRateLimit
], asyncHandler(async (req: AuthenticatedRequest, res: any) => {
  const userId = req.user.id;

  try {
    const sharingService = new SearchSharingService(req.app.locals.db);
    const sharedSearches = await sharingService.getSharedSearches(userId);

    res.success({ shared_searches: sharedSearches });

  } catch (error) {
    console.error('❌ Failed to get shared searches:', error);
    res.status(500).error(
      'SHARED_SEARCHES_FAILED',
      'Failed to retrieve shared searches',
      { error_type: error?.constructor?.name || 'Unknown' }
    );
  }
}));

/**
 * DELETE /api/v1/saved-searches/shares/:id - Revoke a share
 */
router.delete('/shares/:id', [
  standardRateLimit,
  validateRequest(UuidParamSchema, 'params')
], asyncHandler(async (req: AuthenticatedRequest, res: any) => {
  const userId = req.user.id;
  const { id } = req.params;

  if (!userId) {
    return res.status(401).error('UNAUTHORIZED', 'User authentication required');
  }

  try {
    const sharingService = new SearchSharingService(req.app.locals.db);
    await sharingService.revokeShare(id, userId);

    console.log(`🚫 Share revoked: ${id} by user ${userId}`);

    res.success({ message: 'Share revoked successfully' });

  } catch (error) {
    console.error('❌ Failed to revoke share:', error);

    if (error instanceof Error && error.message.includes('permission')) {
      return res.status(403).error('ACCESS_DENIED', 'You do not have permission to revoke this share');
    }

    if (error instanceof Error && error.message === 'Share not found') {
      return res.status(404).error('NOT_FOUND', 'Share not found');
    }

    res.status(500).error(
      'REVOKE_SHARE_FAILED',
      'Failed to revoke share',
      { error_type: error?.constructor?.name || 'Unknown' }
    );
  }
}));

// ============================================================================
// ANALYTICS ROUTES (static paths - must be before /:id)
// ============================================================================

/**
 * GET /api/v1/saved-searches/user-stats - Get user search statistics
 */
router.get('/user-stats', [
  standardRateLimit,
  validateRequest(AnalyticsQuerySchema, 'query')
], asyncHandler(async (req: AuthenticatedRequest, res: any) => {
  const userId = req.user.id;
  const { timeRange } = req.query as any;

  if (!userId) {
    return res.status(401).error('UNAUTHORIZED', 'User authentication required');
  }

  try {
    const analyticsService = new SearchAnalyticsService(req.app.locals.db);
    const stats = await analyticsService.getUserSearchStats(userId, timeRange);

    res.success({
      user_stats: stats,
      user_id: userId,
      generated_at: new Date().toISOString(),
      time_range: timeRange
    });

  } catch (error) {
    console.error('❌ Failed to get user stats:', error);
    res.status(500).error(
      'USER_STATS_FAILED',
      'Failed to retrieve user statistics',
      { error_type: error?.constructor?.name || 'Unknown' }
    );
  }
}));

// ============================================================================
// PARAMETERIZED ROUTES (/:id and sub-paths - must come after all static routes)
// ============================================================================

/**
 * GET /api/v1/saved-searches/:id - Get a specific saved search
 */
router.get('/:id', [
  standardRateLimit,
  validateRequest(UuidParamSchema, 'params')
], asyncHandler(async (req: AuthenticatedRequest, res: any) => {
  const userId = req.user.id;
  const { id } = req.params;

  if (!userId) {
    return res.status(401).error('UNAUTHORIZED', 'User authentication required');
  }

  try {
    const savedSearchService = new SavedSearchService(req.app.locals.db);
    const savedSearch = await savedSearchService.getSearchById(id, userId);

    res.success({ search: savedSearch });

  } catch (error) {
    console.error('❌ Failed to get saved search:', error);

    if (isSavedSearchError(error)) {
      const errorResponse = formatErrorResponse(error);
      return res.status(errorResponse.statusCode).error(
        errorResponse.code,
        errorResponse.message,
        errorResponse.details
      );
    }

    res.status(500).error(
      'GET_FAILED',
      'Failed to retrieve saved search',
      { error_type: error?.constructor?.name || 'Unknown' }
    );
  }
}));

/**
 * PUT /api/v1/saved-searches/:id - Update a saved search
 */
router.put('/:id', [
  standardRateLimit,
  validateRequest(UuidParamSchema, 'params'),
  validateRequest(UpdateSearchRequestSchema, 'body')
], asyncHandler(async (req: AuthenticatedRequest, res: any) => {
  const userId = req.user.id;
  const { id } = req.params;

  if (!userId) {
    return res.status(401).error('UNAUTHORIZED', 'User authentication required');
  }

  try {
    const savedSearchService = new SavedSearchService(req.app.locals.db);
    const updatedSearch = await savedSearchService.updateSearch(id, req.body, userId);

    console.log(`📝 Search updated: "${updatedSearch.name}" by user ${userId}`);

    res.success({
      search: updatedSearch,
      message: 'Search updated successfully'
    });

  } catch (error) {
    console.error('❌ Failed to update saved search:', error);

    if (error instanceof Error && error.message === 'Access denied') {
      return res.status(403).error('ACCESS_DENIED', 'You do not have permission to edit this search');
    }

    if (error instanceof Error && error.message === 'Search not found') {
      return res.status(404).error('NOT_FOUND', 'Saved search not found');
    }

    res.status(500).error(
      'UPDATE_FAILED',
      'Failed to update saved search',
      { error_type: error?.constructor?.name || 'Unknown' }
    );
  }
}));

/**
 * DELETE /api/v1/saved-searches/:id - Delete a saved search
 */
router.delete('/:id', [
  standardRateLimit,
  validateRequest(UuidParamSchema, 'params')
], asyncHandler(async (req: AuthenticatedRequest, res: any) => {
  const userId = req.user.id;
  const { id } = req.params;

  if (!userId) {
    return res.status(401).error('UNAUTHORIZED', 'User authentication required');
  }

  try {
    const savedSearchService = new SavedSearchService(req.app.locals.db);
    await savedSearchService.deleteSearch(id, userId);

    console.log(`🗑️ Search deleted: ${id} by user ${userId}`);

    res.success({ message: 'Search deleted successfully' });

  } catch (error) {
    console.error('❌ Failed to delete saved search:', error);

    if (error instanceof Error && error.message === 'Access denied') {
      return res.status(403).error('ACCESS_DENIED', 'You do not have permission to delete this search');
    }

    if (error instanceof Error && error.message === 'Search not found') {
      return res.status(404).error('NOT_FOUND', 'Saved search not found');
    }

    res.status(500).error(
      'DELETE_FAILED',
      'Failed to delete saved search',
      { error_type: error?.constructor?.name || 'Unknown' }
    );
  }
}));

/**
 * POST /api/v1/saved-searches/:id/execute - Execute a saved search
 */
router.post('/:id/execute', [
  standardRateLimit,
  validateRequest(UuidParamSchema, 'params')
], asyncHandler(async (req: AuthenticatedRequest, res: any) => {
  const userId = req.user.id;
  const { id } = req.params;

  if (!userId) {
    return res.status(401).error('UNAUTHORIZED', 'User authentication required');
  }

  try {
    const savedSearchService = new SavedSearchService(req.app.locals.db);
    const results = await savedSearchService.executeSearch(id, userId);

    console.log(`🔍 Search executed: ${id} by user ${userId}`);

    res.success({
      results,
      executed_at: new Date().toISOString(),
      message: 'Search executed successfully'
    });

  } catch (error) {
    console.error('❌ Failed to execute saved search:', error);

    if (error instanceof Error && error.message === 'Access denied') {
      return res.status(403).error('ACCESS_DENIED', 'You do not have permission to execute this search');
    }

    if (error instanceof Error && error.message === 'Search not found') {
      return res.status(404).error('NOT_FOUND', 'Saved search not found');
    }

    res.status(500).error(
      'EXECUTE_FAILED',
      'Failed to execute saved search',
      { error_type: error?.constructor?.name || 'Unknown' }
    );
  }
}));

/**
 * POST /api/v1/saved-searches/:searchId/add-to-collection - Add search to collection
 */
router.post('/:searchId/add-to-collection', [
  standardRateLimit,
  validateRequest(SearchIdParamSchema, 'params'),
  validateRequest(z.object({ collectionId: z.string().uuid() }), 'body')
], asyncHandler(async (req: AuthenticatedRequest, res: any) => {
  const userId = req.user.id;
  const { searchId } = req.params;
  const { collectionId } = req.body;

  if (!userId) {
    return res.status(401).error('UNAUTHORIZED', 'User authentication required');
  }

  try {
    const savedSearchService = new SavedSearchService(req.app.locals.db);
    await savedSearchService.addToCollection(searchId, collectionId, userId);

    console.log(`📁 Search ${searchId} added to collection ${collectionId} by user ${userId}`);

    res.success({ message: 'Search added to collection successfully' });

  } catch (error) {
    console.error('❌ Failed to add search to collection:', error);

    if (error instanceof Error && error.message === 'Access denied') {
      return res.status(403).error('ACCESS_DENIED', 'You do not have permission to modify this search or collection');
    }

    res.status(500).error(
      'ADD_TO_COLLECTION_FAILED',
      'Failed to add search to collection',
      { error_type: error?.constructor?.name || 'Unknown' }
    );
  }
}));

/**
 * POST /api/v1/saved-searches/:searchId/remove-from-collection - Remove search from collection
 */
router.post('/:searchId/remove-from-collection', [
  standardRateLimit,
  validateRequest(SearchIdParamSchema, 'params'),
  validateRequest(z.object({ collectionId: z.string().uuid() }), 'body')
], asyncHandler(async (req: AuthenticatedRequest, res: any) => {
  const userId = req.user.id;
  const { searchId } = req.params;
  const { collectionId } = req.body;

  if (!userId) {
    return res.status(401).error('UNAUTHORIZED', 'User authentication required');
  }

  try {
    const savedSearchService = new SavedSearchService(req.app.locals.db);
    await savedSearchService.removeFromCollection(searchId, collectionId, userId);

    console.log(`📁 Search ${searchId} removed from collection ${collectionId} by user ${userId}`);

    res.success({ message: 'Search removed from collection successfully' });

  } catch (error) {
    console.error('❌ Failed to remove search from collection:', error);

    if (error instanceof Error && error.message === 'Access denied') {
      return res.status(403).error('ACCESS_DENIED', 'You do not have permission to modify this search or collection');
    }

    res.status(500).error(
      'REMOVE_FROM_COLLECTION_FAILED',
      'Failed to remove search from collection',
      { error_type: error?.constructor?.name || 'Unknown' }
    );
  }
}));

/**
 * POST /api/v1/saved-searches/:id/schedule - Schedule a search
 */
router.post('/:id/schedule', [
  schedulingRateLimit,
  validateRequest(UuidParamSchema, 'params'),
  validateRequest(ScheduleUpdateSchema.required(), 'body')
], asyncHandler(async (req: AuthenticatedRequest, res: any) => {
  const userId = req.user.id;
  const { id } = req.params;

  if (!userId) {
    return res.status(401).error('UNAUTHORIZED', 'User authentication required');
  }

  try {
    const schedulerService = new SearchSchedulerService(req.app.locals.db);
    const scheduledSearch = await schedulerService.scheduleSearch(id, req.body, userId);

    console.log(`⏰ Search scheduled: ${id} by user ${userId}`);

    res.success({
      scheduled_search: scheduledSearch,
      message: 'Search scheduled successfully'
    });

  } catch (error) {
    console.error('❌ Failed to schedule search:', error);

    if (error instanceof Error && error.message === 'Access denied') {
      return res.status(403).error('ACCESS_DENIED', 'You do not have permission to schedule this search');
    }

    if (error instanceof Error && error.message === 'Search not found') {
      return res.status(404).error('NOT_FOUND', 'Saved search not found');
    }

    res.status(500).error(
      'SCHEDULE_FAILED',
      'Failed to schedule search',
      { error_type: error?.constructor?.name || 'Unknown' }
    );
  }
}));

/**
 * POST /api/v1/saved-searches/:id/share - Share a search
 */
router.post('/:id/share', [
  standardRateLimit,
  validateRequest(UuidParamSchema, 'params'),
  validateRequest(SearchSharingConfigSchema, 'body')
], asyncHandler(async (req: AuthenticatedRequest, res: any) => {
  const userId = req.user.id;
  const { id } = req.params;

  if (!userId) {
    return res.status(401).error('UNAUTHORIZED', 'User authentication required');
  }

  try {
    const sharingService = new SearchSharingService(req.app.locals.db);
    const shares = await sharingService.shareSearch(id, req.body, userId);

    console.log(`🔗 Search shared: ${id} by user ${userId}`);

    res.success({
      shares,
      message: 'Search shared successfully'
    });

  } catch (error) {
    console.error('❌ Failed to share search:', error);

    if (error instanceof Error && error.message.includes('permission')) {
      return res.status(403).error('ACCESS_DENIED', 'You do not have permission to share this search');
    }

    res.status(500).error(
      'SHARE_FAILED',
      'Failed to share search',
      { error_type: error?.constructor?.name || 'Unknown' }
    );
  }
}));

// ============================================================================
// VERSION HISTORY ROUTES
// ============================================================================

/**
 * GET /api/v1/saved-searches/:id/versions - Get version history
 */
router.get('/:id/versions', [
  standardRateLimit,
  validateRequest(UuidParamSchema, 'params')
], asyncHandler(async (req: AuthenticatedRequest, res: any) => {
  const userId = req.user.id;
  const { id } = req.params;

  if (!userId) {
    return res.status(401).error('UNAUTHORIZED', 'User authentication required');
  }

  try {
    const savedSearchService = new SavedSearchService(req.app.locals.db);
    const versions = await savedSearchService.getVersionHistory(id, userId);

    res.success({ versions });

  } catch (error) {
    console.error('❌ Failed to get version history:', error);

    if (error instanceof Error && error.message === 'Access denied') {
      return res.status(403).error('ACCESS_DENIED', 'You do not have permission to access this search');
    }

    res.status(500).error(
      'VERSIONS_FAILED',
      'Failed to retrieve version history',
      { error_type: error?.constructor?.name || 'Unknown' }
    );
  }
}));

/**
 * POST /api/v1/saved-searches/:id/restore/:versionId - Restore a version
 */
router.post('/:id/restore/:versionId', [
  standardRateLimit,
  validateRequest(z.object({ id: z.string().uuid(), versionId: z.string().uuid() }), 'params')
], asyncHandler(async (req: AuthenticatedRequest, res: any) => {
  const userId = req.user.id;
  const { id, versionId } = req.params;

  if (!userId) {
    return res.status(401).error('UNAUTHORIZED', 'User authentication required');
  }

  try {
    const savedSearchService = new SavedSearchService(req.app.locals.db);
    const restoredSearch = await savedSearchService.restoreVersion(id, versionId, userId);

    console.log(`⏪ Version restored: ${versionId} for search ${id} by user ${userId}`);

    res.success({
      search: restoredSearch,
      message: 'Version restored successfully'
    });

  } catch (error) {
    console.error('❌ Failed to restore version:', error);

    if (error instanceof Error && error.message === 'Access denied') {
      return res.status(403).error('ACCESS_DENIED', 'You do not have permission to modify this search');
    }

    if (error instanceof Error && error.message === 'Version not found') {
      return res.status(404).error('NOT_FOUND', 'Version not found');
    }

    res.status(500).error(
      'RESTORE_FAILED',
      'Failed to restore version',
      { error_type: error?.constructor?.name || 'Unknown' }
    );
  }
}));

// ============================================================================
// ANALYTICS ROUTES (parameterized)
// ============================================================================

/**
 * GET /api/v1/saved-searches/:id/analytics - Get search analytics
 */
router.get('/:id/analytics', [
  standardRateLimit,
  validateRequest(UuidParamSchema, 'params'),
  validateRequest(AnalyticsQuerySchema, 'query')
], asyncHandler(async (req: AuthenticatedRequest, res: any) => {
  const userId = req.user.id;
  const { id } = req.params;
  const { timeRange } = req.query as any;

  if (!userId) {
    return res.status(401).error('UNAUTHORIZED', 'User authentication required');
  }

  try {
    const analyticsService = new SearchAnalyticsService(req.app.locals.db);
    const analytics = await analyticsService.getSearchAnalytics(id, timeRange);

    res.success({
      analytics,
      search_id: id,
      generated_at: new Date().toISOString(),
      time_range: timeRange
    });

  } catch (error) {
    console.error('❌ Failed to get search analytics:', error);
    res.status(500).error(
      'ANALYTICS_FAILED',
      'Failed to retrieve search analytics',
      { error_type: error?.constructor?.name || 'Unknown' }
    );
  }
}));

/**
 * POST /api/v1/saved-searches/:id/track - Track usage event
 */
router.post('/:id/track', [
  standardRateLimit,
  validateRequest(UuidParamSchema, 'params'),
  validateRequest(z.object({
    action: z.enum(['execute', 'view', 'edit', 'share', 'favorite', 'schedule', 'delete']),
    metadata: z.record(z.any()).optional()
  }), 'body')
], asyncHandler(async (req: AuthenticatedRequest, res: any) => {
  const userId = req.user.id;
  const { id } = req.params;
  const { action, metadata = {} } = req.body;

  try {
    const analyticsService = new SearchAnalyticsService(req.app.locals.db);
    await analyticsService.trackSearchUsage(id, userId, action, metadata);

    res.success({ message: 'Usage tracked successfully' });

  } catch (error) {
    console.error('❌ Failed to track usage:', error);
    // Don't fail the request for tracking errors
    res.success({ message: 'Usage tracking failed but request completed' });
  }
}));

export default router;
