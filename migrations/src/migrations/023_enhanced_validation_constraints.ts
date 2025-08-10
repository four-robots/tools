import { sql, type Kysely } from 'kysely';
import type { Database } from '../database/connection.js';

/**
 * Migration 023: Enhanced Validation Constraints
 * 
 * Adds additional security and validation constraints to improve data integrity:
 * - Timezone validation for search schedules
 * - Cron expression format validation
 * - Share token length validation for security
 * - Color code format validation
 * - String length limits to prevent abuse
 */
export async function up(db: Kysely<Database>): Promise<void> {
  console.log('Running migration 023: Enhanced validation constraints...');

  // Add timezone validation constraint
  await db.schema
    .alterTable('search_schedules')
    .addCheckConstraint(
      'check_valid_timezone',
      sql`timezone ~ '^[A-Za-z_]+/[A-Za-z_]+$' OR timezone = 'UTC'`
    )
    .execute();

  // Add cron expression validation (basic format check)
  await db.schema
    .alterTable('search_schedules')
    .addCheckConstraint(
      'check_cron_format',
      sql`cron_expression IS NULL OR (LENGTH(cron_expression) BETWEEN 5 AND 100 AND cron_expression ~ '^[0-9*,/-]+\\s+[0-9*,/-]+\\s+[0-9*,/-]+\\s+[0-9*,/-]+\\s+[0-9*,/-]+\\s*([0-9*,/-]+)?$')`
    )
    .execute();

  // Add share token length validation for security (minimum entropy)
  await db.schema
    .alterTable('search_shares')
    .addCheckConstraint(
      'check_token_length',
      sql`share_token IS NULL OR LENGTH(share_token) >= 32`
    )
    .execute();

  // Add color code validation (hex format)
  await db.schema
    .alterTable('search_collections')
    .addCheckConstraint(
      'check_color_format',
      sql`color IS NULL OR color ~ '^#[0-9A-Fa-f]{6}$'`
    )
    .execute();

  // Add search name length validation
  await db.schema
    .alterTable('saved_searches')
    .addCheckConstraint(
      'check_name_length',
      sql`LENGTH(TRIM(name)) BETWEEN 1 AND 200`
    )
    .execute();

  // Add collection name length validation
  await db.schema
    .alterTable('search_collections')
    .addCheckConstraint(
      'check_collection_name_length',
      sql`LENGTH(TRIM(name)) BETWEEN 1 AND 200`
    )
    .execute();

  // Add execution count validation (non-negative)
  await db.schema
    .alterTable('saved_searches')
    .addCheckConstraint(
      'check_execution_count',
      sql`execution_count >= 0`
    )
    .execute();

  await db.schema
    .alterTable('search_schedules')
    .addCheckConstraint(
      'check_schedule_execution_count',
      sql`execution_count >= 0`
    )
    .execute();

  // Add max executions validation
  await db.schema
    .alterTable('search_schedules')
    .addCheckConstraint(
      'check_max_executions',
      sql`max_executions IS NULL OR max_executions > 0`
    )
    .execute();

  // Add execution time validation (positive)
  await db.schema
    .alterTable('search_executions')
    .addCheckConstraint(
      'check_execution_time',
      sql`execution_time_ms IS NULL OR execution_time_ms >= 0`
    )
    .execute();

  // Add result count validation (non-negative)
  await db.schema
    .alterTable('search_executions')
    .addCheckConstraint(
      'check_result_count',
      sql`result_count IS NULL OR result_count >= 0`
    )
    .execute();

  await db.schema
    .alterTable('search_analytics')
    .addCheckConstraint(
      'check_analytics_result_count',
      sql`result_count IS NULL OR result_count >= 0`
    )
    .execute();

  // Add click position validation (positive)
  await db.schema
    .alterTable('search_analytics')
    .addCheckConstraint(
      'check_click_position',
      sql`click_position IS NULL OR click_position > 0`
    )
    .execute();

  // Add dwell time validation (non-negative)
  await db.schema
    .alterTable('search_analytics')
    .addCheckConstraint(
      'check_dwell_time',
      sql`dwell_time_seconds IS NULL OR dwell_time_seconds >= 0`
    )
    .execute();

  // Add version number validation (positive)
  await db.schema
    .alterTable('search_versions')
    .addCheckConstraint(
      'check_version_number',
      sql`version_number > 0`
    )
    .execute();

  // Add sort order validation
  await db.schema
    .alterTable('search_collections')
    .addCheckConstraint(
      'check_sort_order',
      sql`sort_order >= 0`
    )
    .execute();

  // Add icon field length validation
  await db.schema
    .alterTable('search_collections')
    .addCheckConstraint(
      'check_icon_length',
      sql`icon IS NULL OR LENGTH(icon) BETWEEN 1 AND 50`
    )
    .execute();

  // Ensure expires_at is in the future when set
  await db.schema
    .alterTable('search_shares')
    .addCheckConstraint(
      'check_expires_at_future',
      sql`expires_at IS NULL OR expires_at > created_at`
    )
    .execute();

  // Ensure schedule dates are logical
  await db.schema
    .alterTable('search_schedules')
    .addCheckConstraint(
      'check_schedule_dates',
      sql`next_execution_at IS NULL OR last_execution_at IS NULL OR next_execution_at >= last_execution_at`
    )
    .execute();

  console.log('Migration 023 completed successfully');
}

export async function down(db: Kysely<Database>): Promise<void> {
  console.log('Rolling back migration 023: Enhanced validation constraints...');

  // Drop all added constraints
  const constraints = [
    { table: 'search_schedules', constraint: 'check_valid_timezone' },
    { table: 'search_schedules', constraint: 'check_cron_format' },
    { table: 'search_shares', constraint: 'check_token_length' },
    { table: 'search_collections', constraint: 'check_color_format' },
    { table: 'saved_searches', constraint: 'check_name_length' },
    { table: 'search_collections', constraint: 'check_collection_name_length' },
    { table: 'saved_searches', constraint: 'check_execution_count' },
    { table: 'search_schedules', constraint: 'check_schedule_execution_count' },
    { table: 'search_schedules', constraint: 'check_max_executions' },
    { table: 'search_executions', constraint: 'check_execution_time' },
    { table: 'search_executions', constraint: 'check_result_count' },
    { table: 'search_analytics', constraint: 'check_analytics_result_count' },
    { table: 'search_analytics', constraint: 'check_click_position' },
    { table: 'search_analytics', constraint: 'check_dwell_time' },
    { table: 'search_versions', constraint: 'check_version_number' },
    { table: 'search_collections', constraint: 'check_sort_order' },
    { table: 'search_collections', constraint: 'check_icon_length' },
    { table: 'search_shares', constraint: 'check_expires_at_future' },
    { table: 'search_schedules', constraint: 'check_schedule_dates' },
  ];

  for (const { table, constraint } of constraints) {
    try {
      await db.schema
        .alterTable(table as any)
        .dropConstraint(constraint)
        .ifExists()
        .execute();
    } catch (error) {
      console.warn(`Failed to drop constraint ${constraint} from ${table}:`, error);
    }
  }

  console.log('Migration 023 rollback completed');
}