import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { EventStore, PostgresEventStore } from '../../../core/src/services/event-sourcing/event-store-service';
import { SessionReconstructor } from '../../../core/src/services/event-sourcing/session-reconstructor';
import { EventStreamService } from '../services/event-stream-service';
import { eventSourcingMetrics } from '../../../core/src/services/event-sourcing/metrics-service';
import { eventEncryptionService } from '../../../core/src/services/event-sourcing/event-encryption-service';
import { logger } from '../utils/logger';

const router = Router();

export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: Date;
  responseTime: number;
  details: Record<string, unknown>;
  dependencies?: HealthCheckResult[];
}

export interface SystemHealthReport {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: Date;
  version: string;
  uptime: number;
  components: {
    eventStore: HealthCheckResult;
    eventStreaming: HealthCheckResult;
    sagaOrchestrator: HealthCheckResult;
    sessionReconstruction: HealthCheckResult;
    encryption: HealthCheckResult;
    database: HealthCheckResult;
    metrics: HealthCheckResult;
  };
  performance: {
    memoryUsage: {
      used: number;
      free: number;
      percentage: number;
    };
    cpuUsage: number;
    responseTime: number;
  };
  alerts: Array<{
    severity: 'info' | 'warning' | 'critical';
    message: string;
    component: string;
    timestamp: Date;
  }>;
}

export class EventSourcingHealthCheck {
  constructor(
    private readonly eventStore: EventStore,
    private readonly eventStreamService: EventStreamService,
    private readonly sessionReconstructor: SessionReconstructor,
    private readonly pool: Pool
  ) {}

  /**
   * Check event store health
   */
  async checkEventStore(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      // Test basic connectivity
      const testStreamId = `health-check-${Date.now()}`;
      const testEvent = {
        id: `test-${Date.now()}`,
        streamId: testStreamId,
        eventType: 'health.check',
        eventVersion: 1,
        eventData: { test: true },
        metadata: { source: 'health-check', version: '1.0' },
        timestamp: new Date(),
        sequenceNumber: 1,
        correlationId: `health-${Date.now()}`
      };

      // Test write operation
      await this.eventStore.appendEvents(testStreamId, -1, [testEvent], 'health-check');
      
      // Test read operation
      const events = await this.eventStore.getEvents(testStreamId, undefined, undefined, 'health-check');
      
      // Test stream existence
      const exists = await this.eventStore.streamExists(testStreamId);
      
      // Clean up test data
      await this.eventStore.deleteStream(testStreamId);

      const responseTime = Date.now() - startTime;

      return {
        status: 'healthy',
        timestamp: new Date(),
        responseTime,
        details: {
          canWrite: true,
          canRead: true,
          canDelete: true,
          testEventsCount: events.length,
          streamExists: exists,
          latency: `${responseTime}ms`
        }
      };

    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      logger.error('Event store health check failed', {
        error: error.message,
        responseTime
      });

      return {
        status: 'unhealthy',
        timestamp: new Date(),
        responseTime,
        details: {
          error: error.message,
          canWrite: false,
          canRead: false,
          canDelete: false
        }
      };
    }
  }

  /**
   * Check event streaming health
   */
  async checkEventStreaming(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      const stats = this.eventStreamService.getServiceStats();
      const responseTime = Date.now() - startTime;

      // Determine health based on metrics
      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
      
      if (stats.clientHealth.unhealthyClients > stats.totalClients * 0.1) {
        status = 'degraded';
      }
      
      if (stats.clientHealth.unhealthyClients > stats.totalClients * 0.5) {
        status = 'unhealthy';
      }

      return {
        status,
        timestamp: new Date(),
        responseTime,
        details: {
          totalClients: stats.totalClients,
          healthyClients: stats.clientHealth.healthyClients,
          unhealthyClients: stats.clientHealth.unhealthyClients,
          slowConsumers: stats.clientHealth.slowConsumers,
          backpressureStats: stats.backpressureStats,
          subscriptions: stats.totalSubscriptions
        }
      };

    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      return {
        status: 'unhealthy',
        timestamp: new Date(),
        responseTime,
        details: {
          error: error.message,
          canStream: false
        }
      };
    }
  }

  /**
   * Check saga orchestrator health
   */
  async checkSagaOrchestrator(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      // For now, we'll do a simple check
      // In a full implementation, you'd check saga processing queues, etc.
      const responseTime = Date.now() - startTime;

      return {
        status: 'healthy',
        timestamp: new Date(),
        responseTime,
        details: {
          sagaProcessing: true,
          queueDepth: 0, // Placeholder
          processingRate: 0 // Placeholder
        }
      };

    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      return {
        status: 'unhealthy',
        timestamp: new Date(),
        responseTime,
        details: {
          error: error.message,
          sagaProcessing: false
        }
      };
    }
  }

  /**
   * Check session reconstruction health
   */
  async checkSessionReconstruction(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      // Test cache health
      const cacheStats = this.sessionReconstructor.getCacheStats();
      
      // Determine health based on cache performance
      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
      
      if (cacheStats.hitRate < 0.5) {
        status = 'degraded';
      }
      
      if (cacheStats.hitRate < 0.2) {
        status = 'unhealthy';
      }

      const responseTime = Date.now() - startTime;

      return {
        status,
        timestamp: new Date(),
        responseTime,
        details: {
          cacheStats,
          canReconstruct: true,
          cacheHitRate: cacheStats.hitRate,
          memoryPressure: cacheStats.memoryPressure
        }
      };

    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      return {
        status: 'unhealthy',
        timestamp: new Date(),
        responseTime,
        details: {
          error: error.message,
          canReconstruct: false
        }
      };
    }
  }

  /**
   * Check encryption service health
   */
  async checkEncryption(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      // Test encryption/decryption
      const testData = { sensitive: 'test-data', timestamp: Date.now() };
      const encrypted = eventEncryptionService.encryptSensitiveData(testData);
      const decrypted = eventEncryptionService.decryptSensitiveData(encrypted);
      
      const isDataIntact = JSON.stringify(testData) === JSON.stringify(decrypted);
      const encryptionStatus = eventEncryptionService.getEncryptionStatus();
      
      const responseTime = Date.now() - startTime;

      return {
        status: isDataIntact ? 'healthy' : 'unhealthy',
        timestamp: new Date(),
        responseTime,
        details: {
          encryptionEnabled: encryptionStatus.isEnabled,
          algorithm: encryptionStatus.algorithm,
          keyStrength: encryptionStatus.keyStrength,
          canEncrypt: true,
          canDecrypt: true,
          dataIntegrity: isDataIntact
        }
      };

    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      return {
        status: 'unhealthy',
        timestamp: new Date(),
        responseTime,
        details: {
          error: error.message,
          canEncrypt: false,
          canDecrypt: false
        }
      };
    }
  }

  /**
   * Check database health
   */
  async checkDatabase(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      const client = await this.pool.connect();
      
      // Test basic connectivity
      await client.query('SELECT 1');
      
      // Check connection pool status
      const poolStats = {
        totalConnections: this.pool.totalCount,
        idleConnections: this.pool.idleCount,
        waitingClients: this.pool.waitingCount
      };
      
      // Test table access
      const eventsTableExists = await client.query(`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables 
          WHERE table_name = 'events'
        )
      `);
      
      client.release();
      
      const responseTime = Date.now() - startTime;
      
      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
      
      if (poolStats.waitingClients > 5) {
        status = 'degraded';
      }
      
      if (poolStats.waitingClients > 20 || !eventsTableExists.rows[0].exists) {
        status = 'unhealthy';
      }

      return {
        status,
        timestamp: new Date(),
        responseTime,
        details: {
          ...poolStats,
          tablesExist: eventsTableExists.rows[0].exists,
          latency: `${responseTime}ms`,
          canConnect: true,
          canQuery: true
        }
      };

    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      return {
        status: 'unhealthy',
        timestamp: new Date(),
        responseTime,
        details: {
          error: error.message,
          canConnect: false,
          canQuery: false
        }
      };
    }
  }

  /**
   * Check metrics service health
   */
  async checkMetrics(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      const metrics = eventSourcingMetrics.getCurrentMetrics();
      const systemHealth = eventSourcingMetrics.getSystemHealth();
      
      const responseTime = Date.now() - startTime;

      return {
        status: systemHealth.status,
        timestamp: new Date(),
        responseTime,
        details: {
          healthScore: systemHealth.score,
          issues: systemHealth.issues,
          recommendations: systemHealth.recommendations,
          metricsCollecting: true,
          lastMetricUpdate: metrics.eventAppends.lastAppend || new Date()
        }
      };

    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      return {
        status: 'unhealthy',
        timestamp: new Date(),
        responseTime,
        details: {
          error: error.message,
          metricsCollecting: false
        }
      };
    }
  }

  /**
   * Perform comprehensive system health check
   */
  async performSystemHealthCheck(): Promise<SystemHealthReport> {
    const startTime = Date.now();
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    // Run all health checks in parallel
    const [
      eventStore,
      eventStreaming,
      sagaOrchestrator,
      sessionReconstruction,
      encryption,
      database,
      metrics
    ] = await Promise.all([
      this.checkEventStore(),
      this.checkEventStreaming(),
      this.checkSagaOrchestrator(),
      this.checkSessionReconstruction(),
      this.checkEncryption(),
      this.checkDatabase(),
      this.checkMetrics()
    ]);

    const components = {
      eventStore,
      eventStreaming,
      sagaOrchestrator,
      sessionReconstruction,
      encryption,
      database,
      metrics
    };

    // Determine overall system status
    const componentStatuses = Object.values(components).map(c => c.status);
    let systemStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

    if (componentStatuses.includes('unhealthy')) {
      systemStatus = 'unhealthy';
    } else if (componentStatuses.includes('degraded')) {
      systemStatus = 'degraded';
    }

    // Generate alerts
    const alerts = [];
    for (const [componentName, component] of Object.entries(components)) {
      if (component.status === 'unhealthy') {
        alerts.push({
          severity: 'critical' as const,
          message: `${componentName} is unhealthy: ${component.details.error || 'Unknown error'}`,
          component: componentName,
          timestamp: component.timestamp
        });
      } else if (component.status === 'degraded') {
        alerts.push({
          severity: 'warning' as const,
          message: `${componentName} is experiencing degraded performance`,
          component: componentName,
          timestamp: component.timestamp
        });
      }
    }

    const totalMemory = memoryUsage.rss;
    const freeMemory = memoryUsage.rss - memoryUsage.heapUsed;

    return {
      status: systemStatus,
      timestamp: new Date(),
      version: process.env.npm_package_version || '1.0.0',
      uptime: process.uptime(),
      components,
      performance: {
        memoryUsage: {
          used: Math.round(memoryUsage.heapUsed / 1024 / 1024),
          free: Math.round(freeMemory / 1024 / 1024),
          percentage: Math.round((memoryUsage.heapUsed / totalMemory) * 100)
        },
        cpuUsage: Math.round((cpuUsage.user / 1000000) * 100) / 100, // Convert to seconds
        responseTime: Date.now() - startTime
      },
      alerts
    };
  }
}

// Health check endpoints
router.get('/health', async (req: Request, res: Response) => {
  try {
    const pool = new Pool(); // Should be injected
    const eventStore = new PostgresEventStore(pool);
    const eventStreamService = new EventStreamService({} as any); // Mock for now
    const sessionReconstructor = new SessionReconstructor(eventStore, pool);
    
    const healthCheck = new EventSourcingHealthCheck(
      eventStore,
      eventStreamService,
      sessionReconstructor,
      pool
    );

    const health = await healthCheck.performSystemHealthCheck();
    
    const statusCode = health.status === 'healthy' ? 200 : 
                      health.status === 'degraded' ? 200 : 503;

    res.status(statusCode).json(health);
    
  } catch (error) {
    logger.error('Health check failed', { error: error.message });
    
    res.status(500).json({
      status: 'unhealthy',
      timestamp: new Date(),
      error: error.message
    });
  }
});

router.get('/health/event-store', async (req: Request, res: Response) => {
  try {
    const pool = new Pool();
    const eventStore = new PostgresEventStore(pool);
    const eventStreamService = new EventStreamService({} as any);
    const sessionReconstructor = new SessionReconstructor(eventStore, pool);
    
    const healthCheck = new EventSourcingHealthCheck(
      eventStore,
      eventStreamService,
      sessionReconstructor,
      pool
    );

    const result = await healthCheck.checkEventStore();
    const statusCode = result.status === 'healthy' ? 200 : 503;
    
    res.status(statusCode).json(result);
    
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      timestamp: new Date(),
      error: error.message
    });
  }
});

router.get('/health/streaming', async (req: Request, res: Response) => {
  try {
    const pool = new Pool();
    const eventStore = new PostgresEventStore(pool);
    const eventStreamService = new EventStreamService({} as any);
    const sessionReconstructor = new SessionReconstructor(eventStore, pool);
    
    const healthCheck = new EventSourcingHealthCheck(
      eventStore,
      eventStreamService,
      sessionReconstructor,
      pool
    );

    const result = await healthCheck.checkEventStreaming();
    const statusCode = result.status === 'healthy' ? 200 : 503;
    
    res.status(statusCode).json(result);
    
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      timestamp: new Date(),
      error: error.message
    });
  }
});

router.get('/health/metrics', async (req: Request, res: Response) => {
  try {
    const metrics = eventSourcingMetrics.getCurrentMetrics();
    res.json(metrics);
    
  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

router.get('/metrics/prometheus', async (req: Request, res: Response) => {
  try {
    const prometheusMetrics = eventSourcingMetrics.exportPrometheusMetrics();
    res.set('Content-Type', 'text/plain').send(prometheusMetrics);
    
  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

export default router;