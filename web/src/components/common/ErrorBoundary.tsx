/**
 * Enhanced Error Boundary Component
 * 
 * Provides comprehensive error handling for React components with:
 * - Graceful error recovery
 * - Error reporting and logging
 * - Development vs production error displays
 * - Retry functionality
 * - Error context preservation
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  isolate?: boolean; // Prevent error propagation to parent
  retryable?: boolean; // Allow user to retry
  level?: 'page' | 'section' | 'component'; // Error boundary level
  context?: string; // Additional context for error reporting
  className?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  retryCount: number;
  errorId: string;
  timestamp: number;
}

const MAX_RETRY_COUNT = 3;
const RETRY_DELAY = 1000; // 1 second

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  private retryTimeout: NodeJS.Timeout | null = null;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: 0,
      errorId: '',
      timestamp: 0,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    // Generate unique error ID for tracking
    const errorId = `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    return {
      hasError: true,
      error,
      errorId,
      timestamp: Date.now(),
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const { onError, context, level = 'component' } = this.props;
    
    // Update state with error info
    this.setState({ errorInfo });

    // Enhanced error logging
    const enhancedError = {
      ...error,
      errorBoundaryLevel: level,
      errorBoundaryContext: context,
      componentStack: errorInfo.componentStack,
      errorStack: error.stack,
      userAgent: navigator.userAgent,
      url: window.location.href,
      timestamp: new Date().toISOString(),
      errorId: this.state.errorId,
      retryCount: this.state.retryCount,
    };

    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.group(`🚨 Error Boundary Caught Error [${level}]`);
      console.error('Error:', error);
      console.error('Error Info:', errorInfo);
      console.error('Enhanced Error:', enhancedError);
      console.groupEnd();
    }

    // Report error to monitoring service
    this.reportError(enhancedError, errorInfo);

    // Call custom error handler
    if (onError) {
      try {
        onError(error, errorInfo);
      } catch (handlerError) {
        console.error('Error in custom error handler:', handlerError);
      }
    }

    // Prevent error propagation if isolate is true
    if (this.props.isolate) {
      return;
    }
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps, prevState: ErrorBoundaryState) {
    // Reset error state if children prop changes (new content to render)
    if (this.state.hasError && prevProps.children !== this.props.children) {
      this.setState({
        hasError: false,
        error: null,
        errorInfo: null,
        retryCount: 0,
        errorId: '',
        timestamp: 0,
      });
    }
  }

  componentWillUnmount() {
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
    }
  }

  private reportError = async (error: any, errorInfo: ErrorInfo) => {
    try {
      // Report to error monitoring service (e.g., Sentry, LogRocket, etc.)
      if (window.analytics?.track) {
        window.analytics.track('Error Boundary Triggered', {
          errorId: this.state.errorId,
          errorMessage: error.message,
          errorStack: error.stack,
          componentStack: errorInfo.componentStack,
          level: this.props.level,
          context: this.props.context,
          retryCount: this.state.retryCount,
          userAgent: navigator.userAgent,
          url: window.location.href,
        });
      }

      // Send to logging endpoint
      if (process.env.NODE_ENV === 'production') {
        fetch('/api/errors', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            errorId: this.state.errorId,
            message: error.message,
            stack: error.stack,
            componentStack: errorInfo.componentStack,
            level: this.props.level,
            context: this.props.context,
            retryCount: this.state.retryCount,
            timestamp: this.state.timestamp,
            userAgent: navigator.userAgent,
            url: window.location.href,
          }),
        }).catch(reportError => {
          console.error('Failed to report error:', reportError);
        });
      }
    } catch (reportError) {
      console.error('Error reporting failed:', reportError);
    }
  };

  private handleRetry = () => {
    const { retryCount } = this.state;
    
    if (retryCount >= MAX_RETRY_COUNT) {
      return;
    }

    this.setState(prevState => ({
      retryCount: prevState.retryCount + 1,
    }));

    // Add delay before retry to prevent rapid retries
    this.retryTimeout = setTimeout(() => {
      this.setState({
        hasError: false,
        error: null,
        errorInfo: null,
      });
    }, RETRY_DELAY);
  };

  private handleReload = () => {
    window.location.reload();
  };

  private renderErrorFallback = () => {
    const { level = 'component', context, retryable = true } = this.props;
    const { error, retryCount, errorId } = this.state;
    
    const isDevelopment = process.env.NODE_ENV === 'development';
    const canRetry = retryable && retryCount < MAX_RETRY_COUNT;

    // Custom fallback if provided
    if (this.props.fallback) {
      return this.props.fallback;
    }

    // Level-specific error displays
    switch (level) {
      case 'page':
        return (
          <div className="error-boundary-page min-h-screen flex items-center justify-center bg-gray-50">
            <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6">
              <div className="flex items-center mb-4">
                <div className="flex-shrink-0">
                  <svg className="h-8 w-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-lg font-medium text-gray-900">Something went wrong</h3>
                  <p className="text-sm text-gray-500">
                    We're sorry, but something unexpected happened.
                  </p>
                </div>
              </div>
              
              {isDevelopment && error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm">
                  <p className="font-mono text-red-800">{error.message}</p>
                  {error.stack && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-red-600">Stack trace</summary>
                      <pre className="mt-1 text-xs text-red-700 whitespace-pre-wrap">{error.stack}</pre>
                    </details>
                  )}
                </div>
              )}
              
              <div className="flex space-x-3">
                <button
                  onClick={this.handleReload}
                  className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  Reload Page
                </button>
                {canRetry && (
                  <button
                    onClick={this.handleRetry}
                    className="flex-1 bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500"
                  >
                    Try Again ({MAX_RETRY_COUNT - retryCount} left)
                  </button>
                )}
              </div>
              
              {isDevelopment && (
                <div className="mt-4 text-xs text-gray-500">
                  <p>Error ID: {errorId}</p>
                  <p>Context: {context || 'Unknown'}</p>
                  <p>Retry Count: {retryCount}</p>
                </div>
              )}
            </div>
          </div>
        );

      case 'section':
        return (
          <div className="error-boundary-section bg-red-50 border border-red-200 rounded-lg p-4 m-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="ml-3 flex-1">
                <h3 className="text-sm font-medium text-red-800">
                  This section encountered an error
                </h3>
                <div className="mt-2 text-sm text-red-700">
                  <p>Unable to load this content. {canRetry && 'You can try again or reload the page.'}</p>
                </div>
                {(canRetry || isDevelopment) && (
                  <div className="mt-3 flex space-x-2">
                    {canRetry && (
                      <button
                        onClick={this.handleRetry}
                        className="text-sm bg-red-100 text-red-800 px-3 py-1 rounded hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-red-500"
                      >
                        Try Again
                      </button>
                    )}
                    {isDevelopment && error && (
                      <details className="text-xs">
                        <summary className="cursor-pointer text-red-600">Error details</summary>
                        <pre className="mt-1 text-red-700 whitespace-pre-wrap">{error.message}</pre>
                      </details>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        );

      default: // component level
        return (
          <div className="error-boundary-component bg-yellow-50 border border-yellow-200 rounded p-3 m-2">
            <div className="flex items-center">
              <svg className="h-4 w-4 text-yellow-600 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm text-yellow-800">
                Component error
                {canRetry && (
                  <button
                    onClick={this.handleRetry}
                    className="ml-2 text-yellow-600 underline hover:text-yellow-800"
                  >
                    retry
                  </button>
                )}
              </span>
            </div>
            {isDevelopment && error && (
              <details className="mt-2 text-xs text-yellow-700">
                <summary className="cursor-pointer">Details</summary>
                <pre className="mt-1 whitespace-pre-wrap">{error.message}</pre>
              </details>
            )}
          </div>
        );
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className={this.props.className}>
          {this.renderErrorFallback()}
        </div>
      );
    }

    return this.props.children;
  }
}

// Higher-order component for wrapping components with error boundaries
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  errorBoundaryProps?: Omit<ErrorBoundaryProps, 'children'>
) {
  const WrappedComponent = (props: P) => (
    <ErrorBoundary {...errorBoundaryProps}>
      <Component {...props} />
    </ErrorBoundary>
  );

  WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name})`;
  
  return WrappedComponent;
}

// Hook for throwing errors in functional components
export function useErrorHandler() {
  return (error: Error, errorInfo?: { componentStack?: string }) => {
    // This will be caught by the nearest error boundary
    throw error;
  };
}

export default ErrorBoundary;