/**
 * Tenant Isolation Middleware
 * 
 * Provides comprehensive tenant isolation and context management including:
 * - JWT token validation with tenant claims
 * - API key authentication for tenant access
 * - Tenant context extraction and validation
 * - Row-level security context setting
 * - Cross-tenant authorization checks
 * - Request isolation and audit logging
 * 
 * Part of Multi-tenant Search Infrastructure (Work Item 4.2.1)
 */

import { Request, Response, NextFunction } from 'express';
import { TenantAuthenticationService } from '../../../core/src/services/multi-tenant/tenant-authentication-service.js';
import { TenantResourceService } from '../../../core/src/services/multi-tenant/tenant-resource-service.js';
import { 
  TenantContext, 
  TenantJwtClaims,
  validateTenantContext,
  TENANT_PERMISSIONS 
} from '../../../core/src/shared/types/multi-tenant.js';
import { logger } from '../../../core/src/utils/logger.js';
import { DatabasePool } from '../../../core/src/utils/database-pool.js';

// Extend Express Request to include tenant context
declare global {
  namespace Express {
    interface Request {
      tenantContext?: TenantContext;
      tenantClaims?: TenantJwtClaims;
      crossTenantAccess?: boolean;
      targetTenantIds?: string[];
      requestId?: string;
    }
  }
}

interface TenantMiddlewareOptions {
  requireTenant?: boolean;
  allowCrossTenantAccess?: boolean;
  requiredPermissions?: string[];
  checkResourceQuota?: boolean;
  enableAuditLogging?: boolean;
}

export class TenantIsolationMiddleware {
  private authService: TenantAuthenticationService;
  private resourceService: TenantResourceService;
  private db: DatabasePool;

  constructor() {
    this.authService = new TenantAuthenticationService();
    this.resourceService = new TenantResourceService();
    this.db = new DatabasePool();
  }

  /**
   * Main tenant isolation middleware
   */
  tenantIsolation(options: TenantMiddlewareOptions = {}) {
    return async (req: Request, res: Response, next: NextFunction) => {
      const requestId = req.headers['x-request-id'] as string || crypto.randomUUID();
      req.requestId = requestId;

      try {
        logger.info(`Processing tenant isolation for request: ${requestId}`, {
          method: req.method,
          path: req.path,
          options
        });

        // Extract authentication information
        const authResult = await this.extractAuthentication(req);
        if (!authResult.success) {
          if (options.requireTenant) {
            return res.status(401).json({
              error: 'Authentication required',
              message: authResult.error,
              request_id: requestId
            });
          }
          // Continue without tenant context for public endpoints
          return next();
        }

        // Set tenant context
        req.tenantContext = authResult.tenant_context;
        req.tenantClaims = authResult.claims;

        // Validate tenant context
        const isValidContext = await this.authService.validateTenantContext(req.tenantContext!);
        if (!isValidContext) {
          return res.status(403).json({
            error: 'Invalid tenant context',
            message: 'Tenant context validation failed',
            request_id: requestId
          });
        }

        // Check permissions if required
        if (options.requiredPermissions && options.requiredPermissions.length > 0) {
          const hasPermissions = await this.checkRequiredPermissions(
            req.tenantContext!,
            options.requiredPermissions
          );
          if (!hasPermissions) {
            return res.status(403).json({
              error: 'Insufficient permissions',
              message: 'Required permissions not met',
              request_id: requestId
            });
          }
        }

        // Handle cross-tenant access
        if (options.allowCrossTenantAccess) {
          const crossTenantResult = await this.handleCrossTenantAccess(req);
          req.crossTenantAccess = crossTenantResult.allowed;
          req.targetTenantIds = crossTenantResult.targetTenantIds;
        }

        // Check resource quotas if enabled
        if (options.checkResourceQuota) {
          const quotaCheck = await this.checkResourceQuota(req);
          if (!quotaCheck.allowed) {
            return res.status(429).json({
              error: 'Resource quota exceeded',
              message: quotaCheck.message,
              request_id: requestId
            });
          }
        }

        // Set database context for Row Level Security
        await this.setDatabaseContext(req.tenantContext!);

        // Audit logging if enabled
        if (options.enableAuditLogging) {
          await this.logTenantRequest(req);
        }

        logger.info(`Tenant isolation successful for request: ${requestId}`, {
          tenant_id: req.tenantContext?.tenant_id,
          user_id: req.tenantContext?.user_id,
          cross_tenant_access: req.crossTenantAccess
        });

        next();

      } catch (error) {
        logger.error(`Tenant isolation failed for request: ${requestId}`, error);
        res.status(500).json({
          error: 'Internal server error',
          message: 'Tenant isolation processing failed',
          request_id: requestId
        });
      }
    };
  }

  /**
   * Middleware to require specific tenant permissions
   */
  requirePermissions(permissions: string[]) {
    return this.tenantIsolation({
      requireTenant: true,
      requiredPermissions: permissions,
      enableAuditLogging: true
    });
  }

  /**
   * Middleware for cross-tenant operations
   */
  allowCrossTenant(requiredPermissions: string[] = []) {
    return this.tenantIsolation({
      requireTenant: true,
      allowCrossTenantAccess: true,
      requiredPermissions: requiredPermissions,
      enableAuditLogging: true
    });
  }

  /**
   * Middleware with atomic quota checking and usage recording
   */
  withQuotaCheck(resourceType: string, usage: number = 1) {
    return async (req: Request, res: Response, next: NextFunction) => {
      if (!req.tenantContext?.tenant_id) {
        return res.status(401).json({
          error: 'Tenant context required for quota check'
        });
      }

      try {
        // Perform atomic quota check and usage recording in a single transaction
        await this.db.db.transaction(async (trx) => {
          // Lock and check quota in atomic operation
          const quota = await trx
            .selectFrom('tenant_resource_quotas')
            .selectAll()
            .where('tenant_id', '=', req.tenantContext!.tenant_id)
            .where('resource_type', '=', resourceType)
            .forUpdate() // Lock the row for update
            .executeTakeFirst();

          if (quota && quota.is_enforced) {
            const projectedUsage = quota.current_usage + usage;
            
            // Check limits
            if ((quota.hard_limit && projectedUsage > quota.hard_limit) || 
                projectedUsage > quota.quota_limit) {
              const error = new Error('Resource quota exceeded');
              (error as any).quotaExceeded = true;
              (error as any).remainingQuota = Math.max(0, quota.quota_limit - quota.current_usage);
              (error as any).reason = quota.hard_limit && projectedUsage > quota.hard_limit 
                ? 'Hard limit exceeded' 
                : 'Quota limit exceeded';
              throw error;
            }

            // Atomically update usage if check passed
            await trx
              .updateTable('tenant_resource_quotas')
              .set({
                current_usage: projectedUsage,
                updated_at: new Date().toISOString()
              })
              .where('tenant_id', '=', req.tenantContext!.tenant_id)
              .where('resource_type', '=', resourceType)
              .execute();

            // Record usage metric
            await trx
              .insertInto('tenant_usage_metrics')
              .values({
                tenant_id: req.tenantContext!.tenant_id,
                metric_name: resourceType,
                metric_value: usage,
                metric_unit: this.getResourceUnit(resourceType),
                measurement_period: 'real-time',
                period_start: new Date().toISOString(),
                period_end: new Date().toISOString(),
                metadata: JSON.stringify({
                  endpoint: req.path,
                  method: req.method,
                  request_id: req.requestId
                })
              })
              .execute();
          }
        });

        next();

      } catch (error) {
        logger.error('Atomic quota check failed:', error);
        
        if ((error as any).quotaExceeded) {
          return res.status(429).json({
            error: 'Resource quota exceeded',
            message: (error as any).reason,
            remaining_quota: (error as any).remainingQuota,
            request_id: req.requestId
          });
        }

        res.status(500).json({
          error: 'Quota check failed',
          request_id: req.requestId
        });
      }
    };
  }

  /**
   * Get resource unit for a resource type
   */
  private getResourceUnit(resourceType: string): string {
    switch (resourceType) {
      case 'storage_gb': return 'GB';
      case 'api_calls_per_day': return 'calls';
      case 'users': return 'users';
      case 'search_requests_per_hour': return 'requests';
      case 'federation_connections': return 'connections';
      default: return 'units';
    }
  }

  // ===================
  // PRIVATE METHODS
  // ===================

  /**
   * Extract authentication from request (JWT or API key)
   */
  private async extractAuthentication(req: Request): Promise<{
    success: boolean;
    tenant_context?: TenantContext;
    claims?: TenantJwtClaims;
    error?: string;
  }> {
    // Try JWT token first
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const tokenResult = await this.authService.validateTenantToken(token);
      
      if (tokenResult.valid) {
        return {
          success: true,
          tenant_context: tokenResult.tenant_context,
          claims: tokenResult.claims
        };
      }
    }

    // Try API key
    const apiKey = req.headers['x-api-key'] as string;
    if (apiKey) {
      const ipAddress = this.getClientIpAddress(req);
      const apiKeyResult = await this.authService.validateApiKey(apiKey, ipAddress);
      
      if (apiKeyResult.valid) {
        return {
          success: true,
          tenant_context: apiKeyResult.tenant_context
        };
      }
    }

    // Try tenant slug from subdomain or header
    const tenantSlug = this.extractTenantSlug(req);
    if (tenantSlug) {
      // For public access with tenant context (read-only operations)
      const tenantContext: TenantContext = {
        tenant_id: '', // Would need to resolve from slug
        permissions: [],
        federation_permissions: []
      };
      
      return {
        success: true,
        tenant_context: tenantContext
      };
    }

    return {
      success: false,
      error: 'No valid authentication found'
    };
  }

  /**
   * Check if user has required permissions
   */
  private async checkRequiredPermissions(
    tenantContext: TenantContext,
    requiredPermissions: string[]
  ): Promise<boolean> {
    if (!tenantContext.user_id || !tenantContext.tenant_id) {
      return false; // API keys might not have user context
    }

    for (const permission of requiredPermissions) {
      const hasPermission = await this.authService.hasPermission(
        tenantContext.tenant_id,
        tenantContext.user_id,
        permission
      );
      if (!hasPermission) {
        return false;
      }
    }

    return true;
  }

  /**
   * Handle cross-tenant access authorization
   */
  private async handleCrossTenantAccess(req: Request): Promise<{
    allowed: boolean;
    targetTenantIds: string[];
  }> {
    const tenantContext = req.tenantContext!;
    const targetTenantIds = this.extractTargetTenantIds(req);

    if (targetTenantIds.length === 0) {
      return { allowed: true, targetTenantIds: [] };
    }

    const allowedTenantIds: string[] = [];

    for (const targetTenantId of targetTenantIds) {
      // Skip self-access
      if (targetTenantId === tenantContext.tenant_id) {
        allowedTenantIds.push(targetTenantId);
        continue;
      }

      // Check cross-tenant permission
      const hasAccess = await this.authService.hasCrossTenantAccess(
        tenantContext.tenant_id!,
        targetTenantId,
        this.getResourceTypeFromPath(req.path),
        'read' // Default to read access for GET, would need more sophisticated mapping
      );

      if (hasAccess) {
        allowedTenantIds.push(targetTenantId);
      }
    }

    return {
      allowed: allowedTenantIds.length > 0,
      targetTenantIds: allowedTenantIds
    };
  }

  /**
   * Check resource quota for the request
   */
  private async checkResourceQuota(req: Request): Promise<{
    allowed: boolean;
    message?: string;
  }> {
    const tenantId = req.tenantContext?.tenant_id;
    if (!tenantId) {
      return { allowed: true }; // No tenant context, skip quota check
    }

    const resourceType = this.getResourceTypeForEndpoint(req.path, req.method);
    if (!resourceType) {
      return { allowed: true }; // No relevant resource type
    }

    const quotaCheck = await this.resourceService.checkResourceQuota(
      tenantId,
      resourceType,
      1
    );

    return {
      allowed: quotaCheck.allowed,
      message: quotaCheck.reason
    };
  }

  /**
   * Set database context for Row Level Security with proper validation
   */
  private async setDatabaseContext(tenantContext: TenantContext): Promise<void> {
    if (!tenantContext.tenant_id) return;

    try {
      // Validate UUID format to prevent injection
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(tenantContext.tenant_id)) {
        logger.error('Invalid tenant ID format detected:', tenantContext.tenant_id);
        throw new Error('Invalid tenant ID format - security violation detected');
      }

      // Additional validation - ensure tenant exists and is active
      const tenantExists = await this.db.db
        .selectFrom('tenants')
        .select('id')
        .where('id', '=', tenantContext.tenant_id)
        .where('status', '=', 'active')
        .where('deleted_at', 'is', null)
        .executeTakeFirst();

      if (!tenantExists) {
        logger.error('Attempted to set context for non-existent or inactive tenant:', tenantContext.tenant_id);
        throw new Error('Invalid tenant context - tenant not found or inactive');
      }

      // Use parameterized queries with explicit type casting for security
      await this.db.db
        .raw('SET LOCAL app.current_tenant_id = ?::uuid', [tenantContext.tenant_id])
        .execute();

      // Validate and set user context if available
      if (tenantContext.user_id) {
        // For user_id, ensure it's a safe string (basic alphanumeric + allowed chars)
        if (!/^[a-zA-Z0-9\-_@.]{1,255}$/.test(tenantContext.user_id)) {
          logger.error('Invalid user ID format detected:', tenantContext.user_id);
          throw new Error('Invalid user ID format - security violation detected');
        }

        await this.db.db
          .raw('SET LOCAL app.current_user_id = ?', [tenantContext.user_id])
          .execute();
      }

      // Verify the context was set correctly
      const setTenantId = await this.db.db
        .raw("SELECT current_setting('app.current_tenant_id', true) as tenant_id")
        .execute();

      if (setTenantId.rows[0]?.tenant_id !== tenantContext.tenant_id) {
        throw new Error('Failed to verify database context was set correctly');
      }

    } catch (error) {
      logger.error('Failed to set database context:', error);
      throw error; // Re-throw to fail the request
    }
  }

  /**
   * Log tenant request for audit purposes
   */
  private async logTenantRequest(req: Request): Promise<void> {
    if (!req.tenantContext?.tenant_id) return;

    try {
      const auditData = {
        method: req.method,
        path: req.path,
        query: req.query,
        user_agent: req.headers['user-agent'],
        ip_address: this.getClientIpAddress(req),
        request_id: req.requestId,
        cross_tenant_access: req.crossTenantAccess,
        target_tenant_ids: req.targetTenantIds
      };

      await this.db.db
        .insertInto('tenant_audit_logs')
        .values({
          tenant_id: req.tenantContext.tenant_id,
          actor_tenant_id: req.crossTenantAccess ? req.tenantContext.tenant_id : undefined,
          user_id: req.tenantContext.user_id,
          action: `${req.method.toLowerCase()}_${req.path.split('/')[1] || 'root'}`,
          resource_type: 'api_endpoint',
          resource_path: req.path,
          action_details: JSON.stringify(auditData),
          ip_address: this.getClientIpAddress(req),
          user_agent: req.headers['user-agent'] as string,
          request_id: req.requestId,
          is_cross_tenant: req.crossTenantAccess || false
        })
        .execute();

    } catch (error) {
      logger.error('Failed to log tenant request:', error);
    }
  }

  // ===================
  // UTILITY METHODS
  // ===================

  /**
   * Extract client IP address from request
   */
  private getClientIpAddress(req: Request): string {
    return (req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
           req.headers['x-real-ip'] as string ||
           req.socket.remoteAddress ||
           'unknown';
  }

  /**
   * Extract tenant slug from subdomain or header
   */
  private extractTenantSlug(req: Request): string | undefined {
    // Try header first
    const headerSlug = req.headers['x-tenant-slug'] as string;
    if (headerSlug) return headerSlug;

    // Try subdomain extraction
    const host = req.headers.host;
    if (host && host.includes('.')) {
      const parts = host.split('.');
      if (parts.length >= 3) { // subdomain.domain.tld
        return parts[0];
      }
    }

    // Try path-based tenant (e.g., /tenant/slug/api/...)
    const pathParts = req.path.split('/');
    if (pathParts[1] === 'tenant' && pathParts[2]) {
      return pathParts[2];
    }

    return undefined;
  }

  /**
   * Extract target tenant IDs from request
   */
  private extractTargetTenantIds(req: Request): string[] {
    // Check header
    const headerTenants = req.headers['x-target-tenants'] as string;
    if (headerTenants) {
      return headerTenants.split(',').map(id => id.trim());
    }

    // Check query parameter
    const queryTenants = req.query.target_tenants as string;
    if (queryTenants) {
      return queryTenants.split(',').map(id => id.trim());
    }

    // Check request body
    if (req.body && req.body.target_tenant_ids) {
      return Array.isArray(req.body.target_tenant_ids) 
        ? req.body.target_tenant_ids 
        : [req.body.target_tenant_ids];
    }

    return [];
  }

  /**
   * Get resource type from API path
   */
  private getResourceTypeFromPath(path: string): string {
    const pathParts = path.split('/');
    const resource = pathParts[2] || pathParts[1]; // /api/resource or /resource
    
    switch (resource) {
      case 'search': return 'search_requests';
      case 'kanban': return 'kanban_operations';
      case 'wiki': return 'wiki_operations';
      case 'memory': return 'memory_operations';
      default: return 'api_operations';
    }
  }

  /**
   * Get resource type for quota checking based on endpoint
   */
  private getResourceTypeForEndpoint(path: string, method: string): string | null {
    // API calls quota
    if (path.startsWith('/api/')) {
      return 'api_calls_per_day';
    }

    // Search requests quota
    if (path.includes('/search') && method === 'GET') {
      return 'search_requests_per_hour';
    }

    // Storage operations (file uploads, etc.)
    if (method === 'POST' && path.includes('/upload')) {
      return 'storage_gb';
    }

    return null;
  }
}

// Export middleware factory functions for easy use
export const tenantMiddleware = new TenantIsolationMiddleware();

export const requireTenant = (options: Omit<TenantMiddlewareOptions, 'requireTenant'> = {}) =>
  tenantMiddleware.tenantIsolation({ ...options, requireTenant: true });

export const requirePermissions = (permissions: string[]) =>
  tenantMiddleware.requirePermissions(permissions);

export const allowCrossTenant = (permissions: string[] = []) =>
  tenantMiddleware.allowCrossTenant(permissions);

export const withQuotaCheck = (resourceType: string, usage: number = 1) =>
  tenantMiddleware.withQuotaCheck(resourceType, usage);

// Convenience middleware for common patterns
export const requireAdmin = () =>
  requirePermissions([TENANT_PERMISSIONS.MANAGE_CONFIG, TENANT_PERMISSIONS.MANAGE_USERS]);

export const requireOwner = () =>
  requirePermissions([TENANT_PERMISSIONS.MANAGE_USERS, TENANT_PERMISSIONS.MANAGE_QUOTAS]);

export const allowFederation = () =>
  allowCrossTenant([TENANT_PERMISSIONS.MANAGE_FEDERATION]);

export const trackApiUsage = () =>
  withQuotaCheck('api_calls_per_day', 1);

export const trackSearchUsage = () =>
  withQuotaCheck('search_requests_per_hour', 1);