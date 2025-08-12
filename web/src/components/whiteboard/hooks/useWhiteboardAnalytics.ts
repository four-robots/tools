import { useState, useEffect, useCallback, useRef } from 'react';
import { useWebSocket } from '@/hooks/useWebSocket';

// Types matching the backend analytics service
export interface WhiteboardAnalyticsData {
  summary: {
    totalUsers: number;
    totalSessions: number;
    avgEngagement: number;
    performanceScore: number;
  };
  trends: {
    userGrowth: number;
    engagementTrend: number;
    performanceTrend: number;
  };
  metrics: Array<{
    id: string;
    whiteboardId: string;
    metricDate: string;
    totalSessions: number;
    uniqueUsers: number;
    totalDurationMinutes: number;
    avgSessionDuration: number;
    totalActions: number;
    elementsCreated: number;
    elementsModified: number;
    elementsDeleted: number;
    commentsCreated: number;
    concurrentUsersPeak: number;
    collaborationEvents: number;
    conflictResolutions: number;
    templateApplications: number;
    errorRate: number;
    toolUsageStats: Record<string, number>;
    activityPatterns: Record<string, number>;
  }>;
  sessions: Array<{
    id: string;
    sessionId: string;
    whiteboardId: string;
    userId: string;
    sessionStart: string;
    sessionEnd?: string;
    durationMinutes?: number;
    totalActions: number;
    elementsCreated: number;
    elementsModified: number;
    elementsDeleted: number;
    commentsCreated: number;
    toolsUsed: string[];
    collaborationScore: number;
    errorCount: number;
    disconnectReason?: string;
  }>;
  insights: Array<{
    id: string;
    whiteboardId: string;
    insightType: string;
    insightCategory: 'positive' | 'warning' | 'critical' | 'information';
    title: string;
    description: string;
    severityScore: number;
    confidenceScore: number;
    recommendations: string[];
    timePeriod: { start: string; end: string };
    isActive: boolean;
    createdAt: string;
  }>;
  userBehavior: Array<{
    id: string;
    userId: string;
    whiteboardId: string;
    date: string;
    sessionCount: number;
    totalTimeMinutes: number;
    preferredTools: string[];
    collaborationStyle?: 'individual' | 'collaborative' | 'leader' | 'follower';
    engagementScore: number;
    productivityScore: number;
  }>;
  performance: Array<{
    id: string;
    whiteboardId: string;
    metricType: string;
    metricValue: number;
    metricUnit: string;
    thresholdValue?: number;
    isAboveThreshold: boolean;
    recordedAt: string;
  }>;
  total: number;
}

export interface AnalyticsFilters {
  startDate?: string;
  endDate?: string;
  userId?: string;
  eventType?: string;
  metricType?: string;
  insightType?: string;
}

export interface AnalyticsReport {
  summary: {
    totalUsers: number;
    totalSessions: number;
    avgEngagement: number;
    performanceScore: number;
  };
  trends: {
    userGrowth: number;
    engagementTrend: number;
    performanceTrend: number;
  };
  insights: WhiteboardAnalyticsData['insights'];
  recommendations: string[];
}

/**
 * Hook for fetching and managing whiteboard analytics data
 */
export function useWhiteboardAnalytics(
  whiteboardId: string,
  timeRange: string = 'week',
  filters?: AnalyticsFilters
) {
  const [data, setData] = useState<WhiteboardAnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);

  const fetchAnalytics = useCallback(async () => {
    if (!whiteboardId) return;

    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        timeRange,
        ...(filters?.startDate && { startDate: filters.startDate }),
        ...(filters?.endDate && { endDate: filters.endDate }),
        ...(filters?.userId && { userId: filters.userId }),
        ...(filters?.eventType && { eventType: filters.eventType }),
        ...(filters?.metricType && { metricType: filters.metricType }),
        ...(filters?.insightType && { insightType: filters.insightType }),
      });

      const response = await fetch(`/api/whiteboard/${whiteboardId}/analytics?${params}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch analytics: ${response.statusText}`);
      }

      const analyticsData = await response.json();
      setData(analyticsData);
      setLastFetch(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch analytics');
      console.error('Analytics fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [whiteboardId, timeRange, filters]);

  // Initial fetch
  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  return {
    data,
    isLoading,
    error,
    refetch: fetchAnalytics,
    lastFetch,
  };
}

/**
 * Hook for generating and managing analytics reports
 */
export function useAnalyticsReport(whiteboardId: string) {
  const [report, setReport] = useState<AnalyticsReport | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateReport = useCallback(async (timePeriod: { start: string; end: string }) => {
    if (!whiteboardId) return;

    setIsGenerating(true);
    setError(null);

    try {
      const response = await fetch(`/api/whiteboard/${whiteboardId}/analytics/report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ timePeriod }),
      });

      if (!response.ok) {
        throw new Error(`Failed to generate report: ${response.statusText}`);
      }

      const reportData = await response.json();
      setReport(reportData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate report');
      console.error('Report generation error:', err);
    } finally {
      setIsGenerating(false);
    }
  }, [whiteboardId]);

  return {
    report,
    isGenerating,
    error,
    generateReport,
  };
}

/**
 * Hook for real-time analytics updates via WebSocket
 */
export function useRealTimeAnalytics(whiteboardId: string, enabled: boolean = true) {
  const [realTimeData, setRealTimeData] = useState<{
    activeUsers: number;
    currentSessions: number;
    recentEvents: Array<{
      type: string;
      action: string;
      userId: string;
      timestamp: string;
      metadata?: Record<string, unknown>;
    }>;
    performanceMetrics: Array<{
      type: string;
      value: number;
      unit: string;
      timestamp: string;
    }>;
  } | null>(null);

  const socket = useWebSocket({
    enabled: enabled && !!whiteboardId,
    reconnect: true,
  });

  const eventBuffer = useRef<Array<any>>([]);
  const bufferFlushInterval = useRef<NodeJS.Timeout | null>(null);

  // Buffer and batch analytics events to prevent overwhelming the UI
  const flushEventBuffer = useCallback(() => {
    if (eventBuffer.current.length === 0) return;

    const events = [...eventBuffer.current];
    eventBuffer.current = [];

    // Process events and update real-time data
    setRealTimeData(prevData => {
      if (!prevData) return prevData;

      const newEvents = events.filter(event => event.type === 'analytics_event');
      const newMetrics = events.filter(event => event.type === 'performance_metric');

      return {
        ...prevData,
        recentEvents: [
          ...newEvents.map(event => ({
            type: event.data.eventType,
            action: event.data.action,
            userId: event.data.userId,
            timestamp: event.data.timestamp,
            metadata: event.data.metadata,
          })),
          ...prevData.recentEvents,
        ].slice(0, 20), // Keep only last 20 events
        performanceMetrics: [
          ...newMetrics.map(metric => ({
            type: metric.data.metricType,
            value: metric.data.metricValue,
            unit: metric.data.metricUnit,
            timestamp: metric.data.recordedAt,
          })),
          ...prevData.performanceMetrics,
        ].slice(0, 50), // Keep only last 50 metrics
      };
    });
  }, []);

  // Set up event buffer flushing
  useEffect(() => {
    if (enabled) {
      bufferFlushInterval.current = setInterval(flushEventBuffer, 1000); // Flush every second
      return () => {
        if (bufferFlushInterval.current) {
          clearInterval(bufferFlushInterval.current);
        }
      };
    }
  }, [enabled, flushEventBuffer]);

  // WebSocket event handlers
  useEffect(() => {
    if (!socket || !enabled) return;

    // Join analytics room for the whiteboard
    socket.emit('whiteboard:join_analytics', { whiteboardId });

    // Handle real-time analytics events
    const handleAnalyticsUpdate = (data: any) => {
      eventBuffer.current.push({ type: 'analytics_event', data });
    };

    const handlePerformanceMetric = (data: any) => {
      eventBuffer.current.push({ type: 'performance_metric', data });
    };

    const handleSessionUpdate = (data: any) => {
      setRealTimeData(prevData => ({
        ...prevData,
        activeUsers: data.activeUsers,
        currentSessions: data.currentSessions,
        recentEvents: prevData?.recentEvents || [],
        performanceMetrics: prevData?.performanceMetrics || [],
      }));
    };

    socket.on('analytics:event', handleAnalyticsUpdate);
    socket.on('analytics:performance', handlePerformanceMetric);
    socket.on('analytics:session_update', handleSessionUpdate);

    // Cleanup
    return () => {
      socket.off('analytics:event', handleAnalyticsUpdate);
      socket.off('analytics:performance', handlePerformanceMetric);
      socket.off('analytics:session_update', handleSessionUpdate);
      socket.emit('whiteboard:leave_analytics', { whiteboardId });
    };
  }, [socket, whiteboardId, enabled]);

  return realTimeData;
}

/**
 * Hook for tracking analytics events from the frontend
 */
export function useAnalyticsTracking(whiteboardId: string) {
  const socket = useWebSocket({ enabled: !!whiteboardId });

  const trackEvent = useCallback((
    eventType: string,
    action: string,
    targetType: string,
    options?: {
      targetId?: string;
      coordinates?: { x: number; y: number };
      elementType?: string;
      toolType?: string;
      metadata?: Record<string, unknown>;
    }
  ) => {
    if (!socket || !whiteboardId) return;

    socket.emit('analytics:track_event', {
      whiteboardId,
      eventType,
      action,
      targetType,
      ...options,
      timestamp: new Date().toISOString(),
    });
  }, [socket, whiteboardId]);

  const trackPerformance = useCallback((
    metricType: string,
    value: number,
    unit: string,
    threshold?: number
  ) => {
    if (!socket || !whiteboardId) return;

    socket.emit('analytics:track_performance', {
      whiteboardId,
      metricType,
      value,
      unit,
      threshold,
      timestamp: new Date().toISOString(),
    });
  }, [socket, whiteboardId]);

  const trackUserAction = useCallback((
    action: string,
    targetType: string,
    options?: {
      targetId?: string;
      coordinates?: { x: number; y: number };
      elementType?: string;
      toolType?: string;
      metadata?: Record<string, unknown>;
    }
  ) => {
    trackEvent('user_action', action, targetType, options);
  }, [trackEvent]);

  const trackCollaboration = useCallback((
    action: string,
    targetType: string,
    options?: {
      targetId?: string;
      collaboratorIds?: string[];
      conflictResolved?: boolean;
      metadata?: Record<string, unknown>;
    }
  ) => {
    trackEvent('collaboration', action, targetType, options);
  }, [trackEvent]);

  return {
    trackEvent,
    trackPerformance,
    trackUserAction,
    trackCollaboration,
  };
}

/**
 * Hook for performance monitoring
 */
export function usePerformanceMonitoring(whiteboardId: string) {
  const { trackPerformance } = useAnalyticsTracking(whiteboardId);
  const performanceObserver = useRef<PerformanceObserver | null>(null);

  const startPerformanceTracking = useCallback(() => {
    if (typeof window === 'undefined' || !('PerformanceObserver' in window)) return;

    try {
      performanceObserver.current = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          // Track navigation timing
          if (entry.entryType === 'navigation') {
            const navEntry = entry as PerformanceNavigationTiming;
            trackPerformance('load_time', navEntry.loadEventEnd - navEntry.fetchStart, 'ms', 3000);
          }

          // Track resource loading
          if (entry.entryType === 'resource') {
            const resourceEntry = entry as PerformanceResourceTiming;
            if (resourceEntry.name.includes('whiteboard') || resourceEntry.name.includes('canvas')) {
              trackPerformance('resource_load_time', resourceEntry.duration, 'ms', 1000);
            }
          }

          // Track user timing measures
          if (entry.entryType === 'measure') {
            trackPerformance('user_timing', entry.duration, 'ms');
          }
        });
      });

      performanceObserver.current.observe({ entryTypes: ['navigation', 'resource', 'measure'] });
    } catch (error) {
      console.warn('Performance monitoring not supported:', error);
    }
  }, [trackPerformance]);

  const measureOperation = useCallback((name: string, operation: () => void | Promise<void>) => {
    const startMark = `${name}-start`;
    const endMark = `${name}-end`;
    const measureName = `${name}-duration`;

    performance.mark(startMark);
    
    const handleEnd = () => {
      performance.mark(endMark);
      performance.measure(measureName, startMark, endMark);
      
      const measure = performance.getEntriesByName(measureName)[0];
      if (measure) {
        trackPerformance(name, measure.duration, 'ms');
      }
      
      // Clean up marks
      performance.clearMarks(startMark);
      performance.clearMarks(endMark);
      performance.clearMeasures(measureName);
    };

    try {
      const result = operation();
      if (result instanceof Promise) {
        return result.finally(handleEnd);
      } else {
        handleEnd();
        return result;
      }
    } catch (error) {
      handleEnd();
      throw error;
    }
  }, [trackPerformance]);

  const stopPerformanceTracking = useCallback(() => {
    if (performanceObserver.current) {
      performanceObserver.current.disconnect();
      performanceObserver.current = null;
    }
  }, []);

  // Auto-start performance tracking
  useEffect(() => {
    startPerformanceTracking();
    return stopPerformanceTracking;
  }, [startPerformanceTracking, stopPerformanceTracking]);

  return {
    measureOperation,
    startPerformanceTracking,
    stopPerformanceTracking,
  };
}

export default useWhiteboardAnalytics;