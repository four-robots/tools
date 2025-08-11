/**
 * Multi-tenant Search Infrastructure Types
 * 
 * Comprehensive type definitions for multi-tenant architecture including:
 * - Tenant management and hierarchy
 * - User management within tenants  
 * - Cross-tenant federation
 * - Resource quotas and monitoring
 * - Audit trails and compliance
 * 
 * Part of Work Item 4.2.1 - Multi-tenant Search Infrastructure
 */

import { z } from 'zod';

// ===================
// TENANT CORE TYPES
// ===================

export const TenantStatusSchema = z.enum(['active', 'suspended', 'deleted', 'provisioning']);
export type TenantStatus = z.infer<typeof TenantStatusSchema>;

export const TenantTierSchema = z.enum(['basic', 'standard', 'premium', 'enterprise']);
export type TenantTier = z.infer<typeof TenantTierSchema>;

export const TenantSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255).regex(/^[a-zA-Z0-9\s\-_.()]+$/, 'Invalid characters in tenant name'),
  slug: z.string().min(3).max(63).regex(/^[a-z0-9]([a-z0-9\-]*[a-z0-9])?$/, 'Slug must be 3-63 chars, start/end with alphanumeric, contain only lowercase letters, numbers, and hyphens'),
  display_name: z.string().min(1).max(255).regex(/^[a-zA-Z0-9\s\-_.()]+$/, 'Invalid characters in display name'),
  description: z.string().optional(),
  status: TenantStatusSchema.default('active'),
  tier: TenantTierSchema.default('standard'),
  parent_tenant_id: z.string().uuid().optional(),
  root_tenant_id: z.string().uuid().optional(),
  tenant_path: z.string().default(''),
  depth_level: z.number().int().min(0).default(0),
  is_organization: z.boolean().default(true),
  max_users: z.number().int().positive().optional(),
  max_storage_gb: z.number().int().positive().optional(),
  max_api_calls_per_day: z.number().int().positive().optional(),
  federation_enabled: z.boolean().default(false),
  public_discovery: z.boolean().default(false),
  encryption_key_id: z.string().optional(),
  data_region: z.string().regex(/^[a-z0-9-]+$/, 'Invalid data region format').default('us-east-1'),
  compliance_requirements: z.array(z.string()).default([]),
  branding_config: z.record(z.any()).default({}),
  feature_flags: z.record(z.boolean()).default({}),
  metadata: z.record(z.any()).default({}),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  suspended_at: z.string().datetime().optional(),
  deleted_at: z.string().datetime().optional(),
  created_by: z.string().optional()
});

export type Tenant = z.infer<typeof TenantSchema>;

export const CreateTenantRequestSchema = z.object({
  name: z.string().min(1).max(255).regex(/^[a-zA-Z0-9\s\-_.()]+$/, 'Invalid characters in tenant name'),
  slug: z.string().min(3).max(63).regex(/^[a-z0-9]([a-z0-9\-]*[a-z0-9])?$/, 'Slug must be 3-63 chars, start/end with alphanumeric, contain only lowercase letters, numbers, and hyphens'),
  displayName: z.string().min(1).max(255).regex(/^[a-zA-Z0-9\s\-_.()]+$/, 'Invalid characters in display name').optional(),
  description: z.string().optional(),
  parentTenantId: z.string().uuid().optional(),
  isOrganization: z.boolean().default(true),
  tier: TenantTierSchema.default('standard'),
  maxUsers: z.number().int().positive().optional(),
  maxStorageGb: z.number().int().positive().optional(),
  maxApiCallsPerDay: z.number().int().positive().optional(),
  federationEnabled: z.boolean().default(false),
  publicDiscovery: z.boolean().default(false),
  dataRegion: z.string().default('us-east-1'),
  complianceRequirements: z.array(z.string()).default([]),
  brandingConfig: z.record(z.any()).default({}),
  featureFlags: z.record(z.boolean()).default({}),
  metadata: z.record(z.any()).default({}),
  discoveryTags: z.array(z.string()).default([])
});

export type CreateTenantRequest = z.infer<typeof CreateTenantRequestSchema>;

export const UpdateTenantRequestSchema = CreateTenantRequestSchema.partial().omit(['name', 'slug']);
export type UpdateTenantRequest = z.infer<typeof UpdateTenantRequestSchema>;

// ===================
// TENANT USER TYPES
// ===================

export const TenantUserRoleSchema = z.enum(['owner', 'admin', 'editor', 'viewer', 'guest']);
export type TenantUserRole = z.infer<typeof TenantUserRoleSchema>;

export const TenantUserStatusSchema = z.enum(['active', 'suspended', 'pending', 'inactive']);
export type TenantUserStatus = z.infer<typeof TenantUserStatusSchema>;

export const TenantUserSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  user_id: z.string().min(1).max(255).regex(/^[a-zA-Z0-9\-_@.]{1,255}$/, 'Invalid user ID format'),
  email: z.string().email().max(320).toLowerCase(),
  role: TenantUserRoleSchema.default('viewer'),
  permissions: z.array(z.string()).default([]),
  status: TenantUserStatusSchema.default('active'),
  joined_at: z.string().datetime(),
  last_active_at: z.string().datetime().optional(),
  invited_by: z.string().optional(),
  invitation_accepted_at: z.string().datetime().optional(),
  suspended_at: z.string().datetime().optional(),
  suspended_by: z.string().optional(),
  suspension_reason: z.string().optional(),
  metadata: z.record(z.any()).default({}),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime()
});

export type TenantUser = z.infer<typeof TenantUserSchema>;

export const TenantUserInvitationSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  email: z.string().email(),
  role: TenantUserRoleSchema,
  invited_by: z.string(),
  invitation_token: z.string(),
  expires_at: z.string().datetime(),
  accepted_at: z.string().datetime().optional(),
  status: z.enum(['pending', 'accepted', 'expired', 'cancelled']).default('pending'),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime()
});

export type TenantUserInvitation = z.infer<typeof TenantUserInvitationSchema>;

// ===================
// CONFIGURATION TYPES
// ===================

export const TenantConfigurationTypeSchema = z.enum(['system', 'user', 'billing', 'security']);
export type TenantConfigurationType = z.infer<typeof TenantConfigurationTypeSchema>;

export const TenantConfigurationSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  config_category: z.string().min(1).max(100),
  config_key: z.string().min(1).max(255),
  config_value: z.any(),
  config_type: TenantConfigurationTypeSchema.default('user'),
  is_encrypted: z.boolean().default(false),
  is_inheritable: z.boolean().default(true),
  validation_schema: z.record(z.any()).optional(),
  description: z.string().optional(),
  created_by: z.string().optional(),
  updated_by: z.string().optional(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime()
});

export type TenantConfiguration = z.infer<typeof TenantConfigurationSchema>;

// ===================
// FEDERATION TYPES
// ===================

export const CrossTenantPermissionTypeSchema = z.enum(['search', 'collaboration', 'data_sharing', 'federation']);
export type CrossTenantPermissionType = z.infer<typeof CrossTenantPermissionTypeSchema>;

export const AccessLevelSchema = z.enum(['none', 'read', 'write', 'admin']);
export type AccessLevel = z.infer<typeof AccessLevelSchema>;

export const CrossTenantPermissionStatusSchema = z.enum(['pending', 'active', 'suspended', 'revoked', 'expired']);
export type CrossTenantPermissionStatus = z.infer<typeof CrossTenantPermissionStatusSchema>;

export const CrossTenantPermissionSchema = z.object({
  id: z.string().uuid(),
  source_tenant_id: z.string().uuid(),
  target_tenant_id: z.string().uuid(),
  permission_type: CrossTenantPermissionTypeSchema,
  resource_types: z.array(z.string()).default([]),
  access_level: AccessLevelSchema.default('read'),
  conditions: z.record(z.any()).default({}),
  status: CrossTenantPermissionStatusSchema.default('pending'),
  expires_at: z.string().datetime().optional(),
  granted_by: z.string().optional(),
  granted_at: z.string().datetime().optional(),
  requested_by: z.string(),
  requested_at: z.string().datetime(),
  revoked_by: z.string().optional(),
  revoked_at: z.string().datetime().optional(),
  revocation_reason: z.string().optional(),
  usage_count: z.number().int().min(0).default(0),
  last_used_at: z.string().datetime().optional(),
  metadata: z.record(z.any()).default({}),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime()
});

export type CrossTenantPermission = z.infer<typeof CrossTenantPermissionSchema>;

export const TenantDiscoverySchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  discoverable_name: z.string().min(1).max(255),
  discovery_tags: z.array(z.string()).default([]),
  description: z.string().optional(),
  contact_info: z.record(z.string()).default({}),
  capabilities: z.array(z.string()).default([]),
  public_metadata: z.record(z.any()).default({}),
  discovery_enabled: z.boolean().default(false),
  auto_approve_requests: z.boolean().default(false),
  allowed_request_types: z.array(CrossTenantPermissionTypeSchema).default([]),
  discovery_score: z.number().min(0).default(0),
  search_count: z.number().int().min(0).default(0),
  last_searched_at: z.string().datetime().optional(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime()
});

export type TenantDiscovery = z.infer<typeof TenantDiscoverySchema>;

export const FederationInvitationTypeSchema = z.enum(['collaboration', 'data_sharing', 'search_partnership']);
export type FederationInvitationType = z.infer<typeof FederationInvitationTypeSchema>;

export const FederationInvitationStatusSchema = z.enum(['sent', 'accepted', 'declined', 'expired', 'cancelled']);
export type FederationInvitationStatus = z.infer<typeof FederationInvitationStatusSchema>;

export const FederationInvitationSchema = z.object({
  id: z.string().uuid(),
  inviting_tenant_id: z.string().uuid(),
  invited_tenant_id: z.string().uuid(),
  invitation_type: FederationInvitationTypeSchema,
  message: z.string().optional(),
  proposed_permissions: z.array(CrossTenantPermissionSchema),
  status: FederationInvitationStatusSchema.default('sent'),
  expires_at: z.string().datetime(),
  invited_by: z.string(),
  responded_by: z.string().optional(),
  response_message: z.string().optional(),
  responded_at: z.string().datetime().optional(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime()
});

export type FederationInvitation = z.infer<typeof FederationInvitationSchema>;

// ===================
// RESOURCE MANAGEMENT TYPES
// ===================

export const ResourceTypeSchema = z.enum(['storage_gb', 'api_calls_per_day', 'users', 'search_requests_per_hour', 'federation_connections']);
export type ResourceType = z.infer<typeof ResourceTypeSchema>;

export const ResetPeriodSchema = z.enum(['hourly', 'daily', 'weekly', 'monthly', 'yearly']);
export type ResetPeriod = z.infer<typeof ResetPeriodSchema>;

export const TenantResourceQuotaSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  resource_type: ResourceTypeSchema,
  quota_limit: z.number().int().positive(),
  current_usage: z.number().int().min(0).default(0),
  soft_limit: z.number().int().positive().optional(),
  hard_limit: z.number().int().positive().optional(),
  reset_period: ResetPeriodSchema.default('monthly'),
  last_reset_at: z.string().datetime(),
  next_reset_at: z.string().datetime().optional(),
  alert_threshold: z.number().min(0).max(1).default(0.8),
  is_enforced: z.boolean().default(true),
  metadata: z.record(z.any()).default({}),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime()
});

export type TenantResourceQuota = z.infer<typeof TenantResourceQuotaSchema>;

export const TenantUsageMetricSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  metric_name: z.string().min(1).max(100),
  metric_value: z.number(),
  metric_unit: z.string().min(1).max(50),
  measurement_period: z.string().min(1).max(50),
  period_start: z.string().datetime(),
  period_end: z.string().datetime(),
  aggregation_type: z.enum(['sum', 'average', 'max', 'min', 'count']).default('sum'),
  metadata: z.record(z.any()).default({}),
  recorded_at: z.string().datetime()
});

export type TenantUsageMetric = z.infer<typeof TenantUsageMetricSchema>;

export const TenantBillingRecordSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  billing_period_start: z.string().datetime(),
  billing_period_end: z.string().datetime(),
  usage_summary: z.record(z.any()),
  cost_breakdown: z.record(z.any()),
  total_cost_usd: z.number().min(0),
  currency: z.string().length(3).default('USD'),
  billing_status: z.enum(['draft', 'pending', 'paid', 'overdue', 'cancelled']).default('draft'),
  invoice_id: z.string().optional(),
  payment_status: z.enum(['unpaid', 'paid', 'failed', 'refunded']).optional(),
  payment_date: z.string().datetime().optional(),
  notes: z.string().optional(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime()
});

export type TenantBillingRecord = z.infer<typeof TenantBillingRecordSchema>;

// ===================
// AUDIT AND MONITORING TYPES
// ===================

export const SeverityLevelSchema = z.enum(['debug', 'info', 'warning', 'error', 'critical']);
export type SeverityLevel = z.infer<typeof SeverityLevelSchema>;

export const AuditStatusSchema = z.enum(['success', 'failure', 'partial']);
export type AuditStatus = z.infer<typeof AuditStatusSchema>;

export const TenantAuditLogSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  actor_tenant_id: z.string().uuid().optional(),
  user_id: z.string().optional(),
  action: z.string().min(1).max(100),
  resource_type: z.string().min(1).max(100),
  resource_id: z.string().optional(),
  resource_path: z.string().optional(),
  action_details: z.record(z.any()).default({}),
  ip_address: z.string().optional(),
  user_agent: z.string().optional(),
  session_id: z.string().optional(),
  request_id: z.string().optional(),
  is_cross_tenant: z.boolean().default(false),
  severity_level: SeverityLevelSchema.default('info'),
  status: AuditStatusSchema.default('success'),
  error_message: z.string().optional(),
  duration_ms: z.number().int().min(0).optional(),
  metadata: z.record(z.any()).default({}),
  created_at: z.string().datetime()
});

export type TenantAuditLog = z.infer<typeof TenantAuditLogSchema>;

export const AlertTypeSchema = z.enum(['quota_exceeded', 'tenant_suspended', 'federation_request', 'security_breach', 'performance_degradation']);
export type AlertType = z.infer<typeof AlertTypeSchema>;

export const AlertSeveritySchema = z.enum(['low', 'medium', 'high', 'critical']);
export type AlertSeverity = z.infer<typeof AlertSeveritySchema>;

export const AlertStatusSchema = z.enum(['active', 'acknowledged', 'resolved', 'dismissed']);
export type AlertStatus = z.infer<typeof AlertStatusSchema>;

export const TenantAlertSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  alert_type: AlertTypeSchema,
  severity: AlertSeveritySchema.default('medium'),
  title: z.string().min(1).max(255),
  message: z.string().min(1),
  alert_data: z.record(z.any()).default({}),
  status: AlertStatusSchema.default('active'),
  acknowledged_by: z.string().optional(),
  acknowledged_at: z.string().datetime().optional(),
  resolved_by: z.string().optional(),
  resolved_at: z.string().datetime().optional(),
  resolution_notes: z.string().optional(),
  notification_sent: z.boolean().default(false),
  notification_channels: z.array(z.string()).default([]),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime()
});

export type TenantAlert = z.infer<typeof TenantAlertSchema>;

export const TenantApiKeyStatusSchema = z.enum(['active', 'suspended', 'revoked', 'expired']);
export type TenantApiKeyStatus = z.infer<typeof TenantApiKeyStatusSchema>;

export const TenantApiKeySchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  key_name: z.string().min(1).max(255),
  key_hash: z.string().min(1).max(255),
  key_prefix: z.string().min(1).max(20),
  permissions: z.array(z.string()).default([]),
  scopes: z.array(z.string()).default([]),
  rate_limit_per_minute: z.number().int().positive().default(100),
  rate_limit_per_day: z.number().int().positive().default(10000),
  allowed_ips: z.array(z.string()).default([]),
  status: TenantApiKeyStatusSchema.default('active'),
  expires_at: z.string().datetime().optional(),
  last_used_at: z.string().datetime().optional(),
  usage_count: z.number().int().min(0).default(0),
  created_by: z.string(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime()
});

export type TenantApiKey = z.infer<typeof TenantApiKeySchema>;

// ===================
// METRICS AND REPORTING TYPES
// ===================

export const TenantMetricsSchema = z.object({
  tenant_id: z.string().uuid(),
  user_count: z.number().int().min(0),
  max_users: z.number().int().min(0),
  storage_used_gb: z.number().min(0),
  max_storage_gb: z.number().min(0),
  api_calls_today: z.number().int().min(0),
  max_api_calls_per_day: z.number().int().min(0),
  federation_connections: z.number().int().min(0).optional(),
  search_requests_per_hour: z.number().int().min(0).optional(),
  status: TenantStatusSchema,
  tier: TenantTierSchema,
  federation_enabled: z.boolean(),
  last_updated: z.string().datetime()
});

export type TenantMetrics = z.infer<typeof TenantMetricsSchema>;

export const TenantHealthStatusSchema = z.enum(['healthy', 'warning', 'critical', 'unknown']);
export type TenantHealthStatus = z.infer<typeof TenantHealthStatusSchema>;

export const TenantHealthCheckSchema = z.object({
  tenant_id: z.string().uuid(),
  status: TenantHealthStatusSchema,
  checks: z.array(z.object({
    name: z.string(),
    status: z.enum(['pass', 'fail', 'warning']),
    message: z.string().optional(),
    duration_ms: z.number().int().min(0).optional()
  })),
  overall_score: z.number().min(0).max(100),
  last_checked: z.string().datetime(),
  next_check: z.string().datetime().optional()
});

export type TenantHealthCheck = z.infer<typeof TenantHealthCheckSchema>;

// ===================
// CONTEXT AND SESSION TYPES
// ===================

export const TenantContextSchema = z.object({
  tenant_id: z.string().uuid(),
  user_id: z.string().optional(),
  role: TenantUserRoleSchema.optional(),
  permissions: z.array(z.string()).default([]),
  federation_permissions: z.array(z.string()).default([]),
  session_id: z.string().optional(),
  ip_address: z.string().optional(),
  user_agent: z.string().optional(),
  request_id: z.string().optional()
});

export type TenantContext = z.infer<typeof TenantContextSchema>;

export const MultiTenantRequestSchema = z.object({
  tenant_context: TenantContextSchema,
  cross_tenant_access: z.boolean().default(false),
  target_tenant_ids: z.array(z.string().uuid()).default([]),
  federated_request: z.boolean().default(false),
  audit_trail: z.boolean().default(true)
});

export type MultiTenantRequest = z.infer<typeof MultiTenantRequestSchema>;

// ===================
// JWT TOKEN TYPES
// ===================

export const TenantJwtClaimsSchema = z.object({
  sub: z.string(), // user_id
  tenant_id: z.string().uuid(),
  tenant_slug: z.string(),
  role: TenantUserRoleSchema,
  permissions: z.array(z.string()).default([]),
  federation_permissions: z.array(z.string()).default([]),
  iss: z.string(),
  aud: z.string(),
  iat: z.number().int(),
  exp: z.number().int(),
  jti: z.string().uuid() // JWT ID for tracking/revocation
});

export type TenantJwtClaims = z.infer<typeof TenantJwtClaimsSchema>;

// ===================
// VALIDATION HELPERS
// ===================

export const validateTenant = (data: unknown): Tenant => TenantSchema.parse(data);
export const validateCreateTenantRequest = (data: unknown): CreateTenantRequest => CreateTenantRequestSchema.parse(data);
export const validateUpdateTenantRequest = (data: unknown): UpdateTenantRequest => UpdateTenantRequestSchema.parse(data);
export const validateTenantUser = (data: unknown): TenantUser => TenantUserSchema.parse(data);
export const validateCrossTenantPermission = (data: unknown): CrossTenantPermission => CrossTenantPermissionSchema.parse(data);
export const validateTenantContext = (data: unknown): TenantContext => TenantContextSchema.parse(data);
export const validateTenantJwtClaims = (data: unknown): TenantJwtClaims => TenantJwtClaimsSchema.parse(data);

// ===================
// CONSTANTS
// ===================

export const TENANT_ROLES = {
  OWNER: 'owner' as const,
  ADMIN: 'admin' as const,
  EDITOR: 'editor' as const,
  VIEWER: 'viewer' as const,
  GUEST: 'guest' as const
};

export const TENANT_PERMISSIONS = {
  // User management
  MANAGE_USERS: 'tenant:manage_users',
  INVITE_USERS: 'tenant:invite_users',
  REMOVE_USERS: 'tenant:remove_users',
  
  // Configuration
  MANAGE_CONFIG: 'tenant:manage_config',
  VIEW_CONFIG: 'tenant:view_config',
  
  // Federation
  MANAGE_FEDERATION: 'tenant:manage_federation',
  CREATE_INVITATIONS: 'tenant:create_invitations',
  
  // Monitoring
  VIEW_METRICS: 'tenant:view_metrics',
  VIEW_AUDIT_LOGS: 'tenant:view_audit_logs',
  
  // Resources
  MANAGE_QUOTAS: 'tenant:manage_quotas',
  VIEW_BILLING: 'tenant:view_billing',
  
  // API Keys
  MANAGE_API_KEYS: 'tenant:manage_api_keys',
  CREATE_API_KEYS: 'tenant:create_api_keys'
} as const;

export const DEFAULT_TENANT_PERMISSIONS = {
  [TENANT_ROLES.OWNER]: Object.values(TENANT_PERMISSIONS),
  [TENANT_ROLES.ADMIN]: [
    TENANT_PERMISSIONS.MANAGE_USERS,
    TENANT_PERMISSIONS.INVITE_USERS,
    TENANT_PERMISSIONS.MANAGE_CONFIG,
    TENANT_PERMISSIONS.VIEW_CONFIG,
    TENANT_PERMISSIONS.VIEW_METRICS,
    TENANT_PERMISSIONS.VIEW_AUDIT_LOGS,
    TENANT_PERMISSIONS.CREATE_API_KEYS
  ],
  [TENANT_ROLES.EDITOR]: [
    TENANT_PERMISSIONS.VIEW_CONFIG,
    TENANT_PERMISSIONS.VIEW_METRICS
  ],
  [TENANT_ROLES.VIEWER]: [
    TENANT_PERMISSIONS.VIEW_CONFIG,
    TENANT_PERMISSIONS.VIEW_METRICS
  ],
  [TENANT_ROLES.GUEST]: []
};

export const RESOURCE_TYPES = {
  STORAGE_GB: 'storage_gb' as const,
  API_CALLS_PER_DAY: 'api_calls_per_day' as const,
  USERS: 'users' as const,
  SEARCH_REQUESTS_PER_HOUR: 'search_requests_per_hour' as const,
  FEDERATION_CONNECTIONS: 'federation_connections' as const
} as const;