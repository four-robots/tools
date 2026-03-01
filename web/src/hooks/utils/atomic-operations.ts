/**
 * Atomic Operations Utility
 * 
 * Provides atomic operation queuing and management to prevent race conditions
 * in concurrent selection updates and state management.
 */

export interface AtomicOperation<T = any> {
  id: string;
  operation: () => Promise<T>;
  priority: number;
  timeout: number;
  retries: number;
  onSuccess?: (result: T) => void;
  onError?: (error: Error) => void;
  onTimeout?: () => void;
}

export interface OperationResult<T = any> {
  success: boolean;
  result?: T;
  error?: Error;
  duration: number;
  retries: number;
}

export interface AtomicQueueConfig {
  maxConcurrent: number;
  defaultTimeout: number;
  defaultRetries: number;
  retryDelay: number;
  enableStats: boolean;
  enableBackpressure: boolean;
  maxQueueSize: number;
  priorityLevels: number;
}

class AtomicOperationQueue {
  private queue: AtomicOperation[] = [];
  private running = new Map<string, Promise<any>>();
  private config: AtomicQueueConfig;
  private stats = {
    total: 0,
    successful: 0,
    failed: 0,
    timedOut: 0,
    retried: 0,
    avgDuration: 0,
    queueDropped: 0,
    backpressureEvents: 0,
  };
  private backpressureCallback?: (queueSize: number, dropped: number) => void;

  constructor(config: Partial<AtomicQueueConfig> = {}) {
    this.config = {
      maxConcurrent: config.maxConcurrent ?? 1, // Default to single thread
      defaultTimeout: config.defaultTimeout ?? 10000, // 10 seconds
      defaultRetries: config.defaultRetries ?? 3,
      retryDelay: config.retryDelay ?? 1000, // 1 second
      enableStats: config.enableStats ?? true,
      enableBackpressure: config.enableBackpressure ?? true,
      maxQueueSize: config.maxQueueSize ?? 1000,
      priorityLevels: config.priorityLevels ?? 10,
    };
  }

  /**
   * Add atomic operation to queue with backpressure handling
   */
  async enqueue<T>(operation: Omit<AtomicOperation<T>, 'id'>): Promise<OperationResult<T>> {
    // Check backpressure conditions
    if (this.config.enableBackpressure && this.queue.length >= this.config.maxQueueSize) {
      const droppedCount = this.handleBackpressure();
      if (this.config.enableStats) {
        this.stats.queueDropped += droppedCount;
        this.stats.backpressureEvents++;
      }
      
      // If queue is still full, reject
      if (this.queue.length >= this.config.maxQueueSize) {
        return {
          success: false,
          error: new Error('Queue full - operation dropped due to backpressure'),
          duration: 0,
          retries: 0,
        };
      }
    }

    const id = `op_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    
    const atomicOp: AtomicOperation<T> = {
      id,
      priority: operation.priority ?? 0,
      timeout: operation.timeout ?? this.config.defaultTimeout,
      retries: operation.retries ?? this.config.defaultRetries,
      ...operation,
    };

    // Insert operation in priority order
    this.insertByPriority(atomicOp);
    
    // Process queue
    this.processQueue();

    // Wait for operation to complete
    return this.waitForOperation(id);
  }

  /**
   * Execute operation immediately (bypass queue)
   */
  async executeImmediate<T>(operation: () => Promise<T>, timeout?: number): Promise<OperationResult<T>> {
    const id = `immediate_${Date.now()}`;
    const startTime = Date.now();

    try {
      const timeoutMs = timeout ?? this.config.defaultTimeout;
      const result = await this.executeWithTimeout(operation, timeoutMs);
      
      const duration = Date.now() - startTime;
      this.updateStats(true, duration, 0);

      return {
        success: true,
        result,
        duration,
        retries: 0,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      this.updateStats(false, duration, 0);

      return {
        success: false,
        error: error as Error,
        duration,
        retries: 0,
      };
    }
  }

  /**
   * Cancel pending operation
   */
  cancel(operationId: string): boolean {
    const index = this.queue.findIndex(op => op.id === operationId);
    if (index >= 0) {
      this.queue.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Cancel all pending operations
   */
  cancelAll(): number {
    const count = this.queue.length;
    this.queue = [];
    return count;
  }

  /**
   * Get queue status with enhanced metrics
   */
  getStatus(): {
    queueLength: number;
    running: number;
    stats: typeof this.stats;
    queueHealth: 'healthy' | 'stressed' | 'critical';
    estimatedWaitTime: number;
  } {
    const queueUtilization = this.queue.length / this.config.maxQueueSize;
    const runningUtilization = this.running.size / this.config.maxConcurrent;
    
    let queueHealth: 'healthy' | 'stressed' | 'critical' = 'healthy';
    if (queueUtilization > 0.8 || runningUtilization > 0.9) {
      queueHealth = 'critical';
    } else if (queueUtilization > 0.5 || runningUtilization > 0.7) {
      queueHealth = 'stressed';
    }

    // Rough estimate based on avg duration and queue position
    const estimatedWaitTime = this.queue.length * (this.stats.avgDuration / this.config.maxConcurrent);

    return {
      queueLength: this.queue.length,
      running: this.running.size,
      stats: this.config.enableStats ? { ...this.stats } : {} as typeof this.stats,
      queueHealth,
      estimatedWaitTime,
    };
  }

  /**
   * Insert operation by priority (higher priority first)
   */
  private insertByPriority(operation: AtomicOperation): void {
    let insertIndex = this.queue.length;
    
    for (let i = 0; i < this.queue.length; i++) {
      if (this.queue[i].priority < operation.priority) {
        insertIndex = i;
        break;
      }
    }
    
    this.queue.splice(insertIndex, 0, operation);
  }

  /**
   * Process operation queue
   */
  private processQueue(): void {
    // Don't exceed max concurrent operations
    if (this.running.size >= this.config.maxConcurrent) {
      return;
    }

    // Get next operation
    const operation = this.queue.shift();
    if (!operation) {
      return;
    }

    // Execute operation
    const promise = this.executeOperation(operation);
    this.running.set(operation.id, promise);

    // Clean up when done
    promise.finally(() => {
      this.running.delete(operation.id);
      // Process next operation
      setTimeout(() => this.processQueue(), 0);
    });
  }

  /**
   * Execute single operation with retries
   */
  private async executeOperation<T>(operation: AtomicOperation<T>): Promise<OperationResult<T>> {
    const startTime = Date.now();
    let lastError: Error | null = null;
    let actualRetries = 0;

    for (let attempt = 0; attempt <= operation.retries; attempt++) {
      try {
        // Add delay for retries
        if (attempt > 0) {
          await new Promise(resolve => setTimeout(resolve, this.config.retryDelay));
          actualRetries++;
        }

        const result = await this.executeWithTimeout(operation.operation, operation.timeout);
        
        const duration = Date.now() - startTime;
        this.updateStats(true, duration, actualRetries);

        // Call success handler
        if (operation.onSuccess) {
          try {
            operation.onSuccess(result);
          } catch (error) {
            console.warn('[AtomicQueue] Error in success handler:', error);
          }
        }

        return {
          success: true,
          result,
          duration,
          retries: actualRetries,
        };

      } catch (error) {
        lastError = error as Error;
        
        if (lastError.message === 'Operation timeout') {
          // Handle timeout
          if (operation.onTimeout) {
            try {
              operation.onTimeout();
            } catch (timeoutError) {
              console.warn('[AtomicQueue] Error in timeout handler:', timeoutError);
            }
          }
          
          const duration = Date.now() - startTime;
          this.updateStats(false, duration, actualRetries, true);

          return {
            success: false,
            error: lastError,
            duration,
            retries: actualRetries,
          };
        }
      }
    }

    // All retries exhausted
    const duration = Date.now() - startTime;
    this.updateStats(false, duration, actualRetries);

    // Call error handler
    if (operation.onError && lastError) {
      try {
        operation.onError(lastError);
      } catch (error) {
        console.warn('[AtomicQueue] Error in error handler:', error);
      }
    }

    return {
      success: false,
      error: lastError!,
      duration,
      retries: actualRetries,
    };
  }

  /**
   * Execute operation with timeout
   */
  private async executeWithTimeout<T>(operation: () => Promise<T>, timeoutMs: number): Promise<T> {
    return Promise.race([
      operation(),
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Operation timeout')), timeoutMs)
      ),
    ]);
  }

  /**
   * Wait for specific operation to complete
   */
  private async waitForOperation<T>(operationId: string): Promise<OperationResult<T>> {
    const runningPromise = this.running.get(operationId);
    if (runningPromise) {
      return await runningPromise;
    }

    // Operation might complete quickly, check again
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        const promise = this.running.get(operationId);
        if (promise) {
          clearInterval(checkInterval);
          promise.then(resolve);
        }
      }, 10);

      // Timeout check
      setTimeout(() => {
        clearInterval(checkInterval);
        resolve({
          success: false,
          error: new Error('Operation not found or already completed'),
          duration: 0,
          retries: 0,
        });
      }, 1000);
    });
  }

  /**
   * Handle backpressure by dropping low-priority operations
   */
  private handleBackpressure(): number {
    if (this.queue.length === 0) return 0;

    // Sort by priority (ascending) to identify lowest priority items
    const sortedQueue = [...this.queue].sort((a, b) => a.priority - b.priority);
    
    // Drop lowest priority operations (up to 25% of queue)
    const maxToDrop = Math.ceil(this.queue.length * 0.25);
    const minPriority = sortedQueue[0].priority;
    
    let droppedCount = 0;
    this.queue = this.queue.filter(op => {
      if (droppedCount < maxToDrop && op.priority === minPriority) {
        droppedCount++;
        
        // Call error handler for dropped operations
        if (op.onError) {
          try {
            op.onError(new Error('Operation dropped due to backpressure'));
          } catch (error) {
            console.warn('[AtomicQueue] Error in dropped operation handler:', error);
          }
        }
        
        return false; // Remove from queue
      }
      return true; // Keep in queue
    });

    // Notify backpressure callback
    if (this.backpressureCallback) {
      try {
        this.backpressureCallback(this.queue.length, droppedCount);
      } catch (error) {
        console.warn('[AtomicQueue] Error in backpressure callback:', error);
      }
    }

    return droppedCount;
  }

  /**
   * Set backpressure callback
   */
  setBackpressureCallback(callback: (queueSize: number, dropped: number) => void): void {
    this.backpressureCallback = callback;
  }

  /**
   * Update statistics
   */
  private updateStats(success: boolean, duration: number, retries: number, timedOut: boolean = false): void {
    if (!this.config.enableStats) return;

    this.stats.total++;
    
    if (success) {
      this.stats.successful++;
    } else {
      this.stats.failed++;
    }

    if (timedOut) {
      this.stats.timedOut++;
    }

    if (retries > 0) {
      this.stats.retried++;
    }

    // Update average duration (exponential moving average)
    const alpha = 0.1;
    this.stats.avgDuration = this.stats.avgDuration * (1 - alpha) + duration * alpha;
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      total: 0,
      successful: 0,
      failed: 0,
      timedOut: 0,
      retried: 0,
      avgDuration: 0,
      queueDropped: 0,
      backpressureEvents: 0,
    };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<AtomicQueueConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Cleanup and destroy
   */
  destroy(): void {
    this.cancelAll();
    this.running.clear();
    this.resetStats();
  }
}

// Specialized queue for selection operations (single-threaded with backpressure)
export const selectionQueue = new AtomicOperationQueue({
  maxConcurrent: 1,
  defaultTimeout: 5000,
  defaultRetries: 2,
  retryDelay: 500,
  enableStats: true,
  enableBackpressure: true,
  maxQueueSize: 100, // Smaller queue for selections
  priorityLevels: 5,
});

// General purpose atomic queue with enhanced capacity
export const atomicQueue = new AtomicOperationQueue({
  maxConcurrent: 5, // Increased for 25+ users
  defaultTimeout: 10000,
  defaultRetries: 3,
  retryDelay: 1000,
  enableStats: true,
  enableBackpressure: true,
  maxQueueSize: 500,
  priorityLevels: 10,
});

export default AtomicOperationQueue;