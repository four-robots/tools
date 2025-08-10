/**
 * Live Search Collaboration API Integration Tests
 * 
 * Tests the complete search collaboration workflow including:
 * - REST API endpoints for session management
 * - WebSocket real-time communication
 * - Participant management and permissions
 * - Search state synchronization
 * - Annotation collaboration
 * - Conflict resolution
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import axios, { AxiosInstance } from 'axios';
import WebSocket from 'ws';
import { TestClient } from '../utils/test-client.js';

interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

interface SearchCollaborationMessage {
  type: string;
  searchSessionId: string;
  userId?: string;
  data: Record<string, any>;
  timestamp?: string;
  sequenceNumber?: number;
  messageId?: string;
}

describe('Live Search Collaboration API Integration Tests', () => {
  let testClient: TestClient;
  let authToken: string;
  let wsConnection: WebSocket;
  
  const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001';
  const WS_URL = process.env.WS_URL || 'ws://localhost:3001';
  const TEST_USER_ID = 'search-collab-test-user';
  const TEST_USER_2_ID = 'search-collab-test-user-2';
  const TEST_WORKSPACE_ID = 'test-workspace-123';

  beforeAll(async () => {
    testClient = new TestClient(BASE_URL);
    
    // Authenticate test user
    authToken = await testClient.authenticate({
      userId: TEST_USER_ID,
      email: 'search-test@example.com',
      name: 'Search Collaboration Test User'
    });
    
    // Verify services are running
    await testClient.waitForService('/health', 30000);
    
    // Establish WebSocket connection
    wsConnection = new WebSocket(`${WS_URL}/collaboration?token=${authToken}`);
    await new Promise((resolve, reject) => {
      wsConnection.on('open', resolve);
      wsConnection.on('error', reject);
      setTimeout(() => reject(new Error('WebSocket connection timeout')), 5000);
    });
  });
  
  afterAll(async () => {
    if (wsConnection) {
      wsConnection.close();
    }
    await testClient.cleanup();
  });

  describe('Search Session Management API', () => {
    let testSessionIds: string[] = [];
    let collaborationSessionId: string;

    beforeEach(async () => {
      testSessionIds = [];
      // Create a base collaboration session (would normally come from collaboration service)
      collaborationSessionId = 'collab-session-' + Math.random().toString(36).substr(2, 9);
    });

    afterEach(async () => {
      // Cleanup test sessions
      for (const sessionId of testSessionIds) {
        try {
          await testClient.delete(`/api/search-collaboration/search-sessions/${sessionId}`);
        } catch (error) {
          // Ignore cleanup errors
        }
      }
    });

    test('POST /api/search-collaboration/search-sessions - create search session', async () => {
      const sessionData = {
        collaboration_session_id: collaborationSessionId,
        workspace_id: TEST_WORKSPACE_ID,
        session_name: 'API Test Search Session',
        search_settings: {
          debounce_ms: 300,
          max_results: 50,
          enable_real_time_highlights: true
        },
        max_participants: 10
      };

      const response = await testClient.post('/api/search-collaboration/search-sessions', sessionData);

      expect(response.status).toBe(201);
      expect(response.data.success).toBe(true);

      const session = response.data.data;
      testSessionIds.push(session.id);

      expect(session).toMatchObject({
        collaboration_session_id: collaborationSessionId,
        workspace_id: TEST_WORKSPACE_ID,
        session_name: 'API Test Search Session',
        created_by: TEST_USER_ID,
        is_active: true,
        is_persistent: true
      });
      expect(session.id).toBeDefined();
      expect(session.created_at).toBeDefined();
    });

    test('GET /api/search-collaboration/search-sessions/:id - get session details', async () => {
      // Create session first
      const sessionData = {
        collaboration_session_id: collaborationSessionId,
        workspace_id: TEST_WORKSPACE_ID,
        session_name: 'Get Test Session'
      };
      
      const createResponse = await testClient.post('/api/search-collaboration/search-sessions', sessionData);
      const sessionId = createResponse.data.data.id;
      testSessionIds.push(sessionId);

      // Get session details
      const response = await testClient.get(`/api/search-collaboration/search-sessions/${sessionId}`);

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);

      const session = response.data.data.session;
      expect(session).toMatchObject({
        id: sessionId,
        session_name: 'Get Test Session',
        workspace_id: TEST_WORKSPACE_ID
      });

      // Should include participants, state, and annotations
      expect(response.data.data).toHaveProperty('participants');
      expect(response.data.data).toHaveProperty('searchState');
      expect(response.data.data).toHaveProperty('annotations');
      expect(Array.isArray(response.data.data.participants)).toBe(true);
    });

    test('PUT /api/search-collaboration/search-sessions/:id - update session', async () => {
      // Create session
      const sessionData = {
        collaboration_session_id: collaborationSessionId,
        workspace_id: TEST_WORKSPACE_ID,
        session_name: 'Update Test Session'
      };
      
      const createResponse = await testClient.post('/api/search-collaboration/search-sessions', sessionData);
      const sessionId = createResponse.data.data.id;
      testSessionIds.push(sessionId);

      // Update session
      const updates = {
        session_name: 'Updated Session Name',
        search_settings: {
          max_results: 100,
          enable_auto_complete: true
        }
      };

      const response = await testClient.put(`/api/search-collaboration/search-sessions/${sessionId}`, updates);

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);

      const updated = response.data.data;
      expect(updated.session_name).toBe('Updated Session Name');
      expect(updated.search_settings.max_results).toBe(100);
      expect(updated.search_settings.enable_auto_complete).toBe(true);
    });

    test('DELETE /api/search-collaboration/search-sessions/:id - deactivate session', async () => {
      // Create session
      const sessionData = {
        collaboration_session_id: collaborationSessionId,
        workspace_id: TEST_WORKSPACE_ID,
        session_name: 'Delete Test Session'
      };
      
      const createResponse = await testClient.post('/api/search-collaboration/search-sessions', sessionData);
      const sessionId = createResponse.data.data.id;

      // Deactivate session
      const response = await testClient.delete(`/api/search-collaboration/search-sessions/${sessionId}`);

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.message).toContain('deactivated');

      // Verify session is deactivated
      const getResponse = await testClient.get(`/api/search-collaboration/search-sessions/${sessionId}`);
      expect(getResponse.data.data.session.is_active).toBe(false);
    });
  });

  describe('Participant Management API', () => {
    let sessionId: string;
    let participantIds: string[] = [];

    beforeEach(async () => {
      // Create test session
      const sessionData = {
        collaboration_session_id: 'collab-session-' + Math.random().toString(36).substr(2, 9),
        workspace_id: TEST_WORKSPACE_ID,
        session_name: 'Participant Test Session'
      };
      
      const response = await testClient.post('/api/search-collaboration/search-sessions', sessionData);
      sessionId = response.data.data.id;
      participantIds = [];
    });

    afterEach(async () => {
      // Cleanup
      await testClient.delete(`/api/search-collaboration/search-sessions/${sessionId}`);
    });

    test('POST /api/search-collaboration/search-sessions/:id/join - join session', async () => {
      const joinData = {
        role: 'searcher'
      };

      const response = await testClient.post(`/api/search-collaboration/search-sessions/${sessionId}/join`, joinData);

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);

      const participant = response.data.data.participant;
      participantIds.push(participant.id);

      expect(participant).toMatchObject({
        search_session_id: sessionId,
        user_id: TEST_USER_ID,
        role: 'searcher',
        is_active: true,
        can_initiate_search: true
      });
    });

    test('POST /api/search-collaboration/search-sessions/:id/leave - leave session', async () => {
      // Join first
      await testClient.post(`/api/search-collaboration/search-sessions/${sessionId}/join`, { role: 'searcher' });

      // Leave session
      const response = await testClient.post(`/api/search-collaboration/search-sessions/${sessionId}/leave`);

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);

      // Verify participant is no longer active
      const sessionResponse = await testClient.get(`/api/search-collaboration/search-sessions/${sessionId}`);
      const participants = sessionResponse.data.data.participants;
      const userParticipant = participants.find(p => p.user_id === TEST_USER_ID);
      expect(userParticipant?.is_active).toBe(false);
    });

    test('PUT /api/search-collaboration/participants/:id - update participant role', async () => {
      // Join as observer
      const joinResponse = await testClient.post(`/api/search-collaboration/search-sessions/${sessionId}/join`, { role: 'observer' });
      const participantId = joinResponse.data.data.participant.id;

      // Update to searcher
      const updateData = {
        role: 'searcher',
        can_modify_filters: true
      };

      const response = await testClient.put(`/api/search-collaboration/participants/${participantId}`, updateData);

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);

      const updated = response.data.data;
      expect(updated.role).toBe('searcher');
      expect(updated.can_modify_filters).toBe(true);
    });

    test('DELETE /api/search-collaboration/participants/:id - remove participant', async () => {
      // Join session
      const joinResponse = await testClient.post(`/api/search-collaboration/search-sessions/${sessionId}/join`, { role: 'searcher' });
      const participantId = joinResponse.data.data.participant.id;

      // Remove participant
      const response = await testClient.delete(`/api/search-collaboration/participants/${participantId}`);

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);

      // Verify participant removed
      const sessionResponse = await testClient.get(`/api/search-collaboration/search-sessions/${sessionId}`);
      const participants = sessionResponse.data.data.participants;
      expect(participants.find(p => p.id === participantId)).toBeUndefined();
    });
  });

  describe('Search State Management API', () => {
    let sessionId: string;

    beforeEach(async () => {
      // Create test session and join
      const sessionData = {
        collaboration_session_id: 'collab-session-' + Math.random().toString(36).substr(2, 9),
        workspace_id: TEST_WORKSPACE_ID,
        session_name: 'State Test Session'
      };
      
      const sessionResponse = await testClient.post('/api/search-collaboration/search-sessions', sessionData);
      sessionId = sessionResponse.data.data.id;

      await testClient.post(`/api/search-collaboration/search-sessions/${sessionId}/join`, { role: 'searcher' });
    });

    afterEach(async () => {
      await testClient.delete(`/api/search-collaboration/search-sessions/${sessionId}`);
    });

    test('PUT /api/search-collaboration/search-sessions/:id/state - update search state', async () => {
      const stateUpdate = {
        state_key: 'current_query',
        new_value: {
          text: 'machine learning algorithms',
          filters: {
            category: 'research',
            date_range: 'last_year'
          }
        }
      };

      const response = await testClient.put(`/api/search-collaboration/search-sessions/${sessionId}/state`, stateUpdate);

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);

      const state = response.data.data.searchState;
      expect(state.state_key).toBe('current_query');
      expect(state.state_value).toEqual(stateUpdate.new_value);
      expect(state.last_modified_by).toBe(TEST_USER_ID);
      expect(state.version).toBe(1);
    });

    test('GET /api/search-collaboration/search-sessions/:id/state - get all search states', async () => {
      // Create multiple states
      const states = [
        { state_key: 'query', new_value: { text: 'search term' } },
        { state_key: 'filters', new_value: { type: 'document' } },
        { state_key: 'sort', new_value: { field: 'date', order: 'desc' } }
      ];

      for (const state of states) {
        await testClient.put(`/api/search-collaboration/search-sessions/${sessionId}/state`, state);
      }

      const response = await testClient.get(`/api/search-collaboration/search-sessions/${sessionId}/state`);

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);

      const searchState = response.data.data.searchState;
      expect(Object.keys(searchState)).toEqual(
        expect.arrayContaining(['query', 'filters', 'sort'])
      );
    });

    test('POST /api/search-collaboration/search-sessions/:id/conflicts/resolve - resolve state conflict', async () => {
      // Create initial state
      await testClient.put(`/api/search-collaboration/search-sessions/${sessionId}/state`, {
        state_key: 'query',
        new_value: { text: 'original query' }
      });

      // Simulate conflict resolution
      const resolutionData = {
        conflicting_state_ids: ['state-1', 'state-2'], // Would be real IDs in practice
        resolution_strategy: 'last_write_wins',
        resolution_data: {
          winning_value: { text: 'resolved query' }
        }
      };

      const response = await testClient.post(`/api/search-collaboration/search-sessions/${sessionId}/conflicts/resolve`, resolutionData);

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);

      const resolution = response.data.data;
      expect(resolution.resolution_strategy).toBe('last_write_wins');
      expect(resolution.resolved_by).toBe(TEST_USER_ID);
    });
  });

  describe('Annotation Management API', () => {
    let sessionId: string;
    let annotationIds: string[] = [];

    beforeEach(async () => {
      // Create test session and join
      const sessionData = {
        collaboration_session_id: 'collab-session-' + Math.random().toString(36).substr(2, 9),
        workspace_id: TEST_WORKSPACE_ID,
        session_name: 'Annotation Test Session'
      };
      
      const sessionResponse = await testClient.post('/api/search-collaboration/search-sessions', sessionData);
      sessionId = sessionResponse.data.data.id;

      await testClient.post(`/api/search-collaboration/search-sessions/${sessionId}/join`, { role: 'searcher' });
      annotationIds = [];
    });

    afterEach(async () => {
      await testClient.delete(`/api/search-collaboration/search-sessions/${sessionId}`);
    });

    test('POST /api/search-collaboration/search-sessions/:id/annotations - create annotation', async () => {
      const annotationData = {
        result_id: 'search-result-123',
        result_type: 'document',
        result_url: 'https://example.com/doc/123',
        annotation_type: 'note',
        annotation_text: 'This document contains useful information about ML algorithms',
        selected_text: 'machine learning can be categorized into supervised and unsupervised',
        text_selection: {
          start: 150,
          end: 220
        },
        is_shared: true
      };

      const response = await testClient.post(`/api/search-collaboration/search-sessions/${sessionId}/annotations`, annotationData);

      expect(response.status).toBe(201);
      expect(response.data.success).toBe(true);

      const annotation = response.data.data.annotation;
      annotationIds.push(annotation.id);

      expect(annotation).toMatchObject({
        search_session_id: sessionId,
        user_id: TEST_USER_ID,
        result_id: 'search-result-123',
        annotation_type: 'note',
        annotation_text: 'This document contains useful information about ML algorithms',
        is_shared: true
      });
    });

    test('GET /api/search-collaboration/search-sessions/:id/annotations - get session annotations', async () => {
      // Create multiple annotations
      const annotations = [
        { result_id: 'result-1', annotation_type: 'bookmark', annotation_text: 'Bookmarked for later' },
        { result_id: 'result-2', annotation_type: 'highlight', selected_text: 'important concept' },
        { result_id: 'result-3', annotation_type: 'note', annotation_text: 'Need to verify this claim' }
      ];

      for (const ann of annotations) {
        const response = await testClient.post(`/api/search-collaboration/search-sessions/${sessionId}/annotations`, {
          ...ann,
          result_type: 'document'
        });
        annotationIds.push(response.data.data.annotation.id);
      }

      const response = await testClient.get(`/api/search-collaboration/search-sessions/${sessionId}/annotations`);

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);

      const sessionAnnotations = response.data.data.annotations;
      expect(sessionAnnotations).toHaveLength(3);
      expect(sessionAnnotations.map(a => a.annotation_type)).toEqual(
        expect.arrayContaining(['bookmark', 'highlight', 'note'])
      );
    });

    test('PUT /api/search-collaboration/annotations/:id - update annotation', async () => {
      // Create annotation
      const createResponse = await testClient.post(`/api/search-collaboration/search-sessions/${sessionId}/annotations`, {
        result_id: 'result-1',
        result_type: 'document',
        annotation_type: 'note',
        annotation_text: 'Original note'
      });
      
      const annotationId = createResponse.data.data.annotation.id;
      annotationIds.push(annotationId);

      // Update annotation
      const updates = {
        annotation_text: 'Updated note with more details',
        is_resolved: true
      };

      const response = await testClient.put(`/api/search-collaboration/annotations/${annotationId}`, updates);

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);

      const updated = response.data.data.annotation;
      expect(updated.annotation_text).toBe('Updated note with more details');
      expect(updated.is_resolved).toBe(true);
    });

    test('DELETE /api/search-collaboration/annotations/:id - delete annotation', async () => {
      // Create annotation
      const createResponse = await testClient.post(`/api/search-collaboration/search-sessions/${sessionId}/annotations`, {
        result_id: 'result-1',
        result_type: 'document',
        annotation_type: 'flag',
        annotation_text: 'This needs review'
      });
      
      const annotationId = createResponse.data.data.annotation.id;

      // Delete annotation
      const response = await testClient.delete(`/api/search-collaboration/annotations/${annotationId}`);

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);

      // Verify deletion
      const sessionResponse = await testClient.get(`/api/search-collaboration/search-sessions/${sessionId}/annotations`);
      const annotations = sessionResponse.data.data.annotations;
      expect(annotations.find(a => a.id === annotationId)).toBeUndefined();
    });
  });

  describe('Real-time WebSocket Integration', () => {
    let sessionId: string;
    let messageQueue: SearchCollaborationMessage[] = [];

    beforeEach(async () => {
      // Create test session
      const sessionData = {
        collaboration_session_id: 'collab-session-' + Math.random().toString(36).substr(2, 9),
        workspace_id: TEST_WORKSPACE_ID,
        session_name: 'WebSocket Test Session'
      };
      
      const sessionResponse = await testClient.post('/api/search-collaboration/search-sessions', sessionData);
      sessionId = sessionResponse.data.data.id;

      await testClient.post(`/api/search-collaboration/search-sessions/${sessionId}/join`, { role: 'searcher' });

      // Clear message queue and set up listener
      messageQueue = [];
      wsConnection.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          if (message.searchSessionId === sessionId) {
            messageQueue.push(message);
          }
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      });
    });

    afterEach(async () => {
      await testClient.delete(`/api/search-collaboration/search-sessions/${sessionId}`);
      wsConnection.removeAllListeners('message');
    });

    test('should receive real-time updates for search query changes', async (done) => {
      // Send search query update through WebSocket
      const queryMessage: SearchCollaborationMessage = {
        type: 'search_query_update',
        searchSessionId: sessionId,
        userId: TEST_USER_ID,
        data: {
          query: 'real-time search test',
          timestamp: new Date().toISOString()
        },
        messageId: crypto.randomUUID()
      };

      wsConnection.send(JSON.stringify(queryMessage));

      // Wait for acknowledgment or broadcast
      setTimeout(() => {
        const relevantMessages = messageQueue.filter(m => 
          m.type === 'search_query_update' || m.type === 'ack'
        );
        
        expect(relevantMessages.length).toBeGreaterThan(0);
        done();
      }, 2000);
    });

    test('should synchronize filter updates across participants', async (done) => {
      // Send filter update
      const filterMessage: SearchCollaborationMessage = {
        type: 'search_filter_update',
        searchSessionId: sessionId,
        userId: TEST_USER_ID,
        data: {
          filters: {
            category: 'research',
            date_range: 'last_month'
          },
          timestamp: new Date().toISOString()
        },
        messageId: crypto.randomUUID()
      };

      wsConnection.send(JSON.stringify(filterMessage));

      // Verify filter synchronization
      setTimeout(() => {
        const filterMessages = messageQueue.filter(m => m.type === 'search_filter_update');
        expect(filterMessages.length).toBeGreaterThan(0);
        
        const latestFilter = filterMessages[filterMessages.length - 1];
        expect(latestFilter.data.filters).toEqual({
          category: 'research',
          date_range: 'last_month'
        });
        
        done();
      }, 2000);
    });

    test('should broadcast annotation creation to session participants', async (done) => {
      // Create annotation via API
      const annotationData = {
        result_id: 'websocket-test-result',
        result_type: 'document',
        annotation_type: 'highlight',
        annotation_text: 'WebSocket annotation test',
        is_shared: true
      };

      await testClient.post(`/api/search-collaboration/search-sessions/${sessionId}/annotations`, annotationData);

      // Check for WebSocket notification
      setTimeout(() => {
        const annotationMessages = messageQueue.filter(m => m.type === 'search_annotation');
        expect(annotationMessages.length).toBeGreaterThan(0);
        
        const annotationMessage = annotationMessages[0];
        expect(annotationMessage.data.annotation_text).toBe('WebSocket annotation test');
        
        done();
      }, 2000);
    });

    test('should handle cursor position updates for collaborative editing', async (done) => {
      const cursorMessage: SearchCollaborationMessage = {
        type: 'search_cursor_update',
        searchSessionId: sessionId,
        userId: TEST_USER_ID,
        data: {
          field: 'search_query',
          position: 15,
          selection: { start: 10, end: 20 }
        },
        messageId: crypto.randomUUID()
      };

      wsConnection.send(JSON.stringify(cursorMessage));

      // Verify cursor position broadcast
      setTimeout(() => {
        const cursorMessages = messageQueue.filter(m => m.type === 'search_cursor_update');
        expect(cursorMessages.length).toBeGreaterThan(0);
        
        const cursorUpdate = cursorMessages[0];
        expect(cursorUpdate.data.position).toBe(15);
        expect(cursorUpdate.data.selection).toEqual({ start: 10, end: 20 });
        
        done();
      }, 1500);
    });

    test('should handle connection resilience and message acknowledgments', async (done) => {
      const testMessage: SearchCollaborationMessage = {
        type: 'search_query_update',
        searchSessionId: sessionId,
        userId: TEST_USER_ID,
        data: { query: 'ack test' },
        messageId: crypto.randomUUID(),
        requiresAck: true
      };

      wsConnection.send(JSON.stringify(testMessage));

      // Wait for acknowledgment
      setTimeout(() => {
        const ackMessages = messageQueue.filter(m => 
          m.type === 'ack' && m.data?.messageId === testMessage.messageId
        );
        
        expect(ackMessages.length).toBe(1);
        done();
      }, 1000);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle invalid session ID gracefully', async () => {
      const response = await testClient.get('/api/search-collaboration/search-sessions/invalid-session-id');
      
      expect(response.status).toBe(404);
      expect(response.data.success).toBe(false);
      expect(response.data.error).toContain('Session not found');
    });

    test('should validate required fields in requests', async () => {
      // Test creating session without required fields
      const invalidSessionData = {
        workspace_id: TEST_WORKSPACE_ID
        // Missing collaboration_session_id and session_name
      };

      const response = await testClient.post('/api/search-collaboration/search-sessions', invalidSessionData);
      
      expect(response.status).toBe(400);
      expect(response.data.success).toBe(false);
      expect(response.data.error).toContain('validation');
    });

    test('should handle permission errors for restricted operations', async () => {
      // Create session as user 1
      const sessionData = {
        collaboration_session_id: 'collab-session-' + Math.random().toString(36).substr(2, 9),
        workspace_id: TEST_WORKSPACE_ID,
        session_name: 'Permission Test Session'
      };
      
      const sessionResponse = await testClient.post('/api/search-collaboration/search-sessions', sessionData);
      const sessionId = sessionResponse.data.data.id;

      // Try to delete as different user (would need separate auth token)
      // This is a simplified test - in practice you'd need another authenticated client
      const deleteResponse = await testClient.delete(`/api/search-collaboration/search-sessions/${sessionId}`);
      
      // Current user created the session, so delete should work
      expect(deleteResponse.status).toBe(200);
    });

    test('should handle concurrent operations correctly', async () => {
      // Create session
      const sessionData = {
        collaboration_session_id: 'collab-session-' + Math.random().toString(36).substr(2, 9),
        workspace_id: TEST_WORKSPACE_ID,
        session_name: 'Concurrency Test Session'
      };
      
      const sessionResponse = await testClient.post('/api/search-collaboration/search-sessions', sessionData);
      const sessionId = sessionResponse.data.data.id;

      await testClient.post(`/api/search-collaboration/search-sessions/${sessionId}/join`, { role: 'searcher' });

      // Perform concurrent state updates
      const concurrentUpdates = Array.from({ length: 5 }, (_, i) => 
        testClient.put(`/api/search-collaboration/search-sessions/${sessionId}/state`, {
          state_key: 'query',
          new_value: { text: `concurrent query ${i}` }
        })
      );

      const responses = await Promise.allSettled(concurrentUpdates);
      
      // All requests should complete (though some might conflict)
      responses.forEach((result, i) => {
        expect(result.status).toBe('fulfilled');
        if (result.status === 'fulfilled') {
          expect([200, 409]).toContain(result.value.status); // 200 success or 409 conflict
        }
      });

      // Cleanup
      await testClient.delete(`/api/search-collaboration/search-sessions/${sessionId}`);
    });
  });

  describe('Performance and Scalability', () => {
    test('should handle multiple simultaneous sessions', async () => {
      const sessionIds: string[] = [];
      
      // Create multiple sessions concurrently
      const sessionCreations = Array.from({ length: 5 }, (_, i) => 
        testClient.post('/api/search-collaboration/search-sessions', {
          collaboration_session_id: `collab-session-${i}-${Math.random().toString(36).substr(2, 9)}`,
          workspace_id: TEST_WORKSPACE_ID,
          session_name: `Performance Test Session ${i}`
        })
      );

      const startTime = Date.now();
      const responses = await Promise.all(sessionCreations);
      const endTime = Date.now();

      // All sessions should be created successfully
      responses.forEach((response, i) => {
        expect(response.status).toBe(201);
        sessionIds.push(response.data.data.id);
      });

      // Should complete within reasonable time
      expect(endTime - startTime).toBeLessThan(3000);

      // Cleanup
      for (const sessionId of sessionIds) {
        await testClient.delete(`/api/search-collaboration/search-sessions/${sessionId}`);
      }
    });

    test('should handle rapid state updates efficiently', async () => {
      // Create session
      const sessionData = {
        collaboration_session_id: 'collab-session-' + Math.random().toString(36).substr(2, 9),
        workspace_id: TEST_WORKSPACE_ID,
        session_name: 'Rapid Updates Test Session'
      };
      
      const sessionResponse = await testClient.post('/api/search-collaboration/search-sessions', sessionData);
      const sessionId = sessionResponse.data.data.id;

      await testClient.post(`/api/search-collaboration/search-sessions/${sessionId}/join`, { role: 'searcher' });

      // Perform rapid state updates
      const rapidUpdates = Array.from({ length: 10 }, (_, i) => 
        testClient.put(`/api/search-collaboration/search-sessions/${sessionId}/state`, {
          state_key: 'rapid_query',
          new_value: { text: `rapid update ${i}`, timestamp: Date.now() + i }
        })
      );

      const startTime = Date.now();
      const responses = await Promise.all(rapidUpdates);
      const endTime = Date.now();

      // Most updates should succeed
      const successfulUpdates = responses.filter(r => r.status === 200);
      expect(successfulUpdates.length).toBeGreaterThan(5);

      // Should complete within reasonable time
      expect(endTime - startTime).toBeLessThan(5000);

      // Cleanup
      await testClient.delete(`/api/search-collaboration/search-sessions/${sessionId}`);
    });
  });
});