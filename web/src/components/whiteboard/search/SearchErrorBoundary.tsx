import React, { Component, ErrorInfo, ReactNode } from 'react';
import { 
  ExclamationTriangleIcon,
  ArrowPathIcon,
  InformationCircleIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';

interface SearchErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  showRetry?: boolean;
  showDetails?: boolean;
  title?: string;
}

interface SearchErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  showDetails: boolean;
  retryCount: number;
}

/**
 * Error boundary specifically designed for search components
 * Provides user-friendly error handling with retry functionality
 */
class SearchErrorBoundary extends Component<SearchErrorBoundaryProps, SearchErrorBoundaryState> {
  private retryTimer: NodeJS.Timeout | null = null;

  constructor(props: SearchErrorBoundaryProps) {
    super(props);

    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
      retryCount: 0,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<SearchErrorBoundaryState> {
    // Update state so the next render shows the fallback UI
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({
      error,
      errorInfo,
    });

    // Call optional error handler
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    // Log error for debugging
    console.error('SearchErrorBoundary caught an error:', error, errorInfo);
  }

  componentWillUnmount() {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
    }
  }

  handleRetry = () => {
    this.setState(prevState => ({
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
      retryCount: prevState.retryCount + 1,
    }));
  };

  handleDelayedRetry = () => {
    // Clear any existing timer
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
    }

    // Set a delay before retrying to prevent rapid retry loops
    this.retryTimer = setTimeout(() => {
      this.handleRetry();
    }, 1000);
  };

  toggleDetails = () => {
    this.setState(prevState => ({
      showDetails: !prevState.showDetails,
    }));
  };

  getErrorMessage(error: Error): string {
    const message = error.message;

    // Provide user-friendly messages for common search errors
    if (message.includes('Network Error') || message.includes('fetch')) {
      return 'Unable to connect to the search service. Please check your internet connection.';
    }
    
    if (message.includes('timeout')) {
      return 'Search request timed out. Please try again with a simpler query.';
    }
    
    if (message.includes('rate limit')) {
      return 'Too many search requests. Please wait a moment before trying again.';
    }
    
    if (message.includes('syntax')) {
      return 'Invalid search syntax. Please check your query and try again.';
    }
    
    if (message.includes('permission') || message.includes('unauthorized')) {
      return 'You don\'t have permission to perform this search. Please contact your administrator.';
    }

    // Default generic message
    return 'An unexpected error occurred while searching. Please try again.';
  }

  getErrorSeverity(error: Error): 'low' | 'medium' | 'high' {
    const message = error.message;
    
    if (message.includes('Network Error') || message.includes('timeout')) {
      return 'medium';
    }
    
    if (message.includes('permission') || message.includes('unauthorized')) {
      return 'high';
    }
    
    if (message.includes('rate limit')) {
      return 'low';
    }
    
    return 'medium';
  }

  renderErrorFallback() {
    const { 
      showRetry = true, 
      showDetails = true, 
      title = 'Search Error' 
    } = this.props;
    
    const { error, errorInfo, showDetails: detailsVisible, retryCount } = this.state;
    
    if (!error) return null;

    const userMessage = this.getErrorMessage(error);
    const severity = this.getErrorSeverity(error);
    
    // Style based on severity
    const severityStyles = {
      low: {
        bg: 'bg-yellow-50',
        border: 'border-yellow-200',
        icon: 'text-yellow-400',
        title: 'text-yellow-800',
        text: 'text-yellow-700',
        button: 'bg-yellow-100 hover:bg-yellow-200 text-yellow-800',
      },
      medium: {
        bg: 'bg-orange-50',
        border: 'border-orange-200',
        icon: 'text-orange-400',
        title: 'text-orange-800',
        text: 'text-orange-700',
        button: 'bg-orange-100 hover:bg-orange-200 text-orange-800',
      },
      high: {
        bg: 'bg-red-50',
        border: 'border-red-200',
        icon: 'text-red-400',
        title: 'text-red-800',
        text: 'text-red-700',
        button: 'bg-red-100 hover:bg-red-200 text-red-800',
      },
    };

    const styles = severityStyles[severity];

    return (
      <div className={`rounded-lg border p-6 ${styles.bg} ${styles.border}`}>
        <div className="flex items-start space-x-3">
          <ExclamationTriangleIcon className={`h-6 w-6 ${styles.icon} flex-shrink-0 mt-0.5`} />
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-2">
              <h3 className={`text-sm font-semibold ${styles.title}`}>
                {title}
              </h3>
            </div>
            
            <p className={`text-sm ${styles.text} mb-4`}>
              {userMessage}
            </p>

            {/* Action Buttons */}
            <div className="flex items-center space-x-3">
              {showRetry && (
                <button
                  onClick={retryCount < 3 ? this.handleRetry : this.handleDelayedRetry}
                  className={`inline-flex items-center px-3 py-2 text-sm font-medium rounded-md ${styles.button} transition-colors`}
                  disabled={retryCount >= 3}
                >
                  <ArrowPathIcon className="h-4 w-4 mr-1.5" />
                  {retryCount >= 3 ? 'Retry in 1s...' : 'Try Again'}
                </button>
              )}

              {showDetails && (
                <button
                  onClick={this.toggleDetails}
                  className={`inline-flex items-center px-3 py-2 text-sm font-medium rounded-md ${styles.button} transition-colors`}
                >
                  <InformationCircleIcon className="h-4 w-4 mr-1.5" />
                  {detailsVisible ? 'Hide Details' : 'Show Details'}
                </button>
              )}
            </div>

            {/* Error Details */}
            {detailsVisible && showDetails && (
              <div className="mt-4 p-3 bg-white bg-opacity-50 rounded border">
                <details className="text-xs">
                  <summary className={`cursor-pointer font-medium ${styles.text} mb-2`}>
                    Technical Details
                  </summary>
                  <div className="space-y-2">
                    <div>
                      <span className="font-semibold">Error:</span>
                      <pre className="mt-1 text-xs bg-gray-100 p-2 rounded overflow-auto">
                        {error.name}: {error.message}
                      </pre>
                    </div>
                    
                    {error.stack && (
                      <div>
                        <span className="font-semibold">Stack Trace:</span>
                        <pre className="mt-1 text-xs bg-gray-100 p-2 rounded overflow-auto max-h-32">
                          {error.stack}
                        </pre>
                      </div>
                    )}
                    
                    {errorInfo?.componentStack && (
                      <div>
                        <span className="font-semibold">Component Stack:</span>
                        <pre className="mt-1 text-xs bg-gray-100 p-2 rounded overflow-auto max-h-32">
                          {errorInfo.componentStack}
                        </pre>
                      </div>
                    )}
                    
                    <div className="text-xs text-gray-500 mt-2">
                      Retry Count: {retryCount}
                    </div>
                  </div>
                </details>
              </div>
            )}

            {/* Recovery Tips */}
            <div className="mt-4 text-xs">
              <p className={`${styles.text} font-medium mb-1`}>
                Suggestions:
              </p>
              <ul className={`${styles.text} space-y-1 ml-4 list-disc`}>
                {severity === 'low' && (
                  <>
                    <li>Wait a moment before trying again</li>
                    <li>Simplify your search query</li>
                  </>
                )}
                {severity === 'medium' && (
                  <>
                    <li>Check your internet connection</li>
                    <li>Refresh the page and try again</li>
                    <li>Try a different search query</li>
                  </>
                )}
                {severity === 'high' && (
                  <>
                    <li>Contact your system administrator</li>
                    <li>Check if you have the necessary permissions</li>
                  </>
                )}
              </ul>
            </div>
          </div>
        </div>
      </div>
    );
  }

  render() {
    if (this.state.hasError) {
      // Return custom fallback UI or default error UI
      return this.props.fallback || this.renderErrorFallback();
    }

    return this.props.children;
  }
}

export default SearchErrorBoundary;