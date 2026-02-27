/**
 * Kanban Service Layer
 * 
 * Core business logic for Kanban operations
 */

import { randomUUID } from 'crypto';
import { sql } from 'kysely';
import slugify from 'slugify';
import type { KanbanDatabase } from './database.js';
import type {
  Board,
  Column,
  Tag,
  Comment,
  TimeEntry,
  CreateBoardInput,
  UpdateBoardInput,
  CreateColumnInput,
  UpdateColumnInput,
  CreateCardInput,
  UpdateCardInput,
  MoveCardInput,
  CreateTagInput,
  CreateCommentInput,
  SearchCardsInput,
  BoardWithColumns,
  ColumnWithCards,
  CardWithTags,
  KanbanStats
} from './types.js';
import {
  NotFoundError,
  ValidationError
} from './types.js';

export class KanbanService {
  constructor(private database: KanbanDatabase) {}

  // Slug generation utilities
  private generateBoardSlug(name: string): string {
    return slugify(name, {
      lower: true,
      strict: true,
      remove: /[*+~.()'"!:@]/g,
    });
  }

  private generateCardSlug(boardId: string, title: string): string {
    const baseSlug = slugify(title, {
      lower: true,
      strict: true,
      remove: /[*+~.()'"!:@]/g,
    });
    
    // For cards, we'll just use the title slug since uniqueness is enforced at DB level
    return baseSlug;
  }

  private async ensureUniqueBoardSlug(baseSlug: string, excludeId?: string): Promise<string> {
    let slug = baseSlug;
    let counter = 1;
    
    while (true) {
      const existing = await this.database.kysely
        .selectFrom('boards')
        .select('id')
        .where('slug', '=', slug)
        .where((eb) => excludeId ? eb('id', '!=', excludeId) : eb.lit(true))
        .executeTakeFirst();
        
      if (!existing) {
        return slug;
      }
      
      slug = `${baseSlug}-${counter}`;
      counter++;
    }
  }

  private async ensureUniqueCardSlug(boardId: string, baseSlug: string, excludeId?: string): Promise<string> {
    let slug = baseSlug;
    let counter = 1;
    
    while (true) {
      const existing = await this.database.kysely
        .selectFrom('cards')
        .select('id')
        .where('board_id', '=', boardId)
        .where('slug', '=', slug)
        .where((eb) => excludeId ? eb('id', '!=', excludeId) : eb.lit(true))
        .executeTakeFirst();
        
      if (!existing) {
        return slug;
      }
      
      slug = `${baseSlug}-${counter}`;
      counter++;
    }
  }

  // Board operations
  async getAllBoards(): Promise<Board[]> {
    return await this.database.kysely
      .selectFrom('boards')
      .selectAll()
      .orderBy('created_at', 'desc')
      .execute();
  }

  async getBoardBySlug(slug: string): Promise<BoardWithColumns | null> {
    const board = await this.database.kysely
      .selectFrom('boards')
      .selectAll()
      .where('slug', '=', slug)
      .executeTakeFirst();

    if (!board) {
      return null;
    }

    // Get columns with cards
    const columns = await this.database.kysely
      .selectFrom('columns')
      .selectAll()
      .where('board_id', '=', board.id)
      .orderBy('position', 'asc')
      .execute();

    const columnsWithCards: ColumnWithCards[] = [];

    for (const column of columns) {
      const cards = await this.getCardsByColumnId(column.id);
      columnsWithCards.push({
        ...column,
        cards
      });
    }

    return {
      ...board,
      columns: columnsWithCards
    };
  }

  async getBoardById(id: string): Promise<BoardWithColumns | null> {
    const board = await this.database.kysely
      .selectFrom('boards')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();

    if (!board) {
      return null;
    }

    const columns = await this.getColumnsByBoardId(id);

    return {
      ...board,
      columns
    };
  }

  async createBoard(input: CreateBoardInput): Promise<Board> {
    const now = new Date().toISOString();
    
    // Generate slug
    const baseSlug = input.slug || this.generateBoardSlug(input.name);
    const slug = await this.ensureUniqueBoardSlug(baseSlug);
    
    const result = await this.database.kysely
      .insertInto('boards')
      .values({
        id: randomUUID(),
        name: input.name,
        slug,
        description: input.description || null,
        color: input.color || '#6366f1',
        created_at: now,
        updated_at: now
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    // Create default columns
    await this.createDefaultColumns(result.id);

    return result;
  }

  async updateBoard(id: string, input: UpdateBoardInput): Promise<Board> {
    const board = await this.database.kysely
      .selectFrom('boards')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();

    if (!board) {
      throw new NotFoundError('Board', id);
    }

    const now = new Date().toISOString();
    
    // Handle slug update if name changed
    let updateData = { ...input, updated_at: now };
    if (input.name && input.name !== board.name) {
      const baseSlug = input.slug || this.generateBoardSlug(input.name);
      updateData.slug = await this.ensureUniqueBoardSlug(baseSlug, id);
    } else if (input.slug) {
      updateData.slug = await this.ensureUniqueBoardSlug(input.slug, id);
    }

    return await this.database.kysely
      .updateTable('boards')
      .set(updateData)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async deleteBoard(id: string): Promise<void> {
    const result = await this.database.kysely
      .deleteFrom('boards')
      .where('id', '=', id)
      .executeTakeFirst();

    if (result.numDeletedRows === 0n) {
      throw new NotFoundError('Board', id);
    }
  }

  // Column operations
  async getColumnsByBoardId(boardId: string): Promise<ColumnWithCards[]> {
    const columns = await this.database.kysely
      .selectFrom('columns')
      .selectAll()
      .where('board_id', '=', boardId)
      .orderBy('position', 'asc')
      .execute();

    const columnsWithCards: ColumnWithCards[] = [];

    for (const column of columns) {
      const cards = await this.getCardsByColumnId(column.id);
      columnsWithCards.push({
        ...column,
        cards
      });
    }

    return columnsWithCards;
  }

  async createColumn(input: CreateColumnInput): Promise<Column> {
    const now = new Date().toISOString();

    return await this.database.kysely
      .insertInto('columns')
      .values({
        id: randomUUID(),
        board_id: input.board_id,
        name: input.name,
        position: input.position || 0,
        color: input.color || '#64748b',
        created_at: now,
        updated_at: now
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async updateColumn(id: string, input: UpdateColumnInput): Promise<Column> {
    const column = await this.database.kysely
      .selectFrom('columns')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();

    if (!column) {
      throw new NotFoundError('Column', id);
    }

    const now = new Date().toISOString();

    return await this.database.kysely
      .updateTable('columns')
      .set({
        ...input,
        updated_at: now
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async deleteColumn(id: string): Promise<void> {
    const result = await this.database.kysely
      .deleteFrom('columns')
      .where('id', '=', id)
      .executeTakeFirst();

    if (result.numDeletedRows === 0n) {
      throw new NotFoundError('Column', id);
    }
  }

  // Card operations
  async getCardBySlug(boardSlug: string, cardSlug: string): Promise<CardWithTags | null> {
    const card = await this.database.kysely
      .selectFrom('cards')
      .innerJoin('boards', 'cards.board_id', 'boards.id')
      .selectAll('cards')
      .where('boards.slug', '=', boardSlug)
      .where('cards.slug', '=', cardSlug)
      .executeTakeFirst();

    if (!card) {
      return null;
    }

    const tags = await this.getCardTags(card.id);
    return {
      ...card,
      tags
    };
  }

  async getCardsByColumnId(columnId: string): Promise<CardWithTags[]> {
    const cards = await this.database.kysely
      .selectFrom('cards')
      .selectAll()
      .where('column_id', '=', columnId)
      .orderBy('position', 'asc')
      .execute();

    const cardsWithTags: CardWithTags[] = [];

    for (const card of cards) {
      const tags = await this.getCardTags(card.id);
      cardsWithTags.push({
        ...card,
        tags
      });
    }

    return cardsWithTags;
  }

  async getCardById(id: string): Promise<CardWithTags | null> {
    const card = await this.database.kysely
      .selectFrom('cards')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();

    if (!card) {
      return null;
    }

    const tags = await this.getCardTags(id);

    return {
      ...card,
      tags
    };
  }

  async createCard(input: CreateCardInput): Promise<CardWithTags> {
    // Find column by ID or name/position
    let columnId = input.column_id;

    if (!columnId && input.column_name) {
      const column = await this.database.kysely
        .selectFrom('columns')
        .select('id')
        .where('board_id', '=', input.board_id)
        .where('name', '=', input.column_name)
        .executeTakeFirst();

      if (!column) {
        throw new ValidationError(`Column '${input.column_name}' not found`);
      }

      columnId = column.id;
    }

    if (!columnId) {
      // Get first column if none specified
      const firstColumn = await this.database.kysely
        .selectFrom('columns')
        .select('id')
        .where('board_id', '=', input.board_id)
        .orderBy('position', 'asc')
        .executeTakeFirst();

      if (!firstColumn) {
        throw new ValidationError('No columns found for board');
      }

      columnId = firstColumn.id;
    }

    const now = new Date().toISOString();
    
    // Generate slug
    const baseSlug = input.slug || this.generateCardSlug(input.board_id, input.title);
    const slug = await this.ensureUniqueCardSlug(input.board_id, baseSlug);

    const card = await this.database.kysely
      .insertInto('cards')
      .values({
        id: randomUUID(),
        board_id: input.board_id,
        column_id: columnId,
        title: input.title,
        slug,
        description: input.description || null,
        position: input.position || 0,
        priority: input.priority || 'medium',
        assigned_to: input.assigned_to || null,
        due_date: input.due_date || null,
        created_at: now,
        updated_at: now
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    // Log activity
    await this.logActivity({
      card_id: card.id,
      board_id: card.board_id,
      action_type: 'created',
      user_name: input.assigned_to || 'System',
      details: {
        title: card.title,
        priority: card.priority,
        due_date: card.due_date
      }
    });

    return {
      ...card,
      tags: []
    };
  }

  async updateCard(id: string, input: UpdateCardInput): Promise<CardWithTags> {
    const card = await this.database.kysely
      .selectFrom('cards')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();

    if (!card) {
      throw new NotFoundError('Card', id);
    }

    const now = new Date().toISOString();
    
    // Handle slug update if title changed
    let updateData = { ...input, updated_at: now };
    if (input.title && input.title !== card.title) {
      const baseSlug = input.slug || this.generateCardSlug(card.board_id, input.title);
      updateData.slug = await this.ensureUniqueCardSlug(card.board_id, baseSlug, id);
    } else if (input.slug) {
      updateData.slug = await this.ensureUniqueCardSlug(card.board_id, input.slug, id);
    }

    const updatedCard = await this.database.kysely
      .updateTable('cards')
      .set(updateData)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();

    // Log activity for updates
    const changedFields: Record<string, any> = {};
    const oldValues: Record<string, any> = {};
    const newValues: Record<string, any> = {};

    Object.keys(input).forEach(key => {
      const typedKey = key as keyof typeof input;
      if (input[typedKey] !== undefined && card[typedKey as keyof typeof card] !== input[typedKey]) {
        changedFields[key] = input[typedKey];
        oldValues[key] = card[typedKey as keyof typeof card];
        newValues[key] = input[typedKey];
      }
    });

    if (Object.keys(changedFields).length > 0) {
      await this.logActivity({
        card_id: id,
        board_id: card.board_id,
        action_type: 'updated',
        user_name: input.assigned_to || 'System',
        details: { changed_fields: Object.keys(changedFields) },
        old_values: oldValues,
        new_values: newValues
      });
    }

    const tags = await this.getCardTags(id);

    return {
      ...updatedCard,
      tags
    };
  }

  async moveCard(id: string, input: MoveCardInput): Promise<CardWithTags> {
    const card = await this.database.kysely
      .selectFrom('cards')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();

    if (!card) {
      throw new NotFoundError('Card', id);
    }

    // Find target column
    let columnId = input.column_id;

    if (!columnId && input.column_name) {
      const column = await this.database.kysely
        .selectFrom('columns')
        .select('id')
        .where('board_id', '=', card.board_id)
        .where('name', '=', input.column_name)
        .executeTakeFirst();

      if (!column) {
        throw new ValidationError(`Column '${input.column_name}' not found`);
      }

      columnId = column.id;
    }

    if (!columnId) {
      columnId = card.column_id; // Keep current column
    }

    const now = new Date().toISOString();

    const updatedCard = await this.database.kysely
      .updateTable('cards')
      .set({
        column_id: columnId,
        position: input.position,
        updated_at: now
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();

    // Log move activity if column changed
    if (columnId !== card.column_id) {
      const [oldColumn, newColumn] = await Promise.all([
        this.database.kysely
          .selectFrom('columns')
          .select('name')
          .where('id', '=', card.column_id)
          .executeTakeFirst(),
        this.database.kysely
          .selectFrom('columns')
          .select('name')
          .where('id', '=', columnId)
          .executeTakeFirst()
      ]);

      await this.logActivity({
        card_id: id,
        board_id: card.board_id,
        action_type: 'moved',
        user_name: 'System',
        details: {
          from_column: oldColumn?.name,
          to_column: newColumn?.name,
          position: input.position
        },
        old_values: { column_id: card.column_id, position: card.position },
        new_values: { column_id: columnId, position: input.position }
      });
    }

    const tags = await this.getCardTags(id);

    return {
      ...updatedCard,
      tags
    };
  }

  async deleteCard(id: string): Promise<void> {
    const result = await this.database.kysely
      .deleteFrom('cards')
      .where('id', '=', id)
      .executeTakeFirst();

    if (result.numDeletedRows === 0n) {
      throw new NotFoundError('Card', id);
    }
  }

  async searchCards(input: SearchCardsInput): Promise<CardWithTags[]> {
    let query = this.database.kysely
      .selectFrom('cards')
      .selectAll()
      .where('title', 'like', `%${input.query.replace(/[%_]/g, '\\$&')}%`);

    if (input.board_id) {
      query = query.where('board_id', '=', input.board_id);
    }

    if (input.priority) {
      query = query.where('priority', '=', input.priority);
    }

    if (input.assigned_to) {
      query = query.where('assigned_to', '=', input.assigned_to);
    }

    const cards = await query
      .orderBy('created_at', 'desc')
      .execute();

    const cardsWithTags: CardWithTags[] = [];

    for (const card of cards) {
      const tags = await this.getCardTags(card.id);
      cardsWithTags.push({
        ...card,
        tags
      });
    }

    return cardsWithTags;
  }

  // Tag operations
  async getAllTags(): Promise<Tag[]> {
    return await this.database.kysely
      .selectFrom('tags')
      .selectAll()
      .orderBy('name', 'asc')
      .execute();
  }

  async createTag(input: CreateTagInput): Promise<Tag> {
    const now = new Date().toISOString();

    return await this.database.kysely
      .insertInto('tags')
      .values({
        id: randomUUID(),
        name: input.name,
        color: input.color || '#64748b',
        created_at: now,
        updated_at: now
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async addCardTag(cardId: string, tagId: string): Promise<void> {
    const now = new Date().toISOString();

    await this.database.kysely
      .insertInto('card_tags')
      .values({
        id: randomUUID(),
        card_id: cardId,
        tag_id: tagId,
        created_at: now
      })
      .execute();
  }

  async removeCardTag(cardId: string, tagId: string): Promise<void> {
    await this.database.kysely
      .deleteFrom('card_tags')
      .where('card_id', '=', cardId)
      .where('tag_id', '=', tagId)
      .execute();
  }

  async getCardTags(cardId: string): Promise<Tag[]> {
    return await this.database.kysely
      .selectFrom('card_tags')
      .innerJoin('tags', 'tags.id', 'card_tags.tag_id')
      .selectAll('tags')
      .where('card_tags.card_id', '=', cardId)
      .execute();
  }

  // Comment operations
  async getCardComments(cardId: string): Promise<Comment[]> {
    return await this.database.kysely
      .selectFrom('comments')
      .selectAll()
      .where('card_id', '=', cardId)
      .orderBy('created_at', 'asc')
      .execute();
  }

  async addComment(input: CreateCommentInput): Promise<Comment> {
    const now = new Date().toISOString();

    return await this.database.kysely
      .insertInto('comments')
      .values({
        id: randomUUID(),
        card_id: input.card_id,
        content: input.content,
        author: input.author || null,
        created_at: now,
        updated_at: now
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async deleteComment(id: string): Promise<void> {
    const result = await this.database.kysely
      .deleteFrom('comments')
      .where('id', '=', id)
      .executeTakeFirst();

    if (result.numDeletedRows === 0n) {
      throw new NotFoundError('Comment', id);
    }
  }

  // Statistics
  async getStats(): Promise<KanbanStats> {
    const [boardCount, cardCount] = await Promise.all([
      this.database.kysely
        .selectFrom('boards')
        .select(sql`count(*)`.as('count'))
        .executeTakeFirstOrThrow(),
      this.database.kysely
        .selectFrom('cards')
        .select(sql`count(*)`.as('count'))
        .executeTakeFirstOrThrow()
    ]);

    // Get cards by priority
    const priorityCounts = await this.database.kysely
      .selectFrom('cards')
      .select(['priority', sql`count(*)`.as('count')])
      .groupBy('priority')
      .execute();

    const cards_by_priority = {
      low: 0,
      medium: 0,
      high: 0,
      urgent: 0
    };

    for (const row of priorityCounts) {
      cards_by_priority[row.priority as keyof typeof cards_by_priority] = Number(row.count);
    }

    // Get overdue cards
    const today = new Date().toISOString().split('T')[0];
    const overdueCount = await this.database.kysely
      .selectFrom('cards')
      .select(sql`count(*)`.as('count'))
      .where('due_date', '<', today)
      .executeTakeFirstOrThrow();

    // Get cards by status (column distribution)
    const statusCounts = await this.database.kysely
      .selectFrom('cards')
      .innerJoin('columns', 'columns.id', 'cards.column_id')
      .select([
        'columns.name as status',
        sql`count(cards.id)`.as('count')
      ])
      .groupBy('columns.name')
      .execute();

    const cards_by_status: Record<string, number> = {};
    for (const row of statusCounts) {
      cards_by_status[row.status] = Number(row.count);
    }

    // Get recent activity
    const recent_activity = await this.database.kysely
      .selectFrom('card_activities')
      .innerJoin('cards', 'cards.id', 'card_activities.card_id')
      .innerJoin('boards', 'boards.id', 'card_activities.board_id')
      .select([
        'card_activities.id',
        'card_activities.card_id',
        'card_activities.action_type',
        'card_activities.details',
        'card_activities.timestamp',
        'cards.title as card_title'
      ])
      .orderBy('card_activities.timestamp', 'desc')
      .limit(20)
      .execute();

    return {
      total_boards: Number(boardCount.count),
      total_cards: Number(cardCount.count),
      cards_by_priority,
      cards_by_status,
      overdue_cards: Number(overdueCount.count),
      recent_activity: recent_activity.map(activity => ({
        type: activity.action_type as 'card_created' | 'card_moved' | 'card_updated' | 'comment_added',
        card_id: activity.card_id,
        card_title: activity.card_title,
        timestamp: activity.timestamp,
        details: activity.details || undefined
      }))
    };
  }

  // Activity tracking methods
  async logActivity(data: {
    card_id: string;
    board_id: string;
    action_type: 'created' | 'updated' | 'moved' | 'assigned' | 'commented' | 'tagged' | 'archived' | 'restored' | 'linked' | 'time_logged';
    user_id?: string;
    user_name?: string;
    details?: any;
    old_values?: any;
    new_values?: any;
  }): Promise<void> {
    const now = new Date().toISOString();
    await this.database.kysely
      .insertInto('card_activities')
      .values({
        id: randomUUID(),
        card_id: data.card_id,
        board_id: data.board_id,
        action_type: data.action_type,
        user_id: data.user_id || null,
        user_name: data.user_name || null,
        details: data.details ? JSON.stringify(data.details) : null,
        old_values: data.old_values ? JSON.stringify(data.old_values) : null,
        new_values: data.new_values ? JSON.stringify(data.new_values) : null,
        timestamp: now,
        created_at: now
      })
      .execute();
  }

  async getBoardActivity(boardId: string, limit = 50): Promise<any[]> {
    const activities = await this.database.kysely
      .selectFrom('card_activities')
      .innerJoin('cards', 'cards.id', 'card_activities.card_id')
      .select([
        'card_activities.id',
        'card_activities.action_type',
        'card_activities.user_name',
        'card_activities.details',
        'card_activities.old_values',
        'card_activities.new_values',
        'card_activities.timestamp',
        'cards.title as card_title',
      ])
      .where('card_activities.board_id', '=', boardId)
      .orderBy('card_activities.timestamp', 'desc')
      .limit(limit)
      .execute();

    return activities.map(activity => ({
      id: activity.id,
      action_type: activity.action_type,
      user_name: activity.user_name,
      details: activity.details ? JSON.parse(activity.details) : null,
      old_values: activity.old_values ? JSON.parse(activity.old_values) : null,
      new_values: activity.new_values ? JSON.parse(activity.new_values) : null,
      timestamp: activity.timestamp,
      card_title: activity.card_title,
    }));
  }

  async getUserActivityStats(userId?: string, timeframe = '30d'): Promise<any> {
    const timeframeDate = new Date();
    if (timeframe === '7d') {
      timeframeDate.setDate(timeframeDate.getDate() - 7);
    } else if (timeframe === '30d') {
      timeframeDate.setDate(timeframeDate.getDate() - 30);
    } else if (timeframe === '90d') {
      timeframeDate.setDate(timeframeDate.getDate() - 90);
    }

    let query = this.database.kysely
      .selectFrom('card_activities')
      .select([
        'action_type',
        'user_name',
        sql`count(*)`.as('count'),
        sql`date(timestamp)`.as('date')
      ])
      .where('timestamp', '>=', timeframeDate.toISOString());

    if (userId) {
      query = query.where('user_id', '=', userId);
    }

    const results = await query
      .groupBy(['action_type', 'user_name', sql`date(timestamp)`])
      .execute();

    // Process results into a more useful format
    const userStats: Record<string, any> = {};
    const actionTypeStats: Record<string, number> = {};
    const dailyActivity: Record<string, number> = {};

    for (const result of results) {
      const user = result.user_name || 'Unknown';
      const actionType = result.action_type;
      const date = result.date as string;
      const count = Number(result.count);

      // User stats
      if (!userStats[user]) {
        userStats[user] = { total: 0, actions: {} };
      }
      userStats[user].total += count;
      userStats[user].actions[actionType] = (userStats[user].actions[actionType] || 0) + count;

      // Action type stats
      actionTypeStats[actionType] = (actionTypeStats[actionType] || 0) + count;

      // Daily activity
      dailyActivity[date] = (dailyActivity[date] || 0) + count;
    }

    return {
      timeframe,
      user_stats: userStats,
      action_type_stats: actionTypeStats,
      daily_activity: dailyActivity,
    };
  }

  // Private helper methods
  private async createDefaultColumns(boardId: string): Promise<void> {
    const defaultColumns = [
      { name: 'To Do', position: 0, color: '#ef4444' },
      { name: 'In Progress', position: 1, color: '#f59e0b' },
      { name: 'Review', position: 2, color: '#3b82f6' },
      { name: 'Done', position: 3, color: '#10b981' }
    ];

    const now = new Date().toISOString();

    for (const column of defaultColumns) {
      await this.database.kysely
        .insertInto('columns')
        .values({
          id: randomUUID(),
          board_id: boardId,
          name: column.name,
          position: column.position,
          color: column.color,
          created_at: now,
          updated_at: now
        })
        .execute();
    }
  }

  // Time Tracking operations
  async createTimeEntry(input: Omit<TimeEntry, 'id' | 'created_at' | 'updated_at'>): Promise<TimeEntry> {
    const now = new Date().toISOString();
    
    const result = await this.database.kysely
      .insertInto('time_entries')
      .values({
        id: randomUUID(),
        ...input,
        is_billable: input.is_billable || false,
        created_at: now,
        updated_at: now
      })
      .returning(['id'])
      .executeTakeFirstOrThrow();

    const timeEntry = await this.database.kysely
      .selectFrom('time_entries')
      .selectAll()
      .where('id', '=', result.id)
      .executeTakeFirstOrThrow();

    // Convert SQLite integer back to boolean
    return {
      ...timeEntry,
      is_billable: Boolean(timeEntry.is_billable)
    };
  }

  async updateTimeEntry(id: string, input: Partial<Omit<TimeEntry, 'id' | 'card_id' | 'created_at' | 'updated_at'>>): Promise<TimeEntry | null> {
    const updateData: any = {
      ...input,
      updated_at: new Date().toISOString()
    };

    // Convert boolean to integer for SQLite if present
    if (input.is_billable !== undefined) {
      updateData.is_billable = input.is_billable ? 1 : 0;
    }

    await this.database.kysely
      .updateTable('time_entries')
      .set(updateData)
      .where('id', '=', id)
      .execute();

    const timeEntry = await this.database.kysely
      .selectFrom('time_entries')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();

    if (!timeEntry) return null;

    // Convert SQLite integer back to boolean
    return {
      ...timeEntry,
      is_billable: Boolean(timeEntry.is_billable)
    };
  }

  async deleteTimeEntry(id: string): Promise<boolean> {
    const result = await this.database.kysely
      .deleteFrom('time_entries')
      .where('id', '=', id)
      .executeTakeFirst();

    return (result?.numDeletedRows ?? 0n) > 0n;
  }

  async getTimeEntryById(id: string): Promise<TimeEntry | null> {
    const timeEntry = await this.database.kysely
      .selectFrom('time_entries')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();

    if (!timeEntry) return null;

    // Convert SQLite integer back to boolean
    return {
      ...timeEntry,
      is_billable: Boolean(timeEntry.is_billable)
    };
  }

  async getTimeEntriesByCard(cardId: string): Promise<TimeEntry[]> {
    const timeEntries = await this.database.kysely
      .selectFrom('time_entries')
      .selectAll()
      .where('card_id', '=', cardId)
      .orderBy('created_at', 'desc')
      .execute();

    // Convert SQLite integers back to booleans
    return timeEntries.map(entry => ({
      ...entry,
      is_billable: Boolean(entry.is_billable)
    }));
  }

  async getActiveTimeEntry(cardId?: string): Promise<TimeEntry | null> {
    let query = this.database.kysely
      .selectFrom('time_entries')
      .selectAll()
      .where('end_time', 'is', null);

    if (cardId !== undefined) {
      query = query.where('card_id', '=', cardId);
    }

    const timeEntry = await query.executeTakeFirst();

    if (!timeEntry) return null;

    // Convert SQLite integer back to boolean
    return {
      ...timeEntry,
      is_billable: Boolean(timeEntry.is_billable)
    };
  }

  async getActiveTimeEntries(): Promise<TimeEntry[]> {
    const timeEntries = await this.database.kysely
      .selectFrom('time_entries')
      .selectAll()
      .where('end_time', 'is', null)
      .orderBy('start_time', 'desc')
      .execute();

    // Convert SQLite integers back to booleans
    return timeEntries.map(entry => ({
      ...entry,
      is_billable: Boolean(entry.is_billable)
    }));
  }

  async updateCardActualHours(cardId: string): Promise<void> {
    // Calculate total actual hours from all time entries for this card
    const result = await this.database.kysely
      .selectFrom('time_entries')
      .select([
        sql<number>`COALESCE(SUM(duration_minutes), 0)`.as('total_minutes')
      ])
      .where('card_id', '=', cardId)
      .executeTakeFirst();

    const totalHours = result ? Math.round((result.total_minutes / 60) * 100) / 100 : 0;

    // Note: This assumes there's an actual_hours column on cards table
    // If not, this method would need to be modified or the card schema updated
    await this.database.kysely
      .updateTable('cards')
      .set({ 
        updated_at: new Date().toISOString()
        // actual_hours: totalHours // Uncomment if card table has this column
      })
      .where('id', '=', cardId)
      .execute();
  }

  async getTimeReport(cardId?: string, startDate?: string, endDate?: string): Promise<{
    totalHours: number;
    billableHours: number;
    totalCost: number;
    entriesCount: number;
    entries: TimeEntry[];
  }> {
    let query = this.database.kysely
      .selectFrom('time_entries')
      .selectAll();

    if (cardId !== undefined) {
      query = query.where('card_id', '=', cardId);
    }

    if (startDate) {
      query = query.where('start_time', '>=', startDate);
    }

    if (endDate) {
      query = query.where('start_time', '<=', endDate);
    }

    const timeEntries = await query
      .orderBy('start_time', 'desc')
      .execute();

    // Convert SQLite integers back to booleans and calculate totals
    const entries = timeEntries.map(entry => ({
      ...entry,
      is_billable: Boolean(entry.is_billable)
    }));

    const totalMinutes = entries.reduce((sum, entry) => sum + (entry.duration_minutes || 0), 0);
    const billableMinutes = entries
      .filter(entry => entry.is_billable)
      .reduce((sum, entry) => sum + (entry.duration_minutes || 0), 0);

    const totalCost = entries
      .filter(entry => entry.is_billable && entry.hourly_rate)
      .reduce((sum, entry) => {
        const hours = (entry.duration_minutes || 0) / 60;
        return sum + (hours * (entry.hourly_rate || 0));
      }, 0);

    return {
      totalHours: Math.round((totalMinutes / 60) * 100) / 100,
      billableHours: Math.round((billableMinutes / 60) * 100) / 100,
      totalCost: Math.round(totalCost * 100) / 100,
      entriesCount: entries.length,
      entries
    };
  }
}