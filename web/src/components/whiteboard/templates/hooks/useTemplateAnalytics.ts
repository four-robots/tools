import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useWebSocket } from '@/hooks/useWebSocket';

interface TemplateAnalytics {
  templateId: string;
  totalUsage: number;
  uniqueUsers: number;
  workspaceUsage: number;
  averageRating: number;
  ratingCount: number;
  period: {
    start: string;
    end: string;
  };
  usageTimeline: Array<{
    date: string;
    count: number;
  }>;
  topWorkspaces: Array<{
    workspaceId: string;
    workspaceName: string;
    usageCount: number;
  }>;
}

interface TemplateUsageEvent {
  templateId: string;
  whiteboardId: string;
  userId: string;
  workspaceId: string;
  eventType: 'applied' | 'viewed' | 'searched' | 'favorited';
  metadata?: Record<string, any>;
}

interface UseTemplateAnalyticsReturn {
  analytics: TemplateAnalytics | null;
  loading: boolean;
  error: Error | null;
  trackUsage: (event: TemplateUsageEvent) => Promise<void>;
  refreshAnalytics: () => Promise<void>;
  updatePeriod: (start: string, end: string) => void;
}

export function useTemplateAnalytics(templateId?: string): UseTemplateAnalyticsReturn {
  const [analytics, setAnalytics] = useState<TemplateAnalytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [period, setPeriod] = useState(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 30); // Default to last 30 days
    
    return {
      start: start.toISOString(),
      end: end.toISOString(),
    };
  });

  const { user } = useAuth();
  const { socket, isConnected } = useWebSocket();

  // Fetch analytics data
  const fetchAnalytics = useCallback(async () => {
    if (!templateId || !user) return;

    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({
        periodStart: period.start,
        periodEnd: period.end,
      });

      const response = await fetch(`/api/whiteboard/templates/${templateId}/analytics?${params}`, {
        headers: {
          'Authorization': `Bearer ${user.token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch analytics: ${response.statusText}`);
      }

      const analyticsData = await response.json();
      setAnalytics(analyticsData);

    } catch (error) {
      console.error('Failed to fetch template analytics:', error);
      setError(error instanceof Error ? error : new Error('Failed to fetch analytics'));
    } finally {
      setLoading(false);
    }
  }, [templateId, user, period]);

  // Track usage event
  const trackUsage = useCallback(async (event: TemplateUsageEvent) => {
    if (!user) return;

    try {
      // Track via API
      const response = await fetch('/api/whiteboard/templates/track-usage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user.token}`,
        },
        body: JSON.stringify(event),
      });

      if (!response.ok) {
        throw new Error(`Failed to track usage: ${response.statusText}`);
      }

      // Also track via WebSocket for real-time updates
      if (socket && isConnected) {
        socket.emit('template:track_usage', event);
      }

      // Refresh analytics if tracking for the current template
      if (event.templateId === templateId) {
        await fetchAnalytics();
      }

    } catch (error) {
      console.error('Failed to track template usage:', error);
      // Don't throw - usage tracking shouldn't break user experience
    }
  }, [user, socket, isConnected, templateId, fetchAnalytics]);

  // Update analytics period
  const updatePeriod = useCallback((start: string, end: string) => {
    setPeriod({ start, end });
  }, []);

  // Refresh analytics
  const refreshAnalytics = useCallback(async () => {
    await fetchAnalytics();
  }, [fetchAnalytics]);

  // Load analytics when templateId or period changes
  useEffect(() => {
    if (templateId) {
      fetchAnalytics();
    }
  }, [templateId, fetchAnalytics]);

  // WebSocket event handlers for real-time updates
  useEffect(() => {
    if (!socket || !isConnected || !templateId) return;

    const handleAnalyticsUpdate = (data: any) => {
      if (data.templateId === templateId) {
        // Update analytics incrementally for real-time feel
        setAnalytics(prev => {
          if (!prev) return null;
          
          return {
            ...prev,
            totalUsage: prev.totalUsage + 1,
            // Update other metrics based on event type
            ...(data.eventType === 'applied' && {
              // Increment usage and possibly unique users
              uniqueUsers: data.isNewUser ? prev.uniqueUsers + 1 : prev.uniqueUsers,
            }),
          };
        });
      }
    };

    socket.on('template:analytics_updated', handleAnalyticsUpdate);

    return () => {
      socket.off('template:analytics_updated', handleAnalyticsUpdate);
    };
  }, [socket, isConnected, templateId]);

  return {
    analytics,
    loading,
    error,
    trackUsage,
    refreshAnalytics,
    updatePeriod,
  };
}

// Hook for tracking template usage events easily
export function useTemplateUsageTracking() {
  const { user } = useAuth();
  const { socket, isConnected } = useWebSocket();

  const trackTemplateViewed = useCallback(async (templateId: string, workspaceId?: string) => {
    if (!user) return;

    const event: TemplateUsageEvent = {
      templateId,
      whiteboardId: 'preview', // Special ID for preview views
      userId: user.id,
      workspaceId: workspaceId || '',
      eventType: 'viewed',
      metadata: {
        source: 'gallery',
        timestamp: new Date().toISOString(),
      },
    };

    try {
      if (socket && isConnected) {
        socket.emit('template:track_usage', event);
      } else {
        // Fallback to API call
        await fetch('/api/whiteboard/templates/track-usage', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${user.token}`,
          },
          body: JSON.stringify(event),
        });
      }
    } catch (error) {
      console.error('Failed to track template view:', error);
    }
  }, [user, socket, isConnected]);

  const trackTemplateApplied = useCallback(async (
    templateId: string, 
    whiteboardId: string, 
    workspaceId?: string,
    metadata?: Record<string, any>
  ) => {
    if (!user) return;

    const event: TemplateUsageEvent = {
      templateId,
      whiteboardId,
      userId: user.id,
      workspaceId: workspaceId || '',
      eventType: 'applied',
      metadata: {
        source: 'whiteboard',
        timestamp: new Date().toISOString(),
        ...metadata,
      },
    };

    try {
      if (socket && isConnected) {
        socket.emit('template:track_usage', event);
      } else {
        await fetch('/api/whiteboard/templates/track-usage', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${user.token}`,
          },
          body: JSON.stringify(event),
        });
      }
    } catch (error) {
      console.error('Failed to track template application:', error);
    }
  }, [user, socket, isConnected]);

  const trackTemplateFavorited = useCallback(async (templateId: string, workspaceId?: string) => {
    if (!user) return;

    const event: TemplateUsageEvent = {
      templateId,
      whiteboardId: 'favorite', // Special ID for favorite actions
      userId: user.id,
      workspaceId: workspaceId || '',
      eventType: 'favorited',
      metadata: {
        source: 'gallery',
        timestamp: new Date().toISOString(),
      },
    };

    try {
      if (socket && isConnected) {
        socket.emit('template:track_usage', event);
      } else {
        await fetch('/api/whiteboard/templates/track-usage', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${user.token}`,
          },
          body: JSON.stringify(event),
        });
      }
    } catch (error) {
      console.error('Failed to track template favorite:', error);
    }
  }, [user, socket, isConnected]);

  const trackTemplateSearched = useCallback(async (searchQuery: string, resultCount: number, workspaceId?: string) => {
    if (!user) return;

    // For search events, we don't track a specific template ID
    const event = {
      userId: user.id,
      workspaceId: workspaceId || '',
      eventType: 'searched' as const,
      searchQuery,
      resultCount,
      metadata: {
        source: 'search',
        timestamp: new Date().toISOString(),
      },
    };

    try {
      if (socket && isConnected) {
        socket.emit('template:search_tracked', event);
      } else {
        await fetch('/api/whiteboard/templates/track-search', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${user.token}`,
          },
          body: JSON.stringify(event),
        });
      }
    } catch (error) {
      console.error('Failed to track template search:', error);
    }
  }, [user, socket, isConnected]);

  return {
    trackTemplateViewed,
    trackTemplateApplied,
    trackTemplateFavorited,
    trackTemplateSearched,
  };
}