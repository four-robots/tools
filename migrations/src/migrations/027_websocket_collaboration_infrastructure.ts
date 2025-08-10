/**
 * Migration 027: WebSocket Collaboration Infrastructure
 * 
 * Implements horizontally scalable real-time collaboration infrastructure including:
 * - Collaboration sessions with workspace and role-based management
 * - Session participants with presence tracking and permissions
 * - Real-time event broadcasting with message ordering guarantees
 * - User presence tracking with connection state management
 * - Redis clustering support for multi-instance WebSocket gateways
 * 
 * This is the foundational Phase 4 work item that enables real-time collaboration
 * features across all MCP Tools components.
 */

import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  console.log('🚀 Migration 027: Creating WebSocket collaboration infrastructure tables...');

  // Collaboration Sessions - Central hub for real-time collaboration
  await db.schema
    .createTable('collaboration_sessions')
    .addColumn('id', 'uuid', (col) => 
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn('workspace_id', 'uuid', (col) => col.notNull())
    .addColumn('session_name', 'varchar(255)', (col) => col.notNull())
    .addColumn('session_type', 'varchar(50)', (col) => col.notNull()) // 'search', 'analysis', 'review', 'kanban', 'wiki'
    .addColumn('created_by', 'uuid', (col) => col.notNull())
    
    // Session lifecycle
    .addColumn('created_at', 'timestamp with time zone', (col) => 
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    .addColumn('updated_at', 'timestamp with time zone', (col) => 
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    .addColumn('expires_at', 'timestamp with time zone')
    .addColumn('is_active', 'boolean', (col) => col.defaultTo(true))
    
    // Session configuration
    .addColumn('settings', 'jsonb', (col) => col.notNull().defaultTo(sql`'{}'`))
    .addColumn('max_participants', 'integer', (col) => col.defaultTo(50))
    .addColumn('allow_anonymous', 'boolean', (col) => col.defaultTo(false))
    .addColumn('require_approval', 'boolean', (col) => col.defaultTo(false))
    
    // Collaboration context
    .addColumn('context_data', 'jsonb', (col) => col.defaultTo(sql`'{}'`)) // Search filters, kanban board, wiki page, etc.
    .addColumn('shared_state', 'jsonb', (col) => col.defaultTo(sql`'{}'`)) // Current collaborative state
    .addColumn('activity_summary', 'jsonb', (col) => col.defaultTo(sql`'{}'`)) // Summary of recent activity
    .execute();

  // Add foreign key constraint for collaboration_sessions
  await db.schema
    .alterTable('collaboration_sessions')
    .addForeignKeyConstraint('fk_collaboration_created_by', ['created_by'], 'users', ['id'], (constraint) =>
      constraint.onDelete('cascade')
    )
    .execute();

  // Add check constraint for session type
  await db.schema
    .alterTable('collaboration_sessions')
    .addCheckConstraint('check_session_type', 
      sql`session_type IN ('search', 'analysis', 'review', 'kanban', 'wiki', 'memory', 'codebase')`
    )
    .execute();

  // Session Participants - Track who's in each collaboration session
  await db.schema
    .createTable('session_participants')
    .addColumn('id', 'uuid', (col) => 
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn('session_id', 'uuid', (col) => col.notNull())
    .addColumn('user_id', 'uuid', (col) => col.notNull())
    
    // Participation details
    .addColumn('role', 'varchar(50)', (col) => col.notNull().defaultTo('participant')) // 'owner', 'moderator', 'participant', 'observer'
    .addColumn('joined_at', 'timestamp with time zone', (col) => 
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    .addColumn('last_seen_at', 'timestamp with time zone', (col) => 
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    .addColumn('is_active', 'boolean', (col) => col.defaultTo(true))
    
    // Permissions and capabilities
    .addColumn('permissions', 'jsonb', (col) => col.notNull().defaultTo(sql`'{}'`))
    .addColumn('can_invite_others', 'boolean', (col) => col.defaultTo(false))
    .addColumn('can_modify_session', 'boolean', (col) => col.defaultTo(false))
    .addColumn('can_broadcast_events', 'boolean', (col) => col.defaultTo(true))
    
    // Participation metrics
    .addColumn('event_count', 'integer', (col) => col.defaultTo(0))
    .addColumn('total_active_time_ms', 'bigint', (col) => col.defaultTo(0))
    .addColumn('last_activity_type', 'varchar(100)')
    .execute();

  // Add foreign key constraints for session_participants
  await db.schema
    .alterTable('session_participants')
    .addForeignKeyConstraint('fk_participant_session', ['session_id'], 'collaboration_sessions', ['id'], (constraint) =>
      constraint.onDelete('cascade')
    )
    .execute();

  await db.schema
    .alterTable('session_participants')
    .addForeignKeyConstraint('fk_participant_user', ['user_id'], 'users', ['id'], (constraint) =>
      constraint.onDelete('cascade')
    )
    .execute();

  // Add unique constraint for session/user combination
  await db.schema
    .alterTable('session_participants')
    .addUniqueConstraint('unique_session_user', ['session_id', 'user_id'])
    .execute();

  // Add check constraint for role
  await db.schema
    .alterTable('session_participants')
    .addCheckConstraint('check_participant_role', 
      sql`role IN ('owner', 'moderator', 'participant', 'observer')`
    )
    .execute();

  // Real-time Collaboration Events - Track all real-time events with ordering
  await db.schema
    .createTable('collaboration_events')
    .addColumn('id', 'uuid', (col) => 
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn('session_id', 'uuid', (col) => col.notNull())
    .addColumn('user_id', 'uuid', (col) => col.notNull())
    
    // Event identification
    .addColumn('event_type', 'varchar(100)', (col) => col.notNull()) // 'search', 'filter', 'annotation', 'cursor', 'presence', 'join', 'leave'
    .addColumn('event_category', 'varchar(50)', (col) => col.notNull()) // 'user_action', 'system_event', 'presence_update'
    .addColumn('event_data', 'jsonb', (col) => col.notNull())
    
    // Event ordering and delivery
    .addColumn('sequence_number', 'bigint', (col) => col.notNull())
    .addColumn('created_at', 'timestamp with time zone', (col) => 
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    .addColumn('message_id', 'varchar(100)', (col) => col.notNull()) // UUID for deduplication
    
    // Event processing
    .addColumn('processed_at', 'timestamp with time zone')
    .addColumn('broadcast_count', 'integer', (col) => col.defaultTo(0))
    .addColumn('delivery_status', 'varchar(20)', (col) => col.defaultTo('pending')) // 'pending', 'delivered', 'failed'
    
    // Event context
    .addColumn('client_timestamp', 'timestamp with time zone')
    .addColumn('source_connection_id', 'varchar(100)')
    .addColumn('requires_ack', 'boolean', (col) => col.defaultTo(false))
    .addColumn('parent_event_id', 'uuid') // For event chains/replies
    .execute();

  // Add foreign key constraints for collaboration_events
  await db.schema
    .alterTable('collaboration_events')
    .addForeignKeyConstraint('fk_event_session', ['session_id'], 'collaboration_sessions', ['id'], (constraint) =>
      constraint.onDelete('cascade')
    )
    .execute();

  await db.schema
    .alterTable('collaboration_events')
    .addForeignKeyConstraint('fk_event_user', ['user_id'], 'users', ['id'], (constraint) =>
      constraint.onDelete('cascade')
    )
    .execute();

  await db.schema
    .alterTable('collaboration_events')
    .addForeignKeyConstraint('fk_event_parent', ['parent_event_id'], 'collaboration_events', ['id'], (constraint) =>
      constraint.onDelete('set null')
    )
    .execute();

  // Add check constraints for collaboration_events
  await db.schema
    .alterTable('collaboration_events')
    .addCheckConstraint('check_event_category', 
      sql`event_category IN ('user_action', 'system_event', 'presence_update', 'session_control')`
    )
    .execute();

  await db.schema
    .alterTable('collaboration_events')
    .addCheckConstraint('check_delivery_status', 
      sql`delivery_status IN ('pending', 'delivered', 'failed', 'retrying')`
    )
    .execute();

  // Add unique constraint for message deduplication
  await db.schema
    .alterTable('collaboration_events')
    .addUniqueConstraint('unique_message_id', ['message_id'])
    .execute();

  // User Presence - Real-time presence and connection state tracking
  await db.schema
    .createTable('user_presence')
    .addColumn('id', 'uuid', (col) => 
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn('user_id', 'uuid', (col) => col.notNull())
    .addColumn('session_id', 'uuid', (col) => col.notNull())
    
    // Presence status
    .addColumn('status', 'varchar(50)', (col) => col.notNull().defaultTo('online')) // 'online', 'idle', 'busy', 'offline'
    .addColumn('custom_status_text', 'varchar(255)')
    .addColumn('status_emoji', 'varchar(10)')
    .addColumn('last_activity', 'timestamp with time zone', (col) => 
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    
    // Connection details
    .addColumn('connection_count', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('connection_ids', 'jsonb', (col) => col.defaultTo(sql`'[]'`)) // Array of active connection IDs
    .addColumn('last_heartbeat', 'timestamp with time zone', (col) => 
      col.defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    
    // Real-time collaboration state
    .addColumn('current_location', 'jsonb', (col) => col.defaultTo(sql`'{}'`)) // Current search context, page, filters
    .addColumn('cursor_position', 'jsonb', (col) => col.defaultTo(sql`'{}'`)) // Real-time cursor/focus information
    .addColumn('active_tools', 'jsonb', (col) => col.defaultTo(sql`'[]'`)) // Currently active collaboration tools
    
    // User agent and device info
    .addColumn('user_agent', 'text')
    .addColumn('device_info', 'jsonb', (col) => col.defaultTo(sql`'{}'`))
    .addColumn('client_version', 'varchar(50)')
    
    // Timestamps
    .addColumn('joined_session_at', 'timestamp with time zone', (col) => 
      col.defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    .addColumn('updated_at', 'timestamp with time zone', (col) => 
      col.defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    .execute();

  // Add foreign key constraints for user_presence
  await db.schema
    .alterTable('user_presence')
    .addForeignKeyConstraint('fk_presence_user', ['user_id'], 'users', ['id'], (constraint) =>
      constraint.onDelete('cascade')
    )
    .execute();

  await db.schema
    .alterTable('user_presence')
    .addForeignKeyConstraint('fk_presence_session', ['session_id'], 'collaboration_sessions', ['id'], (constraint) =>
      constraint.onDelete('cascade')
    )
    .execute();

  // Add unique constraint for user/session presence
  await db.schema
    .alterTable('user_presence')
    .addUniqueConstraint('unique_user_session_presence', ['user_id', 'session_id'])
    .execute();

  // Add check constraint for status
  await db.schema
    .alterTable('user_presence')
    .addCheckConstraint('check_presence_status', 
      sql`status IN ('online', 'idle', 'busy', 'offline', 'away')`
    )
    .execute();

  // Create sequence for event ordering
  await db.schema
    .createView('collaboration_event_sequence')
    .as(
      db.selectFrom('collaboration_events')
        .select(['session_id', sql<number>`COALESCE(MAX(sequence_number), 0) + 1`.as('next_sequence')])
        .groupBy('session_id')
    )
    .execute();

  // Create strategic indexes for optimal performance
  console.log('🔍 Creating collaboration infrastructure indexes...');

  // Collaboration sessions indexes
  await db.schema
    .createIndex('idx_collaboration_sessions_workspace')
    .on('collaboration_sessions')
    .columns(['workspace_id', 'is_active'])
    .execute();

  await db.schema
    .createIndex('idx_collaboration_sessions_type_active')
    .on('collaboration_sessions')
    .columns(['session_type', 'is_active'])
    .execute();

  await db.schema
    .createIndex('idx_collaboration_sessions_created_by')
    .on('collaboration_sessions')
    .columns(['created_by', 'created_at'])
    .execute();

  await db.schema
    .createIndex('idx_collaboration_sessions_expires')
    .on('collaboration_sessions')
    .columns(['expires_at'])
    .where('expires_at', 'is not', null)
    .execute();

  // Session participants indexes
  await db.schema
    .createIndex('idx_session_participants_session_active')
    .on('session_participants')
    .columns(['session_id', 'is_active'])
    .execute();

  await db.schema
    .createIndex('idx_session_participants_user_role')
    .on('session_participants')
    .columns(['user_id', 'role'])
    .execute();

  await db.schema
    .createIndex('idx_session_participants_last_seen')
    .on('session_participants')
    .columns(['last_seen_at'])
    .execute();

  // Collaboration events indexes (critical for performance)
  await db.schema
    .createIndex('idx_collaboration_events_session_seq')
    .on('collaboration_events')
    .columns(['session_id', 'sequence_number'])
    .execute();

  await db.schema
    .createIndex('idx_collaboration_events_type_created')
    .on('collaboration_events')
    .columns(['event_type', 'created_at'])
    .execute();

  await db.schema
    .createIndex('idx_collaboration_events_user_session')
    .on('collaboration_events')
    .columns(['user_id', 'session_id', 'created_at'])
    .execute();

  await db.schema
    .createIndex('idx_collaboration_events_delivery')
    .on('collaboration_events')
    .columns(['delivery_status', 'created_at'])
    .execute();

  await db.schema
    .createIndex('idx_collaboration_events_message_id')
    .on('collaboration_events')
    .columns(['message_id'])
    .execute();

  // User presence indexes
  await db.schema
    .createIndex('idx_user_presence_session_status')
    .on('user_presence')
    .columns(['session_id', 'status'])
    .execute();

  await db.schema
    .createIndex('idx_user_presence_user_activity')
    .on('user_presence')
    .columns(['user_id', 'last_activity'])
    .execute();

  await db.schema
    .createIndex('idx_user_presence_heartbeat')
    .on('user_presence')
    .columns(['last_heartbeat'])
    .execute();

  await db.schema
    .createIndex('idx_user_presence_connections')
    .on('user_presence')
    .columns(['connection_count'])
    .where('connection_count', '>', 0)
    .execute();

  // Create partial indexes for active sessions and online users
  await db.schema
    .createIndex('idx_active_sessions_only')
    .on('collaboration_sessions')
    .columns(['created_at', 'session_type'])
    .where('is_active', '=', true)
    .execute();

  await db.schema
    .createIndex('idx_online_presence_only')
    .on('user_presence')
    .columns(['session_id', 'last_activity'])
    .where(sql`status IN ('online', 'busy', 'idle')`)
    .execute();

  // GIN indexes for JSONB columns
  await db.schema
    .createIndex('idx_collaboration_sessions_settings_gin')
    .on('collaboration_sessions')
    .expression(sql`settings`)
    .using('gin')
    .execute();

  await db.schema
    .createIndex('idx_collaboration_events_data_gin')
    .on('collaboration_events')
    .expression(sql`event_data`)
    .using('gin')
    .execute();

  await db.schema
    .createIndex('idx_user_presence_location_gin')
    .on('user_presence')
    .expression(sql`current_location`)
    .using('gin')
    .execute();

  console.log('✅ Migration 027: WebSocket collaboration infrastructure created successfully');
  console.log('🔌 Real-time collaboration system ready for horizontally scalable WebSocket gateways');
  console.log('🏗️  Foundation established for Phase 4 collaboration features');
}

export async function down(db: Kysely<any>): Promise<void> {
  console.log('🔄 Migration 027: Dropping WebSocket collaboration infrastructure...');

  // Drop indexes first
  const indexes = [
    'idx_user_presence_location_gin',
    'idx_collaboration_events_data_gin',
    'idx_collaboration_sessions_settings_gin',
    'idx_online_presence_only',
    'idx_active_sessions_only',
    'idx_user_presence_connections',
    'idx_user_presence_heartbeat',
    'idx_user_presence_user_activity',
    'idx_user_presence_session_status',
    'idx_collaboration_events_message_id',
    'idx_collaboration_events_delivery',
    'idx_collaboration_events_user_session',
    'idx_collaboration_events_type_created',
    'idx_collaboration_events_session_seq',
    'idx_session_participants_last_seen',
    'idx_session_participants_user_role',
    'idx_session_participants_session_active',
    'idx_collaboration_sessions_expires',
    'idx_collaboration_sessions_created_by',
    'idx_collaboration_sessions_type_active',
    'idx_collaboration_sessions_workspace'
  ];

  for (const index of indexes) {
    await db.schema.dropIndex(index).ifExists().execute();
  }

  // Drop view
  await db.schema.dropView('collaboration_event_sequence').ifExists().execute();

  // Drop tables in reverse dependency order
  await db.schema.dropTable('user_presence').ifExists().execute();
  await db.schema.dropTable('collaboration_events').ifExists().execute();
  await db.schema.dropTable('session_participants').ifExists().execute();
  await db.schema.dropTable('collaboration_sessions').ifExists().execute();

  console.log('✅ Migration 027: WebSocket collaboration infrastructure dropped successfully');
}