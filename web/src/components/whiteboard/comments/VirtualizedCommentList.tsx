/**
 * Virtualized Comment List Component
 * 
 * Efficiently renders large numbers of comments (100+) using virtualization,
 * viewport culling, and optimized re-rendering patterns to prevent UI freezes.
 */

import React, { 
  useMemo, 
  useCallback, 
  useRef, 
  useEffect, 
  useState,
  memo 
} from 'react';
import { FixedSizeList as VirtualList, areEqual } from 'react-window';
import { AutoSizer } from 'react-virtualized-auto-sizer';
import { WhiteboardComment } from '@shared/types/whiteboard';
import { CommentThread } from './CommentThread';
import { CommentInput } from './CommentInput';
import { LoadingSpinner } from '../../common/LoadingSpinner';
import { ErrorBoundary } from '../../common/ErrorBoundary';

interface VirtualizedCommentListProps {
  comments: WhiteboardComment[];
  whiteboardId: string;
  userId: string;
  onCommentCreate: (comment: Partial<WhiteboardComment>) => Promise<void>;
  onCommentUpdate: (commentId: string, updates: Partial<WhiteboardComment>) => Promise<void>;
  onCommentDelete: (commentId: string) => Promise<void>;
  onCommentResolve: (commentId: string, resolved: boolean) => Promise<void>;
  isLoading?: boolean;
  error?: string | null;
  searchQuery?: string;
  filterOptions?: {
    showResolved?: boolean;
    status?: string[];
    priority?: string[];
    createdBy?: string;
  };
  sortBy?: 'createdAt' | 'updatedAt' | 'priority' | 'status';
  sortOrder?: 'asc' | 'desc';
  className?: string;
}

interface CommentListItem {
  id: string;
  comment: WhiteboardComment;
  type: 'comment' | 'thread-root';
  depth: number;
  hasReplies: boolean;
  isVisible: boolean;
}

// Performance constants
const ITEM_HEIGHT = 120; // Estimated height per comment item
const OVERSCAN_COUNT = 5; // Number of items to render outside viewport
const DEBOUNCE_DELAY = 150; // Debounce delay for search/filter updates
const MAX_VISIBLE_ITEMS = 1000; // Hard limit to prevent performance issues

// Memoized comment item component to prevent unnecessary re-renders
const CommentItem = memo<{
  index: number;
  style: React.CSSProperties;
  data: {
    items: CommentListItem[];
    onCommentUpdate: (commentId: string, updates: Partial<WhiteboardComment>) => Promise<void>;
    onCommentDelete: (commentId: string) => Promise<void>;
    onCommentResolve: (commentId: string, resolved: boolean) => Promise<void>;
    whiteboardId: string;
    userId: string;
  };
}>(({ index, style, data }) => {
  const { items, onCommentUpdate, onCommentDelete, onCommentResolve, whiteboardId, userId } = data;
  const item = items[index];

  if (!item) {
    return (
      <div style={style} className="comment-item-placeholder">
        <div className="animate-pulse bg-gray-200 h-16 rounded-lg" />
      </div>
    );
  }

  return (
    <div 
      style={style} 
      className="comment-item-container"
      data-comment-id={item.id}
    >
      <CommentThread
        comment={item.comment}
        depth={item.depth}
        isCollapsed={false}
        onUpdate={onCommentUpdate}
        onDelete={onCommentDelete}
        onResolve={onCommentResolve}
        className={`ml-${item.depth * 4} transition-all duration-200`}
      />
    </div>
  );
}, areEqual);

CommentItem.displayName = 'CommentItem';

export const VirtualizedCommentList: React.FC<VirtualizedCommentListProps> = ({
  comments,
  whiteboardId,
  userId,
  onCommentCreate,
  onCommentUpdate,
  onCommentDelete,
  onCommentResolve,
  isLoading = false,
  error = null,
  searchQuery = '',
  filterOptions = {},
  sortBy = 'createdAt',
  sortOrder = 'desc',
  className = '',
}) => {
  const [searchDebounced, setSearchDebounced] = useState(searchQuery);
  const [isSearching, setIsSearching] = useState(false);
  const listRef = useRef<VirtualList>(null);
  const [scrollOffset, setScrollOffset] = useState(0);

  // Debounce search query to prevent excessive filtering
  useEffect(() => {
    setIsSearching(true);
    const timer = setTimeout(() => {
      setSearchDebounced(searchQuery);
      setIsSearching(false);
    }, DEBOUNCE_DELAY);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Process and filter comments with memoization for performance
  const processedItems = useMemo(() => {
    let filteredComments = [...comments];

    // Apply search filter
    if (searchDebounced.trim()) {
      const query = searchDebounced.toLowerCase();
      filteredComments = filteredComments.filter(comment => 
        comment.content.toLowerCase().includes(query) ||
        comment.tags?.some(tag => tag.toLowerCase().includes(query)) ||
        comment.metadata?.title?.toLowerCase().includes(query)
      );
    }

    // Apply status filter
    if (filterOptions.status && filterOptions.status.length > 0) {
      filteredComments = filteredComments.filter(comment => 
        filterOptions.status!.includes(comment.status)
      );
    }

    // Apply priority filter
    if (filterOptions.priority && filterOptions.priority.length > 0) {
      filteredComments = filteredComments.filter(comment => 
        filterOptions.priority!.includes(comment.priority)
      );
    }

    // Apply resolved filter
    if (filterOptions.showResolved === false) {
      filteredComments = filteredComments.filter(comment => !comment.resolved);
    }

    // Apply creator filter
    if (filterOptions.createdBy) {
      filteredComments = filteredComments.filter(comment => 
        comment.createdBy === filterOptions.createdBy
      );
    }

    // Sort comments
    filteredComments.sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case 'createdAt':
          comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
        case 'updatedAt':
          comparison = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
          break;
        case 'priority':
          const priorityOrder = { urgent: 4, high: 3, medium: 2, low: 1 };
          comparison = (priorityOrder[a.priority as keyof typeof priorityOrder] || 0) - 
                      (priorityOrder[b.priority as keyof typeof priorityOrder] || 0);
          break;
        case 'status':
          comparison = a.status.localeCompare(b.status);
          break;
        default:
          comparison = 0;
      }
      
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    // Build thread hierarchy and flatten for virtualization
    const threadRoots = filteredComments.filter(comment => !comment.parentId);
    const threadMap = new Map<string, WhiteboardComment[]>();
    
    // Group replies by parent
    filteredComments.forEach(comment => {
      if (comment.parentId) {
        if (!threadMap.has(comment.parentId)) {
          threadMap.set(comment.parentId, []);
        }
        threadMap.get(comment.parentId)!.push(comment);
      }
    });

    // Flatten threads into a virtualization-friendly structure
    const items: CommentListItem[] = [];
    
    const addCommentAndReplies = (comment: WhiteboardComment, depth = 0) => {
      // Add the comment itself
      const replies = threadMap.get(comment.id) || [];
      items.push({
        id: comment.id,
        comment,
        type: depth === 0 ? 'thread-root' : 'comment',
        depth,
        hasReplies: replies.length > 0,
        isVisible: true,
      });

      // Add replies recursively (limit depth to prevent infinite nesting)
      if (depth < 5) {
        replies
          .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
          .forEach(reply => addCommentAndReplies(reply, depth + 1));
      }
    };

    // Process all thread roots
    threadRoots.forEach(comment => addCommentAndReplies(comment));

    // Limit items for performance
    return items.slice(0, MAX_VISIBLE_ITEMS);
  }, [
    comments,
    searchDebounced,
    filterOptions,
    sortBy,
    sortOrder,
  ]);

  // Scroll to comment functionality
  const scrollToComment = useCallback((commentId: string) => {
    const index = processedItems.findIndex(item => item.id === commentId);
    if (index !== -1 && listRef.current) {
      listRef.current.scrollToItem(index, 'center');
    }
  }, [processedItems]);

  // Memoized list data to prevent unnecessary re-renders
  const listData = useMemo(() => ({
    items: processedItems,
    onCommentUpdate,
    onCommentDelete,
    onCommentResolve,
    whiteboardId,
    userId,
  }), [
    processedItems,
    onCommentUpdate,
    onCommentDelete,
    onCommentResolve,
    whiteboardId,
    userId,
  ]);

  // Handle scroll events for performance monitoring
  const handleScroll = useCallback(({ scrollOffset: newOffset }: { scrollOffset: number }) => {
    setScrollOffset(newOffset);
  }, []);

  // Calculate dynamic item height based on content
  const getItemHeight = useCallback((index: number) => {
    const item = processedItems[index];
    if (!item) return ITEM_HEIGHT;
    
    // Estimate height based on content length and depth
    const baseHeight = 80;
    const contentHeight = Math.ceil(item.comment.content.length / 100) * 20;
    const depthPadding = item.depth * 16;
    const repliesHeight = item.hasReplies ? 20 : 0;
    
    return Math.min(baseHeight + contentHeight + depthPadding + repliesHeight, 300);
  }, [processedItems]);

  if (error) {
    return (
      <div className={`comment-list-error p-4 ${className}`}>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 className="text-red-800 font-medium">Error Loading Comments</h3>
          <p className="text-red-600 mt-1">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary
      fallback={
        <div className="comment-list-error p-4">
          <p className="text-gray-600">Failed to render comments. Please refresh the page.</p>
        </div>
      }
    >
      <div className={`virtualized-comment-list h-full flex flex-col ${className}`}>
        {/* Comment input for new comments */}
        <div className="comment-input-container p-4 border-b border-gray-200">
          <CommentInput
            whiteboardId={whiteboardId}
            onCreate={onCommentCreate}
            placeholder="Add a comment..."
            className="w-full"
          />
        </div>

        {/* Loading state */}
        {isLoading && (
          <div className="loading-container flex items-center justify-center p-8">
            <LoadingSpinner size="md" />
            <span className="ml-2 text-gray-600">Loading comments...</span>
          </div>
        )}

        {/* Search indicator */}
        {isSearching && (
          <div className="search-indicator p-2 bg-blue-50 border-b border-blue-200">
            <div className="flex items-center text-blue-600">
              <LoadingSpinner size="sm" />
              <span className="ml-2 text-sm">Searching...</span>
            </div>
          </div>
        )}

        {/* Comment count and stats */}
        <div className="comment-stats p-3 bg-gray-50 border-b border-gray-200 text-sm text-gray-600">
          <div className="flex justify-between items-center">
            <span>
              {processedItems.length} comment{processedItems.length !== 1 ? 's' : ''} 
              {searchDebounced && ` matching "${searchDebounced}"`}
            </span>
            {processedItems.length >= MAX_VISIBLE_ITEMS && (
              <span className="text-yellow-600 font-medium">
                Showing first {MAX_VISIBLE_ITEMS} comments
              </span>
            )}
          </div>
        </div>

        {/* Virtualized comment list */}
        <div className="comment-list-container flex-1">
          {processedItems.length === 0 ? (
            <div className="empty-state flex flex-col items-center justify-center h-full p-8 text-gray-500">
              <div className="text-6xl mb-4">💬</div>
              <h3 className="text-lg font-medium mb-2">No comments yet</h3>
              <p className="text-center">
                {searchDebounced 
                  ? `No comments match "${searchDebounced}"` 
                  : 'Be the first to add a comment!'
                }
              </p>
            </div>
          ) : (
            <AutoSizer>
              {({ height, width }) => (
                <VirtualList
                  ref={listRef}
                  height={height}
                  width={width}
                  itemCount={processedItems.length}
                  itemSize={ITEM_HEIGHT}
                  itemData={listData}
                  overscanCount={OVERSCAN_COUNT}
                  onScroll={handleScroll}
                  className="virtualized-list"
                >
                  {CommentItem}
                </VirtualList>
              )}
            </AutoSizer>
          )}
        </div>

        {/* Performance debug info (development only) */}
        {process.env.NODE_ENV === 'development' && (
          <div className="debug-info p-2 bg-gray-100 border-t text-xs text-gray-500">
            Items: {processedItems.length} | 
            Scroll: {scrollOffset}px | 
            Memory: {Math.round(performance.memory?.usedJSHeapSize / 1024 / 1024 || 0)}MB
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
};

export default VirtualizedCommentList;