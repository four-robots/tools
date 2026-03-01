/**
 * Whiteboard Presence Panel Component
 * 
 * A comprehensive sidebar panel showing all active users with:
 * - Real-time presence status indicators (active/idle/away/offline)
 * - User avatars with consistent color coding
 * - Activity awareness (what each user is doing)
 * - Join/leave animations
 * - Last activity timestamps
 * - User tooltips with detailed information
 */

'use client';

import React, { useMemo, useCallback, useRef, useEffect } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { 
  Users, 
  Circle, 
  Clock, 
  MousePointer, 
  Edit3, 
  Type, 
  MessageCircle,
  Eye,
  Activity,
  Minimize2,
  Maximize2,
  MoreHorizontal
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Enhanced user presence state from the backend service
export interface UserPresenceState {
  userId: string;
  userName: string;
  userEmail?: string;
  avatar?: string;
  initials: string;
  color: string;
  isOnline: boolean;
  whiteboardId: string;
  sessionId: string;
  status: 'online' | 'idle' | 'away' | 'offline' | 'busy';
  lastActivity: {
    type: 'drawing' | 'typing' | 'selecting' | 'commenting' | 'idle';
    elementId?: string;
    description?: string;
    timestamp: number;
  };
  lastSeen: number;
  joinedAt: number;
  customStatus?: string;
  isActive: boolean;
}

interface WhiteboardPresencePanelProps {
  presences: UserPresenceState[];
  currentUserId: string;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  showActivityHistory?: boolean;
  onUserClick?: (userId: string) => void;
  onUserFollow?: (userId: string) => void;
  className?: string;
}

interface UserPresenceItemProps {
  presence: UserPresenceState;
  isCurrentUser: boolean;
  onUserClick?: (userId: string) => void;
  onUserFollow?: (userId: string) => void;
}

// Individual user presence item component
const UserPresenceItem: React.FC<UserPresenceItemProps> = ({
  presence,
  isCurrentUser,
  onUserClick,
  onUserFollow,
}) => {
  const itemRef = useRef<HTMLDivElement>(null);

  // Memoized status information
  const statusInfo = useMemo(() => {
    const now = Date.now();
    const timeSinceActivity = now - presence.lastActivity.timestamp;
    const timeSinceLastSeen = now - presence.lastSeen;
    
    let statusColor = 'bg-gray-400';
    let statusText = 'Unknown';
    let statusDescription = '';
    
    switch (presence.status) {
      case 'online':
        statusColor = 'bg-green-500';
        statusText = 'Online';
        statusDescription = presence.isActive ? 'Active now' : 'Online';
        break;
      case 'idle':
        statusColor = 'bg-yellow-500';
        statusText = 'Idle';
        statusDescription = `Idle for ${formatDuration(timeSinceActivity)}`;
        break;
      case 'away':
        statusColor = 'bg-orange-500';
        statusText = 'Away';
        statusDescription = `Away for ${formatDuration(timeSinceLastSeen)}`;
        break;
      case 'busy':
        statusColor = 'bg-red-500';
        statusText = 'Busy';
        statusDescription = 'Do not disturb';
        break;
      case 'offline':
        statusColor = 'bg-gray-400';
        statusText = 'Offline';
        statusDescription = `Last seen ${formatDuration(timeSinceLastSeen)} ago`;
        break;
    }

    return { statusColor, statusText, statusDescription };
  }, [presence.status, presence.lastActivity.timestamp, presence.lastSeen, presence.isActive]);

  // Activity information
  const activityInfo = useMemo(() => {
    const { type, description, elementId, timestamp } = presence.lastActivity;
    const timeAgo = formatTimeAgo(timestamp);
    
    let activityIcon;
    let activityText;
    let activityColor = 'text-gray-500';
    
    switch (type) {
      case 'drawing':
        activityIcon = <Edit3 className="h-3 w-3" />;
        activityText = 'Drawing';
        activityColor = 'text-blue-600';
        break;
      case 'typing':
        activityIcon = <Type className="h-3 w-3" />;
        activityText = 'Typing';
        activityColor = 'text-green-600';
        break;
      case 'selecting':
        activityIcon = <MousePointer className="h-3 w-3" />;
        activityText = 'Selecting';
        activityColor = 'text-purple-600';
        break;
      case 'commenting':
        activityIcon = <MessageCircle className="h-3 w-3" />;
        activityText = 'Commenting';
        activityColor = 'text-orange-600';
        break;
      default:
        activityIcon = <Activity className="h-3 w-3" />;
        activityText = 'Idle';
        activityColor = 'text-gray-500';
    }
    
    return {
      activityIcon,
      activityText,
      activityColor,
      timeAgo,
      description: description || activityText,
    };
  }, [presence.lastActivity]);

  const handleClick = useCallback(() => {
    if (onUserClick && !isCurrentUser) {
      onUserClick(presence.userId);
    }
  }, [onUserClick, isCurrentUser, presence.userId]);

  const handleFollow = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (onUserFollow && !isCurrentUser) {
      onUserFollow(presence.userId);
    }
  }, [onUserFollow, isCurrentUser, presence.userId]);

  // Animation on mount/unmount
  useEffect(() => {
    const element = itemRef.current;
    if (!element) return;
    
    // Fade in animation
    element.style.opacity = '0';
    element.style.transform = 'translateX(-10px)';
    
    const timeout = setTimeout(() => {
      element.style.transition = 'opacity 300ms ease-out, transform 300ms ease-out';
      element.style.opacity = '1';
      element.style.transform = 'translateX(0)';
    }, 50);
    
    return () => clearTimeout(timeout);
  }, []);

  return (
    <TooltipProvider>
      <div
        ref={itemRef}
        className={cn(
          'flex items-center gap-3 p-3 rounded-lg transition-all duration-200 hover:bg-gray-50 group cursor-pointer',
          isCurrentUser && 'bg-blue-50 border border-blue-200',
          !presence.isOnline && 'opacity-75'
        )}
        onClick={handleClick}
      >
        {/* Avatar with status indicator */}
        <div className="relative">
          <Avatar className="h-10 w-10 ring-2 ring-white shadow-sm">
            <AvatarImage 
              src={presence.avatar || `/api/avatars/${presence.userId}`}
              alt={presence.userName}
            />
            <AvatarFallback
              className="text-sm font-medium"
              style={{
                backgroundColor: presence.color,
                color: getContrastingTextColor(presence.color),
              }}
            >
              {presence.initials}
            </AvatarFallback>
          </Avatar>
          
          {/* Status indicator */}
          <div className="absolute -bottom-0.5 -right-0.5">
            <div className={cn(
              'w-4 h-4 rounded-full border-2 border-white shadow-sm',
              statusInfo.statusColor
            )} />
          </div>
        </div>

        {/* User info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={cn(
              'font-medium text-sm truncate',
              isCurrentUser && 'text-blue-700'
            )}>
              {presence.userName}
              {isCurrentUser && ' (You)'}
            </span>
            
            {presence.customStatus && (
              <Badge variant="secondary" className="text-xs px-1 py-0">
                {presence.customStatus}
              </Badge>
            )}
          </div>
          
          {/* Activity info */}
          <div className={cn('flex items-center gap-1 text-xs', activityInfo.activityColor)}>
            {activityInfo.activityIcon}
            <span className="truncate">
              {activityInfo.description} · {activityInfo.timeAgo}
            </span>
          </div>
        </div>

        {/* Actions (only show on hover for non-current users) */}
        {!isCurrentUser && (
          <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={handleFollow}
                >
                  <Eye className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left">
                Follow {presence.userName}
              </TooltipContent>
            </Tooltip>
          </div>
        )}

        {/* Detailed tooltip */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="absolute inset-0" />
          </TooltipTrigger>
          <TooltipContent side="left" className="max-w-sm">
            <div className="space-y-2">
              <div>
                <div className="font-medium">{presence.userName}</div>
                {presence.userEmail && (
                  <div className="text-xs text-muted-foreground">{presence.userEmail}</div>
                )}
              </div>
              
              <div className="flex items-center gap-2 text-xs">
                <Circle className={cn('h-2 w-2 rounded-full', statusInfo.statusColor)} />
                <span>{statusInfo.statusText}</span>
                <span className="text-muted-foreground">·</span>
                <span className="text-muted-foreground">{statusInfo.statusDescription}</span>
              </div>
              
              <div className="text-xs text-muted-foreground">
                <div>Joined {formatTimeAgo(presence.joinedAt)} ago</div>
                <div>Last activity: {activityInfo.description}</div>
              </div>
            </div>
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
};

// Main presence panel component
export const WhiteboardPresencePanel: React.FC<WhiteboardPresencePanelProps> = ({
  presences,
  currentUserId,
  isCollapsed = false,
  onToggleCollapse,
  showActivityHistory = true,
  onUserClick,
  onUserFollow,
  className,
}) => {
  // Sort users: current user first, then by status, then by activity
  const sortedPresences = useMemo(() => {
    return [...presences].sort((a, b) => {
      // Current user always first
      if (a.userId === currentUserId) return -1;
      if (b.userId === currentUserId) return 1;
      
      // Online users before offline
      if (a.isOnline && !b.isOnline) return -1;
      if (!a.isOnline && b.isOnline) return 1;
      
      // Active users before inactive
      if (a.isActive && !b.isActive) return -1;
      if (!a.isActive && b.isActive) return 1;
      
      // Most recent activity first
      return b.lastActivity.timestamp - a.lastActivity.timestamp;
    });
  }, [presences, currentUserId]);

  // Statistics
  const stats = useMemo(() => {
    const total = presences.length;
    const online = presences.filter(p => p.isOnline).length;
    const active = presences.filter(p => p.isActive).length;
    const idle = presences.filter(p => p.status === 'idle').length;
    const away = presences.filter(p => p.status === 'away').length;
    
    return { total, online, active, idle, away };
  }, [presences]);

  if (isCollapsed) {
    return (
      <Card className={cn('w-16 h-fit', className)}>
        <CardContent className="p-3">
          <div className="flex flex-col items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleCollapse}
              className="h-8 w-8 p-0"
            >
              <Maximize2 className="h-4 w-4" />
            </Button>
            
            <div className="flex flex-col items-center gap-1">
              <Users className="h-5 w-5 text-gray-600" />
              <span className="text-xs font-medium text-gray-700">
                {stats.online}
              </span>
            </div>
            
            {/* Show first few avatars */}
            <div className="flex flex-col gap-1">
              {sortedPresences.slice(0, 3).map((presence) => (
                <Tooltip key={presence.userId}>
                  <TooltipTrigger asChild>
                    <div className="relative">
                      <Avatar className="h-6 w-6">
                        <AvatarImage src={presence.avatar} alt={presence.userName} />
                        <AvatarFallback 
                          className="text-xs"
                          style={{ backgroundColor: presence.color }}
                        >
                          {presence.initials}
                        </AvatarFallback>
                      </Avatar>
                      <div className={cn(
                        'absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-white',
                        presence.status === 'online' && 'bg-green-500',
                        presence.status === 'idle' && 'bg-yellow-500',
                        presence.status === 'away' && 'bg-orange-500',
                        presence.status === 'offline' && 'bg-gray-400'
                      )} />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    <div>{presence.userName}</div>
                    <div className="text-xs text-muted-foreground">{presence.status}</div>
                  </TooltipContent>
                </Tooltip>
              ))}
              
              {sortedPresences.length > 3 && (
                <div className="text-xs text-center text-gray-500 mt-1">
                  +{sortedPresences.length - 3}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn('w-80 h-fit max-h-[600px] flex flex-col', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <Users className="h-5 w-5" />
            Participants ({stats.online})
          </CardTitle>
          
          <div className="flex items-center gap-1">
            {onToggleCollapse && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onToggleCollapse}
                className="h-8 w-8 p-0"
              >
                <Minimize2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
        
        {/* Status summary */}
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <Circle className="h-2 w-2 bg-green-500 rounded-full" />
            <span>{stats.active} active</span>
          </div>
          {stats.idle > 0 && (
            <div className="flex items-center gap-1">
              <Circle className="h-2 w-2 bg-yellow-500 rounded-full" />
              <span>{stats.idle} idle</span>
            </div>
          )}
          {stats.away > 0 && (
            <div className="flex items-center gap-1">
              <Circle className="h-2 w-2 bg-orange-500 rounded-full" />
              <span>{stats.away} away</span>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex-1 p-0 overflow-hidden">
        <ScrollArea className="h-full px-4 pb-4">
          <div className="space-y-1">
            {sortedPresences.map((presence) => (
              <UserPresenceItem
                key={presence.userId}
                presence={presence}
                isCurrentUser={presence.userId === currentUserId}
                onUserClick={onUserClick}
                onUserFollow={onUserFollow}
              />
            ))}
            
            {sortedPresences.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No participants yet</p>
                <p className="text-sm">Invite others to collaborate</p>
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

// Utility functions
function getContrastingTextColor(bgColor: string): string {
  // Simple contrast calculation
  const hex = bgColor.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const brightness = ((r * 299) + (g * 587) + (b * 114)) / 1000;
  return brightness > 128 ? '#000000' : '#ffffff';
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m`;
  } else {
    return `${seconds}s`;
  }
}

function formatTimeAgo(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) {
    return `${days}d`;
  } else if (hours > 0) {
    return `${hours}h`;
  } else if (minutes > 0) {
    return `${minutes}m`;
  } else {
    return 'now';
  }
}

export default WhiteboardPresencePanel;