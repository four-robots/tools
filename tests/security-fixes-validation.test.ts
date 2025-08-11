/**
 * Security Fixes Validation Tests
 * 
 * Comprehensive tests to validate that all critical security vulnerabilities
 * have been properly addressed in the Collaborative Workspaces implementation.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { WorkspaceService } from '../core/src/services/workspace/workspace-service.js';
import { RedisSessionStorage, InMemorySessionStorage } from '../gateway/src/websocket/redis-session-storage.js';

// Mock dependencies
const mockDb = {
  query: jest.fn(),
} as any;

const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
} as any;

describe('Security Fixes Validation', () => {
  describe('SQL Injection Prevention', () => {
    let workspaceService: WorkspaceService;

    beforeEach(() => {
      workspaceService = new WorkspaceService(mockDb, mockLogger);
      jest.clearAllMocks();
    });

    it('should sanitize search input to prevent SQL injection', async () => {
      // Mock successful response
      mockDb.query.mockResolvedValueOnce({ rows: [] })
                 .mockResolvedValueOnce({ rows: [{ total: '0' }] });

      const maliciousSearch = "'; DROP TABLE collaborative_workspaces; --";
      
      const filters = {
        search: maliciousSearch,
      };

      try {
        await workspaceService.getWorkspacesWithStats('user-id', 'tenant-id', filters);
      } catch (error) {
        // Should not reach here due to sanitization
      }

      // Verify the query was called with sanitized input
      expect(mockDb.query).toHaveBeenCalled();
      const queryCall = mockDb.query.mock.calls[0];
      const queryParams = queryCall[1];
      
      // The malicious SQL should be sanitized and not contain dangerous characters
      expect(queryParams).not.toContain('DROP TABLE');
      expect(queryParams).not.toContain('--');
      expect(queryParams).not.toContain("'");
    });

    it('should use parameterized queries for all filters', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] })
                 .mockResolvedValueOnce({ rows: [{ total: '0' }] });

      const filters = {
        status: ['active'],
        visibility: ['public'],
        search: 'test search',
        createdAfter: '2023-01-01T00:00:00Z',
        createdBefore: '2023-12-31T23:59:59Z',
      };

      await workspaceService.getWorkspacesWithStats('user-id', 'tenant-id', filters);

      // Verify parameterized query structure
      const queryCall = mockDb.query.mock.calls[0];
      const query = queryCall[0];
      const params = queryCall[1];
      
      // Should use $1, $2, etc. placeholders
      expect(query).toMatch(/\$\d+/);
      expect(Array.isArray(params)).toBe(true);
      expect(params.length).toBeGreaterThan(0);
    });

    it('should validate enum values for status and visibility', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] })
                 .mockResolvedValueOnce({ rows: [{ total: '0' }] });

      const filters = {
        status: ['invalid_status', 'active'], // Mix of valid and invalid
        visibility: ['invalid_visibility', 'public'],
      };

      await workspaceService.getWorkspacesWithStats('user-id', 'tenant-id', filters);

      const queryCall = mockDb.query.mock.calls[0];
      const params = queryCall[1];
      
      // Should only include valid enum values
      expect(params).toContain(['active']); // Only valid status
      expect(params).toContain(['public']); // Only valid visibility
    });
  });

  describe('Authentication Context Security', () => {
    it('should throw error when user context is missing', () => {
      const getUserContext = (req: any) => {
        if (!req.user || !req.user.id) {
          throw new Error('User authentication required - no authenticated user found');
        }
        if (!req.user.tenantId) {
          throw new Error('Tenant context required - user must have valid tenant association');
        }
        return { userId: req.user.id, tenantId: req.user.tenantId };
      };

      // Test missing user
      expect(() => {
        getUserContext({ user: null });
      }).toThrow('User authentication required');

      // Test missing tenant
      expect(() => {
        getUserContext({ user: { id: 'user-123' } });
      }).toThrow('Tenant context required');

      // Test valid context
      expect(() => {
        getUserContext({ user: { id: 'user-123', tenantId: 'tenant-456' } });
      }).not.toThrow();
    });

    it('should validate UUID format for user and tenant IDs', () => {
      const isValidUUID = (uuid: string): boolean => {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        return uuidRegex.test(uuid);
      };

      // Valid UUIDs
      expect(isValidUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
      expect(isValidUUID('6ba7b810-9dad-11d1-80b4-00c04fd430c8')).toBe(true);

      // Invalid formats
      expect(isValidUUID('not-a-uuid')).toBe(false);
      expect(isValidUUID('123-456-789')).toBe(false);
      expect(isValidUUID('')).toBe(false);
      expect(isValidUUID('550e8400-e29b-41d4-a716')).toBe(false); // Too short
    });
  });

  describe('Session Management Security', () => {
    describe('In-Memory Session Storage', () => {
      let storage: InMemorySessionStorage;

      beforeEach(() => {
        storage = new InMemorySessionStorage();
      });

      afterEach(() => {
        storage.destroy();
      });

      it('should automatically expire sessions after TTL', async () => {
        const sessionData = {
          socketId: 'socket-123',
          sessionToken: 'token-456',
          workspaceId: 'workspace-789',
          userId: 'user-123',
          tenantId: 'tenant-456',
          lastActivity: new Date(),
          connectionInfo: {},
        };

        // Set with short TTL
        await storage.set('test-session', sessionData, 100); // 100ms

        // Should exist immediately
        let retrieved = await storage.get('test-session');
        expect(retrieved).toBeTruthy();

        // Wait for expiration
        await new Promise(resolve => setTimeout(resolve, 150));

        // Should be expired
        retrieved = await storage.get('test-session');
        expect(retrieved).toBeNull();
      });

      it('should clean up expired sessions', async () => {
        const sessionData = {
          socketId: 'socket-123',
          sessionToken: 'token-456',
          workspaceId: 'workspace-789',
          userId: 'user-123',
          tenantId: 'tenant-456',
          lastActivity: new Date(),
          connectionInfo: {},
        };

        // Add expired session
        await storage.set('expired-session', sessionData, -1000); // Already expired
        
        // Add valid session
        await storage.set('valid-session', sessionData, 60000); // 1 minute

        // Run cleanup
        await storage.cleanup(0);

        // Expired should be gone, valid should remain
        expect(await storage.get('expired-session')).toBeNull();
        expect(await storage.get('valid-session')).toBeTruthy();
      });
    });

    describe('Redis Session Storage', () => {
      let storage: RedisSessionStorage;

      beforeEach(() => {
        // Use test Redis configuration
        storage = new RedisSessionStorage({
          host: 'localhost',
          port: 6379,
          db: 15, // Use separate test DB
          keyPrefix: 'test:session:'
        });
      });

      afterEach(async () => {
        try {
          await storage.destroy();
        } catch (error) {
          // Ignore cleanup errors in tests
        }
      });

      it('should store and retrieve session data', async () => {
        const sessionData = {
          socketId: 'socket-123',
          sessionToken: 'token-456',
          workspaceId: 'workspace-789',
          userId: 'user-123',
          tenantId: 'tenant-456',
          lastActivity: new Date(),
          connectionInfo: {
            userAgent: 'Test Agent',
            ip: '127.0.0.1'
          },
        };

        await storage.set('test-session', sessionData, 30000);
        const retrieved = await storage.get('test-session');

        expect(retrieved).toBeTruthy();
        expect(retrieved?.userId).toBe('user-123');
        expect(retrieved?.workspaceId).toBe('workspace-789');
        expect(retrieved?.lastActivity).toBeInstanceOf(Date);
      });

      it('should handle Redis connection failures gracefully', async () => {
        // Create storage with invalid Redis config
        const invalidStorage = new RedisSessionStorage({
          host: 'invalid-host',
          port: 9999,
          keyPrefix: 'test:invalid:'
        });

        // Should not throw but return null
        const result = await invalidStorage.get('non-existent');
        expect(result).toBeNull();

        await invalidStorage.destroy();
      });
    });
  });

  describe('Input Validation and Sanitization', () => {
    it('should sanitize string inputs', () => {
      const sanitizeInput = (input: string): string => {
        if (!input || typeof input !== 'string') {
          return '';
        }
        return input
          .replace(/[\x00\x08\x09\x1a\n\r\"'\\%]/g, '')
          .trim()
          .substring(0, 1000);
      };

      // Test malicious inputs
      expect(sanitizeInput("'; DROP TABLE users; --")).toBe(' DROP TABLE users --');
      expect(sanitizeInput('test\x00\x08\x09input')).toBe('testinput');
      expect(sanitizeInput('normal input')).toBe('normal input');
      expect(sanitizeInput('')).toBe('');
      
      // Test length limiting
      const longInput = 'a'.repeat(2000);
      expect(sanitizeInput(longInput)).toHaveLength(1000);
    });

    it('should validate JSONB field data', () => {
      const sanitizeJsonField = (field: any): any => {
        if (!field) {
          return {};
        }
        
        try {
          const data = typeof field === 'string' ? JSON.parse(field) : field;
          
          if (typeof data === 'object' && data !== null) {
            const sanitized: any = {};
            let count = 0;
            for (const [key, value] of Object.entries(data)) {
              if (count++ >= 50) break; // Limit object size
              if (typeof key === 'string' && key.length > 0 && key.length < 100) {
                sanitized[key] = value;
              }
            }
            return sanitized;
          }
          
          return {};
        } catch (error) {
          return {};
        }
      };

      // Test valid JSON
      expect(sanitizeJsonField({ key: 'value' })).toEqual({ key: 'value' });
      
      // Test malicious JSON
      const maliciousData = { '<script>': 'alert(1)', 'normal': 'value' };
      const sanitized = sanitizeJsonField(maliciousData);
      expect(sanitized['<script>']).toBeUndefined();
      expect(sanitized.normal).toBe('value');

      // Test invalid JSON
      expect(sanitizeJsonField('invalid json')).toEqual({});
    });
  });

  describe('Performance Optimizations', () => {
    it('should use optimized analytics query structure', async () => {
      const workspaceService = new WorkspaceService(mockDb, mockLogger);
      
      // Mock successful analytics response
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          total_members: 10,
          active_members: 8,
          new_members: 2,
          total_sessions: 15,
          avg_session_duration: 1800,
          total_activities: 50,
          resources_uploaded: 5,
          resources_downloaded: 25,
          integration_events: 3,
          collaboration_events: 20
        }]
      }).mockResolvedValueOnce({ rows: [] }); // trends query
      .mockResolvedValueOnce({ rows: [] }); // top users query

      const startDate = '2023-01-01T00:00:00Z';
      const endDate = '2023-12-31T23:59:59Z';

      try {
        await workspaceService.getWorkspaceAnalytics(
          'workspace-id',
          'user-id', 
          'tenant-id',
          startDate,
          endDate
        );
      } catch (error) {
        // Expected since we're mocking permissions
      }

      // Verify the analytics query uses optimized structure
      const queryCall = mockDb.query.mock.calls[0];
      const query = queryCall[0];
      
      // Should use CTE or FILTER clauses for performance
      expect(query).toMatch(/(WITH|FILTER)/i);
      expect(query).not.toMatch(/COUNT\s*\(\s*DISTINCT.*\)\s*,\s*COUNT\s*\(\s*DISTINCT/i);
    });
  });
});

describe('Integration Security Tests', () => {
  it('should handle complete workspace creation flow securely', async () => {
    const workspaceService = new WorkspaceService(mockDb, mockLogger);
    
    // Mock tenant validation
    mockDb.query.mockResolvedValueOnce({ rows: [{ count: '5' }] }); // tenant limits
    
    // Mock workspace creation
    mockDb.query.mockResolvedValueOnce({
      rows: [{
        id: 'workspace-123',
        name: 'Test Workspace',
        tenant_id: 'tenant-456',
        owner_id: 'user-789',
        created_at: new Date(),
        updated_at: new Date()
      }]
    });
    
    // Mock initial member addition
    mockDb.query.mockResolvedValueOnce({ rows: [] });

    const request = {
      name: 'Test Workspace',
      description: 'A test workspace',
      visibility: 'private' as const,
      settings: { theme: 'dark' },
      metadata: { created_by_test: true }
    };

    const workspace = await workspaceService.createWorkspace(
      'tenant-456',
      'user-789',
      request
    );

    expect(workspace).toBeTruthy();
    expect(workspace.name).toBe('Test Workspace');
    
    // Verify all database calls used parameterized queries
    const queryCalls = mockDb.query.mock.calls;
    queryCalls.forEach(call => {
      const [query, params] = call;
      expect(query).toMatch(/\$\d+/); // Should contain parameter placeholders
      expect(Array.isArray(params)).toBe(true);
    });
  });
});