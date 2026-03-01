/**
 * Kanban Service Unit Tests
 * 
 * Comprehensive test suite for KanbanService business logic
 */

import { KanbanService } from './service.js';
import { NotFoundError, ValidationError } from './types.js';
import { 
  createMockKanbanDatabase, 
  createMockQueryBuilder, 
  createMockDeleteResult,
  mockTestData,
  setupDatabaseMocks
} from '../../__tests__/utils/mock-database.js';
import type { KanbanDatabase } from './database.js';

describe('KanbanService', () => {
  let service: KanbanService;
  let mockDb: jest.Mocked<KanbanDatabase>;

  beforeEach(() => {
    mockDb = createMockKanbanDatabase();
    setupDatabaseMocks(mockDb);
    service = new KanbanService(mockDb);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Board Operations', () => {
    describe('getAllBoards', () => {
      it('should return all boards ordered by created_at desc', async () => {
        const expectedBoards = [mockTestData.board];
        const mockQuery = createMockQueryBuilder(expectedBoards);
        mockDb.kysely.selectFrom.mockReturnValue(mockQuery);

        const result = await service.getAllBoards();

        expect(mockDb.kysely.selectFrom).toHaveBeenCalledWith('boards');
        expect(mockQuery.selectAll).toHaveBeenCalled();
        expect(mockQuery.orderBy).toHaveBeenCalledWith('created_at', 'desc');
        expect(result).toEqual(expectedBoards);
      });

      it('should return empty array when no boards exist', async () => {
        const mockQuery = createMockQueryBuilder([]);
        mockDb.kysely.selectFrom.mockReturnValue(mockQuery);

        const result = await service.getAllBoards();

        expect(result).toEqual([]);
      });
    });

    describe('getBoardById', () => {
      it('should return board with columns when board exists', async () => {
        const expectedBoard = mockTestData.board;
        const expectedColumn = { ...mockTestData.column, cards: [] };
        
        // Mock board query
        const mockBoardQuery = createMockQueryBuilder(expectedBoard);
        mockDb.kysely.selectFrom.mockReturnValueOnce(mockBoardQuery);
        
        // Mock columns query (called by getColumnsByBoardId)
        const mockColumnsQuery = createMockQueryBuilder([mockTestData.column]);
        mockDb.kysely.selectFrom.mockReturnValueOnce(mockColumnsQuery);
        
        // Mock cards query (called by getCardsByColumnId)
        const mockCardsQuery = createMockQueryBuilder([]);
        mockDb.kysely.selectFrom.mockReturnValue(mockCardsQuery);

        const result = await service.getBoardById(1);

        expect(result).toEqual({
          ...expectedBoard,
          columns: [expectedColumn]
        });
      });

      it('should return null when board does not exist', async () => {
        const mockQuery = createMockQueryBuilder(undefined);
        mockDb.kysely.selectFrom.mockReturnValue(mockQuery);

        const result = await service.getBoardById(999);

        expect(result).toBeNull();
      });
    });

    describe('createBoard', () => {
      it('should create board with default columns', async () => {
        const input = { name: 'New Board', description: 'Test description' };
        const expectedBoard = { ...mockTestData.board, ...input };
        
        // Mock board creation
        const mockBoardQuery = createMockQueryBuilder(expectedBoard);
        mockDb.kysely.insertInto.mockReturnValueOnce(mockBoardQuery);
        
        // Mock default columns creation
        const mockColumnQuery = createMockQueryBuilder(mockTestData.column);
        mockDb.kysely.insertInto.mockReturnValue(mockColumnQuery);

        const result = await service.createBoard(input);

        expect(mockDb.kysely.insertInto).toHaveBeenCalledWith('boards');
        expect(mockBoardQuery.values).toHaveBeenCalledWith({
          id: expect.any(String),
          name: input.name,
          description: input.description,
          color: '#6366f1',
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z'
        });
        
        // Verify default columns were created
        expect(mockDb.kysely.insertInto).toHaveBeenCalledWith('columns');
        
        expect(result).toEqual(expectedBoard);
      });

      it('should create board with default color when not provided', async () => {
        const input = { name: 'New Board' };
        const expectedBoard = { ...mockTestData.board, ...input };
        
        const mockQuery = createMockQueryBuilder(expectedBoard);
        mockDb.kysely.insertInto.mockReturnValue(mockQuery);

        await service.createBoard(input);

        expect(mockQuery.values).toHaveBeenCalledWith(
          expect.objectContaining({ color: '#6366f1' })
        );
      });
    });

    describe('updateBoard', () => {
      it('should update existing board', async () => {
        const updateInput = { name: 'Updated Board' };
        const existingBoard = mockTestData.board;
        const updatedBoard = { ...existingBoard, ...updateInput };

        // Mock existing board check
        const mockSelectQuery = createMockQueryBuilder(existingBoard);
        mockDb.kysely.selectFrom.mockReturnValueOnce(mockSelectQuery);
        
        // Mock update operation
        const mockUpdateQuery = createMockQueryBuilder(updatedBoard);
        mockDb.kysely.updateTable.mockReturnValue(mockUpdateQuery);

        const result = await service.updateBoard(1, updateInput);

        expect(mockDb.kysely.updateTable).toHaveBeenCalledWith('boards');
        expect(mockUpdateQuery.set).toHaveBeenCalledWith({
          ...updateInput,
          updated_at: '2024-01-01T00:00:00.000Z'
        });
        expect(result).toEqual(updatedBoard);
      });

      it('should throw NotFoundError when board does not exist', async () => {
        const mockQuery = createMockQueryBuilder(undefined);
        mockDb.kysely.selectFrom.mockReturnValue(mockQuery);

        await expect(service.updateBoard(999, { name: 'Updated' }))
          .rejects.toThrow(NotFoundError);
      });
    });

    describe('deleteBoard', () => {
      it('should delete existing board', async () => {
        const mockQuery = createMockQueryBuilder();
        mockQuery.executeTakeFirst.mockResolvedValue(createMockDeleteResult(1));
        mockDb.kysely.deleteFrom.mockReturnValue(mockQuery);

        await service.deleteBoard(1);

        expect(mockDb.kysely.deleteFrom).toHaveBeenCalledWith('boards');
        expect(mockQuery.where).toHaveBeenCalledWith('id', '=', 1);
      });

      it('should throw NotFoundError when board does not exist', async () => {
        const mockQuery = createMockQueryBuilder();
        mockQuery.executeTakeFirst.mockResolvedValue(createMockDeleteResult(0));
        mockDb.kysely.deleteFrom.mockReturnValue(mockQuery);

        await expect(service.deleteBoard(999))
          .rejects.toThrow(NotFoundError);
      });
    });
  });

  describe('Column Operations', () => {
    describe('getColumnsByBoardId', () => {
      it('should return columns with cards ordered by position', async () => {
        const expectedColumn = mockTestData.column;
        const expectedCard = { ...mockTestData.card, tags: [] };
        
        // Mock columns query
        const mockColumnsQuery = createMockQueryBuilder([expectedColumn]);
        mockDb.kysely.selectFrom.mockReturnValueOnce(mockColumnsQuery);
        
        // Mock cards query
        const mockCardsQuery = createMockQueryBuilder([mockTestData.card]);
        mockDb.kysely.selectFrom.mockReturnValueOnce(mockCardsQuery);
        
        // Mock tags query
        const mockTagsQuery = createMockQueryBuilder([]);
        mockDb.kysely.selectFrom.mockReturnValue(mockTagsQuery);

        const result = await service.getColumnsByBoardId(1);

        expect(mockColumnsQuery.orderBy).toHaveBeenCalledWith('position', 'asc');
        expect(result).toEqual([{
          ...expectedColumn,
          cards: [expectedCard]
        }]);
      });
    });

    describe('createColumn', () => {
      it('should create column with provided values', async () => {
        const input = {
          board_id: '550e8400-e29b-41d4-a716-446655440000',
          name: 'New Column',
          position: 2,
          color: '#ff0000'
        };
        const expectedColumn = { ...mockTestData.column, ...input };
        
        const mockQuery = createMockQueryBuilder(expectedColumn);
        mockDb.kysely.insertInto.mockReturnValue(mockQuery);

        const result = await service.createColumn(input);

        expect(mockQuery.values).toHaveBeenCalledWith({
          id: expect.any(String),
          ...input,
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z'
        });
        expect(result).toEqual(expectedColumn);
      });

      it('should use default values for position and color', async () => {
        const input = { board_id: '550e8400-e29b-41d4-a716-446655440000', name: 'New Column' };
        const mockQuery = createMockQueryBuilder(mockTestData.column);
        mockDb.kysely.insertInto.mockReturnValue(mockQuery);

        await service.createColumn(input);

        expect(mockQuery.values).toHaveBeenCalledWith(
          expect.objectContaining({
            position: 0,
            color: '#64748b'
          })
        );
      });
    });

    describe('updateColumn', () => {
      it('should update existing column', async () => {
        const updateInput = { name: 'Updated Column' };
        const existingColumn = mockTestData.column;
        const updatedColumn = { ...existingColumn, ...updateInput };

        const mockSelectQuery = createMockQueryBuilder(existingColumn);
        mockDb.kysely.selectFrom.mockReturnValueOnce(mockSelectQuery);
        
        const mockUpdateQuery = createMockQueryBuilder(updatedColumn);
        mockDb.kysely.updateTable.mockReturnValue(mockUpdateQuery);

        const result = await service.updateColumn(1, updateInput);

        expect(result).toEqual(updatedColumn);
      });

      it('should throw NotFoundError when column does not exist', async () => {
        const mockQuery = createMockQueryBuilder(undefined);
        mockDb.kysely.selectFrom.mockReturnValue(mockQuery);

        await expect(service.updateColumn(999, { name: 'Updated' }))
          .rejects.toThrow(NotFoundError);
      });
    });

    describe('deleteColumn', () => {
      it('should delete existing column', async () => {
        const mockQuery = createMockQueryBuilder();
        mockQuery.executeTakeFirst.mockResolvedValue(createMockDeleteResult(1));
        mockDb.kysely.deleteFrom.mockReturnValue(mockQuery);

        await service.deleteColumn(1);

        expect(mockDb.kysely.deleteFrom).toHaveBeenCalledWith('columns');
      });

      it('should throw NotFoundError when column does not exist', async () => {
        const mockQuery = createMockQueryBuilder();
        mockQuery.executeTakeFirst.mockResolvedValue(createMockDeleteResult(0));
        mockDb.kysely.deleteFrom.mockReturnValue(mockQuery);

        await expect(service.deleteColumn(999))
          .rejects.toThrow(NotFoundError);
      });
    });
  });

  describe('Card Operations', () => {
    describe('getCardsByColumnId', () => {
      it('should return cards with tags ordered by position', async () => {
        const expectedCard = mockTestData.card;
        const expectedTag = mockTestData.tag;
        
        // Mock cards query
        const mockCardsQuery = createMockQueryBuilder([expectedCard]);
        mockDb.kysely.selectFrom.mockReturnValueOnce(mockCardsQuery);
        
        // Mock tags query
        const mockTagsQuery = createMockQueryBuilder([expectedTag]);
        mockDb.kysely.selectFrom.mockReturnValue(mockTagsQuery);

        const result = await service.getCardsByColumnId(1);

        expect(mockCardsQuery.orderBy).toHaveBeenCalledWith('position', 'asc');
        expect(result).toEqual([{
          ...expectedCard,
          tags: [expectedTag]
        }]);
      });
    });

    describe('getCardById', () => {
      it('should return card with tags when card exists', async () => {
        const expectedCard = mockTestData.card;
        const expectedTag = mockTestData.tag;
        
        const mockCardQuery = createMockQueryBuilder(expectedCard);
        mockDb.kysely.selectFrom.mockReturnValueOnce(mockCardQuery);
        
        const mockTagsQuery = createMockQueryBuilder([expectedTag]);
        mockDb.kysely.selectFrom.mockReturnValue(mockTagsQuery);

        const result = await service.getCardById(1);

        expect(result).toEqual({
          ...expectedCard,
          tags: [expectedTag]
        });
      });

      it('should return null when card does not exist', async () => {
        const mockQuery = createMockQueryBuilder(undefined);
        mockDb.kysely.selectFrom.mockReturnValue(mockQuery);

        const result = await service.getCardById(999);

        expect(result).toBeNull();
      });
    });

    describe('createCard', () => {
      it('should create card with provided column_id', async () => {
        const input = {
          board_id: '550e8400-e29b-41d4-a716-446655440000',
          column_id: '550e8400-e29b-41d4-a716-446655440001',
          title: 'New Card',
          description: 'Test description',
          priority: 'high' as const
        };
        const expectedCard = { ...mockTestData.card, ...input };
        
        const mockQuery = createMockQueryBuilder(expectedCard);
        mockDb.kysely.insertInto.mockReturnValue(mockQuery);

        const result = await service.createCard(input);

        expect(mockQuery.values).toHaveBeenCalledWith(
          expect.objectContaining({
            board_id: '550e8400-e29b-41d4-a716-446655440000',
            column_id: '550e8400-e29b-41d4-a716-446655440001',
            title: 'New Card',
            description: 'Test description',
            priority: 'high'
          })
        );
        expect(result).toEqual({ ...expectedCard, tags: [] });
      });

      it('should find column by name when column_name provided', async () => {
        const input = {
          board_id: '550e8400-e29b-41d4-a716-446655440000',
          column_name: 'To Do',
          title: 'New Card'
        };
        
        // Mock column lookup
        const mockColumnQuery = createMockQueryBuilder({ id: '550e8400-e29b-41d4-a716-446655440001' });
        mockDb.kysely.selectFrom.mockReturnValueOnce(mockColumnQuery);
        
        // Mock card creation
        const mockCardQuery = createMockQueryBuilder(mockTestData.card);
        mockDb.kysely.insertInto.mockReturnValue(mockCardQuery);

        await service.createCard(input);

        expect(mockColumnQuery.where).toHaveBeenCalledWith('board_id', '=', '550e8400-e29b-41d4-a716-446655440000');
        expect(mockColumnQuery.where).toHaveBeenCalledWith('name', '=', 'To Do');
      });

      it('should throw ValidationError when column_name not found', async () => {
        const input = {
          board_id: '550e8400-e29b-41d4-a716-446655440000',
          column_name: 'Nonexistent Column',
          title: 'New Card'
        };
        
        const mockQuery = createMockQueryBuilder(undefined);
        mockDb.kysely.selectFrom.mockReturnValue(mockQuery);

        await expect(service.createCard(input))
          .rejects.toThrow(ValidationError);
      });

      it('should use first column when no column specified', async () => {
        const input = {
          board_id: '550e8400-e29b-41d4-a716-446655440000',
          title: 'New Card'
        };
        
        // Mock first column lookup
        const mockColumnQuery = createMockQueryBuilder({ id: '550e8400-e29b-41d4-a716-446655440001' });
        mockDb.kysely.selectFrom.mockReturnValueOnce(mockColumnQuery);
        
        // Mock card creation
        const mockCardQuery = createMockQueryBuilder(mockTestData.card);
        mockDb.kysely.insertInto.mockReturnValue(mockCardQuery);

        await service.createCard(input);

        expect(mockColumnQuery.orderBy).toHaveBeenCalledWith('position', 'asc');
      });

      it('should throw ValidationError when no columns exist', async () => {
        const input = {
          board_id: '550e8400-e29b-41d4-a716-446655440000',
          title: 'New Card'
        };
        
        const mockQuery = createMockQueryBuilder(undefined);
        mockDb.kysely.selectFrom.mockReturnValue(mockQuery);

        await expect(service.createCard(input))
          .rejects.toThrow(ValidationError);
      });

      it('should use default values for optional fields', async () => {
        const input = { board_id: '550e8400-e29b-41d4-a716-446655440000', column_id: '550e8400-e29b-41d4-a716-446655440001', title: 'New Card' };
        const mockQuery = createMockQueryBuilder(mockTestData.card);
        mockDb.kysely.insertInto.mockReturnValue(mockQuery);

        await service.createCard(input);

        expect(mockQuery.values).toHaveBeenCalledWith(
          expect.objectContaining({
            position: 0,
            priority: 'medium',
            assigned_to: null,
            due_date: null
          })
        );
      });
    });

    describe('updateCard', () => {
      it('should update existing card and return with tags', async () => {
        const updateInput = { title: 'Updated Card' };
        const existingCard = mockTestData.card;
        const updatedCard = { ...existingCard, ...updateInput };
        const expectedTag = mockTestData.tag;

        // Mock existing card check
        const mockSelectQuery = createMockQueryBuilder(existingCard);
        mockDb.kysely.selectFrom.mockReturnValueOnce(mockSelectQuery);
        
        // Mock update operation
        const mockUpdateQuery = createMockQueryBuilder(updatedCard);
        mockDb.kysely.updateTable.mockReturnValue(mockUpdateQuery);
        
        // Mock tags query
        const mockTagsQuery = createMockQueryBuilder([expectedTag]);
        mockDb.kysely.selectFrom.mockReturnValue(mockTagsQuery);

        const result = await service.updateCard(1, updateInput);

        expect(result).toEqual({
          ...updatedCard,
          tags: [expectedTag]
        });
      });

      it('should throw NotFoundError when card does not exist', async () => {
        const mockQuery = createMockQueryBuilder(undefined);
        mockDb.kysely.selectFrom.mockReturnValue(mockQuery);

        await expect(service.updateCard(999, { title: 'Updated' }))
          .rejects.toThrow(NotFoundError);
      });
    });

    describe('moveCard', () => {
      it('should move card to specified column_id', async () => {
        const moveInput = { column_id: 2, position: 1 };
        const existingCard = mockTestData.card;
        const movedCard = { ...existingCard, column_id: 2, position: 1 };

        // Mock existing card check
        const mockSelectQuery = createMockQueryBuilder(existingCard);
        mockDb.kysely.selectFrom.mockReturnValueOnce(mockSelectQuery);
        
        // Mock update operation
        const mockUpdateQuery = createMockQueryBuilder(movedCard);
        mockDb.kysely.updateTable.mockReturnValue(mockUpdateQuery);
        
        // Mock tags query
        const mockTagsQuery = createMockQueryBuilder([]);
        mockDb.kysely.selectFrom.mockReturnValue(mockTagsQuery);

        const result = await service.moveCard('550e8400-e29b-41d4-a716-446655440002', moveInput);

        expect(mockUpdateQuery.set).toHaveBeenCalledWith({
          column_id: 2,
          position: 1,
          updated_at: '2024-01-01T00:00:00.000Z'
        });
        expect(result.column_id).toBe(2);
        expect(result.position).toBe(1);
      });

      it('should find column by name when column_name provided', async () => {
        const moveInput = { column_name: 'Done', position: 1 };
        const existingCard = mockTestData.card;

        // Mock existing card check
        const mockCardQuery = createMockQueryBuilder(existingCard);
        mockDb.kysely.selectFrom.mockReturnValueOnce(mockCardQuery);
        
        // Mock column lookup
        const mockColumnQuery = createMockQueryBuilder({ id: '550e8400-e29b-41d4-a716-446655440004' });
        mockDb.kysely.selectFrom.mockReturnValueOnce(mockColumnQuery);
        
        // Mock update and tags queries
        const mockUpdateQuery = createMockQueryBuilder(existingCard);
        mockDb.kysely.updateTable.mockReturnValue(mockUpdateQuery);
        const mockTagsQuery = createMockQueryBuilder([]);
        mockDb.kysely.selectFrom.mockReturnValue(mockTagsQuery);

        await service.moveCard('550e8400-e29b-41d4-a716-446655440002', moveInput);

        expect(mockColumnQuery.where).toHaveBeenCalledWith('board_id', '=', '550e8400-e29b-41d4-a716-446655440000');
        expect(mockColumnQuery.where).toHaveBeenCalledWith('name', '=', 'Done');
      });

      it('should throw ValidationError when column_name not found', async () => {
        const moveInput = { column_name: 'Nonexistent', position: 1 };
        const existingCard = mockTestData.card;

        // Mock existing card check
        const mockCardQuery = createMockQueryBuilder(existingCard);
        mockDb.kysely.selectFrom.mockReturnValueOnce(mockCardQuery);
        
        // Mock column lookup returning undefined
        const mockColumnQuery = createMockQueryBuilder(undefined);
        mockDb.kysely.selectFrom.mockReturnValue(mockColumnQuery);

        await expect(service.moveCard('550e8400-e29b-41d4-a716-446655440002', moveInput))
          .rejects.toThrow(ValidationError);
      });

      it('should keep current column when no column specified', async () => {
        const moveInput = { position: 1 };
        const existingCard = mockTestData.card;

        const mockSelectQuery = createMockQueryBuilder(existingCard);
        mockDb.kysely.selectFrom.mockReturnValueOnce(mockSelectQuery);
        
        const mockUpdateQuery = createMockQueryBuilder(existingCard);
        mockDb.kysely.updateTable.mockReturnValue(mockUpdateQuery);
        
        const mockTagsQuery = createMockQueryBuilder([]);
        mockDb.kysely.selectFrom.mockReturnValue(mockTagsQuery);

        await service.moveCard('550e8400-e29b-41d4-a716-446655440002', moveInput);

        expect(mockUpdateQuery.set).toHaveBeenCalledWith({
          column_id: existingCard.column_id, // Should keep current column
          position: 1,
          updated_at: '2024-01-01T00:00:00.000Z'
        });
      });

      it('should throw NotFoundError when card does not exist', async () => {
        const mockQuery = createMockQueryBuilder(undefined);
        mockDb.kysely.selectFrom.mockReturnValue(mockQuery);

        await expect(service.moveCard(999, { position: 1 }))
          .rejects.toThrow(NotFoundError);
      });
    });

    describe('deleteCard', () => {
      it('should delete existing card', async () => {
        const mockQuery = createMockQueryBuilder();
        mockQuery.executeTakeFirst.mockResolvedValue(createMockDeleteResult(1));
        mockDb.kysely.deleteFrom.mockReturnValue(mockQuery);

        await service.deleteCard(1);

        expect(mockDb.kysely.deleteFrom).toHaveBeenCalledWith('cards');
      });

      it('should throw NotFoundError when card does not exist', async () => {
        const mockQuery = createMockQueryBuilder();
        mockQuery.executeTakeFirst.mockResolvedValue(createMockDeleteResult(0));
        mockDb.kysely.deleteFrom.mockReturnValue(mockQuery);

        await expect(service.deleteCard(999))
          .rejects.toThrow(NotFoundError);
      });
    });

    describe('searchCards', () => {
      it('should search cards by query with all filters', async () => {
        const searchInput = {
          query: 'test',
          board_id: '550e8400-e29b-41d4-a716-446655440000',
          priority: 'high' as const,
          assigned_to: 'user1'
        };
        const expectedCards = [mockTestData.card];
        
        const mockCardsQuery = createMockQueryBuilder(expectedCards);
        mockDb.kysely.selectFrom.mockReturnValueOnce(mockCardsQuery);
        
        const mockTagsQuery = createMockQueryBuilder([]);
        mockDb.kysely.selectFrom.mockReturnValue(mockTagsQuery);

        const result = await service.searchCards(searchInput);

        expect(mockCardsQuery.where).toHaveBeenCalledWith('title', 'like', '%test%');
        expect(mockCardsQuery.where).toHaveBeenCalledWith('board_id', '=', '550e8400-e29b-41d4-a716-446655440000');
        expect(mockCardsQuery.where).toHaveBeenCalledWith('priority', '=', 'high');
        expect(mockCardsQuery.where).toHaveBeenCalledWith('assigned_to', '=', 'user1');
        expect(mockCardsQuery.orderBy).toHaveBeenCalledWith('created_at', 'desc');
        expect(result.length).toBe(1);
      });

      it('should search cards with minimal filters', async () => {
        const searchInput = { query: 'test' };
        const expectedCards = [mockTestData.card];
        
        const mockCardsQuery = createMockQueryBuilder(expectedCards);
        mockDb.kysely.selectFrom.mockReturnValueOnce(mockCardsQuery);
        
        const mockTagsQuery = createMockQueryBuilder([]);
        mockDb.kysely.selectFrom.mockReturnValue(mockTagsQuery);

        await service.searchCards(searchInput);

        expect(mockCardsQuery.where).toHaveBeenCalledWith('title', 'like', '%test%');
        // Should not call where for optional filters
        expect(mockCardsQuery.where).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('Tag Operations', () => {
    describe('getAllTags', () => {
      it('should return all tags ordered by name', async () => {
        const expectedTags = [mockTestData.tag];
        const mockQuery = createMockQueryBuilder(expectedTags);
        mockDb.kysely.selectFrom.mockReturnValue(mockQuery);

        const result = await service.getAllTags();

        expect(mockQuery.orderBy).toHaveBeenCalledWith('name', 'asc');
        expect(result).toEqual(expectedTags);
      });
    });

    describe('createTag', () => {
      it('should create tag with provided values', async () => {
        const input = { name: 'urgent', color: '#ff0000' };
        const expectedTag = { ...mockTestData.tag, ...input };
        
        const mockQuery = createMockQueryBuilder(expectedTag);
        mockDb.kysely.insertInto.mockReturnValue(mockQuery);

        const result = await service.createTag(input);

        expect(result).toEqual(expectedTag);
      });

      it('should use default color when not provided', async () => {
        const input = { name: 'urgent' };
        const mockQuery = createMockQueryBuilder(mockTestData.tag);
        mockDb.kysely.insertInto.mockReturnValue(mockQuery);

        await service.createTag(input);

        expect(mockQuery.values).toHaveBeenCalledWith(
          expect.objectContaining({ color: '#64748b' })
        );
      });
    });

    describe('addCardTag', () => {
      it('should add tag to card', async () => {
        const mockQuery = createMockQueryBuilder();
        mockDb.kysely.insertInto.mockReturnValue(mockQuery);

        await service.addCardTag('550e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440003');

        expect(mockDb.kysely.insertInto).toHaveBeenCalledWith('card_tags');
        expect(mockQuery.values).toHaveBeenCalledWith({
          id: expect.any(String),
          card_id: '550e8400-e29b-41d4-a716-446655440002',
          tag_id: '550e8400-e29b-41d4-a716-446655440003',
          created_at: '2024-01-01T00:00:00.000Z'
        });
      });
    });

    describe('removeCardTag', () => {
      it('should remove tag from card', async () => {
        const mockQuery = createMockQueryBuilder();
        mockDb.kysely.deleteFrom.mockReturnValue(mockQuery);

        await service.removeCardTag(1, 1);

        expect(mockDb.kysely.deleteFrom).toHaveBeenCalledWith('card_tags');
        expect(mockQuery.where).toHaveBeenCalledWith('card_id', '=', 1);
        expect(mockQuery.where).toHaveBeenCalledWith('tag_id', '=', 1);
      });
    });

    describe('getCardTags', () => {
      it('should return tags for card', async () => {
        const expectedTags = [mockTestData.tag];
        const mockQuery = createMockQueryBuilder(expectedTags);
        mockDb.kysely.selectFrom.mockReturnValue(mockQuery);

        const result = await service.getCardTags(1);

        expect(mockQuery.innerJoin).toHaveBeenCalledWith('tags', 'tags.id', 'card_tags.tag_id');
        expect(mockQuery.where).toHaveBeenCalledWith('card_tags.card_id', '=', 1);
        expect(result).toEqual(expectedTags);
      });
    });
  });

  describe('Comment Operations', () => {
    describe('getCardComments', () => {
      it('should return comments for card ordered by created_at', async () => {
        const expectedComments = [mockTestData.comment];
        const mockQuery = createMockQueryBuilder(expectedComments);
        mockDb.kysely.selectFrom.mockReturnValue(mockQuery);

        const result = await service.getCardComments(1);

        expect(mockQuery.where).toHaveBeenCalledWith('card_id', '=', 1);
        expect(mockQuery.orderBy).toHaveBeenCalledWith('created_at', 'asc');
        expect(result).toEqual(expectedComments);
      });
    });

    describe('addComment', () => {
      it('should add comment to card', async () => {
        const input = {
          card_id: '550e8400-e29b-41d4-a716-446655440002',
          content: 'Test comment',
          author: 'test-user'
        };
        const expectedComment = { ...mockTestData.comment, ...input };
        
        const mockQuery = createMockQueryBuilder(expectedComment);
        mockDb.kysely.insertInto.mockReturnValue(mockQuery);

        const result = await service.addComment(input);

        expect(mockQuery.values).toHaveBeenCalledWith({
          id: expect.any(String),
          ...input,
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z'
        });
        expect(result).toEqual(expectedComment);
      });

      it('should use null author when not provided', async () => {
        const input = { card_id: '550e8400-e29b-41d4-a716-446655440002', content: 'Test comment' };
        const mockQuery = createMockQueryBuilder(mockTestData.comment);
        mockDb.kysely.insertInto.mockReturnValue(mockQuery);

        await service.addComment(input);

        expect(mockQuery.values).toHaveBeenCalledWith(
          expect.objectContaining({ author: null })
        );
      });
    });

    describe('deleteComment', () => {
      it('should delete existing comment', async () => {
        const mockQuery = createMockQueryBuilder();
        mockQuery.executeTakeFirst.mockResolvedValue(createMockDeleteResult(1));
        mockDb.kysely.deleteFrom.mockReturnValue(mockQuery);

        await service.deleteComment(1);

        expect(mockDb.kysely.deleteFrom).toHaveBeenCalledWith('comments');
      });

      it('should throw NotFoundError when comment does not exist', async () => {
        const mockQuery = createMockQueryBuilder();
        mockQuery.executeTakeFirst.mockResolvedValue(createMockDeleteResult(0));
        mockDb.kysely.deleteFrom.mockReturnValue(mockQuery);

        await expect(service.deleteComment(999))
          .rejects.toThrow(NotFoundError);
      });
    });
  });

  describe('Statistics', () => {
    describe('getStats', () => {
      it('should return comprehensive kanban statistics', async () => {
        // Mock board count
        const mockBoardCountQuery = createMockQueryBuilder({ count: '5' });
        mockDb.kysely.selectFrom.mockReturnValueOnce(mockBoardCountQuery);
        
        // Mock card count
        const mockCardCountQuery = createMockQueryBuilder({ count: '25' });
        mockDb.kysely.selectFrom.mockReturnValueOnce(mockCardCountQuery);
        
        // Mock priority counts
        const mockPriorityQuery = createMockQueryBuilder([
          { priority: 'low', count: '5' },
          { priority: 'medium', count: '10' },
          { priority: 'high', count: '8' },
          { priority: 'urgent', count: '2' }
        ]);
        mockDb.kysely.selectFrom.mockReturnValueOnce(mockPriorityQuery);
        
        // Mock overdue count
        const mockOverdueQuery = createMockQueryBuilder({ count: '3' });
        mockDb.kysely.selectFrom.mockReturnValue(mockOverdueQuery);

        const result = await service.getStats();

        expect(result).toEqual({
          total_boards: 5,
          total_cards: 25,
          cards_by_priority: {
            low: 5,
            medium: 10,
            high: 8,
            urgent: 2
          },
          cards_by_status: {},
          overdue_cards: 3,
          recent_activity: []
        });
      });

      it('should handle missing priority data', async () => {
        // Mock counts
        const mockBoardCountQuery = createMockQueryBuilder({ count: '1' });
        mockDb.kysely.selectFrom.mockReturnValueOnce(mockBoardCountQuery);
        
        const mockCardCountQuery = createMockQueryBuilder({ count: '1' });
        mockDb.kysely.selectFrom.mockReturnValueOnce(mockCardCountQuery);
        
        // Mock empty priority counts
        const mockPriorityQuery = createMockQueryBuilder([]);
        mockDb.kysely.selectFrom.mockReturnValueOnce(mockPriorityQuery);
        
        const mockOverdueQuery = createMockQueryBuilder({ count: '0' });
        mockDb.kysely.selectFrom.mockReturnValue(mockOverdueQuery);

        const result = await service.getStats();

        expect(result.cards_by_priority).toEqual({
          low: 0,
          medium: 0,
          high: 0,
          urgent: 0
        });
      });

      it('should check overdue cards against current date', async () => {
        // Mock basic counts
        const mockBoardCountQuery = createMockQueryBuilder({ count: '1' });
        mockDb.kysely.selectFrom.mockReturnValueOnce(mockBoardCountQuery);
        
        const mockCardCountQuery = createMockQueryBuilder({ count: '1' });
        mockDb.kysely.selectFrom.mockReturnValueOnce(mockCardCountQuery);
        
        const mockPriorityQuery = createMockQueryBuilder([]);
        mockDb.kysely.selectFrom.mockReturnValueOnce(mockPriorityQuery);
        
        const mockOverdueQuery = createMockQueryBuilder({ count: '2' });
        mockDb.kysely.selectFrom.mockReturnValue(mockOverdueQuery);

        await service.getStats();

        // Verify overdue query uses current date
        expect(mockOverdueQuery.where).toHaveBeenCalledWith('due_date', '<', '2024-01-01');
      });
    });
  });

  describe('Slug Generation Safety', () => {
    it('should return base slug when unique', async () => {
      const ensureUniqueBoardSlug = (service as any).ensureUniqueBoardSlug.bind(service);

      // First query returns no match — slug is unique
      const mockQuery = createMockQueryBuilder(undefined);
      mockDb.kysely.selectFrom.mockReturnValue(mockQuery);

      const result = await ensureUniqueBoardSlug('test-board');
      expect(result).toBe('test-board');
    });

    it('should append counter when base slug exists', async () => {
      const ensureUniqueBoardSlug = (service as any).ensureUniqueBoardSlug.bind(service);

      // First call: slug exists
      const existingQuery = createMockQueryBuilder({ id: 'existing-id' });
      mockDb.kysely.selectFrom.mockReturnValueOnce(existingQuery);

      // Second call: slug-1 is unique
      const uniqueQuery = createMockQueryBuilder(undefined);
      mockDb.kysely.selectFrom.mockReturnValueOnce(uniqueQuery);

      const result = await ensureUniqueBoardSlug('test-board');
      expect(result).toBe('test-board-1');
    });

    it('should have a max attempt limit to prevent infinite loops', () => {
      // Verify the constant exists and is reasonable
      expect((KanbanService as any).MAX_SLUG_ATTEMPTS).toBeDefined();
      expect((KanbanService as any).MAX_SLUG_ATTEMPTS).toBeGreaterThan(0);
      expect((KanbanService as any).MAX_SLUG_ATTEMPTS).toBeLessThanOrEqual(10000);
    });
  });
});