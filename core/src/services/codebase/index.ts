/**
 * Codebase Analysis Services
 * 
 * Services for analyzing codebases, discovering dependencies,
 * and recommending API documentation for unified search indexing.
 */

export { APIDocumentationDiscoveryService } from './api-documentation-discovery.js';
export type { APIDocumentationDiscoveryConfig } from './api-documentation-discovery.js';

export { DependencyAnalysisService } from './dependency-analysis-service.js';
export type { DependencyAnalysisResult } from './dependency-analysis-service.js';

export { 
  DocumentationFetcherFactory,
  NPMDocumentationFetcher,
  PyPIDocumentationFetcher,
  DocsRsDocumentationFetcher
} from './documentation-fetchers.js';