/**
 * User Avatar Component
 * 
 * Consistent avatar system with:
 * - Automatic fallback to initials
 * - Consistent color generation from user ID
 * - Status indicators (online, idle, away, offline)
 * - Multiple sizes and styles
 * - Accessibility features
 * - Hover animations
 */

'use client';

import React, { useMemo, useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Circle } from 'lucide-react';
import { cn } from '@/lib/utils';

export type UserStatus = 'online' | 'idle' | 'away' | 'busy' | 'offline';
export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';

export interface UserAvatarProps {
  // User information
  userId: string;
  userName: string;
  userEmail?: string;
  avatar?: string;
  initials?: string;
  
  // Styling
  size?: AvatarSize;
  color?: string; // Override color
  showStatus?: boolean;
  status?: UserStatus;
  customStatus?: string;
  
  // Interaction
  onClick?: () => void;
  onStatusClick?: () => void;
  showTooltip?: boolean;
  tooltipSide?: 'top' | 'right' | 'bottom' | 'left';
  
  // Appearance
  className?: string;
  shadow?: boolean;
  border?: boolean;
  pulse?: boolean; // Animated pulse effect
  
  // Accessibility
  'aria-label'?: string;
}

const sizeClasses: Record<AvatarSize, {
  avatar: string;
  status: string;
  statusOffset: string;
  font: string;
}> = {
  xs: {
    avatar: 'h-6 w-6',
    status: 'w-2 h-2',
    statusOffset: '-bottom-0 -right-0',
    font: 'text-xs',
  },
  sm: {
    avatar: 'h-8 w-8',
    status: 'w-2.5 h-2.5',
    statusOffset: '-bottom-0.5 -right-0.5',
    font: 'text-xs',
  },
  md: {
    avatar: 'h-10 w-10',
    status: 'w-3 h-3',
    statusOffset: '-bottom-0.5 -right-0.5',
    font: 'text-sm',
  },
  lg: {
    avatar: 'h-12 w-12',
    status: 'w-4 h-4',
    statusOffset: '-bottom-1 -right-1',
    font: 'text-base',
  },
  xl: {
    avatar: 'h-16 w-16',
    status: 'w-5 h-5',
    statusOffset: '-bottom-1 -right-1',
    font: 'text-lg',
  },
  '2xl': {
    avatar: 'h-20 w-20',
    status: 'w-6 h-6',
    statusOffset: '-bottom-1.5 -right-1.5',
    font: 'text-xl',
  },
};

const statusColors: Record<UserStatus, string> = {
  online: 'bg-green-500',
  idle: 'bg-yellow-500',
  away: 'bg-orange-500',
  busy: 'bg-red-500',
  offline: 'bg-gray-400',
};

const statusLabels: Record<UserStatus, string> = {
  online: 'Online',
  idle: 'Idle',
  away: 'Away',
  busy: 'Busy',
  offline: 'Offline',
};

export const UserAvatar: React.FC<UserAvatarProps> = ({
  userId,
  userName,
  userEmail,
  avatar,
  initials: providedInitials,
  size = 'md',
  color,
  showStatus = false,
  status = 'online',
  customStatus,
  onClick,
  onStatusClick,
  showTooltip = true,
  tooltipSide = 'top',
  className,
  shadow = false,
  border = false,
  pulse = false,
  'aria-label': ariaLabel,
}) => {
  const [imageError, setImageError] = useState(false);
  
  // Generate consistent color from userId
  const avatarColor = useMemo(() => {
    if (color) return color;
    return generateUserColor(userId);
  }, [userId, color]);
  
  // Generate initials from userName
  const initials = useMemo(() => {
    if (providedInitials) return providedInitials;
    return generateInitials(userName);
  }, [userName, providedInitials]);
  
  // Get contrasting text color
  const textColor = useMemo(() => {
    return getContrastingTextColor(avatarColor);
  }, [avatarColor]);
  
  // Size classes
  const sizes = sizeClasses[size];
  
  // Handle image error
  const handleImageError = () => {
    setImageError(true);
  };
  
  // Click handlers
  const handleClick = () => {
    if (onClick) onClick();
  };
  
  const handleStatusClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onStatusClick) onStatusClick();
  };
  
  // Avatar component
  const AvatarComponent = (
    <div 
      className={cn(
        'relative inline-flex',
        onClick && 'cursor-pointer',
        pulse && 'animate-pulse',
        className
      )}
      onClick={handleClick}
    >
      <Avatar
        className={cn(
          sizes.avatar,
          shadow && 'shadow-sm',
          border && 'ring-2 ring-white',
          onClick && 'hover:scale-105 transition-transform duration-200',
          'select-none'
        )}
      >
        {avatar && !imageError && (
          <AvatarImage
            src={avatar}
            alt={ariaLabel || `${userName}'s avatar`}
            onError={handleImageError}
            className="object-cover"
          />
        )}
        <AvatarFallback
          className={cn(
            'font-medium',
            sizes.font
          )}
          style={{
            backgroundColor: avatarColor,
            color: textColor,
          }}
        >
          {initials}
        </AvatarFallback>
      </Avatar>
      
      {/* Status indicator */}
      {showStatus && (
        <div
          className={cn(
            'absolute rounded-full border-2 border-white shadow-sm',
            sizes.status,
            sizes.statusOffset,
            statusColors[status],
            onStatusClick && 'cursor-pointer hover:scale-110 transition-transform duration-200'
          )}
          onClick={handleStatusClick}
          title={statusLabels[status]}
        />
      )}
      
      {/* Custom status badge */}
      {customStatus && (
        <Badge
          variant="secondary"
          className="absolute -top-2 -right-2 text-xs px-1 py-0 min-w-0 h-5"
        >
          {customStatus}
        </Badge>
      )}
    </div>
  );
  
  // Wrap with tooltip if enabled
  if (showTooltip) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            {AvatarComponent}
          </TooltipTrigger>
          <TooltipContent side={tooltipSide}>
            <div className="text-center">
              <div className="font-medium">{userName}</div>
              {userEmail && (
                <div className="text-xs text-muted-foreground">{userEmail}</div>
              )}
              {showStatus && (
                <div className="flex items-center justify-center gap-1 mt-1 text-xs">
                  <Circle className={cn('h-2 w-2 rounded-full', statusColors[status])} />
                  <span>{statusLabels[status]}</span>
                </div>
              )}
              {customStatus && (
                <div className="text-xs text-muted-foreground mt-1">
                  "{customStatus}"
                </div>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  
  return AvatarComponent;
};

// Avatar Group component for showing multiple avatars
export interface UserAvatarGroupProps {
  users: Array<{
    userId: string;
    userName: string;
    userEmail?: string;
    avatar?: string;
    status?: UserStatus;
    color?: string;
  }>;
  size?: AvatarSize;
  maxVisible?: number;
  showStatus?: boolean;
  spacing?: 'tight' | 'normal' | 'loose';
  onUserClick?: (userId: string) => void;
  className?: string;
}

export const UserAvatarGroup: React.FC<UserAvatarGroupProps> = ({
  users,
  size = 'md',
  maxVisible = 5,
  showStatus = false,
  spacing = 'normal',
  onUserClick,
  className,
}) => {
  const visibleUsers = users.slice(0, maxVisible);
  const hiddenCount = users.length - maxVisible;
  
  const spacingClasses = {
    tight: '-space-x-1',
    normal: '-space-x-2',
    loose: '-space-x-3',
  };
  
  return (
    <div className={cn('flex items-center', spacingClasses[spacing], className)}>
      {visibleUsers.map((user, index) => (
        <UserAvatar
          key={user.userId}
          userId={user.userId}
          userName={user.userName}
          userEmail={user.userEmail}
          avatar={user.avatar}
          status={user.status}
          color={user.color}
          size={size}
          showStatus={showStatus}
          border={true}
          shadow={true}
          onClick={onUserClick ? () => onUserClick(user.userId) : undefined}
          className={cn('hover:z-10', index > 0 && 'relative')}
        />
      ))}
      
      {hiddenCount > 0 && (
        <div
          className={cn(
            'flex items-center justify-center bg-gray-100 border-2 border-white rounded-full font-medium text-gray-600 shadow-sm',
            sizeClasses[size].avatar,
            sizeClasses[size].font
          )}
        >
          +{hiddenCount}
        </div>
      )}
    </div>
  );
};

// Activity Status component for showing what the user is doing
export interface UserActivityStatusProps {
  activity: {
    type: 'drawing' | 'typing' | 'selecting' | 'commenting' | 'idle';
    description?: string;
    timestamp: number;
  };
  userId: string;
  userName: string;
  size?: 'sm' | 'md';
  showTime?: boolean;
  className?: string;
}

export const UserActivityStatus: React.FC<UserActivityStatusProps> = ({
  activity,
  userId,
  userName,
  size = 'md',
  showTime = true,
  className,
}) => {
  const activityInfo = useMemo(() => {
    const timeAgo = formatTimeAgo(activity.timestamp);
    
    switch (activity.type) {
      case 'drawing':
        return {
          text: 'Drawing',
          color: 'text-blue-600 bg-blue-50',
          icon: '✏️',
        };
      case 'typing':
        return {
          text: 'Typing',
          color: 'text-green-600 bg-green-50',
          icon: '⌨️',
        };
      case 'selecting':
        return {
          text: 'Selecting',
          color: 'text-purple-600 bg-purple-50',
          icon: '👆',
        };
      case 'commenting':
        return {
          text: 'Commenting',
          color: 'text-orange-600 bg-orange-50',
          icon: '💬',
        };
      default:
        return {
          text: 'Idle',
          color: 'text-gray-600 bg-gray-50',
          icon: '💤',
        };
    }
  }, [activity.type, activity.timestamp]);
  
  return (
    <div className={cn(
      'flex items-center gap-2 px-2 py-1 rounded-full border text-xs font-medium',
      activityInfo.color,
      size === 'sm' ? 'text-xs' : 'text-sm',
      className
    )}>
      <span className="text-sm">{activityInfo.icon}</span>
      <span>
        {activity.description || activityInfo.text}
        {showTime && (
          <span className="text-muted-foreground ml-1">
            · {formatTimeAgo(activity.timestamp)}
          </span>
        )}
      </span>
    </div>
  );
};

// Utility functions
function generateUserColor(userId: string): string {
  const colors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
    '#DDA0DD', '#FFB347', '#98D8E8', '#F7DC6F', '#BB8FCE',
    '#F1948A', '#82E0AA', '#85C1E9', '#F8C471', '#D7BDE2',
    '#AED6F1', '#A9DFBF', '#F9E79F', '#F5B7B1', '#D2B4DE'
  ];
  
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    const char = userId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  return colors[Math.abs(hash) % colors.length];
}

function generateInitials(name: string): string {
  if (!name || name.trim().length === 0) {
    return '??';
  }
  
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].substring(0, 2).toUpperCase();
  }
  
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function getContrastingTextColor(bgColor: string): string {
  // Remove # if present
  const hex = bgColor.replace('#', '');
  
  // Convert to RGB
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  
  // Calculate luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  
  // Return contrasting color
  return luminance > 0.5 ? '#000000' : '#ffffff';
}

function formatTimeAgo(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) {
    return `${days}d ago`;
  } else if (hours > 0) {
    return `${hours}h ago`;
  } else if (minutes > 0) {
    return `${minutes}m ago`;
  } else if (seconds > 5) {
    return `${seconds}s ago`;
  } else {
    return 'now';
  }
}

export default UserAvatar;