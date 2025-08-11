/**
 * Conflict Notification Toast Component
 * 
 * Real-time toast notifications for conflict resolution events including
 * new conflicts, resolution proposals, voting updates, and system alerts.
 * Supports different notification types with appropriate styling and actions.
 */

'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  X, 
  AlertTriangle, 
  CheckCircle, 
  Info, 
  Users, 
  Clock,
  ThumbsUp,
  ThumbsDown,
  Merge,
  Bell,
  ExternalLink
} from 'lucide-react';

interface ConflictNotification {
  id: string;
  type: 'conflict_detected' | 'resolution_proposed' | 'voting_started' | 'solution_approved' | 'session_ended' | 'participant_joined' | 'system_alert';
  title: string;
  message: string;
  timestamp: string;
  conflictId?: string;
  sessionId?: string;
  userId?: string;
  metadata?: {
    severity?: 'low' | 'medium' | 'high' | 'critical';
    strategy?: string;
    participantCount?: number;
    votingDeadline?: string;
    autoHideAfter?: number;
  };
}

interface ConflictNotificationToastProps {
  notification: ConflictNotification;
  onDismiss: (id: string) => void;
  onAction?: (action: 'view' | 'participate' | 'ignore', notificationId: string) => void;
  autoHide?: boolean;
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
}

export const ConflictNotificationToast: React.FC<ConflictNotificationToastProps> = ({
  notification,
  onDismiss,
  onAction,
  autoHide = true,
  position = 'top-right'
}) => {
  const [isVisible, setIsVisible] = useState(true);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [isHovered, setIsHovered] = useState(false);

  // Auto-hide timer
  useEffect(() => {
    if (autoHide && !isHovered) {
      const hideAfter = notification.metadata?.autoHideAfter || 8000;
      const timer = setTimeout(() => {
        handleDismiss();
      }, hideAfter);

      // If there's a voting deadline, show countdown
      if (notification.metadata?.votingDeadline) {
        const deadline = new Date(notification.metadata.votingDeadline).getTime();
        const interval = setInterval(() => {
          const now = Date.now();
          const remaining = deadline - now;
          if (remaining > 0) {
            setTimeLeft(remaining);
          } else {
            setTimeLeft(0);
            clearInterval(interval);
          }
        }, 1000);

        return () => {
          clearTimeout(timer);
          clearInterval(interval);
        };
      }

      return () => clearTimeout(timer);
    }
  }, [autoHide, isHovered, notification.metadata]);

  const handleDismiss = () => {
    setIsVisible(false);
    setTimeout(() => onDismiss(notification.id), 300);
  };

  const handleAction = (action: 'view' | 'participate' | 'ignore') => {
    onAction?.(action, notification.id);
  };

  const getNotificationIcon = () => {
    switch (notification.type) {
      case 'conflict_detected':
        return <AlertTriangle className="w-5 h-5 text-orange-500" />;
      case 'resolution_proposed':
        return <Merge className="w-5 h-5 text-blue-500" />;
      case 'voting_started':
        return <ThumbsUp className="w-5 h-5 text-purple-500" />;
      case 'solution_approved':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'session_ended':
        return <Clock className="w-5 h-5 text-gray-500" />;
      case 'participant_joined':
        return <Users className="w-5 h-5 text-blue-500" />;
      case 'system_alert':
        return <Bell className="w-5 h-5 text-red-500" />;
      default:
        return <Info className="w-5 h-5 text-blue-500" />;
    }
  };

  const getNotificationColor = () => {
    const severity = notification.metadata?.severity;
    
    switch (notification.type) {
      case 'conflict_detected':
        return severity === 'critical' ? 'border-red-500 bg-red-50' :
               severity === 'high' ? 'border-orange-500 bg-orange-50' :
               'border-yellow-500 bg-yellow-50';
      case 'resolution_proposed':
        return 'border-blue-500 bg-blue-50';
      case 'voting_started':
        return 'border-purple-500 bg-purple-50';
      case 'solution_approved':
        return 'border-green-500 bg-green-50';
      case 'session_ended':
        return 'border-gray-500 bg-gray-50';
      case 'system_alert':
        return 'border-red-500 bg-red-50';
      default:
        return 'border-gray-300 bg-white';
    }
  };

  const getPositionClasses = () => {
    switch (position) {
      case 'top-left':
        return 'top-4 left-4';
      case 'top-right':
        return 'top-4 right-4';
      case 'bottom-left':
        return 'bottom-4 left-4';
      case 'bottom-right':
        return 'bottom-4 right-4';
      default:
        return 'top-4 right-4';
    }
  };

  const formatTimeLeft = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    
    if (minutes > 0) {
      return `${minutes}:${(seconds % 60).toString().padStart(2, '0')}`;
    }
    return `${seconds}s`;
  };

  if (!isVisible) return null;

  return (
    <div 
      className={`fixed z-50 w-96 transform transition-all duration-300 ease-in-out ${
        isVisible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'
      } ${getPositionClasses()}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className={`
        rounded-lg border-2 shadow-lg p-4 backdrop-blur-sm
        ${getNotificationColor()}
        hover:shadow-xl transition-shadow duration-200
      `}>
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            {getNotificationIcon()}
            <div>
              <h4 className="font-semibold text-gray-900">{notification.title}</h4>
              <p className="text-xs text-gray-500">
                {new Date(notification.timestamp).toLocaleTimeString()}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {notification.metadata?.severity && (
              <Badge 
                variant={notification.metadata.severity === 'critical' ? 'destructive' : 'secondary'}
                className="text-xs"
              >
                {notification.metadata.severity}
              </Badge>
            )}
            
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDismiss}
              className="h-6 w-6 p-0 hover:bg-gray-200"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Message */}
        <p className="text-sm text-gray-700 mb-3">{notification.message}</p>

        {/* Metadata Display */}
        {notification.metadata && (
          <div className="space-y-2 mb-3">
            {/* Strategy */}
            {notification.metadata.strategy && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">Strategy:</span>
                <Badge variant="outline" className="text-xs">
                  {notification.metadata.strategy.replace('_', ' ')}
                </Badge>
              </div>
            )}

            {/* Participant Count */}
            {notification.metadata.participantCount && (
              <div className="flex items-center gap-2">
                <Users className="w-3 h-3 text-gray-400" />
                <span className="text-xs text-gray-600">
                  {notification.metadata.participantCount} participants
                </span>
              </div>
            )}

            {/* Voting Countdown */}
            {timeLeft !== null && timeLeft > 0 && (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Voting ends in:</span>
                  <span className="text-xs font-medium text-orange-600">
                    {formatTimeLeft(timeLeft)}
                  </span>
                </div>
                <Progress 
                  value={Math.max(0, (timeLeft / (5 * 60 * 1000)) * 100)} 
                  className="h-1"
                />
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2">
          {notification.type === 'conflict_detected' && (
            <>
              <Button
                size="sm"
                onClick={() => handleAction('view')}
                className="flex items-center gap-1"
              >
                <ExternalLink className="w-3 h-3" />
                View
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleAction('ignore')}
              >
                Ignore
              </Button>
            </>
          )}

          {notification.type === 'resolution_proposed' && (
            <>
              <Button
                size="sm"
                onClick={() => handleAction('view')}
                className="flex items-center gap-1"
              >
                <Merge className="w-3 h-3" />
                Review
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleAction('ignore')}
              >
                Later
              </Button>
            </>
          )}

          {notification.type === 'voting_started' && (
            <>
              <Button
                size="sm"
                onClick={() => handleAction('participate')}
                className="flex items-center gap-1"
              >
                <ThumbsUp className="w-3 h-3" />
                Vote
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleAction('view')}
              >
                Watch
              </Button>
            </>
          )}

          {(notification.type === 'solution_approved' || 
            notification.type === 'session_ended' ||
            notification.type === 'participant_joined') && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleAction('view')}
            >
              Details
            </Button>
          )}

          {notification.type === 'system_alert' && (
            <Button
              size="sm"
              variant="destructive"
              onClick={() => handleAction('view')}
            >
              Review
            </Button>
          )}
        </div>

        {/* Session/Conflict IDs for debugging */}
        {(notification.sessionId || notification.conflictId) && (
          <div className="mt-2 pt-2 border-t border-gray-200">
            <div className="text-xs text-gray-400 space-y-1">
              {notification.sessionId && (
                <div>Session: {notification.sessionId.substring(0, 8)}</div>
              )}
              {notification.conflictId && (
                <div>Conflict: {notification.conflictId.substring(0, 8)}</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};