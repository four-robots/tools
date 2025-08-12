'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Activity, 
  Users, 
  Zap, 
  Clock,
  MousePointer,
  Edit,
  MessageSquare,
  Trash2,
  Plus,
  Pause,
  Play,
  AlertCircle,
  CheckCircle,
  Info,
  TrendingUp,
  TrendingDown
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRealTimeAnalytics } from '../hooks/useWhiteboardAnalytics';
import { formatMetadataEntries, sanitizeForDisplay } from '@/lib/sanitize';

interface RealTimeAnalyticsProps {
  whiteboardId: string;
  className?: string;
  showEvents?: boolean;
  showMetrics?: boolean;
  maxEvents?: number;
  updateInterval?: number;
}

const eventIcons = {
  create: Plus,
  edit: Edit,
  delete: Trash2,
  comment: MessageSquare,
  cursor: MousePointer,
  select: Activity,
  collaborate: Users,
  error: AlertCircle,
  performance: Zap,
} as const;

const eventColors = {
  create: 'bg-green-100 text-green-800 border-green-200',
  edit: 'bg-blue-100 text-blue-800 border-blue-200',
  delete: 'bg-red-100 text-red-800 border-red-200',
  comment: 'bg-purple-100 text-purple-800 border-purple-200',
  cursor: 'bg-gray-100 text-gray-800 border-gray-200',
  select: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  collaborate: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  error: 'bg-red-100 text-red-800 border-red-200',
  performance: 'bg-orange-100 text-orange-800 border-orange-200',
} as const;

const metricThresholds = {
  load_time: { good: 1000, warning: 3000 },
  ot_latency: { good: 50, warning: 200 },
  render_time: { good: 16, warning: 33 }, // 60fps = 16ms, 30fps = 33ms
  memory_usage: { good: 50, warning: 100 },
  connection_quality: { good: 90, warning: 70 },
} as const;

function formatEventAction(action: string): string {
  return action
    .replace(/_/g, ' ')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function formatMetricValue(value: number, unit: string): string {
  if (unit === 'ms') {
    return `${value.toFixed(1)}ms`;
  } else if (unit === 'MB') {
    return `${value.toFixed(1)}MB`;
  } else if (unit === 'fps') {
    return `${value.toFixed(0)}fps`;
  } else if (unit === 'percent') {
    return `${value.toFixed(1)}%`;
  }
  return `${value}${unit}`;
}

function getMetricStatus(metricType: string, value: number): 'good' | 'warning' | 'critical' {
  const thresholds = metricThresholds[metricType as keyof typeof metricThresholds];
  if (!thresholds) return 'good';

  if (value <= thresholds.good) return 'good';
  if (value <= thresholds.warning) return 'warning';
  return 'critical';
}

function formatTimeAgo(timestamp: string): string {
  const now = new Date();
  const eventTime = new Date(timestamp);
  const diff = now.getTime() - eventTime.getTime();

  if (diff < 1000) return 'just now';
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  return `${Math.floor(diff / 3600000)}h ago`;
}

export function RealTimeAnalytics({ 
  whiteboardId,
  className,
  showEvents = true,
  showMetrics = true,
  maxEvents = 20,
  updateInterval = 1000,
}: RealTimeAnalyticsProps) {
  const [isPaused, setIsPaused] = useState(false);
  const [eventFilter, setEventFilter] = useState<string>('all');
  
  const realTimeData = useRealTimeAnalytics(whiteboardId, !isPaused);

  // Filter events based on selected filter
  const filteredEvents = realTimeData?.recentEvents?.filter(event => {
    if (eventFilter === 'all') return true;
    return event.type === eventFilter;
  }) || [];

  const togglePause = () => {
    setIsPaused(!isPaused);
  };

  const getUniqueEventTypes = () => {
    if (!realTimeData?.recentEvents) return [];
    const types = new Set(realTimeData.recentEvents.map(event => event.type));
    return Array.from(types);
  };

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Real-time Activity
            </CardTitle>
            <CardDescription>
              Live analytics and performance monitoring
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={togglePause}
              className="flex items-center gap-1"
            >
              {isPaused ? (
                <>
                  <Play className="h-3 w-3" />
                  Resume
                </>
              ) : (
                <>
                  <Pause className="h-3 w-3" />
                  Pause
                </>
              )}
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Current Status */}
        {realTimeData && (
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Active Users</span>
              </div>
              <Badge variant="secondary" className="text-sm">
                {realTimeData.activeUsers || 0}
              </Badge>
            </div>
            
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Sessions</span>
              </div>
              <Badge variant="secondary" className="text-sm">
                {realTimeData.currentSessions || 0}
              </Badge>
            </div>
          </div>
        )}

        {/* Performance Metrics */}
        {showMetrics && realTimeData?.performanceMetrics && realTimeData.performanceMetrics.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold">Performance Metrics</h4>
              <Badge variant="outline" className="text-xs">
                Live
              </Badge>
            </div>
            
            <div className="grid grid-cols-1 gap-2">
              {realTimeData.performanceMetrics.slice(0, 5).map((metric, index) => {
                const status = getMetricStatus(metric.type, metric.value);
                const StatusIcon = status === 'good' ? CheckCircle : 
                                 status === 'warning' ? AlertCircle : AlertCircle;
                
                return (
                  <div key={index} className="flex items-center justify-between p-2 border rounded">
                    <div className="flex items-center gap-2">
                      <StatusIcon className={cn(
                        "h-3 w-3",
                        status === 'good' && "text-green-500",
                        status === 'warning' && "text-yellow-500",
                        status === 'critical' && "text-red-500"
                      )} />
                      <span className="text-xs font-medium">
                        {formatEventAction(metric.type)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono">
                        {formatMetricValue(metric.value, metric.unit)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatTimeAgo(metric.timestamp)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Event Stream */}
        {showEvents && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold">Recent Events</h4>
              <div className="flex items-center gap-2">
                <select
                  value={eventFilter}
                  onChange={(e) => setEventFilter(e.target.value)}
                  className="text-xs border rounded px-2 py-1"
                >
                  <option value="all">All Events</option>
                  {getUniqueEventTypes().map(type => (
                    <option key={type} value={type}>
                      {formatEventAction(type)}
                    </option>
                  ))}
                </select>
                <Badge variant="outline" className="text-xs">
                  {filteredEvents.length}
                </Badge>
              </div>
            </div>

            <ScrollArea className="h-64">
              <div className="space-y-2">
                {filteredEvents.slice(0, maxEvents).map((event, index) => {
                  const eventType = event.action as keyof typeof eventIcons;
                  const Icon = eventIcons[eventType] || Activity;
                  const colorClass = eventColors[eventType] || eventColors.cursor;
                  
                  return (
                    <div key={index} className="flex items-center gap-3 p-2 border rounded-lg hover:bg-muted/50 transition-colors">
                      <div className={cn(
                        "flex items-center justify-center w-6 h-6 rounded-full border text-xs",
                        colorClass
                      )}>
                        <Icon className="h-3 w-3" />
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate">
                            {formatEventAction(event.action)}
                          </span>
                          <Badge variant="outline" className="text-xs">
                            User {sanitizeForDisplay(event.userId.slice(-4))}
                          </Badge>
                        </div>
                        
                        {event.metadata && Object.keys(event.metadata).length > 0 && (
                          <div className="text-xs text-muted-foreground truncate mt-1">
                            {formatMetadataEntries(event.metadata, 2, ' • ')}
                          </div>
                        )}
                      </div>
                      
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatTimeAgo(event.timestamp)}
                      </span>
                    </div>
                  );
                })}
                
                {filteredEvents.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">
                      {isPaused ? 'Analytics paused' : 'No events yet'}
                    </p>
                    <p className="text-xs">
                      {isPaused ? 'Click resume to continue monitoring' : 'Activity will appear here as it happens'}
                    </p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Connection Status */}
        <div className="flex items-center justify-between p-2 bg-muted/50 rounded text-xs">
          <div className="flex items-center gap-2">
            <div className={cn(
              "w-2 h-2 rounded-full",
              realTimeData ? "bg-green-500" : "bg-red-500"
            )} />
            <span className="text-muted-foreground">
              {realTimeData ? 'Connected' : 'Disconnected'}
            </span>
          </div>
          
          {realTimeData && (
            <span className="text-muted-foreground">
              {realTimeData.recentEvents?.length || 0} events tracked
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default RealTimeAnalytics;