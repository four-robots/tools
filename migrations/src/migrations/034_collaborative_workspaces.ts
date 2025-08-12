import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // Collaborative Workspaces table
  await db.schema
    .createTable('collaborative_workspaces')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('name', 'varchar(255)', (col) => col.notNull())
    .addColumn('description', 'text')
    .addColumn('tenant_id', 'uuid', (col) => col.notNull())
    .addColumn('owner_id', 'uuid', (col) => col.notNull())
    .addColumn('template_id', 'uuid')
    .addColumn('status', 'varchar(50)', (col) => col.notNull().defaultTo('active'))
    .addColumn('settings', 'jsonb', (col) => col.defaultTo('{}'))
    .addColumn('metadata', 'jsonb', (col) => col.defaultTo('{}'))
    .addColumn('visibility', 'varchar(20)', (col) => col.notNull().defaultTo('private'))
    .addColumn('max_members', 'integer', (col) => col.defaultTo(100))
    .addColumn('current_members', 'integer', (col) => col.defaultTo(1))
    .addColumn('created_at', 'timestamptz', (col) => col.defaultTo(sql`NOW()`).notNull())
    .addColumn('updated_at', 'timestamptz', (col) => col.defaultTo(sql`NOW()`).notNull())
    .addColumn('deleted_at', 'timestamptz')
    .execute();

  // Workspace members table for role management
  await db.schema
    .createTable('workspace_members')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('workspace_id', 'uuid', (col) => col.notNull().references('collaborative_workspaces.id').onDelete('cascade'))
    .addColumn('user_id', 'uuid', (col) => col.notNull())
    .addColumn('role', 'varchar(50)', (col) => col.notNull().defaultTo('member'))
    .addColumn('permissions', 'jsonb', (col) => col.defaultTo('{}'))
    .addColumn('invited_by', 'uuid')
    .addColumn('joined_at', 'timestamptz', (col) => col.defaultTo(sql`NOW()`).notNull())
    .addColumn('status', 'varchar(20)', (col) => col.notNull().defaultTo('active'))
    .addColumn('last_active_at', 'timestamptz')
    .addColumn('notification_settings', 'jsonb', (col) => col.defaultTo('{}'))
    .addColumn('created_at', 'timestamptz', (col) => col.defaultTo(sql`NOW()`).notNull())
    .addColumn('updated_at', 'timestamptz', (col) => col.defaultTo(sql`NOW()`).notNull())
    .execute();

  // Workspace sessions for real-time collaboration
  await db.schema
    .createTable('workspace_sessions')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('workspace_id', 'uuid', (col) => col.notNull().references('collaborative_workspaces.id').onDelete('cascade'))
    .addColumn('user_id', 'uuid', (col) => col.notNull())
    .addColumn('session_token', 'varchar(255)', (col) => col.notNull().unique())
    .addColumn('connection_id', 'varchar(255)')
    .addColumn('client_info', 'jsonb', (col) => col.defaultTo('{}'))
    .addColumn('presence_data', 'jsonb', (col) => col.defaultTo('{}'))
    .addColumn('cursor_position', 'jsonb')
    .addColumn('active_tool', 'varchar(100)')
    .addColumn('active_resource', 'varchar(255)')
    .addColumn('started_at', 'timestamptz', (col) => col.defaultTo(sql`NOW()`).notNull())
    .addColumn('last_activity_at', 'timestamptz', (col) => col.defaultTo(sql`NOW()`).notNull())
    .addColumn('ended_at', 'timestamptz')
    .addColumn('status', 'varchar(20)', (col) => col.notNull().defaultTo('active'))
    .execute();

  // Workspace templates for reusable configurations
  await db.schema
    .createTable('workspace_templates')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('name', 'varchar(255)', (col) => col.notNull())
    .addColumn('description', 'text')
    .addColumn('category', 'varchar(100)', (col) => col.notNull())
    .addColumn('template_data', 'jsonb', (col) => col.notNull())
    .addColumn('default_settings', 'jsonb', (col) => col.defaultTo('{}'))
    .addColumn('required_tools', 'text[]', (col) => col.defaultTo(sql`ARRAY[]::text[]`))
    .addColumn('is_public', 'boolean', (col) => col.defaultTo(false))
    .addColumn('created_by', 'uuid')
    .addColumn('usage_count', 'integer', (col) => col.defaultTo(0))
    .addColumn('rating', 'decimal(2,1)')
    .addColumn('tags', 'text[]', (col) => col.defaultTo(sql`ARRAY[]::text[]`))
    .addColumn('created_at', 'timestamptz', (col) => col.defaultTo(sql`NOW()`).notNull())
    .addColumn('updated_at', 'timestamptz', (col) => col.defaultTo(sql`NOW()`).notNull())
    .execute();

  // Workspace activity log for audit trails
  await db.schema
    .createTable('workspace_activity_log')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('workspace_id', 'uuid', (col) => col.notNull().references('collaborative_workspaces.id').onDelete('cascade'))
    .addColumn('user_id', 'uuid', (col) => col.notNull())
    .addColumn('action', 'varchar(100)', (col) => col.notNull())
    .addColumn('resource_type', 'varchar(50)')
    .addColumn('resource_id', 'varchar(255)')
    .addColumn('details', 'jsonb', (col) => col.defaultTo('{}'))
    .addColumn('metadata', 'jsonb', (col) => col.defaultTo('{}'))
    .addColumn('ip_address', 'varchar(45)')
    .addColumn('user_agent', 'text')
    .addColumn('session_id', 'varchar(255)')
    .addColumn('created_at', 'timestamptz', (col) => col.defaultTo(sql`NOW()`).notNull())
    .execute();

  // Workspace settings for configuration storage
  await db.schema
    .createTable('workspace_settings')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('workspace_id', 'uuid', (col) => col.notNull().references('collaborative_workspaces.id').onDelete('cascade'))
    .addColumn('category', 'varchar(100)', (col) => col.notNull())
    .addColumn('key', 'varchar(255)', (col) => col.notNull())
    .addColumn('value', 'jsonb', (col) => col.notNull())
    .addColumn('default_value', 'jsonb')
    .addColumn('description', 'text')
    .addColumn('data_type', 'varchar(50)', (col) => col.notNull())
    .addColumn('validation_rules', 'jsonb', (col) => col.defaultTo('{}'))
    .addColumn('is_sensitive', 'boolean', (col) => col.defaultTo(false))
    .addColumn('created_at', 'timestamptz', (col) => col.defaultTo(sql`NOW()`).notNull())
    .addColumn('updated_at', 'timestamptz', (col) => col.defaultTo(sql`NOW()`).notNull())
    .execute();

  // Workspace resources for file/asset management
  await db.schema
    .createTable('workspace_resources')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('workspace_id', 'uuid', (col) => col.notNull().references('collaborative_workspaces.id').onDelete('cascade'))
    .addColumn('name', 'varchar(255)', (col) => col.notNull())
    .addColumn('type', 'varchar(50)', (col) => col.notNull())
    .addColumn('file_path', 'text')
    .addColumn('file_size', 'bigint')
    .addColumn('mime_type', 'varchar(255)')
    .addColumn('checksum', 'varchar(255)')
    .addColumn('metadata', 'jsonb', (col) => col.defaultTo('{}'))
    .addColumn('tags', 'text[]', (col) => col.defaultTo(sql`ARRAY[]::text[]`))
    .addColumn('uploaded_by', 'uuid', (col) => col.notNull())
    .addColumn('access_level', 'varchar(20)', (col) => col.notNull().defaultTo('workspace'))
    .addColumn('download_count', 'integer', (col) => col.defaultTo(0))
    .addColumn('created_at', 'timestamptz', (col) => col.defaultTo(sql`NOW()`).notNull())
    .addColumn('updated_at', 'timestamptz', (col) => col.defaultTo(sql`NOW()`).notNull())
    .addColumn('deleted_at', 'timestamptz')
    .execute();

  // Workspace integrations for external tool connections
  await db.schema
    .createTable('workspace_integrations')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('workspace_id', 'uuid', (col) => col.notNull().references('collaborative_workspaces.id').onDelete('cascade'))
    .addColumn('integration_type', 'varchar(100)', (col) => col.notNull())
    .addColumn('external_id', 'varchar(255)')
    .addColumn('configuration', 'jsonb', (col) => col.notNull())
    .addColumn('credentials', 'jsonb')
    .addColumn('status', 'varchar(20)', (col) => col.notNull().defaultTo('active'))
    .addColumn('last_sync_at', 'timestamptz')
    .addColumn('sync_frequency', 'varchar(50)')
    .addColumn('error_count', 'integer', (col) => col.defaultTo(0))
    .addColumn('last_error', 'text')
    .addColumn('created_by', 'uuid', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) => col.defaultTo(sql`NOW()`).notNull())
    .addColumn('updated_at', 'timestamptz', (col) => col.defaultTo(sql`NOW()`).notNull())
    .execute();

  // Create indexes for performance optimization
  
  // Workspace indexes
  await db.schema.createIndex('idx_workspaces_tenant_id').on('collaborative_workspaces').column('tenant_id').execute();
  await db.schema.createIndex('idx_workspaces_owner_id').on('collaborative_workspaces').column('owner_id').execute();
  await db.schema.createIndex('idx_workspaces_template_id').on('collaborative_workspaces').column('template_id').execute();
  await db.schema.createIndex('idx_workspaces_status').on('collaborative_workspaces').column('status').execute();
  await db.schema.createIndex('idx_workspaces_visibility').on('collaborative_workspaces').column('visibility').execute();

  // Member indexes
  await db.schema.createIndex('idx_workspace_members_workspace_id').on('workspace_members').column('workspace_id').execute();
  await db.schema.createIndex('idx_workspace_members_user_id').on('workspace_members').column('user_id').execute();
  await db.schema.createIndex('idx_workspace_members_role').on('workspace_members').column('role').execute();
  await db.schema.createIndex('idx_workspace_members_status').on('workspace_members').column('status').execute();

  // Session indexes
  await db.schema.createIndex('idx_workspace_sessions_workspace_id').on('workspace_sessions').column('workspace_id').execute();
  await db.schema.createIndex('idx_workspace_sessions_user_id').on('workspace_sessions').column('user_id').execute();
  await db.schema.createIndex('idx_workspace_sessions_token').on('workspace_sessions').column('session_token').execute();
  await db.schema.createIndex('idx_workspace_sessions_status').on('workspace_sessions').column('status').execute();
  await db.schema.createIndex('idx_workspace_sessions_activity').on('workspace_sessions').column('last_activity_at').execute();

  // Template indexes
  await db.schema.createIndex('idx_workspace_templates_category').on('workspace_templates').column('category').execute();
  await db.schema.createIndex('idx_workspace_templates_public').on('workspace_templates').column('is_public').execute();
  await db.schema.createIndex('idx_workspace_templates_created_by').on('workspace_templates').column('created_by').execute();
  await db.schema.createIndex('idx_workspace_templates_usage').on('workspace_templates').column('usage_count').execute();

  // Activity log indexes
  await db.schema.createIndex('idx_activity_log_workspace_id').on('workspace_activity_log').column('workspace_id').execute();
  await db.schema.createIndex('idx_activity_log_user_id').on('workspace_activity_log').column('user_id').execute();
  await db.schema.createIndex('idx_activity_log_action').on('workspace_activity_log').column('action').execute();
  await db.schema.createIndex('idx_activity_log_resource_type').on('workspace_activity_log').column('resource_type').execute();
  await db.schema.createIndex('idx_activity_log_created_at').on('workspace_activity_log').column('created_at').execute();

  // Settings indexes
  await db.schema.createIndex('idx_workspace_settings_workspace_id').on('workspace_settings').column('workspace_id').execute();
  await db.schema.createIndex('idx_workspace_settings_category').on('workspace_settings').column('category').execute();
  await db.schema.createIndex('idx_workspace_settings_key').on('workspace_settings').column('key').execute();

  // Resources indexes
  await db.schema.createIndex('idx_workspace_resources_workspace_id').on('workspace_resources').column('workspace_id').execute();
  await db.schema.createIndex('idx_workspace_resources_type').on('workspace_resources').column('type').execute();
  await db.schema.createIndex('idx_workspace_resources_uploaded_by').on('workspace_resources').column('uploaded_by').execute();
  await db.schema.createIndex('idx_workspace_resources_created_at').on('workspace_resources').column('created_at').execute();

  // Integration indexes
  await db.schema.createIndex('idx_workspace_integrations_workspace_id').on('workspace_integrations').column('workspace_id').execute();
  await db.schema.createIndex('idx_workspace_integrations_type').on('workspace_integrations').column('integration_type').execute();
  await db.schema.createIndex('idx_workspace_integrations_status').on('workspace_integrations').column('status').execute();

  // Composite indexes for common queries
  await db.schema.createIndex('idx_workspace_members_workspace_user').on('workspace_members').columns(['workspace_id', 'user_id']).execute();
  await db.schema.createIndex('idx_workspace_sessions_workspace_user').on('workspace_sessions').columns(['workspace_id', 'user_id']).execute();
  await db.schema.createIndex('idx_workspace_settings_workspace_category').on('workspace_settings').columns(['workspace_id', 'category']).execute();
  await db.schema.createIndex('idx_activity_log_workspace_action').on('workspace_activity_log').columns(['workspace_id', 'action']).execute();

  console.log('✅ Collaborative workspaces migration completed');
}

export async function down(db: Kysely<any>): Promise<void> {
  // Drop tables in reverse order due to foreign key constraints
  await db.schema.dropTable('workspace_integrations').execute();
  await db.schema.dropTable('workspace_resources').execute();
  await db.schema.dropTable('workspace_settings').execute();
  await db.schema.dropTable('workspace_activity_log').execute();
  await db.schema.dropTable('workspace_templates').execute();
  await db.schema.dropTable('workspace_sessions').execute();
  await db.schema.dropTable('workspace_members').execute();
  await db.schema.dropTable('collaborative_workspaces').execute();
  
  console.log('✅ Collaborative workspaces migration rolled back');
}