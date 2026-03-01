import {
  FilterTree,
  FilterTemplate,
  FilterPreset,
  SharedFilter,
  QueryValidation,
  SearchQuery,
  SharePermission,
  FilterHistory,
  FilterBuilderAnalytics,
  CreateFilterTemplateRequest,
  ShareFilterRequest,
  SaveFilterPresetRequest,
  BuildQueryRequest,
  FilterCondition,
  BooleanOperator
} from '../../shared/types/filter-builder.js';
import { FilterTreeBuilder } from './filter-tree-builder.js';
import { FilterValidator } from './filter-validator.js';
import { FilterExecutor } from './filter-executor.js';
import { DatabaseConnection } from '../../utils/database.js';
import { sql } from 'kysely';
import { LRUCache } from 'lru-cache';

export interface QueryBuilderServiceOptions {
  database: DatabaseConnection;
  enableAnalytics?: boolean;
  cacheQueries?: boolean;
  maxCacheSize?: number;
  cacheMaxAge?: number;
}

/**
 * Main service for building, validating, and executing filter queries
 */
export class QueryBuilderService {
  private treeBuilder: FilterTreeBuilder;
  private validator: FilterValidator;
  private executor: FilterExecutor;
  private database: DatabaseConnection;
  private enableAnalytics: boolean;
  private queryCache: LRUCache<string, SearchQuery>;
  private options: QueryBuilderServiceOptions;

  constructor(options: QueryBuilderServiceOptions) {
    this.database = options.database;
    this.enableAnalytics = options.enableAnalytics ?? true;
    this.options = {
      maxCacheSize: 1000,
      cacheMaxAge: 30 * 60 * 1000, // 30 minutes
      ...options
    };
    
    this.treeBuilder = new FilterTreeBuilder();
    this.validator = new FilterValidator();
    this.executor = new FilterExecutor(options.database);
    
    // Initialize LRU cache with proper limits
    this.queryCache = new LRUCache<string, SearchQuery>({
      max: this.options.maxCacheSize!,
      ttl: this.options.cacheMaxAge!,
      updateAgeOnGet: true,
      allowStale: false
    });
  }

  /**
   * Build a search query from filter tree
   */
  async buildQuery(request: BuildQueryRequest): Promise<SearchQuery> {
    const { filterTree, targetFormat = 'sql', options = {} } = request;

    // Generate cache key
    const cacheKey = this.generateCacheKey(filterTree, targetFormat, options);
    
    if (this.queryCache.has(cacheKey)) {
      return this.queryCache.get(cacheKey)!;
    }

    // Validate filter tree first
    const validation = await this.validateQuery(filterTree);
    if (!validation.isValid) {
      throw new Error(`Invalid filter tree: ${validation.errors.map(e => e.message).join(', ')}`);
    }

    // Optimize if requested
    let optimizedTree = filterTree;
    if (options.optimize) {
      optimizedTree = await this.optimizeQuery(filterTree);
    }

    // Build the query
    let query: SearchQuery;
    switch (targetFormat) {
      case 'sql':
        query = await this.toSQL(optimizedTree);
        break;
      case 'elasticsearch':
        query = await this.toElasticsearch(optimizedTree);
        break;
      case 'mongodb':
        query = await this.toMongoDB(optimizedTree);
        break;
      default:
        throw new Error(`Unsupported target format: ${targetFormat}`);
    }

    // Add metadata if requested
    if (options.includeMetadata) {
      query.metadata = {
        complexity: this.calculateComplexity(optimizedTree),
        indexHints: await this.getIndexHints(optimizedTree),
        optimizationNotes: this.getOptimizationNotes(filterTree, optimizedTree)
      };
    }

    // Cache the result
    this.queryCache.set(cacheKey, query);

    return query;
  }

  /**
   * Validate a filter tree
   */
  async validateQuery(filterTree: FilterTree): Promise<QueryValidation> {
    return this.validator.validate(filterTree);
  }

  /**
   * Optimize a filter tree for better performance
   */
  async optimizeQuery(filterTree: FilterTree): Promise<FilterTree> {
    return this.validator.optimize(filterTree);
  }

  /**
   * Create a new filter template
   */
  async createTemplate(
    userId: string,
    request: CreateFilterTemplateRequest
  ): Promise<FilterTemplate> {
    // Validate the filter tree
    const validation = await this.validateQuery(request.filterTree);
    if (!validation.isValid) {
      throw new Error('Cannot save invalid filter as template');
    }

    const templateId = crypto.randomUUID();
    const now = new Date();

    const template: FilterTemplate = {
      id: templateId,
      name: request.name,
      description: request.description,
      filterTree: request.filterTree,
      category: request.category,
      tags: request.tags,
      isPublic: request.isPublic,
      ownerId: userId,
      usageCount: 0,
      createdAt: now,
      updatedAt: now
    };

    // Save to database
    await this.database
      .insertInto('filter_templates')
      .values({
        id: template.id,
        name: template.name,
        description: template.description,
        filter_tree: JSON.stringify(template.filterTree),
        category: template.category,
        is_public: template.isPublic,
        owner_id: template.ownerId,
        usage_count: template.usageCount,
        tags: template.tags,
        created_at: template.createdAt,
        updated_at: template.updatedAt
      })
      .execute();

    // Track analytics
    if (this.enableAnalytics) {
      await this.trackAnalytics(userId, 'save_template', request.filterTree);
    }

    return template;
  }

  /**
   * Get filter templates
   */
  async getTemplates(userId?: string): Promise<FilterTemplate[]> {
    let query = this.database
      .selectFrom('filter_templates')
      .selectAll();

    if (userId) {
      query = query.where((eb) =>
        eb.or([
          eb('is_public', '=', true),
          eb('owner_id', '=', userId)
        ])
      );
    } else {
      query = query.where('is_public', '=', true);
    }

    const results = await query
      .orderBy('usage_count', 'desc')
      .orderBy('created_at', 'desc')
      .execute();

    return results.map(this.mapTemplateFromDb);
  }

  /**
   * Apply a template by ID
   */
  async applyTemplate(templateId: string, userId?: string): Promise<FilterTree> {
    const template = await this.database
      .selectFrom('filter_templates')
      .selectAll()
      .where('id', '=', templateId)
      .executeTakeFirst();

    if (!template) {
      throw new Error('Template not found');
    }

    // Check access permissions
    if (!template.is_public && template.owner_id !== userId) {
      throw new Error('Access denied to private template');
    }

    // Increment usage count
    await this.database
      .updateTable('filter_templates')
      .set({ usage_count: sql`usage_count + 1` })
      .where('id', '=', templateId)
      .execute();

    // Track analytics
    let parsedTree: FilterTree;
    try {
      parsedTree = JSON.parse(template.filter_tree);
    } catch {
      throw new Error(`Invalid filter tree JSON in template ${templateId}`);
    }

    if (this.enableAnalytics && userId) {
      await this.trackAnalytics(userId, 'load_template', parsedTree);
    }

    return parsedTree;
  }

  /**
   * Share a filter
   */
  async shareFilter(
    userId: string,
    request: ShareFilterRequest
  ): Promise<string> {
    const shareToken = this.generateShareToken();
    const sharedFilter: SharedFilter = {
      id: crypto.randomUUID(),
      filterTree: request.filterTree,
      shareToken,
      createdBy: userId,
      permissions: request.permissions,
      expiresAt: request.expiresIn ? new Date(Date.now() + request.expiresIn * 60 * 60 * 1000) : undefined,
      accessCount: 0,
      createdAt: new Date()
    };

    await this.database
      .insertInto('shared_filters')
      .values({
        id: sharedFilter.id,
        filter_tree: JSON.stringify(sharedFilter.filterTree),
        share_token: sharedFilter.shareToken,
        created_by: sharedFilter.createdBy,
        permissions: sharedFilter.permissions,
        expires_at: sharedFilter.expiresAt,
        access_count: sharedFilter.accessCount,
        created_at: sharedFilter.createdAt
      })
      .execute();

    // Track analytics
    if (this.enableAnalytics) {
      await this.trackAnalytics(userId, 'share', request.filterTree);
    }

    return shareToken;
  }

  /**
   * Import a shared filter
   */
  async importSharedFilter(shareToken: string): Promise<FilterTree> {
    const sharedFilter = await this.database
      .selectFrom('shared_filters')
      .selectAll()
      .where('share_token', '=', shareToken)
      .executeTakeFirst();

    if (!sharedFilter) {
      throw new Error('Shared filter not found');
    }

    // Check expiration
    if (sharedFilter.expires_at && new Date() > sharedFilter.expires_at) {
      throw new Error('Shared filter has expired');
    }

    // Increment access count
    await this.database
      .updateTable('shared_filters')
      .set({ access_count: sql`access_count + 1` })
      .where('share_token', '=', shareToken)
      .execute();

    try {
      return JSON.parse(sharedFilter.filter_tree);
    } catch {
      throw new Error('Failed to parse shared filter tree from database');
    }
  }

  /**
   * Save user filter preset
   */
  async savePreset(
    userId: string,
    request: SaveFilterPresetRequest
  ): Promise<FilterPreset> {
    const preset: FilterPreset = {
      id: crypto.randomUUID(),
      userId,
      name: request.name,
      filterTree: request.filterTree,
      shortcutKey: request.shortcutKey,
      isDefault: request.isDefault,
      usageCount: 0,
      createdAt: new Date()
    };

    // If this is set as default, unset other defaults
    if (preset.isDefault) {
      await this.database
        .updateTable('user_filter_presets')
        .set({ is_default: false })
        .where('user_id', '=', userId)
        .where('is_default', '=', true)
        .execute();
    }

    await this.database
      .insertInto('user_filter_presets')
      .values({
        id: preset.id,
        user_id: preset.userId,
        name: preset.name,
        filter_tree: JSON.stringify(preset.filterTree),
        shortcut_key: preset.shortcutKey,
        is_default: preset.isDefault,
        usage_count: preset.usageCount,
        created_at: preset.createdAt
      })
      .execute();

    return preset;
  }

  /**
   * Get user filter presets
   */
  async getUserPresets(userId: string): Promise<FilterPreset[]> {
    const results = await this.database
      .selectFrom('user_filter_presets')
      .selectAll()
      .where('user_id', '=', userId)
      .orderBy('is_default', 'desc')
      .orderBy('usage_count', 'desc')
      .orderBy('created_at', 'desc')
      .execute();

    return results.map(this.mapPresetFromDb);
  }

  /**
   * Convert filter tree to SQL query
   */
  async toSQL(filterTree: FilterTree): Promise<SearchQuery> {
    return this.executor.toSQL(filterTree);
  }

  /**
   * Convert filter tree to Elasticsearch query
   */
  async toElasticsearch(filterTree: FilterTree): Promise<SearchQuery> {
    return this.executor.toElasticsearch(filterTree);
  }

  /**
   * Convert filter tree to MongoDB query
   */
  async toMongoDB(filterTree: FilterTree): Promise<SearchQuery> {
    return this.executor.toMongoDB(filterTree);
  }

  /**
   * Save filter to history
   */
  async saveToHistory(
    userId: string,
    filterTree: FilterTree,
    queryGenerated?: string,
    executionTimeMs?: number,
    resultCount?: number,
    isSaved = false
  ): Promise<void> {
    await this.database
      .insertInto('filter_history')
      .values({
        id: crypto.randomUUID(),
        user_id: userId,
        filter_tree: JSON.stringify(filterTree),
        query_generated: queryGenerated,
        execution_time_ms: executionTimeMs,
        result_count: resultCount,
        is_saved: isSaved,
        created_at: new Date()
      })
      .execute();
  }

  /**
   * Get filter history for user
   */
  async getHistory(userId: string, limit = 50): Promise<FilterHistory[]> {
    const results = await this.database
      .selectFrom('filter_history')
      .selectAll()
      .where('user_id', '=', userId)
      .orderBy('created_at', 'desc')
      .limit(limit)
      .execute();

    return results.map(this.mapHistoryFromDb);
  }

  /**
   * Track analytics event
   */
  private async trackAnalytics(
    userId: string,
    actionType: string,
    filterTree: FilterTree
  ): Promise<void> {
    if (!this.enableAnalytics) return;

    const complexity = this.calculateComplexity(filterTree);
    const operatorUsage = this.calculateOperatorUsage(filterTree);

    await this.database
      .insertInto('filter_builder_analytics')
      .values({
        id: crypto.randomUUID(),
        user_id: userId,
        action_type: actionType,
        filter_complexity: complexity,
        operator_usage: JSON.stringify(operatorUsage),
        created_at: new Date()
      })
      .execute();
  }

  /**
   * Calculate filter complexity score (1-10)
   */
  private calculateComplexity(filterTree: FilterTree): number {
    let complexity = 0;
    
    const traverse = (node: FilterTree, depth = 0): void => {
      if (node.type === 'condition') {
        complexity += 1 + (depth * 0.5); // Base complexity + depth penalty
      } else if (node.type === 'group' && node.children) {
        complexity += 0.5; // Group overhead
        node.children.forEach(child => traverse(child, depth + 1));
      }
    };

    traverse(filterTree);
    return Math.min(10, Math.ceil(complexity));
  }

  /**
   * Calculate operator usage statistics
   */
  private calculateOperatorUsage(filterTree: FilterTree): Record<string, number> {
    const usage: Record<string, number> = {};

    const traverse = (node: FilterTree): void => {
      if (node.type === 'condition' && node.condition) {
        const op = node.condition.operator;
        usage[op] = (usage[op] || 0) + 1;
      } else if (node.type === 'group') {
        if (node.operator) {
          usage[node.operator] = (usage[node.operator] || 0) + 1;
        }
        node.children?.forEach(traverse);
      }
    };

    traverse(filterTree);
    return usage;
  }

  /**
   * Generate cache key for query caching
   */
  private generateCacheKey(
    filterTree: FilterTree,
    targetFormat: string,
    options: any
  ): string {
    return `${targetFormat}:${JSON.stringify(filterTree)}:${JSON.stringify(options)}`;
  }

  /**
   * Generate secure share token
   */
  private generateShareToken(): string {
    return crypto.randomUUID().replace(/-/g, '') + Math.random().toString(36).substring(2, 11);
  }

  /**
   * Get index hints for optimization
   */
  private async getIndexHints(filterTree: FilterTree): Promise<string[]> {
    // This would analyze the filter tree and suggest which database indexes would be helpful
    const hints: string[] = [];
    
    const traverse = (node: FilterTree): void => {
      if (node.type === 'condition' && node.condition) {
        hints.push(`Consider index on: ${node.condition.field}`);
      } else if (node.children) {
        node.children.forEach(traverse);
      }
    };

    traverse(filterTree);
    return [...new Set(hints)]; // Remove duplicates
  }

  /**
   * Get optimization notes
   */
  private getOptimizationNotes(original: FilterTree, optimized: FilterTree): string[] {
    const notes: string[] = [];
    
    if (JSON.stringify(original) !== JSON.stringify(optimized)) {
      notes.push('Filter tree was optimized for better performance');
    }

    return notes;
  }

  /**
   * Database mapping helpers
   */
  private safeParseJson(data: string, context: string): any {
    try {
      return JSON.parse(data);
    } catch {
      throw new Error(`Failed to parse ${context} from database`);
    }
  }

  private mapTemplateFromDb(row: any): FilterTemplate {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      filterTree: this.safeParseJson(row.filter_tree, 'filter template tree'),
      category: row.category,
      tags: row.tags || [],
      isPublic: row.is_public,
      ownerId: row.owner_id,
      usageCount: row.usage_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  private mapPresetFromDb(row: any): FilterPreset {
    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      filterTree: this.safeParseJson(row.filter_tree, 'filter preset tree'),
      shortcutKey: row.shortcut_key,
      isDefault: row.is_default,
      usageCount: row.usage_count,
      createdAt: row.created_at
    };
  }

  private mapHistoryFromDb(row: any): FilterHistory {
    return {
      id: row.id,
      userId: row.user_id,
      filterTree: this.safeParseJson(row.filter_tree, 'filter history tree'),
      queryGenerated: row.query_generated,
      executionTimeMs: row.execution_time_ms,
      resultCount: row.result_count,
      isSaved: row.is_saved,
      createdAt: row.created_at
    };
  }
}