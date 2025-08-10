import { sql, type Kysely } from 'kysely';
import { PostgresDialect } from 'kysely';
import type { Database } from '../database/connection.js';

/**
 * Migration 022: Saved Search Management System
 * 
 * Creates comprehensive saved search management with:
 * - Saved searches with metadata and organization
 * - Search collections and folders
 * - Scheduled search execution
 * - Team sharing and collaboration
 * - Search version history and change tracking
 * - Search analytics and usage statistics
 */
export async function up(db: Kysely<Database>): Promise<void> {
  console.log('Running migration 022: Saved Search Management system...');

  // Main saved searches table
  await db.schema
    .createTable('saved_searches')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('name', 'varchar(200)', (col) => col.notNull())
    .addColumn('description', 'text')
    .addColumn('query_data', 'jsonb', (col) => col.notNull()) // Complete search query including filters, facets, etc.
    .addColumn('owner_id', 'uuid', (col) => col.notNull())
    .addColumn('is_public', 'boolean', (col) => col.defaultTo(false))
    .addColumn('is_favorite', 'boolean', (col) => col.defaultTo(false))
    .addColumn('execution_count', 'integer', (col) => col.defaultTo(0))
    .addColumn('last_executed_at', 'timestamp')
    .addColumn('tags', sql`text[]`)
    .addColumn('metadata', 'jsonb', (col) => col.defaultTo(sql`'{}'::jsonb`))
    .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`NOW()`))
    .addColumn('updated_at', 'timestamp', (col) => col.defaultTo(sql`NOW()`))
    .execute();

  // Search collections/folders
  await db.schema
    .createTable('search_collections')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('name', 'varchar(200)', (col) => col.notNull())
    .addColumn('description', 'text')
    .addColumn('owner_id', 'uuid', (col) => col.notNull())
    .addColumn('parent_collection_id', 'uuid', (col) => col.references('search_collections.id'))
    .addColumn('is_shared', 'boolean', (col) => col.defaultTo(false))
    .addColumn('color', 'varchar(7)') // Hex color code
    .addColumn('icon', 'varchar(50)')
    .addColumn('sort_order', 'integer', (col) => col.defaultTo(0))
    .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`NOW()`))
    .addColumn('updated_at', 'timestamp', (col) => col.defaultTo(sql`NOW()`))
    .execute();

  // Many-to-many relationship between searches and collections
  await db.schema
    .createTable('search_collection_items')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('search_id', 'uuid', (col) => col.notNull().references('saved_searches.id').onDelete('cascade'))
    .addColumn('collection_id', 'uuid', (col) => col.notNull().references('search_collections.id').onDelete('cascade'))
    .addColumn('added_at', 'timestamp', (col) => col.defaultTo(sql`NOW()`))
    .addColumn('added_by', 'uuid', (col) => col.notNull())
    .execute();

  // Search sharing and permissions
  await db.schema
    .createTable('search_shares')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('search_id', 'uuid', (col) => col.notNull().references('saved_searches.id').onDelete('cascade'))
    .addColumn('shared_with_user_id', 'uuid')
    .addColumn('shared_with_team_id', 'uuid') // For future team functionality
    .addColumn('permission_level', 'varchar(20)', (col) => col.defaultTo('view'))
    .addColumn('share_token', 'varchar(100)', (col) => col.unique())
    .addColumn('expires_at', 'timestamp')
    .addColumn('created_by', 'uuid', (col) => col.notNull())
    .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`NOW()`))
    .execute();

  // Search version history
  await db.schema
    .createTable('search_versions')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('search_id', 'uuid', (col) => col.notNull().references('saved_searches.id').onDelete('cascade'))
    .addColumn('version_number', 'integer', (col) => col.notNull())
    .addColumn('name', 'varchar(200)', (col) => col.notNull())
    .addColumn('query_data', 'jsonb', (col) => col.notNull())
    .addColumn('change_description', 'text')
    .addColumn('created_by', 'uuid', (col) => col.notNull())
    .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`NOW()`))
    .execute();

  // Scheduled search execution
  await db.schema
    .createTable('search_schedules')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('search_id', 'uuid', (col) => col.notNull().references('saved_searches.id').onDelete('cascade'))
    .addColumn('schedule_type', 'varchar(20)', (col) => col.notNull())
    .addColumn('cron_expression', 'varchar(100)')
    .addColumn('timezone', 'varchar(50)', (col) => col.defaultTo('UTC'))
    .addColumn('is_active', 'boolean', (col) => col.defaultTo(true))
    .addColumn('next_execution_at', 'timestamp')
    .addColumn('last_execution_at', 'timestamp')
    .addColumn('execution_count', 'integer', (col) => col.defaultTo(0))
    .addColumn('max_executions', 'integer') // NULL for unlimited
    .addColumn('notification_settings', 'jsonb', (col) => col.defaultTo(sql`'{}'::jsonb`))
    .addColumn('created_by', 'uuid', (col) => col.notNull())
    .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`NOW()`))
    .addColumn('updated_at', 'timestamp', (col) => col.defaultTo(sql`NOW()`))
    .execute();

  // Search execution history and results
  await db.schema
    .createTable('search_executions')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('search_id', 'uuid', (col) => col.notNull().references('saved_searches.id').onDelete('cascade'))
    .addColumn('schedule_id', 'uuid', (col) => col.references('search_schedules.id'))
    .addColumn('execution_type', 'varchar(20)', (col) => col.notNull())
    .addColumn('result_count', 'integer')
    .addColumn('execution_time_ms', 'integer')
    .addColumn('status', 'varchar(20)', (col) => col.notNull())
    .addColumn('error_message', 'text')
    .addColumn('executed_by', 'uuid')
    .addColumn('executed_at', 'timestamp', (col) => col.defaultTo(sql`NOW()`))
    .execute();

  // Search analytics and usage statistics
  await db.schema
    .createTable('search_analytics')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('search_id', 'uuid', (col) => col.notNull().references('saved_searches.id').onDelete('cascade'))
    .addColumn('user_id', 'uuid')
    .addColumn('action_type', 'varchar(30)', (col) => col.notNull())
    .addColumn('result_count', 'integer')
    .addColumn('click_position', 'integer') // For result click tracking
    .addColumn('dwell_time_seconds', 'integer')
    .addColumn('query_modifications', 'jsonb') // Track how users modify saved searches
    .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`NOW()`))
    .execute();

  // Create strategic indexes for performance
  console.log('Creating indexes for saved search tables...');

  // Saved searches indexes
  await db.schema
    .createIndex('idx_saved_searches_owner')
    .on('saved_searches')
    .column('owner_id')
    .execute();

  await db.schema
    .createIndex('idx_saved_searches_public')
    .on('saved_searches')
    .column('is_public')
    .where('is_public', '=', true)
    .execute();

  await db.schema
    .createIndex('idx_saved_searches_favorite')
    .on('saved_searches')
    .columns(['owner_id', 'is_favorite'])
    .where('is_favorite', '=', true)
    .execute();

  await db.schema
    .createIndex('idx_saved_searches_tags')
    .on('saved_searches')
    .using('gin')
    .column('tags')
    .execute();

  // Search collections indexes
  await db.schema
    .createIndex('idx_search_collections_owner')
    .on('search_collections')
    .column('owner_id')
    .execute();

  await db.schema
    .createIndex('idx_search_collections_parent')
    .on('search_collections')
    .column('parent_collection_id')
    .execute();

  // Search shares indexes
  await db.schema
    .createIndex('idx_search_shares_token')
    .on('search_shares')
    .column('share_token')
    .where('share_token', 'is not', null)
    .execute();

  // Search versions indexes
  await db.schema
    .createIndex('idx_search_versions_search')
    .on('search_versions')
    .columns(['search_id', 'version_number'])
    .execute();

  // Search schedules indexes
  await db.schema
    .createIndex('idx_search_schedules_active')
    .on('search_schedules')
    .columns(['is_active', 'next_execution_at'])
    .where('is_active', '=', true)
    .execute();

  // Search executions indexes
  await db.schema
    .createIndex('idx_search_executions_search')
    .on('search_executions')
    .columns(['search_id', 'executed_at'])
    .execute();

  // Search analytics indexes
  await db.schema
    .createIndex('idx_search_analytics_search')
    .on('search_analytics')
    .columns(['search_id', 'created_at'])
    .execute();

  await db.schema
    .createIndex('idx_search_analytics_user')
    .on('search_analytics')
    .columns(['user_id', 'created_at'])
    .execute();

  // Add unique constraints
  await db.schema
    .alterTable('search_collection_items')
    .addUniqueConstraint('unique_search_collection', ['search_id', 'collection_id'])
    .execute();

  await db.schema
    .alterTable('search_versions')
    .addUniqueConstraint('unique_search_version', ['search_id', 'version_number'])
    .execute();

  // Add check constraints
  await db.schema
    .alterTable('search_shares')
    .addCheckConstraint('check_share_target', sql`shared_with_user_id IS NOT NULL OR shared_with_team_id IS NOT NULL OR share_token IS NOT NULL`)
    .execute();

  await db.schema
    .alterTable('search_shares')
    .addCheckConstraint('check_permission_level', sql`permission_level IN ('view', 'edit', 'admin')`)
    .execute();

  await db.schema
    .alterTable('search_schedules')
    .addCheckConstraint('check_schedule_type', sql`schedule_type IN ('once', 'daily', 'weekly', 'monthly', 'custom')`)
    .execute();

  await db.schema
    .alterTable('search_executions')
    .addCheckConstraint('check_execution_type', sql`execution_type IN ('manual', 'scheduled')`)
    .execute();

  await db.schema
    .alterTable('search_executions')
    .addCheckConstraint('check_execution_status', sql`status IN ('success', 'error', 'timeout')`)
    .execute();

  await db.schema
    .alterTable('search_analytics')
    .addCheckConstraint('check_action_type', sql`action_type IN ('execute', 'view', 'edit', 'share', 'favorite', 'schedule', 'delete')`)
    .execute();

  console.log('Migration 022 completed successfully');
}

export async function down(db: Kysely<Database>): Promise<void> {
  console.log('Rolling back migration 022: Saved Search Management system...');

  // Drop tables in reverse dependency order
  await db.schema.dropTable('search_analytics').ifExists().execute();
  await db.schema.dropTable('search_executions').ifExists().execute();
  await db.schema.dropTable('search_schedules').ifExists().execute();
  await db.schema.dropTable('search_versions').ifExists().execute();
  await db.schema.dropTable('search_shares').ifExists().execute();
  await db.schema.dropTable('search_collection_items').ifExists().execute();
  await db.schema.dropTable('search_collections').ifExists().execute();
  await db.schema.dropTable('saved_searches').ifExists().execute();

  console.log('Migration 022 rollback completed');
}