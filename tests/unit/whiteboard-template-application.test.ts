/**
 * Tests for Whiteboard Template Application Implementation
 * 
 * Tests the critical WB-007 template application functionality that was
 * identified by the code-quality-reviewer as incomplete.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WhiteboardService } from '../../core/src/services/whiteboard/whiteboard-service.js';
import { WhiteboardTemplateService } from '../../core/src/services/whiteboard/whiteboard-template-service.js';
import { DatabasePool } from '../../core/src/utils/database-pool.js';
import { Logger } from '../../core/src/utils/logger.js';
import { randomUUID } from 'crypto';

// Mock database and logger
const mockDb = {
  query: vi.fn(),
} as unknown as DatabasePool;

const mockLogger = {
  info: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
} as unknown as Logger;

describe('WhiteboardService - Template Application', () => {
  let whiteboardService: WhiteboardService;
  let templateService: WhiteboardTemplateService;

  const mockUserId = randomUUID();
  const mockWhiteboardId = randomUUID();
  const mockTemplateId = randomUUID();
  const mockWorkspaceId = randomUUID();

  beforeEach(() => {
    vi.clearAllMocks();
    whiteboardService = new WhiteboardService(mockDb, mockLogger);
    templateService = new WhiteboardTemplateService(mockDb, mockLogger);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Template Application Integration', () => {
    it('should successfully apply a template with basic elements', async () => {
      // Mock whiteboard details
      (mockDb.query as any).mockImplementation((query: string, params: any[]) => {
        if (query.includes('SELECT w.*')) {
          return {
            rows: [{
              id: mockWhiteboardId,
              workspace_id: mockWorkspaceId,
              name: 'Test Whiteboard',
              canvas_data: JSON.stringify({}),
              version: 1,
              created_by: mockUserId,
            }]
          };
        }
        
        if (query.includes('whiteboard_permissions')) {
          return { rows: [{ can_edit: true, element_permissions: null }] };
        }

        if (query.includes('whiteboard_templates')) {
          return {
            rows: [{
              id: mockTemplateId,
              name: 'Test Template',
              template_data: JSON.stringify({
                canvasData: { background: { color: '#ffffff' } },
                defaultElements: [
                  {
                    elementType: 'rectangle',
                    elementData: {
                      position: { x: 100, y: 100 },
                      size: { width: 200, height: 150 },
                      bounds: { x: 100, y: 100, width: 200, height: 150 }
                    },
                    styleData: {
                      color: { fill: '#ff0000', stroke: '#000000' }
                    },
                    layerIndex: 0
                  },
                  {
                    elementType: 'text',
                    elementData: {
                      position: { x: 300, y: 200 },
                      text: 'Template Text',
                      bounds: { x: 300, y: 200, width: 150, height: 50 }
                    },
                    styleData: {
                      text: { fontSize: 16, color: '#000000' }
                    },
                    layerIndex: 1
                  }
                ],
                defaultSettings: {},
                placeholders: []
              }),
              created_by: mockUserId,
              workspace_id: mockWorkspaceId
            }]
          };
        }

        if (query.includes('INSERT INTO whiteboard_elements')) {
          return { rowCount: 1 };
        }

        if (query.includes('UPDATE whiteboards')) {
          return { rowCount: 1 };
        }

        if (query.includes('whiteboard_activity_log')) {
          return { rowCount: 1 };
        }

        return { rows: [], rowCount: 0 };
      });

      // Create a public method to test the private applyTemplate method
      const result = await (whiteboardService as any).applyTemplate(
        mockWhiteboardId,
        mockTemplateId,
        mockUserId
      );

      expect(result.success).toBe(true);
      expect(result.elementsCreated).toHaveLength(2);
      expect(result.errors).toBeUndefined();

      // Verify database interactions
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO whiteboard_elements'),
        expect.any(Array)
      );
    });

    it('should handle template application with positioning and scaling', async () => {
      // Mock basic responses
      (mockDb.query as any).mockImplementation((query: string) => {
        if (query.includes('SELECT w.*')) {
          return {
            rows: [{
              id: mockWhiteboardId,
              workspace_id: mockWorkspaceId,
              canvas_data: JSON.stringify({}),
              version: 1,
              created_by: mockUserId,
            }]
          };
        }

        if (query.includes('whiteboard_permissions')) {
          return { rows: [{ can_edit: true }] };
        }

        if (query.includes('whiteboard_templates')) {
          return {
            rows: [{
              id: mockTemplateId,
              name: 'Positioned Template',
              template_data: JSON.stringify({
                canvasData: {},
                defaultElements: [{
                  elementType: 'rectangle',
                  elementData: {
                    position: { x: 0, y: 0 },
                    size: { width: 100, height: 100 },
                    bounds: { x: 0, y: 0, width: 100, height: 100 }
                  },
                  styleData: {},
                  layerIndex: 0
                }],
                defaultSettings: {},
                placeholders: []
              })
            }]
          };
        }

        return { rows: [], rowCount: 1 };
      });

      const options = {
        position: { x: 200, y: 150 },
        scale: 2.0
      };

      const result = await (whiteboardService as any).applyTemplate(
        mockWhiteboardId,
        mockTemplateId,
        mockUserId,
        options
      );

      expect(result.success).toBe(true);
      expect(result.elementsCreated).toHaveLength(1);

      // Verify the element was transformed correctly
      const insertCall = (mockDb.query as any).mock.calls.find((call: any[]) =>
        call[0].includes('INSERT INTO whiteboard_elements')
      );
      
      expect(insertCall).toBeDefined();
      const elementData = JSON.parse(insertCall[1][3]); // element_data parameter
      
      // Position should be: (0 * 2) + 200 = 200, (0 * 2) + 150 = 150
      expect(elementData.position.x).toBe(200);
      expect(elementData.position.y).toBe(150);
      
      // Size should be scaled: 100 * 2 = 200
      expect(elementData.size.width).toBe(200);
      expect(elementData.size.height).toBe(200);
    });

    it('should handle permission denied scenarios', async () => {
      // Mock permission denied
      (mockDb.query as any).mockImplementation((query: string) => {
        if (query.includes('SELECT w.*')) {
          return {
            rows: [{
              id: mockWhiteboardId,
              workspace_id: mockWorkspaceId,
              created_by: 'different-user-id',
              visibility: 'workspace'
            }]
          };
        }

        if (query.includes('whiteboard_permissions')) {
          return { rows: [] }; // No explicit permissions
        }

        if (query.includes('workspace_members')) {
          return { rows: [] }; // Not a workspace member
        }

        return { rows: [] };
      });

      const result = await (whiteboardService as any).applyTemplate(
        mockWhiteboardId,
        mockTemplateId,
        mockUserId
      );

      expect(result.success).toBe(false);
      expect(result.elementsCreated).toHaveLength(0);
      expect(result.errors).toBeDefined();
      expect(result.errors![0]).toContain('edit permissions');
    });

    it('should handle template not found scenarios', async () => {
      // Mock whiteboard exists but template doesn't
      (mockDb.query as any).mockImplementation((query: string) => {
        if (query.includes('SELECT w.*')) {
          return {
            rows: [{
              id: mockWhiteboardId,
              workspace_id: mockWorkspaceId,
              created_by: mockUserId,
            }]
          };
        }

        if (query.includes('whiteboard_permissions')) {
          return { rows: [{ can_edit: true }] };
        }

        if (query.includes('whiteboard_templates')) {
          return { rows: [] }; // Template not found
        }

        return { rows: [] };
      });

      const result = await (whiteboardService as any).applyTemplate(
        mockWhiteboardId,
        mockTemplateId,
        mockUserId
      );

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0]).toContain('Template not found');
    });

    it('should handle template with no elements', async () => {
      // Mock template with no elements
      (mockDb.query as any).mockImplementation((query: string) => {
        if (query.includes('SELECT w.*')) {
          return {
            rows: [{
              id: mockWhiteboardId,
              workspace_id: mockWorkspaceId,
              created_by: mockUserId,
            }]
          };
        }

        if (query.includes('whiteboard_permissions')) {
          return { rows: [{ can_edit: true }] };
        }

        if (query.includes('whiteboard_templates')) {
          return {
            rows: [{
              id: mockTemplateId,
              template_data: JSON.stringify({
                canvasData: {},
                defaultElements: [], // No elements
                defaultSettings: {},
                placeholders: []
              })
            }]
          };
        }

        return { rows: [] };
      });

      const result = await (whiteboardService as any).applyTemplate(
        mockWhiteboardId,
        mockTemplateId,
        mockUserId
      );

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0]).toContain('no elements to apply');
    });

    it('should handle rollback on partial failure', async () => {
      let insertCount = 0;
      
      // Mock partial success - first element succeeds, second fails
      (mockDb.query as any).mockImplementation((query: string, params: any[]) => {
        if (query.includes('SELECT w.*')) {
          return {
            rows: [{
              id: mockWhiteboardId,
              workspace_id: mockWorkspaceId,
              created_by: mockUserId,
              version: 1,
            }]
          };
        }

        if (query.includes('whiteboard_permissions')) {
          return { rows: [{ can_edit: true }] };
        }

        if (query.includes('whiteboard_templates')) {
          return {
            rows: [{
              id: mockTemplateId,
              template_data: JSON.stringify({
                canvasData: {},
                defaultElements: [
                  {
                    elementType: 'rectangle',
                    elementData: { position: { x: 0, y: 0 } },
                    styleData: {},
                    layerIndex: 0
                  },
                  {
                    elementType: 'text',
                    elementData: { position: { x: 100, y: 100 } },
                    styleData: {},
                    layerIndex: 1
                  }
                ],
                defaultSettings: {},
                placeholders: []
              })
            }]
          };
        }

        if (query.includes('INSERT INTO whiteboard_elements')) {
          insertCount++;
          if (insertCount === 2) {
            throw new Error('Database error on second element');
          }
          return { rowCount: 1 };
        }

        if (query.includes('DELETE FROM whiteboard_elements')) {
          return { rowCount: 1 }; // Rollback successful
        }

        return { rows: [], rowCount: 1 };
      });

      const result = await (whiteboardService as any).applyTemplate(
        mockWhiteboardId,
        mockTemplateId,
        mockUserId
      );

      // Should fail due to second element error
      expect(result.success).toBe(false);
      expect(result.elementsCreated).toHaveLength(0); // Rolled back
      expect(result.errors).toBeDefined();

      // Verify rollback was called
      const deleteCall = (mockDb.query as any).mock.calls.find((call: any[]) =>
        call[0].includes('DELETE FROM whiteboard_elements')
      );
      expect(deleteCall).toBeDefined();
    });
  });

  describe('Element Data Transformation', () => {
    it('should correctly transform line element coordinates', () => {
      const elementData = {
        start: { x: 10, y: 20 },
        end: { x: 50, y: 60 }
      };

      const positionOffset = { x: 100, y: 200 };
      const scale = 2;

      const result = (whiteboardService as any).transformTemplateElementData(
        elementData,
        positionOffset,
        scale
      );

      // start: (10 * 2) + 100 = 120, (20 * 2) + 200 = 240
      expect(result.start.x).toBe(120);
      expect(result.start.y).toBe(240);
      
      // end: (50 * 2) + 100 = 200, (60 * 2) + 200 = 320
      expect(result.end.x).toBe(200);
      expect(result.end.y).toBe(320);
    });

    it('should correctly transform freehand drawing points', () => {
      const elementData = {
        points: [
          { x: 0, y: 0 },
          { x: 10, y: 20 },
          { x: 30, y: 40 }
        ]
      };

      const positionOffset = { x: 50, y: 75 };
      const scale = 1.5;

      const result = (whiteboardService as any).transformTemplateElementData(
        elementData,
        positionOffset,
        scale
      );

      expect(result.points).toHaveLength(3);
      expect(result.points[0]).toEqual({ x: 50, y: 75 }); // (0 * 1.5) + 50
      expect(result.points[1]).toEqual({ x: 65, y: 105 }); // (10 * 1.5) + 50, (20 * 1.5) + 75
      expect(result.points[2]).toEqual({ x: 95, y: 135 }); // (30 * 1.5) + 50, (40 * 1.5) + 75
    });

    it('should handle complex element data without errors', () => {
      const elementData = {
        position: { x: 100, y: 200 },
        bounds: { x: 100, y: 200, width: 300, height: 150 },
        size: { width: 300, height: 150 },
        customProperty: 'should be preserved',
        nestedObject: {
          inner: { x: 25, y: 50 } // Should not be transformed
        }
      };

      const result = (whiteboardService as any).transformTemplateElementData(
        elementData,
        { x: 50, y: 100 },
        2
      );

      expect(result.position.x).toBe(250); // (100 * 2) + 50
      expect(result.position.y).toBe(500); // (200 * 2) + 100
      expect(result.bounds.width).toBe(600); // 300 * 2
      expect(result.size.height).toBe(300); // 150 * 2
      expect(result.customProperty).toBe('should be preserved');
      expect(result.nestedObject.inner.x).toBe(25); // Not transformed
    });
  });

  describe('Permission Validation', () => {
    it('should validate owner permissions correctly', async () => {
      (mockDb.query as any).mockImplementation((query: string, params: any[]) => {
        if (query.includes('whiteboard_permissions')) {
          return { rows: [] }; // No explicit permissions
        }

        if (query.includes('SELECT w.created_by')) {
          return {
            rows: [{
              created_by: mockUserId, // User is the owner
              workspace_id: mockWorkspaceId,
              visibility: 'workspace'
            }]
          };
        }

        return { rows: [] };
      });

      const hasPermission = await (whiteboardService as any).hasUserEditPermission(
        mockWhiteboardId,
        mockUserId
      );

      expect(hasPermission).toBe(true);
    });

    it('should validate workspace member permissions', async () => {
      (mockDb.query as any).mockImplementation((query: string, params: any[]) => {
        if (query.includes('whiteboard_permissions')) {
          return { rows: [] }; // No explicit permissions
        }

        if (query.includes('SELECT w.created_by')) {
          return {
            rows: [{
              created_by: 'different-user',
              workspace_id: mockWorkspaceId,
              visibility: 'workspace'
            }]
          };
        }

        if (query.includes('workspace_members')) {
          return {
            rows: [{
              role: 'editor' // User is workspace editor
            }]
          };
        }

        return { rows: [] };
      });

      const hasPermission = await (whiteboardService as any).hasUserEditPermission(
        mockWhiteboardId,
        mockUserId
      );

      expect(hasPermission).toBe(true);
    });

    it('should deny access for non-members of private workspace', async () => {
      (mockDb.query as any).mockImplementation((query: string) => {
        if (query.includes('whiteboard_permissions')) {
          return { rows: [] }; // No explicit permissions
        }

        if (query.includes('SELECT w.created_by')) {
          return {
            rows: [{
              created_by: 'different-user',
              workspace_id: mockWorkspaceId,
              visibility: 'workspace'
            }]
          };
        }

        if (query.includes('workspace_members')) {
          return { rows: [] }; // Not a workspace member
        }

        return { rows: [] };
      });

      const hasPermission = await (whiteboardService as any).hasUserEditPermission(
        mockWhiteboardId,
        mockUserId
      );

      expect(hasPermission).toBe(false);
    });
  });

  describe('Error Handling and Logging', () => {
    it('should log template application progress appropriately', async () => {
      // Mock successful scenario
      (mockDb.query as any).mockImplementation((query: string) => {
        if (query.includes('SELECT w.*')) {
          return {
            rows: [{
              id: mockWhiteboardId,
              workspace_id: mockWorkspaceId,
              created_by: mockUserId,
              version: 1,
            }]
          };
        }

        if (query.includes('whiteboard_templates')) {
          return {
            rows: [{
              id: mockTemplateId,
              name: 'Log Test Template',
              template_data: JSON.stringify({
                canvasData: {},
                defaultElements: [{
                  elementType: 'rectangle',
                  elementData: { position: { x: 0, y: 0 } },
                  styleData: {},
                  layerIndex: 0
                }],
                defaultSettings: {},
                placeholders: []
              })
            }]
          };
        }

        return { rows: [{ can_edit: true }], rowCount: 1 };
      });

      await (whiteboardService as any).applyTemplate(
        mockWhiteboardId,
        mockTemplateId,
        mockUserId
      );

      // Verify logging
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Starting template application',
        expect.objectContaining({
          whiteboardId: mockWhiteboardId,
          templateId: mockTemplateId,
          userId: mockUserId
        })
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Template application completed',
        expect.objectContaining({
          success: true,
          elementsCreated: 1
        })
      );
    });

    it('should handle and log database errors gracefully', async () => {
      // Mock database error
      (mockDb.query as any).mockImplementation(() => {
        throw new Error('Database connection failed');
      });

      const result = await (whiteboardService as any).applyTemplate(
        mockWhiteboardId,
        mockTemplateId,
        mockUserId
      );

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0]).toContain('Database connection failed');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Template application failed',
        expect.objectContaining({
          whiteboardId: mockWhiteboardId,
          templateId: mockTemplateId
        })
      );
    });
  });
});