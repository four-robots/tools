/**
 * Memory API Routes
 * 
 * REST API endpoints for Memory graph management.
 */

import { Router } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { asyncHandler } from '../middleware/errorHandler.js';
import { MemoryService } from '@mcp-tools/core/memory';

const router = Router();

// Validation middleware
const validateRequest = (req: any, res: any, next: any) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.error('VALIDATION_ERROR', 'Request validation failed', errors.array(), 400);
  }
  next();
};

// GET /api/memory/memories - List memories
router.get('/memories', [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('user_id').optional().isString(),
  query('project_name').optional().isString(),
  query('concepts').optional().isArray(),
  query('importance').optional().isInt({ min: 1, max: 5 }),
  query('created_after').optional().isISO8601(),
  query('created_before').optional().isISO8601(),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  const memoryService: MemoryService = req.app.locals.memoryService;
  
  // Apply pagination after retrieval
  const page = req.query.page || 1;
  const limit = req.query.limit || 20;

  const memories = await memoryService.retrieveMemory({
    userId: req.query.user_id || req.user?.id,
    projectName: req.query.project_name,
    concepts: req.query.concepts ? [].concat(req.query.concepts) : undefined,
    importance: req.query.importance,
    createdAfter: req.query.created_after,
    createdBefore: req.query.created_before
  });

  const startIdx = (page - 1) * limit;
  const endIdx = startIdx + limit;
  const paginatedMemories = memories.slice(startIdx, endIdx);
  
  res.paginated(paginatedMemories, {
    page,
    limit,
    total: memories.length,
    hasNext: endIdx < memories.length,
    hasPrev: page > 1
  });
}));

// POST /api/memory/memories - Store memory
router.post('/memories', [
  body('content').notEmpty().isString(),
  body('context').isObject(),
  body('concepts').optional().isArray(),
  body('importance').optional().isInt({ min: 1, max: 5 }),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  const memoryService: MemoryService = req.app.locals.memoryService;
  
  try {
    const memory = await memoryService.storeMemory({
      content: req.body.content,
      context: {
        ...req.body.context,
        userId: req.user?.id,
        timestamp: new Date().toISOString()
      },
      concepts: req.body.concepts,
      importance: req.body.importance || 1
    });
    
    res.status(201).success(memory);
  } catch (error: any) {
    return res.error('STORE_ERROR', 'Failed to store memory', error instanceof Error ? error.message : String(error));
  }
}));

// GET /api/memory/memories/search - Semantic search
router.get('/memories/search', [
  query('q').notEmpty().isString(),
  query('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
  query('similarity_threshold').optional().isFloat({ min: 0, max: 1 }),
  query('include_related').optional().isBoolean().toBoolean(),
  query('max_depth').optional().isInt({ min: 1, max: 5 }),
  query('user_id').optional().isString(),
  query('project_name').optional().isString(),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  const memoryService: MemoryService = req.app.locals.memoryService;
  
  try {
    const startTime = Date.now();
    const searchResults = await memoryService.searchMemories({
      query: req.query.q,
      limit: req.query.limit || 10,
      similarityThreshold: req.query.similarity_threshold || 0.7,
      includeRelated: req.query.include_related || false,
      maxDepth: req.query.max_depth || 2,
      userId: req.query.user_id || req.user?.id,
      projectName: req.query.project_name
    });
    
    const processingTime = Date.now() - startTime;
    
    res.success({
      memories: searchResults.memories,
      total: searchResults.memories.length,
      processing_time_ms: processingTime,
      related_concepts: searchResults.relatedConcepts || []
    });
  } catch (error: any) {
    return res.error('SEARCH_ERROR', 'Failed to search memories', error instanceof Error ? error.message : String(error));
  }
}));

// GET /api/memory/memories/:id/related - Get related memories
router.get('/memories/:id/related', [
  param('id').notEmpty(),
  query('max_depth').optional().isInt({ min: 1, max: 5 }),
  query('min_strength').optional().isFloat({ min: 0, max: 1 }),
  query('relationship_types').optional().isArray(),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  const memoryService: MemoryService = req.app.locals.memoryService;
  
  try {
    const memoryId = req.params.id.replace('mem_', '');
    const relatedData = await memoryService.getRelatedMemories({
      memoryId,
      maxDepth: req.query.max_depth || 2,
      minStrength: req.query.min_strength || 0.5,
      relationshipTypes: req.query.relationship_types ? [].concat(req.query.relationship_types) : undefined
    });
    
    if (!relatedData) {
      return res.status(404).error('NOT_FOUND', 'Memory not found');
    }
    
    res.success(relatedData);
  } catch (error) {
    return res.status(404).error('NOT_FOUND', 'Memory not found');
  }
}));

// GET /api/memory/graph - Get memory graph data
router.get('/graph', [
  query('user_id').optional().isString(),
  query('project_name').optional().isString(),
  query('concept').optional().isString(),
  query('depth').optional().isInt({ min: 1, max: 5 }),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  const memoryService: MemoryService = req.app.locals.memoryService;
  
  // This would be a custom endpoint that aggregates data from multiple service calls
  // For now, return empty graph
  res.success({
    nodes: [],
    edges: []
  });
}));

// POST /api/memory/connections - Create memory connection
router.post('/connections', [
  body('source_id').notEmpty(),
  body('target_id').notEmpty(),
  body('relationship_type').isIn(['semantic_similarity', 'causal', 'temporal', 'conceptual', 'custom']),
  body('strength').optional().isFloat({ min: 0, max: 1 }),
  body('metadata').optional().isObject(),
  body('bidirectional').optional().isBoolean(),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  const memoryService: MemoryService = req.app.locals.memoryService;
  
  try {
    const connection = await memoryService.createConnection({
      sourceId: req.body.source_id.replace('mem_', ''),
      targetId: req.body.target_id.replace('mem_', ''),
      relationshipType: req.body.relationship_type,
      strength: req.body.strength || 1.0,
      metadata: req.body.metadata || {},
      bidirectional: req.body.bidirectional || false
    });
    
    res.status(201).success(connection);
  } catch (error: any) {
    return res.error('CONNECTION_ERROR', 'Failed to create connection', error instanceof Error ? error.message : String(error));
  }
}));

// GET /api/memory/stats - Get memory statistics
router.get('/stats', [
  query('user_id').optional().isString(),
  query('project_name').optional().isString(),
  query('date_range').optional().isIn(['7d', '30d', '90d', '1y']),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  const memoryService: MemoryService = req.app.locals.memoryService;
  
  try {
    const stats = await memoryService.getMemoryStats({
      userId: req.query.user_id || req.user?.id,
      projectName: req.query.project_name,
      dateRange: req.query.date_range
    });
    
    res.success(stats);
  } catch (error: any) {
    return res.error('STATS_ERROR', 'Failed to get memory statistics', error instanceof Error ? error.message : String(error));
  }
}));

export default router;