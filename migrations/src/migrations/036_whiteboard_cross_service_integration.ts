import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // Resource attachment tracking table - enables linking whiteboard elements to external services
  await db.schema
    .createTable('whiteboard_resource_attachments')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('whiteboard_id', 'uuid', (col) => col.notNull().references('whiteboards.id').onDelete('cascade'))
    .addColumn('element_id', 'uuid', (col) => col.notNull()) // References whiteboard_elements.id
    .addColumn('resource_type', 'varchar(50)', (col) => col.notNull()) // 'kanban_card', 'wiki_page', 'memory_node'
    .addColumn('resource_id', 'uuid', (col) => col.notNull()) // ID in the external service
    .addColumn('resource_metadata', 'jsonb', (col) => col.notNull().defaultTo('{}')) // Cached resource data
    .addColumn('attachment_metadata', 'jsonb', (col) => col.notNull().defaultTo('{}')) // Whiteboard-specific attachment data
    .addColumn('sync_status', 'varchar(20)', (col) => col.notNull().defaultTo('active')) // 'active', 'broken', 'outdated'
    .addColumn('last_sync_at', 'timestamptz', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn('created_at', 'timestamptz', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
    .addColumn('updated_at', 'timestamptz', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
    .execute();

  // Search result caching table - performance optimization for cross-service search
  await db.schema
    .createTable('whiteboard_search_cache')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('whiteboard_id', 'uuid', (col) => col.notNull().references('whiteboards.id').onDelete('cascade'))
    .addColumn('search_query', 'text', (col) => col.notNull())
    .addColumn('search_filters', 'jsonb', (col) => col.notNull().defaultTo('{}')) // Service filters, date ranges, etc.
    .addColumn('search_results', 'jsonb', (col) => col.notNull())) // Cached results from all services
    .addColumn('result_count', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('services_searched', 'text[]', (col) => col.notNull().defaultTo(sql`ARRAY[]::text[]`)) // ['kanban', 'wiki', 'memory']
    .addColumn('search_timestamp', 'timestamptz', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
    .addColumn('expires_at', 'timestamptz', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP + INTERVAL '1 hour'`).notNull())
    .execute();

  // Integration event log - tracks cross-service interactions for debugging and analytics
  await db.schema
    .createTable('whiteboard_integration_events')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('whiteboard_id', 'uuid', (col) => col.notNull().references('whiteboards.id').onDelete('cascade'))
    .addColumn('user_id', 'uuid', (col) => col.notNull())
    .addColumn('event_type', 'varchar(100)', (col) => col.notNull()) // 'search', 'attach', 'sync', 'create_from_whiteboard'
    .addColumn('service_type', 'varchar(50)', (col) => col.notNull()) // 'kanban', 'wiki', 'memory'
    .addColumn('resource_id', 'uuid', (col) => col.notNull())
    .addColumn('element_id', 'uuid') // Optional: associated whiteboard element
    .addColumn('event_data', 'jsonb', (col) => col.notNull().defaultTo('{}')) // Detailed event information
    .addColumn('success', 'boolean', (col) => col.notNull().defaultTo(true))
    .addColumn('error_message', 'text') // For failed operations
    .addColumn('processing_time_ms', 'integer') // Performance tracking
    .addColumn('created_at', 'timestamptz', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
    .execute();

  // Extended whiteboard element types for cross-service elements
  await db.schema
    .alterTable('whiteboard_elements')
    .addColumn('integration_type', 'varchar(50)') // 'kanban_card', 'wiki_page', 'memory_node', null for regular elements
    .addColumn('integration_data', 'jsonb', (col) => col.defaultTo('{}')) // Integration-specific data
    .addColumn('sync_enabled', 'boolean', (col) => col.defaultTo(true)) // Whether to sync changes with source
    .execute();

  // Performance indexes for resource attachments
  await db.schema.createIndex('idx_whiteboard_resource_attachments_whiteboard_id')
    .on('whiteboard_resource_attachments').column('whiteboard_id').execute();
  
  await db.schema.createIndex('idx_whiteboard_resource_attachments_element_id')
    .on('whiteboard_resource_attachments').column('element_id').execute();
  
  await db.schema.createIndex('idx_whiteboard_resource_attachments_resource')
    .on('whiteboard_resource_attachments').columns(['resource_type', 'resource_id']).execute();
  
  await db.schema.createIndex('idx_whiteboard_resource_attachments_sync_status')
    .on('whiteboard_resource_attachments').column('sync_status').execute();

  // Performance indexes for search cache
  await db.schema.createIndex('idx_whiteboard_search_cache_whiteboard_id')
    .on('whiteboard_search_cache').column('whiteboard_id').execute();
    
  await db.schema.createIndex('idx_whiteboard_search_cache_query')
    .on('whiteboard_search_cache').column('search_query').execute();
    
  await db.schema.createIndex('idx_whiteboard_search_cache_expires_at')
    .on('whiteboard_search_cache').column('expires_at').execute();

  // Performance indexes for integration events
  await db.schema.createIndex('idx_whiteboard_integration_events_whiteboard_id')
    .on('whiteboard_integration_events').column('whiteboard_id').execute();
    
  await db.schema.createIndex('idx_whiteboard_integration_events_service_type')
    .on('whiteboard_integration_events').column('service_type').execute();
    
  await db.schema.createIndex('idx_whiteboard_integration_events_resource_id')
    .on('whiteboard_integration_events').column('resource_id').execute();
    
  await db.schema.createIndex('idx_whiteboard_integration_events_created_at')
    .on('whiteboard_integration_events').column('created_at').execute();

  // Performance indexes for extended element data
  await db.schema.createIndex('idx_whiteboard_elements_integration_type')
    .on('whiteboard_elements').column('integration_type').execute();

  // Composite indexes for common query patterns
  await db.schema.createIndex('idx_whiteboard_resource_attachments_whiteboard_type')
    .on('whiteboard_resource_attachments').columns(['whiteboard_id', 'resource_type']).execute();
    
  await db.schema.createIndex('idx_whiteboard_integration_events_whiteboard_service')
    .on('whiteboard_integration_events').columns(['whiteboard_id', 'service_type']).execute();
    
  await db.schema.createIndex('idx_whiteboard_elements_whiteboard_integration')
    .on('whiteboard_elements').columns(['whiteboard_id', 'integration_type']).execute();

  // Add foreign key constraint from resource_attachments to whiteboard_elements
  await db.schema.alterTable('whiteboard_resource_attachments')
    .addForeignKeyConstraint('fk_whiteboard_resource_attachments_element', ['whiteboard_id', 'element_id'], 'whiteboard_elements', ['whiteboard_id', 'id'])
    .onDelete('cascade')
    .execute();

  // Create an auto-cleanup job for expired search cache (PostgreSQL-specific)
  await db.schema.raw(`
    -- Create a function to clean up expired search cache entries
    CREATE OR REPLACE FUNCTION cleanup_expired_search_cache() 
    RETURNS void 
    LANGUAGE sql 
    AS $$
      DELETE FROM whiteboard_search_cache 
      WHERE expires_at < CURRENT_TIMESTAMP;
    $$;
  `).execute();

  console.log('✅ Whiteboard cross-service integration migration completed');
}

export async function down(db: Kysely<any>): Promise<void> {
  // Drop the cleanup function
  await db.schema.raw('DROP FUNCTION IF EXISTS cleanup_expired_search_cache()').execute();

  // Remove foreign key constraints first
  await db.schema.alterTable('whiteboard_resource_attachments')
    .dropConstraint('fk_whiteboard_resource_attachments_element').execute();

  // Remove added columns from whiteboard_elements
  await db.schema.alterTable('whiteboard_elements')
    .dropColumn('integration_type')
    .dropColumn('integration_data')
    .dropColumn('sync_enabled')
    .execute();

  // Drop tables in reverse order
  await db.schema.dropTable('whiteboard_integration_events').execute();
  await db.schema.dropTable('whiteboard_search_cache').execute();
  await db.schema.dropTable('whiteboard_resource_attachments').execute();
  
  console.log('✅ Whiteboard cross-service integration migration rolled back');
}