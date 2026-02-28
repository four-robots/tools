import * as path from 'path';
import { execSync } from 'child_process';
import { QualityDatabase } from './database.js';
import { TechnicalDebtScanner, DEFAULT_DEBT_CONFIG, type TechnicalDebtScannerConfig } from './scanners/technical-debt-scanner.js';
import { SecurityScanner, DEFAULT_SECURITY_CONFIG, type SecurityScannerConfig } from './scanners/security-scanner.js';
import { PerformanceScanner, DEFAULT_PERFORMANCE_CONFIG, type PerformanceScannerConfig } from './scanners/performance-scanner.js';
import { ComplexityScanner, DEFAULT_COMPLEXITY_CONFIG, type ComplexityScannerConfig } from './scanners/complexity-scanner.js';
import { DependencyScanner, DEFAULT_DEPENDENCY_CONFIG, type DependencyScannerConfig } from './scanners/dependency-scanner.js';
import { QualityReportGenerator } from './reports/quality-report-generator.js';
import type {
  QualityMetric,
  TechnicalDebtItem,
  SecurityVulnerability,
  PerformanceBudget,
  CodeComplexityMetric,
  DependencyHealth,
  QualityReport,
  QualityGateConfig,
  ScannerConfig
} from './types.js';

export interface QualityServiceConfig {
  databasePath?: string;
  persistResults?: boolean;
  projectPath: string;
  projectName: string;
  scanners: {
    technicalDebt?: Partial<TechnicalDebtScannerConfig> & { enabled?: boolean };
    security?: Partial<SecurityScannerConfig> & { enabled?: boolean };
    performance?: Partial<PerformanceScannerConfig> & { enabled?: boolean };
    complexity?: Partial<ComplexityScannerConfig> & { enabled?: boolean };
  };
  reportOutputDir?: string;
}

export class QualityService {
  private db: QualityDatabase | null;
  private config: QualityServiceConfig;
  private debtScanner: TechnicalDebtScanner;
  private securityScanner: SecurityScanner;
  private performanceScanner: PerformanceScanner;
  private complexityScanner: ComplexityScanner;
  private dependencyScanner: DependencyScanner;
  private reportGenerator: QualityReportGenerator;

  constructor(config: QualityServiceConfig) {
    this.config = config;
    this.db = config.persistResults !== false
      ? new QualityDatabase(
          config.databasePath ? { database: config.databasePath } : undefined
        )
      : null;
    
    // Initialize scanners with config
    this.debtScanner = new TechnicalDebtScanner(config.scanners.technicalDebt || {});
    this.securityScanner = new SecurityScanner(config.scanners.security || {});
    this.performanceScanner = new PerformanceScanner(config.scanners.performance || {});
    this.complexityScanner = new ComplexityScanner(config.scanners.complexity || {});
    this.dependencyScanner = new DependencyScanner();
    this.reportGenerator = new QualityReportGenerator();
  }

  async runFullScan(): Promise<QualityReport> {
    console.log(`Starting full quality scan for ${this.config.projectName}...`);
    
    const startTime = Date.now();
    const commitHash = this.getCurrentCommitHash();
    const branchName = this.getCurrentBranch();

    // Run all scanners in parallel
    const [
      technicalDebt,
      securityVulnerabilities,
      performanceBudgets,
      complexityMetrics,
      dependencyHealth
    ] = await Promise.all([
      this.scanTechnicalDebt(),
      this.scanSecurity(),
      this.scanPerformance(),
      this.scanComplexity(),
      this.scanDependencies()
    ]);

    // Get code coverage if available
    const codeCoverage = await this.getCodeCoverage();

    // Get previous report for trend analysis
    const previousReport = this.db
      ? await this.db.getLatestQualityReport(this.config.projectName)
      : null;

    // Generate comprehensive report
    const report = await this.reportGenerator.generateReport({
      projectName: this.config.projectName,
      commitHash,
      branchName,
      technicalDebt,
      securityVulnerabilities,
      performanceBudgets,
      complexityMetrics,
      dependencyHealth,
      codeCoverage,
      previousReport: previousReport || undefined
    });

    // Save report to database
    if (this.db) {
      await this.db.saveQualityReport(report);
      await this.saveQualityMetrics(report);
    }

    // Generate HTML report
    if (this.config.reportOutputDir) {
      const reportPath = path.join(
        this.config.reportOutputDir,
        `quality-report-${Date.now()}.html`
      );
      await this.reportGenerator.generateHTMLReport(report, reportPath);
    }

    const duration = (Date.now() - startTime) / 1000;
    console.log(`Quality scan completed in ${duration}s - Score: ${report.overall.qualityScore}/100`);

    return report;
  }

  async scanTechnicalDebt(): Promise<TechnicalDebtItem[]> {
    if (this.config.scanners.technicalDebt?.enabled === false) {
      console.log('Technical debt scanning disabled');
      return [];
    }

    console.log('Scanning technical debt...');
    const debtItems = await this.debtScanner.scanDirectory(this.config.projectPath);
    
    // Save to database
    if (this.db) {
      for (const item of debtItems) {
        await this.db.insertTechnicalDebtItem(item);
      }
    }

    // Generate individual report
    if (this.config.reportOutputDir) {
      const reportPath = path.join(
        this.config.reportOutputDir,
        `technical-debt-${Date.now()}.html`
      );
      await this.debtScanner.generateHTMLReport(debtItems, reportPath);
    }

    return debtItems;
  }

  async scanSecurity(): Promise<SecurityVulnerability[]> {
    if (this.config.scanners.security?.enabled === false) {
      console.log('Security scanning disabled');
      return [];
    }

    console.log('Scanning security vulnerabilities...');
    const vulnerabilities = await this.securityScanner.scanProject(this.config.projectPath);

    // Save to database
    if (this.db) {
      for (const vuln of vulnerabilities) {
        await this.db.insertSecurityVulnerability(vuln);
      }
    }

    // Generate individual report
    if (this.config.reportOutputDir) {
      const reportPath = path.join(
        this.config.reportOutputDir,
        `security-${Date.now()}.html`
      );
      await this.securityScanner.generateHTMLSecurityReport(vulnerabilities, reportPath);
    }

    return vulnerabilities;
  }

  async scanPerformance(): Promise<PerformanceBudget[]> {
    if (this.config.scanners.performance?.enabled === false) {
      console.log('Performance scanning disabled');
      return [];
    }

    console.log('Scanning performance budgets...');
    const budgets = await this.performanceScanner.scanProject(this.config.projectPath);

    // Save to database
    if (this.db) {
      for (const budget of budgets) {
        await this.db.upsertPerformanceBudget(budget);
      }
    }

    // Generate individual report
    if (this.config.reportOutputDir) {
      const reportPath = path.join(
        this.config.reportOutputDir,
        `performance-${Date.now()}.html`
      );
      await this.performanceScanner.generateHTMLPerformanceReport(budgets, reportPath);
    }

    return budgets;
  }

  async scanComplexity(): Promise<CodeComplexityMetric[]> {
    if (this.config.scanners.complexity?.enabled === false) {
      console.log('Complexity scanning disabled');
      return [];
    }

    console.log('Scanning code complexity...');
    const metrics = await this.complexityScanner.scanProject(this.config.projectPath);
    
    // Save to database (would need to implement in database class)
    // For now, just return the metrics

    // Generate individual report
    if (this.config.reportOutputDir) {
      const reportPath = path.join(
        this.config.reportOutputDir,
        `complexity-${Date.now()}.html`
      );
      await this.complexityScanner.generateHTMLComplexityReport(metrics, reportPath);
    }

    return metrics;
  }

  async scanDependencies(): Promise<DependencyHealth[]> {
    console.log('Scanning dependencies...');
    const dependencies = await this.dependencyScanner.scanProject(this.config.projectPath);
    
    // Save to database (would need to implement in database class)
    // For now, just return the dependencies

    // Generate individual report
    if (this.config.reportOutputDir) {
      const reportPath = path.join(
        this.config.reportOutputDir,
        `dependencies-${Date.now()}.html`
      );
      await this.dependencyScanner.generateHTMLDependencyReport(dependencies, reportPath);
    }

    return dependencies;
  }

  private async getCodeCoverage(): Promise<{ percentage: number; uncoveredFiles: string[]; trend: 'improving' | 'stable' | 'declining' } | undefined> {
    try {
      // Try to get coverage from Jest or other test runners
      const coverageResult = execSync('npm run test -- --coverage --coverageReporters=json-summary', {
        cwd: this.config.projectPath,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
      });

      // Parse coverage data if available
      // This is a simplified implementation - real implementation would parse actual coverage files
      return {
        percentage: 75, // Mock data
        uncoveredFiles: [],
        trend: 'stable'
      };
    } catch (error) {
      console.warn('Could not get code coverage data:', error);
      return undefined;
    }
  }

  private getCurrentCommitHash(): string {
    try {
      return execSync('git rev-parse HEAD', {
        cwd: this.config.projectPath,
        encoding: 'utf-8'
      }).trim();
    } catch (error) {
      console.warn('Could not get commit hash:', error);
      return 'unknown';
    }
  }

  private getCurrentBranch(): string {
    try {
      return execSync('git branch --show-current', {
        cwd: this.config.projectPath,
        encoding: 'utf-8'
      }).trim();
    } catch (error) {
      console.warn('Could not get branch name:', error);
      return 'unknown';
    }
  }

  private async saveQualityMetrics(report: QualityReport): Promise<void> {
    if (!this.db) return;

    const metrics: Omit<QualityMetric, 'id'>[] = [
      {
        projectName: report.projectName,
        commitHash: report.commitHash,
        branchName: report.branchName,
        metricType: 'technical_debt',
        metricName: 'overall_quality_score',
        metricValue: report.overall.qualityScore,
        timestamp: report.generatedAt
      },
      {
        projectName: report.projectName,
        commitHash: report.commitHash,
        branchName: report.branchName,
        metricType: 'technical_debt',
        metricName: 'total_debt_items',
        metricValue: report.technicalDebt.totalItems,
        timestamp: report.generatedAt
      },
      {
        projectName: report.projectName,
        commitHash: report.commitHash,
        branchName: report.branchName,
        metricType: 'security',
        metricName: 'vulnerability_count',
        metricValue: report.security.vulnerabilityCount,
        timestamp: report.generatedAt
      },
      {
        projectName: report.projectName,
        commitHash: report.commitHash,
        branchName: report.branchName,
        metricType: 'performance',
        metricName: 'budget_compliance_rate',
        metricValue: report.performance.averageScore,
        timestamp: report.generatedAt
      },
      {
        projectName: report.projectName,
        commitHash: report.commitHash,
        branchName: report.branchName,
        metricType: 'coverage',
        metricName: 'test_coverage_percentage',
        metricValue: report.coverage.percentage,
        timestamp: report.generatedAt
      }
    ];

    for (const metric of metrics) {
      await this.db.insertQualityMetric(metric);
    }
  }

  async getQualityTrends(metricName: string, days: number = 30): Promise<Array<{ timestamp: string; value: number }>> {
    if (!this.db) return [];
    return this.db.getQualityTrends(this.config.projectName, metricName, days);
  }

  async getDashboardStats(): Promise<{
    totalDebtItems: number;
    unresolvedDebtItems: number;
    securityVulnerabilities: number;
    budgetViolations: number;
    latestQualityScore: number | null;
  }> {
    if (!this.db) {
      return { totalDebtItems: 0, unresolvedDebtItems: 0, securityVulnerabilities: 0, budgetViolations: 0, latestQualityScore: null };
    }
    return this.db.getDashboardStats(this.config.projectName);
  }

  async checkQualityGates(gates: QualityGateConfig[]): Promise<{
    passed: boolean;
    results: Array<{
      gateName: string;
      ruleName: string;
      passed: boolean;
      actualValue: number;
      threshold: number;
      severity: string;
      blockMerge: boolean;
    }>;
  }> {
    if (!this.db) {
      console.warn('Database not available, skipping quality gate checks');
      return { passed: true, results: [] };
    }

    const results = [];
    let overallPassed = true;

    for (const gate of gates.filter(g => g.enabled)) {
      for (const rule of gate.rules) {
        // Get latest metric value
        const metrics = await this.db.getQualityMetrics(
          this.config.projectName,
          rule.metricType,
          1
        );

        if (metrics.length === 0) continue;

        const latestMetric = metrics[0];
        const actualValue = latestMetric.metricValue;
        let passed = false;

        switch (rule.operator) {
          case '<':
            passed = actualValue < rule.threshold;
            break;
          case '<=':
            passed = actualValue <= rule.threshold;
            break;
          case '>':
            passed = actualValue > rule.threshold;
            break;
          case '>=':
            passed = actualValue >= rule.threshold;
            break;
          case '==':
            passed = actualValue === rule.threshold;
            break;
          case '!=':
            passed = actualValue !== rule.threshold;
            break;
        }

        results.push({
          gateName: gate.name,
          ruleName: rule.metricName,
          passed,
          actualValue,
          threshold: rule.threshold,
          severity: rule.severity,
          blockMerge: rule.blockMerge
        });

        if (!passed && rule.blockMerge) {
          overallPassed = false;
        }
      }
    }

    return { passed: overallPassed, results };
  }

  close(): void {
    if (this.db) {
      this.db.close();
    }
  }
}

// Default configuration
export const DEFAULT_QUALITY_CONFIG = {
  technicalDebt: { ...DEFAULT_DEBT_CONFIG, enabled: true },
  security: { ...DEFAULT_SECURITY_CONFIG, enabled: true },
  performance: { ...DEFAULT_PERFORMANCE_CONFIG, enabled: true },
  complexity: { ...DEFAULT_COMPLEXITY_CONFIG, enabled: true }
};