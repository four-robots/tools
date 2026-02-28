/**
 * Export/Import WebSocket Handler
 * 
 * Real-time progress updates for export/import operations including:
 * - Job progress tracking
 * - Status change notifications
 * - Error reporting
 * - Batch operation updates
 * - File processing events
 */

import { Server as SocketIOServer, Socket } from 'socket.io';
import { Logger } from '@mcp-tools/core/utils/logger';
import { 
  SessionStorage, 
  SessionData, 
  createSessionStorage 
} from './redis-session-storage.js';
import {
  authenticateWebSocketConnection,
  validateTokenFreshness,
  extractTokenFromHandshake,
  AuthenticatedSocket
} from './auth-handler.js';
import { getGlobalRateLimiter } from './rate-limiter.js';
import { LRUCache, createLRUCache } from './lru-cache.js';
import { WhiteboardExportService } from '@mcp-tools/core/services/whiteboard/whiteboard-export-service';
import { WhiteboardImportService } from '@mcp-tools/core/services/whiteboard/whiteboard-import-service';
import { WhiteboardFileProcessor } from '@mcp-tools/core/services/whiteboard/whiteboard-file-processor';

/**
 * Export/Import WebSocket event types
 */
export interface ExportImportEvents {
  // Client to Server
  'export-import:subscribe': (data: { userId: string; jobIds?: string[] }) => void;
  'export-import:unsubscribe': (data: { userId: string; jobIds?: string[] }) => void;
  'export-import:get-status': (data: { jobId: string }) => void;
  'export-import:cancel-job': (data: { jobId: string }) => void;
  'export-import:retry-job': (data: { jobId: string }) => void;

  // Server to Client
  'export-import:progress': (data: ProgressUpdateEvent) => void;
  'export-import:status-change': (data: StatusChangeEvent) => void;
  'export-import:job-complete': (data: JobCompleteEvent) => void;
  'export-import:job-failed': (data: JobFailedEvent) => void;
  'export-import:batch-update': (data: BatchUpdateEvent) => void;
  'export-import:notification': (data: NotificationEvent) => void;
  'export-import:error': (data: { message: string; code?: string }) => void;
}

/**
 * Progress update event
 */
export interface ProgressUpdateEvent {
  jobId: string;
  userId: string;
  type: 'export' | 'import' | 'batch_export' | 'batch_import';
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress: number; // 0-100
  message?: string;
  timeRemaining?: number; // milliseconds
  processingRate?: number; // items per second
  currentItem?: string; // current file/whiteboard being processed
  metadata: Record<string, any>;
  timestamp: string;
}

/**
 * Status change event
 */
export interface StatusChangeEvent {
  jobId: string;
  userId: string;
  oldStatus: string;
  newStatus: string;
  reason?: string;
  timestamp: string;
}

/**
 * Job completion event
 */
export interface JobCompleteEvent {
  jobId: string;
  userId: string;
  type: 'export' | 'import' | 'batch_export' | 'batch_import';
  downloadUrl?: string;
  fileSize?: number;
  elementsCreated?: string[];
  whiteboardsCreated?: string[];
  warnings?: string[];
  processingTimeMs: number;
  timestamp: string;
}

/**
 * Job failure event
 */
export interface JobFailedEvent {
  jobId: string;
  userId: string;
  type: 'export' | 'import' | 'batch_export' | 'batch_import';
  errorMessage: string;
  errorCode?: string;
  retryable: boolean;
  retryCount: number;
  maxRetries: number;
  timestamp: string;
}

/**
 * Batch operation update event
 */
export interface BatchUpdateEvent {
  batchId: string;
  userId: string;
  operationType: 'batch_export' | 'batch_import';
  totalItems: number;
  processedItems: number;
  failedItems: number;
  currentItem?: string;
  itemUpdates: Array<{
    itemId: string;
    itemName: string;
    status: string;
    progress?: number;
    errorMessage?: string;
  }>;
  overallProgress: number;
  timestamp: string;
}

/**
 * Notification event
 */
export interface NotificationEvent {
  jobId: string;
  userId: string;
  type: 'info' | 'warning' | 'error' | 'success';
  title: string;
  message: string;
  actionUrl?: string;
  actionText?: string;
  dismissible: boolean;
  timestamp: string;
}

/**
 * User subscription data
 */
interface UserSubscription {
  userId: string;
  socketId: string;
  subscribedJobs: Set<string>;
  joinedAt: string;
}

/**
 * Export/Import WebSocket Handler
 */
export class ExportImportSocketHandler {
  private logger: Logger;
  private sessionStorage: SessionStorage;
  private rateLimiter: any;
  private subscriptions: LRUCache<string, UserSubscription>;
  private userJobsCache: LRUCache<string, Set<string>>;
  private progressCache: LRUCache<string, ProgressUpdateEvent>;
  private progressPollingInterval?: ReturnType<typeof setInterval>;

  constructor(
    private io: SocketIOServer,
    private exportService: WhiteboardExportService,
    private importService: WhiteboardImportService,
    private fileProcessor: WhiteboardFileProcessor
  ) {
    this.logger = new Logger('ExportImportSocketHandler');
    this.sessionStorage = createSessionStorage();
    this.rateLimiter = getGlobalRateLimiter();
    
    // Initialize caches
    this.subscriptions = createLRUCache<string, UserSubscription>({
      max: 10000,
      ttl: 3600000, // 1 hour
    });
    
    this.userJobsCache = createLRUCache<string, Set<string>>({
      max: 5000,
      ttl: 1800000, // 30 minutes
    });
    
    this.progressCache = createLRUCache<string, ProgressUpdateEvent>({
      max: 20000,
      ttl: 300000, // 5 minutes
    });

    this.setupEventHandlers();
    this.startProgressPolling();
  }

  /**
   * Setup WebSocket event handlers
   */
  private setupEventHandlers(): void {
    // Create export-import namespace
    const exportImportNamespace = this.io.of('/export-import');
    
    exportImportNamespace.use(async (socket: Socket, next) => {
      try {
        await this.authenticateConnection(socket);
        next();
      } catch (error) {
        this.logger.error('Authentication failed for export-import socket', { error });
        next(new Error('Authentication failed'));
      }
    });

    exportImportNamespace.on('connection', (socket: AuthenticatedSocket) => {
      this.handleConnection(socket);
    });
  }

  /**
   * Authenticate WebSocket connection
   */
  private async authenticateConnection(socket: Socket): Promise<void> {
    const token = extractTokenFromHandshake(socket.handshake);
    if (!token) {
      throw new Error('No authentication token provided');
    }

    const authResult = await authenticateWebSocketConnection(socket as any, token);
    if (!authResult.success) {
      throw new Error('Invalid authentication token');
    }

    // Check token freshness
    if (!validateTokenFreshness(socket as any)) {
      throw new Error('Token expired');
    }
  }

  /**
   * Handle new WebSocket connection
   */
  private handleConnection(socket: AuthenticatedSocket): void {
    const userId = socket.user.id;
    
    this.logger.info('Export-import client connected', {
      socketId: socket.id,
      userId,
      userAgent: socket.handshake.headers['user-agent'],
    });

    // Create user subscription
    const subscription: UserSubscription = {
      userId,
      socketId: socket.id,
      subscribedJobs: new Set(),
      joinedAt: new Date().toISOString(),
    };
    
    this.subscriptions.set(socket.id, subscription);

    // Set up event handlers
    this.setupSocketEventHandlers(socket, subscription);

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      this.handleDisconnection(socket, subscription, reason);
    });

    // Send initial status for user's active jobs
    this.sendUserJobStatuses(socket, userId);
  }

  /**
   * Setup event handlers for a specific socket
   */
  private setupSocketEventHandlers(
    socket: AuthenticatedSocket, 
    subscription: UserSubscription
  ): void {
    // Subscribe to job updates
    socket.on('export-import:subscribe', async (data) => {
      try {
        await this.handleSubscription(socket, subscription, data);
      } catch (error) {
        this.logger.error('Failed to handle subscription', { error, userId: subscription.userId });
        socket.emit('export-import:error', { 
          message: 'Failed to subscribe to updates',
          code: 'SUBSCRIPTION_FAILED'
        });
      }
    });

    // Unsubscribe from job updates
    socket.on('export-import:unsubscribe', async (data) => {
      try {
        await this.handleUnsubscription(socket, subscription, data);
      } catch (error) {
        this.logger.error('Failed to handle unsubscription', { error, userId: subscription.userId });
      }
    });

    // Get job status
    socket.on('export-import:get-status', async (data) => {
      try {
        await this.handleStatusRequest(socket, subscription, data);
      } catch (error) {
        this.logger.error('Failed to get job status', { error, userId: subscription.userId });
        socket.emit('export-import:error', { 
          message: 'Failed to get job status',
          code: 'STATUS_REQUEST_FAILED'
        });
      }
    });

    // Cancel job
    socket.on('export-import:cancel-job', async (data) => {
      try {
        await this.handleJobCancellation(socket, subscription, data);
      } catch (error) {
        this.logger.error('Failed to cancel job', { error, userId: subscription.userId });
        socket.emit('export-import:error', { 
          message: 'Failed to cancel job',
          code: 'CANCELLATION_FAILED'
        });
      }
    });

    // Retry job
    socket.on('export-import:retry-job', async (data) => {
      try {
        await this.handleJobRetry(socket, subscription, data);
      } catch (error) {
        this.logger.error('Failed to retry job', { error, userId: subscription.userId });
        socket.emit('export-import:error', { 
          message: 'Failed to retry job',
          code: 'RETRY_FAILED'
        });
      }
    });
  }

  /**
   * Handle job subscription
   */
  private async handleSubscription(
    socket: AuthenticatedSocket,
    subscription: UserSubscription,
    data: { userId: string; jobIds?: string[] }
  ): Promise<void> {
    // Verify user can only subscribe to their own jobs
    if (data.userId !== subscription.userId) {
      throw new Error('Cannot subscribe to other users\' jobs');
    }

    // Apply rate limiting
    const rateLimitKey = `export-import-subscribe:${subscription.userId}`;
    const rateLimitResult = await this.rateLimiter.checkLimit(rateLimitKey, 10, 60000); // 10 per minute
    
    if (!rateLimitResult.allowed) {
      throw new Error('Rate limit exceeded for subscriptions');
    }

    if (data.jobIds && data.jobIds.length > 0) {
      // Subscribe to specific jobs
      data.jobIds.forEach(jobId => subscription.subscribedJobs.add(jobId));
    } else {
      // Subscribe to all user's jobs
      const userJobs = await this.getUserActiveJobs(data.userId);
      userJobs.forEach(jobId => subscription.subscribedJobs.add(jobId));
    }

    this.logger.debug('User subscribed to job updates', {
      userId: data.userId,
      jobIds: Array.from(subscription.subscribedJobs),
    });

    // Send current status for subscribed jobs
    for (const jobId of subscription.subscribedJobs) {
      const cachedProgress = this.progressCache.get(jobId);
      if (cachedProgress) {
        socket.emit('export-import:progress', cachedProgress);
      }
    }
  }

  /**
   * Handle job unsubscription
   */
  private async handleUnsubscription(
    socket: AuthenticatedSocket,
    subscription: UserSubscription,
    data: { userId: string; jobIds?: string[] }
  ): Promise<void> {
    if (data.userId !== subscription.userId) {
      return; // Silently ignore
    }

    if (data.jobIds && data.jobIds.length > 0) {
      // Unsubscribe from specific jobs
      data.jobIds.forEach(jobId => subscription.subscribedJobs.delete(jobId));
    } else {
      // Unsubscribe from all jobs
      subscription.subscribedJobs.clear();
    }

    this.logger.debug('User unsubscribed from job updates', {
      userId: data.userId,
      jobIds: data.jobIds || 'all',
    });
  }

  /**
   * Handle status request
   */
  private async handleStatusRequest(
    socket: AuthenticatedSocket,
    subscription: UserSubscription,
    data: { jobId: string }
  ): Promise<void> {
    // Get job status from file processor
    const jobStatus = await this.fileProcessor.getJobStatus(data.jobId);
    
    if (!jobStatus) {
      socket.emit('export-import:error', { 
        message: 'Job not found',
        code: 'JOB_NOT_FOUND'
      });
      return;
    }

    // Verify user owns the job
    if (jobStatus.userId !== subscription.userId) {
      socket.emit('export-import:error', { 
        message: 'Access denied to job',
        code: 'ACCESS_DENIED'
      });
      return;
    }

    // Convert to progress event and send
    const progressEvent: ProgressUpdateEvent = {
      jobId: data.jobId,
      userId: jobStatus.userId,
      type: jobStatus.type,
      status: jobStatus.status,
      progress: jobStatus.progress,
      metadata: jobStatus.metadata,
      timestamp: new Date().toISOString(),
    };

    socket.emit('export-import:progress', progressEvent);
  }

  /**
   * Handle job cancellation
   */
  private async handleJobCancellation(
    socket: AuthenticatedSocket,
    subscription: UserSubscription,
    data: { jobId: string }
  ): Promise<void> {
    const success = await this.fileProcessor.cancelJob(data.jobId, subscription.userId);
    
    if (success) {
      const statusChangeEvent: StatusChangeEvent = {
        jobId: data.jobId,
        userId: subscription.userId,
        oldStatus: 'processing',
        newStatus: 'cancelled',
        reason: 'user_requested',
        timestamp: new Date().toISOString(),
      };

      // Broadcast to all subscribed clients
      this.broadcastToUserSockets(subscription.userId, 'export-import:status-change', statusChangeEvent);
    } else {
      socket.emit('export-import:error', { 
        message: 'Failed to cancel job',
        code: 'CANCELLATION_FAILED'
      });
    }
  }

  /**
   * Handle job retry
   */
  private async handleJobRetry(
    socket: AuthenticatedSocket,
    subscription: UserSubscription,
    data: { jobId: string }
  ): Promise<void> {
    // This would require implementing retry logic in the file processor
    // For now, send not implemented error
    socket.emit('export-import:error', { 
      message: 'Job retry not implemented yet',
      code: 'NOT_IMPLEMENTED'
    });
  }

  /**
   * Handle client disconnection
   */
  private handleDisconnection(
    socket: AuthenticatedSocket, 
    subscription: UserSubscription, 
    reason: string
  ): void {
    this.logger.info('Export-import client disconnected', {
      socketId: socket.id,
      userId: subscription.userId,
      reason,
    });

    // Remove subscription
    this.subscriptions.delete(socket.id);

    // Clean up user jobs cache if no more connections
    const hasOtherConnections = Array.from(this.subscriptions.values())
      .some(sub => sub.userId === subscription.userId);
    
    if (!hasOtherConnections) {
      this.userJobsCache.delete(subscription.userId);
    }
  }

  /**
   * Send current job statuses for user
   */
  private async sendUserJobStatuses(socket: AuthenticatedSocket, userId: string): Promise<void> {
    try {
      const { jobs } = await this.fileProcessor.getUserJobs(userId, ['pending', 'processing'], 20);
      
      for (const job of jobs) {
        const progressEvent: ProgressUpdateEvent = {
          jobId: job.id,
          userId: job.userId,
          type: job.type,
          status: job.status,
          progress: job.progress,
          metadata: job.metadata,
          timestamp: new Date().toISOString(),
        };

        socket.emit('export-import:progress', progressEvent);
        
        // Cache the progress
        this.progressCache.set(job.id, progressEvent);
      }
    } catch (error) {
      this.logger.error('Failed to send user job statuses', { error, userId });
    }
  }

  /**
   * Get user's active jobs
   */
  private async getUserActiveJobs(userId: string): Promise<string[]> {
    try {
      let userJobs = this.userJobsCache.get(userId);
      
      if (!userJobs) {
        const { jobs } = await this.fileProcessor.getUserJobs(userId, ['pending', 'processing'], 50);
        userJobs = new Set(jobs.map(job => job.id));
        this.userJobsCache.set(userId, userJobs);
      }
      
      return Array.from(userJobs);
    } catch (error) {
      this.logger.error('Failed to get user active jobs', { error, userId });
      return [];
    }
  }

  /**
   * Start polling for job progress updates
   */
  private startProgressPolling(): void {
    this.progressPollingInterval = setInterval(async () => {
      try {
        await this.pollAndBroadcastUpdates();
      } catch (error) {
        this.logger.error('Failed to poll progress updates', { error });
      }
    }, 2000); // Poll every 2 seconds
  }

  /**
   * Stop progress polling and clear the interval
   */
  public stopProgressPolling(): void {
    if (this.progressPollingInterval) {
      clearInterval(this.progressPollingInterval);
    }
  }

  /**
   * Poll for job updates and broadcast to clients
   */
  private async pollAndBroadcastUpdates(): Promise<void> {
    // Get all active jobs from processor
    const metrics = this.fileProcessor.getMetrics();
    
    if (metrics.activeJobs === 0) {
      return; // No active jobs to poll
    }

    // Get unique user IDs from active subscriptions
    const activeUsers = new Set(
      Array.from(this.subscriptions.values()).map(sub => sub.userId)
    );

    // Poll each active user's jobs
    for (const userId of activeUsers) {
      try {
        const { jobs } = await this.fileProcessor.getUserJobs(userId, ['pending', 'processing'], 20);
        
        for (const job of jobs) {
          const previousProgress = this.progressCache.get(job.id);
          
          // Check if progress has changed
          if (!previousProgress || 
              previousProgress.progress !== job.progress || 
              previousProgress.status !== job.status) {
            
            const progressEvent: ProgressUpdateEvent = {
              jobId: job.id,
              userId: job.userId,
              type: job.type,
              status: job.status,
              progress: job.progress,
              timeRemaining: job.estimatedTimeRemaining,
              metadata: job.metadata,
              timestamp: new Date().toISOString(),
            };

            // Update cache
            this.progressCache.set(job.id, progressEvent);

            // Broadcast to subscribed clients
            this.broadcastToUserSockets(userId, 'export-import:progress', progressEvent);

            // Send status change event if status changed
            if (previousProgress && previousProgress.status !== job.status) {
              const statusChangeEvent: StatusChangeEvent = {
                jobId: job.id,
                userId: job.userId,
                oldStatus: previousProgress.status,
                newStatus: job.status,
                timestamp: new Date().toISOString(),
              };

              this.broadcastToUserSockets(userId, 'export-import:status-change', statusChangeEvent);
            }

            // Send completion/failure events
            if (job.status === 'completed') {
              const completeEvent: JobCompleteEvent = {
                jobId: job.id,
                userId: job.userId,
                type: job.type,
                processingTimeMs: job.processingTimeMs || 0,
                timestamp: new Date().toISOString(),
              };

              this.broadcastToUserSockets(userId, 'export-import:job-complete', completeEvent);
            } else if (job.status === 'failed') {
              const failedEvent: JobFailedEvent = {
                jobId: job.id,
                userId: job.userId,
                type: job.type,
                errorMessage: job.errorMessage || 'Unknown error',
                retryable: job.retryCount < job.maxRetries,
                retryCount: job.retryCount,
                maxRetries: job.maxRetries,
                timestamp: new Date().toISOString(),
              };

              this.broadcastToUserSockets(userId, 'export-import:job-failed', failedEvent);
            }
          }
        }
      } catch (error) {
        this.logger.error('Failed to poll user jobs', { error, userId });
      }
    }
  }

  /**
   * Broadcast event to all sockets for a specific user
   */
  private broadcastToUserSockets(userId: string, event: string, data: any): void {
    const userSockets = Array.from(this.subscriptions.values())
      .filter(sub => sub.userId === userId);

    for (const subscription of userSockets) {
      const socket = this.io.of('/export-import').sockets.get(subscription.socketId);
      if (socket && subscription.subscribedJobs.has(data.jobId)) {
        socket.emit(event, data);
      }
    }
  }

  /**
   * Send notification to user
   */
  public sendNotification(userId: string, notification: NotificationEvent): void {
    this.broadcastToUserSockets(userId, 'export-import:notification', notification);
  }

  /**
   * Broadcast batch update
   */
  public broadcastBatchUpdate(batchUpdate: BatchUpdateEvent): void {
    this.broadcastToUserSockets(batchUpdate.userId, 'export-import:batch-update', batchUpdate);
  }

  /**
   * Get active connections count
   */
  public getActiveConnections(): number {
    return this.subscriptions.size;
  }

  /**
   * Get statistics
   */
  public getStatistics(): {
    activeConnections: number;
    uniqueUsers: number;
    subscribedJobs: number;
    cachedProgress: number;
  } {
    const uniqueUsers = new Set(
      Array.from(this.subscriptions.values()).map(sub => sub.userId)
    ).size;

    const subscribedJobs = Array.from(this.subscriptions.values())
      .reduce((total, sub) => total + sub.subscribedJobs.size, 0);

    return {
      activeConnections: this.subscriptions.size,
      uniqueUsers,
      subscribedJobs,
      cachedProgress: this.progressCache.size,
    };
  }
}

/**
 * Create and initialize export-import socket handler
 */
export function createExportImportSocketHandler(
  io: SocketIOServer,
  exportService: WhiteboardExportService,
  importService: WhiteboardImportService,
  fileProcessor: WhiteboardFileProcessor
): ExportImportSocketHandler {
  return new ExportImportSocketHandler(io, exportService, importService, fileProcessor);
}