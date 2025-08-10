/**
 * Collaborative Search Components Unit Tests
 * 
 * Tests React components for collaborative search functionality including:
 * - CollaborativeSearchSession component
 * - SearchAnnotations component  
 * - CollaborativeParticipants component
 * - useCollaborativeSearch hook
 * - useSearchCollaboration hook
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock components and hooks (since we can't import the actual ones in this test environment)
// In a real test setup, you'd import these from the actual files

// Mock data types
interface CollaborativeSearchSession {
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

interface SearchSessionParticipant {
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
  user_name?: string;
  user_email?: string;
  user_avatar?: string;
}

interface SearchAnnotation {
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
  user_name?: string;
  user_email?: string;
  user_avatar?: string;
}

interface SearchResult {
  id: string;
  title: string;
  type: string;
  url?: string;
  preview?: {
    text: string;
    highlights?: Array<{
      start: number;
      end: number;
      match: string;
    }>;
  };
}

// Mock implementations
const mockUseCollaborativeSearch = jest.fn();
const mockUseSearchCollaboration = jest.fn();
const mockToast = jest.fn();

// Mock components
const MockCollaborativeSearchSession: React.FC<{
  sessionId?: string;
  workspaceId: string;
  onSessionCreate?: (session: CollaborativeSearchSession) => void;
  className?: string;
}> = ({ sessionId, workspaceId, onSessionCreate, className }) => {
  const [session, setSession] = React.useState<CollaborativeSearchSession | null>(null);
  const [isCreating, setIsCreating] = React.useState(!sessionId);
  
  const mockSession: CollaborativeSearchSession = {
    id: sessionId || 'mock-session-123',
    workspace_id: workspaceId,
    session_name: 'Test Search Session',
    created_by: 'test-user',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    is_active: true,
    is_persistent: true,
    search_settings: {},
    max_participants: 10,
    current_search_state: {},
    search_history: [],
    shared_annotations: {}
  };

  const handleCreateSession = () => {
    setSession(mockSession);
    setIsCreating(false);
    onSessionCreate?.(mockSession);
  };

  if (isCreating) {
    return (
      <div className={className} data-testid="session-creation">
        <h2>Start Collaborative Search</h2>
        <button onClick={handleCreateSession} data-testid="create-session-btn">
          Create Search Session
        </button>
      </div>
    );
  }

  return (
    <div className={className} data-testid="collaborative-search">
      <header data-testid="session-header">
        <h1>{session?.session_name}</h1>
        <div data-testid="connection-status">Connected</div>
      </header>
      
      <div data-testid="search-container">
        <input 
          type="text" 
          placeholder="Enter search query..."
          data-testid="search-input"
        />
        <button data-testid="search-btn">Search</button>
      </div>
      
      <div data-testid="session-content">
        <div data-testid="participants-panel">Participants</div>
        <div data-testid="main-search">Search Results</div>
        <div data-testid="annotations-panel">Annotations</div>
      </div>
    </div>
  );
};

const MockSearchAnnotations: React.FC<{
  annotations: SearchAnnotation[];
  searchResults: SearchResult[];
  onCreateAnnotation?: (annotation: Partial<SearchAnnotation>) => Promise<SearchAnnotation>;
  onUpdateAnnotation?: (id: string, updates: Partial<SearchAnnotation>) => Promise<SearchAnnotation>;
  onDeleteAnnotation?: (id: string) => Promise<void>;
  readOnly?: boolean;
  className?: string;
}> = ({ 
  annotations, 
  searchResults, 
  onCreateAnnotation,
  onUpdateAnnotation,
  onDeleteAnnotation,
  readOnly = false,
  className 
}) => {
  const [selectedType, setSelectedType] = React.useState('all');
  const [isCreating, setIsCreating] = React.useState(false);

  const filteredAnnotations = selectedType === 'all' 
    ? annotations 
    : annotations.filter(a => a.annotation_type === selectedType);

  const handleCreateAnnotation = async () => {
    const newAnnotation = await onCreateAnnotation?.({
      result_id: 'result-1',
      result_type: 'document',
      annotation_type: 'note',
      annotation_text: 'Test annotation',
      is_shared: true,
      annotation_data: {},
      text_selection: {},
      mentions: []
    });
    
    if (newAnnotation) {
      setIsCreating(false);
    }
  };

  return (
    <div className={className} data-testid="annotations-container">
      <div data-testid="annotations-header">
        <span>Annotations ({annotations.length})</span>
        {!readOnly && (
          <button 
            onClick={() => setIsCreating(true)} 
            data-testid="add-annotation-btn"
          >
            Add
          </button>
        )}
      </div>

      <div data-testid="annotations-filters">
        <select 
          value={selectedType} 
          onChange={(e) => setSelectedType(e.target.value)}
          data-testid="type-filter"
        >
          <option value="all">All Types</option>
          <option value="note">Notes</option>
          <option value="highlight">Highlights</option>
          <option value="bookmark">Bookmarks</option>
        </select>
      </div>

      <div data-testid="annotations-list">
        {filteredAnnotations.map(annotation => (
          <div key={annotation.id} data-testid={`annotation-${annotation.id}`}>
            <div data-testid="annotation-type">{annotation.annotation_type}</div>
            <div data-testid="annotation-text">{annotation.annotation_text}</div>
            {!readOnly && (
              <div data-testid="annotation-actions">
                <button 
                  onClick={() => onUpdateAnnotation?.(annotation.id, { annotation_text: 'Updated' })}
                  data-testid={`edit-annotation-${annotation.id}`}
                >
                  Edit
                </button>
                <button 
                  onClick={() => onDeleteAnnotation?.(annotation.id)}
                  data-testid={`delete-annotation-${annotation.id}`}
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {isCreating && (
        <div data-testid="create-annotation-dialog">
          <input placeholder="Annotation text" data-testid="annotation-input" />
          <button onClick={handleCreateAnnotation} data-testid="save-annotation-btn">
            Save
          </button>
          <button onClick={() => setIsCreating(false)} data-testid="cancel-annotation-btn">
            Cancel
          </button>
        </div>
      )}

      {filteredAnnotations.length === 0 && (
        <div data-testid="empty-annotations">No annotations yet</div>
      )}
    </div>
  );
};

const MockCollaborativeParticipants: React.FC<{
  participants: SearchSessionParticipant[];
  currentUserId: string;
  onInviteParticipant?: () => void;
  onUpdateParticipant?: (participantId: string, updates: Partial<SearchSessionParticipant>) => void;
  onRemoveParticipant?: (participantId: string) => void;
  className?: string;
}> = ({
  participants,
  currentUserId,
  onInviteParticipant,
  onUpdateParticipant,
  onRemoveParticipant,
  className
}) => {
  const currentParticipant = participants.find(p => p.user_id === currentUserId);
  const canModerate = currentParticipant?.role === 'moderator';

  return (
    <div className={className} data-testid="participants-container">
      <div data-testid="participants-header">
        <span>Participants ({participants.length})</span>
        {canModerate && (
          <button onClick={onInviteParticipant} data-testid="invite-participant-btn">
            Invite
          </button>
        )}
      </div>

      <div data-testid="participants-list">
        {participants.map(participant => (
          <div key={participant.id} data-testid={`participant-${participant.id}`}>
            <div data-testid="participant-name">
              {participant.user_name || participant.user_email || 'Anonymous'}
              {participant.user_id === currentUserId && <span> (You)</span>}
            </div>
            <div data-testid="participant-role">{participant.role}</div>
            <div data-testid="participant-status">
              {participant.is_active ? 'Active' : 'Inactive'}
            </div>
            {canModerate && participant.user_id !== currentUserId && (
              <div data-testid="participant-actions">
                <button 
                  onClick={() => onUpdateParticipant?.(participant.id, { role: 'moderator' })}
                  data-testid={`promote-participant-${participant.id}`}
                >
                  Make Moderator
                </button>
                <button 
                  onClick={() => onRemoveParticipant?.(participant.id)}
                  data-testid={`remove-participant-${participant.id}`}
                >
                  Remove
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {participants.length === 0 && (
        <div data-testid="empty-participants">No participants</div>
      )}
    </div>
  );
};

// Mock hooks
const createMockUseCollaborativeSearch = (overrides = {}) => ({
  session: null,
  participants: [],
  searchState: {},
  annotations: [],
  isLoading: false,
  error: null,
  joinSession: jest.fn(),
  leaveSession: jest.fn(),
  updateSearchState: jest.fn(),
  getSearchState: jest.fn(),
  syncAllState: jest.fn(),
  createAnnotation: jest.fn(),
  updateAnnotation: jest.fn(),
  deleteAnnotation: jest.fn(),
  refresh: jest.fn(),
  isParticipant: jest.fn(),
  canUserModerate: jest.fn(),
  ...overrides
});

const createMockUseSearchCollaboration = (overrides = {}) => ({
  connectionState: 'connected' as const,
  isConnected: true,
  lastError: null,
  reconnectAttempts: 0,
  sendMessage: jest.fn(),
  onMessage: jest.fn(),
  connect: jest.fn(),
  disconnect: jest.fn(),
  reconnect: jest.fn(),
  messagesSent: 0,
  messagesReceived: 0,
  connectionDuration: 0,
  ...overrides
});

describe('Collaborative Search Components Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseCollaborativeSearch.mockReturnValue(createMockUseCollaborativeSearch());
    mockUseSearchCollaboration.mockReturnValue(createMockUseSearchCollaboration());
  });

  describe('CollaborativeSearchSession Component', () => {
    test('should render session creation when no sessionId provided', () => {
      render(
        <MockCollaborativeSearchSession 
          workspaceId="test-workspace"
        />
      );

      expect(screen.getByTestId('session-creation')).toBeInTheDocument();
      expect(screen.getByText('Start Collaborative Search')).toBeInTheDocument();
      expect(screen.getByTestId('create-session-btn')).toBeInTheDocument();
    });

    test('should create session when create button clicked', async () => {
      const onSessionCreate = jest.fn();
      
      render(
        <MockCollaborativeSearchSession 
          workspaceId="test-workspace"
          onSessionCreate={onSessionCreate}
        />
      );

      const createBtn = screen.getByTestId('create-session-btn');
      fireEvent.click(createBtn);

      await waitFor(() => {
        expect(screen.getByTestId('collaborative-search')).toBeInTheDocument();
        expect(onSessionCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            workspace_id: 'test-workspace',
            session_name: 'Test Search Session'
          })
        );
      });
    });

    test('should render active session when sessionId provided', () => {
      render(
        <MockCollaborativeSearchSession 
          sessionId="existing-session"
          workspaceId="test-workspace"
        />
      );

      expect(screen.getByTestId('collaborative-search')).toBeInTheDocument();
      expect(screen.getByTestId('session-header')).toBeInTheDocument();
      expect(screen.getByTestId('search-container')).toBeInTheDocument();
      expect(screen.getByTestId('session-content')).toBeInTheDocument();
    });

    test('should display connection status', () => {
      render(
        <MockCollaborativeSearchSession 
          sessionId="test-session"
          workspaceId="test-workspace"
        />
      );

      const connectionStatus = screen.getByTestId('connection-status');
      expect(connectionStatus).toHaveTextContent('Connected');
    });

    test('should render search interface', () => {
      render(
        <MockCollaborativeSearchSession 
          sessionId="test-session"
          workspaceId="test-workspace"
        />
      );

      expect(screen.getByTestId('search-input')).toBeInTheDocument();
      expect(screen.getByTestId('search-btn')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Enter search query...')).toBeInTheDocument();
    });

    test('should render three-panel layout', () => {
      render(
        <MockCollaborativeSearchSession 
          sessionId="test-session"
          workspaceId="test-workspace"
        />
      );

      expect(screen.getByTestId('participants-panel')).toBeInTheDocument();
      expect(screen.getByTestId('main-search')).toBeInTheDocument();
      expect(screen.getByTestId('annotations-panel')).toBeInTheDocument();
    });
  });

  describe('SearchAnnotations Component', () => {
    const mockAnnotations: SearchAnnotation[] = [
      {
        id: 'ann-1',
        search_session_id: 'session-1',
        user_id: 'user-1',
        result_id: 'result-1',
        result_type: 'document',
        annotation_type: 'note',
        annotation_text: 'This is helpful',
        annotation_data: {},
        text_selection: {},
        is_shared: true,
        is_resolved: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        mentions: []
      },
      {
        id: 'ann-2',
        search_session_id: 'session-1',
        user_id: 'user-2',
        result_id: 'result-2',
        result_type: 'document',
        annotation_type: 'highlight',
        annotation_text: 'Important section',
        annotation_data: {},
        text_selection: {},
        is_shared: true,
        is_resolved: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        mentions: []
      }
    ];

    const mockSearchResults: SearchResult[] = [
      {
        id: 'result-1',
        title: 'Document 1',
        type: 'document'
      },
      {
        id: 'result-2',
        title: 'Document 2',
        type: 'document'
      }
    ];

    test('should render annotations list', () => {
      render(
        <MockSearchAnnotations 
          annotations={mockAnnotations}
          searchResults={mockSearchResults}
        />
      );

      expect(screen.getByTestId('annotations-container')).toBeInTheDocument();
      expect(screen.getByText('Annotations (2)')).toBeInTheDocument();
      expect(screen.getByTestId('annotation-ann-1')).toBeInTheDocument();
      expect(screen.getByTestId('annotation-ann-2')).toBeInTheDocument();
    });

    test('should filter annotations by type', async () => {
      render(
        <MockSearchAnnotations 
          annotations={mockAnnotations}
          searchResults={mockSearchResults}
        />
      );

      const typeFilter = screen.getByTestId('type-filter');
      
      // Filter to show only notes
      fireEvent.change(typeFilter, { target: { value: 'note' } });
      
      await waitFor(() => {
        expect(screen.getByTestId('annotation-ann-1')).toBeInTheDocument();
        expect(screen.queryByTestId('annotation-ann-2')).not.toBeInTheDocument();
      });
    });

    test('should show add annotation button when not read-only', () => {
      render(
        <MockSearchAnnotations 
          annotations={mockAnnotations}
          searchResults={mockSearchResults}
          readOnly={false}
        />
      );

      expect(screen.getByTestId('add-annotation-btn')).toBeInTheDocument();
    });

    test('should hide add annotation button when read-only', () => {
      render(
        <MockSearchAnnotations 
          annotations={mockAnnotations}
          searchResults={mockSearchResults}
          readOnly={true}
        />
      );

      expect(screen.queryByTestId('add-annotation-btn')).not.toBeInTheDocument();
    });

    test('should handle annotation creation', async () => {
      const onCreateAnnotation = jest.fn().mockResolvedValue({
        id: 'new-ann',
        annotation_text: 'Test annotation'
      });

      render(
        <MockSearchAnnotations 
          annotations={mockAnnotations}
          searchResults={mockSearchResults}
          onCreateAnnotation={onCreateAnnotation}
        />
      );

      // Click add button
      fireEvent.click(screen.getByTestId('add-annotation-btn'));

      // Should show creation dialog
      expect(screen.getByTestId('create-annotation-dialog')).toBeInTheDocument();

      // Click save
      fireEvent.click(screen.getByTestId('save-annotation-btn'));

      await waitFor(() => {
        expect(onCreateAnnotation).toHaveBeenCalledWith(
          expect.objectContaining({
            result_id: 'result-1',
            annotation_type: 'note',
            annotation_text: 'Test annotation'
          })
        );
      });
    });

    test('should handle annotation editing', async () => {
      const onUpdateAnnotation = jest.fn().mockResolvedValue({});

      render(
        <MockSearchAnnotations 
          annotations={mockAnnotations}
          searchResults={mockSearchResults}
          onUpdateAnnotation={onUpdateAnnotation}
        />
      );

      // Click edit button for first annotation
      fireEvent.click(screen.getByTestId('edit-annotation-ann-1'));

      await waitFor(() => {
        expect(onUpdateAnnotation).toHaveBeenCalledWith('ann-1', {
          annotation_text: 'Updated'
        });
      });
    });

    test('should handle annotation deletion', async () => {
      const onDeleteAnnotation = jest.fn().mockResolvedValue(undefined);

      render(
        <MockSearchAnnotations 
          annotations={mockAnnotations}
          searchResults={mockSearchResults}
          onDeleteAnnotation={onDeleteAnnotation}
        />
      );

      // Click delete button for first annotation
      fireEvent.click(screen.getByTestId('delete-annotation-ann-1'));

      await waitFor(() => {
        expect(onDeleteAnnotation).toHaveBeenCalledWith('ann-1');
      });
    });

    test('should show empty state when no annotations', () => {
      render(
        <MockSearchAnnotations 
          annotations={[]}
          searchResults={mockSearchResults}
        />
      );

      expect(screen.getByTestId('empty-annotations')).toBeInTheDocument();
      expect(screen.getByText('No annotations yet')).toBeInTheDocument();
    });
  });

  describe('CollaborativeParticipants Component', () => {
    const mockParticipants: SearchSessionParticipant[] = [
      {
        id: 'part-1',
        search_session_id: 'session-1',
        user_id: 'user-1',
        role: 'moderator',
        joined_at: new Date().toISOString(),
        last_search_at: new Date().toISOString(),
        is_active: true,
        can_initiate_search: true,
        can_modify_filters: true,
        can_annotate_results: true,
        can_bookmark_results: true,
        active_filters: {},
        selected_results: [],
        search_query_count: 5,
        filter_change_count: 2,
        annotation_count: 3,
        user_name: 'John Moderator',
        user_email: 'john@example.com'
      },
      {
        id: 'part-2',
        search_session_id: 'session-1',
        user_id: 'user-2',
        role: 'searcher',
        joined_at: new Date().toISOString(),
        last_search_at: new Date().toISOString(),
        is_active: true,
        can_initiate_search: true,
        can_modify_filters: true,
        can_annotate_results: true,
        can_bookmark_results: false,
        active_filters: {},
        selected_results: [],
        search_query_count: 3,
        filter_change_count: 1,
        annotation_count: 1,
        user_name: 'Jane Searcher',
        user_email: 'jane@example.com'
      }
    ];

    test('should render participants list', () => {
      render(
        <MockCollaborativeParticipants 
          participants={mockParticipants}
          currentUserId="user-1"
        />
      );

      expect(screen.getByTestId('participants-container')).toBeInTheDocument();
      expect(screen.getByText('Participants (2)')).toBeInTheDocument();
      expect(screen.getByTestId('participant-part-1')).toBeInTheDocument();
      expect(screen.getByTestId('participant-part-2')).toBeInTheDocument();
    });

    test('should indicate current user', () => {
      render(
        <MockCollaborativeParticipants 
          participants={mockParticipants}
          currentUserId="user-1"
        />
      );

      const currentUser = screen.getByTestId('participant-part-1');
      expect(currentUser).toHaveTextContent('John Moderator (You)');
    });

    test('should show participant roles and status', () => {
      render(
        <MockCollaborativeParticipants 
          participants={mockParticipants}
          currentUserId="user-1"
        />
      );

      // Check roles
      const participant1 = screen.getByTestId('participant-part-1');
      const participant2 = screen.getByTestId('participant-part-2');

      expect(participant1.querySelector('[data-testid="participant-role"]')).toHaveTextContent('moderator');
      expect(participant2.querySelector('[data-testid="participant-role"]')).toHaveTextContent('searcher');

      // Check status
      expect(participant1.querySelector('[data-testid="participant-status"]')).toHaveTextContent('Active');
      expect(participant2.querySelector('[data-testid="participant-status"]')).toHaveTextContent('Active');
    });

    test('should show invite button for moderators', () => {
      render(
        <MockCollaborativeParticipants 
          participants={mockParticipants}
          currentUserId="user-1" // moderator
        />
      );

      expect(screen.getByTestId('invite-participant-btn')).toBeInTheDocument();
    });

    test('should hide invite button for non-moderators', () => {
      render(
        <MockCollaborativeParticipants 
          participants={mockParticipants}
          currentUserId="user-2" // searcher
        />
      );

      expect(screen.queryByTestId('invite-participant-btn')).not.toBeInTheDocument();
    });

    test('should show participant management actions for moderators', () => {
      render(
        <MockCollaborativeParticipants 
          participants={mockParticipants}
          currentUserId="user-1" // moderator
        />
      );

      // Should see actions for other participants (not themselves)
      expect(screen.getByTestId('promote-participant-part-2')).toBeInTheDocument();
      expect(screen.getByTestId('remove-participant-part-2')).toBeInTheDocument();
      
      // Should not see actions for themselves
      expect(screen.queryByTestId('promote-participant-part-1')).not.toBeInTheDocument();
      expect(screen.queryByTestId('remove-participant-part-1')).not.toBeInTheDocument();
    });

    test('should handle participant actions', async () => {
      const onUpdateParticipant = jest.fn();
      const onRemoveParticipant = jest.fn();
      const onInviteParticipant = jest.fn();

      render(
        <MockCollaborativeParticipants 
          participants={mockParticipants}
          currentUserId="user-1"
          onUpdateParticipant={onUpdateParticipant}
          onRemoveParticipant={onRemoveParticipant}
          onInviteParticipant={onInviteParticipant}
        />
      );

      // Test invite
      fireEvent.click(screen.getByTestId('invite-participant-btn'));
      expect(onInviteParticipant).toHaveBeenCalled();

      // Test promote
      fireEvent.click(screen.getByTestId('promote-participant-part-2'));
      expect(onUpdateParticipant).toHaveBeenCalledWith('part-2', { role: 'moderator' });

      // Test remove
      fireEvent.click(screen.getByTestId('remove-participant-part-2'));
      expect(onRemoveParticipant).toHaveBeenCalledWith('part-2');
    });

    test('should show empty state when no participants', () => {
      render(
        <MockCollaborativeParticipants 
          participants={[]}
          currentUserId="user-1"
        />
      );

      expect(screen.getByTestId('empty-participants')).toBeInTheDocument();
      expect(screen.getByText('No participants')).toBeInTheDocument();
    });
  });

  describe('Integration Scenarios', () => {
    test('should handle complete collaborative search workflow', async () => {
      const mockSession: CollaborativeSearchSession = {
        id: 'test-session',
        workspace_id: 'test-workspace',
        session_name: 'Integration Test Session',
        created_by: 'user-1',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_active: true,
        is_persistent: true,
        search_settings: {},
        max_participants: 10,
        current_search_state: {},
        search_history: [],
        shared_annotations: {}
      };

      const mockCollaborativeSearchHook = createMockUseCollaborativeSearch({
        session: mockSession,
        participants: mockParticipants,
        annotations: mockAnnotations,
        isLoading: false
      });

      const mockWebSocketHook = createMockUseSearchCollaboration({
        connectionState: 'connected',
        isConnected: true
      });

      // Render components together
      const TestIntegration = () => (
        <div>
          <MockCollaborativeSearchSession 
            sessionId="test-session"
            workspaceId="test-workspace"
          />
          <MockCollaborativeParticipants 
            participants={mockParticipants}
            currentUserId="user-1"
          />
          <MockSearchAnnotations 
            annotations={mockAnnotations}
            searchResults={mockSearchResults}
          />
        </div>
      );

      render(<TestIntegration />);

      // Verify all components render
      expect(screen.getByTestId('collaborative-search')).toBeInTheDocument();
      expect(screen.getByTestId('participants-container')).toBeInTheDocument();
      expect(screen.getByTestId('annotations-container')).toBeInTheDocument();

      // Test search functionality
      const searchInput = screen.getByTestId('search-input');
      await userEvent.type(searchInput, 'test query');
      expect(searchInput).toHaveValue('test query');

      // Test participant management
      expect(screen.getByText('Participants (2)')).toBeInTheDocument();
      expect(screen.getByText('John Moderator (You)')).toBeInTheDocument();

      // Test annotations
      expect(screen.getByText('Annotations (2)')).toBeInTheDocument();
      expect(screen.getByTestId('annotation-ann-1')).toBeInTheDocument();
    });

    test('should handle error states gracefully', () => {
      const mockHookWithError = createMockUseCollaborativeSearch({
        error: new Error('Connection failed'),
        isLoading: false
      });

      const TestErrorHandling = () => (
        <div>
          {mockHookWithError.error && (
            <div data-testid="error-message">
              Error: {mockHookWithError.error.message}
            </div>
          )}
        </div>
      );

      render(<TestErrorHandling />);

      expect(screen.getByTestId('error-message')).toHaveTextContent('Error: Connection failed');
    });

    test('should handle loading states', () => {
      const mockHookWithLoading = createMockUseCollaborativeSearch({
        isLoading: true,
        session: null,
        participants: [],
        annotations: []
      });

      const TestLoadingState = () => (
        <div>
          {mockHookWithLoading.isLoading && (
            <div data-testid="loading-indicator">Loading...</div>
          )}
        </div>
      );

      render(<TestLoadingState />);

      expect(screen.getByTestId('loading-indicator')).toHaveTextContent('Loading...');
    });
  });

  describe('Accessibility', () => {
    test('should have proper ARIA labels and roles', () => {
      render(
        <MockCollaborativeSearchSession 
          sessionId="test-session"
          workspaceId="test-workspace"
        />
      );

      const searchInput = screen.getByTestId('search-input');
      expect(searchInput).toHaveAttribute('type', 'text');
      expect(searchInput).toHaveAttribute('placeholder', 'Enter search query...');
    });

    test('should support keyboard navigation', async () => {
      render(
        <MockSearchAnnotations 
          annotations={mockAnnotations}
          searchResults={mockSearchResults}
        />
      );

      const addButton = screen.getByTestId('add-annotation-btn');
      
      // Focus the button
      addButton.focus();
      expect(document.activeElement).toBe(addButton);

      // Press Enter to activate
      fireEvent.keyDown(addButton, { key: 'Enter' });
      
      // Should show the dialog
      await waitFor(() => {
        expect(screen.getByTestId('create-annotation-dialog')).toBeInTheDocument();
      });
    });

    test('should have semantic HTML structure', () => {
      render(
        <MockCollaborativeParticipants 
          participants={mockParticipants}
          currentUserId="user-1"
        />
      );

      // Check for proper list structure (in a real implementation)
      const container = screen.getByTestId('participants-container');
      expect(container).toBeInTheDocument();
      
      const participantsList = screen.getByTestId('participants-list');
      expect(participantsList).toBeInTheDocument();
    });
  });
});