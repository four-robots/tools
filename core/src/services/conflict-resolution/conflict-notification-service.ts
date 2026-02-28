/**
 * Conflict Notification Service
 * 
 * Real-time WebSocket-based notification system for conflict resolution events.
 * Provides intelligent notification routing, user preference management, and
 * comprehensive event broadcasting for all conflict resolution lifecycle stages.
 * Integrates seamlessly with the existing WebSocket collaboration infrastructure.
 */

import { Pool } from 'pg';
import { 
  ConflictDetection,
  ConflictResolutionSession,
  MergeResult,
  ConflictResolutionMessage,
  ConflictResolutionMessageSchema,
  ConflictNotificationService as IConflictNotificationService,
  ConflictResolutionError
} from '../../shared/types/conflict-resolution.js';
import { 
  CollaborationMessage,
  WebSocketCollaborationGateway
} from '../../shared/types/collaboration.js';
import { logger } from '../../utils/logger.js';

interface NotificationPreferences {
  userId: string;
  emailNotifications: boolean;
  realTimeNotifications: boolean;
  conflictTypes: string[];
  severityThreshold: 'low' | 'medium' | 'high' | 'critical';
  quietHours?: {
    start: string; // HH:mm format
    end: string;   // HH:mm format
    timezone: string;
  };
  notificationMethods: Array<'websocket' | 'email' | 'push' | 'slack'>;
}

interface NotificationTemplate {
  type: string;
  title: string;
  body: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  actions?: Array<{
    label: string;
    action: string;
    style?: 'primary' | 'secondary' | 'danger';
  }>;
}

interface NotificationContext {
  conflict: ConflictDetection;
  resolutionSession?: ConflictResolutionSession;
  mergeResult?: MergeResult;
  additionalData?: Record<string, any>;
}

type NotificationCallback = (event: ConflictResolutionMessage) => void;

export class ConflictNotificationService implements IConflictNotificationService {
  private subscribers: Map<string, Map<string, NotificationCallback>> = new Map();
  private userPreferences: Map<string, NotificationPreferences> = new Map();
  private notificationQueue: Array<{
    notification: ConflictResolutionMessage;
    targetUsers: string[];
    scheduled: Date;
    attempts: number;
  }> = [];
  private processorInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    private db: Pool,
    private websocketGateway: WebSocketCollaborationGateway
  ) {
    this.startNotificationProcessor();
    this.loadUserPreferences();
  }

  /**
   * Notifies users when a conflict is detected
   */
  async notifyConflictDetected(conflict: ConflictDetection): Promise<void> {
    try {
      logger.info('Sending conflict detected notification', { 
        conflictId: conflict.id, 
        severity: conflict.severity 
      });

      const notification = ConflictResolutionMessageSchema.parse({
        type: 'conflict_detected',
        conflictId: conflict.id,
        sessionId: conflict.sessionId,
        userId: '', // Will be set per recipient
        data: {
          conflictType: conflict.conflictType,
          severity: conflict.severity,
          complexityScore: conflict.complexityScore,
          canAutoResolve: conflict.canAutoResolve,
          recommendedStrategy: conflict.recommendedStrategy,
          confidence: conflict.confidence,
          involvedUsers: conflict.involvedUsers,
          contentId: conflict.contentId,
          detectedAt: conflict.detectedAt.toISOString(),
          resolutionDeadline: conflict.resolutionDeadline?.toISOString(),
          conflictRegions: conflict.conflictRegions,
          metadata: conflict.metadata
        },
        timestamp: new Date(),
        messageId: crypto.randomUUID(),
        requiresAck: conflict.severity === 'high' || conflict.severity === 'critical'
      });

      // Determine notification recipients
      const recipients = await this.determineNotificationRecipients(conflict, 'conflict_detected');

      // Send notifications to all recipients
      await this.sendNotificationToUsers(notification, recipients);

      // Log notification metrics
      await this.logNotificationMetrics('conflict_detected', conflict.id, recipients.length, conflict.severity);

      logger.info('Conflict detected notification sent', { 
        conflictId: conflict.id, 
        recipientCount: recipients.length 
      });

    } catch (error) {
      logger.error('Failed to send conflict detected notification', { error, conflictId: conflict.id });
      throw new ConflictResolutionError(`Failed to notify conflict detected: ${error.message}`, 'NOTIFICATION_ERROR', 500, {
        conflictId: conflict.id,
        error: error.message
      });
    }
  }

  /**
   * Notifies users when manual resolution is required
   */
  async notifyResolutionRequired(resolutionSession: ConflictResolutionSession): Promise<void> {
    try {
      logger.info('Sending resolution required notification', { 
        sessionId: resolutionSession.id,
        conflictId: resolutionSession.conflictId 
      });

      const notification = ConflictResolutionMessageSchema.parse({
        type: 'conflict_resolution_started',
        conflictId: resolutionSession.conflictId,
        sessionId: resolutionSession.collaborationSessionId,
        userId: '', // Will be set per recipient
        data: {
          resolutionSessionId: resolutionSession.id,
          moderatorId: resolutionSession.moderatorId,
          participantIds: resolutionSession.participantIds,
          observerIds: resolutionSession.observerIds,
          status: resolutionSession.status,
          currentStep: resolutionSession.currentStep,
          expiresAt: resolutionSession.expiresAt?.toISOString(),
          settings: resolutionSession.settings,
          createdAt: resolutionSession.createdAt.toISOString()
        },
        timestamp: new Date(),
        messageId: crypto.randomUUID(),
        requiresAck: true
      });

      // Get the original conflict for context
      const conflict = await this.getConflictDetails(resolutionSession.conflictId);

      // Send to all participants and observers
      const allRecipients = [
        resolutionSession.moderatorId,
        ...resolutionSession.participantIds,
        ...resolutionSession.observerIds
      ];

      await this.sendNotificationToUsers(notification, allRecipients);

      // Also notify workspace admins if this is a critical conflict
      if (conflict.severity === 'critical') {
        const adminNotification = { 
          ...notification, 
          data: { ...notification.data, isEscalated: true } 
        };
        const admins = await this.getWorkspaceAdmins(conflict.sessionId);
        await this.sendNotificationToUsers(adminNotification, admins);
      }

      await this.logNotificationMetrics('resolution_required', resolutionSession.id, allRecipients.length, 'high');

      logger.info('Resolution required notification sent', { 
        sessionId: resolutionSession.id,
        recipientCount: allRecipients.length 
      });

    } catch (error) {
      logger.error('Failed to send resolution required notification', { error, sessionId: resolutionSession.id });
      throw new ConflictResolutionError(`Failed to notify resolution required: ${error.message}`, 'NOTIFICATION_ERROR', 500, {
        resolutionSessionId: resolutionSession.id,
        error: error.message
      });
    }
  }

  /**
   * Notifies users when conflict resolution is completed
   */
  async notifyResolutionCompleted(
    resolutionSession: ConflictResolutionSession, 
    result: MergeResult
  ): Promise<void> {
    try {
      logger.info('Sending resolution completed notification', { 
        sessionId: resolutionSession.id,
        resultId: result.id,
        strategy: result.strategy 
      });

      const notification = ConflictResolutionMessageSchema.parse({
        type: 'conflict_resolution_completed',
        conflictId: resolutionSession.conflictId,
        sessionId: resolutionSession.collaborationSessionId,
        userId: '', // Will be set per recipient
        data: {
          resolutionSessionId: resolutionSession.id,
          mergeResultId: result.id,
          strategy: result.strategy,
          confidenceScore: result.confidenceScore,
          successfulMerges: result.successfulMerges,
          conflictingRegions: result.conflictingRegions,
          manualInterventions: result.manualInterventions,
          requiresUserReview: result.requiresUserReview,
          userReviewInstructions: result.userReviewInstructions,
          completedAt: result.completedAt.toISOString(),
          finalDecision: resolutionSession.finalDecision,
          selectedSolutionId: resolutionSession.selectedSolutionId,
          semanticCoherence: result.semanticCoherence,
          syntacticCorrectness: result.syntacticCorrectness
        },
        timestamp: new Date(),
        messageId: crypto.randomUUID(),
        requiresAck: result.requiresUserReview
      });

      // Send to all participants
      const allParticipants = [
        resolutionSession.moderatorId,
        ...resolutionSession.participantIds,
        ...resolutionSession.observerIds
      ];

      await this.sendNotificationToUsers(notification, allParticipants);

      // Send success/completion metrics to session participants
      await this.broadcastResolutionMetrics(resolutionSession, result);

      await this.logNotificationMetrics('resolution_completed', resolutionSession.id, allParticipants.length, 'medium');

      logger.info('Resolution completed notification sent', { 
        sessionId: resolutionSession.id,
        recipientCount: allParticipants.length,
        confidence: result.confidenceScore 
      });

    } catch (error) {
      logger.error('Failed to send resolution completed notification', { error, sessionId: resolutionSession.id });
      throw new ConflictResolutionError(`Failed to notify resolution completed: ${error.message}`, 'NOTIFICATION_ERROR', 500, {
        resolutionSessionId: resolutionSession.id,
        resultId: result.id,
        error: error.message
      });
    }
  }

  /**
   * Notifies users when voting is required
   */
  async notifyVotingRequired(resolutionSession: ConflictResolutionSession, solutionId: string): Promise<void> {
    try {
      logger.info('Sending voting required notification', { 
        sessionId: resolutionSession.id,
        solutionId 
      });

      const solution = resolutionSession.proposedSolutions.find(s => s.id === solutionId);
      if (!solution) {
        throw new Error(`Solution not found: ${solutionId}`);
      }

      const notification = ConflictResolutionMessageSchema.parse({
        type: 'conflict_vote_cast',
        conflictId: resolutionSession.conflictId,
        sessionId: resolutionSession.collaborationSessionId,
        userId: '', // Will be set per recipient
        data: {
          resolutionSessionId: resolutionSession.id,
          solutionId,
          proposerId: solution.userId,
          strategy: solution.strategy,
          content: solution.content,
          rationale: solution.rationale,
          existingVotes: solution.votes.length,
          votingDeadline: this.calculateVotingDeadline(resolutionSession),
          requiresUnanimous: resolutionSession.settings.requireUnanimous,
          allowVoting: resolutionSession.settings.allowVoting
        },
        timestamp: new Date(),
        messageId: crypto.randomUUID(),
        requiresAck: true
      });

      // Send to participants (excluding the solution proposer)
      const voters = resolutionSession.participantIds.filter(pid => pid !== solution.userId);
      
      if (voters.length > 0) {
        await this.sendNotificationToUsers(notification, voters);
        await this.logNotificationMetrics('voting_required', resolutionSession.id, voters.length, 'high');
      }

      logger.info('Voting required notification sent', { 
        sessionId: resolutionSession.id,
        voterCount: voters.length 
      });

    } catch (error) {
      logger.error('Failed to send voting required notification', { error, sessionId: resolutionSession.id });
      throw new ConflictResolutionError(`Failed to notify voting required: ${error.message}`, 'NOTIFICATION_ERROR', 500, {
        resolutionSessionId: resolutionSession.id,
        solutionId,
        error: error.message
      });
    }
  }

  /**
   * Subscribes to conflict updates for a user in a session
   */
  async subscribeToConflictUpdates(
    userId: string, 
    sessionId: string, 
    callback: NotificationCallback
  ): Promise<void> {
    try {
      if (!this.subscribers.has(userId)) {
        this.subscribers.set(userId, new Map());
      }

      const userSubscriptions = this.subscribers.get(userId)!;
      userSubscriptions.set(sessionId, callback);

      logger.debug('User subscribed to conflict updates', { userId, sessionId });

    } catch (error) {
      logger.error('Failed to subscribe to conflict updates', { error, userId, sessionId });
      throw new ConflictResolutionError(`Failed to subscribe to updates: ${error.message}`, 'SUBSCRIPTION_ERROR', 500, {
        userId,
        sessionId,
        error: error.message
      });
    }
  }

  /**
   * Unsubscribes from conflict updates
   */
  async unsubscribeFromConflictUpdates(userId: string, sessionId: string): Promise<void> {
    try {
      const userSubscriptions = this.subscribers.get(userId);
      if (userSubscriptions) {
        userSubscriptions.delete(sessionId);
        
        if (userSubscriptions.size === 0) {
          this.subscribers.delete(userId);
        }
      }

      logger.debug('User unsubscribed from conflict updates', { userId, sessionId });

    } catch (error) {
      logger.error('Failed to unsubscribe from conflict updates', { error, userId, sessionId });
    }
  }

  /**
   * Updates notification preferences for a user
   */
  async updateNotificationPreferences(userId: string, preferences: Partial<NotificationPreferences>): Promise<void> {
    try {
      const currentPreferences = this.userPreferences.get(userId) || this.getDefaultNotificationPreferences(userId);
      const updatedPreferences = { ...currentPreferences, ...preferences };

      this.userPreferences.set(userId, updatedPreferences);
      
      // Persist to database
      await this.saveNotificationPreferences(userId, updatedPreferences);

      logger.info('Notification preferences updated', { userId });

    } catch (error) {
      logger.error('Failed to update notification preferences', { error, userId });
      throw new ConflictResolutionError(`Failed to update preferences: ${error.message}`, 'PREFERENCES_ERROR', 500, {
        userId,
        error: error.message
      });
    }
  }

  /**
   * Sends notification to multiple users
   */
  private async sendNotificationToUsers(
    notification: ConflictResolutionMessage, 
    userIds: string[]
  ): Promise<void> {
    const sendPromises: Promise<void>[] = [];

    for (const userId of userIds) {
      // Check user preferences and quiet hours
      if (await this.shouldNotifyUser(userId, notification)) {
        const userNotification = { ...notification, userId };
        sendPromises.push(this.sendNotificationToUser(userNotification));
      }
    }

    await Promise.allSettled(sendPromises);
  }

  /**
   * Sends notification to a specific user
   */
  private async sendNotificationToUser(notification: ConflictResolutionMessage): Promise<void> {
    try {
      // Send via WebSocket if user is online
      await this.sendWebSocketNotification(notification);

      // Call local callback if user has subscribed
      await this.callLocalCallback(notification);

      // Queue for other notification methods (email, push, etc.)
      await this.queueAdditionalNotifications(notification);

    } catch (error) {
      logger.warn('Failed to send notification to user', { 
        error, 
        userId: notification.userId,
        type: notification.type 
      });
    }
  }

  /**
   * Sends notification via WebSocket
   */
  private async sendWebSocketNotification(notification: ConflictResolutionMessage): Promise<void> {
    try {
      // Convert to collaboration message format
      const collaborationMessage: CollaborationMessage = {
        type: 'sync', // Using sync type for conflict resolution messages
        sessionId: notification.sessionId,
        userId: notification.userId,
        data: {
          conflictResolution: notification,
          messageType: 'conflict_resolution'
        },
        timestamp: notification.timestamp,
        sequenceNumber: 0,
        messageId: notification.messageId,
        requiresAck: notification.requiresAck
      };

      await this.websocketGateway.sendToUser(notification.userId, collaborationMessage);

      logger.debug('WebSocket notification sent', { 
        userId: notification.userId,
        type: notification.type 
      });

    } catch (error) {
      logger.debug('WebSocket notification failed (user may be offline)', { 
        userId: notification.userId,
        error: error.message 
      });
      // Don't throw - user might be offline, which is normal
    }
  }

  /**
   * Calls local callback for subscribed users
   */
  private async callLocalCallback(notification: ConflictResolutionMessage): Promise<void> {
    const userSubscriptions = this.subscribers.get(notification.userId);
    if (userSubscriptions) {
      const callback = userSubscriptions.get(notification.sessionId);
      if (callback) {
        try {
          callback(notification);
        } catch (error) {
          logger.warn('Local callback failed', { 
            error,
            userId: notification.userId,
            sessionId: notification.sessionId 
          });
        }
      }
    }
  }

  /**
   * Queues additional notification methods
   */
  private async queueAdditionalNotifications(notification: ConflictResolutionMessage): Promise<void> {
    const preferences = this.userPreferences.get(notification.userId);
    if (!preferences) return;

    // Queue for processing by background notification service
    this.notificationQueue.push({
      notification,
      targetUsers: [notification.userId],
      scheduled: new Date(),
      attempts: 0
    });
  }

  /**
   * Determines who should receive notifications for a conflict event
   */
  private async determineNotificationRecipients(
    conflict: ConflictDetection, 
    eventType: string
  ): Promise<string[]> {
    const recipients = new Set<string>();

    // Always include directly involved users
    conflict.involvedUsers.forEach(userId => recipients.add(userId));

    // Include session participants based on preferences
    const sessionParticipants = await this.getSessionParticipants(conflict.sessionId);
    for (const participant of sessionParticipants) {
      const preferences = this.userPreferences.get(participant.userId);
      if (this.shouldIncludeInNotification(preferences, conflict, eventType)) {
        recipients.add(participant.userId);
      }
    }

    // Include workspace moderators for high-severity conflicts
    if (conflict.severity === 'high' || conflict.severity === 'critical') {
      const moderators = await this.getWorkspaceModerators(conflict.sessionId);
      moderators.forEach(moderatorId => recipients.add(moderatorId));
    }

    return Array.from(recipients);
  }

  /**
   * Checks if a user should be notified based on preferences and context
   */
  private async shouldNotifyUser(userId: string, notification: ConflictResolutionMessage): Promise<boolean> {
    const preferences = this.userPreferences.get(userId);
    if (!preferences) return true; // Default to notifying if no preferences set

    // Check if real-time notifications are enabled
    if (!preferences.realTimeNotifications) return false;

    // Check severity threshold
    const conflict = notification.data.severity;
    const severityLevels = { low: 1, medium: 2, high: 3, critical: 4 };
    const userThreshold = severityLevels[preferences.severityThreshold];
    const conflictSeverity = severityLevels[conflict as keyof typeof severityLevels] || 1;
    
    if (conflictSeverity < userThreshold) return false;

    // Check quiet hours
    if (preferences.quietHours && this.isInQuietHours(preferences.quietHours)) {
      // Only notify for critical issues during quiet hours
      return conflict === 'critical';
    }

    // Check conflict types
    if (preferences.conflictTypes.length > 0) {
      const conflictType = notification.data.conflictType;
      if (!preferences.conflictTypes.includes(conflictType)) return false;
    }

    return true;
  }

  /**
   * Checks if current time is within user's quiet hours
   */
  private isInQuietHours(quietHours: NotificationPreferences['quietHours']): boolean {
    if (!quietHours) return false;

    try {
      const now = new Date().toLocaleTimeString('en-US', { 
        hour12: false, 
        timeZone: quietHours.timezone 
      }).substring(0, 5);
      
      // Handle overnight ranges (e.g. 22:00-06:00) where start > end
      if (quietHours.start > quietHours.end) {
        return now >= quietHours.start || now <= quietHours.end;
      }
      return now >= quietHours.start && now <= quietHours.end;
    } catch (error) {
      logger.warn('Failed to check quiet hours', { error, quietHours });
      return false;
    }
  }

  /**
   * Calculates voting deadline for a resolution session
   */
  private calculateVotingDeadline(session: ConflictResolutionSession): string {
    const deadline = new Date();
    deadline.setMilliseconds(deadline.getMilliseconds() + (session.settings.votingTimeoutMs || 300000));
    return deadline.toISOString();
  }

  /**
   * Broadcasts resolution metrics to session participants
   */
  private async broadcastResolutionMetrics(
    session: ConflictResolutionSession, 
    result: MergeResult
  ): Promise<void> {
    const metricsNotification = ConflictResolutionMessageSchema.parse({
      type: 'conflict_auto_resolved',
      conflictId: session.conflictId,
      sessionId: session.collaborationSessionId,
      userId: '',
      data: {
        metrics: {
          totalResolutionTime: result.completedAt.getTime() - result.startedAt.getTime(),
          participantCount: session.participantIds.length,
          proposedSolutions: session.proposedSolutions.length,
          finalStrategy: result.strategy,
          confidenceScore: result.confidenceScore,
          automationLevel: result.manualInterventions === 0 ? 'full' : 
                          result.manualInterventions < 3 ? 'partial' : 'minimal'
        }
      },
      timestamp: new Date(),
      messageId: crypto.randomUUID()
    });

    const allParticipants = [session.moderatorId, ...session.participantIds];
    await this.sendNotificationToUsers(metricsNotification, allParticipants);
  }

  // Helper methods (placeholder implementations)
  private async getConflictDetails(conflictId: string): Promise<ConflictDetection> {
    // Implementation would query database
    return {} as ConflictDetection;
  }

  private async getSessionParticipants(sessionId: string): Promise<Array<{userId: string}>> {
    // Implementation would query database
    return [];
  }

  private async getWorkspaceAdmins(sessionId: string): Promise<string[]> {
    // Implementation would query database  
    return [];
  }

  private async getWorkspaceModerators(sessionId: string): Promise<string[]> {
    // Implementation would query database
    return [];
  }

  private shouldIncludeInNotification(
    preferences: NotificationPreferences | undefined, 
    conflict: ConflictDetection, 
    eventType: string
  ): boolean {
    // Implementation would check user preferences
    return true;
  }

  private getDefaultNotificationPreferences(userId: string): NotificationPreferences {
    return {
      userId,
      emailNotifications: true,
      realTimeNotifications: true,
      conflictTypes: [],
      severityThreshold: 'medium',
      notificationMethods: ['websocket', 'email']
    };
  }

  private async saveNotificationPreferences(userId: string, preferences: NotificationPreferences): Promise<void> {
    // Implementation would persist to database
  }

  private async loadUserPreferences(): Promise<void> {
    // Implementation would load from database
  }

  private async logNotificationMetrics(
    type: string, 
    entityId: string, 
    recipientCount: number, 
    priority: string
  ): Promise<void> {
    // Implementation would log metrics for analytics
    logger.info('Notification metrics', { type, entityId, recipientCount, priority });
  }

  private startNotificationProcessor(): void {
    // Background processor for queued notifications
    this.processorInterval = setInterval(() => {
      this.processNotificationQueue().catch(error => {
        logger.error('Failed to process notification queue', { error: error instanceof Error ? error.message : String(error) });
      });
    }, 5000); // Process every 5 seconds
  }

  destroy(): void {
    if (this.processorInterval) {
      clearInterval(this.processorInterval);
      this.processorInterval = null;
    }
    this.subscribers.clear();
    this.userPreferences.clear();
    this.notificationQueue = [];
  }

  private async processNotificationQueue(): Promise<void> {
    const now = new Date();
    const toProcess = this.notificationQueue.filter(item => 
      item.scheduled <= now && item.attempts < 3
    );

    for (const item of toProcess) {
      try {
        // Process additional notification methods (email, push, etc.)
        await this.processAdditionalNotificationMethods(item);
        
        // Remove from queue after successful processing
        const index = this.notificationQueue.indexOf(item);
        if (index > -1) {
          this.notificationQueue.splice(index, 1);
        }
      } catch (error) {
        item.attempts++;
        item.scheduled = new Date(now.getTime() + (item.attempts * 60000)); // Retry with exponential backoff
        logger.warn('Notification processing failed, will retry', { 
          error, 
          attempts: item.attempts,
          nextAttempt: item.scheduled 
        });
      }
    }

    // Clean up old failed notifications
    this.notificationQueue = this.notificationQueue.filter(item => 
      item.attempts < 3 && (now.getTime() - item.scheduled.getTime()) < 86400000 // 24 hours
    );
  }

  private async processAdditionalNotificationMethods(item: {
    notification: ConflictResolutionMessage;
    targetUsers: string[];
  }): Promise<void> {
    // Placeholder for additional notification methods
    // In a real implementation, this would handle email, push notifications, Slack, etc.
    logger.debug('Processing additional notification methods', {
      type: item.notification.type,
      targetUsers: item.targetUsers.length
    });
  }
}