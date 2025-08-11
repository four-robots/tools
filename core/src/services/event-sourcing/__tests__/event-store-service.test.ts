import { Pool } from 'pg';
import { PostgresEventStore } from '../event-store-service';
import { 
  DomainEvent, 
  OptimisticConcurrencyError, 
  StreamNotFoundError,
  InvalidEventError 
} from '../../../shared/types/event-sourcing';
import { randomUUID } from 'crypto';

// Mock pool for testing
const createMockPool = () => {
  const mockClient = {
    query: jest.fn(),
    release: jest.fn()
  };

  return {
    connect: jest.fn().mockResolvedValue(mockClient),
    mockClient
  } as any;
};

// Helper to create test event
const createTestEvent = (overrides: Partial<DomainEvent> = {}): DomainEvent => ({
  id: randomUUID(),
  streamId: randomUUID(),
  eventType: 'test.event.created',
  eventVersion: 1,
  eventData: { testData: 'value' },
  metadata: {
    source: 'test',
    version: '1.0.0',
    userId: randomUUID()
  },
  timestamp: new Date(),
  sequenceNumber: 1,
  correlationId: randomUUID(),
  ...overrides
});

describe('PostgresEventStore', () => {
  let eventStore: PostgresEventStore;
  let mockPool: Pool;
  let mockClient: any;

  beforeEach(() => {
    mockPool = createMockPool();
    mockClient = (mockPool as any).mockClient;
    eventStore = new PostgresEventStore(mockPool, {
      snapshotFrequency: 10,
      retentionPeriodDays: 30,
      batchSize: 100,
      maxRetries: 3,
      partitionMaintenanceEnabled: false
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('appendEvents', () => {
    it('should append events to a new stream', async () => {
      const streamId = randomUUID();
      const events = [createTestEvent({ streamId })];

      // Mock getting stream (returns empty for new stream)
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // getOrCreateStream - no existing stream
        .mockResolvedValueOnce({ rows: [] }) // insert new stream
        .mockResolvedValueOnce({ rows: [] }) // insert events
        .mockResolvedValueOnce({ rows: [] }); // update stream version

      await eventStore.appendEvents(streamId, -1, events);

      expect(mockClient.query).toHaveBeenCalledTimes(5); // BEGIN, getStream, insertStream, insertEvents, updateStream, COMMIT
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    it('should append events to existing stream', async () => {
      const streamId = randomUUID();
      const events = [createTestEvent({ streamId })];

      // Mock existing stream
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ 
          stream_id: streamId, 
          stream_type: 'test', 
          current_version: 0,
          created_at: new Date(),
          updated_at: new Date(),
          tenant_id: null
        }] }) // getOrCreateStream - existing stream
        .mockResolvedValueOnce({ rows: [] }) // insert events
        .mockResolvedValueOnce({ rows: [] }); // update stream version

      await eventStore.appendEvents(streamId, 0, events);

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    it('should throw OptimisticConcurrencyError for version mismatch', async () => {
      const streamId = randomUUID();
      const events = [createTestEvent({ streamId })];

      // Mock existing stream with different version
      mockClient.query.mockResolvedValueOnce({ rows: [{ 
        stream_id: streamId, 
        stream_type: 'test', 
        current_version: 5, // Different from expected version
        created_at: new Date(),
        updated_at: new Date(),
        tenant_id: null
      }] });

      await expect(eventStore.appendEvents(streamId, 0, events))
        .rejects.toThrow(OptimisticConcurrencyError);

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should handle empty events array', async () => {
      const streamId = randomUUID();
      
      await eventStore.appendEvents(streamId, 0, []);

      expect(mockClient.query).not.toHaveBeenCalled();
    });

    it('should validate events before appending', async () => {
      const streamId = randomUUID();
      const invalidEvent = { ...createTestEvent({ streamId }), id: '' }; // Invalid event

      await expect(eventStore.appendEvents(streamId, 0, [invalidEvent as DomainEvent]))
        .rejects.toThrow(InvalidEventError);
    });
  });

  describe('getEvents', () => {
    it('should retrieve events for a stream', async () => {
      const streamId = randomUUID();
      const mockEvents = [
        {
          id: randomUUID(),
          stream_id: streamId,
          event_type: 'test.event',
          event_version: 1,
          event_data: JSON.stringify({ test: 'data' }),
          metadata: JSON.stringify({ source: 'test' }),
          timestamp: new Date(),
          sequence_number: '1',
          causation_id: null,
          correlation_id: randomUUID(),
          tenant_id: null
        }
      ];

      mockClient.query.mockResolvedValueOnce({ rows: mockEvents });

      const events = await eventStore.getEvents(streamId);

      expect(events).toHaveLength(1);
      expect(events[0].streamId).toBe(streamId);
      expect(events[0].eventData).toEqual({ test: 'data' });
    });

    it('should retrieve events with version range', async () => {
      const streamId = randomUUID();
      
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      await eventStore.getEvents(streamId, 1, 5);

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('sequence_number >= $2'),
        expect.arrayContaining([streamId, 1, 5])
      );
    });

    it('should return empty array for non-existent stream', async () => {
      const streamId = randomUUID();
      
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      const events = await eventStore.getEvents(streamId);

      expect(events).toEqual([]);
    });
  });

  describe('getEventsByType', () => {
    it('should retrieve events by type', async () => {
      const eventType = 'test.event.created';
      
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      await eventStore.getEventsByType(eventType);

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('event_type = $1'),
        expect.arrayContaining([eventType])
      );
    });

    it('should retrieve events by type with time range', async () => {
      const eventType = 'test.event.created';
      const fromTime = new Date('2024-01-01');
      const toTime = new Date('2024-01-02');
      
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      await eventStore.getEventsByType(eventType, fromTime, toTime);

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('timestamp >= $2'),
        expect.arrayContaining([eventType, fromTime, toTime])
      );
    });
  });

  describe('createSnapshot', () => {
    it('should create a snapshot', async () => {
      const streamId = randomUUID();
      const version = 10;
      const state = { test: 'snapshot', data: 'value' };

      mockClient.query.mockResolvedValueOnce({ rows: [] });

      await eventStore.createSnapshot(streamId, version, state);

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO event_snapshots'),
        expect.arrayContaining([streamId, version, JSON.stringify(state)])
      );
    });
  });

  describe('getSnapshot', () => {
    it('should retrieve latest snapshot', async () => {
      const streamId = randomUUID();
      const mockSnapshot = {
        id: randomUUID(),
        stream_id: streamId,
        stream_version: 10,
        snapshot_data: JSON.stringify({ test: 'data' }),
        created_at: new Date()
      };

      mockClient.query.mockResolvedValueOnce({ rows: [mockSnapshot] });

      const snapshot = await eventStore.getSnapshot(streamId);

      expect(snapshot).toBeDefined();
      expect(snapshot!.streamId).toBe(streamId);
      expect(snapshot!.streamVersion).toBe(10);
      expect(snapshot!.snapshotData).toEqual({ test: 'data' });
    });

    it('should return null for non-existent snapshot', async () => {
      const streamId = randomUUID();

      mockClient.query.mockResolvedValueOnce({ rows: [] });

      const snapshot = await eventStore.getSnapshot(streamId);

      expect(snapshot).toBeNull();
    });
  });

  describe('getStream', () => {
    it('should retrieve stream metadata', async () => {
      const streamId = randomUUID();
      const mockStream = {
        stream_id: streamId,
        stream_type: 'test',
        current_version: 5,
        created_at: new Date(),
        updated_at: new Date(),
        tenant_id: null
      };

      mockClient.query.mockResolvedValueOnce({ rows: [mockStream] });

      const stream = await eventStore.getStream(streamId);

      expect(stream).toBeDefined();
      expect(stream!.streamId).toBe(streamId);
      expect(stream!.currentVersion).toBe(5);
    });

    it('should return null for non-existent stream', async () => {
      const streamId = randomUUID();

      mockClient.query.mockResolvedValueOnce({ rows: [] });

      const stream = await eventStore.getStream(streamId);

      expect(stream).toBeNull();
    });
  });

  describe('streamExists', () => {
    it('should return true for existing stream', async () => {
      const streamId = randomUUID();

      mockClient.query.mockResolvedValueOnce({ rows: [{ stream_id: streamId }] });

      const exists = await eventStore.streamExists(streamId);

      expect(exists).toBe(true);
    });

    it('should return false for non-existent stream', async () => {
      const streamId = randomUUID();

      mockClient.query.mockResolvedValueOnce({ rows: [] });

      const exists = await eventStore.streamExists(streamId);

      expect(exists).toBe(false);
    });
  });

  describe('deleteStream', () => {
    it('should delete stream and related data', async () => {
      const streamId = randomUUID();

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // delete events
        .mockResolvedValueOnce({ rows: [] }) // delete snapshots
        .mockResolvedValueOnce({ rows: [] }) // delete projections
        .mockResolvedValueOnce({ rows: [] }) // delete stream
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      await eventStore.deleteStream(streamId);

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.query).toHaveBeenCalledWith(
        'DELETE FROM events WHERE stream_id = $1',
        [streamId]
      );
    });
  });

  describe('error handling', () => {
    it('should rollback transaction on error', async () => {
      const streamId = randomUUID();
      const events = [createTestEvent({ streamId })];

      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ 
          stream_id: streamId, 
          stream_type: 'test', 
          current_version: 0,
          created_at: new Date(),
          updated_at: new Date(),
          tenant_id: null
        }] }) // getOrCreateStream
        .mockRejectedValueOnce(new Error('Database error')); // insert events fails

      await expect(eventStore.appendEvents(streamId, 0, events))
        .rejects.toThrow();

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });
  });
});