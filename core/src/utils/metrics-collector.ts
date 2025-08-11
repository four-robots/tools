/**
 * Metrics Collector Utility
 * 
 * Comprehensive performance monitoring and metrics collection for conflict resolution operations.
 * Provides structured logging of operation metrics, performance data, and system health indicators.
 * Designed for production monitoring and performance optimization.
 */

import { logger } from './logger.js';

export interface OperationMetrics {
  operationId: string;
  operationType: string;
  durationMs: number;
  success: boolean;
  errorType?: string;
  resourceUsage?: ResourceUsage;
  customData?: Record<string, any>;
}

export interface ResourceUsage {
  memoryUsageMB?: number;
  cpuTimeMs?: number;
  diskIOBytes?: number;
  networkIOBytes?: number;
}

export interface MergeOperationMetrics extends OperationMetrics {
  strategy: string;
  conflictCount: number;
  resolvedConflicts: number;
  userCount: number;
  confidenceScore: number;
  requiresManualReview: boolean;
}

export interface AIAnalysisMetrics extends OperationMetrics {
  tokensUsed: number;
  modelUsed: string;
  confidenceScore: number;
  semanticCoherence: number;
  promptTokens: number;
  completionTokens: number;
}

export interface TransformationMetrics extends OperationMetrics {
  operationCount: number;
  transformedOperations: number;
  conflictingOperations: number;
  lockWaitTimeMs?: number;
}

export interface ConflictResolutionMetrics extends OperationMetrics {
  conflictType: string;
  resolutionStrategy: string;
  participantCount: number;
  autoResolved: boolean;
  finalConfidence: number;
}

/**
 * Centralized metrics collection service for conflict resolution operations
 */
export class MetricsCollector {
  private static instance: MetricsCollector;
  private metricsBuffer: OperationMetrics[] = [];
  private readonly maxBufferSize = 1000;
  private flushInterval: NodeJS.Timeout;

  constructor() {
    // Periodically flush metrics buffer
    this.flushInterval = setInterval(() => this.flushMetrics(), 30000); // 30 seconds
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): MetricsCollector {
    if (!MetricsCollector.instance) {
      MetricsCollector.instance = new MetricsCollector();
    }
    return MetricsCollector.instance;
  }

  /**
   * Records merge operation metrics
   */
  static recordMergeOperation(
    strategy: string,
    duration: number,
    success: boolean,
    conflictCount: number = 0,
    resolvedConflicts: number = 0,
    userCount: number = 1,
    confidence: number = 0,
    requiresManualReview: boolean = false,
    customData?: Record<string, any>
  ): void {
    const metrics: MergeOperationMetrics = {
      operationId: crypto.randomUUID(),
      operationType: 'merge_operation',
      durationMs: duration,
      success,
      strategy,
      conflictCount,
      resolvedConflicts,
      userCount,
      confidenceScore: confidence,
      requiresManualReview,
      customData
    };

    MetricsCollector.getInstance().recordMetrics(metrics);
    
    // Log structured metrics
    logger.info('Merge operation completed', {
      strategy,
      durationMs: duration,
      success,
      metrics: {
        conflictCount,
        resolvedConflicts,
        userCount,
        confidenceScore: confidence,
        autoResolutionRate: conflictCount > 0 ? resolvedConflicts / conflictCount : 1,
        requiresManualReview
      }
    });
  }

  /**
   * Records operational transformation metrics
   */
  static recordOperationTransform(
    operationCount: number,
    transformedCount: number,
    duration: number,
    success: boolean = true,
    conflictingOps: number = 0,
    lockWaitTime?: number,
    customData?: Record<string, any>
  ): void {
    const metrics: TransformationMetrics = {
      operationId: crypto.randomUUID(),
      operationType: 'operation_transform',
      durationMs: duration,
      success,
      operationCount,
      transformedOperations: transformedCount,
      conflictingOperations: conflictingOps,
      lockWaitTimeMs: lockWaitTime,
      customData
    };

    MetricsCollector.getInstance().recordMetrics(metrics);

    logger.info('Operation transformation completed', {
      durationMs: duration,
      success,
      metrics: {
        operationsTransformed: transformedCount,
        originalOperationCount: operationCount,
        conflictingOperations: conflictingOps,
        transformationSuccessRate: operationCount > 0 ? transformedCount / operationCount : 1,
        lockWaitTimeMs: lockWaitTime
      }
    });
  }

  /**
   * Records AI analysis metrics
   */
  static recordAIAnalysis(
    tokensUsed: number,
    duration: number,
    confidence: number,
    success: boolean = true,
    modelUsed: string = 'unknown',
    semanticCoherence: number = 0,
    promptTokens: number = 0,
    completionTokens: number = 0,
    customData?: Record<string, any>
  ): void {
    const metrics: AIAnalysisMetrics = {
      operationId: crypto.randomUUID(),
      operationType: 'ai_analysis',
      durationMs: duration,
      success,
      tokensUsed,
      modelUsed,
      confidenceScore: confidence,
      semanticCoherence,
      promptTokens,
      completionTokens,
      customData
    };

    MetricsCollector.getInstance().recordMetrics(metrics);

    logger.info('AI analysis completed', {
      durationMs: duration,
      success,
      metrics: {
        tokensUsed,
        modelUsed,
        confidenceScore: confidence,
        semanticCoherence,
        costMetrics: {
          promptTokens,
          completionTokens,
          totalTokens: tokensUsed
        }
      }
    });
  }

  /**
   * Records conflict resolution metrics
   */
  static recordConflictResolution(
    conflictType: string,
    resolutionStrategy: string,
    userCount: number,
    duration: number,
    success: boolean = true,
    autoResolved: boolean = true,
    finalConfidence: number = 0,
    customData?: Record<string, any>
  ): void {
    const metrics: ConflictResolutionMetrics = {
      operationId: crypto.randomUUID(),
      operationType: 'conflict_resolution',
      durationMs: duration,
      success,
      conflictType,
      resolutionStrategy,
      participantCount: userCount,
      autoResolved,
      finalConfidence,
      customData
    };

    MetricsCollector.getInstance().recordMetrics(metrics);

    logger.info('Conflict resolution completed', {
      conflictType,
      resolutionStrategy,
      durationMs: duration,
      success,
      metrics: {
        participantCount: userCount,
        autoResolved,
        finalConfidence,
        resolutionEfficiency: autoResolved ? 'automatic' : 'manual'
      }
    });
  }

  /**
   * Records performance metrics for any operation
   */
  static recordPerformanceMetrics(
    operationType: string,
    duration: number,
    success: boolean,
    resourceUsage?: ResourceUsage,
    customData?: Record<string, any>
  ): void {
    const metrics: OperationMetrics = {
      operationId: crypto.randomUUID(),
      operationType,
      durationMs: duration,
      success,
      resourceUsage,
      customData
    };

    MetricsCollector.getInstance().recordMetrics(metrics);

    logger.info('Operation performance recorded', {
      operationType,
      durationMs: duration,
      success,
      resourceUsage
    });
  }

  /**
   * Records system health metrics
   */
  static recordSystemHealth(
    componentName: string,
    healthStatus: 'healthy' | 'degraded' | 'unhealthy',
    responseTimeMs?: number,
    errorRate?: number,
    throughput?: number,
    customData?: Record<string, any>
  ): void {
    const metrics: OperationMetrics = {
      operationId: crypto.randomUUID(),
      operationType: 'system_health',
      durationMs: responseTimeMs || 0,
      success: healthStatus === 'healthy',
      customData: {
        componentName,
        healthStatus,
        errorRate,
        throughput,
        ...customData
      }
    };

    MetricsCollector.getInstance().recordMetrics(metrics);

    logger.info('System health check', {
      componentName,
      healthStatus,
      responseTimeMs,
      errorRate,
      throughput
    });
  }

  /**
   * Records error metrics with sanitization
   */
  static recordError(
    operationType: string,
    errorType: string,
    errorMessage: string,
    duration: number,
    context?: Record<string, any>
  ): void {
    // Sanitize error message
    const sanitizedMessage = this.sanitizeErrorMessage(errorMessage);
    
    const metrics: OperationMetrics = {
      operationId: crypto.randomUUID(),
      operationType,
      durationMs: duration,
      success: false,
      errorType,
      customData: {
        sanitizedError: sanitizedMessage,
        ...context
      }
    };

    MetricsCollector.getInstance().recordMetrics(metrics);

    logger.error('Operation error recorded', {
      operationType,
      errorType,
      durationMs: duration,
      error: sanitizedMessage
    });
  }

  /**
   * Gets aggregated metrics for reporting
   */
  static getMetricsSummary(
    operationType?: string,
    timeRangeMinutes: number = 60
  ): {
    totalOperations: number;
    successRate: number;
    averageDuration: number;
    errorCount: number;
    throughputPerMinute: number;
  } {
    const instance = MetricsCollector.getInstance();
    const cutoffTime = Date.now() - (timeRangeMinutes * 60 * 1000);
    
    const recentMetrics = instance.metricsBuffer.filter(m => {
      const metricsTime = Date.now() - m.durationMs; // Approximate
      return metricsTime >= cutoffTime && 
             (!operationType || m.operationType === operationType);
    });

    const totalOperations = recentMetrics.length;
    const successfulOps = recentMetrics.filter(m => m.success).length;
    const successRate = totalOperations > 0 ? successfulOps / totalOperations : 0;
    const averageDuration = totalOperations > 0 ? 
      recentMetrics.reduce((sum, m) => sum + m.durationMs, 0) / totalOperations : 0;
    const errorCount = totalOperations - successfulOps;
    const throughputPerMinute = totalOperations / timeRangeMinutes;

    return {
      totalOperations,
      successRate,
      averageDuration,
      errorCount,
      throughputPerMinute
    };
  }

  /**
   * Records metrics in buffer
   */
  private recordMetrics(metrics: OperationMetrics): void {
    this.metricsBuffer.push(metrics);

    // Prevent buffer overflow
    if (this.metricsBuffer.length > this.maxBufferSize) {
      this.metricsBuffer = this.metricsBuffer.slice(-this.maxBufferSize / 2);
    }
  }

  /**
   * Flushes metrics buffer (placeholder for actual implementation)
   */
  private flushMetrics(): void {
    if (this.metricsBuffer.length === 0) return;

    logger.debug('Flushing metrics buffer', { 
      metricsCount: this.metricsBuffer.length 
    });

    // In a production environment, this would:
    // 1. Send metrics to a monitoring system (Prometheus, DataDog, etc.)
    // 2. Store in a time-series database
    // 3. Trigger alerts based on thresholds
    
    // For now, just log summary and clear buffer
    const summary = this.getMetricsSummaryFromBuffer();
    logger.info('Metrics summary', summary);
    
    // Clear buffer after flush
    this.metricsBuffer = [];
  }

  /**
   * Gets summary from current buffer
   */
  private getMetricsSummaryFromBuffer(): Record<string, any> {
    if (this.metricsBuffer.length === 0) return {};

    const operationTypes = Array.from(new Set(this.metricsBuffer.map(m => m.operationType)));
    const summary: Record<string, any> = {};

    for (const type of operationTypes) {
      const typeMetrics = this.metricsBuffer.filter(m => m.operationType === type);
      const successCount = typeMetrics.filter(m => m.success).length;
      const avgDuration = typeMetrics.reduce((sum, m) => sum + m.durationMs, 0) / typeMetrics.length;
      
      summary[type] = {
        count: typeMetrics.length,
        successRate: successCount / typeMetrics.length,
        averageDurationMs: avgDuration,
        errorCount: typeMetrics.length - successCount
      };
    }

    return summary;
  }

  /**
   * Sanitizes error messages to prevent data leakage
   * @deprecated Use ErrorSanitizer.sanitizeErrorMessage instead
   */
  private static sanitizeErrorMessage(message: string): string {
    // Import ErrorSanitizer for consistent sanitization
    const { ErrorSanitizer } = require('./sanitizer.js');
    return ErrorSanitizer.sanitizeErrorMessage(new Error(message), 'metrics').replace('[metrics] ', '');
  }

  /**
   * Cleanup method for graceful shutdown
   */
  public destroy(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }
    this.flushMetrics(); // Final flush
  }
}

// Export singleton instance for convenient access
export const metricsCollector = MetricsCollector.getInstance();