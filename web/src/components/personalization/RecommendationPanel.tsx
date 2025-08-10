/**
 * RecommendationPanel - Personalized content discovery panel
 * 
 * Displays various types of personalized recommendations:
 * - Content recommendations based on interests
 * - Related searches and topics
 * - Trending content for the user
 * - Action suggestions and tools
 */

'use client';

import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { LoadingSpinner } from '@/components/ui/loading-spinner';

interface Recommendation {
  id: string;
  recommendationType: 'search_query' | 'content' | 'topic' | 'action';
  recommendationCategory: 'suggestion' | 'related' | 'trending' | 'new';
  recommendationTitle: string;
  recommendationDescription?: string;
  recommendationData: any;
  relevanceScore: number;
  confidenceScore: number;
  noveltyScore: number;
  createdAt: string;
}

interface RecommendationPanelProps {
  recommendations: Recommendation[];
  onRecommendationClick: (recommendation: Recommendation) => void;
  className?: string;
}

export const RecommendationPanel: React.FC<RecommendationPanelProps> = ({
  recommendations,
  onRecommendationClick,
  className = ''
}) => {
  const [activeTab, setActiveTab] = useState<'all' | 'content' | 'queries' | 'topics' | 'actions'>('all');
  const [loadingMore, setLoadingMore] = useState(false);
  const [providingFeedback, setProvidingFeedback] = useState<string | null>(null);

  // Filter recommendations by type
  const filteredRecommendations = recommendations.filter(rec => {
    if (activeTab === 'all') return true;
    if (activeTab === 'content') return rec.recommendationType === 'content';
    if (activeTab === 'queries') return rec.recommendationType === 'search_query';
    if (activeTab === 'topics') return rec.recommendationType === 'topic';
    if (activeTab === 'actions') return rec.recommendationType === 'action';
    return true;
  });

  // Group recommendations by category
  const groupedRecommendations = filteredRecommendations.reduce((groups, rec) => {
    const category = rec.recommendationCategory;
    if (!groups[category]) groups[category] = [];
    groups[category].push(rec);
    return groups;
  }, {} as Record<string, Recommendation[]>);

  const handleRecommendationClick = (recommendation: Recommendation) => {
    onRecommendationClick(recommendation);
    
    // Handle different recommendation types
    if (recommendation.recommendationType === 'search_query' && recommendation.recommendationData.query) {
      // For search queries, trigger a search
      const searchEvent = new CustomEvent('personalized-search', {
        detail: { query: recommendation.recommendationData.query }
      });
      window.dispatchEvent(searchEvent);
    } else if (recommendation.recommendationType === 'content' && recommendation.recommendationData.url) {
      // For content, open in new tab
      window.open(recommendation.recommendationData.url, '_blank');
    }
  };

  const provideFeedback = async (recommendationId: string, score: number) => {
    try {
      setProvidingFeedback(recommendationId);
      
      await fetch(`/api/v1/personalization/recommendations/${recommendationId}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          feedbackScore: score,
          implicitSignals: { timestamp: Date.now() }
        })
      });

    } catch (error) {
      console.error('Error providing feedback:', error);
    } finally {
      setProvidingFeedback(null);
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'suggestion': return '💡';
      case 'related': return '🔗';
      case 'trending': return '📈';
      case 'new': return '✨';
      default: return '📋';
    }
  };

  const getCategoryTitle = (category: string) => {
    switch (category) {
      case 'suggestion': return 'Suggestions';
      case 'related': return 'Related';
      case 'trending': return 'Trending';
      case 'new': return 'New';
      default: return 'Recommendations';
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'search_query': return 'text-blue-600 border-blue-600';
      case 'content': return 'text-green-600 border-green-600';
      case 'topic': return 'text-purple-600 border-purple-600';
      case 'action': return 'text-orange-600 border-orange-600';
      default: return 'text-gray-600 border-gray-600';
    }
  };

  if (recommendations.length === 0) {
    return (
      <Card className={`p-6 ${className}`}>
        <h3 className="text-lg font-semibold mb-4">Recommendations</h3>
        <div className="text-center py-8">
          <p className="text-gray-500 mb-4">No recommendations yet</p>
          <p className="text-sm text-gray-400">
            Start searching to get personalized recommendations based on your interests!
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card className={`${className}`}>
      <div className="p-4 border-b border-gray-200">
        <h3 className="text-lg font-semibold">Recommendations</h3>
        
        {/* Tab Navigation */}
        <div className="flex flex-wrap gap-2 mt-3">
          <Button
            variant={activeTab === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveTab('all')}
          >
            All ({recommendations.length})
          </Button>
          <Button
            variant={activeTab === 'queries' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveTab('queries')}
          >
            Queries
          </Button>
          <Button
            variant={activeTab === 'content' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveTab('content')}
          >
            Content
          </Button>
          <Button
            variant={activeTab === 'topics' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveTab('topics')}
          >
            Topics
          </Button>
        </div>
      </div>

      <div className="max-h-96 overflow-y-auto">
        {Object.entries(groupedRecommendations).map(([category, recs]) => (
          <div key={category} className="p-4 border-b border-gray-100 last:border-b-0">
            <div className="flex items-center space-x-2 mb-3">
              <span className="text-sm font-medium text-gray-700">
                {getCategoryIcon(category)} {getCategoryTitle(category)}
              </span>
              <Badge variant="outline" size="sm">
                {recs.length}
              </Badge>
            </div>
            
            <div className="space-y-3">
              {recs.map((recommendation) => (
                <div
                  key={recommendation.id}
                  className="group p-3 bg-gray-50 hover:bg-gray-100 rounded-lg cursor-pointer transition-colors"
                  onClick={() => handleRecommendationClick(recommendation)}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-sm truncate group-hover:text-blue-600">
                        {recommendation.recommendationTitle}
                      </h4>
                      {recommendation.recommendationDescription && (
                        <p className="text-xs text-gray-600 mt-1 line-clamp-2">
                          {recommendation.recommendationDescription}
                        </p>
                      )}
                    </div>
                    
                    <Badge 
                      variant="outline" 
                      size="sm" 
                      className={`ml-2 ${getTypeColor(recommendation.recommendationType)}`}
                    >
                      {recommendation.recommendationType.replace('_', ' ')}
                    </Badge>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div className="flex items-center space-x-1">
                        <span className="text-xs text-gray-500">Relevance</span>
                        <Progress 
                          value={recommendation.relevanceScore * 100} 
                          className="w-16 h-1"
                        />
                        <span className="text-xs text-gray-500">
                          {Math.round(recommendation.relevanceScore * 100)}%
                        </span>
                      </div>
                    </div>
                    
                    {/* Feedback Buttons */}
                    <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          provideFeedback(recommendation.id, 1);
                        }}
                        disabled={providingFeedback === recommendation.id}
                        className="p-1 h-6 w-6 text-green-600 hover:text-green-700"
                      >
                        👍
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          provideFeedback(recommendation.id, -1);
                        }}
                        disabled={providingFeedback === recommendation.id}
                        className="p-1 h-6 w-6 text-red-600 hover:text-red-700"
                      >
                        👎
                      </Button>
                    </div>
                  </div>
                  
                  {/* Additional metadata for certain types */}
                  {recommendation.recommendationType === 'search_query' && 
                   recommendation.recommendationData.query && (
                    <div className="mt-2 p-2 bg-white rounded border">
                      <code className="text-xs text-blue-600">
                        "{recommendation.recommendationData.query}"
                      </code>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Load More Button */}
      <div className="p-4 border-t border-gray-200">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            // TODO: Implement load more functionality
            setLoadingMore(true);
            setTimeout(() => setLoadingMore(false), 1000);
          }}
          disabled={loadingMore}
          className="w-full"
        >
          {loadingMore ? (
            <>
              <LoadingSpinner size="sm" className="mr-2" />
              Loading...
            </>
          ) : (
            'Load More Recommendations'
          )}
        </Button>
      </div>
    </Card>
  );
};