import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // Create search_summaries table for storing AI-generated summaries
  await db.schema
    .createTable('search_summaries')
    .addColumn('id', 'uuid', (col) => 
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn('search_results_hash', 'varchar(64)', (col) => col.notNull().unique())
    .addColumn('search_query', 'text', (col) => col.notNull())
    .addColumn('query_intent', 'varchar(50)', (col) => col.notNull())
    .addColumn('summary_type', 'varchar(50)', (col) => col.notNull()) // general_summary, answer_generation, key_points, synthesis
    .addColumn('summary_content', 'text', (col) => col.notNull())
    .addColumn('summary_length', 'integer', (col) => col.notNull())
    .addColumn('language', 'varchar(10)', (col) => col.defaultTo('en'))
    .addColumn('llm_provider', 'varchar(50)', (col) => col.notNull()) // openai, anthropic, google
    .addColumn('llm_model', 'varchar(100)', (col) => col.notNull())
    .addColumn('total_sources', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('processing_time_ms', 'integer', (col) => col.notNull())
    .addColumn('user_id', 'uuid', (col) => 
      col.references('users.id').onDelete('cascade')
    )
    .addColumn('session_id', 'varchar(255)')
    .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamp', (col) => col.defaultTo(sql`now()`))
    .addColumn('accessed_count', 'integer', (col) => col.defaultTo(1))
    .addColumn('last_accessed_at', 'timestamp', (col) => col.defaultTo(sql`now()`))
    .execute();

  // Create indexes for search_summaries
  await db.schema
    .createIndex('idx_search_summaries_hash')
    .on('search_summaries')
    .column('search_results_hash')
    .execute();

  await db.schema
    .createIndex('idx_search_summaries_query')
    .on('search_summaries')
    .column('search_query')
    .execute();

  await db.schema
    .createIndex('idx_search_summaries_type')
    .on('search_summaries')
    .column('summary_type')
    .execute();

  await db.schema
    .createIndex('idx_search_summaries_user_id')
    .on('search_summaries')
    .column('user_id')
    .execute();

  await db.schema
    .createIndex('idx_search_summaries_created_at')
    .on('search_summaries')
    .column('created_at')
    .execute();

  // Create summary_sources table for tracking source attribution and citations
  await db.schema
    .createTable('summary_sources')
    .addColumn('id', 'uuid', (col) => 
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn('summary_id', 'uuid', (col) => 
      col.references('search_summaries.id').onDelete('cascade').notNull()
    )
    .addColumn('source_type', 'varchar(50)', (col) => col.notNull()) // scraped_page, wiki_page, kanban_card, memory_thought, code_file
    .addColumn('source_id', 'uuid', (col) => col.notNull())
    .addColumn('source_title', 'text', (col) => col.notNull())
    .addColumn('source_url', 'text')
    .addColumn('relevance_score', 'decimal(4,3)', (col) => col.notNull()) // 0.000-1.000
    .addColumn('usage_weight', 'decimal(4,3)', (col) => col.notNull()) // how much this source contributed to summary
    .addColumn('citation_text', 'text') // specific text quoted/referenced from source
    .addColumn('citation_start_index', 'integer') // where citation appears in summary
    .addColumn('citation_end_index', 'integer')
    .addColumn('metadata', 'jsonb', (col) => col.defaultTo(sql`'{}'`))
    .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`now()`))
    .execute();

  // Create indexes for summary_sources
  await db.schema
    .createIndex('idx_summary_sources_summary_id')
    .on('summary_sources')
    .column('summary_id')
    .execute();

  await db.schema
    .createIndex('idx_summary_sources_type')
    .on('summary_sources')
    .column('source_type')
    .execute();

  await db.schema
    .createIndex('idx_summary_sources_relevance')
    .on('summary_sources')
    .column('relevance_score')
    .execute();

  // Create summary_key_points table for extracted key points from content
  await db.schema
    .createTable('summary_key_points')
    .addColumn('id', 'uuid', (col) => 
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn('summary_id', 'uuid', (col) => 
      col.references('search_summaries.id').onDelete('cascade').notNull()
    )
    .addColumn('key_point_text', 'text', (col) => col.notNull())
    .addColumn('importance_score', 'decimal(4,3)', (col) => col.notNull()) // 0.000-1.000
    .addColumn('confidence_score', 'decimal(4,3)', (col) => col.notNull())
    .addColumn('point_category', 'varchar(50)') // definition, example, process, benefit, drawback, etc.
    .addColumn('supporting_sources', 'jsonb', (col) => col.defaultTo(sql`'[]'`)) // array of source IDs
    .addColumn('related_concepts', 'jsonb', (col) => col.defaultTo(sql`'[]'`)) // array of related concept strings
    .addColumn('position_in_summary', 'integer') // order in the summary
    .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`now()`))
    .execute();

  // Create indexes for summary_key_points
  await db.schema
    .createIndex('idx_summary_key_points_summary_id')
    .on('summary_key_points')
    .column('summary_id')
    .execute();

  await db.schema
    .createIndex('idx_summary_key_points_importance')
    .on('summary_key_points')
    .column('importance_score')
    .execute();

  await db.schema
    .createIndex('idx_summary_key_points_category')
    .on('summary_key_points')
    .column('point_category')
    .execute();

  // Create fact_check_results table for fact-checking and confidence scoring
  await db.schema
    .createTable('fact_check_results')
    .addColumn('id', 'uuid', (col) => 
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn('summary_id', 'uuid', (col) => 
      col.references('search_summaries.id').onDelete('cascade').notNull()
    )
    .addColumn('claim_text', 'text', (col) => col.notNull())
    .addColumn('claim_start_index', 'integer', (col) => col.notNull())
    .addColumn('claim_end_index', 'integer', (col) => col.notNull())
    .addColumn('factual_accuracy', 'varchar(20)', (col) => col.notNull()) // verified, likely_true, uncertain, likely_false, contradicted
    .addColumn('confidence_score', 'decimal(4,3)', (col) => col.notNull())
    .addColumn('verification_method', 'varchar(50)', (col) => col.notNull()) // source_cross_reference, external_validation, llm_reasoning
    .addColumn('supporting_evidence', 'jsonb', (col) => col.defaultTo(sql`'[]'`)) // references to sources that support/contradict
    .addColumn('contradicting_evidence', 'jsonb', (col) => col.defaultTo(sql`'[]'`))
    .addColumn('verification_notes', 'text')
    .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`now()`))
    .execute();

  // Create indexes for fact_check_results
  await db.schema
    .createIndex('idx_fact_check_results_summary_id')
    .on('fact_check_results')
    .column('summary_id')
    .execute();

  await db.schema
    .createIndex('idx_fact_check_results_accuracy')
    .on('fact_check_results')
    .column('factual_accuracy')
    .execute();

  await db.schema
    .createIndex('idx_fact_check_results_confidence')
    .on('fact_check_results')
    .column('confidence_score')
    .execute();

  // Create hallucination_checks table for tracking potential hallucinations
  await db.schema
    .createTable('hallucination_checks')
    .addColumn('id', 'uuid', (col) => 
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn('summary_id', 'uuid', (col) => 
      col.references('search_summaries.id').onDelete('cascade').notNull()
    )
    .addColumn('flagged_text', 'text', (col) => col.notNull())
    .addColumn('text_start_index', 'integer', (col) => col.notNull())
    .addColumn('text_end_index', 'integer', (col) => col.notNull())
    .addColumn('hallucination_type', 'varchar(50)', (col) => col.notNull()) // unsupported_claim, contradicted_fact, fabricated_detail, out_of_scope
    .addColumn('risk_level', 'varchar(20)', (col) => col.notNull()) // low, medium, high, critical
    .addColumn('confidence_score', 'decimal(4,3)', (col) => col.notNull())
    .addColumn('detection_method', 'varchar(50)', (col) => col.notNull()) // source_verification, consistency_check, knowledge_base_lookup
    .addColumn('source_support', 'boolean', (col) => col.defaultTo(false)) // whether any source supports this claim
    .addColumn('recommendation', 'varchar(50)', (col) => col.notNull()) // remove, flag, verify, rewrite
    .addColumn('alternative_text', 'text') // suggested replacement if available
    .addColumn('verification_notes', 'text')
    .addColumn('resolved', 'boolean', (col) => col.defaultTo(false))
    .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`now()`))
    .addColumn('resolved_at', 'timestamp')
    .execute();

  // Create indexes for hallucination_checks
  await db.schema
    .createIndex('idx_hallucination_checks_summary_id')
    .on('hallucination_checks')
    .column('summary_id')
    .execute();

  await db.schema
    .createIndex('idx_hallucination_checks_type')
    .on('hallucination_checks')
    .column('hallucination_type')
    .execute();

  await db.schema
    .createIndex('idx_hallucination_checks_risk')
    .on('hallucination_checks')
    .column('risk_level')
    .execute();

  await db.schema
    .createIndex('idx_hallucination_checks_resolved')
    .on('hallucination_checks')
    .column('resolved')
    .execute();

  // Create summary_feedback table for user feedback on generated summaries
  await db.schema
    .createTable('summary_feedback')
    .addColumn('id', 'uuid', (col) => 
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn('summary_id', 'uuid', (col) => 
      col.references('search_summaries.id').onDelete('cascade').notNull()
    )
    .addColumn('user_id', 'uuid', (col) => 
      col.references('users.id').onDelete('cascade')
    )
    .addColumn('feedback_type', 'varchar(50)', (col) => col.notNull()) // helpful, not_helpful, inaccurate, incomplete, too_long, too_short
    .addColumn('rating', 'integer') // 1-5 star rating
    .addColumn('specific_issues', 'jsonb', (col) => col.defaultTo(sql`'[]'`)) // array of specific problems
    .addColumn('suggested_improvements', 'text')
    .addColumn('preferred_length', 'varchar(20)') // shorter, longer, just_right
    .addColumn('preferred_style', 'varchar(20)') // more_detailed, more_concise, more_technical, simpler
    .addColumn('feedback_text', 'text')
    .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`now()`))
    .execute();

  // Create indexes for summary_feedback
  await db.schema
    .createIndex('idx_summary_feedback_summary_id')
    .on('summary_feedback')
    .column('summary_id')
    .execute();

  await db.schema
    .createIndex('idx_summary_feedback_user_id')
    .on('summary_feedback')
    .column('user_id')
    .execute();

  await db.schema
    .createIndex('idx_summary_feedback_type')
    .on('summary_feedback')
    .column('feedback_type')
    .execute();

  await db.schema
    .createIndex('idx_summary_feedback_rating')
    .on('summary_feedback')
    .column('rating')
    .execute();

  // Create generated_answers table for specific question-answering summaries
  await db.schema
    .createTable('generated_answers')
    .addColumn('id', 'uuid', (col) => 
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn('summary_id', 'uuid', (col) => 
      col.references('search_summaries.id').onDelete('cascade').notNull()
    )
    .addColumn('question_text', 'text', (col) => col.notNull())
    .addColumn('answer_text', 'text', (col) => col.notNull())
    .addColumn('answer_type', 'varchar(50)', (col) => col.notNull()) // direct_answer, explanation, comparison, step_by_step, definition
    .addColumn('confidence_score', 'decimal(4,3)', (col) => col.notNull())
    .addColumn('completeness_score', 'decimal(4,3)', (col) => col.notNull()) // how complete the answer is
    .addColumn('primary_sources', 'jsonb', (col) => col.defaultTo(sql`'[]'`)) // most relevant source IDs
    .addColumn('follow_up_questions', 'jsonb', (col) => col.defaultTo(sql`'[]'`)) // suggested related questions
    .addColumn('alternative_phrasings', 'jsonb', (col) => col.defaultTo(sql`'[]'`)) // other ways to ask the same question
    .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`now()`))
    .execute();

  // Create indexes for generated_answers
  await db.schema
    .createIndex('idx_generated_answers_summary_id')
    .on('generated_answers')
    .column('summary_id')
    .execute();

  await db.schema
    .createIndex('idx_generated_answers_type')
    .on('generated_answers')
    .column('answer_type')
    .execute();

  await db.schema
    .createIndex('idx_generated_answers_confidence')
    .on('generated_answers')
    .column('confidence_score')
    .execute();

  console.log('✅ AI Search Summaries migration completed successfully');
}

export async function down(db: Kysely<any>): Promise<void> {
  // Drop indexes first
  await db.schema.dropIndex('idx_generated_answers_confidence').ifExists().execute();
  await db.schema.dropIndex('idx_generated_answers_type').ifExists().execute();
  await db.schema.dropIndex('idx_generated_answers_summary_id').ifExists().execute();
  
  await db.schema.dropIndex('idx_summary_feedback_rating').ifExists().execute();
  await db.schema.dropIndex('idx_summary_feedback_type').ifExists().execute();
  await db.schema.dropIndex('idx_summary_feedback_user_id').ifExists().execute();
  await db.schema.dropIndex('idx_summary_feedback_summary_id').ifExists().execute();
  
  await db.schema.dropIndex('idx_hallucination_checks_resolved').ifExists().execute();
  await db.schema.dropIndex('idx_hallucination_checks_risk').ifExists().execute();
  await db.schema.dropIndex('idx_hallucination_checks_type').ifExists().execute();
  await db.schema.dropIndex('idx_hallucination_checks_summary_id').ifExists().execute();
  
  await db.schema.dropIndex('idx_fact_check_results_confidence').ifExists().execute();
  await db.schema.dropIndex('idx_fact_check_results_accuracy').ifExists().execute();
  await db.schema.dropIndex('idx_fact_check_results_summary_id').ifExists().execute();
  
  await db.schema.dropIndex('idx_summary_key_points_category').ifExists().execute();
  await db.schema.dropIndex('idx_summary_key_points_importance').ifExists().execute();
  await db.schema.dropIndex('idx_summary_key_points_summary_id').ifExists().execute();
  
  await db.schema.dropIndex('idx_summary_sources_relevance').ifExists().execute();
  await db.schema.dropIndex('idx_summary_sources_type').ifExists().execute();
  await db.schema.dropIndex('idx_summary_sources_summary_id').ifExists().execute();
  
  await db.schema.dropIndex('idx_search_summaries_created_at').ifExists().execute();
  await db.schema.dropIndex('idx_search_summaries_user_id').ifExists().execute();
  await db.schema.dropIndex('idx_search_summaries_type').ifExists().execute();
  await db.schema.dropIndex('idx_search_summaries_query').ifExists().execute();
  await db.schema.dropIndex('idx_search_summaries_hash').ifExists().execute();

  // Drop tables in reverse dependency order
  await db.schema.dropTable('generated_answers').ifExists().execute();
  await db.schema.dropTable('summary_feedback').ifExists().execute();
  await db.schema.dropTable('hallucination_checks').ifExists().execute();
  await db.schema.dropTable('fact_check_results').ifExists().execute();
  await db.schema.dropTable('summary_key_points').ifExists().execute();
  await db.schema.dropTable('summary_sources').ifExists().execute();
  await db.schema.dropTable('search_summaries').ifExists().execute();
  
  console.log('✅ AI Search Summaries migration rollback completed');
}