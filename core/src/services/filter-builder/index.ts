/**
 * Filter Builder Service Exports
 * 
 * Comprehensive filter building system with:
 * - Visual query builder with drag-and-drop
 * - Boolean logic operators (AND, OR, NOT)
 * - Nested filter groups
 * - Filter templates and presets
 * - Query validation and optimization
 * - Multi-target query generation (SQL, Elasticsearch, MongoDB)
 */

export { QueryBuilderService } from './query-builder-service.js';
export type { QueryBuilderServiceOptions } from './query-builder-service.js';

export { FilterTreeBuilder } from './filter-tree-builder.js';
export type { FilterTreeBuilderOptions } from './filter-tree-builder.js';

export { FilterValidator } from './filter-validator.js';
export type { ValidationRule, ValidationResult, OptimizationRule } from './filter-validator.js';

export { FilterExecutor } from './filter-executor.js';
export type { ExecutionContext } from './filter-executor.js';

// Re-export all filter builder types for convenience
export * from '../../shared/types/filter-builder.js';