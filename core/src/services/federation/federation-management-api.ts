/**
 * Federation Management API Service
 * 
 * High-level API service for managing federation operations through a unified interface.
 * Provides administrative operations, monitoring, and configuration management.
 * 
 * Part of Work Item 4.2.2 - Federation Protocol Implementation
 */

import { logger } from '../../utils/logger.js';
import { DatabaseConnectionPool } from '../../utils/database-pool.js';
import { FederationProtocolService } from './federation-protocol-service.js';
import { FederationNodeRegistry } from './federation-node-registry.js';
import { FederationSecurityManager } from './federation-security-manager.js';
import { FederationPerformanceMonitor } from './federation-performance-monitor.js';
import { FederationComplianceService } from './federation-compliance-service.js';
import { 
  FederationNode,
  FederationSearchRequest,
  FederationSearchResponse,
  NodeRegistrationRequest,
  validateFederationNode,
  validateFederationSearchRequest
} from '../../shared/types/federation.js';

interface FederationManagementConfig {
  enableDashboard: boolean;
  enableRealTimeMetrics: boolean;
  enableAutomaticFailover: boolean;
  maxConcurrentSearches: number;
  defaultSearchTimeout: number;
  performanceMonitoringInterval: number;
}

interface FederationDashboardMetrics {
  totalNodes: number;
  activeNodes: number;
  totalSearches: number;
  avgSearchLatency: number;
  errorRate: number;
  complianceScore: number;
  securityAlerts: number;
  systemHealth: 'healthy' | 'degraded' | 'critical';
  lastUpdated: string;
}

interface FederationNodeSummary extends FederationNode {
  searchCount: number;
  avgResponseTime: number;
  successRate: number;
  lastSearchTime?: string;
  complianceStatus: 'compliant' | 'warning' | 'violation';
}

/**
 * High-level Federation Management Service
 * 
 * Orchestrates all federation services and provides unified management APIs
 */
export class FederationManagementService {
  private db: DatabaseConnectionPool;
  private federationService: FederationProtocolService;
  private nodeRegistry: FederationNodeRegistry;
  private securityManager: FederationSecurityManager;
  private performanceMonitor: FederationPerformanceMonitor;
  private complianceService: FederationComplianceService;
  private config: FederationManagementConfig;

  constructor(config: Partial<FederationManagementConfig> = {}) {
    this.db = new DatabaseConnectionPool();
    this.federationService = new FederationProtocolService();
    this.nodeRegistry = new FederationNodeRegistry();
    this.securityManager = new FederationSecurityManager();
    this.performanceMonitor = new FederationPerformanceMonitor();
    this.complianceService = new FederationComplianceService();

    this.config = {
      enableDashboard: true,
      enableRealTimeMetrics: true,
      enableAutomaticFailover: true,
      maxConcurrentSearches: 50,
      defaultSearchTimeout: 30000,
      performanceMonitoringInterval: 60000,
      ...config
    };

    logger.info('Federation Management Service initialized', {
      config: this.config
    });
  }

  // ===================
  // NODE MANAGEMENT APIs
  // ===================

  /**
   * Get all federation nodes with performance metrics
   */
  async getAllNodes(tenantId: string): Promise<FederationNodeSummary[]> {
    try {
      const nodes = await this.nodeRegistry.getAllNodes(tenantId);
      const summaries: FederationNodeSummary[] = [];

      for (const node of nodes) {
        const metrics = await this.performanceMonitor.getNodeMetrics(node.id);
        const complianceStatus = await this.complianceService.getNodeComplianceStatus(node.id);
        
        summaries.push({
          ...node,
          searchCount: metrics.total_searches || 0,
          avgResponseTime: metrics.average_response_time || 0,
          successRate: metrics.success_rate || 0,
          lastSearchTime: metrics.last_search_time,
          complianceStatus: complianceStatus.overall_status
        });
      }

      return summaries;
    } catch (error) {
      logger.error('Error getting all federation nodes', { error, tenantId });
      throw new Error(`Failed to get federation nodes: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Register a new federation node with full validation
   */
  async registerNode(
    tenantId: string,
    registrationRequest: NodeRegistrationRequest,
    registeredBy: string
  ): Promise<FederationNode> {
    try {
      // Register node through node registry
      const node = await this.nodeRegistry.registerNode(tenantId, registrationRequest, registeredBy);
      
      // Generate security certificates
      await this.securityManager.generateFederationCertificate(
        node.id,
        node.node_name,
        node.organization_name,
        tenantId,
        'admin'
      );

      // Initialize performance monitoring
      await this.performanceMonitor.initializeNodeMonitoring(node.id);

      // Set up compliance monitoring
      await this.complianceService.initializeNodeCompliance(node.id, tenantId);

      logger.info('Federation node registered successfully', {
        nodeId: node.id,
        nodeName: node.node_name,
        tenantId,
        registeredBy
      });

      return node;
    } catch (error) {
      logger.error('Error registering federation node', { error, tenantId, registrationRequest });
      throw new Error(`Failed to register node: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Remove a federation node and cleanup resources
   */
  async removeNode(tenantId: string, nodeId: string, removedBy: string): Promise<void> {
    try {
      // Deactivate node first
      await this.nodeRegistry.deactivateNode(nodeId, removedBy);
      
      // Cleanup security resources
      await this.securityManager.revokeFederationCertificate(nodeId, tenantId, removedBy);
      
      // Stop performance monitoring
      await this.performanceMonitor.stopNodeMonitoring(nodeId);
      
      // Archive compliance data
      await this.complianceService.archiveNodeCompliance(nodeId, tenantId);

      logger.info('Federation node removed successfully', {
        nodeId,
        tenantId,
        removedBy
      });
    } catch (error) {
      logger.error('Error removing federation node', { error, nodeId, tenantId });
      throw new Error(`Failed to remove node: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // ===================
  // SEARCH MANAGEMENT APIs
  // ===================

  /**
   * Execute federation search with comprehensive monitoring
   */
  async executeFederationSearch(
    tenantId: string,
    searchRequest: FederationSearchRequest,
    initiatedBy: string
  ): Promise<FederationSearchResponse> {
    try {
      // Validate search request
      const validatedRequest = validateFederationSearchRequest(searchRequest);

      // Execute search through federation service
      const response = await this.federationService.executeDistributedSearch(
        tenantId,
        validatedRequest,
        initiatedBy
      );

      // Log search metrics
      await this.performanceMonitor.recordSearchMetrics({
        search_id: response.search_id,
        tenant_id: tenantId,
        query: validatedRequest.query,
        nodes_searched: response.nodes_searched,
        total_results: response.total_results,
        search_duration_ms: response.search_duration_ms,
        success: response.status === 'completed'
      });

      return response;
    } catch (error) {
      logger.error('Error executing federation search', { error, tenantId, searchRequest });
      throw new Error(`Federation search failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // ===================
  // DASHBOARD & MONITORING APIs
  // ===================

  /**
   * Get comprehensive dashboard metrics
   */
  async getDashboardMetrics(tenantId: string): Promise<FederationDashboardMetrics> {
    try {
      const [
        nodes,
        searchStats,
        performanceStats,
        complianceStats,
        securityAlerts
      ] = await Promise.all([
        this.nodeRegistry.getAllNodes(tenantId),
        this.performanceMonitor.getSearchStatistics(tenantId, 24 * 60 * 60 * 1000), // 24 hours
        this.performanceMonitor.getOverallPerformanceStats(tenantId),
        this.complianceService.getTenantComplianceScore(tenantId),
        this.securityManager.getSecurityAlerts(tenantId, 'open')
      ]);

      const activeNodes = nodes.filter(n => n.status === 'active');
      
      return {
        totalNodes: nodes.length,
        activeNodes: activeNodes.length,
        totalSearches: searchStats.total_searches,
        avgSearchLatency: performanceStats.average_response_time,
        errorRate: performanceStats.error_rate,
        complianceScore: complianceStats.overall_score,
        securityAlerts: securityAlerts.length,
        systemHealth: this.calculateSystemHealth(performanceStats, complianceStats, activeNodes.length / Math.max(nodes.length, 1)),
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Error getting dashboard metrics', { error, tenantId });
      throw new Error(`Failed to get dashboard metrics: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get detailed federation health status
   */
  async getFederationHealthStatus(tenantId: string): Promise<{
    overall: 'healthy' | 'degraded' | 'critical';
    components: {
      nodes: { status: string; details: any };
      security: { status: string; details: any };
      performance: { status: string; details: any };
      compliance: { status: string; details: any };
    };
  }> {
    try {
      const [
        nodeHealth,
        securityHealth,
        performanceHealth,
        complianceHealth
      ] = await Promise.all([
        this.checkNodeHealth(tenantId),
        this.checkSecurityHealth(tenantId),
        this.checkPerformanceHealth(tenantId),
        this.checkComplianceHealth(tenantId)
      ]);

      const componentStatuses = [nodeHealth.status, securityHealth.status, performanceHealth.status, complianceHealth.status];
      const overall = this.determineOverallHealth(componentStatuses);

      return {
        overall,
        components: {
          nodes: nodeHealth,
          security: securityHealth,
          performance: performanceHealth,
          compliance: complianceHealth
        }
      };
    } catch (error) {
      logger.error('Error getting federation health status', { error, tenantId });
      return {
        overall: 'critical',
        components: {
          nodes: { status: 'error', details: { error: error instanceof Error ? error.message : String(error) } },
          security: { status: 'error', details: { error: error instanceof Error ? error.message : String(error) } },
          performance: { status: 'error', details: { error: error instanceof Error ? error.message : String(error) } },
          compliance: { status: 'error', details: { error: error instanceof Error ? error.message : String(error) } }
        }
      };
    }
  }

  // ===================
  // PRIVATE METHODS
  // ===================

  private calculateSystemHealth(
    performanceStats: any, 
    complianceStats: any, 
    nodeAvailability: number
  ): 'healthy' | 'degraded' | 'critical' {
    if (nodeAvailability < 0.5 || performanceStats.error_rate > 0.1 || complianceStats.overall_score < 0.7) {
      return 'critical';
    }
    if (nodeAvailability < 0.8 || performanceStats.error_rate > 0.05 || complianceStats.overall_score < 0.9) {
      return 'degraded';
    }
    return 'healthy';
  }

  private async checkNodeHealth(tenantId: string): Promise<{ status: string; details: any }> {
    const nodes = await this.nodeRegistry.getAllNodes(tenantId);
    const healthyNodes = nodes.filter(n => n.health_status === 'healthy');
    const availability = healthyNodes.length / Math.max(nodes.length, 1);

    return {
      status: availability > 0.8 ? 'healthy' : availability > 0.5 ? 'degraded' : 'critical',
      details: {
        totalNodes: nodes.length,
        healthyNodes: healthyNodes.length,
        availability
      }
    };
  }

  private async checkSecurityHealth(tenantId: string): Promise<{ status: string; details: any }> {
    const alerts = await this.securityManager.getSecurityAlerts(tenantId, 'open');
    const criticalAlerts = alerts.filter(a => a.severity === 'critical');

    return {
      status: criticalAlerts.length === 0 ? 'healthy' : alerts.length < 5 ? 'degraded' : 'critical',
      details: {
        totalAlerts: alerts.length,
        criticalAlerts: criticalAlerts.length
      }
    };
  }

  private async checkPerformanceHealth(tenantId: string): Promise<{ status: string; details: any }> {
    const stats = await this.performanceMonitor.getOverallPerformanceStats(tenantId);
    
    return {
      status: stats.error_rate < 0.05 ? 'healthy' : stats.error_rate < 0.1 ? 'degraded' : 'critical',
      details: stats
    };
  }

  private async checkComplianceHealth(tenantId: string): Promise<{ status: string; details: any }> {
    const compliance = await this.complianceService.getTenantComplianceScore(tenantId);
    
    return {
      status: compliance.overall_score > 0.9 ? 'healthy' : compliance.overall_score > 0.7 ? 'degraded' : 'critical',
      details: compliance
    };
  }

  private determineOverallHealth(componentStatuses: string[]): 'healthy' | 'degraded' | 'critical' {
    if (componentStatuses.includes('critical')) return 'critical';
    if (componentStatuses.includes('degraded')) return 'degraded';
    return 'healthy';
  }

  /**
   * Shutdown and cleanup resources
   */
  async shutdown(): Promise<void> {
    try {
      await this.db.close();
      logger.info('Federation Management Service shut down successfully');
    } catch (error) {
      logger.error('Error shutting down Federation Management Service', { error });
      throw error;
    }
  }
}