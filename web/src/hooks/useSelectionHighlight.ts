/**
 * useSelectionHighlight Hook
 * 
 * Manages visual selection highlighting with performance optimizations,
 * viewport culling, and smooth animations for collaborative whiteboard editing.
 */

'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { SelectionHighlightData, SelectionConflictData, SelectionOwnership } from '@/components/whiteboard/SelectionHighlight';

export interface HighlightConfig {
  /** Performance mode affects animation and rendering quality */
  performanceMode: 'high' | 'balanced' | 'low';
  
  /** Maximum number of highlights to render simultaneously */
  maxHighlights: number;
  
  /** Enable viewport-based culling for performance */
  enableViewportCulling: boolean;
  
  /** Animation settings */
  animationEnabled: boolean;
  animationDuration: number; // in milliseconds
  
  /** Highlight appearance */
  defaultOpacity: number;
  conflictOpacity: number;
  currentUserOpacity: number;
  
  /** Throttling for highlight updates */
  updateThrottleMs: number;
  
  /** Debug mode */
  debug: boolean;
}

export interface ViewportBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CanvasTransform {
  x: number;
  y: number;
  zoom: number;
}

export interface ElementBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface HighlightMetrics {
  totalHighlights: number;
  visibleHighlights: number;
  culledHighlights: number;
  animatingHighlights: number;
  renderTime: number;
  updateFrequency: number;
}

export interface UseSelectionHighlightOptions {
  config: HighlightConfig;
  viewport: ViewportBounds;
  canvasTransform: CanvasTransform;
  currentUserId: string;
  getElementBounds: (elementId: string) => ElementBounds | null;
  onHighlightClick?: (highlight: SelectionHighlightData) => void;
  onConflictResolve?: (conflictId: string, resolution: 'ownership' | 'shared' | 'cancel') => void;
}

/**
 * Throttle hook for performance optimization
 */
const useThrottle = <T>(value: T, delay: number): T => {
  const [throttledValue, setThrottledValue] = useState(value);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      setThrottledValue(value);
    }, delay);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [value, delay]);

  return throttledValue;
};

/**
 * Viewport culling calculator
 */
const useViewportCulling = (
  highlights: SelectionHighlightData[],
  viewport: ViewportBounds,
  canvasTransform: CanvasTransform,
  getElementBounds: (elementId: string) => ElementBounds | null,
  enabled: boolean
) => {
  return useMemo(() => {
    if (!enabled) {
      return {
        visibleHighlights: highlights,
        culledHighlights: [],
        visibilityMap: new Map(highlights.map(h => [h.userId, true])),
      };
    }

    const visibleHighlights: SelectionHighlightData[] = [];
    const culledHighlights: SelectionHighlightData[] = [];
    const visibilityMap = new Map<string, boolean>();

    const buffer = 100; // Buffer zone for smooth transitions
    const expandedViewport = {
      x: viewport.x - buffer,
      y: viewport.y - buffer,
      width: viewport.width + buffer * 2,
      height: viewport.height + buffer * 2,
    };

    for (const highlight of highlights) {
      let isVisible = false;

      // Check if any element in the highlight is visible
      for (const elementId of highlight.elementIds) {
        const bounds = getElementBounds(elementId);
        if (!bounds) continue;

        // Convert to screen coordinates
        const screenBounds = {
          x: (bounds.x + canvasTransform.x) * canvasTransform.zoom,
          y: (bounds.y + canvasTransform.y) * canvasTransform.zoom,
          width: bounds.width * canvasTransform.zoom,
          height: bounds.height * canvasTransform.zoom,
        };

        // Check intersection with expanded viewport
        if (
          screenBounds.x < expandedViewport.x + expandedViewport.width &&
          screenBounds.x + screenBounds.width > expandedViewport.x &&
          screenBounds.y < expandedViewport.y + expandedViewport.height &&
          screenBounds.y + screenBounds.height > expandedViewport.y
        ) {
          isVisible = true;
          break;
        }
      }

      if (isVisible) {
        visibleHighlights.push(highlight);
      } else {
        culledHighlights.push(highlight);
      }

      visibilityMap.set(highlight.userId, isVisible);
    }

    return {
      visibleHighlights,
      culledHighlights,
      visibilityMap,
    };
  }, [highlights, viewport, canvasTransform, getElementBounds, enabled]);
};

/**
 * Performance monitoring
 */
const usePerformanceMonitoring = (
  highlights: SelectionHighlightData[],
  visibleCount: number,
  culledCount: number
) => {
  const [metrics, setMetrics] = useState<HighlightMetrics>({
    totalHighlights: 0,
    visibleHighlights: 0,
    culledHighlights: 0,
    animatingHighlights: 0,
    renderTime: 0,
    updateFrequency: 0,
  });

  const lastUpdateRef = useRef<number>(Date.now());
  const updateCountRef = useRef<number>(0);
  const renderStartRef = useRef<number>(0);

  useEffect(() => {
    renderStartRef.current = performance.now();
  });

  useEffect(() => {
    const now = Date.now();
    const timeSinceLastUpdate = now - lastUpdateRef.current;
    updateCountRef.current += 1;

    const animatingHighlights = highlights.filter(h => h.animation !== 'none').length;
    const renderTime = performance.now() - renderStartRef.current;

    setMetrics({
      totalHighlights: highlights.length,
      visibleHighlights: visibleCount,
      culledHighlights: culledCount,
      animatingHighlights,
      renderTime,
      updateFrequency: timeSinceLastUpdate > 0 ? 1000 / timeSinceLastUpdate : 0,
    });

    lastUpdateRef.current = now;
  }, [highlights, visibleCount, culledCount]);

  return metrics;
};

/**
 * Highlight optimization based on performance mode
 */
const useHighlightOptimization = (
  highlights: SelectionHighlightData[],
  config: HighlightConfig,
  currentUserId: string,
  conflicts: SelectionConflictData[]
) => {
  return useMemo(() => {
    return highlights.map((highlight): SelectionHighlightData => {
      const isCurrentUser = highlight.userId === currentUserId;
      const hasConflicts = conflicts.some(conflict =>
        highlight.elementIds.includes(conflict.elementId)
      );

      // Adjust properties based on performance mode and state
      let opacity = config.defaultOpacity;
      let animation: 'none' | 'pulse' | 'glow' = 'none';
      let style: 'solid' | 'dashed' | 'dotted' = 'solid';

      // Current user gets higher opacity
      if (isCurrentUser) {
        opacity = config.currentUserOpacity;
      }

      // Conflicts get special treatment
      if (hasConflicts) {
        opacity = config.conflictOpacity;
        style = 'dashed';
        
        // Only animate conflicts in high performance mode
        if (config.performanceMode === 'high' && config.animationEnabled) {
          animation = 'pulse';
        }
      }

      // Disable animations in low performance mode
      if (config.performanceMode === 'low' || !config.animationEnabled) {
        animation = 'none';
      }

      // Simplify style in low performance mode
      if (config.performanceMode === 'low' && !hasConflicts) {
        style = 'solid';
      }

      return {
        ...highlight,
        opacity,
        style,
        animation,
      };
    });
  }, [highlights, config, currentUserId, conflicts]);
};

/**
 * Main selection highlight hook
 */
export const useSelectionHighlight = (
  rawHighlights: SelectionHighlightData[],
  conflicts: SelectionConflictData[],
  ownerships: SelectionOwnership[],
  options: UseSelectionHighlightOptions
) => {
  const {
    config,
    viewport,
    canvasTransform,
    currentUserId,
    getElementBounds,
    onHighlightClick,
    onConflictResolve,
  } = options;

  // Throttle highlight updates for performance
  const throttledHighlights = useThrottle(rawHighlights, config.updateThrottleMs);

  // Optimize highlights based on performance settings
  const optimizedHighlights = useHighlightOptimization(
    throttledHighlights,
    config,
    currentUserId,
    conflicts
  );

  // Apply viewport culling
  const { visibleHighlights, culledHighlights, visibilityMap } = useViewportCulling(
    optimizedHighlights,
    viewport,
    canvasTransform,
    getElementBounds,
    config.enableViewportCulling
  );

  // Apply maximum highlight limit
  const limitedHighlights = useMemo(() => {
    // Always prioritize current user's highlights
    const currentUserHighlights = visibleHighlights.filter(h => h.userId === currentUserId);
    const otherHighlights = visibleHighlights.filter(h => h.userId !== currentUserId);

    // Sort other highlights by timestamp (most recent first)
    const sortedOtherHighlights = otherHighlights
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, Math.max(0, config.maxHighlights - currentUserHighlights.length));

    return [...currentUserHighlights, ...sortedOtherHighlights];
  }, [visibleHighlights, currentUserId, config.maxHighlights]);

  // Performance monitoring
  const metrics = usePerformanceMonitoring(
    throttledHighlights,
    limitedHighlights.length,
    culledHighlights.length
  );

  // Debug logging
  const debug = useCallback((...args: any[]) => {
    if (config.debug) {
      console.log('[SelectionHighlight]', ...args);
    }
  }, [config.debug]);

  // Log performance metrics in debug mode
  useEffect(() => {
    if (config.debug && metrics.totalHighlights > 0) {
      debug('Performance metrics:', metrics);
    }
  }, [metrics, config.debug, debug]);

  // Handle highlight click with conflict detection
  const handleHighlightClick = useCallback((highlight: SelectionHighlightData) => {
    debug('Highlight clicked:', highlight);
    
    // Check for conflicts on clicked elements
    const relevantConflicts = conflicts.filter(conflict =>
      highlight.elementIds.includes(conflict.elementId)
    );

    if (relevantConflicts.length > 0) {
      debug('Highlight has conflicts:', relevantConflicts);
      // Could trigger conflict resolution UI here
    }

    if (onHighlightClick) {
      onHighlightClick(highlight);
    }
  }, [conflicts, onHighlightClick, debug]);

  // Handle conflict resolution
  const handleConflictResolve = useCallback((
    conflictId: string,
    resolution: 'ownership' | 'shared' | 'cancel'
  ) => {
    debug('Resolving conflict:', { conflictId, resolution });
    
    if (onConflictResolve) {
      onConflictResolve(conflictId, resolution);
    }
  }, [onConflictResolve, debug]);

  // Check if a specific highlight is visible
  const isHighlightVisible = useCallback((userId: string): boolean => {
    return visibilityMap.get(userId) || false;
  }, [visibilityMap]);

  // Get highlight for specific user
  const getHighlightForUser = useCallback((userId: string): SelectionHighlightData | null => {
    return limitedHighlights.find(h => h.userId === userId) || null;
  }, [limitedHighlights]);

  // Get conflicts for specific highlight
  const getHighlightConflicts = useCallback((highlight: SelectionHighlightData): SelectionConflictData[] => {
    return conflicts.filter(conflict =>
      highlight.elementIds.includes(conflict.elementId)
    );
  }, [conflicts]);

  // Get ownerships for specific highlight
  const getHighlightOwnerships = useCallback((highlight: SelectionHighlightData): SelectionOwnership[] => {
    return ownerships.filter(ownership =>
      highlight.elementIds.includes(ownership.elementId)
    );
  }, [ownerships]);

  return {
    // Processed highlights
    highlights: limitedHighlights,
    visibleHighlights: limitedHighlights,
    culledHighlights,
    
    // Conflict and ownership data
    conflicts,
    ownerships,
    
    // Visibility utilities
    isHighlightVisible,
    getHighlightForUser,
    getHighlightConflicts,
    getHighlightOwnerships,
    
    // Event handlers
    onHighlightClick: handleHighlightClick,
    onConflictResolve: handleConflictResolve,
    
    // Performance metrics
    metrics,
    
    // Canvas utilities (passed through)
    canvasTransform,
    viewport,
    getElementBounds,
  };
};

export default useSelectionHighlight;