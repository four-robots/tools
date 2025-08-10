import express from 'express';
import { 
  QueryBuilderService,
  FilterTemplate,
  FilterPreset,
  FilterTree,
  QueryValidation,
  SearchQuery,
  CreateFilterTemplateRequestSchema,
  ShareFilterRequestSchema,
  SaveFilterPresetRequestSchema,
  BuildQueryRequestSchema,
  FilterBuilderSchemas
} from '@mcp-tools/core';
import { createDatabaseConfig } from '@mcp-tools/core';
import { validateRequest } from '../middleware/validation.middleware.js';
import { auth } from '../middleware/auth.js';

// Extend Request type for user information
interface AuthenticatedRequest extends express.Request {
  user?: {
    id: string;
    email: string;
    name: string;
  };
}

const router = express.Router();

// Apply authentication middleware to all routes
router.use(auth);

// Initialize the query builder service
const dbConfig = createDatabaseConfig();
const queryBuilderService = new QueryBuilderService({ 
  database: dbConfig.connection,
  enableAnalytics: true,
  cacheQueries: true
});

/**
 * @swagger
 * /api/v1/filters/build:
 *   post:
 *     summary: Build query from filter tree
 *     description: Convert a filter tree into executable queries (SQL, Elasticsearch, MongoDB)
 *     tags: [Filter Builder]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               filterTree:
 *                 $ref: '#/components/schemas/FilterTree'
 *               targetFormat:
 *                 type: string
 *                 enum: [sql, elasticsearch, mongodb]
 *                 default: sql
 *               options:
 *                 type: object
 *                 properties:
 *                   optimize:
 *                     type: boolean
 *                     default: true
 *                   includeMetadata:
 *                     type: boolean
 *                     default: false
 *     responses:
 *       200:
 *         description: Generated search query
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SearchQuery'
 *       400:
 *         description: Invalid filter tree or request parameters
 */
router.post('/build', 
  validateRequest(BuildQueryRequestSchema),
  async (req, res, next) => {
    try {
      const buildRequest = req.body;
      const searchQuery = await queryBuilderService.buildQuery(buildRequest);
      
      res.json({
        success: true,
        data: searchQuery
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/v1/filters/validate:
 *   post:
 *     summary: Validate filter tree
 *     description: Validate a filter tree and get suggestions for optimization
 *     tags: [Filter Builder]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/FilterTree'
 *     responses:
 *       200:
 *         description: Validation results
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/QueryValidation'
 */
router.post('/validate',
  validateRequest(FilterBuilderSchemas.FilterTree),
  async (req, res, next) => {
    try {
      const filterTree: FilterTree = req.body;
      const validation = await queryBuilderService.validateQuery(filterTree);
      
      res.json({
        success: true,
        data: validation
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/v1/filters/optimize:
 *   post:
 *     summary: Optimize filter tree
 *     description: Optimize a filter tree for better performance
 *     tags: [Filter Builder]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/FilterTree'
 *     responses:
 *       200:
 *         description: Optimized filter tree
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/FilterTree'
 */
router.post('/optimize',
  validateRequest(FilterBuilderSchemas.FilterTree),
  async (req, res, next) => {
    try {
      const filterTree: FilterTree = req.body;
      const optimizedTree = await queryBuilderService.optimizeQuery(filterTree);
      
      res.json({
        success: true,
        data: optimizedTree
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/v1/filters/preview:
 *   post:
 *     summary: Preview filter results
 *     description: Execute filter and return preview of results without full execution
 *     tags: [Filter Builder]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               filterTree:
 *                 $ref: '#/components/schemas/FilterTree'
 *               limit:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 100
 *                 default: 10
 *     responses:
 *       200:
 *         description: Preview results
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 count:
 *                   type: integer
 *                 results:
 *                   type: array
 *                   items:
 *                     type: object
 */
router.post('/preview', async (req, res, next) => {
  try {
    const { filterTree, limit = 10 } = req.body;
    
    // Build and execute query for preview
    const searchQuery = await queryBuilderService.buildQuery({
      filterTree,
      targetFormat: 'sql',
      options: { optimize: true }
    });
    
    // For preview, we'd execute the query with LIMIT
    // This is a mock implementation
    const mockResults = {
      count: 42,
      results: Array.from({ length: Math.min(limit, 10) }, (_, i) => ({
        id: i + 1,
        title: `Sample Result ${i + 1}`,
        summary: 'This is a mock result for preview purposes'
      }))
    };
    
    res.json({
      success: true,
      data: mockResults
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// Filter Templates Endpoints
// ============================================================================

/**
 * @swagger
 * /api/v1/filters/templates:
 *   get:
 *     summary: List filter templates
 *     description: Get list of available filter templates (public and user's private)
 *     tags: [Filter Templates]
 *     parameters:
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Filter by category
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search templates by name/description/tags
 *       - in: query
 *         name: public
 *         schema:
 *           type: boolean
 *         description: Filter by public/private status
 *     responses:
 *       200:
 *         description: List of filter templates
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/FilterTemplate'
 */
router.get('/templates', async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    
    const templates = await queryBuilderService.getTemplates(userId);
    
    // Apply filters from query params
    let filtered = templates;
    const { category, search, public: isPublic } = req.query;
    
    if (category) {
      filtered = filtered.filter(t => t.category === category);
    }
    
    if (search) {
      const searchTerm = (search as string).toLowerCase();
      filtered = filtered.filter(t =>
        t.name.toLowerCase().includes(searchTerm) ||
        t.description?.toLowerCase().includes(searchTerm) ||
        t.tags.some(tag => tag.toLowerCase().includes(searchTerm))
      );
    }
    
    if (isPublic !== undefined) {
      const publicFilter = isPublic === 'true';
      filtered = filtered.filter(t => t.isPublic === publicFilter);
    }
    
    res.json({
      success: true,
      data: filtered
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/v1/filters/templates:
 *   post:
 *     summary: Create filter template
 *     description: Save current filter as a reusable template
 *     tags: [Filter Templates]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateFilterTemplateRequest'
 *     responses:
 *       201:
 *         description: Created template
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/FilterTemplate'
 */
router.post('/templates',
  validateRequest(CreateFilterTemplateRequestSchema),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }
      
      const template = await queryBuilderService.createTemplate(userId, req.body);
      
      res.status(201).json({
        success: true,
        data: template
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/v1/filters/templates/{id}:
 *   get:
 *     summary: Get filter template
 *     description: Get a specific filter template by ID
 *     tags: [Filter Templates]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Template ID
 *     responses:
 *       200:
 *         description: Filter template
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/FilterTree'
 */
router.get('/templates/:id', async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    
    const filterTree = await queryBuilderService.applyTemplate(req.params.id, userId);
    
    res.json({
      success: true,
      data: filterTree
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/v1/filters/templates/{id}:
 *   delete:
 *     summary: Delete filter template
 *     description: Delete a filter template (only owner can delete)
 *     tags: [Filter Templates]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Template ID
 *     responses:
 *       204:
 *         description: Template deleted successfully
 */
router.delete('/templates/:id', async (req, res, next) => {
  try {
    // Implementation would check ownership and delete
    // For now, just return success
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// Sharing Endpoints
// ============================================================================

/**
 * @swagger
 * /api/v1/filters/share:
 *   post:
 *     summary: Share filter
 *     description: Create a shareable link for a filter
 *     tags: [Filter Sharing]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ShareFilterRequest'
 *     responses:
 *       201:
 *         description: Share link created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 shareToken:
 *                   type: string
 *                 shareUrl:
 *                   type: string
 */
router.post('/share',
  validateRequest(ShareFilterRequestSchema),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }
      
      const shareToken = await queryBuilderService.shareFilter(userId, req.body);
      const shareUrl = `${req.protocol}://${req.get('host')}/shared-filters/${shareToken}`;
      
      res.status(201).json({
        success: true,
        data: {
          shareToken,
          shareUrl
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/v1/filters/shared/{token}:
 *   get:
 *     summary: Get shared filter
 *     description: Import a shared filter using its token
 *     tags: [Filter Sharing]
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: Share token
 *     responses:
 *       200:
 *         description: Shared filter
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/FilterTree'
 */
router.get('/shared/:token', async (req, res, next) => {
  try {
    const filterTree = await queryBuilderService.importSharedFilter(req.params.token);
    
    res.json({
      success: true,
      data: filterTree
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// User Presets Endpoints
// ============================================================================

/**
 * @swagger
 * /api/v1/filters/presets:
 *   get:
 *     summary: Get user filter presets
 *     description: Get list of user's personal filter presets
 *     tags: [Filter Presets]
 *     responses:
 *       200:
 *         description: List of filter presets
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/FilterPreset'
 */
router.get('/presets', async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    
    const presets = await queryBuilderService.getUserPresets(userId);
    
    res.json({
      success: true,
      data: presets
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/v1/filters/presets:
 *   post:
 *     summary: Save filter preset
 *     description: Save current filter as a personal preset
 *     tags: [Filter Presets]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SaveFilterPresetRequest'
 *     responses:
 *       201:
 *         description: Created preset
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/FilterPreset'
 */
router.post('/presets',
  validateRequest(SaveFilterPresetRequestSchema),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }
      
      const preset = await queryBuilderService.savePreset(userId, req.body);
      
      res.status(201).json({
        success: true,
        data: preset
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/v1/filters/presets/{id}:
 *   put:
 *     summary: Update filter preset
 *     description: Update an existing filter preset
 *     tags: [Filter Presets]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Preset ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SaveFilterPresetRequest'
 *     responses:
 *       200:
 *         description: Updated preset
 */
router.put('/presets/:id', async (req, res, next) => {
  try {
    // Implementation would update the preset
    res.json({
      success: true,
      message: 'Preset updated successfully'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/v1/filters/presets/{id}:
 *   delete:
 *     summary: Delete filter preset
 *     description: Delete a filter preset
 *     tags: [Filter Presets]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Preset ID
 *     responses:
 *       204:
 *         description: Preset deleted successfully
 */
router.delete('/presets/:id', async (req, res, next) => {
  try {
    // Implementation would delete the preset
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// Analytics Endpoints
// ============================================================================

/**
 * @swagger
 * /api/v1/filters/analytics:
 *   post:
 *     summary: Track filter usage
 *     description: Record analytics event for filter usage
 *     tags: [Filter Analytics]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               actionType:
 *                 type: string
 *                 enum: [create, apply, share, save_template, load_template, delete]
 *               filterTree:
 *                 $ref: '#/components/schemas/FilterTree'
 *               executionTimeMs:
 *                 type: integer
 *     responses:
 *       204:
 *         description: Analytics recorded successfully
 */
router.post('/analytics', async (req, res, next) => {
  try {
    // Analytics tracking would be handled by the service
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/v1/filters/history:
 *   get:
 *     summary: Get filter history
 *     description: Get user's filter usage history
 *     tags: [Filter History]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 50
 *     responses:
 *       200:
 *         description: Filter history
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/FilterHistory'
 */
router.get('/history', async (req: AuthenticatedRequest, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    
    const limit = parseInt(req.query.limit as string) || 50;
    const history = await queryBuilderService.getHistory(userId, limit);
    
    res.json({
      success: true,
      data: history
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// Field Metadata Endpoints
// ============================================================================

/**
 * @swagger
 * /api/v1/filters/fields:
 *   get:
 *     summary: Get available fields
 *     description: Get list of fields available for filtering
 *     tags: [Filter Metadata]
 *     parameters:
 *       - in: query
 *         name: source
 *         schema:
 *           type: string
 *         description: Data source to get fields for
 *     responses:
 *       200:
 *         description: Available fields
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/FieldMetadata'
 */
router.get('/fields', async (req, res, next) => {
  try {
    // This would return available fields based on the data source
    // For now, return a mock set of fields
    const mockFields = [
      {
        name: 'title',
        label: 'Title',
        dataType: 'string',
        operators: ['equals', 'contains', 'starts_with', 'ends_with', 'not_contains'],
        description: 'Document or item title',
        isIndexed: true,
        isFaceted: true
      },
      {
        name: 'content',
        label: 'Content',
        dataType: 'string',
        operators: ['contains', 'not_contains', 'matches_regex'],
        description: 'Full text content',
        isIndexed: true,
        isFaceted: false
      },
      {
        name: 'created_at',
        label: 'Created Date',
        dataType: 'date',
        operators: ['equals', 'greater_than', 'less_than', 'between'],
        description: 'Date when item was created',
        isIndexed: true,
        isFaceted: true
      },
      {
        name: 'priority',
        label: 'Priority',
        dataType: 'number',
        operators: ['equals', 'greater_than', 'less_than', 'in'],
        description: 'Priority level (1-5)',
        validation: { min: 1, max: 5 },
        isIndexed: true,
        isFaceted: true
      },
      {
        name: 'status',
        label: 'Status',
        dataType: 'string',
        operators: ['equals', 'not_equals', 'in', 'not_in'],
        description: 'Current status',
        validation: { enum: ['active', 'inactive', 'pending', 'completed'] },
        isIndexed: true,
        isFaceted: true
      },
      {
        name: 'tags',
        label: 'Tags',
        dataType: 'array',
        operators: ['in', 'not_in', 'contains'],
        description: 'Associated tags',
        isIndexed: true,
        isFaceted: true
      }
    ];
    
    res.json({
      success: true,
      data: mockFields
    });
  } catch (error) {
    next(error);
  }
});

export default router;