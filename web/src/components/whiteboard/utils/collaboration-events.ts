/**
 * Whiteboard Collaboration Events
 * 
 * Defines all WebSocket event types and data structures for whiteboard collaboration.
 */

import { WhiteboardOperation } from './whiteboard-ot';

// ==================== BASE TYPES ====================

export interface WhiteboardUser {
  id: string;
  name: string;
  email?: string;
  color?: string;
}

export interface WhiteboardSession {
  sessionId: string;
  whiteboardId: string;
  workspaceId: string;
  permissions: {
    canEdit: boolean;
    canComment: boolean;
    canManage: boolean;
  };
  canvasVersion: number;
}

// ==================== PRESENCE EVENTS ====================

export interface WhiteboardPresence {
  userId: string;
  userName: string;
  cursor: { x: number; y: number };
  viewport: { 
    x: number; 
    y: number; 
    width: number; 
    height: number; 
    zoom: number 
  };
  selection: string[];
  color: string;
  timestamp: string;
}

export interface PresenceUpdateEvent {
  cursor?: { x: number; y: number };
  viewport?: { 
    x: number; 
    y: number; 
    width: number; 
    height: number; 
    zoom: number 
  };
  selection?: string[];
}

// ==================== CURSOR TRACKING EVENTS ====================

export interface CursorMoveEvent {
  whiteboardId: string;
  position: {
    x: number;
    y: number;
    canvasX: number;
    canvasY: number;
  };
  timestamp: number;
  sessionId: string;
}

export interface CursorEnterEvent {
  whiteboardId: string;
  sessionId: string;
  userInfo: {
    userId: string;
    userName: string;
    userColor: string;
  };
  timestamp: number;
}

export interface CursorLeaveEvent {
  whiteboardId: string;
  sessionId: string;
  userId: string;
  timestamp: number;
}

export interface CursorUpdateEvent {
  userId: string;
  userName: string;
  userColor: string;
  position: {
    x: number;
    y: number;
    canvasX: number;
    canvasY: number;
  };
  timestamp: number;
  sessionId: string;
}

export interface CursorDisconnectedEvent {
  userId: string;
  sessionId: string;
  timestamp: number;
  reason: 'timeout' | 'disconnect' | 'leave';
}

// ==================== CANVAS EVENTS ====================

export interface CanvasChangeEvent {
  operation: WhiteboardOperation;
  clientVersion: number;
}

export interface CanvasChangedEvent {
  operation: WhiteboardOperation;
  user: WhiteboardUser;
  timestamp: string;
}

export interface CanvasAckEvent {
  operationId: string;
  newVersion?: number;
  success: boolean;
  error?: string;
}

export interface SyncRequestEvent {
  whiteboardId: string;
}

export interface SyncRequestedEvent {
  requesterId: string;
  requesterSocketId: string;
  version: number;
}

export interface SyncResponseEvent {
  requesterId: string;
  requesterSocketId: string;
  canvasData: any;
  version: number;
}

export interface SyncDataEvent {
  canvasData: any;
  version: number;
  provider: WhiteboardUser;
}

// ==================== COMMENT EVENTS ====================

export interface WhiteboardComment {
  id: string;
  whiteboardId: string;
  elementId?: string;
  position: { x: number; y: number };
  content: string;
  author: WhiteboardUser;
  replies?: WhiteboardComment[];
  resolved?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AddCommentEvent {
  whiteboardId: string;
  elementId?: string;
  position: { x: number; y: number };
  content: string;
  tempId?: string; // Client-side temporary ID
}

export interface CommentAddedEvent {
  comment: WhiteboardComment;
}

export interface CommentAckEvent {
  tempId?: string;
  comment?: WhiteboardComment;
  success: boolean;
  error?: string;
}

export interface ReplyCommentEvent {
  whiteboardId: string;
  commentId: string;
  content: string;
}

export interface CommentReplyAddedEvent {
  commentId: string;
  reply: WhiteboardComment;
}

export interface ReplyAckEvent {
  commentId: string;
  reply?: WhiteboardComment;
  success: boolean;
  error?: string;
}

export interface ResolveCommentEvent {
  whiteboardId: string;
  commentId: string;
  resolved: boolean;
}

export interface CommentResolvedEvent {
  commentId: string;
  resolved: boolean;
  resolvedBy: WhiteboardUser;
  timestamp: string;
}

export interface DeleteCommentEvent {
  whiteboardId: string;
  commentId: string;
}

export interface CommentDeletedEvent {
  commentId: string;
  deletedBy: WhiteboardUser;
  timestamp: string;
}

// ==================== SESSION EVENTS ====================

export interface JoinWhiteboardEvent {
  whiteboardId: string;
  workspaceId: string;
  clientInfo?: {
    userAgent?: string;
    platform?: string;
    timestamp: string;
  };
}

export interface SessionStartedEvent {
  sessionId: string;
  whiteboardId: string;
  workspaceId: string;
  permissions: {
    canEdit: boolean;
    canComment: boolean;
    canManage: boolean;
  };
  canvasVersion: number;
}

export interface UserJoinedEvent {
  user: WhiteboardUser;
  presence: WhiteboardPresence;
  timestamp: string;
}

export interface UserLeftEvent {
  user: WhiteboardUser;
  reason?: string;
  timestamp: string;
}

export interface LeaveWhiteboardEvent {
  whiteboardId: string;
  reason?: string;
}

export interface PresenceListEvent {
  presences: WhiteboardPresence[];
}

// ==================== ERROR EVENTS ====================

export interface WhiteboardError {
  code: 'AUTH_REQUIRED' | 'NO_SESSION' | 'JOIN_FAILED' | 'LEAVE_FAILED' | 'OPERATION_FAILED' | 'PERMISSION_DENIED';
  message: string;
  details?: string;
  timestamp?: string;
}

// ==================== EVENT TYPE UNIONS ====================

// Client -> Server Events
export type WhiteboardClientEvents = {
  // Session management
  'whiteboard:join': JoinWhiteboardEvent;
  'whiteboard:leave': LeaveWhiteboardEvent;
  
  // Canvas operations
  'whiteboard:canvas_change': CanvasChangeEvent;
  'whiteboard:request_sync': SyncRequestEvent;
  'whiteboard:sync_response': SyncResponseEvent;
  
  // Presence
  'whiteboard:presence': PresenceUpdateEvent;
  
  // Cursor tracking
  'whiteboard:cursor_move': CursorMoveEvent;
  'whiteboard:cursor_enter': CursorEnterEvent;
  'whiteboard:cursor_leave': CursorLeaveEvent;
  
  // Comments
  'whiteboard:add_comment': AddCommentEvent;
  'whiteboard:reply_comment': ReplyCommentEvent;
  'whiteboard:resolve_comment': ResolveCommentEvent;
  'whiteboard:delete_comment': DeleteCommentEvent;
};

// Server -> Client Events
export type WhiteboardServerEvents = {
  // Session management
  'whiteboard:session_started': SessionStartedEvent;
  'whiteboard:user_joined': UserJoinedEvent;
  'whiteboard:user_left': UserLeftEvent;
  'whiteboard:presence_list': PresenceListEvent;
  
  // Canvas operations
  'whiteboard:canvas_changed': CanvasChangedEvent;
  'whiteboard:canvas_ack': CanvasAckEvent;
  'whiteboard:sync_requested': SyncRequestedEvent;
  'whiteboard:sync_data': SyncDataEvent;
  
  // Presence
  'whiteboard:presence_updated': WhiteboardPresence;
  
  // Cursor tracking
  'whiteboard:cursor_updated': CursorUpdateEvent;
  'whiteboard:cursor_disconnected': CursorDisconnectedEvent;
  
  // Comments
  'whiteboard:comment_added': CommentAddedEvent;
  'whiteboard:comment_ack': CommentAckEvent;
  'whiteboard:comment_reply_added': CommentReplyAddedEvent;
  'whiteboard:reply_ack': ReplyAckEvent;
  'whiteboard:comment_resolved': CommentResolvedEvent;
  'whiteboard:comment_deleted': CommentDeletedEvent;
  
  // Errors
  'error': WhiteboardError;
};

// ==================== HELPER FUNCTIONS ====================

/**
 * Create a new comment object
 */
export function createComment(
  whiteboardId: string,
  content: string,
  author: WhiteboardUser,
  position: { x: number; y: number },
  elementId?: string
): WhiteboardComment {
  const now = new Date().toISOString();
  
  return {
    id: `comment_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
    whiteboardId,
    elementId,
    position,
    content,
    author,
    replies: [],
    resolved: false,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Create a new reply object
 */
export function createReply(
  whiteboardId: string,
  content: string,
  author: WhiteboardUser
): WhiteboardComment {
  const now = new Date().toISOString();
  
  return {
    id: `reply_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
    whiteboardId,
    position: { x: 0, y: 0 }, // Replies don't have positions
    content,
    author,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Create presence update object
 */
export function createPresenceUpdate(
  cursor?: { x: number; y: number },
  viewport?: { x: number; y: number; width: number; height: number; zoom: number },
  selection?: string[]
): PresenceUpdateEvent {
  const update: PresenceUpdateEvent = {};
  
  if (cursor) update.cursor = cursor;
  if (viewport) update.viewport = viewport;
  if (selection !== undefined) update.selection = selection;
  
  return update;
}

/**
 * Create client info object
 */
export function createClientInfo(): { userAgent?: string; platform?: string; timestamp: string } {
  return {
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
    platform: typeof navigator !== 'undefined' ? navigator.platform : undefined,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Validate event data
 */
export function validateEventData<T>(
  eventType: keyof WhiteboardClientEvents,
  data: any
): data is T {
  switch (eventType) {
    case 'whiteboard:join':
      return !!(data.whiteboardId && data.workspaceId);
      
    case 'whiteboard:canvas_change':
      return !!(data.operation && typeof data.clientVersion === 'number');
      
    case 'whiteboard:add_comment':
      return !!(data.whiteboardId && data.position && data.content);
      
    case 'whiteboard:reply_comment':
      return !!(data.whiteboardId && data.commentId && data.content);
      
    case 'whiteboard:resolve_comment':
      return !!(data.whiteboardId && data.commentId && typeof data.resolved === 'boolean');
      
    case 'whiteboard:delete_comment':
      return !!(data.whiteboardId && data.commentId);
      
    default:
      return true; // For events without specific validation
  }
}

/**
 * Generate unique operation ID
 */
export function generateOperationId(): string {
  return `op_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Generate unique session token
 */
export function generateSessionToken(): string {
  return `wb_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}