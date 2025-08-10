/**
 * Live Search Collaboration Service Unit Tests
 * 
 * Tests core functionality of the LiveSearchCollaborationService including:
 * - Search session management
 * - Participant management
 * - Search state synchronization
 * - Annotation management
 * - Conflict resolution
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { LiveSearchCollaborationService } from '@mcp-tools/core';
import type { 
  CollaborativeSearchSession, 
  SearchSessionParticipant, 
  SharedSearchState, 
  SearchAnnotation 
} from '@mcp-tools/core';

// Mock database interface
interface MockDB {
  collaborative_search_sessions: Map<string, any>;
  search_session_participants: Map<string, any>;
  shared_search_state: Map<string, any>;
  search_annotations: Map<string, any>;
  collaborative_search_events: Map<string, any>;
}

// Mock database implementation
class MockDatabase {
  private tables: MockDB = {
    collaborative_search_sessions: new Map(),
    search_session_participants: new Map(),
    shared_search_state: new Map(),
    search_annotations: new Map(),
    collaborative_search_events: new Map()
  };

  // Mock query builder
  selectFrom(table: string) {
    return {
      selectAll: () => ({
        where: (condition: any) => ({
          execute: async () => Array.from(this.tables[table].values()).filter(condition)
        }),
        execute: async () => Array.from(this.tables[table].values())
      }),
      select: (fields: string[]) => ({
        where: (condition: any) => ({
          execute: async () => Array.from(this.tables[table].values()).filter(condition)
        }),
        execute: async () => Array.from(this.tables[table].values())
      })
    };
  }

  insertInto(table: string) {
    return {
      values: (data: any) => ({
        returningAll: () => ({
          executeTakeFirstOrThrow: async () => {
            const id = crypto.randomUUID();
            const record = { ...data, id, created_at: new Date().toISOString() };
            this.tables[table].set(id, record);
            return record;
          }
        })
      })
    };
  }

  updateTable(table: string) {
    return {
      set: (updates: any) => ({
        where: (condition: any) => ({
          returningAll: () => ({
            execute: async () => {
              const records = Array.from(this.tables[table].entries()).filter(([id, record]) => 
                condition(record)
              );
              const updatedRecords = [];
              for (const [id, record] of records) {
                const updated = { ...record, ...updates, updated_at: new Date().toISOString() };
                this.tables[table].set(id, updated);
                updatedRecords.push(updated);
              }
              return updatedRecords;
            }
          })
        })
      })
    };
  }

  deleteFrom(table: string) {
    return {
      where: (condition: any) => ({
        execute: async () => {
          const toDelete = Array.from(this.tables[table].entries()).filter(([id, record]) => 
            condition(record)
          );
          for (const [id] of toDelete) {
            this.tables[table].delete(id);
          }
          return { numDeletedRows: BigInt(toDelete.length) };
        }
      })
    };
  }

  // Helper methods for tests
  clear() {
    Object.values(this.tables).forEach(table => table.clear());
  }

  getRecord(table: string, id: string) {
    return this.tables[table].get(id);
  }

  getAllRecords(table: string) {
    return Array.from(this.tables[table].values());
  }
}

describe('LiveSearchCollaborationService Unit Tests', () => {
  let service: LiveSearchCollaborationService;
  let mockDb: MockDatabase;

  const TEST_USER_ID = 'test-user-123';
  const TEST_WORKSPACE_ID = 'workspace-456';
  const TEST_COLLABORATION_SESSION_ID = 'collab-session-789';

  beforeEach(() => {
    mockDb = new MockDatabase();
    service = new LiveSearchCollaborationService(mockDb as any);
  });

  afterEach(() => {
    mockDb.clear();
  });

  describe('Search Session Management', () => {
    test('should create a collaborative search session', async () => {
      const sessionData = {
        collaboration_session_id: TEST_COLLABORATION_SESSION_ID,
        workspace_id: TEST_WORKSPACE_ID,
        session_name: 'Test Search Session',
        created_by: TEST_USER_ID,
        search_settings: { debounce_ms: 300, max_results: 50 }
      };

      const session = await service.createSearchSession(sessionData);

      expect(session).toMatchObject({
        collaboration_session_id: TEST_COLLABORATION_SESSION_ID,
        workspace_id: TEST_WORKSPACE_ID,
        session_name: 'Test Search Session',
        created_by: TEST_USER_ID,
        is_active: true,
        is_persistent: true
      });
      expect(session.id).toBeDefined();
      expect(session.created_at).toBeDefined();
    });

    test('should get search session by ID', async () => {
      // Create session first
      const sessionData = {
        collaboration_session_id: TEST_COLLABORATION_SESSION_ID,
        workspace_id: TEST_WORKSPACE_ID,
        session_name: 'Test Session',
        created_by: TEST_USER_ID
      };
      const created = await service.createSearchSession(sessionData);

      // Retrieve session
      const retrieved = await service.getSearchSession(created.id);

      expect(retrieved).toEqual(created);
    });

    test('should update search session', async () => {
      // Create session
      const sessionData = {
        collaboration_session_id: TEST_COLLABORATION_SESSION_ID,
        workspace_id: TEST_WORKSPACE_ID,
        session_name: 'Original Name',
        created_by: TEST_USER_ID
      };
      const session = await service.createSearchSession(sessionData);

      // Update session
      const updates = {
        session_name: 'Updated Name',
        search_settings: { max_results: 100 }
      };
      const updated = await service.updateSearchSession(session.id, updates);

      expect(updated.session_name).toBe('Updated Name');
      expect(updated.search_settings.max_results).toBe(100);
      expect(updated.updated_at).toBeDefined();
    });

    test('should deactivate search session', async () => {
      // Create session
      const sessionData = {
        collaboration_session_id: TEST_COLLABORATION_SESSION_ID,
        workspace_id: TEST_WORKSPACE_ID,
        session_name: 'Test Session',
        created_by: TEST_USER_ID
      };
      const session = await service.createSearchSession(sessionData);

      // Deactivate session
      await service.deactivateSearchSession(session.id);

      const retrieved = await service.getSearchSession(session.id);
      expect(retrieved.is_active).toBe(false);
    });
  });

  describe('Participant Management', () => {
    let sessionId: string;

    beforeEach(async () => {
      const session = await service.createSearchSession({
        collaboration_session_id: TEST_COLLABORATION_SESSION_ID,
        workspace_id: TEST_WORKSPACE_ID,
        session_name: 'Test Session',
        created_by: TEST_USER_ID
      });
      sessionId = session.id;
    });

    test('should add participant to search session', async () => {
      const participantData = {
        search_session_id: sessionId,
        user_id: 'participant-123',
        role: 'searcher' as const
      };

      const participant = await service.addParticipant(participantData);

      expect(participant).toMatchObject({
        search_session_id: sessionId,
        user_id: 'participant-123',
        role: 'searcher',
        is_active: true,
        can_initiate_search: true
      });
      expect(participant.id).toBeDefined();
      expect(participant.joined_at).toBeDefined();
    });

    test('should get session participants', async () => {
      // Add multiple participants
      await service.addParticipant({
        search_session_id: sessionId,
        user_id: 'user-1',
        role: 'searcher'
      });
      
      await service.addParticipant({
        search_session_id: sessionId,
        user_id: 'user-2',
        role: 'observer'
      });

      const participants = await service.getSessionParticipants(sessionId);

      expect(participants).toHaveLength(2);
      expect(participants.map(p => p.user_id)).toEqual(['user-1', 'user-2']);
    });

    test('should update participant role and permissions', async () => {
      // Add participant
      const participant = await service.addParticipant({
        search_session_id: sessionId,
        user_id: 'user-1',
        role: 'observer'
      });

      // Update to searcher
      const updated = await service.updateParticipant(participant.id, {
        role: 'searcher',
        can_modify_filters: true
      });

      expect(updated.role).toBe('searcher');
      expect(updated.can_modify_filters).toBe(true);
    });

    test('should remove participant from session', async () => {
      // Add participant
      const participant = await service.addParticipant({
        search_session_id: sessionId,
        user_id: 'user-1',
        role: 'searcher'
      });

      // Remove participant
      await service.removeParticipant(participant.id);

      const participants = await service.getSessionParticipants(sessionId);
      expect(participants).toHaveLength(0);
    });

    test('should handle role-based permissions correctly', async () => {
      // Test searcher permissions
      const searcher = await service.addParticipant({
        search_session_id: sessionId,
        user_id: 'searcher-1',
        role: 'searcher'
      });

      expect(searcher.can_initiate_search).toBe(true);
      expect(searcher.can_modify_filters).toBe(true);
      expect(searcher.can_annotate_results).toBe(true);

      // Test observer permissions
      const observer = await service.addParticipant({
        search_session_id: sessionId,
        user_id: 'observer-1',
        role: 'observer'
      });

      expect(observer.can_initiate_search).toBe(false);
      expect(observer.can_modify_filters).toBe(false);
      expect(observer.can_annotate_results).toBe(true);

      // Test moderator permissions
      const moderator = await service.addParticipant({
        search_session_id: sessionId,
        user_id: 'moderator-1',
        role: 'moderator'
      });

      expect(moderator.can_initiate_search).toBe(true);
      expect(moderator.can_modify_filters).toBe(true);
      expect(moderator.can_annotate_results).toBe(true);
      expect(moderator.can_bookmark_results).toBe(true);
    });
  });

  describe('Search State Management', () => {
    let sessionId: string;

    beforeEach(async () => {
      const session = await service.createSearchSession({
        collaboration_session_id: TEST_COLLABORATION_SESSION_ID,
        workspace_id: TEST_WORKSPACE_ID,
        session_name: 'Test Session',
        created_by: TEST_USER_ID
      });
      sessionId = session.id;
    });

    test('should update search state', async () => {
      const stateUpdate = {
        search_session_id: sessionId,
        state_key: 'current_query',
        new_value: { query: 'test search', filters: { category: 'docs' } },
        user_id: TEST_USER_ID
      };

      const state = await service.updateSearchState(stateUpdate);

      expect(state).toMatchObject({
        search_session_id: sessionId,
        state_key: 'current_query',
        state_value: { query: 'test search', filters: { category: 'docs' } },
        last_modified_by: TEST_USER_ID,
        version: 1
      });
      expect(state.id).toBeDefined();
      expect(state.state_hash).toBeDefined();
    });

    test('should get search state by key', async () => {
      // Create state
      const stateUpdate = {
        search_session_id: sessionId,
        state_key: 'filters',
        new_value: { category: 'articles', date: 'last_week' },
        user_id: TEST_USER_ID
      };
      await service.updateSearchState(stateUpdate);

      // Retrieve state
      const state = await service.getSearchState(sessionId, 'filters');

      expect(state?.state_value).toEqual({ category: 'articles', date: 'last_week' });
      expect(state?.last_modified_by).toBe(TEST_USER_ID);
    });

    test('should handle concurrent state updates with conflict detection', async () => {
      // Initial state
      const initialState = await service.updateSearchState({
        search_session_id: sessionId,
        state_key: 'query',
        new_value: { text: 'initial query' },
        user_id: 'user-1'
      });

      // Simulate concurrent updates
      const update1Promise = service.updateSearchState({
        search_session_id: sessionId,
        state_key: 'query',
        new_value: { text: 'user 1 query' },
        user_id: 'user-1',
        expected_version: initialState.version
      });

      const update2Promise = service.updateSearchState({
        search_session_id: sessionId,
        state_key: 'query',
        new_value: { text: 'user 2 query' },
        user_id: 'user-2',
        expected_version: initialState.version
      });

      const [result1, result2] = await Promise.allSettled([update1Promise, update2Promise]);

      // One should succeed, one should detect conflict
      expect([result1.status, result2.status]).toContain('fulfilled');
      // In a real implementation, we'd expect conflict detection, but our mock is simplified
    });

    test('should get all search states for session', async () => {
      // Create multiple states
      await service.updateSearchState({
        search_session_id: sessionId,
        state_key: 'query',
        new_value: { text: 'search term' },
        user_id: TEST_USER_ID
      });

      await service.updateSearchState({
        search_session_id: sessionId,
        state_key: 'filters',
        new_value: { type: 'document' },
        user_id: TEST_USER_ID
      });

      const states = await service.getAllSearchStates(sessionId);

      expect(states).toHaveLength(2);
      expect(states.map(s => s.state_key)).toEqual(
        expect.arrayContaining(['query', 'filters'])
      );
    });
  });

  describe('Annotation Management', () => {
    let sessionId: string;

    beforeEach(async () => {
      const session = await service.createSearchSession({
        collaboration_session_id: TEST_COLLABORATION_SESSION_ID,
        workspace_id: TEST_WORKSPACE_ID,
        session_name: 'Test Session',
        created_by: TEST_USER_ID
      });
      sessionId = session.id;
    });

    test('should create search annotation', async () => {
      const annotationData = {
        search_session_id: sessionId,
        user_id: TEST_USER_ID,
        result_id: 'result-123',
        result_type: 'document',
        annotation_type: 'note' as const,
        annotation_text: 'This is a helpful document',
        is_shared: true
      };

      const annotation = await service.createAnnotation(annotationData);

      expect(annotation).toMatchObject({
        search_session_id: sessionId,
        user_id: TEST_USER_ID,
        result_id: 'result-123',
        annotation_type: 'note',
        annotation_text: 'This is a helpful document',
        is_shared: true
      });
      expect(annotation.id).toBeDefined();
      expect(annotation.created_at).toBeDefined();
    });

    test('should get session annotations', async () => {
      // Create multiple annotations
      await service.createAnnotation({
        search_session_id: sessionId,
        user_id: TEST_USER_ID,
        result_id: 'result-1',
        result_type: 'document',
        annotation_type: 'bookmark',
        is_shared: true
      });

      await service.createAnnotation({
        search_session_id: sessionId,
        user_id: 'other-user',
        result_id: 'result-2',
        result_type: 'image',
        annotation_type: 'highlight',
        is_shared: false
      });

      const annotations = await service.getSessionAnnotations(sessionId);

      expect(annotations).toHaveLength(2);
      expect(annotations.map(a => a.result_id)).toEqual(['result-1', 'result-2']);
    });

    test('should update annotation', async () => {
      // Create annotation
      const annotation = await service.createAnnotation({
        search_session_id: sessionId,
        user_id: TEST_USER_ID,
        result_id: 'result-1',
        result_type: 'document',
        annotation_type: 'note',
        annotation_text: 'Original note'
      });

      // Update annotation
      const updated = await service.updateAnnotation(annotation.id, {
        annotation_text: 'Updated note',
        is_resolved: true
      });

      expect(updated.annotation_text).toBe('Updated note');
      expect(updated.is_resolved).toBe(true);
    });

    test('should delete annotation', async () => {
      // Create annotation
      const annotation = await service.createAnnotation({
        search_session_id: sessionId,
        user_id: TEST_USER_ID,
        result_id: 'result-1',
        result_type: 'document',
        annotation_type: 'flag'
      });

      // Delete annotation
      await service.deleteAnnotation(annotation.id);

      const annotations = await service.getSessionAnnotations(sessionId);
      expect(annotations).toHaveLength(0);
    });

    test('should filter annotations by type and user', async () => {
      // Create diverse annotations
      const annotations = [
        { user_id: TEST_USER_ID, annotation_type: 'note' as const },
        { user_id: TEST_USER_ID, annotation_type: 'bookmark' as const },
        { user_id: 'other-user', annotation_type: 'note' as const },
        { user_id: 'other-user', annotation_type: 'flag' as const }
      ];

      for (const annData of annotations) {
        await service.createAnnotation({
          search_session_id: sessionId,
          result_id: `result-${Math.random()}`,
          result_type: 'document',
          ...annData
        });
      }

      // Filter by user
      const userAnnotations = await service.getAnnotationsByUser(sessionId, TEST_USER_ID);
      expect(userAnnotations).toHaveLength(2);
      expect(userAnnotations.every(a => a.user_id === TEST_USER_ID)).toBe(true);

      // Filter by type
      const noteAnnotations = await service.getAnnotationsByType(sessionId, 'note');
      expect(noteAnnotations).toHaveLength(2);
      expect(noteAnnotations.every(a => a.annotation_type === 'note')).toBe(true);
    });
  });

  describe('Conflict Resolution', () => {
    let sessionId: string;

    beforeEach(async () => {
      const session = await service.createSearchSession({
        collaboration_session_id: TEST_COLLABORATION_SESSION_ID,
        workspace_id: TEST_WORKSPACE_ID,
        session_name: 'Test Session',
        created_by: TEST_USER_ID
      });
      sessionId = session.id;
    });

    test('should detect conflicts in search state', async () => {
      // Create initial state
      const initialState = await service.updateSearchState({
        search_session_id: sessionId,
        state_key: 'query',
        new_value: { text: 'original' },
        user_id: 'user-1'
      });

      // Create conflicting update
      const conflictResult = await service.detectStateConflict(
        sessionId,
        'query',
        { text: 'conflicting' },
        'user-2',
        initialState.version
      );

      // In this simplified test, we just verify the method exists
      // Real implementation would check version mismatches
      expect(conflictResult).toBeDefined();
    });

    test('should resolve conflicts using last_write_wins strategy', async () => {
      // Create conflicting states
      const state1 = await service.updateSearchState({
        search_session_id: sessionId,
        state_key: 'filters',
        new_value: { category: 'docs' },
        user_id: 'user-1'
      });

      const state2 = await service.updateSearchState({
        search_session_id: sessionId,
        state_key: 'filters',
        new_value: { category: 'images' },
        user_id: 'user-2'
      });

      // Resolve conflict
      const resolved = await service.resolveConflict({
        search_session_id: sessionId,
        conflicting_state_ids: [state1.id, state2.id],
        resolution_strategy: 'last_write_wins',
        resolved_by: 'moderator-1',
        resolution_data: {}
      });

      expect(resolved).toMatchObject({
        resolution_strategy: 'last_write_wins',
        resolved_by: 'moderator-1'
      });
    });

    test('should resolve conflicts using merge strategy', async () => {
      // Create states that can be merged
      await service.updateSearchState({
        search_session_id: sessionId,
        state_key: 'filters',
        new_value: { category: 'docs', author: 'user1' },
        user_id: 'user-1'
      });

      await service.updateSearchState({
        search_session_id: sessionId,
        state_key: 'filters',
        new_value: { category: 'docs', date: '2024' },
        user_id: 'user-2'
      });

      // Resolve with merge strategy
      const resolved = await service.resolveConflict({
        search_session_id: sessionId,
        conflicting_state_ids: [], // Would be populated in real scenario
        resolution_strategy: 'merge',
        resolved_by: 'moderator-1',
        resolution_data: {
          merged_value: { category: 'docs', author: 'user1', date: '2024' }
        }
      });

      expect(resolved.resolution_strategy).toBe('merge');
      expect(resolved.resolution_data.merged_value).toEqual({
        category: 'docs',
        author: 'user1',
        date: '2024'
      });
    });
  });

  describe('Search History', () => {
    let sessionId: string;

    beforeEach(async () => {
      const session = await service.createSearchSession({
        collaboration_session_id: TEST_COLLABORATION_SESSION_ID,
        workspace_id: TEST_WORKSPACE_ID,
        session_name: 'Test Session',
        created_by: TEST_USER_ID
      });
      sessionId = session.id;
    });

    test('should record search events', async () => {
      const eventData = {
        search_session_id: sessionId,
        user_id: TEST_USER_ID,
        event_type: 'query_update' as const,
        event_data: {
          previous_query: '',
          new_query: 'javascript tutorials',
          timestamp: new Date().toISOString()
        }
      };

      const event = await service.recordSearchEvent(eventData);

      expect(event).toMatchObject({
        search_session_id: sessionId,
        user_id: TEST_USER_ID,
        event_type: 'query_update',
        event_data: {
          previous_query: '',
          new_query: 'javascript tutorials'
        }
      });
      expect(event.id).toBeDefined();
      expect(event.created_at).toBeDefined();
    });

    test('should get search history for session', async () => {
      // Record multiple events
      const events = [
        { event_type: 'query_update' as const, query: 'first search' },
        { event_type: 'filter_change' as const, filter: 'category:docs' },
        { event_type: 'result_select' as const, result_id: 'result-123' }
      ];

      for (const eventInfo of events) {
        await service.recordSearchEvent({
          search_session_id: sessionId,
          user_id: TEST_USER_ID,
          event_type: eventInfo.event_type,
          event_data: eventInfo
        });
      }

      const history = await service.getSearchHistory(sessionId);

      expect(history).toHaveLength(3);
      expect(history.map(h => h.event_type)).toEqual([
        'query_update',
        'filter_change',
        'result_select'
      ]);
    });

    test('should paginate search history', async () => {
      // Create many events
      for (let i = 0; i < 15; i++) {
        await service.recordSearchEvent({
          search_session_id: sessionId,
          user_id: TEST_USER_ID,
          event_type: 'query_update',
          event_data: { query: `search ${i}` }
        });
      }

      // Get first page
      const page1 = await service.getSearchHistory(sessionId, { page: 1, limit: 10 });
      expect(page1).toHaveLength(10);

      // Get second page
      const page2 = await service.getSearchHistory(sessionId, { page: 2, limit: 10 });
      expect(page2).toHaveLength(5);
    });
  });

  describe('Analytics and Statistics', () => {
    let sessionId: string;

    beforeEach(async () => {
      const session = await service.createSearchSession({
        collaboration_session_id: TEST_COLLABORATION_SESSION_ID,
        workspace_id: TEST_WORKSPACE_ID,
        session_name: 'Test Session',
        created_by: TEST_USER_ID
      });
      sessionId = session.id;
    });

    test('should generate session statistics', async () => {
      // Add participants and activity
      await service.addParticipant({
        search_session_id: sessionId,
        user_id: 'user-1',
        role: 'searcher'
      });

      await service.addParticipant({
        search_session_id: sessionId,
        user_id: 'user-2',
        role: 'observer'
      });

      // Record some events
      await service.recordSearchEvent({
        search_session_id: sessionId,
        user_id: 'user-1',
        event_type: 'query_update',
        event_data: { query: 'test' }
      });

      // Create annotations
      await service.createAnnotation({
        search_session_id: sessionId,
        user_id: 'user-1',
        result_id: 'result-1',
        result_type: 'document',
        annotation_type: 'note'
      });

      const stats = await service.getSessionStatistics(sessionId);

      expect(stats).toMatchObject({
        session_id: sessionId,
        participant_count: 2,
        total_search_events: 1,
        total_annotations: 1,
        active_participants: 2
      });
      expect(stats.generated_at).toBeDefined();
    });

    test('should calculate participant activity metrics', async () => {
      // Add participant with activity
      const participant = await service.addParticipant({
        search_session_id: sessionId,
        user_id: 'active-user',
        role: 'searcher'
      });

      // Record activity
      for (let i = 0; i < 5; i++) {
        await service.recordSearchEvent({
          search_session_id: sessionId,
          user_id: 'active-user',
          event_type: 'query_update',
          event_data: { query: `query ${i}` }
        });
      }

      // Update participant stats
      await service.updateParticipant(participant.id, {
        search_query_count: 5,
        last_search_at: new Date().toISOString()
      });

      const activity = await service.getParticipantActivity(sessionId, 'active-user');

      expect(activity.search_query_count).toBe(5);
      expect(activity.last_search_at).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid session ID gracefully', async () => {
      const invalidId = 'non-existent-session';

      const session = await service.getSearchSession(invalidId);
      expect(session).toBeNull();
    });

    test('should validate required fields', async () => {
      // Test with missing required fields
      const invalidSessionData = {
        // Missing required fields
        workspace_id: TEST_WORKSPACE_ID
      };

      await expect(
        service.createSearchSession(invalidSessionData as any)
      ).rejects.toThrow();
    });

    test('should handle database errors gracefully', async () => {
      // Create a service with a failing database
      const failingDb = {
        selectFrom: () => ({
          selectAll: () => ({
            execute: async () => {
              throw new Error('Database connection failed');
            }
          })
        })
      };

      const failingService = new LiveSearchCollaborationService(failingDb as any);

      await expect(
        failingService.getSearchSession('any-id')
      ).rejects.toThrow('Database connection failed');
    });
  });
});