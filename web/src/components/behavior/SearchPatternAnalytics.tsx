'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingSpinner } from '@/components/ui/loading-spinner';

interface SearchPatternAnalyticsProps {
  userId?: string;
  apiUrl: string;
  dateRange: {
    start: Date;
    end: Date;
  };
}

export const SearchPatternAnalytics: React.FC<SearchPatternAnalyticsProps> = ({
  userId,
  apiUrl,
  dateRange,
}) => {
  const [loading, setLoading] = useState(true);
  const [patterns, setPatterns] = useState<any[]>([]);

  useEffect(() => {
    const fetchPatterns = async () => {
      try {
        if (!userId) {
          setLoading(false);
          return;
        }

        const response = await fetch(`${apiUrl}/patterns?userId=${userId}`);
        const result = await response.json();
        
        if (result.success) {
          setPatterns(result.data.patterns || []);
        }
      } catch (error) {
        console.error('Failed to fetch search patterns:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchPatterns();
  }, [userId, apiUrl]);

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Search Pattern Analysis</CardTitle>
          <CardDescription>
            Your search behavior patterns and preferences
          </CardDescription>
        </CardHeader>
        <CardContent>
          {patterns.length > 0 ? (
            <div className="space-y-4">
              {patterns.map((pattern, index) => (
                <div key={pattern.id || index} className="border rounded p-3">
                  <h4 className="font-medium">{pattern.patternName}</h4>
                  <p className="text-sm text-muted-foreground">{pattern.patternDescription}</p>
                  <div className="mt-2 text-xs text-muted-foreground">
                    Confidence: {Math.round((pattern.confidenceScore || 0) * 100)}% • 
                    Occurrences: {pattern.occurrences}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground">No search patterns detected yet. Use the search feature to build your pattern history.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};