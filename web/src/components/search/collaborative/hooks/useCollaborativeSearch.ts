/**
 * useCollaborativeSearch Hook
 * 
 * Custom hook for managing collaborative search session state,
 * participants, annotations, and real-time synchronization.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from '../../../ui/toast';

export interface CollaborativeSearchSession {
  id: string;
  workspace_id: string;
  session_name: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  is_active: boolean;
  is_persistent: boolean;
  search_settings: Record<string, any>;
  max_participants: number;
  current_search_state: Record<string, any>;
  search_history: Array<Record<string, any>>;
  shared_annotations: Record<string, any>;
}

export interface SearchSessionParticipant {
  id: string;
  search_session_id: string;
  user_id: string;
  role: 'searcher' | 'observer' | 'moderator';
  joined_at: string;
  last_search_at: string;
  is_active: boolean;
  can_initiate_search: boolean;
  can_modify_filters: boolean;
  can_annotate_results: boolean;
  can_bookmark_results: boolean;
  current_query?: string;
  active_filters: Record<string, any>;
  selected_results: string[];
  search_query_count: number;
  filter_change_count: number;
  annotation_count: number;
}

export interface SearchAnnotation {
  id: string;
  search_session_id: string;
  user_id: string;
  result_id: string;
  result_type: string;
  result_url?: string;
  annotation_type: 'highlight' | 'note' | 'bookmark' | 'flag' | 'question' | 'suggestion';
  annotation_text?: string;
  annotation_data: Record<string, any>;
  text_selection: Record<string, any>;
  selected_text?: string;
  is_shared: boolean;
  is_resolved: boolean;
  resolved_by?: string;
  resolved_at?: string;
  created_at: string;
  updated_at: string;
  parent_annotation_id?: string;
  mentions: string[];
}

export interface SharedSearchState {
  id: string;
  search_session_id: string;
  state_key: string;
  state_value: Record<string, any>;
  last_modified_by: string;
  last_modified_at: string;
  version: number;
  state_hash: string;
  conflict_resolution: 'last_write_wins' | 'merge' | 'manual';
}

export interface UseCollaborativeSearchOptions {
  sessionId?: string;
  workspaceId: string;
  autoJoin?: boolean;
  pollInterval?: number;
  onSessionUpdate?: (session: CollaborativeSearchSession) => void;
  onParticipantJoin?: (participant: SearchSessionParticipant) => void;
  onParticipantLeave?: (userId: string) => void;
  onStateChange?: (stateKey: string, newValue: any) => void;
  onAnnotationCreate?: (annotation: SearchAnnotation) => void;
}

export interface UseCollaborativeSearchReturn {
  // Session state
  session: CollaborativeSearchSession | null;
  participants: SearchSessionParticipant[];
  searchState: Record<string, SharedSearchState>;
  annotations: SearchAnnotation[];
  
  // Loading and error states
  isLoading: boolean;
  error: Error | null;
  
  // Session actions
  joinSession: (role?: SearchSessionParticipant['role']) => Promise<SearchSessionParticipant>;
  leaveSession: () => Promise<void>;
  
  // State management
  updateSearchState: (stateKey: string, value: any) => Promise<SharedSearchState>;
  getSearchState: (stateKey: string) => SharedSearchState | null;
  syncAllState: () => Promise<void>;
  
  // Annotation actions
  createAnnotation: (annotation: Partial<SearchAnnotation>) => Promise<SearchAnnotation>;
  updateAnnotation: (id: string, updates: Partial<SearchAnnotation>) => Promise<SearchAnnotation>;
  deleteAnnotation: (id: string) => Promise<void>;
  
  // Utility functions
  refresh: () => Promise<void>;
  isParticipant: (userId: string) => boolean;
  canUserModerate: (userId: string) => boolean;
}

export function useCollaborativeSearch({
  sessionId,
  workspaceId,
  autoJoin = false,
  pollInterval = 5000,
  onSessionUpdate,
  onParticipantJoin,
  onParticipantLeave,
  onStateChange,
  onAnnotationCreate
}: UseCollaborativeSearchOptions): UseCollaborativeSearchReturn {

  // ========================================================================
  // State Management
  // ========================================================================

  const [session, setSession] = useState<CollaborativeSearchSession | null>(null);
  const [participants, setParticipants] = useState<SearchSessionParticipant[]>([]);
  const [searchState, setSearchState] = useState<Record<string, SharedSearchState>>({});
  const [annotations, setAnnotations] = useState<SearchAnnotation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const pollTimerRef = useRef<NodeJS.Timeout>();
  const abortControllerRef = useRef<AbortController>();

  // ========================================================================
  // API Helper Functions
  // ========================================================================

  const apiRequest = useCallback(async (endpoint: string, options: RequestInit = {}) => {
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch(`/api/search-collaboration${endpoint}`, {
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        signal: controller.signal,
        ...options,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `HTTP ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Request cancelled');
      }
      throw error;
    }
  }, []);

  // ========================================================================
  // Data Fetching Functions
  // ========================================================================

  const fetchSession = useCallback(async (id: string) => {
    if (!id) return null;

    try {
      const data = await apiRequest(`/search-sessions/${id}`);
      return data.session;
    } catch (error) {
      console.error('Failed to fetch session:', error);
      throw error;
    }
  }, [apiRequest]);

  const fetchParticipants = useCallback(async (id: string) => {
    if (!id) return [];

    try {
      const data = await apiRequest(`/search-sessions/${id}`);
      return data.participants || [];
    } catch (error) {
      console.error('Failed to fetch participants:', error);
      return [];
    }
  }, [apiRequest]);

  const fetchSearchState = useCallback(async (id: string) => {
    if (!id) return {};

    try {
      const data = await apiRequest(`/search-sessions/${id}/state`);
      return data.searchState || {};
    } catch (error) {
      console.error('Failed to fetch search state:', error);
      return {};
    }
  }, [apiRequest]);

  const fetchAnnotations = useCallback(async (id: string) => {
    if (!id) return [];

    try {
      const data = await apiRequest(`/search-sessions/${id}`);
      return data.annotations || [];
    } catch (error) {
      console.error('Failed to fetch annotations:', error);
      return [];
    }
  }, [apiRequest]);

  // ========================================================================
  // Data Loading
  // ========================================================================

  const loadSessionData = useCallback(async (id: string) => {
    if (!id) return;

    setIsLoading(true);
    setError(null);

    try {
      // Fetch all data in parallel
      const [sessionData, participantsData, stateData, annotationsData] = await Promise.all([
        fetchSession(id),
        fetchParticipants(id),
        fetchSearchState(id),
        fetchAnnotations(id)
      ]);

      setSession(sessionData);
      setParticipants(participantsData);
      setSearchState(stateData);
      setAnnotations(annotationsData);

      // Trigger callbacks
      if (sessionData && onSessionUpdate) {
        onSessionUpdate(sessionData);
      }

    } catch (error) {
      console.error('Failed to load session data:', error);
      setError(error as Error);
    } finally {
      setIsLoading(false);
    }
  }, [fetchSession, fetchParticipants, fetchSearchState, fetchAnnotations, onSessionUpdate]);

  const refresh = useCallback(async () => {
    if (sessionId) {
      await loadSessionData(sessionId);
    }
  }, [sessionId, loadSessionData]);

  // ========================================================================
  // Session Actions
  // ========================================================================

  const joinSession = useCallback(async (role: SearchSessionParticipant['role'] = 'searcher') => {
    if (!sessionId) {
      throw new Error('No session ID provided');
    }

    try {
      const data = await apiRequest(`/search-sessions/${sessionId}/join`, {
        method: 'POST',
        body: JSON.stringify({ role }),
      });

      const newParticipant = data.participant;
      setParticipants(prev => [...prev, newParticipant]);
      
      if (onParticipantJoin) {
        onParticipantJoin(newParticipant);
      }

      return newParticipant;
    } catch (error) {
      console.error('Failed to join session:', error);
      throw error;
    }
  }, [sessionId, apiRequest, onParticipantJoin]);

  const leaveSession = useCallback(async () => {
    if (!sessionId) {
      throw new Error('No session ID provided');
    }

    try {
      await apiRequest(`/search-sessions/${sessionId}/leave`, {
        method: 'POST',
      });

      // Clear local state
      setSession(null);
      setParticipants([]);
      setSearchState({});
      setAnnotations([]);

    } catch (error) {
      console.error('Failed to leave session:', error);
      throw error;
    }
  }, [sessionId, apiRequest]);

  // ========================================================================
  // Search State Management
  // ========================================================================

  const updateSearchState = useCallback(async (stateKey: string, value: any) => {
    if (!sessionId) {
      throw new Error('No session ID provided');
    }

    try {
      const data = await apiRequest(`/search-sessions/${sessionId}/state`, {
        method: 'PUT',
        body: JSON.stringify({
          state_key: stateKey,
          new_value: value,
        }),
      });

      const updatedState = data.searchState;
      
      setSearchState(prev => ({
        ...prev,
        [stateKey]: updatedState
      }));

      if (onStateChange) {
        onStateChange(stateKey, value);
      }

      return updatedState;
    } catch (error) {
      console.error('Failed to update search state:', error);
      throw error;
    }
  }, [sessionId, apiRequest, onStateChange]);

  const getSearchState = useCallback((stateKey: string) => {
    return searchState[stateKey] || null;
  }, [searchState]);

  const syncAllState = useCallback(async () => {
    if (!sessionId) return;

    try {
      const stateData = await fetchSearchState(sessionId);
      setSearchState(stateData);
    } catch (error) {
      console.error('Failed to sync search state:', error);
      throw error;
    }
  }, [sessionId, fetchSearchState]);

  // ========================================================================
  // Annotation Management
  // ========================================================================

  const createAnnotation = useCallback(async (annotation: Partial<SearchAnnotation>) => {
    if (!sessionId) {
      throw new Error('No session ID provided');
    }

    try {
      const data = await apiRequest(`/search-sessions/${sessionId}/annotations`, {
        method: 'POST',
        body: JSON.stringify(annotation),
      });

      const newAnnotation = data.annotation;
      setAnnotations(prev => [newAnnotation, ...prev]);

      if (onAnnotationCreate) {
        onAnnotationCreate(newAnnotation);
      }

      return newAnnotation;
    } catch (error) {
      console.error('Failed to create annotation:', error);
      throw error;
    }
  }, [sessionId, apiRequest, onAnnotationCreate]);

  const updateAnnotation = useCallback(async (id: string, updates: Partial<SearchAnnotation>) => {
    if (!sessionId) {
      throw new Error('No session ID provided');
    }

    try {
      const data = await apiRequest(`/search-sessions/${sessionId}/annotations/${id}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
      });

      const updatedAnnotation = data.annotation;
      
      setAnnotations(prev => 
        prev.map(a => a.id === id ? updatedAnnotation : a)
      );

      return updatedAnnotation;
    } catch (error) {
      console.error('Failed to update annotation:', error);
      throw error;
    }
  }, [sessionId, apiRequest]);

  const deleteAnnotation = useCallback(async (id: string) => {
    if (!sessionId) {
      throw new Error('No session ID provided');
    }

    try {
      await apiRequest(`/search-sessions/${sessionId}/annotations/${id}`, {
        method: 'DELETE',
      });

      setAnnotations(prev => prev.filter(a => a.id !== id));
    } catch (error) {
      console.error('Failed to delete annotation:', error);
      throw error;
    }
  }, [sessionId, apiRequest]);

  // ========================================================================
  // Utility Functions
  // ========================================================================

  const isParticipant = useCallback((userId: string) => {
    return participants.some(p => p.user_id === userId && p.is_active);
  }, [participants]);

  const canUserModerate = useCallback((userId: string) => {
    const participant = participants.find(p => p.user_id === userId);
    return participant?.role === 'moderator' || session?.created_by === userId;
  }, [participants, session?.created_by]);

  // ========================================================================
  // Effects
  // ========================================================================

  // Load initial session data
  useEffect(() => {
    if (sessionId) {
      loadSessionData(sessionId);
    }
  }, [sessionId, loadSessionData]);

  // Auto-join session if requested
  useEffect(() => {
    if (sessionId && autoJoin && session && !isLoading) {
      const currentUserId = 'current-user-id'; // This would come from auth context
      const isCurrentUserParticipant = participants.some(p => p.user_id === currentUserId);
      
      if (!isCurrentUserParticipant) {
        joinSession().catch(error => {
          console.error('Failed to auto-join session:', error);
          toast({
            title: 'Failed to join session',
            description: error instanceof Error ? error.message : String(error),
            variant: 'destructive'
          });
        });
      }
    }
  }, [sessionId, autoJoin, session, participants, isLoading, joinSession]);

  // Set up polling for updates
  useEffect(() => {
    if (sessionId && pollInterval > 0) {
      pollTimerRef.current = setInterval(() => {
        refresh().catch(error => {
          console.error('Failed to poll session updates:', error);
        });
      }, pollInterval);

      return () => {
        if (pollTimerRef.current) {
          clearInterval(pollTimerRef.current);
        }
      };
    }
  }, [sessionId, pollInterval, refresh]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
      }
    };
  }, []);

  // ========================================================================
  // Return Hook Interface
  // ========================================================================

  return {
    // State
    session,
    participants,
    searchState,
    annotations,
    isLoading,
    error,
    
    // Session actions
    joinSession,
    leaveSession,
    
    // State management
    updateSearchState,
    getSearchState,
    syncAllState,
    
    // Annotation actions
    createAnnotation,
    updateAnnotation,
    deleteAnnotation,
    
    // Utility functions
    refresh,
    isParticipant,
    canUserModerate
  };
}