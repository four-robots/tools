import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { WhiteboardImportService, ImportFormat, ImportOptions } from '../whiteboard-import-service';
import { DatabasePool } from '../../../utils/database-pool';
import { Logger } from '../../../utils/logger';

// jest.Mock dependencies
jest.mock('../../../utils/database-pool');
jest.mock('../../../utils/logger');

describe('WhiteboardImportService', () => {
  let importService: WhiteboardImportService;
  let mockDb: Partial<DatabasePool>;
  let mockLogger: Partial<Logger>;

  const mockUploadedFile = {
    filename: 'test-whiteboard.json',
    originalName: 'Test Whiteboard.json',
    buffer: Buffer.from(JSON.stringify({
      id: 'whiteboard-1',
      name: 'Test Whiteboard',
      elements: [
        {
          id: 'element-1',
          elementType: 'rectangle',
          elementData: { position: { x: 100, y: 100 }, size: { width: 200, height: 150 } },
        }
      ]
    })),
    mimeType: 'application/json',
    size: 1024,
  };

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Setup mock database
    mockDb = {
      query: jest.fn(),
    };

    // Setup mock logger
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };

    // Create import service instance
    importService = new WhiteboardImportService(
      mockDb as DatabasePool,
      mockLogger as Logger
    );
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('createImportJob', () => {
    it('should create a JSON import job successfully', async () => {
      // jest.Mock database responses
      (mockDb.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [{ id: 'workspace-1' }] }) // Workspace validation
        .mockResolvedValueOnce({ 
          rows: [{ 
            id: 'job-1',
            user_id: 'user-1',
            job_type: 'import',
            operation_type: 'json',
            status: 'pending',
            progress: 0,
            created_at: new Date('2024-01-01'),
            updated_at: new Date('2024-01-01'),
          }] 
        });

      const request = {
        workspaceId: 'workspace-1',
        file: mockUploadedFile,
        format: 'json' as ImportFormat,
        options: {
          format: 'json' as const,
          createNewWhiteboard: true,
          preserveIds: false,
          conflictResolution: 'rename' as const,
        },
      };

      const job = await importService.createImportJob('user-1', request);

      expect(job.id).toBe('job-1');
      expect(job.operationType).toBe('json');
      expect(job.status).toBe('pending');
      expect(mockDb.query).toHaveBeenCalledTimes(2);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Import job created',
        expect.objectContaining({
          jobId: 'job-1',
          workspaceId: 'workspace-1',
          format: 'json',
          userId: 'user-1',
        })
      );
    });

    it('should create an image import job with custom options', async () => {
      const imageFile = {
        ...mockUploadedFile,
        filename: 'test-image.png',
        mimeType: 'image/png',
        buffer: Buffer.from('fake-image-data'),
      };

      // jest.Mock database responses
      (mockDb.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [{ id: 'workspace-1' }] })
        .mockResolvedValueOnce({ 
          rows: [{ 
            id: 'job-2',
            user_id: 'user-1',
            job_type: 'import',
            operation_type: 'image',
            status: 'pending',
            progress: 0,
            created_at: new Date('2024-01-01'),
            updated_at: new Date('2024-01-01'),
          }] 
        });

      const request = {
        workspaceId: 'workspace-1',
        file: imageFile,
        format: 'image' as ImportFormat,
        options: {
          format: 'image' as const,
          createNewWhiteboard: true,
          imagePosition: { x: 100, y: 100 },
          imageScale: 1.5,
          generateOCR: true,
        },
      };

      const job = await importService.createImportJob('user-1', request);

      expect(job.id).toBe('job-2');
      expect(job.operationType).toBe('image');
      expect(job.jobOptions.imageScale).toBe(1.5);
      expect(job.jobOptions.generateOCR).toBe(true);
    });

    it('should throw error for invalid workspace access', async () => {
      // jest.Mock database to return no results (no access)
      (mockDb.query as jest.Mock).mockResolvedValueOnce({ rows: [] });

      const request = {
        workspaceId: 'workspace-1',
        file: mockUploadedFile,
        format: 'json' as ImportFormat,
      };

      await expect(
        importService.createImportJob('user-1', request)
      ).rejects.toThrow('Workspace not found or access denied');

      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should handle security scan failure', async () => {
      const maliciousFile = {
        ...mockUploadedFile,
        buffer: Buffer.from('<script>alert("xss")</script>'),
      };

      // jest.Mock workspace validation success
      (mockDb.query as jest.Mock).mockResolvedValueOnce({ rows: [{ id: 'workspace-1' }] });

      // jest.Mock security scan to fail
      const scanFileSpy = jest.spyOn(importService as any, 'scanFileForSecurity')
        .mockResolvedValue({ safe: false, threats: ['XSS'], scanId: 'scan-1' });

      const request = {
        workspaceId: 'workspace-1',
        file: maliciousFile,
        format: 'json' as ImportFormat,
      };

      await expect(
        importService.createImportJob('user-1', request)
      ).rejects.toThrow('File failed security scan');

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'File failed security scan',
        expect.objectContaining({
          threats: ['XSS'],
          scanId: 'scan-1',
        })
      );

      scanFileSpy.mockRestore();
    });

    it('should handle unsupported file format', async () => {
      const unsupportedFile = {
        ...mockUploadedFile,
        filename: 'test.exe',
        mimeType: 'application/octet-stream',
      };

      // jest.Mock workspace validation success
      (mockDb.query as jest.Mock).mockResolvedValueOnce({ rows: [{ id: 'workspace-1' }] });

      const request = {
        workspaceId: 'workspace-1',
        file: unsupportedFile,
        format: 'json' as ImportFormat,
      };

      await expect(
        importService.createImportJob('user-1', request)
      ).rejects.toThrow('Unsupported file format');
    });
  });

  describe('getImportJob', () => {
    it('should retrieve an import job successfully', async () => {
      const mockJobRow = {
        id: 'job-1',
        user_id: 'user-1',
        job_type: 'import',
        operation_type: 'json',
        status: 'completed',
        progress: 100,
        file_path: '/uploads/job-1/test.json',
        file_metadata: JSON.stringify({ filename: 'test.json', size: 1024 }),
        job_options: JSON.stringify({ createNewWhiteboard: true }),
        processing_time_ms: 3000,
        elements_created: ['element-1', 'element-2'],
        whiteboards_created: ['whiteboard-1'],
        created_at: new Date('2024-01-01'),
        updated_at: new Date('2024-01-01'),
      };

      (mockDb.query as jest.Mock).mockResolvedValueOnce({ rows: [mockJobRow] });

      const job = await importService.getImportJob('job-1', 'user-1');

      expect(job).toBeTruthy();
      expect(job!.id).toBe('job-1');
      expect(job!.status).toBe('completed');
      expect(job!.progress).toBe(100);
      expect(job!.elementsCreated).toEqual(['element-1', 'element-2']);
      expect(job!.whiteboardsCreated).toEqual(['whiteboard-1']);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM whiteboard_export_import_jobs'),
        ['job-1', 'user-1']
      );
    });

    it('should return null for non-existent job', async () => {
      (mockDb.query as jest.Mock).mockResolvedValueOnce({ rows: [] });

      const job = await importService.getImportJob('nonexistent-job', 'user-1');

      expect(job).toBeNull();
    });

    it('should handle database errors', async () => {
      const dbError = new Error('Query failed');
      (mockDb.query as jest.Mock).mockRejectedValueOnce(dbError);

      await expect(
        importService.getImportJob('job-1', 'user-1')
      ).rejects.toThrow('Query failed');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to get import job',
        expect.objectContaining({
          error: dbError,
          jobId: 'job-1',
          userId: 'user-1',
        })
      );
    });
  });

  describe('getUserImportJobs', () => {
    it('should retrieve user import jobs with pagination', async () => {
      const mockJobs = [
        {
          id: 'job-1',
          user_id: 'user-1',
          operation_type: 'json',
          status: 'completed',
          progress: 100,
          created_at: new Date('2024-01-01'),
          updated_at: new Date('2024-01-01'),
        },
        {
          id: 'job-2',
          user_id: 'user-1',
          operation_type: 'image',
          status: 'processing',
          progress: 50,
          created_at: new Date('2024-01-02'),
          updated_at: new Date('2024-01-02'),
        },
      ];

      (mockDb.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [{ total: '2' }] }) // Count query
        .mockResolvedValueOnce({ rows: mockJobs }); // Data query

      const result = await importService.getUserImportJobs('user-1', 10, 0);

      expect(result.total).toBe(2);
      expect(result.jobs).toHaveLength(2);
      expect(result.jobs[0].id).toBe('job-1');
      expect(result.jobs[1].id).toBe('job-2');
      expect(mockDb.query).toHaveBeenCalledTimes(2);
    });

    it('should handle empty results', async () => {
      (mockDb.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [{ total: '0' }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await importService.getUserImportJobs('user-1');

      expect(result.total).toBe(0);
      expect(result.jobs).toHaveLength(0);
    });
  });

  describe('cancelImportJob', () => {
    it('should cancel a pending import job', async () => {
      (mockDb.query as jest.Mock).mockResolvedValueOnce({ rowCount: 1 });

      const result = await importService.cancelImportJob('job-1', 'user-1');

      expect(result).toBe(true);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE whiteboard_export_import_jobs'),
        expect.arrayContaining(['cancelled', 'job-1', 'user-1'])
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Import job cancelled',
        expect.objectContaining({ jobId: 'job-1', userId: 'user-1' })
      );
    });

    it('should return false if job cannot be cancelled', async () => {
      (mockDb.query as jest.Mock).mockResolvedValueOnce({ rowCount: 0 });

      const result = await importService.cancelImportJob('job-1', 'user-1');

      expect(result).toBe(false);
      expect(mockLogger.info).not.toHaveBeenCalled();
    });

    it('should handle database errors', async () => {
      const dbError = new Error('Update failed');
      (mockDb.query as jest.Mock).mockRejectedValueOnce(dbError);

      await expect(
        importService.cancelImportJob('job-1', 'user-1')
      ).rejects.toThrow('Update failed');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to cancel import job',
        expect.objectContaining({
          error: dbError,
          jobId: 'job-1',
          userId: 'user-1',
        })
      );
    });
  });

  describe('processImportFile', () => {
    it('should process JSON whiteboard file successfully', async () => {
      const mockWhiteboardData = {
        id: 'whiteboard-1',
        name: 'Test Whiteboard',
        elements: [
          {
            id: 'element-1',
            elementType: 'rectangle',
            elementData: { position: { x: 100, y: 100 } },
          }
        ]
      };

      // jest.Mock file reading
      const readFileSpy = jest.spyOn(importService as any, 'readFileContent')
        .mockResolvedValue(JSON.stringify(mockWhiteboardData));

      // jest.Mock whiteboard creation
      (mockDb.query as jest.Mock)
        .mockResolvedValueOnce({ // Create whiteboard
          rows: [{ 
            id: 'new-whiteboard-1',
            name: 'Test Whiteboard',
            workspace_id: 'workspace-1',
          }]
        })
        .mockResolvedValueOnce({ rowCount: 1 }) // Insert elements
        .mockResolvedValueOnce({ rowCount: 1 }); // Update job

      const result = await importService.processImportFile(
        'job-1',
        'user-1',
        'workspace-1',
        mockUploadedFile,
        {
          format: 'json',
          createNewWhiteboard: true,
          preserveIds: false,
        },
        (progress, message) => {
          // Progress callback
        }
      );

      expect(result.success).toBe(true);
      expect(result.whiteboardsCreated).toEqual(['new-whiteboard-1']);
      expect(result.elementsCreated).toHaveLength(1);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Import job completed successfully',
        expect.objectContaining({ jobId: 'job-1' })
      );

      readFileSpy.mockRestore();
    });

    it('should handle invalid JSON format', async () => {
      const invalidJsonFile = {
        ...mockUploadedFile,
        buffer: Buffer.from('invalid json content'),
      };

      const readFileSpy = jest.spyOn(importService as any, 'readFileContent')
        .mockResolvedValue('invalid json content');

      const result = await importService.processImportFile(
        'job-1',
        'user-1',
        'workspace-1',
        invalidJsonFile,
        { format: 'json' },
        () => {}
      );

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('Invalid JSON format');
      expect(mockLogger.error).toHaveBeenCalled();

      readFileSpy.mockRestore();
    });

    it('should handle SVG import with element conversion', async () => {
      const svgContent = `
        <svg xmlns="http://www.w3.org/2000/svg" width="400" height="300">
          <rect x="50" y="50" width="200" height="100" fill="blue"/>
          <text x="100" y="120" font-size="16">Hello SVG</text>
        </svg>
      `;

      const svgFile = {
        ...mockUploadedFile,
        filename: 'test.svg',
        mimeType: 'image/svg+xml',
        buffer: Buffer.from(svgContent),
      };

      const readFileSpy = jest.spyOn(importService as any, 'readFileContent')
        .mockResolvedValue(svgContent);

      // jest.Mock whiteboard and element creation
      (mockDb.query as jest.Mock)
        .mockResolvedValueOnce({ 
          rows: [{ 
            id: 'new-whiteboard-1',
            name: 'Imported SVG',
            workspace_id: 'workspace-1',
          }]
        })
        .mockResolvedValueOnce({ rowCount: 2 }) // Insert elements (rect + text)
        .mockResolvedValueOnce({ rowCount: 1 }); // Update job

      const result = await importService.processImportFile(
        'job-1',
        'user-1',
        'workspace-1',
        svgFile,
        { 
          format: 'svg',
          createNewWhiteboard: true,
        },
        () => {}
      );

      expect(result.success).toBe(true);
      expect(result.whiteboardsCreated).toEqual(['new-whiteboard-1']);
      expect(result.elementsCreated?.length).toBeGreaterThan(0);

      readFileSpy.mockRestore();
    });

    it('should handle database errors during processing', async () => {
      const readFileSpy = jest.spyOn(importService as any, 'readFileContent')
        .mockResolvedValue(JSON.stringify({ name: 'Test', elements: [] }));

      const dbError = new Error('Database insert failed');
      (mockDb.query as jest.Mock).mockRejectedValueOnce(dbError);

      const result = await importService.processImportFile(
        'job-1',
        'user-1',
        'workspace-1',
        mockUploadedFile,
        { format: 'json' },
        () => {}
      );

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('Database insert failed');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to process import file',
        expect.objectContaining({ error: dbError })
      );

      readFileSpy.mockRestore();
    });
  });

  describe('format validation', () => {
    it('should validate JSON import options', async () => {
      (mockDb.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [{ id: 'workspace-1' }] })
        .mockResolvedValueOnce({ 
          rows: [{ 
            id: 'job-1',
            operation_type: 'json',
            job_options: JSON.stringify({
              createNewWhiteboard: false,
              targetWhiteboardId: 'existing-wb-1',
              preserveIds: true,
              conflictResolution: 'overwrite',
            }),
            created_at: new Date(),
            updated_at: new Date(),
          }] 
        });

      const request = {
        workspaceId: 'workspace-1',
        file: mockUploadedFile,
        format: 'json' as ImportFormat,
        options: {
          format: 'json' as const,
          createNewWhiteboard: false,
          targetWhiteboardId: 'existing-wb-1',
          preserveIds: true,
          conflictResolution: 'overwrite' as const,
        },
      };

      const job = await importService.createImportJob('user-1', request);
      expect(job.jobOptions.createNewWhiteboard).toBe(false);
      expect(job.jobOptions.targetWhiteboardId).toBe('existing-wb-1');
      expect(job.jobOptions.preserveIds).toBe(true);
      expect(job.jobOptions.conflictResolution).toBe('overwrite');
    });

    it('should validate image import options', async () => {
      const imageFile = {
        ...mockUploadedFile,
        filename: 'test.png',
        mimeType: 'image/png',
      };

      (mockDb.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [{ id: 'workspace-1' }] })
        .mockResolvedValueOnce({ 
          rows: [{ 
            id: 'job-1',
            operation_type: 'image',
            job_options: JSON.stringify({
              imagePosition: { x: 200, y: 300 },
              imageScale: 0.8,
              generateOCR: false,
              preserveAspectRatio: true,
            }),
            created_at: new Date(),
            updated_at: new Date(),
          }] 
        });

      const request = {
        workspaceId: 'workspace-1',
        file: imageFile,
        format: 'image' as ImportFormat,
        options: {
          format: 'image' as const,
          imagePosition: { x: 200, y: 300 },
          imageScale: 0.8,
          generateOCR: false,
          preserveAspectRatio: true,
        },
      };

      const job = await importService.createImportJob('user-1', request);
      expect(job.jobOptions.imagePosition).toEqual({ x: 200, y: 300 });
      expect(job.jobOptions.imageScale).toBe(0.8);
      expect(job.jobOptions.generateOCR).toBe(false);
      expect(job.jobOptions.preserveAspectRatio).toBe(true);
    });
  });

  describe('security validation', () => {
    it('should detect malicious file content', async () => {
      const maliciousFile = {
        ...mockUploadedFile,
        buffer: Buffer.from('<script>alert("malicious")</script>'),
      };

      // jest.Mock workspace validation
      (mockDb.query as jest.Mock).mockResolvedValueOnce({ rows: [{ id: 'workspace-1' }] });

      // jest.Mock security scanner to detect threat
      const scanFileSpy = jest.spyOn(importService as any, 'scanFileForSecurity')
        .mockResolvedValue({ 
          safe: false, 
          threats: ['XSS', 'Script injection'],
          scanId: 'scan-123'
        });

      const request = {
        workspaceId: 'workspace-1',
        file: maliciousFile,
        format: 'json' as ImportFormat,
      };

      await expect(
        importService.createImportJob('user-1', request)
      ).rejects.toThrow('File failed security scan');

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'File failed security scan',
        expect.objectContaining({
          threats: ['XSS', 'Script injection'],
          scanId: 'scan-123',
        })
      );

      scanFileSpy.mockRestore();
    });

    it('should handle large file rejection', async () => {
      const largeFile = {
        ...mockUploadedFile,
        size: 100 * 1024 * 1024, // 100MB
      };

      // jest.Mock workspace validation
      (mockDb.query as jest.Mock).mockResolvedValueOnce({ rows: [{ id: 'workspace-1' }] });

      const request = {
        workspaceId: 'workspace-1',
        file: largeFile,
        format: 'json' as ImportFormat,
      };

      await expect(
        importService.createImportJob('user-1', request)
      ).rejects.toThrow('File size exceeds maximum limit');
    });
  });
});