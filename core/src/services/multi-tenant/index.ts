/**
 * Multi-tenant Services Index
 * 
 * Exports all multi-tenant services for easy import and usage
 * throughout the MCP Tools system.
 * 
 * Part of Work Item 4.2.1 - Multi-tenant Search Infrastructure
 */

export { TenantManagementService } from './tenant-management-service.js';
export { TenantAuthenticationService } from './tenant-authentication-service.js';
export { CrossTenantFederationService } from './cross-tenant-federation-service.js';
export { TenantResourceService } from './tenant-resource-service.js';
export { 
  TenantServiceFactory, 
  TenantAwareServiceWrapper,
  TenantAwareKanbanService,
  TenantAwareWikiService,
  TenantAwareMemoryService,
  getTenantAwareService,
  getCrossTenantService
} from './tenant-service-factory.js';

// Re-export types for convenience
export * from '../../shared/types/multi-tenant.js';