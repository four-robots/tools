'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  TrendingUp, 
  TrendingDown,
  Brain,
  Clock,
  Target,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  BarChart3,
  Zap,
  Coffee,
  Timer,
  Users,
  Lightbulb,
  RefreshCw,
  Activity
} from 'lucide-react';
import { usePredictiveAnalyticsDashboard } from '@/hooks/use-predictive-analytics';
import { usePageTracking } from '@/hooks/use-analytics';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

interface PredictiveDashboardProps {
  className?: string;
}

export function PredictiveDashboard({ className }: PredictiveDashboardProps) {
  const [activeTab, setActiveTab] = useState('overview');
  
  // Track page view
  usePageTracking('predictive_analytics_dashboard', { activeTab });
  
  const {
    taskPrediction,
    productivityForecast,
    workloadCapacity,
    isLoading,
    hasError,
    refetchAll,
    trainModels,
    isTraining,
    hasHighBurnoutRisk,
    isProductivityImproving,
    hasLowConfidence,
    topRecommendations,
    nextPeakHour,
    suggestedBreakFrequency,
    expectedTasksThisWeek
  } = usePredictiveAnalyticsDashboard();

  const handleTrainModels = () => {
    trainModels();
  };

  const handleRefresh = () => {
    refetchAll();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <LoadingSpinner size="lg" />
        <span className="ml-2 text-muted-foreground">Loading predictive analytics...</span>
      </div>
    );
  }

  if (hasError) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          Failed to load predictive analytics. Please try again later.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Predictive Analytics</h1>
          <p className="text-muted-foreground">
            AI-powered insights and forecasts for your productivity
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            onClick={handleTrainModels} 
            disabled={isTraining}
            variant="outline" 
            size="sm"
          >
            {isTraining ? (
              <>
                <LoadingSpinner size="sm" className="mr-2" />
                Training...
              </>
            ) : (
              <>
                <Brain className="h-4 w-4 mr-2" />
                Train Models
              </>
            )}
          </Button>
          <Button onClick={handleRefresh} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Status Alerts */}
      {hasHighBurnoutRisk && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            High burnout risk detected! Consider reducing your workload.
          </AlertDescription>
        </Alert>
      )}

      {hasLowConfidence && (
        <Alert>
          <Lightbulb className="h-4 w-4" />
          <AlertDescription>
            Predictions have low confidence. Train models or add more data for better accuracy.
          </AlertDescription>
        </Alert>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="tasks">Task Predictions</TabsTrigger>
          <TabsTrigger value="productivity">Productivity Forecast</TabsTrigger>
          <TabsTrigger value="workload">Workload Analysis</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          {/* Key Predictions Summary */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Next Task ETA</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {taskPrediction?.estimatedCompletion 
                    ? new Date(taskPrediction.estimatedCompletion).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    : '--:--'
                  }
                </div>
                <p className="text-xs text-muted-foreground">
                  {taskPrediction?.confidence 
                    ? `${Math.round(taskPrediction.confidence * 100)}% confidence`
                    : 'No prediction available'
                  }
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Week Forecast</CardTitle>
                <Target className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {expectedTasksThisWeek || 0} tasks
                </div>
                <p className="text-xs text-muted-foreground flex items-center">
                  {isProductivityImproving ? (
                    <>
                      <TrendingUp className="h-3 w-3 mr-1 text-green-500" />
                      Improving trend
                    </>
                  ) : (
                    <>
                      <TrendingDown className="h-3 w-3 mr-1 text-red-500" />
                      Stable/declining
                    </>
                  )}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Peak Hour</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {nextPeakHour ? `${nextPeakHour}:00` : '--:--'}
                </div>
                <p className="text-xs text-muted-foreground">
                  Next productivity peak
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Burnout Risk</CardTitle>
                <AlertTriangle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {workloadCapacity?.burnoutRisk 
                    ? `${Math.round(workloadCapacity.burnoutRisk * 100)}%`
                    : '0%'
                  }
                </div>
                <Progress 
                  value={(workloadCapacity?.burnoutRisk || 0) * 100} 
                  className="mt-2"
                />
              </CardContent>
            </Card>
          </div>

          {/* Top Recommendations */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Lightbulb className="h-5 w-5 mr-2" />
                AI Recommendations
              </CardTitle>
              <CardDescription>
                Personalized suggestions based on your patterns
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {topRecommendations.length > 0 ? (
                  topRecommendations.map((recommendation, index) => (
                    <div key={index} className="flex items-start space-x-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                      <p className="text-sm">{recommendation}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No recommendations available yet. Complete more tasks to generate insights.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Quick Charts */}
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Productivity Trend</CardTitle>
                <CardDescription>Expected performance over the next 7 days</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={generateTrendData(productivityForecast)}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="day" />
                    <YAxis />
                    <Tooltip />
                    <Area
                      type="monotone"
                      dataKey="predicted"
                      stroke="#8884d8"
                      fill="#8884d8"
                      fillOpacity={0.6}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Workload Distribution</CardTitle>
                <CardDescription>Current vs optimal capacity</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={generateWorkloadData(workloadCapacity)}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="type" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="value" fill="#82ca9d" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Task Predictions Tab */}
        <TabsContent value="tasks" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Task Completion Prediction</CardTitle>
              <CardDescription>
                AI analysis of your task completion patterns
              </CardDescription>
            </CardHeader>
            <CardContent>
              {taskPrediction ? (
                <div className="space-y-6">
                  {/* Prediction Summary */}
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-primary">
                        {new Date(taskPrediction.estimatedCompletion).toLocaleTimeString([], { 
                          hour: '2-digit', 
                          minute: '2-digit' 
                        })}
                      </div>
                      <p className="text-sm text-muted-foreground">Estimated Completion</p>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-green-600">
                        {Math.round(taskPrediction.confidence * 100)}%
                      </div>
                      <p className="text-sm text-muted-foreground">Confidence Level</p>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-blue-600">
                        {Math.round(taskPrediction.factors.complexity * 10)}/10
                      </div>
                      <p className="text-sm text-muted-foreground">Task Complexity</p>
                    </div>
                  </div>

                  {/* Factors Analysis */}
                  <div>
                    <h3 className="text-lg font-semibold mb-4">Prediction Factors</h3>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-sm">Historical Average</span>
                        <div className="flex items-center space-x-2">
                          <Progress value={taskPrediction.factors.historicalAverage * 20} className="w-20" />
                          <span className="text-sm font-medium">{taskPrediction.factors.historicalAverage.toFixed(1)}h</span>
                        </div>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm">Current Pace</span>
                        <div className="flex items-center space-x-2">
                          <Progress value={taskPrediction.factors.currentPace * 20} className="w-20" />
                          <span className="text-sm font-medium">{taskPrediction.factors.currentPace.toFixed(1)}h</span>
                        </div>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm">Time Context</span>
                        <div className="flex items-center space-x-2">
                          <Progress value={taskPrediction.factors.timeOfDay * 100} className="w-20" />
                          <span className="text-sm font-medium">{Math.round(taskPrediction.factors.timeOfDay * 100)}%</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Recommendations */}
                  <div>
                    <h3 className="text-lg font-semibold mb-4">Recommendations</h3>
                    <div className="space-y-2">
                      {taskPrediction.recommendations.map((rec, index) => (
                        <div key={index} className="flex items-start space-x-2">
                          <Lightbulb className="h-4 w-4 text-yellow-500 mt-0.5 flex-shrink-0" />
                          <p className="text-sm">{rec}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center text-muted-foreground">
                  <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No task prediction data available</p>
                  <p className="text-sm">Complete some tasks to generate predictions</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Productivity Forecast Tab */}
        <TabsContent value="productivity" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>7-Day Productivity Forecast</CardTitle>
              <CardDescription>
                Predicted productivity patterns and peak performance times
              </CardDescription>
            </CardHeader>
            <CardContent>
              {productivityForecast ? (
                <div className="space-y-6">
                  {/* Forecast Summary */}
                  <div className="grid gap-4 md:grid-cols-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-primary">
                        {productivityForecast.predictions.tasksCompleted}
                      </div>
                      <p className="text-sm text-muted-foreground">Expected Tasks</p>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-green-600">
                        {Math.round(productivityForecast.predictions.productivityScore * 100)}%
                      </div>
                      <p className="text-sm text-muted-foreground">Productivity Score</p>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-blue-600">
                        {productivityForecast.predictions.optimalWorkload}h
                      </div>
                      <p className="text-sm text-muted-foreground">Optimal Workload</p>
                    </div>
                    <div className="text-center">
                      <Badge 
                        variant={productivityForecast.trendDirection === 'improving' ? 'default' : 'secondary'}
                        className="text-sm"
                      >
                        {productivityForecast.trendDirection}
                      </Badge>
                      <p className="text-sm text-muted-foreground mt-1">Trend Direction</p>
                    </div>
                  </div>

                  {/* Peak Hours */}
                  <div>
                    <h3 className="text-lg font-semibold mb-4">Peak Performance Hours</h3>
                    <div className="grid grid-cols-12 gap-1">
                      {Array.from({ length: 24 }, (_, hour) => {
                        const isPeak = productivityForecast.predictions.peakHours.includes(hour);
                        const isLowEnergy = productivityForecast.predictions.lowEnergyPeriods.includes(hour);
                        return (
                          <div
                            key={hour}
                            className={`h-8 rounded text-xs flex items-center justify-center ${
                              isPeak 
                                ? 'bg-green-500 text-white' 
                                : isLowEnergy
                                ? 'bg-red-200 text-red-800'
                                : 'bg-muted text-muted-foreground'
                            }`}
                          >
                            {hour}
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-xs">
                      <div className="flex items-center gap-1">
                        <div className="w-3 h-3 bg-green-500 rounded"></div>
                        <span>Peak Hours</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-3 h-3 bg-red-200 rounded"></div>
                        <span>Low Energy</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-3 h-3 bg-muted rounded"></div>
                        <span>Normal</span>
                      </div>
                    </div>
                  </div>

                  {/* Seasonal Factors */}
                  <div>
                    <h3 className="text-lg font-semibold mb-4">Seasonal Patterns</h3>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <p className="text-sm font-medium">Day of Week Factor</p>
                        <p className="text-2xl font-bold">
                          {Math.round(productivityForecast.seasonalFactors.dayOfWeek * 100)}%
                        </p>
                        <p className="text-xs text-muted-foreground">vs weekly average</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium">Historical Pattern</p>
                        <p className="text-sm text-muted-foreground">
                          {productivityForecast.seasonalFactors.historicalPattern}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center text-muted-foreground">
                  <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No productivity forecast available</p>
                  <p className="text-sm">Build up your activity history to generate forecasts</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Workload Analysis Tab */}
        <TabsContent value="workload" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Workload Capacity Analysis</CardTitle>
              <CardDescription>
                AI-powered analysis of your workload sustainability
              </CardDescription>
            </CardHeader>
            <CardContent>
              {workloadCapacity ? (
                <div className="space-y-6">
                  {/* Capacity Overview */}
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-blue-600">
                        {workloadCapacity.currentCapacity.toFixed(1)}
                      </div>
                      <p className="text-sm text-muted-foreground">Current Capacity</p>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-green-600">
                        {workloadCapacity.optimalCapacity.toFixed(1)}
                      </div>
                      <p className="text-sm text-muted-foreground">Optimal Capacity</p>
                    </div>
                    <div className="text-center">
                      <div className={`text-2xl font-bold ${
                        workloadCapacity.burnoutRisk > 0.7 ? 'text-red-600' :
                        workloadCapacity.burnoutRisk > 0.4 ? 'text-yellow-600' : 'text-green-600'
                      }`}>
                        {Math.round(workloadCapacity.burnoutRisk * 100)}%
                      </div>
                      <p className="text-sm text-muted-foreground">Burnout Risk</p>
                    </div>
                  </div>

                  {/* Burnout Risk Indicator */}
                  <div>
                    <h3 className="text-lg font-semibold mb-4">Risk Assessment</h3>
                    <Progress 
                      value={workloadCapacity.burnoutRisk * 100} 
                      className="h-3"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground mt-1">
                      <span>Low Risk</span>
                      <span>High Risk</span>
                    </div>
                  </div>

                  {/* Recommendations */}
                  <div>
                    <h3 className="text-lg font-semibold mb-4">Optimization Recommendations</h3>
                    <div className="grid gap-4 md:grid-cols-2">
                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-sm">Task Management</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span>Suggested Task Limit:</span>
                            <Badge variant="outline">
                              {workloadCapacity.recommendations.suggestedTaskLimit}
                            </Badge>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span>Break Frequency:</span>
                            <Badge variant="outline">
                              {workloadCapacity.recommendations.breakFrequency}min
                            </Badge>
                          </div>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-sm">Focus Time Blocks</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-2">
                            {workloadCapacity.recommendations.focusTimeBlocks.map((block, index) => (
                              <div key={index} className="flex items-center justify-between text-sm">
                                <span>Block {index + 1}:</span>
                                <Badge variant="outline">
                                  {block.start}:00 - {block.end}:00
                                </Badge>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    </div>

                    <div className="mt-4">
                      <h4 className="font-medium mb-2">Energy Optimization Tips</h4>
                      <div className="space-y-2">
                        {workloadCapacity.recommendations.energyOptimization.map((tip, index) => (
                          <div key={index} className="flex items-start space-x-2">
                            <Zap className="h-4 w-4 text-yellow-500 mt-0.5 flex-shrink-0" />
                            <p className="text-sm">{tip}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Next Week Forecast */}
                  <div>
                    <h3 className="text-lg font-semibold mb-4">Next Week Forecast</h3>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <p className="text-sm font-medium">Expected Load</p>
                        <p className="text-2xl font-bold">{workloadCapacity.nextWeekForecast.expectedLoad.toFixed(1)}</p>
                        <p className="text-xs text-muted-foreground">tasks per day</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium">Suggested Adjustments</p>
                        <div className="space-y-1">
                          {workloadCapacity.nextWeekForecast.suggestedAdjustments.map((adjustment, index) => (
                            <p key={index} className="text-sm text-muted-foreground">{adjustment}</p>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No workload analysis available</p>
                  <p className="text-sm">Track your activities to generate workload insights</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Helper functions for chart data generation
function generateTrendData(forecast: any) {
  if (!forecast) return [];

  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const baseValue = forecast.predictions.tasksCompleted / 7;

  return days.map((day, index) => ({
    day,
    predicted: Math.round(baseValue + (index % 2 === 0 ? 1 : -1) * (index * 0.3))
  }));
}

function generateWorkloadData(workload: any) {
  if (!workload) return [];
  
  return [
    { type: 'Current', value: workload.currentCapacity },
    { type: 'Optimal', value: workload.optimalCapacity },
    { type: 'Suggested', value: workload.recommendations.suggestedTaskLimit }
  ];
}

export default PredictiveDashboard;