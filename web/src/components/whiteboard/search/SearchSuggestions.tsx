import React, { useMemo } from 'react';
import {
  MagnifyingGlassIcon,
  TagIcon,
  UserIcon,
  DocumentIcon,
  ClockIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';
import { SearchSuggestion } from '@shared/types/whiteboard';

interface SearchSuggestionsProps {
  suggestions: SearchSuggestion[];
  isLoading: boolean;
  onSelect: (suggestion: SearchSuggestion) => void;
  query: string;
  className?: string;
  maxItems?: number;
}

const SearchSuggestions: React.FC<SearchSuggestionsProps> = ({
  suggestions,
  isLoading,
  onSelect,
  query,
  className = '',
  maxItems = 10,
}) => {
  // Group suggestions by type
  const groupedSuggestions = useMemo(() => {
    const groups: Record<string, SearchSuggestion[]> = {};
    
    suggestions.slice(0, maxItems).forEach(suggestion => {
      const type = suggestion.type;
      if (!groups[type]) {
        groups[type] = [];
      }
      groups[type].push(suggestion);
    });
    
    return groups;
  }, [suggestions, maxItems]);

  // Get icon for suggestion type
  const getSuggestionIcon = (type: string) => {
    const iconClass = 'h-4 w-4';
    
    switch (type) {
      case 'query':
        return <MagnifyingGlassIcon className={`${iconClass} text-gray-500`} />;
      case 'tag':
        return <TagIcon className={`${iconClass} text-blue-500`} />;
      case 'user':
        return <UserIcon className={`${iconClass} text-green-500`} />;
      case 'template':
        return <DocumentIcon className={`${iconClass} text-purple-500`} />;
      case 'filter':
        return <MagnifyingGlassIcon className={`${iconClass} text-orange-500`} />;
      default:
        return <MagnifyingGlassIcon className={`${iconClass} text-gray-500`} />;
    }
  };

  // Get display label for suggestion type
  const getSuggestionTypeLabel = (type: string): string => {
    switch (type) {
      case 'query':
        return 'Recent Searches';
      case 'tag':
        return 'Tags';
      case 'user':
        return 'Users';
      case 'template':
        return 'Templates';
      case 'filter':
        return 'Filters';
      default:
        return 'Suggestions';
    }
  };

  // Highlight matching text in suggestions
  const highlightMatch = (text: string, query: string): React.ReactNode => {
    if (!query) return text;
    
    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const index = lowerText.indexOf(lowerQuery);
    
    if (index === -1) return text;
    
    return (
      <>
        {text.substring(0, index)}
        <span className="font-semibold text-blue-600 bg-blue-50 px-0.5 rounded">
          {text.substring(index, index + query.length)}
        </span>
        {text.substring(index + query.length)}
      </>
    );
  };

  // Format suggestion score as confidence indicator
  const getConfidenceIndicator = (score: number) => {
    if (score >= 0.8) return { text: 'High', color: 'text-green-600 bg-green-50' };
    if (score >= 0.5) return { text: 'Medium', color: 'text-yellow-600 bg-yellow-50' };
    return { text: 'Low', color: 'text-gray-600 bg-gray-50' };
  };

  // Render loading state
  const renderLoading = () => (
    <div className="flex items-center justify-center p-4">
      <ArrowPathIcon className="h-5 w-5 animate-spin text-gray-400" />
      <span className="ml-2 text-sm text-gray-500">Loading suggestions...</span>
    </div>
  );

  // Render individual suggestion
  const renderSuggestion = (suggestion: SearchSuggestion, index: number) => {
    const confidence = getConfidenceIndicator(suggestion.score);
    
    return (
      <button
        key={`${suggestion.type}-${index}`}
        onClick={() => onSelect(suggestion)}
        className="w-full text-left px-4 py-3 hover:bg-gray-50 focus:bg-gray-50 focus:outline-none transition-colors group"
      >
        <div className="flex items-center space-x-3">
          <div className="flex-shrink-0">
            {getSuggestionIcon(suggestion.type)}
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-900 truncate">
                {highlightMatch(suggestion.text, query)}
              </span>
              
              {suggestion.score > 0 && (
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${confidence.color}`}>
                  {confidence.text}
                </span>
              )}
            </div>
            
            {/* Metadata */}
            {suggestion.metadata && Object.keys(suggestion.metadata).length > 0 && (
              <div className="mt-1 flex items-center space-x-3 text-xs text-gray-500">
                {suggestion.metadata.category && (
                  <span>{suggestion.metadata.category}</span>
                )}
                {suggestion.metadata.usage && (
                  <span>{suggestion.metadata.usage} uses</span>
                )}
                {suggestion.metadata.activity && (
                  <span>{suggestion.metadata.activity} activity</span>
                )}
                {suggestion.metadata.count && (
                  <span>{suggestion.metadata.count} items</span>
                )}
              </div>
            )}
          </div>
          
          {/* Action hint */}
          <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
            <span className="text-xs text-gray-400">Enter</span>
          </div>
        </div>
      </button>
    );
  };

  // Render suggestion group
  const renderSuggestionGroup = (type: string, suggestions: SearchSuggestion[]) => (
    <div key={type} className="border-b border-gray-100 last:border-b-0">
      <div className="px-4 py-2 bg-gray-50 border-b border-gray-100">
        <div className="flex items-center space-x-2">
          {getSuggestionIcon(type)}
          <span className="text-xs font-medium text-gray-700 uppercase tracking-wide">
            {getSuggestionTypeLabel(type)}
          </span>
          <span className="text-xs text-gray-500">
            ({suggestions.length})
          </span>
        </div>
      </div>
      
      <div>
        {suggestions.map((suggestion, index) => renderSuggestion(suggestion, index))}
      </div>
    </div>
  );

  // Render empty state
  const renderEmptyState = () => (
    <div className="p-4 text-center text-sm text-gray-500">
      <MagnifyingGlassIcon className="h-8 w-8 mx-auto mb-2 text-gray-300" />
      <p>No suggestions available</p>
      <p className="text-xs text-gray-400 mt-1">Try typing a different search term</p>
    </div>
  );

  // Main render
  if (isLoading) {
    return (
      <div className={`bg-white border border-gray-200 rounded-lg shadow-lg ${className}`}>
        {renderLoading()}
      </div>
    );
  }

  if (suggestions.length === 0) {
    return (
      <div className={`bg-white border border-gray-200 rounded-lg shadow-lg ${className}`}>
        {renderEmptyState()}
      </div>
    );
  }

  return (
    <div className={`bg-white border border-gray-200 rounded-lg shadow-lg max-h-96 overflow-y-auto ${className}`}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">Search Suggestions</span>
          <span className="text-xs text-gray-500">
            {suggestions.length} suggestion{suggestions.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Suggestion Groups */}
      <div className="divide-y divide-gray-100">
        {Object.entries(groupedSuggestions).map(([type, typeSuggestions]) =>
          renderSuggestionGroup(type, typeSuggestions)
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-gray-100 bg-gray-50">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>Use arrow keys to navigate</span>
          <div className="flex items-center space-x-2">
            <kbd className="px-2 py-1 text-xs font-semibold text-gray-800 bg-gray-100 border border-gray-200 rounded">
              ↵
            </kbd>
            <span>to select</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SearchSuggestions;