import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { WhiteboardFileProcessor, ProcessingJob, JobStatus, JobType } from '../whiteboard-file-processor';
import { DatabasePool } from '../../../utils/database-pool';
import { Logger } from '../../../utils/logger';
import { WhiteboardExportService } from '../whiteboard-export-service';
import { WhiteboardImportService } from '../whiteboard-import-service';

// jest.Mock dependencies
jest.mock('../../../utils/database-pool');
jest.mock('../../../utils/logger');
jest.mock('../whiteboard-export-service');
jest.mock('../whiteboard-import-service');

describe('WhiteboardFileProcessor', () => {
  let fileProcessor: WhiteboardFileProcessor;
  let mockDb: Partial<DatabasePool>;
  let mockLogger: Partial<Logger>;
  let mockExportService: Partial<WhiteboardExportService>;
  let mockImportService: Partial<WhiteboardImportService>;

  const mockJob: ProcessingJob = {
    id: 'job-1',
    userId: 'user-1',
    type: 'export',
    status: 'pending',
    priority: 1,
    progress: 0,
    metadata: {},
    retryCount: 0,
    maxRetries: 3,
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

    // Setup mock services
    mockExportService = {
      processExportFile: jest.fn(),
    };

    mockImportService = {
      processImportFile: jest.fn(),
    };

    // Create file processor instance
    fileProcessor = new WhiteboardFileProcessor(
      mockDb as DatabasePool,
      mockLogger as Logger,
      mockExportService as WhiteboardExportService,
      mockImportService as WhiteboardImportService
    );
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('enqueueJob', () => {
    it('should enqueue an export job successfully', async () => {
      const jobData = {
        userId: 'user-1',
        type: 'export' as JobType,
        priority: 1,
        metadata: {
          whiteboardId: 'whiteboard-1',
          format: 'pdf',
          options: { paperSize: 'A4' },
        },
      };

      // jest.Mock database insert
      (mockDb.query as jest.Mock).mockResolvedValueOnce({
        rows: [{ id: 'job-1' }]
      });

      const jobId = await fileProcessor.enqueueJob(jobData);

      expect(jobId).toBe('job-1');
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO whiteboard_export_import_jobs'),
        expect.arrayContaining([
          'user-1',
          'processing', // job_type
          'export', // operation_type
          'pending',
          0, // progress
          expect.any(String), // metadata JSON
          1, // priority
          0, // retry_count
          3, // max_retries
        ])
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Job enqueued',
        expect.objectContaining({ jobId: 'job-1', type: 'export' })
      );
    });

    it('should enqueue an import job with custom priority', async () => {
      const jobData = {
        userId: 'user-1',
        type: 'import' as JobType,
        priority: 5,
        metadata: {
          workspaceId: 'workspace-1',
          format: 'json',
          filename: 'whiteboard.json',
        },
      };

      (mockDb.query as jest.Mock).mockResolvedValueOnce({
        rows: [{ id: 'job-2' }]
      });

      const jobId = await fileProcessor.enqueueJob(jobData);

      expect(jobId).toBe('job-2');
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO whiteboard_export_import_jobs'),
        expect.arrayContaining([
          'user-1',
          'processing',
          'import',
          'pending',
          0,
          expect.stringContaining('"workspaceId":"workspace-1"'),
          5, // custom priority
          0,
          3,
        ])
      );
    });

    it('should handle database errors during enqueue', async () => {
      const dbError = new Error('Database insert failed');
      (mockDb.query as jest.Mock).mockRejectedValueOnce(dbError);

      const jobData = {
        userId: 'user-1',
        type: 'export' as JobType,
        metadata: {},
      };

      await expect(fileProcessor.enqueueJob(jobData)).rejects.toThrow('Database insert failed');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to enqueue job',
        expect.objectContaining({ error: dbError })
      );
    });
  });

  describe('getJobStatus', () => {
    it('should retrieve job status successfully', async () => {
      const mockJobRow = {
        id: 'job-1',
        user_id: 'user-1',
        job_type: 'processing',
        operation_type: 'export',
        status: 'processing',
        progress: 50,
        metadata: JSON.stringify({ format: 'pdf' }),
        retry_count: 0,
        max_retries: 3,
        error_message: null,
        processing_time_ms: 5000,
        estimated_time_remaining: 10000,
        created_at: new Date('2024-01-01'),
        updated_at: new Date('2024-01-01'),
      };

      (mockDb.query as jest.Mock).mockResolvedValueOnce({ rows: [mockJobRow] });

      const job = await fileProcessor.getJobStatus('job-1');

      expect(job).toBeTruthy();
      expect(job!.id).toBe('job-1');
      expect(job!.status).toBe('processing');
      expect(job!.progress).toBe(50);
      expect(job!.type).toBe('export');
      expect(job!.metadata).toEqual({ format: 'pdf' });
      expect(job!.processingTimeMs).toBe(5000);
      expect(job!.estimatedTimeRemaining).toBe(10000);
    });

    it('should return null for non-existent job', async () => {
      (mockDb.query as jest.Mock).mockResolvedValueOnce({ rows: [] });

      const job = await fileProcessor.getJobStatus('nonexistent-job');

      expect(job).toBeNull();
    });

    it('should handle database errors', async () => {
      const dbError = new Error('Query failed');
      (mockDb.query as jest.Mock).mockRejectedValueOnce(dbError);

      await expect(fileProcessor.getJobStatus('job-1')).rejects.toThrow('Query failed');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to get job status',
        expect.objectContaining({ error: dbError, jobId: 'job-1' })
      );
    });
  });

  describe('cancelJob', () => {
    it('should cancel a pending job successfully', async () => {
      (mockDb.query as jest.Mock).mockResolvedValueOnce({ rowCount: 1 });

      const result = await fileProcessor.cancelJob('job-1', 'user-1');

      expect(result).toBe(true);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE whiteboard_export_import_jobs'),
        expect.arrayContaining(['cancelled', 'job-1', 'user-1'])
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Job cancelled',
        expect.objectContaining({ jobId: 'job-1', userId: 'user-1' })
      );
    });

    it('should return false if job cannot be cancelled', async () => {
      (mockDb.query as jest.Mock).mockResolvedValueOnce({ rowCount: 0 });

      const result = await fileProcessor.cancelJob('job-1', 'user-1');

      expect(result).toBe(false);
      expect(mockLogger.info).not.toHaveBeenCalled();
    });

    it('should handle database errors during cancellation', async () => {
      const dbError = new Error('Update failed');
      (mockDb.query as jest.Mock).mockRejectedValueOnce(dbError);

      await expect(fileProcessor.cancelJob('job-1', 'user-1')).rejects.toThrow('Update failed');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to cancel job',
        expect.objectContaining({ error: dbError })
      );
    });
  });

  describe('getUserJobs', () => {
    it('should retrieve user jobs with status filter', async () => {
      const mockJobs = [
        {
          id: 'job-1',
          user_id: 'user-1',
          operation_type: 'export',
          status: 'processing',
          progress: 50,
          created_at: new Date('2024-01-01'),
        },
        {
          id: 'job-2',
          user_id: 'user-1',
          operation_type: 'import',
          status: 'pending',
          progress: 0,
          created_at: new Date('2024-01-02'),
        },
      ];

      (mockDb.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [{ total: '2' }] }) // Count query
        .mockResolvedValueOnce({ rows: mockJobs }); // Data query

      const result = await fileProcessor.getUserJobs('user-1', ['pending', 'processing'], 10);

      expect(result.total).toBe(2);
      expect(result.jobs).toHaveLength(2);
      expect(result.jobs[0].id).toBe('job-1');
      expect(result.jobs[1].id).toBe('job-2');
      expect(mockDb.query).toHaveBeenCalledTimes(2);
    });

    it('should retrieve all user jobs when no status filter provided', async () => {
      const mockJobs = [
        {
          id: 'job-1',
          status: 'completed',
          created_at: new Date('2024-01-01'),
        },
      ];

      (mockDb.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [{ total: '1' }] })
        .mockResolvedValueOnce({ rows: mockJobs });

      const result = await fileProcessor.getUserJobs('user-1');

      expect(result.total).toBe(1);
      expect(result.jobs).toHaveLength(1);
      // Verify the query doesn't include status filtering
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.not.stringContaining('status = ANY'),
        expect.arrayContaining(['user-1'])
      );
    });

    it('should handle empty results', async () => {
      (mockDb.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [{ total: '0' }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await fileProcessor.getUserJobs('user-1');

      expect(result.total).toBe(0);
      expect(result.jobs).toHaveLength(0);
    });
  });

  describe('processNextJob', () => {
    it('should process an export job successfully', async () => {
      const mockJobRow = {
        id: 'job-1',
        user_id: 'user-1',
        operation_type: 'export',
        status: 'pending',
        metadata: JSON.stringify({
          whiteboardId: 'whiteboard-1',
          format: 'pdf',
          options: { paperSize: 'A4' },
        }),
        retry_count: 0,
        max_retries: 3,
        created_at: new Date('2024-01-01'),
        updated_at: new Date('2024-01-01'),
      };

      // jest.Mock getting next job
      (mockDb.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [mockJobRow] }) // Get next job
        .mockResolvedValueOnce({ rowCount: 1 }) // Update to processing
        .mockResolvedValueOnce({ rowCount: 1 }); // Update to completed

      // jest.Mock export service processing
      (mockExportService.processExportFile as jest.Mock).mockResolvedValueOnce({
        success: true,
        filePath: '/exports/job-1/whiteboard.pdf',
        downloadUrl: 'https://example.com/download/job-1',
        fileSize: 1024000,
      });

      const result = await fileProcessor.processNextJob();

      expect(result).toBe(true);
      expect(mockExportService.processExportFile).toHaveBeenCalledWith(
        'job-1',
        'user-1',
        'whiteboard-1',
        'pdf',
        { paperSize: 'A4' },
        expect.any(Function) // progress callback
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Job completed successfully',
        expect.objectContaining({ jobId: 'job-1' })
      );
    });

    it('should process an import job successfully', async () => {
      const mockJobRow = {
        id: 'job-2',
        user_id: 'user-1',
        operation_type: 'import',
        status: 'pending',
        metadata: JSON.stringify({
          workspaceId: 'workspace-1',
          file: { filename: 'test.json', buffer: 'base64data' },
          options: { createNewWhiteboard: true },
        }),
        retry_count: 0,
        max_retries: 3,
        created_at: new Date('2024-01-01'),
        updated_at: new Date('2024-01-01'),
      };

      (mockDb.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [mockJobRow] })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({ rowCount: 1 });

      (mockImportService.processImportFile as jest.Mock).mockResolvedValueOnce({
        success: true,
        whiteboardsCreated: ['whiteboard-1'],
        elementsCreated: ['element-1', 'element-2'],
      });

      const result = await fileProcessor.processNextJob();

      expect(result).toBe(true);
      expect(mockImportService.processImportFile).toHaveBeenCalledWith(
        'job-2',
        'user-1',
        'workspace-1',
        expect.objectContaining({ filename: 'test.json' }),
        { createNewWhiteboard: true },
        expect.any(Function)
      );
    });

    it('should handle job processing failure with retry', async () => {
      const mockJobRow = {
        id: 'job-1',
        operation_type: 'export',
        metadata: JSON.stringify({
          whiteboardId: 'whiteboard-1',
          format: 'pdf',
        }),
        retry_count: 1,
        max_retries: 3,
        created_at: new Date('2024-01-01'),
        updated_at: new Date('2024-01-01'),
      };

      (mockDb.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [mockJobRow] })
        .mockResolvedValueOnce({ rowCount: 1 }) // Update to processing
        .mockResolvedValueOnce({ rowCount: 1 }); // Update to failed/retry

      // jest.Mock export service failure
      (mockExportService.processExportFile as jest.Mock).mockResolvedValueOnce({
        success: false,
        errorMessage: 'Export processing failed',
      });

      const result = await fileProcessor.processNextJob();

      expect(result).toBe(true);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Job processing failed, will retry',
        expect.objectContaining({
          jobId: 'job-1',
          retryCount: 1,
          maxRetries: 3,
        })
      );
    });

    it('should handle job processing failure with max retries exceeded', async () => {
      const mockJobRow = {
        id: 'job-1',
        operation_type: 'export',
        metadata: JSON.stringify({
          whiteboardId: 'whiteboard-1',
          format: 'pdf',
        }),
        retry_count: 3,
        max_retries: 3,
        created_at: new Date('2024-01-01'),
        updated_at: new Date('2024-01-01'),
      };

      (mockDb.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [mockJobRow] })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({ rowCount: 1 });

      (mockExportService.processExportFile as jest.Mock).mockResolvedValueOnce({
        success: false,
        errorMessage: 'Export processing failed',
      });

      const result = await fileProcessor.processNextJob();

      expect(result).toBe(true);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Job failed permanently after max retries',
        expect.objectContaining({
          jobId: 'job-1',
          retryCount: 3,
        })
      );
    });

    it('should return false when no jobs are available', async () => {
      (mockDb.query as jest.Mock).mockResolvedValueOnce({ rows: [] });

      const result = await fileProcessor.processNextJob();

      expect(result).toBe(false);
      expect(mockLogger.debug).toHaveBeenCalledWith('No pending jobs found');
    });

    it('should handle database errors during job processing', async () => {
      const dbError = new Error('Database query failed');
      (mockDb.query as jest.Mock).mockRejectedValueOnce(dbError);

      await expect(fileProcessor.processNextJob()).rejects.toThrow('Database query failed');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to process next job',
        expect.objectContaining({ error: dbError })
      );
    });
  });

  describe('getMetrics', () => {
    it('should return processing metrics', async () => {
      const mockMetrics = {
        pending_count: '5',
        processing_count: '2',
        completed_count: '10',
        failed_count: '1',
        avg_processing_time: '15000',
      };

      (mockDb.query as jest.Mock).mockResolvedValueOnce({ rows: [mockMetrics] });

      const metrics = await fileProcessor.getMetrics();

      expect(metrics.pendingJobs).toBe(5);
      expect(metrics.processingJobs).toBe(2);
      expect(metrics.completedJobs).toBe(10);
      expect(metrics.failedJobs).toBe(1);
      expect(metrics.activeJobs).toBe(7); // pending + processing
      expect(metrics.averageProcessingTime).toBe(15000);
    });

    it('should handle metrics query errors', async () => {
      const dbError = new Error('Metrics query failed');
      (mockDb.query as jest.Mock).mockRejectedValueOnce(dbError);

      await expect(fileProcessor.getMetrics()).rejects.toThrow('Metrics query failed');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to get processing metrics',
        expect.objectContaining({ error: dbError })
      );
    });
  });

  describe('cleanupOldJobs', () => {
    it('should clean up old completed jobs', async () => {
      const mockOldJobs = [
        { id: 'job-1', file_path: '/exports/job-1/file.pdf' },
        { id: 'job-2', file_path: '/imports/job-2/file.json' },
      ];

      (mockDb.query as jest.Mock)
        .mockResolvedValueOnce({ rows: mockOldJobs }) // Get old jobs
        .mockResolvedValueOnce({ rowCount: 2 }); // Delete jobs

      // jest.Mock file deletion
      const deleteFileSpy = jest.spyOn(fileProcessor as any, 'deleteFile')
        .mockResolvedValue(undefined);

      const result = await fileProcessor.cleanupOldJobs(7); // 7 days

      expect(result.deletedJobs).toBe(2);
      expect(result.deletedFiles).toBe(2);
      expect(deleteFileSpy).toHaveBeenCalledTimes(2);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Cleaned up old processing jobs',
        expect.objectContaining({ deletedJobs: 2, deletedFiles: 2 })
      );

      deleteFileSpy.mockRestore();
    });

    it('should handle case with no old jobs', async () => {
      (mockDb.query as jest.Mock).mockResolvedValueOnce({ rows: [] });

      const result = await fileProcessor.cleanupOldJobs(7);

      expect(result.deletedJobs).toBe(0);
      expect(result.deletedFiles).toBe(0);
    });

    it('should continue cleanup even if file deletion fails', async () => {
      const mockOldJobs = [
        { id: 'job-1', file_path: '/exports/job-1/file.pdf' },
        { id: 'job-2', file_path: '/exports/job-2/file.png' },
      ];

      (mockDb.query as jest.Mock)
        .mockResolvedValueOnce({ rows: mockOldJobs })
        .mockResolvedValueOnce({ rowCount: 2 });

      const deleteFileSpy = jest.spyOn(fileProcessor as any, 'deleteFile')
        .mockResolvedValueOnce(undefined) // Success for first file
        .mockRejectedValueOnce(new Error('File not found')); // Failure for second

      const result = await fileProcessor.cleanupOldJobs(7);

      expect(result.deletedJobs).toBe(2);
      expect(result.deletedFiles).toBe(1); // Only one file successfully deleted
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to delete old job file',
        expect.objectContaining({
          error: expect.any(Error),
          jobId: 'job-2',
        })
      );

      deleteFileSpy.mockRestore();
    });

    it('should handle database errors during cleanup', async () => {
      const dbError = new Error('Cleanup query failed');
      (mockDb.query as jest.Mock).mockRejectedValueOnce(dbError);

      await expect(fileProcessor.cleanupOldJobs(7)).rejects.toThrow('Cleanup query failed');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to cleanup old jobs',
        expect.objectContaining({ error: dbError })
      );
    });
  });

  describe('startProcessing', () => {
    it('should start processing with specified concurrency', async () => {
      const startIntervalSpy = jest.spyOn(global, 'setInterval');

      fileProcessor.startProcessing(3, 1000); // 3 concurrent, 1 second interval

      expect(startIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 1000);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Started job processing',
        expect.objectContaining({ maxConcurrentJobs: 3, intervalMs: 1000 })
      );

      startIntervalSpy.mockRestore();
    });
  });

  describe('stopProcessing', () => {
    it('should stop processing gracefully', () => {
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');

      // First start processing to have something to stop
      fileProcessor.startProcessing(2, 1000);
      fileProcessor.stopProcessing();

      expect(clearIntervalSpy).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Stopped job processing');

      clearIntervalSpy.mockRestore();
    });
  });
});