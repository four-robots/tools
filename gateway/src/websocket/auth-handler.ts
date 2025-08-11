/**
 * WebSocket Authentication Handler
 * 
 * Provides secure JWT token validation for WebSocket connections with proper
 * token freshness checks and rate limiting to prevent authentication bypass.
 */

import { Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { Logger } from '@mcp-tools/core/utils/logger';

interface AuthenticatedSocket extends Socket {
  user?: {
    id: string;
    email: string;
    name: string;
    tenantId: string;
    tokenIssuedAt: number;
    tokenExpiresAt: number;
  };
}

interface JWTPayload {
  sub?: string;
  id?: string;
  email: string;
  name: string;
  tenant_id?: string;
  tenantId?: string;
  iat: number;
  exp: number;
}

// Rate limiting for authentication attempts
const authAttempts = new Map<string, { count: number; lastAttempt: number; blocked: boolean }>();
const MAX_AUTH_ATTEMPTS = 5;
const AUTH_BLOCK_DURATION = 15 * 60 * 1000; // 15 minutes
const AUTH_WINDOW = 5 * 60 * 1000; // 5 minutes

/**
 * Validates JWT token and extracts user information with security checks
 */
export async function authenticateWebSocketConnection(
  socket: AuthenticatedSocket,
  token: string
): Promise<{ success: boolean; error?: string }> {
  const logger = new Logger('WebSocketAuth');
  const clientIp = socket.handshake.address;
  
  try {
    // Check rate limiting
    const rateLimitResult = checkAuthRateLimit(clientIp);
    if (!rateLimitResult.allowed) {
      logger.warn('WebSocket auth rate limit exceeded', { 
        clientIp, 
        attempts: rateLimitResult.attempts 
      });
      return { success: false, error: 'RATE_LIMIT_EXCEEDED' };
    }

    // Validate JWT token structure
    if (!token || typeof token !== 'string' || token.length < 10) {
      recordAuthAttempt(clientIp, false);
      return { success: false, error: 'INVALID_TOKEN_FORMAT' };
    }

    // Get JWT secret (in production this should be from secure env var)
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      logger.error('JWT_SECRET not configured');
      return { success: false, error: 'SERVER_CONFIG_ERROR' };
    }

    // Verify and decode token with comprehensive checks
    const decoded = jwt.verify(token, jwtSecret, {
      algorithms: ['HS256'], // Only allow secure algorithms
      issuer: process.env.JWT_ISSUER, // Validate issuer if configured
      audience: process.env.JWT_AUDIENCE, // Validate audience if configured
      maxAge: '24h', // Maximum token age
      ignoreExpiration: false,
      clockTolerance: 30, // 30 second clock tolerance
    }) as JWTPayload;

    // Validate token freshness - reject tokens older than 4 hours for websockets
    const now = Math.floor(Date.now() / 1000);
    const tokenAge = now - decoded.iat;
    const MAX_WEBSOCKET_TOKEN_AGE = 4 * 60 * 60; // 4 hours

    if (tokenAge > MAX_WEBSOCKET_TOKEN_AGE) {
      logger.warn('WebSocket token too old', { 
        tokenAge, 
        userId: decoded.sub || decoded.id,
        clientIp 
      });
      recordAuthAttempt(clientIp, false);
      return { success: false, error: 'TOKEN_TOO_OLD' };
    }

    // Extract and validate required user fields
    const userId = decoded.sub || decoded.id;
    if (!userId || !decoded.email || !decoded.name) {
      recordAuthAttempt(clientIp, false);
      logger.warn('Invalid token payload - missing required fields', { 
        hasUserId: !!userId,
        hasEmail: !!decoded.email,
        hasName: !!decoded.name,
        clientIp
      });
      return { success: false, error: 'INVALID_TOKEN_PAYLOAD' };
    }

    // Check for suspicious token reuse (basic replay attack detection)
    if (await isTokenSuspicious(userId, token)) {
      logger.warn('Suspicious token reuse detected', { userId, clientIp });
      recordAuthAttempt(clientIp, false);
      return { success: false, error: 'SUSPICIOUS_TOKEN' };
    }

    // Attach validated user information to socket
    socket.user = {
      id: userId,
      email: decoded.email,
      name: decoded.name,
      tenantId: decoded.tenant_id || decoded.tenantId || userId, // fallback to userId
      tokenIssuedAt: decoded.iat,
      tokenExpiresAt: decoded.exp,
    };

    // Record successful authentication
    recordAuthAttempt(clientIp, true);
    
    logger.info('WebSocket authentication successful', { 
      userId: socket.user.id, 
      tokenAge,
      clientIp 
    });

    return { success: true };

  } catch (error) {
    recordAuthAttempt(clientIp, false);
    
    if (error instanceof jwt.TokenExpiredError) {
      logger.warn('WebSocket token expired', { clientIp, error: error.message });
      return { success: false, error: 'TOKEN_EXPIRED' };
    } else if (error instanceof jwt.JsonWebTokenError) {
      logger.warn('Invalid WebSocket JWT token', { clientIp, error: error.message });
      return { success: false, error: 'INVALID_TOKEN' };
    } else if (error instanceof jwt.NotBeforeError) {
      logger.warn('WebSocket token used before valid', { clientIp, error: error.message });
      return { success: false, error: 'TOKEN_NOT_ACTIVE' };
    } else {
      logger.error('WebSocket authentication error', { clientIp, error });
      return { success: false, error: 'AUTH_ERROR' };
    }
  }
}

/**
 * Validates that the user's token is still fresh during active connection
 */
export function validateTokenFreshness(socket: AuthenticatedSocket): { valid: boolean; reason?: string } {
  if (!socket.user) {
    return { valid: false, reason: 'NO_USER' };
  }

  const now = Math.floor(Date.now() / 1000);
  
  // Check if token has expired
  if (now >= socket.user.tokenExpiresAt) {
    return { valid: false, reason: 'TOKEN_EXPIRED' };
  }
  
  // Check if token is too old for continued WebSocket use (4 hour sliding window)
  const tokenAge = now - socket.user.tokenIssuedAt;
  const MAX_WEBSOCKET_SESSION_AGE = 4 * 60 * 60; // 4 hours
  
  if (tokenAge > MAX_WEBSOCKET_SESSION_AGE) {
    return { valid: false, reason: 'SESSION_TOO_OLD' };
  }
  
  return { valid: true };
}

/**
 * Extracts token from WebSocket handshake with multiple fallback methods
 */
export function extractTokenFromHandshake(socket: Socket): string | null {
  // Method 1: Authorization header
  const authHeader = socket.handshake.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  
  // Method 2: Query parameter (less secure, but common for WebSockets)
  const tokenQuery = socket.handshake.query.token;
  if (tokenQuery && typeof tokenQuery === 'string') {
    return tokenQuery;
  }
  
  // Method 3: Auth object in handshake
  const authToken = socket.handshake.auth?.token;
  if (authToken && typeof authToken === 'string') {
    return authToken;
  }
  
  return null;
}

/**
 * Rate limiting for authentication attempts
 */
function checkAuthRateLimit(clientIp: string): { allowed: boolean; attempts: number } {
  const now = Date.now();
  const clientAttempts = authAttempts.get(clientIp);
  
  if (!clientAttempts) {
    return { allowed: true, attempts: 0 };
  }
  
  // Check if client is currently blocked
  if (clientAttempts.blocked && (now - clientAttempts.lastAttempt) < AUTH_BLOCK_DURATION) {
    return { allowed: false, attempts: clientAttempts.count };
  }
  
  // Reset if outside window or block duration expired
  if ((now - clientAttempts.lastAttempt) > AUTH_WINDOW || 
      (clientAttempts.blocked && (now - clientAttempts.lastAttempt) >= AUTH_BLOCK_DURATION)) {
    authAttempts.set(clientIp, { count: 0, lastAttempt: now, blocked: false });
    return { allowed: true, attempts: 0 };
  }
  
  // Check if within rate limit
  return { 
    allowed: clientAttempts.count < MAX_AUTH_ATTEMPTS, 
    attempts: clientAttempts.count 
  };
}

/**
 * Records authentication attempt for rate limiting
 */
function recordAuthAttempt(clientIp: string, success: boolean): void {
  const now = Date.now();
  const clientAttempts = authAttempts.get(clientIp) || { count: 0, lastAttempt: now, blocked: false };
  
  if (success) {
    // Reset on successful auth
    authAttempts.set(clientIp, { count: 0, lastAttempt: now, blocked: false });
  } else {
    const newCount = clientAttempts.count + 1;
    const shouldBlock = newCount >= MAX_AUTH_ATTEMPTS;
    
    authAttempts.set(clientIp, { 
      count: newCount, 
      lastAttempt: now, 
      blocked: shouldBlock 
    });
  }
}

/**
 * Basic suspicious token detection (can be enhanced with Redis/database)
 */
async function isTokenSuspicious(userId: string, token: string): Promise<boolean> {
  // For now, implement basic in-memory check
  // In production, this should use Redis or database for distributed detection
  
  // This is a placeholder - implement actual suspicious token detection logic
  // Such as checking for:
  // - Multiple connections with same token from different IPs
  // - Token reuse after reported compromise
  // - Tokens from known bot networks
  
  return false;
}

/**
 * Cleanup expired rate limiting data periodically
 */
setInterval(() => {
  const now = Date.now();
  const expiredThreshold = now - (AUTH_BLOCK_DURATION * 2);
  
  for (const [ip, data] of authAttempts.entries()) {
    if (data.lastAttempt < expiredThreshold) {
      authAttempts.delete(ip);
    }
  }
}, 10 * 60 * 1000); // Run every 10 minutes

export { AuthenticatedSocket };