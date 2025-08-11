/**
 * Presence Tooltip Component
 * 
 * Detailed tooltip showing user presence information:
 * - User details (name, email, avatar)
 * - Current status and custom status
 * - Last activity information
 * - Activity timeline
 * - Quick actions (follow, message, etc.)
 */

'use client';

import React, { useMemo } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { 
  Circle, 
  Clock, 
  Eye, 
  MessageCircle, 
  Edit3, 
  Type, 
  MousePointer,
  Activity,
  User,
  Mail
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { UserPresenceState } from './WhiteboardPresencePanel';
import { ActivityInfo } from './hooks/useEnhancedPresence';

export interface PresenceTooltipProps {
  presence: UserPresenceState;
  activityHistory?: ActivityInfo[];
  showActivityHistory?: boolean;
  onFollowUser?: () => void;
  onMessageUser?: () => void;
  onViewProfile?: () => void;
  className?: string;
}

interface ActivityItemProps {
  activity: ActivityInfo;
  isLatest?: boolean;
}

const ActivityItem: React.FC<ActivityItemProps> = ({ activity, isLatest = false }) => {
  const activityInfo = useMemo(() => {
    const timeAgo = formatTimeAgo(activity.timestamp);
    
    switch (activity.type) {
      case 'drawing':
        return {
          icon: <Edit3 className="h-3 w-3" />,
          text: 'Drawing',
          color: 'text-blue-600',
          bgColor: 'bg-blue-50',
        };
      case 'typing':
        return {
          icon: <Type className="h-3 w-3" />,
          text: 'Typing',
          color: 'text-green-600',
          bgColor: 'bg-green-50',
        };
      case 'selecting':
        return {
          icon: <MousePointer className="h-3 w-3" />,
          text: 'Selecting',
          color: 'text-purple-600',
          bgColor: 'bg-purple-50',
        };
      case 'commenting':
        return {
          icon: <MessageCircle className="h-3 w-3" />,
          text: 'Commenting',
          color: 'text-orange-600',
          bgColor: 'bg-orange-50',
        };
      default:
        return {
          icon: <Activity className="h-3 w-3" />,
          text: 'Idle',
          color: 'text-gray-600',
          bgColor: 'bg-gray-50',
        };
    }
  }, [activity.type]);

  return (
    <div className={cn(
      'flex items-center gap-2 text-xs',
      isLatest && 'font-medium'
    )}>
      <div className={cn(
        'p-1 rounded-full',
        activityInfo.bgColor
      )}>
        <div className={activityInfo.color}>
          {activityInfo.icon}
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className={activityInfo.color}>
          {activity.description || activityInfo.text}
        </div>
        <div className="text-muted-foreground">
          {formatTimeAgo(activity.timestamp)}
        </div>
      </div>
    </div>
  );
};

export const PresenceTooltip: React.FC<PresenceTooltipProps> = ({
  presence,
  activityHistory = [],
  showActivityHistory = true,
  onFollowUser,
  onMessageUser,
  onViewProfile,
  className,
}) => {
  // Status information
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

  // Session duration
  const sessionDuration = useMemo(() => {
    const duration = Date.now() - presence.joinedAt;
    return formatDuration(duration);
  }, [presence.joinedAt]);

  // Recent activities (limit to 3-5 most recent)
  const recentActivities = useMemo(() => {
    const activities = [presence.lastActivity, ...activityHistory]
      .filter(activity => activity.type !== 'idle')
      .slice(0, 4);
    return activities;
  }, [presence.lastActivity, activityHistory]);

  return (
    <Card className={cn('w-80 max-w-sm', className)}>
      <CardHeader className="pb-3">
        {/* User header */}
        <div className="flex items-start gap-3">
          <div className="relative">
            <Avatar className="h-12 w-12 ring-2 ring-white shadow-sm">
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
            <div className="absolute -bottom-1 -right-1">
              <div className={cn(
                'w-4 h-4 rounded-full border-2 border-white shadow-sm',
                statusInfo.statusColor
              )} />
            </div>
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-base leading-tight">
              {presence.userName}
            </div>
            {presence.userEmail && (
              <div className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
                <Mail className="h-3 w-3" />
                {presence.userEmail}
              </div>
            )}
            
            {/* Status */}
            <div className="flex items-center gap-2 mt-2">
              <div className="flex items-center gap-1.5">
                <Circle className={cn('h-2.5 w-2.5 rounded-full', statusInfo.statusColor)} />
                <span className="text-sm font-medium">{statusInfo.statusText}</span>
              </div>
              {presence.customStatus && (
                <Badge variant="secondary" className="text-xs px-1.5 py-0">
                  {presence.customStatus}
                </Badge>
              )}
            </div>
            
            <div className="text-xs text-muted-foreground mt-1">
              {statusInfo.statusDescription}
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Session info */}
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>Session time:</span>
          </div>
          <span className="font-medium">{sessionDuration}</span>
        </div>

        {/* Current activity */}
        <div>
          <div className="text-sm font-medium mb-2 flex items-center gap-1.5">
            <Activity className="h-3 w-3" />
            Current Activity
          </div>
          <ActivityItem activity={presence.lastActivity} isLatest={true} />
        </div>

        {/* Recent activity history */}
        {showActivityHistory && recentActivities.length > 1 && (
          <>
            <Separator />
            <div>
              <div className="text-sm font-medium mb-3">Recent Activity</div>
              <div className="space-y-2">
                {recentActivities.slice(1).map((activity, index) => (
                  <ActivityItem 
                    key={`${activity.timestamp}-${index}`} 
                    activity={activity} 
                  />
                ))}
              </div>
            </div>
          </>
        )}

        {/* Quick actions */}
        <Separator />
        <div className="flex gap-2">
          {onFollowUser && (
            <Button
              variant="outline"
              size="sm"
              onClick={onFollowUser}
              className="flex-1 text-xs"
            >
              <Eye className="h-3 w-3 mr-1" />
              Follow
            </Button>
          )}
          
          {onMessageUser && (
            <Button
              variant="outline"
              size="sm"
              onClick={onMessageUser}
              className="flex-1 text-xs"
            >
              <MessageCircle className="h-3 w-3 mr-1" />
              Message
            </Button>
          )}
          
          {onViewProfile && (
            <Button
              variant="outline"
              size="sm"
              onClick={onViewProfile}
              className="flex-1 text-xs"
            >
              <User className="h-3 w-3 mr-1" />
              Profile
            </Button>
          )}
        </div>

        {/* Joined info */}
        <div className="text-xs text-muted-foreground text-center pt-2">
          Joined {formatTimeAgo(presence.joinedAt)} ago
        </div>
      </CardContent>
    </Card>
  );
};

// Utility functions
function getContrastingTextColor(bgColor: string): string {
  const hex = bgColor.replace('#', '');
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  const brightness = ((r * 299) + (g * 587) + (b * 114)) / 1000;
  return brightness > 128 ? '#000000' : '#ffffff';
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) {
    return `${days}d ${hours % 24}h`;
  } else if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m`;
  } else {
    return `${Math.max(seconds, 1)}s`;
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
  } else if (seconds > 5) {
    return `${seconds}s`;
  } else {
    return 'now';
  }
}

export default PresenceTooltip;