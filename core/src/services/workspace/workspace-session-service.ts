import { DatabasePool } from '../../utils/database-pool.js';
import { Logger } from '../../utils/logger.js';
import {
  WorkspaceSession,
  WorkspaceSessionStatus,
  WorkspaceSessionPresenceData,
  WorkspaceSessionCursorPosition,
  WorkspacePresenceUpdate,
  WorkspaceRealtimeEvent,
  WorkspaceError,
} from '@shared/types/workspace.js';
import { randomUUID } from 'crypto';

/**
 * Workspace session management service for real-time collaboration
 */
export class WorkspaceSessionService {
  private logger: Logger;
  private sessionTimeout: number = 3600000; // 1 hour in milliseconds
  private cleanupIntervalHandle: ReturnType<typeof setInterval> | null = null;

  constructor(
    private db: DatabasePool,
    logger?: Logger
  ) {
    this.logger = logger || new Logger('WorkspaceSessionService');

    // Start cleanup interval
    this.startSessionCleanup();
  }

  /**
   * Stop background cleanup and release resources
   */
  destroy(): void {
    if (this.cleanupIntervalHandle) {
      clearInterval(this.cleanupIntervalHandle);
      this.cleanupIntervalHandle = null;
    }
  }

  /**
   * Start a new workspace session
   */
  async startSession(
    workspaceId: string,
    userId: string,
    tenantId: string,
    connectionId?: string,
    clientInfo?: any
  ): Promise<WorkspaceSession> {
    try {
      // Validate workspace access
      await this.validateWorkspaceAccess(workspaceId, userId, tenantId);

      // End any existing active sessions for this user in this workspace
      await this.endUserSessions(workspaceId, userId);

      const sessionId = randomUUID();
      const sessionToken = this.generateSessionToken();
      const now = new Date().toISOString();

      const session: WorkspaceSession = {
        id: sessionId,
        workspaceId,
        userId,
        sessionToken,
        connectionId,
        clientInfo: clientInfo || {},
        presenceData: {
          isOnline: true,
          isActive: true,
          lastSeen: now,
        },
        startedAt: now,
        lastActivityAt: now,
        status: 'active',
      };

      const query = `
        INSERT INTO workspace_sessions (
          id, workspace_id, user_id, session_token, connection_id,
          client_info, presence_data, started_at, last_activity_at, status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
      `;

      const result = await this.db.query(query, [
        session.id,
        session.workspaceId,
        session.userId,
        session.sessionToken,
        session.connectionId,
        JSON.stringify(session.clientInfo),
        JSON.stringify(session.presenceData),
        session.startedAt,
        session.lastActivityAt,
        session.status,
      ]);

      if (result.rows.length === 0) {
        throw new Error('Failed to create session');
      }

      // Update member last active
      await this.updateMemberLastActive(workspaceId, userId);

      // Emit session started event
      await this.emitRealtimeEvent(workspaceId, userId, 'session_started', { sessionId });

      this.logger.info('Session started successfully', { sessionId, workspaceId, userId });

      return this.mapDatabaseRowToSession(result.rows[0]);
    } catch (error) {
      this.logger.error('Failed to start session', { error, workspaceId, userId });
      throw error;
    }
  }

  /**
   * End a workspace session
   */
  async endSession(
    sessionId: string,
    userId: string,
    reason?: string
  ): Promise<void> {
    try {
      const query = `
        UPDATE workspace_sessions
        SET status = 'ended', ended_at = $1, last_activity_at = $1
        WHERE id = $2 AND user_id = $3 AND status IN ('active', 'inactive')
        RETURNING workspace_id, user_id
      `;

      const result = await this.db.query(query, [new Date().toISOString(), sessionId, userId]);

      if (result.rows.length === 0) {
        throw this.createSessionError('SESSION_NOT_FOUND', 'Session not found');
      }

      const { workspace_id: workspaceId, user_id } = result.rows[0];

      // Emit session ended event
      await this.emitRealtimeEvent(workspaceId, user_id, 'session_ended', { sessionId, reason });

      this.logger.info('Session ended successfully', { sessionId, userId, reason });
    } catch (error) {
      this.logger.error('Failed to end session', { error, sessionId, userId });
      throw error;
    }
  }

  /**
   * Update session activity
   */
  async updateSessionActivity(
    sessionToken: string,
    activeTool?: string,
    activeResource?: string
  ): Promise<void> {
    try {
      const updates: string[] = [];
      const values: any[] = [];
      let valueIndex = 1;

      updates.push(`last_activity_at = $${valueIndex++}`);
      values.push(new Date().toISOString());

      if (activeTool !== undefined) {
        updates.push(`active_tool = $${valueIndex++}`);
        values.push(activeTool);
      }

      if (activeResource !== undefined) {
        updates.push(`active_resource = $${valueIndex++}`);
        values.push(activeResource);
      }

      values.push(sessionToken);

      const query = `
        UPDATE workspace_sessions
        SET ${updates.join(', ')}
        WHERE session_token = $${valueIndex++} AND status = 'active'
        RETURNING workspace_id, user_id
      `;

      const result = await this.db.query(query, values);

      if (result.rows.length > 0) {
        const { workspace_id: workspaceId, user_id: userId } = result.rows[0];
        await this.updateMemberLastActive(workspaceId, userId);
      }
    } catch (error) {
      this.logger.error('Failed to update session activity', { error, sessionToken });
    }
  }

  /**
   * Update user presence data
   */
  async updatePresence(
    sessionToken: string,
    presenceData: Partial<WorkspaceSessionPresenceData>,
    cursorPosition?: WorkspaceSessionCursorPosition
  ): Promise<void> {
    try {
      const session = await this.getSessionByToken(sessionToken);
      if (!session) {
        throw this.createSessionError('SESSION_NOT_FOUND', 'Session not found');
      }

      const updatedPresenceData = {
        ...session.presenceData,
        ...presenceData,
        lastSeen: new Date().toISOString(),
      };

      const updates = ['presence_data = $1', 'last_activity_at = $2'];
      const values = [JSON.stringify(updatedPresenceData), new Date().toISOString()];
      
      if (cursorPosition) {
        updates.push('cursor_position = $3');
        values.push(JSON.stringify(cursorPosition));
      }

      values.push(sessionToken);

      const query = `
        UPDATE workspace_sessions
        SET ${updates.join(', ')}
        WHERE session_token = $${updates.length + 1} AND status = 'active'
      `;

      await this.db.query(query, values);

      // Emit presence update event
      const presenceUpdate: WorkspacePresenceUpdate = {
        sessionId: session.id,
        userId: session.userId,
        workspaceId: session.workspaceId,
        presenceData: updatedPresenceData,
        cursorPosition,
        timestamp: new Date().toISOString(),
      };

      await this.emitRealtimeEvent(
        session.workspaceId,
        session.userId,
        'presence_updated',
        presenceUpdate
      );

      this.logger.debug('Presence updated', { sessionToken, presenceData });
    } catch (error) {
      this.logger.error('Failed to update presence', { error, sessionToken });
      throw error;
    }
  }

  /**
   * Get active sessions for a workspace
   */
  async getActiveSessions(
    workspaceId: string,
    userId: string,
    tenantId: string
  ): Promise<WorkspaceSession[]> {
    try {
      // Validate workspace access
      await this.validateWorkspaceAccess(workspaceId, userId, tenantId);

      const query = `
        SELECT ws.*, u.name, u.avatar
        FROM workspace_sessions ws
        LEFT JOIN users u ON ws.user_id = u.id
        WHERE ws.workspace_id = $1 
          AND ws.status = 'active' 
          AND ws.last_activity_at > NOW() - INTERVAL '1 hour'
        ORDER BY ws.last_activity_at DESC
      `;

      const result = await this.db.query(query, [workspaceId]);
      
      return result.rows.map(row => {
        const session = this.mapDatabaseRowToSession(row);
        // Add user info for presence display
        (session as any).user = row.name ? {
          name: row.name,
          avatar: row.avatar,
        } : undefined;
        return session;
      });
    } catch (error) {
      this.logger.error('Failed to get active sessions', { error, workspaceId, userId });
      throw error;
    }
  }

  /**
   * Get session by token
   */
  async getSessionByToken(sessionToken: string): Promise<WorkspaceSession | null> {
    try {
      const query = `
        SELECT * FROM workspace_sessions
        WHERE session_token = $1 AND status = 'active'
      `;

      const result = await this.db.query(query, [sessionToken]);

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapDatabaseRowToSession(result.rows[0]);
    } catch (error) {
      this.logger.error('Failed to get session by token', { error, sessionToken });
      throw error;
    }
  }

  /**
   * Validate session token and get user context
   */
  async validateSessionToken(sessionToken: string): Promise<{
    isValid: boolean;
    session?: WorkspaceSession;
    userId?: string;
    workspaceId?: string;
  }> {
    try {
      const session = await this.getSessionByToken(sessionToken);
      
      if (!session) {
        return { isValid: false };
      }

      // Check if session is expired
      const lastActivity = new Date(session.lastActivityAt);
      const now = new Date();
      const timeDiff = now.getTime() - lastActivity.getTime();

      if (timeDiff > this.sessionTimeout) {
        // Mark session as expired
        await this.endSession(session.id, session.userId, 'timeout');
        return { isValid: false };
      }

      return {
        isValid: true,
        session,
        userId: session.userId,
        workspaceId: session.workspaceId,
      };
    } catch (error) {
      this.logger.error('Failed to validate session token', { error, sessionToken });
      return { isValid: false };
    }
  }

  /**
   * Get user's session history
   */
  async getUserSessionHistory(
    workspaceId: string,
    userId: string,
    requesterId: string,
    tenantId: string,
    limit: number = 20
  ): Promise<WorkspaceSession[]> {
    try {
      // Check access permissions
      if (userId !== requesterId) {
        await this.validateWorkspaceAccess(workspaceId, requesterId, tenantId);
        await this.checkPermission(workspaceId, requesterId, tenantId, 'canViewAnalytics');
      }

      const query = `
        SELECT * FROM workspace_sessions
        WHERE workspace_id = $1 AND user_id = $2
        ORDER BY started_at DESC
        LIMIT $3
      `;

      const result = await this.db.query(query, [workspaceId, userId, limit]);
      
      return result.rows.map(row => this.mapDatabaseRowToSession(row));
    } catch (error) {
      this.logger.error('Failed to get user session history', { error, workspaceId, userId });
      throw error;
    }
  }

  /**
   * Cleanup expired sessions
   */
  async cleanupExpiredSessions(): Promise<number> {
    try {
      const cutoffTime = new Date();
      cutoffTime.setTime(cutoffTime.getTime() - this.sessionTimeout);

      const query = `
        UPDATE workspace_sessions
        SET status = 'ended', ended_at = NOW()
        WHERE status = 'active' 
          AND last_activity_at < $1
        RETURNING id, workspace_id, user_id
      `;

      const result = await this.db.query(query, [cutoffTime.toISOString()]);

      // Emit session ended events for cleaned up sessions
      for (const row of result.rows) {
        await this.emitRealtimeEvent(
          row.workspace_id,
          row.user_id,
          'session_ended',
          { sessionId: row.id, reason: 'timeout' }
        );
      }

      if (result.rowCount > 0) {
        this.logger.info('Cleaned up expired sessions', { count: result.rowCount });
      }

      return result.rowCount || 0;
    } catch (error) {
      this.logger.error('Failed to cleanup expired sessions', { error });
      return 0;
    }
  }

  /**
   * Get workspace session statistics
   */
  async getSessionStatistics(
    workspaceId: string,
    userId: string,
    tenantId: string,
    days: number = 7
  ): Promise<any> {
    try {
      await this.validateWorkspaceAccess(workspaceId, userId, tenantId);
      await this.checkPermission(workspaceId, userId, tenantId, 'canViewAnalytics');

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const query = `
        SELECT 
          COUNT(*) as total_sessions,
          COUNT(DISTINCT user_id) as unique_users,
          AVG(EXTRACT(EPOCH FROM (COALESCE(ended_at, NOW()) - started_at))) as avg_duration,
          MAX(last_activity_at) as last_activity,
          COUNT(*) FILTER (WHERE status = 'active') as active_sessions,
          COUNT(*) FILTER (WHERE ended_at IS NOT NULL) as completed_sessions
        FROM workspace_sessions
        WHERE workspace_id = $1 
          AND started_at >= $2
      `;

      const result = await this.db.query(query, [workspaceId, startDate.toISOString()]);
      const stats = result.rows[0];

      return {
        workspaceId,
        period: {
          days,
          startDate: startDate.toISOString(),
          endDate: new Date().toISOString(),
        },
        metrics: {
          totalSessions: parseInt(stats.total_sessions) || 0,
          uniqueUsers: parseInt(stats.unique_users) || 0,
          averageDuration: parseFloat(stats.avg_duration) || 0,
          lastActivity: stats.last_activity?.toISOString(),
          activeSessions: parseInt(stats.active_sessions) || 0,
          completedSessions: parseInt(stats.completed_sessions) || 0,
        },
      };
    } catch (error) {
      this.logger.error('Failed to get session statistics', { error, workspaceId, userId });
      throw error;
    }
  }

  // Private helper methods

  private async validateWorkspaceAccess(
    workspaceId: string,
    userId: string,
    tenantId: string
  ): Promise<void> {
    const query = `
      SELECT wm.status, w.visibility
      FROM collaborative_workspaces w
      LEFT JOIN workspace_members wm ON w.id = wm.workspace_id AND wm.user_id = $2
      WHERE w.id = $1 AND w.tenant_id = $3 AND w.deleted_at IS NULL
    `;

    const result = await this.db.query(query, [workspaceId, userId, tenantId]);

    if (result.rows.length === 0) {
      throw this.createSessionError('WORKSPACE_NOT_FOUND', 'Workspace not found');
    }

    const row = result.rows[0];
    
    if (row.visibility === 'public' || row.status === 'active') {
      return;
    }

    throw this.createSessionError('SESSION_ACCESS_DENIED', 'Access denied to workspace');
  }

  private async checkPermission(
    workspaceId: string,
    userId: string,
    tenantId: string,
    permission: string
  ): Promise<void> {
    const query = `
      SELECT wm.role, wm.permissions, w.owner_id
      FROM workspace_members wm
      JOIN collaborative_workspaces w ON wm.workspace_id = w.id
      WHERE wm.workspace_id = $1 AND wm.user_id = $2 AND w.tenant_id = $3 AND wm.status = 'active'
    `;

    const result = await this.db.query(query, [workspaceId, userId, tenantId]);

    if (result.rows.length === 0) {
      throw this.createSessionError('SESSION_ACCESS_DENIED', 'Access denied to workspace');
    }

    const row = result.rows[0];
    
    // Owners and admins have analytics permissions
    if (row.owner_id === userId || row.role === 'admin') {
      return;
    }

    const permissions = row.permissions || {};
    if (permissions[permission] === true) {
      return;
    }

    throw this.createSessionError('SESSION_ACCESS_DENIED', `Permission denied: ${permission}`);
  }

  private async endUserSessions(workspaceId: string, userId: string): Promise<void> {
    const query = `
      UPDATE workspace_sessions
      SET status = 'ended', ended_at = NOW()
      WHERE workspace_id = $1 AND user_id = $2 AND status IN ('active', 'inactive')
    `;

    await this.db.query(query, [workspaceId, userId]);
  }

  private async updateMemberLastActive(workspaceId: string, userId: string): Promise<void> {
    const query = `
      UPDATE workspace_members
      SET last_active_at = NOW()
      WHERE workspace_id = $1 AND user_id = $2
    `;

    await this.db.query(query, [workspaceId, userId]);
  }

  private async emitRealtimeEvent(
    workspaceId: string,
    userId: string,
    type: string,
    data: any
  ): Promise<void> {
    try {
      // TODO: Integrate with WebSocket service for real-time events
      const event: WorkspaceRealtimeEvent = {
        type: type as any,
        workspaceId,
        userId,
        data,
        timestamp: new Date().toISOString(),
      };

      this.logger.debug('Emitting realtime event', { event });
    } catch (error) {
      this.logger.error('Failed to emit realtime event', { error, type, workspaceId, userId });
    }
  }

  private generateSessionToken(): string {
    return randomUUID() + '-' + Date.now().toString(36);
  }

  private startSessionCleanup(): void {
    // Run cleanup every 15 minutes
    this.cleanupIntervalHandle = setInterval(() => {
      this.cleanupExpiredSessions().catch(error => {
        this.logger.error('Session cleanup failed', { error });
      });
    }, 15 * 60 * 1000);
  }

  private mapDatabaseRowToSession(row: any): WorkspaceSession {
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      userId: row.user_id,
      sessionToken: row.session_token,
      connectionId: row.connection_id,
      clientInfo: row.client_info || {},
      presenceData: row.presence_data || {
        isOnline: false,
        isActive: false,
        lastSeen: new Date().toISOString(),
      },
      cursorPosition: row.cursor_position,
      activeTool: row.active_tool,
      activeResource: row.active_resource,
      startedAt: row.started_at.toISOString(),
      lastActivityAt: row.last_activity_at.toISOString(),
      endedAt: row.ended_at?.toISOString(),
      status: row.status,
    };
  }

  private createSessionError(code: string, message: string, details?: any): WorkspaceError {
    const error = new Error(message) as any;
    error.code = code;
    error.details = details;
    return error;
  }
}