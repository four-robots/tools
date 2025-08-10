/**
 * Event Broadcasting Service
 * 
 * Manages event serialization, ordering, persistence, and conflict detection
 * for real-time collaboration events with message ordering guarantees.
 */

import { Pool } from 'pg';
import { 
  CollaborationEvent,
  CollaborationEventSchema,
  EventBroadcastingService as IEventBroadcastingService,
  DeliveryStatus,
  EventCategory 
} from '../../shared/types/collaboration.js';
import { logger } from '../../utils/logger.js';
import crypto from 'crypto';

export class EventBroadcastingService implements IEventBroadcastingService {
  private cleanupInterval: NodeJS.Timeout;
  private readonly EVENT_RETENTION_DURATION = 24 * 60 * 60 * 1000; // 24 hours
  private readonly MAX_EVENTS_PER_SESSION = 10000;

  constructor(private db: Pool) {
    this.startEventCleanupJob();
  }

  /**
   * Broadcasts an event to all session participants with ordering guarantees
   */
  async broadcastEvent(
    eventData: Omit<CollaborationEvent, 'id' | 'created_at' | 'processed_at'>
  ): Promise<CollaborationEvent> {
    try {
      const validatedData = CollaborationEventSchema.omit({
        id: true,
        created_at: true,
        processed_at: true
      }).parse(eventData);

      // Generate message ID if not provided
      if (!validatedData.message_id) {
        validatedData.message_id = crypto.randomUUID();
      }

      // Get next sequence number for the session
      const sequenceNumber = await this.getNextSequenceNumber(validatedData.session_id);
      validatedData.sequence_number = sequenceNumber;

      // Check for duplicate message IDs (idempotency)
      const existingEvent = await this.db.query(
        'SELECT id FROM collaboration_events WHERE message_id = $1',
        [validatedData.message_id]
      );

      if (existingEvent.rows.length > 0) {
        logger.warn('Duplicate event message detected', { 
          messageId: validatedData.message_id,
          sessionId: validatedData.session_id
        });
        
        // Return the existing event instead of creating a duplicate
        const result = await this.db.query(
          'SELECT * FROM collaboration_events WHERE message_id = $1',
          [validatedData.message_id]
        );
        return this.mapRowToEvent(result.rows[0]);
      }

      // Validate session exists and user is a participant
      await this.validateEventPermissions(validatedData.session_id, validatedData.user_id);

      // Insert the event
      const result = await this.db.query(
        `INSERT INTO collaboration_events (
          session_id, user_id, event_type, event_category, event_data,
          sequence_number, message_id, broadcast_count, delivery_status,
          client_timestamp, source_connection_id, requires_ack, parent_event_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING *`,
        [
          validatedData.session_id,
          validatedData.user_id,
          validatedData.event_type,
          validatedData.event_category,
          JSON.stringify(validatedData.event_data),
          validatedData.sequence_number,
          validatedData.message_id,
          validatedData.broadcast_count,
          validatedData.delivery_status,
          validatedData.client_timestamp || null,
          validatedData.source_connection_id || null,
          validatedData.requires_ack,
          validatedData.parent_event_id || null
        ]
      );

      const event = this.mapRowToEvent(result.rows[0]);

      // Update participant activity
      await this.updateParticipantActivity(validatedData.session_id, validatedData.user_id, validatedData.event_type);

      // Update session activity summary
      await this.updateSessionActivitySummary(validatedData.session_id, validatedData.event_type);

      logger.info('Collaboration event broadcasted', {
        eventId: event.id,
        sessionId: event.session_id,
        eventType: event.event_type,
        sequenceNumber: event.sequence_number,
        messageId: event.message_id
      });

      return event;
    } catch (error) {
      logger.error('Failed to broadcast collaboration event', { error, eventData });
      throw new Error(`Failed to broadcast event: ${error.message}`);
    }
  }

  /**
   * Retrieves event history for a session with optional filtering
   */
  async getEventHistory(
    sessionId: string, 
    fromSequence?: number, 
    limit: number = 100
  ): Promise<CollaborationEvent[]> {
    try {
      let query = `
        SELECT ce.*, u.name as user_name, u.email as user_email
        FROM collaboration_events ce
        JOIN users u ON ce.user_id = u.id
        WHERE ce.session_id = $1
      `;
      const params: any[] = [sessionId];
      let paramCounter = 2;

      if (fromSequence !== undefined) {
        query += ` AND ce.sequence_number >= $${paramCounter}`;
        params.push(fromSequence);
        paramCounter++;
      }

      query += ` ORDER BY ce.sequence_number ASC LIMIT $${paramCounter}`;
      params.push(limit);

      const result = await this.db.query(query, params);

      return result.rows.map(row => this.mapRowToEvent(row));
    } catch (error) {
      logger.error('Failed to get event history', { error, sessionId, fromSequence, limit });
      throw new Error(`Failed to get event history: ${error.message}`);
    }
  }

  /**
   * Marks an event as successfully delivered
   */
  async markEventDelivered(eventId: string): Promise<void> {
    try {
      const result = await this.db.query(
        `UPDATE collaboration_events 
         SET delivery_status = 'delivered', 
             processed_at = CURRENT_TIMESTAMP,
             broadcast_count = broadcast_count + 1
         WHERE id = $1`,
        [eventId]
      );

      if (result.rowCount === 0) {
        throw new Error('Event not found');
      }

      logger.debug('Event marked as delivered', { eventId });
    } catch (error) {
      logger.error('Failed to mark event as delivered', { error, eventId });
      throw new Error(`Failed to mark event as delivered: ${error.message}`);
    }
  }

  /**
   * Replays events from a specific timestamp for session synchronization
   */
  async replayEvents(sessionId: string, fromTimestamp: Date): Promise<CollaborationEvent[]> {
    try {
      const result = await this.db.query(
        `SELECT ce.*, u.name as user_name, u.email as user_email
         FROM collaboration_events ce
         JOIN users u ON ce.user_id = u.id
         WHERE ce.session_id = $1 
           AND ce.created_at >= $2 
           AND ce.delivery_status = 'delivered'
         ORDER BY ce.sequence_number ASC`,
        [sessionId, fromTimestamp]
      );

      const events = result.rows.map(row => this.mapRowToEvent(row));

      logger.info('Events replayed for session synchronization', {
        sessionId,
        fromTimestamp,
        eventCount: events.length
      });

      return events;
    } catch (error) {
      logger.error('Failed to replay events', { error, sessionId, fromTimestamp });
      throw new Error(`Failed to replay events: ${error.message}`);
    }
  }

  /**
   * Gets events that failed delivery for retry processing
   */
  async getFailedEvents(maxAge: Date = new Date(Date.now() - 5 * 60 * 1000)): Promise<CollaborationEvent[]> {
    try {
      const result = await this.db.query(
        `SELECT ce.*, u.name as user_name, u.email as user_email
         FROM collaboration_events ce
         JOIN users u ON ce.user_id = u.id
         WHERE ce.delivery_status IN ('failed', 'pending')
           AND ce.created_at >= $1
         ORDER BY ce.created_at ASC
         LIMIT 1000`,
        [maxAge]
      );

      return result.rows.map(row => this.mapRowToEvent(row));
    } catch (error) {
      logger.error('Failed to get failed events', { error, maxAge });
      throw new Error(`Failed to get failed events: ${error.message}`);
    }
  }

  /**
   * Marks an event as failed for retry processing
   */
  async markEventFailed(eventId: string, reason?: string): Promise<void> {
    try {
      const result = await this.db.query(
        `UPDATE collaboration_events 
         SET delivery_status = 'failed',
             event_data = jsonb_set(
               event_data, 
               '{failure_reason}', 
               $2::jsonb,
               true
             )
         WHERE id = $1`,
        [eventId, JSON.stringify(reason || 'Unknown delivery failure')]
      );

      if (result.rowCount === 0) {
        throw new Error('Event not found');
      }

      logger.warn('Event marked as failed', { eventId, reason });
    } catch (error) {
      logger.error('Failed to mark event as failed', { error, eventId, reason });
      throw new Error(`Failed to mark event as failed: ${error.message}`);
    }
  }

  /**
   * Detects and resolves conflicts between concurrent events
   */
  async detectConflicts(sessionId: string, windowMs: number = 5000): Promise<CollaborationEvent[]> {
    try {
      const windowStart = new Date(Date.now() - windowMs);
      
      const result = await this.db.query(
        `WITH concurrent_events AS (
          SELECT ce1.*, ce2.id as conflict_with
          FROM collaboration_events ce1
          JOIN collaboration_events ce2 ON ce1.session_id = ce2.session_id
          WHERE ce1.session_id = $1
            AND ce1.created_at >= $2
            AND ce2.created_at >= $2
            AND ce1.id != ce2.id
            AND ce1.user_id != ce2.user_id
            AND (
              -- Conflicting cursor positions
              (ce1.event_type = 'cursor' AND ce2.event_type = 'cursor' AND
               ce1.event_data->>'target' = ce2.event_data->>'target') OR
              -- Conflicting annotations on same element
              (ce1.event_type = 'annotation' AND ce2.event_type = 'annotation' AND
               ce1.event_data->>'element_id' = ce2.event_data->>'element_id') OR
              -- Conflicting filter changes
              (ce1.event_type = 'filter' AND ce2.event_type = 'filter' AND
               ce1.event_data->>'filter_key' = ce2.event_data->>'filter_key')
            )
            AND ABS(EXTRACT(EPOCH FROM (ce1.created_at - ce2.created_at)) * 1000) < $3
        )
        SELECT DISTINCT ce.*, u.name as user_name, u.email as user_email
        FROM concurrent_events ce
        JOIN users u ON ce.user_id = u.id
        ORDER BY ce.sequence_number ASC`,
        [sessionId, windowStart, windowMs]
      );

      const conflicts = result.rows.map(row => this.mapRowToEvent(row));

      if (conflicts.length > 0) {
        logger.info('Collaboration conflicts detected', {
          sessionId,
          conflictCount: conflicts.length,
          windowMs
        });

        // Mark conflicts in event data
        for (const conflict of conflicts) {
          await this.db.query(
            `UPDATE collaboration_events 
             SET event_data = jsonb_set(
               event_data, 
               '{has_conflict}', 
               'true'::jsonb,
               true
             )
             WHERE id = $1`,
            [conflict.id]
          );
        }
      }

      return conflicts;
    } catch (error) {
      logger.error('Failed to detect conflicts', { error, sessionId, windowMs });
      throw new Error(`Failed to detect conflicts: ${error.message}`);
    }
  }

  /**
   * Gets the next sequence number for a session
   */
  private async getNextSequenceNumber(sessionId: string): Promise<number> {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      
      const result = await client.query(
        'SELECT COALESCE(MAX(sequence_number), 0) + 1 as next_seq FROM collaboration_events WHERE session_id = $1',
        [sessionId]
      );
      
      const nextSequence = result.rows[0].next_seq;
      
      await client.query('COMMIT');
      return nextSequence;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Validates that a user can broadcast events in a session
   */
  private async validateEventPermissions(sessionId: string, userId: string): Promise<void> {
    const result = await this.db.query(
      `SELECT sp.can_broadcast_events, cs.is_active
       FROM session_participants sp
       JOIN collaboration_sessions cs ON sp.session_id = cs.id
       WHERE sp.session_id = $1 AND sp.user_id = $2 AND sp.is_active = true`,
      [sessionId, userId]
    );

    if (result.rows.length === 0) {
      throw new Error('User is not an active participant in this session');
    }

    const participant = result.rows[0];
    
    if (!participant.is_active) {
      throw new Error('Session is not active');
    }

    if (!participant.can_broadcast_events) {
      throw new Error('User does not have permission to broadcast events in this session');
    }
  }

  /**
   * Updates participant activity metrics
   */
  private async updateParticipantActivity(
    sessionId: string, 
    userId: string, 
    eventType: string
  ): Promise<void> {
    try {
      await this.db.query(
        `UPDATE session_participants 
         SET event_count = event_count + 1,
             last_activity_type = $3,
             last_seen_at = CURRENT_TIMESTAMP
         WHERE session_id = $1 AND user_id = $2`,
        [sessionId, userId, eventType]
      );
    } catch (error) {
      logger.error('Failed to update participant activity', { 
        error, 
        sessionId, 
        userId, 
        eventType 
      });
      // Don't throw - this is a non-critical update
    }
  }

  /**
   * Updates session activity summary
   */
  private async updateSessionActivitySummary(sessionId: string, eventType: string): Promise<void> {
    try {
      await this.db.query(
        `UPDATE collaboration_sessions 
         SET activity_summary = jsonb_set(
           activity_summary,
           '{event_counts,$1}',
           COALESCE(activity_summary->'event_counts'->$1, '0'::jsonb)::int + 1,
           true
         ),
         updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [eventType, sessionId]
      );
    } catch (error) {
      logger.error('Failed to update session activity summary', { 
        error, 
        sessionId, 
        eventType 
      });
      // Don't throw - this is a non-critical update
    }
  }

  /**
   * Maps database row to CollaborationEvent object
   */
  private mapRowToEvent(row: any): CollaborationEvent {
    return {
      id: row.id,
      session_id: row.session_id,
      user_id: row.user_id,
      event_type: row.event_type,
      event_category: row.event_category as EventCategory,
      event_data: row.event_data || {},
      sequence_number: row.sequence_number,
      created_at: new Date(row.created_at),
      message_id: row.message_id,
      processed_at: row.processed_at ? new Date(row.processed_at) : undefined,
      broadcast_count: row.broadcast_count,
      delivery_status: row.delivery_status as DeliveryStatus,
      client_timestamp: row.client_timestamp ? new Date(row.client_timestamp) : undefined,
      source_connection_id: row.source_connection_id,
      requires_ack: row.requires_ack,
      parent_event_id: row.parent_event_id
    };
  }

  /**
   * Cleans up old events based on retention policy
   */
  private async cleanupOldEvents(): Promise<void> {
    try {
      const retentionCutoff = new Date(Date.now() - this.EVENT_RETENTION_DURATION);
      
      // Delete events older than retention duration
      const ageCleanupResult = await this.db.query(
        'DELETE FROM collaboration_events WHERE created_at < $1',
        [retentionCutoff]
      );

      logger.info('Cleaned up old events by age', { 
        deletedCount: ageCleanupResult.rowCount,
        retentionCutoff: retentionCutoff.toISOString()
      });

      // Keep only latest N events per session
      const sessionCleanupResult = await this.db.query(`
        DELETE FROM collaboration_events 
        WHERE id IN (
          SELECT ce.id FROM collaboration_events ce
          WHERE ce.id NOT IN (
            SELECT id FROM collaboration_events 
            WHERE session_id = ce.session_id 
            ORDER BY sequence_number DESC 
            LIMIT $1
          )
          AND ce.session_id IN (
            SELECT session_id FROM collaboration_events 
            GROUP BY session_id 
            HAVING COUNT(*) > $1
          )
        )
      `, [this.MAX_EVENTS_PER_SESSION]);

      if (sessionCleanupResult.rowCount > 0) {
        logger.info('Cleaned up excess events per session', { 
          deletedCount: sessionCleanupResult.rowCount,
          maxEventsPerSession: this.MAX_EVENTS_PER_SESSION
        });
      }

    } catch (error) {
      logger.error('Failed to cleanup old events', { error });
    }
  }

  /**
   * Starts the background event cleanup job
   */
  private startEventCleanupJob(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupOldEvents().catch(error => {
        logger.error('Event cleanup job failed', { error });
      });
    }, 60 * 60 * 1000); // Run every hour

    logger.info('Event cleanup job started', {
      retentionDurationHours: this.EVENT_RETENTION_DURATION / (60 * 60 * 1000),
      maxEventsPerSession: this.MAX_EVENTS_PER_SESSION,
      cleanupIntervalHours: 1
    });
  }

  /**
   * Stops the event cleanup job (for graceful shutdown)
   */
  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      logger.info('Event cleanup job stopped');
    }
  }
}