import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import FilterPanel from '../FilterPanel';
import { SearchSyntaxType } from '@shared/types/whiteboard';

describe('FilterPanel', () => {
  const defaultProps = {
    filters: {},
    onFilterChange: vi.fn(),
    syntaxType: 'natural' as SearchSyntaxType,
    onSyntaxChange: vi.fn(),
    workspaceId: 'workspace-1',
    userId: 'user-1',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render filter panel with header', () => {
      render(<FilterPanel {...defaultProps} />);
      
      expect(screen.getByText('Search Filters')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Search Type/i })).toBeInTheDocument();
    });

    it('should show active filter count when filters are applied', () => {
      const filtersWithData = {
        searchFields: ['title', 'content'],
        dateRange: { field: 'modified', start: '2024-01-01' },
      };

      render(
        <FilterPanel 
          {...defaultProps} 
          filters={filtersWithData}
        />
      );

      expect(screen.getByText(/\d+ active/)).toBeInTheDocument();
    });

    it('should show clear all button when filters are active', () => {
      const filtersWithData = {
        searchFields: ['title'],
      };

      render(
        <FilterPanel 
          {...defaultProps} 
          filters={filtersWithData}
        />
      );

      expect(screen.getByRole('button', { name: /Clear All/i })).toBeInTheDocument();
    });

    it('should not show clear all button when no filters are active', () => {
      render(<FilterPanel {...defaultProps} />);

      expect(screen.queryByRole('button', { name: /Clear All/i })).not.toBeInTheDocument();
    });
  });

  describe('Filter Sections', () => {
    it('should expand and collapse filter sections', () => {
      render(<FilterPanel {...defaultProps} />);

      const searchTypeButton = screen.getByRole('button', { name: /Search Type/i });
      
      // Section should be collapsed initially (except search_fields and date_range)
      expect(screen.queryByText('Natural Language')).not.toBeInTheDocument();

      // Click to expand
      fireEvent.click(searchTypeButton);

      // Section should now be expanded
      expect(screen.getByText('Natural Language')).toBeInTheDocument();
      expect(screen.getByText('Boolean')).toBeInTheDocument();

      // Click to collapse
      fireEvent.click(searchTypeButton);

      // Section should be collapsed again
      expect(screen.queryByText('Natural Language')).not.toBeInTheDocument();
    });

    it('should have search fields section expanded by default', () => {
      render(<FilterPanel {...defaultProps} />);

      expect(screen.getByText('Titles')).toBeInTheDocument();
      expect(screen.getByText('Descriptions')).toBeInTheDocument();
    });

    it('should have date range section expanded by default', () => {
      render(<FilterPanel {...defaultProps} />);

      expect(screen.getByText('Date Created')).toBeInTheDocument();
      expect(screen.getByLabelText(/From/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/To/i)).toBeInTheDocument();
    });
  });

  describe('Search Fields Filter', () => {
    it('should handle search field checkbox changes', () => {
      render(<FilterPanel {...defaultProps} />);

      const titleCheckbox = screen.getByLabelText('Titles');
      fireEvent.click(titleCheckbox);

      expect(defaultProps.onFilterChange).toHaveBeenCalledWith(
        'searchFields',
        ['title']
      );
    });

    it('should show selected search fields as checked', () => {
      const filtersWithSearchFields = {
        searchFields: ['title', 'content'],
      };

      render(
        <FilterPanel 
          {...defaultProps} 
          filters={filtersWithSearchFields}
        />
      );

      const titleCheckbox = screen.getByLabelText('Titles') as HTMLInputElement;
      const contentCheckbox = screen.getByLabelText('Content') as HTMLInputElement;
      const descriptionCheckbox = screen.getByLabelText('Descriptions') as HTMLInputElement;

      expect(titleCheckbox.checked).toBe(true);
      expect(contentCheckbox.checked).toBe(true);
      expect(descriptionCheckbox.checked).toBe(false);
    });

    it('should handle unchecking search fields', () => {
      const filtersWithSearchFields = {
        searchFields: ['title', 'content'],
      };

      render(
        <FilterPanel 
          {...defaultProps} 
          filters={filtersWithSearchFields}
        />
      );

      const titleCheckbox = screen.getByLabelText('Titles');
      fireEvent.click(titleCheckbox);

      expect(defaultProps.onFilterChange).toHaveBeenCalledWith(
        'searchFields',
        ['content']
      );
    });

    it('should clear search fields when all are unchecked', () => {
      const filtersWithOneField = {
        searchFields: ['title'],
      };

      render(
        <FilterPanel 
          {...defaultProps} 
          filters={filtersWithOneField}
        />
      );

      const titleCheckbox = screen.getByLabelText('Titles');
      fireEvent.click(titleCheckbox);

      expect(defaultProps.onFilterChange).toHaveBeenCalledWith(
        'searchFields',
        undefined
      );
    });
  });

  describe('Date Range Filter', () => {
    it('should handle date range field selection changes', () => {
      render(<FilterPanel {...defaultProps} />);

      const dateFieldSelect = screen.getByDisplayValue('Date Modified');
      fireEvent.change(dateFieldSelect, { target: { value: 'created' } });

      expect(defaultProps.onFilterChange).toHaveBeenCalledWith(
        'dateRange',
        { field: 'created' }
      );
    });

    it('should handle start date changes', () => {
      render(<FilterPanel {...defaultProps} />);

      const startDateInput = screen.getByLabelText(/From/i);
      fireEvent.change(startDateInput, { target: { value: '2024-01-01' } });

      expect(defaultProps.onFilterChange).toHaveBeenCalledWith(
        'dateRange',
        { field: 'modified', start: '2024-01-01' }
      );
    });

    it('should handle end date changes', () => {
      render(<FilterPanel {...defaultProps} />);

      const endDateInput = screen.getByLabelText(/To/i);
      fireEvent.change(endDateInput, { target: { value: '2024-12-31' } });

      expect(defaultProps.onFilterChange).toHaveBeenCalledWith(
        'dateRange',
        { field: 'modified', end: '2024-12-31' }
      );
    });

    it('should handle preset date range buttons', () => {
      render(<FilterPanel {...defaultProps} />);

      const todayButton = screen.getByRole('button', { name: /Today/i });
      fireEvent.click(todayButton);

      const today = new Date().toISOString().split('T')[0];
      expect(defaultProps.onFilterChange).toHaveBeenCalledWith(
        'dateRange',
        { field: 'modified', start: today, end: today }
      );
    });

    it('should clear date range when both dates are empty', () => {
      const filtersWithDateRange = {
        dateRange: { field: 'modified', start: '2024-01-01', end: '2024-12-31' },
      };

      render(
        <FilterPanel 
          {...defaultProps} 
          filters={filtersWithDateRange}
        />
      );

      const startDateInput = screen.getByLabelText(/From/i);
      const endDateInput = screen.getByLabelText(/To/i);

      // Clear both dates
      fireEvent.change(startDateInput, { target: { value: '' } });
      fireEvent.change(endDateInput, { target: { value: '' } });

      expect(defaultProps.onFilterChange).toHaveBeenCalledWith(
        'dateRange',
        undefined
      );
    });
  });

  describe('Element Types Filter', () => {
    it('should handle element type changes', async () => {
      render(<FilterPanel {...defaultProps} />);

      // Expand element types section
      const elementTypesButton = screen.getByRole('button', { name: /Element Types/i });
      fireEvent.click(elementTypesButton);

      await waitFor(() => {
        expect(screen.getByText('Rectangles')).toBeInTheDocument();
      });

      const rectangleCheckbox = screen.getByLabelText('Rectangles');
      fireEvent.click(rectangleCheckbox);

      expect(defaultProps.onFilterChange).toHaveBeenCalledWith(
        'elementTypes',
        ['rectangle']
      );
    });
  });

  describe('Visibility Filter', () => {
    it('should handle visibility filter changes', async () => {
      render(<FilterPanel {...defaultProps} />);

      // Expand visibility section
      const visibilityButton = screen.getByRole('button', { name: /Visibility/i });
      fireEvent.click(visibilityButton);

      await waitFor(() => {
        expect(screen.getByText('Workspace')).toBeInTheDocument();
      });

      const workspaceCheckbox = screen.getByLabelText('Workspace');
      fireEvent.click(workspaceCheckbox);

      expect(defaultProps.onFilterChange).toHaveBeenCalledWith(
        'visibility',
        ['workspace']
      );
    });
  });

  describe('Content Filters', () => {
    it('should handle content filter checkboxes', async () => {
      render(<FilterPanel {...defaultProps} />);

      // Expand content section
      const contentButton = screen.getByRole('button', { name: /Content/i });
      fireEvent.click(contentButton);

      await waitFor(() => {
        expect(screen.getByText('Has Elements')).toBeInTheDocument();
      });

      const hasElementsCheckbox = screen.getByLabelText('Has Elements');
      fireEvent.click(hasElementsCheckbox);

      expect(defaultProps.onFilterChange).toHaveBeenCalledWith(
        'hasElements',
        true
      );
    });

    it('should handle unchecking content filters', async () => {
      const filtersWithContent = {
        hasElements: true,
      };

      render(
        <FilterPanel 
          {...defaultProps} 
          filters={filtersWithContent}
        />
      );

      // Expand content section
      const contentButton = screen.getByRole('button', { name: /Content/i });
      fireEvent.click(contentButton);

      await waitFor(() => {
        const hasElementsCheckbox = screen.getByLabelText('Has Elements') as HTMLInputElement;
        expect(hasElementsCheckbox.checked).toBe(true);
      });

      const hasElementsCheckbox = screen.getByLabelText('Has Elements');
      fireEvent.click(hasElementsCheckbox);

      expect(defaultProps.onFilterChange).toHaveBeenCalledWith(
        'hasElements',
        undefined
      );
    });
  });

  describe('Activity Level Filter', () => {
    it('should handle activity level radio button changes', async () => {
      render(<FilterPanel {...defaultProps} />);

      // Expand activity level section
      const activityButton = screen.getByRole('button', { name: /Activity Level/i });
      fireEvent.click(activityButton);

      await waitFor(() => {
        expect(screen.getByText('High Activity')).toBeInTheDocument();
      });

      const highActivityRadio = screen.getByLabelText('High Activity');
      fireEvent.click(highActivityRadio);

      expect(defaultProps.onFilterChange).toHaveBeenCalledWith(
        'activityLevel',
        'high'
      );
    });

    it('should handle selecting "Any" to clear activity level filter', async () => {
      const filtersWithActivity = {
        activityLevel: 'high',
      };

      render(
        <FilterPanel 
          {...defaultProps} 
          filters={filtersWithActivity}
        />
      );

      // Expand activity level section
      const activityButton = screen.getByRole('button', { name: /Activity Level/i });
      fireEvent.click(activityButton);

      await waitFor(() => {
        const anyRadio = screen.getByLabelText('Any');
        fireEvent.click(anyRadio);
      });

      expect(defaultProps.onFilterChange).toHaveBeenCalledWith(
        'activityLevel',
        undefined
      );
    });
  });

  describe('Clear All Functionality', () => {
    it('should clear all filters when clear all button is clicked', () => {
      const complexFilters = {
        searchFields: ['title', 'content'],
        dateRange: { field: 'modified', start: '2024-01-01' },
        elementTypes: ['rectangle', 'text'],
        visibility: ['workspace'],
        hasElements: true,
        activityLevel: 'high',
      };

      render(
        <FilterPanel 
          {...defaultProps} 
          filters={complexFilters}
        />
      );

      const clearAllButton = screen.getByRole('button', { name: /Clear All/i });
      fireEvent.click(clearAllButton);

      // Should call onFilterChange for each filter type with undefined
      expect(defaultProps.onFilterChange).toHaveBeenCalledWith('searchFields', undefined);
      expect(defaultProps.onFilterChange).toHaveBeenCalledWith('dateRange', undefined);
      expect(defaultProps.onFilterChange).toHaveBeenCalledWith('elementTypes', undefined);
      expect(defaultProps.onFilterChange).toHaveBeenCalledWith('visibility', undefined);
      expect(defaultProps.onFilterChange).toHaveBeenCalledWith('hasElements', undefined);
      expect(defaultProps.onFilterChange).toHaveBeenCalledWith('activityLevel', undefined);
    });
  });

  describe('Syntax Type Handling', () => {
    it('should show current syntax type selection', async () => {
      render(
        <FilterPanel 
          {...defaultProps} 
          syntaxType="boolean"
        />
      );

      // Expand search type section
      const searchTypeButton = screen.getByRole('button', { name: /Search Type/i });
      fireEvent.click(searchTypeButton);

      await waitFor(() => {
        const booleanRadio = screen.getByLabelText('Boolean') as HTMLInputElement;
        expect(booleanRadio.checked).toBe(true);
      });
    });

    it('should handle syntax type changes', async () => {
      render(<FilterPanel {...defaultProps} />);

      // Expand search type section
      const searchTypeButton = screen.getByRole('button', { name: /Search Type/i });
      fireEvent.click(searchTypeButton);

      await waitFor(() => {
        const regexRadio = screen.getByLabelText('Regular Expression');
        fireEvent.click(regexRadio);
      });

      expect(defaultProps.onSyntaxChange).toHaveBeenCalledWith('regex');
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA attributes', () => {
      render(<FilterPanel {...defaultProps} />);

      // Check for accessible section buttons
      const searchTypeButton = screen.getByRole('button', { name: /Search Type/i });
      expect(searchTypeButton).toBeInTheDocument();

      // Check for labeled form controls
      const fromDateInput = screen.getByLabelText(/From/i);
      expect(fromDateInput).toBeInTheDocument();
    });

    it('should support keyboard navigation', () => {
      render(<FilterPanel {...defaultProps} />);

      const searchTypeButton = screen.getByRole('button', { name: /Search Type/i });
      
      // Should be focusable
      searchTypeButton.focus();
      expect(searchTypeButton).toHaveFocus();

      // Should respond to Enter key
      fireEvent.keyDown(searchTypeButton, { key: 'Enter' });
      expect(screen.getByText('Natural Language')).toBeInTheDocument();
    });
  });

  describe('Performance', () => {
    it('should not cause unnecessary re-renders', () => {
      const renderCount = vi.fn();
      
      const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
        renderCount();
        return <>{children}</>;
      };

      const { rerender } = render(
        <TestWrapper>
          <FilterPanel {...defaultProps} />
        </TestWrapper>
      );

      expect(renderCount).toHaveBeenCalledTimes(1);

      // Rerender with same props
      rerender(
        <TestWrapper>
          <FilterPanel {...defaultProps} />
        </TestWrapper>
      );

      // Should only render twice (initial + rerender)
      expect(renderCount).toHaveBeenCalledTimes(2);
    });
  });
});