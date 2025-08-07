import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { getGlob } from '../utils/glob-loader.js';
import type { PerformanceBudget, SeverityLevel } from '../types.js';

export interface PerformanceScannerConfig {
  budgets: Array<{
    bundleName: string;
    type: 'bundle' | 'asset' | 'script' | 'style';
    maximumWarning: string;
    maximumError: string;
    paths?: string[];
  }>;
  analyzeBundles: boolean;
  includeSourceMaps: boolean;
  compressionFormat: 'gzip' | 'brotli' | 'none';
}

export const DEFAULT_PERFORMANCE_CONFIG: PerformanceScannerConfig = {
  budgets: [
    {
      bundleName: 'core',
      type: 'bundle',
      maximumWarning: '500kb',
      maximumError: '1mb',
      paths: ['**/core/dist/**/*.js']
    },
    {
      bundleName: 'web',
      type: 'bundle',
      maximumWarning: '2mb',
      maximumError: '5mb',
      paths: ['**/web/.next/**/*.js', '**/web/dist/**/*.js']
    },
    {
      bundleName: 'gateway',
      type: 'bundle',
      maximumWarning: '800kb',
      maximumError: '1.5mb',
      paths: ['**/gateway/dist/**/*.js']
    }
  ],
  analyzeBundles: true,
  includeSourceMaps: false,
  compressionFormat: 'gzip'
};

interface BundleAnalysis {
  filePath: string;
  size: number;
  compressedSize: number;
  dependencies: string[];
  duplicates: Array<{
    module: string;
    count: number;
    totalSize: number;
  }>;
}

export class PerformanceScanner {
  private config: PerformanceScannerConfig;

  constructor(config: Partial<PerformanceScannerConfig> = {}) {
    this.config = { ...DEFAULT_PERFORMANCE_CONFIG, ...config };
  }

  async scanProject(projectPath: string): Promise<PerformanceBudget[]> {
    const budgetResults: PerformanceBudget[] = [];

    console.log('Analyzing bundle sizes and performance budgets...');

    for (const budgetConfig of this.config.budgets) {
      const budget = await this.checkBudget(projectPath, budgetConfig);
      if (budget) {
        budgetResults.push(budget);
      }
    }

    if (this.config.analyzeBundles) {
      await this.analyzeBundleComposition(projectPath, budgetResults);
    }

    console.log(`Analyzed ${budgetResults.length} performance budgets`);
    return budgetResults;
  }

  private async checkBudget(
    projectPath: string,
    budgetConfig: PerformanceScannerConfig['budgets'][0]
  ): Promise<PerformanceBudget | null> {
    try {
      const patterns = budgetConfig.paths || [`**/${budgetConfig.bundleName}/**/*.js`];
      let totalSize = 0;
      let fileCount = 0;

      for (const pattern of patterns) {
        const files = await glob(pattern, {
          cwd: projectPath,
          absolute: true,
          ignore: ['**/node_modules/**', '**/*.map', '**/*.test.js', '**/*.spec.js']
        });

        for (const filePath of files) {
          if (fs.existsSync(filePath)) {
            const stats = fs.statSync(filePath);
            totalSize += stats.size;
            fileCount++;
          }
        }
      }

      if (fileCount === 0) {
        console.warn(`No files found for budget ${budgetConfig.bundleName}`);
        return null;
      }

      // Convert to compressed size if needed
      let effectiveSize = totalSize;
      if (this.config.compressionFormat !== 'none') {
        effectiveSize = await this.estimateCompressedSize(totalSize, this.config.compressionFormat);
      }

      const warningThreshold = this.parseSize(budgetConfig.maximumWarning);
      const errorThreshold = this.parseSize(budgetConfig.maximumError);
      const isCompliant = effectiveSize <= warningThreshold;

      return {
        id: '', // Will be set by database
        bundleName: budgetConfig.bundleName,
        type: budgetConfig.type,
        maximumWarning: budgetConfig.maximumWarning,
        maximumError: budgetConfig.maximumError,
        currentSize: this.formatSize(effectiveSize),
        isCompliant,
        lastChecked: new Date().toISOString()
      };

    } catch (error) {
      console.warn(`Failed to check budget for ${budgetConfig.bundleName}:`, error);
      return null;
    }
  }

  private parseSize(sizeStr: string): number {
    const units: Record<string, number> = {
      b: 1,
      kb: 1024,
      mb: 1024 * 1024,
      gb: 1024 * 1024 * 1024
    };

    const match = sizeStr.toLowerCase().match(/^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)$/);
    if (!match) {
      throw new Error(`Invalid size format: ${sizeStr}`);
    }

    const [, value, unit] = match;
    return parseFloat(value) * units[unit];
  }

  private formatSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${Math.round(size * 100) / 100}${units[unitIndex]}`;
  }

  private async estimateCompressedSize(originalSize: number, format: 'gzip' | 'brotli'): Promise<number> {
    // Rough compression ratio estimates
    const compressionRatios = {
      gzip: 0.3, // ~70% compression
      brotli: 0.25 // ~75% compression
    };

    return Math.round(originalSize * compressionRatios[format]);
  }

  private async analyzeBundleComposition(
    projectPath: string,
    budgets: PerformanceBudget[]
  ): Promise<void> {
    for (const budget of budgets) {
      try {
        const analysis = await this.analyzeBundleFiles(projectPath, budget);
        if (analysis.length > 0) {
          await this.generateBundleReport(budget.bundleName, analysis);
        }
      } catch (error) {
        console.warn(`Failed to analyze bundle ${budget.bundleName}:`, error);
      }
    }
  }

  private async analyzeBundleFiles(
    projectPath: string,
    budget: PerformanceBudget
  ): Promise<BundleAnalysis[]> {
    const analyses: BundleAnalysis[] = [];
    
    try {
      // Find all JS files for this bundle
      const pattern = `**/${budget.bundleName}/**/*.js`;
      const files = await glob(pattern, {
        cwd: projectPath,
        absolute: true,
        ignore: ['**/node_modules/**', '**/*.map', '**/*.test.js', '**/*.spec.js']
      });

      for (const filePath of files) {
        const analysis = await this.analyzeFile(filePath);
        if (analysis) {
          analyses.push(analysis);
        }
      }
    } catch (error) {
      console.warn(`Bundle analysis failed for ${budget.bundleName}:`, error);
    }

    return analyses;
  }

  private async analyzeFile(filePath: string): Promise<BundleAnalysis | null> {
    try {
      const stats = fs.statSync(filePath);
      const content = fs.readFileSync(filePath, 'utf-8');
      
      // Simple dependency extraction (for basic analysis)
      const dependencies = this.extractDependencies(content);
      
      // Estimate compressed size
      const compressedSize = await this.estimateCompressedSize(
        stats.size,
        this.config.compressionFormat === 'none' ? 'gzip' : this.config.compressionFormat
      );

      return {
        filePath,
        size: stats.size,
        compressedSize,
        dependencies,
        duplicates: [] // Would need more sophisticated analysis
      };
    } catch (error) {
      console.warn(`Failed to analyze file ${filePath}:`, error);
      return null;
    }
  }

  private extractDependencies(content: string): string[] {
    const dependencies: string[] = [];
    
    // Extract require() calls
    const requireRegex = /require\(['"`]([^'"`]+)['"`]\)/g;
    let match;
    while ((match = requireRegex.exec(content)) !== null) {
      dependencies.push(match[1]);
    }

    // Extract import statements
    const importRegex = /import.*?from\s+['"`]([^'"`]+)['"`]/g;
    while ((match = importRegex.exec(content)) !== null) {
      dependencies.push(match[1]);
    }

    return [...new Set(dependencies)]; // Remove duplicates
  }

  private async generateBundleReport(bundleName: string, analyses: BundleAnalysis[]): Promise<void> {
    const totalSize = analyses.reduce((sum, analysis) => sum + analysis.size, 0);
    const totalCompressed = analyses.reduce((sum, analysis) => sum + analysis.compressedSize, 0);
    
    console.log(`\n📊 Bundle Analysis: ${bundleName}`);
    console.log(`Total Files: ${analyses.length}`);
    console.log(`Total Size: ${this.formatSize(totalSize)}`);
    console.log(`Compressed: ${this.formatSize(totalCompressed)}`);
    console.log(`Compression Ratio: ${Math.round((1 - totalCompressed / totalSize) * 100)}%`);

    // Find largest files
    const largestFiles = analyses
      .sort((a, b) => b.size - a.size)
      .slice(0, 5);

    console.log('\n🔍 Largest Files:');
    largestFiles.forEach((analysis, index) => {
      const relativePath = path.relative(process.cwd(), analysis.filePath);
      console.log(`${index + 1}. ${relativePath} - ${this.formatSize(analysis.size)}`);
    });
  }

  async generatePerformanceReport(budgets: PerformanceBudget[]): Promise<{
    summary: {
      totalBudgets: number;
      compliantBudgets: number;
      violatingBudgets: number;
      totalSize: string;
      averageComplianceRate: number;
    };
    violations: Array<{
      bundleName: string;
      currentSize: string;
      maximumWarning: string;
      maximumError: string;
      severity: SeverityLevel;
      overagePercentage: number;
    }>;
    recommendations: Array<{
      bundleName: string;
      currentIssue: string;
      recommendation: string;
      expectedImprovement: string;
    }>;
  }> {
    const summary = {
      totalBudgets: budgets.length,
      compliantBudgets: budgets.filter(b => b.isCompliant).length,
      violatingBudgets: budgets.filter(b => !b.isCompliant).length,
      totalSize: '0B',
      averageComplianceRate: 0
    };

    const violations = [];
    const recommendations = [];

    let totalBytes = 0;

    for (const budget of budgets) {
      const currentBytes = this.parseSize(budget.currentSize);
      totalBytes += currentBytes;

      if (!budget.isCompliant) {
        const warningBytes = this.parseSize(budget.maximumWarning);
        const errorBytes = this.parseSize(budget.maximumError);
        
        let severity: SeverityLevel = 'medium';
        let overagePercentage = 0;

        if (currentBytes > errorBytes) {
          severity = 'critical';
          overagePercentage = ((currentBytes - errorBytes) / errorBytes) * 100;
        } else if (currentBytes > warningBytes) {
          severity = 'high';
          overagePercentage = ((currentBytes - warningBytes) / warningBytes) * 100;
        }

        violations.push({
          bundleName: budget.bundleName,
          currentSize: budget.currentSize,
          maximumWarning: budget.maximumWarning,
          maximumError: budget.maximumError,
          severity,
          overagePercentage: Math.round(overagePercentage)
        });

        // Generate recommendations
        recommendations.push({
          bundleName: budget.bundleName,
          currentIssue: `Bundle exceeds ${severity === 'critical' ? 'error' : 'warning'} threshold`,
          recommendation: this.generateOptimizationRecommendation(budget),
          expectedImprovement: `Target: ${budget.maximumWarning}`
        });
      }
    }

    summary.totalSize = this.formatSize(totalBytes);
    summary.averageComplianceRate = summary.totalBudgets > 0 
      ? Math.round((summary.compliantBudgets / summary.totalBudgets) * 100)
      : 100;

    return { summary, violations, recommendations };
  }

  private generateOptimizationRecommendation(budget: PerformanceBudget): string {
    const recommendations = [
      'Enable tree shaking to remove unused code',
      'Implement code splitting for lazy loading',
      'Compress assets with gzip/brotli',
      'Optimize images and remove unused assets',
      'Consider bundler optimizations (minification, dead code elimination)',
      'Review and remove unnecessary dependencies',
      'Implement dynamic imports for large modules'
    ];

    // Simple heuristic based on bundle type and size
    const currentBytes = this.parseSize(budget.currentSize);
    const errorBytes = this.parseSize(budget.maximumError);
    const overage = currentBytes - errorBytes;

    if (overage > errorBytes * 0.5) {
      return recommendations[1]; // Code splitting for large overages
    } else if (budget.type === 'bundle') {
      return recommendations[0]; // Tree shaking for bundles
    } else {
      return recommendations[2]; // Compression for other assets
    }
  }

  async generateHTMLPerformanceReport(budgets: PerformanceBudget[], outputPath: string): Promise<void> {
    const report = await this.generatePerformanceReport(budgets);
    
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Performance Budget Report</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 20px; }
        .header { background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
        .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin: 20px 0; }
        .summary-card { background: white; padding: 15px; border-radius: 8px; border: 1px solid #e9ecef; }
        .summary-card h3 { margin: 0 0 10px 0; font-size: 14px; color: #6c757d; }
        .summary-card .value { font-size: 24px; font-weight: bold; color: #495057; }
        .budget-item { background: #f8f9fa; padding: 15px; margin: 10px 0; border-radius: 8px; border-left: 4px solid #dee2e6; }
        .budget-item.compliant { border-left-color: #198754; }
        .budget-item.warning { border-left-color: #fd7e14; }
        .budget-item.error { border-left-color: #dc3545; }
        .budget-item.critical { border-left-color: #721c24; }
        .progress-bar { width: 100%; height: 8px; background: #e9ecef; border-radius: 4px; overflow: hidden; margin: 10px 0; }
        .progress-fill { height: 100%; transition: width 0.3s ease; }
        .progress-fill.compliant { background: #198754; }
        .progress-fill.warning { background: #fd7e14; }
        .progress-fill.error { background: #dc3545; }
        .progress-fill.critical { background: #721c24; }
        .recommendation { background: #e7f3ff; padding: 10px; border-radius: 4px; margin: 10px 0; border-left: 3px solid #0066cc; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Performance Budget Report</h1>
        <p>Generated on ${new Date().toLocaleString()}</p>
    </div>

    <div class="summary-grid">
        <div class="summary-card">
            <h3>Total Budgets</h3>
            <div class="value">${report.summary.totalBudgets}</div>
        </div>
        <div class="summary-card">
            <h3>Compliant</h3>
            <div class="value" style="color: #198754;">${report.summary.compliantBudgets}</div>
        </div>
        <div class="summary-card">
            <h3>Violations</h3>
            <div class="value" style="color: #dc3545;">${report.summary.violatingBudgets}</div>
        </div>
        <div class="summary-card">
            <h3>Compliance Rate</h3>
            <div class="value">${report.summary.averageComplianceRate}%</div>
        </div>
        <div class="summary-card">
            <h3>Total Size</h3>
            <div class="value">${report.summary.totalSize}</div>
        </div>
    </div>

    <h2>Budget Status</h2>
    ${budgets.map(budget => {
      const violation = report.violations.find(v => v.bundleName === budget.bundleName);
      const status = budget.isCompliant ? 'compliant' : (violation?.severity === 'critical' ? 'critical' : violation?.severity === 'high' ? 'error' : 'warning');
      const currentBytes = this.parseSize(budget.currentSize);
      const warningBytes = this.parseSize(budget.maximumWarning);
      const progressPercentage = Math.min((currentBytes / warningBytes) * 100, 150);
      
      return `
        <div class="budget-item ${status}">
            <h3>${budget.bundleName} (${budget.type})</h3>
            <div>Current: <strong>${budget.currentSize}</strong> | Warning: ${budget.maximumWarning} | Error: ${budget.maximumError}</div>
            <div class="progress-bar">
                <div class="progress-fill ${status}" style="width: ${progressPercentage}%"></div>
            </div>
            ${violation ? `<div style="color: #dc3545;">⚠️ ${violation.overagePercentage}% over threshold</div>` : '<div style="color: #198754;">✅ Within budget</div>'}
        </div>
      `;
    }).join('')}

    ${report.recommendations.length > 0 ? `
        <h2>Optimization Recommendations</h2>
        ${report.recommendations.map(rec => `
            <div class="recommendation">
                <h4>${rec.bundleName}</h4>
                <p><strong>Issue:</strong> ${rec.currentIssue}</p>
                <p><strong>Recommendation:</strong> ${rec.recommendation}</p>
                <p><strong>Target:</strong> ${rec.expectedImprovement}</p>
            </div>
        `).join('')}
    ` : ''}
</body>
</html>
    `;

    fs.writeFileSync(outputPath, html, 'utf-8');
    console.log(`Performance report generated: ${outputPath}`);
  }
}