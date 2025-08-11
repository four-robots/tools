/**
 * Whiteboard Presence Utilities
 * 
 * Utilities for managing user presence, cursors, and awareness in collaborative whiteboards.
 */

import { WhiteboardPresence } from './collaboration-events';

// ==================== PRESENCE MANAGEMENT ====================

/**
 * Calculate cursor position relative to canvas
 */
export function calculateCanvasCursorPosition(
  clientX: number,
  clientY: number,
  canvasElement: HTMLElement,
  viewport: { x: number; y: number; zoom: number }
): { x: number; y: number } {
  const rect = canvasElement.getBoundingClientRect();
  
  // Convert client coordinates to canvas coordinates
  const canvasX = (clientX - rect.left) / viewport.zoom + viewport.x;
  const canvasY = (clientY - rect.top) / viewport.zoom + viewport.y;
  
  return { x: canvasX, y: canvasY };
}

/**
 * Calculate client position from canvas coordinates
 */
export function calculateClientCursorPosition(
  canvasX: number,
  canvasY: number,
  canvasElement: HTMLElement,
  viewport: { x: number; y: number; zoom: number }
): { x: number; y: number } {
  const rect = canvasElement.getBoundingClientRect();
  
  // Convert canvas coordinates to client coordinates
  const clientX = (canvasX - viewport.x) * viewport.zoom + rect.left;
  const clientY = (canvasY - viewport.y) * viewport.zoom + rect.top;
  
  return { x: clientX, y: clientY };
}

/**
 * Check if cursor is within canvas bounds
 */
export function isCursorInCanvas(
  cursor: { x: number; y: number },
  canvasBounds: { x: number; y: number; width: number; height: number }
): boolean {
  return (
    cursor.x >= canvasBounds.x &&
    cursor.x <= canvasBounds.x + canvasBounds.width &&
    cursor.y >= canvasBounds.y &&
    cursor.y <= canvasBounds.y + canvasBounds.height
  );
}

/**
 * Debounce presence updates to reduce network traffic
 */
export function createPresenceDebouncer(
  callback: (presence: Partial<WhiteboardPresence>) => void,
  delay: number = 50
) {
  let timeoutId: NodeJS.Timeout | null = null;
  let pendingUpdate: Partial<WhiteboardPresence> = {};
  
  return (update: Partial<WhiteboardPresence>) => {
    // Merge with pending updates
    pendingUpdate = { ...pendingUpdate, ...update };
    
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    
    timeoutId = setTimeout(() => {
      callback(pendingUpdate);
      pendingUpdate = {};
      timeoutId = null;
    }, delay);
  };
}

/**
 * Calculate distance between two cursors
 */
export function calculateCursorDistance(
  cursor1: { x: number; y: number },
  cursor2: { x: number; y: number }
): number {
  return Math.sqrt(
    Math.pow(cursor2.x - cursor1.x, 2) + Math.pow(cursor2.y - cursor1.y, 2)
  );
}

// ==================== USER COLORS ====================

const PRESENCE_COLORS = [
  '#FF6B6B', // Red
  '#4ECDC4', // Teal
  '#45B7D1', // Blue
  '#96CEB4', // Green
  '#FFEAA7', // Yellow
  '#DDA0DD', // Plum
  '#FFB347', // Orange
  '#87CEEB', // Sky Blue
  '#98FB98', // Pale Green
  '#F0E68C', // Khaki
  '#FFB6C1', // Light Pink
  '#20B2AA', // Light Sea Green
];

/**
 * Generate consistent color for a user
 */
export function getUserColor(userId: string): string {
  // Use a simple hash function to get consistent color per user
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    const char = userId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  const index = Math.abs(hash) % PRESENCE_COLORS.length;
  return PRESENCE_COLORS[index];
}

/**
 * Generate contrasting color for cursor text
 */
export function getContrastingTextColor(backgroundColor: string): string {
  // Remove # if present
  const hex = backgroundColor.replace('#', '');
  
  // Convert to RGB
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  
  // Calculate luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  
  return luminance > 0.5 ? '#000000' : '#FFFFFF';
}

// ==================== VIEWPORT UTILITIES ====================

/**
 * Check if two viewports overlap
 */
export function viewportsOverlap(
  viewport1: { x: number; y: number; width: number; height: number },
  viewport2: { x: number; y: number; width: number; height: number }
): boolean {
  return !(
    viewport1.x + viewport1.width < viewport2.x ||
    viewport2.x + viewport2.width < viewport1.x ||
    viewport1.y + viewport1.height < viewport2.y ||
    viewport2.y + viewport2.height < viewport1.y
  );
}

/**
 * Calculate viewport intersection area
 */
export function calculateViewportIntersection(
  viewport1: { x: number; y: number; width: number; height: number },
  viewport2: { x: number; y: number; width: number; height: number }
): { x: number; y: number; width: number; height: number } | null {
  const left = Math.max(viewport1.x, viewport2.x);
  const right = Math.min(viewport1.x + viewport1.width, viewport2.x + viewport2.width);
  const top = Math.max(viewport1.y, viewport2.y);
  const bottom = Math.min(viewport1.y + viewport1.height, viewport2.y + viewport2.height);
  
  if (left >= right || top >= bottom) {
    return null; // No intersection
  }
  
  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
}

/**
 * Check if point is within viewport
 */
export function isPointInViewport(
  point: { x: number; y: number },
  viewport: { x: number; y: number; width: number; height: number }
): boolean {
  return (
    point.x >= viewport.x &&
    point.x <= viewport.x + viewport.width &&
    point.y >= viewport.y &&
    point.y <= viewport.y + viewport.height
  );
}

// ==================== SELECTION UTILITIES ====================

/**
 * Check if two selection sets overlap
 */
export function selectionsOverlap(selection1: string[], selection2: string[]): boolean {
  return selection1.some(id => selection2.includes(id));
}

/**
 * Get common selected elements
 */
export function getCommonSelection(selection1: string[], selection2: string[]): string[] {
  return selection1.filter(id => selection2.includes(id));
}

/**
 * Check if element is selected by any user
 */
export function isElementSelected(elementId: string, presences: WhiteboardPresence[]): boolean {
  return presences.some(presence => presence.selection.includes(elementId));
}

/**
 * Get users who have selected an element
 */
export function getUsersWithElement(elementId: string, presences: WhiteboardPresence[]): WhiteboardPresence[] {
  return presences.filter(presence => presence.selection.includes(elementId));
}

// ==================== ANIMATION UTILITIES ====================

/**
 * Create smooth cursor animation
 */
export function createCursorAnimation(
  fromPosition: { x: number; y: number },
  toPosition: { x: number; y: number },
  duration: number = 200,
  onUpdate: (position: { x: number; y: number }) => void,
  onComplete?: () => void
): () => void {
  const startTime = Date.now();
  const deltaX = toPosition.x - fromPosition.x;
  const deltaY = toPosition.y - fromPosition.y;
  
  let animationId: number;
  
  const animate = () => {
    const elapsed = Date.now() - startTime;
    const progress = Math.min(elapsed / duration, 1);
    
    // Easing function (ease-out cubic)
    const easeProgress = 1 - Math.pow(1 - progress, 3);
    
    const currentPosition = {
      x: fromPosition.x + deltaX * easeProgress,
      y: fromPosition.y + deltaY * easeProgress,
    };
    
    onUpdate(currentPosition);
    
    if (progress < 1) {
      animationId = requestAnimationFrame(animate);
    } else if (onComplete) {
      onComplete();
    }
  };
  
  animationId = requestAnimationFrame(animate);
  
  // Return cancel function
  return () => {
    if (animationId) {
      cancelAnimationFrame(animationId);
    }
  };
}

// ==================== PRESENCE FILTERING ====================

/**
 * Filter out stale presence data
 */
export function filterStalePresences(
  presences: WhiteboardPresence[],
  maxAgeMs: number = 30000 // 30 seconds
): WhiteboardPresence[] {
  const now = Date.now();
  
  return presences.filter(presence => {
    const presenceTime = new Date(presence.timestamp).getTime();
    return now - presenceTime <= maxAgeMs;
  });
}

/**
 * Group presences by proximity
 */
export function groupPresencesByProximity(
  presences: WhiteboardPresence[],
  proximityThreshold: number = 100
): WhiteboardPresence[][] {
  const groups: WhiteboardPresence[][] = [];
  const processed = new Set<string>();
  
  for (const presence of presences) {
    if (processed.has(presence.userId)) continue;
    
    const group = [presence];
    processed.add(presence.userId);
    
    // Find nearby presences
    for (const other of presences) {
      if (processed.has(other.userId)) continue;
      
      const distance = calculateCursorDistance(presence.cursor, other.cursor);
      if (distance <= proximityThreshold) {
        group.push(other);
        processed.add(other.userId);
      }
    }
    
    groups.push(group);
  }
  
  return groups;
}

// ==================== ACCESSIBILITY ====================

/**
 * Generate accessible cursor label
 */
export function generateCursorLabel(presence: WhiteboardPresence): string {
  const { userName, selection } = presence;
  
  if (selection.length === 0) {
    return `${userName} is viewing the canvas`;
  } else if (selection.length === 1) {
    return `${userName} has selected 1 element`;
  } else {
    return `${userName} has selected ${selection.length} elements`;
  }
}

/**
 * Generate high contrast cursor style for accessibility
 */
export function getAccessibleCursorStyle(
  baseColor: string,
  highContrast: boolean = false
): {
  backgroundColor: string;
  borderColor: string;
  textColor: string;
} {
  if (!highContrast) {
    return {
      backgroundColor: baseColor,
      borderColor: 'rgba(255, 255, 255, 0.8)',
      textColor: getContrastingTextColor(baseColor),
    };
  }
  
  // High contrast mode
  return {
    backgroundColor: '#000000',
    borderColor: '#FFFFFF',
    textColor: '#FFFFFF',
  };
}