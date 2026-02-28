/**
 * Federation Node Registry Service
 * 
 * Manages the registry of federation nodes for cross-organization collaboration.
 * Handles node discovery, registration, health monitoring, and capability management.
 * 
 * Part of Work Item 4.2.2 - Federation Protocol Implementation
 */

import { logger } from '../../utils/logger.js';
import { DatabaseConnectionPool } from '../../utils/database-pool.js';
import { 
  FederationNode,
  FederationProtocol,
  NodeRegistrationRequest,
  validateFederationNode,
  validateNodeRegistrationRequest
} from '../../shared/types/federation.js';
import { z } from 'zod';
import crypto from 'crypto';

interface NodeHealthCheck {
  node_id: string;
  health_status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  response_time_ms: number;
  last_check: string;
  error_details?: string;
}

interface NodeCapabilitiesUpdate {
  search_capabilities?: string[];
  content_types_supported?: string[];
  max_concurrent_requests?: number;
  supported_languages?: string[];
  data_classification_levels?: string[];
  compliance_certifications?: string[];
}

interface NodeDiscoveryOptions {
  geographic_region?: string;
  capabilities?: string[];
  data_classification?: string;
  compliance_requirements?: string[];
  trust_score_min?: number;
  status?: string[];
  limit?: number;
  offset?: number;
}

export class FederationNodeRegistry {
  private db: DatabaseConnectionPool;

  constructor() {
    this.db = new DatabaseConnectionPool();
  }

  // ===================
  // NODE REGISTRATION AND MANAGEMENT
  // ===================

  /**
   * Register a new federation node
   */
  async registerNode(
    tenantId: string,
    registrationRequest: NodeRegistrationRequest,
    registeredBy: string
  ): Promise<FederationNode> {
    logger.info(`Registering federation node: ${registrationRequest.node_name} for tenant: ${tenantId}`);

    try {
      // Validate registration request
      const validatedRequest = validateNodeRegistrationRequest(registrationRequest);

      // Check for duplicate endpoints
      const existingNode = await this.db.db
        .selectFrom('federation_nodes')
        .select('id')
        .where('primary_endpoint', '=', validatedRequest.primary_endpoint)
        .executeTakeFirst();

      if (existingNode) {
        throw new Error('Node with this endpoint already exists');
      }

      // Generate node ID and initial trust score
      const nodeId = crypto.randomUUID();
      const initialTrustScore = await this.calculateInitialTrustScore(validatedRequest);

      // Create federation node record
      const [federationNode] = await this.db.db
        .insertInto('federation_nodes')
        .values({
          id: nodeId,
          tenant_id: tenantId,
          node_name: validatedRequest.node_name,
          organization_name: validatedRequest.organization_name,
          primary_endpoint: validatedRequest.primary_endpoint,
          websocket_endpoint: validatedRequest.websocket_endpoint,
          supported_protocols: JSON.stringify(validatedRequest.supported_protocols),
          capabilities: JSON.stringify(validatedRequest.capabilities),
          geographic_region: validatedRequest.geographic_region,
          compliance_certifications: JSON.stringify(validatedRequest.compliance_certifications),
          trust_score: initialTrustScore,
          status: 'pending',
          health_status: 'unknown',
          contact_information: JSON.stringify(validatedRequest.contact_information),
          public_key: validatedRequest.public_key,
          tls_certificate_fingerprint: validatedRequest.certificate_fingerprint,
          federation_metadata: JSON.stringify({
            registered_by: registeredBy,
            registration_ip: 'unknown' // Would be set by middleware
          })
        })
        .returning([
          'id', 'tenant_id', 'node_name', 'node_type', 'organization_name',
          'primary_endpoint', 'websocket_endpoint', 'api_version',
          'supported_protocols', 'capabilities', 'geographic_region',
          'data_classification', 'compliance_certifications', 'trust_score',
          'status', 'health_check_interval', 'last_health_check',
          'health_status', 'response_time_ms', 'uptime_percentage',
          'authentication_method', 'tls_certificate_fingerprint',
          'api_key_hash', 'public_key', 'encryption_algorithm',
          'federation_metadata', 'contact_information', 'created_at',
          'updated_at', 'verified_at', 'verified_by'
        ])
        .execute();

      // Register default protocols
      await this.registerNodeProtocols(nodeId, validatedRequest);

      // Schedule initial health check
      await this.scheduleHealthCheck(nodeId);

      // Log node registration
      await this.logNodeActivity(tenantId, nodeId, 'node_registered', {
        registered_by: registeredBy,
        organization: validatedRequest.organization_name,
        endpoint: validatedRequest.primary_endpoint
      });

      logger.info(`Successfully registered federation node: ${nodeId}`);
      return validateFederationNode(federationNode);

    } catch (error) {
      logger.error('Failed to register federation node:', error);
      throw new Error(`Failed to register federation node: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Update node capabilities and configuration
   */
  async updateNodeCapabilities(
    nodeId: string,
    tenantId: string,
    capabilities: NodeCapabilitiesUpdate,
    updatedBy: string
  ): Promise<FederationNode> {
    logger.info(`Updating capabilities for federation node: ${nodeId}`);

    try {
      // Verify node ownership
      const existingNode = await this.verifyNodeOwnership(nodeId, tenantId);

      // Update node capabilities
      const [updatedNode] = await this.db.db
        .updateTable('federation_nodes')
        .set({
          capabilities: JSON.stringify({
            ...JSON.parse(existingNode.capabilities as string || '{}'),
            ...capabilities
          }),
          updated_at: new Date().toISOString()
        })
        .where('id', '=', nodeId)
        .where('tenant_id', '=', tenantId)
        .returning([
          'id', 'tenant_id', 'node_name', 'node_type', 'organization_name',
          'primary_endpoint', 'websocket_endpoint', 'api_version',
          'supported_protocols', 'capabilities', 'geographic_region',
          'data_classification', 'compliance_certifications', 'trust_score',
          'status', 'health_check_interval', 'last_health_check',
          'health_status', 'response_time_ms', 'uptime_percentage',
          'authentication_method', 'tls_certificate_fingerprint',
          'api_key_hash', 'public_key', 'encryption_algorithm',
          'federation_metadata', 'contact_information', 'created_at',
          'updated_at', 'verified_at', 'verified_by'
        ])
        .execute();

      if (!updatedNode) {
        throw new Error('Node not found or access denied');
      }

      // Log capability update
      await this.logNodeActivity(tenantId, nodeId, 'capabilities_updated', {
        updated_by: updatedBy,
        capabilities_updated: Object.keys(capabilities)
      });

      logger.info(`Successfully updated capabilities for federation node: ${nodeId}`);
      return validateFederationNode(updatedNode);

    } catch (error) {
      logger.error('Failed to update node capabilities:', error);
      throw new Error(`Failed to update node capabilities: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Deactivate a federation node
   */
  async deactivateNode(
    nodeId: string,
    tenantId: string,
    reason: string,
    deactivatedBy: string
  ): Promise<void> {
    logger.info(`Deactivating federation node: ${nodeId}`);

    try {
      // Verify node ownership
      await this.verifyNodeOwnership(nodeId, tenantId);

      // Update node status
      await this.db.db
        .updateTable('federation_nodes')
        .set({
          status: 'inactive',
          updated_at: new Date().toISOString(),
          federation_metadata: this.db.db
            .selectFrom('federation_nodes')
            .select((eb) => 
              eb.fn('jsonb_set', [
                'federation_metadata',
                JSON.stringify(['deactivation']),
                JSON.stringify({
                  deactivated_by: deactivatedBy,
                  deactivated_at: new Date().toISOString(),
                  reason: reason
                })
              ])
            )
            .where('id', '=', nodeId)
        })
        .where('id', '=', nodeId)
        .where('tenant_id', '=', tenantId)
        .execute();

      // Disable all protocols for this node
      await this.db.db
        .updateTable('federation_protocols')
        .set({
          is_enabled: false,
          updated_at: new Date().toISOString()
        })
        .where('node_id', '=', nodeId)
        .execute();

      // Log node deactivation
      await this.logNodeActivity(tenantId, nodeId, 'node_deactivated', {
        deactivated_by: deactivatedBy,
        reason: reason
      });

      logger.info(`Successfully deactivated federation node: ${nodeId}`);

    } catch (error) {
      logger.error('Failed to deactivate federation node:', error);
      throw new Error(`Failed to deactivate federation node: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // ===================
  // NODE DISCOVERY
  // ===================

  /**
   * Discover federation nodes based on criteria
   */
  async discoverNodes(
    searchingTenantId: string,
    options: NodeDiscoveryOptions = {}
  ): Promise<FederationNode[]> {
    logger.info(`Discovering federation nodes for tenant: ${searchingTenantId}`);

    try {
      let query = this.db.db
        .selectFrom('federation_nodes')
        .select([
          'id', 'tenant_id', 'node_name', 'node_type', 'organization_name',
          'primary_endpoint', 'websocket_endpoint', 'api_version',
          'supported_protocols', 'capabilities', 'geographic_region',
          'data_classification', 'compliance_certifications', 'trust_score',
          'status', 'health_status', 'response_time_ms', 'uptime_percentage',
          'contact_information', 'created_at', 'updated_at'
        ])
        .where('status', 'in', options.status || ['active', 'pending'])
        .where('tenant_id', '!=', searchingTenantId); // Exclude own nodes

      // Apply geographic region filter
      if (options.geographic_region) {
        query = query.where('geographic_region', '=', options.geographic_region);
      }

      // Apply data classification filter
      if (options.data_classification) {
        query = query.where('data_classification', '=', options.data_classification);
      }

      // Apply minimum trust score filter
      if (options.trust_score_min !== undefined) {
        query = query.where('trust_score', '>=', options.trust_score_min);
      }

      // Apply capability filters (basic implementation - would be more sophisticated in practice)
      if (options.capabilities && options.capabilities.length > 0) {
        for (const capability of options.capabilities) {
          query = query.where((eb) => 
            eb.fn('jsonb_exists', ['capabilities', capability])
          );
        }
      }

      // Apply compliance filters
      if (options.compliance_requirements && options.compliance_requirements.length > 0) {
        for (const requirement of options.compliance_requirements) {
          query = query.where((eb) => 
            eb.fn('jsonb_exists', ['compliance_certifications', requirement])
          );
        }
      }

      // Apply sorting and pagination
      query = query
        .orderBy('trust_score', 'desc')
        .orderBy('uptime_percentage', 'desc');

      if (options.offset) {
        query = query.offset(options.offset);
      }

      if (options.limit) {
        query = query.limit(options.limit);
      } else {
        query = query.limit(50); // Default limit
      }

      const discoveredNodes = await query.execute();

      // Update discovery statistics
      if (discoveredNodes.length > 0) {
        await this.updateDiscoveryStats(discoveredNodes.map(n => n.id));
      }

      logger.info(`Discovered ${discoveredNodes.length} federation nodes`);
      return discoveredNodes.map(node => validateFederationNode(node));

    } catch (error) {
      logger.error('Failed to discover federation nodes:', error);
      throw new Error(`Failed to discover federation nodes: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get detailed information about a specific node
   */
  async getNodeDetails(nodeId: string, requestingTenantId?: string): Promise<FederationNode | null> {
    try {
      let query = this.db.db
        .selectFrom('federation_nodes')
        .selectAll();

      if (requestingTenantId) {
        // Allow access to own nodes or publicly discoverable nodes
        query = query.where((eb) => eb.or([
          eb('tenant_id', '=', requestingTenantId),
          eb('status', '=', 'active')
        ]));
      } else {
        query = query.where('status', '=', 'active');
      }

      const node = await query
        .where('id', '=', nodeId)
        .executeTakeFirst();

      return node ? validateFederationNode(node) : null;

    } catch (error) {
      logger.error('Failed to get node details:', error);
      throw new Error(`Failed to get node details: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // ===================
  // HEALTH MONITORING
  // ===================

  /**
   * Perform health check on a node
   */
  async performHealthCheck(nodeId: string): Promise<NodeHealthCheck> {
    logger.info(`Performing health check for node: ${nodeId}`);

    try {
      const node = await this.db.db
        .selectFrom('federation_nodes')
        .select(['id', 'primary_endpoint', 'health_check_interval'])
        .where('id', '=', nodeId)
        .where('status', 'in', ['active', 'pending'])
        .executeTakeFirst();

      if (!node) {
        throw new Error('Node not found or inactive');
      }

      const startTime = Date.now();
      let healthStatus: 'healthy' | 'degraded' | 'unhealthy' | 'unknown' = 'unknown';
      let errorDetails: string | undefined;

      try {
        // Perform HTTP health check (simplified implementation)
        const healthEndpoint = `${node.primary_endpoint}/health`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

        const response = await fetch(healthEndpoint, {
          method: 'GET',
          headers: { 'User-Agent': 'MCP-Tools-Federation/1.0' },
          signal: controller.signal
        });

        clearTimeout(timeoutId);
        const responseTime = Date.now() - startTime;

        if (response.ok) {
          healthStatus = responseTime < 1000 ? 'healthy' : 'degraded';
        } else {
          healthStatus = 'unhealthy';
          errorDetails = `HTTP ${response.status}: ${response.statusText}`;
        }

      } catch (fetchError: any) {
        const responseTime = Date.now() - startTime;
        healthStatus = 'unhealthy';
        errorDetails = fetchError.message || 'Connection failed';
      }

      const responseTime = Date.now() - startTime;
      const healthCheck: NodeHealthCheck = {
        node_id: nodeId,
        health_status: healthStatus,
        response_time_ms: responseTime,
        last_check: new Date().toISOString(),
        error_details: errorDetails
      };

      // Update node health status in database
      await this.updateNodeHealthStatus(nodeId, healthCheck);

      return healthCheck;

    } catch (error) {
      logger.error('Failed to perform health check:', error);
      throw new Error(`Failed to perform health check: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Schedule health check for a node
   */
  async scheduleHealthCheck(nodeId: string): Promise<void> {
    // This would integrate with a job scheduler in a real implementation
    logger.info(`Scheduled health check for node: ${nodeId}`);
  }

  // ===================
  // PRIVATE HELPER METHODS
  // ===================

  private async verifyNodeOwnership(nodeId: string, tenantId: string): Promise<any> {
    const node = await this.db.db
      .selectFrom('federation_nodes')
      .selectAll()
      .where('id', '=', nodeId)
      .where('tenant_id', '=', tenantId)
      .executeTakeFirst();

    if (!node) {
      throw new Error('Node not found or access denied');
    }

    return node;
  }

  private async calculateInitialTrustScore(request: NodeRegistrationRequest): Promise<number> {
    let score = 50; // Base score

    // Boost score based on compliance certifications
    if (request.compliance_certifications && request.compliance_certifications.length > 0) {
      score += request.compliance_certifications.length * 5;
    }

    // Boost score if public key is provided
    if (request.public_key) {
      score += 10;
    }

    // Boost score if certificate fingerprint is provided
    if (request.certificate_fingerprint) {
      score += 10;
    }

    // Boost score if contact information is comprehensive
    if (request.contact_information && Object.keys(request.contact_information).length >= 3) {
      score += 10;
    }

    return Math.min(score, 100); // Cap at 100
  }

  private async registerNodeProtocols(nodeId: string, request: NodeRegistrationRequest): Promise<void> {
    const protocols = request.supported_protocols || ['http'];
    
    for (const protocol of protocols) {
      const endpoint = protocol === 'websocket' ? request.websocket_endpoint : request.primary_endpoint;
      
      if (endpoint) {
        await this.db.db
          .insertInto('federation_protocols')
          .values({
            node_id: nodeId,
            protocol_name: protocol,
            protocol_version: '1.0',
            endpoint_url: endpoint,
            supported_operations: JSON.stringify(['search', 'sync', 'health']),
            is_primary: protocol === 'http',
            is_enabled: true
          })
          .execute();
      }
    }
  }

  private async updateNodeHealthStatus(nodeId: string, healthCheck: NodeHealthCheck): Promise<void> {
    await this.db.db
      .updateTable('federation_nodes')
      .set({
        health_status: healthCheck.health_status,
        response_time_ms: healthCheck.response_time_ms,
        last_health_check: healthCheck.last_check,
        updated_at: new Date().toISOString()
      })
      .where('id', '=', nodeId)
      .execute();

    // Record performance metric
    await this.db.db
      .insertInto('federation_performance_metrics')
      .values({
        node_id: nodeId,
        metric_type: 'health_check',
        metric_name: 'response_time',
        metric_value: healthCheck.response_time_ms,
        metric_unit: 'milliseconds',
        measurement_window_start: healthCheck.last_check,
        measurement_window_end: healthCheck.last_check,
        metadata: JSON.stringify({
          health_status: healthCheck.health_status,
          error_details: healthCheck.error_details
        })
      })
      .execute();
  }

  private async updateDiscoveryStats(nodeIds: string[]): Promise<void> {
    // This would update discovery statistics in the tenant_discovery table
    // Simplified implementation for now
    logger.debug(`Updated discovery stats for ${nodeIds.length} nodes`);
  }

  private async logNodeActivity(
    tenantId: string,
    nodeId: string,
    action: string,
    details: Record<string, any>
  ): Promise<void> {
    try {
      await this.db.db
        .insertInto('tenant_audit_logs')
        .values({
          tenant_id: tenantId,
          action,
          resource_type: 'federation_node',
          resource_id: nodeId,
          action_details: JSON.stringify(details),
          is_cross_tenant: false
        })
        .execute();
    } catch (error) {
      logger.error('Failed to log node activity:', error);
    }
  }

  /**
   * Get federation statistics for monitoring
   */
  async getFederationStatistics(tenantId: string): Promise<{
    total_nodes: number;
    active_nodes: number;
    healthy_nodes: number;
    average_response_time: number;
    average_trust_score: number;
    geographic_distribution: Record<string, number>;
  }> {
    try {
      const [totalNodes] = await this.db.db
        .selectFrom('federation_nodes')
        .select((eb) => eb.fn.count<number>('id').as('count'))
        .where('tenant_id', '=', tenantId)
        .execute();

      const [activeNodes] = await this.db.db
        .selectFrom('federation_nodes')
        .select((eb) => eb.fn.count<number>('id').as('count'))
        .where('tenant_id', '=', tenantId)
        .where('status', '=', 'active')
        .execute();

      const [healthyNodes] = await this.db.db
        .selectFrom('federation_nodes')
        .select((eb) => eb.fn.count<number>('id').as('count'))
        .where('tenant_id', '=', tenantId)
        .where('health_status', '=', 'healthy')
        .execute();

      const [avgStats] = await this.db.db
        .selectFrom('federation_nodes')
        .select((eb) => [
          eb.fn.avg('response_time_ms').as('avg_response_time'),
          eb.fn.avg('trust_score').as('avg_trust_score')
        ])
        .where('tenant_id', '=', tenantId)
        .where('status', '=', 'active')
        .execute();

      // Get geographic distribution
      const geoDistribution = await this.db.db
        .selectFrom('federation_nodes')
        .select(['geographic_region'])
        .select((eb) => eb.fn.count<number>('id').as('count'))
        .where('tenant_id', '=', tenantId)
        .where('status', '=', 'active')
        .groupBy('geographic_region')
        .execute();

      const geoMap: Record<string, number> = {};
      geoDistribution.forEach(row => {
        if (row.geographic_region) {
          geoMap[row.geographic_region] = row.count || 0;
        }
      });

      return {
        total_nodes: totalNodes.count || 0,
        active_nodes: activeNodes.count || 0,
        healthy_nodes: healthyNodes.count || 0,
        average_response_time: avgStats?.avg_response_time ? Number(avgStats.avg_response_time) : 0,
        average_trust_score: avgStats?.avg_trust_score ? Number(avgStats.avg_trust_score) : 0,
        geographic_distribution: geoMap
      };

    } catch (error) {
      logger.error('Failed to get federation statistics:', error);
      throw new Error(`Failed to get federation statistics: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}