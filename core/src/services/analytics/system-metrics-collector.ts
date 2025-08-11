import { SystemMetric } from '@shared/types';
import { logger } from '@/utils/logger';
import { EventEmitter } from 'events';
import * as os from 'os';
import * as process from 'process';

interface CPUMetrics {
  usage: number; // percentage
  loadAverage: number[];
  cores: number;
}

interface MemoryMetrics {
  used: number; // bytes
  free: number; // bytes
  total: number; // bytes
  usage: number; // percentage
}

interface DiskMetrics {
  used: number; // bytes
  free: number; // bytes
  total: number; // bytes
  usage: number; // percentage
  ioOps: number; // operations per second
}

interface NetworkMetrics {
  bytesIn: number;
  bytesOut: number;
  packetsIn: number;
  packetsOut: number;
  connectionsActive: number;
}

interface DatabaseMetrics {
  activeConnections: number;
  idleConnections: number;
  totalQueries: number;
  avgQueryTime: number; // milliseconds
  slowQueries: number;
  cacheHitRate: number; // percentage
}

interface WebSocketMetrics {
  activeConnections: number;
  totalConnections: number;
  messagesPerSecond: number;
  avgMessageSize: number; // bytes
  errorRate: number; // percentage
}

interface EventSourcingMetrics {
  eventsPerSecond: number;
  avgEventSize: number; // bytes
  projectionLag: number; // milliseconds
  streamCount: number;
  snapshotCount: number;
}

interface SearchMetrics {
  queriesPerSecond: number;
  avgQueryTime: number; // milliseconds
  indexSize: number; // bytes
  indexDocuments: number;
  cacheHitRate: number; // percentage
}

interface ComponentHealth {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  responseTime: number; // milliseconds
  lastCheck: Date;
  errorCount: number;
  uptime: number; // seconds
}

interface HealthStatus {
  overall: 'healthy' | 'degraded' | 'unhealthy';
  components: ComponentHealth[];
  checks: {
    database: boolean;
    redis: boolean;
    filesystem: boolean;
    network: boolean;
  };
  timestamp: Date;
}

export class SystemMetricsCollector extends EventEmitter {
  private collectionInterval: NodeJS.Timer;
  private healthCheckInterval: NodeJS.Timer;
  private customMetrics = new Map<string, () => Promise<number>>();
  private lastCpuUsage = process.cpuUsage();
  private lastNetworkStats: any = {};
  private serviceName: string;
  private serviceInstance: string;

  constructor(
    serviceName: string = 'mcp-tools',
    serviceInstance: string = `${os.hostname()}-${process.pid}`,
    private collectionIntervalMs: number = 30000, // 30 seconds
    private healthCheckIntervalMs: number = 60000 // 1 minute
  ) {
    super();
    this.serviceName = serviceName;
    this.serviceInstance = serviceInstance;
    this.startCollection();
    this.startHealthChecks();
  }

  // Resource metrics collection
  async collectCPUMetrics(): Promise<CPUMetrics> {
    try {
      const currentUsage = process.cpuUsage(this.lastCpuUsage);
      this.lastCpuUsage = process.cpuUsage();

      const userUsage = currentUsage.user / 1000000; // Convert to seconds
      const systemUsage = currentUsage.system / 1000000;
      const totalUsage = userUsage + systemUsage;
      const elapsedTime = this.collectionIntervalMs / 1000; // Convert to seconds
      
      const usage = Math.min(100, (totalUsage / elapsedTime) * 100);
      const loadAverage = os.loadavg();
      const cores = os.cpus().length;

      const metrics: CPUMetrics = {
        usage: Math.round(usage * 100) / 100,
        loadAverage,
        cores,
      };

      // Emit system metrics
      this.emitSystemMetric('cpu', 'utilization', usage, 'percent');
      this.emitSystemMetric('cpu', 'load_average_1m', loadAverage[0], 'average');
      this.emitSystemMetric('cpu', 'load_average_5m', loadAverage[1], 'average');
      this.emitSystemMetric('cpu', 'load_average_15m', loadAverage[2], 'average');

      return metrics;

    } catch (error) {
      logger.error('Failed to collect CPU metrics', { error });
      throw error;
    }
  }

  async collectMemoryMetrics(): Promise<MemoryMetrics> {
    try {
      const totalMemory = os.totalmem();
      const freeMemory = os.freemem();
      const usedMemory = totalMemory - freeMemory;
      const usage = (usedMemory / totalMemory) * 100;

      // Process-specific memory
      const processMemory = process.memoryUsage();

      const metrics: MemoryMetrics = {
        used: usedMemory,
        free: freeMemory,
        total: totalMemory,
        usage: Math.round(usage * 100) / 100,
      };

      // Emit system metrics
      this.emitSystemMetric('memory', 'total', totalMemory, 'bytes');
      this.emitSystemMetric('memory', 'used', usedMemory, 'bytes');
      this.emitSystemMetric('memory', 'free', freeMemory, 'bytes');
      this.emitSystemMetric('memory', 'usage_percent', usage, 'percent');
      
      // Process memory metrics
      this.emitSystemMetric('memory', 'process_rss', processMemory.rss, 'bytes');
      this.emitSystemMetric('memory', 'process_heap_used', processMemory.heapUsed, 'bytes');
      this.emitSystemMetric('memory', 'process_heap_total', processMemory.heapTotal, 'bytes');
      this.emitSystemMetric('memory', 'process_external', processMemory.external, 'bytes');

      return metrics;

    } catch (error) {
      logger.error('Failed to collect memory metrics', { error });
      throw error;
    }
  }

  async collectDiskMetrics(): Promise<DiskMetrics> {
    try {
      // In a real implementation, this would query actual disk usage
      // For now, we'll provide estimated metrics
      const stats = await this.getDiskStats();
      
      const metrics: DiskMetrics = {
        used: stats.used,
        free: stats.free,
        total: stats.total,
        usage: (stats.used / stats.total) * 100,
        ioOps: stats.ioOps || 0,
      };

      this.emitSystemMetric('disk', 'total', metrics.total, 'bytes');
      this.emitSystemMetric('disk', 'used', metrics.used, 'bytes');
      this.emitSystemMetric('disk', 'free', metrics.free, 'bytes');
      this.emitSystemMetric('disk', 'usage_percent', metrics.usage, 'percent');
      this.emitSystemMetric('disk', 'io_operations', metrics.ioOps, 'ops/sec');

      return metrics;

    } catch (error) {
      logger.error('Failed to collect disk metrics', { error });
      throw error;
    }
  }

  async collectNetworkMetrics(): Promise<NetworkMetrics> {
    try {
      const networkInterfaces = os.networkInterfaces();
      const stats = await this.getNetworkStats();

      const metrics: NetworkMetrics = {
        bytesIn: stats.bytesIn || 0,
        bytesOut: stats.bytesOut || 0,
        packetsIn: stats.packetsIn || 0,
        packetsOut: stats.packetsOut || 0,
        connectionsActive: stats.connectionsActive || 0,
      };

      this.emitSystemMetric('network', 'bytes_in', metrics.bytesIn, 'bytes');
      this.emitSystemMetric('network', 'bytes_out', metrics.bytesOut, 'bytes');
      this.emitSystemMetric('network', 'packets_in', metrics.packetsIn, 'count');
      this.emitSystemMetric('network', 'packets_out', metrics.packetsOut, 'count');
      this.emitSystemMetric('network', 'connections_active', metrics.connectionsActive, 'count');

      return metrics;

    } catch (error) {
      logger.error('Failed to collect network metrics', { error });
      throw error;
    }
  }

  // Application-specific metrics
  async collectDatabaseMetrics(): Promise<DatabaseMetrics> {
    try {
      const metrics: DatabaseMetrics = {
        activeConnections: await this.getActiveDbConnections(),
        idleConnections: await this.getIdleDbConnections(),
        totalQueries: await this.getTotalDbQueries(),
        avgQueryTime: await this.getAvgQueryTime(),
        slowQueries: await this.getSlowQueryCount(),
        cacheHitRate: await this.getDbCacheHitRate(),
      };

      this.emitSystemMetric('database', 'connections_active', metrics.activeConnections, 'count');
      this.emitSystemMetric('database', 'connections_idle', metrics.idleConnections, 'count');
      this.emitSystemMetric('database', 'queries_total', metrics.totalQueries, 'count');
      this.emitSystemMetric('database', 'query_time_avg', metrics.avgQueryTime, 'ms');
      this.emitSystemMetric('database', 'slow_queries', metrics.slowQueries, 'count');
      this.emitSystemMetric('database', 'cache_hit_rate', metrics.cacheHitRate, 'percent');

      return metrics;

    } catch (error) {
      logger.error('Failed to collect database metrics', { error });
      throw error;
    }
  }

  async collectWebSocketMetrics(): Promise<WebSocketMetrics> {
    try {
      const metrics: WebSocketMetrics = {
        activeConnections: await this.getActiveWebSocketConnections(),
        totalConnections: await this.getTotalWebSocketConnections(),
        messagesPerSecond: await this.getWebSocketMessagesPerSecond(),
        avgMessageSize: await this.getAvgWebSocketMessageSize(),
        errorRate: await this.getWebSocketErrorRate(),
      };

      this.emitSystemMetric('websocket', 'connections_active', metrics.activeConnections, 'count');
      this.emitSystemMetric('websocket', 'connections_total', metrics.totalConnections, 'count');
      this.emitSystemMetric('websocket', 'messages_per_second', metrics.messagesPerSecond, 'rate');
      this.emitSystemMetric('websocket', 'message_size_avg', metrics.avgMessageSize, 'bytes');
      this.emitSystemMetric('websocket', 'error_rate', metrics.errorRate, 'percent');

      return metrics;

    } catch (error) {
      logger.error('Failed to collect WebSocket metrics', { error });
      throw error;
    }
  }

  async collectEventSourcingMetrics(): Promise<EventSourcingMetrics> {
    try {
      const metrics: EventSourcingMetrics = {
        eventsPerSecond: await this.getEventsPerSecond(),
        avgEventSize: await this.getAvgEventSize(),
        projectionLag: await this.getProjectionLag(),
        streamCount: await this.getStreamCount(),
        snapshotCount: await this.getSnapshotCount(),
      };

      this.emitSystemMetric('event_sourcing', 'events_per_second', metrics.eventsPerSecond, 'rate');
      this.emitSystemMetric('event_sourcing', 'event_size_avg', metrics.avgEventSize, 'bytes');
      this.emitSystemMetric('event_sourcing', 'projection_lag', metrics.projectionLag, 'ms');
      this.emitSystemMetric('event_sourcing', 'stream_count', metrics.streamCount, 'count');
      this.emitSystemMetric('event_sourcing', 'snapshot_count', metrics.snapshotCount, 'count');

      return metrics;

    } catch (error) {
      logger.error('Failed to collect event sourcing metrics', { error });
      throw error;
    }
  }

  async collectSearchMetrics(): Promise<SearchMetrics> {
    try {
      const metrics: SearchMetrics = {
        queriesPerSecond: await this.getSearchQueriesPerSecond(),
        avgQueryTime: await this.getAvgSearchQueryTime(),
        indexSize: await this.getSearchIndexSize(),
        indexDocuments: await this.getSearchIndexDocuments(),
        cacheHitRate: await this.getSearchCacheHitRate(),
      };

      this.emitSystemMetric('search', 'queries_per_second', metrics.queriesPerSecond, 'rate');
      this.emitSystemMetric('search', 'query_time_avg', metrics.avgQueryTime, 'ms');
      this.emitSystemMetric('search', 'index_size', metrics.indexSize, 'bytes');
      this.emitSystemMetric('search', 'index_documents', metrics.indexDocuments, 'count');
      this.emitSystemMetric('search', 'cache_hit_rate', metrics.cacheHitRate, 'percent');

      return metrics;

    } catch (error) {
      logger.error('Failed to collect search metrics', { error });
      throw error;
    }
  }

  // Custom metrics
  async collectCustomMetric(name: string, collector: () => Promise<number>): Promise<void> {
    try {
      const value = await collector();
      this.emitSystemMetric('custom', name, value);
      
    } catch (error) {
      logger.error('Failed to collect custom metric', { error, name });
    }
  }

  registerCustomMetric(name: string, collector: () => Promise<number>): void {
    this.customMetrics.set(name, collector);
    logger.info('Registered custom metric', { name });
  }

  // Health checks
  async performHealthCheck(): Promise<HealthStatus> {
    const startTime = Date.now();

    try {
      const componentChecks = await Promise.allSettled([
        this.checkDatabaseHealth(),
        this.checkRedisHealth(),
        this.checkFilesystemHealth(),
        this.checkNetworkHealth(),
        this.checkWebSocketHealth(),
        this.checkEventSourcingHealth(),
        this.checkSearchHealth(),
      ]);

      const components: ComponentHealth[] = componentChecks.map((result, index) => {
        const componentNames = ['database', 'redis', 'filesystem', 'network', 'websocket', 'event_sourcing', 'search'];
        const name = componentNames[index];

        if (result.status === 'fulfilled') {
          return result.value;
        } else {
          return {
            name,
            status: 'unhealthy' as const,
            responseTime: Date.now() - startTime,
            lastCheck: new Date(),
            errorCount: 1,
            uptime: 0,
          };
        }
      });

      const overallHealth = this.determineOverallHealth(components);

      const healthStatus: HealthStatus = {
        overall: overallHealth,
        components,
        checks: {
          database: components.find(c => c.name === 'database')?.status === 'healthy',
          redis: components.find(c => c.name === 'redis')?.status === 'healthy',
          filesystem: components.find(c => c.name === 'filesystem')?.status === 'healthy',
          network: components.find(c => c.name === 'network')?.status === 'healthy',
        },
        timestamp: new Date(),
      };

      // Emit health metrics
      this.emitSystemMetric('health', 'overall_status', overallHealth === 'healthy' ? 1 : 0, 'status');
      this.emitSystemMetric('health', 'component_count', components.length, 'count');
      this.emitSystemMetric('health', 'healthy_components', components.filter(c => c.status === 'healthy').length, 'count');

      return healthStatus;

    } catch (error) {
      logger.error('Health check failed', { error });
      throw error;
    }
  }

  async checkComponentHealth(component: string): Promise<ComponentHealth> {
    const startTime = Date.now();

    try {
      switch (component) {
        case 'database':
          return await this.checkDatabaseHealth();
        case 'redis':
          return await this.checkRedisHealth();
        case 'filesystem':
          return await this.checkFilesystemHealth();
        case 'network':
          return await this.checkNetworkHealth();
        case 'websocket':
          return await this.checkWebSocketHealth();
        case 'event_sourcing':
          return await this.checkEventSourcingHealth();
        case 'search':
          return await this.checkSearchHealth();
        default:
          throw new Error(`Unknown component: ${component}`);
      }

    } catch (error) {
      logger.error('Component health check failed', { error, component });
      return {
        name: component,
        status: 'unhealthy',
        responseTime: Date.now() - startTime,
        lastCheck: new Date(),
        errorCount: 1,
        uptime: 0,
      };
    }
  }

  private startCollection(): void {
    this.collectionInterval = setInterval(async () => {
      try {
        await this.collectAllMetrics();
      } catch (error) {
        logger.error('Metrics collection failed', { error });
      }
    }, this.collectionIntervalMs);

    logger.info('System metrics collection started', { 
      intervalMs: this.collectionIntervalMs,
      serviceName: this.serviceName,
      serviceInstance: this.serviceInstance
    });
  }

  private startHealthChecks(): void {
    this.healthCheckInterval = setInterval(async () => {
      try {
        const healthStatus = await this.performHealthCheck();
        this.emit('health_check', healthStatus);
      } catch (error) {
        logger.error('Health check failed', { error });
      }
    }, this.healthCheckIntervalMs);

    logger.info('Health checks started', { intervalMs: this.healthCheckIntervalMs });
  }

  private async collectAllMetrics(): Promise<void> {
    try {
      const metrics = await Promise.allSettled([
        this.collectCPUMetrics(),
        this.collectMemoryMetrics(),
        this.collectDiskMetrics(),
        this.collectNetworkMetrics(),
        this.collectDatabaseMetrics(),
        this.collectWebSocketMetrics(),
        this.collectEventSourcingMetrics(),
        this.collectSearchMetrics(),
      ]);

      // Collect custom metrics
      for (const [name, collector] of this.customMetrics.entries()) {
        try {
          await this.collectCustomMetric(name, collector);
        } catch (error) {
          logger.warn('Custom metric collection failed', { error, name });
        }
      }

      const successCount = metrics.filter(m => m.status === 'fulfilled').length;
      const failureCount = metrics.filter(m => m.status === 'rejected').length;

      logger.debug('Metrics collection completed', { 
        success: successCount, 
        failures: failureCount,
        customMetrics: this.customMetrics.size
      });

    } catch (error) {
      logger.error('Failed to collect all metrics', { error });
    }
  }

  private emitSystemMetric(
    metricType: string, 
    metricName: string, 
    value: number, 
    unit?: string
  ): void {
    const metric: SystemMetric = {
      serviceName: this.serviceName,
      serviceInstance: this.serviceInstance,
      metricType: metricType as any,
      metricName,
      value,
      unit,
      metadata: {
        hostname: os.hostname(),
        platform: os.platform(),
        nodeVersion: process.version,
        pid: process.pid,
      },
      timestamp: new Date(),
    };

    this.emit('metric', metric);
  }

  private determineOverallHealth(components: ComponentHealth[]): 'healthy' | 'degraded' | 'unhealthy' {
    const healthyCount = components.filter(c => c.status === 'healthy').length;
    const degradedCount = components.filter(c => c.status === 'degraded').length;
    const unhealthyCount = components.filter(c => c.status === 'unhealthy').length;

    if (unhealthyCount > 0) {
      return unhealthyCount / components.length > 0.5 ? 'unhealthy' : 'degraded';
    }

    if (degradedCount > 0) {
      return degradedCount / components.length > 0.3 ? 'degraded' : 'healthy';
    }

    return 'healthy';
  }

  // Placeholder implementations for metric collection methods
  private async getDiskStats(): Promise<any> {
    // In production, would use system calls to get actual disk stats
    return {
      total: 500 * 1024 * 1024 * 1024, // 500GB
      used: 200 * 1024 * 1024 * 1024,  // 200GB
      free: 300 * 1024 * 1024 * 1024,  // 300GB
      ioOps: Math.floor(Math.random() * 100),
    };
  }

  private async getNetworkStats(): Promise<any> {
    // In production, would query actual network statistics
    return {
      bytesIn: Math.floor(Math.random() * 1000000),
      bytesOut: Math.floor(Math.random() * 500000),
      packetsIn: Math.floor(Math.random() * 10000),
      packetsOut: Math.floor(Math.random() * 8000),
      connectionsActive: Math.floor(Math.random() * 100),
    };
  }

  // Database metrics placeholders
  private async getActiveDbConnections(): Promise<number> { return Math.floor(Math.random() * 20); }
  private async getIdleDbConnections(): Promise<number> { return Math.floor(Math.random() * 10); }
  private async getTotalDbQueries(): Promise<number> { return Math.floor(Math.random() * 10000); }
  private async getAvgQueryTime(): Promise<number> { return Math.floor(Math.random() * 50); }
  private async getSlowQueryCount(): Promise<number> { return Math.floor(Math.random() * 5); }
  private async getDbCacheHitRate(): Promise<number> { return 85 + Math.random() * 10; }

  // WebSocket metrics placeholders
  private async getActiveWebSocketConnections(): Promise<number> { return Math.floor(Math.random() * 100); }
  private async getTotalWebSocketConnections(): Promise<number> { return Math.floor(Math.random() * 1000); }
  private async getWebSocketMessagesPerSecond(): Promise<number> { return Math.floor(Math.random() * 200); }
  private async getAvgWebSocketMessageSize(): Promise<number> { return Math.floor(Math.random() * 1024); }
  private async getWebSocketErrorRate(): Promise<number> { return Math.random() * 2; }

  // Event sourcing metrics placeholders
  private async getEventsPerSecond(): Promise<number> { return Math.floor(Math.random() * 50); }
  private async getAvgEventSize(): Promise<number> { return Math.floor(Math.random() * 2048); }
  private async getProjectionLag(): Promise<number> { return Math.floor(Math.random() * 1000); }
  private async getStreamCount(): Promise<number> { return Math.floor(Math.random() * 500); }
  private async getSnapshotCount(): Promise<number> { return Math.floor(Math.random() * 100); }

  // Search metrics placeholders
  private async getSearchQueriesPerSecond(): Promise<number> { return Math.floor(Math.random() * 30); }
  private async getAvgSearchQueryTime(): Promise<number> { return Math.floor(Math.random() * 100); }
  private async getSearchIndexSize(): Promise<number> { return Math.floor(Math.random() * 1000000000); }
  private async getSearchIndexDocuments(): Promise<number> { return Math.floor(Math.random() * 100000); }
  private async getSearchCacheHitRate(): Promise<number> { return 80 + Math.random() * 15; }

  // Health check implementations
  private async checkDatabaseHealth(): Promise<ComponentHealth> {
    const startTime = Date.now();
    // Mock database health check
    const isHealthy = Math.random() > 0.1; // 90% healthy
    
    return {
      name: 'database',
      status: isHealthy ? 'healthy' : 'degraded',
      responseTime: Date.now() - startTime + Math.floor(Math.random() * 50),
      lastCheck: new Date(),
      errorCount: isHealthy ? 0 : 1,
      uptime: process.uptime(),
    };
  }

  private async checkRedisHealth(): Promise<ComponentHealth> {
    const startTime = Date.now();
    const isHealthy = Math.random() > 0.05; // 95% healthy
    
    return {
      name: 'redis',
      status: isHealthy ? 'healthy' : 'unhealthy',
      responseTime: Date.now() - startTime + Math.floor(Math.random() * 20),
      lastCheck: new Date(),
      errorCount: isHealthy ? 0 : 1,
      uptime: process.uptime(),
    };
  }

  private async checkFilesystemHealth(): Promise<ComponentHealth> {
    const startTime = Date.now();
    // Check filesystem access
    try {
      await require('fs').promises.access('/tmp', require('fs').constants.W_OK);
      
      return {
        name: 'filesystem',
        status: 'healthy',
        responseTime: Date.now() - startTime,
        lastCheck: new Date(),
        errorCount: 0,
        uptime: process.uptime(),
      };
    } catch (error) {
      return {
        name: 'filesystem',
        status: 'unhealthy',
        responseTime: Date.now() - startTime,
        lastCheck: new Date(),
        errorCount: 1,
        uptime: process.uptime(),
      };
    }
  }

  private async checkNetworkHealth(): Promise<ComponentHealth> {
    const startTime = Date.now();
    const isHealthy = Math.random() > 0.02; // 98% healthy
    
    return {
      name: 'network',
      status: isHealthy ? 'healthy' : 'degraded',
      responseTime: Date.now() - startTime + Math.floor(Math.random() * 30),
      lastCheck: new Date(),
      errorCount: isHealthy ? 0 : 1,
      uptime: process.uptime(),
    };
  }

  private async checkWebSocketHealth(): Promise<ComponentHealth> {
    const startTime = Date.now();
    const isHealthy = Math.random() > 0.08; // 92% healthy
    
    return {
      name: 'websocket',
      status: isHealthy ? 'healthy' : 'degraded',
      responseTime: Date.now() - startTime + Math.floor(Math.random() * 40),
      lastCheck: new Date(),
      errorCount: isHealthy ? 0 : 1,
      uptime: process.uptime(),
    };
  }

  private async checkEventSourcingHealth(): Promise<ComponentHealth> {
    const startTime = Date.now();
    const isHealthy = Math.random() > 0.06; // 94% healthy
    
    return {
      name: 'event_sourcing',
      status: isHealthy ? 'healthy' : 'degraded',
      responseTime: Date.now() - startTime + Math.floor(Math.random() * 35),
      lastCheck: new Date(),
      errorCount: isHealthy ? 0 : 1,
      uptime: process.uptime(),
    };
  }

  private async checkSearchHealth(): Promise<ComponentHealth> {
    const startTime = Date.now();
    const isHealthy = Math.random() > 0.04; // 96% healthy
    
    return {
      name: 'search',
      status: isHealthy ? 'healthy' : 'degraded',
      responseTime: Date.now() - startTime + Math.floor(Math.random() * 60),
      lastCheck: new Date(),
      errorCount: isHealthy ? 0 : 1,
      uptime: process.uptime(),
    };
  }

  async destroy(): void {
    if (this.collectionInterval) {
      clearInterval(this.collectionInterval);
    }
    
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    
    this.customMetrics.clear();
    
    logger.info('System metrics collector stopped');
  }
}

// Export factory function
export function createSystemMetricsCollector(
  serviceName?: string,
  serviceInstance?: string,
  collectionIntervalMs?: number,
  healthCheckIntervalMs?: number
): SystemMetricsCollector {
  return new SystemMetricsCollector(serviceName, serviceInstance, collectionIntervalMs, healthCheckIntervalMs);
}