/**
 * Presence Service
 * 
 * Manages user presence tracking, status updates, and connection state
 * for real-time collaboration with heartbeat monitoring.
 */

import { Pool } from 'pg';
import { 
  UserPresence,
  UserPresenceSchema,
  PresenceService as IPresenceService,
  PresenceStatus 
} from '../../shared/types/collaboration.js';
import { logger } from '../../utils/logger.js';

export class PresenceService implements IPresenceService {
  constructor(private db: Pool) {}

  /**
   * Updates or creates user presence in a session
   */
  async updatePresence(
    presenceData: Omit<UserPresence, 'id' | 'updated_at'>
  ): Promise<UserPresence> {
    try {
      const validatedData = UserPresenceSchema.omit({
        id: true,
        updated_at: true
      }).parse(presenceData);

      // Use UPSERT to handle both create and update cases
      const result = await this.db.query(
        `INSERT INTO user_presence (
          user_id, session_id, status, custom_status_text, status_emoji,
          last_activity, connection_count, connection_ids, last_heartbeat,
          current_location, cursor_position, active_tools, user_agent,
          device_info, client_version, joined_session_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        ON CONFLICT (user_id, session_id) 
        DO UPDATE SET
          status = EXCLUDED.status,
          custom_status_text = EXCLUDED.custom_status_text,
          status_emoji = EXCLUDED.status_emoji,
          last_activity = EXCLUDED.last_activity,
          connection_count = EXCLUDED.connection_count,
          connection_ids = EXCLUDED.connection_ids,
          last_heartbeat = EXCLUDED.last_heartbeat,
          current_location = EXCLUDED.current_location,
          cursor_position = EXCLUDED.cursor_position,
          active_tools = EXCLUDED.active_tools,
          user_agent = EXCLUDED.user_agent,
          device_info = EXCLUDED.device_info,
          client_version = EXCLUDED.client_version,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *`,
        [
          validatedData.user_id,
          validatedData.session_id,
          validatedData.status,
          validatedData.custom_status_text || null,
          validatedData.status_emoji || null,
          validatedData.last_activity,
          validatedData.connection_count,
          JSON.stringify(validatedData.connection_ids),
          validatedData.last_heartbeat,
          JSON.stringify(validatedData.current_location),
          JSON.stringify(validatedData.cursor_position),
          JSON.stringify(validatedData.active_tools),
          validatedData.user_agent || null,
          JSON.stringify(validatedData.device_info),
          validatedData.client_version || null,
          validatedData.joined_session_at
        ]
      );

      const presence = this.mapRowToPresence(result.rows[0]);

      logger.debug('User presence updated', {
        userId: presence.user_id,
        sessionId: presence.session_id,
        status: presence.status,
        connectionCount: presence.connection_count
      });

      return presence;
    } catch (error) {
      logger.error('Failed to update user presence', { error, presenceData });
      throw new Error(`Failed to update user presence: ${error.message}`);
    }
  }

  /**
   * Gets all presence information for a session
   */
  async getSessionPresence(sessionId: string): Promise<UserPresence[]> {
    try {
      const result = await this.db.query(
        `SELECT up.*, u.name as user_name, u.email as user_email,
                sp.role as participant_role
         FROM user_presence up
         JOIN users u ON up.user_id = u.id
         JOIN session_participants sp ON up.user_id = sp.user_id AND up.session_id = sp.session_id
         WHERE up.session_id = $1 AND sp.is_active = true
         ORDER BY up.last_activity DESC`,
        [sessionId]
      );

      return result.rows.map(row => this.mapRowToPresence(row));
    } catch (error) {
      logger.error('Failed to get session presence', { error, sessionId });
      throw new Error(`Failed to get session presence: ${error.message}`);
    }
  }

  /**
   * Gets all sessions where a user has presence
   */
  async getUserPresence(userId: string): Promise<UserPresence[]> {
    try {
      const result = await this.db.query(
        `SELECT up.*, cs.session_name, cs.session_type
         FROM user_presence up
         JOIN collaboration_sessions cs ON up.session_id = cs.id
         WHERE up.user_id = $1 
           AND cs.is_active = true
           AND up.connection_count > 0
         ORDER BY up.last_activity DESC`,
        [userId]
      );

      return result.rows.map(row => this.mapRowToPresence(row));
    } catch (error) {
      logger.error('Failed to get user presence', { error, userId });
      throw new Error(`Failed to get user presence: ${error.message}`);
    }
  }

  /**
   * Removes user presence from a session
   */
  async removePresence(userId: string, sessionId: string): Promise<void> {
    try {
      const result = await this.db.query(
        'DELETE FROM user_presence WHERE user_id = $1 AND session_id = $2',
        [userId, sessionId]
      );

      if (result.rowCount === 0) {
        logger.warn('No presence record found to remove', { userId, sessionId });
      } else {
        logger.info('User presence removed', { userId, sessionId });
      }
    } catch (error) {
      logger.error('Failed to remove user presence', { error, userId, sessionId });
      throw new Error(`Failed to remove user presence: ${error.message}`);
    }
  }

  /**
   * Updates heartbeat for a user in a session
   */
  async updateHeartbeat(userId: string, sessionId: string): Promise<void> {
    try {
      const result = await this.db.query(
        `UPDATE user_presence 
         SET last_heartbeat = CURRENT_TIMESTAMP,
             last_activity = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $1 AND session_id = $2`,
        [userId, sessionId]
      );

      if (result.rowCount === 0) {
        // Create minimal presence if it doesn't exist
        await this.updatePresence({
          user_id: userId,
          session_id: sessionId,
          status: 'online',
          last_activity: new Date(),
          connection_count: 1,
          connection_ids: [],
          last_heartbeat: new Date(),
          current_location: {},
          cursor_position: {},
          active_tools: [],
          device_info: {},
          joined_session_at: new Date()
        });
      }

      logger.debug('Heartbeat updated', { userId, sessionId });
    } catch (error) {
      logger.error('Failed to update heartbeat', { error, userId, sessionId });
      throw new Error(`Failed to update heartbeat: ${error.message}`);
    }
  }

  /**
   * Adds a connection to user's presence
   */
  async addConnection(
    userId: string, 
    sessionId: string, 
    connectionId: string,
    deviceInfo?: Record<string, any>
  ): Promise<UserPresence> {
    try {
      const result = await this.db.query(
        `UPDATE user_presence 
         SET connection_count = connection_count + 1,
             connection_ids = array_append(connection_ids::text[], $3),
             last_activity = CURRENT_TIMESTAMP,
             last_heartbeat = CURRENT_TIMESTAMP,
             device_info = COALESCE($4::jsonb, device_info),
             status = CASE 
               WHEN status = 'offline' THEN 'online'::varchar
               ELSE status
             END,
             updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $1 AND session_id = $2
         RETURNING *`,
        [userId, sessionId, connectionId, JSON.stringify(deviceInfo || {})]
      );

      if (result.rows.length === 0) {
        // Create new presence record
        return await this.updatePresence({
          user_id: userId,
          session_id: sessionId,
          status: 'online',
          last_activity: new Date(),
          connection_count: 1,
          connection_ids: [connectionId],
          last_heartbeat: new Date(),
          current_location: {},
          cursor_position: {},
          active_tools: [],
          device_info: deviceInfo || {},
          joined_session_at: new Date()
        });
      }

      const presence = this.mapRowToPresence(result.rows[0]);

      logger.info('Connection added to user presence', {
        userId,
        sessionId,
        connectionId,
        totalConnections: presence.connection_count
      });

      return presence;
    } catch (error) {
      logger.error('Failed to add connection to presence', { 
        error, 
        userId, 
        sessionId, 
        connectionId 
      });
      throw new Error(`Failed to add connection: ${error.message}`);
    }
  }

  /**
   * Removes a connection from user's presence
   */
  async removeConnection(
    userId: string, 
    sessionId: string, 
    connectionId: string
  ): Promise<UserPresence | null> {
    try {
      const result = await this.db.query(
        `UPDATE user_presence 
         SET connection_count = GREATEST(connection_count - 1, 0),
             connection_ids = array_remove(connection_ids::text[], $3),
             status = CASE 
               WHEN connection_count - 1 <= 0 THEN 'offline'::varchar
               ELSE status
             END,
             last_activity = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $1 AND session_id = $2
         RETURNING *`,
        [userId, sessionId, connectionId]
      );

      if (result.rows.length === 0) {
        logger.warn('No presence record found for connection removal', { 
          userId, 
          sessionId, 
          connectionId 
        });
        return null;
      }

      const presence = this.mapRowToPresence(result.rows[0]);

      // Remove presence entirely if no connections remain
      if (presence.connection_count === 0) {
        await this.removePresence(userId, sessionId);
        logger.info('User presence removed due to no remaining connections', {
          userId,
          sessionId
        });
        return null;
      }

      logger.info('Connection removed from user presence', {
        userId,
        sessionId,
        connectionId,
        remainingConnections: presence.connection_count
      });

      return presence;
    } catch (error) {
      logger.error('Failed to remove connection from presence', { 
        error, 
        userId, 
        sessionId, 
        connectionId 
      });
      throw new Error(`Failed to remove connection: ${error.message}`);
    }
  }

  /**
   * Updates user's current location in the collaboration context
   */
  async updateLocation(
    userId: string,
    sessionId: string,
    location: Record<string, any>
  ): Promise<void> {
    try {
      await this.db.query(
        `UPDATE user_presence 
         SET current_location = $3,
             last_activity = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $1 AND session_id = $2`,
        [userId, sessionId, JSON.stringify(location)]
      );

      logger.debug('User location updated', { userId, sessionId, location });
    } catch (error) {
      logger.error('Failed to update user location', { error, userId, sessionId, location });
      throw new Error(`Failed to update user location: ${error.message}`);
    }
  }

  /**
   * Updates user's cursor position for real-time collaboration
   */
  async updateCursorPosition(
    userId: string,
    sessionId: string,
    position: Record<string, any>
  ): Promise<void> {
    try {
      await this.db.query(
        `UPDATE user_presence 
         SET cursor_position = $3,
             last_activity = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $1 AND session_id = $2`,
        [userId, sessionId, JSON.stringify(position)]
      );

      logger.debug('Cursor position updated', { userId, sessionId, position });
    } catch (error) {
      logger.error('Failed to update cursor position', { error, userId, sessionId, position });
      // Don't throw - cursor updates are non-critical
    }
  }

  /**
   * Gets stale presence records that need cleanup
   */
  async getStalePresence(thresholdMinutes: number = 5): Promise<UserPresence[]> {
    try {
      const threshold = new Date(Date.now() - thresholdMinutes * 60 * 1000);

      const result = await this.db.query(
        `SELECT up.*, u.name as user_name, u.email as user_email
         FROM user_presence up
         JOIN users u ON up.user_id = u.id
         WHERE up.last_heartbeat < $1 
           AND up.status != 'offline'
         ORDER BY up.last_heartbeat ASC`,
        [threshold]
      );

      return result.rows.map(row => this.mapRowToPresence(row));
    } catch (error) {
      logger.error('Failed to get stale presence records', { error, thresholdMinutes });
      throw new Error(`Failed to get stale presence: ${error.message}`);
    }
  }

  /**
   * Cleans up stale presence records
   */
  async cleanupStalePresence(thresholdMinutes: number = 10): Promise<number> {
    try {
      const threshold = new Date(Date.now() - thresholdMinutes * 60 * 1000);

      const result = await this.db.query(
        `UPDATE user_presence 
         SET status = 'offline',
             connection_count = 0,
             connection_ids = '[]'::jsonb,
             updated_at = CURRENT_TIMESTAMP
         WHERE last_heartbeat < $1 
           AND status != 'offline'`,
        [threshold]
      );

      const cleanedCount = result.rowCount || 0;

      if (cleanedCount > 0) {
        logger.info('Stale presence records cleaned up', { 
          cleanedCount, 
          thresholdMinutes 
        });
      }

      return cleanedCount;
    } catch (error) {
      logger.error('Failed to cleanup stale presence', { error, thresholdMinutes });
      throw new Error(`Failed to cleanup stale presence: ${error.message}`);
    }
  }

  /**
   * Gets presence statistics for a session
   */
  async getSessionPresenceStats(sessionId: string): Promise<{
    totalUsers: number;
    onlineUsers: number;
    idleUsers: number;
    totalConnections: number;
    averageConnectionsPerUser: number;
  }> {
    try {
      const result = await this.db.query(
        `SELECT 
           COUNT(*) as total_users,
           COUNT(*) FILTER (WHERE status = 'online') as online_users,
           COUNT(*) FILTER (WHERE status = 'idle') as idle_users,
           SUM(connection_count) as total_connections,
           AVG(connection_count) as avg_connections_per_user
         FROM user_presence 
         WHERE session_id = $1`,
        [sessionId]
      );

      const row = result.rows[0];

      return {
        totalUsers: parseInt(row.total_users) || 0,
        onlineUsers: parseInt(row.online_users) || 0,
        idleUsers: parseInt(row.idle_users) || 0,
        totalConnections: parseInt(row.total_connections) || 0,
        averageConnectionsPerUser: parseFloat(row.avg_connections_per_user) || 0
      };
    } catch (error) {
      logger.error('Failed to get session presence stats', { error, sessionId });
      throw new Error(`Failed to get session presence stats: ${error.message}`);
    }
  }

  /**
   * Maps database row to UserPresence object
   */
  private mapRowToPresence(row: any): UserPresence {
    return {
      id: row.id,
      user_id: row.user_id,
      session_id: row.session_id,
      status: row.status as PresenceStatus,
      custom_status_text: row.custom_status_text,
      status_emoji: row.status_emoji,
      last_activity: new Date(row.last_activity),
      connection_count: row.connection_count,
      connection_ids: Array.isArray(row.connection_ids) ? row.connection_ids : [],
      last_heartbeat: new Date(row.last_heartbeat),
      current_location: row.current_location || {},
      cursor_position: row.cursor_position || {},
      active_tools: Array.isArray(row.active_tools) ? row.active_tools : [],
      user_agent: row.user_agent,
      device_info: row.device_info || {},
      client_version: row.client_version,
      joined_session_at: new Date(row.joined_session_at),
      updated_at: new Date(row.updated_at)
    };
  }
}