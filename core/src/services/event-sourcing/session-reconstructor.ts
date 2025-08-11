import { Pool } from 'pg';
import { 
  DomainEvent, 
  TimeRange, 
  AuditTrail, 
  AuditTimelineEntry,
  EventSourcingError
} from '../../shared/types/event-sourcing';
import { 
  CollaborationEvent,
  COLLABORATION_EVENT_TYPES
} from '../../shared/types/collaboration-events';
import { EventStore } from './event-store-service';
import { logger } from '../../utils/logger';
import { SessionReconstructionCache, sessionReconstructionCache } from './session-reconstruction-cache';

export interface CollaborationSession {
  sessionId: string;
  workspaceId: string;
  sessionType: 'search' | 'annotation' | 'conflict_resolution' | 'review';
  status: 'active' | 'paused' | 'ended' | 'cancelled';
  configuration: Record<string, unknown>;
  participants: SessionParticipant[];
  timeline: SessionTimelineEntry[];
  conflicts: ConflictSummary[];
  annotations: AnnotationSummary[];
  searchActivity: SearchActivitySummary;
  workflows: WorkflowSummary[];
  createdAt: Date;
  updatedAt: Date;
  endedAt?: Date;
  duration?: number;
  metadata: {
    totalEvents: number;
    eventTypes: Record<string, number>;
    participantCount: number;
    conflictCount: number;
    resolutionCount: number;
    annotationCount: number;
  };
}

export interface SessionParticipant {
  userId: string;
  role: 'owner' | 'editor' | 'viewer' | 'reviewer';
  permissions: string[];
  joinedAt: Date;
  leftAt?: Date;
  isActive: boolean;
  activitySummary: {
    eventsGenerated: number;
    searchQueries: number;
    annotationsCreated: number;
    conflictsResolved: number;
    lastActivity: Date;
  };
}

export interface SessionTimelineEntry {
  timestamp: Date;
  eventType: string;
  eventId: string;
  userId?: string;
  description: string;
  impact: 'low' | 'medium' | 'high';
  details: Record<string, unknown>;
  causationChain?: string[];
}

export interface ConflictSummary {
  conflictId: string;
  conflictType: string;
  contentId: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'in_progress' | 'resolved' | 'escalated' | 'cancelled';
  participants: string[];
  detectedAt: Date;
  resolvedAt?: Date;
  resolutionStrategy?: string;
  resolutionTime?: number;
}

export interface AnnotationSummary {
  annotationId: string;
  userId: string;
  contentId: string;
  annotationType: string;
  status: 'active' | 'resolved' | 'archived' | 'deleted';
  createdAt: Date;
  resolvedAt?: Date;
  tags: string[];
  priority: 'low' | 'medium' | 'high';
}

export interface SearchActivitySummary {
  totalQueries: number;
  uniqueQueries: number;
  averageQueryLength: number;
  mostCommonTerms: Array<{ term: string; count: number }>;
  queryEvolution: Array<{
    timestamp: Date;
    query: string;
    userId: string;
    changeType: string;
  }>;
  resultsSelected: number;
  filtersApplied: number;
  facetsUsed: string[];
}

export interface WorkflowSummary {
  workflowId: string;
  workflowType: string;
  status: 'active' | 'completed' | 'cancelled';
  initiatedBy: string;
  participants: string[];
  startedAt: Date;
  completedAt?: Date;
  tasksCompleted: number;
  finalResult?: string;
}

export interface SessionCriteria {
  sessionType?: string;
  participantId?: string;
  workspaceId?: string;
  hasConflicts?: boolean;
  minDuration?: number;
  maxDuration?: number;
  eventTypes?: string[];
  status?: string[];
}

export interface SessionTimeline {
  sessionId: string;
  events: DomainEvent[];
  timelineEntries: SessionTimelineEntry[];
  keyMilestones: Array<{
    timestamp: Date;
    milestone: string;
    description: string;
    relatedEvents: string[];
  }>;
  participantActivities: Array<{
    userId: string;
    activities: Array<{
      timestamp: Date;
      activity: string;
      eventId: string;
    }>;
  }>;
}

export interface SessionState {
  sessionId: string;
  timestamp: Date;
  state: CollaborationSession;
  activeParticipants: SessionParticipant[];
  currentConflicts: ConflictSummary[];
  activeAnnotations: AnnotationSummary[];
  searchState: {
    currentQuery?: string;
    activeFilters: Array<{ type: string; value: unknown }>;
    selectedFacets: Array<{ name: string; value: string }>;
  };
  workflowStates: Array<{
    workflowId: string;
    status: string;
    currentTask?: string;
  }>;
}

export interface ParticipantActivity {
  userId: string;
  timeRange: TimeRange;
  sessions: string[];
  totalEvents: number;
  eventBreakdown: Record<string, number>;
  collaborationMetrics: {
    sessionsInitiated: number;
    sessionsJoined: number;
    conflictsCreated: number;
    conflictsResolved: number;
    annotationsCreated: number;
    searchQueriesExecuted: number;
    averageSessionDuration: number;
  };
  behaviorPatterns: {
    mostActiveHours: number[];
    preferredSessionTypes: string[];
    collaborationStyle: 'leader' | 'participant' | 'observer';
    conflictResolutionApproach: 'collaborative' | 'decisive' | 'diplomatic';
  };
}

export class SessionReconstructor {
  private readonly cache: SessionReconstructionCache;

  constructor(
    private readonly eventStore: EventStore,
    private readonly pool: Pool,
    cache?: SessionReconstructionCache
  ) {
    this.cache = cache || sessionReconstructionCache;
  }

  async reconstructSession(sessionId: string, pointInTime?: Date): Promise<CollaborationSession> {
    try {
      logger.info(`Reconstructing session ${sessionId}${pointInTime ? ` at ${pointInTime.toISOString()}` : ''}`, {
        sessionId,
        pointInTime
      });

      // Get all events for the session
      const streamId = this.getSessionStreamId(sessionId);
      let events = await this.eventStore.getEvents(streamId);

      if (events.length === 0) {
        throw new EventSourcingError(`No events found for session ${sessionId}`, 'SESSION_NOT_FOUND', { sessionId });
      }

      // Filter events up to point in time if specified
      if (pointInTime) {
        events = events.filter(event => event.timestamp <= pointInTime);
      }

      const currentVersion = events.length > 0 ? Math.max(...events.map(e => e.sequenceNumber)) : 0;

      // Try incremental reconstruction from cache first
      if (!pointInTime) { // Only use cache for current state reconstruction
        try {
          const cachedSession = await this.cache.reconstructSessionFromCache(
            sessionId,
            currentVersion,
            events,
            this.buildSessionFromEvents.bind(this)
          );

          logger.info(`Session reconstruction completed from cache for ${sessionId}`, {
            sessionId,
            eventCount: events.length,
            participantCount: cachedSession.participants.length,
            conflictCount: cachedSession.conflicts.length,
            reconstructionMethod: 'cached'
          });

          return cachedSession;
        } catch (cacheError) {
          logger.debug(`Cache reconstruction failed, falling back to full reconstruction`, {
            sessionId,
            error: cacheError.message
          });
        }
      }

      // Full reconstruction from events
      const session = await this.buildSessionFromEvents(sessionId, events);

      // Cache the result if this is current state reconstruction
      if (!pointInTime) {
        this.cache.setCachedSession(sessionId, session, currentVersion);
      }

      logger.info(`Session reconstruction completed for ${sessionId}`, {
        sessionId,
        eventCount: events.length,
        participantCount: session.participants.length,
        conflictCount: session.conflicts.length,
        reconstructionMethod: pointInTime ? 'point_in_time' : 'full'
      });

      return session;

    } catch (error) {
      logger.error(`Failed to reconstruct session ${sessionId}`, {
        sessionId,
        pointInTime,
        error: error.message
      });
      throw error;
    }
  }

  async getSessionTimeline(sessionId: string): Promise<SessionTimeline> {
    try {
      const streamId = this.getSessionStreamId(sessionId);
      const events = await this.eventStore.getEvents(streamId);

      const timelineEntries = events.map(event => this.createTimelineEntry(event));
      const keyMilestones = this.identifyKeyMilestones(events);
      const participantActivities = this.groupActivitiesByParticipant(events);

      return {
        sessionId,
        events,
        timelineEntries,
        keyMilestones,
        participantActivities
      };

    } catch (error) {
      logger.error(`Failed to get timeline for session ${sessionId}`, {
        sessionId,
        error: error.message
      });
      throw error;
    }
  }

  async replayEventsFromTime(sessionId: string, fromTime: Date): Promise<DomainEvent[]> {
    try {
      const streamId = this.getSessionStreamId(sessionId);
      const allEvents = await this.eventStore.getEvents(streamId);
      
      return allEvents.filter(event => event.timestamp >= fromTime);

    } catch (error) {
      logger.error(`Failed to replay events from time for session ${sessionId}`, {
        sessionId,
        fromTime,
        error: error.message
      });
      throw error;
    }
  }

  async getSessionStateAtTime(sessionId: string, timestamp: Date): Promise<SessionState> {
    try {
      const session = await this.reconstructSession(sessionId, timestamp);
      
      // Extract point-in-time state
      const activeParticipants = session.participants.filter(p => 
        p.joinedAt <= timestamp && (!p.leftAt || p.leftAt > timestamp)
      );

      const currentConflicts = session.conflicts.filter(c =>
        c.detectedAt <= timestamp && (!c.resolvedAt || c.resolvedAt > timestamp)
      );

      const activeAnnotations = session.annotations.filter(a =>
        a.createdAt <= timestamp && (!a.resolvedAt || a.resolvedAt > timestamp)
      );

      // Get search state at that time
      const searchState = await this.getSearchStateAtTime(sessionId, timestamp);
      
      // Get workflow states at that time
      const workflowStates = await this.getWorkflowStatesAtTime(sessionId, timestamp);

      return {
        sessionId,
        timestamp,
        state: session,
        activeParticipants,
        currentConflicts,
        activeAnnotations,
        searchState,
        workflowStates
      };

    } catch (error) {
      logger.error(`Failed to get session state at time for ${sessionId}`, {
        sessionId,
        timestamp,
        error: error.message
      });
      throw error;
    }
  }

  async findSessionsWithCriteria(criteria: SessionCriteria, timeRange: TimeRange): Promise<CollaborationSession[]> {
    try {
      const client = await this.pool.connect();
      
      let query = `
        SELECT DISTINCT s.session_id
        FROM collaboration_sessions s
        WHERE s.created_at BETWEEN $1 AND $2
      `;
      
      const params: any[] = [timeRange.start, timeRange.end];
      let paramIndex = 2;

      // Add criteria filters
      if (criteria.sessionType) {
        query += ` AND s.session_type = $${++paramIndex}`;
        params.push(criteria.sessionType);
      }

      if (criteria.workspaceId) {
        query += ` AND s.workspace_id = $${++paramIndex}`;
        params.push(criteria.workspaceId);
      }

      if (criteria.participantId) {
        query += ` AND EXISTS (
          SELECT 1 FROM collaboration_participants p 
          WHERE p.session_id = s.session_id AND p.user_id = $${++paramIndex}
        )`;
        params.push(criteria.participantId);
      }

      if (criteria.hasConflicts) {
        query += ` AND EXISTS (
          SELECT 1 FROM conflict_instances c 
          WHERE c.session_id = s.session_id
        )`;
      }

      if (criteria.status && criteria.status.length > 0) {
        query += ` AND s.status = ANY($${++paramIndex})`;
        params.push(criteria.status);
      }

      const result = await client.query(query, params);
      client.release();

      // Reconstruct each matching session
      const sessions = await Promise.all(
        result.rows.map(row => this.reconstructSession(row.session_id))
      );

      // Apply additional filtering
      return sessions.filter(session => {
        if (criteria.minDuration && (!session.duration || session.duration < criteria.minDuration)) {
          return false;
        }
        
        if (criteria.maxDuration && session.duration && session.duration > criteria.maxDuration) {
          return false;
        }

        if (criteria.eventTypes && criteria.eventTypes.length > 0) {
          const sessionEventTypes = Object.keys(session.metadata.eventTypes);
          const hasRequiredEventType = criteria.eventTypes.some(type => 
            sessionEventTypes.includes(type)
          );
          if (!hasRequiredEventType) {
            return false;
          }
        }

        return true;
      });

    } catch (error) {
      logger.error('Failed to find sessions with criteria', {
        criteria,
        timeRange,
        error: error.message
      });
      throw error;
    }
  }

  async getParticipantActivity(userId: string, timeRange: TimeRange): Promise<ParticipantActivity> {
    try {
      const client = await this.pool.connect();
      
      // Get sessions where user participated
      const sessionQuery = `
        SELECT DISTINCT p.session_id
        FROM collaboration_participants p
        JOIN collaboration_sessions s ON s.session_id = p.session_id
        WHERE p.user_id = $1 AND s.created_at BETWEEN $2 AND $3
      `;
      
      const sessionResult = await client.query(sessionQuery, [userId, timeRange.start, timeRange.end]);
      const sessionIds = sessionResult.rows.map(row => row.session_id);

      // Get all events for these sessions where user was involved
      const eventQuery = `
        SELECT event_type, COUNT(*) as count
        FROM events
        WHERE (metadata->>'userId')::uuid = $1 
        AND timestamp BETWEEN $2 AND $3
        GROUP BY event_type
      `;
      
      const eventResult = await client.query(eventQuery, [userId, timeRange.start, timeRange.end]);
      client.release();

      const eventBreakdown: Record<string, number> = {};
      let totalEvents = 0;

      for (const row of eventResult.rows) {
        eventBreakdown[row.event_type] = parseInt(row.count);
        totalEvents += parseInt(row.count);
      }

      // Calculate collaboration metrics
      const collaborationMetrics = await this.calculateCollaborationMetrics(userId, sessionIds);
      
      // Analyze behavior patterns
      const behaviorPatterns = await this.analyzeBehaviorPatterns(userId, sessionIds, timeRange);

      return {
        userId,
        timeRange,
        sessions: sessionIds,
        totalEvents,
        eventBreakdown,
        collaborationMetrics,
        behaviorPatterns
      };

    } catch (error) {
      logger.error(`Failed to get participant activity for user ${userId}`, {
        userId,
        timeRange,
        error: error.message
      });
      throw error;
    }
  }

  async generateAuditTrail(sessionId: string): Promise<AuditTrail> {
    try {
      const session = await this.reconstructSession(sessionId);
      const timeline = await this.getSessionTimeline(sessionId);
      
      const auditTimelineEntries: AuditTimelineEntry[] = timeline.timelineEntries.map(entry => ({
        timestamp: entry.timestamp,
        eventType: entry.eventType,
        userId: entry.userId,
        description: entry.description,
        impact: entry.impact,
        metadata: entry.details
      }));

      return {
        sessionId,
        events: timeline.events,
        participants: session.participants.map(p => p.userId),
        summary: {
          totalEvents: session.metadata.totalEvents,
          eventTypes: session.metadata.eventTypes,
          duration: session.duration || 0,
          conflicts: session.metadata.conflictCount,
          resolutions: session.metadata.resolutionCount
        },
        timeline: auditTimelineEntries
      };

    } catch (error) {
      logger.error(`Failed to generate audit trail for session ${sessionId}`, {
        sessionId,
        error: error.message
      });
      throw error;
    }
  }

  private async buildSessionFromEvents(sessionId: string, events: DomainEvent[]): Promise<CollaborationSession> {
    // Initialize session with defaults
    let session: CollaborationSession = {
      sessionId,
      workspaceId: '',
      sessionType: 'search',
      status: 'active',
      configuration: {},
      participants: [],
      timeline: [],
      conflicts: [],
      annotations: [],
      searchActivity: {
        totalQueries: 0,
        uniqueQueries: 0,
        averageQueryLength: 0,
        mostCommonTerms: [],
        queryEvolution: [],
        resultsSelected: 0,
        filtersApplied: 0,
        facetsUsed: []
      },
      workflows: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: {
        totalEvents: events.length,
        eventTypes: {},
        participantCount: 0,
        conflictCount: 0,
        resolutionCount: 0,
        annotationCount: 0
      }
    };

    // Process events in chronological order
    for (const event of events) {
      session = await this.applyEventToSession(session, event);
      
      // Count event types
      session.metadata.eventTypes[event.eventType] = 
        (session.metadata.eventTypes[event.eventType] || 0) + 1;
    }

    // Calculate derived properties
    session.metadata.participantCount = session.participants.length;
    session.metadata.conflictCount = session.conflicts.length;
    session.metadata.resolutionCount = session.conflicts.filter(c => c.status === 'resolved').length;
    session.metadata.annotationCount = session.annotations.length;

    if (session.endedAt) {
      session.duration = session.endedAt.getTime() - session.createdAt.getTime();
    }

    return session;
  }

  private async applyEventToSession(session: CollaborationSession, event: DomainEvent): Promise<CollaborationSession> {
    const collaborationEvent = event as CollaborationEvent;
    
    // Create timeline entry
    const timelineEntry = this.createTimelineEntry(event);
    session.timeline.push(timelineEntry);

    switch (event.eventType) {
      case COLLABORATION_EVENT_TYPES.SESSION_STARTED:
        return this.applySessionStartedEvent(session, collaborationEvent as any);
      
      case COLLABORATION_EVENT_TYPES.SESSION_ENDED:
        return this.applySessionEndedEvent(session, collaborationEvent as any);
      
      case COLLABORATION_EVENT_TYPES.SESSION_PAUSED:
        return this.applySessionPausedEvent(session, collaborationEvent as any);
      
      case COLLABORATION_EVENT_TYPES.SESSION_RESUMED:
        return this.applySessionResumedEvent(session, collaborationEvent as any);
      
      case COLLABORATION_EVENT_TYPES.PARTICIPANT_JOINED:
        return this.applyParticipantJoinedEvent(session, collaborationEvent as any);
      
      case COLLABORATION_EVENT_TYPES.PARTICIPANT_LEFT:
        return this.applyParticipantLeftEvent(session, collaborationEvent as any);
      
      case COLLABORATION_EVENT_TYPES.CONFLICT_DETECTED:
        return this.applyConflictDetectedEvent(session, collaborationEvent as any);
      
      case COLLABORATION_EVENT_TYPES.CONFLICT_RESOLVED:
        return this.applyConflictResolvedEvent(session, collaborationEvent as any);
      
      case COLLABORATION_EVENT_TYPES.ANNOTATION_CREATED:
        return this.applyAnnotationCreatedEvent(session, collaborationEvent as any);
      
      case COLLABORATION_EVENT_TYPES.SEARCH_QUERY_CHANGED:
        return this.applySearchQueryChangedEvent(session, collaborationEvent as any);
      
      default:
        // Handle other events generically
        session.updatedAt = event.timestamp;
        return session;
    }
  }

  private applySessionStartedEvent(session: CollaborationSession, event: any): CollaborationSession {
    session.workspaceId = event.eventData.workspaceId;
    session.sessionType = event.eventData.sessionType;
    session.configuration = event.eventData.configuration;
    session.createdAt = event.timestamp;
    session.updatedAt = event.timestamp;
    session.status = 'active';
    return session;
  }

  private applySessionEndedEvent(session: CollaborationSession, event: any): CollaborationSession {
    session.status = 'ended';
    session.endedAt = event.timestamp;
    session.updatedAt = event.timestamp;
    return session;
  }

  private applySessionPausedEvent(session: CollaborationSession, event: any): CollaborationSession {
    session.status = 'paused';
    session.updatedAt = event.timestamp;
    return session;
  }

  private applySessionResumedEvent(session: CollaborationSession, event: any): CollaborationSession {
    session.status = 'active';
    session.updatedAt = event.timestamp;
    return session;
  }

  private applyParticipantJoinedEvent(session: CollaborationSession, event: any): CollaborationSession {
    const participant: SessionParticipant = {
      userId: event.eventData.participantId,
      role: event.eventData.role,
      permissions: event.eventData.permissions,
      joinedAt: event.timestamp,
      isActive: true,
      activitySummary: {
        eventsGenerated: 1,
        searchQueries: 0,
        annotationsCreated: 0,
        conflictsResolved: 0,
        lastActivity: event.timestamp
      }
    };

    session.participants.push(participant);
    session.updatedAt = event.timestamp;
    return session;
  }

  private applyParticipantLeftEvent(session: CollaborationSession, event: any): CollaborationSession {
    const participant = session.participants.find(p => p.userId === event.eventData.participantId);
    if (participant) {
      participant.leftAt = event.timestamp;
      participant.isActive = false;
    }
    session.updatedAt = event.timestamp;
    return session;
  }

  private applyConflictDetectedEvent(session: CollaborationSession, event: any): CollaborationSession {
    const conflict: ConflictSummary = {
      conflictId: event.eventData.conflictId,
      conflictType: event.eventData.conflictType,
      contentId: event.eventData.contentId,
      severity: event.eventData.severity,
      status: 'open',
      participants: event.eventData.participants,
      detectedAt: event.timestamp
    };

    session.conflicts.push(conflict);
    session.updatedAt = event.timestamp;
    return session;
  }

  private applyConflictResolvedEvent(session: CollaborationSession, event: any): CollaborationSession {
    const conflict = session.conflicts.find(c => c.conflictId === event.eventData.conflictId);
    if (conflict) {
      conflict.status = 'resolved';
      conflict.resolvedAt = event.timestamp;
      conflict.resolutionStrategy = event.eventData.resolution.strategy;
      conflict.resolutionTime = event.timestamp.getTime() - conflict.detectedAt.getTime();
    }

    // Update participant activity
    const participant = session.participants.find(p => p.userId === event.eventData.resolution.resolvedBy);
    if (participant) {
      participant.activitySummary.conflictsResolved++;
      participant.activitySummary.lastActivity = event.timestamp;
    }

    session.updatedAt = event.timestamp;
    return session;
  }

  private applyAnnotationCreatedEvent(session: CollaborationSession, event: any): CollaborationSession {
    const annotation: AnnotationSummary = {
      annotationId: event.eventData.annotationId,
      userId: event.eventData.userId,
      contentId: event.eventData.contentId,
      annotationType: event.eventData.annotation.type,
      status: 'active',
      createdAt: event.timestamp,
      tags: event.eventData.annotation.tags,
      priority: event.eventData.annotation.priority
    };

    session.annotations.push(annotation);

    // Update participant activity
    const participant = session.participants.find(p => p.userId === event.eventData.userId);
    if (participant) {
      participant.activitySummary.annotationsCreated++;
      participant.activitySummary.lastActivity = event.timestamp;
    }

    session.updatedAt = event.timestamp;
    return session;
  }

  private applySearchQueryChangedEvent(session: CollaborationSession, event: any): CollaborationSession {
    session.searchActivity.totalQueries++;
    
    session.searchActivity.queryEvolution.push({
      timestamp: event.timestamp,
      query: event.eventData.newQuery,
      userId: event.eventData.userId,
      changeType: event.eventData.changeType
    });

    // Update participant activity
    const participant = session.participants.find(p => p.userId === event.eventData.userId);
    if (participant) {
      participant.activitySummary.searchQueries++;
      participant.activitySummary.lastActivity = event.timestamp;
    }

    session.updatedAt = event.timestamp;
    return session;
  }

  private createTimelineEntry(event: DomainEvent): SessionTimelineEntry {
    return {
      timestamp: event.timestamp,
      eventType: event.eventType,
      eventId: event.id,
      userId: event.metadata.userId,
      description: this.generateEventDescription(event),
      impact: this.assessEventImpact(event),
      details: event.eventData,
      causationChain: event.causationId ? [event.causationId] : undefined
    };
  }

  private generateEventDescription(event: DomainEvent): string {
    // Generate human-readable descriptions based on event type
    switch (event.eventType) {
      case COLLABORATION_EVENT_TYPES.SESSION_STARTED:
        return `Session started by ${event.metadata.userId}`;
      case COLLABORATION_EVENT_TYPES.PARTICIPANT_JOINED:
        return `${(event.eventData as any).participantId} joined as ${(event.eventData as any).role}`;
      case COLLABORATION_EVENT_TYPES.CONFLICT_DETECTED:
        return `Conflict detected: ${(event.eventData as any).conflictType}`;
      case COLLABORATION_EVENT_TYPES.ANNOTATION_CREATED:
        return `Annotation created: ${(event.eventData as any).annotation.type}`;
      default:
        return `${event.eventType.replace(/\./g, ' ').replace(/_/g, ' ')}`;
    }
  }

  private assessEventImpact(event: DomainEvent): 'low' | 'medium' | 'high' {
    // Assess the impact of events on the collaboration session
    if (event.eventType.includes('conflict') || event.eventType.includes('error')) {
      return 'high';
    }
    if (event.eventType.includes('session') || event.eventType.includes('workflow')) {
      return 'medium';
    }
    return 'low';
  }

  private identifyKeyMilestones(events: DomainEvent[]): Array<{ timestamp: Date; milestone: string; description: string; relatedEvents: string[] }> {
    const milestones: Array<{ timestamp: Date; milestone: string; description: string; relatedEvents: string[] }> = [];

    for (const event of events) {
      if ([
        COLLABORATION_EVENT_TYPES.SESSION_STARTED,
        COLLABORATION_EVENT_TYPES.SESSION_ENDED,
        COLLABORATION_EVENT_TYPES.CONFLICT_RESOLVED,
        COLLABORATION_EVENT_TYPES.WORKFLOW_COMPLETED
      ].includes(event.eventType as any)) {
        milestones.push({
          timestamp: event.timestamp,
          milestone: event.eventType,
          description: this.generateEventDescription(event),
          relatedEvents: [event.id]
        });
      }
    }

    return milestones;
  }

  private groupActivitiesByParticipant(events: DomainEvent[]) {
    const participantActivities: Record<string, Array<{ timestamp: Date; activity: string; eventId: string }>> = {};

    for (const event of events) {
      const userId = event.metadata.userId;
      if (userId) {
        if (!participantActivities[userId]) {
          participantActivities[userId] = [];
        }
        participantActivities[userId].push({
          timestamp: event.timestamp,
          activity: this.generateEventDescription(event),
          eventId: event.id
        });
      }
    }

    return Object.entries(participantActivities).map(([userId, activities]) => ({
      userId,
      activities
    }));
  }

  private async getSearchStateAtTime(sessionId: string, timestamp: Date): Promise<any> {
    // Implementation would reconstruct search state at specific time
    return {
      currentQuery: undefined,
      activeFilters: [],
      selectedFacets: []
    };
  }

  private async getWorkflowStatesAtTime(sessionId: string, timestamp: Date): Promise<any[]> {
    // Implementation would reconstruct workflow states at specific time
    return [];
  }

  private async calculateCollaborationMetrics(userId: string, sessionIds: string[]): Promise<any> {
    // Implementation would calculate detailed collaboration metrics
    return {
      sessionsInitiated: 0,
      sessionsJoined: sessionIds.length,
      conflictsCreated: 0,
      conflictsResolved: 0,
      annotationsCreated: 0,
      searchQueriesExecuted: 0,
      averageSessionDuration: 0
    };
  }

  private async analyzeBehaviorPatterns(userId: string, sessionIds: string[], timeRange: TimeRange): Promise<any> {
    // Implementation would analyze user behavior patterns
    return {
      mostActiveHours: [9, 10, 11, 14, 15],
      preferredSessionTypes: ['search'],
      collaborationStyle: 'participant',
      conflictResolutionApproach: 'collaborative'
    };
  }

  /**
   * Invalidate cache when new events are added to a session
   */
  invalidateSessionCache(sessionId: string): void {
    const invalidated = this.cache.invalidateSession(sessionId);
    if (invalidated) {
      logger.debug('Session cache invalidated due to new events', { sessionId });
    }
  }

  /**
   * Get cache statistics for monitoring
   */
  getCacheStats() {
    return this.cache.getStats();
  }

  /**
   * Preload frequently accessed sessions into cache
   */
  async preloadFrequentSessions(sessionIds: string[]): Promise<void> {
    await this.cache.preloadFrequentSessions(sessionIds);
  }

  private getSessionStreamId(sessionId: string): string {
    return `collaboration_session:${sessionId}`;
  }
}