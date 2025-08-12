import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { WhiteboardExportService, ExportFormat, ExportOptions } from '../whiteboard-export-service';
import { DatabasePool } from '../../../utils/database-pool';
import { Logger } from '../../../utils/logger';

// jest.Mock dependencies
jest.mock('../../../utils/database-pool');
jest.mock('../../../utils/logger');

describe('WhiteboardExportService', () => {
  let exportService: WhiteboardExportService;
  let mockDb: Partial<DatabasePool>;
  let mockLogger: Partial<Logger>;

  const mockWhiteboard = {
    id: 'whiteboard-1',
    workspaceId: 'workspace-1',
    name: 'Test Whiteboard',
    description: 'A test whiteboard',
    canvasData: {
      viewport: { x: 0, y: 0, zoom: 1 },
      background: { color: '#ffffff' },
    },
    elements: [
      {
        id: 'element-1',
        elementType: 'rectangle',
        elementData: { position: { x: 100, y: 100 }, size: { width: 200, height: 150 } },
        styleData: { color: { fill: '#ff0000' } },
      },
      {
        id: 'element-2',
        elementType: 'text',
        elementData: { position: { x: 50, y: 50 }, text: 'Hello World' },
        styleData: { text: { fontSize: 16, color: '#000000' } },
      },
    ],
    settings: {},
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
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

    // Create export service instance
    exportService = new WhiteboardExportService(
      mockDb as DatabasePool,
      mockLogger as Logger
    );
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('createExportJob', () => {
    it('should create a PDF export job successfully', async () => {
      // jest.Mock database responses
      (mockDb.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [{ id: 'workspace-1' }] }) // Workspace validation
        .mockResolvedValueOnce({ 
          rows: [{ 
            id: 'job-1',
            whiteboard_id: 'whiteboard-1',
            user_id: 'user-1',
            job_type: 'export',
            operation_type: 'pdf',
            status: 'pending',
            progress: 0,
            created_at: new Date('2024-01-01'),
            updated_at: new Date('2024-01-01'),
          }] 
        });

      const request = {
        whiteboardId: 'whiteboard-1',
        format: 'pdf' as ExportFormat,
        options: {
          format: 'pdf' as const,
          paperSize: 'A4' as const,
          orientation: 'portrait' as const,
          includeMetadata: true,
        },
        filename: 'test-whiteboard',
        expiresInHours: 24,
      };

      const job = await exportService.createExportJob('user-1', request);

      expect(job.id).toBe('job-1');
      expect(job.operationType).toBe('pdf');
      expect(job.status).toBe('pending');
      expect(mockDb.query).toHaveBeenCalledTimes(2);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Export job created',
        expect.objectContaining({
          jobId: 'job-1',
          whiteboardId: 'whiteboard-1',
          format: 'pdf',
          userId: 'user-1',
        })
      );
    });

    it('should create a PNG export job with custom options', async () => {
      // jest.Mock database responses
      (mockDb.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [{ id: 'workspace-1' }] })
        .mockResolvedValueOnce({ 
          rows: [{ 
            id: 'job-2',
            whiteboard_id: 'whiteboard-1',
            user_id: 'user-1',
            job_type: 'export',
            operation_type: 'png',
            status: 'pending',
            progress: 0,
            created_at: new Date('2024-01-01'),
            updated_at: new Date('2024-01-01'),
          }] 
        });

      const request = {
        whiteboardId: 'whiteboard-1',
        format: 'png' as ExportFormat,
        options: {
          format: 'png' as const,
          quality: 'high' as const,
          scale: 2,
          backgroundTransparent: true,
        },
      };

      const job = await exportService.createExportJob('user-1', request);

      expect(job.id).toBe('job-2');
      expect(job.operationType).toBe('png');
      expect(job.jobOptions.quality).toBe('high');
      expect(job.jobOptions.scale).toBe(2);
    });

    it('should throw error for invalid whiteboard access', async () => {
      // jest.Mock database to return no results (no access)
      (mockDb.query as jest.Mock).mockResolvedValueOnce({ rows: [] });

      const request = {
        whiteboardId: 'whiteboard-1',
        format: 'pdf' as ExportFormat,
      };

      await expect(
        exportService.createExportJob('user-1', request)
      ).rejects.toThrow('Whiteboard not found or access denied');

      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should handle database errors gracefully', async () => {
      const dbError = new Error('Database connection failed');
      (mockDb.query as jest.Mock).mockRejectedValueOnce(dbError);

      const request = {
        whiteboardId: 'whiteboard-1',
        format: 'pdf' as ExportFormat,
      };

      await expect(
        exportService.createExportJob('user-1', request)
      ).rejects.toThrow('Database connection failed');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to create export job',
        expect.objectContaining({
          error: dbError,
          request,
          userId: 'user-1',
        })
      );
    });
  });

  describe('getExportJob', () => {
    it('should retrieve an export job successfully', async () => {
      const mockJobRow = {
        id: 'job-1',
        whiteboard_id: 'whiteboard-1',
        user_id: 'user-1',
        job_type: 'export',
        operation_type: 'pdf',
        status: 'completed',
        progress: 100,
        file_path: '/exports/job-1/whiteboard.pdf',
        download_url: 'https://example.com/download/job-1',
        file_size: 1024000,
        file_metadata: '{"filename": "test.pdf"}',
        job_options: '{"paperSize": "A4"}',
        processing_time_ms: 5000,
        created_at: new Date('2024-01-01'),
        updated_at: new Date('2024-01-01'),
      };

      (mockDb.query as jest.Mock).mockResolvedValueOnce({ rows: [mockJobRow] });

      const job = await exportService.getExportJob('job-1', 'user-1');

      expect(job).toBeTruthy();
      expect(job!.id).toBe('job-1');
      expect(job!.status).toBe('completed');
      expect(job!.progress).toBe(100);
      expect(job!.downloadUrl).toBe('https://example.com/download/job-1');
      expect(job!.fileSize).toBe(1024000);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM whiteboard_export_import_jobs'),
        ['job-1', 'user-1']
      );
    });

    it('should return null for non-existent job', async () => {
      (mockDb.query as jest.Mock).mockResolvedValueOnce({ rows: [] });

      const job = await exportService.getExportJob('nonexistent-job', 'user-1');

      expect(job).toBeNull();
    });

    it('should handle database errors', async () => {
      const dbError = new Error('Query failed');
      (mockDb.query as jest.Mock).mockRejectedValueOnce(dbError);

      await expect(
        exportService.getExportJob('job-1', 'user-1')
      ).rejects.toThrow('Query failed');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to get export job',
        expect.objectContaining({
          error: dbError,
          jobId: 'job-1',
          userId: 'user-1',
        })
      );
    });
  });

  describe('getUserExportJobs', () => {
    it('should retrieve user export jobs with pagination', async () => {
      const mockJobs = [
        {
          id: 'job-1',
          user_id: 'user-1',
          operation_type: 'pdf',
          status: 'completed',
          progress: 100,
          created_at: new Date('2024-01-01'),
          updated_at: new Date('2024-01-01'),
        },
        {
          id: 'job-2',
          user_id: 'user-1',
          operation_type: 'png',
          status: 'processing',
          progress: 50,
          created_at: new Date('2024-01-02'),
          updated_at: new Date('2024-01-02'),
        },
      ];

      (mockDb.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [{ total: '2' }] }) // Count query
        .mockResolvedValueOnce({ rows: mockJobs }); // Data query

      const result = await exportService.getUserExportJobs('user-1', 10, 0);

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

      const result = await exportService.getUserExportJobs('user-1');

      expect(result.total).toBe(0);
      expect(result.jobs).toHaveLength(0);
    });
  });

  describe('cancelExportJob', () => {
    it('should cancel a pending export job', async () => {
      (mockDb.query as jest.Mock).mockResolvedValueOnce({ rowCount: 1 });

      const result = await exportService.cancelExportJob('job-1', 'user-1');

      expect(result).toBe(true);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE whiteboard_export_import_jobs'),
        expect.arrayContaining(['cancelled', 'job-1', 'user-1'])
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Export job cancelled',
        expect.objectContaining({ jobId: 'job-1', userId: 'user-1' })
      );
    });

    it('should return false if job cannot be cancelled', async () => {
      (mockDb.query as jest.Mock).mockResolvedValueOnce({ rowCount: 0 });

      const result = await exportService.cancelExportJob('job-1', 'user-1');

      expect(result).toBe(false);
      expect(mockLogger.info).not.toHaveBeenCalled();
    });

    it('should handle database errors', async () => {
      const dbError = new Error('Update failed');
      (mockDb.query as jest.Mock).mockRejectedValueOnce(dbError);

      await expect(
        exportService.cancelExportJob('job-1', 'user-1')
      ).rejects.toThrow('Update failed');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to cancel export job',
        expect.objectContaining({
          error: dbError,
          jobId: 'job-1',
          userId: 'user-1',
        })
      );
    });
  });

  describe('cleanupExpiredJobs', () => {
    it('should clean up expired jobs and files', async () => {
      const expiredJobs = [
        { id: 'job-1', file_path: '/exports/job-1/file.pdf' },
        { id: 'job-2', file_path: '/exports/job-2/file.png' },
      ];

      (mockDb.query as jest.Mock)
        .mockResolvedValueOnce({ rows: expiredJobs }) // Get expired jobs
        .mockResolvedValueOnce({ rowCount: 2 }); // Delete jobs

      // jest.Mock file deletion (would normally be filesystem operations)
      const deleteFileSpy = jest.spyOn(exportService as any, 'deleteFile').mockResolvedValue(undefined);

      const result = await exportService.cleanupExpiredJobs();

      expect(result.deletedJobs).toBe(2);
      expect(result.deletedFiles).toBe(2);
      expect(deleteFileSpy).toHaveBeenCalledTimes(2);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Cleaned up expired export jobs',
        expect.objectContaining({ deletedJobs: 2, deletedFiles: 2 })
      );

      deleteFileSpy.mockRestore();
    });

    it('should handle case with no expired jobs', async () => {
      (mockDb.query as jest.Mock).mockResolvedValueOnce({ rows: [] });

      const result = await exportService.cleanupExpiredJobs();

      expect(result.deletedJobs).toBe(0);
      expect(result.deletedFiles).toBe(0);
    });

    it('should continue cleanup even if file deletion fails', async () => {
      const expiredJobs = [
        { id: 'job-1', file_path: '/exports/job-1/file.pdf' },
        { id: 'job-2', file_path: '/exports/job-2/file.png' },
      ];

      (mockDb.query as jest.Mock)
        .mockResolvedValueOnce({ rows: expiredJobs })
        .mockResolvedValueOnce({ rowCount: 2 });

      // jest.Mock file deletion with one failure
      const deleteFileSpy = jest.spyOn(exportService as any, 'deleteFile')
        .mockResolvedValueOnce(undefined) // Success for first file
        .mockRejectedValueOnce(new Error('File not found')); // Failure for second file

      const result = await exportService.cleanupExpiredJobs();

      expect(result.deletedJobs).toBe(2);
      expect(result.deletedFiles).toBe(1); // Only one file successfully deleted
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to delete expired export file',
        expect.objectContaining({
          error: expect.any(Error),
          jobId: 'job-2',
        })
      );

      deleteFileSpy.mockRestore();
    });
  });

  describe('export format validation', () => {
    it('should validate PDF export options', async () => {
      (mockDb.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [{ id: 'workspace-1' }] })
        .mockResolvedValueOnce({ 
          rows: [{ 
            id: 'job-1',
            operation_type: 'pdf',
            job_options: JSON.stringify({
              paperSize: 'A4',
              orientation: 'landscape',
              includeMetadata: true,
            }),
            created_at: new Date(),
            updated_at: new Date(),
          }] 
        });

      const request = {
        whiteboardId: 'whiteboard-1',
        format: 'pdf' as ExportFormat,
        options: {
          format: 'pdf' as const,
          paperSize: 'A4' as const,
          orientation: 'landscape' as const,
          includeMetadata: true,
        },
      };

      const job = await exportService.createExportJob('user-1', request);
      expect(job.jobOptions.paperSize).toBe('A4');
      expect(job.jobOptions.orientation).toBe('landscape');
    });

    it('should validate image export options', async () => {
      (mockDb.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [{ id: 'workspace-1' }] })
        .mockResolvedValueOnce({ 
          rows: [{ 
            id: 'job-1',
            operation_type: 'png',
            job_options: JSON.stringify({
              quality: 'ultra',
              scale: 4,
              backgroundTransparent: false,
            }),
            created_at: new Date(),
            updated_at: new Date(),
          }] 
        });

      const request = {
        whiteboardId: 'whiteboard-1',
        format: 'png' as ExportFormat,
        options: {
          format: 'png' as const,
          quality: 'ultra' as const,
          scale: 4,
          backgroundTransparent: false,
        },
      };

      const job = await exportService.createExportJob('user-1', request);
      expect(job.jobOptions.quality).toBe('ultra');
      expect(job.jobOptions.scale).toBe(4);
      expect(job.jobOptions.backgroundTransparent).toBe(false);
    });
  });
});