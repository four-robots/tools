/**
 * Migration 026: Personalized Search Experience
 * 
 * Implements comprehensive personalization system including:
 * - User personalization profiles with preferences
 * - Personalized search results with ranking factors
 * - Interest modeling and affinity tracking
 * - Personalized recommendations system
 * - A/B testing framework for personalization
 * 
 * This is the final Phase 3 work item that brings intelligent personalization
 * to the entire search experience.
 */

import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  console.log('🚀 Migration 026: Creating personalized search experience tables...');

  // User personalization preferences and settings
  await db.schema
    .createTable('user_personalization_profiles')
    .addColumn('id', 'uuid', (col) => 
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn('user_id', 'uuid', (col) => col.notNull())
    
    // Profile metadata
    .addColumn('profile_name', 'varchar(255)', (col) => col.defaultTo('Default'))
    .addColumn('profile_description', 'text')
    .addColumn('is_active', 'boolean', (col) => col.defaultTo(true))
    .addColumn('is_default', 'boolean', (col) => col.defaultTo(true))
    
    // Search preferences
    .addColumn('search_preferences', 'jsonb', (col) => col.notNull().defaultTo(sql`'{}'`)) // UI layout, result format, etc.
    .addColumn('result_preferences', 'jsonb', (col) => col.notNull().defaultTo(sql`'{}'`)) // Ranking weights, content types
    .addColumn('interface_preferences', 'jsonb', (col) => col.notNull().defaultTo(sql`'{}'`)) // Theme, density, shortcuts
    
    // Personalization settings
    .addColumn('personalization_level', 'varchar(20)', (col) => col.defaultTo('medium')) // low, medium, high, custom
    .addColumn('learning_enabled', 'boolean', (col) => col.defaultTo(true))
    .addColumn('suggestion_enabled', 'boolean', (col) => col.defaultTo(true))
    .addColumn('recommendation_enabled', 'boolean', (col) => col.defaultTo(true))
    
    // Behavioral weights and factors
    .addColumn('behavior_weights', 'jsonb', (col) => col.defaultTo(sql`'{}'`)) // Weight different behavioral signals
    .addColumn('temporal_factors', 'jsonb', (col) => col.defaultTo(sql`'{}'`)) // Time-based personalization factors
    .addColumn('context_factors', 'jsonb', (col) => col.defaultTo(sql`'{}'`)) // Context-based adjustments
    
    // Profile lifecycle
    .addColumn('created_at', 'timestamp with time zone', (col) => 
      col.defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    .addColumn('updated_at', 'timestamp with time zone', (col) => 
      col.defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    .addColumn('last_used_at', 'timestamp with time zone', (col) => 
      col.defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    .execute();

  // Add foreign key constraint for user_personalization_profiles
  await db.schema
    .alterTable('user_personalization_profiles')
    .addForeignKeyConstraint('fk_personalization_user', ['user_id'], 'users', ['id'], (constraint) =>
      constraint.onDelete('cascade')
    )
    .execute();

  // Add check constraint for personalization level
  await db.schema
    .alterTable('user_personalization_profiles')
    .addCheckConstraint('check_personalization_level', 
      sql`personalization_level IN ('low', 'medium', 'high', 'custom')`
    )
    .execute();

  // Personalized search results and ranking factors
  await db.schema
    .createTable('personalized_search_results')
    .addColumn('id', 'uuid', (col) => 
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn('user_id', 'uuid', (col) => col.notNull())
    .addColumn('search_query', 'text', (col) => col.notNull())
    .addColumn('search_context', 'jsonb', (col) => col.defaultTo(sql`'{}'`))
    
    // Original vs personalized results
    .addColumn('original_results', 'jsonb', (col) => col.notNull()) // Original search results
    .addColumn('personalized_results', 'jsonb', (col) => col.notNull()) // Reranked/filtered results
    .addColumn('personalization_applied', 'jsonb', (col) => col.notNull()) // What personalizations were applied
    
    // Ranking and scoring
    .addColumn('base_scores', 'jsonb', (col) => col.notNull()) // Original relevance scores
    .addColumn('personalization_scores', 'jsonb', (col) => col.notNull()) // Personalization boost scores
    .addColumn('final_scores', 'jsonb', (col) => col.notNull()) // Combined final scores
    
    // User interaction tracking
    .addColumn('results_clicked', 'jsonb', (col) => col.defaultTo(sql`'[]'`)) // Which results user interacted with
    .addColumn('results_saved', 'jsonb', (col) => col.defaultTo(sql`'[]'`)) // Which results user saved
    .addColumn('results_shared', 'jsonb', (col) => col.defaultTo(sql`'[]'`)) // Which results user shared
    .addColumn('session_feedback', 'jsonb', (col) => col.defaultTo(sql`'{}'`)) // Implicit feedback from session
    
    // Personalization metadata
    .addColumn('personalization_model_version', 'varchar(50)')
    .addColumn('personalization_factors', 'jsonb', (col) => col.notNull()) // Factors that influenced personalization
    .addColumn('confidence_score', 'decimal(3,2)') // Confidence in personalization
    
    // Timing
    .addColumn('search_timestamp', 'timestamp with time zone', (col) => 
      col.defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    .addColumn('response_time_ms', 'integer')
    .execute();

  // Add constraints for personalized_search_results
  await db.schema
    .alterTable('personalized_search_results')
    .addForeignKeyConstraint('fk_personalized_user', ['user_id'], 'users', ['id'], (constraint) =>
      constraint.onDelete('cascade')
    )
    .execute();

  await db.schema
    .alterTable('personalized_search_results')
    .addCheckConstraint('check_confidence', 
      sql`confidence_score >= 0.00 AND confidence_score <= 1.00`
    )
    .execute();

  // User interests and topic affinities derived from behavior
  await db.schema
    .createTable('user_interest_profiles')
    .addColumn('id', 'uuid', (col) => 
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn('user_id', 'uuid', (col) => col.notNull())
    
    // Interest identification
    .addColumn('interest_type', 'varchar(100)', (col) => col.notNull()) // topic, category, content_type, entity
    .addColumn('interest_name', 'varchar(255)', (col) => col.notNull())
    .addColumn('interest_description', 'text')
    
    // Interest strength and characteristics
    .addColumn('affinity_score', 'decimal(4,3)', (col) => col.notNull()) // 0.000 to 1.000 interest strength
    .addColumn('frequency_score', 'decimal(4,3)', (col) => col.notNull()) // How often user engages with this interest
    .addColumn('recency_score', 'decimal(4,3)', (col) => col.notNull()) // How recently user showed this interest
    .addColumn('depth_score', 'decimal(4,3)', (col) => col.notNull()) // How deeply user engages (time spent, actions)
    
    // Interest metadata
    .addColumn('interest_keywords', 'jsonb', (col) => col.defaultTo(sql`'[]'`)) // Keywords associated with this interest
    .addColumn('related_queries', 'jsonb', (col) => col.defaultTo(sql`'[]'`)) // Queries that indicate this interest
    .addColumn('content_examples', 'jsonb', (col) => col.defaultTo(sql`'[]'`)) // Example content user engaged with
    
    // Evolution tracking
    .addColumn('first_detected_at', 'timestamp with time zone', (col) => 
      col.defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    .addColumn('last_updated_at', 'timestamp with time zone', (col) => 
      col.defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    .addColumn('trend_direction', 'varchar(20)', (col) => col.defaultTo('stable')) // growing, stable, declining
    .addColumn('trend_strength', 'decimal(3,2)', (col) => col.defaultTo(0.0)) // How strong the trend is
    
    // Interest lifecycle
    .addColumn('is_active', 'boolean', (col) => col.defaultTo(true))
    .addColumn('is_explicit', 'boolean', (col) => col.defaultTo(false)) // User explicitly indicated interest
    .addColumn('confidence_level', 'varchar(20)', (col) => col.defaultTo('medium')) // low, medium, high
    
    .addColumn('created_at', 'timestamp with time zone', (col) => 
      col.defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    .execute();

  // Add constraints for user_interest_profiles
  await db.schema
    .alterTable('user_interest_profiles')
    .addForeignKeyConstraint('fk_interest_user', ['user_id'], 'users', ['id'], (constraint) =>
      constraint.onDelete('cascade')
    )
    .execute();

  await db.schema
    .alterTable('user_interest_profiles')
    .addCheckConstraint('check_affinity_score', 
      sql`affinity_score >= 0.000 AND affinity_score <= 1.000`
    )
    .execute();

  await db.schema
    .alterTable('user_interest_profiles')
    .addCheckConstraint('check_frequency_score', 
      sql`frequency_score >= 0.000 AND frequency_score <= 1.000`
    )
    .execute();

  await db.schema
    .alterTable('user_interest_profiles')
    .addCheckConstraint('check_recency_score', 
      sql`recency_score >= 0.000 AND recency_score <= 1.000`
    )
    .execute();

  await db.schema
    .alterTable('user_interest_profiles')
    .addCheckConstraint('check_depth_score', 
      sql`depth_score >= 0.000 AND depth_score <= 1.000`
    )
    .execute();

  await db.schema
    .alterTable('user_interest_profiles')
    .addCheckConstraint('check_trend_direction', 
      sql`trend_direction IN ('growing', 'stable', 'declining')`
    )
    .execute();

  // Add unique constraint for user/interest combination
  await db.schema
    .alterTable('user_interest_profiles')
    .addUniqueConstraint('unique_user_interest', ['user_id', 'interest_type', 'interest_name'])
    .execute();

  // Personalized recommendations and suggestions
  await db.schema
    .createTable('personalized_recommendations')
    .addColumn('id', 'uuid', (col) => 
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn('user_id', 'uuid', (col) => col.notNull())
    
    // Recommendation details
    .addColumn('recommendation_type', 'varchar(100)', (col) => col.notNull()) // search_query, content, topic, action
    .addColumn('recommendation_category', 'varchar(100)', (col) => col.notNull()) // suggestion, related, trending, new
    .addColumn('recommendation_title', 'varchar(255)', (col) => col.notNull())
    .addColumn('recommendation_description', 'text')
    
    // Recommendation content
    .addColumn('recommendation_data', 'jsonb', (col) => col.notNull()) // The actual recommendation content
    .addColumn('context_data', 'jsonb', (col) => col.defaultTo(sql`'{}'`)) // Context that generated this recommendation
    
    // Scoring and ranking
    .addColumn('relevance_score', 'decimal(4,3)', (col) => col.notNull()) // How relevant to user
    .addColumn('confidence_score', 'decimal(4,3)', (col) => col.notNull()) // Confidence in recommendation
    .addColumn('novelty_score', 'decimal(4,3)', (col) => col.notNull()) // How novel/surprising this is
    .addColumn('diversity_score', 'decimal(4,3)', (col) => col.notNull()) // Contribution to recommendation diversity
    
    // Recommendation metadata
    .addColumn('generated_by_model', 'varchar(100)', (col) => col.notNull())
    .addColumn('model_version', 'varchar(50)')
    .addColumn('generation_factors', 'jsonb', (col) => col.notNull()) // What factors led to this recommendation
    
    // User interaction
    .addColumn('presented_at', 'timestamp with time zone')
    .addColumn('clicked_at', 'timestamp with time zone')
    .addColumn('dismissed_at', 'timestamp with time zone')
    .addColumn('feedback_score', 'integer') // User explicit feedback (-2 to +2)
    .addColumn('implicit_feedback', 'jsonb', (col) => col.defaultTo(sql`'{}'`)) // Implicit signals
    
    // Recommendation lifecycle
    .addColumn('is_active', 'boolean', (col) => col.defaultTo(true))
    .addColumn('expires_at', 'timestamp with time zone')
    .addColumn('priority_score', 'integer', (col) => col.defaultTo(50)) // Priority for display (0-100)
    
    .addColumn('created_at', 'timestamp with time zone', (col) => 
      col.defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    .addColumn('updated_at', 'timestamp with time zone', (col) => 
      col.defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    .execute();

  // Add constraints for personalized_recommendations
  await db.schema
    .alterTable('personalized_recommendations')
    .addForeignKeyConstraint('fk_recommendation_user', ['user_id'], 'users', ['id'], (constraint) =>
      constraint.onDelete('cascade')
    )
    .execute();

  await db.schema
    .alterTable('personalized_recommendations')
    .addCheckConstraint('check_relevance_score', 
      sql`relevance_score >= 0.000 AND relevance_score <= 1.000`
    )
    .execute();

  await db.schema
    .alterTable('personalized_recommendations')
    .addCheckConstraint('check_recommendation_confidence_score', 
      sql`confidence_score >= 0.000 AND confidence_score <= 1.000`
    )
    .execute();

  await db.schema
    .alterTable('personalized_recommendations')
    .addCheckConstraint('check_novelty_score', 
      sql`novelty_score >= 0.000 AND novelty_score <= 1.000`
    )
    .execute();

  await db.schema
    .alterTable('personalized_recommendations')
    .addCheckConstraint('check_diversity_score', 
      sql`diversity_score >= 0.000 AND diversity_score <= 1.000`
    )
    .execute();

  await db.schema
    .alterTable('personalized_recommendations')
    .addCheckConstraint('check_feedback_score', 
      sql`feedback_score >= -2 AND feedback_score <= 2`
    )
    .execute();

  await db.schema
    .alterTable('personalized_recommendations')
    .addCheckConstraint('check_priority_score', 
      sql`priority_score >= 0 AND priority_score <= 100`
    )
    .execute();

  // A/B testing for personalization features
  await db.schema
    .createTable('personalization_experiments')
    .addColumn('id', 'uuid', (col) => 
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn('user_id', 'uuid', (col) => col.notNull())
    
    // Experiment details
    .addColumn('experiment_name', 'varchar(255)', (col) => col.notNull())
    .addColumn('experiment_type', 'varchar(100)', (col) => col.notNull()) // ui_variant, algorithm, ranking, interface
    .addColumn('variant_name', 'varchar(100)', (col) => col.notNull()) // control, variant_a, variant_b, etc.
    .addColumn('experiment_description', 'text')
    
    // Experiment configuration
    .addColumn('experiment_config', 'jsonb', (col) => col.notNull()) // Configuration for this variant
    .addColumn('start_date', 'timestamp with time zone', (col) => col.notNull())
    .addColumn('end_date', 'timestamp with time zone', (col) => col.notNull())
    
    // User assignment
    .addColumn('assigned_at', 'timestamp with time zone', (col) => 
      col.defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    .addColumn('assignment_hash', 'varchar(100)', (col) => col.notNull()) // Consistent assignment hash
    .addColumn('is_active', 'boolean', (col) => col.defaultTo(true))
    
    // Interaction tracking
    .addColumn('interactions', 'jsonb', (col) => col.defaultTo(sql`'[]'`)) // User interactions during experiment
    .addColumn('conversions', 'jsonb', (col) => col.defaultTo(sql`'[]'`)) // Conversion events
    .addColumn('feedback', 'jsonb', (col) => col.defaultTo(sql`'{}'`)) // User feedback on experience
    
    // Performance metrics
    .addColumn('engagement_score', 'decimal(4,3)') // Engagement with personalized experience
    .addColumn('satisfaction_score', 'decimal(4,3)') // User satisfaction
    .addColumn('task_success_rate', 'decimal(4,3)') // Success rate for user tasks
    
    .addColumn('created_at', 'timestamp with time zone', (col) => 
      col.defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    .execute();

  // Add constraints for personalization_experiments
  await db.schema
    .alterTable('personalization_experiments')
    .addForeignKeyConstraint('fk_experiment_user', ['user_id'], 'users', ['id'], (constraint) =>
      constraint.onDelete('cascade')
    )
    .execute();

  await db.schema
    .alterTable('personalization_experiments')
    .addCheckConstraint('check_engagement', 
      sql`engagement_score IS NULL OR (engagement_score >= 0.000 AND engagement_score <= 1.000)`
    )
    .execute();

  await db.schema
    .alterTable('personalization_experiments')
    .addCheckConstraint('check_satisfaction', 
      sql`satisfaction_score IS NULL OR (satisfaction_score >= 0.000 AND satisfaction_score <= 1.000)`
    )
    .execute();

  await db.schema
    .alterTable('personalization_experiments')
    .addCheckConstraint('check_success_rate', 
      sql`task_success_rate IS NULL OR (task_success_rate >= 0.000 AND task_success_rate <= 1.000)`
    )
    .execute();

  // Create indexes for optimal query performance
  console.log('🔍 Creating personalization indexes...');

  // User personalization profiles indexes
  await db.schema
    .createIndex('idx_personalization_profiles_user_active')
    .on('user_personalization_profiles')
    .columns(['user_id', 'is_active'])
    .execute();

  await db.schema
    .createIndex('idx_personalization_profiles_default')
    .on('user_personalization_profiles')
    .columns(['user_id', 'is_default'])
    .execute();

  // Personalized search results indexes
  await db.schema
    .createIndex('idx_personalized_search_user_timestamp')
    .on('personalized_search_results')
    .columns(['user_id', 'search_timestamp'])
    .execute();

  await db.schema
    .createIndex('idx_personalized_search_query_hash')
    .on('personalized_search_results')
    .expression(sql`(md5(search_query))`)
    .execute();

  // User interest profiles indexes
  await db.schema
    .createIndex('idx_interest_profiles_user_active')
    .on('user_interest_profiles')
    .columns(['user_id', 'is_active'])
    .execute();

  await db.schema
    .createIndex('idx_interest_profiles_type_affinity')
    .on('user_interest_profiles')
    .columns(['interest_type', 'affinity_score'])
    .execute();

  await db.schema
    .createIndex('idx_interest_profiles_trend')
    .on('user_interest_profiles')
    .columns(['trend_direction', 'trend_strength'])
    .execute();

  // Personalized recommendations indexes
  await db.schema
    .createIndex('idx_recommendations_user_active')
    .on('personalized_recommendations')
    .columns(['user_id', 'is_active'])
    .execute();

  await db.schema
    .createIndex('idx_recommendations_type_category')
    .on('personalized_recommendations')
    .columns(['recommendation_type', 'recommendation_category'])
    .execute();

  await db.schema
    .createIndex('idx_recommendations_priority_relevance')
    .on('personalized_recommendations')
    .columns(['priority_score', 'relevance_score'])
    .execute();

  // Personalization experiments indexes
  await db.schema
    .createIndex('idx_experiments_user_active')
    .on('personalization_experiments')
    .columns(['user_id', 'is_active'])
    .execute();

  await db.schema
    .createIndex('idx_experiments_name_variant')
    .on('personalization_experiments')
    .columns(['experiment_name', 'variant_name'])
    .execute();

  await db.schema
    .createIndex('idx_experiments_dates')
    .on('personalization_experiments')
    .columns(['start_date', 'end_date'])
    .execute();

  console.log('✅ Migration 026: Personalized search experience tables created successfully');
  console.log('🎯 Personalization system ready for intelligent adaptive search experiences');
}

export async function down(db: Kysely<any>): Promise<void> {
  console.log('🔄 Migration 026: Dropping personalized search experience tables...');

  // Drop indexes first
  const indexes = [
    'idx_experiments_dates',
    'idx_experiments_name_variant', 
    'idx_experiments_user_active',
    'idx_recommendations_priority_relevance',
    'idx_recommendations_type_category',
    'idx_recommendations_user_active',
    'idx_interest_profiles_trend',
    'idx_interest_profiles_type_affinity',
    'idx_interest_profiles_user_active',
    'idx_personalized_search_query_hash',
    'idx_personalized_search_user_timestamp',
    'idx_personalization_profiles_default',
    'idx_personalization_profiles_user_active'
  ];

  for (const index of indexes) {
    await db.schema.dropIndex(index).ifExists().execute();
  }

  // Drop tables in reverse order
  await db.schema.dropTable('personalization_experiments').ifExists().execute();
  await db.schema.dropTable('personalized_recommendations').ifExists().execute();
  await db.schema.dropTable('user_interest_profiles').ifExists().execute();
  await db.schema.dropTable('personalized_search_results').ifExists().execute();
  await db.schema.dropTable('user_personalization_profiles').ifExists().execute();

  console.log('✅ Migration 026: Personalized search experience tables dropped successfully');
}