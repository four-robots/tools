import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // User behavior events tracking
  await db.schema
    .createTable('user_behavior_events')
    .addColumn('id', 'uuid', (col) => 
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn('user_id', 'uuid', (col) => col.notNull())
    .addColumn('session_id', 'uuid', (col) => col.notNull())
    
    // Event details
    .addColumn('event_type', 'varchar(100)', (col) => col.notNull()) // search, click, view, save, share, filter, etc.
    .addColumn('event_category', 'varchar(50)', (col) => col.notNull()) // search, navigation, interaction, preference
    .addColumn('event_action', 'varchar(100)', (col) => col.notNull()) // query_submitted, result_clicked, filter_applied
    
    // Context data
    .addColumn('search_query', 'text')
    .addColumn('search_context', 'jsonb') // Filters, facets, sorting applied
    .addColumn('result_data', 'jsonb') // Clicked results, saved items, etc.
    .addColumn('page_context', 'jsonb') // Current page, navigation path
    
    // Timing and sequence
    .addColumn('event_timestamp', 'timestamp with time zone', (col) => 
      col.defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    .addColumn('session_sequence', 'integer') // Order within session
    .addColumn('page_sequence', 'integer') // Order within page
    
    // Technical context
    .addColumn('user_agent', 'text')
    .addColumn('ip_address', 'inet')
    .addColumn('referrer', 'text')
    .addColumn('device_info', 'jsonb') // Browser, OS, screen size, etc.
    
    // Performance metrics
    .addColumn('response_time_ms', 'integer')
    .addColumn('search_duration_ms', 'integer')
    .addColumn('interaction_duration_ms', 'integer')
    
    // Metadata
    .addColumn('created_at', 'timestamp with time zone', (col) => 
      col.defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    .execute();

  // Add foreign key constraint for user_behavior_events
  await db.schema
    .alterTable('user_behavior_events')
    .addForeignKeyConstraint('fk_behavior_user', ['user_id'], 'users', ['id'], (constraint) =>
      constraint.onDelete('cascade')
    )
    .execute();

  // User search patterns and preferences learned over time
  await db.schema
    .createTable('user_search_patterns')
    .addColumn('id', 'uuid', (col) => 
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn('user_id', 'uuid', (col) => col.notNull())
    
    // Pattern identification
    .addColumn('pattern_type', 'varchar(100)', (col) => col.notNull()) // query_style, topic_preference, time_pattern, etc.
    .addColumn('pattern_name', 'varchar(255)', (col) => col.notNull())
    .addColumn('pattern_description', 'text')
    
    // Pattern data
    .addColumn('pattern_data', 'jsonb', (col) => col.notNull()) // Specific pattern details and parameters
    .addColumn('confidence_score', 'decimal(3,2)') // 0.00 to 1.00 confidence in this pattern
    .addColumn('frequency_score', 'decimal(3,2)') // How frequently this pattern occurs
    
    // Statistics
    .addColumn('occurrences', 'integer', (col) => col.defaultTo(1))
    .addColumn('last_occurrence_at', 'timestamp with time zone', (col) => 
      col.defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    .addColumn('first_detected_at', 'timestamp with time zone', (col) => 
      col.defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    
    // Learning metadata
    .addColumn('model_version', 'varchar(50)')
    .addColumn('learning_algorithm', 'varchar(100)')
    .addColumn('training_data_size', 'integer')
    
    // Status
    .addColumn('is_active', 'boolean', (col) => col.defaultTo(true))
    .addColumn('is_significant', 'boolean', (col) => col.defaultTo(false)) // Statistically significant pattern
    
    .addColumn('created_at', 'timestamp with time zone', (col) => 
      col.defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    .addColumn('updated_at', 'timestamp with time zone', (col) => 
      col.defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    .execute();

  // Add constraints for user_search_patterns
  await db.schema
    .alterTable('user_search_patterns')
    .addForeignKeyConstraint('fk_pattern_user', ['user_id'], 'users', ['id'], (constraint) =>
      constraint.onDelete('cascade')
    )
    .execute();

  await db.schema
    .alterTable('user_search_patterns')
    .addCheckConstraint('check_confidence_range', sql`confidence_score >= 0.00 AND confidence_score <= 1.00`)
    .execute();

  await db.schema
    .alterTable('user_search_patterns')
    .addCheckConstraint('check_frequency_range', sql`frequency_score >= 0.00 AND frequency_score <= 1.00`)
    .execute();

  // User behavioral segments and classifications
  await db.schema
    .createTable('user_behavior_segments')
    .addColumn('id', 'uuid', (col) => 
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn('user_id', 'uuid', (col) => col.notNull())
    
    // Segment classification
    .addColumn('segment_type', 'varchar(100)', (col) => col.notNull()) // search_style, expertise_level, usage_pattern
    .addColumn('segment_name', 'varchar(255)', (col) => col.notNull())
    .addColumn('segment_description', 'text')
    
    // Segment characteristics
    .addColumn('segment_attributes', 'jsonb', (col) => col.notNull()) // Key attributes that define this segment
    .addColumn('segment_scores', 'jsonb') // Various scoring metrics for the segment
    
    // Confidence and stability
    .addColumn('confidence_score', 'decimal(3,2)')
    .addColumn('stability_score', 'decimal(3,2)') // How stable this classification is over time
    
    // Temporal data
    .addColumn('segment_since', 'timestamp with time zone', (col) => 
      col.defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    .addColumn('last_updated_at', 'timestamp with time zone', (col) => 
      col.defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    .addColumn('reassignment_count', 'integer', (col) => col.defaultTo(0))
    
    // Learning metadata
    .addColumn('classification_model', 'varchar(100)')
    .addColumn('model_version', 'varchar(50)')
    .addColumn('feature_importance', 'jsonb') // Which features were most important
    
    // Status
    .addColumn('is_active', 'boolean', (col) => col.defaultTo(true))
    .addColumn('is_primary', 'boolean', (col) => col.defaultTo(false)) // Primary segment for this user
    
    .addColumn('created_at', 'timestamp with time zone', (col) => 
      col.defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    .execute();

  // Add constraints for user_behavior_segments
  await db.schema
    .alterTable('user_behavior_segments')
    .addForeignKeyConstraint('fk_segment_user', ['user_id'], 'users', ['id'], (constraint) =>
      constraint.onDelete('cascade')
    )
    .execute();

  await db.schema
    .alterTable('user_behavior_segments')
    .addCheckConstraint('check_segment_confidence', sql`confidence_score >= 0.00 AND confidence_score <= 1.00`)
    .execute();

  await db.schema
    .alterTable('user_behavior_segments')
    .addCheckConstraint('check_segment_stability', sql`stability_score >= 0.00 AND stability_score <= 1.00`)
    .execute();

  // Predictive models for user behavior
  await db.schema
    .createTable('user_behavior_predictions')
    .addColumn('id', 'uuid', (col) => 
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn('user_id', 'uuid', (col) => col.notNull())
    
    // Prediction details
    .addColumn('prediction_type', 'varchar(100)', (col) => col.notNull()) // next_search, preferred_content, churn_risk
    .addColumn('prediction_target', 'varchar(255)', (col) => col.notNull())
    .addColumn('prediction_value', 'jsonb', (col) => col.notNull()) // The actual prediction data
    
    // Prediction metrics
    .addColumn('confidence_score', 'decimal(3,2)')
    .addColumn('probability_score', 'decimal(3,2)')
    .addColumn('expected_outcome', 'text')
    
    // Model information
    .addColumn('model_name', 'varchar(100)', (col) => col.notNull())
    .addColumn('model_version', 'varchar(50)')
    .addColumn('algorithm_used', 'varchar(100)')
    .addColumn('feature_set', 'jsonb') // Features used to make this prediction
    
    // Temporal aspects
    .addColumn('prediction_made_at', 'timestamp with time zone', (col) => 
      col.defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    .addColumn('prediction_expires_at', 'timestamp with time zone')
    .addColumn('prediction_horizon_days', 'integer') // How far into future this predicts
    
    // Validation
    .addColumn('is_validated', 'boolean', (col) => col.defaultTo(false))
    .addColumn('actual_outcome', 'jsonb')
    .addColumn('validation_accuracy', 'decimal(3,2)')
    .addColumn('validated_at', 'timestamp with time zone')
    
    .addColumn('created_at', 'timestamp with time zone', (col) => 
      col.defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    .execute();

  // Add constraints for user_behavior_predictions
  await db.schema
    .alterTable('user_behavior_predictions')
    .addForeignKeyConstraint('fk_prediction_user', ['user_id'], 'users', ['id'], (constraint) =>
      constraint.onDelete('cascade')
    )
    .execute();

  await db.schema
    .alterTable('user_behavior_predictions')
    .addCheckConstraint('check_prediction_confidence', sql`confidence_score >= 0.00 AND confidence_score <= 1.00`)
    .execute();

  await db.schema
    .alterTable('user_behavior_predictions')
    .addCheckConstraint('check_prediction_probability', sql`probability_score >= 0.00 AND probability_score <= 1.00`)
    .execute();

  // Learning insights and recommendations
  await db.schema
    .createTable('user_behavior_insights')
    .addColumn('id', 'uuid', (col) => 
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn('user_id', 'uuid')
    
    // Insight classification
    .addColumn('insight_type', 'varchar(100)', (col) => col.notNull()) // user_specific, cohort_based, system_wide
    .addColumn('insight_category', 'varchar(100)', (col) => col.notNull()) // search_optimization, ui_improvement, feature_usage
    .addColumn('insight_title', 'varchar(255)', (col) => col.notNull())
    .addColumn('insight_description', 'text', (col) => col.notNull())
    
    // Insight data
    .addColumn('insight_data', 'jsonb', (col) => col.notNull()) // Detailed insight information
    .addColumn('evidence', 'jsonb') // Supporting evidence and data
    .addColumn('recommendation', 'jsonb') // Actionable recommendations
    
    // Impact assessment
    .addColumn('impact_score', 'decimal(3,2)') // Potential impact if acted upon
    .addColumn('priority_score', 'integer') // Priority ranking
    .addColumn('effort_estimate', 'varchar(20)') // low, medium, high
    
    // Status and lifecycle
    .addColumn('status', 'varchar(50)', (col) => col.defaultTo('generated')) // generated, reviewed, approved, implemented, dismissed
    .addColumn('reviewed_by', 'uuid')
    .addColumn('reviewed_at', 'timestamp with time zone')
    .addColumn('implemented_at', 'timestamp with time zone')
    
    // Metadata
    .addColumn('generated_by_model', 'varchar(100)')
    .addColumn('model_version', 'varchar(50)')
    .addColumn('confidence_level', 'varchar(20)') // low, medium, high
    
    .addColumn('created_at', 'timestamp with time zone', (col) => 
      col.defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    .addColumn('updated_at', 'timestamp with time zone', (col) => 
      col.defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    .addColumn('expires_at', 'timestamp with time zone')
    .execute();

  // Add constraints for user_behavior_insights
  await db.schema
    .alterTable('user_behavior_insights')
    .addForeignKeyConstraint('fk_insight_user', ['user_id'], 'users', ['id'], (constraint) =>
      constraint.onDelete('set null')
    )
    .execute();

  await db.schema
    .alterTable('user_behavior_insights')
    .addForeignKeyConstraint('fk_insight_reviewer', ['reviewed_by'], 'users', ['id'], (constraint) =>
      constraint.onDelete('set null')
    )
    .execute();

  await db.schema
    .alterTable('user_behavior_insights')
    .addCheckConstraint('check_impact_score', sql`impact_score >= 0.00 AND impact_score <= 1.00`)
    .execute();

  await db.schema
    .alterTable('user_behavior_insights')
    .addCheckConstraint('check_insight_status', sql`status IN ('generated', 'reviewed', 'approved', 'implemented', 'dismissed')`)
    .execute();

  // Privacy and consent management for behavior tracking
  await db.schema
    .createTable('user_privacy_settings')
    .addColumn('id', 'uuid', (col) => 
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn('user_id', 'uuid', (col) => col.notNull())
    
    // Consent levels
    .addColumn('behavior_tracking_enabled', 'boolean', (col) => col.defaultTo(true))
    .addColumn('analytics_consent', 'boolean', (col) => col.defaultTo(true))
    .addColumn('personalization_consent', 'boolean', (col) => col.defaultTo(true))
    .addColumn('data_retention_consent', 'boolean', (col) => col.defaultTo(true))
    
    // Granular permissions
    .addColumn('event_tracking_types', 'jsonb', (col) => col.defaultTo(sql`'[]'`)) // Which event types user consents to
    .addColumn('data_sharing_permissions', 'jsonb', (col) => col.defaultTo(sql`'{}'`)) // What data can be shared and with whom
    
    // Preferences
    .addColumn('data_retention_period_days', 'integer', (col) => col.defaultTo(365))
    .addColumn('anonymization_preference', 'varchar(50)', (col) => col.defaultTo('partial')) // none, partial, full
    
    // Consent tracking
    .addColumn('consent_version', 'varchar(50)')
    .addColumn('consent_given_at', 'timestamp with time zone', (col) => 
      col.defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    .addColumn('consent_expires_at', 'timestamp with time zone')
    .addColumn('last_updated_at', 'timestamp with time zone', (col) => 
      col.defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    
    // Audit trail
    .addColumn('consent_history', 'jsonb', (col) => col.defaultTo(sql`'[]'`))
    .addColumn('ip_address_at_consent', 'inet')
    .addColumn('user_agent_at_consent', 'text')
    
    .addColumn('created_at', 'timestamp with time zone', (col) => 
      col.defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    .execute();

  // Add constraints for user_privacy_settings
  await db.schema
    .alterTable('user_privacy_settings')
    .addForeignKeyConstraint('fk_privacy_user', ['user_id'], 'users', ['id'], (constraint) =>
      constraint.onDelete('cascade')
    )
    .execute();

  await db.schema
    .alterTable('user_privacy_settings')
    .addUniqueConstraint('unique_privacy_user', ['user_id'])
    .execute();

  await db.schema
    .alterTable('user_privacy_settings')
    .addCheckConstraint('check_retention_period', sql`data_retention_period_days > 0 AND data_retention_period_days <= 3650`)
    .execute();

  // Create indexes for better query performance
  await db.schema
    .createIndex('idx_behavior_events_user_timestamp')
    .on('user_behavior_events')
    .columns(['user_id', 'event_timestamp'])
    .execute();

  await db.schema
    .createIndex('idx_behavior_events_session')
    .on('user_behavior_events')
    .columns(['session_id', 'session_sequence'])
    .execute();

  await db.schema
    .createIndex('idx_behavior_events_type_category')
    .on('user_behavior_events')
    .columns(['event_type', 'event_category'])
    .execute();

  await db.schema
    .createIndex('idx_search_patterns_user_type')
    .on('user_search_patterns')
    .columns(['user_id', 'pattern_type'])
    .execute();

  await db.schema
    .createIndex('idx_search_patterns_active_significant')
    .on('user_search_patterns')
    .columns(['is_active', 'is_significant'])
    .execute();

  await db.schema
    .createIndex('idx_behavior_segments_user_active')
    .on('user_behavior_segments')
    .columns(['user_id', 'is_active'])
    .execute();

  await db.schema
    .createIndex('idx_behavior_predictions_user_type')
    .on('user_behavior_predictions')
    .columns(['user_id', 'prediction_type'])
    .execute();

  await db.schema
    .createIndex('idx_behavior_insights_status_type')
    .on('user_behavior_insights')
    .columns(['status', 'insight_type'])
    .execute();

  console.log('✅ Migration 025: User behavior learning tables created successfully');
}

export async function down(db: Kysely<any>): Promise<void> {
  // Drop indexes
  await db.schema.dropIndex('idx_behavior_insights_status_type').execute();
  await db.schema.dropIndex('idx_behavior_predictions_user_type').execute();
  await db.schema.dropIndex('idx_behavior_segments_user_active').execute();
  await db.schema.dropIndex('idx_search_patterns_active_significant').execute();
  await db.schema.dropIndex('idx_search_patterns_user_type').execute();
  await db.schema.dropIndex('idx_behavior_events_type_category').execute();
  await db.schema.dropIndex('idx_behavior_events_session').execute();
  await db.schema.dropIndex('idx_behavior_events_user_timestamp').execute();

  // Drop tables in reverse order
  await db.schema.dropTable('user_privacy_settings').execute();
  await db.schema.dropTable('user_behavior_insights').execute();
  await db.schema.dropTable('user_behavior_predictions').execute();
  await db.schema.dropTable('user_behavior_segments').execute();
  await db.schema.dropTable('user_search_patterns').execute();
  await db.schema.dropTable('user_behavior_events').execute();

  console.log('✅ Migration 025: User behavior learning tables dropped successfully');
}