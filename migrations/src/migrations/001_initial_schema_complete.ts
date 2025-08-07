/**
 * Complete Initial Schema Migration
 * 
 * This migration creates the entire MCP Tools database schema from scratch
 * with UUID primary keys for optimal performance and distributed system compatibility.
 * 
 * Database: PostgreSQL 12+ (required for UUID support)
 * Architecture: UUID-based primary keys throughout
 * 
 * Created: January 2025
 * Consolidates: All previous migrations into single comprehensive schema
 */

import { Kysely, sql } from 'kysely';
import type { Migration } from 'kysely';
import { logger } from '../utils/logger.js';

export const initialSchemaComplete: Migration = {
  async up(db: Kysely<any>): Promise<void> {
    logger.info('Running migration: 001_initial_schema_complete (up)');
    logger.info('Creating complete MCP Tools schema with UUID primary keys');

    // ===================
    // KANBAN SYSTEM TABLES
    // ===================
    
    logger.info('Creating Kanban system tables...');

    // Boards table
    await db.schema
      .createTable('boards')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('name', 'varchar(255)', (col) => col.notNull())
      .addColumn('slug', 'varchar(255)', (col) => col.notNull().unique())
      .addColumn('description', 'text')
      .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
      .addColumn('updated_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
      .addColumn('color', 'varchar(7)', (col) => col.defaultTo('#6366f1'))
      .execute();

    // Columns table (kanban columns/swim lanes)
    await db.schema
      .createTable('columns')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('board_id', 'uuid', (col) => col.notNull())
      .addColumn('name', 'varchar(255)', (col) => col.notNull())
      .addColumn('position', 'integer', (col) => col.notNull().defaultTo(0))
      .addColumn('color', 'varchar(7)', (col) => col.defaultTo('#64748b'))
      .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
      .addForeignKeyConstraint('fk_columns_board', ['board_id'], 'boards', ['id'], (cb) => cb.onDelete('cascade'))
      .execute();

    // Cards table
    await db.schema
      .createTable('cards')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('board_id', 'uuid', (col) => col.notNull())
      .addColumn('column_id', 'uuid', (col) => col.notNull())
      .addColumn('title', 'varchar(255)', (col) => col.notNull())
      .addColumn('slug', 'varchar(255)', (col) => col.notNull())
      .addColumn('description', 'text')
      .addColumn('position', 'integer', (col) => col.notNull().defaultTo(0))
      .addColumn('priority', 'varchar(20)', (col) => col.defaultTo('medium'))
      .addColumn('assigned_to', 'varchar(255)')
      .addColumn('due_date', 'date')
      .addColumn('estimated_hours', 'real')
      .addColumn('actual_hours', 'real')
      .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
      .addColumn('updated_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
      .addForeignKeyConstraint('fk_cards_board', ['board_id'], 'boards', ['id'], (cb) => cb.onDelete('cascade'))
      .addForeignKeyConstraint('fk_cards_column', ['column_id'], 'columns', ['id'], (cb) => cb.onDelete('cascade'))
      .addUniqueConstraint('uk_cards_slug_board', ['board_id', 'slug'])
      .execute();

    // Tags table (kanban tags)
    await db.schema
      .createTable('tags')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('name', 'varchar(100)', (col) => col.notNull().unique())
      .addColumn('color', 'varchar(7)', (col) => col.defaultTo('#64748b'))
      .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
      .execute();

    // Card tags junction table
    await db.schema
      .createTable('card_tags')
      .addColumn('card_id', 'uuid', (col) => col.notNull())
      .addColumn('tag_id', 'uuid', (col) => col.notNull())
      .addPrimaryKeyConstraint('pk_card_tags', ['card_id', 'tag_id'])
      .addForeignKeyConstraint('fk_card_tags_card', ['card_id'], 'cards', ['id'], (cb) => cb.onDelete('cascade'))
      .addForeignKeyConstraint('fk_card_tags_tag', ['tag_id'], 'tags', ['id'], (cb) => cb.onDelete('cascade'))
      .execute();

    // Comments table (kanban card comments)
    await db.schema
      .createTable('comments')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('card_id', 'uuid', (col) => col.notNull())
      .addColumn('content', 'text', (col) => col.notNull())
      .addColumn('author', 'varchar(255)')
      .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
      .addForeignKeyConstraint('fk_comments_card', ['card_id'], 'cards', ['id'], (cb) => cb.onDelete('cascade'))
      .execute();

    // Custom fields table
    await db.schema
      .createTable('custom_fields')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('board_id', 'uuid', (col) => col.notNull())
      .addColumn('name', 'varchar(255)', (col) => col.notNull())
      .addColumn('field_type', 'varchar(50)', (col) => col.notNull())
      .addColumn('options', 'jsonb')
      .addColumn('required', 'boolean', (col) => col.defaultTo(false))
      .addColumn('validation_rules', 'jsonb')
      .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
      .addForeignKeyConstraint('fk_custom_fields_board', ['board_id'], 'boards', ['id'], (cb) => cb.onDelete('cascade'))
      .execute();

    // Card custom field values table
    await db.schema
      .createTable('card_custom_field_values')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('card_id', 'uuid', (col) => col.notNull())
      .addColumn('custom_field_id', 'uuid', (col) => col.notNull())
      .addColumn('value', 'jsonb', (col) => col.notNull())
      .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
      .addColumn('updated_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
      .addForeignKeyConstraint('fk_custom_field_values_card', ['card_id'], 'cards', ['id'], (cb) => cb.onDelete('cascade'))
      .addForeignKeyConstraint('fk_custom_field_values_field', ['custom_field_id'], 'custom_fields', ['id'], (cb) => cb.onDelete('cascade'))
      .addUniqueConstraint('uk_card_custom_field', ['card_id', 'custom_field_id'])
      .execute();

    // Milestones table
    await db.schema
      .createTable('milestones')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('board_id', 'uuid', (col) => col.notNull())
      .addColumn('name', 'varchar(255)', (col) => col.notNull())
      .addColumn('description', 'text')
      .addColumn('due_date', 'date')
      .addColumn('status', 'varchar(50)', (col) => col.defaultTo('open'))
      .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
      .addColumn('updated_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
      .addForeignKeyConstraint('fk_milestones_board', ['board_id'], 'boards', ['id'], (cb) => cb.onDelete('cascade'))
      .execute();

    // Card milestones junction table
    await db.schema
      .createTable('card_milestones')
      .addColumn('card_id', 'uuid', (col) => col.notNull())
      .addColumn('milestone_id', 'uuid', (col) => col.notNull())
      .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
      .addPrimaryKeyConstraint('pk_card_milestones', ['card_id', 'milestone_id'])
      .addForeignKeyConstraint('fk_card_milestones_card', ['card_id'], 'cards', ['id'], (cb) => cb.onDelete('cascade'))
      .addForeignKeyConstraint('fk_card_milestones_milestone', ['milestone_id'], 'milestones', ['id'], (cb) => cb.onDelete('cascade'))
      .execute();

    // Card subtasks table
    await db.schema
      .createTable('card_subtasks')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('card_id', 'uuid', (col) => col.notNull())
      .addColumn('title', 'varchar(255)', (col) => col.notNull())
      .addColumn('description', 'text')
      .addColumn('completed', 'boolean', (col) => col.defaultTo(false))
      .addColumn('position', 'integer', (col) => col.defaultTo(0))
      .addColumn('parent_subtask_id', 'uuid')
      .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
      .addColumn('updated_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
      .addForeignKeyConstraint('fk_card_subtasks_card', ['card_id'], 'cards', ['id'], (cb) => cb.onDelete('cascade'))
      .addForeignKeyConstraint('fk_card_subtasks_parent', ['parent_subtask_id'], 'card_subtasks', ['id'], (cb) => cb.onDelete('cascade'))
      .execute();

    // Card links table
    await db.schema
      .createTable('card_links')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('source_card_id', 'uuid', (col) => col.notNull())
      .addColumn('target_card_id', 'uuid', (col) => col.notNull())
      .addColumn('link_type', 'varchar(50)', (col) => col.notNull())
      .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
      .addForeignKeyConstraint('fk_card_links_source', ['source_card_id'], 'cards', ['id'], (cb) => cb.onDelete('cascade'))
      .addForeignKeyConstraint('fk_card_links_target', ['target_card_id'], 'cards', ['id'], (cb) => cb.onDelete('cascade'))
      .addUniqueConstraint('uk_card_links', ['source_card_id', 'target_card_id', 'link_type'])
      .execute();

    // Time entries table
    await db.schema
      .createTable('time_entries')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('card_id', 'uuid', (col) => col.notNull())
      .addColumn('user_id', 'varchar(255)')
      .addColumn('hours', 'decimal', (col) => col.notNull())
      .addColumn('description', 'text')
      .addColumn('date_logged', 'date', (col) => col.notNull())
      .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
      .addForeignKeyConstraint('fk_time_entries_card', ['card_id'], 'cards', ['id'], (cb) => cb.onDelete('cascade'))
      .execute();

    // Card activities table
    await db.schema
      .createTable('card_activities')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('card_id', 'uuid', (col) => col.notNull())
      .addColumn('board_id', 'uuid', (col) => col.notNull())
      .addColumn('user_id', 'varchar(255)')
      .addColumn('activity_type', 'varchar(50)', (col) => col.notNull())
      .addColumn('activity_data', 'jsonb')
      .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
      .addForeignKeyConstraint('fk_card_activities_card', ['card_id'], 'cards', ['id'], (cb) => cb.onDelete('cascade'))
      .addForeignKeyConstraint('fk_card_activities_board', ['board_id'], 'boards', ['id'], (cb) => cb.onDelete('cascade'))
      .execute();

    // ===================
    // WIKI SYSTEM TABLES
    // ===================

    logger.info('Creating Wiki system tables...');

    // Pages table
    await db.schema
      .createTable('pages')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('title', 'varchar(255)', (col) => col.notNull())
      .addColumn('slug', 'varchar(255)', (col) => col.notNull().unique())
      .addColumn('content', 'text', (col) => col.notNull())
      .addColumn('summary', 'text')
      .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
      .addColumn('updated_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
      .addColumn('created_by', 'varchar(255)')
      .addColumn('updated_by', 'varchar(255)')
      .addColumn('is_published', 'boolean', (col) => col.defaultTo(true))
      .addColumn('parent_id', 'uuid')
      .addColumn('sort_order', 'integer', (col) => col.defaultTo(0))
      .addForeignKeyConstraint('fk_pages_parent', ['parent_id'], 'pages', ['id'], (cb) => cb.onDelete('set null'))
      .execute();

    // Categories table (wiki categories)
    await db.schema
      .createTable('categories')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('name', 'varchar(255)', (col) => col.notNull().unique())
      .addColumn('description', 'text')
      .addColumn('color', 'varchar(7)', (col) => col.defaultTo('#6366f1'))
      .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
      .execute();

    // Page categories junction table
    await db.schema
      .createTable('page_categories')
      .addColumn('page_id', 'uuid', (col) => col.notNull())
      .addColumn('category_id', 'uuid', (col) => col.notNull())
      .addPrimaryKeyConstraint('pk_page_categories', ['page_id', 'category_id'])
      .addForeignKeyConstraint('fk_page_categories_page', ['page_id'], 'pages', ['id'], (cb) => cb.onDelete('cascade'))
      .addForeignKeyConstraint('fk_page_categories_category', ['category_id'], 'categories', ['id'], (cb) => cb.onDelete('cascade'))
      .execute();

    // Wiki tags table (separate from kanban tags to avoid conflicts)
    await db.schema
      .createTable('wiki_tags')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('name', 'varchar(100)', (col) => col.notNull().unique())
      .addColumn('color', 'varchar(7)', (col) => col.defaultTo('#64748b'))
      .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
      .execute();

    // Page tags junction table
    await db.schema
      .createTable('page_tags')
      .addColumn('page_id', 'uuid', (col) => col.notNull())
      .addColumn('tag_id', 'uuid', (col) => col.notNull())
      .addPrimaryKeyConstraint('pk_page_tags', ['page_id', 'tag_id'])
      .addForeignKeyConstraint('fk_page_tags_page', ['page_id'], 'pages', ['id'], (cb) => cb.onDelete('cascade'))
      .addForeignKeyConstraint('fk_page_tags_tag', ['tag_id'], 'wiki_tags', ['id'], (cb) => cb.onDelete('cascade'))
      .execute();

    // Page links table (internal wiki links)
    await db.schema
      .createTable('page_links')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('source_page_id', 'uuid', (col) => col.notNull())
      .addColumn('target_page_id', 'uuid', (col) => col.notNull())
      .addColumn('link_text', 'varchar(255)')
      .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
      .addUniqueConstraint('uk_page_links', ['source_page_id', 'target_page_id'])
      .addForeignKeyConstraint('fk_page_links_source', ['source_page_id'], 'pages', ['id'], (cb) => cb.onDelete('cascade'))
      .addForeignKeyConstraint('fk_page_links_target', ['target_page_id'], 'pages', ['id'], (cb) => cb.onDelete('cascade'))
      .execute();

    // Wiki attachments table
    await db.schema
      .createTable('wiki_attachments')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('page_id', 'uuid', (col) => col.notNull())
      .addColumn('filename', 'text', (col) => col.notNull())
      .addColumn('original_name', 'text', (col) => col.notNull())
      .addColumn('mime_type', 'text', (col) => col.notNull())
      .addColumn('size_bytes', 'integer', (col) => col.notNull())
      .addColumn('storage_path', 'text', (col) => col.notNull())
      .addColumn('thumbnail_path', 'text')
      .addColumn('description', 'text')
      .addColumn('uploaded_by', 'text')
      .addColumn('uploaded_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
      .addForeignKeyConstraint('fk_wiki_attachments_page', ['page_id'], 'pages', ['id'], (cb) => cb.onDelete('cascade'))
      .execute();

    // Page history table (version control)
    await db.schema
      .createTable('page_history')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('page_id', 'uuid', (col) => col.notNull())
      .addColumn('title', 'varchar(255)', (col) => col.notNull())
      .addColumn('content', 'text', (col) => col.notNull())
      .addColumn('summary', 'text')
      .addColumn('changed_by', 'varchar(255)')
      .addColumn('change_reason', 'varchar(500)')
      .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
      .addForeignKeyConstraint('fk_page_history_page', ['page_id'], 'pages', ['id'], (cb) => cb.onDelete('cascade'))
      .execute();

    // Wiki comments table (separate from kanban comments)
    await db.schema
      .createTable('wiki_comments')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('page_id', 'uuid', (col) => col.notNull())
      .addColumn('content', 'text', (col) => col.notNull())
      .addColumn('author', 'varchar(255)')
      .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
      .addColumn('updated_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
      .addColumn('parent_id', 'uuid')
      .addForeignKeyConstraint('fk_wiki_comments_page', ['page_id'], 'pages', ['id'], (cb) => cb.onDelete('cascade'))
      .addForeignKeyConstraint('fk_wiki_comments_parent', ['parent_id'], 'wiki_comments', ['id'], (cb) => cb.onDelete('cascade'))
      .execute();

    // ===================
    // MEMORY SYSTEM TABLES
    // ===================

    logger.info('Creating Memory system tables...');

    // Memories table
    await db.schema
      .createTable('memories')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('content', 'text', (col) => col.notNull())
      .addColumn('content_hash', 'text', (col) => col.notNull())
      .addColumn('context', 'jsonb', (col) => col.notNull())
      .addColumn('importance', 'integer', (col) => col.notNull().defaultTo(1))
      .addColumn('status', 'text', (col) => col.notNull().defaultTo('active'))
      .addColumn('access_count', 'integer', (col) => col.notNull().defaultTo(0))
      .addColumn('last_accessed_at', 'timestamp')
      .addColumn('vector_id', 'text')
      .addColumn('created_at', 'timestamp', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
      .addColumn('updated_at', 'timestamp', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
      .addColumn('created_by', 'text')
      .addColumn('metadata', 'jsonb')
      .execute();

    // Relationships table (memory connections)
    await db.schema
      .createTable('relationships')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('source_id', 'uuid', (col) => col.notNull())
      .addColumn('target_id', 'uuid', (col) => col.notNull())
      .addColumn('relationship_type', 'text', (col) => col.notNull())
      .addColumn('strength', 'decimal', (col) => col.notNull().defaultTo(1.0))
      .addColumn('bidirectional', 'boolean', (col) => col.notNull().defaultTo(false))
      .addColumn('metadata', 'jsonb', (col) => col.notNull().defaultTo('{}'))
      .addColumn('created_at', 'timestamp', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
      .addColumn('updated_at', 'timestamp', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
      .addColumn('last_updated', 'timestamp', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
      .addForeignKeyConstraint('fk_relationships_source', ['source_id'], 'memories', ['id'], (cb) => cb.onDelete('cascade'))
      .addForeignKeyConstraint('fk_relationships_target', ['target_id'], 'memories', ['id'], (cb) => cb.onDelete('cascade'))
      .execute();

    // Concepts table
    await db.schema
      .createTable('concepts')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('name', 'text', (col) => col.notNull())
      .addColumn('description', 'text')
      .addColumn('type', 'text', (col) => col.notNull())
      .addColumn('confidence', 'decimal', (col) => col.notNull().defaultTo(1.0))
      .addColumn('extracted_at', 'timestamp', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
      .addColumn('created_at', 'timestamp', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
      .addColumn('updated_at', 'timestamp', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
      .execute();

    // Memory concepts junction table
    await db.schema
      .createTable('memory_concepts')
      .addColumn('memory_id', 'uuid', (col) => col.notNull())
      .addColumn('concept_id', 'uuid', (col) => col.notNull())
      .addColumn('created_at', 'timestamp', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
      .addPrimaryKeyConstraint('pk_memory_concepts', ['memory_id', 'concept_id'])
      .addForeignKeyConstraint('fk_memory_concepts_memory', ['memory_id'], 'memories', ['id'], (cb) => cb.onDelete('cascade'))
      .addForeignKeyConstraint('fk_memory_concepts_concept', ['concept_id'], 'concepts', ['id'], (cb) => cb.onDelete('cascade'))
      .execute();

    // Memory snapshots table
    await db.schema
      .createTable('memory_snapshots')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('memory_id', 'uuid', (col) => col.notNull())
      .addColumn('snapshot_data', 'jsonb', (col) => col.notNull())
      .addColumn('version', 'integer', (col) => col.notNull())
      .addColumn('change_reason', 'text')
      .addColumn('created_at', 'timestamp', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
      .addColumn('created_by', 'text')
      .addForeignKeyConstraint('fk_memory_snapshots_memory', ['memory_id'], 'memories', ['id'], (cb) => cb.onDelete('cascade'))
      .addUniqueConstraint('uk_memory_snapshots_version', ['memory_id', 'version'])
      .execute();

    // Concept hierarchies table
    await db.schema
      .createTable('concept_hierarchies')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('parent_concept_id', 'uuid', (col) => col.notNull())
      .addColumn('child_concept_id', 'uuid', (col) => col.notNull())
      .addColumn('relationship_type', 'text', (col) => col.notNull().defaultTo('is-a'))
      .addColumn('strength', 'decimal', (col) => col.notNull().defaultTo(1.0))
      .addColumn('created_at', 'timestamp', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
      .addColumn('updated_at', 'timestamp', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
      .addForeignKeyConstraint('fk_concept_hierarchies_parent', ['parent_concept_id'], 'concepts', ['id'], (cb) => cb.onDelete('cascade'))
      .addForeignKeyConstraint('fk_concept_hierarchies_child', ['child_concept_id'], 'concepts', ['id'], (cb) => cb.onDelete('cascade'))
      .addUniqueConstraint('uk_concept_hierarchies', ['parent_concept_id', 'child_concept_id', 'relationship_type'])
      .execute();

    // Memory clusters table
    await db.schema
      .createTable('memory_clusters')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('name', 'text', (col) => col.notNull())
      .addColumn('description', 'text')
      .addColumn('cluster_type', 'text', (col) => col.notNull().defaultTo('semantic'))
      .addColumn('centroid_vector_id', 'text')
      .addColumn('cohesion_score', 'decimal', (col) => col.defaultTo(0.0))
      .addColumn('created_at', 'timestamp', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
      .addColumn('updated_at', 'timestamp', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
      .addColumn('created_by', 'text')
      .execute();

    // Memory cluster memberships junction table
    await db.schema
      .createTable('memory_cluster_memberships')
      .addColumn('memory_id', 'uuid', (col) => col.notNull())
      .addColumn('cluster_id', 'uuid', (col) => col.notNull())
      .addColumn('membership_score', 'decimal', (col) => col.notNull().defaultTo(1.0))
      .addColumn('created_at', 'timestamp', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
      .addPrimaryKeyConstraint('pk_memory_cluster_memberships', ['memory_id', 'cluster_id'])
      .addForeignKeyConstraint('fk_memory_cluster_memberships_memory', ['memory_id'], 'memories', ['id'], (cb) => cb.onDelete('cascade'))
      .addForeignKeyConstraint('fk_memory_cluster_memberships_cluster', ['cluster_id'], 'memory_clusters', ['id'], (cb) => cb.onDelete('cascade'))
      .execute();

    // Context patterns table
    await db.schema
      .createTable('context_patterns')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('pattern_name', 'text', (col) => col.notNull())
      .addColumn('pattern_type', 'text', (col) => col.notNull())
      .addColumn('pattern_data', 'jsonb', (col) => col.notNull())
      .addColumn('frequency', 'integer', (col) => col.notNull().defaultTo(0))
      .addColumn('confidence', 'decimal', (col) => col.notNull().defaultTo(1.0))
      .addColumn('first_seen', 'timestamp', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
      .addColumn('last_seen', 'timestamp', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
      .addColumn('created_by', 'text')
      .execute();

    // Memory context patterns junction table
    await db.schema
      .createTable('memory_context_patterns')
      .addColumn('memory_id', 'uuid', (col) => col.notNull())
      .addColumn('pattern_id', 'uuid', (col) => col.notNull())
      .addColumn('match_score', 'decimal', (col) => col.notNull().defaultTo(1.0))
      .addColumn('created_at', 'timestamp', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
      .addPrimaryKeyConstraint('pk_memory_context_patterns', ['memory_id', 'pattern_id'])
      .addForeignKeyConstraint('fk_memory_context_patterns_memory', ['memory_id'], 'memories', ['id'], (cb) => cb.onDelete('cascade'))
      .addForeignKeyConstraint('fk_memory_context_patterns_pattern', ['pattern_id'], 'context_patterns', ['id'], (cb) => cb.onDelete('cascade'))
      .execute();

    // Memory access logs table
    await db.schema
      .createTable('memory_access_logs')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('memory_id', 'uuid', (col) => col.notNull())
      .addColumn('access_type', 'text', (col) => col.notNull())
      .addColumn('user_id', 'text')
      .addColumn('session_id', 'text')
      .addColumn('context_data', 'jsonb')
      .addColumn('timestamp', 'timestamp', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
      .addForeignKeyConstraint('fk_memory_access_logs_memory', ['memory_id'], 'memories', ['id'], (cb) => cb.onDelete('cascade'))
      .execute();

    // Knowledge graph metrics table
    await db.schema
      .createTable('knowledge_graph_metrics')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('metric_name', 'text', (col) => col.notNull())
      .addColumn('metric_value', 'decimal', (col) => col.notNull())
      .addColumn('metric_metadata', 'jsonb')
      .addColumn('calculation_timestamp', 'timestamp', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
      .addColumn('time_period', 'text')
      .addColumn('created_by', 'text')
      .execute();

    // Memory merges table (for tracking memory merge operations)
    await db.schema
      .createTable('memory_merges')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('primary_memory_id', 'uuid', (col) => col.notNull())
      .addColumn('merged_memory_ids', 'jsonb', (col) => col.notNull())
      .addColumn('merge_strategy', 'text', (col) => col.notNull())
      .addColumn('merge_metadata', 'jsonb')
      .addColumn('created_at', 'timestamp', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
      .addColumn('created_by', 'text')
      .addForeignKeyConstraint('fk_memory_merges_primary', ['primary_memory_id'], 'memories', ['id'], (cb) => cb.onDelete('cascade'))
      .execute();

    // ===================
    // SYSTEM TABLES
    // ===================

    logger.info('Creating System tables...');

    // Usage tracking table
    await db.schema
      .createTable('usage_tracking')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('service', 'text', (col) => col.notNull())
      .addColumn('operation', 'text', (col) => col.notNull())
      .addColumn('tokens_used', 'integer')
      .addColumn('cost_usd', 'decimal')
      .addColumn('timestamp', 'timestamp', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
      .execute();

    // Quality system tables for code quality tracking
    await db.schema
      .createTable('code_quality_metrics')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('file_path', 'text', (col) => col.notNull())
      .addColumn('metric_type', 'text', (col) => col.notNull())
      .addColumn('metric_value', 'decimal', (col) => col.notNull())
      .addColumn('threshold_status', 'text', (col) => col.notNull())
      .addColumn('calculated_at', 'timestamp', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
      .addColumn('commit_hash', 'text')
      .addColumn('branch_name', 'text')
      .execute();

    await db.schema
      .createTable('dependency_vulnerabilities')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('package_name', 'text', (col) => col.notNull())
      .addColumn('version', 'text', (col) => col.notNull())
      .addColumn('vulnerability_id', 'text', (col) => col.notNull())
      .addColumn('severity', 'text', (col) => col.notNull())
      .addColumn('description', 'text')
      .addColumn('fixed_version', 'text')
      .addColumn('discovered_at', 'timestamp', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
      .addColumn('status', 'text', (col) => col.defaultTo('open'))
      .execute();

    await db.schema
      .createTable('technical_debt_items')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('file_path', 'text', (col) => col.notNull())
      .addColumn('line_number', 'integer')
      .addColumn('debt_type', 'text', (col) => col.notNull())
      .addColumn('description', 'text', (col) => col.notNull())
      .addColumn('priority', 'text', (col) => col.defaultTo('medium'))
      .addColumn('estimated_effort', 'text')
      .addColumn('status', 'text', (col) => col.defaultTo('open'))
      .addColumn('created_at', 'timestamp', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
      .addColumn('updated_at', 'timestamp', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
      .addColumn('assigned_to', 'text')
      .execute();

    // Scraper system tables for web scraping and document processing
    await db.schema
      .createTable('scraper_performance')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('domain', 'text', (col) => col.notNull())
      .addColumn('processing_time_ms', 'integer', (col) => col.notNull())
      .addColumn('document_size_bytes', 'integer')
      .addColumn('success', 'boolean', (col) => col.notNull().defaultTo(true))
      .addColumn('error_message', 'text')
      .addColumn('timestamp', 'timestamp', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
      .addColumn('user_agent', 'text')
      .addColumn('response_status', 'integer')
      .execute();

    await db.schema
      .createTable('document_processing_queue')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('document_url', 'text', (col) => col.notNull())
      .addColumn('processing_status', 'text', (col) => col.notNull().defaultTo('pending'))
      .addColumn('priority', 'integer', (col) => col.defaultTo(5))
      .addColumn('retry_count', 'integer', (col) => col.defaultTo(0))
      .addColumn('max_retries', 'integer', (col) => col.defaultTo(3))
      .addColumn('last_error', 'text')
      .addColumn('created_at', 'timestamp', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
      .addColumn('updated_at', 'timestamp', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
      .addColumn('processed_at', 'timestamp')
      .addColumn('requested_by', 'text')
      .execute();

    await db.schema
      .createTable('extracted_content')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('source_url', 'text', (col) => col.notNull())
      .addColumn('content_type', 'text', (col) => col.notNull())
      .addColumn('title', 'text')
      .addColumn('content', 'text', (col) => col.notNull())
      .addColumn('metadata', 'jsonb')
      .addColumn('extraction_method', 'text', (col) => col.notNull())
      .addColumn('confidence_score', 'decimal')
      .addColumn('word_count', 'integer')
      .addColumn('language', 'text')
      .addColumn('extracted_at', 'timestamp', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
      .addColumn('content_hash', 'text', (col) => col.notNull())
      .execute();



    // System administration tables
    logger.info('Creating system administration tables...');
    
    await db.schema
      .createTable('data_retention_policies')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('table_name', 'text', (col) => col.notNull().unique())
      .addColumn('retention_days', 'integer', (col) => col.notNull())
      .addColumn('conditions', 'jsonb', (col) => col.defaultTo('{}'))
      .addColumn('is_active', 'boolean', (col) => col.defaultTo(true))
      .addColumn('created_at', 'timestamp', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
      .addColumn('updated_at', 'timestamp', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
      .execute();

    await db.schema
      .createTable('notification_preferences')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('user_id', 'text', (col) => col.notNull())
      .addColumn('notification_type', 'text', (col) => col.notNull())
      .addColumn('channel', 'text', (col) => col.notNull())
      .addColumn('is_enabled', 'boolean', (col) => col.defaultTo(true))
      .addColumn('settings', 'jsonb', (col) => col.defaultTo('{}'))
      .addColumn('created_at', 'timestamp', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
      .addColumn('updated_at', 'timestamp', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
      .addUniqueConstraint('uk_notification_preferences', ['user_id', 'notification_type', 'channel'])
      .execute();

    await db.schema
      .createTable('feature_flags')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('flag_name', 'text', (col) => col.notNull().unique())
      .addColumn('description', 'text')
      .addColumn('is_enabled', 'boolean', (col) => col.defaultTo(false))
      .addColumn('conditions', 'jsonb', (col) => col.defaultTo('{}'))
      .addColumn('rollout_percentage', 'decimal', (col) => col.defaultTo(0))
      .addColumn('created_at', 'timestamp', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
      .addColumn('updated_at', 'timestamp', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
      .addColumn('created_by', 'text')
      .execute();

    // ===================
    // PERFORMANCE INDEXES
    // ===================
    
    logger.info('Creating performance indexes...');
    
    // Kanban indexes
    await db.schema
      .createIndex('idx_boards_slug')
      .on('boards')
      .column('slug')
      .execute();

    await db.schema
      .createIndex('idx_cards_slug')
      .on('cards')
      .column('slug')
      .execute();

    await db.schema
      .createIndex('idx_cards_board_column')
      .on('cards')
      .columns(['board_id', 'column_id'])
      .execute();

    await db.schema
      .createIndex('idx_cards_assigned_to')
      .on('cards')
      .column('assigned_to')
      .execute();

    await db.schema
      .createIndex('idx_card_activities_board_created')
      .on('card_activities')
      .columns(['board_id', 'created_at'])
      .execute();

    // Wiki indexes
    await db.schema
      .createIndex('idx_pages_slug')
      .on('pages')
      .column('slug')
      .execute();

    await db.schema
      .createIndex('idx_pages_parent_id')
      .on('pages')
      .column('parent_id')
      .execute();

    await db.schema
      .createIndex('idx_pages_created_by')
      .on('pages')
      .column('created_by')
      .execute();

    // Memory indexes
    await db.schema
      .createIndex('idx_memories_content_hash')
      .on('memories')
      .column('content_hash')
      .execute();

    await db.schema
      .createIndex('idx_memories_status_importance')
      .on('memories')
      .columns(['status', 'importance'])
      .execute();

    await db.schema
      .createIndex('idx_relationships_source_target')
      .on('relationships')
      .columns(['source_id', 'target_id'])
      .execute();

    await db.schema
      .createIndex('idx_concepts_name')
      .on('concepts')
      .column('name')
      .execute();

    await db.schema
      .createIndex('idx_memory_access_logs_timestamp')
      .on('memory_access_logs')
      .column('timestamp')
      .execute();

    // System indexes
    await db.schema
      .createIndex('idx_usage_tracking_service_timestamp')
      .on('usage_tracking')
      .columns(['service', 'timestamp'])
      .execute();

    await db.schema
      .createIndex('idx_scraper_performance_domain_timestamp')
      .on('scraper_performance')
      .columns(['domain', 'timestamp'])
      .execute();

    await db.schema
      .createIndex('idx_extracted_content_hash')
      .on('extracted_content')
      .column('content_hash')
      .execute();

    logger.info('Migration 001_initial_schema_complete completed successfully');
    logger.info('Complete MCP Tools schema created with UUID primary keys');
    logger.info(`Total tables created: ${getAllTableNames().length}`);
    logger.info('All performance indexes created');
  },

  async down(db: Kysely<any>): Promise<void> {
    logger.info('Running migration: 001_initial_schema_complete (down)');
    logger.info('Dropping entire MCP Tools schema');

    // Drop all indexes first
    const indexes = [
      'idx_extracted_content_hash',
      'idx_scraper_performance_domain_timestamp',
      'idx_usage_tracking_service_timestamp', 
      'idx_memory_access_logs_timestamp',
      'idx_concepts_name',
      'idx_relationships_source_target',
      'idx_memories_status_importance',
      'idx_memories_content_hash',
      'idx_pages_created_by',
      'idx_pages_parent_id',
      'idx_pages_slug',
      'idx_card_activities_board_created',
      'idx_cards_assigned_to',
      'idx_cards_board_column',
      'idx_cards_slug',
      'idx_boards_slug'
    ];

    for (const index of indexes) {
      await db.schema.dropIndex(index).ifExists().execute();
    }

    // Drop all tables in reverse dependency order
    const allTables = getAllTableNames().reverse();

    for (const table of allTables) {
      await db.schema.dropTable(table).ifExists().execute();
    }

    logger.info('Migration 001_initial_schema_complete rollback completed');
    logger.info('Entire MCP Tools schema dropped');
  }
};

/**
 * Get all table names in dependency order (for creation)
 */
function getAllTableNames(): string[] {
  return [
    // System tables (no dependencies)
    'usage_tracking',
    'code_quality_metrics',
    'dependency_vulnerabilities', 
    'technical_debt_items',
    'scraper_performance',
    'document_processing_queue',
    'extracted_content',
    'knowledge_graph_metrics',
    'data_retention_policies',
    'notification_preferences',
    'feature_flags',
    
    // Independent entity tables
    'boards',
    'tags',
    'categories',
    'wiki_tags',
    'pages',
    'memories',
    'concepts',
    'memory_clusters',
    'context_patterns',
    
    // Dependent tables (level 1)
    'columns',
    'custom_fields',
    'milestones',
    'page_categories',
    'page_tags',
    'wiki_attachments',
    'page_history',
    'wiki_comments',
    'relationships',
    'memory_concepts',
    'memory_snapshots',
    'concept_hierarchies',
    'memory_cluster_memberships',
    'memory_context_patterns',
    'memory_access_logs',
    'memory_merges',
    
    // Dependent tables (level 2)
    'cards',
    'page_links',
    
    // Dependent tables (level 3)
    'card_tags',
    'comments',
    'card_custom_field_values',
    'card_milestones',
    'card_subtasks',
    'card_links',
    'time_entries',
    'card_activities'
  ];
}