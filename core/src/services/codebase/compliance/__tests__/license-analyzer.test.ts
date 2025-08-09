/**
 * License Analyzer Tests
 * 
 * Tests for the LicenseAnalyzer service covering:
 * - License detection and normalization
 * - SPDX integration
 * - Compatibility analysis
 * - Compliance validation
 * - Risk assessment
 */

import axios from 'axios';
import { DatabaseManager } from '../../../../utils/database.js';
import { LicenseAnalyzer } from '../license-analyzer.js';
import type {
  LicenseInfo,
  RiskLevel,
  CopyleftScope,
  SupportedLanguage
} from '../../../../shared/types/codebase.js';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock database
jest.mock('../../../../utils/database.js');
const mockDb = {
  selectFrom: jest.fn().mockReturnValue({
    select: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnValue({
        distinct: jest.fn().mockReturnValue({
          execute: jest.fn().mockResolvedValue([])
        })
      })
    })
  }),
  insertInto: jest.fn().mockReturnValue({
    values: jest.fn().mockReturnValue({
      onConflict: jest.fn().mockReturnValue({
        doNothing: jest.fn().mockReturnValue({
          execute: jest.fn().mockResolvedValue({})
        })
      }),
      execute: jest.fn().mockResolvedValue({})
    })
  })
} as unknown as DatabaseManager;

describe('LicenseAnalyzer', () => {
  let analyzer: LicenseAnalyzer;
  const mockConfig = {
    allowedLicenses: ['MIT', 'Apache-2.0', 'BSD-3-Clause'],
    prohibitedLicenses: ['GPL-3.0-only', 'AGPL-3.0-only'],
    copyleftPolicy: 'permissive' as const,
    commercialUseRequired: true,
    attributionRequired: true
  };

  beforeEach(() => {
    jest.clearAllMocks();
    analyzer = new LicenseAnalyzer(mockDb, mockConfig);

    // Mock NPM registry response
    mockedAxios.get.mockImplementation((url) => {
      if (url.includes('registry.npmjs.org')) {
        return Promise.resolve({
          data: { license: 'MIT' }
        });
      }
      if (url.includes('raw.githubusercontent.com')) {
        return Promise.resolve({
          data: {
            licenses: [
              {
                licenseId: 'MIT',
                name: 'MIT License',
                osiApproved: true,
                fsfApproved: true,
                licenseText: 'MIT License text...'
              },
              {
                licenseId: 'Apache-2.0',
                name: 'Apache License 2.0',
                osiApproved: true,
                fsfApproved: true
              },
              {
                licenseId: 'GPL-3.0-only',
                name: 'GNU General Public License v3.0 only',
                osiApproved: true,
                fsfApproved: true
              }
            ]
          }
        });
      }
      return Promise.resolve({ data: [] });
    });
  });

  describe('detectLicense', () => {
    it('should detect license from npm registry', async () => {
      const license = await analyzer.detectLicense('express', '4.18.0');

      expect(license.spdxId).toBe('MIT');
      expect(license.name).toBe('MIT License');
      expect(license.osiApproved).toBe(true);
      expect(license.commercialUseAllowed).toBe(true);
      expect(license.riskLevel).toBe(RiskLevel.LOW);
    });

    it('should cache license detection results', async () => {
      // First call
      await analyzer.detectLicense('lodash', '4.17.21');
      expect(mockedAxios.get).toHaveBeenCalledTimes(1);

      // Second call should use cache
      await analyzer.detectLicense('lodash', '4.17.21');
      expect(mockedAxios.get).toHaveBeenCalledTimes(1); // No additional calls
    });

    it('should return unknown license when registry fails', async () => {
      mockedAxios.get.mockRejectedValueOnce(new Error('Registry error'));

      const license = await analyzer.detectLicense('unknown-package', '1.0.0');

      expect(license.name).toBe('Unknown');
      expect(license.spdxId).toBeUndefined();
      expect(license.riskLevel).toBe(RiskLevel.UNKNOWN);
    });

    it('should handle non-SPDX license strings', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: { license: 'Custom License' }
      });

      const license = await analyzer.detectLicense('custom-package', '1.0.0');

      expect(license.name).toBe('Custom License');
      expect(license.spdxId).toBeUndefined();
      expect(license.osiApproved).toBe(false);
      expect(license.riskLevel).toBe(RiskLevel.UNKNOWN);
    });
  });

  describe('analyzeLicenseCompatibility', () => {
    it('should detect copyleft conflicts', async () => {
      const licenses: LicenseInfo[] = [
        {
          id: 'license-1',
          name: 'MIT License',
          spdxId: 'MIT',
          osiApproved: true,
          fsfApproved: true,
          commercialUseAllowed: true,
          attributionRequired: true,
          copyleftScope: CopyleftScope.NONE,
          riskLevel: RiskLevel.LOW
        },
        {
          id: 'license-2',
          name: 'GNU GPL v3',
          spdxId: 'GPL-3.0-only',
          osiApproved: true,
          fsfApproved: true,
          commercialUseAllowed: true,
          attributionRequired: true,
          copyleftScope: CopyleftScope.STRONG,
          riskLevel: RiskLevel.HIGH
        }
      ];

      const compatibility = await analyzer.analyzeLicenseCompatibility(licenses);

      expect(compatibility.compatible).toBe(false);
      expect(compatibility.issues).toHaveLength(1);
      expect(compatibility.issues[0].conflictType).toBe('copyleft');
      expect(compatibility.issues[0].severity).toBe(RiskLevel.HIGH);
      expect(compatibility.issues[0].license1).toBe('GPL-3.0-only');
      expect(compatibility.issues[0].license2).toBe('MIT');
    });

    it('should identify attribution requirements', async () => {
      const licenses: LicenseInfo[] = [
        {
          id: 'license-1',
          name: 'MIT License',
          spdxId: 'MIT',
          osiApproved: true,
          fsfApproved: true,
          commercialUseAllowed: true,
          attributionRequired: true,
          copyleftScope: CopyleftScope.NONE,
          riskLevel: RiskLevel.LOW
        },
        {
          id: 'license-2',
          name: 'Apache License 2.0',
          spdxId: 'Apache-2.0',
          osiApproved: true,
          fsfApproved: true,
          commercialUseAllowed: true,
          attributionRequired: true,
          copyleftScope: CopyleftScope.NONE,
          riskLevel: RiskLevel.LOW
        }
      ];

      const compatibility = await analyzer.analyzeLicenseCompatibility(licenses);

      expect(compatibility.compatible).toBe(true);
      expect(compatibility.issues).toHaveLength(0);
      expect(compatibility.recommendations).toContain(
        'Attribution required for 2 licenses. Ensure proper attribution in documentation.'
      );
    });

    it('should detect commercial use restrictions', async () => {
      const licenses: LicenseInfo[] = [
        {
          id: 'license-1',
          name: 'CC BY-NC 4.0',
          spdxId: 'CC-BY-NC-4.0',
          osiApproved: false,
          fsfApproved: false,
          commercialUseAllowed: false,
          attributionRequired: true,
          copyleftScope: CopyleftScope.NONE,
          riskLevel: RiskLevel.HIGH
        }
      ];

      const compatibility = await analyzer.analyzeLicenseCompatibility(licenses);

      expect(compatibility.issues).toHaveLength(1);
      expect(compatibility.issues[0].conflictType).toBe('commercial');
      expect(compatibility.issues[0].severity).toBe(RiskLevel.CRITICAL);
    });
  });

  describe('validateCompliance', () => {
    const mockDependencies = [
      {
        name: 'express',
        version: '4.18.0',
        language: SupportedLanguage.TYPESCRIPT
      },
      {
        name: 'lodash',
        version: '4.17.21',
        language: SupportedLanguage.TYPESCRIPT
      }
    ];

    const mockPolicy = {
      allowedLicenses: ['MIT', 'Apache-2.0'],
      prohibitedLicenses: ['GPL-3.0-only'],
      requireAttribution: true,
      allowCopyleft: false,
      allowCommercialUse: true,
      allowPatentUse: true
    };

    it('should validate compliance against policy', async () => {
      jest.spyOn(analyzer, 'detectLicense').mockResolvedValue({
        id: 'license-1',
        name: 'MIT License',
        spdxId: 'MIT',
        osiApproved: true,
        fsfApproved: true,
        commercialUseAllowed: true,
        attributionRequired: true,
        copyleftScope: CopyleftScope.NONE,
        riskLevel: RiskLevel.LOW
      });

      const compliance = await analyzer.validateCompliance(mockDependencies, mockPolicy);

      expect(compliance.compliant).toBe(true);
      expect(compliance.violations).toHaveLength(0);
      expect(compliance.warnings).toHaveLength(2); // Attribution warnings
      expect(compliance.overallRisk).toBe(RiskLevel.LOW);
    });

    it('should detect prohibited license violations', async () => {
      jest.spyOn(analyzer, 'detectLicense').mockResolvedValue({
        id: 'license-1',
        name: 'GNU GPL v3',
        spdxId: 'GPL-3.0-only',
        osiApproved: true,
        fsfApproved: true,
        commercialUseAllowed: true,
        attributionRequired: true,
        copyleftScope: CopyleftScope.STRONG,
        riskLevel: RiskLevel.HIGH
      });

      const compliance = await analyzer.validateCompliance(mockDependencies, mockPolicy);

      expect(compliance.compliant).toBe(false);
      expect(compliance.violations).toHaveLength(2); // Both deps use prohibited license
      expect(compliance.violations[0].violationType).toBe('prohibited_license');
      expect(compliance.violations[0].severity).toBe(RiskLevel.CRITICAL);
    });

    it('should detect copyleft policy violations', async () => {
      jest.spyOn(analyzer, 'detectLicense').mockResolvedValue({
        id: 'license-1',
        name: 'GNU GPL v3',
        spdxId: 'GPL-3.0-only',
        osiApproved: true,
        fsfApproved: true,
        commercialUseAllowed: true,
        attributionRequired: true,
        copyleftScope: CopyleftScope.STRONG,
        riskLevel: RiskLevel.HIGH
      });

      const strictPolicy = { ...mockPolicy, allowCopyleft: false };
      const compliance = await analyzer.validateCompliance(mockDependencies, strictPolicy);

      expect(compliance.violations.some(v => v.violationType === 'copyleft_violation')).toBe(true);
    });

    it('should detect commercial use restrictions', async () => {
      jest.spyOn(analyzer, 'detectLicense').mockResolvedValue({
        id: 'license-1',
        name: 'CC BY-NC 4.0',
        spdxId: 'CC-BY-NC-4.0',
        osiApproved: false,
        fsfApproved: false,
        commercialUseAllowed: false,
        attributionRequired: true,
        copyleftScope: CopyleftScope.NONE,
        riskLevel: RiskLevel.HIGH
      });

      const compliance = await analyzer.validateCompliance(mockDependencies, mockPolicy);

      expect(compliance.violations.some(v => v.violationType === 'commercial_restriction')).toBe(true);
      expect(compliance.violations.find(v => v.violationType === 'commercial_restriction')?.severity)
        .toBe(RiskLevel.CRITICAL);
    });

    it('should warn about unknown licenses', async () => {
      jest.spyOn(analyzer, 'detectLicense').mockResolvedValue({
        id: 'license-1',
        name: 'Unknown',
        spdxId: undefined,
        osiApproved: false,
        fsfApproved: false,
        commercialUseAllowed: undefined,
        attributionRequired: undefined,
        copyleftScope: CopyleftScope.NONE,
        riskLevel: RiskLevel.UNKNOWN
      });

      const compliance = await analyzer.validateCompliance(mockDependencies, mockPolicy);

      expect(compliance.warnings.some(w => w.warningType === 'unknown_license')).toBe(true);
    });
  });

  describe('generateLicenseReport', () => {
    it('should generate comprehensive license report', async () => {
      // Mock repository dependencies
      (mockDb.selectFrom as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            distinct: jest.fn().mockReturnValue({
              execute: jest.fn().mockResolvedValue([
                { target_package: 'express', resolved_version: '4.18.0', language: 'typescript' },
                { target_package: 'lodash', resolved_version: '4.17.21', language: 'typescript' }
              ])
            })
          })
        })
      });

      jest.spyOn(analyzer, 'detectLicense')
        .mockResolvedValueOnce({
          id: 'license-1',
          name: 'MIT License',
          spdxId: 'MIT',
          osiApproved: true,
          fsfApproved: true,
          commercialUseAllowed: true,
          attributionRequired: true,
          copyleftScope: CopyleftScope.NONE,
          riskLevel: RiskLevel.LOW
        })
        .mockResolvedValueOnce({
          id: 'license-2',
          name: 'Apache License 2.0',
          spdxId: 'Apache-2.0',
          osiApproved: true,
          fsfApproved: true,
          commercialUseAllowed: true,
          attributionRequired: true,
          copyleftScope: CopyleftScope.NONE,
          riskLevel: RiskLevel.LOW
        });

      const report = await analyzer.generateLicenseReport('test-repo');

      expect(report.repositoryId).toBe('test-repo');
      expect(report.licenses).toHaveLength(2);
      expect(report.compatibility.compatible).toBe(true);
      expect(report.compliance.compliant).toBe(true);
      expect(report.summary.totalPackages).toBe(2);
      expect(report.summary.licensedPackages).toBe(2);
      expect(report.summary.unlicensedPackages).toBe(0);
      expect(report.summary.riskBreakdown.low).toBe(2);
    });

    it('should handle mixed license scenarios', async () => {
      (mockDb.selectFrom as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            distinct: jest.fn().mockReturnValue({
              execute: jest.fn().mockResolvedValue([
                { target_package: 'good-pkg', resolved_version: '1.0.0', language: 'typescript' },
                { target_package: 'bad-pkg', resolved_version: '1.0.0', language: 'typescript' },
                { target_package: 'unknown-pkg', resolved_version: '1.0.0', language: 'typescript' }
              ])
            })
          })
        })
      });

      jest.spyOn(analyzer, 'detectLicense')
        .mockResolvedValueOnce({
          id: 'license-1',
          name: 'MIT License',
          spdxId: 'MIT',
          osiApproved: true,
          fsfApproved: true,
          commercialUseAllowed: true,
          attributionRequired: true,
          copyleftScope: CopyleftScope.NONE,
          riskLevel: RiskLevel.LOW
        })
        .mockResolvedValueOnce({
          id: 'license-2',
          name: 'GNU GPL v3',
          spdxId: 'GPL-3.0-only',
          osiApproved: true,
          fsfApproved: true,
          commercialUseAllowed: true,
          attributionRequired: true,
          copyleftScope: CopyleftScope.STRONG,
          riskLevel: RiskLevel.HIGH
        })
        .mockResolvedValueOnce({
          id: 'license-3',
          name: 'Unknown',
          spdxId: undefined,
          osiApproved: false,
          fsfApproved: false,
          commercialUseAllowed: undefined,
          attributionRequired: undefined,
          copyleftScope: CopyleftScope.NONE,
          riskLevel: RiskLevel.UNKNOWN
        });

      const report = await analyzer.generateLicenseReport('test-repo');

      expect(report.summary.totalPackages).toBe(3);
      expect(report.summary.licensedPackages).toBe(2);
      expect(report.summary.unlicensedPackages).toBe(1);
      expect(report.summary.copyleftPackages).toBe(1);
      expect(report.summary.riskBreakdown.low).toBe(1);
      expect(report.summary.riskBreakdown.high).toBe(1);
      expect(report.summary.riskBreakdown.unknown).toBe(1);
    });
  });

  describe('updateLicenseDatabase', () => {
    it('should update SPDX license database', async () => {
      const mockSPDXResponse = {
        data: {
          licenses: [
            {
              licenseId: 'MIT',
              name: 'MIT License',
              osiApproved: true,
              licenseText: 'MIT license text...'
            },
            {
              licenseId: 'Apache-2.0',
              name: 'Apache License 2.0',
              osiApproved: true
            }
          ]
        }
      };

      mockedAxios.get.mockResolvedValueOnce(mockSPDXResponse);

      await analyzer.updateLicenseDatabase();

      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://raw.githubusercontent.com/spdx/license-list-data/main/json/licenses.json'
      );
    });

    it('should handle SPDX API errors', async () => {
      mockedAxios.get.mockRejectedValueOnce(new Error('SPDX API error'));

      await expect(analyzer.updateLicenseDatabase()).rejects.toThrow('SPDX API error');
    });
  });

  describe('normalizeLicense', () => {
    it('should normalize license text and identify SPDX license', async () => {
      const mitLicenseText = `
        MIT License
        
        Copyright (c) 2023 Example
        
        Permission is hereby granted, free of charge, to any person obtaining a copy
        of this software and associated documentation files (the "Software")...
      `;

      // Mock SPDX license data
      (analyzer as any).spdxLicenses.set('MIT', {
        licenseId: 'MIT',
        name: 'MIT License',
        licenseText: mitLicenseText.toLowerCase().replace(/\s+/g, ' ').trim()
      });

      const normalized = await analyzer.normalizeLicense(mitLicenseText);

      expect(normalized).not.toBeNull();
      expect(normalized?.spdxId).toBe('MIT');
      expect(normalized?.name).toBe('MIT License');
      expect(normalized?.confidence).toBeGreaterThan(0.8);
    });

    it('should return null for unrecognized license text', async () => {
      const customLicenseText = 'This is a completely custom license that does not match any SPDX license.';

      const normalized = await analyzer.normalizeLicense(customLicenseText);

      expect(normalized).toBeNull();
    });
  });

  describe('risk assessment', () => {
    it('should assess license risks correctly', async () => {
      const testCases = [
        { licenseId: 'MIT', expectedRisk: RiskLevel.LOW },
        { licenseId: 'Apache-2.0', expectedRisk: RiskLevel.LOW },
        { licenseId: 'BSD-3-Clause', expectedRisk: RiskLevel.LOW },
        { licenseId: 'LGPL-3.0-only', expectedRisk: RiskLevel.MEDIUM },
        { licenseId: 'GPL-3.0-only', expectedRisk: RiskLevel.HIGH },
        { licenseId: 'AGPL-3.0-only', expectedRisk: RiskLevel.CRITICAL }
      ];

      for (const testCase of testCases) {
        const risk = (analyzer as any).assessLicenseRisk(testCase.licenseId);
        expect(risk).toBe(testCase.expectedRisk);
      }
    });

    it('should determine copyleft scope correctly', async () => {
      const testCases = [
        { licenseId: 'MIT', expectedScope: CopyleftScope.NONE },
        { licenseId: 'Apache-2.0', expectedScope: CopyleftScope.NONE },
        { licenseId: 'LGPL-3.0-only', expectedScope: CopyleftScope.WEAK },
        { licenseId: 'MPL-2.0', expectedScope: CopyleftScope.WEAK },
        { licenseId: 'GPL-3.0-only', expectedScope: CopyleftScope.STRONG },
        { licenseId: 'AGPL-3.0-only', expectedScope: CopyleftScope.NETWORK }
      ];

      for (const testCase of testCases) {
        const scope = (analyzer as any).determineCopyleftScope(testCase.licenseId);
        expect(scope).toBe(testCase.expectedScope);
      }
    });

    it('should determine commercial use permissions correctly', async () => {
      const testCases = [
        { licenseId: 'MIT', expected: true },
        { licenseId: 'Apache-2.0', expected: true },
        { licenseId: 'BSD-3-Clause', expected: true },
        { licenseId: 'CC-BY-NC-4.0', expected: false },
        { licenseId: 'CC-BY-NC-SA-4.0', expected: false },
        { licenseId: 'Custom-License', expected: undefined }
      ];

      for (const testCase of testCases) {
        const result = (analyzer as any).determineCommercialUse(testCase.licenseId);
        expect(result).toBe(testCase.expected);
      }
    });
  });

  describe('error handling', () => {
    it('should handle license detection errors gracefully', async () => {
      jest.spyOn(analyzer, 'detectLicense').mockRejectedValue(new Error('License detection failed'));

      const dependencies = [
        { name: 'pkg', version: '1.0.0', language: SupportedLanguage.TYPESCRIPT }
      ];
      const policy = {
        allowedLicenses: ['MIT'],
        prohibitedLicenses: [],
        requireAttribution: false,
        allowCopyleft: true,
        allowCommercialUse: true,
        allowPatentUse: true
      };

      const compliance = await analyzer.validateCompliance(dependencies, policy);

      expect(compliance.warnings.some(w => w.warningType === 'analysis_error')).toBe(true);
    });

    it('should handle database errors gracefully', async () => {
      (mockDb.insertInto as jest.Mock).mockImplementation(() => {
        throw new Error('Database error');
      });

      // Should not throw, but handle gracefully
      const report = await analyzer.generateLicenseReport('test-repo');
      expect(report).toBeDefined();
    });
  });

  describe('text similarity calculation', () => {
    it('should calculate Jaccard similarity correctly', async () => {
      const text1 = 'the quick brown fox jumps over the lazy dog';
      const text2 = 'the quick brown fox runs over the sleepy cat';

      const similarity = (analyzer as any).calculateTextSimilarity(text1, text2);

      // Should be around 0.5-0.7 similarity
      expect(similarity).toBeGreaterThan(0.4);
      expect(similarity).toBeLessThan(0.8);
    });

    it('should return 1.0 for identical texts', async () => {
      const text = 'identical text for testing';
      const similarity = (analyzer as any).calculateTextSimilarity(text, text);

      expect(similarity).toBe(1.0);
    });

    it('should return 0.0 for completely different texts', async () => {
      const text1 = 'completely different words';
      const text2 = 'totally unrelated content';

      const similarity = (analyzer as any).calculateTextSimilarity(text1, text2);

      expect(similarity).toBe(0.0);
    });
  });
});