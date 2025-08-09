/**
 * Code Embeddings & Semantic Search Migration - Work Item 2.3.2
 * 
 * This migration extends the existing chunk_embeddings table with comprehensive
 * semantic search capabilities, multiple embedding models, and advanced search
 * features including cross-language search, intent-based search, and caching.
 * 
 * Key Features:
 * - Multiple embedding models (CodeBERT, GraphCodeBERT, UniXcoder)
 * - Enhanced embeddings table with confidence scores and metadata
 * - Semantic search cache for performance optimization
 * - pgvector extension for efficient vector similarity search
 * - Cross-language and intent-based search support
 * 
 * Created: January 2025
 * Part of: Phase 2 Codebase Analysis System - Work Item 2.3.2
 */

import { Kysely, sql } from 'kysely';
import type { Migration } from 'kysely';
import { logger } from '../utils/logger.js';

export const codeEmbeddingsSemanticSearch: Migration = {
  async up(db: Kysely<any>): Promise<void> {
    logger.info('Running migration: 015_code_embeddings_semantic_search (up)');
    logger.info('Extending code embeddings with semantic search capabilities...');

    // ===================
    // ENABLE PGVECTOR EXTENSION
    // ===================
    
    logger.info('Enabling pgvector extension for vector similarity search...');
    
    try {
      await db.executeQuery(sql`CREATE EXTENSION IF NOT EXISTS vector`.compile(db));
      logger.info('Successfully enabled pgvector extension');
    } catch (error) {
      logger.warn('pgvector extension may already exist or require manual installation');
      logger.warn('Run: CREATE EXTENSION vector; as superuser if needed');
    }

    // ===================
    // MODIFY EXISTING CHUNK_EMBEDDINGS TABLE
    // ===================

    logger.info('Extending existing chunk_embeddings table...');

    // Drop the existing embedding_vector column and recreate with proper dimensions
    await db.executeQuery(sql`ALTER TABLE chunk_embeddings DROP COLUMN IF EXISTS embedding_vector CASCADE`.compile(db));
    
    // Add new columns to existing chunk_embeddings table
    await db.schema
      .alterTable('chunk_embeddings')
      .addColumn('model_version', 'varchar(50)', (col) => col.notNull().defaultTo('1.0'))
      .addColumn('embedding_vector', 'vector(768)', (col) => col) // CodeBERT default dimension
      .addColumn('confidence_score', 'decimal(3,2)', (col) => col.defaultTo(0.0))
      .addColumn('updated_at', 'timestamptz', (col) => col.defaultTo(sql`now()`))
      .execute();

    // Rename embedding_model to model_name for consistency
    await db.executeQuery(sql`ALTER TABLE chunk_embeddings RENAME COLUMN embedding_model TO model_name`.compile(db));

    // ===================
    // CREATE SEMANTIC SEARCH CACHE TABLE
    // ===================

    logger.info('Creating semantic search cache table...');

    await db.schema
      .createTable('semantic_search_cache')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('query_hash', 'varchar(64)', (col) => col.notNull().unique()) // SHA-256 of normalized query
      .addColumn('query_text', 'text', (col) => col.notNull())
      .addColumn('query_type', 'varchar(50)', (col) => col.notNull()) // code, natural_language, structural, intent, pattern
      .addColumn('search_params', 'jsonb', (col) => col.notNull()) // Search parameters and filters
      .addColumn('results', 'jsonb', (col) => col.notNull()) // Cached search results
      .addColumn('model_used', 'varchar(100)', (col) => col.notNull())
      .addColumn('hit_count', 'integer', (col) => col.defaultTo(1))
      .addColumn('last_accessed', 'timestamptz', (col) => col.defaultTo(sql`now()`))
      .addColumn('created_at', 'timestamptz', (col) => col.defaultTo(sql`now()`))
      .execute();

    // ===================
    // CREATE EMBEDDING MODELS TABLE
    // ===================

    logger.info('Creating embedding models configuration table...');

    await db.schema
      .createTable('embedding_models')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('name', 'varchar(100)', (col) => col.notNull().unique())
      .addColumn('display_name', 'varchar(200)', (col) => col.notNull())
      .addColumn('description', 'text')
      .addColumn('model_type', 'varchar(50)', (col) => col.notNull()) // codebert, graphcodebert, unixcoder, custom
      .addColumn('embedding_dimension', 'integer', (col) => col.notNull())
      .addColumn('supported_languages', 'text[]', (col) => col.defaultTo(sql`'{}'::text[]`))
      .addColumn('model_config', 'jsonb', (col) => col.defaultTo(sql`'{}'::jsonb`)) // Model-specific configuration
      .addColumn('api_endpoint', 'varchar(500)') // For remote models
      .addColumn('local_path', 'varchar(500)') // For local models
      .addColumn('is_active', 'boolean', (col) => col.defaultTo(true))
      .addColumn('is_default', 'boolean', (col) => col.defaultTo(false))
      .addColumn('performance_metrics', 'jsonb', (col) => col.defaultTo(sql`'{}'::jsonb`))
      .addColumn('created_at', 'timestamptz', (col) => col.defaultTo(sql`now()`))
      .addColumn('updated_at', 'timestamptz', (col) => col.defaultTo(sql`now()`))
      .execute();

    // ===================
    // CREATE CROSS-LANGUAGE MAPPINGS TABLE
    // ===================

    logger.info('Creating cross-language equivalence mappings table...');

    await db.schema
      .createTable('cross_language_mappings')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('source_chunk_id', 'uuid', (col) => col.notNull().references('code_chunks.id').onDelete('cascade'))
      .addColumn('target_chunk_id', 'uuid', (col) => col.notNull().references('code_chunks.id').onDelete('cascade'))
      .addColumn('source_language', 'varchar(50)', (col) => col.notNull())
      .addColumn('target_language', 'varchar(50)', (col) => col.notNull())
      .addColumn('similarity_score', 'decimal(5,4)', (col) => col.notNull()) // 0.0000 to 1.0000
      .addColumn('mapping_type', 'varchar(50)', (col) => col.notNull()) // equivalent, similar, translated
      .addColumn('confidence_level', 'varchar(20)', (col) => col.notNull().defaultTo('medium')) // low, medium, high
      .addColumn('verified_by_human', 'boolean', (col) => col.defaultTo(false))
      .addColumn('model_used', 'varchar(100)', (col) => col.notNull())
      .addColumn('created_at', 'timestamptz', (col) => col.defaultTo(sql`now()`))
      .execute();

    // ===================
    // CREATE SEARCH ANALYTICS TABLE
    // ===================

    logger.info('Creating search analytics table...');

    await db.schema
      .createTable('search_analytics')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('search_session', 'uuid', (col) => col.notNull())
      .addColumn('query_text', 'text', (col) => col.notNull())
      .addColumn('query_type', 'varchar(50)', (col) => col.notNull())
      .addColumn('model_used', 'varchar(100)', (col) => col.notNull())
      .addColumn('result_count', 'integer', (col) => col.notNull())
      .addColumn('search_time_ms', 'integer', (col) => col.notNull())
      .addColumn('user_id', 'uuid') // Optional user tracking
      .addColumn('repository_id', 'uuid', (col) => col.references('code_repositories.id').onDelete('set null'))
      .addColumn('filters_applied', 'jsonb', (col) => col.defaultTo(sql`'{}'::jsonb`))
      .addColumn('clicked_results', 'uuid[]', (col) => col.defaultTo(sql`'{}'::uuid[]`)) // Array of clicked chunk IDs
      .addColumn('search_success', 'boolean', (col) => col.defaultTo(true))
      .addColumn('created_at', 'timestamptz', (col) => col.defaultTo(sql`now()`))
      .execute();

    // ===================
    // PERFORMANCE INDEXES
    // ===================

    logger.info('Creating performance indexes for semantic search...');

    // Enhanced chunk_embeddings indexes
    await db.schema
      .createIndex('idx_chunk_embeddings_model_version')
      .on('chunk_embeddings')
      .columns(['model_name', 'model_version'])
      .execute();

    await db.schema
      .createIndex('idx_chunk_embeddings_confidence')
      .on('chunk_embeddings')
      .columns(['confidence_score desc'])
      .execute();

    await db.schema
      .createIndex('idx_chunk_embeddings_updated')
      .on('chunk_embeddings')
      .column('updated_at')
      .execute();

    // Vector similarity indexes (for pgvector)
    try {
      await db.executeQuery(sql`CREATE INDEX idx_chunk_embeddings_vector_cosine ON chunk_embeddings USING ivfflat (embedding_vector vector_cosine_ops) WITH (lists = 100)`.compile(db));
      await db.executeQuery(sql`CREATE INDEX idx_chunk_embeddings_vector_l2 ON chunk_embeddings USING ivfflat (embedding_vector vector_l2_ops) WITH (lists = 100)`.compile(db));
      logger.info('Created vector similarity indexes');
    } catch (error) {
      logger.warn('Could not create vector indexes - pgvector may need configuration');
    }

    // Semantic search cache indexes
    await db.schema
      .createIndex('idx_semantic_cache_query_hash')
      .on('semantic_search_cache')
      .column('query_hash')
      .execute();

    await db.schema
      .createIndex('idx_semantic_cache_type')
      .on('semantic_search_cache')
      .column('query_type')
      .execute();

    await db.schema
      .createIndex('idx_semantic_cache_model')
      .on('semantic_search_cache')
      .column('model_used')
      .execute();

    await db.schema
      .createIndex('idx_semantic_cache_accessed')
      .on('semantic_search_cache')
      .columns(['last_accessed desc'])
      .execute();

    await db.schema
      .createIndex('idx_semantic_cache_hits')
      .on('semantic_search_cache')
      .columns(['hit_count desc'])
      .execute();

    // Embedding models indexes
    await db.schema
      .createIndex('idx_embedding_models_name')
      .on('embedding_models')
      .column('name')
      .execute();

    await db.schema
      .createIndex('idx_embedding_models_type')
      .on('embedding_models')
      .column('model_type')
      .execute();

    await db.schema
      .createIndex('idx_embedding_models_active')
      .on('embedding_models')
      .column('is_active')
      .execute();

    await db.schema
      .createIndex('idx_embedding_models_default')
      .on('embedding_models')
      .column('is_default')
      .execute();

    // Cross-language mappings indexes
    await db.schema
      .createIndex('idx_cross_lang_source')
      .on('cross_language_mappings')
      .column('source_chunk_id')
      .execute();

    await db.schema
      .createIndex('idx_cross_lang_target')
      .on('cross_language_mappings')
      .column('target_chunk_id')
      .execute();

    await db.schema
      .createIndex('idx_cross_lang_languages')
      .on('cross_language_mappings')
      .columns(['source_language', 'target_language'])
      .execute();

    await db.schema
      .createIndex('idx_cross_lang_similarity')
      .on('cross_language_mappings')
      .columns(['similarity_score desc'])
      .execute();

    await db.schema
      .createIndex('idx_cross_lang_type')
      .on('cross_language_mappings')
      .column('mapping_type')
      .execute();

    // Search analytics indexes
    await db.schema
      .createIndex('idx_search_analytics_session')
      .on('search_analytics')
      .column('search_session')
      .execute();

    await db.schema
      .createIndex('idx_search_analytics_type')
      .on('search_analytics')
      .column('query_type')
      .execute();

    await db.schema
      .createIndex('idx_search_analytics_model')
      .on('search_analytics')
      .column('model_used')
      .execute();

    await db.schema
      .createIndex('idx_search_analytics_time')
      .on('search_analytics')
      .columns(['search_time_ms'])
      .execute();

    await db.schema
      .createIndex('idx_search_analytics_created')
      .on('search_analytics')
      .columns(['created_at desc'])
      .execute();

    await db.schema
      .createIndex('idx_search_analytics_repository')
      .on('search_analytics')
      .column('repository_id')
      .execute();

    // ===================
    // INSERT DEFAULT EMBEDDING MODELS
    // ===================

    logger.info('Inserting default embedding models...');

    await db
      .insertInto('embedding_models')
      .values([
        {
          name: 'codebert',
          display_name: 'CodeBERT',
          description: 'Microsoft CodeBERT model for code understanding and representation',
          model_type: 'codebert',
          embedding_dimension: 768,
          supported_languages: JSON.stringify([
            'typescript', 'javascript', 'python', 'java', 'go', 'php', 'ruby', 'c', 'cpp'
          ]),
          model_config: JSON.stringify({
            model_name: 'microsoft/codebert-base',
            max_length: 512,
            batch_size: 32,
            normalize_embeddings: true
          }),
          is_default: true,
          is_active: true,
          performance_metrics: JSON.stringify({
            avg_generation_time_ms: 150,
            memory_usage_mb: 1200,
            accuracy_score: 0.85
          })
        },
        {
          name: 'graphcodebert',
          display_name: 'GraphCodeBERT', 
          description: 'Microsoft GraphCodeBERT for structure-aware code embeddings',
          model_type: 'graphcodebert',
          embedding_dimension: 768,
          supported_languages: JSON.stringify([
            'typescript', 'javascript', 'python', 'java', 'go', 'c', 'cpp'
          ]),
          model_config: JSON.stringify({
            model_name: 'microsoft/graphcodebert-base',
            max_length: 512,
            include_data_flow: true,
            normalize_embeddings: true
          }),
          is_default: false,
          is_active: true,
          performance_metrics: JSON.stringify({
            avg_generation_time_ms: 200,
            memory_usage_mb: 1400,
            accuracy_score: 0.88
          })
        },
        {
          name: 'unixcoder',
          display_name: 'UniXcoder',
          description: 'Microsoft UniXcoder for multi-language code representation',
          model_type: 'unixcoder',
          embedding_dimension: 768,
          supported_languages: JSON.stringify([
            'typescript', 'javascript', 'python', 'java', 'go', 'c', 'cpp', 'php', 'ruby', 'rust'
          ]),
          model_config: JSON.stringify({
            model_name: 'microsoft/unixcoder-base',
            max_length: 512,
            cross_language: true,
            normalize_embeddings: true
          }),
          is_default: false,
          is_active: true,
          performance_metrics: JSON.stringify({
            avg_generation_time_ms: 180,
            memory_usage_mb: 1300,
            accuracy_score: 0.87
          })
        },
        {
          name: 'openai-code',
          display_name: 'OpenAI Code Embeddings',
          description: 'OpenAI text-embedding-ada-002 adapted for code',
          model_type: 'openai',
          embedding_dimension: 1536,
          supported_languages: JSON.stringify([
            'typescript', 'javascript', 'python', 'java', 'go', 'c', 'cpp', 'rust', 'php', 'ruby'
          ]),
          model_config: JSON.stringify({
            model_name: 'text-embedding-ada-002',
            api_version: 'v1',
            max_tokens: 8000,
            normalize_embeddings: true
          }),
          api_endpoint: 'https://api.openai.com/v1/embeddings',
          is_default: false,
          is_active: false,
          performance_metrics: JSON.stringify({
            avg_generation_time_ms: 300,
            memory_usage_mb: 0,
            accuracy_score: 0.82
          })
        }
      ])
      .execute();

    // ===================
    // CREATE SEARCH OPTIMIZATION FUNCTIONS
    // ===================

    logger.info('Creating search optimization functions...');

    // Function to calculate cosine similarity
    await db.executeQuery(sql`
      CREATE OR REPLACE FUNCTION cosine_similarity(a vector, b vector)
      RETURNS float AS $$
      BEGIN
        RETURN (a <#> b) * -1 + 1;
      END;
      $$ LANGUAGE plpgsql IMMUTABLE;
    `.compile(db));

    // Function to find similar chunks
    await db.executeQuery(sql`
      CREATE OR REPLACE FUNCTION find_similar_chunks(
        target_vector vector, 
        model_filter text DEFAULT NULL,
        similarity_threshold float DEFAULT 0.7,
        max_results int DEFAULT 50
      )
      RETURNS TABLE(
        chunk_id uuid,
        similarity_score float,
        model_name text,
        confidence_score numeric
      ) AS $$
      BEGIN
        RETURN QUERY
        SELECT 
          ce.chunk_id,
          cosine_similarity(ce.embedding_vector, target_vector) as similarity_score,
          ce.model_name::text,
          ce.confidence_score
        FROM chunk_embeddings ce
        WHERE 
          (model_filter IS NULL OR ce.model_name = model_filter)
          AND cosine_similarity(ce.embedding_vector, target_vector) >= similarity_threshold
        ORDER BY similarity_score DESC
        LIMIT max_results;
      END;
      $$ LANGUAGE plpgsql;
    `.compile(db));

    logger.info('Migration 015_code_embeddings_semantic_search completed successfully');
    logger.info('Enhanced code embeddings system with semantic search capabilities ready');
  },

  async down(db: Kysely<any>): Promise<void> {
    logger.info('Running migration: 015_code_embeddings_semantic_search (down)');
    logger.info('Rolling back code embeddings semantic search enhancements...');

    // Drop functions
    await db.executeQuery(sql`DROP FUNCTION IF EXISTS find_similar_chunks(vector, text, float, int) CASCADE`.compile(db));
    await db.executeQuery(sql`DROP FUNCTION IF EXISTS cosine_similarity(vector, vector) CASCADE`.compile(db));

    // Drop indexes
    const indexes = [
      'idx_search_analytics_repository',
      'idx_search_analytics_created', 
      'idx_search_analytics_time',
      'idx_search_analytics_model',
      'idx_search_analytics_type',
      'idx_search_analytics_session',
      'idx_cross_lang_type',
      'idx_cross_lang_similarity',
      'idx_cross_lang_languages',
      'idx_cross_lang_target',
      'idx_cross_lang_source',
      'idx_embedding_models_default',
      'idx_embedding_models_active',
      'idx_embedding_models_type',
      'idx_embedding_models_name',
      'idx_semantic_cache_hits',
      'idx_semantic_cache_accessed',
      'idx_semantic_cache_model',
      'idx_semantic_cache_type',
      'idx_semantic_cache_query_hash',
      'idx_chunk_embeddings_vector_l2',
      'idx_chunk_embeddings_vector_cosine',
      'idx_chunk_embeddings_updated',
      'idx_chunk_embeddings_confidence',
      'idx_chunk_embeddings_model_version'
    ];

    for (const index of indexes) {
      await db.schema.dropIndex(index).ifExists().execute();
    }

    // Drop tables
    await db.schema.dropTable('search_analytics').ifExists().execute();
    await db.schema.dropTable('cross_language_mappings').ifExists().execute();
    await db.schema.dropTable('embedding_models').ifExists().execute();
    await db.schema.dropTable('semantic_search_cache').ifExists().execute();

    // Revert chunk_embeddings table changes
    await db.schema
      .alterTable('chunk_embeddings')
      .dropColumn('updated_at')
      .dropColumn('confidence_score')
      .dropColumn('embedding_vector')
      .dropColumn('model_version')
      .execute();

    await db.executeQuery(sql`ALTER TABLE chunk_embeddings RENAME COLUMN model_name TO embedding_model`.compile(db));
    
    // Restore original embedding_vector column
    await db.schema
      .alterTable('chunk_embeddings')
      .addColumn('embedding_vector', 'vector(1536)')
      .execute();

    logger.info('Migration 015_code_embeddings_semantic_search rollback completed');
  }
};