/**
 * Conflict Metrics Component
 * 
 * Displays real-time metrics and analytics for conflict resolution sessions
 * including resolution rates, performance statistics, and trend analysis.
 */

'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { 
  TrendingUp, 
  TrendingDown, 
  Clock, 
  Users, 
  CheckCircle, 
  AlertTriangle,
  BarChart3,
  Timer
} from 'lucide-react';

interface ConflictMetric {
  label: string;
  value: number;
  unit: string;
  trend?: 'up' | 'down' | 'stable';
  trendValue?: number;
  description: string;
}

interface ResolutionStats {
  totalConflicts: number;
  resolvedConflicts: number;
  averageResolutionTime: number;
  participantCount: number;
  successRate: number;
  mostCommonStrategy: string;
  currentSessionDuration: number;
}

interface ConflictMetricsProps {
  sessionId: string;
  stats: ResolutionStats;
  metrics: ConflictMetric[];
  showTrends?: boolean;
  showDetails?: boolean;
}

export const ConflictMetrics: React.FC<ConflictMetricsProps> = ({
  sessionId,
  stats,
  metrics,
  showTrends = true,
  showDetails = true
}) => {
  const formatDuration = (milliseconds: number) => {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  };

  const formatNumber = (value: number, unit: string) => {
    if (unit === '%') {
      return `${Math.round(value)}%`;
    } else if (unit === 'ms') {
      return formatDuration(value);
    } else if (unit === 'count') {
      return value.toString();
    }
    return `${value} ${unit}`;
  };

  const getTrendIcon = (trend?: 'up' | 'down' | 'stable') => {
    switch (trend) {
      case 'up':
        return <TrendingUp className="w-3 h-3 text-green-600" />;
      case 'down':
        return <TrendingDown className="w-3 h-3 text-red-600" />;
      default:
        return null;
    }
  };

  const getTrendColor = (trend?: 'up' | 'down' | 'stable') => {
    switch (trend) {
      case 'up':
        return 'text-green-600';
      case 'down':
        return 'text-red-600';
      default:
        return 'text-gray-500';
    }
  };

  return (
    <div className="space-y-4">
      {/* Session Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Session Overview
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Key Statistics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{stats.totalConflicts}</div>
              <div className="text-sm text-gray-500">Total Conflicts</div>
            </div>
            
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{stats.resolvedConflicts}</div>
              <div className="text-sm text-gray-500">Resolved</div>
            </div>
            
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">{stats.participantCount}</div>
              <div className="text-sm text-gray-500">Participants</div>
            </div>
            
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">
                {formatDuration(stats.currentSessionDuration)}
              </div>
              <div className="text-sm text-gray-500">Session Time</div>
            </div>
          </div>

          {/* Resolution Progress */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Resolution Progress</span>
              <span className="text-sm text-gray-500">
                {stats.resolvedConflicts} of {stats.totalConflicts}
              </span>
            </div>
            <Progress 
              value={(stats.resolvedConflicts / Math.max(stats.totalConflicts, 1)) * 100}
              className="h-3"
            />
          </div>

          {/* Success Rate */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Success Rate</span>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-600" />
                <span className="text-sm font-semibold text-green-600">
                  {Math.round(stats.successRate)}%
                </span>
              </div>
            </div>
            <Progress 
              value={stats.successRate}
              className="h-2"
            />
          </div>

          {/* Most Common Strategy */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Most Used Strategy</span>
            <Badge variant="secondary">
              {stats.mostCommonStrategy.replace('_', ' ')}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Performance Metrics */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Timer className="w-5 h-5" />
            Performance Metrics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4">
            {metrics.map((metric, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium">{metric.label}</span>
                    {showTrends && getTrendIcon(metric.trend)}
                  </div>
                  {showDetails && (
                    <p className="text-xs text-gray-600">{metric.description}</p>
                  )}
                </div>
                
                <div className="text-right">
                  <div className="text-lg font-semibold">
                    {formatNumber(metric.value, metric.unit)}
                  </div>
                  {showTrends && metric.trend && metric.trendValue !== undefined && (
                    <div className={`text-xs ${getTrendColor(metric.trend)}`}>
                      {metric.trend === 'up' ? '+' : metric.trend === 'down' ? '-' : ''}
                      {Math.abs(metric.trendValue)}%
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Real-time Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Real-time Status
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Current Activity */}
          <div className="flex items-center justify-between">
            <span className="text-sm">Active Conflicts</span>
            <div className="flex items-center gap-2">
              {stats.totalConflicts - stats.resolvedConflicts > 0 ? (
                <>
                  <AlertTriangle className="w-4 h-4 text-orange-500" />
                  <span className="text-sm font-medium text-orange-600">
                    {stats.totalConflicts - stats.resolvedConflicts} remaining
                  </span>
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  <span className="text-sm font-medium text-green-600">
                    All resolved
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Session Health */}
          <div className="flex items-center justify-between">
            <span className="text-sm">Session Health</span>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span className="text-sm font-medium text-green-600">Healthy</span>
            </div>
          </div>

          {/* Average Response Time */}
          <div className="flex items-center justify-between">
            <span className="text-sm">Avg. Response Time</span>
            <span className="text-sm font-medium">
              {formatDuration(stats.averageResolutionTime)}
            </span>
          </div>

          {/* Participants Online */}
          <div className="flex items-center justify-between">
            <span className="text-sm">Participants Online</span>
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-500" />
              <span className="text-sm font-medium">{stats.participantCount}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Session Details */}
      {showDetails && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Session Details</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-gray-600 space-y-1">
            <div>Session ID: {sessionId}</div>
            <div>Started: {formatDuration(stats.currentSessionDuration)} ago</div>
            <div>Last Update: Just now</div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};