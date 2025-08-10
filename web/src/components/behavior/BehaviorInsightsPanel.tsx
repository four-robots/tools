'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/ui/loading-spinner';

interface BehaviorInsightsPanelProps {
  userId?: string;
  apiUrl: string;
}

export const BehaviorInsightsPanel: React.FC<BehaviorInsightsPanelProps> = ({
  userId,
  apiUrl,
}) => {
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [insights, setInsights] = useState<any[]>([]);
  const [recommendations, setRecommendations] = useState<any[]>([]);

  const fetchInsights = async () => {
    try {
      if (!userId) {
        setLoading(false);
        return;
      }

      const response = await fetch(`${apiUrl}/insights?userId=${userId}`);
      const result = await response.json();
      
      if (result.success) {
        setInsights(result.data.insights || []);
      }
    } catch (error) {
      console.error('Failed to fetch insights:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchRecommendations = async () => {
    try {
      if (!userId) return;

      const response = await fetch(`${apiUrl}/recommendations?userId=${userId}`);
      const result = await response.json();
      
      if (result.success) {
        setRecommendations(result.data.recommendations || []);
      }
    } catch (error) {
      console.error('Failed to fetch recommendations:', error);
    }
  };

  const generateInsights = async () => {
    if (!userId) return;
    
    setGenerating(true);
    try {
      const response = await fetch(`${apiUrl}/insights/generate?userId=${userId}`, {
        method: 'POST',
      });
      const result = await response.json();
      
      if (result.success) {
        await fetchInsights();
      }
    } catch (error) {
      console.error('Failed to generate insights:', error);
    } finally {
      setGenerating(false);
    }
  };

  useEffect(() => {
    fetchInsights();
    fetchRecommendations();
  }, [userId, apiUrl]);

  if (loading) {
    return <LoadingSpinner />;
  }

  const getImpactColor = (score?: number) => {
    if (!score) return 'bg-gray-100 text-gray-800';
    if (score >= 0.8) return 'bg-red-100 text-red-800';
    if (score >= 0.6) return 'bg-yellow-100 text-yellow-800';
    return 'bg-green-100 text-green-800';
  };

  const getImpactLabel = (score?: number) => {
    if (!score) return 'Unknown';
    if (score >= 0.8) return 'High';
    if (score >= 0.6) return 'Medium';
    return 'Low';
  };

  return (
    <div className="space-y-4">
      {/* Generate Insights */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Behavior Insights</CardTitle>
              <CardDescription>
                AI-generated insights based on your usage patterns
              </CardDescription>
            </div>
            <Button 
              onClick={generateInsights}
              disabled={generating || !userId}
              size="sm"
            >
              {generating ? <LoadingSpinner size="sm" /> : '🔄'} Generate New Insights
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {insights.length > 0 ? (
            <div className="space-y-4">
              {insights.map((insight, index) => (
                <div key={insight.id || index} className="border rounded p-4 space-y-2">
                  <div className="flex items-start justify-between">
                    <h4 className="font-medium">{insight.insightTitle}</h4>
                    <Badge 
                      variant="secondary"
                      className={getImpactColor(insight.impactScore)}
                    >
                      {getImpactLabel(insight.impactScore)} Impact
                    </Badge>
                  </div>
                  
                  <p className="text-sm text-muted-foreground">
                    {insight.insightDescription}
                  </p>
                  
                  {insight.recommendation && (
                    <div className="bg-blue-50 p-3 rounded text-sm">
                      <strong>Recommendation:</strong> {insight.recommendation.description}
                    </div>
                  )}
                  
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline" className="text-xs">
                      {insight.insightCategory}
                    </Badge>
                    <span>•</span>
                    <span>Generated {new Date(insight.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-muted-foreground mb-4">
                No insights available yet. Generate insights based on your behavior data.
              </p>
              <Button 
                onClick={generateInsights}
                disabled={generating || !userId}
                variant="outline"
              >
                {generating ? <LoadingSpinner size="sm" /> : '✨'} Generate First Insights
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Personalized Recommendations</CardTitle>
            <CardDescription>
              Suggestions to improve your search experience
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recommendations.map((rec, index) => (
                <div key={index} className="border-l-4 border-blue-400 pl-4 py-2">
                  <h4 className="font-medium text-sm">{rec.title}</h4>
                  <p className="text-sm text-muted-foreground">{rec.description}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {rec.type}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      Confidence: {Math.round((rec.confidence || 0) * 100)}%
                    </span>
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