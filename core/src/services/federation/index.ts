/**
 * Federation Protocol Services Index
 * 
 * Exports all federation protocol services for cross-organization
 * collaboration and distributed search capabilities.
 * 
 * Part of Work Item 4.2.2 - Federation Protocol Implementation
 */

export { FederationProtocolService } from './federation-protocol-service.js';
export { DistributedSearchOrchestrator } from './distributed-search-orchestrator.js';
export { ContentSyndicationService } from './content-syndication-service.js';
export { FederationSecurityManager } from './federation-security-manager.js';
export { FederationComplianceService } from './federation-compliance-service.js';
export { FederationNodeRegistry } from './federation-node-registry.js';
export { FederationPerformanceMonitor } from './federation-performance-monitor.js';
export { FederationManagementService } from './federation-management-api.js';

// Re-export types for convenience
export * from '../../shared/types/federation.js';