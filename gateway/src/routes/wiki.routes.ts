/**
 * Wiki API Routes
 * 
 * REST API endpoints for Wiki page management.
 */

import { Router } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { asyncHandler } from '../middleware/errorHandler.js';
import { MCPClientService } from '../services/MCPClientService.js';

const router = Router();

// Validation middleware
const validateRequest = (req: any, res: any, next: any) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.error('VALIDATION_ERROR', 'Request validation failed', errors.array(), 400);
  }
  next();
};

// GET /api/wiki/pages - List wiki pages
router.get('/pages', [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('category_id').optional().isString(),
  query('tags').optional().isArray(),
  query('search').optional().isString(),
  query('sort').optional().isIn(['title', 'created_at', 'updated_at']),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  const mcpService: MCPClientService = req.app.locals.mcpService;
  
  const result = await mcpService.callTool('wiki', {
    name: 'get_pages',
    arguments: {
      limit: req.query.limit || 20,
      categoryId: req.query.category_id,
      tags: req.query.tags,
      search: req.query.search
    }
  });
  
  if (result.isError) {
    return res.error('MCP_ERROR', 'Failed to retrieve wiki pages', result.content);
  }
  
  const page = req.query.page || 1;
  const limit = req.query.limit || 20;
  
  res.paginated([], {
    page,
    limit,
    total: 0,
    hasNext: false,
    hasPrev: false
  });
}));

// POST /api/wiki/pages - Create wiki page
router.post('/pages', [
  body('title').notEmpty().isLength({ min: 1, max: 255 }),
  body('content').notEmpty().isString(),
  body('category_id').optional().isString(),
  body('tags').optional().isArray(),
  body('published').optional().isBoolean(),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  const mcpService: MCPClientService = req.app.locals.mcpService;
  
  const result = await mcpService.callTool('wiki', {
    name: 'create_page',
    arguments: {
      title: req.body.title,
      content: req.body.content,
      categoryId: req.body.category_id,
      tags: req.body.tags || [],
      published: req.body.published !== false,
      authorId: req.user?.id
    }
  });
  
  if (result.isError) {
    return res.error('MCP_ERROR', 'Failed to create wiki page', result.content);
  }
  
  // Generate slug from title
  const slug = req.body.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  
  res.status(201).success({
    id: 'page_' + Date.now(),
    title: req.body.title,
    slug,
    summary: req.body.content.substring(0, 200) + '...',
    category: req.body.category_id ? {
      id: req.body.category_id,
      name: 'Category Name',
      slug: 'category-slug'
    } : null,
    tags: (req.body.tags || []).map((tag: string, index: number) => ({
      id: 'tag_' + index,
      name: tag,
      color: '#3b82f6'
    })),
    author_id: req.user?.id,
    published: req.body.published !== false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    version: 1
  });
}));

// GET /api/wiki/pages/:id - Get wiki page
router.get('/pages/:id', [
  param('id').notEmpty(),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  const mcpService: MCPClientService = req.app.locals.mcpService;
  
  const result = await mcpService.callTool('wiki', {
    name: 'get_page',
    arguments: {
      pageId: req.params.id.replace('page_', '')
    }
  });
  
  if (result.isError) {
    return res.status(404).error('NOT_FOUND', 'Wiki page not found');
  }
  
  res.success({
    id: req.params.id,
    title: 'Sample Page',
    slug: 'sample-page',
    content: '# Sample Page\n\nThis is a sample wiki page.',
    html_content: '<h1>Sample Page</h1><p>This is a sample wiki page.</p>',
    summary: 'This is a sample wiki page.',
    category: null,
    tags: [],
    author_id: req.user?.id,
    published: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    version: 1,
    table_of_contents: [
      {
        level: 1,
        title: 'Sample Page',
        anchor: 'sample-page'
      }
    ]
  });
}));

// PUT /api/wiki/pages/:id - Update wiki page
router.put('/pages/:id', [
  param('id').notEmpty(),
  body('title').optional().isLength({ min: 1, max: 255 }),
  body('content').optional().isString(),
  body('category_id').optional().isString(),
  body('tags').optional().isArray(),
  body('published').optional().isBoolean(),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  const mcpService: MCPClientService = req.app.locals.mcpService;
  
  const result = await mcpService.callTool('wiki', {
    name: 'update_page',
    arguments: {
      pageId: req.params.id.replace('page_', ''),
      ...req.body
    }
  });
  
  if (result.isError) {
    return res.status(404).error('NOT_FOUND', 'Wiki page not found');
  }
  
  res.success({
    id: req.params.id,
    ...req.body,
    updated_at: new Date().toISOString(),
    version: 2
  });
}));

// DELETE /api/wiki/pages/:id - Delete wiki page
router.delete('/pages/:id', [
  param('id').notEmpty(),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  const mcpService: MCPClientService = req.app.locals.mcpService;
  
  const result = await mcpService.callTool('wiki', {
    name: 'delete_page',
    arguments: {
      pageId: req.params.id.replace('page_', '')
    }
  });
  
  if (result.isError) {
    return res.status(404).error('NOT_FOUND', 'Wiki page not found');
  }
  
  res.status(204).send();
}));

// GET /api/wiki/categories - List categories
router.get('/categories', [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  const mcpService: MCPClientService = req.app.locals.mcpService;
  
  const result = await mcpService.callTool('wiki', {
    name: 'get_categories',
    arguments: {}
  });
  
  if (result.isError) {
    return res.error('MCP_ERROR', 'Failed to retrieve categories', result.content);
  }
  
  const page = req.query.page || 1;
  const limit = req.query.limit || 20;
  
  res.paginated([], {
    page,
    limit,
    total: 0,
    hasNext: false,
    hasPrev: false
  });
}));

// POST /api/wiki/categories - Create category
router.post('/categories', [
  body('name').notEmpty().isLength({ min: 1, max: 255 }),
  body('description').optional().isString(),
  body('color').optional().matches(/^#[0-9A-Fa-f]{6}$/),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  const mcpService: MCPClientService = req.app.locals.mcpService;
  
  const result = await mcpService.callTool('wiki', {
    name: 'create_category',
    arguments: {
      name: req.body.name,
      description: req.body.description,
      color: req.body.color || '#64748b'
    }
  });
  
  if (result.isError) {
    return res.error('MCP_ERROR', 'Failed to create category', result.content);
  }
  
  const slug = req.body.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  
  res.status(201).success({
    id: 'cat_' + Date.now(),
    name: req.body.name,
    slug,
    description: req.body.description,
    color: req.body.color || '#64748b',
    page_count: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });
}));

// PUT /api/wiki/pages/:id/categories - Update page categories
router.put('/pages/:id/categories', [
  param('id').notEmpty(),
  body('category_ids').isArray(),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  const mcpService: MCPClientService = req.app.locals.mcpService;
  
  const result = await mcpService.callTool('wiki', {
    name: 'update_page_categories',
    arguments: {
      pageId: req.params.id,
      categoryIds: req.body.category_ids
    }
  });
  
  if (result.isError) {
    return res.status(404).error('NOT_FOUND', 'Wiki page not found or invalid category IDs', result.content);
  }
  
  res.success({ message: 'Page categories updated successfully' });
}));

// PUT /api/wiki/pages/:id/tags - Update page tags
router.put('/pages/:id/tags', [
  param('id').notEmpty(),
  body('tag_names').isArray(),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  const mcpService: MCPClientService = req.app.locals.mcpService;
  
  const result = await mcpService.callTool('wiki', {
    name: 'update_page_tags',
    arguments: {
      pageId: req.params.id,
      tagNames: req.body.tag_names
    }
  });
  
  if (result.isError) {
    return res.status(404).error('NOT_FOUND', 'Wiki page not found', result.content);
  }
  
  res.success({ message: 'Page tags updated successfully' });
}));

// GET /api/wiki/pages/:id/history - Get page version history
router.get('/pages/:id/history', [
  param('id').notEmpty(),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  const mcpService: MCPClientService = req.app.locals.mcpService;

  const result = await mcpService.callTool('wiki', {
    name: 'get_page_history',
    arguments: {
      pageId: req.params.id
    }
  });

  if (result.isError) {
    return res.status(404).error('NOT_FOUND', 'Wiki page not found', result.content);
  }

  res.success(result.content);
}));

// POST /api/wiki/pages/:id/restore/:version - Restore page version
router.post('/pages/:id/restore/:version', [
  param('id').notEmpty(),
  param('version').isInt(),
  body('restored_by').optional().isString(),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  const mcpService: MCPClientService = req.app.locals.mcpService;

  const result = await mcpService.callTool('wiki', {
    name: 'restore_page_version',
    arguments: {
      pageId: req.params.id,
      historyId: parseInt(req.params.version),
      restoredBy: req.body.restored_by || req.user?.name
    }
  });
  
  if (result.isError) {
    return res.status(404).error('NOT_FOUND', 'Wiki page or version not found', result.content);
  }
  
  res.success(result.content);
}));

// GET /api/wiki/pages/:id/links - Get page links
router.get('/pages/:id/links', [
  param('id').notEmpty(),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  const mcpService: MCPClientService = req.app.locals.mcpService;
  
  const result = await mcpService.callTool('wiki', {
    name: 'get_page_links',
    arguments: {
      pageId: req.params.id
    }
  });

  if (result.isError) {
    return res.status(404).error('NOT_FOUND', 'Wiki page not found', result.content);
  }

  res.success(result.content);
}));

// GET /api/wiki/pages/:id/backlinks - Get page backlinks
router.get('/pages/:id/backlinks', [
  param('id').notEmpty(),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  const mcpService: MCPClientService = req.app.locals.mcpService;

  const result = await mcpService.callTool('wiki', {
    name: 'get_page_backlinks',
    arguments: {
      pageId: req.params.id
    }
  });
  
  if (result.isError) {
    return res.status(404).error('NOT_FOUND', 'Wiki page not found', result.content);
  }
  
  res.success(result.content);
}));

// GET /api/wiki/tags - List tags
router.get('/tags', [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  const mcpService: MCPClientService = req.app.locals.mcpService;
  
  const result = await mcpService.callTool('wiki', {
    name: 'get_tags',
    arguments: {}
  });
  
  if (result.isError) {
    return res.error('MCP_ERROR', 'Failed to retrieve tags', result.content);
  }
  
  res.success(result.content || []);
}));

// POST /api/wiki/tags - Create tag
router.post('/tags', [
  body('name').notEmpty().isLength({ min: 1, max: 100 }),
  body('color').optional().matches(/^#[0-9A-Fa-f]{6}$/),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  const mcpService: MCPClientService = req.app.locals.mcpService;
  
  const result = await mcpService.callTool('wiki', {
    name: 'create_tag',
    arguments: {
      name: req.body.name,
      color: req.body.color || '#64748b'
    }
  });
  
  if (result.isError) {
    return res.error('MCP_ERROR', 'Failed to create tag', result.content);
  }
  
  res.status(201).success(result.content);
}));

// === ATTACHMENT ENDPOINTS ===

// POST /api/wiki/pages/:id/attachments - Upload attachment to page
router.post('/pages/:id/attachments', [
  param('id').isInt().toInt(),
  body('description').optional().isString(),
  body('uploaded_by').optional().isString(),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  const mcpService: MCPClientService = req.app.locals.mcpService;
  
  // Check if file was uploaded
  if (!req.files || !req.files.file) {
    return res.status(400).error('MISSING_FILE', 'No file uploaded');
  }

  const file = req.files.file;
  const fileData = file.data.toString('base64');

  const result = await mcpService.callTool('wiki', {
    name: 'wiki_upload_attachment',
    arguments: {
      page_id: req.params.id,
      file_data: fileData,
      filename: file.name,
      mime_type: file.mimetype,
      description: req.body.description,
      uploaded_by: req.body.uploaded_by || req.user?.id
    }
  });

  if (result.isError) {
    return res.error('UPLOAD_ERROR', 'Failed to upload attachment', result.content);
  }

  res.status(201).success(result.content);
}));

// GET /api/wiki/pages/:id/attachments - List page attachments
router.get('/pages/:id/attachments', [
  param('id').isInt().toInt(),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  const mcpService: MCPClientService = req.app.locals.mcpService;

  const result = await mcpService.callTool('wiki', {
    name: 'wiki_list_page_attachments',
    arguments: {
      page_id: req.params.id
    }
  });

  if (result.isError) {
    return res.error('MCP_ERROR', 'Failed to retrieve attachments', result.content);
  }

  res.success(result.content);
}));

// GET /api/wiki/attachments/:attachmentId - Download attachment
router.get('/attachments/:attachmentId', [
  param('attachmentId').notEmpty(),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  const mcpService: MCPClientService = req.app.locals.mcpService;

  const result = await mcpService.callTool('wiki', {
    name: 'wiki_get_attachment',
    arguments: {
      attachment_id: req.params.attachmentId
    }
  });

  if (result.isError) {
    return res.status(404).error('NOT_FOUND', 'Attachment not found');
  }

  // For now, return the attachment metadata
  // In a full implementation, this would stream the file
  res.success(result.content);
}));

// GET /api/wiki/attachments/:attachmentId/thumbnail - Get attachment thumbnail
router.get('/attachments/:attachmentId/thumbnail', [
  param('attachmentId').notEmpty(),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  const mcpService: MCPClientService = req.app.locals.mcpService;

  const result = await mcpService.callTool('wiki', {
    name: 'wiki_get_attachment',
    arguments: {
      attachment_id: req.params.attachmentId
    }
  });

  if (result.isError) {
    return res.status(404).error('NOT_FOUND', 'Attachment not found');
  }

  // For now, return placeholder response
  // In full implementation, this would stream the thumbnail image
  res.success({
    message: 'Thumbnail functionality is being implemented',
    attachment_id: req.params.attachmentId
  });
}));

// PUT /api/wiki/attachments/:attachmentId - Update attachment metadata
router.put('/attachments/:attachmentId', [
  param('attachmentId').notEmpty(),
  body('description').optional().isString(),
  body('original_name').optional().isString(),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  const mcpService: MCPClientService = req.app.locals.mcpService;

  const result = await mcpService.callTool('wiki', {
    name: 'wiki_update_attachment',
    arguments: {
      attachment_id: req.params.attachmentId,
      description: req.body.description,
      original_name: req.body.original_name
    }
  });

  if (result.isError) {
    return res.status(404).error('NOT_FOUND', 'Attachment not found');
  }

  res.success(result.content);
}));

// DELETE /api/wiki/attachments/:attachmentId - Delete attachment
router.delete('/attachments/:attachmentId', [
  param('attachmentId').notEmpty(),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  const mcpService: MCPClientService = req.app.locals.mcpService;

  const result = await mcpService.callTool('wiki', {
    name: 'wiki_delete_attachment',
    arguments: {
      attachment_id: req.params.attachmentId
    }
  });

  if (result.isError) {
    return res.status(404).error('NOT_FOUND', 'Attachment not found');
  }

  res.status(204).send();
}));

// GET /api/wiki/attachments/search - Search attachments
router.get('/attachments/search', [
  query('query').notEmpty().isString(),
  query('page_id').optional().isInt().toInt(),
  query('mime_type').optional().isString(),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  const mcpService: MCPClientService = req.app.locals.mcpService;

  const result = await mcpService.callTool('wiki', {
    name: 'wiki_search_attachments',
    arguments: {
      query: req.query.query,
      page_id: req.query.page_id,
      mime_type: req.query.mime_type
    }
  });

  if (result.isError) {
    return res.error('MCP_ERROR', 'Failed to search attachments', result.content);
  }

  res.success(result.content);
}));

// GET /api/wiki/storage/stats - Get storage statistics
router.get('/storage/stats', [
  query('page_id').optional().isInt().toInt(),
  validateRequest
], asyncHandler(async (req: any, res: any) => {
  const mcpService: MCPClientService = req.app.locals.mcpService;

  const result = await mcpService.callTool('wiki', {
    name: 'wiki_get_storage_stats',
    arguments: {
      page_id: req.query.page_id
    }
  });

  if (result.isError) {
    return res.error('MCP_ERROR', 'Failed to retrieve storage stats', result.content);
  }

  res.success(result.content);
}));

export default router;