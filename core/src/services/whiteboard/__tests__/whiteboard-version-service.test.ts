import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { WhiteboardVersionService } from '../whiteboard-version-service.js';
import { WhiteboardService } from '../whiteboard-service.js';
import { DatabasePool } from '../../../utils/database-pool.js';
import { Logger } from '../../../utils/logger.js';
import { 
  WhiteboardVersion, 
  WhiteboardVersionRollback, 
  WhiteboardVersionComparison,
  WhiteboardWithElements 
} from '@shared/types/whiteboard.js';

// Mock dependencies
jest.mock('../../../utils/database-pool.js');
jest.mock('../../../utils/logger.js');
jest.mock('../whiteboard-service.js');

describe('WhiteboardVersionService', () => {
  let versionService: WhiteboardVersionService;
  let mockDb: jest.Mocked<DatabasePool>;
  let mockLogger: jest.Mocked<Logger>;
  let mockWhiteboardService: jest.Mocked<WhiteboardService>;

  const mockWhiteboardId = 'test-whiteboard-id';
  const mockUserId = 'test-user-id';
  const mockVersionId = 'test-version-id';

  const mockWhiteboardWithElements: WhiteboardWithElements = {
    id: mockWhiteboardId,
    workspaceId: 'test-workspace-id',
    name: 'Test Whiteboard',
    description: 'Test Description',
    canvasData: {
      dimensions: { width: 1000, height: 800 },
      background: { color: '#ffffff' },
    },
    settings: {},
    templateId: null,
    isTemplate: false,
    visibility: 'workspace',
    status: 'active',
    version: 1,
    createdBy: mockUserId,
    lastModifiedBy: mockUserId,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    elements: [
      {
        id: 'element-1',
        whiteboardId: mockWhiteboardId,
        elementType: 'rectangle',
        elementData: {
          position: { x: 100, y: 100 },
          bounds: { x: 100, y: 100, width: 200, height: 150 },
        },
        layerIndex: 0,
        parentId: null,
        locked: false,
        visible: true,
        styleData: { fill: '#ff0000', stroke: '#000000' },
        metadata: {},
        version: 1,
        createdBy: mockUserId,
        lastModifiedBy: mockUserId,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      },
    ],
    activeSessions: 1,
    permissions: {},
  };

  const mockVersion: WhiteboardVersion = {
    id: mockVersionId,
    whiteboardId: mockWhiteboardId,
    versionNumber: 1,
    parentVersionId: null,
    versionType: 'snapshot',
    changeType: 'major',
    commitMessage: 'Initial version',
    isAutomatic: false,
    createdBy: mockUserId,
    branchName: 'main',
    mergeSourceId: null,
    isMilestone: false,
    tags: [],
    snapshotData: mockWhiteboardWithElements,
    deltaData: null,
    compressedData: null,
    compressionType: null,
    dataSize: null,
    compressedSize: null,
    elementCount: 1,
    canvasHash: 'test-canvas-hash',
    elementsHash: 'test-elements-hash',
    totalChanges: 0,
    elementsAdded: 1,
    elementsModified: 0,
    elementsDeleted: 0,
    creationTimeMs: 100,
    whiteboardVersion: 1,
    metadata: {},
    expiresAt: null,
    createdAt: '2024-01-01T00:00:00.000Z',
  };

  beforeEach(() => {
    mockDb = {
      query: jest.fn(),
      executeTransaction: jest.fn(),
      updateTable: jest.fn(),
      insertInto: jest.fn(),
      raw: jest.fn(),
    } as any;

    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    } as any;

    mockWhiteboardService = {
      getWhiteboardWithElements: jest.fn(),
      getWhiteboard: jest.fn(),
    } as any;

    versionService = new WhiteboardVersionService(mockDb, mockLogger);
    (versionService as any).whiteboardService = mockWhiteboardService;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createVersion', () => {
    beforeEach(() => {
      mockWhiteboardService.getWhiteboardWithElements.mockResolvedValue(mockWhiteboardWithElements);
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ next_version: 1 }] }) // getNextVersionNumber
        .mockResolvedValueOnce({ rows: [] }) // getLatestVersion
        .mockResolvedValueOnce({ rows: [mockVersion] }); // insert version
    });

    it('should create a new version successfully', async () => {
      const request = {
        changeType: 'major' as const,
        commitMessage: 'Test version',
        isMilestone: true,
      };

      const result = await versionService.createVersion(mockWhiteboardId, mockUserId, request);

      expect(result).toBeDefined();
      expect(mockWhiteboardService.getWhiteboardWithElements).toHaveBeenCalledWith(mockWhiteboardId, mockUserId);
      expect(mockDb.query).toHaveBeenCalledTimes(3);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Version created successfully',
        expect.objectContaining({
          whiteboardId: mockWhiteboardId,
          versionId: expect.any(String),
          userId: mockUserId,
        })
      );
    });

    it('should create delta version for incremental changes', async () => {
      // Mock existing version for delta creation
      const existingVersion = { ...mockVersion, id: 'existing-version-id' };
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ next_version: 2 }] }) // getNextVersionNumber
        .mockResolvedValueOnce({ rows: [existingVersion] }) // getLatestVersion
        .mockResolvedValueOnce({ rows: [existingVersion] }) // getVersionById for reconstruction
        .mockResolvedValueOnce({ rows: [{ ...mockVersion, versionNumber: 2, versionType: 'delta' }] }); // insert version

      const request = {
        changeType: 'minor' as const,
        commitMessage: 'Incremental change',
      };

      const result = await versionService.createVersion(mockWhiteboardId, mockUserId, request);

      expect(result.versionType).toBe('delta');
      expect(result.versionNumber).toBe(2);
    });

    it('should handle compression for large snapshots', async () => {
      // Mock a large whiteboard state
      const largeWhiteboard = {
        ...mockWhiteboardWithElements,
        elements: Array(1000).fill(0).map((_, i) => ({
          ...mockWhiteboardWithElements.elements[0],
          id: `element-${i}`,
        })),
      };

      mockWhiteboardService.getWhiteboardWithElements.mockResolvedValue(largeWhiteboard);

      const request = {
        changeType: 'major' as const,
        commitMessage: 'Large version',
        forceSnapshot: true,
      };

      const result = await versionService.createVersion(mockWhiteboardId, mockUserId, request);

      // Verify that compression was considered (implementation detail)
      expect(result).toBeDefined();
    });

    it('should handle whiteboard not found error', async () => {
      mockWhiteboardService.getWhiteboardWithElements.mockResolvedValue(null);

      const request = {
        changeType: 'major' as const,
        commitMessage: 'Test version',
      };

      await expect(versionService.createVersion(mockWhiteboardId, mockUserId, request))
        .rejects
        .toThrow('Whiteboard not found');
    });
  });

  describe('getVersionHistory', () => {
    const mockVersionHistory = {
      items: [mockVersion],
      total: 1,
      limit: 20,
      offset: 0,
      hasMore: false,
    };

    beforeEach(() => {
      mockWhiteboardService.getWhiteboard.mockResolvedValue(mockWhiteboardWithElements);
      mockDb.query
        .mockResolvedValueOnce({ rows: [mockVersion] }) // versions query
        .mockResolvedValueOnce({ rows: [{ total: 1 }] }); // count query
    });

    it('should retrieve version history successfully', async () => {
      const result = await versionService.getVersionHistory(mockWhiteboardId, mockUserId);

      expect(result).toEqual(mockVersionHistory);
      expect(mockDb.query).toHaveBeenCalledTimes(2);
    });

    it('should apply filters correctly', async () => {
      const filters = {
        branchName: 'main',
        changeType: ['major', 'minor'],
        isMilestone: true,
      };

      await versionService.getVersionHistory(mockWhiteboardId, mockUserId, filters);

      const queryCall = mockDb.query.mock.calls[0];
      expect(queryCall[0]).toContain('wv.branch_name = $');
      expect(queryCall[0]).toContain('wv.change_type = ANY($');
      expect(queryCall[0]).toContain('wv.is_milestone = $');
    });

    it('should handle pagination correctly', async () => {
      const limit = 10;
      const offset = 20;

      await versionService.getVersionHistory(mockWhiteboardId, mockUserId, {}, limit, offset);

      const queryCall = mockDb.query.mock.calls[0];
      expect(queryCall[1]).toContain(limit);
      expect(queryCall[1]).toContain(offset);
    });
  });

  describe('rollbackToVersion', () => {
    const mockRollback: WhiteboardVersionRollback = {
      id: 'rollback-id',
      whiteboardId: mockWhiteboardId,
      sourceVersionId: 'source-version-id',
      targetVersionId: mockVersionId,
      rollbackType: 'full',
      status: 'completed',
      conflictResolution: 'overwrite',
      conflictsData: [],
      rollbackOperations: [],
      completedOperations: 1,
      totalOperations: 1,
      backupVersionId: 'backup-version-id',
      userId: mockUserId,
      errorMessage: null,
      processingTimeMs: 150,
      startedAt: '2024-01-01T01:00:00.000Z',
      completedAt: '2024-01-01T01:00:01.000Z',
      createdAt: '2024-01-01T01:00:00.000Z',
    };

    beforeEach(() => {
      mockWhiteboardService.getWhiteboard.mockResolvedValue(mockWhiteboardWithElements);
      mockDb.query
        .mockResolvedValueOnce({ rows: [mockVersion] }) // getVersionById (target)
        .mockResolvedValueOnce({ rows: [mockVersion] }) // getLatestVersion
        .mockResolvedValueOnce({ rows: [mockVersion] }) // create backup version
        .mockResolvedValueOnce({ rows: [mockRollback] }) // insert rollback record
        .mockResolvedValueOnce({ rows: [{ active_count: 0 }] }); // detect conflicts
    });

    it('should perform rollback successfully', async () => {
      const request = {
        targetVersionId: mockVersionId,
        rollbackType: 'full' as const,
        conflictResolution: 'overwrite' as const,
      };

      const result = await versionService.rollbackToVersion(mockWhiteboardId, mockUserId, request);

      expect(result).toBeDefined();
      expect(result.status).toBe('completed');
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Rollback completed successfully',
        expect.objectContaining({
          rollbackId: result.id,
          whiteboardId: mockWhiteboardId,
          targetVersionNumber: mockVersion.versionNumber,
        })
      );
    });

    it('should detect conflicts and return conflict status', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [mockVersion] }) // getVersionById (target)
        .mockResolvedValueOnce({ rows: [mockVersion] }) // getLatestVersion  
        .mockResolvedValueOnce({ rows: [mockVersion] }) // create backup version
        .mockResolvedValueOnce({ rows: [{ ...mockRollback, status: 'conflict' }] }) // insert rollback record
        .mockResolvedValueOnce({ rows: [{ active_count: 3 }] }); // detect conflicts (3 active sessions)

      const request = {
        targetVersionId: mockVersionId,
        rollbackType: 'full' as const,
        conflictResolution: 'manual' as const,
      };

      const result = await versionService.rollbackToVersion(mockWhiteboardId, mockUserId, request);

      expect(result.status).toBe('conflict');
      expect(result.conflictsData).toHaveLength(1);
    });

    it('should handle target version not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] }); // getVersionById returns empty

      const request = {
        targetVersionId: 'nonexistent-version-id',
        rollbackType: 'full' as const,
      };

      await expect(versionService.rollbackToVersion(mockWhiteboardId, mockUserId, request))
        .rejects
        .toThrow('Target version not found');
    });

    it('should handle partial rollback', async () => {
      const request = {
        targetVersionId: mockVersionId,
        rollbackType: 'elements_only' as const,
        conflictResolution: 'overwrite' as const,
      };

      const result = await versionService.rollbackToVersion(mockWhiteboardId, mockUserId, request);

      expect(result.rollbackType).toBe('elements_only');
    });
  });

  describe('compareVersions', () => {
    const mockComparison: WhiteboardVersionComparison = {
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
      diffSize: 500,
      similarityScore: 0.85,
      processingTimeMs: 25,
      createdBy: mockUserId,
      createdAt: '2024-01-01T02:00:00.000Z',
      expiresAt: '2024-01-02T02:00:00.000Z',
    };

    beforeEach(() => {
      // Mock version reconstruction
      mockDb.query
        .mockResolvedValueOnce({ rows: [] }) // getCachedComparison
        .mockResolvedValueOnce({ rows: [mockVersion] }) // getVersionById (A)
        .mockResolvedValueOnce({ rows: [mockVersion] }) // getVersionById (B)
        .mockResolvedValueOnce({ rows: [mockComparison] }); // cacheComparison
    });

    it('should compare versions successfully', async () => {
      const request = {
        versionAId: 'version-a-id',
        versionBId: 'version-b-id',
        comparisonType: 'full' as const,
      };

      const result = await versionService.compareVersions(mockWhiteboardId, mockUserId, request);

      expect(result).toBeDefined();
      expect(result.similarityScore).toBe(0.85);
      expect(result.diffSummary.elementsAdded).toBe(1);
      expect(result.diffSummary.elementsModified).toBe(2);
    });

    it('should use cached comparison when available', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [mockComparison] }); // getCachedComparison returns cached result

      const request = {
        versionAId: 'version-a-id',
        versionBId: 'version-b-id',
        comparisonType: 'full' as const,
      };

      const result = await versionService.compareVersions(mockWhiteboardId, mockUserId, request);

      expect(result).toEqual(mockComparison);
      expect(mockDb.query).toHaveBeenCalledTimes(1); // Only the cache check
    });

    it('should handle different comparison types', async () => {
      const request = {
        versionAId: 'version-a-id',
        versionBId: 'version-b-id',
        comparisonType: 'elements_only' as const,
      };

      const result = await versionService.compareVersions(mockWhiteboardId, mockUserId, request);

      expect(result.comparisonType).toBe('elements_only');
    });

    it('should calculate similarity score correctly', async () => {
      // Test identical versions
      const identicalStates = {
        elements: [
          { id: 'element-1', content: 'same' },
          { id: 'element-2', content: 'same' },
        ],
      };

      // Mock identical version states
      jest.spyOn(versionService as any, 'reconstructVersionState')
        .mockResolvedValueOnce(identicalStates)
        .mockResolvedValueOnce(identicalStates);

      const request = {
        versionAId: 'version-a-id',
        versionBId: 'version-b-id',
        comparisonType: 'full' as const,
      };

      const result = await versionService.compareVersions(mockWhiteboardId, mockUserId, request);

      // For identical states, similarity should be 1.0
      expect(result.similarityScore).toBe(1.0);
    });
  });

  describe('Delta Compression', () => {
    it('should create deltas correctly for element changes', async () => {
      const DeltaCompression = WhiteboardVersionService.DeltaCompression;
      
      const oldState = {
        canvasData: { background: '#ffffff' },
        elements: [
          { id: 'elem1', elementType: 'rectangle', elementData: { position: { x: 100, y: 100 } } }
        ]
      };
      
      const newState = {
        canvasData: { background: '#ffffff' },
        elements: [
          { id: 'elem1', elementType: 'rectangle', elementData: { position: { x: 150, y: 100 } } },
          { id: 'elem2', elementType: 'circle', elementData: { position: { x: 200, y: 200 } } }
        ]
      };
      
      const deltas = DeltaCompression.createDelta(oldState, newState);
      
      expect(deltas).toHaveLength(2); // One modify, one create
      expect(deltas.some((d: any) => d.operationType === 'move')).toBe(true);
      expect(deltas.some((d: any) => d.operationType === 'create')).toBe(true);
      
      // Check that delta patches are arrays (JSON patch format)
      deltas.forEach((delta: any) => {
        expect(Array.isArray(delta.deltaPatch)).toBe(true);
      });
    });

    it('should apply deltas correctly to reconstruct state', async () => {
      const DeltaCompression = WhiteboardVersionService.DeltaCompression;
      
      const baseState = {
        canvasData: { background: '#ffffff' },
        elements: [
          { id: 'elem1', elementType: 'rectangle', elementData: { position: { x: 100, y: 100 } } }
        ]
      };
      
      const targetState = {
        canvasData: { background: '#ffffff' },
        elements: [
          { id: 'elem1', elementType: 'rectangle', elementData: { position: { x: 150, y: 100 } } },
          { id: 'elem2', elementType: 'circle', elementData: { position: { x: 200, y: 200 } } }
        ]
      };
      
      const deltas = DeltaCompression.createDelta(baseState, targetState);
      const reconstructedState = DeltaCompression.applyDeltas(baseState, deltas);
      
      expect(reconstructedState.elements).toHaveLength(2);
      expect(reconstructedState.elements[0].elementData.position.x).toBe(150);
      expect(reconstructedState.elements[1].id).toBe('elem2');
    });

    it('should compress storage efficiently', async () => {
      const DeltaCompression = WhiteboardVersionService.DeltaCompression;
      
      const largeBaseState = {
        canvasData: { background: '#ffffff', settings: { zoom: 1.0, pan: { x: 0, y: 0 } } },
        elements: Array.from({ length: 100 }, (_, i) => ({
          id: `elem${i}`,
          elementType: 'rectangle',
          elementData: { position: { x: i * 10, y: i * 10 } },
          styleData: { fill: '#ff0000', stroke: '#000000' }
        }))
      };
      
      // Small change - move one element
      const modifiedState = JSON.parse(JSON.stringify(largeBaseState));
      modifiedState.elements[0].elementData.position.x = 999;
      
      const deltas = DeltaCompression.createDelta(largeBaseState, modifiedState);
      
      const baseStateSize = JSON.stringify(largeBaseState).length;
      const deltaSize = JSON.stringify(deltas).length;
      const compressionRatio = deltaSize / baseStateSize;
      
      // Delta should be significantly smaller than full state (< 10% overhead requirement)
      expect(compressionRatio).toBeLessThan(0.1);
      expect(deltas).toHaveLength(1); // Only one change
    });
  });

  describe('Performance Requirements', () => {
    it('should create version in less than 1 second', async () => {
      mockWhiteboardService.getWhiteboardWithElements.mockResolvedValue(mockWhiteboardWithElements);
      mockDb.query.mockResolvedValueOnce({ rows: [{ next_version: 2 }] }); // getNextVersionNumber
      mockDb.query.mockResolvedValueOnce({ rows: [mockVersion] }); // getLatestVersion
      mockDb.query.mockResolvedValueOnce({ rows: [{ ...mockVersion, id: 'new-version-id' }] }); // create version
      mockDb.query.mockResolvedValueOnce({ rows: [] }); // update creation time
      mockDb.query.mockResolvedValueOnce({ rows: [] }); // update branch head

      const startTime = Date.now();
      
      await versionService.createVersion(mockWhiteboardId, mockUserId, {
        changeType: 'major',
        commitMessage: 'Performance test version'
      });
      
      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(1000); // < 1 second requirement
    });

    it('should rollback in less than 3 seconds', async () => {
      const mockRollback = {
        id: 'rollback-id',
        whiteboardId: mockWhiteboardId,
        sourceVersionId: 'source-version',
        targetVersionId: mockVersionId,
        rollbackType: 'full',
        status: 'processing',
        conflictResolution: null,
        conflictsData: [],
        rollbackOperations: [],
        completedOperations: 0,
        totalOperations: 0,
        backupVersionId: 'backup-version',
        userId: mockUserId,
        errorMessage: null,
        processingTimeMs: null,
        startedAt: new Date().toISOString(),
        completedAt: null,
        createdAt: new Date().toISOString(),
      };

      mockWhiteboardService.getWhiteboard.mockResolvedValue(mockWhiteboardWithElements);
      mockDb.query.mockResolvedValueOnce({ rows: [mockVersion] }); // getVersionById
      mockDb.query.mockResolvedValueOnce({ rows: [mockVersion] }); // getLatestVersion
      mockWhiteboardService.getWhiteboardWithElements.mockResolvedValue(mockWhiteboardWithElements);
      mockDb.query.mockResolvedValueOnce({ rows: [{ ...mockVersion, id: 'backup-version' }] }); // backup version
      mockDb.query.mockResolvedValueOnce({ rows: [] }); // update creation time
      mockDb.query.mockResolvedValueOnce({ rows: [] }); // update branch head
      mockDb.query.mockResolvedValueOnce({ rows: [{ active_count: 0 }] }); // check active sessions
      mockDb.query.mockResolvedValueOnce({ rows: [mockRollback] }); // insert rollback
      mockDb.executeTransaction.mockImplementation(async (fn) => await fn(mockDb));
      mockDb.updateTable = jest.fn().mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            execute: jest.fn().mockResolvedValue({ rows: [] })
          })
        })
      });
      mockDb.insertInto = jest.fn().mockReturnValue({
        values: jest.fn().mockReturnValue({
          execute: jest.fn().mockResolvedValue({ rows: [] })
        })
      });
      mockDb.raw = jest.fn().mockReturnValue('version + 1');
      mockDb.query.mockResolvedValueOnce({ rows: [] }); // updateRollbackStatus
      mockDb.query.mockResolvedValueOnce({ rows: [mockRollback] }); // getRollbackById

      const startTime = Date.now();
      
      await versionService.rollbackToVersion(mockWhiteboardId, mockUserId, {
        targetVersionId: mockVersionId,
        rollbackType: 'full'
      });
      
      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(3000); // < 3 seconds requirement
    });

    it('should query version history in less than 500ms', async () => {
      mockWhiteboardService.getWhiteboard.mockResolvedValue(mockWhiteboardWithElements);
      mockDb.query.mockResolvedValueOnce({ rows: [mockVersion] }); // versions query
      mockDb.query.mockResolvedValueOnce({ rows: [{ total: 1 }] }); // count query

      const startTime = Date.now();
      
      await versionService.getVersionHistory(mockWhiteboardId, mockUserId);
      
      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(500); // < 500ms requirement
    });

    it('should validate storage efficiency meets <10% overhead requirement', async () => {
      const DeltaCompression = WhiteboardVersionService.DeltaCompression;
      
      // Create large base state (simulating real whiteboard with many elements)
      const largeBaseState = {
        canvasData: { 
          background: '#ffffff', 
          settings: { zoom: 1.0, pan: { x: 0, y: 0 } },
          grid: { enabled: true, size: 20 }
        },
        elements: Array.from({ length: 500 }, (_, i) => ({
          id: `elem${i}`,
          elementType: 'rectangle',
          elementData: { 
            position: { x: i * 10, y: i * 10 },
            bounds: { x: i * 10, y: i * 10, width: 100, height: 50 }
          },
          styleData: { 
            fill: '#ff0000', 
            stroke: '#000000',
            strokeWidth: 2,
            opacity: 1.0
          },
          metadata: { created: new Date().toISOString(), tags: ['test'] }
        }))
      };
      
      // Make typical small changes
      const modifiedState = JSON.parse(JSON.stringify(largeBaseState));
      modifiedState.elements[0].elementData.position.x += 50; // Move one element
      modifiedState.elements[1].styleData.fill = '#00ff00'; // Change color
      modifiedState.elements.push({ // Add one element
        id: 'new-elem',
        elementType: 'circle',
        elementData: { position: { x: 1000, y: 1000 } },
        styleData: { fill: '#0000ff' }
      });
      
      const deltas = DeltaCompression.createDelta(largeBaseState, modifiedState);
      
      const baseStateSize = JSON.stringify(largeBaseState).length;
      const deltaSize = JSON.stringify(deltas).length;
      const storageOverhead = deltaSize / baseStateSize;
      
      console.log(`Storage efficiency test: Base state: ${baseStateSize} bytes, Delta: ${deltaSize} bytes, Overhead: ${(storageOverhead * 100).toFixed(2)}%`);
      
      // Must meet <10% overhead requirement
      expect(storageOverhead).toBeLessThan(0.1);
      expect(deltas.length).toBe(3); // Three changes made
    });
  });

  describe('Error Handling', () => {
    it('should handle database connection errors', async () => {
      mockWhiteboardService.getWhiteboardWithElements.mockRejectedValue(new Error('Database connection failed'));

      const request = {
        changeType: 'major' as const,
        commitMessage: 'Test version',
      };

      await expect(versionService.createVersion(mockWhiteboardId, mockUserId, request))
        .rejects
        .toThrow('Database connection failed');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to create version',
        expect.objectContaining({
          error: expect.any(Error),
          whiteboardId: mockWhiteboardId,
          userId: mockUserId,
        })
      );
    });

    it('should handle malformed JSON data gracefully', () => {
      const malformedRow = {
        id: 'test-id',
        whiteboard_id: 'test-whiteboard-id',
        version_number: 1,
        version_type: 'snapshot',
        change_type: 'major',
        created_by: 'test-user',
        created_at: new Date(),
        snapshot_data: 'invalid json{',
        tags: '[invalid json',
        element_count: 0,
        total_changes: 0,
        elements_added: 0,
        elements_modified: 0,
        elements_deleted: 0,
        whiteboard_version: 1,
        metadata: '{}',
      };

      const result = (versionService as any).mapDatabaseRowToVersion(malformedRow);

      expect(result.snapshotData).toEqual({});
      expect(result.tags).toEqual([]);
      expect(result.metadata).toEqual({});
    });
  });

  describe('Performance Considerations', () => {
    it('should handle large version histories efficiently', async () => {
      const largeVersionHistory = Array(1000).fill(0).map((_, i) => ({
        ...mockVersion,
        id: `version-${i}`,
        versionNumber: i + 1,
      }));

      mockWhiteboardService.getWhiteboard.mockResolvedValue(mockWhiteboardWithElements);
      mockDb.query
        .mockResolvedValueOnce({ rows: largeVersionHistory.slice(0, 20) })
        .mockResolvedValueOnce({ rows: [{ total: 1000 }] });

      const result = await versionService.getVersionHistory(mockWhiteboardId, mockUserId, {}, 20, 0);

      expect(result.items).toHaveLength(20);
      expect(result.total).toBe(1000);
      expect(result.hasMore).toBe(true);
    });

    it('should cache comparison results effectively', async () => {
      const cachedComparison = {
        id: 'cached-comparison',
        whiteboardId: mockWhiteboardId,
        versionAId: 'version-a-id',
        versionBId: 'version-b-id',
        comparisonType: 'full',
        diffSummary: { hasCanvasChanges: false },
        detailedDiff: { canvasChanges: false },
        diffSize: 100,
        similarityScore: 0.9,
        processingTimeMs: 10,
        createdBy: mockUserId,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      };
      
      mockDb.query.mockResolvedValueOnce({ rows: [cachedComparison] });

      const request = {
        versionAId: 'version-a-id',
        versionBId: 'version-b-id',
        comparisonType: 'full' as const,
      };

      const result = await versionService.compareVersions(mockWhiteboardId, mockUserId, request);

      expect(result.id).toBe('cached-comparison');
      expect(mockDb.query).toHaveBeenCalledTimes(1); // Only cache check, no computation
    });
  });
});