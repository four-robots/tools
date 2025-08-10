/**
 * Saved Search Error Classes
 * 
 * Provides specific error types for better error handling and user experience.
 * Each error includes a code, message, and optional details for debugging.
 */

/**
 * Base error class for all saved search related errors
 */
export class SavedSearchError extends Error {
  public readonly code: string;
  public readonly details?: any;
  public readonly statusCode?: number;

  constructor(
    code: string,
    message: string,
    details?: any,
    statusCode?: number
  ) {
    super(message);
    this.name = 'SavedSearchError';
    this.code = code;
    this.details = details;
    this.statusCode = statusCode;

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, SavedSearchError);
    }
  }
}

/**
 * Error thrown when a saved search is not found
 */
export class SearchNotFoundError extends SavedSearchError {
  constructor(searchId: string, details?: any) {
    super(
      'SEARCH_NOT_FOUND',
      `Saved search not found: ${searchId}`,
      { searchId, ...details },
      404
    );
    this.name = 'SearchNotFoundError';
  }
}

/**
 * Error thrown when user lacks permission to perform an operation
 */
export class PermissionDeniedError extends SavedSearchError {
  constructor(operation: string, resource?: string, details?: any) {
    const message = resource 
      ? `Permission denied for ${operation} on ${resource}`
      : `Permission denied for operation: ${operation}`;

    super(
      'PERMISSION_DENIED',
      message,
      { operation, resource, ...details },
      403
    );
    this.name = 'PermissionDeniedError';
  }
}

/**
 * Error thrown when a search collection is not found
 */
export class CollectionNotFoundError extends SavedSearchError {
  constructor(collectionId: string, details?: any) {
    super(
      'COLLECTION_NOT_FOUND',
      `Search collection not found: ${collectionId}`,
      { collectionId, ...details },
      404
    );
    this.name = 'CollectionNotFoundError';
  }
}

/**
 * Error thrown when a search version is not found
 */
export class VersionNotFoundError extends SavedSearchError {
  constructor(versionId: string, searchId?: string, details?: any) {
    super(
      'VERSION_NOT_FOUND',
      `Search version not found: ${versionId}`,
      { versionId, searchId, ...details },
      404
    );
    this.name = 'VersionNotFoundError';
  }
}

/**
 * Error thrown when a share is not found or invalid
 */
export class ShareNotFoundError extends SavedSearchError {
  constructor(shareId: string, details?: any) {
    super(
      'SHARE_NOT_FOUND',
      `Search share not found or expired: ${shareId}`,
      { shareId, ...details },
      404
    );
    this.name = 'ShareNotFoundError';
  }
}

/**
 * Error thrown when a search schedule is not found
 */
export class ScheduleNotFoundError extends SavedSearchError {
  constructor(scheduleId: string, details?: any) {
    super(
      'SCHEDULE_NOT_FOUND',
      `Search schedule not found: ${scheduleId}`,
      { scheduleId, ...details },
      404
    );
    this.name = 'ScheduleNotFoundError';
  }
}

/**
 * Error thrown when validation fails
 */
export class ValidationError extends SavedSearchError {
  constructor(field: string, value: any, reason: string, details?: any) {
    super(
      'VALIDATION_ERROR',
      `Validation failed for field '${field}': ${reason}`,
      { field, value, reason, ...details },
      400
    );
    this.name = 'ValidationError';
  }
}

/**
 * Error thrown when a duplicate resource is detected
 */
export class DuplicateError extends SavedSearchError {
  constructor(resource: string, identifier: string, details?: any) {
    super(
      'DUPLICATE_ERROR',
      `Duplicate ${resource}: ${identifier}`,
      { resource, identifier, ...details },
      409
    );
    this.name = 'DuplicateError';
  }
}

/**
 * Error thrown when search execution fails
 */
export class SearchExecutionError extends SavedSearchError {
  constructor(searchId: string, reason: string, details?: any) {
    super(
      'SEARCH_EXECUTION_ERROR',
      `Failed to execute search ${searchId}: ${reason}`,
      { searchId, reason, ...details },
      500
    );
    this.name = 'SearchExecutionError';
  }
}

/**
 * Error thrown when sharing fails
 */
export class SharingError extends SavedSearchError {
  constructor(reason: string, searchId?: string, details?: any) {
    super(
      'SHARING_ERROR',
      `Failed to share search: ${reason}`,
      { reason, searchId, ...details },
      400
    );
    this.name = 'SharingError';
  }
}

/**
 * Error thrown when scheduling fails
 */
export class SchedulingError extends SavedSearchError {
  constructor(reason: string, searchId?: string, details?: any) {
    super(
      'SCHEDULING_ERROR',
      `Failed to schedule search: ${reason}`,
      { reason, searchId, ...details },
      400
    );
    this.name = 'SchedulingError';
  }
}

/**
 * Error thrown when database operations fail
 */
export class DatabaseError extends SavedSearchError {
  constructor(operation: string, reason: string, details?: any) {
    super(
      'DATABASE_ERROR',
      `Database operation failed (${operation}): ${reason}`,
      { operation, reason, ...details },
      500
    );
    this.name = 'DatabaseError';
  }
}

/**
 * Error thrown when external service calls fail
 */
export class ExternalServiceError extends SavedSearchError {
  constructor(service: string, reason: string, details?: any) {
    super(
      'EXTERNAL_SERVICE_ERROR',
      `External service error (${service}): ${reason}`,
      { service, reason, ...details },
      502
    );
    this.name = 'ExternalServiceError';
  }
}

/**
 * Error thrown when rate limits are exceeded
 */
export class RateLimitError extends SavedSearchError {
  constructor(limit: number, window: string, details?: any) {
    super(
      'RATE_LIMIT_EXCEEDED',
      `Rate limit exceeded: ${limit} requests per ${window}`,
      { limit, window, ...details },
      429
    );
    this.name = 'RateLimitError';
  }
}

/**
 * Utility function to check if an error is a SavedSearchError
 */
export function isSavedSearchError(error: any): error is SavedSearchError {
  return error instanceof SavedSearchError;
}

/**
 * Utility function to extract error details for API responses
 */
export function formatErrorResponse(error: SavedSearchError): {
  code: string;
  message: string;
  details?: any;
  statusCode: number;
} {
  return {
    code: error.code,
    message: error.message,
    details: error.details,
    statusCode: error.statusCode || 500,
  };
}

/**
 * Type guard to check for specific error types
 */
export function isErrorType<T extends SavedSearchError>(
  error: any,
  ErrorClass: new (...args: any[]) => T
): error is T {
  return error instanceof ErrorClass;
}