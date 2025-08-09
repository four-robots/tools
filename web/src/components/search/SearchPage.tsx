/**
 * Main Search Page Component
 * 
 * Integrates all search components into a unified search experience
 */

'use client';

import React, { useEffect } from 'react';
import { Search as SearchIcon, Filter, Grid, List, Share2 } from 'lucide-react';
import { useSearch } from './hooks';
import { useSearchParams, ParsedSearchParams } from '@/hooks/useSearchParams';
import { 
  SearchInput,
  SearchFilters, 
  SearchResults,
  SearchPagination,
  SearchSuggestions,
  SearchAnalytics,
  SearchLoading,
  SearchEmpty,
  SearchError
} from './index';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';

interface SearchPageProps {
  initialParams?: ParsedSearchParams;
  className?: string;
}

export function SearchPage({ initialParams, className = '' }: SearchPageProps) {
  const { toast } = useToast();
  
  // URL parameter management
  const {
    searchParams,
    updateQuery,
    updateFilters,
    updateSort,
    updatePagination,
    updateView,
    shareableUrl
  } = useSearchParams(initialParams);
  
  // Main search hook
  const search = useSearch({
    initialQuery: searchParams.query,
    initialFilters: searchParams.filters,
    autoSearch: true,
    enableAnalytics: true,
    enableCache: true
  });
  
  // Sync URL parameters with search state
  useEffect(() => {
    if (searchParams.query !== search.query) {
      search.setQuery(searchParams.query);
    }
  }, [searchParams.query, search]);
  
  useEffect(() => {
    const filtersChanged = JSON.stringify(searchParams.filters) !== JSON.stringify(search.filters);
    if (filtersChanged) {
      search.setFilters(searchParams.filters);
    }
  }, [searchParams.filters, search]);
  
  // Handle pagination changes
  function handlePageChange(page: number) {
    updatePagination(page);
    search.goToPage(page);
  }
  
  function handlePageSizeChange(pageSize: number) {
    updatePagination(1, pageSize);
    search.changePageSize(pageSize);
  }
  
  // Handle sort changes
  function handleSortChange(sort: any) {
    updateSort(sort);
    search.changeSort(sort);
  }
  
  // Handle query changes
  function handleQueryChange(query: string) {
    updateQuery(query);
    // search.setQuery is called automatically via URL sync effect
  }
  
  // Handle filter changes
  function handleFiltersChange(filters: any) {
    updateFilters(filters);
    // search.setFilters is called automatically via URL sync effect
  }
  
  // Handle share functionality
  function handleShare() {
    if (navigator.share) {
      navigator.share({
        title: 'MCP Tools Search',
        text: search.query ? `Search results for "${search.query}"` : 'Search MCP Tools',
        url: shareableUrl
      }).catch(() => {
        // Fall back to clipboard
        copyToClipboard();
      });
    } else {
      copyToClipboard();
    }
  }
  
  function copyToClipboard() {
    navigator.clipboard.writeText(shareableUrl).then(() => {
      toast({
        title: 'Link copied!',
        description: 'Search URL copied to clipboard',
      });
    }).catch(() => {
      toast({
        title: 'Copy failed',
        description: 'Unable to copy link to clipboard',
        variant: 'destructive',
      });
    });
  }
  
  // Determine current view mode
  const viewMode = searchParams.view || 'list';
  const hasQuery = searchParams.query.trim().length > 0;
  const hasActiveFilters = Object.values(searchParams.filters).some(value => 
    Array.isArray(value) ? value.length > 0 : value !== undefined && value !== null
  );
  
  return (
    <div className={`min-h-screen bg-gray-50 ${className}`}>
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-4">
            {/* Search Input */}
            <div className="flex items-center space-x-4">
              <div className="flex-1">
                <SearchInput
                  value={search.query}
                  onChange={handleQueryChange}
                  onSubmit={() => search.performSearch()}
                  placeholder="Search across all content..."
                  autoFocus={!hasQuery}
                  size="lg"
                />
              </div>
              
              <Button
                variant="outline"
                onClick={handleShare}
                className="hidden sm:flex"
              >
                <Share2 className="w-4 h-4 mr-2" />
                Share
              </Button>
            </div>
            
            {/* Search Suggestions */}
            {search.query && !search.isLoading && (
              <div className="mt-3">
                <SearchSuggestions
                  query={search.query}
                  onSuggestionClick={handleQueryChange}
                />
              </div>
            )}
            
            {/* Active Search Summary */}
            {(hasQuery || hasActiveFilters) && (
              <div className="mt-4 flex items-center justify-between">
                <div className="flex items-center space-x-4 text-sm text-gray-600">
                  {hasQuery && (
                    <span>
                      Searching for: <strong>"{search.query}"</strong>
                    </span>
                  )}
                  
                  {search.totalCount !== undefined && (
                    <span>
                      {search.totalCount.toLocaleString()} results
                    </span>
                  )}
                  
                  {search.lastSearchTime && (
                    <span>
                      ({search.lastSearchTime.toFixed(0)}ms)
                    </span>
                  )}
                </div>
                
                <div className="flex items-center space-x-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => updateView(viewMode === 'grid' ? 'list' : 'grid')}
                    className="hidden sm:flex"
                  >
                    {viewMode === 'grid' ? (
                      <List className="w-4 h-4" />
                    ) : (
                      <Grid className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Sidebar - Filters */}
          <div className="lg:col-span-1">
            <div className="sticky top-32">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center text-sm">
                    <Filter className="w-4 h-4 mr-2" />
                    Filters
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <SearchFilters
                    filters={search.filters}
                    onChange={handleFiltersChange}
                    aggregations={search.aggregations}
                    showCounts={true}
                  />
                </CardContent>
              </Card>
              
              {/* Search Analytics - Only show if there are results */}
              {search.searchCount > 0 && (
                <Card className="mt-4">
                  <CardHeader>
                    <CardTitle className="text-sm">Search Analytics</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <SearchAnalytics
                      searchCount={search.searchCount}
                      averageTime={search.lastSearchTime || 0}
                      totalResults={search.totalCount || 0}
                    />
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
          
          {/* Main Content Area */}
          <div className="lg:col-span-3">
            {/* Loading State */}
            {search.isLoading && (
              <SearchLoading message="Searching across all content..." />
            )}
            
            {/* Error State */}
            {search.error && (
              <SearchError
                message={search.error}
                onRetry={search.retrySearch}
                onClear={search.clearResults}
              />
            )}
            
            {/* Empty State */}
            {!search.isLoading && !search.error && search.results.length === 0 && hasQuery && (
              <SearchEmpty
                query={search.query}
                hasFilters={hasActiveFilters}
                onClearFilters={() => handleFiltersChange({})}
                onNewSearch={handleQueryChange}
              />
            )}
            
            {/* No Query State */}
            {!search.isLoading && !search.error && !hasQuery && !hasActiveFilters && (
              <div className="text-center py-12">
                <SearchIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <h2 className="text-xl font-semibold text-gray-900 mb-2">
                  Search everything
                </h2>
                <p className="text-gray-600 mb-6">
                  Search across kanban cards, wiki pages, memory thoughts, and web content
                </p>
                <div className="flex flex-wrap justify-center gap-2 text-sm text-gray-500">
                  <Badge variant="outline">Type: wiki</Badge>
                  <Badge variant="outline">Type: kanban</Badge>
                  <Badge variant="outline">Type: memory</Badge>
                  <Badge variant="outline">Quality: high</Badge>
                  <Badge variant="outline">Recent</Badge>
                </div>
              </div>
            )}
            
            {/* Search Results */}
            {!search.isLoading && !search.error && search.results.length > 0 && (
              <>
                <SearchResults
                  results={search.results}
                  totalCount={search.totalCount || 0}
                  query={search.query}
                  viewMode={viewMode}
                  onResultClick={(result) => {
                    // Handle result click - could navigate to detail view
                    console.log('Result clicked:', result);
                  }}
                />
                
                {/* Pagination */}
                {search.pagination.totalPages > 1 && (
                  <div className="mt-8">
                    <Separator className="mb-6" />
                    <SearchPagination
                      currentPage={search.pagination.currentPage}
                      totalPages={search.pagination.totalPages}
                      totalItems={search.pagination.totalItems}
                      itemsPerPage={search.pagination.itemsPerPage}
                      onPageChange={handlePageChange}
                      onPageSizeChange={handlePageSizeChange}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}