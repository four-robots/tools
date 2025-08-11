/**
 * Tests for Merge Strategy Engine
 * 
 * Tests the database transaction handling, atomic operations, and proper
 * rollback behavior for multi-table merge operations.
 */

import { Pool, PoolClient } from 'pg';
import { MergeStrategyEngine } from '../merge-strategy-engine';
import { OperationalTransformEngine, AIAssistedMergeService } from '../../../shared/types/conflict-resolution';
import { ConflictDetection, MergeStrategy } from '../../../shared/types/conflict-resolution';

// Mock dependencies
const mockOperationalTransformEngine = {} as OperationalTransformEngine;
const mockAIAssistedMergeService = {} as AIAssistedMergeService;

// Mock database client
const mockClient = {
  query: jest.fn(),
  release: jest.fn()
};

// Mock database pool
const mockPool = {
  connect: jest.fn(),
  query: jest.fn()
} as unknown as Pool;

describe('MergeStrategyEngine', () => {
  let engine: MergeStrategyEngine;

  beforeEach(() => {
    jest.clearAllMocks();
    engine = new MergeStrategyEngine(
      mockPool,
      mockOperationalTransformEngine,
      mockAIAssistedMergeService
    );
    
    // Setup default mocks
    (mockPool.connect as jest.Mock).mockResolvedValue(mockClient);
    mockClient.query.mockResolvedValue({ rows: [] });
  });

  const mockConflict: ConflictDetection = {
    id: 'conflict-123',
    contentId: 'content-456',
    conflictType: 'content_modification',
    status: 'detected',
    baseVersion: {
      id: 'base-version',
      content: 'Base content',
      userId: 'system',
      createdAt: new Date(),
      contentType: 'text/plain'
    },
    versionA: {
      id: 'version-a',
      content: 'Modified content A',
      userId: 'user1',
      createdAt: new Date(),
      contentType: 'text/plain'
    },
    versionB: {
      id: 'version-b',
      content: 'Modified content B',
      userId: 'user2',
      createdAt: new Date(),
      contentType: 'text/plain'
    },
    conflictRegions: [],
    detectedAt: new Date(),
    sessionId: 'session-123',
    severity: 'medium',
    canAutoResolve: true,
    recommendedStrategy: 'three_way_merge'
  };

  describe('Transaction Handling', () => {
    it('executes merge operations within database transaction', async () => {
      // Mock conflict details query
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [mockConflict] }) // getConflictDetailsWithClient
        .mockResolvedValueOnce({ rows: [] }) // storeMergeResultWithClient
        .mockResolvedValueOnce({ rows: [] }) // updateConflictStatusWithClient
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      // Mock the merge execution methods
      const mockMergeResult = {
        id: 'merge-result-123',
        conflictId: 'conflict-123',
        strategy: 'three_way_merge' as MergeStrategy,
        mergedContent: 'Merged content',
        mergedContentHash: 'hash123',
        mergedVersion: {
          id: 'merged-version',
          content: 'Merged content',
          userId: 'system',
          createdAt: new Date(),
          contentType: 'text/plain'
        },
        successfulMerges: 1,
        conflictingRegions: [],
        manualInterventions: [],
        confidenceScore: 0.9,
        semanticCoherence: 0.95,
        syntacticCorrectness: 1.0,
        appliedOperations: [],
        rejectedOperations: [],
        startedAt: new Date(),
        completedAt: new Date(),
        requiresUserReview: false,
        userReviewInstructions: ''
      };

      // Mock the actual merge strategy execution
      jest.spyOn(engine as any, 'executeThreeWayMerge').mockResolvedValue(mockMergeResult);
      jest.spyOn(engine as any, 'postProcessMergeResult').mockResolvedValue(mockMergeResult);

      const result = await engine.executeMerge('conflict-123', 'three_way_merge');

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
      expect(result).toEqual(mockMergeResult);
    });

    it('rolls back transaction on merge failure', async () => {
      // Mock conflict details query
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [mockConflict] }) // getConflictDetailsWithClient
        .mockRejectedValueOnce(new Error('Merge execution failed')); // Simulate failure

      await expect(engine.executeMerge('conflict-123', 'three_way_merge'))
        .rejects.toThrow('Failed to execute merge strategy');

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('rolls back transaction on database error', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockRejectedValueOnce(new Error('Database connection lost')); // getConflictDetailsWithClient fails

      await expect(engine.executeMerge('conflict-123', 'three_way_merge'))
        .rejects.toThrow('Failed to execute merge strategy');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('ensures client is always released', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockRejectedValueOnce(new Error('Catastrophic failure'));

      await expect(engine.executeMerge('conflict-123', 'three_way_merge'))
        .rejects.toThrow();

      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('Atomic Operations', () => {
    it('stores merge result and updates conflict status atomically', async () => {
      const mockMergeResult = {
        id: 'merge-result-123',
        conflictId: 'conflict-123',
        strategy: 'operational_transformation' as MergeStrategy,
        mergedContent: 'Merged content',
        mergedContentHash: 'hash123',
        mergedVersion: {
          id: 'merged-version',
          content: 'Merged content',
          userId: 'system',
          createdAt: new Date(),
          contentType: 'text/plain'
        },
        successfulMerges: 1,
        conflictingRegions: [],
        manualInterventions: [],
        confidenceScore: 0.8,
        semanticCoherence: 0.9,
        syntacticCorrectness: 0.95,
        appliedOperations: [],
        rejectedOperations: [],
        startedAt: new Date(),
        completedAt: new Date(),
        requiresUserReview: false,
        userReviewInstructions: ''
      };

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [mockConflict] }) // getConflictDetailsWithClient
        .mockResolvedValueOnce({ rows: [] }) // storeMergeResultWithClient
        .mockResolvedValueOnce({ rows: [] }) // updateConflictStatusWithClient
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      jest.spyOn(engine as any, 'executeOperationalTransformation').mockResolvedValue(mockMergeResult);
      jest.spyOn(engine as any, 'postProcessMergeResult').mockResolvedValue(mockMergeResult);

      await engine.executeMerge('conflict-123', 'operational_transformation');

      // Verify both operations occurred within the same transaction
      const insertCalls = mockClient.query.mock.calls.filter(call => 
        call[0]?.includes('INSERT INTO merge_results')
      );
      const updateCalls = mockClient.query.mock.calls.filter(call => 
        call[0]?.includes('UPDATE conflict_detections')
      );

      expect(insertCalls.length).toBe(1);
      expect(updateCalls.length).toBe(1);
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    it('fails atomically if merge result storage fails', async () => {
      const mockMergeResult = {
        id: 'merge-result-123',
        conflictId: 'conflict-123',
        strategy: 'last_writer_wins' as MergeStrategy,
        mergedContent: 'Merged content',
        mergedContentHash: 'hash123',
        mergedVersion: {
          id: 'merged-version',
          content: 'Merged content',
          userId: 'system',
          createdAt: new Date(),
          contentType: 'text/plain'
        },
        successfulMerges: 1,
        conflictingRegions: [],
        manualInterventions: [],
        confidenceScore: 1.0,
        semanticCoherence: 1.0,
        syntacticCorrectness: 1.0,
        appliedOperations: [],
        rejectedOperations: [],
        startedAt: new Date(),
        completedAt: new Date(),
        requiresUserReview: false,
        userReviewInstructions: ''
      };

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [mockConflict] }) // getConflictDetailsWithClient
        .mockRejectedValueOnce(new Error('Storage constraint violation')); // storeMergeResultWithClient fails

      jest.spyOn(engine as any, 'executeLastWriterWins').mockResolvedValue(mockMergeResult);
      jest.spyOn(engine as any, 'postProcessMergeResult').mockResolvedValue(mockMergeResult);

      await expect(engine.executeMerge('conflict-123', 'last_writer_wins'))
        .rejects.toThrow('Failed to execute merge strategy');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('fails atomically if conflict status update fails', async () => {
      const mockMergeResult = {
        id: 'merge-result-123',
        conflictId: 'conflict-123',
        strategy: 'user_priority_based' as MergeStrategy,
        mergedContent: 'Merged content',
        mergedContentHash: 'hash123',
        mergedVersion: {
          id: 'merged-version',
          content: 'Merged content',
          userId: 'system',
          createdAt: new Date(),
          contentType: 'text/plain'
        },
        successfulMerges: 1,
        conflictingRegions: [],
        manualInterventions: [],
        confidenceScore: 0.7,
        semanticCoherence: 0.8,
        syntacticCorrectness: 0.9,
        appliedOperations: [],
        rejectedOperations: [],
        startedAt: new Date(),
        completedAt: new Date(),
        requiresUserReview: true,
        userReviewInstructions: 'Manual review required'
      };

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [mockConflict] }) // getConflictDetailsWithClient
        .mockResolvedValueOnce({ rows: [] }) // storeMergeResultWithClient
        .mockRejectedValueOnce(new Error('Conflict update failed')); // updateConflictStatusWithClient fails

      jest.spyOn(engine as any, 'executeUserPriorityBased').mockResolvedValue(mockMergeResult);
      jest.spyOn(engine as any, 'postProcessMergeResult').mockResolvedValue(mockMergeResult);

      await expect(engine.executeMerge('conflict-123', 'user_priority_based'))
        .rejects.toThrow('Failed to execute merge strategy');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });
  });

  describe('Database Client Management', () => {
    it('uses transactional client methods correctly', async () => {
      const mockMergeResult = {
        id: 'merge-result-123',
        conflictId: 'conflict-123',
        strategy: 'ai_assisted_merge' as MergeStrategy,
        mergedContent: 'AI merged content',
        mergedContentHash: 'hash123',
        mergedVersion: {
          id: 'merged-version',
          content: 'AI merged content',
          userId: 'system',
          createdAt: new Date(),
          contentType: 'text/plain'
        },
        successfulMerges: 1,
        conflictingRegions: [],
        manualInterventions: [],
        confidenceScore: 0.85,
        semanticCoherence: 0.9,
        syntacticCorrectness: 0.95,
        appliedOperations: [],
        rejectedOperations: [],
        startedAt: new Date(),
        completedAt: new Date(),
        requiresUserReview: false,
        userReviewInstructions: ''
      };

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [mockConflict] }) // getConflictDetailsWithClient
        .mockResolvedValueOnce({ rows: [] }) // storeMergeResultWithClient
        .mockResolvedValueOnce({ rows: [] }) // updateConflictStatusWithClient
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      jest.spyOn(engine as any, 'executeAIAssistedMerge').mockResolvedValue(mockMergeResult);
      jest.spyOn(engine as any, 'postProcessMergeResult').mockResolvedValue(mockMergeResult);

      await engine.executeMerge('conflict-123', 'ai_assisted_merge');

      // Verify client was obtained from pool
      expect(mockPool.connect).toHaveBeenCalledTimes(1);
      
      // Verify all database operations used the same client
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      
      // Verify client was released
      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });

    it('handles multiple concurrent merge executions', async () => {
      const createMockMergeResult = (id: string) => ({
        id,
        conflictId: 'conflict-123',
        strategy: 'custom_rule_based' as MergeStrategy,
        mergedContent: 'Custom merged content',
        mergedContentHash: 'hash123',
        mergedVersion: {
          id: 'merged-version',
          content: 'Custom merged content',
          userId: 'system',
          createdAt: new Date(),
          contentType: 'text/plain'
        },
        successfulMerges: 1,
        conflictingRegions: [],
        manualInterventions: [],
        confidenceScore: 0.6,
        semanticCoherence: 0.7,
        syntacticCorrectness: 0.8,
        appliedOperations: [],
        rejectedOperations: [],
        startedAt: new Date(),
        completedAt: new Date(),
        requiresUserReview: true,
        userReviewInstructions: 'Custom rules applied'
      });

      // Mock separate clients for concurrent operations
      const mockClient1 = { query: jest.fn(), release: jest.fn() };
      const mockClient2 = { query: jest.fn(), release: jest.fn() };

      (mockPool.connect as jest.Mock)
        .mockResolvedValueOnce(mockClient1)
        .mockResolvedValueOnce(mockClient2);

      // Setup successful responses for both clients
      [mockClient1, mockClient2].forEach(client => {
        client.query
          .mockResolvedValueOnce({ rows: [] }) // BEGIN
          .mockResolvedValueOnce({ rows: [mockConflict] }) // getConflictDetailsWithClient
          .mockResolvedValueOnce({ rows: [] }) // storeMergeResultWithClient
          .mockResolvedValueOnce({ rows: [] }) // updateConflictStatusWithClient
          .mockResolvedValueOnce({ rows: [] }); // COMMIT
      });

      jest.spyOn(engine as any, 'executeCustomRuleBased')
        .mockResolvedValueOnce(createMockMergeResult('merge-1'))
        .mockResolvedValueOnce(createMockMergeResult('merge-2'));
      jest.spyOn(engine as any, 'postProcessMergeResult')
        .mockImplementation((result) => Promise.resolve(result));

      // Execute concurrent merges
      const promise1 = engine.executeMerge('conflict-123', 'custom_rule_based');
      const promise2 = engine.executeMerge('conflict-456', 'custom_rule_based');

      const results = await Promise.all([promise1, promise2]);

      expect(results).toHaveLength(2);
      expect(mockPool.connect).toHaveBeenCalledTimes(2);
      expect(mockClient1.release).toHaveBeenCalled();
      expect(mockClient2.release).toHaveBeenCalled();
    });
  });

  describe('Strategy-Specific Transaction Behavior', () => {
    const strategies: MergeStrategy[] = [
      'three_way_merge',
      'operational_transformation',
      'last_writer_wins',
      'user_priority_based',
      'ai_assisted_merge',
      'custom_rule_based',
      'manual_resolution'
    ];

    strategies.forEach(strategy => {
      it(`handles ${strategy} strategy with proper transaction management`, async () => {
        const mockMergeResult = {
          id: `merge-result-${strategy}`,
          conflictId: 'conflict-123',
          strategy,
          mergedContent: `${strategy} merged content`,
          mergedContentHash: 'hash123',
          mergedVersion: {
            id: 'merged-version',
            content: `${strategy} merged content`,
            userId: 'system',
            createdAt: new Date(),
            contentType: 'text/plain'
          },
          successfulMerges: 1,
          conflictingRegions: [],
          manualInterventions: [],
          confidenceScore: 0.8,
          semanticCoherence: 0.85,
          syntacticCorrectness: 0.9,
          appliedOperations: [],
          rejectedOperations: [],
          startedAt: new Date(),
          completedAt: new Date(),
          requiresUserReview: false,
          userReviewInstructions: ''
        };

        mockClient.query
          .mockResolvedValueOnce({ rows: [] }) // BEGIN
          .mockResolvedValueOnce({ rows: [mockConflict] }) // getConflictDetailsWithClient
          .mockResolvedValueOnce({ rows: [] }) // storeMergeResultWithClient
          .mockResolvedValueOnce({ rows: [] }) // updateConflictStatusWithClient
          .mockResolvedValueOnce({ rows: [] }); // COMMIT

        // Mock the strategy-specific execution method
        const methodName = `execute${strategy.split('_').map(word => 
          word.charAt(0).toUpperCase() + word.slice(1)
        ).join('')}`;
        
        jest.spyOn(engine as any, methodName).mockResolvedValue(mockMergeResult);
        jest.spyOn(engine as any, 'postProcessMergeResult').mockResolvedValue(mockMergeResult);

        const result = await engine.executeMerge('conflict-123', strategy);

        expect(result.strategy).toBe(strategy);
        expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
        expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
        expect(mockClient.release).toHaveBeenCalled();
      });
    });

    it('handles unsupported merge strategy gracefully', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [mockConflict] }); // getConflictDetailsWithClient

      await expect(engine.executeMerge('conflict-123', 'unsupported_strategy' as any))
        .rejects.toThrow('Unsupported merge strategy');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('Backward Compatibility', () => {
    it('maintains non-transactional storeMergeResult method', async () => {
      const mockMergeResult = {
        id: 'merge-result-123',
        conflictId: 'conflict-123',
        strategy: 'three_way_merge' as MergeStrategy,
        mergedContent: 'Merged content',
        mergedContentHash: 'hash123',
        mergedVersion: {
          id: 'merged-version',
          content: 'Merged content',
          userId: 'system',
          createdAt: new Date(),
          contentType: 'text/plain'
        },
        successfulMerges: 1,
        conflictingRegions: [],
        manualInterventions: [],
        confidenceScore: 0.9,
        semanticCoherence: 0.95,
        syntacticCorrectness: 1.0,
        appliedOperations: [],
        rejectedOperations: [],
        startedAt: new Date(),
        completedAt: new Date(),
        requiresUserReview: false,
        userReviewInstructions: ''
      };

      // Mock separate connection for non-transactional call
      const separateClient = { query: jest.fn(), release: jest.fn() };
      (mockPool.connect as jest.Mock).mockResolvedValue(separateClient);
      separateClient.query.mockResolvedValue({ rows: [] });

      await (engine as any).storeMergeResult(mockMergeResult);

      expect(mockPool.connect).toHaveBeenCalled();
      expect(separateClient.query).toHaveBeenCalled();
      expect(separateClient.release).toHaveBeenCalled();
    });
  });
});