import { Kysely, sql } from 'kysely';
import { logger } from '../utils/logger.js';

export async function up(db: Kysely<any>): Promise<void> {
  logger.info('Creating API documentation discovery schema...');

  // API Documentation Sources - Registry of documentation providers
  logger.info('Creating api_documentation_sources table...');
  await db.schema
    .createTable('api_documentation_sources')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('name', 'varchar(255)', (col) => col.notNull().unique())
    .addColumn('base_url', 'varchar(500)', (col) => col.notNull())
    .addColumn('documentation_pattern', 'varchar(500)', (col) => col.notNull())
    .addColumn('version_pattern', 'varchar(200)')
    .addColumn('supported_languages', sql`varchar(100)[]`, (col) => col.notNull())
    .addColumn('is_active', 'boolean', (col) => col.notNull().defaultTo(true))
    .addColumn('last_updated', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createIndex('idx_api_doc_sources_language')
    .on('api_documentation_sources')
    .using('gin')
    .column('supported_languages')
    .execute();

  // Discovered API Documentation - Cached documentation metadata
  logger.info('Creating discovered_api_docs table...');
  await db.schema
    .createTable('discovered_api_docs')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('package_name', 'varchar(255)', (col) => col.notNull())
    .addColumn('package_version', 'varchar(100)', (col) => col.notNull())
    .addColumn('language', 'varchar(50)', (col) => col.notNull())
    .addColumn('source_id', 'uuid', (col) => col.notNull().references('api_documentation_sources.id'))
    .addColumn('documentation_url', 'varchar(1000)', (col) => col.notNull())
    .addColumn('api_reference_url', 'varchar(1000)')
    .addColumn('examples_url', 'varchar(1000)')
    .addColumn('changelog_url', 'varchar(1000)')
    .addColumn('repository_url', 'varchar(1000)')
    .addColumn('health_score', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('last_scraped', 'timestamptz')
    .addColumn('scrape_status', 'varchar(50)', (col) => col.defaultTo('pending'))
    .addColumn('metadata', 'jsonb', (col) => col.notNull().defaultTo(sql`'{}'::jsonb`))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createIndex('idx_discovered_api_docs_package')
    .on('discovered_api_docs')
    .column('package_name')
    .execute();

  await db.schema
    .createIndex('idx_discovered_api_docs_language')
    .on('discovered_api_docs')
    .column('language')
    .execute();

  await db.schema
    .createIndex('idx_discovered_api_docs_source')
    .on('discovered_api_docs')
    .column('source_id')
    .execute();

  await db.schema
    .createIndex('idx_discovered_api_docs_health')
    .on('discovered_api_docs')
    .columns(['health_score desc'])
    .execute();

  // Unique constraint for package/version/language/source combination
  await db.schema
    .createIndex('unique_discovered_api_docs')
    .on('discovered_api_docs')
    .columns(['package_name', 'package_version', 'language', 'source_id'])
    .unique()
    .execute();

  // Repository API Recommendations - Links repositories to relevant API documentation
  logger.info('Creating repository_api_recommendations table...');
  await db.schema
    .createTable('repository_api_recommendations')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('repository_id', 'uuid', (col) => col.notNull().references('code_repositories.id').onDelete('cascade'))
    .addColumn('discovered_doc_id', 'uuid', (col) => col.notNull().references('discovered_api_docs.id'))
    .addColumn('dependency_type', 'varchar(50)', (col) => col.notNull())
    .addColumn('usage_confidence', 'decimal(3,2)', (col) => col.notNull().defaultTo(0.0))
    .addColumn('recommendation_reason', 'varchar(200)', (col) => col.notNull())
    .addColumn('file_references', sql`text[]`)
    .addColumn('recommendation_status', 'varchar(50)', (col) => col.notNull().defaultTo('recommended'))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createIndex('idx_repo_api_recommendations_repo')
    .on('repository_api_recommendations')
    .column('repository_id')
    .execute();

  await db.schema
    .createIndex('idx_repo_api_recommendations_status')
    .on('repository_api_recommendations')
    .column('recommendation_status')
    .execute();

  await db.schema
    .createIndex('idx_repo_api_recommendations_confidence')
    .on('repository_api_recommendations')
    .columns(['usage_confidence desc'])
    .execute();

  // Unique constraint for repository/doc combination
  await db.schema
    .createIndex('unique_repo_api_recommendations')
    .on('repository_api_recommendations')
    .columns(['repository_id', 'discovered_doc_id'])
    .unique()
    .execute();

  // Insert default API documentation sources
  logger.info('Inserting default API documentation sources...');
  await db.insertInto('api_documentation_sources').values([
    {
      name: 'npm',
      base_url: 'https://www.npmjs.com',
      documentation_pattern: 'https://www.npmjs.com/package/{package}',
      version_pattern: null,
      supported_languages: ['javascript', 'typescript', 'nodejs'],
      is_active: true
    },
    {
      name: 'pypi',
      base_url: 'https://pypi.org',
      documentation_pattern: 'https://pypi.org/project/{package}/',
      version_pattern: null,
      supported_languages: ['python'],
      is_active: true
    },
    {
      name: 'docs.rs',
      base_url: 'https://docs.rs',
      documentation_pattern: 'https://docs.rs/{package}',
      version_pattern: 'https://docs.rs/{package}/{version}',
      supported_languages: ['rust'],
      is_active: true
    },
    {
      name: 'golang.org',
      base_url: 'https://pkg.go.dev',
      documentation_pattern: 'https://pkg.go.dev/{package}',
      version_pattern: 'https://pkg.go.dev/{package}@{version}',
      supported_languages: ['go'],
      is_active: true
    },
    {
      name: 'maven',
      base_url: 'https://mvnrepository.com',
      documentation_pattern: 'https://mvnrepository.com/artifact/{group}/{artifact}',
      version_pattern: null,
      supported_languages: ['java', 'kotlin', 'scala'],
      is_active: true
    },
    {
      name: 'nuget',
      base_url: 'https://www.nuget.org',
      documentation_pattern: 'https://www.nuget.org/packages/{package}',
      version_pattern: null,
      supported_languages: ['csharp', 'fsharp', 'vb.net'],
      is_active: true
    }
  ]).execute();

  logger.info('API documentation discovery schema created successfully');
}

export async function down(db: Kysely<any>): Promise<void> {
  logger.info('Rolling back API documentation discovery schema...');

  // Drop tables in reverse order (respecting foreign keys)
  logger.info('Dropping repository_api_recommendations table...');
  await db.schema.dropTable('repository_api_recommendations').execute();

  logger.info('Dropping discovered_api_docs table...');
  await db.schema.dropTable('discovered_api_docs').execute();

  logger.info('Dropping api_documentation_sources table...');
  await db.schema.dropTable('api_documentation_sources').execute();

  logger.info('API documentation discovery schema rollback completed successfully');
}

// Export the migration object as required by the migration provider
export const apiDocumentationDiscovery = {
  up,
  down
};