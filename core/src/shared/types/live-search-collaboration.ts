/**
 * Live Search Collaboration Types
 * 
 * Type definitions for real-time collaborative search functionality
 * including search sessions, participants, state synchronization, 
 * annotations, and conflict resolution.
 */

import { z } from 'zod';

// Base search collaboration types
export const SearchSessionRole = z.enum([
  'searcher',
  'observer', 
  'moderator'
]);

export const SearchEventType = z.enum([
  'query_update',
  'filter_change',
  'result_highlight',
  'annotation_add',
  'annotation_update',
  'annotation_delete',
  'bookmark_add',
  'bookmark_remove',
  'cursor_move',
  'selection_change'
]);

export const AnnotationType = z.enum([
  'highlight',
  'note',
  'bookmark',
  'flag',
  'question',
  'suggestion'
]);

export const ConflictResolutionStrategy = z.enum([
  'last_write_wins',
  'merge',
  'manual'
]);

// Collaborative Search Session Schema
export const CollaborativeSearchSessionSchema = z.object({
  id: z.string().uuid(),
  collaboration_session_id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  session_name: z.string().min(1).max(255),
  created_by: z.string().uuid(),
  
  // Session lifecycle
  created_at: z.date(),
  updated_at: z.date(),
  is_active: z.boolean().default(true),
  is_persistent: z.boolean().default(true),
  
  // Session configuration
  search_settings: z.record(z.unknown()).default({}),
  max_participants: z.number().int().min(1).max(100).default(50),
  allow_anonymous_search: z.boolean().default(false),
  require_moderation: z.boolean().default(false),
  
  // Current search state
  current_search_state: z.record(z.unknown()).default({}),
  search_history: z.array(z.record(z.unknown())).default([]),
  shared_annotations: z.record(z.unknown()).default({}),
  performance_metrics: z.record(z.unknown()).default({})
});

// Search Session Participant Schema
export const SearchSessionParticipantSchema = z.object({
  id: z.string().uuid(),
  search_session_id: z.string().uuid(),
  user_id: z.string().uuid(),
  
  // Participation details
  role: SearchSessionRole.default('searcher'),
  joined_at: z.date(),
  last_search_at: z.date(),
  is_active: z.boolean().default(true),
  
  // Search permissions
  can_initiate_search: z.boolean().default(true),
  can_modify_filters: z.boolean().default(true),
  can_annotate_results: z.boolean().default(true),
  can_bookmark_results: z.boolean().default(true),
  can_invite_participants: z.boolean().default(false),
  
  // Participation metrics
  search_query_count: z.number().int().min(0).default(0),
  filter_change_count: z.number().int().min(0).default(0),
  annotation_count: z.number().int().min(0).default(0),
  total_search_time_ms: z.number().int().min(0).default(0),
  
  // Current search context
  current_query: z.string().optional(),
  active_filters: z.record(z.unknown()).default({}),
  cursor_position: z.record(z.unknown()).default({}),
  selected_results: z.array(z.string().uuid()).default([])
});

// Shared Search State Schema
export const SharedSearchStateSchema = z.object({
  id: z.string().uuid(),
  search_session_id: z.string().uuid(),
  state_key: z.string().min(1).max(100),
  state_value: z.record(z.unknown()),
  last_modified_by: z.string().uuid(),
  last_modified_at: z.date(),
  
  // State versioning for conflict resolution
  version: z.number().int().min(1).default(1),
  state_hash: z.string().length(64), // SHA-256 hash
  conflict_resolution: ConflictResolutionStrategy.default('last_write_wins'),
  
  // Change tracking
  change_source: z.enum(['user', 'system', 'merge']).default('user'),
  previous_value: z.record(z.unknown()).optional(),
  change_reason: z.string().optional()
});

// Collaborative Search Event Schema
export const CollaborativeSearchEventSchema = z.object({
  id: z.string().uuid(),
  search_session_id: z.string().uuid(),
  collaboration_event_id: z.string().uuid(),
  user_id: z.string().uuid(),
  
  // Search-specific event details
  search_event_type: SearchEventType,
  search_event_data: z.record(z.unknown()),
  
  // Event ordering and timing
  sequence_number: z.number().int().min(1),
  created_at: z.date(),
  client_timestamp: z.date().optional(),
  
  // Search context
  query_before: z.string().optional(),
  query_after: z.string().optional(),
  filters_before: z.record(z.unknown()).optional(),
  filters_after: z.record(z.unknown()).optional(),
  affected_results: z.array(z.string().uuid()).default([]),
  
  // Event metadata
  debounce_group_id: z.string().uuid().optional(),
  is_debounced: z.boolean().default(false),
  batch_id: z.string().uuid().optional()
});

// Search Annotation Schema
export const SearchAnnotationSchema = z.object({
  id: z.string().uuid(),
  search_session_id: z.string().uuid(),
  user_id: z.string().uuid(),
  
  // Annotation target
  result_id: z.string().uuid(),
  result_type: z.string().min(1).max(50),
  result_url: z.string().optional(),
  
  // Annotation content
  annotation_type: AnnotationType,
  annotation_text: z.string().optional(),
  annotation_data: z.record(z.unknown()).default({}),
  
  // Text selection for highlights
  text_selection: z.record(z.unknown()).default({}),
  selected_text: z.string().optional(),
  
  // Annotation metadata
  is_shared: z.boolean().default(true),
  is_resolved: z.boolean().default(false),
  resolved_by: z.string().uuid().optional(),
  resolved_at: z.date().optional(),
  
  // Timestamps
  created_at: z.date(),
  updated_at: z.date(),
  
  // Collaboration context
  parent_annotation_id: z.string().uuid().optional(),
  mentions: z.array(z.string().uuid()).default([])
});

// WebSocket Search Collaboration Message Schema
export const SearchCollaborationMessageSchema = z.object({
  type: z.enum([
    'search_join',
    'search_leave',
    'search_query_update',
    'search_filter_update',
    'search_result_highlight',
    'search_annotation',
    'search_cursor_update',
    'search_selection_change',
    'search_bookmark',
    'search_state_sync',
    'search_conflict_resolution',
    'search_session_update'
  ]),
  searchSessionId: z.string().uuid(),
  userId: z.string().uuid(),
  data: z.record(z.unknown()).default({}),
  timestamp: z.date(),
  sequenceNumber: z.number().int().min(1),
  messageId: z.string().uuid(),
  
  // Search-specific fields
  searchContext: z.object({
    query: z.string().optional(),
    filters: z.record(z.unknown()).optional(),
    resultIds: z.array(z.string().uuid()).optional(),
    cursorPosition: z.record(z.unknown()).optional()
  }).optional(),
  
  // Debouncing and batching
  debounceGroupId: z.string().uuid().optional(),
  batchId: z.string().uuid().optional(),
  isDebounced: z.boolean().default(false),
  
  // Optional fields
  targetUserId: z.string().uuid().optional(),
  requiresAck: z.boolean().default(false),
  parentMessageId: z.string().uuid().optional()
});

// Search State Update Schema
export const SearchStateUpdateSchema = z.object({
  sessionId: z.string().uuid(),
  userId: z.string().uuid(),
  stateKey: z.string(),
  newValue: z.record(z.unknown()),
  previousValue: z.record(z.unknown()).optional(),
  timestamp: z.date(),
  conflictResolution: ConflictResolutionStrategy.optional()
});

// Search Conflict Resolution Schema
export const SearchConflictResolutionSchema = z.object({
  conflictId: z.string().uuid(),
  sessionId: z.string().uuid(),
  stateKey: z.string(),
  conflictingValues: z.array(z.object({
    userId: z.string().uuid(),
    value: z.record(z.unknown()),
    timestamp: z.date()
  })),
  resolutionStrategy: ConflictResolutionStrategy,
  resolvedValue: z.record(z.unknown()).optional(),
  resolvedBy: z.string().uuid().optional(),
  resolvedAt: z.date().optional()
});

// Export TypeScript types from Zod schemas
export type CollaborativeSearchSession = z.infer<typeof CollaborativeSearchSessionSchema>;
export type SearchSessionParticipant = z.infer<typeof SearchSessionParticipantSchema>;
export type SharedSearchState = z.infer<typeof SharedSearchStateSchema>;
export type CollaborativeSearchEvent = z.infer<typeof CollaborativeSearchEventSchema>;
export type SearchAnnotation = z.infer<typeof SearchAnnotationSchema>;
export type SearchCollaborationMessage = z.infer<typeof SearchCollaborationMessageSchema>;
export type SearchStateUpdate = z.infer<typeof SearchStateUpdateSchema>;
export type SearchConflictResolution = z.infer<typeof SearchConflictResolutionSchema>;

// Service interfaces for dependency injection
export interface LiveSearchCollaborationService {
  // Session management
  createSearchSession(session: Omit<CollaborativeSearchSession, 'id' | 'created_at' | 'updated_at'>): Promise<CollaborativeSearchSession>;
  getSearchSession(id: string): Promise<CollaborativeSearchSession | null>;
  updateSearchSession(id: string, updates: Partial<CollaborativeSearchSession>): Promise<CollaborativeSearchSession>;
  deleteSearchSession(id: string): Promise<void>;
  listActiveSearchSessions(workspaceId?: string): Promise<CollaborativeSearchSession[]>;
  
  // Participant management
  joinSearchSession(sessionId: string, userId: string, role?: SearchSessionRole): Promise<SearchSessionParticipant>;
  leaveSearchSession(sessionId: string, userId: string): Promise<void>;
  updateParticipant(participantId: string, updates: Partial<SearchSessionParticipant>): Promise<SearchSessionParticipant>;
  getSessionParticipants(sessionId: string): Promise<SearchSessionParticipant[]>;
  
  // Search state synchronization
  updateSearchState(update: SearchStateUpdate): Promise<SharedSearchState>;
  getSearchState(sessionId: string, stateKey: string): Promise<SharedSearchState | null>;
  syncSearchState(sessionId: string): Promise<Record<string, SharedSearchState>>;
  
  // Event handling
  broadcastSearchEvent(event: Omit<CollaborativeSearchEvent, 'id' | 'created_at'>): Promise<CollaborativeSearchEvent>;
  getSearchEventHistory(sessionId: string, fromSequence?: number, limit?: number): Promise<CollaborativeSearchEvent[]>;
  
  // Annotations
  createAnnotation(annotation: Omit<SearchAnnotation, 'id' | 'created_at' | 'updated_at'>): Promise<SearchAnnotation>;
  updateAnnotation(id: string, updates: Partial<SearchAnnotation>): Promise<SearchAnnotation>;
  deleteAnnotation(id: string): Promise<void>;
  getSessionAnnotations(sessionId: string): Promise<SearchAnnotation[]>;
  
  // Conflict resolution
  detectConflicts(sessionId: string, stateKey: string): Promise<SearchConflictResolution[]>;
  resolveConflict(conflictId: string, resolution: SearchConflictResolution): Promise<void>;
}

export interface SearchCollaborationWebSocketGateway {
  handleSearchMessage(message: SearchCollaborationMessage): Promise<void>;
  broadcastSearchUpdate(sessionId: string, message: SearchCollaborationMessage, excludeUserId?: string): Promise<void>;
  joinSearchSession(connectionId: string, sessionId: string): Promise<void>;
  leaveSearchSession(connectionId: string, sessionId: string): Promise<void>;
  getActiveSearchParticipants(sessionId: string): Promise<string[]>;
}

// Export all schemas for runtime validation
export const SearchCollaborationSchemas = {
  CollaborativeSearchSession: CollaborativeSearchSessionSchema,
  SearchSessionParticipant: SearchSessionParticipantSchema,
  SharedSearchState: SharedSearchStateSchema,
  CollaborativeSearchEvent: CollaborativeSearchEventSchema,
  SearchAnnotation: SearchAnnotationSchema,
  SearchCollaborationMessage: SearchCollaborationMessageSchema,
  SearchStateUpdate: SearchStateUpdateSchema,
  SearchConflictResolution: SearchConflictResolutionSchema
} as const;