import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, jest } from '@jest/globals';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { DatabasePool } from '@mcp-tools/core/utils/database-pool';
import { Logger } from '@mcp-tools/core/utils/logger';
import { setupWhiteboardSocket } from '../../gateway/src/websocket/whiteboard-socket.js';

describe('Whiteboard Version WebSocket Integration', () => {
  let httpServer: any;
  let io: SocketIOServer;
  let clientSocket: ClientSocket;
  let mockDb: jest.Mocked<DatabasePool>;
  let port: number;

  const mockUserId = 'test-user-id';
  const mockWhiteboardId = 'test-whiteboard-id';
  const mockVersionId = 'test-version-id';
  const mockToken = 'valid-jwt-token';

  beforeAll((done) => {
    // Setup mock database
    mockDb = {
      query: jest.fn(),
    } as any;

    // Create HTTP server and Socket.IO server
    httpServer = createServer();
    io = new SocketIOServer(httpServer, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST'],
      },
    });

    // Setup whiteboard socket handlers
    setupWhiteboardSocket(io, mockDb, {
      useRedis: false,
      sessionTtl: 60000,
    });

    // Start server on random port
    httpServer.listen(() => {
      port = httpServer.address()?.port;
      done();
    });
  });

  afterAll((done) => {
    httpServer.close();
    done();
  });

  beforeEach((done) => {
    // Mock authentication responses
    mockDb.query
      .mockResolvedValueOnce({ 
        rows: [{ 
          id: mockUserId, 
          username: 'testuser',
          email: 'test@example.com' 
        }] 
      }) // user lookup
      .mockResolvedValueOnce({ 
        rows: [{ 
          id: mockWhiteboardId,
          workspace_id: 'test-workspace-id',
          name: 'Test Whiteboard',
          created_by: mockUserId,
          visibility: 'workspace',
          status: 'active',
          version: 1,
          canvas_data: '{}',
          settings: '{}',
          created_at: new Date(),
          updated_at: new Date(),
        }] 
      }); // whiteboard lookup

    // Create client connection
    clientSocket = ioClient(`http://localhost:${port}`, {
      auth: {
        token: mockToken,
      },
      transports: ['websocket'],
    });

    clientSocket.on('connect', () => {
      // Join whiteboard session
      clientSocket.emit('whiteboard:join', {
        whiteboardId: mockWhiteboardId,
        workspaceId: 'test-workspace-id',
      });
      done();
    });
  });

  afterEach(() => {
    clientSocket.disconnect();
    jest.clearAllMocks();
  });

  describe('Version Creation Events', () => {
    it('should create version and broadcast to all users', (done) => {
      const versionData = {
        whiteboardId: mockWhiteboardId,
        changeType: 'major',
        commitMessage: 'Test version creation',
        isMilestone: true,
        tags: ['test', 'integration'],
      };

      const mockCreatedVersion = {
        id: mockVersionId,
        whiteboardId: mockWhiteboardId,
        versionNumber: 2,
        versionType: 'snapshot',
        changeType: 'major',
        commitMessage: 'Test version creation',
        isAutomatic: false,
        createdBy: mockUserId,
        branchName: 'main',
        isMilestone: true,
        tags: ['test', 'integration'],
        elementCount: 5,
        totalChanges: 3,
        elementsAdded: 2,
        elementsModified: 1,
        elementsDeleted: 0,
        createdAt: new Date().toISOString(),
      };

      // Mock database responses for version creation
      mockDb.query
        .mockResolvedValueOnce({ 
          rows: [{ 
            id: mockWhiteboardId,
            elements: [],
            canvas_data: '{}',
            version: 1,
          }] 
        }) // getWhiteboardWithElements
        .mockResolvedValueOnce({ rows: [{ next_version: 2 }] }) // getNextVersionNumber
        .mockResolvedValueOnce({ rows: [] }) // getLatestVersion (no previous versions)
        .mockResolvedValueOnce({ rows: [mockCreatedVersion] }); // insert new version

      // Listen for version creation events
      let eventsReceived = 0;
      const expectedEvents = 2; // version_created and version_created_success

      clientSocket.on('whiteboard:version_created', (data) => {
        expect(data.version.id).toBe(mockVersionId);
        expect(data.version.commitMessage).toBe('Test version creation');
        expect(data.version.isMilestone).toBe(true);
        expect(data.createdBy.id).toBe(mockUserId);
        
        eventsReceived++;
        if (eventsReceived === expectedEvents) done();
      });

      clientSocket.on('whiteboard:version_created_success', (data) => {
        expect(data.version.id).toBe(mockVersionId);
        expect(data.timestamp).toBeDefined();
        
        eventsReceived++;
        if (eventsReceived === expectedEvents) done();
      });

      clientSocket.on('whiteboard:version_create_error', (data) => {
        done(new Error(`Version creation failed: ${data.message}`));
      });

      // Emit version creation request
      clientSocket.emit('whiteboard:create_version', versionData);
    });

    it('should handle auto-version creation silently', (done) => {
      const mockAutoVersion = {
        versionId: 'auto-version-id',
        versionNumber: 3,
      };

      clientSocket.on('whiteboard:auto_version_created', (data) => {
        expect(data.versionId).toBe('auto-version-id');
        expect(data.versionNumber).toBe(3);
        expect(data.timestamp).toBeDefined();
        done();
      });

      // Simulate auto-version creation (would normally be triggered by canvas changes)
      clientSocket.emit('whiteboard:auto_version_created', mockAutoVersion);
    });

    it('should handle version creation permission errors', (done) => {
      // Mock permission denied
      mockDb.query.mockResolvedValueOnce({ rows: [] }); // No edit permissions

      const versionData = {
        whiteboardId: mockWhiteboardId,
        changeType: 'major',
        commitMessage: 'Unauthorized version',
      };

      clientSocket.on('error', (data) => {
        expect(data.code).toBe('PERMISSION_DENIED');
        expect(data.message).toContain('Insufficient permissions');
        done();
      });

      clientSocket.emit('whiteboard:create_version', versionData);
    });
  });

  describe('Version History Events', () => {
    it('should retrieve version history with pagination', (done) => {
      const mockVersionHistory = {
        items: [
          {
            id: 'version-1',
            versionNumber: 2,
            commitMessage: 'Recent change',
            changeType: 'minor',
            createdBy: mockUserId,
            createdAt: new Date().toISOString(),
          },
          {
            id: 'version-2',
            versionNumber: 1,
            commitMessage: 'Initial version',
            changeType: 'major',
            createdBy: mockUserId,
            createdAt: new Date(Date.now() - 86400000).toISOString(),
          },
        ],
        total: 2,
        limit: 20,
        offset: 0,
        hasMore: false,
      };

      // Mock database response
      mockDb.query
        .mockResolvedValueOnce({ rows: mockVersionHistory.items }) // versions query
        .mockResolvedValueOnce({ rows: [{ total: 2 }] }); // count query

      clientSocket.on('whiteboard:version_history', (data) => {
        expect(data.whiteboardId).toBe(mockWhiteboardId);
        expect(data.versions.items).toHaveLength(2);
        expect(data.versions.total).toBe(2);
        expect(data.versions.items[0].versionNumber).toBe(2);
        expect(data.timestamp).toBeDefined();
        done();
      });

      clientSocket.on('whiteboard:version_history_error', (data) => {
        done(new Error(`Version history failed: ${data.message}`));
      });

      clientSocket.emit('whiteboard:get_version_history', {
        whiteboardId: mockWhiteboardId,
        limit: 20,
        offset: 0,
      });
    });

    it('should apply filters to version history', (done) => {
      const filters = {
        branchName: 'main',
        changeType: ['major', 'minor'],
        isMilestone: true,
        dateFrom: '2024-01-01T00:00:00.000Z',
        dateTo: '2024-12-31T23:59:59.999Z',
      };

      mockDb.query
        .mockResolvedValueOnce({ rows: [] }) // filtered results
        .mockResolvedValueOnce({ rows: [{ total: 0 }] }); // count

      clientSocket.on('whiteboard:version_history', (data) => {
        expect(data.versions.items).toHaveLength(0);
        expect(data.versions.total).toBe(0);
        done();
      });

      clientSocket.emit('whiteboard:get_version_history', {
        whiteboardId: mockWhiteboardId,
        filters,
        limit: 20,
        offset: 0,
      });
    });
  });

  describe('Version Comparison Events', () => {
    it('should compare two versions successfully', (done) => {
      const mockComparison = {
        id: 'comparison-id',
        whiteboardId: mockWhiteboardId,
        versionAId: 'version-a-id',
        versionBId: 'version-b-id',
        comparisonType: 'full',
        diffSummary: {
          hasCanvasChanges: false,
          elementsAdded: 1,
          elementsRemoved: 0,
          elementsModified: 2,
        },
        detailedDiff: {
          canvasChanges: false,
          elementChanges: {
            added: [{ id: 'new-element', elementType: 'rectangle' }],
            removed: [],
            modified: [
              {
                id: 'element-1',
                old: { position: { x: 100, y: 100 } },
                new: { position: { x: 150, y: 150 } },
              },
            ],
          },
        },
        similarityScore: 0.85,
        processingTimeMs: 25,
        createdAt: new Date().toISOString(),
      };

      // Mock version comparison
      mockDb.query
        .mockResolvedValueOnce({ rows: [] }) // no cached comparison
        .mockResolvedValueOnce({ rows: [{ /* version A data */ }] }) // version A
        .mockResolvedValueOnce({ rows: [{ /* version B data */ }] }) // version B
        .mockResolvedValueOnce({ rows: [mockComparison] }); // store comparison

      clientSocket.on('whiteboard:version_comparison', (data) => {
        expect(data.comparison.id).toBe('comparison-id');
        expect(data.comparison.similarityScore).toBe(0.85);
        expect(data.comparison.diffSummary.elementsAdded).toBe(1);
        expect(data.comparison.diffSummary.elementsModified).toBe(2);
        expect(data.timestamp).toBeDefined();
        done();
      });

      clientSocket.on('whiteboard:version_comparison_error', (data) => {
        done(new Error(`Version comparison failed: ${data.message}`));
      });

      clientSocket.emit('whiteboard:compare_versions', {
        whiteboardId: mockWhiteboardId,
        versionAId: 'version-a-id',
        versionBId: 'version-b-id',
        comparisonType: 'full',
      });
    });

    it('should handle different comparison types', (done) => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{}] })
        .mockResolvedValueOnce({ rows: [{}] })
        .mockResolvedValueOnce({ rows: [{ comparisonType: 'elements_only' }] });

      clientSocket.on('whiteboard:version_comparison', (data) => {
        expect(data.comparison.comparisonType).toBe('elements_only');
        done();
      });

      clientSocket.emit('whiteboard:compare_versions', {
        whiteboardId: mockWhiteboardId,
        versionAId: 'version-a-id',
        versionBId: 'version-b-id',
        comparisonType: 'elements_only',
      });
    });
  });

  describe('Version Rollback Events', () => {
    it('should perform rollback successfully', (done) => {
      const mockRollback = {
        id: 'rollback-id',
        whiteboardId: mockWhiteboardId,
        sourceVersionId: 'current-version-id',
        targetVersionId: 'target-version-id',
        rollbackType: 'full',
        status: 'completed',
        completedOperations: 1,
        totalOperations: 1,
        processingTimeMs: 150,
        createdAt: new Date().toISOString(),
      };

      // Mock rollback process
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ /* target version */ }] }) // getVersionById
        .mockResolvedValueOnce({ rows: [{ /* current version */ }] }) // getLatestVersion
        .mockResolvedValueOnce({ rows: [{ /* backup version */ }] }) // create backup
        .mockResolvedValueOnce({ rows: [mockRollback] }) // insert rollback record
        .mockResolvedValueOnce({ rows: [{ active_count: 0 }] }); // no conflicts

      let eventsReceived = 0;
      const expectedEvents = 3; // started, completed, request_full_sync

      clientSocket.on('whiteboard:rollback_started', (data) => {
        expect(data.whiteboardId).toBe(mockWhiteboardId);
        expect(data.targetVersionId).toBe('target-version-id');
        eventsReceived++;
        if (eventsReceived === expectedEvents) done();
      });

      clientSocket.on('whiteboard:rollback_completed', (data) => {
        expect(data.rollback.id).toBe('rollback-id');
        expect(data.rollback.status).toBe('completed');
        expect(data.rolledBackBy.id).toBe(mockUserId);
        eventsReceived++;
        if (eventsReceived === expectedEvents) done();
      });

      clientSocket.on('whiteboard:request_full_sync', (data) => {
        expect(data.reason).toBe('rollback_completed');
        expect(data.rollbackId).toBe('rollback-id');
        eventsReceived++;
        if (eventsReceived === expectedEvents) done();
      });

      clientSocket.on('whiteboard:rollback_error', (data) => {
        done(new Error(`Rollback failed: ${data.message}`));
      });

      clientSocket.emit('whiteboard:rollback_to_version', {
        whiteboardId: mockWhiteboardId,
        targetVersionId: 'target-version-id',
        rollbackType: 'full',
        conflictResolution: 'overwrite',
      });
    });

    it('should detect and report rollback conflicts', (done) => {
      const mockRollbackWithConflicts = {
        id: 'rollback-with-conflicts-id',
        status: 'conflict',
        conflictsData: [
          {
            type: 'active_sessions',
            description: '3 active sessions may be affected by rollback',
            severity: 'warning',
          },
        ],
      };

      // Mock conflict detection
      mockDb.query
        .mockResolvedValueOnce({ rows: [{}] }) // target version
        .mockResolvedValueOnce({ rows: [{}] }) // current version
        .mockResolvedValueOnce({ rows: [{}] }) // backup version
        .mockResolvedValueOnce({ rows: [mockRollbackWithConflicts] }) // rollback with conflicts
        .mockResolvedValueOnce({ rows: [{ active_count: 3 }] }); // 3 active sessions

      clientSocket.on('whiteboard:rollback_conflicts', (data) => {
        expect(data.rollback.status).toBe('conflict');
        expect(data.conflicts).toHaveLength(1);
        expect(data.conflicts[0].type).toBe('active_sessions');
        expect(data.conflicts[0].description).toContain('3 active sessions');
        done();
      });

      clientSocket.emit('whiteboard:rollback_to_version', {
        whiteboardId: mockWhiteboardId,
        targetVersionId: 'target-version-id',
        rollbackType: 'full',
        conflictResolution: 'manual', // This should trigger conflict detection
      });
    });

    it('should handle rollback permission errors', (done) => {
      // Mock no edit permissions
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      clientSocket.on('error', (data) => {
        expect(data.code).toBe('PERMISSION_DENIED');
        expect(data.message).toContain('Insufficient permissions to rollback');
        done();
      });

      clientSocket.emit('whiteboard:rollback_to_version', {
        whiteboardId: mockWhiteboardId,
        targetVersionId: 'target-version-id',
      });
    });
  });

  describe('Version Branch Management', () => {
    it('should retrieve version branches', (done) => {
      clientSocket.on('whiteboard:version_branches', (data) => {
        expect(data.whiteboardId).toBe(mockWhiteboardId);
        expect(data.branches).toHaveLength(1);
        expect(data.branches[0].name).toBe('main');
        expect(data.branches[0].isMain).toBe(true);
        expect(data.timestamp).toBeDefined();
        done();
      });

      clientSocket.on('whiteboard:version_branches_error', (data) => {
        done(new Error(`Branch retrieval failed: ${data.message}`));
      });

      clientSocket.emit('whiteboard:get_version_branches', {
        whiteboardId: mockWhiteboardId,
      });
    });
  });

  describe('Conflict Resolution Events', () => {
    it('should handle rollback conflict resolution', (done) => {
      const rollbackId = 'rollback-with-conflicts-id';

      clientSocket.on('whiteboard:rollback_conflicts_resolving', (data) => {
        expect(data.rollbackId).toBe(rollbackId);
        expect(data.resolution).toBe('overwrite');
        expect(data.timestamp).toBeDefined();
        done();
      });

      clientSocket.on('whiteboard:rollback_conflict_resolution_error', (data) => {
        done(new Error(`Conflict resolution failed: ${data.message}`));
      });

      clientSocket.emit('whiteboard:resolve_rollback_conflicts', {
        rollbackId,
        resolution: 'overwrite',
        selectedOperations: [],
      });
    });
  });

  describe('Real-time Updates', () => {
    it('should broadcast version events to all connected users', (done) => {
      // Create a second client to test broadcasting
      const secondClient = ioClient(`http://localhost:${port}`, {
        auth: { token: mockToken },
        transports: ['websocket'],
      });

      secondClient.on('connect', () => {
        // Join the same whiteboard
        secondClient.emit('whiteboard:join', {
          whiteboardId: mockWhiteboardId,
          workspaceId: 'test-workspace-id',
        });

        // Listen for version creation on second client
        secondClient.on('whiteboard:version_created', (data) => {
          expect(data.version.commitMessage).toBe('Broadcast test');
          secondClient.disconnect();
          done();
        });

        // Create version from first client
        setTimeout(() => {
          mockDb.query
            .mockResolvedValueOnce({ rows: [{}] })
            .mockResolvedValueOnce({ rows: [{ next_version: 1 }] })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [{ 
              id: 'broadcast-version-id',
              commitMessage: 'Broadcast test' 
            }] });

          clientSocket.emit('whiteboard:create_version', {
            whiteboardId: mockWhiteboardId,
            changeType: 'minor',
            commitMessage: 'Broadcast test',
          });
        }, 100);
      });
    });

    it('should handle multiple concurrent version operations', (done) => {
      const operationsCompleted = { count: 0 };
      const expectedOperations = 3;

      const completeOperation = () => {
        operationsCompleted.count++;
        if (operationsCompleted.count === expectedOperations) {
          done();
        }
      };

      // Mock database responses for multiple operations
      mockDb.query
        .mockResolvedValue({ rows: [{}] }); // Generic success response

      // Operation 1: Create version
      clientSocket.emit('whiteboard:create_version', {
        whiteboardId: mockWhiteboardId,
        changeType: 'minor',
        commitMessage: 'Concurrent operation 1',
      });

      // Operation 2: Get version history
      clientSocket.emit('whiteboard:get_version_history', {
        whiteboardId: mockWhiteboardId,
      });

      // Operation 3: Get branches
      clientSocket.emit('whiteboard:get_version_branches', {
        whiteboardId: mockWhiteboardId,
      });

      // Listen for completion events
      clientSocket.on('whiteboard:version_created_success', completeOperation);
      clientSocket.on('whiteboard:version_history', completeOperation);
      clientSocket.on('whiteboard:version_branches', completeOperation);
    });
  });
});