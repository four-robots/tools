import { sql, type Kysely } from 'kysely';
import { PostgresDialect } from 'kysely';
import type { Database } from '../database/connection.js';

/**
 * Migration 021: Custom Filter Builder Tables
 * 
 * Creates comprehensive filter builder system with:
 * - Filter templates and presets
 * - Shared filters with collaboration
 * - Filter history and versions
 * - User filter presets
 * - Filter builder analytics
 */
export async function up(db: Kysely<Database>): Promise<void> {
  console.log('Running migration 021: Custom Filter Builder tables...');

  // Filter templates and presets
  await db.schema
    .createTable('filter_templates')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('name', 'varchar(200)', (col) => col.notNull())
    .addColumn('description', 'text')
    .addColumn('filter_tree', 'jsonb', (col) => col.notNull())
    .addColumn('category', 'varchar(100)')
    .addColumn('is_public', 'boolean', (col) => col.defaultTo(false))
    .addColumn('owner_id', 'uuid', (col) => col.notNull())
    .addColumn('usage_count', 'integer', (col) => col.defaultTo(0))
    .addColumn('tags', sql`text[]`)
    .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`NOW()`))
    .addColumn('updated_at', 'timestamp', (col) => col.defaultTo(sql`NOW()`))
    .execute();

  // Shared filters with collaboration
  await db.schema
    .createTable('shared_filters')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('filter_tree', 'jsonb', (col) => col.notNull())
    .addColumn('share_token', 'varchar(100)', (col) => col.notNull().unique())
    .addColumn('created_by', 'uuid', (col) => col.notNull())
    .addColumn('permissions', 'varchar(50)', (col) => col.defaultTo('view'))
    .addColumn('expires_at', 'timestamp')
    .addColumn('access_count', 'integer', (col) => col.defaultTo(0))
    .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`NOW()`))
    .execute();

  // Filter history and versions
  await db.schema
    .createTable('filter_history')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('user_id', 'uuid', (col) => col.notNull())
    .addColumn('filter_tree', 'jsonb', (col) => col.notNull())
    .addColumn('query_generated', 'text')
    .addColumn('execution_time_ms', 'integer')
    .addColumn('result_count', 'integer')
    .addColumn('is_saved', 'boolean', (col) => col.defaultTo(false))
    .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`NOW()`))
    .execute();

  // User filter presets
  await db.schema
    .createTable('user_filter_presets')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('user_id', 'uuid', (col) => col.notNull())
    .addColumn('name', 'varchar(200)', (col) => col.notNull())
    .addColumn('filter_tree', 'jsonb', (col) => col.notNull())
    .addColumn('shortcut_key', 'varchar(20)')
    .addColumn('is_default', 'boolean', (col) => col.defaultTo(false))
    .addColumn('usage_count', 'integer', (col) => col.defaultTo(0))
    .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`NOW()`))
    .execute();

  // Filter builder analytics
  await db.schema
    .createTable('filter_builder_analytics')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('user_id', 'uuid')
    .addColumn('action_type', 'varchar(50)')
    .addColumn('filter_complexity', 'integer')
    .addColumn('operator_usage', 'jsonb')
    .addColumn('execution_time_ms', 'integer')
    .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`NOW()`))
    .execute();

  // Create indexes for performance
  console.log('Creating indexes for filter builder tables...');

  // Filter templates indexes
  await db.schema
    .createIndex('idx_filter_templates_public')
    .on('filter_templates')
    .column('is_public')
    .where('is_public', '=', true)
    .execute();

  await db.schema
    .createIndex('idx_filter_templates_owner')
    .on('filter_templates')
    .column('owner_id')
    .execute();

  await db.schema
    .createIndex('idx_filter_templates_category')
    .on('filter_templates')
    .column('category')
    .execute();

  // Shared filters indexes
  await db.schema
    .createIndex('idx_shared_filters_token')
    .on('shared_filters')
    .column('share_token')
    .execute();

  await db.schema
    .createIndex('idx_shared_filters_created_by')
    .on('shared_filters')
    .column('created_by')
    .execute();

  // Filter history indexes
  await db.schema
    .createIndex('idx_filter_history_user_date')
    .on('filter_history')
    .columns(['user_id', 'created_at'])
    .execute();

  await db.schema
    .createIndex('idx_filter_history_saved')
    .on('filter_history')
    .column('is_saved')
    .where('is_saved', '=', true)
    .execute();

  // User presets indexes
  await db.schema
    .createIndex('idx_user_presets_user')
    .on('user_filter_presets')
    .column('user_id')
    .execute();

  await db.schema
    .createIndex('idx_user_presets_default')
    .on('user_filter_presets')
    .columns(['user_id', 'is_default'])
    .where('is_default', '=', true)
    .execute();

  // Analytics indexes
  await db.schema
    .createIndex('idx_filter_analytics_user_date')
    .on('filter_builder_analytics')
    .columns(['user_id', 'created_at'])
    .execute();

  await db.schema
    .createIndex('idx_filter_analytics_action')
    .on('filter_builder_analytics')
    .column('action_type')
    .execute();

  // Add unique constraint for user preset names
  await db.schema
    .alterTable('user_filter_presets')
    .addUniqueConstraint('unique_user_preset_name', ['user_id', 'name'])
    .execute();

  // Add check constraints
  await db.schema
    .alterTable('shared_filters')
    .addCheckConstraint('check_permissions', sql`permissions IN ('view', 'edit', 'admin')`)
    .execute();

  await db.schema
    .alterTable('filter_builder_analytics')
    .addCheckConstraint('check_action_type', sql`action_type IN ('create', 'apply', 'share', 'save_template', 'load_template', 'delete')`)
    .execute();

  console.log('Migration 021 completed successfully');
}

export async function down(db: Kysely<Database>): Promise<void> {
  console.log('Rolling back migration 021: Custom Filter Builder tables...');

  // Drop tables in reverse order
  await db.schema.dropTable('filter_builder_analytics').ifExists().execute();
  await db.schema.dropTable('user_filter_presets').ifExists().execute();
  await db.schema.dropTable('filter_history').ifExists().execute();
  await db.schema.dropTable('shared_filters').ifExists().execute();
  await db.schema.dropTable('filter_templates').ifExists().execute();

  console.log('Migration 021 rollback completed');
}