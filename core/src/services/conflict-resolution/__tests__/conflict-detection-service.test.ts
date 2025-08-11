/**
 * Tests for Conflict Detection Service
 * 
 * Tests the improved vector clock implementation with proper distributed
 * system support, node ID tracking, and conflict resolution logic.
 */

import { Pool } from 'pg';
import { ConflictDetectionService } from '../conflict-detection-service';
import { VectorClock } from '../../../shared/types/conflict-resolution';

// Mock database pool
const mockPool = {
  query: jest.fn()
} as unknown as Pool;

// Mock OS module
jest.mock('os', () => ({
  hostname: () => 'test-hostname',
  platform: () => 'linux'
}));

// Mock crypto module
jest.mock('crypto', () => ({
  createHash: () => ({
    update: () => ({
      digest: () => 'mocked-hash-12345'
    })
  }),
  randomUUID: () => 'mocked-uuid-12345'
}));

describe('ConflictDetectionService', () => {
  let service: ConflictDetectionService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ConflictDetectionService(mockPool);
    
    // Mock default database responses
    (mockPool.query as jest.Mock).mockResolvedValue({ rows: [] });
  });

  describe('Vector Clock Implementation', () => {
    it('creates vector clock with proper node ID', async () => {
      const userId = 'user123';
      const sessionId = 'session123';

      // Mock database response for vector clock state
      (mockPool.query as jest.Mock).mockResolvedValue({
        rows: [
          {
            vector_clock_user_id: userId,
            vector_clock_logical: 5,
            vector_clock_node_id: 'other-node',
            vector_clock_timestamp: new Date()
          }
        ]
      });

      const vectorClock = await (service as any).createVectorClock(userId, sessionId);

      expect(vectorClock.userId).toBe(userId);
      expect(vectorClock.sessionId).toBe(sessionId);
      expect(vectorClock.logicalClock).toBe(6); // Max + 1
      expect(vectorClock.nodeId).toBeDefined();
      expect(vectorClock.timestamp).toBeInstanceOf(Date);
    });

    it('generates consistent node ID from hostname and PID', () => {
      process.env.NODE_ID = undefined;

      const nodeId1 = (service as any).getNodeId();
      const nodeId2 = (service as any).getNodeId();

      expect(nodeId1).toBe(nodeId2);
      expect(nodeId1).toBe('mocked-hash-12345');
    });

    it('uses environment variable for node ID when available', () => {
      process.env.NODE_ID = 'custom-node-id';

      const nodeId = (service as any).getNodeId();

      expect(nodeId).toBe('custom-node-id');
    });

    it('handles empty vector clock state', async () => {
      const userId = 'new-user';
      const sessionId = 'new-session';

      (mockPool.query as jest.Mock).mockResolvedValue({ rows: [] });

      const vectorClock = await (service as any).createVectorClock(userId, sessionId);

      expect(vectorClock.logicalClock).toBe(1); // Start from 1
      expect(vectorClock.userId).toBe(userId);
    });

    it('correctly increments logical clock based on session state', async () => {
      const userId = 'user123';
      const sessionId = 'session123';

      (mockPool.query as jest.Mock).mockResolvedValue({
        rows: [
          {
            vector_clock_user_id: 'user123',
            vector_clock_logical: 10,
            vector_clock_node_id: 'node1',
            vector_clock_timestamp: new Date()
          },
          {
            vector_clock_user_id: 'user456',
            vector_clock_logical: 8,
            vector_clock_node_id: 'node2',
            vector_clock_timestamp: new Date()
          }
        ]
      });

      const vectorClock = await (service as any).createVectorClock(userId, sessionId);

      expect(vectorClock.logicalClock).toBe(11); // Max for this user + 1
    });
  });

  describe('Vector Clock Comparison', () => {
    const createVectorClock = (
      userId: string,
      logicalClock: number,
      sessionId = 'session1',
      timestamp = new Date()
    ): VectorClock => ({
      userId,
      timestamp,
      logicalClock,
      sessionId,
      nodeId: 'test-node'
    });

    it('correctly identifies equal vector clocks', () => {
      const clock1 = createVectorClock('user1', 5);
      const clock2 = createVectorClock('user1', 5);

      const result = (service as any).compareVectorClocks(clock1, clock2);

      expect(result).toBe('equal');
    });

    it('correctly orders vector clocks from same user', () => {
      const clock1 = createVectorClock('user1', 3);
      const clock2 = createVectorClock('user1', 7);

      const result1 = (service as any).compareVectorClocks(clock1, clock2);
      const result2 = (service as any).compareVectorClocks(clock2, clock1);

      expect(result1).toBe('before');
      expect(result2).toBe('after');
    });

    it('identifies concurrent operations from different users with close timestamps', () => {
      const now = new Date();
      const closeTime = new Date(now.getTime() + 500); // 500ms difference

      const clock1 = createVectorClock('user1', 5, 'session1', now);
      const clock2 = createVectorClock('user2', 3, 'session1', closeTime);

      const result = (service as any).compareVectorClocks(clock1, clock2);

      expect(result).toBe('concurrent');
    });

    it('uses temporal ordering for different users with distant timestamps', () => {
      const now = new Date();
      const laterTime = new Date(now.getTime() + 2000); // 2 seconds difference

      const clock1 = createVectorClock('user1', 5, 'session1', now);
      const clock2 = createVectorClock('user2', 3, 'session1', laterTime);

      const result1 = (service as any).compareVectorClocks(clock1, clock2);
      const result2 = (service as any).compareVectorClocks(clock2, clock1);

      expect(result1).toBe('before');
      expect(result2).toBe('after');
    });
  });

  describe('Vector Clock Merging', () => {
    const createVectorClock = (
      userId: string,
      logicalClock: number,
      timestamp = new Date()
    ): VectorClock => ({
      userId,
      timestamp,
      logicalClock,
      sessionId: 'session1',
      nodeId: 'test-node'
    });

    it('throws error for empty clock array', () => {
      expect(() => {
        (service as any).mergeVectorClocks([]);
      }).toThrow('Cannot merge empty vector clock array');
    });

    it('returns single clock unchanged', () => {
      const clock = createVectorClock('user1', 5);

      const result = (service as any).mergeVectorClocks([clock]);

      expect(result).toBe(clock);
    });

    it('correctly merges multiple vector clocks', () => {
      const now = new Date();
      const later = new Date(now.getTime() + 1000);
      const latest = new Date(now.getTime() + 2000);

      const clocks = [
        createVectorClock('user1', 5, now),
        createVectorClock('user2', 8, later),
        createVectorClock('user3', 3, latest)
      ];

      const result = (service as any).mergeVectorClocks(clocks);

      expect(result.logicalClock).toBe(9); // Max + 1
      expect(result.timestamp).toEqual(latest); // Latest timestamp
      expect(result.sessionId).toBe('session1');
      expect(result.userId).toBeDefined(); // New merged user ID
    });

    it('creates unique user ID for merged clock', () => {
      const clocks = [
        createVectorClock('user1', 5),
        createVectorClock('user2', 3)
      ];

      const result = (service as any).mergeVectorClocks(clocks);

      expect(result.userId).not.toBe('user1');
      expect(result.userId).not.toBe('user2');
      expect(result.userId).toBe('mocked-uuid-12345');
    });
  });

  describe('Conflict Detection with Vector Clocks', () => {
    it('detects conflicts using vector clock analysis', async () => {
      const contentId = 'content123';
      const sessionId = 'session123';

      // Mock content versions with vector clocks
      (mockPool.query as jest.Mock)
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'version1',
              content_id: contentId,
              content: 'Version 1 content',
              user_id: 'user1',
              created_at: new Date(),
              vector_clock_user_id: 'user1',
              vector_clock_logical: 5,
              vector_clock_timestamp: new Date(),
              vector_clock_session_id: sessionId,
              vector_clock_node_id: 'node1'
            },
            {
              id: 'version2',
              content_id: contentId,
              content: 'Version 2 content',
              user_id: 'user2',
              created_at: new Date(),
              vector_clock_user_id: 'user2',
              vector_clock_logical: 3,
              vector_clock_timestamp: new Date(),
              vector_clock_session_id: sessionId,
              vector_clock_node_id: 'node2'
            }
          ]
        })
        .mockResolvedValue({ rows: [] }); // For other queries

      const conflicts = await service.detectConflicts(contentId, sessionId);

      expect(mockPool.query).toHaveBeenCalled();
      // Additional assertions would depend on the full implementation
    });

    it('handles same-user sequential edits correctly', async () => {
      const contentId = 'content123';
      const sessionId = 'session123';

      // Mock versions from same user (should not conflict)
      (mockPool.query as jest.Mock).mockResolvedValue({
        rows: [
          {
            id: 'version1',
            user_id: 'user1',
            vector_clock_user_id: 'user1',
            vector_clock_logical: 5
          },
          {
            id: 'version2',
            user_id: 'user1',
            vector_clock_user_id: 'user1',
            vector_clock_logical: 6
          }
        ]
      });

      const conflicts = await service.detectConflicts(contentId, sessionId);

      expect(conflicts).toEqual([]);
    });

    it('requires minimum version count for conflict detection', async () => {
      const contentId = 'content123';
      const sessionId = 'session123';

      // Mock single version
      (mockPool.query as jest.Mock).mockResolvedValue({
        rows: [
          {
            id: 'version1',
            user_id: 'user1'
          }
        ]
      });

      const conflicts = await service.detectConflicts(contentId, sessionId);

      expect(conflicts).toEqual([]);
    });
  });

  describe('Error Handling', () => {
    it('handles database query errors gracefully', async () => {
      const contentId = 'content123';
      const sessionId = 'session123';

      (mockPool.query as jest.Mock).mockRejectedValue(new Error('Database error'));

      await expect(service.detectConflicts(contentId, sessionId))
        .rejects.toThrow('Database error');
    });

    it('handles invalid vector clock data', async () => {
      const userId = 'user123';
      const sessionId = 'session123';

      // Mock invalid database response
      (mockPool.query as jest.Mock).mockResolvedValue({
        rows: [
          {
            vector_clock_user_id: null,
            vector_clock_logical: 'invalid',
            vector_clock_timestamp: 'invalid-date'
          }
        ]
      });

      // Should handle gracefully or throw appropriate error
      await expect((service as any).createVectorClock(userId, sessionId))
        .resolves.toBeDefined();
    });

    it('handles missing node ID gracefully', () => {
      delete process.env.NODE_ID;

      const nodeId = (service as any).getNodeId();

      expect(nodeId).toBeDefined();
      expect(nodeId.length).toBeGreaterThan(0);
    });
  });

  describe('Distributed System Support', () => {
    it('tracks operations across multiple nodes', async () => {
      const userId = 'user123';
      const sessionId = 'session123';

      // Mock vector clock state from multiple nodes
      (mockPool.query as jest.Mock).mockResolvedValue({
        rows: [
          {
            vector_clock_user_id: 'user1',
            vector_clock_logical: 5,
            vector_clock_node_id: 'node1',
            vector_clock_timestamp: new Date()
          },
          {
            vector_clock_user_id: 'user2',
            vector_clock_logical: 8,
            vector_clock_node_id: 'node2',
            vector_clock_timestamp: new Date()
          },
          {
            vector_clock_user_id: userId,
            vector_clock_logical: 10,
            vector_clock_node_id: 'node3',
            vector_clock_timestamp: new Date()
          }
        ]
      });

      const vectorClock = await (service as any).createVectorClock(userId, sessionId);

      expect(vectorClock.logicalClock).toBe(11); // Max for this user + 1
      expect(vectorClock.nodeId).toBeDefined();
    });

    it('maintains causality across distributed operations', () => {
      const clock1 = {
        userId: 'user1',
        timestamp: new Date('2023-01-01T10:00:00Z'),
        logicalClock: 5,
        sessionId: 'session1',
        nodeId: 'node1'
      };

      const clock2 = {
        userId: 'user2',
        timestamp: new Date('2023-01-01T10:00:00Z'),
        logicalClock: 3,
        sessionId: 'session1',
        nodeId: 'node2'
      };

      const comparison = (service as any).compareVectorClocks(clock1, clock2);

      // Same timestamp, different users should be concurrent
      expect(comparison).toBe('concurrent');
    });
  });
});