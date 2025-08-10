/**
 * PersonalizedSearchResults - Enhanced search results with personalization indicators
 */

'use client';

import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

interface PersonalizationFactor {
  factorType: string;
  factorName: string;
  weight: number;
  contribution: number;
  explanation: string;
}

interface PersonalizedResult {
  id: string;
  title: string;
  description: string;
  url: string;
  source: string;
  type: string;
  score: number;
  personalizedScore: number;
  personalizationFactors: PersonalizationFactor[];
  isPersonalized: boolean;
  timestamp: string;
}

interface PersonalizedSearchResultsProps {
  results: PersonalizedResult[];
  onResultClick: (result: PersonalizedResult, index: number) => void;
  onResultSave: (result: PersonalizedResult) => void;
  onResultShare: (result: PersonalizedResult) => void;
}

export const PersonalizedSearchResults: React.FC<PersonalizedSearchResultsProps> = ({
  results,
  onResultClick,
  onResultSave,
  onResultShare
}) => {
  const [showFactors, setShowFactors] = useState<Record<string, boolean>>({});

  const toggleFactors = (resultId: string) => {
    setShowFactors(prev => ({ ...prev, [resultId]: !prev[resultId] }));
  };

  const getPersonalizationBoost = (result: PersonalizedResult) => {
    return result.personalizedScore - result.score;
  };

  const getBoostColor = (boost: number) => {
    if (boost > 0.1) return 'text-green-600';
    if (boost < -0.1) return 'text-red-600';
    return 'text-gray-600';
  };

  const formatSource = (source: string) => {
    try {
      const url = new URL(source);
      return url.hostname.replace('www.', '');
    } catch {
      return source;
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${Math.floor(diffHours)}h ago`;
    if (diffDays < 7) return `${Math.floor(diffDays)}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="space-y-4">
      {results.map((result, index) => (
        <Card key={result.id} className="p-6 hover:shadow-md transition-shadow">
          <div className="flex items-start space-x-4">
            {/* Result Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center space-x-2 mb-2">
                <h3 
                  className="text-lg font-medium text-blue-600 hover:text-blue-800 cursor-pointer"
                  onClick={() => onResultClick(result, index)}
                >
                  {result.title}
                </h3>
                
                {result.isPersonalized && (
                  <Badge variant="outline" className="text-blue-600 border-blue-600">
                    🎯 Personalized
                  </Badge>
                )}
              </div>
              
              <p 
                className="text-gray-600 text-sm mb-3 line-clamp-3 cursor-pointer"
                onClick={() => onResultClick(result, index)}
              >
                {result.description}
              </p>
              
              <div className="flex items-center space-x-4 text-sm text-gray-500 mb-3">
                <span>{formatSource(result.source)}</span>
                <span>•</span>
                <span>{result.type}</span>
                <span>•</span>
                <span>{formatTimestamp(result.timestamp)}</span>
              </div>

              {/* Personalization Indicators */}
              {result.isPersonalized && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-3">
                      <span className="text-sm font-medium text-blue-700">
                        Personalization Score
                      </span>
                      <Progress 
                        value={result.personalizedScore * 100} 
                        className="w-24 h-2"
                      />
                      <span className="text-sm font-medium text-blue-700">
                        {Math.round(result.personalizedScore * 100)}%
                      </span>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <span className={`text-sm font-medium ${getBoostColor(getPersonalizationBoost(result))}`}>
                        {getPersonalizationBoost(result) > 0 ? '+' : ''}
                        {Math.round(getPersonalizationBoost(result) * 100)}%
                      </span>
                      
                      {result.personalizationFactors.length > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleFactors(result.id)}
                        >
                          {showFactors[result.id] ? 'Hide' : 'Show'} Factors
                        </Button>
                      )}
                    </div>
                  </div>
                  
                  {/* Personalization Factors */}
                  {showFactors[result.id] && result.personalizationFactors.length > 0 && (
                    <div className="mt-3 p-3 bg-white rounded border">
                      <h4 className="text-sm font-medium text-gray-700 mb-2">
                        Why this result was personalized:
                      </h4>
                      <div className="space-y-2">
                        {result.personalizationFactors.slice(0, 3).map((factor, fIndex) => (
                          <div key={fIndex} className="flex items-center justify-between">
                            <div className="flex-1">
                              <span className="text-sm text-gray-600">{factor.explanation}</span>
                              <div className="flex items-center space-x-2 mt-1">
                                <Badge variant="secondary" size="sm">
                                  {factor.factorType}
                                </Badge>
                                <span className="text-xs text-gray-500">
                                  Weight: {Math.round(factor.weight * 100)}%
                                </span>
                              </div>
                            </div>
                            <div className="ml-3">
                              <Progress 
                                value={Math.abs(factor.contribution) * 100} 
                                className="w-16 h-2"
                              />
                            </div>
                          </div>
                        ))}
                        
                        {result.personalizationFactors.length > 3 && (
                          <p className="text-xs text-gray-500 mt-2">
                            +{result.personalizationFactors.length - 3} more factors
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col space-y-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onResultSave(result)}
                title="Save this result"
              >
                🔖 Save
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => onResultShare(result)}
                title="Share this result"
              >
                📤 Share
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(result.url, '_blank')}
                title="Open in new tab"
              >
                🔗 Open
              </Button>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
};