import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import type { DependencyHealth, SeverityLevel } from '../types.js';

export interface DependencyScannerConfig {
  checkOutdated: boolean;
  checkSecurity: boolean;
  checkLicenses: boolean;
  excludePackages: string[];
  allowedLicenses: string[];
  deprecationCheckDays: number;
}

export const DEFAULT_DEPENDENCY_CONFIG: DependencyScannerConfig = {
  checkOutdated: true,
  checkSecurity: true,
  checkLicenses: true,
  excludePackages: [],
  allowedLicenses: [
    'MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 
    'CC0-1.0', 'Unlicense', 'WTFPL'
  ],
  deprecationCheckDays: 365
};

interface PackageInfo {
  name: string;
  version: string;
  description?: string;
  license?: string;
  homepage?: string;
  repository?: any;
  dependencies?: Record<string, string>;
  deprecated?: boolean | string;
  time?: Record<string, string>;
}

interface OutdatedPackage {
  package: string;
  current: string;
  wanted: string;
  latest: string;
  location: string;
  type: string;
}

export class DependencyScanner {
  private config: DependencyScannerConfig;

  constructor(config: Partial<DependencyScannerConfig> = {}) {
    this.config = { ...DEFAULT_DEPENDENCY_CONFIG, ...config };
  }

  async scanProject(projectPath: string): Promise<DependencyHealth[]> {
    const healthMetrics: DependencyHealth[] = [];

    try {
      console.log('Scanning project dependencies...');
      
      // Get package.json
      const packageJsonPath = path.join(projectPath, 'package.json');
      if (!fs.existsSync(packageJsonPath)) {
        console.warn(`No package.json found in ${projectPath}`);
        return healthMetrics;
      }

      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      const allDependencies = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies,
        ...packageJson.optionalDependencies,
        ...packageJson.peerDependencies
      };

      // Get outdated packages
      const outdatedPackages = this.config.checkOutdated 
        ? await this.getOutdatedPackages(projectPath)
        : new Map();

      // Analyze each dependency
      for (const [packageName, version] of Object.entries(allDependencies)) {
        if (this.config.excludePackages.includes(packageName)) {
          continue;
        }

        const health = await this.analyzeDependency(
          packageName,
          version as string,
          outdatedPackages.get(packageName),
          projectPath
        );
        
        if (health) {
          healthMetrics.push(health);
        }
      }

      console.log(`Analyzed ${healthMetrics.length} dependencies`);
      return healthMetrics;

    } catch (error) {
      console.error('Dependency scan failed:', error);
      return healthMetrics;
    }
  }

  private async getOutdatedPackages(projectPath: string): Promise<Map<string, OutdatedPackage>> {
    const outdatedMap = new Map<string, OutdatedPackage>();

    try {
      const result = execFileSync('npm', ['outdated', '--json'], {
        cwd: projectPath,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
      });

      const outdatedData = JSON.parse(result);
      for (const [packageName, info] of Object.entries(outdatedData)) {
        outdatedMap.set(packageName, info as OutdatedPackage);
      }
    } catch (error: any) {
      // npm outdated returns non-zero exit code when packages are outdated
      if (error.stdout) {
        try {
          const outdatedData = JSON.parse(error.stdout);
          for (const [packageName, info] of Object.entries(outdatedData)) {
            outdatedMap.set(packageName, info as OutdatedPackage);
          }
        } catch (parseError) {
          console.warn('Failed to parse npm outdated output:', parseError);
        }
      }
    }

    return outdatedMap;
  }

  private async analyzeDependency(
    packageName: string,
    version: string,
    outdatedInfo?: OutdatedPackage,
    projectPath?: string
  ): Promise<DependencyHealth | null> {
    try {
      // Get package info from npm registry
      const packageInfo = await this.getPackageInfo(packageName);
      if (!packageInfo) {
        return null;
      }

      const isOutdated = !!outdatedInfo;
      const latestVersion = outdatedInfo?.latest || packageInfo.version;
      const currentVersion = version.replace(/[\^~]/, ''); // Remove semver prefixes

      // Check license compliance
      const licenseCompliance = this.config.checkLicenses 
        ? this.checkLicenseCompliance(packageInfo.license)
        : true;

      // Determine maintenance status
      const maintenanceStatus = this.determineMaintenanceStatus(packageInfo);

      // Count security vulnerabilities (simplified - would need npm audit integration)
      const securityVulnerabilities = 0; // Would be populated by security scanner

      // Calculate health score
      const healthScore = this.calculateHealthScore({
        isOutdated,
        licenseCompliance,
        maintenanceStatus,
        securityVulnerabilities,
        isDeprecated: !!packageInfo.deprecated
      });

      return {
        id: '', // Will be set by database
        packageName,
        currentVersion,
        latestVersion,
        isOutdated,
        securityVulnerabilities,
        licenseCompliance,
        maintenanceStatus,
        lastUpdated: this.getLastUpdatedDate(packageInfo),
        healthScore,
        checkedAt: new Date().toISOString()
      };

    } catch (error) {
      console.warn(`Failed to analyze dependency ${packageName}:`, error);
      return null;
    }
  }

  private async getPackageInfo(packageName: string): Promise<PackageInfo | null> {
    try {
      const result = execFileSync('npm', ['view', packageName, '--json'], {
        encoding: 'utf-8',
        timeout: 30000
      });

      return JSON.parse(result) as PackageInfo;
    } catch (error) {
      console.warn(`Failed to get package info for ${packageName}:`, error);
      return null;
    }
  }

  private checkLicenseCompliance(license?: string): boolean {
    if (!license) {
      return false; // No license is concerning
    }

    // Handle SPDX license expressions
    const licenseString = typeof license === 'string' ? license : license;
    
    // Check if any allowed license is present
    return this.config.allowedLicenses.some(allowedLicense => 
      licenseString.includes(allowedLicense)
    );
  }

  private determineMaintenanceStatus(packageInfo: PackageInfo): 'active' | 'deprecated' | 'abandoned' {
    if (packageInfo.deprecated) {
      return 'deprecated';
    }

    // Check last update time
    if (packageInfo.time) {
      const versions = Object.keys(packageInfo.time).filter(v => v !== 'created' && v !== 'modified');
      if (versions.length > 0) {
        const latestVersionTime = packageInfo.time[versions[versions.length - 1]];
        const lastUpdateDate = new Date(latestVersionTime);
        const daysSinceUpdate = (Date.now() - lastUpdateDate.getTime()) / (1000 * 60 * 60 * 24);
        
        if (daysSinceUpdate > this.config.deprecationCheckDays * 2) {
          return 'abandoned';
        } else if (daysSinceUpdate > this.config.deprecationCheckDays) {
          return 'deprecated';
        }
      }
    }

    return 'active';
  }

  private getLastUpdatedDate(packageInfo: PackageInfo): string {
    if (packageInfo.time) {
      const versions = Object.keys(packageInfo.time).filter(v => v !== 'created' && v !== 'modified');
      if (versions.length > 0) {
        return packageInfo.time[versions[versions.length - 1]];
      }
    }

    return new Date().toISOString(); // Fallback
  }

  private calculateHealthScore(factors: {
    isOutdated: boolean;
    licenseCompliance: boolean;
    maintenanceStatus: 'active' | 'deprecated' | 'abandoned';
    securityVulnerabilities: number;
    isDeprecated: boolean;
  }): number {
    let score = 100;

    // Deduct points for various issues
    if (factors.isOutdated) score -= 20;
    if (!factors.licenseCompliance) score -= 30;
    if (factors.isDeprecated) score -= 40;
    if (factors.securityVulnerabilities > 0) score -= factors.securityVulnerabilities * 15;

    switch (factors.maintenanceStatus) {
      case 'deprecated':
        score -= 25;
        break;
      case 'abandoned':
        score -= 50;
        break;
    }

    return Math.max(0, Math.min(100, score));
  }

  async generateDependencyReport(dependencies: DependencyHealth[]): Promise<{
    summary: {
      totalDependencies: number;
      outdatedDependencies: number;
      securityIssues: number;
      licenseIssues: number;
      deprecatedPackages: number;
      averageHealthScore: number;
    };
    riskAnalysis: {
      highRisk: DependencyHealth[];
      mediumRisk: DependencyHealth[];
      lowRisk: DependencyHealth[];
    };
    recommendations: Array<{
      packageName: string;
      currentIssue: string;
      recommendation: string;
      priority: SeverityLevel;
      estimatedEffort: string;
    }>;
    licenseBreakdown: Record<string, number>;
  }> {
    const summary = {
      totalDependencies: dependencies.length,
      outdatedDependencies: dependencies.filter(d => d.isOutdated).length,
      securityIssues: dependencies.reduce((sum, d) => sum + d.securityVulnerabilities, 0),
      licenseIssues: dependencies.filter(d => !d.licenseCompliance).length,
      deprecatedPackages: dependencies.filter(d => d.maintenanceStatus !== 'active').length,
      averageHealthScore: 0
    };

    if (dependencies.length > 0) {
      summary.averageHealthScore = Math.round(
        dependencies.reduce((sum, d) => sum + d.healthScore, 0) / dependencies.length
      );
    }

    // Risk analysis
    const riskAnalysis = {
      highRisk: dependencies.filter(d => d.healthScore < 50),
      mediumRisk: dependencies.filter(d => d.healthScore >= 50 && d.healthScore < 80),
      lowRisk: dependencies.filter(d => d.healthScore >= 80)
    };

    // Generate recommendations
    const recommendations = [];
    for (const dep of dependencies) {
      if (dep.healthScore < 80) {
        let issue = '';
        let recommendation = '';
        let priority: SeverityLevel = 'medium';
        let effort = 'Low';

        if (dep.securityVulnerabilities > 0) {
          issue = `${dep.securityVulnerabilities} security vulnerabilities`;
          recommendation = 'Update to a secure version immediately';
          priority = 'critical';
          effort = 'Medium';
        } else if (dep.maintenanceStatus === 'abandoned') {
          issue = 'Package appears to be abandoned';
          recommendation = 'Find an actively maintained alternative';
          priority = 'high';
          effort = 'High';
        } else if (dep.maintenanceStatus === 'deprecated') {
          issue = 'Package is deprecated';
          recommendation = 'Plan migration to a supported alternative';
          priority = 'medium';
          effort = 'Medium';
        } else if (!dep.licenseCompliance) {
          issue = 'License may not be compatible';
          recommendation = 'Review license terms or find alternative';
          priority = 'medium';
          effort = 'Low';
        } else if (dep.isOutdated) {
          issue = 'Package version is outdated';
          recommendation = 'Update to latest version';
          priority = 'low';
          effort = 'Low';
        }

        if (issue && recommendation) {
          recommendations.push({
            packageName: dep.packageName,
            currentIssue: issue,
            recommendation,
            priority,
            estimatedEffort: effort
          });
        }
      }
    }

    // License breakdown
    const licenseBreakdown: Record<string, number> = {};
    // This would require additional license detection logic

    return {
      summary,
      riskAnalysis,
      recommendations: recommendations.slice(0, 20), // Top 20 recommendations
      licenseBreakdown
    };
  }

  async generateHTMLDependencyReport(dependencies: DependencyHealth[], outputPath: string): Promise<void> {
    const report = await this.generateDependencyReport(dependencies);
    
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Dependency Health Report</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 20px; }
        .header { background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
        .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin: 20px 0; }
        .summary-card { background: white; padding: 15px; border-radius: 8px; border: 1px solid #e9ecef; }
        .summary-card h3 { margin: 0 0 10px 0; font-size: 14px; color: #6c757d; }
        .summary-card .value { font-size: 24px; font-weight: bold; color: #495057; }
        .dependency-item { background: #f8f9fa; padding: 15px; margin: 10px 0; border-radius: 8px; border-left: 4px solid #dee2e6; }
        .dependency-item.high-risk { border-left-color: #dc3545; }
        .dependency-item.medium-risk { border-left-color: #fd7e14; }
        .dependency-item.low-risk { border-left-color: #198754; }
        .health-score { display: inline-block; padding: 4px 8px; border-radius: 4px; color: white; font-weight: bold; }
        .health-score.high { background: #198754; }
        .health-score.medium { background: #fd7e14; }
        .health-score.low { background: #dc3545; }
        .package-name { font-weight: bold; font-family: monospace; }
        .version { color: #6c757d; }
        .status-badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 12px; margin: 2px; }
        .status-outdated { background: #fff3cd; color: #856404; }
        .status-deprecated { background: #f8d7da; color: #721c24; }
        .status-security { background: #f8d7da; color: #721c24; }
        .status-license { background: #f8d7da; color: #721c24; }
        .recommendation { background: #e7f3ff; padding: 10px; border-radius: 4px; margin: 10px 0; border-left: 3px solid #0066cc; }
        .recommendation.critical { background: #f8d7da; border-left-color: #721c24; }
        .recommendation.high { background: #f8d7da; border-left-color: #dc3545; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Dependency Health Report</h1>
        <p>Generated on ${new Date().toLocaleString()}</p>
    </div>

    <div class="summary-grid">
        <div class="summary-card">
            <h3>Total Dependencies</h3>
            <div class="value">${report.summary.totalDependencies}</div>
        </div>
        <div class="summary-card">
            <h3>Average Health Score</h3>
            <div class="value">${report.summary.averageHealthScore}</div>
        </div>
        <div class="summary-card">
            <h3>Outdated</h3>
            <div class="value" style="color: #fd7e14;">${report.summary.outdatedDependencies}</div>
        </div>
        <div class="summary-card">
            <h3>Security Issues</h3>
            <div class="value" style="color: #dc3545;">${report.summary.securityIssues}</div>
        </div>
        <div class="summary-card">
            <h3>License Issues</h3>
            <div class="value" style="color: #dc3545;">${report.summary.licenseIssues}</div>
        </div>
        <div class="summary-card">
            <h3>Deprecated</h3>
            <div class="value" style="color: #dc3545;">${report.summary.deprecatedPackages}</div>
        </div>
    </div>

    ${report.riskAnalysis.highRisk.length > 0 ? `
        <h2>High Risk Dependencies (${report.riskAnalysis.highRisk.length})</h2>
        ${report.riskAnalysis.highRisk.map(dep => `
            <div class="dependency-item high-risk">
                <div>
                    <span class="package-name">${dep.packageName}</span>
                    <span class="version">${dep.currentVersion} → ${dep.latestVersion}</span>
                    <span class="health-score low">${dep.healthScore}</span>
                </div>
                <div>
                    ${dep.isOutdated ? '<span class="status-badge status-outdated">Outdated</span>' : ''}
                    ${dep.securityVulnerabilities > 0 ? `<span class="status-badge status-security">${dep.securityVulnerabilities} Security Issues</span>` : ''}
                    ${!dep.licenseCompliance ? '<span class="status-badge status-license">License Issue</span>' : ''}
                    ${dep.maintenanceStatus !== 'active' ? `<span class="status-badge status-deprecated">${dep.maintenanceStatus}</span>` : ''}
                </div>
                <div><small>Last updated: ${new Date(dep.lastUpdated).toLocaleDateString()}</small></div>
            </div>
        `).join('')}
    ` : ''}

    ${report.riskAnalysis.mediumRisk.length > 0 ? `
        <h2>Medium Risk Dependencies (${report.riskAnalysis.mediumRisk.length})</h2>
        ${report.riskAnalysis.mediumRisk.slice(0, 10).map(dep => `
            <div class="dependency-item medium-risk">
                <div>
                    <span class="package-name">${dep.packageName}</span>
                    <span class="version">${dep.currentVersion} → ${dep.latestVersion}</span>
                    <span class="health-score medium">${dep.healthScore}</span>
                </div>
                <div>
                    ${dep.isOutdated ? '<span class="status-badge status-outdated">Outdated</span>' : ''}
                    ${dep.securityVulnerabilities > 0 ? `<span class="status-badge status-security">${dep.securityVulnerabilities} Security Issues</span>` : ''}
                    ${!dep.licenseCompliance ? '<span class="status-badge status-license">License Issue</span>' : ''}
                    ${dep.maintenanceStatus !== 'active' ? `<span class="status-badge status-deprecated">${dep.maintenanceStatus}</span>` : ''}
                </div>
                <div><small>Last updated: ${new Date(dep.lastUpdated).toLocaleDateString()}</small></div>
            </div>
        `).join('')}
    ` : ''}

    ${report.recommendations.length > 0 ? `
        <h2>Recommendations</h2>
        ${report.recommendations.map(rec => `
            <div class="recommendation ${rec.priority}">
                <h4>${rec.packageName}</h4>
                <p><strong>Issue:</strong> ${rec.currentIssue}</p>
                <p><strong>Recommendation:</strong> ${rec.recommendation}</p>
                <div><small>Priority: ${rec.priority.toUpperCase()} | Estimated Effort: ${rec.estimatedEffort}</small></div>
            </div>
        `).join('')}
    ` : ''}

    <details>
        <summary><h2>All Dependencies (${dependencies.length})</h2></summary>
        ${dependencies.map(dep => `
            <div class="dependency-item ${dep.healthScore >= 80 ? 'low-risk' : dep.healthScore >= 50 ? 'medium-risk' : 'high-risk'}">
                <div>
                    <span class="package-name">${dep.packageName}</span>
                    <span class="version">${dep.currentVersion}</span>
                    <span class="health-score ${dep.healthScore >= 80 ? 'high' : dep.healthScore >= 50 ? 'medium' : 'low'}">${dep.healthScore}</span>
                </div>
            </div>
        `).join('')}
    </details>
</body>
</html>
    `;

    fs.writeFileSync(outputPath, html, 'utf-8');
    console.log(`Dependency report generated: ${outputPath}`);
  }
}