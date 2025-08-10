/**
 * Collaboration Types - Real-time collaboration infrastructure
 * 
 * Type definitions for WebSocket-based real-time collaboration system
 * including sessions, participants, events, messages, and presence tracking.
 */

import { z } from 'zod';

// Base collaboration types
export const CollaborationSessionType = z.enum([
  'search',
  'analysis', 
  'review',
  'kanban',
  'wiki',
  'memory',
  'codebase'
]);

export const ParticipantRole = z.enum([
  'owner',
  'moderator', 
  'participant',
  'observer'
]);

export const PresenceStatus = z.enum([
  'online',
  'idle',
  'busy',
  'offline',
  'away'
]);

export const EventCategory = z.enum([
  'user_action',
  'system_event',
  'presence_update',
  'session_control'
]);

export const DeliveryStatus = z.enum([
  'pending',
  'delivered',
  'failed',
  'retrying'
]);

// Collaboration Session Schema
export const CollaborationSessionSchema = z.object({
  id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  session_name: z.string().min(1).max(255),
  session_type: CollaborationSessionType,
  created_by: z.string().uuid(),
  
  // Session lifecycle
  created_at: z.date(),
  updated_at: z.date(),
  expires_at: z.date().optional(),
  is_active: z.boolean().default(true),
  
  // Session configuration
  settings: z.record(z.unknown()).default({}),
  max_participants: z.number().int().min(1).max(1000).default(50),
  allow_anonymous: z.boolean().default(false),
  require_approval: z.boolean().default(false),
  
  // Collaboration context
  context_data: z.record(z.unknown()).default({}),
  shared_state: z.record(z.unknown()).default({}),
  activity_summary: z.record(z.unknown()).default({})
});

// Session Participant Schema
export const SessionParticipantSchema = z.object({
  id: z.string().uuid(),
  session_id: z.string().uuid(),
  user_id: z.string().uuid(),
  
  // Participation details
  role: ParticipantRole.default('participant'),
  joined_at: z.date(),
  last_seen_at: z.date(),
  is_active: z.boolean().default(true),
  
  // Permissions and capabilities
  permissions: z.record(z.unknown()).default({}),
  can_invite_others: z.boolean().default(false),
  can_modify_session: z.boolean().default(false),
  can_broadcast_events: z.boolean().default(true),
  
  // Participation metrics
  event_count: z.number().int().min(0).default(0),
  total_active_time_ms: z.number().int().min(0).default(0),
  last_activity_type: z.string().optional()
});

// Collaboration Event Schema
export const CollaborationEventSchema = z.object({
  id: z.string().uuid(),
  session_id: z.string().uuid(),
  user_id: z.string().uuid(),
  
  // Event identification
  event_type: z.string().min(1).max(100),
  event_category: EventCategory,
  event_data: z.record(z.unknown()),
  
  // Event ordering and delivery
  sequence_number: z.number().int().min(1),
  created_at: z.date(),
  message_id: z.string().uuid(),
  
  // Event processing
  processed_at: z.date().optional(),
  broadcast_count: z.number().int().min(0).default(0),
  delivery_status: DeliveryStatus.default('pending'),
  
  // Event context
  client_timestamp: z.date().optional(),
  source_connection_id: z.string().optional(),
  requires_ack: z.boolean().default(false),
  parent_event_id: z.string().uuid().optional()
});

// User Presence Schema
export const UserPresenceSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  session_id: z.string().uuid(),
  
  // Presence status
  status: PresenceStatus.default('online'),
  custom_status_text: z.string().max(255).optional(),
  status_emoji: z.string().max(10).optional(),
  last_activity: z.date(),
  
  // Connection details
  connection_count: z.number().int().min(0).default(0),
  connection_ids: z.array(z.string()).default([]),
  last_heartbeat: z.date(),
  
  // Real-time collaboration state
  current_location: z.record(z.unknown()).default({}),
  cursor_position: z.record(z.unknown()).default({}),
  active_tools: z.array(z.string()).default([]),
  
  // User agent and device info
  user_agent: z.string().optional(),
  device_info: z.record(z.unknown()).default({}),
  client_version: z.string().optional(),
  
  // Timestamps
  joined_session_at: z.date(),
  updated_at: z.date()
});

// WebSocket Message Schema
export const CollaborationMessageSchema = z.object({
  type: z.enum([
    'join',
    'leave', 
    'search',
    'filter',
    'annotation',
    'cursor',
    'presence',
    'heartbeat',
    'sync',
    'error',
    'ack'
  ]),
  sessionId: z.string().uuid(),
  userId: z.string().uuid(),
  data: z.record(z.unknown()).default({}),
  timestamp: z.date(),
  sequenceNumber: z.number().int().min(1),
  messageId: z.string().uuid(),
  
  // Optional fields
  targetUserId: z.string().uuid().optional(), // For direct messages
  requiresAck: z.boolean().default(false),
  parentMessageId: z.string().uuid().optional()
});

// Connection State Schema
export const ConnectionStateSchema = z.object({
  connectionId: z.string().uuid(),
  userId: z.string().uuid(),
  sessionId: z.string().uuid(),
  
  // Connection details
  connected_at: z.date(),
  last_ping: z.date(),
  last_pong: z.date(),
  is_authenticated: z.boolean(),
  
  // Connection metadata
  user_agent: z.string().optional(),
  ip_address: z.string().optional(),
  gateway_instance: z.string().optional(),
  
  // Rate limiting
  message_count: z.number().int().min(0).default(0),
  last_message_at: z.date().optional(),
  rate_limit_remaining: z.number().int().min(0).default(100)
});

// Room Management Schema
export const RoomSchema = z.object({
  roomId: z.string(),
  sessionId: z.string().uuid(),
  roomType: z.enum(['session', 'user', 'broadcast']),
  
  // Room state
  participant_count: z.number().int().min(0).default(0),
  created_at: z.date(),
  last_activity: z.date(),
  
  // Room metadata
  metadata: z.record(z.unknown()).default({}),
  is_persistent: z.boolean().default(false)
});

// Event Broadcasting Configuration
export const BroadcastConfigSchema = z.object({
  event_type: z.string(),
  target_rooms: z.array(z.string()),
  exclude_sender: z.boolean().default(true),
  delivery_guarantee: z.enum(['at_most_once', 'at_least_once', 'exactly_once']).default('at_least_once'),
  retention_policy: z.object({
    retain_events: z.boolean().default(true),
    retention_duration_ms: z.number().int().min(0).default(24 * 60 * 60 * 1000), // 24 hours
    max_events_per_session: z.number().int().min(0).default(10000)
  }),
  rate_limiting: z.object({
    max_events_per_second: z.number().int().min(1).default(100),
    burst_allowance: z.number().int().min(1).default(200),
    penalty_duration_ms: z.number().int().min(0).default(5000)
  })
});

// Collaboration Analytics Schema
export const CollaborationAnalyticsSchema = z.object({
  session_id: z.string().uuid(),
  
  // Session metrics
  total_participants: z.number().int().min(0),
  peak_participants: z.number().int().min(0),
  average_session_duration_ms: z.number().int().min(0),
  total_events: z.number().int().min(0),
  
  // Event type breakdown
  event_type_counts: z.record(z.number().int().min(0)).default({}),
  
  // Participation metrics
  user_activity_scores: z.record(z.number().min(0)).default({}),
  collaboration_effectiveness: z.number().min(0).max(1).default(0),
  
  // Performance metrics
  average_event_latency_ms: z.number().min(0).default(0),
  message_delivery_rate: z.number().min(0).max(1).default(1),
  connection_stability: z.number().min(0).max(1).default(1),
  
  // Timestamps
  calculated_at: z.date(),
  period_start: z.date(),
  period_end: z.date()
});

// Export TypeScript types from Zod schemas
export type CollaborationSession = z.infer<typeof CollaborationSessionSchema>;
export type SessionParticipant = z.infer<typeof SessionParticipantSchema>;
export type CollaborationEvent = z.infer<typeof CollaborationEventSchema>;
export type UserPresence = z.infer<typeof UserPresenceSchema>;
export type CollaborationMessage = z.infer<typeof CollaborationMessageSchema>;
export type ConnectionState = z.infer<typeof ConnectionStateSchema>;
export type Room = z.infer<typeof RoomSchema>;
export type BroadcastConfig = z.infer<typeof BroadcastConfigSchema>;
export type CollaborationAnalytics = z.infer<typeof CollaborationAnalyticsSchema>;

// Service interfaces for dependency injection
export interface CollaborationSessionService {
  createSession(session: Omit<CollaborationSession, 'id' | 'created_at' | 'updated_at'>): Promise<CollaborationSession>;
  getSession(id: string): Promise<CollaborationSession | null>;
  updateSession(id: string, updates: Partial<CollaborationSession>): Promise<CollaborationSession>;
  deleteSession(id: string): Promise<void>;
  listActiveSessions(workspace_id?: string): Promise<CollaborationSession[]>;
  
  // Participant management
  addParticipant(participant: Omit<SessionParticipant, 'id' | 'joined_at' | 'last_seen_at'>): Promise<SessionParticipant>;
  updateParticipant(id: string, updates: Partial<SessionParticipant>): Promise<SessionParticipant>;
  removeParticipant(sessionId: string, userId: string): Promise<void>;
  getSessionParticipants(sessionId: string): Promise<SessionParticipant[]>;
}

export interface EventBroadcastingService {
  broadcastEvent(event: Omit<CollaborationEvent, 'id' | 'created_at' | 'processed_at'>): Promise<CollaborationEvent>;
  getEventHistory(sessionId: string, fromSequence?: number, limit?: number): Promise<CollaborationEvent[]>;
  markEventDelivered(eventId: string): Promise<void>;
  replayEvents(sessionId: string, fromTimestamp: Date): Promise<CollaborationEvent[]>;
}

export interface PresenceService {
  updatePresence(presence: Omit<UserPresence, 'id' | 'updated_at'>): Promise<UserPresence>;
  getSessionPresence(sessionId: string): Promise<UserPresence[]>;
  getUserPresence(userId: string): Promise<UserPresence[]>;
  removePresence(userId: string, sessionId: string): Promise<void>;
  updateHeartbeat(userId: string, sessionId: string): Promise<void>;
}

export interface WebSocketCollaborationGateway {
  handleConnection(connectionId: string, auth: any): Promise<void>;
  handleDisconnection(connectionId: string): Promise<void>;
  broadcastToRoom(roomId: string, message: CollaborationMessage, excludeConnectionId?: string): Promise<void>;
  broadcastToSession(sessionId: string, message: CollaborationMessage, excludeConnectionId?: string): Promise<void>;
  sendToUser(userId: string, message: CollaborationMessage): Promise<void>;
  
  // Room management
  joinRoom(connectionId: string, roomId: string): Promise<void>;
  leaveRoom(connectionId: string, roomId: string): Promise<void>;
  getRoomParticipants(roomId: string): Promise<string[]>;
  
  // Connection management
  getConnection(connectionId: string): Promise<ConnectionState | null>;
  getActiveConnections(sessionId?: string): Promise<ConnectionState[]>;
  closeConnection(connectionId: string, reason?: string): Promise<void>;
}