'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { SearchPatternAnalytics } from './SearchPatternAnalytics';
import { UserJourneyMap } from './UserJourneyMap';
import { EngagementMetrics } from './EngagementMetrics';
import { BehaviorInsightsPanel } from './BehaviorInsightsPanel';
import { SearchHeatmap } from './SearchHeatmap';
import { TopicClusterVisualization } from './TopicClusterVisualization';
import { TemporalPatternChart } from './TemporalPatternChart';

interface DashboardMetrics {
  totalUsers: number;
  activeUsers: number;
  totalEvents: number;
  avgSessionDuration: number;
  topEventTypes: Array<{ type: string; count: number; percentage: number }>;
  topPatterns: Array<{ type: string; name: string; count: number }>;
  engagementDistribution: {
    high: number;
    medium: number;
    low: number;
  };
  searchMetrics: {
    totalSearches: number;
    avgQueryLength: number;
    successRate: number;
    refinementRate: number;
  };
  performanceMetrics: {
    avgResponseTime: number;
    avgSearchDuration: number;
    errorRate: number;
  };
  timeframe: {
    start: Date;
    end: Date;
    period: string;
  };
}

interface BehaviorDashboardProps {
  userId?: string;
  apiUrl?: string;
  dateRange?: {
    start: Date;
    end: Date;
  };
  className?: string;
}

export const BehaviorDashboard: React.FC<BehaviorDashboardProps> = ({
  userId,
  apiUrl = '/api/v1/behavior',
  dateRange: dateRangeProp,
  className = '',
}) => {
  const defaultDateRange = useMemo(() => ({
    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    end: new Date(),
  }), []);
  const dateRange = dateRangeProp ?? defaultDateRange;

  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDashboardMetrics = async () => {
    try {
      setError(null);
      
      const params = new URLSearchParams({
        startDate: dateRange.start.toISOString(),
        endDate: dateRange.end.toISOString(),
        period: 'day',
      });

      if (userId) {
        params.append('userId', userId);
      }

      const endpoint = userId ? `${apiUrl}/analytics/trends` : `${apiUrl}/analytics/dashboard`;
      const response = await fetch(`${endpoint}?${params}`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch metrics: ${response.statusText}`);
      }

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.message || 'Failed to load dashboard metrics');
      }

      setMetrics(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard');
      console.error('Dashboard fetch error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchDashboardMetrics();
  };

  const startTime = dateRange.start.getTime();
  const endTime = dateRange.end.getTime();
  useEffect(() => {
    fetchDashboardMetrics();
  }, [userId, startTime, endTime]);

  const formatDuration = (ms: number): string => {
    const minutes = Math.round(ms / 1000 / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  };

  const formatNumber = (num: number): string => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  if (loading) {
    return (
      <div className={`flex items-center justify-center h-64 ${className}`}>
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <Card className={className}>
        <CardContent className="flex flex-col items-center justify-center h-64 space-y-4">
          <div className="text-red-500 text-center">
            <h3 className="font-medium">Failed to load dashboard</h3>
            <p className="text-sm text-muted-foreground mt-1">{error}</p>
          </div>
          <Button onClick={handleRefresh} variant="outline" size="sm">
            Try Again
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!metrics) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">No data available</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">
            {userId ? 'Your Behavior Analytics' : 'Behavior Analytics Dashboard'}
          </h2>
          <p className="text-muted-foreground">
            {dateRange.start.toLocaleDateString()} - {dateRange.end.toLocaleDateString()}
          </p>
        </div>
        <Button 
          onClick={handleRefresh} 
          disabled={refreshing}
          variant="outline"
          size="sm"
        >
          {refreshing ? <LoadingSpinner size="sm" /> : '↻'} Refresh
        </Button>
      </div>

      {/* Key Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Events</CardTitle>
            <span className="text-2xl">📊</span>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(metrics.totalEvents)}</div>
            <p className="text-xs text-muted-foreground">
              Across {formatNumber(metrics.activeUsers)} users
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Session</CardTitle>
            <span className="text-2xl">⏱️</span>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatDuration(metrics.avgSessionDuration)}</div>
            <p className="text-xs text-muted-foreground">
              Per active session
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Search Success</CardTitle>
            <span className="text-2xl">🎯</span>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{Math.round(metrics.searchMetrics.successRate * 100)}%</div>
            <p className="text-xs text-muted-foreground">
              {formatNumber(metrics.searchMetrics.totalSearches)} searches
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Performance</CardTitle>
            <span className="text-2xl">⚡</span>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.performanceMetrics.avgResponseTime}ms</div>
            <p className="text-xs text-muted-foreground">
              Average response time
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Engagement Distribution */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">User Engagement Distribution</CardTitle>
          <CardDescription>
            How users are distributed across engagement levels
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 bg-green-500 rounded"></div>
              <span className="text-sm">High: {metrics.engagementDistribution.high}%</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 bg-yellow-500 rounded"></div>
              <span className="text-sm">Medium: {metrics.engagementDistribution.medium}%</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 bg-red-500 rounded"></div>
              <span className="text-sm">Low: {metrics.engagementDistribution.low}%</span>
            </div>
          </div>
          
          <div className="mt-4 w-full bg-gray-200 rounded-full h-2 overflow-hidden">
            <div className="flex h-full">
              <div 
                className="bg-green-500" 
                style={{ width: `${metrics.engagementDistribution.high}%` }}
              ></div>
              <div 
                className="bg-yellow-500" 
                style={{ width: `${metrics.engagementDistribution.medium}%` }}
              ></div>
              <div 
                className="bg-red-500" 
                style={{ width: `${metrics.engagementDistribution.low}%` }}
              ></div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Detailed Analytics Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-7">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="search">Search Patterns</TabsTrigger>
          <TabsTrigger value="journey">User Journey</TabsTrigger>
          <TabsTrigger value="heatmap">Heatmap</TabsTrigger>
          <TabsTrigger value="topics">Topics</TabsTrigger>
          <TabsTrigger value="temporal">Temporal</TabsTrigger>
          <TabsTrigger value="insights">Insights</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Top Event Types */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Top Event Types</CardTitle>
                <CardDescription>Most common user interactions</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {metrics.topEventTypes.slice(0, 5).map((eventType, index) => (
                    <div key={eventType.type} className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <Badge variant="secondary" className="text-xs">
                          #{index + 1}
                        </Badge>
                        <span className="text-sm font-medium capitalize">{eventType.type}</span>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium">{formatNumber(eventType.count)}</div>
                        <div className="text-xs text-muted-foreground">{eventType.percentage}%</div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Top Patterns */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Detected Patterns</CardTitle>
                <CardDescription>Common behavior patterns</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {metrics.topPatterns.slice(0, 5).map((pattern, index) => (
                    <div key={`${pattern.type}-${pattern.name}`} className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <Badge variant="outline" className="text-xs">
                          {pattern.type}
                        </Badge>
                        <span className="text-sm">{pattern.name}</span>
                      </div>
                      <div className="text-sm font-medium">{pattern.count}</div>
                    </div>
                  ))}
                  {metrics.topPatterns.length === 0 && (
                    <p className="text-sm text-muted-foreground">No patterns detected yet</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <EngagementMetrics userId={userId} apiUrl={apiUrl} dateRange={dateRange} />
        </TabsContent>

        <TabsContent value="search" className="space-y-4">
          <SearchPatternAnalytics userId={userId} apiUrl={apiUrl} dateRange={dateRange} />
        </TabsContent>

        <TabsContent value="journey" className="space-y-4">
          <UserJourneyMap userId={userId} apiUrl={apiUrl} dateRange={dateRange} />
        </TabsContent>

        <TabsContent value="heatmap" className="space-y-4">
          <SearchHeatmap userId={userId} apiUrl={apiUrl} dateRange={dateRange} />
        </TabsContent>

        <TabsContent value="topics" className="space-y-4">
          <TopicClusterVisualization userId={userId} apiUrl={apiUrl} dateRange={dateRange} />
        </TabsContent>

        <TabsContent value="temporal" className="space-y-4">
          <TemporalPatternChart userId={userId} apiUrl={apiUrl} dateRange={dateRange} />
        </TabsContent>

        <TabsContent value="insights" className="space-y-4">
          <BehaviorInsightsPanel userId={userId} apiUrl={apiUrl} />
        </TabsContent>
      </Tabs>
    </div>
  );
};