import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // Extend whiteboard_permissions table with granular permission controls
  await db.schema
    .alterTable('whiteboard_permissions')
    .addColumn('custom_permissions', 'jsonb', (col) => col.defaultTo('{}')) // Granular element-level permissions
    .addColumn('area_restrictions', 'jsonb', (col) => col.defaultTo('{}')) // Canvas region restrictions
    .addColumn('layer_permissions', 'jsonb', (col) => col.defaultTo('{}')) // Layer-based access control
    .addColumn('operation_permissions', 'jsonb', (col) => col.defaultTo('{}')) // Operation-type restrictions
    .addColumn('temporary_permissions', 'jsonb', (col) => col.defaultTo('{}')) // Time-based access
    .addColumn('inheritance_rules', 'jsonb', (col) => col.defaultTo('{}')) // Permission inheritance configuration
    .addColumn('delegation_rules', 'jsonb', (col) => col.defaultTo('{}')) // Permission delegation rules
    .addColumn('is_inherited', 'boolean', (col) => col.defaultTo(false)) // Whether this permission is inherited
    .addColumn('inherited_from', 'uuid') // Source of inherited permission
    .addColumn('can_delegate', 'boolean', (col) => col.defaultTo(false)) // Whether user can delegate permissions
    .addColumn('delegated_by', 'uuid') // User who delegated this permission
    .execute();

  // Element-level permissions table for granular control
  await db.schema
    .createTable('whiteboard_element_permissions')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('whiteboard_id', 'uuid', (col) => col.notNull().references('whiteboards.id').onDelete('cascade'))
    .addColumn('element_id', 'uuid', (col) => col.notNull().references('whiteboard_elements.id').onDelete('cascade'))
    .addColumn('user_id', 'uuid', (col) => col.notNull())
    .addColumn('permission_type', 'varchar(50)', (col) => col.notNull()) // 'can_edit', 'can_delete', 'can_move', 'can_style', etc.
    .addColumn('granted', 'boolean', (col) => col.notNull().defaultTo(true)) // true = granted, false = explicitly denied
    .addColumn('scope', 'jsonb', (col) => col.defaultTo('{}')) // Additional scope restrictions
    .addColumn('granted_by', 'uuid', (col) => col.notNull())
    .addColumn('reason', 'text') // Reason for permission grant/denial
    .addColumn('expires_at', 'timestamptz') // Optional expiration
    .addColumn('created_at', 'timestamptz', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
    .addColumn('updated_at', 'timestamptz', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
    .execute();

  // Area-based permissions for canvas regions
  await db.schema
    .createTable('whiteboard_area_permissions')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('whiteboard_id', 'uuid', (col) => col.notNull().references('whiteboards.id').onDelete('cascade'))
    .addColumn('user_id', 'uuid', (col) => col.notNull())
    .addColumn('area_name', 'varchar(255)', (col) => col.notNull()) // User-defined area name
    .addColumn('area_bounds', 'jsonb', (col) => col.notNull()) // { x, y, width, height }
    .addColumn('permission_type', 'varchar(50)', (col) => col.notNull()) // 'can_edit', 'can_create', 'read_only', etc.
    .addColumn('priority', 'integer', (col) => col.defaultTo(0)) // Priority for overlapping areas
    .addColumn('inclusive', 'boolean', (col) => col.defaultTo(true)) // true = grant permission in area, false = deny
    .addColumn('applies_to_elements', 'text[]', (col) => col.defaultTo(sql`ARRAY[]::text[]`)) // Element types this applies to
    .addColumn('granted_by', 'uuid', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
    .addColumn('updated_at', 'timestamptz', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
    .execute();

  // Layer-based permissions for different canvas layers
  await db.schema
    .createTable('whiteboard_layer_permissions')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('whiteboard_id', 'uuid', (col) => col.notNull().references('whiteboards.id').onDelete('cascade'))
    .addColumn('user_id', 'uuid', (col) => col.notNull())
    .addColumn('layer_index', 'integer', (col) => col.notNull()) // Layer index (-1 for all layers)
    .addColumn('layer_name', 'varchar(255)') // Optional layer name
    .addColumn('permissions', 'jsonb', (col) => col.notNull()) // Detailed layer permissions
    .addColumn('granted_by', 'uuid', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
    .addColumn('updated_at', 'timestamptz', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
    .execute();

  // Custom roles for workspace-specific permission templates
  await db.schema
    .createTable('whiteboard_custom_roles')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('workspace_id', 'uuid', (col) => col.notNull().references('collaborative_workspaces.id').onDelete('cascade'))
    .addColumn('role_name', 'varchar(100)', (col) => col.notNull())
    .addColumn('role_description', 'text')
    .addColumn('role_permissions', 'jsonb', (col) => col.notNull()) // Template permissions for this role
    .addColumn('default_for_new_users', 'boolean', (col) => col.defaultTo(false))
    .addColumn('can_be_delegated', 'boolean', (col) => col.defaultTo(true))
    .addColumn('created_by', 'uuid', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
    .addColumn('updated_at', 'timestamptz', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
    .execute();

  // Permission audit log for compliance and tracking
  await db.schema
    .createTable('whiteboard_permission_audit')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('whiteboard_id', 'uuid', (col) => col.notNull().references('whiteboards.id').onDelete('cascade'))
    .addColumn('target_user_id', 'uuid', (col) => col.notNull()) // User whose permissions changed
    .addColumn('changed_by', 'uuid', (col) => col.notNull()) // User who made the change
    .addColumn('action', 'varchar(50)', (col) => col.notNull()) // 'granted', 'revoked', 'modified', 'inherited', 'delegated'
    .addColumn('permission_type', 'varchar(100)', (col) => col.notNull()) // Type of permission changed
    .addColumn('old_value', 'jsonb') // Previous permission state
    .addColumn('new_value', 'jsonb') // New permission state
    .addColumn('reason', 'text') // Reason for change
    .addColumn('context', 'jsonb', (col) => col.defaultTo('{}')) // Additional context (element_id, area_id, etc.)
    .addColumn('ip_address', 'varchar(45)') // IP address for security audit
    .addColumn('user_agent', 'text') // User agent for security audit
    .addColumn('session_id', 'uuid') // Session identifier
    .addColumn('created_at', 'timestamptz', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
    .execute();

  // Permission cache table for performance optimization
  await db.schema
    .createTable('whiteboard_permission_cache')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('whiteboard_id', 'uuid', (col) => col.notNull().references('whiteboards.id').onDelete('cascade'))
    .addColumn('user_id', 'uuid', (col) => col.notNull())
    .addColumn('permission_hash', 'varchar(64)', (col) => col.notNull()) // SHA-256 hash of permission set
    .addColumn('cached_permissions', 'jsonb', (col) => col.notNull()) // Flattened permission data
    .addColumn('cache_version', 'integer', (col) => col.defaultTo(1)) // Version for cache invalidation
    .addColumn('expires_at', 'timestamptz', (col) => col.notNull()) // Cache expiration
    .addColumn('created_at', 'timestamptz', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
    .addColumn('updated_at', 'timestamptz', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
    .execute();

  // Performance indexes for permission tables

  // Element permissions indexes
  await db.schema.createIndex('idx_whiteboard_element_permissions_whiteboard_id')
    .on('whiteboard_element_permissions').column('whiteboard_id').execute();
  await db.schema.createIndex('idx_whiteboard_element_permissions_user_id')
    .on('whiteboard_element_permissions').column('user_id').execute();
  await db.schema.createIndex('idx_whiteboard_element_permissions_element_id')
    .on('whiteboard_element_permissions').column('element_id').execute();
  await db.schema.createIndex('idx_whiteboard_element_permissions_type')
    .on('whiteboard_element_permissions').column('permission_type').execute();
  await db.schema.createIndex('idx_whiteboard_element_permissions_granted')
    .on('whiteboard_element_permissions').column('granted').execute();
  await db.schema.createIndex('idx_whiteboard_element_permissions_expires')
    .on('whiteboard_element_permissions').column('expires_at').execute();

  // Area permissions indexes
  await db.schema.createIndex('idx_whiteboard_area_permissions_whiteboard_id')
    .on('whiteboard_area_permissions').column('whiteboard_id').execute();
  await db.schema.createIndex('idx_whiteboard_area_permissions_user_id')
    .on('whiteboard_area_permissions').column('user_id').execute();
  await db.schema.createIndex('idx_whiteboard_area_permissions_type')
    .on('whiteboard_area_permissions').column('permission_type').execute();
  await db.schema.createIndex('idx_whiteboard_area_permissions_priority')
    .on('whiteboard_area_permissions').column('priority').execute();

  // Layer permissions indexes
  await db.schema.createIndex('idx_whiteboard_layer_permissions_whiteboard_id')
    .on('whiteboard_layer_permissions').column('whiteboard_id').execute();
  await db.schema.createIndex('idx_whiteboard_layer_permissions_user_id')
    .on('whiteboard_layer_permissions').column('user_id').execute();
  await db.schema.createIndex('idx_whiteboard_layer_permissions_layer')
    .on('whiteboard_layer_permissions').column('layer_index').execute();

  // Custom roles indexes
  await db.schema.createIndex('idx_whiteboard_custom_roles_workspace_id')
    .on('whiteboard_custom_roles').column('workspace_id').execute();
  await db.schema.createIndex('idx_whiteboard_custom_roles_name')
    .on('whiteboard_custom_roles').column('role_name').execute();
  await db.schema.createIndex('idx_whiteboard_custom_roles_default')
    .on('whiteboard_custom_roles').column('default_for_new_users').execute();

  // Permission audit indexes
  await db.schema.createIndex('idx_whiteboard_permission_audit_whiteboard_id')
    .on('whiteboard_permission_audit').column('whiteboard_id').execute();
  await db.schema.createIndex('idx_whiteboard_permission_audit_target_user')
    .on('whiteboard_permission_audit').column('target_user_id').execute();
  await db.schema.createIndex('idx_whiteboard_permission_audit_changed_by')
    .on('whiteboard_permission_audit').column('changed_by').execute();
  await db.schema.createIndex('idx_whiteboard_permission_audit_action')
    .on('whiteboard_permission_audit').column('action').execute();
  await db.schema.createIndex('idx_whiteboard_permission_audit_created_at')
    .on('whiteboard_permission_audit').column('created_at').execute();

  // Permission cache indexes
  await db.schema.createIndex('idx_whiteboard_permission_cache_whiteboard_user')
    .on('whiteboard_permission_cache').columns(['whiteboard_id', 'user_id']).execute();
  await db.schema.createIndex('idx_whiteboard_permission_cache_hash')
    .on('whiteboard_permission_cache').column('permission_hash').execute();
  await db.schema.createIndex('idx_whiteboard_permission_cache_expires')
    .on('whiteboard_permission_cache').column('expires_at').execute();
  await db.schema.createIndex('idx_whiteboard_permission_cache_version')
    .on('whiteboard_permission_cache').column('cache_version').execute();

  // Composite indexes for common permission queries
  await db.schema.createIndex('idx_whiteboard_element_permissions_user_element')
    .on('whiteboard_element_permissions').columns(['user_id', 'element_id', 'permission_type']).execute();
  await db.schema.createIndex('idx_whiteboard_area_permissions_user_whiteboard')
    .on('whiteboard_area_permissions').columns(['user_id', 'whiteboard_id']).execute();
  await db.schema.createIndex('idx_whiteboard_layer_permissions_user_whiteboard_layer')
    .on('whiteboard_layer_permissions').columns(['user_id', 'whiteboard_id', 'layer_index']).execute();

  // Add foreign key constraints
  await db.schema.alterTable('whiteboard_permissions')
    .addForeignKeyConstraint('fk_whiteboard_permissions_inherited_from', ['inherited_from'], 'whiteboard_permissions', ['id'])
    .execute();

  await db.schema.alterTable('whiteboard_permissions')
    .addForeignKeyConstraint('fk_whiteboard_permissions_delegated_by', ['delegated_by'], 'whiteboard_permissions', ['id'])
    .execute();

  await db.schema.alterTable('whiteboard_element_permissions')
    .addForeignKeyConstraint('fk_whiteboard_element_permissions_granted_by', ['granted_by'], 'whiteboard_permissions', ['id'])
    .execute();

  await db.schema.alterTable('whiteboard_area_permissions')
    .addForeignKeyConstraint('fk_whiteboard_area_permissions_granted_by', ['granted_by'], 'whiteboard_permissions', ['id'])
    .execute();

  await db.schema.alterTable('whiteboard_layer_permissions')
    .addForeignKeyConstraint('fk_whiteboard_layer_permissions_granted_by', ['granted_by'], 'whiteboard_permissions', ['id'])
    .execute();

  // Add unique constraints
  await db.schema.alterTable('whiteboard_element_permissions')
    .addUniqueConstraint('uk_whiteboard_element_permissions_user_element_type', ['user_id', 'element_id', 'permission_type'])
    .execute();

  await db.schema.alterTable('whiteboard_layer_permissions')
    .addUniqueConstraint('uk_whiteboard_layer_permissions_user_whiteboard_layer', ['user_id', 'whiteboard_id', 'layer_index'])
    .execute();

  await db.schema.alterTable('whiteboard_custom_roles')
    .addUniqueConstraint('uk_whiteboard_custom_roles_workspace_name', ['workspace_id', 'role_name'])
    .execute();

  await db.schema.alterTable('whiteboard_permission_cache')
    .addUniqueConstraint('uk_whiteboard_permission_cache_user_whiteboard', ['user_id', 'whiteboard_id'])
    .execute();

  // Add check constraints for data integrity
  await db.schema.alterTable('whiteboard_area_permissions')
    .addCheckConstraint('ck_whiteboard_area_permissions_priority', sql`priority >= 0 AND priority <= 100`)
    .execute();

  await db.schema.alterTable('whiteboard_layer_permissions')
    .addCheckConstraint('ck_whiteboard_layer_permissions_layer_index', sql`layer_index >= -1`)
    .execute();

  // Create triggers for cache invalidation
  await db.executeQuery(sql`
    CREATE OR REPLACE FUNCTION invalidate_permission_cache()
    RETURNS TRIGGER AS $$
    BEGIN
      -- Invalidate cache when permissions change
      DELETE FROM whiteboard_permission_cache 
      WHERE whiteboard_id = COALESCE(NEW.whiteboard_id, OLD.whiteboard_id)
        AND user_id = COALESCE(NEW.user_id, OLD.user_id);
      
      -- Update cache version for remaining entries
      UPDATE whiteboard_permission_cache 
      SET cache_version = cache_version + 1
      WHERE whiteboard_id = COALESCE(NEW.whiteboard_id, OLD.whiteboard_id);
      
      RETURN COALESCE(NEW, OLD);
    END;
    $$ LANGUAGE plpgsql;
  `.compile(db));

  // Apply cache invalidation triggers to all permission tables
  const permissionTables = [
    'whiteboard_permissions',
    'whiteboard_element_permissions',
    'whiteboard_area_permissions',
    'whiteboard_layer_permissions'
  ];

  for (const table of permissionTables) {
    await db.executeQuery(sql`
      CREATE TRIGGER trg_${sql.raw(table)}_cache_invalidation
      AFTER INSERT OR UPDATE OR DELETE ON ${sql.raw(table)}
      FOR EACH ROW EXECUTE FUNCTION invalidate_permission_cache();
    `.compile(db));
  }

  // Create function for permission inheritance
  await db.executeQuery(sql`
    CREATE OR REPLACE FUNCTION inherit_permissions(
      p_whiteboard_id UUID,
      p_user_id UUID,
      p_inherited_from UUID,
      p_granted_by UUID
    )
    RETURNS UUID AS $$
    DECLARE
      v_permission_id UUID;
      v_source_permission RECORD;
    BEGIN
      -- Get source permission to inherit from
      SELECT * INTO v_source_permission
      FROM whiteboard_permissions
      WHERE id = p_inherited_from;
      
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Source permission not found: %', p_inherited_from;
      END IF;
      
      -- Create inherited permission
      INSERT INTO whiteboard_permissions (
        whiteboard_id, user_id, role, permissions, granted_by,
        is_inherited, inherited_from, can_delegate,
        custom_permissions, area_restrictions, layer_permissions,
        operation_permissions, temporary_permissions, inheritance_rules
      )
      VALUES (
        p_whiteboard_id, p_user_id, v_source_permission.role,
        v_source_permission.permissions, p_granted_by,
        true, p_inherited_from, false,
        v_source_permission.custom_permissions,
        v_source_permission.area_restrictions,
        v_source_permission.layer_permissions,
        v_source_permission.operation_permissions,
        v_source_permission.temporary_permissions,
        v_source_permission.inheritance_rules
      )
      RETURNING id INTO v_permission_id;
      
      RETURN v_permission_id;
    END;
    $$ LANGUAGE plpgsql;
  `.compile(db));

  // Create function for permission delegation
  await db.executeQuery(sql`
    CREATE OR REPLACE FUNCTION delegate_permissions(
      p_whiteboard_id UUID,
      p_target_user_id UUID,
      p_delegating_user_id UUID,
      p_permissions JSONB,
      p_expires_at TIMESTAMPTZ DEFAULT NULL
    )
    RETURNS UUID AS $$
    DECLARE
      v_permission_id UUID;
      v_delegator_permission RECORD;
    BEGIN
      -- Check if delegating user has delegation rights
      SELECT * INTO v_delegator_permission
      FROM whiteboard_permissions
      WHERE whiteboard_id = p_whiteboard_id
        AND user_id = p_delegating_user_id
        AND can_delegate = true;
      
      IF NOT FOUND THEN
        RAISE EXCEPTION 'User % does not have delegation rights for whiteboard %', 
          p_delegating_user_id, p_whiteboard_id;
      END IF;
      
      -- Create delegated permission
      INSERT INTO whiteboard_permissions (
        whiteboard_id, user_id, role, permissions, granted_by,
        delegated_by, expires_at, can_delegate
      )
      VALUES (
        p_whiteboard_id, p_target_user_id, 'delegated',
        p_permissions, p_delegating_user_id,
        p_delegating_user_id, p_expires_at, false
      )
      RETURNING id INTO v_permission_id;
      
      RETURN v_permission_id;
    END;
    $$ LANGUAGE plpgsql;
  `.compile(db));

  console.log('✅ Enhanced whiteboard permissions migration completed');
}

export async function down(db: Kysely<any>): Promise<void> {
  // Drop functions
  await db.executeQuery(sql`DROP FUNCTION IF EXISTS delegate_permissions(UUID, UUID, UUID, JSONB, TIMESTAMPTZ)`.compile(db));
  await db.executeQuery(sql`DROP FUNCTION IF EXISTS inherit_permissions(UUID, UUID, UUID, UUID)`.compile(db));
  await db.executeQuery(sql`DROP FUNCTION IF EXISTS invalidate_permission_cache()`.compile(db));

  // Drop triggers
  const permissionTables = [
    'whiteboard_permissions',
    'whiteboard_element_permissions', 
    'whiteboard_area_permissions',
    'whiteboard_layer_permissions'
  ];

  for (const table of permissionTables) {
    await db.executeQuery(sql`DROP TRIGGER IF EXISTS trg_${sql.raw(table)}_cache_invalidation ON ${sql.raw(table)}`.compile(db));
  }

  // Drop tables in reverse order
  await db.schema.dropTable('whiteboard_permission_cache').execute();
  await db.schema.dropTable('whiteboard_permission_audit').execute();
  await db.schema.dropTable('whiteboard_custom_roles').execute();
  await db.schema.dropTable('whiteboard_layer_permissions').execute();
  await db.schema.dropTable('whiteboard_area_permissions').execute();
  await db.schema.dropTable('whiteboard_element_permissions').execute();

  // Remove added columns from whiteboard_permissions
  await db.schema
    .alterTable('whiteboard_permissions')
    .dropColumn('custom_permissions')
    .dropColumn('area_restrictions')
    .dropColumn('layer_permissions')
    .dropColumn('operation_permissions')
    .dropColumn('temporary_permissions')
    .dropColumn('inheritance_rules')
    .dropColumn('delegation_rules')
    .dropColumn('is_inherited')
    .dropColumn('inherited_from')
    .dropColumn('can_delegate')
    .dropColumn('delegated_by')
    .execute();

  console.log('✅ Enhanced whiteboard permissions migration rolled back');
}