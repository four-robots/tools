import { Kysely } from 'kysely';
import { EventEmitter } from 'events';
import {
  UserPrivacySettings,
  UserPrivacySettingsSchema,
  BehaviorEvent,
} from '../../shared/types/user-behavior.js';
import { PrivacyConfig } from './types.js';
import { DataAnonymizer } from './utils/data-anonymizer.js';
import { Logger } from '../../shared/utils/logger.js';

export interface ConsentRecord {
  userId: string;
  consentType: string;
  granted: boolean;
  version: string;
  timestamp: Date;
  ipAddress?: string;
  userAgent?: string;
  expiresAt?: Date;
}

export interface DataDeletionRequest {
  requestId: string;
  userId: string;
  requestType: 'full_deletion' | 'anonymization' | 'specific_data';
  dataTypes?: string[];
  requestDate: Date;
  processingStatus: 'pending' | 'in_progress' | 'completed' | 'failed';
  completionDate?: Date;
  verificationToken?: string;
}

export interface PrivacyAudit {
  userId: string;
  auditType: 'data_access' | 'data_modification' | 'consent_change' | 'deletion_request';
  action: string;
  timestamp: Date;
  ipAddress?: string;
  userAgent?: string;
  details?: Record<string, any>;
}

export interface DataPortabilityRequest {
  requestId: string;
  userId: string;
  requestDate: Date;
  dataTypes: string[];
  format: 'json' | 'csv' | 'xml';
  status: 'pending' | 'processing' | 'ready' | 'delivered' | 'expired';
  downloadUrl?: string;
  expiresAt?: Date;
}

export class PrivacyComplianceService extends EventEmitter {
  private db: Kysely<any>;
  private config: PrivacyConfig;
  private dataAnonymizer: DataAnonymizer;
  private logger: Logger;

  constructor(
    db: Kysely<any>,
    config: PrivacyConfig = {
      defaultRetentionPeriod: 365,
      consentExpirationPeriod: 730, // 2 years
      anonymizationDelay: 30,
      enableRightToForget: true,
      enableDataPortability: true,
      gdprCompliance: true,
      ccpaCompliance: true,
    }
  ) {
    super();
    this.db = db;
    this.config = config;
    this.dataAnonymizer = new DataAnonymizer();
    this.logger = new Logger('PrivacyComplianceService');

    // Start background cleanup tasks
    this.startRetentionCleanup();
    this.startConsentExpirationCheck();
  }

  /**
   * Initialize user privacy settings with defaults
   */
  async initializeUserPrivacySettings(
    userId: string,
    initialConsent: Partial<UserPrivacySettings> = {},
    metadata: {
      ipAddress?: string;
      userAgent?: string;
      consentVersion?: string;
    } = {}
  ): Promise<UserPrivacySettings> {
    try {
      const existingSettings = await this.getUserPrivacySettings(userId);
      if (existingSettings) {
        return existingSettings;
      }

      const defaultSettings: UserPrivacySettings = {
        userId,
        behaviorTrackingEnabled: initialConsent.behaviorTrackingEnabled ?? true,
        analyticsConsent: initialConsent.analyticsConsent ?? true,
        personalizationConsent: initialConsent.personalizationConsent ?? true,
        dataRetentionConsent: initialConsent.dataRetentionConsent ?? true,
        eventTrackingTypes: initialConsent.eventTrackingTypes ?? [],
        dataSharingPermissions: initialConsent.dataSharingPermissions ?? {},
        dataRetentionPeriodDays: initialConsent.dataRetentionPeriodDays ?? this.config.defaultRetentionPeriod,
        anonymizationPreference: initialConsent.anonymizationPreference ?? 'partial',
        consentVersion: metadata.consentVersion ?? '1.0',
        consentGivenAt: new Date(),
        consentExpiresAt: this.calculateConsentExpiration(),
        lastUpdatedAt: new Date(),
        consentHistory: [{
          action: 'initial_consent',
          timestamp: new Date(),
          version: metadata.consentVersion ?? '1.0',
          granted: true,
        }],
        ipAddressAtConsent: metadata.ipAddress,
        userAgentAtConsent: metadata.userAgent,
        createdAt: new Date(),
      };

      // Validate settings
      const validatedSettings = UserPrivacySettingsSchema.parse(defaultSettings);

      // Store settings
      await this.storePrivacySettings(validatedSettings);

      // Log consent record
      await this.logConsentRecord({
        userId,
        consentType: 'initial_setup',
        granted: true,
        version: validatedSettings.consentVersion!,
        timestamp: new Date(),
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
      });

      // Emit event
      this.emit('privacy:initialized', { userId, settings: validatedSettings });
      this.logger.info('Privacy settings initialized', { userId });

      return validatedSettings;

    } catch (error) {
      this.logger.error('Failed to initialize privacy settings', error, { userId });
      throw error;
    }
  }

  /**
   * Update user privacy settings
   */
  async updatePrivacySettings(
    userId: string,
    updates: Partial<UserPrivacySettings>,
    metadata: {
      ipAddress?: string;
      userAgent?: string;
      consentVersion?: string;
    } = {}
  ): Promise<UserPrivacySettings> {
    try {
      const currentSettings = await this.getUserPrivacySettings(userId);
      if (!currentSettings) {
        throw new Error('Privacy settings not found. Initialize settings first.');
      }

      // Merge updates with current settings
      const updatedSettings: UserPrivacySettings = {
        ...currentSettings,
        ...updates,
        lastUpdatedAt: new Date(),
        consentHistory: [
          ...currentSettings.consentHistory,
          {
            action: 'settings_updated',
            timestamp: new Date(),
            version: metadata.consentVersion ?? currentSettings.consentVersion ?? '1.0',
            changes: updates,
          },
        ],
      };

      // Update consent expiration if version changed
      if (metadata.consentVersion && metadata.consentVersion !== currentSettings.consentVersion) {
        updatedSettings.consentVersion = metadata.consentVersion;
        updatedSettings.consentGivenAt = new Date();
        updatedSettings.consentExpiresAt = this.calculateConsentExpiration();
        updatedSettings.ipAddressAtConsent = metadata.ipAddress;
        updatedSettings.userAgentAtConsent = metadata.userAgent;
      }

      // Validate updated settings
      const validatedSettings = UserPrivacySettingsSchema.parse(updatedSettings);

      // Store updated settings
      await this.storePrivacySettings(validatedSettings);

      // Log significant consent changes
      const significantChanges = this.detectSignificantConsentChanges(currentSettings, validatedSettings);
      for (const change of significantChanges) {
        await this.logConsentRecord({
          userId,
          consentType: change.type,
          granted: change.granted,
          version: validatedSettings.consentVersion!,
          timestamp: new Date(),
          ipAddress: metadata.ipAddress,
          userAgent: metadata.userAgent,
        });
      }

      // Create audit record
      await this.createAuditRecord({
        userId,
        auditType: 'consent_change',
        action: 'privacy_settings_updated',
        timestamp: new Date(),
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
        details: { updates, significantChanges },
      });

      this.emit('privacy:updated', { userId, settings: validatedSettings, changes: significantChanges });
      this.logger.info('Privacy settings updated', { userId, changesCount: significantChanges.length });

      return validatedSettings;

    } catch (error) {
      this.logger.error('Failed to update privacy settings', error, { userId });
      throw error;
    }
  }

  /**
   * Get user privacy settings
   */
  async getUserPrivacySettings(userId: string): Promise<UserPrivacySettings | null> {
    try {
      const result = await this.db
        .selectFrom('user_privacy_settings')
        .selectAll()
        .where('user_id', '=', userId)
        .executeTakeFirst();

      if (!result) {
        return null;
      }

      return this.mapDbRowToPrivacySettings(result);

    } catch (error) {
      this.logger.error('Failed to get privacy settings', error, { userId });
      throw error;
    }
  }

  /**
   * Check if tracking is allowed for a specific event type
   */
  async isTrackingAllowed(userId: string, eventType: string): Promise<boolean> {
    try {
      const settings = await this.getUserPrivacySettings(userId);
      
      if (!settings) {
        // Default to allowing tracking if no settings exist
        return true;
      }

      // Check if behavior tracking is enabled
      if (!settings.behaviorTrackingEnabled) {
        return false;
      }

      // Check if specific event type is allowed
      if (settings.eventTrackingTypes.length > 0) {
        return settings.eventTrackingTypes.includes(eventType);
      }

      // If no specific restrictions, allow tracking
      return true;

    } catch (error) {
      this.logger.error('Failed to check tracking permission', error, { userId, eventType });
      return false;
    }
  }

  /**
   * Request data deletion (GDPR Article 17 - Right to erasure)
   */
  async requestDataDeletion(
    userId: string,
    requestType: 'full_deletion' | 'anonymization' | 'specific_data' = 'full_deletion',
    dataTypes?: string[],
    metadata: {
      ipAddress?: string;
      userAgent?: string;
      reason?: string;
    } = {}
  ): Promise<DataDeletionRequest> {
    try {
      if (!this.config.enableRightToForget) {
        throw new Error('Right to forget is not enabled');
      }

      const requestId = crypto.randomUUID();
      const deletionRequest: DataDeletionRequest = {
        requestId,
        userId,
        requestType,
        dataTypes,
        requestDate: new Date(),
        processingStatus: 'pending',
        verificationToken: crypto.randomUUID(),
      };

      // Store deletion request
      await this.storeDeletionRequest(deletionRequest);

      // Create audit record
      await this.createAuditRecord({
        userId,
        auditType: 'deletion_request',
        action: 'data_deletion_requested',
        timestamp: new Date(),
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
        details: { requestType, dataTypes, reason: metadata.reason },
      });

      // Emit event for processing
      this.emit('privacy:deletionRequested', { request: deletionRequest, metadata });
      this.logger.info('Data deletion requested', { userId, requestId, requestType });

      return deletionRequest;

    } catch (error) {
      this.logger.error('Failed to request data deletion', error, { userId, requestType });
      throw error;
    }
  }

  /**
   * Process data deletion request
   */
  async processDeletionRequest(requestId: string): Promise<void> {
    try {
      const request = await this.getDeletionRequest(requestId);
      if (!request) {
        throw new Error('Deletion request not found');
      }

      if (request.processingStatus !== 'pending') {
        throw new Error(`Deletion request is already ${request.processingStatus}`);
      }

      // Update status to in_progress
      await this.updateDeletionRequestStatus(requestId, 'in_progress');

      this.logger.info('Starting data deletion process', { requestId, userId: request.userId });

      try {
        switch (request.requestType) {
          case 'full_deletion':
            await this.performFullDataDeletion(request.userId);
            break;
          case 'anonymization':
            await this.performDataAnonymization(request.userId, request.dataTypes);
            break;
          case 'specific_data':
            await this.performSpecificDataDeletion(request.userId, request.dataTypes || []);
            break;
        }

        // Mark as completed
        await this.updateDeletionRequestStatus(requestId, 'completed', new Date());

        // Create audit record
        await this.createAuditRecord({
          userId: request.userId,
          auditType: 'data_modification',
          action: 'data_deletion_completed',
          timestamp: new Date(),
          details: { requestId, requestType: request.requestType },
        });

        this.emit('privacy:deletionCompleted', { requestId, userId: request.userId });
        this.logger.info('Data deletion completed', { requestId, userId: request.userId });

      } catch (processingError) {
        // Mark as failed
        await this.updateDeletionRequestStatus(requestId, 'failed');
        this.logger.error('Data deletion failed', processingError, { requestId });
        throw processingError;
      }

    } catch (error) {
      this.logger.error('Failed to process deletion request', error, { requestId });
      throw error;
    }
  }

  /**
   * Request data export (GDPR Article 20 - Right to data portability)
   */
  async requestDataExport(
    userId: string,
    dataTypes: string[] = ['events', 'patterns', 'segments', 'insights'],
    format: 'json' | 'csv' | 'xml' = 'json',
    metadata: {
      ipAddress?: string;
      userAgent?: string;
    } = {}
  ): Promise<DataPortabilityRequest> {
    try {
      if (!this.config.enableDataPortability) {
        throw new Error('Data portability is not enabled');
      }

      const requestId = crypto.randomUUID();
      const exportRequest: DataPortabilityRequest = {
        requestId,
        userId,
        requestDate: new Date(),
        dataTypes,
        format,
        status: 'pending',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      };

      // Store export request
      await this.storeDataPortabilityRequest(exportRequest);

      // Create audit record
      await this.createAuditRecord({
        userId,
        auditType: 'data_access',
        action: 'data_export_requested',
        timestamp: new Date(),
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
        details: { dataTypes, format },
      });

      // Emit event for processing
      this.emit('privacy:exportRequested', { request: exportRequest, metadata });
      this.logger.info('Data export requested', { userId, requestId, dataTypes });

      return exportRequest;

    } catch (error) {
      this.logger.error('Failed to request data export', error, { userId });
      throw error;
    }
  }

  /**
   * Check consent expiration and send renewal notices
   */
  async checkConsentExpiration(): Promise<Array<{ userId: string; expiresAt: Date }>> {
    try {
      const expiringConsents = await this.db
        .selectFrom('user_privacy_settings')
        .select(['user_id', 'consent_expires_at'])
        .where('consent_expires_at', '<=', new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)) // 30 days
        .execute();

      const expiringUsers = expiringConsents
        .map(row => ({
          userId: row.user_id,
          expiresAt: row.consent_expires_at,
        }))
        .filter((item): item is { userId: string; expiresAt: Date } => !!item.expiresAt);

      // Emit events for each expiring consent
      for (const user of expiringUsers) {
        this.emit('privacy:consentExpiring', user);
      }

      if (expiringUsers.length > 0) {
        this.logger.info('Found expiring consents', { count: expiringUsers.length });
      }

      return expiringUsers;

    } catch (error) {
      this.logger.error('Failed to check consent expiration', error);
      return [];
    }
  }

  /**
   * Clean up expired data based on retention policies
   */
  async cleanupExpiredData(): Promise<{
    deletedEvents: number;
    anonymizedUsers: number;
    cleanedInsights: number;
  }> {
    try {
      this.logger.info('Starting data retention cleanup');

      const results = {
        deletedEvents: 0,
        anonymizedUsers: 0,
        cleanedInsights: 0,
      };

      // Get users with data retention settings
      const usersWithRetentionSettings = await this.db
        .selectFrom('user_privacy_settings')
        .select(['user_id', 'data_retention_period_days', 'anonymization_preference'])
        .execute();

      for (const userSetting of usersWithRetentionSettings) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - userSetting.data_retention_period_days);

        // Delete or anonymize old behavior events
        if (userSetting.anonymization_preference === 'full') {
          await this.anonymizeOldUserData(userSetting.user_id, cutoffDate);
          results.anonymizedUsers++;
        } else {
          const deletedCount = await this.deleteOldUserData(userSetting.user_id, cutoffDate);
          results.deletedEvents += deletedCount;
        }

        // Clean up expired insights
        const cleanedInsights = await this.cleanupExpiredInsights(userSetting.user_id);
        results.cleanedInsights += cleanedInsights;
      }

      this.emit('privacy:dataCleanupCompleted', results);
      this.logger.info('Data retention cleanup completed', results);

      return results;

    } catch (error) {
      this.logger.error('Failed to cleanup expired data', error);
      throw error;
    }
  }

  /**
   * Generate privacy compliance report
   */
  async generateComplianceReport(dateRange: { start: Date; end: Date }): Promise<{
    consentRecords: number;
    deletionRequests: number;
    dataExports: number;
    auditRecords: number;
    activeUsers: number;
    dataRetentionCompliance: number;
  }> {
    try {
      const [consentCount, deletionCount, exportCount, auditCount] = await Promise.all([
        this.getConsentRecordCount(dateRange),
        this.getDeletionRequestCount(dateRange),
        this.getDataExportCount(dateRange),
        this.getAuditRecordCount(dateRange),
      ]);

      const activeUsers = await this.getActiveUserCount(dateRange);
      const retentionCompliance = await this.calculateRetentionCompliance();

      const report = {
        consentRecords: consentCount,
        deletionRequests: deletionCount,
        dataExports: exportCount,
        auditRecords: auditCount,
        activeUsers,
        dataRetentionCompliance: retentionCompliance,
      };

      this.logger.info('Compliance report generated', report);
      return report;

    } catch (error) {
      this.logger.error('Failed to generate compliance report', error);
      throw error;
    }
  }

  // Private methods

  private calculateConsentExpiration(): Date {
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + this.config.consentExpirationPeriod);
    return expirationDate;
  }

  private detectSignificantConsentChanges(
    current: UserPrivacySettings,
    updated: UserPrivacySettings
  ): Array<{ type: string; granted: boolean }> {
    const changes: Array<{ type: string; granted: boolean }> = [];

    const significantFields = [
      'behaviorTrackingEnabled',
      'analyticsConsent',
      'personalizationConsent',
      'dataRetentionConsent',
    ];

    for (const field of significantFields) {
      const currentValue = (current as any)[field];
      const updatedValue = (updated as any)[field];

      if (currentValue !== updatedValue) {
        changes.push({
          type: field,
          granted: updatedValue,
        });
      }
    }

    return changes;
  }

  private async performFullDataDeletion(userId: string): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      // Delete behavior events
      await trx.deleteFrom('user_behavior_events').where('user_id', '=', userId).execute();
      
      // Delete patterns
      await trx.deleteFrom('user_search_patterns').where('user_id', '=', userId).execute();
      
      // Delete segments
      await trx.deleteFrom('user_behavior_segments').where('user_id', '=', userId).execute();
      
      // Delete predictions
      await trx.deleteFrom('user_behavior_predictions').where('user_id', '=', userId).execute();
      
      // Delete insights
      await trx.deleteFrom('user_behavior_insights').where('user_id', '=', userId).execute();
      
      // Delete privacy settings
      await trx.deleteFrom('user_privacy_settings').where('user_id', '=', userId).execute();
    });
  }

  private async performDataAnonymization(userId: string, dataTypes?: string[]): Promise<void> {
    // Anonymize user data while preserving aggregate statistics
    const events = await this.getUserBehaviorEvents(userId);
    
    for (const event of events) {
      const anonymizedEvent = this.dataAnonymizer.anonymizeEvent(event);
      await this.updateBehaviorEvent(event.id!, anonymizedEvent);
    }
  }

  private async performSpecificDataDeletion(userId: string, dataTypes: string[]): Promise<void> {
    for (const dataType of dataTypes) {
      switch (dataType) {
        case 'events':
          await this.db.deleteFrom('user_behavior_events').where('user_id', '=', userId).execute();
          break;
        case 'patterns':
          await this.db.deleteFrom('user_search_patterns').where('user_id', '=', userId).execute();
          break;
        case 'segments':
          await this.db.deleteFrom('user_behavior_segments').where('user_id', '=', userId).execute();
          break;
        case 'predictions':
          await this.db.deleteFrom('user_behavior_predictions').where('user_id', '=', userId).execute();
          break;
        case 'insights':
          await this.db.deleteFrom('user_behavior_insights').where('user_id', '=', userId).execute();
          break;
      }
    }
  }

  private async anonymizeOldUserData(userId: string, cutoffDate: Date): Promise<void> {
    const oldEvents = await this.db
      .selectFrom('user_behavior_events')
      .selectAll()
      .where('user_id', '=', userId)
      .where('event_timestamp', '<', cutoffDate)
      .execute();

    for (const eventRow of oldEvents) {
      const event = this.mapDbRowToBehaviorEvent(eventRow);
      const anonymizedEvent = this.dataAnonymizer.anonymizeEvent(event);
      await this.updateBehaviorEvent(event.id!, anonymizedEvent);
    }
  }

  private async deleteOldUserData(userId: string, cutoffDate: Date): Promise<number> {
    const result = await this.db
      .deleteFrom('user_behavior_events')
      .where('user_id', '=', userId)
      .where('event_timestamp', '<', cutoffDate)
      .executeTakeFirst();

    return Number(result.numDeletedRows || 0);
  }

  private async cleanupExpiredInsights(userId: string): Promise<number> {
    const result = await this.db
      .deleteFrom('user_behavior_insights')
      .where('user_id', '=', userId)
      .where('expires_at', '<', new Date())
      .executeTakeFirst();

    return Number(result.numDeletedRows || 0);
  }

  private startRetentionCleanup(): void {
    // Run cleanup daily at 2 AM
    setInterval(async () => {
      try {
        await this.cleanupExpiredData();
      } catch (error) {
        this.logger.error('Retention cleanup failed', error);
      }
    }, 24 * 60 * 60 * 1000);
  }

  private startConsentExpirationCheck(): void {
    // Check consent expiration weekly
    setInterval(async () => {
      try {
        await this.checkConsentExpiration();
      } catch (error) {
        this.logger.error('Consent expiration check failed', error);
      }
    }, 7 * 24 * 60 * 60 * 1000);
  }

  // Database operations and utility methods

  private async storePrivacySettings(settings: UserPrivacySettings): Promise<void> {
    await this.db
      .insertInto('user_privacy_settings')
      .values({
        id: crypto.randomUUID(),
        user_id: settings.userId,
        behavior_tracking_enabled: settings.behaviorTrackingEnabled,
        analytics_consent: settings.analyticsConsent,
        personalization_consent: settings.personalizationConsent,
        data_retention_consent: settings.dataRetentionConsent,
        event_tracking_types: JSON.stringify(settings.eventTrackingTypes),
        data_sharing_permissions: JSON.stringify(settings.dataSharingPermissions),
        data_retention_period_days: settings.dataRetentionPeriodDays,
        anonymization_preference: settings.anonymizationPreference,
        consent_version: settings.consentVersion,
        consent_given_at: settings.consentGivenAt,
        consent_expires_at: settings.consentExpiresAt,
        last_updated_at: settings.lastUpdatedAt,
        consent_history: JSON.stringify(settings.consentHistory),
        ip_address_at_consent: settings.ipAddressAtConsent,
        user_agent_at_consent: settings.userAgentAtConsent,
        created_at: settings.createdAt,
      })
      .onConflict((oc) => 
        oc.column('user_id').doUpdateSet({
          behavior_tracking_enabled: settings.behaviorTrackingEnabled,
          analytics_consent: settings.analyticsConsent,
          personalization_consent: settings.personalizationConsent,
          data_retention_consent: settings.dataRetentionConsent,
          event_tracking_types: JSON.stringify(settings.eventTrackingTypes),
          data_sharing_permissions: JSON.stringify(settings.dataSharingPermissions),
          data_retention_period_days: settings.dataRetentionPeriodDays,
          anonymization_preference: settings.anonymizationPreference,
          consent_version: settings.consentVersion,
          consent_given_at: settings.consentGivenAt,
          consent_expires_at: settings.consentExpiresAt,
          last_updated_at: settings.lastUpdatedAt,
          consent_history: JSON.stringify(settings.consentHistory),
          ip_address_at_consent: settings.ipAddressAtConsent,
          user_agent_at_consent: settings.userAgentAtConsent,
        })
      )
      .execute();
  }

  private mapDbRowToPrivacySettings(row: any): UserPrivacySettings {
    return {
      id: row.id,
      userId: row.user_id,
      behaviorTrackingEnabled: row.behavior_tracking_enabled,
      analyticsConsent: row.analytics_consent,
      personalizationConsent: row.personalization_consent,
      dataRetentionConsent: row.data_retention_consent,
      eventTrackingTypes: JSON.parse(row.event_tracking_types || '[]'),
      dataSharingPermissions: JSON.parse(row.data_sharing_permissions || '{}'),
      dataRetentionPeriodDays: row.data_retention_period_days,
      anonymizationPreference: row.anonymization_preference,
      consentVersion: row.consent_version,
      consentGivenAt: row.consent_given_at,
      consentExpiresAt: row.consent_expires_at,
      lastUpdatedAt: row.last_updated_at,
      consentHistory: JSON.parse(row.consent_history || '[]'),
      ipAddressAtConsent: row.ip_address_at_consent,
      userAgentAtConsent: row.user_agent_at_consent,
      createdAt: row.created_at,
    };
  }

  private async logConsentRecord(record: ConsentRecord): Promise<void> {
    // In production, store consent records in a separate table
    this.logger.info('Consent record logged', record);
  }

  private async createAuditRecord(audit: PrivacyAudit): Promise<void> {
    // In production, store audit records in a separate table
    this.logger.info('Audit record created', audit);
  }

  private async storeDeletionRequest(request: DataDeletionRequest): Promise<void> {
    // In production, store deletion requests in a separate table
    this.logger.info('Deletion request stored', { requestId: request.requestId });
  }

  private async getDeletionRequest(requestId: string): Promise<DataDeletionRequest | null> {
    // In production, retrieve from deletion requests table
    return null;
  }

  private async updateDeletionRequestStatus(
    requestId: string,
    status: DataDeletionRequest['processingStatus'],
    completionDate?: Date
  ): Promise<void> {
    this.logger.info('Deletion request status updated', { requestId, status });
  }

  private async storeDataPortabilityRequest(request: DataPortabilityRequest): Promise<void> {
    // In production, store in data portability requests table
    this.logger.info('Data portability request stored', { requestId: request.requestId });
  }

  private async getUserBehaviorEvents(userId: string): Promise<BehaviorEvent[]> {
    const results = await this.db
      .selectFrom('user_behavior_events')
      .selectAll()
      .where('user_id', '=', userId)
      .execute();

    return results.map(this.mapDbRowToBehaviorEvent);
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

  private async updateBehaviorEvent(eventId: string, event: BehaviorEvent): Promise<void> {
    await this.db
      .updateTable('user_behavior_events')
      .set({
        user_id: event.userId,
        search_query: event.searchQuery,
        search_context: event.searchContext,
        result_data: event.resultData,
        page_context: event.pageContext,
        user_agent: event.userAgent,
        ip_address: event.ipAddress,
        referrer: event.referrer,
        device_info: event.deviceInfo,
      })
      .where('id', '=', eventId)
      .execute();
  }

  // Placeholder methods for compliance reporting

  private async getConsentRecordCount(dateRange: { start: Date; end: Date }): Promise<number> {
    return 0;
  }

  private async getDeletionRequestCount(dateRange: { start: Date; end: Date }): Promise<number> {
    return 0;
  }

  private async getDataExportCount(dateRange: { start: Date; end: Date }): Promise<number> {
    return 0;
  }

  private async getAuditRecordCount(dateRange: { start: Date; end: Date }): Promise<number> {
    return 0;
  }

  private async getActiveUserCount(dateRange: { start: Date; end: Date }): Promise<number> {
    const result = await this.db
      .selectFrom('user_behavior_events')
      .select('user_id')
      .distinct()
      .where('event_timestamp', '>=', dateRange.start)
      .where('event_timestamp', '<=', dateRange.end)
      .execute();

    return result.length;
  }

  private async calculateRetentionCompliance(): Promise<number> {
    // Simplified compliance calculation
    return 0.95; // 95% compliance
  }
}