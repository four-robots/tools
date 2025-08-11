import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useApi } from './use-api';
import { useRealtime } from './use-realtime';

// Memory management configuration
const MEMORY_CONFIG = {
  MAX_EVENTS_IN_MEMORY: 1000,
  MAX_REALTIME_EVENTS: 100,
  CLEANUP_INTERVAL_MS: 30000, // 30 seconds
  CRITICAL_MEMORY_THRESHOLD: 0.8, // 80% of max
  EVENT_BATCH_SIZE: 50
};

interface MemoryStats {
  totalEvents: number;
  memoryUsageBytes: number;
  oldestEventAge: number;
  cleanupCount: number;
  lastCleanup: Date | null;
}

interface DomainEvent {
  id: string;
  eventType: string;
  timestamp: string;
  sequenceNumber: number;
  streamId: string;
  correlationId: string;
  eventData: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

interface CollaborationSession {
  sessionId: string;
  workspaceId: string;
  sessionType: 'search' | 'annotation' | 'conflict_resolution' | 'review';
  status: 'active' | 'paused' | 'ended' | 'cancelled';
  configuration: Record<string, unknown>;
  participants: SessionParticipant[];
  timeline: SessionTimelineEntry[];
  conflicts: ConflictSummary[];
  annotations: AnnotationSummary[];
  searchActivity: SearchActivitySummary;
  workflows: WorkflowSummary[];
  createdAt: string;
  updatedAt: string;
  endedAt?: string;
  duration?: number;
  metadata: {
    totalEvents: number;
    eventTypes: Record<string, number>;
    participantCount: number;
    conflictCount: number;
    resolutionCount: number;
    annotationCount: number;
  };
}

interface SessionParticipant {
  userId: string;
  role: 'owner' | 'editor' | 'viewer' | 'reviewer';
  permissions: string[];
  joinedAt: string;
  leftAt?: string;
  isActive: boolean;
  activitySummary: {
    eventsGenerated: number;
    searchQueries: number;
    annotationsCreated: number;
    conflictsResolved: number;
    lastActivity: string;
  };
}

interface SessionTimelineEntry {
  timestamp: string;
  eventType: string;
  eventId: string;
  userId?: string;
  description: string;
  impact: 'low' | 'medium' | 'high';
  details: Record<string, unknown>;
  causationChain?: string[];
}

interface ConflictSummary {
  conflictId: string;
  conflictType: string;
  contentId: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'in_progress' | 'resolved' | 'escalated' | 'cancelled';
  participants: string[];
  detectedAt: string;
  resolvedAt?: string;
  resolutionStrategy?: string;
  resolutionTime?: number;
}

interface AnnotationSummary {
  annotationId: string;
  userId: string;
  contentId: string;
  annotationType: string;
  status: 'active' | 'resolved' | 'archived' | 'deleted';
  createdAt: string;
  resolvedAt?: string;
  tags: string[];
  priority: 'low' | 'medium' | 'high';
}

interface SearchActivitySummary {
  totalQueries: number;
  uniqueQueries: number;
  averageQueryLength: number;
  mostCommonTerms: Array<{ term: string; count: number }>;
  queryEvolution: Array<{
    timestamp: string;
    query: string;
    userId: string;
    changeType: string;
  }>;
  resultsSelected: number;
  filtersApplied: number;
  facetsUsed: string[];
}

interface WorkflowSummary {
  workflowId: string;
  workflowType: string;
  status: 'active' | 'completed' | 'cancelled';
  initiatedBy: string;
  participants: string[];
  startedAt: string;
  completedAt?: string;
  tasksCompleted: number;
  finalResult?: string;
}

interface SessionState {
  sessionId: string;
  timestamp: string;
  state: CollaborationSession;
  activeParticipants: SessionParticipant[];
  currentConflicts: ConflictSummary[];
  activeAnnotations: AnnotationSummary[];
  searchState: {
    currentQuery?: string;
    activeFilters: Array<{ type: string; value: unknown }>;
    selectedFacets: Array<{ name: string; value: string }>;
  };
  workflowStates: Array<{
    workflowId: string;
    status: string;
    currentTask?: string;
  }>;
}

interface EventFilter {
  eventTypes?: string[];
  streamIds?: string[];
  userId?: string;
  workspaceId?: string;
  sessionId?: string;
}

export const useEventSourcing = (sessionId: string) => {
  const [sessionState, setSessionState] = useState<CollaborationSession | null>(null);
  const [eventHistory, setEventHistory] = useState<DomainEvent[]>([]);
  const [isReplaying, setIsReplaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [realtimeEvents, setRealtimeEvents] = useState<DomainEvent[]>([]);
  const [subscriptionId, setSubscriptionId] = useState<string | null>(null);
  const [memoryStats, setMemoryStats] = useState<MemoryStats>({
    totalEvents: 0,
    memoryUsageBytes: 0,
    oldestEventAge: 0,
    cleanupCount: 0,
    lastCleanup: null
  });
  
  const { apiCall } = useApi();
  const { socket, isConnected } = useRealtime();
  const timelineRef = useRef<SessionTimelineEntry[]>([]);
  const cleanupIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Memory management functions
  const calculateMemoryUsage = useCallback((events: DomainEvent[]): number => {
    return events.reduce((total, event) => {
      // Rough calculation of memory usage
      const eventSize = JSON.stringify(event).length * 2; // Approximate bytes (UTF-16)
      return total + eventSize;
    }, 0);
  }, []);

  const updateMemoryStats = useCallback((events: DomainEvent[]) => {
    const memoryUsage = calculateMemoryUsage(events);
    const oldestEvent = events.length > 0 ? events[0] : null;
    const oldestEventAge = oldestEvent ? 
      Date.now() - new Date(oldestEvent.timestamp).getTime() : 0;

    setMemoryStats(prev => ({
      ...prev,
      totalEvents: events.length,
      memoryUsageBytes: memoryUsage,
      oldestEventAge
    }));
  }, [calculateMemoryUsage]);

  const performMemoryCleanup = useCallback(() => {
    setEventHistory(prevEvents => {
      if (prevEvents.length <= MEMORY_CONFIG.MAX_EVENTS_IN_MEMORY) {
        return prevEvents;
      }

      // Keep only the most recent events
      const eventsToKeep = Math.floor(MEMORY_CONFIG.MAX_EVENTS_IN_MEMORY * MEMORY_CONFIG.CRITICAL_MEMORY_THRESHOLD);
      const cleanedEvents = prevEvents.slice(-eventsToKeep);
      
      console.info(`Memory cleanup: removed ${prevEvents.length - cleanedEvents.length} old events`, {
        original: prevEvents.length,
        cleaned: cleanedEvents.length,
        memoryFreed: calculateMemoryUsage(prevEvents) - calculateMemoryUsage(cleanedEvents)
      });

      // Update memory stats
      updateMemoryStats(cleanedEvents);
      
      setMemoryStats(prev => ({
        ...prev,
        cleanupCount: prev.cleanupCount + 1,
        lastCleanup: new Date()
      }));

      return cleanedEvents;
    });

    setRealtimeEvents(prevEvents => {
      if (prevEvents.length <= MEMORY_CONFIG.MAX_REALTIME_EVENTS) {
        return prevEvents;
      }
      return prevEvents.slice(-MEMORY_CONFIG.MAX_REALTIME_EVENTS);
    });

    // Clean timeline cache as well
    timelineRef.current = timelineRef.current.slice(-MEMORY_CONFIG.MAX_EVENTS_IN_MEMORY);
  }, [calculateMemoryUsage, updateMemoryStats]);

  const isMemoryPressureHigh = useMemo(() => {
    return eventHistory.length > MEMORY_CONFIG.MAX_EVENTS_IN_MEMORY * MEMORY_CONFIG.CRITICAL_MEMORY_THRESHOLD;
  }, [eventHistory.length]);

  // Optimized event addition with memory management
  const addEventsWithMemoryManagement = useCallback((newEvents: DomainEvent[]) => {
    setEventHistory(prev => {
      const combined = [...prev, ...newEvents];
      
      // Immediate cleanup if over threshold
      if (combined.length > MEMORY_CONFIG.MAX_EVENTS_IN_MEMORY) {
        const eventsToKeep = Math.floor(MEMORY_CONFIG.MAX_EVENTS_IN_MEMORY * MEMORY_CONFIG.CRITICAL_MEMORY_THRESHOLD);
        const cleaned = combined.slice(-eventsToKeep);
        updateMemoryStats(cleaned);
        return cleaned;
      }
      
      updateMemoryStats(combined);
      return combined;
    });
  }, [updateMemoryStats]);

  // Optimized realtime event addition
  const addRealtimeEventWithMemoryManagement = useCallback((newEvent: DomainEvent) => {
    setRealtimeEvents(prev => {
      const updated = [...prev.slice(-MEMORY_CONFIG.MAX_REALTIME_EVENTS + 1), newEvent];
      return updated;
    });
  }, []);

  // Reconstruct session state from events
  const reconstructSession = useCallback(async (pointInTime?: Date) => {
    if (!sessionId) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await apiCall(`/api/event-sourcing/sessions/${sessionId}/reconstruct`, {
        method: 'GET',
        params: pointInTime ? { pointInTime: pointInTime.toISOString() } : {}
      });

      if (response.success) {
        setSessionState(response.data.session);
        timelineRef.current = response.data.session.timeline;
      } else {
        setError(response.error || 'Failed to reconstruct session');
      }
    } catch (error: any) {
      setError(error.message || 'Failed to reconstruct session');
    } finally {
      setIsLoading(false);
    }
  }, [sessionId, apiCall]);

  // Replay to a specific time
  const replayToTime = useCallback(async (timestamp: Date) => {
    if (!sessionId) return;

    setIsReplaying(true);
    setError(null);

    try {
      const response = await apiCall(`/api/event-sourcing/sessions/${sessionId}/state`, {
        method: 'GET',
        params: { timestamp: timestamp.toISOString() }
      });

      if (response.success) {
        setSessionState(response.data.state);
      } else {
        setError(response.error || 'Failed to replay to time');
      }
    } catch (error: any) {
      setError(error.message || 'Failed to replay to time');
    } finally {
      setIsReplaying(false);
    }
  }, [sessionId, apiCall]);

  // Get event history for session
  const getEventHistory = useCallback(async (fromTime?: Date) => {
    if (!sessionId) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await apiCall(`/api/event-sourcing/sessions/${sessionId}/timeline`, {
        method: 'GET'
      });

      if (response.success) {
        let events = response.data.events;
        
        if (fromTime) {
          events = events.filter((event: DomainEvent) => 
            new Date(event.timestamp) >= fromTime
          );
        }
        
        addEventsWithMemoryManagement(events);
        timelineRef.current = response.data.timelineEntries;
      } else {
        setError(response.error || 'Failed to get event history');
      }
    } catch (error: any) {
      setError(error.message || 'Failed to get event history');
    } finally {
      setIsLoading(false);
    }
  }, [sessionId, apiCall]);

  // Subscribe to real-time events
  const subscribeToEvents = useCallback((filter?: EventFilter) => {
    if (!socket || !isConnected || !sessionId) return;

    const eventFilter: EventFilter = {
      sessionId,
      ...filter
    };

    socket.send(JSON.stringify({
      type: 'subscribe',
      data: { filter: eventFilter }
    }));
  }, [socket, isConnected, sessionId]);

  // Unsubscribe from events
  const unsubscribeFromEvents = useCallback(() => {
    if (!socket || !subscriptionId) return;

    socket.send(JSON.stringify({
      type: 'unsubscribe',
      data: { subscriptionId }
    }));

    setSubscriptionId(null);
  }, [socket, subscriptionId]);

  // Get session timeline
  const getTimeline = useCallback(async () => {
    if (!sessionId) return [];

    try {
      const response = await apiCall(`/api/event-sourcing/sessions/${sessionId}/timeline`, {
        method: 'GET'
      });

      if (response.success) {
        return response.data.timelineEntries;
      } else {
        throw new Error(response.error || 'Failed to get timeline');
      }
    } catch (error: any) {
      setError(error.message || 'Failed to get timeline');
      return [];
    }
  }, [sessionId, apiCall]);

  // Generate audit trail
  const generateAuditTrail = useCallback(async () => {
    if (!sessionId) return null;

    try {
      const response = await apiCall(`/api/event-sourcing/sessions/${sessionId}/audit-trail`, {
        method: 'GET'
      });

      if (response.success) {
        return response.data;
      } else {
        throw new Error(response.error || 'Failed to generate audit trail');
      }
    } catch (error: any) {
      setError(error.message || 'Failed to generate audit trail');
      return null;
    }
  }, [sessionId, apiCall]);

  // Get current session state
  const getCurrentState = useCallback(async () => {
    if (!sessionId) return null;

    const now = new Date();
    
    try {
      const response = await apiCall(`/api/event-sourcing/sessions/${sessionId}/state`, {
        method: 'GET',
        params: { timestamp: now.toISOString() }
      });

      if (response.success) {
        return response.data as SessionState;
      } else {
        throw new Error(response.error || 'Failed to get current state');
      }
    } catch (error: any) {
      setError(error.message || 'Failed to get current state');
      return null;
    }
  }, [sessionId, apiCall]);

  // Handle WebSocket messages
  useEffect(() => {
    if (!socket) return;

    const handleMessage = (event: MessageEvent) => {
      try {
        const message = JSON.parse(event.data);

        switch (message.type) {
          case 'subscription_created':
            setSubscriptionId(message.data.subscriptionId);
            break;

          case 'event_stream':
            const newEvent = message.data.event;
            addRealtimeEventWithMemoryManagement(newEvent);
            
            // Update session state if this is a session event
            if (newEvent.eventType.startsWith('collaboration.session.') || 
                newEvent.eventType.startsWith('collaboration.participant.')) {
              // Trigger session reconstruction to get updated state
              reconstructSession();
            }
            break;

          case 'error':
            setError(message.data.message);
            break;
        }
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };

    socket.addEventListener('message', handleMessage);

    return () => {
      socket.removeEventListener('message', handleMessage);
    };
  }, [socket, reconstructSession]);

  // Initialize session reconstruction
  useEffect(() => {
    if (sessionId) {
      reconstructSession();
      getEventHistory();
      subscribeToEvents();
    }

    return () => {
      unsubscribeFromEvents();
    };
  }, [sessionId, reconstructSession, getEventHistory, subscribeToEvents, unsubscribeFromEvents]);

  // Set up memory management cleanup interval
  useEffect(() => {
    cleanupIntervalRef.current = setInterval(() => {
      if (isMemoryPressureHigh) {
        performMemoryCleanup();
      }
    }, MEMORY_CONFIG.CLEANUP_INTERVAL_MS);

    return () => {
      if (cleanupIntervalRef.current) {
        clearInterval(cleanupIntervalRef.current);
      }
    };
  }, [isMemoryPressureHigh, performMemoryCleanup]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Clear all state to prevent memory leaks
      setEventHistory([]);
      setRealtimeEvents([]);
      setSessionState(null);
      timelineRef.current = [];
      
      if (cleanupIntervalRef.current) {
        clearInterval(cleanupIntervalRef.current);
      }

      console.info('Event sourcing hook cleaned up', {
        sessionId,
        finalMemoryStats: memoryStats
      });
    };
  }, [sessionId, memoryStats]);

  return {
    // State
    sessionState,
    eventHistory,
    realtimeEvents,
    isReplaying,
    isLoading,
    error,
    isConnected,
    subscriptionId,
    
    // Actions
    replayToTime,
    getEventHistory,
    reconstructSession,
    subscribeToEvents,
    unsubscribeFromEvents,
    getTimeline,
    generateAuditTrail,
    getCurrentState,
    performMemoryCleanup, // Expose manual cleanup
    
    // Computed values
    timeline: timelineRef.current,
    hasRealTimeConnection: isConnected && subscriptionId !== null,
    eventCount: eventHistory.length,
    participantCount: sessionState?.metadata.participantCount || 0,
    conflictCount: sessionState?.metadata.conflictCount || 0,
    
    // Memory management
    memoryStats,
    isMemoryPressureHigh,
    memoryUsageBytes: memoryStats.memoryUsageBytes,
    memoryUtilization: memoryStats.totalEvents / MEMORY_CONFIG.MAX_EVENTS_IN_MEMORY
  };
};