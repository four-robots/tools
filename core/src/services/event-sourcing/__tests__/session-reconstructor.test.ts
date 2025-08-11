import { Pool } from 'pg';
import { SessionReconstructor } from '../session-reconstructor';
import { PostgresEventStore } from '../event-store-service';
import { 
  DomainEvent,
  EventSourcingError
} from '../../../shared/types/event-sourcing';
import { 
  COLLABORATION_EVENT_TYPES,
  SessionStartedEvent,
  ParticipantJoinedEvent,
  ConflictDetectedEvent
} from '../../../shared/types/collaboration-events';
import { randomUUID } from 'crypto';

// Mock dependencies
jest.mock('../event-store-service');

const createMockEventStore = () => ({
  getEvents: jest.fn(),
  getEventsByType: jest.fn(),
  appendEvents: jest.fn(),
  getSnapshot: jest.fn(),
  createSnapshot: jest.fn(),
  getStream: jest.fn(),
  streamExists: jest.fn(),
  getStreamVersion: jest.fn(),
  subscribeToStream: jest.fn(),
  subscribeToAll: jest.fn(),
  deleteStream: jest.fn(),
  maintainPartitions: jest.fn(),
  getEventsFromSequence: jest.fn()
});

const createMockPool = () => ({
  connect: jest.fn(),
  query: jest.fn(),
  release: jest.fn()
});

// Helper to create test events
const createSessionStartedEvent = (sessionId: string, workspaceId: string): DomainEvent => ({
  id: randomUUID(),
  streamId: `collaboration_session:${sessionId}`,
  eventType: COLLABORATION_EVENT_TYPES.SESSION_STARTED,
  eventVersion: 1,
  eventData: {
    sessionId,
    workspaceId,
    initiatorId: randomUUID(),
    sessionType: 'search',
    configuration: {}
  },
  metadata: {
    source: 'test',
    version: '1.0.0',
    sessionId,
    workspaceId
  },
  timestamp: new Date('2024-01-01T10:00:00Z'),
  sequenceNumber: 1,
  correlationId: randomUUID(),
  tenantId: randomUUID()
});

const createParticipantJoinedEvent = (sessionId: string, participantId: string, sequenceNumber: number): DomainEvent => ({
  id: randomUUID(),
  streamId: `collaboration_session:${sessionId}`,
  eventType: COLLABORATION_EVENT_TYPES.PARTICIPANT_JOINED,
  eventVersion: 1,
  eventData: {
    sessionId,
    participantId,
    role: 'editor',
    permissions: ['read', 'write']
  },
  metadata: {
    source: 'test',
    version: '1.0.0',
    sessionId
  },
  timestamp: new Date('2024-01-01T10:01:00Z'),
  sequenceNumber,
  correlationId: randomUUID()
});

const createConflictDetectedEvent = (sessionId: string, conflictId: string, sequenceNumber: number): DomainEvent => ({
  id: randomUUID(),
  streamId: `collaboration_session:${sessionId}`,
  eventType: COLLABORATION_EVENT_TYPES.CONFLICT_DETECTED,
  eventVersion: 1,
  eventData: {
    conflictId,
    sessionId,
    contentId: randomUUID(),
    conflictType: 'concurrent_edit',
    participants: [randomUUID(), randomUUID()],
    conflictData: {
      originalContent: 'original',
      conflictingChanges: []
    },
    severity: 'medium'
  },
  metadata: {
    source: 'test',
    version: '1.0.0',
    sessionId
  },
  timestamp: new Date('2024-01-01T10:02:00Z'),
  sequenceNumber,
  correlationId: randomUUID()
});

describe('SessionReconstructor', () => {
  let sessionReconstructor: SessionReconstructor;
  let mockEventStore: ReturnType<typeof createMockEventStore>;
  let mockPool: ReturnType<typeof createMockPool>;
  let mockClient: any;

  beforeEach(() => {
    mockEventStore = createMockEventStore();
    mockPool = createMockPool();
    mockClient = {
      query: jest.fn(),
      release: jest.fn()
    };
    mockPool.connect.mockResolvedValue(mockClient);

    sessionReconstructor = new SessionReconstructor(
      mockEventStore as any,
      mockPool as any
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('reconstructSession', () => {
    it('should reconstruct a basic collaboration session', async () => {
      const sessionId = randomUUID();
      const workspaceId = randomUUID();
      const participantId = randomUUID();

      const events = [
        createSessionStartedEvent(sessionId, workspaceId),
        createParticipantJoinedEvent(sessionId, participantId, 2)
      ];

      mockEventStore.getEvents.mockResolvedValue(events);

      const session = await sessionReconstructor.reconstructSession(sessionId);

      expect(session).toBeDefined();
      expect(session.sessionId).toBe(sessionId);
      expect(session.workspaceId).toBe(workspaceId);
      expect(session.sessionType).toBe('search');
      expect(session.status).toBe('active');
      expect(session.participants).toHaveLength(1);
      expect(session.participants[0].userId).toBe(participantId);
      expect(session.metadata.totalEvents).toBe(2);
      expect(session.timeline).toHaveLength(2);
    });

    it('should reconstruct session up to a point in time', async () => {
      const sessionId = randomUUID();
      const workspaceId = randomUUID();
      const participantId = randomUUID();
      const pointInTime = new Date('2024-01-01T10:01:30Z');

      const events = [
        createSessionStartedEvent(sessionId, workspaceId),
        createParticipantJoinedEvent(sessionId, participantId, 2)
      ];

      // Only first event should be included (before pointInTime)
      mockEventStore.getEvents.mockResolvedValue(events);

      const session = await sessionReconstructor.reconstructSession(sessionId, pointInTime);

      expect(session).toBeDefined();
      expect(session.participants).toHaveLength(1); // Participant joined at 10:01:00, which is before 10:01:30
    });

    it('should handle conflicts in session reconstruction', async () => {
      const sessionId = randomUUID();
      const workspaceId = randomUUID();
      const conflictId = randomUUID();

      const events = [
        createSessionStartedEvent(sessionId, workspaceId),
        createConflictDetectedEvent(sessionId, conflictId, 2)
      ];

      mockEventStore.getEvents.mockResolvedValue(events);

      const session = await sessionReconstructor.reconstructSession(sessionId);

      expect(session.conflicts).toHaveLength(1);
      expect(session.conflicts[0].conflictId).toBe(conflictId);
      expect(session.conflicts[0].status).toBe('open');
      expect(session.conflicts[0].severity).toBe('medium');
      expect(session.metadata.conflictCount).toBe(1);
    });

    it('should throw error for non-existent session', async () => {
      const sessionId = randomUUID();

      mockEventStore.getEvents.mockResolvedValue([]);

      await expect(sessionReconstructor.reconstructSession(sessionId))
        .rejects.toThrow(EventSourcingError);
    });

    it('should calculate session duration when ended', async () => {
      const sessionId = randomUUID();
      const workspaceId = randomUUID();

      const sessionStarted = createSessionStartedEvent(sessionId, workspaceId);
      const sessionEnded: DomainEvent = {
        ...sessionStarted,
        id: randomUUID(),
        eventType: COLLABORATION_EVENT_TYPES.SESSION_ENDED,
        eventData: {
          sessionId,
          endedBy: randomUUID(),
          reason: 'manual',
          duration: 120000,
          summary: {
            participantCount: 2,
            eventCount: 5,
            conflictCount: 0,
            resolutionCount: 0
          }
        },
        timestamp: new Date('2024-01-01T10:02:00Z'),
        sequenceNumber: 2
      };

      const events = [sessionStarted, sessionEnded];
      mockEventStore.getEvents.mockResolvedValue(events);

      const session = await sessionReconstructor.reconstructSession(sessionId);

      expect(session.status).toBe('ended');
      expect(session.endedAt).toBeDefined();
      expect(session.duration).toBeGreaterThan(0);
    });
  });

  describe('getSessionTimeline', () => {
    it('should return session timeline with events and milestones', async () => {
      const sessionId = randomUUID();
      const workspaceId = randomUUID();

      const events = [
        createSessionStartedEvent(sessionId, workspaceId),
        createParticipantJoinedEvent(sessionId, randomUUID(), 2)
      ];

      mockEventStore.getEvents.mockResolvedValue(events);

      const timeline = await sessionReconstructor.getSessionTimeline(sessionId);

      expect(timeline).toBeDefined();
      expect(timeline.sessionId).toBe(sessionId);
      expect(timeline.events).toHaveLength(2);
      expect(timeline.timelineEntries).toHaveLength(2);
      expect(timeline.keyMilestones).toHaveLength(1); // Session started is a key milestone
      expect(timeline.participantActivities).toBeDefined();
    });

    it('should handle empty event stream', async () => {
      const sessionId = randomUUID();

      mockEventStore.getEvents.mockResolvedValue([]);

      const timeline = await sessionReconstructor.getSessionTimeline(sessionId);

      expect(timeline.events).toHaveLength(0);
      expect(timeline.timelineEntries).toHaveLength(0);
      expect(timeline.keyMilestones).toHaveLength(0);
    });
  });

  describe('replayEventsFromTime', () => {
    it('should return events from specified time', async () => {
      const sessionId = randomUUID();
      const fromTime = new Date('2024-01-01T10:01:00Z');

      const events = [
        createSessionStartedEvent(sessionId, randomUUID()),
        createParticipantJoinedEvent(sessionId, randomUUID(), 2)
      ];

      mockEventStore.getEvents.mockResolvedValue(events);

      const replayEvents = await sessionReconstructor.replayEventsFromTime(sessionId, fromTime);

      expect(replayEvents).toHaveLength(1); // Only participant joined event after 10:01:00
      expect(replayEvents[0].eventType).toBe(COLLABORATION_EVENT_TYPES.PARTICIPANT_JOINED);
    });
  });

  describe('getSessionStateAtTime', () => {
    it('should return session state at specific timestamp', async () => {
      const sessionId = randomUUID();
      const workspaceId = randomUUID();
      const participantId = randomUUID();
      const timestamp = new Date('2024-01-01T10:01:30Z');

      const events = [
        createSessionStartedEvent(sessionId, workspaceId),
        createParticipantJoinedEvent(sessionId, participantId, 2)
      ];

      mockEventStore.getEvents.mockResolvedValue(events);

      const sessionState = await sessionReconstructor.getSessionStateAtTime(sessionId, timestamp);

      expect(sessionState).toBeDefined();
      expect(sessionState.sessionId).toBe(sessionId);
      expect(sessionState.timestamp).toEqual(timestamp);
      expect(sessionState.activeParticipants).toHaveLength(1);
      expect(sessionState.searchState).toBeDefined();
      expect(sessionState.workflowStates).toBeDefined();
    });
  });

  describe('findSessionsWithCriteria', () => {
    it('should find sessions matching criteria', async () => {
      const workspaceId = randomUUID();
      const userId = randomUUID();
      const timeRange = {
        start: new Date('2024-01-01T00:00:00Z'),
        end: new Date('2024-01-02T00:00:00Z')
      };

      const criteria = {
        sessionType: 'search',
        workspaceId,
        participantId: userId
      };

      // Mock database query results
      mockClient.query.mockResolvedValue({
        rows: [
          { session_id: randomUUID() },
          { session_id: randomUUID() }
        ]
      });

      // Mock session reconstruction for each session
      const mockSession = {
        sessionId: randomUUID(),
        workspaceId,
        sessionType: 'search',
        status: 'completed',
        participants: [{ userId }],
        duration: 60000,
        metadata: { eventTypes: { 'collaboration.session.started': 1 } }
      };

      jest.spyOn(sessionReconstructor, 'reconstructSession')
        .mockResolvedValue(mockSession as any);

      const sessions = await sessionReconstructor.findSessionsWithCriteria(criteria, timeRange);

      expect(sessions).toHaveLength(2);
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE s.created_at BETWEEN $1 AND $2'),
        expect.arrayContaining([timeRange.start, timeRange.end])
      );
    });

    it('should filter sessions by duration', async () => {
      const timeRange = {
        start: new Date('2024-01-01T00:00:00Z'),
        end: new Date('2024-01-02T00:00:00Z')
      };

      const criteria = {
        minDuration: 30000, // 30 seconds
        maxDuration: 120000 // 2 minutes
      };

      mockClient.query.mockResolvedValue({
        rows: [{ session_id: randomUUID() }]
      });

      // Mock sessions with different durations
      const shortSession = { duration: 15000 }; // Too short
      const validSession = { duration: 60000 }; // Valid
      const longSession = { duration: 180000 }; // Too long

      jest.spyOn(sessionReconstructor, 'reconstructSession')
        .mockResolvedValueOnce(shortSession as any)
        .mockResolvedValueOnce(validSession as any)
        .mockResolvedValueOnce(longSession as any);

      mockClient.query.mockResolvedValue({
        rows: [
          { session_id: randomUUID() },
          { session_id: randomUUID() },
          { session_id: randomUUID() }
        ]
      });

      const sessions = await sessionReconstructor.findSessionsWithCriteria(criteria, timeRange);

      expect(sessions).toHaveLength(1); // Only the valid session
    });
  });

  describe('getParticipantActivity', () => {
    it('should analyze participant activity across sessions', async () => {
      const userId = randomUUID();
      const timeRange = {
        start: new Date('2024-01-01T00:00:00Z'),
        end: new Date('2024-01-02T00:00:00Z')
      };

      // Mock database queries
      mockClient.query
        .mockResolvedValueOnce({ // sessions query
          rows: [
            { session_id: randomUUID() },
            { session_id: randomUUID() }
          ]
        })
        .mockResolvedValueOnce({ // events query
          rows: [
            { event_type: 'collaboration.session.started', count: '2' },
            { event_type: 'collaboration.search.query_changed', count: '5' }
          ]
        });

      const activity = await sessionReconstructor.getParticipantActivity(userId, timeRange);

      expect(activity).toBeDefined();
      expect(activity.userId).toBe(userId);
      expect(activity.timeRange).toEqual(timeRange);
      expect(activity.sessions).toHaveLength(2);
      expect(activity.totalEvents).toBe(7);
      expect(activity.eventBreakdown).toEqual({
        'collaboration.session.started': 2,
        'collaboration.search.query_changed': 5
      });
      expect(activity.collaborationMetrics).toBeDefined();
      expect(activity.behaviorPatterns).toBeDefined();
    });
  });

  describe('generateAuditTrail', () => {
    it('should generate comprehensive audit trail', async () => {
      const sessionId = randomUUID();
      const workspaceId = randomUUID();

      const events = [
        createSessionStartedEvent(sessionId, workspaceId),
        createParticipantJoinedEvent(sessionId, randomUUID(), 2)
      ];

      mockEventStore.getEvents.mockResolvedValue(events);

      // Mock session reconstruction
      const mockSession = {
        sessionId,
        participants: [{ userId: randomUUID() }],
        metadata: {
          totalEvents: 2,
          eventTypes: { 'collaboration.session.started': 1 },
          conflictCount: 0,
          resolutionCount: 0
        },
        duration: 60000
      };

      jest.spyOn(sessionReconstructor, 'reconstructSession')
        .mockResolvedValue(mockSession as any);

      jest.spyOn(sessionReconstructor, 'getSessionTimeline')
        .mockResolvedValue({
          sessionId,
          events,
          timelineEntries: [
            {
              timestamp: events[0].timestamp.toISOString(),
              eventType: events[0].eventType,
              userId: events[0].metadata.userId,
              description: 'Session started',
              impact: 'medium',
              details: events[0].eventData
            }
          ],
          keyMilestones: [],
          participantActivities: []
        } as any);

      const auditTrail = await sessionReconstructor.generateAuditTrail(sessionId);

      expect(auditTrail).toBeDefined();
      expect(auditTrail.sessionId).toBe(sessionId);
      expect(auditTrail.events).toHaveLength(2);
      expect(auditTrail.participants).toHaveLength(1);
      expect(auditTrail.summary.totalEvents).toBe(2);
      expect(auditTrail.summary.duration).toBe(60000);
      expect(auditTrail.timeline).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should handle database connection errors', async () => {
      const sessionId = randomUUID();

      mockEventStore.getEvents.mockRejectedValue(new Error('Database connection failed'));

      await expect(sessionReconstructor.reconstructSession(sessionId))
        .rejects.toThrow('Database connection failed');
    });

    it('should handle malformed event data', async () => {
      const sessionId = randomUUID();

      // Create event with missing required data
      const malformedEvent = {
        ...createSessionStartedEvent(sessionId, randomUUID()),
        eventData: {} // Missing required fields
      };

      mockEventStore.getEvents.mockResolvedValue([malformedEvent]);

      const session = await sessionReconstructor.reconstructSession(sessionId);

      // Should handle gracefully and still return a session object
      expect(session).toBeDefined();
      expect(session.sessionId).toBe(sessionId);
    });
  });
});