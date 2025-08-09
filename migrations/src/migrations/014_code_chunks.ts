/**
 * Code Chunking Strategy Migration
 * 
 * This migration creates comprehensive tables for intelligent code chunking,
 * supporting semantic code segmentation, context preservation, and chunk
 * relationship mapping across multiple programming languages.
 * 
 * Key Features:
 * - Multi-strategy code chunking (function, class, block, semantic)
 * - Context preservation with overlapping chunks
 * - Chunk relationship mapping and dependency tracking
 * - Hierarchical chunk organization with parent-child relationships
 * - Performance optimized with strategic indexing and deduplication
 * 
 * Created: January 2025
 * Part of: Phase 2 Codebase Analysis System - Work Item 2.3.1
 */

import { Kysely, sql } from 'kysely';
import type { Migration } from 'kysely';
import { logger } from '../utils/logger.js';

export const codeChunks: Migration = {
  async up(db: Kysely<any>): Promise<void> {
    logger.info('Running migration: 014_code_chunks (up)');
    logger.info('Creating code chunking schema...');

    // ===================
    // CODE CHUNKS TABLE
    // ===================

    // Main code chunks table - stores intelligent code segments
    await db.schema
      .createTable('code_chunks')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('file_id', 'uuid', (col) => col.notNull().references('code_files.id').onDelete('cascade'))
      .addColumn('repository_id', 'uuid', (col) => col.notNull().references('code_repositories.id').onDelete('cascade'))
      .addColumn('chunk_type', 'varchar(50)', (col) => col.notNull()) // function, class, block, method, variable, comment
      .addColumn('chunk_index', 'integer', (col) => col.notNull()) // Order within the file
      .addColumn('start_line', 'integer', (col) => col.notNull())
      .addColumn('end_line', 'integer', (col) => col.notNull())
      .addColumn('start_column', 'integer')
      .addColumn('end_column', 'integer')
      .addColumn('content', 'text', (col) => col.notNull())
      .addColumn('content_hash', 'varchar(64)', (col) => col.notNull()) // SHA-256 of content for deduplication
      .addColumn('language', 'varchar(50)', (col) => col.notNull())
      .addColumn('symbol_name', 'varchar(255)') // Function/class name if applicable
      .addColumn('symbol_type', 'varchar(50)') // function, class, method, variable, etc.
      .addColumn('parent_chunk_id', 'uuid', (col) => col.references('code_chunks.id').onDelete('set null')) // For nested chunks
      .addColumn('context_before', 'text') // Lines before for context
      .addColumn('context_after', 'text') // Lines after for context
      .addColumn('metadata', 'jsonb', (col) => col.defaultTo(sql`'{}'::jsonb`)) // Custom metadata (complexity, dependencies, etc.)
      .addColumn('created_at', 'timestamptz', (col) => col.defaultTo(sql`now()`))
      .addColumn('updated_at', 'timestamptz', (col) => col.defaultTo(sql`now()`))
      .execute();

    // ===================
    // CHUNK RELATIONSHIPS TABLE
    // ===================

    // Chunk relationships table - tracks dependencies and connections between chunks
    await db.schema
      .createTable('chunk_relationships')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('source_chunk_id', 'uuid', (col) => col.notNull().references('code_chunks.id').onDelete('cascade'))
      .addColumn('target_chunk_id', 'uuid', (col) => col.notNull().references('code_chunks.id').onDelete('cascade'))
      .addColumn('relationship_type', 'varchar(50)', (col) => col.notNull()) // calls, imports, extends, implements, references
      .addColumn('strength', 'decimal(3,2)', (col) => col.defaultTo(0.0)) // Relationship strength (0.0-1.0)
      .addColumn('line_references', 'text[]', (col) => col.defaultTo(sql`'{}'::text[]`)) // Specific line numbers where relationship occurs
      .addColumn('created_at', 'timestamptz', (col) => col.defaultTo(sql`now()`))
      .execute();

    // ===================
    // CHUNKING STRATEGIES TABLE
    // ===================

    // Chunking strategies table - stores configuration for different chunking approaches
    await db.schema
      .createTable('chunking_strategies')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('name', 'varchar(100)', (col) => col.notNull().unique())
      .addColumn('description', 'text')
      .addColumn('language', 'varchar(50)') // Specific language or null for universal
      .addColumn('strategy_config', 'jsonb', (col) => col.notNull()) // Configuration parameters
      .addColumn('default_options', 'jsonb', (col) => col.defaultTo(sql`'{}'::jsonb`)) // Default chunking options
      .addColumn('is_active', 'boolean', (col) => col.defaultTo(true))
      .addColumn('created_at', 'timestamptz', (col) => col.defaultTo(sql`now()`))
      .addColumn('updated_at', 'timestamptz', (col) => col.defaultTo(sql`now()`))
      .execute();

    // ===================
    // CHUNK EMBEDDINGS TABLE
    // ===================

    // Chunk embeddings table - stores vector embeddings for semantic search
    await db.schema
      .createTable('chunk_embeddings')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('chunk_id', 'uuid', (col) => col.notNull().references('code_chunks.id').onDelete('cascade'))
      .addColumn('embedding_model', 'varchar(100)', (col) => col.notNull()) // Model used to generate embedding
      .addColumn('embedding_vector', 'vector(1536)') // Vector embedding (dimension depends on model)
      .addColumn('embedding_metadata', 'jsonb', (col) => col.defaultTo(sql`'{}'::jsonb`)) // Embedding generation metadata
      .addColumn('created_at', 'timestamptz', (col) => col.defaultTo(sql`now()`))
      .execute();

    // ===================
    // PERFORMANCE INDEXES
    // ===================

    logger.info('Creating code chunks indexes...');

    // Code chunks indexes
    await db.schema
      .createIndex('idx_code_chunks_file')
      .on('code_chunks')
      .column('file_id')
      .execute();

    await db.schema
      .createIndex('idx_code_chunks_repo')
      .on('code_chunks')
      .column('repository_id')
      .execute();

    await db.schema
      .createIndex('idx_code_chunks_type')
      .on('code_chunks')
      .column('chunk_type')
      .execute();

    await db.schema
      .createIndex('idx_code_chunks_symbol_name')
      .on('code_chunks')
      .column('symbol_name')
      .execute();

    await db.schema
      .createIndex('idx_code_chunks_content_hash')
      .on('code_chunks')
      .column('content_hash')
      .execute();

    await db.schema
      .createIndex('idx_code_chunks_start_line')
      .on('code_chunks')
      .column('start_line')
      .execute();

    await db.schema
      .createIndex('idx_code_chunks_language')
      .on('code_chunks')
      .column('language')
      .execute();

    await db.schema
      .createIndex('idx_code_chunks_parent')
      .on('code_chunks')
      .column('parent_chunk_id')
      .execute();

    await db.schema
      .createIndex('idx_code_chunks_created')
      .on('code_chunks')
      .columns(['created_at desc'])
      .execute();

    // Composite index for chunk search
    await db.schema
      .createIndex('idx_code_chunks_search')
      .on('code_chunks')
      .columns(['repository_id', 'chunk_type', 'language'])
      .execute();

    // Composite index for file chunks ordering
    await db.schema
      .createIndex('idx_code_chunks_file_order')
      .on('code_chunks')
      .columns(['file_id', 'chunk_index'])
      .execute();

    // Chunk relationships indexes
    await db.schema
      .createIndex('idx_chunk_relationships_source')
      .on('chunk_relationships')
      .column('source_chunk_id')
      .execute();

    await db.schema
      .createIndex('idx_chunk_relationships_target')
      .on('chunk_relationships')
      .column('target_chunk_id')
      .execute();

    await db.schema
      .createIndex('idx_chunk_relationships_type')
      .on('chunk_relationships')
      .column('relationship_type')
      .execute();

    await db.schema
      .createIndex('idx_chunk_relationships_strength')
      .on('chunk_relationships')
      .columns(['strength desc'])
      .execute();

    // Unique constraint for chunk relationships
    await db.schema
      .createIndex('unique_chunk_relationship')
      .on('chunk_relationships')
      .columns(['source_chunk_id', 'target_chunk_id', 'relationship_type'])
      .unique()
      .execute();

    // Chunking strategies indexes
    await db.schema
      .createIndex('idx_chunking_strategies_name')
      .on('chunking_strategies')
      .column('name')
      .execute();

    await db.schema
      .createIndex('idx_chunking_strategies_language')
      .on('chunking_strategies')
      .column('language')
      .execute();

    await db.schema
      .createIndex('idx_chunking_strategies_active')
      .on('chunking_strategies')
      .column('is_active')
      .execute();

    // Chunk embeddings indexes
    await db.schema
      .createIndex('idx_chunk_embeddings_chunk')
      .on('chunk_embeddings')
      .column('chunk_id')
      .execute();

    await db.schema
      .createIndex('idx_chunk_embeddings_model')
      .on('chunk_embeddings')
      .column('embedding_model')
      .execute();

    // Unique constraint for chunk embeddings per model
    await db.schema
      .createIndex('unique_chunk_embedding_model')
      .on('chunk_embeddings')
      .columns(['chunk_id', 'embedding_model'])
      .unique()
      .execute();

    // ===================
    // DEFAULT CHUNKING STRATEGIES
    // ===================

    logger.info('Inserting default chunking strategies...');

    // Insert default chunking strategies
    await db
      .insertInto('chunking_strategies')
      .values([
        {
          name: 'typescript_intelligent',
          description: 'Intelligent TypeScript/JavaScript chunking by functions, classes, and interfaces',
          language: 'typescript',
          strategy_config: JSON.stringify({
            chunkByFunctions: true,
            chunkByClasses: true,
            chunkByInterfaces: true,
            includeJSDoc: true,
            preserveImports: true,
            maxChunkSize: 2000,
            minChunkSize: 50,
            overlapLines: 5
          }),
          default_options: JSON.stringify({
            contextLines: 3,
            includeComments: true,
            preserveStructure: true
          })
        },
        {
          name: 'python_intelligent',
          description: 'Intelligent Python chunking by functions, classes, and docstrings',
          language: 'python',
          strategy_config: JSON.stringify({
            chunkByFunctions: true,
            chunkByClasses: true,
            includeDocstrings: true,
            preserveImports: true,
            maxChunkSize: 2000,
            minChunkSize: 50,
            overlapLines: 5
          }),
          default_options: JSON.stringify({
            contextLines: 3,
            includeComments: true,
            preserveStructure: true
          })
        },
        {
          name: 'java_intelligent',
          description: 'Intelligent Java chunking by methods, classes, and packages',
          language: 'java',
          strategy_config: JSON.stringify({
            chunkByMethods: true,
            chunkByClasses: true,
            includeAnnotations: true,
            preservePackages: true,
            maxChunkSize: 2500,
            minChunkSize: 100,
            overlapLines: 5
          }),
          default_options: JSON.stringify({
            contextLines: 3,
            includeComments: true,
            preserveStructure: true
          })
        },
        {
          name: 'universal_size_based',
          description: 'Universal size-based chunking with configurable overlap',
          language: null,
          strategy_config: JSON.stringify({
            strategy: 'size_based',
            maxChunkSize: 1500,
            minChunkSize: 200,
            overlapLines: 10,
            respectLineBreaks: true
          }),
          default_options: JSON.stringify({
            contextLines: 2,
            preserveIndentation: true
          })
        }
      ])
      .execute();

    logger.info('Migration 014_code_chunks completed successfully');
    logger.info('Code chunking schema created with comprehensive indexing and default strategies');
  },

  async down(db: Kysely<any>): Promise<void> {
    logger.info('Running migration: 014_code_chunks (down)');
    logger.info('Dropping code chunking schema...');

    // Drop indexes first
    const indexes = [
      'unique_chunk_embedding_model',
      'idx_chunk_embeddings_model',
      'idx_chunk_embeddings_chunk',
      'idx_chunking_strategies_active',
      'idx_chunking_strategies_language',
      'idx_chunking_strategies_name',
      'unique_chunk_relationship',
      'idx_chunk_relationships_strength',
      'idx_chunk_relationships_type',
      'idx_chunk_relationships_target',
      'idx_chunk_relationships_source',
      'idx_code_chunks_file_order',
      'idx_code_chunks_search',
      'idx_code_chunks_created',
      'idx_code_chunks_parent',
      'idx_code_chunks_language',
      'idx_code_chunks_start_line',
      'idx_code_chunks_content_hash',
      'idx_code_chunks_symbol_name',
      'idx_code_chunks_type',
      'idx_code_chunks_repo',
      'idx_code_chunks_file'
    ];

    for (const index of indexes) {
      await db.schema.dropIndex(index).ifExists().execute();
    }

    // Drop tables in reverse dependency order
    await db.schema.dropTable('chunk_embeddings').ifExists().execute();
    await db.schema.dropTable('chunk_relationships').ifExists().execute();
    await db.schema.dropTable('chunking_strategies').ifExists().execute();
    await db.schema.dropTable('code_chunks').ifExists().execute();

    logger.info('Migration 014_code_chunks rollback completed');
  }
};