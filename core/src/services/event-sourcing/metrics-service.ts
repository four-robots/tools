import { Pool } from 'pg';
import { logger } from '../../utils/logger';

export interface EventSourcingMetrics {
  // Event store metrics
  eventAppends: {
    total: number;
    rate: number; // per minute
    averageDuration: number;
    errorRate: number;
    lastAppend: Date | null;
  };
  eventRetrievals: {
    total: number;
    rate: number;
    averageDuration: number;
    cacheHitRate: number;
    lastRetrieval: Date | null;
  };
  snapshots: {
    created: number;
    retrievals: number;
    averageSize: number;
    compressionRatio: number;
  };

  // Streaming metrics
  streaming: {
    activeConnections: number;
    totalConnections: number;
    messagesDelivered: number;
    messagesDropped: number;
    slowConsumers: number;
    averageLatency: number;
    connectionErrors: number;
  };

  // Reconstruction metrics
  reconstruction: {
    total: number;
    averageDuration: number;
    averageEventCount: number;
    cacheHitRate: number;
    errorRate: number;
  };

  // System health metrics
  system: {
    databaseConnections: {
      active: number;
      total: number;
      waitingQueries: number;
    };
    memoryUsage: {
      heap: number;
      external: number;
      rss: number;
    };
    eventStoreSize: {
      totalEvents: number;
      totalStreams: number;
      averageStreamSize: number;
      oldestEvent: Date | null;
    };
  };

  // Performance metrics
  performance: {
    p95Latency: number;
    p99Latency: number;
    throughput: number; // events per second
    concurrentReads: number;
    concurrentWrites: number;
  };

  // Compliance metrics
  compliance: {
    encryptedEventsPercentage: number;
    accessLogsGenerated: number;
    dataRetentionCompliance: number; // percentage
    gdprRequests: number;
  };
}

export interface MetricDataPoint {
  timestamp: Date;
  metric: string;
  value: number;
  tags?: Record<string, string>;
  metadata?: Record<string, unknown>;
}

export interface PerformanceSnapshot {
  timestamp: Date;
  eventStoreLatency: {
    read: number[];
    write: number[];
  };
  streamingLatency: number[];
  reconstructionLatency: number[];
  memoryPressure: number;
  cpuUsage: number;
  errorCounts: Record<string, number>;
}

export class EventSourcingMetricsService {
  private readonly metricsBuffer: MetricDataPoint[] = [];
  private readonly performanceData: PerformanceSnapshot[] = [];
  private readonly flushInterval: NodeJS.Timeout;
  private readonly performanceInterval: NodeJS.Timeout;
  private readonly config: {
    bufferSize: number;
    flushIntervalMs: number;
    retentionDays: number;
    enableDetailedMetrics: boolean;
  };

  private currentMetrics: EventSourcingMetrics = this.initializeMetrics();

  constructor(
    private readonly pool: Pool,
    config?: Partial<{
      bufferSize: number;
      flushIntervalMs: number;
      retentionDays: number;
      enableDetailedMetrics: boolean;
    }>
  ) {
    this.config = {
      bufferSize: 1000,
      flushIntervalMs: 10000, // 10 seconds
      retentionDays: 30,
      enableDetailedMetrics: true,
      ...config
    };

    // Start periodic flushing
    this.flushInterval = setInterval(() => {
      this.flushMetrics();
    }, this.config.flushIntervalMs);

    // Start performance monitoring
    this.performanceInterval = setInterval(() => {
      this.capturePerformanceSnapshot();
    }, 60000); // Every minute

    logger.info('Event sourcing metrics service initialized', {
      bufferSize: this.config.bufferSize,
      flushInterval: this.config.flushIntervalMs,
      enableDetailedMetrics: this.config.enableDetailedMetrics
    });
  }

  /**
   * Record event append operation
   */
  recordEventAppend(streamId: string, eventCount: number, duration: number, success: boolean = true): void {
    this.currentMetrics.eventAppends.total += eventCount;
    this.currentMetrics.eventAppends.lastAppend = new Date();
    
    if (!success) {
      this.currentMetrics.eventAppends.errorRate = this.updateRate(
        this.currentMetrics.eventAppends.errorRate, 
        1
      );
    }

    // Update average duration using exponential moving average
    this.currentMetrics.eventAppends.averageDuration = 
      (this.currentMetrics.eventAppends.averageDuration * 0.9) + (duration * 0.1);

    this.recordMetric('event_append', eventCount, {
      stream_id: streamId,
      success: success.toString(),
      duration: duration.toString()
    });

    if (this.config.enableDetailedMetrics) {
      this.recordMetric('event_append_duration', duration, { stream_id: streamId });
      this.recordMetric('event_append_batch_size', eventCount, { stream_id: streamId });
    }
  }

  /**
   * Record event retrieval operation
   */
  recordEventRetrieval(streamId: string, eventCount: number, duration: number, cacheHit: boolean = false): void {
    this.currentMetrics.eventRetrievals.total += eventCount;
    this.currentMetrics.eventRetrievals.lastRetrieval = new Date();
    
    this.currentMetrics.eventRetrievals.averageDuration =
      (this.currentMetrics.eventRetrievals.averageDuration * 0.9) + (duration * 0.1);

    if (cacheHit) {
      this.currentMetrics.eventRetrievals.cacheHitRate = this.updateRate(
        this.currentMetrics.eventRetrievals.cacheHitRate,
        1
      );
    }

    this.recordMetric('event_retrieval', eventCount, {
      stream_id: streamId,
      cache_hit: cacheHit.toString(),
      duration: duration.toString()
    });
  }

  /**
   * Record snapshot creation
   */
  recordSnapshotCreation(streamId: string, snapshotSize: number, compressionRatio?: number): void {
    this.currentMetrics.snapshots.created++;
    
    // Update average size using exponential moving average
    this.currentMetrics.snapshots.averageSize =
      (this.currentMetrics.snapshots.averageSize * 0.9) + (snapshotSize * 0.1);

    if (compressionRatio) {
      this.currentMetrics.snapshots.compressionRatio =
        (this.currentMetrics.snapshots.compressionRatio * 0.9) + (compressionRatio * 0.1);
    }

    this.recordMetric('snapshot_created', 1, {
      stream_id: streamId,
      size_bytes: snapshotSize.toString(),
      compression_ratio: compressionRatio?.toString() || '0'
    });
  }

  /**
   * Record streaming connection metrics
   */
  recordStreamConnection(clientId: string, streamType: string): void {
    this.currentMetrics.streaming.activeConnections++;
    this.currentMetrics.streaming.totalConnections++;

    this.recordMetric('stream_connection', 1, {
      client_id: clientId,
      stream_type: streamType
    });
  }

  /**
   * Record streaming disconnection
   */
  recordStreamDisconnection(clientId: string, duration: number, reason: string = 'normal'): void {
    this.currentMetrics.streaming.activeConnections = Math.max(0, this.currentMetrics.streaming.activeConnections - 1);
    
    if (reason === 'error') {
      this.currentMetrics.streaming.connectionErrors++;
    }

    this.recordMetric('stream_disconnection', 1, {
      client_id: clientId,
      duration: duration.toString(),
      reason
    });
  }

  /**
   * Record slow consumer detection
   */
  recordSlowConsumer(clientId: string, bufferSize: number): void {
    this.currentMetrics.streaming.slowConsumers++;
    
    this.recordMetric('slow_consumer_detected', 1, {
      client_id: clientId,
      buffer_size: bufferSize.toString()
    });
  }

  /**
   * Record message delivery metrics
   */
  recordMessageDelivery(clientId: string, messageCount: number, latency: number, dropped: boolean = false): void {
    if (dropped) {
      this.currentMetrics.streaming.messagesDropped += messageCount;
    } else {
      this.currentMetrics.streaming.messagesDelivered += messageCount;
      
      // Update average latency
      this.currentMetrics.streaming.averageLatency =
        (this.currentMetrics.streaming.averageLatency * 0.95) + (latency * 0.05);
    }

    this.recordMetric('message_delivery', messageCount, {
      client_id: clientId,
      latency: latency.toString(),
      dropped: dropped.toString()
    });
  }

  /**
   * Record session reconstruction metrics
   */
  recordSessionReconstruction(sessionId: string, eventCount: number, duration: number, cacheHit: boolean = false): void {
    this.currentMetrics.reconstruction.total++;
    
    this.currentMetrics.reconstruction.averageDuration =
      (this.currentMetrics.reconstruction.averageDuration * 0.9) + (duration * 0.1);
    
    this.currentMetrics.reconstruction.averageEventCount =
      (this.currentMetrics.reconstruction.averageEventCount * 0.9) + (eventCount * 0.1);

    if (cacheHit) {
      this.currentMetrics.reconstruction.cacheHitRate = this.updateRate(
        this.currentMetrics.reconstruction.cacheHitRate,
        1
      );
    }

    this.recordMetric('session_reconstruction', 1, {
      session_id: sessionId,
      event_count: eventCount.toString(),
      duration: duration.toString(),
      cache_hit: cacheHit.toString()
    });
  }

  /**
   * Record temporal query metrics
   */
  recordTemporalQuery(queryType: string, timeRange: number, duration: number): void {
    this.recordMetric('temporal_query', 1, {
      query_type: queryType,
      time_range: timeRange.toString(),
      duration: duration.toString()
    });
  }

  /**
   * Record database connection pool metrics
   */
  recordDatabaseConnectionPool(activeConnections: number, totalConnections: number, waitingQueries: number = 0): void {
    this.currentMetrics.system.databaseConnections = {
      active: activeConnections,
      total: totalConnections,
      waitingQueries
    };

    this.recordMetric('db_connections_active', activeConnections);
    this.recordMetric('db_connections_total', totalConnections);
    this.recordMetric('db_queries_waiting', waitingQueries);
  }

  /**
   * Record memory usage metrics
   */
  recordMemoryUsage(service: string, memoryMB: number): void {
    const memoryUsage = process.memoryUsage();
    
    this.currentMetrics.system.memoryUsage = {
      heap: Math.round(memoryUsage.heapUsed / 1024 / 1024),
      external: Math.round(memoryUsage.external / 1024 / 1024),
      rss: Math.round(memoryUsage.rss / 1024 / 1024)
    };

    this.recordMetric('memory_usage', memoryMB, { service });
  }

  /**
   * Record compliance metrics
   */
  recordComplianceMetric(type: 'encryption' | 'access_log' | 'retention' | 'gdpr_request', count: number = 1): void {
    switch (type) {
      case 'encryption':
        this.currentMetrics.compliance.encryptedEventsPercentage = count;
        break;
      case 'access_log':
        this.currentMetrics.compliance.accessLogsGenerated += count;
        break;
      case 'retention':
        this.currentMetrics.compliance.dataRetentionCompliance = count;
        break;
      case 'gdpr_request':
        this.currentMetrics.compliance.gdprRequests += count;
        break;
    }

    this.recordMetric(`compliance_${type}`, count);
  }

  /**
   * Get current metrics snapshot
   */
  getCurrentMetrics(): EventSourcingMetrics {
    // Update rates
    this.updateRates();
    
    return { ...this.currentMetrics };
  }

  /**
   * Get performance percentiles
   */
  getPerformancePercentiles(metric: string, percentile: number = 95): number {
    const recentSnapshots = this.performanceData.slice(-100); // Last 100 snapshots
    if (recentSnapshots.length === 0) return 0;

    let values: number[] = [];
    
    switch (metric) {
      case 'event_store_read':
        values = recentSnapshots.flatMap(s => s.eventStoreLatency.read);
        break;
      case 'event_store_write':
        values = recentSnapshots.flatMap(s => s.eventStoreLatency.write);
        break;
      case 'streaming':
        values = recentSnapshots.flatMap(s => s.streamingLatency);
        break;
      case 'reconstruction':
        values = recentSnapshots.flatMap(s => s.reconstructionLatency);
        break;
    }

    if (values.length === 0) return 0;
    
    values.sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * values.length) - 1;
    return values[Math.max(0, index)] || 0;
  }

  /**
   * Get system health status
   */
  getSystemHealth(): {
    status: 'healthy' | 'degraded' | 'unhealthy';
    score: number;
    issues: string[];
    recommendations: string[];
  } {
    const issues: string[] = [];
    const recommendations: string[] = [];
    let healthScore = 100;

    // Check error rates
    if (this.currentMetrics.eventAppends.errorRate > 0.05) { // 5% threshold
      issues.push(`High event append error rate: ${(this.currentMetrics.eventAppends.errorRate * 100).toFixed(2)}%`);
      recommendations.push('Investigate database connectivity and query performance');
      healthScore -= 20;
    }

    if (this.currentMetrics.reconstruction.errorRate > 0.02) { // 2% threshold
      issues.push(`High reconstruction error rate: ${(this.currentMetrics.reconstruction.errorRate * 100).toFixed(2)}%`);
      recommendations.push('Check session reconstruction logic and cache integrity');
      healthScore -= 15;
    }

    // Check memory usage
    if (this.currentMetrics.system.memoryUsage.rss > 2048) { // 2GB threshold
      issues.push(`High memory usage: ${this.currentMetrics.system.memoryUsage.rss}MB`);
      recommendations.push('Consider implementing more aggressive memory cleanup');
      healthScore -= 10;
    }

    // Check streaming issues
    if (this.currentMetrics.streaming.slowConsumers > 5) {
      issues.push(`Multiple slow consumers detected: ${this.currentMetrics.streaming.slowConsumers}`);
      recommendations.push('Review client connection patterns and implement rate limiting');
      healthScore -= 15;
    }

    // Check performance
    const p95Latency = this.getPerformancePercentiles('event_store_read', 95);
    if (p95Latency > 1000) { // 1 second threshold
      issues.push(`High P95 read latency: ${p95Latency}ms`);
      recommendations.push('Consider optimizing database queries and adding read replicas');
      healthScore -= 20;
    }

    let status: 'healthy' | 'degraded' | 'unhealthy';
    if (healthScore >= 80) status = 'healthy';
    else if (healthScore >= 60) status = 'degraded';
    else status = 'unhealthy';

    return {
      status,
      score: Math.max(0, healthScore),
      issues,
      recommendations
    };
  }

  /**
   * Export metrics for external monitoring systems
   */
  exportPrometheusMetrics(): string {
    const metrics = this.getCurrentMetrics();
    const lines: string[] = [];

    // Event store metrics
    lines.push(`# HELP event_sourcing_event_appends_total Total number of event appends`);
    lines.push(`# TYPE event_sourcing_event_appends_total counter`);
    lines.push(`event_sourcing_event_appends_total ${metrics.eventAppends.total}`);

    lines.push(`# HELP event_sourcing_event_retrievals_total Total number of event retrievals`);
    lines.push(`# TYPE event_sourcing_event_retrievals_total counter`);
    lines.push(`event_sourcing_event_retrievals_total ${metrics.eventRetrievals.total}`);

    lines.push(`# HELP event_sourcing_reconstruction_cache_hit_rate Session reconstruction cache hit rate`);
    lines.push(`# TYPE event_sourcing_reconstruction_cache_hit_rate gauge`);
    lines.push(`event_sourcing_reconstruction_cache_hit_rate ${metrics.reconstruction.cacheHitRate}`);

    // Add more metrics as needed
    
    return lines.join('\n');
  }

  private recordMetric(metric: string, value: number, tags: Record<string, string> = {}, metadata?: Record<string, unknown>): void {
    this.metricsBuffer.push({
      timestamp: new Date(),
      metric,
      value,
      tags,
      metadata
    });

    // Flush if buffer is full
    if (this.metricsBuffer.length >= this.config.bufferSize) {
      this.flushMetrics();
    }
  }

  private async flushMetrics(): Promise<void> {
    if (this.metricsBuffer.length === 0) return;

    const metricsToFlush = this.metricsBuffer.splice(0);
    
    try {
      const client = await this.pool.connect();
      
      const insertQuery = `
        INSERT INTO event_sourcing_metrics (timestamp, metric, value, tags, metadata)
        VALUES ${metricsToFlush.map((_, i) => 
          `($${i * 5 + 1}, $${i * 5 + 2}, $${i * 5 + 3}, $${i * 5 + 4}, $${i * 5 + 5})`
        ).join(', ')}
      `;

      const params = metricsToFlush.flatMap(m => [
        m.timestamp,
        m.metric,
        m.value,
        JSON.stringify(m.tags || {}),
        JSON.stringify(m.metadata || {})
      ]);

      await client.query(insertQuery, params);
      client.release();

      logger.debug(`Flushed ${metricsToFlush.length} metrics to database`);

    } catch (error) {
      logger.error('Failed to flush metrics', {
        error: error instanceof Error ? error.message : String(error),
        metricsCount: metricsToFlush.length
      });
      
      // Re-queue metrics for retry (with limit to prevent memory issues)
      if (this.metricsBuffer.length < this.config.bufferSize) {
        this.metricsBuffer.unshift(...metricsToFlush.slice(-500)); // Keep last 500
      }
    }
  }

  private capturePerformanceSnapshot(): void {
    const snapshot: PerformanceSnapshot = {
      timestamp: new Date(),
      eventStoreLatency: { read: [], write: [] },
      streamingLatency: [],
      reconstructionLatency: [],
      memoryPressure: this.currentMetrics.system.memoryUsage.rss / 2048, // Normalize to 2GB
      cpuUsage: process.cpuUsage().user / 1000000, // Convert to seconds
      errorCounts: {}
    };

    this.performanceData.push(snapshot);
    
    // Keep only recent data
    if (this.performanceData.length > 1000) {
      this.performanceData.splice(0, this.performanceData.length - 1000);
    }
  }

  private updateRates(): void {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    // This is a simplified rate calculation
    // In production, you'd want to use a more sophisticated approach
    this.currentMetrics.eventAppends.rate = this.currentMetrics.eventAppends.total; // Placeholder
    this.currentMetrics.eventRetrievals.rate = this.currentMetrics.eventRetrievals.total; // Placeholder
  }

  private updateRate(currentRate: number, increment: number): number {
    // Simple exponential moving average
    return (currentRate * 0.95) + (increment * 0.05);
  }

  private initializeMetrics(): EventSourcingMetrics {
    return {
      eventAppends: {
        total: 0,
        rate: 0,
        averageDuration: 0,
        errorRate: 0,
        lastAppend: null
      },
      eventRetrievals: {
        total: 0,
        rate: 0,
        averageDuration: 0,
        cacheHitRate: 0,
        lastRetrieval: null
      },
      snapshots: {
        created: 0,
        retrievals: 0,
        averageSize: 0,
        compressionRatio: 0
      },
      streaming: {
        activeConnections: 0,
        totalConnections: 0,
        messagesDelivered: 0,
        messagesDropped: 0,
        slowConsumers: 0,
        averageLatency: 0,
        connectionErrors: 0
      },
      reconstruction: {
        total: 0,
        averageDuration: 0,
        averageEventCount: 0,
        cacheHitRate: 0,
        errorRate: 0
      },
      system: {
        databaseConnections: {
          active: 0,
          total: 0,
          waitingQueries: 0
        },
        memoryUsage: {
          heap: 0,
          external: 0,
          rss: 0
        },
        eventStoreSize: {
          totalEvents: 0,
          totalStreams: 0,
          averageStreamSize: 0,
          oldestEvent: null
        }
      },
      performance: {
        p95Latency: 0,
        p99Latency: 0,
        throughput: 0,
        concurrentReads: 0,
        concurrentWrites: 0
      },
      compliance: {
        encryptedEventsPercentage: 0,
        accessLogsGenerated: 0,
        dataRetentionCompliance: 0,
        gdprRequests: 0
      }
    };
  }

  async close(): Promise<void> {
    clearInterval(this.flushInterval);
    clearInterval(this.performanceInterval);
    await this.flushMetrics();
    logger.info('Event sourcing metrics service closed');
  }
}

// Export singleton instance
export const eventSourcingMetrics = new EventSourcingMetricsService(
  new Pool() // This should be injected in production
);