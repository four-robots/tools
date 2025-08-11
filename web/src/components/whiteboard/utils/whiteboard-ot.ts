/**
 * Whiteboard Operational Transforms
 * 
 * Handles conflict resolution for concurrent whiteboard editing operations.
 * Implements vector clocks and causal consistency to prevent race conditions.
 */

/**
 * Vector clock for tracking causal relationships between operations
 */
export interface VectorClock {
  [userId: string]: number;
}

export interface WhiteboardOperation {
  id: string;
  type: 'create' | 'update' | 'delete' | 'move' | 'style' | 'reorder';
  elementId: string;
  elementType?: string;
  data?: any;
  position?: { x: number; y: number };
  bounds?: { x: number; y: number; width: number; height: number };
  style?: any;
  zIndex?: number;
  timestamp: string;
  version: number;
  userId: string;
  vectorClock: VectorClock;
  lamportTimestamp: number;
}

export interface TransformContext {
  canvasVersion: number;
  pendingOperations: WhiteboardOperation[];
  elementStates: Map<string, any>;
  currentVectorClock: VectorClock;
  lamportClock: number;
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
    clock[userId] = 0;
  }
  return clock;
}

/**
 * Increments the vector clock for a specific user
 */
export function incrementVectorClock(clock: VectorClock, userId: string): VectorClock {
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
    mergedClock[userId] = Math.max(mergedClock[userId] || 0, timestamp);
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
 * Transform an operation against a set of concurrent operations with proper causal ordering
 */
export function transformOperation(
  operation: WhiteboardOperation,
  againstOperations: WhiteboardOperation[],
  context: TransformContext
): WhiteboardOperation {
  // Sort operations by their causal relationships and lamport timestamps
  const orderedOperations = againstOperations
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
  // If operations are on different elements, no transformation needed
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
  if (!data1) return data2;
  if (!data2) return data1;
  
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
  
  return merged;
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
 * Merge two update operations on the same element
 */
function mergeUpdateOperations(
  op1: WhiteboardOperation,
  op2: WhiteboardOperation
): WhiteboardOperation {
  return {
    ...op1,
    data: {
      ...op2.data,
      ...op1.data, // op1's changes take precedence
    },
    position: op1.position || op2.position,
    bounds: op1.bounds || op2.bounds,
    style: {
      ...op2.style,
      ...op1.style,
    },
  };
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
 * Generate inverse operation for undo/redo functionality
 */
export function generateInverseOperation(
  operation: WhiteboardOperation,
  previousState: any
): WhiteboardOperation | null {
  const timestamp = new Date().toISOString();

  switch (operation.type) {
    case 'create':
      return {
        ...operation,
        id: `undo_${operation.id}`,
        type: 'delete',
        timestamp,
      };

    case 'delete':
      const deletedElement = previousState.elements?.find(
        (el: any) => el.id === operation.elementId
      );
      if (deletedElement) {
        return {
          ...operation,
          id: `undo_${operation.id}`,
          type: 'create',
          data: deletedElement,
          position: deletedElement.position,
          bounds: deletedElement.bounds,
          style: deletedElement.style,
          timestamp,
        };
      }
      break;

    case 'update':
    case 'move':
    case 'style':
      const originalElement = previousState.elements?.find(
        (el: any) => el.id === operation.elementId
      );
      if (originalElement) {
        return {
          ...operation,
          id: `undo_${operation.id}`,
          type: operation.type,
          data: operation.type === 'update' ? originalElement : undefined,
          position: operation.type === 'move' ? originalElement.position : undefined,
          style: operation.type === 'style' ? originalElement.style : undefined,
          timestamp,
        };
      }
      break;
  }

  return null;
}

/**
 * Validate operation integrity
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

  return true;
}

/**
 * Compress multiple operations on the same element into a single operation
 */
export function compressOperations(operations: WhiteboardOperation[]): WhiteboardOperation[] {
  const compressed = new Map<string, WhiteboardOperation>();

  for (const op of operations) {
    const existing = compressed.get(op.elementId);
    
    if (!existing) {
      compressed.set(op.elementId, op);
      continue;
    }

    // Merge operations on the same element
    const merged = mergeUpdateOperations(op, existing);
    compressed.set(op.elementId, merged);
  }

  return Array.from(compressed.values()).sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
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
  // Increment vector clock for this user
  const newVectorClock = incrementVectorClock(context.currentVectorClock, userId);
  
  // Increment lamport timestamp
  const newLamportTimestamp = context.lamportClock + 1;
  
  return {
    id: `${type}_${elementId}_${userId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    type,
    elementId,
    elementType: options.elementType,
    data: options.data,
    position: options.position,
    bounds: options.bounds,
    style: options.style,
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