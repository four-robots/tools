/**
 * Security Monitoring Middleware
 * 
 * Provides comprehensive security monitoring including:
 * - Authentication attempt logging
 * - Failed login tracking and blocking
 * - Rate limiting with multiple strategies
 * - Security event correlation
 * - Automated threat response
 * 
 * Part of Multi-tenant Search Infrastructure security enhancements
 */

import { Request, Response, NextFunction } from 'express';
import { DatabasePool } from '../../../core/src/utils/database-pool.js';
import { logger } from '../../../core/src/utils/logger.js';
import { 
  validateIPAddress, 
  sanitizeRateLimitKey,
  logSecurityViolation 
} from '../../../core/src/utils/security-validation.js';

interface RateLimitConfig {
  windowMs: number;
  maxAttempts: number;
  blockDurationMs: number;
  skipSuccessfulRequests?: boolean;
  keyGenerator?: (req: Request) => string;
}

interface SecurityEvent {
  type: 'auth_failure' | 'auth_success' | 'rate_limit_exceeded' | 'suspicious_activity' | 'security_violation';
  tenantId?: string;
  userId?: string;
  ipAddress: string;
  userAgent?: string;
  endpoint: string;
  method: string;
  details: Record<string, any>;
  severity: 'low' | 'medium' | 'high' | 'critical';
  requestId: string;
}

interface RateLimitEntry {
  key: string;
  count: number;
  windowStart: number;
  blockedUntil?: number;
}

export class SecurityMonitoringMiddleware {
  private db: DatabasePool;
  private rateLimitCache = new Map<string, RateLimitEntry>();
  private securityEventBuffer: SecurityEvent[] = [];
  private bufferFlushInterval: NodeJS.Timeout;

  constructor() {
    this.db = new DatabasePool();
    
    // Flush security events every 30 seconds
    this.bufferFlushInterval = setInterval(() => {
      this.flushSecurityEventBuffer();
    }, 30000);

    // Clean up rate limit cache every 5 minutes
    setInterval(() => {
      this.cleanupRateLimitCache();
    }, 300000);
  }

  /**
   * Authentication monitoring middleware
   */
  authenticationMonitoring() {
    return async (req: Request, res: Response, next: NextFunction) => {
      const originalSend = res.send;
      const requestId = req.requestId || crypto.randomUUID();
      const ipAddress = this.getClientIpAddress(req);
      const userAgent = req.headers['user-agent'];

      // Override res.send to capture authentication results
      res.send = function(data: any) {
        const statusCode = res.statusCode;
        const isAuthEndpoint = req.path.includes('/auth/') || req.path.includes('/login') || req.path.includes('/token');
        
        if (isAuthEndpoint) {
          const securityEvent: SecurityEvent = {
            type: statusCode >= 200 && statusCode < 300 ? 'auth_success' : 'auth_failure',
            tenantId: req.tenantContext?.tenant_id,
            userId: req.tenantContext?.user_id || req.body?.userId || req.body?.username,
            ipAddress,
            userAgent,
            endpoint: req.path,
            method: req.method,
            severity: statusCode >= 400 ? 'medium' : 'low',
            requestId,
            details: {
              statusCode,
              authMethod: req.headers.authorization ? 'bearer' : (req.headers['x-api-key'] ? 'api_key' : 'unknown'),
              responseSize: typeof data === 'string' ? data.length : JSON.stringify(data).length
            }
          };

          // Add to buffer for batch processing
          (res as any).securityMonitoring.addSecurityEvent(securityEvent);
        }

        return originalSend.call(this, data);
      };

      // Attach monitoring instance to response for access in other middlewares
      (res as any).securityMonitoring = this;
      next();
    };
  }

  /**
   * Rate limiting middleware with adaptive thresholds
   */
  rateLimiting(config: RateLimitConfig) {
    return async (req: Request, res: Response, next: NextFunction) => {
      const key = config.keyGenerator ? config.keyGenerator(req) : this.generateRateLimitKey(req);
      const sanitizedKey = sanitizeRateLimitKey(key);
      const now = Date.now();
      
      try {
        // Get or create rate limit entry
        let entry = this.rateLimitCache.get(sanitizedKey);
        const windowStart = now - config.windowMs;

        if (!entry || entry.windowStart < windowStart) {
          // New window or expired entry
          entry = {
            key: sanitizedKey,
            count: 0,
            windowStart: now
          };
        }

        // Check if currently blocked
        if (entry.blockedUntil && now < entry.blockedUntil) {
          const remainingBlockTime = Math.ceil((entry.blockedUntil - now) / 1000);
          
          // Log rate limit exceeded event
          this.addSecurityEvent({
            type: 'rate_limit_exceeded',
            tenantId: req.tenantContext?.tenant_id,
            ipAddress: this.getClientIpAddress(req),
            userAgent: req.headers['user-agent'],
            endpoint: req.path,
            method: req.method,
            severity: 'high',
            requestId: req.requestId || crypto.randomUUID(),
            details: {
              rateLimitKey: sanitizedKey,
              attemptCount: entry.count,
              maxAttempts: config.maxAttempts,
              remainingBlockTime,
              windowMs: config.windowMs
            }
          });

          return res.status(429).json({
            error: 'Rate limit exceeded',
            message: `Too many requests. Try again in ${remainingBlockTime} seconds.`,
            retryAfter: remainingBlockTime,
            request_id: req.requestId
          });
        }

        // Increment counter
        entry.count++;

        // Check if limit exceeded
        if (entry.count > config.maxAttempts) {
          entry.blockedUntil = now + config.blockDurationMs;
          
          // Log security violation
          logSecurityViolation('Rate limit exceeded - blocking IP', {
            tenantId: req.tenantContext?.tenant_id,
            ipAddress: this.getClientIpAddress(req),
            userAgent: req.headers['user-agent'],
            endpoint: req.path,
            input: `${entry.count}/${config.maxAttempts} attempts`
          });

          this.rateLimitCache.set(sanitizedKey, entry);
          
          return res.status(429).json({
            error: 'Rate limit exceeded',
            message: `Too many requests. Blocked for ${Math.ceil(config.blockDurationMs / 1000)} seconds.`,
            retryAfter: Math.ceil(config.blockDurationMs / 1000),
            request_id: req.requestId
          });
        }

        // Update cache
        this.rateLimitCache.set(sanitizedKey, entry);

        // Add rate limit headers
        res.set({
          'X-RateLimit-Limit': config.maxAttempts.toString(),
          'X-RateLimit-Remaining': Math.max(0, config.maxAttempts - entry.count).toString(),
          'X-RateLimit-Reset': new Date(entry.windowStart + config.windowMs).toISOString(),
          'X-RateLimit-Policy': `${config.maxAttempts};w=${Math.ceil(config.windowMs / 1000)}`
        });

        next();

      } catch (error) {
        logger.error('Rate limiting error:', error);
        // Fail open - allow request but log error
        next();
      }
    };
  }

  /**
   * Failed authentication tracking
   */
  failedAuthTracking() {
    return async (req: Request, res: Response, next: NextFunction) => {
      const originalSend = res.send;
      const ipAddress = this.getClientIpAddress(req);
      
      res.send = function(data: any) {
        const statusCode = res.statusCode;
        const isAuthEndpoint = req.path.includes('/auth/') || req.path.includes('/login');
        
        if (isAuthEndpoint && statusCode >= 400) {
          // Track failed authentication attempt
          (res as any).securityMonitoring.trackFailedAuth(ipAddress, req);
        }

        return originalSend.call(this, data);
      };

      next();
    };
  }

  /**
   * Suspicious activity detection
   */
  suspiciousActivityDetection() {
    return async (req: Request, res: Response, next: NextFunction) => {
      const ipAddress = this.getClientIpAddress(req);
      const userAgent = req.headers['user-agent'] || '';
      
      const suspiciousPatterns = [
        // Bot-like user agents
        /bot|crawler|spider|scraper/i,
        // Suspicious tools
        /curl|wget|python|php|java/i,
        // Empty or very short user agents
        /^.{0,10}$/,
        // SQL injection attempts in user agent
        /(union|select|insert|drop|delete)/i
      ];

      const isSuspicious = suspiciousPatterns.some(pattern => pattern.test(userAgent));
      
      if (isSuspicious) {
        this.addSecurityEvent({
          type: 'suspicious_activity',
          tenantId: req.tenantContext?.tenant_id,
          ipAddress,
          userAgent,
          endpoint: req.path,
          method: req.method,
          severity: 'medium',
          requestId: req.requestId || crypto.randomUUID(),
          details: {
            reason: 'Suspicious user agent detected',
            pattern: 'user_agent_analysis'
          }
        });

        // Add suspicious activity header for monitoring
        res.set('X-Security-Alert', 'suspicious-user-agent');
      }

      next();
    };
  }

  /**
   * Security headers middleware
   */
  securityHeaders() {
    return (req: Request, res: Response, next: NextFunction) => {
      // Security headers
      res.set({
        'X-Frame-Options': 'DENY',
        'X-Content-Type-Options': 'nosniff',
        'X-XSS-Protection': '1; mode=block',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:",
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload'
      });

      next();
    };
  }

  // ===================
  // PRIVATE METHODS
  // ===================

  private generateRateLimitKey(req: Request): string {
    const ipAddress = this.getClientIpAddress(req);
    const tenantId = req.tenantContext?.tenant_id || 'anonymous';
    const endpoint = req.route?.path || req.path;
    
    return `${tenantId}:${ipAddress}:${endpoint}`;
  }

  private getClientIpAddress(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'] as string;
    if (forwarded) {
      const ips = forwarded.split(',').map(ip => ip.trim());
      const clientIp = ips[0];
      if (validateIPAddress(clientIp)) {
        return clientIp;
      }
    }

    const realIp = req.headers['x-real-ip'] as string;
    if (realIp && validateIPAddress(realIp)) {
      return realIp;
    }

    const remoteAddress = req.socket.remoteAddress;
    if (remoteAddress && validateIPAddress(remoteAddress)) {
      return remoteAddress;
    }

    return 'unknown';
  }

  private addSecurityEvent(event: SecurityEvent): void {
    this.securityEventBuffer.push(event);
    
    // If buffer is getting full, flush immediately
    if (this.securityEventBuffer.length >= 100) {
      this.flushSecurityEventBuffer();
    }

    // Log critical events immediately
    if (event.severity === 'critical') {
      logger.error('Critical security event', event);
    }
  }

  private async flushSecurityEventBuffer(): Promise<void> {
    if (this.securityEventBuffer.length === 0) return;

    const events = [...this.securityEventBuffer];
    this.securityEventBuffer = [];

    try {
      // Batch insert security events
      const auditEntries = events.map(event => ({
        tenant_id: event.tenantId || null,
        user_id: event.userId || null,
        action: `security_${event.type}`,
        resource_type: 'security_event',
        resource_path: event.endpoint,
        action_details: JSON.stringify({
          type: event.type,
          severity: event.severity,
          method: event.method,
          user_agent: event.userAgent,
          ...event.details
        }),
        ip_address: event.ipAddress,
        user_agent: event.userAgent,
        request_id: event.requestId,
        severity_level: event.severity,
        status: event.type.includes('failure') ? 'failed' : 'success'
      }));

      if (auditEntries.length > 0) {
        await this.db.db
          .insertInto('tenant_audit_logs')
          .values(auditEntries)
          .execute();
      }

      logger.info(`Flushed ${events.length} security events to audit log`);

    } catch (error) {
      logger.error('Failed to flush security events:', error);
      // Re-add failed events to buffer for retry
      this.securityEventBuffer.unshift(...events);
    }
  }

  private async trackFailedAuth(ipAddress: string, req: Request): Promise<void> {
    const key = `failed_auth:${ipAddress}`;
    const windowMs = 15 * 60 * 1000; // 15 minutes
    const maxFailures = 5;
    const now = Date.now();

    try {
      // Get current failure count from database
      const existing = await this.db.db
        .selectFrom('tenant_audit_logs')
        .select(['id'])
        .where('action', '=', 'security_auth_failure')
        .where('ip_address', '=', ipAddress)
        .where('created_at', '>', new Date(now - windowMs).toISOString())
        .execute();

      const failureCount = existing.length + 1;

      if (failureCount >= maxFailures) {
        // Create security alert for repeated failed authentication
        await this.db.db
          .insertInto('tenant_alerts')
          .values({
            tenant_id: req.tenantContext?.tenant_id || null,
            alert_type: 'security_breach_attempt',
            severity: 'high',
            title: 'Repeated Authentication Failures',
            message: `${failureCount} failed authentication attempts from IP ${ipAddress} in the last 15 minutes`,
            alert_data: JSON.stringify({
              ip_address: ipAddress,
              failure_count: failureCount,
              time_window: '15m',
              endpoint: req.path,
              user_agent: req.headers['user-agent']
            })
          })
          .execute();

        logSecurityViolation('Repeated authentication failures detected', {
          ipAddress,
          endpoint: req.path,
          userAgent: req.headers['user-agent'] as string,
          input: `${failureCount} failures in 15 minutes`
        });
      }

    } catch (error) {
      logger.error('Failed to track authentication failure:', error);
    }
  }

  private cleanupRateLimitCache(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.rateLimitCache.entries()) {
      // Remove entries that are expired and not blocked
      if ((!entry.blockedUntil || now > entry.blockedUntil) && 
          (now - entry.windowStart > 60 * 60 * 1000)) { // 1 hour old
        this.rateLimitCache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.debug(`Cleaned up ${cleaned} expired rate limit entries`);
    }
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.bufferFlushInterval) {
      clearInterval(this.bufferFlushInterval);
    }
    this.flushSecurityEventBuffer();
  }
}

// Export configured middleware instances
export const securityMonitoring = new SecurityMonitoringMiddleware();

// Common rate limiting configurations
export const authRateLimit = securityMonitoring.rateLimiting({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxAttempts: 5,
  blockDurationMs: 30 * 60 * 1000, // 30 minutes
  keyGenerator: (req) => `auth:${req.socket.remoteAddress || 'unknown'}`
});

export const apiRateLimit = securityMonitoring.rateLimiting({
  windowMs: 60 * 1000, // 1 minute
  maxAttempts: 100,
  blockDurationMs: 5 * 60 * 1000, // 5 minutes
  keyGenerator: (req) => `api:${req.tenantContext?.tenant_id || 'anonymous'}:${req.socket.remoteAddress || 'unknown'}`
});

export const searchRateLimit = securityMonitoring.rateLimiting({
  windowMs: 60 * 1000, // 1 minute
  maxAttempts: 50,
  blockDurationMs: 2 * 60 * 1000, // 2 minutes
  keyGenerator: (req) => `search:${req.tenantContext?.tenant_id || 'anonymous'}`
});

export const authMonitoring = securityMonitoring.authenticationMonitoring();
export const failedAuthTracking = securityMonitoring.failedAuthTracking();
export const suspiciousActivityDetection = securityMonitoring.suspiciousActivityDetection();
export const securityHeaders = securityMonitoring.securityHeaders();