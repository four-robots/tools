/**
 * Whiteboard Permission Validator
 * 
 * Comprehensive permission validation middleware that integrates with:
 * - Enhanced operational transforms (WB-005)
 * - Real-time collaboration WebSocket operations
 * - Element-level, area-based, and layer-based permissions
 * - Performance-optimized validation with caching
 */

import { Logger } from '../../utils/logger.js';
import { WhiteboardPermissionService, PermissionValidationResult } from './whiteboard-permission-service.js';
import { 
  EnhancedWhiteboardOperation,
  EnhancedTransformContext 
} from './whiteboard-ot-engine.js';
import { 
  Point,
  Bounds,
  WhiteboardElementType,
  WhiteboardActivityAction 
} from '@shared/types/whiteboard.js';
import { z } from 'zod';

// Operation context for permission validation
export const OperationContext = z.object({
  whiteboardId: z.string().uuid(),
  userId: z.string().uuid(),
  sessionId: z.string().uuid(),
  ipAddress: z.string().optional(),
  userAgent: z.string().optional(),
  timestamp: z.number(),
  
  // Element context
  elementId: z.string().uuid().optional(),
  elementType: WhiteboardElementType.optional(),
  elementPosition: Point.optional(),
  elementBounds: Bounds.optional(),
  layerIndex: z.number().optional(),
  
  // Operation details
  operationType: z.string(),
  operationData: z.record(z.string(), z.any()).optional(),
  
  // Collaboration context
  conflictingOperations: z.array(z.string().uuid()).optional(),
  dependencies: z.array(z.string().uuid()).optional(),
});
export type OperationContext = z.infer<typeof OperationContext>;

// Permission check result with detailed context
export const PermissionCheckResult = z.object({
  allowed: z.boolean(),
  reason: z.string().optional(),
  restrictions: z.record(z.string(), z.any()).optional(),
  suggestions: z.array(z.string()).optional(),
  alternativeActions: z.array(z.string()).optional(),
  requiresApproval: z.boolean().default(false),
  approvalWorkflow: z.string().optional(),
  auditRequired: z.boolean().default(false),
  validationLatency: z.number().optional(),
});
export type PermissionCheckResult = z.infer<typeof PermissionCheckResult>;

// Operation permission mappings
const OPERATION_PERMISSION_MAP: Record<string, string[]> = {
  // Element operations
  'element_create': ['canEdit', 'elementPermissions.canCreateElements'],
  'element_update': ['canEdit', 'elementPermissions.canEditElements'],
  'element_delete': ['canDelete', 'elementPermissions.canDeleteElements'],
  'element_move': ['canEdit', 'elementPermissions.canMoveElements'],
  'element_style': ['canEdit', 'elementPermissions.canStyleElements'],
  'element_group': ['canEdit', 'elementPermissions.canGroupElements'],
  'element_ungroup': ['canEdit', 'elementPermissions.canGroupElements'],
  'element_lock': ['canEdit'],
  'element_unlock': ['canEdit'],
  'element_duplicate': ['canEdit', 'elementPermissions.canCreateElements'],
  'element_layer_change': ['canEdit', 'elementPermissions.canMoveElements'],
  
  // Whiteboard operations
  'whiteboard_update': ['canEdit'],
  'whiteboard_settings_update': ['canManagePermissions'],
  'whiteboard_delete': ['canDelete'],
  'whiteboard_share': ['canShare'],
  'whiteboard_export': ['canExport'],
  'whiteboard_template_create': ['canCreateTemplates'],
  
  // Comment operations
  'comment_create': ['canComment'],
  'comment_update': ['canComment'],
  'comment_delete': ['canComment'],
  'comment_resolve': ['canComment'],
  
  // Permission operations
  'permission_grant': ['canManagePermissions'],
  'permission_revoke': ['canManagePermissions'],
  'permission_delegate': ['canManagePermissions'],
  
  // Version operations
  'version_save': ['canEdit'],
  'version_restore': ['canRestoreVersions'],
  'version_view': ['canViewHistory'],
  
  // Session operations
  'session_join': [],
  'session_leave': [],
  'cursor_move': [],
  'selection_change': [],
  'presence_update': [],
};

// High-risk operations that require additional validation
const HIGH_RISK_OPERATIONS = new Set([
  'whiteboard_delete',
  'element_delete',
  'permission_grant',
  'permission_revoke',
  'whiteboard_settings_update',
  'version_restore'
]);

// Operations that require real-time validation
const REAL_TIME_OPERATIONS = new Set([
  'element_create',
  'element_update',
  'element_move',
  'element_style',
  'cursor_move',
  'selection_change',
  'comment_create'
]);

/**
 * Comprehensive permission validator for whiteboard operations
 */
export class WhiteboardPermissionValidator {
  private logger: Logger;
  private validationCache = new Map<string, { result: PermissionCheckResult; timestamp: number }>();
  private cacheTTL = 5000; // 5 seconds for real-time operations

  constructor(
    private permissionService: WhiteboardPermissionService,
    logger?: Logger
  ) {
    this.logger = logger || new Logger('WhiteboardPermissionValidator');
  }

  /**
   * Validate operation before execution
   */
  async validateOperation(
    operation: EnhancedWhiteboardOperation,
    context: OperationContext
  ): Promise<PermissionCheckResult> {
    const startTime = Date.now();
    
    try {
      // Check cache for real-time operations
      if (REAL_TIME_OPERATIONS.has(context.operationType)) {
        const cached = this.getCachedResult(context);
        if (cached) {
          return cached;
        }
      }

      // Validate basic operation permissions
      const basicCheck = await this.validateBasicPermissions(context);
      if (!basicCheck.allowed) {
        return this.cacheResult(context, basicCheck);
      }

      // Enhanced validation for specific operation types
      const enhancedCheck = await this.validateEnhancedPermissions(operation, context);
      if (!enhancedCheck.allowed) {
        return this.cacheResult(context, enhancedCheck);
      }

      // Validate operation-specific constraints
      const constraintCheck = await this.validateOperationConstraints(operation, context);
      if (!constraintCheck.allowed) {
        return this.cacheResult(context, constraintCheck);
      }

      // Validate collaboration and conflict constraints
      const collaborationCheck = await this.validateCollaborationConstraints(operation, context);
      if (!collaborationCheck.allowed) {
        return this.cacheResult(context, collaborationCheck);
      }

      // All validations passed
      const result: PermissionCheckResult = {
        allowed: true,
        auditRequired: HIGH_RISK_OPERATIONS.has(context.operationType),
        validationLatency: Date.now() - startTime,
      };

      this.logger.debug('Operation validation passed', {
        operationType: context.operationType,
        whiteboardId: context.whiteboardId,
        userId: context.userId,
        latency: result.validationLatency
      });

      return this.cacheResult(context, result);
    } catch (error) {
      this.logger.error('Operation validation failed', { 
        error, 
        operationType: context.operationType,
        whiteboardId: context.whiteboardId,
        userId: context.userId 
      });
      
      return {
        allowed: false,
        reason: 'Validation error occurred',
        validationLatency: Date.now() - startTime,
      };
    }
  }

  /**
   * Validate multiple operations in batch for performance
   */
  async validateOperationsBatch(
    operations: Array<{ operation: EnhancedWhiteboardOperation; context: OperationContext }>
  ): Promise<PermissionCheckResult[]> {
    const results = await Promise.all(
      operations.map(({ operation, context }) => this.validateOperation(operation, context))
    );

    // Check for batch-level constraints
    const allowedOperations = results.filter(r => r.allowed);
    const deniedOperations = results.filter(r => !r.allowed);

    // If too many operations are denied, flag for review
    if (deniedOperations.length > allowedOperations.length) {
      this.logger.warn('High denial rate in batch operation', {
        total: results.length,
        denied: deniedOperations.length,
        whiteboardId: operations[0]?.context.whiteboardId
      });
    }

    return results;
  }

  /**
   * Validate WebSocket real-time operation
   */
  async validateWebSocketOperation(
    operationType: string,
    data: any,
    context: {
      whiteboardId: string;
      userId: string;
      sessionId: string;
      ipAddress?: string;
    }
  ): Promise<PermissionCheckResult> {
    const operationContext: OperationContext = {
      whiteboardId: context.whiteboardId,
      userId: context.userId,
      sessionId: context.sessionId,
      ipAddress: context.ipAddress,
      timestamp: Date.now(),
      operationType,
      operationData: data,
    };

    // Create mock operation for validation
    const operation: EnhancedWhiteboardOperation = {
      type: operationType as any,
      elementId: data.elementId,
      data: data,
      userId: context.userId,
      timestamp: Date.now(),
      version: 1,
      sessionId: context.sessionId,
      metadata: {},
    };

    return this.validateOperation(operation, operationContext);
  }

  /**
   * Pre-validate operation for OT engine integration
   */
  async preValidateForOT(
    operation: EnhancedWhiteboardOperation,
    transformContext: EnhancedTransformContext
  ): Promise<PermissionCheckResult> {
    const context: OperationContext = {
      whiteboardId: transformContext.whiteboardId,
      userId: operation.userId,
      sessionId: operation.sessionId,
      timestamp: operation.timestamp,
      operationType: operation.type,
      elementId: operation.elementId,
      operationData: operation.data,
      conflictingOperations: transformContext.conflictingOperations?.map(op => op.id),
      dependencies: transformContext.dependentOperations?.map(op => op.id),
    };

    const result = await this.validateOperation(operation, context);

    // Special handling for OT conflicts
    if (transformContext.conflictingOperations && transformContext.conflictingOperations.length > 0) {
      if (result.allowed) {
        result.requiresApproval = true;
        result.approvalWorkflow = 'conflict_resolution';
        result.suggestions = ['Consider merging conflicting changes', 'Review operational transform results'];
      }
    }

    return result;
  }

  // Private validation methods

  private async validateBasicPermissions(context: OperationContext): Promise<PermissionCheckResult> {
    const requiredPermissions = OPERATION_PERMISSION_MAP[context.operationType] || [];
    
    for (const permission of requiredPermissions) {
      const permissionCheck = await this.permissionService.checkPermission(
        context.whiteboardId,
        context.userId,
        permission,
        {
          elementId: context.elementId,
          position: context.elementPosition,
          layerIndex: context.layerIndex,
          operationType: context.operationType,
          ipAddress: context.ipAddress,
        }
      );

      if (!permissionCheck.granted) {
        return {
          allowed: false,
          reason: `Missing required permission: ${permission}`,
          restrictions: permissionCheck.restrictions,
          suggestions: this.generatePermissionSuggestions(permission, permissionCheck),
        };
      }
    }

    return { allowed: true };
  }

  private async validateEnhancedPermissions(
    operation: EnhancedWhiteboardOperation,
    context: OperationContext
  ): Promise<PermissionCheckResult> {
    // Element-level permission validation
    if (context.elementId && operation.type !== 'element_create') {
      const elementPermission = await this.permissionService.checkPermission(
        context.whiteboardId,
        context.userId,
        this.mapOperationToElementPermission(operation.type),
        {
          elementId: context.elementId,
          operationType: context.operationType,
        }
      );

      if (!elementPermission.granted) {
        return {
          allowed: false,
          reason: 'Element-level permission denied',
          restrictions: elementPermission.restrictions,
          alternativeActions: ['Request element-specific permission', 'Use collaborative editing mode'],
        };
      }
    }

    // Area-based permission validation
    if (context.elementPosition) {
      const areaPermission = await this.permissionService.checkPermission(
        context.whiteboardId,
        context.userId,
        'canEdit',
        {
          position: context.elementPosition,
          operationType: context.operationType,
        }
      );

      if (!areaPermission.granted) {
        return {
          allowed: false,
          reason: 'Area-based permission denied',
          restrictions: areaPermission.restrictions,
          suggestions: ['Move operation to allowed area', 'Request area-specific permission'],
        };
      }
    }

    // Layer-based permission validation
    if (context.layerIndex !== undefined) {
      const layerPermission = await this.permissionService.checkPermission(
        context.whiteboardId,
        context.userId,
        'canEdit',
        {
          layerIndex: context.layerIndex,
          operationType: context.operationType,
        }
      );

      if (!layerPermission.granted) {
        return {
          allowed: false,
          reason: 'Layer-based permission denied',
          restrictions: layerPermission.restrictions,
          alternativeActions: ['Switch to allowed layer', 'Request layer-specific permission'],
        };
      }
    }

    return { allowed: true };
  }

  private async validateOperationConstraints(
    operation: EnhancedWhiteboardOperation,
    context: OperationContext
  ): Promise<PermissionCheckResult> {
    // Validate operation-specific business rules
    switch (context.operationType) {
      case 'element_delete':
        return this.validateElementDeletion(operation, context);
      
      case 'whiteboard_delete':
        return this.validateWhiteboardDeletion(context);
      
      case 'permission_grant':
        return this.validatePermissionGrant(operation, context);
      
      case 'element_move':
        return this.validateElementMove(operation, context);
      
      default:
        return { allowed: true };
    }
  }

  private async validateCollaborationConstraints(
    operation: EnhancedWhiteboardOperation,
    context: OperationContext
  ): Promise<PermissionCheckResult> {
    // Check for concurrent editing conflicts
    if (context.conflictingOperations && context.conflictingOperations.length > 0) {
      return {
        allowed: true, // Allow with approval requirement
        requiresApproval: true,
        approvalWorkflow: 'concurrent_editing_resolution',
        suggestions: ['Review conflicting changes', 'Consider collaborative resolution'],
      };
    }

    // Check session limits and rate limiting
    if (context.operationType === 'element_create' || context.operationType === 'element_update') {
      const rateLimitCheck = await this.checkRateLimit(context);
      if (!rateLimitCheck.allowed) {
        return rateLimitCheck;
      }
    }

    return { allowed: true };
  }

  // Specific validation methods

  private async validateElementDeletion(
    operation: EnhancedWhiteboardOperation,
    context: OperationContext
  ): Promise<PermissionCheckResult> {
    // Check if element has dependencies
    if (operation.data?.hasChildren) {
      return {
        allowed: false,
        reason: 'Cannot delete element with child elements',
        suggestions: ['Delete child elements first', 'Ungroup elements before deletion'],
      };
    }

    // Check if element is locked by another user
    if (operation.data?.lockedBy && operation.data.lockedBy !== context.userId) {
      return {
        allowed: false,
        reason: 'Element is locked by another user',
        alternativeActions: ['Request unlock from owner', 'Wait for lock to expire'],
      };
    }

    return { allowed: true };
  }

  private async validateWhiteboardDeletion(context: OperationContext): Promise<PermissionCheckResult> {
    return {
      allowed: true,
      requiresApproval: true,
      approvalWorkflow: 'whiteboard_deletion_confirmation',
      auditRequired: true,
      suggestions: ['Consider archiving instead of deletion', 'Export whiteboard before deletion'],
    };
  }

  private async validatePermissionGrant(
    operation: EnhancedWhiteboardOperation,
    context: OperationContext
  ): Promise<PermissionCheckResult> {
    // Validate permission escalation rules
    const targetRole = operation.data?.role;
    const currentUserPermissions = await this.permissionService.getUserPermissions(
      context.whiteboardId,
      context.userId
    );

    if (targetRole === 'owner' && !currentUserPermissions.canManagePermissions) {
      return {
        allowed: false,
        reason: 'Cannot grant owner permissions without management rights',
      };
    }

    return { 
      allowed: true,
      auditRequired: true,
    };
  }

  private async validateElementMove(
    operation: EnhancedWhiteboardOperation,
    context: OperationContext
  ): Promise<PermissionCheckResult> {
    const newPosition = operation.data?.position as Point;
    if (!newPosition) {
      return { allowed: true };
    }

    // Check if moving to restricted area
    const areaPermission = await this.permissionService.checkPermission(
      context.whiteboardId,
      context.userId,
      'can_move_into',
      {
        position: newPosition,
        operationType: 'element_move',
      }
    );

    if (!areaPermission.granted) {
      return {
        allowed: false,
        reason: 'Cannot move element to restricted area',
        restrictions: areaPermission.restrictions,
      };
    }

    return { allowed: true };
  }

  private async checkRateLimit(context: OperationContext): Promise<PermissionCheckResult> {
    // Simple rate limiting check (could be enhanced with Redis)
    const key = `${context.userId}:${context.operationType}`;
    const now = Date.now();
    const windowMs = 60000; // 1 minute
    const maxOperations = 100; // Max operations per minute

    // This is a simplified implementation
    // In production, use Redis or similar for distributed rate limiting
    
    return { allowed: true };
  }

  // Helper methods

  private mapOperationToElementPermission(operationType: string): string {
    const mapping: Record<string, string> = {
      'element_update': 'can_edit',
      'element_delete': 'can_delete',
      'element_move': 'can_move',
      'element_style': 'can_style',
      'element_group': 'can_group',
      'element_lock': 'can_lock',
    };
    return mapping[operationType] || 'can_edit';
  }

  private generatePermissionSuggestions(
    permission: string,
    validationResult: PermissionValidationResult
  ): string[] {
    const suggestions: string[] = [];

    if (validationResult.restrictions?.timeBlocked) {
      suggestions.push('Permission restricted by time constraints');
    }

    if (validationResult.restrictions?.ipBlocked) {
      suggestions.push('Access restricted from this IP address');
    }

    if (validationResult.source === 'role') {
      suggestions.push('Contact administrator to upgrade your role');
    }

    if (permission.includes('elementPermissions')) {
      suggestions.push('Request specific element-level permissions');
    }

    return suggestions;
  }

  private getCachedResult(context: OperationContext): PermissionCheckResult | null {
    const key = this.getCacheKey(context);
    const cached = this.validationCache.get(key);
    
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.result;
    }

    return null;
  }

  private cacheResult(context: OperationContext, result: PermissionCheckResult): PermissionCheckResult {
    const key = this.getCacheKey(context);
    this.validationCache.set(key, {
      result,
      timestamp: Date.now(),
    });

    // Clean up old cache entries
    if (this.validationCache.size > 1000) {
      const cutoff = Date.now() - this.cacheTTL * 2;
      for (const [cacheKey, entry] of this.validationCache.entries()) {
        if (entry.timestamp < cutoff) {
          this.validationCache.delete(cacheKey);
        }
      }
    }

    return result;
  }

  private getCacheKey(context: OperationContext): string {
    return `${context.whiteboardId}:${context.userId}:${context.operationType}:${context.elementId || ''}`;
  }

  /**
   * Clear validation cache
   */
  clearCache(): void {
    this.validationCache.clear();
  }

  /**
   * Get validation statistics
   */
  getValidationStats(): {
    cacheSize: number;
    cacheHitRate: number;
    avgValidationLatency: number;
  } {
    // This would be enhanced with actual metrics in production
    return {
      cacheSize: this.validationCache.size,
      cacheHitRate: 0.85, // Mock value
      avgValidationLatency: 25, // Mock value in ms
    };
  }
}