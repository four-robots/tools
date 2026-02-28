/**
 * Comprehensive Error Handling Utilities
 * 
 * Provides centralized error handling, logging, and recovery mechanisms
 * for the whiteboard comment system with production-ready error management.
 */

interface ErrorContext {
  component?: string;
  action?: string;
  userId?: string;
  whiteboardId?: string;
  commentId?: string;
  metadata?: Record<string, any>;
}

interface ErrorReport {
  id: string;
  timestamp: number;
  level: 'error' | 'warning' | 'info';
  message: string;
  stack?: string;
  context: ErrorContext;
  userAgent: string;
  url: string;
  retryable: boolean;
  category: string;
}

type ErrorHandler = (error: Error, context: ErrorContext) => void;
type RetryHandler = () => Promise<void> | void;

class ErrorManager {
  private handlers: Map<string, ErrorHandler[]> = new Map();
  private errorReports: ErrorReport[] = [];
  private maxReports = 100; // Keep last 100 error reports
  private retryAttempts: Map<string, number> = new Map();
  private maxRetries = 3;

  /**
   * Register an error handler for specific error categories
   */
  registerHandler(category: string, handler: ErrorHandler): void {
    if (!this.handlers.has(category)) {
      this.handlers.set(category, []);
    }
    this.handlers.get(category)!.push(handler);
  }

  /**
   * Handle an error with proper categorization and reporting
   */
  handleError(
    error: Error,
    context: ErrorContext = {},
    category: string = 'general'
  ): ErrorReport {
    const errorId = `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const errorReport: ErrorReport = {
      id: errorId,
      timestamp: Date.now(),
      level: this.determineErrorLevel(error, context),
      message: error.message || 'Unknown error',
      stack: error.stack,
      context,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
      url: typeof window !== 'undefined' ? window.location.href : 'unknown',
      retryable: this.isRetryable(error, category),
      category,
    };

    // Add to reports queue
    this.addErrorReport(errorReport);

    // Call registered handlers
    const handlers = this.handlers.get(category) || [];
    handlers.forEach(handler => {
      try {
        handler(error, context);
      } catch (handlerError) {
        console.error('Error in error handler:', handlerError);
      }
    });

    // Log error appropriately
    this.logError(errorReport);

    // Report to monitoring services
    this.reportToMonitoring(errorReport);

    return errorReport;
  }

  /**
   * Handle async operation with automatic error handling
   */
  async handleAsync<T>(
    operation: () => Promise<T>,
    context: ErrorContext = {},
    category: string = 'async'
  ): Promise<{ data?: T; error?: ErrorReport; success: boolean }> {
    try {
      const data = await operation();
      return { data, success: true };
    } catch (error) {
      const errorReport = this.handleError(error as Error, context, category);
      return { error: errorReport, success: false };
    }
  }

  /**
   * Handle async operation with retry logic
   */
  async handleAsyncWithRetry<T>(
    operation: () => Promise<T>,
    context: ErrorContext = {},
    category: string = 'async',
    maxRetries: number = this.maxRetries
  ): Promise<{ data?: T; error?: ErrorReport; success: boolean; retryCount: number }> {
    const operationId = `${category}_${context.action || 'unknown'}_${context.commentId || 'no-id'}`;
    let retryCount = this.retryAttempts.get(operationId) || 0;

    while (retryCount <= maxRetries) {
      try {
        const data = await operation();
        // Reset retry count on success
        this.retryAttempts.delete(operationId);
        return { data, success: true, retryCount };
      } catch (error) {
        retryCount++;
        this.retryAttempts.set(operationId, retryCount);

        const errorReport = this.handleError(
          error as Error,
          { ...context, retryCount },
          category
        );

        // If we've exhausted retries or error is not retryable, return error
        if (retryCount > maxRetries || !errorReport.retryable) {
          return { error: errorReport, success: false, retryCount };
        }

        // Wait before retry with exponential backoff
        const delay = Math.min(1000 * Math.pow(2, retryCount - 1), 10000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    // This should never be reached, but TypeScript requires it
    return { success: false, retryCount };
  }

  /**
   * Create a retry function for manual retry operations
   */
  createRetryHandler(
    operation: () => Promise<void> | void,
    context: ErrorContext = {},
    category: string = 'manual'
  ): RetryHandler {
    return async () => {
      try {
        await operation();
      } catch (error) {
        this.handleError(error as Error, context, category);
        throw error; // Re-throw for component handling
      }
    };
  }

  /**
   * Check if operation should be retried
   */
  shouldRetry(errorReport: ErrorReport): boolean {
    const operationId = `${errorReport.category}_${errorReport.context.action || 'unknown'}_${errorReport.context.commentId || 'no-id'}`;
    const retryCount = this.retryAttempts.get(operationId) || 0;
    return errorReport.retryable && retryCount < this.maxRetries;
  }

  /**
   * Get error statistics
   */
  getStatistics(): {
    totalErrors: number;
    errorsByCategory: Record<string, number>;
    errorsByLevel: Record<string, number>;
    recentErrors: ErrorReport[];
    retryStatistics: Array<{ operationId: string; retryCount: number }>;
  } {
    const errorsByCategory: Record<string, number> = {};
    const errorsByLevel: Record<string, number> = {};

    this.errorReports.forEach(report => {
      errorsByCategory[report.category] = (errorsByCategory[report.category] || 0) + 1;
      errorsByLevel[report.level] = (errorsByLevel[report.level] || 0) + 1;
    });

    const retryStatistics = Array.from(this.retryAttempts.entries()).map(([operationId, retryCount]) => ({
      operationId,
      retryCount,
    }));

    return {
      totalErrors: this.errorReports.length,
      errorsByCategory,
      errorsByLevel,
      recentErrors: this.errorReports.slice(-10), // Last 10 errors
      retryStatistics,
    };
  }

  /**
   * Clear error history
   */
  clearErrors(): void {
    this.errorReports = [];
    this.retryAttempts.clear();
  }

  private determineErrorLevel(error: Error, context: ErrorContext): 'error' | 'warning' | 'info' {
    // Determine error severity based on error type and context
    if (error.name === 'NetworkError' || error.message.includes('network')) {
      return 'warning';
    }
    
    if (error.name === 'ValidationError' || error.message.includes('validation')) {
      return 'warning';
    }
    
    if (context.action === 'comment_typing' || context.action === 'cursor_move') {
      return 'info';
    }
    
    return 'error';
  }

  private isRetryable(error: Error, category: string): boolean {
    // Determine if error should be retried
    const retryableErrors = [
      'NetworkError',
      'TimeoutError',
      'AbortError',
      'ServiceUnavailableError',
      'TemporaryError',
    ];

    const nonRetryableCategories = [
      'validation',
      'authentication',
      'authorization',
      'client_error',
    ];

    // Don't retry client errors or validation errors
    if (nonRetryableCategories.includes(category)) {
      return false;
    }

    // Retry network and temporary errors
    if (retryableErrors.some(retryableError => 
      error.name === retryableError || error.message.includes(retryableError.toLowerCase())
    )) {
      return true;
    }

    // Retry 5xx HTTP errors
    if (error.message.includes('50') && error.message.includes('status')) {
      return true;
    }

    return false;
  }

  private addErrorReport(report: ErrorReport): void {
    this.errorReports.push(report);
    
    // Keep only the last N reports
    if (this.errorReports.length > this.maxReports) {
      this.errorReports = this.errorReports.slice(-this.maxReports);
    }
  }

  private logError(report: ErrorReport): void {
    const logMethod = report.level === 'error' ? console.error : 
                     report.level === 'warning' ? console.warn : 
                     console.info;

    if (process.env.NODE_ENV === 'development') {
      logMethod(
        `[${report.category.toUpperCase()}] ${report.message}`,
        {
          errorId: report.id,
          context: report.context,
          stack: report.stack,
          retryable: report.retryable,
        }
      );
    } else {
      // In production, log minimal information
      logMethod(`Error ${report.id}: ${report.message}`);
    }
  }

  private reportToMonitoring(report: ErrorReport): void {
    try {
      // Report to analytics
      if (typeof window !== 'undefined' && window.analytics?.track) {
        window.analytics.track('Error Occurred', {
          errorId: report.id,
          category: report.category,
          level: report.level,
          message: report.message,
          context: report.context,
          retryable: report.retryable,
          timestamp: report.timestamp,
        });
      }

      // Report to error monitoring service
      if (process.env.NODE_ENV === 'production') {
        fetch('/api/errors', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(report),
        }).catch(error => {
          console.error('Failed to report error to monitoring:', error);
        });
      }
    } catch (error) {
      console.error('Error in error reporting:', error);
    }
  }
}

// Global error manager instance
export const errorManager = new ErrorManager();

// Register default handlers for common error categories
errorManager.registerHandler('comment', (error, context) => {
  console.warn('Comment operation failed:', {
    action: context.action,
    commentId: context.commentId,
    error: error.message,
  });
});

errorManager.registerHandler('websocket', (error, context) => {
  console.warn('WebSocket operation failed:', {
    action: context.action,
    error: error.message,
  });
});

errorManager.registerHandler('network', (error, context) => {
  console.warn('Network request failed:', {
    action: context.action,
    error: error.message,
  });
});

// Utility functions for common error handling patterns
export const handleCommentError = (
  error: Error,
  context: Omit<ErrorContext, 'component'> = {}
) => {
  return errorManager.handleError(error, { ...context, component: 'comment' }, 'comment');
};

export const handleNetworkError = (
  error: Error,
  context: ErrorContext = {}
) => {
  return errorManager.handleError(error, context, 'network');
};

export const handleValidationError = (
  error: Error,
  context: ErrorContext = {}
) => {
  return errorManager.handleError(error, context, 'validation');
};

export const withErrorHandling = async <T>(
  operation: () => Promise<T>,
  context: ErrorContext = {},
  category: string = 'general'
): Promise<T> => {
  const result = await errorManager.handleAsync(operation, context, category);
  if (!result.success) {
    throw new Error(result.error?.message || 'Operation failed');
  }
  return result.data!;
};

export const withRetry = async <T>(
  operation: () => Promise<T>,
  context: ErrorContext = {},
  category: string = 'general',
  maxRetries: number = 3
): Promise<T> => {
  const result = await errorManager.handleAsyncWithRetry(operation, context, category, maxRetries);
  if (!result.success) {
    throw new Error(result.error?.message || 'Operation failed after retries');
  }
  return result.data!;
};

// Global error handlers (only register in browser environment)
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    errorManager.handleError(
      new Error(`Unhandled promise rejection: ${event.reason}`),
      { component: 'global' },
      'unhandled'
    );
  });

  window.addEventListener('error', (event) => {
    errorManager.handleError(
      event.error || new Error(event.message),
      {
        component: 'global',
        metadata: {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
        }
      },
      'uncaught'
    );
  });
}

export default errorManager;