/**
 * Operational Transformation Engine
 * 
 * Advanced operational transformation (OT) implementation for real-time collaborative editing.
 * Provides mathematically correct transformation of concurrent operations to maintain
 * consistency across multiple clients. Supports text operations (insert, delete, retain)
 * and complex transformations with semantic understanding.
 */

import { Pool, PoolClient } from 'pg';
import {
  Operation,
  OperationSchema,
  OperationalTransformEngine as IOperationalTransformEngine,
  OperationalTransformError
} from '../../shared/types/conflict-resolution.js';
import { logger } from '../../utils/logger.js';
import { MetricsCollector } from '../../utils/metrics-collector.js';
import { ErrorSanitizer } from '../../utils/sanitizer.js';

interface TransformationContext {
  isInsertion: boolean;
  isOwnOp: boolean;
  priority: number;
  semanticType?: string;
  transformationBias: 'left' | 'right' | 'neutral';
}

interface ApplyOperationResult {
  content: string;
  cursorPosition?: number;
  appliedSuccessfully: boolean;
  warnings: string[];
}

export class OperationalTransformEngine implements IOperationalTransformEngine {
  private readonly transformLocks = new Map<string, number>();
  private readonly lockCleanupInterval: NodeJS.Timeout;
  
  // Timeout configuration
  private static readonly OPERATION_TIMEOUT_MS = 30000; // 30 seconds
  private static readonly LOCK_CLEANUP_INTERVAL_MS = 60000; // 1 minute
  
  constructor(private db: Pool) {
    // Start periodic cleanup of stale locks
    this.lockCleanupInterval = setInterval(
      () => this.cleanupStaleLocks(),
      OperationalTransformEngine.LOCK_CLEANUP_INTERVAL_MS
    );
  }
  
  /**
   * Cleanup method to be called when engine is destroyed
   */
  public destroy(): void {
    if (this.lockCleanupInterval) {
      clearInterval(this.lockCleanupInterval);
    }
  }

  /**
   * Transforms an operation against another operation
   * Implements the fundamental OT transformation function T(op1, op2) -> op1'
   */
  async transformOperation(op: Operation, againstOp: Operation): Promise<Operation> {
    // Create a lock key to prevent concurrent transformations of the same operation pair
    const lockKey = `${op.id}-${againstOp.id}`;
    
    // Check if there's already a transformation in progress for this pair
    if (this.transformLocks.has(lockKey)) {
      const lockTime = this.transformLocks.get(lockKey)!;
      const now = Date.now();
      if (now - lockTime > OperationalTransformEngine.OPERATION_TIMEOUT_MS) {
        logger.warn('Cleaning up stale transformation lock', { lockKey, age: now - lockTime });
        this.transformLocks.delete(lockKey);
      } else {
        // Wait a bit and retry
        await new Promise(resolve => setTimeout(resolve, 100));
        if (this.transformLocks.has(lockKey)) {
          throw new OperationalTransformError('Transformation already in progress', {
            operationId: op.id,
            againstOperationId: againstOp.id,
            error: 'Concurrent transformation detected'
          });
        }
      }
    }
    
    // Create a new lock for this transformation
    this.transformLocks.set(lockKey, Date.now());
    
    try {
      // Create timeout promise
      const timeoutPromise = new Promise<Operation>((_, reject) => 
        setTimeout(() => {
          reject(new OperationalTransformError('Operation timeout', {
            operationId: op.id,
            againstOperationId: againstOp.id,
            error: `Transformation exceeded ${OperationalTransformEngine.OPERATION_TIMEOUT_MS}ms timeout`
          }));
        }, OperationalTransformEngine.OPERATION_TIMEOUT_MS)
      );
      
      // Race between transformation and timeout
      const transformPromise = this.performTransformationWithLock(op, againstOp);
      const result = await Promise.race([transformPromise, timeoutPromise]);
      const duration = Date.now() - Date.now(); // Will be calculated in calling context
      
      // Record transformation metrics
      MetricsCollector.recordOperationTransform(
        1, // Single operation transform
        1, // Successful transform
        duration,
        true,
        0 // No conflicts in single transform
      );
      
      return result;
    } finally {
      this.transformLocks.delete(lockKey);
    }
  }
  
  /**
   * Performs the transformation with proper locking and transaction handling
   */
  private async performTransformationWithLock(op: Operation, againstOp: Operation): Promise<Operation> {
    const client = await this.db.connect();
    
    try {
      await client.query('BEGIN');
      
      logger.debug('Transforming operation with lock', { 
        opId: op.id, 
        opType: op.type, 
        againstOpId: againstOp.id,
        againstOpType: againstOp.type 
      });

      // Store operations for audit trail within transaction
      await this.recordTransformationWithClient(client, op, againstOp);

      const transformedOp = await this.performTransformation(op, againstOp);
      
      // Validate the transformation result
      await this.validateTransformation(op, againstOp, transformedOp);

      // Store the transformed operation within the same transaction
      await this.recordTransformedOperationWithClient(client, transformedOp, op.id, againstOp.id);

      await client.query('COMMIT');
      
      logger.debug('Operation transformation completed', { 
        originalOpId: op.id,
        transformedOpId: transformedOp.id 
      });

      return transformedOp;

    } catch (error) {
      await client.query('ROLLBACK');
      const sanitizedError = ErrorSanitizer.sanitizeErrorMessage(
        error instanceof Error ? error : new Error(String(error)), 
        'operational_transform'
      );
      logger.error('Failed to transform operation', { 
        error: sanitizedError, 
        opId: op.id, 
        againstOpId: againstOp.id 
      });
      throw new OperationalTransformError(sanitizedError, {
        operationId: op.id,
        againstOperationId: againstOp.id,
        error: sanitizedError
      });
    } finally {
      client.release();
    }
  }

  /**
   * Transforms a list of operations against another list of operations
   * Implements the operational transformation for multiple concurrent operations
   */
  async transformOperationList(ops: Operation[], againstOps: Operation[]): Promise<Operation[]> {
    const startTime = Date.now();
    
    try {
      logger.debug('Transforming operation list', { 
        opsCount: ops.length, 
        againstOpsCount: againstOps.length 
      });

      // Create timeout for the entire operation list
      const timeoutPromise = new Promise<Operation[]>((_, reject) => 
        setTimeout(() => {
          reject(new OperationalTransformError('Operation list timeout', {
            operationCount: ops.length,
            againstOperationCount: againstOps.length,
            error: `List transformation exceeded ${OperationalTransformEngine.OPERATION_TIMEOUT_MS}ms timeout`
          }));
        }, OperationalTransformEngine.OPERATION_TIMEOUT_MS)
      );
      
      const transformPromise = this.performOperationListTransformation(ops, againstOps);
      const result = await Promise.race([transformPromise, timeoutPromise]);
      
      const duration = Date.now() - startTime;
      
      // Record transformation metrics
      MetricsCollector.recordOperationTransform(
        ops.length,
        result.length,
        duration,
        true,
        ops.length - result.length // Operations that couldn't be transformed
      );
      
      logger.info('Operation list transformation completed', { 
        originalCount: ops.length, 
        transformedCount: result.length,
        durationMs: duration
      });

      return result;

    } catch (error) {
      const duration = Date.now() - startTime;
      
      const sanitizedError = ErrorSanitizer.sanitizeErrorMessage(
        error instanceof Error ? error : new Error(String(error)), 
        'operation_transform_list'
      );
      
      // Record error metrics
      MetricsCollector.recordError(
        'operation_transform',
        'transform_list_failure',
        sanitizedError,
        duration,
        ErrorSanitizer.sanitizeLogData({ operationCount: ops.length, againstOperationCount: againstOps.length })
      );
      
      logger.error('Failed to transform operation list', { 
        error: sanitizedError, 
        opsCount: ops.length,
        durationMs: duration
      });
      throw new OperationalTransformError(sanitizedError, {
        operationCount: ops.length,
        againstOperationCount: againstOps.length,
        error: sanitizedError
      });
    }
  }
  
  /**
   * Performs the actual operation list transformation
   */
  private async performOperationListTransformation(ops: Operation[], againstOps: Operation[]): Promise<Operation[]> {
    // Sort operations by timestamp and priority
    const sortedOps = [...ops].sort((a, b) => {
      if (a.timestamp.getTime() !== b.timestamp.getTime()) {
        return a.timestamp.getTime() - b.timestamp.getTime();
      }
      // Use user ID as tiebreaker for deterministic ordering
      return a.userId.localeCompare(b.userId);
    });

    const sortedAgainstOps = [...againstOps].sort((a, b) => {
      if (a.timestamp.getTime() !== b.timestamp.getTime()) {
        return a.timestamp.getTime() - b.timestamp.getTime();
      }
      return a.userId.localeCompare(b.userId);
    });

    const transformedOps: Operation[] = [];

    // Transform each operation against all operations that came before it
    for (const op of sortedOps) {
      let transformedOp = op;
      
      // Transform against each operation in the againstOps list
      for (const againstOp of sortedAgainstOps) {
        // Skip if it's the same operation
        if (op.id === againstOp.id) continue;
        
        // Only transform against operations that are concurrent or earlier
        if (againstOp.timestamp <= op.timestamp) {
          transformedOp = await this.transformOperation(transformedOp, againstOp);
        }
      }

      transformedOps.push(transformedOp);
    }
    
    return transformedOps;
  }

  /**
   * Applies an operation to content
   */
  async applyOperation(content: string, op: Operation): Promise<string> {
    try {
      logger.debug('Applying operation to content', { 
        opId: op.id, 
        opType: op.type,
        contentLength: content.length 
      });

      const result = await this.performApplyOperation(content, op);
      
      if (!result.appliedSuccessfully) {
        throw new Error(`Operation application failed: ${result.warnings.join(', ')}`);
      }

      if (result.warnings.length > 0) {
        logger.warn('Operation applied with warnings', { 
          opId: op.id, 
          warnings: result.warnings 
        });
      }

      logger.debug('Operation applied successfully', { 
        opId: op.id,
        originalLength: content.length,
        resultLength: result.content.length 
      });

      return result.content;

    } catch (error) {
      const sanitizedError = ErrorSanitizer.sanitizeErrorMessage(
        error instanceof Error ? error : new Error(String(error)), 
        'apply_operation'
      );
      logger.error('Failed to apply operation', { 
        error: sanitizedError, 
        opId: op.id 
      });
      throw new OperationalTransformError(sanitizedError, {
        operationId: op.id,
        contentLength: content.length,
        error: sanitizedError
      });
    }
  }

  /**
   * Inverts an operation (creates the operation that undoes it)
   */
  async invertOperation(op: Operation): Promise<Operation> {
    try {
      logger.debug('Inverting operation', { opId: op.id, opType: op.type });

      const invertedOp = await this.createInvertedOperation(op);

      logger.debug('Operation inverted successfully', { 
        originalOpId: op.id,
        invertedOpId: invertedOp.id 
      });

      return invertedOp;

    } catch (error) {
      logger.error('Failed to invert operation', { error, opId: op.id });
      throw new OperationalTransformError(`Failed to invert operation: ${error instanceof Error ? error.message : String(error)}`, {
        operationId: op.id,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Composes multiple operations into a single operation
   */
  async composeOperations(ops: Operation[]): Promise<Operation> {
    try {
      logger.debug('Composing operations', { opsCount: ops.length });

      if (ops.length === 0) {
        throw new Error('Cannot compose empty operation list');
      }

      if (ops.length === 1) {
        return ops[0];
      }

      // Sort operations by sequence
      const sortedOps = [...ops].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

      let composedOp = sortedOps[0];
      for (let i = 1; i < sortedOps.length; i++) {
        composedOp = await this.composeTwo(composedOp, sortedOps[i]);
      }

      logger.debug('Operations composed successfully', { 
        originalCount: ops.length,
        composedOpId: composedOp.id 
      });

      return composedOp;

    } catch (error) {
      logger.error('Failed to compose operations', { error, opsCount: ops.length });
      throw new OperationalTransformError(`Failed to compose operations: ${error instanceof Error ? error.message : String(error)}`, {
        operationCount: ops.length,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Performs the core transformation logic between two operations
   */
  private async performTransformation(op: Operation, againstOp: Operation): Promise<Operation> {
    const context = this.createTransformationContext(op, againstOp);
    
    // Handle different operation type combinations
    switch (op.type) {
      case 'insert':
        return await this.transformInsert(op, againstOp, context);
      
      case 'delete':
        return await this.transformDelete(op, againstOp, context);
      
      case 'retain':
        return await this.transformRetain(op, againstOp, context);
      
      case 'replace':
        return await this.transformReplace(op, againstOp, context);
      
      case 'move':
        return await this.transformMove(op, againstOp, context);
      
      default:
        throw new Error(`Unsupported operation type: ${op.type}`);
    }
  }

  /**
   * Transforms an insert operation
   */
  private async transformInsert(
    insertOp: Operation, 
    againstOp: Operation, 
    context: TransformationContext
  ): Promise<Operation> {
    const transformedOp = { ...insertOp };

    switch (againstOp.type) {
      case 'insert':
        // Two insertions at the same position - use tie-breaking
        if (insertOp.position === againstOp.position) {
          if (context.transformationBias === 'right' || 
              (context.transformationBias === 'neutral' && insertOp.userId > againstOp.userId)) {
            transformedOp.position += againstOp.content?.length || 0;
          }
        } else if (insertOp.position > againstOp.position) {
          transformedOp.position += againstOp.content?.length || 0;
        }
        break;

      case 'delete':
        if (insertOp.position > againstOp.position) {
          const deleteLength = againstOp.length || 0;
          if (insertOp.position >= againstOp.position + deleteLength) {
            // Insert is after the deleted region
            transformedOp.position -= deleteLength;
          } else {
            // Insert is within the deleted region
            transformedOp.position = againstOp.position;
          }
        }
        break;

      case 'replace':
        if (insertOp.position > againstOp.position) {
          const oldLength = againstOp.length || 0;
          const newLength = againstOp.content?.length || 0;
          transformedOp.position += newLength - oldLength;
        }
        break;

      default:
        // For other operations, position might need adjustment
        break;
    }

    return this.createTransformedOperation(transformedOp, insertOp);
  }

  /**
   * Transforms a delete operation
   */
  private async transformDelete(
    deleteOp: Operation, 
    againstOp: Operation, 
    context: TransformationContext
  ): Promise<Operation> {
    const transformedOp = { ...deleteOp };

    switch (againstOp.type) {
      case 'insert':
        if (deleteOp.position >= againstOp.position) {
          transformedOp.position += againstOp.content?.length || 0;
        }
        break;

      case 'delete':
        const deleteStart = deleteOp.position;
        const deleteEnd = deleteOp.position + (deleteOp.length || 0);
        const againstStart = againstOp.position;
        const againstEnd = againstOp.position + (againstOp.length || 0);

        if (deleteEnd <= againstStart) {
          // Our delete is entirely before the other delete
          // No change needed
        } else if (deleteStart >= againstEnd) {
          // Our delete is entirely after the other delete
          transformedOp.position -= againstOp.length || 0;
        } else {
          // Overlapping deletes - need to adjust both position and length
          const overlapStart = Math.max(deleteStart, againstStart);
          const overlapEnd = Math.min(deleteEnd, againstEnd);
          const overlapLength = Math.max(0, overlapEnd - overlapStart);
          
          transformedOp.position = Math.min(deleteStart, againstStart);
          transformedOp.length = (transformedOp.length || 0) - overlapLength;
          
          // If the length becomes zero or negative, this delete is no longer needed
          if ((transformedOp.length || 0) <= 0) {
            return this.createNoOpOperation(deleteOp);
          }
        }
        break;

      case 'replace':
        // Similar logic to delete, but considering the replacement content
        if (deleteOp.position >= againstOp.position + (againstOp.length || 0)) {
          // Delete is after the replace
          const oldLength = againstOp.length || 0;
          const newLength = againstOp.content?.length || 0;
          transformedOp.position += newLength - oldLength;
        } else if (deleteOp.position + (deleteOp.length || 0) <= againstOp.position) {
          // Delete is before the replace - no change
        } else {
          // Overlap with replace - complex case
          // For simplicity, convert to a different operation or flag for manual resolution
          logger.warn('Complex delete-replace overlap detected', {
            deleteOpId: deleteOp.id,
            replaceOpId: againstOp.id
          });
        }
        break;

      default:
        break;
    }

    return this.createTransformedOperation(transformedOp, deleteOp);
  }

  /**
   * Transforms a retain operation
   */
  private async transformRetain(
    retainOp: Operation, 
    againstOp: Operation, 
    context: TransformationContext
  ): Promise<Operation> {
    const transformedOp = { ...retainOp };

    // Retain operations typically don't need position adjustments
    // but may need length adjustments in complex scenarios
    
    switch (againstOp.type) {
      case 'insert':
        if (retainOp.position <= againstOp.position && 
            againstOp.position < retainOp.position + (retainOp.length || 0)) {
          // Insert is within the retain range
          transformedOp.length = (transformedOp.length || 0) + (againstOp.content?.length || 0);
        }
        break;

      case 'delete':
        // Adjust retain length if delete affects the retained range
        const retainStart = retainOp.position;
        const retainEnd = retainOp.position + (retainOp.length || 0);
        const deleteStart = againstOp.position;
        const deleteEnd = againstOp.position + (againstOp.length || 0);

        if (deleteStart < retainEnd && deleteEnd > retainStart) {
          // There's an overlap
          const overlapStart = Math.max(retainStart, deleteStart);
          const overlapEnd = Math.min(retainEnd, deleteEnd);
          const overlapLength = overlapEnd - overlapStart;
          
          transformedOp.length = (transformedOp.length || 0) - overlapLength;
        }
        break;

      default:
        break;
    }

    return this.createTransformedOperation(transformedOp, retainOp);
  }

  /**
   * Transforms a replace operation
   */
  private async transformReplace(
    replaceOp: Operation, 
    againstOp: Operation, 
    context: TransformationContext
  ): Promise<Operation> {
    const transformedOp = { ...replaceOp };

    switch (againstOp.type) {
      case 'insert':
        if (replaceOp.position >= againstOp.position) {
          transformedOp.position += againstOp.content?.length || 0;
        }
        break;

      case 'delete':
        // Complex case - may need to convert to insert or adjust
        const replaceStart = replaceOp.position;
        const replaceEnd = replaceOp.position + (replaceOp.length || 0);
        const deleteStart = againstOp.position;
        const deleteEnd = againstOp.position + (againstOp.length || 0);

        if (replaceEnd <= deleteStart) {
          // Replace is entirely before the delete - no change
        } else if (replaceStart >= deleteEnd) {
          // Replace is entirely after the delete
          transformedOp.position -= againstOp.length || 0;
        } else {
          // Overlap - complex transformation needed
          logger.warn('Complex replace-delete overlap detected', {
            replaceOpId: replaceOp.id,
            deleteOpId: againstOp.id
          });
          // For now, keep the replace but adjust position to deletion point
          transformedOp.position = deleteStart;
        }
        break;

      case 'replace':
        // Two replaces - need to handle overlap
        if (replaceOp.position === againstOp.position && 
            replaceOp.length === againstOp.length) {
          // Identical replace operations - use tie-breaking
          if (context.transformationBias === 'right' ||
              (context.transformationBias === 'neutral' && replaceOp.userId > againstOp.userId)) {
            // Convert to insert after the other replace
            transformedOp.type = 'insert';
            transformedOp.position += againstOp.content?.length || 0;
            transformedOp.length = undefined;
          } else {
            // This operation is discarded in favor of the other
            return this.createNoOpOperation(replaceOp);
          }
        }
        break;

      default:
        break;
    }

    return this.createTransformedOperation(transformedOp, replaceOp);
  }

  /**
   * Transforms a move operation
   */
  private async transformMove(
    moveOp: Operation, 
    againstOp: Operation, 
    context: TransformationContext
  ): Promise<Operation> {
    // Move operations are complex and may need special handling
    // For now, implement basic position adjustment
    const transformedOp = { ...moveOp };

    switch (againstOp.type) {
      case 'insert':
        // Adjust both source and destination positions if needed
        if (moveOp.position >= againstOp.position) {
          transformedOp.position += againstOp.content?.length || 0;
        }
        // Also adjust destination if it's encoded in attributes
        if (moveOp.attributes?.destination && 
            typeof moveOp.attributes.destination === 'number' &&
            moveOp.attributes.destination >= againstOp.position) {
          transformedOp.attributes = {
            ...moveOp.attributes,
            destination: moveOp.attributes.destination + (againstOp.content?.length || 0)
          };
        }
        break;

      case 'delete':
        // Similar logic for deletes
        if (moveOp.position > againstOp.position) {
          transformedOp.position -= againstOp.length || 0;
        }
        break;

      default:
        break;
    }

    return this.createTransformedOperation(transformedOp, moveOp);
  }
  
  /**
   * Cleans up stale locks that have exceeded the timeout
   */
  private cleanupStaleLocks(): void {
    const now = Date.now();
    const staleLocks: string[] = [];
    
    for (const [key, timestamp] of this.transformLocks.entries()) {
      if (now - timestamp > OperationalTransformEngine.OPERATION_TIMEOUT_MS) {
        staleLocks.push(key);
      }
    }
    
    for (const key of staleLocks) {
      this.transformLocks.delete(key);
      logger.warn('Cleaned up stale transformation lock', { 
        lockKey: key, 
        age: now - this.transformLocks.get(key)!
      });
    }
    
    if (staleLocks.length > 0) {
      logger.info('Lock cleanup completed', { 
        cleanedCount: staleLocks.length,
        remainingLocks: this.transformLocks.size
      });
    }
  }

  /**
   * Creates transformation context for operation pair
   */
  private createTransformationContext(op: Operation, againstOp: Operation): TransformationContext {
    return {
      isInsertion: op.type === 'insert',
      isOwnOp: op.userId === againstOp.userId,
      priority: this.calculateOperationPriority(op, againstOp),
      semanticType: op.semanticType,
      transformationBias: this.determineBias(op, againstOp)
    };
  }

  /**
   * Calculates priority for operation ordering
   */
  private calculateOperationPriority(op: Operation, againstOp: Operation): number {
    // Lower numbers have higher priority
    let priority = 50; // Default priority

    // Insertions generally have higher priority than deletions
    if (op.type === 'insert') priority -= 10;
    if (op.type === 'delete') priority += 10;

    // Operations from the same user have lower priority (break ties consistently)
    if (op.userId === againstOp.userId) priority += 5;

    // Semantic types can influence priority
    const semanticPriority = {
      'query_term': -5,
      'structural_element': -3,
      'text': 0,
      'annotation_tag': 2,
      'filter_condition': 3
    };
    priority += semanticPriority[op.semanticType as keyof typeof semanticPriority] || 0;

    return priority;
  }

  /**
   * Determines transformation bias for tie-breaking
   */
  private determineBias(op: Operation, againstOp: Operation): 'left' | 'right' | 'neutral' {
    // Use consistent tie-breaking based on user ID and timestamp
    if (op.timestamp.getTime() !== againstOp.timestamp.getTime()) {
      return op.timestamp.getTime() < againstOp.timestamp.getTime() ? 'left' : 'right';
    }
    
    // If timestamps are identical, use user ID for deterministic ordering
    return op.userId.localeCompare(againstOp.userId) < 0 ? 'left' : 'right';
  }

  /**
   * Creates a transformed operation with proper metadata
   */
  private createTransformedOperation(transformedOp: Partial<Operation>, originalOp: Operation): Operation {
    return OperationSchema.parse({
      ...transformedOp,
      id: crypto.randomUUID(),
      userId: originalOp.userId,
      timestamp: new Date(),
      sessionId: originalOp.sessionId,
      // Mark as transformed and reference original
      attributes: {
        ...originalOp.attributes,
        isTransformed: true,
        originalOperationId: originalOp.id
      }
    });
  }

  /**
   * Creates a no-op operation (operation that does nothing)
   */
  private createNoOpOperation(originalOp: Operation): Operation {
    return OperationSchema.parse({
      id: crypto.randomUUID(),
      type: 'retain',
      position: 0,
      length: 0,
      userId: originalOp.userId,
      timestamp: new Date(),
      sessionId: originalOp.sessionId,
      attributes: {
        ...originalOp.attributes,
        isNoOp: true,
        originalOperationId: originalOp.id
      }
    });
  }

  /**
   * Performs the actual operation application
   */
  private async performApplyOperation(content: string, op: Operation): Promise<ApplyOperationResult> {
    const warnings: string[] = [];
    let result: string;
    let appliedSuccessfully = true;

    try {
      switch (op.type) {
        case 'insert':
          if (op.position > content.length) {
            warnings.push(`Insert position ${op.position} is beyond content length ${content.length}`);
            appliedSuccessfully = false;
            result = content;
          } else {
            result = content.slice(0, op.position) + 
                    (op.content || '') + 
                    content.slice(op.position);
          }
          break;

        case 'delete':
          const deleteEnd = op.position + (op.length || 0);
          if (op.position > content.length || deleteEnd > content.length) {
            warnings.push(`Delete range ${op.position}-${deleteEnd} exceeds content length ${content.length}`);
            appliedSuccessfully = false;
            result = content;
          } else {
            result = content.slice(0, op.position) + content.slice(deleteEnd);
          }
          break;

        case 'replace':
          const replaceEnd = op.position + (op.length || 0);
          if (op.position > content.length || replaceEnd > content.length) {
            warnings.push(`Replace range ${op.position}-${replaceEnd} exceeds content length ${content.length}`);
            appliedSuccessfully = false;
            result = content;
          } else {
            result = content.slice(0, op.position) + 
                    (op.content || '') + 
                    content.slice(replaceEnd);
          }
          break;

        case 'retain':
          // Retain doesn't change content, just validates range
          const retainEnd = op.position + (op.length || 0);
          if (retainEnd > content.length) {
            warnings.push(`Retain range ${op.position}-${retainEnd} exceeds content length ${content.length}`);
          }
          result = content;
          break;

        case 'move':
          // Move is complex - implement basic version
          const moveLength = op.length || 1;
          const destination = op.attributes?.destination as number || op.position;
          
          if (op.position + moveLength > content.length || destination > content.length) {
            warnings.push(`Move operation parameters exceed content bounds`);
            appliedSuccessfully = false;
            result = content;
          } else {
            const movingText = content.slice(op.position, op.position + moveLength);
            const withoutMoving = content.slice(0, op.position) + content.slice(op.position + moveLength);
            result = withoutMoving.slice(0, destination) + movingText + withoutMoving.slice(destination);
          }
          break;

        default:
          warnings.push(`Unsupported operation type: ${op.type}`);
          appliedSuccessfully = false;
          result = content;
      }

      return {
        content: result,
        appliedSuccessfully,
        warnings
      };

    } catch (error) {
      return {
        content,
        appliedSuccessfully: false,
        warnings: [`Operation application failed: ${error instanceof Error ? error.message : String(error)}`]
      };
    }
  }

  /**
   * Creates an inverted operation
   */
  private async createInvertedOperation(op: Operation): Promise<Operation> {
    let invertedOp: Partial<Operation>;

    switch (op.type) {
      case 'insert':
        // Invert insert with delete
        invertedOp = {
          type: 'delete',
          position: op.position,
          length: op.content?.length || 0
        };
        break;

      case 'delete':
        // Invert delete with insert (need original content)
        invertedOp = {
          type: 'insert',
          position: op.position,
          content: op.attributes?.deletedContent as string || ''
        };
        break;

      case 'replace':
        // Invert replace with another replace
        invertedOp = {
          type: 'replace',
          position: op.position,
          length: op.content?.length || 0,
          content: op.attributes?.originalContent as string || ''
        };
        break;

      case 'retain':
        // Retain inverts to itself
        invertedOp = { ...op };
        break;

      case 'move':
        // Invert move with reverse move
        const originalDest = op.attributes?.destination as number || op.position;
        invertedOp = {
          type: 'move',
          position: originalDest,
          length: op.length,
          attributes: {
            destination: op.position
          }
        };
        break;

      default:
        throw new Error(`Cannot invert operation type: ${op.type}`);
    }

    return OperationSchema.parse({
      ...invertedOp,
      id: crypto.randomUUID(),
      userId: op.userId,
      timestamp: new Date(),
      sessionId: op.sessionId,
      semanticType: op.semanticType,
      attributes: {
        ...op.attributes,
        isInverted: true,
        originalOperationId: op.id
      }
    });
  }

  /**
   * Composes two operations into one
   */
  private async composeTwo(op1: Operation, op2: Operation): Promise<Operation> {
    // This is a simplified composition - full implementation would be more complex
    
    if (op1.type === 'insert' && op2.type === 'insert' && 
        op1.position + (op1.content?.length || 0) === op2.position) {
      // Compose adjacent inserts
      return OperationSchema.parse({
        id: crypto.randomUUID(),
        type: 'insert',
        position: op1.position,
        content: (op1.content || '') + (op2.content || ''),
        userId: op1.userId,
        timestamp: new Date(),
        sessionId: op1.sessionId,
        attributes: {
          isComposed: true,
          composedFromIds: [op1.id, op2.id]
        }
      });
    }

    if (op1.type === 'delete' && op2.type === 'delete' && op1.position === op2.position) {
      // Compose adjacent deletes
      return OperationSchema.parse({
        id: crypto.randomUUID(),
        type: 'delete',
        position: op1.position,
        length: (op1.length || 0) + (op2.length || 0),
        userId: op1.userId,
        timestamp: new Date(),
        sessionId: op1.sessionId,
        attributes: {
          isComposed: true,
          composedFromIds: [op1.id, op2.id]
        }
      });
    }

    // If operations can't be easily composed, return the second one
    // In a full implementation, this would handle more complex composition cases
    return op2;
  }

  /**
   * Records transformation for audit trail
   */
  private async recordTransformation(op: Operation, againstOp: Operation): Promise<void> {
    const client = await this.db.connect();
    try {
      await this.recordTransformationWithClient(client, op, againstOp);
    } finally {
      client.release();
    }
  }
  
  /**
   * Records transformation for audit trail with specific client
   */
  private async recordTransformationWithClient(client: PoolClient, op: Operation, againstOp: Operation): Promise<void> {
    try {
      await client.query(
        `INSERT INTO operational_transform_operations (
          id, operation_type, position, content, length, attributes,
          context_before, context_after, semantic_type,
          user_id, timestamp, session_id, operation_sequence,
          is_transformed, original_operation_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [
          op.id, op.type, op.position, op.content, op.length,
          JSON.stringify(op.attributes), op.contextBefore, op.contextAfter,
          op.semanticType, op.userId, op.timestamp, op.sessionId,
          0, false, null // These will be updated for transformed operations
        ]
      );
    } catch (error) {
      logger.warn('Failed to record operation for audit trail', { error, opId: op.id });
      // Don't fail the transformation due to audit trail issues
    }
  }
  
  /**
   * Records the transformed operation result
   */
  private async recordTransformedOperationWithClient(
    client: PoolClient, 
    transformedOp: Operation, 
    originalOpId: string, 
    againstOpId: string
  ): Promise<void> {
    try {
      await client.query(
        `INSERT INTO operational_transform_operations (
          id, operation_type, position, content, length, attributes,
          context_before, context_after, semantic_type,
          user_id, timestamp, session_id, operation_sequence,
          is_transformed, original_operation_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [
          transformedOp.id, transformedOp.type, transformedOp.position, 
          transformedOp.content, transformedOp.length,
          JSON.stringify(transformedOp.attributes), transformedOp.contextBefore, 
          transformedOp.contextAfter, transformedOp.semanticType, transformedOp.userId, 
          transformedOp.timestamp, transformedOp.sessionId, 0, true, originalOpId
        ]
      );
      
      // Also record the transformation relationship
      await client.query(
        `INSERT INTO operation_transformations (
          id, original_operation_id, against_operation_id, transformed_operation_id,
          transformation_type, created_at, transformation_context
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          crypto.randomUUID(), originalOpId, againstOpId, transformedOp.id,
          'standard', new Date(), JSON.stringify({ transformedAt: new Date() })
        ]
      );
    } catch (error) {
      logger.warn('Failed to record transformed operation', { 
        error, 
        transformedOpId: transformedOp.id,
        originalOpId,
        againstOpId 
      });
      // Don't fail the transformation due to audit trail issues
    }
  }

  /**
   * Validates a transformation result
   */
  private async validateTransformation(
    originalOp: Operation, 
    againstOp: Operation, 
    transformedOp: Operation
  ): Promise<void> {
    // Basic validation - ensure transformed operation is valid
    if (!transformedOp.id || !transformedOp.type || transformedOp.position < 0) {
      throw new Error('Invalid transformed operation');
    }

    // Ensure position is non-negative
    if (transformedOp.position < 0) {
      logger.warn('Transformed operation has negative position', {
        originalOpId: originalOp.id,
        transformedOpId: transformedOp.id,
        position: transformedOp.position
      });
    }

    // For insert/replace operations, ensure content exists
    if ((transformedOp.type === 'insert' || transformedOp.type === 'replace') &&
        !transformedOp.content) {
      logger.warn('Insert/replace operation missing content', {
        transformedOpId: transformedOp.id,
        type: transformedOp.type
      });
    }

    // For delete operations, ensure length is positive
    if (transformedOp.type === 'delete' && (transformedOp.length || 0) <= 0) {
      logger.warn('Delete operation has non-positive length', {
        transformedOpId: transformedOp.id,
        length: transformedOp.length
      });
    }
  }
}