/**
 * SearchError Component
 * 
 * Error display component with retry functionality for different
 * error types (network, validation, server errors)
 */

import React, { useCallback, useMemo } from 'react';
import { 
  AlertTriangle,
  Wifi,
  Server,
  RefreshCw,
  AlertCircle,
  Bug,
  Clock
} from 'lucide-react';
import styles from './SearchError.module.css';

/**
 * Error variant types
 */
type ErrorVariant = 
  | 'network'
  | 'server'
  | 'validation'
  | 'timeout'
  | 'generic'
  | 'results'
  | 'suggestions'
  | 'analytics';

/**
 * SearchError component props
 */
interface SearchErrorProps {
  error: string | Error;
  variant?: ErrorVariant;
  className?: string;
  title?: string;
  onRetry?: () => void;
  onReport?: (error: string) => void;
  showRetry?: boolean;
  showReport?: boolean;
  retryText?: string;
  details?: string;
}

/**
 * Error type detection based on error message
 */
function detectErrorType(error: string | Error): ErrorVariant {
  const errorMessage = typeof error === 'string' ? error.toLowerCase() : error.message.toLowerCase();
  
  if (errorMessage.includes('network') || errorMessage.includes('fetch') || errorMessage.includes('connection')) {
    return 'network';
  }
  
  if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
    return 'timeout';
  }
  
  if (errorMessage.includes('server') || errorMessage.includes('internal') || errorMessage.includes('500')) {
    return 'server';
  }
  
  if (errorMessage.includes('validation') || errorMessage.includes('invalid') || errorMessage.includes('400')) {
    return 'validation';
  }
  
  return 'generic';
}

/**
 * Default content for different error types
 */
const ERROR_CONTENT = {
  network: {
    icon: Wifi,
    title: 'Connection Error',
    message: 'Unable to connect to the search service. Check your internet connection.',
    suggestions: [
      'Check your internet connection',
      'Try refreshing the page',
      'Contact support if the problem persists'
    ]
  },
  server: {
    icon: Server,
    title: 'Server Error',
    message: 'The search service is temporarily unavailable. Please try again later.',
    suggestions: [
      'Wait a few minutes and try again',
      'Check the service status page',
      'Contact support if the issue continues'
    ]
  },
  validation: {
    icon: AlertCircle,
    title: 'Search Error',
    message: 'Your search query contains invalid characters or formatting.',
    suggestions: [
      'Check your search terms for special characters',
      'Simplify your search query',
      'Remove any unusual formatting'
    ]
  },
  timeout: {
    icon: Clock,
    title: 'Search Timeout',
    message: 'Your search is taking too long to complete. Please try a simpler query.',
    suggestions: [
      'Try a shorter, more specific search',
      'Remove complex filters',
      'Search for fewer terms at once'
    ]
  },
  generic: {
    icon: AlertTriangle,
    title: 'Something Went Wrong',
    message: 'An unexpected error occurred while searching.',
    suggestions: [
      'Try your search again',
      'Refresh the page',
      'Contact support if the problem continues'
    ]
  },
  results: {
    icon: AlertTriangle,
    title: 'Failed to Load Results',
    message: 'There was a problem loading your search results.',
    suggestions: [
      'Try refreshing the results',
      'Check your search terms',
      'Clear filters and try again'
    ]
  },
  suggestions: {
    icon: AlertTriangle,
    title: 'Failed to Load Suggestions',
    message: 'Unable to load search suggestions at this time.',
    suggestions: [
      'Type your full search query',
      'Try again in a moment',
      'Continue without suggestions'
    ]
  },
  analytics: {
    icon: AlertTriangle,
    title: 'Failed to Load Analytics',
    message: 'Unable to load search analytics data.',
    suggestions: [
      'Try refreshing the page',
      'Check your permissions',
      'Contact an administrator'
    ]
  }
};

/**
 * SearchError component for displaying search errors
 */
export function SearchError({
  error,
  variant,
  className = '',
  title,
  onRetry,
  onReport,
  showRetry = true,
  showReport = false,
  retryText = 'Try Again',
  details
}: SearchErrorProps) {

  // ========================================================================
  // Computed Values
  // ========================================================================

  const errorMessage = typeof error === 'string' ? error : error.message;
  const detectedVariant = variant || detectErrorType(error);
  const errorContent = ERROR_CONTENT[detectedVariant];
  
  const displayTitle = title || errorContent.title;
  const displayMessage = errorContent.message;

  // ========================================================================
  // Event Handlers
  // ========================================================================

  const handleRetry = useCallback(() => {
    onRetry?.();
  }, [onRetry]);

  const handleReport = useCallback(() => {
    onReport?.(errorMessage);
  }, [onReport, errorMessage]);

  // ========================================================================
  // Render Helpers
  // ========================================================================

  const renderIcon = useCallback(() => {
    const Icon = errorContent.icon;
    return (
      <div className={`${styles.errorIcon} ${styles[detectedVariant]}`}>
        <Icon size={48} />
      </div>
    );
  }, [errorContent.icon, detectedVariant]);

  const renderErrorDetails = useCallback(() => {
    if (!details && !errorMessage) return null;

    return (
      <details className={styles.errorDetails}>
        <summary className={styles.errorDetailsSummary}>
          Technical Details
        </summary>
        <div className={styles.errorDetailsContent}>
          {details && (
            <div className={styles.errorDetailsSection}>
              <strong>Details:</strong>
              <pre className={styles.errorDetailsText}>{details}</pre>
            </div>
          )}
          {errorMessage && (
            <div className={styles.errorDetailsSection}>
              <strong>Error Message:</strong>
              <pre className={styles.errorDetailsText}>{errorMessage}</pre>
            </div>
          )}
        </div>
      </details>
    );
  }, [details, errorMessage]);

  const renderSuggestions = useCallback(() => {
    if (!errorContent.suggestions || errorContent.suggestions.length === 0) {
      return null;
    }

    return (
      <div className={styles.suggestions}>
        <h4 className={styles.suggestionsTitle}>What you can do:</h4>
        <ul className={styles.suggestionsList}>
          {errorContent.suggestions.map((suggestion, index) => (
            <li key={index} className={styles.suggestionItem}>
              {suggestion}
            </li>
          ))}
        </ul>
      </div>
    );
  }, [errorContent.suggestions]);

  const renderActions = useCallback(() => {
    const hasActions = showRetry || showReport;
    if (!hasActions) return null;

    return (
      <div className={styles.actions}>
        {showRetry && onRetry && (
          <button
            onClick={handleRetry}
            className={styles.primaryAction}
          >
            <RefreshCw size={16} />
            {retryText}
          </button>
        )}
        
        {showReport && onReport && (
          <button
            onClick={handleReport}
            className={styles.secondaryAction}
          >
            <Bug size={16} />
            Report Issue
          </button>
        )}
      </div>
    );
  }, [showRetry, showReport, onRetry, onReport, handleRetry, handleReport, retryText]);

  // ========================================================================
  // Main Render
  // ========================================================================

  return (
    <div className={`${styles.searchError} ${styles[detectedVariant]} ${className}`} role="alert">
      <div className={styles.errorContent}>
        {/* Icon */}
        {renderIcon()}

        {/* Title and Message */}
        <div className={styles.errorText}>
          <h3 className={styles.errorTitle}>
            {displayTitle}
          </h3>
          <p className={styles.errorMessage}>
            {displayMessage}
          </p>
        </div>

        {/* Actions */}
        {renderActions()}

        {/* Suggestions */}
        {renderSuggestions()}

        {/* Error Details */}
        {renderErrorDetails()}
      </div>
    </div>
  );
}

/**
 * Default export
 */
export default SearchError;