import { z } from 'zod';
import { DomainEvent, DomainEventSchema } from './event-sourcing';

// Base collaboration event types
export interface CollaborationDomainEvent extends DomainEvent {
  metadata: DomainEvent['metadata'] & {
    sessionId: string;
    workspaceId: string;
  };
}

// Session Management Events
export interface SessionStartedEvent extends CollaborationDomainEvent {
  eventType: 'collaboration.session.started';
  eventData: {
    sessionId: string;
    workspaceId: string;
    initiatorId: string;
    sessionType: 'search' | 'annotation' | 'conflict_resolution' | 'review';
    configuration: {
      maxParticipants?: number;
      autoSave?: boolean;
      conflictDetection?: boolean;
      permissions?: Record<string, string[]>;
      [key: string]: unknown;
    };
  };
}

export interface SessionEndedEvent extends CollaborationDomainEvent {
  eventType: 'collaboration.session.ended';
  eventData: {
    sessionId: string;
    endedBy: string;
    reason: 'manual' | 'timeout' | 'inactivity' | 'error';
    duration: number;
    summary: {
      participantCount: number;
      eventCount: number;
      conflictCount: number;
      resolutionCount: number;
    };
  };
}

export interface SessionPausedEvent extends CollaborationDomainEvent {
  eventType: 'collaboration.session.paused';
  eventData: {
    sessionId: string;
    pausedBy: string;
    reason: string;
  };
}

export interface SessionResumedEvent extends CollaborationDomainEvent {
  eventType: 'collaboration.session.resumed';
  eventData: {
    sessionId: string;
    resumedBy: string;
    pausedDuration: number;
  };
}

// Participant Management Events
export interface ParticipantJoinedEvent extends CollaborationDomainEvent {
  eventType: 'collaboration.participant.joined';
  eventData: {
    sessionId: string;
    participantId: string;
    role: 'owner' | 'editor' | 'viewer' | 'reviewer';
    permissions: string[];
    invitedBy?: string;
  };
}

export interface ParticipantLeftEvent extends CollaborationDomainEvent {
  eventType: 'collaboration.participant.left';
  eventData: {
    sessionId: string;
    participantId: string;
    reason: 'manual' | 'timeout' | 'kicked' | 'error';
    duration: number;
  };
}

export interface ParticipantRoleChangedEvent extends CollaborationDomainEvent {
  eventType: 'collaboration.participant.role_changed';
  eventData: {
    sessionId: string;
    participantId: string;
    oldRole: string;
    newRole: string;
    changedBy: string;
  };
}

export interface ParticipantPresenceChangedEvent extends CollaborationDomainEvent {
  eventType: 'collaboration.participant.presence_changed';
  eventData: {
    sessionId: string;
    participantId: string;
    status: 'online' | 'away' | 'offline';
    lastActivity?: Date;
  };
}

// Search Collaboration Events
export interface SearchQueryChangedEvent extends CollaborationDomainEvent {
  eventType: 'collaboration.search.query_changed';
  eventData: {
    sessionId: string;
    userId: string;
    oldQuery: string;
    newQuery: string;
    changeType: 'addition' | 'modification' | 'deletion' | 'replacement';
    affectedRange?: {
      start: number;
      end: number;
    };
    cursorPosition?: number;
  };
}

export interface SearchResultSelectedEvent extends CollaborationDomainEvent {
  eventType: 'collaboration.search.result_selected';
  eventData: {
    sessionId: string;
    userId: string;
    resultId: string;
    resultType: string;
    query: string;
    rank: number;
    metadata: Record<string, unknown>;
  };
}

export interface SearchFilterAppliedEvent extends CollaborationDomainEvent {
  eventType: 'collaboration.search.filter_applied';
  eventData: {
    sessionId: string;
    userId: string;
    filterId: string;
    filterType: string;
    filterValue: unknown;
    operation: 'add' | 'remove' | 'modify';
  };
}

export interface SearchFacetSelectedEvent extends CollaborationDomainEvent {
  eventType: 'collaboration.search.facet_selected';
  eventData: {
    sessionId: string;
    userId: string;
    facetName: string;
    facetValue: string;
    selected: boolean;
  };
}

// Annotation Events
export interface AnnotationCreatedEvent extends CollaborationDomainEvent {
  eventType: 'collaboration.annotation.created';
  eventData: {
    annotationId: string;
    sessionId: string;
    userId: string;
    contentId: string;
    annotation: {
      type: 'highlight' | 'comment' | 'suggestion' | 'question' | 'approval';
      content: string;
      position: {
        start: number;
        end: number;
        context?: string;
      };
      tags: string[];
      priority: 'low' | 'medium' | 'high';
    };
  };
}

export interface AnnotationUpdatedEvent extends CollaborationDomainEvent {
  eventType: 'collaboration.annotation.updated';
  eventData: {
    annotationId: string;
    sessionId: string;
    userId: string;
    changes: {
      content?: string;
      tags?: string[];
      priority?: 'low' | 'medium' | 'high';
      position?: {
        start: number;
        end: number;
        context?: string;
      };
    };
  };
}

export interface AnnotationResolvedEvent extends CollaborationDomainEvent {
  eventType: 'collaboration.annotation.resolved';
  eventData: {
    annotationId: string;
    sessionId: string;
    resolvedBy: string;
    resolution: {
      type: 'accepted' | 'rejected' | 'modified' | 'merged';
      comment?: string;
      changes?: Record<string, unknown>;
    };
  };
}

export interface AnnotationDeletedEvent extends CollaborationDomainEvent {
  eventType: 'collaboration.annotation.deleted';
  eventData: {
    annotationId: string;
    sessionId: string;
    deletedBy: string;
    reason: string;
  };
}

// Conflict Resolution Events
export interface ConflictDetectedEvent extends CollaborationDomainEvent {
  eventType: 'collaboration.conflict.detected';
  eventData: {
    conflictId: string;
    sessionId: string;
    contentId: string;
    conflictType: 'concurrent_edit' | 'version_mismatch' | 'access_conflict' | 'data_integrity';
    participants: string[];
    conflictData: {
      originalContent: unknown;
      conflictingChanges: Array<{
        userId: string;
        change: unknown;
        timestamp: Date;
      }>;
    };
    severity: 'low' | 'medium' | 'high' | 'critical';
  };
}

export interface ConflictEscalatedEvent extends CollaborationDomainEvent {
  eventType: 'collaboration.conflict.escalated';
  eventData: {
    conflictId: string;
    sessionId: string;
    escalatedBy?: string;
    reason: string;
    newSeverity: 'high' | 'critical';
    notifiedUsers: string[];
  };
}

export interface ConflictResolvedEvent extends CollaborationDomainEvent {
  eventType: 'collaboration.conflict.resolved';
  eventData: {
    conflictId: string;
    sessionId: string;
    resolution: {
      strategy: 'merge' | 'override' | 'manual' | 'ai_assisted';
      resolvedBy: string;
      mergedContent: unknown;
      resolutionTime: number;
      participantVotes?: Array<{
        userId: string;
        vote: 'approve' | 'reject';
        comment?: string;
      }>;
      aiSuggestions?: Array<{
        suggestion: unknown;
        confidence: number;
        reasoning: string;
      }>;
    };
  };
}

export interface ConflictCancelledEvent extends CollaborationDomainEvent {
  eventType: 'collaboration.conflict.cancelled';
  eventData: {
    conflictId: string;
    sessionId: string;
    cancelledBy: string;
    reason: string;
  };
}

// Content Synchronization Events
export interface ContentLockAcquiredEvent extends CollaborationDomainEvent {
  eventType: 'collaboration.content.lock_acquired';
  eventData: {
    lockId: string;
    sessionId: string;
    contentId: string;
    userId: string;
    lockType: 'read' | 'write' | 'exclusive';
    duration?: number;
  };
}

export interface ContentLockReleasedEvent extends CollaborationDomainEvent {
  eventType: 'collaboration.content.lock_released';
  eventData: {
    lockId: string;
    sessionId: string;
    contentId: string;
    userId: string;
    reason: 'manual' | 'timeout' | 'error';
  };
}

export interface ContentSyncedEvent extends CollaborationDomainEvent {
  eventType: 'collaboration.content.synced';
  eventData: {
    sessionId: string;
    contentId: string;
    syncedBy: string;
    changes: Array<{
      type: 'insert' | 'delete' | 'retain';
      attributes?: Record<string, unknown>;
      content?: unknown;
      length?: number;
    }>;
    version: number;
  };
}

// Workflow Events
export interface WorkflowStartedEvent extends CollaborationDomainEvent {
  eventType: 'collaboration.workflow.started';
  eventData: {
    workflowId: string;
    sessionId: string;
    workflowType: 'review' | 'approval' | 'merge' | 'validation';
    initiatedBy: string;
    participants: string[];
    configuration: Record<string, unknown>;
  };
}

export interface WorkflowTaskCompletedEvent extends CollaborationDomainEvent {
  eventType: 'collaboration.workflow.task_completed';
  eventData: {
    workflowId: string;
    taskId: string;
    sessionId: string;
    completedBy: string;
    result: 'approved' | 'rejected' | 'modified' | 'deferred';
    comment?: string;
    artifacts?: Record<string, unknown>;
  };
}

export interface WorkflowCompletedEvent extends CollaborationDomainEvent {
  eventType: 'collaboration.workflow.completed';
  eventData: {
    workflowId: string;
    sessionId: string;
    finalResult: 'approved' | 'rejected' | 'cancelled';
    completedBy?: string;
    duration: number;
    summary: {
      tasksCompleted: number;
      approvals: number;
      rejections: number;
      modifications: number;
    };
  };
}

// Union type for all collaboration events
export type CollaborationEvent = 
  | SessionStartedEvent
  | SessionEndedEvent
  | SessionPausedEvent
  | SessionResumedEvent
  | ParticipantJoinedEvent
  | ParticipantLeftEvent
  | ParticipantRoleChangedEvent
  | ParticipantPresenceChangedEvent
  | SearchQueryChangedEvent
  | SearchResultSelectedEvent
  | SearchFilterAppliedEvent
  | SearchFacetSelectedEvent
  | AnnotationCreatedEvent
  | AnnotationUpdatedEvent
  | AnnotationResolvedEvent
  | AnnotationDeletedEvent
  | ConflictDetectedEvent
  | ConflictEscalatedEvent
  | ConflictResolvedEvent
  | ConflictCancelledEvent
  | ContentLockAcquiredEvent
  | ContentLockReleasedEvent
  | ContentSyncedEvent
  | WorkflowStartedEvent
  | WorkflowTaskCompletedEvent
  | WorkflowCompletedEvent;

// Zod schemas for validation
export const SessionStartedEventSchema = DomainEventSchema.extend({
  eventType: z.literal('collaboration.session.started'),
  eventData: z.object({
    sessionId: z.string().uuid(),
    workspaceId: z.string().uuid(),
    initiatorId: z.string().uuid(),
    sessionType: z.enum(['search', 'annotation', 'conflict_resolution', 'review']),
    configuration: z.record(z.unknown()),
  }),
});

export const ParticipantJoinedEventSchema = DomainEventSchema.extend({
  eventType: z.literal('collaboration.participant.joined'),
  eventData: z.object({
    sessionId: z.string().uuid(),
    participantId: z.string().uuid(),
    role: z.enum(['owner', 'editor', 'viewer', 'reviewer']),
    permissions: z.array(z.string()),
    invitedBy: z.string().uuid().optional(),
  }),
});

export const ConflictResolvedEventSchema = DomainEventSchema.extend({
  eventType: z.literal('collaboration.conflict.resolved'),
  eventData: z.object({
    conflictId: z.string().uuid(),
    sessionId: z.string().uuid(),
    resolution: z.object({
      strategy: z.enum(['merge', 'override', 'manual', 'ai_assisted']),
      resolvedBy: z.string().uuid(),
      mergedContent: z.unknown(),
      resolutionTime: z.number().nonnegative(),
      participantVotes: z.array(z.object({
        userId: z.string().uuid(),
        vote: z.enum(['approve', 'reject']),
        comment: z.string().optional(),
      })).optional(),
      aiSuggestions: z.array(z.object({
        suggestion: z.unknown(),
        confidence: z.number().min(0).max(1),
        reasoning: z.string(),
      })).optional(),
    }),
  }),
});

// Event type constants
export const COLLABORATION_EVENT_TYPES = {
  SESSION_STARTED: 'collaboration.session.started',
  SESSION_ENDED: 'collaboration.session.ended',
  SESSION_PAUSED: 'collaboration.session.paused',
  SESSION_RESUMED: 'collaboration.session.resumed',
  PARTICIPANT_JOINED: 'collaboration.participant.joined',
  PARTICIPANT_LEFT: 'collaboration.participant.left',
  PARTICIPANT_ROLE_CHANGED: 'collaboration.participant.role_changed',
  PARTICIPANT_PRESENCE_CHANGED: 'collaboration.participant.presence_changed',
  SEARCH_QUERY_CHANGED: 'collaboration.search.query_changed',
  SEARCH_RESULT_SELECTED: 'collaboration.search.result_selected',
  SEARCH_FILTER_APPLIED: 'collaboration.search.filter_applied',
  SEARCH_FACET_SELECTED: 'collaboration.search.facet_selected',
  ANNOTATION_CREATED: 'collaboration.annotation.created',
  ANNOTATION_UPDATED: 'collaboration.annotation.updated',
  ANNOTATION_RESOLVED: 'collaboration.annotation.resolved',
  ANNOTATION_DELETED: 'collaboration.annotation.deleted',
  CONFLICT_DETECTED: 'collaboration.conflict.detected',
  CONFLICT_ESCALATED: 'collaboration.conflict.escalated',
  CONFLICT_RESOLVED: 'collaboration.conflict.resolved',
  CONFLICT_CANCELLED: 'collaboration.conflict.cancelled',
  CONTENT_LOCK_ACQUIRED: 'collaboration.content.lock_acquired',
  CONTENT_LOCK_RELEASED: 'collaboration.content.lock_released',
  CONTENT_SYNCED: 'collaboration.content.synced',
  WORKFLOW_STARTED: 'collaboration.workflow.started',
  WORKFLOW_TASK_COMPLETED: 'collaboration.workflow.task_completed',
  WORKFLOW_COMPLETED: 'collaboration.workflow.completed',
} as const;

export type CollaborationEventType = typeof COLLABORATION_EVENT_TYPES[keyof typeof COLLABORATION_EVENT_TYPES];