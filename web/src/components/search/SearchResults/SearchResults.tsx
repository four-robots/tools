/**
 * SearchResults Component
 * 
 * Main container component for displaying search results with pagination,
 * sorting, and view mode options
 */

import React, { useMemo, useCallback } from 'react';
import { 
  Grid3X3, 
  List, 
  SortAsc, 
  RotateCcw,
  AlertCircle,
  Loader2
} from 'lucide-react';
import { SearchResult, SearchSort } from '@mcp-tools/core';
import { SearchResultsProps, SortOption, SORT_OPTIONS } from '../types';
import { SearchResultCard } from './SearchResultCard';
import { SearchPagination } from '../SearchPagination/SearchPagination';
import { SearchLoading } from '../common/SearchLoading';
import { SearchEmpty } from '../common/SearchEmpty';
import { SearchError } from '../common/SearchError';
import styles from './SearchResults.module.css';

/**
 * View mode type for grid/list toggle
 */
type ViewMode = 'grid' | 'list';

/**
 * Extended SearchResults props with view mode controls
 */
interface ExtendedSearchResultsProps extends SearchResultsProps {
  viewMode?: ViewMode;
  sortBy?: SearchSort;
  onViewModeChange?: (mode: ViewMode) => void;
  onRetry?: () => void;
  maxResultsToShow?: number;
  showViewToggle?: boolean;
  showSortOptions?: boolean;
}

/**
 * SearchResults component for displaying paginated search results
 */
export function SearchResults({
  results,
  totalCount,
  isLoading,
  error,
  pagination,
  onPageChange,
  onSortChange,
  onResultClick,
  className = '',
  viewMode = 'grid',
  sortBy = 'relevance',
  onViewModeChange,
  onRetry,
  maxResultsToShow,
  showViewToggle = true,
  showSortOptions = true,
  showAggregations = false,
  aggregations,
  onFilterByType,
  onFilterByTag
}: ExtendedSearchResultsProps) {

  // ========================================================================
  // Computed Values
  // ========================================================================

  const displayResults = useMemo(() => {
    if (!maxResultsToShow) return results;
    return results.slice(0, maxResultsToShow);
  }, [results, maxResultsToShow]);

  const currentSortOption = useMemo(() => {
    return SORT_OPTIONS.find(option => option.key === sortBy) || SORT_OPTIONS[0];
  }, [sortBy]);

  const hasResults = displayResults.length > 0;
  const showPagination = pagination.totalPages > 1;

  // ========================================================================
  // Event Handlers
  // ========================================================================

  const handleViewModeToggle = useCallback((mode: ViewMode) => {
    onViewModeChange?.(mode);
  }, [onViewModeChange]);

  const handleSortChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    const sortKey = event.target.value as SearchSort;
    onSortChange(sortKey);
  }, [onSortChange]);

  const handleResultClick = useCallback((result: SearchResult) => {
    onResultClick(result);
  }, [onResultClick]);

  const handleRetry = useCallback(() => {
    onRetry?.();
  }, [onRetry]);

  // ========================================================================
  // Render Helpers
  // ========================================================================

  const renderHeader = useCallback(() => {
    if (isLoading && !hasResults) return null;

    return (
      <div className={styles.resultsHeader}>
        <div className={styles.resultsInfo}>
          <span className={styles.resultCount}>
            {totalCount > 0 && (
              <>
                {totalCount.toLocaleString()} result{totalCount !== 1 ? 's' : ''}
                {pagination.currentPage > 1 && (
                  <span className={styles.pageInfo}>
                    {' '}(page {pagination.currentPage} of {pagination.totalPages})
                  </span>
                )}
              </>
            )}
          </span>
        </div>

        <div className={styles.resultsControls}>
          {showSortOptions && hasResults && (
            <div className={styles.sortSelector}>
              <SortAsc size={16} className={styles.sortIcon} />
              <select
                value={sortBy}
                onChange={handleSortChange}
                className={styles.sortSelect}
                aria-label="Sort results by"
              >
                {SORT_OPTIONS.map(option => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {showViewToggle && hasResults && onViewModeChange && (
            <div className={styles.viewToggle}>
              <button
                onClick={() => handleViewModeToggle('grid')}
                className={`${styles.viewButton} ${viewMode === 'grid' ? styles.active : ''}`}
                aria-label="Grid view"
                title="Grid view"
              >
                <Grid3X3 size={16} />
              </button>
              <button
                onClick={() => handleViewModeToggle('list')}
                className={`${styles.viewButton} ${viewMode === 'list' ? styles.active : ''}`}
                aria-label="List view"
                title="List view"
              >
                <List size={16} />
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }, [
    isLoading,
    hasResults,
    totalCount,
    pagination.currentPage,
    pagination.totalPages,
    showSortOptions,
    showViewToggle,
    sortBy,
    viewMode,
    onViewModeChange,
    handleSortChange,
    handleViewModeToggle
  ]);

  const renderAggregations = useCallback(() => {
    if (!showAggregations || !aggregations || !hasResults) return null;

    return (
      <div className={styles.aggregations}>
        {aggregations.types && Object.keys(aggregations.types).length > 0 && (
          <div className={styles.aggregationSection}>
            <h4 className={styles.aggregationTitle}>Content Types</h4>
            <div className={styles.aggregationList}>
              {Object.entries(aggregations.types).map(([type, count]) => (
                <button
                  key={type}
                  onClick={() => onFilterByType?.(type as any)}
                  className={styles.aggregationItem}
                >
                  {type} ({count})
                </button>
              ))}
            </div>
          </div>
        )}

        {aggregations.tags && aggregations.tags.length > 0 && (
          <div className={styles.aggregationSection}>
            <h4 className={styles.aggregationTitle}>Top Tags</h4>
            <div className={styles.aggregationList}>
              {aggregations.tags.slice(0, 10).map(tag => (
                <button
                  key={tag.tag}
                  onClick={() => onFilterByTag?.(tag.tag)}
                  className={styles.aggregationItem}
                >
                  {tag.tag} ({tag.count})
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }, [showAggregations, aggregations, hasResults, onFilterByType, onFilterByTag]);

  const renderResultsGrid = useCallback(() => {
    if (!hasResults) return null;

    const gridClass = viewMode === 'grid' 
      ? styles.resultsGrid 
      : styles.resultsList;

    return (
      <div className={gridClass} role="main">
        {displayResults.map((result, index) => (
          <SearchResultCard
            key={result.id}
            result={result}
            onClick={handleResultClick}
            className={styles.resultCard}
            showPreview={true}
            showMetadata={true}
            showRelationships={viewMode === 'list'}
          />
        ))}
      </div>
    );
  }, [hasResults, viewMode, displayResults, handleResultClick]);

  // ========================================================================
  // Loading, Error, and Empty States
  // ========================================================================

  if (isLoading && !hasResults) {
    return (
      <div className={`${styles.searchResults} ${className}`}>
        <SearchLoading variant="results" />
      </div>
    );
  }

  if (error) {
    return (
      <div className={`${styles.searchResults} ${className}`}>
        <SearchError 
          error={error} 
          onRetry={handleRetry}
          variant="results"
        />
      </div>
    );
  }

  if (!isLoading && !hasResults && totalCount === 0) {
    return (
      <div className={`${styles.searchResults} ${className}`}>
        <SearchEmpty 
          variant="no-results"
          onRetry={handleRetry}
        />
      </div>
    );
  }

  // ========================================================================
  // Main Render
  // ========================================================================

  return (
    <div className={`${styles.searchResults} ${className}`} role="region" aria-label="Search results">
      {renderHeader()}
      
      <div className={styles.resultsBody}>
        {renderAggregations()}
        
        <div className={styles.resultsContent}>
          {renderResultsGrid()}
          
          {isLoading && hasResults && (
            <div className={styles.loadingOverlay}>
              <Loader2 className="animate-spin" size={20} />
              <span>Updating results...</span>
            </div>
          )}
        </div>
      </div>

      {showPagination && !isLoading && (
        <div className={styles.paginationContainer}>
          <SearchPagination
            currentPage={pagination.currentPage}
            totalPages={pagination.totalPages}
            totalItems={pagination.totalItems}
            itemsPerPage={pagination.itemsPerPage}
            onPageChange={onPageChange}
            onPageSizeChange={(size) => {
              // Handle page size change - will need to be implemented
              // This could trigger a search with new page size
              console.log('Page size change requested:', size);
            }}
            hasNext={pagination.hasNext}
            hasPrev={pagination.hasPrev}
            showPageSizeSelector={true}
            showItemCount={true}
          />
        </div>
      )}
    </div>
  );
}

/**
 * Default export
 */
export default SearchResults;