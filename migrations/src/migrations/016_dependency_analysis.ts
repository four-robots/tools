/**
 * Migration 016: Dependency Analysis Tables
 * 
 * Creates comprehensive database schema for dependency analysis including:
 * - Dependency graph with circular detection
 * - Vulnerability scanning and tracking  
 * - License analysis and compliance
 * - Impact analysis for dependency changes
 * - Security scoring and risk assessment
 */

import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // Create dependency_graph table for tracking dependency relationships
  await db.schema.createTable('dependency_graph')
    .addColumn('id', 'uuid', (col) => 
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn('repository_id', 'uuid', (col) => 
      col.references('code_repositories.id').onDelete('cascade').notNull()
    )
    .addColumn('source_package', 'varchar(255)', (col) => col.notNull())
    .addColumn('target_package', 'varchar(255)', (col) => col.notNull())
    .addColumn('dependency_type', 'varchar(50)', (col) => col.notNull()) // direct, transitive, dev, peer, optional
    .addColumn('version_constraint', 'varchar(100)')
    .addColumn('resolved_version', 'varchar(100)')
    .addColumn('language', 'varchar(50)', (col) => col.notNull())
    .addColumn('import_path', 'text') // Specific import path if applicable
    .addColumn('file_references', sql`text[]`) // Files that reference this dependency
    .addColumn('is_circular', 'boolean', (col) => col.defaultTo(false))
    .addColumn('depth', 'integer', (col) => col.defaultTo(0)) // Depth in dependency tree
    .addColumn('created_at', 'timestamp', (col) => 
      col.defaultTo(sql`now()`).notNull()
    )
    .addColumn('updated_at', 'timestamp', (col) => 
      col.defaultTo(sql`now()`).notNull()
    )
    .execute();

  // Create unique constraint and indexes for dependency_graph
  await db.schema.createIndex('idx_dependency_graph_repository_id')
    .on('dependency_graph')
    .column('repository_id')
    .execute();

  await db.schema.createIndex('idx_dependency_graph_source_package')
    .on('dependency_graph')
    .column('source_package')
    .execute();

  await db.schema.createIndex('idx_dependency_graph_target_package')
    .on('dependency_graph')
    .column('target_package')
    .execute();

  await db.schema.createIndex('idx_dependency_graph_dependency_type')
    .on('dependency_graph')
    .column('dependency_type')
    .execute();

  await db.schema.createIndex('idx_dependency_graph_is_circular')
    .on('dependency_graph')
    .column('is_circular')
    .execute();

  // Add unique constraint for dependency relationships
  await sql`
    ALTER TABLE dependency_graph 
    ADD CONSTRAINT uq_dependency_graph_relationship 
    UNIQUE (repository_id, source_package, target_package, dependency_type)
  `.execute(db);

  // Create vulnerability_scan table for tracking security vulnerabilities
  await db.schema.createTable('vulnerability_scan')
    .addColumn('id', 'uuid', (col) => 
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn('repository_id', 'uuid', (col) => 
      col.references('code_repositories.id').onDelete('cascade').notNull()
    )
    .addColumn('package_name', 'varchar(255)', (col) => col.notNull())
    .addColumn('package_version', 'varchar(100)', (col) => col.notNull())
    .addColumn('language', 'varchar(50)', (col) => col.notNull())
    .addColumn('vulnerability_id', 'varchar(100)') // CVE-YYYY-NNNN or advisory ID
    .addColumn('severity', 'varchar(20)', (col) => col.notNull()) // critical, high, medium, low, info
    .addColumn('title', 'text', (col) => col.notNull())
    .addColumn('description', 'text')
    .addColumn('affected_versions', 'text')
    .addColumn('fixed_version', 'varchar(100)')
    .addColumn('published_date', 'timestamp')
    .addColumn('modified_date', 'timestamp')
    .addColumn('source', 'varchar(50)') // osv, snyk, github, npm_audit
    .addColumn('references', 'jsonb', (col) => col.defaultTo('[]')) // External references and links
    .addColumn('scan_date', 'timestamp', (col) => 
      col.defaultTo(sql`now()`).notNull()
    )
    .addColumn('is_resolved', 'boolean', (col) => col.defaultTo(false))
    .addColumn('resolution_notes', 'text')
    .execute();

  // Create indexes for vulnerability_scan
  await db.schema.createIndex('idx_vulnerability_scan_repository_id')
    .on('vulnerability_scan')
    .column('repository_id')
    .execute();

  await db.schema.createIndex('idx_vulnerability_scan_package_name')
    .on('vulnerability_scan')
    .column('package_name')
    .execute();

  await db.schema.createIndex('idx_vulnerability_scan_severity')
    .on('vulnerability_scan')
    .column('severity')
    .execute();

  await db.schema.createIndex('idx_vulnerability_scan_vulnerability_id')
    .on('vulnerability_scan')
    .column('vulnerability_id')
    .execute();

  await db.schema.createIndex('idx_vulnerability_scan_scan_date')
    .on('vulnerability_scan')
    .column('scan_date')
    .execute();

  await db.schema.createIndex('idx_vulnerability_scan_is_resolved')
    .on('vulnerability_scan')
    .column('is_resolved')
    .execute();

  // Create license_analysis table for tracking license compliance
  await db.schema.createTable('license_analysis')
    .addColumn('id', 'uuid', (col) => 
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn('repository_id', 'uuid', (col) => 
      col.references('code_repositories.id').onDelete('cascade').notNull()
    )
    .addColumn('package_name', 'varchar(255)', (col) => col.notNull())
    .addColumn('package_version', 'varchar(100)', (col) => col.notNull())
    .addColumn('license_id', 'varchar(100)') // SPDX license identifier
    .addColumn('license_name', 'varchar(255)')
    .addColumn('license_text', 'text')
    .addColumn('is_osi_approved', 'boolean', (col) => col.defaultTo(false))
    .addColumn('is_fsf_approved', 'boolean', (col) => col.defaultTo(false))
    .addColumn('compatibility_issues', 'jsonb', (col) => col.defaultTo('[]'))
    .addColumn('risk_level', 'varchar(20)', (col) => col.defaultTo('unknown')) // low, medium, high, critical
    .addColumn('commercial_use_allowed', 'boolean')
    .addColumn('attribution_required', 'boolean')
    .addColumn('copyleft_scope', 'varchar(50)') // none, weak, strong, network
    .addColumn('analyzed_at', 'timestamp', (col) => 
      col.defaultTo(sql`now()`).notNull()
    )
    .execute();

  // Create indexes for license_analysis
  await db.schema.createIndex('idx_license_analysis_repository_id')
    .on('license_analysis')
    .column('repository_id')
    .execute();

  await db.schema.createIndex('idx_license_analysis_license_id')
    .on('license_analysis')
    .column('license_id')
    .execute();

  await db.schema.createIndex('idx_license_analysis_risk_level')
    .on('license_analysis')
    .column('risk_level')
    .execute();

  await db.schema.createIndex('idx_license_analysis_is_osi_approved')
    .on('license_analysis')
    .column('is_osi_approved')
    .execute();

  await db.schema.createIndex('idx_license_analysis_copyleft_scope')
    .on('license_analysis')
    .column('copyleft_scope')
    .execute();

  // Create dependency_impact table for tracking dependency change impacts
  await db.schema.createTable('dependency_impact')
    .addColumn('id', 'uuid', (col) => 
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn('repository_id', 'uuid', (col) => 
      col.references('code_repositories.id').onDelete('cascade').notNull()
    )
    .addColumn('changed_dependency', 'varchar(255)', (col) => col.notNull())
    .addColumn('changed_version', 'varchar(100)')
    .addColumn('affected_files', sql`text[]`, (col) => col.notNull())
    .addColumn('affected_functions', sql`text[]`)
    .addColumn('affected_classes', sql`text[]`)
    .addColumn('impact_scope', 'varchar(50)', (col) => col.notNull()) // file, module, package, global
    .addColumn('impact_type', 'varchar(50)', (col) => col.notNull()) // breaking, compatible, unknown
    .addColumn('confidence_score', 'decimal(3,2)', (col) => col.defaultTo(0.0))
    .addColumn('risk_assessment', 'varchar(20)', (col) => col.defaultTo('unknown')) // low, medium, high
    .addColumn('recommendations', sql`text[]`)
    .addColumn('analyzed_at', 'timestamp', (col) => 
      col.defaultTo(sql`now()`).notNull()
    )
    .execute();

  // Create indexes for dependency_impact
  await db.schema.createIndex('idx_dependency_impact_repository_id')
    .on('dependency_impact')
    .column('repository_id')
    .execute();

  await db.schema.createIndex('idx_dependency_impact_changed_dependency')
    .on('dependency_impact')
    .column('changed_dependency')
    .execute();

  await db.schema.createIndex('idx_dependency_impact_impact_scope')
    .on('dependency_impact')
    .column('impact_scope')
    .execute();

  await db.schema.createIndex('idx_dependency_impact_impact_type')
    .on('dependency_impact')
    .column('impact_type')
    .execute();

  await db.schema.createIndex('idx_dependency_impact_risk_assessment')
    .on('dependency_impact')
    .column('risk_assessment')
    .execute();

  // Create dependency_security_scores table for overall security scoring
  await db.schema.createTable('dependency_security_scores')
    .addColumn('id', 'uuid', (col) => 
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn('repository_id', 'uuid', (col) => 
      col.references('code_repositories.id').onDelete('cascade').notNull()
    )
    .addColumn('package_name', 'varchar(255)', (col) => col.notNull())
    .addColumn('package_version', 'varchar(100)', (col) => col.notNull())
    .addColumn('security_score', 'decimal(3,2)', (col) => col.defaultTo(0.0)) // 0.0 to 1.0
    .addColumn('vulnerability_count', 'integer', (col) => col.defaultTo(0))
    .addColumn('critical_vulnerabilities', 'integer', (col) => col.defaultTo(0))
    .addColumn('high_vulnerabilities', 'integer', (col) => col.defaultTo(0))
    .addColumn('medium_vulnerabilities', 'integer', (col) => col.defaultTo(0))
    .addColumn('low_vulnerabilities', 'integer', (col) => col.defaultTo(0))
    .addColumn('license_risk_score', 'decimal(3,2)', (col) => col.defaultTo(0.0))
    .addColumn('supply_chain_risk', 'decimal(3,2)', (col) => col.defaultTo(0.0))
    .addColumn('maintenance_score', 'decimal(3,2)', (col) => col.defaultTo(0.0))
    .addColumn('popularity_score', 'decimal(3,2)', (col) => col.defaultTo(0.0))
    .addColumn('last_updated', 'timestamp')
    .addColumn('calculated_at', 'timestamp', (col) => 
      col.defaultTo(sql`now()`).notNull()
    )
    .execute();

  // Create indexes for dependency_security_scores
  await db.schema.createIndex('idx_dep_security_scores_repository_id')
    .on('dependency_security_scores')
    .column('repository_id')
    .execute();

  await db.schema.createIndex('idx_dep_security_scores_package_name')
    .on('dependency_security_scores')
    .column('package_name')
    .execute();

  await db.schema.createIndex('idx_dep_security_scores_security_score')
    .on('dependency_security_scores')
    .column('security_score')
    .execute();

  // Add unique constraint for security scores
  await sql`
    ALTER TABLE dependency_security_scores 
    ADD CONSTRAINT uq_dep_security_scores_package 
    UNIQUE (repository_id, package_name, package_version)
  `.execute(db);

  // Create dependency_updates table for tracking available updates
  await db.schema.createTable('dependency_updates')
    .addColumn('id', 'uuid', (col) => 
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn('repository_id', 'uuid', (col) => 
      col.references('code_repositories.id').onDelete('cascade').notNull()
    )
    .addColumn('package_name', 'varchar(255)', (col) => col.notNull())
    .addColumn('current_version', 'varchar(100)', (col) => col.notNull())
    .addColumn('latest_version', 'varchar(100)', (col) => col.notNull())
    .addColumn('update_type', 'varchar(20)', (col) => col.notNull()) // major, minor, patch
    .addColumn('breaking_changes', 'boolean', (col) => col.defaultTo(false))
    .addColumn('security_fixes', 'boolean', (col) => col.defaultTo(false))
    .addColumn('changelog_url', 'text')
    .addColumn('release_notes', 'text')
    .addColumn('published_date', 'timestamp')
    .addColumn('update_priority', 'varchar(20)', (col) => col.defaultTo('low')) // low, medium, high, critical
    .addColumn('compatibility_score', 'decimal(3,2)', (col) => col.defaultTo(0.0))
    .addColumn('checked_at', 'timestamp', (col) => 
      col.defaultTo(sql`now()`).notNull()
    )
    .execute();

  // Create indexes for dependency_updates
  await db.schema.createIndex('idx_dependency_updates_repository_id')
    .on('dependency_updates')
    .column('repository_id')
    .execute();

  await db.schema.createIndex('idx_dependency_updates_package_name')
    .on('dependency_updates')
    .column('package_name')
    .execute();

  await db.schema.createIndex('idx_dependency_updates_update_type')
    .on('dependency_updates')
    .column('update_type')
    .execute();

  await db.schema.createIndex('idx_dependency_updates_update_priority')
    .on('dependency_updates')
    .column('update_priority')
    .execute();

  // Create dependency_analysis_sessions table for tracking analysis runs
  await db.schema.createTable('dependency_analysis_sessions')
    .addColumn('id', 'uuid', (col) => 
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn('repository_id', 'uuid', (col) => 
      col.references('code_repositories.id').onDelete('cascade').notNull()
    )
    .addColumn('analysis_type', 'varchar(50)', (col) => col.notNull()) // graph, vulnerability, license, impact
    .addColumn('status', 'varchar(20)', (col) => col.notNull()) // pending, running, completed, failed
    .addColumn('started_at', 'timestamp', (col) => 
      col.defaultTo(sql`now()`).notNull()
    )
    .addColumn('completed_at', 'timestamp')
    .addColumn('duration_ms', 'integer')
    .addColumn('packages_analyzed', 'integer', (col) => col.defaultTo(0))
    .addColumn('errors_encountered', 'integer', (col) => col.defaultTo(0))
    .addColumn('configuration', 'jsonb', (col) => col.defaultTo('{}'))
    .addColumn('results_summary', 'jsonb', (col) => col.defaultTo('{}'))
    .addColumn('error_details', 'text')
    .execute();

  // Create indexes for dependency_analysis_sessions
  await db.schema.createIndex('idx_dep_analysis_sessions_repository_id')
    .on('dependency_analysis_sessions')
    .column('repository_id')
    .execute();

  await db.schema.createIndex('idx_dep_analysis_sessions_analysis_type')
    .on('dependency_analysis_sessions')
    .column('analysis_type')
    .execute();

  await db.schema.createIndex('idx_dep_analysis_sessions_status')
    .on('dependency_analysis_sessions')
    .column('status')
    .execute();

  await db.schema.createIndex('idx_dep_analysis_sessions_started_at')
    .on('dependency_analysis_sessions')
    .column('started_at')
    .execute();

  console.log('✅ Migration 016: Dependency analysis tables created successfully');
}

export async function down(db: Kysely<any>): Promise<void> {
  // Drop tables in reverse order to handle foreign key constraints
  await db.schema.dropTable('dependency_analysis_sessions').execute();
  await db.schema.dropTable('dependency_updates').execute();
  await db.schema.dropTable('dependency_security_scores').execute();
  await db.schema.dropTable('dependency_impact').execute();
  await db.schema.dropTable('license_analysis').execute();
  await db.schema.dropTable('vulnerability_scan').execute();
  await db.schema.dropTable('dependency_graph').execute();

  console.log('✅ Migration 016: Dependency analysis tables dropped successfully');
}