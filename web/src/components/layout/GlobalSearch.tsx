/**
 * Global Search Modal Component
 * 
 * Keyboard shortcut-triggered search overlay that works from any page
 */

'use client';

import React, { useEffect, useRef, useState } from 'react';
import { 
  Search, 
  Clock, 
  ArrowUpRight, 
  X, 
  Trash2,
  Loader2,
  FileText,
  Kanban,
  Brain,
  Globe
} from 'lucide-react';
import { useGlobalSearch } from '@/hooks/useGlobalSearch';
import { Dialog, DialogContent, DialogHeader } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatContentType } from '@/components/search/utils';

// Content type icons
const CONTENT_ICONS = {
  kanban_card: Kanban,
  wiki_page: FileText,
  memory_thought: Brain,
  scraped_page: Globe,
} as const;

interface QuickSearchResultProps {
  result: any;
  onSelect: () => void;
  isHighlighted: boolean;
}

function QuickSearchResult({ result, onSelect, isHighlighted }: QuickSearchResultProps) {
  const ContentIcon = CONTENT_ICONS[result.content_type as keyof typeof CONTENT_ICONS] || FileText;
  
  return (
    <div
      className={`flex items-start p-3 rounded-lg cursor-pointer transition-colors ${
        isHighlighted ? 'bg-blue-50 border-blue-200' : 'hover:bg-gray-50'
      }`}
      onClick={onSelect}
    >
      <div className="flex-shrink-0 mt-1">
        <ContentIcon className="w-4 h-4 text-gray-400" />
      </div>
      
      <div className="ml-3 flex-1 min-w-0">
        <div className="flex items-start justify-between">
          <h4 className="text-sm font-medium text-gray-900 truncate">
            {result.title}
          </h4>
          <Badge variant="outline" className="ml-2 flex-shrink-0 text-xs">
            {formatContentType(result.content_type)}
          </Badge>
        </div>
        
        {result.preview && (
          <p className="mt-1 text-xs text-gray-600 line-clamp-2">
            {result.preview}
          </p>
        )}
        
        <div className="mt-2 flex items-center text-xs text-gray-500">
          <span>Score: {(result.relevance_score * 100).toFixed(0)}%</span>
          {result.updated_at && (
            <span className="ml-3">
              Updated {new Date(result.updated_at).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

interface RecentSearchItemProps {
  query: string;
  onSelect: () => void;
  onRemove: () => void;
  isHighlighted: boolean;
}

function RecentSearchItem({ query, onSelect, onRemove, isHighlighted }: RecentSearchItemProps) {
  return (
    <div
      className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors group ${
        isHighlighted ? 'bg-blue-50' : 'hover:bg-gray-50'
      }`}
      onClick={onSelect}
    >
      <div className="flex items-center flex-1">
        <Clock className="w-4 h-4 text-gray-400 mr-3" />
        <span className="text-sm text-gray-700 truncate">{query}</span>
      </div>
      
      <Button
        variant="ghost"
        size="sm"
        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 h-auto"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
      >
        <X className="w-3 h-3" />
      </Button>
    </div>
  );
}

export function GlobalSearch() {
  const {
    isOpen,
    query,
    recentSearches,
    quickResults,
    isSearching,
    openSearch,
    closeSearch,
    setQuery,
    navigateToSearch,
    clearRecentSearches
  } = useGlobalSearch();
  
  const inputRef = useRef<HTMLInputElement>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  
  // Focus input when modal opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);
  
  // Reset highlighted index when results change
  useEffect(() => {
    setHighlightedIndex(-1);
  }, [quickResults, recentSearches, query]);
  
  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;
    
    function handleKeyDown(event: KeyboardEvent) {
      const hasResults = quickResults.length > 0;
      const hasRecents = !query && recentSearches.length > 0;
      const totalItems = hasResults ? quickResults.length : (hasRecents ? recentSearches.length : 0);
      
      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          setHighlightedIndex(prev => prev < totalItems - 1 ? prev + 1 : prev);
          break;
          
        case 'ArrowUp':
          event.preventDefault();
          setHighlightedIndex(prev => prev > 0 ? prev - 1 : -1);
          break;
          
        case 'Enter':
          event.preventDefault();
          
          if (highlightedIndex >= 0) {
            if (hasResults && highlightedIndex < quickResults.length) {
              // Navigate to result details or trigger action
              navigateToSearch(query, true);
            } else if (hasRecents && highlightedIndex < recentSearches.length) {
              // Select recent search
              const selectedQuery = recentSearches[highlightedIndex];
              navigateToSearch(selectedQuery, true);
            }
          } else if (query.trim()) {
            // Search current query
            navigateToSearch(query, true);
          }
          break;
      }
    }
    
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, highlightedIndex, quickResults, recentSearches, query, navigateToSearch]);
  
  // Handle input change
  function handleQueryChange(event: React.ChangeEvent<HTMLInputElement>) {
    const newQuery = event.target.value;
    setQuery(newQuery);
  }
  
  // Handle form submission
  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (query.trim()) {
      navigateToSearch(query, true);
    }
  }
  
  // Handle recent search selection
  function handleRecentSelect(recentQuery: string) {
    navigateToSearch(recentQuery, true);
  }
  
  // Handle recent search removal
  function handleRecentRemove(queryToRemove: string) {
    // This would need to be implemented in useGlobalSearch
    console.log('Remove recent search:', queryToRemove);
  }
  
  const showResults = query.trim() && quickResults.length > 0;
  const showRecents = !query.trim() && recentSearches.length > 0;
  const showEmpty = query.trim() && !isSearching && quickResults.length === 0;
  
  return (
    <Dialog open={isOpen} onOpenChange={closeSearch}>
      <DialogContent className="max-w-2xl p-0 gap-0 bg-white">
        <DialogHeader className="p-4 pb-0">
          <form onSubmit={handleSubmit} className="relative">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                ref={inputRef}
                type="text"
                placeholder="Search across all content..."
                value={query}
                onChange={handleQueryChange}
                className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 placeholder-gray-500"
              />
              {isSearching && (
                <Loader2 className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 animate-spin" />
              )}
            </div>
          </form>
          
          <div className="flex items-center justify-between pt-2 text-xs text-gray-500">
            <div className="flex items-center space-x-4">
              <span>↑↓ to navigate</span>
              <span>↵ to select</span>
              <span>esc to close</span>
            </div>
            <span>⌘K</span>
          </div>
        </DialogHeader>
        
        <div className="max-h-96 overflow-y-auto">
          {/* Quick Search Results */}
          {showResults && (
            <div className="p-4 pt-2">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-gray-900">Search Results</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigateToSearch(query, true)}
                  className="text-xs text-blue-600 hover:text-blue-700"
                >
                  View all results
                  <ArrowUpRight className="w-3 h-3 ml-1" />
                </Button>
              </div>
              
              <div className="space-y-1">
                {quickResults.map((result, index) => (
                  <QuickSearchResult
                    key={`${result.content_type}-${result.id}`}
                    result={result}
                    onSelect={() => navigateToSearch(query, true)}
                    isHighlighted={highlightedIndex === index}
                  />
                ))}
              </div>
            </div>
          )}
          
          {/* Recent Searches */}
          {showRecents && (
            <div className="p-4 pt-2">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-gray-900">Recent Searches</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearRecentSearches}
                  className="text-xs text-gray-500 hover:text-gray-700"
                >
                  <Trash2 className="w-3 h-3 mr-1" />
                  Clear
                </Button>
              </div>
              
              <div className="space-y-1">
                {recentSearches.map((recentQuery, index) => (
                  <RecentSearchItem
                    key={recentQuery}
                    query={recentQuery}
                    onSelect={() => handleRecentSelect(recentQuery)}
                    onRemove={() => handleRecentRemove(recentQuery)}
                    isHighlighted={highlightedIndex === index}
                  />
                ))}
              </div>
            </div>
          )}
          
          {/* Empty State */}
          {showEmpty && (
            <div className="p-8 text-center">
              <Search className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-sm font-medium text-gray-900 mb-2">No results found</h3>
              <p className="text-xs text-gray-500 mb-4">
                Try adjusting your search terms or browse all content
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigateToSearch('', true)}
              >
                Browse all content
              </Button>
            </div>
          )}
          
          {/* Default State */}
          {!query && recentSearches.length === 0 && (
            <div className="p-8 text-center">
              <Search className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-sm font-medium text-gray-900 mb-2">Search everything</h3>
              <p className="text-xs text-gray-500">
                Search across kanban cards, wiki pages, memory thoughts, and web content
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}