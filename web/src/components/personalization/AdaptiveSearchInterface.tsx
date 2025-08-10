/**
 * AdaptiveSearchInterface - Personalized search experience wrapper
 * 
 * Intelligent search interface that adapts to user preferences:
 * - Personalized search result ranking and display
 * - Smart query suggestions based on interests
 * - Adaptive UI layout and components
 * - Context-aware recommendations
 * - Real-time personalization learning
 */

'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { SearchInput } from '@/components/search/SearchInput';
import { SearchResults } from '@/components/search/SearchResults';
import { SearchFilters } from '@/components/search/SearchFilters';
import { SmartSuggestions } from './SmartSuggestions';
import { RecommendationPanel } from './RecommendationPanel';
import { PersonalizedSearchResults } from './PersonalizedSearchResults';

interface SearchResult {
  id: string;
  title: string;
  description: string;
  url: string;
  source: string;
  type: string;
  score: number;
  timestamp: string;
}

interface PersonalizedResult extends SearchResult {
  personalizedScore: number;
  personalizationFactors: PersonalizationFactor[];
  isPersonalized: boolean;
}

interface PersonalizationFactor {
  factorType: string;
  factorName: string;
  weight: number;
  contribution: number;
  explanation: string;
}

interface AdaptiveLayout {
  layoutId: string;
  components: {
    order: string[];
    visibility: Record<string, boolean>;
    sizes: Record<string, string>;
  };
  appearance: {
    density: 'compact' | 'comfortable' | 'spacious';
    navigation: 'sidebar' | 'topbar' | 'minimal';
    colorScheme: 'light' | 'dark' | 'auto';
    animations: boolean;
  };
}

interface AdaptiveSearchInterfaceProps {
  initialQuery?: string;
  onSearchResults?: (results: PersonalizedResult[]) => void;
  onQueryChange?: (query: string) => void;
  className?: string;
}

export const AdaptiveSearchInterface: React.FC<AdaptiveSearchInterfaceProps> = ({
  initialQuery = '',
  onSearchResults,
  onQueryChange,
  className = ''
}) => {
  // State management
  const [query, setQuery] = useState(initialQuery);
  const [originalResults, setOriginalResults] = useState<SearchResult[]>([]);
  const [personalizedResults, setPersonalizedResults] = useState<PersonalizedResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Personalization state
  const [adaptiveLayout, setAdaptiveLayout] = useState<AdaptiveLayout | null>(null);
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [personalizationEnabled, setPersonalizationEnabled] = useState(true);
  
  // Search context
  const [filters, setFilters] = useState<Record<string, any>>({});
  const [currentPage, setCurrentPage] = useState(1);
  const [sortBy, setSortBy] = useState<'relevance' | 'date' | 'personalized'>('personalized');

  // Analytics and feedback
  const [searchStartTime, setSearchStartTime] = useState<number>(0);
  const [userInteractions, setUserInteractions] = useState<Array<{
    type: string;
    data: any;
    timestamp: number;
  }>>([]);

  // Load adaptive layout on component mount
  useEffect(() => {
    loadAdaptiveLayout();
    loadRecommendations();
  }, []);

  // Update query when prop changes
  useEffect(() => {
    if (initialQuery !== query) {
      setQuery(initialQuery);
      if (initialQuery.trim()) {
        executeSearch(initialQuery);
      }
    }
  }, [initialQuery]);

  // Notify parent of query changes
  useEffect(() => {
    onQueryChange?.(query);
  }, [query, onQueryChange]);

  // Load adaptive layout based on user preferences
  const loadAdaptiveLayout = async () => {
    try {
      const deviceInfo = {
        screenWidth: window.innerWidth,
        screenHeight: window.innerHeight,
        touchCapable: 'ontouchstart' in window,
        pixelRatio: window.devicePixelRatio
      };

      const response = await fetch('/api/v1/personalization/interface/layout?' + 
        new URLSearchParams({ device: JSON.stringify(deviceInfo) })
      );
      
      if (response.ok) {
        const data = await response.json();
        setAdaptiveLayout(data.data);
      }
    } catch (error) {
      console.error('Error loading adaptive layout:', error);
    }
  };

  // Load personalized recommendations
  const loadRecommendations = async () => {
    try {
      const [recommendationsRes, suggestionsRes] = await Promise.all([
        fetch('/api/v1/personalization/recommendations?type=content&count=5'),
        fetch('/api/v1/personalization/suggestions?count=5')
      ]);

      if (recommendationsRes.ok) {
        const recData = await recommendationsRes.json();
        setRecommendations(recData.data);
      }

      if (suggestionsRes.ok) {
        const sugData = await suggestionsRes.json();
        setSuggestions(sugData.data);
      }
    } catch (error) {
      console.error('Error loading recommendations:', error);
    }
  };

  // Execute search with personalization
  const executeSearch = async (searchQuery: string) => {
    if (!searchQuery.trim()) return;

    try {
      setLoading(true);
      setError(null);
      setSearchStartTime(Date.now());
      
      // First, get original search results (from existing search API)
      const searchResponse = await fetch('/api/v1/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: searchQuery,
          filters,
          page: currentPage,
          limit: 20
        })
      });

      if (!searchResponse.ok) {
        throw new Error('Search failed');
      }

      const searchData = await searchResponse.json();
      const results = searchData.results || [];
      setOriginalResults(results);

      // Track search event
      trackUserInteraction('search_executed', {
        query: searchQuery,
        filters,
        resultsCount: results.length
      });

      // Apply personalization if enabled
      if (personalizationEnabled && results.length > 0) {
        await personalizeResults(searchQuery, results);
      } else {
        // Convert to PersonalizedResult format without personalization
        const nonPersonalizedResults = results.map((result: SearchResult) => ({
          ...result,
          personalizedScore: result.score,
          personalizationFactors: [],
          isPersonalized: false
        }));
        setPersonalizedResults(nonPersonalizedResults);
        onSearchResults?.(nonPersonalizedResults);
      }

      // Load fresh suggestions based on the query
      loadQuerySuggestions(searchQuery);

    } catch (err) {
      console.error('Search error:', err);
      setError('Search failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Apply personalization to search results
  const personalizeResults = async (searchQuery: string, results: SearchResult[]) => {
    try {
      const context = {
        filters,
        page: currentPage,
        device: {
          screenWidth: window.innerWidth,
          touchCapable: 'ontouchstart' in window
        },
        session: {
          searchCount: userInteractions.filter(i => i.type === 'search_executed').length,
          timestamp: Date.now()
        }
      };

      const response = await fetch('/api/v1/personalization/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: searchQuery,
          originalResults: results,
          context
        })
      });

      if (!response.ok) {
        throw new Error('Personalization failed');
      }

      const data = await response.json();
      const personalizedData = data.data.personalizedResults;
      
      // Map to PersonalizedResult format
      const personalizedResults: PersonalizedResult[] = personalizedData.personalizedResults.map(
        (result: SearchResult, index: number) => ({
          ...result,
          personalizedScore: personalizedData.finalScores[result.id] || result.score,
          personalizationFactors: personalizedData.personalizationFactors.filter(
            (factor: PersonalizationFactor) => factor.factorName.includes(result.title) || 
            Math.random() > 0.5 // Simplified factor assignment
          ),
          isPersonalized: true
        })
      );

      setPersonalizedResults(personalizedResults);
      onSearchResults?.(personalizedResults);

      // Track personalization success
      trackUserInteraction('personalization_applied', {
        query: searchQuery,
        factorsApplied: personalizedData.personalizationFactors.length,
        confidenceScore: personalizedData.confidenceScore,
        processingTime: Date.now() - searchStartTime
      });

    } catch (error) {
      console.error('Personalization error:', error);
      // Fallback to non-personalized results
      const fallbackResults = results.map((result: SearchResult) => ({
        ...result,
        personalizedScore: result.score,
        personalizationFactors: [],
        isPersonalized: false
      }));
      setPersonalizedResults(fallbackResults);
      onSearchResults?.(fallbackResults);
    }
  };

  // Load query-specific suggestions
  const loadQuerySuggestions = async (searchQuery: string) => {
    try {
      const response = await fetch('/api/v1/personalization/suggestions?' + 
        new URLSearchParams({
          count: '5',
          context: JSON.stringify({ query: searchQuery })
        })
      );

      if (response.ok) {
        const data = await response.json();
        setSuggestions(data.data);
      }
    } catch (error) {
      console.error('Error loading suggestions:', error);
    }
  };

  // Track user interactions for learning
  const trackUserInteraction = (type: string, data: any) => {
    const interaction = {
      type,
      data,
      timestamp: Date.now()
    };

    setUserInteractions(prev => [...prev, interaction]);

    // Send to behavior tracking API periodically
    if (userInteractions.length > 0 && userInteractions.length % 5 === 0) {
      sendBehaviorData([...userInteractions, interaction]);
    }
  };

  // Send behavior data for learning
  const sendBehaviorData = async (interactions: typeof userInteractions) => {
    try {
      await fetch('/api/v1/personalization/behavior-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          events: interactions.map(interaction => ({
            eventType: 'search',
            eventAction: interaction.type,
            searchQuery: query,
            resultData: interaction.data,
            eventTimestamp: new Date(interaction.timestamp).toISOString(),
            interactionDurationMs: interaction.data.processingTime || 0
          }))
        })
      });
    } catch (error) {
      console.error('Error sending behavior data:', error);
    }
  };

  // Handle result interactions
  const handleResultClick = (result: PersonalizedResult, index: number) => {
    trackUserInteraction('result_clicked', {
      resultId: result.id,
      position: index,
      isPersonalized: result.isPersonalized,
      personalizedScore: result.personalizedScore,
      originalScore: result.score
    });

    // Open result
    window.open(result.url, '_blank');
  };

  const handleResultSave = (result: PersonalizedResult) => {
    trackUserInteraction('result_saved', {
      resultId: result.id,
      isPersonalized: result.isPersonalized
    });
  };

  const handleResultShare = (result: PersonalizedResult) => {
    trackUserInteraction('result_shared', {
      resultId: result.id,
      isPersonalized: result.isPersonalized
    });
  };

  // Handle suggestion clicks
  const handleSuggestionClick = (suggestion: any) => {
    trackUserInteraction('suggestion_clicked', {
      suggestionId: suggestion.id,
      query: suggestion.query
    });
    
    setQuery(suggestion.query);
    executeSearch(suggestion.query);
  };

  // Apply adaptive layout styles
  const layoutStyles = useMemo(() => {
    if (!adaptiveLayout) return {};

    const styles: React.CSSProperties = {};
    
    if (adaptiveLayout.appearance.density === 'compact') {
      styles.fontSize = '0.875rem';
      styles.lineHeight = '1.25';
    } else if (adaptiveLayout.appearance.density === 'spacious') {
      styles.fontSize = '1.125rem';
      styles.lineHeight = '1.75';
    }

    return styles;
  }, [adaptiveLayout]);

  // Determine component visibility
  const componentVisibility = adaptiveLayout?.components.visibility || {
    suggestions: true,
    recommendations: true,
    filters: true,
    personalizationIndicator: true
  };

  // Sort results based on preference
  const sortedResults = useMemo(() => {
    const results = [...personalizedResults];
    
    if (sortBy === 'personalized') {
      return results.sort((a, b) => b.personalizedScore - a.personalizedScore);
    } else if (sortBy === 'date') {
      return results.sort((a, b) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
    } else {
      return results.sort((a, b) => b.score - a.score);
    }
  }, [personalizedResults, sortBy]);

  return (
    <div className={`adaptive-search-interface ${className}`} style={layoutStyles}>
      <div className="space-y-6">
        {/* Search Header */}
        <div className="flex items-center justify-between">
          <div className="flex-1 max-w-2xl">
            <SearchInput
              query={query}
              onQueryChange={setQuery}
              onSearch={executeSearch}
              loading={loading}
              placeholder="Search with personalized results..."
            />
          </div>

          <div className="flex items-center space-x-3">
            {/* Personalization Toggle */}
            <Button
              variant={personalizationEnabled ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setPersonalizationEnabled(!personalizationEnabled);
                if (query.trim()) executeSearch(query);
              }}
            >
              {personalizationEnabled ? "🎯 Personalized" : "🔍 Standard"}
            </Button>

            {/* Sort Options */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm"
            >
              <option value="personalized">Best Match</option>
              <option value="relevance">Most Relevant</option>
              <option value="date">Most Recent</option>
            </select>
          </div>
        </div>

        {/* Suggestions */}
        {componentVisibility.suggestions && suggestions.length > 0 && (
          <SmartSuggestions
            suggestions={suggestions}
            onSuggestionClick={handleSuggestionClick}
          />
        )}

        {/* Search Results Area */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Filters Sidebar */}
          {componentVisibility.filters && (
            <div className="lg:col-span-1">
              <SearchFilters
                filters={filters}
                onFiltersChange={setFilters}
                onApply={() => query.trim() && executeSearch(query)}
              />
            </div>
          )}

          {/* Main Results */}
          <div className={componentVisibility.filters ? "lg:col-span-2" : "lg:col-span-3"}>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <LoadingSpinner size="lg" />
                <span className="ml-3">Personalizing your results...</span>
              </div>
            ) : error ? (
              <Card className="p-6 text-center">
                <p className="text-red-600 mb-4">{error}</p>
                <Button onClick={() => query.trim() && executeSearch(query)}>
                  Try Again
                </Button>
              </Card>
            ) : sortedResults.length > 0 ? (
              <div className="space-y-4">
                {/* Personalization Indicator */}
                {componentVisibility.personalizationIndicator && personalizationEnabled && (
                  <Card className="p-4 bg-blue-50 border-blue-200">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <Badge variant="outline" className="text-blue-600 border-blue-600">
                          🎯 Personalized Results
                        </Badge>
                        <span className="text-sm text-blue-700">
                          Results ranked based on your interests and behavior
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setPersonalizationEnabled(false)}
                      >
                        Turn Off
                      </Button>
                    </div>
                  </Card>
                )}

                {/* Results */}
                <PersonalizedSearchResults
                  results={sortedResults}
                  onResultClick={handleResultClick}
                  onResultSave={handleResultSave}
                  onResultShare={handleResultShare}
                />
              </div>
            ) : query.trim() ? (
              <Card className="p-8 text-center">
                <p className="text-gray-500 mb-4">No results found for "{query}"</p>
                <p className="text-sm text-gray-400">Try adjusting your search terms or filters</p>
              </Card>
            ) : (
              <Card className="p-8 text-center">
                <p className="text-gray-500">Enter a search query to get started</p>
              </Card>
            )}
          </div>

          {/* Recommendations Sidebar */}
          {componentVisibility.recommendations && (
            <div className="lg:col-span-1">
              <RecommendationPanel
                recommendations={recommendations}
                onRecommendationClick={(rec) => {
                  trackUserInteraction('recommendation_clicked', { recommendationId: rec.id });
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};