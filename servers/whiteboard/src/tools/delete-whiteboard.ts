import { z } from 'zod';
import { ToolModule, ToolResult, createErrorResult } from '@tylercoles/mcp-server';
import { WhiteboardService } from '../services/whiteboard-service.js';
import { Logger } from '../utils/logger.js';

const DeleteWhiteboardSchema = z.object({
  whiteboardId: z.string().uuid(),
  userId: z.string().uuid(),
});

/**
 * Delete whiteboard MCP tool
 */
export function deleteWhiteboardTool(service: WhiteboardService, logger: Logger): ToolModule {
  return {
    name: 'delete_whiteboard',
    config: {
      title: 'Delete Whiteboard',
      description: 'Delete a whiteboard (soft delete)',
      inputSchema: {
        type: 'object',
        properties: {
          whiteboardId: {
            type: 'string',
            format: 'uuid',
            description: 'The ID of the whiteboard to delete'
          },
          userId: {
            type: 'string',
            format: 'uuid',
            description: 'The ID of the user deleting the whiteboard'
          }
        },
        required: ['whiteboardId', 'userId']
      },
    },
    
    handler: async (args: any): Promise<ToolResult> => {
      try {
        // Validate input
        const validatedArgs = DeleteWhiteboardSchema.parse(args);
        
        // Delete whiteboard
        await service.deleteWhiteboard(
          validatedArgs.whiteboardId,
          validatedArgs.userId
        );

        return {
          content: [
            {
              type: 'text',
              text: `✅ Successfully deleted whiteboard: ${validatedArgs.whiteboardId}`,
            },
          ],
        };
      } catch (error) {
        logger.error('Delete whiteboard tool error', { error, args });
        return createErrorResult(error);
      }
    },
  };
}