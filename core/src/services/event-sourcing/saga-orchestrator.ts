import { Pool } from 'pg';
import { 
  DomainEvent, 
  SagaInstance,
  EventSourcingError
} from '../../shared/types/event-sourcing';
import { 
  CollaborationEvent,
  COLLABORATION_EVENT_TYPES
} from '../../shared/types/collaboration-events';
import { EventBus } from './event-bus-service';
import { EventStore } from './event-store-service';
import { logger } from '../../utils/logger';
import { randomUUID } from 'crypto';

export interface SagaDefinition {
  sagaType: string;
  startingEvents: string[];
  stateTransitions: Record<string, SagaTransition>;
  initialize: (event: DomainEvent) => Promise<any>;
  compensate?: (sagaData: any, reason: string) => Promise<DomainEvent[]>;
  timeout?: number; // milliseconds
}

export interface SagaTransition {
  targetState: string;
  condition?: (event: DomainEvent, sagaData: any) => boolean;
  action: (event: DomainEvent, sagaData: any) => Promise<SagaActionResult>;
  compensationAction?: (sagaData: any, reason: string) => Promise<DomainEvent[]>;
}

export interface SagaActionResult {
  newSagaData: any;
  eventsToPublish?: DomainEvent[];
  commandsToExecute?: SagaCommand[];
  scheduleTimeout?: number;
  markCompleted?: boolean;
  markFailed?: boolean;
  compensate?: boolean;
}

export interface SagaCommand {
  commandType: string;
  targetService: string;
  payload: Record<string, unknown>;
  retryPolicy?: {
    maxRetries: number;
    backoffMs: number;
  };
}

export interface SagaTimeout {
  sagaId: string;
  sagaType: string;
  timeoutAt: Date;
  timeoutAction: string;
}

export class SagaOrchestrator {
  private readonly sagaDefinitions = new Map<string, SagaDefinition>();
  private readonly activeSagas = new Map<string, SagaInstance>();
  private readonly sagaTimeouts = new Map<string, NodeJS.Timeout>();
  private readonly cleanupInterval: NodeJS.Timeout;

  constructor(
    private readonly pool: Pool,
    private readonly eventBus: EventBus,
    private readonly eventStore: EventStore
  ) {
    this.registerBuiltInSagas();
    this.subscribeToEvents();
    this.loadActiveSagas();

    // Cleanup completed sagas periodically
    this.cleanupInterval = setInterval(() => {
      this.cleanupCompletedSagas().catch(error => {
        logger.error('Failed to cleanup completed sagas', { error: error.message });
      });
    }, 60 * 60 * 1000); // Every hour
  }

  registerSaga(definition: SagaDefinition): void {
    this.sagaDefinitions.set(definition.sagaType, definition);
    
    // Subscribe to starting events
    for (const eventType of definition.startingEvents) {
      this.eventBus.subscribe(eventType, async (event: DomainEvent) => {
        await this.handleStartingEvent(definition.sagaType, event);
      }, {
        subscriptionName: `saga_${definition.sagaType}_${eventType}`,
        retry: true
      });
    }

    logger.info(`Registered saga: ${definition.sagaType}`, {
      sagaType: definition.sagaType,
      startingEvents: definition.startingEvents
    });
  }

  async startSaga(sagaType: string, triggerEvent: DomainEvent, initialData?: any): Promise<string> {
    try {
      const definition = this.sagaDefinitions.get(sagaType);
      if (!definition) {
        throw new EventSourcingError(`Unknown saga type: ${sagaType}`, 'UNKNOWN_SAGA_TYPE', { sagaType });
      }

      const sagaId = randomUUID();
      const sagaData = initialData || await definition.initialize(triggerEvent);

      const sagaInstance: SagaInstance = {
        id: sagaId,
        sagaType,
        sagaData,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Persist saga
      await this.persistSaga(sagaInstance);
      this.activeSagas.set(sagaId, sagaInstance);

      // Set timeout if specified
      if (definition.timeout) {
        this.scheduleTimeout(sagaId, sagaType, definition.timeout);
      }

      logger.info(`Started saga: ${sagaType}`, {
        sagaId,
        sagaType,
        triggerEventType: triggerEvent.eventType
      });

      // Process the starting event
      await this.handleSagaEvent(sagaId, triggerEvent);

      return sagaId;

    } catch (error) {
      logger.error(`Failed to start saga ${sagaType}`, {
        sagaType,
        triggerEventId: triggerEvent.id,
        error: error.message
      });
      throw error;
    }
  }

  async completeSaga(sagaId: string, reason: string = 'completed'): Promise<void> {
    try {
      const saga = this.activeSagas.get(sagaId);
      if (!saga) {
        logger.warn(`Attempted to complete non-existent saga: ${sagaId}`, { sagaId });
        return;
      }

      saga.status = 'completed';
      saga.completedAt = new Date();
      saga.updatedAt = new Date();

      await this.persistSaga(saga);
      this.activeSagas.delete(sagaId);
      
      // Clear timeout
      if (this.sagaTimeouts.has(sagaId)) {
        clearTimeout(this.sagaTimeouts.get(sagaId)!);
        this.sagaTimeouts.delete(sagaId);
      }

      logger.info(`Completed saga: ${sagaId}`, {
        sagaId,
        sagaType: saga.sagaType,
        reason,
        duration: saga.completedAt.getTime() - saga.createdAt.getTime()
      });

    } catch (error) {
      logger.error(`Failed to complete saga ${sagaId}`, {
        sagaId,
        error: error.message
      });
      throw error;
    }
  }

  async failSaga(sagaId: string, reason: string, shouldCompensate: boolean = true): Promise<void> {
    try {
      const saga = this.activeSagas.get(sagaId);
      if (!saga) {
        logger.warn(`Attempted to fail non-existent saga: ${sagaId}`, { sagaId });
        return;
      }

      saga.status = 'failed';
      saga.completedAt = new Date();
      saga.updatedAt = new Date();

      // Execute compensation if needed
      if (shouldCompensate) {
        await this.compensateSaga(sagaId, reason);
      }

      await this.persistSaga(saga);
      this.activeSagas.delete(sagaId);

      // Clear timeout
      if (this.sagaTimeouts.has(sagaId)) {
        clearTimeout(this.sagaTimeouts.get(sagaId)!);
        this.sagaTimeouts.delete(sagaId);
      }

      logger.error(`Failed saga: ${sagaId}`, {
        sagaId,
        sagaType: saga.sagaType,
        reason,
        shouldCompensate
      });

    } catch (error) {
      logger.error(`Failed to fail saga ${sagaId}`, {
        sagaId,
        error: error.message
      });
      throw error;
    }
  }

  async getSaga(sagaId: string): Promise<SagaInstance | null> {
    // Check active sagas first
    const activeSaga = this.activeSagas.get(sagaId);
    if (activeSaga) {
      return activeSaga;
    }

    // Check database
    try {
      const client = await this.pool.connect();
      
      const result = await client.query(`
        SELECT id, saga_type, saga_data, status, created_at, updated_at, completed_at
        FROM saga_instances
        WHERE id = $1
      `, [sagaId]);

      client.release();

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        id: row.id,
        sagaType: row.saga_type,
        sagaData: JSON.parse(row.saga_data),
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        completedAt: row.completed_at
      };

    } catch (error) {
      logger.error(`Failed to get saga ${sagaId}`, {
        sagaId,
        error: error.message
      });
      throw error;
    }
  }

  async getActiveSagas(sagaType?: string): Promise<SagaInstance[]> {
    const activeSagas = Array.from(this.activeSagas.values());
    
    if (sagaType) {
      return activeSagas.filter(saga => saga.sagaType === sagaType);
    }
    
    return activeSagas;
  }

  private async handleStartingEvent(sagaType: string, event: DomainEvent): Promise<void> {
    try {
      // Check if saga should be started for this event
      const definition = this.sagaDefinitions.get(sagaType);
      if (!definition) {
        return;
      }

      // For some sagas, we may want to check if one already exists for this context
      const existingSagaId = await this.findExistingSaga(sagaType, event);
      
      if (existingSagaId) {
        // Process event for existing saga
        await this.handleSagaEvent(existingSagaId, event);
      } else {
        // Start new saga
        await this.startSaga(sagaType, event);
      }

    } catch (error) {
      logger.error(`Failed to handle starting event for saga ${sagaType}`, {
        sagaType,
        eventType: event.eventType,
        eventId: event.id,
        error: error.message
      });
    }
  }

  private async handleSagaEvent(sagaId: string, event: DomainEvent): Promise<void> {
    try {
      const saga = this.activeSagas.get(sagaId);
      if (!saga || saga.status !== 'active') {
        return;
      }

      const definition = this.sagaDefinitions.get(saga.sagaType);
      if (!definition) {
        logger.error(`No definition found for saga type: ${saga.sagaType}`, {
          sagaId,
          sagaType: saga.sagaType
        });
        return;
      }

      // Find matching transition
      const transition = this.findMatchingTransition(definition, event, saga.sagaData);
      if (!transition) {
        return;
      }

      // Execute transition action
      const result = await transition.action(event, saga.sagaData);

      // Update saga data
      saga.sagaData = result.newSagaData;
      saga.updatedAt = new Date();

      // Publish events if any
      if (result.eventsToPublish) {
        for (const eventToPublish of result.eventsToPublish) {
          await this.eventBus.publishEvent(eventToPublish);
        }
      }

      // Execute commands if any
      if (result.commandsToExecute) {
        for (const command of result.commandsToExecute) {
          await this.executeCommand(command);
        }
      }

      // Handle completion or failure
      if (result.markCompleted) {
        await this.completeSaga(sagaId, 'action_completed');
        return;
      }

      if (result.markFailed) {
        await this.failSaga(sagaId, 'action_failed', result.compensate !== false);
        return;
      }

      if (result.compensate) {
        await this.compensateSaga(sagaId, 'compensation_requested');
        return;
      }

      // Schedule timeout if specified
      if (result.scheduleTimeout) {
        this.scheduleTimeout(sagaId, saga.sagaType, result.scheduleTimeout);
      }

      // Persist updated saga
      await this.persistSaga(saga);

      logger.debug(`Processed event for saga`, {
        sagaId,
        sagaType: saga.sagaType,
        eventType: event.eventType,
        targetState: transition.targetState
      });

    } catch (error) {
      logger.error(`Failed to handle saga event`, {
        sagaId,
        eventType: event.eventType,
        eventId: event.id,
        error: error.message
      });

      // Fail the saga on unhandled errors
      await this.failSaga(sagaId, `Unhandled error: ${error.message}`, true);
    }
  }

  private async compensateSaga(sagaId: string, reason: string): Promise<void> {
    try {
      const saga = this.activeSagas.get(sagaId);
      if (!saga) {
        return;
      }

      const definition = this.sagaDefinitions.get(saga.sagaType);
      if (!definition?.compensate) {
        logger.warn(`No compensation action defined for saga type: ${saga.sagaType}`, {
          sagaId,
          sagaType: saga.sagaType
        });
        return;
      }

      // Execute compensation
      const compensationEvents = await definition.compensate(saga.sagaData, reason);
      
      // Publish compensation events
      for (const event of compensationEvents) {
        await this.eventBus.publishEvent(event);
      }

      logger.info(`Compensated saga: ${sagaId}`, {
        sagaId,
        sagaType: saga.sagaType,
        reason,
        compensationEvents: compensationEvents.length
      });

    } catch (error) {
      logger.error(`Failed to compensate saga ${sagaId}`, {
        sagaId,
        reason,
        error: error.message
      });
    }
  }

  private async executeCommand(command: SagaCommand): Promise<void> {
    try {
      logger.info(`Executing saga command: ${command.commandType}`, {
        commandType: command.commandType,
        targetService: command.targetService
      });

      // This is a placeholder - in a real implementation, you'd route commands
      // to appropriate services (e.g., via message queue, HTTP, etc.)
      
      // For now, we'll just log the command
      logger.info(`Command executed: ${command.commandType}`, {
        commandType: command.commandType,
        targetService: command.targetService,
        payload: command.payload
      });

    } catch (error) {
      logger.error(`Failed to execute command: ${command.commandType}`, {
        commandType: command.commandType,
        error: error.message
      });
      throw error;
    }
  }

  private findMatchingTransition(
    definition: SagaDefinition, 
    event: DomainEvent, 
    sagaData: any
  ): SagaTransition | null {
    for (const [eventType, transition] of Object.entries(definition.stateTransitions)) {
      if (event.eventType === eventType) {
        if (!transition.condition || transition.condition(event, sagaData)) {
          return transition;
        }
      }
    }
    return null;
  }

  private async findExistingSaga(sagaType: string, event: DomainEvent): Promise<string | null> {
    // This is a simplified implementation - in practice, you'd have more sophisticated
    // correlation logic based on the saga type and event data
    
    if (sagaType === 'session_timeout' && event.metadata.sessionId) {
      // Look for existing session timeout saga
      for (const [sagaId, saga] of this.activeSagas) {
        if (saga.sagaType === 'session_timeout' && 
            saga.sagaData.sessionId === event.metadata.sessionId) {
          return sagaId;
        }
      }
    }

    return null;
  }

  private scheduleTimeout(sagaId: string, sagaType: string, timeoutMs: number): void {
    // Clear existing timeout
    if (this.sagaTimeouts.has(sagaId)) {
      clearTimeout(this.sagaTimeouts.get(sagaId)!);
    }

    // Schedule new timeout
    const timeout = setTimeout(async () => {
      logger.warn(`Saga timeout reached: ${sagaId}`, {
        sagaId,
        sagaType,
        timeoutMs
      });

      await this.failSaga(sagaId, 'timeout', true);
    }, timeoutMs);

    this.sagaTimeouts.set(sagaId, timeout);
  }

  private async persistSaga(saga: SagaInstance): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      await client.query(`
        INSERT INTO saga_instances (id, saga_type, saga_data, status, created_at, updated_at, completed_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (id) 
        DO UPDATE SET 
          saga_data = EXCLUDED.saga_data,
          status = EXCLUDED.status,
          updated_at = EXCLUDED.updated_at,
          completed_at = EXCLUDED.completed_at
      `, [
        saga.id,
        saga.sagaType,
        JSON.stringify(saga.sagaData),
        saga.status,
        saga.createdAt,
        saga.updatedAt,
        saga.completedAt || null
      ]);

    } finally {
      client.release();
    }
  }

  private async loadActiveSagas(): Promise<void> {
    try {
      const client = await this.pool.connect();
      
      const result = await client.query(`
        SELECT id, saga_type, saga_data, status, created_at, updated_at, completed_at
        FROM saga_instances
        WHERE status = 'active'
      `);

      client.release();

      for (const row of result.rows) {
        const saga: SagaInstance = {
          id: row.id,
          sagaType: row.saga_type,
          sagaData: JSON.parse(row.saga_data),
          status: row.status,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          completedAt: row.completed_at
        };

        this.activeSagas.set(saga.id, saga);

        // Restore timeout if needed
        const definition = this.sagaDefinitions.get(saga.sagaType);
        if (definition?.timeout) {
          const elapsed = Date.now() - saga.updatedAt.getTime();
          const remaining = definition.timeout - elapsed;
          
          if (remaining > 0) {
            this.scheduleTimeout(saga.id, saga.sagaType, remaining);
          } else {
            // Saga has already timed out
            await this.failSaga(saga.id, 'timeout_on_startup', true);
          }
        }
      }

      logger.info(`Loaded ${result.rows.length} active sagas`, {
        activeSagaCount: result.rows.length
      });

    } catch (error) {
      logger.error('Failed to load active sagas', { error: error.message });
    }
  }

  private async cleanupCompletedSagas(): Promise<void> {
    try {
      const client = await this.pool.connect();
      
      // Remove sagas completed more than 7 days ago
      const cleanupDate = new Date(Date.now() - (7 * 24 * 60 * 60 * 1000));
      
      const result = await client.query(`
        DELETE FROM saga_instances 
        WHERE status IN ('completed', 'failed', 'cancelled') 
        AND completed_at < $1
        RETURNING saga_type, count(*)
      `, [cleanupDate]);

      client.release();

      if (result.rows.length > 0) {
        logger.info('Cleaned up completed sagas', {
          removedSagas: result.rows.length,
          cleanupDate
        });
      }

    } catch (error) {
      logger.error('Failed to cleanup completed sagas', { error: error.message });
    }
  }

  private subscribeToEvents(): void {
    // Subscribe to all collaboration events for saga processing
    this.eventBus.subscribeToAll(
      async (event: DomainEvent) => {
        if (event.eventType.startsWith('collaboration.')) {
          // Find active sagas that might be interested in this event
          for (const [sagaId, saga] of this.activeSagas) {
            if (saga.status === 'active') {
              const definition = this.sagaDefinitions.get(saga.sagaType);
              if (definition && Object.keys(definition.stateTransitions).includes(event.eventType)) {
                await this.handleSagaEvent(sagaId, event);
              }
            }
          }
        }
      },
      {
        subscriptionName: 'saga_orchestrator_global',
        eventTypeFilter: Object.values(COLLABORATION_EVENT_TYPES)
      }
    );
  }

  private registerBuiltInSagas(): void {
    // Session Timeout Saga
    this.registerSaga({
      sagaType: 'session_timeout',
      startingEvents: [COLLABORATION_EVENT_TYPES.SESSION_STARTED],
      timeout: 30 * 60 * 1000, // 30 minutes
      initialize: async (event: DomainEvent) => ({
        sessionId: (event as any).eventData.sessionId,
        workspaceId: (event as any).eventData.workspaceId,
        warningsSent: 0,
        lastActivity: event.timestamp
      }),
      stateTransitions: {
        [COLLABORATION_EVENT_TYPES.PARTICIPANT_JOINED]: {
          targetState: 'active',
          action: async (event, sagaData) => ({
            newSagaData: {
              ...sagaData,
              lastActivity: event.timestamp
            }
          })
        },
        [COLLABORATION_EVENT_TYPES.SEARCH_QUERY_CHANGED]: {
          targetState: 'active',
          action: async (event, sagaData) => ({
            newSagaData: {
              ...sagaData,
              lastActivity: event.timestamp
            }
          })
        },
        [COLLABORATION_EVENT_TYPES.SESSION_ENDED]: {
          targetState: 'completed',
          action: async (event, sagaData) => ({
            newSagaData: sagaData,
            markCompleted: true
          })
        }
      },
      compensate: async (sagaData, reason) => {
        // Send session timeout notification
        return [{
          id: randomUUID(),
          streamId: `collaboration_session:${sagaData.sessionId}`,
          eventType: 'collaboration.session.timeout_warning',
          eventVersion: 1,
          eventData: {
            sessionId: sagaData.sessionId,
            reason,
            warningsSent: sagaData.warningsSent
          },
          metadata: {
            source: 'saga_orchestrator',
            version: '1.0.0',
            sessionId: sagaData.sessionId,
            workspaceId: sagaData.workspaceId
          },
          timestamp: new Date(),
          sequenceNumber: 0, // Will be set by event store
          correlationId: randomUUID()
        }];
      }
    });

    // Conflict Escalation Saga
    this.registerSaga({
      sagaType: 'conflict_escalation',
      startingEvents: [COLLABORATION_EVENT_TYPES.CONFLICT_DETECTED],
      timeout: 10 * 60 * 1000, // 10 minutes to resolve
      initialize: async (event: DomainEvent) => ({
        conflictId: (event as any).eventData.conflictId,
        sessionId: (event as any).eventData.sessionId,
        severity: (event as any).eventData.severity,
        participants: (event as any).eventData.participants,
        escalationLevel: 0,
        detectedAt: event.timestamp
      }),
      stateTransitions: {
        [COLLABORATION_EVENT_TYPES.CONFLICT_RESOLVED]: {
          targetState: 'resolved',
          condition: (event, sagaData) => 
            (event as any).eventData.conflictId === sagaData.conflictId,
          action: async (event, sagaData) => ({
            newSagaData: sagaData,
            markCompleted: true
          })
        }
      },
      compensate: async (sagaData, reason) => {
        // Escalate the conflict
        return [{
          id: randomUUID(),
          streamId: `collaboration_session:${sagaData.sessionId}`,
          eventType: COLLABORATION_EVENT_TYPES.CONFLICT_ESCALATED,
          eventVersion: 1,
          eventData: {
            conflictId: sagaData.conflictId,
            sessionId: sagaData.sessionId,
            escalatedBy: 'system',
            reason: reason,
            newSeverity: sagaData.severity === 'critical' ? 'critical' : 'high',
            notifiedUsers: sagaData.participants
          },
          metadata: {
            source: 'saga_orchestrator',
            version: '1.0.0',
            sessionId: sagaData.sessionId
          },
          timestamp: new Date(),
          sequenceNumber: 0,
          correlationId: randomUUID()
        }];
      }
    });

    // User Inactivity Notification Saga
    this.registerSaga({
      sagaType: 'user_inactivity',
      startingEvents: [COLLABORATION_EVENT_TYPES.PARTICIPANT_JOINED],
      timeout: 15 * 60 * 1000, // 15 minutes of inactivity
      initialize: async (event: DomainEvent) => ({
        userId: (event as any).eventData.participantId,
        sessionId: (event as any).eventData.sessionId,
        lastActivity: event.timestamp,
        notificationsSent: 0
      }),
      stateTransitions: {
        // Reset inactivity timer on any user activity
        [COLLABORATION_EVENT_TYPES.SEARCH_QUERY_CHANGED]: {
          targetState: 'active',
          condition: (event, sagaData) => 
            (event as any).eventData.userId === sagaData.userId,
          action: async (event, sagaData) => ({
            newSagaData: {
              ...sagaData,
              lastActivity: event.timestamp
            },
            scheduleTimeout: 15 * 60 * 1000 // Reset timer
          })
        },
        [COLLABORATION_EVENT_TYPES.ANNOTATION_CREATED]: {
          targetState: 'active',
          condition: (event, sagaData) => 
            (event as any).eventData.userId === sagaData.userId,
          action: async (event, sagaData) => ({
            newSagaData: {
              ...sagaData,
              lastActivity: event.timestamp
            },
            scheduleTimeout: 15 * 60 * 1000
          })
        },
        [COLLABORATION_EVENT_TYPES.PARTICIPANT_LEFT]: {
          targetState: 'completed',
          condition: (event, sagaData) => 
            (event as any).eventData.participantId === sagaData.userId,
          action: async (event, sagaData) => ({
            newSagaData: sagaData,
            markCompleted: true
          })
        }
      },
      compensate: async (sagaData, reason) => {
        // Send inactivity notification
        return [{
          id: randomUUID(),
          streamId: `collaboration_session:${sagaData.sessionId}`,
          eventType: 'collaboration.participant.inactivity_warning',
          eventVersion: 1,
          eventData: {
            userId: sagaData.userId,
            sessionId: sagaData.sessionId,
            inactiveDuration: Date.now() - sagaData.lastActivity.getTime(),
            notificationsSent: sagaData.notificationsSent + 1
          },
          metadata: {
            source: 'saga_orchestrator',
            version: '1.0.0',
            sessionId: sagaData.sessionId,
            userId: sagaData.userId
          },
          timestamp: new Date(),
          sequenceNumber: 0,
          correlationId: randomUUID()
        }];
      }
    });
  }

  async close(): Promise<void> {
    clearInterval(this.cleanupInterval);
    
    // Clear all timeouts
    for (const timeout of this.sagaTimeouts.values()) {
      clearTimeout(timeout);
    }
    
    this.sagaDefinitions.clear();
    this.activeSagas.clear();
    this.sagaTimeouts.clear();
  }
}