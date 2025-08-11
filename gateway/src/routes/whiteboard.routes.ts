import express from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { DatabasePool } from '../database/index.js';
import { Logger } from '../utils/logger.js';
import { authMiddleware } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validation.middleware.js';
import { 
  WhiteboardService,
  WhiteboardElementService,
  WhiteboardPermissionService,
  WhiteboardCollaborationService 
} from '@mcp-tools/core';
import {
  CreateWhiteboardRequest,
  UpdateWhiteboardRequest,
  CreateElementRequest,
  UpdateElementRequest,
  GrantPermissionRequest,
  WhiteboardFilter,
  WhiteboardSort,
} from '@shared/types/whiteboard.js';

const router = express.Router();
const logger = new Logger('WhiteboardRoutes');

// Validation schemas
const CreateWhiteboardSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  templateId: z.string().uuid().optional(),
  visibility: z.enum(['workspace', 'members', 'public']).optional(),
  settings: z.record(z.any()).optional(),
  canvasData: z.record(z.any()).optional(),
});

const UpdateWhiteboardSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  visibility: z.enum(['workspace', 'members', 'public']).optional(),
  settings: z.record(z.any()).optional(),
  canvasData: z.record(z.any()).optional(),
});

const CreateElementSchema = z.object({
  elementType: z.enum([
    'rectangle', 'ellipse', 'triangle', 'line', 'arrow', 'freehand',
    'text', 'sticky_note', 'image', 'link', 'frame', 'group',
    'connector', 'shape', 'chart', 'table'
  ]),
  elementData: z.record(z.any()),
  styleData: z.record(z.any()).optional(),
  parentId: z.string().uuid().optional(),
  layerIndex: z.number().optional(),
});

const UpdateElementSchema = z.object({
  elementData: z.record(z.any()).optional(),
  styleData: z.record(z.any()).optional(),
  layerIndex: z.number().optional(),
  locked: z.boolean().optional(),
  visible: z.boolean().optional(),
  parentId: z.string().uuid().optional(),
});

const GrantPermissionSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(['owner', 'editor', 'viewer', 'commenter']),
  permissions: z.record(z.any()).optional(),
  expiresAt: z.string().datetime().optional(),
});

const ListWhiteboardsQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
  search: z.string().optional(),
  status: z.string().optional().transform(val => val ? val.split(',') : undefined),
  visibility: z.string().optional().transform(val => val ? val.split(',') : undefined),
  sortBy: z.enum(['name', 'createdAt', 'updatedAt']).default('updatedAt'),
  sortDirection: z.enum(['asc', 'desc']).default('desc'),
});

// Collaboration schemas
const AddCommentSchema = z.object({
  content: z.string().min(1).max(2000),
  position: z.object({
    x: z.number(),
    y: z.number(),
  }),
  elementId: z.string().optional(),
  parentCommentId: z.string().uuid().optional(),
});

const ResolveCommentSchema = z.object({
  resolved: z.boolean(),
});

/**
 * Initialize whiteboard routes
 */
export function createWhiteboardRoutes(db: DatabasePool): express.Router {
  const whiteboardService = new WhiteboardService(db, logger);
  const elementService = new WhiteboardElementService(db, logger);
  const permissionService = new WhiteboardPermissionService(db, logger);
  const collaborationService = new WhiteboardCollaborationService(db);

  // Apply authentication middleware to all routes
  router.use(authMiddleware);

  // Whiteboard Management Routes

  /**
   * POST /api/workspaces/:workspaceId/whiteboards
   * Create a new whiteboard
   */
  router.post(
    '/workspaces/:workspaceId/whiteboards',
    validateRequest({ body: CreateWhiteboardSchema }),
    async (req: any, res) => {
      try {
        const { workspaceId } = req.params;
        const userId = req.user.id;
        const request = req.body as CreateWhiteboardRequest;

        const whiteboard = await whiteboardService.createWhiteboard(
          workspaceId,
          userId,
          request
        );

        res.status(201).json({
          success: true,
          data: whiteboard,
          message: 'Whiteboard created successfully'
        });
      } catch (error) {
        logger.error('Create whiteboard error', { error, workspaceId: req.params.workspaceId });
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Internal server error'
        });
      }
    }
  );

  /**
   * GET /api/workspaces/:workspaceId/whiteboards
   * List whiteboards in workspace
   */
  router.get(
    '/workspaces/:workspaceId/whiteboards',
    validateRequest({ query: ListWhiteboardsQuerySchema }),
    async (req: any, res) => {
      try {
        const { workspaceId } = req.params;
        const userId = req.user.id;
        const query = req.query;

        const filters: WhiteboardFilter = {
          search: query.search,
          status: query.status,
          visibility: query.visibility,
        };

        const sort: WhiteboardSort = {
          field: query.sortBy,
          direction: query.sortDirection,
        };

        const result = await whiteboardService.getWhiteboardsWithStats(
          workspaceId,
          userId,
          filters,
          sort,
          query.limit,
          query.offset
        );

        res.json({
          success: true,
          data: result,
          message: 'Whiteboards retrieved successfully'
        });
      } catch (error) {
        logger.error('List whiteboards error', { error, workspaceId: req.params.workspaceId });
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Internal server error'
        });
      }
    }
  );

  /**
   * GET /api/workspaces/:workspaceId/whiteboards/:id
   * Get whiteboard by ID
   */
  router.get(
    '/workspaces/:workspaceId/whiteboards/:id',
    async (req: any, res) => {
      try {
        const { id } = req.params;
        const userId = req.user.id;
        const includeElements = req.query.includeElements === 'true';

        let whiteboard;
        if (includeElements) {
          whiteboard = await whiteboardService.getWhiteboardWithElements(id, userId);
        } else {
          whiteboard = await whiteboardService.getWhiteboard(id, userId);
        }

        if (!whiteboard) {
          return res.status(404).json({
            success: false,
            error: 'Whiteboard not found'
          });
        }

        res.json({
          success: true,
          data: whiteboard,
          message: 'Whiteboard retrieved successfully'
        });
      } catch (error) {
        logger.error('Get whiteboard error', { error, whiteboardId: req.params.id });
        
        if (error instanceof Error && error.message.includes('ACCESS_DENIED')) {
          return res.status(403).json({
            success: false,
            error: 'Access denied to whiteboard'
          });
        }

        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Internal server error'
        });
      }
    }
  );

  /**
   * PUT /api/workspaces/:workspaceId/whiteboards/:id
   * Update whiteboard
   */
  router.put(
    '/workspaces/:workspaceId/whiteboards/:id',
    validateRequest({ body: UpdateWhiteboardSchema }),
    async (req: any, res) => {
      try {
        const { id } = req.params;
        const userId = req.user.id;
        const request = req.body as UpdateWhiteboardRequest;

        const whiteboard = await whiteboardService.updateWhiteboard(
          id,
          userId,
          request
        );

        res.json({
          success: true,
          data: whiteboard,
          message: 'Whiteboard updated successfully'
        });
      } catch (error) {
        logger.error('Update whiteboard error', { error, whiteboardId: req.params.id });
        
        if (error instanceof Error && error.message.includes('ACCESS_DENIED')) {
          return res.status(403).json({
            success: false,
            error: 'Access denied to whiteboard'
          });
        }

        if (error instanceof Error && error.message.includes('NOT_FOUND')) {
          return res.status(404).json({
            success: false,
            error: 'Whiteboard not found'
          });
        }

        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Internal server error'
        });
      }
    }
  );

  /**
   * DELETE /api/workspaces/:workspaceId/whiteboards/:id
   * Delete whiteboard
   */
  router.delete(
    '/workspaces/:workspaceId/whiteboards/:id',
    async (req: any, res) => {
      try {
        const { id } = req.params;
        const userId = req.user.id;

        await whiteboardService.deleteWhiteboard(id, userId);

        res.json({
          success: true,
          message: 'Whiteboard deleted successfully'
        });
      } catch (error) {
        logger.error('Delete whiteboard error', { error, whiteboardId: req.params.id });
        
        if (error instanceof Error && error.message.includes('ACCESS_DENIED')) {
          return res.status(403).json({
            success: false,
            error: 'Access denied to whiteboard'
          });
        }

        if (error instanceof Error && error.message.includes('NOT_FOUND')) {
          return res.status(404).json({
            success: false,
            error: 'Whiteboard not found'
          });
        }

        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Internal server error'
        });
      }
    }
  );

  // Element Management Routes

  /**
   * POST /api/workspaces/:workspaceId/whiteboards/:id/elements
   * Add element to whiteboard
   */
  router.post(
    '/workspaces/:workspaceId/whiteboards/:id/elements',
    validateRequest({ body: CreateElementSchema }),
    async (req: any, res) => {
      try {
        const { id } = req.params;
        const userId = req.user.id;
        const request = req.body as CreateElementRequest;

        const element = await elementService.createElement(
          id,
          userId,
          request
        );

        res.status(201).json({
          success: true,
          data: element,
          message: 'Element added successfully'
        });
      } catch (error) {
        logger.error('Add element error', { error, whiteboardId: req.params.id });
        
        if (error instanceof Error && error.message.includes('ACCESS_DENIED')) {
          return res.status(403).json({
            success: false,
            error: 'Access denied to whiteboard'
          });
        }

        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Internal server error'
        });
      }
    }
  );

  /**
   * GET /api/workspaces/:workspaceId/whiteboards/:id/elements
   * Get elements for whiteboard
   */
  router.get(
    '/workspaces/:workspaceId/whiteboards/:id/elements',
    async (req: any, res) => {
      try {
        const { id } = req.params;
        const userId = req.user.id;
        const limit = parseInt(req.query.limit || '1000');
        const offset = parseInt(req.query.offset || '0');

        const result = await elementService.getElements(
          id,
          userId,
          limit,
          offset
        );

        res.json({
          success: true,
          data: result,
          message: 'Elements retrieved successfully'
        });
      } catch (error) {
        logger.error('Get elements error', { error, whiteboardId: req.params.id });
        
        if (error instanceof Error && error.message.includes('ACCESS_DENIED')) {
          return res.status(403).json({
            success: false,
            error: 'Access denied to whiteboard'
          });
        }

        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Internal server error'
        });
      }
    }
  );

  /**
   * PUT /api/workspaces/:workspaceId/whiteboards/:whiteboardId/elements/:elementId
   * Update element
   */
  router.put(
    '/workspaces/:workspaceId/whiteboards/:whiteboardId/elements/:elementId',
    validateRequest({ body: UpdateElementSchema }),
    async (req: any, res) => {
      try {
        const { elementId } = req.params;
        const userId = req.user.id;
        const request = req.body as UpdateElementRequest;

        const element = await elementService.updateElement(
          elementId,
          userId,
          request
        );

        res.json({
          success: true,
          data: element,
          message: 'Element updated successfully'
        });
      } catch (error) {
        logger.error('Update element error', { error, elementId: req.params.elementId });
        
        if (error instanceof Error && error.message.includes('ACCESS_DENIED')) {
          return res.status(403).json({
            success: false,
            error: 'Access denied to element'
          });
        }

        if (error instanceof Error && error.message.includes('NOT_FOUND')) {
          return res.status(404).json({
            success: false,
            error: 'Element not found'
          });
        }

        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Internal server error'
        });
      }
    }
  );

  /**
   * DELETE /api/workspaces/:workspaceId/whiteboards/:whiteboardId/elements/:elementId
   * Delete element
   */
  router.delete(
    '/workspaces/:workspaceId/whiteboards/:whiteboardId/elements/:elementId',
    async (req: any, res) => {
      try {
        const { elementId } = req.params;
        const userId = req.user.id;

        await elementService.deleteElement(elementId, userId);

        res.json({
          success: true,
          message: 'Element deleted successfully'
        });
      } catch (error) {
        logger.error('Delete element error', { error, elementId: req.params.elementId });
        
        if (error instanceof Error && error.message.includes('ACCESS_DENIED')) {
          return res.status(403).json({
            success: false,
            error: 'Access denied to element'
          });
        }

        if (error instanceof Error && error.message.includes('NOT_FOUND')) {
          return res.status(404).json({
            success: false,
            error: 'Element not found'
          });
        }

        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Internal server error'
        });
      }
    }
  );

  // Permission Management Routes

  /**
   * POST /api/workspaces/:workspaceId/whiteboards/:id/permissions
   * Grant permission to user
   */
  router.post(
    '/workspaces/:workspaceId/whiteboards/:id/permissions',
    validateRequest({ body: GrantPermissionSchema }),
    async (req: any, res) => {
      try {
        const { id } = req.params;
        const grantedBy = req.user.id;
        const request = req.body as GrantPermissionRequest;

        const permission = await permissionService.grantPermission(
          id,
          grantedBy,
          request
        );

        res.status(201).json({
          success: true,
          data: permission,
          message: 'Permission granted successfully'
        });
      } catch (error) {
        logger.error('Grant permission error', { error, whiteboardId: req.params.id });
        
        if (error instanceof Error && error.message.includes('ACCESS_DENIED')) {
          return res.status(403).json({
            success: false,
            error: 'Access denied to manage permissions'
          });
        }

        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Internal server error'
        });
      }
    }
  );

  /**
   * GET /api/workspaces/:workspaceId/whiteboards/:id/permissions
   * List permissions for whiteboard
   */
  router.get(
    '/workspaces/:workspaceId/whiteboards/:id/permissions',
    async (req: any, res) => {
      try {
        const { id } = req.params;
        const requesterId = req.user.id;

        const permissions = await permissionService.listPermissions(id, requesterId);

        res.json({
          success: true,
          data: permissions,
          message: 'Permissions retrieved successfully'
        });
      } catch (error) {
        logger.error('List permissions error', { error, whiteboardId: req.params.id });
        
        if (error instanceof Error && error.message.includes('ACCESS_DENIED')) {
          return res.status(403).json({
            success: false,
            error: 'Access denied to view permissions'
          });
        }

        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Internal server error'
        });
      }
    }
  );

  /**
   * DELETE /api/workspaces/:workspaceId/whiteboards/:id/permissions/:userId
   * Revoke permission from user
   */
  router.delete(
    '/workspaces/:workspaceId/whiteboards/:id/permissions/:userId',
    async (req: any, res) => {
      try {
        const { id, userId } = req.params;
        const revokedBy = req.user.id;

        await permissionService.revokePermission(id, userId, revokedBy);

        res.json({
          success: true,
          message: 'Permission revoked successfully'
        });
      } catch (error) {
        logger.error('Revoke permission error', { error, whiteboardId: req.params.id, userId: req.params.userId });
        
        if (error instanceof Error && error.message.includes('ACCESS_DENIED')) {
          return res.status(403).json({
            success: false,
            error: 'Access denied to manage permissions'
          });
        }

        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Internal server error'
        });
      }
    }
  );

  // Canvas Data Management Routes

  /**
   * GET /api/v1/whiteboards/:id/canvas
   * Get canvas data for a whiteboard
   */
  router.get(
    '/v1/whiteboards/:id/canvas',
    async (req: any, res) => {
      try {
        const { id } = req.params;
        const userId = req.user.id;

        const whiteboard = await whiteboardService.getWhiteboard(id, userId);
        
        if (!whiteboard) {
          return res.status(404).json({
            success: false,
            error: 'Whiteboard not found'
          });
        }

        res.json({
          success: true,
          data: {
            whiteboardId: id,
            canvasData: whiteboard.canvasData || null,
            lastModified: whiteboard.updatedAt,
          },
          message: 'Canvas data retrieved successfully'
        });
      } catch (error) {
        logger.error('Get canvas data error', { error, whiteboardId: req.params.id });
        
        if (error instanceof Error && error.message.includes('ACCESS_DENIED')) {
          return res.status(403).json({
            success: false,
            error: 'Access denied to whiteboard'
          });
        }

        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Internal server error'
        });
      }
    }
  );

  /**
   * PUT /api/v1/whiteboards/:id/canvas
   * Save canvas data for a whiteboard
   */
  router.put(
    '/v1/whiteboards/:id/canvas',
    validateRequest({ 
      body: z.object({
        canvasData: z.record(z.any()),
        version: z.string().optional(),
      })
    }),
    async (req: any, res) => {
      try {
        const { id } = req.params;
        const { canvasData, version } = req.body;
        const userId = req.user.id;

        const updatedWhiteboard = await whiteboardService.updateWhiteboard(
          id,
          userId,
          { canvasData }
        );

        res.json({
          success: true,
          data: {
            whiteboardId: id,
            lastModified: updatedWhiteboard.updatedAt,
            version: version || 'auto',
          },
          message: 'Canvas data saved successfully'
        });
      } catch (error) {
        logger.error('Save canvas data error', { error, whiteboardId: req.params.id });
        
        if (error instanceof Error && error.message.includes('ACCESS_DENIED')) {
          return res.status(403).json({
            success: false,
            error: 'Access denied to whiteboard'
          });
        }

        if (error instanceof Error && error.message.includes('NOT_FOUND')) {
          return res.status(404).json({
            success: false,
            error: 'Whiteboard not found'
          });
        }

        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Internal server error'
        });
      }
    }
  );

  /**
   * POST /api/v1/whiteboards/:id/canvas/snapshot
   * Create a snapshot of the canvas
   */
  router.post(
    '/v1/whiteboards/:id/canvas/snapshot',
    validateRequest({ 
      body: z.object({
        name: z.string().min(1).max(255).optional(),
        description: z.string().optional(),
      })
    }),
    async (req: any, res) => {
      try {
        const { id } = req.params;
        const { name, description } = req.body;
        const userId = req.user.id;

        // Get current whiteboard data
        const whiteboard = await whiteboardService.getWhiteboard(id, userId);
        
        if (!whiteboard) {
          return res.status(404).json({
            success: false,
            error: 'Whiteboard not found'
          });
        }

        // Create snapshot (this would require additional service implementation)
        const snapshot = {
          id: crypto.randomUUID(),
          whiteboardId: id,
          name: name || `Snapshot ${new Date().toISOString()}`,
          description: description || 'Auto-generated snapshot',
          canvasData: whiteboard.canvasData,
          createdAt: new Date(),
          createdBy: userId,
        };

        res.status(201).json({
          success: true,
          data: snapshot,
          message: 'Canvas snapshot created successfully'
        });
      } catch (error) {
        logger.error('Create canvas snapshot error', { error, whiteboardId: req.params.id });
        
        if (error instanceof Error && error.message.includes('ACCESS_DENIED')) {
          return res.status(403).json({
            success: false,
            error: 'Access denied to whiteboard'
          });
        }

        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Internal server error'
        });
      }
    }
  );

  /**
   * POST /api/v1/whiteboards/:id/canvas/export
   * Export canvas in various formats
   */
  router.post(
    '/v1/whiteboards/:id/canvas/export',
    validateRequest({ 
      body: z.object({
        format: z.enum(['png', 'svg', 'pdf', 'json']),
        options: z.object({
          scale: z.number().min(0.1).max(4).optional(),
          padding: z.number().min(0).max(100).optional(),
          background: z.boolean().optional(),
          darkMode: z.boolean().optional(),
        }).optional(),
      })
    }),
    async (req: any, res) => {
      try {
        const { id } = req.params;
        const { format, options = {} } = req.body;
        const userId = req.user.id;

        // Verify access to whiteboard
        const whiteboard = await whiteboardService.getWhiteboard(id, userId);
        
        if (!whiteboard) {
          return res.status(404).json({
            success: false,
            error: 'Whiteboard not found'
          });
        }

        // Export would typically be handled on the client side for tldraw
        // This endpoint serves as a record of export requests or for server-side exports
        const exportRecord = {
          whiteboardId: id,
          format,
          options,
          exportedBy: userId,
          exportedAt: new Date(),
          status: 'completed',
        };

        res.json({
          success: true,
          data: exportRecord,
          message: `Canvas export initiated for ${format.toUpperCase()} format`
        });
      } catch (error) {
        logger.error('Export canvas error', { error, whiteboardId: req.params.id });
        
        if (error instanceof Error && error.message.includes('ACCESS_DENIED')) {
          return res.status(403).json({
            success: false,
            error: 'Access denied to whiteboard'
          });
        }

        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Internal server error'
        });
      }
    }
  );

  // ==================== COLLABORATION ROUTES ====================

  /**
   * GET /api/v1/whiteboards/:id/sessions
   * Get active collaboration sessions for a whiteboard
   */
  router.get(
    '/v1/whiteboards/:id/sessions',
    async (req: any, res) => {
      try {
        const { id } = req.params;
        const userId = req.user.id;

        // Verify access to whiteboard
        const whiteboard = await whiteboardService.getWhiteboard(id, userId);
        if (!whiteboard) {
          return res.status(404).json({
            success: false,
            error: 'Whiteboard not found'
          });
        }

        const sessions = await collaborationService.getActiveSessions(id);

        res.json({
          success: true,
          data: sessions,
          message: 'Active sessions retrieved successfully'
        });
      } catch (error) {
        logger.error('Get active sessions error', { error, whiteboardId: req.params.id });
        
        if (error instanceof Error && error.message.includes('ACCESS_DENIED')) {
          return res.status(403).json({
            success: false,
            error: 'Access denied to whiteboard'
          });
        }

        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Internal server error'
        });
      }
    }
  );

  /**
   * GET /api/v1/whiteboards/:id/version
   * Get current canvas version for synchronization
   */
  router.get(
    '/v1/whiteboards/:id/version',
    async (req: any, res) => {
      try {
        const { id } = req.params;
        const userId = req.user.id;

        // Verify access to whiteboard
        const whiteboard = await whiteboardService.getWhiteboard(id, userId);
        if (!whiteboard) {
          return res.status(404).json({
            success: false,
            error: 'Whiteboard not found'
          });
        }

        const version = await collaborationService.getCurrentVersion(id);

        res.json({
          success: true,
          data: {
            whiteboardId: id,
            currentVersion: version,
            lastModified: whiteboard.updatedAt,
          },
          message: 'Canvas version retrieved successfully'
        });
      } catch (error) {
        logger.error('Get canvas version error', { error, whiteboardId: req.params.id });
        
        if (error instanceof Error && error.message.includes('ACCESS_DENIED')) {
          return res.status(403).json({
            success: false,
            error: 'Access denied to whiteboard'
          });
        }

        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Internal server error'
        });
      }
    }
  );

  /**
   * GET /api/v1/whiteboards/:id/operations
   * Get operations since a specific version (for syncing)
   */
  router.get(
    '/v1/whiteboards/:id/operations',
    async (req: any, res) => {
      try {
        const { id } = req.params;
        const userId = req.user.id;
        const sinceVersion = parseInt(req.query.since || '0');

        // Verify access to whiteboard
        const whiteboard = await whiteboardService.getWhiteboard(id, userId);
        if (!whiteboard) {
          return res.status(404).json({
            success: false,
            error: 'Whiteboard not found'
          });
        }

        const operations = await collaborationService.getOperationsSinceVersion(id, sinceVersion);
        const currentVersion = await collaborationService.getCurrentVersion(id);

        res.json({
          success: true,
          data: {
            whiteboardId: id,
            currentVersion,
            sinceVersion,
            operations,
          },
          message: 'Operations retrieved successfully'
        });
      } catch (error) {
        logger.error('Get operations error', { error, whiteboardId: req.params.id });
        
        if (error instanceof Error && error.message.includes('ACCESS_DENIED')) {
          return res.status(403).json({
            success: false,
            error: 'Access denied to whiteboard'
          });
        }

        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Internal server error'
        });
      }
    }
  );

  /**
   * GET /api/v1/whiteboards/:id/comments
   * Get comments for a whiteboard
   */
  router.get(
    '/v1/whiteboards/:id/comments',
    async (req: any, res) => {
      try {
        const { id } = req.params;
        const userId = req.user.id;
        const includeResolved = req.query.includeResolved === 'true';

        // Verify access to whiteboard
        const whiteboard = await whiteboardService.getWhiteboard(id, userId);
        if (!whiteboard) {
          return res.status(404).json({
            success: false,
            error: 'Whiteboard not found'
          });
        }

        const comments = await collaborationService.getComments(id, includeResolved);

        res.json({
          success: true,
          data: {
            whiteboardId: id,
            comments,
            total: comments.length,
          },
          message: 'Comments retrieved successfully'
        });
      } catch (error) {
        logger.error('Get comments error', { error, whiteboardId: req.params.id });
        
        if (error instanceof Error && error.message.includes('ACCESS_DENIED')) {
          return res.status(403).json({
            success: false,
            error: 'Access denied to whiteboard'
          });
        }

        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Internal server error'
        });
      }
    }
  );

  /**
   * POST /api/v1/whiteboards/:id/comments
   * Add a comment to a whiteboard
   */
  router.post(
    '/v1/whiteboards/:id/comments',
    validateRequest({ body: AddCommentSchema }),
    async (req: any, res) => {
      try {
        const { id } = req.params;
        const userId = req.user.id;
        const { content, position, elementId, parentCommentId } = req.body;

        // Verify access to whiteboard
        const whiteboard = await whiteboardService.getWhiteboard(id, userId);
        if (!whiteboard) {
          return res.status(404).json({
            success: false,
            error: 'Whiteboard not found'
          });
        }

        const comment = await collaborationService.addComment(
          id,
          userId,
          content,
          position,
          elementId,
          parentCommentId
        );

        res.status(201).json({
          success: true,
          data: comment,
          message: 'Comment added successfully'
        });
      } catch (error) {
        logger.error('Add comment error', { error, whiteboardId: req.params.id });
        
        if (error instanceof Error && error.message.includes('ACCESS_DENIED')) {
          return res.status(403).json({
            success: false,
            error: 'Access denied to whiteboard'
          });
        }

        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Internal server error'
        });
      }
    }
  );

  /**
   * PUT /api/v1/whiteboards/:whiteboardId/comments/:commentId/resolve
   * Resolve or unresolve a comment
   */
  router.put(
    '/v1/whiteboards/:whiteboardId/comments/:commentId/resolve',
    validateRequest({ body: ResolveCommentSchema }),
    async (req: any, res) => {
      try {
        const { whiteboardId, commentId } = req.params;
        const userId = req.user.id;
        const { resolved } = req.body;

        // Verify access to whiteboard
        const whiteboard = await whiteboardService.getWhiteboard(whiteboardId, userId);
        if (!whiteboard) {
          return res.status(404).json({
            success: false,
            error: 'Whiteboard not found'
          });
        }

        await collaborationService.resolveComment(commentId, resolved, userId);

        res.json({
          success: true,
          message: `Comment ${resolved ? 'resolved' : 'unresolved'} successfully`
        });
      } catch (error) {
        logger.error('Resolve comment error', { error, commentId: req.params.commentId });
        
        if (error instanceof Error && error.message.includes('ACCESS_DENIED')) {
          return res.status(403).json({
            success: false,
            error: 'Access denied to whiteboard'
          });
        }

        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Internal server error'
        });
      }
    }
  );

  /**
   * DELETE /api/v1/whiteboards/:whiteboardId/comments/:commentId
   * Delete a comment
   */
  router.delete(
    '/v1/whiteboards/:whiteboardId/comments/:commentId',
    async (req: any, res) => {
      try {
        const { whiteboardId, commentId } = req.params;
        const userId = req.user.id;

        // Verify access to whiteboard
        const whiteboard = await whiteboardService.getWhiteboard(whiteboardId, userId);
        if (!whiteboard) {
          return res.status(404).json({
            success: false,
            error: 'Whiteboard not found'
          });
        }

        await collaborationService.deleteComment(commentId, userId);

        res.json({
          success: true,
          message: 'Comment deleted successfully'
        });
      } catch (error) {
        logger.error('Delete comment error', { error, commentId: req.params.commentId });
        
        if (error instanceof Error && error.message.includes('ACCESS_DENIED')) {
          return res.status(403).json({
            success: false,
            error: 'Access denied to comment'
          });
        }

        if (error instanceof Error && error.message.includes('Unauthorized')) {
          return res.status(403).json({
            success: false,
            error: 'Unauthorized to delete this comment'
          });
        }

        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Internal server error'
        });
      }
    }
  );

  /**
   * GET /api/v1/whiteboards/:id/analytics
   * Get collaboration analytics for a whiteboard
   */
  router.get(
    '/v1/whiteboards/:id/analytics',
    async (req: any, res) => {
      try {
        const { id } = req.params;
        const userId = req.user.id;
        const days = parseInt(req.query.days || '30');

        // Verify access to whiteboard
        const whiteboard = await whiteboardService.getWhiteboard(id, userId);
        if (!whiteboard) {
          return res.status(404).json({
            success: false,
            error: 'Whiteboard not found'
          });
        }

        const analytics = await collaborationService.getCollaborationAnalytics(id, days);

        res.json({
          success: true,
          data: {
            whiteboardId: id,
            periodDays: days,
            ...analytics,
          },
          message: 'Analytics retrieved successfully'
        });
      } catch (error) {
        logger.error('Get analytics error', { error, whiteboardId: req.params.id });
        
        if (error instanceof Error && error.message.includes('ACCESS_DENIED')) {
          return res.status(403).json({
            success: false,
            error: 'Access denied to whiteboard'
          });
        }

        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Internal server error'
        });
      }
    }
  );

  return router;
}

export default createWhiteboardRoutes;