import { z } from 'zod';
import { ToolModule, ToolResult, createErrorResult } from '@tylercoles/mcp-server';
import { WhiteboardService } from '../services/whiteboard-service.js';
import { Logger } from '../utils/logger.js';
import { CreateWhiteboardRequest } from '@shared/types/whiteboard.js';

const CreateWhiteboardSchema = z.object({
  workspaceId: z.string().uuid(),
  userId: z.string().uuid(),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  templateId: z.string().uuid().optional(),
  visibility: z.enum(['workspace', 'members', 'public']).optional(),
  settings: z.record(z.any()).optional(),
  canvasData: z.record(z.any()).optional(),
});

/**
 * Create whiteboard MCP tool
 */
export function createWhiteboardTool(service: WhiteboardService, logger: Logger): ToolModule {
  return {
    name: 'create_whiteboard',
    config: {
      title: 'Create Whiteboard',
      description: 'Create a new collaborative whiteboard in a workspace',
      inputSchema: {
        type: 'object',
        properties: {
          workspaceId: {
            type: 'string',
            format: 'uuid',
            description: 'The workspace ID where the whiteboard will be created'
          },
          userId: {
            type: 'string',
            format: 'uuid',
            description: 'The ID of the user creating the whiteboard'
          },
          name: {
            type: 'string',
            minLength: 1,
            maxLength: 255,
            description: 'Name of the whiteboard'
          },
          description: {
            type: 'string',
            description: 'Optional description of the whiteboard'
          },
          templateId: {
            type: 'string',
            format: 'uuid',
            description: 'Optional template ID to initialize the whiteboard'
          },
          visibility: {
            type: 'string',
            enum: ['workspace', 'members', 'public'],
            description: 'Visibility level of the whiteboard'
          },
          settings: {
            type: 'object',
            description: 'Whiteboard settings and preferences'
          },
          canvasData: {
            type: 'object',
            description: 'Initial canvas configuration'
          }
        },
        required: ['workspaceId', 'userId', 'name']
      },
    },
    
    handler: async (args: any): Promise<ToolResult> => {
      try {
        // Validate input
        const validatedArgs = CreateWhiteboardSchema.parse(args);
        
        // Create whiteboard request
        const request: CreateWhiteboardRequest = {
          name: validatedArgs.name,
          description: validatedArgs.description,
          templateId: validatedArgs.templateId,
          visibility: validatedArgs.visibility,
          settings: validatedArgs.settings,
          canvasData: validatedArgs.canvasData,
        };

        // Create whiteboard
        const whiteboard = await service.createWhiteboard(
          validatedArgs.workspaceId,
          validatedArgs.userId,
          request
        );

        return {
          content: [
            {
              type: 'text',
              text: `✅ Successfully created whiteboard: **${whiteboard.name}**\n\n` +
                   `• ID: ${whiteboard.id}\n` +
                   `• Workspace: ${whiteboard.workspaceId}\n` +
                   `• Visibility: ${whiteboard.visibility}\n` +
                   `• Created: ${new Date(whiteboard.createdAt).toLocaleString()}`,
            },
          ],
          structuredContent: { whiteboard },
        };
      } catch (error) {
        logger.error('Create whiteboard tool error', { error, args });
        return createErrorResult(error);
      }
    },
  };
}