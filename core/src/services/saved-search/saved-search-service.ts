import { z } from 'zod';
import type { Pool } from 'pg';
import type { Kysely } from 'kysely';
import {
  type SavedSearch,
  type SaveSearchRequest,
  type UpdateSearchRequest,
  type SearchListOptions,
  type SearchCollection,
  type CreateCollectionRequest,
  type SearchSharingConfig,
  type SearchShare,
  type SearchVersion,
  type SearchAnalytics,
  type UserSearchStats,
  type DateRange,
  type SearchAction,
  type PaginatedResponse,
  type CollectionTreeNode,
  SavedSearchSchema,
  SearchCollectionSchema,
  SaveSearchRequestSchema,
  UpdateSearchRequestSchema,
  SearchListOptionsSchema,
  CreateCollectionRequestSchema,
  SearchSharingConfigSchema,
} from '../../shared/types/saved-search.js';
import {
  SavedSearchError,
  SearchNotFoundError,
  PermissionDeniedError,
  CollectionNotFoundError,
  VersionNotFoundError,
  ValidationError,
  DatabaseError,
  SearchExecutionError,
} from './errors.js';

/**
 * Comprehensive Saved Search Management Service
 * 
 * Handles all aspects of saved search management including:
 * - CRUD operations for saved searches
 * - Collection/folder organization
 * - Sharing and collaboration
 * - Version history tracking
 * - Analytics and usage statistics
 * - Search execution and scheduling integration
 */
export class SavedSearchService {
  constructor(private db: Kysely<any>) {}

  // ============================================================================
  // SEARCH MANAGEMENT OPERATIONS
  // ============================================================================

  /**
   * Save a new search with validation and metadata
   */
  async saveSearch(request: SaveSearchRequest, userId: string): Promise<SavedSearch> {
    const validatedRequest = SaveSearchRequestSchema.parse(request);
    
    // Sanitize all string inputs to prevent XSS attacks
    const sanitizedRequest = {
      ...validatedRequest,
      name: this.sanitizeInput(validatedRequest.name),
      description: validatedRequest.description ? this.sanitizeInput(validatedRequest.description) : undefined,
      tags: validatedRequest.tags ? validatedRequest.tags.map(tag => this.sanitizeInput(tag)).filter(Boolean) : [],
    };
    
    const searchData = {
      name: sanitizedRequest.name,
      description: sanitizedRequest.description,
      query_data: JSON.stringify(validatedRequest.queryData),
      owner_id: userId,
      is_public: validatedRequest.isPublic,
      tags: sanitizedRequest.tags,
      metadata: {},
      created_at: new Date(),
      updated_at: new Date(),
    };

    const result = await this.db.transaction().execute(async (trx) => {
      // Insert the saved search
      const [savedSearch] = await trx
        .insertInto('saved_searches')
        .values(searchData)
        .returning('*')
        .execute();

      // Add to collections if specified
      if (validatedRequest.collectionIds?.length) {
        const collectionItems = validatedRequest.collectionIds.map(collectionId => ({
          search_id: savedSearch.id,
          collection_id: collectionId,
          added_by: userId,
        }));

        await trx
          .insertInto('search_collection_items')
          .values(collectionItems)
          .execute();
      }

      // Track analytics
      await this.trackSearchUsage(savedSearch.id, 'create', { userId }, trx);

      return this.transformSavedSearchFromDb(savedSearch);
    });

    return result;
  }

  /**
   * Update an existing saved search
   */
  async updateSearch(
    searchId: string, 
    updates: UpdateSearchRequest, 
    userId: string
  ): Promise<SavedSearch> {
    const validatedUpdates = UpdateSearchRequestSchema.parse(updates);
    
    // Sanitize all string inputs to prevent XSS attacks
    const sanitizedUpdates = {
      ...validatedUpdates,
      name: validatedUpdates.name ? this.sanitizeInput(validatedUpdates.name) : undefined,
      description: validatedUpdates.description ? this.sanitizeInput(validatedUpdates.description) : undefined,
      tags: validatedUpdates.tags ? validatedUpdates.tags.map(tag => this.sanitizeInput(tag)).filter(Boolean) : undefined,
    };
    
    // Check ownership or permissions
    await this.validateSearchAccess(searchId, userId, 'edit');

    // Create version history entry before update
    if (validatedUpdates.queryData || validatedUpdates.name) {
      const currentSearch = await this.getSearchById(searchId, userId);
      await this.createVersion(
        searchId, 
        `Updated: ${Object.keys(validatedUpdates).join(', ')}`,
        userId
      );
    }

    const updateData: any = {
      updated_at: new Date(),
    };

    if (sanitizedUpdates.name) updateData.name = sanitizedUpdates.name;
    if (sanitizedUpdates.description !== undefined) updateData.description = sanitizedUpdates.description;
    if (validatedUpdates.queryData) updateData.query_data = JSON.stringify(validatedUpdates.queryData);
    if (sanitizedUpdates.tags) updateData.tags = sanitizedUpdates.tags;
    if (validatedUpdates.isPublic !== undefined) updateData.is_public = validatedUpdates.isPublic;
    if (validatedUpdates.isFavorite !== undefined) updateData.is_favorite = validatedUpdates.isFavorite;

    const [updatedSearch] = await this.db
      .updateTable('saved_searches')
      .set(updateData)
      .where('id', '=', searchId)
      .returning('*')
      .execute();

    // Track analytics
    await this.trackSearchUsage(searchId, 'edit', { userId, changes: Object.keys(validatedUpdates) });

    return this.transformSavedSearchFromDb(updatedSearch);
  }

  /**
   * Delete a saved search and all related data
   */
  async deleteSearch(searchId: string, userId: string): Promise<void> {
    await this.validateSearchAccess(searchId, userId, 'admin');

    await this.db.transaction().execute(async (trx) => {
      // Track analytics before deletion
      await this.trackSearchUsage(searchId, 'delete', { userId }, trx);

      // Delete the search (cascades will handle related records)
      await trx
        .deleteFrom('saved_searches')
        .where('id', '=', searchId)
        .execute();
    });
  }

  /**
   * Get user's saved searches with filtering and pagination
   */
  async getUserSearches(
    userId: string, 
    options: SearchListOptions = {}
  ): Promise<PaginatedResponse<SavedSearch>> {
    const validatedOptions = SearchListOptionsSchema.parse(options);
    
    let query = this.db
      .selectFrom('saved_searches')
      .selectAll()
      .where((eb) => eb.or([
        eb('owner_id', '=', userId),
        eb('is_public', '=', true),
        eb.exists(
          eb
            .selectFrom('search_shares')
            .whereRef('search_id', '=', 'saved_searches.id')
            .where('shared_with_user_id', '=', userId)
        )
      ]));

    // Apply filters
    if (validatedOptions.tags?.length) {
      query = query.where('tags', '&&', validatedOptions.tags);
    }
    
    if (validatedOptions.isPublic !== undefined) {
      query = query.where('is_public', '=', validatedOptions.isPublic);
    }
    
    if (validatedOptions.isFavorite !== undefined) {
      query = query.where('is_favorite', '=', validatedOptions.isFavorite);
    }
    
    if (validatedOptions.collectionId) {
      query = query.where('id', 'in', (eb) =>
        eb
          .selectFrom('search_collection_items')
          .select('search_id')
          .where('collection_id', '=', validatedOptions.collectionId)
      );
    }
    
    if (validatedOptions.query) {
      const searchTerm = `%${validatedOptions.query}%`;
      query = query.where((eb) => eb.or([
        eb('name', 'ilike', searchTerm),
        eb('description', 'ilike', searchTerm)
      ]));
    }

    // Get total count
    const countQuery = query.clearSelect().select(this.db.fn.count('id').as('total'));
    const [{ total }] = await countQuery.execute();
    const totalItems = Number(total);

    // Apply sorting and pagination
    const sortColumn = this.mapSortColumn(validatedOptions.sortBy);
    query = query
      .orderBy(sortColumn, validatedOptions.sortOrder)
      .limit(validatedOptions.limit)
      .offset((validatedOptions.page - 1) * validatedOptions.limit);

    const results = await query.execute();
    const items = results.map(row => this.transformSavedSearchFromDb(row));

    const totalPages = Math.ceil(totalItems / validatedOptions.limit);

    return {
      items,
      totalItems,
      totalPages,
      currentPage: validatedOptions.page,
      hasNextPage: validatedOptions.page < totalPages,
      hasPreviousPage: validatedOptions.page > 1,
    };
  }

  /**
   * Get a specific saved search by ID
   */
  async getSearchById(searchId: string, userId: string): Promise<SavedSearch> {
    await this.validateSearchAccess(searchId, userId, 'view');

    const result = await this.db
      .selectFrom('saved_searches')
      .selectAll()
      .where('id', '=', searchId)
      .executeTakeFirst();

    if (!result) {
      throw new SearchNotFoundError(searchId);
    }

    // Track view analytics
    await this.trackSearchUsage(searchId, 'view', { userId });

    return this.transformSavedSearchFromDb(result);
  }

  /**
   * Execute a saved search and update execution statistics
   */
  async executeSearch(searchId: string, userId: string): Promise<any> {
    const savedSearch = await this.getSearchById(searchId, userId);
    
    const executionStart = Date.now();
    
    try {
      // Here we would integrate with the unified search service
      // For now, we'll simulate the execution
      const results = await this.simulateSearchExecution(savedSearch.queryData);
      
      const executionTime = Date.now() - executionStart;
      
      // Update execution statistics
      await this.db.transaction().execute(async (trx) => {
        // Update saved search execution count
        await trx
          .updateTable('saved_searches')
          .set({
            execution_count: this.db.fn.coalesce(
              this.db.raw('execution_count + 1'),
              1
            ),
            last_executed_at: new Date(),
            updated_at: new Date(),
          })
          .where('id', '=', searchId)
          .execute();

        // Record execution history
        await trx
          .insertInto('search_executions')
          .values({
            search_id: searchId,
            execution_type: 'manual',
            result_count: results.totalResults,
            execution_time_ms: executionTime,
            status: 'success',
            executed_by: userId,
          })
          .execute();

        // Track analytics
        await this.trackSearchUsage(
          searchId, 
          'execute', 
          { userId, resultCount: results.totalResults, executionTime },
          trx
        );
      });

      return results;
    } catch (error) {
      // Record failed execution
      await this.db
        .insertInto('search_executions')
        .values({
          search_id: searchId,
          execution_type: 'manual',
          execution_time_ms: Date.now() - executionStart,
          status: 'error',
          error_message: error instanceof Error ? error.message : 'Unknown error',
          executed_by: userId,
        })
        .execute();

      throw error;
    }
  }

  // ============================================================================
  // COLLECTION MANAGEMENT OPERATIONS
  // ============================================================================

  /**
   * Create a new search collection/folder
   */
  async createCollection(request: CreateCollectionRequest, userId: string): Promise<SearchCollection> {
    const validatedRequest = CreateCollectionRequestSchema.parse(request);
    
    const collectionData = {
      name: validatedRequest.name,
      description: validatedRequest.description,
      owner_id: userId,
      parent_collection_id: validatedRequest.parentCollectionId,
      is_shared: validatedRequest.isShared,
      color: validatedRequest.color,
      icon: validatedRequest.icon,
      created_at: new Date(),
      updated_at: new Date(),
    };

    const [collection] = await this.db
      .insertInto('search_collections')
      .values(collectionData)
      .returning('*')
      .execute();

    return this.transformCollectionFromDb(collection);
  }

  /**
   * Get user's collection tree with nested structure
   */
  async getCollections(userId: string): Promise<CollectionTreeNode[]> {
    const collections = await this.db
      .selectFrom('search_collections')
      .selectAll()
      .where('owner_id', '=', userId)
      .orderBy('sort_order', 'asc')
      .orderBy('name', 'asc')
      .execute();

    const collectionMap = new Map<string, CollectionTreeNode>();
    
    // Transform and index all collections
    for (const col of collections) {
      const transformedCol = this.transformCollectionFromDb(col) as CollectionTreeNode;
      transformedCol.children = [];
      transformedCol.searches = [];
      collectionMap.set(col.id, transformedCol);
    }

    // Build tree structure
    const rootCollections: CollectionTreeNode[] = [];
    
    for (const collection of collectionMap.values()) {
      if (collection.parentCollectionId) {
        const parent = collectionMap.get(collection.parentCollectionId);
        if (parent) {
          parent.children!.push(collection);
        }
      } else {
        rootCollections.push(collection);
      }
    }

    // Load searches for each collection
    for (const collection of collectionMap.values()) {
      const searches = await this.getCollectionSearches(collection.id);
      collection.searches = searches;
      collection.searchCount = searches.length;
    }

    return rootCollections;
  }

  /**
   * Add search to collection
   */
  async addToCollection(searchId: string, collectionId: string, userId: string): Promise<void> {
    await this.validateSearchAccess(searchId, userId, 'edit');
    await this.validateCollectionAccess(collectionId, userId, 'edit');

    await this.db
      .insertInto('search_collection_items')
      .values({
        search_id: searchId,
        collection_id: collectionId,
        added_by: userId,
      })
      .onConflict((oc) => oc.columns(['search_id', 'collection_id']).doNothing())
      .execute();
  }

  /**
   * Remove search from collection
   */
  async removeFromCollection(searchId: string, collectionId: string, userId: string): Promise<void> {
    await this.validateSearchAccess(searchId, userId, 'edit');
    await this.validateCollectionAccess(collectionId, userId, 'edit');

    await this.db
      .deleteFrom('search_collection_items')
      .where('search_id', '=', searchId)
      .where('collection_id', '=', collectionId)
      .execute();
  }

  // ============================================================================
  // VERSION MANAGEMENT OPERATIONS
  // ============================================================================

  /**
   * Create a new version of a saved search
   */
  async createVersion(searchId: string, changeDescription: string, userId: string): Promise<SearchVersion> {
    const savedSearch = await this.getSearchById(searchId, userId);
    
    // Get next version number
    const lastVersionResult = await this.db
      .selectFrom('search_versions')
      .select(this.db.fn.max('version_number').as('maxVersion'))
      .where('search_id', '=', searchId)
      .executeTakeFirst();

    const nextVersion = (lastVersionResult?.maxVersion || 0) + 1;

    const [version] = await this.db
      .insertInto('search_versions')
      .values({
        search_id: searchId,
        version_number: nextVersion,
        name: savedSearch.name,
        query_data: JSON.stringify(savedSearch.queryData),
        change_description: changeDescription,
        created_by: userId,
      })
      .returning('*')
      .execute();

    return this.transformVersionFromDb(version);
  }

  /**
   * Get version history for a saved search
   */
  async getVersionHistory(searchId: string, userId: string): Promise<SearchVersion[]> {
    await this.validateSearchAccess(searchId, userId, 'view');

    const versions = await this.db
      .selectFrom('search_versions')
      .selectAll()
      .where('search_id', '=', searchId)
      .orderBy('version_number', 'desc')
      .execute();

    return versions.map(v => this.transformVersionFromDb(v));
  }

  /**
   * Restore a previous version of a saved search
   */
  async restoreVersion(searchId: string, versionId: string, userId: string): Promise<SavedSearch> {
    await this.validateSearchAccess(searchId, userId, 'edit');

    const version = await this.db
      .selectFrom('search_versions')
      .selectAll()
      .where('id', '=', versionId)
      .where('search_id', '=', searchId)
      .executeTakeFirst();

    if (!version) {
      throw new VersionNotFoundError(versionId, searchId);
    }

    // Create a new version for current state before restoring
    await this.createVersion(searchId, `Restored from version ${version.version_number}`, userId);

    // Update the saved search with the restored version
    const queryData = JSON.parse(version.query_data);
    
    const updateRequest: UpdateSearchRequest = {
      name: version.name,
      queryData,
    };

    return this.updateSearch(searchId, updateRequest, userId);
  }

  // ============================================================================
  // ANALYTICS AND USAGE TRACKING
  // ============================================================================

  /**
   * Track search usage and analytics
   */
  async trackSearchUsage(
    searchId: string, 
    action: SearchAction, 
    metadata: Record<string, any> = {},
    transaction?: any
  ): Promise<void> {
    const db = transaction || this.db;
    
    await db
      .insertInto('search_analytics')
      .values({
        search_id: searchId,
        user_id: metadata.userId,
        action_type: action,
        result_count: metadata.resultCount,
        click_position: metadata.clickPosition,
        dwell_time_seconds: metadata.dwellTime,
        query_modifications: metadata.modifications ? JSON.stringify(metadata.modifications) : null,
      })
      .execute();
  }

  /**
   * Get analytics for a specific search
   */
  async getSearchAnalytics(searchId: string, userId: string, timeRange?: DateRange): Promise<SearchAnalytics> {
    await this.validateSearchAccess(searchId, userId, 'view');

    let query = this.db
      .selectFrom('search_analytics')
      .where('search_id', '=', searchId);

    if (timeRange) {
      query = query
        .where('created_at', '>=', timeRange.from)
        .where('created_at', '<=', timeRange.to);
    }

    const analytics = await query.selectAll().execute();
    
    // Process analytics data
    const totalExecutions = analytics.filter(a => a.action_type === 'execute').length;
    const uniqueUsers = new Set(analytics.map(a => a.user_id).filter(Boolean)).size;
    const executions = analytics.filter(a => a.action_type === 'execute');
    
    const averageResultCount = executions.length > 0 
      ? executions.reduce((sum, e) => sum + (e.result_count || 0), 0) / executions.length 
      : 0;

    // Additional analytics calculations would go here
    return {
      totalExecutions,
      uniqueUsers,
      averageResultCount,
      averageExecutionTime: 0, // Calculate from execution data
      popularTimeRanges: {},
      topModifications: {},
      clickThroughRates: {},
      usageByDay: {},
      errorRate: 0,
      mostClickedPositions: [],
    };
  }

  /**
   * Get user search statistics
   */
  async getUserSearchStats(userId: string): Promise<UserSearchStats> {
    const [searchStats, collectionStats, analyticsStats] = await Promise.all([
      this.db
        .selectFrom('saved_searches')
        .select([
          this.db.fn.count('id').as('totalSearches'),
          this.db.fn.sum('execution_count').as('totalExecutions'),
          this.db.fn.count('id').filterWhere('is_favorite', '=', true).as('favoriteSearches'),
        ])
        .where('owner_id', '=', userId)
        .executeTakeFirst(),

      this.db
        .selectFrom('search_collections')
        .select(this.db.fn.count('id').as('totalCollections'))
        .where('owner_id', '=', userId)
        .executeTakeFirst(),

      this.db
        .selectFrom('search_shares')
        .select(this.db.fn.count('id').as('sharedSearches'))
        .where('created_by', '=', userId)
        .executeTakeFirst(),
    ]);

    return {
      totalSavedSearches: Number(searchStats?.totalSearches || 0),
      totalExecutions: Number(searchStats?.totalExecutions || 0),
      favoriteSearches: Number(searchStats?.favoriteSearches || 0),
      sharedSearches: Number(analyticsStats?.sharedSearches || 0),
      scheduledSearches: 0, // Get from schedules table
      totalCollections: Number(collectionStats?.totalCollections || 0),
      averageSearchesPerCollection: 0, // Calculate
      mostUsedTags: [], // Get from tag analysis
      searchesCreatedByMonth: {},
      executionsByMonth: {},
    };
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  private sanitizeInput(input: string): string {
    // Basic HTML sanitization - remove all HTML tags and script content
    return input
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove script tags
      .replace(/<[^>]+>/g, '') // Remove all HTML tags
      .replace(/javascript:/gi, '') // Remove javascript: URLs
      .replace(/on\w+\s*=/gi, '') // Remove event handlers
      .trim();
  }

  private async validateSearchAccess(searchId: string, userId: string, permission: 'view' | 'edit' | 'admin'): Promise<void> {
    const search = await this.db
      .selectFrom('saved_searches')
      .select(['owner_id', 'is_public'])
      .where('id', '=', searchId)
      .executeTakeFirst();

    if (!search) {
      throw new SearchNotFoundError(searchId);
    }

    // Owner has all permissions
    if (search.owner_id === userId) {
      return;
    }

    // Public searches allow view access
    if (search.is_public && permission === 'view') {
      return;
    }

    // Check shared access
    const share = await this.db
      .selectFrom('search_shares')
      .select('permission_level')
      .where('search_id', '=', searchId)
      .where('shared_with_user_id', '=', userId)
      .where((eb) => eb.or([
        eb('expires_at', 'is', null),
        eb('expires_at', '>', new Date())
      ]))
      .executeTakeFirst();

    if (share) {
      const hasPermission = this.checkPermissionLevel(share.permission_level, permission);
      if (hasPermission) return;
    }

    throw new Error('Access denied');
  }

  private async validateCollectionAccess(collectionId: string, userId: string, permission: 'view' | 'edit' | 'admin'): Promise<void> {
    const collection = await this.db
      .selectFrom('search_collections')
      .select(['owner_id'])
      .where('id', '=', collectionId)
      .executeTakeFirst();

    if (!collection) {
      throw new CollectionNotFoundError(collectionId);
    }

    if (collection.owner_id !== userId) {
      throw new PermissionDeniedError('access resource', 'saved search', { searchId, userId });
    }
  }

  private checkPermissionLevel(grantedLevel: string, requiredLevel: string): boolean {
    const levels = { view: 1, edit: 2, admin: 3 };
    return levels[grantedLevel as keyof typeof levels] >= levels[requiredLevel as keyof typeof levels];
  }

  private async getCollectionSearches(collectionId: string): Promise<SavedSearch[]> {
    const results = await this.db
      .selectFrom('saved_searches')
      .innerJoin('search_collection_items', 'saved_searches.id', 'search_collection_items.search_id')
      .selectAll('saved_searches')
      .where('search_collection_items.collection_id', '=', collectionId)
      .orderBy('search_collection_items.added_at', 'desc')
      .execute();

    return results.map(row => this.transformSavedSearchFromDb(row));
  }

  private async simulateSearchExecution(queryData: any): Promise<any> {
    // This would integrate with the actual unified search service
    // For now, return mock results
    return {
      results: [],
      totalResults: Math.floor(Math.random() * 100),
      executionTime: Math.floor(Math.random() * 1000) + 100,
    };
  }

  private mapSortColumn(sortBy: string): string {
    const columnMap: Record<string, string> = {
      name: 'name',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      executionCount: 'execution_count',
      lastExecutedAt: 'last_executed_at',
    };
    return columnMap[sortBy] || 'updated_at';
  }

  private transformSavedSearchFromDb(row: any): SavedSearch {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      queryData: JSON.parse(row.query_data),
      ownerId: row.owner_id,
      isPublic: row.is_public,
      isFavorite: row.is_favorite,
      executionCount: row.execution_count,
      lastExecutedAt: row.last_executed_at,
      tags: row.tags || [],
      metadata: row.metadata || {},
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private transformCollectionFromDb(row: any): SearchCollection {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      ownerId: row.owner_id,
      parentCollectionId: row.parent_collection_id,
      isShared: row.is_shared,
      color: row.color,
      icon: row.icon,
      sortOrder: row.sort_order,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private transformVersionFromDb(row: any): SearchVersion {
    return {
      id: row.id,
      searchId: row.search_id,
      versionNumber: row.version_number,
      name: row.name,
      queryData: JSON.parse(row.query_data),
      changeDescription: row.change_description,
      createdBy: row.created_by,
      createdAt: row.created_at,
    };
  }
}