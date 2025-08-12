import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // Export/import jobs table - track all export and import operations
  await db.schema
    .createTable('whiteboard_export_import_jobs')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('whiteboard_id', 'uuid', (col) => col.notNull().references('whiteboards.id').onDelete('cascade'))
    .addColumn('user_id', 'uuid', (col) => col.notNull()) // User who initiated the job
    .addColumn('job_type', 'varchar(20)', (col) => col.notNull().check(
      sql`job_type IN ('export', 'import')`
    ))
    .addColumn('operation_type', 'varchar(50)', (col) => col.notNull()) // pdf, png, svg, json, markdown, zip, etc.
    .addColumn('status', 'varchar(20)', (col) => col.notNull().defaultTo('pending').check(
      sql`status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')`
    ))
    .addColumn('progress', 'integer', (col) => col.defaultTo(0)) // Percentage 0-100
    .addColumn('file_size', 'bigint') // Size in bytes
    .addColumn('file_path', 'text') // Path to generated/uploaded file
    .addColumn('download_url', 'text') // Temporary download URL
    .addColumn('file_metadata', 'jsonb', (col) => col.defaultTo('{}').check(
      sql`jsonb_typeof(file_metadata) = 'object'`
    )) // Format-specific metadata (resolution, quality, etc.)
    .addColumn('job_options', 'jsonb', (col) => col.defaultTo('{}').check(
      sql`jsonb_typeof(job_options) = 'object'`
    )) // Export/import options
    .addColumn('error_message', 'text') // Error details if failed
    .addColumn('error_details', 'jsonb') // Structured error information
    .addColumn('processing_time_ms', 'integer') // Processing duration
    .addColumn('expires_at', 'timestamptz') // When download URL expires
    .addColumn('started_at', 'timestamptz') // When processing started
    .addColumn('completed_at', 'timestamptz') // When processing completed
    .addColumn('created_at', 'timestamptz', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
    .addColumn('updated_at', 'timestamptz', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
    .execute();

  // File upload table - track uploaded files for import
  await db.schema
    .createTable('whiteboard_file_uploads')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('user_id', 'uuid', (col) => col.notNull()) // User who uploaded
    .addColumn('original_filename', 'varchar(255)', (col) => col.notNull())
    .addColumn('file_type', 'varchar(100)', (col) => col.notNull()) // MIME type
    .addColumn('file_size', 'bigint', (col) => col.notNull())
    .addColumn('file_path', 'text', (col) => col.notNull()) // Storage path
    .addColumn('file_hash', 'varchar(64)') // SHA-256 hash for deduplication
    .addColumn('scan_status', 'varchar(20)', (col) => col.notNull().defaultTo('pending').check(
      sql`scan_status IN ('pending', 'scanning', 'clean', 'infected', 'failed')`
    )) // Security scan status
    .addColumn('scan_results', 'jsonb', (col) => col.defaultTo('{}')) // Security scan details
    .addColumn('metadata', 'jsonb', (col) => col.defaultTo('{}').check(
      sql`jsonb_typeof(metadata) = 'object'`
    )) // File metadata (dimensions, format info, etc.)
    .addColumn('is_processed', 'boolean', (col) => col.defaultTo(false)) // Whether file has been processed
    .addColumn('expires_at', 'timestamptz', (col) => col.notNull()) // When file should be cleaned up
    .addColumn('created_at', 'timestamptz', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
    .addColumn('updated_at', 'timestamptz', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
    .execute();

  // Export/import batch operations - track bulk operations
  await db.schema
    .createTable('whiteboard_batch_operations')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('workspace_id', 'uuid', (col) => col.notNull().references('collaborative_workspaces.id').onDelete('cascade'))
    .addColumn('user_id', 'uuid', (col) => col.notNull())
    .addColumn('operation_type', 'varchar(20)', (col) => col.notNull().check(
      sql`operation_type IN ('batch_export', 'batch_import')`
    ))
    .addColumn('format', 'varchar(50)', (col) => col.notNull()) // Target format for batch operations
    .addColumn('status', 'varchar(20)', (col) => col.notNull().defaultTo('pending').check(
      sql`status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')`
    ))
    .addColumn('total_items', 'integer', (col) => col.defaultTo(0)) // Total whiteboards/files
    .addColumn('processed_items', 'integer', (col) => col.defaultTo(0)) // Completed items
    .addColumn('failed_items', 'integer', (col) => col.defaultTo(0)) // Failed items
    .addColumn('archive_path', 'text') // Path to ZIP archive if applicable
    .addColumn('archive_size', 'bigint') // Archive size in bytes
    .addColumn('download_url', 'text') // Temporary download URL for archive
    .addColumn('batch_options', 'jsonb', (col) => col.defaultTo('{}').check(
      sql`jsonb_typeof(batch_options) = 'object'`
    )) // Batch operation options
    .addColumn('error_summary', 'jsonb', (col) => col.defaultTo('{}')) // Summary of errors
    .addColumn('processing_time_ms', 'integer') // Total processing time
    .addColumn('expires_at', 'timestamptz') // When download expires
    .addColumn('started_at', 'timestamptz')
    .addColumn('completed_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
    .addColumn('updated_at', 'timestamptz', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
    .execute();

  // Batch operation items - individual items within a batch
  await db.schema
    .createTable('whiteboard_batch_items')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('batch_id', 'uuid', (col) => col.notNull().references('whiteboard_batch_operations.id').onDelete('cascade'))
    .addColumn('whiteboard_id', 'uuid') // For exports, null for imports
    .addColumn('job_id', 'uuid') // Reference to individual job
    .addColumn('source_path', 'text') // Source file for imports
    .addColumn('target_path', 'text') // Target file for exports
    .addColumn('item_name', 'varchar(255)') // Display name for the item
    .addColumn('status', 'varchar(20)', (col) => col.notNull().defaultTo('pending').check(
      sql`status IN ('pending', 'processing', 'completed', 'failed', 'skipped')`
    ))
    .addColumn('error_message', 'text') // Error if failed
    .addColumn('file_size', 'bigint') // Size of generated/processed file
    .addColumn('processing_time_ms', 'integer') // Processing time for this item
    .addColumn('created_at', 'timestamptz', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
    .addColumn('updated_at', 'timestamptz', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
    .execute();

  // Template import/export tracking - track template sharing
  await db.schema
    .createTable('whiteboard_template_transfers')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('template_id', 'uuid', (col) => col.notNull().references('whiteboard_templates.id').onDelete('cascade'))
    .addColumn('source_workspace_id', 'uuid') // Source workspace
    .addColumn('target_workspace_id', 'uuid') // Target workspace
    .addColumn('user_id', 'uuid', (col) => col.notNull()) // User who initiated transfer
    .addColumn('transfer_type', 'varchar(20)', (col) => col.notNull().check(
      sql`transfer_type IN ('export', 'import', 'share', 'copy')`
    ))
    .addColumn('status', 'varchar(20)', (col) => col.notNull().defaultTo('pending').check(
      sql`status IN ('pending', 'completed', 'failed')`
    ))
    .addColumn('file_path', 'text') // Path to exported template file
    .addColumn('transfer_data', 'jsonb', (col) => col.defaultTo('{}')) // Transfer metadata
    .addColumn('error_message', 'text')
    .addColumn('created_at', 'timestamptz', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
    .addColumn('completed_at', 'timestamptz')
    .execute();

  // Create performance indexes
  
  // Export/import jobs indexes
  await db.schema.createIndex('idx_export_import_jobs_whiteboard_id').on('whiteboard_export_import_jobs').column('whiteboard_id').execute();
  await db.schema.createIndex('idx_export_import_jobs_user_id').on('whiteboard_export_import_jobs').column('user_id').execute();
  await db.schema.createIndex('idx_export_import_jobs_status').on('whiteboard_export_import_jobs').column('status').execute();
  await db.schema.createIndex('idx_export_import_jobs_type').on('whiteboard_export_import_jobs').column('job_type').execute();
  await db.schema.createIndex('idx_export_import_jobs_operation').on('whiteboard_export_import_jobs').column('operation_type').execute();
  await db.schema.createIndex('idx_export_import_jobs_created_at').on('whiteboard_export_import_jobs').column('created_at').execute();
  await db.schema.createIndex('idx_export_import_jobs_expires_at').on('whiteboard_export_import_jobs').column('expires_at').execute();

  // File uploads indexes
  await db.schema.createIndex('idx_file_uploads_user_id').on('whiteboard_file_uploads').column('user_id').execute();
  await db.schema.createIndex('idx_file_uploads_hash').on('whiteboard_file_uploads').column('file_hash').execute();
  await db.schema.createIndex('idx_file_uploads_scan_status').on('whiteboard_file_uploads').column('scan_status').execute();
  await db.schema.createIndex('idx_file_uploads_expires_at').on('whiteboard_file_uploads').column('expires_at').execute();
  await db.schema.createIndex('idx_file_uploads_created_at').on('whiteboard_file_uploads').column('created_at').execute();

  // Batch operations indexes
  await db.schema.createIndex('idx_batch_operations_workspace_id').on('whiteboard_batch_operations').column('workspace_id').execute();
  await db.schema.createIndex('idx_batch_operations_user_id').on('whiteboard_batch_operations').column('user_id').execute();
  await db.schema.createIndex('idx_batch_operations_status').on('whiteboard_batch_operations').column('status').execute();
  await db.schema.createIndex('idx_batch_operations_type').on('whiteboard_batch_operations').column('operation_type').execute();
  await db.schema.createIndex('idx_batch_operations_created_at').on('whiteboard_batch_operations').column('created_at').execute();
  await db.schema.createIndex('idx_batch_operations_expires_at').on('whiteboard_batch_operations').column('expires_at').execute();

  // Batch items indexes
  await db.schema.createIndex('idx_batch_items_batch_id').on('whiteboard_batch_items').column('batch_id').execute();
  await db.schema.createIndex('idx_batch_items_whiteboard_id').on('whiteboard_batch_items').column('whiteboard_id').execute();
  await db.schema.createIndex('idx_batch_items_job_id').on('whiteboard_batch_items').column('job_id').execute();
  await db.schema.createIndex('idx_batch_items_status').on('whiteboard_batch_items').column('status').execute();

  // Template transfers indexes
  await db.schema.createIndex('idx_template_transfers_template_id').on('whiteboard_template_transfers').column('template_id').execute();
  await db.schema.createIndex('idx_template_transfers_source_workspace').on('whiteboard_template_transfers').column('source_workspace_id').execute();
  await db.schema.createIndex('idx_template_transfers_target_workspace').on('whiteboard_template_transfers').column('target_workspace_id').execute();
  await db.schema.createIndex('idx_template_transfers_user_id').on('whiteboard_template_transfers').column('user_id').execute();
  await db.schema.createIndex('idx_template_transfers_type').on('whiteboard_template_transfers').column('transfer_type').execute();
  await db.schema.createIndex('idx_template_transfers_status').on('whiteboard_template_transfers').column('status').execute();

  // Composite indexes for common queries
  await db.schema.createIndex('idx_export_import_jobs_user_status').on('whiteboard_export_import_jobs').columns(['user_id', 'status']).execute();
  await db.schema.createIndex('idx_export_import_jobs_whiteboard_type').on('whiteboard_export_import_jobs').columns(['whiteboard_id', 'job_type']).execute();
  await db.schema.createIndex('idx_batch_items_batch_status').on('whiteboard_batch_items').columns(['batch_id', 'status']).execute();
  await db.schema.createIndex('idx_file_uploads_user_processed').on('whiteboard_file_uploads').columns(['user_id', 'is_processed']).execute();

  // Add foreign key constraints
  await db.schema.alterTable('whiteboard_batch_items').addForeignKeyConstraint('fk_batch_items_whiteboard', ['whiteboard_id'], 'whiteboards', ['id']).onDelete('cascade').execute();
  await db.schema.alterTable('whiteboard_batch_items').addForeignKeyConstraint('fk_batch_items_job', ['job_id'], 'whiteboard_export_import_jobs', ['id']).onDelete('set null').execute();

  console.log('✅ Export/import jobs migration completed');
}

export async function down(db: Kysely<any>): Promise<void> {
  // Drop tables in reverse order due to foreign key constraints
  await db.schema.dropTable('whiteboard_template_transfers').execute();
  await db.schema.dropTable('whiteboard_batch_items').execute();
  await db.schema.dropTable('whiteboard_batch_operations').execute();
  await db.schema.dropTable('whiteboard_file_uploads').execute();
  await db.schema.dropTable('whiteboard_export_import_jobs').execute();
  
  console.log('✅ Export/import jobs migration rolled back');
}