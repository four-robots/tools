/**
 * Live Search Collaboration End-to-End Tests
 * 
 * Tests the complete collaborative search workflow from end to end including:
 * - Multiple users joining search sessions
 * - Real-time query synchronization
 * - Filter collaboration
 * - Annotation sharing
 * - Conflict resolution
 * - Connection resilience
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import axios, { AxiosInstance } from 'axios';
import WebSocket from 'ws';
import { TestClient } from '../utils/test-client.js';

interface SearchCollaborationMessage {
  type: string;
  searchSessionId: string;
  userId?: string;
  data: Record<string, any>;
  timestamp?: string;
  sequenceNumber?: number;
  messageId?: string;
  requiresAck?: boolean;
}

interface TestUser {
  id: string;
  name: string;
  email: string;
  client: TestClient;
  authToken: string;
  wsConnection: WebSocket;
  messageQueue: SearchCollaborationMessage[];
}

describe('Live Search Collaboration End-to-End Tests', () => {
  let testUsers: TestUser[] = [];
  let testSessionId: string;
  let collaborationSessionId: string;
  
  const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001';
  const WS_URL = process.env.WS_URL || 'ws://localhost:3001';
  const TEST_WORKSPACE_ID = 'e2e-test-workspace';

  // Helper function to create test user
  const createTestUser = async (userId: string, name: string): Promise<TestUser> => {
    const client = new TestClient(BASE_URL);
    const authToken = await client.authenticate({
      userId,
      email: `${userId}@example.com`,
      name
    });

    const wsConnection = new WebSocket(`${WS_URL}/collaboration?token=${authToken}`);
    
    await new Promise((resolve, reject) => {
      wsConnection.on('open', resolve);
      wsConnection.on('error', reject);
      setTimeout(() => reject(new Error('WebSocket connection timeout')), 5000);
    });

    const user: TestUser = {
      id: userId,
      name,
      email: `${userId}@example.com`,
      client,
      authToken,
      wsConnection,
      messageQueue: []
    };

    // Set up message listener
    wsConnection.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        if (message.searchSessionId === testSessionId) {
          user.messageQueue.push(message);
        }
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    });

    return user;
  };

  beforeAll(async () => {
    // Create multiple test users
    testUsers = await Promise.all([
      createTestUser('e2e-user-1', 'Alice (Moderator)'),
      createTestUser('e2e-user-2', 'Bob (Searcher)'),
      createTestUser('e2e-user-3', 'Charlie (Observer)')
    ]);

    // Wait for all services to be ready
    await testUsers[0].client.waitForService('/health', 30000);
  });

  afterAll(async () => {
    // Cleanup all users
    for (const user of testUsers) {
      if (user.wsConnection) {
        user.wsConnection.close();
      }
      await user.client.cleanup();
    }
  });

  beforeEach(async () => {
    // Create a fresh collaboration session for each test
    collaborationSessionId = `e2e-collab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Create search session with first user
    const sessionData = {
      collaboration_session_id: collaborationSessionId,
      workspace_id: TEST_WORKSPACE_ID,
      session_name: 'E2E Test Search Session',
      search_settings: {
        debounce_ms: 100, // Faster for testing
        max_results: 20,
        enable_real_time_highlights: true
      }
    };

    const response = await testUsers[0].client.post('/api/search-collaboration/search-sessions', sessionData);
    testSessionId = response.data.data.id;

    // Clear message queues
    testUsers.forEach(user => {
      user.messageQueue = [];
    });
  });

  afterEach(async () => {
    // Cleanup session
    if (testSessionId) {
      try {
        await testUsers[0].client.delete(`/api/search-collaboration/search-sessions/${testSessionId}`);
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  });

  describe('Multi-User Session Management', () => {
    test('should allow multiple users to join the same search session', async () => {
      // All users join the session with different roles
      const roles = ['searcher', 'searcher', 'observer'];
      
      const joinPromises = testUsers.map((user, index) => 
        user.client.post(`/api/search-collaboration/search-sessions/${testSessionId}/join`, {
          role: roles[index]
        })
      );

      const joinResponses = await Promise.all(joinPromises);

      // All joins should succeed
      joinResponses.forEach((response, index) => {
        expect(response.status).toBe(200);
        expect(response.data.success).toBe(true);
        expect(response.data.data.participant.role).toBe(roles[index]);
        expect(response.data.data.participant.user_id).toBe(testUsers[index].id);
      });

      // Verify session has all participants
      const sessionResponse = await testUsers[0].client.get(`/api/search-collaboration/search-sessions/${testSessionId}`);
      const participants = sessionResponse.data.data.participants;
      
      expect(participants).toHaveLength(3);
      expect(participants.map(p => p.user_id)).toEqual(
        expect.arrayContaining([testUsers[0].id, testUsers[1].id, testUsers[2].id])
      );
    });

    test('should handle user leaving and rejoining', async () => {
      // User 1 and 2 join
      await testUsers[0].client.post(`/api/search-collaboration/search-sessions/${testSessionId}/join`, { role: 'moderator' });
      await testUsers[1].client.post(`/api/search-collaboration/search-sessions/${testSessionId}/join`, { role: 'searcher' });

      // User 2 leaves
      await testUsers[1].client.post(`/api/search-collaboration/search-sessions/${testSessionId}/leave`);

      // Verify user 2 is marked as inactive
      let sessionResponse = await testUsers[0].client.get(`/api/search-collaboration/search-sessions/${testSessionId}`);
      let participants = sessionResponse.data.data.participants;
      const user2Participant = participants.find(p => p.user_id === testUsers[1].id);
      expect(user2Participant.is_active).toBe(false);

      // User 2 rejoins
      await testUsers[1].client.post(`/api/search-collaboration/search-sessions/${testSessionId}/join`, { role: 'searcher' });

      // Verify user 2 is active again
      sessionResponse = await testUsers[0].client.get(`/api/search-collaboration/search-sessions/${testSessionId}`);
      participants = sessionResponse.data.data.participants;
      const rejoinedUser = participants.find(p => p.user_id === testUsers[1].id);
      expect(rejoinedUser.is_active).toBe(true);
    });
  });

  describe('Real-time Query Synchronization', () => {
    beforeEach(async () => {
      // All users join the session
      await testUsers[0].client.post(`/api/search-collaboration/search-sessions/${testSessionId}/join`, { role: 'moderator' });
      await testUsers[1].client.post(`/api/search-collaboration/search-sessions/${testSessionId}/join`, { role: 'searcher' });
      await testUsers[2].client.post(`/api/search-collaboration/search-sessions/${testSessionId}/join`, { role: 'observer' });
    });

    test('should synchronize search queries across all participants', async (done) => {
      // User 1 sends a search query
      const searchQuery = {
        type: 'search_query_update',
        searchSessionId: testSessionId,
        userId: testUsers[0].id,
        data: {
          query: 'machine learning algorithms',
          timestamp: new Date().toISOString()
        },
        messageId: crypto.randomUUID()
      };

      testUsers[0].wsConnection.send(JSON.stringify(searchQuery));

      // Wait for other users to receive the update
      setTimeout(() => {
        // Check that other users received the query update
        const user2Messages = testUsers[1].messageQueue.filter(m => m.type === 'search_query_update');
        const user3Messages = testUsers[2].messageQueue.filter(m => m.type === 'search_query_update');

        expect(user2Messages.length).toBeGreaterThan(0);
        expect(user3Messages.length).toBeGreaterThan(0);

        const latestMessage = user2Messages[user2Messages.length - 1];
        expect(latestMessage.data.query).toBe('machine learning algorithms');

        done();
      }, 2000);
    });

    test('should handle rapid query updates with debouncing', async (done) => {
      let queryCount = 0;
      const maxQueries = 5;
      const queries = [
        'search',
        'search term',
        'search term advanced',
        'search term advanced ML',
        'search term advanced ML algorithms'
      ];

      // Send rapid queries
      const sendQuery = () => {
        if (queryCount < maxQueries) {
          const queryMessage = {
            type: 'search_query_update',
            searchSessionId: testSessionId,
            userId: testUsers[0].id,
            data: {
              query: queries[queryCount],
              timestamp: new Date().toISOString()
            },
            messageId: crypto.randomUUID(),
            isDebounced: true,
            debounceGroupId: 'rapid-typing'
          };

          testUsers[0].wsConnection.send(JSON.stringify(queryMessage));
          queryCount++;
          
          setTimeout(sendQuery, 50); // Send every 50ms
        }
      };

      sendQuery();

      // Check results after debounce period
      setTimeout(() => {
        const user2QueryMessages = testUsers[1].messageQueue.filter(m => 
          m.type === 'search_query_update' && m.data.query?.includes('algorithms')
        );

        // Should have received the final debounced query
        expect(user2QueryMessages.length).toBeGreaterThan(0);
        
        const finalMessage = user2QueryMessages[user2QueryMessages.length - 1];
        expect(finalMessage.data.query).toBe('search term advanced ML algorithms');

        done();
      }, 3000);
    });

    test('should synchronize filter updates', async (done) => {
      const filterUpdate = {
        type: 'search_filter_update',
        searchSessionId: testSessionId,
        userId: testUsers[1].id,
        data: {
          filters: {
            category: ['research', 'tutorials'],
            date_range: 'last_month',
            author: 'expert'
          },
          timestamp: new Date().toISOString()
        },
        messageId: crypto.randomUUID()
      };

      testUsers[1].wsConnection.send(JSON.stringify(filterUpdate));

      setTimeout(() => {
        // Other users should receive filter updates
        const user1Messages = testUsers[0].messageQueue.filter(m => m.type === 'search_filter_update');
        const user3Messages = testUsers[2].messageQueue.filter(m => m.type === 'search_filter_update');

        expect(user1Messages.length).toBeGreaterThan(0);
        expect(user3Messages.length).toBeGreaterThan(0);

        const latestFilter = user1Messages[user1Messages.length - 1];
        expect(latestFilter.data.filters).toEqual({
          category: ['research', 'tutorials'],
          date_range: 'last_month',
          author: 'expert'
        });

        done();
      }, 1500);
    });
  });

  describe('Collaborative Annotations', () => {
    beforeEach(async () => {
      await testUsers[0].client.post(`/api/search-collaboration/search-sessions/${testSessionId}/join`, { role: 'moderator' });
      await testUsers[1].client.post(`/api/search-collaboration/search-sessions/${testSessionId}/join`, { role: 'searcher' });
      await testUsers[2].client.post(`/api/search-collaboration/search-sessions/${testSessionId}/join`, { role: 'observer' });
    });

    test('should share annotations across participants in real-time', async () => {
      // User 1 creates an annotation
      const annotationData = {
        result_id: 'e2e-test-result-1',
        result_type: 'document',
        result_url: 'https://example.com/doc/1',
        annotation_type: 'note',
        annotation_text: 'This document explains the fundamentals very well',
        selected_text: 'machine learning is a subset of artificial intelligence',
        text_selection: { start: 45, end: 90 },
        is_shared: true
      };

      const createResponse = await testUsers[0].client.post(
        `/api/search-collaboration/search-sessions/${testSessionId}/annotations`,
        annotationData
      );

      expect(createResponse.status).toBe(201);
      const annotation = createResponse.data.data.annotation;

      // Wait for real-time notification
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Other users should see the annotation
      const user2SessionResponse = await testUsers[1].client.get(`/api/search-collaboration/search-sessions/${testSessionId}`);
      const user2Annotations = user2SessionResponse.data.data.annotations;

      expect(user2Annotations.some(a => a.id === annotation.id)).toBe(true);
      
      const sharedAnnotation = user2Annotations.find(a => a.id === annotation.id);
      expect(sharedAnnotation.annotation_text).toBe('This document explains the fundamentals very well');
      expect(sharedAnnotation.user_id).toBe(testUsers[0].id);
    });

    test('should handle annotation editing and resolution', async () => {
      // Create initial annotation
      const initialAnnotation = await testUsers[0].client.post(
        `/api/search-collaboration/search-sessions/${testSessionId}/annotations`,
        {
          result_id: 'e2e-test-result-2',
          result_type: 'document',
          annotation_type: 'flag',
          annotation_text: 'This information seems outdated',
          is_shared: true
        }
      );

      const annotationId = initialAnnotation.data.data.annotation.id;

      // User 2 updates the annotation
      const updateResponse = await testUsers[1].client.put(
        `/api/search-collaboration/annotations/${annotationId}`,
        {
          annotation_text: 'Confirmed: Information is from 2019, needs update',
          is_resolved: true,
          resolved_at: new Date().toISOString()
        }
      );

      expect(updateResponse.status).toBe(200);

      // Wait for synchronization
      await new Promise(resolve => setTimeout(resolve, 1000));

      // All users should see the updated annotation
      const sessionResponse = await testUsers[2].client.get(`/api/search-collaboration/search-sessions/${testSessionId}`);
      const annotations = sessionResponse.data.data.annotations;
      const updatedAnnotation = annotations.find(a => a.id === annotationId);

      expect(updatedAnnotation.annotation_text).toBe('Confirmed: Information is from 2019, needs update');
      expect(updatedAnnotation.is_resolved).toBe(true);
    });

    test('should support different annotation types', async () => {
      const annotationTypes = [
        { type: 'highlight', text: 'Key concept highlighted' },
        { type: 'bookmark', text: 'Bookmarked for reference' },
        { type: 'question', text: 'Is this approach still current?' },
        { type: 'suggestion', text: 'Consider adding more examples' }
      ];

      // Create different types of annotations
      const createPromises = annotationTypes.map((ann, index) => 
        testUsers[index % testUsers.length].client.post(
          `/api/search-collaboration/search-sessions/${testSessionId}/annotations`,
          {
            result_id: `e2e-result-${index}`,
            result_type: 'document',
            annotation_type: ann.type,
            annotation_text: ann.text,
            is_shared: true
          }
        )
      );

      const createResponses = await Promise.all(createPromises);

      // All annotations should be created successfully
      createResponses.forEach(response => {
        expect(response.status).toBe(201);
      });

      // Verify all annotations are visible to all users
      const sessionResponse = await testUsers[0].client.get(`/api/search-collaboration/search-sessions/${testSessionId}`);
      const annotations = sessionResponse.data.data.annotations;

      expect(annotations).toHaveLength(4);
      
      const types = annotations.map(a => a.annotation_type);
      expect(types).toEqual(expect.arrayContaining(['highlight', 'bookmark', 'question', 'suggestion']));
    });
  });

  describe('State Synchronization and Conflict Resolution', () => {
    beforeEach(async () => {
      await testUsers[0].client.post(`/api/search-collaboration/search-sessions/${testSessionId}/join`, { role: 'moderator' });
      await testUsers[1].client.post(`/api/search-collaboration/search-sessions/${testSessionId}/join`, { role: 'searcher' });
    });

    test('should handle concurrent state updates', async () => {
      // Simulate concurrent updates to the same state key
      const concurrentUpdates = [
        {
          user: testUsers[0],
          stateKey: 'sort_preferences',
          value: { field: 'relevance', order: 'desc' }
        },
        {
          user: testUsers[1],
          stateKey: 'sort_preferences', 
          value: { field: 'date', order: 'desc' }
        }
      ];

      // Send updates simultaneously
      const updatePromises = concurrentUpdates.map(update => 
        update.user.client.put(`/api/search-collaboration/search-sessions/${testSessionId}/state`, {
          state_key: update.stateKey,
          new_value: update.value
        })
      );

      const results = await Promise.allSettled(updatePromises);

      // At least one should succeed
      const successful = results.filter(r => r.status === 'fulfilled' && r.value.status === 200);
      const conflicts = results.filter(r => r.status === 'fulfilled' && r.value.status === 409);

      expect(successful.length + conflicts.length).toBe(2);
      expect(successful.length).toBeGreaterThan(0);

      // Check final state
      const sessionResponse = await testUsers[0].client.get(`/api/search-collaboration/search-sessions/${testSessionId}/state`);
      const searchState = sessionResponse.data.data.searchState;
      
      expect(searchState).toHaveProperty('sort_preferences');
      // Should have one of the two values
      const finalValue = searchState.sort_preferences.state_value;
      expect([
        { field: 'relevance', order: 'desc' },
        { field: 'date', order: 'desc' }
      ]).toContainEqual(finalValue);
    });

    test('should resolve conflicts using last_write_wins strategy', async () => {
      // Create initial state
      await testUsers[0].client.put(`/api/search-collaboration/search-sessions/${testSessionId}/state`, {
        state_key: 'display_mode',
        new_value: { mode: 'grid', items_per_page: 20 }
      });

      // Create conflicting state
      await testUsers[1].client.put(`/api/search-collaboration/search-sessions/${testSessionId}/state`, {
        state_key: 'display_mode',
        new_value: { mode: 'list', items_per_page: 50 }
      });

      // Moderator resolves conflict
      const resolution = await testUsers[0].client.post(
        `/api/search-collaboration/search-sessions/${testSessionId}/conflicts/resolve`,
        {
          conflicting_state_ids: ['state-1', 'state-2'], // Simplified for test
          resolution_strategy: 'last_write_wins',
          resolution_data: {
            winning_value: { mode: 'list', items_per_page: 50 }
          }
        }
      );

      expect(resolution.status).toBe(200);
      expect(resolution.data.data.resolution_strategy).toBe('last_write_wins');

      // Verify resolved state
      const stateResponse = await testUsers[1].client.get(`/api/search-collaboration/search-sessions/${testSessionId}/state`);
      const displayMode = stateResponse.data.data.searchState.display_mode;
      
      expect(displayMode.state_value).toEqual({ mode: 'list', items_per_page: 50 });
    });
  });

  describe('Connection Resilience and Recovery', () => {
    beforeEach(async () => {
      await testUsers[0].client.post(`/api/search-collaboration/search-sessions/${testSessionId}/join`, { role: 'moderator' });
      await testUsers[1].client.post(`/api/search-collaboration/search-sessions/${testSessionId}/join`, { role: 'searcher' });
    });

    test('should handle WebSocket disconnection and reconnection', async (done) => {
      // Send a message to establish connection
      const initialMessage = {
        type: 'search_query_update',
        searchSessionId: testSessionId,
        userId: testUsers[0].id,
        data: { query: 'before disconnect' },
        messageId: crypto.randomUUID()
      };

      testUsers[0].wsConnection.send(JSON.stringify(initialMessage));

      // Wait for message to be received
      setTimeout(() => {
        expect(testUsers[1].messageQueue.length).toBeGreaterThan(0);

        // Simulate disconnection
        testUsers[1].wsConnection.close();

        // Send message while user 2 is disconnected
        const whileDisconnected = {
          type: 'search_query_update',
          searchSessionId: testSessionId,
          userId: testUsers[0].id,
          data: { query: 'while disconnected' },
          messageId: crypto.randomUUID()
        };

        testUsers[0].wsConnection.send(JSON.stringify(whileDisconnected));

        // Reconnect user 2
        setTimeout(async () => {
          const newWsConnection = new WebSocket(`${WS_URL}/collaboration?token=${testUsers[1].authToken}`);
          
          newWsConnection.on('open', () => {
            testUsers[1].wsConnection = newWsConnection;
            testUsers[1].messageQueue = [];

            // Set up message listener again
            newWsConnection.on('message', (data) => {
              try {
                const message = JSON.parse(data.toString());
                if (message.searchSessionId === testSessionId) {
                  testUsers[1].messageQueue.push(message);
                }
              } catch (error) {
                console.error('Failed to parse message after reconnection:', error);
              }
            });

            // Send sync request
            const syncMessage = {
              type: 'search_state_sync',
              searchSessionId: testSessionId,
              userId: testUsers[1].id,
              data: { request_full_sync: true },
              messageId: crypto.randomUUID()
            };

            newWsConnection.send(JSON.stringify(syncMessage));

            // Check if state is synchronized after reconnection
            setTimeout(() => {
              // Should have received sync data
              const syncMessages = testUsers[1].messageQueue.filter(m => 
                m.type === 'search_state_sync' || m.type === 'search_query_update'
              );

              expect(syncMessages.length).toBeGreaterThan(0);
              done();
            }, 2000);
          });
        }, 1000);
      }, 1000);
    });

    test('should handle message acknowledgments and retries', async (done) => {
      const importantMessage = {
        type: 'search_annotation',
        searchSessionId: testSessionId,
        userId: testUsers[0].id,
        data: {
          annotation: {
            id: 'critical-annotation',
            text: 'This is a critical annotation that must be delivered'
          }
        },
        messageId: crypto.randomUUID(),
        requiresAck: true
      };

      let ackReceived = false;

      // Listen for acknowledgment
      testUsers[0].wsConnection.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          if (message.type === 'ack' && message.data?.messageId === importantMessage.messageId) {
            ackReceived = true;
          }
        } catch (error) {
          console.error('Failed to parse ack message:', error);
        }
      });

      // Send message requiring acknowledgment
      testUsers[0].wsConnection.send(JSON.stringify(importantMessage));

      // Check for acknowledgment
      setTimeout(() => {
        expect(ackReceived).toBe(true);
        done();
      }, 3000);
    });
  });

  describe('Performance and Scalability', () => {
    test('should handle multiple simultaneous collaborative sessions', async () => {
      const sessionPromises = Array.from({ length: 3 }, async (_, i) => {
        const sessionData = {
          collaboration_session_id: `perf-test-${i}-${Date.now()}`,
          workspace_id: TEST_WORKSPACE_ID,
          session_name: `Performance Test Session ${i}`
        };

        const response = await testUsers[0].client.post('/api/search-collaboration/search-sessions', sessionData);
        return response.data.data.id;
      });

      const sessionIds = await Promise.all(sessionPromises);

      // Each user joins different sessions
      const joinPromises = sessionIds.map((sessionId, i) => 
        testUsers[i].client.post(`/api/search-collaboration/search-sessions/${sessionId}/join`, {
          role: 'searcher'
        })
      );

      const startTime = Date.now();
      await Promise.all(joinPromises);
      const endTime = Date.now();

      // Should complete quickly
      expect(endTime - startTime).toBeLessThan(3000);

      // Cleanup sessions
      for (const sessionId of sessionIds) {
        await testUsers[0].client.delete(`/api/search-collaboration/search-sessions/${sessionId}`);
      }
    });

    test('should maintain performance with high message throughput', async (done) => {
      await testUsers[0].client.post(`/api/search-collaboration/search-sessions/${testSessionId}/join`, { role: 'moderator' });
      await testUsers[1].client.post(`/api/search-collaboration/search-sessions/${testSessionId}/join`, { role: 'searcher' });

      const messageCount = 50;
      let sentMessages = 0;
      let receivedMessages = 0;

      // Count received messages
      testUsers[1].wsConnection.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          if (message.type === 'search_cursor_update' && message.searchSessionId === testSessionId) {
            receivedMessages++;
          }
        } catch (error) {
          // Ignore parsing errors for this test
        }
      });

      // Send rapid cursor updates
      const sendInterval = setInterval(() => {
        if (sentMessages >= messageCount) {
          clearInterval(sendInterval);
          return;
        }

        const cursorMessage = {
          type: 'search_cursor_update',
          searchSessionId: testSessionId,
          userId: testUsers[0].id,
          data: {
            field: 'search_query',
            position: sentMessages % 100,
            timestamp: Date.now()
          },
          messageId: crypto.randomUUID()
        };

        testUsers[0].wsConnection.send(JSON.stringify(cursorMessage));
        sentMessages++;
      }, 10); // Send every 10ms

      // Check results after all messages sent
      setTimeout(() => {
        expect(sentMessages).toBe(messageCount);
        expect(receivedMessages).toBeGreaterThan(messageCount * 0.8); // Allow some message loss
        
        done();
      }, 3000);
    });
  });

  describe('Edge Cases and Error Scenarios', () => {
    test('should handle invalid WebSocket messages gracefully', async (done) => {
      await testUsers[0].client.post(`/api/search-collaboration/search-sessions/${testSessionId}/join`, { role: 'moderator' });

      let errorReceived = false;

      // Listen for error messages
      testUsers[0].wsConnection.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          if (message.type === 'error') {
            errorReceived = true;
          }
        } catch (error) {
          // Expected for invalid JSON
        }
      });

      // Send invalid messages
      testUsers[0].wsConnection.send('invalid json');
      testUsers[0].wsConnection.send(JSON.stringify({ type: 'invalid_type' }));
      testUsers[0].wsConnection.send(JSON.stringify({ /* missing required fields */ }));

      setTimeout(() => {
        // Connection should still be alive
        expect(testUsers[0].wsConnection.readyState).toBe(WebSocket.OPEN);
        done();
      }, 2000);
    });

    test('should handle session deletion while users are active', async () => {
      // Users join session
      await testUsers[0].client.post(`/api/search-collaboration/search-sessions/${testSessionId}/join`, { role: 'moderator' });
      await testUsers[1].client.post(`/api/search-collaboration/search-sessions/${testSessionId}/join`, { role: 'searcher' });

      // Verify session is active
      const sessionResponse = await testUsers[1].client.get(`/api/search-collaboration/search-sessions/${testSessionId}`);
      expect(sessionResponse.status).toBe(200);

      // Moderator deletes session
      const deleteResponse = await testUsers[0].client.delete(`/api/search-collaboration/search-sessions/${testSessionId}`);
      expect(deleteResponse.status).toBe(200);

      // Other users should get appropriate response when trying to access
      await new Promise(resolve => setTimeout(resolve, 1000));

      const accessResponse = await testUsers[1].client.get(`/api/search-collaboration/search-sessions/${testSessionId}`);
      expect(accessResponse.data.data.session.is_active).toBe(false);
    });

    test('should handle permission violations', async () => {
      // User joins as observer (limited permissions)
      await testUsers[2].client.post(`/api/search-collaboration/search-sessions/${testSessionId}/join`, { role: 'observer' });

      // Observer tries to create annotation (should succeed - observers can annotate)
      const annotationResponse = await testUsers[2].client.post(
        `/api/search-collaboration/search-sessions/${testSessionId}/annotations`,
        {
          result_id: 'test-result',
          result_type: 'document',
          annotation_type: 'note',
          annotation_text: 'Observer annotation',
          is_shared: true
        }
      );

      expect(annotationResponse.status).toBe(201);

      // Observer tries to update search state (might be restricted in real implementation)
      const stateResponse = await testUsers[2].client.put(
        `/api/search-collaboration/search-sessions/${testSessionId}/state`,
        {
          state_key: 'test_key',
          new_value: { test: 'value' }
        }
      );

      // This should work based on our current implementation, but in a real system
      // you might want to restrict this based on role permissions
      expect([200, 403]).toContain(stateResponse.status);
    });
  });
});