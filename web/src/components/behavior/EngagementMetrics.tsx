'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Badge } from '@/components/ui/badge';

interface EngagementMetricsProps {
  userId?: string;
  apiUrl: string;
  dateRange: {
    start: Date;
    end: Date;
  };
}

interface EngagementData {
  userId: string;
  engagementScore: number;
  sessionDuration: number;
  interactionCount: number;
  searchFrequency: number;
  clickThroughRate: number;
  timeSpentPerPage: number;
  bounceRate: number;
  returnVisitRate: number;
  engagementLevel: 'high' | 'medium' | 'low';
  engagementTrends: Array<{
    date: string;
    score: number;
    interactions: number;
  }>;
  topEngagementTypes: Array<{
    type: string;
    score: number;
    frequency: number;
  }>;
}

export const EngagementMetrics: React.FC<EngagementMetricsProps> = ({
  userId,
  apiUrl,
  dateRange,
}) => {
  const [loading, setLoading] = useState(true);
  const [engagement, setEngagement] = useState<EngagementData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchEngagementMetrics = async () => {
      try {
        if (!userId) {
          setLoading(false);
          return;
        }

        const params = new URLSearchParams({
          userId,
          startDate: dateRange.start.toISOString(),
          endDate: dateRange.end.toISOString(),
        });

        const response = await fetch(`${apiUrl}/analytics/engagement?${params}`);
        const result = await response.json();
        
        if (result.success) {
          setEngagement(result.data);
        } else {
          setError(result.message || 'Failed to load engagement metrics');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch engagement metrics');
        console.error('Failed to fetch engagement metrics:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchEngagementMetrics();
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

  if (!engagement) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-32">
          <p className="text-muted-foreground">No engagement data available</p>
        </CardContent>
      </Card>
    );
  }

  const getEngagementColor = (level: string) => {
    switch (level) {
      case 'high': return 'bg-green-100 text-green-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'low': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const formatPercentage = (value: number) => `${Math.round(value * 100)}%`;
  const formatDuration = (ms: number) => {
    const minutes = Math.round(ms / 1000 / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            User Engagement Metrics
            <Badge 
              variant="secondary" 
              className={getEngagementColor(engagement.engagementLevel)}
            >
              {engagement.engagementLevel.toUpperCase()} ENGAGEMENT
            </Badge>
          </CardTitle>
          <CardDescription>
            Detailed analysis of user interaction patterns and engagement levels
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {/* Engagement Score */}
            <div className="space-y-2">
              <div className="text-2xl font-bold">
                {Math.round(engagement.engagementScore * 100)}
              </div>
              <p className="text-xs text-muted-foreground">
                Engagement Score
              </p>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className={`h-2 rounded-full ${
                    engagement.engagementScore >= 0.8 ? 'bg-green-500' :
                    engagement.engagementScore >= 0.6 ? 'bg-yellow-500' :
                    'bg-red-500'
                  }`}
                  style={{ width: `${engagement.engagementScore * 100}%` }}
                ></div>
              </div>
            </div>

            {/* Session Duration */}
            <div className="space-y-2">
              <div className="text-2xl font-bold">
                {formatDuration(engagement.sessionDuration)}
              </div>
              <p className="text-xs text-muted-foreground">
                Avg Session Duration
              </p>
            </div>

            {/* Interaction Count */}
            <div className="space-y-2">
              <div className="text-2xl font-bold">
                {engagement.interactionCount}
              </div>
              <p className="text-xs text-muted-foreground">
                Total Interactions
              </p>
            </div>

            {/* Click Through Rate */}
            <div className="space-y-2">
              <div className="text-2xl font-bold">
                {formatPercentage(engagement.clickThroughRate)}
              </div>
              <p className="text-xs text-muted-foreground">
                Click Through Rate
              </p>
            </div>
          </div>

          {/* Additional Metrics */}
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Search Frequency</span>
              <span className="font-medium">{engagement.searchFrequency} per session</span>
            </div>
            
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Time per Page</span>
              <span className="font-medium">{formatDuration(engagement.timeSpentPerPage)}</span>
            </div>
            
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Bounce Rate</span>
              <span className="font-medium">{formatPercentage(engagement.bounceRate)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Engagement Trends */}
      {engagement.engagementTrends.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Engagement Trends</CardTitle>
            <CardDescription>
              Daily engagement scores over the selected period
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {engagement.engagementTrends.slice(-7).map((trend, index) => (
                <div key={trend.date} className="flex items-center justify-between">
                  <div className="text-sm">
                    {new Date(trend.date).toLocaleDateString()}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-24 bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-blue-500 h-2 rounded-full"
                        style={{ width: `${trend.score * 100}%` }}
                      ></div>
                    </div>
                    <span className="text-sm font-medium w-12 text-right">
                      {Math.round(trend.score * 100)}
                    </span>
                    <span className="text-xs text-muted-foreground w-16 text-right">
                      {trend.interactions} events
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Top Engagement Types */}
      {engagement.topEngagementTypes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Most Engaging Interactions</CardTitle>
            <CardDescription>
              Types of interactions that drive the highest engagement
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {engagement.topEngagementTypes.slice(0, 5).map((type, index) => (
                <div key={type.type} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      #{index + 1}
                    </Badge>
                    <span className="text-sm font-medium capitalize">{type.type}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="text-sm font-medium">
                        Score: {Math.round(type.score * 100)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {type.frequency} times
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};