/**
 * Whiteboard Comments Hook
 * 
 * Manages collaborative commenting system for whiteboards.
 */

import { useState, useCallback, useMemo } from 'react';
import { WhiteboardComment } from '../utils/collaboration-events';

interface UseWhiteboardCommentsOptions {
  whiteboardId: string;
  userId: string;
  onAddComment: (content: string, position: { x: number; y: number }, elementId?: string) => void;
  onReplyToComment: (commentId: string, content: string) => void;
  onResolveComment: (commentId: string, resolved: boolean) => void;
  onDeleteComment: (commentId: string) => void;
}

interface CommentsState {
  // UI state
  showComments: boolean;
  showResolved: boolean;
  activeCommentId: string | null;
  newCommentPosition: { x: number; y: number } | null;
  
  // Input state
  newCommentContent: string;
  replyInputs: Map<string, string>;
  
  // Filter state
  filterByUser: string | null;
  filterByElement: string | null;
  searchQuery: string;
}

export function useWhiteboardComments(
  comments: WhiteboardComment[],
  options: UseWhiteboardCommentsOptions
) {
  const {
    whiteboardId,
    userId,
    onAddComment,
    onReplyToComment,
    onResolveComment,
    onDeleteComment,
  } = options;

  const [state, setState] = useState<CommentsState>({
    showComments: true,
    showResolved: false,
    activeCommentId: null,
    newCommentPosition: null,
    newCommentContent: '',
    replyInputs: new Map(),
    filterByUser: null,
    filterByElement: null,
    searchQuery: '',
  });

  // ==================== COMMENT FILTERING ====================

  const filteredComments = useMemo(() => {
    let filtered = [...comments];

    // Filter by resolution status
    if (!state.showResolved) {
      filtered = filtered.filter(comment => !comment.resolved);
    }

    // Filter by user
    if (state.filterByUser) {
      filtered = filtered.filter(comment => comment.author.id === state.filterByUser);
    }

    // Filter by element
    if (state.filterByElement) {
      filtered = filtered.filter(comment => comment.elementId === state.filterByElement);
    }

    // Filter by search query
    if (state.searchQuery) {
      const query = state.searchQuery.toLowerCase();
      filtered = filtered.filter(comment =>
        comment.content.toLowerCase().includes(query) ||
        comment.author.name.toLowerCase().includes(query) ||
        (comment.replies || []).some(reply =>
          reply.content.toLowerCase().includes(query) ||
          reply.author.name.toLowerCase().includes(query)
        )
      );
    }

    // Sort by creation date (newest first)
    return filtered.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [comments, state.showResolved, state.filterByUser, state.filterByElement, state.searchQuery]);

  // ==================== COMMENT STATISTICS ====================

  const commentStats = useMemo(() => {
    const total = comments.length;
    const resolved = comments.filter(c => c.resolved).length;
    const unresolved = total - resolved;
    const myComments = comments.filter(c => c.author.id === userId).length;
    const repliesCount = comments.reduce((sum, c) => sum + (c.replies?.length || 0), 0);

    return {
      total,
      resolved,
      unresolved,
      myComments,
      repliesCount,
    };
  }, [comments, userId]);

  // ==================== COMMENT ACTIONS ====================

  const startNewComment = useCallback((position: { x: number; y: number }, elementId?: string) => {
    setState(prev => ({
      ...prev,
      newCommentPosition: position,
      activeCommentId: null,
      newCommentContent: '',
    }));
  }, []);

  const cancelNewComment = useCallback(() => {
    setState(prev => ({
      ...prev,
      newCommentPosition: null,
      newCommentContent: '',
    }));
  }, []);

  const addComment = useCallback(() => {
    if (!state.newCommentPosition || !state.newCommentContent.trim()) {
      return;
    }

    onAddComment(state.newCommentContent.trim(), state.newCommentPosition);
    
    setState(prev => ({
      ...prev,
      newCommentPosition: null,
      newCommentContent: '',
    }));
  }, [state.newCommentPosition, state.newCommentContent, onAddComment]);

  const setActiveComment = useCallback((commentId: string | null) => {
    setState(prev => ({
      ...prev,
      activeCommentId: commentId,
      newCommentPosition: null,
    }));
  }, []);

  const toggleCommentResolution = useCallback((commentId: string, currentlyResolved: boolean) => {
    onResolveComment(commentId, !currentlyResolved);
  }, [onResolveComment]);

  const deleteComment = useCallback((commentId: string) => {
    onDeleteComment(commentId);
    
    // Clear active comment if it was deleted
    setState(prev => ({
      ...prev,
      activeCommentId: prev.activeCommentId === commentId ? null : prev.activeCommentId,
    }));
  }, [onDeleteComment]);

  // ==================== REPLY ACTIONS ====================

  const setReplyContent = useCallback((commentId: string, content: string) => {
    setState(prev => {
      const newReplyInputs = new Map(prev.replyInputs);
      newReplyInputs.set(commentId, content);
      return { ...prev, replyInputs: newReplyInputs };
    });
  }, []);

  const addReply = useCallback((commentId: string) => {
    const content = state.replyInputs.get(commentId);
    if (!content?.trim()) {
      return;
    }

    onReplyToComment(commentId, content.trim());
    
    setState(prev => {
      const newReplyInputs = new Map(prev.replyInputs);
      newReplyInputs.delete(commentId);
      return { ...prev, replyInputs: newReplyInputs };
    });
  }, [state.replyInputs, onReplyToComment]);

  const cancelReply = useCallback((commentId: string) => {
    setState(prev => {
      const newReplyInputs = new Map(prev.replyInputs);
      newReplyInputs.delete(commentId);
      return { ...prev, replyInputs: newReplyInputs };
    });
  }, []);

  // ==================== UI CONTROLS ====================

  const toggleCommentsVisibility = useCallback(() => {
    setState(prev => ({ ...prev, showComments: !prev.showComments }));
  }, []);

  const toggleResolvedComments = useCallback(() => {
    setState(prev => ({ ...prev, showResolved: !prev.showResolved }));
  }, []);

  const setUserFilter = useCallback((userId: string | null) => {
    setState(prev => ({ ...prev, filterByUser: userId }));
  }, []);

  const setElementFilter = useCallback((elementId: string | null) => {
    setState(prev => ({ ...prev, filterByElement: elementId }));
  }, []);

  const setSearchQuery = useCallback((query: string) => {
    setState(prev => ({ ...prev, searchQuery: query }));
  }, []);

  const clearFilters = useCallback(() => {
    setState(prev => ({
      ...prev,
      filterByUser: null,
      filterByElement: null,
      searchQuery: '',
    }));
  }, []);

  // ==================== COMMENT UTILITIES ====================

  const getCommentById = useCallback((commentId: string) => {
    return comments.find(comment => comment.id === commentId);
  }, [comments]);

  const getCommentsByElement = useCallback((elementId: string) => {
    return comments.filter(comment => comment.elementId === elementId);
  }, [comments]);

  const getCommentsByUser = useCallback((authorId: string) => {
    return comments.filter(comment => comment.author.id === authorId);
  }, [comments]);

  const isCommentActive = useCallback((commentId: string) => {
    return state.activeCommentId === commentId;
  }, [state.activeCommentId]);

  const hasReplyInput = useCallback((commentId: string) => {
    return state.replyInputs.has(commentId);
  }, [state.replyInputs]);

  const getReplyContent = useCallback((commentId: string) => {
    return state.replyInputs.get(commentId) || '';
  }, [state.replyInputs]);

  const canEditComment = useCallback((comment: WhiteboardComment) => {
    return comment.author.id === userId;
  }, [userId]);

  const canResolveComment = useCallback((comment: WhiteboardComment) => {
    // For now, allow anyone to resolve comments
    // In a real app, you might want more sophisticated permissions
    return true;
  }, []);

  // ==================== POSITIONING UTILITIES ====================

  const getCommentPosition = useCallback((comment: WhiteboardComment) => {
    return comment.position;
  }, []);

  const isCommentVisible = useCallback((
    comment: WhiteboardComment,
    viewport: { x: number; y: number; width: number; height: number; zoom: number }
  ) => {
    const position = comment.position;
    return (
      position.x >= viewport.x - 50 && // Add margin for partially visible comments
      position.x <= viewport.x + viewport.width + 50 &&
      position.y >= viewport.y - 50 &&
      position.y <= viewport.y + viewport.height + 50
    );
  }, []);

  // ==================== KEYBOARD SHORTCUTS ====================

  const handleKeyDown = useCallback((event: KeyboardEvent, commentId?: string) => {
    if (event.key === 'Escape') {
      if (state.newCommentPosition) {
        cancelNewComment();
      } else if (state.activeCommentId) {
        setActiveComment(null);
      }
    } else if (event.key === 'Enter' && event.ctrlKey) {
      if (state.newCommentPosition && state.newCommentContent.trim()) {
        addComment();
      } else if (commentId && state.replyInputs.has(commentId)) {
        addReply(commentId);
      }
    }
  }, [state.newCommentPosition, state.newCommentContent, state.activeCommentId, state.replyInputs, cancelNewComment, setActiveComment, addComment, addReply]);

  // ==================== RETURN API ====================

  return {
    // Comments data
    comments: filteredComments,
    allComments: comments,
    commentStats,
    
    // UI state
    showComments: state.showComments,
    showResolved: state.showResolved,
    activeCommentId: state.activeCommentId,
    newCommentPosition: state.newCommentPosition,
    
    // Input state
    newCommentContent: state.newCommentContent,
    setNewCommentContent: (content: string) => setState(prev => ({ ...prev, newCommentContent: content })),
    
    // Comment actions
    startNewComment,
    cancelNewComment,
    addComment,
    setActiveComment,
    toggleCommentResolution,
    deleteComment,
    
    // Reply actions
    setReplyContent,
    addReply,
    cancelReply,
    getReplyContent,
    hasReplyInput,
    
    // UI controls
    toggleCommentsVisibility,
    toggleResolvedComments,
    setUserFilter,
    setElementFilter,
    setSearchQuery,
    clearFilters,
    
    // Utilities
    getCommentById,
    getCommentsByElement,
    getCommentsByUser,
    isCommentActive,
    canEditComment,
    canResolveComment,
    getCommentPosition,
    isCommentVisible,
    
    // Event handlers
    handleKeyDown,
    
    // Filter state
    filterByUser: state.filterByUser,
    filterByElement: state.filterByElement,
    searchQuery: state.searchQuery,
    hasActiveFilters: !!(state.filterByUser || state.filterByElement || state.searchQuery),
  };
}