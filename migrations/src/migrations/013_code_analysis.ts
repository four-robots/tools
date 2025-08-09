/**
 * Code Analysis Migration
 * 
 * This migration creates comprehensive tables for code parsing and analysis,
 * supporting AST caching, symbol extraction, and dependency analysis across
 * multiple programming languages.
 * 
 * Key Features:
 * - Multi-language AST parsing with caching
 * - Symbol extraction (functions, classes, variables, etc.)
 * - Dependency analysis with import/require tracking
 * - Code complexity metrics and analysis
 * - Performance optimized with strategic indexing
 * 
 * Created: January 2025
 * Part of: Phase 2 Codebase Analysis System - Work Item 2.2.2
 */

import { Kysely, sql } from 'kysely';
import type { Migration } from 'kysely';
import { logger } from '../utils/logger.js';

export const codeAnalysis: Migration = {
  async up(db: Kysely<any>): Promise<void> {
    logger.info('Running migration: 013_code_analysis (up)');
    logger.info('Creating code analysis schema...');

    // ===================
    // AST CACHE TABLE
    // ===================

    // AST cache table - stores parsed AST data with symbols and metrics
    await db.schema
      .createTable('ast_cache')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('file_id', 'uuid', (col) => col.notNull().references('code_files.id').onDelete('cascade'))
      .addColumn('language', 'varchar(50)', (col) => col.notNull())
      .addColumn('ast_data', 'jsonb', (col) => col.notNull())
      .addColumn('symbols', 'jsonb', (col) => col.notNull()) // Extracted symbols summary
      .addColumn('dependencies', 'text[]', (col) => col.defaultTo(sql`'{}'::text[]`)) // Import/include statements
      .addColumn('complexity_metrics', 'jsonb') // Cyclomatic complexity, lines of code, etc.
      .addColumn('parse_version', 'varchar(20)', (col) => col.notNull()) // Parser version for cache invalidation
      .addColumn('parse_time_ms', 'integer') // Time taken to parse
      .addColumn('file_hash', 'varchar(64)') // SHA-256 hash for cache invalidation
      .addColumn('created_at', 'timestamptz', (col) => col.defaultTo(sql`now()`))
      .addColumn('updated_at', 'timestamptz', (col) => col.defaultTo(sql`now()`))
      .execute();

    // ===================
    // CODE SYMBOLS TABLE
    // ===================

    // Code symbols table - detailed symbol information
    await db.schema
      .createTable('code_symbols')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('file_id', 'uuid', (col) => col.notNull().references('code_files.id').onDelete('cascade'))
      .addColumn('repository_id', 'uuid', (col) => col.notNull().references('code_repositories.id').onDelete('cascade'))
      .addColumn('name', 'varchar(255)', (col) => col.notNull())
      .addColumn('symbol_type', 'varchar(50)', (col) => col.notNull()) // function, class, variable, interface, etc.
      .addColumn('language', 'varchar(50)', (col) => col.notNull())
      .addColumn('definition_line', 'integer')
      .addColumn('definition_column', 'integer')
      .addColumn('end_line', 'integer')
      .addColumn('end_column', 'integer')
      .addColumn('visibility', 'varchar(20)') // public, private, protected
      .addColumn('parameters', 'jsonb') // Function parameters with types
      .addColumn('return_type', 'varchar(255)')
      .addColumn('description', 'text') // JSDoc/docstring content
      .addColumn('is_exported', 'boolean', (col) => col.defaultTo(false))
      .addColumn('is_async', 'boolean', (col) => col.defaultTo(false))
      .addColumn('is_generator', 'boolean', (col) => col.defaultTo(false))
      .addColumn('is_static', 'boolean', (col) => col.defaultTo(false))
      .addColumn('parent_symbol_id', 'uuid', (col) => col.references('code_symbols.id').onDelete('set null')) // For nested symbols
      .addColumn('scope', 'varchar(100)') // global, module, class, function
      .addColumn('decorators', 'jsonb') // TypeScript/Python decorators
      .addColumn('generic_parameters', 'jsonb') // Generic type parameters
      .addColumn('created_at', 'timestamptz', (col) => col.defaultTo(sql`now()`))
      .addColumn('updated_at', 'timestamptz', (col) => col.defaultTo(sql`now()`))
      .execute();

    // ===================
    // CODE DEPENDENCIES TABLE
    // ===================

    // Code dependencies table - import/require/include analysis
    await db.schema
      .createTable('code_dependencies')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('file_id', 'uuid', (col) => col.notNull().references('code_files.id').onDelete('cascade'))
      .addColumn('repository_id', 'uuid', (col) => col.notNull().references('code_repositories.id').onDelete('cascade'))
      .addColumn('dependency_type', 'varchar(50)', (col) => col.notNull()) // import, require, include, using
      .addColumn('dependency_path', 'varchar(500)', (col) => col.notNull())
      .addColumn('imported_symbols', 'text[]') // Specific imports like { useState, useEffect }
      .addColumn('alias', 'varchar(255)') // import alias
      .addColumn('is_external', 'boolean', (col) => col.defaultTo(false)) // External package vs internal file
      .addColumn('is_type_only', 'boolean', (col) => col.defaultTo(false)) // TypeScript type-only imports
      .addColumn('dependency_version', 'varchar(100)') // For external packages
      .addColumn('resolved_path', 'text') // Resolved absolute path
      .addColumn('line_number', 'integer') // Line where dependency is declared
      .addColumn('column_number', 'integer') // Column where dependency is declared
      .addColumn('created_at', 'timestamptz', (col) => col.defaultTo(sql`now()`))
      .execute();

    // ===================
    // PERFORMANCE INDEXES
    // ===================

    logger.info('Creating code analysis indexes...');

    // AST cache indexes
    await db.schema
      .createIndex('idx_ast_cache_file')
      .on('ast_cache')
      .column('file_id')
      .execute();

    await db.schema
      .createIndex('idx_ast_cache_language')
      .on('ast_cache')
      .column('language')
      .execute();

    await db.schema
      .createIndex('idx_ast_cache_hash')
      .on('ast_cache')
      .column('file_hash')
      .execute();

    await db.schema
      .createIndex('idx_ast_cache_created')
      .on('ast_cache')
      .columns(['created_at desc'])
      .execute();

    // Unique constraint for file cache
    await db.schema
      .createIndex('unique_ast_cache_file')
      .on('ast_cache')
      .column('file_id')
      .unique()
      .execute();

    // Code symbols indexes
    await db.schema
      .createIndex('idx_code_symbols_file')
      .on('code_symbols')
      .column('file_id')
      .execute();

    await db.schema
      .createIndex('idx_code_symbols_repo')
      .on('code_symbols')
      .column('repository_id')
      .execute();

    await db.schema
      .createIndex('idx_code_symbols_name')
      .on('code_symbols')
      .column('name')
      .execute();

    await db.schema
      .createIndex('idx_code_symbols_type')
      .on('code_symbols')
      .column('symbol_type')
      .execute();

    await db.schema
      .createIndex('idx_code_symbols_language')
      .on('code_symbols')
      .column('language')
      .execute();

    await db.schema
      .createIndex('idx_code_symbols_parent')
      .on('code_symbols')
      .column('parent_symbol_id')
      .execute();

    await db.schema
      .createIndex('idx_code_symbols_exported')
      .on('code_symbols')
      .column('is_exported')
      .execute();

    await db.schema
      .createIndex('idx_code_symbols_visibility')
      .on('code_symbols')
      .column('visibility')
      .execute();

    await db.schema
      .createIndex('idx_code_symbols_scope')
      .on('code_symbols')
      .column('scope')
      .execute();

    // Composite index for symbol search
    await db.schema
      .createIndex('idx_code_symbols_search')
      .on('code_symbols')
      .columns(['repository_id', 'symbol_type', 'name'])
      .execute();

    // Code dependencies indexes
    await db.schema
      .createIndex('idx_code_dependencies_file')
      .on('code_dependencies')
      .column('file_id')
      .execute();

    await db.schema
      .createIndex('idx_code_dependencies_repo')
      .on('code_dependencies')
      .column('repository_id')
      .execute();

    await db.schema
      .createIndex('idx_code_dependencies_path')
      .on('code_dependencies')
      .column('dependency_path')
      .execute();

    await db.schema
      .createIndex('idx_code_dependencies_type')
      .on('code_dependencies')
      .column('dependency_type')
      .execute();

    await db.schema
      .createIndex('idx_code_dependencies_external')
      .on('code_dependencies')
      .column('is_external')
      .execute();

    await db.schema
      .createIndex('idx_code_dependencies_resolved')
      .on('code_dependencies')
      .column('resolved_path')
      .execute();

    // Composite index for dependency analysis
    await db.schema
      .createIndex('idx_code_dependencies_analysis')
      .on('code_dependencies')
      .columns(['repository_id', 'is_external', 'dependency_path'])
      .execute();

    logger.info('Migration 013_code_analysis completed successfully');
    logger.info('Code analysis schema created with comprehensive indexing');
  },

  async down(db: Kysely<any>): Promise<void> {
    logger.info('Running migration: 013_code_analysis (down)');
    logger.info('Dropping code analysis schema...');

    // Drop indexes first
    const indexes = [
      'idx_code_dependencies_analysis',
      'idx_code_dependencies_resolved',
      'idx_code_dependencies_external',
      'idx_code_dependencies_type',
      'idx_code_dependencies_path',
      'idx_code_dependencies_repo',
      'idx_code_dependencies_file',
      'idx_code_symbols_search',
      'idx_code_symbols_scope',
      'idx_code_symbols_visibility',
      'idx_code_symbols_exported',
      'idx_code_symbols_parent',
      'idx_code_symbols_language',
      'idx_code_symbols_type',
      'idx_code_symbols_name',
      'idx_code_symbols_repo',
      'idx_code_symbols_file',
      'unique_ast_cache_file',
      'idx_ast_cache_created',
      'idx_ast_cache_hash',
      'idx_ast_cache_language',
      'idx_ast_cache_file'
    ];

    for (const index of indexes) {
      await db.schema.dropIndex(index).ifExists().execute();
    }

    // Drop tables in reverse dependency order
    await db.schema.dropTable('code_dependencies').ifExists().execute();
    await db.schema.dropTable('code_symbols').ifExists().execute();
    await db.schema.dropTable('ast_cache').ifExists().execute();

    logger.info('Migration 013_code_analysis rollback completed');
  }
};