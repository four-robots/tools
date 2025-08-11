/**
 * Whiteboard Comments Component
 * 
 * Displays and manages collaborative comments on whiteboards.
 */

'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { 
  MessageCircle, 
  MessageSquare,
  Reply, 
  Check, 
  X, 
  MoreVertical, 
  Search,
  Filter,
  Users,
  Eye,
  EyeOff,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { WhiteboardComment } from './utils/collaboration-events';
import { useWhiteboardComments } from './hooks/useWhiteboardComments';
import { getUserColor, getContrastingTextColor } from './utils/presence-utils';
import { formatDistanceToNow } from 'date-fns';

interface WhiteboardCommentsProps {
  comments: WhiteboardComment[];
  whiteboardId: string;
  userId: string;
  onAddComment: (content: string, position: { x: number; y: number }, elementId?: string) => void;
  onReplyToComment: (commentId: string, content: string) => void;
  onResolveComment: (commentId: string, resolved: boolean) => void;
  onDeleteComment: (commentId: string) => void;
  className?: string;
}

interface CommentItemProps {
  comment: WhiteboardComment;
  userId: string;
  onReply: (content: string) => void;
  onResolve: (resolved: boolean) => void;
  onDelete: () => void;
  onReplyContentChange: (content: string) => void;
  replyContent: string;
  isActive: boolean;
  canEdit: boolean;
  canResolve: boolean;
  hasReplyInput: boolean;
  onStartReply: () => void;
  onCancelReply: () => void;
}

// Individual comment component
const CommentItem: React.FC<CommentItemProps> = ({
  comment,
  userId,
  onReply,
  onResolve,
  onDelete,
  onReplyContentChange,
  replyContent,
  isActive,
  canEdit,
  canResolve,
  hasReplyInput,
  onStartReply,
  onCancelReply,
}) => {
  const replyInputRef = useRef<HTMLTextAreaElement>(null);
  const userColor = getUserColor(comment.author.id);
  const textColor = getContrastingTextColor(userColor);

  useEffect(() => {
    if (hasReplyInput && replyInputRef.current) {
      replyInputRef.current.focus();
    }
  }, [hasReplyInput]);

  const handleReplySubmit = () => {
    if (replyContent.trim()) {
      onReply(replyContent.trim());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleReplySubmit();
    } else if (e.key === 'Escape') {
      onCancelReply();
    }
  };

  return (
    <Card className={`transition-all duration-200 ${isActive ? 'ring-2 ring-blue-500' : ''}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <Avatar className="h-6 w-6">
              <AvatarImage src={`/api/avatars/${comment.author.id}`} alt={comment.author.name} />
              <AvatarFallback 
                className="text-xs"
                style={{
                  backgroundColor: userColor,
                  color: textColor,
                }}
              >
                {comment.author.name.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium truncate">
                  {comment.author.name}
                </span>
                {comment.resolved && (
                  <Badge variant="secondary" className="text-xs">
                    <Check className="h-3 w-3 mr-1" />
                    Resolved
                  </Badge>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
              </div>
            </div>
          </div>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                <MoreVertical className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onStartReply}>
                <Reply className="h-4 w-4 mr-2" />
                Reply
              </DropdownMenuItem>
              {canResolve && (
                <DropdownMenuItem onClick={() => onResolve(!comment.resolved)}>
                  {comment.resolved ? (
                    <>
                      <X className="h-4 w-4 mr-2" />
                      Unresolve
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4 mr-2" />
                      Resolve
                    </>
                  )}
                </DropdownMenuItem>
              )}
              {canEdit && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    onClick={onDelete}
                    className="text-destructive focus:text-destructive"
                  >
                    <X className="h-4 w-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        <div className="text-sm text-gray-900 whitespace-pre-wrap mb-3">
          {comment.content}
        </div>

        {/* Replies */}
        {comment.replies && comment.replies.length > 0 && (
          <div className="space-y-2 border-l-2 border-gray-100 pl-3 ml-3">
            {comment.replies.map(reply => (
              <div key={reply.id} className="bg-gray-50 rounded p-2">
                <div className="flex items-center gap-2 mb-1">
                  <Avatar className="h-4 w-4">
                    <AvatarImage src={`/api/avatars/${reply.author.id}`} alt={reply.author.name} />
                    <AvatarFallback 
                      className="text-xs"
                      style={{
                        backgroundColor: getUserColor(reply.author.id),
                        color: getContrastingTextColor(getUserColor(reply.author.id)),
                      }}
                    >
                      {reply.author.name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-xs font-medium">{reply.author.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(reply.createdAt), { addSuffix: true })}
                  </span>
                </div>
                <div className="text-xs text-gray-800 whitespace-pre-wrap">
                  {reply.content}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Reply input */}
        {hasReplyInput && (
          <div className="mt-3 pt-3 border-t">
            <Textarea
              ref={replyInputRef}
              value={replyContent}
              onChange={(e) => onReplyContentChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Write a reply..."
              className="min-h-[60px] text-sm resize-none"
            />
            <div className="flex justify-end gap-2 mt-2">
              <Button variant="outline" size="sm" onClick={onCancelReply}>
                Cancel
              </Button>
              <Button 
                size="sm" 
                onClick={handleReplySubmit}
                disabled={!replyContent.trim()}
              >
                Reply
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

// New comment input component
interface NewCommentInputProps {
  position: { x: number; y: number };
  content: string;
  onContentChange: (content: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

const NewCommentInput: React.FC<NewCommentInputProps> = ({
  position,
  content,
  onContentChange,
  onSubmit,
  onCancel,
}) => {
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      onSubmit();
    } else if (e.key === 'Escape') {
      onCancel();
    }
  };

  return (
    <div
      className="fixed z-50 bg-white border border-gray-200 rounded-lg shadow-lg p-3 w-80"
      style={{
        left: position.x,
        top: position.y,
      }}
    >
      <Textarea
        ref={inputRef}
        value={content}
        onChange={(e) => onContentChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Add a comment..."
        className="min-h-[80px] text-sm resize-none border-none p-0 focus-visible:ring-0"
      />
      <div className="flex justify-end gap-2 mt-2 pt-2 border-t">
        <Button variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button 
          size="sm" 
          onClick={onSubmit}
          disabled={!content.trim()}
        >
          Comment
        </Button>
      </div>
    </div>
  );
};

// Main comments component
export const WhiteboardComments: React.FC<WhiteboardCommentsProps> = ({
  comments,
  whiteboardId,
  userId,
  onAddComment,
  onReplyToComment,
  onResolveComment,
  onDeleteComment,
  className = '',
}) => {
  const commentsHook = useWhiteboardComments(comments, {
    whiteboardId,
    userId,
    onAddComment,
    onReplyToComment,
    onResolveComment,
    onDeleteComment,
  });

  const {
    comments: filteredComments,
    commentStats,
    showComments,
    showResolved,
    activeCommentId,
    newCommentPosition,
    newCommentContent,
    setNewCommentContent,
    startNewComment,
    cancelNewComment,
    addComment,
    setActiveComment,
    toggleCommentResolution,
    deleteComment,
    setReplyContent,
    addReply,
    cancelReply,
    getReplyContent,
    hasReplyInput,
    toggleCommentsVisibility,
    toggleResolvedComments,
    setUserFilter,
    setSearchQuery,
    clearFilters,
    canEditComment,
    canResolveComment,
    isCommentActive,
    filterByUser,
    searchQuery,
    hasActiveFilters,
    handleKeyDown,
  } = commentsHook;

  // Get unique users for filter dropdown
  const uniqueUsers = React.useMemo(() => {
    const users = new Map();
    comments.forEach(comment => {
      users.set(comment.author.id, comment.author);
    });
    return Array.from(users.values());
  }, [comments]);

  return (
    <TooltipProvider>
      <div className={`flex flex-col h-full ${className}`}>
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4" />
            <span className="font-medium">Comments</span>
            <Badge variant="secondary" className="text-xs">
              {commentStats.total}
            </Badge>
          </div>
          
          <div className="flex items-center gap-1">
            {/* Show/hide resolved toggle */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={showResolved ? "default" : "outline"}
                  size="sm"
                  onClick={toggleResolvedComments}
                  className="h-7 w-7 p-0"
                >
                  {showResolved ? (
                    <Eye className="h-3 w-3" />
                  ) : (
                    <EyeOff className="h-3 w-3" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {showResolved ? 'Hide resolved' : 'Show resolved'}
              </TooltipContent>
            </Tooltip>

            {/* Filter dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant={hasActiveFilters ? "default" : "outline"}
                  size="sm"
                  className="h-7 w-7 p-0"
                >
                  <Filter className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <div className="p-2">
                  <Input
                    placeholder="Search comments..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-7 text-xs"
                  />
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setUserFilter(null)}>
                  <Users className="h-4 w-4 mr-2" />
                  All users
                </DropdownMenuItem>
                {uniqueUsers.map(user => (
                  <DropdownMenuItem
                    key={user.id}
                    onClick={() => setUserFilter(user.id)}
                  >
                    <Avatar className="h-4 w-4 mr-2">
                      <AvatarFallback className="text-xs">
                        {user.name.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    {user.name}
                    {filterByUser === user.id && (
                      <Check className="h-3 w-3 ml-auto" />
                    )}
                  </DropdownMenuItem>
                ))}
                {hasActiveFilters && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={clearFilters}>
                      <X className="h-4 w-4 mr-2" />
                      Clear filters
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Stats */}
        {commentStats.total > 0 && (
          <div className="flex items-center gap-4 px-3 py-2 bg-gray-50 text-xs text-gray-600">
            <span>{commentStats.total} total</span>
            <span>{commentStats.unresolved} unresolved</span>
            <span>{commentStats.myComments} mine</span>
          </div>
        )}

        {/* Comments list */}
        <div className="flex-1 overflow-y-auto">
          {filteredComments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
              <MessageSquare className="h-8 w-8 text-gray-400 mb-2" />
              <p className="text-sm text-gray-500 mb-1">
                {comments.length === 0 ? 'No comments yet' : 'No comments match your filters'}
              </p>
              <p className="text-xs text-gray-400">
                {comments.length === 0 
                  ? 'Click on the canvas to add the first comment' 
                  : 'Try adjusting your search or filters'
                }
              </p>
            </div>
          ) : (
            <div className="p-3 space-y-3">
              {filteredComments.map(comment => (
                <CommentItem
                  key={comment.id}
                  comment={comment}
                  userId={userId}
                  onReply={(content) => addReply(comment.id)}
                  onResolve={(resolved) => toggleCommentResolution(comment.id, !resolved)}
                  onDelete={() => deleteComment(comment.id)}
                  onReplyContentChange={(content) => setReplyContent(comment.id, content)}
                  replyContent={getReplyContent(comment.id)}
                  isActive={isCommentActive(comment.id)}
                  canEdit={canEditComment(comment)}
                  canResolve={canResolveComment(comment)}
                  hasReplyInput={hasReplyInput(comment.id)}
                  onStartReply={() => setReplyContent(comment.id, '')}
                  onCancelReply={() => cancelReply(comment.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* New comment input overlay */}
      {newCommentPosition && (
        <NewCommentInput
          position={newCommentPosition}
          content={newCommentContent}
          onContentChange={setNewCommentContent}
          onSubmit={addComment}
          onCancel={cancelNewComment}
        />
      )}
    </TooltipProvider>
  );
};

export default WhiteboardComments;