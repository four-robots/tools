/**
 * SearchEmpty Component
 * 
 * Empty state components for different search scenarios with helpful
 * suggestions and call-to-action buttons
 */

import React, { useCallback } from 'react';
import { 
  Search,
  FileText,
  Lightbulb,
  RefreshCw,
  Filter,
  Compass
} from 'lucide-react';
import styles from './SearchEmpty.module.css';

/**
 * Empty state variant types
 */
type EmptyVariant = 
  | 'no-query'
  | 'no-results'
  | 'no-results-with-filters'
  | 'search-error'
  | 'initial-state';

/**
 * SearchEmpty component props
 */
interface SearchEmptyProps {
  variant?: EmptyVariant;
  className?: string;
  title?: string;
  message?: string;
  suggestions?: string[];
  onRetry?: () => void;
  onClearFilters?: () => void;
  onSuggestionClick?: (suggestion: string) => void;
  showSuggestions?: boolean;
  showRetry?: boolean;
}

/**
 * Default suggestions for different scenarios
 */
const DEFAULT_SUGGESTIONS = {
  'no-results': [
    'Check your spelling',
    'Try different keywords', 
    'Use broader search terms',
    'Remove some filters'
  ],
  'no-results-with-filters': [
    'Clear some filters to see more results',
    'Try different filter combinations',
    'Expand your date range',
    'Search in all content types'
  ],
  'no-query': [
    'Search for wiki pages',
    'Find kanban cards',
    'Look for code files',
    'Browse memory thoughts'
  ],
  'initial-state': [
    'Start typing to search across all content',
    'Use filters to narrow down results',
    'Try searching for specific content types',
    'Browse popular tags and topics'
  ]
};

/**
 * Default messages for different variants
 */
const DEFAULT_MESSAGES = {
  'no-query': {
    title: 'Start Your Search',
    message: 'Enter a search query to find content across all your projects and tools.'
  },
  'no-results': {
    title: 'No Results Found',
    message: 'We couldn\'t find any content matching your search. Try adjusting your query or filters.'
  },
  'no-results-with-filters': {
    title: 'No Results with Current Filters',
    message: 'Your search didn\'t return any results with the current filters applied.'
  },
  'search-error': {
    title: 'Search Error',
    message: 'Something went wrong while searching. Please try again.'
  },
  'initial-state': {
    title: 'Search Everything',
    message: 'Search across wiki pages, kanban cards, code files, and more in one unified interface.'
  }
};

/**
 * Icon mapping for different variants
 */
const VARIANT_ICONS = {
  'no-query': Search,
  'no-results': FileText,
  'no-results-with-filters': Filter,
  'search-error': RefreshCw,
  'initial-state': Compass
};

/**
 * SearchEmpty component for displaying empty states
 */
export function SearchEmpty({
  variant = 'no-results',
  className = '',
  title,
  message,
  suggestions,
  onRetry,
  onClearFilters,
  onSuggestionClick,
  showSuggestions = true,
  showRetry = false
}: SearchEmptyProps) {

  // ========================================================================
  // Computed Values
  // ========================================================================

  const Icon = VARIANT_ICONS[variant];
  const defaultContent = DEFAULT_MESSAGES[variant];
  const displayTitle = title || defaultContent.title;
  const displayMessage = message || defaultContent.message;
  const displaySuggestions = suggestions || (showSuggestions ? DEFAULT_SUGGESTIONS[variant] : undefined);

  // ========================================================================
  // Event Handlers
  // ========================================================================

  const handleSuggestionClick = useCallback((suggestion: string) => {
    onSuggestionClick?.(suggestion);
  }, [onSuggestionClick]);

  const handleRetry = useCallback(() => {
    onRetry?.();
  }, [onRetry]);

  const handleClearFilters = useCallback(() => {
    onClearFilters?.();
  }, [onClearFilters]);

  // ========================================================================
  // Render Helpers
  // ========================================================================

  const renderSuggestions = useCallback(() => {
    if (!displaySuggestions || displaySuggestions.length === 0) {
      return null;
    }

    return (
      <div className={styles.suggestions}>
        <div className={styles.suggestionsTitle}>
          <Lightbulb size={16} />
          Try these suggestions:
        </div>
        <ul className={styles.suggestionsList}>
          {displaySuggestions.map((suggestion, index) => (
            <li key={index} className={styles.suggestionItem}>
              {onSuggestionClick ? (
                <button
                  onClick={() => handleSuggestionClick(suggestion)}
                  className={styles.suggestionButton}
                >
                  {suggestion}
                </button>
              ) : (
                <span className={styles.suggestionText}>
                  {suggestion}
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
    );
  }, [displaySuggestions, onSuggestionClick, handleSuggestionClick]);

  const renderActions = useCallback(() => {
    const hasActions = showRetry || (variant === 'no-results-with-filters' && onClearFilters);
    
    if (!hasActions) return null;

    return (
      <div className={styles.actions}>
        {showRetry && onRetry && (
          <button
            onClick={handleRetry}
            className={styles.primaryAction}
          >
            <RefreshCw size={16} />
            Try Again
          </button>
        )}
        
        {variant === 'no-results-with-filters' && onClearFilters && (
          <button
            onClick={handleClearFilters}
            className={styles.secondaryAction}
          >
            <Filter size={16} />
            Clear Filters
          </button>
        )}
      </div>
    );
  }, [variant, showRetry, onRetry, onClearFilters, handleRetry, handleClearFilters]);

  // ========================================================================
  // Main Render
  // ========================================================================

  return (
    <div className={`${styles.searchEmpty} ${styles[variant]} ${className}`}>
      <div className={styles.emptyContent}>
        {/* Icon */}
        <div className={styles.emptyIcon}>
          <Icon size={48} />
        </div>

        {/* Title and Message */}
        <div className={styles.emptyText}>
          <h3 className={styles.emptyTitle}>
            {displayTitle}
          </h3>
          <p className={styles.emptyMessage}>
            {displayMessage}
          </p>
        </div>

        {/* Actions */}
        {renderActions()}

        {/* Suggestions */}
        {renderSuggestions()}
      </div>
    </div>
  );
}

/**
 * Default export
 */
export default SearchEmpty;