/**
 * Search Components Demo Page
 * 
 * Demonstrates that all search components can be imported and rendered
 */

'use client';

import React, { useState } from 'react';
import {
  SearchInput,
  SearchSuggestions,
  SearchFilters,
  SearchResults,
  SearchPagination,
  SearchAnalytics,
  SearchLoading,
  SearchEmpty,
  SearchError,
  // Types
  SearchSuggestion,
  PaginationData,
  // Constants
  DEFAULT_PAGINATION,
  DEFAULT_SEARCH_FILTERS
} from '@/components/search';
import { SearchResult, SearchFilters as SearchFiltersType } from '@mcp-tools/core';

// Mock data for demonstration
const mockSearchResults: SearchResult[] = [
  {
    id: '1',
    title: 'Getting Started with MCP Tools',
    type: 'wiki_page',
    score: {
      relevance: 0.95,
      quality_score: 0.88
    },
    metadata: {
      created_at: '2024-01-15T10:30:00Z',
      tags: ['tutorial', 'getting-started', 'mcp'],
      created_by: 'system'
    },
    preview: {
      text: 'Learn how to use the MCP Tools platform for managing your projects, wiki pages, kanban boards, and more.',
      highlights: [
        { match: 'MCP Tools', start: 15, end: 24 },
        { match: 'managing', start: 61, end: 69 }
      ]
    },
    relationships: [
      { id: '2', title: 'Project Management Guide', type: 'wiki_page' }
    ]
  },
  {
    id: '2',
    title: 'Project Management Best Practices',
    type: 'kanban_card',
    score: {
      relevance: 0.87,
      quality_score: 0.92
    },
    metadata: {
      created_at: '2024-01-10T14:20:00Z',
      tags: ['project-management', 'best-practices'],
      language: 'markdown'
    },
    preview: {
      text: 'Discover effective strategies for managing projects using kanban boards and collaborative workflows.',
      highlights: [
        { match: 'project', start: 33, end: 40 },
        { match: 'kanban', start: 48, end: 54 }
      ]
    }
  }
];

const mockSuggestions: SearchSuggestion[] = [
  {
    id: '1',
    query: 'project management',
    type: 'popular',
    confidence: 0.9,
    resultCount: 45
  },
  {
    id: '2',
    query: 'getting started',
    type: 'completion',
    confidence: 0.85,
    resultCount: 23
  },
  {
    id: '3',
    query: 'kanban boards',
    type: 'related',
    confidence: 0.8,
    resultCount: 15
  }
];

export default function SearchDemoPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchFilters, setSearchFilters] = useState<SearchFiltersType>(DEFAULT_SEARCH_FILTERS);
  const [currentPage, setCurrentPage] = useState(1);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [demoState, setDemoState] = useState<'normal' | 'loading' | 'empty' | 'error'>('normal');

  const pagination: PaginationData = {
    ...DEFAULT_PAGINATION,
    currentPage,
    totalPages: 5,
    totalItems: 98,
    itemsPerPage: 20,
    hasNext: currentPage < 5,
    hasPrev: currentPage > 1
  };

  const handleSearch = (query: string) => {
    console.log('Search submitted:', query);
    setSearchQuery(query);
    setShowSuggestions(false);
  };

  const handleSuggestionSelect = (suggestion: SearchSuggestion) => {
    setSearchQuery(suggestion.query);
    setShowSuggestions(false);
    handleSearch(suggestion.query);
  };

  const handleResultClick = (result: SearchResult) => {
    console.log('Result clicked:', result.title);
    // In a real app, this would navigate to the result
  };

  const renderDemoControls = () => (
    <div className="mb-8 p-4 bg-gray-100 rounded-lg">
      <h2 className="text-lg font-semibold mb-4">Demo Controls</h2>
      <div className="flex flex-wrap gap-4">
        <button
          onClick={() => setDemoState('normal')}
          className={`px-3 py-1 rounded ${demoState === 'normal' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
        >
          Normal Results
        </button>
        <button
          onClick={() => setDemoState('loading')}
          className={`px-3 py-1 rounded ${demoState === 'loading' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
        >
          Loading State
        </button>
        <button
          onClick={() => setDemoState('empty')}
          className={`px-3 py-1 rounded ${demoState === 'empty' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
        >
          Empty State
        </button>
        <button
          onClick={() => setDemoState('error')}
          className={`px-3 py-1 rounded ${demoState === 'error' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
        >
          Error State
        </button>
      </div>
    </div>
  );

  const renderSearchInterface = () => (
    <div className="space-y-6">
      {/* Search Input with Suggestions */}
      <div className="relative">
        <SearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          onSubmit={handleSearch}
          placeholder="Search across all your content..."
          suggestions={showSuggestions ? mockSuggestions : undefined}
          onSuggestionSelect={handleSuggestionSelect}
          showSuggestions={showSuggestions}
          autoFocus={false}
        />
        
        {showSuggestions && (
          <SearchSuggestions
            query={searchQuery}
            suggestions={mockSuggestions}
            isVisible={showSuggestions}
            isLoading={false}
            onSuggestionSelect={handleSuggestionSelect}
            onClose={() => setShowSuggestions(false)}
            maxSuggestions={5}
          />
        )}
      </div>

      {/* Filters */}
      <SearchFilters
        filters={searchFilters}
        onChange={setSearchFilters}
        availableTypes={['wiki_page', 'kanban_card', 'memory_thought', 'code_file']}
        showAdvanced={false}
      />
    </div>
  );

  const renderResults = () => {
    switch (demoState) {
      case 'loading':
        return <SearchLoading variant="results" />;
      
      case 'empty':
        return (
          <SearchEmpty 
            variant="no-results" 
            onRetry={() => setDemoState('normal')}
            showSuggestions={true}
          />
        );
      
      case 'error':
        return (
          <SearchError 
            error="Failed to fetch search results" 
            onRetry={() => setDemoState('normal')}
            showRetry={true}
          />
        );
      
      case 'normal':
      default:
        return (
          <SearchResults
            results={mockSearchResults}
            totalCount={pagination.totalItems}
            isLoading={false}
            pagination={pagination}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            onPageChange={setCurrentPage}
            onSortChange={(sort) => console.log('Sort changed:', sort)}
            onResultClick={handleResultClick}
            showViewToggle={true}
            showSortOptions={true}
          />
        );
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">
          Search Components Demo
        </h1>
        <p className="text-gray-600 text-lg">
          This page demonstrates all the search components working together.
          Use the demo controls to see different states.
        </p>
      </div>

      {renderDemoControls()}
      
      <div className="space-y-8">
        {renderSearchInterface()}
        {renderResults()}
      </div>

      {/* Analytics Demo (in a real app, this would be admin-only) */}
      <div className="mt-12 border-t pt-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">
          Search Analytics Demo
        </h2>
        <SearchAnalytics
          showExportOptions={true}
          refreshInterval={300000} // 5 minutes
        />
      </div>
    </div>
  );
}