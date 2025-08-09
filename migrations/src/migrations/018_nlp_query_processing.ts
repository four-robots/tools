import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // Create query_processing_cache table for caching processed queries
  await db.schema
    .createTable('query_processing_cache')
    .addColumn('id', 'uuid', (col) => 
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn('query_hash', 'varchar(64)', (col) => col.notNull().unique())
    .addColumn('original_query', 'text', (col) => col.notNull())
    .addColumn('processed_query', 'jsonb', (col) => col.notNull())
    .addColumn('intent', 'varchar(50)')
    .addColumn('entities', 'jsonb', (col) => col.defaultTo(sql`'[]'`))
    .addColumn('expansions', 'jsonb', (col) => col.defaultTo(sql`'[]'`))
    .addColumn('language', 'varchar(10)')
    .addColumn('confidence', 'decimal(3,2)')
    .addColumn('processing_time_ms', 'integer')
    .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`now()`))
    .addColumn('accessed_count', 'integer', (col) => col.defaultTo(1))
    .addColumn('last_accessed_at', 'timestamp', (col) => col.defaultTo(sql`now()`))
    .execute();

  // Create indexes for query_processing_cache
  await db.schema
    .createIndex('idx_query_processing_cache_hash')
    .on('query_processing_cache')
    .column('query_hash')
    .execute();

  await db.schema
    .createIndex('idx_query_processing_cache_intent')
    .on('query_processing_cache')
    .column('intent')
    .execute();

  await db.schema
    .createIndex('idx_query_processing_cache_language')
    .on('query_processing_cache')
    .column('language')
    .execute();

  await db.schema
    .createIndex('idx_query_processing_cache_created_at')
    .on('query_processing_cache')
    .column('created_at')
    .execute();

  // Create query_feedback table for storing user feedback on query processing
  await db.schema
    .createTable('query_feedback')
    .addColumn('id', 'uuid', (col) => 
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn('query_hash', 'varchar(64)', (col) => col.notNull())
    .addColumn('user_id', 'uuid', (col) => 
      col.references('users.id').onDelete('cascade')
    )
    .addColumn('feedback_type', 'varchar(50)', (col) => col.notNull()) // helpful, not_helpful, wrong_intent, etc.
    .addColumn('feedback_data', 'jsonb', (col) => col.defaultTo(sql`'{}'`))
    .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`now()`))
    .execute();

  // Create indexes for query_feedback
  await db.schema
    .createIndex('idx_query_feedback_hash')
    .on('query_feedback')
    .column('query_hash')
    .execute();

  await db.schema
    .createIndex('idx_query_feedback_user_id')
    .on('query_feedback')
    .column('user_id')
    .execute();

  await db.schema
    .createIndex('idx_query_feedback_type')
    .on('query_feedback')
    .column('feedback_type')
    .execute();

  // Create nlp_models table for managing NLP model configurations
  await db.schema
    .createTable('nlp_models')
    .addColumn('id', 'uuid', (col) => 
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn('model_name', 'varchar(100)', (col) => col.notNull())
    .addColumn('model_type', 'varchar(50)', (col) => col.notNull()) // intent_classifier, entity_extractor, query_expander
    .addColumn('version', 'varchar(20)', (col) => col.notNull())
    .addColumn('configuration', 'jsonb', (col) => col.notNull())
    .addColumn('performance_metrics', 'jsonb', (col) => col.defaultTo(sql`'{}'`))
    .addColumn('is_active', 'boolean', (col) => col.defaultTo(false))
    .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamp', (col) => col.defaultTo(sql`now()`))
    .execute();

  // Create indexes for nlp_models
  await db.schema
    .createIndex('idx_nlp_models_name')
    .on('nlp_models')
    .column('model_name')
    .execute();

  await db.schema
    .createIndex('idx_nlp_models_type')
    .on('nlp_models')
    .column('model_type')
    .execute();

  await db.schema
    .createIndex('idx_nlp_models_active')
    .on('nlp_models')
    .column('is_active')
    .execute();

  // Create query_intent_history table for tracking intent classification improvements
  await db.schema
    .createTable('query_intent_history')
    .addColumn('id', 'uuid', (col) => 
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn('query_hash', 'varchar(64)', (col) => col.notNull())
    .addColumn('predicted_intent', 'varchar(50)', (col) => col.notNull())
    .addColumn('actual_intent', 'varchar(50)')
    .addColumn('confidence_score', 'decimal(3,2)', (col) => col.notNull())
    .addColumn('model_version', 'varchar(20)', (col) => col.notNull())
    .addColumn('feedback_provided', 'boolean', (col) => col.defaultTo(false))
    .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`now()`))
    .execute();

  // Create indexes for query_intent_history
  await db.schema
    .createIndex('idx_query_intent_history_hash')
    .on('query_intent_history')
    .column('query_hash')
    .execute();

  await db.schema
    .createIndex('idx_query_intent_history_predicted')
    .on('query_intent_history')
    .column('predicted_intent')
    .execute();

  await db.schema
    .createIndex('idx_query_intent_history_confidence')
    .on('query_intent_history')
    .column('confidence_score')
    .execute();

  // Create query_entities table for storing extracted entities
  await db.schema
    .createTable('query_entities')
    .addColumn('id', 'uuid', (col) => 
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn('query_hash', 'varchar(64)', (col) => col.notNull())
    .addColumn('entity_text', 'text', (col) => col.notNull())
    .addColumn('entity_type', 'varchar(50)', (col) => col.notNull())
    .addColumn('confidence_score', 'decimal(3,2)', (col) => col.notNull())
    .addColumn('start_index', 'integer', (col) => col.notNull())
    .addColumn('end_index', 'integer', (col) => col.notNull())
    .addColumn('metadata', 'jsonb', (col) => col.defaultTo(sql`'{}'`))
    .addColumn('linked_data', 'jsonb')
    .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`now()`))
    .execute();

  // Create indexes for query_entities
  await db.schema
    .createIndex('idx_query_entities_hash')
    .on('query_entities')
    .column('query_hash')
    .execute();

  await db.schema
    .createIndex('idx_query_entities_type')
    .on('query_entities')
    .column('entity_type')
    .execute();

  await db.schema
    .createIndex('idx_query_entities_text')
    .on('query_entities')
    .column('entity_text')
    .execute();

  // Insert some initial NLP model configurations
  await db
    .insertInto('nlp_models')
    .values([
      {
        model_name: 'gpt-4',
        model_type: 'intent_classifier',
        version: '1.0.0',
        configuration: JSON.stringify({
          provider: 'openai',
          model: 'gpt-4',
          temperature: 0.1,
          maxTokens: 500,
          systemPrompt: 'You are an expert at classifying user query intents for a technical search system.'
        }),
        is_active: true
      },
      {
        model_name: 'gpt-4',
        model_type: 'entity_extractor',
        version: '1.0.0',
        configuration: JSON.stringify({
          provider: 'openai',
          model: 'gpt-4',
          temperature: 0.0,
          maxTokens: 1000,
          systemPrompt: 'You are an expert at extracting technical entities and concepts from user queries.'
        }),
        is_active: true
      },
      {
        model_name: 'gpt-4',
        model_type: 'query_expander',
        version: '1.0.0',
        configuration: JSON.stringify({
          provider: 'openai',
          model: 'gpt-4',
          temperature: 0.3,
          maxTokens: 800,
          systemPrompt: 'You are an expert at expanding queries with synonyms and related terms for better search results.'
        }),
        is_active: true
      }
    ])
    .execute();

  console.log('✅ NLP Query Processing migration completed successfully');
}

export async function down(db: Kysely<any>): Promise<void> {
  // Drop indexes first
  await db.schema.dropIndex('idx_query_entities_text').ifExists().execute();
  await db.schema.dropIndex('idx_query_entities_type').ifExists().execute();
  await db.schema.dropIndex('idx_query_entities_hash').ifExists().execute();
  
  await db.schema.dropIndex('idx_query_intent_history_confidence').ifExists().execute();
  await db.schema.dropIndex('idx_query_intent_history_predicted').ifExists().execute();
  await db.schema.dropIndex('idx_query_intent_history_hash').ifExists().execute();
  
  await db.schema.dropIndex('idx_nlp_models_active').ifExists().execute();
  await db.schema.dropIndex('idx_nlp_models_type').ifExists().execute();
  await db.schema.dropIndex('idx_nlp_models_name').ifExists().execute();
  
  await db.schema.dropIndex('idx_query_feedback_type').ifExists().execute();
  await db.schema.dropIndex('idx_query_feedback_user_id').ifExists().execute();
  await db.schema.dropIndex('idx_query_feedback_hash').ifExists().execute();
  
  await db.schema.dropIndex('idx_query_processing_cache_created_at').ifExists().execute();
  await db.schema.dropIndex('idx_query_processing_cache_language').ifExists().execute();
  await db.schema.dropIndex('idx_query_processing_cache_intent').ifExists().execute();
  await db.schema.dropIndex('idx_query_processing_cache_hash').ifExists().execute();

  // Drop tables
  await db.schema.dropTable('query_entities').ifExists().execute();
  await db.schema.dropTable('query_intent_history').ifExists().execute();
  await db.schema.dropTable('nlp_models').ifExists().execute();
  await db.schema.dropTable('query_feedback').ifExists().execute();
  await db.schema.dropTable('query_processing_cache').ifExists().execute();
  
  console.log('✅ NLP Query Processing migration rollback completed');
}