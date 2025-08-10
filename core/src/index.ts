/**
 * MCP Tools Core Library
 * 
 * Shared services and utilities for the MCP Tools ecosystem
 */

// Export all service modules
export * from './services/kanban/index.js';
export * from './services/memory/index.js';
export * from './services/memory-processing/index.js';
export * from './services/wiki/index.js';
export * from './services/scraper/index.js';
export * from './services/chunking/index.js';
export * from './services/unified-search/index.js';
export * from './services/codebase/index.js';
export * from './services/nlp/index.js';
export * from './services/ai-summaries/index.js';
export * from './services/dynamic-facets/index.js';
export * from './services/filter-builder/index.js';
// Temporarily disabled quality service due to glob import issues
// export * from './services/quality/index.js';

// Export shared types
export * from './shared/types/index.js';

// Export shared utilities with explicit naming to avoid conflicts
export type { 
  DatabaseConfig as CoreDatabaseConfig 
} from './utils/database.js';
export { 
  createDatabaseConfig 
} from './utils/database.js';
export { 
  ValidationError as CoreValidationError,
  validateInput 
} from './utils/validation.js';

// Note: shared types are exported separately to avoid naming conflicts