/**
 * SearchLoading Component
 * 
 * Loading states for different search UI contexts with skeleton screens
 * and spinner components
 */

import React from 'react';
import { Loader2 } from 'lucide-react';
import styles from './SearchLoading.module.css';

/**
 * Loading variant types
 */
type LoadingVariant = 
  | 'input' 
  | 'suggestions' 
  | 'results' 
  | 'card' 
  | 'filters'
  | 'analytics'
  | 'pagination';

/**
 * SearchLoading component props
 */
interface SearchLoadingProps {
  variant?: LoadingVariant;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  message?: string;
  showSpinner?: boolean;
  itemCount?: number;
}

/**
 * Skeleton loading component for cards
 */
function SkeletonCard({ className = '' }: { className?: string }) {
  return (
    <div className={`${styles.skeletonCard} ${className}`}>
      <div className={styles.skeletonHeader}>
        <div className={`${styles.skeleton} ${styles.skeletonTitle}`} />
        <div className={`${styles.skeleton} ${styles.skeletonBadge}`} />
      </div>
      <div className={styles.skeletonContent}>
        <div className={`${styles.skeleton} ${styles.skeletonLine}`} />
        <div className={`${styles.skeleton} ${styles.skeletonLine}`} />
        <div className={`${styles.skeleton} ${styles.skeletonLineShort}`} />
      </div>
      <div className={styles.skeletonFooter}>
        <div className={`${styles.skeleton} ${styles.skeletonTag}`} />
        <div className={`${styles.skeleton} ${styles.skeletonTag}`} />
      </div>
    </div>
  );
}

/**
 * Skeleton loading for input
 */
function SkeletonInput({ className = '' }: { className?: string }) {
  return (
    <div className={`${styles.skeletonInput} ${className}`}>
      <div className={`${styles.skeleton} ${styles.skeletonInputBar}`} />
    </div>
  );
}

/**
 * Skeleton loading for suggestions
 */
function SkeletonSuggestions({ className = '', itemCount = 5 }: { className?: string; itemCount?: number }) {
  return (
    <div className={`${styles.skeletonSuggestions} ${className}`}>
      {Array.from({ length: itemCount }, (_, index) => (
        <div key={index} className={styles.skeletonSuggestion}>
          <div className={`${styles.skeleton} ${styles.skeletonSuggestionText}`} />
          <div className={`${styles.skeleton} ${styles.skeletonSuggestionCount}`} />
        </div>
      ))}
    </div>
  );
}

/**
 * Skeleton loading for filters
 */
function SkeletonFilters({ className = '' }: { className?: string }) {
  return (
    <div className={`${styles.skeletonFilters} ${className}`}>
      <div className={styles.skeletonFilterGroup}>
        <div className={`${styles.skeleton} ${styles.skeletonFilterTitle}`} />
        <div className={styles.skeletonFilterOptions}>
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className={`${styles.skeleton} ${styles.skeletonFilterOption}`} />
          ))}
        </div>
      </div>
      <div className={styles.skeletonFilterGroup}>
        <div className={`${styles.skeleton} ${styles.skeletonFilterTitle}`} />
        <div className={styles.skeletonFilterOptions}>
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className={`${styles.skeleton} ${styles.skeletonFilterOption}`} />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Skeleton loading for analytics
 */
function SkeletonAnalytics({ className = '' }: { className?: string }) {
  return (
    <div className={`${styles.skeletonAnalytics} ${className}`}>
      <div className={styles.skeletonMetrics}>
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className={styles.skeletonMetric}>
            <div className={`${styles.skeleton} ${styles.skeletonMetricIcon}`} />
            <div className={`${styles.skeleton} ${styles.skeletonMetricValue}`} />
          </div>
        ))}
      </div>
      <div className={styles.skeletonCharts}>
        <div className={`${styles.skeleton} ${styles.skeletonChart}`} />
        <div className={`${styles.skeleton} ${styles.skeletonChart}`} />
      </div>
    </div>
  );
}

/**
 * Skeleton loading for pagination
 */
function SkeletonPagination({ className = '' }: { className?: string }) {
  return (
    <div className={`${styles.skeletonPagination} ${className}`}>
      <div className={`${styles.skeleton} ${styles.skeletonPageInfo}`} />
      <div className={styles.skeletonPageButtons}>
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className={`${styles.skeleton} ${styles.skeletonPageButton}`} />
        ))}
      </div>
    </div>
  );
}

/**
 * Spinner loading component
 */
function SpinnerLoading({ 
  size = 'md', 
  message, 
  className = '' 
}: { 
  size?: 'sm' | 'md' | 'lg'; 
  message?: string; 
  className?: string;
}) {
  const spinnerSizes = {
    sm: 16,
    md: 24,
    lg: 32
  };

  const spinnerClasses = {
    sm: styles.spinnerSm,
    md: styles.spinnerMd,
    lg: styles.spinnerLg
  };

  return (
    <div className={`${styles.spinnerContainer} ${spinnerClasses[size]} ${className}`}>
      <Loader2 size={spinnerSizes[size]} className={styles.spinner} />
      {message && (
        <span className={styles.spinnerMessage}>
          {message}
        </span>
      )}
    </div>
  );
}

/**
 * Main SearchLoading component
 */
export function SearchLoading({
  variant = 'results',
  size = 'md',
  className = '',
  message,
  showSpinner = false,
  itemCount = 6
}: SearchLoadingProps) {

  // If showSpinner is true, always show spinner regardless of variant
  if (showSpinner) {
    return <SpinnerLoading size={size} message={message} className={className} />;
  }

  // Render appropriate skeleton based on variant
  switch (variant) {
    case 'input':
      return <SkeletonInput className={className} />;
    
    case 'suggestions':
      return <SkeletonSuggestions className={className} itemCount={itemCount} />;
    
    case 'results':
      return (
        <div className={`${styles.skeletonResults} ${className}`}>
          <div className={styles.skeletonResultsGrid}>
            {Array.from({ length: itemCount }, (_, index) => (
              <SkeletonCard key={index} />
            ))}
          </div>
        </div>
      );
    
    case 'card':
      return <SkeletonCard className={className} />;
    
    case 'filters':
      return <SkeletonFilters className={className} />;
    
    case 'analytics':
      return <SkeletonAnalytics className={className} />;
    
    case 'pagination':
      return <SkeletonPagination className={className} />;
    
    default:
      return <SpinnerLoading size={size} message={message} className={className} />;
  }
}

/**
 * Default export
 */
export default SearchLoading;