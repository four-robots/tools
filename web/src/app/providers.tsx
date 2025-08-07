'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { RealtimeProvider } from '@/components/realtime/realtime-provider';

// Create a client instance
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 10, // 10 minutes
      retry: (failureCount, error: any) => {
        // Don't retry on 4xx errors (client errors)
        if (error?.response?.status >= 400 && error?.response?.status < 500) {
          return false;
        }
        // Retry up to 3 times for other errors
        return failureCount < 3;
      },
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
    mutations: {
      retry: false,
    },
  },
});

interface ProvidersProps {
  children: React.ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  const pathname = usePathname();
  
  // Only enable real-time connections on app pages, not on landing/marketing pages
  const needsRealtime = pathname !== '/' && 
                       !pathname.startsWith('/auth') && 
                       !pathname.startsWith('/privacy') && 
                       !pathname.startsWith('/terms') && 
                       !pathname.startsWith('/support') &&
                       !pathname.startsWith('/demo');

  return (
    <QueryClientProvider client={queryClient}>
      {needsRealtime ? (
        <RealtimeProvider>
          {children}
          <Toaster />
        </RealtimeProvider>
      ) : (
        <>
          {children}
          <Toaster />
        </>
      )}
    </QueryClientProvider>
  );
}