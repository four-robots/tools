import React, { useState } from 'react';
import { Button } from '../../ui/button';
import { Card } from '../../ui/card';
import { Badge } from '../../ui/badge';
import { 
  PlayIcon, 
  PauseIcon, 
  EditIcon, 
  TrashIcon, 
  BellIcon,
  ClockIcon,
  MailIcon,
  GlobeIcon,
  SmartphoneIcon,
  WebhookIcon,
  MoreHorizontalIcon,
  AlertTriangleIcon,
  CheckCircleIcon,
  XCircleIcon
} from 'lucide-react';

interface Alert {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  scheduleType: string;
  lastTriggeredAt?: string;
  nextScheduledAt?: string;
  savedSearch: {
    id: string;
    name: string;
  };
  notificationChannels: Array<{
    type: string;
    config: any;
  }>;
  createdAt: string;
  updatedAt: string;
}

interface AlertCardProps {
  alert: Alert;
  onEdit: () => void;
  onDelete: () => void;
  onTrigger: () => Promise<void>;
  onToggleActive: (isActive: boolean) => Promise<void>;
  onViewDetails?: () => void;
}

export function AlertCard({ 
  alert, 
  onEdit, 
  onDelete, 
  onTrigger, 
  onToggleActive,
  onViewDetails 
}: AlertCardProps) {
  const [isTriggering, setIsTriggering] = useState(false);
  const [isToggling, setIsToggling] = useState(false);
  const [showActions, setShowActions] = useState(false);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) {
      return `${diffMins}m ago`;
    } else if (diffHours < 24) {
      return `${diffHours}h ago`;
    } else if (diffDays < 7) {
      return `${diffDays}d ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  const formatNextExecution = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    
    if (diffMs <= 0) {
      return 'Overdue';
    }
    
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) {
      return `in ${diffMins}m`;
    } else if (diffHours < 24) {
      return `in ${diffHours}h`;
    } else if (diffDays < 7) {
      return `in ${diffDays}d`;
    } else {
      return date.toLocaleDateString();
    }
  };

  const getScheduleDisplayText = () => {
    switch (alert.scheduleType) {
      case 'manual':
        return 'Manual only';
      case 'interval':
        return 'Interval-based';
      case 'cron':
        return 'Cron schedule';
      case 'real_time':
        return 'Real-time';
      default:
        return alert.scheduleType;
    }
  };

  const getChannelIcon = (type: string) => {
    switch (type) {
      case 'email':
        return <MailIcon className="h-4 w-4" />;
      case 'webhook':
        return <WebhookIcon className="h-4 w-4" />;
      case 'sms':
        return <SmartphoneIcon className="h-4 w-4" />;
      case 'in_app':
        return <BellIcon className="h-4 w-4" />;
      default:
        return <GlobeIcon className="h-4 w-4" />;
    }
  };

  const handleTrigger = async () => {
    setIsTriggering(true);
    try {
      await onTrigger();
    } catch (error) {
      console.error('Error triggering alert:', error);
    } finally {
      setIsTriggering(false);
    }
  };

  const handleToggleActive = async () => {
    setIsToggling(true);
    try {
      await onToggleActive(!alert.isActive);
    } catch (error) {
      console.error('Error toggling alert:', error);
    } finally {
      setIsToggling(false);
    }
  };

  const getStatusBadge = () => {
    if (!alert.isActive) {
      return (
        <Badge variant="secondary" className="flex items-center gap-1">
          <PauseIcon className="h-3 w-3" />
          Inactive
        </Badge>
      );
    }

    if (alert.scheduleType === 'manual') {
      return (
        <Badge variant="outline" className="flex items-center gap-1">
          <PlayIcon className="h-3 w-3" />
          Manual
        </Badge>
      );
    }

    return (
      <Badge variant="default" className="flex items-center gap-1">
        <CheckCircleIcon className="h-3 w-3" />
        Active
      </Badge>
    );
  };

  const getScheduleBadge = () => {
    const colors: Record<string, string> = {
      manual: 'bg-gray-100 text-gray-800',
      interval: 'bg-blue-100 text-blue-800',
      cron: 'bg-green-100 text-green-800',
      real_time: 'bg-purple-100 text-purple-800',
    };

    return (
      <Badge 
        variant="secondary" 
        className={`${colors[alert.scheduleType] || 'bg-gray-100 text-gray-800'}`}
      >
        <ClockIcon className="h-3 w-3 mr-1" />
        {getScheduleDisplayText()}
      </Badge>
    );
  };

  return (
    <Card className="p-6 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-start justify-between mb-3">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h3 className="text-lg font-semibold text-gray-900 truncate">
                  {alert.name}
                </h3>
                {getStatusBadge()}
              </div>
              
              {alert.description && (
                <p className="text-sm text-gray-600 mb-2 line-clamp-2">
                  {alert.description}
                </p>
              )}
            </div>
            
            <div className="relative ml-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowActions(!showActions)}
              >
                <MoreHorizontalIcon className="h-4 w-4" />
              </Button>
              
              {showActions && (
                <div className="absolute right-0 top-8 bg-white border rounded-md shadow-lg z-10 py-1 min-w-[140px]">
                  <button
                    onClick={() => {
                      onEdit();
                      setShowActions(false);
                    }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 flex items-center gap-2"
                  >
                    <EditIcon className="h-4 w-4" />
                    Edit
                  </button>
                  
                  <button
                    onClick={() => {
                      onViewDetails?.();
                      setShowActions(false);
                    }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100"
                  >
                    View Details
                  </button>
                  
                  <div className="border-t my-1"></div>
                  
                  <button
                    onClick={() => {
                      onDelete();
                      setShowActions(false);
                    }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 text-red-600 flex items-center gap-2"
                  >
                    <TrashIcon className="h-4 w-4" />
                    Delete
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Alert Details */}
          <div className="space-y-3">
            {/* Saved Search */}
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <span className="font-medium">Saved Search:</span>
              <span className="text-blue-600">{alert.savedSearch.name}</span>
            </div>

            {/* Schedule and Status */}
            <div className="flex flex-wrap gap-2">
              {getScheduleBadge()}
              
              {alert.lastTriggeredAt && (
                <Badge variant="outline" className="text-xs">
                  Last triggered {formatDate(alert.lastTriggeredAt)}
                </Badge>
              )}
              
              {alert.nextScheduledAt && alert.isActive && alert.scheduleType !== 'manual' && (
                <Badge variant="outline" className="text-xs">
                  Next {formatNextExecution(alert.nextScheduledAt)}
                </Badge>
              )}
            </div>

            {/* Notification Channels */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600 font-medium">Notifications:</span>
              <div className="flex gap-1">
                {alert.notificationChannels.map((channel, index) => (
                  <Badge key={index} variant="secondary" className="flex items-center gap-1 text-xs">
                    {getChannelIcon(channel.type)}
                    {channel.type}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between pt-4 mt-4 border-t">
        <div className="text-xs text-gray-500">
          Created {formatDate(alert.createdAt)}
          {alert.updatedAt !== alert.createdAt && (
            <span> • Updated {formatDate(alert.updatedAt)}</span>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleToggleActive}
            disabled={isToggling}
          >
            {isToggling ? (
              <span className="animate-spin">⏳</span>
            ) : alert.isActive ? (
              <PauseIcon className="h-4 w-4" />
            ) : (
              <PlayIcon className="h-4 w-4" />
            )}
            {alert.isActive ? 'Pause' : 'Activate'}
          </Button>
          
          {alert.isActive && (
            <Button
              variant="default"
              size="sm"
              onClick={handleTrigger}
              disabled={isTriggering}
            >
              {isTriggering ? (
                <span className="animate-spin mr-2">⏳</span>
              ) : (
                <PlayIcon className="h-4 w-4 mr-2" />
              )}
              {isTriggering ? 'Triggering...' : 'Trigger Now'}
            </Button>
          )}
        </div>
      </div>

      {/* Click outside to close actions menu */}
      {showActions && (
        <div 
          className="fixed inset-0 z-0" 
          onClick={() => setShowActions(false)}
        />
      )}
    </Card>
  );
}