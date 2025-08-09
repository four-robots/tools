'use client';

import React, { Suspense } from 'react';
import { ErrorBoundary, PageErrorFallback } from './ErrorBoundary';
import { Loader2 } from 'lucide-react';

interface PageWrapperProps {
  children: React.ReactNode;
  loadingFallback?: React.ReactNode;
  errorFallback?: React.ComponentType<{ error?: Error; resetError: () => void }>;
}

function DefaultLoadingFallback() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <Loader2 className="w-8 h-8 text-blue-500 mx-auto mb-4 animate-spin" />
        <p className="text-gray-600">Loading...</p>
      </div>
    </div>
  );
}

export function PageWrapper({ 
  children, 
  loadingFallback = <DefaultLoadingFallback />,
  errorFallback = PageErrorFallback
}: PageWrapperProps) {
  return (
    <ErrorBoundary fallback={errorFallback}>
      <Suspense fallback={loadingFallback}>
        {children}
      </Suspense>
    </ErrorBoundary>
  );
}