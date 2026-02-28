/**
 * Federation Performance Monitor Service
 * 
 * Monitors performance metrics, health status, and reliability
 * of federation nodes and operations.
 * 
 * Part of Work Item 4.2.2 - Federation Protocol Implementation
 */

import { logger } from '../../utils/logger.js';
import { DatabaseConnectionPool } from '../../utils/database-pool.js';
import { 
  FederationPerformanceMetric,
  FederationCircuitBreaker,
  validateFederationPerformanceMetric,
  validateFederationCircuitBreaker
} from '../../shared/types/federation.js';

interface HealthCheckResult {
  node_id: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  response_time_ms: number;
  uptime_percentage: number;
  error_rate: number;
  last_error?: string;
}

interface SearchMetrics {
  total_searches: number;
  success_rate: number;
  average_response_time: number;
  fastest_response: number;
  slowest_response: number;
  timeout_rate: number;
}

interface NodePerformanceReport {
  node_id: string;
  node_name: string;
  availability: number;
  response_times: {
    p50: number;
    p95: number;
    p99: number;
  };
  error_rates: {
    http_errors: number;
    timeouts: number;
    connection_failures: number;
  };
  throughput: {
    requests_per_minute: number;
    peak_rps: number;
  };
  reliability_score: number;
}

interface CircuitBreakerState {
  state: 'closed' | 'open' | 'half_open';
  failure_count: number;
  success_count: number;
  last_failure: string | null;
  next_attempt: string | null;
}

export class FederationPerformanceMonitor {
  private db: DatabaseConnectionPool;
  private circuitBreakers = new Map<string, CircuitBreakerState>();

  constructor() {
    this.db = new DatabaseConnectionPool();
  }

  // ===================
  // PERFORMANCE MONITORING
  // ===================

  /**
   * Record performance metric
   */
  async recordMetric(
    nodeId: string,
    metricType: string,
    metricName: string,
    metricValue: number,
    metricUnit: string,
    metadata: Record<string, any> = {}
  ): Promise<FederationPerformanceMetric> {
    logger.debug(`Recording metric: ${metricName} = ${metricValue}${metricUnit} for node: ${nodeId}`);

    try {
      const measurementWindow = new Date().toISOString();

      // Check if metric breaches threshold
      const thresholdBreached = await this.checkMetricThreshold(
        nodeId,
        metricType,
        metricName,
        metricValue
      );

      // Record metric
      const [performanceMetric] = await this.db.db
        .insertInto('federation_performance_metrics')
        .values({
          node_id: nodeId,
          metric_type: metricType,
          metric_name: metricName,
          metric_value: metricValue,
          metric_unit: metricUnit,
          measurement_window_start: measurementWindow,
          measurement_window_end: measurementWindow,
          threshold_breached: thresholdBreached,
          alert_triggered: thresholdBreached,
          metadata: JSON.stringify(metadata)
        })
        .returningAll()
        .execute();

      // Trigger alert if threshold breached
      if (thresholdBreached) {
        await this.triggerPerformanceAlert(nodeId, metricName, metricValue, metricUnit);
      }

      return validateFederationPerformanceMetric(performanceMetric);

    } catch (error) {
      logger.error('Failed to record performance metric:', error);
      throw new Error(`Failed to record performance metric: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Record search metrics
   */
  async recordSearchMetrics(
    tenantId: string,
    searchId: string,
    metrics: {
      execution_time: number;
      nodes_contacted: number;
      nodes_responded: number;
      total_results: number;
    }
  ): Promise<void> {
    logger.debug(`Recording search metrics for search: ${searchId}`);

    try {
      // Record individual metrics
      await this.recordMetric(
        'search_orchestrator',
        'search_performance',
        'execution_time',
        metrics.execution_time,
        'milliseconds',
        {
          tenant_id: tenantId,
          search_id: searchId,
          nodes_contacted: metrics.nodes_contacted,
          nodes_responded: metrics.nodes_responded
        }
      );

      await this.recordMetric(
        'search_orchestrator',
        'search_performance',
        'success_rate',
        (metrics.nodes_responded / Math.max(metrics.nodes_contacted, 1)) * 100,
        'percentage',
        {
          tenant_id: tenantId,
          search_id: searchId
        }
      );

      await this.recordMetric(
        'search_orchestrator',
        'search_performance',
        'results_count',
        metrics.total_results,
        'count',
        {
          tenant_id: tenantId,
          search_id: searchId
        }
      );

    } catch (error) {
      logger.error('Failed to record search metrics:', error);
    }
  }

  /**
   * Get search metrics for period
   */
  async getSearchMetrics(
    tenantId: string,
    period: { start_date: string; end_date: string }
  ): Promise<SearchMetrics> {
    try {
      // Get search performance metrics for the period
      const metrics = await this.db.db
        .selectFrom('federation_performance_metrics')
        .select([
          'metric_name',
          'metric_value',
          'metadata'
        ])
        .where('metric_type', '=', 'search_performance')
        .where('recorded_at', '>=', period.start_date)
        .where('recorded_at', '<=', period.end_date)
        .where('metadata', 'like', `%${tenantId}%`)
        .execute();

      // Aggregate metrics
      const executionTimes = metrics
        .filter(m => m.metric_name === 'execution_time')
        .map(m => m.metric_value);

      const successRates = metrics
        .filter(m => m.metric_name === 'success_rate')
        .map(m => m.metric_value);

      return {
        total_searches: executionTimes.length,
        success_rate: successRates.length > 0 
          ? successRates.reduce((sum, rate) => sum + Number(rate), 0) / successRates.length 
          : 0,
        average_response_time: executionTimes.length > 0
          ? executionTimes.reduce((sum, time) => sum + Number(time), 0) / executionTimes.length
          : 0,
        fastest_response: Math.min(...executionTimes.map(t => Number(t))),
        slowest_response: Math.max(...executionTimes.map(t => Number(t))),
        timeout_rate: 0 // Would calculate from timeout metrics
      };

    } catch (error) {
      logger.error('Failed to get search metrics:', error);
      throw new Error(`Failed to get search metrics: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // ===================
  // HEALTH MONITORING
  // ===================

  /**
   * Perform comprehensive health check on node
   */
  async performHealthCheck(nodeId: string): Promise<HealthCheckResult> {
    logger.info(`Performing comprehensive health check for node: ${nodeId}`);

    try {
      // Get node information
      const node = await this.db.db
        .selectFrom('federation_nodes')
        .select(['primary_endpoint', 'node_name'])
        .where('id', '=', nodeId)
        .executeTakeFirst();

      if (!node) {
        throw new Error('Node not found');
      }

      // Perform health check
      const startTime = Date.now();
      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
      let errorMessage: string | undefined;

      try {
        const response = await fetch(`${node.primary_endpoint}/health`, {
          method: 'GET',
          headers: { 'User-Agent': 'MCP-Tools-Federation-Monitor/1.0' },
          signal: AbortSignal.timeout(10000)
        });

        const responseTime = Date.now() - startTime;

        if (!response.ok) {
          status = 'unhealthy';
          errorMessage = `HTTP ${response.status}`;
        } else if (responseTime > 5000) {
          status = 'degraded';
        }

        // Record response time metric
        await this.recordMetric(
          nodeId,
          'health_check',
          'response_time',
          responseTime,
          'milliseconds'
        );

      } catch (error: any) {
        status = 'unhealthy';
        errorMessage = error instanceof Error ? error.message : String(error);

        // Record failed health check
        await this.recordMetric(
          nodeId,
          'health_check',
          'failure',
          1,
          'count',
          { error: error instanceof Error ? error.message : String(error) }
        );
      }

      // Calculate uptime percentage (last 24 hours)
      const uptimePercentage = await this.calculateUptimePercentage(nodeId);

      // Calculate error rate (last hour)
      const errorRate = await this.calculateErrorRate(nodeId);

      // Update circuit breaker state
      await this.updateCircuitBreakerState(nodeId, status === 'healthy');

      const healthResult: HealthCheckResult = {
        node_id: nodeId,
        status,
        response_time_ms: Date.now() - startTime,
        uptime_percentage: uptimePercentage,
        error_rate: errorRate,
        last_error: errorMessage
      };

      // Update node health status
      await this.updateNodeHealthStatus(nodeId, healthResult);

      return healthResult;

    } catch (error) {
      logger.error('Failed to perform health check:', error);
      throw new Error(`Failed to perform health check: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Schedule health check
   */
  async scheduleHealthCheck(nodeId: string, intervalMinutes: number = 5): Promise<void> {
    logger.info(`Scheduling health check for node: ${nodeId} (${intervalMinutes}min intervals)`);

    try {
      // Update node health check interval
      await this.db.db
        .updateTable('federation_nodes')
        .set({
          health_check_interval: intervalMinutes * 60,
          updated_at: new Date().toISOString()
        })
        .where('id', '=', nodeId)
        .execute();

      // In a real implementation, this would integrate with a job scheduler
      logger.info(`Health check scheduled for node: ${nodeId}`);

    } catch (error) {
      logger.error('Failed to schedule health check:', error);
      throw new Error(`Failed to schedule health check: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // ===================
  // CIRCUIT BREAKER MANAGEMENT
  // ===================

  /**
   * Get or create circuit breaker for node operation
   */
  async getCircuitBreaker(
    tenantId: string,
    targetNodeId: string,
    operationType: string
  ): Promise<FederationCircuitBreaker> {
    logger.debug(`Getting circuit breaker: ${tenantId}:${targetNodeId}:${operationType}`);

    try {
      // Try to get existing circuit breaker
      let circuitBreaker = await this.db.db
        .selectFrom('federation_circuit_breakers')
        .selectAll()
        .where('tenant_id', '=', tenantId)
        .where('target_node_id', '=', targetNodeId)
        .where('operation_type', '=', operationType)
        .executeTakeFirst();

      if (!circuitBreaker) {
        // Create new circuit breaker
        const [newCircuitBreaker] = await this.db.db
          .insertInto('federation_circuit_breakers')
          .values({
            tenant_id: tenantId,
            target_node_id: targetNodeId,
            circuit_name: `${operationType}_${targetNodeId}`,
            operation_type: operationType,
            current_state: 'closed',
            failure_threshold: 5,
            success_threshold: 3,
            timeout_ms: 10000,
            recovery_timeout_ms: 60000
          })
          .returningAll()
          .execute();

        circuitBreaker = newCircuitBreaker;
      }

      return validateFederationCircuitBreaker(circuitBreaker);

    } catch (error) {
      logger.error('Failed to get circuit breaker:', error);
      throw new Error(`Failed to get circuit breaker: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Check if circuit breaker allows request
   */
  async canExecuteRequest(
    tenantId: string,
    targetNodeId: string,
    operationType: string
  ): Promise<boolean> {
    try {
      const circuitBreaker = await this.getCircuitBreaker(tenantId, targetNodeId, operationType);

      switch (circuitBreaker.current_state) {
        case 'closed':
          return true;
          
        case 'open':
          // Check if recovery timeout has passed
          if (circuitBreaker.next_attempt_at && 
              new Date(circuitBreaker.next_attempt_at) <= new Date()) {
            // Transition to half-open
            await this.transitionCircuitBreaker(circuitBreaker.id, 'half_open');
            return true;
          }
          return false;
          
        case 'half_open':
          return true;
          
        default:
          return false;
      }

    } catch (error) {
      logger.error('Failed to check circuit breaker:', error);
      return false;
    }
  }

  /**
   * Record operation result for circuit breaker
   */
  async recordOperationResult(
    tenantId: string,
    targetNodeId: string,
    operationType: string,
    success: boolean,
    error?: string
  ): Promise<void> {
    logger.debug(`Recording operation result: ${success} for ${operationType}`);

    try {
      const circuitBreaker = await this.getCircuitBreaker(tenantId, targetNodeId, operationType);

      if (success) {
        await this.recordSuccessfulOperation(circuitBreaker.id);
      } else {
        await this.recordFailedOperation(circuitBreaker.id, error);
      }

    } catch (error) {
      logger.error('Failed to record operation result:', error);
    }
  }

  // ===================
  // PERFORMANCE REPORTING
  // ===================

  /**
   * Generate node performance report
   */
  async generateNodePerformanceReport(
    nodeId: string,
    period: { start_date: string; end_date: string }
  ): Promise<NodePerformanceReport> {
    logger.info(`Generating performance report for node: ${nodeId}`);

    try {
      // Get node info
      const node = await this.db.db
        .selectFrom('federation_nodes')
        .select(['node_name'])
        .where('id', '=', nodeId)
        .executeTakeFirst();

      if (!node) {
        throw new Error('Node not found');
      }

      // Get performance metrics for the period
      const metrics = await this.db.db
        .selectFrom('federation_performance_metrics')
        .select(['metric_name', 'metric_value', 'threshold_breached'])
        .where('node_id', '=', nodeId)
        .where('recorded_at', '>=', period.start_date)
        .where('recorded_at', '<=', period.end_date)
        .execute();

      // Calculate response time percentiles
      const responseTimes = metrics
        .filter(m => m.metric_name === 'response_time')
        .map(m => Number(m.metric_value))
        .sort((a, b) => a - b);

      const responseTimePercentiles = {
        p50: this.calculatePercentile(responseTimes, 50),
        p95: this.calculatePercentile(responseTimes, 95),
        p99: this.calculatePercentile(responseTimes, 99)
      };

      // Calculate error rates
      const errorMetrics = metrics.filter(m => m.threshold_breached);
      const errorRates = {
        http_errors: errorMetrics.filter(m => m.metric_name.includes('error')).length,
        timeouts: errorMetrics.filter(m => m.metric_name.includes('timeout')).length,
        connection_failures: errorMetrics.filter(m => m.metric_name.includes('connection')).length
      };

      // Calculate throughput
      const requestCounts = metrics
        .filter(m => m.metric_name === 'requests')
        .map(m => Number(m.metric_value));

      const throughput = {
        requests_per_minute: requestCounts.length > 0 
          ? requestCounts.reduce((sum, count) => sum + count, 0) / requestCounts.length 
          : 0,
        peak_rps: Math.max(...requestCounts, 0)
      };

      // Calculate availability
      const healthCheckResults = metrics
        .filter(m => m.metric_name === 'health_check')
        .map(m => !m.threshold_breached);

      const availability = healthCheckResults.length > 0
        ? (healthCheckResults.filter(healthy => healthy).length / healthCheckResults.length) * 100
        : 0;

      // Calculate overall reliability score
      const reliabilityScore = this.calculateReliabilityScore(
        availability,
        responseTimePercentiles.p95,
        errorRates
      );

      return {
        node_id: nodeId,
        node_name: node.node_name,
        availability,
        response_times: responseTimePercentiles,
        error_rates: errorRates,
        throughput,
        reliability_score: reliabilityScore
      };

    } catch (error) {
      logger.error('Failed to generate node performance report:', error);
      throw new Error(`Failed to generate node performance report: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // ===================
  // PRIVATE HELPER METHODS
  // ===================

  private async checkMetricThreshold(
    nodeId: string,
    metricType: string,
    metricName: string,
    metricValue: number
  ): Promise<boolean> {
    // Define thresholds for different metrics
    const thresholds: Record<string, number> = {
      'response_time': 5000, // 5 seconds
      'error_rate': 10, // 10%
      'cpu_usage': 80, // 80%
      'memory_usage': 85 // 85%
    };

    const threshold = thresholds[metricName];
    return threshold ? metricValue > threshold : false;
  }

  private async triggerPerformanceAlert(
    nodeId: string,
    metricName: string,
    metricValue: number,
    metricUnit: string
  ): Promise<void> {
    logger.warn(`Performance alert: ${metricName} = ${metricValue}${metricUnit} for node: ${nodeId}`);

    // In a real implementation, this would send notifications
    // via email, Slack, or other alerting systems
  }

  private async calculateUptimePercentage(nodeId: string): Promise<number> {
    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

    const healthChecks = await this.db.db
      .selectFrom('federation_performance_metrics')
      .select(['threshold_breached'])
      .where('node_id', '=', nodeId)
      .where('metric_type', '=', 'health_check')
      .where('recorded_at', '>=', twentyFourHoursAgo.toISOString())
      .execute();

    if (healthChecks.length === 0) {
      return 0;
    }

    const successfulChecks = healthChecks.filter(check => !check.threshold_breached).length;
    return (successfulChecks / healthChecks.length) * 100;
  }

  private async calculateErrorRate(nodeId: string): Promise<number> {
    const oneHourAgo = new Date();
    oneHourAgo.setHours(oneHourAgo.getHours() - 1);

    const [errorCount] = await this.db.db
      .selectFrom('federation_performance_metrics')
      .select((eb) => eb.fn.count<number>('id').as('count'))
      .where('node_id', '=', nodeId)
      .where('threshold_breached', '=', true)
      .where('recorded_at', '>=', oneHourAgo.toISOString())
      .execute();

    const [totalCount] = await this.db.db
      .selectFrom('federation_performance_metrics')
      .select((eb) => eb.fn.count<number>('id').as('count'))
      .where('node_id', '=', nodeId)
      .where('recorded_at', '>=', oneHourAgo.toISOString())
      .execute();

    return totalCount.count > 0 ? (errorCount.count / totalCount.count) * 100 : 0;
  }

  private async updateNodeHealthStatus(nodeId: string, healthResult: HealthCheckResult): Promise<void> {
    await this.db.db
      .updateTable('federation_nodes')
      .set({
        health_status: healthResult.status,
        response_time_ms: healthResult.response_time_ms,
        uptime_percentage: healthResult.uptime_percentage,
        last_health_check: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .where('id', '=', nodeId)
      .execute();
  }

  private async updateCircuitBreakerState(nodeId: string, success: boolean): Promise<void> {
    // Update circuit breaker states for this node
    const circuitBreakers = await this.db.db
      .selectFrom('federation_circuit_breakers')
      .selectAll()
      .where('target_node_id', '=', nodeId)
      .execute();

    for (const cb of circuitBreakers) {
      if (success) {
        await this.recordSuccessfulOperation(cb.id);
      } else {
        await this.recordFailedOperation(cb.id, 'Health check failed');
      }
    }
  }

  private async transitionCircuitBreaker(
    circuitBreakerId: string,
    newState: 'closed' | 'open' | 'half_open'
  ): Promise<void> {
    const updateData: any = {
      current_state: newState,
      last_state_change_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    if (newState === 'open') {
      const recoveryTime = new Date();
      recoveryTime.setMinutes(recoveryTime.getMinutes() + 1); // 1 minute recovery
      updateData.opened_at = new Date().toISOString();
      updateData.next_attempt_at = recoveryTime.toISOString();
    } else if (newState === 'half_open') {
      updateData.half_open_at = new Date().toISOString();
    }

    await this.db.db
      .updateTable('federation_circuit_breakers')
      .set(updateData)
      .where('id', '=', circuitBreakerId)
      .execute();
  }

  private async recordSuccessfulOperation(circuitBreakerId: string): Promise<void> {
    const circuitBreaker = await this.db.db
      .selectFrom('federation_circuit_breakers')
      .selectAll()
      .where('id', '=', circuitBreakerId)
      .executeTakeFirst();

    if (!circuitBreaker) return;

    const newSuccessCount = circuitBreaker.success_count + 1;
    const newConsecutiveSuccesses = circuitBreaker.consecutive_successes + 1;

    let newState = circuitBreaker.current_state;
    
    // Transition logic
    if (circuitBreaker.current_state === 'half_open' && 
        newConsecutiveSuccesses >= circuitBreaker.success_threshold) {
      newState = 'closed';
    }

    await this.db.db
      .updateTable('federation_circuit_breakers')
      .set({
        success_count: newSuccessCount,
        consecutive_successes: newConsecutiveSuccesses,
        consecutive_failures: 0,
        current_state: newState,
        last_success_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .where('id', '=', circuitBreakerId)
      .execute();
  }

  private async recordFailedOperation(circuitBreakerId: string, error?: string): Promise<void> {
    const circuitBreaker = await this.db.db
      .selectFrom('federation_circuit_breakers')
      .selectAll()
      .where('id', '=', circuitBreakerId)
      .executeTakeFirst();

    if (!circuitBreaker) return;

    const newFailureCount = circuitBreaker.failure_count + 1;
    const newConsecutiveFailures = circuitBreaker.consecutive_failures + 1;

    let newState = circuitBreaker.current_state;
    
    // Transition to open if failure threshold exceeded
    if (newConsecutiveFailures >= circuitBreaker.failure_threshold) {
      newState = 'open';
    }

    await this.db.db
      .updateTable('federation_circuit_breakers')
      .set({
        failure_count: newFailureCount,
        consecutive_failures: newConsecutiveFailures,
        consecutive_successes: 0,
        current_state: newState,
        last_failure_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .where('id', '=', circuitBreakerId)
      .execute();

    if (newState === 'open') {
      await this.transitionCircuitBreaker(circuitBreakerId, 'open');
    }
  }

  private calculatePercentile(values: number[], percentile: number): number {
    if (values.length === 0) return 0;
    
    const index = Math.ceil((percentile / 100) * values.length) - 1;
    return values[Math.max(0, Math.min(index, values.length - 1))];
  }

  private calculateReliabilityScore(
    availability: number,
    p95ResponseTime: number,
    errorRates: any
  ): number {
    let score = 100;
    
    // Deduct for low availability
    if (availability < 95) {
      score -= (95 - availability) * 2;
    }
    
    // Deduct for high response times
    if (p95ResponseTime > 1000) {
      score -= Math.min(20, (p95ResponseTime - 1000) / 100);
    }
    
    // Deduct for errors
    const totalErrors = errorRates.http_errors + errorRates.timeouts + errorRates.connection_failures;
    score -= Math.min(30, totalErrors * 2);
    
    return Math.max(0, Math.round(score));
  }
}