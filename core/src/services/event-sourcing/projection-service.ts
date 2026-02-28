import { Pool } from 'pg';
import { 
  DomainEvent, 
  EventProjection,
  EventHandler,
  EventSourcingError
} from '../../shared/types/event-sourcing';
import { 
  CollaborationEvent,
  COLLABORATION_EVENT_TYPES,
  SessionStartedEvent,
  ParticipantJoinedEvent,
  SearchQueryChangedEvent,
  AnnotationCreatedEvent,
  ConflictDetectedEvent,
  ConflictResolvedEvent
} from '../../shared/types/collaboration-events';
import { EventBus } from './event-bus-service';
import { EventStore } from './event-store-service';
import { logger } from '../../utils/logger';

export interface ProjectionHandler {
  projectionName: string;
  eventTypes: string[];
  handler: (event: DomainEvent, currentProjection?: any) => Promise<any>;
  initialize?: () => Promise<any>;
  shouldRebuild?: (event: DomainEvent, projection: any) => boolean;
}

export interface ProjectionConfig {
  batchSize: number;
  checkpointInterval: number;
  rebuildThresholdHours: number;
  enableParallelProcessing: boolean;
  maxConcurrentProjections: number;
}

export interface ActiveSessionProjection {
  sessionId: string;
  workspaceId: string;
  sessionType: string;
  status: 'active' | 'paused' | 'ended';
  participantCount: number;
  participants: Array<{
    userId: string;
    role: string;
    joinedAt: Date;
    isActive: boolean;
  }>;
  startedAt: Date;
  lastActivity: Date;
  conflictCount: number;
  annotationCount: number;
  searchQueries: number;
}

export interface SearchCollaborationProjection {
  sessionId: string;
  currentQuery: string;
  queryHistory: Array<{
    query: string;
    userId: string;
    timestamp: Date;
    changeType: string;
  }>;
  collaborativeQueryBuilder: {
    contributors: string[];
    iterations: number;
    consensusQuery?: string;
  };
  searchResults: Array<{
    resultId: string;
    selectedBy: string[];
    selectionCount: number;
  }>;
  filters: Array<{
    type: string;
    value: unknown;
    appliedBy: string;
    timestamp: Date;
  }>;
  facets: Record<string, Array<{
    value: string;
    selectedBy: string[];
  }>>;
}

export interface AnnotationProjection {
  contentId: string;
  annotations: Array<{
    annotationId: string;
    userId: string;
    type: string;
    content: string;
    position: { start: number; end: number };
    status: 'active' | 'resolved' | 'archived';
    tags: string[];
    priority: 'low' | 'medium' | 'high';
    createdAt: Date;
    resolvedAt?: Date;
    responses: Array<{
      userId: string;
      content: string;
      timestamp: Date;
    }>;
  }>;
  annotationsByUser: Record<string, number>;
  resolutionRate: number;
  averageResolutionTime: number;
  mostUsedTags: Array<{ tag: string; count: number }>;
}

export interface ConflictResolutionProjection {
  sessionId: string;
  conflicts: Array<{
    conflictId: string;
    conflictType: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    status: 'open' | 'in_progress' | 'resolved' | 'escalated';
    participants: string[];
    detectedAt: Date;
    resolvedAt?: Date;
    resolutionStrategy?: string;
    resolutionTime?: number;
  }>;
  resolutionMetrics: {
    averageResolutionTime: number;
    resolutionSuccessRate: number;
    escalationRate: number;
    mostCommonConflictType: string;
    mostEffectiveStrategy: string;
  };
  participantContributions: Record<string, {
    conflictsResolved: number;
    averageResolutionTime: number;
    preferredStrategy: string;
    successRate: number;
  }>;
}

export class ProjectionService {
  private readonly projectionHandlers = new Map<string, ProjectionHandler>();
  private readonly runningProjections = new Set<string>();
  private readonly config: ProjectionConfig;
  private readonly cleanupInterval: NodeJS.Timeout;

  constructor(
    private readonly pool: Pool,
    private readonly eventBus: EventBus,
    private readonly eventStore: EventStore,
    config: Partial<ProjectionConfig> = {}
  ) {
    this.config = {
      batchSize: 1000,
      checkpointInterval: 10000,
      rebuildThresholdHours: 24,
      enableParallelProcessing: true,
      maxConcurrentProjections: 5,
      ...config
    };

    this.registerBuiltInProjections();
    this.subscribeToEvents();

    // Cleanup stale projections periodically
    this.cleanupInterval = setInterval(() => {
      this.cleanupStaleProjections().catch(error => {
        logger.error('Failed to cleanup stale projections', { error: error.message });
      });
    }, 60 * 60 * 1000); // Every hour
  }

  registerProjection(handler: ProjectionHandler): void {
    this.projectionHandlers.set(handler.projectionName, handler);
    
    // Subscribe to relevant events
    for (const eventType of handler.eventTypes) {
      this.eventBus.subscribe(eventType, async (event: DomainEvent) => {
        await this.processEventForProjection(handler.projectionName, event);
      }, {
        subscriptionName: `projection_${handler.projectionName}_${eventType}`,
        retry: true
      });
    }

    logger.info(`Registered projection: ${handler.projectionName}`, {
      projectionName: handler.projectionName,
      eventTypes: handler.eventTypes
    });
  }

  async getProjection(projectionName: string, streamId: string): Promise<EventProjection | null> {
    try {
      const client = await this.pool.connect();
      
      const result = await client.query(`
        SELECT id, projection_name, stream_id, last_processed_sequence, 
               projection_data, updated_at
        FROM event_projections
        WHERE projection_name = $1 AND stream_id = $2
      `, [projectionName, streamId]);

      client.release();

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        id: row.id,
        projectionName: row.projection_name,
        streamId: row.stream_id,
        lastProcessedSequence: parseInt(row.last_processed_sequence),
        projectionData: JSON.parse(row.projection_data),
        updatedAt: row.updated_at
      };

    } catch (error) {
      logger.error(`Failed to get projection ${projectionName} for stream ${streamId}`, {
        projectionName,
        streamId,
        error: error.message
      });
      throw error;
    }
  }

  async getAllProjections(projectionName: string): Promise<EventProjection[]> {
    try {
      const client = await this.pool.connect();
      
      const result = await client.query(`
        SELECT id, projection_name, stream_id, last_processed_sequence,
               projection_data, updated_at
        FROM event_projections
        WHERE projection_name = $1
        ORDER BY updated_at DESC
      `, [projectionName]);

      client.release();

      return result.rows.map(row => ({
        id: row.id,
        projectionName: row.projection_name,
        streamId: row.stream_id,
        lastProcessedSequence: parseInt(row.last_processed_sequence),
        projectionData: JSON.parse(row.projection_data),
        updatedAt: row.updated_at
      }));

    } catch (error) {
      logger.error(`Failed to get all projections for ${projectionName}`, {
        projectionName,
        error: error.message
      });
      throw error;
    }
  }

  async rebuildProjection(projectionName: string, fromTime?: Date): Promise<void> {
    if (this.runningProjections.has(projectionName)) {
      logger.warn(`Projection ${projectionName} is already being rebuilt`, { projectionName });
      return;
    }

    this.runningProjections.add(projectionName);

    try {
      logger.info(`Starting rebuild of projection: ${projectionName}`, { 
        projectionName, 
        fromTime 
      });

      const handler = this.projectionHandlers.get(projectionName);
      if (!handler) {
        throw new EventSourcingError(`Unknown projection: ${projectionName}`, 'UNKNOWN_PROJECTION', { projectionName });
      }

      // Clear existing projections
      await this.clearProjection(projectionName);

      // Get all relevant events
      const events: DomainEvent[] = [];
      
      for (const eventType of handler.eventTypes) {
        const eventsByType = await this.eventStore.getEventsByType(eventType, fromTime);
        events.push(...eventsByType);
      }

      // Sort events by timestamp
      events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

      // Group events by stream
      const eventsByStream = new Map<string, DomainEvent[]>();
      for (const event of events) {
        if (!eventsByStream.has(event.streamId)) {
          eventsByStream.set(event.streamId, []);
        }
        eventsByStream.get(event.streamId)!.push(event);
      }

      // Process events for each stream
      let processedCount = 0;
      const totalStreams = eventsByStream.size;

      for (const [streamId, streamEvents] of eventsByStream) {
        let currentProjection = handler.initialize ? await handler.initialize() : {};

        for (const event of streamEvents) {
          currentProjection = await handler.handler(event, currentProjection);
        }

        // Save final projection
        if (streamEvents.length > 0) {
          await this.saveProjection(
            projectionName, 
            streamId, 
            currentProjection, 
            streamEvents[streamEvents.length - 1].sequenceNumber
          );
        }

        processedCount++;
        
        if (processedCount % 100 === 0) {
          logger.info(`Projection rebuild progress: ${processedCount}/${totalStreams} streams`, {
            projectionName,
            progress: Math.round((processedCount / totalStreams) * 100)
          });
        }
      }

      logger.info(`Projection rebuild completed: ${projectionName}`, {
        projectionName,
        streamsProcessed: totalStreams,
        eventsProcessed: events.length,
        duration: Date.now() - (fromTime?.getTime() || 0)
      });

    } catch (error) {
      logger.error(`Failed to rebuild projection ${projectionName}`, {
        projectionName,
        error: error.message
      });
      throw error;
    } finally {
      this.runningProjections.delete(projectionName);
    }
  }

  async deleteProjection(projectionName: string): Promise<void> {
    try {
      await this.clearProjection(projectionName);
      this.projectionHandlers.delete(projectionName);
      
      logger.info(`Deleted projection: ${projectionName}`, { projectionName });

    } catch (error) {
      logger.error(`Failed to delete projection ${projectionName}`, {
        projectionName,
        error: error.message
      });
      throw error;
    }
  }

  private async processEventForProjection(projectionName: string, event: DomainEvent): Promise<void> {
    try {
      const handler = this.projectionHandlers.get(projectionName);
      if (!handler) {
        logger.warn(`No handler found for projection: ${projectionName}`, { projectionName });
        return;
      }

      // Get current projection
      let currentProjection = await this.getProjection(projectionName, event.streamId);
      let projectionData = currentProjection?.projectionData || 
        (handler.initialize ? await handler.initialize() : {});

      // Check if we should skip this event (already processed)
      if (currentProjection && event.sequenceNumber <= currentProjection.lastProcessedSequence) {
        return;
      }

      // Check if projection should be rebuilt
      if (handler.shouldRebuild && handler.shouldRebuild(event, projectionData)) {
        logger.info(`Triggering projection rebuild due to event`, {
          projectionName,
          eventType: event.eventType,
          eventId: event.id
        });
        await this.rebuildProjection(projectionName);
        return;
      }

      // Process the event
      projectionData = await handler.handler(event, projectionData);

      // Save updated projection
      await this.saveProjection(projectionName, event.streamId, projectionData, event.sequenceNumber);

    } catch (error) {
      logger.error(`Failed to process event for projection ${projectionName}`, {
        projectionName,
        eventId: event.id,
        eventType: event.eventType,
        error: error.message
      });
      throw error;
    }
  }

  private async saveProjection(
    projectionName: string, 
    streamId: string, 
    projectionData: any, 
    lastProcessedSequence: number
  ): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      await client.query(`
        INSERT INTO event_projections (projection_name, stream_id, last_processed_sequence, projection_data)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (projection_name, stream_id) 
        DO UPDATE SET 
          last_processed_sequence = EXCLUDED.last_processed_sequence,
          projection_data = EXCLUDED.projection_data,
          updated_at = NOW()
      `, [projectionName, streamId, lastProcessedSequence, JSON.stringify(projectionData)]);

    } finally {
      client.release();
    }
  }

  private async clearProjection(projectionName: string): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      await client.query(`
        DELETE FROM event_projections 
        WHERE projection_name = $1
      `, [projectionName]);

    } finally {
      client.release();
    }
  }

  private async cleanupStaleProjections(): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      // Remove projections that haven't been updated in the threshold time
      const thresholdDate = new Date(Date.now() - (this.config.rebuildThresholdHours * 60 * 60 * 1000));
      
      const result = await client.query(`
        DELETE FROM event_projections 
        WHERE updated_at < $1
        RETURNING projection_name, count(*)
      `, [thresholdDate]);

      if (result.rows.length > 0) {
        logger.info('Cleaned up stale projections', {
          removedProjections: result.rows.length,
          thresholdDate
        });
      }

    } finally {
      client.release();
    }
  }

  private registerBuiltInProjections(): void {
    // Active Sessions Projection
    this.registerProjection({
      projectionName: 'active_sessions',
      eventTypes: [
        COLLABORATION_EVENT_TYPES.SESSION_STARTED,
        COLLABORATION_EVENT_TYPES.SESSION_ENDED,
        COLLABORATION_EVENT_TYPES.SESSION_PAUSED,
        COLLABORATION_EVENT_TYPES.SESSION_RESUMED,
        COLLABORATION_EVENT_TYPES.PARTICIPANT_JOINED,
        COLLABORATION_EVENT_TYPES.PARTICIPANT_LEFT
      ],
      initialize: async () => ({
        sessionId: null,
        workspaceId: null,
        sessionType: null,
        status: 'active',
        participantCount: 0,
        participants: [],
        startedAt: null,
        lastActivity: null,
        conflictCount: 0,
        annotationCount: 0,
        searchQueries: 0
      } as ActiveSessionProjection),
      handler: this.handleActiveSessionEvent.bind(this)
    });

    // Search Collaboration Projection
    this.registerProjection({
      projectionName: 'search_collaboration',
      eventTypes: [
        COLLABORATION_EVENT_TYPES.SEARCH_QUERY_CHANGED,
        COLLABORATION_EVENT_TYPES.SEARCH_RESULT_SELECTED,
        COLLABORATION_EVENT_TYPES.SEARCH_FILTER_APPLIED,
        COLLABORATION_EVENT_TYPES.SEARCH_FACET_SELECTED
      ],
      initialize: async () => ({
        sessionId: null,
        currentQuery: '',
        queryHistory: [],
        collaborativeQueryBuilder: {
          contributors: [],
          iterations: 0
        },
        searchResults: [],
        filters: [],
        facets: {}
      } as SearchCollaborationProjection),
      handler: this.handleSearchCollaborationEvent.bind(this)
    });

    // Annotation Projection
    this.registerProjection({
      projectionName: 'annotations',
      eventTypes: [
        COLLABORATION_EVENT_TYPES.ANNOTATION_CREATED,
        COLLABORATION_EVENT_TYPES.ANNOTATION_UPDATED,
        COLLABORATION_EVENT_TYPES.ANNOTATION_RESOLVED,
        COLLABORATION_EVENT_TYPES.ANNOTATION_DELETED
      ],
      initialize: async () => ({
        contentId: null,
        annotations: [],
        annotationsByUser: {},
        resolutionRate: 0,
        averageResolutionTime: 0,
        mostUsedTags: []
      } as AnnotationProjection),
      handler: this.handleAnnotationEvent.bind(this)
    });

    // Conflict Resolution Projection
    this.registerProjection({
      projectionName: 'conflict_resolution',
      eventTypes: [
        COLLABORATION_EVENT_TYPES.CONFLICT_DETECTED,
        COLLABORATION_EVENT_TYPES.CONFLICT_ESCALATED,
        COLLABORATION_EVENT_TYPES.CONFLICT_RESOLVED,
        COLLABORATION_EVENT_TYPES.CONFLICT_CANCELLED
      ],
      initialize: async () => ({
        sessionId: null,
        conflicts: [],
        resolutionMetrics: {
          averageResolutionTime: 0,
          resolutionSuccessRate: 0,
          escalationRate: 0,
          mostCommonConflictType: '',
          mostEffectiveStrategy: ''
        },
        participantContributions: {}
      } as ConflictResolutionProjection),
      handler: this.handleConflictResolutionEvent.bind(this)
    });
  }

  private subscribeToEvents(): void {
    // Subscribe to all collaboration events for projection processing
    this.eventBus.subscribeToAll(
      async (event: DomainEvent) => {
        if (event.eventType.startsWith('collaboration.')) {
          // Process event for all relevant projections
          for (const [projectionName, handler] of this.projectionHandlers) {
            if (handler.eventTypes.includes(event.eventType)) {
              await this.processEventForProjection(projectionName, event);
            }
          }
        }
      },
      {
        subscriptionName: 'projection_service_global',
        eventTypeFilter: Object.values(COLLABORATION_EVENT_TYPES)
      }
    );
  }

  private async handleActiveSessionEvent(event: DomainEvent, projection: ActiveSessionProjection): Promise<ActiveSessionProjection> {
    const collaborationEvent = event as CollaborationEvent;

    switch (event.eventType) {
      case COLLABORATION_EVENT_TYPES.SESSION_STARTED:
        const startedEvent = collaborationEvent as SessionStartedEvent;
        projection.sessionId = startedEvent.eventData.sessionId;
        projection.workspaceId = startedEvent.eventData.workspaceId;
        projection.sessionType = startedEvent.eventData.sessionType;
        projection.status = 'active';
        projection.startedAt = event.timestamp;
        projection.lastActivity = event.timestamp;
        break;

      case COLLABORATION_EVENT_TYPES.SESSION_ENDED:
        projection.status = 'ended';
        projection.lastActivity = event.timestamp;
        break;

      case COLLABORATION_EVENT_TYPES.PARTICIPANT_JOINED:
        const joinedEvent = collaborationEvent as ParticipantJoinedEvent;
        projection.participants.push({
          userId: joinedEvent.eventData.participantId,
          role: joinedEvent.eventData.role,
          joinedAt: event.timestamp,
          isActive: true
        });
        projection.participantCount = projection.participants.length;
        projection.lastActivity = event.timestamp;
        break;

      case COLLABORATION_EVENT_TYPES.PARTICIPANT_LEFT:
        const leftEvent = collaborationEvent as any;
        const participant = projection.participants.find(p => p.userId === leftEvent.eventData.participantId);
        if (participant) {
          participant.isActive = false;
        }
        projection.participantCount = projection.participants.filter(p => p.isActive).length;
        projection.lastActivity = event.timestamp;
        break;
    }

    return projection;
  }

  private async handleSearchCollaborationEvent(event: DomainEvent, projection: SearchCollaborationProjection): Promise<SearchCollaborationProjection> {
    const collaborationEvent = event as CollaborationEvent;

    switch (event.eventType) {
      case COLLABORATION_EVENT_TYPES.SEARCH_QUERY_CHANGED:
        const queryEvent = collaborationEvent as SearchQueryChangedEvent;
        projection.currentQuery = queryEvent.eventData.newQuery;
        
        projection.queryHistory.push({
          query: queryEvent.eventData.newQuery,
          userId: queryEvent.eventData.userId,
          timestamp: event.timestamp,
          changeType: queryEvent.eventData.changeType
        });

        // Update collaborative query builder
        if (!projection.collaborativeQueryBuilder.contributors.includes(queryEvent.eventData.userId)) {
          projection.collaborativeQueryBuilder.contributors.push(queryEvent.eventData.userId);
        }
        projection.collaborativeQueryBuilder.iterations++;
        break;

      case COLLABORATION_EVENT_TYPES.SEARCH_RESULT_SELECTED:
        const resultEvent = collaborationEvent as any;
        let result = projection.searchResults.find(r => r.resultId === resultEvent.eventData.resultId);
        if (!result) {
          result = {
            resultId: resultEvent.eventData.resultId,
            selectedBy: [],
            selectionCount: 0
          };
          projection.searchResults.push(result);
        }
        
        if (!result.selectedBy.includes(resultEvent.metadata.userId!)) {
          result.selectedBy.push(resultEvent.metadata.userId!);
          result.selectionCount++;
        }
        break;

      case COLLABORATION_EVENT_TYPES.SEARCH_FILTER_APPLIED:
        const filterEvent = collaborationEvent as any;
        projection.filters.push({
          type: filterEvent.eventData.filterType,
          value: filterEvent.eventData.filterValue,
          appliedBy: filterEvent.eventData.userId,
          timestamp: event.timestamp
        });
        break;
    }

    return projection;
  }

  private async handleAnnotationEvent(event: DomainEvent, projection: AnnotationProjection): Promise<AnnotationProjection> {
    const collaborationEvent = event as CollaborationEvent;

    switch (event.eventType) {
      case COLLABORATION_EVENT_TYPES.ANNOTATION_CREATED:
        const createdEvent = collaborationEvent as AnnotationCreatedEvent;
        projection.contentId = createdEvent.eventData.contentId;
        
        projection.annotations.push({
          annotationId: createdEvent.eventData.annotationId,
          userId: createdEvent.eventData.userId,
          type: createdEvent.eventData.annotation.type,
          content: createdEvent.eventData.annotation.content,
          position: createdEvent.eventData.annotation.position,
          status: 'active',
          tags: createdEvent.eventData.annotation.tags,
          priority: createdEvent.eventData.annotation.priority,
          createdAt: event.timestamp,
          responses: []
        });

        // Update user statistics
        projection.annotationsByUser[createdEvent.eventData.userId] = 
          (projection.annotationsByUser[createdEvent.eventData.userId] || 0) + 1;
        break;

      case COLLABORATION_EVENT_TYPES.ANNOTATION_RESOLVED:
        const resolvedEvent = collaborationEvent as any;
        const annotation = projection.annotations.find(a => a.annotationId === resolvedEvent.eventData.annotationId);
        if (annotation) {
          annotation.status = 'resolved';
          annotation.resolvedAt = event.timestamp;
        }
        
        // Recalculate resolution metrics
        const resolvedAnnotations = projection.annotations.filter(a => a.status === 'resolved');
        projection.resolutionRate = projection.annotations.length > 0
          ? resolvedAnnotations.length / projection.annotations.length
          : 0;
        
        if (resolvedAnnotations.length > 0) {
          const totalResolutionTime = resolvedAnnotations.reduce((sum, a) => {
            return sum + (a.resolvedAt!.getTime() - a.createdAt.getTime());
          }, 0);
          projection.averageResolutionTime = totalResolutionTime / resolvedAnnotations.length;
        }
        break;
    }

    return projection;
  }

  private async handleConflictResolutionEvent(event: DomainEvent, projection: ConflictResolutionProjection): Promise<ConflictResolutionProjection> {
    const collaborationEvent = event as CollaborationEvent;

    switch (event.eventType) {
      case COLLABORATION_EVENT_TYPES.CONFLICT_DETECTED:
        const detectedEvent = collaborationEvent as ConflictDetectedEvent;
        projection.sessionId = detectedEvent.eventData.sessionId;
        
        projection.conflicts.push({
          conflictId: detectedEvent.eventData.conflictId,
          conflictType: detectedEvent.eventData.conflictType,
          severity: detectedEvent.eventData.severity,
          status: 'open',
          participants: detectedEvent.eventData.participants,
          detectedAt: event.timestamp
        });
        break;

      case COLLABORATION_EVENT_TYPES.CONFLICT_RESOLVED:
        const resolvedEvent = collaborationEvent as ConflictResolvedEvent;
        const conflict = projection.conflicts.find(c => c.conflictId === resolvedEvent.eventData.conflictId);
        
        if (conflict) {
          conflict.status = 'resolved';
          conflict.resolvedAt = event.timestamp;
          conflict.resolutionStrategy = resolvedEvent.eventData.resolution.strategy;
          conflict.resolutionTime = event.timestamp.getTime() - conflict.detectedAt.getTime();

          // Update participant contributions
          const resolverUserId = resolvedEvent.eventData.resolution.resolvedBy;
          if (!projection.participantContributions[resolverUserId]) {
            projection.participantContributions[resolverUserId] = {
              conflictsResolved: 0,
              averageResolutionTime: 0,
              preferredStrategy: '',
              successRate: 0
            };
          }
          
          const contribution = projection.participantContributions[resolverUserId];
          contribution.conflictsResolved++;
          
          // Update average resolution time
          const userResolvedConflicts = projection.conflicts.filter(c => 
            c.status === 'resolved' && c.resolutionTime &&
            projection.participantContributions[resolverUserId]
          );
          
          if (userResolvedConflicts.length > 0) {
            const totalTime = userResolvedConflicts.reduce((sum, c) => sum + (c.resolutionTime || 0), 0);
            contribution.averageResolutionTime = totalTime / userResolvedConflicts.length;
          }
          
          contribution.preferredStrategy = resolvedEvent.eventData.resolution.strategy;
          contribution.successRate = userResolvedConflicts.length / 
            projection.conflicts.filter(c => c.participants.includes(resolverUserId)).length;
        }

        // Recalculate overall metrics
        const resolvedConflicts = projection.conflicts.filter(c => c.status === 'resolved');
        const totalConflicts = projection.conflicts.length;
        
        projection.resolutionMetrics.resolutionSuccessRate = resolvedConflicts.length / totalConflicts;
        projection.resolutionMetrics.escalationRate = 
          projection.conflicts.filter(c => c.status === 'escalated').length / totalConflicts;
        
        if (resolvedConflicts.length > 0) {
          const totalResolutionTime = resolvedConflicts.reduce((sum, c) => sum + (c.resolutionTime || 0), 0);
          projection.resolutionMetrics.averageResolutionTime = totalResolutionTime / resolvedConflicts.length;
        }
        break;
    }

    return projection;
  }

  async close(): Promise<void> {
    clearInterval(this.cleanupInterval);
    this.projectionHandlers.clear();
    this.runningProjections.clear();
  }
}