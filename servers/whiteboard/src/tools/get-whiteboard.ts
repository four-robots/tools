import { z } from 'zod';
import { ToolModule, ToolResult, createErrorResult } from '@tylercoles/mcp-server';
import { WhiteboardService } from '../services/whiteboard-service.js';
import { Logger } from '../utils/logger.js';

const GetWhiteboardSchema = z.object({
  whiteboardId: z.string().uuid(),
  includeElements: z.boolean().optional().default(false),
});

/**
 * Get whiteboard MCP tool
 */
export function getWhiteboardTool(service: WhiteboardService, logger: Logger): ToolModule {
  return {
    name: 'get_whiteboard',
    config: {
      title: 'Get Whiteboard',
      description: 'Retrieve a whiteboard by ID with optional elements',
      inputSchema: {
        type: 'object',
        properties: {
          whiteboardId: {
            type: 'string',
            format: 'uuid',
            description: 'The ID of the whiteboard to retrieve'
          },
          includeElements: {
            type: 'boolean',
            default: false,
            description: 'Whether to include all whiteboard elements in the response'
          }
        },
        required: ['whiteboardId']
      },
    },
    
    handler: async (args: any): Promise<ToolResult> => {
      try {
        // Validate input
        const validatedArgs = GetWhiteboardSchema.parse(args);
        
        // Get whiteboard
        let whiteboard: any;
        
        if (validatedArgs.includeElements) {
          whiteboard = await service.getWhiteboardWithElements(validatedArgs.whiteboardId);
        } else {
          whiteboard = await service.getWhiteboard(validatedArgs.whiteboardId);
        }

        if (!whiteboard) {
          return {
            content: [
              {
                type: 'text',
                text: `❌ Whiteboard not found: ${validatedArgs.whiteboardId}`,
              },
            ],
            isError: true,
          };
        }

        const elementCount = whiteboard.elements ? whiteboard.elements.length : 'N/A';
        
        return {
          content: [
            {
              type: 'text',
              text: `📋 **${whiteboard.name}**\n\n` +
                   `• ID: ${whiteboard.id}\n` +
                   `• Description: ${whiteboard.description || 'No description'}\n` +
                   `• Workspace: ${whiteboard.workspaceId}\n` +
                   `• Visibility: ${whiteboard.visibility}\n` +
                   `• Status: ${whiteboard.status}\n` +
                   `• Elements: ${elementCount}\n` +
                   `• Created: ${new Date(whiteboard.createdAt).toLocaleString()}\n` +
                   `• Last Modified: ${new Date(whiteboard.updatedAt).toLocaleString()}`,
            },
          ],
          structuredContent: { whiteboard },
        };
      } catch (error) {
        logger.error('Get whiteboard tool error', { error, args });
        return createErrorResult(error);
      }
    },
  };
}