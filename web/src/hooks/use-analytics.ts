import { useCallback, useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';
import type { 
  DashboardMetrics, 
  AnalyticsQuery, 
  TrackEventRequest,
  TimeSeriesData,
  ProductivityInsight 
} from '@mcp-tools/core';

/**
 * Hook for tracking analytics events
 */
export function useAnalytics() {
  const sessionId = useRef(crypto.randomUUID());
  const { toast } = useToast();

  // Track individual event
  const trackEvent = useMutation({
    mutationFn: async (event: TrackEventRequest) => {
      return apiClient.post('/api/v1/analytics/events', event, {
        headers: {
          'x-session-id': sessionId.current
        }
      });
    },
    onError: (error) => {
      console.error('Failed to track event:', error);
      // Don't show user-facing errors for analytics failures
    }
  });

  // Track multiple events in batch
  const trackEventBatch = useMutation({
    mutationFn: async (events: TrackEventRequest[]) => {
      return apiClient.post('/api/v1/analytics/events/batch', { events }, {
        headers: {
          'x-session-id': sessionId.current
        }
      });
    },
    onError: (error) => {
      console.error('Failed to track event batch:', error);
    }
  });

  // Track performance metric
  const trackPerformance = useCallback((
    metricType: string,
    endpoint: string,
    responseTime: number,
    statusCode?: number,
    metadata?: Record<string, any>
  ) => {
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - responseTime);
    
    apiClient.post('/api/v1/analytics/performance', {
      metricType,
      endpoint,
      responseTimeMs: responseTime,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      statusCode,
      metadata
    }, {
      headers: {
        'x-session-id': sessionId.current
      }
    }).catch(error => {
      console.error('Failed to track performance:', error);
    });
  }, []);

  // Convenience methods for common events
  const track = {
    pageView: useCallback((page: string, properties?: Record<string, any>) => {
      trackEvent.mutate({
        eventType: 'page_view',
        eventCategory: 'dashboard',
        eventAction: 'view',
        eventLabel: page,
        properties: {
          page,
          timestamp: new Date().toISOString(),
          ...properties
        }
      });
    }, [trackEvent]),

    featureUse: useCallback((
      category: 'kanban' | 'wiki' | 'memory' | 'auth' | 'dashboard' | 'system',
      action: string,
      label?: string,
      properties?: Record<string, any>
    ) => {
      trackEvent.mutate({
        eventType: 'feature_use',
        eventCategory: category,
        eventAction: action,
        eventLabel: label,
        properties: {
          timestamp: new Date().toISOString(),
          ...properties
        }
      });
    }, [trackEvent]),

    userAction: useCallback((
      category: 'kanban' | 'wiki' | 'memory' | 'auth' | 'dashboard' | 'system',
      action: string,
      resourceId?: string,
      properties?: Record<string, any>
    ) => {
      trackEvent.mutate({
        eventType: 'action',
        eventCategory: category,
        eventAction: action,
        properties: {
          resourceId,
          timestamp: new Date().toISOString(),
          ...properties
        }
      });
    }, [trackEvent]),

    error: useCallback((error: Error, context?: string) => {
      trackEvent.mutate({
        eventType: 'error',
        eventCategory: 'system',
        eventAction: 'error_occurred',
        eventLabel: error.message,
        properties: {
          errorName: error.name,
          errorMessage: error.message,
          errorStack: error.stack?.substring(0, 500),
          context,
          timestamp: new Date().toISOString()
        }
      });
    }, [trackEvent])
  };

  return {
    trackEvent: trackEvent.mutate,
    trackEventBatch: trackEventBatch.mutate,
    trackPerformance,
    track,
    sessionId: sessionId.current
  };
}

/**
 * Hook for analytics dashboard data
 */
export function useAnalyticsDashboard(timeRange: string = 'week') {
  return useQuery({
    queryKey: ['analytics', 'dashboard', timeRange],
    queryFn: async (): Promise<DashboardMetrics> => {
      const response = await apiClient.get(`/api/v1/analytics/dashboard?timeRange=${timeRange}`);
      return response.data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 2,
    retryDelay: 1000
  });
}

/**
 * Hook for time series analytics data
 */
export function useTimeSeriesData(query: AnalyticsQuery) {
  return useQuery({
    queryKey: ['analytics', 'timeseries', query],
    queryFn: async (): Promise<TimeSeriesData[]> => {
      const params = new URLSearchParams();
      Object.entries(query).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          params.append(key, value.toString());
        }
      });
      
      const response = await apiClient.get(`/api/v1/analytics/timeseries?${params}`);
      return response.data;
    },
    enabled: !!query,
    staleTime: 2 * 60 * 1000, // 2 minutes
    retry: 2
  });
}

/**
 * Hook for productivity insights
 */
export function useProductivityInsights() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const insights = useQuery({
    queryKey: ['analytics', 'insights'],
    queryFn: async (): Promise<ProductivityInsight[]> => {
      const response = await apiClient.get('/api/v1/analytics/insights');
      return response.data;
    },
    staleTime: 10 * 60 * 1000, // 10 minutes
    retry: 2
  });

  const generateInsights = useMutation({
    mutationFn: async () => {
      const response = await apiClient.post('/api/v1/analytics/insights/generate');
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['analytics', 'insights'] });
      toast({
        title: 'Insights Generated',
        description: `Generated ${data.length} new productivity insights`,
        variant: 'default'
      });
    },
    onError: (error) => {
      toast({
        title: 'Failed to Generate Insights',
        description: 'Please try again later',
        variant: 'destructive'
      });
    }
  });

  const markAsRead = useMutation({
    mutationFn: async (insightId: string) => {
      return apiClient.put(`/api/v1/analytics/insights/${insightId}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['analytics', 'insights'] });
    },
    onError: (error) => {
      console.error('Failed to mark insight as read:', error);
    }
  });

  return {
    insights: insights.data || [],
    isLoading: insights.isLoading,
    error: insights.error,
    refetch: insights.refetch,
    generateInsights: generateInsights.mutate,
    isGenerating: generateInsights.isPending,
    markAsRead: markAsRead.mutate
  };
}

/**
 * Hook for performance metrics
 */
export function usePerformanceMetrics(timeRange: string = 'day', metricType?: string) {
  return useQuery({
    queryKey: ['analytics', 'performance', timeRange, metricType],
    queryFn: async () => {
      const params = new URLSearchParams({ timeRange });
      if (metricType) params.append('metricType', metricType);
      
      const response = await apiClient.get(`/api/v1/analytics/metrics/performance?${params}`);
      return response.data;
    },
    staleTime: 1 * 60 * 1000, // 1 minute
    retry: 2
  });
}

/**
 * Hook to automatically track page views
 */
export function usePageTracking(pageName: string, properties?: Record<string, any>) {
  const { track } = useAnalytics();
  
  useEffect(() => {
    const startTime = Date.now();
    
    // Delay tracking to prevent synchronous suspension during initial render
    const timeoutId = setTimeout(() => {
      try {
        track.pageView(pageName, properties);
      } catch (error) {
        console.error('Failed to track page view:', error);
      }
    }, 50);
    
    // Track page unload
    return () => {
      clearTimeout(timeoutId);
      try {
        const timeSpent = Date.now() - startTime;
        track.featureUse('dashboard', 'page_unload', pageName, {
          timeSpent,
          ...properties
        });
      } catch (error) {
        console.error('Failed to track page unload:', error);
      }
    };
  }, [pageName, track, properties]);
}

/**
 * Hook to track user interactions automatically
 */
export function useInteractionTracking() {
  const { track } = useAnalytics();
  
  const trackClick = useCallback((
    element: string,
    category: 'kanban' | 'wiki' | 'memory' | 'auth' | 'dashboard' | 'system' = 'dashboard',
    properties?: Record<string, any>
  ) => {
    track.featureUse(category, 'click', element, {
      element,
      ...properties
    });
  }, [track]);
  
  const trackFormSubmit = useCallback((
    formName: string,
    category: 'kanban' | 'wiki' | 'memory' | 'auth' | 'dashboard' | 'system',
    success: boolean,
    properties?: Record<string, any>
  ) => {
    track.userAction(category, success ? 'form_submit_success' : 'form_submit_failure', formName, {
      formName,
      success,
      ...properties
    });
  }, [track]);
  
  const trackSearch = useCallback((
    query: string,
    category: 'wiki' | 'memory' | 'kanban' | 'dashboard' = 'dashboard',
    resultCount?: number,
    properties?: Record<string, any>
  ) => {
    track.userAction(category, 'search', query, {
      query,
      resultCount,
      queryLength: query.length,
      ...properties
    });
  }, [track]);
  
  return {
    trackClick,
    trackFormSubmit,
    trackSearch
  };
}

export default useAnalytics;