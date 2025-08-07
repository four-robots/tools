import * as fs from 'fs';
import * as path from 'path';
import { getGlob } from '../utils/glob-loader.js';
import type { CodeComplexityMetric, SeverityLevel } from '../types.js';

export interface ComplexityScannerConfig {
  cyclomaticThreshold: number;
  cognitiveThreshold: number;
  maintainabilityThreshold: number;
  excludeFiles: string[];
  includeExtensions: string[];
  excludePatterns: string[];
}

export const DEFAULT_COMPLEXITY_CONFIG: ComplexityScannerConfig = {
  cyclomaticThreshold: 10,
  cognitiveThreshold: 15,
  maintainabilityThreshold: 20,
  excludeFiles: [
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/.git/**',
    '**/coverage/**',
    '**/*.min.js',
    '**/*.map',
    '**/*.test.ts',
    '**/*.test.js',
    '**/*.spec.ts',
    '**/*.spec.js'
  ],
  includeExtensions: ['.ts', '.js', '.tsx', '.jsx'],
  excludePatterns: [
    'test',
    'spec',
    'mock',
    'fixture'
  ]
};

interface FunctionInfo {
  name: string;
  startLine: number;
  endLine: number;
  parameters: number;
  complexity: {
    cyclomatic: number;
    cognitive: number;
  };
  linesOfCode: number;
  maintainabilityIndex: number;
}

export class ComplexityScanner {
  private config: ComplexityScannerConfig;

  constructor(config: Partial<ComplexityScannerConfig> = {}) {
    this.config = { ...DEFAULT_COMPLEXITY_CONFIG, ...config };
  }

  async scanProject(projectPath: string): Promise<CodeComplexityMetric[]> {
    const complexityMetrics: CodeComplexityMetric[] = [];
    
    // Get all files matching our criteria
    const glob = await getGlob();
    const extensionPattern = `**/*{${this.config.includeExtensions.join(',')}}`;
    const files = await glob(extensionPattern, {
      cwd: projectPath,
      ignore: this.config.excludeFiles,
      absolute: true
    });

    console.log(`Analyzing complexity for ${files.length} files...`);

    for (const filePath of files) {
      const metrics = await this.analyzeFile(filePath);
      complexityMetrics.push(...metrics);
    }

    console.log(`Found ${complexityMetrics.length} functions with complexity metrics`);
    return complexityMetrics;
  }

  async analyzeFile(filePath: string): Promise<CodeComplexityMetric[]> {
    const metrics: CodeComplexityMetric[] = [];
    
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const functions = this.extractFunctions(content);
      
      for (const func of functions) {
        const severity = this.calculateSeverity(func.complexity.cyclomatic, func.complexity.cognitive);
        
        metrics.push({
          id: '', // Will be set by database
          filePath: path.relative(process.cwd(), filePath),
          functionName: func.name,
          cyclomaticComplexity: func.complexity.cyclomatic,
          cognitiveComplexity: func.complexity.cognitive,
          linesOfCode: func.linesOfCode,
          maintainabilityIndex: func.maintainabilityIndex,
          severity,
          measuredAt: new Date().toISOString()
        });
      }
    } catch (error) {
      console.warn(`Failed to analyze complexity for ${filePath}:`, error);
    }

    return metrics;
  }

  private extractFunctions(content: string): FunctionInfo[] {
    const functions: FunctionInfo[] = [];
    const lines = content.split('\n');
    
    // Simple regex patterns for function detection
    const functionPatterns = [
      // Regular functions
      /^\s*function\s+(\w+)\s*\(/,
      // Arrow functions with names
      /^\s*(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\(/,
      // Method definitions
      /^\s*(?:async\s+)?(\w+)\s*\([^)]*\)\s*[{:]/,
      // Class methods
      /^\s*(?:public|private|protected)?\s*(?:static\s+)?(?:async\s+)?(\w+)\s*\(/,
      // Export functions
      /^\s*export\s+(?:async\s+)?function\s+(\w+)\s*\(/,
    ];

    let currentFunction: Partial<FunctionInfo> | null = null;
    let braceDepth = 0;
    let functionStartBrace = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();
      
      // Skip comments and empty lines
      if (trimmedLine.startsWith('//') || trimmedLine.startsWith('/*') || trimmedLine === '') {
        continue;
      }

      // Check for function start
      if (!currentFunction) {
        for (const pattern of functionPatterns) {
          const match = trimmedLine.match(pattern);
          if (match) {
            const functionName = match[1];
            
            // Skip if matches exclude patterns
            if (this.config.excludePatterns.some(pattern => 
              functionName.toLowerCase().includes(pattern))) {
              continue;
            }

            currentFunction = {
              name: functionName,
              startLine: i + 1,
              parameters: this.countParameters(trimmedLine),
              complexity: { cyclomatic: 1, cognitive: 0 },
              linesOfCode: 0
            };
            
            braceDepth = 0;
            functionStartBrace = false;
            break;
          }
        }
      }

      if (currentFunction) {
        // Count braces to track function scope
        const openBraces = (line.match(/\{/g) || []).length;
        const closeBraces = (line.match(/\}/g) || []).length;
        
        if (openBraces > 0 && !functionStartBrace) {
          functionStartBrace = true;
        }
        
        braceDepth += openBraces - closeBraces;
        
        if (functionStartBrace) {
          currentFunction.linesOfCode = currentFunction.linesOfCode! + 1;
          
          // Calculate complexity
          const complexityIncrease = this.calculateLineComplexity(trimmedLine);
          currentFunction.complexity!.cyclomatic += complexityIncrease.cyclomatic;
          currentFunction.complexity!.cognitive += complexityIncrease.cognitive;
        }

        // Function ends when braces are balanced and we've seen the opening brace
        if (functionStartBrace && braceDepth === 0) {
          currentFunction.endLine = i + 1;
          currentFunction.maintainabilityIndex = this.calculateMaintainabilityIndex(
            currentFunction.complexity!.cyclomatic,
            currentFunction.linesOfCode!,
            currentFunction.parameters!
          );
          
          functions.push(currentFunction as FunctionInfo);
          currentFunction = null;
        }
      }
    }

    return functions;
  }

  private countParameters(functionLine: string): number {
    const paramMatch = functionLine.match(/\(([^)]*)\)/);
    if (!paramMatch || !paramMatch[1].trim()) {
      return 0;
    }
    
    const params = paramMatch[1].split(',').filter(p => p.trim());
    return params.length;
  }

  private calculateLineComplexity(line: string): { cyclomatic: number; cognitive: number } {
    let cyclomatic = 0;
    let cognitive = 0;

    // Cyclomatic complexity keywords
    const cyclomaticKeywords = ['if', 'else', 'while', 'for', 'switch', 'case', 'catch', '&&', '||', '?'];
    const cognitiveKeywords = ['if', 'else', 'while', 'for', 'switch', 'catch'];
    const nestingKeywords = ['if', 'while', 'for', 'switch'];

    for (const keyword of cyclomaticKeywords) {
      if (keyword === '&&' || keyword === '||' || keyword === '?') {
        const matches = line.match(new RegExp(`\\${keyword}`, 'g'));
        cyclomatic += matches ? matches.length : 0;
      } else {
        const regex = new RegExp(`\\b${keyword}\\b`, 'g');
        const matches = line.match(regex);
        cyclomatic += matches ? matches.length : 0;
      }
    }

    // Cognitive complexity (simplified)
    for (const keyword of cognitiveKeywords) {
      const regex = new RegExp(`\\b${keyword}\\b`, 'g');
      const matches = line.match(regex);
      if (matches) {
        cognitive += matches.length;
        
        // Add extra points for nesting (simplified)
        if (nestingKeywords.includes(keyword)) {
          const indentation = line.length - line.trimStart().length;
          const nestingLevel = Math.floor(indentation / 2); // Assume 2-space indentation
          cognitive += nestingLevel;
        }
      }
    }

    return { cyclomatic, cognitive };
  }

  private calculateMaintainabilityIndex(
    cyclomaticComplexity: number,
    linesOfCode: number,
    parameters: number
  ): number {
    // Simplified maintainability index calculation
    // Based on: MI = 171 - 5.2 * ln(HV) - 0.23 * CC - 16.2 * ln(LOC)
    // Where HV = Halstead Volume (approximated), CC = Cyclomatic Complexity, LOC = Lines of Code
    
    const halsteadVolume = Math.max(linesOfCode * Math.log2(parameters + 2), 1);
    const maintainabilityIndex = Math.max(
      171 - 5.2 * Math.log(halsteadVolume) - 0.23 * cyclomaticComplexity - 16.2 * Math.log(Math.max(linesOfCode, 1)),
      0
    );

    return Math.round(maintainabilityIndex);
  }

  private calculateSeverity(cyclomaticComplexity: number, cognitiveComplexity: number): SeverityLevel {
    if (cyclomaticComplexity >= this.config.cyclomaticThreshold * 2 || 
        cognitiveComplexity >= this.config.cognitiveThreshold * 2) {
      return 'critical';
    } else if (cyclomaticComplexity >= this.config.cyclomaticThreshold * 1.5 || 
               cognitiveComplexity >= this.config.cognitiveThreshold * 1.5) {
      return 'high';
    } else if (cyclomaticComplexity >= this.config.cyclomaticThreshold || 
               cognitiveComplexity >= this.config.cognitiveThreshold) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  async generateComplexityReport(metrics: CodeComplexityMetric[]): Promise<{
    summary: {
      totalFunctions: number;
      averageCyclomaticComplexity: number;
      averageCognitiveComplexity: number;
      averageMaintainabilityIndex: number;
      bySeverity: Record<SeverityLevel, number>;
      functionsOverThreshold: number;
    };
    files: Array<{
      filePath: string;
      functionCount: number;
      averageComplexity: number;
      highestComplexity: number;
      maintainabilityScore: number;
    }>;
    mostComplexFunctions: CodeComplexityMetric[];
    recommendations: Array<{
      functionName: string;
      filePath: string;
      issue: string;
      recommendation: string;
      priority: SeverityLevel;
    }>;
  }> {
    const summary = {
      totalFunctions: metrics.length,
      averageCyclomaticComplexity: 0,
      averageCognitiveComplexity: 0,
      averageMaintainabilityIndex: 0,
      bySeverity: { low: 0, medium: 0, high: 0, critical: 0 } as Record<SeverityLevel, number>,
      functionsOverThreshold: 0
    };

    const fileStats = new Map<string, {
      functionCount: number;
      totalComplexity: number;
      highestComplexity: number;
      totalMaintainability: number;
    }>();

    // Calculate summary statistics
    let totalCyclomatic = 0;
    let totalCognitive = 0;
    let totalMaintainability = 0;

    for (const metric of metrics) {
      totalCyclomatic += metric.cyclomaticComplexity;
      totalCognitive += metric.cognitiveComplexity;
      totalMaintainability += metric.maintainabilityIndex;
      
      summary.bySeverity[metric.severity]++;
      
      if (metric.cyclomaticComplexity >= this.config.cyclomaticThreshold ||
          metric.cognitiveComplexity >= this.config.cognitiveThreshold) {
        summary.functionsOverThreshold++;
      }

      // File statistics
      if (!fileStats.has(metric.filePath)) {
        fileStats.set(metric.filePath, {
          functionCount: 0,
          totalComplexity: 0,
          highestComplexity: 0,
          totalMaintainability: 0
        });
      }
      
      const fileData = fileStats.get(metric.filePath)!;
      fileData.functionCount++;
      fileData.totalComplexity += metric.cyclomaticComplexity;
      fileData.highestComplexity = Math.max(fileData.highestComplexity, metric.cyclomaticComplexity);
      fileData.totalMaintainability += metric.maintainabilityIndex;
    }

    summary.averageCyclomaticComplexity = summary.totalFunctions > 0 
      ? Math.round((totalCyclomatic / summary.totalFunctions) * 100) / 100 
      : 0;
    summary.averageCognitiveComplexity = summary.totalFunctions > 0 
      ? Math.round((totalCognitive / summary.totalFunctions) * 100) / 100 
      : 0;
    summary.averageMaintainabilityIndex = summary.totalFunctions > 0 
      ? Math.round((totalMaintainability / summary.totalFunctions) * 100) / 100 
      : 0;

    // Convert file stats to array
    const files = Array.from(fileStats.entries())
      .map(([filePath, stats]) => ({
        filePath,
        functionCount: stats.functionCount,
        averageComplexity: Math.round((stats.totalComplexity / stats.functionCount) * 100) / 100,
        highestComplexity: stats.highestComplexity,
        maintainabilityScore: Math.round((stats.totalMaintainability / stats.functionCount) * 100) / 100
      }))
      .sort((a, b) => b.averageComplexity - a.averageComplexity);

    // Most complex functions
    const mostComplexFunctions = metrics
      .sort((a, b) => b.cyclomaticComplexity - a.cyclomaticComplexity)
      .slice(0, 10);

    // Generate recommendations
    const recommendations = [];
    for (const metric of metrics) {
      if (metric.severity === 'critical' || metric.severity === 'high') {
        let issue = '';
        let recommendation = '';

        if (metric.cyclomaticComplexity >= this.config.cyclomaticThreshold * 2) {
          issue = `Very high cyclomatic complexity (${metric.cyclomaticComplexity})`;
          recommendation = 'Break this function into smaller, more focused functions';
        } else if (metric.cognitiveComplexity >= this.config.cognitiveThreshold * 2) {
          issue = `Very high cognitive complexity (${metric.cognitiveComplexity})`;
          recommendation = 'Simplify the logic flow and reduce nesting levels';
        } else if (metric.maintainabilityIndex < this.config.maintainabilityThreshold) {
          issue = `Low maintainability index (${metric.maintainabilityIndex})`;
          recommendation = 'Refactor to improve readability and reduce complexity';
        } else if (metric.linesOfCode > 50) {
          issue = `Function is too long (${metric.linesOfCode} lines)`;
          recommendation = 'Split into smaller functions with single responsibilities';
        }

        if (issue && recommendation) {
          recommendations.push({
            functionName: metric.functionName,
            filePath: metric.filePath,
            issue,
            recommendation,
            priority: metric.severity
          });
        }
      }
    }

    return {
      summary,
      files,
      mostComplexFunctions,
      recommendations: recommendations.slice(0, 20) // Top 20 recommendations
    };
  }

  async generateHTMLComplexityReport(metrics: CodeComplexityMetric[], outputPath: string): Promise<void> {
    const report = await this.generateComplexityReport(metrics);
    
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Code Complexity Report</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 20px; }
        .header { background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
        .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin: 20px 0; }
        .summary-card { background: white; padding: 15px; border-radius: 8px; border: 1px solid #e9ecef; }
        .summary-card h3 { margin: 0 0 10px 0; font-size: 14px; color: #6c757d; }
        .summary-card .value { font-size: 24px; font-weight: bold; color: #495057; }
        .complexity-item { background: #f8f9fa; padding: 15px; margin: 10px 0; border-radius: 8px; border-left: 4px solid #dee2e6; }
        .complexity-item.critical { border-left-color: #721c24; }
        .complexity-item.high { border-left-color: #dc3545; }
        .complexity-item.medium { border-left-color: #fd7e14; }
        .complexity-item.low { border-left-color: #198754; }
        .function-name { font-weight: bold; font-family: monospace; }
        .metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px; margin: 10px 0; }
        .metric { background: white; padding: 8px; border-radius: 4px; text-align: center; }
        .file-list { background: white; border-radius: 8px; border: 1px solid #e9ecef; }
        .file-item { padding: 15px; border-bottom: 1px solid #e9ecef; }
        .file-item:last-child { border-bottom: none; }
        .recommendation { background: #fff3cd; padding: 10px; border-radius: 4px; margin: 10px 0; border-left: 3px solid #ffc107; }
        .recommendation.critical { background: #f8d7da; border-left-color: #721c24; }
        .recommendation.high { background: #f8d7da; border-left-color: #dc3545; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Code Complexity Report</h1>
        <p>Generated on ${new Date().toLocaleString()}</p>
    </div>

    <div class="summary-grid">
        <div class="summary-card">
            <h3>Total Functions</h3>
            <div class="value">${report.summary.totalFunctions}</div>
        </div>
        <div class="summary-card">
            <h3>Avg Cyclomatic</h3>
            <div class="value">${report.summary.averageCyclomaticComplexity}</div>
        </div>
        <div class="summary-card">
            <h3>Avg Cognitive</h3>
            <div class="value">${report.summary.averageCognitiveComplexity}</div>
        </div>
        <div class="summary-card">
            <h3>Avg Maintainability</h3>
            <div class="value">${report.summary.averageMaintainabilityIndex}</div>
        </div>
        <div class="summary-card">
            <h3>Over Threshold</h3>
            <div class="value" style="color: #dc3545;">${report.summary.functionsOverThreshold}</div>
        </div>
    </div>

    <h2>Most Complex Functions</h2>
    ${report.mostComplexFunctions.slice(0, 10).map(func => `
        <div class="complexity-item ${func.severity}">
            <div class="function-name">${func.functionName}</div>
            <div>File: ${func.filePath}</div>
            <div class="metrics">
                <div class="metric">
                    <strong>${func.cyclomaticComplexity}</strong><br>
                    <small>Cyclomatic</small>
                </div>
                <div class="metric">
                    <strong>${func.cognitiveComplexity}</strong><br>
                    <small>Cognitive</small>
                </div>
                <div class="metric">
                    <strong>${func.linesOfCode}</strong><br>
                    <small>Lines</small>
                </div>
                <div class="metric">
                    <strong>${func.maintainabilityIndex}</strong><br>
                    <small>Maintainability</small>
                </div>
            </div>
        </div>
    `).join('')}

    <h2>Files by Complexity</h2>
    <div class="file-list">
        ${report.files.slice(0, 15).map(file => `
            <div class="file-item">
                <strong>${file.filePath}</strong>
                <div>Functions: ${file.functionCount} | Avg Complexity: ${file.averageComplexity} | Highest: ${file.highestComplexity}</div>
                <div>Maintainability Score: ${file.maintainabilityScore}</div>
            </div>
        `).join('')}
    </div>

    ${report.recommendations.length > 0 ? `
        <h2>Refactoring Recommendations</h2>
        ${report.recommendations.map(rec => `
            <div class="recommendation ${rec.priority}">
                <h4>${rec.functionName} in ${rec.filePath}</h4>
                <p><strong>Issue:</strong> ${rec.issue}</p>
                <p><strong>Recommendation:</strong> ${rec.recommendation}</p>
                <div><small>Priority: ${rec.priority.toUpperCase()}</small></div>
            </div>
        `).join('')}
    ` : ''}
</body>
</html>
    `;

    fs.writeFileSync(outputPath, html, 'utf-8');
    console.log(`Complexity report generated: ${outputPath}`);
  }
}