import { MCPTool, ToolHandler, ToolResult } from '@tylercoles/mcp-server';
import { Logger } from '../../utils/logger.js';
import { WhiteboardSearchService } from '@mcp-tools/core/services/whiteboard/whiteboard-search-service';
import { DatabaseConnection } from '../../database/index.js';
import { z } from 'zod';

// Search schemas
const AdvancedSearchSchema = z.object({
  workspace_id: z.string().uuid().describe('Workspace ID to search within'),
  search_query: z.object({
    query: z.string().min(1).describe('Search query text'),
    syntax_type: z.enum(['natural', 'boolean', 'field_specific', 'regex']).optional().describe('Search syntax type'),
    search_fields: z.array(z.enum(['title', 'description', 'content', 'comments', 'elements', 'tags', 'all'])).optional().describe('Fields to search in'),
    created_by: z.array(z.string().uuid()).optional().describe('Filter by creators'),
    modified_by: z.array(z.string().uuid()).optional().describe('Filter by last modifier'),
    date_range: z.object({
      field: z.enum(['created', 'modified', 'accessed']),
      start: z.string().datetime().optional(),
      end: z.string().datetime().optional(),
    }).optional().describe('Date range filter'),
    element_types: z.array(z.string()).optional().describe('Filter by element types'),
    has_elements: z.boolean().optional().describe('Filter by presence of elements'),
    has_comments: z.boolean().optional().describe('Filter by presence of comments'),
    include_tags: z.array(z.string()).optional().describe('Include whiteboards with these tags'),
    exclude_tags: z.array(z.string()).optional().describe('Exclude whiteboards with these tags'),
    visibility: z.array(z.enum(['workspace', 'members', 'public'])).optional().describe('Filter by visibility'),
    activity_level: z.enum(['dormant', 'low', 'medium', 'high']).optional().describe('Filter by activity level'),
    is_collaborating: z.boolean().optional().describe('Filter by current collaboration status'),
    is_template: z.boolean().optional().describe('Filter templates only'),
    template_category: z.string().optional().describe('Filter by template category'),
    include_previews: z.boolean().optional().describe('Include content previews'),
    include_highlights: z.boolean().optional().describe('Include search highlights'),
    fuzzy_match: z.boolean().optional().describe('Enable fuzzy matching'),
    max_preview_length: z.number().min(50).max(500).optional().describe('Maximum preview length'),
  }).describe('Advanced search parameters'),
  sort: z.object({
    field: z.enum(['relevance', 'date_created', 'date_modified', 'activity_score', 'collaboration_count', 'element_count', 'comment_count']),
    direction: z.enum(['asc', 'desc']),
  }).optional().describe('Sort configuration'),
  limit: z.number().min(1).max(100).optional().describe('Maximum number of results'),
  offset: z.number().min(0).optional().describe('Result offset for pagination'),
}).describe('Advanced search request');

const FullTextSearchSchema = z.object({
  workspace_id: z.string().uuid().describe('Workspace ID to search within'),
  query: z.string().min(1).describe('Search query text'),
  filters: z.record(z.any()).optional().describe('Additional filters'),
  limit: z.number().min(1).max(100).optional().describe('Maximum number of results'),
  offset: z.number().min(0).optional().describe('Result offset for pagination'),
}).describe('Full-text search request');

const SearchElementsSchema = z.object({
  whiteboard_id: z.string().uuid().describe('Whiteboard ID to search within'),
  query: z.string().min(1).describe('Search query text'),
  element_types: z.array(z.string()).optional().describe('Filter by element types'),
  limit: z.number().min(1).max(100).optional().describe('Maximum number of results'),
  offset: z.number().min(0).optional().describe('Result offset for pagination'),
}).describe('Element search request');

const SearchCommentsSchema = z.object({
  whiteboard_id: z.string().uuid().describe('Whiteboard ID to search within'),
  query: z.string().min(1).describe('Search query text'),
  include_resolved: z.boolean().optional().describe('Include resolved comments'),
  limit: z.number().min(1).max(100).optional().describe('Maximum number of results'),
  offset: z.number().min(0).optional().describe('Result offset for pagination'),
}).describe('Comment search request');

const SearchSuggestionsSchema = z.object({
  workspace_id: z.string().uuid().describe('Workspace ID to search within'),
  partial_query: z.string().min(2).describe('Partial search query for suggestions'),
  limit: z.number().min(1).max(20).optional().describe('Maximum number of suggestions'),
}).describe('Search suggestions request');

const UnifiedSearchSchema = z.object({
  workspace_id: z.string().uuid().describe('Workspace ID to search within'),
  search_request: z.object({
    query: z.string().min(1).describe('Search query text'),
    services: z.array(z.string()).optional().describe('Services to search in'),
    filters: z.record(z.any()).optional().describe('Service-specific filters'),
    limit: z.number().min(1).max(50).optional().describe('Maximum number of results'),
    include_content: z.boolean().optional().describe('Include full content in results'),
  }).describe('Unified search parameters'),
}).describe('Unified cross-service search request');

/**
 * Advanced search tool for comprehensive whiteboard search
 */
export const createAdvancedSearchTool = (
  db: DatabaseConnection,
  logger: Logger
): MCPTool => ({
  name: 'whiteboard_advanced_search',
  description: 'Perform advanced search across whiteboards with comprehensive filtering and highlighting',
  inputSchema: AdvancedSearchSchema,
  handler: async (args: z.infer<typeof AdvancedSearchSchema>): Promise<ToolResult> => {
    try {
      const searchService = new WhiteboardSearchService(db, logger);
      const results = await searchService.advancedSearch(
        args.workspace_id,
        'system', // Default system user for MCP
        args.search_query,
        args.sort,
        args.limit || 20,
        args.offset || 0
      );

      return {
        content: [
          {
            type: 'text',
            text: `# Advanced Search Results\n\n**Query:** "${args.search_query.query}"\n**Results:** ${results.total} found (${results.searchMetadata.executionTimeMs}ms)\n\n## Results:\n\n${results.items.map((item, index) => `${index + 1}. **${item.title}** (${item.type})\n   - Relevance: ${Math.round(item.relevanceScore * 100)}%\n   - ${item.description || 'No description'}\n   - Created: ${new Date(item.createdAt).toLocaleDateString()}\n   - Modified: ${new Date(item.updatedAt).toLocaleDateString()}\n   ${item.highlights.length > 0 ? `   - Highlights: ${item.highlights.map(h => h.text).join(', ')}\n` : ''}`).join('\n')}\n\n**Search Metadata:**\n- Execution Time: ${results.searchMetadata.executionTimeMs}ms\n- Total Matches: ${results.searchMetadata.totalMatches}\n- Syntax Type: ${results.searchMetadata.syntaxType}\n- Suggestions: ${results.searchMetadata.suggestions.join(', ') || 'None'}`,
          },
        ],
      };
    } catch (error) {
      logger.error('Advanced search failed', { error, args });
      return {
        content: [
          {
            type: 'text',
            text: `❌ Advanced search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  },
});

/**
 * Full-text search tool for simple text-based search
 */
export const createFullTextSearchTool = (
  db: DatabaseConnection,
  logger: Logger
): MCPTool => ({
  name: 'whiteboard_fulltext_search',
  description: 'Perform full-text search across whiteboard content',
  inputSchema: FullTextSearchSchema,
  handler: async (args: z.infer<typeof FullTextSearchSchema>): Promise<ToolResult> => {
    try {
      const searchService = new WhiteboardSearchService(db, logger);
      const results = await searchService.fullTextSearch(
        args.workspace_id,
        'system',
        args.query,
        args.filters,
        args.limit || 20,
        args.offset || 0
      );

      return {
        content: [
          {
            type: 'text',
            text: `# Full-Text Search Results\n\n**Query:** "${args.query}"\n**Results:** ${results.total} whiteboards found\n\n## Whiteboards:\n\n${results.items.map((item, index) => `${index + 1}. **${item.name}**\n   - ${item.description || 'No description'}\n   - Elements: ${item.elementCount}, Collaborators: ${item.collaboratorCount}, Comments: ${item.commentCount}\n   - Visibility: ${item.visibility}\n   - Last Activity: ${item.lastActivity ? new Date(item.lastActivity).toLocaleDateString() : 'None'}\n   - ${item.isCollaborating ? '👥 Active collaboration' : ''}`).join('\n')}\n\n${results.hasMore ? `**More results available** (showing ${results.limit} of ${results.total})` : ''}`,
          },
        ],
      };
    } catch (error) {
      logger.error('Full-text search failed', { error, args });
      return {
        content: [
          {
            type: 'text',
            text: `❌ Full-text search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  },
});

/**
 * Element search tool for searching within whiteboard elements
 */
export const createSearchElementsTool = (
  db: DatabaseConnection,
  logger: Logger
): MCPTool => ({
  name: 'whiteboard_search_elements',
  description: 'Search for specific elements within a whiteboard',
  inputSchema: SearchElementsSchema,
  handler: async (args: z.infer<typeof SearchElementsSchema>): Promise<ToolResult> => {
    try {
      const searchService = new WhiteboardSearchService(db, logger);
      const results = await searchService.searchElements(
        args.whiteboard_id,
        'system',
        args.query,
        args.element_types,
        args.limit || 50,
        args.offset || 0
      );

      return {
        content: [
          {
            type: 'text',
            text: `# Element Search Results\n\n**Query:** "${args.query}"\n**Whiteboard:** ${args.whiteboard_id}\n**Results:** ${results.total} elements found\n\n## Elements:\n\n${results.items.map((element, index) => `${index + 1}. **${element.elementType}** (${element.id})\n   - Layer: ${element.layerIndex}\n   - Visible: ${element.visible ? '✓' : '✗'}\n   - Locked: ${element.locked ? '🔒' : '🔓'}\n   - Created: ${new Date(element.createdAt).toLocaleDateString()}\n   - Modified: ${new Date(element.updatedAt).toLocaleDateString()}\n   - Data: ${JSON.stringify(element.elementData, null, 2).substring(0, 200)}...`).join('\n')}\n\n${results.hasMore ? `**More results available** (showing ${results.limit} of ${results.total})` : ''}`,
          },
        ],
      };
    } catch (error) {
      logger.error('Element search failed', { error, args });
      return {
        content: [
          {
            type: 'text',
            text: `❌ Element search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  },
});

/**
 * Comment search tool for searching within whiteboard comments
 */
export const createSearchCommentsTool = (
  db: DatabaseConnection,
  logger: Logger
): MCPTool => ({
  name: 'whiteboard_search_comments',
  description: 'Search for comments within a whiteboard',
  inputSchema: SearchCommentsSchema,
  handler: async (args: z.infer<typeof SearchCommentsSchema>): Promise<ToolResult> => {
    try {
      const searchService = new WhiteboardSearchService(db, logger);
      const results = await searchService.searchComments(
        args.whiteboard_id,
        'system',
        args.query,
        args.include_resolved || true,
        args.limit || 50,
        args.offset || 0
      );

      return {
        content: [
          {
            type: 'text',
            text: `# Comment Search Results\n\n**Query:** "${args.query}"\n**Whiteboard:** ${args.whiteboard_id}\n**Results:** ${results.total} comments found\n\n## Comments:\n\n${results.items.map((comment, index) => `${index + 1}. **Comment** (${comment.id})\n   - Status: ${comment.status}\n   - Priority: ${comment.priority}\n   - Resolved: ${comment.resolved ? '✅' : '❌'}\n   - Thread ID: ${comment.threadId}\n   - Created: ${new Date(comment.createdAt).toLocaleDateString()}\n   - Content: "${comment.content.substring(0, 200)}${comment.content.length > 200 ? '...' : ''}"\n   - Mentions: ${comment.mentions.length} users\n   - Tags: ${comment.tags.join(', ') || 'None'}`).join('\n')}\n\n${results.hasMore ? `**More results available** (showing ${results.limit} of ${results.total})` : ''}`,
          },
        ],
      };
    } catch (error) {
      logger.error('Comment search failed', { error, args });
      return {
        content: [
          {
            type: 'text',
            text: `❌ Comment search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  },
});

/**
 * Search suggestions tool for auto-complete functionality
 */
export const createSearchSuggestionsTool = (
  db: DatabaseConnection,
  logger: Logger
): MCPTool => ({
  name: 'whiteboard_search_suggestions',
  description: 'Get search suggestions for auto-complete',
  inputSchema: SearchSuggestionsSchema,
  handler: async (args: z.infer<typeof SearchSuggestionsSchema>): Promise<ToolResult> => {
    try {
      const searchService = new WhiteboardSearchService(db, logger);
      const suggestions = await searchService.generateSearchSuggestions(
        args.partial_query,
        args.workspace_id,
        'system',
        args.limit || 10
      );

      return {
        content: [
          {
            type: 'text',
            text: `# Search Suggestions\n\n**Partial Query:** "${args.partial_query}"\n**Suggestions:** ${suggestions.length} found\n\n## Suggestions:\n\n${suggestions.map((suggestion, index) => `${index + 1}. **${suggestion.text}** (${suggestion.type})\n   - Score: ${Math.round(suggestion.score * 100)}%\n   - Category: ${suggestion.metadata.category || 'General'}\n   - ${suggestion.metadata.usage ? `Usage: ${suggestion.metadata.usage}` : ''}`).join('\n')}\n\n${suggestions.length === 0 ? '💡 Try typing more characters for better suggestions' : ''}`,
          },
        ],
      };
    } catch (error) {
      logger.error('Search suggestions failed', { error, args });
      return {
        content: [
          {
            type: 'text',
            text: `❌ Search suggestions failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  },
});

/**
 * Unified search tool for cross-service search
 */
export const createUnifiedSearchTool = (
  db: DatabaseConnection,
  logger: Logger
): MCPTool => ({
  name: 'whiteboard_unified_search',
  description: 'Perform unified search across multiple services including whiteboards, kanban, wiki, and memory',
  inputSchema: UnifiedSearchSchema,
  handler: async (args: z.infer<typeof UnifiedSearchSchema>): Promise<ToolResult> => {
    try {
      const searchService = new WhiteboardSearchService(db, logger);
      const results = await searchService.unifiedSearch(
        args.workspace_id,
        'system',
        args.search_request
      );

      return {
        content: [
          {
            type: 'text',
            text: `# Unified Search Results\n\n**Query:** "${args.search_request.query}"\n**Services:** ${args.search_request.services?.join(', ') || 'All'}\n**Results:** ${results.results.length} items found (${results.searchMetadata.executionTimeMs}ms)\n\n## Results:\n\n${results.results.map((item, index) => `${index + 1}. **${item.title}** (${item.type})\n   - Service: ${item.service}\n   - Score: ${Math.round(item.score * 100)}%\n   - Last Modified: ${new Date(item.lastModified).toLocaleDateString()}\n   - Author: ${item.author || 'Unknown'}\n   - ${item.description || 'No description'}\n   - Tags: ${item.tags.join(', ') || 'None'}\n   ${item.content ? `   - Content: "${item.content.substring(0, 150)}${item.content.length > 150 ? '...' : ''}"\n` : ''}`).join('\n')}\n\n**Search Metadata:**\n- Execution Time: ${results.searchMetadata.executionTimeMs}ms\n- Total Sources: ${results.searchMetadata.totalSources}\n- Results Count: ${results.searchMetadata.resultsCount}`,
          },
        ],
      };
    } catch (error) {
      logger.error('Unified search failed', { error, args });
      return {
        content: [
          {
            type: 'text',
            text: `❌ Unified search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  },
});

/**
 * All search tools for registration
 */
export const searchTools = [
  createAdvancedSearchTool,
  createFullTextSearchTool,
  createSearchElementsTool,
  createSearchCommentsTool,
  createSearchSuggestionsTool,
  createUnifiedSearchTool,
];