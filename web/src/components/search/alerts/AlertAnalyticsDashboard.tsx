import React, { useState, useEffect } from 'react';
import { Card } from '../../ui/card';
import { Button } from '../../ui/button';
import { Select } from '../../ui/select';
import { Badge } from '../../ui/badge';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import {
  BellIcon,
  CheckCircleIcon,
  XCircleIcon,
  TrendingUpIcon,
  TrendingDownIcon,
  AlertCircleIcon,
  ClockIcon,
  MailIcon,
  WebhookIcon,
  SmartphoneIcon,
  RefreshCwIcon
} from 'lucide-react';

interface AlertAnalytics {
  totalAlerts: number;
  activeAlerts: number;
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  averageExecutionTime: number;
  totalNotificationsSent: number;
  notificationSuccessRate: number;
  topAlertsByExecutions: Array<{
    alertId: string;
    alertName: string;
    executionCount: number;
  }>;
  executionsByDay: Record<string, number>;
  notificationsByChannel: Record<string, number>;
  averageResultsPerAlert: number;
}

interface UserAlertStats {
  totalAlerts: number;
  activeAlerts: number;
  totalExecutions: number;
  totalNotifications: number;
  subscriptions: number;
  alertsCreatedByMonth: Record<string, number>;
  executionsByMonth: Record<string, number>;
  mostUsedChannels: Array<{
    channel: string;
    count: number;
  }>;
  averageAlertsPerSearch: number;
}

interface AlertAnalyticsDashboardProps {
  analytics: AlertAnalytics;
  userStats: UserAlertStats;
  isLoading?: boolean;
  onRefresh: () => void;
  onDateRangeChange: (from: Date, to: Date) => void;
}

export function AlertAnalyticsDashboard({
  analytics,
  userStats,
  isLoading = false,
  onRefresh,
  onDateRangeChange,
}: AlertAnalyticsDashboardProps) {
  const [selectedTimeRange, setSelectedTimeRange] = useState('30d');
  const [viewType, setViewType] = useState<'overview' | 'performance' | 'notifications'>('overview');

  useEffect(() => {
    // Update date range when time range selection changes
    const now = new Date();
    let from = new Date();
    
    switch (selectedTimeRange) {
      case '7d':
        from.setDate(now.getDate() - 7);
        break;
      case '30d':
        from.setDate(now.getDate() - 30);
        break;
      case '90d':
        from.setDate(now.getDate() - 90);
        break;
      case '1y':
        from.setFullYear(now.getFullYear() - 1);
        break;
      default:
        from.setDate(now.getDate() - 30);
    }
    
    onDateRangeChange(from, now);
  }, [selectedTimeRange, onDateRangeChange]);

  const successRate = analytics.totalExecutions > 0 
    ? (analytics.successfulExecutions / analytics.totalExecutions) * 100 
    : 0;

  const failureRate = analytics.totalExecutions > 0 
    ? (analytics.failedExecutions / analytics.totalExecutions) * 100 
    : 0;

  // Prepare chart data
  const executionsByDayData = Object.entries(analytics.executionsByDay).map(([date, count]) => ({
    date: new Date(date).toLocaleDateString(),
    executions: count,
  }));

  const channelData = Object.entries(analytics.notificationsByChannel).map(([channel, count]) => ({
    name: channel,
    value: count,
    percentage: analytics.totalNotificationsSent > 0 ? (count / analytics.totalNotificationsSent) * 100 : 0,
  }));

  const monthlyData = Object.entries(userStats.alertsCreatedByMonth).map(([month, count]) => ({
    month,
    created: count,
    executions: userStats.executionsByMonth[month] || 0,
  }));

  const colors = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

  const getChannelIcon = (channel: string) => {
    switch (channel.toLowerCase()) {
      case 'email':
        return <MailIcon className="h-4 w-4" />;
      case 'webhook':
        return <WebhookIcon className="h-4 w-4" />;
      case 'sms':
        return <SmartphoneIcon className="h-4 w-4" />;
      default:
        return <BellIcon className="h-4 w-4" />;
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="p-6 animate-pulse">
              <div className="h-4 bg-gray-200 rounded mb-2"></div>
              <div className="h-8 bg-gray-200 rounded mb-2"></div>
              <div className="h-3 bg-gray-200 rounded w-2/3"></div>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Alert Analytics</h2>
          <p className="text-gray-600">Performance insights for your search alerts</p>
        </div>
        
        <div className="flex items-center space-x-3">
          <Select value={selectedTimeRange} onValueChange={setSelectedTimeRange}>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="1y">Last year</option>
          </Select>
          
          <Button variant="outline" onClick={onRefresh} disabled={isLoading}>
            <RefreshCwIcon className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* View Type Selector */}
      <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg w-fit">
        <Button
          variant={viewType === 'overview' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setViewType('overview')}
        >
          Overview
        </Button>
        <Button
          variant={viewType === 'performance' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setViewType('performance')}
        >
          Performance
        </Button>
        <Button
          variant={viewType === 'notifications' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setViewType('notifications')}
        >
          Notifications
        </Button>
      </div>

      {/* Overview Tab */}
      {viewType === 'overview' && (
        <>
          {/* Key Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Total Alerts</p>
                  <p className="text-2xl font-bold">{analytics.totalAlerts}</p>
                  <p className="text-sm text-green-600">
                    {analytics.activeAlerts} active
                  </p>
                </div>
                <BellIcon className="h-8 w-8 text-blue-500" />
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Total Executions</p>
                  <p className="text-2xl font-bold">{analytics.totalExecutions}</p>
                  <p className="text-sm text-gray-500">
                    {successRate.toFixed(1)}% success rate
                  </p>
                </div>
                <ClockIcon className="h-8 w-8 text-green-500" />
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Notifications Sent</p>
                  <p className="text-2xl font-bold">{analytics.totalNotificationsSent}</p>
                  <p className="text-sm text-gray-500">
                    {(analytics.notificationSuccessRate * 100).toFixed(1)}% delivered
                  </p>
                </div>
                <MailIcon className="h-8 w-8 text-purple-500" />
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Avg Execution Time</p>
                  <p className="text-2xl font-bold">
                    {analytics.averageExecutionTime ? `${(analytics.averageExecutionTime / 1000).toFixed(1)}s` : 'N/A'}
                  </p>
                  <p className="text-sm text-gray-500">
                    Avg {analytics.averageResultsPerAlert.toFixed(0)} results
                  </p>
                </div>
                <TrendingUpIcon className="h-8 w-8 text-orange-500" />
              </div>
            </Card>
          </div>

          {/* Execution Trend */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Alert Executions Over Time</h3>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={executionsByDayData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="executions" 
                    stroke="#0088FE" 
                    strokeWidth={2}
                    name="Executions"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </>
      )}

      {/* Performance Tab */}
      {viewType === 'performance' && (
        <>
          {/* Success/Failure Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Success Rate</p>
                  <p className="text-3xl font-bold text-green-600">{successRate.toFixed(1)}%</p>
                  <p className="text-sm text-gray-500">
                    {analytics.successfulExecutions} successful
                  </p>
                </div>
                <CheckCircleIcon className="h-8 w-8 text-green-500" />
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Failure Rate</p>
                  <p className="text-3xl font-bold text-red-600">{failureRate.toFixed(1)}%</p>
                  <p className="text-sm text-gray-500">
                    {analytics.failedExecutions} failed
                  </p>
                </div>
                <XCircleIcon className="h-8 w-8 text-red-500" />
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Avg Results</p>
                  <p className="text-3xl font-bold">{analytics.averageResultsPerAlert.toFixed(0)}</p>
                  <p className="text-sm text-gray-500">per execution</p>
                </div>
                <TrendingUpIcon className="h-8 w-8 text-blue-500" />
              </div>
            </Card>
          </div>

          {/* Top Performing Alerts */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Most Active Alerts</h3>
            <div className="space-y-3">
              {analytics.topAlertsByExecutions.slice(0, 5).map((alert, index) => (
                <div key={alert.alertId} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <Badge variant="outline">#{index + 1}</Badge>
                    <span className="font-medium">{alert.alertName}</span>
                  </div>
                  <div className="text-sm text-gray-600">
                    {alert.executionCount} executions
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Monthly Trends */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Monthly Activity</h3>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="created" fill="#0088FE" name="Alerts Created" />
                  <Bar dataKey="executions" fill="#00C49F" name="Executions" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </>
      )}

      {/* Notifications Tab */}
      {viewType === 'notifications' && (
        <>
          {/* Notification Stats */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4">Notification Channels</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={channelData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {channelData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: any) => [value, 'Notifications']} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4">Channel Performance</h3>
              <div className="space-y-4">
                {userStats.mostUsedChannels.map((channel, index) => (
                  <div key={channel.channel} className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      {getChannelIcon(channel.channel)}
                      <span className="font-medium capitalize">{channel.channel}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="text-sm text-gray-600">{channel.count}</span>
                      <div className="w-24 bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-blue-500 h-2 rounded-full" 
                          style={{ 
                            width: `${Math.min(100, (channel.count / Math.max(...userStats.mostUsedChannels.map(c => c.count))) * 100)}%` 
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* Delivery Success Rate */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Delivery Success Rate</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="p-4 bg-green-50 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-green-600">Successfully Delivered</p>
                    <p className="text-2xl font-bold text-green-700">
                      {Math.round(analytics.notificationSuccessRate * analytics.totalNotificationsSent)}
                    </p>
                  </div>
                  <CheckCircleIcon className="h-6 w-6 text-green-500" />
                </div>
              </div>

              <div className="p-4 bg-red-50 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-red-600">Failed to Deliver</p>
                    <p className="text-2xl font-bold text-red-700">
                      {Math.round((1 - analytics.notificationSuccessRate) * analytics.totalNotificationsSent)}
                    </p>
                  </div>
                  <XCircleIcon className="h-6 w-6 text-red-500" />
                </div>
              </div>

              <div className="p-4 bg-blue-50 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-blue-600">Overall Rate</p>
                    <p className="text-2xl font-bold text-blue-700">
                      {(analytics.notificationSuccessRate * 100).toFixed(1)}%
                    </p>
                  </div>
                  <TrendingUpIcon className="h-6 w-6 text-blue-500" />
                </div>
              </div>
            </div>
          </Card>
        </>
      )}

      {/* Health Status */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">System Health</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex items-center space-x-3">
            <div className={`w-3 h-3 rounded-full ${successRate > 90 ? 'bg-green-500' : successRate > 70 ? 'bg-yellow-500' : 'bg-red-500'}`} />
            <span className="text-sm">
              Alert Execution: {successRate > 90 ? 'Excellent' : successRate > 70 ? 'Good' : 'Needs Attention'}
            </span>
          </div>
          
          <div className="flex items-center space-x-3">
            <div className={`w-3 h-3 rounded-full ${analytics.notificationSuccessRate > 0.9 ? 'bg-green-500' : analytics.notificationSuccessRate > 0.7 ? 'bg-yellow-500' : 'bg-red-500'}`} />
            <span className="text-sm">
              Notification Delivery: {analytics.notificationSuccessRate > 0.9 ? 'Excellent' : analytics.notificationSuccessRate > 0.7 ? 'Good' : 'Needs Attention'}
            </span>
          </div>
          
          <div className="flex items-center space-x-3">
            <div className={`w-3 h-3 rounded-full ${analytics.averageExecutionTime < 10000 ? 'bg-green-500' : analytics.averageExecutionTime < 30000 ? 'bg-yellow-500' : 'bg-red-500'}`} />
            <span className="text-sm">
              Performance: {analytics.averageExecutionTime < 10000 ? 'Fast' : analytics.averageExecutionTime < 30000 ? 'Moderate' : 'Slow'}
            </span>
          </div>
        </div>
      </Card>
    </div>
  );
}