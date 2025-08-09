/**
 * Integration Tests for Search Components
 * 
 * Tests to verify all search components work together properly
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { 
  SearchInput,
  SearchSuggestions,
  SearchFilters,
  SearchResults,
  SearchResultCard,
  SearchPagination,
  SearchAnalytics,
  SearchLoading,
  SearchEmpty,
  SearchError
} from '../index';
import { SearchResult, SearchFilters as SearchFiltersType } from '@mcp-tools/core';

// Mock data for testing
const mockSearchResult: SearchResult = {
  id: 'test-1',
  title: 'Test Result',
  type: 'wiki_page',
  score: {
    relevance: 0.95,
    quality_score: 0.85
  },
  metadata: {
    created_at: '2024-01-01T00:00:00Z',
    tags: ['test', 'example']
  },
  preview: {
    text: 'This is a test result for integration testing.',
    highlights: []
  }
};

const mockPagination = {
  currentPage: 1,
  totalPages: 5,
  totalItems: 100,
  itemsPerPage: 20,
  hasNext: true,
  hasPrev: false
};

const mockFilters: SearchFiltersType = {
  types: ['wiki_page'],
  tags: ['test']
};

describe('Search Components Integration', () => {
  
  describe('Component Rendering', () => {
    it('should render SearchInput without errors', () => {
      render(
        <SearchInput
          value=""
          onChange={() => {}}
          onSubmit={() => {}}
        />
      );
      expect(screen.getByRole('searchbox')).toBeInTheDocument();
    });

    it('should render SearchResults without errors', () => {
      render(
        <SearchResults
          results={[mockSearchResult]}
          totalCount={1}
          isLoading={false}
          pagination={mockPagination}
          onPageChange={() => {}}
          onSortChange={() => {}}
          onResultClick={() => {}}
        />
      );
      expect(screen.getByRole('region', { name: /search results/i })).toBeInTheDocument();
    });

    it('should render SearchResultCard without errors', () => {
      render(
        <SearchResultCard
          result={mockSearchResult}
          onClick={() => {}}
        />
      );
      expect(screen.getByRole('article')).toBeInTheDocument();
      expect(screen.getByText('Test Result')).toBeInTheDocument();
    });

    it('should render SearchPagination without errors', () => {
      render(
        <SearchPagination
          currentPage={1}
          totalPages={5}
          totalItems={100}
          itemsPerPage={20}
          onPageChange={() => {}}
          onPageSizeChange={() => {}}
          hasNext={true}
          hasPrev={false}
        />
      );
      expect(screen.getByRole('navigation', { name: /pagination/i })).toBeInTheDocument();
    });
  });

  describe('Loading States', () => {
    it('should render SearchLoading for different variants', () => {
      const { rerender } = render(<SearchLoading variant="input" />);
      // Check for skeleton input elements
      expect(document.querySelector('.skeleton')).toBeInTheDocument();

      rerender(<SearchLoading variant="results" />);
      // Check for skeleton results grid
      expect(document.querySelector('.skeleton')).toBeInTheDocument();

      rerender(<SearchLoading showSpinner={true} />);
      // Check for spinner
      expect(document.querySelector('.spinner')).toBeInTheDocument();
    });
  });

  describe('Empty States', () => {
    it('should render SearchEmpty for different variants', () => {
      const { rerender } = render(<SearchEmpty variant="no-results" />);
      expect(screen.getByText(/no results found/i)).toBeInTheDocument();

      rerender(<SearchEmpty variant="no-query" />);
      expect(screen.getByText(/start your search/i)).toBeInTheDocument();
    });
  });

  describe('Error States', () => {
    it('should render SearchError with retry functionality', () => {
      const mockRetry = jest.fn();
      
      render(
        <SearchError
          error="Network error"
          onRetry={mockRetry}
          showRetry={true}
        />
      );
      
      expect(screen.getByText(/connection error/i)).toBeInTheDocument();
      
      const retryButton = screen.getByRole('button', { name: /try again/i });
      fireEvent.click(retryButton);
      expect(mockRetry).toHaveBeenCalled();
    });
  });

  describe('Component Interactions', () => {
    it('should handle search input and suggestions', async () => {
      const mockOnChange = jest.fn();
      const mockOnSuggestionSelect = jest.fn();

      render(
        <>
          <SearchInput
            value="test"
            onChange={mockOnChange}
            onSubmit={() => {}}
            suggestions={[{
              id: '1',
              query: 'test suggestion',
              type: 'completion',
              confidence: 0.9
            }]}
            onSuggestionSelect={mockOnSuggestionSelect}
            showSuggestions={true}
          />
        </>
      );

      const input = screen.getByRole('searchbox');
      fireEvent.change(input, { target: { value: 'new search' } });
      expect(mockOnChange).toHaveBeenCalledWith('new search');
    });

    it('should handle result card clicks', () => {
      const mockOnClick = jest.fn();

      render(
        <SearchResultCard
          result={mockSearchResult}
          onClick={mockOnClick}
        />
      );

      const card = screen.getByRole('article');
      fireEvent.click(card);
      expect(mockOnClick).toHaveBeenCalledWith(mockSearchResult);
    });

    it('should handle pagination changes', () => {
      const mockOnPageChange = jest.fn();
      const mockOnPageSizeChange = jest.fn();

      render(
        <SearchPagination
          currentPage={1}
          totalPages={5}
          totalItems={100}
          itemsPerPage={20}
          onPageChange={mockOnPageChange}
          onPageSizeChange={mockOnPageSizeChange}
          hasNext={true}
          hasPrev={false}
          showPageSizeSelector={true}
        />
      );

      // Test page change
      const nextButton = screen.getByLabelText(/go to next page/i);
      fireEvent.click(nextButton);
      expect(mockOnPageChange).toHaveBeenCalledWith(2);

      // Test page size change
      const pageSize = screen.getByLabelText(/show:/i);
      fireEvent.change(pageSize, { target: { value: '50' } });
      expect(mockOnPageSizeChange).toHaveBeenCalledWith(50);
    });
  });

  describe('Component Integration', () => {
    it('should integrate SearchResults with SearchPagination', () => {
      const mockOnPageChange = jest.fn();

      render(
        <SearchResults
          results={[mockSearchResult]}
          totalCount={100}
          isLoading={false}
          pagination={{
            currentPage: 1,
            totalPages: 5,
            totalItems: 100,
            itemsPerPage: 20,
            hasNext: true,
            hasPrev: false
          }}
          onPageChange={mockOnPageChange}
          onSortChange={() => {}}
          onResultClick={() => {}}
        />
      );

      // Verify pagination is rendered within results
      expect(screen.getByRole('navigation', { name: /pagination/i })).toBeInTheDocument();
      expect(screen.getByText(/100 results/i)).toBeInTheDocument();
    });

    it('should show loading state in SearchResults', () => {
      render(
        <SearchResults
          results={[]}
          totalCount={0}
          isLoading={true}
          pagination={mockPagination}
          onPageChange={() => {}}
          onSortChange={() => {}}
          onResultClick={() => {}}
        />
      );

      // Should show loading component
      expect(document.querySelector('.skeleton')).toBeInTheDocument();
    });

    it('should show empty state in SearchResults', () => {
      render(
        <SearchResults
          results={[]}
          totalCount={0}
          isLoading={false}
          pagination={mockPagination}
          onPageChange={() => {}}
          onSortChange={() => {}}
          onResultClick={() => {}}
        />
      );

      // Should show empty component
      expect(screen.getByText(/no results found/i)).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA attributes', () => {
      render(
        <>
          <SearchInput
            value=""
            onChange={() => {}}
            onSubmit={() => {}}
            placeholder="Search everything..."
          />
          <SearchResults
            results={[mockSearchResult]}
            totalCount={1}
            isLoading={false}
            pagination={mockPagination}
            onPageChange={() => {}}
            onSortChange={() => {}}
            onResultClick={() => {}}
          />
        </>
      );

      // Check ARIA attributes
      expect(screen.getByRole('searchbox')).toHaveAttribute('placeholder', 'Search everything...');
      expect(screen.getByRole('region', { name: /search results/i })).toBeInTheDocument();
      expect(screen.getByRole('article')).toHaveAttribute('aria-selected');
    });
  });
});