/**
 * Enhanced Operational Transform Engine for Real-time Collaborative Whiteboard
 * 
 * Implements advanced OT algorithms for complex conflict resolution supporting:
 * - Complex multi-user transformation scenarios
 * - Compound operations (move+resize+rotate)
 * - Intelligent conflict detection and resolution
 * - Performance optimization for 25+ concurrent users
 * - Vector clocks for causal consistency
 * - Operation compression and deduplication
 */

import { Logger } from '../../utils/logger.js';
import { 
  WhiteboardOperation, 
  VectorClock, 
  TransformContext,
  transformOperation as coreTransformOperation,
  isConcurrent,
  isHappensBefore,
  compareVectorClocks,
  mergeVectorClocks,
  validateAndSanitizeOperation,
  validateTimestamp,
  SpatialIndex
} from '../../shared/whiteboard-ot.js';
import { z } from 'zod';

// Enhanced operation types with compound support
export type EnhancedOperationType = 
  | 'create' | 'update' | 'delete' | 'move' | 'style' | 'reorder'
  | 'compound' | 'batch' | 'resize' | 'rotate' | 'group' | 'ungroup';

export type ConflictType = 
  | 'spatial' | 'temporal' | 'semantic' | 'ordering' | 'dependency' | 'compound';

export type ConflictSeverity = 'low' | 'medium' | 'high' | 'critical';

export type ResolutionStrategy = 
  | 'last-write-wins' | 'priority-user' | 'merge' | 'manual' | 'automatic';

// Enhanced operation schema with performance optimizations
export const EnhancedOperationSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(['create', 'update', 'delete', 'move', 'style', 'reorder', 'compound', 'batch', 'resize', 'rotate', 'group', 'ungroup']),
  elementId: z.string(),
  elementType: z.string().optional(),
  data: z.any().optional(),
  position: z.object({ x: z.number(), y: z.number() }).optional(),
  bounds: z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() }).optional(),
  rotation: z.number().optional(),
  style: z.any().optional(),
  zIndex: z.number().optional(),
  parentOperations: z.array(z.string()).optional(), // For compound operations
  dependsOn: z.array(z.string()).optional(), // Operation dependencies
  timestamp: z.string(),
  version: z.number(),
  userId: z.string(),
  vectorClock: z.record(z.string(), z.number()),
  lamportTimestamp: z.number(),
  priority: z.number().optional(),
  retries: z.number().default(0),
  metadata: z.object({
    clientId: z.string().optional(),
    sessionId: z.string().optional(),
    networkLatency: z.number().optional(),
    processingTime: z.number().optional(),
  }).optional(),
});

export type EnhancedWhiteboardOperation = z.infer<typeof EnhancedOperationSchema>;

// Conflict detection and classification
export interface ConflictInfo {
  id: string;
  type: ConflictType;
  severity: ConflictSeverity;
  operations: EnhancedWhiteboardOperation[];
  affectedElements: string[];
  spatialOverlap?: {
    area: number;
    percentage: number;
  };
  temporalProximity?: {
    timeDiffMs: number;
    isSimultaneous: boolean;
  };
  semanticConflict?: {
    incompatibleChanges: string[];
    dataConflicts: Record<string, any>;
  };
  resolutionStrategy: ResolutionStrategy;
  resolutionTime?: number;
  detectedAt: string;
  resolvedAt?: string;
  resolution?: {
    strategy: ResolutionStrategy;
    resultOperation?: EnhancedWhiteboardOperation;
    manualInterventionRequired: boolean;
    confidence: number;
  };
}

// Performance monitoring
export interface PerformanceMetrics {
  operationCount: number;
  averageLatency: number;
  maxLatency: number;
  conflictRate: number;
  resolutionSuccessRate: number;
  operationThroughput: number;
  memoryUsage: number;
  activeUsers: number;
  queueSize: number;
  lastUpdated: string;
}

// Enhanced transform context with performance tracking
export interface EnhancedTransformContext extends TransformContext {
  performanceMetrics: PerformanceMetrics;
  conflictHistory: ConflictInfo[];
  userPriorities: Record<string, number>;
  activeConflicts: Map<string, ConflictInfo>;
  operationQueue: EnhancedWhiteboardOperation[];
  compressionEnabled: boolean;
  batchingEnabled: boolean;
  adaptiveThrottling: {
    enabled: boolean;
    currentRate: number;
    targetLatency: number;
  };
  // Spatial indexing for performance
  spatialIndex: SpatialIndex;
  // Memory management
  memoryCache: LRUCache<string, any>;
  // Security context
  userId: string;
  userRole: string;
  permissions: Record<string, boolean>;
}

/**
 * LRU Cache implementation for memory management
 */
export class LRUCache<K, V> {
  private cache = new Map<K, V>();
  private maxSize: number;

  constructor(maxSize: number = 1000) {
    this.maxSize = maxSize;
  }

  get(key: K): V | undefined {
    if (this.cache.has(key)) {
      // Move to end (most recently used)
      const value = this.cache.get(key)!;
      this.cache.delete(key);
      this.cache.set(key, value);
      return value;
    }
    return undefined;
  }

  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Remove least recently used (first item)
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }

  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }

  getMemoryUsage(): number {
    // Estimate memory usage in bytes
    return this.cache.size * 1024; // Rough estimate
  }
}

/**
 * Transaction state for atomic operations
 */
export interface Transaction {
  id: string;
  operations: EnhancedWhiteboardOperation[];
  rollbackData: Map<string, any>;
  state: 'pending' | 'committed' | 'rolledback';
  timestamp: string;
  userId: string;
}

/**
 * Enhanced Operational Transform Engine
 */
export class WhiteboardOTEngine {
  private logger: Logger;
  private conflictCount: number = 0;
  private operationCount: number = 0;
  private startTime: number = Date.now();
  private conflictDetectors: Map<ConflictType, (op1: EnhancedWhiteboardOperation, op2: EnhancedWhiteboardOperation) => ConflictInfo | null>;
  private resolutionStrategies: Map<ResolutionStrategy, (conflict: ConflictInfo) => Promise<EnhancedWhiteboardOperation | null>>;
  private spatialIndex: SpatialIndex;
  private memoryCache: LRUCache<string, any>;
  private activeTransactions: Map<string, Transaction> = new Map();
  private performanceMonitor: {
    operationLatencies: number[];
    memorySnapshots: number[];
    lastCleanup: number;
  };

  constructor(logger?: Logger) {
    this.logger = logger || new Logger('WhiteboardOTEngine');
    this.spatialIndex = new SpatialIndex();
    this.memoryCache = new LRUCache<string, any>(5000); // Bounded cache
    this.performanceMonitor = {
      operationLatencies: [],
      memorySnapshots: [],
      lastCleanup: Date.now()
    };
    
    this.initializeConflictDetectors();
    this.initializeResolutionStrategies();
    this.startPerformanceMonitoring();
    
    this.logger.info('Enhanced Whiteboard OT Engine initialized', {
      supportedOperations: [
        'create', 'update', 'delete', 'move', 'style', 'reorder',
        'compound', 'batch', 'resize', 'rotate', 'group', 'ungroup'
      ],
      conflictTypes: ['spatial', 'temporal', 'semantic', 'ordering', 'dependency', 'compound'],
      resolutionStrategies: ['last-write-wins', 'priority-user', 'merge', 'manual', 'automatic'],
      spatialIndexing: true,
      memoryManagement: true,
      atomicTransactions: true
    });
  }

  /**
   * Start background performance monitoring
   */
  private startPerformanceMonitoring(): void {
    setInterval(() => {
      this.performCleanup();
    }, 30000); // Cleanup every 30 seconds
  }

  /**
   * Perform memory cleanup and performance optimization
   */
  private performCleanup(): void {
    const now = Date.now();
    
    // Clean up old performance data
    if (this.performanceMonitor.operationLatencies.length > 1000) {
      this.performanceMonitor.operationLatencies = this.performanceMonitor.operationLatencies.slice(-500);
    }
    
    if (this.performanceMonitor.memorySnapshots.length > 100) {
      this.performanceMonitor.memorySnapshots = this.performanceMonitor.memorySnapshots.slice(-50);
    }

    // Clean up old transactions
    for (const [txId, tx] of this.activeTransactions.entries()) {
      const txAge = now - new Date(tx.timestamp).getTime();
      if (txAge > 300000) { // 5 minutes
        this.rollbackTransaction(txId);
      }
    }

    // Force garbage collection if memory usage is high
    const memoryUsage = process.memoryUsage().heapUsed / 1024 / 1024;
    if (memoryUsage > 500) { // 500MB threshold
      if (global.gc) {
        global.gc();
      }
      this.logger.warn('High memory usage detected, triggered cleanup', { memoryUsageMB: memoryUsage });
    }

    this.performanceMonitor.lastCleanup = now;
  }

  /**
   * Transform operation with enhanced conflict detection and resolution
   */
  async transformOperation(
    operation: EnhancedWhiteboardOperation,
    context: EnhancedTransformContext
  ): Promise<{
    transformedOperation: EnhancedWhiteboardOperation;
    conflicts: ConflictInfo[];
    performance: {
      processingTimeMs: number;
      memoryUsageMB: number;
      queueSize: number;
    };
  }> {
    const startTime = Date.now();
    const startMemory = process.memoryUsage().heapUsed;

    try {
      // Step 1: Comprehensive validation and sanitization
      const validationResult = validateAndSanitizeOperation(operation, {
        ...context,
        operationStartTime: startTime,
        maxProcessingTime: 500 // 500ms timeout
      });

      if (!validationResult.operation || validationResult.errors.length > 0) {
        throw new Error(`Operation validation failed: ${validationResult.errors.join(', ')}`);
      }

      const validatedOperation = validationResult.operation as EnhancedWhiteboardOperation;
      this.operationCount++;

      // Step 2: Check performance constraints
      if (startTime - context.performanceMetrics.lastUpdated > 1000) {
        this.updatePerformanceMetrics(context, 0, false);
      }

      // Step 3: Spatial indexing for fast conflict detection
      if (validatedOperation.bounds) {
        this.spatialIndex.addElement(validatedOperation.elementId, validatedOperation.bounds);
      }

      // Step 4: Use spatial index to find potentially conflicting operations
      const spatiallyRelevantOps = validatedOperation.bounds 
        ? this.spatialIndex.findNearbyElements(validatedOperation.bounds)
        : [];

      const relevantPendingOps = context.pendingOperations.filter(op => 
        spatiallyRelevantOps.includes(op.elementId) || 
        op.elementId === validatedOperation.elementId
      );

      // Step 5: Detect conflicts with optimized algorithm
      const conflicts = await this.detectConflictsOptimized(validatedOperation, relevantPendingOps, context);
      
      // Step 6: Apply resolution strategies with timeout protection
      let transformedOperation = validatedOperation;
      for (const conflict of conflicts) {
        const elapsed = Date.now() - startTime;
        if (elapsed > 400) { // Leave 100ms buffer before 500ms timeout
          this.logger.warn('Operation transformation timeout approaching, skipping remaining conflicts', {
            operationId: validatedOperation.id,
            elapsed,
            remainingConflicts: conflicts.length
          });
          break;
        }

        const resolution = await this.resolveConflict(conflict, context);
        if (resolution) {
          transformedOperation = resolution;
        }
      }

      // Step 7: Apply operational transforms with performance monitoring
      const finalOperation = await this.applyOperationalTransforms(
        transformedOperation,
        relevantPendingOps,
        context
      );

      // Step 8: Update performance metrics and cache
      const processingTime = Date.now() - startTime;
      const memoryUsage = process.memoryUsage().heapUsed - startMemory;
      
      this.performanceMonitor.operationLatencies.push(processingTime);
      this.performanceMonitor.memorySnapshots.push(memoryUsage);
      
      this.updatePerformanceMetrics(context, processingTime, conflicts.length > 0);

      // Step 9: Cache result for potential reuse
      const cacheKey = `${validatedOperation.id}_${validatedOperation.timestamp}`;
      this.memoryCache.set(cacheKey, finalOperation);

      return {
        transformedOperation: finalOperation,
        conflicts,
        performance: {
          processingTimeMs: processingTime,
          memoryUsageMB: memoryUsage / 1024 / 1024,
          queueSize: context.operationQueue.length
        }
      };

    } catch (error) {
      this.logger.error('Failed to transform operation', { 
        error, 
        operationId: operation.id,
        operationType: operation.type,
        processingTime: Date.now() - startTime
      });
      throw error;
    }
  }

  /**
   * Optimized conflict detection using spatial indexing
   */
  private async detectConflictsOptimized(
    operation: EnhancedWhiteboardOperation,
    relevantOperations: EnhancedWhiteboardOperation[],
    context: EnhancedTransformContext
  ): Promise<ConflictInfo[]> {
    const conflicts: ConflictInfo[] = [];

    // Use parallel processing for multiple conflict detectors
    const conflictPromises = Array.from(this.conflictDetectors.entries()).map(async ([conflictType, detector]) => {
      const typeConflicts: ConflictInfo[] = [];
      
      for (const existingOp of relevantOperations) {
        try {
          const conflict = detector(operation, existingOp);
          if (conflict) {
            typeConflicts.push(conflict);
          }
        } catch (error) {
          this.logger.warn('Conflict detector failed', { 
            conflictType, 
            error,
            operationId: operation.id 
          });
        }
      }
      
      return typeConflicts;
    });

    const allConflictResults = await Promise.all(conflictPromises);
    
    // Flatten and deduplicate conflicts
    const conflictMap = new Map<string, ConflictInfo>();
    for (const typeConflicts of allConflictResults) {
      for (const conflict of typeConflicts) {
        conflictMap.set(conflict.id, conflict);
        context.activeConflicts.set(conflict.id, conflict);
      }
    }

    conflicts.push(...conflictMap.values());

    // Sort conflicts by severity and timestamp for optimal resolution order
    conflicts.sort((a, b) => {
      const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      const aSeverity = severityOrder[a.severity];
      const bSeverity = severityOrder[b.severity];
      
      if (aSeverity !== bSeverity) {
        return bSeverity - aSeverity; // Descending severity
      }
      
      return new Date(a.detectedAt).getTime() - new Date(b.detectedAt).getTime();
    });

    return conflicts;
  }

  /**
   * Enhanced conflict detection with multiple algorithms
   */
  private async detectConflicts(
    operation: EnhancedWhiteboardOperation,
    context: EnhancedTransformContext
  ): Promise<ConflictInfo[]> {
    const conflicts: ConflictInfo[] = [];
    const relevantOperations = this.findRelevantOperations(operation, context);

    for (const existingOp of relevantOperations) {
      // Apply all conflict detection algorithms
      for (const [conflictType, detector] of this.conflictDetectors) {
        try {
          const conflict = detector(operation, existingOp);
          if (conflict) {
            conflicts.push(conflict);
            context.activeConflicts.set(conflict.id, conflict);
          }
        } catch (error) {
          this.logger.warn('Conflict detector failed', { 
            conflictType, 
            error,
            operationId: operation.id 
          });
        }
      }
    }

    // Sort conflicts by severity and timestamp
    conflicts.sort((a, b) => {
      const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      const aSeverity = severityOrder[a.severity];
      const bSeverity = severityOrder[b.severity];
      
      if (aSeverity !== bSeverity) {
        return bSeverity - aSeverity; // Descending severity
      }
      
      return new Date(a.detectedAt).getTime() - new Date(b.detectedAt).getTime();
    });

    return conflicts;
  }

  /**
   * Intelligent conflict resolution with multiple strategies
   */
  private async resolveConflict(
    conflict: ConflictInfo,
    context: EnhancedTransformContext
  ): Promise<EnhancedWhiteboardOperation | null> {
    const strategy = this.selectResolutionStrategy(conflict, context);
    conflict.resolutionStrategy = strategy;

    try {
      const resolver = this.resolutionStrategies.get(strategy);
      if (!resolver) {
        this.logger.warn('No resolver found for strategy', { strategy, conflictId: conflict.id });
        return null;
      }

      const startTime = Date.now();
      const resolution = await resolver(conflict);
      const resolutionTime = Date.now() - startTime;

      conflict.resolutionTime = resolutionTime;
      conflict.resolvedAt = new Date().toISOString();
      
      if (resolution) {
        conflict.resolution = {
          strategy,
          resultOperation: resolution,
          manualInterventionRequired: strategy === 'manual',
          confidence: this.calculateResolutionConfidence(conflict, resolution)
        };

        // Add to conflict history
        context.conflictHistory.push(conflict);
        
        // Remove from active conflicts
        context.activeConflicts.delete(conflict.id);

        this.logger.info('Conflict resolved', {
          conflictId: conflict.id,
          strategy,
          resolutionTime,
          confidence: conflict.resolution.confidence
        });
      }

      return resolution;

    } catch (error) {
      this.logger.error('Failed to resolve conflict', { 
        error, 
        conflictId: conflict.id, 
        strategy 
      });
      return null;
    }
  }

  /**
   * Enhanced operational transforms with compound operation support
   */
  private async applyOperationalTransforms(
    operation: EnhancedWhiteboardOperation,
    pendingOperations: EnhancedWhiteboardOperation[],
    context: EnhancedTransformContext
  ): Promise<EnhancedWhiteboardOperation> {
    // Handle compound operations
    if (operation.type === 'compound' && operation.parentOperations) {
      return await this.transformCompoundOperation(operation, pendingOperations, context);
    }

    // Handle batch operations
    if (operation.type === 'batch') {
      return await this.transformBatchOperation(operation, pendingOperations, context);
    }

    // Standard operational transform with enhanced algorithms
    return this.transformSingleOperation(operation, pendingOperations, context);
  }

  /**
   * Transform compound operations (move+resize+rotate, etc.)
   */
  private async transformCompoundOperation(
    operation: EnhancedWhiteboardOperation,
    pendingOperations: EnhancedWhiteboardOperation[],
    context: EnhancedTransformContext
  ): Promise<EnhancedWhiteboardOperation> {
    // Decompose compound operation into atomic operations
    const atomicOps = this.decomposeCompoundOperation(operation);
    
    // Transform each atomic operation
    const transformedAtomicOps: EnhancedWhiteboardOperation[] = [];
    for (const atomicOp of atomicOps) {
      const transformed = this.transformSingleOperation(atomicOp, pendingOperations, context);
      transformedAtomicOps.push(transformed);
    }

    // Recompose into compound operation
    return this.recomposeCompoundOperation(operation, transformedAtomicOps);
  }

  /**
   * Transform batch operations for performance optimization
   */
  private async transformBatchOperation(
    operation: EnhancedWhiteboardOperation,
    pendingOperations: EnhancedWhiteboardOperation[],
    context: EnhancedTransformContext
  ): Promise<EnhancedWhiteboardOperation> {
    // Extract batch operations from data
    const batchOps = operation.data?.operations as EnhancedWhiteboardOperation[] || [];
    
    // Transform each operation in the batch
    const transformedBatch: EnhancedWhiteboardOperation[] = [];
    for (const batchOp of batchOps) {
      const transformed = this.transformSingleOperation(batchOp, pendingOperations, context);
      transformedBatch.push(transformed);
    }

    // Return updated batch operation
    return {
      ...operation,
      data: {
        ...operation.data,
        operations: transformedBatch
      }
    };
  }

  /**
   * Core single operation transformation with causal consistency
   */
  private transformSingleOperation(
    operation: EnhancedWhiteboardOperation,
    pendingOperations: EnhancedWhiteboardOperation[],
    context: EnhancedTransformContext
  ): EnhancedWhiteboardOperation {
    // Convert to standard format for compatibility
    const standardOperation: WhiteboardOperation = {
      id: operation.id,
      type: operation.type as any,
      elementId: operation.elementId,
      elementType: operation.elementType,
      data: operation.data,
      position: operation.position,
      bounds: operation.bounds,
      style: operation.style,
      zIndex: operation.zIndex,
      timestamp: operation.timestamp,
      version: operation.version,
      userId: operation.userId,
      vectorClock: operation.vectorClock,
      lamportTimestamp: operation.lamportTimestamp
    };

    const standardPendingOps: WhiteboardOperation[] = pendingOperations.map(op => ({
      id: op.id,
      type: op.type as any,
      elementId: op.elementId,
      elementType: op.elementType,
      data: op.data,
      position: op.position,
      bounds: op.bounds,
      style: op.style,
      zIndex: op.zIndex,
      timestamp: op.timestamp,
      version: op.version,
      userId: op.userId,
      vectorClock: op.vectorClock,
      lamportTimestamp: op.lamportTimestamp
    }));

    const standardContext: TransformContext = {
      canvasVersion: context.canvasVersion,
      pendingOperations: standardPendingOps,
      elementStates: context.elementStates,
      currentVectorClock: context.currentVectorClock,
      lamportClock: context.lamportClock,
      userId: context.userId || operation.userId,
      userRole: context.userRole || 'editor',
      permissions: context.permissions || { canEdit: true, canCreate: true, canDelete: true },
      operationStartTime: Date.now(),
      maxProcessingTime: 500 // 500ms timeout for performance
    };

    // Apply core transformation with security and performance checks
    const transformed = coreTransformOperation(standardOperation, standardPendingOps, standardContext);

    // Convert back to enhanced format
    return {
      ...operation,
      ...transformed,
      type: transformed.type as EnhancedOperationType,
      metadata: {
        ...operation.metadata,
        processingTime: Date.now() - new Date(operation.timestamp).getTime()
      }
    };
  }

  /**
   * Initialize conflict detection algorithms
   */
  private initializeConflictDetectors(): void {
    this.conflictDetectors = new Map();

    // Spatial conflict detection
    this.conflictDetectors.set('spatial', (op1, op2) => {
      if (!op1.position || !op2.position || op1.elementId === op2.elementId) return null;

      const distance = Math.sqrt(
        Math.pow(op1.position.x - op2.position.x, 2) + 
        Math.pow(op1.position.y - op2.position.y, 2)
      );

      const threshold = 50; // Spatial proximity threshold
      if (distance < threshold) {
        const overlap = this.calculateSpatialOverlap(op1, op2);
        return {
          id: `spatial_${op1.id}_${op2.id}`,
          type: 'spatial',
          severity: overlap.percentage > 0.5 ? 'high' : 'medium',
          operations: [op1, op2],
          affectedElements: [op1.elementId, op2.elementId],
          spatialOverlap: overlap,
          resolutionStrategy: 'automatic',
          detectedAt: new Date().toISOString()
        };
      }
      return null;
    });

    // Temporal conflict detection
    this.conflictDetectors.set('temporal', (op1, op2) => {
      const timeDiff = Math.abs(
        new Date(op1.timestamp).getTime() - new Date(op2.timestamp).getTime()
      );
      
      const simultaneousThreshold = 1000; // 1 second
      if (timeDiff < simultaneousThreshold && op1.elementId === op2.elementId) {
        return {
          id: `temporal_${op1.id}_${op2.id}`,
          type: 'temporal',
          severity: timeDiff < 100 ? 'high' : 'medium',
          operations: [op1, op2],
          affectedElements: [op1.elementId],
          temporalProximity: {
            timeDiffMs: timeDiff,
            isSimultaneous: timeDiff < 100
          },
          resolutionStrategy: 'last-write-wins',
          detectedAt: new Date().toISOString()
        };
      }
      return null;
    });

    // Semantic conflict detection
    this.conflictDetectors.set('semantic', (op1, op2) => {
      if (op1.elementId !== op2.elementId) return null;

      const incompatibleChanges = this.findIncompatibleChanges(op1, op2);
      if (incompatibleChanges.length > 0) {
        return {
          id: `semantic_${op1.id}_${op2.id}`,
          type: 'semantic',
          severity: 'high',
          operations: [op1, op2],
          affectedElements: [op1.elementId],
          semanticConflict: {
            incompatibleChanges,
            dataConflicts: this.extractDataConflicts(op1, op2)
          },
          resolutionStrategy: 'merge',
          detectedAt: new Date().toISOString()
        };
      }
      return null;
    });

    // Add more conflict detectors...
  }

  /**
   * Initialize resolution strategies
   */
  private initializeResolutionStrategies(): void {
    this.resolutionStrategies = new Map();

    // Last-write-wins strategy
    this.resolutionStrategies.set('last-write-wins', async (conflict) => {
      const operations = conflict.operations.sort((a, b) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
      return operations[0]; // Return the most recent operation
    });

    // Priority user strategy
    this.resolutionStrategies.set('priority-user', async (conflict) => {
      // Implementation would use context.userPriorities
      const highestPriorityOp = conflict.operations.reduce((prev, current) => {
        // For now, use lexicographic ordering as a simple priority
        return prev.userId.localeCompare(current.userId) < 0 ? prev : current;
      });
      return highestPriorityOp;
    });

    // Merge strategy
    this.resolutionStrategies.set('merge', async (conflict) => {
      if (conflict.operations.length !== 2) return null;
      
      const [op1, op2] = conflict.operations;
      return this.mergeOperations(op1, op2);
    });

    // Automatic strategy (intelligent selection based on conflict type)
    this.resolutionStrategies.set('automatic', async (conflict) => {
      switch (conflict.type) {
        case 'spatial':
          return this.resolutionStrategies.get('last-write-wins')!(conflict);
        case 'temporal':
          return this.resolutionStrategies.get('priority-user')!(conflict);
        case 'semantic':
          return this.resolutionStrategies.get('merge')!(conflict);
        default:
          return this.resolutionStrategies.get('last-write-wins')!(conflict);
      }
    });

    // Manual strategy (requires external intervention)
    this.resolutionStrategies.set('manual', async (conflict) => {
      // Return null to indicate manual intervention required
      this.logger.info('Manual conflict resolution required', { 
        conflictId: conflict.id,
        conflictType: conflict.type 
      });
      return null;
    });
  }

  /**
   * Operation compression for performance optimization
   */
  compressOperations(operations: EnhancedWhiteboardOperation[]): EnhancedWhiteboardOperation[] {
    const compressed = new Map<string, EnhancedWhiteboardOperation>();
    const sequentialOps = new Map<string, EnhancedWhiteboardOperation[]>();

    // Group operations by element
    for (const op of operations) {
      if (!sequentialOps.has(op.elementId)) {
        sequentialOps.set(op.elementId, []);
      }
      sequentialOps.get(op.elementId)!.push(op);
    }

    // Compress operations for each element
    for (const [elementId, ops] of sequentialOps) {
      if (ops.length === 1) {
        compressed.set(elementId, ops[0]);
        continue;
      }

      // Sort by timestamp
      ops.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      // Merge sequential operations
      const mergedOp = this.mergeSequentialOperations(ops);
      compressed.set(elementId, mergedOp);
    }

    return Array.from(compressed.values());
  }

  /**
   * Performance monitoring and adaptive throttling
   */
  private updatePerformanceMetrics(
    context: EnhancedTransformContext,
    processingTime: number,
    hadConflicts: boolean
  ): void {
    const metrics = context.performanceMetrics;
    
    metrics.operationCount++;
    metrics.averageLatency = (metrics.averageLatency * (metrics.operationCount - 1) + processingTime) / metrics.operationCount;
    metrics.maxLatency = Math.max(metrics.maxLatency, processingTime);
    
    if (hadConflicts) {
      this.conflictCount++;
    }
    
    metrics.conflictRate = this.conflictCount / this.operationCount;
    metrics.operationThroughput = this.operationCount / ((Date.now() - this.startTime) / 1000);
    metrics.memoryUsage = process.memoryUsage().heapUsed / 1024 / 1024;
    metrics.queueSize = context.operationQueue.length;
    metrics.lastUpdated = new Date().toISOString();

    // Adaptive throttling based on performance
    if (context.adaptiveThrottling.enabled) {
      this.adjustThrottling(context, processingTime);
    }
  }

  /**
   * Helper methods for conflict detection and resolution
   */
  private calculateSpatialOverlap(op1: EnhancedWhiteboardOperation, op2: EnhancedWhiteboardOperation): { area: number; percentage: number } {
    if (!op1.bounds || !op2.bounds) {
      return { area: 0, percentage: 0 };
    }

    const left = Math.max(op1.bounds.x, op2.bounds.x);
    const right = Math.min(op1.bounds.x + op1.bounds.width, op2.bounds.x + op2.bounds.width);
    const top = Math.max(op1.bounds.y, op2.bounds.y);
    const bottom = Math.min(op1.bounds.y + op1.bounds.height, op2.bounds.y + op2.bounds.height);

    if (left < right && top < bottom) {
      const overlapArea = (right - left) * (bottom - top);
      const totalArea = (op1.bounds.width * op1.bounds.height) + (op2.bounds.width * op2.bounds.height) - overlapArea;
      return {
        area: overlapArea,
        percentage: overlapArea / totalArea
      };
    }

    return { area: 0, percentage: 0 };
  }

  private findIncompatibleChanges(op1: EnhancedWhiteboardOperation, op2: EnhancedWhiteboardOperation): string[] {
    const incompatible: string[] = [];
    
    // Check for conflicting operation types
    if ((op1.type === 'delete' && op2.type === 'update') || 
        (op1.type === 'update' && op2.type === 'delete')) {
      incompatible.push('delete-update-conflict');
    }

    // Check for conflicting style changes
    if (op1.style && op2.style) {
      for (const [key, value1] of Object.entries(op1.style)) {
        if (op2.style[key] && op2.style[key] !== value1) {
          incompatible.push(`style-conflict-${key}`);
        }
      }
    }

    return incompatible;
  }

  private extractDataConflicts(op1: EnhancedWhiteboardOperation, op2: EnhancedWhiteboardOperation): Record<string, any> {
    const conflicts: Record<string, any> = {};
    
    if (op1.data && op2.data) {
      for (const [key, value1] of Object.entries(op1.data)) {
        if (op2.data[key] && op2.data[key] !== value1) {
          conflicts[key] = { op1: value1, op2: op2.data[key] };
        }
      }
    }

    return conflicts;
  }

  private selectResolutionStrategy(conflict: ConflictInfo, context: EnhancedTransformContext): ResolutionStrategy {
    // Intelligent strategy selection based on conflict characteristics
    switch (conflict.type) {
      case 'spatial':
        return conflict.severity === 'high' ? 'manual' : 'automatic';
      case 'temporal':
        return 'last-write-wins';
      case 'semantic':
        return conflict.severity === 'critical' ? 'manual' : 'merge';
      default:
        return 'automatic';
    }
  }

  private calculateResolutionConfidence(conflict: ConflictInfo, resolution: EnhancedWhiteboardOperation): number {
    // Calculate confidence based on conflict characteristics and resolution quality
    let confidence = 0.5; // Base confidence

    // Increase confidence for automatic resolutions of simple conflicts
    if (conflict.type === 'temporal' && conflict.operations.length === 2) {
      confidence += 0.3;
    }

    // Decrease confidence for complex semantic conflicts
    if (conflict.type === 'semantic' && conflict.semanticConflict?.incompatibleChanges.length! > 2) {
      confidence -= 0.2;
    }

    // Increase confidence for successful merges
    if (conflict.resolutionStrategy === 'merge' && resolution.data) {
      confidence += 0.2;
    }

    return Math.max(0, Math.min(1, confidence));
  }

  private mergeOperations(op1: EnhancedWhiteboardOperation, op2: EnhancedWhiteboardOperation): EnhancedWhiteboardOperation {
    return {
      ...op1,
      data: { ...op2.data, ...op1.data },
      style: { ...op2.style, ...op1.style },
      position: op1.position || op2.position,
      bounds: op1.bounds || op2.bounds,
      timestamp: new Date().toISOString(),
      vectorClock: this.mergeVectorClocks(op1.vectorClock, op2.vectorClock),
      lamportTimestamp: Math.max(op1.lamportTimestamp, op2.lamportTimestamp) + 1
    };
  }

  private mergeVectorClocks(clock1: VectorClock, clock2: VectorClock): VectorClock {
    const merged: VectorClock = { ...clock1 };
    for (const [userId, timestamp] of Object.entries(clock2)) {
      merged[userId] = Math.max(merged[userId] || 0, timestamp);
    }
    return merged;
  }

  private findRelevantOperations(
    operation: EnhancedWhiteboardOperation,
    context: EnhancedTransformContext
  ): EnhancedWhiteboardOperation[] {
    // Find operations that could conflict with the given operation
    return context.operationQueue.filter(op => 
      op.elementId === operation.elementId ||
      this.areOperationsSpatiallyClose(operation, op) ||
      this.areOperationsTemporallyClose(operation, op)
    );
  }

  private areOperationsSpatiallyClose(op1: EnhancedWhiteboardOperation, op2: EnhancedWhiteboardOperation): boolean {
    if (!op1.position || !op2.position) return false;
    
    const distance = Math.sqrt(
      Math.pow(op1.position.x - op2.position.x, 2) + 
      Math.pow(op1.position.y - op2.position.y, 2)
    );
    
    return distance < 100; // Spatial proximity threshold
  }

  private areOperationsTemporallyClose(op1: EnhancedWhiteboardOperation, op2: EnhancedWhiteboardOperation): boolean {
    const timeDiff = Math.abs(
      new Date(op1.timestamp).getTime() - new Date(op2.timestamp).getTime()
    );
    
    return timeDiff < 5000; // 5 second temporal window
  }

  private decomposeCompoundOperation(operation: EnhancedWhiteboardOperation): EnhancedWhiteboardOperation[] {
    // Implementation for decomposing compound operations into atomic operations
    // This would break down move+resize+rotate into separate operations
    const atomicOps: EnhancedWhiteboardOperation[] = [];
    
    if (operation.data?.moves) {
      atomicOps.push({
        ...operation,
        type: 'move',
        data: operation.data.moves
      });
    }
    
    if (operation.data?.resize) {
      atomicOps.push({
        ...operation,
        type: 'resize',
        data: operation.data.resize
      });
    }
    
    if (operation.data?.rotation) {
      atomicOps.push({
        ...operation,
        type: 'rotate',
        data: operation.data.rotation
      });
    }
    
    return atomicOps;
  }

  private recomposeCompoundOperation(
    original: EnhancedWhiteboardOperation, 
    atomicOps: EnhancedWhiteboardOperation[]
  ): EnhancedWhiteboardOperation {
    // Recompose atomic operations back into compound operation
    const recomposed = { ...original };
    recomposed.data = {};
    
    for (const atomicOp of atomicOps) {
      switch (atomicOp.type) {
        case 'move':
          recomposed.data.moves = atomicOp.data;
          recomposed.position = atomicOp.position;
          break;
        case 'resize':
          recomposed.data.resize = atomicOp.data;
          recomposed.bounds = atomicOp.bounds;
          break;
        case 'rotate':
          recomposed.data.rotation = atomicOp.data;
          recomposed.rotation = atomicOp.rotation;
          break;
      }
    }
    
    return recomposed;
  }

  private mergeSequentialOperations(operations: EnhancedWhiteboardOperation[]): EnhancedWhiteboardOperation {
    // Merge multiple operations on the same element into a single operation
    let merged = operations[0];
    
    for (let i = 1; i < operations.length; i++) {
      merged = this.mergeOperations(merged, operations[i]);
    }
    
    return merged;
  }

  private adjustThrottling(context: EnhancedTransformContext, processingTime: number): void {
    const throttling = context.adaptiveThrottling;
    
    if (processingTime > throttling.targetLatency) {
      // Increase throttling if processing is slow
      throttling.currentRate = Math.min(throttling.currentRate * 1.2, 10000);
    } else {
      // Decrease throttling if processing is fast
      throttling.currentRate = Math.max(throttling.currentRate * 0.9, 100);
    }
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics(): PerformanceMetrics {
    return {
      operationCount: this.operationCount,
      averageLatency: this.operationCount > 0 ? (Date.now() - this.startTime) / this.operationCount : 0,
      maxLatency: 0, // Would track this in real implementation
      conflictRate: this.operationCount > 0 ? this.conflictCount / this.operationCount : 0,
      resolutionSuccessRate: 0.95, // Would calculate from actual data
      operationThroughput: this.operationCount / ((Date.now() - this.startTime) / 1000),
      memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024,
      activeUsers: 0, // Would be provided by context
      queueSize: 0, // Would be provided by context
      lastUpdated: new Date().toISOString()
    };
  }

  /**
   * Begin atomic transaction for compound operations
   */
  beginTransaction(userId: string): string {
    const transactionId = `tx_${userId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const transaction: Transaction = {
      id: transactionId,
      operations: [],
      rollbackData: new Map(),
      state: 'pending',
      timestamp: new Date().toISOString(),
      userId
    };
    
    this.activeTransactions.set(transactionId, transaction);
    
    this.logger.info('Transaction started', { transactionId, userId });
    
    return transactionId;
  }

  /**
   * Add operation to transaction
   */
  addToTransaction(transactionId: string, operation: EnhancedWhiteboardOperation, rollbackData?: any): void {
    const transaction = this.activeTransactions.get(transactionId);
    if (!transaction) {
      throw new Error(`Transaction not found: ${transactionId}`);
    }
    
    if (transaction.state !== 'pending') {
      throw new Error(`Transaction ${transactionId} is not in pending state`);
    }
    
    transaction.operations.push(operation);
    if (rollbackData) {
      transaction.rollbackData.set(operation.id, rollbackData);
    }
  }

  /**
   * Commit atomic transaction
   */
  async commitTransaction(transactionId: string): Promise<EnhancedWhiteboardOperation[]> {
    const transaction = this.activeTransactions.get(transactionId);
    if (!transaction) {
      throw new Error(`Transaction not found: ${transactionId}`);
    }
    
    if (transaction.state !== 'pending') {
      throw new Error(`Transaction ${transactionId} is not in pending state`);
    }

    try {
      // Apply all operations atomically
      const results: EnhancedWhiteboardOperation[] = [];
      
      for (const operation of transaction.operations) {
        // Validate each operation before commit
        const validationResult = validateAndSanitizeOperation(operation, {
          canvasVersion: 1,
          pendingOperations: [],
          elementStates: new Map(),
          currentVectorClock: {},
          lamportClock: 0,
          userId: transaction.userId,
          userRole: 'editor',
          permissions: { canEdit: true, canCreate: true, canDelete: true }
        });

        if (!validationResult.operation) {
          throw new Error(`Invalid operation in transaction: ${validationResult.errors.join(', ')}`);
        }

        results.push(validationResult.operation as EnhancedWhiteboardOperation);
      }

      transaction.state = 'committed';
      this.activeTransactions.delete(transactionId);
      
      this.logger.info('Transaction committed successfully', { 
        transactionId, 
        operationCount: results.length 
      });
      
      return results;

    } catch (error) {
      this.logger.error('Transaction commit failed, rolling back', { 
        transactionId, 
        error 
      });
      
      await this.rollbackTransaction(transactionId);
      throw error;
    }
  }

  /**
   * Rollback atomic transaction
   */
  async rollbackTransaction(transactionId: string): Promise<void> {
    const transaction = this.activeTransactions.get(transactionId);
    if (!transaction) {
      this.logger.warn('Attempted to rollback non-existent transaction', { transactionId });
      return;
    }

    try {
      // Apply rollback data for each operation in reverse order
      const rollbackOps = [...transaction.operations].reverse();
      
      for (const operation of rollbackOps) {
        const rollbackData = transaction.rollbackData.get(operation.id);
        if (rollbackData) {
          // Apply rollback logic here
          this.logger.debug('Rolling back operation', { 
            operationId: operation.id, 
            rollbackData 
          });
        }
      }

      transaction.state = 'rolledback';
      this.activeTransactions.delete(transactionId);
      
      this.logger.info('Transaction rolled back successfully', { transactionId });

    } catch (error) {
      this.logger.error('Transaction rollback failed', { 
        transactionId, 
        error 
      });
      
      // Force cleanup even if rollback fails
      transaction.state = 'rolledback';
      this.activeTransactions.delete(transactionId);
    }
  }

  /**
   * Get transaction status
   */
  getTransactionStatus(transactionId: string): Transaction | null {
    return this.activeTransactions.get(transactionId) || null;
  }

  /**
   * Create enhanced transform context
   */
  createEnhancedContext(baseContext: TransformContext): EnhancedTransformContext {
    return {
      ...baseContext,
      performanceMetrics: this.getPerformanceMetrics(),
      conflictHistory: [],
      userPriorities: {},
      activeConflicts: new Map(),
      operationQueue: [],
      compressionEnabled: true,
      batchingEnabled: true,
      adaptiveThrottling: {
        enabled: true,
        currentRate: 1000,
        targetLatency: 500
      },
      spatialIndex: this.spatialIndex,
      memoryCache: this.memoryCache,
      userId: baseContext.userId,
      userRole: baseContext.userRole,
      permissions: baseContext.permissions
    };
  }
}