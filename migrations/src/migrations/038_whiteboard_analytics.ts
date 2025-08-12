import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // Whiteboard events table - real-time event tracking with structured data
  await db.schema
    .createTable('whiteboard_events')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('whiteboard_id', 'uuid', (col) => col.notNull().references('whiteboards.id').onDelete('cascade'))
    .addColumn('user_id', 'uuid', (col) => col.notNull())
    .addColumn('session_id', 'uuid') // Link to whiteboard_sessions
    .addColumn('event_type', 'varchar(100)', (col) => col.notNull()) // user_action, collaboration, performance, error
    .addColumn('action', 'varchar(100)', (col) => col.notNull()) // draw, comment, select, move, etc.
    .addColumn('target_type', 'varchar(50)', (col) => col.notNull()) // element, canvas, user, tool
    .addColumn('target_id', 'uuid') // ID of affected object
    .addColumn('event_data', 'jsonb', (col) => col.notNull().defaultTo('{}').check(
      sql`jsonb_typeof(event_data) = 'object'`
    )) // Structured event metadata with validation
    .addColumn('coordinates', 'jsonb', (col) => col.check(
      sql`coordinates IS NULL OR (jsonb_typeof(coordinates) = 'object' AND 
          coordinates ? 'x' AND coordinates ? 'y' AND
          jsonb_typeof(coordinates->'x') = 'number' AND
          jsonb_typeof(coordinates->'y') = 'number')`
    )) // Optional spatial coordinates
    .addColumn('duration_ms', 'integer') // Event duration for performance tracking
    .addColumn('client_timestamp', 'timestamptz', (col) => col.notNull()) // Client-side timestamp
    .addColumn('server_timestamp', 'timestamptz', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull()) // Server-side timestamp
    .addColumn('client_metadata', 'jsonb', (col) => col.defaultTo('{}').check(
      sql`jsonb_typeof(client_metadata) = 'object'`
    )) // Browser, device, version info
    .execute();

  // Whiteboard sessions table - comprehensive user session tracking
  await db.schema
    .createTable('whiteboard_session_analytics')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('session_id', 'uuid', (col) => col.notNull().references('whiteboard_sessions.id').onDelete('cascade'))
    .addColumn('whiteboard_id', 'uuid', (col) => col.notNull().references('whiteboards.id').onDelete('cascade'))
    .addColumn('user_id', 'uuid', (col) => col.notNull())
    .addColumn('session_start', 'timestamptz', (col) => col.notNull())
    .addColumn('session_end', 'timestamptz')
    .addColumn('duration_minutes', 'integer') // Calculated session duration
    .addColumn('total_actions', 'integer', (col) => col.defaultTo(0)) // Number of actions performed
    .addColumn('elements_created', 'integer', (col) => col.defaultTo(0))
    .addColumn('elements_modified', 'integer', (col) => col.defaultTo(0))
    .addColumn('elements_deleted', 'integer', (col) => col.defaultTo(0))
    .addColumn('comments_created', 'integer', (col) => col.defaultTo(0))
    .addColumn('tools_used', 'text[]', (col) => col.defaultTo(sql`ARRAY[]::text[]`)) // Array of tools used
    .addColumn('collaboration_score', 'decimal(5,2)', (col) => col.defaultTo(0)) // Collaboration engagement score
    .addColumn('activity_heatmap', 'jsonb', (col) => col.defaultTo('{}').check(
      sql`jsonb_typeof(activity_heatmap) = 'object'`
    )) // Spatial activity distribution
    .addColumn('performance_metrics', 'jsonb', (col) => col.defaultTo('{}').check(
      sql`jsonb_typeof(performance_metrics) = 'object'`
    )) // Latency, FPS, memory usage
    .addColumn('error_count', 'integer', (col) => col.defaultTo(0))
    .addColumn('disconnect_reason', 'varchar(100)') // Normal, error, timeout, etc.
    .addColumn('created_at', 'timestamptz', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
    .addColumn('updated_at', 'timestamptz', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
    .execute();

  // Whiteboard metrics table - aggregated performance and usage metrics
  await db.schema
    .createTable('whiteboard_metrics')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('whiteboard_id', 'uuid', (col) => col.notNull().references('whiteboards.id').onDelete('cascade'))
    .addColumn('metric_date', 'date', (col) => col.notNull()) // Daily aggregation
    .addColumn('total_sessions', 'integer', (col) => col.defaultTo(0))
    .addColumn('unique_users', 'integer', (col) => col.defaultTo(0))
    .addColumn('total_duration_minutes', 'integer', (col) => col.defaultTo(0))
    .addColumn('avg_session_duration', 'decimal(8,2)', (col) => col.defaultTo(0))
    .addColumn('total_actions', 'integer', (col) => col.defaultTo(0))
    .addColumn('elements_created', 'integer', (col) => col.defaultTo(0))
    .addColumn('elements_modified', 'integer', (col) => col.defaultTo(0))
    .addColumn('elements_deleted', 'integer', (col) => col.defaultTo(0))
    .addColumn('comments_created', 'integer', (col) => col.defaultTo(0))
    .addColumn('concurrent_users_peak', 'integer', (col) => col.defaultTo(0))
    .addColumn('collaboration_events', 'integer', (col) => col.defaultTo(0))
    .addColumn('conflict_resolutions', 'integer', (col) => col.defaultTo(0))
    .addColumn('template_applications', 'integer', (col) => col.defaultTo(0))
    .addColumn('performance_avg', 'jsonb', (col) => col.defaultTo('{}').check(
      sql`jsonb_typeof(performance_avg) = 'object'`
    )) // Average performance metrics
    .addColumn('error_rate', 'decimal(5,4)', (col) => col.defaultTo(0)) // Percentage
    .addColumn('tool_usage_stats', 'jsonb', (col) => col.defaultTo('{}').check(
      sql`jsonb_typeof(tool_usage_stats) = 'object'`
    )) // Usage stats by tool type
    .addColumn('activity_patterns', 'jsonb', (col) => col.defaultTo('{}').check(
      sql`jsonb_typeof(activity_patterns) = 'object'`
    )) // Time-based activity patterns
    .addColumn('created_at', 'timestamptz', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
    .addColumn('updated_at', 'timestamptz', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
    .execute();

  // Whiteboard insights table - processed analytics insights and recommendations
  await db.schema
    .createTable('whiteboard_insights')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('whiteboard_id', 'uuid', (col) => col.notNull().references('whiteboards.id').onDelete('cascade'))
    .addColumn('insight_type', 'varchar(100)', (col) => col.notNull()) // usage_pattern, performance_issue, collaboration_trend
    .addColumn('insight_category', 'varchar(50)', (col) => col.notNull()) // positive, warning, critical, information
    .addColumn('title', 'varchar(255)', (col) => col.notNull())
    .addColumn('description', 'text', (col) => col.notNull())
    .addColumn('severity_score', 'decimal(3,2)', (col) => col.defaultTo(0).check(
      sql`severity_score >= 0 AND severity_score <= 10`
    )) // 0-10 scale
    .addColumn('confidence_score', 'decimal(3,2)', (col) => col.defaultTo(0).check(
      sql`confidence_score >= 0 AND confidence_score <= 1`
    )) // 0-1 scale
    .addColumn('insight_data', 'jsonb', (col) => col.notNull().defaultTo('{}').check(
      sql`jsonb_typeof(insight_data) = 'object'`
    )) // Detailed insight information
    .addColumn('recommendations', 'jsonb', (col) => col.defaultTo('[]').check(
      sql`jsonb_typeof(recommendations) = 'array'`
    )) // Actionable recommendations
    .addColumn('time_period', 'jsonb', (col) => col.notNull().check(
      sql`jsonb_typeof(time_period) = 'object' AND
          time_period ? 'start' AND time_period ? 'end'`
    )) // Time period for the insight
    .addColumn('is_active', 'boolean', (col) => col.defaultTo(true))
    .addColumn('resolved_at', 'timestamptz')
    .addColumn('resolved_by', 'uuid')
    .addColumn('created_at', 'timestamptz', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
    .addColumn('updated_at', 'timestamptz', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
    .execute();

  // User behavior patterns table - detailed user interaction analysis
  await db.schema
    .createTable('whiteboard_user_behavior')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('user_id', 'uuid', (col) => col.notNull())
    .addColumn('whiteboard_id', 'uuid', (col) => col.notNull().references('whiteboards.id').onDelete('cascade'))
    .addColumn('date', 'date', (col) => col.notNull())
    .addColumn('session_count', 'integer', (col) => col.defaultTo(0))
    .addColumn('total_time_minutes', 'integer', (col) => col.defaultTo(0))
    .addColumn('preferred_tools', 'text[]', (col) => col.defaultTo(sql`ARRAY[]::text[]`))
    .addColumn('interaction_patterns', 'jsonb', (col) => col.defaultTo('{}').check(
      sql`jsonb_typeof(interaction_patterns) = 'object'`
    )) // Click patterns, drawing styles, etc.
    .addColumn('collaboration_style', 'varchar(50)') // individual, collaborative, leader, follower
    .addColumn('engagement_score', 'decimal(5,2)', (col) => col.defaultTo(0))
    .addColumn('productivity_score', 'decimal(5,2)', (col) => col.defaultTo(0))
    .addColumn('feature_adoption', 'jsonb', (col) => col.defaultTo('{}').check(
      sql`jsonb_typeof(feature_adoption) = 'object'`
    )) // Feature usage tracking
    .addColumn('created_at', 'timestamptz', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
    .addColumn('updated_at', 'timestamptz', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
    .execute();

  // Performance tracking table - detailed performance monitoring
  await db.schema
    .createTable('whiteboard_performance_tracking')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('whiteboard_id', 'uuid', (col) => col.notNull().references('whiteboards.id').onDelete('cascade'))
    .addColumn('session_id', 'uuid') // Optional session link
    .addColumn('metric_type', 'varchar(50)', (col) => col.notNull()) // load_time, ot_latency, render_time, memory_usage
    .addColumn('metric_value', 'decimal(10,4)', (col) => col.notNull())
    .addColumn('metric_unit', 'varchar(20)', (col) => col.notNull()) // ms, MB, fps, percent
    .addColumn('threshold_value', 'decimal(10,4)') // Performance threshold
    .addColumn('is_above_threshold', 'boolean', (col) => col.defaultTo(false))
    .addColumn('user_agent', 'text')
    .addColumn('device_info', 'jsonb', (col) => col.defaultTo('{}').check(
      sql`jsonb_typeof(device_info) = 'object'`
    )) // Device and browser info
    .addColumn('network_info', 'jsonb', (col) => col.defaultTo('{}').check(
      sql`jsonb_typeof(network_info) = 'object'`
    )) // Connection speed, latency
    .addColumn('context_data', 'jsonb', (col) => col.defaultTo('{}').check(
      sql`jsonb_typeof(context_data) = 'object'`
    )) // Additional context
    .addColumn('recorded_at', 'timestamptz', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
    .execute();

  // Create optimized indexes for analytics queries

  // Event table indexes - optimized for time-series queries
  await db.schema.createIndex('idx_whiteboard_events_whiteboard_id').on('whiteboard_events').column('whiteboard_id').execute();
  await db.schema.createIndex('idx_whiteboard_events_user_id').on('whiteboard_events').column('user_id').execute();
  await db.schema.createIndex('idx_whiteboard_events_type').on('whiteboard_events').column('event_type').execute();
  await db.schema.createIndex('idx_whiteboard_events_action').on('whiteboard_events').column('action').execute();
  await db.schema.createIndex('idx_whiteboard_events_server_timestamp').on('whiteboard_events').column('server_timestamp').execute();
  await db.schema.createIndex('idx_whiteboard_events_client_timestamp').on('whiteboard_events').column('client_timestamp').execute();

  // Session analytics indexes
  await db.schema.createIndex('idx_whiteboard_session_analytics_session_id').on('whiteboard_session_analytics').column('session_id').execute();
  await db.schema.createIndex('idx_whiteboard_session_analytics_whiteboard_id').on('whiteboard_session_analytics').column('whiteboard_id').execute();
  await db.schema.createIndex('idx_whiteboard_session_analytics_user_id').on('whiteboard_session_analytics').column('user_id').execute();
  await db.schema.createIndex('idx_whiteboard_session_analytics_start').on('whiteboard_session_analytics').column('session_start').execute();
  await db.schema.createIndex('idx_whiteboard_session_analytics_duration').on('whiteboard_session_analytics').column('duration_minutes').execute();

  // Metrics table indexes
  await db.schema.createIndex('idx_whiteboard_metrics_whiteboard_id').on('whiteboard_metrics').column('whiteboard_id').execute();
  await db.schema.createIndex('idx_whiteboard_metrics_date').on('whiteboard_metrics').column('metric_date').execute();
  await db.schema.createIndex('idx_whiteboard_metrics_unique_users').on('whiteboard_metrics').column('unique_users').execute();

  // Insights table indexes
  await db.schema.createIndex('idx_whiteboard_insights_whiteboard_id').on('whiteboard_insights').column('whiteboard_id').execute();
  await db.schema.createIndex('idx_whiteboard_insights_type').on('whiteboard_insights').column('insight_type').execute();
  await db.schema.createIndex('idx_whiteboard_insights_category').on('whiteboard_insights').column('insight_category').execute();
  await db.schema.createIndex('idx_whiteboard_insights_severity').on('whiteboard_insights').column('severity_score').execute();
  await db.schema.createIndex('idx_whiteboard_insights_active').on('whiteboard_insights').column('is_active').execute();

  // User behavior indexes
  await db.schema.createIndex('idx_whiteboard_user_behavior_user_id').on('whiteboard_user_behavior').column('user_id').execute();
  await db.schema.createIndex('idx_whiteboard_user_behavior_whiteboard_id').on('whiteboard_user_behavior').column('whiteboard_id').execute();
  await db.schema.createIndex('idx_whiteboard_user_behavior_date').on('whiteboard_user_behavior').column('date').execute();
  await db.schema.createIndex('idx_whiteboard_user_behavior_engagement').on('whiteboard_user_behavior').column('engagement_score').execute();

  // Performance tracking indexes
  await db.schema.createIndex('idx_whiteboard_performance_whiteboard_id').on('whiteboard_performance_tracking').column('whiteboard_id').execute();
  await db.schema.createIndex('idx_whiteboard_performance_metric_type').on('whiteboard_performance_tracking').column('metric_type').execute();
  await db.schema.createIndex('idx_whiteboard_performance_recorded_at').on('whiteboard_performance_tracking').column('recorded_at').execute();
  await db.schema.createIndex('idx_whiteboard_performance_threshold').on('whiteboard_performance_tracking').column('is_above_threshold').execute();

  // Composite indexes for complex analytics queries
  await db.schema.createIndex('idx_whiteboard_events_wb_user_time').on('whiteboard_events').columns(['whiteboard_id', 'user_id', 'server_timestamp']).execute();
  await db.schema.createIndex('idx_whiteboard_events_wb_type_time').on('whiteboard_events').columns(['whiteboard_id', 'event_type', 'server_timestamp']).execute();
  await db.schema.createIndex('idx_whiteboard_metrics_wb_date').on('whiteboard_metrics').columns(['whiteboard_id', 'metric_date']).execute();
  await db.schema.createIndex('idx_whiteboard_user_behavior_user_date').on('whiteboard_user_behavior').columns(['user_id', 'date']).execute();
  await db.schema.createIndex('idx_whiteboard_performance_wb_type_time').on('whiteboard_performance_tracking').columns(['whiteboard_id', 'metric_type', 'recorded_at']).execute();

  // Unique constraints for data integrity
  await db.schema.createIndex('idx_whiteboard_metrics_unique_wb_date').on('whiteboard_metrics').columns(['whiteboard_id', 'metric_date']).unique().execute();
  await db.schema.createIndex('idx_whiteboard_user_behavior_unique_user_wb_date').on('whiteboard_user_behavior').columns(['user_id', 'whiteboard_id', 'date']).unique().execute();

  // Create partitioning for time-series data (PostgreSQL specific)
  // Partition whiteboard_events by month for better performance
  await db.executeQuery(sql`
    ALTER TABLE whiteboard_events 
    ADD CONSTRAINT check_server_timestamp_range 
    CHECK (server_timestamp >= '2024-01-01'::timestamptz AND server_timestamp < '2030-01-01'::timestamptz)
  `.compile(db));

  // Create trigger for automatic metrics calculation
  await db.executeQuery(sql`
    CREATE OR REPLACE FUNCTION update_whiteboard_metrics()
    RETURNS TRIGGER AS $$
    BEGIN
      -- Update metrics when session analytics are updated
      INSERT INTO whiteboard_metrics (
        whiteboard_id, metric_date, total_sessions, unique_users, 
        total_duration_minutes, total_actions, elements_created, 
        elements_modified, elements_deleted, comments_created
      )
      SELECT 
        NEW.whiteboard_id,
        DATE(NEW.session_start) as metric_date,
        COUNT(*) as total_sessions,
        COUNT(DISTINCT NEW.user_id) as unique_users,
        COALESCE(SUM(NEW.duration_minutes), 0) as total_duration_minutes,
        COALESCE(SUM(NEW.total_actions), 0) as total_actions,
        COALESCE(SUM(NEW.elements_created), 0) as elements_created,
        COALESCE(SUM(NEW.elements_modified), 0) as elements_modified,
        COALESCE(SUM(NEW.elements_deleted), 0) as elements_deleted,
        COALESCE(SUM(NEW.comments_created), 0) as comments_created
      FROM whiteboard_session_analytics
      WHERE whiteboard_id = NEW.whiteboard_id 
        AND DATE(session_start) = DATE(NEW.session_start)
      GROUP BY whiteboard_id, DATE(session_start)
      ON CONFLICT (whiteboard_id, metric_date) DO UPDATE SET
        total_sessions = EXCLUDED.total_sessions,
        unique_users = EXCLUDED.unique_users,
        total_duration_minutes = EXCLUDED.total_duration_minutes,
        avg_session_duration = CASE 
          WHEN EXCLUDED.total_sessions > 0 
          THEN EXCLUDED.total_duration_minutes::decimal / EXCLUDED.total_sessions 
          ELSE 0 
        END,
        total_actions = EXCLUDED.total_actions,
        elements_created = EXCLUDED.elements_created,
        elements_modified = EXCLUDED.elements_modified,
        elements_deleted = EXCLUDED.elements_deleted,
        comments_created = EXCLUDED.comments_created,
        updated_at = CURRENT_TIMESTAMP;
      
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `.compile(db));

  await db.executeQuery(sql`
    CREATE TRIGGER trigger_update_whiteboard_metrics
    AFTER INSERT OR UPDATE ON whiteboard_session_analytics
    FOR EACH ROW
    EXECUTE FUNCTION update_whiteboard_metrics();
  `.compile(db));

  console.log('✅ Whiteboard analytics migration completed');
}

export async function down(db: Kysely<any>): Promise<void> {
  // Drop triggers and functions
  await db.executeQuery(sql`DROP TRIGGER IF EXISTS trigger_update_whiteboard_metrics ON whiteboard_session_analytics`.compile(db));
  await db.executeQuery(sql`DROP FUNCTION IF EXISTS update_whiteboard_metrics()`.compile(db));

  // Drop tables in reverse order
  await db.schema.dropTable('whiteboard_performance_tracking').execute();
  await db.schema.dropTable('whiteboard_user_behavior').execute();
  await db.schema.dropTable('whiteboard_insights').execute();
  await db.schema.dropTable('whiteboard_metrics').execute();
  await db.schema.dropTable('whiteboard_session_analytics').execute();
  await db.schema.dropTable('whiteboard_events').execute();
  
  console.log('✅ Whiteboard analytics migration rolled back');
}