import { DatabasePool } from '../../utils/database-pool.js';
import { Logger } from '../../utils/logger.js';
import { WhiteboardSearchPerformance, SearchMetrics } from './whiteboard-search-performance.js';
import {
  Whiteboard,
  WhiteboardElement,
  WhiteboardComment,
  WhiteboardTemplate,
  WhiteboardWithStats,
  PaginatedWhiteboards,
  PaginatedElements,
  PaginatedComments,
  WhiteboardFilter,
  WhiteboardSort,
  UnifiedSearchRequest,
  UnifiedSearchResult,
  ResourceType,
} from '@shared/types/whiteboard.js';
import { z } from 'zod';
import { sanitizeInput, createSafeSearchPattern } from '../../utils/sql-security.js';

/**
 * Advanced search filter types
 */
export const SearchFilterType = z.enum([
  'content', 'author', 'date_range', 'element_type', 'tag', 
  'permission', 'activity_level', 'collaboration_status'
]);
export type SearchFilterType = z.infer<typeof SearchFilterType>;

export const SearchSortType = z.enum([
  'relevance', 'date_created', 'date_modified', 'activity_score', 
  'collaboration_count', 'element_count', 'comment_count'
]);
export type SearchSortType = z.infer<typeof SearchSortType>;

export const SearchSyntaxType = z.enum(['natural', 'boolean', 'field_specific', 'regex']);
export type SearchSyntaxType = z.infer<typeof SearchSyntaxType>;

/**
 * Advanced search query schema
 */
export const AdvancedSearchQuery = z.object({
  // Core search parameters
  query: z.string().min(1).max(1000),
  syntaxType: SearchSyntaxType.default('natural'),
  
  // Content filters
  searchFields: z.array(z.enum([
    'title', 'description', 'content', 'comments', 'elements', 'tags', 'all'
  ])).default(['all']),
  
  // Author and user filters
  createdBy: z.array(z.string().uuid()).optional(),
  modifiedBy: z.array(z.string().uuid()).optional(),
  contributors: z.array(z.string().uuid()).optional(),
  
  // Date range filters
  dateRange: z.object({
    field: z.enum(['created', 'modified', 'accessed']),
    start: z.string().datetime().optional(),
    end: z.string().datetime().optional(),
    relative: z.enum(['today', 'yesterday', 'this_week', 'last_week', 'this_month', 'last_month']).optional(),
  }).optional(),
  
  // Content type filters
  elementTypes: z.array(z.string()).optional(),
  hasElements: z.boolean().optional(),
  hasComments: z.boolean().optional(),
  hasAttachments: z.boolean().optional(),
  
  // Tag filters
  includeTags: z.array(z.string()).optional(),
  excludeTags: z.array(z.string()).optional(),
  
  // Permission and access filters
  visibility: z.array(z.enum(['workspace', 'members', 'public'])).optional(),
  minPermissionLevel: z.enum(['viewer', 'commenter', 'editor', 'owner']).optional(),
  sharedWith: z.array(z.string().uuid()).optional(),
  
  // Activity and collaboration filters
  activityLevel: z.enum(['dormant', 'low', 'medium', 'high']).optional(),
  isCollaborating: z.boolean().optional(),
  minCollaborators: z.number().min(0).optional(),
  maxCollaborators: z.number().min(0).optional(),
  
  // Template filters
  isTemplate: z.boolean().optional(),
  templateCategory: z.string().optional(),
  
  // Cross-service integration
  hasKanbanCards: z.boolean().optional(),
  hasWikiPages: z.boolean().optional(),
  hasMemoryNodes: z.boolean().optional(),
  attachedServices: z.array(z.string()).optional(),
  
  // Result configuration
  includePreviews: z.boolean().default(true),
  includeHighlights: z.boolean().default(true),
  fuzzyMatch: z.boolean().default(true),
  maxPreviewLength: z.number().min(50).max(500).default(200),
});
export type AdvancedSearchQuery = z.infer<typeof AdvancedSearchQuery>;

/**
 * Search result with highlights and context
 */
export const SearchResultWithHighlights = z.object({
  id: z.string().uuid(),
  type: z.enum(['whiteboard', 'element', 'comment', 'template']),
  title: z.string(),
  description: z.string().optional(),
  preview: z.string().optional(),
  highlights: z.array(z.object({
    field: z.string(),
    text: z.string(),
    startIndex: z.number(),
    endIndex: z.number(),
  })).default([]),
  metadata: z.record(z.string(), z.any()).default({}),
  relevanceScore: z.number().min(0).max(1),
  contextData: z.record(z.string(), z.any()).default({}),
  matchedFields: z.array(z.string()).default([]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type SearchResultWithHighlights = z.infer<typeof SearchResultWithHighlights>;

/**
 * Paginated search results
 */
export const PaginatedSearchResults = z.object({
  items: z.array(SearchResultWithHighlights),
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
  hasMore: z.boolean(),
  searchMetadata: z.object({
    query: z.string(),
    syntaxType: SearchSyntaxType,
    executionTimeMs: z.number(),
    totalMatches: z.number(),
    filters: z.record(z.string(), z.any()).default({}),
    suggestions: z.array(z.string()).default([]),
  }),
});
export type PaginatedSearchResults = z.infer<typeof PaginatedSearchResults>;

/**
 * Search suggestions and auto-complete
 */
export const SearchSuggestion = z.object({
  text: z.string(),
  type: z.enum(['query', 'filter', 'tag', 'user', 'template']),
  score: z.number().min(0).max(1),
  metadata: z.record(z.string(), z.any()).default({}),
});
export type SearchSuggestion = z.infer<typeof SearchSuggestion>;

/**
 * Comprehensive whiteboard search and filter service
 */
export class WhiteboardSearchService {
  private logger: Logger;
  private performanceService: WhiteboardSearchPerformance;
  
  constructor(
    private db: DatabasePool,
    logger?: Logger,
    enablePerformanceOptimizations: boolean = true
  ) {
    this.logger = logger || new Logger('WhiteboardSearchService');
    this.performanceService = new WhiteboardSearchPerformance(db, this.logger);
  }

  /**
   * Advanced search with comprehensive filtering and highlighting
   */
  async advancedSearch(
    workspaceId: string,
    userId: string,
    query: AdvancedSearchQuery,
    sort?: { field: SearchSortType; direction: 'asc' | 'desc' },
    limit: number = 20,
    offset: number = 0
  ): Promise<PaginatedSearchResults> {
    try {
      // Validate and sanitize inputs
      const sanitizedQuery = this.sanitizeSearchQuery(query.query);
      const sanitizedLimit = Math.min(Math.max(1, limit), 100);
      const sanitizedOffset = Math.max(0, offset);
      
      // Generate cache key for performance optimization
      const cacheKey = this.performanceService['generateCacheKey'](
        workspaceId,
        userId,
        query,
        sort,
        sanitizedLimit,
        sanitizedOffset
      );
      
      // Calculate query complexity
      const queryComplexity = this.performanceService['calculateQueryComplexity'](query);
      
      // Execute with caching and performance monitoring
      const { results, metrics } = await this.performanceService.executeSearchWithCache(
        async () => {
          // Build search conditions
          const searchConditions = this.buildSearchConditions(query, workspaceId, userId);
          
          // Execute main search query
          const searchQuery = this.buildAdvancedSearchQuery(searchConditions, sort);
          const countQuery = this.buildSearchCountQuery(searchConditions);
          
          const [searchResult, countResult] = await Promise.all([
            this.db.query(searchQuery.sql, [...searchQuery.params, sanitizedLimit, sanitizedOffset]),
            this.db.query(countQuery.sql, countQuery.params)
          ]);
          
          const total = parseInt(countResult.rows[0]?.total || '0');
          
          // Process results with highlights
          const processedResults = await this.processSearchResults(
            searchResult.rows,
            sanitizedQuery,
            query.includeHighlights,
            query.includePreviews,
            query.maxPreviewLength
          );
          
          // Generate search suggestions
          const suggestions = await this.generateSearchSuggestions(sanitizedQuery, workspaceId, userId);
          
          return {
            items: processedResults,
            total,
            limit: sanitizedLimit,
            offset: sanitizedOffset,
            hasMore: sanitizedOffset + sanitizedLimit < total,
            searchMetadata: {
              query: sanitizedQuery,
              syntaxType: query.syntaxType,
              executionTimeMs: metrics.executionTime,
              totalMatches: total,
              filters: this.extractActiveFilters(query),
              suggestions: suggestions.slice(0, 5).map(s => s.text),
            },
          };
        },
        cacheKey,
        queryComplexity
      );
      
      // Update search metadata with performance metrics
      results.searchMetadata.executionTimeMs = metrics.executionTime;
      results.searchMetadata.cacheHit = metrics.cacheHit;
      results.searchMetadata.queryComplexity = metrics.queryComplexity;
      
      return results;
      
    } catch (error) {
      this.logger.error('Advanced search failed', { error, query, workspaceId, userId });
      throw error;
    }
  }

  /**
   * Cross-service unified search
   */
  async unifiedSearch(
    workspaceId: string,
    userId: string,
    request: UnifiedSearchRequest
  ): Promise<{ results: UnifiedSearchResult[]; searchMetadata: any }> {
    const startTime = Date.now();
    
    try {
      const results: UnifiedSearchResult[] = [];
      const searchPromises: Promise<UnifiedSearchResult[]>[] = [];
      
      // Search whiteboards if requested
      if (request.services.includes('whiteboard') || request.services.includes('kanban') || request.services.includes('wiki') || request.services.includes('memory')) {
        const whiteboardQuery: AdvancedSearchQuery = {
          query: request.query,
          syntaxType: 'natural',
          includePreviews: request.includeContent,
          includeHighlights: false,
        };
        
        searchPromises.push(this.searchWhiteboardsForUnified(workspaceId, userId, whiteboardQuery, request.limit));
      }
      
      // Search attached resources if requested
      if (request.services.some(s => ['kanban', 'wiki', 'memory'].includes(s))) {
        searchPromises.push(this.searchAttachedResources(workspaceId, userId, request));
      }
      
      // Execute all searches in parallel
      const allResults = await Promise.all(searchPromises);
      
      // Combine and rank results
      const combinedResults = allResults.flat();
      combinedResults.sort((a, b) => b.score - a.score);
      
      const executionTime = Date.now() - startTime;
      
      return {
        results: combinedResults.slice(0, request.limit),
        searchMetadata: {
          executionTimeMs: executionTime,
          totalSources: request.services.length,
          resultsCount: combinedResults.length,
          query: request.query,
        },
      };
      
    } catch (error) {
      this.logger.error('Unified search failed', { error, request, workspaceId, userId });
      throw error;
    }
  }

  /**
   * Full-text search across whiteboard content
   */
  async fullTextSearch(
    workspaceId: string,
    userId: string,
    query: string,
    filters?: WhiteboardFilter,
    limit: number = 20,
    offset: number = 0
  ): Promise<PaginatedWhiteboards> {
    try {
      const sanitizedQuery = sanitizeInput(query);
      const searchPattern = createSafeSearchPattern(sanitizedQuery);
      
      if (!searchPattern.escapedTerm || searchPattern.escapedTerm.length < 2) {
        return {
          items: [],
          total: 0,
          limit,
          offset,
          hasMore: false,
        };
      }
      
      // Use PostgreSQL full-text search
      const searchQuery = `
        WITH search_results AS (
          SELECT w.*, 
                 ts_rank(search_vector, plainto_tsquery('english', $3)) as rank_score,
                 ts_headline('english', 
                   COALESCE(w.name, '') || ' ' || COALESCE(w.description, ''), 
                   plainto_tsquery('english', $3),
                   'MaxWords=20, MinWords=5, ShortWord=3, HighlightAll=false, MaxFragments=3'
                 ) as highlight,
                 COUNT(DISTINCT we.id) FILTER (WHERE we.deleted_at IS NULL) as element_count,
                 COUNT(DISTINCT ws.id) FILTER (WHERE ws.is_active = true) as collaborator_count,
                 COUNT(DISTINCT wc.id) FILTER (WHERE wc.deleted_at IS NULL) as comment_count,
                 MAX(wal.created_at) as last_activity
          FROM whiteboards w
          LEFT JOIN whiteboard_elements we ON w.id = we.whiteboard_id
          LEFT JOIN whiteboard_sessions ws ON w.id = ws.whiteboard_id
          LEFT JOIN whiteboard_comments wc ON w.id = wc.whiteboard_id
          LEFT JOIN whiteboard_activity_log wal ON w.id = wal.whiteboard_id
          LEFT JOIN whiteboard_permissions wp ON w.id = wp.whiteboard_id
          WHERE w.workspace_id = $1 
            AND w.deleted_at IS NULL
            AND w.search_vector @@ plainto_tsquery('english', $3)
            AND (w.visibility = 'workspace' OR w.visibility = 'public' OR w.created_by = $2 OR wp.user_id = $2)
          GROUP BY w.id
        )
        SELECT *, 
               CASE WHEN element_count > 1 THEN true ELSE false END as is_collaborating
        FROM search_results
        ORDER BY rank_score DESC, last_activity DESC NULLS LAST
        LIMIT $4 OFFSET $5
      `;
      
      const countQuery = `
        SELECT COUNT(DISTINCT w.id) as total
        FROM whiteboards w
        LEFT JOIN whiteboard_permissions wp ON w.id = wp.whiteboard_id
        WHERE w.workspace_id = $1 
          AND w.deleted_at IS NULL
          AND w.search_vector @@ plainto_tsquery('english', $3)
          AND (w.visibility = 'workspace' OR w.visibility = 'public' OR w.created_by = $2 OR wp.user_id = $2)
      `;
      
      const [searchResult, countResult] = await Promise.all([
        this.db.query(searchQuery, [workspaceId, userId, sanitizedQuery, limit, offset]),
        this.db.query(countQuery, [workspaceId, userId, sanitizedQuery])
      ]);
      
      const total = parseInt(countResult.rows[0]?.total || '0');
      const whiteboards = searchResult.rows.map(row => this.mapDatabaseRowToWhiteboardWithStats(row));
      
      return {
        items: whiteboards,
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      };
      
    } catch (error) {
      this.logger.error('Full-text search failed', { error, query, workspaceId, userId });
      throw error;
    }
  }

  /**
   * Search whiteboard elements by content and metadata
   */
  async searchElements(
    whiteboardId: string,
    userId: string,
    query: string,
    elementTypes?: string[],
    limit: number = 50,
    offset: number = 0
  ): Promise<PaginatedElements> {
    try {
      // First verify user has access to the whiteboard
      await this.verifyWhiteboardAccess(whiteboardId, userId);
      
      const sanitizedQuery = sanitizeInput(query);
      const searchPattern = createSafeSearchPattern(sanitizedQuery);
      
      let typeFilter = '';
      const params = [whiteboardId];
      let paramIndex = 2;
      
      if (elementTypes && elementTypes.length > 0) {
        typeFilter = `AND element_type = ANY($${paramIndex++})`;
        params.push(elementTypes);
      }
      
      if (searchPattern.escapedTerm && searchPattern.escapedTerm.length >= 2) {
        params.push(searchPattern.pattern);
        
        const searchQuery = `
          SELECT we.*, 
                 CASE 
                   WHEN element_data->>'text' ILIKE $${paramIndex} ESCAPE '\\' THEN 3
                   WHEN element_data->>'title' ILIKE $${paramIndex} ESCAPE '\\' THEN 2
                   ELSE 1
                 END as relevance_score
          FROM whiteboard_elements we
          WHERE we.whiteboard_id = $1 
            AND we.deleted_at IS NULL
            AND we.visible = true
            ${typeFilter}
            AND (
              element_data::text ILIKE $${paramIndex} ESCAPE '\\'
              OR metadata::text ILIKE $${paramIndex} ESCAPE '\\'
            )
          ORDER BY relevance_score DESC, layer_index ASC, created_at DESC
          LIMIT $${paramIndex + 1} OFFSET $${paramIndex + 2}
        `;
        
        const countQuery = `
          SELECT COUNT(*) as total
          FROM whiteboard_elements we
          WHERE we.whiteboard_id = $1 
            AND we.deleted_at IS NULL
            AND we.visible = true
            ${typeFilter}
            AND (
              element_data::text ILIKE $${paramIndex} ESCAPE '\\'
              OR metadata::text ILIKE $${paramIndex} ESCAPE '\\'
            )
        `;
        
        params.push(limit, offset);
        
        const [searchResult, countResult] = await Promise.all([
          this.db.query(searchQuery, params),
          this.db.query(countQuery, params.slice(0, -2))
        ]);
        
        const total = parseInt(countResult.rows[0]?.total || '0');
        const elements = searchResult.rows.map(row => this.mapDatabaseRowToElement(row));
        
        return {
          items: elements,
          total,
          limit,
          offset,
          hasMore: offset + limit < total,
        };
      } else {
        // Return empty results for invalid queries
        return {
          items: [],
          total: 0,
          limit,
          offset,
          hasMore: false,
        };
      }
      
    } catch (error) {
      this.logger.error('Element search failed', { error, query, whiteboardId, userId });
      throw error;
    }
  }

  /**
   * Search whiteboard comments with threading support
   */
  async searchComments(
    whiteboardId: string,
    userId: string,
    query: string,
    includeResolved: boolean = true,
    limit: number = 50,
    offset: number = 0
  ): Promise<PaginatedComments> {
    try {
      // Verify user has access to the whiteboard
      await this.verifyWhiteboardAccess(whiteboardId, userId);
      
      const sanitizedQuery = sanitizeInput(query);
      const searchPattern = createSafeSearchPattern(sanitizedQuery);
      
      if (!searchPattern.escapedTerm || searchPattern.escapedTerm.length < 2) {
        return {
          items: [],
          total: 0,
          limit,
          offset,
          hasMore: false,
        };
      }
      
      let resolvedFilter = '';
      if (!includeResolved) {
        resolvedFilter = 'AND resolved = false';
      }
      
      const searchQuery = `
        SELECT wc.*,
               CASE 
                 WHEN content ILIKE $3 ESCAPE '\\' THEN 2
                 ELSE 1
               END as relevance_score
        FROM whiteboard_comments wc
        WHERE wc.whiteboard_id = $1 
          AND wc.deleted_at IS NULL
          AND content ILIKE $3 ESCAPE '\\'
          ${resolvedFilter}
        ORDER BY relevance_score DESC, created_at DESC
        LIMIT $4 OFFSET $5
      `;
      
      const countQuery = `
        SELECT COUNT(*) as total
        FROM whiteboard_comments wc
        WHERE wc.whiteboard_id = $1 
          AND wc.deleted_at IS NULL
          AND content ILIKE $3 ESCAPE '\\'
          ${resolvedFilter}
      `;
      
      const [searchResult, countResult] = await Promise.all([
        this.db.query(searchQuery, [whiteboardId, userId, searchPattern.pattern, limit, offset]),
        this.db.query(countQuery, [whiteboardId, userId, searchPattern.pattern])
      ]);
      
      const total = parseInt(countResult.rows[0]?.total || '0');
      const comments = searchResult.rows.map(row => this.mapDatabaseRowToComment(row));
      
      return {
        items: comments,
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      };
      
    } catch (error) {
      this.logger.error('Comment search failed', { error, query, whiteboardId, userId });
      throw error;
    }
  }

  /**
   * Generate search suggestions based on query and user history
   */
  async generateSearchSuggestions(
    partialQuery: string,
    workspaceId: string,
    userId: string,
    limit: number = 10
  ): Promise<SearchSuggestion[]> {
    try {
      const sanitizedQuery = sanitizeInput(partialQuery);
      
      if (!sanitizedQuery || sanitizedQuery.length < 2) {
        return [];
      }
      
      const suggestions: SearchSuggestion[] = [];
      
      // Get tag suggestions
      const tagQuery = `
        SELECT DISTINCT unnest(tags) as tag, COUNT(*) as usage_count
        FROM whiteboard_templates
        WHERE workspace_id = $1 OR is_public = true
        GROUP BY tag
        HAVING unnest(tags) ILIKE $2 ESCAPE '\\'
        ORDER BY usage_count DESC
        LIMIT 5
      `;
      
      const tagPattern = createSafeSearchPattern(sanitizedQuery).pattern;
      const tagResult = await this.db.query(tagQuery, [workspaceId, tagPattern]);
      
      tagResult.rows.forEach(row => {
        suggestions.push({
          text: row.tag,
          type: 'tag',
          score: Math.min(row.usage_count / 10, 1),
          metadata: { category: 'tag', usage: row.usage_count },
        });
      });
      
      // Get user suggestions
      const userQuery = `
        SELECT DISTINCT u.name, COUNT(*) as activity_count
        FROM whiteboards w
        JOIN users u ON w.created_by = u.id
        WHERE w.workspace_id = $1 
          AND w.deleted_at IS NULL
          AND u.name ILIKE $2 ESCAPE '\\'
        GROUP BY u.id, u.name
        ORDER BY activity_count DESC
        LIMIT 3
      `;
      
      const userResult = await this.db.query(userQuery, [workspaceId, tagPattern]);
      
      userResult.rows.forEach(row => {
        suggestions.push({
          text: row.name,
          type: 'user',
          score: Math.min(row.activity_count / 20, 1),
          metadata: { category: 'user', activity: row.activity_count },
        });
      });
      
      // Get template category suggestions
      const categoryQuery = `
        SELECT category, COUNT(*) as template_count
        FROM whiteboard_templates
        WHERE (workspace_id = $1 OR is_public = true)
          AND category ILIKE $2 ESCAPE '\\'
        GROUP BY category
        ORDER BY template_count DESC
        LIMIT 3
      `;
      
      const categoryResult = await this.db.query(categoryQuery, [workspaceId, tagPattern]);
      
      categoryResult.rows.forEach(row => {
        suggestions.push({
          text: row.category,
          type: 'template',
          score: Math.min(row.template_count / 5, 1),
          metadata: { category: 'template_category', count: row.template_count },
        });
      });
      
      // Sort by score and return top suggestions
      return suggestions
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
        
    } catch (error) {
      this.logger.error('Failed to generate search suggestions', { error, partialQuery, workspaceId, userId });
      return [];
    }
  }

  /**
   * Get search analytics for performance monitoring
   */
  async getSearchAnalytics(
    workspaceId: string,
    userId: string,
    timeRange: { start: string; end: string }
  ): Promise<{
    totalSearches: number;
    avgExecutionTime: number;
    topQueries: { query: string; count: number }[];
    searchSuccess: number;
    noResultsQueries: string[];
  }> {
    try {
      // This would be implemented with a search_analytics table
      // For now, return mock data
      return {
        totalSearches: 0,
        avgExecutionTime: 0,
        topQueries: [],
        searchSuccess: 0,
        noResultsQueries: [],
      };
    } catch (error) {
      this.logger.error('Failed to get search analytics', { error, workspaceId, userId, timeRange });
      throw error;
    }
  }

  // Private helper methods

  private sanitizeSearchQuery(query: string): string {
    const sanitized = sanitizeInput(query);
    // Additional search-specific sanitization
    return sanitized.replace(/[<>]/g, '').slice(0, 1000);
  }

  private buildSearchConditions(query: AdvancedSearchQuery, workspaceId: string, userId: string): any {
    const conditions: string[] = [];
    const params: any[] = [workspaceId, userId];
    let paramIndex = 3;
    
    // Base workspace and access conditions
    conditions.push('w.workspace_id = $1');
    conditions.push('w.deleted_at IS NULL');
    conditions.push('(w.visibility = \'workspace\' OR w.visibility = \'public\' OR w.created_by = $2 OR wp.user_id = $2)');
    
    // Full-text search condition
    if (query.query && query.query.trim().length >= 2) {
      conditions.push(`w.search_vector @@ plainto_tsquery('english', $${paramIndex++})`);
      params.push(query.query);
    }
    
    // Date range filters
    if (query.dateRange) {
      if (query.dateRange.start) {
        const field = query.dateRange.field === 'created' ? 'created_at' : 'updated_at';
        conditions.push(`w.${field} >= $${paramIndex++}`);
        params.push(query.dateRange.start);
      }
      if (query.dateRange.end) {
        const field = query.dateRange.field === 'created' ? 'created_at' : 'updated_at';
        conditions.push(`w.${field} <= $${paramIndex++}`);
        params.push(query.dateRange.end);
      }
    }
    
    // Author filters
    if (query.createdBy && query.createdBy.length > 0) {
      conditions.push(`w.created_by = ANY($${paramIndex++})`);
      params.push(query.createdBy);
    }
    
    return { conditions, params, paramIndex };
  }

  private buildAdvancedSearchQuery(searchConditions: any, sort?: { field: SearchSortType; direction: 'asc' | 'desc' }): { sql: string; params: any[] } {
    const { conditions, params } = searchConditions;
    
    // Build ORDER BY clause
    let orderClause = 'ORDER BY ts_rank(w.search_vector, plainto_tsquery(\'english\', $3)) DESC, w.updated_at DESC';
    if (sort) {
      switch (sort.field) {
        case 'date_created':
          orderClause = `ORDER BY w.created_at ${sort.direction}`;
          break;
        case 'date_modified':
          orderClause = `ORDER BY w.updated_at ${sort.direction}`;
          break;
        case 'element_count':
          orderClause = `ORDER BY element_count ${sort.direction}`;
          break;
        case 'collaboration_count':
          orderClause = `ORDER BY collaborator_count ${sort.direction}`;
          break;
        // 'relevance' uses default ordering
      }
    }
    
    const sql = `
      SELECT w.*, 
             ts_rank(w.search_vector, plainto_tsquery('english', $3)) as relevance_score,
             COUNT(DISTINCT we.id) FILTER (WHERE we.deleted_at IS NULL) as element_count,
             COUNT(DISTINCT ws.id) FILTER (WHERE ws.is_active = true) as collaborator_count,
             COUNT(DISTINCT wc.id) FILTER (WHERE wc.deleted_at IS NULL) as comment_count,
             MAX(wal.created_at) as last_activity,
             CASE WHEN COUNT(DISTINCT ws.id) FILTER (WHERE ws.is_active = true) > 1 THEN true ELSE false END as is_collaborating
      FROM whiteboards w
      LEFT JOIN whiteboard_elements we ON w.id = we.whiteboard_id
      LEFT JOIN whiteboard_sessions ws ON w.id = ws.whiteboard_id
      LEFT JOIN whiteboard_comments wc ON w.id = wc.whiteboard_id
      LEFT JOIN whiteboard_activity_log wal ON w.id = wal.whiteboard_id
      LEFT JOIN whiteboard_permissions wp ON w.id = wp.whiteboard_id
      WHERE ${conditions.join(' AND ')}
      GROUP BY w.id
      ${orderClause}
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;
    
    return { sql, params };
  }

  private buildSearchCountQuery(searchConditions: any): { sql: string; params: any[] } {
    const { conditions, params } = searchConditions;
    
    const sql = `
      SELECT COUNT(DISTINCT w.id) as total
      FROM whiteboards w
      LEFT JOIN whiteboard_permissions wp ON w.id = wp.whiteboard_id
      WHERE ${conditions.join(' AND ')}
    `;
    
    return { sql, params };
  }

  private async processSearchResults(
    rows: any[],
    query: string,
    includeHighlights: boolean,
    includePreviews: boolean,
    maxPreviewLength: number
  ): Promise<SearchResultWithHighlights[]> {
    return rows.map(row => {
      const result: SearchResultWithHighlights = {
        id: row.id,
        type: 'whiteboard',
        title: row.name || 'Untitled Whiteboard',
        description: row.description,
        preview: includePreviews ? this.generatePreview(row.description, maxPreviewLength) : undefined,
        highlights: includeHighlights ? this.generateHighlights(row, query) : [],
        metadata: {
          elementCount: parseInt(row.element_count) || 0,
          collaboratorCount: parseInt(row.collaborator_count) || 0,
          commentCount: parseInt(row.comment_count) || 0,
          visibility: row.visibility,
          isCollaborating: row.is_collaborating || false,
        },
        relevanceScore: parseFloat(row.relevance_score) || 0,
        contextData: {
          lastActivity: row.last_activity,
          createdBy: row.created_by,
        },
        matchedFields: ['title', 'description'],
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
      
      return result;
    });
  }

  private generatePreview(content: string | null, maxLength: number): string | undefined {
    if (!content) return undefined;
    return content.length > maxLength ? `${content.substring(0, maxLength)}...` : content;
  }

  private generateHighlights(row: any, query: string): any[] {
    const highlights: any[] = [];
    const queryLower = query.toLowerCase();
    
    // Check title for matches
    if (row.name && row.name.toLowerCase().includes(queryLower)) {
      const startIndex = row.name.toLowerCase().indexOf(queryLower);
      highlights.push({
        field: 'title',
        text: row.name.substring(Math.max(0, startIndex - 20), Math.min(row.name.length, startIndex + queryLower.length + 20)),
        startIndex,
        endIndex: startIndex + queryLower.length,
      });
    }
    
    // Check description for matches
    if (row.description && row.description.toLowerCase().includes(queryLower)) {
      const startIndex = row.description.toLowerCase().indexOf(queryLower);
      highlights.push({
        field: 'description',
        text: row.description.substring(Math.max(0, startIndex - 30), Math.min(row.description.length, startIndex + queryLower.length + 30)),
        startIndex,
        endIndex: startIndex + queryLower.length,
      });
    }
    
    return highlights;
  }

  private async searchWhiteboardsForUnified(
    workspaceId: string,
    userId: string,
    query: AdvancedSearchQuery,
    limit: number
  ): Promise<UnifiedSearchResult[]> {
    try {
      const searchResult = await this.advancedSearch(workspaceId, userId, query, undefined, limit, 0);
      
      return searchResult.items.map(item => ({
        id: item.id,
        type: 'whiteboard' as ResourceType,
        title: item.title,
        description: item.description,
        content: item.preview,
        metadata: item.metadata,
        score: item.relevanceScore,
        service: 'whiteboard',
        lastModified: item.updatedAt,
        author: item.contextData.createdBy,
        tags: [],
        attachable: false,
        thumbnail: undefined,
      }));
    } catch (error) {
      this.logger.error('Failed to search whiteboards for unified search', { error });
      return [];
    }
  }

  private async searchAttachedResources(
    workspaceId: string,
    userId: string,
    request: UnifiedSearchRequest
  ): Promise<UnifiedSearchResult[]> {
    // This would integrate with other services' search APIs
    // For now, return empty array
    return [];
  }

  private extractActiveFilters(query: AdvancedSearchQuery): Record<string, any> {
    const filters: Record<string, any> = {};
    
    if (query.dateRange) filters.dateRange = query.dateRange;
    if (query.createdBy) filters.createdBy = query.createdBy;
    if (query.elementTypes) filters.elementTypes = query.elementTypes;
    if (query.hasElements !== undefined) filters.hasElements = query.hasElements;
    if (query.hasComments !== undefined) filters.hasComments = query.hasComments;
    if (query.includeTags) filters.includeTags = query.includeTags;
    if (query.excludeTags) filters.excludeTags = query.excludeTags;
    if (query.visibility) filters.visibility = query.visibility;
    if (query.activityLevel) filters.activityLevel = query.activityLevel;
    if (query.isCollaborating !== undefined) filters.isCollaborating = query.isCollaborating;
    
    return filters;
  }

  private async verifyWhiteboardAccess(whiteboardId: string, userId: string): Promise<void> {
    const query = `
      SELECT w.id, w.visibility, w.created_by, wp.user_id
      FROM whiteboards w
      LEFT JOIN whiteboard_permissions wp ON w.id = wp.whiteboard_id AND wp.user_id = $2
      WHERE w.id = $1 AND w.deleted_at IS NULL
    `;
    
    const result = await this.db.query(query, [whiteboardId, userId]);
    
    if (result.rows.length === 0) {
      throw new Error('Whiteboard not found');
    }
    
    const whiteboard = result.rows[0];
    
    // Check access permissions
    if (whiteboard.visibility === 'public' || 
        whiteboard.created_by === userId || 
        whiteboard.user_id === userId) {
      return;
    }
    
    throw new Error('Access denied to whiteboard');
  }

  private mapDatabaseRowToWhiteboardWithStats(row: any): WhiteboardWithStats {
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      name: sanitizeInput(row.name || ''),
      description: sanitizeInput(row.description || ''),
      thumbnail: row.thumbnail,
      canvasData: this.sanitizeJsonField(row.canvas_data),
      settings: this.sanitizeJsonField(row.settings),
      templateId: row.template_id,
      isTemplate: row.is_template || false,
      visibility: row.visibility,
      status: row.status,
      version: parseInt(row.version) || 1,
      createdBy: row.created_by,
      lastModifiedBy: row.last_modified_by,
      createdAt: row.created_at?.toISOString() || new Date().toISOString(),
      updatedAt: row.updated_at?.toISOString() || new Date().toISOString(),
      deletedAt: row.deleted_at?.toISOString(),
      elementCount: parseInt(row.element_count) || 0,
      collaboratorCount: parseInt(row.collaborator_count) || 0,
      commentCount: parseInt(row.comment_count) || 0,
      lastActivity: row.last_activity?.toISOString(),
      isCollaborating: row.is_collaborating || false,
    };
  }

  private mapDatabaseRowToElement(row: any): WhiteboardElement {
    return {
      id: row.id,
      whiteboardId: row.whiteboard_id,
      elementType: row.element_type,
      elementData: this.sanitizeJsonField(row.element_data),
      layerIndex: parseInt(row.layer_index) || 0,
      parentId: row.parent_id,
      locked: row.locked || false,
      visible: row.visible !== false,
      styleData: this.sanitizeJsonField(row.style_data),
      metadata: this.sanitizeJsonField(row.metadata),
      version: parseInt(row.version) || 1,
      createdBy: row.created_by,
      lastModifiedBy: row.last_modified_by,
      createdAt: row.created_at?.toISOString() || new Date().toISOString(),
      updatedAt: row.updated_at?.toISOString() || new Date().toISOString(),
      deletedAt: row.deleted_at?.toISOString(),
    };
  }

  private mapDatabaseRowToComment(row: any): WhiteboardComment {
    return {
      id: row.id,
      whiteboardId: row.whiteboard_id,
      elementId: row.element_id,
      parentId: row.parent_id,
      threadId: row.thread_id || row.id,
      content: sanitizeInput(row.content || ''),
      contentType: row.content_type || 'text',
      richTextFormat: this.sanitizeJsonField(row.rich_text_format),
      position: this.sanitizeJsonField(row.position),
      anchorPoint: this.sanitizeJsonField(row.anchor_point),
      status: row.status || 'open',
      priority: row.priority || 'medium',
      resolved: row.resolved || false,
      resolvedBy: row.resolved_by,
      resolvedAt: row.resolved_at?.toISOString(),
      resolvedReason: row.resolved_reason,
      mentions: this.sanitizeJsonField(row.mentions) || [],
      mentionNotificationsSent: row.mention_notifications_sent || false,
      attachments: this.sanitizeJsonField(row.attachments) || [],
      threadMetadata: this.sanitizeJsonField(row.thread_metadata),
      depth: parseInt(row.depth) || 0,
      revisionCount: parseInt(row.revision_count) || 0,
      lastEditedBy: row.last_edited_by,
      lastEditedAt: row.last_edited_at?.toISOString(),
      isPrivate: row.is_private || false,
      allowedViewers: this.sanitizeJsonField(row.allowed_viewers) || [],
      reactions: this.sanitizeJsonField(row.reactions) || [],
      tags: this.sanitizeJsonField(row.tags) || [],
      metadata: this.sanitizeJsonField(row.metadata),
      createdBy: row.created_by,
      createdAt: row.created_at?.toISOString() || new Date().toISOString(),
      updatedAt: row.updated_at?.toISOString() || new Date().toISOString(),
      deletedAt: row.deleted_at?.toISOString(),
    };
  }

  private sanitizeJsonField(field: any): any {
    if (!field) {
      return {};
    }
    
    try {
      const data = typeof field === 'string' ? JSON.parse(field) : field;
      
      if (typeof data === 'object' && data !== null) {
        const sanitized: any = {};
        for (const [key, value] of Object.entries(data)) {
          if (typeof key === 'string' && key.length > 0 && key.length < 100) {
            const sanitizedKey = sanitizeInput(key);
            if (sanitizedKey) {
              sanitized[sanitizedKey] = this.sanitizeValue(value, 3);
            }
          }
        }
        return sanitized;
      }
      
      return {};
    } catch (error) {
      return {};
    }
  }

  private sanitizeValue(value: any, maxDepth: number): any {
    if (maxDepth <= 0) return null;
    if (value === null || value === undefined) return value;
    if (typeof value === 'string') return sanitizeInput(value);
    if (typeof value === 'number' || typeof value === 'boolean') return value;
    if (Array.isArray(value)) return value.slice(0, 100).map(item => this.sanitizeValue(item, maxDepth - 1));
    if (typeof value === 'object') {
      const sanitized: any = {};
      let count = 0;
      for (const [key, val] of Object.entries(value)) {
        if (count++ >= 50) break;
        const sanitizedKey = sanitizeInput(key);
        if (sanitizedKey) {
          sanitized[sanitizedKey] = this.sanitizeValue(val, maxDepth - 1);
        }
      }
      return sanitized;
    }
    return null;
  }

  // Performance optimization methods

  /**
   * Get performance statistics for the search service
   */
  getPerformanceStats() {
    return this.performanceService.getPerformanceStats();
  }

  /**
   * Get cache statistics for search optimization
   */
  getCacheStats() {
    return this.performanceService.getCacheStats();
  }

  /**
   * Clear all search caches
   */
  clearCaches(): void {
    this.performanceService.clearCaches();
  }

  /**
   * Get database optimization recommendations
   */
  async getOptimizationRecommendations() {
    return this.performanceService.optimizeQueries();
  }

  /**
   * Run search performance benchmark
   */
  async runBenchmark(queries: AdvancedSearchQuery[], config: any) {
    const searchFunctions = queries.map(query => 
      () => this.advancedSearch('benchmark-workspace', 'benchmark-user', query)
    );
    
    // Run benchmark on each query type
    const results = new Map();
    for (let i = 0; i < queries.length; i++) {
      const queryName = `query_${i}_${queries[i].syntaxType}_${queries[i].query.substring(0, 20)}`;
      const result = await this.performanceService.runSearchBenchmark(searchFunctions[i], config);
      results.set(queryName, result);
    }
    
    return results;
  }

  /**
   * Get access to the performance service for advanced benchmarking
   */
  getPerformanceService(): WhiteboardSearchPerformance {
    return this.performanceService;
  }
}