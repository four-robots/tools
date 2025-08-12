import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  console.log('🔍 Starting whiteboard search migration...');

  // Add full-text search vector columns to whiteboards table
  await db.schema
    .alterTable('whiteboards')
    .addColumn('search_vector', 'tsvector')
    .execute();

  // Add full-text search vector columns to whiteboard_elements table
  await db.schema
    .alterTable('whiteboard_elements')
    .addColumn('search_vector', 'tsvector')
    .execute();

  // Add full-text search vector columns to whiteboard_comments table
  await db.schema
    .alterTable('whiteboard_comments')
    .addColumn('search_vector', 'tsvector')
    .execute();

  // Add full-text search vector columns to whiteboard_templates table
  await db.schema
    .alterTable('whiteboard_templates')
    .addColumn('search_vector', 'tsvector')
    .execute();

  // Create search analytics table for performance monitoring
  await db.schema
    .createTable('whiteboard_search_analytics')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('workspace_id', 'uuid', (col) => col.notNull().references('collaborative_workspaces.id').onDelete('cascade'))
    .addColumn('user_id', 'uuid', (col) => col.notNull())
    .addColumn('search_query', 'text', (col) => col.notNull())
    .addColumn('search_type', 'varchar(50)', (col) => col.notNull().check(
      sql`search_type IN ('full_text', 'advanced', 'unified', 'element', 'comment')`
    ))
    .addColumn('syntax_type', 'varchar(20)', (col) => col.notNull().defaultTo('natural').check(
      sql`syntax_type IN ('natural', 'boolean', 'field_specific', 'regex')`
    ))
    .addColumn('filters_applied', 'jsonb', (col) => col.defaultTo('{}').check(
      sql`jsonb_typeof(filters_applied) = 'object'`
    ))
    .addColumn('results_count', 'integer', (col) => col.notNull().defaultTo(0).check(
      sql`results_count >= 0`
    ))
    .addColumn('execution_time_ms', 'integer', (col) => col.notNull().defaultTo(0).check(
      sql`execution_time_ms >= 0`
    ))
    .addColumn('was_successful', 'boolean', (col) => col.notNull().defaultTo(true))
    .addColumn('error_message', 'text')
    .addColumn('client_metadata', 'jsonb', (col) => col.defaultTo('{}').check(
      sql`jsonb_typeof(client_metadata) = 'object'`
    ))
    .addColumn('created_at', 'timestamptz', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
    .execute();

  // Create search suggestions table for auto-complete
  await db.schema
    .createTable('whiteboard_search_suggestions')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('workspace_id', 'uuid', (col) => col.notNull().references('collaborative_workspaces.id').onDelete('cascade'))
    .addColumn('suggestion_text', 'varchar(255)', (col) => col.notNull())
    .addColumn('suggestion_type', 'varchar(20)', (col) => col.notNull().check(
      sql`suggestion_type IN ('query', 'filter', 'tag', 'user', 'template')`
    ))
    .addColumn('usage_count', 'integer', (col) => col.notNull().defaultTo(1).check(
      sql`usage_count >= 1`
    ))
    .addColumn('relevance_score', 'decimal(3,2)', (col) => col.notNull().defaultTo(0).check(
      sql`relevance_score >= 0 AND relevance_score <= 1`
    ))
    .addColumn('metadata', 'jsonb', (col) => col.defaultTo('{}').check(
      sql`jsonb_typeof(metadata) = 'object'`
    ))
    .addColumn('is_active', 'boolean', (col) => col.notNull().defaultTo(true))
    .addColumn('last_used_at', 'timestamptz', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
    .addColumn('created_at', 'timestamptz', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
    .addColumn('updated_at', 'timestamptz', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
    .execute();

  // Create saved searches table for user convenience
  await db.schema
    .createTable('whiteboard_saved_searches')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('workspace_id', 'uuid', (col) => col.notNull().references('collaborative_workspaces.id').onDelete('cascade'))
    .addColumn('user_id', 'uuid', (col) => col.notNull())
    .addColumn('name', 'varchar(255)', (col) => col.notNull())
    .addColumn('description', 'text')
    .addColumn('search_query', 'text', (col) => col.notNull())
    .addColumn('search_filters', 'jsonb', (col) => col.notNull().check(
      sql`jsonb_typeof(search_filters) = 'object'`
    ))
    .addColumn('sort_config', 'jsonb', (col) => col.defaultTo('{}').check(
      sql`jsonb_typeof(sort_config) = 'object'`
    ))
    .addColumn('is_public', 'boolean', (col) => col.notNull().defaultTo(false))
    .addColumn('is_alert', 'boolean', (col) => col.notNull().defaultTo(false)) // For search alerts/notifications
    .addColumn('alert_frequency', 'varchar(20)', (col) => col.check(
      sql`alert_frequency IS NULL OR alert_frequency IN ('immediate', 'daily', 'weekly')`
    ))
    .addColumn('last_executed_at', 'timestamptz')
    .addColumn('usage_count', 'integer', (col) => col.notNull().defaultTo(0).check(
      sql`usage_count >= 0`
    ))
    .addColumn('created_at', 'timestamptz', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
    .addColumn('updated_at', 'timestamptz', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
    .execute();

  // Create search history table for user query tracking
  await db.schema
    .createTable('whiteboard_search_history')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('user_id', 'uuid', (col) => col.notNull())
    .addColumn('workspace_id', 'uuid', (col) => col.notNull().references('collaborative_workspaces.id').onDelete('cascade'))
    .addColumn('search_query', 'text', (col) => col.notNull())
    .addColumn('search_type', 'varchar(50)', (col) => col.notNull())
    .addColumn('results_count', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('clicked_result_id', 'uuid') // Track which result was clicked
    .addColumn('session_id', 'uuid') // Group related searches
    .addColumn('created_at', 'timestamptz', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
    .execute();

  console.log('📄 Creating search indexes...');

  // Create GIN indexes for full-text search vectors
  await sql`CREATE INDEX idx_whiteboards_search_vector ON whiteboards USING GIN(search_vector)`.execute(db);
  await sql`CREATE INDEX idx_whiteboard_elements_search_vector ON whiteboard_elements USING GIN(search_vector)`.execute(db);
  await sql`CREATE INDEX idx_whiteboard_comments_search_vector ON whiteboard_comments USING GIN(search_vector)`.execute(db);
  await sql`CREATE INDEX idx_whiteboard_templates_search_vector ON whiteboard_templates USING GIN(search_vector)`.execute(db);

  // Create trigram indexes for fuzzy search
  await sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`.execute(db);
  await sql`CREATE INDEX idx_whiteboards_name_trgm ON whiteboards USING GIN(name gin_trgm_ops)`.execute(db);
  await sql`CREATE INDEX idx_whiteboards_description_trgm ON whiteboards USING GIN(description gin_trgm_ops)`.execute(db);
  await sql`CREATE INDEX idx_whiteboard_templates_name_trgm ON whiteboard_templates USING GIN(name gin_trgm_ops)`.execute(db);

  // Create indexes for search analytics
  await db.schema.createIndex('idx_search_analytics_workspace_id').on('whiteboard_search_analytics').column('workspace_id').execute();
  await db.schema.createIndex('idx_search_analytics_user_id').on('whiteboard_search_analytics').column('user_id').execute();
  await db.schema.createIndex('idx_search_analytics_search_type').on('whiteboard_search_analytics').column('search_type').execute();
  await db.schema.createIndex('idx_search_analytics_created_at').on('whiteboard_search_analytics').column('created_at').execute();
  await db.schema.createIndex('idx_search_analytics_execution_time').on('whiteboard_search_analytics').column('execution_time_ms').execute();
  await db.schema.createIndex('idx_search_analytics_results_count').on('whiteboard_search_analytics').column('results_count').execute();

  // Create indexes for search suggestions
  await db.schema.createIndex('idx_search_suggestions_workspace_id').on('whiteboard_search_suggestions').column('workspace_id').execute();
  await db.schema.createIndex('idx_search_suggestions_type').on('whiteboard_search_suggestions').column('suggestion_type').execute();
  await db.schema.createIndex('idx_search_suggestions_usage').on('whiteboard_search_suggestions').column('usage_count').execute();
  await db.schema.createIndex('idx_search_suggestions_score').on('whiteboard_search_suggestions').column('relevance_score').execute();
  await db.schema.createIndex('idx_search_suggestions_active').on('whiteboard_search_suggestions').column('is_active').execute();
  await sql`CREATE INDEX idx_search_suggestions_text_trgm ON whiteboard_search_suggestions USING GIN(suggestion_text gin_trgm_ops)`.execute(db);

  // Create indexes for saved searches
  await db.schema.createIndex('idx_saved_searches_workspace_id').on('whiteboard_saved_searches').column('workspace_id').execute();
  await db.schema.createIndex('idx_saved_searches_user_id').on('whiteboard_saved_searches').column('user_id').execute();
  await db.schema.createIndex('idx_saved_searches_public').on('whiteboard_saved_searches').column('is_public').execute();
  await db.schema.createIndex('idx_saved_searches_alert').on('whiteboard_saved_searches').column('is_alert').execute();
  await db.schema.createIndex('idx_saved_searches_usage').on('whiteboard_saved_searches').column('usage_count').execute();

  // Create indexes for search history
  await db.schema.createIndex('idx_search_history_user_id').on('whiteboard_search_history').column('user_id').execute();
  await db.schema.createIndex('idx_search_history_workspace_id').on('whiteboard_search_history').column('workspace_id').execute();
  await db.schema.createIndex('idx_search_history_session_id').on('whiteboard_search_history').column('session_id').execute();
  await db.schema.createIndex('idx_search_history_created_at').on('whiteboard_search_history').column('created_at').execute();

  // Create composite indexes for common queries
  await db.schema.createIndex('idx_search_analytics_workspace_user').on('whiteboard_search_analytics').columns(['workspace_id', 'user_id']).execute();
  await db.schema.createIndex('idx_search_suggestions_workspace_type').on('whiteboard_search_suggestions').columns(['workspace_id', 'suggestion_type']).execute();
  await db.schema.createIndex('idx_saved_searches_workspace_user').on('whiteboard_saved_searches').columns(['workspace_id', 'user_id']).execute();
  await db.schema.createIndex('idx_search_history_user_workspace').on('whiteboard_search_history').columns(['user_id', 'workspace_id']).execute();

  console.log('🔧 Creating search vector update functions and triggers...');

  // Create function to update whiteboard search vectors
  await sql`
    CREATE OR REPLACE FUNCTION update_whiteboard_search_vector()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.search_vector := 
        setweight(to_tsvector('english', COALESCE(NEW.name, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(NEW.description, '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(NEW.settings::text, '')), 'C') ||
        setweight(to_tsvector('english', COALESCE(NEW.canvas_data::text, '')), 'D');
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `.execute(db);

  // Create function to update element search vectors
  await sql`
    CREATE OR REPLACE FUNCTION update_element_search_vector()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.search_vector := 
        setweight(to_tsvector('english', COALESCE(NEW.element_data->>'text', '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(NEW.element_data->>'title', '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(NEW.element_data->>'content', '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(NEW.element_type, '')), 'C') ||
        setweight(to_tsvector('english', COALESCE(NEW.metadata::text, '')), 'D');
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `.execute(db);

  // Create function to update comment search vectors
  await sql`
    CREATE OR REPLACE FUNCTION update_comment_search_vector()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.search_vector := 
        setweight(to_tsvector('english', COALESCE(NEW.content, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(array_to_string(NEW.tags, ' '), '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(NEW.metadata::text, '')), 'C');
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `.execute(db);

  // Create function to update template search vectors
  await sql`
    CREATE OR REPLACE FUNCTION update_template_search_vector()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.search_vector := 
        setweight(to_tsvector('english', COALESCE(NEW.name, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(NEW.description, '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(NEW.category, '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(array_to_string(NEW.tags, ' '), '')), 'C') ||
        setweight(to_tsvector('english', COALESCE(NEW.template_data::text, '')), 'D');
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `.execute(db);

  // Create triggers for automatic search vector updates
  await sql`CREATE TRIGGER trig_whiteboards_search_vector 
    BEFORE INSERT OR UPDATE ON whiteboards 
    FOR EACH ROW EXECUTE FUNCTION update_whiteboard_search_vector()`.execute(db);

  await sql`CREATE TRIGGER trig_elements_search_vector 
    BEFORE INSERT OR UPDATE ON whiteboard_elements 
    FOR EACH ROW EXECUTE FUNCTION update_element_search_vector()`.execute(db);

  await sql`CREATE TRIGGER trig_comments_search_vector 
    BEFORE INSERT OR UPDATE ON whiteboard_comments 
    FOR EACH ROW EXECUTE FUNCTION update_comment_search_vector()`.execute(db);

  await sql`CREATE TRIGGER trig_templates_search_vector 
    BEFORE INSERT OR UPDATE ON whiteboard_templates 
    FOR EACH ROW EXECUTE FUNCTION update_template_search_vector()`.execute(db);

  console.log('📊 Updating existing data with search vectors...');

  // Update existing whiteboards with search vectors
  await sql`
    UPDATE whiteboards 
    SET search_vector = 
      setweight(to_tsvector('english', COALESCE(name, '')), 'A') ||
      setweight(to_tsvector('english', COALESCE(description, '')), 'B') ||
      setweight(to_tsvector('english', COALESCE(settings::text, '')), 'C') ||
      setweight(to_tsvector('english', COALESCE(canvas_data::text, '')), 'D')
    WHERE search_vector IS NULL
  `.execute(db);

  // Update existing elements with search vectors
  await sql`
    UPDATE whiteboard_elements 
    SET search_vector = 
      setweight(to_tsvector('english', COALESCE(element_data->>'text', '')), 'A') ||
      setweight(to_tsvector('english', COALESCE(element_data->>'title', '')), 'A') ||
      setweight(to_tsvector('english', COALESCE(element_data->>'content', '')), 'B') ||
      setweight(to_tsvector('english', COALESCE(element_type, '')), 'C') ||
      setweight(to_tsvector('english', COALESCE(metadata::text, '')), 'D')
    WHERE search_vector IS NULL
  `.execute(db);

  // Update existing comments with search vectors
  await sql`
    UPDATE whiteboard_comments 
    SET search_vector = 
      setweight(to_tsvector('english', COALESCE(content, '')), 'A') ||
      setweight(to_tsvector('english', COALESCE(array_to_string(tags, ' '), '')), 'B') ||
      setweight(to_tsvector('english', COALESCE(metadata::text, '')), 'C')
    WHERE search_vector IS NULL
  `.execute(db);

  // Update existing templates with search vectors
  await sql`
    UPDATE whiteboard_templates 
    SET search_vector = 
      setweight(to_tsvector('english', COALESCE(name, '')), 'A') ||
      setweight(to_tsvector('english', COALESCE(description, '')), 'B') ||
      setweight(to_tsvector('english', COALESCE(category, '')), 'B') ||
      setweight(to_tsvector('english', COALESCE(array_to_string(tags, ' '), '')), 'C') ||
      setweight(to_tsvector('english', COALESCE(template_data::text, '')), 'D')
    WHERE search_vector IS NULL
  `.execute(db);

  // Create search performance optimization function
  await sql`
    CREATE OR REPLACE FUNCTION refresh_search_statistics()
    RETURNS void AS $$
    BEGIN
      -- Update search vector statistics for better query planning
      ANALYZE whiteboards;
      ANALYZE whiteboard_elements;
      ANALYZE whiteboard_comments;
      ANALYZE whiteboard_templates;
      
      -- Update trigram statistics
      ANALYZE whiteboard_search_suggestions;
    END;
    $$ LANGUAGE plpgsql;
  `.execute(db);

  // Create function to clean up old search analytics
  await sql`
    CREATE OR REPLACE FUNCTION cleanup_search_analytics(retention_days integer DEFAULT 90)
    RETURNS integer AS $$
    DECLARE
      deleted_count integer;
    BEGIN
      DELETE FROM whiteboard_search_analytics 
      WHERE created_at < CURRENT_TIMESTAMP - (retention_days || ' days')::interval;
      
      GET DIAGNOSTICS deleted_count = ROW_COUNT;
      
      DELETE FROM whiteboard_search_history 
      WHERE created_at < CURRENT_TIMESTAMP - (retention_days || ' days')::interval;
      
      RETURN deleted_count;
    END;
    $$ LANGUAGE plpgsql;
  `.execute(db);

  // Create materialized view for popular search terms
  await sql`
    CREATE MATERIALIZED VIEW popular_search_terms AS
    SELECT 
      workspace_id,
      search_query,
      COUNT(*) as usage_count,
      AVG(results_count) as avg_results,
      AVG(execution_time_ms) as avg_execution_time,
      MAX(created_at) as last_used
    FROM whiteboard_search_analytics
    WHERE was_successful = true
      AND created_at > CURRENT_TIMESTAMP - INTERVAL '30 days'
    GROUP BY workspace_id, search_query
    HAVING COUNT(*) >= 2
    ORDER BY usage_count DESC, avg_results DESC
  `.execute(db);

  // Create unique index on materialized view
  await sql`CREATE UNIQUE INDEX idx_popular_search_terms_unique ON popular_search_terms (workspace_id, search_query)`.execute(db);

  console.log('✅ Whiteboard search migration completed successfully');
}

export async function down(db: Kysely<any>): Promise<void> {
  console.log('🔄 Rolling back whiteboard search migration...');

  // Drop materialized view
  await sql`DROP MATERIALIZED VIEW IF EXISTS popular_search_terms`.execute(db);

  // Drop functions
  await sql`DROP FUNCTION IF EXISTS cleanup_search_analytics(integer)`.execute(db);
  await sql`DROP FUNCTION IF EXISTS refresh_search_statistics()`.execute(db);

  // Drop triggers
  await sql`DROP TRIGGER IF EXISTS trig_templates_search_vector ON whiteboard_templates`.execute(db);
  await sql`DROP TRIGGER IF EXISTS trig_comments_search_vector ON whiteboard_comments`.execute(db);
  await sql`DROP TRIGGER IF EXISTS trig_elements_search_vector ON whiteboard_elements`.execute(db);
  await sql`DROP TRIGGER IF EXISTS trig_whiteboards_search_vector ON whiteboards`.execute(db);

  // Drop trigger functions
  await sql`DROP FUNCTION IF EXISTS update_template_search_vector()`.execute(db);
  await sql`DROP FUNCTION IF EXISTS update_comment_search_vector()`.execute(db);
  await sql`DROP FUNCTION IF EXISTS update_element_search_vector()`.execute(db);
  await sql`DROP FUNCTION IF EXISTS update_whiteboard_search_vector()`.execute(db);

  // Drop search tables
  await db.schema.dropTable('whiteboard_search_history').execute();
  await db.schema.dropTable('whiteboard_saved_searches').execute();
  await db.schema.dropTable('whiteboard_search_suggestions').execute();
  await db.schema.dropTable('whiteboard_search_analytics').execute();

  // Drop search vector columns
  await db.schema.alterTable('whiteboard_templates').dropColumn('search_vector').execute();
  await db.schema.alterTable('whiteboard_comments').dropColumn('search_vector').execute();
  await db.schema.alterTable('whiteboard_elements').dropColumn('search_vector').execute();
  await db.schema.alterTable('whiteboards').dropColumn('search_vector').execute();

  console.log('✅ Whiteboard search migration rollback completed');
}