import * as fs from 'fs';
import * as path from 'path';
// @ts-ignore - glob v10 has built-in types
import { glob } from 'glob';
import type { TechnicalDebtItem, DebtType, SeverityLevel } from '../types.js';

export interface TechnicalDebtScannerConfig {
  patterns: {
    todo: string[];
    fixme: string[];
    hack: string[];
    xxx: string[];
    note: string[];
    optimize: string[];
  };
  excludeFiles: string[];
  severityMappings: Record<string, SeverityLevel>;
  includeExtensions: string[];
}

export const DEFAULT_DEBT_CONFIG: TechnicalDebtScannerConfig = {
  patterns: {
    todo: ['TODO', 'todo', 'To-do', 'TO-DO'],
    fixme: ['FIXME', 'fixme', 'FIX-ME', 'FIXED'],
    hack: ['HACK', 'hack', 'KLUDGE', 'kludge'],
    xxx: ['XXX', 'xxx', '!!!'],
    note: ['NOTE', 'note', 'NOTICE'],
    optimize: ['OPTIMIZE', 'optimize', 'PERF', 'PERFORMANCE']
  },
  excludeFiles: [
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/.git/**',
    '**/coverage/**',
    '**/*.min.js',
    '**/*.map'
  ],
  severityMappings: {
    'TODO': 'low',
    'FIXME': 'high',
    'HACK': 'medium',
    'XXX': 'critical',
    'NOTE': 'low',
    'OPTIMIZE': 'medium'
  },
  includeExtensions: ['.ts', '.js', '.tsx', '.jsx', '.py', '.java', '.cs', '.go', '.rs']
};

export class TechnicalDebtScanner {
  private config: TechnicalDebtScannerConfig;

  constructor(config: Partial<TechnicalDebtScannerConfig> = {}) {
    this.config = { ...DEFAULT_DEBT_CONFIG, ...config };
  }

  async scanDirectory(directoryPath: string): Promise<TechnicalDebtItem[]> {
    const debtItems: TechnicalDebtItem[] = [];
    
    // Get all files matching our criteria
    const extensionPattern = `**/*{${this.config.includeExtensions.join(',')}}`;
    const files = await glob(extensionPattern, {
      cwd: directoryPath,
      ignore: this.config.excludeFiles,
      absolute: true
    });

    console.log(`Scanning ${files.length} files for technical debt...`);

    for (const filePath of files) {
      const items = await this.scanFile(filePath);
      debtItems.push(...items);
    }

    console.log(`Found ${debtItems.length} technical debt items`);
    return debtItems;
  }

  async scanFile(filePath: string): Promise<TechnicalDebtItem[]> {
    const debtItems: TechnicalDebtItem[] = [];
    
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');

      for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const line = lines[lineIndex];
        const lineNumber = lineIndex + 1;

        // Check each debt type pattern
        for (const [debtType, patterns] of Object.entries(this.config.patterns)) {
          for (const pattern of patterns) {
            const items = this.extractDebtFromLine(
              line,
              lineNumber,
              filePath,
              pattern,
              debtType.toUpperCase() as DebtType
            );
            debtItems.push(...items);
          }
        }
      }
    } catch (error) {
      console.warn(`Failed to scan file ${filePath}:`, error);
    }

    return debtItems;
  }

  private extractDebtFromLine(
    line: string,
    lineNumber: number,
    filePath: string,
    pattern: string,
    debtType: DebtType
  ): TechnicalDebtItem[] {
    const items: TechnicalDebtItem[] = [];
    
    // Look for comment patterns (single line and multi-line)
    const commentPatterns = [
      new RegExp(`//\\s*${pattern}:?\\s*(.*)`, 'gi'),
      new RegExp(`#\\s*${pattern}:?\\s*(.*)`, 'gi'),
      new RegExp(`/\\*\\s*${pattern}:?\\s*(.*?)\\*/`, 'gi'),
      new RegExp(`<!--\\s*${pattern}:?\\s*(.*?)-->`, 'gi'),
      new RegExp(`\"\"\"\\s*${pattern}:?\\s*(.*?)\"\"\"`, 'gi'),
      new RegExp(`'''\\s*${pattern}:?\\s*(.*?)'''`, 'gi')
    ];

    for (const regex of commentPatterns) {
      let match;
      while ((match = regex.exec(line)) !== null) {
        const message = match[1]?.trim() || '';
        
        if (message.length > 0) {
          const severity = this.config.severityMappings[debtType] || 'medium';
          const estimatedEffort = this.estimateEffort(message, debtType);
          const category = this.categorizeDebt(message);

          items.push({
            id: '', // Will be set by database
            filePath: path.relative(process.cwd(), filePath),
            lineNumber,
            debtType,
            message,
            severity,
            estimatedEffort,
            category,
            createdAt: new Date().toISOString()
          });
        }
      }
    }

    return items;
  }

  private estimateEffort(message: string, debtType: DebtType): number {
    // Simple heuristic for effort estimation based on keywords and debt type
    let baseHours = 0;

    switch (debtType) {
      case 'TODO':
        baseHours = 1;
        break;
      case 'FIXME':
        baseHours = 4;
        break;
      case 'HACK':
        baseHours = 6;
        break;
      case 'XXX':
        baseHours = 8;
        break;
      case 'OPTIMIZE':
        baseHours = 3;
        break;
      default:
        baseHours = 2;
    }

    // Adjust based on message content
    const messageLower = message.toLowerCase();
    if (messageLower.includes('refactor') || messageLower.includes('rewrite')) {
      baseHours *= 2;
    }
    if (messageLower.includes('test') || messageLower.includes('testing')) {
      baseHours *= 1.5;
    }
    if (messageLower.includes('performance') || messageLower.includes('optimization')) {
      baseHours *= 1.5;
    }
    if (messageLower.includes('security') || messageLower.includes('vulnerability')) {
      baseHours *= 2;
    }

    return Math.round(baseHours * 100) / 100; // Round to 2 decimal places
  }

  private categorizeDebt(message: string): string {
    const messageLower = message.toLowerCase();

    if (messageLower.includes('test') || messageLower.includes('testing')) {
      return 'testing';
    }
    if (messageLower.includes('performance') || messageLower.includes('optimization') || messageLower.includes('perf')) {
      return 'performance';
    }
    if (messageLower.includes('security') || messageLower.includes('auth') || messageLower.includes('vulnerability')) {
      return 'security';
    }
    if (messageLower.includes('ui') || messageLower.includes('ux') || messageLower.includes('interface')) {
      return 'ui/ux';
    }
    if (messageLower.includes('refactor') || messageLower.includes('cleanup') || messageLower.includes('structure')) {
      return 'refactoring';
    }
    if (messageLower.includes('bug') || messageLower.includes('fix') || messageLower.includes('error')) {
      return 'bug_fix';
    }
    if (messageLower.includes('feature') || messageLower.includes('implement') || messageLower.includes('add')) {
      return 'feature';
    }
    if (messageLower.includes('documentation') || messageLower.includes('docs') || messageLower.includes('comment')) {
      return 'documentation';
    }

    return 'general';
  }

  async generateReport(debtItems: TechnicalDebtItem[]): Promise<{
    summary: {
      total: number;
      byType: Record<DebtType, number>;
      bySeverity: Record<SeverityLevel, number>;
      byCategory: Record<string, number>;
      totalEstimatedHours: number;
    };
    files: Array<{
      filePath: string;
      debtCount: number;
      severityBreakdown: Record<SeverityLevel, number>;
      estimatedHours: number;
    }>;
    topIssues: TechnicalDebtItem[];
  }> {
    const summary = {
      total: debtItems.length,
      byType: {} as Record<DebtType, number>,
      bySeverity: {} as Record<SeverityLevel, number>,
      byCategory: {} as Record<string, number>,
      totalEstimatedHours: 0
    };

    const fileStats = new Map<string, {
      count: number;
      severityBreakdown: Record<SeverityLevel, number>;
      estimatedHours: number;
    }>();

    // Aggregate statistics
    for (const item of debtItems) {
      // By type
      summary.byType[item.debtType] = (summary.byType[item.debtType] || 0) + 1;
      
      // By severity
      summary.bySeverity[item.severity] = (summary.bySeverity[item.severity] || 0) + 1;
      
      // By category
      const category = item.category || 'general';
      summary.byCategory[category] = (summary.byCategory[category] || 0) + 1;
      
      // Total estimated hours
      summary.totalEstimatedHours += item.estimatedEffort || 0;

      // File statistics
      if (!fileStats.has(item.filePath)) {
        fileStats.set(item.filePath, {
          count: 0,
          severityBreakdown: { low: 0, medium: 0, high: 0, critical: 0 },
          estimatedHours: 0
        });
      }
      
      const fileData = fileStats.get(item.filePath)!;
      fileData.count++;
      fileData.severityBreakdown[item.severity]++;
      fileData.estimatedHours += item.estimatedEffort || 0;
    }

    // Convert file stats to array and sort by debt count
    const files = Array.from(fileStats.entries())
      .map(([filePath, stats]) => ({
        filePath,
        debtCount: stats.count,
        severityBreakdown: stats.severityBreakdown,
        estimatedHours: Math.round(stats.estimatedHours * 100) / 100
      }))
      .sort((a, b) => b.debtCount - a.debtCount);

    // Get top issues (critical and high severity, sorted by estimated effort)
    const topIssues = debtItems
      .filter(item => item.severity === 'critical' || item.severity === 'high')
      .sort((a, b) => (b.estimatedEffort || 0) - (a.estimatedEffort || 0))
      .slice(0, 10);

    return {
      summary,
      files,
      topIssues
    };
  }

  async generateHTMLReport(debtItems: TechnicalDebtItem[], outputPath: string): Promise<void> {
    const report = await this.generateReport(debtItems);
    
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Technical Debt Report</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 20px; }
        .header { background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
        .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin: 20px 0; }
        .summary-card { background: white; padding: 15px; border-radius: 8px; border: 1px solid #e9ecef; }
        .summary-card h3 { margin: 0 0 10px 0; font-size: 14px; color: #6c757d; }
        .summary-card .value { font-size: 24px; font-weight: bold; color: #495057; }
        .file-list { background: white; border-radius: 8px; border: 1px solid #e9ecef; }
        .file-item { padding: 15px; border-bottom: 1px solid #e9ecef; }
        .file-item:last-child { border-bottom: none; }
        .severity-high { color: #dc3545; }
        .severity-critical { color: #721c24; font-weight: bold; }
        .severity-medium { color: #fd7e14; }
        .severity-low { color: #198754; }
        .debt-item { background: #f8f9fa; padding: 10px; margin: 10px 0; border-radius: 4px; border-left: 4px solid #dee2e6; }
        .debt-item.critical { border-left-color: #721c24; }
        .debt-item.high { border-left-color: #dc3545; }
        .debt-item.medium { border-left-color: #fd7e14; }
        .debt-item.low { border-left-color: #198754; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Technical Debt Report</h1>
        <p>Generated on ${new Date().toLocaleString()}</p>
    </div>

    <div class="summary-grid">
        <div class="summary-card">
            <h3>Total Debt Items</h3>
            <div class="value">${report.summary.total}</div>
        </div>
        <div class="summary-card">
            <h3>Estimated Hours</h3>
            <div class="value">${Math.round(report.summary.totalEstimatedHours)}</div>
        </div>
        <div class="summary-card">
            <h3>Critical Issues</h3>
            <div class="value severity-critical">${report.summary.bySeverity.critical || 0}</div>
        </div>
        <div class="summary-card">
            <h3>High Priority</h3>
            <div class="value severity-high">${report.summary.bySeverity.high || 0}</div>
        </div>
    </div>

    <h2>Files with Most Debt</h2>
    <div class="file-list">
        ${report.files.slice(0, 10).map(file => `
            <div class="file-item">
                <strong>${file.filePath}</strong>
                <div>Items: ${file.debtCount} | Estimated: ${file.estimatedHours}h</div>
                <div>
                    <span class="severity-critical">${file.severityBreakdown.critical || 0} Critical</span> |
                    <span class="severity-high">${file.severityBreakdown.high || 0} High</span> |
                    <span class="severity-medium">${file.severityBreakdown.medium || 0} Medium</span> |
                    <span class="severity-low">${file.severityBreakdown.low || 0} Low</span>
                </div>
            </div>
        `).join('')}
    </div>

    <h2>Top Priority Issues</h2>
    ${report.topIssues.map(item => `
        <div class="debt-item ${item.severity}">
            <strong>${item.debtType}</strong> in ${item.filePath}:${item.lineNumber}
            <div>${item.message}</div>
            <div><small>Severity: ${item.severity} | Estimated: ${item.estimatedEffort || 0}h | Category: ${item.category || 'general'}</small></div>
        </div>
    `).join('')}
</body>
</html>
    `;

    fs.writeFileSync(outputPath, html, 'utf-8');
    console.log(`Technical debt report generated: ${outputPath}`);
  }
}