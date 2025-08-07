import { MCPServer } from '@tylercoles/mcp-server';
import { z } from 'zod';
import { WikiService } from '../../services/WikiService.js';

export function registerSearchTools(server: MCPServer, wikiService: WikiService): void {
  // Search pages
  server.registerTool({
    name: 'search_pages',
    config: {
      title: 'Search Pages',
      description: 'Search wiki pages by content, title, or metadata',
      inputSchema: z.object({
        query: z.string().describe('Search query text'),
        category_id: z.number().optional().describe('Filter by category ID'),
        tag_names: z.array(z.string()).optional().describe('Filter by tag names'),
        include_drafts: z.boolean().optional().default(false).describe('Include unpublished draft pages in results'),
        limit: z.number().optional().default(50).describe('Maximum number of results to return'),
        offset: z.number().optional().default(0).describe('Number of results to skip (for pagination)'),
      }),
    },
    handler: async (args: any) => {
      try {
        const searchResults = await wikiService.searchPages(args);
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              query: args.query,
              total_results: searchResults.length,
              results: searchResults,
              generated_at: new Date().toISOString(),
            }, null, 2),
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error searching pages: ${error instanceof Error ? error.message : String(error)}`,
          }],
          isError: true,
        };
      }
    }
  });

  // Get wiki statistics
  server.registerTool({
    name: 'get_wiki_stats',
    config: {
      title: 'Get Wiki Statistics',
      description: 'Get comprehensive statistics about the wiki',
      inputSchema: z.object({}),
    },
    handler: async (args: any) => {
      try {
        const stats = await wikiService.getStats();
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              ...stats,
              generated_at: new Date().toISOString(),
            }, null, 2),
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error retrieving statistics: ${error instanceof Error ? error.message : String(error)}`,
          }],
          isError: true,
        };
      }
    }
  });
}