/**
 * Connection Manager Error Handling Tests
 *
 * Tests that error handling in ConnectionManager properly handles
 * non-Error thrown values (strings, numbers, null) without crashing.
 */

jest.mock('../../utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import { ConnectionManager } from '../connection-manager.js';

const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
  setex: jest.fn(),
  del: jest.fn(),
  sadd: jest.fn(),
  srem: jest.fn(),
  smembers: jest.fn(),
  expire: jest.fn(),
  publish: jest.fn(),
} as any;

const mockDb = {
  query: jest.fn(),
  connect: jest.fn(),
} as any;

describe('ConnectionManager', () => {
  let manager: ConnectionManager;

  beforeEach(() => {
    jest.clearAllMocks();
    manager = new ConnectionManager(mockDb, mockRedis);
  });

  afterEach(() => {
    // Clean up heartbeat interval
    (manager as any).heartbeatInterval && clearInterval((manager as any).heartbeatInterval);
  });

  describe('Error Handling - Non-Error Thrown Values', () => {
    it('should handle string error in updateConnectionSession', async () => {
      // Simulate a connection in local memory
      const connection = {
        connectionId: 'conn-1',
        userId: 'user-1',
        sessionId: 'old-session',
        connected_at: new Date(),
        last_ping: new Date(),
        last_pong: new Date(),
        last_message_at: undefined,
        status: 'connected',
      };
      (manager as any).connections.set('conn-1', connection);

      // Make Redis throw a string (non-Error value)
      mockRedis.srem.mockRejectedValue('redis connection lost');

      await expect(
        manager.updateConnectionSession('conn-1', 'new-session')
      ).rejects.toThrow('Failed to update connection session: redis connection lost');
    });

    it('should handle null error in updateConnectionSession', async () => {
      const connection = {
        connectionId: 'conn-2',
        userId: 'user-1',
        sessionId: 'old-session',
        connected_at: new Date(),
        last_ping: new Date(),
        last_pong: new Date(),
        last_message_at: undefined,
        status: 'connected',
      };
      (manager as any).connections.set('conn-2', connection);

      mockRedis.srem.mockRejectedValue(null);

      await expect(
        manager.updateConnectionSession('conn-2', 'new-session')
      ).rejects.toThrow('Failed to update connection session');
    });

    it('should include Error message when Error is thrown', async () => {
      const connection = {
        connectionId: 'conn-3',
        userId: 'user-1',
        sessionId: 'old-session',
        connected_at: new Date(),
        last_ping: new Date(),
        last_pong: new Date(),
        last_message_at: undefined,
        status: 'connected',
      };
      (manager as any).connections.set('conn-3', connection);

      mockRedis.srem.mockRejectedValue(new Error('ECONNREFUSED'));

      try {
        await manager.updateConnectionSession('conn-3', 'new-session');
        fail('Should have thrown');
      } catch (e: any) {
        expect(e.message).toContain('ECONNREFUSED');
        expect(e.message).toContain('Failed to update connection session');
      }
    });
  });
});
