import { MCPServer } from '@tylercoles/mcp-server';
import { z } from 'zod';
import { WikiService } from '../../services/WikiService.js';

export function registerCategoryTools(server: MCPServer, wikiService: WikiService): void {
  // Get all categories
  server.registerTool({
    name: 'get_categories',
    config: {
      title: 'Get Categories',
      description: 'Retrieve all wiki categories',
      inputSchema: z.object({}),
    },
    handler: async (args: any) => {
      try {
        const categories = await wikiService.getCategories();
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              categories,
              total: categories.length,
              generated_at: new Date().toISOString(),
            }, null, 2),
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error retrieving categories: ${error instanceof Error ? error.message : String(error)}`,
          }],
          isError: true,
        };
      }
    }
  });

  // Create category
  server.registerTool({
    name: 'create_category',
    config: {
      title: 'Create Category',
      description: 'Create a new wiki category',
      inputSchema: z.object({
        name: z.string().describe('Name of the category'),
        description: z.string().optional().describe('Description of the category'),
        color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().describe('Color code for the category (hex format, e.g., #ff0000)'),
      }),
    },
    handler: async (args: any) => {
      try {
        const { name, description, color } = args;
        const category = await wikiService.createCategory(name, description, color);
        
        return {
          content: [{
            type: 'text',
            text: `Successfully created category "${category.name}" with ID ${category.id}`,
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error creating category: ${error instanceof Error ? error.message : String(error)}`,
          }],
          isError: true,
        };
      }
    }
  });
}