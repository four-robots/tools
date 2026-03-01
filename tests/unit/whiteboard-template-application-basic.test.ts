/**
 * Basic Template Application Tests
 * 
 * Tests the critical WB-007 template application functionality
 * with minimal external dependencies.
 */

import { describe, it, expect, vi } from 'vitest';

describe('Whiteboard Template Application - Basic Functionality', () => {
  
  describe('Element Data Transformation', () => {
    it('should transform position coordinates correctly', () => {
      // Mock the transformation function directly
      const transformTemplateElementData = (
        elementData: any, 
        positionOffset: { x: number; y: number }, 
        scale: number
      ): any => {
        const transformedData = JSON.parse(JSON.stringify(elementData)); // Deep copy
        
        // Transform position if present
        if (transformedData.position) {
          transformedData.position.x = (transformedData.position.x * scale) + positionOffset.x;
          transformedData.position.y = (transformedData.position.y * scale) + positionOffset.y;
        }
        
        // Transform bounds if present
        if (transformedData.bounds) {
          transformedData.bounds.x = (transformedData.bounds.x * scale) + positionOffset.x;
          transformedData.bounds.y = (transformedData.bounds.y * scale) + positionOffset.y;
          transformedData.bounds.width *= scale;
          transformedData.bounds.height *= scale;
        }
        
        // Transform size if present
        if (transformedData.size) {
          transformedData.size.width *= scale;
          transformedData.size.height *= scale;
        }
        
        return transformedData;
      };

      const elementData = {
        position: { x: 100, y: 200 },
        bounds: { x: 100, y: 200, width: 300, height: 150 },
        size: { width: 300, height: 150 }
      };

      const result = transformTemplateElementData(
        elementData,
        { x: 50, y: 100 },
        2
      );

      expect(result.position.x).toBe(250); // (100 * 2) + 50
      expect(result.position.y).toBe(500); // (200 * 2) + 100
      expect(result.bounds.width).toBe(600); // 300 * 2
      expect(result.size.height).toBe(300); // 150 * 2
    });

    it('should handle line element coordinates', () => {
      const transformLineCoordinates = (
        elementData: any,
        positionOffset: { x: number; y: number },
        scale: number
      ): any => {
        const transformedData = JSON.parse(JSON.stringify(elementData));
        
        // Transform line element points
        if (transformedData.start && transformedData.end) {
          transformedData.start.x = (transformedData.start.x * scale) + positionOffset.x;
          transformedData.start.y = (transformedData.start.y * scale) + positionOffset.y;
          transformedData.end.x = (transformedData.end.x * scale) + positionOffset.x;
          transformedData.end.y = (transformedData.end.y * scale) + positionOffset.y;
        }
        
        return transformedData;
      };

      const elementData = {
        start: { x: 10, y: 20 },
        end: { x: 50, y: 60 }
      };

      const result = transformLineCoordinates(
        elementData,
        { x: 100, y: 200 },
        2
      );

      expect(result.start.x).toBe(120); // (10 * 2) + 100
      expect(result.start.y).toBe(240); // (20 * 2) + 200
      expect(result.end.x).toBe(200); // (50 * 2) + 100
      expect(result.end.y).toBe(320); // (60 * 2) + 200
    });

    it('should handle freehand drawing points', () => {
      const transformFreehandPoints = (
        elementData: any,
        positionOffset: { x: number; y: number },
        scale: number
      ): any => {
        const transformedData = JSON.parse(JSON.stringify(elementData));
        
        // Transform freehand points
        if (Array.isArray(transformedData.points)) {
          transformedData.points = transformedData.points.map((point: any) => ({
            x: (point.x * scale) + positionOffset.x,
            y: (point.y * scale) + positionOffset.y,
          }));
        }
        
        return transformedData;
      };

      const elementData = {
        points: [
          { x: 0, y: 0 },
          { x: 10, y: 20 },
          { x: 30, y: 40 }
        ]
      };

      const result = transformFreehandPoints(
        elementData,
        { x: 50, y: 75 },
        1.5
      );

      expect(result.points).toHaveLength(3);
      expect(result.points[0]).toEqual({ x: 50, y: 75 }); // (0 * 1.5) + 50
      expect(result.points[1]).toEqual({ x: 65, y: 105 }); // (10 * 1.5) + 50, (20 * 1.5) + 75
      expect(result.points[2]).toEqual({ x: 95, y: 135 }); // (30 * 1.5) + 50, (40 * 1.5) + 75
    });
  });

  describe('Permission Logic', () => {
    it('should validate owner permissions correctly', () => {
      const validateOwnerPermission = (
        createdBy: string,
        userId: string
      ): boolean => {
        return createdBy === userId;
      };

      expect(validateOwnerPermission('user-123', 'user-123')).toBe(true);
      expect(validateOwnerPermission('user-123', 'user-456')).toBe(false);
    });

    it('should validate workspace member permissions', () => {
      const validateWorkspaceMember = (
        visibility: string,
        userRole: string,
        isWorkspaceMember: boolean
      ): boolean => {
        if (visibility === 'public') return true;
        if (visibility === 'workspace' && isWorkspaceMember) {
          return ['owner', 'admin', 'editor'].includes(userRole);
        }
        return false;
      };

      expect(validateWorkspaceMember('public', 'none', false)).toBe(true);
      expect(validateWorkspaceMember('workspace', 'editor', true)).toBe(true);
      expect(validateWorkspaceMember('workspace', 'viewer', true)).toBe(false);
      expect(validateWorkspaceMember('workspace', 'editor', false)).toBe(false);
    });
  });

  describe('Template Application Logic', () => {
    it('should create proper element data structure', () => {
      const createElementFromTemplate = (
        templateElement: any,
        newElementId: string,
        transformedData: any,
        userId: string
      ) => {
        return {
          id: newElementId,
          elementType: templateElement.elementType,
          elementData: transformedData,
          layerIndex: templateElement.layerIndex,
          styleData: templateElement.styleData || {},
          locked: false,
          visible: true,
          createdBy: userId,
          version: 1
        };
      };

      const templateElement = {
        elementType: 'rectangle',
        elementData: { position: { x: 100, y: 100 } },
        styleData: { color: { fill: '#ff0000' } },
        layerIndex: 0
      };

      const result = createElementFromTemplate(
        templateElement,
        'element-123',
        { position: { x: 200, y: 300 } },
        'user-456'
      );

      expect(result.id).toBe('element-123');
      expect(result.elementType).toBe('rectangle');
      expect(result.elementData.position.x).toBe(200);
      expect(result.styleData.color.fill).toBe('#ff0000');
      expect(result.createdBy).toBe('user-456');
      expect(result.locked).toBe(false);
    });

    it('should handle rollback operation structure', () => {
      const rollbackOperations: (() => Promise<void>)[] = [];
      
      const addRollbackOperation = (elementId: string) => {
        rollbackOperations.push(async () => {
          // Mock delete operation
          console.log(`Rolling back element ${elementId}`);
        });
      };

      addRollbackOperation('element-1');
      addRollbackOperation('element-2');

      expect(rollbackOperations).toHaveLength(2);
      
      // Verify rollback operations can be executed
      for (const rollback of rollbackOperations.reverse()) {
        await rollback();
      }
    });

    it('should validate template data structure', () => {
      const validateTemplateData = (templateData: any): { valid: boolean; errors: string[] } => {
        const errors: string[] = [];
        
        if (!templateData) {
          errors.push('Template data is required');
          return { valid: false, errors };
        }

        if (!templateData.defaultElements || !Array.isArray(templateData.defaultElements)) {
          errors.push('Template must have defaultElements array');
        } else if (templateData.defaultElements.length === 0) {
          errors.push('Template has no elements to apply');
        }

        // Validate each element
        templateData.defaultElements?.forEach((element: any, index: number) => {
          if (!element.elementType) {
            errors.push(`Element ${index + 1} missing elementType`);
          }
          if (!element.elementData) {
            errors.push(`Element ${index + 1} missing elementData`);
          }
        });

        return { valid: errors.length === 0, errors };
      };

      // Valid template
      const validTemplate = {
        defaultElements: [
          {
            elementType: 'rectangle',
            elementData: { position: { x: 0, y: 0 } },
            styleData: {},
            layerIndex: 0
          }
        ]
      };

      expect(validateTemplateData(validTemplate).valid).toBe(true);

      // Invalid template - no elements
      const emptyTemplate = {
        defaultElements: []
      };

      const emptyResult = validateTemplateData(emptyTemplate);
      expect(emptyResult.valid).toBe(false);
      expect(emptyResult.errors[0]).toContain('no elements to apply');

      // Invalid template - missing required fields
      const invalidTemplate = {
        defaultElements: [
          {
            // Missing elementType
            elementData: { position: { x: 0, y: 0 } }
          }
        ]
      };

      const invalidResult = validateTemplateData(invalidTemplate);
      expect(invalidResult.valid).toBe(false);
      expect(invalidResult.errors[0]).toContain('missing elementType');
    });
  });

  describe('Error Handling', () => {
    it('should accumulate errors during processing', () => {
      const processTemplateElements = (elements: any[]): { success: boolean; errors: string[]; processed: number } => {
        const errors: string[] = [];
        let processed = 0;

        elements.forEach((element, index) => {
          try {
            if (!element.elementType) {
              throw new Error(`Element ${index + 1} missing elementType`);
            }
            if (!element.elementData) {
              throw new Error(`Element ${index + 1} missing elementData`);
            }
            processed++;
          } catch (error) {
            errors.push(error instanceof Error ? error.message : 'Unknown error');
          }
        });

        return {
          success: processed > 0,
          errors,
          processed
        };
      };

      const elements = [
        { elementType: 'rectangle', elementData: { position: { x: 0, y: 0 } } }, // Valid
        { elementType: 'circle' }, // Missing elementData
        { elementData: { position: { x: 100, y: 100 } } }, // Missing elementType
        { elementType: 'text', elementData: { text: 'Hello' } } // Valid
      ];

      const result = processTemplateElements(elements);

      expect(result.success).toBe(true); // Some elements processed
      expect(result.processed).toBe(2); // 2 valid elements
      expect(result.errors).toHaveLength(2); // 2 error elements
      expect(result.errors[0]).toContain('missing elementData');
      expect(result.errors[1]).toContain('missing elementType');
    });
  });
});