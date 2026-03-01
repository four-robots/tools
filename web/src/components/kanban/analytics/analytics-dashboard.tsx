'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Clock,
  Target,
  Users,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Filter,
  Download,
  RefreshCw,
  Activity,
  Timer,
  Flag,
  GitBranch,
  PieChart,
  LineChart
} from 'lucide-react';

interface AnalyticsData {
  overview: {
    total_cards: number;
    completed_cards: number;
    in_progress_cards: number;
    blocked_cards: number;
    overdue_cards: number;
    completion_rate: number;
    average_cycle_time: number;
    average_lead_time: number;
  };
  velocity: {
    current_sprint: number;
    last_sprint: number;
    average_velocity: number;
    trend: 'up' | 'down' | 'stable';
  };
  time_tracking: {
    total_time_logged: number;
    billable_time: number;
    efficiency_rate: number;
    most_time_consuming_cards: Array<{
      id: string;
      title: string;
      time_spent: number;
      estimated_time: number;
    }>;
  };
  burndown: Array<{
    date: string;
    ideal: number;
    actual: number;
    completed: number;
  }>;
  distribution: {
    by_priority: Record<string, number>;
    by_assignee: Record<string, number>;
    by_column: Record<string, number>;
    by_milestone: Record<string, number>;
    by_age: {
      '0-7_days': number;
      '8-30_days': number;
      '31-90_days': number;
      '90+_days': number;
    };
  };
  trends: {
    cards_created: Array<{ date: string; count: number }>;
    cards_completed: Array<{ date: string; count: number }>;
    cycle_time: Array<{ date: string; average: number }>;
    lead_time: Array<{ date: string; average: number }>;
  };
  bottlenecks: Array<{
    column: string;
    card_count: number;
    average_time: number;
    wip_limit: number;
    severity: 'high' | 'medium' | 'low';
  }>;
  milestones: Array<{
    id: string;
    name: string;
    progress: number;
    due_date: string;
    cards_completed: number;
    cards_total: number;
    on_track: boolean;
  }>;
}

interface AnalyticsDashboardProps {
  boardId: string;
  data: AnalyticsData;
  dateRange: { from: string; to: string };
  onDateRangeChange: (range: { from: string; to: string }) => void;
  onRefresh: () => void;
  onExport: (format: 'pdf' | 'csv') => void;
}

export function AnalyticsDashboard({
  boardId,
  data,
  dateRange,
  onDateRangeChange,
  onRefresh,
  onExport,
}: AnalyticsDashboardProps) {
  const [activeTab, setActiveTab] = useState('overview');

  const formatDuration = (minutes: number): string => {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  const getTrendIcon = (trend: 'up' | 'down' | 'stable') => {
    switch (trend) {
      case 'up':
        return <TrendingUp className="w-4 h-4 text-green-600" />;
      case 'down':
        return <TrendingDown className="w-4 h-4 text-red-600" />;
      default:
        return <Activity className="w-4 h-4 text-gray-600" />;
    }
  };

  const getBottleneckSeverityColor = (severity: 'high' | 'medium' | 'low') => {
    switch (severity) {
      case 'high':
        return 'bg-red-100 text-red-800';
      case 'medium':
        return 'bg-orange-100 text-orange-800';
      case 'low':
        return 'bg-yellow-100 text-yellow-800';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Analytics Dashboard</h2>
          <p className="text-gray-600">Insights and metrics for your kanban board</p>
        </div>
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2">
            <label className="text-sm font-medium">From:</label>
            <input
              type="date"
              value={dateRange.from}
              onChange={(e) => onDateRangeChange({ ...dateRange, from: e.target.value })}
              className="px-3 py-1 border rounded text-sm"
            />
          </div>
          <div className="flex items-center space-x-2">
            <label className="text-sm font-medium">To:</label>
            <input
              type="date"
              value={dateRange.to}
              onChange={(e) => onDateRangeChange({ ...dateRange, to: e.target.value })}
              className="px-3 py-1 border rounded text-sm"
            />
          </div>
          <Button variant="outline" size="sm" onClick={onRefresh}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={() => onExport('pdf')}>
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="velocity">Velocity</TabsTrigger>
          <TabsTrigger value="time">Time Tracking</TabsTrigger>
          <TabsTrigger value="distribution">Distribution</TabsTrigger>
          <TabsTrigger value="trends">Trends</TabsTrigger>
          <TabsTrigger value="bottlenecks">Bottlenecks</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {/* Key Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Total Cards</p>
                    <p className="text-2xl font-bold">{data.overview.total_cards}</p>
                  </div>
                  <Activity className="w-8 h-8 text-blue-600" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Completion Rate</p>
                    <p className="text-2xl font-bold">{Math.round(data.overview.completion_rate)}%</p>
                  </div>
                  <CheckCircle2 className="w-8 h-8 text-green-600" />
                </div>
                <div className="mt-2">
                  <Progress value={data.overview.completion_rate} className="h-2" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Avg Cycle Time</p>
                    <p className="text-2xl font-bold">{formatDuration(data.overview.average_cycle_time)}</p>
                  </div>
                  <Clock className="w-8 h-8 text-orange-600" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Blocked Cards</p>
                    <p className="text-2xl font-bold text-red-600">{data.overview.blocked_cards}</p>
                  </div>
                  <AlertTriangle className="w-8 h-8 text-red-600" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Status Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Card Status Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <div className="w-3 h-3 rounded-full bg-green-500" />
                      <span>Completed</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="font-medium">{data.overview.completed_cards}</span>
                      <Badge className="bg-green-100 text-green-800">
                        {Math.round((data.overview.completed_cards / (data.overview.total_cards || 1)) * 100)}%
                      </Badge>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <div className="w-3 h-3 rounded-full bg-blue-500" />
                      <span>In Progress</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="font-medium">{data.overview.in_progress_cards}</span>
                      <Badge className="bg-blue-100 text-blue-800">
                        {Math.round((data.overview.in_progress_cards / (data.overview.total_cards || 1)) * 100)}%
                      </Badge>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <div className="w-3 h-3 rounded-full bg-red-500" />
                      <span>Blocked</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="font-medium">{data.overview.blocked_cards}</span>
                      <Badge className="bg-red-100 text-red-800">
                        {Math.round((data.overview.blocked_cards / (data.overview.total_cards || 1)) * 100)}%
                      </Badge>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <div className="w-3 h-3 rounded-full bg-orange-500" />
                      <span>Overdue</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="font-medium">{data.overview.overdue_cards}</span>
                      <Badge className="bg-orange-100 text-orange-800">
                        {Math.round((data.overview.overdue_cards / (data.overview.total_cards || 1)) * 100)}%
                      </Badge>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Milestone Progress</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {data.milestones.slice(0, 4).map((milestone) => (
                    <div key={milestone.id} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{milestone.name}</span>
                        <div className="flex items-center space-x-2">
                          <span className="text-sm text-gray-600">
                            {milestone.cards_completed}/{milestone.cards_total}
                          </span>
                          <Badge
                            className={milestone.on_track ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}
                          >
                            {milestone.on_track ? 'On Track' : 'Behind'}
                          </Badge>
                        </div>
                      </div>
                      <Progress value={milestone.progress} className="h-2" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="velocity" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Velocity Metrics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span>Current Sprint</span>
                  <div className="flex items-center space-x-2">
                    <span className="font-bold">{data.velocity.current_sprint}</span>
                    {getTrendIcon(data.velocity.trend)}
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span>Last Sprint</span>
                  <span className="font-bold">{data.velocity.last_sprint}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Average Velocity</span>
                  <span className="font-bold">{data.velocity.average_velocity}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Lead Time vs Cycle Time</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span>Average Lead Time</span>
                  <span className="font-bold">{formatDuration(data.overview.average_lead_time)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Average Cycle Time</span>
                  <span className="font-bold">{formatDuration(data.overview.average_cycle_time)}</span>
                </div>
                <div className="text-xs text-gray-600">
                  Lead time measures from creation to completion. Cycle time measures from start to completion.
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Burndown Chart</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-40 flex items-end space-x-1">
                  {data.burndown.slice(-10).map((point, index) => (
                    <div key={index} className="flex-1 flex flex-col items-center space-y-1">
                      <div className="flex flex-col items-center justify-end h-32 space-y-1">
                        <div
                          className="w-full bg-blue-500 rounded-t"
                          style={{ height: `${(point.actual / Math.max(...data.burndown.map(p => p.ideal))) * 100}%` }}
                          title={`Actual: ${point.actual}`}
                        />
                        <div
                          className="w-full bg-gray-300 rounded-t"
                          style={{ height: `${(point.ideal / Math.max(...data.burndown.map(p => p.ideal))) * 100}%` }}
                          title={`Ideal: ${point.ideal}`}
                        />
                      </div>
                      <span className="text-xs text-gray-600 rotate-45 origin-left">
                        {new Date(point.date).getMonth() + 1}/{new Date(point.date).getDate()}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-center space-x-4 mt-2 text-xs">
                  <div className="flex items-center space-x-1">
                    <div className="w-3 h-3 bg-blue-500 rounded" />
                    <span>Actual</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <div className="w-3 h-3 bg-gray-300 rounded" />
                    <span>Ideal</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="time" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Time Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span>Total Time Logged</span>
                  <span className="font-bold">{formatDuration(data.time_tracking.total_time_logged)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Billable Time</span>
                  <span className="font-bold text-green-600">{formatDuration(data.time_tracking.billable_time)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Efficiency Rate</span>
                  <span className="font-bold">{Math.round(data.time_tracking.efficiency_rate)}%</span>
                </div>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Most Time-Consuming Cards</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {data.time_tracking.most_time_consuming_cards.map((card, index) => (
                    <div key={card.id} className="flex items-center justify-between p-3 border rounded">
                      <div className="flex-1">
                        <h4 className="font-medium">{card.title}</h4>
                        <div className="flex items-center space-x-4 text-sm text-gray-600 mt-1">
                          <span>Spent: {formatDuration(card.time_spent)}</span>
                          <span>Estimated: {formatDuration(card.estimated_time)}</span>
                          <Badge
                            className={
                              card.time_spent > card.estimated_time
                                ? 'bg-red-100 text-red-800'
                                : 'bg-green-100 text-green-800'
                            }
                          >
                            {card.time_spent > card.estimated_time
                              ? `+${formatDuration(card.time_spent - card.estimated_time)} over`
                              : `${formatDuration(card.estimated_time - card.time_spent)} under`
                            }
                          </Badge>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="distribution" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Cards by Priority</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {Object.entries(data.distribution.by_priority).map(([priority, count]) => (
                    <div key={priority} className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <Flag className={`w-4 h-4 ${
                          priority === 'urgent' ? 'text-red-600' :
                          priority === 'high' ? 'text-orange-600' :
                          priority === 'medium' ? 'text-blue-600' :
                          'text-gray-600'
                        }`} />
                        <span className="capitalize">{priority}</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="font-medium">{count}</span>
                        <div className="w-20 bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-blue-500 h-2 rounded-full"
                            style={{ width: `${(count / (data.overview.total_cards || 1)) * 100}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Cards by Assignee</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {Object.entries(data.distribution.by_assignee).map(([assignee, count]) => (
                    <div key={assignee} className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <Users className="w-4 h-4 text-gray-600" />
                        <span>{assignee || 'Unassigned'}</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="font-medium">{count}</span>
                        <div className="w-20 bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-green-500 h-2 rounded-full"
                            style={{ width: `${(count / (data.overview.total_cards || 1)) * 100}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Cards by Column</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {Object.entries(data.distribution.by_column).map(([column, count]) => (
                    <div key={column} className="flex items-center justify-between">
                      <span>{column}</span>
                      <div className="flex items-center space-x-2">
                        <span className="font-medium">{count}</span>
                        <div className="w-20 bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-purple-500 h-2 rounded-full"
                            style={{ width: `${(count / (data.overview.total_cards || 1)) * 100}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Cards by Age</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {Object.entries(data.distribution.by_age).map(([age, count]) => (
                    <div key={age} className="flex items-center justify-between">
                      <span>{age.replace('_', ' ')}</span>
                      <div className="flex items-center space-x-2">
                        <span className="font-medium">{count}</span>
                        <div className="w-20 bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-orange-500 h-2 rounded-full"
                            style={{ width: `${(count / (data.overview.total_cards || 1)) * 100}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="trends" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Cards Created vs Completed</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-40 flex items-end space-x-1">
                  {data.trends.cards_created.slice(-10).map((point, index) => {
                    const completedPoint = data.trends.cards_completed[index];
                    const maxValue = Math.max(...data.trends.cards_created.map(p => p.count));
                    
                    return (
                      <div key={index} className="flex-1 flex flex-col items-center space-y-1">
                        <div className="flex flex-col items-center justify-end h-32 space-y-1">
                          <div
                            className="w-full bg-blue-500 rounded-t"
                            style={{ height: `${(point.count / maxValue) * 100}%` }}
                            title={`Created: ${point.count}`}
                          />
                          <div
                            className="w-full bg-green-500 rounded-t"
                            style={{ height: `${(completedPoint?.count / maxValue) * 100}%` }}
                            title={`Completed: ${completedPoint?.count || 0}`}
                          />
                        </div>
                        <span className="text-xs text-gray-600 rotate-45 origin-left">
                          {new Date(point.date).getMonth() + 1}/{new Date(point.date).getDate()}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center justify-center space-x-4 mt-2 text-xs">
                  <div className="flex items-center space-x-1">
                    <div className="w-3 h-3 bg-blue-500 rounded" />
                    <span>Created</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <div className="w-3 h-3 bg-green-500 rounded" />
                    <span>Completed</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Cycle Time Trend</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-40 flex items-end space-x-1">
                  {data.trends.cycle_time.slice(-10).map((point, index) => {
                    const maxValue = Math.max(...data.trends.cycle_time.map(p => p.average));
                    
                    return (
                      <div key={index} className="flex-1 flex flex-col items-center space-y-1">
                        <div className="flex flex-col items-center justify-end h-32">
                          <div
                            className="w-full bg-orange-500 rounded-t"
                            style={{ height: `${(point.average / maxValue) * 100}%` }}
                            title={`Avg: ${formatDuration(point.average)}`}
                          />
                        </div>
                        <span className="text-xs text-gray-600 rotate-45 origin-left">
                          {new Date(point.date).getMonth() + 1}/{new Date(point.date).getDate()}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="bottlenecks" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Workflow Bottlenecks</CardTitle>
              <p className="text-sm text-gray-600">
                Identify columns where work is getting stuck or taking too long
              </p>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {data.bottlenecks.map((bottleneck, index) => (
                  <div key={index} className="p-4 border rounded-lg">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-medium">{bottleneck.column}</h4>
                      <Badge className={getBottleneckSeverityColor(bottleneck.severity)}>
                        {bottleneck.severity} risk
                      </Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <span className="text-gray-600">Cards:</span>
                        <div className="font-medium">
                          {bottleneck.card_count}
                          {bottleneck.wip_limit && (
                            <span className="text-gray-500">/{bottleneck.wip_limit}</span>
                          )}
                        </div>
                      </div>
                      <div>
                        <span className="text-gray-600">Avg Time:</span>
                        <div className="font-medium">{formatDuration(bottleneck.average_time)}</div>
                      </div>
                      <div>
                        <span className="text-gray-600">WIP Utilization:</span>
                        <div className="font-medium">
                          {bottleneck.wip_limit ? Math.round((bottleneck.card_count / bottleneck.wip_limit) * 100) : 'N/A'}%
                        </div>
                      </div>
                    </div>
                    {bottleneck.wip_limit && (
                      <div className="mt-3">
                        <Progress 
                          value={(bottleneck.card_count / bottleneck.wip_limit) * 100} 
                          className="h-2"
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}