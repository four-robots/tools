import { sql, type Kysely } from 'kysely';
import { PostgresDialect } from 'kysely';
import type { Database } from '../database/connection.js';

/**
 * Migration 024: Search Alerts & Notifications System
 * 
 * Creates comprehensive search alerts and notifications with:
 * - Alert definitions and configuration
 * - Multi-channel notification templates
 * - Alert execution history and tracking
 * - Notification delivery status
 * - Alert subscriptions and preferences
 * - Rate limiting for spam prevention
 */
export async function up(db: Kysely<Database>): Promise<void> {
  console.log('Running migration 024: Search Alerts & Notifications system...');

  // Notification templates for customizable messages
  await db.schema
    .createTable('notification_templates')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('owner_id', 'uuid', (col) => col.notNull())
    .addColumn('name', 'varchar(255)', (col) => col.notNull())
    .addColumn('template_type', 'varchar(50)', (col) => col.notNull())
    .addColumn('subject_template', 'text')
    .addColumn('body_template', 'text', (col) => col.notNull())
    .addColumn('template_variables', 'jsonb', (col) => col.defaultTo(sql`'{}'::jsonb`))
    .addColumn('format', 'varchar(20)', (col) => col.defaultTo('plain'))
    .addColumn('styling_options', 'jsonb', (col) => col.defaultTo(sql`'{}'::jsonb`))
    .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn('updated_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute();

  // Core alert definitions
  await db.schema
    .createTable('alert_definitions')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('saved_search_id', 'uuid', (col) => col.notNull().references('saved_searches.id').onDelete('cascade'))
    .addColumn('owner_id', 'uuid', (col) => col.notNull())
    .addColumn('name', 'varchar(255)', (col) => col.notNull())
    .addColumn('description', 'text')
    .addColumn('is_active', 'boolean', (col) => col.defaultTo(true))
    
    // Alert conditions
    .addColumn('trigger_conditions', 'jsonb', (col) => col.notNull().defaultTo(sql`'{}'::jsonb`))
    .addColumn('result_threshold', 'integer')
    .addColumn('change_detection', 'boolean', (col) => col.defaultTo(false))
    
    // Scheduling
    .addColumn('schedule_type', 'varchar(50)', (col) => col.notNull().defaultTo('manual'))
    .addColumn('schedule_config', 'jsonb', (col) => col.notNull().defaultTo(sql`'{}'::jsonb`))
    .addColumn('timezone', 'varchar(100)', (col) => col.defaultTo('UTC'))
    
    // Notification settings  
    .addColumn('notification_channels', 'jsonb', (col) => col.notNull().defaultTo(sql`'[]'::jsonb`))
    .addColumn('notification_template_id', 'uuid', (col) => col.references('notification_templates.id'))
    
    // Alert limits
    .addColumn('max_alerts_per_day', 'integer', (col) => col.defaultTo(10))
    .addColumn('max_alerts_per_hour', 'integer', (col) => col.defaultTo(2))
    
    // Metadata
    .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn('updated_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn('last_triggered_at', 'timestamp')
    .addColumn('next_scheduled_at', 'timestamp')
    .execute();

  // Alert execution history
  await db.schema
    .createTable('alert_executions')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('alert_definition_id', 'uuid', (col) => col.notNull().references('alert_definitions.id').onDelete('cascade'))
    
    // Execution details
    .addColumn('executed_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn('execution_duration_ms', 'integer')
    .addColumn('trigger_reason', 'varchar(100)')
    
    // Search results
    .addColumn('search_executed', 'boolean', (col) => col.defaultTo(false))
    .addColumn('result_count', 'integer')
    .addColumn('result_summary', 'jsonb')
    .addColumn('results_changed', 'boolean', (col) => col.defaultTo(false))
    .addColumn('change_summary', 'jsonb')
    
    // Execution status
    .addColumn('status', 'varchar(20)', (col) => col.notNull().defaultTo('pending'))
    .addColumn('error_message', 'text')
    
    // Notifications sent
    .addColumn('notifications_sent', 'integer', (col) => col.defaultTo(0))
    .addColumn('notification_failures', 'integer', (col) => col.defaultTo(0))
    .addColumn('notification_details', 'jsonb', (col) => col.defaultTo(sql`'{}'::jsonb`))
    .execute();

  // Individual notification deliveries
  await db.schema
    .createTable('alert_notifications')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('alert_execution_id', 'uuid', (col) => col.notNull().references('alert_executions.id').onDelete('cascade'))
    
    // Notification details
    .addColumn('channel_type', 'varchar(50)', (col) => col.notNull())
    .addColumn('recipient', 'varchar(255)', (col) => col.notNull())
    
    // Delivery tracking
    .addColumn('sent_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn('delivery_status', 'varchar(20)', (col) => col.defaultTo('pending'))
    .addColumn('delivery_attempted_at', 'timestamp')
    .addColumn('delivery_confirmed_at', 'timestamp')
    
    // Content
    .addColumn('subject', 'text')
    .addColumn('message_body', 'text')
    .addColumn('message_format', 'varchar(20)', (col) => col.defaultTo('plain'))
    
    // Error handling
    .addColumn('retry_count', 'integer', (col) => col.defaultTo(0))
    .addColumn('max_retries', 'integer', (col) => col.defaultTo(3))
    .addColumn('error_message', 'text')
    .addColumn('error_code', 'varchar(50)')
    
    // Engagement tracking
    .addColumn('opened_at', 'timestamp')
    .addColumn('clicked_at', 'timestamp')
    .execute();

  // Alert subscription management
  await db.schema
    .createTable('alert_subscriptions')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('alert_definition_id', 'uuid', (col) => col.notNull().references('alert_definitions.id').onDelete('cascade'))
    .addColumn('subscriber_id', 'uuid', (col) => col.notNull())
    
    // Subscription preferences
    .addColumn('subscription_type', 'varchar(20)', (col) => col.defaultTo('standard'))
    .addColumn('notification_channels', 'jsonb', (col) => col.notNull().defaultTo(sql`'["in_app"]'::jsonb`))
    .addColumn('frequency_override', 'varchar(50)')
    
    // Subscription status
    .addColumn('is_active', 'boolean', (col) => col.defaultTo(true))
    .addColumn('subscribed_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn('unsubscribed_at', 'timestamp')
    .addColumn('unsubscribe_reason', 'varchar(255)')
    .execute();

  // Alert rate limiting to prevent spam
  await db.schema
    .createTable('alert_rate_limits')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('owner_id', 'uuid', (col) => col.notNull())
    
    // Rate limit settings
    .addColumn('limit_type', 'varchar(50)', (col) => col.notNull())
    .addColumn('limit_count', 'integer', (col) => col.notNull())
    .addColumn('current_count', 'integer', (col) => col.defaultTo(0))
    
    // Time window
    .addColumn('window_start', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn('window_end', 'timestamp')
    
    // Reset tracking
    .addColumn('last_reset_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute();

  // Create strategic indexes for performance
  console.log('Creating indexes for alert tables...');

  // Notification templates indexes
  await db.schema
    .createIndex('idx_notification_templates_owner')
    .on('notification_templates')
    .column('owner_id')
    .execute();

  await db.schema
    .createIndex('idx_notification_templates_type')
    .on('notification_templates')
    .column('template_type')
    .execute();

  // Alert definitions indexes
  await db.schema
    .createIndex('idx_alert_definitions_search')
    .on('alert_definitions')
    .column('saved_search_id')
    .execute();

  await db.schema
    .createIndex('idx_alert_definitions_owner')
    .on('alert_definitions')
    .column('owner_id')
    .execute();

  await db.schema
    .createIndex('idx_alert_definitions_active')
    .on('alert_definitions')
    .columns(['is_active', 'next_scheduled_at'])
    .where('is_active', '=', true)
    .execute();

  await db.schema
    .createIndex('idx_alert_definitions_schedule_type')
    .on('alert_definitions')
    .column('schedule_type')
    .execute();

  // Alert executions indexes
  await db.schema
    .createIndex('idx_alert_executions_alert')
    .on('alert_executions')
    .columns(['alert_definition_id', 'executed_at'])
    .execute();

  await db.schema
    .createIndex('idx_alert_executions_status')
    .on('alert_executions')
    .columns(['status', 'executed_at'])
    .execute();

  // Alert notifications indexes
  await db.schema
    .createIndex('idx_alert_notifications_execution')
    .on('alert_notifications')
    .column('alert_execution_id')
    .execute();

  await db.schema
    .createIndex('idx_alert_notifications_delivery')
    .on('alert_notifications')
    .columns(['delivery_status', 'sent_at'])
    .execute();

  await db.schema
    .createIndex('idx_alert_notifications_channel')
    .on('alert_notifications')
    .column('channel_type')
    .execute();

  await db.schema
    .createIndex('idx_alert_notifications_retry')
    .on('alert_notifications')
    .columns(['retry_count', 'delivery_status'])
    .where('delivery_status', '=', 'failed')
    .execute();

  // Alert subscriptions indexes
  await db.schema
    .createIndex('idx_alert_subscriptions_alert')
    .on('alert_subscriptions')
    .column('alert_definition_id')
    .execute();

  await db.schema
    .createIndex('idx_alert_subscriptions_subscriber')
    .on('alert_subscriptions')
    .column('subscriber_id')
    .execute();

  await db.schema
    .createIndex('idx_alert_subscriptions_active')
    .on('alert_subscriptions')
    .columns(['is_active', 'subscriber_id'])
    .where('is_active', '=', true)
    .execute();

  // Alert rate limits indexes
  await db.schema
    .createIndex('idx_alert_rate_limits_owner')
    .on('alert_rate_limits')
    .columns(['owner_id', 'limit_type'])
    .execute();

  await db.schema
    .createIndex('idx_alert_rate_limits_window')
    .on('alert_rate_limits')
    .columns(['window_start', 'window_end'])
    .execute();

  // Add unique constraints
  await db.schema
    .alterTable('alert_subscriptions')
    .addUniqueConstraint('unique_alert_subscription', ['alert_definition_id', 'subscriber_id'])
    .execute();

  await db.schema
    .alterTable('alert_rate_limits')
    .addUniqueConstraint('unique_rate_limit', ['owner_id', 'limit_type'])
    .execute();

  // Add check constraints
  await db.schema
    .alterTable('notification_templates')
    .addCheckConstraint('check_template_type', sql`template_type IN ('email', 'in_app', 'webhook', 'sms')`)
    .execute();

  await db.schema
    .alterTable('notification_templates')
    .addCheckConstraint('check_format', sql`format IN ('plain', 'html', 'markdown')`)
    .execute();

  await db.schema
    .alterTable('alert_definitions')
    .addCheckConstraint('check_schedule_type', sql`schedule_type IN ('manual', 'interval', 'cron', 'real_time')`)
    .execute();

  await db.schema
    .alterTable('alert_executions')
    .addCheckConstraint('check_execution_status', sql`status IN ('pending', 'success', 'failed', 'partial', 'cancelled')`)
    .execute();

  await db.schema
    .alterTable('alert_notifications')
    .addCheckConstraint('check_channel_type', sql`channel_type IN ('email', 'in_app', 'webhook', 'sms')`)
    .execute();

  await db.schema
    .alterTable('alert_notifications')
    .addCheckConstraint('check_delivery_status', sql`delivery_status IN ('pending', 'sent', 'delivered', 'failed', 'bounced', 'expired')`)
    .execute();

  await db.schema
    .alterTable('alert_subscriptions')
    .addCheckConstraint('check_subscription_type', sql`subscription_type IN ('standard', 'digest', 'summary')`)
    .execute();

  await db.schema
    .alterTable('alert_rate_limits')
    .addCheckConstraint('check_limit_type', sql`limit_type IN ('hourly', 'daily', 'weekly', 'monthly')`)
    .execute();

  // Add foreign key constraints with proper references
  await db.schema
    .alterTable('alert_definitions')
    .addForeignKeyConstraint('fk_alert_owner', ['owner_id'], 'saved_searches', ['owner_id'])
    .execute();

  await db.schema
    .alterTable('notification_templates')
    .addForeignKeyConstraint('fk_template_owner', ['owner_id'], 'saved_searches', ['owner_id'])
    .execute();

  await db.schema
    .alterTable('alert_subscriptions')
    .addForeignKeyConstraint('fk_subscriber', ['subscriber_id'], 'saved_searches', ['owner_id'])
    .execute();

  await db.schema
    .alterTable('alert_rate_limits')
    .addForeignKeyConstraint('fk_rate_limit_owner', ['owner_id'], 'saved_searches', ['owner_id'])
    .execute();

  console.log('Migration 024 completed successfully');
}

export async function down(db: Kysely<Database>): Promise<void> {
  console.log('Rolling back migration 024: Search Alerts & Notifications system...');

  // Drop tables in reverse dependency order
  await db.schema.dropTable('alert_rate_limits').ifExists().execute();
  await db.schema.dropTable('alert_subscriptions').ifExists().execute();
  await db.schema.dropTable('alert_notifications').ifExists().execute();
  await db.schema.dropTable('alert_executions').ifExists().execute();
  await db.schema.dropTable('alert_definitions').ifExists().execute();
  await db.schema.dropTable('notification_templates').ifExists().execute();

  console.log('Migration 024 rollback completed');
}