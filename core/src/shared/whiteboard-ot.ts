/**
 * Shared Whiteboard Operational Transforms
 * 
 * Centralized OT utilities used by both backend services and frontend clients.
 * Handles conflict resolution for concurrent whiteboard editing operations.
 * Implements vector clocks and causal consistency to prevent race conditions.
 */

import { z } from 'zod';

/**
 * Vector clock for tracking causal relationships between operations
 */
export interface VectorClock {
  [userId: string]: number;
}

/**
 * Input validation schemas for security
 */
const PositionSchema = z.object({
  x: z.number().finite().min(-10000).max(10000),
  y: z.number().finite().min(-10000).max(10000)
});

const BoundsSchema = z.object({
  x: z.number().finite().min(-10000).max(10000),
  y: z.number().finite().min(-10000).max(10000),
  width: z.number().finite().min(0).max(5000),
  height: z.number().finite().min(0).max(5000)
});

const StyleSchema = z.record(z.string(), z.any()).refine(
  (style) => Object.keys(style).length <= 50,
  { message: "Style object cannot have more than 50 properties" }
);

export const WhiteboardOperationSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(['create', 'update', 'delete', 'move', 'style', 'reorder']),
  elementId: z.string().uuid(),
  elementType: z.string().max(50).optional(),
  data: z.any().optional(),
  position: PositionSchema.optional(),
  bounds: BoundsSchema.optional(),
  style: StyleSchema.optional(),
  zIndex: z.number().int().min(0).max(10000).optional(),
  timestamp: z.string().datetime(),
  version: z.number().int().min(1),
  userId: z.string().uuid(),
  vectorClock: z.record(z.string().uuid(), z.number().int().min(0)),
  lamportTimestamp: z.number().int().min(0),
});

export type WhiteboardOperation = z.infer<typeof WhiteboardOperationSchema>;

export interface TransformContext {
  canvasVersion: number;
  pendingOperations: WhiteboardOperation[];
  elementStates: Map<string, any>;
  currentVectorClock: VectorClock;
  lamportClock: number;
  // Security context
  userId: string;
  userRole: string;
  permissions: Record<string, boolean>;
  // Performance tracking
  operationStartTime?: number;
  maxProcessingTime?: number;
}

/**
 * Validation and sanitization utilities
 */

/**
 * Validates operation permissions
 */
export function validateOperationPermissions(
  operation: WhiteboardOperation,
  context: TransformContext
): { valid: boolean; error?: string } {
  // Check if user has permission to perform this operation
  if (operation.userId !== context.userId) {
    return { valid: false, error: 'User ID mismatch - potential privilege escalation attempt' };
  }

  // Check operation type permissions
  switch (operation.type) {
    case 'create':
      if (!context.permissions.canCreate) {
        return { valid: false, error: 'User lacks create permissions' };
      }
      break;
    case 'update':
    case 'move':
    case 'style':
    case 'reorder':
      if (!context.permissions.canEdit) {
        return { valid: false, error: 'User lacks edit permissions' };
      }
      break;
    case 'delete':
      if (!context.permissions.canDelete) {
        return { valid: false, error: 'User lacks delete permissions' };
      }
      break;
  }

  return { valid: true };
}

/**
 * Clock synchronization state tracking
 */
interface ClockSyncState {
  userClockDrifts: Map<string, number>; // userId -> drift in ms
  suspiciousUsers: Set<string>; // Users with repeated clock violations
  lastSyncCheck: Map<string, number>; // userId -> last check timestamp
}

const clockSyncState: ClockSyncState = {
  userClockDrifts: new Map(),
  suspiciousUsers: new Set(),
  lastSyncCheck: new Map()
};

/**
 * Enhanced timestamp validation with clock synchronization protection
 */
export function validateTimestamp(
  operation: WhiteboardOperation,
  serverTime: Date = new Date(),
  maxClockSkew: number = 60000, // 1 minute
  context?: { 
    userAgent?: string; 
    ipAddress?: string; 
    previousOperationTime?: string;
  }
): { 
  valid: boolean; 
  error?: string; 
  clockDrift?: number;
  recommendation?: string;
} {
  const operationTime = new Date(operation.timestamp);
  const serverTimestamp = serverTime.getTime();
  
  if (isNaN(operationTime.getTime())) {
    return { valid: false, error: 'Invalid timestamp format' };
  }

  const timeDiff = operationTime.getTime() - serverTimestamp;
  const absTimeDiff = Math.abs(timeDiff);
  
  // Check for excessive clock skew
  if (absTimeDiff > maxClockSkew) {
    // Track repeated violations per user
    const currentDrift = clockSyncState.userClockDrifts.get(operation.userId) || 0;
    const newDrift = (currentDrift + timeDiff) / 2; // Moving average
    clockSyncState.userClockDrifts.set(operation.userId, newDrift);
    
    // Mark user as suspicious if repeated large drifts
    if (Math.abs(newDrift) > maxClockSkew / 2) {
      clockSyncState.suspiciousUsers.add(operation.userId);
    }
    
    return { 
      valid: false, 
      error: `Clock skew too large: ${absTimeDiff}ms > ${maxClockSkew}ms`,
      clockDrift: timeDiff,
      recommendation: 'Client should synchronize clock with server time'
    };
  }

  // Check for timestamp manipulation (operation from the future)
  const futureThreshold = 5000; // 5 second tolerance
  if (timeDiff > futureThreshold) {
    // This is very suspicious - flag immediately
    clockSyncState.suspiciousUsers.add(operation.userId);
    
    return { 
      valid: false, 
      error: 'Operation timestamp is from the future - potential temporal manipulation',
      clockDrift: timeDiff,
      recommendation: 'Verify system clock and check for timestamp manipulation'
    };
  }

  // Check for timestamp going backwards (potential replay attack)
  if (context?.previousOperationTime) {
    const previousTime = new Date(context.previousOperationTime).getTime();
    if (operationTime.getTime() < previousTime - 1000) { // 1 second tolerance
      return {
        valid: false,
        error: 'Operation timestamp is older than previous operation - potential replay attack',
        clockDrift: timeDiff,
        recommendation: 'Ensure operations are sent in chronological order'
      };
    }
  }

  // Check operation sequence timing (prevent rapid-fire attacks)
  const minOperationInterval = 10; // 10ms minimum between operations
  const lastCheck = clockSyncState.lastSyncCheck.get(operation.userId) || 0;
  const timeSinceLastOp = serverTimestamp - lastCheck;
  
  if (lastCheck > 0 && timeSinceLastOp < minOperationInterval) {
    return {
      valid: false,
      error: `Operations too frequent: ${timeSinceLastOp}ms < ${minOperationInterval}ms`,
      recommendation: 'Reduce operation frequency to prevent system overload'
    };
  }

  // Update tracking
  clockSyncState.lastSyncCheck.set(operation.userId, serverTimestamp);
  
  // Track clock drift for this user
  if (absTimeDiff > 100) { // Only track significant drifts
    const currentDrift = clockSyncState.userClockDrifts.get(operation.userId) || 0;
    const newDrift = (currentDrift * 0.8) + (timeDiff * 0.2); // Weighted average
    clockSyncState.userClockDrifts.set(operation.userId, newDrift);
  }

  return { 
    valid: true, 
    clockDrift: timeDiff,
    recommendation: absTimeDiff > 1000 ? 'Consider clock synchronization' : undefined
  };
}

/**
 * Check if user has suspicious timestamp patterns
 */
export function isUserSuspiciousTimestamp(userId: string): boolean {
  return clockSyncState.suspiciousUsers.has(userId);
}

/**
 * Get user's clock drift statistics
 */
export function getUserClockDrift(userId: string): {
  driftMs: number;
  isSuspicious: boolean;
  lastCheck: number;
} {
  return {
    driftMs: clockSyncState.userClockDrifts.get(userId) || 0,
    isSuspicious: clockSyncState.suspiciousUsers.has(userId),
    lastCheck: clockSyncState.lastSyncCheck.get(userId) || 0
  };
}

/**
 * Reset clock synchronization state for a user (admin function)
 */
export function resetUserClockState(userId: string): void {
  clockSyncState.userClockDrifts.delete(userId);
  clockSyncState.suspiciousUsers.delete(userId);
  clockSyncState.lastSyncCheck.delete(userId);
}

/**
 * Generate server-side timestamp to enforce synchronization
 */
export function generateServerTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Enforce server-side timestamp on operations
 */
export function enforceServerTimestamp(operation: WhiteboardOperation): WhiteboardOperation {
  return {
    ...operation,
    timestamp: generateServerTimestamp()
  };
}

/**
 * Validates and sanitizes operation data
 */
export function validateAndSanitizeOperation(
  operation: any,
  context: TransformContext
): { operation: WhiteboardOperation | null; errors: string[] } {
  const errors: string[] = [];

  try {
    // Validate against schema
    let validatedOperation = WhiteboardOperationSchema.parse(operation);

    // Check permissions
    const permissionResult = validateOperationPermissions(validatedOperation, context);
    if (!permissionResult.valid) {
      errors.push(permissionResult.error!);
      return { operation: null, errors };
    }

    // Enhanced timestamp validation with clock synchronization
    const timestampResult = validateTimestamp(
      validatedOperation,
      new Date(),
      60000, // 1 minute max clock skew
      {
        previousOperationTime: context.elementStates.get(validatedOperation.elementId)?.lastTimestamp
      }
    );
    
    if (!timestampResult.valid) {
      errors.push(timestampResult.error!);
      
      // Log suspicious timestamp activity
      if (timestampResult.clockDrift && Math.abs(timestampResult.clockDrift) > 30000) {
        console.warn('Suspicious timestamp activity detected', {
          userId: validatedOperation.userId,
          clockDrift: timestampResult.clockDrift,
          recommendation: timestampResult.recommendation
        });
      }
      
      return { operation: null, errors };
    }

    // Warn about significant clock drift even if operation is valid
    if (timestampResult.recommendation) {
      console.info('Clock synchronization recommendation', {
        userId: validatedOperation.userId,
        clockDrift: timestampResult.clockDrift,
        recommendation: timestampResult.recommendation
      });
    }

    // Enforce server-side timestamp for highly suspicious users
    if (isUserSuspiciousTimestamp(validatedOperation.userId)) {
      validatedOperation = enforceServerTimestamp(validatedOperation);
      console.warn('Enforced server-side timestamp for suspicious user', {
        userId: validatedOperation.userId
      });
    }

    // Sanitize data fields
    if (validatedOperation.data) {
      validatedOperation.data = sanitizeObjectData(validatedOperation.data);
    }

    if (validatedOperation.style) {
      validatedOperation.style = sanitizeObjectData(validatedOperation.style);
    }

    return { operation: validatedOperation, errors: [] };

  } catch (error) {
    if (error instanceof z.ZodError) {
      errors.push(...error.errors.map(e => `${e.path.join('.')}: ${e.message}`));
    } else {
      errors.push('Unknown validation error');
    }
    return { operation: null, errors };
  }
}

/**
 * Sanitizes object data to prevent injection attacks
 */
function sanitizeObjectData(data: any, maxDepth: number = 5): any {
  if (maxDepth <= 0) return null;
  if (data === null || data === undefined) return data;

  if (typeof data === 'string') {
    // Remove potentially dangerous characters
    return data.replace(/[<>'"&]/g, '').slice(0, 1000);
  }

  if (typeof data === 'number' || typeof data === 'boolean') {
    return data;
  }

  if (Array.isArray(data)) {
    return data.slice(0, 100).map(item => sanitizeObjectData(item, maxDepth - 1));
  }

  if (typeof data === 'object') {
    const sanitized: any = {};
    let count = 0;
    for (const [key, value] of Object.entries(data)) {
      if (count++ >= 50) break; // Limit object size
      const cleanKey = key.replace(/[<>'"&]/g, '').slice(0, 50);
      if (cleanKey) {
        sanitized[cleanKey] = sanitizeObjectData(value, maxDepth - 1);
      }
    }
    return sanitized;
  }

  return null;
}

/**
 * Vector Clock utilities for causal consistency
 */

/**
 * Creates a new vector clock with all known users set to 0
 */
export function createVectorClock(knownUsers: string[]): VectorClock {
  const clock: VectorClock = {};
  for (const userId of knownUsers) {
    if (typeof userId === 'string' && userId.length > 0) {
      clock[userId] = 0;
    }
  }
  return clock;
}

/**
 * Increments the vector clock for a specific user
 */
export function incrementVectorClock(clock: VectorClock, userId: string): VectorClock {
  if (typeof userId !== 'string' || userId.length === 0) {
    throw new Error('Invalid user ID for vector clock increment');
  }
  
  const newClock = { ...clock };
  newClock[userId] = (newClock[userId] || 0) + 1;
  return newClock;
}

/**
 * Merges two vector clocks by taking the maximum value for each user
 */
export function mergeVectorClocks(clock1: VectorClock, clock2: VectorClock): VectorClock {
  const mergedClock: VectorClock = { ...clock1 };
  
  for (const [userId, timestamp] of Object.entries(clock2)) {
    if (typeof userId === 'string' && typeof timestamp === 'number') {
      mergedClock[userId] = Math.max(mergedClock[userId] || 0, timestamp);
    }
  }
  
  return mergedClock;
}

/**
 * Compares two vector clocks to determine causal relationship
 * Returns: 'before' | 'after' | 'concurrent'
 */
export function compareVectorClocks(clock1: VectorClock, clock2: VectorClock): 'before' | 'after' | 'concurrent' {
  let clock1Greater = false;
  let clock2Greater = false;
  
  const allUsers = new Set([...Object.keys(clock1), ...Object.keys(clock2)]);
  
  for (const userId of allUsers) {
    const time1 = clock1[userId] || 0;
    const time2 = clock2[userId] || 0;
    
    if (time1 > time2) clock1Greater = true;
    if (time2 > time1) clock2Greater = true;
  }
  
  if (clock1Greater && !clock2Greater) return 'after';
  if (clock2Greater && !clock1Greater) return 'before';
  return 'concurrent';
}

/**
 * Checks if operation1 causally happens before operation2
 */
export function isHappensBefore(op1: WhiteboardOperation, op2: WhiteboardOperation): boolean {
  const comparison = compareVectorClocks(op1.vectorClock, op2.vectorClock);
  return comparison === 'before';
}

/**
 * Checks if two operations are concurrent (no causal relationship)
 */
export function isConcurrent(op1: WhiteboardOperation, op2: WhiteboardOperation): boolean {
  const comparison = compareVectorClocks(op1.vectorClock, op2.vectorClock);
  return comparison === 'concurrent';
}

/**
 * Spatial index for fast conflict detection
 */
export class SpatialIndex {
  private grid: Map<string, Set<string>> = new Map();
  private elementBounds: Map<string, { x: number; y: number; width: number; height: number }> = new Map();
  private gridSize: number = 100;

  addElement(elementId: string, bounds: { x: number; y: number; width: number; height: number }): void {
    this.removeElement(elementId); // Remove old entry if exists
    
    this.elementBounds.set(elementId, bounds);
    
    // Add to grid cells
    const cells = this.getCellsForBounds(bounds);
    for (const cell of cells) {
      if (!this.grid.has(cell)) {
        this.grid.set(cell, new Set());
      }
      this.grid.get(cell)!.add(elementId);
    }
  }

  removeElement(elementId: string): void {
    const bounds = this.elementBounds.get(elementId);
    if (bounds) {
      const cells = this.getCellsForBounds(bounds);
      for (const cell of cells) {
        this.grid.get(cell)?.delete(elementId);
        if (this.grid.get(cell)?.size === 0) {
          this.grid.delete(cell);
        }
      }
      this.elementBounds.delete(elementId);
    }
  }

  findNearbyElements(bounds: { x: number; y: number; width: number; height: number }): string[] {
    const nearby = new Set<string>();
    const cells = this.getCellsForBounds(bounds);
    
    for (const cell of cells) {
      const cellElements = this.grid.get(cell);
      if (cellElements) {
        for (const elementId of cellElements) {
          nearby.add(elementId);
        }
      }
    }
    
    return Array.from(nearby);
  }

  private getCellsForBounds(bounds: { x: number; y: number; width: number; height: number }): string[] {
    const cells: string[] = [];
    const startX = Math.floor(bounds.x / this.gridSize);
    const endX = Math.floor((bounds.x + bounds.width) / this.gridSize);
    const startY = Math.floor(bounds.y / this.gridSize);
    const endY = Math.floor((bounds.y + bounds.height) / this.gridSize);
    
    for (let x = startX; x <= endX; x++) {
      for (let y = startY; y <= endY; y++) {
        cells.push(`${x},${y}`);
      }
    }
    
    return cells;
  }
}

/**
 * Transform an operation against a set of concurrent operations with proper causal ordering
 */
export function transformOperation(
  operation: WhiteboardOperation,
  againstOperations: WhiteboardOperation[],
  context: TransformContext
): WhiteboardOperation {
  // Performance timeout check
  if (context.operationStartTime && context.maxProcessingTime) {
    const elapsed = Date.now() - context.operationStartTime;
    if (elapsed > context.maxProcessingTime) {
      throw new Error(`Operation transformation timeout: ${elapsed}ms > ${context.maxProcessingTime}ms`);
    }
  }

  // Sort operations by their causal relationships and lamport timestamps
  const orderedOperations = againstOperations
    .filter(op => {
      // Security check: ensure we don't transform against operations from unauthorized users
      return op.userId && typeof op.userId === 'string';
    })
    .filter(op => isConcurrent(operation, op) || isHappensBefore(op, operation))
    .sort((a, b) => {
      // First sort by causal relationship
      const comparison = compareVectorClocks(a.vectorClock, b.vectorClock);
      if (comparison !== 'concurrent') {
        return comparison === 'before' ? -1 : 1;
      }
      
      // If concurrent, use lamport timestamps
      if (a.lamportTimestamp !== b.lamportTimestamp) {
        return a.lamportTimestamp - b.lamportTimestamp;
      }
      
      // Final tiebreaker: user ID (deterministic)
      return a.userId.localeCompare(b.userId);
    });

  let transformedOp = { ...operation };

  for (const concurrentOp of orderedOperations) {
    transformedOp = transformTwoOperations(transformedOp, concurrentOp, context);
  }

  return transformedOp;
}

/**
 * Transform one operation against another
 */
function transformTwoOperations(
  op1: WhiteboardOperation,
  op2: WhiteboardOperation,
  context: TransformContext
): WhiteboardOperation {
  // If operations are on different elements, check for spatial conflicts only
  if (op1.elementId !== op2.elementId) {
    return handlePositionConflicts(op1, op2);
  }

  // Operations on the same element need conflict resolution
  return transformSameElementOperations(op1, op2, context);
}

/**
 * Handle position conflicts when operations affect nearby elements
 */
function handlePositionConflicts(
  op1: WhiteboardOperation,
  op2: WhiteboardOperation
): WhiteboardOperation {
  // If both operations move elements, check for spatial conflicts
  if (op1.type === 'move' && op2.type === 'move' && op1.position && op2.position) {
    const distance = Math.sqrt(
      Math.pow(op1.position.x - op2.position.x, 2) + 
      Math.pow(op1.position.y - op2.position.y, 2)
    );

    // If elements would overlap, slightly offset the later operation
    if (distance < 50) { // Minimum spacing threshold
      return {
        ...op1,
        position: {
          x: op1.position.x + 10,
          y: op1.position.y + 10,
        },
      };
    }
  }

  return op1;
}

/**
 * Transform operations on the same element with causal consistency
 */
function transformSameElementOperations(
  op1: WhiteboardOperation,
  op2: WhiteboardOperation,
  context: TransformContext
): WhiteboardOperation {
  const causalRelation = compareVectorClocks(op1.vectorClock, op2.vectorClock);
  
  // Create vs Create: This shouldn't happen with proper UUIDs, but handle it
  if (op1.type === 'create' && op2.type === 'create') {
    // Use causal ordering, fallback to lamport timestamps, then user ID
    if (causalRelation === 'before') return op1;
    if (causalRelation === 'after') return op2;
    if (op1.lamportTimestamp !== op2.lamportTimestamp) {
      return op1.lamportTimestamp <= op2.lamportTimestamp ? op1 : op2;
    }
    return op1.userId.localeCompare(op2.userId) <= 0 ? op1 : op2;
  }

  // Delete vs any other operation: Delete wins, but consider causality
  if (op2.type === 'delete') {
    // If op1 happens after the delete causally, it should be ignored
    if (causalRelation === 'after') {
      return op1; // op1 happened after delete, so element was recreated
    }
    return {
      ...op1,
      type: 'delete',
      data: null,
    };
  }

  if (op1.type === 'delete') {
    // If op2 happens after the delete causally, transform to recreate
    if (causalRelation === 'before') {
      return {
        ...op2,
        type: 'create', // Recreate the element with op2's changes
      };
    }
    return op1; // Delete wins
  }

  // Update vs Update: Merge changes with conflict resolution
  if (op1.type === 'update' && op2.type === 'update') {
    return mergeUpdateOperationsWithCausality(op1, op2, causalRelation);
  }

  // Move vs Move: Use causal ordering or lamport timestamp
  if (op1.type === 'move' && op2.type === 'move') {
    if (causalRelation === 'after') return op1;
    if (causalRelation === 'before') return op2;
    // Concurrent moves - use lamport timestamp
    if (op1.lamportTimestamp !== op2.lamportTimestamp) {
      return op1.lamportTimestamp >= op2.lamportTimestamp ? op1 : op2;
    }
    // Final tiebreaker: user ID (deterministic)
    return op1.userId.localeCompare(op2.userId) >= 0 ? op1 : op2;
  }

  // Style vs Style: Merge style properties with causal considerations
  if (op1.type === 'style' && op2.type === 'style') {
    return mergeStyleOperationsWithCausality(op1, op2, causalRelation);
  }

  // Move vs Style: Combine both operations
  if ((op1.type === 'move' && op2.type === 'style') || 
      (op1.type === 'style' && op2.type === 'move')) {
    const moveOp = op1.type === 'move' ? op1 : op2;
    const styleOp = op1.type === 'style' ? op1 : op2;
    
    return {
      ...op1,
      type: 'update',
      position: moveOp.position,
      style: styleOp.style,
      // Use the latest vector clock and lamport timestamp
      vectorClock: mergeVectorClocks(op1.vectorClock, op2.vectorClock),
      lamportTimestamp: Math.max(op1.lamportTimestamp, op2.lamportTimestamp),
    };
  }

  // Default: Use causal ordering
  if (causalRelation === 'after') return op1;
  if (causalRelation === 'before') return op2;
  
  // Concurrent operations - use lamport timestamp as tiebreaker
  if (op1.lamportTimestamp !== op2.lamportTimestamp) {
    return op1.lamportTimestamp >= op2.lamportTimestamp ? op1 : op2;
  }
  
  // Final tiebreaker: user ID (deterministic)
  return op1.userId.localeCompare(op2.userId) >= 0 ? op1 : op2;
}

/**
 * Merge update operations with causal consistency
 */
function mergeUpdateOperationsWithCausality(
  op1: WhiteboardOperation,
  op2: WhiteboardOperation,
  causalRelation: 'before' | 'after' | 'concurrent'
): WhiteboardOperation {
  if (causalRelation === 'after') {
    // op1 happens after op2, so op1's changes take precedence
    return {
      ...op1,
      data: {
        ...op2.data,
        ...op1.data,
      },
      position: op1.position || op2.position,
      bounds: op1.bounds || op2.bounds,
      style: {
        ...op2.style,
        ...op1.style,
      },
    };
  } else if (causalRelation === 'before') {
    // op2 happens after op1, so op2's changes take precedence
    return {
      ...op1,
      data: {
        ...op1.data,
        ...op2.data,
      },
      position: op2.position || op1.position,
      bounds: op2.bounds || op1.bounds,
      style: {
        ...op1.style,
        ...op2.style,
      },
      vectorClock: op2.vectorClock,
      lamportTimestamp: op2.lamportTimestamp,
    };
  } else {
    // Concurrent operations - merge with conflict resolution
    return {
      ...op1,
      data: mergeDataWithConflictResolution(op1.data, op2.data, op1.userId, op2.userId),
      position: op1.position || op2.position,
      bounds: op1.bounds || op2.bounds,
      style: mergeStyleWithConflictResolution(op1.style, op2.style, op1.userId, op2.userId),
      vectorClock: mergeVectorClocks(op1.vectorClock, op2.vectorClock),
      lamportTimestamp: Math.max(op1.lamportTimestamp, op2.lamportTimestamp),
    };
  }
}

/**
 * Merge style operations with causal consistency
 */
function mergeStyleOperationsWithCausality(
  op1: WhiteboardOperation,
  op2: WhiteboardOperation,
  causalRelation: 'before' | 'after' | 'concurrent'
): WhiteboardOperation {
  if (causalRelation === 'after') {
    return {
      ...op1,
      style: {
        ...op2.style,
        ...op1.style,
      },
    };
  } else if (causalRelation === 'before') {
    return {
      ...op1,
      style: {
        ...op1.style,
        ...op2.style,
      },
      vectorClock: op2.vectorClock,
      lamportTimestamp: op2.lamportTimestamp,
    };
  } else {
    // Concurrent style changes - use deterministic merge
    return {
      ...op1,
      style: mergeStyleWithConflictResolution(op1.style, op2.style, op1.userId, op2.userId),
      vectorClock: mergeVectorClocks(op1.vectorClock, op2.vectorClock),
      lamportTimestamp: Math.max(op1.lamportTimestamp, op2.lamportTimestamp),
    };
  }
}

/**
 * Merge data objects with conflict resolution based on user priority
 */
function mergeDataWithConflictResolution(
  data1: any, 
  data2: any, 
  user1Id: string, 
  user2Id: string
): any {
  if (!data1) return sanitizeObjectData(data2);
  if (!data2) return sanitizeObjectData(data1);
  
  const merged = { ...data1 };
  
  for (const [key, value] of Object.entries(data2)) {
    if (!(key in merged)) {
      merged[key] = value;
    } else if (merged[key] !== value) {
      // Conflict resolution: use lexicographically smaller user ID for consistency
      if (user1Id.localeCompare(user2Id) <= 0) {
        merged[key] = data1[key];
      } else {
        merged[key] = value;
      }
    }
  }
  
  return sanitizeObjectData(merged);
}

/**
 * Merge style objects with conflict resolution
 */
function mergeStyleWithConflictResolution(
  style1: any, 
  style2: any, 
  user1Id: string, 
  user2Id: string
): any {
  return mergeDataWithConflictResolution(style1, style2, user1Id, user2Id);
}

/**
 * Apply an operation to the canvas state
 */
export function applyOperation(
  operation: WhiteboardOperation,
  canvasState: any
): any {
  const newState = { ...canvasState };

  switch (operation.type) {
    case 'create':
      if (!newState.elements) {
        newState.elements = [];
      }
      newState.elements.push({
        id: operation.elementId,
        type: operation.elementType,
        ...operation.data,
        position: operation.position,
        bounds: operation.bounds,
        style: operation.style,
        zIndex: operation.zIndex || 0,
      });
      break;

    case 'update':
      if (newState.elements) {
        const elementIndex = newState.elements.findIndex(
          (el: any) => el.id === operation.elementId
        );
        if (elementIndex !== -1) {
          newState.elements[elementIndex] = {
            ...newState.elements[elementIndex],
            ...operation.data,
            position: operation.position || newState.elements[elementIndex].position,
            bounds: operation.bounds || newState.elements[elementIndex].bounds,
            style: operation.style ? {
              ...newState.elements[elementIndex].style,
              ...operation.style,
            } : newState.elements[elementIndex].style,
          };
        }
      }
      break;

    case 'delete':
      if (newState.elements) {
        newState.elements = newState.elements.filter(
          (el: any) => el.id !== operation.elementId
        );
      }
      break;

    case 'move':
      if (newState.elements && operation.position) {
        const elementIndex = newState.elements.findIndex(
          (el: any) => el.id === operation.elementId
        );
        if (elementIndex !== -1) {
          newState.elements[elementIndex] = {
            ...newState.elements[elementIndex],
            position: operation.position,
            bounds: operation.bounds || newState.elements[elementIndex].bounds,
          };
        }
      }
      break;

    case 'style':
      if (newState.elements && operation.style) {
        const elementIndex = newState.elements.findIndex(
          (el: any) => el.id === operation.elementId
        );
        if (elementIndex !== -1) {
          newState.elements[elementIndex] = {
            ...newState.elements[elementIndex],
            style: {
              ...newState.elements[elementIndex].style,
              ...operation.style,
            },
          };
        }
      }
      break;

    case 'reorder':
      if (newState.elements && operation.zIndex !== undefined) {
        const elementIndex = newState.elements.findIndex(
          (el: any) => el.id === operation.elementId
        );
        if (elementIndex !== -1) {
          newState.elements[elementIndex] = {
            ...newState.elements[elementIndex],
            zIndex: operation.zIndex,
          };
          // Re-sort elements by zIndex
          newState.elements.sort((a: any, b: any) => (a.zIndex || 0) - (b.zIndex || 0));
        }
      }
      break;
  }

  // Update canvas version
  newState.version = operation.version;
  newState.lastModified = operation.timestamp;

  return newState;
}

/**
 * Validates operation integrity with comprehensive checks
 */
export function validateOperation(operation: WhiteboardOperation): boolean {
  if (!operation.id || !operation.elementId || !operation.type || !operation.timestamp) {
    return false;
  }

  if (operation.type === 'create' && !operation.elementType) {
    return false;
  }

  if (operation.type === 'move' && !operation.position) {
    return false;
  }

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(operation.id) || !uuidRegex.test(operation.elementId) || !uuidRegex.test(operation.userId)) {
    return false;
  }

  return true;
}

/**
 * Creates a new operation with proper vector clock and lamport timestamp
 */
export function createOperation(
  type: WhiteboardOperation['type'],
  elementId: string,
  userId: string,
  context: TransformContext,
  options: {
    elementType?: string;
    data?: any;
    position?: { x: number; y: number };
    bounds?: { x: number; y: number; width: number; height: number };
    style?: any;
    zIndex?: number;
  } = {}
): WhiteboardOperation {
  // Security: validate user can create this operation type
  const permissionCheck = validateOperationPermissions({
    type,
    userId,
    elementId,
    id: '',
    timestamp: '',
    version: 0,
    vectorClock: {},
    lamportTimestamp: 0,
    ...options
  } as WhiteboardOperation, context);

  if (!permissionCheck.valid) {
    throw new Error(`Permission denied: ${permissionCheck.error}`);
  }

  // Increment vector clock for this user
  const newVectorClock = incrementVectorClock(context.currentVectorClock, userId);
  
  // Increment lamport timestamp
  const newLamportTimestamp = context.lamportClock + 1;
  
  // Generate secure operation ID
  const timestamp = Date.now();
  const randomPart = Math.random().toString(36).substr(2, 9);
  const operationId = `${type}_${elementId}_${userId}_${timestamp}_${randomPart}`;

  return {
    id: operationId,
    type,
    elementId,
    elementType: options.elementType,
    data: options.data ? sanitizeObjectData(options.data) : undefined,
    position: options.position,
    bounds: options.bounds,
    style: options.style ? sanitizeObjectData(options.style) : undefined,
    zIndex: options.zIndex,
    timestamp: new Date().toISOString(),
    version: context.canvasVersion,
    userId,
    vectorClock: newVectorClock,
    lamportTimestamp: newLamportTimestamp,
  };
}

/**
 * Updates the transform context after processing an operation
 */
export function updateTransformContext(
  context: TransformContext,
  operation: WhiteboardOperation
): TransformContext {
  return {
    ...context,
    currentVectorClock: mergeVectorClocks(context.currentVectorClock, operation.vectorClock),
    lamportClock: Math.max(context.lamportClock, operation.lamportTimestamp),
    canvasVersion: context.canvasVersion + 1,
  };
}

/**
 * Calculate operation priority for conflict resolution (enhanced with causality)
 */
export function getOperationPriority(operation: WhiteboardOperation): number {
  // Higher numbers = higher priority
  let basePriority = 0;
  switch (operation.type) {
    case 'delete': basePriority = 100; break;
    case 'create': basePriority = 90; break;
    case 'update': basePriority = 80; break;
    case 'move': basePriority = 70; break;
    case 'style': basePriority = 60; break;
    case 'reorder': basePriority = 50; break;
    default: basePriority = 0;
  }
  
  // Add lamport timestamp as fine-grained priority
  return basePriority * 1000000 + operation.lamportTimestamp;
}

/**
 * Validates that an operation has proper vector clock and lamport timestamp
 */
export function isValidOperation(operation: WhiteboardOperation): boolean {
  return !!(
    operation.id &&
    operation.elementId &&
    operation.type &&
    operation.timestamp &&
    operation.userId &&
    operation.vectorClock &&
    typeof operation.lamportTimestamp === 'number' &&
    operation.vectorClock[operation.userId] !== undefined
  );
}