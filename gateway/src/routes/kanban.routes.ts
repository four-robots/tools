/**
 * Kanban API Routes
 *
 * REST API endpoints for Kanban board management.
 */

import { Router } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { asyncHandler } from '../middleware/errorHandler.js';
import { KanbanService } from '@mcp-tools/core/kanban';

const router = Router();

// Validation middleware
const validateRequest = (req: any, res: any, next: any) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.error('VALIDATION_ERROR', 'Request validation failed', errors.array(), 400);
  }
  next();
};

// GET /api/kanban/boards - List boards
router.get('/boards', [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('sort').optional().isIn(['name', 'created_at', 'updated_at']),
  query('order').optional().isIn(['asc', 'desc']),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  const kanbanService: KanbanService = req.app.locals.kanbanService;

  const boards = await kanbanService.getAllBoards();

  // Apply pagination
  const page = req.query.page || 1;
  const limit = req.query.limit || 20;
  const startIdx = (page - 1) * limit;
  const endIdx = startIdx + limit;
  const paginatedBoards = boards.slice(startIdx, endIdx);

  res.paginated(paginatedBoards, {
    page,
    limit,
    total: boards.length,
    hasNext: endIdx < boards.length,
    hasPrev: page > 1
  });
}));

// POST /api/kanban/boards - Create board
router.post('/boards', [
  body('name').notEmpty().isLength({ min: 1, max: 255 }),
  body('slug').optional().isLength({ min: 1, max: 255 }),
  body('description').optional().isString(),
  body('color').optional().matches(/^#[0-9A-Fa-f]{6}$/),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  const kanbanService: KanbanService = req.app.locals.kanbanService;

  const board = await kanbanService.createBoard({
    name: req.body.name,
    slug: req.body.slug,
    description: req.body.description,
    color: req.body.color || '#6366f1'
  });

  res.status(201).success(board);
}));

// GET /api/kanban/boards/:id - Get board with columns and cards
router.get('/boards/:id', [
  param('id').notEmpty(),
  query('include_archived').optional().isBoolean().toBoolean(),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  const kanbanService: KanbanService = req.app.locals.kanbanService;

  try {
    const boardId = req.params.id;
    const board = await kanbanService.getBoardById(boardId);

    if (!board) {
      return res.status(404).error('NOT_FOUND', 'Board not found');
    }

    res.success(board);
  } catch (error) {
    return res.status(404).error('NOT_FOUND', 'Board not found');
  }
}));

// GET /api/kanban/boards/slug/:slug - Get board by slug with columns and cards
router.get('/boards/slug/:slug', [
  param('slug').notEmpty().isSlug(),
  query('include_archived').optional().isBoolean().toBoolean(),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  const kanbanService: KanbanService = req.app.locals.kanbanService;

  try {
    const board = await kanbanService.getBoardBySlug(req.params.slug);

    if (!board) {
      return res.status(404).error('NOT_FOUND', 'Board not found');
    }

    res.success(board);
  } catch (error) {
    return res.status(404).error('NOT_FOUND', 'Board not found');
  }
}));

// POST /api/kanban/cards - Create card
router.post('/cards', [
  body('board_id').notEmpty(),
  body('column_id').notEmpty(),
  body('title').notEmpty().isLength({ min: 1, max: 255 }),
  body('slug').optional().isLength({ min: 1, max: 255 }),
  body('description').optional().isString(),
  body('priority').optional().isIn(['low', 'medium', 'high', 'urgent']),
  body('assigned_to').optional().isString(),
  body('tags').optional().isArray(),
  body('due_date').optional().isISO8601(),
  body('position').optional().isInt({ min: 0 }),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  const kanbanService: KanbanService = req.app.locals.kanbanService;

  try {
    const card = await kanbanService.createCard({
      board_id: req.body.board_id,
      column_id: req.body.column_id,
      title: req.body.title,
      slug: req.body.slug,
      description: req.body.description,
      priority: req.body.priority || 'medium',
      assigned_to: req.body.assigned_to,
      due_date: req.body.due_date,
      position: req.body.position || 0
    });

    res.status(201).success(card);
  } catch (error: any) {
    return res.error('CREATE_ERROR', 'Failed to create card', error instanceof Error ? error.message : String(error));
  }
}));

// PUT /api/kanban/cards/:id - Update card
router.put('/cards/:id', [
  param('id').notEmpty(),
  body('title').optional().isLength({ min: 1, max: 255 }),
  body('description').optional().isString(),
  body('priority').optional().isIn(['low', 'medium', 'high', 'urgent']),
  body('assigned_to').optional().isString(),
  body('tags').optional().isArray(),
  body('due_date').optional().isISO8601(),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  const kanbanService: KanbanService = req.app.locals.kanbanService;

  try {
    const cardId = req.params.id;

    const updatedCard = await kanbanService.updateCard(cardId, req.body);

    if (!updatedCard) {
      return res.status(404).error('NOT_FOUND', 'Card not found');
    }

    res.success(updatedCard);
  } catch (error) {
    return res.status(404).error('NOT_FOUND', 'Card not found');
  }
}));

// PUT /api/kanban/cards/:id/move - Move card
router.put('/cards/:id/move', [
  param('id').notEmpty(),
  body('column_id').notEmpty(),
  body('position').isInt({ min: 0 }),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  const kanbanService: KanbanService = req.app.locals.kanbanService;

  try {
    const cardId = req.params.id;

    const movedCard = await kanbanService.moveCard(cardId, {
      column_id: req.body.column_id,
      position: req.body.position
    });

    if (!movedCard) {
      return res.status(404).error('NOT_FOUND', 'Card not found');
    }

    res.success(movedCard);
  } catch (error) {
    return res.status(404).error('NOT_FOUND', 'Card not found');
  }
}));

// DELETE /api/kanban/cards/:id - Delete card
router.delete('/cards/:id', [
  param('id').notEmpty(),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  const kanbanService: KanbanService = req.app.locals.kanbanService;

  try {
    const cardId = req.params.id;

    await kanbanService.deleteCard(cardId);

    res.status(204).send();
  } catch (error: any) {
    if (error.code === 'NOT_FOUND') {
      return res.status(404).error('NOT_FOUND', 'Card not found');
    }
    throw error;
  }
}));

// GET /api/kanban/boards/slug/:boardSlug/cards/:cardSlug - Get card by slug
router.get('/boards/slug/:boardSlug/cards/:cardSlug', [
  param('boardSlug').notEmpty().isSlug(),
  param('cardSlug').notEmpty().isSlug(),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  const kanbanService: KanbanService = req.app.locals.kanbanService;

  try {
    const card = await kanbanService.getCardBySlug(req.params.boardSlug, req.params.cardSlug);

    if (!card) {
      return res.status(404).error('NOT_FOUND', 'Card not found');
    }

    res.success(card);
  } catch (error) {
    return res.status(404).error('NOT_FOUND', 'Card not found');
  }
}));

// GET /api/kanban/boards/:id/activity - Get board activity feed
router.get('/boards/:id/activity', [
  param('id').notEmpty(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  const kanbanService: KanbanService = req.app.locals.kanbanService;

  try {
    const boardId = req.params.id;
    const limit = req.query.limit || 50;

    const activity = await kanbanService.getBoardActivity(boardId, limit);

    res.success(activity);
  } catch (error) {
    return res.status(404).error('NOT_FOUND', 'Board not found');
  }
}));

// GET /api/kanban/analytics/status-distribution - Get status distribution metrics
router.get('/analytics/status-distribution', [
  query('board_id').optional().isString(),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  const kanbanService: KanbanService = req.app.locals.kanbanService;

  try {
    const stats = await kanbanService.getStats();

    res.success({
      cards_by_status: stats.cards_by_status,
      total_cards: stats.total_cards,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return res.error('INTERNAL_ERROR', 'Failed to get status distribution');
  }
}));

// GET /api/kanban/analytics/user-productivity - Get user productivity metrics
router.get('/analytics/user-productivity', [
  query('user_id').optional().isString(),
  query('timeframe').optional().isIn(['7d', '30d', '90d']),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  const kanbanService: KanbanService = req.app.locals.kanbanService;

  try {
    const userId = req.query.user_id;
    const timeframe = req.query.timeframe || '30d';

    const stats = await kanbanService.getUserActivityStats(userId, timeframe);

    res.success(stats);
  } catch (error) {
    return res.error('INTERNAL_ERROR', 'Failed to get user productivity stats');
  }
}));

// GET /api/kanban/analytics/overview - Get overall analytics overview
router.get('/analytics/overview', [
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  const kanbanService: KanbanService = req.app.locals.kanbanService;

  try {
    const stats = await kanbanService.getStats();

    res.success({
      ...stats,
      generated_at: new Date().toISOString()
    });
  } catch (error) {
    return res.error('INTERNAL_ERROR', 'Failed to get analytics overview');
  }
}));

export default router;
