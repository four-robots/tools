/**
 * Whiteboard Conflict Resolution Service
 * 
 * Handles intelligent conflict resolution for collaborative whiteboard editing:
 * - Conflict analysis and severity assessment
 * - Automatic and manual resolution workflows
 * - Conflict notification and user awareness
 * - Audit logging and history tracking
 * - Performance optimization for high concurrency
 */

import { Logger } from '../../utils/logger.js';
import { DatabasePool } from '../../utils/database-pool.js';
import {
  EnhancedWhiteboardOperation,
  ConflictInfo,
  ConflictType,
  ConflictSeverity,
  ResolutionStrategy,
  EnhancedTransformContext,
  PerformanceMetrics
} from './whiteboard-ot-engine.js';
import { z } from 'zod';
import { randomUUID } from 'crypto';

// Conflict resolution configuration
export interface ConflictResolutionConfig {
  automaticResolutionEnabled: boolean;
  maxAutomaticResolutionAttempts: number;
  conflictTimeoutMs: number;
  userPriorityWeights: Record<string, number>;
  severityThresholds: {
    spatial: { low: number; medium: number; high: number };
    temporal: { low: number; medium: number; high: number };
    semantic: { low: number; medium: number; high: number };
  };
  resolutionStrategies: {
    default: ResolutionStrategy;
    byConflictType: Record<ConflictType, ResolutionStrategy>;
    bySeverity: Record<ConflictSeverity, ResolutionStrategy>;
  };
  performanceThresholds: {
    maxLatencyMs: number;
    maxMemoryUsageMB: number;
    maxQueueSize: number;
  };
}

// Conflict notification types
export interface ConflictNotification {
  id: string;
  conflictId: string;
  type: 'conflict_detected' | 'conflict_resolved' | 'manual_intervention_required';
  severity: ConflictSeverity;
  affectedUsers: string[];
  message: string;
  details: {
    conflictType: ConflictType;
    affectedElements: string[];
    resolutionStrategy?: ResolutionStrategy;
    estimatedResolutionTime?: number;
  };
  timestamp: string;
  acknowledged: boolean;
}

// Audit log entry
export interface ConflictAuditEntry {
  id: string;
  conflictId: string;
  whiteboardId: string;
  sessionId: string;
  userId: string;
  action: 'conflict_detected' | 'resolution_attempted' | 'resolution_succeeded' | 'resolution_failed' | 'manual_intervention';
  details: {
    conflictType: ConflictType;
    severity: ConflictSeverity;
    operations: EnhancedWhiteboardOperation[];
    resolutionStrategy: ResolutionStrategy;
    resolutionTime?: number;
    errorMessage?: string;
    confidence?: number;
  };
  timestamp: string;
  metadata: {
    clientVersion: string;
    userAgent: string;
    networkLatency?: number;
    performanceMetrics?: Partial<PerformanceMetrics>;
  };
}

// Resolution recommendation
export interface ResolutionRecommendation {
  strategy: ResolutionStrategy;
  confidence: number;
  reasoning: string;
  estimatedResolutionTime: number;
  riskLevel: 'low' | 'medium' | 'high';
  alternativeStrategies: Array<{
    strategy: ResolutionStrategy;
    confidence: number;
    pros: string[];
    cons: string[];
  }>;
}

// Conflict analytics
export interface ConflictAnalytics {
  totalConflicts: number;
  conflictsByType: Record<ConflictType, number>;
  conflictsBySeverity: Record<ConflictSeverity, number>;
  averageResolutionTime: number;
  resolutionSuccessRate: number;
  automaticResolutionRate: number;
  userConflictParticipation: Record<string, number>;
  peakConflictHours: Array<{ hour: number; count: number }>;
  conflictTrends: Array<{ timestamp: string; count: number }>;
}

/**
 * Whiteboard Conflict Resolution Service
 */
export class WhiteboardConflictService {
  private logger: Logger;
  private config: ConflictResolutionConfig;
  private activeConflicts: Map<string, ConflictInfo> = new Map();
  private conflictHistory: ConflictAuditEntry[] = [];
  private notifications: Map<string, ConflictNotification> = new Map();
  private resolutionQueue: ConflictInfo[] = [];
  private processingConflicts: Set<string> = new Set();
  private conflictProcessorInterval: ReturnType<typeof setInterval> | null = null;
  private conflictCleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    private db: DatabasePool,
    config?: Partial<ConflictResolutionConfig>,
    logger?: Logger
  ) {
    this.logger = logger || new Logger('WhiteboardConflictService');
    this.config = this.createDefaultConfig(config);
    
    this.logger.info('Whiteboard Conflict Resolution Service initialized', {
      automaticResolution: this.config.automaticResolutionEnabled,
      maxAttempts: this.config.maxAutomaticResolutionAttempts,
      timeout: this.config.conflictTimeoutMs
    });

    // Start conflict processing loop
    this.startConflictProcessor();
  }

  /**
   * Analyze conflict and determine resolution strategy
   */
  async analyzeConflict(conflict: ConflictInfo): Promise<ResolutionRecommendation> {
    try {
      this.logger.debug('Analyzing conflict', { conflictId: conflict.id, type: conflict.type });

      // Calculate base confidence based on conflict characteristics
      let confidence = this.calculateBaseConfidence(conflict);
      
      // Analyze conflict complexity
      const complexity = this.assessConflictComplexity(conflict);
      confidence *= (1 - complexity * 0.2); // Reduce confidence for complex conflicts

      // Determine recommended strategy
      const strategy = this.selectOptimalStrategy(conflict, confidence);
      
      // Calculate estimated resolution time
      const estimatedTime = this.estimateResolutionTime(conflict, strategy);
      
      // Assess risk level
      const riskLevel = this.assessRiskLevel(conflict, strategy);

      // Generate alternative strategies
      const alternatives = this.generateAlternativeStrategies(conflict, strategy);

      const recommendation: ResolutionRecommendation = {
        strategy,
        confidence: Math.min(Math.max(confidence, 0), 1),
        reasoning: this.generateReasoningExplanation(conflict, strategy, confidence),
        estimatedResolutionTime: estimatedTime,
        riskLevel,
        alternativeStrategies: alternatives
      };

      this.logger.info('Conflict analysis completed', {
        conflictId: conflict.id,
        recommendedStrategy: strategy,
        confidence: recommendation.confidence,
        estimatedTime: estimatedTime
      });

      return recommendation;

    } catch (error) {
      this.logger.error('Failed to analyze conflict', { error, conflictId: conflict.id });
      
      // Return safe fallback recommendation
      return {
        strategy: 'manual',
        confidence: 0.1,
        reasoning: 'Analysis failed, manual intervention recommended',
        estimatedResolutionTime: 0,
        riskLevel: 'high',
        alternativeStrategies: []
      };
    }
  }

  /**
   * Attempt automatic conflict resolution
   */
  async resolveConflictAutomatically(
    conflict: ConflictInfo,
    context: EnhancedTransformContext
  ): Promise<{
    success: boolean;
    resolution?: EnhancedWhiteboardOperation;
    error?: string;
    requiresManualIntervention: boolean;
  }> {
    if (!this.config.automaticResolutionEnabled) {
      return {
        success: false,
        error: 'Automatic resolution disabled',
        requiresManualIntervention: true
      };
    }

    if (this.processingConflicts.has(conflict.id)) {
      return {
        success: false,
        error: 'Conflict already being processed',
        requiresManualIntervention: false
      };
    }

    this.processingConflicts.add(conflict.id);

    try {
      this.logger.info('Attempting automatic conflict resolution', {
        conflictId: conflict.id,
        type: conflict.type,
        severity: conflict.severity
      });

      // Get resolution recommendation
      const recommendation = await this.analyzeConflict(conflict);
      
      // Check if automatic resolution is appropriate
      if (recommendation.riskLevel === 'high' || recommendation.confidence < 0.7) {
        await this.requestManualIntervention(conflict, recommendation);
        return {
          success: false,
          error: 'Risk too high for automatic resolution',
          requiresManualIntervention: true
        };
      }

      // Attempt resolution with recommended strategy
      const startTime = Date.now();
      const resolution = await this.applyResolutionStrategy(
        conflict,
        recommendation.strategy,
        context
      );

      const resolutionTime = Date.now() - startTime;

      if (resolution) {
        // Update conflict with resolution
        conflict.resolution = {
          strategy: recommendation.strategy,
          resultOperation: resolution,
          manualInterventionRequired: false,
          confidence: recommendation.confidence
        };
        conflict.resolutionTime = resolutionTime;
        conflict.resolvedAt = new Date().toISOString();

        // Log successful resolution
        await this.logConflictResolution(conflict, 'resolution_succeeded', context);

        // Send resolution notification
        await this.sendConflictNotification(conflict, 'conflict_resolved');

        // Update analytics
        this.updateConflictAnalytics(conflict, true);

        this.logger.info('Conflict resolved automatically', {
          conflictId: conflict.id,
          strategy: recommendation.strategy,
          resolutionTime
        });

        return { success: true, resolution, requiresManualIntervention: false };

      } else {
        // Resolution failed, may need manual intervention
        await this.logConflictResolution(conflict, 'resolution_failed', context);
        
        // Try alternative strategy if available
        const alternatives = recommendation.alternativeStrategies
          .filter(alt => alt.confidence > 0.5)
          .sort((a, b) => b.confidence - a.confidence);

        if (alternatives.length > 0) {
          const alternativeResolution = await this.applyResolutionStrategy(
            conflict,
            alternatives[0].strategy,
            context
          );

          if (alternativeResolution) {
            this.logger.info('Conflict resolved with alternative strategy', {
              conflictId: conflict.id,
              originalStrategy: recommendation.strategy,
              alternativeStrategy: alternatives[0].strategy
            });

            return { 
              success: true, 
              resolution: alternativeResolution, 
              requiresManualIntervention: false 
            };
          }
        }

        // All automatic strategies failed
        await this.requestManualIntervention(conflict, recommendation);
        return {
          success: false,
          error: 'All automatic resolution strategies failed',
          requiresManualIntervention: true
        };
      }

    } catch (error) {
      this.logger.error('Automatic conflict resolution failed', {
        error,
        conflictId: conflict.id
      });

      const errorMsg = error instanceof Error ? error.message : String(error);
      await this.logConflictResolution(conflict, 'resolution_failed', context, errorMsg);
      return {
        success: false,
        error: errorMsg,
        requiresManualIntervention: true
      };

    } finally {
      this.processingConflicts.delete(conflict.id);
    }
  }

  /**
   * Request manual intervention for complex conflicts
   */
  async requestManualIntervention(
    conflict: ConflictInfo,
    recommendation?: ResolutionRecommendation
  ): Promise<void> {
    this.logger.info('Requesting manual intervention for conflict', {
      conflictId: conflict.id,
      type: conflict.type,
      severity: conflict.severity
    });

    // Create manual intervention notification
    const notification: ConflictNotification = {
      id: randomUUID(),
      conflictId: conflict.id,
      type: 'manual_intervention_required',
      severity: conflict.severity,
      affectedUsers: conflict.operations.map(op => op.userId),
      message: `Manual intervention required for ${conflict.type} conflict`,
      details: {
        conflictType: conflict.type,
        affectedElements: conflict.affectedElements,
        resolutionStrategy: recommendation?.strategy,
        estimatedResolutionTime: recommendation?.estimatedResolutionTime
      },
      timestamp: new Date().toISOString(),
      acknowledged: false
    };

    this.notifications.set(notification.id, notification);
    
    // Send notification to affected users
    await this.sendConflictNotification(conflict, 'manual_intervention_required');

    // Add to manual resolution queue
    this.resolutionQueue.push(conflict);

    // Persist manual intervention request
    await this.persistManualInterventionRequest(conflict, recommendation);
  }

  /**
   * Get conflict analytics and statistics
   */
  async getConflictAnalytics(
    whiteboardId?: string,
    timeRange?: { start: Date; end: Date }
  ): Promise<ConflictAnalytics> {
    try {
      // Build query filters
      let whereClause = '1=1';
      const params: any[] = [];
      let paramIndex = 1;

      if (whiteboardId) {
        whereClause += ` AND whiteboard_id = $${paramIndex++}`;
        params.push(whiteboardId);
      }

      if (timeRange) {
        whereClause += ` AND timestamp >= $${paramIndex++} AND timestamp <= $${paramIndex++}`;
        params.push(timeRange.start.toISOString(), timeRange.end.toISOString());
      }

      // Get conflict statistics
      const conflictStatsQuery = `
        SELECT 
          COUNT(*) as total_conflicts,
          details->>'conflictType' as conflict_type,
          details->>'severity' as severity,
          AVG(CASE WHEN details->>'resolutionTime' IS NOT NULL 
              THEN (details->>'resolutionTime')::integer 
              ELSE NULL END) as avg_resolution_time,
          COUNT(CASE WHEN action = 'resolution_succeeded' THEN 1 END) as successful_resolutions,
          COUNT(CASE WHEN details->>'resolutionStrategy' NOT IN ('manual') THEN 1 END) as automatic_attempts
        FROM whiteboard_conflict_audit_log
        WHERE ${whereClause}
        GROUP BY details->>'conflictType', details->>'severity'
      `;

      const statsResult = await this.db.query(conflictStatsQuery, params);

      // Calculate aggregated analytics
      const analytics: ConflictAnalytics = {
        totalConflicts: 0,
        conflictsByType: {} as Record<ConflictType, number>,
        conflictsBySeverity: {} as Record<ConflictSeverity, number>,
        averageResolutionTime: 0,
        resolutionSuccessRate: 0,
        automaticResolutionRate: 0,
        userConflictParticipation: {},
        peakConflictHours: [],
        conflictTrends: []
      };

      let totalResolutionTime = 0;
      let totalResolutions = 0;
      let totalSuccessfulResolutions = 0;
      let totalAutomaticAttempts = 0;

      for (const row of statsResult.rows) {
        const conflictType = row.conflict_type as ConflictType;
        const severity = row.severity as ConflictSeverity;
        const count = parseInt(row.total_conflicts);

        analytics.totalConflicts += count;
        
        if (conflictType) {
          analytics.conflictsByType[conflictType] = (analytics.conflictsByType[conflictType] || 0) + count;
        }
        
        if (severity) {
          analytics.conflictsBySeverity[severity] = (analytics.conflictsBySeverity[severity] || 0) + count;
        }

        if (row.avg_resolution_time) {
          totalResolutionTime += parseFloat(row.avg_resolution_time) * count;
          totalResolutions += count;
        }

        totalSuccessfulResolutions += parseInt(row.successful_resolutions);
        totalAutomaticAttempts += parseInt(row.automatic_attempts);
      }

      // Calculate rates
      analytics.averageResolutionTime = totalResolutions > 0 ? totalResolutionTime / totalResolutions : 0;
      analytics.resolutionSuccessRate = analytics.totalConflicts > 0 ? totalSuccessfulResolutions / analytics.totalConflicts : 0;
      analytics.automaticResolutionRate = analytics.totalConflicts > 0 ? totalAutomaticAttempts / analytics.totalConflicts : 0;

      // Get user participation data
      const userParticipationQuery = `
        SELECT 
          user_id,
          COUNT(*) as participation_count
        FROM whiteboard_conflict_audit_log
        WHERE ${whereClause}
        GROUP BY user_id
      `;

      const participationResult = await this.db.query(userParticipationQuery, params);
      for (const row of participationResult.rows) {
        analytics.userConflictParticipation[row.user_id] = parseInt(row.participation_count);
      }

      // Get peak conflict hours
      const peakHoursQuery = `
        SELECT 
          EXTRACT(HOUR FROM timestamp::timestamp) as hour,
          COUNT(*) as count
        FROM whiteboard_conflict_audit_log
        WHERE ${whereClause}
        GROUP BY EXTRACT(HOUR FROM timestamp::timestamp)
        ORDER BY count DESC
        LIMIT 24
      `;

      const peakHoursResult = await this.db.query(peakHoursQuery, params);
      analytics.peakConflictHours = peakHoursResult.rows.map(row => ({
        hour: parseInt(row.hour),
        count: parseInt(row.count)
      }));

      // Get conflict trends (daily)
      const trendsQuery = `
        SELECT 
          DATE(timestamp) as date,
          COUNT(*) as count
        FROM whiteboard_conflict_audit_log
        WHERE ${whereClause}
        GROUP BY DATE(timestamp)
        ORDER BY date DESC
        LIMIT 30
      `;

      const trendsResult = await this.db.query(trendsQuery, params);
      analytics.conflictTrends = trendsResult.rows.map(row => ({
        timestamp: row.date,
        count: parseInt(row.count)
      }));

      return analytics;

    } catch (error) {
      this.logger.error('Failed to get conflict analytics', { error, whiteboardId });
      throw error;
    }
  }

  /**
   * Get active conflicts requiring attention
   */
  getActiveConflicts(): ConflictInfo[] {
    return Array.from(this.activeConflicts.values())
      .filter(conflict => !conflict.resolvedAt)
      .sort((a, b) => {
        // Sort by severity then by timestamp
        const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
        const aSeverity = severityOrder[a.severity];
        const bSeverity = severityOrder[b.severity];
        
        if (aSeverity !== bSeverity) {
          return bSeverity - aSeverity;
        }
        
        return new Date(a.detectedAt).getTime() - new Date(b.detectedAt).getTime();
      });
  }

  /**
   * Get pending manual interventions
   */
  getPendingManualInterventions(): ConflictInfo[] {
    return this.resolutionQueue.filter(conflict => 
      !conflict.resolvedAt && 
      conflict.resolutionStrategy === 'manual'
    );
  }

  /**
   * Get conflict notifications
   */
  getConflictNotifications(userId?: string): ConflictNotification[] {
    const notifications = Array.from(this.notifications.values());
    
    if (userId) {
      return notifications.filter(notification => 
        notification.affectedUsers.includes(userId)
      );
    }
    
    return notifications;
  }

  /**
   * Acknowledge conflict notification
   */
  async acknowledgeNotification(notificationId: string, userId: string): Promise<void> {
    const notification = this.notifications.get(notificationId);
    if (notification && notification.affectedUsers.includes(userId)) {
      notification.acknowledged = true;
      this.logger.info('Conflict notification acknowledged', { notificationId, userId });
    }
  }

  // Private helper methods

  private createDefaultConfig(overrides?: Partial<ConflictResolutionConfig>): ConflictResolutionConfig {
    return {
      automaticResolutionEnabled: true,
      maxAutomaticResolutionAttempts: 3,
      conflictTimeoutMs: 30000,
      userPriorityWeights: {},
      severityThresholds: {
        spatial: { low: 0.1, medium: 0.4, high: 0.7 },
        temporal: { low: 1000, medium: 500, high: 100 },
        semantic: { low: 1, medium: 3, high: 5 }
      },
      resolutionStrategies: {
        default: 'automatic',
        byConflictType: {
          spatial: 'last-write-wins',
          temporal: 'priority-user',
          semantic: 'merge',
          ordering: 'last-write-wins',
          dependency: 'manual',
          compound: 'manual'
        },
        bySeverity: {
          low: 'automatic',
          medium: 'automatic',
          high: 'manual',
          critical: 'manual'
        }
      },
      performanceThresholds: {
        maxLatencyMs: 500,
        maxMemoryUsageMB: 1024,
        maxQueueSize: 1000
      },
      ...overrides
    };
  }

  private calculateBaseConfidence(conflict: ConflictInfo): number {
    let confidence = 0.8; // Base confidence

    // Adjust based on conflict type
    switch (conflict.type) {
      case 'temporal':
        confidence = 0.9; // High confidence for temporal conflicts
        break;
      case 'spatial':
        confidence = 0.7; // Medium confidence for spatial conflicts
        break;
      case 'semantic':
        confidence = 0.5; // Lower confidence for semantic conflicts
        break;
      case 'compound':
        confidence = 0.3; // Low confidence for compound conflicts
        break;
    }

    // Adjust based on severity
    switch (conflict.severity) {
      case 'low':
        confidence += 0.1;
        break;
      case 'medium':
        break; // No adjustment
      case 'high':
        confidence -= 0.1;
        break;
      case 'critical':
        confidence -= 0.2;
        break;
    }

    return Math.max(0.1, Math.min(0.95, confidence));
  }

  private assessConflictComplexity(conflict: ConflictInfo): number {
    let complexity = 0;

    // Base complexity from operation count
    complexity += Math.min(conflict.operations.length / 10, 0.5);

    // Add complexity for spatial overlaps
    if (conflict.spatialOverlap?.percentage) {
      complexity += conflict.spatialOverlap.percentage * 0.3;
    }

    // Add complexity for semantic conflicts
    if (conflict.semanticConflict?.incompatibleChanges?.length) {
      complexity += Math.min(conflict.semanticConflict.incompatibleChanges.length / 5, 0.4);
    }

    return Math.min(complexity, 1);
  }

  private selectOptimalStrategy(conflict: ConflictInfo, confidence: number): ResolutionStrategy {
    // Use severity-based strategy for high confidence
    if (confidence > 0.8) {
      return this.config.resolutionStrategies.bySeverity[conflict.severity] || 'automatic';
    }

    // Use type-based strategy for medium confidence
    if (confidence > 0.5) {
      return this.config.resolutionStrategies.byConflictType[conflict.type] || 'automatic';
    }

    // Use manual for low confidence
    return 'manual';
  }

  private estimateResolutionTime(conflict: ConflictInfo, strategy: ResolutionStrategy): number {
    const baseTime = {
      'last-write-wins': 50,
      'priority-user': 100,
      'merge': 200,
      'automatic': 150,
      'manual': 0
    };

    let estimatedTime = baseTime[strategy] || 100;

    // Adjust for conflict complexity
    estimatedTime *= (1 + this.assessConflictComplexity(conflict));

    // Adjust for operation count
    estimatedTime *= (1 + conflict.operations.length * 0.1);

    return Math.round(estimatedTime);
  }

  private assessRiskLevel(conflict: ConflictInfo, strategy: ResolutionStrategy): 'low' | 'medium' | 'high' {
    if (strategy === 'manual') return 'low'; // Manual is safest
    if (conflict.severity === 'critical') return 'high';
    if (conflict.type === 'semantic' && strategy !== 'merge') return 'high';
    if (conflict.operations.length > 5) return 'medium';
    return 'low';
  }

  private generateAlternativeStrategies(
    conflict: ConflictInfo,
    primaryStrategy: ResolutionStrategy
  ): Array<{ strategy: ResolutionStrategy; confidence: number; pros: string[]; cons: string[] }> {
    const alternatives: ResolutionStrategy[] = ['last-write-wins', 'priority-user', 'merge', 'manual']
      .filter(strategy => strategy !== primaryStrategy);

    return alternatives.map(strategy => ({
      strategy,
      confidence: this.calculateStrategyConfidence(conflict, strategy),
      pros: this.getStrategyPros(strategy, conflict),
      cons: this.getStrategyCons(strategy, conflict)
    })).sort((a, b) => b.confidence - a.confidence);
  }

  private calculateStrategyConfidence(conflict: ConflictInfo, strategy: ResolutionStrategy): number {
    // Simplified confidence calculation for alternatives
    const baseConfidence = this.calculateBaseConfidence(conflict);
    
    switch (strategy) {
      case 'last-write-wins':
        return baseConfidence * 0.9;
      case 'priority-user':
        return baseConfidence * 0.8;
      case 'merge':
        return conflict.type === 'semantic' ? baseConfidence * 0.9 : baseConfidence * 0.6;
      case 'manual':
        return 0.95; // Manual always high confidence but slow
      default:
        return baseConfidence * 0.7;
    }
  }

  private getStrategyPros(strategy: ResolutionStrategy, conflict: ConflictInfo): string[] {
    const pros: Record<ResolutionStrategy, string[]> = {
      'last-write-wins': ['Fast resolution', 'Simple logic', 'Consistent behavior'],
      'priority-user': ['Respects user hierarchy', 'Predictable outcomes'],
      'merge': ['Preserves all changes', 'Collaborative approach'],
      'manual': ['Human oversight', 'Complex conflict handling'],
      'automatic': ['Fast and intelligent', 'Adaptive strategy selection']
    };
    
    return pros[strategy] || [];
  }

  private getStrategyCons(strategy: ResolutionStrategy, conflict: ConflictInfo): string[] {
    const cons: Record<ResolutionStrategy, string[]> = {
      'last-write-wins': ['May lose important changes', 'Not collaborative'],
      'priority-user': ['Requires user priority configuration', 'May seem unfair'],
      'merge': ['May create inconsistent state', 'Complex logic'],
      'manual': ['Slow resolution', 'Requires user intervention'],
      'automatic': ['May not handle edge cases', 'Less predictable']
    };
    
    return cons[strategy] || [];
  }

  private generateReasoningExplanation(
    conflict: ConflictInfo,
    strategy: ResolutionStrategy,
    confidence: number
  ): string {
    const parts = [
      `Conflict type: ${conflict.type}`,
      `Severity: ${conflict.severity}`,
      `Operations involved: ${conflict.operations.length}`,
      `Confidence: ${(confidence * 100).toFixed(1)}%`
    ];

    if (strategy === 'automatic') {
      parts.push('Using automatic strategy selection for optimal resolution');
    } else {
      parts.push(`Selected ${strategy} strategy based on conflict characteristics`);
    }

    return parts.join('. ');
  }

  private async applyResolutionStrategy(
    conflict: ConflictInfo,
    strategy: ResolutionStrategy,
    context: EnhancedTransformContext
  ): Promise<EnhancedWhiteboardOperation | null> {
    // This would integrate with the OT engine's resolution strategies
    // For now, return a simplified resolution
    if (conflict.operations.length === 0) return null;

    switch (strategy) {
      case 'last-write-wins':
        return conflict.operations.sort((a, b) => 
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        )[0];
      
      case 'priority-user':
        // Use first operation as fallback
        return conflict.operations[0];
      
      case 'merge':
        // Simplified merge - would use proper merge logic
        const merged = { ...conflict.operations[0] };
        for (let i = 1; i < conflict.operations.length; i++) {
          const op = conflict.operations[i];
          merged.data = { ...merged.data, ...op.data };
          merged.style = { ...merged.style, ...op.style };
        }
        return merged;
      
      default:
        return null;
    }
  }

  private async logConflictResolution(
    conflict: ConflictInfo,
    action: 'resolution_attempted' | 'resolution_succeeded' | 'resolution_failed',
    context: EnhancedTransformContext,
    errorMessage?: string
  ): Promise<void> {
    const auditEntry: ConflictAuditEntry = {
      id: randomUUID(),
      conflictId: conflict.id,
      whiteboardId: '', // Would extract from context
      sessionId: '', // Would extract from context
      userId: conflict.operations[0]?.userId || '',
      action,
      details: {
        conflictType: conflict.type,
        severity: conflict.severity,
        operations: conflict.operations,
        resolutionStrategy: conflict.resolutionStrategy,
        resolutionTime: conflict.resolutionTime,
        errorMessage,
        confidence: conflict.resolution?.confidence
      },
      timestamp: new Date().toISOString(),
      metadata: {
        clientVersion: '1.0.0',
        userAgent: 'WhiteboardClient/1.0',
        performanceMetrics: context.performanceMetrics
      }
    };

    this.conflictHistory.push(auditEntry);

    // Persist to database
    try {
      await this.persistAuditEntry(auditEntry);
    } catch (error) {
      this.logger.error('Failed to persist audit entry', { error, conflictId: conflict.id });
    }
  }

  private async sendConflictNotification(
    conflict: ConflictInfo,
    type: ConflictNotification['type']
  ): Promise<void> {
    // Implementation would send real-time notifications via WebSocket
    this.logger.info('Sending conflict notification', {
      conflictId: conflict.id,
      type,
      affectedUsers: conflict.operations.map(op => op.userId)
    });
  }

  private updateConflictAnalytics(conflict: ConflictInfo, resolved: boolean): void {
    // Update in-memory analytics
    // In production, this would update persistent analytics storage
  }

  private async persistAuditEntry(entry: ConflictAuditEntry): Promise<void> {
    const query = `
      INSERT INTO whiteboard_conflict_audit_log (
        id, conflict_id, whiteboard_id, session_id, user_id, action, details, timestamp, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `;

    await this.db.query(query, [
      entry.id,
      entry.conflictId,
      entry.whiteboardId,
      entry.sessionId,
      entry.userId,
      entry.action,
      JSON.stringify(entry.details),
      entry.timestamp,
      JSON.stringify(entry.metadata)
    ]);
  }

  private async persistManualInterventionRequest(
    conflict: ConflictInfo,
    recommendation?: ResolutionRecommendation
  ): Promise<void> {
    // Persist manual intervention request for later processing
    const query = `
      INSERT INTO whiteboard_manual_interventions (
        id, conflict_id, recommendation, status, created_at
      ) VALUES ($1, $2, $3, $4, $5)
    `;

    await this.db.query(query, [
      randomUUID(),
      conflict.id,
      JSON.stringify(recommendation),
      'pending',
      new Date().toISOString()
    ]);
  }

  private startConflictProcessor(): void {
    // Start background processing of conflicts
    this.conflictProcessorInterval = setInterval(() => {
      this.processConflictQueue();
    }, 1000); // Process every second

    // Cleanup expired conflicts
    this.conflictCleanupInterval = setInterval(() => {
      this.cleanupExpiredConflicts();
    }, 60000); // Cleanup every minute
  }

  shutdown(): void {
    if (this.conflictProcessorInterval) clearInterval(this.conflictProcessorInterval);
    if (this.conflictCleanupInterval) clearInterval(this.conflictCleanupInterval);
    this.conflictProcessorInterval = null;
    this.conflictCleanupInterval = null;
  }

  private async processConflictQueue(): Promise<void> {
    if (this.resolutionQueue.length === 0) return;

    // Process conflicts in priority order
    const conflict = this.resolutionQueue.shift();
    if (!conflict) return;

    try {
      // Attempt automatic resolution if enabled
      if (this.config.automaticResolutionEnabled && conflict.resolutionStrategy !== 'manual') {
        const context = {} as EnhancedTransformContext; // Would get from current context
        await this.resolveConflictAutomatically(conflict, context);
      }
    } catch (error) {
      this.logger.error('Failed to process conflict from queue', { 
        error, 
        conflictId: conflict.id 
      });
    }
  }

  private cleanupExpiredConflicts(): void {
    const now = Date.now();
    const expiredConflicts = Array.from(this.activeConflicts.values())
      .filter(conflict => 
        now - new Date(conflict.detectedAt).getTime() > this.config.conflictTimeoutMs
      );

    for (const conflict of expiredConflicts) {
      this.logger.warn('Conflict expired without resolution', { conflictId: conflict.id });
      this.activeConflicts.delete(conflict.id);
    }
  }
}