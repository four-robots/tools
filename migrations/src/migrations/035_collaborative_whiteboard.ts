import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // Collaborative Whiteboards table - main whiteboard metadata
  await db.schema
    .createTable('whiteboards')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('workspace_id', 'uuid', (col) => col.notNull().references('collaborative_workspaces.id').onDelete('cascade'))
    .addColumn('name', 'varchar(255)', (col) => col.notNull())
    .addColumn('description', 'text')
    .addColumn('thumbnail', 'text') // Base64 encoded thumbnail or URL
    .addColumn('canvas_data', 'jsonb', (col) => col.defaultTo('{}').check(
      sql`jsonb_typeof(canvas_data) = 'object'`
    )) // Core canvas metadata with object validation
    .addColumn('settings', 'jsonb', (col) => col.defaultTo('{}')) // Whiteboard-specific settings
    .addColumn('template_id', 'uuid') // Reference to whiteboard templates
    .addColumn('is_template', 'boolean', (col) => col.defaultTo(false))
    .addColumn('visibility', 'varchar(20)', (col) => col.notNull().defaultTo('workspace').check(
      sql`visibility IN ('workspace', 'members', 'public')`
    )) // Restricted visibility values
    .addColumn('status', 'varchar(20)', (col) => col.notNull().defaultTo('active').check(
      sql`status IN ('active', 'archived', 'deleted')`
    )) // Restricted status values
    .addColumn('version', 'integer', (col) => col.defaultTo(1)) // Version for conflict resolution
    .addColumn('created_by', 'uuid', (col) => col.notNull())
    .addColumn('last_modified_by', 'uuid', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
    .addColumn('updated_at', 'timestamptz', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
    .addColumn('deleted_at', 'timestamptz')
    .execute();

  // Whiteboard elements table - individual canvas objects (shapes, text, images, etc.)
  await db.schema
    .createTable('whiteboard_elements')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('whiteboard_id', 'uuid', (col) => col.notNull().references('whiteboards.id').onDelete('cascade'))
    .addColumn('element_type', 'varchar(50)', (col) => col.notNull()) // shape, text, image, sticky_note, arrow, line, etc.
    .addColumn('element_data', 'jsonb', (col) => col.notNull().check(
      sql`jsonb_typeof(element_data) = 'object' AND 
          element_data ? 'id' AND
          jsonb_typeof(element_data->'id') = 'string'`
    )) // Flexible storage for element properties with basic validation
    .addColumn('layer_index', 'integer', (col) => col.defaultTo(0)) // Z-index for layering
    .addColumn('parent_id', 'uuid') // For grouped elements
    .addColumn('locked', 'boolean', (col) => col.defaultTo(false))
    .addColumn('visible', 'boolean', (col) => col.defaultTo(true))
    .addColumn('style_data', 'jsonb', (col) => col.defaultTo('{}')) // Styling properties (colors, fonts, borders, etc.)
    .addColumn('metadata', 'jsonb', (col) => col.defaultTo('{}')) // Additional properties
    .addColumn('version', 'integer', (col) => col.defaultTo(1)) // Element version for conflict resolution
    .addColumn('created_by', 'uuid', (col) => col.notNull())
    .addColumn('last_modified_by', 'uuid', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
    .addColumn('updated_at', 'timestamptz', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
    .addColumn('deleted_at', 'timestamptz')
    .execute();

  // Whiteboard sessions table - real-time collaboration tracking
  await db.schema
    .createTable('whiteboard_sessions')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('whiteboard_id', 'uuid', (col) => col.notNull().references('whiteboards.id').onDelete('cascade'))
    .addColumn('user_id', 'uuid', (col) => col.notNull())
    .addColumn('session_token', 'varchar(255)', (col) => col.notNull().unique())
    .addColumn('connection_id', 'varchar(255)') // WebSocket connection identifier
    .addColumn('cursor_position', 'jsonb', (col) => col.check(
      sql`cursor_position IS NULL OR jsonb_typeof(cursor_position) = 'object'`
    )) // Real-time cursor tracking with validation
    .addColumn('selection_data', 'jsonb', (col) => col.check(
      sql`selection_data IS NULL OR jsonb_typeof(selection_data) = 'object'`
    )) // Currently selected elements with validation
    .addColumn('viewport_data', 'jsonb', (col) => col.check(
      sql`viewport_data IS NULL OR jsonb_typeof(viewport_data) = 'object'`
    )) // Current view position and zoom with validation
    .addColumn('presence_data', 'jsonb', (col) => col.defaultTo('{}').check(
      sql`jsonb_typeof(presence_data) = 'object'`
    )) // User presence information with validation
    .addColumn('tools_state', 'jsonb', (col) => col.defaultTo('{}').check(
      sql`jsonb_typeof(tools_state) = 'object'`
    )) // Active tool and tool settings with validation
    .addColumn('is_active', 'boolean', (col) => col.defaultTo(true))
    .addColumn('permissions', 'jsonb', (col) => col.defaultTo('{}').check(
      sql`jsonb_typeof(permissions) = 'object'`
    )) // Session-specific permissions with validation
    .addColumn('started_at', 'timestamptz', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
    .addColumn('last_activity_at', 'timestamptz', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
    .addColumn('ended_at', 'timestamptz')
    .execute();

  // Whiteboard permissions table - granular access control
  await db.schema
    .createTable('whiteboard_permissions')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('whiteboard_id', 'uuid', (col) => col.notNull().references('whiteboards.id').onDelete('cascade'))
    .addColumn('user_id', 'uuid', (col) => col.notNull())
    .addColumn('role', 'varchar(50)', (col) => col.notNull().check(
      sql`role IN ('owner', 'editor', 'commenter', 'viewer', 'custom')`
    )) // Restricted role values
    .addColumn('permissions', 'jsonb', (col) => col.notNull().check(
      sql`jsonb_typeof(permissions) = 'object' AND 
          permissions ? 'canView' AND 
          jsonb_typeof(permissions->'canView') = 'boolean'`
    )) // Detailed permissions object with validation
    .addColumn('granted_by', 'uuid', (col) => col.notNull())
    .addColumn('expires_at', 'timestamptz') // Optional expiration for temporary access
    .addColumn('created_at', 'timestamptz', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
    .addColumn('updated_at', 'timestamptz', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
    .execute();

  // Whiteboard templates table - reusable whiteboard configurations
  await db.schema
    .createTable('whiteboard_templates')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('name', 'varchar(255)', (col) => col.notNull())
    .addColumn('description', 'text')
    .addColumn('category', 'varchar(100)', (col) => col.notNull()) // brainstorming, planning, design, presentation, etc.
    .addColumn('thumbnail', 'text') // Template preview image
    .addColumn('template_data', 'jsonb', (col) => col.notNull()) // Canvas configuration and default elements
    .addColumn('default_settings', 'jsonb', (col) => col.defaultTo('{}')) // Default whiteboard settings
    .addColumn('tags', 'text[]', (col) => col.defaultTo(sql`ARRAY[]::text[]`)) // Template tags for discovery
    .addColumn('is_public', 'boolean', (col) => col.defaultTo(false)) // Public templates available to all workspaces
    .addColumn('workspace_id', 'uuid') // Workspace-specific templates (null for public)
    .addColumn('usage_count', 'integer', (col) => col.defaultTo(0)) // Track template popularity
    .addColumn('rating', 'decimal(2,1)', (col) => col.defaultTo(0)) // User ratings
    .addColumn('created_by', 'uuid', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
    .addColumn('updated_at', 'timestamptz', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
    .execute();

  // Whiteboard activity log table - detailed audit trail
  await db.schema
    .createTable('whiteboard_activity_log')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('whiteboard_id', 'uuid', (col) => col.notNull().references('whiteboards.id').onDelete('cascade'))
    .addColumn('user_id', 'uuid', (col) => col.notNull())
    .addColumn('session_id', 'uuid') // Link to specific session
    .addColumn('action', 'varchar(100)', (col) => col.notNull()) // created, updated, deleted, moved, styled, etc.
    .addColumn('target_type', 'varchar(50)', (col) => col.notNull()) // whiteboard, element, template, permission, etc.
    .addColumn('target_id', 'uuid') // ID of affected object
    .addColumn('action_data', 'jsonb', (col) => col.defaultTo('{}')) // Detailed action information
    .addColumn('old_data', 'jsonb') // Previous state for undo operations
    .addColumn('new_data', 'jsonb') // New state
    .addColumn('operation_id', 'uuid') // Group related operations (e.g., bulk moves)
    .addColumn('client_metadata', 'jsonb', (col) => col.defaultTo('{}')) // Client information
    .addColumn('created_at', 'timestamptz', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
    .execute();

  // Whiteboard comments table - collaborative feedback and discussion
  await db.schema
    .createTable('whiteboard_comments')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('whiteboard_id', 'uuid', (col) => col.notNull().references('whiteboards.id').onDelete('cascade'))
    .addColumn('element_id', 'uuid') // Optional: comment on specific element
    .addColumn('parent_id', 'uuid') // For nested comments/replies
    .addColumn('content', 'text', (col) => col.notNull())
    .addColumn('content_type', 'varchar(20)', (col) => col.defaultTo('text')) // text, markdown
    .addColumn('position', 'jsonb') // Spatial position on canvas
    .addColumn('resolved', 'boolean', (col) => col.defaultTo(false))
    .addColumn('resolved_by', 'uuid')
    .addColumn('resolved_at', 'timestamptz')
    .addColumn('mentions', 'uuid[]', (col) => col.defaultTo(sql`ARRAY[]::uuid[]`)) // User IDs mentioned
    .addColumn('attachments', 'jsonb', (col) => col.defaultTo('{}')) // File attachments
    .addColumn('created_by', 'uuid', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
    .addColumn('updated_at', 'timestamptz', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
    .addColumn('deleted_at', 'timestamptz')
    .execute();

  // Whiteboard versions table - version history for collaboration and conflict resolution
  await db.schema
    .createTable('whiteboard_versions')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('whiteboard_id', 'uuid', (col) => col.notNull().references('whiteboards.id').onDelete('cascade'))
    .addColumn('version_number', 'integer', (col) => col.notNull())
    .addColumn('snapshot_data', 'jsonb', (col) => col.notNull()) // Complete whiteboard state at this version
    .addColumn('changes_summary', 'jsonb', (col) => col.defaultTo('{}')) // Summary of changes from previous version
    .addColumn('change_type', 'varchar(50)', (col) => col.notNull()) // major, minor, auto_save, conflict_resolution
    .addColumn('created_by', 'uuid', (col) => col.notNull())
    .addColumn('commit_message', 'text') // Optional description of changes
    .addColumn('is_automatic', 'boolean', (col) => col.defaultTo(false)) // Auto-saved vs manual save
    .addColumn('created_at', 'timestamptz', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
    .execute();

  // Create performance indexes
  
  // Whiteboard indexes
  await db.schema.createIndex('idx_whiteboards_workspace_id').on('whiteboards').column('workspace_id').execute();
  await db.schema.createIndex('idx_whiteboards_created_by').on('whiteboards').column('created_by').execute();
  await db.schema.createIndex('idx_whiteboards_status').on('whiteboards').column('status').execute();
  await db.schema.createIndex('idx_whiteboards_visibility').on('whiteboards').column('visibility').execute();
  await db.schema.createIndex('idx_whiteboards_template_id').on('whiteboards').column('template_id').execute();
  await db.schema.createIndex('idx_whiteboards_updated_at').on('whiteboards').column('updated_at').execute();

  // Whiteboard elements indexes
  await db.schema.createIndex('idx_whiteboard_elements_whiteboard_id').on('whiteboard_elements').column('whiteboard_id').execute();
  await db.schema.createIndex('idx_whiteboard_elements_type').on('whiteboard_elements').column('element_type').execute();
  await db.schema.createIndex('idx_whiteboard_elements_parent_id').on('whiteboard_elements').column('parent_id').execute();
  await db.schema.createIndex('idx_whiteboard_elements_layer').on('whiteboard_elements').column('layer_index').execute();
  await db.schema.createIndex('idx_whiteboard_elements_created_by').on('whiteboard_elements').column('created_by').execute();
  await db.schema.createIndex('idx_whiteboard_elements_updated_at').on('whiteboard_elements').column('updated_at').execute();

  // Session indexes
  await db.schema.createIndex('idx_whiteboard_sessions_whiteboard_id').on('whiteboard_sessions').column('whiteboard_id').execute();
  await db.schema.createIndex('idx_whiteboard_sessions_user_id').on('whiteboard_sessions').column('user_id').execute();
  await db.schema.createIndex('idx_whiteboard_sessions_token').on('whiteboard_sessions').column('session_token').execute();
  await db.schema.createIndex('idx_whiteboard_sessions_active').on('whiteboard_sessions').column('is_active').execute();
  await db.schema.createIndex('idx_whiteboard_sessions_activity').on('whiteboard_sessions').column('last_activity_at').execute();

  // Permission indexes
  await db.schema.createIndex('idx_whiteboard_permissions_whiteboard_id').on('whiteboard_permissions').column('whiteboard_id').execute();
  await db.schema.createIndex('idx_whiteboard_permissions_user_id').on('whiteboard_permissions').column('user_id').execute();
  await db.schema.createIndex('idx_whiteboard_permissions_role').on('whiteboard_permissions').column('role').execute();
  await db.schema.createIndex('idx_whiteboard_permissions_expires_at').on('whiteboard_permissions').column('expires_at').execute();

  // Template indexes
  await db.schema.createIndex('idx_whiteboard_templates_category').on('whiteboard_templates').column('category').execute();
  await db.schema.createIndex('idx_whiteboard_templates_public').on('whiteboard_templates').column('is_public').execute();
  await db.schema.createIndex('idx_whiteboard_templates_workspace_id').on('whiteboard_templates').column('workspace_id').execute();
  await db.schema.createIndex('idx_whiteboard_templates_usage').on('whiteboard_templates').column('usage_count').execute();
  await db.schema.createIndex('idx_whiteboard_templates_rating').on('whiteboard_templates').column('rating').execute();

  // Activity log indexes
  await db.schema.createIndex('idx_whiteboard_activity_whiteboard_id').on('whiteboard_activity_log').column('whiteboard_id').execute();
  await db.schema.createIndex('idx_whiteboard_activity_user_id').on('whiteboard_activity_log').column('user_id').execute();
  await db.schema.createIndex('idx_whiteboard_activity_action').on('whiteboard_activity_log').column('action').execute();
  await db.schema.createIndex('idx_whiteboard_activity_target_type').on('whiteboard_activity_log').column('target_type').execute();
  await db.schema.createIndex('idx_whiteboard_activity_session_id').on('whiteboard_activity_log').column('session_id').execute();
  await db.schema.createIndex('idx_whiteboard_activity_operation_id').on('whiteboard_activity_log').column('operation_id').execute();
  await db.schema.createIndex('idx_whiteboard_activity_created_at').on('whiteboard_activity_log').column('created_at').execute();

  // Comment indexes
  await db.schema.createIndex('idx_whiteboard_comments_whiteboard_id').on('whiteboard_comments').column('whiteboard_id').execute();
  await db.schema.createIndex('idx_whiteboard_comments_element_id').on('whiteboard_comments').column('element_id').execute();
  await db.schema.createIndex('idx_whiteboard_comments_parent_id').on('whiteboard_comments').column('parent_id').execute();
  await db.schema.createIndex('idx_whiteboard_comments_created_by').on('whiteboard_comments').column('created_by').execute();
  await db.schema.createIndex('idx_whiteboard_comments_resolved').on('whiteboard_comments').column('resolved').execute();

  // Version indexes
  await db.schema.createIndex('idx_whiteboard_versions_whiteboard_id').on('whiteboard_versions').column('whiteboard_id').execute();
  await db.schema.createIndex('idx_whiteboard_versions_number').on('whiteboard_versions').column('version_number').execute();
  await db.schema.createIndex('idx_whiteboard_versions_created_by').on('whiteboard_versions').column('created_by').execute();
  await db.schema.createIndex('idx_whiteboard_versions_type').on('whiteboard_versions').column('change_type').execute();
  await db.schema.createIndex('idx_whiteboard_versions_created_at').on('whiteboard_versions').column('created_at').execute();

  // Composite indexes for common queries
  await db.schema.createIndex('idx_whiteboard_elements_whiteboard_visible').on('whiteboard_elements').columns(['whiteboard_id', 'visible']).execute();
  await db.schema.createIndex('idx_whiteboard_elements_whiteboard_layer').on('whiteboard_elements').columns(['whiteboard_id', 'layer_index']).execute();
  await db.schema.createIndex('idx_whiteboard_sessions_whiteboard_user').on('whiteboard_sessions').columns(['whiteboard_id', 'user_id']).execute();
  await db.schema.createIndex('idx_whiteboard_sessions_whiteboard_active').on('whiteboard_sessions').columns(['whiteboard_id', 'is_active']).execute();
  await db.schema.createIndex('idx_whiteboard_permissions_whiteboard_user').on('whiteboard_permissions').columns(['whiteboard_id', 'user_id']).execute();
  await db.schema.createIndex('idx_whiteboard_activity_whiteboard_action').on('whiteboard_activity_log').columns(['whiteboard_id', 'action']).execute();
  await db.schema.createIndex('idx_whiteboard_comments_whiteboard_resolved').on('whiteboard_comments').columns(['whiteboard_id', 'resolved']).execute();
  await db.schema.createIndex('idx_whiteboard_versions_whiteboard_number').on('whiteboard_versions').columns(['whiteboard_id', 'version_number']).execute();

  // Add foreign key references for comment replies
  await db.schema.alterTable('whiteboard_comments').addForeignKeyConstraint('fk_whiteboard_comments_parent', ['parent_id'], 'whiteboard_comments', ['id']).execute();

  // Add foreign key references for element parenting
  await db.schema.alterTable('whiteboard_elements').addForeignKeyConstraint('fk_whiteboard_elements_parent', ['parent_id'], 'whiteboard_elements', ['id']).execute();

  // Add foreign key references for templates (workspace constraint)
  await db.schema.alterTable('whiteboard_templates').addForeignKeyConstraint('fk_whiteboard_templates_workspace', ['workspace_id'], 'collaborative_workspaces', ['id']).onDelete('cascade').execute();

  console.log('✅ Collaborative whiteboard migration completed');
}

export async function down(db: Kysely<any>): Promise<void> {
  // Drop tables in reverse order due to foreign key constraints
  await db.schema.dropTable('whiteboard_versions').execute();
  await db.schema.dropTable('whiteboard_comments').execute();
  await db.schema.dropTable('whiteboard_activity_log').execute();
  await db.schema.dropTable('whiteboard_templates').execute();
  await db.schema.dropTable('whiteboard_permissions').execute();
  await db.schema.dropTable('whiteboard_sessions').execute();
  await db.schema.dropTable('whiteboard_elements').execute();
  await db.schema.dropTable('whiteboards').execute();
  
  console.log('✅ Collaborative whiteboard migration rolled back');
}