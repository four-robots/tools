/**
 * Optimized Comment Overlay Component
 * 
 * High-performance comment overlay that handles 100+ comments using:
 * - Viewport culling to only render visible comments
 * - Comment virtualization for large datasets
 * - Optimized re-rendering with memoization
 * - Spatial indexing for efficient position queries
 */

import React, { 
  useMemo, 
  useCallback, 
  useRef, 
  useEffect, 
  useState,
  memo 
} from 'react';
import { WhiteboardComment } from '@shared/types/whiteboard';
import { useWhiteboardCanvas } from '../hooks/useWhiteboardCanvas';
import { CommentAnchor } from './CommentAnchor';
import { CommentThread } from './CommentThread';
import { useViewportIntersection } from '../hooks/useViewportIntersection';
import { useDebouncedCallback } from '../hooks/useDebouncedCallback';
import { ErrorBoundary } from '../../common/ErrorBoundary';

interface OptimizedCommentOverlayProps {
  comments: WhiteboardComment[];
  whiteboardId: string;
  userId: string;
  showComments: boolean;
  showResolved: boolean;
  activeCommentId?: string;
  maxVisibleComments?: number;
  onCommentCreate: (comment: Partial<WhiteboardComment>) => Promise<void>;
  onCommentUpdate: (commentId: string, updates: Partial<WhiteboardComment>) => Promise<void>;
  onCommentDelete: (commentId: string) => Promise<void>;
  onCommentResolve: (commentId: string, resolved: boolean) => Promise<void>;
  onCommentSelect?: (commentId: string | null) => void;
  className?: string;
}

interface CommentSpatialData {
  id: string;
  comment: WhiteboardComment;
  screenPosition: { x: number; y: number };
  canvasPosition: { x: number; y: number };
  boundingBox: {
    left: number;
    top: number;
    right: number;
    bottom: number;
  };
  isVisible: boolean;
  priority: number; // For rendering priority
}

interface ViewportRegion {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

// Performance constants
const COMMENT_ANCHOR_SIZE = 24;
const COMMENT_THREAD_WIDTH = 320;
const VIEWPORT_PADDING = 100; // Extra pixels around viewport for culling
const MAX_RENDERED_COMMENTS = 50; // Hard limit for performance
const SPATIAL_GRID_SIZE = 200; // Size of spatial grid cells
const DEBOUNCE_DELAY = 16; // ~60fps for viewport updates
const PRIORITY_BOOST_ACTIVE = 1000;
const PRIORITY_BOOST_RESOLVED = -100;

// Spatial index for efficient position-based queries
class CommentSpatialIndex {
  private grid: Map<string, Set<string>> = new Map();
  private comments: Map<string, CommentSpatialData> = new Map();
  private gridSize: number;

  constructor(gridSize: number = SPATIAL_GRID_SIZE) {
    this.gridSize = gridSize;
  }

  private getGridKey(x: number, y: number): string {
    const gridX = Math.floor(x / this.gridSize);
    const gridY = Math.floor(y / this.gridSize);
    return `${gridX},${gridY}`;
  }

  addComment(commentData: CommentSpatialData): void {
    const { id, boundingBox } = commentData;
    
    // Remove from old position if exists
    this.removeComment(id);
    
    // Add to comments map
    this.comments.set(id, commentData);
    
    // Add to spatial grid (comments may span multiple cells)
    const startGridX = Math.floor(boundingBox.left / this.gridSize);
    const endGridX = Math.floor(boundingBox.right / this.gridSize);
    const startGridY = Math.floor(boundingBox.top / this.gridSize);
    const endGridY = Math.floor(boundingBox.bottom / this.gridSize);
    
    for (let gridX = startGridX; gridX <= endGridX; gridX++) {
      for (let gridY = startGridY; gridY <= endGridY; gridY++) {
        const gridKey = `${gridX},${gridY}`;
        if (!this.grid.has(gridKey)) {
          this.grid.set(gridKey, new Set());
        }
        this.grid.get(gridKey)!.add(id);
      }
    }
  }

  removeComment(id: string): void {
    const commentData = this.comments.get(id);
    if (!commentData) return;
    
    // Remove from spatial grid
    const { boundingBox } = commentData;
    const startGridX = Math.floor(boundingBox.left / this.gridSize);
    const endGridX = Math.floor(boundingBox.right / this.gridSize);
    const startGridY = Math.floor(boundingBox.top / this.gridSize);
    const endGridY = Math.floor(boundingBox.bottom / this.gridSize);
    
    for (let gridX = startGridX; gridX <= endGridX; gridX++) {
      for (let gridY = startGridY; gridY <= endGridY; gridY++) {
        const gridKey = `${gridX},${gridY}`;
        const cell = this.grid.get(gridKey);
        if (cell) {
          cell.delete(id);
          if (cell.size === 0) {
            this.grid.delete(gridKey);
          }
        }
      }
    }
    
    // Remove from comments map
    this.comments.delete(id);
  }

  queryViewport(viewport: ViewportRegion): CommentSpatialData[] {
    const results = new Set<string>();
    
    const startGridX = Math.floor(viewport.left / this.gridSize);
    const endGridX = Math.floor(viewport.right / this.gridSize);
    const startGridY = Math.floor(viewport.top / this.gridSize);
    const endGridY = Math.floor(viewport.bottom / this.gridSize);
    
    for (let gridX = startGridX; gridX <= endGridX; gridX++) {
      for (let gridY = startGridY; gridY <= endGridY; gridY++) {
        const gridKey = `${gridX},${gridY}`;
        const cell = this.grid.get(gridKey);
        if (cell) {
          cell.forEach(id => results.add(id));
        }
      }
    }
    
    return Array.from(results)
      .map(id => this.comments.get(id)!)
      .filter(comment => comment && this.intersectsViewport(comment.boundingBox, viewport));
  }

  private intersectsViewport(boundingBox: { left: number; top: number; right: number; bottom: number }, viewport: ViewportRegion): boolean {
    return !(
      boundingBox.right < viewport.left ||
      boundingBox.left > viewport.right ||
      boundingBox.bottom < viewport.top ||
      boundingBox.top > viewport.bottom
    );
  }

  clear(): void {
    this.grid.clear();
    this.comments.clear();
  }

  getStatistics() {
    return {
      totalComments: this.comments.size,
      gridCells: this.grid.size,
      averageCommentsPerCell: this.grid.size > 0 ? 
        Array.from(this.grid.values()).reduce((sum, cell) => sum + cell.size, 0) / this.grid.size : 0,
    };
  }
}

// Memoized comment anchor component
const MemoizedCommentAnchor = memo<{
  commentData: CommentSpatialData;
  isActive: boolean;
  onClick: (commentId: string) => void;
}>(({ commentData, isActive, onClick }) => {
  const handleClick = useCallback(() => {
    onClick(commentData.id);
  }, [commentData.id, onClick]);

  return (
    <CommentAnchor
      comment={commentData.comment}
      position={commentData.screenPosition}
      isActive={isActive}
      onClick={handleClick}
      style={{
        position: 'absolute',
        left: commentData.screenPosition.x - COMMENT_ANCHOR_SIZE / 2,
        top: commentData.screenPosition.y - COMMENT_ANCHOR_SIZE / 2,
        zIndex: isActive ? 1000 : commentData.priority,
      }}
    />
  );
});

MemoizedCommentAnchor.displayName = 'MemoizedCommentAnchor';

export const OptimizedCommentOverlay: React.FC<OptimizedCommentOverlayProps> = ({
  comments,
  whiteboardId,
  userId,
  showComments,
  showResolved,
  activeCommentId,
  maxVisibleComments = MAX_RENDERED_COMMENTS,
  onCommentCreate,
  onCommentUpdate,
  onCommentDelete,
  onCommentResolve,
  onCommentSelect,
  className = '',
}) => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const spatialIndexRef = useRef(new CommentSpatialIndex());
  const [renderKey, setRenderKey] = useState(0);
  
  const {
    viewport,
    canvasToScreen,
    screenToCanvas,
    isPointInViewport,
  } = useWhiteboardCanvas(canvasRef);

  // Create viewport region for spatial queries
  const viewportRegion = useMemo<ViewportRegion>(() => ({
    left: viewport.x - VIEWPORT_PADDING,
    top: viewport.y - VIEWPORT_PADDING,
    right: viewport.x + viewport.width + VIEWPORT_PADDING,
    bottom: viewport.y + viewport.height + VIEWPORT_PADDING,
    width: viewport.width + 2 * VIEWPORT_PADDING,
    height: viewport.height + 2 * VIEWPORT_PADDING,
  }), [viewport]);

  // Process comments into spatial data with performance optimization
  const processedComments = useMemo(() => {
    if (!showComments || !comments?.length) return [];

    const spatialData: CommentSpatialData[] = [];
    
    for (const comment of comments) {
      // Skip resolved comments if not showing them
      if (comment.resolved && !showResolved) continue;

      // Get comment position
      const canvasPosition = comment.position || comment.anchorPoint?.canvasPosition;
      if (!canvasPosition) continue;

      // Convert to screen coordinates
      const screenPosition = canvasToScreen(canvasPosition);

      // Calculate bounding box for spatial indexing
      const boundingBox = {
        left: screenPosition.x - COMMENT_ANCHOR_SIZE / 2,
        top: screenPosition.y - COMMENT_ANCHOR_SIZE / 2,
        right: screenPosition.x + COMMENT_ANCHOR_SIZE / 2,
        bottom: screenPosition.y + COMMENT_ANCHOR_SIZE / 2,
      };

      // Expand bounding box if this is an active comment with thread
      if (activeCommentId === comment.id) {
        boundingBox.right += COMMENT_THREAD_WIDTH;
        boundingBox.bottom += 200; // Estimated thread height
      }

      // Calculate rendering priority
      let priority = 100;
      if (activeCommentId === comment.id) {
        priority += PRIORITY_BOOST_ACTIVE;
      }
      if (comment.resolved) {
        priority += PRIORITY_BOOST_RESOLVED;
      }
      if (comment.priority === 'urgent') priority += 50;
      if (comment.priority === 'high') priority += 25;

      spatialData.push({
        id: comment.id,
        comment,
        screenPosition,
        canvasPosition,
        boundingBox,
        isVisible: true,
        priority,
      });
    }

    return spatialData;
  }, [
    comments,
    showComments,
    showResolved,
    activeCommentId,
    canvasToScreen,
  ]);

  // Update spatial index when processed comments change
  useEffect(() => {
    const spatialIndex = spatialIndexRef.current;
    spatialIndex.clear();
    
    for (const commentData of processedComments) {
      spatialIndex.addComment(commentData);
    }
  }, [processedComments]);

  // Get visible comments using spatial index with debouncing
  const visibleComments = useMemo(() => {
    if (!showComments || processedComments.length === 0) return [];

    const spatialIndex = spatialIndexRef.current;
    const candidateComments = spatialIndex.queryViewport(viewportRegion);
    
    // Sort by priority and limit for performance
    const sortedComments = candidateComments
      .sort((a, b) => b.priority - a.priority)
      .slice(0, maxVisibleComments);

    return sortedComments;
  }, [showComments, processedComments, viewportRegion, maxVisibleComments]);

  // Debounced viewport change handler to prevent excessive re-renders
  const debouncedViewportUpdate = useDebouncedCallback(() => {
    setRenderKey(prev => prev + 1);
  }, DEBOUNCE_DELAY);

  useEffect(() => {
    debouncedViewportUpdate();
  }, [viewport, debouncedViewportUpdate]);

  // Handle comment selection
  const handleCommentClick = useCallback((commentId: string) => {
    onCommentSelect?.(commentId === activeCommentId ? null : commentId);
  }, [activeCommentId, onCommentSelect]);

  // Handle canvas click to deselect comments
  const handleCanvasClick = useCallback((event: React.MouseEvent) => {
    if (event.target === event.currentTarget) {
      onCommentSelect?.(null);
    }
  }, [onCommentSelect]);

  if (!showComments) {
    return null;
  }

  return (
    <ErrorBoundary
      fallback={
        <div className="comment-overlay-error p-4 bg-red-50 border border-red-200 rounded">
          <p className="text-red-600">Failed to render comment overlay</p>
        </div>
      }
    >
      <div 
        ref={canvasRef}
        className={`optimized-comment-overlay absolute inset-0 pointer-events-none ${className}`}
        onClick={handleCanvasClick}
        style={{ zIndex: 100 }}
      >
        {/* Render comment anchors */}
        {visibleComments.map((commentData) => (
          <MemoizedCommentAnchor
            key={`${commentData.id}-${renderKey}`}
            commentData={commentData}
            isActive={activeCommentId === commentData.id}
            onClick={handleCommentClick}
          />
        ))}

        {/* Render active comment thread */}
        {activeCommentId && (
          <div className="active-comment-thread pointer-events-auto">
            {(() => {
              const activeCommentData = visibleComments.find(c => c.id === activeCommentId);
              if (!activeCommentData) return null;

              return (
                <div
                  className="comment-thread-container absolute bg-white rounded-lg shadow-lg border border-gray-200"
                  style={{
                    left: activeCommentData.screenPosition.x + COMMENT_ANCHOR_SIZE + 8,
                    top: activeCommentData.screenPosition.y - 100,
                    width: COMMENT_THREAD_WIDTH,
                    maxHeight: 400,
                    zIndex: 1001,
                  }}
                >
                  <CommentThread
                    comment={activeCommentData.comment}
                    onUpdate={onCommentUpdate}
                    onDelete={onCommentDelete}
                    onResolve={onCommentResolve}
                    onClose={() => onCommentSelect?.(null)}
                    className="max-h-96 overflow-y-auto"
                  />
                </div>
              );
            })()}
          </div>
        )}

        {/* Performance debug info (development only) */}
        {process.env.NODE_ENV === 'development' && (
          <div className="debug-overlay absolute top-2 right-2 bg-black bg-opacity-75 text-white text-xs p-2 rounded pointer-events-none">
            <div>Total Comments: {comments.length}</div>
            <div>Processed: {processedComments.length}</div>
            <div>Visible: {visibleComments.length}</div>
            <div>Spatial Index: {spatialIndexRef.current.getStatistics().gridCells} cells</div>
            <div>Viewport: {Math.round(viewport.width)}x{Math.round(viewport.height)}</div>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
};

export default OptimizedCommentOverlay;