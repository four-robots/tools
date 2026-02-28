import { Kysely } from 'kysely';
import { EventEmitter } from 'events';
import {
  BehaviorEvent,
  BehaviorEventSchema,
  UserPrivacySettings,
  DeviceInfo,
} from '../../shared/types/user-behavior.js';
import { BehaviorTrackingConfig, ProcessingQueue } from './types.js';
import { SessionManager } from './utils/session-manager.js';
import { EventValidator } from './utils/event-validator.js';
import { DataAnonymizer } from './utils/data-anonymizer.js';
import { Logger } from '../../shared/utils/logger.js';

export class BehaviorTrackingService extends EventEmitter {
  private db: Kysely<any>;
  private config: BehaviorTrackingConfig;
  private sessionManager: SessionManager;
  private eventValidator: EventValidator;
  private dataAnonymizer: DataAnonymizer;
  private processingQueue: ProcessingQueue;
  private batchTimer?: NodeJS.Timeout;
  private logger: Logger;

  constructor(
    db: Kysely<any>,
    config: BehaviorTrackingConfig = {
      batchSize: 100,
      flushInterval: 5000,
      retryAttempts: 3,
      enableRealTimeProcessing: true,
      enablePrivacyMode: true,
      anonymizeIpAddresses: true,
      sessionTimeout: 30 * 60 * 1000, // 30 minutes
      maxEventsPerSession: 1000,
    }
  ) {
    super();
    this.db = db;
    this.config = config;
    this.sessionManager = new SessionManager(config.sessionTimeout);
    this.eventValidator = new EventValidator();
    this.dataAnonymizer = new DataAnonymizer();
    this.processingQueue = {
      events: [],
      patterns: [],
      predictions: [],
      insights: [],
    };
    this.logger = new Logger('BehaviorTrackingService');

    this.startBatchProcessor();
  }

  /**
   * Track a single behavior event
   */
  async trackEvent(event: Partial<BehaviorEvent>): Promise<void> {
    try {
      // Validate the event
      const validatedEvent = await this.eventValidator.validate(event);
      
      // Check privacy settings
      const privacySettings = await this.getUserPrivacySettings(validatedEvent.userId);
      if (!privacySettings?.behaviorTrackingEnabled) {
        this.logger.debug('Event tracking disabled for user', { userId: validatedEvent.userId });
        return;
      }

      // Check if event type is allowed
      if (privacySettings.eventTrackingTypes.length > 0 && 
          !privacySettings.eventTrackingTypes.includes(validatedEvent.eventType)) {
        this.logger.debug('Event type not allowed for user', { 
          userId: validatedEvent.userId, 
          eventType: validatedEvent.eventType 
        });
        return;
      }

      // Enhance event with session information
      const enrichedEvent = await this.enrichEventWithSession(validatedEvent);

      // Apply privacy settings
      const processedEvent = await this.applyPrivacySettings(enrichedEvent, privacySettings);

      // Add to processing queue
      if (this.config.enableRealTimeProcessing) {
        await this.processEventRealTime(processedEvent);
      } else {
        this.processingQueue.events.push(processedEvent);
      }

      // Emit event for real-time subscribers
      this.emit('event:tracked', processedEvent);

      this.logger.debug('Event tracked successfully', { 
        eventId: processedEvent.id,
        eventType: processedEvent.eventType,
        userId: processedEvent.userId 
      });

    } catch (error) {
      this.logger.error('Failed to track event', error, { event });
      throw error;
    }
  }

  /**
   * Track multiple events in batch
   */
  async trackEventsBatch(events: Partial<BehaviorEvent>[]): Promise<void> {
    try {
      const processedEvents = await Promise.all(
        events.map(event => this.trackEvent(event))
      );

      this.emit('batch:tracked', processedEvents);
      this.logger.info('Batch tracking completed', { count: events.length });

    } catch (error) {
      this.logger.error('Failed to track events batch', error, { count: events.length });
      throw error;
    }
  }

  /**
   * Get user's event history
   */
  async getUserEventHistory(
    userId: string,
    options: {
      limit?: number;
      offset?: number;
      eventTypes?: string[];
      dateRange?: { start: Date; end: Date };
    } = {}
  ): Promise<BehaviorEvent[]> {
    try {
      let query = this.db
        .selectFrom('user_behavior_events')
        .selectAll()
        .where('user_id', '=', userId)
        .orderBy('event_timestamp', 'desc');

      // Apply filters
      if (options.eventTypes && options.eventTypes.length > 0) {
        query = query.where('event_type', 'in', options.eventTypes);
      }

      if (options.dateRange) {
        query = query
          .where('event_timestamp', '>=', options.dateRange.start)
          .where('event_timestamp', '<=', options.dateRange.end);
      }

      // Apply pagination
      if (options.limit) {
        query = query.limit(options.limit);
      }
      if (options.offset) {
        query = query.offset(options.offset);
      }

      const results = await query.execute();
      return results.map(this.mapDbRowToBehaviorEvent);

    } catch (error) {
      this.logger.error('Failed to get user event history', error, { userId, options });
      throw error;
    }
  }

  /**
   * Get session events
   */
  async getSessionEvents(sessionId: string): Promise<BehaviorEvent[]> {
    try {
      const results = await this.db
        .selectFrom('user_behavior_events')
        .selectAll()
        .where('session_id', '=', sessionId)
        .orderBy('session_sequence', 'asc')
        .execute();

      return results.map(this.mapDbRowToBehaviorEvent);

    } catch (error) {
      this.logger.error('Failed to get session events', error, { sessionId });
      throw error;
    }
  }

  /**
   * Delete user's behavior data (GDPR compliance)
   */
  async deleteUserData(userId: string): Promise<void> {
    try {
      await this.db.transaction().execute(async (trx) => {
        // Delete behavior events
        await trx
          .deleteFrom('user_behavior_events')
          .where('user_id', '=', userId)
          .execute();

        // Delete patterns
        await trx
          .deleteFrom('user_search_patterns')
          .where('user_id', '=', userId)
          .execute();

        // Delete segments
        await trx
          .deleteFrom('user_behavior_segments')
          .where('user_id', '=', userId)
          .execute();

        // Delete predictions
        await trx
          .deleteFrom('user_behavior_predictions')
          .where('user_id', '=', userId)
          .execute();

        // Delete insights
        await trx
          .deleteFrom('user_behavior_insights')
          .where('user_id', '=', userId)
          .execute();

        // Delete privacy settings
        await trx
          .deleteFrom('user_privacy_settings')
          .where('user_id', '=', userId)
          .execute();
      });

      this.emit('user:dataDeleted', userId);
      this.logger.info('User behavior data deleted', { userId });

    } catch (error) {
      this.logger.error('Failed to delete user data', error, { userId });
      throw error;
    }
  }

  /**
   * Export user's behavior data (data portability)
   */
  async exportUserData(userId: string): Promise<any> {
    try {
      const [events, patterns, segments, predictions, insights, privacy] = await Promise.all([
        this.getUserEventHistory(userId),
        this.getUserPatterns(userId),
        this.getUserSegments(userId),
        this.getUserPredictions(userId),
        this.getUserInsights(userId),
        this.getUserPrivacySettings(userId),
      ]);

      const exportData = {
        userId,
        exportedAt: new Date(),
        events,
        patterns,
        segments,
        predictions,
        insights,
        privacy,
      };

      this.emit('user:dataExported', userId);
      this.logger.info('User behavior data exported', { userId });

      return exportData;

    } catch (error) {
      this.logger.error('Failed to export user data', error, { userId });
      throw error;
    }
  }

  /**
   * Get processing queue status
   */
  getQueueStatus(): ProcessingQueue & { size: number } {
    return {
      ...this.processingQueue,
      size: this.processingQueue.events.length +
            this.processingQueue.patterns.length +
            this.processingQueue.predictions.length +
            this.processingQueue.insights.length,
    };
  }

  /**
   * Flush processing queue immediately
   */
  async flushQueue(): Promise<void> {
    try {
      if (this.processingQueue.events.length > 0) {
        await this.processBatchEvents(this.processingQueue.events);
        this.processingQueue.events = [];
      }

      this.emit('queue:flushed');
      this.logger.debug('Processing queue flushed');

    } catch (error) {
      this.logger.error('Failed to flush processing queue', error);
      throw error;
    }
  }

  /**
   * Stop the service and cleanup resources
   */
  async stop(): Promise<void> {
    try {
      // Stop batch processor
      if (this.batchTimer) {
        clearInterval(this.batchTimer);
        this.batchTimer = undefined;
      }

      // Flush any remaining events
      await this.flushQueue();

      this.emit('service:stopped');
      this.logger.info('Behavior tracking service stopped');

    } catch (error) {
      this.logger.error('Failed to stop service', error);
      throw error;
    }
  }

  // Private methods

  private async enrichEventWithSession(event: BehaviorEvent): Promise<BehaviorEvent> {
    // Update session information
    const sessionInfo = this.sessionManager.updateSession(
      event.userId, 
      event.sessionId, 
      event.eventTimestamp
    );

    return {
      ...event,
      sessionSequence: sessionInfo.eventCount,
      pageSequence: event.pageSequence || 1,
    };
  }

  private async applyPrivacySettings(
    event: BehaviorEvent, 
    settings: UserPrivacySettings
  ): Promise<BehaviorEvent> {
    let processedEvent = { ...event };

    // Anonymize IP address if required
    if (this.config.anonymizeIpAddresses || settings.anonymizationPreference !== 'none') {
      processedEvent.ipAddress = this.dataAnonymizer.anonymizeIpAddress(event.ipAddress);
    }

    // Apply anonymization based on user preference
    if (settings.anonymizationPreference === 'full') {
      processedEvent = this.dataAnonymizer.anonymizeEvent(processedEvent);
    } else if (settings.anonymizationPreference === 'partial') {
      processedEvent = this.dataAnonymizer.partiallyAnonymizeEvent(processedEvent);
    }

    return processedEvent;
  }

  private async processEventRealTime(event: BehaviorEvent): Promise<void> {
    try {
      await this.storeEvent(event);
      this.emit('event:stored', event);

    } catch (error) {
      this.logger.error('Failed to process event in real-time', error, { eventId: event.id });
      // Fallback to queue
      this.processingQueue.events.push(event);
    }
  }

  private async processBatchEvents(events: BehaviorEvent[]): Promise<void> {
    try {
      await this.db.transaction().execute(async (trx) => {
        for (const event of events) {
          await this.storeEventInTransaction(trx, event);
        }
      });

      this.emit('batch:processed', events);
      this.logger.debug('Batch events processed', { count: events.length });

    } catch (error) {
      this.logger.error('Failed to process batch events', error, { count: events.length });
      throw error;
    }
  }

  private async storeEvent(event: BehaviorEvent): Promise<void> {
    await this.db
      .insertInto('user_behavior_events')
      .values(this.mapBehaviorEventToDbRow(event))
      .execute();
  }

  private async storeEventInTransaction(trx: any, event: BehaviorEvent): Promise<void> {
    await trx
      .insertInto('user_behavior_events')
      .values(this.mapBehaviorEventToDbRow(event))
      .execute();
  }

  private startBatchProcessor(): void {
    this.batchTimer = setInterval(() => {
      if (this.processingQueue.events.length >= this.config.batchSize) {
        this.flushQueue().catch(error => {
          this.logger.error('Batch processor flush failed', error);
        });
      }
    }, this.config.flushInterval);
  }

  private async getUserPrivacySettings(userId: string): Promise<UserPrivacySettings | null> {
    try {
      const result = await this.db
        .selectFrom('user_privacy_settings')
        .selectAll()
        .where('user_id', '=', userId)
        .executeTakeFirst();

      return result || null;

    } catch (error) {
      this.logger.error('Failed to get user privacy settings', error, { userId });
      return null;
    }
  }

  private async getUserPatterns(userId: string): Promise<any[]> {
    try {
      return await this.db
        .selectFrom('user_search_patterns')
        .selectAll()
        .where('user_id', '=', userId)
        .execute();
    } catch (error) {
      this.logger.error('Failed to get user patterns', error, { userId });
      return [];
    }
  }

  private async getUserSegments(userId: string): Promise<any[]> {
    try {
      return await this.db
        .selectFrom('user_behavior_segments')
        .selectAll()
        .where('user_id', '=', userId)
        .execute();
    } catch (error) {
      this.logger.error('Failed to get user segments', error, { userId });
      return [];
    }
  }

  private async getUserPredictions(userId: string): Promise<any[]> {
    try {
      return await this.db
        .selectFrom('user_behavior_predictions')
        .selectAll()
        .where('user_id', '=', userId)
        .execute();
    } catch (error) {
      this.logger.error('Failed to get user predictions', error, { userId });
      return [];
    }
  }

  private async getUserInsights(userId: string): Promise<any[]> {
    try {
      return await this.db
        .selectFrom('user_behavior_insights')
        .selectAll()
        .where('user_id', '=', userId)
        .execute();
    } catch (error) {
      this.logger.error('Failed to get user insights', error, { userId });
      return [];
    }
  }

  private mapDbRowToBehaviorEvent(row: any): BehaviorEvent {
    return {
      id: row.id,
      userId: row.user_id,
      sessionId: row.session_id,
      eventType: row.event_type,
      eventCategory: row.event_category,
      eventAction: row.event_action,
      searchQuery: row.search_query,
      searchContext: row.search_context,
      resultData: row.result_data,
      pageContext: row.page_context,
      eventTimestamp: row.event_timestamp,
      sessionSequence: row.session_sequence,
      pageSequence: row.page_sequence,
      userAgent: row.user_agent,
      ipAddress: row.ip_address,
      referrer: row.referrer,
      deviceInfo: row.device_info,
      responseTimeMs: row.response_time_ms,
      searchDurationMs: row.search_duration_ms,
      interactionDurationMs: row.interaction_duration_ms,
      createdAt: row.created_at,
    };
  }

  private mapBehaviorEventToDbRow(event: BehaviorEvent): any {
    return {
      id: event.id || crypto.randomUUID(),
      user_id: event.userId,
      session_id: event.sessionId,
      event_type: event.eventType,
      event_category: event.eventCategory,
      event_action: event.eventAction,
      search_query: event.searchQuery,
      search_context: event.searchContext,
      result_data: event.resultData,
      page_context: event.pageContext,
      event_timestamp: event.eventTimestamp,
      session_sequence: event.sessionSequence,
      page_sequence: event.pageSequence,
      user_agent: event.userAgent,
      ip_address: event.ipAddress,
      referrer: event.referrer,
      device_info: event.deviceInfo,
      response_time_ms: event.responseTimeMs,
      search_duration_ms: event.searchDurationMs,
      interaction_duration_ms: event.interactionDurationMs,
      created_at: event.createdAt || new Date(),
    };
  }
}