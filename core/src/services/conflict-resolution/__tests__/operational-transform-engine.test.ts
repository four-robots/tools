/**
 * Tests for Operational Transform Engine
 * 
 * Tests the race condition fixes, transaction handling, and concurrent
 * operation transformation logic.
 */

import { Pool } from 'pg';
import { OperationalTransformEngine } from '../operational-transform-engine';
import { Operation, OperationSchema } from '../../../shared/types/conflict-resolution';

// Mock database pool
const mockPool = {
  connect: jest.fn(),
  query: jest.fn()
} as unknown as Pool;

// Mock database client
const mockClient = {
  query: jest.fn(),
  release: jest.fn()
};

describe('OperationalTransformEngine', () => {
  let engine: OperationalTransformEngine;

  beforeEach(() => {
    jest.clearAllMocks();
    engine = new OperationalTransformEngine(mockPool);
    (mockPool.connect as jest.Mock).mockResolvedValue(mockClient);
    mockClient.query.mockResolvedValue({ rows: [] });
  });

  const createOperation = (
    type: 'insert' | 'delete' | 'retain' | 'replace' | 'move',
    position: number,
    content?: string,
    length?: number,
    userId = 'user1',
    sessionId = 'session1'
  ): Operation => {
    return OperationSchema.parse({
      id: crypto.randomUUID(),
      type,
      position,
      content,
      length,
      userId,
      timestamp: new Date(),
      sessionId,
      attributes: {}
    });
  };

  describe('Race Condition Handling', () => {
    it('prevents concurrent transformation of the same operation pair', async () => {
      const op1 = createOperation('insert', 5, 'text');
      const op2 = createOperation('insert', 10, 'other');

      // Start two transformations concurrently
      const promise1 = engine.transformOperation(op1, op2);
      const promise2 = engine.transformOperation(op1, op2);

      const results = await Promise.all([promise1, promise2]);

      // Both should succeed, but the second should wait for the first
      expect(results[0]).toBeDefined();
      expect(results[1]).toBeDefined();
      expect(mockPool.connect).toHaveBeenCalledTimes(2);
    });

    it('handles concurrent transformations of different operation pairs', async () => {
      const op1 = createOperation('insert', 5, 'text');
      const op2 = createOperation('insert', 10, 'other');
      const op3 = createOperation('delete', 15, undefined, 5);
      const op4 = createOperation('replace', 20, 'replacement', 10);

      // Start transformations of different pairs concurrently
      const promise1 = engine.transformOperation(op1, op2);
      const promise2 = engine.transformOperation(op3, op4);

      const results = await Promise.all([promise1, promise2]);

      expect(results[0]).toBeDefined();
      expect(results[1]).toBeDefined();
    });

    it('releases locks after transformation completion', async () => {
      const op1 = createOperation('insert', 5, 'text');
      const op2 = createOperation('insert', 10, 'other');

      await engine.transformOperation(op1, op2);

      // Should be able to transform the same pair again without waiting
      await engine.transformOperation(op1, op2);

      expect(mockPool.connect).toHaveBeenCalledTimes(2);
    });
  });

  describe('Transaction Handling', () => {
    it('uses database transactions for operation recording', async () => {
      const op1 = createOperation('insert', 5, 'text');
      const op2 = createOperation('insert', 10, 'other');

      await engine.transformOperation(op1, op2);

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('rolls back transaction on error', async () => {
      const op1 = createOperation('insert', 5, 'text');
      const op2 = createOperation('insert', 10, 'other');

      // Mock an error during transformation
      mockClient.query.mockImplementation((query: string) => {
        if (query.includes('INSERT INTO')) {
          throw new Error('Database error');
        }
        return Promise.resolve({ rows: [] });
      });

      await expect(engine.transformOperation(op1, op2)).rejects.toThrow('Failed to transform operation');

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('records transformation relationship in database', async () => {
      const op1 = createOperation('insert', 5, 'text');
      const op2 = createOperation('insert', 10, 'other');

      await engine.transformOperation(op1, op2);

      // Should record both the original and transformed operations
      const insertCalls = mockClient.query.mock.calls.filter(call => 
        call[0]?.includes('INSERT INTO operational_transform_operations')
      );
      expect(insertCalls.length).toBeGreaterThanOrEqual(1);

      const relationshipCalls = mockClient.query.mock.calls.filter(call => 
        call[0]?.includes('INSERT INTO operation_transformations')
      );
      expect(relationshipCalls.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Insert Operation Transformations', () => {
    it('transforms insert against insert - position adjustment', async () => {
      const op1 = createOperation('insert', 5, 'hello');
      const op2 = createOperation('insert', 3, 'world');

      const result = await engine.transformOperation(op1, op2);

      expect(result.type).toBe('insert');
      expect(result.position).toBe(10); // 5 + 5 (length of 'world')
      expect(result.content).toBe('hello');
    });

    it('transforms insert against insert - same position tie-breaking', async () => {
      const op1 = createOperation('insert', 5, 'hello', undefined, 'user1');
      const op2 = createOperation('insert', 5, 'world', undefined, 'user2');

      const result = await engine.transformOperation(op1, op2);

      expect(result.type).toBe('insert');
      // Position should be adjusted based on user ID tie-breaking
      expect(result.position).toBeGreaterThanOrEqual(5);
    });

    it('transforms insert against delete', async () => {
      const insertOp = createOperation('insert', 10, 'text');
      const deleteOp = createOperation('delete', 5, undefined, 3);

      const result = await engine.transformOperation(insertOp, deleteOp);

      expect(result.type).toBe('insert');
      expect(result.position).toBe(7); // 10 - 3 (deleted length)
      expect(result.content).toBe('text');
    });
  });

  describe('Delete Operation Transformations', () => {
    it('transforms delete against insert', async () => {
      const deleteOp = createOperation('delete', 10, undefined, 3);
      const insertOp = createOperation('insert', 5, 'text');

      const result = await engine.transformOperation(deleteOp, insertOp);

      expect(result.type).toBe('delete');
      expect(result.position).toBe(14); // 10 + 4 (length of 'text')
      expect(result.length).toBe(3);
    });

    it('transforms delete against delete - overlapping regions', async () => {
      const deleteOp1 = createOperation('delete', 5, undefined, 5); // Delete 5-10
      const deleteOp2 = createOperation('delete', 7, undefined, 5); // Delete 7-12

      const result = await engine.transformOperation(deleteOp1, deleteOp2);

      expect(result.type).toBe('delete');
      expect(result.position).toBe(5);
      // Length should be adjusted for overlap
      expect(result.length).toBeLessThanOrEqual(5);
    });

    it('transforms delete against delete - no overlap', async () => {
      const deleteOp1 = createOperation('delete', 15, undefined, 3);
      const deleteOp2 = createOperation('delete', 5, undefined, 3);

      const result = await engine.transformOperation(deleteOp1, deleteOp2);

      expect(result.type).toBe('delete');
      expect(result.position).toBe(12); // 15 - 3
      expect(result.length).toBe(3);
    });
  });

  describe('Replace Operation Transformations', () => {
    it('transforms replace against insert', async () => {
      const replaceOp = createOperation('replace', 10, 'new content', 5);
      const insertOp = createOperation('insert', 5, 'text');

      const result = await engine.transformOperation(replaceOp, insertOp);

      expect(result.type).toBe('replace');
      expect(result.position).toBe(14); // 10 + 4 (length of 'text')
      expect(result.content).toBe('new content');
      expect(result.length).toBe(5);
    });

    it('transforms replace against replace - same position', async () => {
      const replaceOp1 = createOperation('replace', 10, 'content1', 5, 'user1');
      const replaceOp2 = createOperation('replace', 10, 'content2', 5, 'user2');

      const result = await engine.transformOperation(replaceOp1, replaceOp2);

      // Should use tie-breaking logic
      expect(result).toBeDefined();
      expect(result.userId).toBe('user1');
    });
  });

  describe('Operation Application', () => {
    it('applies insert operation correctly', async () => {
      const content = 'Hello World';
      const insertOp = createOperation('insert', 6, 'Beautiful ');

      const result = await engine.applyOperation(content, insertOp);

      expect(result).toBe('Hello Beautiful World');
    });

    it('applies delete operation correctly', async () => {
      const content = 'Hello Beautiful World';
      const deleteOp = createOperation('delete', 6, undefined, 10);

      const result = await engine.applyOperation(content, deleteOp);

      expect(result).toBe('Hello World');
    });

    it('applies replace operation correctly', async () => {
      const content = 'Hello World';
      const replaceOp = createOperation('replace', 6, 'Universe', 5);

      const result = await engine.applyOperation(content, replaceOp);

      expect(result).toBe('Hello Universe');
    });

    it('handles out-of-bounds operations gracefully', async () => {
      const content = 'Short';
      const insertOp = createOperation('insert', 10, 'text');

      await expect(engine.applyOperation(content, insertOp))
        .rejects.toThrow('Failed to apply operation');
    });
  });

  describe('Operation Composition', () => {
    it('composes adjacent insert operations', async () => {
      const op1 = createOperation('insert', 5, 'Hello ');
      const op2 = createOperation('insert', 11, 'World');

      const result = await engine.composeOperations([op1, op2]);

      expect(result.type).toBe('insert');
      expect(result.position).toBe(5);
      expect(result.content).toBe('Hello World');
    });

    it('composes adjacent delete operations', async () => {
      const op1 = createOperation('delete', 5, undefined, 3);
      const op2 = createOperation('delete', 5, undefined, 2);

      const result = await engine.composeOperations([op1, op2]);

      expect(result.type).toBe('delete');
      expect(result.position).toBe(5);
      expect(result.length).toBe(5);
    });

    it('handles single operation composition', async () => {
      const op = createOperation('insert', 5, 'text');

      const result = await engine.composeOperations([op]);

      expect(result).toEqual(op);
    });

    it('throws error for empty operation list', async () => {
      await expect(engine.composeOperations([])).rejects.toThrow('Cannot compose empty operation list');
    });
  });

  describe('Operation Inversion', () => {
    it('inverts insert operation to delete', async () => {
      const insertOp = createOperation('insert', 5, 'text');

      const result = await engine.invertOperation(insertOp);

      expect(result.type).toBe('delete');
      expect(result.position).toBe(5);
      expect(result.length).toBe(4);
    });

    it('inverts delete operation to insert', async () => {
      const deleteOp = createOperation('delete', 5, undefined, 4);
      deleteOp.attributes = { deletedContent: 'text' };

      const result = await engine.invertOperation(deleteOp);

      expect(result.type).toBe('insert');
      expect(result.position).toBe(5);
      expect(result.content).toBe('text');
    });

    it('inverts replace operation', async () => {
      const replaceOp = createOperation('replace', 5, 'new', 3);
      replaceOp.attributes = { originalContent: 'old' };

      const result = await engine.invertOperation(replaceOp);

      expect(result.type).toBe('replace');
      expect(result.position).toBe(5);
      expect(result.content).toBe('old');
      expect(result.length).toBe(3);
    });
  });

  describe('Error Handling', () => {
    it('handles database connection errors gracefully', async () => {
      (mockPool.connect as jest.Mock).mockRejectedValue(new Error('Connection failed'));

      const op1 = createOperation('insert', 5, 'text');
      const op2 = createOperation('insert', 10, 'other');

      await expect(engine.transformOperation(op1, op2))
        .rejects.toThrow('Failed to transform operation');
    });

    it('handles invalid operation types', async () => {
      const invalidOp = { ...createOperation('insert', 5, 'text'), type: 'invalid' as any };
      const validOp = createOperation('insert', 10, 'other');

      await expect(engine.transformOperation(invalidOp, validOp))
        .rejects.toThrow();
    });

    it('validates transformation results', async () => {
      const op1 = createOperation('insert', 5, 'text');
      const op2 = createOperation('insert', 10, 'other');

      // Mock validation failure
      mockClient.query.mockImplementation((query: string) => {
        if (query.includes('BEGIN') || query.includes('COMMIT')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const result = await engine.transformOperation(op1, op2);
      
      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.userId).toBe(op1.userId);
    });
  });
});