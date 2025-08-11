/**
 * Tenant Authentication Service
 * 
 * Handles comprehensive multi-tenant authentication including:
 * - JWT token generation with tenant claims
 * - Tenant context validation and extraction
 * - Cross-tenant authorization
 * - Session management with tenant isolation
 * - API key authentication and validation
 * 
 * Part of Multi-tenant Search Infrastructure (Work Item 4.2.1)
 */

import { logger } from '../../utils/logger.js';
import { DatabaseConnectionPool } from '../../utils/database-pool.js';
import { 
  TenantContext, 
  TenantJwtClaims, 
  TenantUser, 
  TenantApiKey,
  CrossTenantPermission,
  validateTenantJwtClaims,
  validateTenantContext,
  TENANT_PERMISSIONS,
  DEFAULT_TENANT_PERMISSIONS
} from '../../shared/types/multi-tenant.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { randomBytes, createHash } from 'crypto';
import { z } from 'zod';

interface AuthenticationResult {
  success: boolean;
  tenant_context?: TenantContext;
  error?: string;
  requires_2fa?: boolean;
}

interface TokenValidationResult {
  valid: boolean;
  claims?: TenantJwtClaims;
  tenant_context?: TenantContext;
  error?: string;
}

interface ApiKeyValidationResult {
  valid: boolean;
  tenant_context?: TenantContext;
  api_key?: TenantApiKey;
  error?: string;
}

export class TenantAuthenticationService {
  private db: DatabaseConnectionPool;
  private jwtSecret: string;
  private jwtIssuer: string;
  private jwtAudience: string;

  constructor() {
    this.db = new DatabaseConnectionPool();
    this.validateJwtConfiguration();
    this.jwtSecret = process.env.JWT_SECRET!;
    this.jwtIssuer = process.env.JWT_ISSUER || 'mcp-tools';
    this.jwtAudience = process.env.JWT_AUDIENCE || 'mcp-tools-api';
  }

  /**
   * Validate JWT configuration for security
   */
  private validateJwtConfiguration(): void {
    // Enforce secure JWT secret in production
    if (process.env.NODE_ENV === 'production') {
      if (!process.env.JWT_SECRET) {
        throw new Error('JWT_SECRET environment variable must be set in production');
      }
      
      if (process.env.JWT_SECRET.length < 32) {
        throw new Error('JWT_SECRET must be at least 32 characters long in production');
      }

      // Check for weak/common secrets
      const weakSecrets = [
        'your-super-secret-key',
        'secret',
        'password',
        'jwt-secret',
        'mcp-tools-secret'
      ];
      
      if (weakSecrets.includes(process.env.JWT_SECRET.toLowerCase())) {
        throw new Error('JWT_SECRET appears to be a weak or default secret. Please use a cryptographically secure random key.');
      }

      // Ensure secret has good entropy (basic check)
      const uniqueChars = new Set(process.env.JWT_SECRET.toLowerCase()).size;
      if (uniqueChars < 16) {
        throw new Error('JWT_SECRET appears to have low entropy. Please use a cryptographically secure random key.');
      }
    } else {
      // Development environment warnings
      if (!process.env.JWT_SECRET) {
        logger.warn('JWT_SECRET not set - using default key for development. This is insecure for production!');
        process.env.JWT_SECRET = 'dev-only-insecure-key-' + Math.random().toString(36);
      } else if (process.env.JWT_SECRET.length < 32) {
        logger.warn('JWT_SECRET is shorter than recommended 32 characters');
      }
    }

    // Validate other JWT settings
    if (process.env.JWT_ISSUER && !/^[a-zA-Z0-9\-\.]+$/.test(process.env.JWT_ISSUER)) {
      throw new Error('JWT_ISSUER contains invalid characters');
    }

    if (process.env.JWT_AUDIENCE && !/^[a-zA-Z0-9\-\.]+$/.test(process.env.JWT_AUDIENCE)) {
      throw new Error('JWT_AUDIENCE contains invalid characters');
    }
  }

  // ===================
  // JWT TOKEN MANAGEMENT
  // ===================

  /**
   * Generate JWT token with tenant claims
   */
  async generateTenantToken(
    tenantId: string, 
    userId: string, 
    sessionId?: string,
    expiresIn: string = '24h'
  ): Promise<string> {
    logger.info(`Generating JWT token for user ${userId} in tenant ${tenantId}`);

    try {
      // Get tenant user information
      const tenantUser = await this.getTenantUser(tenantId, userId);
      if (!tenantUser) {
        throw new Error('User not found in tenant');
      }

      if (tenantUser.status !== 'active') {
        throw new Error(`User account is ${tenantUser.status}`);
      }

      // Get tenant information
      const tenant = await this.getTenant(tenantId);
      if (!tenant) {
        throw new Error('Tenant not found');
      }

      if (tenant.status !== 'active') {
        throw new Error(`Tenant is ${tenant.status}`);
      }

      // Get user permissions including federation
      const permissions = await this.getUserPermissions(tenantId, userId);
      const federationPermissions = await this.getFederationPermissions(tenantId, userId);

      // Create JWT claims
      const claims: TenantJwtClaims = {
        sub: userId,
        tenant_id: tenantId,
        tenant_slug: tenant.slug,
        role: tenantUser.role,
        permissions,
        federation_permissions: federationPermissions,
        iss: this.jwtIssuer,
        aud: this.jwtAudience,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + this.parseExpiration(expiresIn),
        jti: crypto.randomUUID()
      };

      // Validate claims structure
      const validatedClaims = validateTenantJwtClaims(claims);

      // Sign token
      const token = jwt.sign(validatedClaims, this.jwtSecret, {
        algorithm: 'HS256'
      });

      // Store token metadata for revocation tracking
      await this.storeTokenMetadata(validatedClaims.jti, tenantId, userId, sessionId);

      // Update user last active timestamp
      await this.updateUserLastActive(tenantId, userId);

      logger.info(`Successfully generated JWT token for user ${userId} in tenant ${tenantId}`);
      return token;

    } catch (error) {
      logger.error('Failed to generate tenant token:', error);
      throw new Error(`Failed to generate tenant token: ${error.message}`);
    }
  }

  /**
   * Validate and parse JWT token
   */
  async validateTenantToken(token: string): Promise<TokenValidationResult> {
    try {
      // Verify and decode token
      const decoded = jwt.verify(token, this.jwtSecret, {
        algorithms: ['HS256'],
        issuer: this.jwtIssuer,
        audience: this.jwtAudience
      }) as any;

      // Validate claims structure
      const claims = validateTenantJwtClaims(decoded);

      // Check if token is revoked
      const isRevoked = await this.isTokenRevoked(claims.jti);
      if (isRevoked) {
        return { valid: false, error: 'Token has been revoked' };
      }

      // Verify tenant and user are still active
      const tenantUser = await this.getTenantUser(claims.tenant_id, claims.sub);
      if (!tenantUser || tenantUser.status !== 'active') {
        return { valid: false, error: 'User account is not active' };
      }

      const tenant = await this.getTenant(claims.tenant_id);
      if (!tenant || tenant.status !== 'active') {
        return { valid: false, error: 'Tenant is not active' };
      }

      // Create tenant context
      const tenantContext: TenantContext = {
        tenant_id: claims.tenant_id,
        user_id: claims.sub,
        role: claims.role,
        permissions: claims.permissions,
        federation_permissions: claims.federation_permissions
      };

      return {
        valid: true,
        claims,
        tenant_context: tenantContext
      };

    } catch (error) {
      logger.error('Token validation failed:', error);
      return { 
        valid: false, 
        error: error instanceof jwt.JsonWebTokenError ? error.message : 'Invalid token'
      };
    }
  }

  /**
   * Revoke JWT token
   */
  async revokeTenantToken(tokenId: string, revokedBy: string): Promise<void> {
    logger.info(`Revoking JWT token: ${tokenId}`);

    try {
      await this.db.db
        .insertInto('revoked_tokens')
        .values({
          token_id: tokenId,
          revoked_at: new Date().toISOString(),
          revoked_by: revokedBy
        })
        .execute();

      logger.info(`Successfully revoked JWT token: ${tokenId}`);

    } catch (error) {
      logger.error('Failed to revoke token:', error);
      throw new Error(`Failed to revoke token: ${error.message}`);
    }
  }

  /**
   * Refresh JWT token
   */
  async refreshTenantToken(currentToken: string): Promise<string> {
    logger.info('Refreshing JWT token');

    try {
      const validation = await this.validateTenantToken(currentToken);
      if (!validation.valid || !validation.claims) {
        throw new Error('Invalid token for refresh');
      }

      // Revoke current token
      await this.revokeTenantToken(validation.claims.jti, validation.claims.sub);

      // Generate new token
      const newToken = await this.generateTenantToken(
        validation.claims.tenant_id,
        validation.claims.sub
      );

      logger.info('Successfully refreshed JWT token');
      return newToken;

    } catch (error) {
      logger.error('Failed to refresh token:', error);
      throw new Error(`Failed to refresh token: ${error.message}`);
    }
  }

  // ===================
  // API KEY AUTHENTICATION
  // ===================

  /**
   * Generate API key for tenant
   */
  async generateApiKey(
    tenantId: string,
    keyName: string,
    permissions: string[],
    createdBy: string,
    options: {
      expiresAt?: Date;
      rateLimitPerMinute?: number;
      rateLimitPerDay?: number;
      allowedIps?: string[];
      scopes?: string[];
    } = {}
  ): Promise<{ apiKey: string; keyRecord: TenantApiKey }> {
    logger.info(`Generating API key '${keyName}' for tenant ${tenantId}`);

    try {
      // Generate API key
      const keyData = randomBytes(32).toString('hex');
      const keyPrefix = `tk_${tenantId.slice(0, 8)}`;
      const apiKey = `${keyPrefix}_${keyData}`;
      
      // Hash the key for storage using secure bcrypt
      const saltRounds = 12;
      const keyHash = await bcrypt.hash(apiKey, saltRounds);

      // Create API key record
      const [keyRecord] = await this.db.db
        .insertInto('tenant_api_keys')
        .values({
          tenant_id: tenantId,
          key_name: keyName,
          key_hash: keyHash,
          key_prefix: keyPrefix,
          permissions: JSON.stringify(permissions),
          scopes: JSON.stringify(options.scopes || []),
          rate_limit_per_minute: options.rateLimitPerMinute || 100,
          rate_limit_per_day: options.rateLimitPerDay || 10000,
          allowed_ips: JSON.stringify(options.allowedIps || []),
          expires_at: options.expiresAt?.toISOString(),
          created_by: createdBy
        })
        .returning([
          'id', 'tenant_id', 'key_name', 'key_prefix', 'permissions',
          'scopes', 'rate_limit_per_minute', 'rate_limit_per_day',
          'allowed_ips', 'status', 'expires_at', 'created_at'
        ])
        .execute();

      // Log API key creation
      await this.logTenantActivity(tenantId, 'api_key_created', 'api_key', keyRecord.id, {
        key_name: keyName,
        created_by: createdBy
      });

      logger.info(`Successfully generated API key '${keyName}' for tenant ${tenantId}`);
      return { apiKey, keyRecord: keyRecord as TenantApiKey };

    } catch (error) {
      logger.error('Failed to generate API key:', error);
      throw new Error(`Failed to generate API key: ${error.message}`);
    }
  }

  /**
   * Validate API key
   */
  async validateApiKey(apiKey: string, ipAddress?: string): Promise<ApiKeyValidationResult> {
    try {
      // Validate API key format first
      if (!apiKey || typeof apiKey !== 'string') {
        return { valid: false, error: 'Invalid API key format' };
      }

      // Extract prefix for optimization (but still need to check all keys with bcrypt)
      const keyParts = apiKey.split('_');
      if (keyParts.length !== 3 || keyParts[0] !== 'tk') {
        return { valid: false, error: 'Invalid API key format' };
      }

      const keyPrefix = `${keyParts[0]}_${keyParts[1]}`;

      // Look up potential API keys by prefix for performance
      const potentialKeys = await this.db.db
        .selectFrom('tenant_api_keys')
        .selectAll()
        .where('key_prefix', '=', keyPrefix)
        .where('status', '=', 'active')
        .execute();

      // Find the matching key by comparing with bcrypt
      let keyRecord = null;
      for (const record of potentialKeys) {
        try {
          const isMatch = await bcrypt.compare(apiKey, record.key_hash);
          if (isMatch) {
            keyRecord = record;
            break;
          }
        } catch (compareError) {
          logger.warn('bcrypt comparison failed for API key:', compareError);
          continue;
        }
      }

      if (!keyRecord) {
        return { valid: false, error: 'API key not found' };
      }

      // Check expiration
      if (keyRecord.expires_at && new Date(keyRecord.expires_at) < new Date()) {
        return { valid: false, error: 'API key has expired' };
      }

      // Check IP restrictions
      const allowedIps = JSON.parse(keyRecord.allowed_ips as string) as string[];
      if (allowedIps.length > 0 && ipAddress && !allowedIps.includes(ipAddress)) {
        return { valid: false, error: 'IP address not authorized' };
      }

      // Verify tenant is active
      const tenant = await this.getTenant(keyRecord.tenant_id);
      if (!tenant || tenant.status !== 'active') {
        return { valid: false, error: 'Tenant is not active' };
      }

      // Update usage statistics
      await this.updateApiKeyUsage(keyRecord.id);

      // Create tenant context
      const tenantContext: TenantContext = {
        tenant_id: keyRecord.tenant_id,
        permissions: JSON.parse(keyRecord.permissions as string) as string[],
        federation_permissions: []
      };

      return {
        valid: true,
        tenant_context: tenantContext,
        api_key: keyRecord as TenantApiKey
      };

    } catch (error) {
      logger.error('API key validation failed:', error);
      return { valid: false, error: 'API key validation failed' };
    }
  }

  /**
   * Revoke API key
   */
  async revokeApiKey(keyId: string, revokedBy: string): Promise<void> {
    logger.info(`Revoking API key: ${keyId}`);

    try {
      await this.db.db
        .updateTable('tenant_api_keys')
        .set({
          status: 'revoked',
          updated_at: new Date().toISOString()
        })
        .where('id', '=', keyId)
        .execute();

      // Log API key revocation
      const keyRecord = await this.db.db
        .selectFrom('tenant_api_keys')
        .select(['tenant_id', 'key_name'])
        .where('id', '=', keyId)
        .executeTakeFirst();

      if (keyRecord) {
        await this.logTenantActivity(keyRecord.tenant_id, 'api_key_revoked', 'api_key', keyId, {
          revoked_by: revokedBy
        });
      }

      logger.info(`Successfully revoked API key: ${keyId}`);

    } catch (error) {
      logger.error('Failed to revoke API key:', error);
      throw new Error(`Failed to revoke API key: ${error.message}`);
    }
  }

  // ===================
  // AUTHORIZATION METHODS
  // ===================

  /**
   * Check if user has permission in tenant
   */
  async hasPermission(tenantId: string, userId: string, permission: string): Promise<boolean> {
    try {
      const permissions = await this.getUserPermissions(tenantId, userId);
      return permissions.includes(permission);

    } catch (error) {
      logger.error('Failed to check permission:', error);
      return false;
    }
  }

  /**
   * Check cross-tenant access permission
   */
  async hasCrossTenantAccess(
    sourceTenantId: string, 
    targetTenantId: string, 
    resourceType: string,
    accessLevel: string = 'read'
  ): Promise<boolean> {
    try {
      const permission = await this.db.db
        .selectFrom('cross_tenant_permissions')
        .selectAll()
        .where('source_tenant_id', '=', sourceTenantId)
        .where('target_tenant_id', '=', targetTenantId)
        .where('status', '=', 'active')
        .where((eb) => eb.or([
          eb('expires_at', 'is', null),
          eb('expires_at', '>', new Date().toISOString())
        ]))
        .executeTakeFirst();

      if (!permission) {
        return false;
      }

      const resourceTypes = JSON.parse(permission.resource_types as string) as string[];
      return resourceTypes.includes(resourceType) && 
             this.checkAccessLevel(permission.access_level, accessLevel);

    } catch (error) {
      logger.error('Failed to check cross-tenant access:', error);
      return false;
    }
  }

  /**
   * Validate tenant context from request
   */
  async validateTenantContext(context: TenantContext): Promise<boolean> {
    try {
      // Validate context structure
      const validatedContext = validateTenantContext(context);

      // Verify tenant exists and is active
      if (validatedContext.tenant_id) {
        const tenant = await this.getTenant(validatedContext.tenant_id);
        if (!tenant || tenant.status !== 'active') {
          return false;
        }
      }

      // Verify user exists in tenant if specified
      if (validatedContext.user_id && validatedContext.tenant_id) {
        const tenantUser = await this.getTenantUser(validatedContext.tenant_id, validatedContext.user_id);
        if (!tenantUser || tenantUser.status !== 'active') {
          return false;
        }
      }

      return true;

    } catch (error) {
      logger.error('Failed to validate tenant context:', error);
      return false;
    }
  }

  // ===================
  // UTILITY METHODS
  // ===================

  /**
   * Extract tenant context from JWT token
   */
  async extractTenantContext(token: string): Promise<TenantContext | null> {
    try {
      const validation = await this.validateTenantToken(token);
      return validation.valid ? validation.tenant_context || null : null;

    } catch (error) {
      logger.error('Failed to extract tenant context:', error);
      return null;
    }
  }

  /**
   * Get tenant user information
   */
  private async getTenantUser(tenantId: string, userId: string): Promise<TenantUser | null> {
    try {
      const user = await this.db.db
        .selectFrom('tenant_users')
        .selectAll()
        .where('tenant_id', '=', tenantId)
        .where('user_id', '=', userId)
        .executeTakeFirst();

      return user as TenantUser | null;

    } catch (error) {
      logger.error('Failed to get tenant user:', error);
      return null;
    }
  }

  /**
   * Get tenant information
   */
  private async getTenant(tenantId: string) {
    try {
      const tenant = await this.db.db
        .selectFrom('tenants')
        .selectAll()
        .where('id', '=', tenantId)
        .executeTakeFirst();

      return tenant;

    } catch (error) {
      logger.error('Failed to get tenant:', error);
      return null;
    }
  }

  /**
   * Get user permissions in tenant
   */
  private async getUserPermissions(tenantId: string, userId: string): Promise<string[]> {
    try {
      const tenantUser = await this.getTenantUser(tenantId, userId);
      if (!tenantUser) {
        return [];
      }

      // Get role-based permissions
      const rolePermissions = DEFAULT_TENANT_PERMISSIONS[tenantUser.role] || [];
      
      // Get additional user-specific permissions
      const userPermissions = JSON.parse(tenantUser.permissions as string || '[]') as string[];

      // Combine and deduplicate
      return [...new Set([...rolePermissions, ...userPermissions])];

    } catch (error) {
      logger.error('Failed to get user permissions:', error);
      return [];
    }
  }

  /**
   * Get federation permissions for user
   */
  private async getFederationPermissions(tenantId: string, userId: string): Promise<string[]> {
    try {
      const permissions = await this.db.db
        .selectFrom('cross_tenant_permissions')
        .select(['resource_types', 'access_level'])
        .where('source_tenant_id', '=', tenantId)
        .where('status', '=', 'active')
        .where((eb) => eb.or([
          eb('expires_at', 'is', null),
          eb('expires_at', '>', new Date().toISOString())
        ]))
        .execute();

      const federationPermissions: string[] = [];
      for (const permission of permissions) {
        const resourceTypes = JSON.parse(permission.resource_types as string) as string[];
        for (const resourceType of resourceTypes) {
          federationPermissions.push(`federation:${resourceType}:${permission.access_level}`);
        }
      }

      return federationPermissions;

    } catch (error) {
      logger.error('Failed to get federation permissions:', error);
      return [];
    }
  }

  /**
   * Check if token is revoked
   */
  private async isTokenRevoked(tokenId: string): Promise<boolean> {
    try {
      const revoked = await this.db.db
        .selectFrom('revoked_tokens')
        .select('token_id')
        .where('token_id', '=', tokenId)
        .executeTakeFirst();

      return !!revoked;

    } catch (error) {
      logger.error('Failed to check token revocation:', error);
      return false;
    }
  }

  /**
   * Store token metadata for tracking
   */
  private async storeTokenMetadata(
    tokenId: string, 
    tenantId: string, 
    userId: string, 
    sessionId?: string
  ): Promise<void> {
    try {
      await this.db.db
        .insertInto('jwt_token_metadata')
        .values({
          token_id: tokenId,
          tenant_id: tenantId,
          user_id: userId,
          session_id: sessionId,
          created_at: new Date().toISOString()
        })
        .execute();

    } catch (error) {
      logger.error('Failed to store token metadata:', error);
    }
  }

  /**
   * Update user last active timestamp
   */
  private async updateUserLastActive(tenantId: string, userId: string): Promise<void> {
    try {
      await this.db.db
        .updateTable('tenant_users')
        .set({ last_active_at: new Date().toISOString() })
        .where('tenant_id', '=', tenantId)
        .where('user_id', '=', userId)
        .execute();

    } catch (error) {
      logger.error('Failed to update user last active:', error);
    }
  }

  /**
   * Update API key usage statistics
   */
  private async updateApiKeyUsage(keyId: string): Promise<void> {
    try {
      await this.db.db
        .updateTable('tenant_api_keys')
        .set({
          usage_count: (eb) => eb('usage_count', '+', 1),
          last_used_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .where('id', '=', keyId)
        .execute();

    } catch (error) {
      logger.error('Failed to update API key usage:', error);
    }
  }

  /**
   * Parse JWT expiration string to seconds
   */
  private parseExpiration(expiresIn: string): number {
    const unit = expiresIn.slice(-1);
    const value = parseInt(expiresIn.slice(0, -1));
    
    switch (unit) {
      case 's': return value;
      case 'm': return value * 60;
      case 'h': return value * 60 * 60;
      case 'd': return value * 24 * 60 * 60;
      default: return 24 * 60 * 60; // Default to 24 hours
    }
  }

  /**
   * Check if access level is sufficient
   */
  private checkAccessLevel(granted: string, required: string): boolean {
    const levels = ['none', 'read', 'write', 'admin'];
    const grantedIndex = levels.indexOf(granted);
    const requiredIndex = levels.indexOf(required);
    return grantedIndex >= requiredIndex;
  }

  /**
   * Log tenant activity
   */
  private async logTenantActivity(
    tenantId: string,
    action: string,
    resourceType: string,
    resourceId: string,
    details: Record<string, any>
  ): Promise<void> {
    try {
      await this.db.db
        .insertInto('tenant_audit_logs')
        .values({
          tenant_id: tenantId,
          action,
          resource_type: resourceType,
          resource_id: resourceId,
          action_details: JSON.stringify(details)
        })
        .execute();
    } catch (error) {
      logger.error('Failed to log tenant activity:', error);
    }
  }
}