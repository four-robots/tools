/**
 * Error Handler Middleware
 * 
 * Global error handling for unhandled exceptions and errors.
 */

import { Request, Response, NextFunction } from 'express';
import { ValidationError } from 'express-validator';

interface ErrorWithStatus extends Error {
  status?: number;
  statusCode?: number;
  code?: string;
}

export function errorHandler(
  error: ErrorWithStatus,
  req: Request,
  res: any, // Using any to access our custom error method
  next: NextFunction
): void {
  console.error('Error:', {
    message: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    params: req.params
  });
  
  // Handle different types of errors
  if (error.name === 'ValidationError') {
    res.error('VALIDATION_ERROR', 'Request validation failed', error.message, 400);
    return;
  }
  
  if (error.name === 'SyntaxError' && 'body' in error) {
    res.error('INVALID_JSON', 'Invalid JSON in request body', null, 400);
    return;
  }
  
  if (error.code === 'ECONNREFUSED') {
    res.error('SERVICE_UNAVAILABLE', 'External service connection refused', null, 503);
    return;
  }
  
  if (error.code === 'ETIMEDOUT') {
    res.error('SERVICE_TIMEOUT', 'External service timeout', null, 504);
    return;
  }
  
  // Handle custom error codes
  const statusCode = error.status || error.statusCode || 500;
  const code = error.code || 'INTERNAL_ERROR';
  
  if (statusCode === 404) {
    res.error('NOT_FOUND', error.message || 'Resource not found', null, 404);
    return;
  }
  
  if (statusCode === 401) {
    res.error('UNAUTHORIZED', error.message || 'Authentication required', null, 401);
    return;
  }
  
  if (statusCode === 403) {
    res.error('FORBIDDEN', error.message || 'Insufficient permissions', null, 403);
    return;
  }
  
  if (statusCode >= 400 && statusCode < 500) {
    res.error(code, error.message || 'Client error', null, statusCode);
    return;
  }
  
  // Default internal server error
  const message = process.env.NODE_ENV === 'production' 
    ? 'Internal server error' 
    : error.message;
  
  res.error('INTERNAL_ERROR', message, null, 500);
}

// Async error wrapper
export function asyncHandler(fn: Function) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}