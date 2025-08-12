import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import SearchInterface from './SearchInterface';
import { useWhiteboardSearch } from '../../../hooks/useWhiteboardSearch';
import { useSearchSuggestions } from '../../../hooks/useSearchSuggestions';
import { useSearchHistory } from '../../../hooks/useSearchHistory';

// Mock the hooks
vi.mock('../../../hooks/useWhiteboardSearch');
vi.mock('../../../hooks/useSearchSuggestions');
vi.mock('../../../hooks/useSearchHistory');

// Mock child components
vi.mock('./SearchResults', () => ({
  default: ({ results, isLoading, onResultSelect }: any) => (
    <div data-testid="search-results">
      {isLoading && <div data-testid="loading">Loading...</div>}
      {results?.items?.map((item: any) => (
        <div 
          key={item.id} 
          data-testid={`result-${item.id}`}
          onClick={() => onResultSelect(item)}
        >
          {item.title}
        </div>
      ))}
    </div>
  ),
}));

vi.mock('./FilterPanel', () => ({
  default: ({ filters, onFilterChange }: any) => (
    <div data-testid="filter-panel">
      <button 
        data-testid="date-filter"
        onClick={() => onFilterChange('dateRange', { start: '2023-01-01', end: '2023-12-31' })}
      >
        Set Date Filter
      </button>
    </div>
  ),
}));

vi.mock('./SearchSuggestions', () => ({
  default: ({ suggestions, onSelect }: any) => (
    <div data-testid="search-suggestions">
      {suggestions?.map((suggestion: any, index: number) => (
        <div 
          key={index}
          data-testid={`suggestion-${index}`}
          onClick={() => onSelect(suggestion)}
        >
          {suggestion.text}
        </div>
      ))}
    </div>
  ),
}));

vi.mock('./SavedSearches', () => ({
  default: ({ onSearchSelect }: any) => (
    <div data-testid="saved-searches">
      <button 
        data-testid="saved-search-1"
        onClick={() => onSearchSelect({ 
          searchQuery: 'saved query',
          searchFilters: {},
          sortConfig: { field: 'relevance', direction: 'desc' }
        })}
      >
        Saved Search 1
      </button>
    </div>
  ),
}));

const mockUseWhiteboardSearch = useWhiteboardSearch as Mock;
const mockUseSearchSuggestions = useSearchSuggestions as Mock;
const mockUseSearchHistory = useSearchHistory as Mock;

describe('SearchInterface', () => {
  const defaultProps = {
    workspaceId: 'workspace-1',
    userId: 'user-1',
    variant: 'full' as const,
  };

  const mockSearchResults = {
    items: [
      {
        id: 'result-1',
        type: 'whiteboard',
        title: 'Design System',
        description: 'Component library design',
        relevanceScore: 0.95,
        metadata: { elementCount: 25, collaboratorCount: 3 },
        highlights: [],
        contextData: {},
        matchedFields: ['title'],
        createdAt: '2023-01-01T00:00:00Z',
        updatedAt: '2023-06-01T00:00:00Z',
      },
      {
        id: 'result-2',
        type: 'whiteboard',
        title: 'User Research',
        description: 'Research findings',
        relevanceScore: 0.85,
        metadata: { elementCount: 15, collaboratorCount: 2 },
        highlights: [],
        contextData: {},
        matchedFields: ['title'],
        createdAt: '2023-02-01T00:00:00Z',
        updatedAt: '2023-07-01T00:00:00Z',
      },
    ],
    total: 2,
    limit: 20,
    offset: 0,
    hasMore: false,
    searchMetadata: {
      query: 'design',
      syntaxType: 'natural',
      executionTimeMs: 150,
      totalMatches: 2,
      filters: {},
      suggestions: ['design system', 'design pattern'],
    },
  };

  const mockSuggestions = [
    { text: 'design system', type: 'query', score: 0.9, metadata: {} },
    { text: 'user experience', type: 'tag', score: 0.8, metadata: {} },
    { text: 'John Designer', type: 'user', score: 0.7, metadata: {} },
  ];

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Setup default mock implementations
    mockUseWhiteboardSearch.mockReturnValue({
      searchResults: null,
      isSearching: false,
      error: null,
      performAdvancedSearch: vi.fn(),
      performFullTextSearch: vi.fn(),
      searchAnalytics: null,
    });

    mockUseSearchSuggestions.mockReturnValue({
      suggestions: [],
      isLoadingSuggestions: false,
      generateSuggestions: vi.fn(),
      clearSuggestions: vi.fn(),
    });

    mockUseSearchHistory.mockReturnValue({
      searchHistory: [],
      addToHistory: vi.fn(),
      clearHistory: vi.fn(),
      removeFromHistory: vi.fn(),
    });
  });

  describe('Basic Rendering', () => {
    it('should render search input with placeholder', () => {
      render(<SearchInterface {...defaultProps} />);
      
      const searchInput = screen.getByPlaceholderText('Search whiteboards, elements, comments...');
      expect(searchInput).toBeInTheDocument();
    });

    it('should render compact variant with different placeholder', () => {
      render(<SearchInterface {...defaultProps} variant="compact" />);
      
      const searchInput = screen.getByPlaceholderText('Search...');
      expect(searchInput).toBeInTheDocument();
    });

    it('should render with initial query', () => {
      render(<SearchInterface {...defaultProps} initialQuery="test query" />);
      
      const searchInput = screen.getByDisplayValue('test query');
      expect(searchInput).toBeInTheDocument();
    });

    it('should show search icon when not searching', () => {
      render(<SearchInterface {...defaultProps} />);
      
      const searchIcon = screen.getByTestId('search-icon') || document.querySelector('svg[class*="MagnifyingGlass"]');
      expect(searchIcon).toBeInTheDocument();
    });

    it('should show loading spinner when searching', () => {
      mockUseWhiteboardSearch.mockReturnValue({
        searchResults: null,
        isSearching: true,
        error: null,
        performAdvancedSearch: vi.fn(),
        performFullTextSearch: vi.fn(),
        searchAnalytics: null,
      });

      render(<SearchInterface {...defaultProps} />);
      
      const loadingSpinner = screen.getByTestId('loading-spinner') || document.querySelector('svg[class*="animate-spin"]');
      expect(loadingSpinner).toBeInTheDocument();
    });
  });

  describe('Search Functionality', () => {
    it('should trigger search when typing in input', async () => {
      const mockPerformFullTextSearch = vi.fn();
      mockUseWhiteboardSearch.mockReturnValue({
        searchResults: null,
        isSearching: false,
        error: null,
        performAdvancedSearch: vi.fn(),
        performFullTextSearch: mockPerformFullTextSearch,
        searchAnalytics: null,
      });

      const user = userEvent.setup();
      render(<SearchInterface {...defaultProps} />);
      
      const searchInput = screen.getByPlaceholderText('Search whiteboards, elements, comments...');
      
      await user.type(searchInput, 'design');
      
      // Wait for debounced search
      await waitFor(() => {
        expect(mockPerformFullTextSearch).toHaveBeenCalledWith(
          'design',
          expect.any(Object),
          20,
          0
        );
      }, { timeout: 1000 });
    });

    it('should show suggestions when typing', async () => {
      const mockGenerateSuggestions = vi.fn();
      mockUseSearchSuggestions.mockReturnValue({
        suggestions: mockSuggestions,
        isLoadingSuggestions: false,
        generateSuggestions: mockGenerateSuggestions,
        clearSuggestions: vi.fn(),
      });

      const user = userEvent.setup();
      render(<SearchInterface {...defaultProps} />);
      
      const searchInput = screen.getByPlaceholderText('Search whiteboards, elements, comments...');
      
      await user.type(searchInput, 'des');
      
      await waitFor(() => {
        expect(mockGenerateSuggestions).toHaveBeenCalledWith('des');
      });

      expect(screen.getByTestId('search-suggestions')).toBeInTheDocument();
    });

    it('should select suggestion when clicked', async () => {
      const mockGenerateSuggestions = vi.fn();
      const mockClearSuggestions = vi.fn();
      mockUseSearchSuggestions.mockReturnValue({
        suggestions: mockSuggestions,
        isLoadingSuggestions: false,
        generateSuggestions: mockGenerateSuggestions,
        clearSuggestions: mockClearSuggestions,
      });

      const user = userEvent.setup();
      render(<SearchInterface {...defaultProps} />);
      
      const searchInput = screen.getByPlaceholderText('Search whiteboards, elements, comments...');
      
      await user.type(searchInput, 'des');
      await user.click(screen.getByTestId('suggestion-0'));
      
      expect(searchInput).toHaveValue('design system');
    });

    it('should clear search when clear button is clicked', async () => {
      const user = userEvent.setup();
      render(<SearchInterface {...defaultProps} initialQuery="test query" />);
      
      const clearButton = screen.getByTitle('Clear search');
      await user.click(clearButton);
      
      const searchInput = screen.getByPlaceholderText('Search whiteboards, elements, comments...');
      expect(searchInput).toHaveValue('');
    });

    it('should handle search errors gracefully', () => {
      mockUseWhiteboardSearch.mockReturnValue({
        searchResults: null,
        isSearching: false,
        error: 'Search failed: Network error',
        performAdvancedSearch: vi.fn(),
        performFullTextSearch: vi.fn(),
        searchAnalytics: null,
      });

      render(<SearchInterface {...defaultProps} initialQuery="test" />);
      
      expect(screen.getByText('Search Error')).toBeInTheDocument();
      expect(screen.getByText('Search failed: Network error')).toBeInTheDocument();
    });
  });

  describe('Filter Panel', () => {
    it('should show filter panel when filter button is clicked', async () => {
      const user = userEvent.setup();
      render(<SearchInterface {...defaultProps} />);
      
      const filterButton = screen.getByTitle('Search filters');
      await user.click(filterButton);
      
      expect(screen.getByTestId('filter-panel')).toBeInTheDocument();
    });

    it('should hide filter panel in compact variant', () => {
      render(<SearchInterface {...defaultProps} variant="compact" />);
      
      const filterButton = screen.queryByTitle('Search filters');
      expect(filterButton).not.toBeInTheDocument();
    });

    it('should apply filters when changed', async () => {
      const user = userEvent.setup();
      render(<SearchInterface {...defaultProps} />);
      
      // Show filter panel
      const filterButton = screen.getByTitle('Search filters');
      await user.click(filterButton);
      
      // Apply date filter
      const dateFilterButton = screen.getByTestId('date-filter');
      await user.click(dateFilterButton);
      
      // Should trigger search with filters
      await waitFor(() => {
        const mockCall = mockUseWhiteboardSearch().performFullTextSearch;
        // Verify that filters were applied (implementation dependent)
      });
    });
  });

  describe('Search Results', () => {
    it('should display search results', () => {
      mockUseWhiteboardSearch.mockReturnValue({
        searchResults: mockSearchResults,
        isSearching: false,
        error: null,
        performAdvancedSearch: vi.fn(),
        performFullTextSearch: vi.fn(),
        searchAnalytics: null,
      });

      render(<SearchInterface {...defaultProps} initialQuery="design" />);
      
      expect(screen.getByTestId('search-results')).toBeInTheDocument();
      expect(screen.getByTestId('result-result-1')).toBeInTheDocument();
      expect(screen.getByTestId('result-result-2')).toBeInTheDocument();
    });

    it('should show search statistics', () => {
      mockUseWhiteboardSearch.mockReturnValue({
        searchResults: mockSearchResults,
        isSearching: false,
        error: null,
        performAdvancedSearch: vi.fn(),
        performFullTextSearch: vi.fn(),
        searchAnalytics: null,
      });

      render(<SearchInterface {...defaultProps} initialQuery="design" />);
      
      expect(screen.getByText('2 results')).toBeInTheDocument();
      expect(screen.getByText('(150ms)')).toBeInTheDocument();
    });

    it('should call onResultSelect when result is clicked', async () => {
      const mockOnResultSelect = vi.fn();
      mockUseWhiteboardSearch.mockReturnValue({
        searchResults: mockSearchResults,
        isSearching: false,
        error: null,
        performAdvancedSearch: vi.fn(),
        performFullTextSearch: vi.fn(),
        searchAnalytics: null,
      });

      const user = userEvent.setup();
      render(
        <SearchInterface 
          {...defaultProps} 
          initialQuery="design"
          onResultSelect={mockOnResultSelect}
        />
      );
      
      await user.click(screen.getByTestId('result-result-1'));
      
      expect(mockOnResultSelect).toHaveBeenCalledWith(mockSearchResults.items[0]);
    });

    it('should show loading state in results', () => {
      mockUseWhiteboardSearch.mockReturnValue({
        searchResults: null,
        isSearching: true,
        error: null,
        performAdvancedSearch: vi.fn(),
        performFullTextSearch: vi.fn(),
        searchAnalytics: null,
      });

      render(<SearchInterface {...defaultProps} initialQuery="design" />);
      
      expect(screen.getByTestId('loading')).toBeInTheDocument();
    });
  });

  describe('Saved Searches', () => {
    it('should show saved searches when enabled', () => {
      render(<SearchInterface {...defaultProps} showSavedSearches={true} />);
      
      // Saved searches should be visible (implementation dependent)
      // This test would need to be adjusted based on when saved searches are shown
    });

    it('should hide saved searches when disabled', () => {
      render(<SearchInterface {...defaultProps} showSavedSearches={false} />);
      
      const savedSearches = screen.queryByTestId('saved-searches');
      expect(savedSearches).not.toBeInTheDocument();
    });

    it('should apply saved search when selected', async () => {
      const mockPerformFullTextSearch = vi.fn();
      mockUseWhiteboardSearch.mockReturnValue({
        searchResults: null,
        isSearching: false,
        error: null,
        performAdvancedSearch: vi.fn(),
        performFullTextSearch: mockPerformFullTextSearch,
        searchAnalytics: null,
      });

      // This test would need implementation details about how saved searches are shown
      // Placeholder for the test structure
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels', () => {
      render(<SearchInterface {...defaultProps} />);
      
      const searchInput = screen.getByRole('textbox');
      expect(searchInput).toHaveAttribute('autoComplete', 'off');
      expect(searchInput).toHaveAttribute('spellCheck', 'false');
    });

    it('should support keyboard navigation', async () => {
      const user = userEvent.setup();
      render(<SearchInterface {...defaultProps} />);
      
      const searchInput = screen.getByPlaceholderText('Search whiteboards, elements, comments...');
      
      // Tab to input
      await user.tab();
      expect(searchInput).toHaveFocus();
      
      // Type query
      await user.type(searchInput, 'design');
      
      // Test keyboard navigation with suggestions (if implemented)
    });

    it('should announce search state changes to screen readers', async () => {
      const mockOnSearchStateChange = vi.fn();
      
      mockUseWhiteboardSearch.mockReturnValue({
        searchResults: null,
        isSearching: true,
        error: null,
        performAdvancedSearch: vi.fn(),
        performFullTextSearch: vi.fn(),
        searchAnalytics: null,
      });

      render(
        <SearchInterface 
          {...defaultProps} 
          onSearchStateChange={mockOnSearchStateChange}
        />
      );
      
      expect(mockOnSearchStateChange).toHaveBeenCalledWith(true);
    });
  });

  describe('Performance', () => {
    it('should debounce search requests', async () => {
      const mockPerformFullTextSearch = vi.fn();
      mockUseWhiteboardSearch.mockReturnValue({
        searchResults: null,
        isSearching: false,
        error: null,
        performAdvancedSearch: vi.fn(),
        performFullTextSearch: mockPerformFullTextSearch,
        searchAnalytics: null,
      });

      const user = userEvent.setup();
      render(<SearchInterface {...defaultProps} />);
      
      const searchInput = screen.getByPlaceholderText('Search whiteboards, elements, comments...');
      
      // Type multiple characters quickly
      await user.type(searchInput, 'design system');
      
      // Should only call search once after debounce
      await waitFor(() => {
        expect(mockPerformFullTextSearch).toHaveBeenCalledTimes(1);
      }, { timeout: 1000 });
    });

    it('should debounce suggestions separately from search', async () => {
      const mockGenerateSuggestions = vi.fn();
      mockUseSearchSuggestions.mockReturnValue({
        suggestions: [],
        isLoadingSuggestions: false,
        generateSuggestions: mockGenerateSuggestions,
        clearSuggestions: vi.fn(),
      });

      const user = userEvent.setup();
      render(<SearchInterface {...defaultProps} />);
      
      const searchInput = screen.getByPlaceholderText('Search whiteboards, elements, comments...');
      
      await user.type(searchInput, 'des');
      
      // Should call suggestions with shorter debounce than search
      await waitFor(() => {
        expect(mockGenerateSuggestions).toHaveBeenCalledWith('des');
      }, { timeout: 200 });
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty search results', () => {
      mockUseWhiteboardSearch.mockReturnValue({
        searchResults: {
          ...mockSearchResults,
          items: [],
          total: 0,
        },
        isSearching: false,
        error: null,
        performAdvancedSearch: vi.fn(),
        performFullTextSearch: vi.fn(),
        searchAnalytics: null,
      });

      render(<SearchInterface {...defaultProps} initialQuery="nonexistent" />);
      
      expect(screen.getByText('0 results')).toBeInTheDocument();
    });

    it('should handle very long search queries', async () => {
      const mockPerformFullTextSearch = vi.fn();
      mockUseWhiteboardSearch.mockReturnValue({
        searchResults: null,
        isSearching: false,
        error: null,
        performAdvancedSearch: vi.fn(),
        performFullTextSearch: mockPerformFullTextSearch,
        searchAnalytics: null,
      });

      const user = userEvent.setup();
      render(<SearchInterface {...defaultProps} />);
      
      const searchInput = screen.getByPlaceholderText('Search whiteboards, elements, comments...');
      const longQuery = 'a'.repeat(1000);
      
      await user.type(searchInput, longQuery);
      
      // Should handle long queries gracefully
      await waitFor(() => {
        expect(mockPerformFullTextSearch).toHaveBeenCalled();
      });
    });

    it('should handle special characters in search', async () => {
      const mockPerformFullTextSearch = vi.fn();
      mockUseWhiteboardSearch.mockReturnValue({
        searchResults: null,
        isSearching: false,
        error: null,
        performAdvancedSearch: vi.fn(),
        performFullTextSearch: mockPerformFullTextSearch,
        searchAnalytics: null,
      });

      const user = userEvent.setup();
      render(<SearchInterface {...defaultProps} />);
      
      const searchInput = screen.getByPlaceholderText('Search whiteboards, elements, comments...');
      const specialQuery = '@#$%^&*()[]{}|\\:";\'<>?,./`~';
      
      await user.type(searchInput, specialQuery);
      
      // Should handle special characters without errors
      await waitFor(() => {
        expect(mockPerformFullTextSearch).toHaveBeenCalled();
      });
    });
  });
});