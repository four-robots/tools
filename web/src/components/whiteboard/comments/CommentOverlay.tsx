/**
 * CommentOverlay Component
 * 
 * Floating comment system with canvas positioning and z-index management.
 * Handles positioning, visibility, and overlays for the comment system.
 * 
 * Features:
 * - Canvas-relative positioning for comment anchors
 * - Viewport-aware visibility and culling
 * - Z-index management for proper layering
 * - Dynamic sizing based on content
 * - Performance optimization for large comment volumes
 */

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { CommentThread } from './CommentThread';
import { CommentComposer } from './CommentComposer';
import { CommentActivityIndicator } from './CommentActivityIndicator';
import { useCommentSystem } from '../hooks/useCommentSystem';
import { useWhiteboardCanvas } from '../hooks/useWhiteboardCanvas';
import { WhiteboardComment, Point } from '@shared/types/whiteboard';

export interface CommentOverlayProps {
  whiteboardId: string;
  userId: string;
  canvasRef: React.RefObject<HTMLElement>;
  viewport: {
    x: number;
    y: number;
    width: number;
    height: number;
    zoom: number;
  };
  // Comment system props
  showComments?: boolean;
  showResolved?: boolean;
  enableMentions?: boolean;
  enableRichText?: boolean;
  // Performance props
  maxVisibleComments?: number;
  commentCullingDistance?: number;
  // Event handlers
  onCommentCreate?: (comment: WhiteboardComment) => void;
  onCommentUpdate?: (comment: WhiteboardComment) => void;
  onCommentDelete?: (commentId: string) => void;
  onCommentResolve?: (commentId: string, resolved: boolean) => void;
}

interface CommentAnchor {
  id: string;
  comment: WhiteboardComment;
  screenPosition: Point;
  isVisible: boolean;
  isActive: boolean;
  zIndex: number;
}

interface NewCommentAnchor {
  position: Point;
  elementId?: string;
  isVisible: boolean;
}

const COMMENT_OVERLAY_Z_INDEX = 1000;
const COMMENT_THREAD_Z_INDEX = 1100;
const COMMENT_COMPOSER_Z_INDEX = 1200;
const COMMENT_CULLING_MARGIN = 100; // Pixels outside viewport to still render

export const CommentOverlay: React.FC<CommentOverlayProps> = ({
  whiteboardId,
  userId,
  canvasRef,
  viewport,
  showComments = true,
  showResolved = false,
  enableMentions = true,
  enableRichText = true,
  maxVisibleComments = 50,
  commentCullingDistance = 200,
  onCommentCreate,
  onCommentUpdate,
  onCommentDelete,
  onCommentResolve,
}) => {
  // Refs for performance optimization
  const overlayRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number>();
  const lastViewportRef = useRef(viewport);

  // State management
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const [newCommentAnchor, setNewCommentAnchor] = useState<NewCommentAnchor | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [commentPositions, setCommentPositions] = useState<Map<string, Point>>(new Map());

  // Hook into comment system
  const {
    comments,
    createComment,
    updateComment,
    deleteComment,
    resolveComment,
    getCommentThread,
    isLoading,
    error,
    subscribeToComments,
    unsubscribeFromComments,
  } = useCommentSystem({
    whiteboardId,
    userId,
    enableMentions,
    enableRichText,
  });

  // Hook into canvas system for positioning
  const {
    canvasToScreen,
    screenToCanvas,
    isPointInViewport,
  } = useWhiteboardCanvas(canvasRef);

  // Memoized comment anchors with performance optimization
  const commentAnchors = useMemo(() => {
    if (!showComments || !comments) return [];

    const anchors: CommentAnchor[] = [];
    let zIndexCounter = COMMENT_OVERLAY_Z_INDEX;

    for (const comment of comments) {
      // Skip resolved comments if not showing them
      if (comment.resolved && !showResolved) continue;

      // Get comment position (canvas coordinates)
      const canvasPosition = comment.position || comment.anchorPoint?.canvasPosition;
      if (!canvasPosition) continue;

      // Convert to screen coordinates
      const screenPosition = canvasToScreen(canvasPosition);

      // Check visibility with culling margin
      const isVisible = isPointInViewport(
        screenPosition,
        viewport,
        COMMENT_CULLING_MARGIN
      );

      // Skip invisible comments for performance (unless active)
      if (!isVisible && activeCommentId !== comment.id) {
        continue;
      }

      anchors.push({
        id: comment.id,
        comment,
        screenPosition,
        isVisible,
        isActive: activeCommentId === comment.id,
        zIndex: activeCommentId === comment.id ? COMMENT_THREAD_Z_INDEX : zIndexCounter++,
      });

      // Limit visible comments for performance
      if (anchors.length >= maxVisibleComments) break;
    }

    // Sort by z-index for proper rendering order
    return anchors.sort((a, b) => a.zIndex - b.zIndex);
  }, [
    comments,
    showComments,
    showResolved,
    viewport,
    activeCommentId,
    maxVisibleComments,
    canvasToScreen,
    isPointInViewport,
  ]);

  // Handle viewport changes with throttling
  useEffect(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    animationFrameRef.current = requestAnimationFrame(() => {
      lastViewportRef.current = viewport;
    });

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [viewport]);

  // Subscribe to comment updates
  useEffect(() => {
    subscribeToComments();
    return () => unsubscribeFromComments();
  }, [subscribeToComments, unsubscribeFromComments]);

  // Handle canvas click for new comments
  const handleCanvasClick = useCallback((event: React.MouseEvent) => {
    if (isDragging || !canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const screenPoint = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };

    const canvasPoint = screenToCanvas(screenPoint);

    // Check if clicking on an existing comment anchor
    const clickedAnchor = commentAnchors.find(anchor => {
      const distance = Math.sqrt(
        Math.pow(anchor.screenPosition.x - screenPoint.x, 2) +
        Math.pow(anchor.screenPosition.y - screenPoint.y, 2)
      );
      return distance <= 20; // 20px click radius
    });

    if (clickedAnchor) {
      setActiveCommentId(clickedAnchor.id);
      setNewCommentAnchor(null);
    } else if (event.detail === 2) { // Double-click for new comment
      setNewCommentAnchor({
        position: canvasPoint,
        isVisible: true,
      });
      setActiveCommentId(null);
    }
  }, [isDragging, canvasRef, screenToCanvas, commentAnchors]);

  // Handle new comment creation
  const handleCreateComment = useCallback(async (data: any) => {
    if (!newCommentAnchor) return;

    try {
      const commentData = {
        ...data,
        position: newCommentAnchor.position,
        elementId: newCommentAnchor.elementId,
      };

      const comment = await createComment(commentData);
      
      if (comment) {
        setNewCommentAnchor(null);
        setActiveCommentId(comment.id);
        onCommentCreate?.(comment);
      }
    } catch (error) {
      console.error('Failed to create comment:', error);
    }
  }, [newCommentAnchor, createComment, onCommentCreate]);

  // Handle comment update
  const handleUpdateComment = useCallback(async (commentId: string, updates: any) => {
    try {
      const comment = await updateComment(commentId, updates);
      if (comment) {
        onCommentUpdate?.(comment);
      }
    } catch (error) {
      console.error('Failed to update comment:', error);
    }
  }, [updateComment, onCommentUpdate]);

  // Handle comment deletion
  const handleDeleteComment = useCallback(async (commentId: string) => {
    try {
      await deleteComment(commentId);
      if (activeCommentId === commentId) {
        setActiveCommentId(null);
      }
      onCommentDelete?.(commentId);
    } catch (error) {
      console.error('Failed to delete comment:', error);
    }
  }, [deleteComment, activeCommentId, onCommentDelete]);

  // Handle comment resolution
  const handleResolveComment = useCallback(async (commentId: string, resolved: boolean) => {
    try {
      await resolveComment(commentId, resolved);
      onCommentResolve?.(commentId, resolved);
    } catch (error) {
      console.error('Failed to resolve comment:', error);
    }
  }, [resolveComment, onCommentResolve]);

  // Handle clicking outside to close active comment
  const handleOverlayClick = useCallback((event: React.MouseEvent) => {
    if (event.target === event.currentTarget) {
      setActiveCommentId(null);
      setNewCommentAnchor(null);
    }
  }, []);

  // Cancel new comment
  const handleCancelNewComment = useCallback(() => {
    setNewCommentAnchor(null);
  }, []);

  // Render comment anchor
  const renderCommentAnchor = useCallback((anchor: CommentAnchor) => {
    const { comment, screenPosition, isActive, zIndex } = anchor;
    
    return (
      <div
        key={anchor.id}
        className={`absolute w-6 h-6 rounded-full border-2 cursor-pointer transition-all duration-200 ${
          comment.resolved
            ? 'bg-green-100 border-green-500 hover:bg-green-200'
            : comment.priority === 'urgent'
            ? 'bg-red-100 border-red-500 hover:bg-red-200'
            : comment.priority === 'high'
            ? 'bg-orange-100 border-orange-500 hover:bg-orange-200'
            : 'bg-blue-100 border-blue-500 hover:bg-blue-200'
        } ${isActive ? 'ring-2 ring-blue-300 scale-110' : 'hover:scale-105'}`}
        style={{
          left: screenPosition.x - 12,
          top: screenPosition.y - 12,
          zIndex,
        }}
        onClick={(e) => {
          e.stopPropagation();
          setActiveCommentId(isActive ? null : comment.id);
        }}
        title={`Comment by ${comment.createdBy}: ${comment.content.substring(0, 50)}${comment.content.length > 50 ? '...' : ''}`}
      >
        {/* Comment count indicator for threads */}
        {(comment.threadMetadata?.replyCount || 0) > 0 && (
          <div className="absolute -top-1 -right-1 bg-blue-600 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
            {comment.threadMetadata!.replyCount}
          </div>
        )}
        
        {/* Priority indicator */}
        {comment.priority === 'urgent' && (
          <div className="absolute -top-1 -left-1 bg-red-500 text-white text-xs rounded-full w-3 h-3 flex items-center justify-center">
            !
          </div>
        )}
      </div>
    );
  }, []);

  // Render new comment anchor
  const renderNewCommentAnchor = useCallback(() => {
    if (!newCommentAnchor) return null;

    const screenPosition = canvasToScreen(newCommentAnchor.position);

    return (
      <div
        className="absolute w-6 h-6 rounded-full bg-blue-500 border-2 border-white shadow-lg animate-pulse"
        style={{
          left: screenPosition.x - 12,
          top: screenPosition.y - 12,
          zIndex: COMMENT_COMPOSER_Z_INDEX,
        }}
      />
    );
  }, [newCommentAnchor, canvasToScreen]);

  // Don't render if comments are disabled
  if (!showComments) {
    return null;
  }

  return createPortal(
    <div
      ref={overlayRef}
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: COMMENT_OVERLAY_Z_INDEX }}
    >
      {/* Comment anchors */}
      <div
        className="absolute inset-0 pointer-events-auto"
        onClick={handleOverlayClick}
        onDoubleClick={handleCanvasClick}
      >
        {commentAnchors.map(renderCommentAnchor)}
        {renderNewCommentAnchor()}
      </div>

      {/* Active comment thread */}
      {activeCommentId && (
        <CommentThread
          commentId={activeCommentId}
          whiteboardId={whiteboardId}
          userId={userId}
          position={commentAnchors.find(a => a.id === activeCommentId)?.screenPosition}
          onUpdate={handleUpdateComment}
          onDelete={handleDeleteComment}
          onResolve={handleResolveComment}
          onClose={() => setActiveCommentId(null)}
          enableMentions={enableMentions}
          enableRichText={enableRichText}
          zIndex={COMMENT_THREAD_Z_INDEX}
        />
      )}

      {/* New comment composer */}
      {newCommentAnchor && (
        <CommentComposer
          whiteboardId={whiteboardId}
          userId={userId}
          position={canvasToScreen(newCommentAnchor.position)}
          elementId={newCommentAnchor.elementId}
          onSubmit={handleCreateComment}
          onCancel={handleCancelNewComment}
          enableMentions={enableMentions}
          enableRichText={enableRichText}
          zIndex={COMMENT_COMPOSER_Z_INDEX}
        />
      )}

      {/* Activity indicators */}
      <CommentActivityIndicator
        whiteboardId={whiteboardId}
        commentAnchors={commentAnchors}
      />

      {/* Error display */}
      {error && (
        <div className="fixed top-4 right-4 bg-red-500 text-white px-4 py-2 rounded-md shadow-lg z-50">
          Comment Error: {error.message}
        </div>
      )}

      {/* Loading indicator */}
      {isLoading && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 bg-blue-500 text-white px-4 py-2 rounded-md shadow-lg z-50">
          Loading comments...
        </div>
      )}
    </div>,
    document.body
  );
};

export default CommentOverlay;