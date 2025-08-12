/**
 * CommentNotificationSystem Component
 * 
 * Comprehensive notification system for comment mentions, activity feed,
 * unread indicators, and notification preferences management.
 * 
 * Features:
 * - @mention notifications with real-time delivery
 * - Comment activity feed with filtering
 * - Unread comment indicators and badges
 * - Notification preferences and settings
 * - Toast notifications for immediate alerts
 * - Push notification integration
 * - Notification history and persistence
 * - Cross-workspace notification routing
 */

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { formatDistanceToNow } from 'date-fns';
import { UserAvatar } from '../UserAvatar';
import { useCommentNotifications } from '../hooks/useCommentNotifications';
import { useNotificationPreferences } from '../hooks/useNotificationPreferences';
import { CommentNotification, NotificationType, NotificationPreferences } from '@shared/types/whiteboard';

export interface CommentNotificationSystemProps {
  whiteboardId: string;
  userId: string;
  // Display configuration
  showToasts?: boolean;
  showBadges?: boolean;
  showActivityFeed?: boolean;
  maxToastNotifications?: number;
  toastDuration?: number;
  // Behavior configuration
  enablePushNotifications?: boolean;
  enableEmailNotifications?: boolean;
  enableDesktopNotifications?: boolean;
  // Event handlers
  onNotificationClick?: (notification: CommentNotification) => void;
  onNotificationDismiss?: (notificationId: string) => void;
  onPreferencesChange?: (preferences: NotificationPreferences) => void;
}

interface ToastNotification {
  id: string;
  notification: CommentNotification;
  timestamp: number;
  isVisible: boolean;
  isRemoving: boolean;
}

interface ActivityFeedFilter {
  types: NotificationType[];
  dateRange: 'today' | 'week' | 'month' | 'all';
  workspaces: string[];
  users: string[];
  showRead: boolean;
}

const DEFAULT_TOAST_DURATION = 5000; // 5 seconds
const MAX_TOAST_NOTIFICATIONS = 3;
const ACTIVITY_FEED_PAGE_SIZE = 20;

export const CommentNotificationSystem: React.FC<CommentNotificationSystemProps> = ({
  whiteboardId,
  userId,
  showToasts = true,
  showBadges = true,
  showActivityFeed = false,
  maxToastNotifications = MAX_TOAST_NOTIFICATIONS,
  toastDuration = DEFAULT_TOAST_DURATION,
  enablePushNotifications = true,
  enableDesktopNotifications = true,
  enableEmailNotifications = false,
  onNotificationClick,
  onNotificationDismiss,
  onPreferencesChange,
}) => {
  // Refs
  const toastContainerRef = useRef<HTMLDivElement>(null);
  const activityFeedRef = useRef<HTMLDivElement>(null);

  // State management
  const [toastNotifications, setToastNotifications] = useState<ToastNotification[]>([]);
  const [showNotificationCenter, setShowNotificationCenter] = useState(false);
  const [activityFilter, setActivityFilter] = useState<ActivityFeedFilter>({
    types: ['mention', 'reply', 'comment_resolved', 'comment_updated'],
    dateRange: 'week',
    workspaces: [],
    users: [],
    showRead: false,
  });
  const [selectedNotification, setSelectedNotification] = useState<string | null>(null);

  // Hook integrations
  const {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    dismissNotification,
    getNotificationHistory,
    subscribeToNotifications,
    unsubscribeFromNotifications,
    isLoading: notificationsLoading,
    error: notificationsError,
  } = useCommentNotifications({
    whiteboardId,
    userId,
    enableRealTime: true,
  });

  const {
    preferences,
    updatePreferences,
    isLoading: preferencesLoading,
  } = useNotificationPreferences({
    userId,
  });

  // Filter notifications for activity feed
  const filteredNotifications = useMemo(() => {
    if (!notifications) return [];

    return notifications.filter(notification => {
      // Filter by type
      if (!activityFilter.types.includes(notification.type)) return false;

      // Filter by date range
      const notificationDate = new Date(notification.createdAt);
      const now = new Date();
      
      switch (activityFilter.dateRange) {
        case 'today':
          if (notificationDate.toDateString() !== now.toDateString()) return false;
          break;
        case 'week':
          const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          if (notificationDate < weekAgo) return false;
          break;
        case 'month':
          const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          if (notificationDate < monthAgo) return false;
          break;
      }

      // Filter by workspace
      if (activityFilter.workspaces.length > 0 && 
          !activityFilter.workspaces.includes(notification.workspaceId)) return false;

      // Filter by users
      if (activityFilter.users.length > 0 && 
          !activityFilter.users.includes(notification.triggeredBy)) return false;

      // Filter by read status
      if (!activityFilter.showRead && notification.readAt) return false;

      return true;
    });
  }, [notifications, activityFilter]);

  // Subscribe to notifications
  useEffect(() => {
    subscribeToNotifications();
    return () => unsubscribeFromNotifications();
  }, [subscribeToNotifications, unsubscribeFromNotifications]);

  // Handle new notifications
  useEffect(() => {
    if (!notifications) return;

    const newNotifications = notifications.filter(
      n => !n.readAt && !toastNotifications.some(t => t.notification.id === n.id)
    );

    newNotifications.forEach(notification => {
      // Check preferences
      const shouldShowToast = preferences?.toastNotifications && 
        preferences.notificationTypes[notification.type];

      if (shouldShowToast && showToasts) {
        showToastNotification(notification);
      }

      // Request desktop notification permission and show
      if (enableDesktopNotifications && preferences?.desktopNotifications &&
          preferences.notificationTypes[notification.type]) {
        showDesktopNotification(notification);
      }
    });
  }, [notifications, preferences, showToasts, enableDesktopNotifications]);

  // Toast notification management
  const showToastNotification = useCallback((notification: CommentNotification) => {
    const toastId = `toast-${notification.id}-${Date.now()}`;
    
    setToastNotifications(prev => {
      const newToasts = [
        ...prev.slice(-(maxToastNotifications - 1)), // Keep only the most recent
        {
          id: toastId,
          notification,
          timestamp: Date.now(),
          isVisible: true,
          isRemoving: false,
        },
      ];
      return newToasts;
    });

    // Auto-remove toast after duration
    setTimeout(() => {
      removeToastNotification(toastId);
    }, toastDuration);
  }, [maxToastNotifications, toastDuration]);

  const removeToastNotification = useCallback((toastId: string) => {
    setToastNotifications(prev => 
      prev.map(toast => 
        toast.id === toastId 
          ? { ...toast, isRemoving: true }
          : toast
      )
    );

    // Actually remove after animation
    setTimeout(() => {
      setToastNotifications(prev => prev.filter(toast => toast.id !== toastId));
    }, 300);
  }, []);

  // Desktop notification
  const showDesktopNotification = useCallback((notification: CommentNotification) => {
    if ('Notification' in window && Notification.permission === 'granted') {
      const title = getNotificationTitle(notification);
      const body = getNotificationBody(notification);
      
      const desktopNotification = new Notification(title, {
        body,
        icon: '/favicon.ico', // App icon
        tag: notification.id, // Prevent duplicates
      });

      desktopNotification.onclick = () => {
        onNotificationClick?.(notification);
        markAsRead(notification.id);
        desktopNotification.close();
      };

      // Auto-close after duration
      setTimeout(() => {
        desktopNotification.close();
      }, toastDuration);
    }
  }, [onNotificationClick, markAsRead, toastDuration]);

  // Request desktop notification permission
  const requestNotificationPermission = useCallback(async () => {
    if ('Notification' in window && Notification.permission === 'default') {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    }
    return Notification.permission === 'granted';
  }, []);

  // Handle notification click
  const handleNotificationClick = useCallback((notification: CommentNotification) => {
    markAsRead(notification.id);
    onNotificationClick?.(notification);
    setSelectedNotification(notification.id);
  }, [markAsRead, onNotificationClick]);

  // Handle notification dismiss
  const handleNotificationDismiss = useCallback((notificationId: string) => {
    dismissNotification(notificationId);
    onNotificationDismiss?.(notificationId);
  }, [dismissNotification, onNotificationDismiss]);

  // Handle filter changes
  const handleFilterChange = useCallback((updates: Partial<ActivityFeedFilter>) => {
    setActivityFilter(prev => ({ ...prev, ...updates }));
  }, []);

  // Toggle notification center
  const toggleNotificationCenter = useCallback(() => {
    setShowNotificationCenter(prev => !prev);
  }, []);

  // Render toast notification
  const renderToastNotification = useCallback((toast: ToastNotification) => {
    const { notification } = toast;
    
    return (
      <div
        key={toast.id}
        className={`mb-2 bg-white rounded-lg shadow-lg border border-gray-200 p-4 max-w-sm transition-all duration-300 ${
          toast.isRemoving ? 'opacity-0 transform translate-x-full' : 'opacity-100 transform translate-x-0'
        }`}
      >
        <div className="flex items-start space-x-3">
          <UserAvatar
            userId={notification.triggeredBy}
            userName={notification.triggeredByName || 'Unknown User'}
            size="sm"
            showStatus
            isOnline={true} // TODO: Get actual status
          />
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-900">
                {getNotificationTitle(notification)}
              </p>
              <button
                onClick={() => removeToastNotification(toast.id)}
                className="ml-2 text-gray-400 hover:text-gray-600"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
            
            <p className="text-sm text-gray-600 mt-1">
              {getNotificationBody(notification)}
            </p>
            
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-gray-500">
                {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
              </span>
              
              <button
                onClick={() => handleNotificationClick(notification)}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium"
              >
                View
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }, [handleNotificationClick, removeToastNotification]);

  // Render notification badge
  const renderNotificationBadge = useCallback(() => {
    if (!showBadges || unreadCount === 0) return null;

    return (
      <div
        className="fixed top-4 right-4 z-50 cursor-pointer"
        onClick={toggleNotificationCenter}
      >
        <div className="relative">
          <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white shadow-lg hover:bg-blue-700 transition-colors">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
            </svg>
          </div>
          
          {unreadCount > 0 && (
            <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-xs text-white font-medium">
              {unreadCount > 99 ? '99+' : unreadCount}
            </div>
          )}
        </div>
      </div>
    );
  }, [showBadges, unreadCount, toggleNotificationCenter]);

  // Render activity feed
  const renderActivityFeed = useCallback(() => {
    if (!showActivityFeed && !showNotificationCenter) return null;

    return (
      <div
        ref={activityFeedRef}
        className={`fixed top-0 right-0 h-full w-96 bg-white shadow-xl border-l border-gray-200 z-40 transform transition-transform duration-300 ${
          showNotificationCenter ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium text-gray-900">Notifications</h2>
            <div className="flex items-center space-x-2">
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="text-sm text-blue-600 hover:text-blue-800"
                >
                  Mark all read
                </button>
              )}
              <button
                onClick={toggleNotificationCenter}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="px-4 py-2 border-b border-gray-100">
          <div className="flex items-center space-x-2 text-sm">
            <select
              value={activityFilter.dateRange}
              onChange={(e) => handleFilterChange({ dateRange: e.target.value as any })}
              className="text-xs border border-gray-300 rounded px-2 py-1"
            >
              <option value="today">Today</option>
              <option value="week">This week</option>
              <option value="month">This month</option>
              <option value="all">All time</option>
            </select>
            
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={activityFilter.showRead}
                onChange={(e) => handleFilterChange({ showRead: e.target.checked })}
                className="mr-1"
              />
              <span className="text-xs">Show read</span>
            </label>
          </div>
        </div>

        {/* Notification list */}
        <div className="flex-1 overflow-y-auto">
          {notificationsLoading ? (
            <div className="p-4 text-center">
              <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full mx-auto"></div>
              <p className="text-sm text-gray-500 mt-2">Loading notifications...</p>
            </div>
          ) : filteredNotifications.length === 0 ? (
            <div className="p-4 text-center">
              <p className="text-sm text-gray-500">No notifications found</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {filteredNotifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`p-4 hover:bg-gray-50 cursor-pointer ${
                    !notification.readAt ? 'bg-blue-50 border-l-2 border-blue-500' : ''
                  } ${selectedNotification === notification.id ? 'bg-gray-100' : ''}`}
                  onClick={() => handleNotificationClick(notification)}
                >
                  <div className="flex items-start space-x-3">
                    <UserAvatar
                      userId={notification.triggeredBy}
                      userName={notification.triggeredByName || 'Unknown User'}
                      size="sm"
                    />
                    
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">
                        {getNotificationTitle(notification)}
                      </p>
                      <p className="text-sm text-gray-600 mt-1">
                        {getNotificationBody(notification)}
                      </p>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-xs text-gray-500">
                          {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                        </span>
                        {!notification.readAt && (
                          <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                        )}
                      </div>
                    </div>
                    
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleNotificationDismiss(notification.id);
                      }}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }, [
    showActivityFeed,
    showNotificationCenter,
    unreadCount,
    markAllAsRead,
    toggleNotificationCenter,
    activityFilter,
    handleFilterChange,
    notificationsLoading,
    filteredNotifications,
    selectedNotification,
    handleNotificationClick,
    handleNotificationDismiss,
  ]);

  return (
    <>
      {/* Toast notifications */}
      {showToasts && createPortal(
        <div
          ref={toastContainerRef}
          className="fixed top-4 right-4 z-50 space-y-2"
          style={{ maxWidth: '384px' }}
        >
          {toastNotifications.map(renderToastNotification)}
        </div>,
        document.body
      )}

      {/* Notification badge */}
      {renderNotificationBadge()}

      {/* Activity feed */}
      {createPortal(renderActivityFeed(), document.body)}

      {/* Overlay for closing notification center */}
      {showNotificationCenter && createPortal(
        <div
          className="fixed inset-0 bg-black bg-opacity-25 z-30"
          onClick={toggleNotificationCenter}
        />,
        document.body
      )}
    </>
  );
};

// Utility functions
function getNotificationTitle(notification: CommentNotification): string {
  switch (notification.type) {
    case 'mention':
      return `${notification.triggeredByName} mentioned you`;
    case 'reply':
      return `${notification.triggeredByName} replied to your comment`;
    case 'comment_resolved':
      return `${notification.triggeredByName} resolved a comment`;
    case 'comment_updated':
      return `${notification.triggeredByName} updated a comment`;
    case 'comment_created':
      return `${notification.triggeredByName} added a comment`;
    default:
      return 'New comment activity';
  }
}

function getNotificationBody(notification: CommentNotification): string {
  const content = notification.commentContent;
  const truncated = content.length > 100 ? content.substring(0, 100) + '...' : content;
  
  switch (notification.type) {
    case 'mention':
      return `"${truncated}"`;
    case 'reply':
      return `"${truncated}"`;
    case 'comment_resolved':
      return `Comment: "${truncated}"`;
    case 'comment_updated':
      return `Updated content: "${truncated}"`;
    case 'comment_created':
      return `"${truncated}"`;
    default:
      return truncated;
  }
}

export default CommentNotificationSystem;