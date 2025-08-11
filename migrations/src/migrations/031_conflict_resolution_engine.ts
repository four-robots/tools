/**
 * Migration 031: Conflict Resolution Engine
 * 
 * Implements comprehensive conflict resolution infrastructure including:
 * - Conflict detection with vector clocks and content versioning
 * - Merge strategy execution with operational transformation support
 * - Resolution sessions with voting and escalation mechanisms
 * - AI-assisted semantic conflict analysis and resolution
 * - Rule-based automatic resolution with customizable policies
 * - Comprehensive audit trails and analytics for resolution effectiveness
 * 
 * This enables intelligent handling of concurrent modifications in collaborative
 * environments with sophisticated merge algorithms and user-friendly resolution
 * interfaces across all MCP Tools collaboration features.
 */

import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  console.log('🚀 Migration 031: Creating conflict resolution engine infrastructure...');

  // Content Versions - Track all content versions with vector clocks
  await db.schema
    .createTable('content_versions')
    .addColumn('id', 'uuid', (col) => 
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn('content_id', 'uuid', (col) => col.notNull()) // Reference to original content
    .addColumn('content', 'text', (col) => col.notNull())
    .addColumn('content_hash', 'varchar(64)', (col) => col.notNull()) // SHA-256 hash
    .addColumn('parent_version_id', 'uuid') // For tracking version lineage
    
    // Vector clock for conflict detection
    .addColumn('vector_clock_user_id', 'uuid', (col) => col.notNull())
    .addColumn('vector_clock_timestamp', 'timestamp with time zone', (col) => col.notNull())
    .addColumn('vector_clock_logical', 'bigint', (col) => col.notNull().defaultTo(0))
    .addColumn('vector_clock_session_id', 'uuid', (col) => col.notNull())
    .addColumn('vector_clock_node_id', 'varchar(100)') // For distributed systems
    
    // Metadata
    .addColumn('user_id', 'uuid', (col) => col.notNull())
    .addColumn('session_id', 'uuid', (col) => col.notNull())
    .addColumn('created_at', 'timestamp with time zone', (col) => 
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    .addColumn('content_type', 'varchar(50)', (col) => col.notNull()) // 'search_query', 'filter_definition', 'annotation', 'document', 'structured_data'
    
    // Conflict resolution context
    .addColumn('is_conflict_resolution', 'boolean', (col) => col.defaultTo(false))
    .addColumn('original_conflict_id', 'uuid') // Reference to conflict that created this version
    .addColumn('merge_strategy', 'varchar(50)') // Strategy used to create this version
    .execute();

  // Add foreign key constraints for content_versions
  await db.schema
    .alterTable('content_versions')
    .addForeignKeyConstraint('fk_content_version_user', ['user_id'], 'users', ['id'], (constraint) =>
      constraint.onDelete('cascade')
    )
    .execute();

  await db.schema
    .alterTable('content_versions')
    .addForeignKeyConstraint('fk_content_version_session', ['session_id'], 'collaboration_sessions', ['id'], (constraint) =>
      constraint.onDelete('cascade')
    )
    .execute();

  await db.schema
    .alterTable('content_versions')
    .addForeignKeyConstraint('fk_content_version_parent', ['parent_version_id'], 'content_versions', ['id'], (constraint) =>
      constraint.onDelete('set null')
    )
    .execute();

  // Add check constraints for content_versions
  await db.schema
    .alterTable('content_versions')
    .addCheckConstraint('check_content_type', 
      sql`content_type IN ('search_query', 'filter_definition', 'annotation', 'document', 'structured_data')`
    )
    .execute();

  await db.schema
    .alterTable('content_versions')
    .addCheckConstraint('check_content_hash_format', 
      sql`LENGTH(content_hash) = 64 AND content_hash ~ '^[a-f0-9]+$'`
    )
    .execute();

  await db.schema
    .alterTable('content_versions')
    .addCheckConstraint('check_merge_strategy', 
      sql`merge_strategy IS NULL OR merge_strategy IN ('three_way_merge', 'operational_transformation', 'last_writer_wins', 'user_priority_based', 'ai_assisted_merge', 'manual_resolution', 'custom_rule_based')`
    )
    .execute();

  // Conflict Detections - Track all detected conflicts
  await db.schema
    .createTable('conflict_detections')
    .addColumn('id', 'uuid', (col) => 
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn('conflict_type', 'varchar(50)', (col) => col.notNull())
    .addColumn('content_id', 'uuid', (col) => col.notNull())
    .addColumn('session_id', 'uuid', (col) => col.notNull())
    
    // Conflicting versions
    .addColumn('base_version_id', 'uuid', (col) => col.notNull())
    .addColumn('version_a_id', 'uuid', (col) => col.notNull())
    .addColumn('version_b_id', 'uuid', (col) => col.notNull())
    .addColumn('additional_version_ids', 'jsonb', (col) => col.defaultTo(sql`'[]'`)) // For multi-way conflicts
    
    // Conflict analysis
    .addColumn('detected_at', 'timestamp with time zone', (col) => 
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    .addColumn('conflict_hash', 'varchar(100)', (col) => col.notNull()) // Unique identifier
    .addColumn('severity', 'varchar(20)', (col) => col.notNull().defaultTo('medium'))
    .addColumn('complexity_score', 'decimal(3,2)', (col) => col.notNull().defaultTo(0.5)) // 0-1 scale
    
    // Affected regions
    .addColumn('conflict_regions', 'jsonb', (col) => col.defaultTo(sql`'[]'`))
    
    // Participants
    .addColumn('involved_users', 'jsonb', (col) => col.notNull()) // Array of user IDs
    
    // Auto-resolution potential
    .addColumn('can_auto_resolve', 'boolean', (col) => col.defaultTo(false))
    .addColumn('recommended_strategy', 'varchar(50)', (col) => col.notNull())
    .addColumn('confidence', 'decimal(3,2)', (col) => col.notNull().defaultTo(0.0))
    
    // Status tracking
    .addColumn('status', 'varchar(30)', (col) => col.notNull().defaultTo('detected'))
    .addColumn('resolution_deadline', 'timestamp with time zone')
    
    // Metadata and context
    .addColumn('metadata', 'jsonb', (col) => col.defaultTo(sql`'{}'`))
    .execute();

  // Add foreign key constraints for conflict_detections
  await db.schema
    .alterTable('conflict_detections')
    .addForeignKeyConstraint('fk_conflict_session', ['session_id'], 'collaboration_sessions', ['id'], (constraint) =>
      constraint.onDelete('cascade')
    )
    .execute();

  await db.schema
    .alterTable('conflict_detections')
    .addForeignKeyConstraint('fk_conflict_base_version', ['base_version_id'], 'content_versions', ['id'], (constraint) =>
      constraint.onDelete('cascade')
    )
    .execute();

  await db.schema
    .alterTable('conflict_detections')
    .addForeignKeyConstraint('fk_conflict_version_a', ['version_a_id'], 'content_versions', ['id'], (constraint) =>
      constraint.onDelete('cascade')
    )
    .execute();

  await db.schema
    .alterTable('conflict_detections')
    .addForeignKeyConstraint('fk_conflict_version_b', ['version_b_id'], 'content_versions', ['id'], (constraint) =>
      constraint.onDelete('cascade')
    )
    .execute();

  // Add check constraints for conflict_detections
  await db.schema
    .alterTable('conflict_detections')
    .addCheckConstraint('check_conflict_type', 
      sql`conflict_type IN ('content_modification', 'search_query_change', 'filter_modification', 'annotation_overlap', 'cursor_collision', 'state_divergence', 'semantic_conflict', 'structural_conflict')`
    )
    .execute();

  await db.schema
    .alterTable('conflict_detections')
    .addCheckConstraint('check_severity', 
      sql`severity IN ('low', 'medium', 'high', 'critical')`
    )
    .execute();

  await db.schema
    .alterTable('conflict_detections')
    .addCheckConstraint('check_recommended_strategy', 
      sql`recommended_strategy IN ('three_way_merge', 'operational_transformation', 'last_writer_wins', 'user_priority_based', 'ai_assisted_merge', 'manual_resolution', 'custom_rule_based')`
    )
    .execute();

  await db.schema
    .alterTable('conflict_detections')
    .addCheckConstraint('check_conflict_status', 
      sql`status IN ('detected', 'analyzing', 'auto_resolving', 'awaiting_user_input', 'resolved_automatically', 'resolved_manually', 'resolution_failed', 'escalated')`
    )
    .execute();

  await db.schema
    .alterTable('conflict_detections')
    .addCheckConstraint('check_complexity_score_range', 
      sql`complexity_score >= 0 AND complexity_score <= 1`
    )
    .execute();

  await db.schema
    .alterTable('conflict_detections')
    .addCheckConstraint('check_confidence_range', 
      sql`confidence >= 0 AND confidence <= 1`
    )
    .execute();

  // Operational Transform Operations - Track all OT operations
  await db.schema
    .createTable('operational_transform_operations')
    .addColumn('id', 'uuid', (col) => 
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn('operation_type', 'varchar(20)', (col) => col.notNull()) // 'insert', 'delete', 'retain', 'replace', 'move'
    .addColumn('position', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('content', 'text') // Content for insert/replace operations
    .addColumn('length', 'integer') // Length for delete/retain operations
    .addColumn('attributes', 'jsonb', (col) => col.defaultTo(sql`'{}'`))
    
    // Context for semantic understanding
    .addColumn('context_before', 'text')
    .addColumn('context_after', 'text')
    .addColumn('semantic_type', 'varchar(50)') // 'text', 'query_term', 'filter_condition', 'annotation_tag', 'structural_element'
    
    // Authorship and context
    .addColumn('user_id', 'uuid', (col) => col.notNull())
    .addColumn('timestamp', 'timestamp with time zone', (col) => 
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    .addColumn('session_id', 'uuid', (col) => col.notNull())
    
    // Operation metadata
    .addColumn('operation_sequence', 'bigint', (col) => col.notNull()) // For ordering operations
    .addColumn('is_transformed', 'boolean', (col) => col.defaultTo(false)) // Whether this operation has been transformed
    .addColumn('original_operation_id', 'uuid') // Reference to original operation before transformation
    .execute();

  // Add foreign key constraints for operational_transform_operations
  await db.schema
    .alterTable('operational_transform_operations')
    .addForeignKeyConstraint('fk_operation_user', ['user_id'], 'users', ['id'], (constraint) =>
      constraint.onDelete('cascade')
    )
    .execute();

  await db.schema
    .alterTable('operational_transform_operations')
    .addForeignKeyConstraint('fk_operation_session', ['session_id'], 'collaboration_sessions', ['id'], (constraint) =>
      constraint.onDelete('cascade')
    )
    .execute();

  await db.schema
    .alterTable('operational_transform_operations')
    .addForeignKeyConstraint('fk_operation_original', ['original_operation_id'], 'operational_transform_operations', ['id'], (constraint) =>
      constraint.onDelete('set null')
    )
    .execute();

  // Add check constraints for operational_transform_operations
  await db.schema
    .alterTable('operational_transform_operations')
    .addCheckConstraint('check_operation_type', 
      sql`operation_type IN ('insert', 'delete', 'retain', 'replace', 'move')`
    )
    .execute();

  await db.schema
    .alterTable('operational_transform_operations')
    .addCheckConstraint('check_semantic_type', 
      sql`semantic_type IS NULL OR semantic_type IN ('text', 'query_term', 'filter_condition', 'annotation_tag', 'structural_element')`
    )
    .execute();

  await db.schema
    .alterTable('operational_transform_operations')
    .addCheckConstraint('check_position_non_negative', 
      sql`position >= 0`
    )
    .execute();

  // Merge Results - Track results of merge operations
  await db.schema
    .createTable('merge_results')
    .addColumn('id', 'uuid', (col) => 
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn('conflict_id', 'uuid', (col) => col.notNull())
    .addColumn('strategy', 'varchar(50)', (col) => col.notNull())
    
    // Result content
    .addColumn('merged_content', 'text', (col) => col.notNull())
    .addColumn('merged_content_hash', 'varchar(64)', (col) => col.notNull())
    .addColumn('merged_version_id', 'uuid', (col) => col.notNull())
    
    // Merge statistics
    .addColumn('successful_merges', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('conflicting_regions', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('manual_interventions', 'integer', (col) => col.notNull().defaultTo(0))
    
    // Quality metrics
    .addColumn('confidence_score', 'decimal(3,2)', (col) => col.notNull().defaultTo(0.0))
    .addColumn('semantic_coherence', 'decimal(3,2)') // Optional quality metric
    .addColumn('syntactic_correctness', 'decimal(3,2)') // Optional quality metric
    
    // Operation tracking
    .addColumn('applied_operations', 'jsonb', (col) => col.defaultTo(sql`'[]'`)) // Array of operation IDs
    .addColumn('rejected_operations', 'jsonb', (col) => col.defaultTo(sql`'[]'`)) // Array of operation IDs
    
    // Timestamps
    .addColumn('started_at', 'timestamp with time zone', (col) => col.notNull())
    .addColumn('completed_at', 'timestamp with time zone', (col) => 
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    
    // User review requirements
    .addColumn('requires_user_review', 'boolean', (col) => col.defaultTo(false))
    .addColumn('user_review_instructions', 'text')
    .execute();

  // Add foreign key constraints for merge_results
  await db.schema
    .alterTable('merge_results')
    .addForeignKeyConstraint('fk_merge_conflict', ['conflict_id'], 'conflict_detections', ['id'], (constraint) =>
      constraint.onDelete('cascade')
    )
    .execute();

  await db.schema
    .alterTable('merge_results')
    .addForeignKeyConstraint('fk_merge_version', ['merged_version_id'], 'content_versions', ['id'], (constraint) =>
      constraint.onDelete('cascade')
    )
    .execute();

  // Add check constraints for merge_results
  await db.schema
    .alterTable('merge_results')
    .addCheckConstraint('check_merge_strategy', 
      sql`strategy IN ('three_way_merge', 'operational_transformation', 'last_writer_wins', 'user_priority_based', 'ai_assisted_merge', 'manual_resolution', 'custom_rule_based')`
    )
    .execute();

  await db.schema
    .alterTable('merge_results')
    .addCheckConstraint('check_merge_confidence_range', 
      sql`confidence_score >= 0 AND confidence_score <= 1`
    )
    .execute();

  await db.schema
    .alterTable('merge_results')
    .addCheckConstraint('check_quality_metrics_range', 
      sql`(semantic_coherence IS NULL OR (semantic_coherence >= 0 AND semantic_coherence <= 1)) AND (syntactic_correctness IS NULL OR (syntactic_correctness >= 0 AND syntactic_correctness <= 1))`
    )
    .execute();

  // Conflict Resolution Sessions - Interactive resolution sessions
  await db.schema
    .createTable('conflict_resolution_sessions')
    .addColumn('id', 'uuid', (col) => 
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn('conflict_id', 'uuid', (col) => col.notNull())
    .addColumn('collaboration_session_id', 'uuid', (col) => col.notNull())
    
    // Participants
    .addColumn('moderator_id', 'uuid', (col) => col.notNull())
    .addColumn('participant_ids', 'jsonb', (col) => col.notNull()) // Array of participant user IDs
    .addColumn('observer_ids', 'jsonb', (col) => col.defaultTo(sql`'[]'`)) // Array of observer user IDs
    
    // Session lifecycle
    .addColumn('created_at', 'timestamp with time zone', (col) => 
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    .addColumn('started_at', 'timestamp with time zone')
    .addColumn('completed_at', 'timestamp with time zone')
    .addColumn('expires_at', 'timestamp with time zone')
    
    // Resolution state
    .addColumn('status', 'varchar(30)', (col) => col.notNull().defaultTo('created'))
    .addColumn('current_step', 'varchar(50)', (col) => col.notNull().defaultTo('analysis'))
    
    // Resolution data
    .addColumn('proposed_solutions', 'jsonb', (col) => col.defaultTo(sql`'[]'`)) // Array of solution proposals
    
    // Final decision
    .addColumn('final_decision', 'varchar(30)') // 'accept_mine', 'accept_theirs', 'accept_merged', 'accept_custom', 'reject_all', 'escalate'
    .addColumn('selected_solution_id', 'uuid')
    
    // Audit trail
    .addColumn('events', 'jsonb', (col) => col.defaultTo(sql`'[]'`)) // Array of session events
    
    // Configuration
    .addColumn('settings', 'jsonb', (col) => col.defaultTo(sql`'{"allowVoting": true, "requireUnanimous": false, "votingTimeoutMs": 300000, "autoResolveAfterTimeout": true, "allowExternalModerators": false}'`))
    .execute();

  // Add foreign key constraints for conflict_resolution_sessions
  await db.schema
    .alterTable('conflict_resolution_sessions')
    .addForeignKeyConstraint('fk_resolution_conflict', ['conflict_id'], 'conflict_detections', ['id'], (constraint) =>
      constraint.onDelete('cascade')
    )
    .execute();

  await db.schema
    .alterTable('conflict_resolution_sessions')
    .addForeignKeyConstraint('fk_resolution_collaboration_session', ['collaboration_session_id'], 'collaboration_sessions', ['id'], (constraint) =>
      constraint.onDelete('cascade')
    )
    .execute();

  await db.schema
    .alterTable('conflict_resolution_sessions')
    .addForeignKeyConstraint('fk_resolution_moderator', ['moderator_id'], 'users', ['id'], (constraint) =>
      constraint.onDelete('cascade')
    )
    .execute();

  // Add check constraints for conflict_resolution_sessions
  await db.schema
    .alterTable('conflict_resolution_sessions')
    .addCheckConstraint('check_resolution_status', 
      sql`status IN ('created', 'in_progress', 'voting', 'completed', 'expired', 'escalated')`
    )
    .execute();

  await db.schema
    .alterTable('conflict_resolution_sessions')
    .addCheckConstraint('check_resolution_step', 
      sql`current_step IN ('analysis', 'strategy_selection', 'manual_resolution', 'review', 'voting', 'finalization')`
    )
    .execute();

  await db.schema
    .alterTable('conflict_resolution_sessions')
    .addCheckConstraint('check_final_decision', 
      sql`final_decision IS NULL OR final_decision IN ('accept_mine', 'accept_theirs', 'accept_merged', 'accept_custom', 'reject_all', 'escalate')`
    )
    .execute();

  // Conflict Resolution Rules - Configurable rules for automatic resolution
  await db.schema
    .createTable('conflict_resolution_rules')
    .addColumn('id', 'uuid', (col) => 
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn('name', 'varchar(255)', (col) => col.notNull())
    .addColumn('description', 'text', (col) => col.notNull())
    
    // Rule scope
    .addColumn('workspace_id', 'uuid') // Workspace-specific rule
    .addColumn('session_types', 'jsonb', (col) => col.defaultTo(sql`'[]'`)) // Applicable session types
    .addColumn('content_types', 'jsonb', (col) => col.defaultTo(sql`'[]'`)) // Applicable content types
    
    // Rule conditions (stored as JSON for flexibility)
    .addColumn('conditions', 'jsonb', (col) => col.notNull())
    
    // Resolution configuration
    .addColumn('resolution', 'jsonb', (col) => col.notNull())
    
    // Rule metadata
    .addColumn('created_by', 'uuid', (col) => col.notNull())
    .addColumn('created_at', 'timestamp with time zone', (col) => 
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    .addColumn('updated_at', 'timestamp with time zone', (col) => 
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    .addColumn('is_active', 'boolean', (col) => col.defaultTo(true))
    .addColumn('usage_count', 'integer', (col) => col.defaultTo(0))
    .addColumn('success_rate', 'decimal(3,2)', (col) => col.defaultTo(0))
    .execute();

  // Add foreign key constraints for conflict_resolution_rules
  await db.schema
    .alterTable('conflict_resolution_rules')
    .addForeignKeyConstraint('fk_rule_creator', ['created_by'], 'users', ['id'], (constraint) =>
      constraint.onDelete('cascade')
    )
    .execute();

  await db.schema
    .alterTable('conflict_resolution_rules')
    .addCheckConstraint('check_success_rate_range', 
      sql`success_rate >= 0 AND success_rate <= 1`
    )
    .execute();

  // AI Resolution Context - Store AI analysis data
  await db.schema
    .createTable('ai_resolution_contexts')
    .addColumn('id', 'uuid', (col) => 
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn('conflict_id', 'uuid', (col) => col.notNull())
    
    // Content analysis
    .addColumn('content_type', 'varchar(50)', (col) => col.notNull())
    .addColumn('semantic_context', 'jsonb', (col) => col.defaultTo(sql`'{}'`))
    .addColumn('syntactic_analysis', 'jsonb', (col) => col.defaultTo(sql`'{}'`))
    
    // Historical data
    .addColumn('similar_conflicts', 'jsonb', (col) => col.defaultTo(sql`'[]'`))
    
    // User preferences
    .addColumn('user_preferences', 'jsonb', (col) => col.defaultTo(sql`'[]'`))
    
    // LLM interactions
    .addColumn('llm_requests', 'jsonb', (col) => col.defaultTo(sql`'[]'`))
    
    // Analysis timestamps
    .addColumn('created_at', 'timestamp with time zone', (col) => 
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    .addColumn('updated_at', 'timestamp with time zone', (col) => 
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    .execute();

  // Add foreign key constraints for ai_resolution_contexts
  await db.schema
    .alterTable('ai_resolution_contexts')
    .addForeignKeyConstraint('fk_ai_context_conflict', ['conflict_id'], 'conflict_detections', ['id'], (constraint) =>
      constraint.onDelete('cascade')
    )
    .execute();

  await db.schema
    .alterTable('ai_resolution_contexts')
    .addCheckConstraint('check_ai_content_type', 
      sql`content_type IN ('search_query', 'filter_definition', 'annotation', 'document', 'structured_data')`
    )
    .execute();

  // Create strategic indexes for optimal performance
  console.log('🔍 Creating conflict resolution engine indexes...');

  // Content versions indexes
  await db.schema
    .createIndex('idx_content_versions_content_id')
    .on('content_versions')
    .columns(['content_id', 'created_at'])
    .execute();

  await db.schema
    .createIndex('idx_content_versions_hash')
    .on('content_versions')
    .columns(['content_hash'])
    .execute();

  await db.schema
    .createIndex('idx_content_versions_vector_clock')
    .on('content_versions')
    .columns(['vector_clock_session_id', 'vector_clock_timestamp'])
    .execute();

  await db.schema
    .createIndex('idx_content_versions_user_session')
    .on('content_versions')
    .columns(['user_id', 'session_id', 'created_at'])
    .execute();

  // Conflict detections indexes
  await db.schema
    .createIndex('idx_conflict_detections_session_status')
    .on('conflict_detections')
    .columns(['session_id', 'status'])
    .execute();

  await db.schema
    .createIndex('idx_conflict_detections_content_type')
    .on('conflict_detections')
    .columns(['content_id', 'conflict_type'])
    .execute();

  await db.schema
    .createIndex('idx_conflict_detections_severity')
    .on('conflict_detections')
    .columns(['severity', 'detected_at'])
    .execute();

  await db.schema
    .createIndex('idx_conflict_detections_hash')
    .on('conflict_detections')
    .columns(['conflict_hash'])
    .execute();

  await db.schema
    .createIndex('idx_conflict_detections_auto_resolve')
    .on('conflict_detections')
    .columns(['can_auto_resolve', 'confidence'])
    .where('can_auto_resolve', '=', true)
    .execute();

  // Operational transform operations indexes
  await db.schema
    .createIndex('idx_operations_session_sequence')
    .on('operational_transform_operations')
    .columns(['session_id', 'operation_sequence'])
    .execute();

  await db.schema
    .createIndex('idx_operations_user_timestamp')
    .on('operational_transform_operations')
    .columns(['user_id', 'timestamp'])
    .execute();

  await db.schema
    .createIndex('idx_operations_type_position')
    .on('operational_transform_operations')
    .columns(['operation_type', 'position'])
    .execute();

  // Merge results indexes
  await db.schema
    .createIndex('idx_merge_results_conflict')
    .on('merge_results')
    .columns(['conflict_id'])
    .execute();

  await db.schema
    .createIndex('idx_merge_results_strategy_quality')
    .on('merge_results')
    .columns(['strategy', 'confidence_score'])
    .execute();

  await db.schema
    .createIndex('idx_merge_results_completion')
    .on('merge_results')
    .columns(['completed_at'])
    .execute();

  // Conflict resolution sessions indexes
  await db.schema
    .createIndex('idx_resolution_sessions_conflict')
    .on('conflict_resolution_sessions')
    .columns(['conflict_id'])
    .execute();

  await db.schema
    .createIndex('idx_resolution_sessions_status')
    .on('conflict_resolution_sessions')
    .columns(['status', 'created_at'])
    .execute();

  await db.schema
    .createIndex('idx_resolution_sessions_moderator')
    .on('conflict_resolution_sessions')
    .columns(['moderator_id', 'status'])
    .execute();

  await db.schema
    .createIndex('idx_resolution_sessions_expiry')
    .on('conflict_resolution_sessions')
    .columns(['expires_at'])
    .where('expires_at', 'is not', null)
    .execute();

  // Conflict resolution rules indexes
  await db.schema
    .createIndex('idx_resolution_rules_workspace_active')
    .on('conflict_resolution_rules')
    .columns(['workspace_id', 'is_active'])
    .execute();

  await db.schema
    .createIndex('idx_resolution_rules_success_rate')
    .on('conflict_resolution_rules')
    .columns(['success_rate'])
    .where('is_active', '=', true)
    .execute();

  await db.schema
    .createIndex('idx_resolution_rules_usage')
    .on('conflict_resolution_rules')
    .columns(['usage_count'])
    .where('is_active', '=', true)
    .execute();

  // AI resolution contexts indexes
  await db.schema
    .createIndex('idx_ai_contexts_conflict')
    .on('ai_resolution_contexts')
    .columns(['conflict_id'])
    .execute();

  await db.schema
    .createIndex('idx_ai_contexts_content_type')
    .on('ai_resolution_contexts')
    .columns(['content_type', 'created_at'])
    .execute();

  // GIN indexes for JSONB columns
  await db.schema
    .createIndex('idx_conflict_detections_regions_gin')
    .on('conflict_detections')
    .expression(sql`conflict_regions`)
    .using('gin')
    .execute();

  await db.schema
    .createIndex('idx_conflict_detections_users_gin')
    .on('conflict_detections')
    .expression(sql`involved_users`)
    .using('gin')
    .execute();

  await db.schema
    .createIndex('idx_resolution_sessions_participants_gin')
    .on('conflict_resolution_sessions')
    .expression(sql`participant_ids`)
    .using('gin')
    .execute();

  await db.schema
    .createIndex('idx_resolution_sessions_solutions_gin')
    .on('conflict_resolution_sessions')
    .expression(sql`proposed_solutions`)
    .using('gin')
    .execute();

  await db.schema
    .createIndex('idx_resolution_rules_conditions_gin')
    .on('conflict_resolution_rules')
    .expression(sql`conditions`)
    .using('gin')
    .execute();

  await db.schema
    .createIndex('idx_ai_contexts_semantic_gin')
    .on('ai_resolution_contexts')
    .expression(sql`semantic_context`)
    .using('gin')
    .execute();

  // Create partial indexes for active and high-priority conflicts
  await db.schema
    .createIndex('idx_active_conflicts_only')
    .on('conflict_detections')
    .columns(['detected_at', 'severity'])
    .where(sql`status IN ('detected', 'analyzing', 'awaiting_user_input')`)
    .execute();

  await db.schema
    .createIndex('idx_high_severity_conflicts_only')
    .on('conflict_detections')
    .columns(['detected_at'])
    .where(sql`severity IN ('high', 'critical')`)
    .execute();

  await db.schema
    .createIndex('idx_auto_resolvable_conflicts_only')
    .on('conflict_detections')
    .columns(['confidence', 'detected_at'])
    .where('can_auto_resolve', '=', true)
    .execute();

  console.log('✅ Migration 031: Conflict resolution engine infrastructure created successfully');
  console.log('🔧 Intelligent merge strategies and operational transformation ready');
  console.log('🤖 AI-assisted semantic conflict resolution infrastructure established');
  console.log('👥 Interactive resolution sessions with voting mechanisms configured');
  console.log('📊 Comprehensive analytics and audit trails for resolution effectiveness');
}

export async function down(db: Kysely<any>): Promise<void> {
  console.log('🔄 Migration 031: Dropping conflict resolution engine infrastructure...');

  // Drop indexes first
  const indexes = [
    'idx_auto_resolvable_conflicts_only',
    'idx_high_severity_conflicts_only',
    'idx_active_conflicts_only',
    'idx_ai_contexts_semantic_gin',
    'idx_resolution_rules_conditions_gin',
    'idx_resolution_sessions_solutions_gin',
    'idx_resolution_sessions_participants_gin',
    'idx_conflict_detections_users_gin',
    'idx_conflict_detections_regions_gin',
    'idx_ai_contexts_content_type',
    'idx_ai_contexts_conflict',
    'idx_resolution_rules_usage',
    'idx_resolution_rules_success_rate',
    'idx_resolution_rules_workspace_active',
    'idx_resolution_sessions_expiry',
    'idx_resolution_sessions_moderator',
    'idx_resolution_sessions_status',
    'idx_resolution_sessions_conflict',
    'idx_merge_results_completion',
    'idx_merge_results_strategy_quality',
    'idx_merge_results_conflict',
    'idx_operations_type_position',
    'idx_operations_user_timestamp',
    'idx_operations_session_sequence',
    'idx_conflict_detections_auto_resolve',
    'idx_conflict_detections_hash',
    'idx_conflict_detections_severity',
    'idx_conflict_detections_content_type',
    'idx_conflict_detections_session_status',
    'idx_content_versions_user_session',
    'idx_content_versions_vector_clock',
    'idx_content_versions_hash',
    'idx_content_versions_content_id'
  ];

  for (const index of indexes) {
    await db.schema.dropIndex(index).ifExists().execute();
  }

  // Drop tables in reverse dependency order
  await db.schema.dropTable('ai_resolution_contexts').ifExists().execute();
  await db.schema.dropTable('conflict_resolution_rules').ifExists().execute();
  await db.schema.dropTable('conflict_resolution_sessions').ifExists().execute();
  await db.schema.dropTable('merge_results').ifExists().execute();
  await db.schema.dropTable('operational_transform_operations').ifExists().execute();
  await db.schema.dropTable('conflict_detections').ifExists().execute();
  await db.schema.dropTable('content_versions').ifExists().execute();

  console.log('✅ Migration 031: Conflict resolution engine infrastructure dropped successfully');
}