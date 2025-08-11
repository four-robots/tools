/**
 * Multi-tenant Integration Tests
 * 
 * Comprehensive tests for the multi-tenant infrastructure including:
 * - Tenant management lifecycle
 * - Authentication and authorization
 * - Cross-tenant federation
 * - Resource quotas and monitoring
 * - Service factory tenant isolation
 * 
 * Part of Multi-tenant Search Infrastructure (Work Item 4.2.1)
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { TenantManagementService } from '../tenant-management-service.js';
import { TenantAuthenticationService } from '../tenant-authentication-service.js';
import { CrossTenantFederationService } from '../cross-tenant-federation-service.js';
import { TenantResourceService } from '../tenant-resource-service.js';
import { TenantServiceFactory } from '../tenant-service-factory.js';
import { 
  Tenant, 
  TenantUser, 
  CreateTenantRequest,
  TenantContext,
  RESOURCE_TYPES
} from '../../../shared/types/multi-tenant.js';

describe('Multi-tenant Infrastructure Integration', () => {
  let tenantService: TenantManagementService;
  let authService: TenantAuthenticationService;
  let federationService: CrossTenantFederationService;
  let resourceService: TenantResourceService;
  let serviceFactory: TenantServiceFactory;

  let testTenant1: Tenant;
  let testTenant2: Tenant;
  let testUser1: TenantUser;
  let testUser2: TenantUser;
  let testContext1: TenantContext;
  let testContext2: TenantContext;

  beforeAll(async () => {
    // Initialize services
    tenantService = new TenantManagementService();
    authService = new TenantAuthenticationService();
    federationService = new CrossTenantFederationService();
    resourceService = new TenantResourceService();
    serviceFactory = TenantServiceFactory.getInstance();

    // Initialize service factory
    await TenantServiceFactory.initializeDefault();
  });

  beforeEach(async () => {
    // Create test tenants
    const tenant1Request: CreateTenantRequest = {
      name: 'Test Organization 1',
      slug: 'test-org-1',
      displayName: 'Test Organization 1',
      description: 'First test tenant',
      tier: 'standard',
      maxUsers: 10,
      maxStorageGb: 5,
      maxApiCallsPerDay: 1000,
      federationEnabled: true,
      publicDiscovery: true
    };

    const tenant2Request: CreateTenantRequest = {
      name: 'Test Organization 2',
      slug: 'test-org-2',
      displayName: 'Test Organization 2',
      description: 'Second test tenant',
      tier: 'premium',
      maxUsers: 20,
      maxStorageGb: 10,
      maxApiCallsPerDay: 5000,
      federationEnabled: true,
      publicDiscovery: true
    };

    testTenant1 = await tenantService.createTenant(tenant1Request, 'test-system');
    testTenant2 = await tenantService.createTenant(tenant2Request, 'test-system');

    // Create test users
    testUser1 = await tenantService.addUserToTenant(
      testTenant1.id,
      'user1',
      'user1@test.com',
      'admin',
      'test-system'
    );

    testUser2 = await tenantService.addUserToTenant(
      testTenant2.id,
      'user2',
      'user2@test.com',
      'editor',
      'test-system'
    );

    // Create tenant contexts
    testContext1 = {
      tenant_id: testTenant1.id,
      user_id: testUser1.user_id,
      role: testUser1.role,
      permissions: ['tenant:manage_config', 'tenant:view_metrics'],
      federation_permissions: []
    };

    testContext2 = {
      tenant_id: testTenant2.id,
      user_id: testUser2.user_id,
      role: testUser2.role,
      permissions: ['tenant:view_config', 'tenant:view_metrics'],
      federation_permissions: []
    };
  });

  afterEach(async () => {
    // Cleanup test data
    try {
      if (testTenant1?.id) {
        await tenantService.deleteTenant(testTenant1.id, 'test-cleanup', true);
      }
      if (testTenant2?.id) {
        await tenantService.deleteTenant(testTenant2.id, 'test-cleanup', true);
      }
    } catch (error) {
      console.warn('Cleanup error:', error);
    }
  });

  describe('Tenant Management', () => {
    test('should create tenant with complete configuration', async () => {
      expect(testTenant1.id).toBeDefined();
      expect(testTenant1.slug).toBe('test-org-1');
      expect(testTenant1.tier).toBe('standard');
      expect(testTenant1.federation_enabled).toBe(true);
    });

    test('should manage tenant users', async () => {
      expect(testUser1.id).toBeDefined();
      expect(testUser1.tenant_id).toBe(testTenant1.id);
      expect(testUser1.role).toBe('admin');
      expect(testUser1.status).toBe('active');
    });

    test('should update tenant configuration', async () => {
      const updatedTenant = await tenantService.updateTenant(
        testTenant1.id,
        { maxUsers: 15, tier: 'premium' },
        'test-system'
      );

      expect(updatedTenant.max_users).toBe(15);
      expect(updatedTenant.tier).toBe('premium');
    });

    test('should get tenant metrics', async () => {
      const metrics = await tenantService.getTenantMetrics(testTenant1.id);

      expect(metrics.tenant_id).toBe(testTenant1.id);
      expect(metrics.user_count).toBeGreaterThan(0);
      expect(metrics.status).toBe('active');
    });
  });

  describe('Authentication and Authorization', () => {
    test('should generate and validate JWT tokens', async () => {
      const token = await authService.generateTenantToken(
        testTenant1.id,
        testUser1.user_id,
        'test-session'
      );

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');

      const validation = await authService.validateTenantToken(token);
      expect(validation.valid).toBe(true);
      expect(validation.claims?.tenant_id).toBe(testTenant1.id);
      expect(validation.claims?.sub).toBe(testUser1.user_id);
    });

    test('should generate and validate API keys', async () => {
      const { apiKey, keyRecord } = await authService.generateApiKey(
        testTenant1.id,
        'Test API Key',
        ['tenant:view_config'],
        'test-system'
      );

      expect(apiKey).toBeDefined();
      expect(keyRecord.key_name).toBe('Test API Key');
      expect(keyRecord.tenant_id).toBe(testTenant1.id);

      const validation = await authService.validateApiKey(apiKey);
      expect(validation.valid).toBe(true);
      expect(validation.tenant_context?.tenant_id).toBe(testTenant1.id);
    });

    test('should check user permissions', async () => {
      const hasPermission = await authService.hasPermission(
        testTenant1.id,
        testUser1.user_id,
        'tenant:manage_config'
      );

      expect(hasPermission).toBe(true);
    });

    test('should validate tenant context', async () => {
      const isValid = await authService.validateTenantContext(testContext1);
      expect(isValid).toBe(true);
    });
  });

  describe('Cross-tenant Federation', () => {
    test('should enable tenant discovery', async () => {
      const discovery = await federationService.enableTenantDiscovery(
        testTenant1.id,
        {
          discoverableName: 'Test Org 1',
          description: 'Test organization for discovery',
          tags: ['test', 'development'],
          capabilities: ['search', 'collaboration'],
          autoApproveRequests: false
        },
        'test-system'
      );

      expect(discovery.tenant_id).toBe(testTenant1.id);
      expect(discovery.discovery_enabled).toBe(true);
    });

    test('should search discoverable tenants', async () => {
      // Enable discovery for both tenants
      await federationService.enableTenantDiscovery(
        testTenant1.id,
        { discoverableName: 'Test Org 1', tags: ['test'] },
        'test-system'
      );
      
      await federationService.enableTenantDiscovery(
        testTenant2.id,
        { discoverableName: 'Test Org 2', tags: ['test'] },
        'test-system'
      );

      const discoveries = await federationService.searchDiscoverableTenants(
        testTenant1.id,
        'Test Org',
        { limit: 10 }
      );

      expect(discoveries.length).toBeGreaterThan(0);
      const foundTenant2 = discoveries.find(d => d.tenant_id === testTenant2.id);
      expect(foundTenant2).toBeDefined();
    });

    test('should handle federation invitations', async () => {
      const invitation = await federationService.sendFederationInvitation(
        testTenant1.id,
        {
          targetTenantId: testTenant2.id,
          invitationType: 'collaboration',
          message: 'Test federation invitation',
          proposedPermissions: [{
            permissionType: 'search',
            resourceTypes: ['kanban', 'wiki'],
            accessLevel: 'read'
          }]
        },
        testUser1.user_id
      );

      expect(invitation.inviting_tenant_id).toBe(testTenant1.id);
      expect(invitation.invited_tenant_id).toBe(testTenant2.id);
      expect(invitation.status).toBe('sent');

      // Accept invitation
      const response = await federationService.respondToFederationInvitation(
        invitation.id,
        'accepted',
        testUser2.user_id,
        'Accepted for testing'
      );

      expect(response.status).toBe('accepted');
      expect(response.responded_by).toBe(testUser2.user_id);
    });

    test('should manage cross-tenant permissions', async () => {
      const permission = await federationService.grantCrossTenantPermission(
        testTenant1.id,
        testTenant2.id,
        {
          permissionType: 'search',
          resourceTypes: ['kanban'],
          accessLevel: 'read'
        },
        testUser1.user_id
      );

      expect(permission.source_tenant_id).toBe(testTenant1.id);
      expect(permission.target_tenant_id).toBe(testTenant2.id);
      expect(permission.status).toBe('active');

      // Check if cross-tenant access works
      const hasAccess = await authService.hasCrossTenantAccess(
        testTenant1.id,
        testTenant2.id,
        'kanban',
        'read'
      );

      expect(hasAccess).toBe(true);
    });
  });

  describe('Resource Management', () => {
    test('should set and check resource quotas', async () => {
      const quota = await resourceService.setResourceQuota(
        testTenant1.id,
        {
          resourceType: RESOURCE_TYPES.API_CALLS_PER_DAY,
          quotaLimit: 100,
          resetPeriod: 'daily',
          alertThreshold: 0.8,
          isEnforced: true
        },
        'test-system'
      );

      expect(quota.tenant_id).toBe(testTenant1.id);
      expect(quota.resource_type).toBe(RESOURCE_TYPES.API_CALLS_PER_DAY);
      expect(quota.quota_limit).toBe(100);

      // Check quota
      const quotaCheck = await resourceService.checkResourceQuota(
        testTenant1.id,
        RESOURCE_TYPES.API_CALLS_PER_DAY,
        5
      );

      expect(quotaCheck.allowed).toBe(true);
      expect(quotaCheck.remainingQuota).toBe(100);
    });

    test('should record and track usage', async () => {
      // Set a quota first
      await resourceService.setResourceQuota(
        testTenant1.id,
        {
          resourceType: RESOURCE_TYPES.API_CALLS_PER_DAY,
          quotaLimit: 10,
          resetPeriod: 'daily'
        },
        'test-system'
      );

      // Record usage
      await resourceService.recordResourceUsage(testTenant1.id, [{
        resourceType: RESOURCE_TYPES.API_CALLS_PER_DAY,
        usage: 3,
        metadata: { endpoint: '/api/test' }
      }]);

      // Check updated quota
      const quotaCheck = await resourceService.checkResourceQuota(
        testTenant1.id,
        RESOURCE_TYPES.API_CALLS_PER_DAY,
        1
      );

      expect(quotaCheck.allowed).toBe(true);
      expect(quotaCheck.remainingQuota).toBe(7);
    });

    test('should generate usage reports', async () => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 7);
      const endDate = new Date();

      const report = await resourceService.generateUsageReport(
        testTenant1.id,
        startDate,
        endDate
      );

      expect(report.tenantId).toBe(testTenant1.id);
      expect(report.reportPeriod.start).toEqual(startDate);
      expect(report.reportPeriod.end).toEqual(endDate);
      expect(Array.isArray(report.resourceUsage)).toBe(true);
    });
  });

  describe('Service Factory Integration', () => {
    test('should create tenant-aware services', async () => {
      // This test would require actual service implementations
      // For now, we'll test the factory structure
      expect(() => {
        serviceFactory.getService('kanban', testContext1);
      }).not.toThrow();
    });

    test('should handle cross-tenant service access', async () => {
      expect(() => {
        serviceFactory.getServiceWithCrossTenantAccess(
          'kanban',
          testContext1,
          [testTenant2.id]
        );
      }).not.toThrow();
    });
  });

  describe('End-to-End Tenant Isolation', () => {
    test('should maintain complete tenant isolation', async () => {
      // Create data in tenant 1
      const tenant1Context = testContext1;
      
      // Try to access from tenant 2 (should fail without cross-tenant permission)
      const tenant2Context = testContext2;
      
      // Verify contexts are different
      expect(tenant1Context.tenant_id).not.toBe(tenant2Context.tenant_id);
      
      // Test that authentication service correctly isolates tenants
      const token1 = await authService.generateTenantToken(
        testTenant1.id,
        testUser1.user_id
      );
      
      const validation1 = await authService.validateTenantToken(token1);
      expect(validation1.tenant_context?.tenant_id).toBe(testTenant1.id);
      
      // Cross-tenant access should be denied without permission
      const hasAccess = await authService.hasCrossTenantAccess(
        testTenant1.id,
        testTenant2.id,
        'test_resource',
        'read'
      );
      
      expect(hasAccess).toBe(false);
    });

    test('should enforce quota limits', async () => {
      // Set very low quota
      await resourceService.setResourceQuota(
        testTenant1.id,
        {
          resourceType: RESOURCE_TYPES.API_CALLS_PER_DAY,
          quotaLimit: 2,
          resetPeriod: 'daily',
          isEnforced: true
        },
        'test-system'
      );

      // Use up quota
      await resourceService.recordResourceUsage(testTenant1.id, [{
        resourceType: RESOURCE_TYPES.API_CALLS_PER_DAY,
        usage: 2
      }]);

      // Next request should be denied
      const quotaCheck = await resourceService.checkResourceQuota(
        testTenant1.id,
        RESOURCE_TYPES.API_CALLS_PER_DAY,
        1
      );

      expect(quotaCheck.allowed).toBe(false);
      expect(quotaCheck.reason).toBe('Quota limit exceeded');
    });
  });
});

describe('Multi-tenant Error Handling', () => {
  let tenantService: TenantManagementService;

  beforeAll(() => {
    tenantService = new TenantManagementService();
  });

  test('should handle duplicate tenant creation', async () => {
    const tenantRequest: CreateTenantRequest = {
      name: 'Duplicate Test',
      slug: 'duplicate-test'
    };

    const tenant1 = await tenantService.createTenant(tenantRequest, 'test-system');
    
    await expect(
      tenantService.createTenant(tenantRequest, 'test-system')
    ).rejects.toThrow('already exists');

    // Cleanup
    await tenantService.deleteTenant(tenant1.id, 'test-cleanup', true);
  });

  test('should handle invalid tenant operations', async () => {
    await expect(
      tenantService.getTenantById('invalid-uuid')
    ).rejects.toThrow();

    await expect(
      tenantService.updateTenant('non-existent-id', { tier: 'premium' }, 'test')
    ).rejects.toThrow();
  });
});