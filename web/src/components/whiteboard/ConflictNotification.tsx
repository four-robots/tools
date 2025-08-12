/**
 * ConflictNotification Component
 * 
 * User awareness and notification system for whiteboard conflicts.
 * Provides real-time notifications and status updates for conflicts.
 */

'use client';

import React, { useState, useEffect } from 'react';
import { toast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { 
  AlertTriangle, 
  Users, 
  Clock, 
  Zap, 
  CheckCircle,
  XCircle,
  AlertCircle,
  Bell,
  Eye,
  ExternalLink,
  Activity,
  TrendingUp,
  UserCheck
} from 'lucide-react';

// Types
interface ConflictNotification {
  id: string;
  conflictId: string;
  type: 'conflict_detected' | 'conflict_resolved' | 'manual_intervention_required';
  severity: 'low' | 'medium' | 'high' | 'critical';
  affectedUsers: string[];
  message: string;
  details: {
    conflictType: 'spatial' | 'temporal' | 'semantic' | 'ordering' | 'dependency' | 'compound';
    affectedElements: string[];
    resolutionStrategy?: 'last-write-wins' | 'priority-user' | 'merge' | 'manual' | 'automatic';
    estimatedResolutionTime?: number;
    resolvedBy?: string;
  };
  timestamp: string;
  acknowledged: boolean;
}

interface ConflictStatus {
  id: string;
  type: string;
  severity: string;
  resolved: boolean;
  timestamp: string;
}

interface ConflictNotificationProps {
  notifications: ConflictNotification[];
  conflicts: ConflictStatus[];
  onAcknowledge: (notificationId: string) => void;
  onViewConflict: (conflictId: string) => void;
  onResolveConflict: (conflictId: string) => void;
  userColors?: Record<string, string>;
  currentUserId?: string;
}

export const ConflictNotificationSystem: React.FC<ConflictNotificationProps> = ({
  notifications,
  conflicts,
  onAcknowledge,
  onViewConflict,
  onResolveConflict,
  userColors = {},
  currentUserId
}) => {
  const [showNotifications, setShowNotifications] = useState(false);
  const [lastNotificationCount, setLastNotificationCount] = useState(0);

  // Show toast notifications for new conflicts
  useEffect(() => {
    const unacknowledgedNotifications = notifications.filter(n => !n.acknowledged);
    
    if (unacknowledgedNotifications.length > lastNotificationCount) {
      const newNotifications = unacknowledgedNotifications.slice(lastNotificationCount);
      
      newNotifications.forEach(notification => {
        showConflictToast(notification);
      });
    }
    
    setLastNotificationCount(unacknowledgedNotifications.length);
  }, [notifications, lastNotificationCount]);

  const showConflictToast = (notification: ConflictNotification) => {
    const isUserInvolved = notification.affectedUsers.includes(currentUserId || '');
    
    const getSeverityStyle = (severity: string) => {
      switch (severity) {
        case 'critical': return 'destructive';
        case 'high': return 'destructive';
        case 'medium': return 'default';
        case 'low': return 'default';
        default: return 'default';
      }
    };

    const getTypeIcon = (type: string) => {
      switch (type) {
        case 'spatial': return <Users className="w-4 h-4" />;
        case 'temporal': return <Clock className="w-4 h-4" />;
        case 'semantic': return <AlertTriangle className="w-4 h-4" />;
        case 'compound': return <Zap className="w-4 h-4" />;
        default: return <AlertCircle className="w-4 h-4" />;
      }
    };

    toast({
      title: (
        <div className="flex items-center gap-2">
          {getTypeIcon(notification.details.conflictType)}
          <span>
            {notification.type === 'manual_intervention_required' 
              ? 'Manual Resolution Needed'
              : notification.type === 'conflict_resolved'
              ? 'Conflict Resolved'
              : 'Conflict Detected'
            }
          </span>
          <Badge variant={getSeverityStyle(notification.severity)}>
            {notification.severity}
          </Badge>
        </div>
      ),
      description: (
        <div className="space-y-2">
          <p>{notification.message}</p>
          {isUserInvolved && (
            <Badge variant="outline" className="text-xs">
              Your changes are affected
            </Badge>
          )}
          <div className="flex gap-2 mt-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                onViewConflict(notification.conflictId);
                onAcknowledge(notification.id);
              }}
            >
              <Eye className="w-3 h-3 mr-1" />
              View
            </Button>
            {notification.type === 'manual_intervention_required' && (
              <Button
                size="sm"
                onClick={() => {
                  onResolveConflict(notification.conflictId);
                  onAcknowledge(notification.id);
                }}
              >
                Resolve
              </Button>
            )}
          </div>
        </div>
      ),
      variant: getSeverityStyle(notification.severity) as any,
      duration: notification.severity === 'critical' ? 10000 : 5000,
    });
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'conflict_detected': return <AlertTriangle className="w-4 h-4 text-orange-600" />;
      case 'conflict_resolved': return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'manual_intervention_required': return <UserCheck className="w-4 h-4 text-red-600" />;
      default: return <AlertCircle className="w-4 h-4 text-gray-600" />;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-100 text-red-800 border-red-200';
      case 'high': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low': return 'bg-blue-100 text-blue-800 border-blue-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    
    if (diffMs < 60000) return 'Just now';
    if (diffMs < 3600000) return `${Math.floor(diffMs / 60000)}m ago`;
    if (diffMs < 86400000) return `${Math.floor(diffMs / 3600000)}h ago`;
    return date.toLocaleDateString();
  };

  const unacknowledgedCount = notifications.filter(n => !n.acknowledged).length;
  const activeConflicts = conflicts.filter(c => !c.resolved);
  const criticalConflicts = activeConflicts.filter(c => c.severity === 'critical');

  return (
    <>
      {/* Notification Bell */}
      <div className="relative">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowNotifications(!showNotifications)}
          className={`relative ${unacknowledgedCount > 0 ? 'border-orange-300 bg-orange-50' : ''}`}
        >
          <Bell className="w-4 h-4" />
          {unacknowledgedCount > 0 && (
            <Badge 
              variant="destructive" 
              className="absolute -top-2 -right-2 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs"
            >
              {unacknowledgedCount > 9 ? '9+' : unacknowledgedCount}
            </Badge>
          )}
        </Button>

        {/* Notification Panel */}
        {showNotifications && (
          <Card className="absolute top-full right-0 mt-2 w-96 max-h-96 overflow-hidden shadow-lg z-50">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-sm">
                <span>Conflict Notifications</span>
                <Badge variant="outline">{notifications.length}</Badge>
              </CardTitle>
            </CardHeader>
            
            <div className="max-h-80 overflow-y-auto">
              <CardContent className="p-0">
                {notifications.length === 0 ? (
                  <div className="p-4 text-center text-gray-500 text-sm">
                    No conflict notifications
                  </div>
                ) : (
                  <div className="space-y-1">
                    {notifications
                      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                      .map((notification) => (
                        <div
                          key={notification.id}
                          className={`p-3 border-b hover:bg-gray-50 cursor-pointer ${
                            !notification.acknowledged ? 'bg-blue-50' : ''
                          }`}
                          onClick={() => {
                            onAcknowledge(notification.id);
                            onViewConflict(notification.conflictId);
                          }}
                        >
                          <div className="flex items-start gap-2">
                            {getNotificationIcon(notification.type)}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-medium truncate">
                                  {notification.type === 'manual_intervention_required' 
                                    ? 'Manual Resolution Needed'
                                    : notification.type === 'conflict_resolved'
                                    ? 'Conflict Resolved'
                                    : 'Conflict Detected'
                                  }
                                </span>
                                <Badge className={`${getSeverityColor(notification.severity)} text-xs`}>
                                  {notification.severity}
                                </Badge>
                              </div>
                              <p className="text-xs text-gray-600 mb-1">
                                {notification.message}
                              </p>
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-gray-500">
                                  {formatTimestamp(notification.timestamp)}
                                </span>
                                {notification.details.resolvedBy && (
                                  <span className="text-xs text-green-600">
                                    Resolved by {notification.details.resolvedBy}
                                  </span>
                                )}
                              </div>
                            </div>
                            {!notification.acknowledged && (
                              <div className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0 mt-1" />
                            )}
                          </div>
                        </div>
                      ))
                    }
                  </div>
                )}
              </CardContent>
            </div>
          </Card>
        )}
      </div>

      {/* Critical Conflict Banner */}
      {criticalConflicts.length > 0 && (
        <Alert className="border-red-200 bg-red-50">
          <AlertTriangle className="h-4 w-4 text-red-600" />
          <AlertDescription className="flex items-center justify-between">
            <span>
              <strong>Critical conflicts detected!</strong> {criticalConflicts.length} conflict{criticalConflicts.length > 1 ? 's' : ''} require immediate attention.
            </span>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => {
                const firstCritical = criticalConflicts[0];
                if (firstCritical) {
                  onResolveConflict(firstCritical.id);
                }
              }}
            >
              Resolve Now
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Active Conflicts Summary */}
      {activeConflicts.length > 0 && criticalConflicts.length === 0 && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-yellow-600" />
                <span className="text-sm font-medium">
                  {activeConflicts.length} active conflict{activeConflicts.length > 1 ? 's' : ''}
                </span>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowNotifications(true)}
                >
                  <Eye className="w-3 h-3 mr-1" />
                  View All
                </Button>
                {activeConflicts.some(c => c.severity === 'high') && (
                  <Button
                    size="sm"
                    variant="default"
                    onClick={() => {
                      const highPriority = activeConflicts.find(c => c.severity === 'high');
                      if (highPriority) {
                        onResolveConflict(highPriority.id);
                      }
                    }}
                  >
                    Resolve High Priority
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
};

// Floating conflict status indicator
export const ConflictStatusIndicator: React.FC<{
  conflictCount: number;
  criticalCount: number;
  onClick: () => void;
}> = ({ conflictCount, criticalCount, onClick }) => {
  if (conflictCount === 0) return null;

  return (
    <div 
      className="fixed bottom-4 right-4 z-50 cursor-pointer"
      onClick={onClick}
    >
      <Card className="p-3 shadow-lg border-l-4 border-l-orange-500 hover:shadow-xl transition-shadow">
        <div className="flex items-center gap-2">
          <div className="relative">
            <AlertTriangle className={`w-5 h-5 ${criticalCount > 0 ? 'text-red-600' : 'text-orange-600'}`} />
            {criticalCount > 0 && (
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-pulse" />
            )}
          </div>
          <div>
            <div className="text-sm font-medium">
              {conflictCount} Conflict{conflictCount > 1 ? 's' : ''}
            </div>
            {criticalCount > 0 && (
              <div className="text-xs text-red-600">
                {criticalCount} critical
              </div>
            )}
          </div>
          <ExternalLink className="w-3 h-3 text-gray-400" />
        </div>
      </Card>
    </div>
  );
};

export default ConflictNotificationSystem;