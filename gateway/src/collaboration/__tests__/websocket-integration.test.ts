/**
 * WebSocket Collaboration Integration Tests
 * 
 * Basic integration tests for WebSocket collaboration flow
 * including authentication, session joining, and message handling.
 */

import WebSocket from 'ws';
import { Server } from 'http';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';
import Redis from 'ioredis';
import { WebSocketCollaborationGateway } from '../websocket-gateway.js';
import { 
  CollaborationSessionService,
  EventBroadcastingService,
  PresenceService
} from '@mcp-tools/core';

describe('WebSocket Collaboration Integration', () => {
  let server: Server;
  let gateway: WebSocketCollaborationGateway;
  let mockDb: Pool;
  let mockRedis: Redis;
  let mockSessionService: CollaborationSessionService;
  let mockEventService: EventBroadcastingService;
  let mockPresenceService: PresenceService;
  let jwtSecret: string;

  beforeAll(async () => {
    // Create mock dependencies
    mockDb = {
      query: jest.fn(),
      connect: jest.fn(),
      end: jest.fn(),
    } as any;

    mockRedis = {
      get: jest.fn(),
      set: jest.fn(),
      setex: jest.fn(),
      del: jest.fn(),
      sadd: jest.fn(),
      srem: jest.fn(),
      smembers: jest.fn(),
      incr: jest.fn(),
      decr: jest.fn(),
      expire: jest.fn(),
      subscribe: jest.fn(),
      unsubscribe: jest.fn(),
      publish: jest.fn(),
    } as any;

    mockSessionService = {
      getSession: jest.fn(),
      getSessionParticipants: jest.fn(),
      addParticipant: jest.fn(),
    } as any;

    mockEventService = {
      broadcastEvent: jest.fn(),
      getEventHistory: jest.fn(),
      markEventDelivered: jest.fn(),
      shutdown: jest.fn(),
    } as any;

    mockPresenceService = {
      addConnection: jest.fn(),
      removeConnection: jest.fn(),
      updateHeartbeat: jest.fn(),
      updatePresence: jest.fn(),
      getSessionPresence: jest.fn(),
      cleanupStalePresence: jest.fn(),
    } as any;

    jwtSecret = 'test-jwt-secret';
    
    // Create HTTP server
    server = new Server();
    
    // Create WebSocket gateway
    gateway = new WebSocketCollaborationGateway(
      server,
      mockDb,
      mockRedis,
      mockSessionService,
      mockEventService,
      mockPresenceService,
      jwtSecret,
      {
        heartbeatInterval: 5000,
        connectionTimeout: 10000,
        maxConnections: 100,
        maxRoomsPerConnection: 10,
        enableRateLimiting: false, // Disable for tests
        rateLimitConfig: {
          maxMessagesPerSecond: 10,
          burstAllowance: 20,
          penaltyDuration: 1000
        }
      }
    );

    // Start server
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
  });

  afterAll(async () => {
    await gateway.shutdown();
    server.close();
  });

  describe('Connection Authentication', () => {
    it('should reject connection without token', (done) => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        throw new Error('Server address not available');
      }

      const ws = new WebSocket(`ws://127.0.0.1:${address.port}/collaboration`);
      
      ws.on('close', (code, reason) => {
        expect(code).toBe(1008);
        expect(reason.toString()).toContain('Authentication required');
        done();
      });

      ws.on('open', () => {
        done(new Error('Connection should have been rejected'));
      });
    });

    it('should reject connection with invalid token', (done) => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        throw new Error('Server address not available');
      }

      const ws = new WebSocket(`ws://127.0.0.1:${address.port}/collaboration?token=invalid-token`);
      
      ws.on('close', (code, reason) => {
        expect(code).toBe(1008);
        expect(reason.toString()).toContain('JWT verification failed');
        done();
      });

      ws.on('open', () => {
        done(new Error('Connection should have been rejected'));
      });
    });

    it('should accept connection with valid token', (done) => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        throw new Error('Server address not available');
      }

      const token = jwt.sign({ sub: 'test-user-123' }, jwtSecret);
      const ws = new WebSocket(`ws://127.0.0.1:${address.port}/collaboration?token=${token}`);
      
      ws.on('open', () => {
        ws.close();
        done();
      });

      ws.on('close', (code) => {
        if (code !== 1000) {
          done(new Error(`Connection closed with unexpected code: ${code}`));
        }
      });

      ws.on('error', (error) => {
        done(error);
      });

      // Set timeout to prevent test hanging
      setTimeout(() => {
        ws.close();
        done(new Error('Connection timeout'));
      }, 5000);
    });
  });

  describe('Session Joining', () => {
    let ws: WebSocket;
    let token: string;

    beforeEach(() => {
      token = jwt.sign({ sub: 'test-user-123' }, jwtSecret);
      
      // Mock session service responses
      (mockSessionService.getSession as jest.Mock).mockResolvedValue({
        id: 'test-session-123',
        is_active: true,
        allow_anonymous: true
      });
      
      (mockSessionService.getSessionParticipants as jest.Mock).mockResolvedValue([]);
      (mockSessionService.addParticipant as jest.Mock).mockResolvedValue(undefined);
      (mockEventService.getEventHistory as jest.Mock).mockResolvedValue([]);
      (mockPresenceService.getSessionPresence as jest.Mock).mockResolvedValue([]);
      (mockPresenceService.addConnection as jest.Mock).mockResolvedValue(undefined);
    });

    afterEach(() => {
      if (ws) {
        ws.close();
      }
      jest.clearAllMocks();
    });

    it('should successfully join session', (done) => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        throw new Error('Server address not available');
      }

      ws = new WebSocket(`ws://127.0.0.1:${address.port}/collaboration?token=${token}`);
      
      ws.on('open', () => {
        // Send join message
        ws.send(JSON.stringify({
          type: 'join',
          sessionId: 'test-session-123',
          userId: 'test-user-123',
          data: { deviceInfo: { userAgent: 'test' } },
          timestamp: new Date(),
          sequenceNumber: 1,
          messageId: 'test-message-1'
        }));
      });

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        
        if (message.type === 'ack' && message.data.message === 'Joined session successfully') {
          expect(message.data.session).toBeDefined();
          expect(message.data.recentEvents).toBeDefined();
          expect(message.data.presence).toBeDefined();
          done();
        }
      });

      ws.on('error', (error) => {
        done(error);
      });

      // Set timeout
      setTimeout(() => {
        done(new Error('Join session timeout'));
      }, 5000);
    });

    it('should reject joining non-existent session', (done) => {
      // Mock session not found
      (mockSessionService.getSession as jest.Mock).mockResolvedValue(null);

      const address = server.address();
      if (!address || typeof address === 'string') {
        throw new Error('Server address not available');
      }

      ws = new WebSocket(`ws://127.0.0.1:${address.port}/collaboration?token=${token}`);
      
      ws.on('open', () => {
        ws.send(JSON.stringify({
          type: 'join',
          sessionId: 'non-existent-session',
          userId: 'test-user-123',
          data: { deviceInfo: { userAgent: 'test' } },
          timestamp: new Date(),
          sequenceNumber: 1,
          messageId: 'test-message-1'
        }));
      });

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        
        if (message.type === 'error') {
          expect(message.data.code).toBe('SESSION_NOT_FOUND');
          expect(message.data.error).toContain('Session not found');
          done();
        }
      });

      ws.on('error', (error) => {
        done(error);
      });

      // Set timeout
      setTimeout(() => {
        done(new Error('Session not found error timeout'));
      }, 5000);
    });

    it('should reject joining inactive session', (done) => {
      // Mock inactive session
      (mockSessionService.getSession as jest.Mock).mockResolvedValue({
        id: 'test-session-123',
        is_active: false,
        allow_anonymous: true
      });

      const address = server.address();
      if (!address || typeof address === 'string') {
        throw new Error('Server address not available');
      }

      ws = new WebSocket(`ws://127.0.0.1:${address.port}/collaboration?token=${token}`);
      
      ws.on('open', () => {
        ws.send(JSON.stringify({
          type: 'join',
          sessionId: 'test-session-123',
          userId: 'test-user-123',
          data: { deviceInfo: { userAgent: 'test' } },
          timestamp: new Date(),
          sequenceNumber: 1,
          messageId: 'test-message-1'
        }));
      });

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        
        if (message.type === 'error') {
          expect(message.data.code).toBe('SESSION_INACTIVE');
          expect(message.data.error).toContain('Session is not active');
          done();
        }
      });

      ws.on('error', (error) => {
        done(error);
      });

      // Set timeout
      setTimeout(() => {
        done(new Error('Session inactive error timeout'));
      }, 5000);
    });
  });

  describe('Heartbeat Handling', () => {
    let ws: WebSocket;
    let token: string;

    beforeEach(() => {
      token = jwt.sign({ sub: 'test-user-123' }, jwtSecret);
    });

    afterEach(() => {
      if (ws) {
        ws.close();
      }
    });

    it('should respond to heartbeat with pong', (done) => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        throw new Error('Server address not available');
      }

      ws = new WebSocket(`ws://127.0.0.1:${address.port}/collaboration?token=${token}`);
      
      ws.on('open', () => {
        // Send heartbeat message
        ws.send(JSON.stringify({
          type: 'heartbeat',
          sessionId: '',
          userId: 'test-user-123',
          data: {},
          timestamp: new Date(),
          sequenceNumber: 1,
          messageId: 'test-heartbeat-1'
        }));
      });

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        
        if (message.type === 'ack' && message.data.message === 'pong') {
          expect(message.data.timestamp).toBeDefined();
          done();
        }
      });

      ws.on('error', (error) => {
        done(error);
      });

      // Set timeout
      setTimeout(() => {
        done(new Error('Heartbeat response timeout'));
      }, 5000);
    });
  });

  describe('Connection Limits', () => {
    it('should reject connections when at capacity', async () => {
      // Create gateway with very low connection limit
      const limitedGateway = new WebSocketCollaborationGateway(
        server,
        mockDb,
        mockRedis,
        mockSessionService,
        mockEventService,
        mockPresenceService,
        jwtSecret,
        {
          heartbeatInterval: 5000,
          connectionTimeout: 10000,
          maxConnections: 1, // Very low limit
          maxRoomsPerConnection: 10,
          enableRateLimiting: false,
          rateLimitConfig: {
            maxMessagesPerSecond: 10,
            burstAllowance: 20,
            penaltyDuration: 1000
          }
        }
      );

      const address = server.address();
      if (!address || typeof address === 'string') {
        throw new Error('Server address not available');
      }

      const token = jwt.sign({ sub: 'test-user-1' }, jwtSecret);
      
      // First connection should succeed
      const ws1 = new WebSocket(`ws://127.0.0.1:${address.port}/collaboration?token=${token}`);
      
      await new Promise<void>((resolve) => {
        ws1.on('open', resolve);
        ws1.on('error', (error) => {
          throw error;
        });
      });

      // Second connection should be rejected
      const token2 = jwt.sign({ sub: 'test-user-2' }, jwtSecret);
      const ws2 = new WebSocket(`ws://127.0.0.1:${address.port}/collaboration?token=${token2}`);
      
      await new Promise<void>((resolve) => {
        ws2.on('close', (code, reason) => {
          expect(code).toBe(1008);
          expect(reason.toString()).toContain('Server at capacity');
          resolve();
        });
        
        ws2.on('open', () => {
          throw new Error('Second connection should have been rejected');
        });
      });

      ws1.close();
      await limitedGateway.shutdown();
    });
  });
});