/**
 * Migration 028: Live Search Collaboration Service
 * 
 * Implements comprehensive live search collaboration infrastructure including:
 * - Collaborative search sessions with real-time synchronization
 * - Search state management with shared queries and filters
 * - Multi-user result highlighting and annotations
 * - Search session persistence and conflict resolution
 * - Integration with existing WebSocket collaboration infrastructure
 * 
 * This implements Work Item 4.1.2: Live Search Collaboration Service.
 */

import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  console.log('🔍 Migration 028: Creating live search collaboration infrastructure tables...');

  // Collaborative Search Sessions - Specialized search collaboration sessions
  await db.schema
    .createTable('collaborative_search_sessions')
    .addColumn('id', 'uuid', (col) => 
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn('collaboration_session_id', 'uuid', (col) => col.notNull()) // References collaboration_sessions
    .addColumn('workspace_id', 'uuid', (col) => col.notNull())
    .addColumn('session_name', 'varchar(255)', (col) => col.notNull())
    .addColumn('created_by', 'uuid', (col) => col.notNull())
    
    // Session lifecycle and state
    .addColumn('created_at', 'timestamp with time zone', (col) => 
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    .addColumn('updated_at', 'timestamp with time zone', (col) => 
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    .addColumn('is_active', 'boolean', (col) => col.defaultTo(true))
    .addColumn('is_persistent', 'boolean', (col) => col.defaultTo(true))
    
    // Search session configuration
    .addColumn('search_settings', 'jsonb', (col) => col.notNull().defaultTo(sql`'{}'`)) // Search preferences, default filters
    .addColumn('max_participants', 'integer', (col) => col.defaultTo(50))
    .addColumn('allow_anonymous_search', 'boolean', (col) => col.defaultTo(false))
    .addColumn('require_moderation', 'boolean', (col) => col.defaultTo(false))
    
    // Current search state
    .addColumn('current_search_state', 'jsonb', (col) => col.defaultTo(sql`'{}'`)) // Active query, filters, results
    .addColumn('search_history', 'jsonb', (col) => col.defaultTo(sql`'[]'`)) // Recent search queries and results
    .addColumn('shared_annotations', 'jsonb', (col) => col.defaultTo(sql`'{}'`)) // Collaborative annotations on results
    .addColumn('performance_metrics', 'jsonb', (col) => col.defaultTo(sql`'{}'`)) // Search performance tracking
    .execute();

  // Add foreign key constraints for collaborative_search_sessions
  await db.schema
    .alterTable('collaborative_search_sessions')
    .addForeignKeyConstraint('fk_collab_search_session', ['collaboration_session_id'], 'collaboration_sessions', ['id'], (constraint) =>
      constraint.onDelete('cascade')
    )
    .execute();

  await db.schema
    .alterTable('collaborative_search_sessions')
    .addForeignKeyConstraint('fk_collab_search_created_by', ['created_by'], 'users', ['id'], (constraint) =>
      constraint.onDelete('cascade')
    )
    .execute();

  // Search Session Participants - Track who's participating in search collaboration
  await db.schema
    .createTable('search_session_participants')
    .addColumn('id', 'uuid', (col) => 
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn('search_session_id', 'uuid', (col) => col.notNull())
    .addColumn('user_id', 'uuid', (col) => col.notNull())
    
    // Participation details
    .addColumn('role', 'varchar(50)', (col) => col.notNull().defaultTo('searcher')) // 'searcher', 'observer', 'moderator'
    .addColumn('joined_at', 'timestamp with time zone', (col) => 
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    .addColumn('last_search_at', 'timestamp with time zone', (col) => 
      col.defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    .addColumn('is_active', 'boolean', (col) => col.defaultTo(true))
    
    // Search permissions
    .addColumn('can_initiate_search', 'boolean', (col) => col.defaultTo(true))
    .addColumn('can_modify_filters', 'boolean', (col) => col.defaultTo(true))
    .addColumn('can_annotate_results', 'boolean', (col) => col.defaultTo(true))
    .addColumn('can_bookmark_results', 'boolean', (col) => col.defaultTo(true))
    .addColumn('can_invite_participants', 'boolean', (col) => col.defaultTo(false))
    
    // Participation metrics
    .addColumn('search_query_count', 'integer', (col) => col.defaultTo(0))
    .addColumn('filter_change_count', 'integer', (col) => col.defaultTo(0))
    .addColumn('annotation_count', 'integer', (col) => col.defaultTo(0))
    .addColumn('total_search_time_ms', 'bigint', (col) => col.defaultTo(0))
    
    // Current search context
    .addColumn('current_query', 'text')
    .addColumn('active_filters', 'jsonb', (col) => col.defaultTo(sql`'{}'`))
    .addColumn('cursor_position', 'jsonb', (col) => col.defaultTo(sql`'{}'`))
    .addColumn('selected_results', 'jsonb', (col) => col.defaultTo(sql`'[]'`)) // Currently highlighted/selected results
    .execute();

  // Add foreign key constraints for search_session_participants
  await db.schema
    .alterTable('search_session_participants')
    .addForeignKeyConstraint('fk_search_participant_session', ['search_session_id'], 'collaborative_search_sessions', ['id'], (constraint) =>
      constraint.onDelete('cascade')
    )
    .execute();

  await db.schema
    .alterTable('search_session_participants')
    .addForeignKeyConstraint('fk_search_participant_user', ['user_id'], 'users', ['id'], (constraint) =>
      constraint.onDelete('cascade')
    )
    .execute();

  // Add unique constraint for search session/user combination
  await db.schema
    .alterTable('search_session_participants')
    .addUniqueConstraint('unique_search_session_user', ['search_session_id', 'user_id'])
    .execute();

  // Add check constraint for role
  await db.schema
    .alterTable('search_session_participants')
    .addCheckConstraint('check_search_participant_role', 
      sql`role IN ('searcher', 'observer', 'moderator')`
    )
    .execute();

  // Shared Search State - Real-time synchronized search state
  await db.schema
    .createTable('shared_search_state')
    .addColumn('id', 'uuid', (col) => 
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn('search_session_id', 'uuid', (col) => col.notNull())
    .addColumn('state_key', 'varchar(100)', (col) => col.notNull()) // 'query', 'filters', 'sort', 'pagination'
    .addColumn('state_value', 'jsonb', (col) => col.notNull())
    .addColumn('last_modified_by', 'uuid', (col) => col.notNull())
    .addColumn('last_modified_at', 'timestamp with time zone', (col) => 
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    
    // State versioning for conflict resolution
    .addColumn('version', 'integer', (col) => col.notNull().defaultTo(1))
    .addColumn('state_hash', 'varchar(64)', (col) => col.notNull()) // SHA-256 hash of state_value
    .addColumn('conflict_resolution', 'varchar(50)', (col) => col.defaultTo('last_write_wins')) // 'last_write_wins', 'merge', 'manual'
    
    // Change tracking
    .addColumn('change_source', 'varchar(50)', (col) => col.defaultTo('user')) // 'user', 'system', 'merge'
    .addColumn('previous_value', 'jsonb') // Previous state for rollback
    .addColumn('change_reason', 'text') // Optional reason for the change
    .execute();

  // Add foreign key constraints for shared_search_state
  await db.schema
    .alterTable('shared_search_state')
    .addForeignKeyConstraint('fk_search_state_session', ['search_session_id'], 'collaborative_search_sessions', ['id'], (constraint) =>
      constraint.onDelete('cascade')
    )
    .execute();

  await db.schema
    .alterTable('shared_search_state')
    .addForeignKeyConstraint('fk_search_state_modified_by', ['last_modified_by'], 'users', ['id'], (constraint) =>
      constraint.onDelete('cascade')
    )
    .execute();

  // Add unique constraint for session/state_key combination
  await db.schema
    .alterTable('shared_search_state')
    .addUniqueConstraint('unique_session_state_key', ['search_session_id', 'state_key'])
    .execute();

  // Add check constraint for conflict resolution
  await db.schema
    .alterTable('shared_search_state')
    .addCheckConstraint('check_conflict_resolution', 
      sql`conflict_resolution IN ('last_write_wins', 'merge', 'manual')`
    )
    .execute();

  // Collaborative Search Events - Real-time search-specific events
  await db.schema
    .createTable('collaborative_search_events')
    .addColumn('id', 'uuid', (col) => 
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn('search_session_id', 'uuid', (col) => col.notNull())
    .addColumn('collaboration_event_id', 'uuid', (col) => col.notNull()) // References collaboration_events
    .addColumn('user_id', 'uuid', (col) => col.notNull())
    
    // Search-specific event details
    .addColumn('search_event_type', 'varchar(100)', (col) => col.notNull()) // 'query_update', 'filter_change', 'result_highlight', 'annotation_add'
    .addColumn('search_event_data', 'jsonb', (col) => col.notNull())
    
    // Event ordering and timing
    .addColumn('sequence_number', 'bigint', (col) => col.notNull())
    .addColumn('created_at', 'timestamp with time zone', (col) => 
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    .addColumn('client_timestamp', 'timestamp with time zone')
    
    // Search context
    .addColumn('query_before', 'text')
    .addColumn('query_after', 'text')
    .addColumn('filters_before', 'jsonb')
    .addColumn('filters_after', 'jsonb')
    .addColumn('affected_results', 'jsonb', (col) => col.defaultTo(sql`'[]'`)) // Result IDs affected by this event
    
    // Event metadata
    .addColumn('debounce_group_id', 'uuid') // For grouping rapid keystrokes
    .addColumn('is_debounced', 'boolean', (col) => col.defaultTo(false))
    .addColumn('batch_id', 'uuid') // For batching related events
    .execute();

  // Add foreign key constraints for collaborative_search_events
  await db.schema
    .alterTable('collaborative_search_events')
    .addForeignKeyConstraint('fk_search_event_session', ['search_session_id'], 'collaborative_search_sessions', ['id'], (constraint) =>
      constraint.onDelete('cascade')
    )
    .execute();

  await db.schema
    .alterTable('collaborative_search_events')
    .addForeignKeyConstraint('fk_search_event_collaboration', ['collaboration_event_id'], 'collaboration_events', ['id'], (constraint) =>
      constraint.onDelete('cascade')
    )
    .execute();

  await db.schema
    .alterTable('collaborative_search_events')
    .addForeignKeyConstraint('fk_search_event_user', ['user_id'], 'users', ['id'], (constraint) =>
      constraint.onDelete('cascade')
    )
    .execute();

  // Search Annotations - Collaborative annotations on search results
  await db.schema
    .createTable('search_annotations')
    .addColumn('id', 'uuid', (col) => 
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn('search_session_id', 'uuid', (col) => col.notNull())
    .addColumn('user_id', 'uuid', (col) => col.notNull())
    
    // Annotation target
    .addColumn('result_id', 'uuid', (col) => col.notNull()) // ID of the search result being annotated
    .addColumn('result_type', 'varchar(50)', (col) => col.notNull()) // Type of content being annotated
    .addColumn('result_url', 'text') // URL of the annotated result
    
    // Annotation content
    .addColumn('annotation_type', 'varchar(50)', (col) => col.notNull()) // 'highlight', 'note', 'bookmark', 'flag'
    .addColumn('annotation_text', 'text')
    .addColumn('annotation_data', 'jsonb', (col) => col.defaultTo(sql`'{}'`)) // Additional metadata
    
    // Text selection for highlights
    .addColumn('text_selection', 'jsonb', (col) => col.defaultTo(sql`'{}'`)) // Start/end positions for text highlights
    .addColumn('selected_text', 'text') // The actual selected text
    
    // Annotation metadata
    .addColumn('is_shared', 'boolean', (col) => col.defaultTo(true)) // Whether visible to all participants
    .addColumn('is_resolved', 'boolean', (col) => col.defaultTo(false)) // For flag/issue annotations
    .addColumn('resolved_by', 'uuid')
    .addColumn('resolved_at', 'timestamp with time zone')
    
    // Timestamps
    .addColumn('created_at', 'timestamp with time zone', (col) => 
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    .addColumn('updated_at', 'timestamp with time zone', (col) => 
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    
    // Collaboration context
    .addColumn('parent_annotation_id', 'uuid') // For threaded annotations
    .addColumn('mentions', 'jsonb', (col) => col.defaultTo(sql`'[]'`)) // User IDs mentioned in annotation
    .execute();

  // Add foreign key constraints for search_annotations
  await db.schema
    .alterTable('search_annotations')
    .addForeignKeyConstraint('fk_annotation_search_session', ['search_session_id'], 'collaborative_search_sessions', ['id'], (constraint) =>
      constraint.onDelete('cascade')
    )
    .execute();

  await db.schema
    .alterTable('search_annotations')
    .addForeignKeyConstraint('fk_annotation_user', ['user_id'], 'users', ['id'], (constraint) =>
      constraint.onDelete('cascade')
    )
    .execute();

  await db.schema
    .alterTable('search_annotations')
    .addForeignKeyConstraint('fk_annotation_resolved_by', ['resolved_by'], 'users', ['id'], (constraint) =>
      constraint.onDelete('set null')
    )
    .execute();

  await db.schema
    .alterTable('search_annotations')
    .addForeignKeyConstraint('fk_annotation_parent', ['parent_annotation_id'], 'search_annotations', ['id'], (constraint) =>
      constraint.onDelete('set null')
    )
    .execute();

  // Add check constraint for annotation type
  await db.schema
    .alterTable('search_annotations')
    .addCheckConstraint('check_annotation_type', 
      sql`annotation_type IN ('highlight', 'note', 'bookmark', 'flag', 'question', 'suggestion')`
    )
    .execute();

  // Create strategic indexes for optimal performance
  console.log('🔍 Creating collaborative search indexes...');

  // Collaborative search sessions indexes
  await db.schema
    .createIndex('idx_collab_search_sessions_workspace')
    .on('collaborative_search_sessions')
    .columns(['workspace_id', 'is_active'])
    .execute();

  await db.schema
    .createIndex('idx_collab_search_sessions_collaboration')
    .on('collaborative_search_sessions')
    .columns(['collaboration_session_id', 'is_active'])
    .execute();

  await db.schema
    .createIndex('idx_collab_search_sessions_created_by')
    .on('collaborative_search_sessions')
    .columns(['created_by', 'created_at'])
    .execute();

  await db.schema
    .createIndex('idx_collab_search_sessions_persistent')
    .on('collaborative_search_sessions')
    .columns(['is_persistent', 'updated_at'])
    .execute();

  // Search session participants indexes
  await db.schema
    .createIndex('idx_search_participants_session_active')
    .on('search_session_participants')
    .columns(['search_session_id', 'is_active'])
    .execute();

  await db.schema
    .createIndex('idx_search_participants_user_role')
    .on('search_session_participants')
    .columns(['user_id', 'role'])
    .execute();

  await db.schema
    .createIndex('idx_search_participants_last_search')
    .on('search_session_participants')
    .columns(['last_search_at'])
    .execute();

  // Shared search state indexes
  await db.schema
    .createIndex('idx_shared_search_state_session_key')
    .on('shared_search_state')
    .columns(['search_session_id', 'state_key'])
    .execute();

  await db.schema
    .createIndex('idx_shared_search_state_modified')
    .on('shared_search_state')
    .columns(['last_modified_at', 'last_modified_by'])
    .execute();

  await db.schema
    .createIndex('idx_shared_search_state_version')
    .on('shared_search_state')
    .columns(['search_session_id', 'state_key', 'version'])
    .execute();

  // Collaborative search events indexes (critical for real-time performance)
  await db.schema
    .createIndex('idx_collab_search_events_session_seq')
    .on('collaborative_search_events')
    .columns(['search_session_id', 'sequence_number'])
    .execute();

  await db.schema
    .createIndex('idx_collab_search_events_type_created')
    .on('collaborative_search_events')
    .columns(['search_event_type', 'created_at'])
    .execute();

  await db.schema
    .createIndex('idx_collab_search_events_user_session')
    .on('collaborative_search_events')
    .columns(['user_id', 'search_session_id', 'created_at'])
    .execute();

  await db.schema
    .createIndex('idx_collab_search_events_debounce')
    .on('collaborative_search_events')
    .columns(['debounce_group_id', 'is_debounced'])
    .execute();

  // Search annotations indexes
  await db.schema
    .createIndex('idx_search_annotations_session_type')
    .on('search_annotations')
    .columns(['search_session_id', 'annotation_type'])
    .execute();

  await db.schema
    .createIndex('idx_search_annotations_result')
    .on('search_annotations')
    .columns(['result_id', 'result_type'])
    .execute();

  await db.schema
    .createIndex('idx_search_annotations_user_created')
    .on('search_annotations')
    .columns(['user_id', 'created_at'])
    .execute();

  await db.schema
    .createIndex('idx_search_annotations_shared_resolved')
    .on('search_annotations')
    .columns(['is_shared', 'is_resolved'])
    .execute();

  // GIN indexes for JSONB columns
  await db.schema
    .createIndex('idx_collab_search_sessions_search_settings_gin')
    .on('collaborative_search_sessions')
    .expression(sql`search_settings`)
    .using('gin')
    .execute();

  await db.schema
    .createIndex('idx_collab_search_sessions_current_state_gin')
    .on('collaborative_search_sessions')
    .expression(sql`current_search_state`)
    .using('gin')
    .execute();

  await db.schema
    .createIndex('idx_search_participants_active_filters_gin')
    .on('search_session_participants')
    .expression(sql`active_filters`)
    .using('gin')
    .execute();

  await db.schema
    .createIndex('idx_shared_search_state_value_gin')
    .on('shared_search_state')
    .expression(sql`state_value`)
    .using('gin')
    .execute();

  await db.schema
    .createIndex('idx_collab_search_events_data_gin')
    .on('collaborative_search_events')
    .expression(sql`search_event_data`)
    .using('gin')
    .execute();

  await db.schema
    .createIndex('idx_search_annotations_data_gin')
    .on('search_annotations')
    .expression(sql`annotation_data`)
    .using('gin')
    .execute();

  // Partial indexes for active and shared content
  await db.schema
    .createIndex('idx_active_search_sessions_only')
    .on('collaborative_search_sessions')
    .columns(['created_at', 'workspace_id'])
    .where('is_active', '=', true)
    .execute();

  await db.schema
    .createIndex('idx_shared_annotations_only')
    .on('search_annotations')
    .columns(['search_session_id', 'created_at'])
    .where('is_shared', '=', true)
    .execute();

  console.log('✅ Migration 028: Live search collaboration infrastructure created successfully');
  console.log('🔍 Collaborative search system ready for real-time multi-user search experiences');
  console.log('🚀 Work Item 4.1.2: Live Search Collaboration Service foundation complete');
}

export async function down(db: Kysely<any>): Promise<void> {
  console.log('🔄 Migration 028: Dropping live search collaboration infrastructure...');

  // Drop indexes first
  const indexes = [
    'idx_shared_annotations_only',
    'idx_active_search_sessions_only',
    'idx_search_annotations_data_gin',
    'idx_collab_search_events_data_gin',
    'idx_shared_search_state_value_gin',
    'idx_search_participants_active_filters_gin',
    'idx_collab_search_sessions_current_state_gin',
    'idx_collab_search_sessions_search_settings_gin',
    'idx_search_annotations_shared_resolved',
    'idx_search_annotations_user_created',
    'idx_search_annotations_result',
    'idx_search_annotations_session_type',
    'idx_collab_search_events_debounce',
    'idx_collab_search_events_user_session',
    'idx_collab_search_events_type_created',
    'idx_collab_search_events_session_seq',
    'idx_shared_search_state_version',
    'idx_shared_search_state_modified',
    'idx_shared_search_state_session_key',
    'idx_search_participants_last_search',
    'idx_search_participants_user_role',
    'idx_search_participants_session_active',
    'idx_collab_search_sessions_persistent',
    'idx_collab_search_sessions_created_by',
    'idx_collab_search_sessions_collaboration',
    'idx_collab_search_sessions_workspace'
  ];

  for (const index of indexes) {
    await db.schema.dropIndex(index).ifExists().execute();
  }

  // Drop tables in reverse dependency order
  await db.schema.dropTable('search_annotations').ifExists().execute();
  await db.schema.dropTable('collaborative_search_events').ifExists().execute();
  await db.schema.dropTable('shared_search_state').ifExists().execute();
  await db.schema.dropTable('search_session_participants').ifExists().execute();
  await db.schema.dropTable('collaborative_search_sessions').ifExists().execute();

  console.log('✅ Migration 028: Live search collaboration infrastructure dropped successfully');
}