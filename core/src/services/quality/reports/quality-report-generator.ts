import * as fs from 'fs';
import * as path from 'path';
import type {
  QualityReport,
  TechnicalDebtItem,
  SecurityVulnerability,
  PerformanceBudget,
  CodeComplexityMetric,
  DependencyHealth,
  QualityScoreWeights,
  SeverityLevel
} from '../types.js';
import { DEFAULT_QUALITY_WEIGHTS } from '../types.js';

export interface QualityReportInput {
  projectName: string;
  commitHash: string;
  branchName: string;
  technicalDebt: TechnicalDebtItem[];
  securityVulnerabilities: SecurityVulnerability[];
  performanceBudgets: PerformanceBudget[];
  complexityMetrics: CodeComplexityMetric[];
  dependencyHealth: DependencyHealth[];
  codeCoverage?: {
    percentage: number;
    uncoveredFiles: string[];
    trend: 'improving' | 'stable' | 'declining';
  };
  previousReport?: QualityReport;
}

export class QualityReportGenerator {
  private weights: QualityScoreWeights;

  constructor(weights: Partial<QualityScoreWeights> = {}) {
    this.weights = { ...DEFAULT_QUALITY_WEIGHTS, ...weights };
  }

  async generateReport(input: QualityReportInput): Promise<QualityReport> {
    console.log(`Generating quality report for ${input.projectName}...`);

    // Calculate overall quality score
    const qualityScores = this.calculateQualityScores(input);
    const overallScore = this.calculateOverallScore(qualityScores);
    const grade = this.calculateGrade(overallScore);
    const trend = this.calculateTrend(input.previousReport, overallScore);

    // Analyze technical debt
    const technicalDebt = this.analyzeTechnicalDebt(input.technicalDebt, input.previousReport);

    // Analyze security
    const security = this.analyzeSecurity(input.securityVulnerabilities);

    // Analyze performance
    const performance = this.analyzePerformance(input.performanceBudgets);

    // Analyze coverage
    const coverage = this.analyzeCoverage(input.codeCoverage);

    // Generate recommendations
    const recommendations = this.generateRecommendations(input, qualityScores);

    const report: QualityReport = {
      id: '', // Will be set by database
      projectName: input.projectName,
      commitHash: input.commitHash,
      branchName: input.branchName,
      generatedAt: new Date().toISOString(),
      overall: {
        qualityScore: overallScore,
        grade,
        trend
      },
      technicalDebt,
      security,
      performance,
      coverage,
      recommendations
    };

    console.log(`Quality report generated - Score: ${overallScore}/100, Grade: ${grade}`);
    return report;
  }

  private calculateQualityScores(input: QualityReportInput): Record<string, number> {
    const scores: Record<string, number> = {};

    // Technical debt score (100 - impact)
    const debtImpact = this.calculateTechnicalDebtImpact(input.technicalDebt);
    scores.technicalDebt = Math.max(0, 100 - debtImpact);

    // Security score
    scores.security = this.calculateSecurityScore(input.securityVulnerabilities);

    // Performance score
    scores.performance = this.calculatePerformanceScore(input.performanceBudgets);

    // Coverage score
    scores.coverage = input.codeCoverage?.percentage || 0;

    // Complexity score
    scores.complexity = this.calculateComplexityScore(input.complexityMetrics);

    // Dependencies score
    scores.dependencies = this.calculateDependencyScore(input.dependencyHealth);

    return scores;
  }

  private calculateTechnicalDebtImpact(debtItems: TechnicalDebtItem[]): number {
    if (debtItems.length === 0) return 0;

    const severityWeights = { low: 1, medium: 3, high: 7, critical: 15 };
    let totalImpact = 0;

    for (const item of debtItems) {
      const severityWeight = severityWeights[item.severity] || 1;
      const effortWeight = Math.min((item.estimatedEffort || 1) / 8, 2); // Cap at 2x
      totalImpact += severityWeight * effortWeight;
    }

    // Normalize to 0-100 scale (assume 50 critical items = 100% impact)
    return Math.min(100, (totalImpact / (50 * 15)) * 100);
  }

  private calculateSecurityScore(vulnerabilities: SecurityVulnerability[]): number {
    if (vulnerabilities.length === 0) return 100;

    const severityWeights = { low: 5, medium: 15, high: 30, critical: 50 };
    let totalDeduction = 0;

    for (const vuln of vulnerabilities) {
      if (!vuln.resolvedAt) { // Only count unresolved vulnerabilities
        totalDeduction += severityWeights[vuln.severity];
      }
    }

    return Math.max(0, 100 - totalDeduction);
  }

  private calculatePerformanceScore(budgets: PerformanceBudget[]): number {
    if (budgets.length === 0) return 100;

    const compliantBudgets = budgets.filter(b => b.isCompliant).length;
    return Math.round((compliantBudgets / budgets.length) * 100);
  }

  private calculateComplexityScore(metrics: CodeComplexityMetric[]): number {
    if (metrics.length === 0) return 100;

    const highComplexityFunctions = metrics.filter(m => 
      m.severity === 'high' || m.severity === 'critical'
    ).length;

    const complexityRatio = highComplexityFunctions / metrics.length;
    return Math.round((1 - complexityRatio) * 100);
  }

  private calculateDependencyScore(dependencies: DependencyHealth[]): number {
    if (dependencies.length === 0) return 100;

    const averageHealthScore = dependencies.reduce((sum, dep) => sum + dep.healthScore, 0) / dependencies.length;
    return Math.round(averageHealthScore);
  }

  private calculateOverallScore(scores: Record<string, number>): number {
    let weightedSum = 0;
    let totalWeight = 0;

    for (const [metric, score] of Object.entries(scores)) {
      const weight = this.weights[metric as keyof QualityScoreWeights] || 0;
      weightedSum += score * weight;
      totalWeight += weight;
    }

    return totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;
  }

  private calculateGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
  }

  private calculateTrend(
    previousReport: QualityReport | undefined,
    currentScore: number
  ): 'improving' | 'stable' | 'declining' {
    if (!previousReport) return 'stable';

    const previousScore = previousReport.overall.qualityScore;
    const difference = currentScore - previousScore;

    if (difference > 2) return 'improving';
    if (difference < -2) return 'declining';
    return 'stable';
  }

  private analyzeTechnicalDebt(
    debtItems: TechnicalDebtItem[],
    previousReport?: QualityReport
  ): QualityReport['technicalDebt'] {
    const totalItems = debtItems.filter(item => !item.resolvedAt).length;
    const newItems = previousReport 
      ? debtItems.filter(item => 
          !item.resolvedAt && 
          new Date(item.createdAt) > new Date(previousReport.generatedAt)
        ).length
      : totalItems;

    const resolvedItems = previousReport
      ? debtItems.filter(item => 
          item.resolvedAt &&
          new Date(item.resolvedAt) > new Date(previousReport.generatedAt)
        ).length
      : 0;

    const totalEffortHours = debtItems
      .filter(item => !item.resolvedAt)
      .reduce((sum, item) => sum + (item.estimatedEffort || 0), 0);

    const breakdown: Record<string, number> = {};
    for (const item of debtItems.filter(item => !item.resolvedAt)) {
      breakdown[item.debtType] = (breakdown[item.debtType] || 0) + 1;
    }

    const scoreImpact = this.calculateTechnicalDebtImpact(debtItems.filter(item => !item.resolvedAt));

    return {
      totalItems,
      newItems,
      resolvedItems,
      totalEffortHours: Math.round(totalEffortHours * 100) / 100,
      scoreImpact: Math.round(scoreImpact),
      breakdown
    };
  }

  private analyzeSecurity(vulnerabilities: SecurityVulnerability[]): QualityReport['security'] {
    const unresolved = vulnerabilities.filter(v => !v.resolvedAt);
    const vulnerabilityCount = unresolved.length;
    
    const severityCounts = {
      critical: unresolved.filter(v => v.severity === 'critical').length,
      high: unresolved.filter(v => v.severity === 'high').length,
      medium: unresolved.filter(v => v.severity === 'medium').length,
      low: unresolved.filter(v => v.severity === 'low').length
    };

    const scoreImpact = 100 - this.calculateSecurityScore(vulnerabilities);

    return {
      vulnerabilityCount,
      criticalCount: severityCounts.critical,
      highCount: severityCounts.high,
      mediumCount: severityCounts.medium,
      lowCount: severityCounts.low,
      scoreImpact
    };
  }

  private analyzePerformance(budgets: PerformanceBudget[]): QualityReport['performance'] {
    const bundleCompliance = budgets.every(b => b.isCompliant);
    const averageScore = this.calculatePerformanceScore(budgets);
    const failingBudgets = budgets.filter(b => !b.isCompliant).length;
    const scoreImpact = 100 - averageScore;

    return {
      bundleCompliance,
      averageScore,
      failingBudgets,
      scoreImpact
    };
  }

  private analyzeCoverage(
    codeCoverage?: QualityReportInput['codeCoverage']
  ): QualityReport['coverage'] {
    return {
      percentage: codeCoverage?.percentage || 0,
      uncoveredFiles: codeCoverage?.uncoveredFiles?.length || 0,
      trend: codeCoverage?.trend || 'stable',
      scoreImpact: Math.max(0, 100 - (codeCoverage?.percentage || 0))
    };
  }

  private generateRecommendations(
    input: QualityReportInput,
    scores: Record<string, number>
  ): QualityReport['recommendations'] {
    const recommendations: QualityReport['recommendations'] = [];

    // Technical debt recommendations
    if (scores.technicalDebt < 80) {
      const criticalDebt = input.technicalDebt.filter(d => d.severity === 'critical' && !d.resolvedAt);
      if (criticalDebt.length > 0) {
        recommendations.push({
          type: 'technical_debt',
          priority: 'critical',
          title: `Address ${criticalDebt.length} critical technical debt items`,
          description: 'Critical technical debt items require immediate attention to prevent system degradation',
          estimatedEffort: criticalDebt.reduce((sum, d) => sum + (d.estimatedEffort || 0), 0),
          impact: 25
        });
      }
    }

    // Security recommendations
    if (scores.security < 90) {
      const criticalVulns = input.securityVulnerabilities.filter(v => v.severity === 'critical' && !v.resolvedAt);
      if (criticalVulns.length > 0) {
        recommendations.push({
          type: 'security',
          priority: 'critical',
          title: `Fix ${criticalVulns.length} critical security vulnerabilities`,
          description: 'Critical security vulnerabilities expose the system to significant risks',
          estimatedEffort: criticalVulns.length * 4, // 4 hours per critical vulnerability
          impact: 30
        });
      }
    }

    // Performance recommendations
    if (scores.performance < 80) {
      const failingBudgets = input.performanceBudgets.filter(b => !b.isCompliant);
      if (failingBudgets.length > 0) {
        recommendations.push({
          type: 'performance',
          priority: 'high',
          title: `Optimize ${failingBudgets.length} performance budget violations`,
          description: 'Performance budget violations impact user experience and system efficiency',
          estimatedEffort: failingBudgets.length * 6, // 6 hours per budget violation
          impact: 15
        });
      }
    }

    // Coverage recommendations
    if (scores.coverage < 70) {
      recommendations.push({
        type: 'coverage',
        priority: 'medium',
        title: 'Improve test coverage',
        description: `Current coverage is ${scores.coverage}%. Target at least 80% coverage for better quality assurance`,
        estimatedEffort: Math.round((80 - scores.coverage) * 0.5), // 0.5 hours per % coverage
        impact: 10
      });
    }

    // Complexity recommendations
    if (scores.complexity < 80) {
      const complexFunctions = input.complexityMetrics.filter(m => m.severity === 'high' || m.severity === 'critical');
      if (complexFunctions.length > 0) {
        recommendations.push({
          type: 'complexity',
          priority: 'medium',
          title: `Refactor ${complexFunctions.length} overly complex functions`,
          description: 'High complexity functions are harder to maintain and more prone to bugs',
          estimatedEffort: complexFunctions.length * 3, // 3 hours per complex function
          impact: 12
        });
      }
    }

    // Dependencies recommendations
    if (scores.dependencies < 80) {
      const riskeDeps = input.dependencyHealth.filter(d => d.healthScore < 60);
      if (riskeDeps.length > 0) {
        recommendations.push({
          type: 'dependencies',
          priority: 'medium',
          title: `Address ${riskeDeps.length} risky dependencies`,
          description: 'Risky dependencies may have security, licensing, or maintenance issues',
          estimatedEffort: riskeDeps.length * 2, // 2 hours per risky dependency
          impact: 8
        });
      }
    }

    // Sort by priority and impact
    return recommendations
      .sort((a, b) => {
        const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
        const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
        if (priorityDiff !== 0) return priorityDiff;
        return b.impact - a.impact;
      })
      .slice(0, 10); // Top 10 recommendations
  }

  async generateHTMLReport(report: QualityReport, outputPath: string): Promise<void> {
    const html = this.createHTMLReport(report);
    fs.writeFileSync(outputPath, html, 'utf-8');
    console.log(`Quality report generated: ${outputPath}`);
  }

  private createHTMLReport(report: QualityReport): string {
    const gradeColors = {
      A: '#198754',
      B: '#20c997',
      C: '#ffc107',
      D: '#fd7e14',
      F: '#dc3545'
    };

    const trendIcons = {
      improving: '📈',
      stable: '➡️',
      declining: '📉'
    };

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Quality Report - ${report.projectName}</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f8f9fa; }
        .container { max-width: 1200px; margin: 0 auto; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 12px; margin-bottom: 30px; text-align: center; }
        .header h1 { margin: 0; font-size: 2.5em; }
        .header .project-info { margin: 15px 0; opacity: 0.9; }
        .score-card { background: white; padding: 30px; border-radius: 12px; text-align: center; margin-bottom: 30px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        .score-circle { width: 120px; height: 120px; border-radius: 50%; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center; font-size: 2.5em; font-weight: bold; color: white; }
        .grade { font-size: 3em; margin: 0; }
        .trend { font-size: 1.2em; margin: 10px 0; }
        .metrics-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .metric-card { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .metric-card h3 { margin: 0 0 15px 0; color: #495057; font-size: 1.1em; }
        .metric-value { font-size: 2em; font-weight: bold; margin: 10px 0; }
        .metric-breakdown { display: grid; grid-template-columns: repeat(auto-fit, minmax(80px, 1fr)); gap: 10px; margin-top: 15px; }
        .breakdown-item { text-align: center; padding: 8px; background: #f8f9fa; border-radius: 4px; }
        .breakdown-value { font-weight: bold; color: #495057; }
        .breakdown-label { font-size: 0.8em; color: #6c757d; }
        .recommendations { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .recommendation { background: #f8f9fa; padding: 15px; margin: 10px 0; border-radius: 8px; border-left: 4px solid #dee2e6; }
        .recommendation.critical { border-left-color: #721c24; background: #f8d7da; }
        .recommendation.high { border-left-color: #dc3545; background: #f8d7da; }
        .recommendation.medium { border-left-color: #fd7e14; background: #fff3cd; }
        .recommendation.low { border-left-color: #198754; background: #d4edda; }
        .rec-header { display: flex; justify-content: between; align-items: center; margin-bottom: 10px; }
        .rec-title { font-weight: bold; flex: 1; }
        .rec-effort { background: #e9ecef; padding: 4px 8px; border-radius: 4px; font-size: 0.9em; }
        .rec-impact { background: #e7f3ff; padding: 4px 8px; border-radius: 4px; font-size: 0.9em; color: #0066cc; }
        .severity-critical { color: #721c24; }
        .severity-high { color: #dc3545; }
        .severity-medium { color: #fd7e14; }
        .severity-low { color: #198754; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Quality Report</h1>
            <div class="project-info">
                <div><strong>${report.projectName}</strong> | ${report.branchName} | ${report.commitHash.substring(0, 8)}</div>
                <div>Generated: ${new Date(report.generatedAt).toLocaleString()}</div>
            </div>
        </div>

        <div class="score-card">
            <div class="score-circle" style="background: ${gradeColors[report.overall.grade]};">
                ${report.overall.qualityScore}
            </div>
            <div class="grade" style="color: ${gradeColors[report.overall.grade]};">Grade ${report.overall.grade}</div>
            <div class="trend">${trendIcons[report.overall.trend]} ${report.overall.trend.toUpperCase()}</div>
        </div>

        <div class="metrics-grid">
            <div class="metric-card">
                <h3>📝 Technical Debt</h3>
                <div class="metric-value severity-${report.technicalDebt.totalItems > 20 ? 'high' : report.technicalDebt.totalItems > 10 ? 'medium' : 'low'}">
                    ${report.technicalDebt.totalItems}
                </div>
                <div>Total Items | ${report.technicalDebt.totalEffortHours}h estimated</div>
                <div class="metric-breakdown">
                    ${Object.entries(report.technicalDebt.breakdown).map(([type, count]) => `
                        <div class="breakdown-item">
                            <div class="breakdown-value">${count}</div>
                            <div class="breakdown-label">${type}</div>
                        </div>
                    `).join('')}
                </div>
                <div style="margin-top: 10px;">
                    <span class="severity-high">+${report.technicalDebt.newItems} new</span> | 
                    <span class="severity-low">-${report.technicalDebt.resolvedItems} resolved</span>
                </div>
            </div>

            <div class="metric-card">
                <h3>🔒 Security</h3>
                <div class="metric-value severity-${report.security.vulnerabilityCount > 0 ? 'critical' : 'low'}">
                    ${report.security.vulnerabilityCount}
                </div>
                <div>Total Vulnerabilities</div>
                <div class="metric-breakdown">
                    <div class="breakdown-item">
                        <div class="breakdown-value severity-critical">${report.security.criticalCount}</div>
                        <div class="breakdown-label">Critical</div>
                    </div>
                    <div class="breakdown-item">
                        <div class="breakdown-value severity-high">${report.security.highCount}</div>
                        <div class="breakdown-label">High</div>
                    </div>
                    <div class="breakdown-item">
                        <div class="breakdown-value severity-medium">${report.security.mediumCount}</div>
                        <div class="breakdown-label">Medium</div>
                    </div>
                    <div class="breakdown-item">
                        <div class="breakdown-value severity-low">${report.security.lowCount}</div>
                        <div class="breakdown-label">Low</div>
                    </div>
                </div>
            </div>

            <div class="metric-card">
                <h3>⚡ Performance</h3>
                <div class="metric-value severity-${report.performance.bundleCompliance ? 'low' : 'medium'}">
                    ${report.performance.averageScore}%
                </div>
                <div>Budget Compliance</div>
                <div style="margin-top: 15px;">
                    ${report.performance.bundleCompliance ? 
                        '<span style="color: #198754;">✅ All budgets compliant</span>' : 
                        `<span class="severity-medium">⚠️ ${report.performance.failingBudgets} budget violations</span>`
                    }
                </div>
            </div>

            <div class="metric-card">
                <h3>📊 Coverage</h3>
                <div class="metric-value severity-${report.coverage.percentage >= 80 ? 'low' : report.coverage.percentage >= 60 ? 'medium' : 'high'}">
                    ${report.coverage.percentage}%
                </div>
                <div>Test Coverage | ${trendIcons[report.coverage.trend]} ${report.coverage.trend}</div>
                <div style="margin-top: 15px;">
                    ${report.coverage.uncoveredFiles > 0 ? 
                        `<span class="severity-medium">${report.coverage.uncoveredFiles} uncovered files</span>` :
                        '<span class="severity-low">All files covered</span>'
                    }
                </div>
            </div>
        </div>

        ${report.recommendations.length > 0 ? `
            <div class="recommendations">
                <h2>🎯 Recommendations</h2>
                ${report.recommendations.map(rec => `
                    <div class="recommendation ${rec.priority}">
                        <div class="rec-header">
                            <div class="rec-title">${rec.title}</div>
                            <div style="display: flex; gap: 10px;">
                                ${rec.estimatedEffort ? `<div class="rec-effort">${rec.estimatedEffort}h</div>` : ''}
                                <div class="rec-impact">+${rec.impact} score</div>
                            </div>
                        </div>
                        <div>${rec.description}</div>
                        <div style="margin-top: 8px;">
                            <small><strong>Type:</strong> ${rec.type.replace('_', ' ')} | <strong>Priority:</strong> <span class="severity-${rec.priority}">${rec.priority.toUpperCase()}</span></small>
                        </div>
                    </div>
                `).join('')}
            </div>
        ` : ''}
    </div>
</body>
</html>
    `;
  }
}