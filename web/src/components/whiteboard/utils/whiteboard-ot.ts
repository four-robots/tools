/**
 * Whiteboard Operational Transforms
 * 
 * Handles conflict resolution for concurrent whiteboard editing operations.
 * Implements a simplified OT algorithm optimized for canvas/drawing operations.
 */

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
}

export interface TransformContext {
  canvasVersion: number;
  pendingOperations: WhiteboardOperation[];
  elementStates: Map<string, any>;
}

/**
 * Transform an operation against a set of concurrent operations
 */
export function transformOperation(
  operation: WhiteboardOperation,
  againstOperations: WhiteboardOperation[],
  context: TransformContext
): WhiteboardOperation {
  let transformedOp = { ...operation };

  for (const concurrentOp of againstOperations) {
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
 * Transform operations on the same element
 */
function transformSameElementOperations(
  op1: WhiteboardOperation,
  op2: WhiteboardOperation,
  context: TransformContext
): WhiteboardOperation {
  // Create vs Create: Keep the earlier one (by timestamp or user priority)
  if (op1.type === 'create' && op2.type === 'create') {
    // This shouldn't happen if IDs are unique, but if it does, prefer the earlier operation
    return new Date(op1.timestamp) <= new Date(op2.timestamp) ? op1 : op2;
  }

  // Delete vs any other operation: Delete wins
  if (op2.type === 'delete') {
    return {
      ...op1,
      type: 'delete', // Transform to delete
      data: null,
    };
  }

  if (op1.type === 'delete') {
    return op1; // Delete already wins
  }

  // Update vs Update: Merge changes
  if (op1.type === 'update' && op2.type === 'update') {
    return mergeUpdateOperations(op1, op2);
  }

  // Move vs Move: Take the later timestamp
  if (op1.type === 'move' && op2.type === 'move') {
    return new Date(op1.timestamp) >= new Date(op2.timestamp) ? op1 : op2;
  }

  // Style vs Style: Merge style properties
  if (op1.type === 'style' && op2.type === 'style') {
    return {
      ...op1,
      style: {
        ...op2.style,
        ...op1.style, // op1's changes take precedence
      },
    };
  }

  // Move vs Style: Combine both
  if ((op1.type === 'move' && op2.type === 'style') || 
      (op1.type === 'style' && op2.type === 'move')) {
    const moveOp = op1.type === 'move' ? op1 : op2;
    const styleOp = op1.type === 'style' ? op1 : op2;
    
    return {
      ...op1,
      type: 'update',
      position: moveOp.position,
      style: styleOp.style,
    };
  }

  // Default: Return the operation with later timestamp
  return new Date(op1.timestamp) >= new Date(op2.timestamp) ? op1 : op2;
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
 * Calculate operation priority for conflict resolution
 */
export function getOperationPriority(operation: WhiteboardOperation): number {
  // Higher numbers = higher priority
  switch (operation.type) {
    case 'delete': return 100;
    case 'create': return 90;
    case 'update': return 80;
    case 'move': return 70;
    case 'style': return 60;
    case 'reorder': return 50;
    default: return 0;
  }
}