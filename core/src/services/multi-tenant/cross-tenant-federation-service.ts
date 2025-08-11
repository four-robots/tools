/**
 * Cross-Tenant Federation Service
 * 
 * Handles comprehensive tenant-to-tenant collaboration including:
 * - Tenant discovery and search
 * - Federation invitation management
 * - Cross-tenant permissions and authorization
 * - Trust relationships and verification
 * - Secure cross-tenant data sharing protocols
 * 
 * Part of Multi-tenant Search Infrastructure (Work Item 4.2.1)
 */

import { logger } from '../../utils/logger.js';
import { DatabaseConnectionPool } from '../../utils/database-pool.js';
import { 
  TenantDiscovery,
  FederationInvitation,
  CrossTenantPermission,
  CreateTenantRequest,
  TenantContext,
  validateCrossTenantPermission
} from '../../shared/types/multi-tenant.js';
import { z } from 'zod';

interface DiscoverySearchOptions {
  tags?: string[];
  capabilities?: string[];
  region?: string;
  limit?: number;
  offset?: number;
  sortBy?: 'relevance' | 'name' | 'activity';
}

interface FederationRequest {
  targetTenantId: string;
  invitationType: 'collaboration' | 'data_sharing' | 'search_partnership';
  message?: string;
  proposedPermissions: {
    permissionType: string;
    resourceTypes: string[];
    accessLevel: 'read' | 'write' | 'admin';
    conditions?: Record<string, any>;
    expiresAt?: Date;
  }[];
}

interface TrustVerificationResult {
  verified: boolean;
  trustScore: number;
  verificationChecks: {
    name: string;
    passed: boolean;
    details?: string;
  }[];
  riskFactors: string[];
  recommendations: string[];
}

export class CrossTenantFederationService {
  private db: DatabaseConnectionPool;

  constructor() {
    this.db = new DatabaseConnectionPool();
  }

  // ===================
  // TENANT DISCOVERY
  // ===================

  /**
   * Enable tenant discovery
   */
  async enableTenantDiscovery(
    tenantId: string,
    discoverySettings: {
      discoverableName: string;
      description?: string;
      tags?: string[];
      capabilities?: string[];
      contactInfo?: Record<string, string>;
      autoApproveRequests?: boolean;
      allowedRequestTypes?: string[];
    },
    enabledBy: string
  ): Promise<TenantDiscovery> {
    logger.info(`Enabling discovery for tenant: ${tenantId}`);

    try {
      const [discoveryRecord] = await this.db.db
        .insertInto('tenant_discovery')
        .values({
          tenant_id: tenantId,
          discoverable_name: discoverySettings.discoverableName,
          description: discoverySettings.description,
          discovery_tags: JSON.stringify(discoverySettings.tags || []),
          capabilities: JSON.stringify(discoverySettings.capabilities || []),
          contact_info: JSON.stringify(discoverySettings.contactInfo || {}),
          discovery_enabled: true,
          auto_approve_requests: discoverySettings.autoApproveRequests || false,
          allowed_request_types: JSON.stringify(discoverySettings.allowedRequestTypes || [])
        })
        .onConflict((oc) => oc
          .column('tenant_id')
          .doUpdateSet({
            discoverable_name: discoverySettings.discoverableName,
            description: discoverySettings.description,
            discovery_tags: JSON.stringify(discoverySettings.tags || []),
            capabilities: JSON.stringify(discoverySettings.capabilities || []),
            contact_info: JSON.stringify(discoverySettings.contactInfo || {}),
            discovery_enabled: true,
            auto_approve_requests: discoverySettings.autoApproveRequests || false,
            allowed_request_types: JSON.stringify(discoverySettings.allowedRequestTypes || []),
            updated_at: new Date().toISOString()
          })
        )
        .returning([
          'id', 'tenant_id', 'discoverable_name', 'description',
          'discovery_tags', 'capabilities', 'contact_info',
          'discovery_enabled', 'auto_approve_requests',
          'allowed_request_types', 'discovery_score',
          'created_at', 'updated_at'
        ])
        .execute();

      // Update tenant federation settings
      await this.db.db
        .updateTable('tenants')
        .set({
          federation_enabled: true,
          public_discovery: true,
          updated_at: new Date().toISOString()
        })
        .where('id', '=', tenantId)
        .execute();

      // Log discovery enablement
      await this.logFederationActivity(tenantId, 'discovery_enabled', 'tenant_discovery', discoveryRecord.id, {
        enabled_by: enabledBy,
        discoverable_name: discoverySettings.discoverableName
      });

      logger.info(`Successfully enabled discovery for tenant: ${tenantId}`);
      return discoveryRecord as TenantDiscovery;

    } catch (error) {
      logger.error('Failed to enable tenant discovery:', error);
      throw new Error(`Failed to enable tenant discovery: ${error.message}`);
    }
  }

  /**
   * Search discoverable tenants
   */
  async searchDiscoverableTenants(
    searchingTenantId: string,
    query: string,
    options: DiscoverySearchOptions = {}
  ): Promise<TenantDiscovery[]> {
    logger.info(`Searching discoverable tenants for: ${searchingTenantId}`);

    try {
      let dbQuery = this.db.db
        .selectFrom('tenant_discovery')
        .innerJoin('tenants', 'tenants.id', 'tenant_discovery.tenant_id')
        .select([
          'tenant_discovery.id',
          'tenant_discovery.tenant_id',
          'tenant_discovery.discoverable_name',
          'tenant_discovery.description',
          'tenant_discovery.discovery_tags',
          'tenant_discovery.capabilities',
          'tenant_discovery.contact_info',
          'tenant_discovery.discovery_score',
          'tenant_discovery.search_count',
          'tenant_discovery.last_searched_at',
          'tenants.tier',
          'tenants.data_region'
        ])
        .where('tenant_discovery.discovery_enabled', '=', true)
        .where('tenant_discovery.tenant_id', '!=', searchingTenantId)
        .where('tenants.status', '=', 'active');

      // Apply search filters
      if (query) {
        dbQuery = dbQuery.where((eb) => eb.or([
          eb('tenant_discovery.discoverable_name', 'ilike', `%${query}%`),
          eb('tenant_discovery.description', 'ilike', `%${query}%`)
        ]));
      }

      if (options.region) {
        dbQuery = dbQuery.where('tenants.data_region', '=', options.region);
      }

      // Apply sorting
      switch (options.sortBy) {
        case 'name':
          dbQuery = dbQuery.orderBy('tenant_discovery.discoverable_name', 'asc');
          break;
        case 'activity':
          dbQuery = dbQuery.orderBy('tenant_discovery.search_count', 'desc');
          break;
        default: // relevance
          dbQuery = dbQuery.orderBy('tenant_discovery.discovery_score', 'desc');
      }

      // Apply pagination
      if (options.offset) {
        dbQuery = dbQuery.offset(options.offset);
      }
      if (options.limit) {
        dbQuery = dbQuery.limit(options.limit);
      } else {
        dbQuery = dbQuery.limit(50); // Default limit
      }

      const results = await dbQuery.execute();

      // Update search statistics
      const tenantIds = results.map(r => r.tenant_id);
      if (tenantIds.length > 0) {
        await this.updateDiscoverySearchStats(tenantIds);
      }

      logger.info(`Found ${results.length} discoverable tenants`);
      return results as TenantDiscovery[];

    } catch (error) {
      logger.error('Failed to search discoverable tenants:', error);
      throw new Error(`Failed to search discoverable tenants: ${error.message}`);
    }
  }

  /**
   * Get tenant discovery details
   */
  async getTenantDiscoveryDetails(tenantId: string): Promise<TenantDiscovery | null> {
    try {
      const discovery = await this.db.db
        .selectFrom('tenant_discovery')
        .selectAll()
        .where('tenant_id', '=', tenantId)
        .where('discovery_enabled', '=', true)
        .executeTakeFirst();

      return discovery as TenantDiscovery | null;

    } catch (error) {
      logger.error('Failed to get tenant discovery details:', error);
      throw new Error(`Failed to get tenant discovery details: ${error.message}`);
    }
  }

  // ===================
  // FEDERATION INVITATIONS
  // ===================

  /**
   * Send federation invitation
   */
  async sendFederationInvitation(
    invitingTenantId: string,
    request: FederationRequest,
    invitedBy: string
  ): Promise<FederationInvitation> {
    logger.info(`Sending federation invitation from ${invitingTenantId} to ${request.targetTenantId}`);

    try {
      // Validate target tenant exists and allows federation
      const targetTenant = await this.validateFederationTarget(request.targetTenantId);
      if (!targetTenant) {
        throw new Error('Target tenant not found or does not allow federation');
      }

      // Check if invitation already exists
      const existingInvitation = await this.db.db
        .selectFrom('federation_invitations')
        .select('id')
        .where('inviting_tenant_id', '=', invitingTenantId)
        .where('invited_tenant_id', '=', request.targetTenantId)
        .where('status', 'in', ['sent', 'pending'])
        .executeTakeFirst();

      if (existingInvitation) {
        throw new Error('Active invitation already exists');
      }

      // Create federation invitation
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30); // 30 days expiration

      const [invitation] = await this.db.db
        .insertInto('federation_invitations')
        .values({
          inviting_tenant_id: invitingTenantId,
          invited_tenant_id: request.targetTenantId,
          invitation_type: request.invitationType,
          message: request.message,
          proposed_permissions: JSON.stringify(request.proposedPermissions),
          expires_at: expiresAt.toISOString(),
          invited_by: invitedBy
        })
        .returning([
          'id', 'inviting_tenant_id', 'invited_tenant_id',
          'invitation_type', 'message', 'proposed_permissions',
          'status', 'expires_at', 'invited_by', 'created_at'
        ])
        .execute();

      // Create tenant alert for the invited tenant
      await this.createFederationAlert(request.targetTenantId, 'federation_invitation', {
        inviting_tenant_id: invitingTenantId,
        invitation_type: request.invitationType,
        invitation_id: invitation.id
      });

      // Log federation activity
      await this.logFederationActivity(invitingTenantId, 'federation_invitation_sent', 'federation_invitation', invitation.id, {
        target_tenant_id: request.targetTenantId,
        invitation_type: request.invitationType,
        invited_by: invitedBy
      });

      logger.info(`Successfully sent federation invitation: ${invitation.id}`);
      return invitation as FederationInvitation;

    } catch (error) {
      logger.error('Failed to send federation invitation:', error);
      throw new Error(`Failed to send federation invitation: ${error.message}`);
    }
  }

  /**
   * Respond to federation invitation
   */
  async respondToFederationInvitation(
    invitationId: string,
    response: 'accepted' | 'declined',
    respondedBy: string,
    responseMessage?: string
  ): Promise<FederationInvitation> {
    logger.info(`Responding to federation invitation: ${invitationId} - ${response}`);

    try {
      const invitation = await this.db.db
        .selectFrom('federation_invitations')
        .selectAll()
        .where('id', '=', invitationId)
        .where('status', '=', 'sent')
        .executeTakeFirst();

      if (!invitation) {
        throw new Error('Invitation not found or already processed');
      }

      // Check expiration
      if (new Date(invitation.expires_at) < new Date()) {
        throw new Error('Invitation has expired');
      }

      // Update invitation status
      const [updatedInvitation] = await this.db.transaction(async (trx) => {
        const [updated] = await trx
          .updateTable('federation_invitations')
          .set({
            status: response,
            responded_by: respondedBy,
            response_message: responseMessage,
            responded_at: new Date().toISOString()
          })
          .where('id', '=', invitationId)
          .returning([
            'id', 'inviting_tenant_id', 'invited_tenant_id',
            'invitation_type', 'message', 'proposed_permissions',
            'status', 'responded_by', 'response_message',
            'responded_at', 'created_at'
          ])
          .execute();

        // If accepted, create cross-tenant permissions
        if (response === 'accepted') {
          const proposedPermissions = JSON.parse(invitation.proposed_permissions as string);
          for (const permission of proposedPermissions) {
            await trx
              .insertInto('cross_tenant_permissions')
              .values({
                source_tenant_id: invitation.inviting_tenant_id,
                target_tenant_id: invitation.invited_tenant_id,
                permission_type: permission.permissionType,
                resource_types: JSON.stringify(permission.resourceTypes),
                access_level: permission.accessLevel,
                conditions: JSON.stringify(permission.conditions || {}),
                status: 'active',
                expires_at: permission.expiresAt?.toISOString(),
                granted_by: respondedBy,
                granted_at: new Date().toISOString(),
                requested_by: invitation.invited_by,
                requested_at: invitation.created_at
              })
              .execute();
          }
        }

        return updated;
      });

      // Create notification for inviting tenant
      await this.createFederationAlert(invitation.inviting_tenant_id, 'federation_response', {
        invited_tenant_id: invitation.invited_tenant_id,
        response,
        invitation_id: invitationId
      });

      // Log federation activity
      await this.logFederationActivity(invitation.invited_tenant_id, 'federation_invitation_responded', 'federation_invitation', invitationId, {
        response,
        responded_by: respondedBy,
        inviting_tenant_id: invitation.inviting_tenant_id
      });

      logger.info(`Successfully responded to federation invitation: ${invitationId}`);
      return updatedInvitation as FederationInvitation;

    } catch (error) {
      logger.error('Failed to respond to federation invitation:', error);
      throw new Error(`Failed to respond to federation invitation: ${error.message}`);
    }
  }

  /**
   * Get federation invitations for tenant
   */
  async getFederationInvitations(
    tenantId: string,
    type: 'sent' | 'received' | 'all' = 'all',
    status?: string
  ): Promise<FederationInvitation[]> {
    logger.info(`Getting federation invitations for tenant: ${tenantId}`);

    try {
      let query = this.db.db
        .selectFrom('federation_invitations')
        .selectAll();

      // Apply tenant filter based on type
      if (type === 'sent') {
        query = query.where('inviting_tenant_id', '=', tenantId);
      } else if (type === 'received') {
        query = query.where('invited_tenant_id', '=', tenantId);
      } else {
        query = query.where((eb) => eb.or([
          eb('inviting_tenant_id', '=', tenantId),
          eb('invited_tenant_id', '=', tenantId)
        ]));
      }

      // Apply status filter
      if (status) {
        query = query.where('status', '=', status);
      }

      const invitations = await query
        .orderBy('created_at', 'desc')
        .execute();

      return invitations as FederationInvitation[];

    } catch (error) {
      logger.error('Failed to get federation invitations:', error);
      throw new Error(`Failed to get federation invitations: ${error.message}`);
    }
  }

  // ===================
  // CROSS-TENANT PERMISSIONS
  // ===================

  /**
   * Grant cross-tenant permission
   */
  async grantCrossTenantPermission(
    sourceTenantId: string,
    targetTenantId: string,
    permission: {
      permissionType: string;
      resourceTypes: string[];
      accessLevel: 'read' | 'write' | 'admin';
      conditions?: Record<string, any>;
      expiresAt?: Date;
    },
    grantedBy: string
  ): Promise<CrossTenantPermission> {
    logger.info(`Granting cross-tenant permission from ${sourceTenantId} to ${targetTenantId}`);

    try {
      // Validate both tenants exist and allow federation
      await this.validateFederationParticipants(sourceTenantId, targetTenantId);

      const [crossTenantPermission] = await this.db.db
        .insertInto('cross_tenant_permissions')
        .values({
          source_tenant_id: sourceTenantId,
          target_tenant_id: targetTenantId,
          permission_type: permission.permissionType,
          resource_types: JSON.stringify(permission.resourceTypes),
          access_level: permission.accessLevel,
          conditions: JSON.stringify(permission.conditions || {}),
          status: 'active',
          expires_at: permission.expiresAt?.toISOString(),
          granted_by: grantedBy,
          granted_at: new Date().toISOString(),
          requested_by: grantedBy,
          requested_at: new Date().toISOString()
        })
        .returning([
          'id', 'source_tenant_id', 'target_tenant_id',
          'permission_type', 'resource_types', 'access_level',
          'conditions', 'status', 'expires_at', 'granted_by',
          'granted_at', 'created_at', 'updated_at'
        ])
        .execute();

      // Log permission grant
      await this.logFederationActivity(sourceTenantId, 'cross_tenant_permission_granted', 'cross_tenant_permission', crossTenantPermission.id, {
        target_tenant_id: targetTenantId,
        permission_type: permission.permissionType,
        access_level: permission.accessLevel,
        granted_by: grantedBy
      });

      logger.info(`Successfully granted cross-tenant permission: ${crossTenantPermission.id}`);
      return crossTenantPermission as CrossTenantPermission;

    } catch (error) {
      logger.error('Failed to grant cross-tenant permission:', error);
      throw new Error(`Failed to grant cross-tenant permission: ${error.message}`);
    }
  }

  /**
   * Revoke cross-tenant permission
   */
  async revokeCrossTenantPermission(
    permissionId: string,
    revokedBy: string,
    reason?: string
  ): Promise<void> {
    logger.info(`Revoking cross-tenant permission: ${permissionId}`);

    try {
      const permission = await this.db.db
        .selectFrom('cross_tenant_permissions')
        .select(['source_tenant_id', 'target_tenant_id', 'permission_type'])
        .where('id', '=', permissionId)
        .executeTakeFirst();

      if (!permission) {
        throw new Error('Permission not found');
      }

      await this.db.db
        .updateTable('cross_tenant_permissions')
        .set({
          status: 'revoked',
          revoked_by: revokedBy,
          revoked_at: new Date().toISOString(),
          revocation_reason: reason,
          updated_at: new Date().toISOString()
        })
        .where('id', '=', permissionId)
        .execute();

      // Create alert for both tenants
      await this.createFederationAlert(permission.source_tenant_id, 'permission_revoked', {
        permission_id: permissionId,
        target_tenant_id: permission.target_tenant_id,
        permission_type: permission.permission_type,
        revoked_by: revokedBy,
        reason
      });

      await this.createFederationAlert(permission.target_tenant_id, 'permission_revoked', {
        permission_id: permissionId,
        source_tenant_id: permission.source_tenant_id,
        permission_type: permission.permission_type,
        revoked_by: revokedBy,
        reason
      });

      // Log permission revocation
      await this.logFederationActivity(permission.source_tenant_id, 'cross_tenant_permission_revoked', 'cross_tenant_permission', permissionId, {
        target_tenant_id: permission.target_tenant_id,
        revoked_by: revokedBy,
        reason
      });

      logger.info(`Successfully revoked cross-tenant permission: ${permissionId}`);

    } catch (error) {
      logger.error('Failed to revoke cross-tenant permission:', error);
      throw new Error(`Failed to revoke cross-tenant permission: ${error.message}`);
    }
  }

  /**
   * List cross-tenant permissions for tenant
   */
  async getCrossTenantPermissions(
    tenantId: string,
    direction: 'granted' | 'received' | 'both' = 'both'
  ): Promise<CrossTenantPermission[]> {
    logger.info(`Getting cross-tenant permissions for tenant: ${tenantId}`);

    try {
      let query = this.db.db
        .selectFrom('cross_tenant_permissions')
        .selectAll();

      if (direction === 'granted') {
        query = query.where('source_tenant_id', '=', tenantId);
      } else if (direction === 'received') {
        query = query.where('target_tenant_id', '=', tenantId);
      } else {
        query = query.where((eb) => eb.or([
          eb('source_tenant_id', '=', tenantId),
          eb('target_tenant_id', '=', tenantId)
        ]));
      }

      const permissions = await query
        .where('status', 'in', ['active', 'suspended'])
        .orderBy('created_at', 'desc')
        .execute();

      return permissions as CrossTenantPermission[];

    } catch (error) {
      logger.error('Failed to get cross-tenant permissions:', error);
      throw new Error(`Failed to get cross-tenant permissions: ${error.message}`);
    }
  }

  // ===================
  // TRUST AND VERIFICATION
  // ===================

  /**
   * Perform trust verification on a tenant
   */
  async performTrustVerification(
    tenantId: string,
    targetTenantId: string
  ): Promise<TrustVerificationResult> {
    logger.info(`Performing trust verification: ${tenantId} -> ${targetTenantId}`);

    try {
      const checks: { name: string; passed: boolean; details?: string }[] = [];
      const riskFactors: string[] = [];
      const recommendations: string[] = [];
      let trustScore = 100;

      // Check 1: Target tenant exists and is active
      const targetTenant = await this.db.db
        .selectFrom('tenants')
        .select(['status', 'tier', 'created_at'])
        .where('id', '=', targetTenantId)
        .executeTakeFirst();

      if (!targetTenant || targetTenant.status !== 'active') {
        checks.push({ name: 'Tenant Status', passed: false, details: 'Tenant not active' });
        trustScore -= 50;
        riskFactors.push('Target tenant is not active');
      } else {
        checks.push({ name: 'Tenant Status', passed: true });
      }

      // Check 2: Account age
      if (targetTenant) {
        const accountAge = Date.now() - new Date(targetTenant.created_at).getTime();
        const daysOld = accountAge / (1000 * 60 * 60 * 24);
        
        if (daysOld < 30) {
          checks.push({ name: 'Account Age', passed: false, details: 'Account less than 30 days old' });
          trustScore -= 20;
          riskFactors.push('New account (less than 30 days)');
          recommendations.push('Consider waiting for account to mature before federation');
        } else {
          checks.push({ name: 'Account Age', passed: true });
        }
      }

      // Check 3: Security incidents
      const securityIncidents = await this.db.db
        .selectFrom('tenant_alerts')
        .select(['id'])
        .where('tenant_id', '=', targetTenantId)
        .where('alert_type', '=', 'security_breach')
        .where('status', '!=', 'resolved')
        .execute();

      if (securityIncidents.length > 0) {
        checks.push({ name: 'Security History', passed: false, details: `${securityIncidents.length} active security incidents` });
        trustScore -= 30;
        riskFactors.push('Active security incidents');
        recommendations.push('Resolve security incidents before federation');
      } else {
        checks.push({ name: 'Security History', passed: true });
      }

      // Check 4: Compliance requirements compatibility
      const sourceTenant = await this.db.db
        .selectFrom('tenants')
        .select(['compliance_requirements'])
        .where('id', '=', tenantId)
        .executeTakeFirst();

      if (sourceTenant && targetTenant) {
        const sourceCompliance = JSON.parse(sourceTenant.compliance_requirements as string || '[]');
        // For now, assume compatibility - in real implementation, check actual compliance overlap
        checks.push({ name: 'Compliance Compatibility', passed: true });
      }

      // Check 5: Federation history
      const federationHistory = await this.db.db
        .selectFrom('cross_tenant_permissions')
        .select(['status'])
        .where('target_tenant_id', '=', targetTenantId)
        .where('status', '=', 'revoked')
        .execute();

      if (federationHistory.length > 3) {
        checks.push({ name: 'Federation History', passed: false, details: 'Multiple revoked permissions' });
        trustScore -= 15;
        riskFactors.push('History of revoked federation permissions');
      } else {
        checks.push({ name: 'Federation History', passed: true });
      }

      // Ensure trust score doesn't go below 0
      trustScore = Math.max(0, trustScore);

      const result: TrustVerificationResult = {
        verified: trustScore >= 70,
        trustScore,
        verificationChecks: checks,
        riskFactors,
        recommendations
      };

      // Log verification attempt
      await this.logFederationActivity(tenantId, 'trust_verification_performed', 'tenant', targetTenantId, {
        trust_score: trustScore,
        verified: result.verified,
        risk_factors_count: riskFactors.length
      });

      return result;

    } catch (error) {
      logger.error('Failed to perform trust verification:', error);
      throw new Error(`Failed to perform trust verification: ${error.message}`);
    }
  }

  // ===================
  // UTILITY METHODS
  // ===================

  /**
   * Get federation statistics for tenant
   */
  async getFederationStatistics(tenantId: string): Promise<{
    discoveryEnabled: boolean;
    searchCount: number;
    activePermissions: number;
    federationConnections: number;
    pendingInvitations: number;
    trustScore: number;
  }> {
    try {
      // Get discovery stats
      const discovery = await this.db.db
        .selectFrom('tenant_discovery')
        .select(['discovery_enabled', 'search_count'])
        .where('tenant_id', '=', tenantId)
        .executeTakeFirst();

      // Get permission counts
      const [activePermissionsCount] = await this.db.db
        .selectFrom('cross_tenant_permissions')
        .select((eb) => eb.fn.count<number>('id').as('count'))
        .where((eb) => eb.or([
          eb('source_tenant_id', '=', tenantId),
          eb('target_tenant_id', '=', tenantId)
        ]))
        .where('status', '=', 'active')
        .execute();

      // Get federation connections
      const [connectionsCount] = await this.db.db
        .selectFrom('cross_tenant_permissions')
        .select((eb) => eb.fn.countDistinct('target_tenant_id').as('count'))
        .where('source_tenant_id', '=', tenantId)
        .where('status', '=', 'active')
        .execute();

      // Get pending invitations
      const [pendingCount] = await this.db.db
        .selectFrom('federation_invitations')
        .select((eb) => eb.fn.count<number>('id').as('count'))
        .where('invited_tenant_id', '=', tenantId)
        .where('status', '=', 'sent')
        .execute();

      return {
        discoveryEnabled: discovery?.discovery_enabled || false,
        searchCount: discovery?.search_count || 0,
        activePermissions: activePermissionsCount.count || 0,
        federationConnections: connectionsCount.count || 0,
        pendingInvitations: pendingCount.count || 0,
        trustScore: 85 // Placeholder - would be calculated based on various factors
      };

    } catch (error) {
      logger.error('Failed to get federation statistics:', error);
      throw new Error(`Failed to get federation statistics: ${error.message}`);
    }
  }

  // ===================
  // PRIVATE HELPER METHODS
  // ===================

  private async validateFederationTarget(tenantId: string): Promise<boolean> {
    const tenant = await this.db.db
      .selectFrom('tenants')
      .select(['federation_enabled', 'status'])
      .where('id', '=', tenantId)
      .executeTakeFirst();

    return tenant?.status === 'active' && tenant?.federation_enabled;
  }

  private async validateFederationParticipants(sourceTenantId: string, targetTenantId: string): Promise<void> {
    const sourceValid = await this.validateFederationTarget(sourceTenantId);
    const targetValid = await this.validateFederationTarget(targetTenantId);

    if (!sourceValid) {
      throw new Error('Source tenant does not allow federation');
    }
    if (!targetValid) {
      throw new Error('Target tenant does not allow federation');
    }
  }

  private async updateDiscoverySearchStats(tenantIds: string[]): Promise<void> {
    try {
      await this.db.db
        .updateTable('tenant_discovery')
        .set({
          search_count: (eb) => eb('search_count', '+', 1),
          last_searched_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .where('tenant_id', 'in', tenantIds)
        .execute();
    } catch (error) {
      logger.error('Failed to update discovery search stats:', error);
    }
  }

  private async createFederationAlert(
    tenantId: string,
    alertType: string,
    alertData: Record<string, any>
  ): Promise<void> {
    try {
      await this.db.db
        .insertInto('tenant_alerts')
        .values({
          tenant_id: tenantId,
          alert_type: alertType,
          severity: 'medium',
          title: this.getFederationAlertTitle(alertType),
          message: this.getFederationAlertMessage(alertType, alertData),
          alert_data: JSON.stringify(alertData)
        })
        .execute();
    } catch (error) {
      logger.error('Failed to create federation alert:', error);
    }
  }

  private getFederationAlertTitle(alertType: string): string {
    switch (alertType) {
      case 'federation_invitation': return 'New Federation Invitation';
      case 'federation_response': return 'Federation Invitation Response';
      case 'permission_revoked': return 'Federation Permission Revoked';
      default: return 'Federation Activity';
    }
  }

  private getFederationAlertMessage(alertType: string, data: Record<string, any>): string {
    switch (alertType) {
      case 'federation_invitation':
        return `You have received a federation invitation for ${data.invitation_type}`;
      case 'federation_response':
        return `Your federation invitation was ${data.response}`;
      case 'permission_revoked':
        return `A federation permission has been revoked: ${data.permission_type}`;
      default:
        return 'Federation activity occurred';
    }
  }

  private async logFederationActivity(
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
          action_details: JSON.stringify(details),
          is_cross_tenant: true
        })
        .execute();
    } catch (error) {
      logger.error('Failed to log federation activity:', error);
    }
  }
}