import { DatabasePool } from '../../utils/database-pool.js';
import { Logger } from '../../utils/logger.js';
import {
  WorkspaceIntegration,
  WorkspaceIntegrationType,
  WorkspaceIntegrationStatus,
  CreateIntegrationRequest,
  WorkspaceError,
} from '@shared/types/workspace.js';
import { randomUUID } from 'crypto';

/**
 * Workspace integration service for external tool connections
 */
export class WorkspaceIntegrationService {
  private logger: Logger;

  constructor(
    private db: DatabasePool,
    logger?: Logger
  ) {
    this.logger = logger || new Logger('WorkspaceIntegrationService');
  }

  /**
   * Create a new workspace integration
   */
  async createIntegration(
    workspaceId: string,
    userId: string,
    tenantId: string,
    request: CreateIntegrationRequest
  ): Promise<WorkspaceIntegration> {
    try {
      // Check permissions
      await this.checkIntegrationPermission(workspaceId, userId, tenantId);

      // Validate integration type
      await this.validateIntegrationType(request.integrationType, request.configuration);

      const integrationId = randomUUID();
      const now = new Date().toISOString();

      const integration: WorkspaceIntegration = {
        id: integrationId,
        workspaceId,
        integrationType: request.integrationType,
        externalId: request.externalId,
        configuration: request.configuration,
        credentials: request.credentials,
        status: 'configuring',
        errorCount: 0,
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      };

      const query = `
        INSERT INTO workspace_integrations (
          id, workspace_id, integration_type, external_id, configuration,
          credentials, status, error_count, created_by, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *
      `;

      const result = await this.db.query(query, [
        integration.id,
        integration.workspaceId,
        integration.integrationType,
        integration.externalId,
        JSON.stringify(integration.configuration),
        integration.credentials ? JSON.stringify(integration.credentials) : null,
        integration.status,
        integration.errorCount,
        integration.createdBy,
        integration.createdAt,
        integration.updatedAt,
      ]);

      if (result.rows.length === 0) {
        throw new Error('Failed to create integration');
      }

      // Initialize integration
      await this.initializeIntegration(integrationId, request.integrationType, request.configuration);

      this.logger.info('Integration created successfully', { 
        integrationId, workspaceId, type: request.integrationType 
      });

      return this.mapDatabaseRowToIntegration(result.rows[0]);
    } catch (error) {
      this.logger.error('Failed to create integration', { error, workspaceId, userId, request });
      throw error;
    }
  }

  /**
   * Get integration by ID
   */
  async getIntegration(
    integrationId: string,
    userId: string,
    tenantId: string
  ): Promise<WorkspaceIntegration | null> {
    try {
      const query = `
        SELECT wi.*, w.tenant_id
        FROM workspace_integrations wi
        JOIN collaborative_workspaces w ON wi.workspace_id = w.id
        WHERE wi.id = $1 AND w.tenant_id = $2
      `;

      const result = await this.db.query(query, [integrationId, tenantId]);

      if (result.rows.length === 0) {
        return null;
      }

      // Check access permissions
      await this.checkIntegrationAccess(result.rows[0].workspace_id, userId, tenantId);

      return this.mapDatabaseRowToIntegration(result.rows[0]);
    } catch (error) {
      this.logger.error('Failed to get integration', { error, integrationId, userId });
      throw error;
    }
  }

  /**
   * Update integration
   */
  async updateIntegration(
    integrationId: string,
    userId: string,
    tenantId: string,
    updates: Partial<CreateIntegrationRequest>
  ): Promise<WorkspaceIntegration> {
    try {
      const integration = await this.getIntegration(integrationId, userId, tenantId);
      if (!integration) {
        throw this.createIntegrationError('INTEGRATION_NOT_FOUND', 'Integration not found');
      }

      // Check permissions
      await this.checkIntegrationPermission(integration.workspaceId, userId, tenantId);

      const updateFields: string[] = [];
      const values: any[] = [];
      let valueIndex = 1;

      if (updates.externalId !== undefined) {
        updateFields.push(`external_id = $${valueIndex++}`);
        values.push(updates.externalId);
      }

      if (updates.configuration !== undefined) {
        updateFields.push(`configuration = $${valueIndex++}`);
        values.push(JSON.stringify(updates.configuration));
        
        // Validate new configuration
        await this.validateIntegrationType(integration.integrationType, updates.configuration);
      }

      if (updates.credentials !== undefined) {
        updateFields.push(`credentials = $${valueIndex++}`);
        values.push(updates.credentials ? JSON.stringify(updates.credentials) : null);
      }

      updateFields.push(`updated_at = $${valueIndex++}`);
      values.push(new Date().toISOString());

      // Reset error count on configuration change
      if (updates.configuration !== undefined || updates.credentials !== undefined) {
        updateFields.push(`error_count = $${valueIndex++}`);
        values.push(0);
      }

      values.push(integrationId);

      const query = `
        UPDATE workspace_integrations
        SET ${updateFields.join(', ')}
        WHERE id = $${valueIndex++}
        RETURNING *
      `;

      const result = await this.db.query(query, values);

      if (result.rows.length === 0) {
        throw this.createIntegrationError('INTEGRATION_NOT_FOUND', 'Integration not found');
      }

      // Re-initialize integration if configuration changed
      if (updates.configuration !== undefined) {
        await this.initializeIntegration(
          integrationId, 
          integration.integrationType, 
          updates.configuration
        );
      }

      this.logger.info('Integration updated successfully', { integrationId, userId });

      return this.mapDatabaseRowToIntegration(result.rows[0]);
    } catch (error) {
      this.logger.error('Failed to update integration', { error, integrationId, userId });
      throw error;
    }
  }

  /**
   * Delete integration
   */
  async deleteIntegration(
    integrationId: string,
    userId: string,
    tenantId: string
  ): Promise<void> {
    try {
      const integration = await this.getIntegration(integrationId, userId, tenantId);
      if (!integration) {
        throw this.createIntegrationError('INTEGRATION_NOT_FOUND', 'Integration not found');
      }

      // Check permissions
      await this.checkIntegrationPermission(integration.workspaceId, userId, tenantId);

      // Cleanup integration resources
      await this.cleanupIntegration(integrationId, integration.integrationType);

      const query = `
        DELETE FROM workspace_integrations
        WHERE id = $1
      `;

      const result = await this.db.query(query, [integrationId]);

      if (result.rowCount === 0) {
        throw this.createIntegrationError('INTEGRATION_NOT_FOUND', 'Integration not found');
      }

      this.logger.info('Integration deleted successfully', { integrationId, userId });
    } catch (error) {
      this.logger.error('Failed to delete integration', { error, integrationId, userId });
      throw error;
    }
  }

  /**
   * Get workspace integrations
   */
  async getWorkspaceIntegrations(
    workspaceId: string,
    userId: string,
    tenantId: string,
    type?: WorkspaceIntegrationType,
    status?: WorkspaceIntegrationStatus
  ): Promise<WorkspaceIntegration[]> {
    try {
      // Check access permissions
      await this.checkIntegrationAccess(workspaceId, userId, tenantId);

      let whereClause = 'WHERE workspace_id = $1';
      const values: any[] = [workspaceId];
      let valueIndex = 2;

      if (type) {
        whereClause += ` AND integration_type = $${valueIndex++}`;
        values.push(type);
      }

      if (status) {
        whereClause += ` AND status = $${valueIndex++}`;
        values.push(status);
      }

      const query = `
        SELECT wi.*, u.name as creator_name
        FROM workspace_integrations wi
        LEFT JOIN users u ON wi.created_by = u.id
        ${whereClause}
        ORDER BY wi.created_at DESC
      `;

      const result = await this.db.query(query, values);

      return result.rows.map(row => {
        const integration = this.mapDatabaseRowToIntegration(row);
        // Add creator info
        (integration as any).creatorName = row.creator_name;
        return integration;
      });
    } catch (error) {
      this.logger.error('Failed to get workspace integrations', { error, workspaceId, userId });
      throw error;
    }
  }

  /**
   * Test integration connection
   */
  async testIntegration(
    integrationId: string,
    userId: string,
    tenantId: string
  ): Promise<{ success: boolean; message: string; details?: any }> {
    try {
      const integration = await this.getIntegration(integrationId, userId, tenantId);
      if (!integration) {
        throw this.createIntegrationError('INTEGRATION_NOT_FOUND', 'Integration not found');
      }

      // Check permissions
      await this.checkIntegrationPermission(integration.workspaceId, userId, tenantId);

      const testResult = await this.performIntegrationTest(
        integration.integrationType,
        integration.configuration,
        integration.credentials
      );

      if (testResult.success) {
        // Update status to active if test succeeds
        await this.updateIntegrationStatus(integrationId, 'active');
      } else {
        // Increment error count and update status
        await this.recordIntegrationError(integrationId, testResult.message);
      }

      this.logger.info('Integration test completed', { 
        integrationId, success: testResult.success 
      });

      return testResult;
    } catch (error) {
      this.logger.error('Failed to test integration', { error, integrationId, userId });
      throw error;
    }
  }

  /**
   * Sync integration data
   */
  async syncIntegration(
    integrationId: string,
    userId: string,
    tenantId: string
  ): Promise<{ success: boolean; message: string; syncedItems?: number }> {
    try {
      const integration = await this.getIntegration(integrationId, userId, tenantId);
      if (!integration) {
        throw this.createIntegrationError('INTEGRATION_NOT_FOUND', 'Integration not found');
      }

      // Check permissions
      await this.checkIntegrationPermission(integration.workspaceId, userId, tenantId);

      if (integration.status !== 'active') {
        throw this.createIntegrationError('INTEGRATION_CONFIG_INVALID', 'Integration is not active');
      }

      const syncResult = await this.performIntegrationSync(
        integration.workspaceId,
        integration.integrationType,
        integration.configuration,
        integration.credentials
      );

      // Update last sync time
      await this.updateLastSync(integrationId, syncResult.success);

      if (!syncResult.success) {
        await this.recordIntegrationError(integrationId, syncResult.message);
      }

      this.logger.info('Integration sync completed', { 
        integrationId, success: syncResult.success, items: syncResult.syncedItems 
      });

      return syncResult;
    } catch (error) {
      this.logger.error('Failed to sync integration', { error, integrationId, userId });
      throw error;
    }
  }

  /**
   * Get integration status and health
   */
  async getIntegrationHealth(
    integrationId: string,
    userId: string,
    tenantId: string
  ): Promise<any> {
    try {
      const integration = await this.getIntegration(integrationId, userId, tenantId);
      if (!integration) {
        throw this.createIntegrationError('INTEGRATION_NOT_FOUND', 'Integration not found');
      }

      // Check permissions
      await this.checkIntegrationAccess(integration.workspaceId, userId, tenantId);

      const health = {
        integrationId,
        type: integration.integrationType,
        status: integration.status,
        lastSync: integration.lastSyncAt,
        errorCount: integration.errorCount,
        lastError: integration.lastError,
        isHealthy: integration.status === 'active' && integration.errorCount < 5,
        syncEnabled: integration.configuration.syncSettings?.autoSync || false,
        nextSyncDue: this.calculateNextSyncTime(integration),
      };

      // Get recent sync history
      const syncHistoryQuery = `
        SELECT created_at, details->>'syncResult' as sync_result
        FROM workspace_activity_log
        WHERE workspace_id = $1 
          AND resource_type = 'integration'
          AND resource_id = $2
          AND action = 'integration_synced'
        ORDER BY created_at DESC
        LIMIT 10
      `;

      const syncResult = await this.db.query(syncHistoryQuery, [
        integration.workspaceId,
        integrationId
      ]);

      health.recentSyncs = syncResult.rows.map(row => ({
        timestamp: row.created_at.toISOString(),
        success: row.sync_result === 'success',
      }));

      return health;
    } catch (error) {
      this.logger.error('Failed to get integration health', { error, integrationId, userId });
      throw error;
    }
  }

  /**
   * Get available integration types
   */
  getAvailableIntegrationTypes(): { type: WorkspaceIntegrationType; name: string; description: string }[] {
    return [
      {
        type: 'kanban',
        name: 'Kanban Boards',
        description: 'Integrate with workspace Kanban boards for project management',
      },
      {
        type: 'wiki',
        name: 'Wiki Pages',
        description: 'Integrate with workspace wiki for documentation',
      },
      {
        type: 'memory',
        name: 'Memory Graph',
        description: 'Integrate with workspace memory graph for knowledge management',
      },
      {
        type: 'github',
        name: 'GitHub',
        description: 'Connect with GitHub repositories for code collaboration',
      },
      {
        type: 'jira',
        name: 'Jira',
        description: 'Integrate with Jira for issue tracking and project management',
      },
      {
        type: 'slack',
        name: 'Slack',
        description: 'Connect with Slack channels for team communication',
      },
      {
        type: 'discord',
        name: 'Discord',
        description: 'Integrate with Discord servers for community collaboration',
      },
      {
        type: 'teams',
        name: 'Microsoft Teams',
        description: 'Connect with Microsoft Teams for enterprise collaboration',
      },
      {
        type: 'external',
        name: 'External API',
        description: 'Generic integration with external APIs and services',
      },
    ];
  }

  // Private helper methods

  private async checkIntegrationPermission(
    workspaceId: string,
    userId: string,
    tenantId: string
  ): Promise<void> {
    const query = `
      SELECT wm.role, wm.permissions, w.owner_id
      FROM workspace_members wm
      JOIN collaborative_workspaces w ON wm.workspace_id = w.id
      WHERE wm.workspace_id = $1 AND wm.user_id = $2 AND w.tenant_id = $3 AND wm.status = 'active'
    `;

    const result = await this.db.query(query, [workspaceId, userId, tenantId]);

    if (result.rows.length === 0) {
      throw this.createIntegrationError('WORKSPACE_ACCESS_DENIED', 'Access denied to workspace');
    }

    const row = result.rows[0];
    
    // Owners and admins can manage integrations
    if (row.owner_id === userId || row.role === 'admin') {
      return;
    }

    const permissions = row.permissions || {};
    if (permissions.canManageIntegrations === true) {
      return;
    }

    throw this.createIntegrationError('INTEGRATION_ACCESS_DENIED', 'Permission denied: integration management required');
  }

  private async checkIntegrationAccess(
    workspaceId: string,
    userId: string,
    tenantId: string
  ): Promise<void> {
    const query = `
      SELECT wm.status, w.visibility
      FROM collaborative_workspaces w
      LEFT JOIN workspace_members wm ON w.id = wm.workspace_id AND wm.user_id = $2
      WHERE w.id = $1 AND w.tenant_id = $3 AND w.deleted_at IS NULL
    `;

    const result = await this.db.query(query, [workspaceId, userId, tenantId]);

    if (result.rows.length === 0) {
      throw this.createIntegrationError('WORKSPACE_NOT_FOUND', 'Workspace not found');
    }

    const row = result.rows[0];
    
    if (row.visibility === 'public' || row.status === 'active') {
      return;
    }

    throw this.createIntegrationError('INTEGRATION_ACCESS_DENIED', 'Access denied to workspace');
  }

  private async validateIntegrationType(
    type: WorkspaceIntegrationType,
    configuration: any
  ): Promise<void> {
    switch (type) {
      case 'github':
        if (!configuration.apiKey && !configuration.webhook) {
          throw this.createIntegrationError('INTEGRATION_CONFIG_INVALID', 'GitHub integration requires API key or webhook configuration');
        }
        break;
      case 'jira':
        if (!configuration.apiKey || !configuration.baseUrl) {
          throw this.createIntegrationError('INTEGRATION_CONFIG_INVALID', 'Jira integration requires API key and base URL');
        }
        break;
      case 'slack':
        if (!configuration.webhook?.url) {
          throw this.createIntegrationError('INTEGRATION_CONFIG_INVALID', 'Slack integration requires webhook URL');
        }
        break;
      case 'external':
        if (!configuration.apiKey && !configuration.webhook?.url) {
          throw this.createIntegrationError('INTEGRATION_CONFIG_INVALID', 'External integration requires API key or webhook URL');
        }
        break;
      // Internal integrations (kanban, wiki, memory) don't need special validation
    }
  }

  private async initializeIntegration(
    integrationId: string,
    type: WorkspaceIntegrationType,
    configuration: any
  ): Promise<void> {
    try {
      // Perform type-specific initialization
      switch (type) {
        case 'github':
          await this.initializeGitHubIntegration(integrationId, configuration);
          break;
        case 'jira':
          await this.initializeJiraIntegration(integrationId, configuration);
          break;
        case 'slack':
          await this.initializeSlackIntegration(integrationId, configuration);
          break;
        // Internal integrations are ready immediately
        case 'kanban':
        case 'wiki':
        case 'memory':
          await this.updateIntegrationStatus(integrationId, 'active');
          break;
        default:
          await this.updateIntegrationStatus(integrationId, 'active');
      }
    } catch (error) {
      await this.updateIntegrationStatus(integrationId, 'error');
      await this.recordIntegrationError(integrationId, error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  private async performIntegrationTest(
    type: WorkspaceIntegrationType,
    configuration: any,
    credentials?: any
  ): Promise<{ success: boolean; message: string; details?: any }> {
    try {
      switch (type) {
        case 'github':
          return await this.testGitHubConnection(configuration, credentials);
        case 'jira':
          return await this.testJiraConnection(configuration, credentials);
        case 'slack':
          return await this.testSlackConnection(configuration);
        default:
          return { success: true, message: 'Integration test passed' };
      }
    } catch (error) {
      return { 
        success: false, 
        message: error instanceof Error ? error.message : String(error), 
        details: { error: error.stack } 
      };
    }
  }

  private async performIntegrationSync(
    workspaceId: string,
    type: WorkspaceIntegrationType,
    configuration: any,
    credentials?: any
  ): Promise<{ success: boolean; message: string; syncedItems?: number }> {
    try {
      switch (type) {
        case 'github':
          return await this.syncGitHubData(workspaceId, configuration, credentials);
        case 'jira':
          return await this.syncJiraData(workspaceId, configuration, credentials);
        case 'slack':
          return await this.syncSlackData(workspaceId, configuration);
        default:
          return { success: true, message: 'No sync required', syncedItems: 0 };
      }
    } catch (error) {
      return { 
        success: false, 
        message: error instanceof Error ? error.message : String(error), 
        syncedItems: 0 
      };
    }
  }

  private async updateIntegrationStatus(
    integrationId: string,
    status: WorkspaceIntegrationStatus
  ): Promise<void> {
    const query = `
      UPDATE workspace_integrations
      SET status = $1, updated_at = NOW()
      WHERE id = $2
    `;

    await this.db.query(query, [status, integrationId]);
  }

  private async recordIntegrationError(
    integrationId: string,
    errorMessage: string
  ): Promise<void> {
    const query = `
      UPDATE workspace_integrations
      SET error_count = error_count + 1, 
          last_error = $1,
          updated_at = NOW()
      WHERE id = $2
    `;

    await this.db.query(query, [errorMessage, integrationId]);
  }

  private async updateLastSync(
    integrationId: string,
    success: boolean
  ): Promise<void> {
    const query = `
      UPDATE workspace_integrations
      SET last_sync_at = NOW(),
          error_count = CASE WHEN $1 THEN 0 ELSE error_count END,
          updated_at = NOW()
      WHERE id = $2
    `;

    await this.db.query(query, [success, integrationId]);
  }

  private calculateNextSyncTime(integration: WorkspaceIntegration): string | null {
    const syncSettings = integration.configuration.syncSettings;
    if (!syncSettings?.autoSync || !integration.lastSyncAt) {
      return null;
    }

    const lastSync = new Date(integration.lastSyncAt);
    const frequency = syncSettings.frequency || 'daily';

    switch (frequency) {
      case 'hourly':
        lastSync.setHours(lastSync.getHours() + 1);
        break;
      case 'daily':
        lastSync.setDate(lastSync.getDate() + 1);
        break;
      default:
        return null;
    }

    return lastSync.toISOString();
  }

  // Integration-specific methods (simplified implementations)
  private async initializeGitHubIntegration(integrationId: string, config: any): Promise<void> {
    // TODO: Implement GitHub-specific initialization
    await this.updateIntegrationStatus(integrationId, 'active');
  }

  private async initializeJiraIntegration(integrationId: string, config: any): Promise<void> {
    // TODO: Implement Jira-specific initialization
    await this.updateIntegrationStatus(integrationId, 'active');
  }

  private async initializeSlackIntegration(integrationId: string, config: any): Promise<void> {
    // TODO: Implement Slack-specific initialization
    await this.updateIntegrationStatus(integrationId, 'active');
  }

  private async testGitHubConnection(config: any, credentials: any): Promise<{ success: boolean; message: string }> {
    // TODO: Implement GitHub connection test
    return { success: true, message: 'GitHub connection test passed' };
  }

  private async testJiraConnection(config: any, credentials: any): Promise<{ success: boolean; message: string }> {
    // TODO: Implement Jira connection test
    return { success: true, message: 'Jira connection test passed' };
  }

  private async testSlackConnection(config: any): Promise<{ success: boolean; message: string }> {
    // TODO: Implement Slack connection test
    return { success: true, message: 'Slack connection test passed' };
  }

  private async syncGitHubData(workspaceId: string, config: any, credentials: any): Promise<{ success: boolean; message: string; syncedItems: number }> {
    // TODO: Implement GitHub data sync
    return { success: true, message: 'GitHub sync completed', syncedItems: 0 };
  }

  private async syncJiraData(workspaceId: string, config: any, credentials: any): Promise<{ success: boolean; message: string; syncedItems: number }> {
    // TODO: Implement Jira data sync
    return { success: true, message: 'Jira sync completed', syncedItems: 0 };
  }

  private async syncSlackData(workspaceId: string, config: any): Promise<{ success: boolean; message: string; syncedItems: number }> {
    // TODO: Implement Slack data sync
    return { success: true, message: 'Slack sync completed', syncedItems: 0 };
  }

  private async cleanupIntegration(integrationId: string, type: WorkspaceIntegrationType): Promise<void> {
    // TODO: Implement integration-specific cleanup
    this.logger.info('Cleaning up integration', { integrationId, type });
  }

  private mapDatabaseRowToIntegration(row: any): WorkspaceIntegration {
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      integrationType: row.integration_type,
      externalId: row.external_id,
      configuration: row.configuration,
      credentials: row.credentials,
      status: row.status,
      lastSyncAt: row.last_sync_at?.toISOString(),
      syncFrequency: row.sync_frequency,
      errorCount: row.error_count,
      lastError: row.last_error,
      createdBy: row.created_by,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  private createIntegrationError(code: string, message: string, details?: any): WorkspaceError {
    const error = new Error(message) as any;
    error.code = code;
    error.details = details;
    return error;
  }
}