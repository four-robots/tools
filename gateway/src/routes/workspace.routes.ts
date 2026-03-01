/**
 * Workspace API Routes
 * 
 * REST API endpoints for collaborative workspace management.
 */

import { Router } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { asyncHandler } from '../middleware/errorHandler.js';
import { authMiddleware } from '../middleware/auth.js';
import { 
  WorkspaceService,
  WorkspaceMembershipService,
  WorkspaceSessionService,
  WorkspaceActivityService,
  WorkspaceTemplateService,
  WorkspaceIntegrationService,
} from '@mcp-tools/core/services/workspace';
import { 
  CreateWorkspaceRequest,
  UpdateWorkspaceRequest,
  InviteMemberRequest,
  UpdateMemberRequest,
  CreateTemplateRequest,
  CreateIntegrationRequest,
  BulkMemberOperation,
  BulkResourceOperation,
  WorkspaceExportOptions,
} from '@shared/types/workspace.js';

const router = Router();

// Apply authentication middleware to all routes
router.use(authMiddleware);

// Validation middleware
const validateRequest = (req: any, res: any, next: any) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.error('VALIDATION_ERROR', 'Request validation failed', errors.array(), 400);
  }
  next();
};

// Helper to get user context from request
const getUserContext = (req: any) => {
  return {
    userId: req.user.id,
    tenantId: req.user.tenantId || req.headers['x-tenant-id'] || 'default-tenant',
  };
};

// Input sanitization helper - strips HTML tags and trims
const sanitizeInput = (input: string): string => {
  if (!input || typeof input !== 'string') return '';
  return input.replace(/<[^>]*>/g, '').trim();
};

// UUID validation helper
const isValidUUID = (value: string): boolean => {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
};

// ==================== WORKSPACE MANAGEMENT ====================

// GET /api/workspace - List user's workspaces
router.get('/', [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('status').optional().isIn(['active', 'inactive', 'archived', 'suspended']),
  query('visibility').optional().isIn(['private', 'internal', 'public']),
  query('search').optional().isString().trim(),
  query('sort_by').optional().isIn(['name', 'createdAt', 'updatedAt', 'memberCount', 'activityCount']),
  query('sort_order').optional().isIn(['asc', 'desc']),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  try {
    const workspaceService: WorkspaceService = req.app.locals.workspaceService;
    const { userId, tenantId } = getUserContext(req);
    
    if (!workspaceService) {
      throw new Error('Workspace service not available');
    }
    
    const filters = {
      status: req.query.status ? [req.query.status] : undefined,
      visibility: req.query.visibility ? [req.query.visibility] : undefined,
      search: req.query.search ? sanitizeInput(req.query.search) : undefined,
    };

    const sort = {
      field: req.query.sort_by || 'createdAt',
      direction: req.query.sort_order || 'desc',
    };

    const page = req.query.page || 1;
    const limit = req.query.limit || 20;
    const offset = (page - 1) * limit;

    const result = await workspaceService.getWorkspacesWithStats(
      userId, tenantId, filters, sort, limit, offset
    );

    res.status(200).json({
      success: true,
      data: result.items,
      pagination: {
        page,
        limit,
        total: result.total,
        hasNext: result.hasMore,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    console.error('Failed to list workspaces:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to list workspaces'
    });
  }
}));

// POST /api/workspace - Create new workspace
router.post('/', [
  body('name').notEmpty().isLength({ min: 1, max: 255 }),
  body('description').optional().isString().isLength({ max: 2000 }),
  body('templateId').optional().isUUID(),
  body('visibility').optional().isIn(['private', 'internal', 'public']),
  body('settings').optional().isObject(),
  body('metadata').optional().isObject(),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  try {
    const workspaceService: WorkspaceService = req.app.locals.workspaceService;
    const { userId, tenantId } = getUserContext(req);
    
    if (!workspaceService) {
      throw new Error('Workspace service not available');
    }

    // Sanitize and validate input
    const request: CreateWorkspaceRequest = {
      name: sanitizeInput(req.body.name),
      description: req.body.description ? sanitizeInput(req.body.description) : undefined,
      templateId: req.body.templateId && isValidUUID(req.body.templateId) ? req.body.templateId : undefined,
      visibility: req.body.visibility || 'private',
      settings: req.body.settings && typeof req.body.settings === 'object' ? req.body.settings : undefined,
      metadata: req.body.metadata && typeof req.body.metadata === 'object' ? req.body.metadata : undefined,
    };

    const workspace = await workspaceService.createWorkspace(tenantId, userId, request);
    
    res.status(201).json({
      success: true,
      data: workspace
    });
  } catch (error) {
    console.error('Failed to create workspace:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create workspace'
    });
  }
}));

// GET /api/workspace/:id - Get workspace by ID
router.get('/:id', [
  param('id').notEmpty().isUUID(),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  const workspaceService: WorkspaceService = req.app.locals.workspaceService;
  const { userId, tenantId } = getUserContext(req);

  const workspace = await workspaceService.getWorkspace(req.params.id, userId, tenantId);
  
  if (!workspace) {
    return res.status(404).error('WORKSPACE_NOT_FOUND', 'Workspace not found');
  }

  res.success(workspace);
}));

// PUT /api/workspace/:id - Update workspace
router.put('/:id', [
  param('id').notEmpty().isUUID(),
  body('name').optional().isLength({ min: 1, max: 255 }),
  body('description').optional().isString().isLength({ max: 2000 }),
  body('visibility').optional().isIn(['private', 'internal', 'public']),
  body('settings').optional().isObject(),
  body('metadata').optional().isObject(),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  const workspaceService: WorkspaceService = req.app.locals.workspaceService;
  const { userId, tenantId } = getUserContext(req);

  const request: UpdateWorkspaceRequest = {
    name: req.body.name,
    description: req.body.description,
    visibility: req.body.visibility,
    settings: req.body.settings,
    metadata: req.body.metadata,
  };

  const workspace = await workspaceService.updateWorkspace(
    req.params.id, userId, tenantId, request
  );

  res.success(workspace);
}));

// DELETE /api/workspace/:id - Delete workspace
router.delete('/:id', [
  param('id').notEmpty().isUUID(),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  const workspaceService: WorkspaceService = req.app.locals.workspaceService;
  const { userId, tenantId } = getUserContext(req);

  await workspaceService.deleteWorkspace(req.params.id, userId, tenantId);

  res.status(204).send();
}));

// ==================== MEMBER MANAGEMENT ====================

// GET /api/workspace/:id/members - Get workspace members
router.get('/:id/members', [
  param('id').notEmpty().isUUID(),
  query('role').optional().isIn(['owner', 'admin', 'member', 'viewer']),
  query('status').optional().isIn(['active', 'inactive', 'pending', 'suspended']),
  query('search').optional().isString().trim(),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  const membershipService: WorkspaceMembershipService = req.app.locals.workspaceMembershipService;
  const { userId, tenantId } = getUserContext(req);

  const page = req.query.page || 1;
  const limit = req.query.limit || 20;
  const offset = (page - 1) * limit;

  const result = await membershipService.getMembers(
    req.params.id, userId, tenantId,
    req.query.role, req.query.status, req.query.search,
    limit, offset
  );

  res.paginated(result.items, {
    page,
    limit,
    total: result.total,
    hasNext: result.hasMore,
    hasPrev: page > 1
  });
}));

// POST /api/workspace/:id/members - Invite member
router.post('/:id/members', [
  param('id').notEmpty().isUUID(),
  body('userId').optional().isUUID(),
  body('email').optional().isEmail(),
  body('role').isIn(['admin', 'member', 'viewer']),
  body('permissions').optional().isObject(),
  body('message').optional().isString().isLength({ max: 500 }),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  const membershipService: WorkspaceMembershipService = req.app.locals.workspaceMembershipService;
  const { userId, tenantId } = getUserContext(req);

  if (!req.body.userId && !req.body.email) {
    return res.status(400).error('VALIDATION_ERROR', 'Either userId or email must be provided');
  }

  const request: InviteMemberRequest = {
    userId: req.body.userId,
    email: req.body.email,
    role: req.body.role,
    permissions: req.body.permissions,
    message: req.body.message,
  };

  const member = await membershipService.inviteMember(
    req.params.id, userId, tenantId, request
  );

  res.status(201).success(member);
}));

// PUT /api/workspace/:id/members/:userId - Update member
router.put('/:id/members/:userId', [
  param('id').notEmpty().isUUID(),
  param('userId').notEmpty().isUUID(),
  body('role').optional().isIn(['owner', 'admin', 'member', 'viewer']),
  body('permissions').optional().isObject(),
  body('status').optional().isIn(['active', 'inactive', 'suspended']),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  const membershipService: WorkspaceMembershipService = req.app.locals.workspaceMembershipService;
  const { userId, tenantId } = getUserContext(req);

  const request: UpdateMemberRequest = {
    role: req.body.role,
    permissions: req.body.permissions,
    status: req.body.status,
  };

  const member = await membershipService.updateMember(
    req.params.id, req.params.userId, userId, tenantId, request
  );

  res.success(member);
}));

// DELETE /api/workspace/:id/members/:userId - Remove member
router.delete('/:id/members/:userId', [
  param('id').notEmpty().isUUID(),
  param('userId').notEmpty().isUUID(),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  const membershipService: WorkspaceMembershipService = req.app.locals.workspaceMembershipService;
  const { userId, tenantId } = getUserContext(req);

  await membershipService.removeMember(
    req.params.id, req.params.userId, userId, tenantId
  );

  res.status(204).send();
}));

// POST /api/workspace/:id/members/bulk - Bulk member operations
router.post('/:id/members/bulk', [
  param('id').notEmpty().isUUID(),
  body('operation').isIn(['invite', 'remove', 'update_role', 'update_permissions']),
  body('memberIds').optional().isArray(),
  body('emails').optional().isArray(),
  body('role').optional().isIn(['owner', 'admin', 'member', 'viewer']),
  body('permissions').optional().isObject(),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  const membershipService: WorkspaceMembershipService = req.app.locals.workspaceMembershipService;
  const { userId, tenantId } = getUserContext(req);

  const operation: BulkMemberOperation = {
    operation: req.body.operation,
    memberIds: req.body.memberIds,
    emails: req.body.emails,
    role: req.body.role,
    permissions: req.body.permissions,
  };

  const result = await membershipService.bulkMemberOperation(
    req.params.id, userId, tenantId, operation
  );

  res.success(result);
}));

// POST /api/workspace/:id/accept-invitation - Accept workspace invitation
router.post('/:id/accept-invitation', [
  param('id').notEmpty().isUUID(),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  const membershipService: WorkspaceMembershipService = req.app.locals.workspaceMembershipService;
  const { userId, tenantId } = getUserContext(req);

  const member = await membershipService.acceptInvitation(req.params.id, userId, tenantId);

  res.success(member);
}));

// POST /api/workspace/:id/decline-invitation - Decline workspace invitation
router.post('/:id/decline-invitation', [
  param('id').notEmpty().isUUID(),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  const membershipService: WorkspaceMembershipService = req.app.locals.workspaceMembershipService;
  const { userId, tenantId } = getUserContext(req);

  await membershipService.declineInvitation(req.params.id, userId, tenantId);

  res.status(204).send();
}));

// GET /api/workspace/:id/members/:userId/activity - Get member activity
router.get('/:id/members/:userId/activity', [
  param('id').notEmpty().isUUID(),
  param('userId').notEmpty().isUUID(),
  query('days').optional().isInt({ min: 1, max: 365 }).toInt(),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  const membershipService: WorkspaceMembershipService = req.app.locals.workspaceMembershipService;
  const { userId, tenantId } = getUserContext(req);

  const activity = await membershipService.getMemberActivity(
    req.params.id, req.params.userId, userId, tenantId, req.query.days || 30
  );

  res.success(activity);
}));

// ==================== SESSION MANAGEMENT ====================

// POST /api/workspace/:id/sessions - Start workspace session
router.post('/:id/sessions', [
  param('id').notEmpty().isUUID(),
  body('connectionId').optional().isString(),
  body('clientInfo').optional().isObject(),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  const sessionService: WorkspaceSessionService = req.app.locals.workspaceSessionService;
  const { userId, tenantId } = getUserContext(req);

  const session = await sessionService.startSession(
    req.params.id, userId, tenantId, req.body.connectionId, req.body.clientInfo
  );

  res.status(201).success(session);
}));

// GET /api/workspace/:id/sessions - Get active sessions
router.get('/:id/sessions', [
  param('id').notEmpty().isUUID(),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  const sessionService: WorkspaceSessionService = req.app.locals.workspaceSessionService;
  const { userId, tenantId } = getUserContext(req);

  const sessions = await sessionService.getActiveSessions(req.params.id, userId, tenantId);

  res.success(sessions);
}));

// PUT /api/workspace/:id/sessions/:sessionId/end - End session
router.put('/:id/sessions/:sessionId/end', [
  param('id').notEmpty().isUUID(),
  param('sessionId').notEmpty().isUUID(),
  body('reason').optional().isString(),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  const sessionService: WorkspaceSessionService = req.app.locals.workspaceSessionService;
  const { userId } = getUserContext(req);

  await sessionService.endSession(req.params.sessionId, userId, req.body.reason);

  res.status(204).send();
}));

// PUT /api/workspace/sessions/activity - Update session activity
router.put('/sessions/activity', [
  body('sessionToken').notEmpty().isString(),
  body('activeTool').optional().isString(),
  body('activeResource').optional().isString(),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  const sessionService: WorkspaceSessionService = req.app.locals.workspaceSessionService;

  await sessionService.updateSessionActivity(
    req.body.sessionToken, req.body.activeTool, req.body.activeResource
  );

  res.status(204).send();
}));

// PUT /api/workspace/sessions/presence - Update user presence
router.put('/sessions/presence', [
  body('sessionToken').notEmpty().isString(),
  body('presenceData').isObject(),
  body('cursorPosition').optional().isObject(),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  const sessionService: WorkspaceSessionService = req.app.locals.workspaceSessionService;

  await sessionService.updatePresence(
    req.body.sessionToken, req.body.presenceData, req.body.cursorPosition
  );

  res.status(204).send();
}));

// GET /api/workspace/:id/sessions/stats - Get session statistics
router.get('/:id/sessions/stats', [
  param('id').notEmpty().isUUID(),
  query('days').optional().isInt({ min: 1, max: 90 }).toInt(),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  const sessionService: WorkspaceSessionService = req.app.locals.workspaceSessionService;
  const { userId, tenantId } = getUserContext(req);

  const stats = await sessionService.getSessionStatistics(
    req.params.id, userId, tenantId, req.query.days || 7
  );

  res.success(stats);
}));

// ==================== ACTIVITY TRACKING ====================

// GET /api/workspace/:id/activity - Get workspace activity feed
router.get('/:id/activity', [
  param('id').notEmpty().isUUID(),
  query('actions').optional().isString(),
  query('resourceTypes').optional().isString(),
  query('userIds').optional().isString(),
  query('startDate').optional().isISO8601(),
  query('endDate').optional().isISO8601(),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  const activityService: WorkspaceActivityService = req.app.locals.workspaceActivityService;
  const { userId, tenantId } = getUserContext(req);

  const page = req.query.page || 1;
  const limit = req.query.limit || 50;
  const offset = (page - 1) * limit;

  const actions = req.query.actions ? req.query.actions.split(',') : undefined;
  const resourceTypes = req.query.resourceTypes ? req.query.resourceTypes.split(',') : undefined;
  const userIds = req.query.userIds ? req.query.userIds.split(',') : undefined;

  const result = await activityService.getActivityFeed(
    req.params.id, userId, tenantId,
    actions, resourceTypes, userIds,
    req.query.startDate, req.query.endDate,
    limit, offset
  );

  res.paginated(result.items, {
    page,
    limit,
    total: result.total,
    hasNext: result.hasMore,
    hasPrev: page > 1
  });
}));

// GET /api/workspace/:id/activity/stats - Get activity statistics
router.get('/:id/activity/stats', [
  param('id').notEmpty().isUUID(),
  query('days').optional().isInt({ min: 1, max: 365 }).toInt(),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  const activityService: WorkspaceActivityService = req.app.locals.workspaceActivityService;
  const { userId, tenantId } = getUserContext(req);

  const stats = await activityService.getActivityStatistics(
    req.params.id, userId, tenantId, req.query.days || 30
  );

  res.success(stats);
}));

// GET /api/workspace/:id/activity/export - Export activity log
router.get('/:id/activity/export', [
  param('id').notEmpty().isUUID(),
  query('startDate').optional().isISO8601(),
  query('endDate').optional().isISO8601(),
  query('actions').optional().isString(),
  query('format').optional().isIn(['json', 'csv']),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  const activityService: WorkspaceActivityService = req.app.locals.workspaceActivityService;
  const { userId, tenantId } = getUserContext(req);

  const actions = req.query.actions ? req.query.actions.split(',') : undefined;

  const exportData = await activityService.exportActivityLog(
    req.params.id, userId, tenantId,
    req.query.startDate, req.query.endDate,
    actions, req.query.format || 'json'
  );

  if (req.query.format === 'csv') {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="workspace-activity-${req.params.id}.csv"`);
    res.send(exportData);
  } else {
    res.success(exportData);
  }
}));

// ==================== ANALYTICS ====================

// GET /api/workspace/:id/analytics - Get workspace analytics
router.get('/:id/analytics', [
  param('id').notEmpty().isUUID(),
  query('startDate').isISO8601(),
  query('endDate').isISO8601(),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  const workspaceService: WorkspaceService = req.app.locals.workspaceService;
  const { userId, tenantId } = getUserContext(req);

  const analytics = await workspaceService.getWorkspaceAnalytics(
    req.params.id, userId, tenantId, req.query.startDate, req.query.endDate
  );

  res.success(analytics);
}));

// GET /api/workspace/:id/export - Export workspace data
router.get('/:id/export', [
  param('id').notEmpty().isUUID(),
  query('includeMembers').optional().isBoolean().toBoolean(),
  query('includeActivity').optional().isBoolean().toBoolean(),
  query('includeResources').optional().isBoolean().toBoolean(),
  query('includeSettings').optional().isBoolean().toBoolean(),
  query('includeIntegrations').optional().isBoolean().toBoolean(),
  query('startDate').optional().isISO8601(),
  query('endDate').optional().isISO8601(),
  query('format').optional().isIn(['json', 'csv', 'excel']),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  const workspaceService: WorkspaceService = req.app.locals.workspaceService;
  const { userId, tenantId } = getUserContext(req);

  const options: WorkspaceExportOptions = {
    includeMembers: req.query.includeMembers ?? true,
    includeActivity: req.query.includeActivity ?? false,
    includeResources: req.query.includeResources ?? true,
    includeSettings: req.query.includeSettings ?? true,
    includeIntegrations: req.query.includeIntegrations ?? false,
    dateRange: req.query.startDate && req.query.endDate ? {
      start: req.query.startDate,
      end: req.query.endDate,
    } : undefined,
    format: req.query.format || 'json',
  };

  const exportData = await workspaceService.exportWorkspace(
    req.params.id, userId, tenantId, options
  );

  res.success(exportData);
}));

// ==================== TEMPLATES ====================

// GET /api/workspace/templates - Search workspace templates
router.get('/templates', [
  query('category').optional().isString(),
  query('tags').optional().isString(),
  query('search').optional().isString().trim(),
  query('includePrivate').optional().isBoolean().toBoolean(),
  query('sortBy').optional().isIn(['name', 'created_at', 'usage_count', 'rating']),
  query('sortOrder').optional().isIn(['asc', 'desc']),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  const templateService: WorkspaceTemplateService = req.app.locals.workspaceTemplateService;
  const { userId } = getUserContext(req);

  const page = req.query.page || 1;
  const limit = req.query.limit || 20;
  const offset = (page - 1) * limit;

  const tags = req.query.tags ? req.query.tags.split(',') : undefined;

  const result = await templateService.searchTemplates(
    userId, req.query.category, tags, req.query.search,
    req.query.includePrivate || false,
    req.query.sortBy || 'usage_count',
    req.query.sortOrder || 'desc',
    limit, offset
  );

  res.paginated(result.items, {
    page,
    limit,
    total: result.total,
    hasNext: result.hasMore,
    hasPrev: page > 1
  });
}));

// POST /api/workspace/templates - Create template
router.post('/templates', [
  body('name').notEmpty().isLength({ min: 1, max: 255 }),
  body('description').optional().isString().isLength({ max: 2000 }),
  body('category').notEmpty().isString(),
  body('templateData').isObject(),
  body('defaultSettings').optional().isObject(),
  body('requiredTools').optional().isArray(),
  body('isPublic').optional().isBoolean(),
  body('tags').optional().isArray(),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  const templateService: WorkspaceTemplateService = req.app.locals.workspaceTemplateService;
  const { userId, tenantId } = getUserContext(req);

  const request: CreateTemplateRequest = {
    name: req.body.name,
    description: req.body.description,
    category: req.body.category,
    templateData: req.body.templateData,
    defaultSettings: req.body.defaultSettings,
    requiredTools: req.body.requiredTools,
    isPublic: req.body.isPublic,
    tags: req.body.tags,
  };

  const template = await templateService.createTemplate(userId, tenantId, request);

  res.status(201).success(template);
}));

// GET /api/workspace/templates/categories - Get template categories
// NOTE: Must be registered before /templates/:id to avoid matching 'categories' as :id
router.get('/templates/categories', asyncHandler(async (req: any, res: any) => {
  const templateService: WorkspaceTemplateService = req.app.locals.workspaceTemplateService;

  const categories = await templateService.getCategories();

  res.success(categories);
}));

// GET /api/workspace/templates/tags - Get popular template tags
// NOTE: Must be registered before /templates/:id to avoid matching 'tags' as :id
router.get('/templates/tags', [
  query('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  const templateService: WorkspaceTemplateService = req.app.locals.workspaceTemplateService;

  const tags = await templateService.getPopularTags(req.query.limit || 20);

  res.success(tags);
}));

// GET /api/workspace/templates/:id - Get template by ID
router.get('/templates/:id', [
  param('id').notEmpty().isUUID(),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  const templateService: WorkspaceTemplateService = req.app.locals.workspaceTemplateService;
  const { userId } = getUserContext(req);

  const template = await templateService.getTemplate(req.params.id, userId);

  if (!template) {
    return res.status(404).error('TEMPLATE_NOT_FOUND', 'Template not found');
  }

  res.success(template);
}));

// PUT /api/workspace/templates/:id - Update template
router.put('/templates/:id', [
  param('id').notEmpty().isUUID(),
  body('name').optional().isLength({ min: 1, max: 255 }),
  body('description').optional().isString().isLength({ max: 2000 }),
  body('category').optional().isString(),
  body('templateData').optional().isObject(),
  body('defaultSettings').optional().isObject(),
  body('requiredTools').optional().isArray(),
  body('isPublic').optional().isBoolean(),
  body('tags').optional().isArray(),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  const templateService: WorkspaceTemplateService = req.app.locals.workspaceTemplateService;
  const { userId } = getUserContext(req);

  const template = await templateService.updateTemplate(req.params.id, userId, req.body);

  res.success(template);
}));

// DELETE /api/workspace/templates/:id - Delete template
router.delete('/templates/:id', [
  param('id').notEmpty().isUUID(),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  const templateService: WorkspaceTemplateService = req.app.locals.workspaceTemplateService;
  const { userId } = getUserContext(req);

  await templateService.deleteTemplate(req.params.id, userId);

  res.status(204).send();
}));

// POST /api/workspace/templates/:id/clone - Clone template
router.post('/templates/:id/clone', [
  param('id').notEmpty().isUUID(),
  body('name').optional().isLength({ min: 1, max: 255 }),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  const templateService: WorkspaceTemplateService = req.app.locals.workspaceTemplateService;
  const { userId } = getUserContext(req);

  const clonedTemplate = await templateService.cloneTemplate(
    req.params.id, userId, req.body.name
  );

  res.status(201).success(clonedTemplate);
}));

// POST /api/workspace/templates/:id/rate - Rate template
router.post('/templates/:id/rate', [
  param('id').notEmpty().isUUID(),
  body('rating').isInt({ min: 1, max: 5 }),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  const templateService: WorkspaceTemplateService = req.app.locals.workspaceTemplateService;
  const { userId } = getUserContext(req);

  await templateService.rateTemplate(req.params.id, userId, req.body.rating);

  res.status(204).send();
}));

// ==================== INTEGRATIONS ====================

// GET /api/workspace/:id/integrations - Get workspace integrations
router.get('/:id/integrations', [
  param('id').notEmpty().isUUID(),
  query('type').optional().isIn(['kanban', 'wiki', 'memory', 'github', 'jira', 'slack', 'discord', 'teams', 'external']),
  query('status').optional().isIn(['active', 'inactive', 'error', 'configuring']),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  const integrationService: WorkspaceIntegrationService = req.app.locals.workspaceIntegrationService;
  const { userId, tenantId } = getUserContext(req);

  const integrations = await integrationService.getWorkspaceIntegrations(
    req.params.id, userId, tenantId, req.query.type, req.query.status
  );

  res.success(integrations);
}));

// POST /api/workspace/:id/integrations - Create integration
router.post('/:id/integrations', [
  param('id').notEmpty().isUUID(),
  body('integrationType').isIn(['kanban', 'wiki', 'memory', 'github', 'jira', 'slack', 'discord', 'teams', 'external']),
  body('externalId').optional().isString(),
  body('configuration').isObject(),
  body('credentials').optional().isObject(),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  const integrationService: WorkspaceIntegrationService = req.app.locals.workspaceIntegrationService;
  const { userId, tenantId } = getUserContext(req);

  const request: CreateIntegrationRequest = {
    integrationType: req.body.integrationType,
    externalId: req.body.externalId,
    configuration: req.body.configuration,
    credentials: req.body.credentials,
  };

  const integration = await integrationService.createIntegration(
    req.params.id, userId, tenantId, request
  );

  res.status(201).success(integration);
}));

// PUT /api/workspace/:id/integrations/:integrationId - Update integration
router.put('/:id/integrations/:integrationId', [
  param('id').notEmpty().isUUID(),
  param('integrationId').notEmpty().isUUID(),
  body('externalId').optional().isString(),
  body('configuration').optional().isObject(),
  body('credentials').optional().isObject(),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  const integrationService: WorkspaceIntegrationService = req.app.locals.workspaceIntegrationService;
  const { userId, tenantId } = getUserContext(req);

  const integration = await integrationService.updateIntegration(
    req.params.integrationId, userId, tenantId, req.body
  );

  res.success(integration);
}));

// DELETE /api/workspace/:id/integrations/:integrationId - Delete integration
router.delete('/:id/integrations/:integrationId', [
  param('id').notEmpty().isUUID(),
  param('integrationId').notEmpty().isUUID(),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  const integrationService: WorkspaceIntegrationService = req.app.locals.workspaceIntegrationService;
  const { userId, tenantId } = getUserContext(req);

  await integrationService.deleteIntegration(req.params.integrationId, userId, tenantId);

  res.status(204).send();
}));

// POST /api/workspace/:id/integrations/:integrationId/test - Test integration
router.post('/:id/integrations/:integrationId/test', [
  param('id').notEmpty().isUUID(),
  param('integrationId').notEmpty().isUUID(),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  const integrationService: WorkspaceIntegrationService = req.app.locals.workspaceIntegrationService;
  const { userId, tenantId } = getUserContext(req);

  const result = await integrationService.testIntegration(
    req.params.integrationId, userId, tenantId
  );

  res.success(result);
}));

// POST /api/workspace/:id/integrations/:integrationId/sync - Sync integration
router.post('/:id/integrations/:integrationId/sync', [
  param('id').notEmpty().isUUID(),
  param('integrationId').notEmpty().isUUID(),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  const integrationService: WorkspaceIntegrationService = req.app.locals.workspaceIntegrationService;
  const { userId, tenantId } = getUserContext(req);

  const result = await integrationService.syncIntegration(
    req.params.integrationId, userId, tenantId
  );

  res.success(result);
}));

// GET /api/workspace/:id/integrations/:integrationId/health - Get integration health
router.get('/:id/integrations/:integrationId/health', [
  param('id').notEmpty().isUUID(),
  param('integrationId').notEmpty().isUUID(),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  const integrationService: WorkspaceIntegrationService = req.app.locals.workspaceIntegrationService;
  const { userId, tenantId } = getUserContext(req);

  const health = await integrationService.getIntegrationHealth(
    req.params.integrationId, userId, tenantId
  );

  res.success(health);
}));

// GET /api/workspace/integration-types - Get available integration types
router.get('/integration-types', asyncHandler(async (req: any, res: any) => {
  const integrationService: WorkspaceIntegrationService = req.app.locals.workspaceIntegrationService;

  const types = integrationService.getAvailableIntegrationTypes();

  res.success(types);
}));

export default router;