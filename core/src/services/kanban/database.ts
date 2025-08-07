/**
 * Kanban Database Layer
 */

import { Kysely, sql, Generated } from 'kysely';
import { DatabaseConnectionManager } from '../../utils/database.js';
import type { DatabaseConfig } from '../../utils/database.js';

// Database schema interfaces - separate types for inserts vs selects
interface BoardTable {
  id: Generated<string>;
  name: string;
  slug: string;
  description: string | null;
  color: string;
  created_at: string;
  updated_at: string;
}

interface ColumnTable {
  id: Generated<string>;
  board_id: string;
  name: string;
  position: number;
  color: string;
  created_at: string;
  updated_at: string;
}

interface CardTable {
  id: Generated<string>;
  board_id: string;
  column_id: string;
  title: string;
  slug: string;
  description: string | null;
  position: number;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  assigned_to: string | null;
  due_date: string | null;
  created_at: string;
  updated_at: string;
}

interface TagTable {
  id: Generated<string>;
  name: string;
  color: string;
  created_at: string;
  updated_at: string;
}

interface CommentTable {
  id: Generated<string>;
  card_id: string;
  content: string;
  author: string | null;
  created_at: string;
  updated_at: string;
}

interface CardActivityTable {
  id: Generated<string>;
  card_id: string;
  board_id: string;
  action_type: string;
  user_id: string | null;
  user_name: string | null;
  details: string | null;
  old_values: string | null;
  new_values: string | null;
  timestamp: string;
  created_at: string;
}

interface TimeEntryTable {
  id: Generated<string>;
  card_id: string;
  user_name: string | null;
  description: string | null;
  start_time: string | null;
  end_time: string | null;
  duration_minutes: number | null;
  is_billable: boolean;
  hourly_rate: number | null;
  created_at: string;
  updated_at: string;
}

export interface KanbanDatabase {
  boards: BoardTable;
  columns: ColumnTable;
  cards: CardTable;
  tags: TagTable;
  card_tags: {
    id: Generated<string>;
    card_id: string;
    tag_id: string;
    created_at: string;
  };
  comments: CommentTable;
  card_activities: CardActivityTable;
  time_entries: TimeEntryTable;
}

export class KanbanDatabase {
  private dbManager: DatabaseConnectionManager<KanbanDatabase>;

  constructor(config: DatabaseConfig) {
    this.dbManager = new DatabaseConnectionManager<KanbanDatabase>(config);
  }

  get db(): Kysely<KanbanDatabase> {
    return this.dbManager.kysely;
  }

  async initialize(): Promise<void> {
    try {
      await this.dbManager.initialize();
      console.log('✅ Kanban database initialization: Database schema is managed by the centralized migration service');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('❌ Failed to initialize kanban database:', errorMessage);
      console.error('Error details:', error);
      throw error;
    }
  }

  private async createTables(): Promise<void> {
    // Create boards table
    const boardsQuery = this.db.schema
      .createTable('boards')
      .ifNotExists()
      .addColumn('id', 'text', (col) => col.primaryKey())
      .addColumn('name', 'text', (col) => col.notNull())
      .addColumn('description', 'text')
      .addColumn('color', 'text', (col) => col.notNull().defaultTo('#6366f1'))
      .addColumn('created_at', 'text', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
      .addColumn('updated_at', 'text', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`));
    
    const compiled = boardsQuery.compile();
    console.log('Boards table SQL:', compiled.sql);
    console.log('Parameters:', compiled.parameters);
    
    await boardsQuery.execute();

    // Create columns table
    await this.db.schema
      .createTable('columns')
      .ifNotExists()
      .addColumn('id', 'text', (col) => col.primaryKey())
      .addColumn('board_id', 'text', (col) => col.notNull())
      .addColumn('name', 'text', (col) => col.notNull())
      .addColumn('position', 'integer', (col) => col.notNull().defaultTo(0))
      .addColumn('color', 'text', (col) => col.notNull().defaultTo('#64748b'))
      .addColumn('created_at', 'text', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
      .addColumn('updated_at', 'text', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
      .execute();

    // Create cards table
    await this.db.schema
      .createTable('cards')
      .ifNotExists()
      .addColumn('id', 'text', (col) => col.primaryKey())
      .addColumn('board_id', 'text', (col) => col.notNull())
      .addColumn('column_id', 'text', (col) => col.notNull())
      .addColumn('title', 'text', (col) => col.notNull())
      .addColumn('description', 'text')
      .addColumn('position', 'integer', (col) => col.notNull().defaultTo(0))
      .addColumn('priority', 'text', (col) => col.notNull().defaultTo('medium'))
      .addColumn('assigned_to', 'text')
      .addColumn('due_date', 'text')
      .addColumn('created_at', 'text', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
      .addColumn('updated_at', 'text', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
      .execute();

    // Create tags table
    await this.db.schema
      .createTable('tags')
      .ifNotExists()
      .addColumn('id', 'text', (col) => col.primaryKey())
      .addColumn('name', 'text', (col) => col.notNull().unique())
      .addColumn('color', 'text', (col) => col.notNull().defaultTo('#64748b'))
      .addColumn('created_at', 'text', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
      .addColumn('updated_at', 'text', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
      .execute();

    // Create card_tags junction table
    await this.db.schema
      .createTable('card_tags')
      .ifNotExists()
      .addColumn('id', 'text', (col) => col.primaryKey())
      .addColumn('card_id', 'text', (col) => col.notNull())
      .addColumn('tag_id', 'text', (col) => col.notNull())
      .addColumn('created_at', 'text', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
      .addUniqueConstraint('unique_card_tag', ['card_id', 'tag_id'])
      .execute();

    // Create comments table
    await this.db.schema
      .createTable('comments')
      .ifNotExists()
      .addColumn('id', 'text', (col) => col.primaryKey())
      .addColumn('card_id', 'text', (col) => col.notNull())
      .addColumn('content', 'text', (col) => col.notNull())
      .addColumn('author', 'text')
      .addColumn('created_at', 'text', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
      .addColumn('updated_at', 'text', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
      .execute();

    // Create card_activities table
    await this.db.schema
      .createTable('card_activities')
      .ifNotExists()
      .addColumn('id', 'text', (col) => col.primaryKey())
      .addColumn('card_id', 'text', (col) => col.notNull())
      .addColumn('board_id', 'text', (col) => col.notNull())
      .addColumn('action_type', 'text', (col) => col.notNull())
      .addColumn('user_id', 'text')
      .addColumn('user_name', 'text')
      .addColumn('details', 'text')
      .addColumn('old_values', 'text')
      .addColumn('new_values', 'text')
      .addColumn('timestamp', 'text', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
      .addColumn('created_at', 'text', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
      .execute();

    // Create time_entries table
    await this.db.schema
      .createTable('time_entries')
      .ifNotExists()
      .addColumn('id', 'text', (col) => col.primaryKey())
      .addColumn('card_id', 'text', (col) => col.notNull())
      .addColumn('user_name', 'text')
      .addColumn('description', 'text')
      .addColumn('start_time', 'text')
      .addColumn('end_time', 'text')
      .addColumn('duration_minutes', 'integer')
      .addColumn('is_billable', 'integer', (col) => col.notNull().defaultTo(0))
      .addColumn('hourly_rate', 'real')
      .addColumn('created_at', 'text', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
      .addColumn('updated_at', 'text', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
      .execute();

    // Create indexes
    await this.db.schema
      .createIndex('idx_columns_board_id')
      .ifNotExists()
      .on('columns')
      .columns(['board_id'])
      .execute();
    
    await this.db.schema
      .createIndex('idx_cards_board_id')
      .ifNotExists()
      .on('cards')
      .columns(['board_id'])
      .execute();
    
    await this.db.schema
      .createIndex('idx_cards_column_id')
      .ifNotExists()
      .on('cards')
      .columns(['column_id'])
      .execute();
    
    await this.db.schema
      .createIndex('idx_comments_card_id')
      .ifNotExists()
      .on('comments')
      .columns(['card_id'])
      .execute();
    
    await this.db.schema
      .createIndex('idx_card_activities_card_id')
      .ifNotExists()
      .on('card_activities')
      .columns(['card_id'])
      .execute();
    
    await this.db.schema
      .createIndex('idx_card_activities_board_id')
      .ifNotExists()
      .on('card_activities')
      .columns(['board_id'])
      .execute();
    
    await this.db.schema
      .createIndex('idx_card_activities_timestamp')
      .ifNotExists()
      .on('card_activities')
      .columns(['timestamp'])
      .execute();
    
    await this.db.schema
      .createIndex('idx_time_entries_card_id')
      .ifNotExists()
      .on('time_entries')
      .columns(['card_id'])
      .execute();
    
    await this.db.schema
      .createIndex('idx_time_entries_start_time')
      .ifNotExists()
      .on('time_entries')
      .columns(['start_time'])
      .execute();
  }

  get kysely() {
    return this.db;
  }

  async close(): Promise<void> {
    await this.dbManager.close();
  }
}