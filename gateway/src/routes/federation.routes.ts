/**
 * Federation Routes
 * 
 * API endpoints for federation protocol operations including
 * node management, distributed search, and content syndication.
 * 
 * Part of Work Item 4.2.2 - Federation Protocol Implementation
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { logger } from '../utils/logger.js';
import { 
  FederationProtocolService,
  FederationNodeRegistry,
  DistributedSearchOrchestrator,
  ContentSyndicationService,
  FederationSecurityManager,
  FederationComplianceService,
  FederationManagementService
} from '@mcp-tools/core';

const router = Router();

// Initialize federation services
const federationService = new FederationProtocolService();
const nodeRegistry = federationService.getNodeRegistry();
const searchOrchestrator = federationService.getSearchOrchestrator();
const contentSyndication = federationService.getContentSyndication();
const securityManager = federationService.getSecurityManager();
const complianceService = federationService.getComplianceService();

// Validation schemas
const federationSearchSchema = z.object({
  query: z.string().min(1).max(500),
  search_type: z.string().default('unified'),
  filters: z.record(z.any()).default({}),
  max_results: z.number().int().min(1).max(100).default(50),
  timeout_ms: z.number().int().min(1000).max(60000).default(10000),
  target_nodes: z.array(z.string().uuid()).optional(),
  privacy_level: z.enum(['standard', 'restricted', 'confidential']).default('standard'),
  aggregation_strategy: z.enum(['merge_rank', 'trust_weighted', 'recency_boost']).default('merge_rank')
});

const nodeRegistrationSchema = z.object({
  node_name: z.string().min(1).max(255),
  organization_name: z.string().min(1).max(255),
  primary_endpoint: z.string().url(),
  websocket_endpoint: z.string().url().optional(),
  supported_protocols: z.array(z.string()).default(['http']),
  capabilities: z.record(z.any()).default({}),
  geographic_region: z.string().optional(),
  compliance_certifications: z.array(z.string()).default([]),
  contact_information: z.record(z.string()).default({}),
  public_key: z.string().optional(),
  certificate_fingerprint: z.string().optional()
});

const contentSyndicationSchema = z.object({
  content_id: z.string().min(1),
  content_type: z.string().min(1),
  content_data: z.any(),
  metadata: z.record(z.any()).default({})
});

const syndicationRuleSchema = z.object({
  rule_name: z.string().min(1).max(255),
  rule_type: z.string().min(1),
  content_types: z.array(z.string()).min(1),
  sharing_scope: z.enum(['selective', 'public', 'private']).default('selective'),
  target_organizations: z.array(z.string().uuid()).default([]),
  content_filters: z.record(z.any()).default({}),
  permission_level: z.enum(['read', 'write', 'admin']).default('read'),
  sync_frequency: z.enum(['real_time', 'hourly', 'daily', 'weekly']).default('real_time'),
  data_classification: z.enum(['public', 'internal', 'confidential', 'restricted']).default('public'),
  retention_period_days: z.number().int().min(1).max(3650).default(365),
  encryption_required: z.boolean().default(true),
  audit_trail_required: z.boolean().default(true),
  approval_workflow: z.enum(['automatic', 'manual', 'delegated']).default('automatic'),
  compliance_tags: z.array(z.string()).default([])
});

// ===================
// FEDERATION MANAGEMENT
// ===================

/**
 * Initialize federation for tenant
 */
router.post('/initialize', async (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId || req.headers['x-tenant-id'] as string;
    const userId = req.user?.id || 'system';

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: 'Tenant ID is required'
      });
    }

    const initConfig = z.object({
      enable_discovery: z.boolean().default(false),
      discoverable_name: z.string().optional(),
      geographic_region: z.string().optional(),
      data_classification: z.enum(['public', 'internal', 'confidential', 'restricted']).default('internal'),
      compliance_requirements: z.array(z.string()).default([]),
      security_level: z.enum(['basic', 'enhanced', 'maximum']).default('enhanced')
    }).parse(req.body);

    const federationStatus = await federationService.initializeFederation(
      tenantId,
      initConfig,
      userId
    );

    logger.info(`Federation initialized for tenant: ${tenantId}`);

    res.json({
      success: true,
      data: federationStatus
    });

  } catch (error: any) {
    logger.error('Failed to initialize federation:', error);
    res.status(500).json({
      success: false,
      error: (error instanceof Error ? error.message : String(error)) || 'Failed to initialize federation'
    });
  }
});

/**
 * Get federation status
 */
router.get('/status', async (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId || req.headers['x-tenant-id'] as string;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: 'Tenant ID is required'
      });
    }

    const status = await federationService.getFederationStatus(tenantId);

    res.json({
      success: true,
      data: status
    });

  } catch (error: any) {
    logger.error('Failed to get federation status:', error);
    res.status(500).json({
      success: false,
      error: (error instanceof Error ? error.message : String(error)) || 'Failed to get federation status'
    });
  }
});

/**
 * Get federation metrics
 */
router.get('/metrics', async (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId || req.headers['x-tenant-id'] as string;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: 'Tenant ID is required'
      });
    }

    const metrics = await federationService.getFederationMetrics(tenantId);

    res.json({
      success: true,
      data: metrics
    });

  } catch (error: any) {
    logger.error('Failed to get federation metrics:', error);
    res.status(500).json({
      success: false,
      error: (error instanceof Error ? error.message : String(error)) || 'Failed to get federation metrics'
    });
  }
});

// ===================
// NODE MANAGEMENT
// ===================

/**
 * Register federation node
 */
router.post('/nodes/register', async (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId || req.headers['x-tenant-id'] as string;
    const userId = req.user?.id || 'system';

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: 'Tenant ID is required'
      });
    }

    const registrationRequest = nodeRegistrationSchema.parse(req.body);

    const federationNode = await federationService.registerExternalNode(
      tenantId,
      registrationRequest,
      userId
    );

    logger.info(`Federation node registered: ${federationNode.id}`);

    res.status(201).json({
      success: true,
      data: federationNode
    });

  } catch (error: any) {
    logger.error('Failed to register federation node:', error);
    res.status(500).json({
      success: false,
      error: (error instanceof Error ? error.message : String(error)) || 'Failed to register federation node'
    });
  }
});

/**
 * Discover available nodes
 */
router.get('/nodes/discover', async (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId || req.headers['x-tenant-id'] as string;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: 'Tenant ID is required'
      });
    }

    const discoverOptions = z.object({
      geographic_region: z.string().optional(),
      capabilities: z.array(z.string()).optional(),
      data_classification: z.string().optional(),
      compliance_requirements: z.array(z.string()).optional(),
      trust_score_min: z.number().min(0).max(100).optional(),
      status: z.array(z.string()).optional(),
      limit: z.number().int().min(1).max(100).default(20),
      offset: z.number().int().min(0).default(0)
    }).parse(req.query);

    const discoveredNodes = await nodeRegistry.discoverNodes(tenantId, discoverOptions);

    res.json({
      success: true,
      data: {
        nodes: discoveredNodes,
        total: discoveredNodes.length
      }
    });

  } catch (error: any) {
    logger.error('Failed to discover nodes:', error);
    res.status(500).json({
      success: false,
      error: (error instanceof Error ? error.message : String(error)) || 'Failed to discover nodes'
    });
  }
});

/**
 * Get node details
 */
router.get('/nodes/:nodeId', async (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId || req.headers['x-tenant-id'] as string;
    const { nodeId } = req.params;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: 'Tenant ID is required'
      });
    }

    const nodeDetails = await nodeRegistry.getNodeDetails(nodeId, tenantId);

    if (!nodeDetails) {
      return res.status(404).json({
        success: false,
        error: 'Node not found'
      });
    }

    res.json({
      success: true,
      data: nodeDetails
    });

  } catch (error: any) {
    logger.error('Failed to get node details:', error);
    res.status(500).json({
      success: false,
      error: (error instanceof Error ? error.message : String(error)) || 'Failed to get node details'
    });
  }
});

// ===================
// DISTRIBUTED SEARCH
// ===================

/**
 * Execute federated search
 */
router.post('/search', async (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId || req.headers['x-tenant-id'] as string;
    const userId = req.user?.id || 'anonymous';

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: 'Tenant ID is required'
      });
    }

    const searchRequest = federationSearchSchema.parse(req.body);

    const searchResponse = await federationService.executeSearch(
      tenantId,
      searchRequest,
      userId
    );

    logger.info(`Federation search executed: ${searchResponse.search_id}`);

    res.json({
      success: true,
      data: searchResponse
    });

  } catch (error: any) {
    logger.error('Failed to execute federation search:', error);
    res.status(500).json({
      success: false,
      error: (error instanceof Error ? error.message : String(error)) || 'Failed to execute federation search'
    });
  }
});

/**
 * Get search history
 */
router.get('/search/history', async (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId || req.headers['x-tenant-id'] as string;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: 'Tenant ID is required'
      });
    }

    const paginationOptions = z.object({
      limit: z.number().int().min(1).max(100).default(20),
      offset: z.number().int().min(0).default(0)
    }).parse(req.query);

    const searchHistory = await searchOrchestrator.getSearchHistory(
      tenantId,
      paginationOptions.limit,
      paginationOptions.offset
    );

    res.json({
      success: true,
      data: {
        searches: searchHistory,
        total: searchHistory.length
      }
    });

  } catch (error: any) {
    logger.error('Failed to get search history:', error);
    res.status(500).json({
      success: false,
      error: (error instanceof Error ? error.message : String(error)) || 'Failed to get search history'
    });
  }
});

/**
 * Get search details
 */
router.get('/search/:searchId', async (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId || req.headers['x-tenant-id'] as string;
    const { searchId } = req.params;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: 'Tenant ID is required'
      });
    }

    const searchDetails = await searchOrchestrator.getSearchDetails(searchId, tenantId);

    res.json({
      success: true,
      data: searchDetails
    });

  } catch (error: any) {
    logger.error('Failed to get search details:', error);
    res.status(500).json({
      success: false,
      error: (error instanceof Error ? error.message : String(error)) || 'Failed to get search details'
    });
  }
});

/**
 * Cancel search
 */
router.post('/search/:searchId/cancel', async (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId || req.headers['x-tenant-id'] as string;
    const userId = req.user?.id || 'system';
    const { searchId } = req.params;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: 'Tenant ID is required'
      });
    }

    await searchOrchestrator.cancelSearch(searchId, tenantId, userId);

    res.json({
      success: true,
      message: 'Search cancelled successfully'
    });

  } catch (error: any) {
    logger.error('Failed to cancel search:', error);
    res.status(500).json({
      success: false,
      error: (error instanceof Error ? error.message : String(error)) || 'Failed to cancel search'
    });
  }
});

// ===================
// CONTENT SYNDICATION
// ===================

/**
 * Create syndication rule
 */
router.post('/syndication/rules', async (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId || req.headers['x-tenant-id'] as string;
    const userId = req.user?.id || 'system';

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: 'Tenant ID is required'
      });
    }

    const ruleConfig = syndicationRuleSchema.parse(req.body);

    const syndicationRule = await contentSyndication.createSyndicationRule(
      tenantId,
      ruleConfig,
      userId
    );

    logger.info(`Syndication rule created: ${syndicationRule.id}`);

    res.status(201).json({
      success: true,
      data: syndicationRule
    });

  } catch (error: any) {
    logger.error('Failed to create syndication rule:', error);
    res.status(500).json({
      success: false,
      error: (error instanceof Error ? error.message : String(error)) || 'Failed to create syndication rule'
    });
  }
});

/**
 * Syndicate content
 */
router.post('/syndication/content', async (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId || req.headers['x-tenant-id'] as string;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: 'Tenant ID is required'
      });
    }

    const syndicationRequest = contentSyndicationSchema.parse(req.body);

    await federationService.syndicateContent(
      tenantId,
      syndicationRequest.content_id,
      syndicationRequest.content_type,
      syndicationRequest.content_data,
      syndicationRequest.metadata
    );

    res.json({
      success: true,
      message: 'Content syndicated successfully'
    });

  } catch (error: any) {
    logger.error('Failed to syndicate content:', error);
    res.status(500).json({
      success: false,
      error: (error instanceof Error ? error.message : String(error)) || 'Failed to syndicate content'
    });
  }
});

/**
 * Get syndicated content
 */
router.get('/syndication/content', async (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId || req.headers['x-tenant-id'] as string;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: 'Tenant ID is required'
      });
    }

    const paginationOptions = z.object({
      limit: z.number().int().min(1).max(100).default(20),
      offset: z.number().int().min(0).default(0)
    }).parse(req.query);

    const syndicatedContent = await contentSyndication.getSyndicatedContent(
      tenantId,
      paginationOptions.limit,
      paginationOptions.offset
    );

    res.json({
      success: true,
      data: {
        content: syndicatedContent,
        total: syndicatedContent.length
      }
    });

  } catch (error: any) {
    logger.error('Failed to get syndicated content:', error);
    res.status(500).json({
      success: false,
      error: (error instanceof Error ? error.message : String(error)) || 'Failed to get syndicated content'
    });
  }
});

/**
 * Get syndication statistics
 */
router.get('/syndication/statistics', async (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId || req.headers['x-tenant-id'] as string;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: 'Tenant ID is required'
      });
    }

    const statistics = await contentSyndication.getSyndicationStatistics(tenantId);

    res.json({
      success: true,
      data: statistics
    });

  } catch (error: any) {
    logger.error('Failed to get syndication statistics:', error);
    res.status(500).json({
      success: false,
      error: (error instanceof Error ? error.message : String(error)) || 'Failed to get syndication statistics'
    });
  }
});

// ===================
// SECURITY MANAGEMENT
// ===================

/**
 * Generate federation certificate
 */
router.post('/security/certificates', async (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId || req.headers['x-tenant-id'] as string;
    const userId = req.user?.id || 'system';

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: 'Tenant ID is required'
      });
    }

    const certRequest = z.object({
      certificate_name: z.string().min(1).max(255),
      subject_dn: z.string().min(1),
      subject_alt_names: z.array(z.string()).default([]),
      validity_days: z.number().int().min(1).max(3650).default(365)
    }).parse(req.body);

    const certificate = await securityManager.generateFederationCertificate(
      tenantId,
      certRequest.certificate_name,
      certRequest.subject_dn,
      certRequest.subject_alt_names,
      certRequest.validity_days,
      userId
    );

    res.status(201).json({
      success: true,
      data: certificate
    });

  } catch (error: any) {
    logger.error('Failed to generate federation certificate:', error);
    res.status(500).json({
      success: false,
      error: (error instanceof Error ? error.message : String(error)) || 'Failed to generate federation certificate'
    });
  }
});

/**
 * Get security metrics
 */
router.get('/security/metrics', async (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId || req.headers['x-tenant-id'] as string;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: 'Tenant ID is required'
      });
    }

    const securityMetrics = await securityManager.getSecurityMetrics(tenantId);

    res.json({
      success: true,
      data: securityMetrics
    });

  } catch (error: any) {
    logger.error('Failed to get security metrics:', error);
    res.status(500).json({
      success: false,
      error: (error instanceof Error ? error.message : String(error)) || 'Failed to get security metrics'
    });
  }
});

// ===================
// COMPLIANCE MANAGEMENT
// ===================

/**
 * Generate compliance audit trail
 */
router.post('/compliance/audit-trail', async (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId || req.headers['x-tenant-id'] as string;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: 'Tenant ID is required'
      });
    }

    const auditRequest = z.object({
      start_date: z.string().datetime(),
      end_date: z.string().datetime(),
      activity_types: z.array(z.string()).optional(),
      data_categories: z.array(z.string()).optional(),
      jurisdictions: z.array(z.string()).optional(),
      include_cross_tenant: z.boolean().default(true)
    }).parse(req.body);

    const auditTrail = await complianceService.generateAuditTrail(tenantId, auditRequest);

    res.json({
      success: true,
      data: auditTrail
    });

  } catch (error: any) {
    logger.error('Failed to generate audit trail:', error);
    res.status(500).json({
      success: false,
      error: (error instanceof Error ? error.message : String(error)) || 'Failed to generate audit trail'
    });
  }
});

/**
 * Generate compliance report
 */
router.post('/compliance/reports', async (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId || req.headers['x-tenant-id'] as string;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: 'Tenant ID is required'
      });
    }

    const reportRequest = z.object({
      report_type: z.enum(['gdpr', 'ccpa', 'custom']),
      start_date: z.string().datetime(),
      end_date: z.string().datetime()
    }).parse(req.body);

    const complianceReport = await complianceService.generateComplianceReport(
      tenantId,
      reportRequest.report_type,
      {
        start: reportRequest.start_date,
        end: reportRequest.end_date
      }
    );

    res.json({
      success: true,
      data: complianceReport
    });

  } catch (error: any) {
    logger.error('Failed to generate compliance report:', error);
    res.status(500).json({
      success: false,
      error: (error instanceof Error ? error.message : String(error)) || 'Failed to generate compliance report'
    });
  }
});

// ===================
// WEBHOOK ENDPOINT (for receiving federation events)
// ===================

/**
 * Receive federation webhook
 */
router.post('/webhook', async (req: Request, res: Response) => {
  try {
    const signature = req.headers['x-federation-signature'] as string;
    const nodeId = req.headers['x-federation-node'] as string;
    
    // Validate webhook signature (simplified - would use proper HMAC validation)
    if (!signature || !nodeId) {
      return res.status(401).json({
        success: false,
        error: 'Invalid webhook signature or missing node ID'
      });
    }

    const webhookData = req.body;
    
    // Process webhook based on type
    switch (webhookData.type) {
      case 'content_sync':
        // Handle content synchronization webhook
        logger.info(`Received content sync webhook from node: ${nodeId}`);
        break;
      case 'node_health':
        // Handle node health status webhook
        logger.info(`Received health status webhook from node: ${nodeId}`);
        break;
      case 'search_request':
        // Handle incoming search request webhook
        logger.info(`Received search request webhook from node: ${nodeId}`);
        break;
      default:
        logger.warn(`Unknown webhook type: ${webhookData.type}`);
    }

    res.json({
      success: true,
      message: 'Webhook processed successfully'
    });

  } catch (error: any) {
    logger.error('Failed to process federation webhook:', error);
    res.status(500).json({
      success: false,
      error: (error instanceof Error ? error.message : String(error)) || 'Failed to process webhook'
    });
  }
});

// Initialize federation management service
const managementService = new FederationManagementService({
  enableDashboard: true,
  enableRealTimeMetrics: true,
  enableAutomaticFailover: true,
  maxConcurrentSearches: 50
});

// ===================
// MANAGEMENT & MONITORING ENDPOINTS
// ===================

/**
 * Get federation dashboard metrics
 */
router.get('/dashboard', async (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId || req.headers['x-tenant-id'] as string;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: 'Tenant ID is required'
      });
    }

    const metrics = await managementService.getDashboardMetrics(tenantId);

    res.json({
      success: true,
      data: metrics
    });

  } catch (error: any) {
    logger.error('Failed to get dashboard metrics:', error);
    res.status(500).json({
      success: false,
      error: (error instanceof Error ? error.message : String(error)) || 'Failed to get dashboard metrics'
    });
  }
});

/**
 * Get federation health status
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId || req.headers['x-tenant-id'] as string;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: 'Tenant ID is required'
      });
    }

    const health = await managementService.getFederationHealthStatus(tenantId);

    res.json({
      success: true,
      data: health
    });

  } catch (error: any) {
    logger.error('Failed to get federation health:', error);
    res.status(500).json({
      success: false,
      error: (error instanceof Error ? error.message : String(error)) || 'Failed to get federation health'
    });
  }
});

/**
 * Get all nodes with performance metrics
 */
router.get('/nodes/summary', async (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId || req.headers['x-tenant-id'] as string;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: 'Tenant ID is required'
      });
    }

    const nodes = await managementService.getAllNodes(tenantId);

    res.json({
      success: true,
      data: nodes
    });

  } catch (error: any) {
    logger.error('Failed to get node summaries:', error);
    res.status(500).json({
      success: false,
      error: (error instanceof Error ? error.message : String(error)) || 'Failed to get node summaries'
    });
  }
});

/**
 * Enhanced search with comprehensive monitoring
 */
router.post('/search/managed', async (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId || req.headers['x-tenant-id'] as string;
    const userId = req.user?.id || req.headers['x-user-id'] as string;

    if (!tenantId || !userId) {
      return res.status(400).json({
        success: false,
        error: 'Tenant ID and User ID are required'
      });
    }

    const searchRequest = federationSearchSchema.parse(req.body);

    const result = await managementService.executeFederationSearch(
      tenantId,
      searchRequest,
      userId
    );

    res.json({
      success: true,
      data: result
    });

  } catch (error: any) {
    logger.error('Failed to execute managed federation search:', error);
    res.status(500).json({
      success: false,
      error: (error instanceof Error ? error.message : String(error)) || 'Failed to execute search'
    });
  }
});

export { router as federationRoutes };