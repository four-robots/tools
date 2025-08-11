import { DatabasePool } from '../../utils/database-pool.js';
import { Logger } from '../../utils/logger.js';
import { randomUUID } from 'crypto';
import { z } from 'zod';

/**
 * Cross-service resource types supported by whiteboard integration
 */
export const ResourceType = z.enum(['kanban_card', 'wiki_page', 'memory_node']);
export type ResourceType = z.infer<typeof ResourceType>;

/**
 * Sync status for resource attachments
 */
export const SyncStatus = z.enum(['active', 'broken', 'outdated', 'conflict']);
export type SyncStatus = z.infer<typeof SyncStatus>;

/**
 * Integration event types for tracking cross-service interactions
 */
export const IntegrationEventType = z.enum([
  'search', 'attach', 'detach', 'sync', 'create_from_whiteboard', 'update_from_source', 'conflict_detected'
]);
export type IntegrationEventType = z.infer<typeof IntegrationEventType>;

/**
 * Unified search result from cross-service queries
 */
export const UnifiedSearchResult = z.object({
  id: z.string().uuid(),
  type: ResourceType,
  title: z.string(),
  description: z.string().optional(),
  content: z.string().optional(),
  metadata: z.record(z.string(), z.any()).default({}),
  score: z.number().min(0).max(1).default(0), // Relevance score
  service: z.string(), // Source service identifier
  lastModified: z.string().datetime(),
  author: z.string().optional(),
  tags: z.array(z.string()).default([]),
  attachable: z.boolean().default(true), // Whether this can be attached to whiteboard
});
export type UnifiedSearchResult = z.infer<typeof UnifiedSearchResult>;

/**
 * Search request parameters
 */
export const UnifiedSearchRequest = z.object({
  query: z.string().min(1).max(500),
  services: z.array(z.string()).default(['kanban', 'wiki', 'memory']), // Services to search
  filters: z.record(z.string(), z.any()).default({}), // Service-specific filters
  limit: z.number().min(1).max(50).default(20),
  includeContent: z.boolean().default(false), // Whether to include full content
});
export type UnifiedSearchRequest = z.infer<typeof UnifiedSearchRequest>;

/**
 * Resource attachment data
 */
export const ResourceAttachment = z.object({
  id: z.string().uuid(),
  whiteboardId: z.string().uuid(),
  elementId: z.string().uuid(),
  resourceType: ResourceType,
  resourceId: z.string().uuid(),
  resourceMetadata: z.record(z.string(), z.any()).default({}),
  attachmentMetadata: z.record(z.string(), z.any()).default({}),
  syncStatus: SyncStatus,
  lastSyncAt: z.string().datetime(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ResourceAttachment = z.infer<typeof ResourceAttachment>;

/**
 * Integration event for tracking
 */
export const IntegrationEvent = z.object({
  id: z.string().uuid(),
  whiteboardId: z.string().uuid(),
  userId: z.string().uuid(),
  eventType: IntegrationEventType,
  serviceType: z.string(),
  resourceId: z.string().uuid(),
  elementId: z.string().uuid().optional(),
  eventData: z.record(z.string(), z.any()).default({}),
  success: z.boolean(),
  errorMessage: z.string().optional(),
  processingTimeMs: z.number().optional(),
  createdAt: z.string().datetime(),
});
export type IntegrationEvent = z.infer<typeof IntegrationEvent>;

/**
 * Request to attach a resource to a whiteboard element
 */
export const AttachResourceRequest = z.object({
  resourceType: ResourceType,
  resourceId: z.string().uuid(),
  elementId: z.string().uuid(),
  attachmentMetadata: z.record(z.string(), z.any()).default({}),
  syncEnabled: z.boolean().default(true),
});
export type AttachResourceRequest = z.infer<typeof AttachResourceRequest>;

/**
 * Whiteboard Integration Service
 * 
 * Handles cross-service integration functionality for the collaborative whiteboard:
 * - Unified search across Kanban, Wiki, and Memory services
 * - Resource attachment and synchronization
 * - Real-time updates when external resources change
 * - Performance optimization through caching
 */
export class WhiteboardIntegrationService {
  private logger: Logger;

  constructor(
    private db: DatabasePool,
    logger?: Logger
  ) {
    this.logger = logger || new Logger('WhiteboardIntegrationService');
  }

  /**
   * Unified search across all MCP services
   */
  async unifiedSearch(
    whiteboardId: string,
    userId: string,
    request: UnifiedSearchRequest
  ): Promise<{ results: UnifiedSearchResult[]; cached: boolean; totalResults: number }> {
    const startTime = Date.now();
    
    try {
      // Check cache first
      const cachedResults = await this.getCachedSearchResults(whiteboardId, request);
      if (cachedResults) {
        await this.logIntegrationEvent(whiteboardId, userId, 'search', 'cache', '', {
          query: request.query,
          cached: true,
          resultCount: cachedResults.results.length
        }, true, undefined, Date.now() - startTime);

        return { ...cachedResults, cached: true };
      }

      // Perform fresh search across services
      const allResults: UnifiedSearchResult[] = [];
      const searchPromises: Promise<UnifiedSearchResult[]>[] = [];

      // Search each service in parallel
      if (request.services.includes('kanban')) {
        searchPromises.push(this.searchKanbanService(request));
      }
      if (request.services.includes('wiki')) {
        searchPromises.push(this.searchWikiService(request));
      }
      if (request.services.includes('memory')) {
        searchPromises.push(this.searchMemoryService(request));
      }

      // Wait for all searches to complete
      const serviceResults = await Promise.allSettled(searchPromises);
      
      // Collect successful results
      serviceResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          allResults.push(...result.value);
        } else {
          this.logger.warn(`Search failed for service ${request.services[index]}`, { error: result.reason });
        }
      });

      // Sort by relevance score and limit results
      const sortedResults = allResults
        .sort((a, b) => b.score - a.score)
        .slice(0, request.limit);

      const searchResponse = {
        results: sortedResults,
        cached: false,
        totalResults: allResults.length
      };

      // Cache the results
      await this.cacheSearchResults(whiteboardId, request, searchResponse);

      // Log the search event
      await this.logIntegrationEvent(whiteboardId, userId, 'search', 'unified', '', {
        query: request.query,
        servicesSearched: request.services,
        totalResults: allResults.length,
        returnedResults: sortedResults.length,
        cached: false
      }, true, undefined, Date.now() - startTime);

      return searchResponse;

    } catch (error) {
      this.logger.error('Unified search failed', { error, whiteboardId, userId, request });
      
      await this.logIntegrationEvent(whiteboardId, userId, 'search', 'unified', '', {
        query: request.query,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, false, error instanceof Error ? error.message : 'Unknown error', Date.now() - startTime);

      throw error;
    }
  }

  /**
   * Attach a resource from another service to a whiteboard element
   */
  async attachResource(
    whiteboardId: string,
    userId: string,
    request: AttachResourceRequest
  ): Promise<ResourceAttachment> {
    const startTime = Date.now();
    
    try {
      // Validate that the whiteboard and element exist
      await this.validateWhiteboardAndElement(whiteboardId, request.elementId, userId);

      // Fetch resource metadata from the source service
      const resourceMetadata = await this.fetchResourceMetadata(request.resourceType, request.resourceId);
      
      const attachmentId = randomUUID();
      const now = new Date().toISOString();

      // Create the resource attachment
      const insertQuery = `
        INSERT INTO whiteboard_resource_attachments (
          id, whiteboard_id, element_id, resource_type, resource_id,
          resource_metadata, attachment_metadata, sync_status, last_sync_at,
          created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *
      `;

      const result = await this.db.query(insertQuery, [
        attachmentId,
        whiteboardId,
        request.elementId,
        request.resourceType,
        request.resourceId,
        JSON.stringify(resourceMetadata),
        JSON.stringify(request.attachmentMetadata),
        'active',
        now,
        now,
        now
      ]);

      if (result.rows.length === 0) {
        throw new Error('Failed to create resource attachment');
      }

      // Update the whiteboard element with integration data
      await this.updateElementIntegration(request.elementId, request.resourceType, {
        resourceId: request.resourceId,
        syncEnabled: request.syncEnabled,
        attachmentId: attachmentId
      });

      const attachment = this.mapDatabaseRowToResourceAttachment(result.rows[0]);

      // Log the attachment event
      await this.logIntegrationEvent(whiteboardId, userId, 'attach', request.resourceType, request.resourceId, {
        elementId: request.elementId,
        attachmentId: attachmentId,
        resourceMetadata
      }, true, undefined, Date.now() - startTime, request.elementId);

      this.logger.info('Resource attached successfully', { 
        whiteboardId, 
        userId, 
        attachmentId, 
        resourceType: request.resourceType, 
        resourceId: request.resourceId 
      });

      return attachment;

    } catch (error) {
      this.logger.error('Failed to attach resource', { error, whiteboardId, userId, request });
      
      await this.logIntegrationEvent(whiteboardId, userId, 'attach', request.resourceType, request.resourceId, {
        elementId: request.elementId,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, false, error instanceof Error ? error.message : 'Unknown error', Date.now() - startTime, request.elementId);

      throw error;
    }
  }

  /**
   * Get all resource attachments for a whiteboard
   */
  async getWhiteboardAttachments(
    whiteboardId: string,
    userId: string
  ): Promise<ResourceAttachment[]> {
    try {
      // Validate access to whiteboard
      await this.validateWhiteboardAccess(whiteboardId, userId);

      const query = `
        SELECT * FROM whiteboard_resource_attachments
        WHERE whiteboard_id = $1
        ORDER BY created_at DESC
      `;

      const result = await this.db.query(query, [whiteboardId]);
      
      return result.rows.map(row => this.mapDatabaseRowToResourceAttachment(row));

    } catch (error) {
      this.logger.error('Failed to get whiteboard attachments', { error, whiteboardId, userId });
      throw error;
    }
  }

  /**
   * Detach a resource from a whiteboard element
   */
  async detachResource(
    whiteboardId: string,
    attachmentId: string,
    userId: string
  ): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Get attachment info for logging
      const attachmentQuery = `
        SELECT * FROM whiteboard_resource_attachments
        WHERE id = $1 AND whiteboard_id = $2
      `;
      
      const attachmentResult = await this.db.query(attachmentQuery, [attachmentId, whiteboardId]);
      
      if (attachmentResult.rows.length === 0) {
        throw new Error('Attachment not found');
      }

      const attachment = attachmentResult.rows[0];

      // Remove the attachment
      const deleteQuery = `
        DELETE FROM whiteboard_resource_attachments
        WHERE id = $1 AND whiteboard_id = $2
      `;

      const result = await this.db.query(deleteQuery, [attachmentId, whiteboardId]);

      if (result.rowCount === 0) {
        throw new Error('Failed to delete attachment');
      }

      // Clear integration data from the element
      await this.clearElementIntegration(attachment.element_id);

      // Log the detachment event
      await this.logIntegrationEvent(whiteboardId, userId, 'detach', attachment.resource_type, attachment.resource_id, {
        attachmentId,
        elementId: attachment.element_id
      }, true, undefined, Date.now() - startTime, attachment.element_id);

      this.logger.info('Resource detached successfully', { whiteboardId, userId, attachmentId });

    } catch (error) {
      this.logger.error('Failed to detach resource', { error, whiteboardId, attachmentId, userId });
      
      await this.logIntegrationEvent(whiteboardId, userId, 'detach', 'unknown', '', {
        attachmentId,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, false, error instanceof Error ? error.message : 'Unknown error', Date.now() - startTime);

      throw error;
    }
  }

  /**
   * Sync resource data from external services
   */
  async syncResourceAttachments(whiteboardId: string, userId: string): Promise<{
    synced: number;
    failed: number;
    conflicts: number;
  }> {
    try {
      const attachments = await this.getWhiteboardAttachments(whiteboardId, userId);
      
      let synced = 0;
      let failed = 0;
      let conflicts = 0;

      // Process each attachment
      for (const attachment of attachments) {
        try {
          const currentMetadata = await this.fetchResourceMetadata(
            attachment.resourceType, 
            attachment.resourceId
          );

          // Check if data has changed
          const hasChanged = JSON.stringify(currentMetadata) !== JSON.stringify(attachment.resourceMetadata);
          
          if (hasChanged) {
            // Update the attachment with new metadata
            const updateQuery = `
              UPDATE whiteboard_resource_attachments
              SET resource_metadata = $1, last_sync_at = $2, updated_at = $2
              WHERE id = $3
            `;

            await this.db.query(updateQuery, [
              JSON.stringify(currentMetadata),
              new Date().toISOString(),
              attachment.id
            ]);

            synced++;

            // Log sync event
            await this.logIntegrationEvent(whiteboardId, userId, 'sync', attachment.resourceType, attachment.resourceId, {
              attachmentId: attachment.id,
              elementId: attachment.elementId,
              changes: this.detectChanges(attachment.resourceMetadata, currentMetadata)
            }, true, undefined, undefined, attachment.elementId);
          }

        } catch (error) {
          failed++;
          this.logger.warn('Failed to sync resource attachment', {
            error,
            attachmentId: attachment.id,
            resourceType: attachment.resourceType,
            resourceId: attachment.resourceId
          });

          // Update sync status to broken
          await this.db.query(
            'UPDATE whiteboard_resource_attachments SET sync_status = $1 WHERE id = $2',
            ['broken', attachment.id]
          );
        }
      }

      this.logger.info('Resource sync completed', { whiteboardId, synced, failed, conflicts });

      return { synced, failed, conflicts };

    } catch (error) {
      this.logger.error('Failed to sync resource attachments', { error, whiteboardId, userId });
      throw error;
    }
  }

  // Private helper methods

  private async getCachedSearchResults(
    whiteboardId: string,
    request: UnifiedSearchRequest
  ): Promise<{ results: UnifiedSearchResult[]; totalResults: number } | null> {
    try {
      const query = `
        SELECT search_results, result_count
        FROM whiteboard_search_cache
        WHERE whiteboard_id = $1 
          AND search_query = $2 
          AND search_filters = $3
          AND services_searched = $4
          AND expires_at > CURRENT_TIMESTAMP
        ORDER BY search_timestamp DESC
        LIMIT 1
      `;

      const result = await this.db.query(query, [
        whiteboardId,
        request.query,
        JSON.stringify(request.filters),
        request.services
      ]);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        results: row.search_results || [],
        totalResults: row.result_count || 0
      };

    } catch (error) {
      this.logger.warn('Failed to get cached search results', { error });
      return null;
    }
  }

  private async cacheSearchResults(
    whiteboardId: string,
    request: UnifiedSearchRequest,
    response: { results: UnifiedSearchResult[]; totalResults: number }
  ): Promise<void> {
    try {
      const insertQuery = `
        INSERT INTO whiteboard_search_cache (
          whiteboard_id, search_query, search_filters, search_results,
          result_count, services_searched, search_timestamp, expires_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '1 hour')
      `;

      await this.db.query(insertQuery, [
        whiteboardId,
        request.query,
        JSON.stringify(request.filters),
        JSON.stringify(response.results),
        response.totalResults,
        request.services
      ]);

    } catch (error) {
      this.logger.warn('Failed to cache search results', { error });
      // Don't throw - caching is optional
    }
  }

  private async searchKanbanService(request: UnifiedSearchRequest): Promise<UnifiedSearchResult[]> {
    // TODO: Implement integration with KanbanService
    // This will use the existing KanbanService to search cards
    return [];
  }

  private async searchWikiService(request: UnifiedSearchRequest): Promise<UnifiedSearchResult[]> {
    // TODO: Implement integration with WikiService  
    // This will use the existing WikiService to search pages
    return [];
  }

  private async searchMemoryService(request: UnifiedSearchRequest): Promise<UnifiedSearchResult[]> {
    // TODO: Implement integration with MemoryService
    // This will use the existing MemoryService to search nodes
    return [];
  }

  private async fetchResourceMetadata(resourceType: ResourceType, resourceId: string): Promise<any> {
    // TODO: Implement fetching metadata from each service
    switch (resourceType) {
      case 'kanban_card':
        // Fetch from KanbanService
        return {};
      case 'wiki_page':
        // Fetch from WikiService
        return {};
      case 'memory_node':
        // Fetch from MemoryService
        return {};
      default:
        throw new Error(`Unknown resource type: ${resourceType}`);
    }
  }

  private async validateWhiteboardAndElement(
    whiteboardId: string,
    elementId: string,
    userId: string
  ): Promise<void> {
    const query = `
      SELECT w.id, we.id as element_id
      FROM whiteboards w
      JOIN whiteboard_elements we ON w.id = we.whiteboard_id
      WHERE w.id = $1 AND we.id = $2 AND w.deleted_at IS NULL AND we.deleted_at IS NULL
    `;

    const result = await this.db.query(query, [whiteboardId, elementId]);

    if (result.rows.length === 0) {
      throw new Error('Whiteboard or element not found');
    }

    // TODO: Add permission check
  }

  private async validateWhiteboardAccess(whiteboardId: string, userId: string): Promise<void> {
    const query = `
      SELECT id FROM whiteboards 
      WHERE id = $1 AND deleted_at IS NULL
    `;

    const result = await this.db.query(query, [whiteboardId]);

    if (result.rows.length === 0) {
      throw new Error('Whiteboard not found');
    }

    // TODO: Add permission check
  }

  private async updateElementIntegration(
    elementId: string,
    integrationType: string,
    integrationData: any
  ): Promise<void> {
    const query = `
      UPDATE whiteboard_elements
      SET integration_type = $1, integration_data = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
    `;

    await this.db.query(query, [
      integrationType,
      JSON.stringify(integrationData),
      elementId
    ]);
  }

  private async clearElementIntegration(elementId: string): Promise<void> {
    const query = `
      UPDATE whiteboard_elements
      SET integration_type = NULL, integration_data = '{}', updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `;

    await this.db.query(query, [elementId]);
  }

  private async logIntegrationEvent(
    whiteboardId: string,
    userId: string,
    eventType: IntegrationEventType,
    serviceType: string,
    resourceId: string,
    eventData: any,
    success: boolean,
    errorMessage?: string,
    processingTimeMs?: number,
    elementId?: string
  ): Promise<void> {
    try {
      const insertQuery = `
        INSERT INTO whiteboard_integration_events (
          whiteboard_id, user_id, event_type, service_type, resource_id,
          element_id, event_data, success, error_message, processing_time_ms
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `;

      await this.db.query(insertQuery, [
        whiteboardId,
        userId,
        eventType,
        serviceType,
        resourceId || randomUUID(), // Use random UUID if no resource ID
        elementId,
        JSON.stringify(eventData),
        success,
        errorMessage,
        processingTimeMs
      ]);

    } catch (error) {
      this.logger.warn('Failed to log integration event', { error });
      // Don't throw - logging is optional
    }
  }

  private detectChanges(oldData: any, newData: any): any {
    // Simple change detection - can be enhanced
    const changes: any = {};
    
    if (JSON.stringify(oldData) !== JSON.stringify(newData)) {
      changes.hasChanges = true;
      changes.oldData = oldData;
      changes.newData = newData;
    } else {
      changes.hasChanges = false;
    }

    return changes;
  }

  private mapDatabaseRowToResourceAttachment(row: any): ResourceAttachment {
    return {
      id: row.id,
      whiteboardId: row.whiteboard_id,
      elementId: row.element_id,
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      resourceMetadata: row.resource_metadata || {},
      attachmentMetadata: row.attachment_metadata || {},
      syncStatus: row.sync_status,
      lastSyncAt: row.last_sync_at?.toISOString() || new Date().toISOString(),
      createdAt: row.created_at?.toISOString() || new Date().toISOString(),
      updatedAt: row.updated_at?.toISOString() || new Date().toISOString(),
    };
  }
}