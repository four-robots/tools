import { z } from 'zod';
import { ToolModule, ToolResult, createErrorResult } from '@tylercoles/mcp-server';
import { ElementService } from '../services/element-service.js';
import { Logger } from '../utils/logger.js';
import { CreateElementRequest } from '@shared/types/whiteboard.js';

const AddElementSchema = z.object({
  whiteboardId: z.string().uuid(),
  userId: z.string().uuid(),
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

/**
 * Add element MCP tool
 */
export function addElementTool(service: ElementService, logger: Logger): ToolModule {
  return {
    name: 'add_element',
    config: {
      title: 'Add Element',
      description: 'Add a new element to a whiteboard',
      inputSchema: {
      type: 'object',
      properties: {
        whiteboardId: {
          type: 'string',
          format: 'uuid',
          description: 'The ID of the whiteboard to add the element to'
        },
        userId: {
          type: 'string',
          format: 'uuid',
          description: 'The ID of the user adding the element'
        },
        elementType: {
          type: 'string',
          enum: [
            'rectangle', 'ellipse', 'triangle', 'line', 'arrow', 'freehand',
            'text', 'sticky_note', 'image', 'link', 'frame', 'group',
            'connector', 'shape', 'chart', 'table'
          ],
          description: 'Type of element to add'
        },
        elementData: {
          type: 'object',
          description: 'Element-specific data (position, size, content, etc.)'
        },
        styleData: {
          type: 'object',
          description: 'Styling information (colors, fonts, borders, etc.)'
        },
        parentId: {
          type: 'string',
          format: 'uuid',
          description: 'Parent element ID for grouped elements'
        },
        layerIndex: {
          type: 'number',
          description: 'Z-index layer for the element'
        }
      },
      required: ['whiteboardId', 'userId', 'elementType', 'elementData']
      },
    },
    
    handler: async (args: any): Promise<ToolResult> => {
      try {
        // Validate input
        const validatedArgs = AddElementSchema.parse(args);
        
        // Create element request
        const request: CreateElementRequest = {
          elementType: validatedArgs.elementType,
          elementData: validatedArgs.elementData,
          styleData: validatedArgs.styleData,
          parentId: validatedArgs.parentId,
          layerIndex: validatedArgs.layerIndex,
        };

        // Add element
        const element = await service.createElement(
          validatedArgs.whiteboardId,
          validatedArgs.userId,
          request
        );

        return {
          content: [
            {
              type: 'text',
              text: `✅ Successfully added ${element.elementType} element to whiteboard\n\n` +
                   `• Element ID: ${element.id}\n` +
                   `• Type: ${element.elementType}\n` +
                   `• Layer: ${element.layerIndex}\n` +
                   `• Created: ${new Date(element.createdAt).toLocaleString()}`,
            },
          ],
          structuredContent: { element },
        };
      } catch (error) {
        logger.error('Add element tool error', { error, args });
        return createErrorResult(error);
      }
    },
  };
}