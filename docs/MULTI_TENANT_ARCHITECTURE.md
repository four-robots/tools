# Multi-Tenant Search Infrastructure

## Overview

The MCP Tools system now includes comprehensive multi-tenant architecture (Work Item 4.2.1) that provides complete tenant isolation with federation support. This enables organizations to have secure, isolated search environments while maintaining the ability to collaborate across tenant boundaries when authorized.

## Architecture Components

### 1. Database Schema

The multi-tenant architecture extends the existing PostgreSQL schema with:

- **Tenant Management Tables**: Core tenant information, hierarchy, and configuration
- **User Management**: Tenant-scoped user accounts with role-based permissions
- **Federation Infrastructure**: Cross-tenant discovery, invitations, and permissions
- **Resource Management**: Quotas, usage tracking, and billing
- **Audit & Monitoring**: Comprehensive logging and alerting
- **Row-Level Security (RLS)**: Automatic tenant data isolation

#### Key Tables Added:
- `tenants` - Core tenant registry
- `tenant_users` - Tenant membership management
- `tenant_configurations` - Tenant-specific settings
- `cross_tenant_permissions` - Federation permissions
- `tenant_resource_quotas` - Resource limits and usage
- `tenant_audit_logs` - Complete audit trail

All existing tables have been extended with `tenant_id` columns and RLS policies.

### 2. Backend Services

#### TenantManagementService
- Tenant lifecycle management (create, update, suspend, delete)
- User management within tenants
- Configuration management
- Metrics and monitoring

```typescript
import { TenantManagementService } from '@mcp-tools/core';

const tenantService = new TenantManagementService();

// Create a new tenant
const tenant = await tenantService.createTenant({
  name: 'Acme Corporation',
  slug: 'acme-corp',
  displayName: 'Acme Corporation',
  tier: 'enterprise',
  maxUsers: 500,
  federationEnabled: true
}, 'admin-user');

// Add user to tenant
const user = await tenantService.addUserToTenant(
  tenant.id,
  'user123',
  'user@acme.com',
  'admin',
  'admin-user'
);
```

#### TenantAuthenticationService
- JWT token generation with tenant claims
- API key authentication
- Cross-tenant authorization
- Session management

```typescript
import { TenantAuthenticationService } from '@mcp-tools/core';

const authService = new TenantAuthenticationService();

// Generate tenant-scoped JWT token
const token = await authService.generateTenantToken(
  tenantId,
  userId,
  sessionId
);

// Validate token and extract tenant context
const validation = await authService.validateTenantToken(token);
if (validation.valid) {
  const tenantContext = validation.tenant_context;
}
```

#### CrossTenantFederationService
- Tenant discovery and search
- Federation invitation management
- Cross-tenant permissions
- Trust verification

```typescript
import { CrossTenantFederationService } from '@mcp-tools/core';

const federationService = new CrossTenantFederationService();

// Enable tenant for discovery
await federationService.enableTenantDiscovery(tenantId, {
  discoverableName: 'Acme Corp',
  tags: ['technology', 'enterprise'],
  capabilities: ['search', 'collaboration']
}, 'admin-user');

// Send federation invitation
const invitation = await federationService.sendFederationInvitation(
  sourceTenantId,
  {
    targetTenantId: targetTenantId,
    invitationType: 'collaboration',
    proposedPermissions: [{
      permissionType: 'search',
      resourceTypes: ['kanban', 'wiki'],
      accessLevel: 'read'
    }]
  },
  'admin-user'
);
```

#### TenantResourceService
- Resource quota management
- Usage tracking and monitoring
- Billing and cost management
- Performance optimization

```typescript
import { TenantResourceService } from '@mcp-tools/core';

const resourceService = new TenantResourceService();

// Set resource quota
await resourceService.setResourceQuota(tenantId, {
  resourceType: 'api_calls_per_day',
  quotaLimit: 10000,
  resetPeriod: 'daily',
  alertThreshold: 0.8
}, 'admin-user');

// Check quota before operation
const quotaCheck = await resourceService.checkResourceQuota(
  tenantId,
  'api_calls_per_day',
  1
);

if (quotaCheck.allowed) {
  // Proceed with operation
  await resourceService.recordResourceUsage(tenantId, [{
    resourceType: 'api_calls_per_day',
    usage: 1
  }]);
}
```

### 3. API Gateway Middleware

#### Tenant Isolation Middleware
Automatic tenant context extraction, validation, and database context setting:

```typescript
import { requireTenant, requirePermissions, allowCrossTenant } from '@mcp-tools/gateway';

// Require tenant context
app.use('/api/private', requireTenant());

// Require specific permissions
app.use('/api/admin', requirePermissions(['tenant:manage_users']));

// Allow cross-tenant operations
app.use('/api/federation', allowCrossTenant(['tenant:manage_federation']));

// With quota checking
app.use('/api/search', withQuotaCheck('search_requests_per_hour', 1));
```

#### Service Factory Integration
Tenant-aware wrappers for existing services:

```typescript
import { getTenantAwareService } from '@mcp-tools/core';

// Get tenant-scoped service
const kanbanService = getTenantAwareService('kanban', tenantContext);

// Create board (automatically tenant-scoped)
const board = await kanbanService.createBoard({
  name: 'Project Board',
  description: 'Team project board'
});

// Cross-tenant service access
const crossTenantService = getCrossTenantService(
  'wiki',
  tenantContext,
  [targetTenantId]
);
```

## Security Features

### 1. Complete Data Isolation

- **Row-Level Security (RLS)**: PostgreSQL policies automatically filter data by tenant
- **Database Context**: Automatic tenant context setting for all queries
- **Service Wrappers**: Tenant-aware service layer enforces isolation
- **API Middleware**: Request-level tenant validation and context injection

### 2. Cross-Tenant Authorization

- **Federation Permissions**: Granular cross-tenant access control
- **Trust Verification**: Automated security and compliance checks
- **Audit Trails**: Complete logging of cross-tenant activities
- **Revocation**: Instant permission revocation capabilities

### 3. Authentication & Authorization

- **Multi-tenant JWT**: Tenant claims embedded in tokens
- **API Keys**: Tenant-scoped API keys with permissions
- **Role-Based Access**: Hierarchical permissions within tenants
- **Session Management**: Tenant-aware session isolation

## Federation Features

### 1. Tenant Discovery

Organizations can discover and request access to other tenants:

```typescript
// Search for discoverable tenants
const tenants = await federationService.searchDiscoverableTenants(
  searchingTenantId,
  'technology companies',
  {
    tags: ['tech', 'ai'],
    region: 'us-east-1',
    limit: 20
  }
);
```

### 2. Collaboration Invitations

Secure tenant-to-tenant collaboration setup:

```typescript
// Send invitation
const invitation = await federationService.sendFederationInvitation(
  invitingTenantId,
  {
    targetTenantId: targetTenantId,
    invitationType: 'data_sharing',
    message: 'Would like to share research data',
    proposedPermissions: [...]
  },
  'admin-user'
);

// Respond to invitation
await federationService.respondToFederationInvitation(
  invitation.id,
  'accepted',
  'admin-user',
  'Approved for collaboration'
);
```

### 3. Trust Relationships

Automated verification and trust scoring:

```typescript
const trustResult = await federationService.performTrustVerification(
  tenantId,
  targetTenantId
);

if (trustResult.verified && trustResult.trustScore > 80) {
  // Proceed with federation
}
```

## Resource Management

### 1. Quota System

- **Resource Types**: Storage, API calls, users, search requests, federation connections
- **Flexible Periods**: Hourly, daily, weekly, monthly, yearly resets
- **Soft/Hard Limits**: Warning thresholds and enforcement limits
- **Automatic Scaling**: Dynamic quota adjustments based on tier

### 2. Usage Monitoring

- **Real-time Tracking**: Immediate usage recording and validation
- **Historical Analytics**: Detailed usage reports and trends
- **Predictive Analysis**: Usage forecasting and recommendations
- **Cost Management**: Automated billing and cost optimization

### 3. Performance Optimization

- **Tenant Affinity**: Database connection pooling by tenant
- **Resource Scaling**: Horizontal scaling with tenant awareness
- **Caching Strategies**: Tenant-specific caching namespaces
- **Query Optimization**: Multi-tenant query performance tuning

## Migration Strategy

### 1. Database Migration

Run the multi-tenant migration:

```bash
cd migrations
npm run build
POSTGRES_PASSWORD=password POSTGRES_HOST=localhost POSTGRES_PORT=5432 POSTGRES_DB=mcp_tools POSTGRES_USER=postgres node dist/migrate.js
```

### 2. Data Migration

Migrate existing data to default tenant:

```bash
cd migrations
node dist/scripts/migrate-existing-data.js
```

### 3. Service Updates

Update services to use tenant-aware wrappers:

```typescript
// Before
const kanbanService = new KanbanService();

// After
const kanbanService = getTenantAwareService('kanban', tenantContext);
```

## API Usage Examples

### Tenant Management API

```bash
# Create tenant
POST /api/tenants
{
  "name": "Acme Corporation",
  "slug": "acme-corp",
  "tier": "enterprise"
}

# Get tenant metrics
GET /api/tenants/123e4567-e89b-12d3-a456-426614174000/metrics

# Update tenant
PATCH /api/tenants/123e4567-e89b-12d3-a456-426614174000
{
  "maxUsers": 1000,
  "tier": "enterprise"
}
```

### Authentication API

```bash
# Generate token
POST /api/auth/token
{
  "tenantId": "123e4567-e89b-12d3-a456-426614174000",
  "userId": "user123"
}

# Validate token
GET /api/auth/validate
Authorization: Bearer <jwt-token>
```

### Federation API

```bash
# Search discoverable tenants
GET /api/federation/discover?query=technology&tags=ai,ml

# Send invitation
POST /api/federation/invitations
{
  "targetTenantId": "123e4567-e89b-12d3-a456-426614174001",
  "invitationType": "collaboration"
}

# Cross-tenant search
GET /api/search?q=machine+learning
X-Target-Tenants: tenant1,tenant2
```

### Resource Management API

```bash
# Set quota
PUT /api/tenants/123e4567-e89b-12d3-a456-426614174000/quotas/api_calls_per_day
{
  "quotaLimit": 50000,
  "alertThreshold": 0.9
}

# Get usage report
GET /api/tenants/123e4567-e89b-12d3-a456-426614174000/usage?start=2024-01-01&end=2024-01-31
```

## Monitoring & Alerting

### 1. Tenant Health Monitoring

- **Quota Utilization**: Real-time quota usage monitoring
- **Performance Metrics**: Response times, error rates, throughput
- **Security Events**: Failed authentication, suspicious activities
- **Federation Activity**: Cross-tenant access patterns

### 2. Automated Alerts

- **Quota Warnings**: Approaching limits (80%, 90%, 95%)
- **Quota Exceeded**: Hard limit violations
- **Security Incidents**: Unauthorized access attempts
- **Federation Events**: New invitations, trust score changes

### 3. Compliance & Auditing

- **Complete Audit Trail**: All tenant operations logged
- **GDPR Compliance**: Data retention and deletion policies
- **SOC2 Support**: Security and availability controls
- **Regulatory Reporting**: Automated compliance reports

## Deployment Configuration

### Environment Variables

```bash
# JWT Configuration
JWT_SECRET=your-super-secret-key
JWT_ISSUER=mcp-tools
JWT_AUDIENCE=mcp-tools-api

# Multi-tenant Settings
QUOTA_ENFORCEMENT_ENABLED=true
BILLING_ENABLED=true

# Database Configuration
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=mcp_tools
POSTGRES_USER=postgres
POSTGRES_PASSWORD=password
```

### Docker Deployment

The multi-tenant system is fully compatible with the existing Docker deployment:

```bash
# Build with multi-tenant support
docker-compose -f docker-compose.prod.yml up -d

# Run migrations
docker-compose exec gateway node dist/migrate.js
docker-compose exec gateway node dist/scripts/migrate-existing-data.js
```

## Performance Considerations

### 1. Database Optimization

- **RLS Performance**: Optimized policies with proper indexing
- **Tenant Partitioning**: Large tables partitioned by tenant
- **Connection Pooling**: Tenant-aware connection management
- **Query Optimization**: Multi-tenant query patterns

### 2. Application Scaling

- **Horizontal Scaling**: Tenant-aware load balancing
- **Caching Strategy**: Tenant-scoped cache namespaces
- **Resource Isolation**: CPU and memory limits per tenant
- **Performance Monitoring**: Tenant-specific metrics

### 3. Federation Scaling

- **Discovery Caching**: Cached tenant discovery results
- **Permission Caching**: Cached cross-tenant permissions
- **Trust Score Caching**: Cached trust verification results
- **Network Optimization**: Efficient cross-tenant communication

## Troubleshooting

### Common Issues

1. **Token Validation Failures**
   - Check JWT secret configuration
   - Verify tenant exists and is active
   - Ensure user has active membership

2. **RLS Policy Issues**
   - Verify database context is set correctly
   - Check tenant_id in session variables
   - Review RLS policy definitions

3. **Cross-Tenant Access Denied**
   - Verify federation permissions exist
   - Check permission expiration dates
   - Review trust verification results

4. **Quota Exceeded Errors**
   - Check current usage vs. limits
   - Review quota reset schedules
   - Consider tier upgrades

### Diagnostic Commands

```bash
# Check tenant status
SELECT * FROM tenants WHERE id = 'tenant-id';

# View user permissions
SELECT * FROM tenant_users WHERE tenant_id = 'tenant-id';

# Check quota status
SELECT * FROM tenant_resource_quotas WHERE tenant_id = 'tenant-id';

# Review federation permissions
SELECT * FROM cross_tenant_permissions 
WHERE source_tenant_id = 'tenant-id' OR target_tenant_id = 'tenant-id';
```

## Future Enhancements

- **Geographic Distribution**: Multi-region tenant deployment
- **Advanced Analytics**: ML-powered usage prediction
- **Custom Compliance**: Configurable compliance frameworks
- **API Gateway Federation**: Direct tenant-to-tenant APIs
- **Advanced Billing**: Usage-based pricing models
- **Mobile SDK**: Native mobile tenant integration

## Conclusion

The multi-tenant search infrastructure provides enterprise-grade tenant isolation with powerful federation capabilities. It maintains complete data security while enabling controlled collaboration across organizational boundaries, making it suitable for both single-tenant deployments and large multi-tenant SaaS platforms.