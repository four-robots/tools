import { z } from 'zod';
import { ToolModule, ToolResult, createErrorResult } from '@tylercoles/mcp-server';
import { WhiteboardService } from '../services/whiteboard-service.js';
import { Logger } from '../utils/logger.js';

const ListWhiteboardsSchema = z.object({
  workspaceId: z.string().uuid(),
  limit: z.number().min(1).max(100).optional().default(20),
  offset: z.number().min(0).optional().default(0),
  search: z.string().optional(),
  status: z.array(z.enum(['active', 'archived', 'deleted'])).optional(),
  visibility: z.array(z.enum(['workspace', 'members', 'public'])).optional(),
  sortBy: z.enum(['name', 'createdAt', 'updatedAt']).optional().default('updatedAt'),
  sortDirection: z.enum(['asc', 'desc']).optional().default('desc'),
});

/**
 * List whiteboards MCP tool
 */
export function listWhiteboardsTool(service: WhiteboardService, logger: Logger): ToolModule {
  return {
    name: 'list_whiteboards',
    config: {
      title: 'List Whiteboards',
      description: 'List whiteboards in a workspace with filtering and pagination',
      inputSchema: {
      type: 'object',
      properties: {
        workspaceId: {
          type: 'string',
          format: 'uuid',
          description: 'The workspace ID to list whiteboards from'
        },
        limit: {
          type: 'number',
          minimum: 1,
          maximum: 100,
          default: 20,
          description: 'Maximum number of whiteboards to return'
        },
        offset: {
          type: 'number',
          minimum: 0,
          default: 0,
          description: 'Number of whiteboards to skip'
        },
        search: {
          type: 'string',
          description: 'Search term to filter whiteboards by name or description'
        },
        status: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['active', 'archived', 'deleted']
          },
          description: 'Filter by whiteboard status'
        },
        visibility: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['workspace', 'members', 'public']
          },
          description: 'Filter by whiteboard visibility'
        },
        sortBy: {
          type: 'string',
          enum: ['name', 'createdAt', 'updatedAt'],
          default: 'updatedAt',
          description: 'Field to sort by'
        },
        sortDirection: {
          type: 'string',
          enum: ['asc', 'desc'],
          default: 'desc',
          description: 'Sort direction'
        }
      },
      required: ['workspaceId']
      },
    },
    
    handler: async (args: any): Promise<ToolResult> => {
      try {
        // Validate input
        const validatedArgs = ListWhiteboardsSchema.parse(args);
        
        // Build filters
        const filters = {
          search: validatedArgs.search,
          status: validatedArgs.status,
          visibility: validatedArgs.visibility,
        };

        // Build sort
        const sort = {
          field: validatedArgs.sortBy,
          direction: validatedArgs.sortDirection,
        };

        // List whiteboards
        const result = await service.listWhiteboards(
          validatedArgs.workspaceId,
          filters,
          sort as any,
          validatedArgs.limit,
          validatedArgs.offset
        );

        const summary = `📋 Found ${result.total} whiteboards (showing ${result.items.length})\n\n`;
        const whiteboardsList = result.items.map(wb => 
          `• **${wb.name}** (${wb.id})\n  Status: ${wb.status}, Visibility: ${wb.visibility}\n  Created: ${new Date(wb.createdAt).toLocaleString()}\n  Updated: ${new Date(wb.updatedAt).toLocaleString()}`
        ).join('\n\n');

        return {
          content: [
            {
              type: 'text',
              text: summary + (whiteboardsList || 'No whiteboards found'),
            },
          ],
          structuredContent: { result },
        };
      } catch (error) {
        logger.error('List whiteboards tool error', { error, args });
        return createErrorResult(error);
      }
    },
  };
}