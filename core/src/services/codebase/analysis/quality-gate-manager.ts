/**
 * Quality Gate Manager
 * 
 * Advanced quality gate management system for enforcing quality standards
 * and providing automated quality control for code repositories.
 */

import {
  QualityGate,
  QualityGateConfig,
  QualityGateResult,
  QualityGateEvaluation,
  QualityGateStatus,
  QualityMetrics,
  Severity,
  ComparisonOperator
} from '../../../shared/types/codebase.js';
import { DatabaseManager } from '../../../database/manager.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Default quality gate templates for different project types
 */
const DEFAULT_QUALITY_GATES = {
  /**
   * Standard quality gates for general projects
   */
  STANDARD: [
    {
      gateName: 'Overall Quality Score',
      metricName: 'overall_quality_score',
      operator: ComparisonOperator.GTE,
      thresholdValue: 70,
      isBlocking: true,
      severity: Severity.CRITICAL,
      description: 'Overall code quality must be at least 70%'
    },
    {
      gateName: 'Technical Debt',
      metricName: 'technical_debt_minutes',
      operator: ComparisonOperator.LTE,
      thresholdValue: 480, // 8 hours
      isBlocking: false,
      severity: Severity.MAJOR,
      description: 'Technical debt should not exceed 8 hours'
    },
    {
      gateName: 'Test Coverage',
      metricName: 'test_coverage',
      operator: ComparisonOperator.GTE,
      thresholdValue: 80,
      isBlocking: true,
      severity: Severity.CRITICAL,
      description: 'Test coverage must be at least 80%'
    },
    {
      gateName: 'Cyclomatic Complexity',
      metricName: 'cyclomatic_complexity',
      operator: ComparisonOperator.LTE,
      thresholdValue: 10,
      isBlocking: false,
      severity: Severity.MAJOR,
      description: 'Average cyclomatic complexity should not exceed 10'
    },
    {
      gateName: 'Security Rating',
      metricName: 'security_hotspots',
      operator: ComparisonOperator.LTE,
      thresholdValue: 0,
      isBlocking: true,
      severity: Severity.CRITICAL,
      description: 'No security hotspots allowed'
    },
    {
      gateName: 'Maintainability Rating',
      metricName: 'maintainability_index',
      operator: ComparisonOperator.GTE,
      thresholdValue: 85,
      isBlocking: false,
      severity: Severity.MAJOR,
      description: 'Maintainability index should be at least 85'
    }
  ],

  /**
   * Strict quality gates for critical systems
   */
  STRICT: [
    {
      gateName: 'Overall Quality Score',
      metricName: 'overall_quality_score',
      operator: ComparisonOperator.GTE,
      thresholdValue: 85,
      isBlocking: true,
      severity: Severity.CRITICAL,
      description: 'Overall code quality must be at least 85%'
    },
    {
      gateName: 'Technical Debt',
      metricName: 'technical_debt_minutes',
      operator: ComparisonOperator.LTE,
      thresholdValue: 120, // 2 hours
      isBlocking: true,
      severity: Severity.CRITICAL,
      description: 'Technical debt must not exceed 2 hours'
    },
    {
      gateName: 'Test Coverage',
      metricName: 'test_coverage',
      operator: ComparisonOperator.GTE,
      thresholdValue: 95,
      isBlocking: true,
      severity: Severity.CRITICAL,
      description: 'Test coverage must be at least 95%'
    },
    {
      gateName: 'Branch Coverage',
      metricName: 'branch_coverage',
      operator: ComparisonOperator.GTE,
      thresholdValue: 90,
      isBlocking: true,
      severity: Severity.CRITICAL,
      description: 'Branch coverage must be at least 90%'
    },
    {
      gateName: 'Cyclomatic Complexity',
      metricName: 'cyclomatic_complexity',
      operator: ComparisonOperator.LTE,
      thresholdValue: 5,
      isBlocking: true,
      severity: Severity.CRITICAL,
      description: 'Average cyclomatic complexity must not exceed 5'
    },
    {
      gateName: 'Security Issues',
      metricName: 'security_hotspots',
      operator: ComparisonOperator.EQ,
      thresholdValue: 0,
      isBlocking: true,
      severity: Severity.CRITICAL,
      description: 'Zero security issues allowed'
    },
    {
      gateName: 'Bugs',
      metricName: 'bugs',
      operator: ComparisonOperator.EQ,
      thresholdValue: 0,
      isBlocking: true,
      severity: Severity.CRITICAL,
      description: 'Zero bugs allowed'
    },
    {
      gateName: 'Vulnerabilities',
      metricName: 'vulnerabilities',
      operator: ComparisonOperator.EQ,
      thresholdValue: 0,
      isBlocking: true,
      severity: Severity.CRITICAL,
      description: 'Zero vulnerabilities allowed'
    },
    {
      gateName: 'Code Smells',
      metricName: 'code_smells_count',
      operator: ComparisonOperator.LTE,
      thresholdValue: 5,
      isBlocking: false,
      severity: Severity.MAJOR,
      description: 'Maximum 5 code smells allowed'
    },
    {
      gateName: 'Duplicated Lines',
      metricName: 'duplicated_lines',
      operator: ComparisonOperator.LTE,
      thresholdValue: 3, // 3% duplication
      isBlocking: false,
      severity: Severity.MAJOR,
      description: 'Duplicated lines should not exceed 3%'
    }
  ],

  /**
   * Relaxed quality gates for prototypes/experimental code
   */
  RELAXED: [
    {
      gateName: 'Overall Quality Score',
      metricName: 'overall_quality_score',
      operator: ComparisonOperator.GTE,
      thresholdValue: 50,
      isBlocking: false,
      severity: Severity.MINOR,
      description: 'Overall code quality should be at least 50%'
    },
    {
      gateName: 'Test Coverage',
      metricName: 'test_coverage',
      operator: ComparisonOperator.GTE,
      thresholdValue: 40,
      isBlocking: false,
      severity: Severity.MINOR,
      description: 'Test coverage should be at least 40%'
    },
    {
      gateName: 'Cyclomatic Complexity',
      metricName: 'cyclomatic_complexity',
      operator: ComparisonOperator.LTE,
      thresholdValue: 20,
      isBlocking: false,
      severity: Severity.MINOR,
      description: 'Average cyclomatic complexity should not exceed 20'
    },
    {
      gateName: 'Critical Security Issues',
      metricName: 'security_hotspots',
      operator: ComparisonOperator.LTE,
      thresholdValue: 2,
      isBlocking: true,
      severity: Severity.CRITICAL,
      description: 'Maximum 2 security hotspots allowed'
    }
  ]
};

/**
 * Quality gate evaluation results cache
 */
interface QualityGateCache {
  repositoryId: string;
  evaluation: QualityGateEvaluation;
  timestamp: Date;
}

/**
 * Advanced quality gate manager with template support and caching
 */
export class QualityGateManager {
  private readonly db: DatabaseManager;
  private readonly cache: Map<string, QualityGateCache> = new Map();
  private readonly cacheTimeoutMs = 5 * 60 * 1000; // 5 minutes

  constructor(db: DatabaseManager) {
    this.db = db;
  }

  // ===================
  // QUALITY GATE CONFIGURATION
  // ===================

  /**
   * Create quality gates from template
   */
  async createFromTemplate(
    repositoryId: string,
    template: 'STANDARD' | 'STRICT' | 'RELAXED' = 'STANDARD'
  ): Promise<QualityGate[]> {
    const templateGates = DEFAULT_QUALITY_GATES[template];
    const qualityGates: QualityGate[] = [];

    for (const gateConfig of templateGates) {
      const gate = await this.createQualityGate(repositoryId, gateConfig);
      qualityGates.push(gate);
    }

    return qualityGates;
  }

  /**
   * Create a single quality gate
   */
  async createQualityGate(repositoryId: string, config: QualityGateConfig): Promise<QualityGate> {
    const gate: QualityGate = {
      id: uuidv4(),
      repositoryId,
      gateName: config.gateName,
      metricName: config.metricName,
      operator: config.operator,
      thresholdValue: config.thresholdValue,
      isBlocking: config.isBlocking ?? false,
      severity: config.severity ?? Severity.MAJOR,
      isActive: config.isActive ?? true,
      description: config.description,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await this.db.getConnection()
      .insertInto('quality_gates')
      .values({
        id: gate.id,
        repository_id: gate.repositoryId,
        gate_name: gate.gateName,
        metric_name: gate.metricName,
        operator: gate.operator,
        threshold_value: gate.thresholdValue,
        is_blocking: gate.isBlocking,
        severity: gate.severity,
        is_active: gate.isActive,
        description: gate.description || null,
        created_at: gate.createdAt,
        updated_at: gate.updatedAt
      })
      .execute();

    return gate;
  }

  /**
   * Update an existing quality gate
   */
  async updateQualityGate(gateId: string, updates: Partial<QualityGateConfig>): Promise<QualityGate> {
    const updateData: any = {
      updated_at: new Date()
    };

    if (updates.gateName !== undefined) updateData.gate_name = updates.gateName;
    if (updates.metricName !== undefined) updateData.metric_name = updates.metricName;
    if (updates.operator !== undefined) updateData.operator = updates.operator;
    if (updates.thresholdValue !== undefined) updateData.threshold_value = updates.thresholdValue;
    if (updates.isBlocking !== undefined) updateData.is_blocking = updates.isBlocking;
    if (updates.severity !== undefined) updateData.severity = updates.severity;
    if (updates.isActive !== undefined) updateData.is_active = updates.isActive;
    if (updates.description !== undefined) updateData.description = updates.description;

    await this.db.getConnection()
      .updateTable('quality_gates')
      .set(updateData)
      .where('id', '=', gateId)
      .execute();

    const updatedGate = await this.getQualityGate(gateId);
    if (!updatedGate) {
      throw new Error(`Quality gate ${gateId} not found after update`);
    }

    // Invalidate cache for the repository
    this.invalidateCache(updatedGate.repositoryId);

    return updatedGate;
  }

  /**
   * Delete a quality gate
   */
  async deleteQualityGate(gateId: string): Promise<void> {
    const gate = await this.getQualityGate(gateId);
    
    await this.db.getConnection()
      .deleteFrom('quality_gates')
      .where('id', '=', gateId)
      .execute();

    // Invalidate cache if gate existed
    if (gate) {
      this.invalidateCache(gate.repositoryId);
    }
  }

  /**
   * Get a specific quality gate
   */
  async getQualityGate(gateId: string): Promise<QualityGate | null> {
    const result = await this.db.getConnection()
      .selectFrom('quality_gates')
      .selectAll()
      .where('id', '=', gateId)
      .executeTakeFirst();

    if (!result) return null;

    return this.mapDbResultToQualityGate(result);
  }

  /**
   * Get all quality gates for a repository
   */
  async getQualityGates(repositoryId: string, activeOnly: boolean = true): Promise<QualityGate[]> {
    let query = this.db.getConnection()
      .selectFrom('quality_gates')
      .selectAll()
      .where('repository_id', '=', repositoryId);

    if (activeOnly) {
      query = query.where('is_active', '=', true);
    }

    const results = await query.execute();
    return results.map(result => this.mapDbResultToQualityGate(result));
  }

  /**
   * Activate or deactivate a quality gate
   */
  async setQualityGateActive(gateId: string, isActive: boolean): Promise<void> {
    const gate = await this.getQualityGate(gateId);
    
    await this.db.getConnection()
      .updateTable('quality_gates')
      .set({ is_active: isActive, updated_at: new Date() })
      .where('id', '=', gateId)
      .execute();

    // Invalidate cache
    if (gate) {
      this.invalidateCache(gate.repositoryId);
    }
  }

  // ===================
  // QUALITY GATE EVALUATION
  // ===================

  /**
   * Evaluate all quality gates for a repository
   */
  async evaluateQualityGates(repositoryId: string, metrics: QualityMetrics): Promise<QualityGateEvaluation> {
    // Check cache first
    const cached = this.getCachedEvaluation(repositoryId);
    if (cached) {
      return cached;
    }

    const startTime = Date.now();

    try {
      // Get active quality gates
      const gates = await this.getQualityGates(repositoryId, true);

      if (gates.length === 0) {
        const evaluation: QualityGateEvaluation = {
          repositoryId,
          overallStatus: 'PASSED',
          gateResults: [],
          blockerIssues: 0,
          criticalIssues: 0,
          majorIssues: 0,
          minorIssues: 0,
          evaluatedAt: new Date(),
          processingTime: Date.now() - startTime,
          canDeploy: true
        };

        this.cacheEvaluation(repositoryId, evaluation);
        return evaluation;
      }

      // Evaluate each gate
      const gateResults: QualityGateResult[] = [];
      let blockerIssues = 0;
      let criticalIssues = 0;
      let majorIssues = 0;
      let minorIssues = 0;

      for (const gate of gates) {
        const result = this.evaluateIndividualGate(gate, metrics);
        gateResults.push(result);

        if (result.status === 'FAILED') {
          if (gate.isBlocking) {
            blockerIssues++;
          } else {
            switch (gate.severity) {
              case Severity.CRITICAL:
                criticalIssues++;
                break;
              case Severity.MAJOR:
                majorIssues++;
                break;
              case Severity.MINOR:
                minorIssues++;
                break;
            }
          }
        }
      }

      // Determine overall status
      const overallStatus = blockerIssues > 0 || criticalIssues > 0 ? 'FAILED' : 'PASSED';
      const canDeploy = blockerIssues === 0;

      const evaluation: QualityGateEvaluation = {
        repositoryId,
        overallStatus,
        gateResults,
        blockerIssues,
        criticalIssues,
        majorIssues,
        minorIssues,
        evaluatedAt: new Date(),
        processingTime: Date.now() - startTime,
        canDeploy
      };

      // Cache the evaluation
      this.cacheEvaluation(repositoryId, evaluation);

      return evaluation;

    } catch (error) {
      console.error('Error evaluating quality gates:', error);

      const errorEvaluation: QualityGateEvaluation = {
        repositoryId,
        overallStatus: 'ERROR',
        gateResults: [],
        blockerIssues: 0,
        criticalIssues: 0,
        majorIssues: 0,
        minorIssues: 0,
        evaluatedAt: new Date(),
        processingTime: Date.now() - startTime,
        canDeploy: false
      };

      return errorEvaluation;
    }
  }

  /**
   * Evaluate a single quality gate
   */
  private evaluateIndividualGate(gate: QualityGate, metrics: QualityMetrics): QualityGateResult {
    const metricValue = this.getMetricValue(metrics, gate.metricName);
    const threshold = gate.thresholdValue;

    let status: 'PASSED' | 'FAILED' | 'NO_VALUE' = 'NO_VALUE';
    let message: string | undefined;

    if (metricValue !== null && metricValue !== undefined) {
      const passed = this.evaluateCondition(metricValue, gate.operator, threshold);
      status = passed ? 'PASSED' : 'FAILED';

      if (!passed) {
        message = this.generateFailureMessage(gate, metricValue);
      }
    } else {
      message = `Metric '${gate.metricName}' not available`;
    }

    return {
      gateId: gate.id,
      gateName: gate.gateName,
      status,
      metricName: gate.metricName,
      actualValue: metricValue || 0,
      expectedOperator: gate.operator,
      expectedValue: gate.thresholdValue,
      message,
      evaluatedAt: new Date()
    };
  }

  /**
   * Get quality gate status summary
   */
  async getQualityGateStatus(repositoryId: string, metrics?: QualityMetrics): Promise<QualityGateStatus> {
    try {
      let evaluation: QualityGateEvaluation;

      if (metrics) {
        evaluation = await this.evaluateQualityGates(repositoryId, metrics);
      } else {
        // Try to get from cache or recent evaluation
        const cached = this.getCachedEvaluation(repositoryId);
        if (cached) {
          evaluation = cached;
        } else {
          throw new Error('No metrics provided and no cached evaluation available');
        }
      }

      const blockers = evaluation.gateResults
        .filter(r => r.status === 'FAILED' && evaluation.blockerIssues > 0)
        .map(r => `${r.gateName}: ${r.message || 'Failed'}`);

      const warnings = evaluation.gateResults
        .filter(r => r.status === 'FAILED' && !blockers.includes(`${r.gateName}: ${r.message || 'Failed'}`))
        .map(r => `${r.gateName}: ${r.message || 'Failed'}`);

      return {
        repositoryId,
        status: evaluation.overallStatus === 'PASSED' ? 'PASSED' : 'FAILED',
        gates: evaluation.gateResults,
        blockers,
        warnings,
        canProceed: evaluation.canDeploy,
        lastEvaluation: evaluation.evaluatedAt
      };

    } catch (error) {
      console.error('Error getting quality gate status:', error);

      return {
        repositoryId,
        status: 'ERROR',
        gates: [],
        blockers: [],
        warnings: [`Error getting quality gate status: ${error instanceof Error ? error.message : String(error)}`],
        canProceed: false,
        message: error instanceof Error ? error.message : String(error),
        lastEvaluation: new Date()
      };
    }
  }

  // ===================
  // QUALITY GATE ANALYTICS
  // ===================

  /**
   * Get quality gate compliance history
   */
  async getComplianceHistory(
    repositoryId: string,
    days: number = 30
  ): Promise<Array<{
    date: Date;
    overallStatus: 'PASSED' | 'FAILED' | 'ERROR';
    passedGates: number;
    totalGates: number;
    complianceRate: number;
  }>> {
    // This would require storing evaluation history in the database
    // For now, return empty array as placeholder
    return [];
  }

  /**
   * Get quality gate performance metrics
   */
  async getGatePerformanceMetrics(repositoryId: string): Promise<{
    mostFailedGates: Array<{ gateName: string; failureRate: number }>;
    averageComplianceRate: number;
    improvementTrend: 'IMPROVING' | 'STABLE' | 'DEGRADING';
    recommendedActions: string[];
  }> {
    // Placeholder implementation
    return {
      mostFailedGates: [],
      averageComplianceRate: 0,
      improvementTrend: 'STABLE',
      recommendedActions: []
    };
  }

  /**
   * Suggest quality gate improvements
   */
  async suggestQualityGateImprovements(repositoryId: string): Promise<Array<{
    gateId: string;
    currentThreshold: number;
    suggestedThreshold: number;
    rationale: string;
  }>> {
    // Placeholder implementation for AI-powered suggestions
    return [];
  }

  // ===================
  // BULK OPERATIONS
  // ===================

  /**
   * Clone quality gates from one repository to another
   */
  async cloneQualityGates(sourceRepositoryId: string, targetRepositoryId: string): Promise<QualityGate[]> {
    const sourceGates = await this.getQualityGates(sourceRepositoryId, false);
    const clonedGates: QualityGate[] = [];

    for (const sourceGate of sourceGates) {
      const config: QualityGateConfig = {
        gateName: sourceGate.gateName,
        metricName: sourceGate.metricName,
        operator: sourceGate.operator,
        thresholdValue: sourceGate.thresholdValue,
        isBlocking: sourceGate.isBlocking,
        severity: sourceGate.severity,
        isActive: sourceGate.isActive,
        description: sourceGate.description
      };

      const clonedGate = await this.createQualityGate(targetRepositoryId, config);
      clonedGates.push(clonedGate);
    }

    return clonedGates;
  }

  /**
   * Bulk update quality gates
   */
  async bulkUpdateQualityGates(
    gateIds: string[],
    updates: Partial<QualityGateConfig>
  ): Promise<void> {
    const repositoryIds = new Set<string>();

    for (const gateId of gateIds) {
      const gate = await this.getQualityGate(gateId);
      if (gate) {
        repositoryIds.add(gate.repositoryId);
        await this.updateQualityGate(gateId, updates);
      }
    }

    // Invalidate cache for all affected repositories
    for (const repositoryId of repositoryIds) {
      this.invalidateCache(repositoryId);
    }
  }

  /**
   * Reset to default quality gates
   */
  async resetToDefaults(
    repositoryId: string,
    template: 'STANDARD' | 'STRICT' | 'RELAXED' = 'STANDARD'
  ): Promise<QualityGate[]> {
    // Delete existing gates
    await this.db.getConnection()
      .deleteFrom('quality_gates')
      .where('repository_id', '=', repositoryId)
      .execute();

    // Create new gates from template
    const newGates = await this.createFromTemplate(repositoryId, template);

    // Invalidate cache
    this.invalidateCache(repositoryId);

    return newGates;
  }

  // ===================
  // PRIVATE HELPER METHODS
  // ===================

  /**
   * Extract metric value from QualityMetrics object
   */
  private getMetricValue(metrics: QualityMetrics, metricName: string): number {
    const metricMap: Record<string, keyof QualityMetrics> = {
      'overall_quality_score': 'overallQualityScore',
      'cyclomatic_complexity': 'cyclomaticComplexity',
      'cognitive_complexity': 'cognitiveComplexity',
      'technical_debt_minutes': 'technicalDebtMinutes',
      'test_coverage': 'testCoverage',
      'branch_coverage': 'branchCoverage',
      'code_smells_count': 'codeSmellsCount',
      'maintainability_index': 'maintainabilityIndex',
      'security_hotspots': 'securityHotspots',
      'performance_issues': 'performanceIssues',
      'duplicated_lines': 'duplicatedLines',
      'bugs': 'bugs',
      'vulnerabilities': 'vulnerabilities',
      'lines_of_code': 'linesOfCode',
      'nesting_depth': 'nestingDepth'
    };

    const key = metricMap[metricName];
    if (key && typeof metrics[key] === 'number') {
      return metrics[key] as number;
    }

    return 0;
  }

  /**
   * Evaluate condition based on operator
   */
  private evaluateCondition(actualValue: number, operator: ComparisonOperator, expectedValue: number): boolean {
    switch (operator) {
      case ComparisonOperator.GT:
        return actualValue > expectedValue;
      case ComparisonOperator.LT:
        return actualValue < expectedValue;
      case ComparisonOperator.GTE:
        return actualValue >= expectedValue;
      case ComparisonOperator.LTE:
        return actualValue <= expectedValue;
      case ComparisonOperator.EQ:
        return actualValue === expectedValue;
      case ComparisonOperator.NE:
        return actualValue !== expectedValue;
      default:
        return false;
    }
  }

  /**
   * Generate failure message for a gate
   */
  private generateFailureMessage(gate: QualityGate, actualValue: number): string {
    const operatorText = {
      [ComparisonOperator.GT]: 'greater than',
      [ComparisonOperator.LT]: 'less than',
      [ComparisonOperator.GTE]: 'greater than or equal to',
      [ComparisonOperator.LTE]: 'less than or equal to',
      [ComparisonOperator.EQ]: 'equal to',
      [ComparisonOperator.NE]: 'not equal to'
    };

    const operator = operatorText[gate.operator];
    const unit = this.getMetricUnit(gate.metricName);

    return `Expected ${gate.metricName} to be ${operator} ${gate.thresholdValue}${unit}, but was ${actualValue}${unit}`;
  }

  /**
   * Get appropriate unit for metric
   */
  private getMetricUnit(metricName: string): string {
    const units: Record<string, string> = {
      'overall_quality_score': '%',
      'test_coverage': '%',
      'branch_coverage': '%',
      'technical_debt_minutes': ' minutes',
      'duplicated_lines': '%'
    };

    return units[metricName] || '';
  }

  /**
   * Map database result to QualityGate object
   */
  private mapDbResultToQualityGate(result: any): QualityGate {
    return {
      id: result.id,
      repositoryId: result.repository_id,
      gateName: result.gate_name,
      metricName: result.metric_name,
      operator: result.operator as ComparisonOperator,
      thresholdValue: result.threshold_value,
      isBlocking: result.is_blocking,
      severity: result.severity as Severity,
      isActive: result.is_active,
      description: result.description || undefined,
      createdAt: new Date(result.created_at),
      updatedAt: new Date(result.updated_at)
    };
  }

  // ===================
  // CACHING METHODS
  // ===================

  /**
   * Get cached evaluation if available and fresh
   */
  private getCachedEvaluation(repositoryId: string): QualityGateEvaluation | null {
    const cached = this.cache.get(repositoryId);
    
    if (!cached) return null;
    
    const age = Date.now() - cached.timestamp.getTime();
    if (age > this.cacheTimeoutMs) {
      this.cache.delete(repositoryId);
      return null;
    }
    
    return cached.evaluation;
  }

  /**
   * Cache quality gate evaluation
   */
  private cacheEvaluation(repositoryId: string, evaluation: QualityGateEvaluation): void {
    this.cache.set(repositoryId, {
      repositoryId,
      evaluation,
      timestamp: new Date()
    });
  }

  /**
   * Invalidate cache for repository
   */
  private invalidateCache(repositoryId: string): void {
    this.cache.delete(repositoryId);
  }

  /**
   * Clear all cached evaluations
   */
  public clearCache(): void {
    this.cache.clear();
  }

  /**
   * Clean up expired cache entries
   */
  public cleanupCache(): void {
    const now = Date.now();
    
    for (const [repositoryId, cached] of this.cache.entries()) {
      const age = now - cached.timestamp.getTime();
      if (age > this.cacheTimeoutMs) {
        this.cache.delete(repositoryId);
      }
    }
  }
}