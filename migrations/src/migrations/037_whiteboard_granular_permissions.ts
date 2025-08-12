import { Kysely, sql } from 'kysely';

/**
 * Migration 037: Whiteboard Granular Permissions
 * 
 * Extends the existing whiteboard permission system with granular controls:
 * - Element-level permissions
 * - Area-based permissions
 * - Layer-based permissions  
 * - Time-based permissions
 * - Custom permission sets
 * - Permission delegation
 * - Audit trail enhancements
 */

export async function up(db: Kysely<any>): Promise<void> {
  console.log('🚀 Starting Whiteboard Granular Permissions migration...');

  // Create enhanced custom permission sets table
  await db.schema
    .createTable('whiteboard_custom_permissions')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('permission_id', 'uuid', (col) => 
      col.notNull().references('whiteboard_permissions.id').onDelete('cascade')
    )
    .addColumn('permission_type', 'varchar(50)', (col) => col.notNull()) // 'element', 'area', 'layer', 'time_based'
    .addColumn('target_id', 'uuid') // Element ID, area ID, or layer identifier
    .addColumn('permission_data', 'jsonb', (col) => col.notNull()) // Specific permission configuration
    .addColumn('priority', 'integer', (col) => col.defaultTo(0)) // For conflict resolution
    .addColumn('is_active', 'boolean', (col) => col.defaultTo(true))
    .addColumn('created_at', 'timestamptz', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
    .addColumn('updated_at', 'timestamptz', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
    .execute();

  // Create element-level permissions table
  await db.schema
    .createTable('whiteboard_element_permissions')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('element_id', 'uuid', (col) => 
      col.notNull().references('whiteboard_elements.id').onDelete('cascade')
    )
    .addColumn('user_id', 'uuid', (col) => col.notNull())
    .addColumn('whiteboard_id', 'uuid', (col) => 
      col.notNull().references('whiteboards.id').onDelete('cascade')
    )
    
    // Granular element permissions
    .addColumn('can_view', 'boolean', (col) => col.defaultTo(true))
    .addColumn('can_edit', 'boolean', (col) => col.defaultTo(false))
    .addColumn('can_delete', 'boolean', (col) => col.defaultTo(false))
    .addColumn('can_move', 'boolean', (col) => col.defaultTo(false))
    .addColumn('can_resize', 'boolean', (col) => col.defaultTo(false))
    .addColumn('can_style', 'boolean', (col) => col.defaultTo(false))
    .addColumn('can_comment', 'boolean', (col) => col.defaultTo(true))
    .addColumn('can_duplicate', 'boolean', (col) => col.defaultTo(false))
    .addColumn('can_lock', 'boolean', (col) => col.defaultTo(false))
    .addColumn('can_group', 'boolean', (col) => col.defaultTo(false))
    
    // Inheritance and delegation
    .addColumn('inherit_from_parent', 'boolean', (col) => col.defaultTo(true))
    .addColumn('inherit_from_whiteboard', 'boolean', (col) => col.defaultTo(true))
    .addColumn('granted_by', 'uuid', (col) => col.notNull())
    .addColumn('delegated_from', 'uuid') // If this permission was delegated
    .addColumn('can_delegate', 'boolean', (col) => col.defaultTo(false))
    
    // Time-based constraints
    .addColumn('valid_from', 'timestamptz')
    .addColumn('valid_until', 'timestamptz')
    .addColumn('timezone', 'varchar(50)', (col) => col.defaultTo('UTC'))
    
    // Conditions and constraints
    .addColumn('conditions', 'jsonb', (col) => col.defaultTo('{}')) // Complex permission conditions
    .addColumn('restrictions', 'jsonb', (col) => col.defaultTo('{}')) // Access restrictions
    
    .addColumn('created_at', 'timestamptz', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
    .addColumn('updated_at', 'timestamptz', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
    .execute();

  // Create area-based permissions table
  await db.schema
    .createTable('whiteboard_area_permissions')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('whiteboard_id', 'uuid', (col) => 
      col.notNull().references('whiteboards.id').onDelete('cascade')
    )
    .addColumn('user_id', 'uuid', (col) => col.notNull())
    .addColumn('area_name', 'varchar(255)', (col) => col.notNull())
    .addColumn('area_description', 'text')
    
    // Area geometry - supports rectangles, polygons, circles
    .addColumn('area_type', 'varchar(20)', (col) => col.notNull().defaultTo('rectangle')) // rectangle, circle, polygon
    .addColumn('bounds', 'jsonb', (col) => col.notNull()) // Area boundaries
    .addColumn('coordinates', 'jsonb') // For complex shapes (polygons)
    
    // Area permissions
    .addColumn('can_view', 'boolean', (col) => col.defaultTo(true))
    .addColumn('can_edit', 'boolean', (col) => col.defaultTo(false))
    .addColumn('can_create_elements', 'boolean', (col) => col.defaultTo(false))
    .addColumn('can_delete_elements', 'boolean', (col) => col.defaultTo(false))
    .addColumn('can_comment', 'boolean', (col) => col.defaultTo(true))
    .addColumn('can_move_into', 'boolean', (col) => col.defaultTo(false))
    .addColumn('can_move_out', 'boolean', (col) => col.defaultTo(true))
    
    // Area hierarchy and priority
    .addColumn('parent_area_id', 'uuid') // For nested areas
    .addColumn('priority', 'integer', (col) => col.defaultTo(0)) // Higher priority overrides lower
    .addColumn('is_exclusive', 'boolean', (col) => col.defaultTo(false)) // Only one user can edit at a time
    
    // Visual indicators
    .addColumn('border_color', 'varchar(7)') // Hex color for area border
    .addColumn('fill_color', 'varchar(7)') // Hex color for area fill
    .addColumn('opacity', 'decimal(3,2)', (col) => col.defaultTo(0.1))
    .addColumn('visible_to_others', 'boolean', (col) => col.defaultTo(false))
    
    // Metadata
    .addColumn('granted_by', 'uuid', (col) => col.notNull())
    .addColumn('valid_from', 'timestamptz')
    .addColumn('valid_until', 'timestamptz')
    .addColumn('is_active', 'boolean', (col) => col.defaultTo(true))
    
    .addColumn('created_at', 'timestamptz', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
    .addColumn('updated_at', 'timestamptz', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
    .execute();

  // Create layer-based permissions table
  await db.schema
    .createTable('whiteboard_layer_permissions')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('whiteboard_id', 'uuid', (col) => 
      col.notNull().references('whiteboards.id').onDelete('cascade')
    )
    .addColumn('user_id', 'uuid', (col) => col.notNull())
    .addColumn('layer_index', 'integer', (col) => col.notNull())
    .addColumn('layer_name', 'varchar(255)')
    .addColumn('layer_description', 'text')
    
    // Layer permissions
    .addColumn('can_view', 'boolean', (col) => col.defaultTo(true))
    .addColumn('can_edit', 'boolean', (col) => col.defaultTo(false))
    .addColumn('can_create_elements', 'boolean', (col) => col.defaultTo(false))
    .addColumn('can_delete_elements', 'boolean', (col) => col.defaultTo(false))
    .addColumn('can_reorder', 'boolean', (col) => col.defaultTo(false))
    .addColumn('can_show_hide', 'boolean', (col) => col.defaultTo(false))
    .addColumn('can_lock_unlock', 'boolean', (col) => col.defaultTo(false))
    
    // Layer constraints
    .addColumn('min_layer_index', 'integer') // Minimum layer this permission applies to
    .addColumn('max_layer_index', 'integer') // Maximum layer this permission applies to
    .addColumn('layer_range_type', 'varchar(20)', (col) => col.defaultTo('single')) // single, range, all_above, all_below
    
    // Metadata
    .addColumn('granted_by', 'uuid', (col) => col.notNull())
    .addColumn('valid_from', 'timestamptz')
    .addColumn('valid_until', 'timestamptz')
    .addColumn('is_active', 'boolean', (col) => col.defaultTo(true))
    
    .addColumn('created_at', 'timestamptz', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
    .addColumn('updated_at', 'timestamptz', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
    .execute();

  // Create time-based permission schedules table
  await db.schema
    .createTable('whiteboard_permission_schedules')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('permission_id', 'uuid', (col) => 
      col.notNull().references('whiteboard_permissions.id').onDelete('cascade')
    )
    .addColumn('schedule_name', 'varchar(255)', (col) => col.notNull())
    .addColumn('schedule_type', 'varchar(20)', (col) => col.notNull()) // 'one_time', 'recurring', 'conditional'
    
    // Time-based scheduling
    .addColumn('start_date', 'date')
    .addColumn('end_date', 'date')
    .addColumn('start_time', 'time')
    .addColumn('end_time', 'time')
    .addColumn('timezone', 'varchar(50)', (col) => col.defaultTo('UTC'))
    .addColumn('days_of_week', 'integer[]') // Array of days (0=Sunday, 6=Saturday)
    .addColumn('days_of_month', 'integer[]') // Array of days (1-31)
    .addColumn('months_of_year', 'integer[]') // Array of months (1-12)
    
    // Recurrence patterns
    .addColumn('recurrence_pattern', 'varchar(20)') // 'daily', 'weekly', 'monthly', 'yearly'
    .addColumn('recurrence_interval', 'integer', (col) => col.defaultTo(1)) // Every N periods
    .addColumn('recurrence_end_date', 'date')
    .addColumn('recurrence_count', 'integer') // Number of occurrences
    
    // Conditional access
    .addColumn('conditions', 'jsonb', (col) => col.defaultTo('{}')) // Complex conditions
    .addColumn('max_session_duration', 'integer') // Maximum session time in minutes
    .addColumn('max_daily_duration', 'integer') // Maximum daily access time in minutes
    
    // Status tracking
    .addColumn('is_active', 'boolean', (col) => col.defaultTo(true))
    .addColumn('created_by', 'uuid', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
    .addColumn('updated_at', 'timestamptz', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
    .execute();

  // Create permission delegation table
  await db.schema
    .createTable('whiteboard_permission_delegations')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('original_permission_id', 'uuid', (col) => 
      col.notNull().references('whiteboard_permissions.id').onDelete('cascade')
    )
    .addColumn('delegated_permission_id', 'uuid', (col) => 
      col.notNull().references('whiteboard_permissions.id').onDelete('cascade')
    )
    .addColumn('delegator_user_id', 'uuid', (col) => col.notNull()) // User who delegated
    .addColumn('delegate_user_id', 'uuid', (col) => col.notNull()) // User who received delegation
    .addColumn('whiteboard_id', 'uuid', (col) => 
      col.notNull().references('whiteboards.id').onDelete('cascade')
    )
    
    // Delegation constraints
    .addColumn('delegation_type', 'varchar(20)', (col) => col.notNull().defaultTo('temporary')) // permanent, temporary, conditional
    .addColumn('can_further_delegate', 'boolean', (col) => col.defaultTo(false))
    .addColumn('max_delegation_depth', 'integer', (col) => col.defaultTo(1))
    .addColumn('delegation_depth', 'integer', (col) => col.defaultTo(1)) // Current depth in chain
    
    // Scope limitations
    .addColumn('delegated_permissions', 'jsonb', (col) => col.notNull()) // Subset of permissions being delegated
    .addColumn('restrictions', 'jsonb', (col) => col.defaultTo('{}')) // Additional restrictions
    .addColumn('conditions', 'jsonb', (col) => col.defaultTo('{}')) // Conditions for delegation
    
    // Time constraints
    .addColumn('valid_from', 'timestamptz', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
    .addColumn('valid_until', 'timestamptz')
    .addColumn('auto_revoke_on_inactivity', 'boolean', (col) => col.defaultTo(false))
    .addColumn('inactivity_threshold_days', 'integer', (col) => col.defaultTo(30))
    
    // Status and audit
    .addColumn('is_active', 'boolean', (col) => col.defaultTo(true))
    .addColumn('revoked_at', 'timestamptz')
    .addColumn('revoked_by', 'uuid')
    .addColumn('revoke_reason', 'text')
    .addColumn('created_at', 'timestamptz', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
    .addColumn('updated_at', 'timestamptz', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
    .execute();

  // Enhanced audit table for permission changes
  await db.schema
    .createTable('whiteboard_permission_audit')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('whiteboard_id', 'uuid', (col) => 
      col.notNull().references('whiteboards.id').onDelete('cascade')
    )
    .addColumn('permission_id', 'uuid') // May be null for permission deletions
    .addColumn('target_user_id', 'uuid', (col) => col.notNull()) // User whose permissions changed
    .addColumn('changed_by_user_id', 'uuid', (col) => col.notNull()) // User who made the change
    
    // Change details
    .addColumn('action', 'varchar(50)', (col) => col.notNull()) // granted, revoked, updated, delegated, etc.
    .addColumn('permission_type', 'varchar(50)', (col) => col.notNull()) // whiteboard, element, area, layer
    .addColumn('change_type', 'varchar(20)', (col) => col.notNull()) // create, update, delete
    .addColumn('old_permissions', 'jsonb') // Previous permission state
    .addColumn('new_permissions', 'jsonb') // New permission state
    .addColumn('change_diff', 'jsonb') // Detailed diff of changes
    
    // Context information
    .addColumn('reason', 'text') // Reason for the change
    .addColumn('approval_required', 'boolean', (col) => col.defaultTo(false))
    .addColumn('approved_by', 'uuid') // If approval was required
    .addColumn('approved_at', 'timestamptz')
    .addColumn('session_id', 'uuid') // WebSocket session that made the change
    .addColumn('ip_address', 'inet') // IP address of the change
    .addColumn('user_agent', 'text') // Browser/client information
    
    // Risk assessment
    .addColumn('risk_level', 'varchar(10)', (col) => col.defaultTo('low')) // low, medium, high, critical
    .addColumn('automated_flags', 'text[]', (col) => col.defaultTo(sql`ARRAY[]::text[]`)) // Automated security flags
    .addColumn('requires_review', 'boolean', (col) => col.defaultTo(false))
    .addColumn('reviewed_by', 'uuid')
    .addColumn('reviewed_at', 'timestamptz')
    .addColumn('review_notes', 'text')
    
    .addColumn('created_at', 'timestamptz', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
    .execute();

  // Create permission templates for quick application
  await db.schema
    .createTable('whiteboard_permission_templates')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('name', 'varchar(255)', (col) => col.notNull())
    .addColumn('description', 'text')
    .addColumn('template_type', 'varchar(50)', (col) => col.notNull()) // role_based, project_based, custom
    .addColumn('category', 'varchar(100)', (col) => col.notNull()) // education, business, creative, etc.
    
    // Template definition
    .addColumn('base_role', 'varchar(50)', (col) => col.notNull()) // owner, editor, commenter, viewer, custom
    .addColumn('permission_overrides', 'jsonb', (col) => col.notNull()) // Specific permission modifications
    .addColumn('element_permissions', 'jsonb', (col) => col.defaultTo('{}'))
    .addColumn('area_permissions', 'jsonb', (col) => col.defaultTo('{}'))
    .addColumn('layer_permissions', 'jsonb', (col) => col.defaultTo('{}'))
    .addColumn('time_restrictions', 'jsonb', (col) => col.defaultTo('{}'))
    
    // Template metadata
    .addColumn('is_public', 'boolean', (col) => col.defaultTo(false)) // Available to all workspaces
    .addColumn('workspace_id', 'uuid') // Workspace-specific template
    .addColumn('usage_count', 'integer', (col) => col.defaultTo(0))
    .addColumn('rating', 'decimal(3,2)', (col) => col.defaultTo(0))
    .addColumn('tags', 'text[]', (col) => col.defaultTo(sql`ARRAY[]::text[]`))
    
    // Lifecycle
    .addColumn('created_by', 'uuid', (col) => col.notNull())
    .addColumn('is_active', 'boolean', (col) => col.defaultTo(true))
    .addColumn('created_at', 'timestamptz', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
    .addColumn('updated_at', 'timestamptz', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
    .execute();

  // Create performance optimization indexes
  console.log('📊 Creating performance indexes...');
  
  // Custom permissions indexes
  await db.schema.createIndex('idx_whiteboard_custom_permissions_permission_id')
    .on('whiteboard_custom_permissions').column('permission_id').execute();
  await db.schema.createIndex('idx_whiteboard_custom_permissions_type')
    .on('whiteboard_custom_permissions').column('permission_type').execute();
  await db.schema.createIndex('idx_whiteboard_custom_permissions_target')
    .on('whiteboard_custom_permissions').column('target_id').execute();
  await db.schema.createIndex('idx_whiteboard_custom_permissions_active')
    .on('whiteboard_custom_permissions').column('is_active').execute();

  // Element permissions indexes
  await db.schema.createIndex('idx_whiteboard_element_permissions_element_id')
    .on('whiteboard_element_permissions').column('element_id').execute();
  await db.schema.createIndex('idx_whiteboard_element_permissions_user_id')
    .on('whiteboard_element_permissions').column('user_id').execute();
  await db.schema.createIndex('idx_whiteboard_element_permissions_whiteboard_id')
    .on('whiteboard_element_permissions').column('whiteboard_id').execute();
  await db.schema.createIndex('idx_whiteboard_element_permissions_time_range')
    .on('whiteboard_element_permissions').columns(['valid_from', 'valid_until']).execute();
  await db.schema.createIndex('idx_whiteboard_element_permissions_delegated')
    .on('whiteboard_element_permissions').column('delegated_from').execute();
  
  // Area permissions indexes
  await db.schema.createIndex('idx_whiteboard_area_permissions_whiteboard_id')
    .on('whiteboard_area_permissions').column('whiteboard_id').execute();
  await db.schema.createIndex('idx_whiteboard_area_permissions_user_id')
    .on('whiteboard_area_permissions').column('user_id').execute();
  await db.schema.createIndex('idx_whiteboard_area_permissions_priority')
    .on('whiteboard_area_permissions').column('priority').execute();
  await db.schema.createIndex('idx_whiteboard_area_permissions_active')
    .on('whiteboard_area_permissions').column('is_active').execute();
  await db.schema.createIndex('idx_whiteboard_area_permissions_parent')
    .on('whiteboard_area_permissions').column('parent_area_id').execute();

  // Layer permissions indexes
  await db.schema.createIndex('idx_whiteboard_layer_permissions_whiteboard_id')
    .on('whiteboard_layer_permissions').column('whiteboard_id').execute();
  await db.schema.createIndex('idx_whiteboard_layer_permissions_user_id')
    .on('whiteboard_layer_permissions').column('user_id').execute();
  await db.schema.createIndex('idx_whiteboard_layer_permissions_layer_index')
    .on('whiteboard_layer_permissions').column('layer_index').execute();
  await db.schema.createIndex('idx_whiteboard_layer_permissions_range')
    .on('whiteboard_layer_permissions').columns(['min_layer_index', 'max_layer_index']).execute();

  // Permission schedule indexes
  await db.schema.createIndex('idx_whiteboard_permission_schedules_permission_id')
    .on('whiteboard_permission_schedules').column('permission_id').execute();
  await db.schema.createIndex('idx_whiteboard_permission_schedules_type')
    .on('whiteboard_permission_schedules').column('schedule_type').execute();
  await db.schema.createIndex('idx_whiteboard_permission_schedules_active')
    .on('whiteboard_permission_schedules').column('is_active').execute();
  await db.schema.createIndex('idx_whiteboard_permission_schedules_dates')
    .on('whiteboard_permission_schedules').columns(['start_date', 'end_date']).execute();

  // Permission delegation indexes
  await db.schema.createIndex('idx_whiteboard_permission_delegations_original')
    .on('whiteboard_permission_delegations').column('original_permission_id').execute();
  await db.schema.createIndex('idx_whiteboard_permission_delegations_delegated')
    .on('whiteboard_permission_delegations').column('delegated_permission_id').execute();
  await db.schema.createIndex('idx_whiteboard_permission_delegations_users')
    .on('whiteboard_permission_delegations').columns(['delegator_user_id', 'delegate_user_id']).execute();
  await db.schema.createIndex('idx_whiteboard_permission_delegations_whiteboard')
    .on('whiteboard_permission_delegations').column('whiteboard_id').execute();
  await db.schema.createIndex('idx_whiteboard_permission_delegations_active')
    .on('whiteboard_permission_delegations').column('is_active').execute();
  await db.schema.createIndex('idx_whiteboard_permission_delegations_validity')
    .on('whiteboard_permission_delegations').columns(['valid_from', 'valid_until']).execute();

  // Audit indexes
  await db.schema.createIndex('idx_whiteboard_permission_audit_whiteboard')
    .on('whiteboard_permission_audit').column('whiteboard_id').execute();
  await db.schema.createIndex('idx_whiteboard_permission_audit_target_user')
    .on('whiteboard_permission_audit').column('target_user_id').execute();
  await db.schema.createIndex('idx_whiteboard_permission_audit_changed_by')
    .on('whiteboard_permission_audit').column('changed_by_user_id').execute();
  await db.schema.createIndex('idx_whiteboard_permission_audit_action')
    .on('whiteboard_permission_audit').column('action').execute();
  await db.schema.createIndex('idx_whiteboard_permission_audit_type')
    .on('whiteboard_permission_audit').column('permission_type').execute();
  await db.schema.createIndex('idx_whiteboard_permission_audit_created_at')
    .on('whiteboard_permission_audit').column('created_at').execute();
  await db.schema.createIndex('idx_whiteboard_permission_audit_risk')
    .on('whiteboard_permission_audit').column('risk_level').execute();
  await db.schema.createIndex('idx_whiteboard_permission_audit_review')
    .on('whiteboard_permission_audit').column('requires_review').execute();

  // Template indexes
  await db.schema.createIndex('idx_whiteboard_permission_templates_type')
    .on('whiteboard_permission_templates').column('template_type').execute();
  await db.schema.createIndex('idx_whiteboard_permission_templates_category')
    .on('whiteboard_permission_templates').column('category').execute();
  await db.schema.createIndex('idx_whiteboard_permission_templates_role')
    .on('whiteboard_permission_templates').column('base_role').execute();
  await db.schema.createIndex('idx_whiteboard_permission_templates_public')
    .on('whiteboard_permission_templates').column('is_public').execute();
  await db.schema.createIndex('idx_whiteboard_permission_templates_workspace')
    .on('whiteboard_permission_templates').column('workspace_id').execute();
  await db.schema.createIndex('idx_whiteboard_permission_templates_usage')
    .on('whiteboard_permission_templates').column('usage_count').execute();

  // Composite indexes for complex queries
  await db.schema.createIndex('idx_whiteboard_element_permissions_composite')
    .on('whiteboard_element_permissions').columns(['whiteboard_id', 'user_id', 'element_id']).execute();
  await db.schema.createIndex('idx_whiteboard_area_permissions_composite')
    .on('whiteboard_area_permissions').columns(['whiteboard_id', 'user_id', 'is_active']).execute();
  await db.schema.createIndex('idx_whiteboard_layer_permissions_composite')
    .on('whiteboard_layer_permissions').columns(['whiteboard_id', 'user_id', 'layer_index']).execute();

  // GIN indexes for JSONB columns (for efficient JSON queries)
  await db.schema.createIndex('idx_whiteboard_custom_permissions_data_gin')
    .on('whiteboard_custom_permissions')
    .expression(sql`permission_data`)
    .using('gin')
    .execute();
  await db.schema.createIndex('idx_whiteboard_element_permissions_conditions_gin')
    .on('whiteboard_element_permissions')
    .expression(sql`conditions`)
    .using('gin')
    .execute();
  await db.schema.createIndex('idx_whiteboard_area_permissions_bounds_gin')
    .on('whiteboard_area_permissions')
    .expression(sql`bounds`)
    .using('gin')
    .execute();
  await db.schema.createIndex('idx_whiteboard_permission_audit_diff_gin')
    .on('whiteboard_permission_audit')
    .expression(sql`change_diff`)
    .using('gin')
    .execute();

  // Add foreign key constraints
  console.log('🔗 Adding foreign key constraints...');

  // Element permissions foreign keys
  await db.schema.alterTable('whiteboard_element_permissions')
    .addForeignKeyConstraint('fk_element_permissions_granted_by', ['granted_by'], 'users', ['id'])
    .execute();
  await db.schema.alterTable('whiteboard_element_permissions')
    .addForeignKeyConstraint('fk_element_permissions_delegated_from', ['delegated_from'], 'whiteboard_element_permissions', ['id'])
    .execute();

  // Area permissions foreign keys
  await db.schema.alterTable('whiteboard_area_permissions')
    .addForeignKeyConstraint('fk_area_permissions_user', ['user_id'], 'users', ['id'])
    .execute();
  await db.schema.alterTable('whiteboard_area_permissions')
    .addForeignKeyConstraint('fk_area_permissions_granted_by', ['granted_by'], 'users', ['id'])
    .execute();
  await db.schema.alterTable('whiteboard_area_permissions')
    .addForeignKeyConstraint('fk_area_permissions_parent', ['parent_area_id'], 'whiteboard_area_permissions', ['id'])
    .execute();

  // Layer permissions foreign keys
  await db.schema.alterTable('whiteboard_layer_permissions')
    .addForeignKeyConstraint('fk_layer_permissions_user', ['user_id'], 'users', ['id'])
    .execute();
  await db.schema.alterTable('whiteboard_layer_permissions')
    .addForeignKeyConstraint('fk_layer_permissions_granted_by', ['granted_by'], 'users', ['id'])
    .execute();

  // Permission schedule foreign keys
  await db.schema.alterTable('whiteboard_permission_schedules')
    .addForeignKeyConstraint('fk_permission_schedules_created_by', ['created_by'], 'users', ['id'])
    .execute();

  // Permission delegation foreign keys
  await db.schema.alterTable('whiteboard_permission_delegations')
    .addForeignKeyConstraint('fk_permission_delegations_delegator', ['delegator_user_id'], 'users', ['id'])
    .execute();
  await db.schema.alterTable('whiteboard_permission_delegations')
    .addForeignKeyConstraint('fk_permission_delegations_delegate', ['delegate_user_id'], 'users', ['id'])
    .execute();
  await db.schema.alterTable('whiteboard_permission_delegations')
    .addForeignKeyConstraint('fk_permission_delegations_revoked_by', ['revoked_by'], 'users', ['id'])
    .execute();

  // Audit foreign keys
  await db.schema.alterTable('whiteboard_permission_audit')
    .addForeignKeyConstraint('fk_permission_audit_target_user', ['target_user_id'], 'users', ['id'])
    .execute();
  await db.schema.alterTable('whiteboard_permission_audit')
    .addForeignKeyConstraint('fk_permission_audit_changed_by', ['changed_by_user_id'], 'users', ['id'])
    .execute();
  await db.schema.alterTable('whiteboard_permission_audit')
    .addForeignKeyConstraint('fk_permission_audit_approved_by', ['approved_by'], 'users', ['id'])
    .execute();
  await db.schema.alterTable('whiteboard_permission_audit')
    .addForeignKeyConstraint('fk_permission_audit_reviewed_by', ['reviewed_by'], 'users', ['id'])
    .execute();

  // Template foreign keys
  await db.schema.alterTable('whiteboard_permission_templates')
    .addForeignKeyConstraint('fk_permission_templates_workspace', ['workspace_id'], 'collaborative_workspaces', ['id'])
    .onDelete('cascade')
    .execute();
  await db.schema.alterTable('whiteboard_permission_templates')
    .addForeignKeyConstraint('fk_permission_templates_created_by', ['created_by'], 'users', ['id'])
    .execute();

  // Create database functions for common permission checks
  console.log('⚡ Creating database functions...');

  // Function to check if user has permission on element at specific coordinates
  await db.schema.createFunction('check_element_permission')
    .replace()
    .sql(sql`
      CREATE OR REPLACE FUNCTION check_element_permission(
        p_whiteboard_id uuid,
        p_user_id uuid,
        p_element_id uuid,
        p_permission_type varchar,
        p_x numeric DEFAULT NULL,
        p_y numeric DEFAULT NULL
      )
      RETURNS boolean
      LANGUAGE plpgsql
      SECURITY DEFINER
      AS $$
      DECLARE
        has_permission boolean := false;
        area_permission boolean := true;
      BEGIN
        -- Check element-specific permissions first
        SELECT EXISTS(
          SELECT 1 FROM whiteboard_element_permissions wep
          WHERE wep.whiteboard_id = p_whiteboard_id
            AND wep.user_id = p_user_id
            AND wep.element_id = p_element_id
            AND (
              (p_permission_type = 'can_view' AND wep.can_view) OR
              (p_permission_type = 'can_edit' AND wep.can_edit) OR
              (p_permission_type = 'can_delete' AND wep.can_delete) OR
              (p_permission_type = 'can_move' AND wep.can_move) OR
              (p_permission_type = 'can_style' AND wep.can_style)
            )
            AND (wep.valid_from IS NULL OR wep.valid_from <= CURRENT_TIMESTAMP)
            AND (wep.valid_until IS NULL OR wep.valid_until >= CURRENT_TIMESTAMP)
        ) INTO has_permission;

        -- If element permission exists, use it
        IF has_permission THEN
          RETURN true;
        END IF;

        -- Check area-based permissions if coordinates provided
        IF p_x IS NOT NULL AND p_y IS NOT NULL THEN
          SELECT EXISTS(
            SELECT 1 FROM whiteboard_area_permissions wap
            WHERE wap.whiteboard_id = p_whiteboard_id
              AND wap.user_id = p_user_id
              AND wap.is_active = true
              AND (
                (wap.area_type = 'rectangle' AND
                 p_x >= (wap.bounds->>'x')::numeric AND
                 p_x <= ((wap.bounds->>'x')::numeric + (wap.bounds->>'width')::numeric) AND
                 p_y >= (wap.bounds->>'y')::numeric AND
                 p_y <= ((wap.bounds->>'y')::numeric + (wap.bounds->>'height')::numeric))
              )
              AND (
                (p_permission_type = 'can_view' AND wap.can_view) OR
                (p_permission_type = 'can_edit' AND wap.can_edit) OR
                (p_permission_type = 'can_create_elements' AND wap.can_create_elements) OR
                (p_permission_type = 'can_delete_elements' AND wap.can_delete_elements)
              )
            ORDER BY wap.priority DESC
            LIMIT 1
          ) INTO area_permission;
          
          IF NOT area_permission THEN
            RETURN false;
          END IF;
        END IF;

        -- Fall back to whiteboard-level permissions
        SELECT EXISTS(
          SELECT 1 FROM whiteboard_permissions wp
          WHERE wp.whiteboard_id = p_whiteboard_id
            AND wp.user_id = p_user_id
            AND (wp.expires_at IS NULL OR wp.expires_at >= CURRENT_TIMESTAMP)
        ) INTO has_permission;

        RETURN has_permission;
      END;
      $$
    `)
    .execute();

  // Function to get effective permissions for user on whiteboard
  await db.schema.createFunction('get_effective_permissions')
    .replace()
    .sql(sql`
      CREATE OR REPLACE FUNCTION get_effective_permissions(
        p_whiteboard_id uuid,
        p_user_id uuid
      )
      RETURNS jsonb
      LANGUAGE plpgsql
      SECURITY DEFINER
      AS $$
      DECLARE
        base_permissions jsonb := '{}'::jsonb;
        result_permissions jsonb;
      BEGIN
        -- Get base permissions from whiteboard_permissions
        SELECT wp.permissions INTO base_permissions
        FROM whiteboard_permissions wp
        WHERE wp.whiteboard_id = p_whiteboard_id
          AND wp.user_id = p_user_id
          AND (wp.expires_at IS NULL OR wp.expires_at >= CURRENT_TIMESTAMP);

        -- Initialize result with base permissions
        result_permissions := COALESCE(base_permissions, '{}'::jsonb);

        -- Add element-specific permissions
        result_permissions := jsonb_set(
          result_permissions,
          '{elementPermissions}',
          COALESCE(
            (
              SELECT jsonb_agg(
                jsonb_build_object(
                  'elementId', wep.element_id,
                  'canView', wep.can_view,
                  'canEdit', wep.can_edit,
                  'canDelete', wep.can_delete,
                  'canMove', wep.can_move,
                  'canStyle', wep.can_style,
                  'canComment', wep.can_comment
                )
              )
              FROM whiteboard_element_permissions wep
              WHERE wep.whiteboard_id = p_whiteboard_id
                AND wep.user_id = p_user_id
                AND (wep.valid_from IS NULL OR wep.valid_from <= CURRENT_TIMESTAMP)
                AND (wep.valid_until IS NULL OR wep.valid_until >= CURRENT_TIMESTAMP)
            ),
            '[]'::jsonb
          )
        );

        -- Add area-based permissions
        result_permissions := jsonb_set(
          result_permissions,
          '{areaPermissions}',
          COALESCE(
            (
              SELECT jsonb_agg(
                jsonb_build_object(
                  'areaId', wap.id,
                  'areaName', wap.area_name,
                  'bounds', wap.bounds,
                  'canView', wap.can_view,
                  'canEdit', wap.can_edit,
                  'canCreateElements', wap.can_create_elements,
                  'priority', wap.priority
                )
              )
              FROM whiteboard_area_permissions wap
              WHERE wap.whiteboard_id = p_whiteboard_id
                AND wap.user_id = p_user_id
                AND wap.is_active = true
            ),
            '[]'::jsonb
          )
        );

        -- Add layer-based permissions
        result_permissions := jsonb_set(
          result_permissions,
          '{layerPermissions}',
          COALESCE(
            (
              SELECT jsonb_agg(
                jsonb_build_object(
                  'layerIndex', wlp.layer_index,
                  'layerName', wlp.layer_name,
                  'canView', wlp.can_view,
                  'canEdit', wlp.can_edit,
                  'canReorder', wlp.can_reorder
                )
              )
              FROM whiteboard_layer_permissions wlp
              WHERE wlp.whiteboard_id = p_whiteboard_id
                AND wlp.user_id = p_user_id
                AND wlp.is_active = true
            ),
            '[]'::jsonb
          )
        );

        RETURN result_permissions;
      END;
      $$
    `)
    .execute();

  console.log('✅ Whiteboard Granular Permissions migration completed successfully!');
  console.log('');
  console.log('🎯 New capabilities added:');
  console.log('   • Element-level permission control');
  console.log('   • Area-based access restrictions');
  console.log('   • Layer-based permission management');
  console.log('   • Time-based access schedules');
  console.log('   • Permission delegation system');
  console.log('   • Comprehensive audit trail');
  console.log('   • Permission templates');
  console.log('   • Advanced database functions for performance');
  console.log('');
  console.log('📊 Database objects created:');
  console.log('   • 7 new tables with full indexing');
  console.log('   • 25+ performance-optimized indexes');
  console.log('   • 2 database functions for permission checks');
  console.log('   • Full referential integrity constraints');
  console.log('');
}

export async function down(db: Kysely<any>): Promise<void> {
  console.log('⏪ Rolling back Whiteboard Granular Permissions migration...');

  // Drop functions first
  await db.schema.dropFunction('check_element_permission').execute();
  await db.schema.dropFunction('get_effective_permissions').execute();

  // Drop tables in reverse order due to foreign key constraints
  await db.schema.dropTable('whiteboard_permission_templates').execute();
  await db.schema.dropTable('whiteboard_permission_audit').execute();
  await db.schema.dropTable('whiteboard_permission_delegations').execute();
  await db.schema.dropTable('whiteboard_permission_schedules').execute();
  await db.schema.dropTable('whiteboard_layer_permissions').execute();
  await db.schema.dropTable('whiteboard_area_permissions').execute();
  await db.schema.dropTable('whiteboard_element_permissions').execute();
  await db.schema.dropTable('whiteboard_custom_permissions').execute();

  console.log('✅ Whiteboard Granular Permissions migration rolled back successfully');
}