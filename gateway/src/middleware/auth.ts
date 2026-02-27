/**
 * Authentication Middleware
 * 
 * Handles JWT token validation for protected API routes.
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    name: string;
  };
}

export function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  // Skip auth for health checks and documentation
  if (req.path.startsWith('/health') || req.path.startsWith('/api/docs')) {
    return next();
  }
  
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).error('UNAUTHORIZED', 'Missing or invalid authorization header');
    return;
  }
  
  const token = authHeader.substring(7); // Remove 'Bearer ' prefix
  
  try {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      res.status(500).error('CONFIG_ERROR', 'JWT_SECRET is not configured');
      return;
    }
    const decoded = jwt.verify(token, jwtSecret) as any;
    
    // Add user info to request
    req.user = {
      id: decoded.sub || decoded.id,
      email: decoded.email,
      name: decoded.name
    };
    
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).error('TOKEN_EXPIRED', 'JWT token has expired');
    } else if (error instanceof jwt.JsonWebTokenError) {
      res.status(401).error('INVALID_TOKEN', 'Invalid JWT token');
    } else {
      res.status(401).error('UNAUTHORIZED', 'Authentication failed');
    }
  }
}

// Development middleware that creates a mock user when no auth is provided
export function mockAuthMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  // Skip auth for health checks and documentation
  if (req.path.startsWith('/health') || req.path.startsWith('/api/docs')) {
    return next();
  }
  
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    // Create mock user for development
    req.user = {
      id: 'dev-user-123',
      email: 'developer@mcp-tools.dev',
      name: 'Development User'
    };
    return next();
  }
  
  // If auth header is provided, validate normally
  authMiddleware(req, res, next);
}

// Use mock auth in development, real auth in production
export const auth = process.env.NODE_ENV === 'development' ? mockAuthMiddleware : authMiddleware;