import { Pool } from 'pg';
import { 
  DomainEvent, 
  EventSnapshot, 
  EventStream,
  EventStoreConfig,
  OptimisticConcurrencyError,
  StreamNotFoundError,
  InvalidEventError,
  EventSourcingError
} from '../../shared/types/event-sourcing';
import { logger } from '../../utils/logger';
import { createHash } from 'crypto';
import { eventEncryptionService, EventEncryptionService } from './event-encryption-service';
import { accessLogger, AccessLogger } from './access-logger';

export interface EventStore {
  appendEvents(streamId: string, expectedVersion: number, events: DomainEvent[]): Promise<void>;
  getEvents(streamId: string, fromVersion?: number, toVersion?: number): Promise<DomainEvent[]>;
  getEventsByType(eventType: string, fromTime?: Date, toTime?: Date): Promise<DomainEvent[]>;
  getEventsFromSequence(fromSequence: number, batchSize?: number): Promise<DomainEvent[]>;
  createSnapshot(streamId: string, version: number, state: unknown): Promise<void>;
  getSnapshot(streamId: string): Promise<EventSnapshot | null>;
  getStream(streamId: string): Promise<EventStream | null>;
  streamExists(streamId: string): Promise<boolean>;
  getStreamVersion(streamId: string): Promise<number>;
  subscribeToStream(streamId: string, fromVersion?: number): AsyncIterableIterator<DomainEvent>;
  subscribeToAll(fromSequence?: number): AsyncIterableIterator<DomainEvent>;
  deleteStream(streamId: string): Promise<void>;
  maintainPartitions(): Promise<void>;
}

export class PostgresEventStore implements EventStore {
  private readonly snapshotFrequency: number;
  private readonly batchSize: number;
  private readonly maxRetries: number;
  private readonly encryptionService: EventEncryptionService;
  private readonly accessLogger: AccessLogger;
  private partitionMaintenanceTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly pool: Pool,
    private readonly config: EventStoreConfig = {
      snapshotFrequency: 100,
      retentionPeriodDays: 365,
      batchSize: 1000,
      maxRetries: 3,
      partitionMaintenanceEnabled: true
    },
    encryptionService?: EventEncryptionService,
    accessLoggerInstance?: AccessLogger
  ) {
    this.snapshotFrequency = config.snapshotFrequency;
    this.batchSize = config.batchSize;
    this.maxRetries = config.maxRetries;
    this.encryptionService = encryptionService || eventEncryptionService;
    this.accessLogger = accessLoggerInstance || accessLogger;

    // Schedule partition maintenance if enabled
    if (config.partitionMaintenanceEnabled) {
      this.schedulePartitionMaintenance();
    }
  }

  async appendEvents(streamId: string, expectedVersion: number, events: DomainEvent[], userId?: string): Promise<void> {
    if (events.length === 0) {
      return;
    }

    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      // Get or create stream
      const stream = await this.getOrCreateStream(client, streamId, events[0]);
      
      // Check optimistic concurrency
      if (expectedVersion !== -1 && stream.currentVersion !== expectedVersion) {
        throw new OptimisticConcurrencyError(streamId, expectedVersion, stream.currentVersion);
      }

      // Validate events
      this.validateEvents(events);

      // Insert events
      let nextVersion = stream.currentVersion + 1;
      const eventInserts = events.map((event, index) => {
        // Apply encryption if event data is sensitive
        const { eventData: processedEventData, isEncrypted } = this.encryptionService.encryptEventDataIfSensitive(event.eventData);
        
        // Log encryption status for audit
        if (isEncrypted) {
          logger.info(`Event data encrypted for security`, {
            eventId: event.id,
            eventType: event.eventType,
            streamId,
            encryptedFields: Object.keys(event.eventData).length
          });
        }

        return [
          event.id,
          streamId,
          event.eventType,
          event.eventVersion,
          JSON.stringify(processedEventData),
          JSON.stringify(event.metadata),
          event.timestamp,
          event.causationId || null,
          event.correlationId,
          event.tenantId || null,
          nextVersion + index
        ];
      });

      const insertQuery = `
        INSERT INTO events (
          id, stream_id, event_type, event_version, event_data, metadata,
          timestamp, causation_id, correlation_id, tenant_id, sequence_number
        ) VALUES ${eventInserts.map((_, i) => `($${i * 11 + 1}, $${i * 11 + 2}, $${i * 11 + 3}, $${i * 11 + 4}, $${i * 11 + 5}, $${i * 11 + 6}, $${i * 11 + 7}, $${i * 11 + 8}, $${i * 11 + 9}, $${i * 11 + 10}, $${i * 11 + 11})`).join(', ')}
      `;

      const insertParams = eventInserts.flat();
      await client.query(insertQuery, insertParams);

      // Update stream version
      await client.query(
        'UPDATE event_streams SET current_version = $1, updated_at = NOW() WHERE stream_id = $2',
        [nextVersion + events.length - 1, streamId]
      );

      // Create snapshot if needed
      const newVersion = nextVersion + events.length - 1;
      if (newVersion % this.snapshotFrequency === 0) {
        await this.createSnapshotIfNeeded(client, streamId, newVersion);
      }

      await client.query('COMMIT');

      // Log access for compliance
      for (const event of events) {
        await this.accessLogger.logEventAccess(
          userId || 'system',
          event.id,
          'write',
          {
            eventType: event.eventType,
            streamId,
            sensitiveDataAccessed: this.encryptionService.isSensitiveData(event.eventData),
            purpose: 'Event storage for application functionality',
            tenantId: event.tenantId,
            requestId: event.correlationId
          }
        );
      }

      logger.info(`Appended ${events.length} events to stream ${streamId}, version ${newVersion}`, {
        streamId,
        eventCount: events.length,
        version: newVersion,
        eventTypes: events.map(e => e.eventType)
      });

    } catch (error) {
      await client.query('ROLLBACK');
      
      if (error instanceof OptimisticConcurrencyError) {
        throw error;
      }
      
      throw new EventSourcingError(
        `Failed to append events to stream ${streamId}: ${error instanceof Error ? error.message : String(error)}`,
        'APPEND_EVENTS_FAILED',
        { streamId, events: events.map(e => e.eventType), error }
      );
    } finally {
      client.release();
    }
  }

  async getEvents(streamId: string, fromVersion?: number, toVersion?: number, userId?: string): Promise<DomainEvent[]> {
    const client = await this.pool.connect();
    
    try {
      let query = `
        SELECT id, stream_id, event_type, event_version, event_data, metadata,
               timestamp, sequence_number, causation_id, correlation_id, tenant_id
        FROM events 
        WHERE stream_id = $1
      `;
      
      const params: any[] = [streamId];
      let paramIndex = 1;

      if (fromVersion !== undefined) {
        query += ` AND sequence_number >= $${++paramIndex}`;
        params.push(fromVersion);
      }

      if (toVersion !== undefined) {
        query += ` AND sequence_number <= $${++paramIndex}`;
        params.push(toVersion);
      }

      query += ' ORDER BY sequence_number ASC';

      const result = await client.query(query, params);
      const events = result.rows.map(this.mapRowToEvent.bind(this));
      
      // Log access for compliance
      if (userId && events.length > 0) {
        await this.accessLogger.logStreamAccess(
          userId,
          streamId,
          'subscribe', // This is a read operation but using 'subscribe' as it's accessing stream data
          {
            purpose: 'Event data retrieval for application functionality',
            metadata: {
              fromVersion,
              toVersion,
              resultCount: events.length,
              eventTypes: [...new Set(events.map(e => e.eventType))]
            }
          }
        );
      }
      
      return events;
    } catch (error) {
      throw new EventSourcingError(
        `Failed to get events from stream ${streamId}: ${error instanceof Error ? error.message : String(error)}`,
        'GET_EVENTS_FAILED',
        { streamId, fromVersion, toVersion }
      );
    } finally {
      client.release();
    }
  }

  async getEventsByType(eventType: string, fromTime?: Date, toTime?: Date): Promise<DomainEvent[]> {
    const client = await this.pool.connect();
    
    try {
      let query = `
        SELECT id, stream_id, event_type, event_version, event_data, metadata,
               timestamp, sequence_number, causation_id, correlation_id, tenant_id
        FROM events 
        WHERE event_type = $1
      `;
      
      const params: any[] = [eventType];
      let paramIndex = 1;

      if (fromTime) {
        query += ` AND timestamp >= $${++paramIndex}`;
        params.push(fromTime);
      }

      if (toTime) {
        query += ` AND timestamp <= $${++paramIndex}`;
        params.push(toTime);
      }

      query += ' ORDER BY timestamp ASC LIMIT $' + (++paramIndex);
      params.push(this.batchSize);

      const result = await client.query(query, params);
      
      return result.rows.map(this.mapRowToEvent);
    } catch (error) {
      throw new EventSourcingError(
        `Failed to get events by type ${eventType}: ${error instanceof Error ? error.message : String(error)}`,
        'GET_EVENTS_BY_TYPE_FAILED',
        { eventType, fromTime, toTime }
      );
    } finally {
      client.release();
    }
  }

  async getEventsFromSequence(fromSequence: number, batchSize?: number): Promise<DomainEvent[]> {
    const client = await this.pool.connect();
    const limit = batchSize || this.batchSize;
    
    try {
      const query = `
        SELECT id, stream_id, event_type, event_version, event_data, metadata,
               timestamp, sequence_number, causation_id, correlation_id, tenant_id
        FROM events 
        WHERE sequence_number >= $1
        ORDER BY sequence_number ASC 
        LIMIT $2
      `;

      const result = await client.query(query, [fromSequence, limit]);
      
      return result.rows.map(this.mapRowToEvent);
    } catch (error) {
      throw new EventSourcingError(
        `Failed to get events from sequence ${fromSequence}: ${error instanceof Error ? error.message : String(error)}`,
        'GET_EVENTS_FROM_SEQUENCE_FAILED',
        { fromSequence, batchSize }
      );
    } finally {
      client.release();
    }
  }

  async createSnapshot(streamId: string, version: number, state: unknown): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      await client.query(`
        INSERT INTO event_snapshots (stream_id, stream_version, snapshot_data)
        VALUES ($1, $2, $3)
        ON CONFLICT (stream_id, stream_version) 
        DO UPDATE SET snapshot_data = EXCLUDED.snapshot_data
      `, [streamId, version, JSON.stringify(state)]);

      logger.info(`Created snapshot for stream ${streamId} at version ${version}`, {
        streamId,
        version,
        snapshotSize: JSON.stringify(state).length
      });
    } catch (error) {
      throw new EventSourcingError(
        `Failed to create snapshot for stream ${streamId}: ${error instanceof Error ? error.message : String(error)}`,
        'CREATE_SNAPSHOT_FAILED',
        { streamId, version }
      );
    } finally {
      client.release();
    }
  }

  async getSnapshot(streamId: string): Promise<EventSnapshot | null> {
    const client = await this.pool.connect();
    
    try {
      const result = await client.query(`
        SELECT id, stream_id, stream_version, snapshot_data, created_at
        FROM event_snapshots 
        WHERE stream_id = $1 
        ORDER BY stream_version DESC 
        LIMIT 1
      `, [streamId]);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      let snapshotData: any;
      try { snapshotData = JSON.parse(row.snapshot_data); } catch { snapshotData = {}; }
      return {
        id: row.id,
        streamId: row.stream_id,
        streamVersion: row.stream_version,
        snapshotData,
        createdAt: row.created_at
      };
    } catch (error) {
      throw new EventSourcingError(
        `Failed to get snapshot for stream ${streamId}: ${error instanceof Error ? error.message : String(error)}`,
        'GET_SNAPSHOT_FAILED',
        { streamId }
      );
    } finally {
      client.release();
    }
  }

  async getStream(streamId: string): Promise<EventStream | null> {
    const client = await this.pool.connect();
    
    try {
      const result = await client.query(`
        SELECT stream_id, stream_type, current_version, created_at, updated_at, tenant_id
        FROM event_streams 
        WHERE stream_id = $1
      `, [streamId]);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        streamId: row.stream_id,
        streamType: row.stream_type,
        currentVersion: row.current_version,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        tenantId: row.tenant_id
      };
    } catch (error) {
      throw new EventSourcingError(
        `Failed to get stream ${streamId}: ${error instanceof Error ? error.message : String(error)}`,
        'GET_STREAM_FAILED',
        { streamId }
      );
    } finally {
      client.release();
    }
  }

  async streamExists(streamId: string): Promise<boolean> {
    const stream = await this.getStream(streamId);
    return stream !== null;
  }

  async getStreamVersion(streamId: string): Promise<number> {
    const stream = await this.getStream(streamId);
    return stream?.currentVersion || 0;
  }

  async *subscribeToStream(streamId: string, fromVersion?: number): AsyncIterableIterator<DomainEvent> {
    let currentVersion = fromVersion || 0;
    
    while (true) {
      const events = await this.getEvents(streamId, currentVersion + 1);
      
      for (const event of events) {
        yield event;
        currentVersion = event.sequenceNumber;
      }

      if (events.length === 0) {
        // Wait before polling again
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  async *subscribeToAll(fromSequence?: number): AsyncIterableIterator<DomainEvent> {
    let currentSequence = fromSequence || 0;
    
    while (true) {
      const events = await this.getEventsFromSequence(currentSequence + 1);
      
      for (const event of events) {
        yield event;
        currentSequence = event.sequenceNumber;
      }

      if (events.length === 0) {
        // Wait before polling again
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  async deleteStream(streamId: string): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      // Delete events
      await client.query('DELETE FROM events WHERE stream_id = $1', [streamId]);
      
      // Delete snapshots
      await client.query('DELETE FROM event_snapshots WHERE stream_id = $1', [streamId]);
      
      // Delete projections
      await client.query('DELETE FROM event_projections WHERE stream_id = $1', [streamId]);
      
      // Delete stream
      await client.query('DELETE FROM event_streams WHERE stream_id = $1', [streamId]);

      await client.query('COMMIT');

      logger.info(`Deleted stream ${streamId}`, { streamId });
    } catch (error) {
      await client.query('ROLLBACK');
      throw new EventSourcingError(
        `Failed to delete stream ${streamId}: ${error instanceof Error ? error.message : String(error)}`,
        'DELETE_STREAM_FAILED',
        { streamId }
      );
    } finally {
      client.release();
    }
  }

  async maintainPartitions(): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      await client.query('SELECT maintain_event_partitions()');
      logger.info('Event partitions maintained successfully');
    } catch (error) {
      logger.error('Failed to maintain partitions', { error: error instanceof Error ? error.message : String(error) });
      throw new EventSourcingError(
        `Failed to maintain partitions: ${error instanceof Error ? error.message : String(error)}`,
        'MAINTAIN_PARTITIONS_FAILED',
        { error }
      );
    } finally {
      client.release();
    }
  }

  private async getOrCreateStream(client: any, streamId: string, firstEvent: DomainEvent): Promise<EventStream> {
    // Try to get existing stream
    const existingResult = await client.query(
      'SELECT stream_id, stream_type, current_version, created_at, updated_at, tenant_id FROM event_streams WHERE stream_id = $1',
      [streamId]
    );

    if (existingResult.rows.length > 0) {
      const row = existingResult.rows[0];
      return {
        streamId: row.stream_id,
        streamType: row.stream_type,
        currentVersion: row.current_version,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        tenantId: row.tenant_id
      };
    }

    // Create new stream
    const streamType = this.extractStreamType(firstEvent.eventType);
    await client.query(`
      INSERT INTO event_streams (stream_id, stream_type, current_version, tenant_id)
      VALUES ($1, $2, 0, $3)
    `, [streamId, streamType, firstEvent.tenantId || null]);

    return {
      streamId,
      streamType,
      currentVersion: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      tenantId: firstEvent.tenantId
    };
  }

  private async createSnapshotIfNeeded(client: any, streamId: string, version: number): Promise<void> {
    try {
      // This is a basic implementation - in practice, you'd reconstruct the aggregate state
      const events = await this.getEvents(streamId, Math.max(1, version - this.snapshotFrequency + 1), version);
      
      const snapshotData = {
        streamId,
        version,
        eventCount: events.length,
        lastEventTypes: events.slice(-10).map(e => e.eventType),
        timestamp: new Date()
      };

      await client.query(`
        INSERT INTO event_snapshots (stream_id, stream_version, snapshot_data)
        VALUES ($1, $2, $3)
      `, [streamId, version, JSON.stringify(snapshotData)]);
    } catch (error) {
      logger.warn(`Failed to create automatic snapshot for stream ${streamId}`, {
        streamId,
        version,
        error: error instanceof Error ? error.message : String(error)
      });
      // Don't throw - snapshot creation is optional
    }
  }

  private validateEvents(events: DomainEvent[]): void {
    for (const event of events) {
      if (!event.id || !event.streamId || !event.eventType) {
        throw new InvalidEventError('Event missing required fields', event);
      }

      if (!event.correlationId) {
        throw new InvalidEventError('Event missing correlation ID', event);
      }

      if (event.causationId === event.id) {
        throw new InvalidEventError('Event cannot be its own cause', event);
      }
    }
  }

  private mapRowToEvent(row: any): DomainEvent {
    let eventData = JSON.parse(row.event_data);
    
    // Decrypt event data if it contains encrypted portions
    try {
      eventData = this.encryptionService.decryptEventDataIfEncrypted(eventData);
    } catch (error) {
      logger.error(`Failed to decrypt event data for event ${row.id}`, {
        eventId: row.id,
        eventType: row.event_type,
        error: error instanceof Error ? error.message : String(error)
      });
      // Continue with encrypted data rather than failing completely
      // In production, you might want to handle this differently based on your security policy
    }

    let metadata: any;
    try { metadata = JSON.parse(row.metadata); } catch { metadata = {}; }

    return {
      id: row.id,
      streamId: row.stream_id,
      eventType: row.event_type,
      eventVersion: row.event_version,
      eventData,
      metadata,
      timestamp: new Date(row.timestamp),
      sequenceNumber: parseInt(row.sequence_number),
      causationId: row.causation_id,
      correlationId: row.correlation_id,
      tenantId: row.tenant_id
    };
  }

  private extractStreamType(eventType: string): string {
    const parts = eventType.split('.');
    return parts.length > 1 ? parts[0] : 'general';
  }

  private schedulePartitionMaintenance(): void {
    // Run partition maintenance daily at 2 AM
    const scheduleNext = () => {
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(2, 0, 0, 0);
      
      const timeout = tomorrow.getTime() - now.getTime();
      
      this.partitionMaintenanceTimeout = setTimeout(async () => {
        try {
          await this.maintainPartitions();
        } catch (error) {
          logger.error('Scheduled partition maintenance failed', { error: error instanceof Error ? error.message : String(error) });
        }
        scheduleNext();
      }, timeout);
    };

    scheduleNext();
    logger.info('Scheduled daily partition maintenance at 2 AM');
  }

  shutdown(): void {
    if (this.partitionMaintenanceTimeout) {
      clearTimeout(this.partitionMaintenanceTimeout);
      this.partitionMaintenanceTimeout = null;
    }
  }
}