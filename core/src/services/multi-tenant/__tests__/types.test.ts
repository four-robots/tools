/**
 * Multi-tenant Types Tests
 * 
 * Tests for multi-tenant type validation and schema enforcement
 */

import { describe, test, expect } from '@jest/globals';
import {
  validateTenant,
  validateCreateTenantRequest,
  validateTenantUser,
  validateCrossTenantPermission,
  validateTenantContext,
  validateTenantJwtClaims,
  TenantSchema,
  CreateTenantRequestSchema,
  TenantUserSchema,
  CrossTenantPermissionSchema,
  TenantContextSchema,
  TenantJwtClaimsSchema,
  TENANT_ROLES,
  TENANT_PERMISSIONS,
  DEFAULT_TENANT_PERMISSIONS,
  RESOURCE_TYPES
} from '../../../shared/types/multi-tenant.js';

describe('Multi-tenant Types Validation', () => {
  describe('Tenant Schema', () => {
    test('should validate valid tenant data', () => {
      const validTenant = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Test Tenant',
        slug: 'test-tenant',
        display_name: 'Test Tenant',
        status: 'active',
        tier: 'standard',
        depth_level: 0,
        is_organization: true,
        federation_enabled: false,
        public_discovery: false,
        data_region: 'us-east-1',
        compliance_requirements: [],
        branding_config: {},
        feature_flags: {},
        metadata: {},
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z'
      };

      expect(() => validateTenant(validTenant)).not.toThrow();
    });

    test('should reject invalid tenant data', () => {
      const invalidTenant = {
        id: 'invalid-uuid',
        name: '',
        slug: 'INVALID-SLUG!',
        status: 'invalid-status'
      };

      expect(() => validateTenant(invalidTenant)).toThrow();
    });
  });

  describe('Create Tenant Request Schema', () => {
    test('should validate valid create request', () => {
      const validRequest = {
        name: 'New Tenant',
        slug: 'new-tenant',
        displayName: 'New Tenant Display Name',
        tier: 'premium',
        maxUsers: 100,
        federationEnabled: true
      };

      expect(() => validateCreateTenantRequest(validRequest)).not.toThrow();
    });

    test('should apply default values', () => {
      const minimalRequest = {
        name: 'Minimal Tenant',
        slug: 'minimal-tenant'
      };

      const validated = CreateTenantRequestSchema.parse(minimalRequest);
      expect(validated.tier).toBe('standard');
      expect(validated.isOrganization).toBe(true);
      expect(validated.federationEnabled).toBe(false);
    });
  });

  describe('Tenant User Schema', () => {
    test('should validate valid tenant user', () => {
      const validUser = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        tenant_id: '123e4567-e89b-12d3-a456-426614174001',
        user_id: 'user123',
        email: 'test@example.com',
        role: 'admin',
        permissions: ['tenant:manage_users'],
        status: 'active',
        joined_at: '2024-01-01T00:00:00Z',
        metadata: {},
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z'
      };

      expect(() => validateTenantUser(validUser)).not.toThrow();
    });

    test('should reject invalid role', () => {
      const invalidUser = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        tenant_id: '123e4567-e89b-12d3-a456-426614174001',
        user_id: 'user123',
        email: 'test@example.com',
        role: 'invalid-role',
        status: 'active',
        joined_at: '2024-01-01T00:00:00Z',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z'
      };

      expect(() => validateTenantUser(invalidUser)).toThrow();
    });
  });

  describe('Cross-tenant Permission Schema', () => {
    test('should validate valid cross-tenant permission', () => {
      const validPermission = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        source_tenant_id: '123e4567-e89b-12d3-a456-426614174001',
        target_tenant_id: '123e4567-e89b-12d3-a456-426614174002',
        permission_type: 'search',
        resource_types: ['kanban', 'wiki'],
        access_level: 'read',
        conditions: {},
        status: 'active',
        requested_by: 'user123',
        requested_at: '2024-01-01T00:00:00Z',
        usage_count: 0,
        metadata: {},
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z'
      };

      expect(() => validateCrossTenantPermission(validPermission)).not.toThrow();
    });
  });

  describe('Tenant Context Schema', () => {
    test('should validate valid tenant context', () => {
      const validContext = {
        tenant_id: '123e4567-e89b-12d3-a456-426614174000',
        user_id: 'user123',
        role: 'admin',
        permissions: ['tenant:manage_users'],
        federation_permissions: ['federation:search:read']
      };

      expect(() => validateTenantContext(validContext)).not.toThrow();
    });

    test('should allow minimal tenant context', () => {
      const minimalContext = {
        tenant_id: '123e4567-e89b-12d3-a456-426614174000',
        permissions: [],
        federation_permissions: []
      };

      expect(() => validateTenantContext(minimalContext)).not.toThrow();
    });
  });

  describe('JWT Claims Schema', () => {
    test('should validate valid JWT claims', () => {
      const validClaims = {
        sub: 'user123',
        tenant_id: '123e4567-e89b-12d3-a456-426614174000',
        tenant_slug: 'test-tenant',
        role: 'admin',
        permissions: ['tenant:manage_users'],
        federation_permissions: [],
        iss: 'mcp-tools',
        aud: 'mcp-tools-api',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
        jti: '123e4567-e89b-12d3-a456-426614174003'
      };

      expect(() => validateTenantJwtClaims(validClaims)).not.toThrow();
    });
  });
});

describe('Multi-tenant Constants', () => {
  test('should have correct tenant roles', () => {
    expect(TENANT_ROLES.OWNER).toBe('owner');
    expect(TENANT_ROLES.ADMIN).toBe('admin');
    expect(TENANT_ROLES.EDITOR).toBe('editor');
    expect(TENANT_ROLES.VIEWER).toBe('viewer');
    expect(TENANT_ROLES.GUEST).toBe('guest');
  });

  test('should have comprehensive tenant permissions', () => {
    expect(TENANT_PERMISSIONS.MANAGE_USERS).toBe('tenant:manage_users');
    expect(TENANT_PERMISSIONS.INVITE_USERS).toBe('tenant:invite_users');
    expect(TENANT_PERMISSIONS.MANAGE_CONFIG).toBe('tenant:manage_config');
    expect(TENANT_PERMISSIONS.MANAGE_FEDERATION).toBe('tenant:manage_federation');
  });

  test('should have default permissions for each role', () => {
    expect(DEFAULT_TENANT_PERMISSIONS[TENANT_ROLES.OWNER]).toContain(TENANT_PERMISSIONS.MANAGE_USERS);
    expect(DEFAULT_TENANT_PERMISSIONS[TENANT_ROLES.ADMIN]).toContain(TENANT_PERMISSIONS.MANAGE_CONFIG);
    expect(DEFAULT_TENANT_PERMISSIONS[TENANT_ROLES.VIEWER]).toContain(TENANT_PERMISSIONS.VIEW_CONFIG);
    expect(DEFAULT_TENANT_PERMISSIONS[TENANT_ROLES.GUEST]).toEqual([]);
  });

  test('should have resource types defined', () => {
    expect(RESOURCE_TYPES.STORAGE_GB).toBe('storage_gb');
    expect(RESOURCE_TYPES.API_CALLS_PER_DAY).toBe('api_calls_per_day');
    expect(RESOURCE_TYPES.USERS).toBe('users');
    expect(RESOURCE_TYPES.SEARCH_REQUESTS_PER_HOUR).toBe('search_requests_per_hour');
    expect(RESOURCE_TYPES.FEDERATION_CONNECTIONS).toBe('federation_connections');
  });
});

describe('Schema Edge Cases', () => {
  test('should handle optional fields correctly', () => {
    const minimalTenant = TenantSchema.parse({
      id: '123e4567-e89b-12d3-a456-426614174000',
      name: 'Minimal Tenant',
      slug: 'minimal-tenant',
      display_name: 'Minimal Tenant',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z'
    });

    expect(minimalTenant.status).toBe('active');
    expect(minimalTenant.tier).toBe('standard');
    expect(minimalTenant.is_organization).toBe(true);
    expect(minimalTenant.federation_enabled).toBe(false);
  });

  test('should enforce UUID format for IDs', () => {
    expect(() => {
      TenantSchema.parse({
        id: 'not-a-uuid',
        name: 'Test',
        slug: 'test',
        display_name: 'Test',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z'
      });
    }).toThrow();
  });

  test('should enforce slug format', () => {
    expect(() => {
      CreateTenantRequestSchema.parse({
        name: 'Test',
        slug: 'Invalid Slug With Spaces!'
      });
    }).toThrow();

    expect(() => {
      CreateTenantRequestSchema.parse({
        name: 'Test',
        slug: 'valid-slug-123'
      });
    }).not.toThrow();
  });

  test('should enforce email format in tenant users', () => {
    expect(() => {
      TenantUserSchema.parse({
        id: '123e4567-e89b-12d3-a456-426614174000',
        tenant_id: '123e4567-e89b-12d3-a456-426614174001',
        user_id: 'user123',
        email: 'not-an-email',
        role: 'viewer',
        status: 'active',
        joined_at: '2024-01-01T00:00:00Z',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z'
      });
    }).toThrow();
  });
});