/**
 * Content Syndication Service
 * 
 * Manages content syndication across federation nodes with granular permissions,
 * real-time synchronization, conflict resolution, and compliance controls.
 * 
 * Part of Work Item 4.2.2 - Federation Protocol Implementation
 */

import { logger } from '../../utils/logger.js';
import { DatabaseConnectionPool } from '../../utils/database-pool.js';
import { 
  ContentSyndicationRule,
  SyndicatedContent,
  validateContentSyndicationRule,
  validateSyndicatedContent
} from '../../shared/types/federation.js';
import crypto from 'crypto';
import { sql } from 'kysely';

interface SyndicationTarget {
  node_id: string;
  endpoint: string;
  sync_status: 'pending' | 'syncing' | 'synced' | 'failed';
  last_sync: string | null;
  error_message?: string;
}

interface ContentChangeEvent {
  content_id: string;
  content_type: string;
  change_type: 'created' | 'updated' | 'deleted';
  change_hash: string;
  metadata: Record<string, any>;
  timestamp: string;
}

interface SyndicationPermissions {
  can_read: boolean;
  can_write: boolean;
  can_delete: boolean;
  data_classification: string;
  geographic_restrictions: string[];
  retention_days: number;
}

interface SyncConflictResolution {
  strategy: 'last_writer_wins' | 'merge' | 'manual_review' | 'source_priority';
  priority_rules: Record<string, number>;
  merge_fields: string[];
}

export class ContentSyndicationService {
  private db: DatabaseConnectionPool;
  private syncQueue = new Map<string, Promise<void>>();

  constructor() {
    this.db = new DatabaseConnectionPool();
  }

  // ===================
  // SYNDICATION RULES MANAGEMENT
  // ===================

  /**
   * Create content syndication rule
   */
  async createSyndicationRule(
    tenantId: string,
    ruleConfig: {
      rule_name: string;
      rule_type: string;
      content_types: string[];
      sharing_scope: string;
      target_organizations: string[];
      content_filters: Record<string, any>;
      permission_level: string;
      sync_frequency: string;
      data_classification: string;
      retention_period_days: number;
      encryption_required: boolean;
      audit_trail_required: boolean;
      approval_workflow: string;
      compliance_tags: string[];
    },
    createdBy: string
  ): Promise<ContentSyndicationRule> {
    logger.info(`Creating syndication rule: ${ruleConfig.rule_name} for tenant: ${tenantId}`);

    try {
      // Validate rule configuration
      if (!ruleConfig.rule_name || ruleConfig.rule_name.trim().length === 0) {
        throw new Error('Rule name is required');
      }

      if (ruleConfig.content_types.length === 0) {
        throw new Error('At least one content type must be specified');
      }

      // Create syndication rule
      const [syndicationRule] = await this.db.db
        .insertInto('content_syndication_rules')
        .values({
          tenant_id: tenantId,
          rule_name: ruleConfig.rule_name,
          rule_type: ruleConfig.rule_type,
          content_types: JSON.stringify(ruleConfig.content_types),
          sharing_scope: ruleConfig.sharing_scope,
          target_organizations: JSON.stringify(ruleConfig.target_organizations),
          content_filters: JSON.stringify(ruleConfig.content_filters),
          permission_level: ruleConfig.permission_level,
          sync_frequency: ruleConfig.sync_frequency,
          data_classification: ruleConfig.data_classification,
          retention_period_days: ruleConfig.retention_period_days,
          encryption_required: ruleConfig.encryption_required,
          audit_trail_required: ruleConfig.audit_trail_required,
          approval_workflow: ruleConfig.approval_workflow,
          compliance_tags: JSON.stringify(ruleConfig.compliance_tags),
          created_by: createdBy
        })
        .returningAll()
        .execute();

      // Log rule creation
      await this.logSyndicationActivity(tenantId, 'syndication_rule_created', {
        rule_id: syndicationRule.id,
        rule_name: ruleConfig.rule_name,
        created_by: createdBy
      });

      logger.info(`Successfully created syndication rule: ${syndicationRule.id}`);
      return validateContentSyndicationRule(syndicationRule);

    } catch (error) {
      logger.error('Failed to create syndication rule:', error);
      throw new Error(`Failed to create syndication rule: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Update syndication rule
   */
  async updateSyndicationRule(
    ruleId: string,
    tenantId: string,
    updates: Partial<{
      rule_name: string;
      content_types: string[];
      target_organizations: string[];
      content_filters: Record<string, any>;
      permission_level: string;
      sync_frequency: string;
      is_active: boolean;
    }>,
    updatedBy: string
  ): Promise<ContentSyndicationRule> {
    logger.info(`Updating syndication rule: ${ruleId}`);

    try {
      // Verify rule ownership
      const existingRule = await this.db.db
        .selectFrom('content_syndication_rules')
        .selectAll()
        .where('id', '=', ruleId)
        .where('tenant_id', '=', tenantId)
        .executeTakeFirst();

      if (!existingRule) {
        throw new Error('Syndication rule not found or access denied');
      }

      // Prepare update data
      const updateData: any = {
        updated_at: new Date().toISOString()
      };

      if (updates.rule_name) updateData.rule_name = updates.rule_name;
      if (updates.content_types) updateData.content_types = JSON.stringify(updates.content_types);
      if (updates.target_organizations) updateData.target_organizations = JSON.stringify(updates.target_organizations);
      if (updates.content_filters) updateData.content_filters = JSON.stringify(updates.content_filters);
      if (updates.permission_level) updateData.permission_level = updates.permission_level;
      if (updates.sync_frequency) updateData.sync_frequency = updates.sync_frequency;
      if (updates.is_active !== undefined) updateData.is_active = updates.is_active;

      // Update rule
      const [updatedRule] = await this.db.db
        .updateTable('content_syndication_rules')
        .set(updateData)
        .where('id', '=', ruleId)
        .where('tenant_id', '=', tenantId)
        .returningAll()
        .execute();

      if (!updatedRule) {
        throw new Error('Failed to update syndication rule');
      }

      // If rule was deactivated, pause all related syncing
      if (updates.is_active === false) {
        await this.pauseRuleSyncing(ruleId);
      }

      // Log rule update
      await this.logSyndicationActivity(tenantId, 'syndication_rule_updated', {
        rule_id: ruleId,
        updated_by: updatedBy,
        changes: Object.keys(updates)
      });

      logger.info(`Successfully updated syndication rule: ${ruleId}`);
      return validateContentSyndicationRule(updatedRule);

    } catch (error) {
      logger.error('Failed to update syndication rule:', error);
      throw new Error(`Failed to update syndication rule: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // ===================
  // CONTENT SYNDICATION
  // ===================

  /**
   * Syndicate content based on rules
   */
  async syndicateContent(
    tenantId: string,
    contentId: string,
    contentType: string,
    contentData: any,
    metadata: Record<string, any> = {}
  ): Promise<SyndicatedContent> {
    logger.info(`Syndicating content: ${contentId} (${contentType}) for tenant: ${tenantId}`);

    try {
      // Find applicable syndication rules
      const applicableRules = await this.findApplicableRules(tenantId, contentType, metadata);
      
      if (applicableRules.length === 0) {
        throw new Error('No applicable syndication rules found for this content');
      }

      // Select the most specific rule (first one with highest priority)
      const selectedRule = applicableRules[0];

      // Generate content hash for change detection
      const contentHash = this.generateContentHash(contentData);

      // Check if content is already syndicated
      const existingContent = await this.db.db
        .selectFrom('syndicated_content')
        .selectAll()
        .where('source_tenant_id', '=', tenantId)
        .where('source_content_id', '=', contentId)
        .where('source_content_type', '=', contentType)
        .executeTakeFirst();

      if (existingContent) {
        // Update existing syndicated content
        return await this.updateSyndicatedContent(
          existingContent.id,
          contentData,
          metadata,
          contentHash
        );
      }

      // Get target nodes for syndication
      const targetNodes = await this.getTargetNodes(selectedRule, tenantId);

      // Create syndicated content record
      const [syndicatedContent] = await this.db.db
        .insertInto('syndicated_content')
        .values({
          source_tenant_id: tenantId,
          source_content_id: contentId,
          source_content_type: contentType,
          syndication_rule_id: selectedRule.id,
          content_hash: contentHash,
          content_summary: this.generateContentSummary(contentData),
          content_metadata: JSON.stringify({
            ...metadata,
            syndication_timestamp: new Date().toISOString(),
            content_size: JSON.stringify(contentData).length
          }),
          sharing_permissions: JSON.stringify(this.generateSharingPermissions(selectedRule)),
          target_nodes: JSON.stringify(targetNodes.map(n => n.id)),
          sync_status: 'pending',
          change_detection_hash: contentHash,
          expires_at: this.calculateExpirationDate(selectedRule)
        })
        .returningAll()
        .execute();

      // Schedule synchronization to target nodes
      await this.scheduleSynchronization(syndicatedContent.id, targetNodes, contentData);

      // Log content syndication
      await this.logSyndicationActivity(tenantId, 'content_syndicated', {
        content_id: contentId,
        content_type: contentType,
        syndicated_content_id: syndicatedContent.id,
        target_nodes: targetNodes.length
      });

      logger.info(`Successfully created syndicated content: ${syndicatedContent.id}`);
      return validateSyndicatedContent(syndicatedContent);

    } catch (error) {
      logger.error('Failed to syndicate content:', error);
      throw new Error(`Failed to syndicate content: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Handle content changes and trigger synchronization
   */
  async handleContentChange(
    tenantId: string,
    changeEvent: ContentChangeEvent
  ): Promise<void> {
    logger.info(`Handling content change: ${changeEvent.content_id} (${changeEvent.change_type})`);

    try {
      // Find all syndicated content for this source content
      const syndicatedContents = await this.db.db
        .selectFrom('syndicated_content')
        .selectAll()
        .where('source_tenant_id', '=', tenantId)
        .where('source_content_id', '=', changeEvent.content_id)
        .where('source_content_type', '=', changeEvent.content_type)
        .execute();

      for (const syndicatedContent of syndicatedContents) {
        // Check if change hash is different (avoid unnecessary syncs)
        if (syndicatedContent.change_detection_hash === changeEvent.change_hash) {
          continue;
        }

        // Update change detection hash
        await this.db.db
          .updateTable('syndicated_content')
          .set({
            change_detection_hash: changeEvent.change_hash,
            sync_status: 'pending',
            last_sync_attempt: null,
            sync_error_count: 0,
            updated_at: new Date().toISOString()
          })
          .where('id', '=', syndicatedContent.id)
          .execute();

        // Get target nodes
        const targetNodeIds = JSON.parse(syndicatedContent.target_nodes as string);
        const targetNodes = await this.getNodesByIds(targetNodeIds);

        // Schedule re-synchronization
        await this.scheduleSynchronization(
          syndicatedContent.id,
          targetNodes,
          changeEvent.metadata
        );
      }

      logger.info(`Successfully handled content change for ${syndicatedContents.length} syndicated items`);

    } catch (error) {
      logger.error('Failed to handle content change:', error);
      throw new Error(`Failed to handle content change: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Synchronize content to target node
   */
  async synchronizeToNode(
    syndicatedContentId: string,
    targetNodeId: string,
    contentData: any,
    maxRetries: number = 3
  ): Promise<void> {
    const syncKey = `${syndicatedContentId}:${targetNodeId}`;
    
    // Prevent concurrent syncs
    if (this.syncQueue.has(syncKey)) {
      await this.syncQueue.get(syncKey);
      return;
    }

    const syncPromise = this.performNodeSync(syndicatedContentId, targetNodeId, contentData, maxRetries);
    this.syncQueue.set(syncKey, syncPromise);

    try {
      await syncPromise;
    } finally {
      this.syncQueue.delete(syncKey);
    }
  }

  // ===================
  // CONFLICT RESOLUTION
  // ===================

  /**
   * Resolve synchronization conflicts
   */
  async resolveConflict(
    syndicatedContentId: string,
    conflictData: {
      local_version: any;
      remote_version: any;
      conflict_type: string;
      node_id: string;
    },
    resolutionStrategy: SyncConflictResolution
  ): Promise<any> {
    logger.info(`Resolving sync conflict for content: ${syndicatedContentId}`);

    try {
      let resolvedContent: any;

      switch (resolutionStrategy.strategy) {
        case 'last_writer_wins':
          resolvedContent = this.resolveLastWriterWins(conflictData);
          break;
        case 'merge':
          resolvedContent = this.resolveMerge(conflictData, resolutionStrategy.merge_fields);
          break;
        case 'source_priority':
          resolvedContent = this.resolveSourcePriority(conflictData, resolutionStrategy.priority_rules);
          break;
        case 'manual_review':
          await this.createManualReviewTask(syndicatedContentId, conflictData);
          return null; // Requires manual intervention
        default:
          throw new Error(`Unknown conflict resolution strategy: ${resolutionStrategy.strategy}`);
      }

      // Update syndicated content with resolved version
      await this.db.db
        .updateTable('syndicated_content')
        .set({
          content_metadata: JSON.stringify({
            ...JSON.parse(conflictData.local_version.metadata || '{}'),
            conflict_resolved: true,
            resolution_strategy: resolutionStrategy.strategy,
            resolved_at: new Date().toISOString()
          }),
          updated_at: new Date().toISOString()
        })
        .where('id', '=', syndicatedContentId)
        .execute();

      // Log conflict resolution
      await this.logSyndicationActivity(
        conflictData.local_version.tenant_id,
        'conflict_resolved',
        {
          syndicated_content_id: syndicatedContentId,
          conflict_type: conflictData.conflict_type,
          resolution_strategy: resolutionStrategy.strategy,
          node_id: conflictData.node_id
        }
      );

      return resolvedContent;

    } catch (error) {
      logger.error('Failed to resolve conflict:', error);
      throw new Error(`Failed to resolve conflict: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // ===================
  // PRIVATE HELPER METHODS
  // ===================

  private async findApplicableRules(
    tenantId: string,
    contentType: string,
    metadata: Record<string, any>
  ): Promise<ContentSyndicationRule[]> {
    const rules = await this.db.db
      .selectFrom('content_syndication_rules')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('is_active', '=', true)
      .execute();

    return rules
      .filter(rule => {
        const contentTypes = JSON.parse(rule.content_types as string);
        return contentTypes.includes(contentType) || contentTypes.includes('*');
      })
      .map(rule => validateContentSyndicationRule(rule))
      .sort((a, b) => {
        // Sort by specificity (more specific rules first)
        const aSpecificity = JSON.parse(a.content_types).length;
        const bSpecificity = JSON.parse(b.content_types).length;
        return bSpecificity - aSpecificity;
      });
  }

  private async getTargetNodes(rule: ContentSyndicationRule, tenantId: string): Promise<any[]> {
    const targetOrgs = JSON.parse(rule.target_organizations);
    
    if (rule.sharing_scope === 'public') {
      // Get all active federation nodes
      return await this.db.db
        .selectFrom('federation_nodes')
        .select(['id', 'primary_endpoint', 'organization_name'])
        .where('status', '=', 'active')
        .where('health_status', 'in', ['healthy', 'degraded'])
        .where('tenant_id', '!=', tenantId)
        .execute();
    } else {
      // Get specific target nodes
      return await this.db.db
        .selectFrom('federation_nodes')
        .select(['id', 'primary_endpoint', 'organization_name'])
        .where('status', '=', 'active')
        .where('tenant_id', 'in', targetOrgs)
        .execute();
    }
  }

  private async getNodesByIds(nodeIds: string[]): Promise<any[]> {
    return await this.db.db
      .selectFrom('federation_nodes')
      .select(['id', 'primary_endpoint', 'organization_name'])
      .where('id', 'in', nodeIds)
      .where('status', '=', 'active')
      .execute();
  }

  private generateContentHash(contentData: any): string {
    return crypto
      .createHash('sha256')
      .update(JSON.stringify(contentData))
      .digest('hex');
  }

  private generateContentSummary(contentData: any): string {
    if (typeof contentData === 'string') {
      return contentData.substring(0, 200) + (contentData.length > 200 ? '...' : '');
    }
    
    if (contentData.title || contentData.name) {
      return contentData.title || contentData.name;
    }
    
    if (contentData.description) {
      return contentData.description.substring(0, 200);
    }
    
    return 'Content summary not available';
  }

  private generateSharingPermissions(rule: ContentSyndicationRule): SyndicationPermissions {
    return {
      can_read: true,
      can_write: rule.permission_level === 'write' || rule.permission_level === 'admin',
      can_delete: rule.permission_level === 'admin',
      data_classification: rule.data_classification,
      geographic_restrictions: [], // Would be populated from rule config
      retention_days: rule.retention_period_days
    };
  }

  private calculateExpirationDate(rule: ContentSyndicationRule): string | null {
    if (rule.retention_period_days) {
      const expiry = new Date();
      expiry.setDate(expiry.getDate() + rule.retention_period_days);
      return expiry.toISOString();
    }
    return null;
  }

  private async scheduleSynchronization(
    syndicatedContentId: string,
    targetNodes: any[],
    contentData: any
  ): Promise<void> {
    // Create webhook records for each target node
    for (const node of targetNodes) {
      await this.db.db
        .insertInto('syndication_webhooks')
        .values({
          syndicated_content_id: syndicatedContentId,
          target_node_id: node.id,
          webhook_type: 'content_sync',
          payload: JSON.stringify({
            action: 'sync',
            content_data: contentData,
            timestamp: new Date().toISOString()
          }),
          delivery_status: 'pending',
          next_attempt_at: new Date().toISOString()
        })
        .execute();
    }
  }

  private async performNodeSync(
    syndicatedContentId: string,
    targetNodeId: string,
    contentData: any,
    maxRetries: number
  ): Promise<void> {
    logger.info(`Synchronizing content ${syndicatedContentId} to node ${targetNodeId}`);

    try {
      // Get target node details
      const targetNode = await this.db.db
        .selectFrom('federation_nodes')
        .select(['primary_endpoint', 'authentication_method'])
        .where('id', '=', targetNodeId)
        .executeTakeFirst();

      if (!targetNode) {
        throw new Error('Target node not found');
      }

      // Get webhook record
      const webhook = await this.db.db
        .selectFrom('syndication_webhooks')
        .selectAll()
        .where('syndicated_content_id', '=', syndicatedContentId)
        .where('target_node_id', '=', targetNodeId)
        .where('delivery_status', 'in', ['pending', 'failed'])
        .executeTakeFirst();

      if (!webhook) {
        throw new Error('Webhook record not found');
      }

      // Attempt synchronization
      const startTime = Date.now();
      
      try {
        const response = await fetch(`${targetNode.primary_endpoint}/api/v1/federation/sync`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'MCP-Tools-Federation/1.0'
            // Would include authentication headers
          },
          body: webhook.payload,
          signal: AbortSignal.timeout(30000) // 30 second timeout
        });

        const responseTime = Date.now() - startTime;

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        // Update webhook as delivered
        await this.db.db
          .updateTable('syndication_webhooks')
          .set({
            delivery_status: 'delivered',
            response_status_code: response.status,
            response_time_ms: responseTime,
            delivered_at: new Date().toISOString()
          })
          .where('id', '=', webhook.id)
          .execute();

        // Update syndicated content sync status
        await this.db.db
          .updateTable('syndicated_content')
          .set({
            sync_status: 'synced',
            last_successful_sync: new Date().toISOString(),
            sync_error_count: 0
          })
          .where('id', '=', syndicatedContentId)
          .execute();

        logger.info(`Successfully synchronized content to node ${targetNodeId}`);

      } catch (syncError: any) {
        const responseTime = Date.now() - startTime;
        
        // Update webhook with error
        await this.db.db
          .updateTable('syndication_webhooks')
          .set({
            delivery_status: webhook.attempts_count >= maxRetries ? 'failed' : 'pending',
            attempts_count: webhook.attempts_count + 1,
            last_attempt_at: new Date().toISOString(),
            response_time_ms: responseTime,
            response_body: syncError.message
          })
          .where('id', '=', webhook.id)
          .execute();

        // Update syndicated content error count
        await this.db.db
          .updateTable('syndicated_content')
          .set({
            sync_status: 'failed',
            last_sync_attempt: new Date().toISOString(),
            sync_error_count: sql`sync_error_count + 1`,
            last_sync_error: syncError.message
          })
          .where('id', '=', syndicatedContentId)
          .execute();

        if (webhook.attempts_count >= maxRetries) {
          logger.error(`Max retry attempts reached for sync ${syndicatedContentId} -> ${targetNodeId}`);
        } else {
          // Schedule retry
          const retryDelay = Math.pow(2, webhook.attempts_count) * 60000; // Exponential backoff
          const nextAttempt = new Date(Date.now() + retryDelay);
          
          await this.db.db
            .updateTable('syndication_webhooks')
            .set({ next_attempt_at: nextAttempt.toISOString() })
            .where('id', '=', webhook.id)
            .execute();
        }

        throw syncError;
      }

    } catch (error) {
      logger.error('Failed to perform node sync:', error);
      throw error;
    }
  }

  private async updateSyndicatedContent(
    syndicatedContentId: string,
    contentData: any,
    metadata: Record<string, any>,
    contentHash: string
  ): Promise<SyndicatedContent> {
    const [updatedContent] = await this.db.db
      .updateTable('syndicated_content')
      .set({
        content_hash: contentHash,
        content_metadata: JSON.stringify(metadata),
        change_detection_hash: contentHash,
        sync_status: 'pending',
        version_number: sql`version_number + 1`,
        updated_at: new Date().toISOString()
      })
      .where('id', '=', syndicatedContentId)
      .returningAll()
      .execute();

    return validateSyndicatedContent(updatedContent);
  }

  private async pauseRuleSyncing(ruleId: string): Promise<void> {
    await this.db.db
      .updateTable('syndicated_content')
      .set({ sync_status: 'paused' })
      .where('syndication_rule_id', '=', ruleId)
      .execute();
  }

  private resolveLastWriterWins(conflictData: any): any {
    const localTimestamp = new Date(conflictData.local_version.updated_at || conflictData.local_version.created_at);
    const remoteTimestamp = new Date(conflictData.remote_version.updated_at || conflictData.remote_version.created_at);
    
    return remoteTimestamp > localTimestamp ? conflictData.remote_version : conflictData.local_version;
  }

  private resolveMerge(conflictData: any, mergeFields: string[]): any {
    const resolved = { ...conflictData.local_version };
    
    // Merge specific fields from remote version
    for (const field of mergeFields) {
      if (conflictData.remote_version[field] !== undefined) {
        resolved[field] = conflictData.remote_version[field];
      }
    }
    
    return resolved;
  }

  private resolveSourcePriority(conflictData: any, priorityRules: Record<string, number>): any {
    const localPriority = priorityRules[conflictData.local_version.source] || 0;
    const remotePriority = priorityRules[conflictData.remote_version.source] || 0;
    
    return remotePriority > localPriority ? conflictData.remote_version : conflictData.local_version;
  }

  private async createManualReviewTask(syndicatedContentId: string, conflictData: any): Promise<void> {
    // Create a manual review task - would integrate with task management system
    logger.info(`Manual review required for syndicated content: ${syndicatedContentId}`);
    
    // In a real implementation, this would create a task in the task management system
    // or send notifications to administrators
  }

  private async logSyndicationActivity(
    tenantId: string,
    action: string,
    details: Record<string, any>
  ): Promise<void> {
    try {
      await this.db.db
        .insertInto('tenant_audit_logs')
        .values({
          tenant_id: tenantId,
          action,
          resource_type: 'content_syndication',
          resource_id: details.content_id || details.rule_id || details.syndicated_content_id,
          action_details: JSON.stringify(details),
          is_cross_tenant: true
        })
        .execute();
    } catch (error) {
      logger.error('Failed to log syndication activity:', error);
    }
  }

  // ===================
  // PUBLIC API METHODS
  // ===================

  /**
   * Get syndicated content for tenant
   */
  async getSyndicatedContent(
    tenantId: string,
    limit: number = 20,
    offset: number = 0
  ): Promise<SyndicatedContent[]> {
    try {
      const syndicatedContents = await this.db.db
        .selectFrom('syndicated_content')
        .selectAll()
        .where('source_tenant_id', '=', tenantId)
        .orderBy('created_at', 'desc')
        .limit(limit)
        .offset(offset)
        .execute();

      return syndicatedContents.map(content => validateSyndicatedContent(content));

    } catch (error) {
      logger.error('Failed to get syndicated content:', error);
      throw new Error(`Failed to get syndicated content: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get syndication statistics
   */
  async getSyndicationStatistics(tenantId: string): Promise<{
    total_syndicated_content: number;
    active_rules: number;
    successful_syncs: number;
    failed_syncs: number;
    pending_syncs: number;
  }> {
    try {
      const [totalContent] = await this.db.db
        .selectFrom('syndicated_content')
        .select((eb) => eb.fn.count<number>('id').as('count'))
        .where('source_tenant_id', '=', tenantId)
        .execute();

      const [activeRules] = await this.db.db
        .selectFrom('content_syndication_rules')
        .select((eb) => eb.fn.count<number>('id').as('count'))
        .where('tenant_id', '=', tenantId)
        .where('is_active', '=', true)
        .execute();

      const [successfulSyncs] = await this.db.db
        .selectFrom('syndicated_content')
        .select((eb) => eb.fn.count<number>('id').as('count'))
        .where('source_tenant_id', '=', tenantId)
        .where('sync_status', '=', 'synced')
        .execute();

      const [failedSyncs] = await this.db.db
        .selectFrom('syndicated_content')
        .select((eb) => eb.fn.count<number>('id').as('count'))
        .where('source_tenant_id', '=', tenantId)
        .where('sync_status', '=', 'failed')
        .execute();

      const [pendingSyncs] = await this.db.db
        .selectFrom('syndicated_content')
        .select((eb) => eb.fn.count<number>('id').as('count'))
        .where('source_tenant_id', '=', tenantId)
        .where('sync_status', 'in', ['pending', 'syncing'])
        .execute();

      return {
        total_syndicated_content: totalContent.count || 0,
        active_rules: activeRules.count || 0,
        successful_syncs: successfulSyncs.count || 0,
        failed_syncs: failedSyncs.count || 0,
        pending_syncs: pendingSyncs.count || 0
      };

    } catch (error) {
      logger.error('Failed to get syndication statistics:', error);
      throw new Error(`Failed to get syndication statistics: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}