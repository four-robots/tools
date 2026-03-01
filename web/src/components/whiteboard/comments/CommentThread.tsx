/**
 * CommentThread Component
 * 
 * Threaded comment display with visual hierarchy, expand/collapse functionality,
 * reply nesting, and parent-child relationships.
 * 
 * Features:
 * - Nested thread visualization with indentation
 * - Expand/collapse functionality for large threads
 * - Reply composition inline
 * - User avatars and timestamps
 * - Rich text content display
 * - @mention highlighting
 * - Comment actions (edit, delete, resolve)
 * - Real-time updates and activity indicators
 */

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { UserAvatar } from '../UserAvatar';
import { CommentComposer } from './CommentComposer';
import { CommentActivityIndicator } from './CommentActivityIndicator';
import { MentionAutocomplete } from './MentionAutocomplete';
import { useCommentThreading } from '../hooks/useCommentThreading';
import { useCommentNotifications } from '../hooks/useCommentNotifications';
import { WhiteboardCommentWithReplies, Point, CommentStatus } from '@shared/types/whiteboard';

export interface CommentThreadProps {
  commentId: string;
  whiteboardId: string;
  userId: string;
  position?: Point;
  maxDepth?: number;
  enableMentions?: boolean;
  enableRichText?: boolean;
  zIndex?: number;
  onUpdate?: (commentId: string, updates: any) => void;
  onDelete?: (commentId: string) => void;
  onResolve?: (commentId: string, resolved: boolean) => void;
  onClose?: () => void;
}

interface ThreadDisplayOptions {
  showTimestamps: boolean;
  showAvatars: boolean;
  compactMode: boolean;
  maxVisibleReplies: number;
}

const MAX_THREAD_DEPTH = 5;
const MAX_VISIBLE_REPLIES = 10;
const THREAD_INDENT_PX = 20;

export const CommentThread: React.FC<CommentThreadProps> = ({
  commentId,
  whiteboardId,
  userId,
  position,
  maxDepth = MAX_THREAD_DEPTH,
  enableMentions = true,
  enableRichText = true,
  zIndex = 1000,
  onUpdate,
  onDelete,
  onResolve,
  onClose,
}) => {
  // Refs for positioning and scrolling
  const threadRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // State management
  const [displayOptions, setDisplayOptions] = useState<ThreadDisplayOptions>({
    showTimestamps: true,
    showAvatars: true,
    compactMode: false,
    maxVisibleReplies: MAX_VISIBLE_REPLIES,
  });
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(new Set());
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [editingComment, setEditingComment] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');

  // Hook into threading system
  const {
    thread,
    isLoading,
    error,
    loadMoreReplies,
    expandThread,
    collapseThread,
    isExpanded,
    hasMoreReplies,
  } = useCommentThreading({
    commentId,
    whiteboardId,
    userId,
    maxDepth,
  });

  // Hook into notifications
  const {
    markAsRead,
    hasUnreadReplies,
  } = useCommentNotifications({
    whiteboardId,
    userId,
  });

  // Position calculation for floating thread
  const threadPosition = useMemo(() => {
    if (!position) return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };

    // Adjust position to keep thread visible on screen
    const padding = 20;
    const maxWidth = window.innerWidth - padding * 2;
    const maxHeight = window.innerHeight - padding * 2;

    let left = position.x + 20; // Offset from anchor
    let top = position.y;

    // Keep within screen bounds
    if (left + 400 > maxWidth) left = position.x - 420; // 400px thread width + 20px offset
    if (left < padding) left = padding;
    if (top + 300 > maxHeight) top = maxHeight - 300; // Estimate thread height
    if (top < padding) top = padding;

    return { top: `${top}px`, left: `${left}px` };
  }, [position]);

  // Mark thread as read when opened
  useEffect(() => {
    if (thread && hasUnreadReplies(commentId)) {
      markAsRead(commentId);
    }
  }, [thread, commentId, hasUnreadReplies, markAsRead]);

  // Handle thread expansion
  const handleToggleExpand = useCallback(async (targetCommentId: string) => {
    if (isExpanded(targetCommentId)) {
      collapseThread(targetCommentId);
      setExpandedReplies(prev => {
        const next = new Set(prev);
        next.delete(targetCommentId);
        return next;
      });
    } else {
      await expandThread(targetCommentId);
      setExpandedReplies(prev => new Set(prev).add(targetCommentId));
    }
  }, [isExpanded, expandThread, collapseThread]);

  // Handle reply composition
  const handleStartReply = useCallback((targetCommentId: string) => {
    setReplyingTo(targetCommentId);
    setEditingComment(null);
  }, []);

  const handleCancelReply = useCallback(() => {
    setReplyingTo(null);
  }, []);

  const handleSubmitReply = useCallback(async (replyData: any) => {
    if (!replyingTo) return;

    try {
      const replyPayload = {
        ...replyData,
        parentId: replyingTo,
      };

      await onUpdate?.(replyingTo, replyPayload);
      setReplyingTo(null);
    } catch (error) {
      console.error('Failed to submit reply:', error);
    }
  }, [replyingTo, onUpdate]);

  // Handle comment editing
  const handleStartEdit = useCallback((comment: WhiteboardCommentWithReplies) => {
    setEditingComment(comment.id);
    setEditContent(comment.content);
    setReplyingTo(null);
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingComment(null);
    setEditContent('');
  }, []);

  const handleSubmitEdit = useCallback(async (commentToEdit: string) => {
    if (!editContent.trim()) return;

    try {
      await onUpdate?.(commentToEdit, { content: editContent });
      setEditingComment(null);
      setEditContent('');
    } catch (error) {
      console.error('Failed to update comment:', error);
    }
  }, [editContent, onUpdate]);

  // Handle comment resolution
  const handleToggleResolve = useCallback((comment: WhiteboardCommentWithReplies) => {
    onResolve?.(comment.id, !comment.resolved);
  }, [onResolve]);

  // Handle comment deletion
  const handleDelete = useCallback((targetCommentId: string) => {
    if (window.confirm('Are you sure you want to delete this comment?')) {
      onDelete?.(targetCommentId);
    }
  }, [onDelete]);

  // Render @mentions with highlighting
  const renderContentWithMentions = useCallback((content: string, mentions: any[] = []) => {
    if (!enableMentions || mentions.length === 0) {
      return <span>{content}</span>;
    }

    let processedContent = content;
    const mentionElements: JSX.Element[] = [];

    mentions.forEach((mention, index) => {
      const escapedName = mention.userName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const mentionRegex = new RegExp(`@${escapedName}`, 'gi');
      processedContent = processedContent.replace(mentionRegex, `__MENTION_${index}__`);
      
      mentionElements[index] = (
        <span
          key={`mention-${index}`}
          className="bg-blue-100 text-blue-800 px-1 rounded font-medium"
          title={`@${mention.userName}`}
        >
          @{mention.userName}
        </span>
      );
    });

    // Replace mention placeholders with JSX elements
    const parts = processedContent.split(/(__MENTION_\d+__)/);
    return (
      <span>
        {parts.map((part, index) => {
          const mentionMatch = part.match(/^__MENTION_(\d+)__$/);
          if (mentionMatch) {
            const mentionIndex = parseInt(mentionMatch[1]);
            return mentionElements[mentionIndex];
          }
          return <span key={index}>{part}</span>;
        })}
      </span>
    );
  }, [enableMentions]);

  // Render individual comment
  const renderComment = useCallback((
    comment: WhiteboardCommentWithReplies,
    depth: number = 0,
    isLast: boolean = false
  ) => {
    const isEditing = editingComment === comment.id;
    const isReplying = replyingTo === comment.id;
    const hasReplies = comment.replies && comment.replies.length > 0;
    const isExpanded = expandedReplies.has(comment.id);
    const canEdit = comment.createdBy === userId;
    const canDelete = comment.createdBy === userId; // TODO: Add permission checks

    return (
      <div
        key={comment.id}
        className={`relative ${depth > 0 ? 'border-l-2 border-gray-200' : ''}`}
        style={{ marginLeft: depth * THREAD_INDENT_PX }}
      >
        {/* Comment content */}
        <div className={`p-3 rounded-lg ${
          comment.resolved 
            ? 'bg-green-50 border border-green-200' 
            : 'bg-white border border-gray-200'
        } shadow-sm mb-2`}>
          {/* Header */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-2">
              {displayOptions.showAvatars && (
                <UserAvatar
                  userId={comment.createdBy}
                  userName="User" // TODO: Get actual user name
                  size="sm"
                />
              )}
              <div>
                <span className="font-medium text-gray-900">
                  {comment.createdBy} {/* TODO: Get actual user name */}
                </span>
                {displayOptions.showTimestamps && (
                  <span className="text-xs text-gray-500 ml-2">
                    {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
                  </span>
                )}
              </div>
              {comment.status && comment.status !== 'open' && (
                <span className={`px-2 py-1 text-xs rounded-full ${
                  comment.status === 'resolved' 
                    ? 'bg-green-100 text-green-800'
                    : comment.status === 'in_progress'
                    ? 'bg-yellow-100 text-yellow-800'
                    : 'bg-gray-100 text-gray-800'
                }`}>
                  {comment.status}
                </span>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center space-x-1">
              {canEdit && (
                <button
                  onClick={() => handleStartEdit(comment)}
                  className="p-1 text-gray-400 hover:text-gray-600 rounded"
                  title="Edit comment"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                  </svg>
                </button>
              )}
              <button
                onClick={() => handleToggleResolve(comment)}
                className={`p-1 rounded ${
                  comment.resolved
                    ? 'text-green-600 hover:text-green-800'
                    : 'text-gray-400 hover:text-gray-600'
                }`}
                title={comment.resolved ? 'Unresolve' : 'Resolve'}
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </button>
              {canDelete && (
                <button
                  onClick={() => handleDelete(comment.id)}
                  className="p-1 text-gray-400 hover:text-red-600 rounded"
                  title="Delete comment"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9zM4 5a2 2 0 012-2h8a2 2 0 012 2v6a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 112 0v3a1 1 0 11-2 0V9zm4 0a1 1 0 112 0v3a1 1 0 11-2 0V9z" clipRule="evenodd" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Content */}
          {isEditing ? (
            <div className="space-y-2">
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-md resize-none"
                rows={3}
                placeholder="Edit your comment..."
              />
              <div className="flex space-x-2">
                <button
                  onClick={() => handleSubmitEdit(comment.id)}
                  className="px-3 py-1 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700"
                >
                  Save
                </button>
                <button
                  onClick={handleCancelEdit}
                  className="px-3 py-1 border border-gray-300 text-gray-700 rounded-md text-sm hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="text-gray-800">
              {renderContentWithMentions(comment.content, comment.mentions)}
            </div>
          )}

          {/* Reply actions */}
          {!isEditing && depth < maxDepth && (
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
              <button
                onClick={() => handleStartReply(comment.id)}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                Reply
              </button>
              
              {hasReplies && (
                <button
                  onClick={() => handleToggleExpand(comment.id)}
                  className="text-sm text-gray-600 hover:text-gray-800 flex items-center space-x-1"
                >
                  <span>
                    {isExpanded ? 'Collapse' : 'Expand'} ({comment.replyCount} replies)
                  </span>
                  <svg
                    className={`w-4 h-4 transform transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Reply composer */}
        {isReplying && (
          <div className="ml-4 mb-2">
            <CommentComposer
              whiteboardId={whiteboardId}
              userId={userId}
              parentId={comment.id}
              onSubmit={handleSubmitReply}
              onCancel={handleCancelReply}
              enableMentions={enableMentions}
              enableRichText={enableRichText}
              placeholder="Write a reply..."
              autoFocus
            />
          </div>
        )}

        {/* Nested replies */}
        {hasReplies && isExpanded && (
          <div className="space-y-1">
            {comment.replies.slice(0, displayOptions.maxVisibleReplies).map((reply, index) =>
              renderComment(reply, depth + 1, index === comment.replies.length - 1)
            )}
            
            {comment.hasMoreReplies && (
              <button
                onClick={() => loadMoreReplies(comment.id)}
                className="ml-4 text-sm text-blue-600 hover:text-blue-800"
              >
                Load more replies...
              </button>
            )}
          </div>
        )}
      </div>
    );
  }, [
    editingComment,
    replyingTo,
    expandedReplies,
    displayOptions,
    userId,
    maxDepth,
    editContent,
    enableMentions,
    enableRichText,
    handleStartEdit,
    handleStartReply,
    handleToggleExpand,
    handleToggleResolve,
    handleDelete,
    handleSubmitEdit,
    handleCancelEdit,
    handleSubmitReply,
    handleCancelReply,
    loadMoreReplies,
    renderContentWithMentions,
  ]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (editingComment) {
          handleCancelEdit();
        } else if (replyingTo) {
          handleCancelReply();
        } else {
          onClose?.();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [editingComment, replyingTo, handleCancelEdit, handleCancelReply, onClose]);

  if (isLoading) {
    return (
      <div
        className="fixed bg-white rounded-lg shadow-lg border border-gray-200 p-4 w-96"
        style={{ ...threadPosition, zIndex }}
      >
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
          <div className="h-3 bg-gray-200 rounded w-1/2"></div>
        </div>
      </div>
    );
  }

  if (error || !thread) {
    return (
      <div
        className="fixed bg-white rounded-lg shadow-lg border border-red-200 p-4 w-96"
        style={{ ...threadPosition, zIndex }}
      >
        <div className="text-red-600">
          Failed to load comment thread: {error?.message || 'Unknown error'}
        </div>
        <button
          onClick={onClose}
          className="mt-2 px-3 py-1 bg-gray-200 text-gray-700 rounded-md text-sm hover:bg-gray-300"
        >
          Close
        </button>
      </div>
    );
  }

  return (
    <div
      ref={threadRef}
      className="fixed bg-white rounded-lg shadow-xl border border-gray-200 max-w-md max-h-96 overflow-hidden"
      style={{ ...threadPosition, zIndex }}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-gray-200 bg-gray-50">
        <h3 className="font-medium text-gray-900">Comment Thread</h3>
        <div className="flex items-center space-x-2">
          {/* Display options */}
          <button
            onClick={() => setDisplayOptions(prev => ({ ...prev, compactMode: !prev.compactMode }))}
            className={`p-1 rounded ${displayOptions.compactMode ? 'bg-blue-100 text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
            title="Toggle compact mode"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h6a1 1 0 110 2H4a1 1 0 01-1-1zM3 16a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" />
            </svg>
          </button>
          
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 rounded"
            title="Close thread"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </div>

      {/* Thread content */}
      <div
        ref={scrollContainerRef}
        className="overflow-y-auto p-2"
        style={{ maxHeight: '300px' }}
      >
        {renderComment(thread.rootComment, 0)}
        
        {/* Load more threads */}
        {hasMoreReplies(commentId) && (
          <div className="p-2 text-center">
            <button
              onClick={() => loadMoreReplies(commentId)}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              Load more comments...
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default CommentThread;