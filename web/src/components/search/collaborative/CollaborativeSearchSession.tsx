/**
 * CollaborativeSearchSession Component
 * 
 * Main component for managing a collaborative search session with real-time
 * synchronization, participant management, and shared search state.
 */

import React, { 
  useState, 
  useEffect, 
  useCallback, 
  useRef,
  useMemo
} from 'react';
import { 
  Users, 
  Settings, 
  Eye, 
  EyeOff, 
  Share2, 
  MessageSquare,
  Loader2,
  AlertTriangle
} from 'lucide-react';
import { SearchInput } from '../SearchInput';
import { SearchResults } from '../SearchResults';
import { SearchFilters } from '../SearchFilters';
import { CollaborativeParticipants } from './CollaborativeParticipants';
import { SearchAnnotations } from './SearchAnnotations';
import { CollaborativeIndicators } from './CollaborativeIndicators';
import { SearchStateSync } from './SearchStateSync';
import { useCollaborativeSearch } from './hooks/useCollaborativeSearch';
import { useSearchCollaboration } from './hooks/useSearchCollaboration';
import { Button } from '../../ui/button';
import { toast } from '../../ui/toast';
import styles from './CollaborativeSearchSession.module.css';

export interface CollaborativeSearchSessionProps {
  sessionId?: string;
  workspaceId: string;
  sessionName?: string;
  initialQuery?: string;
  onSessionCreate?: (sessionId: string) => void;
  onSessionLeave?: () => void;
  className?: string;
}

export function CollaborativeSearchSession({
  sessionId: initialSessionId,
  workspaceId,
  sessionName = 'Collaborative Search',
  initialQuery = '',
  onSessionCreate,
  onSessionLeave,
  className = ''
}: CollaborativeSearchSessionProps) {

  // ========================================================================
  // State Management
  // ========================================================================

  const [sessionId, setSessionId] = useState<string | undefined>(initialSessionId);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [showParticipants, setShowParticipants] = useState(true);
  const [showAnnotations, setShowAnnotations] = useState(true);
  const [isSpectatorMode, setIsSpectatorMode] = useState(false);
  const [syncState, setSyncState] = useState<'synced' | 'syncing' | 'conflict' | 'error'>('synced');

  // ========================================================================
  // Collaborative Search Hooks
  // ========================================================================

  const {
    session,
    participants,
    searchState,
    annotations,
    isLoading: sessionLoading,
    error: sessionError,
    joinSession,
    leaveSession,
    updateSearchState,
    createAnnotation,
    updateAnnotation,
    deleteAnnotation
  } = useCollaborativeSearch({
    sessionId,
    workspaceId,
    autoJoin: !!sessionId
  });

  const {
    isConnected,
    connectionState,
    sendMessage,
    onMessage,
    reconnect
  } = useSearchCollaboration({
    sessionId,
    enabled: !!sessionId
  });

  // ========================================================================
  // Search State
  // ========================================================================

  const [query, setQuery] = useState(initialQuery);
  const [filters, setFilters] = useState({});
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedResults, setSelectedResults] = useState<string[]>([]);

  // Debounced search state updates
  const searchStateRef = useRef<NodeJS.Timeout>();

  // ========================================================================
  // Session Management
  // ========================================================================

  const createSession = useCallback(async () => {
    if (isCreatingSession) return;
    
    setIsCreatingSession(true);
    try {
      // This would call the API to create a search session
      const response = await fetch('/api/search-collaboration/search-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace_id: workspaceId,
          session_name: sessionName,
          is_persistent: true,
          max_participants: 50,
          allow_anonymous_search: false
        })
      });

      if (!response.ok) throw new Error('Failed to create session');
      
      const data = await response.json();
      const newSessionId = data.session.id;
      
      setSessionId(newSessionId);
      onSessionCreate?.(newSessionId);
      
      toast({
        title: 'Session created',
        description: `Collaborative search session "${sessionName}" is ready`,
      });
      
    } catch (error) {
      console.error('Failed to create session:', error);
      toast({
        title: 'Failed to create session',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setIsCreatingSession(false);
    }
  }, [isCreatingSession, workspaceId, sessionName, onSessionCreate]);

  const handleLeaveSession = useCallback(async () => {
    if (!sessionId) return;
    
    try {
      await leaveSession();
      setSessionId(undefined);
      onSessionLeave?.();
      
      toast({
        title: 'Left session',
        description: 'You have left the collaborative search session',
      });
      
    } catch (error) {
      console.error('Failed to leave session:', error);
      toast({
        title: 'Failed to leave session',
        description: error.message,
        variant: 'destructive'
      });
    }
  }, [sessionId, leaveSession, onSessionLeave]);

  // ========================================================================
  // Search Functionality
  // ========================================================================

  const performSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) return;
    
    setIsSearching(true);
    try {
      // This would call the unified search API
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: searchQuery,
          filters,
          use_semantic: true,
          include_highlights: true
        })
      });

      if (!response.ok) throw new Error('Search failed');
      
      const data = await response.json();
      setSearchResults(data.results || []);
      
    } catch (error) {
      console.error('Search failed:', error);
      toast({
        title: 'Search failed',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setIsSearching(false);
    }
  }, [filters]);

  const handleQueryChange = useCallback((newQuery: string) => {
    setQuery(newQuery);
    
    // Update collaborative search state with debouncing
    if (sessionId && !isSpectatorMode) {
      if (searchStateRef.current) {
        clearTimeout(searchStateRef.current);
      }
      
      searchStateRef.current = setTimeout(() => {
        sendMessage({
          type: 'search_query_update',
          searchSessionId: sessionId,
          data: { query: newQuery }
        });
        
        updateSearchState('query', { text: newQuery, timestamp: new Date() });
      }, 300);
    }
  }, [sessionId, isSpectatorMode, sendMessage, updateSearchState]);

  const handleQuerySubmit = useCallback((searchQuery: string) => {
    performSearch(searchQuery);
    
    // Broadcast search execution
    if (sessionId && !isSpectatorMode) {
      sendMessage({
        type: 'search_query_update',
        searchSessionId: sessionId,
        data: { 
          query: searchQuery, 
          executed: true,
          timestamp: new Date()
        }
      });
    }
  }, [sessionId, isSpectatorMode, performSearch, sendMessage]);

  const handleFiltersChange = useCallback((newFilters: any) => {
    setFilters(newFilters);
    
    // Update collaborative filter state
    if (sessionId && !isSpectatorMode) {
      sendMessage({
        type: 'search_filter_update',
        searchSessionId: sessionId,
        data: { filters: newFilters }
      });
      
      updateSearchState('filters', newFilters);
    }
  }, [sessionId, isSpectatorMode, sendMessage, updateSearchState]);

  // ========================================================================
  // Result Selection & Annotation
  // ========================================================================

  const handleResultSelect = useCallback((resultId: string, selected: boolean) => {
    setSelectedResults(prev => {
      const newSelection = selected 
        ? [...prev, resultId]
        : prev.filter(id => id !== resultId);
      
      // Broadcast selection change
      if (sessionId && !isSpectatorMode) {
        sendMessage({
          type: 'search_selection_change',
          searchSessionId: sessionId,
          data: { selectedResults: newSelection }
        });
      }
      
      return newSelection;
    });
  }, [sessionId, isSpectatorMode, sendMessage]);

  const handleResultHighlight = useCallback((resultId: string, action: 'add' | 'remove') => {
    // Broadcast result highlight
    if (sessionId && !isSpectatorMode) {
      sendMessage({
        type: 'search_result_highlight',
        searchSessionId: sessionId,
        data: { 
          resultId, 
          action,
          timestamp: new Date()
        }
      });
    }
  }, [sessionId, isSpectatorMode, sendMessage]);

  // ========================================================================
  // WebSocket Message Handling
  // ========================================================================

  useEffect(() => {
    if (!sessionId) return;
    
    const handleMessage = (message: any) => {
      switch (message.type) {
        case 'search_query_update':
          if (message.userId !== 'current-user-id') { // Avoid self-updates
            setQuery(message.data.query);
            if (message.data.executed) {
              performSearch(message.data.query);
            }
          }
          break;
          
        case 'search_filter_update':
          if (message.userId !== 'current-user-id') {
            setFilters(message.data.filters);
          }
          break;
          
        case 'search_selection_change':
          if (message.userId !== 'current-user-id') {
            // Show other users' selections as visual indicators
            // This would be handled by CollaborativeIndicators component
          }
          break;
          
        case 'search_result_highlight':
          // Handle result highlighting from other users
          break;
          
        case 'search_annotation':
          // Handle annotation updates
          break;
          
        default:
          console.debug('Unknown collaborative message:', message.type);
      }
    };

    onMessage(handleMessage);
  }, [sessionId, onMessage, performSearch]);

  // ========================================================================
  // Render Logic
  // ========================================================================

  // Show session creation UI if no session
  if (!sessionId) {
    return (
      <div className={`${styles.sessionCreation} ${className}`}>
        <div className={styles.creationCard}>
          <h2>Start Collaborative Search</h2>
          <p>Create a new collaborative search session to search together with your team.</p>
          
          <Button
            onClick={createSession}
            disabled={isCreatingSession}
            className={styles.createButton}
          >
            {isCreatingSession ? (
              <>
                <Loader2 className="animate-spin mr-2" size={16} />
                Creating Session...
              </>
            ) : (
              <>
                <Share2 className="mr-2" size={16} />
                Create Session
              </>
            )}
          </Button>
        </div>
      </div>
    );
  }

  // Show loading state
  if (sessionLoading) {
    return (
      <div className={`${styles.loadingContainer} ${className}`}>
        <Loader2 className="animate-spin" size={32} />
        <p>Loading collaborative search session...</p>
      </div>
    );
  }

  // Show error state
  if (sessionError) {
    return (
      <div className={`${styles.errorContainer} ${className}`}>
        <AlertTriangle className="text-destructive" size={32} />
        <h3>Failed to Load Session</h3>
        <p>{sessionError.message}</p>
        <Button onClick={() => window.location.reload()} variant="outline">
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className={`${styles.collaborativeSearch} ${className}`}>
      {/* Session Header */}
      <div className={styles.sessionHeader}>
        <div className={styles.sessionInfo}>
          <h1>{session?.session_name || 'Collaborative Search'}</h1>
          <div className={styles.sessionMeta}>
            <span className={`${styles.connectionStatus} ${isConnected ? styles.connected : styles.disconnected}`}>
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
            <span className={styles.participantCount}>
              <Users size={14} />
              {participants?.length || 0} participants
            </span>
          </div>
        </div>
        
        <div className={styles.sessionControls}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowParticipants(!showParticipants)}
            title={showParticipants ? 'Hide participants' : 'Show participants'}
          >
            {showParticipants ? <EyeOff size={16} /> : <Eye size={16} />}
          </Button>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowAnnotations(!showAnnotations)}
            title={showAnnotations ? 'Hide annotations' : 'Show annotations'}
          >
            <MessageSquare size={16} />
          </Button>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsSpectatorMode(!isSpectatorMode)}
            title={isSpectatorMode ? 'Enable editing' : 'Spectator mode'}
          >
            <Settings size={16} />
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={handleLeaveSession}
            title="Leave session"
          >
            Leave
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className={styles.sessionContent}>
        {/* Left Sidebar - Participants & Controls */}
        {showParticipants && (
          <div className={styles.leftSidebar}>
            <CollaborativeParticipants
              participants={participants || []}
              currentUserId="current-user-id" // This would come from auth context
              onInviteParticipant={() => {/* Handle invite */}}
              onUpdateParticipant={() => {/* Handle update */}}
            />
            
            <SearchStateSync
              syncState={syncState}
              onForceSync={() => {/* Handle force sync */}}
              onResolveConflicts={() => {/* Handle conflict resolution */}}
            />
          </div>
        )}

        {/* Main Search Area */}
        <div className={styles.mainSearch}>
          {/* Search Input with Collaborative Indicators */}
          <div className={styles.searchContainer}>
            <SearchInput
              value={query}
              onChange={handleQueryChange}
              onSubmit={handleQuerySubmit}
              disabled={isSpectatorMode}
              placeholder="Search collaboratively..."
              isLoading={isSearching}
            />
            
            <CollaborativeIndicators
              participants={participants || []}
              currentQuery={query}
              sessionId={sessionId}
            />
          </div>

          {/* Search Filters */}
          <SearchFilters
            filters={filters}
            onChange={handleFiltersChange}
            disabled={isSpectatorMode}
            className={styles.filters}
          />

          {/* Search Results with Collaborative Features */}
          <SearchResults
            results={searchResults}
            isLoading={isSearching}
            query={query}
            selectedResults={selectedResults}
            onResultSelect={handleResultSelect}
            onResultHighlight={handleResultHighlight}
            collaborativeMode={true}
            className={styles.results}
          />
        </div>

        {/* Right Sidebar - Annotations */}
        {showAnnotations && (
          <div className={styles.rightSidebar}>
            <SearchAnnotations
              annotations={annotations || []}
              searchResults={searchResults}
              onCreateAnnotation={createAnnotation}
              onUpdateAnnotation={updateAnnotation}
              onDeleteAnnotation={deleteAnnotation}
              readOnly={isSpectatorMode}
            />
          </div>
        )}
      </div>
    </div>
  );
}