/**
 * License Analyzer Service
 * 
 * Comprehensive license analysis service that detects, analyzes, and validates
 * software licenses for compliance checking. Integrates with SPDX license
 * database and provides compatibility analysis between different licenses.
 */

import axios from 'axios';
import { DatabaseManager } from '../../../utils/database.js';
import type {
  LicenseInfo,
  LicenseAnalysisResult,
  CopyleftScope,
  RiskLevel,
  SupportedLanguage
} from '../../../shared/types/codebase.js';

export interface ComplianceConfig {
  spdxApiUrl?: string;
  allowedLicenses?: string[]; // SPDX license identifiers
  prohibitedLicenses?: string[]; // SPDX license identifiers
  copyleftPolicy?: 'strict' | 'permissive' | 'none';
  commercialUseRequired?: boolean;
  attributionRequired?: boolean;
  cacheTimeout?: number; // in milliseconds
}

export interface DependencyInfo {
  name: string;
  version: string;
  language: SupportedLanguage;
  licenseText?: string;
  licenseFile?: string;
}

export interface CompatibilityMatrix {
  compatible: boolean;
  issues: CompatibilityIssue[];
  recommendations: string[];
}

export interface CompatibilityIssue {
  license1: string;
  license2: string;
  conflictType: 'copyleft' | 'attribution' | 'commercial' | 'distribution';
  severity: RiskLevel;
  description: string;
  resolution?: string;
}

export interface CompliancePolicy {
  allowedLicenses: string[];
  prohibitedLicenses: string[];
  requireAttribution: boolean;
  allowCopyleft: boolean;
  allowCommercialUse: boolean;
  allowPatentUse: boolean;
}

export interface ComplianceResult {
  compliant: boolean;
  violations: ComplianceViolation[];
  warnings: ComplianceWarning[];
  recommendations: string[];
  overallRisk: RiskLevel;
}

export interface ComplianceViolation {
  packageName: string;
  licenseId: string;
  violationType: string;
  severity: RiskLevel;
  description: string;
  resolution: string;
}

export interface ComplianceWarning {
  packageName: string;
  licenseId: string;
  warningType: string;
  description: string;
  recommendation: string;
}

export interface NormalizedLicense {
  spdxId: string;
  name: string;
  text: string;
  confidence: number;
}

export interface LicenseReport {
  repositoryId: string;
  licenses: LicenseInfo[];
  compatibility: CompatibilityMatrix;
  compliance: ComplianceResult;
  summary: {
    totalPackages: number;
    licensedPackages: number;
    unlicensedPackages: number;
    riskBreakdown: Record<RiskLevel, number>;
    copyleftPackages: number;
  };
  generatedAt: Date;
}

export class LicenseAnalyzer {
  private readonly config: Required<ComplianceConfig>;
  private readonly licenseCache = new Map<string, { data: any; timestamp: number }>();
  private readonly spdxLicenses = new Map<string, any>();

  constructor(
    private db: DatabaseManager,
    config: ComplianceConfig = {}
  ) {
    this.config = {
      spdxApiUrl: config.spdxApiUrl || 'https://api.spdx.org',
      allowedLicenses: config.allowedLicenses || [],
      prohibitedLicenses: config.prohibitedLicenses || [],
      copyleftPolicy: config.copyleftPolicy || 'permissive',
      commercialUseRequired: config.commercialUseRequired || false,
      attributionRequired: config.attributionRequired || true,
      cacheTimeout: config.cacheTimeout || 86400000 // 24 hours
    };

    this.initializeSPDXLicenses();
  }

  /**
   * Detect license from package metadata and files
   */
  async detectLicense(packageName: string, version: string): Promise<LicenseInfo> {
    const cacheKey = `license-${packageName}-${version}`;
    
    // Check cache first
    const cached = this.licenseCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.config.cacheTimeout) {
      return cached.data;
    }

    try {
      // First try to get license from package registry
      const registryLicense = await this.getLicenseFromRegistry(packageName, version);
      if (registryLicense) {
        const licenseInfo = await this.normalizeLicenseInfo(registryLicense, packageName);
        this.licenseCache.set(cacheKey, { data: licenseInfo, timestamp: Date.now() });
        return licenseInfo;
      }

      // Fallback to license text analysis if available
      const textLicense = await this.analyzeLicenseText(packageName, version);
      if (textLicense) {
        this.licenseCache.set(cacheKey, { data: textLicense, timestamp: Date.now() });
        return textLicense;
      }

      // Return unknown license info
      const unknownLicense: LicenseInfo = {
        id: crypto.randomUUID(),
        name: 'Unknown',
        spdxId: undefined,
        osiApproved: false,
        fsfApproved: false,
        commercialUseAllowed: undefined,
        attributionRequired: undefined,
        copyleftScope: CopyleftScope.NONE,
        riskLevel: RiskLevel.UNKNOWN
      };

      this.licenseCache.set(cacheKey, { data: unknownLicense, timestamp: Date.now() });
      return unknownLicense;

    } catch (error) {
      console.error(`Error detecting license for ${packageName}@${version}:`, error);
      throw error;
    }
  }

  /**
   * Analyze license compatibility between multiple licenses
   */
  async analyzeLicenseCompatibility(licenses: LicenseInfo[]): Promise<CompatibilityMatrix> {
    const issues: CompatibilityIssue[] = [];
    const recommendations: string[] = [];

    // Check for copyleft conflicts
    const copyleftLicenses = licenses.filter(l => 
      l.copyleftScope === CopyleftScope.STRONG || l.copyleftScope === CopyleftScope.NETWORK
    );
    
    if (copyleftLicenses.length > 0) {
      const nonCopyleftLicenses = licenses.filter(l => l.copyleftScope === CopyleftScope.NONE);
      
      for (const copyleft of copyleftLicenses) {
        for (const nonCopyleft of nonCopyleftLicenses) {
          issues.push({
            license1: copyleft.spdxId || copyleft.name,
            license2: nonCopyleft.spdxId || nonCopyleft.name,
            conflictType: 'copyleft',
            severity: RiskLevel.HIGH,
            description: `Strong copyleft license ${copyleft.name} may require entire work to be licensed under same terms`,
            resolution: 'Consider replacing copyleft dependency or ensure compliance with copyleft terms'
          });
        }
      }
    }

    // Check for attribution conflicts
    const attributionRequired = licenses.filter(l => l.attributionRequired === true);
    if (attributionRequired.length > 0) {
      recommendations.push(
        `Attribution required for ${attributionRequired.length} licenses. Ensure proper attribution in documentation.`
      );
    }

    // Check for commercial use restrictions
    const commercialRestricted = licenses.filter(l => l.commercialUseAllowed === false);
    if (commercialRestricted.length > 0 && this.config.commercialUseRequired) {
      for (const restricted of commercialRestricted) {
        issues.push({
          license1: restricted.spdxId || restricted.name,
          license2: 'Commercial Policy',
          conflictType: 'commercial',
          severity: RiskLevel.CRITICAL,
          description: `License ${restricted.name} prohibits commercial use`,
          resolution: 'Replace dependency or negotiate commercial license'
        });
      }
    }

    // Check for license compatibility rules
    await this.checkSpecificCompatibilityRules(licenses, issues);

    return {
      compatible: issues.filter(i => i.severity === RiskLevel.CRITICAL || i.severity === RiskLevel.HIGH).length === 0,
      issues,
      recommendations
    };
  }

  /**
   * Validate compliance against a specific policy
   */
  async validateCompliance(dependencies: DependencyInfo[], policy: CompliancePolicy): Promise<ComplianceResult> {
    const violations: ComplianceViolation[] = [];
    const warnings: ComplianceWarning[] = [];
    const recommendations: string[] = [];

    for (const dep of dependencies) {
      try {
        const licenseInfo = await this.detectLicense(dep.name, dep.version);

        // Check against prohibited licenses
        if (licenseInfo.spdxId && policy.prohibitedLicenses.includes(licenseInfo.spdxId)) {
          violations.push({
            packageName: dep.name,
            licenseId: licenseInfo.spdxId,
            violationType: 'prohibited_license',
            severity: RiskLevel.CRITICAL,
            description: `Package uses prohibited license: ${licenseInfo.name}`,
            resolution: 'Replace dependency with alternative having compatible license'
          });
        }

        // Check if license is in allowed list (if specified)
        if (policy.allowedLicenses.length > 0 && licenseInfo.spdxId && 
            !policy.allowedLicenses.includes(licenseInfo.spdxId)) {
          violations.push({
            packageName: dep.name,
            licenseId: licenseInfo.spdxId || 'unknown',
            violationType: 'not_allowed_license',
            severity: RiskLevel.HIGH,
            description: `Package license not in allowed list: ${licenseInfo.name}`,
            resolution: 'Get approval for license or replace dependency'
          });
        }

        // Check copyleft policy
        if (!policy.allowCopyleft && 
            (licenseInfo.copyleftScope === CopyleftScope.STRONG || 
             licenseInfo.copyleftScope === CopyleftScope.NETWORK)) {
          violations.push({
            packageName: dep.name,
            licenseId: licenseInfo.spdxId || 'unknown',
            violationType: 'copyleft_violation',
            severity: RiskLevel.HIGH,
            description: `Package has copyleft license which violates policy: ${licenseInfo.name}`,
            resolution: 'Replace with permissively licensed alternative'
          });
        }

        // Check commercial use requirement
        if (policy.allowCommercialUse && licenseInfo.commercialUseAllowed === false) {
          violations.push({
            packageName: dep.name,
            licenseId: licenseInfo.spdxId || 'unknown',
            violationType: 'commercial_restriction',
            severity: RiskLevel.CRITICAL,
            description: `Package license restricts commercial use: ${licenseInfo.name}`,
            resolution: 'Replace dependency or negotiate commercial license'
          });
        }

        // Check attribution requirements
        if (policy.requireAttribution && licenseInfo.attributionRequired === true) {
          warnings.push({
            packageName: dep.name,
            licenseId: licenseInfo.spdxId || 'unknown',
            warningType: 'attribution_required',
            description: `Package requires attribution: ${licenseInfo.name}`,
            recommendation: 'Include proper attribution in product documentation'
          });
        }

        // Warn about unknown licenses
        if (licenseInfo.riskLevel === RiskLevel.UNKNOWN) {
          warnings.push({
            packageName: dep.name,
            licenseId: 'unknown',
            warningType: 'unknown_license',
            description: 'Package license could not be determined',
            recommendation: 'Manually review package license terms'
          });
        }

      } catch (error) {
        warnings.push({
          packageName: dep.name,
          licenseId: 'error',
          warningType: 'analysis_error',
          description: `Failed to analyze license: ${error instanceof Error ? error.message : 'Unknown error'}`,
          recommendation: 'Manually review package license'
        });
      }
    }

    // Generate recommendations based on violations and warnings
    if (violations.length > 0) {
      recommendations.push(`Found ${violations.length} license violations that must be resolved`);
    }
    if (warnings.length > 0) {
      recommendations.push(`Found ${warnings.length} license warnings that should be reviewed`);
    }

    // Calculate overall risk
    const overallRisk = this.calculateOverallRisk(violations, warnings);

    return {
      compliant: violations.filter(v => v.severity === RiskLevel.CRITICAL).length === 0,
      violations,
      warnings,
      recommendations,
      overallRisk
    };
  }

  /**
   * Update license database with latest SPDX data
   */
  async updateLicenseDatabase(): Promise<void> {
    try {
      console.log('Updating SPDX license database...');
      
      // Fetch latest SPDX license list
      const response = await axios.get('https://raw.githubusercontent.com/spdx/license-list-data/main/json/licenses.json');
      const licenses = response.data.licenses;

      // Update local cache
      this.spdxLicenses.clear();
      for (const license of licenses) {
        this.spdxLicenses.set(license.licenseId, license);
      }

      console.log(`Updated ${licenses.length} SPDX licenses`);
    } catch (error) {
      console.error('Error updating license database:', error);
      throw error;
    }
  }

  /**
   * Normalize license text and identify SPDX license
   */
  async normalizeLicense(licenseText: string): Promise<NormalizedLicense | null> {
    try {
      // Simple text matching for common licenses
      const normalizedText = this.normalizeText(licenseText);
      
      // Check against SPDX license texts
      for (const [spdxId, licenseData] of this.spdxLicenses) {
        if (licenseData.licenseText) {
          const normalizedSpdxText = this.normalizeText(licenseData.licenseText);
          const similarity = this.calculateTextSimilarity(normalizedText, normalizedSpdxText);
          
          if (similarity > 0.8) {
            return {
              spdxId,
              name: licenseData.name,
              text: licenseText,
              confidence: similarity
            };
          }
        }
      }

      return null;
    } catch (error) {
      console.error('Error normalizing license:', error);
      return null;
    }
  }

  /**
   * Get SPDX identifier from license text
   */
  async getSPDXIdentifier(licenseText: string): Promise<string | null> {
    const normalized = await this.normalizeLicense(licenseText);
    return normalized?.spdxId || null;
  }

  /**
   * Generate comprehensive license report
   */
  async generateLicenseReport(repositoryId: string): Promise<LicenseReport> {
    try {
      // Get all dependencies for repository
      const dependencies = await this.getRepositoryDependencies(repositoryId);
      
      // Analyze licenses for all dependencies
      const licensePromises = dependencies.map(dep => this.detectLicense(dep.name, dep.version));
      const licenses = await Promise.all(licensePromises);

      // Analyze compatibility
      const compatibility = await this.analyzeLicenseCompatibility(licenses);

      // Create default policy for compliance check
      const defaultPolicy: CompliancePolicy = {
        allowedLicenses: this.config.allowedLicenses,
        prohibitedLicenses: this.config.prohibitedLicenses,
        requireAttribution: this.config.attributionRequired,
        allowCopyleft: this.config.copyleftPolicy !== 'none',
        allowCommercialUse: this.config.commercialUseRequired,
        allowPatentUse: true
      };

      const compliance = await this.validateCompliance(dependencies, defaultPolicy);

      // Generate summary
      const summary = {
        totalPackages: dependencies.length,
        licensedPackages: licenses.filter(l => l.spdxId || l.name !== 'Unknown').length,
        unlicensedPackages: licenses.filter(l => l.name === 'Unknown').length,
        riskBreakdown: this.calculateRiskBreakdown(licenses),
        copyleftPackages: licenses.filter(l => 
          l.copyleftScope === CopyleftScope.STRONG || l.copyleftScope === CopyleftScope.NETWORK
        ).length
      };

      const report: LicenseReport = {
        repositoryId,
        licenses,
        compatibility,
        compliance,
        summary,
        generatedAt: new Date()
      };

      // Store report in database
      await this.storeLicenseReport(report);

      return report;
    } catch (error) {
      console.error(`Error generating license report for ${repositoryId}:`, error);
      throw error;
    }
  }

  // Private helper methods

  private async initializeSPDXLicenses(): Promise<void> {
    try {
      // Initialize with common licenses if SPDX data not available
      const commonLicenses = [
        { licenseId: 'MIT', name: 'MIT License', osiApproved: true, copyleft: false },
        { licenseId: 'Apache-2.0', name: 'Apache License 2.0', osiApproved: true, copyleft: false },
        { licenseId: 'GPL-3.0-only', name: 'GNU General Public License v3.0 only', osiApproved: true, copyleft: true },
        { licenseId: 'BSD-3-Clause', name: 'BSD 3-Clause License', osiApproved: true, copyleft: false },
        { licenseId: 'ISC', name: 'ISC License', osiApproved: true, copyleft: false }
      ];

      for (const license of commonLicenses) {
        this.spdxLicenses.set(license.licenseId, license);
      }
    } catch (error) {
      console.error('Error initializing SPDX licenses:', error);
    }
  }

  private async getLicenseFromRegistry(packageName: string, version: string): Promise<string | null> {
    try {
      // Try npm registry first
      if (packageName.startsWith('@') || !packageName.includes('/')) {
        const response = await axios.get(`https://registry.npmjs.org/${packageName}/${version}`);
        return response.data.license || null;
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  private async analyzeLicenseText(packageName: string, version: string): Promise<LicenseInfo | null> {
    // This would analyze license text from package files
    // Implementation would depend on having access to package source
    return null;
  }

  private async normalizeLicenseInfo(licenseString: string, packageName: string): Promise<LicenseInfo> {
    const spdxLicense = this.spdxLicenses.get(licenseString);
    
    if (spdxLicense) {
      return {
        id: crypto.randomUUID(),
        name: spdxLicense.name,
        spdxId: licenseString,
        osiApproved: spdxLicense.osiApproved || false,
        fsfApproved: spdxLicense.fsfApproved || false,
        commercialUseAllowed: this.determineCommercialUse(licenseString),
        attributionRequired: this.determineAttributionRequired(licenseString),
        copyleftScope: this.determineCopyleftScope(licenseString),
        riskLevel: this.assessLicenseRisk(licenseString)
      };
    }

    // Handle non-SPDX license strings
    return {
      id: crypto.randomUUID(),
      name: licenseString,
      spdxId: undefined,
      osiApproved: false,
      fsfApproved: false,
      commercialUseAllowed: undefined,
      attributionRequired: undefined,
      copyleftScope: CopyleftScope.NONE,
      riskLevel: RiskLevel.UNKNOWN
    };
  }

  private async checkSpecificCompatibilityRules(licenses: LicenseInfo[], issues: CompatibilityIssue[]): Promise<void> {
    // Check for specific incompatible license combinations
    const licenseIds = licenses.map(l => l.spdxId).filter(Boolean);
    
    // GPL and proprietary conflicts
    if (licenseIds.includes('GPL-3.0-only') && licenseIds.includes('Proprietary')) {
      issues.push({
        license1: 'GPL-3.0-only',
        license2: 'Proprietary',
        conflictType: 'copyleft',
        severity: RiskLevel.CRITICAL,
        description: 'GPL license is incompatible with proprietary code',
        resolution: 'Remove GPL dependency or make entire project GPL'
      });
    }

    // Add more specific compatibility rules as needed
  }

  private determineCommercialUse(licenseId: string): boolean | undefined {
    const commercialFriendly = ['MIT', 'Apache-2.0', 'BSD-3-Clause', 'BSD-2-Clause', 'ISC'];
    const commercialRestricted = ['CC-BY-NC-4.0', 'CC-BY-NC-SA-4.0'];
    
    if (commercialFriendly.includes(licenseId)) return true;
    if (commercialRestricted.includes(licenseId)) return false;
    return undefined;
  }

  private determineAttributionRequired(licenseId: string): boolean | undefined {
    const attributionRequired = ['MIT', 'Apache-2.0', 'BSD-3-Clause', 'BSD-2-Clause'];
    const noAttribution = ['Unlicense', 'CC0-1.0'];
    
    if (attributionRequired.includes(licenseId)) return true;
    if (noAttribution.includes(licenseId)) return false;
    return undefined;
  }

  private determineCopyleftScope(licenseId: string): CopyleftScope {
    const strongCopyleft = ['GPL-3.0-only', 'GPL-2.0-only', 'AGPL-3.0-only'];
    const weakCopyleft = ['LGPL-3.0-only', 'LGPL-2.1-only', 'MPL-2.0'];
    const networkCopyleft = ['AGPL-3.0-only'];
    
    if (networkCopyleft.includes(licenseId)) return CopyleftScope.NETWORK;
    if (strongCopyleft.includes(licenseId)) return CopyleftScope.STRONG;
    if (weakCopyleft.includes(licenseId)) return CopyleftScope.WEAK;
    return CopyleftScope.NONE;
  }

  private assessLicenseRisk(licenseId: string): RiskLevel {
    const lowRisk = ['MIT', 'Apache-2.0', 'BSD-3-Clause', 'BSD-2-Clause', 'ISC'];
    const mediumRisk = ['LGPL-3.0-only', 'LGPL-2.1-only', 'MPL-2.0'];
    const highRisk = ['GPL-3.0-only', 'GPL-2.0-only'];
    const criticalRisk = ['AGPL-3.0-only'];
    
    if (lowRisk.includes(licenseId)) return RiskLevel.LOW;
    if (mediumRisk.includes(licenseId)) return RiskLevel.MEDIUM;
    if (highRisk.includes(licenseId)) return RiskLevel.HIGH;
    if (criticalRisk.includes(licenseId)) return RiskLevel.CRITICAL;
    return RiskLevel.UNKNOWN;
  }

  private calculateOverallRisk(violations: ComplianceViolation[], warnings: ComplianceWarning[]): RiskLevel {
    const criticalViolations = violations.filter(v => v.severity === RiskLevel.CRITICAL);
    const highViolations = violations.filter(v => v.severity === RiskLevel.HIGH);
    
    if (criticalViolations.length > 0) return RiskLevel.CRITICAL;
    if (highViolations.length > 0) return RiskLevel.HIGH;
    if (violations.length > 0) return RiskLevel.MEDIUM;
    if (warnings.length > 0) return RiskLevel.LOW;
    return RiskLevel.LOW;
  }

  private calculateRiskBreakdown(licenses: LicenseInfo[]): Record<RiskLevel, number> {
    const breakdown: Record<RiskLevel, number> = {
      [RiskLevel.LOW]: 0,
      [RiskLevel.MEDIUM]: 0,
      [RiskLevel.HIGH]: 0,
      [RiskLevel.CRITICAL]: 0,
      [RiskLevel.UNKNOWN]: 0
    };

    for (const license of licenses) {
      breakdown[license.riskLevel]++;
    }

    return breakdown;
  }

  private normalizeText(text: string): string {
    return text
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s]/g, '')
      .trim();
  }

  private calculateTextSimilarity(text1: string, text2: string): number {
    // Simple Jaccard similarity
    const words1 = new Set(text1.split(' '));
    const words2 = new Set(text2.split(' '));
    
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size;
  }

  private async getRepositoryDependencies(repositoryId: string): Promise<DependencyInfo[]> {
    try {
      const result = await this.db.selectFrom('dependency_graph')
        .select(['target_package', 'resolved_version', 'language'])
        .where('repository_id', '=', repositoryId)
        .distinct()
        .execute();

      return result.map(row => ({
        name: row.target_package,
        version: row.resolved_version || 'latest',
        language: row.language as SupportedLanguage
      }));
    } catch (error) {
      console.error('Error getting repository dependencies:', error);
      return [];
    }
  }

  private async storeLicenseReport(report: LicenseReport): Promise<void> {
    try {
      // Store individual license analyses
      const licensePromises = report.licenses.map(license =>
        this.db.insertInto('license_analysis')
          .values({
            repository_id: report.repositoryId,
            package_name: 'aggregate', // This would need actual package names
            package_version: 'aggregate',
            license_id: license.spdxId,
            license_name: license.name,
            is_osi_approved: license.osiApproved,
            is_fsf_approved: license.fsfApproved,
            risk_level: license.riskLevel,
            commercial_use_allowed: license.commercialUseAllowed,
            attribution_required: license.attributionRequired,
            copyleft_scope: license.copyleftScope
          })
          .onConflict((oc) => oc.columns(['repository_id', 'package_name', 'package_version']).doNothing())
          .execute()
      );

      await Promise.all(licensePromises);

      // Store analysis session
      await this.db.insertInto('dependency_analysis_sessions')
        .values({
          repository_id: report.repositoryId,
          analysis_type: 'license',
          status: 'completed',
          completed_at: report.generatedAt,
          packages_analyzed: report.summary.totalPackages,
          results_summary: JSON.stringify({
            licenseCount: report.licenses.length,
            riskBreakdown: report.summary.riskBreakdown,
            compatibilityIssues: report.compatibility.issues.length,
            complianceViolations: report.compliance.violations.length
          })
        })
        .execute();
    } catch (error) {
      console.error('Error storing license report:', error);
    }
  }
}