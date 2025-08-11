import { z } from 'zod';
import { ToolModule, ToolResult, createErrorResult } from '@tylercoles/mcp-server';
import { WhiteboardService } from '../services/whiteboard-service.js';
import { Logger } from '../utils/logger.js';
import { UpdateWhiteboardRequest } from '@shared/types/whiteboard.js';

const UpdateWhiteboardSchema = z.object({
  whiteboardId: z.string().uuid(),
  userId: z.string().uuid(),
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  visibility: z.enum(['workspace', 'members', 'public']).optional(),
  settings: z.record(z.any()).optional(),
  canvasData: z.record(z.any()).optional(),
});

/**
 * Update whiteboard MCP tool
 */
export function updateWhiteboardTool(service: WhiteboardService, logger: Logger): ToolModule {
  return {
    name: 'update_whiteboard',
    config: {
      title: 'Update Whiteboard',
      description: 'Update an existing whiteboard',
      inputSchema: {
      type: 'object',
      properties: {
        whiteboardId: {
          type: 'string',
          format: 'uuid',
          description: 'The ID of the whiteboard to update'
        },
        userId: {
          type: 'string',
          format: 'uuid',
          description: 'The ID of the user updating the whiteboard'
        },
        name: {
          type: 'string',
          minLength: 1,
          maxLength: 255,
          description: 'New name for the whiteboard'
        },
        description: {
          type: 'string',
          description: 'New description for the whiteboard'
        },
        visibility: {
          type: 'string',
          enum: ['workspace', 'members', 'public'],
          description: 'New visibility level for the whiteboard'
        },
        settings: {
          type: 'object',
          description: 'Updated whiteboard settings'
        },
        canvasData: {
          type: 'object',
          description: 'Updated canvas configuration'
        }
      },
      required: ['whiteboardId', 'userId']
      },
    },
    
    handler: async (args: any): Promise<ToolResult> => {
      try {
        // Validate input
        const validatedArgs = UpdateWhiteboardSchema.parse(args);
        
        // Create update request
        const request: UpdateWhiteboardRequest = {
          name: validatedArgs.name,
          description: validatedArgs.description,
          visibility: validatedArgs.visibility,
          settings: validatedArgs.settings,
          canvasData: validatedArgs.canvasData,
        };

        // Update whiteboard
        const whiteboard = await service.updateWhiteboard(
          validatedArgs.whiteboardId,
          validatedArgs.userId,
          request
        );

        return {
          content: [
            {
              type: 'text',
              text: `✅ Successfully updated whiteboard: **${whiteboard.name}**`,
            },
          ],
          structuredContent: { whiteboard },
        };
      } catch (error) {
        logger.error('Update whiteboard tool error', { error, args });
        return createErrorResult(error);
      }
    },
  };
}