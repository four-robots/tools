import { Pool } from 'pg';
import { 
  PostgresEventStore,
  EventBus,
  SessionReconstructor,
  ProjectionService,
  SagaOrchestrator,
  TemporalAnalyticsService
} from '@mcp-tools/core';
import { 
  DomainEvent,
  EventStoreConfig,
  TimeRange
} from '@mcp-tools/core';
import { 
  COLLABORATION_EVENT_TYPES,
  CollaborationEvent 
} from '@mcp-tools/core';
import { randomUUID } from 'crypto';

// Integration test configuration
const TEST_CONFIG = {
  database: {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    database: process.env.POSTGRES_DB || 'mcp_tools_test',
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'password'
  }
};

// Helper to create test events
const createCollaborationEvent = (
  sessionId: string,
  eventType: string,
  eventData: Record<string, unknown>,
  sequenceNumber: number = 1
): DomainEvent => ({
  id: randomUUID(),
  streamId: `collaboration_session:${sessionId}`,
  eventType,
  eventVersion: 1,
  eventData,
  metadata: {
    source: 'integration_test',
    version: '1.0.0',
    sessionId,
    userId: randomUUID()
  },
  timestamp: new Date(),
  sequenceNumber,
  correlationId: randomUUID(),
  tenantId: randomUUID()
});

describe('Event Sourcing Integration Tests', () => {
  let pool: Pool;
  let eventStore: PostgresEventStore;
  let eventBus: EventBus;
  let sessionReconstructor: SessionReconstructor;
  let projectionService: ProjectionService;
  let sagaOrchestrator: SagaOrchestrator;
  let temporalAnalyticsService: TemporalAnalyticsService;

  beforeAll(async () => {
    // Skip integration tests if database is not available
    if (!process.env.POSTGRES_HOST && !process.env.CI) {
      console.warn('Skipping integration tests - database not configured');
      return;
    }

    // Initialize database connection
    pool = new Pool(TEST_CONFIG.database);

    // Initialize services
    const eventStoreConfig: EventStoreConfig = {
      snapshotFrequency: 10,
      retentionPeriodDays: 30,
      batchSize: 100,
      maxRetries: 3,
      partitionMaintenanceEnabled: false
    };

    eventStore = new PostgresEventStore(pool, eventStoreConfig);
    eventBus = new EventBus(pool);
    sessionReconstructor = new SessionReconstructor(eventStore, pool);
    projectionService = new ProjectionService(pool, eventBus, eventStore);
    sagaOrchestrator = new SagaOrchestrator(pool, eventBus, eventStore);
    temporalAnalyticsService = new TemporalAnalyticsService(eventStore, pool);

    // Ensure database schema exists (would normally be handled by migrations)
    await ensureTestSchema();
  });

  afterAll(async () => {
    if (pool) {
      // Clean up test data
      await cleanupTestData();
      
      // Close services
      await eventBus.close();
      await projectionService.close();
      await sagaOrchestrator.close();
      
      // Close database connection
      await pool.end();
    }
  });

  beforeEach(async () => {
    // Clean up data before each test
    if (pool) {
      await cleanupTestData();
    }
  });

  const ensureTestSchema = async () => {
    const client = await pool.connect();
    try {
      // Create minimal required tables for testing
      await client.query(`
        CREATE TABLE IF NOT EXISTS events (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          stream_id UUID NOT NULL,
          event_type VARCHAR(100) NOT NULL,
          event_version INTEGER NOT NULL DEFAULT 1,
          event_data JSONB NOT NULL,
          metadata JSONB DEFAULT '{}',
          timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          sequence_number BIGSERIAL,
          causation_id UUID,
          correlation_id UUID NOT NULL,
          tenant_id UUID
        )
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS event_streams (
          stream_id UUID PRIMARY KEY,
          stream_type VARCHAR(100) NOT NULL,
          current_version INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          tenant_id UUID
        )
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS event_snapshots (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          stream_id UUID NOT NULL,
          stream_version INTEGER NOT NULL,
          snapshot_data JSONB NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS collaboration_sessions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          session_id UUID NOT NULL UNIQUE,
          workspace_id UUID NOT NULL,
          session_type VARCHAR(50) NOT NULL,
          status VARCHAR(50) NOT NULL DEFAULT 'active',
          configuration JSONB DEFAULT '{}',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          ended_at TIMESTAMPTZ,
          tenant_id UUID
        )
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS collaboration_participants (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          session_id UUID NOT NULL,
          user_id UUID NOT NULL,
          role VARCHAR(50) NOT NULL DEFAULT 'viewer',
          permissions JSONB DEFAULT '[]',
          joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          left_at TIMESTAMPTZ,
          is_active BOOLEAN NOT NULL DEFAULT true
        )
      `);

    } finally {
      client.release();
    }
  };

  const cleanupTestData = async () => {
    const client = await pool.connect();
    try {
      await client.query('DELETE FROM events WHERE metadata->>\'source\' = \'integration_test\'');
      await client.query('DELETE FROM event_streams WHERE stream_id IN (SELECT stream_id FROM events WHERE metadata->>\'source\' = \'integration_test\')');
      await client.query('DELETE FROM event_snapshots');
      await client.query('DELETE FROM collaboration_sessions');
      await client.query('DELETE FROM collaboration_participants');
    } finally {
      client.release();
    }
  };

  describe('End-to-End Collaboration Session Flow', () => {
    it('should handle complete collaboration session lifecycle', async () => {
      if (!pool) return; // Skip if no database

      const sessionId = randomUUID();
      const workspaceId = randomUUID();
      const initiatorId = randomUUID();
      const participantId = randomUUID();

      // 1. Start session
      const sessionStartedEvent = createCollaborationEvent(
        sessionId,
        COLLABORATION_EVENT_TYPES.SESSION_STARTED,
        {
          sessionId,
          workspaceId,
          initiatorId,
          sessionType: 'search',
          configuration: { maxParticipants: 5 }
        },
        1
      );

      await eventStore.appendEvents(sessionStartedEvent.streamId, -1, [sessionStartedEvent]);

      // 2. Participant joins
      const participantJoinedEvent = createCollaborationEvent(
        sessionId,
        COLLABORATION_EVENT_TYPES.PARTICIPANT_JOINED,
        {
          sessionId,
          participantId,
          role: 'editor',
          permissions: ['read', 'write']
        },
        2
      );

      await eventStore.appendEvents(sessionStartedEvent.streamId, 1, [participantJoinedEvent]);

      // 3. Search query changes
      const searchQueryEvent = createCollaborationEvent(
        sessionId,
        COLLABORATION_EVENT_TYPES.SEARCH_QUERY_CHANGED,
        {
          sessionId,
          userId: participantId,
          oldQuery: '',
          newQuery: 'machine learning',
          changeType: 'addition'
        },
        3
      );

      await eventStore.appendEvents(sessionStartedEvent.streamId, 2, [searchQueryEvent]);

      // 4. Conflict detected
      const conflictId = randomUUID();
      const conflictDetectedEvent = createCollaborationEvent(
        sessionId,
        COLLABORATION_EVENT_TYPES.CONFLICT_DETECTED,
        {
          conflictId,
          sessionId,
          contentId: randomUUID(),
          conflictType: 'concurrent_edit',
          participants: [initiatorId, participantId],
          conflictData: {
            originalContent: 'original query',
            conflictingChanges: [
              { userId: initiatorId, change: 'AI research', timestamp: new Date() },
              { userId: participantId, change: 'machine learning', timestamp: new Date() }
            ]
          },
          severity: 'medium'
        },
        4
      );

      await eventStore.appendEvents(sessionStartedEvent.streamId, 3, [conflictDetectedEvent]);

      // 5. Conflict resolved
      const conflictResolvedEvent = createCollaborationEvent(
        sessionId,
        COLLABORATION_EVENT_TYPES.CONFLICT_RESOLVED,
        {
          conflictId,
          sessionId,
          resolution: {
            strategy: 'merge',
            resolvedBy: initiatorId,
            mergedContent: 'AI research and machine learning',
            resolutionTime: 30000,
            participantVotes: [
              { userId: initiatorId, vote: 'approve' },
              { userId: participantId, vote: 'approve' }
            ]
          }
        },
        5
      );

      await eventStore.appendEvents(sessionStartedEvent.streamId, 4, [conflictResolvedEvent]);

      // 6. Session ended
      const sessionEndedEvent = createCollaborationEvent(
        sessionId,
        COLLABORATION_EVENT_TYPES.SESSION_ENDED,
        {
          sessionId,
          endedBy: initiatorId,
          reason: 'manual',
          duration: 300000,
          summary: {
            participantCount: 2,
            eventCount: 6,
            conflictCount: 1,
            resolutionCount: 1
          }
        },
        6
      );

      await eventStore.appendEvents(sessionStartedEvent.streamId, 5, [sessionEndedEvent]);

      // Verify event storage
      const storedEvents = await eventStore.getEvents(sessionStartedEvent.streamId);
      expect(storedEvents).toHaveLength(6);

      // Test session reconstruction
      const reconstructedSession = await sessionReconstructor.reconstructSession(sessionId);
      expect(reconstructedSession.sessionId).toBe(sessionId);
      expect(reconstructedSession.status).toBe('ended');
      expect(reconstructedSession.participants).toHaveLength(1); // One participant joined
      expect(reconstructedSession.conflicts).toHaveLength(1);
      expect(reconstructedSession.conflicts[0].status).toBe('resolved');
      expect(reconstructedSession.metadata.totalEvents).toBe(6);

      // Test timeline generation
      const timeline = await sessionReconstructor.getSessionTimeline(sessionId);
      expect(timeline.events).toHaveLength(6);
      expect(timeline.timelineEntries).toHaveLength(6);
      expect(timeline.keyMilestones.length).toBeGreaterThan(0);

      // Test audit trail generation
      const auditTrail = await sessionReconstructor.generateAuditTrail(sessionId);
      expect(auditTrail.sessionId).toBe(sessionId);
      expect(auditTrail.events).toHaveLength(6);
      expect(auditTrail.summary.conflicts).toBe(1);
      expect(auditTrail.summary.resolutions).toBe(1);
    });
  });

  describe('Event Bus and Real-time Processing', () => {
    it('should publish and handle events in real-time', async () => {
      if (!pool) return;

      const sessionId = randomUUID();
      const receivedEvents: DomainEvent[] = [];

      // Subscribe to session events
      const subscriptionId = eventBus.subscribe(
        COLLABORATION_EVENT_TYPES.SESSION_STARTED,
        async (event: DomainEvent) => {
          receivedEvents.push(event);
        }
      );

      // Publish event
      const event = createCollaborationEvent(
        sessionId,
        COLLABORATION_EVENT_TYPES.SESSION_STARTED,
        {
          sessionId,
          workspaceId: randomUUID(),
          initiatorId: randomUUID(),
          sessionType: 'search',
          configuration: {}
        }
      );

      await eventBus.publishEvent(event);

      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(receivedEvents).toHaveLength(1);
      expect(receivedEvents[0].eventType).toBe(COLLABORATION_EVENT_TYPES.SESSION_STARTED);

      // Cleanup
      eventBus.unsubscribe(subscriptionId);
    });

    it('should handle event streaming with filtering', async () => {
      if (!pool) return;

      const sessionId = randomUUID();
      const otherSessionId = randomUUID();
      const receivedEvents: DomainEvent[] = [];

      // Subscribe to specific session events only
      const subscriptionId = eventBus.subscribeToStream(
        `collaboration_session:${sessionId}`,
        async (event: DomainEvent) => {
          receivedEvents.push(event);
        }
      );

      // Publish events for target session
      const targetEvent = createCollaborationEvent(
        sessionId,
        COLLABORATION_EVENT_TYPES.SESSION_STARTED,
        { sessionId }
      );

      // Publish event for different session
      const otherEvent = createCollaborationEvent(
        otherSessionId,
        COLLABORATION_EVENT_TYPES.SESSION_STARTED,
        { sessionId: otherSessionId }
      );

      await Promise.all([
        eventBus.publishEvent(targetEvent),
        eventBus.publishEvent(otherEvent)
      ]);

      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Should only receive events for the subscribed session
      expect(receivedEvents).toHaveLength(1);
      expect(receivedEvents[0].metadata.sessionId).toBe(sessionId);

      eventBus.unsubscribe(subscriptionId);
    });
  });

  describe('Temporal Queries and Analytics', () => {
    it('should provide temporal analytics for collaboration sessions', async () => {
      if (!pool) return;

      const now = new Date();
      const sessionIds = [randomUUID(), randomUUID(), randomUUID()];
      
      // Create multiple sessions with events
      for (const sessionId of sessionIds) {
        const events = [
          createCollaborationEvent(
            sessionId,
            COLLABORATION_EVENT_TYPES.SESSION_STARTED,
            {
              sessionId,
              workspaceId: randomUUID(),
              initiatorId: randomUUID(),
              sessionType: 'search',
              configuration: {}
            },
            1
          ),
          createCollaborationEvent(
            sessionId,
            COLLABORATION_EVENT_TYPES.PARTICIPANT_JOINED,
            {
              sessionId,
              participantId: randomUUID(),
              role: 'editor',
              permissions: ['read', 'write']
            },
            2
          )
        ];

        const streamId = `collaboration_session:${sessionId}`;
        await eventStore.appendEvents(streamId, -1, events);
      }

      // Wait for events to be processed
      await new Promise(resolve => setTimeout(resolve, 100));

      // Test temporal analytics
      const timeRange: TimeRange = {
        start: new Date(now.getTime() - 60000), // 1 minute ago
        end: new Date(now.getTime() + 60000)    // 1 minute from now
      };

      const metrics = await temporalAnalyticsService.getCollaborationMetrics(timeRange);

      expect(metrics.timeRange).toEqual(timeRange);
      expect(metrics.sessions.total).toBeGreaterThanOrEqual(3);
      expect(metrics.participants.unique).toBeGreaterThanOrEqual(3);
      expect(metrics.events.total).toBeGreaterThanOrEqual(6); // 2 events per session
    });

    it('should support session search with criteria', async () => {
      if (!pool) return;

      const workspaceId = randomUUID();
      const participantId = randomUUID();
      const sessionId = randomUUID();

      // Create session with specific characteristics
      const events = [
        createCollaborationEvent(
          sessionId,
          COLLABORATION_EVENT_TYPES.SESSION_STARTED,
          {
            sessionId,
            workspaceId,
            initiatorId: participantId,
            sessionType: 'annotation',
            configuration: {}
          }
        ),
        createCollaborationEvent(
          sessionId,
          COLLABORATION_EVENT_TYPES.CONFLICT_DETECTED,
          {
            conflictId: randomUUID(),
            sessionId,
            contentId: randomUUID(),
            conflictType: 'concurrent_edit',
            participants: [participantId],
            conflictData: { originalContent: '', conflictingChanges: [] },
            severity: 'high'
          }
        )
      ];

      await eventStore.appendEvents(`collaboration_session:${sessionId}`, -1, events);

      // Search for sessions with specific criteria
      const timeRange: TimeRange = {
        start: new Date(Date.now() - 60000),
        end: new Date(Date.now() + 60000)
      };

      const searchCriteria = {
        sessionType: 'annotation',
        workspaceId,
        hasConflicts: true
      };

      const matchingSessions = await sessionReconstructor.findSessionsWithCriteria(
        searchCriteria,
        timeRange
      );

      expect(matchingSessions.length).toBeGreaterThanOrEqual(1);
      const foundSession = matchingSessions.find(s => s.sessionId === sessionId);
      expect(foundSession).toBeDefined();
      expect(foundSession!.sessionType).toBe('annotation');
      expect(foundSession!.conflicts).toHaveLength(1);
    });
  });

  describe('Snapshot and Performance', () => {
    it('should create and restore from snapshots', async () => {
      if (!pool) return;

      const sessionId = randomUUID();
      const streamId = `collaboration_session:${sessionId}`;

      // Create events up to snapshot threshold
      const events: DomainEvent[] = [];
      for (let i = 1; i <= 15; i++) {
        events.push(createCollaborationEvent(
          sessionId,
          i === 1 ? COLLABORATION_EVENT_TYPES.SESSION_STARTED : COLLABORATION_EVENT_TYPES.PARTICIPANT_JOINED,
          {
            sessionId,
            participantId: randomUUID(),
            role: 'viewer',
            permissions: []
          },
          i
        ));
      }

      // Append events in batches to trigger snapshot creation
      for (let i = 0; i < events.length; i += 5) {
        const batch = events.slice(i, i + 5);
        const expectedVersion = i === 0 ? -1 : i;
        await eventStore.appendEvents(streamId, expectedVersion, batch);
      }

      // Verify snapshot was created (snapshot frequency is 10)
      const snapshot = await eventStore.getSnapshot(streamId);
      expect(snapshot).toBeDefined();
      expect(snapshot!.streamVersion).toBeGreaterThanOrEqual(10);

      // Verify events can still be retrieved
      const retrievedEvents = await eventStore.getEvents(streamId);
      expect(retrievedEvents).toHaveLength(15);
    });

    it('should handle concurrent event appends with optimistic concurrency', async () => {
      if (!pool) return;

      const sessionId = randomUUID();
      const streamId = `collaboration_session:${sessionId}`;

      // Initialize stream
      const initialEvent = createCollaborationEvent(
        sessionId,
        COLLABORATION_EVENT_TYPES.SESSION_STARTED,
        { sessionId },
        1
      );
      await eventStore.appendEvents(streamId, -1, [initialEvent]);

      // Attempt concurrent appends
      const event1 = createCollaborationEvent(sessionId, COLLABORATION_EVENT_TYPES.PARTICIPANT_JOINED, {}, 2);
      const event2 = createCollaborationEvent(sessionId, COLLABORATION_EVENT_TYPES.PARTICIPANT_LEFT, {}, 2);

      const promises = [
        eventStore.appendEvents(streamId, 1, [event1]),
        eventStore.appendEvents(streamId, 1, [event2])
      ];

      // One should succeed, one should fail with concurrency error
      const results = await Promise.allSettled(promises);
      
      const succeeded = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      expect(succeeded).toBe(1);
      expect(failed).toBe(1);

      // Verify stream integrity
      const finalEvents = await eventStore.getEvents(streamId);
      expect(finalEvents).toHaveLength(2); // Initial event + one concurrent event
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle partial failures gracefully', async () => {
      if (!pool) return;

      const sessionId = randomUUID();

      // Try to reconstruct non-existent session
      await expect(sessionReconstructor.reconstructSession('non-existent-session'))
        .rejects.toThrow();

      // Try to append invalid events
      const invalidEvent = {
        id: '', // Invalid - empty ID
        streamId: sessionId,
        eventType: 'test.invalid',
        eventData: {},
        metadata: {},
        timestamp: new Date(),
        sequenceNumber: 1,
        correlationId: randomUUID()
      };

      await expect(eventStore.appendEvents(sessionId, -1, [invalidEvent as DomainEvent]))
        .rejects.toThrow();

      // Verify system remains stable
      const validEvent = createCollaborationEvent(
        sessionId,
        COLLABORATION_EVENT_TYPES.SESSION_STARTED,
        { sessionId }
      );

      await expect(eventStore.appendEvents(sessionId, -1, [validEvent]))
        .resolves.not.toThrow();
    });
  });
});