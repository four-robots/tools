import { MCPServer } from '@tylercoles/mcp-server';
import { z } from 'zod';
import { WikiService } from '../../services/WikiService.js';

export function registerCommentTools(server: MCPServer, wikiService: WikiService): void {
  // Get comments for a page
  server.registerTool({
    name: 'get_page_comments',
    config: {
      title: 'Get Page Comments',
      description: 'Retrieve all comments for a specific wiki page',
      inputSchema: z.object({
        page_id: z.number().describe('ID of the page to get comments for'),
      }),
    },
    handler: async (args: any) => {
      try {
        const { page_id } = args;
        const comments = await wikiService.getPageComments(page_id);
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              page_id,
              comments,
              total: comments.length,
              generated_at: new Date().toISOString(),
            }, null, 2),
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error retrieving comments: ${error instanceof Error ? error.message : String(error)}`,
          }],
          isError: true,
        };
      }
    }
  });

  // Add comment to a page
  server.registerTool({
    name: 'add_comment',
    config: {
      title: 'Add Comment',
      description: 'Add a comment to a wiki page',
      inputSchema: z.object({
        page_id: z.number().describe('ID of the page to comment on'),
        content: z.string().describe('Content of the comment'),
        author: z.string().optional().describe('Author of the comment'),
        parent_id: z.number().optional().describe('ID of parent comment for replies'),
      }),
    },
    handler: async (args: any) => {
      try {
        const { page_id, content, author, parent_id } = args;
        const comment = await wikiService.addComment(page_id, content, author, parent_id);
        
        return {
          content: [{
            type: 'text',
            text: `Successfully added comment with ID ${comment.id} to page ${page_id}`,
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error adding comment: ${error instanceof Error ? error.message : String(error)}`,
          }],
          isError: true,
        };
      }
    }
  });

  // Delete comment
  server.registerTool({
    name: 'delete_comment',
    config: {
      title: 'Delete Comment',
      description: 'Delete a comment from a wiki page',
      inputSchema: z.object({
        comment_id: z.number().describe('ID of the comment to delete'),
      }),
    },
    handler: async (args: any) => {
      try {
        const { comment_id } = args;
        await wikiService.deleteComment(comment_id);
        
        return {
          content: [{
            type: 'text',
            text: `Successfully deleted comment with ID ${comment_id}`,
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error deleting comment: ${error instanceof Error ? error.message : String(error)}`,
          }],
          isError: true,
        };
      }
    }
  });
}