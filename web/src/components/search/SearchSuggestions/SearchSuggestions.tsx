/**
 * SearchSuggestions Component
 * 
 * Dropdown component for displaying search suggestions and autocomplete
 */

import React, { useCallback, useMemo } from 'react';
import { 
  Search, 
  TrendingUp, 
  RotateCcw, 
  Zap,
  Loader2,
  Hash,
  FileText
} from 'lucide-react';
import { SearchSuggestionsProps, SearchSuggestion } from '../types';
import { highlightSearchTerms, extractSearchTerms } from '../utils/searchHelpers';
import styles from './SearchSuggestions.module.css';

/**
 * SearchSuggestions component for autocomplete dropdown
 */
export function SearchSuggestions({
  query,
  suggestions,
  isVisible,
  isLoading,
  onSuggestionSelect,
  onClose,
  className = '',
  maxSuggestions = 8,
  showTypes = true,
  selectedIndex = -1
}: SearchSuggestionsProps) {

  // ========================================================================
  // Suggestion Processing
  // ========================================================================

  const processedSuggestions = useMemo(() => {
    if (!suggestions) return [];
    
    const queryTerms = extractSearchTerms(query);
    
    return suggestions
      .slice(0, maxSuggestions)
      .map((suggestion, index) => ({
        ...suggestion,
        highlightedQuery: highlightSearchTerms(
          suggestion.query,
          queryTerms,
          styles.highlight
        ),
        isSelected: index === selectedIndex
      }));
  }, [suggestions, maxSuggestions, query, selectedIndex]);

  // Group suggestions by type
  const groupedSuggestions = useMemo(() => {
    if (!showTypes) {
      return { all: processedSuggestions };
    }

    const groups: Record<string, typeof processedSuggestions> = {};
    
    processedSuggestions.forEach(suggestion => {
      const type = suggestion.type;
      if (!groups[type]) {
        groups[type] = [];
      }
      groups[type].push(suggestion);
    });
    
    return groups;
  }, [processedSuggestions, showTypes]);

  // ========================================================================
  // Event Handlers
  // ========================================================================

  const handleSuggestionClick = useCallback((suggestion: SearchSuggestion) => {
    onSuggestionSelect(suggestion);
  }, [onSuggestionSelect]);

  const handleSuggestionMouseEnter = useCallback((index: number) => {
    // You could emit an event here to update selectedIndex in parent
    // For now, we rely on keyboard navigation to set selectedIndex
  }, []);

  // ========================================================================
  // Icon Mapping
  // ========================================================================

  const getIconForSuggestionType = useCallback((type: SearchSuggestion['type']) => {
    switch (type) {
      case 'completion':
        return <Search className={`${styles.suggestionIcon} ${styles.completion}`} size={16} />;
      case 'popular':
        return <TrendingUp className={`${styles.suggestionIcon} ${styles.popular}`} size={16} />;
      case 'related':
        return <Zap className={`${styles.suggestionIcon} ${styles.related}`} size={16} />;
      case 'spelling':
        return <RotateCcw className={`${styles.suggestionIcon} ${styles.spelling}`} size={16} />;
      default:
        return <Search className={styles.suggestionIcon} size={16} />;
    }
  }, []);

  const getTypeLabel = useCallback((type: SearchSuggestion['type']) => {
    switch (type) {
      case 'completion':
        return 'Suggestions';
      case 'popular':
        return 'Popular';
      case 'related':
        return 'Related';
      case 'spelling':
        return 'Did you mean?';
      default:
        return 'Suggestions';
    }
  }, []);

  // ========================================================================
  // Confidence Indicator
  // ========================================================================

  const getConfidenceClass = useCallback((confidence: number) => {
    if (confidence >= 0.8) return styles.high;
    if (confidence >= 0.5) return styles.medium;
    return styles.low;
  }, []);

  // ========================================================================
  // Render Helpers
  // ========================================================================

  const renderSuggestion = useCallback((suggestion: typeof processedSuggestions[0], globalIndex: number) => {
    const itemClasses = [
      styles.suggestionItem,
      suggestion.isSelected && styles.selected
    ].filter(Boolean).join(' ');

    const textClasses = [
      styles.suggestionText,
      suggestion.isSelected && styles.selected
    ].filter(Boolean).join(' ');

    const metaClasses = [
      styles.suggestionMeta,
      suggestion.isSelected && styles.selected
    ].filter(Boolean).join(' ');

    const resultCountClasses = [
      styles.resultCount,
      suggestion.isSelected && styles.selected
    ].filter(Boolean).join(' ');

    return (
      <li
        key={`${suggestion.type}_${suggestion.id}_${globalIndex}`}
        className={itemClasses}
        onClick={() => handleSuggestionClick(suggestion)}
        onMouseEnter={() => handleSuggestionMouseEnter(globalIndex)}
        role="option"
        aria-selected={suggestion.isSelected}
        data-suggestion-index={globalIndex}
      >
        <div className={styles.suggestionContent}>
          {getIconForSuggestionType(suggestion.type)}
          <span 
            className={textClasses}
            dangerouslySetInnerHTML={{ __html: suggestion.highlightedQuery }}
          />
        </div>
        
        <div className={metaClasses}>
          {suggestion.resultCount !== undefined && (
            <span className={resultCountClasses}>
              {suggestion.resultCount}
            </span>
          )}
          
          <div 
            className={`${styles.confidence} ${getConfidenceClass(suggestion.confidence)}`}
            title={`Confidence: ${Math.round(suggestion.confidence * 100)}%`}
            aria-label={`Confidence: ${Math.round(suggestion.confidence * 100)}%`}
          />
        </div>
      </li>
    );
  }, [handleSuggestionClick, handleSuggestionMouseEnter, getIconForSuggestionType, getConfidenceClass]);

  // ========================================================================
  // Loading State
  // ========================================================================

  if (isLoading) {
    return (
      <div className={`${styles.suggestionsContainer} ${className}`}>
        <div className={styles.loadingContainer}>
          <Loader2 className={styles.loadingSpinner} size={20} />
          <span className={styles.loadingText}>Loading suggestions...</span>
        </div>
      </div>
    );
  }

  // ========================================================================
  // Empty State
  // ========================================================================

  if (!isVisible || processedSuggestions.length === 0) {
    return null;
  }

  // ========================================================================
  // Main Render
  // ========================================================================

  return (
    <div 
      className={`${styles.suggestionsContainer} ${className}`}
      id="search-suggestions"
      role="listbox"
      aria-label="Search suggestions"
    >
      {showTypes ? (
        // Grouped suggestions by type
        <ul className={styles.suggestionsList}>
          {Object.entries(groupedSuggestions).map(([type, typeSuggestions], groupIndex) => {
            let globalIndex = 0;
            
            // Calculate the global index for this group
            Object.entries(groupedSuggestions)
              .slice(0, groupIndex)
              .forEach(([_, prevTypeSuggestions]) => {
                globalIndex += prevTypeSuggestions.length;
              });

            return (
              <React.Fragment key={type}>
                {groupIndex > 0 && <div className={styles.groupDivider} />}
                
                <li className={styles.suggestionTypeLabel}>
                  {getTypeLabel(type as SearchSuggestion['type'])}
                </li>
                
                {typeSuggestions.map((suggestion, index) =>
                  renderSuggestion(suggestion, globalIndex + index)
                )}
              </React.Fragment>
            );
          })}
        </ul>
      ) : (
        // Flat list of suggestions
        <ul className={styles.suggestionsList}>
          {processedSuggestions.map((suggestion, index) =>
            renderSuggestion(suggestion, index)
          )}
        </ul>
      )}
    </div>
  );
}

// Default props for easier usage
SearchSuggestions.defaultProps = {
  maxSuggestions: 8,
  showTypes: true,
  selectedIndex: -1
} as Partial<SearchSuggestionsProps>;