'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Badge } from '@/components/ui/badge';

interface SearchHeatmapProps {
  userId?: string;
  apiUrl: string;
  dateRange: {
    start: Date;
    end: Date;
  };
}

interface HeatmapData {
  queryTerms: Array<{
    term: string;
    frequency: number;
    intensity: number; // 0-1 scale for heat intensity
    successRate: number;
    avgPosition: number;
  }>;
  timeDistribution: Array<{
    hour: number;
    searches: number;
    intensity: number;
  }>;
  categoryHeatmap: Array<{
    category: string;
    searches: number;
    successRate: number;
    intensity: number;
  }>;
  weekdayDistribution: Array<{
    day: string;
    searches: number;
    intensity: number;
  }>;
}

export const SearchHeatmap: React.FC<SearchHeatmapProps> = ({
  userId,
  apiUrl,
  dateRange,
}) => {
  const [loading, setLoading] = useState(true);
  const [heatmapData, setHeatmapData] = useState<HeatmapData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<'terms' | 'time' | 'categories' | 'weekdays'>('terms');

  useEffect(() => {
    const fetchHeatmapData = async () => {
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

        const response = await fetch(`${apiUrl}/analytics/heatmap?${params}`);
        const result = await response.json();
        
        if (result.success) {
          setHeatmapData(result.data);
        } else {
          setError(result.message || 'Failed to load heatmap data');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch heatmap data');
        console.error('Failed to fetch heatmap data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchHeatmapData();
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

  if (!heatmapData) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-32">
          <p className="text-muted-foreground">No heatmap data available</p>
        </CardContent>
      </Card>
    );
  }

  const getHeatColor = (intensity: number) => {
    const opacity = Math.max(0.1, intensity);
    return `rgba(59, 130, 246, ${opacity})`;
  };

  const getIntensityClass = (intensity: number) => {
    if (intensity >= 0.8) return 'bg-blue-600 text-white';
    if (intensity >= 0.6) return 'bg-blue-500 text-white';
    if (intensity >= 0.4) return 'bg-blue-400 text-white';
    if (intensity >= 0.2) return 'bg-blue-300 text-blue-900';
    return 'bg-blue-100 text-blue-800';
  };

  const renderQueryTermsHeatmap = () => (
    <div className="space-y-3">
      <div className="text-sm font-medium">Search Query Frequency</div>
      <div className="grid gap-2">
        {heatmapData.queryTerms.slice(0, 20).map((term, index) => (
          <div key={term.term} className="flex items-center justify-between">
            <div className="flex items-center gap-2 flex-1">
              <div className="flex items-center gap-1">
                <Badge variant="outline" className="text-xs w-8 justify-center">
                  {index + 1}
                </Badge>
                <div 
                  className="px-2 py-1 rounded text-xs font-medium"
                  style={{ backgroundColor: getHeatColor(term.intensity) }}
                >
                  {term.term}
                </div>
              </div>
              <div className="flex-1 bg-gray-200 rounded-full h-2 mx-2">
                <div 
                  className="bg-blue-500 h-2 rounded-full"
                  style={{ width: `${term.intensity * 100}%` }}
                ></div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm font-medium">{term.frequency}</div>
              <div className="text-xs text-muted-foreground">
                {Math.round(term.successRate * 100)}% success
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderTimeHeatmap = () => (
    <div className="space-y-3">
      <div className="text-sm font-medium">Search Activity by Hour</div>
      <div className="grid grid-cols-12 gap-1">
        {Array.from({ length: 24 }, (_, hour) => {
          const data = heatmapData.timeDistribution.find(t => t.hour === hour);
          const searches = data?.searches || 0;
          const intensity = data?.intensity || 0;
          
          return (
            <div key={hour} className="text-center">
              <div 
                className={`w-8 h-8 rounded text-xs flex items-center justify-center font-medium ${getIntensityClass(intensity)}`}
                title={`${hour}:00 - ${searches} searches`}
              >
                {hour}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {searches}
              </div>
            </div>
          );
        })}
      </div>
      <div className="text-xs text-muted-foreground">
        Hours shown in 24-hour format with search counts below
      </div>
    </div>
  );

  const renderCategoriesHeatmap = () => (
    <div className="space-y-3">
      <div className="text-sm font-medium">Search Categories</div>
      <div className="grid gap-2">
        {heatmapData.categoryHeatmap.map((category, index) => (
          <div key={category.category} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div 
                className={`px-3 py-2 rounded text-sm font-medium capitalize ${getIntensityClass(category.intensity)}`}
              >
                {category.category}
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm font-medium">{category.searches} searches</div>
              <div className="text-xs text-muted-foreground">
                {Math.round(category.successRate * 100)}% success rate
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderWeekdaysHeatmap = () => (
    <div className="space-y-3">
      <div className="text-sm font-medium">Search Activity by Day of Week</div>
      <div className="grid grid-cols-7 gap-2">
        {heatmapData.weekdayDistribution.map((day) => (
          <div key={day.day} className="text-center">
            <div 
              className={`p-3 rounded text-sm font-medium ${getIntensityClass(day.intensity)}`}
            >
              {day.day.slice(0, 3)}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {day.searches} searches
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Search Activity Heatmap</CardTitle>
        <CardDescription>
          Visual representation of your search patterns and intensity
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* View Selector */}
        <div className="flex gap-2 mb-6 flex-wrap">
          <button
            onClick={() => setActiveView('terms')}
            className={`px-3 py-1 rounded text-sm ${
              activeView === 'terms' 
                ? 'bg-blue-500 text-white' 
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Query Terms
          </button>
          <button
            onClick={() => setActiveView('time')}
            className={`px-3 py-1 rounded text-sm ${
              activeView === 'time' 
                ? 'bg-blue-500 text-white' 
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Time of Day
          </button>
          <button
            onClick={() => setActiveView('categories')}
            className={`px-3 py-1 rounded text-sm ${
              activeView === 'categories' 
                ? 'bg-blue-500 text-white' 
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Categories
          </button>
          <button
            onClick={() => setActiveView('weekdays')}
            className={`px-3 py-1 rounded text-sm ${
              activeView === 'weekdays' 
                ? 'bg-blue-500 text-white' 
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Day of Week
          </button>
        </div>

        {/* Heatmap Content */}
        <div className="min-h-64">
          {activeView === 'terms' && renderQueryTermsHeatmap()}
          {activeView === 'time' && renderTimeHeatmap()}
          {activeView === 'categories' && renderCategoriesHeatmap()}
          {activeView === 'weekdays' && renderWeekdaysHeatmap()}
        </div>

        {/* Legend */}
        <div className="mt-6 pt-4 border-t">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Heat Intensity Scale:</span>
            <div className="flex items-center gap-1">
              <span>Low</span>
              <div className="flex gap-1">
                <div className="w-4 h-4 bg-blue-100 rounded"></div>
                <div className="w-4 h-4 bg-blue-300 rounded"></div>
                <div className="w-4 h-4 bg-blue-500 rounded"></div>
                <div className="w-4 h-4 bg-blue-600 rounded"></div>
              </div>
              <span>High</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};