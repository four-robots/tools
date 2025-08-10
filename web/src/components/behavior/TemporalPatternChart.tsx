'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface TemporalPatternChartProps {
  userId?: string;
  apiUrl: string;
  dateRange: {
    start: Date;
    end: Date;
  };
}

interface TemporalPattern {
  patternId: string;
  patternName: string;
  patternType: 'hourly' | 'daily' | 'weekly' | 'seasonal';
  description: string;
  strength: number; // 0-1
  frequency: number;
  dataPoints: Array<{
    timestamp: string;
    value: number;
    events: number;
  }>;
  seasonality?: {
    period: string;
    amplitude: number;
    phase: number;
  };
  trend?: {
    direction: 'increasing' | 'decreasing' | 'stable';
    slope: number;
    confidence: number;
  };
}

interface TemporalData {
  patterns: TemporalPattern[];
  timeSeriesData: Array<{
    date: string;
    searches: number;
    clicks: number;
    views: number;
    sessions: number;
  }>;
  peaks: Array<{
    timestamp: string;
    value: number;
    type: string;
    description: string;
  }>;
  anomalies: Array<{
    timestamp: string;
    expected: number;
    actual: number;
    deviation: number;
    type: 'spike' | 'drop';
  }>;
}

export const TemporalPatternChart: React.FC<TemporalPatternChartProps> = ({
  userId,
  apiUrl,
  dateRange,
}) => {
  const [loading, setLoading] = useState(true);
  const [temporalData, setTemporalData] = useState<TemporalData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<'timeline' | 'patterns' | 'peaks' | 'anomalies'>('timeline');
  const [selectedMetric, setSelectedMetric] = useState<'searches' | 'clicks' | 'views' | 'sessions'>('searches');

  useEffect(() => {
    const fetchTemporalData = async () => {
      try {
        if (!userId) {
          setLoading(false);
          return;
        }

        const params = new URLSearchParams({
          userId,
          startDate: dateRange.start.toISOString(),
          endDate: dateRange.end.toISOString(),
          granularity: 'hour',
        });

        const response = await fetch(`${apiUrl}/analytics/temporal-patterns?${params}`);
        const result = await response.json();
        
        if (result.success) {
          setTemporalData(result.data);
        } else {
          setError(result.message || 'Failed to load temporal data');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch temporal data');
        console.error('Failed to fetch temporal data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchTemporalData();
  }, [userId, apiUrl, dateRange]);

  if (loading) {
    return <LoadingSpinner />;
  }

  if (error) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-32">
          <p className="text-red-500 text-sm">{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (!temporalData || temporalData.timeSeriesData.length === 0) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-32">
          <p className="text-muted-foreground">No temporal pattern data available</p>
        </CardContent>
      </Card>
    );
  }

  const getPatternStrengthColor = (strength: number) => {
    if (strength >= 0.8) return 'bg-green-100 text-green-800';
    if (strength >= 0.6) return 'bg-yellow-100 text-yellow-800';
    if (strength >= 0.4) return 'bg-orange-100 text-orange-800';
    return 'bg-red-100 text-red-800';
  };

  const getTrendIcon = (direction: string) => {
    switch (direction) {
      case 'increasing': return '📈';
      case 'decreasing': return '📉';
      case 'stable': return '➡️';
      default: return '❓';
    }
  };

  const renderTimeline = () => {
    const maxValue = Math.max(...temporalData.timeSeriesData.map(d => d[selectedMetric]));
    
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Activity Timeline</h3>
          <div className="flex gap-2">
            {(['searches', 'clicks', 'views', 'sessions'] as const).map((metric) => (
              <button
                key={metric}
                onClick={() => setSelectedMetric(metric)}
                className={`px-2 py-1 rounded text-xs capitalize ${
                  selectedMetric === metric 
                    ? 'bg-blue-500 text-white' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {metric}
              </button>
            ))}
          </div>
        </div>
        
        <div className="relative">
          {/* Simple bar chart visualization */}
          <div className="flex items-end gap-1 h-32">
            {temporalData.timeSeriesData.slice(-24).map((point, index) => {
              const height = (point[selectedMetric] / maxValue) * 100;
              return (
                <div key={index} className="flex-1 flex flex-col items-center">
                  <div 
                    className="bg-blue-500 rounded-t w-full min-h-1"
                    style={{ height: `${Math.max(height, 5)}%` }}
                    title={`${new Date(point.date).toLocaleString()}: ${point[selectedMetric]} ${selectedMetric}`}
                  ></div>
                  {index % 6 === 0 && (
                    <div className="text-xs text-muted-foreground mt-1 rotate-45 origin-top-left">
                      {new Date(point.date).toLocaleDateString()}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          
          <div className="flex justify-between items-center mt-2 text-xs text-muted-foreground">
            <span>0</span>
            <span className="capitalize">{selectedMetric} over time</span>
            <span>{maxValue}</span>
          </div>
        </div>
      </div>
    );
  };

  const renderPatterns = () => (
    <div className="space-y-4">
      <h3 className="text-sm font-medium">Detected Patterns</h3>
      <div className="space-y-3">
        {temporalData.patterns.map((pattern) => (
          <div key={pattern.patternId} className="border rounded p-3">
            <div className="flex items-start justify-between mb-2">
              <div>
                <h4 className="font-medium text-sm">{pattern.patternName}</h4>
                <p className="text-xs text-muted-foreground">{pattern.description}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge 
                  variant="secondary"
                  className={getPatternStrengthColor(pattern.strength)}
                >
                  {Math.round(pattern.strength * 100)}% strength
                </Badge>
                <Badge variant="outline" className="text-xs capitalize">
                  {pattern.patternType}
                </Badge>
              </div>
            </div>
            
            <div className="grid gap-2 md:grid-cols-2 text-xs">
              <div>
                <span className="text-muted-foreground">Frequency:</span>
                <span className="ml-2 font-medium">{pattern.frequency} occurrences</span>
              </div>
              
              {pattern.seasonality && (
                <div>
                  <span className="text-muted-foreground">Seasonality:</span>
                  <span className="ml-2 font-medium">
                    {pattern.seasonality.period} cycle
                  </span>
                </div>
              )}
              
              {pattern.trend && (
                <div className="flex items-center">
                  <span className="text-muted-foreground">Trend:</span>
                  <span className="ml-2 font-medium flex items-center gap-1">
                    {getTrendIcon(pattern.trend.direction)}
                    {pattern.trend.direction}
                    ({Math.round(pattern.trend.confidence * 100)}% confidence)
                  </span>
                </div>
              )}
            </div>
          </div>
        ))}
        
        {temporalData.patterns.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No significant temporal patterns detected. More usage data needed for pattern analysis.
          </p>
        )}
      </div>
    </div>
  );

  const renderPeaks = () => (
    <div className="space-y-4">
      <h3 className="text-sm font-medium">Activity Peaks</h3>
      <div className="space-y-2">
        {temporalData.peaks.map((peak, index) => (
          <div key={index} className="flex items-center justify-between border rounded p-2">
            <div>
              <div className="text-sm font-medium">{peak.description}</div>
              <div className="text-xs text-muted-foreground">
                {new Date(peak.timestamp).toLocaleString()}
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm font-bold">{peak.value}</div>
              <Badge variant="outline" className="text-xs">
                {peak.type}
              </Badge>
            </div>
          </div>
        ))}
        
        {temporalData.peaks.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No significant activity peaks detected in the selected time period.
          </p>
        )}
      </div>
    </div>
  );

  const renderAnomalies = () => (
    <div className="space-y-4">
      <h3 className="text-sm font-medium">Anomalies & Outliers</h3>
      <div className="space-y-2">
        {temporalData.anomalies.map((anomaly, index) => (
          <div key={index} className={`border rounded p-2 ${
            anomaly.type === 'spike' ? 'border-red-200 bg-red-50' : 'border-blue-200 bg-blue-50'
          }`}>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium flex items-center gap-2">
                  <span className="text-lg">
                    {anomaly.type === 'spike' ? '⚠️' : '📉'}
                  </span>
                  Unusual {anomaly.type}
                </div>
                <div className="text-xs text-muted-foreground">
                  {new Date(anomaly.timestamp).toLocaleString()}
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm">
                  Expected: {anomaly.expected}
                </div>
                <div className="text-sm font-bold">
                  Actual: {anomaly.actual}
                </div>
                <div className="text-xs text-muted-foreground">
                  {Math.round(Math.abs(anomaly.deviation) * 100)}% deviation
                </div>
              </div>
            </div>
          </div>
        ))}
        
        {temporalData.anomalies.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No anomalies detected. Your usage patterns are consistent.
          </p>
        )}
      </div>
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Temporal Pattern Analysis</CardTitle>
        <CardDescription>
          Your activity patterns and trends over time
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* View Selector */}
        <div className="flex gap-2 mb-6 flex-wrap">
          <button
            onClick={() => setActiveView('timeline')}
            className={`px-3 py-1 rounded text-sm ${
              activeView === 'timeline' 
                ? 'bg-blue-500 text-white' 
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            📊 Timeline
          </button>
          <button
            onClick={() => setActiveView('patterns')}
            className={`px-3 py-1 rounded text-sm ${
              activeView === 'patterns' 
                ? 'bg-blue-500 text-white' 
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            🔄 Patterns
          </button>
          <button
            onClick={() => setActiveView('peaks')}
            className={`px-3 py-1 rounded text-sm ${
              activeView === 'peaks' 
                ? 'bg-blue-500 text-white' 
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            ⛰️ Peaks
          </button>
          <button
            onClick={() => setActiveView('anomalies')}
            className={`px-3 py-1 rounded text-sm ${
              activeView === 'anomalies' 
                ? 'bg-blue-500 text-white' 
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            🚨 Anomalies
          </button>
        </div>

        {/* Content */}
        <div className="min-h-64">
          {activeView === 'timeline' && renderTimeline()}
          {activeView === 'patterns' && renderPatterns()}
          {activeView === 'peaks' && renderPeaks()}
          {activeView === 'anomalies' && renderAnomalies()}
        </div>

        {/* Summary Stats */}
        <div className="mt-6 pt-4 border-t grid gap-4 md:grid-cols-4 text-center">
          <div>
            <div className="text-sm text-muted-foreground">Patterns Found</div>
            <div className="text-lg font-bold">{temporalData.patterns.length}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Activity Peaks</div>
            <div className="text-lg font-bold">{temporalData.peaks.length}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Anomalies</div>
            <div className="text-lg font-bold">{temporalData.anomalies.length}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Data Points</div>
            <div className="text-lg font-bold">{temporalData.timeSeriesData.length}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};