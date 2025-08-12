/**
 * Whiteboard Comment Service
 * 
 * Comprehensive service for managing threaded comments with @mentions,
 * rich text support, resolution workflow, and audit trail functionality.
 * 
 * Features:
 * - Full CRUD operations for comments and threads
 * - Threading with parent-child relationships
 * - @mention parsing and user resolution
 * - Rich text validation and sanitization
 * - Comment resolution workflow
 * - Edit history and audit trail
 * - Permission-based access control
 * - Real-time notification preparation
 * - Performance optimizations for large threads
 */

import { DatabasePool } from '../../utils/database-pool.js';
import { Logger } from '../../utils/logger.js';
import { MentionParser } from '../../utils/mention-parser.js';
import { RichTextValidator } from '../../utils/rich-text-validator.js';
import { sanitizeInput } from '../../utils/sql-security.js';
import { randomUUID } from 'crypto';
import {
  WhiteboardComment,
  WhiteboardCommentWithReplies,
  CommentMention,
  CommentNotification,
  CommentRevision,
  CommentActivity,
  CommentStatus,
  CommentContentType,
  RichTextFormat,
  CreateCommentRequest,
  UpdateCommentRequest,
  ResolveCommentRequest,
  PaginatedComments,
} from '@shared/types/whiteboard.js';

export interface CommentServiceOptions {
  maxThreadDepth?: number;
  maxCommentsPerPage?: number;
  enableMentions?: boolean;
  enableRichText?: boolean;
  enableEditHistory?: boolean;
}

export interface CommentCreateResult {
  comment: WhiteboardComment;
  mentions: CommentMention[];
  notifications: CommentNotification[];
  errors: string[];
  warnings: string[];
}

export interface CommentUpdateResult {
  comment: WhiteboardComment;
  revision: CommentRevision;
  mentions: CommentMention[];
  notifications: CommentNotification[];
  errors: string[];
  warnings: string[];
}

export interface CommentThreadResult {
  rootComment: WhiteboardComment;
  replies: WhiteboardCommentWithReplies[];
  totalReplies: number;
  participantCount: number;
  lastActivity: string;
}

export interface CommentSearchFilters {
  status?: CommentStatus[];
  elementId?: string;
  createdBy?: string;
  hasReplies?: boolean;
  isResolved?: boolean;
  mentionsUser?: string;
  createdAfter?: string;
  createdBefore?: string;
  tags?: string[];
  search?: string;
}

/**
 * WhiteboardCommentService - Comprehensive comment management
 */
export class WhiteboardCommentService {
  private logger: Logger;
  private mentionParser: MentionParser;
  private richTextValidator: RichTextValidator;
  private options: Required<CommentServiceOptions>;

  constructor(
    private db: DatabasePool,
    options: CommentServiceOptions = {},
    logger?: Logger
  ) {
    this.logger = logger || new Logger('WhiteboardCommentService');
    this.mentionParser = new MentionParser(db, logger);
    this.richTextValidator = new RichTextValidator(logger);
    
    this.options = {
      maxThreadDepth: 5,
      maxCommentsPerPage: 50,
      enableMentions: true,
      enableRichText: true,
      enableEditHistory: true,
      ...options,
    };
  }

  /**
   * Create a new comment with threading and @mention support
   */
  async createComment(
    whiteboardId: string,
    userId: string,
    request: CreateCommentRequest
  ): Promise<CommentCreateResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    try {
      // Validate whiteboard access
      await this.validateWhiteboardAccess(whiteboardId, userId);

      // Validate and sanitize content
      const contentType = request.contentType || 'text';
      const validationResult = this.richTextValidator.validateRichText(
        request.content,
        contentType,
        request.richTextFormat,
        {
          preserveMentions: this.options.enableMentions,
          allowLinks: true,
          allowFormatting: this.options.enableRichText,
        }
      );

      if (!validationResult.isValid) {
        return {
          comment: {} as WhiteboardComment,
          mentions: [],
          notifications: [],
          errors: validationResult.errors,
          warnings: validationResult.warnings,
        };
      }

      warnings.push(...validationResult.warnings);

      // Validate threading if parent comment specified
      let threadId = randomUUID();
      let depth = 0;
      
      if (request.parentId) {
        const parentResult = await this.validateThreading(request.parentId, whiteboardId);
        if (!parentResult.valid) {
          errors.push(parentResult.error!);
          return {
            comment: {} as WhiteboardComment,
            mentions: [],
            notifications: [],
            errors,
            warnings,
          };
        }
        threadId = parentResult.threadId!;
        depth = parentResult.depth! + 1;

        if (depth > this.options.maxThreadDepth) {
          errors.push(`Maximum thread depth of ${this.options.maxThreadDepth} exceeded`);
          return {
            comment: {} as WhiteboardComment,
            mentions: [],
            notifications: [],
            errors,
            warnings,
          };
        }
      }

      // Parse and resolve @mentions
      let mentions: CommentMention[] = [];
      let notifications: CommentNotification[] = [];

      if (this.options.enableMentions) {
        const workspaceResult = await this.getWorkspaceIdForWhiteboard(whiteboardId);
        if (workspaceResult) {
          const mentionResult = await this.mentionParser.parseAndResolveMentions(
            validationResult.sanitizedContent,
            workspaceResult,
            { excludeUserIds: [userId] }
          );
          
          mentions = this.mentionParser.createCommentMentions(mentionResult.resolvedMentions);
          warnings.push(...mentionResult.warnings);
          
          if (mentionResult.errors.length > 0) {
            this.logger.warn('Mention parsing had errors', {
              whiteboardId,
              errors: mentionResult.errors
            });
          }
        }
      }

      // Create comment record
      const commentId = randomUUID();
      const now = new Date().toISOString();
      
      const comment: WhiteboardComment = {
        id: commentId,
        whiteboardId,
        elementId: request.elementId,
        parentId: request.parentId,
        threadId,
        content: validationResult.sanitizedContent,
        contentType,
        richTextFormat: validationResult.sanitizedFormat,
        position: request.position,
        anchorPoint: request.anchorPoint,
        status: 'open',
        priority: request.priority || 'medium',
        resolved: false,
        resolvedBy: undefined,
        resolvedAt: undefined,
        resolvedReason: undefined,
        mentions,
        mentionNotificationsSent: false,
        attachments: request.attachments || [],
        threadMetadata: request.parentId ? undefined : {
          replyCount: 0,
          participantCount: 1,
          participants: [{
            userId,
            userName: await this.getUserName(userId),
            lastActivity: now,
          }],
          lastReplyAt: undefined,
          isSubscribed: true,
        },
        depth,
        revisionCount: 0,
        lastEditedBy: undefined,
        lastEditedAt: undefined,
        isPrivate: request.isPrivate || false,
        allowedViewers: request.allowedViewers || [],
        reactions: [],
        tags: request.tags || [],
        metadata: request.metadata || {},
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
        deletedAt: undefined,
      };

      // Insert comment into database
      await this.insertCommentToDatabase(comment);

      // Insert mentions if any
      if (mentions.length > 0) {
        await this.insertMentionsToDatabase(commentId, mentions);
      }

      // Update thread metadata for parent comment
      if (request.parentId) {
        await this.updateThreadMetadata(threadId, userId);
      }

      // Prepare notifications
      if (mentions.length > 0) {
        const whiteboardName = await this.getWhiteboardName(whiteboardId);
        const userInfo = await this.getUserInfo(userId);
        
        notifications = await this.createMentionNotifications(
          mentions,
          commentId,
          whiteboardId,
          whiteboardName,
          validationResult.sanitizedContent,
          userId,
          userInfo.name
        );
      }

      this.logger.info('Comment created successfully', {
        commentId,
        whiteboardId,
        userId,
        hasParent: !!request.parentId,
        mentionCount: mentions.length,
        threadId,
        depth
      });

      return {
        comment,
        mentions,
        notifications,
        errors,
        warnings,
      };

    } catch (error) {
      this.logger.error('Failed to create comment', { error, whiteboardId, userId });
      return {
        comment: {} as WhiteboardComment,
        mentions: [],
        notifications: [],
        errors: [`Failed to create comment: ${error instanceof Error ? error.message : String(error)}`],
        warnings,
      };
    }
  }

  /**
   * Update an existing comment with revision tracking
   */
  async updateComment(
    commentId: string,
    userId: string,
    request: UpdateCommentRequest
  ): Promise<CommentUpdateResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Get existing comment and validate permissions
      const existingComment = await this.getCommentById(commentId);
      if (!existingComment) {
        return {
          comment: {} as WhiteboardComment,
          revision: {} as CommentRevision,
          mentions: [],
          notifications: [],
          errors: ['Comment not found'],
          warnings: [],
        };
      }

      // Check edit permissions
      const hasPermission = await this.checkCommentEditPermission(commentId, userId);
      if (!hasPermission) {
        return {
          comment: {} as WhiteboardComment,
          revision: {} as CommentRevision,
          mentions: [],
          notifications: [],
          errors: ['Permission denied to edit comment'],
          warnings: [],
        };
      }

      // Create revision record if content is changing
      let revision: CommentRevision | undefined;
      if (this.options.enableEditHistory && request.content) {
        revision = {
          id: randomUUID(),
          commentId,
          content: existingComment.content,
          contentType: existingComment.contentType,
          richTextFormat: existingComment.richTextFormat,
          mentions: existingComment.mentions,
          editedBy: userId,
          editReason: request.editReason,
          createdAt: new Date().toISOString(),
        };
        
        await this.insertRevisionToDatabase(revision);
      }

      // Validate and sanitize new content if provided
      let validationResult: any = null;
      let mentions: CommentMention[] = existingComment.mentions;
      let notifications: CommentNotification[] = [];

      if (request.content) {
        const contentType = request.contentType || existingComment.contentType;
        validationResult = this.richTextValidator.validateRichText(
          request.content,
          contentType,
          request.richTextFormat || existingComment.richTextFormat,
          {
            preserveMentions: this.options.enableMentions,
            allowLinks: true,
            allowFormatting: this.options.enableRichText,
          }
        );

        if (!validationResult.isValid) {
          return {
            comment: existingComment,
            revision: revision!,
            mentions: [],
            notifications: [],
            errors: validationResult.errors,
            warnings: validationResult.warnings,
          };
        }

        warnings.push(...validationResult.warnings);

        // Re-parse mentions if content changed
        if (this.options.enableMentions && validationResult.sanitizedContent !== existingComment.content) {
          const workspaceId = await this.getWorkspaceIdForWhiteboard(existingComment.whiteboardId);
          if (workspaceId) {
            const mentionResult = await this.mentionParser.parseAndResolveMentions(
              validationResult.sanitizedContent,
              workspaceId,
              { excludeUserIds: [userId] }
            );
            
            mentions = this.mentionParser.createCommentMentions(mentionResult.resolvedMentions);
            warnings.push(...mentionResult.warnings);

            // Create notifications for new mentions
            const newMentions = mentions.filter(mention => 
              !existingComment.mentions.some(existing => existing.userId === mention.userId)
            );
            
            if (newMentions.length > 0) {
              const whiteboardName = await this.getWhiteboardName(existingComment.whiteboardId);
              const userInfo = await this.getUserInfo(userId);
              
              notifications = await this.createMentionNotifications(
                newMentions,
                commentId,
                existingComment.whiteboardId,
                whiteboardName,
                validationResult.sanitizedContent,
                userId,
                userInfo.name
              );
            }
          }
        }
      }

      // Build update query using SafeWhereBuilder for security
      const { SafeWhereBuilder } = await import('../../utils/sql-security.js');
      const updateBuilder = new SafeWhereBuilder(1);
      
      const updates: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (validationResult) {
        updates.push(`content = $${paramIndex++}`);
        values.push(validationResult.sanitizedContent);
        
        if (request.contentType) {
          updates.push(`content_type = $${paramIndex++}`);
          values.push(sanitizeInput(request.contentType));
        }
        
        if (validationResult.sanitizedFormat) {
          updates.push(`rich_text_format = $${paramIndex++}`);
          values.push(JSON.stringify(validationResult.sanitizedFormat));
        }
      }

      if (request.status !== undefined) {
        updates.push(`status = $${paramIndex++}`);
        values.push(sanitizeInput(request.status));
      }

      if (request.priority !== undefined) {
        updates.push(`priority = $${paramIndex++}`);
        values.push(sanitizeInput(request.priority));
      }

      if (request.position !== undefined) {
        updates.push(`position = $${paramIndex++}`);
        values.push(JSON.stringify(request.position));
      }

      if (request.anchorPoint !== undefined) {
        updates.push(`anchor_point = $${paramIndex++}`);
        values.push(JSON.stringify(request.anchorPoint));
      }

      if (request.isPrivate !== undefined) {
        updates.push(`is_private = $${paramIndex++}`);
        values.push(request.isPrivate);
      }

      if (request.allowedViewers !== undefined) {
        updates.push(`allowed_viewers = $${paramIndex++}`);
        values.push(request.allowedViewers);
      }

      if (request.tags !== undefined) {
        updates.push(`tags = $${paramIndex++}`);
        values.push(request.tags);
      }

      if (request.metadata !== undefined) {
        updates.push(`metadata = $${paramIndex++}`);
        values.push(JSON.stringify(request.metadata));
      }

      // Always update revision tracking
      updates.push(`last_edited_by = $${paramIndex++}`);
      values.push(userId);
      
      updates.push(`last_edited_at = $${paramIndex++}`);
      values.push(new Date().toISOString());
      
      updates.push(`updated_at = $${paramIndex++}`);
      values.push(new Date().toISOString());
      
      updates.push(`revision_count = revision_count + 1`);

      values.push(commentId);

      // Execute update with parameterized query
      const query = `
        UPDATE whiteboard_comments 
        SET ${updates.join(', ')}
        WHERE id = $${paramIndex} AND deleted_at IS NULL
        RETURNING *
      `;

      const result = await this.db.query(query, values);
      
      if (result.rows.length === 0) {
        return {
          comment: existingComment,
          revision: revision!,
          mentions: [],
          notifications: [],
          errors: ['Failed to update comment'],
          warnings,
        };
      }

      // Update mentions if they changed
      if (mentions !== existingComment.mentions) {
        await this.updateCommentMentions(commentId, mentions);
      }

      const updatedComment = this.mapDatabaseRowToComment(result.rows[0]);

      this.logger.info('Comment updated successfully', {
        commentId,
        userId,
        hasContentChange: !!request.content,
        newMentionCount: mentions.length,
        revisionCreated: !!revision
      });

      return {
        comment: updatedComment,
        revision: revision || {} as CommentRevision,
        mentions,
        notifications,
        errors,
        warnings,
      };

    } catch (error) {
      this.logger.error('Failed to update comment', { error, commentId, userId });
      return {
        comment: {} as WhiteboardComment,
        revision: {} as CommentRevision,
        mentions: [],
        notifications: [],
        errors: [`Failed to update comment: ${error instanceof Error ? error.message : String(error)}`],
        warnings,
      };
    }
  }

  /**
   * Resolve or unresolve a comment
   */
  async resolveComment(
    commentId: string,
    userId: string,
    request: ResolveCommentRequest
  ): Promise<{ success: boolean; comment?: WhiteboardComment; error?: string }> {
    try {
      // Check permissions
      const hasPermission = await this.checkCommentResolvePermission(commentId, userId);
      if (!hasPermission) {
        return { success: false, error: 'Permission denied to resolve comment' };
      }

      const now = new Date().toISOString();
      const status = request.status || (request.resolved ? 'resolved' : 'open');

      const query = `
        UPDATE whiteboard_comments 
        SET 
          resolved = $1,
          resolved_by = $2,
          resolved_at = $3,
          resolved_reason = $4,
          status = $5,
          updated_at = $6
        WHERE id = $7 AND deleted_at IS NULL
        RETURNING *
      `;

      const result = await this.db.query(query, [
        request.resolved,
        request.resolved ? userId : null,
        request.resolved ? now : null,
        request.reason,
        status,
        now,
        commentId,
      ]);

      if (result.rows.length === 0) {
        return { success: false, error: 'Comment not found' };
      }

      const comment = this.mapDatabaseRowToComment(result.rows[0]);

      this.logger.info('Comment resolution updated', {
        commentId,
        userId,
        resolved: request.resolved,
        status,
      });

      return { success: true, comment };

    } catch (error) {
      this.logger.error('Failed to resolve comment', { error, commentId, userId });
      return { success: false, error: `Failed to resolve comment: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  /**
   * Delete a comment (soft delete)
   */
  async deleteComment(
    commentId: string,
    userId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Check permissions
      const hasPermission = await this.checkCommentDeletePermission(commentId, userId);
      if (!hasPermission) {
        return { success: false, error: 'Permission denied to delete comment' };
      }

      const now = new Date().toISOString();

      // Soft delete the comment and all its replies
      const query = `
        WITH RECURSIVE comment_tree AS (
          SELECT id FROM whiteboard_comments WHERE id = $1
          UNION ALL
          SELECT wc.id 
          FROM whiteboard_comments wc
          JOIN comment_tree ct ON wc.parent_id = ct.id
        )
        UPDATE whiteboard_comments 
        SET 
          deleted_at = $2,
          updated_at = $2
        WHERE id IN (SELECT id FROM comment_tree)
          AND deleted_at IS NULL
      `;

      await this.db.query(query, [commentId, now]);

      this.logger.info('Comment deleted successfully', { commentId, userId });
      return { success: true };

    } catch (error) {
      this.logger.error('Failed to delete comment', { error, commentId, userId });
      return { success: false, error: `Failed to delete comment: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  /**
   * Get a complete thread with nested replies
   */
  async getCommentThread(
    commentId: string,
    userId: string,
    options: {
      maxDepth?: number;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<CommentThreadResult | null> {
    try {
      const { maxDepth = this.options.maxThreadDepth, limit = 50, offset = 0 } = options;

      // Get root comment
      const rootComment = await this.getCommentById(commentId);
      if (!rootComment) {
        return null;
      }

      // Check access permissions
      const hasAccess = await this.checkCommentViewPermission(commentId, userId);
      if (!hasAccess) {
        return null;
      }

      // Get thread root (might be different from commentId if it's a reply)
      const threadId = rootComment.threadId;

      // Get all replies in thread with proper ordering
      const repliesQuery = `
        WITH RECURSIVE comment_tree AS (
          SELECT 
            c.*,
            0 as level,
            c.created_at::text as sort_path
          FROM whiteboard_comments c
          WHERE c.thread_id = $1 
            AND c.parent_id IS NULL 
            AND c.deleted_at IS NULL
            
          UNION ALL
          
          SELECT 
            c.*,
            ct.level + 1,
            ct.sort_path || '|' || c.created_at::text
          FROM whiteboard_comments c
          JOIN comment_tree ct ON c.parent_id = ct.id
          WHERE c.deleted_at IS NULL 
            AND ct.level < $2
        )
        SELECT * FROM comment_tree
        WHERE level > 0 OR id != $1
        ORDER BY sort_path
        LIMIT $3 OFFSET $4
      `;

      const repliesResult = await this.db.query(repliesQuery, [threadId, maxDepth, limit, offset]);
      const replies = repliesResult.rows.map(row => this.mapDatabaseRowToCommentWithReplies(row));

      // Get thread statistics
      const statsQuery = `
        SELECT 
          COUNT(*) as total_replies,
          COUNT(DISTINCT created_by) as participant_count,
          MAX(updated_at) as last_activity
        FROM whiteboard_comments
        WHERE thread_id = $1 AND id != $1 AND deleted_at IS NULL
      `;

      const statsResult = await this.db.query(statsQuery, [threadId]);
      const stats = statsResult.rows[0];

      return {
        rootComment,
        replies,
        totalReplies: parseInt(stats.total_replies || '0'),
        participantCount: parseInt(stats.participant_count || '1'),
        lastActivity: stats.last_activity?.toISOString() || rootComment.createdAt,
      };

    } catch (error) {
      this.logger.error('Failed to get comment thread', { error, commentId, userId });
      return null;
    }
  }

  /**
   * Get paginated comments for a whiteboard
   */
  async getWhiteboardComments(
    whiteboardId: string,
    userId: string,
    filters: CommentSearchFilters = {},
    limit = 20,
    offset = 0
  ): Promise<PaginatedComments> {
    try {
      // Check whiteboard access
      await this.validateWhiteboardAccess(whiteboardId, userId);

      // Build filter conditions using secure where builder
      const { SafeWhereBuilder, createSafeSearchPattern } = await import('../../utils/sql-security.js');
      const whereBuilder = new SafeWhereBuilder(2);
      
      const conditions = ['w.whiteboard_id = $1', 'w.deleted_at IS NULL'];
      const params = [whiteboardId];
      let paramIndex = 2;

      // Add filters with input sanitization
      if (filters.status && filters.status.length > 0) {
        const sanitizedStatuses = filters.status.map(status => sanitizeInput(status));
        conditions.push(`w.status = ANY($${paramIndex++})`);
        params.push(sanitizedStatuses);
      }

      if (filters.elementId) {
        conditions.push(`w.element_id = $${paramIndex++}`);
        params.push(sanitizeInput(filters.elementId));
      }

      if (filters.createdBy) {
        conditions.push(`w.created_by = $${paramIndex++}`);
        params.push(sanitizeInput(filters.createdBy));
      }

      if (filters.hasReplies !== undefined) {
        if (filters.hasReplies) {
          conditions.push(`EXISTS (SELECT 1 FROM whiteboard_comments r WHERE r.parent_id = w.id AND r.deleted_at IS NULL)`);
        } else {
          conditions.push(`NOT EXISTS (SELECT 1 FROM whiteboard_comments r WHERE r.parent_id = w.id AND r.deleted_at IS NULL)`);
        }
      }

      if (filters.isResolved !== undefined) {
        conditions.push(`w.resolved = $${paramIndex++}`);
        params.push(filters.isResolved);
      }

      if (filters.mentionsUser) {
        conditions.push(`EXISTS (SELECT 1 FROM whiteboard_comment_mentions m WHERE m.comment_id = w.id AND m.user_id = $${paramIndex++})`);
        params.push(sanitizeInput(filters.mentionsUser));
      }

      if (filters.search) {
        // Use safe search pattern for LIKE queries
        const safePattern = createSafeSearchPattern(filters.search, { 
          prefix: true, 
          suffix: true, 
          caseSensitive: false 
        });
        conditions.push(`(w.content ILIKE $${paramIndex} ESCAPE '\\' OR w.tags && ARRAY[$${paramIndex + 1}])`);
        params.push(safePattern.pattern);
        params.push(sanitizeInput(filters.search));
        paramIndex += 2;
      }

      // Date filters with validation
      if (filters.createdAfter) {
        conditions.push(`w.created_at >= $${paramIndex++}`);
        params.push(new Date(filters.createdAfter).toISOString());
      }

      if (filters.createdBefore) {
        conditions.push(`w.created_at <= $${paramIndex++}`);
        params.push(new Date(filters.createdBefore).toISOString());
      }

      const whereClause = conditions.join(' AND ');

      // Get comments with pagination
      const query = `
        SELECT w.*,
               (SELECT COUNT(*) FROM whiteboard_comments r WHERE r.parent_id = w.id AND r.deleted_at IS NULL) as reply_count
        FROM whiteboard_comments w
        WHERE ${whereClause}
          AND w.parent_id IS NULL
        ORDER BY w.created_at DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;

      params.push(limit, offset);

      const result = await this.db.query(query, params);
      const comments = result.rows.map(row => this.mapDatabaseRowToComment(row));

      // Get total count
      const countQuery = `
        SELECT COUNT(*) as total
        FROM whiteboard_comments w
        WHERE ${whereClause}
          AND w.parent_id IS NULL
      `;

      const countParams = params.slice(0, -2); // Remove limit and offset
      const countResult = await this.db.query(countQuery, countParams);
      const total = parseInt(countResult.rows[0]?.total || '0');

      return {
        items: comments,
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      };

    } catch (error) {
      this.logger.error('Failed to get whiteboard comments', { error, whiteboardId, userId });
      return {
        items: [],
        total: 0,
        limit,
        offset,
        hasMore: false,
      };
    }
  }

  // Private helper methods

  private async validateWhiteboardAccess(whiteboardId: string, userId: string): Promise<void> {
    const query = `
      SELECT w.id
      FROM whiteboards w
      LEFT JOIN whiteboard_permissions wp ON w.id = wp.whiteboard_id AND wp.user_id = $2
      WHERE w.id = $1 AND w.deleted_at IS NULL
        AND (w.visibility = 'public' 
             OR w.created_by = $2 
             OR wp.id IS NOT NULL
             OR EXISTS (
               SELECT 1 FROM workspace_members wm 
               JOIN collaborative_workspaces cw ON wm.workspace_id = cw.id
               WHERE cw.id = w.workspace_id AND wm.user_id = $2 AND wm.status = 'active'
             ))
    `;

    const result = await this.db.query(query, [whiteboardId, userId]);
    if (result.rows.length === 0) {
      throw new Error('Whiteboard not found or access denied');
    }
  }

  private async validateThreading(parentId: string, whiteboardId: string): Promise<{
    valid: boolean;
    threadId?: string;
    depth?: number;
    error?: string;
  }> {
    const query = `
      SELECT thread_id, depth, whiteboard_id
      FROM whiteboard_comments
      WHERE id = $1 AND deleted_at IS NULL
    `;

    const result = await this.db.query(query, [parentId]);
    
    if (result.rows.length === 0) {
      return { valid: false, error: 'Parent comment not found' };
    }

    const parent = result.rows[0];
    
    if (parent.whiteboard_id !== whiteboardId) {
      return { valid: false, error: 'Parent comment is in different whiteboard' };
    }

    return {
      valid: true,
      threadId: parent.thread_id,
      depth: parent.depth,
    };
  }

  private async insertCommentToDatabase(comment: WhiteboardComment): Promise<void> {
    const query = `
      INSERT INTO whiteboard_comments (
        id, whiteboard_id, element_id, parent_id, thread_id,
        content, content_type, rich_text_format, position, anchor_point,
        status, priority, resolved, resolved_by, resolved_at, resolved_reason,
        mention_notifications_sent, thread_metadata, depth,
        revision_count, last_edited_by, last_edited_at,
        is_private, allowed_viewers, reactions, tags, metadata,
        created_by, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30)
    `;

    await this.db.query(query, [
      comment.id,
      comment.whiteboardId,
      comment.elementId,
      comment.parentId,
      comment.threadId,
      comment.content,
      comment.contentType,
      JSON.stringify(comment.richTextFormat || {}),
      JSON.stringify(comment.position || null),
      JSON.stringify(comment.anchorPoint || null),
      comment.status,
      comment.priority,
      comment.resolved,
      comment.resolvedBy,
      comment.resolvedAt,
      comment.resolvedReason,
      comment.mentionNotificationsSent,
      JSON.stringify(comment.threadMetadata || {}),
      comment.depth,
      comment.revisionCount,
      comment.lastEditedBy,
      comment.lastEditedAt,
      comment.isPrivate,
      comment.allowedViewers,
      JSON.stringify(comment.reactions),
      comment.tags,
      JSON.stringify(comment.metadata),
      comment.createdBy,
      comment.createdAt,
      comment.updatedAt,
    ]);
  }

  private async insertMentionsToDatabase(commentId: string, mentions: CommentMention[]): Promise<void> {
    if (mentions.length === 0) return;

    // Use parameterized batch insert to prevent SQL injection
    const query = `
      INSERT INTO whiteboard_comment_mentions (
        comment_id, user_id, user_name, user_email, mention_text,
        start_index, length, resolved, notified
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `;

    // Insert mentions one by one in a transaction for safety
    await this.db.transaction(async (client) => {
      for (const mention of mentions) {
        await client.query(query, [
          sanitizeInput(commentId),
          sanitizeInput(mention.userId),
          sanitizeInput(mention.userName || ''),
          sanitizeInput(mention.userEmail || ''),
          sanitizeInput(mention.mentionText || ''),
          mention.startIndex,
          mention.length,
          mention.resolved,
          mention.notified,
        ]);
      }
    });
  }

  private async updateThreadMetadata(threadId: string, userId: string): Promise<void> {
    const query = `
      UPDATE whiteboard_comments
      SET 
        thread_metadata = jsonb_set(
          COALESCE(thread_metadata, '{}'),
          '{replyCount}',
          ((COALESCE(thread_metadata->>'replyCount', '0')::int + 1))::text::jsonb
        )
      WHERE id = $1 AND parent_id IS NULL
    `;

    await this.db.query(query, [threadId]);
  }

  private async getCommentById(commentId: string): Promise<WhiteboardComment | null> {
    const query = `
      SELECT * FROM whiteboard_comments
      WHERE id = $1 AND deleted_at IS NULL
    `;

    const result = await this.db.query(query, [commentId]);
    return result.rows.length > 0 ? this.mapDatabaseRowToComment(result.rows[0]) : null;
  }

  private async checkCommentEditPermission(commentId: string, userId: string): Promise<boolean> {
    const query = `
      SELECT created_by FROM whiteboard_comments
      WHERE id = $1 AND deleted_at IS NULL
    `;

    const result = await this.db.query(query, [commentId]);
    return result.rows.length > 0 && result.rows[0].created_by === userId;
  }

  private async checkCommentResolvePermission(commentId: string, userId: string): Promise<boolean> {
    // TODO: Implement proper permission checking based on workspace roles
    return true;
  }

  private async checkCommentDeletePermission(commentId: string, userId: string): Promise<boolean> {
    const query = `
      SELECT created_by FROM whiteboard_comments
      WHERE id = $1 AND deleted_at IS NULL
    `;

    const result = await this.db.query(query, [commentId]);
    return result.rows.length > 0 && result.rows[0].created_by === userId;
  }

  private async checkCommentViewPermission(commentId: string, userId: string): Promise<boolean> {
    // TODO: Implement proper permission checking for private comments
    return true;
  }

  private async getWorkspaceIdForWhiteboard(whiteboardId: string): Promise<string | null> {
    const query = `SELECT workspace_id FROM whiteboards WHERE id = $1`;
    const result = await this.db.query(query, [whiteboardId]);
    return result.rows[0]?.workspace_id || null;
  }

  private async getWhiteboardName(whiteboardId: string): Promise<string> {
    const query = `SELECT name FROM whiteboards WHERE id = $1`;
    const result = await this.db.query(query, [whiteboardId]);
    return result.rows[0]?.name || 'Unknown Whiteboard';
  }

  private async getUserName(userId: string): Promise<string> {
    const query = `SELECT name FROM users WHERE id = $1`;
    const result = await this.db.query(query, [userId]);
    return result.rows[0]?.name || 'Unknown User';
  }

  private async getUserInfo(userId: string): Promise<{ name: string; email?: string }> {
    const query = `SELECT name, email FROM users WHERE id = $1`;
    const result = await this.db.query(query, [userId]);
    return result.rows[0] || { name: 'Unknown User' };
  }

  private async createMentionNotifications(
    mentions: CommentMention[],
    commentId: string,
    whiteboardId: string,
    whiteboardName: string,
    content: string,
    triggeredBy: string,
    triggeredByName: string
  ): Promise<CommentNotification[]> {
    const notifications: CommentNotification[] = [];

    for (const mention of mentions) {
      const notification: CommentNotification = {
        id: randomUUID(),
        userId: mention.userId,
        commentId,
        whiteboardId,
        type: 'mention',
        title: `You were mentioned in ${whiteboardName}`,
        message: `${triggeredByName} mentioned you in a comment`,
        actionUrl: undefined,
        triggeredBy,
        triggeredByName,
        commentContent: content.substring(0, 200),
        whiteboardName,
        delivered: false,
        deliveredAt: undefined,
        read: false,
        readAt: undefined,
        deliveryMethod: ['in_app'],
        createdAt: new Date().toISOString(),
        expiresAt: undefined,
      };

      notifications.push(notification);
    }

    return notifications;
  }

  private async insertRevisionToDatabase(revision: CommentRevision): Promise<void> {
    const query = `
      INSERT INTO whiteboard_comment_revisions (
        id, comment_id, content, content_type, rich_text_format,
        mentions_data, edited_by, edit_reason, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `;

    await this.db.query(query, [
      revision.id,
      revision.commentId,
      revision.content,
      revision.contentType,
      JSON.stringify(revision.richTextFormat || {}),
      JSON.stringify(revision.mentions),
      revision.editedBy,
      revision.editReason,
      revision.createdAt,
    ]);
  }

  private async updateCommentMentions(commentId: string, mentions: CommentMention[]): Promise<void> {
    // Delete existing mentions
    await this.db.query('DELETE FROM whiteboard_comment_mentions WHERE comment_id = $1', [commentId]);
    
    // Insert new mentions
    if (mentions.length > 0) {
      await this.insertMentionsToDatabase(commentId, mentions);
    }
  }

  private mapDatabaseRowToComment(row: any): WhiteboardComment {
    return {
      id: row.id,
      whiteboardId: row.whiteboard_id,
      elementId: row.element_id,
      parentId: row.parent_id,
      threadId: row.thread_id,
      content: row.content,
      contentType: row.content_type || 'text',
      richTextFormat: this.parseJsonField(row.rich_text_format),
      position: this.parseJsonField(row.position),
      anchorPoint: this.parseJsonField(row.anchor_point),
      status: row.status || 'open',
      priority: row.priority || 'medium',
      resolved: row.resolved || false,
      resolvedBy: row.resolved_by,
      resolvedAt: row.resolved_at?.toISOString(),
      resolvedReason: row.resolved_reason,
      mentions: [], // TODO: Load from separate table
      mentionNotificationsSent: row.mention_notifications_sent || false,
      attachments: [], // TODO: Load from separate table
      threadMetadata: this.parseJsonField(row.thread_metadata),
      depth: row.depth || 0,
      revisionCount: row.revision_count || 0,
      lastEditedBy: row.last_edited_by,
      lastEditedAt: row.last_edited_at?.toISOString(),
      isPrivate: row.is_private || false,
      allowedViewers: row.allowed_viewers || [],
      reactions: this.parseJsonField(row.reactions) || [],
      tags: row.tags || [],
      metadata: this.parseJsonField(row.metadata) || {},
      createdBy: row.created_by,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
      deletedAt: row.deleted_at?.toISOString(),
    };
  }

  private mapDatabaseRowToCommentWithReplies(row: any): WhiteboardCommentWithReplies {
    const comment = this.mapDatabaseRowToComment(row);
    return {
      ...comment,
      replies: [],
      replyCount: 0,
      hasMoreReplies: false,
    };
  }

  private parseJsonField(field: any): any {
    if (!field) return {};
    if (typeof field === 'object') return field;
    try {
      return JSON.parse(field);
    } catch {
      return {};
    }
  }
}