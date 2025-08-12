/**
 * useCommentThreading Hook
 * 
 * Specialized hook for managing parent-child comment relationships,
 * thread expansion/collapse, reply ordering, and nested thread navigation.
 * 
 * Features:
 * - Parent-child relationship management
 * - Thread expansion and collapse state
 * - Reply ordering and pagination
 * - Nested thread navigation with depth limits
 * - Thread metadata tracking (participant count, last reply, etc.)
 * - Optimized rendering for large thread trees
 * - Thread search and filtering
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useCommentSystem } from './useCommentSystem';
import { 
  WhiteboardComment, 
  WhiteboardCommentWithReplies,
  CommentThreadMetadata,
  CommentSortOrder 
} from '@shared/types/whiteboard';

export interface UseCommentThreadingProps {
  commentId: string;
  whiteboardId: string;
  userId: string;
  maxDepth?: number;
  autoExpand?: boolean;
  sortOrder?: CommentSortOrder;
  pageSize?: number;
}

export interface ThreadNode {
  comment: WhiteboardComment;
  replies: ThreadNode[];
  depth: number;
  isExpanded: boolean;
  isLoaded: boolean;
  hasMoreReplies: boolean;
  parentId: string | null;
  children: string[];
  metadata: CommentThreadMetadata;
}

interface ThreadState {
  rootComment: WhiteboardCommentWithReplies | null;
  threadTree: Map<string, ThreadNode>;
  expandedNodes: Set<string>;
  loadedPages: Map<string, number>;
  isLoading: boolean;
  error: Error | null;
  totalComments: number;
  maxDepthReached: boolean;
}

interface ThreadNavigation {
  currentComment: string | null;
  previousComment: string | null;
  nextComment: string | null;
  parentComment: string | null;
  siblingComments: string[];
  childComments: string[];
}

const DEFAULT_MAX_DEPTH = 5;
const DEFAULT_PAGE_SIZE = 10;
const DEFAULT_SORT_ORDER: CommentSortOrder = 'chronological';

export const useCommentThreading = ({
  commentId,
  whiteboardId,
  userId,
  maxDepth = DEFAULT_MAX_DEPTH,
  autoExpand = false,
  sortOrder = DEFAULT_SORT_ORDER,
  pageSize = DEFAULT_PAGE_SIZE,
}: UseCommentThreadingProps) => {
  // Refs for performance
  const threadCacheRef = useRef<Map<string, WhiteboardCommentWithReplies>>(new Map());
  const expansionStateRef = useRef<Map<string, boolean>>(new Map());

  // State management
  const [state, setState] = useState<ThreadState>(() => ({
    rootComment: null,
    threadTree: new Map(),
    expandedNodes: new Set(autoExpand ? [commentId] : []),
    loadedPages: new Map(),
    isLoading: false,
    error: null,
    totalComments: 0,
    maxDepthReached: false,
  }));

  const [navigation, setNavigation] = useState<ThreadNavigation>({
    currentComment: null,
    previousComment: null,
    nextComment: null,
    parentComment: null,
    siblingComments: [],
    childComments: [],
  });

  // Hook integrations
  const {
    getCommentThread,
    commentsMap,
    isLoading: systemLoading,
  } = useCommentSystem({
    whiteboardId,
    userId,
  });

  // Build thread tree from flat comment structure
  const buildThreadTree = useCallback((
    comments: WhiteboardComment[],
    rootId: string
  ): Map<string, ThreadNode> => {
    const tree = new Map<string, ThreadNode>();
    const commentsByParent = new Map<string, WhiteboardComment[]>();

    // Group comments by parent
    comments.forEach(comment => {
      const parentId = comment.parentId || 'root';
      if (!commentsByParent.has(parentId)) {
        commentsByParent.set(parentId, []);
      }
      commentsByParent.get(parentId)!.push(comment);
    });

    // Sort comments within each group
    commentsByParent.forEach((siblings) => {
      siblings.sort((a, b) => {
        switch (sortOrder) {
          case 'chronological':
            return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          case 'reverse_chronological':
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
          case 'priority':
            const priorityOrder = { urgent: 0, high: 1, normal: 2, low: 3 };
            const aPriority = priorityOrder[a.priority] ?? 2;
            const bPriority = priorityOrder[b.priority] ?? 2;
            return aPriority - bPriority;
          default:
            return 0;
        }
      });
    });

    // Build tree recursively
    const buildNode = (comment: WhiteboardComment, depth: number): ThreadNode => {
      const children = commentsByParent.get(comment.id) || [];
      const childNodes = depth < maxDepth 
        ? children.map(child => buildNode(child, depth + 1))
        : [];

      const node: ThreadNode = {
        comment,
        replies: childNodes,
        depth,
        isExpanded: state.expandedNodes.has(comment.id),
        isLoaded: true,
        hasMoreReplies: children.length > pageSize,
        parentId: comment.parentId,
        children: children.map(c => c.id),
        metadata: comment.threadMetadata || {
          depth,
          replyCount: children.length,
          lastReplyAt: children.length > 0 
            ? children[children.length - 1].createdAt 
            : null,
          participantCount: new Set([comment.createdBy, ...children.map(c => c.createdBy)]).size,
        },
      };

      tree.set(comment.id, node);
      return node;
    };

    // Find root comment and build from there
    const rootComment = comments.find(c => c.id === rootId);
    if (rootComment) {
      buildNode(rootComment, 0);
    }

    return tree;
  }, [maxDepth, sortOrder, pageSize, state.expandedNodes]);

  // Load thread data
  const loadThread = useCallback(async (refresh = false): Promise<void> => {
    // Check cache first
    if (!refresh && threadCacheRef.current.has(commentId)) {
      const cached = threadCacheRef.current.get(commentId)!;
      setState(prev => ({
        ...prev,
        rootComment: cached,
        threadTree: buildThreadTree([cached, ...flattenReplies(cached.replies)], commentId),
        totalComments: countTotalComments(cached),
        isLoading: false,
      }));
      return;
    }

    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const thread = await getCommentThread(commentId);
      if (!thread) {
        throw new Error('Thread not found');
      }

      // Cache the thread
      threadCacheRef.current.set(commentId, thread);

      // Build tree structure
      const allComments = [thread, ...flattenReplies(thread.replies)];
      const tree = buildThreadTree(allComments, commentId);

      setState(prev => ({
        ...prev,
        rootComment: thread,
        threadTree: tree,
        totalComments: allComments.length,
        maxDepthReached: hasMaxDepthReached(tree, maxDepth),
        isLoading: false,
      }));

    } catch (error) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error : new Error('Failed to load thread'),
      }));
    }
  }, [commentId, getCommentThread, buildThreadTree, maxDepth]);

  // Expand thread node
  const expandThread = useCallback(async (nodeId: string): Promise<void> => {
    setState(prev => {
      const newExpanded = new Set(prev.expandedNodes);
      newExpanded.add(nodeId);
      return { ...prev, expandedNodes: newExpanded };
    });

    expansionStateRef.current.set(nodeId, true);

    // Load more replies if needed
    const node = state.threadTree.get(nodeId);
    if (node && node.hasMoreReplies && !node.isLoaded) {
      await loadMoreReplies(nodeId);
    }
  }, [state.threadTree]);

  // Collapse thread node
  const collapseThread = useCallback((nodeId: string): void => {
    setState(prev => {
      const newExpanded = new Set(prev.expandedNodes);
      newExpanded.delete(nodeId);
      return { ...prev, expandedNodes: newExpanded };
    });

    expansionStateRef.current.set(nodeId, false);
  }, []);

  // Load more replies for a specific node
  const loadMoreReplies = useCallback(async (nodeId: string): Promise<void> => {
    const currentPage = state.loadedPages.get(nodeId) || 0;
    const nextPage = currentPage + 1;

    try {
      const response = await fetch(
        `/api/whiteboards/${whiteboardId}/comments/${nodeId}/replies?page=${nextPage}&limit=${pageSize}&sort=${sortOrder}`
      );
      
      if (!response.ok) throw new Error('Failed to load replies');
      
      const data = await response.json();
      const newReplies: WhiteboardComment[] = data.replies || [];

      if (newReplies.length > 0) {
        setState(prev => {
          const updatedPages = new Map(prev.loadedPages);
          updatedPages.set(nodeId, nextPage);

          // Update thread tree with new replies
          const updatedTree = new Map(prev.threadTree);
          const node = updatedTree.get(nodeId);
          
          if (node) {
            const updatedNode = {
              ...node,
              children: [...node.children, ...newReplies.map(r => r.id)],
              hasMoreReplies: newReplies.length === pageSize,
              metadata: {
                ...node.metadata,
                replyCount: node.metadata.replyCount + newReplies.length,
                lastReplyAt: newReplies[newReplies.length - 1]?.createdAt || node.metadata.lastReplyAt,
              },
            };
            updatedTree.set(nodeId, updatedNode);

            // Add new reply nodes to tree
            newReplies.forEach(reply => {
              const replyNode: ThreadNode = {
                comment: reply,
                replies: [],
                depth: node.depth + 1,
                isExpanded: false,
                isLoaded: true,
                hasMoreReplies: false,
                parentId: nodeId,
                children: [],
                metadata: reply.threadMetadata || {
                  depth: node.depth + 1,
                  replyCount: 0,
                  lastReplyAt: null,
                  participantCount: 1,
                },
              };
              updatedTree.set(reply.id, replyNode);
            });
          }

          return {
            ...prev,
            threadTree: updatedTree,
            loadedPages: updatedPages,
            totalComments: prev.totalComments + newReplies.length,
          };
        });
      }

    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error : new Error('Failed to load replies'),
      }));
    }
  }, [whiteboardId, pageSize, sortOrder, state.loadedPages]);

  // Navigate to specific comment in thread
  const navigateToComment = useCallback((targetCommentId: string): void => {
    const node = state.threadTree.get(targetCommentId);
    if (!node) return;

    // Ensure parent path is expanded
    let currentNode = node;
    const pathToExpand: string[] = [];
    
    while (currentNode.parentId) {
      pathToExpand.unshift(currentNode.parentId);
      currentNode = state.threadTree.get(currentNode.parentId)!;
    }

    // Expand all nodes in path
    setState(prev => {
      const newExpanded = new Set(prev.expandedNodes);
      pathToExpand.forEach(id => newExpanded.add(id));
      return { ...prev, expandedNodes: newExpanded };
    });

    // Update navigation state
    const siblings = getSiblingComments(targetCommentId);
    const currentIndex = siblings.indexOf(targetCommentId);
    
    setNavigation({
      currentComment: targetCommentId,
      previousComment: currentIndex > 0 ? siblings[currentIndex - 1] : null,
      nextComment: currentIndex < siblings.length - 1 ? siblings[currentIndex + 1] : null,
      parentComment: node.parentId,
      siblingComments: siblings,
      childComments: node.children,
    });
  }, [state.threadTree]);

  // Get sibling comments for navigation
  const getSiblingComments = useCallback((commentId: string): string[] => {
    const node = state.threadTree.get(commentId);
    if (!node || !node.parentId) return [commentId];

    const parent = state.threadTree.get(node.parentId);
    return parent ? parent.children : [commentId];
  }, [state.threadTree]);

  // Check if a node is expanded
  const isExpanded = useCallback((nodeId: string): boolean => {
    return state.expandedNodes.has(nodeId);
  }, [state.expandedNodes]);

  // Check if a node has more replies to load
  const hasMoreReplies = useCallback((nodeId: string): boolean => {
    const node = state.threadTree.get(nodeId);
    return node ? node.hasMoreReplies : false;
  }, [state.threadTree]);

  // Get thread statistics
  const getThreadStats = useCallback(() => {
    const participants = new Set<string>();
    let maxDepthFound = 0;
    let totalReplies = 0;

    state.threadTree.forEach(node => {
      participants.add(node.comment.createdBy);
      maxDepthFound = Math.max(maxDepthFound, node.depth);
      if (node.depth > 0) totalReplies++;
    });

    return {
      totalComments: state.totalComments,
      totalReplies,
      participantCount: participants.size,
      maxDepth: maxDepthFound,
      participants: Array.from(participants),
    };
  }, [state.threadTree, state.totalComments]);

  // Load thread on mount and when commentId changes
  useEffect(() => {
    loadThread();
  }, [commentId, loadThread]);

  // Memoized return value
  const returnValue = useMemo(() => ({
    // Data
    thread: state.rootComment,
    threadTree: state.threadTree,
    totalComments: state.totalComments,
    
    // State
    isLoading: state.isLoading || systemLoading,
    error: state.error,
    maxDepthReached: state.maxDepthReached,
    
    // Navigation
    navigation,
    navigateToComment,
    getSiblingComments,
    
    // Thread control
    expandThread,
    collapseThread,
    isExpanded,
    loadMoreReplies,
    hasMoreReplies,
    
    // Utilities
    getThreadStats,
    loadThread,
  }), [
    state,
    systemLoading,
    navigation,
    navigateToComment,
    getSiblingComments,
    expandThread,
    collapseThread,
    isExpanded,
    loadMoreReplies,
    hasMoreReplies,
    getThreadStats,
    loadThread,
  ]);

  return returnValue;
};

// Utility functions
function flattenReplies(replies: WhiteboardCommentWithReplies[]): WhiteboardComment[] {
  const flattened: WhiteboardComment[] = [];
  
  replies.forEach(reply => {
    flattened.push(reply);
    if (reply.replies && reply.replies.length > 0) {
      flattened.push(...flattenReplies(reply.replies));
    }
  });
  
  return flattened;
}

function countTotalComments(thread: WhiteboardCommentWithReplies): number {
  let count = 1; // Count the root comment
  
  if (thread.replies) {
    thread.replies.forEach(reply => {
      count += countTotalComments(reply);
    });
  }
  
  return count;
}

function hasMaxDepthReached(tree: Map<string, ThreadNode>, maxDepth: number): boolean {
  for (const node of tree.values()) {
    if (node.depth >= maxDepth) {
      return true;
    }
  }
  return false;
}