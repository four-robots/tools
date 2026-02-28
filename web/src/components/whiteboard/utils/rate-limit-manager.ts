/**
 * Rate Limit Manager
 * 
 * Client-side rate limiting and backpressure handling for whiteboard operations.
 * Prevents server overload and provides smooth user experience with intelligent queuing.
 */

export interface RateLimitConfig {
  // Request limits
  maxRequestsPerSecond: number;
  maxRequestsPerMinute: number;
  maxRequestsPerHour: number;
  
  // Backpressure settings
  enableBackpressure: boolean;
  backpressureThreshold: number; // % of limit before triggering backpressure
  backpressureDelay: number; // ms to delay requests during backpressure
  
  // Queue settings  
  maxQueueSize: number;
  queueTimeoutMs: number;
  
  // Circuit breaker
  enableCircuitBreaker: boolean;
  failureThreshold: number;
  recoveryTimeMs: number;
}

export interface RateLimitStatus {
  requestsThisSecond: number;
  requestsThisMinute: number;
  requestsThisHour: number;
  percentOfSecondLimit: number;
  percentOfMinuteLimit: number;
  percentOfHourLimit: number;
  isBackpressureActive: boolean;
  isCircuitOpen: boolean;
  queueSize: number;
}

export interface RateLimitResult {
  allowed: boolean;
  reason?: string;
  retryAfterMs?: number;
  queuePosition?: number;
  status: RateLimitStatus;
}

interface RequestWindow {
  count: number;
  lastReset: number;
}

interface QueuedRequest {
  id: string;
  timestamp: number;
  resolve: (allowed: boolean) => void;
  reject: (error: Error) => void;
  timeoutHandle?: NodeJS.Timeout;
}

class RateLimitManager {
  private config: RateLimitConfig;
  
  // Rate limiting windows
  private secondWindow: RequestWindow = { count: 0, lastReset: Date.now() };
  private minuteWindow: RequestWindow = { count: 0, lastReset: Date.now() };
  private hourWindow: RequestWindow = { count: 0, lastReset: Date.now() };
  
  // Circuit breaker state
  private circuitOpen = false;
  private failureCount = 0;
  private lastFailureTime = 0;
  
  // Request queue for backpressure handling
  private requestQueue: QueuedRequest[] = [];
  private processingQueue = false;
  
  // Backpressure state
  private backpressureActive = false;
  private backpressureTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private lastBackpressureCheck = 0;

  constructor(config: Partial<RateLimitConfig> = {}) {
    this.config = {
      maxRequestsPerSecond: config.maxRequestsPerSecond ?? 10,
      maxRequestsPerMinute: config.maxRequestsPerMinute ?? 300,
      maxRequestsPerHour: config.maxRequestsPerHour ?? 5000,
      
      enableBackpressure: config.enableBackpressure ?? true,
      backpressureThreshold: config.backpressureThreshold ?? 80, // 80% of limit
      backpressureDelay: config.backpressureDelay ?? 100, // 100ms delay
      
      maxQueueSize: config.maxQueueSize ?? 50,
      queueTimeoutMs: config.queueTimeoutMs ?? 5000,
      
      enableCircuitBreaker: config.enableCircuitBreaker ?? true,
      failureThreshold: config.failureThreshold ?? 5,
      recoveryTimeMs: config.recoveryTimeMs ?? 30000,
    };
  }

  /**
   * Check if request is allowed and handle backpressure
   */
  async checkRateLimit(): Promise<RateLimitResult> {
    const now = Date.now();
    
    // Update request windows
    this.updateWindows(now);
    
    // Check circuit breaker
    if (this.isCircuitBreakerOpen(now)) {
      return {
        allowed: false,
        reason: 'Circuit breaker open - service temporarily unavailable',
        retryAfterMs: this.config.recoveryTimeMs - (now - this.lastFailureTime),
        status: this.getStatus(),
      };
    }
    
    // Check immediate limits
    const immediateCheck = this.checkImmediateLimits();
    if (!immediateCheck.allowed) {
      return immediateCheck;
    }
    
    // Check if backpressure should be applied
    this.updateBackpressureStatus(now);
    
    if (this.backpressureActive && this.config.enableBackpressure) {
      return this.handleBackpressure();
    }
    
    // Allow request
    this.recordRequest();
    return {
      allowed: true,
      status: this.getStatus(),
    };
  }

  /**
   * Record successful request completion
   */
  recordSuccess(): void {
    if (this.config.enableCircuitBreaker) {
      this.failureCount = Math.max(0, this.failureCount - 1);
    }
  }

  /**
   * Record failed request
   */
  recordFailure(): void {
    if (this.config.enableCircuitBreaker) {
      this.failureCount++;
      this.lastFailureTime = Date.now();
      
      if (this.failureCount >= this.config.failureThreshold) {
        this.circuitOpen = true;
        console.warn('[RateLimit] Circuit breaker opened due to failures');
      }
    }
  }

  /**
   * Record rate limit rejection from server
   */
  recordServerRateLimit(retryAfterMs: number = 1000): void {
    // Temporarily increase backpressure
    this.backpressureActive = true;
    this.config.backpressureDelay = Math.max(this.config.backpressureDelay, retryAfterMs);

    // Clear any pending reset
    if (this.backpressureTimeoutId) {
      clearTimeout(this.backpressureTimeoutId);
    }

    // Auto-reset backpressure after delay
    this.backpressureTimeoutId = setTimeout(() => {
      this.backpressureTimeoutId = null;
      this.backpressureActive = false;
      this.config.backpressureDelay = 100; // Reset to default
    }, retryAfterMs * 2);
  }

  /**
   * Get current rate limit status
   */
  getStatus(): RateLimitStatus {
    const now = Date.now();
    this.updateWindows(now);
    
    return {
      requestsThisSecond: this.secondWindow.count,
      requestsThisMinute: this.minuteWindow.count,
      requestsThisHour: this.hourWindow.count,
      percentOfSecondLimit: (this.secondWindow.count / this.config.maxRequestsPerSecond) * 100,
      percentOfMinuteLimit: (this.minuteWindow.count / this.config.maxRequestsPerMinute) * 100,
      percentOfHourLimit: (this.hourWindow.count / this.config.maxRequestsPerHour) * 100,
      isBackpressureActive: this.backpressureActive,
      isCircuitOpen: this.circuitOpen,
      queueSize: this.requestQueue.length,
    };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<RateLimitConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Clear all limits and reset state
   */
  reset(): void {
    this.secondWindow = { count: 0, lastReset: Date.now() };
    this.minuteWindow = { count: 0, lastReset: Date.now() };
    this.hourWindow = { count: 0, lastReset: Date.now() };
    
    this.circuitOpen = false;
    this.failureCount = 0;
    this.lastFailureTime = 0;
    
    this.backpressureActive = false;
    if (this.backpressureTimeoutId) {
      clearTimeout(this.backpressureTimeoutId);
      this.backpressureTimeoutId = null;
    }

    // Clear queue
    for (const request of this.requestQueue) {
      if (request.timeoutHandle) {
        clearTimeout(request.timeoutHandle);
      }
      request.resolve(false);
    }
    this.requestQueue = [];
  }

  /**
   * Update request counting windows
   */
  private updateWindows(now: number): void {
    // Update second window
    if (now - this.secondWindow.lastReset >= 1000) {
      this.secondWindow.count = 0;
      this.secondWindow.lastReset = now;
    }
    
    // Update minute window
    if (now - this.minuteWindow.lastReset >= 60000) {
      this.minuteWindow.count = 0;
      this.minuteWindow.lastReset = now;
    }
    
    // Update hour window
    if (now - this.hourWindow.lastReset >= 3600000) {
      this.hourWindow.count = 0;
      this.hourWindow.lastReset = now;
    }
  }

  /**
   * Check if circuit breaker should be open
   */
  private isCircuitBreakerOpen(now: number): boolean {
    if (!this.config.enableCircuitBreaker) return false;
    
    if (this.circuitOpen) {
      // Check if recovery time has passed
      if (now - this.lastFailureTime >= this.config.recoveryTimeMs) {
        this.circuitOpen = false;
        this.failureCount = 0;
        console.log('[RateLimit] Circuit breaker closed - service recovered');
        return false;
      }
      return true;
    }
    
    return false;
  }

  /**
   * Check immediate rate limits without queuing
   */
  private checkImmediateLimits(): RateLimitResult {
    const status = this.getStatus();
    
    // Check second limit
    if (this.secondWindow.count >= this.config.maxRequestsPerSecond) {
      return {
        allowed: false,
        reason: 'Rate limit exceeded: too many requests per second',
        retryAfterMs: 1000 - (Date.now() - this.secondWindow.lastReset),
        status,
      };
    }
    
    // Check minute limit
    if (this.minuteWindow.count >= this.config.maxRequestsPerMinute) {
      return {
        allowed: false,
        reason: 'Rate limit exceeded: too many requests per minute',
        retryAfterMs: 60000 - (Date.now() - this.minuteWindow.lastReset),
        status,
      };
    }
    
    // Check hour limit
    if (this.hourWindow.count >= this.config.maxRequestsPerHour) {
      return {
        allowed: false,
        reason: 'Rate limit exceeded: too many requests per hour',
        retryAfterMs: 3600000 - (Date.now() - this.hourWindow.lastReset),
        status,
      };
    }
    
    return {
      allowed: true,
      status,
    };
  }

  /**
   * Update backpressure status
   */
  private updateBackpressureStatus(now: number): void {
    // Check backpressure every 100ms to avoid excessive calculations
    if (now - this.lastBackpressureCheck < 100) return;
    this.lastBackpressureCheck = now;
    
    if (!this.config.enableBackpressure) {
      this.backpressureActive = false;
      return;
    }
    
    const status = this.getStatus();
    const thresholdPercent = this.config.backpressureThreshold;
    
    // Activate backpressure if any limit is close to being exceeded
    this.backpressureActive = (
      status.percentOfSecondLimit >= thresholdPercent ||
      status.percentOfMinuteLimit >= thresholdPercent ||
      status.percentOfHourLimit >= thresholdPercent
    );
  }

  /**
   * Handle request during backpressure
   */
  private async handleBackpressure(): Promise<RateLimitResult> {
    // Check if queue is full
    if (this.requestQueue.length >= this.config.maxQueueSize) {
      return {
        allowed: false,
        reason: 'Request queue full - server overloaded',
        retryAfterMs: this.config.backpressureDelay,
        status: this.getStatus(),
      };
    }
    
    // Add to queue
    return new Promise<RateLimitResult>((resolve) => {
      const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const queuedRequest: QueuedRequest = {
        id: requestId,
        timestamp: Date.now(),
        resolve: (allowed) => {
          resolve({
            allowed,
            queuePosition: allowed ? undefined : this.requestQueue.findIndex(r => r.id === requestId),
            status: this.getStatus(),
          });
        },
        reject: (error) => {
          resolve({
            allowed: false,
            reason: error.message,
            status: this.getStatus(),
          });
        },
      };
      
      // Set timeout
      queuedRequest.timeoutHandle = setTimeout(() => {
        const index = this.requestQueue.findIndex(r => r.id === requestId);
        if (index >= 0) {
          this.requestQueue.splice(index, 1);
        }
        queuedRequest.reject(new Error('Request timeout in queue'));
      }, this.config.queueTimeoutMs);
      
      this.requestQueue.push(queuedRequest);
      
      // Start processing queue if not already processing
      if (!this.processingQueue) {
        this.processRequestQueue();
      }
    });
  }

  /**
   * Process queued requests during backpressure
   */
  private async processRequestQueue(): Promise<void> {
    if (this.processingQueue || this.requestQueue.length === 0) {
      return;
    }
    
    this.processingQueue = true;
    
    while (this.requestQueue.length > 0 && !this.circuitOpen) {
      const request = this.requestQueue[0];
      
      // Check if request has timed out
      if (Date.now() - request.timestamp > this.config.queueTimeoutMs) {
        this.requestQueue.shift();
        if (request.timeoutHandle) {
          clearTimeout(request.timeoutHandle);
        }
        request.reject(new Error('Request timeout'));
        continue;
      }
      
      // Check if we can process the request
      const immediateCheck = this.checkImmediateLimits();
      if (immediateCheck.allowed) {
        // Process request
        this.requestQueue.shift();
        if (request.timeoutHandle) {
          clearTimeout(request.timeoutHandle);
        }
        
        this.recordRequest();
        request.resolve(true);
      } else {
        // Still rate limited, wait and try again
        await new Promise(resolve => setTimeout(resolve, this.config.backpressureDelay));
      }
      
      // Update backpressure status
      this.updateBackpressureStatus(Date.now());
      
      // If backpressure is no longer active, process remaining requests quickly
      if (!this.backpressureActive) {
        continue;
      }
    }
    
    this.processingQueue = false;
  }

  /**
   * Record a successful request
   */
  private recordRequest(): void {
    this.secondWindow.count++;
    this.minuteWindow.count++;
    this.hourWindow.count++;
  }
}

// Global rate limit manager for selection operations
export const selectionRateLimit = new RateLimitManager({
  maxRequestsPerSecond: 5,
  maxRequestsPerMinute: 150,
  maxRequestsPerHour: 2000,
  enableBackpressure: true,
  backpressureThreshold: 70,
  backpressureDelay: 200,
  maxQueueSize: 20,
  queueTimeoutMs: 3000,
  enableCircuitBreaker: true,
  failureThreshold: 3,
  recoveryTimeMs: 15000,
});

export default RateLimitManager;