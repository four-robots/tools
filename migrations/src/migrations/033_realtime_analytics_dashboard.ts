import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // Create time-series analytics metrics table with partitioning
  await sql`
    CREATE TABLE analytics_metrics (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      metric_name VARCHAR(255) NOT NULL,
      metric_value DOUBLE PRECISION NOT NULL,
      metric_type VARCHAR(50) NOT NULL CHECK (metric_type IN ('gauge', 'counter', 'histogram', 'summary')),
      dimensions JSONB DEFAULT '{}',
      
      -- Time series with computed buckets for efficient querying
      timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      time_bucket_5m TIMESTAMPTZ GENERATED ALWAYS AS (date_trunc('5 minutes', timestamp)) STORED,
      time_bucket_1h TIMESTAMPTZ GENERATED ALWAYS AS (date_trunc('hour', timestamp)) STORED,
      time_bucket_1d TIMESTAMPTZ GENERATED ALWAYS AS (date_trunc('day', timestamp)) STORED,
      
      -- Multi-tenancy support
      tenant_id UUID REFERENCES tenants(id),
      workspace_id UUID REFERENCES workspaces(id),
      
      -- Indexing for time-series queries
      CONSTRAINT analytics_metrics_time_idx UNIQUE (metric_name, timestamp, tenant_id)
    ) PARTITION BY RANGE (timestamp)
  `.execute(db);

  // Create partitions for current and next year
  const currentYear = new Date().getFullYear();
  const nextYear = currentYear + 1;
  
  for (const year of [currentYear, nextYear]) {
    for (let month = 1; month <= 12; month++) {
      const monthStr = month.toString().padStart(2, '0');
      const partitionName = `analytics_metrics_${year}_${monthStr}`;
      const startDate = `${year}-${monthStr}-01`;
      const endDate = month === 12 
        ? `${year + 1}-01-01` 
        : `${year}-${(month + 1).toString().padStart(2, '0')}-01`;
      
      await sql`
        CREATE TABLE ${sql.table(partitionName)} PARTITION OF analytics_metrics
        FOR VALUES FROM (${startDate}) TO (${endDate})
      `.execute(db);
    }
  }

  // Create indexes for analytics_metrics
  await sql`CREATE INDEX idx_analytics_metrics_metric_name_time ON analytics_metrics (metric_name, timestamp DESC)`.execute(db);
  await sql`CREATE INDEX idx_analytics_metrics_tenant_time ON analytics_metrics (tenant_id, timestamp DESC)`.execute(db);
  await sql`CREATE INDEX idx_analytics_metrics_workspace_time ON analytics_metrics (workspace_id, timestamp DESC)`.execute(db);
  await sql`CREATE INDEX idx_analytics_metrics_5m_bucket ON analytics_metrics (time_bucket_5m, metric_name)`.execute(db);
  await sql`CREATE INDEX idx_analytics_metrics_1h_bucket ON analytics_metrics (time_bucket_1h, metric_name)`.execute(db);
  await sql`CREATE INDEX idx_analytics_metrics_1d_bucket ON analytics_metrics (time_bucket_1d, metric_name)`.execute(db);

  // User engagement metrics table
  await sql`
    CREATE TABLE user_engagement_metrics (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id),
      session_id UUID NOT NULL,
      
      -- Engagement data
      active_time_seconds INTEGER NOT NULL CHECK (active_time_seconds >= 0),
      interactions_count INTEGER NOT NULL DEFAULT 0 CHECK (interactions_count >= 0),
      features_used JSONB DEFAULT '[]',
      
      -- Collaboration metrics
      collaborations_initiated INTEGER DEFAULT 0 CHECK (collaborations_initiated >= 0),
      collaborations_joined INTEGER DEFAULT 0 CHECK (collaborations_joined >= 0),
      conflicts_resolved INTEGER DEFAULT 0 CHECK (conflicts_resolved >= 0),
      
      -- Performance metrics
      avg_response_time_ms DOUBLE PRECISION CHECK (avg_response_time_ms >= 0),
      error_count INTEGER DEFAULT 0 CHECK (error_count >= 0),
      
      -- Time dimensions
      hour_bucket TIMESTAMPTZ NOT NULL,
      day_bucket DATE NOT NULL,
      
      -- Multi-tenancy
      tenant_id UUID REFERENCES tenants(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `.execute(db);

  // Create indexes for user_engagement_metrics
  await sql`CREATE INDEX idx_user_engagement_user_time ON user_engagement_metrics (user_id, hour_bucket DESC)`.execute(db);
  await sql`CREATE INDEX idx_user_engagement_session ON user_engagement_metrics (session_id)`.execute(db);
  await sql`CREATE INDEX idx_user_engagement_day ON user_engagement_metrics (day_bucket DESC)`.execute(db);
  await sql`CREATE INDEX idx_user_engagement_tenant ON user_engagement_metrics (tenant_id, day_bucket DESC)`.execute(db);

  // Dashboard configurations table
  await sql`
    CREATE TABLE dashboard_configurations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(255) NOT NULL,
      description TEXT,
      
      -- Dashboard layout and widgets
      layout JSONB NOT NULL DEFAULT '{}',
      widgets JSONB NOT NULL DEFAULT '[]',
      
      -- Access control
      owner_id UUID NOT NULL REFERENCES users(id),
      shared_with_users UUID[] DEFAULT '{}',
      shared_with_workspaces UUID[] DEFAULT '{}',
      is_public BOOLEAN DEFAULT FALSE,
      
      -- Refresh settings
      refresh_interval_seconds INTEGER DEFAULT 30 CHECK (refresh_interval_seconds > 0),
      auto_refresh_enabled BOOLEAN DEFAULT TRUE,
      
      -- Multi-tenancy
      tenant_id UUID REFERENCES tenants(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `.execute(db);

  // Create indexes for dashboard_configurations
  await sql`CREATE INDEX idx_dashboard_configs_owner ON dashboard_configurations (owner_id)`.execute(db);
  await sql`CREATE INDEX idx_dashboard_configs_tenant ON dashboard_configurations (tenant_id)`.execute(db);
  await sql`CREATE INDEX idx_dashboard_configs_public ON dashboard_configurations (is_public) WHERE is_public = TRUE`.execute(db);

  // Alert rules and notifications table
  await sql`
    CREATE TABLE analytics_alert_rules (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(255) NOT NULL,
      description TEXT,
      
      -- Alert conditions
      metric_name VARCHAR(255) NOT NULL,
      condition_type VARCHAR(50) NOT NULL CHECK (condition_type IN ('threshold', 'anomaly', 'rate_of_change')),
      condition_config JSONB NOT NULL,
      
      -- Actions
      notification_channels JSONB DEFAULT '[]',
      escalation_policy JSONB DEFAULT '{}',
      
      -- Status
      is_enabled BOOLEAN DEFAULT TRUE,
      last_triggered_at TIMESTAMPTZ,
      trigger_count INTEGER DEFAULT 0 CHECK (trigger_count >= 0),
      
      -- Multi-tenancy
      tenant_id UUID REFERENCES tenants(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `.execute(db);

  // Create indexes for analytics_alert_rules
  await sql`CREATE INDEX idx_alert_rules_metric ON analytics_alert_rules (metric_name)`.execute(db);
  await sql`CREATE INDEX idx_alert_rules_enabled ON analytics_alert_rules (is_enabled) WHERE is_enabled = TRUE`.execute(db);
  await sql`CREATE INDEX idx_alert_rules_tenant ON analytics_alert_rules (tenant_id)`.execute(db);

  // Collaboration session metrics table
  await sql`
    CREATE TABLE collaboration_session_metrics (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id UUID NOT NULL,
      
      -- Session details
      session_type VARCHAR(50) NOT NULL CHECK (session_type IN ('kanban', 'wiki', 'memory', 'search')),
      resource_id UUID NOT NULL,
      resource_type VARCHAR(50) NOT NULL,
      
      -- Participants
      participant_count INTEGER NOT NULL DEFAULT 0 CHECK (participant_count >= 0),
      participants JSONB DEFAULT '[]',
      
      -- Activity metrics
      total_modifications INTEGER DEFAULT 0 CHECK (total_modifications >= 0),
      conflicts_detected INTEGER DEFAULT 0 CHECK (conflicts_detected >= 0),
      conflicts_resolved INTEGER DEFAULT 0 CHECK (conflicts_resolved >= 0),
      avg_resolution_time_seconds INTEGER CHECK (avg_resolution_time_seconds >= 0),
      
      -- Session timing
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ended_at TIMESTAMPTZ,
      duration_seconds INTEGER CHECK (duration_seconds >= 0),
      
      -- Multi-tenancy
      tenant_id UUID REFERENCES tenants(id),
      workspace_id UUID REFERENCES workspaces(id),
      
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `.execute(db);

  // Create indexes for collaboration_session_metrics
  await sql`CREATE INDEX idx_collab_session_type ON collaboration_session_metrics (session_type, started_at DESC)`.execute(db);
  await sql`CREATE INDEX idx_collab_session_resource ON collaboration_session_metrics (resource_id, resource_type)`.execute(db);
  await sql`CREATE INDEX idx_collab_session_tenant ON collaboration_session_metrics (tenant_id, started_at DESC)`.execute(db);
  await sql`CREATE INDEX idx_collab_session_workspace ON collaboration_session_metrics (workspace_id, started_at DESC)`.execute(db);

  // System performance metrics table
  await sql`
    CREATE TABLE system_performance_metrics (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      
      -- Service identification
      service_name VARCHAR(100) NOT NULL,
      service_instance VARCHAR(255),
      
      -- Metric details
      metric_type VARCHAR(50) NOT NULL CHECK (metric_type IN ('cpu', 'memory', 'disk', 'network', 'database', 'websocket', 'api_response')),
      metric_name VARCHAR(255) NOT NULL,
      metric_value DOUBLE PRECISION NOT NULL,
      metric_unit VARCHAR(20),
      
      -- Additional metadata
      metadata JSONB DEFAULT '{}',
      
      -- Timing
      timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `.execute(db);

  // Create indexes for system_performance_metrics
  await sql`CREATE INDEX idx_perf_metrics_service_time ON system_performance_metrics (service_name, timestamp DESC)`.execute(db);
  await sql`CREATE INDEX idx_perf_metrics_type_time ON system_performance_metrics (metric_type, timestamp DESC)`.execute(db);
  await sql`CREATE INDEX idx_perf_metrics_timestamp ON system_performance_metrics (timestamp DESC)`.execute(db);

  // Analytics aggregations materialized view for faster queries
  await sql`
    CREATE MATERIALIZED VIEW hourly_analytics_aggregates AS
    SELECT 
      metric_name,
      time_bucket_1h as hour_bucket,
      tenant_id,
      workspace_id,
      COUNT(*) as metric_count,
      AVG(metric_value) as avg_value,
      MIN(metric_value) as min_value,
      MAX(metric_value) as max_value,
      SUM(metric_value) as sum_value,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY metric_value) as median_value,
      PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY metric_value) as p95_value,
      PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY metric_value) as p99_value
    FROM analytics_metrics
    GROUP BY metric_name, time_bucket_1h, tenant_id, workspace_id
  `.execute(db);

  await sql`CREATE INDEX idx_hourly_aggregates_metric_time ON hourly_analytics_aggregates (metric_name, hour_bucket DESC)`.execute(db);
  await sql`CREATE INDEX idx_hourly_aggregates_tenant ON hourly_analytics_aggregates (tenant_id, hour_bucket DESC)`.execute(db);

  // Daily analytics aggregations materialized view
  await sql`
    CREATE MATERIALIZED VIEW daily_analytics_aggregates AS
    SELECT 
      metric_name,
      time_bucket_1d as day_bucket,
      tenant_id,
      workspace_id,
      COUNT(*) as metric_count,
      AVG(metric_value) as avg_value,
      MIN(metric_value) as min_value,
      MAX(metric_value) as max_value,
      SUM(metric_value) as sum_value,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY metric_value) as median_value,
      PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY metric_value) as p95_value,
      PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY metric_value) as p99_value
    FROM analytics_metrics
    GROUP BY metric_name, time_bucket_1d, tenant_id, workspace_id
  `.execute(db);

  await sql`CREATE INDEX idx_daily_aggregates_metric_time ON daily_analytics_aggregates (metric_name, day_bucket DESC)`.execute(db);
  await sql`CREATE INDEX idx_daily_aggregates_tenant ON daily_analytics_aggregates (tenant_id, day_bucket DESC)`.execute(db);

  // Alert history table for tracking alert notifications
  await sql`
    CREATE TABLE analytics_alert_history (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      alert_rule_id UUID NOT NULL REFERENCES analytics_alert_rules(id),
      
      -- Alert instance details
      alert_level VARCHAR(20) NOT NULL CHECK (alert_level IN ('info', 'warning', 'critical')),
      message TEXT NOT NULL,
      current_value DOUBLE PRECISION,
      threshold_value DOUBLE PRECISION,
      
      -- Status tracking
      status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'acknowledged', 'resolved')),
      acknowledged_by UUID REFERENCES users(id),
      acknowledged_at TIMESTAMPTZ,
      resolved_by UUID REFERENCES users(id),
      resolved_at TIMESTAMPTZ,
      resolution_notes TEXT,
      
      -- Notification tracking
      notifications_sent JSONB DEFAULT '[]',
      escalation_level INTEGER DEFAULT 0 CHECK (escalation_level >= 0),
      
      -- Timing
      triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      
      -- Multi-tenancy
      tenant_id UUID REFERENCES tenants(id),
      
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `.execute(db);

  // Create indexes for analytics_alert_history
  await sql`CREATE INDEX idx_alert_history_rule ON analytics_alert_history (alert_rule_id, triggered_at DESC)`.execute(db);
  await sql`CREATE INDEX idx_alert_history_status ON analytics_alert_history (status, triggered_at DESC)`.execute(db);
  await sql`CREATE INDEX idx_alert_history_tenant ON analytics_alert_history (tenant_id, triggered_at DESC)`.execute(db);

  // Widget usage tracking table
  await sql`
    CREATE TABLE dashboard_widget_usage (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      dashboard_id UUID NOT NULL REFERENCES dashboard_configurations(id),
      widget_id VARCHAR(255) NOT NULL,
      widget_type VARCHAR(100) NOT NULL,
      
      -- Usage metrics
      view_count INTEGER DEFAULT 0 CHECK (view_count >= 0),
      interaction_count INTEGER DEFAULT 0 CHECK (interaction_count >= 0),
      avg_view_duration_seconds INTEGER CHECK (avg_view_duration_seconds >= 0),
      
      -- User engagement
      user_id UUID REFERENCES users(id),
      last_accessed_at TIMESTAMPTZ,
      
      -- Performance metrics
      avg_load_time_ms INTEGER CHECK (avg_load_time_ms >= 0),
      error_count INTEGER DEFAULT 0 CHECK (error_count >= 0),
      
      -- Time dimensions
      date_bucket DATE NOT NULL DEFAULT CURRENT_DATE,
      
      -- Multi-tenancy
      tenant_id UUID REFERENCES tenants(id),
      
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      
      CONSTRAINT unique_widget_usage_daily UNIQUE (dashboard_id, widget_id, user_id, date_bucket)
    )
  `.execute(db);

  // Create indexes for dashboard_widget_usage
  await sql`CREATE INDEX idx_widget_usage_dashboard ON dashboard_widget_usage (dashboard_id, date_bucket DESC)`.execute(db);
  await sql`CREATE INDEX idx_widget_usage_user ON dashboard_widget_usage (user_id, last_accessed_at DESC)`.execute(db);
  await sql`CREATE INDEX idx_widget_usage_type ON dashboard_widget_usage (widget_type, date_bucket DESC)`.execute(db);

  // Functions for automatic partition management
  await sql`
    CREATE OR REPLACE FUNCTION create_analytics_partition(year INTEGER, month INTEGER)
    RETURNS VOID AS $$
    DECLARE
      partition_name TEXT;
      start_date TEXT;
      end_date TEXT;
    BEGIN
      partition_name := 'analytics_metrics_' || year || '_' || lpad(month::text, 2, '0');
      start_date := year || '-' || lpad(month::text, 2, '0') || '-01';
      
      IF month = 12 THEN
        end_date := (year + 1) || '-01-01';
      ELSE
        end_date := year || '-' || lpad((month + 1)::text, 2, '0') || '-01';
      END IF;
      
      EXECUTE format(
        'CREATE TABLE %I PARTITION OF analytics_metrics FOR VALUES FROM (%L) TO (%L)',
        partition_name, start_date, end_date
      );
      
      EXECUTE format('CREATE INDEX idx_%s_metric_name_time ON %I (metric_name, timestamp DESC)', partition_name, partition_name);
      EXECUTE format('CREATE INDEX idx_%s_tenant_time ON %I (tenant_id, timestamp DESC)', partition_name, partition_name);
    END;
    $$ LANGUAGE plpgsql;
  `.execute(db);

  // Function to refresh materialized views
  await sql`
    CREATE OR REPLACE FUNCTION refresh_analytics_aggregates()
    RETURNS VOID AS $$
    BEGIN
      REFRESH MATERIALIZED VIEW CONCURRENTLY hourly_analytics_aggregates;
      REFRESH MATERIALIZED VIEW CONCURRENTLY daily_analytics_aggregates;
    END;
    $$ LANGUAGE plpgsql;
  `.execute(db);

  console.log('✅ Created real-time analytics dashboard tables with partitioning and materialized views');
}

export async function down(db: Kysely<any>): Promise<void> {
  // Drop functions
  await sql`DROP FUNCTION IF EXISTS refresh_analytics_aggregates()`.execute(db);
  await sql`DROP FUNCTION IF EXISTS create_analytics_partition(INTEGER, INTEGER)`.execute(db);
  
  // Drop materialized views
  await sql`DROP MATERIALIZED VIEW IF EXISTS daily_analytics_aggregates`.execute(db);
  await sql`DROP MATERIALIZED VIEW IF EXISTS hourly_analytics_aggregates`.execute(db);
  
  // Drop tables (partitions will be dropped automatically)
  await sql`DROP TABLE IF EXISTS dashboard_widget_usage`.execute(db);
  await sql`DROP TABLE IF EXISTS analytics_alert_history`.execute(db);
  await sql`DROP TABLE IF EXISTS system_performance_metrics`.execute(db);
  await sql`DROP TABLE IF EXISTS collaboration_session_metrics`.execute(db);
  await sql`DROP TABLE IF EXISTS analytics_alert_rules`.execute(db);
  await sql`DROP TABLE IF EXISTS dashboard_configurations`.execute(db);
  await sql`DROP TABLE IF EXISTS user_engagement_metrics`.execute(db);
  await sql`DROP TABLE IF EXISTS analytics_metrics`.execute(db);
  
  console.log('✅ Dropped real-time analytics dashboard tables');
}