/**
 * Advanced OT Utilities for Performance Optimization
 * 
 * Provides utilities for enhancing operational transform performance:
 * - Vector clock management
 * - Operation compression and deduplication
 * - Conflict prediction algorithms
 * - Performance analysis and bottleneck identification
 * - Memory-efficient operation storage
 */

import { Logger } from '../../utils/logger.js';
import {
  EnhancedWhiteboardOperation,
  ConflictInfo,
  ConflictType,
  ConflictSeverity,
  PerformanceMetrics,
  EnhancedTransformContext
} from './whiteboard-ot-engine.js';

// Vector Clock Management
export class VectorClockManager {
  private logger: Logger;
  private clocks: Map<string, Record<string, number>> = new Map();
  private clockHistory: Array<{ timestamp: string; clocks: Record<string, Record<string, number>> }> = [];

  constructor(logger?: Logger) {
    this.logger = logger || new Logger('VectorClockManager');
  }

  /**
   * Create a new vector clock for a whiteboard
   */
  createClock(whiteboardId: string, userIds: string[]): Record<string, number> {
    const clock: Record<string, number> = {};
    for (const userId of userIds) {
      clock[userId] = 0;
    }
    this.clocks.set(whiteboardId, clock);
    return clock;
  }

  /**
   * Increment vector clock for a specific user
   */
  incrementClock(whiteboardId: string, userId: string): Record<string, number> {
    const clock = this.clocks.get(whiteboardId) || {};
    const newClock = { ...clock };
    newClock[userId] = (newClock[userId] || 0) + 1;
    this.clocks.set(whiteboardId, newClock);
    
    // Store in history for analysis
    this.clockHistory.push({
      timestamp: new Date().toISOString(),
      clocks: { [whiteboardId]: newClock }
    });
    
    // Keep only recent history
    if (this.clockHistory.length > 1000) {
      this.clockHistory.shift();
    }
    
    return newClock;
  }

  /**
   * Merge two vector clocks
   */
  mergeClocks(clock1: Record<string, number>, clock2: Record<string, number>): Record<string, number> {
    const merged: Record<string, number> = { ...clock1 };
    for (const [userId, timestamp] of Object.entries(clock2)) {
      merged[userId] = Math.max(merged[userId] || 0, timestamp);
    }
    return merged;
  }

  /**
   * Compare causal relationships between clocks
   */
  compareCausalOrder(clock1: Record<string, number>, clock2: Record<string, number>): 'before' | 'after' | 'concurrent' {
    let clock1Greater = false;
    let clock2Greater = false;
    
    const allUsers = new Set([...Object.keys(clock1), ...Object.keys(clock2)]);
    
    for (const userId of allUsers) {
      const time1 = clock1[userId] || 0;
      const time2 = clock2[userId] || 0;
      
      if (time1 > time2) clock1Greater = true;
      if (time2 > time1) clock2Greater = true;
    }
    
    if (clock1Greater && !clock2Greater) return 'after';
    if (clock2Greater && !clock1Greater) return 'before';
    return 'concurrent';
  }

  /**
   * Get clock synchronization metrics
   */
  getClockMetrics(whiteboardId: string): {
    totalEvents: number;
    clockSkew: number;
    synchronizationHealth: number;
    userActivity: Record<string, number>;
  } {
    const clock = this.clocks.get(whiteboardId) || {};
    const userTimes = Object.values(clock);
    const maxTime = Math.max(...userTimes, 0);
    const minTime = Math.min(...userTimes, 0);
    const clockSkew = maxTime - minTime;
    
    // Calculate synchronization health (0-1, where 1 is perfect sync)
    const synchronizationHealth = maxTime > 0 ? 1 - (clockSkew / maxTime) : 1;
    
    return {
      totalEvents: maxTime,
      clockSkew,
      synchronizationHealth,
      userActivity: clock
    };
  }
}

// Operation Compression and Deduplication
export class OperationCompressor {
  private logger: Logger;
  private compressionStats = {
    originalOperations: 0,
    compressedOperations: 0,
    compressionRatio: 0,
    timeSaved: 0
  };

  constructor(logger?: Logger) {
    this.logger = logger || new Logger('OperationCompressor');
  }

  /**
   * Compress sequential operations on the same element
   */
  compressOperations(operations: EnhancedWhiteboardOperation[]): EnhancedWhiteboardOperation[] {
    const startTime = Date.now();
    const originalCount = operations.length;
    
    if (operations.length === 0) return operations;

    // Group operations by element
    const operationGroups = new Map<string, EnhancedWhiteboardOperation[]>();
    
    for (const operation of operations) {
      const key = operation.elementId;
      if (!operationGroups.has(key)) {
        operationGroups.set(key, []);
      }
      operationGroups.get(key)!.push(operation);
    }

    // Compress each group
    const compressedOperations: EnhancedWhiteboardOperation[] = [];
    
    for (const [elementId, elementOps] of operationGroups) {
      if (elementOps.length === 1) {
        compressedOperations.push(elementOps[0]);
        continue;
      }

      // Sort operations by timestamp
      elementOps.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      // Merge sequential operations
      const merged = this.mergeSequentialOperations(elementOps);
      compressedOperations.push(merged);
    }

    // Update compression stats
    const processingTime = Date.now() - startTime;
    this.compressionStats.originalOperations += originalCount;
    this.compressionStats.compressedOperations += compressedOperations.length;
    this.compressionStats.compressionRatio = 
      this.compressionStats.originalOperations > 0 
        ? this.compressionStats.compressedOperations / this.compressionStats.originalOperations 
        : 1;
    this.compressionStats.timeSaved += processingTime;

    this.logger.debug('Operations compressed', {
      originalCount,
      compressedCount: compressedOperations.length,
      compressionRatio: compressedOperations.length / originalCount,
      processingTimeMs: processingTime
    });

    return compressedOperations;
  }

  /**
   * Merge multiple operations on the same element
   */
  private mergeSequentialOperations(operations: EnhancedWhiteboardOperation[]): EnhancedWhiteboardOperation {
    if (operations.length === 1) return operations[0];

    let merged = operations[0];
    
    for (let i = 1; i < operations.length; i++) {
      const current = operations[i];
      
      // Skip delete operations if there's a later create
      if (merged.type === 'delete' && current.type === 'create') {
        merged = current;
        continue;
      }
      
      // Skip if current operation is older
      if (new Date(current.timestamp) < new Date(merged.timestamp)) {
        continue;
      }

      // Merge data, position, style
      merged = {
        ...merged,
        ...current,
        data: { ...merged.data, ...current.data },
        position: current.position || merged.position,
        bounds: current.bounds || merged.bounds,
        style: { ...merged.style, ...current.style },
        timestamp: current.timestamp,
        version: current.version,
        vectorClock: this.mergeVectorClocks(merged.vectorClock, current.vectorClock),
        lamportTimestamp: Math.max(merged.lamportTimestamp, current.lamportTimestamp),
        metadata: {
          ...merged.metadata,
          ...current.metadata,
          compressedFrom: (merged.metadata?.compressedFrom || 1) + 1
        }
      };
    }

    return merged;
  }

  /**
   * Deduplicate identical operations
   */
  deduplicateOperations(operations: EnhancedWhiteboardOperation[]): EnhancedWhiteboardOperation[] {
    const seen = new Set<string>();
    const deduplicated: EnhancedWhiteboardOperation[] = [];

    for (const operation of operations) {
      const signature = this.getOperationSignature(operation);
      if (!seen.has(signature)) {
        seen.add(signature);
        deduplicated.push(operation);
      }
    }

    this.logger.debug('Operations deduplicated', {
      originalCount: operations.length,
      deduplicatedCount: deduplicated.length,
      duplicatesRemoved: operations.length - deduplicated.length
    });

    return deduplicated;
  }

  /**
   * Generate unique signature for operation
   */
  private getOperationSignature(operation: EnhancedWhiteboardOperation): string {
    const key = {
      type: operation.type,
      elementId: operation.elementId,
      data: operation.data,
      position: operation.position,
      bounds: operation.bounds,
      style: operation.style,
      userId: operation.userId
    };
    return JSON.stringify(key);
  }

  /**
   * Get compression statistics
   */
  getCompressionStats(): typeof this.compressionStats {
    return { ...this.compressionStats };
  }

  private mergeVectorClocks(clock1: Record<string, number>, clock2: Record<string, number>): Record<string, number> {
    const merged: Record<string, number> = { ...clock1 };
    for (const [userId, timestamp] of Object.entries(clock2)) {
      merged[userId] = Math.max(merged[userId] || 0, timestamp);
    }
    return merged;
  }
}

// Conflict Prediction
export class ConflictPredictor {
  private logger: Logger;
  private predictionHistory: Array<{
    prediction: ConflictInfo;
    actualConflict: boolean;
    accuracy: number;
    timestamp: string;
  }> = [];

  constructor(logger?: Logger) {
    this.logger = logger || new Logger('ConflictPredictor');
  }

  /**
   * Predict potential conflicts based on user activity patterns
   */
  predictConflicts(
    operations: EnhancedWhiteboardOperation[],
    userActivity: Record<string, { position: { x: number; y: number }; timestamp: string }>,
    context: EnhancedTransformContext
  ): Array<{
    probability: number;
    type: ConflictType;
    estimatedSeverity: ConflictSeverity;
    affectedUsers: string[];
    affectedElements: string[];
    preventionStrategy: string;
  }> {
    const predictions: Array<{
      probability: number;
      type: ConflictType;
      estimatedSeverity: ConflictSeverity;
      affectedUsers: string[];
      affectedElements: string[];
      preventionStrategy: string;
    }> = [];

    // Spatial conflict prediction
    const spatialPredictions = this.predictSpatialConflicts(userActivity);
    predictions.push(...spatialPredictions);

    // Temporal conflict prediction
    const temporalPredictions = this.predictTemporalConflicts(operations);
    predictions.push(...temporalPredictions);

    // Semantic conflict prediction
    const semanticPredictions = this.predictSemanticConflicts(operations);
    predictions.push(...semanticPredictions);

    // Sort by probability (highest first)
    predictions.sort((a, b) => b.probability - a.probability);

    this.logger.debug('Conflict predictions generated', {
      totalPredictions: predictions.length,
      highProbabilityCount: predictions.filter(p => p.probability > 0.7).length,
      mediumProbabilityCount: predictions.filter(p => p.probability > 0.4 && p.probability <= 0.7).length
    });

    return predictions;
  }

  /**
   * Predict spatial conflicts based on user cursor positions
   */
  private predictSpatialConflicts(
    userActivity: Record<string, { position: { x: number; y: number }; timestamp: string }>
  ): Array<{
    probability: number;
    type: ConflictType;
    estimatedSeverity: ConflictSeverity;
    affectedUsers: string[];
    affectedElements: string[];
    preventionStrategy: string;
  }> {
    const predictions: Array<{
      probability: number;
      type: ConflictType;
      estimatedSeverity: ConflictSeverity;
      affectedUsers: string[];
      affectedElements: string[];
      preventionStrategy: string;
    }> = [];

    const users = Object.keys(userActivity);
    const spatialThreshold = 100; // pixels

    for (let i = 0; i < users.length; i++) {
      for (let j = i + 1; j < users.length; j++) {
        const user1 = users[i];
        const user2 = users[j];
        const activity1 = userActivity[user1];
        const activity2 = userActivity[user2];

        if (!activity1 || !activity2) continue;

        const distance = Math.sqrt(
          Math.pow(activity1.position.x - activity2.position.x, 2) +
          Math.pow(activity1.position.y - activity2.position.y, 2)
        );

        if (distance < spatialThreshold) {
          const probability = Math.max(0, 1 - (distance / spatialThreshold));
          const severity: ConflictSeverity = distance < spatialThreshold * 0.3 ? 'high' : 
                                           distance < spatialThreshold * 0.6 ? 'medium' : 'low';

          predictions.push({
            probability,
            type: 'spatial',
            estimatedSeverity: severity,
            affectedUsers: [user1, user2],
            affectedElements: [], // Would need element tracking
            preventionStrategy: 'Suggest users work in different areas or enable conflict-aware zones'
          });
        }
      }
    }

    return predictions;
  }

  /**
   * Predict temporal conflicts based on operation frequency
   */
  private predictTemporalConflicts(
    operations: EnhancedWhiteboardOperation[]
  ): Array<{
    probability: number;
    type: ConflictType;
    estimatedSeverity: ConflictSeverity;
    affectedUsers: string[];
    affectedElements: string[];
    preventionStrategy: string;
  }> {
    const predictions: Array<{
      probability: number;
      type: ConflictType;
      estimatedSeverity: ConflictSeverity;
      affectedUsers: string[];
      affectedElements: string[];
      preventionStrategy: string;
    }> = [];

    // Group operations by element and analyze timing
    const elementOperations = new Map<string, EnhancedWhiteboardOperation[]>();
    
    for (const operation of operations) {
      if (!elementOperations.has(operation.elementId)) {
        elementOperations.set(operation.elementId, []);
      }
      elementOperations.get(operation.elementId)!.push(operation);
    }

    for (const [elementId, elementOps] of elementOperations) {
      if (elementOps.length < 2) continue;

      // Sort by timestamp
      elementOps.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      // Check for rapid successive operations
      for (let i = 1; i < elementOps.length; i++) {
        const timeDiff = new Date(elementOps[i].timestamp).getTime() - 
                        new Date(elementOps[i-1].timestamp).getTime();
        
        if (timeDiff < 1000 && elementOps[i].userId !== elementOps[i-1].userId) { // Less than 1 second
          const probability = Math.max(0, 1 - (timeDiff / 1000));
          const severity: ConflictSeverity = timeDiff < 200 ? 'high' : 
                                           timeDiff < 500 ? 'medium' : 'low';

          predictions.push({
            probability,
            type: 'temporal',
            estimatedSeverity: severity,
            affectedUsers: [elementOps[i-1].userId, elementOps[i].userId],
            affectedElements: [elementId],
            preventionStrategy: 'Implement operation throttling or suggest coordination between users'
          });
        }
      }
    }

    return predictions;
  }

  /**
   * Predict semantic conflicts based on operation types
   */
  private predictSemanticConflicts(
    operations: EnhancedWhiteboardOperation[]
  ): Array<{
    probability: number;
    type: ConflictType;
    estimatedSeverity: ConflictSeverity;
    affectedUsers: string[];
    affectedElements: string[];
    preventionStrategy: string;
  }> {
    const predictions: Array<{
      probability: number;
      type: ConflictType;
      estimatedSeverity: ConflictSeverity;
      affectedUsers: string[];
      affectedElements: string[];
      preventionStrategy: string;
    }> = [];

    // Group by element
    const elementOperations = new Map<string, EnhancedWhiteboardOperation[]>();
    
    for (const operation of operations) {
      if (!elementOperations.has(operation.elementId)) {
        elementOperations.set(operation.elementId, []);
      }
      elementOperations.get(operation.elementId)!.push(operation);
    }

    for (const [elementId, elementOps] of elementOperations) {
      const conflictingTypes = this.findConflictingOperationTypes(elementOps);
      
      if (conflictingTypes.length > 0) {
        const probability = Math.min(1, conflictingTypes.length * 0.3);
        const severity: ConflictSeverity = conflictingTypes.includes('delete') ? 'high' : 'medium';
        const affectedUsers = [...new Set(elementOps.map(op => op.userId))];

        predictions.push({
          probability,
          type: 'semantic',
          estimatedSeverity: severity,
          affectedUsers,
          affectedElements: [elementId],
          preventionStrategy: 'Implement element locking or suggest user coordination'
        });
      }
    }

    return predictions;
  }

  /**
   * Find potentially conflicting operation types
   */
  private findConflictingOperationTypes(operations: EnhancedWhiteboardOperation[]): string[] {
    const types = operations.map(op => op.type);
    const conflicts: string[] = [];

    // Delete vs any other operation
    if (types.includes('delete') && types.some(t => t !== 'delete')) {
      conflicts.push('delete');
    }

    // Multiple style changes
    const styleOps = operations.filter(op => op.type === 'style');
    if (styleOps.length > 1) {
      const uniqueUsers = new Set(styleOps.map(op => op.userId));
      if (uniqueUsers.size > 1) {
        conflicts.push('style');
      }
    }

    return conflicts;
  }

  /**
   * Record prediction accuracy for machine learning improvement
   */
  recordPredictionAccuracy(predictionId: string, actualConflict: boolean): void {
    // In a real implementation, this would update ML models
    this.logger.debug('Prediction accuracy recorded', { predictionId, actualConflict });
  }

  /**
   * Get prediction accuracy statistics
   */
  getPredictionAccuracy(): {
    totalPredictions: number;
    correctPredictions: number;
    accuracy: number;
    falsePositives: number;
    falseNegatives: number;
  } {
    const total = this.predictionHistory.length;
    const correct = this.predictionHistory.filter(p => p.actualConflict).length;
    
    return {
      totalPredictions: total,
      correctPredictions: correct,
      accuracy: total > 0 ? correct / total : 0,
      falsePositives: this.predictionHistory.filter(p => !p.actualConflict).length,
      falseNegatives: 0 // Would need to track missed conflicts
    };
  }
}

// Performance Analyzer
export class PerformanceAnalyzer {
  private logger: Logger;
  private performanceData: Array<{
    timestamp: string;
    operationType: string;
    processingTime: number;
    memoryUsage: number;
    queueSize: number;
    conflictCount: number;
    userCount: number;
  }> = [];

  constructor(logger?: Logger) {
    this.logger = logger || new Logger('PerformanceAnalyzer');
  }

  /**
   * Record performance data point
   */
  recordPerformanceData(data: {
    operationType: string;
    processingTime: number;
    memoryUsage: number;
    queueSize: number;
    conflictCount: number;
    userCount: number;
  }): void {
    this.performanceData.push({
      timestamp: new Date().toISOString(),
      ...data
    });

    // Keep only recent data (last 1000 points)
    if (this.performanceData.length > 1000) {
      this.performanceData.shift();
    }
  }

  /**
   * Identify performance bottlenecks
   */
  identifyBottlenecks(): Array<{
    type: 'latency' | 'memory' | 'queue' | 'conflicts';
    severity: 'low' | 'medium' | 'high';
    description: string;
    recommendation: string;
    affectedOperations: string[];
  }> {
    const bottlenecks: Array<{
      type: 'latency' | 'memory' | 'queue' | 'conflicts';
      severity: 'low' | 'medium' | 'high';
      description: string;
      recommendation: string;
      affectedOperations: string[];
    }> = [];

    if (this.performanceData.length < 10) return bottlenecks;

    // Analyze latency
    const latencies = this.performanceData.map(d => d.processingTime);
    const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const maxLatency = Math.max(...latencies);

    if (avgLatency > 200) {
      bottlenecks.push({
        type: 'latency',
        severity: avgLatency > 500 ? 'high' : 'medium',
        description: `Average processing latency is ${avgLatency.toFixed(1)}ms`,
        recommendation: 'Consider operation batching, compression, or reducing operation frequency',
        affectedOperations: this.getSlowOperations()
      });
    }

    // Analyze memory usage
    const memoryUsages = this.performanceData.map(d => d.memoryUsage);
    const avgMemory = memoryUsages.reduce((a, b) => a + b, 0) / memoryUsages.length;

    if (avgMemory > 512) { // 512MB threshold
      bottlenecks.push({
        type: 'memory',
        severity: avgMemory > 1024 ? 'high' : 'medium',
        description: `Average memory usage is ${avgMemory.toFixed(1)}MB`,
        recommendation: 'Clear operation history, reduce cache size, or implement memory-efficient storage',
        affectedOperations: []
      });
    }

    // Analyze queue size
    const queueSizes = this.performanceData.map(d => d.queueSize);
    const avgQueueSize = queueSizes.reduce((a, b) => a + b, 0) / queueSizes.length;

    if (avgQueueSize > 50) {
      bottlenecks.push({
        type: 'queue',
        severity: avgQueueSize > 100 ? 'high' : 'medium',
        description: `Average queue size is ${avgQueueSize.toFixed(1)} operations`,
        recommendation: 'Increase processing capacity, implement operation prioritization, or reduce operation frequency',
        affectedOperations: []
      });
    }

    // Analyze conflict rate
    const conflictCounts = this.performanceData.map(d => d.conflictCount);
    const avgConflicts = conflictCounts.reduce((a, b) => a + b, 0) / conflictCounts.length;

    if (avgConflicts > 0.1) { // 10% conflict rate
      bottlenecks.push({
        type: 'conflicts',
        severity: avgConflicts > 0.3 ? 'high' : 'medium',
        description: `Average conflict rate is ${(avgConflicts * 100).toFixed(1)}%`,
        recommendation: 'Implement conflict prediction, user coordination features, or operation throttling',
        affectedOperations: []
      });
    }

    return bottlenecks;
  }

  /**
   * Get slow operation types
   */
  private getSlowOperations(): string[] {
    const operationTimes = new Map<string, number[]>();
    
    for (const data of this.performanceData) {
      if (!operationTimes.has(data.operationType)) {
        operationTimes.set(data.operationType, []);
      }
      operationTimes.get(data.operationType)!.push(data.processingTime);
    }

    const slowOperations: string[] = [];
    for (const [operationType, times] of operationTimes) {
      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      if (avgTime > 100) { // 100ms threshold
        slowOperations.push(operationType);
      }
    }

    return slowOperations;
  }

  /**
   * Get performance recommendations
   */
  getPerformanceRecommendations(): Array<{
    category: 'optimization' | 'infrastructure' | 'configuration';
    priority: 'low' | 'medium' | 'high';
    title: string;
    description: string;
    implementation: string;
  }> {
    const recommendations: Array<{
      category: 'optimization' | 'infrastructure' | 'configuration';
      priority: 'low' | 'medium' | 'high';
      title: string;
      description: string;
      implementation: string;
    }> = [];

    const bottlenecks = this.identifyBottlenecks();

    for (const bottleneck of bottlenecks) {
      switch (bottleneck.type) {
        case 'latency':
          recommendations.push({
            category: 'optimization',
            priority: bottleneck.severity as 'low' | 'medium' | 'high',
            title: 'Optimize Operation Processing',
            description: 'High latency detected in operation processing',
            implementation: 'Implement operation batching, enable compression, or optimize transformation algorithms'
          });
          break;

        case 'memory':
          recommendations.push({
            category: 'infrastructure',
            priority: bottleneck.severity as 'low' | 'medium' | 'high',
            title: 'Increase Memory Allocation',
            description: 'High memory usage detected',
            implementation: 'Allocate more memory to the application or implement memory-efficient data structures'
          });
          break;

        case 'queue':
          recommendations.push({
            category: 'configuration',
            priority: bottleneck.severity as 'low' | 'medium' | 'high',
            title: 'Optimize Operation Queue',
            description: 'Large operation queue detected',
            implementation: 'Increase processing workers, implement operation prioritization, or reduce operation frequency'
          });
          break;

        case 'conflicts':
          recommendations.push({
            category: 'optimization',
            priority: bottleneck.severity as 'low' | 'medium' | 'high',
            title: 'Reduce Conflict Rate',
            description: 'High conflict rate detected',
            implementation: 'Implement conflict prediction, user awareness features, or operation coordination'
          });
          break;
      }
    }

    return recommendations;
  }

  /**
   * Get detailed performance metrics
   */
  getDetailedMetrics(): {
    averageLatency: number;
    p95Latency: number;
    p99Latency: number;
    averageMemoryUsage: number;
    peakMemoryUsage: number;
    averageQueueSize: number;
    peakQueueSize: number;
    conflictRate: number;
    operationThroughput: number;
    dataPoints: number;
  } {
    if (this.performanceData.length === 0) {
      return {
        averageLatency: 0,
        p95Latency: 0,
        p99Latency: 0,
        averageMemoryUsage: 0,
        peakMemoryUsage: 0,
        averageQueueSize: 0,
        peakQueueSize: 0,
        conflictRate: 0,
        operationThroughput: 0,
        dataPoints: 0
      };
    }

    const latencies = this.performanceData.map(d => d.processingTime).sort((a, b) => a - b);
    const memoryUsages = this.performanceData.map(d => d.memoryUsage);
    const queueSizes = this.performanceData.map(d => d.queueSize);
    const conflicts = this.performanceData.map(d => d.conflictCount);

    // Calculate percentiles
    const p95Index = Math.floor(latencies.length * 0.95);
    const p99Index = Math.floor(latencies.length * 0.99);

    // Calculate throughput (operations per second)
    const timeRange = this.performanceData.length > 1 
      ? new Date(this.performanceData[this.performanceData.length - 1].timestamp).getTime() - 
        new Date(this.performanceData[0].timestamp).getTime()
      : 1000;
    const throughput = (this.performanceData.length / timeRange) * 1000;

    return {
      averageLatency: latencies.reduce((a, b) => a + b, 0) / latencies.length,
      p95Latency: latencies[p95Index] || 0,
      p99Latency: latencies[p99Index] || 0,
      averageMemoryUsage: memoryUsages.reduce((a, b) => a + b, 0) / memoryUsages.length,
      peakMemoryUsage: Math.max(...memoryUsages),
      averageQueueSize: queueSizes.reduce((a, b) => a + b, 0) / queueSizes.length,
      peakQueueSize: Math.max(...queueSizes),
      conflictRate: conflicts.reduce((a, b) => a + b, 0) / conflicts.length,
      operationThroughput: throughput,
      dataPoints: this.performanceData.length
    };
  }
}

// Export all utilities
export {
  VectorClockManager,
  OperationCompressor,
  ConflictPredictor,
  PerformanceAnalyzer
};