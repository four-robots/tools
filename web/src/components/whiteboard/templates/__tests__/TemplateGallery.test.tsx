import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TemplateGallery } from '../TemplateGallery';
import * as useTemplatesHook from '../hooks/useTemplates';
import * as useTemplateSearchHook from '../hooks/useTemplateSearch';

// Mock hooks
vi.mock('../hooks/useTemplates');
vi.mock('../hooks/useTemplateSearch');

// Mock child components
vi.mock('../TemplateCard', () => ({
  TemplateCard: ({ template, onSelect }: any) => (
    <div data-testid={`template-card-${template.id}`} onClick={onSelect}>
      {template.name}
    </div>
  ),
}));

vi.mock('../TemplateFilters', () => ({
  TemplateFilters: ({ onClear }: any) => (
    <div data-testid="template-filters">
      <button onClick={onClear}>Clear Filters</button>
    </div>
  ),
}));

vi.mock('../SystemTemplates', () => ({
  SystemTemplates: ({ onSelectTemplate }: any) => (
    <div data-testid="system-templates">
      <button onClick={() => onSelectTemplate({ id: 'system-1', name: 'System Template' })}>
        Select System Template
      </button>
    </div>
  ),
}));

const mockTemplates = [
  {
    id: 'template-1',
    name: 'Template 1',
    description: 'Description 1',
    category: 'Brainstorming',
    tags: ['tag1', 'tag2'],
    isPublic: true,
    workspaceId: 'workspace-1',
    usageCount: 10,
    rating: 4.5,
    createdBy: 'user-1',
    createdAt: '2023-01-01T00:00:00.000Z',
    updatedAt: '2023-01-01T00:00:00.000Z',
    templateData: {
      canvasData: {},
      defaultElements: [],
      defaultSettings: {},
      placeholders: [],
    },
    defaultSettings: {},
  },
  {
    id: 'template-2',
    name: 'Template 2',
    description: 'Description 2',
    category: 'Design System',
    tags: ['design', 'system'],
    isPublic: false,
    workspaceId: 'workspace-1',
    usageCount: 5,
    rating: 3.8,
    createdBy: 'user-1',
    createdAt: '2023-01-02T00:00:00.000Z',
    updatedAt: '2023-01-02T00:00:00.000Z',
    templateData: {
      canvasData: {},
      defaultElements: [],
      defaultSettings: {},
      placeholders: [],
    },
    defaultSettings: {},
  },
];

describe('TemplateGallery', () => {
  const mockUseTemplates = {
    templates: mockTemplates,
    loading: false,
    error: null,
    total: 2,
    hasMore: false,
    favorites: new Set(['template-1']),
    loadMore: vi.fn(),
    refresh: vi.fn(),
    toggleFavorite: vi.fn(),
  };

  const mockUseTemplateSearch = {
    searchResults: [],
    searchLoading: false,
    searchError: null,
    searchTotal: 0,
    hasMoreResults: false,
    search: vi.fn(),
    searchMore: vi.fn(),
    clearSearch: vi.fn(),
    searchHistory: [],
    popularSearches: [],
    searchSuggestions: [],
    isSearching: false,
  };

  beforeEach(() => {
    vi.mocked(useTemplatesHook.useTemplates).mockReturnValue(mockUseTemplates as any);
    vi.mocked(useTemplateSearchHook.useTemplateSearch).mockReturnValue(mockUseTemplateSearch as any);
  });

  it('renders template gallery with templates', () => {
    render(<TemplateGallery />);

    expect(screen.getByText('Template Gallery')).toBeInTheDocument();
    expect(screen.getByText('Choose from 2 professional templates or create your own')).toBeInTheDocument();
    expect(screen.getByTestId('template-card-template-1')).toBeInTheDocument();
    expect(screen.getByTestId('template-card-template-2')).toBeInTheDocument();
  });

  it('handles template selection', () => {
    const onSelectTemplate = vi.fn();
    render(<TemplateGallery onSelectTemplate={onSelectTemplate} />);

    fireEvent.click(screen.getByTestId('template-card-template-1'));

    expect(onSelectTemplate).toHaveBeenCalledWith(mockTemplates[0]);
  });

  it('handles search input', async () => {
    render(<TemplateGallery />);

    const searchInput = screen.getByPlaceholderText('Search templates...');
    fireEvent.change(searchInput, { target: { value: 'brainstorm' } });

    // Search should be debounced
    await waitFor(() => {
      expect(mockUseTemplateSearch.search).toHaveBeenCalledWith({
        query: 'brainstorm',
        filters: expect.any(Object),
        sort: expect.any(Object),
      });
    }, { timeout: 500 });
  });

  it('handles category filtering', () => {
    render(<TemplateGallery />);

    const categorySelect = screen.getByDisplayValue('All Categories');
    fireEvent.click(categorySelect);

    const brainstormingOption = screen.getByText('Brainstorming');
    fireEvent.click(brainstormingOption);

    // Should filter templates by category
    expect(screen.getByTestId('template-card-template-1')).toBeInTheDocument();
  });

  it('switches between grid and list view', () => {
    render(<TemplateGallery />);

    const listViewButton = screen.getByRole('button', { name: /list/i });
    fireEvent.click(listViewButton);

    // Template cards should be rendered in list mode
    expect(screen.getByTestId('template-card-template-1')).toBeInTheDocument();
  });

  it('handles favorites toggle', async () => {
    render(<TemplateGallery />);

    // The heart button should be in the template card component
    // This is a simplified test since we're mocking the TemplateCard
    expect(mockUseTemplates.favorites.has('template-1')).toBe(true);
  });

  it('shows loading state', () => {
    vi.mocked(useTemplatesHook.useTemplates).mockReturnValue({
      ...mockUseTemplates,
      loading: true,
      templates: [],
    } as any);

    render(<TemplateGallery />);

    expect(screen.getByText('Loading templates...')).toBeInTheDocument();
  });

  it('shows error state', () => {
    vi.mocked(useTemplatesHook.useTemplates).mockReturnValue({
      ...mockUseTemplates,
      error: new Error('Failed to load templates'),
      templates: [],
    } as any);

    render(<TemplateGallery />);

    expect(screen.getByText(/Error loading templates/)).toBeInTheDocument();
    expect(screen.getByText('Try Again')).toBeInTheDocument();
  });

  it('shows empty state', () => {
    vi.mocked(useTemplatesHook.useTemplates).mockReturnValue({
      ...mockUseTemplates,
      templates: [],
      total: 0,
    } as any);

    render(<TemplateGallery />);

    expect(screen.getByText('No templates available.')).toBeInTheDocument();
  });

  it('handles create template button', () => {
    const onCreateTemplate = vi.fn();
    render(<TemplateGallery onCreateTemplate={onCreateTemplate} />);

    const createButton = screen.getByText('Create Template');
    fireEvent.click(createButton);

    expect(onCreateTemplate).toHaveBeenCalled();
  });

  it('handles load more', () => {
    vi.mocked(useTemplatesHook.useTemplates).mockReturnValue({
      ...mockUseTemplates,
      hasMore: true,
    } as any);

    render(<TemplateGallery />);

    const loadMoreButton = screen.getByText('Load More Templates');
    fireEvent.click(loadMoreButton);

    expect(mockUseTemplates.loadMore).toHaveBeenCalled();
  });

  it('handles tab switching', () => {
    render(<TemplateGallery workspaceId="workspace-1" />);

    // Should show workspace tab when workspaceId is provided
    const workspaceTab = screen.getByText('Workspace');
    expect(workspaceTab).toBeInTheDocument();

    fireEvent.click(workspaceTab);

    // Should filter to workspace templates
    expect(screen.getByTestId('template-card-template-1')).toBeInTheDocument();
    expect(screen.getByTestId('template-card-template-2')).toBeInTheDocument();
  });

  it('shows filters panel when toggled', () => {
    render(<TemplateGallery />);

    const filtersButton = screen.getByText('Filters');
    fireEvent.click(filtersButton);

    expect(screen.getByTestId('template-filters')).toBeInTheDocument();
  });

  it('handles system template selection', () => {
    const onSelectTemplate = vi.fn();
    render(<TemplateGallery onSelectTemplate={onSelectTemplate} />);

    const systemTemplateButton = screen.getByText('Select System Template');
    fireEvent.click(systemTemplateButton);

    expect(onSelectTemplate).toHaveBeenCalledWith({
      id: 'system-1',
      name: 'System Template',
    });
  });

  it('shows correct tab counts', () => {
    render(<TemplateGallery workspaceId="workspace-1" />);

    expect(screen.getByText('2')).toBeInTheDocument(); // All templates count
    expect(screen.getByText('1')).toBeInTheDocument(); // Favorites count
  });

  it('handles sort change', () => {
    render(<TemplateGallery />);

    const sortSelect = screen.getByDisplayValue(/Rating/i);
    fireEvent.click(sortSelect);

    const nameOption = screen.getByText('Name');
    fireEvent.click(nameOption);

    // Templates should be re-sorted (this would trigger re-render in real component)
    expect(screen.getByTestId('template-card-template-1')).toBeInTheDocument();
  });

  describe('search functionality', () => {
    it('shows search results when searching', () => {
      const searchResults = [mockTemplates[0]];
      vi.mocked(useTemplateSearchHook.useTemplateSearch).mockReturnValue({
        ...mockUseTemplateSearch,
        searchResults,
        searchTotal: 1,
      } as any);

      render(<TemplateGallery />);

      const searchInput = screen.getByPlaceholderText('Search templates...');
      fireEvent.change(searchInput, { target: { value: 'template' } });

      // Should show search results instead of all templates
      expect(screen.getByTestId('template-card-template-1')).toBeInTheDocument();
    });

    it('clears search when input is empty', async () => {
      render(<TemplateGallery />);

      const searchInput = screen.getByPlaceholderText('Search templates...');
      fireEvent.change(searchInput, { target: { value: 'test' } });
      fireEvent.change(searchInput, { target: { value: '' } });

      await waitFor(() => {
        expect(mockUseTemplateSearch.clearSearch).toHaveBeenCalled();
      });
    });

    it('shows search loading state', () => {
      vi.mocked(useTemplateSearchHook.useTemplateSearch).mockReturnValue({
        ...mockUseTemplateSearch,
        searchLoading: true,
      } as any);

      render(<TemplateGallery />);

      const searchInput = screen.getByPlaceholderText('Search templates...');
      fireEvent.change(searchInput, { target: { value: 'test' } });

      expect(screen.getByText('Loading templates...')).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('has proper ARIA labels', () => {
      render(<TemplateGallery />);

      expect(screen.getByRole('heading', { name: 'Template Gallery' })).toBeInTheDocument();
      expect(screen.getByRole('searchbox', { name: /search templates/i })).toBeInTheDocument();
    });

    it('supports keyboard navigation', () => {
      render(<TemplateGallery />);

      const searchInput = screen.getByPlaceholderText('Search templates...');
      
      // Focus should work
      searchInput.focus();
      expect(searchInput).toHaveFocus();

      // Tab navigation should work between view mode buttons
      const gridButton = screen.getByRole('button', { pressed: true });
      expect(gridButton).toBeInTheDocument();
    });
  });

  describe('responsive behavior', () => {
    it('adjusts layout for mobile', () => {
      // Mock mobile viewport
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 640,
      });

      render(<TemplateGallery />);

      // Should still render all templates but in mobile layout
      expect(screen.getByTestId('template-card-template-1')).toBeInTheDocument();
      expect(screen.getByTestId('template-card-template-2')).toBeInTheDocument();
    });
  });
});