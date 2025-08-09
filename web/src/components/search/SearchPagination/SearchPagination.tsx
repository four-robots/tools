/**
 * SearchPagination Component
 * 
 * Pagination component with page navigation, page size controls,
 * and accessibility features
 */

import React, { useMemo, useCallback } from 'react';
import { 
  ChevronLeft, 
  ChevronRight, 
  ChevronsLeft, 
  ChevronsRight,
  MoreHorizontal
} from 'lucide-react';
import { SearchPaginationProps, PAGE_SIZE_OPTIONS } from '../types';
import styles from './SearchPagination.module.css';

/**
 * SearchPagination component for navigating search results
 */
export function SearchPagination({
  currentPage,
  totalPages,
  totalItems,
  itemsPerPage,
  onPageChange,
  onPageSizeChange,
  hasNext,
  hasPrev,
  className = '',
  showPageSizeSelector = true,
  showItemCount = true,
  maxPaginationLinks = 7
}: SearchPaginationProps) {

  // ========================================================================
  // Computed Values
  // ========================================================================

  const startItem = useMemo(() => {
    return Math.max(1, (currentPage - 1) * itemsPerPage + 1);
  }, [currentPage, itemsPerPage]);

  const endItem = useMemo(() => {
    return Math.min(totalItems, currentPage * itemsPerPage);
  }, [currentPage, itemsPerPage, totalItems]);

  const pageNumbers = useMemo(() => {
    const pages: (number | 'ellipsis')[] = [];
    
    if (totalPages <= maxPaginationLinks) {
      // Show all pages if total is less than max
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Show first page
      pages.push(1);
      
      let startPage = Math.max(2, currentPage - Math.floor((maxPaginationLinks - 4) / 2));
      let endPage = Math.min(totalPages - 1, startPage + maxPaginationLinks - 5);
      
      // Adjust if we're near the end
      if (endPage === totalPages - 1) {
        startPage = Math.max(2, endPage - (maxPaginationLinks - 4));
      }
      
      // Add ellipsis after first page if needed
      if (startPage > 2) {
        pages.push('ellipsis');
      }
      
      // Add middle pages
      for (let i = startPage; i <= endPage; i++) {
        pages.push(i);
      }
      
      // Add ellipsis before last page if needed
      if (endPage < totalPages - 1) {
        pages.push('ellipsis');
      }
      
      // Show last page
      if (totalPages > 1) {
        pages.push(totalPages);
      }
    }
    
    return pages;
  }, [currentPage, totalPages, maxPaginationLinks]);

  const canGoPrev = currentPage > 1 && hasPrev;
  const canGoNext = currentPage < totalPages && hasNext;

  // ========================================================================
  // Event Handlers
  // ========================================================================

  const handlePageChange = useCallback((page: number) => {
    if (page !== currentPage && page >= 1 && page <= totalPages) {
      onPageChange(page);
    }
  }, [currentPage, totalPages, onPageChange]);

  const handlePageSizeChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    const newSize = parseInt(event.target.value, 10);
    if (newSize !== itemsPerPage) {
      onPageSizeChange(newSize);
    }
  }, [itemsPerPage, onPageSizeChange]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent, page: number) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handlePageChange(page);
    }
  }, [handlePageChange]);

  // ========================================================================
  // Render Helpers
  // ========================================================================

  const renderPageButton = useCallback((
    page: number | 'ellipsis',
    index: number
  ) => {
    if (page === 'ellipsis') {
      return (
        <span key={`ellipsis-${index}`} className={styles.ellipsis}>
          <MoreHorizontal size={16} />
        </span>
      );
    }

    const isActive = page === currentPage;
    const buttonClasses = [
      styles.pageButton,
      isActive && styles.active
    ].filter(Boolean).join(' ');

    return (
      <button
        key={page}
        onClick={() => handlePageChange(page)}
        onKeyDown={(e) => handleKeyDown(e, page)}
        className={buttonClasses}
        aria-label={`Go to page ${page}`}
        aria-current={isActive ? 'page' : undefined}
        disabled={isActive}
      >
        {page}
      </button>
    );
  }, [currentPage, handlePageChange, handleKeyDown]);

  const renderPageSizeSelector = useCallback(() => {
    if (!showPageSizeSelector) return null;

    return (
      <div className={styles.pageSizeSelector}>
        <label htmlFor="page-size-select" className={styles.pageSizeLabel}>
          Show:
        </label>
        <select
          id="page-size-select"
          value={itemsPerPage}
          onChange={handlePageSizeChange}
          className={styles.pageSizeSelect}
        >
          {PAGE_SIZE_OPTIONS.map(size => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
        <span className={styles.pageSizeLabel}>per page</span>
      </div>
    );
  }, [showPageSizeSelector, itemsPerPage, handlePageSizeChange]);

  const renderItemCount = useCallback(() => {
    if (!showItemCount || totalItems === 0) return null;

    return (
      <div className={styles.itemCount}>
        Showing {startItem.toLocaleString()}-{endItem.toLocaleString()} of {totalItems.toLocaleString()} results
      </div>
    );
  }, [showItemCount, totalItems, startItem, endItem]);

  // Don't render if there's only one page and no items
  if (totalPages <= 1 && totalItems === 0) {
    return null;
  }

  // ========================================================================
  // Main Render
  // ========================================================================

  return (
    <nav
      className={`${styles.pagination} ${className}`}
      role="navigation"
      aria-label="Search results pagination"
    >
      <div className={styles.paginationInfo}>
        {renderItemCount()}
        {renderPageSizeSelector()}
      </div>

      {totalPages > 1 && (
        <div className={styles.paginationNav}>
          {/* First page button */}
          <button
            onClick={() => handlePageChange(1)}
            disabled={!canGoPrev}
            className={`${styles.navButton} ${!canGoPrev ? styles.disabled : ''}`}
            aria-label="Go to first page"
            title="First page"
          >
            <ChevronsLeft size={16} />
          </button>

          {/* Previous page button */}
          <button
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={!canGoPrev}
            className={`${styles.navButton} ${!canGoPrev ? styles.disabled : ''}`}
            aria-label="Go to previous page"
            title="Previous page"
          >
            <ChevronLeft size={16} />
          </button>

          {/* Page numbers */}
          <div className={styles.pageNumbers}>
            {pageNumbers.map((page, index) => renderPageButton(page, index))}
          </div>

          {/* Next page button */}
          <button
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={!canGoNext}
            className={`${styles.navButton} ${!canGoNext ? styles.disabled : ''}`}
            aria-label="Go to next page"
            title="Next page"
          >
            <ChevronRight size={16} />
          </button>

          {/* Last page button */}
          <button
            onClick={() => handlePageChange(totalPages)}
            disabled={!canGoNext}
            className={`${styles.navButton} ${!canGoNext ? styles.disabled : ''}`}
            aria-label="Go to last page"
            title="Last page"
          >
            <ChevronsRight size={16} />
          </button>
        </div>
      )}
    </nav>
  );
}

/**
 * Default export
 */
export default SearchPagination;