/**
 * Federation Protocol Types
 * 
 * TypeScript types and Zod schemas for the federation protocol system
 * enabling secure cross-organization collaboration and distributed search.
 * 
 * Part of Work Item 4.2.2 - Federation Protocol Implementation
 */

import { z } from 'zod';

// ===================
// FEDERATION NODE TYPES
// ===================

export const federationNodeSchema = z.object({
  id: z.string().uuid(),
  node_name: z.string().min(1).max(255),
  node_type: z.string().default('mcp_tools'),
  organization_name: z.string().min(1).max(255),
  primary_endpoint: z.string().url(),
  websocket_endpoint: z.string().url().optional(),
  api_version: z.string().default('v1'),
  supported_protocols: z.array(z.string()).default(['http', 'websocket']),
  capabilities: z.object({
    search: z.boolean().default(false),
    syndication: z.boolean().default(false),
    analytics: z.boolean().default(false),
    real_time: z.boolean().default(false),
    bulk_operations: z.boolean().default(false),
    encryption_at_rest: z.boolean().default(false),
    compliance_features: z.array(z.string()).default([]),
    supported_formats: z.array(z.string()).default(['json']),
    max_payload_size_mb: z.number().positive().default(10),
    rate_limits: z.object({
      requests_per_minute: z.number().positive().default(100),
      concurrent_searches: z.number().positive().default(5)
    }).default({})
  }).default({}),
  geographic_region: z.string().optional(),
  data_classification: z.string().default('general'),
  compliance_certifications: z.array(z.string()).default([]),
  trust_score: z.number().min(0).max(100).default(0),
  status: z.enum(['pending', 'active', 'inactive', 'suspended', 'terminated']).default('pending'),
  health_check_interval: z.number().int().positive().default(300),
  last_health_check: z.string().datetime().optional(),
  health_status: z.enum(['healthy', 'degraded', 'unhealthy', 'unknown']).default('unknown'),
  response_time_ms: z.number().int().positive().optional(),
  uptime_percentage: z.number().min(0).max(100).default(0),
  authentication_method: z.string().default('mutual_tls'),
  tls_certificate_fingerprint: z.string().optional(),
  api_key_hash: z.string().optional(),
  public_key: z.string().optional(),
  encryption_algorithm: z.string().default('AES-256-GCM'),
  federation_metadata: z.object({
    version: z.string().default('1.0'),
    features: z.array(z.string()).default([]),
    service_level: z.enum(['basic', 'standard', 'premium']).default('standard'),
    availability_zone: z.string().optional(),
    load_balancer_endpoint: z.string().url().optional(),
    health_check_endpoint: z.string().optional(),
    metrics_endpoint: z.string().optional()
  }).default({}),
  contact_information: z.record(z.string()).default({}),
  tenant_id: z.string().uuid().optional(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  verified_at: z.string().datetime().optional(),
  verified_by: z.string().optional()
});

export type FederationNode = z.infer<typeof federationNodeSchema>;

export const federationProtocolSchema = z.object({
  id: z.string().uuid(),
  node_id: z.string().uuid(),
  protocol_name: z.string().min(1).max(100),
  protocol_version: z.string().min(1).max(20),
  endpoint_url: z.string().url(),
  protocol_config: z.object({
    timeout_ms: z.number().positive().default(30000),
    retry_attempts: z.number().min(0).max(5).default(3),
    compression: z.boolean().default(true),
    keep_alive: z.boolean().default(true),
    tls_version: z.string().default('1.3'),
    cipher_suites: z.array(z.string()).default(['TLS_AES_256_GCM_SHA384'])
  }).default({}),
  supported_operations: z.array(z.string()).default([]),
  rate_limits: z.record(z.number()).default({}),
  security_requirements: z.object({
    mutual_tls: z.boolean().default(true),
    api_key_required: z.boolean().default(true),
    certificate_validation: z.boolean().default(true),
    ip_whitelist: z.array(z.string()).default([]),
    encryption_required: z.boolean().default(true),
    audit_logging: z.boolean().default(true)
  }).default({}),
  is_primary: z.boolean().default(false),
  is_enabled: z.boolean().default(true),
  tenant_id: z.string().uuid().optional(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime()
});

export type FederationProtocol = z.infer<typeof federationProtocolSchema>;

// ===================
// DISTRIBUTED SEARCH TYPES
// ===================

export const crossOrgSearchSchema = z.object({
  id: z.string().uuid(),
  search_session_id: z.string().min(1),
  originating_tenant_id: z.string().uuid(),
  search_query: z.string().min(1),
  search_type: z.string().default('unified'),
  search_scope: z.string().default('federated'),
  target_nodes: z.array(z.string().uuid()).default([]),
  search_filters: z.object({
    content_types: z.array(z.string()).default([]),
    date_range: z.object({
      from: z.string().datetime().optional(),
      to: z.string().datetime().optional()
    }).optional(),
    priority: z.enum(['low', 'medium', 'high']).optional(),
    tags: z.array(z.string()).default([]),
    exclude_archived: z.boolean().default(true),
    language_codes: z.array(z.string()).default([]),
    min_relevance_score: z.number().min(0).max(1).optional()
  }).default({}),
  aggregation_strategy: z.string().default('merge_rank'),
  max_results_per_node: z.number().int().positive().default(50),
  search_timeout_ms: z.number().int().positive().default(10000),
  privacy_level: z.string().default('standard'),
  data_retention_policy: z.string().default('7_days'),
  initiated_by: z.string().min(1),
  initiated_at: z.string().datetime(),
  completed_at: z.string().datetime().optional(),
  status: z.enum(['executing', 'completed', 'failed', 'timeout', 'cancelled']).default('executing'),
  total_results_count: z.number().int().min(0).default(0),
  nodes_contacted: z.number().int().min(0).default(0),
  nodes_responded: z.number().int().min(0).default(0),
  execution_time_ms: z.number().int().positive().optional(),
  error_details: z.object({
    error_code: z.string().optional(),
    error_message: z.string().optional(),
    stack_trace: z.string().optional(),
    context: z.object({
      node_id: z.string().optional(),
      timestamp: z.string().datetime().optional(),
      request_id: z.string().optional()
    }).default({}),
    retry_suggested: z.boolean().default(false)
  }).optional(),
  search_metadata: z.object({
    user_context: z.object({
      user_id: z.string().optional(),
      organization_id: z.string().optional(),
      permissions: z.array(z.string()).default([])
    }).default({}),
    performance: z.object({
      cache_enabled: z.boolean().default(true),
      parallel_execution: z.boolean().default(true),
      timeout_strategy: z.enum(['fail_fast', 'best_effort']).default('best_effort')
    }).default({}),
    compliance: z.object({
      data_classification: z.string().default('general'),
      retention_period_days: z.number().positive().default(30),
      audit_required: z.boolean().default(true)
    }).default({})
  }).default({})
});

export type CrossOrgSearch = z.infer<typeof crossOrgSearchSchema>;

export const searchNodeResponseSchema = z.object({
  id: z.string().uuid(),
  search_id: z.string().uuid(),
  node_id: z.string().uuid(),
  response_status: z.enum(['success', 'error', 'timeout', 'partial']),
  results_count: z.number().int().min(0).default(0),
  response_time_ms: z.number().int().positive().optional(),
  results_data: z.array(z.object({
    id: z.string(),
    title: z.string(),
    content: z.string(),
    source: z.string(),
    relevance_score: z.number().min(0).max(1),
    content_type: z.string(),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime().optional(),
    tags: z.array(z.string()).default([]),
    metadata: z.object({
      author: z.string().optional(),
      language: z.string().optional(),
      word_count: z.number().optional(),
      file_size_bytes: z.number().optional()
    }).default({})
  })).default([]),
  ranking_metadata: z.object({
    algorithm: z.string().default('tf_idf'),
    boost_factors: z.object({
      recency: z.number().default(1.0),
      authority: z.number().default(1.0),
      relevance: z.number().default(1.0)
    }).default({}),
    normalization: z.enum(['min_max', 'z_score', 'none']).default('min_max'),
    query_expansion: z.boolean().default(false)
  }).default({}),
  error_code: z.string().optional(),
  error_message: z.string().optional(),
  partial_results: z.boolean().default(false),
  cache_hit: z.boolean().default(false),
  response_metadata: z.object({
    node_trust_score: z.number().min(0).max(100).default(50),
    protocol_used: z.string().default('http'),
    cache_status: z.enum(['hit', 'miss', 'stale']).optional(),
    processing_time_ms: z.number().positive().optional(),
    error_category: z.string().optional(),
    retry_count: z.number().min(0).default(0)
  }).default({}),
  tenant_id: z.string().uuid().optional(),
  received_at: z.string().datetime()
});

export type SearchNodeResponse = z.infer<typeof searchNodeResponseSchema>;

export const searchResultAggregationSchema = z.object({
  id: z.string().uuid(),
  search_id: z.string().uuid(),
  aggregated_results: z.array(z.object({
    id: z.string(),
    title: z.string(),
    content: z.string(),
    source: z.string(),
    relevance_score: z.number().min(0).max(1),
    content_type: z.string(),
    created_at: z.string().datetime(),
    node_id: z.string(),
    rank: z.number().positive(),
    merged_from_nodes: z.array(z.string()).default([])
  })).default([]),
  result_ranking: z.array(z.object({
    result_id: z.string(),
    rank: z.number().positive(),
    score: z.number().min(0).max(1),
    contributing_nodes: z.array(z.string())
  })).default([]),
  deduplication_stats: z.object({
    total_before_dedup: z.number().min(0),
    total_after_dedup: z.number().min(0),
    duplicates_removed: z.number().min(0),
    dedup_algorithm: z.string()
  }).default({
    total_before_dedup: 0,
    total_after_dedup: 0,
    duplicates_removed: 0,
    dedup_algorithm: 'content_hash'
  }),
  performance_metrics: z.object({
    nodes_with_results: z.number().min(0),
    average_response_time: z.number().min(0),
    fastest_node: z.number().min(0),
    slowest_node: z.number().min(0),
    cache_hit_rate: z.number().min(0).max(1).optional(),
    total_processing_time: z.number().min(0).optional()
  }).default({
    nodes_with_results: 0,
    average_response_time: 0,
    fastest_node: 0,
    slowest_node: 0
  }),
  quality_scores: z.record(z.number()).default({}),
  aggregation_algorithm: z.string().min(1),
  aggregation_time_ms: z.number().int().positive().optional(),
  total_unique_results: z.number().int().min(0).default(0),
  duplicates_removed: z.number().int().min(0).default(0),
  tenant_id: z.string().uuid().optional(),
  created_at: z.string().datetime()
});

export type SearchResultAggregation = z.infer<typeof searchResultAggregationSchema>;

// ===================
// CONTENT SYNDICATION TYPES
// ===================

export const contentSyndicationRuleSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  rule_name: z.string().min(1).max(255),
  rule_type: z.string().min(1),
  content_types: z.array(z.string()).default([]),
  sharing_scope: z.string().default('selective'),
  target_organizations: z.array(z.string().uuid()).default([]),
  content_filters: z.record(z.any()).default({}),
  permission_level: z.string().default('read'),
  sync_frequency: z.string().default('real_time'),
  data_classification: z.string().default('public'),
  retention_period_days: z.number().int().positive().default(365),
  encryption_required: z.boolean().default(true),
  audit_trail_required: z.boolean().default(true),
  approval_workflow: z.string().default('automatic'),
  compliance_tags: z.array(z.string()).default([]),
  is_active: z.boolean().default(true),
  created_by: z.string().min(1),
  approved_by: z.string().optional(),
  approved_at: z.string().datetime().optional(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime()
});

export type ContentSyndicationRule = z.infer<typeof contentSyndicationRuleSchema>;

export const syndicatedContentSchema = z.object({
  id: z.string().uuid(),
  source_tenant_id: z.string().uuid(),
  source_content_id: z.string().min(1),
  source_content_type: z.string().min(1),
  syndication_rule_id: z.string().uuid(),
  content_hash: z.string().min(1),
  content_summary: z.string().optional(),
  content_metadata: z.record(z.any()).default({}),
  sharing_permissions: z.record(z.any()).default({}),
  target_nodes: z.array(z.string().uuid()).default([]),
  sync_status: z.enum(['pending', 'syncing', 'synced', 'failed', 'expired']).default('pending'),
  last_sync_attempt: z.string().datetime().optional(),
  last_successful_sync: z.string().datetime().optional(),
  sync_error_count: z.number().int().min(0).default(0),
  last_sync_error: z.string().optional(),
  version_number: z.number().int().positive().default(1),
  change_detection_hash: z.string().optional(),
  expires_at: z.string().datetime().optional(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime()
});

export type SyndicatedContent = z.infer<typeof syndicatedContentSchema>;

// ===================
// SECURITY AND COMPLIANCE TYPES
// ===================

export const federationCertificateSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  certificate_type: z.string().min(1),
  certificate_name: z.string().min(1).max(255),
  certificate_pem: z.string().min(1),
  private_key_pem: z.string().optional(),
  certificate_chain_pem: z.string().optional(),
  fingerprint_sha256: z.string().min(1),
  issuer_dn: z.string().min(1),
  subject_dn: z.string().min(1),
  subject_alt_names: z.array(z.string()).default([]),
  valid_from: z.string().datetime(),
  valid_until: z.string().datetime(),
  key_algorithm: z.string().min(1),
  key_size: z.number().int().positive(),
  signature_algorithm: z.string().min(1),
  is_ca_certificate: z.boolean().default(false),
  certificate_purpose: z.array(z.string()).default([]),
  revocation_status: z.enum(['valid', 'revoked', 'expired']).default('valid'),
  revoked_at: z.string().datetime().optional(),
  revocation_reason: z.string().optional(),
  auto_renewal_enabled: z.boolean().default(true),
  renewal_threshold_days: z.number().int().positive().default(30),
  last_validation_check: z.string().datetime().optional(),
  validation_status: z.enum(['valid', 'invalid', 'expired', 'revoked']).default('valid'),
  created_by: z.string().min(1),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime()
});

export type FederationCertificate = z.infer<typeof federationCertificateSchema>;

export const federationCompliancePolicySchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  policy_name: z.string().min(1).max(255),
  policy_type: z.string().min(1),
  regulatory_framework: z.string().min(1),
  jurisdiction: z.string().min(1),
  data_categories: z.array(z.string()).default([]),
  processing_restrictions: z.record(z.any()).default({}),
  retention_requirements: z.record(z.any()).default({}),
  consent_requirements: z.record(z.any()).default({}),
  cross_border_restrictions: z.record(z.any()).default({}),
  audit_requirements: z.record(z.any()).default({}),
  violation_penalties: z.record(z.any()).default({}),
  enforcement_level: z.enum(['strict', 'moderate', 'advisory']).default('strict'),
  is_active: z.boolean().default(true),
  effective_date: z.string().datetime(),
  expiry_date: z.string().datetime().optional(),
  created_by: z.string().min(1),
  approved_by: z.string().optional(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime()
});

export type FederationCompliancePolicy = z.infer<typeof federationCompliancePolicySchema>;

export const dataSovereigntyControlSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  data_category: z.string().min(1),
  geographic_restrictions: z.record(z.any()).default({}),
  allowed_jurisdictions: z.array(z.string()).default([]),
  blocked_jurisdictions: z.array(z.string()).default([]),
  transit_restrictions: z.record(z.any()).default({}),
  storage_requirements: z.record(z.any()).default({}),
  encryption_requirements: z.record(z.any()).default({}),
  access_control_requirements: z.record(z.any()).default({}),
  audit_trail_requirements: z.record(z.any()).default({}),
  breach_notification_rules: z.record(z.any()).default({}),
  data_residency_proof: z.record(z.any()).default({}),
  compliance_certifications_required: z.array(z.string()).default([]),
  is_enforced: z.boolean().default(true),
  violation_action: z.enum(['block', 'warn', 'log', 'encrypt']).default('block'),
  created_by: z.string().min(1),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime()
});

export type DataSovereigntyControl = z.infer<typeof dataSovereigntyControlSchema>;

// ===================
// PERFORMANCE MONITORING TYPES
// ===================

export const federationPerformanceMetricSchema = z.object({
  id: z.string().uuid(),
  node_id: z.string().uuid(),
  metric_type: z.string().min(1),
  metric_name: z.string().min(1),
  metric_value: z.number(),
  metric_unit: z.string().min(1),
  measurement_window_start: z.string().datetime(),
  measurement_window_end: z.string().datetime(),
  aggregation_method: z.string().default('average'),
  sample_count: z.number().int().positive().default(1),
  percentile_data: z.record(z.number()).default({}),
  threshold_breached: z.boolean().default(false),
  alert_triggered: z.boolean().default(false),
  metadata: z.record(z.any()).default({}),
  tenant_id: z.string().uuid().optional(),
  recorded_at: z.string().datetime()
});

export type FederationPerformanceMetric = z.infer<typeof federationPerformanceMetricSchema>;

export const federationCircuitBreakerSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  target_node_id: z.string().uuid(),
  circuit_name: z.string().min(1).max(255),
  operation_type: z.string().min(1),
  current_state: z.enum(['closed', 'open', 'half_open']).default('closed'),
  failure_count: z.number().int().min(0).default(0),
  success_count: z.number().int().min(0).default(0),
  failure_threshold: z.number().int().positive().default(5),
  success_threshold: z.number().int().positive().default(3),
  timeout_ms: z.number().int().positive().default(5000),
  recovery_timeout_ms: z.number().int().positive().default(60000),
  last_failure_at: z.string().datetime().optional(),
  last_success_at: z.string().datetime().optional(),
  opened_at: z.string().datetime().optional(),
  half_open_at: z.string().datetime().optional(),
  next_attempt_at: z.string().datetime().optional(),
  consecutive_failures: z.number().int().min(0).default(0),
  consecutive_successes: z.number().int().min(0).default(0),
  configuration: z.record(z.any()).default({}),
  last_state_change_at: z.string().datetime(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime()
});

export type FederationCircuitBreaker = z.infer<typeof federationCircuitBreakerSchema>;

// ===================
// REQUEST/RESPONSE TYPES
// ===================

export const federationSearchRequestSchema = z.object({
  query: z.string().min(1),
  search_type: z.string().default('unified'),
  filters: z.record(z.any()).default({}),
  max_results: z.number().int().positive().default(50),
  timeout_ms: z.number().int().positive().default(10000),
  target_nodes: z.array(z.string().uuid()).optional(),
  privacy_level: z.string().default('standard'),
  aggregation_strategy: z.string().default('merge_rank')
});

export type FederationSearchRequest = z.infer<typeof federationSearchRequestSchema>;

export const federationSearchResponseSchema = z.object({
  search_id: z.string().uuid(),
  status: z.enum(['executing', 'completed', 'failed', 'timeout']),
  total_results: z.number().int().min(0),
  results: z.array(z.any()),
  execution_time_ms: z.number().int().positive(),
  nodes_contacted: z.number().int().min(0),
  nodes_responded: z.number().int().min(0),
  aggregation_metadata: z.record(z.any()).default({}),
  errors: z.array(z.object({
    node_id: z.string().uuid(),
    error_code: z.string(),
    error_message: z.string()
  })).default([])
});

export type FederationSearchResponse = z.infer<typeof federationSearchResponseSchema>;

export const nodeRegistrationRequestSchema = z.object({
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

export type NodeRegistrationRequest = z.infer<typeof nodeRegistrationRequestSchema>;

// ===================
// VALIDATION FUNCTIONS
// ===================

export const validateFederationNode = (data: unknown): FederationNode => {
  return federationNodeSchema.parse(data);
};

export const validateCrossOrgSearch = (data: unknown): CrossOrgSearch => {
  return crossOrgSearchSchema.parse(data);
};

export const validateContentSyndicationRule = (data: unknown): ContentSyndicationRule => {
  return contentSyndicationRuleSchema.parse(data);
};

export const validateFederationSearchRequest = (data: unknown): FederationSearchRequest => {
  return federationSearchRequestSchema.parse(data);
};

export const validateNodeRegistrationRequest = (data: unknown): NodeRegistrationRequest => {
  return nodeRegistrationRequestSchema.parse(data);
};

export const validateSyndicatedContent = (data: unknown): SyndicatedContent => {
  return syndicatedContentSchema.parse(data);
};

export const validateFederationCertificate = (data: unknown): FederationCertificate => {
  return federationCertificateSchema.parse(data);
};

export const validateFederationCompliancePolicy = (data: unknown): FederationCompliancePolicy => {
  return federationCompliancePolicySchema.parse(data);
};

export const validateDataSovereigntyControl = (data: unknown): DataSovereigntyControl => {
  return dataSovereigntyControlSchema.parse(data);
};

export const validateFederationPerformanceMetric = (data: unknown): FederationPerformanceMetric => {
  return federationPerformanceMetricSchema.parse(data);
};

export const validateFederationCircuitBreaker = (data: unknown): FederationCircuitBreaker => {
  return federationCircuitBreakerSchema.parse(data);
};