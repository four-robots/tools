/**
 * Search Alerts Error Types and Handling
 * 
 * Comprehensive error definitions and handling utilities for the search alerts system
 */

/**
 * Base error class for all search alert-related errors
 */
export class SearchAlertError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: Record<string, any>;

  constructor(
    message: string,
    code: string,
    statusCode: number = 500,
    details?: Record<string, any>
  ) {
    super(message);
    this.name = 'SearchAlertError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    
    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, SearchAlertError);
    }
  }

  /**
   * Convert error to API response format
   */
  toResponse() {
    return {
      error: {
        code: this.code,
        message: this.message,
        details: this.details,
      },
    };
  }
}

/**
 * Alert not found error
 */
export class AlertNotFoundError extends SearchAlertError {
  constructor(alertId: string) {
    super(
      `Alert with id "${alertId}" not found`,
      'ALERT_NOT_FOUND',
      404,
      { alertId }
    );
    this.name = 'AlertNotFoundError';
  }
}

/**
 * Alert access denied error
 */
export class AlertAccessDeniedError extends SearchAlertError {
  constructor(alertId: string, userId?: string) {
    super(
      'Access denied to alert',
      'ALERT_ACCESS_DENIED',
      403,
      { alertId, userId }
    );
    this.name = 'AlertAccessDeniedError';
  }
}

/**
 * Alert validation error
 */
export class AlertValidationError extends SearchAlertError {
  constructor(validationErrors: Record<string, string>) {
    const message = `Alert validation failed: ${Object.keys(validationErrors).join(', ')}`;
    super(
      message,
      'ALERT_VALIDATION_ERROR',
      400,
      { validationErrors }
    );
    this.name = 'AlertValidationError';
  }
}

/**
 * Alert execution error
 */
export class AlertExecutionError extends SearchAlertError {
  constructor(alertId: string, reason: string, originalError?: Error) {
    super(
      `Alert execution failed: ${reason}`,
      'ALERT_EXECUTION_ERROR',
      500,
      { 
        alertId, 
        reason, 
        originalError: originalError?.message,
        stack: originalError?.stack,
      }
    );
    this.name = 'AlertExecutionError';
  }
}

/**
 * Alert rate limit exceeded error
 */
export class AlertRateLimitError extends SearchAlertError {
  constructor(limitType: string, current: number, limit: number) {
    super(
      `Rate limit exceeded: ${current}/${limit} alerts per ${limitType}`,
      'ALERT_RATE_LIMIT_EXCEEDED',
      429,
      { limitType, current, limit }
    );
    this.name = 'AlertRateLimitError';
  }
}

/**
 * Notification template error
 */
export class NotificationTemplateError extends SearchAlertError {
  constructor(templateId: string, reason: string) {
    super(
      `Notification template error: ${reason}`,
      'NOTIFICATION_TEMPLATE_ERROR',
      400,
      { templateId, reason }
    );
    this.name = 'NotificationTemplateError';
  }
}

/**
 * Notification delivery error
 */
export class NotificationDeliveryError extends SearchAlertError {
  constructor(channel: string, recipient: string, reason: string, originalError?: Error) {
    super(
      `Notification delivery failed: ${reason}`,
      'NOTIFICATION_DELIVERY_ERROR',
      500,
      { 
        channel, 
        recipient, 
        reason,
        originalError: originalError?.message,
      }
    );
    this.name = 'NotificationDeliveryError';
  }
}

/**
 * Schedule validation error
 */
export class ScheduleValidationError extends SearchAlertError {
  constructor(scheduleType: string, reason: string) {
    super(
      `Schedule validation failed: ${reason}`,
      'SCHEDULE_VALIDATION_ERROR',
      400,
      { scheduleType, reason }
    );
    this.name = 'ScheduleValidationError';
  }
}

/**
 * External service error (email, SMS, webhook providers)
 */
export class ExternalServiceError extends SearchAlertError {
  constructor(service: string, operation: string, reason: string, originalError?: Error) {
    super(
      `External service error: ${service} ${operation} failed - ${reason}`,
      'EXTERNAL_SERVICE_ERROR',
      502,
      { 
        service, 
        operation, 
        reason,
        originalError: originalError?.message,
      }
    );
    this.name = 'ExternalServiceError';
  }
}

/**
 * Database error wrapper
 */
export class AlertDatabaseError extends SearchAlertError {
  constructor(operation: string, originalError: Error) {
    super(
      `Database operation failed: ${operation}`,
      'ALERT_DATABASE_ERROR',
      500,
      { 
        operation,
        originalError: originalError.message,
        stack: originalError.stack,
      }
    );
    this.name = 'AlertDatabaseError';
  }
}

/**
 * Configuration error
 */
export class AlertConfigurationError extends SearchAlertError {
  constructor(setting: string, reason: string) {
    super(
      `Configuration error: ${setting} - ${reason}`,
      'ALERT_CONFIGURATION_ERROR',
      500,
      { setting, reason }
    );
    this.name = 'AlertConfigurationError';
  }
}

/**
 * Check if an error is a search alert error
 */
export function isSearchAlertError(error: any): error is SearchAlertError {
  return error instanceof SearchAlertError;
}

/**
 * Format error response for API
 */
export function formatErrorResponse(error: any) {
  if (isSearchAlertError(error)) {
    return {
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
      },
    };
  }

  // Handle validation errors from Zod
  if (error.name === 'ZodError') {
    return {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: {
          validationErrors: error.errors,
        },
      },
    };
  }

  // Handle database errors
  if (error.code?.startsWith('23')) { // PostgreSQL constraint violations
    return {
      error: {
        code: 'DATABASE_CONSTRAINT_ERROR',
        message: 'Database constraint violation',
        details: {
          constraint: error.constraint,
          detail: error.detail,
        },
      },
    };
  }

  // Generic error fallback
  return {
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred',
      details: process.env.NODE_ENV === 'development' ? {
        originalMessage: error.message,
        stack: error.stack,
      } : undefined,
    },
  };
}

/**
 * Error type predicates for specific error handling
 */
export const isAlertNotFoundError = (error: any): error is AlertNotFoundError =>
  error instanceof AlertNotFoundError;

export const isAlertAccessDeniedError = (error: any): error is AlertAccessDeniedError =>
  error instanceof AlertAccessDeniedError;

export const isAlertValidationError = (error: any): error is AlertValidationError =>
  error instanceof AlertValidationError;

export const isAlertExecutionError = (error: any): error is AlertExecutionError =>
  error instanceof AlertExecutionError;

export const isAlertRateLimitError = (error: any): error is AlertRateLimitError =>
  error instanceof AlertRateLimitError;

export const isNotificationDeliveryError = (error: any): error is NotificationDeliveryError =>
  error instanceof NotificationDeliveryError;

export const isExternalServiceError = (error: any): error is ExternalServiceError =>
  error instanceof ExternalServiceError;

/**
 * Error severity levels for logging and monitoring
 */
export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

/**
 * Get error severity for monitoring and alerting
 */
export function getErrorSeverity(error: any): ErrorSeverity {
  if (isAlertNotFoundError(error) || isAlertAccessDeniedError(error)) {
    return ErrorSeverity.LOW;
  }

  if (isAlertValidationError(error) || isScheduleValidationError(error)) {
    return ErrorSeverity.LOW;
  }

  if (isNotificationDeliveryError(error)) {
    return ErrorSeverity.MEDIUM;
  }

  if (isAlertRateLimitError(error)) {
    return ErrorSeverity.MEDIUM;
  }

  if (isAlertExecutionError(error)) {
    return ErrorSeverity.HIGH;
  }

  if (isExternalServiceError(error) || error instanceof AlertDatabaseError) {
    return ErrorSeverity.HIGH;
  }

  if (error instanceof AlertConfigurationError) {
    return ErrorSeverity.CRITICAL;
  }

  return ErrorSeverity.MEDIUM;
}

/**
 * Retry configuration for different error types
 */
export interface RetryConfig {
  maxRetries: number;
  initialDelay: number;
  maxDelay: number;
  backoffFactor: number;
  retryableErrors: string[];
}

/**
 * Get retry configuration for specific error types
 */
export function getRetryConfig(error: any): RetryConfig | null {
  // Don't retry validation or access errors
  if (
    isAlertValidationError(error) ||
    isAlertAccessDeniedError(error) ||
    isAlertNotFoundError(error) ||
    isAlertRateLimitError(error)
  ) {
    return null;
  }

  // Aggressive retry for external services
  if (isExternalServiceError(error) || isNotificationDeliveryError(error)) {
    return {
      maxRetries: 5,
      initialDelay: 1000,
      maxDelay: 30000,
      backoffFactor: 2,
      retryableErrors: ['EXTERNAL_SERVICE_ERROR', 'NOTIFICATION_DELIVERY_ERROR'],
    };
  }

  // Standard retry for execution errors
  if (isAlertExecutionError(error)) {
    return {
      maxRetries: 3,
      initialDelay: 2000,
      maxDelay: 10000,
      backoffFactor: 1.5,
      retryableErrors: ['ALERT_EXECUTION_ERROR'],
    };
  }

  // Database errors get limited retries
  if (error instanceof AlertDatabaseError) {
    return {
      maxRetries: 2,
      initialDelay: 500,
      maxDelay: 2000,
      backoffFactor: 2,
      retryableErrors: ['ALERT_DATABASE_ERROR'],
    };
  }

  return null;
}

/**
 * Error recovery suggestions for end users
 */
export function getErrorRecoveryMessage(error: any): string {
  if (isAlertNotFoundError(error)) {
    return 'The alert you are looking for no longer exists. Please check your alert list.';
  }

  if (isAlertAccessDeniedError(error)) {
    return 'You do not have permission to access this alert.';
  }

  if (isAlertValidationError(error)) {
    return 'Please check your alert configuration and fix the validation errors.';
  }

  if (isAlertRateLimitError(error)) {
    return 'You have reached your alert limit. Please wait before creating more alerts or triggering existing ones.';
  }

  if (isNotificationDeliveryError(error)) {
    return 'There was a problem delivering your notification. Please check your notification settings.';
  }

  if (isAlertExecutionError(error)) {
    return 'Alert execution failed. Please check your saved search and alert configuration.';
  }

  if (isExternalServiceError(error)) {
    return 'There was a problem with an external service. This issue is usually temporary.';
  }

  return 'An unexpected error occurred. Please try again or contact support if the problem persists.';
}

/**
 * Log structured error information
 */
export function logError(error: any, context: Record<string, any> = {}) {
  const severity = getErrorSeverity(error);
  const errorInfo = {
    error: {
      name: error.name || 'UnknownError',
      message: error.message,
      code: isSearchAlertError(error) ? error.code : 'UNKNOWN',
      stack: error.stack,
    },
    severity,
    context,
    timestamp: new Date().toISOString(),
  };

  // In a real application, send this to your logging service
  console.error('Search Alert Error:', JSON.stringify(errorInfo, null, 2));

  return errorInfo;
}