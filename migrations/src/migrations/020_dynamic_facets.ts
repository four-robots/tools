import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // Create facet_definitions table for core facet definitions
  await db.schema
    .createTable('facet_definitions')
    .addColumn('id', 'uuid', (col) => 
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn('facet_name', 'varchar(200)', (col) => col.notNull())
    .addColumn('facet_type', 'varchar(50)', (col) => col.notNull()) // categorical, range, hierarchical, date
    .addColumn('data_type', 'varchar(50)', (col) => col.notNull()) // string, number, date, boolean
    .addColumn('source_field', 'varchar(200)', (col) => col.notNull()) // field path in search results
    .addColumn('display_name', 'varchar(200)', (col) => col.notNull())
    .addColumn('description', 'text')
    .addColumn('is_active', 'boolean', (col) => col.defaultTo(true))
    .addColumn('sort_order', 'integer', (col) => col.defaultTo(0))
    .addColumn('parent_facet_id', 'uuid', (col) => 
      col.references('facet_definitions.id').onDelete('cascade')
    )
    .addColumn('configuration', 'jsonb', (col) => col.defaultTo(sql`'{}'`)) // facet-specific config
    .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamp', (col) => col.defaultTo(sql`now()`))
    .execute();

  // Create discovered facet values from content analysis
  await db.schema
    .createTable('facet_values')
    .addColumn('id', 'uuid', (col) => 
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn('facet_id', 'uuid', (col) => 
      col.references('facet_definitions.id').onDelete('cascade').notNull()
    )
    .addColumn('value_key', 'varchar(500)', (col) => col.notNull()) // the actual value
    .addColumn('display_value', 'varchar(500)', (col) => col.notNull()) // human-readable display
    .addColumn('value_count', 'integer', (col) => col.defaultTo(0))
    .addColumn('relative_frequency', 'decimal(5,4)', (col) => col.defaultTo(0)) // percentage of total
    .addColumn('parent_value_id', 'uuid', (col) => 
      col.references('facet_values.id').onDelete('cascade')
    )
    .addColumn('metadata', 'jsonb', (col) => col.defaultTo(sql`'{}'`))
    .addColumn('last_seen_at', 'timestamp', (col) => col.defaultTo(sql`now()`))
    .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`now()`))
    .execute();

  // Create range facet configurations
  await db.schema
    .createTable('facet_ranges')
    .addColumn('id', 'uuid', (col) => 
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn('facet_id', 'uuid', (col) => 
      col.references('facet_definitions.id').onDelete('cascade').notNull()
    )
    .addColumn('range_min', 'decimal')
    .addColumn('range_max', 'decimal')
    .addColumn('bucket_size', 'decimal')
    .addColumn('bucket_count', 'integer')
    .addColumn('optimal_ranges', 'jsonb') // auto-calculated optimal ranges
    .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`now()`))
    .execute();

  // Create real-time facet statistics
  await db.schema
    .createTable('facet_statistics')
    .addColumn('id', 'uuid', (col) => 
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn('facet_id', 'uuid', (col) => 
      col.references('facet_definitions.id').onDelete('cascade').notNull()
    )
    .addColumn('total_results', 'integer', (col) => col.defaultTo(0))
    .addColumn('unique_values', 'integer', (col) => col.defaultTo(0))
    .addColumn('null_count', 'integer', (col) => col.defaultTo(0))
    .addColumn('statistics_date', 'date', (col) => col.defaultTo(sql`current_date`))
    .addColumn('hourly_stats', 'jsonb', (col) => col.defaultTo(sql`'{}'`)) // stats by hour
    .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`now()`))
    .execute();

  // Create user facet preferences and customizations
  await db.schema
    .createTable('user_facet_preferences')
    .addColumn('id', 'uuid', (col) => 
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn('user_id', 'uuid', (col) => col.notNull())
    .addColumn('facet_id', 'uuid', (col) => 
      col.references('facet_definitions.id').onDelete('cascade').notNull()
    )
    .addColumn('is_visible', 'boolean', (col) => col.defaultTo(true))
    .addColumn('sort_order', 'integer', (col) => col.defaultTo(0))
    .addColumn('default_expanded', 'boolean', (col) => col.defaultTo(false))
    .addColumn('custom_display_name', 'varchar(200)')
    .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`now()`))
    .execute();

  // Create facet usage analytics table
  await db.schema
    .createTable('facet_usage_analytics')
    .addColumn('id', 'uuid', (col) => 
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn('facet_id', 'uuid', (col) => 
      col.references('facet_definitions.id').onDelete('cascade').notNull()
    )
    .addColumn('user_id', 'uuid')
    .addColumn('usage_type', 'varchar(50)', (col) => col.notNull()) // filter_applied, facet_expanded, value_selected
    .addColumn('selected_values', 'jsonb', (col) => col.defaultTo(sql`'[]'`))
    .addColumn('results_count', 'integer', (col) => col.defaultTo(0))
    .addColumn('session_id', 'varchar(255)')
    .addColumn('search_query', 'text')
    .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`now()`))
    .execute();

  // Create facet performance metrics table
  await db.schema
    .createTable('facet_performance_metrics')
    .addColumn('id', 'uuid', (col) => 
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn('facet_id', 'uuid', (col) => 
      col.references('facet_definitions.id').onDelete('cascade').notNull()
    )
    .addColumn('operation_type', 'varchar(50)', (col) => col.notNull()) // discovery, filtering, statistics
    .addColumn('processing_time_ms', 'integer', (col) => col.notNull())
    .addColumn('data_size', 'integer', (col) => col.defaultTo(0)) // number of results processed
    .addColumn('cache_hit', 'boolean', (col) => col.defaultTo(false))
    .addColumn('error_occurred', 'boolean', (col) => col.defaultTo(false))
    .addColumn('error_message', 'text')
    .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`now()`))
    .execute();

  // Performance indexes for facet_definitions
  await db.schema
    .createIndex('idx_facet_definitions_type')
    .on('facet_definitions')
    .column('facet_type')
    .execute();

  await db.schema
    .createIndex('idx_facet_definitions_active')
    .on('facet_definitions')
    .column('is_active')
    .execute();

  await db.schema
    .createIndex('idx_facet_definitions_name')
    .on('facet_definitions')
    .column('facet_name')
    .execute();

  await db.schema
    .createIndex('idx_facet_definitions_source_field')
    .on('facet_definitions')
    .column('source_field')
    .execute();

  await db.schema
    .createIndex('idx_facet_definitions_sort_order')
    .on('facet_definitions')
    .column('sort_order')
    .execute();

  // Performance indexes for facet_values
  await db.schema
    .createIndex('idx_facet_values_facet_id')
    .on('facet_values')
    .column('facet_id')
    .execute();

  await db.schema
    .createIndex('idx_facet_values_count_desc')
    .on('facet_values')
    .columns(['facet_id', 'value_count'])
    .execute();

  await db.schema
    .createIndex('idx_facet_values_frequency_desc')
    .on('facet_values')
    .column('relative_frequency')
    .execute();

  await db.schema
    .createIndex('idx_facet_values_key')
    .on('facet_values')
    .columns(['facet_id', 'value_key'])
    .execute();

  await db.schema
    .createIndex('idx_facet_values_parent')
    .on('facet_values')
    .column('parent_value_id')
    .execute();

  // Performance indexes for facet_ranges
  await db.schema
    .createIndex('idx_facet_ranges_facet_id')
    .on('facet_ranges')
    .column('facet_id')
    .execute();

  // Performance indexes for facet_statistics
  await db.schema
    .createIndex('idx_facet_statistics_facet_id')
    .on('facet_statistics')
    .column('facet_id')
    .execute();

  await db.schema
    .createIndex('idx_facet_statistics_date')
    .on('facet_statistics')
    .column('statistics_date')
    .execute();

  await db.schema
    .createIndex('idx_facet_statistics_facet_date')
    .on('facet_statistics')
    .columns(['facet_id', 'statistics_date'])
    .execute();

  // Performance indexes for user_facet_preferences
  await db.schema
    .createIndex('idx_user_facet_preferences_user')
    .on('user_facet_preferences')
    .column('user_id')
    .execute();

  await db.schema
    .createIndex('idx_user_facet_preferences_unique')
    .on('user_facet_preferences')
    .columns(['user_id', 'facet_id'])
    .unique()
    .execute();

  await db.schema
    .createIndex('idx_user_facet_preferences_visible')
    .on('user_facet_preferences')
    .columns(['user_id', 'is_visible'])
    .execute();

  // Performance indexes for facet_usage_analytics
  await db.schema
    .createIndex('idx_facet_usage_analytics_facet_id')
    .on('facet_usage_analytics')
    .column('facet_id')
    .execute();

  await db.schema
    .createIndex('idx_facet_usage_analytics_user_id')
    .on('facet_usage_analytics')
    .column('user_id')
    .execute();

  await db.schema
    .createIndex('idx_facet_usage_analytics_type')
    .on('facet_usage_analytics')
    .column('usage_type')
    .execute();

  await db.schema
    .createIndex('idx_facet_usage_analytics_created_at')
    .on('facet_usage_analytics')
    .column('created_at')
    .execute();

  await db.schema
    .createIndex('idx_facet_usage_analytics_session')
    .on('facet_usage_analytics')
    .column('session_id')
    .execute();

  // Performance indexes for facet_performance_metrics
  await db.schema
    .createIndex('idx_facet_performance_metrics_facet_id')
    .on('facet_performance_metrics')
    .column('facet_id')
    .execute();

  await db.schema
    .createIndex('idx_facet_performance_metrics_operation')
    .on('facet_performance_metrics')
    .column('operation_type')
    .execute();

  await db.schema
    .createIndex('idx_facet_performance_metrics_time')
    .on('facet_performance_metrics')
    .column('processing_time_ms')
    .execute();

  await db.schema
    .createIndex('idx_facet_performance_metrics_created_at')
    .on('facet_performance_metrics')
    .column('created_at')
    .execute();

  // Create partial index for active facets only (more efficient)
  await db.schema
    .createIndex('idx_facet_definitions_active_sorted')
    .on('facet_definitions')
    .columns(['is_active', 'sort_order', 'facet_name'])
    .where('is_active', '=', true)
    .execute();

  // Create composite index for frequent value lookups
  await db.schema
    .createIndex('idx_facet_values_lookup')
    .on('facet_values')
    .columns(['facet_id', 'value_key', 'value_count'])
    .execute();

  console.log('✅ Dynamic Facets migration completed successfully');
}

export async function down(db: Kysely<any>): Promise<void> {
  // Drop indexes first (in reverse order)
  await db.schema.dropIndex('idx_facet_values_lookup').ifExists().execute();
  await db.schema.dropIndex('idx_facet_definitions_active_sorted').ifExists().execute();
  
  await db.schema.dropIndex('idx_facet_performance_metrics_created_at').ifExists().execute();
  await db.schema.dropIndex('idx_facet_performance_metrics_time').ifExists().execute();
  await db.schema.dropIndex('idx_facet_performance_metrics_operation').ifExists().execute();
  await db.schema.dropIndex('idx_facet_performance_metrics_facet_id').ifExists().execute();
  
  await db.schema.dropIndex('idx_facet_usage_analytics_session').ifExists().execute();
  await db.schema.dropIndex('idx_facet_usage_analytics_created_at').ifExists().execute();
  await db.schema.dropIndex('idx_facet_usage_analytics_type').ifExists().execute();
  await db.schema.dropIndex('idx_facet_usage_analytics_user_id').ifExists().execute();
  await db.schema.dropIndex('idx_facet_usage_analytics_facet_id').ifExists().execute();
  
  await db.schema.dropIndex('idx_user_facet_preferences_visible').ifExists().execute();
  await db.schema.dropIndex('idx_user_facet_preferences_unique').ifExists().execute();
  await db.schema.dropIndex('idx_user_facet_preferences_user').ifExists().execute();
  
  await db.schema.dropIndex('idx_facet_statistics_facet_date').ifExists().execute();
  await db.schema.dropIndex('idx_facet_statistics_date').ifExists().execute();
  await db.schema.dropIndex('idx_facet_statistics_facet_id').ifExists().execute();
  
  await db.schema.dropIndex('idx_facet_ranges_facet_id').ifExists().execute();
  
  await db.schema.dropIndex('idx_facet_values_parent').ifExists().execute();
  await db.schema.dropIndex('idx_facet_values_key').ifExists().execute();
  await db.schema.dropIndex('idx_facet_values_frequency_desc').ifExists().execute();
  await db.schema.dropIndex('idx_facet_values_count_desc').ifExists().execute();
  await db.schema.dropIndex('idx_facet_values_facet_id').ifExists().execute();
  
  await db.schema.dropIndex('idx_facet_definitions_sort_order').ifExists().execute();
  await db.schema.dropIndex('idx_facet_definitions_source_field').ifExists().execute();
  await db.schema.dropIndex('idx_facet_definitions_name').ifExists().execute();
  await db.schema.dropIndex('idx_facet_definitions_active').ifExists().execute();
  await db.schema.dropIndex('idx_facet_definitions_type').ifExists().execute();

  // Drop tables in reverse dependency order
  await db.schema.dropTable('facet_performance_metrics').ifExists().execute();
  await db.schema.dropTable('facet_usage_analytics').ifExists().execute();
  await db.schema.dropTable('user_facet_preferences').ifExists().execute();
  await db.schema.dropTable('facet_statistics').ifExists().execute();
  await db.schema.dropTable('facet_ranges').ifExists().execute();
  await db.schema.dropTable('facet_values').ifExists().execute();
  await db.schema.dropTable('facet_definitions').ifExists().execute();
  
  console.log('✅ Dynamic Facets migration rollback completed');
}