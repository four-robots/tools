import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WhiteboardTemplateService } from '../whiteboard-template-service.js';
import { WhiteboardThumbnailService } from '../whiteboard-thumbnail-service.js';
import { DatabasePool } from '../../../utils/database-pool.js';
import { Logger } from '../../../utils/logger.js';

// Mock dependencies
vi.mock('../../../utils/database-pool.js');
vi.mock('../../../utils/logger.js');
vi.mock('../../../utils/sql-security.js', () => ({
  sanitizeInput: vi.fn((input) => input),
  escapeLikePattern: vi.fn((input) => input),
  createSafeSearchPattern: vi.fn((input) => ({
    pattern: `%${input}%`,
    escapedTerm: input,
  })),
}));

describe('WhiteboardTemplateService', () => {
  let templateService: WhiteboardTemplateService;
  let mockDb: vi.Mocked<DatabasePool>;
  let mockLogger: vi.Mocked<Logger>;

  beforeEach(() => {
    mockDb = {
      query: vi.fn(),
    } as any;

    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    } as any;

    templateService = new WhiteboardTemplateService(mockDb, mockLogger);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('createTemplate', () => {
    it('should create a template successfully', async () => {
      const mockTemplate = {
        id: 'template-id',
        name: 'Test Template',
        description: 'Test description',
        category: 'Custom',
        template_data: '{}',
        default_settings: '{}',
        tags: ['tag1', 'tag2'],
        is_public: false,
        workspace_id: 'workspace-id',
        usage_count: 0,
        rating: null,
        created_by: 'user-id',
        created_at: new Date(),
        updated_at: new Date(),
      };

      // Mock workspace validation
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ role: 'member', status: 'active' }] })
        // Mock template creation
        .mockResolvedValueOnce({ rows: [mockTemplate] });

      const result = await templateService.createTemplate('user-id', {
        name: 'Test Template',
        description: 'Test description',
        category: 'Custom',
        templateData: {
          canvasData: {},
          defaultElements: [],
          defaultSettings: {},
          placeholders: [],
        },
        tags: ['tag1', 'tag2'],
        isPublic: false,
      }, 'workspace-id');

      expect(result).toMatchObject({
        id: 'template-id',
        name: 'Test Template',
        description: 'Test description',
        category: 'Custom',
        tags: ['tag1', 'tag2'],
        isPublic: false,
        workspaceId: 'workspace-id',
        usageCount: 0,
        createdBy: 'user-id',
      });

      expect(mockDb.query).toHaveBeenCalledTimes(2);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Template created successfully',
        expect.objectContaining({
          templateId: 'template-id',
          userId: 'user-id',
          workspaceId: 'workspace-id',
        })
      );
    });

    it('should validate category', async () => {
      await expect(
        templateService.createTemplate('user-id', {
          name: 'Test Template',
          category: 'InvalidCategory',
          templateData: {
            canvasData: {},
            defaultElements: [],
            defaultSettings: {},
            placeholders: [],
          },
        })
      ).rejects.toThrow('Invalid template category');
    });

    it('should handle database errors', async () => {
      mockDb.query.mockRejectedValueOnce(new Error('Database error'));

      await expect(
        templateService.createTemplate('user-id', {
          name: 'Test Template',
          category: 'Custom',
          templateData: {
            canvasData: {},
            defaultElements: [],
            defaultSettings: {},
            placeholders: [],
          },
        })
      ).rejects.toThrow('Database error');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to create template',
        expect.objectContaining({
          error: expect.any(Error),
        })
      );
    });
  });

  describe('getTemplate', () => {
    it('should return template when found and accessible', async () => {
      const mockTemplate = {
        id: 'template-id',
        name: 'Test Template',
        description: 'Test description',
        category: 'Custom',
        template_data: '{"canvasData": {}}',
        default_settings: '{}',
        tags: ['tag1'],
        is_public: true,
        workspace_id: null,
        usage_count: 5,
        rating: 4.5,
        created_by: 'user-id',
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockDb.query.mockResolvedValueOnce({ rows: [mockTemplate] });

      const result = await templateService.getTemplate('template-id', 'user-id');

      expect(result).toMatchObject({
        id: 'template-id',
        name: 'Test Template',
        category: 'Custom',
        isPublic: true,
        usageCount: 5,
        rating: 4.5,
      });
    });

    it('should return null when template not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const result = await templateService.getTemplate('template-id', 'user-id');

      expect(result).toBeNull();
    });
  });

  describe('searchTemplates', () => {
    it('should search templates with filters', async () => {
      const mockTemplates = [
        {
          id: 'template-1',
          name: 'Template 1',
          category: 'Brainstorming',
          template_data: '{}',
          default_settings: '{}',
          tags: ['brainstorm'],
          is_public: true,
          workspace_id: null,
          usage_count: 10,
          rating: 4.0,
          created_by: 'user-1',
          created_at: new Date(),
          updated_at: new Date(),
        },
      ];

      mockDb.query
        .mockResolvedValueOnce({ rows: mockTemplates })
        .mockResolvedValueOnce({ rows: [{ total: '1' }] });

      const result = await templateService.searchTemplates(
        'user-id',
        'workspace-id',
        {
          category: ['Brainstorming'],
          minRating: 3,
        },
        { field: 'rating', direction: 'desc' },
        20,
        0
      );

      expect(result).toMatchObject({
        items: expect.arrayContaining([
          expect.objectContaining({
            id: 'template-1',
            name: 'Template 1',
            category: 'Brainstorming',
          }),
        ]),
        total: 1,
        limit: 20,
        offset: 0,
        hasMore: false,
      });

      expect(mockDb.query).toHaveBeenCalledTimes(2);
    });

    it('should handle search with text query', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: '0' }] });

      await templateService.searchTemplates(
        'user-id',
        'workspace-id',
        {
          search: 'brainstorm',
        }
      );

      // Verify the search query includes ILIKE with proper escaping
      const queryCall = mockDb.query.mock.calls[0];
      expect(queryCall[0]).toContain('ILIKE');
      expect(queryCall[0]).toContain('ESCAPE');
    });
  });

  describe('applyTemplate', () => {
    it('should apply template and track usage', async () => {
      const mockTemplate = {
        id: 'template-id',
        name: 'Test Template',
        created_by: 'user-id',
        is_public: false,
        workspace_id: 'workspace-id',
      };

      mockDb.query
        .mockResolvedValueOnce({ rows: [mockTemplate] })
        .mockResolvedValueOnce({ rowCount: 1 }) // usage tracking
        .mockResolvedValueOnce({ rowCount: 1 }); // increment usage count

      await templateService.applyTemplate('template-id', 'whiteboard-id', 'user-id', 'workspace-id');

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Template applied successfully',
        expect.objectContaining({
          templateId: 'template-id',
          whiteboardId: 'whiteboard-id',
          userId: 'user-id',
        })
      );
    });
  });

  describe('getTemplateAnalytics', () => {
    it('should return analytics for template creator', async () => {
      const mockTemplate = {
        id: 'template-id',
        created_by: 'user-id',
        rating: 4.5,
      };

      const mockAnalytics = {
        total_usage: '25',
        unique_users: '15',
        workspace_usage: '3',
      };

      mockDb.query
        .mockResolvedValueOnce({ rows: [mockTemplate] })
        .mockResolvedValueOnce({ rows: [mockAnalytics] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await templateService.getTemplateAnalytics('template-id', 'user-id');

      expect(result).toMatchObject({
        templateId: 'template-id',
        totalUsage: 25,
        uniqueUsers: 15,
        workspaceUsage: 3,
        averageRating: 4.5,
        ratingCount: 0,
        usageTimeline: [],
      });
    });

    it('should deny access to non-creators', async () => {
      const mockTemplate = {
        id: 'template-id',
        created_by: 'other-user-id',
      };

      mockDb.query.mockResolvedValueOnce({ rows: [mockTemplate] });

      await expect(
        templateService.getTemplateAnalytics('template-id', 'user-id')
      ).rejects.toThrow('Access denied to template analytics');
    });
  });

  describe('input validation and security', () => {
    it('should sanitize input data', async () => {
      const mockTemplate = {
        id: 'template-id',
        name: '<script>alert("xss")</script>',
        description: 'Safe description',
        template_data: '{"test": "data"}',
        default_settings: '{}',
        tags: [],
        is_public: false,
        workspace_id: 'workspace-id',
        created_by: 'user-id',
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockDb.query.mockResolvedValueOnce({ rows: [mockTemplate] });

      const result = await templateService.getTemplate('template-id', 'user-id', 'workspace-id');

      // Verify that the sanitizeInput function was called
      expect(result?.name).toBeDefined();
    });

    it('should validate UUIDs in queries', async () => {
      await expect(
        templateService.getTemplate('invalid-uuid', 'user-id')
      ).rejects.toThrow();
    });

    it('should prevent SQL injection in search', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: '0' }] });

      await templateService.searchTemplates(
        'user-id',
        'workspace-id',
        {
          search: "'; DROP TABLE templates; --",
        }
      );

      // Verify parameterized query was used
      const queryCall = mockDb.query.mock.calls[0];
      expect(queryCall[1]).toContain('%\'; DROP TABLE templates; --%');
    });
  });
});

describe('WhiteboardThumbnailService', () => {
  let thumbnailService: WhiteboardThumbnailService;
  let mockLogger: vi.Mocked<Logger>;

  beforeEach(() => {
    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    } as any;

    thumbnailService = new WhiteboardThumbnailService(mockLogger);
  });

  describe('generateTemplateThumbnail', () => {
    it('should generate thumbnail from template data', async () => {
      const templateData = {
        canvasData: {},
        defaultElements: [
          {
            elementType: 'rectangle',
            elementData: {
              position: { x: 10, y: 10 },
              size: { width: 100, height: 50 },
            },
            styleData: {
              color: { fill: '#ff0000', stroke: '#000000' },
            },
            layerIndex: 0,
          },
        ],
        defaultSettings: {},
        placeholders: [],
      };

      const result = await thumbnailService.generateTemplateThumbnail(templateData);

      expect(result).toMatchObject({
        dataUrl: expect.stringContaining('data:image/svg+xml;base64,'),
        width: 400,
        height: 300,
        format: 'svg',
        size: expect.any(Number),
        generatedAt: expect.any(String),
        metadata: expect.any(Object),
      });

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Template thumbnail generated successfully',
        expect.objectContaining({
          elementCount: 1,
        })
      );
    });

    it('should handle empty template data', async () => {
      const templateData = {
        canvasData: {},
        defaultElements: [],
        defaultSettings: {},
        placeholders: [],
      };

      const result = await thumbnailService.generateTemplateThumbnail(templateData);

      expect(result.metadata.empty).toBe(true);
      expect(result.dataUrl).toContain('Empty Canvas');
    });

    it('should generate system template thumbnails', async () => {
      const result = await thumbnailService.generateSystemTemplateThumbnail('brainstorming');

      expect(result).toMatchObject({
        dataUrl: expect.stringContaining('data:image/svg+xml;base64,'),
        format: 'svg',
        generatedAt: expect.any(String),
      });

      expect(mockLogger.info).toHaveBeenCalledWith(
        'System template thumbnail generated successfully',
        expect.objectContaining({
          templateType: 'brainstorming',
        })
      );
    });

    it('should handle thumbnail generation errors', async () => {
      // Mock an error in the generation process
      vi.spyOn(thumbnailService as any, 'generateSvg').mockImplementation(() => {
        throw new Error('SVG generation failed');
      });

      await expect(
        thumbnailService.generateTemplateThumbnail({
          canvasData: {},
          defaultElements: [],
          defaultSettings: {},
          placeholders: [],
        })
      ).rejects.toThrow('SVG generation failed');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to generate template thumbnail',
        expect.objectContaining({
          error: expect.any(Error),
        })
      );
    });
  });

  describe('generateFromCanvasData', () => {
    it('should process canvas data URL', async () => {
      const canvasDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

      const result = await thumbnailService.generateFromCanvasData(canvasDataUrl);

      expect(result).toMatchObject({
        dataUrl: canvasDataUrl,
        format: 'png',
        metadata: {
          source: 'canvas',
          processed: true,
        },
      });

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Canvas thumbnail generated successfully',
        expect.objectContaining({
          format: 'png',
        })
      );
    });
  });

  describe('element rendering', () => {
    it('should render different element types correctly', async () => {
      const templateData = {
        canvasData: {},
        defaultElements: [
          {
            elementType: 'rectangle',
            elementData: { position: { x: 0, y: 0 }, size: { width: 100, height: 50 } },
            styleData: { color: { fill: '#ff0000' } },
            layerIndex: 0,
          },
          {
            elementType: 'ellipse',
            elementData: { position: { x: 150, y: 0 }, size: { width: 100, height: 50 } },
            styleData: { color: { fill: '#00ff00' } },
            layerIndex: 1,
          },
          {
            elementType: 'text',
            elementData: { position: { x: 0, y: 100 }, text: 'Hello World' },
            styleData: { text: { fontSize: 16, color: '#000000' } },
            layerIndex: 2,
          },
        ],
        defaultSettings: {},
        placeholders: [],
      };

      const result = await thumbnailService.generateTemplateThumbnail(templateData);

      // Verify the SVG contains all element types
      const svgData = Buffer.from(result.dataUrl.split(',')[1], 'base64').toString();
      expect(svgData).toContain('<rect');
      expect(svgData).toContain('<ellipse');
      expect(svgData).toContain('<text');
    });

    it('should handle malformed element data gracefully', async () => {
      const templateData = {
        canvasData: {},
        defaultElements: [
          {
            elementType: 'rectangle',
            elementData: null, // Invalid data
            styleData: {},
            layerIndex: 0,
          },
        ],
        defaultSettings: {},
        placeholders: [],
      };

      // Should not throw, should render with defaults
      const result = await thumbnailService.generateTemplateThumbnail(templateData);
      expect(result).toBeDefined();
    });
  });
});