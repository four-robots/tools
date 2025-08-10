/**
 * Dynamic Facet Services Index
 * 
 * Exports all dynamic facet generation and management services.
 */

export { FacetDiscoveryEngine } from './facet-discovery-engine.js';
export { DynamicFacetService } from './dynamic-facet-service.js';
export { FacetFilterEngine } from './facet-filter-engine.js';
export { FacetStatisticsService } from './facet-statistics-service.js';
export { FacetCacheManager } from './facet-cache-manager.js';

export type {
  FacetDiscoveryOptions,
  FieldAnalysis
} from './facet-discovery-engine.js';

export type {
  DynamicFacetServiceOptions,
  FacetCounts
} from './dynamic-facet-service.js';

export type {
  FilterEngineOptions,
  FilterStatistics
} from './facet-filter-engine.js';

export type {
  StatisticsServiceOptions,
  FacetValueStatistics,
  GlobalFacetStatistics
} from './facet-statistics-service.js';

export type {
  CacheManagerOptions,
  CacheEntry,
  CacheStatistics
} from './facet-cache-manager.js';

// Re-export key types from shared types for convenience
export type {
  RangeBucket,
  FacetLevel
} from '@shared/types/dynamic-facets.js';