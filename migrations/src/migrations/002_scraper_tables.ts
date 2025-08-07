import { type Kysely, sql } from 'kysely';
import { logger } from '../utils/logger';

export async function up(db: Kysely<any>): Promise<void> {
  logger.info('Creating scraper tables...');

  // Scraped pages table for the scraper service
  await db.schema
    .createTable('scraped_pages')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('url', 'text', (col) => col.notNull())
    .addColumn('title', 'text')
    .addColumn('content', 'text', (col) => col.notNull())
    .addColumn('content_hash', 'text', (col) => col.notNull())
    .addColumn('metadata', 'jsonb', (col) => col.defaultTo('{}'))
    .addColumn('scraped_at', 'timestamp', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn('status', 'text', (col) => col.notNull().defaultTo('success'))
    .addColumn('error_message', 'text')
    .addColumn('created_at', 'timestamp', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn('updated_at', 'timestamp', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute();

  // Scraping jobs table for job management
  await db.schema
    .createTable('scraping_jobs')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('url', 'text', (col) => col.notNull())
    .addColumn('selector', 'text')
    .addColumn('options', 'jsonb', (col) => col.defaultTo('{}'))
    .addColumn('status', 'text', (col) => col.notNull().defaultTo('pending'))
    .addColumn('priority', 'integer', (col) => col.notNull().defaultTo(5))
    .addColumn('scheduled_at', 'timestamp')
    .addColumn('started_at', 'timestamp')
    .addColumn('completed_at', 'timestamp')
    .addColumn('error_message', 'text')
    .addColumn('result_page_id', 'uuid')
    .addColumn('created_at', 'timestamp', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn('updated_at', 'timestamp', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addForeignKeyConstraint('fk_scraping_jobs_result_page', ['result_page_id'], 'scraped_pages', ['id'], (cb) => cb.onDelete('set null'))
    .execute();

  // Create indexes for performance
  await db.schema
    .createIndex('idx_scraped_pages_url')
    .on('scraped_pages')
    .column('url')
    .execute();

  await db.schema
    .createIndex('idx_scraped_pages_content_hash')
    .on('scraped_pages')
    .column('content_hash')
    .execute();

  await db.schema
    .createIndex('idx_scraped_pages_status')
    .on('scraped_pages')
    .column('status')
    .execute();

  await db.schema
    .createIndex('idx_scraping_jobs_status')
    .on('scraping_jobs')
    .column('status')
    .execute();

  await db.schema
    .createIndex('idx_scraping_jobs_priority')
    .on('scraping_jobs')
    .column('priority')
    .execute();

  await db.schema
    .createIndex('idx_scraping_jobs_scheduled_at')
    .on('scraping_jobs')
    .column('scheduled_at')
    .execute();

  logger.info('Scraper tables created successfully');
}

export async function down(db: Kysely<any>): Promise<void> {
  logger.info('Dropping scraper tables...');

  // Drop indexes first
  await db.schema.dropIndex('idx_scraping_jobs_scheduled_at').execute();
  await db.schema.dropIndex('idx_scraping_jobs_priority').execute();
  await db.schema.dropIndex('idx_scraping_jobs_status').execute();
  await db.schema.dropIndex('idx_scraped_pages_status').execute();
  await db.schema.dropIndex('idx_scraped_pages_content_hash').execute();
  await db.schema.dropIndex('idx_scraped_pages_url').execute();

  // Drop tables (jobs first due to foreign key)
  await db.schema.dropTable('scraping_jobs').execute();
  await db.schema.dropTable('scraped_pages').execute();

  logger.info('Scraper tables dropped successfully');
}