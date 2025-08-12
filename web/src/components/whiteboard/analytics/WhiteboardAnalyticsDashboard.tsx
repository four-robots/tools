'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { 
  BarChart3, 
  Clock, 
  Users, 
  MessageSquare,
  Zap,
  Target,
  Calendar,
  Activity,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  PieChart,
  Eye,
  Edit,
  Trash2,
  MousePointer,
  GitBranch,
  AlertTriangle,
  CheckCircle,
  Info,
  Lightbulb,
  Share2
} from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { sanitizeForDisplay } from '@/lib/sanitize';

// Analytics data types
interface WhiteboardAnalyticsData {
  summary: {
    totalUsers: number;
    totalSessions: number;
    avgEngagement: number;
    performanceScore: number;
  };
  trends: {
    userGrowth: number;
    engagementTrend: number;
    performanceTrend: number;
  };
  metrics: {
    totalSessions: number;
    uniqueUsers: number;
    totalDurationMinutes: number;
    avgSessionDuration: number;
    totalActions: number;
    elementsCreated: number;
    elementsModified: number;
    elementsDeleted: number;
    commentsCreated: number;
    concurrentUsersPeak: number;
    collaborationEvents: number;
    conflictResolutions: number;
    templateApplications: number;
    errorRate: number;
    toolUsageStats: Record<string, number>;
    activityPatterns: Record<string, number>;
  }[];
  sessions: {
    id: string;
    userId: string;
    sessionStart: string;
    sessionEnd?: string;
    durationMinutes?: number;
    totalActions: number;
    elementsCreated: number;
    elementsModified: number;
    elementsDeleted: number;
    commentsCreated: number;
    toolsUsed: string[];
    collaborationScore: number;
    errorCount: number;
    disconnectReason?: string;
  }[];
  insights: {
    id: string;
    insightType: string;
    insightCategory: 'positive' | 'warning' | 'critical' | 'information';
    title: string;
    description: string;
    severityScore: number;
    confidenceScore: number;
    recommendations: string[];
    isActive: boolean;
    createdAt: string;
  }[];
  userBehavior: {
    userId: string;
    date: string;
    sessionCount: number;
    totalTimeMinutes: number;
    preferredTools: string[];
    engagementScore: number;
    productivityScore: number;
    collaborationStyle?: string;
  }[];
  performance: {
    metricType: string;
    metricValue: number;
    metricUnit: string;
    isAboveThreshold: boolean;
    recordedAt: string;
  }[];
}

interface WhiteboardAnalyticsDashboardProps {
  whiteboardId: string;
  className?: string;
  onExportData?: () => void;
  onShareReport?: () => void;
}

// Mock hook for whiteboard analytics - in real implementation, this would fetch from API
function useWhiteboardAnalytics(whiteboardId: string, timeRange: string) {
  const [data, setData] = useState<WhiteboardAnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Simulate API call
    const fetchData = async () => {
      setIsLoading(true);
      try {
        // Mock data - in real implementation, this would be an API call
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        setData({
          summary: {
            totalUsers: 45,
            totalSessions: 128,
            avgEngagement: 78.5,
            performanceScore: 89.2,
          },
          trends: {
            userGrowth: 12.3,
            engagementTrend: 8.7,
            performanceTrend: 5.2,
          },
          metrics: [{
            totalSessions: 128,
            uniqueUsers: 45,
            totalDurationMinutes: 3420,
            avgSessionDuration: 26.7,
            totalActions: 2840,
            elementsCreated: 450,
            elementsModified: 890,
            elementsDeleted: 120,
            commentsCreated: 340,
            concurrentUsersPeak: 12,
            collaborationEvents: 567,
            conflictResolutions: 23,
            templateApplications: 15,
            errorRate: 2.1,
            toolUsageStats: {
              pen: 35,
              rectangle: 25,
              text: 20,
              arrow: 12,
              sticky: 8,
            },
            activityPatterns: {
              morning: 30,
              afternoon: 45,
              evening: 25,
            },
          }],
          sessions: [
            {
              id: '1',
              userId: 'user1',
              sessionStart: '2024-01-15T09:00:00Z',
              sessionEnd: '2024-01-15T10:30:00Z',
              durationMinutes: 90,
              totalActions: 45,
              elementsCreated: 8,
              elementsModified: 12,
              elementsDeleted: 2,
              commentsCreated: 5,
              toolsUsed: ['pen', 'rectangle', 'text'],
              collaborationScore: 85,
              errorCount: 0,
              disconnectReason: 'normal',
            },
          ],
          insights: [
            {
              id: '1',
              insightType: 'collaboration_trend',
              insightCategory: 'positive',
              title: 'High Collaboration Activity',
              description: 'This whiteboard shows excellent collaboration patterns with 12 concurrent users at peak.',
              severityScore: 3.0,
              confidenceScore: 0.9,
              recommendations: [
                'Consider documenting successful collaboration practices',
                'Share insights with other teams',
              ],
              isActive: true,
              createdAt: '2024-01-15T12:00:00Z',
            },
            {
              id: '2',
              insightType: 'performance_issue',
              insightCategory: 'warning',
              title: 'Slow Operations Detected',
              description: 'Some operations are taking longer than expected, affecting user experience.',
              severityScore: 6.5,
              confidenceScore: 0.8,
              recommendations: [
                'Optimize canvas rendering',
                'Check network connectivity',
                'Consider reducing element complexity',
              ],
              isActive: true,
              createdAt: '2024-01-15T11:00:00Z',
            },
          ],
          userBehavior: [
            {
              userId: 'user1',
              date: '2024-01-15',
              sessionCount: 3,
              totalTimeMinutes: 120,
              preferredTools: ['pen', 'text', 'rectangle'],
              engagementScore: 88,
              productivityScore: 92,
              collaborationStyle: 'collaborative',
            },
          ],
          performance: [
            {
              metricType: 'load_time',
              metricValue: 850,
              metricUnit: 'ms',
              isAboveThreshold: false,
              recordedAt: '2024-01-15T12:00:00Z',
            },
            {
              metricType: 'ot_latency',
              metricValue: 45,
              metricUnit: 'ms',
              isAboveThreshold: false,
              recordedAt: '2024-01-15T12:00:00Z',
            },
          ],
        });
      } catch (error) {
        setError('Failed to fetch analytics data');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [whiteboardId, timeRange]);

  return { data, isLoading, error };
}

export function WhiteboardAnalyticsDashboard({ 
  whiteboardId, 
  className,
  onExportData,
  onShareReport
}: WhiteboardAnalyticsDashboardProps) {
  const [timeRange, setTimeRange] = useState('week');
  const [activeTab, setActiveTab] = useState('overview');
  
  const { data, isLoading, error } = useWhiteboardAnalytics(whiteboardId, timeRange);

  // Calculate derived metrics
  const derivedMetrics = useMemo(() => {
    if (!data) return null;

    const latestMetrics = data.metrics[0];
    return {
      avgActionsPerSession: latestMetrics?.totalActions / latestMetrics?.totalSessions || 0,
      collaborationRate: (latestMetrics?.collaborationEvents / latestMetrics?.totalActions) * 100 || 0,
      conflictRate: (latestMetrics?.conflictResolutions / latestMetrics?.collaborationEvents) * 100 || 0,
      engagementHealth: data.summary.avgEngagement > 70 ? 'high' : data.summary.avgEngagement > 40 ? 'medium' : 'low',
      performanceHealth: data.summary.performanceScore > 80 ? 'excellent' : data.summary.performanceScore > 60 ? 'good' : 'needs-improvement',
    };
  }, [data]);

  const handleTimeRangeChange = (newTimeRange: string) => {
    setTimeRange(newTimeRange);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <LoadingSpinner size="lg" />
        <span className="ml-2 text-muted-foreground">Loading whiteboard analytics...</span>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!data) return null;

  return (
    <TooltipProvider>
      <div className={`space-y-6 ${className}`}>
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Whiteboard Analytics</h1>
            <p className="text-muted-foreground">
              Insights into collaboration patterns, usage, and performance
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={timeRange} onValueChange={handleTimeRangeChange}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="day">24 Hours</SelectItem>
                <SelectItem value="week">7 Days</SelectItem>
                <SelectItem value="month">30 Days</SelectItem>
                <SelectItem value="quarter">3 Months</SelectItem>
              </SelectContent>
            </Select>
            {onExportData && (
              <Button onClick={onExportData} variant="outline" size="sm">
                <BarChart3 className="h-4 w-4 mr-2" />
                Export
              </Button>
            )}
            {onShareReport && (
              <Button onClick={onShareReport} variant="outline" size="sm">
                <Share2 className="h-4 w-4 mr-2" />
                Share
              </Button>
            )}
            <Button variant="outline" size="sm">
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Users</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{data.summary.totalUsers}</div>
              <div className="flex items-center text-xs text-muted-foreground">
                {data.trends.userGrowth > 0 ? (
                  <TrendingUp className="h-3 w-3 mr-1 text-green-500" />
                ) : (
                  <TrendingDown className="h-3 w-3 mr-1 text-red-500" />
                )}
                {Math.abs(data.trends.userGrowth)}% from last {timeRange}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Sessions</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{data.summary.totalSessions}</div>
              <p className="text-xs text-muted-foreground">
                Avg {data.metrics[0]?.avgSessionDuration.toFixed(1)}min duration
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Engagement</CardTitle>
              <Target className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{data.summary.avgEngagement.toFixed(1)}%</div>
              <div className="flex items-center text-xs text-muted-foreground">
                <Badge variant={derivedMetrics?.engagementHealth === 'high' ? 'default' : 
                              derivedMetrics?.engagementHealth === 'medium' ? 'secondary' : 'destructive'}>
                  {derivedMetrics?.engagementHealth}
                </Badge>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Performance</CardTitle>
              <Zap className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{data.summary.performanceScore.toFixed(1)}</div>
              <div className="flex items-center text-xs text-muted-foreground">
                <Badge variant={derivedMetrics?.performanceHealth === 'excellent' ? 'default' : 
                              derivedMetrics?.performanceHealth === 'good' ? 'secondary' : 'destructive'}>
                  {derivedMetrics?.performanceHealth}
                </Badge>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="collaboration">Collaboration</TabsTrigger>
            <TabsTrigger value="performance">Performance</TabsTrigger>
            <TabsTrigger value="behavior">User Behavior</TabsTrigger>
            <TabsTrigger value="insights">Insights</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              {/* Activity Overview */}
              <Card>
                <CardHeader>
                  <CardTitle>Activity Overview</CardTitle>
                  <CardDescription>
                    Actions and interactions on the whiteboard
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Elements Created</span>
                      <span className="font-medium">{data.metrics[0]?.elementsCreated}</span>
                    </div>
                    <Progress value={70} className="h-2" />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Elements Modified</span>
                      <span className="font-medium">{data.metrics[0]?.elementsModified}</span>
                    </div>
                    <Progress value={85} className="h-2" />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Comments Created</span>
                      <span className="font-medium">{data.metrics[0]?.commentsCreated}</span>
                    </div>
                    <Progress value={45} className="h-2" />
                  </div>
                </CardContent>
              </Card>

              {/* Tool Usage */}
              <Card>
                <CardHeader>
                  <CardTitle>Tool Usage</CardTitle>
                  <CardDescription>
                    Most popular drawing tools
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {Object.entries(data.metrics[0]?.toolUsageStats || {})
                      .sort(([,a], [,b]) => b - a)
                      .map(([tool, usage]) => (
                      <div key={tool} className="flex items-center justify-between">
                        <span className="text-sm font-medium capitalize">{tool}</span>
                        <div className="flex items-center gap-2">
                          <div className="h-2 bg-muted rounded-full w-20">
                            <div 
                              className="h-2 bg-primary rounded-full" 
                              style={{ width: `${usage}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground w-8">
                            {usage}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Activity Patterns */}
            <Card>
              <CardHeader>
                <CardTitle>Activity Patterns</CardTitle>
                <CardDescription>
                  When users are most active throughout the day
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4">
                  {Object.entries(data.metrics[0]?.activityPatterns || {}).map(([period, percentage]) => (
                    <div key={period} className="text-center space-y-2">
                      <div className="text-2xl font-bold">{percentage}%</div>
                      <div className="text-sm text-muted-foreground capitalize">{period}</div>
                      <Progress value={percentage} className="h-2" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Collaboration Tab */}
          <TabsContent value="collaboration" className="space-y-6">
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Peak Concurrent Users</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{data.metrics[0]?.concurrentUsersPeak}</div>
                  <p className="text-xs text-muted-foreground">Maximum at one time</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Collaboration Events</CardTitle>
                  <GitBranch className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{data.metrics[0]?.collaborationEvents}</div>
                  <p className="text-xs text-muted-foreground">
                    {derivedMetrics?.collaborationRate.toFixed(1)}% of all actions
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Conflict Resolutions</CardTitle>
                  <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{data.metrics[0]?.conflictResolutions}</div>
                  <p className="text-xs text-muted-foreground">
                    {derivedMetrics?.conflictRate.toFixed(1)}% conflict rate
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Recent Sessions */}
            <Card>
              <CardHeader>
                <CardTitle>Recent Collaborative Sessions</CardTitle>
                <CardDescription>
                  Latest user sessions with collaboration metrics
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {data.sessions.slice(0, 5).map((session) => (
                    <div key={session.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">User {sanitizeForDisplay(session.userId.slice(-4))}</Badge>
                          <span className="text-sm text-muted-foreground">
                            {session.durationMinutes}min session
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {session.totalActions} actions • {session.commentsCreated} comments • 
                          {session.toolsUsed.length} tools used
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-semibold">{session.collaborationScore}</div>
                        <div className="text-xs text-muted-foreground">collaboration score</div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Performance Tab */}
          <TabsContent value="performance" className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Load Time</CardTitle>
                  <Clock className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {data.performance.find(p => p.metricType === 'load_time')?.metricValue || 0}ms
                  </div>
                  <p className="text-xs text-muted-foreground">Average load time</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">OT Latency</CardTitle>
                  <Zap className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {data.performance.find(p => p.metricType === 'ot_latency')?.metricValue || 0}ms
                  </div>
                  <p className="text-xs text-muted-foreground">Operation transform latency</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Error Rate</CardTitle>
                  <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{data.metrics[0]?.errorRate}%</div>
                  <p className="text-xs text-muted-foreground">System error rate</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Template Usage</CardTitle>
                  <PieChart className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{data.metrics[0]?.templateApplications}</div>
                  <p className="text-xs text-muted-foreground">Templates applied</p>
                </CardContent>
              </Card>
            </div>

            {/* Performance Threshold Alerts */}
            <Card>
              <CardHeader>
                <CardTitle>Performance Alerts</CardTitle>
                <CardDescription>
                  Metrics exceeding recommended thresholds
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {data.performance
                    .filter(metric => metric.isAboveThreshold)
                    .map((metric, index) => (
                    <Alert key={index} variant="destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>
                        {metric.metricType.replace('_', ' ').toUpperCase()} is {metric.metricValue}{metric.metricUnit}, 
                        which exceeds the recommended threshold
                      </AlertDescription>
                    </Alert>
                  ))}
                  {data.performance.filter(metric => metric.isAboveThreshold).length === 0 && (
                    <div className="flex items-center gap-2 text-green-600">
                      <CheckCircle className="h-4 w-4" />
                      <span>All performance metrics are within acceptable ranges</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* User Behavior Tab */}
          <TabsContent value="behavior" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>User Behavior Patterns</CardTitle>
                <CardDescription>
                  Individual user engagement and productivity metrics
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {data.userBehavior.map((user, index) => (
                    <div key={user.userId} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">User {sanitizeForDisplay(user.userId.slice(-4))}</Badge>
                          <span className="text-sm text-muted-foreground capitalize">
                            {sanitizeForDisplay(user.collaborationStyle)} style
                          </span>
                        </div>
                        <div className="flex gap-4 text-sm">
                          <span>Engagement: <strong>{user.engagementScore}</strong></span>
                          <span>Productivity: <strong>{user.productivityScore}</strong></span>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <div className="text-muted-foreground">Sessions</div>
                          <div className="font-medium">{user.sessionCount}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Total Time</div>
                          <div className="font-medium">{user.totalTimeMinutes}min</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Preferred Tools</div>
                          <div className="font-medium">{user.preferredTools.slice(0, 2).join(', ')}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Insights Tab */}
          <TabsContent value="insights" className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold">Whiteboard Insights</h3>
                <p className="text-sm text-muted-foreground">
                  AI-powered insights to improve collaboration and performance
                </p>
              </div>
              <Button variant="outline">
                <Lightbulb className="h-4 w-4 mr-2" />
                Generate New Insights
              </Button>
            </div>

            <div className="space-y-4">
              {data.insights.map((insight) => (
                <Card key={insight.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <CardTitle className="text-lg">{sanitizeForDisplay(insight.title)}</CardTitle>
                        <div className="flex items-center gap-2">
                          <Badge variant={
                            insight.insightCategory === 'positive' ? 'default' :
                            insight.insightCategory === 'warning' ? 'secondary' :
                            insight.insightCategory === 'critical' ? 'destructive' : 'outline'
                          }>
                            {insight.insightCategory}
                          </Badge>
                          <span className="text-sm text-muted-foreground">
                            Confidence: {(insight.confidenceScore * 100).toFixed(0)}%
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-semibold">{insight.severityScore.toFixed(1)}</div>
                        <div className="text-xs text-muted-foreground">severity</div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground mb-4">{sanitizeForDisplay(insight.description)}</p>
                    
                    {insight.recommendations.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="font-medium text-sm">Recommendations:</h4>
                        <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                          {insight.recommendations.map((rec, index) => (
                            <li key={index}>{sanitizeForDisplay(rec)}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </TooltipProvider>
  );
}

export default WhiteboardAnalyticsDashboard;