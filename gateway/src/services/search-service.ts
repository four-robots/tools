/**
 * Gateway Search Service Wrapper
 * 
 * Service wrapper that initializes and manages the UnifiedSearchService
 * within the gateway context, handling service dependencies and configuration.
 */

import { 
  UnifiedSearchService,
  createUnifiedSearchService,
  type UnifiedSearchConfig,
  MemoryService,
  KanbanService,
  WikiService,
  EnhancedScraperService
} from '@mcp-tools/core';

/**
 * Gateway search service configuration
 */
export interface GatewaySearchConfig {
  /** Enable search result caching */
  enableCaching?: boolean;
  /** Enable search analytics */
  enableAnalytics?: boolean;
  /** Search timeout in milliseconds */
  searchTimeoutMs?: number;
  /** Maximum results per page */
  maxResultsPerPage?: number;
  /** Cache configuration */
  cacheConfig?: {
    maxEntries?: number;
    defaultTtl?: number;
  };
}

/**
 * Gateway application locals interface (expected structure)
 */
export interface GatewayAppLocals {
  memoryService?: MemoryService;
  kanbanService?: KanbanService;
  wikiService?: WikiService;
  scraperService?: EnhancedScraperService;
}

/**
 * Service availability status
 */
export interface ServiceStatus {
  memory: boolean;
  kanban: boolean;
  wiki: boolean;
  scraper: boolean;
  totalAvailable: number;
}

/**
 * Create and configure a unified search service from gateway app locals
 */
export function createSearchService(
  appLocals: GatewayAppLocals,
  config: GatewaySearchConfig = {}
): UnifiedSearchService | null {
  try {
    console.log('🔍 Initializing unified search service...');
    
    // Check service availability
    const serviceStatus = checkServiceAvailability(appLocals);
    console.log(`📊 Service availability: ${serviceStatus.totalAvailable}/4 services available`);
    
    if (serviceStatus.totalAvailable === 0) {
      console.error('❌ No search services available');
      return null;
    }
    
    // Extract services from app locals
    const {
      memoryService,
      kanbanService,
      wikiService,
      scraperService
    } = appLocals;
    
    // Create mock services for unavailable ones to prevent null errors
    const effectiveMemoryService = memoryService || createMockMemoryService();
    const effectiveKanbanService = kanbanService || createMockKanbanService();
    const effectiveWikiService = wikiService || createMockWikiService();
    const effectiveScraperService = scraperService || createMockScraperService();
    
    // Build unified search configuration
    const searchConfig: UnifiedSearchConfig = {
      enableCaching: config.enableCaching ?? getConfigFromEnv('SEARCH_ENABLE_CACHING', true),
      enableAnalytics: config.enableAnalytics ?? getConfigFromEnv('SEARCH_ENABLE_ANALYTICS', true),
      maxSearchTimeoutMs: config.searchTimeoutMs ?? getConfigFromEnv('SEARCH_TIMEOUT_MS', 10000),
      maxResultsPerPage: config.maxResultsPerPage ?? getConfigFromEnv('SEARCH_MAX_RESULTS_PER_PAGE', 100),
      similarityThreshold: getConfigFromEnv('SEARCH_SIMILARITY_THRESHOLD', 0.8),
      cacheConfig: {
        maxEntries: config.cacheConfig?.maxEntries ?? getConfigFromEnv('SEARCH_CACHE_MAX_ENTRIES', 1000),
        defaultTtl: config.cacheConfig?.defaultTtl ?? getConfigFromEnv('SEARCH_CACHE_DEFAULT_TTL', 5 * 60 * 1000)
      }
    };
    
    console.log('⚙️ Search service configuration:', {
      caching: searchConfig.enableCaching,
      analytics: searchConfig.enableAnalytics,
      timeout: searchConfig.maxSearchTimeoutMs,
      services: serviceStatus
    });
    
    // Create the unified search service
    const unifiedSearchService = createUnifiedSearchService(
      effectiveMemoryService,
      effectiveKanbanService,
      effectiveWikiService,
      effectiveScraperService,
      searchConfig
    );
    
    console.log('✅ Unified search service initialized successfully');
    return unifiedSearchService;
    
  } catch (error) {
    console.error('❌ Failed to create unified search service:', error);
    return null;
  }
}

/**
 * Check which services are available
 */
function checkServiceAvailability(appLocals: GatewayAppLocals): ServiceStatus {
  const status: ServiceStatus = {
    memory: !!appLocals.memoryService,
    kanban: !!appLocals.kanbanService,
    wiki: !!appLocals.wikiService,
    scraper: !!appLocals.scraperService,
    totalAvailable: 0
  };
  
  status.totalAvailable = Object.values(status).filter(v => v === true).length;
  
  return status;
}

/**
 * Get configuration value from environment with fallback
 */
function getConfigFromEnv<T>(key: string, defaultValue: T): T {
  const envValue = process.env[key];
  
  if (!envValue) {
    return defaultValue;
  }
  
  // Handle different types
  if (typeof defaultValue === 'boolean') {
    return (envValue.toLowerCase() === 'true') as T;
  }
  
  if (typeof defaultValue === 'number') {
    const parsed = Number(envValue);
    return isNaN(parsed) ? defaultValue : parsed as T;
  }
  
  return envValue as T;
}

// ============================================================================
// Mock Services for Unavailable Dependencies
// ============================================================================

/**
 * Create a mock memory service that returns empty results
 */
function createMockMemoryService(): MemoryService {
  const mockService = {
    async search() {
      console.log('🧠 Memory service not available, returning empty results');
      return [];
    },
    async shutdown() {
      // No-op
    }
  };
  
  return mockService as any;
}

/**
 * Create a mock kanban service that returns empty results
 */
function createMockKanbanService(): KanbanService {
  const mockService = {
    async search() {
      console.log('📋 Kanban service not available, returning empty results');
      return [];
    },
    async shutdown() {
      // No-op
    }
  };
  
  return mockService as any;
}

/**
 * Create a mock wiki service that returns empty results
 */
function createMockWikiService(): WikiService {
  const mockService = {
    async search() {
      console.log('📚 Wiki service not available, returning empty results');
      return [];
    },
    async shutdown() {
      // No-op
    }
  };
  
  return mockService as any;
}

/**
 * Create a mock scraper service that returns empty results
 */
function createMockScraperService(): EnhancedScraperService {
  const mockService = {
    async searchScrapedContent() {
      console.log('🕸️ Scraper service not available, returning empty results');
      return { results: [], total: 0 };
    },
    async shutdown() {
      // No-op
    }
  };
  
  return mockService as any;
}

// ============================================================================
// Service Management Utilities
// ============================================================================

/**
 * Validate that required services are available for search functionality
 */
export function validateSearchServiceRequirements(appLocals: GatewayAppLocals): {
  isValid: boolean;
  missingServices: string[];
  warnings: string[];
} {
  const status = checkServiceAvailability(appLocals);
  const missingServices: string[] = [];
  const warnings: string[] = [];
  
  // Check for missing services
  if (!status.memory) missingServices.push('Memory Service');
  if (!status.kanban) missingServices.push('Kanban Service');
  if (!status.wiki) missingServices.push('Wiki Service');
  if (!status.scraper) missingServices.push('Scraper Service');
  
  // Generate warnings for partial availability
  if (missingServices.length > 0 && missingServices.length < 4) {
    warnings.push(
      `Some services unavailable: ${missingServices.join(', ')}. ` +
      `Search functionality will be limited.`
    );
  }
  
  return {
    isValid: status.totalAvailable > 0,
    missingServices,
    warnings
  };
}

/**
 * Get search service health status
 */
export function getSearchServiceHealth(unifiedService: UnifiedSearchService | null): {
  status: 'healthy' | 'degraded' | 'unhealthy';
  details: {
    service_available: boolean;
    cache_enabled: boolean;
    analytics_enabled: boolean;
    cache_stats?: any;
  };
} {
  if (!unifiedService) {
    return {
      status: 'unhealthy',
      details: {
        service_available: false,
        cache_enabled: false,
        analytics_enabled: false
      }
    };
  }
  
  let cacheStats = null;
  let cacheEnabled = false;
  
  try {
    cacheStats = unifiedService.getCacheStats();
    cacheEnabled = true;
  } catch {
    // Cache not enabled
  }
  
  const details = {
    service_available: true,
    cache_enabled: cacheEnabled,
    analytics_enabled: true, // Assume enabled if service exists
    cache_stats: cacheStats
  };
  
  return {
    status: 'healthy',
    details
  };
}

export default {
  createSearchService,
  validateSearchServiceRequirements,
  getSearchServiceHealth
};