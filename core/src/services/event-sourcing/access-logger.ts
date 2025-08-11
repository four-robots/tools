import { Pool } from 'pg';
import { logger } from '../../utils/logger';
import { DomainEvent } from '../../shared/types/event-sourcing';

export interface AccessLogEntry {
  id: string;
  userId: string;
  operation: 'read' | 'write' | 'subscribe' | 'unsubscribe' | 'reconstruct' | 'replay';
  resourceType: 'event' | 'stream' | 'session' | 'snapshot' | 'projection';
  resourceId: string;
  dataSubject?: string; // For GDPR compliance - the person the data relates to
  purpose: string; // Business purpose for the access
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
  sessionId?: string;
  tenantId?: string;
  timestamp: Date;
  metadata: Record<string, unknown>;
  gdprLawfulBasis?: 'consent' | 'contract' | 'legal_obligation' | 'vital_interests' | 'public_task' | 'legitimate_interests';
  retentionPeriod?: number; // Days to retain this log entry
  isAutomated: boolean; // Whether this was an automated system access
  resultCount?: number; // Number of records accessed
  sensitiveDataAccessed: boolean; // Whether sensitive/personal data was accessed
}

export interface DataAccessReport {
  userId: string;
  timeRange: { start: Date; end: Date };
  totalAccesses: number;
  accessesByType: Record<string, number>;
  accessesByResource: Record<string, number>;
  sensitiveDataAccesses: number;
  gdprRelevantAccesses: number;
  automatedAccesses: number;
  accessHistory: AccessLogEntry[];
}

export interface ComplianceAuditReport {
  reportId: string;
  generatedAt: Date;
  timeRange: { start: Date; end: Date };
  totalAccesses: number;
  userAccessCounts: Record<string, number>;
  resourceAccessCounts: Record<string, number>;
  gdprAccesses: {
    byLawfulBasis: Record<string, number>;
    sensitiveDataAccesses: number;
    dataSubjectRequests: number;
  };
  suspiciousActivity: {
    unusualAccessPatterns: number;
    excessiveDataAccess: number;
    afterHoursAccess: number;
  };
  retentionCompliance: {
    expiredEntries: number;
    retentionPolicyViolations: number;
  };
}

export class AccessLogger {
  private readonly retentionBuffer: Map<string, AccessLogEntry> = new Map();
  private readonly flushInterval: NodeJS.Timeout;
  private readonly defaultRetentionDays = 2555; // 7 years for GDPR compliance

  constructor(
    private readonly pool: Pool,
    private readonly config: {
      bufferSize: number;
      flushIntervalMs: number;
      defaultRetentionDays: number;
      enableGdprTracking: boolean;
    } = {
      bufferSize: 100,
      flushIntervalMs: 5000, // 5 seconds
      defaultRetentionDays: 2555, // 7 years
      enableGdprTracking: true
    }
  ) {
    // Start periodic flush of buffered log entries
    this.flushInterval = setInterval(async () => {
      await this.flushBuffer();
    }, config.flushIntervalMs);

    logger.info('Access logger initialized', {
      bufferSize: config.bufferSize,
      flushIntervalMs: config.flushIntervalMs,
      gdprTrackingEnabled: config.enableGdprTracking
    });
  }

  /**
   * Log event access (read/write operations)
   */
  async logEventAccess(
    userId: string,
    eventId: string,
    operation: 'read' | 'write',
    metadata: {
      eventType?: string;
      streamId?: string;
      sensitiveDataAccessed?: boolean;
      purpose?: string;
      ipAddress?: string;
      userAgent?: string;
      requestId?: string;
      sessionId?: string;
      tenantId?: string;
      dataSubject?: string;
      gdprLawfulBasis?: AccessLogEntry['gdprLawfulBasis'];
    } = {}
  ): Promise<void> {
    const entry: AccessLogEntry = {
      id: this.generateLogId(),
      userId,
      operation,
      resourceType: 'event',
      resourceId: eventId,
      dataSubject: metadata.dataSubject,
      purpose: metadata.purpose || this.inferPurpose(operation, 'event'),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
      requestId: metadata.requestId,
      sessionId: metadata.sessionId,
      tenantId: metadata.tenantId,
      timestamp: new Date(),
      metadata: {
        eventType: metadata.eventType,
        streamId: metadata.streamId,
        ...metadata
      },
      gdprLawfulBasis: metadata.gdprLawfulBasis,
      retentionPeriod: this.calculateRetentionPeriod(metadata.sensitiveDataAccessed),
      isAutomated: this.isAutomatedAccess(metadata.userAgent),
      resultCount: 1,
      sensitiveDataAccessed: metadata.sensitiveDataAccessed || false
    };

    await this.bufferLogEntry(entry);
  }

  /**
   * Log stream access (subscription/unsubscription)
   */
  async logStreamAccess(
    userId: string,
    streamId: string,
    operation: 'subscribe' | 'unsubscribe',
    metadata: {
      eventTypes?: string[];
      filterCriteria?: Record<string, unknown>;
      purpose?: string;
      ipAddress?: string;
      userAgent?: string;
      requestId?: string;
      sessionId?: string;
      tenantId?: string;
      dataSubject?: string;
    } = {}
  ): Promise<void> {
    const entry: AccessLogEntry = {
      id: this.generateLogId(),
      userId,
      operation,
      resourceType: 'stream',
      resourceId: streamId,
      dataSubject: metadata.dataSubject,
      purpose: metadata.purpose || this.inferPurpose(operation, 'stream'),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
      requestId: metadata.requestId,
      sessionId: metadata.sessionId,
      tenantId: metadata.tenantId,
      timestamp: new Date(),
      metadata: {
        eventTypes: metadata.eventTypes,
        filterCriteria: metadata.filterCriteria,
        ...metadata
      },
      gdprLawfulBasis: 'legitimate_interests', // Default for stream subscriptions
      retentionPeriod: this.defaultRetentionDays,
      isAutomated: this.isAutomatedAccess(metadata.userAgent),
      sensitiveDataAccessed: false // Stream subscription doesn't access data directly
    };

    await this.bufferLogEntry(entry);
  }

  /**
   * Log session reconstruction access
   */
  async logReconstructionAccess(
    userId: string,
    sessionId: string,
    pointInTime?: Date,
    metadata: {
      purpose?: string;
      ipAddress?: string;
      userAgent?: string;
      requestId?: string;
      tenantId?: string;
      dataSubject?: string;
      eventCount?: number;
      sensitiveDataAccessed?: boolean;
    } = {}
  ): Promise<void> {
    const entry: AccessLogEntry = {
      id: this.generateLogId(),
      userId,
      operation: 'reconstruct',
      resourceType: 'session',
      resourceId: sessionId,
      dataSubject: metadata.dataSubject,
      purpose: metadata.purpose || 'Session state reconstruction for collaboration',
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
      requestId: metadata.requestId,
      sessionId,
      tenantId: metadata.tenantId,
      timestamp: new Date(),
      metadata: {
        pointInTime: pointInTime?.toISOString(),
        eventCount: metadata.eventCount,
        ...metadata
      },
      gdprLawfulBasis: 'legitimate_interests',
      retentionPeriod: this.calculateRetentionPeriod(metadata.sensitiveDataAccessed),
      isAutomated: this.isAutomatedAccess(metadata.userAgent),
      resultCount: metadata.eventCount || 0,
      sensitiveDataAccessed: metadata.sensitiveDataAccessed || false
    };

    await this.bufferLogEntry(entry);
  }

  /**
   * Log GDPR-specific data access
   */
  async logDataAccess(
    userId: string,
    dataSubject: string,
    purpose: string,
    lawfulBasis: AccessLogEntry['gdprLawfulBasis'],
    metadata: {
      resourceType?: AccessLogEntry['resourceType'];
      resourceId?: string;
      operation?: AccessLogEntry['operation'];
      ipAddress?: string;
      userAgent?: string;
      requestId?: string;
      sessionId?: string;
      tenantId?: string;
      resultCount?: number;
      sensitiveDataAccessed?: boolean;
    } = {}
  ): Promise<void> {
    const entry: AccessLogEntry = {
      id: this.generateLogId(),
      userId,
      operation: metadata.operation || 'read',
      resourceType: metadata.resourceType || 'event',
      resourceId: metadata.resourceId || 'unknown',
      dataSubject,
      purpose,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
      requestId: metadata.requestId,
      sessionId: metadata.sessionId,
      tenantId: metadata.tenantId,
      timestamp: new Date(),
      metadata: {
        gdprDataSubjectRequest: true,
        ...metadata
      },
      gdprLawfulBasis: lawfulBasis,
      retentionPeriod: this.defaultRetentionDays,
      isAutomated: this.isAutomatedAccess(metadata.userAgent),
      resultCount: metadata.resultCount || 0,
      sensitiveDataAccessed: metadata.sensitiveDataAccessed || true // Assume GDPR requests involve sensitive data
    };

    await this.bufferLogEntry(entry);
  }

  /**
   * Generate data access report for a user
   */
  async generateDataAccessReport(
    userId: string,
    timeRange: { start: Date; end: Date }
  ): Promise<DataAccessReport> {
    try {
      const client = await this.pool.connect();
      
      const query = `
        SELECT *
        FROM access_logs
        WHERE user_id = $1 
        AND timestamp BETWEEN $2 AND $3
        ORDER BY timestamp DESC
      `;
      
      const result = await client.query(query, [userId, timeRange.start, timeRange.end]);
      client.release();

      const accessHistory: AccessLogEntry[] = result.rows.map(this.mapRowToAccessLogEntry);
      
      // Calculate summary statistics
      const accessesByType: Record<string, number> = {};
      const accessesByResource: Record<string, number> = {};
      let sensitiveDataAccesses = 0;
      let gdprRelevantAccesses = 0;
      let automatedAccesses = 0;

      accessHistory.forEach(access => {
        accessesByType[access.operation] = (accessesByType[access.operation] || 0) + 1;
        accessesByResource[access.resourceType] = (accessesByResource[access.resourceType] || 0) + 1;
        
        if (access.sensitiveDataAccessed) sensitiveDataAccesses++;
        if (access.gdprLawfulBasis) gdprRelevantAccesses++;
        if (access.isAutomated) automatedAccesses++;
      });

      return {
        userId,
        timeRange,
        totalAccesses: accessHistory.length,
        accessesByType,
        accessesByResource,
        sensitiveDataAccesses,
        gdprRelevantAccesses,
        automatedAccesses,
        accessHistory
      };

    } catch (error) {
      logger.error(`Failed to generate data access report for user ${userId}`, {
        userId,
        timeRange,
        error: error.message
      });
      throw new Error(`Data access report generation failed: ${error.message}`);
    }
  }

  /**
   * Generate compliance audit report
   */
  async generateComplianceAuditReport(
    timeRange: { start: Date; end: Date }
  ): Promise<ComplianceAuditReport> {
    try {
      const client = await this.pool.connect();
      
      // Get all access logs in the time range
      const accessQuery = `
        SELECT *
        FROM access_logs
        WHERE timestamp BETWEEN $1 AND $2
        ORDER BY timestamp DESC
      `;
      
      const accessResult = await client.query(accessQuery, [timeRange.start, timeRange.end]);
      
      // Get retention compliance data
      const retentionQuery = `
        SELECT 
          COUNT(*) FILTER (WHERE timestamp + INTERVAL '1 day' * retention_period < NOW()) as expired_entries,
          COUNT(*) FILTER (WHERE retention_period IS NULL) as no_retention_policy
        FROM access_logs
        WHERE timestamp BETWEEN $1 AND $2
      `;
      
      const retentionResult = await client.query(retentionQuery, [timeRange.start, timeRange.end]);
      client.release();

      const accessLogs: AccessLogEntry[] = accessResult.rows.map(this.mapRowToAccessLogEntry);
      
      // Calculate summary statistics
      const userAccessCounts: Record<string, number> = {};
      const resourceAccessCounts: Record<string, number> = {};
      const gdprByLawfulBasis: Record<string, number> = {};
      let sensitiveDataAccesses = 0;
      let dataSubjectRequests = 0;
      let unusualAccessPatterns = 0;
      let excessiveDataAccess = 0;
      let afterHoursAccess = 0;

      accessLogs.forEach(access => {
        userAccessCounts[access.userId] = (userAccessCounts[access.userId] || 0) + 1;
        resourceAccessCounts[access.resourceType] = (resourceAccessCounts[access.resourceType] || 0) + 1;
        
        if (access.gdprLawfulBasis) {
          gdprByLawfulBasis[access.gdprLawfulBasis] = (gdprByLawfulBasis[access.gdprLawfulBasis] || 0) + 1;
        }
        
        if (access.sensitiveDataAccessed) sensitiveDataAccesses++;
        if (access.dataSubject) dataSubjectRequests++;
        
        // Detect suspicious activity
        if (this.isAfterHours(access.timestamp)) afterHoursAccess++;
        if (access.resultCount && access.resultCount > 1000) excessiveDataAccess++;
      });

      // Detect unusual access patterns (simple heuristic)
      Object.values(userAccessCounts).forEach(count => {
        if (count > 1000) unusualAccessPatterns++; // More than 1000 accesses per user
      });

      return {
        reportId: this.generateLogId(),
        generatedAt: new Date(),
        timeRange,
        totalAccesses: accessLogs.length,
        userAccessCounts,
        resourceAccessCounts,
        gdprAccesses: {
          byLawfulBasis: gdprByLawfulBasis,
          sensitiveDataAccesses,
          dataSubjectRequests
        },
        suspiciousActivity: {
          unusualAccessPatterns,
          excessiveDataAccess,
          afterHoursAccess
        },
        retentionCompliance: {
          expiredEntries: parseInt(retentionResult.rows[0]?.expired_entries || '0'),
          retentionPolicyViolations: parseInt(retentionResult.rows[0]?.no_retention_policy || '0')
        }
      };

    } catch (error) {
      logger.error('Failed to generate compliance audit report', {
        timeRange,
        error: error.message
      });
      throw new Error(`Compliance audit report generation failed: ${error.message}`);
    }
  }

  /**
   * Clean up expired access log entries according to retention policies
   */
  async cleanupExpiredEntries(): Promise<{ deletedCount: number; errors: number }> {
    try {
      const client = await this.pool.connect();
      
      const deleteQuery = `
        DELETE FROM access_logs
        WHERE timestamp + INTERVAL '1 day' * retention_period < NOW()
        RETURNING id
      `;
      
      const result = await client.query(deleteQuery);
      client.release();

      const deletedCount = result.rows.length;
      
      logger.info('Access log cleanup completed', {
        deletedCount,
        cleanupTime: new Date().toISOString()
      });

      return { deletedCount, errors: 0 };

    } catch (error) {
      logger.error('Failed to cleanup expired access log entries', {
        error: error.message
      });
      return { deletedCount: 0, errors: 1 };
    }
  }

  private async bufferLogEntry(entry: AccessLogEntry): Promise<void> {
    this.retentionBuffer.set(entry.id, entry);
    
    // Flush immediately if buffer is full
    if (this.retentionBuffer.size >= this.config.bufferSize) {
      await this.flushBuffer();
    }
  }

  private async flushBuffer(): Promise<void> {
    if (this.retentionBuffer.size === 0) {
      return;
    }

    const entries = Array.from(this.retentionBuffer.values());
    this.retentionBuffer.clear();

    try {
      const client = await this.pool.connect();
      
      const insertQuery = `
        INSERT INTO access_logs (
          id, user_id, operation, resource_type, resource_id, data_subject,
          purpose, ip_address, user_agent, request_id, session_id, tenant_id,
          timestamp, metadata, gdpr_lawful_basis, retention_period, is_automated,
          result_count, sensitive_data_accessed
        ) VALUES ${entries.map((_, i) => 
          `($${i * 19 + 1}, $${i * 19 + 2}, $${i * 19 + 3}, $${i * 19 + 4}, $${i * 19 + 5}, $${i * 19 + 6}, 
           $${i * 19 + 7}, $${i * 19 + 8}, $${i * 19 + 9}, $${i * 19 + 10}, $${i * 19 + 11}, $${i * 19 + 12},
           $${i * 19 + 13}, $${i * 19 + 14}, $${i * 19 + 15}, $${i * 19 + 16}, $${i * 19 + 17}, $${i * 19 + 18}, $${i * 19 + 19})`
        ).join(', ')}
      `;

      const insertParams = entries.flatMap(entry => [
        entry.id, entry.userId, entry.operation, entry.resourceType, entry.resourceId,
        entry.dataSubject, entry.purpose, entry.ipAddress, entry.userAgent,
        entry.requestId, entry.sessionId, entry.tenantId, entry.timestamp,
        JSON.stringify(entry.metadata), entry.gdprLawfulBasis, entry.retentionPeriod,
        entry.isAutomated, entry.resultCount, entry.sensitiveDataAccessed
      ]);

      await client.query(insertQuery, insertParams);
      client.release();

      logger.debug(`Flushed ${entries.length} access log entries to database`);

    } catch (error) {
      logger.error('Failed to flush access log buffer', {
        entryCount: entries.length,
        error: error.message
      });
      
      // Re-queue entries for retry
      entries.forEach(entry => {
        this.retentionBuffer.set(entry.id, entry);
      });
    }
  }

  private generateLogId(): string {
    return `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private inferPurpose(operation: string, resourceType: string): string {
    const purposeMap: Record<string, string> = {
      'read_event': 'Event data retrieval for application functionality',
      'write_event': 'Event data storage for system operation',
      'subscribe_stream': 'Real-time event stream monitoring',
      'unsubscribe_stream': 'Terminating real-time event monitoring',
      'reconstruct_session': 'Session state reconstruction for collaboration'
    };

    return purposeMap[`${operation}_${resourceType}`] || `${operation} operation on ${resourceType}`;
  }

  private calculateRetentionPeriod(sensitiveDataAccessed?: boolean): number {
    return sensitiveDataAccessed ? this.defaultRetentionDays : 365; // 1 year for non-sensitive
  }

  private isAutomatedAccess(userAgent?: string): boolean {
    if (!userAgent) return false;
    
    const automatedPatterns = [
      /bot/i, /crawler/i, /spider/i, /scraper/i,
      /curl/i, /wget/i, /python/i, /java/i,
      /automated/i, /script/i
    ];
    
    return automatedPatterns.some(pattern => pattern.test(userAgent));
  }

  private isAfterHours(timestamp: Date): boolean {
    const hour = timestamp.getHours();
    return hour < 6 || hour > 22; // Outside 6 AM - 10 PM
  }

  private mapRowToAccessLogEntry(row: any): AccessLogEntry {
    return {
      id: row.id,
      userId: row.user_id,
      operation: row.operation,
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      dataSubject: row.data_subject,
      purpose: row.purpose,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      requestId: row.request_id,
      sessionId: row.session_id,
      tenantId: row.tenant_id,
      timestamp: new Date(row.timestamp),
      metadata: JSON.parse(row.metadata || '{}'),
      gdprLawfulBasis: row.gdpr_lawful_basis,
      retentionPeriod: row.retention_period,
      isAutomated: row.is_automated,
      resultCount: row.result_count,
      sensitiveDataAccessed: row.sensitive_data_accessed
    };
  }

  async close(): Promise<void> {
    clearInterval(this.flushInterval);
    await this.flushBuffer();
    logger.info('Access logger closed');
  }
}

// Export singleton instance
export const accessLogger = new AccessLogger(
  new Pool(), // This should be injected in production
  {
    bufferSize: 100,
    flushIntervalMs: 5000,
    defaultRetentionDays: 2555,
    enableGdprTracking: true
  }
);