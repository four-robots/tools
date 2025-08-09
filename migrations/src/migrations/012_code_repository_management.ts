/**
 * Code Repository Management Migration
 * 
 * This migration creates comprehensive tables for managing code repositories,
 * supporting multiple Git providers (GitHub, GitLab, Bitbucket, local),
 * webhook integration, and repository synchronization.
 * 
 * Key Features:
 * - Multi-provider Git integration
 * - Webhook management for real-time updates
 * - Repository synchronization with change tracking
 * - Branch and file management
 * - Comprehensive error handling and logging
 * 
 * Created: January 2025
 * Part of: Phase 2 Codebase Analysis System
 */

import { Kysely, sql } from 'kysely';
import type { Migration } from 'kysely';
import { logger } from '../utils/logger.js';

export const codeRepositoryManagement: Migration = {
  async up(db: Kysely<any>): Promise<void> {
    logger.info('Running migration: 012_code_repository_management (up)');
    logger.info('Creating code repository management schema...');

    // ===================
    // REPOSITORY MANAGEMENT TABLES
    // ===================

    // Code repositories table - central repository registry
    await db.schema
      .createTable('code_repositories')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('name', 'varchar(255)', (col) => col.notNull())
      .addColumn('url', 'text', (col) => col.notNull())
      .addColumn('provider', 'varchar(50)', (col) => col.notNull()) // github, gitlab, bitbucket, local
      .addColumn('access_token_encrypted', 'text')
      .addColumn('default_branch', 'varchar(100)', (col) => col.defaultTo('main'))
      .addColumn('description', 'text')
      .addColumn('language', 'varchar(50)')
      .addColumn('stars_count', 'integer', (col) => col.defaultTo(0))
      .addColumn('forks_count', 'integer', (col) => col.defaultTo(0))
      .addColumn('size_kb', 'integer', (col) => col.defaultTo(0))
      .addColumn('last_sync_at', 'timestamptz')
      .addColumn('sync_status', 'varchar(20)', (col) => col.defaultTo('pending')) // pending, syncing, completed, failed
      .addColumn('sync_error', 'text')
      .addColumn('settings', 'jsonb', (col) => col.defaultTo(sql`'{}'::jsonb`))
      .addColumn('webhook_secret', 'varchar(255)')
      .addColumn('is_active', 'boolean', (col) => col.defaultTo(true))
      .addColumn('created_at', 'timestamptz', (col) => col.defaultTo(sql`now()`))
      .addColumn('updated_at', 'timestamptz', (col) => col.defaultTo(sql`now()`))
      .execute();

    // Repository branches table - track all branches per repository
    await db.schema
      .createTable('repository_branches')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('repository_id', 'uuid', (col) => col.notNull().references('code_repositories.id').onDelete('cascade'))
      .addColumn('name', 'varchar(255)', (col) => col.notNull())
      .addColumn('commit_hash', 'varchar(40)', (col) => col.notNull())
      .addColumn('commit_message', 'text')
      .addColumn('author_name', 'varchar(255)')
      .addColumn('author_email', 'varchar(255)')
      .addColumn('last_commit_at', 'timestamptz')
      .addColumn('is_default', 'boolean', (col) => col.defaultTo(false))
      .addColumn('is_protected', 'boolean', (col) => col.defaultTo(false))
      .addColumn('created_at', 'timestamptz', (col) => col.defaultTo(sql`now()`))
      .addColumn('updated_at', 'timestamptz', (col) => col.defaultTo(sql`now()`))
      .execute();

    // Repository sync logs table - comprehensive sync operation tracking
    await db.schema
      .createTable('repository_sync_logs')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('repository_id', 'uuid', (col) => col.notNull().references('code_repositories.id').onDelete('cascade'))
      .addColumn('branch_name', 'varchar(255)')
      .addColumn('sync_type', 'varchar(20)', (col) => col.notNull()) // full, incremental, webhook
      .addColumn('status', 'varchar(20)', (col) => col.notNull()) // started, completed, failed
      .addColumn('files_processed', 'integer', (col) => col.defaultTo(0))
      .addColumn('files_added', 'integer', (col) => col.defaultTo(0))
      .addColumn('files_modified', 'integer', (col) => col.defaultTo(0))
      .addColumn('files_deleted', 'integer', (col) => col.defaultTo(0))
      .addColumn('errors_encountered', 'integer', (col) => col.defaultTo(0))
      .addColumn('duration_ms', 'integer')
      .addColumn('error_details', 'jsonb')
      .addColumn('commit_hash', 'varchar(40)')
      .addColumn('started_at', 'timestamptz', (col) => col.defaultTo(sql`now()`))
      .addColumn('completed_at', 'timestamptz')
      .execute();

    // Code files table - enhanced file tracking with repository context
    await db.schema
      .createTable('code_files')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('repository_id', 'uuid', (col) => col.notNull().references('code_repositories.id').onDelete('cascade'))
      .addColumn('path', 'text', (col) => col.notNull())
      .addColumn('filename', 'varchar(255)', (col) => col.notNull())
      .addColumn('extension', 'varchar(20)')
      .addColumn('language', 'varchar(50)')
      .addColumn('size_bytes', 'integer', (col) => col.defaultTo(0))
      .addColumn('lines_count', 'integer', (col) => col.defaultTo(0))
      .addColumn('content_hash', 'varchar(64)')
      .addColumn('last_modified', 'timestamptz')
      .addColumn('commit_hash', 'varchar(40)')
      .addColumn('branch', 'varchar(255)')
      .addColumn('is_binary', 'boolean', (col) => col.defaultTo(false))
      .addColumn('is_deleted', 'boolean', (col) => col.defaultTo(false))
      .addColumn('created_at', 'timestamptz', (col) => col.defaultTo(sql`now()`))
      .addColumn('updated_at', 'timestamptz', (col) => col.defaultTo(sql`now()`))
      .execute();

    // Repository webhooks table - webhook management and tracking
    await db.schema
      .createTable('repository_webhooks')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('repository_id', 'uuid', (col) => col.notNull().references('code_repositories.id').onDelete('cascade'))
      .addColumn('webhook_id', 'varchar(255)') // Provider-specific webhook ID
      .addColumn('webhook_url', 'text', (col) => col.notNull())
      .addColumn('secret', 'varchar(255)')
      .addColumn('events', 'jsonb', (col) => col.defaultTo(sql`'[]'::jsonb`)) // push, pull_request, etc.
      .addColumn('is_active', 'boolean', (col) => col.defaultTo(true))
      .addColumn('last_delivery_at', 'timestamptz')
      .addColumn('delivery_count', 'integer', (col) => col.defaultTo(0))
      .addColumn('error_count', 'integer', (col) => col.defaultTo(0))
      .addColumn('created_at', 'timestamptz', (col) => col.defaultTo(sql`now()`))
      .addColumn('updated_at', 'timestamptz', (col) => col.defaultTo(sql`now()`))
      .execute();

    // ===================
    // PERFORMANCE INDEXES
    // ===================

    logger.info('Creating repository management indexes...');

    // Repository indexes
    await db.schema
      .createIndex('idx_code_repositories_provider')
      .on('code_repositories')
      .column('provider')
      .execute();

    await db.schema
      .createIndex('idx_code_repositories_sync_status')
      .on('code_repositories')
      .column('sync_status')
      .execute();

    await db.schema
      .createIndex('idx_code_repositories_active')
      .on('code_repositories')
      .column('is_active')
      .execute();

    await db.schema
      .createIndex('idx_code_repositories_url')
      .on('code_repositories')
      .column('url')
      .execute();

    // Branch indexes
    await db.schema
      .createIndex('unique_repository_branches')
      .on('repository_branches')
      .columns(['repository_id', 'name'])
      .unique()
      .execute();

    await db.schema
      .createIndex('idx_repository_branches_repo')
      .on('repository_branches')
      .column('repository_id')
      .execute();

    await db.schema
      .createIndex('idx_repository_branches_default')
      .on('repository_branches')
      .column('is_default')
      .execute();

    await db.schema
      .createIndex('idx_repository_branches_commit')
      .on('repository_branches')
      .column('commit_hash')
      .execute();

    // Sync log indexes
    await db.schema
      .createIndex('idx_repository_sync_logs_repo')
      .on('repository_sync_logs')
      .column('repository_id')
      .execute();

    await db.schema
      .createIndex('idx_repository_sync_logs_status')
      .on('repository_sync_logs')
      .column('status')
      .execute();

    await db.schema
      .createIndex('idx_repository_sync_logs_started')
      .on('repository_sync_logs')
      .columns(['started_at desc'])
      .execute();

    await db.schema
      .createIndex('idx_repository_sync_logs_type')
      .on('repository_sync_logs')
      .column('sync_type')
      .execute();

    // Code file indexes
    await db.schema
      .createIndex('idx_code_files_repo')
      .on('code_files')
      .column('repository_id')
      .execute();

    await db.schema
      .createIndex('idx_code_files_path')
      .on('code_files')
      .column('path')
      .execute();

    await db.schema
      .createIndex('idx_code_files_extension')
      .on('code_files')
      .column('extension')
      .execute();

    await db.schema
      .createIndex('idx_code_files_language')
      .on('code_files')
      .column('language')
      .execute();

    await db.schema
      .createIndex('idx_code_files_hash')
      .on('code_files')
      .column('content_hash')
      .execute();

    await db.schema
      .createIndex('idx_code_files_deleted')
      .on('code_files')
      .column('is_deleted')
      .execute();

    await db.schema
      .createIndex('idx_code_files_branch')
      .on('code_files')
      .column('branch')
      .execute();

    // Unique constraint for file paths per repository
    await db.schema
      .createIndex('unique_code_files_repo_path')
      .on('code_files')
      .columns(['repository_id', 'path'])
      .unique()
      .execute();

    // Webhook indexes
    await db.schema
      .createIndex('idx_repository_webhooks_repo')
      .on('repository_webhooks')
      .column('repository_id')
      .execute();

    await db.schema
      .createIndex('idx_repository_webhooks_active')
      .on('repository_webhooks')
      .column('is_active')
      .execute();

    await db.schema
      .createIndex('idx_repository_webhooks_delivery')
      .on('repository_webhooks')
      .column('last_delivery_at')
      .execute();

    logger.info('Migration 012_code_repository_management completed successfully');
    logger.info('Repository management schema created with comprehensive indexing');
  },

  async down(db: Kysely<any>): Promise<void> {
    logger.info('Running migration: 012_code_repository_management (down)');
    logger.info('Dropping code repository management schema...');

    // Drop indexes first
    const indexes = [
      'idx_repository_webhooks_delivery',
      'idx_repository_webhooks_active', 
      'idx_repository_webhooks_repo',
      'unique_code_files_repo_path',
      'idx_code_files_branch',
      'idx_code_files_deleted',
      'idx_code_files_hash',
      'idx_code_files_language',
      'idx_code_files_extension',
      'idx_code_files_path',
      'idx_code_files_repo',
      'idx_repository_sync_logs_type',
      'idx_repository_sync_logs_started',
      'idx_repository_sync_logs_status',
      'idx_repository_sync_logs_repo',
      'idx_repository_branches_commit',
      'idx_repository_branches_default',
      'idx_repository_branches_repo',
      'unique_repository_branches',
      'idx_code_repositories_url',
      'idx_code_repositories_active',
      'idx_code_repositories_sync_status',
      'idx_code_repositories_provider'
    ];

    for (const index of indexes) {
      await db.schema.dropIndex(index).ifExists().execute();
    }

    // Drop tables in reverse dependency order
    await db.schema.dropTable('repository_webhooks').ifExists().execute();
    await db.schema.dropTable('code_files').ifExists().execute();
    await db.schema.dropTable('repository_sync_logs').ifExists().execute();
    await db.schema.dropTable('repository_branches').ifExists().execute();
    await db.schema.dropTable('code_repositories').ifExists().execute();

    logger.info('Migration 012_code_repository_management rollback completed');
  }
};