/**
 * Collaboration Error Types
 * 
 * Provides specific error classes for collaboration-related failures
 * with standardized error codes and detailed error information.
 */

export class CollaborationError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public details?: any
  ) {
    super(message);
    this.name = 'CollaborationError';
    
    // Ensure proper prototype chain
    Object.setPrototypeOf(this, CollaborationError.prototype);
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      details: this.details
    };
  }
}

export class SessionNotFoundError extends CollaborationError {
  constructor(sessionId: string) {
    super(
      `Session not found: ${sessionId}`, 
      'SESSION_NOT_FOUND', 
      404,
      { sessionId }
    );
    this.name = 'SessionNotFoundError';
    Object.setPrototypeOf(this, SessionNotFoundError.prototype);
  }
}

export class SessionInactiveError extends CollaborationError {
  constructor(sessionId: string) {
    super(
      `Session is not active: ${sessionId}`, 
      'SESSION_INACTIVE', 
      403,
      { sessionId }
    );
    this.name = 'SessionInactiveError';
    Object.setPrototypeOf(this, SessionInactiveError.prototype);
  }
}

export class InsufficientPermissionsError extends CollaborationError {
  constructor(action: string, sessionId?: string, userId?: string) {
    super(
      `Insufficient permissions for action: ${action}`, 
      'INSUFFICIENT_PERMISSIONS', 
      403,
      { action, sessionId, userId }
    );
    this.name = 'InsufficientPermissionsError';
    Object.setPrototypeOf(this, InsufficientPermissionsError.prototype);
  }
}

export class RateLimitExceededError extends CollaborationError {
  constructor(limit: string, userId?: string, connectionId?: string) {
    super(
      `Rate limit exceeded: ${limit}`, 
      'RATE_LIMIT_EXCEEDED', 
      429,
      { limit, userId, connectionId }
    );
    this.name = 'RateLimitExceededError';
    Object.setPrototypeOf(this, RateLimitExceededError.prototype);
  }
}

export class ConnectionNotFoundError extends CollaborationError {
  constructor(connectionId: string) {
    super(
      `Connection not found: ${connectionId}`, 
      'CONNECTION_NOT_FOUND', 
      404,
      { connectionId }
    );
    this.name = 'ConnectionNotFoundError';
    Object.setPrototypeOf(this, ConnectionNotFoundError.prototype);
  }
}

export class AuthenticationRequiredError extends CollaborationError {
  constructor(reason?: string) {
    super(
      `Authentication required${reason ? ': ' + reason : ''}`, 
      'AUTHENTICATION_REQUIRED', 
      401,
      { reason }
    );
    this.name = 'AuthenticationRequiredError';
    Object.setPrototypeOf(this, AuthenticationRequiredError.prototype);
  }
}

export class InvalidTokenError extends CollaborationError {
  constructor(reason?: string) {
    super(
      `Invalid authentication token${reason ? ': ' + reason : ''}`, 
      'INVALID_TOKEN', 
      401,
      { reason }
    );
    this.name = 'InvalidTokenError';
    Object.setPrototypeOf(this, InvalidTokenError.prototype);
  }
}

export class SessionCapacityExceededError extends CollaborationError {
  constructor(sessionId: string, maxParticipants: number) {
    super(
      `Session capacity exceeded: ${sessionId}`, 
      'SESSION_CAPACITY_EXCEEDED', 
      429,
      { sessionId, maxParticipants }
    );
    this.name = 'SessionCapacityExceededError';
    Object.setPrototypeOf(this, SessionCapacityExceededError.prototype);
  }
}

export class ServerCapacityExceededError extends CollaborationError {
  constructor(maxConnections: number) {
    super(
      `Server at capacity: ${maxConnections} maximum connections`, 
      'SERVER_CAPACITY_EXCEEDED', 
      503,
      { maxConnections }
    );
    this.name = 'ServerCapacityExceededError';
    Object.setPrototypeOf(this, ServerCapacityExceededError.prototype);
  }
}

export class MessageProcessingError extends CollaborationError {
  constructor(messageType: string, reason?: string) {
    super(
      `Message processing failed for type ${messageType}${reason ? ': ' + reason : ''}`, 
      'MESSAGE_PROCESSING_ERROR', 
      400,
      { messageType, reason }
    );
    this.name = 'MessageProcessingError';
    Object.setPrototypeOf(this, MessageProcessingError.prototype);
  }
}

export class ValidationError extends CollaborationError {
  constructor(field: string, reason: string, value?: any) {
    super(
      `Validation failed for ${field}: ${reason}`, 
      'VALIDATION_ERROR', 
      400,
      { field, reason, value }
    );
    this.name = 'ValidationError';
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

export class EventBroadcastError extends CollaborationError {
  constructor(eventId: string, reason?: string) {
    super(
      `Event broadcast failed for ${eventId}${reason ? ': ' + reason : ''}`, 
      'EVENT_BROADCAST_ERROR', 
      500,
      { eventId, reason }
    );
    this.name = 'EventBroadcastError';
    Object.setPrototypeOf(this, EventBroadcastError.prototype);
  }
}

export class PresenceUpdateError extends CollaborationError {
  constructor(userId: string, sessionId: string, reason?: string) {
    super(
      `Presence update failed for user ${userId} in session ${sessionId}${reason ? ': ' + reason : ''}`, 
      'PRESENCE_UPDATE_ERROR', 
      500,
      { userId, sessionId, reason }
    );
    this.name = 'PresenceUpdateError';
    Object.setPrototypeOf(this, PresenceUpdateError.prototype);
  }
}

export class RedisConnectionError extends CollaborationError {
  constructor(operation: string, reason?: string) {
    super(
      `Redis operation failed: ${operation}${reason ? ': ' + reason : ''}`, 
      'REDIS_CONNECTION_ERROR', 
      503,
      { operation, reason }
    );
    this.name = 'RedisConnectionError';
    Object.setPrototypeOf(this, RedisConnectionError.prototype);
  }
}

export class DatabaseConnectionError extends CollaborationError {
  constructor(operation: string, reason?: string) {
    super(
      `Database operation failed: ${operation}${reason ? ': ' + reason : ''}`, 
      'DATABASE_CONNECTION_ERROR', 
      503,
      { operation, reason }
    );
    this.name = 'DatabaseConnectionError';
    Object.setPrototypeOf(this, DatabaseConnectionError.prototype);
  }
}

/**
 * Utility function to determine if an error is a collaboration error
 */
export function isCollaborationError(error: any): error is CollaborationError {
  return error instanceof CollaborationError;
}

/**
 * Utility function to convert any error to a collaboration error
 */
export function toCollaborationError(error: any): CollaborationError {
  if (isCollaborationError(error)) {
    return error;
  }

  if (error instanceof Error) {
    return new CollaborationError(
      error.message,
      'UNKNOWN_ERROR',
      500,
      { originalError: error.name }
    );
  }

  return new CollaborationError(
    'Unknown error occurred',
    'UNKNOWN_ERROR',
    500,
    { originalError: String(error) }
  );
}

/**
 * Error code constants for easy reference
 */
export const ERROR_CODES = {
  // Authentication & Authorization
  AUTHENTICATION_REQUIRED: 'AUTHENTICATION_REQUIRED',
  INVALID_TOKEN: 'INVALID_TOKEN',
  INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',
  
  // Session Management
  SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
  SESSION_INACTIVE: 'SESSION_INACTIVE',
  SESSION_CAPACITY_EXCEEDED: 'SESSION_CAPACITY_EXCEEDED',
  
  // Connection Management
  CONNECTION_NOT_FOUND: 'CONNECTION_NOT_FOUND',
  SERVER_CAPACITY_EXCEEDED: 'SERVER_CAPACITY_EXCEEDED',
  
  // Rate Limiting
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  
  // Message Processing
  MESSAGE_PROCESSING_ERROR: 'MESSAGE_PROCESSING_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  
  // Event Management
  EVENT_BROADCAST_ERROR: 'EVENT_BROADCAST_ERROR',
  PRESENCE_UPDATE_ERROR: 'PRESENCE_UPDATE_ERROR',
  
  // Infrastructure
  REDIS_CONNECTION_ERROR: 'REDIS_CONNECTION_ERROR',
  DATABASE_CONNECTION_ERROR: 'DATABASE_CONNECTION_ERROR',
  
  // Generic
  UNKNOWN_ERROR: 'UNKNOWN_ERROR'
} as const;