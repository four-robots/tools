/**
 * Whiteboard Collaboration Service
 * 
 * Handles collaborative whiteboard operations, session management, and real-time synchronization.
 */

import { z } from 'zod';
import { Logger } from '../../utils/logger.js';
import { DatabaseClient } from '../../database/client.js';
import { WhiteboardPermissionService } from './whiteboard-permission-service.js';
import { WhiteboardPermissions } from '@shared/types/whiteboard.js';

// Validation schemas
const WhiteboardSessionSchema = z.object({
  id: z.string().uuid(),
  whiteboardId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  userId: z.string().uuid(),
  socketId: z.string(),
  sessionToken: z.string(),
  status: z.enum(['active', 'inactive', 'disconnected']),
  startedAt: z.date(),
  endedAt: z.date().nullable(),
  lastActivity: z.date(),
  presence: z.object({
    cursor: z.object({ x: z.number(), y: z.number() }),
    viewport: z.object({
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number(),
      zoom: z.number(),
    }),
    selection: z.array(z.string()),
    color: z.string(),
  }).nullable(),
});

const WhiteboardCommentSchema = z.object({
  id: z.string().uuid(),
  whiteboardId: z.string().uuid(),
  elementId: z.string().nullable(),
  position: z.object({ x: z.number(), y: z.number() }),
  content: z.string().min(1),
  authorId: z.string().uuid(),
  parentCommentId: z.string().uuid().nullable(),
  resolved: z.boolean().default(false),
  resolvedBy: z.string().uuid().nullable(),
  resolvedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

const WhiteboardOperationSchema = z.object({
  id: z.string().uuid(),
  whiteboardId: z.string().uuid(),
  userId: z.string().uuid(),
  sessionId: z.string().uuid(),
  operationType: z.enum(['create', 'update', 'delete', 'move', 'style', 'reorder']),
  elementId: z.string(),
  elementType: z.string().nullable(),
  operationData: z.record(z.any()),
  version: z.number(),
  timestamp: z.date(),
});

type WhiteboardSession = z.infer<typeof WhiteboardSessionSchema>;
type WhiteboardComment = z.infer<typeof WhiteboardCommentSchema>;
type WhiteboardOperation = z.infer<typeof WhiteboardOperationSchema>;

interface CreateSessionOptions {
  whiteboardId: string;
  workspaceId: string;
  userId: string;
  socketId: string;
  clientInfo?: any;
}

interface UpdatePresenceOptions {
  sessionToken: string;
  presenceData: any;
  cursorPosition?: any;
}

interface LogOperationOptions {
  whiteboardId: string;
  userId: string;
  sessionId: string;
  operationType: string;
  elementId: string;
  elementType?: string;
  operationData: any;
  version: number;
}

export class WhiteboardCollaborationService {
  private logger: Logger;
  private db: DatabaseClient;
  private permissionService: WhiteboardPermissionService;

  constructor(db: DatabaseClient) {
    this.logger = new Logger('WhiteboardCollaborationService');
    this.db = db;
    this.permissionService = new WhiteboardPermissionService(db, this.logger);
  }

  // ==================== SESSION MANAGEMENT ====================

  /**
   * Start a new collaborative session
   */
  async startSession(options: CreateSessionOptions): Promise<WhiteboardSession> {
    this.logger.info('Starting whiteboard session', { 
      whiteboardId: options.whiteboardId,
      userId: options.userId 
    });

    // Check user permissions for the whiteboard
    const permissions = await this.permissionService.getUserPermissions(
      options.whiteboardId,
      options.userId
    );

    if (!permissions) {
      throw new Error('ACCESS_DENIED: User does not have access to this whiteboard');
    }

    const sessionToken = `wb_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const sessionId = crypto.randomUUID();

    const session = {
      id: sessionId,
      whiteboardId: options.whiteboardId,
      workspaceId: options.workspaceId,
      userId: options.userId,
      socketId: options.socketId,
      sessionToken,
      status: 'active' as const,
      startedAt: new Date(),
      endedAt: null,
      lastActivity: new Date(),
      presence: {
        cursor: { x: 0, y: 0 },
        viewport: { x: 0, y: 0, width: 1920, height: 1080, zoom: 1 },
        selection: [],
        color: this.generateUserColor(options.userId),
        permissions, // Include permissions in presence for clients
      },
    };

    // Insert session into database
    await this.db.execute(`
      INSERT INTO whiteboard_sessions (
        id, whiteboard_id, workspace_id, user_id, socket_id, session_token,
        status, started_at, last_activity, presence_data
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
      )
    `, [
      session.id,
      session.whiteboardId,
      session.workspaceId,
      session.userId,
      session.socketId,
      session.sessionToken,
      session.status,
      session.startedAt,
      session.lastActivity,
      JSON.stringify(session.presence),
    ]);

    this.logger.info('Whiteboard session started', { sessionId, sessionToken });
    return WhiteboardSessionSchema.parse(session);
  }

  /**
   * End a collaborative session
   */
  async endSession(sessionId: string, userId: string, reason?: string): Promise<void> {
    this.logger.info('Ending whiteboard session', { sessionId, userId, reason });

    const endedAt = new Date();

    await this.db.execute(`
      UPDATE whiteboard_sessions 
      SET 
        status = 'inactive',
        ended_at = $1,
        disconnect_reason = $2
      WHERE id = $3 AND user_id = $4
    `, [endedAt, reason || 'manual', sessionId, userId]);

    this.logger.info('Whiteboard session ended', { sessionId });
  }

  /**
   * Update presence data for a session
   */
  async updatePresence(options: UpdatePresenceOptions): Promise<void> {
    const { sessionToken, presenceData, cursorPosition } = options;

    const session = await this.getSessionByToken(sessionToken);
    if (!session) {
      throw new Error('Session not found');
    }

    // Merge presence data
    const updatedPresence = {
      ...session.presence,
      ...presenceData,
    };

    if (cursorPosition) {
      updatedPresence.cursor = cursorPosition;
    }

    await this.db.execute(`
      UPDATE whiteboard_sessions 
      SET 
        presence_data = $1,
        last_activity = $2
      WHERE session_token = $3
    `, [JSON.stringify(updatedPresence), new Date(), sessionToken]);
  }

  /**
   * Get active sessions for a whiteboard
   */
  async getActiveSessions(whiteboardId: string): Promise<WhiteboardSession[]> {
    const rows = await this.db.query(`
      SELECT 
        ws.*,
        u.name as user_name,
        u.email as user_email
      FROM whiteboard_sessions ws
      JOIN users u ON ws.user_id = u.id
      WHERE ws.whiteboard_id = $1 AND ws.status = 'active'
      ORDER BY ws.started_at DESC
    `, [whiteboardId]);

    return rows.map(row => WhiteboardSessionSchema.parse({
      id: row.id,
      whiteboardId: row.whiteboard_id,
      workspaceId: row.workspace_id,
      userId: row.user_id,
      socketId: row.socket_id,
      sessionToken: row.session_token,
      status: row.status,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      lastActivity: row.last_activity,
      presence: row.presence_data ? JSON.parse(row.presence_data) : null,
    }));
  }

  /**
   * Get session by token
   */
  async getSessionByToken(sessionToken: string): Promise<WhiteboardSession | null> {
    const rows = await this.db.query(`
      SELECT * FROM whiteboard_sessions 
      WHERE session_token = $1 AND status = 'active'
    `, [sessionToken]);

    if (rows.length === 0) {
      return null;
    }

    const row = rows[0];
    return WhiteboardSessionSchema.parse({
      id: row.id,
      whiteboardId: row.whiteboard_id,
      workspaceId: row.workspace_id,
      userId: row.user_id,
      socketId: row.socket_id,
      sessionToken: row.session_token,
      status: row.status,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      lastActivity: row.last_activity,
      presence: row.presence_data ? JSON.parse(row.presence_data) : null,
    });
  }

  // ==================== OPERATION LOGGING ====================

  /**
   * Log a whiteboard operation for audit and sync purposes
   */
  async logOperation(options: LogOperationOptions): Promise<void> {
    const operationId = crypto.randomUUID();
    
    await this.db.execute(`
      INSERT INTO whiteboard_operations (
        id, whiteboard_id, user_id, session_id, operation_type,
        element_id, element_type, operation_data, version, timestamp
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
      )
    `, [
      operationId,
      options.whiteboardId,
      options.userId,
      options.sessionId,
      options.operationType,
      options.elementId,
      options.elementType,
      JSON.stringify(options.operationData),
      options.version,
      new Date(),
    ]);

    this.logger.debug('Whiteboard operation logged', {
      operationId,
      whiteboardId: options.whiteboardId,
      operationType: options.operationType,
      version: options.version,
    });
  }

  /**
   * Get operations since a specific version
   */
  async getOperationsSinceVersion(whiteboardId: string, version: number): Promise<WhiteboardOperation[]> {
    const rows = await this.db.query(`
      SELECT * FROM whiteboard_operations
      WHERE whiteboard_id = $1 AND version > $2
      ORDER BY version ASC, timestamp ASC
    `, [whiteboardId, version]);

    return rows.map(row => WhiteboardOperationSchema.parse({
      id: row.id,
      whiteboardId: row.whiteboard_id,
      userId: row.user_id,
      sessionId: row.session_id,
      operationType: row.operation_type,
      elementId: row.element_id,
      elementType: row.element_type,
      operationData: JSON.parse(row.operation_data),
      version: row.version,
      timestamp: row.timestamp,
    }));
  }

  /**
   * Get current version for a whiteboard
   */
  async getCurrentVersion(whiteboardId: string): Promise<number> {
    const rows = await this.db.query(`
      SELECT MAX(version) as max_version 
      FROM whiteboard_operations 
      WHERE whiteboard_id = $1
    `, [whiteboardId]);

    return rows[0]?.max_version || 0;
  }

  // ==================== COMMENTS MANAGEMENT ====================

  /**
   * Add a comment to a whiteboard
   */
  async addComment(
    whiteboardId: string,
    authorId: string,
    content: string,
    position: { x: number; y: number },
    elementId?: string,
    parentCommentId?: string
  ): Promise<WhiteboardComment> {
    // Check user permissions for commenting
    const permissions = await this.permissionService.getUserPermissions(whiteboardId, authorId);
    
    if (!permissions || !permissions.canComment) {
      throw new Error('ACCESS_DENIED: User does not have permission to comment on this whiteboard');
    }
    const commentId = crypto.randomUUID();
    const now = new Date();

    const comment = {
      id: commentId,
      whiteboardId,
      elementId: elementId || null,
      position,
      content,
      authorId,
      parentCommentId: parentCommentId || null,
      resolved: false,
      resolvedBy: null,
      resolvedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    await this.db.execute(`
      INSERT INTO whiteboard_comments (
        id, whiteboard_id, element_id, position, content, author_id,
        parent_comment_id, resolved, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
      )
    `, [
      comment.id,
      comment.whiteboardId,
      comment.elementId,
      JSON.stringify(comment.position),
      comment.content,
      comment.authorId,
      comment.parentCommentId,
      comment.resolved,
      comment.createdAt,
      comment.updatedAt,
    ]);

    this.logger.info('Whiteboard comment added', { commentId, whiteboardId });
    return WhiteboardCommentSchema.parse(comment);
  }

  /**
   * Get comments for a whiteboard
   */
  async getComments(whiteboardId: string, includeResolved: boolean = false, userId?: string): Promise<WhiteboardComment[]> {
    // Check user permissions if userId is provided
    if (userId) {
      const permissions = await this.permissionService.getUserPermissions(whiteboardId, userId);
      if (!permissions) {
        throw new Error('ACCESS_DENIED: User does not have access to this whiteboard');
      }
    }
    const resolvedFilter = includeResolved ? '' : 'AND resolved = false';
    
    const rows = await this.db.query(`
      SELECT 
        wc.*,
        u.name as author_name,
        u.email as author_email
      FROM whiteboard_comments wc
      JOIN users u ON wc.author_id = u.id
      WHERE wc.whiteboard_id = $1 ${resolvedFilter}
      ORDER BY wc.created_at ASC
    `, [whiteboardId]);

    return rows.map(row => WhiteboardCommentSchema.parse({
      id: row.id,
      whiteboardId: row.whiteboard_id,
      elementId: row.element_id,
      position: JSON.parse(row.position),
      content: row.content,
      authorId: row.author_id,
      parentCommentId: row.parent_comment_id,
      resolved: row.resolved,
      resolvedBy: row.resolved_by,
      resolvedAt: row.resolved_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  /**
   * Resolve or unresolve a comment
   */
  async resolveComment(commentId: string, resolved: boolean, resolvedBy?: string): Promise<void> {
    if (resolvedBy) {
      // Get the comment to check whiteboard access
      const commentRows = await this.db.query(`
        SELECT whiteboard_id FROM whiteboard_comments WHERE id = $1
      `, [commentId]);

      if (commentRows.length === 0) {
        throw new Error('Comment not found');
      }

      const whiteboardId = commentRows[0].whiteboard_id;
      const permissions = await this.permissionService.getUserPermissions(whiteboardId, resolvedBy);
      
      if (!permissions || (!permissions.canComment && !permissions.canManagePermissions)) {
        throw new Error('ACCESS_DENIED: User does not have permission to resolve comments');
      }
    }
    const resolvedAt = resolved ? new Date() : null;
    const resolvedByValue = resolved ? resolvedBy : null;

    await this.db.execute(`
      UPDATE whiteboard_comments 
      SET 
        resolved = $1,
        resolved_by = $2,
        resolved_at = $3,
        updated_at = $4
      WHERE id = $5
    `, [resolved, resolvedByValue, resolvedAt, new Date(), commentId]);

    this.logger.info('Comment resolution updated', { commentId, resolved });
  }

  /**
   * Delete a comment
   */
  async deleteComment(commentId: string, userId: string): Promise<void> {
    // Get comment details to check permissions
    const rows = await this.db.query(`
      SELECT author_id, whiteboard_id FROM whiteboard_comments WHERE id = $1
    `, [commentId]);

    if (rows.length === 0) {
      throw new Error('Comment not found');
    }

    const authorId = rows[0].author_id;
    const whiteboardId = rows[0].whiteboard_id;
    
    // Check if user is the author or has management permissions
    const isAuthor = authorId === userId;
    
    if (!isAuthor) {
      const permissions = await this.permissionService.getUserPermissions(whiteboardId, userId);
      if (!permissions || !permissions.canManagePermissions) {
        throw new Error('Unauthorized to delete this comment');
      }
    }

    await this.db.execute(`
      DELETE FROM whiteboard_comments WHERE id = $1
    `, [commentId]);

    this.logger.info('Comment deleted', { commentId, userId });
  }

  // ==================== UTILITY METHODS ====================

  /**
   * Get user permissions for a whiteboard (public method for use by other services)
   */
  async getUserPermissions(whiteboardId: string, userId: string): Promise<WhiteboardPermissions | null> {
    return this.permissionService.getUserPermissions(whiteboardId, userId);
  }

  /**
   * Check if user can perform a specific action on a whiteboard
   */
  async canUserPerformAction(
    whiteboardId: string, 
    userId: string, 
    action: 'edit' | 'comment' | 'delete' | 'share' | 'manage'
  ): Promise<boolean> {
    const permissions = await this.permissionService.getUserPermissions(whiteboardId, userId);
    if (!permissions) return false;

    switch (action) {
      case 'edit':
        return permissions.canEdit;
      case 'comment':
        return permissions.canComment;
      case 'delete':
        return permissions.canDelete;
      case 'share':
        return permissions.canShare;
      case 'manage':
        return permissions.canManagePermissions;
      default:
        return false;
    }
  }

  /**
   * Generate a consistent color for a user
   */
  private generateUserColor(userId: string): string {
    const colors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
      '#DDA0DD', '#FFB347', '#87CEEB', '#98FB98', '#F0E68C',
    ];
    
    // Simple hash function to get consistent color
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      const char = userId.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    return colors[Math.abs(hash) % colors.length];
  }

  /**
   * Clean up inactive sessions
   */
  async cleanupInactiveSessions(inactiveThresholdMs: number = 30 * 60 * 1000): Promise<number> {
    const cutoffTime = new Date(Date.now() - inactiveThresholdMs);
    
    const result = await this.db.execute(`
      UPDATE whiteboard_sessions 
      SET 
        status = 'disconnected',
        ended_at = CURRENT_TIMESTAMP
      WHERE 
        status = 'active' 
        AND last_activity < $1
    `, [cutoffTime]);

    const cleanedCount = result.rowCount || 0;
    
    if (cleanedCount > 0) {
      this.logger.info('Cleaned up inactive whiteboard sessions', { 
        count: cleanedCount,
        cutoffTime 
      });
    }
    
    return cleanedCount;
  }

  /**
   * Get collaboration analytics for a whiteboard
   */
  async getCollaborationAnalytics(whiteboardId: string, days: number = 30): Promise<{
    totalSessions: number;
    uniqueUsers: number;
    totalOperations: number;
    totalComments: number;
    activeTimeMs: number;
  }> {
    const sinceDate = new Date(Date.now() - (days * 24 * 60 * 60 * 1000));

    const [sessionsResult, operationsResult, commentsResult] = await Promise.all([
      this.db.query(`
        SELECT 
          COUNT(*) as total_sessions,
          COUNT(DISTINCT user_id) as unique_users,
          SUM(
            CASE WHEN ended_at IS NOT NULL 
            THEN EXTRACT(epoch FROM (ended_at - started_at)) * 1000
            ELSE EXTRACT(epoch FROM (CURRENT_TIMESTAMP - started_at)) * 1000
            END
          ) as active_time_ms
        FROM whiteboard_sessions 
        WHERE whiteboard_id = $1 AND started_at >= $2
      `, [whiteboardId, sinceDate]),

      this.db.query(`
        SELECT COUNT(*) as total_operations
        FROM whiteboard_operations 
        WHERE whiteboard_id = $1 AND timestamp >= $2
      `, [whiteboardId, sinceDate]),

      this.db.query(`
        SELECT COUNT(*) as total_comments
        FROM whiteboard_comments 
        WHERE whiteboard_id = $1 AND created_at >= $2
      `, [whiteboardId, sinceDate]),
    ]);

    return {
      totalSessions: parseInt(sessionsResult[0]?.total_sessions || '0'),
      uniqueUsers: parseInt(sessionsResult[0]?.unique_users || '0'),
      totalOperations: parseInt(operationsResult[0]?.total_operations || '0'),
      totalComments: parseInt(commentsResult[0]?.total_comments || '0'),
      activeTimeMs: parseInt(sessionsResult[0]?.active_time_ms || '0'),
    };
  }
}