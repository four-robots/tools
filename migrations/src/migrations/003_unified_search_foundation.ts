import { type Kysely, sql } from 'kysely';
import { logger } from '../utils/logger';

export async function up(db: Kysely<any>): Promise<void> {
  logger.info('Creating unified search foundation schema...');

  // 1. Enhance scraped pages table for vector embeddings
  logger.info('Enhancing scraped_pages table...');
  await db.schema
    .alterTable('scraped_pages')
    .addColumn('vector_id', 'text')
    .addColumn('markdown_content', 'text')
    .addColumn('embedding_status', 'text', (col) => col.defaultTo('pending'))
    .addColumn('chunk_count', 'integer', (col) => col.defaultTo(0))
    .addColumn('last_vectorized', 'timestamp')
    .execute();

  // 2. Create scraped content chunks table for document segmentation
  logger.info('Creating scraped_content_chunks table...');
  await db.schema
    .createTable('scraped_content_chunks')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('page_id', 'uuid', (col) => col.notNull().references('scraped_pages.id').onDelete('cascade'))
    .addColumn('content', 'text', (col) => col.notNull())
    .addColumn('vector_id', 'text')
    .addColumn('start_position', 'integer')
    .addColumn('end_position', 'integer')
    .addColumn('chunk_index', 'integer')
    .addColumn('metadata', 'jsonb', (col) => col.defaultTo('{}'))
    .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute();

  // 3. Create search analytics table for query tracking
  logger.info('Creating search_queries table...');
  await db.schema
    .createTable('search_queries')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('query', 'text', (col) => col.notNull())
    .addColumn('user_id', 'uuid')
    .addColumn('results_count', 'integer')
    .addColumn('processing_time_ms', 'integer')
    .addColumn('result_types', 'jsonb', (col) => col.defaultTo('{}'))
    .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute();

  // 4. Create code repositories table for Phase 2 code analysis
  logger.info('Creating code_repositories table...');
  await db.schema
    .createTable('code_repositories')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('path', 'text', (col) => col.notNull())
    .addColumn('status', 'text', (col) => col.defaultTo('pending'))
    .addColumn('last_indexed', 'timestamp')
    .addColumn('file_count', 'integer', (col) => col.defaultTo(0))
    .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute();

  // 5. Create code files table for individual file tracking
  logger.info('Creating code_files table...');
  await db.schema
    .createTable('code_files')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('repository_id', 'uuid', (col) => col.notNull().references('code_repositories.id').onDelete('cascade'))
    .addColumn('file_path', 'text', (col) => col.notNull())
    .addColumn('language', 'text', (col) => col.notNull())
    .addColumn('content', 'text', (col) => col.notNull())
    .addColumn('vector_id', 'text')
    .addColumn('function_count', 'integer', (col) => col.defaultTo(0))
    .addColumn('class_count', 'integer', (col) => col.defaultTo(0))
    .addColumn('last_modified', 'timestamp')
    .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute();

  // 6. Create code chunks table for function/class level analysis
  logger.info('Creating code_chunks table...');
  await db.schema
    .createTable('code_chunks')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('file_id', 'uuid', (col) => col.notNull().references('code_files.id').onDelete('cascade'))
    .addColumn('chunk_type', 'text', (col) => col.notNull()) // 'function', 'class', 'comment', 'documentation'
    .addColumn('name', 'text')
    .addColumn('content', 'text', (col) => col.notNull())
    .addColumn('vector_id', 'text')
    .addColumn('line_start', 'integer')
    .addColumn('line_end', 'integer')
    .addColumn('metadata', 'jsonb', (col) => col.defaultTo('{}'))
    .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute();

  // 7. Create performance indexes for scraped content
  logger.info('Creating scraped content indexes...');
  await db.schema
    .createIndex('idx_scraped_pages_vector_id')
    .on('scraped_pages')
    .column('vector_id')
    .execute();

  await db.schema
    .createIndex('idx_scraped_pages_embedding_status')
    .on('scraped_pages')
    .column('embedding_status')
    .execute();

  await db.schema
    .createIndex('idx_scraped_content_chunks_page_id')
    .on('scraped_content_chunks')
    .column('page_id')
    .execute();

  await db.schema
    .createIndex('idx_scraped_content_chunks_vector_id')
    .on('scraped_content_chunks')
    .column('vector_id')
    .execute();

  // 8. Create search analytics indexes
  logger.info('Creating search analytics indexes...');
  await db.schema
    .createIndex('idx_search_queries_user_id')
    .on('search_queries')
    .column('user_id')
    .execute();

  await db.schema
    .createIndex('idx_search_queries_created_at')
    .on('search_queries')
    .column('created_at')
    .execute();

  // 9. Create code analysis indexes
  logger.info('Creating code analysis indexes...');
  await db.schema
    .createIndex('idx_code_files_repository_id')
    .on('code_files')
    .column('repository_id')
    .execute();

  await db.schema
    .createIndex('idx_code_files_language')
    .on('code_files')
    .column('language')
    .execute();

  await db.schema
    .createIndex('idx_code_files_vector_id')
    .on('code_files')
    .column('vector_id')
    .execute();

  await db.schema
    .createIndex('idx_code_chunks_file_id')
    .on('code_chunks')
    .column('file_id')
    .execute();

  await db.schema
    .createIndex('idx_code_chunks_chunk_type')
    .on('code_chunks')
    .column('chunk_type')
    .execute();

  await db.schema
    .createIndex('idx_code_chunks_vector_id')
    .on('code_chunks')
    .column('vector_id')
    .execute();

  logger.info('Unified search foundation schema created successfully');
}

export async function down(db: Kysely<any>): Promise<void> {
  logger.info('Rolling back unified search foundation schema...');

  // Drop indexes first (reverse order)
  logger.info('Dropping code analysis indexes...');
  await db.schema.dropIndex('idx_code_chunks_vector_id').execute();
  await db.schema.dropIndex('idx_code_chunks_chunk_type').execute();
  await db.schema.dropIndex('idx_code_chunks_file_id').execute();
  await db.schema.dropIndex('idx_code_files_vector_id').execute();
  await db.schema.dropIndex('idx_code_files_language').execute();
  await db.schema.dropIndex('idx_code_files_repository_id').execute();

  logger.info('Dropping search analytics indexes...');
  await db.schema.dropIndex('idx_search_queries_created_at').execute();
  await db.schema.dropIndex('idx_search_queries_user_id').execute();

  logger.info('Dropping scraped content indexes...');
  await db.schema.dropIndex('idx_scraped_content_chunks_vector_id').execute();
  await db.schema.dropIndex('idx_scraped_content_chunks_page_id').execute();
  await db.schema.dropIndex('idx_scraped_pages_embedding_status').execute();
  await db.schema.dropIndex('idx_scraped_pages_vector_id').execute();

  // Drop tables (respecting foreign key dependencies)
  logger.info('Dropping code analysis tables...');
  await db.schema.dropTable('code_chunks').execute();
  await db.schema.dropTable('code_files').execute();
  await db.schema.dropTable('code_repositories').execute();

  logger.info('Dropping search and content tables...');
  await db.schema.dropTable('search_queries').execute();
  await db.schema.dropTable('scraped_content_chunks').execute();

  // Remove added columns from scraped_pages table
  logger.info('Removing columns from scraped_pages table...');
  await db.schema
    .alterTable('scraped_pages')
    .dropColumn('last_vectorized')
    .dropColumn('chunk_count')
    .dropColumn('embedding_status')
    .dropColumn('markdown_content')
    .dropColumn('vector_id')
    .execute();

  logger.info('Unified search foundation schema rollback completed successfully');
}