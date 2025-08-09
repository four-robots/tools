import { Kysely } from 'kysely';
import { Database } from '../types/database';

export async function up(db: Kysely<Database>): Promise<void> {
  // Code Quality Metrics table
  await db.schema
    .createTable('code_quality_metrics')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(db.fn('gen_random_uuid')))
    .addColumn('file_id', 'uuid', col => col.references('code_files.id').onDelete('cascade').notNull())
    .addColumn('repository_id', 'uuid', col => col.references('code_repositories.id').onDelete('cascade').notNull())
    .addColumn('analysis_timestamp', 'timestamp', col => col.defaultTo(db.fn('now')))
    
    // Complexity Metrics
    .addColumn('cyclomatic_complexity', 'integer', col => col.defaultTo(0))
    .addColumn('cognitive_complexity', 'integer', col => col.defaultTo(0))
    .addColumn('structural_complexity', 'integer', col => col.defaultTo(0))
    .addColumn('nesting_depth', 'integer', col => col.defaultTo(0))
    
    // Size Metrics
    .addColumn('lines_of_code', 'integer', col => col.defaultTo(0))
    .addColumn('logical_lines', 'integer', col => col.defaultTo(0))
    .addColumn('comment_lines', 'integer', col => col.defaultTo(0))
    .addColumn('blank_lines', 'integer', col => col.defaultTo(0))
    
    // Quality Metrics
    .addColumn('maintainability_index', 'decimal(5,2)', col => col.defaultTo(0.0))
    .addColumn('technical_debt_minutes', 'integer', col => col.defaultTo(0))
    .addColumn('code_smells_count', 'integer', col => col.defaultTo(0))
    
    // Security & Performance
    .addColumn('security_hotspots', 'integer', col => col.defaultTo(0))
    .addColumn('performance_issues', 'integer', col => col.defaultTo(0))
    
    // Coverage Metrics
    .addColumn('test_coverage', 'decimal(5,2)', col => col.defaultTo(0.0))
    .addColumn('branch_coverage', 'decimal(5,2)', col => col.defaultTo(0.0))
    
    // Composite Scores
    .addColumn('overall_quality_score', 'decimal(5,2)', col => col.defaultTo(0.0))
    .addColumn('reliability_rating', 'varchar(1)', col => col.defaultTo('D'))
    .addColumn('maintainability_rating', 'varchar(1)', col => col.defaultTo('D'))
    .addColumn('security_rating', 'varchar(1)', col => col.defaultTo('D'))
    
    .addColumn('language', 'varchar(50)', col => col.notNull())
    .execute();

  // Add indexes for code_quality_metrics
  await db.schema
    .createIndex('idx_code_quality_metrics_file_id')
    .on('code_quality_metrics')
    .column('file_id')
    .execute();

  await db.schema
    .createIndex('idx_code_quality_metrics_repository_id')
    .on('code_quality_metrics')
    .column('repository_id')
    .execute();

  await db.schema
    .createIndex('idx_code_quality_metrics_analysis_timestamp')
    .on('code_quality_metrics')
    .column('analysis_timestamp')
    .execute();

  await db.schema
    .createIndex('idx_code_quality_metrics_overall_quality_score')
    .on('code_quality_metrics')
    .column('overall_quality_score')
    .execute();

  await db.schema
    .createIndex('idx_code_quality_metrics_language')
    .on('code_quality_metrics')
    .column('language')
    .execute();

  // Code Smells table
  await db.schema
    .createTable('code_smells')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(db.fn('gen_random_uuid')))
    .addColumn('file_id', 'uuid', col => col.references('code_files.id').onDelete('cascade').notNull())
    .addColumn('repository_id', 'uuid', col => col.references('code_repositories.id').onDelete('cascade').notNull())
    .addColumn('smell_type', 'varchar(100)', col => col.notNull())
    .addColumn('severity', 'varchar(20)', col => col.notNull()) // critical, major, minor, info
    .addColumn('title', 'varchar(255)', col => col.notNull())
    .addColumn('description', 'text', col => col.notNull())
    .addColumn('start_line', 'integer', col => col.notNull())
    .addColumn('end_line', 'integer')
    .addColumn('start_column', 'integer')
    .addColumn('end_column', 'integer')
    .addColumn('effort_minutes', 'integer', col => col.defaultTo(0)) // Estimated fix time
    .addColumn('rule_key', 'varchar(100)')
    .addColumn('suggested_fix', 'text')
    .addColumn('is_resolved', 'boolean', col => col.defaultTo(false))
    .addColumn('resolved_by', 'varchar(255)')
    .addColumn('resolved_at', 'timestamp')
    .addColumn('detected_at', 'timestamp', col => col.defaultTo(db.fn('now')))
    .execute();

  // Add indexes for code_smells
  await db.schema
    .createIndex('idx_code_smells_file_id')
    .on('code_smells')
    .column('file_id')
    .execute();

  await db.schema
    .createIndex('idx_code_smells_repository_id')
    .on('code_smells')
    .column('repository_id')
    .execute();

  await db.schema
    .createIndex('idx_code_smells_smell_type')
    .on('code_smells')
    .column('smell_type')
    .execute();

  await db.schema
    .createIndex('idx_code_smells_severity')
    .on('code_smells')
    .column('severity')
    .execute();

  await db.schema
    .createIndex('idx_code_smells_is_resolved')
    .on('code_smells')
    .column('is_resolved')
    .execute();

  await db.schema
    .createIndex('idx_code_smells_detected_at')
    .on('code_smells')
    .column('detected_at')
    .execute();

  // Quality Trends table
  await db.schema
    .createTable('quality_trends')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(db.fn('gen_random_uuid')))
    .addColumn('repository_id', 'uuid', col => col.references('code_repositories.id').onDelete('cascade').notNull())
    .addColumn('metric_name', 'varchar(100)', col => col.notNull())
    .addColumn('metric_value', 'decimal(10,4)', col => col.notNull())
    .addColumn('recorded_at', 'timestamp', col => col.defaultTo(db.fn('now')))
    .addColumn('file_count', 'integer')
    .addColumn('total_loc', 'integer')
    .execute();

  // Add indexes for quality_trends
  await db.schema
    .createIndex('idx_quality_trends_repository_id')
    .on('quality_trends')
    .column('repository_id')
    .execute();

  await db.schema
    .createIndex('idx_quality_trends_metric_name')
    .on('quality_trends')
    .column('metric_name')
    .execute();

  await db.schema
    .createIndex('idx_quality_trends_recorded_at')
    .on('quality_trends')
    .column('recorded_at')
    .execute();

  // Quality Gates table
  await db.schema
    .createTable('quality_gates')
    .addColumn('id', 'uuid', col => col.primaryKey().defaultTo(db.fn('gen_random_uuid')))
    .addColumn('repository_id', 'uuid', col => col.references('code_repositories.id').onDelete('cascade').notNull())
    .addColumn('gate_name', 'varchar(100)', col => col.notNull())
    .addColumn('metric_name', 'varchar(100)', col => col.notNull())
    .addColumn('operator', 'varchar(10)', col => col.notNull()) // gt, lt, gte, lte, eq, ne
    .addColumn('threshold_value', 'decimal(10,4)', col => col.notNull())
    .addColumn('is_blocking', 'boolean', col => col.defaultTo(false))
    .addColumn('severity', 'varchar(20)', col => col.defaultTo('warning')) // error, warning, info
    .addColumn('is_active', 'boolean', col => col.defaultTo(true))
    .addColumn('created_at', 'timestamp', col => col.defaultTo(db.fn('now')))
    .execute();

  // Add indexes for quality_gates
  await db.schema
    .createIndex('idx_quality_gates_repository_id')
    .on('quality_gates')
    .column('repository_id')
    .execute();

  await db.schema
    .createIndex('idx_quality_gates_gate_name')
    .on('quality_gates')
    .column('gate_name')
    .execute();

  await db.schema
    .createIndex('idx_quality_gates_metric_name')
    .on('quality_gates')
    .column('metric_name')
    .execute();

  await db.schema
    .createIndex('idx_quality_gates_is_active')
    .on('quality_gates')
    .column('is_active')
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable('quality_gates').execute();
  await db.schema.dropTable('quality_trends').execute();
  await db.schema.dropTable('code_smells').execute();
  await db.schema.dropTable('code_quality_metrics').execute();
}