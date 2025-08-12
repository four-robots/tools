'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

/**
 * Export/Import WebSocket event types (client-side)
 */
export interface ProgressUpdateEvent {
  jobId: string;
  userId: string;
  type: 'export' | 'import' | 'batch_export' | 'batch_import';
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  message?: string;
  timeRemaining?: number;
  processingRate?: number;
  currentItem?: string;
  metadata: Record<string, any>;
  timestamp: string;
}

export interface StatusChangeEvent {
  jobId: string;
  userId: string;
  oldStatus: string;
  newStatus: string;
  reason?: string;
  timestamp: string;
}

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
 * Hook options
 */
interface UseExportImportSocketOptions {
  userId?: string;
  jobIds?: string[];
  autoConnect?: boolean;
  onProgress?: (event: ProgressUpdateEvent) => void;
  onStatusChange?: (event: StatusChangeEvent) => void;
  onJobComplete?: (event: JobCompleteEvent) => void;
  onJobFailed?: (event: JobFailedEvent) => void;
  onBatchUpdate?: (event: BatchUpdateEvent) => void;
  onNotification?: (event: NotificationEvent) => void;
  onError?: (error: { message: string; code?: string }) => void;
}

/**
 * Hook return value
 */
interface UseExportImportSocketReturn {
  isConnected: boolean;
  connectionError: string | null;
  progress: Map<string, ProgressUpdateEvent>;
  subscribe: (jobIds?: string[]) => void;
  unsubscribe: (jobIds?: string[]) => void;
  getJobStatus: (jobId: string) => void;
  cancelJob: (jobId: string) => void;
  retryJob: (jobId: string) => void;
  clearProgress: (jobId?: string) => void;
}

/**
 * Custom hook for export/import WebSocket functionality
 */
export function useExportImportSocket(
  options: UseExportImportSocketOptions = {}
): UseExportImportSocketReturn {
  const {
    userId,
    jobIds,
    autoConnect = true,
    onProgress,
    onStatusChange,
    onJobComplete,
    onJobFailed,
    onBatchUpdate,
    onNotification,
    onError,
  } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [progress, setProgress] = useState<Map<string, ProgressUpdateEvent>>(new Map());
  
  const socketRef = useRef<Socket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;

  /**
   * Initialize WebSocket connection
   */
  const connect = useCallback(() => {
    if (!userId) {
      setConnectionError('User ID is required for WebSocket connection');
      return;
    }

    try {
      // Create socket connection
      const socket = io('/export-import', {
        auth: {
          token: localStorage.getItem('authToken'), // Assuming token is stored here
        },
        transports: ['websocket', 'polling'],
        timeout: 20000,
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        maxReconnectionAttempts: maxReconnectAttempts,
      });

      socketRef.current = socket;

      // Connection events
      socket.on('connect', () => {
        console.log('Export-import socket connected');
        setIsConnected(true);
        setConnectionError(null);
        reconnectAttempts.current = 0;

        // Auto-subscribe if job IDs provided
        if (jobIds && jobIds.length > 0) {
          socket.emit('export-import:subscribe', { userId, jobIds });
        } else {
          socket.emit('export-import:subscribe', { userId });
        }
      });

      socket.on('disconnect', (reason) => {
        console.log('Export-import socket disconnected:', reason);
        setIsConnected(false);
        
        if (reason === 'io server disconnect') {
          // Server initiated disconnect, don't reconnect automatically
          setConnectionError('Disconnected by server');
        }
      });

      socket.on('connect_error', (error) => {
        console.error('Export-import socket connection error:', error);
        setConnectionError(`Connection failed: ${error.message}`);
        setIsConnected(false);

        // Handle reconnection
        reconnectAttempts.current++;
        if (reconnectAttempts.current >= maxReconnectAttempts) {
          setConnectionError('Failed to connect after maximum attempts');
        }
      });

      // Progress events
      socket.on('export-import:progress', (event: ProgressUpdateEvent) => {
        setProgress(prev => new Map(prev).set(event.jobId, event));
        if (onProgress) {
          onProgress(event);
        }
      });

      // Status change events
      socket.on('export-import:status-change', (event: StatusChangeEvent) => {
        if (onStatusChange) {
          onStatusChange(event);
        }
      });

      // Job completion events
      socket.on('export-import:job-complete', (event: JobCompleteEvent) => {
        if (onJobComplete) {
          onJobComplete(event);
        }
      });

      // Job failure events
      socket.on('export-import:job-failed', (event: JobFailedEvent) => {
        if (onJobFailed) {
          onJobFailed(event);
        }
      });

      // Batch update events
      socket.on('export-import:batch-update', (event: BatchUpdateEvent) => {
        if (onBatchUpdate) {
          onBatchUpdate(event);
        }
      });

      // Notification events
      socket.on('export-import:notification', (event: NotificationEvent) => {
        if (onNotification) {
          onNotification(event);
        }
      });

      // Error events
      socket.on('export-import:error', (error: { message: string; code?: string }) => {
        console.error('Export-import socket error:', error);
        if (onError) {
          onError(error);
        }
      });

    } catch (error) {
      console.error('Failed to create export-import socket:', error);
      setConnectionError(`Failed to create connection: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [userId, jobIds, onProgress, onStatusChange, onJobComplete, onJobFailed, onBatchUpdate, onNotification, onError]);

  /**
   * Disconnect WebSocket
   */
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    setIsConnected(false);
    setConnectionError(null);
    reconnectAttempts.current = 0;
  }, []);

  /**
   * Subscribe to job updates
   */
  const subscribe = useCallback((subscribeJobIds?: string[]) => {
    if (!socketRef.current || !userId) return;

    const data = subscribeJobIds 
      ? { userId, jobIds: subscribeJobIds }
      : { userId };

    socketRef.current.emit('export-import:subscribe', data);
  }, [userId]);

  /**
   * Unsubscribe from job updates
   */
  const unsubscribe = useCallback((unsubscribeJobIds?: string[]) => {
    if (!socketRef.current || !userId) return;

    const data = unsubscribeJobIds 
      ? { userId, jobIds: unsubscribeJobIds }
      : { userId };

    socketRef.current.emit('export-import:unsubscribe', data);
  }, [userId]);

  /**
   * Get job status
   */
  const getJobStatus = useCallback((jobId: string) => {
    if (!socketRef.current) return;
    socketRef.current.emit('export-import:get-status', { jobId });
  }, []);

  /**
   * Cancel job
   */
  const cancelJob = useCallback((jobId: string) => {
    if (!socketRef.current) return;
    socketRef.current.emit('export-import:cancel-job', { jobId });
  }, []);

  /**
   * Retry job
   */
  const retryJob = useCallback((jobId: string) => {
    if (!socketRef.current) return;
    socketRef.current.emit('export-import:retry-job', { jobId });
  }, []);

  /**
   * Clear progress data
   */
  const clearProgress = useCallback((jobId?: string) => {
    if (jobId) {
      setProgress(prev => {
        const newProgress = new Map(prev);
        newProgress.delete(jobId);
        return newProgress;
      });
    } else {
      setProgress(new Map());
    }
  }, []);

  /**
   * Initialize connection on mount
   */
  useEffect(() => {
    if (autoConnect && userId) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [autoConnect, userId, connect, disconnect]);

  /**
   * Handle job IDs changes
   */
  useEffect(() => {
    if (isConnected && socketRef.current && userId) {
      // Re-subscribe with new job IDs
      if (jobIds && jobIds.length > 0) {
        subscribe(jobIds);
      }
    }
  }, [jobIds, isConnected, userId, subscribe]);

  return {
    isConnected,
    connectionError,
    progress,
    subscribe,
    unsubscribe,
    getJobStatus,
    cancelJob,
    retryJob,
    clearProgress,
  };
}

/**
 * Hook for simplified job progress tracking
 */
export function useJobProgress(jobId: string, userId?: string) {
  const [jobProgress, setJobProgress] = useState<ProgressUpdateEvent | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { progress, subscribe, unsubscribe } = useExportImportSocket({
    userId,
    jobIds: [jobId],
    onJobComplete: (event) => {
      if (event.jobId === jobId) {
        setIsComplete(true);
      }
    },
    onJobFailed: (event) => {
      if (event.jobId === jobId) {
        setError(event.errorMessage);
      }
    },
  });

  useEffect(() => {
    const currentProgress = progress.get(jobId);
    if (currentProgress) {
      setJobProgress(currentProgress);
      setIsComplete(currentProgress.status === 'completed');
      setError(currentProgress.status === 'failed' ? 'Job failed' : null);
    }
  }, [progress, jobId]);

  useEffect(() => {
    if (userId && jobId) {
      subscribe([jobId]);
      return () => unsubscribe([jobId]);
    }
  }, [jobId, userId, subscribe, unsubscribe]);

  return {
    progress: jobProgress,
    isComplete,
    error,
    percentage: jobProgress?.progress || 0,
    status: jobProgress?.status || 'pending',
    timeRemaining: jobProgress?.timeRemaining,
    currentItem: jobProgress?.currentItem,
  };
}