import { Kysely, sql } from 'kysely';

/**
 * Enhanced Comment System Migration
 * 
 * Adds comprehensive threading, @mention support, rich text formatting,
 * audit trails, and notification system for whiteboard comments.
 * 
 * This migration extends the basic comment structure from migration 035
 * with advanced collaborative features.
 */

export async function up(db: Kysely<any>): Promise<void> {
  // Enhance existing whiteboard_comments table with new columns
  await db.schema
    .alterTable('whiteboard_comments')
    .addColumn('thread_id', 'uuid') // Root thread identifier
    .addColumn('content_type', 'varchar(20)', (col) => col.defaultTo('text')) // text, markdown, rich_text
    .addColumn('rich_text_format', 'jsonb', (col) => col.defaultTo('{}')) // Rich text formatting data
    .addColumn('anchor_point', 'jsonb') // Enhanced positioning with element anchoring
    .addColumn('status', 'varchar(20)', (col) => col.defaultTo('open')) // open, in_progress, resolved, archived
    .addColumn('priority', 'varchar(20)', (col) => col.defaultTo('medium')) // low, medium, high, urgent
    .addColumn('resolved_reason', 'text') // Reason for resolution
    .addColumn('mention_notifications_sent', 'boolean', (col) => col.defaultTo(false))
    .addColumn('thread_metadata', 'jsonb', (col) => col.defaultTo('{}')) // Thread stats and metadata
    .addColumn('depth', 'integer', (col) => col.defaultTo(0)) // Nesting depth in thread
    .addColumn('revision_count', 'integer', (col) => col.defaultTo(0)) // Number of edits
    .addColumn('last_edited_by', 'uuid') // Last editor
    .addColumn('last_edited_at', 'timestamptz') // Last edit timestamp
    .addColumn('is_private', 'boolean', (col) => col.defaultTo(false)) // Private comment visibility
    .addColumn('allowed_viewers', 'uuid[]', (col) => col.defaultTo(sql`ARRAY[]::uuid[]`)) // Specific viewer access
    .addColumn('reactions', 'jsonb', (col) => col.defaultTo('[]')) // User reactions
    .addColumn('tags', 'text[]', (col) => col.defaultTo(sql`ARRAY[]::text[]`)) // Comment tags
    .addColumn('metadata', 'jsonb', (col) => col.defaultTo('{}')) // Additional metadata
    .execute();

  // Comment revisions table for audit trail and edit history
  await db.schema
    .createTable('whiteboard_comment_revisions')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('comment_id', 'uuid', (col) => col.notNull().references('whiteboard_comments.id').onDelete('cascade'))
    .addColumn('content', 'text', (col) => col.notNull())
    .addColumn('content_type', 'varchar(20)', (col) => col.notNull().defaultTo('text'))
    .addColumn('rich_text_format', 'jsonb', (col) => col.defaultTo('{}'))
    .addColumn('mentions_data', 'jsonb', (col) => col.defaultTo('[]')) // Mention data at time of revision
    .addColumn('edited_by', 'uuid', (col) => col.notNull())
    .addColumn('edit_reason', 'text') // Optional reason for edit
    .addColumn('created_at', 'timestamptz', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
    .execute();

  // Comment mentions table for detailed @mention tracking
  await db.schema
    .createTable('whiteboard_comment_mentions')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('comment_id', 'uuid', (col) => col.notNull().references('whiteboard_comments.id').onDelete('cascade'))
    .addColumn('user_id', 'uuid', (col) => col.notNull()) // Mentioned user
    .addColumn('user_name', 'varchar(255)', (col) => col.notNull())
    .addColumn('user_email', 'varchar(255)')
    .addColumn('mention_text', 'varchar(100)', (col) => col.notNull()) // Original @mention text
    .addColumn('start_index', 'integer', (col) => col.notNull()) // Character position in content
    .addColumn('length', 'integer', (col) => col.notNull()) // Length of mention text
    .addColumn('resolved', 'boolean', (col) => col.defaultTo(true)) // Whether user ID was resolved
    .addColumn('notified', 'boolean', (col) => col.defaultTo(false)) // Whether notification was sent
    .addColumn('notified_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
    .execute();

  // Comment notifications table for comprehensive notification tracking
  await db.schema
    .createTable('whiteboard_comment_notifications')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('user_id', 'uuid', (col) => col.notNull()) // User receiving notification
    .addColumn('comment_id', 'uuid', (col) => col.notNull().references('whiteboard_comments.id').onDelete('cascade'))
    .addColumn('whiteboard_id', 'uuid', (col) => col.notNull().references('whiteboards.id').onDelete('cascade'))
    .addColumn('type', 'varchar(20)', (col) => col.notNull()) // mention, reply, resolution, edit, reaction
    .addColumn('title', 'varchar(255)', (col) => col.notNull())
    .addColumn('message', 'text', (col) => col.notNull())
    .addColumn('action_url', 'text') // Deep link to comment
    .addColumn('triggered_by', 'uuid', (col) => col.notNull()) // User who triggered notification
    .addColumn('triggered_by_name', 'varchar(255)', (col) => col.notNull())
    .addColumn('comment_content', 'varchar(200)', (col) => col.notNull()) // Truncated comment content
    .addColumn('whiteboard_name', 'varchar(255)', (col) => col.notNull())
    .addColumn('delivered', 'boolean', (col) => col.defaultTo(false))
    .addColumn('delivered_at', 'timestamptz')
    .addColumn('read', 'boolean', (col) => col.defaultTo(false))
    .addColumn('read_at', 'timestamptz')
    .addColumn('delivery_method', 'text[]', (col) => col.defaultTo(sql`ARRAY['in_app']::text[]`)) // in_app, email, push
    .addColumn('created_at', 'timestamptz', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
    .addColumn('expires_at', 'timestamptz') // Optional notification expiration
    .execute();

  // Comment activities table for real-time typing indicators and activity tracking
  await db.schema
    .createTable('whiteboard_comment_activities')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('user_id', 'uuid', (col) => col.notNull())
    .addColumn('user_name', 'varchar(255)', (col) => col.notNull())
    .addColumn('whiteboard_id', 'uuid', (col) => col.notNull().references('whiteboards.id').onDelete('cascade'))
    .addColumn('comment_id', 'uuid') // Optional: for reply composition or editing
    .addColumn('activity', 'varchar(20)', (col) => col.notNull()) // typing, viewing, composing_reply, editing
    .addColumn('started_at', 'timestamptz', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
    .addColumn('last_activity', 'timestamptz', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
    .addColumn('session_id', 'varchar(255)') // WebSocket session identifier
    .execute();

  // Comment attachments table for file and media attachments
  await db.schema
    .createTable('whiteboard_comment_attachments')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('comment_id', 'uuid', (col) => col.notNull().references('whiteboard_comments.id').onDelete('cascade'))
    .addColumn('type', 'varchar(20)', (col) => col.notNull()) // image, file, link
    .addColumn('name', 'varchar(255)', (col) => col.notNull())
    .addColumn('url', 'text', (col) => col.notNull())
    .addColumn('size', 'bigint') // File size in bytes
    .addColumn('mime_type', 'varchar(100)')
    .addColumn('thumbnail_url', 'text')
    .addColumn('metadata', 'jsonb', (col) => col.defaultTo('{}'))
    .addColumn('uploaded_by', 'uuid', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull())
    .execute();

  // Update existing comments to have thread_id (set to comment id for root comments)
  await db.updateTable('whiteboard_comments')
    .set({ thread_id: sql`COALESCE(parent_id, id)` })
    .execute();

  // Make thread_id not null after setting values
  await db.schema
    .alterTable('whiteboard_comments')
    .alterColumn('thread_id', (col) => col.setNotNull())
    .execute();

  // Create indexes for optimal performance

  // Comment revision indexes
  await db.schema.createIndex('idx_comment_revisions_comment_id').on('whiteboard_comment_revisions').column('comment_id').execute();
  await db.schema.createIndex('idx_comment_revisions_edited_by').on('whiteboard_comment_revisions').column('edited_by').execute();
  await db.schema.createIndex('idx_comment_revisions_created_at').on('whiteboard_comment_revisions').column('created_at').execute();

  // Comment mention indexes
  await db.schema.createIndex('idx_comment_mentions_comment_id').on('whiteboard_comment_mentions').column('comment_id').execute();
  await db.schema.createIndex('idx_comment_mentions_user_id').on('whiteboard_comment_mentions').column('user_id').execute();
  await db.schema.createIndex('idx_comment_mentions_notified').on('whiteboard_comment_mentions').column('notified').execute();

  // Comment notification indexes
  await db.schema.createIndex('idx_comment_notifications_user_id').on('whiteboard_comment_notifications').column('user_id').execute();
  await db.schema.createIndex('idx_comment_notifications_comment_id').on('whiteboard_comment_notifications').column('comment_id').execute();
  await db.schema.createIndex('idx_comment_notifications_whiteboard_id').on('whiteboard_comment_notifications').column('whiteboard_id').execute();
  await db.schema.createIndex('idx_comment_notifications_type').on('whiteboard_comment_notifications').column('type').execute();
  await db.schema.createIndex('idx_comment_notifications_delivered').on('whiteboard_comment_notifications').column('delivered').execute();
  await db.schema.createIndex('idx_comment_notifications_read').on('whiteboard_comment_notifications').column('read').execute();
  await db.schema.createIndex('idx_comment_notifications_triggered_by').on('whiteboard_comment_notifications').column('triggered_by').execute();
  await db.schema.createIndex('idx_comment_notifications_created_at').on('whiteboard_comment_notifications').column('created_at').execute();

  // Comment activity indexes
  await db.schema.createIndex('idx_comment_activities_user_id').on('whiteboard_comment_activities').column('user_id').execute();
  await db.schema.createIndex('idx_comment_activities_whiteboard_id').on('whiteboard_comment_activities').column('whiteboard_id').execute();
  await db.schema.createIndex('idx_comment_activities_comment_id').on('whiteboard_comment_activities').column('comment_id').execute();
  await db.schema.createIndex('idx_comment_activities_activity').on('whiteboard_comment_activities').column('activity').execute();
  await db.schema.createIndex('idx_comment_activities_last_activity').on('whiteboard_comment_activities').column('last_activity').execute();
  await db.schema.createIndex('idx_comment_activities_session_id').on('whiteboard_comment_activities').column('session_id').execute();

  // Comment attachment indexes
  await db.schema.createIndex('idx_comment_attachments_comment_id').on('whiteboard_comment_attachments').column('comment_id').execute();
  await db.schema.createIndex('idx_comment_attachments_type').on('whiteboard_comment_attachments').column('type').execute();
  await db.schema.createIndex('idx_comment_attachments_uploaded_by').on('whiteboard_comment_attachments').column('uploaded_by').execute();
  await db.schema.createIndex('idx_comment_attachments_created_at').on('whiteboard_comment_attachments').column('created_at').execute();

  // Enhanced comment indexes for new columns
  await db.schema.createIndex('idx_whiteboard_comments_thread_id').on('whiteboard_comments').column('thread_id').execute();
  await db.schema.createIndex('idx_whiteboard_comments_status').on('whiteboard_comments').column('status').execute();
  await db.schema.createIndex('idx_whiteboard_comments_priority').on('whiteboard_comments').column('priority').execute();
  await db.schema.createIndex('idx_whiteboard_comments_content_type').on('whiteboard_comments').column('content_type').execute();
  await db.schema.createIndex('idx_whiteboard_comments_depth').on('whiteboard_comments').column('depth').execute();
  await db.schema.createIndex('idx_whiteboard_comments_is_private').on('whiteboard_comments').column('is_private').execute();
  await db.schema.createIndex('idx_whiteboard_comments_last_edited_by').on('whiteboard_comments').column('last_edited_by').execute();
  await db.schema.createIndex('idx_whiteboard_comments_last_edited_at').on('whiteboard_comments').column('last_edited_at').execute();

  // Critical composite indexes for 100+ comment performance optimization
  
  // Core query patterns for thread traversal and listing
  await db.schema.createIndex('idx_comments_whiteboard_thread_deleted')
    .on('whiteboard_comments')
    .columns(['whiteboard_id', 'thread_id', 'deleted_at'])
    .execute();
    
  await db.schema.createIndex('idx_comments_thread_parent_created')
    .on('whiteboard_comments')
    .columns(['thread_id', 'parent_id', 'created_at'])
    .where('deleted_at', 'is', null)
    .execute();
    
  await db.schema.createIndex('idx_comments_whiteboard_parent_created')
    .on('whiteboard_comments')
    .columns(['whiteboard_id', 'parent_id', 'created_at'])
    .where('deleted_at', 'is', null)
    .execute();

  // Thread hierarchy and depth queries (prevent N+1)
  await db.schema.createIndex('idx_comments_thread_depth_created')
    .on('whiteboard_comments')
    .columns(['thread_id', 'depth', 'created_at'])
    .where('deleted_at', 'is', null)
    .execute();
    
  await db.schema.createIndex('idx_comments_parent_depth_created')
    .on('whiteboard_comments')
    .columns(['parent_id', 'depth', 'created_at'])
    .where('deleted_at', 'is', null)
    .execute();

  // Status and filtering queries
  await db.schema.createIndex('idx_comments_whiteboard_status_created')
    .on('whiteboard_comments')
    .columns(['whiteboard_id', 'status', 'created_at'])
    .where('deleted_at', 'is', null)
    .execute();
    
  await db.schema.createIndex('idx_comments_whiteboard_resolved_created')
    .on('whiteboard_comments')
    .columns(['whiteboard_id', 'resolved', 'created_at'])
    .where('deleted_at', 'is', null)
    .execute();

  // User-specific queries for dashboard and notifications
  await db.schema.createIndex('idx_comments_created_by_whiteboard_created')
    .on('whiteboard_comments')
    .columns(['created_by', 'whiteboard_id', 'created_at'])
    .where('deleted_at', 'is', null)
    .execute();
    
  await db.schema.createIndex('idx_comments_element_whiteboard_created')
    .on('whiteboard_comments')
    .columns(['element_id', 'whiteboard_id', 'created_at'])
    .where('deleted_at', 'is', null)
    .execute();

  // Priority and urgency queries
  await db.schema.createIndex('idx_comments_priority_status_created')
    .on('whiteboard_comments')
    .columns(['priority', 'status', 'created_at'])
    .where('deleted_at', 'is', null)
    .execute();

  // Private comments and permissions
  await db.schema.createIndex('idx_comments_private_whiteboard_created')
    .on('whiteboard_comments')
    .columns(['is_private', 'whiteboard_id', 'created_at'])
    .where('deleted_at', 'is', null)
    .execute();

  // Edit tracking and version history
  await db.schema.createIndex('idx_comments_edited_by_edited_at')
    .on('whiteboard_comments')
    .columns(['last_edited_by', 'last_edited_at'])
    .where('last_edited_at', 'is not', null)
    .execute();

  // Full-text search optimization (for PostgreSQL)
  await db.schema.createIndex('idx_comments_content_gin')
    .on('whiteboard_comments')
    .expression(sql`to_tsvector('english', content)`)
    .using('gin')
    .execute();
    
  await db.schema.createIndex('idx_comments_tags_gin')
    .on('whiteboard_comments')
    .column('tags')
    .using('gin')
    .execute();

  // Optimized notification indexes for high-volume scenarios
  await db.schema.createIndex('idx_notifications_user_unread_created')
    .on('whiteboard_comment_notifications')
    .columns(['user_id', 'read', 'created_at'])
    .execute();
    
  await db.schema.createIndex('idx_notifications_user_type_created')
    .on('whiteboard_comment_notifications')
    .columns(['user_id', 'type', 'created_at'])
    .execute();
    
  await db.schema.createIndex('idx_notifications_whiteboard_user_created')
    .on('whiteboard_comment_notifications')
    .columns(['whiteboard_id', 'user_id', 'created_at'])
    .execute();
    
  await db.schema.createIndex('idx_notifications_delivery_status')
    .on('whiteboard_comment_notifications')
    .columns(['delivered', 'expires_at', 'created_at'])
    .where('delivered', '=', false)
    .execute();

  // Real-time activity tracking indexes for live collaboration
  await db.schema.createIndex('idx_activities_whiteboard_recent')
    .on('whiteboard_comment_activities')
    .columns(['whiteboard_id', 'last_activity'])
    .where('last_activity', '>', sql`NOW() - INTERVAL '5 minutes'`)
    .execute();
    
  await db.schema.createIndex('idx_activities_comment_session')
    .on('whiteboard_comment_activities')
    .columns(['comment_id', 'session_id', 'last_activity'])
    .where('comment_id', 'is not', null)
    .execute();
    
  await db.schema.createIndex('idx_activities_user_typing')
    .on('whiteboard_comment_activities')
    .columns(['user_id', 'activity', 'last_activity'])
    .where('activity', '=', 'typing')
    .execute();

  // Mention performance indexes for rapid user lookup
  await db.schema.createIndex('idx_mentions_user_comment_notified')
    .on('whiteboard_comment_mentions')
    .columns(['user_id', 'comment_id', 'notified'])
    .execute();
    
  await db.schema.createIndex('idx_mentions_comment_resolved_created')
    .on('whiteboard_comment_mentions')
    .columns(['comment_id', 'resolved', 'created_at'])
    .execute();

  // Legacy indexes for backward compatibility
  await db.schema.createIndex('idx_comments_whiteboard_thread').on('whiteboard_comments').columns(['whiteboard_id', 'thread_id']).execute();
  await db.schema.createIndex('idx_comments_thread_depth').on('whiteboard_comments').columns(['thread_id', 'depth']).execute();
  await db.schema.createIndex('idx_comments_status_priority').on('whiteboard_comments').columns(['status', 'priority']).execute();
  await db.schema.createIndex('idx_comments_parent_created_at').on('whiteboard_comments').columns(['parent_id', 'created_at']).execute();

  // Add foreign key references for enhanced relationships
  await db.schema.alterTable('whiteboard_comments').addForeignKeyConstraint('fk_comments_thread_id', ['thread_id'], 'whiteboard_comments', ['id']).execute();
  await db.schema.alterTable('whiteboard_comments').addForeignKeyConstraint('fk_comments_last_edited_by', ['last_edited_by'], 'users', ['id']).execute();
  await db.schema.alterTable('whiteboard_comment_mentions').addForeignKeyConstraint('fk_comment_mentions_user_id', ['user_id'], 'users', ['id']).execute();
  await db.schema.alterTable('whiteboard_comment_notifications').addForeignKeyConstraint('fk_comment_notifications_user_id', ['user_id'], 'users', ['id']).execute();
  await db.schema.alterTable('whiteboard_comment_notifications').addForeignKeyConstraint('fk_comment_notifications_triggered_by', ['triggered_by'], 'users', ['id']).execute();
  await db.schema.alterTable('whiteboard_comment_activities').addForeignKeyConstraint('fk_comment_activities_user_id', ['user_id'], 'users', ['id']).execute();
  await db.schema.alterTable('whiteboard_comment_activities').addForeignKeyConstraint('fk_comment_activities_comment_id', ['comment_id'], 'whiteboard_comments', ['id']).onDelete('cascade').execute();
  await db.schema.alterTable('whiteboard_comment_attachments').addForeignKeyConstraint('fk_comment_attachments_uploaded_by', ['uploaded_by'], 'users', ['id']).execute();

  console.log('✅ Enhanced comment system migration completed');
}

export async function down(db: Kysely<any>): Promise<void> {
  // Drop new tables in reverse order due to foreign key constraints
  await db.schema.dropTable('whiteboard_comment_attachments').execute();
  await db.schema.dropTable('whiteboard_comment_activities').execute();
  await db.schema.dropTable('whiteboard_comment_notifications').execute();
  await db.schema.dropTable('whiteboard_comment_mentions').execute();
  await db.schema.dropTable('whiteboard_comment_revisions').execute();

  // Remove added columns from whiteboard_comments table
  await db.schema
    .alterTable('whiteboard_comments')
    .dropColumn('thread_id')
    .dropColumn('content_type')
    .dropColumn('rich_text_format')
    .dropColumn('anchor_point')
    .dropColumn('status')
    .dropColumn('priority')
    .dropColumn('resolved_reason')
    .dropColumn('mention_notifications_sent')
    .dropColumn('thread_metadata')
    .dropColumn('depth')
    .dropColumn('revision_count')
    .dropColumn('last_edited_by')
    .dropColumn('last_edited_at')
    .dropColumn('is_private')
    .dropColumn('allowed_viewers')
    .dropColumn('reactions')
    .dropColumn('tags')
    .dropColumn('metadata')
    .execute();

  console.log('✅ Enhanced comment system migration rolled back');
}