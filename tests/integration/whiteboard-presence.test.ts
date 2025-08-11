/**
 * Whiteboard Presence Integration Tests
 * 
 * Tests the complete presence system integration:
 * - Backend presence service
 * - WebSocket event handling
 * - Real-time presence updates
 * - Activity awareness
 * - User avatar system
 */

import { describe, it, expect, beforeEach, afterEach, vi, beforeAll, afterAll } from 'vitest';
import { WebSocket } from 'ws';
import { Server } from 'http';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';

import { 
  WhiteboardPresenceService,
  getPresenceService,
  shutdownPresenceService 
} from '@mcp-tools/core/services/whiteboard/whiteboard-presence-service';

interface TestUser {
  userId: string;
  userName: string;
  userEmail: string;
  socket?: ClientSocket;
}

interface TestSetup {
  server: Server;
  io: SocketIOServer;
  port: number;
  presenceService: WhiteboardPresenceService;
}

describe('Whiteboard Presence Integration', () => {
  let testSetup: TestSetup;
  let testUsers: TestUser[];
  const TEST_WHITEBOARD_ID = 'test-whiteboard-123';
  
  beforeAll(async () => {
    // Create test server
    const app = express();
    const server = createServer(app);
    const io = new SocketIOServer(server, {
      cors: { origin: "*" },
      transports: ['websocket', 'polling'],
    });
    
    // Initialize presence service
    const presenceService = getPresenceService({
      idleTimeoutMs: 1000, // Short timeouts for testing
      awayTimeoutMs: 2000,
      offlineTimeoutMs: 3000,
      presenceUpdateThrottleMs: 100,
    });

    // Start server on random port
    const port = 3001 + Math.floor(Math.random() * 1000);
    
    await new Promise<void>((resolve) => {
      server.listen(port, () => {
        console.log(`Test server running on port ${port}`);
        resolve();
      });
    });

    testSetup = { server, io, port, presenceService };
    
    // Setup basic socket handlers for testing
    io.on('connection', (socket) => {
      socket.on('whiteboard:join', async (data) => {
        const { whiteboardId, userName, userEmail } = data;
        
        try {
          const presenceState = await presenceService.joinWhiteboard(
            socket.id, // Using socket.id as userId for testing
            whiteboardId,
            `session_${socket.id}`,
            {
              userName,
              userEmail,
              connectionId: socket.id,
            }
          );
          
          socket.join(`whiteboard:${whiteboardId}`);
          socket.emit('whiteboard:session_started', { presenceState });
          socket.to(`whiteboard:${whiteboardId}`).emit('whiteboard:user_joined', {
            user: { id: socket.id, name: userName },
            presenceState,
          });
        } catch (error) {
          socket.emit('error', { message: 'Failed to join whiteboard' });
        }
      });

      socket.on('whiteboard:presence_status', async (data) => {
        const { status, customStatus } = data;
        
        try {
          const presenceState = await presenceService.updatePresenceStatus(
            socket.id,
            TEST_WHITEBOARD_ID,
            status,
            customStatus
          );
          
          if (presenceState) {
            socket.to(`whiteboard:${TEST_WHITEBOARD_ID}`).emit('whiteboard:presence_status_updated', {
              userId: socket.id,
              status,
              customStatus,
              presenceState,
            });
          }
        } catch (error) {
          socket.emit('error', { message: 'Failed to update status' });
        }
      });

      socket.on('whiteboard:activity', async (data) => {
        const { type, elementId, description } = data;
        
        try {
          const presenceState = await presenceService.updateActivity(
            socket.id,
            TEST_WHITEBOARD_ID,
            {
              type,
              elementId,
              description,
              timestamp: Date.now(),
            }
          );
          
          if (presenceState) {
            socket.to(`whiteboard:${TEST_WHITEBOARD_ID}`).emit('whiteboard:activity_updated', {
              userId: socket.id,
              activity: { type, elementId, description, timestamp: Date.now() },
              presenceState,
            });
          }
        } catch (error) {
          socket.emit('error', { message: 'Failed to update activity' });
        }
      });

      socket.on('disconnect', async () => {
        try {
          await presenceService.leaveWhiteboard(
            socket.id,
            TEST_WHITEBOARD_ID,
            `session_${socket.id}`,
            socket.id
          );
          
          socket.to(`whiteboard:${TEST_WHITEBOARD_ID}`).emit('whiteboard:user_left', {
            user: { id: socket.id },
          });
        } catch (error) {
          console.error('Failed to handle disconnect:', error);
        }
      });
    });
  });

  afterAll(async () => {
    // Cleanup
    if (testSetup) {
      testSetup.io.close();
      testSetup.server.close();
      await shutdownPresenceService();
    }
  });

  beforeEach(() => {
    testUsers = [
      { userId: 'user1', userName: 'Alice', userEmail: 'alice@example.com' },
      { userId: 'user2', userName: 'Bob', userEmail: 'bob@example.com' },
      { userId: 'user3', userName: 'Charlie', userEmail: 'charlie@example.com' },
    ];
  });

  afterEach(async () => {
    // Disconnect all test clients
    for (const user of testUsers) {
      if (user.socket?.connected) {
        user.socket.disconnect();
      }
    }
    testUsers = [];
    
    // Clear presence service state
    await testSetup.presenceService.forceCleanup();
  });

  describe('User Join/Leave Flow', () => {
    it('should handle user joining whiteboard', async () => {
      const user = testUsers[0];
      
      // Connect user
      user.socket = ioClient(`http://localhost:${testSetup.port}`, {
        transports: ['websocket'],
      });

      await new Promise<void>((resolve) => {
        user.socket!.on('connect', () => {
          user.socket!.emit('whiteboard:join', {
            whiteboardId: TEST_WHITEBOARD_ID,
            userName: user.userName,
            userEmail: user.userEmail,
          });
          resolve();
        });
      });

      // Wait for session started
      await new Promise<void>((resolve) => {
        user.socket!.on('whiteboard:session_started', (data) => {
          expect(data.presenceState).toBeDefined();
          expect(data.presenceState.userName).toBe(user.userName);
          expect(data.presenceState.userEmail).toBe(user.userEmail);
          expect(data.presenceState.status).toBe('online');
          expect(data.presenceState.isActive).toBe(true);
          resolve();
        });
      });

      // Verify presence in service
      const allPresences = testSetup.presenceService.getWhiteboardPresence(TEST_WHITEBOARD_ID);
      expect(allPresences).toHaveLength(1);
      expect(allPresences[0].userName).toBe(user.userName);
    });

    it('should handle multiple users joining', async () => {
      const joinPromises = testUsers.slice(0, 2).map(async (user, index) => {
        user.socket = ioClient(`http://localhost:${testSetup.port}`, {
          transports: ['websocket'],
        });

        return new Promise<void>((resolve) => {
          user.socket!.on('connect', () => {
            user.socket!.emit('whiteboard:join', {
              whiteboardId: TEST_WHITEBOARD_ID,
              userName: user.userName,
              userEmail: user.userEmail,
            });
            resolve();
          });
        });
      });

      await Promise.all(joinPromises);

      // Wait a bit for all joins to process
      await new Promise(resolve => setTimeout(resolve, 200));

      // Verify multiple presences
      const allPresences = testSetup.presenceService.getWhiteboardPresence(TEST_WHITEBOARD_ID);
      expect(allPresences.length).toBeGreaterThanOrEqual(2);
    });

    it('should handle user leaving whiteboard', async () => {
      const user = testUsers[0];
      
      // Join first
      user.socket = ioClient(`http://localhost:${testSetup.port}`, {
        transports: ['websocket'],
      });

      await new Promise<void>((resolve) => {
        user.socket!.on('connect', () => {
          user.socket!.emit('whiteboard:join', {
            whiteboardId: TEST_WHITEBOARD_ID,
            userName: user.userName,
            userEmail: user.userEmail,
          });
          resolve();
        });
      });

      await new Promise<void>((resolve) => {
        user.socket!.on('whiteboard:session_started', () => {
          resolve();
        });
      });

      // Disconnect
      user.socket.disconnect();

      // Wait for cleanup
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify user is marked as offline
      const allPresences = testSetup.presenceService.getWhiteboardPresence(TEST_WHITEBOARD_ID);
      const userPresence = allPresences.find(p => p.userName === user.userName);
      expect(userPresence?.status).toBe('offline');
    });
  });

  describe('Presence Status Updates', () => {
    let testUser: TestUser;
    
    beforeEach(async () => {
      testUser = testUsers[0];
      testUser.socket = ioClient(`http://localhost:${testSetup.port}`, {
        transports: ['websocket'],
      });

      await new Promise<void>((resolve) => {
        testUser.socket!.on('connect', () => {
          testUser.socket!.emit('whiteboard:join', {
            whiteboardId: TEST_WHITEBOARD_ID,
            userName: testUser.userName,
            userEmail: testUser.userEmail,
          });
          resolve();
        });
      });

      await new Promise<void>((resolve) => {
        testUser.socket!.on('whiteboard:session_started', () => resolve());
      });
    });

    it('should update user status', async () => {
      // Update to busy status
      testUser.socket!.emit('whiteboard:presence_status', {
        status: 'busy',
        customStatus: 'In a meeting',
      });

      // Wait for update
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify status update
      const userPresence = testSetup.presenceService.getUserPresence(testUser.socket!.id, TEST_WHITEBOARD_ID);
      expect(userPresence?.status).toBe('busy');
      expect(userPresence?.customStatus).toBe('In a meeting');
    });

    it('should auto-update to idle status', async () => {
      // Wait for idle timeout (1 second in test config)
      await new Promise(resolve => setTimeout(resolve, 1200));

      const userPresence = testSetup.presenceService.getUserPresence(testUser.socket!.id, TEST_WHITEBOARD_ID);
      expect(userPresence?.status).toBe('idle');
    });
  });

  describe('Activity Awareness', () => {
    let testUser: TestUser;
    
    beforeEach(async () => {
      testUser = testUsers[0];
      testUser.socket = ioClient(`http://localhost:${testSetup.port}`, {
        transports: ['websocket'],
      });

      await new Promise<void>((resolve) => {
        testUser.socket!.on('connect', () => {
          testUser.socket!.emit('whiteboard:join', {
            whiteboardId: TEST_WHITEBOARD_ID,
            userName: testUser.userName,
            userEmail: testUser.userEmail,
          });
          resolve();
        });
      });

      await new Promise<void>((resolve) => {
        testUser.socket!.on('whiteboard:session_started', () => resolve());
      });
    });

    it('should track drawing activity', async () => {
      testUser.socket!.emit('whiteboard:activity', {
        type: 'drawing',
        elementId: 'rect-123',
        description: 'Drawing rectangle',
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      const userPresence = testSetup.presenceService.getUserPresence(testUser.socket!.id, TEST_WHITEBOARD_ID);
      expect(userPresence?.lastActivity.type).toBe('drawing');
      expect(userPresence?.lastActivity.elementId).toBe('rect-123');
      expect(userPresence?.lastActivity.description).toBe('Drawing rectangle');
    });

    it('should track typing activity', async () => {
      testUser.socket!.emit('whiteboard:activity', {
        type: 'typing',
        elementId: 'text-456',
        description: 'Editing text',
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      const userPresence = testSetup.presenceService.getUserPresence(testUser.socket!.id, TEST_WHITEBOARD_ID);
      expect(userPresence?.lastActivity.type).toBe('typing');
      expect(userPresence?.lastActivity.elementId).toBe('text-456');
    });

    it('should track commenting activity', async () => {
      testUser.socket!.emit('whiteboard:activity', {
        type: 'commenting',
        elementId: 'comment-789',
        description: 'Adding comment',
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      const userPresence = testSetup.presenceService.getUserPresence(testUser.socket!.id, TEST_WHITEBOARD_ID);
      expect(userPresence?.lastActivity.type).toBe('commenting');
      expect(userPresence?.lastActivity.elementId).toBe('comment-789');
    });
  });

  describe('Avatar System', () => {
    it('should generate consistent colors for users', async () => {
      const user1 = testUsers[0];
      const user2 = testUsers[1];

      // Connect users
      for (const user of [user1, user2]) {
        user.socket = ioClient(`http://localhost:${testSetup.port}`, {
          transports: ['websocket'],
        });

        await new Promise<void>((resolve) => {
          user.socket!.on('connect', () => {
            user.socket!.emit('whiteboard:join', {
              whiteboardId: TEST_WHITEBOARD_ID,
              userName: user.userName,
              userEmail: user.userEmail,
            });
            resolve();
          });
        });

        await new Promise<void>((resolve) => {
          user.socket!.on('whiteboard:session_started', () => resolve());
        });
      }

      const allPresences = testSetup.presenceService.getWhiteboardPresence(TEST_WHITEBOARD_ID);
      expect(allPresences).toHaveLength(2);

      // Colors should be assigned and different
      const colors = allPresences.map(p => p.color);
      expect(colors[0]).toBeTruthy();
      expect(colors[1]).toBeTruthy();
      expect(colors[0]).not.toBe(colors[1]);

      // Initials should be generated correctly
      const alice = allPresences.find(p => p.userName === 'Alice');
      const bob = allPresences.find(p => p.userName === 'Bob');
      
      expect(alice?.initials).toBe('AL');
      expect(bob?.initials).toBe('BO');
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle multiple users efficiently', async () => {
      const startTime = Date.now();
      
      // Connect multiple users simultaneously
      const connectPromises = testUsers.map(async (user) => {
        user.socket = ioClient(`http://localhost:${testSetup.port}`, {
          transports: ['websocket'],
        });

        return new Promise<void>((resolve) => {
          user.socket!.on('connect', () => {
            user.socket!.emit('whiteboard:join', {
              whiteboardId: TEST_WHITEBOARD_ID,
              userName: user.userName,
              userEmail: user.userEmail,
            });
            resolve();
          });
        });
      });

      await Promise.all(connectPromises);

      // Wait for all sessions to start
      await Promise.all(testUsers.map(user => 
        new Promise<void>((resolve) => {
          user.socket!.on('whiteboard:session_started', () => resolve());
        })
      ));

      const endTime = Date.now();
      const connectionTime = endTime - startTime;

      // Should connect all users in reasonable time
      expect(connectionTime).toBeLessThan(2000);

      // Verify all users are present
      const allPresences = testSetup.presenceService.getWhiteboardPresence(TEST_WHITEBOARD_ID);
      expect(allPresences.length).toBeGreaterThanOrEqual(testUsers.length);
    });

    it('should clean up stale presence data', async () => {
      // Create a user and let them go stale
      const user = testUsers[0];
      user.socket = ioClient(`http://localhost:${testSetup.port}`, {
        transports: ['websocket'],
      });

      await new Promise<void>((resolve) => {
        user.socket!.on('connect', () => {
          user.socket!.emit('whiteboard:join', {
            whiteboardId: TEST_WHITEBOARD_ID,
            userName: user.userName,
            userEmail: user.userEmail,
          });
          resolve();
        });
      });

      await new Promise<void>((resolve) => {
        user.socket!.on('whiteboard:session_started', () => resolve());
      });

      // Force disconnect without cleanup
      user.socket.disconnect();

      // Wait longer than offline timeout
      await new Promise(resolve => setTimeout(resolve, 3500));

      // Force cleanup
      const cleanup = await testSetup.presenceService.forceCleanup();
      expect(cleanup.cleaned).toBeGreaterThan(0);
    });
  });
});