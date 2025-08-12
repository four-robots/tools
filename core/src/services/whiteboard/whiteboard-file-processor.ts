import { DatabasePool } from '../../utils/database-pool.js';
import { Logger } from '../../utils/logger.js';
import { randomUUID } from 'crypto';
import { z } from 'zod';

/**
 * Job queue and processing types
 */
export const JobType = z.enum(['export', 'import', 'batch_export', 'batch_import']);
export type JobType = z.infer<typeof JobType>;

export const JobPriority = z.enum(['low', 'normal', 'high', 'urgent']);
export type JobPriority = z.infer<typeof JobPriority>;

export const ProcessingStatus = z.enum(['idle', 'busy', 'error', 'maintenance']);
export type ProcessingStatus = z.infer<typeof ProcessingStatus>;

/**
 * Job processing configuration
 */
export const ProcessorConfig = z.object({
  maxConcurrentJobs: z.number().min(1).max(20).default(3),
  maxRetries: z.number().min(0).max(10).default(3),
  retryDelayMs: z.number().min(100).max(60000).default(5000),
  jobTimeoutMs: z.number().min(10000).max(600000).default(300000), // 5 minutes
  cleanupIntervalMs: z.number().min(60000).max(3600000).default(300000), // 5 minutes
  maxQueueSize: z.number().min(10).max(1000).default(100),
  enableMetrics: z.boolean().default(true),
  enableNotifications: z.boolean().default(true),
});
export type ProcessorConfig = z.infer<typeof ProcessorConfig>;

/**
 * Job metrics and statistics
 */
export const JobMetrics = z.object({
  totalJobs: z.number().default(0),
  completedJobs: z.number().default(0),
  failedJobs: z.number().default(0),
  averageProcessingTimeMs: z.number().default(0),
  queueLength: z.number().default(0),
  activeJobs: z.number().default(0),
  processingRate: z.number().default(0), // jobs per minute
  errorRate: z.number().default(0), // percentage
  lastProcessedAt: z.string().datetime().optional(),
  lastCleanupAt: z.string().datetime().optional(),
});
export type JobMetrics = z.infer<typeof JobMetrics>;

/**
 * Processing job wrapper
 */
export const ProcessingJob = z.object({
  id: z.string().uuid(),
  type: JobType,
  whiteboardId: z.string().uuid().optional(),
  userId: z.string().uuid(),
  priority: JobPriority.default('normal'),
  status: z.enum(['pending', 'processing', 'completed', 'failed', 'cancelled']),
  progress: z.number().min(0).max(100).default(0),
  retryCount: z.number().min(0).default(0),
  maxRetries: z.number().min(0).default(3),
  processingStartedAt: z.string().datetime().optional(),
  processingCompletedAt: z.string().datetime().optional(),
  lastRetryAt: z.string().datetime().optional(),
  errorMessage: z.string().optional(),
  metadata: z.record(z.string(), z.any()).default({}),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ProcessingJob = z.infer<typeof ProcessingJob>;

/**
 * Job notification configuration
 */
export const JobNotification = z.object({
  jobId: z.string().uuid(),
  userId: z.string().uuid(),
  type: z.enum(['started', 'progress', 'completed', 'failed', 'cancelled']),
  title: z.string(),
  message: z.string(),
  progress: z.number().min(0).max(100).optional(),
  data: z.record(z.string(), z.any()).default({}),
  channels: z.array(z.enum(['websocket', 'email', 'push'])).default(['websocket']),
  createdAt: z.string().datetime(),
});
export type JobNotification = z.infer<typeof JobNotification>;

/**
 * Progress update event
 */
export const ProgressUpdateEvent = z.object({
  jobId: z.string().uuid(),
  type: JobType,
  status: z.string(),
  progress: z.number().min(0).max(100),
  message: z.string().optional(),
  timeRemaining: z.number().optional(), // estimated seconds
  processingRate: z.number().optional(), // items per second
  metadata: z.record(z.string(), z.any()).default({}),
  timestamp: z.string().datetime(),
});
export type ProgressUpdateEvent = z.infer<typeof ProgressUpdateEvent>;

/**
 * Whiteboard File Processor
 * 
 * Manages the job queue and processing pipeline for export/import operations:
 * - Job scheduling and prioritization
 * - Concurrent processing with resource management
 * - Progress tracking and notifications
 * - Retry logic and error handling
 * - Automatic cleanup and maintenance
 * - Real-time status updates via WebSocket
 */
export class WhiteboardFileProcessor {
  private logger: Logger;
  private config: ProcessorConfig;
  private isRunning: boolean = false;
  private activeJobs: Map<string, ProcessingJob> = new Map();
  private jobQueue: ProcessingJob[] = [];
  private metrics: JobMetrics = {
    totalJobs: 0,
    completedJobs: 0,
    failedJobs: 0,
    averageProcessingTimeMs: 0,
    queueLength: 0,
    activeJobs: 0,
    processingRate: 0,
    errorRate: 0,
  };
  private processingIntervals: NodeJS.Timeout[] = [];

  constructor(
    private db: DatabasePool,
    config?: Partial<ProcessorConfig>,
    logger?: Logger
  ) {
    this.logger = logger || new Logger('WhiteboardFileProcessor');
    this.config = ProcessorConfig.parse(config || {});
  }

  /**
   * Start the file processor
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('File processor is already running');
      return;
    }

    try {
      this.isRunning = true;
      this.logger.info('Starting whiteboard file processor', { config: this.config });

      // Initialize metrics
      await this.updateMetrics();

      // Start job processing loops
      for (let i = 0; i < this.config.maxConcurrentJobs; i++) {
        this.startJobProcessor(i);
      }

      // Start cleanup and maintenance
      const cleanupInterval = setInterval(
        () => this.performMaintenance(),
        this.config.cleanupIntervalMs
      );
      this.processingIntervals.push(cleanupInterval);

      // Start metrics collection
      if (this.config.enableMetrics) {
        const metricsInterval = setInterval(
          () => this.updateMetrics(),
          60000 // Update metrics every minute
        );
        this.processingIntervals.push(metricsInterval);
      }

      this.logger.info('File processor started successfully');
    } catch (error) {
      this.logger.error('Failed to start file processor', { error });
      this.isRunning = false;
      throw error;
    }
  }

  /**
   * Stop the file processor
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      this.logger.warn('File processor is not running');
      return;
    }

    try {
      this.logger.info('Stopping whiteboard file processor');
      this.isRunning = false;

      // Clear all intervals
      this.processingIntervals.forEach(interval => clearInterval(interval));
      this.processingIntervals = [];

      // Wait for active jobs to complete (with timeout)
      const stopTimeout = 30000; // 30 seconds
      const startTime = Date.now();
      
      while (this.activeJobs.size > 0 && (Date.now() - startTime) < stopTimeout) {
        this.logger.info(`Waiting for ${this.activeJobs.size} active jobs to complete...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      if (this.activeJobs.size > 0) {
        this.logger.warn(`Forced shutdown with ${this.activeJobs.size} active jobs remaining`);
        this.activeJobs.clear();
      }

      this.logger.info('File processor stopped');
    } catch (error) {
      this.logger.error('Error stopping file processor', { error });
      throw error;
    }
  }

  /**
   * Add a job to the processing queue
   */
  async enqueueJob(job: Omit<ProcessingJob, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    try {
      if (this.jobQueue.length >= this.config.maxQueueSize) {
        throw new Error('Job queue is at maximum capacity');
      }

      const jobId = randomUUID();
      const now = new Date().toISOString();

      const processingJob: ProcessingJob = {
        ...job,
        id: jobId,
        createdAt: now,
        updatedAt: now,
      };

      // Validate job data
      ProcessingJob.parse(processingJob);

      // Add to in-memory queue (sorted by priority and creation time)
      this.addJobToQueue(processingJob);

      // Persist to database
      await this.saveJobToDatabase(processingJob);

      this.logger.info('Job enqueued', { 
        jobId, 
        type: job.type, 
        priority: job.priority,
        queueLength: this.jobQueue.length 
      });

      // Send notification if enabled
      if (this.config.enableNotifications) {
        await this.sendJobNotification(processingJob, 'started', 'Job added to queue');
      }

      return jobId;
    } catch (error) {
      this.logger.error('Failed to enqueue job', { error, job });
      throw error;
    }
  }

  /**
   * Get job status and progress
   */
  async getJobStatus(jobId: string): Promise<ProcessingJob | null> {
    try {
      // Check active jobs first
      const activeJob = this.activeJobs.get(jobId);
      if (activeJob) {
        return activeJob;
      }

      // Check queue
      const queuedJob = this.jobQueue.find(job => job.id === jobId);
      if (queuedJob) {
        return queuedJob;
      }

      // Check database for completed/failed jobs
      const query = `
        SELECT * FROM whiteboard_export_import_jobs
        WHERE id = $1
      `;

      const result = await this.db.query(query, [jobId]);
      if (result.rows.length === 0) {
        return null;
      }

      return this.mapDatabaseRowToProcessingJob(result.rows[0]);
    } catch (error) {
      this.logger.error('Failed to get job status', { error, jobId });
      throw error;
    }
  }

  /**
   * Cancel a job
   */
  async cancelJob(jobId: string, userId: string): Promise<boolean> {
    try {
      // Check if job is active
      const activeJob = this.activeJobs.get(jobId);
      if (activeJob) {
        if (activeJob.userId !== userId) {
          throw new Error('Access denied - job belongs to different user');
        }

        // Mark as cancelled (processing loop will handle cleanup)
        activeJob.status = 'cancelled';
        activeJob.updatedAt = new Date().toISOString();
        
        await this.updateJobInDatabase(activeJob);
        await this.sendJobNotification(activeJob, 'cancelled', 'Job cancelled by user');
        
        return true;
      }

      // Check if job is in queue
      const queueIndex = this.jobQueue.findIndex(job => job.id === jobId);
      if (queueIndex !== -1) {
        const job = this.jobQueue[queueIndex];
        
        if (job.userId !== userId) {
          throw new Error('Access denied - job belongs to different user');
        }

        // Remove from queue
        this.jobQueue.splice(queueIndex, 1);
        
        // Update in database
        job.status = 'cancelled';
        job.updatedAt = new Date().toISOString();
        await this.updateJobInDatabase(job);
        await this.sendJobNotification(job, 'cancelled', 'Job cancelled by user');
        
        return true;
      }

      // Try to cancel in database
      const query = `
        UPDATE whiteboard_export_import_jobs
        SET status = 'cancelled', updated_at = $1
        WHERE id = $2 AND user_id = $3 AND status IN ('pending', 'processing')
      `;

      const result = await this.db.query(query, [new Date().toISOString(), jobId, userId]);
      return result.rowCount > 0;

    } catch (error) {
      this.logger.error('Failed to cancel job', { error, jobId, userId });
      throw error;
    }
  }

  /**
   * Get current metrics
   */
  getMetrics(): JobMetrics {
    return {
      ...this.metrics,
      queueLength: this.jobQueue.length,
      activeJobs: this.activeJobs.size,
    };
  }

  /**
   * Get jobs for a specific user
   */
  async getUserJobs(
    userId: string,
    status?: string[],
    limit: number = 20,
    offset: number = 0
  ): Promise<{ jobs: ProcessingJob[]; total: number }> {
    try {
      let whereClause = 'WHERE user_id = $1';
      const values: any[] = [userId];
      let paramIndex = 2;

      if (status && status.length > 0) {
        whereClause += ` AND status = ANY($${paramIndex++})`;
        values.push(status);
      }

      const countQuery = `
        SELECT COUNT(*) as total
        FROM whiteboard_export_import_jobs
        ${whereClause}
      `;

      const dataQuery = `
        SELECT * FROM whiteboard_export_import_jobs
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;

      values.push(limit, offset);

      const [countResult, dataResult] = await Promise.all([
        this.db.query(countQuery, values.slice(0, -2)),
        this.db.query(dataQuery, values)
      ]);

      const total = parseInt(countResult.rows[0]?.total || '0');
      const jobs = dataResult.rows.map(row => this.mapDatabaseRowToProcessingJob(row));

      return { jobs, total };
    } catch (error) {
      this.logger.error('Failed to get user jobs', { error, userId });
      throw error;
    }
  }

  // Private methods

  /**
   * Start a job processor worker
   */
  private async startJobProcessor(workerId: number): Promise<void> {
    const processJob = async () => {
      while (this.isRunning) {
        try {
          const job = this.getNextJob();
          
          if (!job) {
            // No jobs available, wait before checking again
            await new Promise(resolve => setTimeout(resolve, 1000));
            continue;
          }

          await this.processJob(job, workerId);
        } catch (error) {
          this.logger.error('Error in job processor', { error, workerId });
          await new Promise(resolve => setTimeout(resolve, this.config.retryDelayMs));
        }
      }
    };

    // Start the processor loop
    processJob().catch(error => {
      this.logger.error('Job processor crashed', { error, workerId });
    });
  }

  /**
   * Get the next job from the queue
   */
  private getNextJob(): ProcessingJob | null {
    if (this.jobQueue.length === 0) {
      return null;
    }

    // Sort by priority (urgent > high > normal > low) and creation time
    this.jobQueue.sort((a, b) => {
      const priorityOrder = { urgent: 4, high: 3, normal: 2, low: 1 };
      const aPriority = priorityOrder[a.priority];
      const bPriority = priorityOrder[b.priority];
      
      if (aPriority !== bPriority) {
        return bPriority - aPriority; // Higher priority first
      }
      
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(); // FIFO for same priority
    });

    return this.jobQueue.shift() || null;
  }

  /**
   * Process a single job
   */
  private async processJob(job: ProcessingJob, workerId: number): Promise<void> {
    const startTime = Date.now();
    
    try {
      this.logger.info('Processing job', { jobId: job.id, type: job.type, workerId });

      // Move job to active processing
      this.activeJobs.set(job.id, job);
      job.status = 'processing';
      job.processingStartedAt = new Date().toISOString();
      job.updatedAt = new Date().toISOString();

      await this.updateJobInDatabase(job);

      // Send processing started notification
      if (this.config.enableNotifications) {
        await this.sendJobNotification(job, 'started', 'Processing started');
      }

      // Process the job based on type
      let success = false;
      try {
        switch (job.type) {
          case 'export':
            success = await this.processExportJob(job);
            break;
          case 'import':
            success = await this.processImportJob(job);
            break;
          case 'batch_export':
            success = await this.processBatchExportJob(job);
            break;
          case 'batch_import':
            success = await this.processBatchImportJob(job);
            break;
          default:
            throw new Error(`Unknown job type: ${job.type}`);
        }

        if (success) {
          job.status = 'completed';
          job.progress = 100;
          this.metrics.completedJobs++;
        } else {
          throw new Error('Job processing returned false');
        }

      } catch (processError) {
        this.logger.error('Job processing error', { error: processError, jobId: job.id });
        
        // Retry logic
        if (job.retryCount < job.maxRetries) {
          job.retryCount++;
          job.lastRetryAt = new Date().toISOString();
          job.status = 'pending';
          job.progress = 0;
          job.errorMessage = processError.message;

          this.logger.info('Retrying job', { 
            jobId: job.id, 
            retryCount: job.retryCount,
            maxRetries: job.maxRetries 
          });

          // Add back to queue for retry
          this.addJobToQueue(job);
        } else {
          job.status = 'failed';
          job.errorMessage = processError.message;
          this.metrics.failedJobs++;
        }
      }

      job.processingCompletedAt = new Date().toISOString();
      job.updatedAt = new Date().toISOString();

      await this.updateJobInDatabase(job);

      // Send completion notification
      if (this.config.enableNotifications) {
        const notificationType = job.status === 'completed' ? 'completed' : 'failed';
        const message = job.status === 'completed' ? 'Processing completed successfully' : `Processing failed: ${job.errorMessage}`;
        await this.sendJobNotification(job, notificationType, message);
      }

      // Update metrics
      const processingTime = Date.now() - startTime;
      this.updateProcessingMetrics(processingTime, job.status === 'completed');

      this.logger.info('Job processing finished', { 
        jobId: job.id, 
        status: job.status,
        processingTimeMs: processingTime,
        workerId 
      });

    } finally {
      // Remove from active jobs
      this.activeJobs.delete(job.id);
    }
  }

  /**
   * Process export job
   */
  private async processExportJob(job: ProcessingJob): Promise<boolean> {
    try {
      // Mock implementation - in real code, delegate to WhiteboardExportService
      await this.updateJobProgress(job, 25, 'Starting export...');
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      await this.updateJobProgress(job, 50, 'Generating content...');
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      await this.updateJobProgress(job, 75, 'Creating file...');
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      await this.updateJobProgress(job, 100, 'Export complete');
      
      return true;
    } catch (error) {
      this.logger.error('Export job processing failed', { error, jobId: job.id });
      return false;
    }
  }

  /**
   * Process import job
   */
  private async processImportJob(job: ProcessingJob): Promise<boolean> {
    try {
      // Mock implementation - in real code, delegate to WhiteboardImportService
      await this.updateJobProgress(job, 20, 'Validating file...');
      await new Promise(resolve => setTimeout(resolve, 800));
      
      await this.updateJobProgress(job, 40, 'Parsing content...');
      await new Promise(resolve => setTimeout(resolve, 1200));
      
      await this.updateJobProgress(job, 70, 'Creating elements...');
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      await this.updateJobProgress(job, 100, 'Import complete');
      
      return true;
    } catch (error) {
      this.logger.error('Import job processing failed', { error, jobId: job.id });
      return false;
    }
  }

  /**
   * Process batch export job
   */
  private async processBatchExportJob(job: ProcessingJob): Promise<boolean> {
    try {
      // Mock batch processing
      const totalItems = 5; // Mock number of items to process
      
      for (let i = 0; i < totalItems; i++) {
        if (job.status === 'cancelled') {
          return false;
        }
        
        const progress = Math.floor((i + 1) / totalItems * 100);
        await this.updateJobProgress(job, progress, `Processing item ${i + 1} of ${totalItems}...`);
        await new Promise(resolve => setTimeout(resolve, 800));
      }
      
      return true;
    } catch (error) {
      this.logger.error('Batch export job processing failed', { error, jobId: job.id });
      return false;
    }
  }

  /**
   * Process batch import job
   */
  private async processBatchImportJob(job: ProcessingJob): Promise<boolean> {
    try {
      // Mock batch processing
      const totalItems = 3; // Mock number of files to process
      
      for (let i = 0; i < totalItems; i++) {
        if (job.status === 'cancelled') {
          return false;
        }
        
        const progress = Math.floor((i + 1) / totalItems * 100);
        await this.updateJobProgress(job, progress, `Importing file ${i + 1} of ${totalItems}...`);
        await new Promise(resolve => setTimeout(resolve, 1200));
      }
      
      return true;
    } catch (error) {
      this.logger.error('Batch import job processing failed', { error, jobId: job.id });
      return false;
    }
  }

  /**
   * Update job progress and send real-time updates
   */
  private async updateJobProgress(job: ProcessingJob, progress: number, message?: string): Promise<void> {
    try {
      job.progress = Math.min(100, Math.max(0, progress));
      job.updatedAt = new Date().toISOString();

      // Update database
      await this.updateJobInDatabase(job);

      // Send real-time progress update
      const progressEvent: ProgressUpdateEvent = {
        jobId: job.id,
        type: job.type,
        status: job.status,
        progress: job.progress,
        message,
        metadata: job.metadata,
        timestamp: job.updatedAt,
      };

      await this.broadcastProgressUpdate(progressEvent);

    } catch (error) {
      this.logger.error('Failed to update job progress', { error, jobId: job.id });
    }
  }

  /**
   * Send job notification
   */
  private async sendJobNotification(
    job: ProcessingJob,
    type: 'started' | 'progress' | 'completed' | 'failed' | 'cancelled',
    message: string
  ): Promise<void> {
    try {
      const notification: JobNotification = {
        jobId: job.id,
        userId: job.userId,
        type,
        title: `${job.type} ${type}`,
        message,
        progress: type === 'progress' ? job.progress : undefined,
        data: {
          jobType: job.type,
          whiteboardId: job.whiteboardId,
          status: job.status,
        },
        channels: ['websocket'],
        createdAt: new Date().toISOString(),
      };

      // In real implementation, send via notification service or WebSocket
      this.logger.debug('Job notification', notification);

    } catch (error) {
      this.logger.error('Failed to send job notification', { error, jobId: job.id });
    }
  }

  /**
   * Broadcast progress update via WebSocket
   */
  private async broadcastProgressUpdate(event: ProgressUpdateEvent): Promise<void> {
    try {
      // In real implementation, broadcast via WebSocket service
      this.logger.debug('Progress update', event);
      
    } catch (error) {
      this.logger.error('Failed to broadcast progress update', { error, jobId: event.jobId });
    }
  }

  /**
   * Add job to queue with proper sorting
   */
  private addJobToQueue(job: ProcessingJob): void {
    this.jobQueue.push(job);
    this.metrics.totalJobs++;
  }

  /**
   * Perform maintenance tasks
   */
  private async performMaintenance(): Promise<void> {
    try {
      this.logger.debug('Performing maintenance tasks');

      // Clean up completed/failed jobs older than 7 days
      const cutoffDate = new Date(Date.now() - (7 * 24 * 60 * 60 * 1000)).toISOString();
      
      const cleanupQuery = `
        DELETE FROM whiteboard_export_import_jobs
        WHERE status IN ('completed', 'failed', 'cancelled') AND updated_at < $1
      `;

      const result = await this.db.query(cleanupQuery, [cutoffDate]);
      const deletedCount = result.rowCount || 0;

      if (deletedCount > 0) {
        this.logger.info('Cleaned up old job records', { deletedCount });
      }

      this.metrics.lastCleanupAt = new Date().toISOString();

    } catch (error) {
      this.logger.error('Maintenance task failed', { error });
    }
  }

  /**
   * Update processing metrics
   */
  private updateProcessingMetrics(processingTimeMs: number, success: boolean): void {
    // Update average processing time
    const totalProcessed = this.metrics.completedJobs + this.metrics.failedJobs;
    if (totalProcessed > 0) {
      this.metrics.averageProcessingTimeMs = 
        (this.metrics.averageProcessingTimeMs * (totalProcessed - 1) + processingTimeMs) / totalProcessed;
    } else {
      this.metrics.averageProcessingTimeMs = processingTimeMs;
    }

    // Update error rate
    if (this.metrics.totalJobs > 0) {
      this.metrics.errorRate = (this.metrics.failedJobs / this.metrics.totalJobs) * 100;
    }

    this.metrics.lastProcessedAt = new Date().toISOString();
  }

  /**
   * Update overall metrics from database
   */
  private async updateMetrics(): Promise<void> {
    try {
      const query = `
        SELECT 
          COUNT(*) as total_jobs,
          COUNT(*) FILTER (WHERE status = 'completed') as completed_jobs,
          COUNT(*) FILTER (WHERE status = 'failed') as failed_jobs,
          AVG(processing_time_ms) FILTER (WHERE processing_time_ms IS NOT NULL) as avg_processing_time
        FROM whiteboard_export_import_jobs
        WHERE created_at > $1
      `;

      const last24Hours = new Date(Date.now() - (24 * 60 * 60 * 1000)).toISOString();
      const result = await this.db.query(query, [last24Hours]);

      if (result.rows.length > 0) {
        const row = result.rows[0];
        this.metrics.totalJobs = parseInt(row.total_jobs) || 0;
        this.metrics.completedJobs = parseInt(row.completed_jobs) || 0;
        this.metrics.failedJobs = parseInt(row.failed_jobs) || 0;
        this.metrics.averageProcessingTimeMs = parseFloat(row.avg_processing_time) || 0;
        
        if (this.metrics.totalJobs > 0) {
          this.metrics.errorRate = (this.metrics.failedJobs / this.metrics.totalJobs) * 100;
          this.metrics.processingRate = this.metrics.completedJobs / 24 * 60; // jobs per minute over 24 hours
        }
      }

    } catch (error) {
      this.logger.error('Failed to update metrics', { error });
    }
  }

  // Database operations

  private async saveJobToDatabase(job: ProcessingJob): Promise<void> {
    const query = `
      INSERT INTO whiteboard_export_import_jobs (
        id, whiteboard_id, user_id, job_type, operation_type, status,
        progress, file_metadata, job_options, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `;

    await this.db.query(query, [
      job.id,
      job.whiteboardId,
      job.userId,
      'export', // Map job.type to job_type
      job.type, // Store actual type in operation_type
      job.status,
      job.progress,
      JSON.stringify({
        priority: job.priority,
        maxRetries: job.maxRetries,
        retryCount: job.retryCount,
      }),
      JSON.stringify(job.metadata),
      job.createdAt,
      job.updatedAt,
    ]);
  }

  private async updateJobInDatabase(job: ProcessingJob): Promise<void> {
    const query = `
      UPDATE whiteboard_export_import_jobs
      SET status = $2, progress = $3, updated_at = $4,
          started_at = $5, completed_at = $6, error_message = $7,
          processing_time_ms = $8
      WHERE id = $1
    `;

    const processingTimeMs = job.processingStartedAt && job.processingCompletedAt
      ? new Date(job.processingCompletedAt).getTime() - new Date(job.processingStartedAt).getTime()
      : null;

    await this.db.query(query, [
      job.id,
      job.status,
      job.progress,
      job.updatedAt,
      job.processingStartedAt,
      job.processingCompletedAt,
      job.errorMessage,
      processingTimeMs,
    ]);
  }

  private mapDatabaseRowToProcessingJob(row: any): ProcessingJob {
    const metadata = this.parseJsonField(row.file_metadata);
    
    return {
      id: row.id,
      type: row.operation_type || 'export',
      whiteboardId: row.whiteboard_id,
      userId: row.user_id,
      priority: metadata.priority || 'normal',
      status: row.status,
      progress: row.progress || 0,
      retryCount: metadata.retryCount || 0,
      maxRetries: metadata.maxRetries || 3,
      processingStartedAt: row.started_at?.toISOString(),
      processingCompletedAt: row.completed_at?.toISOString(),
      lastRetryAt: metadata.lastRetryAt,
      errorMessage: row.error_message,
      metadata: this.parseJsonField(row.job_options),
      createdAt: row.created_at?.toISOString() || new Date().toISOString(),
      updatedAt: row.updated_at?.toISOString() || new Date().toISOString(),
    };
  }

  private parseJsonField(field: any): any {
    if (!field) return {};
    try {
      return typeof field === 'string' ? JSON.parse(field) : field;
    } catch {
      return {};
    }
  }
}