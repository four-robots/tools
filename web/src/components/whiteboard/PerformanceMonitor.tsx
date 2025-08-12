/**
 * PerformanceMonitor Component
 * 
 * Real-time OT performance tracking and monitoring for whiteboard operations.
 * Provides performance metrics, alerts, and optimization recommendations.
 */

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Activity, 
  Zap, 
  Clock, 
  Users, 
  TrendingUp, 
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  BarChart3,
  Cpu,
  Network,
  Database,
  Settings,
  RefreshCw,
  Eye,
  EyeOff
} from 'lucide-react';

// Types
interface PerformanceMetrics {
  operationCount: number;
  averageLatency: number;
  maxLatency: number;
  conflictRate: number;
  resolutionSuccessRate: number;
  operationThroughput: number;
  memoryUsage: number;
  activeUsers: number;
  queueSize: number;
  lastUpdated: string;
}

interface PerformanceAlert {
  id: string;
  type: 'latency' | 'memory' | 'throughput' | 'conflicts' | 'queue';
  severity: 'warning' | 'critical';
  message: string;
  value: number;
  threshold: number;
  timestamp: string;
  acknowledged: boolean;
}

interface PerformanceThresholds {
  maxLatencyMs: number;
  maxMemoryUsageMB: number;
  maxQueueSize: number;
  maxConflictRate: number;
  minThroughput: number;
}

interface PerformanceMonitorProps {
  metrics: PerformanceMetrics;
  alerts: PerformanceAlert[];
  thresholds: PerformanceThresholds;
  onRefreshMetrics: () => void;
  onAcknowledgeAlert: (alertId: string) => void;
  onUpdateThresholds: (thresholds: PerformanceThresholds) => void;
  isCollapsed?: boolean;
  onToggleCollapsed?: () => void;
}

export const PerformanceMonitor: React.FC<PerformanceMonitorProps> = ({
  metrics,
  alerts,
  thresholds,
  onRefreshMetrics,
  onAcknowledgeAlert,
  onUpdateThresholds,
  isCollapsed = false,
  onToggleCollapsed
}) => {
  const [selectedTab, setSelectedTab] = useState('overview');
  const [showSettings, setShowSettings] = useState(false);
  const [historicalData, setHistoricalData] = useState<PerformanceMetrics[]>([]);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Store historical performance data
  useEffect(() => {
    setHistoricalData(prev => {
      const newData = [...prev, metrics].slice(-50); // Keep last 50 data points
      return newData;
    });
  }, [metrics]);

  // Auto-refresh metrics
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      onRefreshMetrics();
    }, 5000); // Refresh every 5 seconds

    return () => clearInterval(interval);
  }, [autoRefresh, onRefreshMetrics]);

  const getPerformanceStatus = useCallback(() => {
    const criticalAlerts = alerts.filter(a => a.severity === 'critical' && !a.acknowledged);
    const warningAlerts = alerts.filter(a => a.severity === 'warning' && !a.acknowledged);

    if (criticalAlerts.length > 0) return 'critical';
    if (warningAlerts.length > 0) return 'warning';
    return 'good';
  }, [alerts]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'critical': return 'text-red-600 bg-red-100';
      case 'warning': return 'text-yellow-600 bg-yellow-100';
      case 'good': return 'text-green-600 bg-green-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getMetricStatus = (value: number, threshold: number, inverse = false) => {
    const isExceeded = inverse ? value < threshold : value > threshold;
    return isExceeded ? 'warning' : 'good';
  };

  const formatLatency = (ms: number) => {
    if (ms < 1000) return `${ms.toFixed(0)}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const formatMemory = (mb: number) => {
    if (mb < 1024) return `${mb.toFixed(0)}MB`;
    return `${(mb / 1024).toFixed(1)}GB`;
  };

  const formatThroughput = (ops: number) => {
    return `${ops.toFixed(1)} ops/s`;
  };

  const calculateTrend = (current: number, previous: number) => {
    if (historicalData.length < 2) return 'stable';
    const change = ((current - previous) / previous) * 100;
    if (Math.abs(change) < 5) return 'stable';
    return change > 0 ? 'up' : 'down';
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'up': return <TrendingUp className="w-3 h-3 text-red-500" />;
      case 'down': return <TrendingDown className="w-3 h-3 text-green-500" />;
      default: return <div className="w-3 h-3" />;
    }
  };

  const performanceStatus = getPerformanceStatus();
  const unacknowledgedAlerts = alerts.filter(a => !a.acknowledged);

  if (isCollapsed) {
    return (
      <Card className="w-64">
        <CardContent className="p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4" />
              <span className="text-sm font-medium">Performance</span>
              <Badge className={getStatusColor(performanceStatus)}>
                {performanceStatus}
              </Badge>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={onToggleCollapsed}
            >
              <Eye className="w-3 h-3" />
            </Button>
          </div>
          
          {unacknowledgedAlerts.length > 0 && (
            <div className="mt-2">
              <Badge variant="destructive" className="text-xs">
                {unacknowledgedAlerts.length} alert{unacknowledgedAlerts.length > 1 ? 's' : ''}
              </Badge>
            </div>
          )}

          <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-gray-500">Latency:</span>
              <div className="font-medium">{formatLatency(metrics.averageLatency)}</div>
            </div>
            <div>
              <span className="text-gray-500">Queue:</span>
              <div className="font-medium">{metrics.queueSize}</div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-96 max-h-[70vh] overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4" />
            <span>Performance Monitor</span>
            <Badge className={getStatusColor(performanceStatus)}>
              {performanceStatus}
            </Badge>
          </div>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setAutoRefresh(!autoRefresh)}
              title={autoRefresh ? 'Disable auto-refresh' : 'Enable auto-refresh'}
            >
              <RefreshCw className={`w-3 h-3 ${autoRefresh ? 'animate-spin' : ''}`} />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowSettings(!showSettings)}
            >
              <Settings className="w-3 h-3" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onToggleCollapsed}
            >
              <EyeOff className="w-3 h-3" />
            </Button>
          </div>
        </CardTitle>
      </CardHeader>

      {/* Critical Alerts */}
      {unacknowledgedAlerts.length > 0 && (
        <div className="px-4 pb-2">
          <Alert className="py-2">
            <AlertTriangle className="h-3 w-3" />
            <AlertDescription className="text-xs">
              {unacknowledgedAlerts.length} performance alert{unacknowledgedAlerts.length > 1 ? 's' : ''} require attention
            </AlertDescription>
          </Alert>
        </div>
      )}

      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="h-full">
        <div className="px-4">
          <TabsList className="grid w-full grid-cols-3 text-xs">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="metrics">Metrics</TabsTrigger>
            <TabsTrigger value="alerts">
              Alerts
              {unacknowledgedAlerts.length > 0 && (
                <Badge variant="destructive" className="ml-1 text-xs">
                  {unacknowledgedAlerts.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="max-h-96 overflow-y-auto">
          <TabsContent value="overview" className="px-4 space-y-3">
            {/* Key Metrics Grid */}
            <div className="grid grid-cols-2 gap-3">
              <Card className="p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-gray-500">Avg Latency</div>
                    <div className="text-sm font-medium">
                      {formatLatency(metrics.averageLatency)}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3 text-blue-500" />
                    {historicalData.length > 1 && 
                      getTrendIcon(calculateTrend(
                        metrics.averageLatency, 
                        historicalData[historicalData.length - 2]?.averageLatency || 0
                      ))
                    }
                  </div>
                </div>
                <Progress 
                  value={(metrics.averageLatency / thresholds.maxLatencyMs) * 100} 
                  className="mt-2 h-1"
                />
              </Card>

              <Card className="p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-gray-500">Memory Usage</div>
                    <div className="text-sm font-medium">
                      {formatMemory(metrics.memoryUsage)}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Cpu className="w-3 h-3 text-green-500" />
                    {historicalData.length > 1 && 
                      getTrendIcon(calculateTrend(
                        metrics.memoryUsage, 
                        historicalData[historicalData.length - 2]?.memoryUsage || 0
                      ))
                    }
                  </div>
                </div>
                <Progress 
                  value={(metrics.memoryUsage / thresholds.maxMemoryUsageMB) * 100} 
                  className="mt-2 h-1"
                />
              </Card>

              <Card className="p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-gray-500">Throughput</div>
                    <div className="text-sm font-medium">
                      {formatThroughput(metrics.operationThroughput)}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Network className="w-3 h-3 text-purple-500" />
                    {historicalData.length > 1 && 
                      getTrendIcon(calculateTrend(
                        metrics.operationThroughput, 
                        historicalData[historicalData.length - 2]?.operationThroughput || 0
                      ))
                    }
                  </div>
                </div>
                <Progress 
                  value={(metrics.operationThroughput / (thresholds.minThroughput * 2)) * 100} 
                  className="mt-2 h-1"
                />
              </Card>

              <Card className="p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-gray-500">Queue Size</div>
                    <div className="text-sm font-medium">
                      {metrics.queueSize}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Database className="w-3 h-3 text-orange-500" />
                    {historicalData.length > 1 && 
                      getTrendIcon(calculateTrend(
                        metrics.queueSize, 
                        historicalData[historicalData.length - 2]?.queueSize || 0
                      ))
                    }
                  </div>
                </div>
                <Progress 
                  value={(metrics.queueSize / thresholds.maxQueueSize) * 100} 
                  className="mt-2 h-1"
                />
              </Card>
            </div>

            {/* Summary Stats */}
            <div className="grid grid-cols-3 gap-3 text-xs">
              <div className="text-center">
                <div className="text-gray-500">Operations</div>
                <div className="font-medium">{metrics.operationCount}</div>
              </div>
              <div className="text-center">
                <div className="text-gray-500">Active Users</div>
                <div className="font-medium">{metrics.activeUsers}</div>
              </div>
              <div className="text-center">
                <div className="text-gray-500">Conflict Rate</div>
                <div className="font-medium">
                  {(metrics.conflictRate * 100).toFixed(1)}%
                </div>
              </div>
            </div>

            {/* Performance Recommendations */}
            {performanceStatus !== 'good' && (
              <Alert>
                <AlertTriangle className="h-3 w-3" />
                <AlertDescription className="text-xs">
                  <div className="font-medium mb-1">Performance Recommendations:</div>
                  <ul className="list-disc list-inside space-y-1">
                    {metrics.averageLatency > thresholds.maxLatencyMs && (
                      <li>Consider reducing operation frequency or enabling batching</li>
                    )}
                    {metrics.memoryUsage > thresholds.maxMemoryUsageMB && (
                      <li>Memory usage is high - consider clearing operation history</li>
                    )}
                    {metrics.queueSize > thresholds.maxQueueSize && (
                      <li>Operation queue is full - processing may be delayed</li>
                    )}
                    {metrics.conflictRate > thresholds.maxConflictRate && (
                      <li>High conflict rate detected - check for concurrent editing patterns</li>
                    )}
                  </ul>
                </AlertDescription>
              </Alert>
            )}
          </TabsContent>

          <TabsContent value="metrics" className="px-4 space-y-3">
            <div className="space-y-3">
              {/* Detailed Metrics */}
              <Card className="p-3">
                <CardTitle className="text-xs font-medium mb-2">Latency Metrics</CardTitle>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span>Average Latency:</span>
                    <span className="font-medium">{formatLatency(metrics.averageLatency)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Max Latency:</span>
                    <span className="font-medium">{formatLatency(metrics.maxLatency)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Threshold:</span>
                    <span className="text-gray-500">{formatLatency(thresholds.maxLatencyMs)}</span>
                  </div>
                </div>
              </Card>

              <Card className="p-3">
                <CardTitle className="text-xs font-medium mb-2">Conflict Metrics</CardTitle>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span>Conflict Rate:</span>
                    <span className="font-medium">{(metrics.conflictRate * 100).toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Resolution Success:</span>
                    <span className="font-medium">{(metrics.resolutionSuccessRate * 100).toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Max Conflict Rate:</span>
                    <span className="text-gray-500">{(thresholds.maxConflictRate * 100).toFixed(1)}%</span>
                  </div>
                </div>
              </Card>

              <Card className="p-3">
                <CardTitle className="text-xs font-medium mb-2">System Resources</CardTitle>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span>Memory Usage:</span>
                    <span className="font-medium">{formatMemory(metrics.memoryUsage)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Queue Size:</span>
                    <span className="font-medium">{metrics.queueSize}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Active Users:</span>
                    <span className="font-medium">{metrics.activeUsers}</span>
                  </div>
                </div>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="alerts" className="px-4 space-y-2">
            {alerts.length === 0 ? (
              <div className="text-center py-8">
                <CheckCircle className="w-8 h-8 text-green-500 mx-auto mb-2" />
                <div className="text-sm text-gray-500">No performance alerts</div>
              </div>
            ) : (
              <div className="space-y-2">
                {alerts
                  .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                  .map((alert) => (
                    <Card 
                      key={alert.id}
                      className={`p-3 ${!alert.acknowledged ? 'border-red-200 bg-red-50' : 'bg-gray-50'}`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <AlertTriangle className={`w-3 h-3 ${
                              alert.severity === 'critical' ? 'text-red-600' : 'text-yellow-600'
                            }`} />
                            <Badge 
                              variant={alert.severity === 'critical' ? 'destructive' : 'default'}
                              className="text-xs"
                            >
                              {alert.severity}
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              {alert.type}
                            </Badge>
                          </div>
                          <div className="text-xs text-gray-700 mb-1">
                            {alert.message}
                          </div>
                          <div className="text-xs text-gray-500">
                            Value: {alert.value} | Threshold: {alert.threshold}
                          </div>
                          <div className="text-xs text-gray-500">
                            {new Date(alert.timestamp).toLocaleTimeString()}
                          </div>
                        </div>
                        {!alert.acknowledged && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onAcknowledgeAlert(alert.id)}
                            className="ml-2"
                          >
                            <CheckCircle className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    </Card>
                  ))
                }
              </div>
            )}
          </TabsContent>
        </div>
      </Tabs>

      {/* Settings Panel */}
      {showSettings && (
        <div className="border-t p-4 bg-gray-50">
          <div className="text-xs font-medium mb-2">Performance Thresholds</div>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between items-center">
              <span>Max Latency (ms):</span>
              <input
                type="number"
                value={thresholds.maxLatencyMs}
                onChange={(e) => onUpdateThresholds({
                  ...thresholds,
                  maxLatencyMs: Number(e.target.value)
                })}
                className="w-16 px-1 border rounded"
              />
            </div>
            <div className="flex justify-between items-center">
              <span>Max Memory (MB):</span>
              <input
                type="number"
                value={thresholds.maxMemoryUsageMB}
                onChange={(e) => onUpdateThresholds({
                  ...thresholds,
                  maxMemoryUsageMB: Number(e.target.value)
                })}
                className="w-16 px-1 border rounded"
              />
            </div>
            <div className="flex justify-between items-center">
              <span>Max Queue Size:</span>
              <input
                type="number"
                value={thresholds.maxQueueSize}
                onChange={(e) => onUpdateThresholds({
                  ...thresholds,
                  maxQueueSize: Number(e.target.value)
                })}
                className="w-16 px-1 border rounded"
              />
            </div>
          </div>
        </div>
      )}

      <div className="px-4 pb-3 text-xs text-gray-500">
        Last updated: {new Date(metrics.lastUpdated).toLocaleTimeString()}
      </div>
    </Card>
  );
};

export default PerformanceMonitor;