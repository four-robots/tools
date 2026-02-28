/**
 * Federation Audit Logger Service
 * 
 * Comprehensive audit logging for all federation security events and operations.
 * Ensures compliance with security monitoring and regulatory requirements.
 * 
 * Part of Security Fix: Comprehensive Audit Logging
 */

import { logger } from '../../utils/logger.js';
import { DatabaseConnectionPool } from '../../utils/database-pool.js';
import crypto from 'crypto';

export interface FederationSecurityEvent {
  tenantId: string;
  eventType: string;
  sourceNodeId?: string;
  targetNodeId?: string;
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
  details: Record<string, unknown>;
  riskScore?: number;
  complianceStatus: 'compliant' | 'violation' | 'warning';
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface FederationAuditEntry {
  id: string;
  tenantId: string;
  eventType: string;
  activityType: string;
  resourceType: string;
  resourceId?: string;
  actionPerformed: string;
  sourceNodeId?: string;
  targetNodeId?: string;
  userId?: string;
  userRole?: string;
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
  requestId?: string;
  apiEndpoint?: string;
  requestPayloadHash?: string;
  responsePayloadHash?: string;
  processingTimeMs?: number;
  complianceStatus: string;
  violationDetails?: Record<string, unknown>;
  riskScore: number;
  privacyImpactScore: number;
  automatedDecisionInvolved: boolean;
  humanReviewRequired: boolean;
  blockchainHash?: string;
  timestamp: string;
}

export class FederationAuditLogger {
  private db: DatabaseConnectionPool;

  constructor() {
    this.db = new DatabaseConnectionPool();
  }

  // ===================
  // SECURITY EVENT LOGGING
  // ===================

  /**
   * Log a comprehensive federation security event
   */
  async logSecurityEvent(event: FederationSecurityEvent): Promise<void> {
    try {
      const auditEntry: Partial<FederationAuditEntry> = {
        id: crypto.randomUUID(),
        tenantId: event.tenantId,
        eventType: event.eventType,
        activityType: 'federation_security',
        resourceType: 'security_manager',
        resourceId: 'federation_security_manager',
        actionPerformed: event.eventType,
        sourceNodeId: event.sourceNodeId,
        targetNodeId: event.targetNodeId,
        userId: event.userId,
        ipAddress: event.ipAddress,
        userAgent: event.userAgent,
        processingTimeMs: Date.now() - (event.details.startTime as number || Date.now()),
        complianceStatus: event.complianceStatus,
        riskScore: event.riskScore || 0.0,
        privacyImpactScore: this.calculatePrivacyImpact(event),
        automatedDecisionInvolved: true,
        humanReviewRequired: event.severity === 'critical' || event.complianceStatus === 'violation',
        timestamp: new Date().toISOString()
      };

      // Hash sensitive details
      auditEntry.requestPayloadHash = this.hashSensitiveData(event.details);
      auditEntry.blockchainHash = await this.generateBlockchainHash(auditEntry);

      // Store in cross-org audit trails table
      await this.db.db
        .insertInto('cross_org_audit_trails')
        .values({
          id: auditEntry.id,
          source_tenant_id: event.tenantId,
          target_tenant_id: event.targetNodeId ? undefined : null,
          target_node_id: event.targetNodeId || null,
          activity_type: auditEntry.activityType,
          resource_type: auditEntry.resourceType,
          resource_id: auditEntry.resourceId,
          action_performed: auditEntry.actionPerformed,
          data_categories_involved: JSON.stringify(this.extractDataCategories(event.details)),
          jurisdictions_involved: JSON.stringify(this.extractJurisdictions(event)),
          compliance_policies_applied: JSON.stringify([]),
          consent_records: JSON.stringify({}),
          data_minimization_applied: true,
          encryption_details: JSON.stringify({
            algorithm: 'AES-256-GCM',
            key_rotation: true,
            at_rest_encryption: true
          }),
          access_controls_applied: JSON.stringify({
            rbac: true,
            mfa: event.eventType.includes('auth'),
            ip_restrictions: !!event.ipAddress
          }),
          purpose_limitation: 'Federation security monitoring and compliance',
          legal_basis: 'Legitimate interest - security monitoring',
          user_id: event.userId,
          ip_address: event.ipAddress,
          user_agent: event.userAgent,
          request_payload_hash: auditEntry.requestPayloadHash,
          processing_time_ms: auditEntry.processingTimeMs,
          compliance_status: event.complianceStatus,
          violation_details: event.complianceStatus === 'violation' ? event.details : null,
          risk_score: event.riskScore || 0.0,
          privacy_impact_score: auditEntry.privacyImpactScore,
          automated_decision_involved: auditEntry.automatedDecisionInvolved,
          human_review_required: auditEntry.humanReviewRequired,
          blockchain_hash: auditEntry.blockchainHash,
          timestamp: auditEntry.timestamp
        })
        .execute();

      // Log to application logger based on severity
      const logMessage = `Federation security event: ${event.eventType}`;
      const logContext = {
        tenantId: event.tenantId,
        eventType: event.eventType,
        severity: event.severity,
        complianceStatus: event.complianceStatus,
        riskScore: event.riskScore
      };

      switch (event.severity) {
        case 'critical':
          logger.error(logMessage, logContext);
          break;
        case 'high':
          logger.warn(logMessage, logContext);
          break;
        case 'medium':
          logger.info(logMessage, logContext);
          break;
        case 'low':
        default:
          logger.debug(logMessage, logContext);
          break;
      }

      // Trigger alerts for critical events
      if (event.severity === 'critical' || event.complianceStatus === 'violation') {
        await this.triggerSecurityAlert(event);
      }

    } catch (error) {
      logger.error('Failed to log federation security event:', error);
      // Don't throw - logging failures shouldn't break the main operation
    }
  }

  /**
   * Log federation authentication events
   */
  async logAuthenticationEvent(
    tenantId: string,
    eventType: 'login_attempt' | 'login_success' | 'login_failure' | 'logout' | 'token_refresh',
    userId: string,
    nodeId?: string,
    details?: Record<string, unknown>
  ): Promise<void> {
    const severity = eventType === 'login_failure' ? 'high' : 'medium';
    const complianceStatus = eventType === 'login_failure' ? 'warning' : 'compliant';

    await this.logSecurityEvent({
      tenantId,
      eventType: `federation_auth_${eventType}`,
      sourceNodeId: nodeId,
      userId,
      details: details || {},
      severity,
      complianceStatus,
      riskScore: this.calculateAuthRiskScore(eventType, details)
    });
  }

  /**
   * Log data access and transfer events
   */
  async logDataAccessEvent(
    tenantId: string,
    eventType: 'search_request' | 'data_sync' | 'content_access' | 'bulk_export',
    sourceNodeId: string,
    targetNodeId: string,
    dataCategories: string[],
    details?: Record<string, unknown>
  ): Promise<void> {
    const riskScore = this.calculateDataAccessRiskScore(dataCategories, details);
    const severity = riskScore > 0.7 ? 'high' : riskScore > 0.4 ? 'medium' : 'low';

    await this.logSecurityEvent({
      tenantId,
      eventType: `federation_data_${eventType}`,
      sourceNodeId,
      targetNodeId,
      details: {
        ...details,
        dataCategories,
        crossBorderTransfer: await this.isCrossBorderTransfer(sourceNodeId, targetNodeId)
      },
      severity,
      complianceStatus: 'compliant',
      riskScore
    });
  }

  /**
   * Log encryption and certificate events
   */
  async logEncryptionEvent(
    tenantId: string,
    eventType: 'key_generation' | 'key_rotation' | 'cert_issued' | 'cert_expired' | 'cert_revoked',
    resourceId: string,
    details?: Record<string, unknown>
  ): Promise<void> {
    const severity = ['cert_expired', 'cert_revoked'].includes(eventType) ? 'high' : 'medium';
    const complianceStatus = eventType === 'cert_expired' ? 'violation' : 'compliant';

    await this.logSecurityEvent({
      tenantId,
      eventType: `federation_crypto_${eventType}`,
      details: {
        ...details,
        resourceId,
        cryptoCompliance: true
      },
      severity,
      complianceStatus,
      riskScore: severity === 'high' ? 0.8 : 0.3
    });
  }

  // ===================
  // COMPLIANCE MONITORING
  // ===================

  /**
   * Generate compliance report for federation activities
   */
  async generateComplianceReport(
    tenantId: string,
    startDate: string,
    endDate: string
  ): Promise<{
    totalEvents: number;
    complianceViolations: number;
    highRiskEvents: number;
    dataTransfers: number;
    authenticationEvents: number;
    encryptionEvents: number;
    averageRiskScore: number;
    topViolationTypes: Array<{ type: string; count: number }>;
    recommendedActions: string[];
  }> {
    try {
      const [totalEvents] = await this.db.db
        .selectFrom('cross_org_audit_trails')
        .select((eb) => eb.fn.count<number>('id').as('count'))
        .where('source_tenant_id', '=', tenantId)
        .where('timestamp', '>=', startDate)
        .where('timestamp', '<=', endDate)
        .execute();

      const [violations] = await this.db.db
        .selectFrom('cross_org_audit_trails')
        .select((eb) => eb.fn.count<number>('id').as('count'))
        .where('source_tenant_id', '=', tenantId)
        .where('compliance_status', '=', 'violation')
        .where('timestamp', '>=', startDate)
        .where('timestamp', '<=', endDate)
        .execute();

      const [highRisk] = await this.db.db
        .selectFrom('cross_org_audit_trails')
        .select((eb) => eb.fn.count<number>('id').as('count'))
        .where('source_tenant_id', '=', tenantId)
        .where('risk_score', '>', 0.7)
        .where('timestamp', '>=', startDate)
        .where('timestamp', '<=', endDate)
        .execute();

      const [authEvents] = await this.db.db
        .selectFrom('cross_org_audit_trails')
        .select((eb) => eb.fn.count<number>('id').as('count'))
        .where('source_tenant_id', '=', tenantId)
        .where('activity_type', 'like', '%auth%')
        .where('timestamp', '>=', startDate)
        .where('timestamp', '<=', endDate)
        .execute();

      const [avgRisk] = await this.db.db
        .selectFrom('cross_org_audit_trails')
        .select((eb) => eb.fn.avg<number>('risk_score').as('avg'))
        .where('source_tenant_id', '=', tenantId)
        .where('timestamp', '>=', startDate)
        .where('timestamp', '<=', endDate)
        .execute();

      // Get top violation types
      const topViolations = await this.db.db
        .selectFrom('cross_org_audit_trails')
        .select(['activity_type', (eb) => eb.fn.count<number>('id').as('count')])
        .where('source_tenant_id', '=', tenantId)
        .where('compliance_status', '=', 'violation')
        .where('timestamp', '>=', startDate)
        .where('timestamp', '<=', endDate)
        .groupBy('activity_type')
        .orderBy('count', 'desc')
        .limit(5)
        .execute();

      const recommendedActions = this.generateRecommendations({
        totalEvents: totalEvents.count,
        violations: violations.count,
        highRisk: highRisk.count,
        avgRisk: avgRisk.avg || 0
      });

      return {
        totalEvents: totalEvents.count,
        complianceViolations: violations.count,
        highRiskEvents: highRisk.count,
        dataTransfers: 0, // Would calculate from specific activity types
        authenticationEvents: authEvents.count,
        encryptionEvents: 0, // Would calculate from crypto events
        averageRiskScore: avgRisk.avg || 0,
        topViolationTypes: topViolations.map(v => ({ type: v.activity_type, count: v.count })),
        recommendedActions
      };

    } catch (error) {
      logger.error('Failed to generate compliance report:', error);
      throw new Error(`Failed to generate compliance report: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // ===================
  // PRIVATE HELPER METHODS
  // ===================

  private calculatePrivacyImpact(event: FederationSecurityEvent): number {
    let score = 0.0;

    // Base score based on event type
    if (event.eventType.includes('data') || event.eventType.includes('search')) {
      score += 0.3;
    }

    if (event.eventType.includes('export') || event.eventType.includes('sync')) {
      score += 0.4;
    }

    // Increase score for cross-border operations
    if (event.sourceNodeId && event.targetNodeId) {
      score += 0.2;
    }

    // Increase score for personal data
    const personalDataKeywords = ['user', 'personal', 'contact', 'email', 'phone'];
    const hasPersonalData = personalDataKeywords.some(keyword => 
      JSON.stringify(event.details).toLowerCase().includes(keyword)
    );
    if (hasPersonalData) {
      score += 0.3;
    }

    return Math.min(score, 1.0);
  }

  private hashSensitiveData(data: Record<string, unknown>): string {
    const sanitizedData = { ...data };
    
    // Remove sensitive fields before hashing
    const sensitiveFields = ['password', 'token', 'key', 'secret', 'certificate'];
    sensitiveFields.forEach(field => {
      if (field in sanitizedData) {
        sanitizedData[field] = '[REDACTED]';
      }
    });

    return crypto
      .createHash('sha256')
      .update(JSON.stringify(sanitizedData))
      .digest('hex');
  }

  private async generateBlockchainHash(entry: Partial<FederationAuditEntry>): Promise<string> {
    // In a real implementation, this would integrate with a blockchain service
    // For now, create a cryptographic hash that could be used for audit integrity
    const data = {
      id: entry.id,
      tenantId: entry.tenantId,
      timestamp: entry.timestamp,
      eventType: entry.eventType,
      actionPerformed: entry.actionPerformed
    };

    return crypto
      .createHash('sha256')
      .update(`federation_audit:${JSON.stringify(data)}`)
      .digest('hex');
  }

  private extractDataCategories(details: Record<string, unknown>): string[] {
    const categories: string[] = [];
    
    // Analyze details to identify data categories
    const detailsStr = JSON.stringify(details).toLowerCase();
    
    if (detailsStr.includes('personal') || detailsStr.includes('user')) {
      categories.push('personal_data');
    }
    if (detailsStr.includes('financial') || detailsStr.includes('payment')) {
      categories.push('financial_data');
    }
    if (detailsStr.includes('health') || detailsStr.includes('medical')) {
      categories.push('health_data');
    }
    
    return categories.length > 0 ? categories : ['general'];
  }

  private extractJurisdictions(event: FederationSecurityEvent): string[] {
    // In a real implementation, this would map node IDs to jurisdictions
    const jurisdictions = ['US']; // Default jurisdiction
    
    if (event.sourceNodeId || event.targetNodeId) {
      // Add logic to determine jurisdictions based on node locations
      jurisdictions.push('UNKNOWN');
    }
    
    return jurisdictions;
  }

  private calculateAuthRiskScore(eventType: string, details?: Record<string, unknown>): number {
    let score = 0.1; // Base score

    if (eventType === 'login_failure') {
      score += 0.6;
    }

    // Increase score for suspicious patterns
    if (details) {
      if (details.failureCount && typeof details.failureCount === 'number' && details.failureCount > 3) {
        score += 0.3;
      }
      if (details.unusualLocation) {
        score += 0.2;
      }
    }

    return Math.min(score, 1.0);
  }

  private calculateDataAccessRiskScore(dataCategories: string[], details?: Record<string, unknown>): number {
    let score = 0.1; // Base score

    // Increase score for sensitive data categories
    const sensitiveCategories = ['personal_data', 'financial_data', 'health_data'];
    const hasSensitiveData = dataCategories.some(cat => sensitiveCategories.includes(cat));
    if (hasSensitiveData) {
      score += 0.4;
    }

    // Increase score for bulk operations
    if (details?.operation === 'bulk_export') {
      score += 0.3;
    }

    // Increase score for cross-border transfers
    if (details?.crossBorderTransfer) {
      score += 0.2;
    }

    return Math.min(score, 1.0);
  }

  private async isCrossBorderTransfer(sourceNodeId: string, targetNodeId: string): Promise<boolean> {
    try {
      const [sourceNode, targetNode] = await Promise.all([
        this.db.db
          .selectFrom('federation_nodes')
          .select('geographic_region')
          .where('id', '=', sourceNodeId)
          .executeTakeFirst(),
        this.db.db
          .selectFrom('federation_nodes')
          .select('geographic_region')
          .where('id', '=', targetNodeId)
          .executeTakeFirst()
      ]);

      if (!sourceNode || !targetNode) {
        return true; // Assume cross-border if unknown
      }

      return sourceNode.geographic_region !== targetNode.geographic_region;
    } catch (error) {
      return true; // Assume cross-border if check fails
    }
  }

  private async triggerSecurityAlert(event: FederationSecurityEvent): Promise<void> {
    try {
      // In a real implementation, this would integrate with alerting systems
      // For now, just log the critical event
      logger.error('CRITICAL FEDERATION SECURITY ALERT', {
        tenantId: event.tenantId,
        eventType: event.eventType,
        severity: event.severity,
        complianceStatus: event.complianceStatus,
        riskScore: event.riskScore,
        timestamp: new Date().toISOString()
      });

      // Could integrate with:
      // - Email/SMS notifications
      // - Slack/Teams webhooks
      // - PagerDuty/OpsGenie
      // - Security Information and Event Management (SIEM) systems
    } catch (error) {
      logger.error('Failed to trigger security alert:', error);
    }
  }

  private generateRecommendations(metrics: {
    totalEvents: number;
    violations: number;
    highRisk: number;
    avgRisk: number;
  }): string[] {
    const recommendations: string[] = [];

    if (metrics.violations > 0) {
      recommendations.push('Review and remediate compliance violations immediately');
      recommendations.push('Update security policies to prevent future violations');
    }

    if (metrics.highRisk > metrics.totalEvents * 0.1) {
      recommendations.push('Implement additional security controls for high-risk operations');
    }

    if (metrics.avgRisk > 0.5) {
      recommendations.push('Consider enhancing overall security posture');
      recommendations.push('Review and update risk assessment procedures');
    }

    if (recommendations.length === 0) {
      recommendations.push('Maintain current security practices');
      recommendations.push('Continue regular monitoring and assessment');
    }

    return recommendations;
  }
}