import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // Whiteboard versions table - store version snapshots with delta compression
  await db.schema
    .createTable('whiteboard_versions')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('whiteboard_id', 'uuid', (col) => col.notNull().references('whiteboards.id').onDelete('cascade'))
    .addColumn('version_number', 'integer', (col) => col.notNull()) // Sequential version number
    .addColumn('parent_version_id', 'uuid') // For version tree/branching
    .addColumn('version_type', 'varchar(20)', (col) => col.notNull().defaultTo('snapshot').check(
      sql`version_type IN ('snapshot', 'delta', 'checkpoint', 'branch', 'merge')`
    ))
    .addColumn('change_type', 'varchar(20)', (col) => col.notNull().check(
      sql`change_type IN ('major', 'minor', 'patch', 'auto_save', 'manual', 'template', 'rollback', 'merge')`
    ))
    .addColumn('commit_message', 'varchar(500)') // User-provided description
    .addColumn('is_automatic', 'boolean', (col) => col.defaultTo(false).notNull()) // Auto-generated version
    .addColumn('created_by', 'uuid', (col) => col.notNull()) // User who created this version
    .addColumn('branch_name', 'varchar(100)') // Branch name for collaborative versioning
    .addColumn('merge_source_id', 'uuid') // Source version for merge operations
    .addColumn('is_milestone', 'boolean', (col) => col.defaultTo(false)) // Important checkpoint
    .addColumn('tags', 'jsonb', (col) => col.defaultTo('[]').check(
      sql`jsonb_typeof(tags) = 'array'`
    )) // User-defined tags
    
    // Version data storage
    .addColumn('snapshot_data', 'jsonb') // Full snapshot for major versions
    .addColumn('delta_data', 'jsonb') // Delta changes for minor versions
    .addColumn('compressed_data', 'bytea') // Compressed binary data for large snapshots
    .addColumn('compression_type', 'varchar(20)') // gzip, lz4, etc.
    .addColumn('data_size', 'bigint') // Uncompressed data size
    .addColumn('compressed_size', 'bigint') // Compressed data size
    
    // Version metadata
    .addColumn('element_count', 'integer', (col) => col.defaultTo(0)) // Number of elements in this version
    .addColumn('canvas_hash', 'varchar(64)') // Hash of canvas data for quick comparison
    .addColumn('elements_hash', 'varchar(64)') // Hash of elements for change detection
    .addColumn('total_changes', 'integer', (col) => col.defaultTo(0)) // Number of changes from previous version
    .addColumn('elements_added', 'integer', (col) => col.defaultTo(0)) // New elements
    .addColumn('elements_modified', 'integer', (col) => col.defaultTo(0)) // Changed elements  
    .addColumn('elements_deleted', 'integer', (col) => col.defaultTo(0)) // Removed elements
    
    // Performance and metadata
    .addColumn('creation_time_ms', 'integer') // Time taken to create version
    .addColumn('whiteboard_version', 'integer', (col) => col.defaultTo(1)) // Whiteboard version at time of snapshot
    .addColumn('metadata', 'jsonb', (col) => col.defaultTo('{}').check(
      sql`jsonb_typeof(metadata) = 'object'`
    )) // Additional version metadata
    .addColumn('expires_at', 'timestamptz') // Optional expiry for auto-versions
    .addColumn('created_at', 'timestamptz', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
    .execute();

  // Version deltas table - store individual change operations
  await db.schema
    .createTable('whiteboard_version_deltas')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('version_id', 'uuid', (col) => col.notNull().references('whiteboard_versions.id').onDelete('cascade'))
    .addColumn('operation_type', 'varchar(20)', (col) => col.notNull().check(
      sql`operation_type IN ('create', 'update', 'delete', 'move', 'style', 'canvas')`
    ))
    .addColumn('element_id', 'uuid') // Target element ID (null for canvas changes)
    .addColumn('operation_order', 'integer', (col) => col.notNull()) // Order of operations within version
    .addColumn('old_data', 'jsonb') // Previous state
    .addColumn('new_data', 'jsonb') // New state
    .addColumn('delta_patch', 'jsonb') // JSON patch format delta
    .addColumn('operation_metadata', 'jsonb', (col) => col.defaultTo('{}')) // Additional operation context
    .addColumn('created_at', 'timestamptz', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
    .execute();

  // Version comparisons table - cache comparison results
  await db.schema
    .createTable('whiteboard_version_comparisons')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('whiteboard_id', 'uuid', (col) => col.notNull().references('whiteboards.id').onDelete('cascade'))
    .addColumn('version_a_id', 'uuid', (col) => col.notNull().references('whiteboard_versions.id').onDelete('cascade'))
    .addColumn('version_b_id', 'uuid', (col) => col.notNull().references('whiteboard_versions.id').onDelete('cascade'))
    .addColumn('comparison_type', 'varchar(20)', (col) => col.notNull().check(
      sql`comparison_type IN ('full', 'elements_only', 'canvas_only', 'metadata_only')`
    ))
    .addColumn('diff_summary', 'jsonb', (col) => col.defaultTo('{}')) // High-level diff summary
    .addColumn('detailed_diff', 'jsonb') // Detailed comparison data
    .addColumn('diff_size', 'integer') // Size of diff data
    .addColumn('similarity_score', 'decimal(5,4)') // 0.0 to 1.0 similarity score
    .addColumn('processing_time_ms', 'integer') // Time to compute comparison
    .addColumn('created_by', 'uuid', (col) => col.notNull()) // User who requested comparison
    .addColumn('created_at', 'timestamptz', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
    .addColumn('expires_at', 'timestamptz', (col) => col.notNull()) // Cache expiry
    .execute();

  // Version rollback operations table - track rollback attempts
  await db.schema
    .createTable('whiteboard_version_rollbacks')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('whiteboard_id', 'uuid', (col) => col.notNull().references('whiteboards.id').onDelete('cascade'))
    .addColumn('source_version_id', 'uuid', (col) => col.notNull()) // Current version before rollback
    .addColumn('target_version_id', 'uuid', (col) => col.notNull().references('whiteboard_versions.id').onDelete('restrict'))
    .addColumn('rollback_type', 'varchar(20)', (col) => col.notNull().check(
      sql`rollback_type IN ('full', 'partial', 'elements_only', 'canvas_only')`
    ))
    .addColumn('status', 'varchar(20)', (col) => col.notNull().defaultTo('pending').check(
      sql`status IN ('pending', 'processing', 'completed', 'failed', 'cancelled', 'conflict')`
    ))
    .addColumn('conflict_resolution', 'varchar(20)', (col) => col.check(
      sql`conflict_resolution IN ('overwrite', 'merge', 'manual', 'cancel')`
    ))
    .addColumn('conflicts_data', 'jsonb') // Details of conflicts found
    .addColumn('rollback_operations', 'jsonb') // List of operations to perform
    .addColumn('completed_operations', 'integer', (col) => col.defaultTo(0)) // Number of operations completed
    .addColumn('total_operations', 'integer', (col) => col.defaultTo(0)) // Total operations needed
    .addColumn('backup_version_id', 'uuid') // Backup version created before rollback
    .addColumn('user_id', 'uuid', (col) => col.notNull()) // User who initiated rollback
    .addColumn('error_message', 'text') // Error details if failed
    .addColumn('processing_time_ms', 'integer')
    .addColumn('started_at', 'timestamptz')
    .addColumn('completed_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
    .execute();

  // Version branch management - for collaborative versioning
  await db.schema
    .createTable('whiteboard_version_branches')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('whiteboard_id', 'uuid', (col) => col.notNull().references('whiteboards.id').onDelete('cascade'))
    .addColumn('branch_name', 'varchar(100)', (col) => col.notNull())
    .addColumn('base_version_id', 'uuid', (col) => col.notNull().references('whiteboard_versions.id').onDelete('restrict'))
    .addColumn('head_version_id', 'uuid') // Latest version in this branch
    .addColumn('created_by', 'uuid', (col) => col.notNull())
    .addColumn('description', 'varchar(500)')
    .addColumn('is_main', 'boolean', (col) => col.defaultTo(false)) // Main/master branch
    .addColumn('is_protected', 'boolean', (col) => col.defaultTo(false)) // Protected from direct modifications
    .addColumn('merge_permissions', 'jsonb', (col) => col.defaultTo('{}')) // Who can merge to this branch
    .addColumn('status', 'varchar(20)', (col) => col.notNull().defaultTo('active').check(
      sql`status IN ('active', 'merged', 'abandoned', 'locked')`
    ))
    .addColumn('merged_to_branch_id', 'uuid') // Branch this was merged into
    .addColumn('merged_at', 'timestamptz')
    .addColumn('merged_by', 'uuid')
    .addColumn('created_at', 'timestamptz', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
    .addColumn('updated_at', 'timestamptz', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
    .execute();

  // Version access control - who can access different versions
  await db.schema
    .createTable('whiteboard_version_permissions')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('version_id', 'uuid', (col) => col.notNull().references('whiteboard_versions.id').onDelete('cascade'))
    .addColumn('user_id', 'uuid')
    .addColumn('role_id', 'uuid') // For role-based access
    .addColumn('permission_type', 'varchar(20)', (col) => col.notNull().check(
      sql`permission_type IN ('view', 'compare', 'rollback', 'branch', 'delete')`
    ))
    .addColumn('granted_by', 'uuid', (col) => col.notNull())
    .addColumn('granted_at', 'timestamptz', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
    .addColumn('expires_at', 'timestamptz')
    .execute();

  // Create performance indexes
  
  // Primary version queries
  await db.schema.createIndex('idx_versions_whiteboard_id').on('whiteboard_versions').column('whiteboard_id').execute();
  await db.schema.createIndex('idx_versions_whiteboard_number').on('whiteboard_versions').columns(['whiteboard_id', 'version_number']).execute();
  await db.schema.createIndex('idx_versions_parent').on('whiteboard_versions').column('parent_version_id').execute();
  await db.schema.createIndex('idx_versions_created_by').on('whiteboard_versions').column('created_by').execute();
  await db.schema.createIndex('idx_versions_created_at').on('whiteboard_versions').column('created_at').execute();
  await db.schema.createIndex('idx_versions_type').on('whiteboard_versions').column('version_type').execute();
  await db.schema.createIndex('idx_versions_change_type').on('whiteboard_versions').column('change_type').execute();
  await db.schema.createIndex('idx_versions_branch').on('whiteboard_versions').column('branch_name').execute();
  await db.schema.createIndex('idx_versions_milestone').on('whiteboard_versions').column('is_milestone').execute();
  await db.schema.createIndex('idx_versions_expires_at').on('whiteboard_versions').column('expires_at').execute();

  // Delta operations
  await db.schema.createIndex('idx_deltas_version_id').on('whiteboard_version_deltas').column('version_id').execute();
  await db.schema.createIndex('idx_deltas_element_id').on('whiteboard_version_deltas').column('element_id').execute();
  await db.schema.createIndex('idx_deltas_operation_type').on('whiteboard_version_deltas').column('operation_type').execute();
  await db.schema.createIndex('idx_deltas_order').on('whiteboard_version_deltas').columns(['version_id', 'operation_order']).execute();

  // Version comparisons
  await db.schema.createIndex('idx_comparisons_whiteboard_id').on('whiteboard_version_comparisons').column('whiteboard_id').execute();
  await db.schema.createIndex('idx_comparisons_versions').on('whiteboard_version_comparisons').columns(['version_a_id', 'version_b_id']).execute();
  await db.schema.createIndex('idx_comparisons_created_by').on('whiteboard_version_comparisons').column('created_by').execute();
  await db.schema.createIndex('idx_comparisons_expires_at').on('whiteboard_version_comparisons').column('expires_at').execute();

  // Rollback operations
  await db.schema.createIndex('idx_rollbacks_whiteboard_id').on('whiteboard_version_rollbacks').column('whiteboard_id').execute();
  await db.schema.createIndex('idx_rollbacks_user_id').on('whiteboard_version_rollbacks').column('user_id').execute();
  await db.schema.createIndex('idx_rollbacks_status').on('whiteboard_version_rollbacks').column('status').execute();
  await db.schema.createIndex('idx_rollbacks_target_version').on('whiteboard_version_rollbacks').column('target_version_id').execute();
  await db.schema.createIndex('idx_rollbacks_created_at').on('whiteboard_version_rollbacks').column('created_at').execute();

  // Branch management
  await db.schema.createIndex('idx_branches_whiteboard_id').on('whiteboard_version_branches').column('whiteboard_id').execute();
  await db.schema.createIndex('idx_branches_name').on('whiteboard_version_branches').columns(['whiteboard_id', 'branch_name']).execute();
  await db.schema.createIndex('idx_branches_base_version').on('whiteboard_version_branches').column('base_version_id').execute();
  await db.schema.createIndex('idx_branches_head_version').on('whiteboard_version_branches').column('head_version_id').execute();
  await db.schema.createIndex('idx_branches_created_by').on('whiteboard_version_branches').column('created_by').execute();
  await db.schema.createIndex('idx_branches_status').on('whiteboard_version_branches').column('status').execute();
  await db.schema.createIndex('idx_branches_is_main').on('whiteboard_version_branches').column('is_main').execute();

  // Version permissions
  await db.schema.createIndex('idx_version_permissions_version_id').on('whiteboard_version_permissions').column('version_id').execute();
  await db.schema.createIndex('idx_version_permissions_user_id').on('whiteboard_version_permissions').column('user_id').execute();
  await db.schema.createIndex('idx_version_permissions_role_id').on('whiteboard_version_permissions').column('role_id').execute();
  await db.schema.createIndex('idx_version_permissions_type').on('whiteboard_version_permissions').column('permission_type').execute();
  await db.schema.createIndex('idx_version_permissions_expires_at').on('whiteboard_version_permissions').column('expires_at').execute();

  // Composite indexes for common queries
  await db.schema.createIndex('idx_versions_whiteboard_type_created').on('whiteboard_versions').columns(['whiteboard_id', 'version_type', 'created_at']).execute();
  await db.schema.createIndex('idx_versions_branch_created').on('whiteboard_versions').columns(['branch_name', 'created_at']).execute();
  await db.schema.createIndex('idx_rollbacks_whiteboard_status').on('whiteboard_version_rollbacks').columns(['whiteboard_id', 'status']).execute();
  await db.schema.createIndex('idx_comparisons_versions_type').on('whiteboard_version_comparisons').columns(['version_a_id', 'version_b_id', 'comparison_type']).execute();

  // Add foreign key constraints
  await db.schema.alterTable('whiteboard_versions')
    .addForeignKeyConstraint('fk_versions_parent', ['parent_version_id'], 'whiteboard_versions', ['id']).onDelete('set null')
    .execute();
  
  await db.schema.alterTable('whiteboard_versions')
    .addForeignKeyConstraint('fk_versions_merge_source', ['merge_source_id'], 'whiteboard_versions', ['id']).onDelete('set null')
    .execute();

  await db.schema.alterTable('whiteboard_version_rollbacks')
    .addForeignKeyConstraint('fk_rollbacks_backup_version', ['backup_version_id'], 'whiteboard_versions', ['id']).onDelete('set null')
    .execute();

  await db.schema.alterTable('whiteboard_version_branches')
    .addForeignKeyConstraint('fk_branches_head_version', ['head_version_id'], 'whiteboard_versions', ['id']).onDelete('set null')
    .execute();
  
  await db.schema.alterTable('whiteboard_version_branches')
    .addForeignKeyConstraint('fk_branches_merged_to', ['merged_to_branch_id'], 'whiteboard_version_branches', ['id']).onDelete('set null')
    .execute();

  // Add unique constraints
  await db.schema.alterTable('whiteboard_versions')
    .addUniqueConstraint('unique_whiteboard_version_number', ['whiteboard_id', 'version_number'])
    .execute();

  await db.schema.alterTable('whiteboard_version_branches')
    .addUniqueConstraint('unique_whiteboard_branch_name', ['whiteboard_id', 'branch_name'])
    .execute();

  await db.schema.alterTable('whiteboard_version_comparisons')
    .addUniqueConstraint('unique_version_comparison', ['version_a_id', 'version_b_id', 'comparison_type'])
    .execute();

  // Add check constraints
  await db.schema.alterTable('whiteboard_versions')
    .addCheckConstraint('check_version_number_positive', sql`version_number > 0`)
    .execute();

  await db.schema.alterTable('whiteboard_versions')
    .addCheckConstraint('check_data_sizes', sql`(data_size IS NULL OR data_size >= 0) AND (compressed_size IS NULL OR compressed_size >= 0)`)
    .execute();

  await db.schema.alterTable('whiteboard_version_deltas')
    .addCheckConstraint('check_operation_order_positive', sql`operation_order >= 0`)
    .execute();

  await db.schema.alterTable('whiteboard_version_comparisons')
    .addCheckConstraint('check_similarity_score_range', sql`similarity_score >= 0.0 AND similarity_score <= 1.0`)
    .execute();

  await db.schema.alterTable('whiteboard_version_rollbacks')
    .addCheckConstraint('check_operation_counts', sql`completed_operations >= 0 AND total_operations >= 0 AND completed_operations <= total_operations`)
    .execute();

  console.log('✅ Whiteboard versioning migration completed');
}

export async function down(db: Kysely<any>): Promise<void> {
  // Drop tables in reverse order due to foreign key constraints
  await db.schema.dropTable('whiteboard_version_permissions').execute();
  await db.schema.dropTable('whiteboard_version_branches').execute();
  await db.schema.dropTable('whiteboard_version_rollbacks').execute();
  await db.schema.dropTable('whiteboard_version_comparisons').execute();
  await db.schema.dropTable('whiteboard_version_deltas').execute();
  await db.schema.dropTable('whiteboard_versions').execute();
  
  console.log('✅ Whiteboard versioning migration rolled back');
}