/**
 * Collaboration Session Service
 * 
 * Handles CRUD operations for collaboration sessions, participant management,
 * and permission validation for real-time collaborative features.
 */

import { Pool } from 'pg';
import { 
  CollaborationSession,
  SessionParticipant,
  CollaborationSessionSchema,
  SessionParticipantSchema,
  CollaborationSessionService as ICollaborationSessionService,
  ParticipantRole 
} from '../../shared/types/collaboration.js';
import { logger } from '../../utils/logger.js';

export class CollaborationSessionService implements ICollaborationSessionService {
  constructor(private db: Pool) {}

  /**
   * Creates a new collaboration session
   */
  async createSession(
    sessionData: Omit<CollaborationSession, 'id' | 'created_at' | 'updated_at'>
  ): Promise<CollaborationSession> {
    try {
      const validatedData = CollaborationSessionSchema.omit({
        id: true,
        created_at: true,
        updated_at: true
      }).parse(sessionData);

      const result = await this.db.query(
        `INSERT INTO collaboration_sessions (
          workspace_id, session_name, session_type, created_by,
          expires_at, is_active, settings, max_participants,
          allow_anonymous, require_approval, context_data,
          shared_state, activity_summary
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING *`,
        [
          validatedData.workspace_id,
          validatedData.session_name,
          validatedData.session_type,
          validatedData.created_by,
          validatedData.expires_at || null,
          validatedData.is_active,
          JSON.stringify(validatedData.settings),
          validatedData.max_participants,
          validatedData.allow_anonymous,
          validatedData.require_approval,
          JSON.stringify(validatedData.context_data),
          JSON.stringify(validatedData.shared_state),
          JSON.stringify(validatedData.activity_summary)
        ]
      );

      const session = this.mapRowToSession(result.rows[0]);

      // Automatically add creator as owner
      await this.addParticipant({
        session_id: session.id,
        user_id: session.created_by,
        role: 'owner',
        can_invite_others: true,
        can_modify_session: true,
        can_broadcast_events: true,
        permissions: { is_creator: true },
        is_active: true,
        event_count: 0,
        total_active_time_ms: 0
      });

      logger.info('Collaboration session created', { 
        sessionId: session.id,
        type: session.session_type,
        createdBy: session.created_by
      });

      return session;
    } catch (error) {
      logger.error('Failed to create collaboration session', { error, sessionData });
      throw new Error(`Failed to create collaboration session: ${error.message}`);
    }
  }

  /**
   * Retrieves a collaboration session by ID
   */
  async getSession(id: string): Promise<CollaborationSession | null> {
    try {
      const result = await this.db.query(
        'SELECT * FROM collaboration_sessions WHERE id = $1',
        [id]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapRowToSession(result.rows[0]);
    } catch (error) {
      logger.error('Failed to get collaboration session', { error, sessionId: id });
      throw new Error(`Failed to get collaboration session: ${error.message}`);
    }
  }

  /**
   * Updates a collaboration session
   */
  async updateSession(
    id: string, 
    updates: Partial<CollaborationSession>
  ): Promise<CollaborationSession> {
    try {
      const validatedUpdates = CollaborationSessionSchema.partial().parse(updates);

      // Build dynamic update query
      const updateFields: string[] = [];
      const updateValues: any[] = [];
      let paramCounter = 1;

      Object.entries(validatedUpdates).forEach(([key, value]) => {
        if (key !== 'id' && key !== 'created_at') {
          if (key === 'settings' || key === 'context_data' || 
              key === 'shared_state' || key === 'activity_summary') {
            updateFields.push(`${key} = $${paramCounter}`);
            updateValues.push(JSON.stringify(value));
          } else {
            updateFields.push(`${key} = $${paramCounter}`);
            updateValues.push(value);
          }
          paramCounter++;
        }
      });

      if (updateFields.length === 0) {
        throw new Error('No valid fields to update');
      }

      // Always update updated_at
      updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
      updateValues.push(id);

      const result = await this.db.query(
        `UPDATE collaboration_sessions 
         SET ${updateFields.join(', ')} 
         WHERE id = $${paramCounter} 
         RETURNING *`,
        updateValues
      );

      if (result.rows.length === 0) {
        throw new Error('Session not found');
      }

      const session = this.mapRowToSession(result.rows[0]);

      logger.info('Collaboration session updated', { 
        sessionId: id,
        updatedFields: Object.keys(validatedUpdates)
      });

      return session;
    } catch (error) {
      logger.error('Failed to update collaboration session', { error, sessionId: id, updates });
      throw new Error(`Failed to update collaboration session: ${error.message}`);
    }
  }

  /**
   * Deletes a collaboration session and all related data
   */
  async deleteSession(id: string): Promise<void> {
    try {
      const result = await this.db.query(
        'DELETE FROM collaboration_sessions WHERE id = $1',
        [id]
      );

      if (result.rowCount === 0) {
        throw new Error('Session not found');
      }

      logger.info('Collaboration session deleted', { sessionId: id });
    } catch (error) {
      logger.error('Failed to delete collaboration session', { error, sessionId: id });
      throw new Error(`Failed to delete collaboration session: ${error.message}`);
    }
  }

  /**
   * Lists active collaboration sessions
   */
  async listActiveSessions(workspace_id?: string): Promise<CollaborationSession[]> {
    try {
      let query = 'SELECT * FROM collaboration_sessions WHERE is_active = true';
      const params: any[] = [];

      if (workspace_id) {
        query += ' AND workspace_id = $1';
        params.push(workspace_id);
      }

      query += ' ORDER BY created_at DESC';

      const result = await this.db.query(query, params);

      return result.rows.map(row => this.mapRowToSession(row));
    } catch (error) {
      logger.error('Failed to list active collaboration sessions', { error, workspace_id });
      throw new Error(`Failed to list active collaboration sessions: ${error.message}`);
    }
  }

  /**
   * Adds a participant to a collaboration session
   */
  async addParticipant(
    participantData: Omit<SessionParticipant, 'id' | 'joined_at' | 'last_seen_at'>
  ): Promise<SessionParticipant> {
    try {
      const validatedData = SessionParticipantSchema.omit({
        id: true,
        joined_at: true,
        last_seen_at: true
      }).parse(participantData);

      // Check if session exists and user isn't already a participant
      const sessionCheck = await this.db.query(
        'SELECT id, max_participants FROM collaboration_sessions WHERE id = $1 AND is_active = true',
        [validatedData.session_id]
      );

      if (sessionCheck.rows.length === 0) {
        throw new Error('Session not found or inactive');
      }

      // Check current participant count
      const participantCount = await this.db.query(
        'SELECT COUNT(*) as count FROM session_participants WHERE session_id = $1 AND is_active = true',
        [validatedData.session_id]
      );

      const currentCount = parseInt(participantCount.rows[0].count);
      const maxParticipants = sessionCheck.rows[0].max_participants;

      if (currentCount >= maxParticipants) {
        throw new Error(`Session has reached maximum capacity of ${maxParticipants} participants`);
      }

      // Check for existing participant
      const existingParticipant = await this.db.query(
        'SELECT id FROM session_participants WHERE session_id = $1 AND user_id = $2',
        [validatedData.session_id, validatedData.user_id]
      );

      if (existingParticipant.rows.length > 0) {
        throw new Error('User is already a participant in this session');
      }

      const result = await this.db.query(
        `INSERT INTO session_participants (
          session_id, user_id, role, is_active, permissions,
          can_invite_others, can_modify_session, can_broadcast_events,
          event_count, total_active_time_ms, last_activity_type
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *`,
        [
          validatedData.session_id,
          validatedData.user_id,
          validatedData.role,
          validatedData.is_active,
          JSON.stringify(validatedData.permissions),
          validatedData.can_invite_others,
          validatedData.can_modify_session,
          validatedData.can_broadcast_events,
          validatedData.event_count,
          validatedData.total_active_time_ms,
          validatedData.last_activity_type || null
        ]
      );

      const participant = this.mapRowToParticipant(result.rows[0]);

      logger.info('Participant added to collaboration session', {
        sessionId: validatedData.session_id,
        userId: validatedData.user_id,
        role: validatedData.role
      });

      return participant;
    } catch (error) {
      logger.error('Failed to add participant to collaboration session', { error, participantData });
      throw new Error(`Failed to add participant: ${error.message}`);
    }
  }

  /**
   * Updates a session participant
   */
  async updateParticipant(
    id: string, 
    updates: Partial<SessionParticipant>
  ): Promise<SessionParticipant> {
    try {
      const validatedUpdates = SessionParticipantSchema.partial().parse(updates);

      // Build dynamic update query
      const updateFields: string[] = [];
      const updateValues: any[] = [];
      let paramCounter = 1;

      Object.entries(validatedUpdates).forEach(([key, value]) => {
        if (key !== 'id' && key !== 'joined_at') {
          if (key === 'permissions') {
            updateFields.push(`${key} = $${paramCounter}`);
            updateValues.push(JSON.stringify(value));
          } else {
            updateFields.push(`${key} = $${paramCounter}`);
            updateValues.push(value);
          }
          paramCounter++;
        }
      });

      if (updateFields.length === 0) {
        throw new Error('No valid fields to update');
      }

      // Always update last_seen_at
      updateFields.push(`last_seen_at = CURRENT_TIMESTAMP`);
      updateValues.push(id);

      const result = await this.db.query(
        `UPDATE session_participants 
         SET ${updateFields.join(', ')} 
         WHERE id = $${paramCounter} 
         RETURNING *`,
        updateValues
      );

      if (result.rows.length === 0) {
        throw new Error('Participant not found');
      }

      const participant = this.mapRowToParticipant(result.rows[0]);

      logger.info('Session participant updated', {
        participantId: id,
        updatedFields: Object.keys(validatedUpdates)
      });

      return participant;
    } catch (error) {
      logger.error('Failed to update session participant', { error, participantId: id, updates });
      throw new Error(`Failed to update participant: ${error.message}`);
    }
  }

  /**
   * Removes a participant from a collaboration session
   */
  async removeParticipant(sessionId: string, userId: string): Promise<void> {
    try {
      const result = await this.db.query(
        'DELETE FROM session_participants WHERE session_id = $1 AND user_id = $2',
        [sessionId, userId]
      );

      if (result.rowCount === 0) {
        throw new Error('Participant not found');
      }

      logger.info('Participant removed from collaboration session', {
        sessionId,
        userId
      });
    } catch (error) {
      logger.error('Failed to remove participant from collaboration session', { 
        error, 
        sessionId, 
        userId 
      });
      throw new Error(`Failed to remove participant: ${error.message}`);
    }
  }

  /**
   * Gets all participants for a collaboration session
   */
  async getSessionParticipants(sessionId: string): Promise<SessionParticipant[]> {
    try {
      const result = await this.db.query(
        `SELECT sp.*, u.name as user_name, u.email as user_email 
         FROM session_participants sp 
         JOIN users u ON sp.user_id = u.id 
         WHERE sp.session_id = $1 
         ORDER BY sp.joined_at ASC`,
        [sessionId]
      );

      return result.rows.map(row => this.mapRowToParticipant(row));
    } catch (error) {
      logger.error('Failed to get session participants', { error, sessionId });
      throw new Error(`Failed to get session participants: ${error.message}`);
    }
  }

  /**
   * Validates if a user has permission to perform an action in a session
   */
  async validatePermission(
    sessionId: string,
    userId: string,
    action: 'invite' | 'modify' | 'broadcast' | 'moderate'
  ): Promise<boolean> {
    try {
      const result = await this.db.query(
        'SELECT role, can_invite_others, can_modify_session, can_broadcast_events, permissions FROM session_participants WHERE session_id = $1 AND user_id = $2 AND is_active = true',
        [sessionId, userId]
      );

      if (result.rows.length === 0) {
        return false;
      }

      const participant = result.rows[0];

      switch (action) {
        case 'invite':
          return participant.can_invite_others || ['owner', 'moderator'].includes(participant.role);
        case 'modify':
          return participant.can_modify_session || ['owner', 'moderator'].includes(participant.role);
        case 'broadcast':
          return participant.can_broadcast_events;
        case 'moderate':
          return ['owner', 'moderator'].includes(participant.role);
        default:
          return false;
      }
    } catch (error) {
      logger.error('Failed to validate permission', { error, sessionId, userId, action });
      return false;
    }
  }

  /**
   * Maps database row to CollaborationSession object
   */
  private mapRowToSession(row: any): CollaborationSession {
    return {
      id: row.id,
      workspace_id: row.workspace_id,
      session_name: row.session_name,
      session_type: row.session_type,
      created_by: row.created_by,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
      expires_at: row.expires_at ? new Date(row.expires_at) : undefined,
      is_active: row.is_active,
      settings: row.settings || {},
      max_participants: row.max_participants,
      allow_anonymous: row.allow_anonymous,
      require_approval: row.require_approval,
      context_data: row.context_data || {},
      shared_state: row.shared_state || {},
      activity_summary: row.activity_summary || {}
    };
  }

  /**
   * Maps database row to SessionParticipant object
   */
  private mapRowToParticipant(row: any): SessionParticipant {
    return {
      id: row.id,
      session_id: row.session_id,
      user_id: row.user_id,
      role: row.role as ParticipantRole,
      joined_at: new Date(row.joined_at),
      last_seen_at: new Date(row.last_seen_at),
      is_active: row.is_active,
      permissions: row.permissions || {},
      can_invite_others: row.can_invite_others,
      can_modify_session: row.can_modify_session,
      can_broadcast_events: row.can_broadcast_events,
      event_count: row.event_count,
      total_active_time_ms: row.total_active_time_ms,
      last_activity_type: row.last_activity_type
    };
  }
}