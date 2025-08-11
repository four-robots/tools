import { z } from 'zod';
import { ElementService } from '../services/element-service.js';
import { Logger } from '../utils/logger.js';

const DeleteElementSchema = z.object({
  elementId: z.string().uuid(),
  userId: z.string().uuid(),
});

/**
 * Delete element MCP tool
 */
export function deleteElementTool(service: ElementService, logger: Logger) {
  return {
    name: 'delete_element',
    description: 'Delete an element from a whiteboard (soft delete)',
    inputSchema: {
      type: 'object',
      properties: {
        elementId: {
          type: 'string',
          format: 'uuid',
          description: 'The ID of the element to delete'
        },
        userId: {
          type: 'string',
          format: 'uuid',
          description: 'The ID of the user deleting the element'
        }
      },
      required: ['elementId', 'userId']
    },
    
    handler: async (args: any) => {
      try {
        // Validate input
        const validatedArgs = DeleteElementSchema.parse(args);
        
        // Delete element
        await service.deleteElement(
          validatedArgs.elementId,
          validatedArgs.userId
        );

        return {
          content: [
            {
              type: 'text',
              text: `Successfully deleted element: ${validatedArgs.elementId}`,
            },
          ],
        };
      } catch (error) {
        logger.error('Delete element tool error', { error, args });
        
        return {
          content: [
            {
              type: 'text',
              text: `Error deleting element: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
          isError: true,
        };
      }
    },
  };
}