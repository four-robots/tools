/**
 * CommentActivityIndicator Component
 * 
 * Real-time activity awareness system showing typing indicators, user presence
 * in comment threads, and live activity indicators for collaborative commenting.
 * 
 * Features:
 * - Typing indicators for active comment composition
 * - User presence in specific comment threads
 * - Real-time activity awareness (viewing, editing, replying)
 * - Activity animations and visual feedback
 * - Performance optimized for multiple concurrent users
 * - Activity timeout and cleanup management
 */

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { UserAvatar, UserAvatarGroup } from '../UserAvatar';
import { useCommentActivity } from '../hooks/useCommentActivity';
import { useUserPresence } from '../hooks/useUserPresence';
import { CommentActivity, ActivityType, Point } from '@shared/types/whiteboard';

export interface CommentActivityIndicatorProps {
  whiteboardId: string;
  commentAnchors?: Array<{
    id: string;
    comment: any;
    screenPosition: Point;
    isVisible: boolean;
    isActive: boolean;
    zIndex: number;
  }>;
  // Display configuration
  showTypingIndicators?: boolean;
  showPresenceIndicators?: boolean;
  showActivityAnimations?: boolean;
  maxVisibleUsers?: number;
  activityTimeout?: number;
  // Performance configuration
  updateInterval?: number;
  throttleUpdates?: boolean;
  // Event handlers
  onActivityChange?: (commentId: string, activity: CommentActivity[]) => void;
}

interface TypingUser {
  userId: string;
  userName: string;
  commentId: string;
  startedAt: number;
  lastUpdate: number;
  isTyping: boolean;
}

interface CommentPresence {
  commentId: string;
  users: Array<{
    userId: string;
    userName: string;
    activity: ActivityType;
    timestamp: number;
    avatarUrl?: string;
  }>;
  lastUpdate: number;
}

interface ActivityAnimation {
  id: string;
  type: 'typing' | 'viewing' | 'replying';
  position: Point;
  userId: string;
  startTime: number;
  duration: number;
}

const DEFAULT_ACTIVITY_TIMEOUT = 30000; // 30 seconds
const DEFAULT_UPDATE_INTERVAL = 1000; // 1 second
const TYPING_INDICATOR_TIMEOUT = 3000; // 3 seconds
const ANIMATION_DURATION = 2000; // 2 seconds

export const CommentActivityIndicator: React.FC<CommentActivityIndicatorProps> = ({
  whiteboardId,
  commentAnchors = [],
  showTypingIndicators = true,
  showPresenceIndicators = true,
  showActivityAnimations = true,
  maxVisibleUsers = 3,
  activityTimeout = DEFAULT_ACTIVITY_TIMEOUT,
  updateInterval = DEFAULT_UPDATE_INTERVAL,
  throttleUpdates = true,
  onActivityChange,
}) => {
  // Refs
  const cleanupTimeoutRef = useRef<NodeJS.Timeout>();
  const updateIntervalRef = useRef<NodeJS.Timeout>();

  // State management
  const [typingUsers, setTypingUsers] = useState<Map<string, TypingUser>>(new Map());
  const [commentPresence, setCommentPresence] = useState<Map<string, CommentPresence>>(new Map());
  const [activityAnimations, setActivityAnimations] = useState<ActivityAnimation[]>([]);
  const [lastCleanup, setLastCleanup] = useState(Date.now());

  // Hook integrations
  const {
    activity,
    startActivity,
    stopActivity,
    subscribeToActivity,
    unsubscribeFromActivity,
    isLoading: activityLoading,
  } = useCommentActivity({
    whiteboardId,
    enabled: true,
    updateInterval: throttleUpdates ? updateInterval : 500,
  });

  const {
    onlineUsers,
    getUserPresence,
    isUserOnline,
  } = useUserPresence();

  // Process activity data
  const processedActivity = useMemo(() => {
    if (!activity) return new Map<string, CommentActivity[]>();

    const activityByComment = new Map<string, CommentActivity[]>();
    
    activity.forEach(act => {
      if (!activityByComment.has(act.commentId)) {
        activityByComment.set(act.commentId, []);
      }
      activityByComment.get(act.commentId)!.push(act);
    });

    return activityByComment;
  }, [activity]);

  // Subscribe to activity updates
  useEffect(() => {
    subscribeToActivity();
    return () => unsubscribeFromActivity();
  }, [subscribeToActivity, unsubscribeFromActivity]);

  // Process activity updates
  useEffect(() => {
    if (!activity) return;

    const now = Date.now();
    const newTypingUsers = new Map<string, TypingUser>();
    const newCommentPresence = new Map<string, CommentPresence>();

    // Process each activity
    activity.forEach(act => {
      const isRecent = (now - new Date(act.timestamp).getTime()) < activityTimeout;
      if (!isRecent) return;

      // Handle typing indicators
      if (act.type === 'typing' && showTypingIndicators) {
        const key = `${act.userId}-${act.commentId}`;
        newTypingUsers.set(key, {
          userId: act.userId,
          userName: act.userName || 'Unknown User',
          commentId: act.commentId,
          startedAt: new Date(act.timestamp).getTime(),
          lastUpdate: now,
          isTyping: true,
        });
      }

      // Handle presence indicators
      if (showPresenceIndicators) {
        if (!newCommentPresence.has(act.commentId)) {
          newCommentPresence.set(act.commentId, {
            commentId: act.commentId,
            users: [],
            lastUpdate: now,
          });
        }

        const presence = newCommentPresence.get(act.commentId)!;
        const existingUserIndex = presence.users.findIndex(u => u.userId === act.userId);

        if (existingUserIndex >= 0) {
          presence.users[existingUserIndex] = {
            userId: act.userId,
            userName: act.userName || 'Unknown User',
            activity: act.type,
            timestamp: new Date(act.timestamp).getTime(),
            avatarUrl: act.userAvatar,
          };
        } else {
          presence.users.push({
            userId: act.userId,
            userName: act.userName || 'Unknown User',
            activity: act.type,
            timestamp: new Date(act.timestamp).getTime(),
            avatarUrl: act.userAvatar,
          });
        }
      }

      // Handle activity animations
      if (showActivityAnimations && act.type !== 'idle') {
        const anchor = commentAnchors.find(a => a.id === act.commentId);
        if (anchor && anchor.isVisible) {
          const animationId = `${act.userId}-${act.commentId}-${act.type}-${act.timestamp}`;
          
          setActivityAnimations(prev => {
            // Avoid duplicates
            if (prev.some(a => a.id === animationId)) return prev;
            
            return [...prev, {
              id: animationId,
              type: act.type as any,
              position: anchor.screenPosition,
              userId: act.userId,
              startTime: now,
              duration: ANIMATION_DURATION,
            }].slice(-10); // Keep only recent animations
          });
        }
      }
    });

    setTypingUsers(newTypingUsers);
    setCommentPresence(newCommentPresence);

    // Notify parent of activity changes
    newCommentPresence.forEach((presence, commentId) => {
      const activities = processedActivity.get(commentId) || [];
      onActivityChange?.(commentId, activities);
    });

  }, [activity, activityTimeout, showTypingIndicators, showPresenceIndicators, showActivityAnimations, commentAnchors, processedActivity, onActivityChange]);

  // Cleanup expired data
  useEffect(() => {
    const cleanup = () => {
      const now = Date.now();

      // Clean up expired typing users
      setTypingUsers(prev => {
        const updated = new Map(prev);
        for (const [key, user] of updated.entries()) {
          if ((now - user.lastUpdate) > TYPING_INDICATOR_TIMEOUT) {
            updated.delete(key);
          }
        }
        return updated;
      });

      // Clean up expired presence data
      setCommentPresence(prev => {
        const updated = new Map(prev);
        for (const [commentId, presence] of updated.entries()) {
          const filteredUsers = presence.users.filter(
            user => (now - user.timestamp) < activityTimeout
          );
          
          if (filteredUsers.length === 0) {
            updated.delete(commentId);
          } else {
            updated.set(commentId, {
              ...presence,
              users: filteredUsers,
              lastUpdate: now,
            });
          }
        }
        return updated;
      });

      // Clean up expired animations
      setActivityAnimations(prev => 
        prev.filter(animation => (now - animation.startTime) < animation.duration)
      );

      setLastCleanup(now);
    };

    if (updateIntervalRef.current) {
      clearInterval(updateIntervalRef.current);
    }

    updateIntervalRef.current = setInterval(cleanup, updateInterval);
    cleanup(); // Run immediately

    return () => {
      if (updateIntervalRef.current) {
        clearInterval(updateIntervalRef.current);
      }
    };
  }, [updateInterval, activityTimeout]);

  // Render typing indicator for a specific comment
  const renderTypingIndicator = useCallback((commentId: string, position: Point) => {
    const typingUsersForComment = Array.from(typingUsers.values())
      .filter(user => user.commentId === commentId && user.isTyping);

    if (typingUsersForComment.length === 0) return null;

    return (
      <div
        className="absolute z-50 bg-white rounded-full shadow-lg border border-gray-200 px-3 py-2 flex items-center space-x-2"
        style={{
          left: position.x + 30,
          top: position.y - 10,
        }}
      >
        {typingUsersForComment.slice(0, maxVisibleUsers).map((user, index) => (
          <UserAvatar
            key={user.userId}
            userId={user.userId}
            userName={user.userName}
            size="xs"
            showStatus
            isOnline={isUserOnline(user.userId)}
          />
        ))}
        
        <div className="flex items-center space-x-1">
          <span className="text-xs text-gray-600">
            {typingUsersForComment.length === 1 
              ? `${typingUsersForComment[0].userName} is typing`
              : `${typingUsersForComment.length} users typing`
            }
          </span>
          
          {/* Typing animation dots */}
          <div className="flex space-x-1">
            <div className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
            <div className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
            <div className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
          </div>
        </div>
      </div>
    );
  }, [typingUsers, maxVisibleUsers, isUserOnline]);

  // Render presence indicator for a specific comment
  const renderPresenceIndicator = useCallback((commentId: string, position: Point) => {
    const presence = commentPresence.get(commentId);
    if (!presence || presence.users.length === 0) return null;

    const onlineUsers = presence.users.filter(user => isUserOnline(user.userId));
    
    return (
      <div
        className="absolute z-40"
        style={{
          left: position.x - 5,
          top: position.y + 25,
        }}
      >
        <UserAvatarGroup
          users={onlineUsers.map(user => ({
            userId: user.userId,
            userName: user.userName,
            avatar: user.avatarUrl,
            status: isUserOnline(user.userId) ? 'online' : 'offline',
          }))}
          size="xs"
          maxVisible={maxVisibleUsers}
          showStatus
          spacing="tight"
        />
        
        {onlineUsers.length > 0 && (
          <div className="text-xs text-gray-500 text-center mt-1">
            {onlineUsers.length === 1 
              ? `${onlineUsers[0].userName}`
              : `${onlineUsers.length} users active`
            }
          </div>
        )}
      </div>
    );
  }, [commentPresence, isUserOnline, maxVisibleUsers]);

  // Render activity animation
  const renderActivityAnimation = useCallback((animation: ActivityAnimation) => {
    const progress = Math.min((Date.now() - animation.startTime) / animation.duration, 1);
    const opacity = 1 - progress;
    const scale = 0.8 + (0.2 * (1 - progress));

    const animationIcon = {
      typing: '✏️',
      viewing: '👁️',
      replying: '💬',
    }[animation.type];

    return (
      <div
        key={animation.id}
        className="absolute z-30 pointer-events-none"
        style={{
          left: animation.position.x + 15,
          top: animation.position.y - 20,
          opacity,
          transform: `scale(${scale}) translateY(${-progress * 20}px)`,
          transition: 'all 0.1s ease-out',
        }}
      >
        <div className="bg-blue-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs shadow-lg">
          {animationIcon}
        </div>
      </div>
    );
  }, []);

  return (
    <div className="absolute inset-0 pointer-events-none">
      {/* Typing indicators */}
      {showTypingIndicators && commentAnchors.map(anchor => 
        renderTypingIndicator(anchor.id, anchor.screenPosition)
      )}

      {/* Presence indicators */}
      {showPresenceIndicators && commentAnchors.map(anchor => 
        renderPresenceIndicator(anchor.id, anchor.screenPosition)
      )}

      {/* Activity animations */}
      {showActivityAnimations && activityAnimations.map(renderActivityAnimation)}

      {/* Debug info (development only) */}
      {process.env.NODE_ENV === 'development' && (
        <div className="fixed bottom-4 left-4 bg-black bg-opacity-75 text-white p-2 rounded text-xs">
          <div>Active users: {Array.from(typingUsers.keys()).length}</div>
          <div>Comments with presence: {commentPresence.size}</div>
          <div>Active animations: {activityAnimations.length}</div>
          <div>Last cleanup: {formatDistanceToNow(lastCleanup, { addSuffix: true })}</div>
        </div>
      )}
    </div>
  );
};

export default CommentActivityIndicator;