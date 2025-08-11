'use client';

import React, { useRef, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LiveCursorState } from '@shared/types/whiteboard';

interface WhiteboardCursorProps {
  cursor: LiveCursorState;
  containerRef: React.RefObject<HTMLElement>;
  viewport: {
    x: number;
    y: number;
    zoom: number;
  };
  onAnimationComplete?: () => void;
  showLabel?: boolean;
  fadeOut?: boolean;
}

interface CursorPosition {
  x: number;
  y: number;
}

/**
 * Individual cursor component with smooth animation and interpolation
 */
export const WhiteboardCursor: React.FC<WhiteboardCursorProps> = ({
  cursor,
  containerRef,
  viewport,
  onAnimationComplete,
  showLabel = true,
  fadeOut = false,
}) => {
  const [position, setPosition] = useState<CursorPosition>({ x: 0, y: 0 });
  const [isVisible, setIsVisible] = useState(true);
  const lastUpdateRef = useRef<number>(0);
  const animationFrameRef = useRef<number>();

  // Convert canvas coordinates to screen coordinates
  const canvasToScreen = (canvasX: number, canvasY: number): CursorPosition => {
    if (!containerRef.current) {
      return { x: 0, y: 0 };
    }

    const containerRect = containerRef.current.getBoundingClientRect();
    const x = (canvasX - viewport.x) * viewport.zoom + containerRect.left;
    const y = (canvasY - viewport.y) * viewport.zoom + containerRect.top;

    return { x, y };
  };

  // Check if cursor is within visible viewport
  const isInViewport = (screenPos: CursorPosition): boolean => {
    if (!containerRef.current) return false;
    
    const containerRect = containerRef.current.getBoundingClientRect();
    return (
      screenPos.x >= containerRect.left - 50 &&
      screenPos.x <= containerRect.right + 50 &&
      screenPos.y >= containerRect.top - 50 &&
      screenPos.y <= containerRect.bottom + 50
    );
  };

  // Smooth interpolation between positions
  const interpolatePosition = (
    from: CursorPosition,
    to: CursorPosition,
    progress: number
  ): CursorPosition => {
    return {
      x: from.x + (to.x - from.x) * progress,
      y: from.y + (to.y - from.y) * progress,
    };
  };

  // Optimized animation loop that only runs when needed
  useEffect(() => {
    let isAnimating = false;
    let targetReached = false;
    let frameCount = 0;
    const MAX_FRAMES_PER_BUDGET = 3; // Limit frames per budget cycle
    const FRAME_BUDGET_MS = 16; // ~60fps
    let lastFrameBudgetStart = 0;

    const animate = (timestamp: number) => {
      // Frame budget limiting
      if (timestamp - lastFrameBudgetStart > FRAME_BUDGET_MS) {
        frameCount = 0;
        lastFrameBudgetStart = timestamp;
      }
      
      if (frameCount >= MAX_FRAMES_PER_BUDGET) {
        // Skip this frame to maintain budget
        if (isAnimating) {
          animationFrameRef.current = requestAnimationFrame(animate);
        }
        return;
      }
      frameCount++;

      const targetScreenPos = canvasToScreen(
        cursor.currentPosition.canvasX,
        cursor.currentPosition.canvasY
      );

      // Check visibility
      const shouldBeVisible = cursor.isActive && isInViewport(targetScreenPos) && !fadeOut;
      if (shouldBeVisible !== isVisible) {
        setIsVisible(shouldBeVisible);
      }

      if (!shouldBeVisible) {
        isAnimating = false;
        return;
      }

      const deltaTime = timestamp - lastUpdateRef.current;
      lastUpdateRef.current = timestamp;

      setPosition(prevPos => {
        const distance = Math.sqrt(
          Math.pow(targetScreenPos.x - prevPos.x, 2) +
          Math.pow(targetScreenPos.y - prevPos.y, 2)
        );

        // Check if we've reached the target
        if (distance < 2) {
          targetReached = true;
          isAnimating = false;
          return targetScreenPos; // Stop animating
        }

        // Jump to position if distance is too large (teleport)
        if (distance > 200) {
          targetReached = true;
          isAnimating = false;
          return targetScreenPos;
        }

        // Continue smooth interpolation
        const lerpFactor = Math.min(deltaTime / 100, 1); // 100ms interpolation window
        const easedProgress = 1 - Math.pow(1 - lerpFactor, 3); // Ease-out cubic
        targetReached = false;
        return interpolatePosition(prevPos, targetScreenPos, easedProgress);
      });

      // Continue animating only if we haven't reached the target
      if (isAnimating && !targetReached) {
        animationFrameRef.current = requestAnimationFrame(animate);
      } else {
        isAnimating = false;
      }
    };

    // Start animation only when cursor position changes
    const startAnimation = () => {
      if (!isAnimating) {
        isAnimating = true;
        targetReached = false;
        lastUpdateRef.current = performance.now();
        animationFrameRef.current = requestAnimationFrame(animate);
      }
    };

    // Start animation when component mounts or cursor changes
    startAnimation();

    return () => {
      isAnimating = false;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [cursor.currentPosition, cursor.isActive, viewport, fadeOut, isVisible, containerRef]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  if (!isVisible) return null;

  const cursorColor = cursor.userColor;
  const userName = cursor.userName;

  return (
    <AnimatePresence onExitComplete={onAnimationComplete}>
      {cursor.isActive && (
        <motion.div
          key={`cursor-${cursor.userId}`}
          className="fixed pointer-events-none z-50"
          style={{
            left: position.x,
            top: position.y,
            transform: 'translate(-2px, -2px)',
          }}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ 
            opacity: fadeOut ? 0 : 1, 
            scale: fadeOut ? 0.8 : 1,
          }}
          exit={{ 
            opacity: 0, 
            scale: 0.8,
            transition: { duration: 0.3 }
          }}
          transition={{ 
            type: 'spring',
            stiffness: 300,
            damping: 30,
            mass: 0.8
          }}
        >
          {/* Cursor SVG */}
          <motion.div
            className="relative"
            whileHover={{ scale: 1.1 }}
            transition={{ duration: 0.1 }}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path
                d="M3 3L16 8L10 10L8 16L3 3Z"
                fill={cursorColor}
                stroke="white"
                strokeWidth="1.5"
                className="drop-shadow-sm"
              />
            </svg>

            {/* User label */}
            {showLabel && (
              <motion.div
                className="absolute top-5 left-3 whitespace-nowrap"
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                transition={{ delay: 0.1 }}
              >
                <div
                  className="px-2 py-1 text-xs font-medium text-white rounded shadow-lg"
                  style={{ backgroundColor: cursorColor }}
                >
                  {userName}
                </div>
                {/* Label arrow */}
                <div
                  className="absolute -top-1 left-2 w-2 h-2 transform rotate-45"
                  style={{ backgroundColor: cursorColor }}
                />
              </motion.div>
            )}
          </motion.div>

          {/* Cursor trail effect (optional) */}
          <motion.div
            className="absolute inset-0 rounded-full"
            style={{ backgroundColor: cursorColor }}
            initial={{ scale: 1, opacity: 0.3 }}
            animate={{ scale: 2, opacity: 0 }}
            transition={{ duration: 0.6, repeat: Infinity }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
};

interface CursorManagerProps {
  cursors: LiveCursorState[];
  containerRef: React.RefObject<HTMLElement>;
  viewport: {
    x: number;
    y: number;
    zoom: number;
  };
  showLabels?: boolean;
  maxCursors?: number;
}

/**
 * Manages multiple cursors with performance optimizations
 */
export const CursorManager: React.FC<CursorManagerProps> = ({
  cursors,
  containerRef,
  viewport,
  showLabels = true,
  maxCursors = 25,
}) => {
  const [removingCursors, setRemovingCursors] = useState<Set<string>>(new Set());

  // Filter and sort cursors by activity
  const activeCursors = cursors
    .filter(cursor => cursor.isActive)
    .sort((a, b) => b.lastSeen - a.lastSeen)
    .slice(0, maxCursors);

  // Handle cursor removal animation
  const handleCursorRemove = (userId: string) => {
    setRemovingCursors(prev => {
      const newSet = new Set(prev);
      newSet.delete(userId);
      return newSet;
    });
  };

  // Track cursors that need fade-out animation
  useEffect(() => {
    const currentCursorIds = new Set(activeCursors.map(c => c.userId));
    const previousCursorIds = new Set(cursors.map(c => c.userId));
    
    // Find cursors that were removed
    const removedCursors = [...previousCursorIds].filter(id => !currentCursorIds.has(id));
    
    if (removedCursors.length > 0) {
      setRemovingCursors(prev => {
        const newSet = new Set(prev);
        removedCursors.forEach(id => newSet.add(id));
        return newSet;
      });

      // Auto-cleanup after animation duration
      const timeout = setTimeout(() => {
        setRemovingCursors(prev => {
          const newSet = new Set(prev);
          removedCursors.forEach(id => newSet.delete(id));
          return newSet;
        });
      }, 1000);

      return () => clearTimeout(timeout);
    }
  }, [cursors, activeCursors]);

  return (
    <div className="fixed inset-0 pointer-events-none z-40">
      {/* Active cursors */}
      {activeCursors.map(cursor => (
        <WhiteboardCursor
          key={`cursor-${cursor.userId}`}
          cursor={cursor}
          containerRef={containerRef}
          viewport={viewport}
          showLabel={showLabels}
          fadeOut={false}
        />
      ))}

      {/* Fading out cursors */}
      {cursors
        .filter(cursor => removingCursors.has(cursor.userId))
        .map(cursor => (
          <WhiteboardCursor
            key={`fading-cursor-${cursor.userId}`}
            cursor={cursor}
            containerRef={containerRef}
            viewport={viewport}
            showLabel={false}
            fadeOut={true}
            onAnimationComplete={() => handleCursorRemove(cursor.userId)}
          />
        ))}
    </div>
  );
};

export default CursorManager;