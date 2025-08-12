/**
 * useCommentSystem Hook
 * 
 * Comprehensive comment state management hook providing threading logic,
 * @mention handling, real-time synchronization, and unified comment operations.
 * 
 * Features:
 * - Complete CRUD operations for comments
 * - Threading and nested reply management
 * - @mention parsing and user resolution
 * - Real-time WebSocket synchronization
 * - Optimistic updates with rollback
 * - Comment validation and error handling
 * - Performance optimization with caching
 * - Activity tracking and presence awareness
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useWebSocket } from './useWebSocket';
import { useMentionSystem } from './useMentionSystem';
import { useCommentNotifications } from './useCommentNotifications';
import { RichTextValidator } from '@mcp-tools/core/src/utils/rich-text-validator';
import { 
  WhiteboardComment, 
  WhiteboardCommentWithReplies,
  CreateCommentRequest,
  UpdateCommentRequest,
  ResolveCommentRequest,
  CommentContentType,
  RichTextFormat,
  CommentStatus,
  CommentPriority,
  Point
} from '@shared/types/whiteboard';

export interface UseCommentSystemProps {
  whiteboardId: string;
  userId: string;
  enableMentions?: boolean;
  enableRichText?: boolean;
  enableRealTime?: boolean;
  optimisticUpdates?: boolean;
  cacheComments?: boolean;
  maxCacheSize?: number;
}

export interface CommentSystemState {
  comments: WhiteboardComment[];
  commentsMap: Map<string, WhiteboardComment>;
  threadMap: Map<string, WhiteboardCommentWithReplies>;
  isLoading: boolean;
  isSubmitting: boolean;
  error: Error | null;
  lastUpdated: number;
  optimisticOperations: Map<string, any>;
}

interface CommentOperation {
  id: string;
  type: 'create' | 'update' | 'delete' | 'resolve';
  commentId?: string;
  data: any;
  timestamp: number;
  userId: string;
}

interface CommentCache {
  data: WhiteboardComment[];
  timestamp: number;
  size: number;
}

const DEFAULT_MAX_CACHE_SIZE = 1000;
const CACHE_EXPIRY_TIME = 5 * 60 * 1000; // 5 minutes
const OPTIMISTIC_OPERATION_TIMEOUT = 10000; // 10 seconds

export const useCommentSystem = ({
  whiteboardId,
  userId,
  enableMentions = true,
  enableRichText = true,
  enableRealTime = true,
  optimisticUpdates = true,
  cacheComments = true,
  maxCacheSize = DEFAULT_MAX_CACHE_SIZE,
}: UseCommentSystemProps) => {
  // Refs for performance optimization
  const richTextValidatorRef = useRef<RichTextValidator>(new RichTextValidator());
  const cacheRef = useRef<Map<string, CommentCache>>(new Map());
  const operationTimeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  
  // State management
  const [state, setState] = useState<CommentSystemState>(() => ({
    comments: [],
    commentsMap: new Map(),
    threadMap: new Map(),
    isLoading: false,
    isSubmitting: false,
    error: null,
    lastUpdated: 0,
    optimisticOperations: new Map(),
  }));

  // Hook integrations
  const { socket, isConnected, sendMessage } = useWebSocket({
    url: process.env.NEXT_PUBLIC_WEBSOCKET_URL || 'ws://localhost:3001',
    autoConnect: enableRealTime,
  });

  const {
    extractMentions,
    resolveMentions,
    searchUsers,
  } = useMentionSystem({
    whiteboardId,
    userId,
    enabled: enableMentions,
  });

  const {
    subscribeToComments,
    unsubscribeFromComments,
    notifyMentionedUsers,
  } = useCommentNotifications({
    whiteboardId,
    userId,
  });

  // Cache management
  const getCachedComments = useCallback((cacheKey: string): WhiteboardComment[] | null => {
    if (!cacheComments) return null;
    
    const cached = cacheRef.current.get(cacheKey);
    if (!cached) return null;
    
    // Check if cache is expired
    if (Date.now() - cached.timestamp > CACHE_EXPIRY_TIME) {
      cacheRef.current.delete(cacheKey);
      return null;
    }
    
    return cached.data;
  }, [cacheComments]);

  const setCachedComments = useCallback((cacheKey: string, comments: WhiteboardComment[]) => {
    if (!cacheComments) return;
    
    // Enforce cache size limit
    if (cacheRef.current.size >= maxCacheSize) {
      const oldestKey = Array.from(cacheRef.current.keys())[0];
      cacheRef.current.delete(oldestKey);
    }
    
    cacheRef.current.set(cacheKey, {
      data: [...comments],
      timestamp: Date.now(),
      size: comments.length,
    });
  }, [cacheComments, maxCacheSize]);

  // WebSocket event handlers
  useEffect(() => {
    if (!socket || !enableRealTime) return;

    const handleCommentCreated = (data: { comment: WhiteboardComment }) => {
      setState(prev => {
        const updatedComments = [...prev.comments, data.comment];
        const updatedMap = new Map(prev.commentsMap);
        updatedMap.set(data.comment.id, data.comment);
        
        return {
          ...prev,
          comments: updatedComments,
          commentsMap: updatedMap,
          lastUpdated: Date.now(),
        };
      });
    };

    const handleCommentUpdated = (data: { comment: WhiteboardComment }) => {
      setState(prev => {
        const updatedComments = prev.comments.map(c => 
          c.id === data.comment.id ? data.comment : c
        );
        const updatedMap = new Map(prev.commentsMap);
        updatedMap.set(data.comment.id, data.comment);
        
        return {
          ...prev,
          comments: updatedComments,
          commentsMap: updatedMap,
          lastUpdated: Date.now(),
        };
      });
    };

    const handleCommentDeleted = (data: { commentId: string }) => {
      setState(prev => {
        const updatedComments = prev.comments.filter(c => c.id !== data.commentId);
        const updatedMap = new Map(prev.commentsMap);
        updatedMap.delete(data.commentId);
        
        return {
          ...prev,
          comments: updatedComments,
          commentsMap: updatedMap,
          lastUpdated: Date.now(),
        };
      });
    };

    const handleCommentResolved = (data: { commentId: string; resolved: boolean }) => {
      setState(prev => {
        const updatedComments = prev.comments.map(c => 
          c.id === data.commentId ? { ...c, resolved: data.resolved } : c
        );
        const updatedMap = new Map(prev.commentsMap);
        const comment = updatedMap.get(data.commentId);
        if (comment) {
          updatedMap.set(data.commentId, { ...comment, resolved: data.resolved });
        }
        
        return {
          ...prev,
          comments: updatedComments,
          commentsMap: updatedMap,
          lastUpdated: Date.now(),
        };
      });
    };

    socket.on('whiteboard:comment_created', handleCommentCreated);
    socket.on('whiteboard:comment_updated', handleCommentUpdated);
    socket.on('whiteboard:comment_deleted', handleCommentDeleted);
    socket.on('whiteboard:comment_resolved', handleCommentResolved);

    return () => {
      socket.off('whiteboard:comment_created', handleCommentCreated);
      socket.off('whiteboard:comment_updated', handleCommentUpdated);
      socket.off('whiteboard:comment_deleted', handleCommentDeleted);
      socket.off('whiteboard:comment_resolved', handleCommentResolved);
    };
  }, [socket, enableRealTime]);

  // Optimistic operation management
  const addOptimisticOperation = useCallback((operation: CommentOperation) => {
    if (!optimisticUpdates) return;

    setState(prev => {
      const updated = new Map(prev.optimisticOperations);
      updated.set(operation.id, operation);
      return { ...prev, optimisticOperations: updated };
    });

    // Set timeout to remove operation if not confirmed
    const timeout = setTimeout(() => {
      setState(prev => {
        const updated = new Map(prev.optimisticOperations);
        updated.delete(operation.id);
        return { ...prev, optimisticOperations: updated };
      });
    }, OPTIMISTIC_OPERATION_TIMEOUT);

    operationTimeoutsRef.current.set(operation.id, timeout);
  }, [optimisticUpdates]);

  const confirmOptimisticOperation = useCallback((operationId: string) => {
    const timeout = operationTimeoutsRef.current.get(operationId);
    if (timeout) {
      clearTimeout(timeout);
      operationTimeoutsRef.current.delete(operationId);
    }

    setState(prev => {
      const updated = new Map(prev.optimisticOperations);
      updated.delete(operationId);
      return { ...prev, optimisticOperations: updated };
    });
  }, []);

  // Load comments
  const loadComments = useCallback(async (refresh = false): Promise<void> => {
    const cacheKey = `comments-${whiteboardId}`;
    
    // Try cache first
    if (!refresh) {
      const cached = getCachedComments(cacheKey);
      if (cached) {
        setState(prev => ({
          ...prev,
          comments: cached,
          commentsMap: new Map(cached.map(c => [c.id, c])),
          lastUpdated: Date.now(),
        }));
        return;
      }
    }

    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const response = await fetch(`/api/whiteboards/${whiteboardId}/comments`);
      if (!response.ok) throw new Error('Failed to load comments');
      
      const data = await response.json();
      const comments: WhiteboardComment[] = data.comments || [];
      
      // Cache the results
      setCachedComments(cacheKey, comments);
      
      setState(prev => ({
        ...prev,
        comments,
        commentsMap: new Map(comments.map(c => [c.id, c])),
        isLoading: false,
        lastUpdated: Date.now(),
      }));

    } catch (error) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error : new Error('Unknown error'),
      }));
    }
  }, [whiteboardId, getCachedComments, setCachedComments]);

  // Create comment
  const createComment = useCallback(async (request: CreateCommentRequest): Promise<WhiteboardComment | null> => {
    setState(prev => ({ ...prev, isSubmitting: true, error: null }));

    try {
      // Validate content
      const validation = richTextValidatorRef.current.validateRichText(
        request.content,
        request.contentType || 'text',
        request.format,
        {
          preserveMentions: enableMentions,
          allowLinks: enableRichText,
          allowFormatting: enableRichText,
        }
      );

      if (!validation.isValid) {
        throw new Error(`Invalid content: ${validation.errors.join(', ')}`);
      }

      // Extract mentions if enabled
      let mentions: any[] = [];
      if (enableMentions) {
        mentions = await extractMentions(validation.sanitizedContent);
      }

      // Create optimistic comment for immediate UI update
      const optimisticComment: WhiteboardComment = {
        id: `temp-${Date.now()}`,
        whiteboardId,
        content: validation.sanitizedContent,
        contentType: request.contentType || 'text',
        format: validation.sanitizedFormat,
        createdBy: userId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        position: request.position,
        anchorPoint: request.anchorPoint,
        elementId: request.elementId,
        parentId: request.parentId,
        status: 'open',
        priority: request.priority || 'normal',
        resolved: false,
        mentions: mentions,
        threadMetadata: {
          depth: request.parentId ? 1 : 0,
          replyCount: 0,
          lastReplyAt: null,
          participantCount: 1,
        },
      };

      // Add optimistic operation
      if (optimisticUpdates) {
        const operation: CommentOperation = {
          id: `create-${optimisticComment.id}`,
          type: 'create',
          data: optimisticComment,
          timestamp: Date.now(),
          userId,
        };

        addOptimisticOperation(operation);

        setState(prev => ({
          ...prev,
          comments: [...prev.comments, optimisticComment],
          commentsMap: new Map(prev.commentsMap).set(optimisticComment.id, optimisticComment),
        }));
      }

      // Send real request
      const requestData = {
        ...request,
        content: validation.sanitizedContent,
        format: validation.sanitizedFormat,
        mentions,
      };

      const response = await fetch(`/api/whiteboards/${whiteboardId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData),
      });

      if (!response.ok) throw new Error('Failed to create comment');
      
      const result = await response.json();
      const createdComment: WhiteboardComment = result.comment;

      // Replace optimistic comment with real one
      setState(prev => {
        const updatedComments = prev.comments.map(c => 
          c.id === optimisticComment.id ? createdComment : c
        );
        const updatedMap = new Map(prev.commentsMap);
        updatedMap.delete(optimisticComment.id);
        updatedMap.set(createdComment.id, createdComment);
        
        return {
          ...prev,
          comments: updatedComments,
          commentsMap: updatedMap,
          isSubmitting: false,
        };
      });

      // Confirm optimistic operation
      if (optimisticUpdates) {
        confirmOptimisticOperation(`create-${optimisticComment.id}`);
      }

      // Send WebSocket notification
      if (socket && isConnected) {
        sendMessage('whiteboard:create_comment', requestData);
      }

      // Notify mentioned users
      if (mentions.length > 0) {
        notifyMentionedUsers(createdComment.id, mentions);
      }

      // Invalidate cache
      const cacheKey = `comments-${whiteboardId}`;
      cacheRef.current.delete(cacheKey);

      return createdComment;

    } catch (error) {
      setState(prev => ({
        ...prev,
        isSubmitting: false,
        error: error instanceof Error ? error : new Error('Failed to create comment'),
      }));
      return null;
    }
  }, [
    whiteboardId,
    userId,
    enableMentions,
    enableRichText,
    optimisticUpdates,
    extractMentions,
    addOptimisticOperation,
    confirmOptimisticOperation,
    socket,
    isConnected,
    sendMessage,
    notifyMentionedUsers,
  ]);

  // Update comment
  const updateComment = useCallback(async (
    commentId: string, 
    updates: UpdateCommentRequest
  ): Promise<WhiteboardComment | null> => {
    setState(prev => ({ ...prev, isSubmitting: true, error: null }));

    try {
      const existingComment = state.commentsMap.get(commentId);
      if (!existingComment) {
        throw new Error('Comment not found');
      }

      // Validate content if provided
      let validatedContent = updates.content;
      let validatedFormat = updates.format;
      
      if (updates.content) {
        const validation = richTextValidatorRef.current.validateRichText(
          updates.content,
          existingComment.contentType,
          updates.format,
          {
            preserveMentions: enableMentions,
            allowLinks: enableRichText,
            allowFormatting: enableRichText,
          }
        );

        if (!validation.isValid) {
          throw new Error(`Invalid content: ${validation.errors.join(', ')}`);
        }

        validatedContent = validation.sanitizedContent;
        validatedFormat = validation.sanitizedFormat;
      }

      // Extract mentions if content updated
      let mentions: any[] = existingComment.mentions || [];
      if (validatedContent && enableMentions) {
        mentions = await extractMentions(validatedContent);
      }

      const requestData = {
        ...updates,
        content: validatedContent,
        format: validatedFormat,
        mentions,
      };

      const response = await fetch(`/api/whiteboards/${whiteboardId}/comments/${commentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData),
      });

      if (!response.ok) throw new Error('Failed to update comment');
      
      const result = await response.json();
      const updatedComment: WhiteboardComment = result.comment;

      setState(prev => {
        const updatedComments = prev.comments.map(c => 
          c.id === commentId ? updatedComment : c
        );
        const updatedMap = new Map(prev.commentsMap);
        updatedMap.set(commentId, updatedComment);
        
        return {
          ...prev,
          comments: updatedComments,
          commentsMap: updatedMap,
          isSubmitting: false,
        };
      });

      // Send WebSocket notification
      if (socket && isConnected) {
        sendMessage('whiteboard:update_comment', { commentId, updates: requestData });
      }

      // Notify mentioned users if mentions changed
      if (mentions.length > 0) {
        notifyMentionedUsers(commentId, mentions);
      }

      return updatedComment;

    } catch (error) {
      setState(prev => ({
        ...prev,
        isSubmitting: false,
        error: error instanceof Error ? error : new Error('Failed to update comment'),
      }));
      return null;
    }
  }, [
    whiteboardId,
    state.commentsMap,
    enableMentions,
    enableRichText,
    extractMentions,
    socket,
    isConnected,
    sendMessage,
    notifyMentionedUsers,
  ]);

  // Delete comment
  const deleteComment = useCallback(async (commentId: string): Promise<boolean> => {
    setState(prev => ({ ...prev, isSubmitting: true, error: null }));

    try {
      const response = await fetch(`/api/whiteboards/${whiteboardId}/comments/${commentId}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete comment');

      setState(prev => {
        const updatedComments = prev.comments.filter(c => c.id !== commentId);
        const updatedMap = new Map(prev.commentsMap);
        updatedMap.delete(commentId);
        
        return {
          ...prev,
          comments: updatedComments,
          commentsMap: updatedMap,
          isSubmitting: false,
        };
      });

      // Send WebSocket notification
      if (socket && isConnected) {
        sendMessage('whiteboard:delete_comment', { commentId });
      }

      return true;

    } catch (error) {
      setState(prev => ({
        ...prev,
        isSubmitting: false,
        error: error instanceof Error ? error : new Error('Failed to delete comment'),
      }));
      return false;
    }
  }, [whiteboardId, socket, isConnected, sendMessage]);

  // Resolve comment
  const resolveComment = useCallback(async (commentId: string, resolved: boolean): Promise<boolean> => {
    setState(prev => ({ ...prev, isSubmitting: true, error: null }));

    try {
      const request: ResolveCommentRequest = { resolved };
      
      const response = await fetch(`/api/whiteboards/${whiteboardId}/comments/${commentId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });

      if (!response.ok) throw new Error('Failed to resolve comment');

      setState(prev => {
        const updatedComments = prev.comments.map(c => 
          c.id === commentId ? { ...c, resolved } : c
        );
        const updatedMap = new Map(prev.commentsMap);
        const comment = updatedMap.get(commentId);
        if (comment) {
          updatedMap.set(commentId, { ...comment, resolved });
        }
        
        return {
          ...prev,
          comments: updatedComments,
          commentsMap: updatedMap,
          isSubmitting: false,
        };
      });

      // Send WebSocket notification
      if (socket && isConnected) {
        sendMessage('whiteboard:resolve_comment', { commentId, resolved });
      }

      return true;

    } catch (error) {
      setState(prev => ({
        ...prev,
        isSubmitting: false,
        error: error instanceof Error ? error : new Error('Failed to resolve comment'),
      }));
      return false;
    }
  }, [whiteboardId, socket, isConnected, sendMessage]);

  // Get comment thread
  const getCommentThread = useCallback(async (commentId: string): Promise<WhiteboardCommentWithReplies | null> => {
    try {
      const response = await fetch(`/api/whiteboards/${whiteboardId}/comments/${commentId}/thread`);
      if (!response.ok) throw new Error('Failed to load comment thread');
      
      const result = await response.json();
      const thread: WhiteboardCommentWithReplies = result.thread;
      
      setState(prev => {
        const updatedThreadMap = new Map(prev.threadMap);
        updatedThreadMap.set(commentId, thread);
        return { ...prev, threadMap: updatedThreadMap };
      });
      
      return thread;

    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error : new Error('Failed to load thread'),
      }));
      return null;
    }
  }, [whiteboardId]);

  // Subscribe to comments on mount
  useEffect(() => {
    loadComments();
    if (enableRealTime) {
      subscribeToComments();
    }
    
    return () => {
      if (enableRealTime) {
        unsubscribeFromComments();
      }
    };
  }, [whiteboardId, loadComments, enableRealTime, subscribeToComments, unsubscribeFromComments]);

  // Memoized return value
  const returnValue = useMemo(() => ({
    // Data
    comments: state.comments,
    commentsMap: state.commentsMap,
    threadMap: state.threadMap,
    
    // State
    isLoading: state.isLoading,
    isSubmitting: state.isSubmitting,
    error: state.error,
    lastUpdated: state.lastUpdated,
    isConnected,
    
    // Actions
    loadComments,
    createComment,
    updateComment,
    deleteComment,
    resolveComment,
    getCommentThread,
    
    // Real-time
    subscribeToComments,
    unsubscribeFromComments,
  }), [
    state,
    isConnected,
    loadComments,
    createComment,
    updateComment,
    deleteComment,
    resolveComment,
    getCommentThread,
    subscribeToComments,
    unsubscribeFromComments,
  ]);

  return returnValue;
};