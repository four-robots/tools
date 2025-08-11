import { z } from 'zod';
import { ToolModule, ToolResult, createErrorResult } from '@tylercoles/mcp-server';
import { ElementService } from '../services/element-service.js';
import { Logger } from '../utils/logger.js';
import { UpdateElementRequest } from '@shared/types/whiteboard.js';

const UpdateElementSchema = z.object({
  elementId: z.string().uuid(),
  userId: z.string().uuid(),
  elementData: z.record(z.any()).optional(),
  styleData: z.record(z.any()).optional(),
  layerIndex: z.number().optional(),
  locked: z.boolean().optional(),
  visible: z.boolean().optional(),
  parentId: z.string().uuid().optional(),
});

/**
 * Update element MCP tool
 */
export function updateElementTool(service: ElementService, logger: Logger): ToolModule {
  return {
    name: 'update_element',
    config: {
      title: 'Update Element',
      description: 'Update an existing whiteboard element',
      inputSchema: {
      type: 'object',
      properties: {
        elementId: {
          type: 'string',
          format: 'uuid',
          description: 'The ID of the element to update'
        },
        userId: {
          type: 'string',
          format: 'uuid',
          description: 'The ID of the user updating the element'
        },
        elementData: {
          type: 'object',
          description: 'Updated element-specific data'
        },
        styleData: {
          type: 'object',
          description: 'Updated styling information'
        },
        layerIndex: {
          type: 'number',
          description: 'Updated z-index layer for the element'
        },
        locked: {
          type: 'boolean',
          description: 'Whether the element should be locked from editing'
        },
        visible: {
          type: 'boolean',
          description: 'Whether the element should be visible'
        },
        parentId: {
          type: 'string',
          format: 'uuid',
          description: 'Updated parent element ID for grouping'
        }
      },
      required: ['elementId', 'userId']
      },
    },
    
    handler: async (args: any): Promise<ToolResult> => {
      try {
        // Validate input
        const validatedArgs = UpdateElementSchema.parse(args);
        
        // Create update request
        const request: UpdateElementRequest = {
          elementData: validatedArgs.elementData,
          styleData: validatedArgs.styleData,
          layerIndex: validatedArgs.layerIndex,
          locked: validatedArgs.locked,
          visible: validatedArgs.visible,
          parentId: validatedArgs.parentId,
        };

        // Update element
        const element = await service.updateElement(
          validatedArgs.elementId,
          validatedArgs.userId,
          request
        );

        return {
          content: [
            {
              type: 'text',
              text: `✅ Successfully updated ${element.elementType} element\n\n` +
                   `• Element ID: ${element.id}\n` +
                   `• Type: ${element.elementType}\n` +
                   `• Layer: ${element.layerIndex}\n` +
                   `• Locked: ${element.locked ? 'Yes' : 'No'}\n` +
                   `• Visible: ${element.visible ? 'Yes' : 'No'}\n` +
                   `• Updated: ${new Date(element.updatedAt).toLocaleString()}`,
            },
          ],
          structuredContent: { element },
        };
      } catch (error) {
        logger.error('Update element tool error', { error, args });
        return createErrorResult(error);
      }
    },
  };
}