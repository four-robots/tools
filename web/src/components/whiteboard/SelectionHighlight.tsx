/**
 * SelectionHighlight Component
 * 
 * Renders visual selection highlights for multi-user collaborative editing.
 * Provides user-specific color highlighting with smooth animations and conflict indicators.
 */

'use client';

import React, { useMemo, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import countdownManager from './utils/countdown-manager';
import boundsCache from './utils/bounds-cache';

export interface SelectionHighlightData {
  userId: string;
  userName: string;
  userColor: string;
  elementIds: string[];
  bounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  timestamp: number;
  opacity: number;
  style: 'solid' | 'dashed' | 'dotted';
  animation: 'none' | 'pulse' | 'glow';
}

export interface SelectionConflictData {
  conflictId: string;
  elementId: string;
  conflictingUsers: {
    userId: string;
    userName: string;
    priority: number;
    timestamp: number;
  }[];
  resolution: 'ownership' | 'shared' | 'timeout' | 'manual';
}

export interface SelectionOwnership {
  elementId: string;
  ownerId: string;
  ownerName: string;
  ownerColor: string;
  acquiredAt: number;
  expiresAt: number;
  isLocked: boolean;
  lockReason?: 'editing' | 'moving' | 'styling' | 'manual';
}

interface SelectionHighlightProps {
  /** Selection highlight data */
  highlight: SelectionHighlightData;
  
  /** Current conflicts affecting this selection */
  conflicts?: SelectionConflictData[];
  
  /** Element ownership data */
  ownerships?: SelectionOwnership[];
  
  /** Canvas transform for coordinate conversion */
  canvasTransform: {
    x: number;
    y: number;
    zoom: number;
  };
  
  /** Whether this selection is from the current user */
  isCurrentUser: boolean;
  
  /** Callback for getting element bounds */
  getElementBounds: (elementId: string) => { x: number; y: number; width: number; height: number } | null;
  
  /** Callback when user clicks on selection highlight */
  onSelectionClick?: (highlight: SelectionHighlightData) => void;
  
  /** Callback when conflict resolution is requested */
  onConflictResolve?: (conflictId: string, resolution: 'ownership' | 'shared' | 'cancel') => void;
  
  /** Performance optimization: only render if visible */
  isVisible?: boolean;
}

/**
 * Individual element highlight component
 */
const ElementHighlight: React.FC<{
  elementId: string;
  userColor: string;
  opacity: number;
  style: 'solid' | 'dashed' | 'dotted';
  animation: 'none' | 'pulse' | 'glow';
  bounds: { x: number; y: number; width: number; height: number };
  canvasTransform: { x: number; y: number; zoom: number };
  hasConflict: boolean;
  isOwned: boolean;
  isLocked: boolean;
  onClick?: () => void;
}> = ({
  elementId,
  userColor,
  opacity,
  style,
  animation,
  bounds,
  canvasTransform,
  hasConflict,
  isOwned,
  isLocked,
  onClick,
}) => {
  // Convert element bounds to screen coordinates
  const screenBounds = useMemo(() => ({
    x: (bounds.x + canvasTransform.x) * canvasTransform.zoom,
    y: (bounds.y + canvasTransform.y) * canvasTransform.zoom,
    width: bounds.width * canvasTransform.zoom,
    height: bounds.height * canvasTransform.zoom,
  }), [bounds, canvasTransform]);

  // Calculate stroke properties
  const strokeWidth = useMemo(() => {
    const baseWidth = hasConflict ? 3 : 2;
    return Math.max(1, baseWidth / canvasTransform.zoom);
  }, [hasConflict, canvasTransform.zoom]);

  const strokeDashArray = useMemo(() => {
    if (style === 'dashed') return hasConflict ? '8 4' : '6 3';
    if (style === 'dotted') return hasConflict ? '2 2' : '1 2';
    return undefined;
  }, [style, hasConflict]);

  // Animation variants
  const animationVariants = useMemo(() => ({
    pulse: {
      opacity: [opacity, opacity * 0.5, opacity],
      transition: {
        duration: 1.5,
        repeat: Infinity,
        ease: 'easeInOut',
      },
    },
    glow: {
      filter: [
        'drop-shadow(0 0 4px currentColor)',
        'drop-shadow(0 0 8px currentColor)',
        'drop-shadow(0 0 4px currentColor)',
      ],
      transition: {
        duration: 2,
        repeat: Infinity,
        ease: 'easeInOut',
      },
    },
    none: {
      opacity,
    },
  }), [opacity]);

  return (
    <motion.rect
      key={elementId}
      x={screenBounds.x}
      y={screenBounds.y}
      width={screenBounds.width}
      height={screenBounds.height}
      fill="none"
      stroke={userColor}
      strokeWidth={strokeWidth}
      strokeDasharray={strokeDashArray}
      opacity={opacity}
      animate={animationVariants[animation] || animationVariants.none}
      style={{
        pointerEvents: onClick ? 'all' : 'none',
        cursor: onClick ? 'pointer' : 'default',
      }}
      onClick={onClick}
      className={`
        selection-highlight
        ${hasConflict ? 'selection-conflict' : ''}
        ${isOwned ? 'selection-owned' : ''}
        ${isLocked ? 'selection-locked' : ''}
      `}
    />
  );
};

/**
 * Conflict indicator component
 */
const ConflictIndicator: React.FC<{
  conflict: SelectionConflictData;
  bounds: { x: number; y: number; width: number; height: number };
  canvasTransform: { x: number; y: number; zoom: number };
  onResolve: (resolution: 'ownership' | 'shared' | 'cancel') => void;
}> = ({ conflict, bounds, canvasTransform, onResolve }) => {
  const [showOptions, setShowOptions] = React.useState(false);
  const indicatorRef = useRef<HTMLDivElement>(null);

  // Position indicator at top-right of bounds
  const indicatorPosition = useMemo(() => ({
    x: (bounds.x + bounds.width + canvasTransform.x) * canvasTransform.zoom,
    y: (bounds.y + canvasTransform.y) * canvasTransform.zoom,
  }), [bounds, canvasTransform]);

  // Close options when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (indicatorRef.current && !indicatorRef.current.contains(event.target as Node)) {
        setShowOptions(false);
      }
    };

    if (showOptions) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showOptions]);

  return (
    <div
      ref={indicatorRef}
      className="absolute z-50"
      style={{
        left: indicatorPosition.x,
        top: indicatorPosition.y,
        transform: 'translate(-100%, -100%)',
      }}
    >
      {/* Conflict Warning Icon */}
      <motion.button
        className="w-6 h-6 bg-yellow-500 text-white rounded-full flex items-center justify-center text-xs font-bold shadow-lg hover:bg-yellow-600 transition-colors"
        onClick={() => setShowOptions(!showOptions)}
        title={`Selection conflict: ${conflict.conflictingUsers.length} users`}
        animate={{
          scale: [1, 1.1, 1],
          transition: {
            duration: 1,
            repeat: Infinity,
            ease: 'easeInOut',
          },
        }}
      >
        ⚠
      </motion.button>

      {/* Resolution Options */}
      <AnimatePresence>
        {showOptions && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: -10 }}
            className="absolute bottom-full mb-2 right-0 bg-white rounded-lg shadow-xl p-3 min-w-48 border"
          >
            <div className="text-sm font-medium text-gray-900 mb-2">
              Selection Conflict
            </div>
            <div className="text-xs text-gray-600 mb-3">
              {conflict.conflictingUsers.length} users selected this element
            </div>
            
            <div className="space-y-1">
              {conflict.conflictingUsers.map((user) => (
                <div key={user.userId} className="text-xs text-gray-700 flex items-center">
                  <div
                    className="w-3 h-3 rounded-full mr-2"
                    style={{ backgroundColor: '#4F46E5' }}
                  />
                  {user.userName}
                </div>
              ))}
            </div>

            <div className="flex gap-2 mt-3 pt-2 border-t">
              <button
                className="px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                onClick={() => {
                  onResolve('ownership');
                  setShowOptions(false);
                }}
              >
                Take Control
              </button>
              <button
                className="px-2 py-1 text-xs bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
                onClick={() => {
                  onResolve('shared');
                  setShowOptions(false);
                }}
              >
                Share
              </button>
              <button
                className="px-2 py-1 text-xs bg-gray-300 text-gray-700 rounded hover:bg-gray-400 transition-colors"
                onClick={() => {
                  onResolve('cancel');
                  setShowOptions(false);
                }}
              >
                Cancel
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

/**
 * Ownership indicator component
 */
const OwnershipIndicator: React.FC<{
  ownership: SelectionOwnership;
  bounds: { x: number; y: number; width: number; height: number };
  canvasTransform: { x: number; y: number; zoom: number };
}> = ({ ownership, bounds, canvasTransform }) => {
  const indicatorPosition = useMemo(() => ({
    x: (bounds.x + canvasTransform.x) * canvasTransform.zoom,
    y: (bounds.y + canvasTransform.y) * canvasTransform.zoom,
  }), [bounds, canvasTransform]);

  const [countdown, setCountdown] = React.useState(() => {
    const remaining = ownership.expiresAt - Date.now();
    return Math.max(0, Math.floor(remaining / 1000));
  });

  // Use global countdown manager to prevent memory leaks
  useEffect(() => {
    const countdownId = `ownership-${ownership.elementId}-${ownership.ownerId}`;
    
    const success = countdownManager.register({
      id: countdownId,
      expiresAt: ownership.expiresAt,
      callback: (remaining) => setCountdown(remaining),
      onExpired: () => setCountdown(0),
    });

    if (!success) {
      console.warn('[OwnershipIndicator] Failed to register countdown, using fallback');
      // Fallback to local countdown if manager is at capacity
      const updateCountdown = () => {
        const remaining = Math.max(0, Math.floor((ownership.expiresAt - Date.now()) / 1000));
        setCountdown(remaining);
        if (remaining > 0) {
          setTimeout(updateCountdown, 1000);
        }
      };
      updateCountdown();
    }

    return () => {
      countdownManager.unregister(countdownId);
    };
  }, [ownership.elementId, ownership.ownerId, ownership.expiresAt]);

  // Update countdown manager if expiration changes
  useEffect(() => {
    const countdownId = `ownership-${ownership.elementId}-${ownership.ownerId}`;
    countdownManager.update(countdownId, ownership.expiresAt);
  }, [ownership.elementId, ownership.ownerId, ownership.expiresAt]);

  if (countdown <= 0) return null;

  return (
    <div
      className="absolute z-40 pointer-events-none"
      style={{
        left: indicatorPosition.x,
        top: indicatorPosition.y,
        transform: 'translate(0, -100%)',
      }}
    >
      <div
        className="px-2 py-1 rounded-full text-xs text-white font-medium shadow-sm"
        style={{ backgroundColor: ownership.ownerColor }}
        title={`Owned by ${ownership.ownerName}${ownership.isLocked ? ' (locked)' : ''}`}
      >
        <div className="flex items-center gap-1">
          <span>{ownership.ownerName}</span>
          {ownership.isLocked && <span>🔒</span>}
          <span className="text-xs opacity-75">
            {countdown}s
          </span>
        </div>
      </div>
    </div>
  );
};

/**
 * User label component for selections
 */
const UserLabel: React.FC<{
  userName: string;
  userColor: string;
  bounds: { x: number; y: number; width: number; height: number };
  canvasTransform: { x: number; y: number; zoom: number };
  isCurrentUser: boolean;
}> = ({ userName, userColor, bounds, canvasTransform, isCurrentUser }) => {
  const labelPosition = useMemo(() => ({
    x: (bounds.x + canvasTransform.x) * canvasTransform.zoom,
    y: (bounds.y + canvasTransform.y) * canvasTransform.zoom,
  }), [bounds, canvasTransform]);

  if (isCurrentUser) return null; // Don't show label for current user's selection

  return (
    <div
      className="absolute z-30 pointer-events-none"
      style={{
        left: labelPosition.x,
        top: labelPosition.y,
        transform: 'translate(0, calc(-100% - 4px))',
      }}
    >
      <div
        className="px-2 py-1 rounded text-xs text-white font-medium shadow-sm whitespace-nowrap"
        style={{ backgroundColor: userColor }}
      >
        {userName}
      </div>
    </div>
  );
};

/**
 * Main selection highlight component
 */
export const SelectionHighlight: React.FC<SelectionHighlightProps> = ({
  highlight,
  conflicts = [],
  ownerships = [],
  canvasTransform,
  isCurrentUser,
  getElementBounds,
  onSelectionClick,
  onConflictResolve,
  isVisible = true,
}) => {
  // Performance optimization: don't render if not visible
  if (!isVisible || highlight.elementIds.length === 0) {
    return null;
  }

  // Calculate combined bounds for all selected elements using cache
  const combinedBounds = useMemo(() => {
    if (highlight.bounds) {
      return highlight.bounds;
    }

    // Use bounds cache to prevent O(n²) performance issues
    return boundsCache.getCombined(
      highlight.elementIds,
      getElementBounds,
      false // Don't force refresh unless needed
    ) || { x: 0, y: 0, width: 0, height: 0 };
  }, [highlight.bounds, highlight.elementIds, getElementBounds]);

  // Get conflicts affecting this selection
  const relevantConflicts = useMemo(() => {
    return conflicts.filter(conflict =>
      highlight.elementIds.includes(conflict.elementId)
    );
  }, [conflicts, highlight.elementIds]);

  // Get ownerships for selected elements
  const relevantOwnerships = useMemo(() => {
    return ownerships.filter(ownership =>
      highlight.elementIds.includes(ownership.elementId)
    );
  }, [ownerships, highlight.elementIds]);

  // Handle selection click
  const handleSelectionClick = useCallback(() => {
    if (onSelectionClick) {
      onSelectionClick(highlight);
    }
  }, [highlight, onSelectionClick]);

  // Handle conflict resolution
  const handleConflictResolve = useCallback((conflictId: string, resolution: 'ownership' | 'shared' | 'cancel') => {
    if (onConflictResolve) {
      onConflictResolve(conflictId, resolution);
    }
  }, [onConflictResolve]);

  return (
    <motion.div
      className="absolute inset-0 pointer-events-none"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      {/* SVG overlay for selection highlights */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ overflow: 'visible' }}
      >
        {highlight.elementIds.map((elementId) => {
          const bounds = boundsCache.get(elementId, () => getElementBounds(elementId));
          if (!bounds) return null;

          const hasConflict = relevantConflicts.some(c => c.elementId === elementId);
          const ownership = relevantOwnerships.find(o => o.elementId === elementId);
          const isOwned = !!ownership;
          const isLocked = ownership?.isLocked || false;

          return (
            <ElementHighlight
              key={elementId}
              elementId={elementId}
              userColor={highlight.userColor}
              opacity={highlight.opacity}
              style={highlight.style}
              animation={highlight.animation}
              bounds={bounds}
              canvasTransform={canvasTransform}
              hasConflict={hasConflict}
              isOwned={isOwned}
              isLocked={isLocked}
              onClick={onSelectionClick ? handleSelectionClick : undefined}
            />
          );
        })}
      </svg>

      {/* User label */}
      {combinedBounds.width > 0 && combinedBounds.height > 0 && (
        <UserLabel
          userName={highlight.userName}
          userColor={highlight.userColor}
          bounds={combinedBounds}
          canvasTransform={canvasTransform}
          isCurrentUser={isCurrentUser}
        />
      )}

      {/* Conflict indicators */}
      {relevantConflicts.map((conflict) => {
        const bounds = boundsCache.get(conflict.elementId, () => getElementBounds(conflict.elementId));
        if (!bounds) return null;

        return (
          <ConflictIndicator
            key={conflict.conflictId}
            conflict={conflict}
            bounds={bounds}
            canvasTransform={canvasTransform}
            onResolve={(resolution) => handleConflictResolve(conflict.conflictId, resolution)}
          />
        );
      })}

      {/* Ownership indicators */}
      {relevantOwnerships.map((ownership) => {
        const bounds = boundsCache.get(ownership.elementId, () => getElementBounds(ownership.elementId));
        if (!bounds) return null;

        return (
          <OwnershipIndicator
            key={ownership.elementId}
            ownership={ownership}
            bounds={bounds}
            canvasTransform={canvasTransform}
          />
        );
      })}
    </motion.div>
  );
};

export default SelectionHighlight;