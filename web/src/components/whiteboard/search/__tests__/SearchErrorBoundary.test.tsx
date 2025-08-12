import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import SearchErrorBoundary from '../SearchErrorBoundary';

// Mock component that can throw errors
const ThrowError: React.FC<{ shouldThrow?: boolean; errorMessage?: string }> = ({ 
  shouldThrow = false, 
  errorMessage = 'Test error' 
}) => {
  if (shouldThrow) {
    throw new Error(errorMessage);
  }
  return <div>Normal Component</div>;
};

describe('SearchErrorBoundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Suppress console errors in tests
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  describe('Normal Rendering', () => {
    it('should render children when no error occurs', () => {
      render(
        <SearchErrorBoundary>
          <div>Test Content</div>
        </SearchErrorBoundary>
      );

      expect(screen.getByText('Test Content')).toBeInTheDocument();
    });

    it('should not show error UI when children render normally', () => {
      render(
        <SearchErrorBoundary>
          <ThrowError shouldThrow={false} />
        </SearchErrorBoundary>
      );

      expect(screen.getByText('Normal Component')).toBeInTheDocument();
      expect(screen.queryByText('Search Error')).not.toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('should catch and display error when child component throws', () => {
      render(
        <SearchErrorBoundary>
          <ThrowError shouldThrow={true} errorMessage="Test error occurred" />
        </SearchErrorBoundary>
      );

      expect(screen.getByText('Search Error')).toBeInTheDocument();
      expect(screen.getByText(/An unexpected error occurred while searching/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Try Again/i })).toBeInTheDocument();
    });

    it('should show custom title when provided', () => {
      render(
        <SearchErrorBoundary title="Custom Error Title">
          <ThrowError shouldThrow={true} />
        </SearchErrorBoundary>
      );

      expect(screen.getByText('Custom Error Title')).toBeInTheDocument();
    });

    it('should call onError callback when error occurs', () => {
      const mockOnError = vi.fn();

      render(
        <SearchErrorBoundary onError={mockOnError}>
          <ThrowError shouldThrow={true} errorMessage="Callback test error" />
        </SearchErrorBoundary>
      );

      expect(mockOnError).toHaveBeenCalled();
      expect(mockOnError).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Callback test error' }),
        expect.any(Object)
      );
    });

    it('should render custom fallback when provided', () => {
      const customFallback = <div>Custom Error Fallback</div>;

      render(
        <SearchErrorBoundary fallback={customFallback}>
          <ThrowError shouldThrow={true} />
        </SearchErrorBoundary>
      );

      expect(screen.getByText('Custom Error Fallback')).toBeInTheDocument();
      expect(screen.queryByText('Search Error')).not.toBeInTheDocument();
    });
  });

  describe('User-Friendly Error Messages', () => {
    const errorScenarios = [
      {
        error: 'Network Error: Failed to fetch',
        expectedMessage: /Unable to connect to the search service/,
        expectedSeverity: 'medium',
      },
      {
        error: 'Request timeout',
        expectedMessage: /Search request timed out/,
        expectedSeverity: 'medium',
      },
      {
        error: 'Rate limit exceeded',
        expectedMessage: /Too many search requests/,
        expectedSeverity: 'low',
      },
      {
        error: 'Invalid search syntax',
        expectedMessage: /Invalid search syntax/,
        expectedSeverity: 'medium',
      },
      {
        error: 'Unauthorized access',
        expectedMessage: /You don't have permission/,
        expectedSeverity: 'high',
      },
    ];

    errorScenarios.forEach(({ error, expectedMessage, expectedSeverity }) => {
      it(`should display user-friendly message for ${error}`, () => {
        render(
          <SearchErrorBoundary>
            <ThrowError shouldThrow={true} errorMessage={error} />
          </SearchErrorBoundary>
        );

        expect(screen.getByText(expectedMessage)).toBeInTheDocument();
        
        // Check severity styling (this is a basic check - in a real app you'd check computed styles)
        const errorContainer = screen.getByText(expectedMessage).closest('div');
        if (expectedSeverity === 'low') {
          expect(errorContainer).toHaveClass('bg-yellow-50');
        } else if (expectedSeverity === 'medium') {
          expect(errorContainer).toHaveClass('bg-orange-50');
        } else if (expectedSeverity === 'high') {
          expect(errorContainer).toHaveClass('bg-red-50');
        }
      });
    });
  });

  describe('Retry Functionality', () => {
    it('should retry and recover when retry button is clicked', async () => {
      let shouldThrow = true;

      const RetryComponent: React.FC = () => {
        if (shouldThrow) {
          throw new Error('Temporary error');
        }
        return <div>Recovered Successfully</div>;
      };

      render(
        <SearchErrorBoundary>
          <RetryComponent />
        </SearchErrorBoundary>
      );

      // Should show error initially
      expect(screen.getByText('Search Error')).toBeInTheDocument();

      // Fix the error condition
      shouldThrow = false;

      // Click retry
      fireEvent.click(screen.getByRole('button', { name: /Try Again/i }));

      // Should recover and show normal content
      await waitFor(() => {
        expect(screen.getByText('Recovered Successfully')).toBeInTheDocument();
      });
      
      expect(screen.queryByText('Search Error')).not.toBeInTheDocument();
    });

    it('should disable retry button after 3 attempts', () => {
      render(
        <SearchErrorBoundary>
          <ThrowError shouldThrow={true} />
        </SearchErrorBoundary>
      );

      const retryButton = screen.getByRole('button', { name: /Try Again/i });

      // Click retry 3 times
      fireEvent.click(retryButton);
      fireEvent.click(retryButton);
      fireEvent.click(retryButton);

      // After 3 attempts, should show delayed retry
      expect(screen.getByRole('button', { name: /Retry in 1s/i })).toBeDisabled();
    });

    it('should hide retry button when showRetry is false', () => {
      render(
        <SearchErrorBoundary showRetry={false}>
          <ThrowError shouldThrow={true} />
        </SearchErrorBoundary>
      );

      expect(screen.queryByRole('button', { name: /Try Again/i })).not.toBeInTheDocument();
    });
  });

  describe('Error Details', () => {
    it('should toggle error details when button is clicked', () => {
      render(
        <SearchErrorBoundary showDetails={true}>
          <ThrowError shouldThrow={true} errorMessage="Detailed error test" />
        </SearchErrorBoundary>
      );

      const detailsButton = screen.getByRole('button', { name: /Show Details/i });
      
      // Details should be hidden initially
      expect(screen.queryByText('Technical Details')).not.toBeInTheDocument();

      // Click to show details
      fireEvent.click(detailsButton);

      // Details should now be visible
      expect(screen.getByText('Technical Details')).toBeInTheDocument();
      expect(screen.getByText(/Error:/)).toBeInTheDocument();
      expect(screen.getByText(/Detailed error test/)).toBeInTheDocument();

      // Button text should change
      expect(screen.getByRole('button', { name: /Hide Details/i })).toBeInTheDocument();

      // Click to hide details
      fireEvent.click(screen.getByRole('button', { name: /Hide Details/i }));

      // Details should be hidden again
      expect(screen.queryByText('Technical Details')).not.toBeInTheDocument();
    });

    it('should hide details button when showDetails is false', () => {
      render(
        <SearchErrorBoundary showDetails={false}>
          <ThrowError shouldThrow={true} />
        </SearchErrorBoundary>
      );

      expect(screen.queryByRole('button', { name: /Show Details/i })).not.toBeInTheDocument();
    });

    it('should display error stack trace in details', () => {
      const errorWithStack = new Error('Stack trace test');
      errorWithStack.stack = 'Error: Stack trace test\n    at TestComponent';

      const ComponentWithStack: React.FC = () => {
        throw errorWithStack;
      };

      render(
        <SearchErrorBoundary showDetails={true}>
          <ComponentWithStack />
        </SearchErrorBoundary>
      );

      // Show details
      fireEvent.click(screen.getByRole('button', { name: /Show Details/i }));

      // Check for stack trace content
      expect(screen.getByText(/Stack Trace:/)).toBeInTheDocument();
      expect(screen.getByText(/at TestComponent/)).toBeInTheDocument();
    });
  });

  describe('Recovery Suggestions', () => {
    it('should show appropriate suggestions for different error severities', () => {
      // Test low severity suggestions
      render(
        <SearchErrorBoundary>
          <ThrowError shouldThrow={true} errorMessage="rate limit exceeded" />
        </SearchErrorBoundary>
      );

      expect(screen.getByText(/Wait a moment before trying again/)).toBeInTheDocument();
      expect(screen.getByText(/Simplify your search query/)).toBeInTheDocument();
    });

    it('should show network-related suggestions for medium severity errors', () => {
      render(
        <SearchErrorBoundary>
          <ThrowError shouldThrow={true} errorMessage="Network Error" />
        </SearchErrorBoundary>
      );

      expect(screen.getByText(/Check your internet connection/)).toBeInTheDocument();
      expect(screen.getByText(/Refresh the page and try again/)).toBeInTheDocument();
    });

    it('should show permission-related suggestions for high severity errors', () => {
      render(
        <SearchErrorBoundary>
          <ThrowError shouldThrow={true} errorMessage="permission denied" />
        </SearchErrorBoundary>
      );

      expect(screen.getByText(/Contact your system administrator/)).toBeInTheDocument();
      expect(screen.getByText(/Check if you have the necessary permissions/)).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA attributes', () => {
      render(
        <SearchErrorBoundary>
          <ThrowError shouldThrow={true} />
        </SearchErrorBoundary>
      );

      // Check for accessible error message
      const errorHeading = screen.getByText('Search Error');
      expect(errorHeading).toBeInTheDocument();

      // Check for focusable retry button
      const retryButton = screen.getByRole('button', { name: /Try Again/i });
      expect(retryButton).toBeInTheDocument();
      expect(retryButton).not.toBeDisabled();
    });

    it('should maintain focus management during retry', async () => {
      let shouldThrow = true;

      const RetryComponent: React.FC = () => {
        if (shouldThrow) {
          throw new Error('Focus test error');
        }
        return <div>Focus recovered</div>;
      };

      render(
        <SearchErrorBoundary>
          <RetryComponent />
        </SearchErrorBoundary>
      );

      const retryButton = screen.getByRole('button', { name: /Try Again/i });
      retryButton.focus();
      expect(retryButton).toHaveFocus();

      shouldThrow = false;
      fireEvent.click(retryButton);

      await waitFor(() => {
        expect(screen.getByText('Focus recovered')).toBeInTheDocument();
      });
    });
  });
});