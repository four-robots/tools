import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // Create the main events table with partitioning for performance
  await sql`
    CREATE TABLE events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      stream_id UUID NOT NULL,
      event_type VARCHAR(100) NOT NULL,
      event_version INTEGER NOT NULL DEFAULT 1,
      event_data JSONB NOT NULL,
      metadata JSONB DEFAULT '{}',
      
      -- Temporal tracking
      timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      sequence_number BIGSERIAL,
      
      -- Causality and correlation
      causation_id UUID REFERENCES events(id),
      correlation_id UUID NOT NULL,
      
      -- Multi-tenancy
      tenant_id UUID REFERENCES tenants(id),
      
      -- Performance and uniqueness constraints
      CONSTRAINT unique_stream_sequence UNIQUE (stream_id, sequence_number)
    ) PARTITION BY RANGE (timestamp)
  `.execute(db);

  // Create partitions for the current year and next year
  const currentYear = new Date().getFullYear();
  const nextYear = currentYear + 1;
  
  for (const year of [currentYear, nextYear]) {
    for (let month = 1; month <= 12; month++) {
      const monthStr = month.toString().padStart(2, '0');
      const partitionName = `events_${year}_${monthStr}`;
      const startDate = `${year}-${monthStr}-01`;
      const endDate = month === 12 
        ? `${year + 1}-01-01` 
        : `${year}-${(month + 1).toString().padStart(2, '0')}-01`;
      
      await sql`
        CREATE TABLE ${sql.table(partitionName)} PARTITION OF events
        FOR VALUES FROM (${startDate}) TO (${endDate})
      `.execute(db);
    }
  }

  // Create strategic indexes for performance
  await sql`
    CREATE INDEX idx_events_stream_id_sequence ON events (stream_id, sequence_number);
    CREATE INDEX idx_events_timestamp ON events (timestamp);
    CREATE INDEX idx_events_event_type ON events (event_type);
    CREATE INDEX idx_events_correlation_id ON events (correlation_id);
    CREATE INDEX idx_events_tenant_id ON events (tenant_id) WHERE tenant_id IS NOT NULL;
    CREATE INDEX idx_events_causation_id ON events (causation_id) WHERE causation_id IS NOT NULL;
  `.execute(db);

  // Event snapshots for performance optimization
  await sql`
    CREATE TABLE event_snapshots (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      stream_id UUID NOT NULL,
      stream_version INTEGER NOT NULL,
      snapshot_data JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      
      -- Ensure only latest snapshot per stream
      CONSTRAINT unique_stream_snapshot UNIQUE (stream_id, stream_version)
    )
  `.execute(db);

  await sql`
    CREATE INDEX idx_event_snapshots_stream_id ON event_snapshots (stream_id);
    CREATE INDEX idx_event_snapshots_created_at ON event_snapshots (created_at);
  `.execute(db);

  // Event projections for read models
  await sql`
    CREATE TABLE event_projections (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      projection_name VARCHAR(100) NOT NULL,
      stream_id UUID NOT NULL,
      last_processed_sequence BIGINT NOT NULL,
      projection_data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      
      -- Ensure one projection per stream
      CONSTRAINT unique_projection_stream UNIQUE (projection_name, stream_id)
    )
  `.execute(db);

  await sql`
    CREATE INDEX idx_event_projections_name_stream ON event_projections (projection_name, stream_id);
    CREATE INDEX idx_event_projections_updated_at ON event_projections (updated_at);
  `.execute(db);

  // Saga/Process manager state for complex workflows
  await sql`
    CREATE TABLE saga_instances (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      saga_type VARCHAR(100) NOT NULL,
      saga_data JSONB NOT NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ,
      
      -- Validate status values
      CONSTRAINT valid_saga_status CHECK (status IN ('active', 'completed', 'cancelled', 'failed'))
    )
  `.execute(db);

  await sql`
    CREATE INDEX idx_saga_instances_type_status ON saga_instances (saga_type, status);
    CREATE INDEX idx_saga_instances_created_at ON saga_instances (created_at);
    CREATE INDEX idx_saga_instances_updated_at ON saga_instances (updated_at);
  `.execute(db);

  // Event stream metadata for optimization
  await sql`
    CREATE TABLE event_streams (
      stream_id UUID PRIMARY KEY,
      stream_type VARCHAR(100) NOT NULL,
      current_version INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      tenant_id UUID REFERENCES tenants(id)
    )
  `.execute(db);

  await sql`
    CREATE INDEX idx_event_streams_type ON event_streams (stream_type);
    CREATE INDEX idx_event_streams_tenant_id ON event_streams (tenant_id) WHERE tenant_id IS NOT NULL;
  `.execute(db);

  // Event processing checkpoints for worker resilience
  await sql`
    CREATE TABLE event_processing_checkpoints (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      processor_name VARCHAR(100) NOT NULL,
      last_processed_sequence BIGINT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      
      CONSTRAINT unique_processor_checkpoint UNIQUE (processor_name)
    )
  `.execute(db);

  await sql`
    CREATE INDEX idx_event_processing_checkpoints_processor ON event_processing_checkpoints (processor_name);
  `.execute(db);

  // Event subscription tracking
  await sql`
    CREATE TABLE event_subscriptions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      subscription_name VARCHAR(100) NOT NULL,
      event_types TEXT[] NOT NULL,
      stream_filter JSONB DEFAULT '{}',
      handler_config JSONB DEFAULT '{}',
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      
      CONSTRAINT unique_subscription_name UNIQUE (subscription_name)
    )
  `.execute(db);

  await sql`
    CREATE INDEX idx_event_subscriptions_active ON event_subscriptions (is_active);
    CREATE INDEX idx_event_subscriptions_event_types ON event_subscriptions USING GIN (event_types);
  `.execute(db);

  // Collaboration-specific tables for event sourcing

  // Collaboration sessions tracking
  await sql`
    CREATE TABLE collaboration_sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id UUID NOT NULL UNIQUE,
      workspace_id UUID NOT NULL REFERENCES workspaces(id),
      session_type VARCHAR(50) NOT NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'active',
      configuration JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ended_at TIMESTAMPTZ,
      tenant_id UUID REFERENCES tenants(id),
      
      CONSTRAINT valid_session_status CHECK (status IN ('active', 'paused', 'ended', 'cancelled')),
      CONSTRAINT valid_session_type CHECK (session_type IN ('search', 'annotation', 'conflict_resolution', 'review'))
    )
  `.execute(db);

  await sql`
    CREATE INDEX idx_collaboration_sessions_workspace ON collaboration_sessions (workspace_id);
    CREATE INDEX idx_collaboration_sessions_type_status ON collaboration_sessions (session_type, status);
    CREATE INDEX idx_collaboration_sessions_tenant ON collaboration_sessions (tenant_id) WHERE tenant_id IS NOT NULL;
  `.execute(db);

  // Session participants
  await sql`
    CREATE TABLE collaboration_participants (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id UUID NOT NULL REFERENCES collaboration_sessions(session_id),
      user_id UUID NOT NULL REFERENCES users(id),
      role VARCHAR(50) NOT NULL DEFAULT 'viewer',
      permissions JSONB DEFAULT '[]',
      joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      left_at TIMESTAMPTZ,
      is_active BOOLEAN NOT NULL DEFAULT true,
      
      CONSTRAINT valid_participant_role CHECK (role IN ('owner', 'editor', 'viewer', 'reviewer')),
      CONSTRAINT unique_session_participant UNIQUE (session_id, user_id)
    )
  `.execute(db);

  await sql`
    CREATE INDEX idx_collaboration_participants_session ON collaboration_participants (session_id);
    CREATE INDEX idx_collaboration_participants_user ON collaboration_participants (user_id);
    CREATE INDEX idx_collaboration_participants_active ON collaboration_participants (is_active);
  `.execute(db);

  // Conflict tracking for resolution workflows
  await sql`
    CREATE TABLE conflict_instances (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      conflict_id UUID NOT NULL UNIQUE,
      session_id UUID NOT NULL REFERENCES collaboration_sessions(session_id),
      conflict_type VARCHAR(50) NOT NULL,
      content_id UUID NOT NULL,
      conflict_data JSONB NOT NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'open',
      priority VARCHAR(20) NOT NULL DEFAULT 'medium',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      resolved_at TIMESTAMPTZ,
      resolved_by UUID REFERENCES users(id),
      resolution_data JSONB,
      
      CONSTRAINT valid_conflict_status CHECK (status IN ('open', 'in_progress', 'resolved', 'escalated', 'cancelled')),
      CONSTRAINT valid_conflict_priority CHECK (priority IN ('low', 'medium', 'high', 'critical'))
    )
  `.execute(db);

  await sql`
    CREATE INDEX idx_conflict_instances_session ON conflict_instances (session_id);
    CREATE INDEX idx_conflict_instances_status ON conflict_instances (status);
    CREATE INDEX idx_conflict_instances_priority ON conflict_instances (priority);
    CREATE INDEX idx_conflict_instances_content ON conflict_instances (content_id);
  `.execute(db);

  // Annotation tracking for collaborative editing
  await sql`
    CREATE TABLE annotation_instances (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      annotation_id UUID NOT NULL UNIQUE,
      session_id UUID NOT NULL REFERENCES collaboration_sessions(session_id),
      user_id UUID NOT NULL REFERENCES users(id),
      content_id UUID NOT NULL,
      annotation_type VARCHAR(50) NOT NULL,
      content TEXT NOT NULL,
      position_data JSONB NOT NULL,
      tags TEXT[] DEFAULT '{}',
      status VARCHAR(50) NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      
      CONSTRAINT valid_annotation_status CHECK (status IN ('active', 'resolved', 'archived', 'deleted'))
    )
  `.execute(db);

  await sql`
    CREATE INDEX idx_annotation_instances_session ON annotation_instances (session_id);
    CREATE INDEX idx_annotation_instances_user ON annotation_instances (user_id);
    CREATE INDEX idx_annotation_instances_content ON annotation_instances (content_id);
    CREATE INDEX idx_annotation_instances_type ON annotation_instances (annotation_type);
    CREATE INDEX idx_annotation_instances_tags ON annotation_instances USING GIN (tags);
  `.execute(db);

  // Create function for automatic timestamp updates
  await sql`
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
    END;
    $$ language 'plpgsql'
  `.execute(db);

  // Add triggers for updated_at columns
  const tablesWithUpdatedAt = [
    'event_projections',
    'saga_instances', 
    'event_streams',
    'event_processing_checkpoints',
    'event_subscriptions',
    'collaboration_sessions',
    'annotation_instances'
  ];

  for (const tableName of tablesWithUpdatedAt) {
    await sql`
      CREATE TRIGGER ${sql.raw(`trigger_${tableName}_updated_at`)}
        BEFORE UPDATE ON ${sql.table(tableName)}
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column()
    `.execute(db);
  }

  // Create function for partition maintenance
  await sql`
    CREATE OR REPLACE FUNCTION maintain_event_partitions()
    RETURNS void AS $$
    DECLARE
        start_date date;
        end_date date;
        partition_name text;
    BEGIN
        -- Create next month's partition if it doesn't exist
        start_date := date_trunc('month', CURRENT_DATE + interval '1 month');
        end_date := start_date + interval '1 month';
        partition_name := 'events_' || to_char(start_date, 'YYYY_MM');
        
        IF NOT EXISTS (
            SELECT 1 FROM pg_tables 
            WHERE schemaname = 'public' 
            AND tablename = partition_name
        ) THEN
            EXECUTE format(
                'CREATE TABLE %I PARTITION OF events FOR VALUES FROM (%L) TO (%L)',
                partition_name, start_date, end_date
            );
        END IF;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db);

  console.log('Event sourcing system migration completed successfully');
}

export async function down(db: Kysely<any>): Promise<void> {
  // Drop in reverse order to handle dependencies
  await db.schema.dropTable('annotation_instances').ifExists().execute();
  await db.schema.dropTable('conflict_instances').ifExists().execute();
  await db.schema.dropTable('collaboration_participants').ifExists().execute();
  await db.schema.dropTable('collaboration_sessions').ifExists().execute();
  await db.schema.dropTable('event_subscriptions').ifExists().execute();
  await db.schema.dropTable('event_processing_checkpoints').ifExists().execute();
  await db.schema.dropTable('event_streams').ifExists().execute();
  await db.schema.dropTable('saga_instances').ifExists().execute();
  await db.schema.dropTable('event_projections').ifExists().execute();
  await db.schema.dropTable('event_snapshots').ifExists().execute();
  
  // Drop event partitions
  const currentYear = new Date().getFullYear();
  const nextYear = currentYear + 1;
  
  for (const year of [currentYear, nextYear]) {
    for (let month = 1; month <= 12; month++) {
      const monthStr = month.toString().padStart(2, '0');
      const partitionName = `events_${year}_${monthStr}`;
      await sql`DROP TABLE IF EXISTS ${sql.table(partitionName)}`.execute(db);
    }
  }
  
  await db.schema.dropTable('events').ifExists().execute();
  
  // Drop functions
  await sql`DROP FUNCTION IF EXISTS maintain_event_partitions()`.execute(db);
  await sql`DROP FUNCTION IF EXISTS update_updated_at_column()`.execute(db);

  console.log('Event sourcing system migration rolled back successfully');
}