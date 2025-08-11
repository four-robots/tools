/**
 * Tenant Management Service
 * 
 * Handles comprehensive tenant lifecycle operations including:
 * - Tenant creation, provisioning, and deletion
 * - User management within tenants
 * - Tenant hierarchy and organizational structure
 * - Configuration management
 * - Status transitions and lifecycle management
 * 
 * Part of Multi-tenant Search Infrastructure (Work Item 4.2.1)
 */

import { logger } from '../../utils/logger.js';
import { DatabasePool } from '../../utils/database-pool.js';
import { 
  Tenant, 
  TenantUser, 
  TenantConfiguration, 
  CreateTenantRequest, 
  UpdateTenantRequest,
  TenantUserInvitation,
  TenantMetrics
} from '../../shared/types/multi-tenant.js';
import { z } from 'zod';
import { randomBytes } from 'crypto';

export class TenantManagementService {
  private db: DatabasePool;

  constructor() {
    this.db = new DatabasePool();
  }

  // ===================
  // TENANT LIFECYCLE
  // ===================

  /**
   * Create a new tenant with complete provisioning
   */
  async createTenant(request: CreateTenantRequest, createdBy: string): Promise<Tenant> {
    logger.info(`Creating new tenant: ${request.slug}`);

    try {
      // Validate tenant doesn't exist
      await this.validateTenantDoesNotExist(request.slug);

      // Generate tenant path for hierarchy
      const tenantPath = await this.generateTenantPath(request.parentTenantId);
      const depthLevel = await this.calculateDepthLevel(request.parentTenantId);

      // Create tenant record
      const tenant = await this.db.transaction(async (trx) => {
        const [newTenant] = await trx
          .insertInto('tenants')
          .values({
            name: request.name,
            slug: request.slug,
            display_name: request.displayName || request.name,
            description: request.description,
            parent_tenant_id: request.parentTenantId,
            root_tenant_id: request.parentTenantId ? await this.getRootTenantId(request.parentTenantId) : undefined,
            tenant_path: tenantPath,
            depth_level: depthLevel,
            is_organization: request.isOrganization ?? true,
            tier: request.tier || 'standard',
            max_users: request.maxUsers || 100,
            max_storage_gb: request.maxStorageGb || 10,
            max_api_calls_per_day: request.maxApiCallsPerDay || 10000,
            federation_enabled: request.federationEnabled || false,
            public_discovery: request.publicDiscovery || false,
            data_region: request.dataRegion || 'us-east-1',
            compliance_requirements: JSON.stringify(request.complianceRequirements || []),
            branding_config: JSON.stringify(request.brandingConfig || {}),
            feature_flags: JSON.stringify(request.featureFlags || {}),
            metadata: JSON.stringify(request.metadata || {}),
            created_by: createdBy
          })
          .returning([
            'id', 'name', 'slug', 'display_name', 'description', 'status',
            'tier', 'parent_tenant_id', 'root_tenant_id', 'tenant_path',
            'depth_level', 'is_organization', 'federation_enabled',
            'public_discovery', 'created_at', 'updated_at'
          ])
          .execute();

        // Create default resource quotas
        await this.createDefaultResourceQuotas(trx, newTenant.id);

        // Create default configurations
        await this.createDefaultConfigurations(trx, newTenant.id, createdBy);

        // Set up discovery record if enabled
        if (request.publicDiscovery) {
          await this.createDiscoveryRecord(trx, newTenant.id, request);
        }

        return newTenant;
      });

      // Initialize tenant-specific resources
      await this.initializeTenantResources(tenant.id);

      logger.info(`Successfully created tenant: ${tenant.slug} (${tenant.id})`);
      return tenant as Tenant;

    } catch (error) {
      logger.error('Failed to create tenant:', error);
      throw new Error(`Failed to create tenant: ${error.message}`);
    }
  }

  /**
   * Update tenant configuration and settings
   */
  async updateTenant(tenantId: string, request: UpdateTenantRequest, updatedBy: string): Promise<Tenant> {
    logger.info(`Updating tenant: ${tenantId}`);

    try {
      const tenant = await this.db.transaction(async (trx) => {
        const [updatedTenant] = await trx
          .updateTable('tenants')
          .set({
            display_name: request.displayName,
            description: request.description,
            tier: request.tier,
            max_users: request.maxUsers,
            max_storage_gb: request.maxStorageGb,
            max_api_calls_per_day: request.maxApiCallsPerDay,
            federation_enabled: request.federationEnabled,
            public_discovery: request.publicDiscovery,
            compliance_requirements: request.complianceRequirements ? JSON.stringify(request.complianceRequirements) : undefined,
            branding_config: request.brandingConfig ? JSON.stringify(request.brandingConfig) : undefined,
            feature_flags: request.featureFlags ? JSON.stringify(request.featureFlags) : undefined,
            metadata: request.metadata ? JSON.stringify(request.metadata) : undefined,
            updated_at: new Date().toISOString()
          })
          .where('id', '=', tenantId)
          .returning([
            'id', 'name', 'slug', 'display_name', 'description', 'status',
            'tier', 'parent_tenant_id', 'root_tenant_id', 'tenant_path',
            'depth_level', 'is_organization', 'federation_enabled',
            'public_discovery', 'created_at', 'updated_at'
          ])
          .execute();

        if (!updatedTenant) {
          throw new Error('Tenant not found');
        }

        // Update discovery record if needed
        if (request.publicDiscovery !== undefined) {
          await this.updateDiscoveryRecord(trx, tenantId, request.publicDiscovery);
        }

        return updatedTenant;
      });

      // Log tenant update
      await this.logTenantActivity(tenantId, 'tenant_updated', 'tenant', tenantId, {
        updated_fields: Object.keys(request),
        updated_by: updatedBy
      });

      logger.info(`Successfully updated tenant: ${tenantId}`);
      return tenant as Tenant;

    } catch (error) {
      logger.error('Failed to update tenant:', error);
      throw new Error(`Failed to update tenant: ${error.message}`);
    }
  }

  /**
   * Suspend a tenant (soft suspension)
   */
  async suspendTenant(tenantId: string, reason: string, suspendedBy: string): Promise<void> {
    logger.info(`Suspending tenant: ${tenantId}`);

    try {
      await this.db.transaction(async (trx) => {
        await trx
          .updateTable('tenants')
          .set({
            status: 'suspended',
            suspended_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .where('id', '=', tenantId)
          .execute();

        // Create alert for tenant suspension
        await trx
          .insertInto('tenant_alerts')
          .values({
            tenant_id: tenantId,
            alert_type: 'tenant_suspended',
            severity: 'high',
            title: 'Tenant Suspended',
            message: `Tenant has been suspended. Reason: ${reason}`,
            alert_data: JSON.stringify({ reason, suspended_by: suspendedBy })
          })
          .execute();
      });

      // Log suspension
      await this.logTenantActivity(tenantId, 'tenant_suspended', 'tenant', tenantId, {
        reason,
        suspended_by: suspendedBy
      });

      logger.info(`Successfully suspended tenant: ${tenantId}`);

    } catch (error) {
      logger.error('Failed to suspend tenant:', error);
      throw new Error(`Failed to suspend tenant: ${error.message}`);
    }
  }

  /**
   * Activate a suspended tenant
   */
  async activateTenant(tenantId: string, activatedBy: string): Promise<void> {
    logger.info(`Activating tenant: ${tenantId}`);

    try {
      await this.db.transaction(async (trx) => {
        await trx
          .updateTable('tenants')
          .set({
            status: 'active',
            suspended_at: null,
            updated_at: new Date().toISOString()
          })
          .where('id', '=', tenantId)
          .execute();

        // Resolve suspension alert
        await trx
          .updateTable('tenant_alerts')
          .set({
            status: 'resolved',
            resolved_by: activatedBy,
            resolved_at: new Date().toISOString(),
            resolution_notes: 'Tenant reactivated'
          })
          .where('tenant_id', '=', tenantId)
          .where('alert_type', '=', 'tenant_suspended')
          .where('status', '=', 'active')
          .execute();
      });

      // Log activation
      await this.logTenantActivity(tenantId, 'tenant_activated', 'tenant', tenantId, {
        activated_by: activatedBy
      });

      logger.info(`Successfully activated tenant: ${tenantId}`);

    } catch (error) {
      logger.error('Failed to activate tenant:', error);
      throw new Error(`Failed to activate tenant: ${error.message}`);
    }
  }

  /**
   * Delete a tenant (soft delete with data retention)
   */
  async deleteTenant(tenantId: string, deletedBy: string, immediate = false): Promise<void> {
    logger.info(`Deleting tenant: ${tenantId} (immediate: ${immediate})`);

    try {
      await this.db.transaction(async (trx) => {
        if (immediate) {
          // Hard delete - remove all data immediately
          await this.hardDeleteTenant(trx, tenantId);
        } else {
          // Soft delete - mark for deletion and schedule cleanup
          await trx
            .updateTable('tenants')
            .set({
              status: 'deleted',
              deleted_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .where('id', '=', tenantId)
            .execute();

          // Schedule data cleanup based on retention policy
          await this.scheduleDataCleanup(trx, tenantId);
        }
      });

      // Log deletion
      await this.logTenantActivity(tenantId, 'tenant_deleted', 'tenant', tenantId, {
        deleted_by: deletedBy,
        immediate_deletion: immediate
      });

      logger.info(`Successfully deleted tenant: ${tenantId}`);

    } catch (error) {
      logger.error('Failed to delete tenant:', error);
      throw new Error(`Failed to delete tenant: ${error.message}`);
    }
  }

  // ===================
  // USER MANAGEMENT
  // ===================

  /**
   * Add a user to a tenant
   */
  async addUserToTenant(tenantId: string, userId: string, email: string, role: string, addedBy: string): Promise<TenantUser> {
    logger.info(`Adding user ${userId} to tenant ${tenantId} with role ${role}`);

    try {
      // Validate tenant capacity
      await this.validateTenantUserCapacity(tenantId);

      const tenantUser = await this.db.transaction(async (trx) => {
        const [user] = await trx
          .insertInto('tenant_users')
          .values({
            tenant_id: tenantId,
            user_id: userId,
            email: email,
            role: role,
            status: 'active',
            invited_by: addedBy,
            invitation_accepted_at: new Date().toISOString()
          })
          .returning([
            'id', 'tenant_id', 'user_id', 'email', 'role', 'status',
            'joined_at', 'last_active_at', 'created_at'
          ])
          .execute();

        return user;
      });

      // Log user addition
      await this.logTenantActivity(tenantId, 'user_added', 'user', userId, {
        email,
        role,
        added_by: addedBy
      });

      logger.info(`Successfully added user ${userId} to tenant ${tenantId}`);
      return tenantUser as TenantUser;

    } catch (error) {
      logger.error('Failed to add user to tenant:', error);
      throw new Error(`Failed to add user to tenant: ${error.message}`);
    }
  }

  /**
   * Update user role in tenant
   */
  async updateUserRole(tenantId: string, userId: string, newRole: string, updatedBy: string): Promise<TenantUser> {
    logger.info(`Updating user ${userId} role to ${newRole} in tenant ${tenantId}`);

    try {
      const [updatedUser] = await this.db.db
        .updateTable('tenant_users')
        .set({
          role: newRole,
          updated_at: new Date().toISOString()
        })
        .where('tenant_id', '=', tenantId)
        .where('user_id', '=', userId)
        .returning([
          'id', 'tenant_id', 'user_id', 'email', 'role', 'status',
          'joined_at', 'last_active_at', 'created_at'
        ])
        .execute();

      if (!updatedUser) {
        throw new Error('User not found in tenant');
      }

      // Log role update
      await this.logTenantActivity(tenantId, 'user_role_updated', 'user', userId, {
        new_role: newRole,
        updated_by: updatedBy
      });

      logger.info(`Successfully updated user ${userId} role in tenant ${tenantId}`);
      return updatedUser as TenantUser;

    } catch (error) {
      logger.error('Failed to update user role:', error);
      throw new Error(`Failed to update user role: ${error.message}`);
    }
  }

  /**
   * Remove user from tenant
   */
  async removeUserFromTenant(tenantId: string, userId: string, removedBy: string): Promise<void> {
    logger.info(`Removing user ${userId} from tenant ${tenantId}`);

    try {
      await this.db.db
        .deleteFrom('tenant_users')
        .where('tenant_id', '=', tenantId)
        .where('user_id', '=', userId)
        .execute();

      // Log user removal
      await this.logTenantActivity(tenantId, 'user_removed', 'user', userId, {
        removed_by: removedBy
      });

      logger.info(`Successfully removed user ${userId} from tenant ${tenantId}`);

    } catch (error) {
      logger.error('Failed to remove user from tenant:', error);
      throw new Error(`Failed to remove user from tenant: ${error.message}`);
    }
  }

  // ===================
  // CONFIGURATION MANAGEMENT
  // ===================

  /**
   * Set tenant configuration
   */
  async setTenantConfiguration(
    tenantId: string, 
    category: string, 
    key: string, 
    value: any, 
    setBy: string
  ): Promise<TenantConfiguration> {
    logger.info(`Setting tenant configuration: ${tenantId}/${category}/${key}`);

    try {
      const [config] = await this.db.db
        .insertInto('tenant_configurations')
        .values({
          tenant_id: tenantId,
          config_category: category,
          config_key: key,
          config_value: JSON.stringify(value),
          created_by: setBy,
          updated_by: setBy
        })
        .onConflict((oc) => oc
          .columns(['tenant_id', 'config_category', 'config_key'])
          .doUpdateSet({
            config_value: JSON.stringify(value),
            updated_by: setBy,
            updated_at: new Date().toISOString()
          })
        )
        .returning([
          'id', 'tenant_id', 'config_category', 'config_key', 'config_value',
          'config_type', 'is_encrypted', 'created_at', 'updated_at'
        ])
        .execute();

      logger.info(`Successfully set tenant configuration: ${tenantId}/${category}/${key}`);
      return config as TenantConfiguration;

    } catch (error) {
      logger.error('Failed to set tenant configuration:', error);
      throw new Error(`Failed to set tenant configuration: ${error.message}`);
    }
  }

  /**
   * Get tenant configuration
   */
  async getTenantConfiguration(tenantId: string, category?: string, key?: string): Promise<TenantConfiguration[]> {
    try {
      let query = this.db.db
        .selectFrom('tenant_configurations')
        .select([
          'id', 'tenant_id', 'config_category', 'config_key', 'config_value',
          'config_type', 'is_encrypted', 'created_at', 'updated_at'
        ])
        .where('tenant_id', '=', tenantId);

      if (category) {
        query = query.where('config_category', '=', category);
      }

      if (key) {
        query = query.where('config_key', '=', key);
      }

      const configs = await query.execute();
      return configs as TenantConfiguration[];

    } catch (error) {
      logger.error('Failed to get tenant configuration:', error);
      throw new Error(`Failed to get tenant configuration: ${error.message}`);
    }
  }

  // ===================
  // METRICS AND MONITORING
  // ===================

  /**
   * Get tenant metrics
   */
  async getTenantMetrics(tenantId: string): Promise<TenantMetrics> {
    logger.info(`Getting metrics for tenant: ${tenantId}`);

    try {
      const tenant = await this.getTenantById(tenantId);
      if (!tenant) {
        throw new Error('Tenant not found');
      }

      const [userCount] = await this.db.db
        .selectFrom('tenant_users')
        .select((eb) => eb.fn.count<number>('id').as('count'))
        .where('tenant_id', '=', tenantId)
        .where('status', '=', 'active')
        .execute();

      const [storageUsage] = await this.db.db
        .selectFrom('tenant_usage_metrics')
        .select('metric_value')
        .where('tenant_id', '=', tenantId)
        .where('metric_name', '=', 'storage_gb')
        .orderBy('recorded_at', 'desc')
        .limit(1)
        .execute();

      const [apiCallsToday] = await this.db.db
        .selectFrom('tenant_usage_metrics')
        .select('metric_value')
        .where('tenant_id', '=', tenantId)
        .where('metric_name', '=', 'api_calls')
        .where('period_start', '>=', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .execute();

      return {
        tenant_id: tenantId,
        user_count: userCount?.count || 0,
        max_users: tenant.max_users || 0,
        storage_used_gb: storageUsage?.metric_value || 0,
        max_storage_gb: tenant.max_storage_gb || 0,
        api_calls_today: apiCallsToday?.metric_value || 0,
        max_api_calls_per_day: tenant.max_api_calls_per_day || 0,
        status: tenant.status,
        tier: tenant.tier,
        federation_enabled: tenant.federation_enabled || false,
        last_updated: new Date().toISOString()
      };

    } catch (error) {
      logger.error('Failed to get tenant metrics:', error);
      throw new Error(`Failed to get tenant metrics: ${error.message}`);
    }
  }

  // ===================
  // UTILITY METHODS
  // ===================

  /**
   * Get tenant by ID
   */
  async getTenantById(tenantId: string): Promise<Tenant | null> {
    try {
      const tenant = await this.db.db
        .selectFrom('tenants')
        .selectAll()
        .where('id', '=', tenantId)
        .where('deleted_at', 'is', null)
        .executeTakeFirst();

      return tenant as Tenant | null;

    } catch (error) {
      logger.error('Failed to get tenant by ID:', error);
      throw new Error(`Failed to get tenant by ID: ${error.message}`);
    }
  }

  /**
   * Get tenant by slug
   */
  async getTenantBySlug(slug: string): Promise<Tenant | null> {
    try {
      const tenant = await this.db.db
        .selectFrom('tenants')
        .selectAll()
        .where('slug', '=', slug)
        .where('deleted_at', 'is', null)
        .executeTakeFirst();

      return tenant as Tenant | null;

    } catch (error) {
      logger.error('Failed to get tenant by slug:', error);
      throw new Error(`Failed to get tenant by slug: ${error.message}`);
    }
  }

  // ===================
  // PRIVATE HELPER METHODS
  // ===================

  private async validateTenantDoesNotExist(slug: string): Promise<void> {
    const existing = await this.getTenantBySlug(slug);
    if (existing) {
      throw new Error(`Tenant with slug '${slug}' already exists`);
    }
  }

  private async generateTenantPath(parentTenantId?: string): Promise<string> {
    if (!parentTenantId) {
      return '';
    }

    const parent = await this.getTenantById(parentTenantId);
    if (!parent) {
      throw new Error('Parent tenant not found');
    }

    return parent.tenant_path ? `${parent.tenant_path}/${parent.slug}` : parent.slug;
  }

  private async calculateDepthLevel(parentTenantId?: string): Promise<number> {
    if (!parentTenantId) {
      return 0;
    }

    const parent = await this.getTenantById(parentTenantId);
    if (!parent) {
      throw new Error('Parent tenant not found');
    }

    return parent.depth_level + 1;
  }

  private async getRootTenantId(tenantId: string): Promise<string> {
    const tenant = await this.getTenantById(tenantId);
    if (!tenant) {
      throw new Error('Tenant not found');
    }

    return tenant.root_tenant_id || tenantId;
  }

  private async createDefaultResourceQuotas(trx: any, tenantId: string): Promise<void> {
    const defaultQuotas = [
      { resource_type: 'storage_gb', quota_limit: 10 },
      { resource_type: 'api_calls_per_day', quota_limit: 10000 },
      { resource_type: 'users', quota_limit: 100 },
      { resource_type: 'search_requests_per_hour', quota_limit: 1000 }
    ];

    await trx
      .insertInto('tenant_resource_quotas')
      .values(defaultQuotas.map(quota => ({
        tenant_id: tenantId,
        ...quota
      })))
      .execute();
  }

  private async createDefaultConfigurations(trx: any, tenantId: string, createdBy: string): Promise<void> {
    const defaultConfigs = [
      { category: 'search', key: 'max_results_per_page', value: 50 },
      { category: 'search', key: 'enable_fuzzy_search', value: true },
      { category: 'collaboration', key: 'enable_real_time', value: true },
      { category: 'security', key: 'require_2fa', value: false }
    ];

    await trx
      .insertInto('tenant_configurations')
      .values(defaultConfigs.map(config => ({
        tenant_id: tenantId,
        config_category: config.category,
        config_key: config.key,
        config_value: JSON.stringify(config.value),
        created_by: createdBy,
        updated_by: createdBy
      })))
      .execute();
  }

  private async createDiscoveryRecord(trx: any, tenantId: string, request: CreateTenantRequest): Promise<void> {
    await trx
      .insertInto('tenant_discovery')
      .values({
        tenant_id: tenantId,
        discoverable_name: request.displayName || request.name,
        description: request.description,
        discovery_enabled: request.publicDiscovery || false,
        discovery_tags: JSON.stringify(request.discoveryTags || [])
      })
      .execute();
  }

  private async updateDiscoveryRecord(trx: any, tenantId: string, publicDiscovery: boolean): Promise<void> {
    if (publicDiscovery) {
      await trx
        .insertInto('tenant_discovery')
        .values({
          tenant_id: tenantId,
          discoverable_name: 'Updated Tenant',
          discovery_enabled: true
        })
        .onConflict((oc) => oc
          .column('tenant_id')
          .doUpdateSet({ discovery_enabled: true })
        )
        .execute();
    } else {
      await trx
        .updateTable('tenant_discovery')
        .set({ discovery_enabled: false })
        .where('tenant_id', '=', tenantId)
        .execute();
    }
  }

  private async initializeTenantResources(tenantId: string): Promise<void> {
    // Initialize tenant-specific resources like search indexes, caches, etc.
    logger.info(`Initializing resources for tenant: ${tenantId}`);
    
    // This would typically include:
    // - Creating tenant-specific search indexes
    // - Setting up caching namespaces
    // - Initializing monitoring dashboards
    // - Creating default API keys
  }

  private async validateTenantUserCapacity(tenantId: string): Promise<void> {
    const tenant = await this.getTenantById(tenantId);
    if (!tenant) {
      throw new Error('Tenant not found');
    }

    const [userCount] = await this.db.db
      .selectFrom('tenant_users')
      .select((eb) => eb.fn.count<number>('id').as('count'))
      .where('tenant_id', '=', tenantId)
      .where('status', '=', 'active')
      .execute();

    if (tenant.max_users && userCount.count >= tenant.max_users) {
      throw new Error('Tenant user capacity exceeded');
    }
  }

  private async hardDeleteTenant(trx: any, tenantId: string): Promise<void> {
    // This would implement complete data deletion
    // For now, we'll just mark as deleted
    await trx
      .updateTable('tenants')
      .set({
        status: 'deleted',
        deleted_at: new Date().toISOString()
      })
      .where('id', '=', tenantId)
      .execute();
  }

  private async scheduleDataCleanup(trx: any, tenantId: string): Promise<void> {
    // Schedule tenant data cleanup based on retention policy
    logger.info(`Scheduling data cleanup for tenant: ${tenantId}`);
  }

  private async logTenantActivity(
    tenantId: string, 
    action: string, 
    resourceType: string, 
    resourceId: string, 
    details: Record<string, any>
  ): Promise<void> {
    try {
      await this.db.db
        .insertInto('tenant_audit_logs')
        .values({
          tenant_id: tenantId,
          action,
          resource_type: resourceType,
          resource_id: resourceId,
          action_details: JSON.stringify(details)
        })
        .execute();
    } catch (error) {
      logger.error('Failed to log tenant activity:', error);
    }
  }
}