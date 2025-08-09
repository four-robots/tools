/**
 * Enhanced Dependency Analysis Service Tests
 * 
 * Comprehensive test suite covering all dependency analysis functionality:
 * - Dependency graph construction and circular detection
 * - Impact analysis and risk assessment  
 * - Vulnerability scanning integration
 * - License compliance checking
 * - Optimization suggestions
 */

import { DatabaseManager } from '../../../utils/database.js';
import { CodeParserService } from '../code-parser-service.js';
import { VulnerabilityScanner } from '../security/vulnerability-scanner.js';
import { LicenseAnalyzer } from '../compliance/license-analyzer.js';
import { EnhancedDependencyAnalysisService } from '../enhanced-dependency-analysis-service.js';
import type {
  DependencyGraphAnalysis,
  DependencyChange,
  UpdateType,
  RiskLevel,
  SupportedLanguage,
  VulnerabilitySeverity,
  AnalysisStatus
} from '../../../shared/types/codebase.js';

// Mock dependencies
jest.mock('../../../utils/database.js');
jest.mock('../code-parser-service.js');
jest.mock('../security/vulnerability-scanner.js');
jest.mock('../compliance/license-analyzer.js');

const mockDb = {
  selectFrom: jest.fn().mockReturnValue({
    select: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnValue({
        execute: jest.fn().mockResolvedValue([])
      }),
      distinct: jest.fn().mockReturnValue({
        execute: jest.fn().mockResolvedValue([])
      }),
      innerJoin: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            execute: jest.fn().mockResolvedValue([])
          })
        })
      })
    })
  }),
  insertInto: jest.fn().mockReturnValue({
    values: jest.fn().mockReturnValue({
      execute: jest.fn().mockResolvedValue({}),
      onConflict: jest.fn().mockReturnValue({
        doUpdateSet: jest.fn().mockReturnValue({
          execute: jest.fn().mockResolvedValue({})
        }),
        doNothing: jest.fn().mockReturnValue({
          execute: jest.fn().mockResolvedValue({})
        })
      })
    })
  }),
  updateTable: jest.fn().mockReturnValue({
    set: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnValue({
        execute: jest.fn().mockResolvedValue({})
      })
    })
  }),
  deleteFrom: jest.fn().mockReturnValue({
    where: jest.fn().mockReturnValue({
      execute: jest.fn().mockResolvedValue({})
    })
  })
} as unknown as DatabaseManager;

const mockParser = {
  parseFile: jest.fn(),
  extractDependencies: jest.fn()
} as unknown as CodeParserService;

const mockVulnScanner = {
  scanPackage: jest.fn().mockResolvedValue([]),
  scanRepository: jest.fn().mockResolvedValue({
    repositoryId: 'test-repo',
    totalPackages: 10,
    packagesScanned: 10,
    vulnerabilities: [],
    summary: {
      criticalCount: 0,
      highCount: 0,
      mediumCount: 0,
      lowCount: 0,
      infoCount: 0
    },
    scanDuration: 1000,
    sources: ['osv']
  }),
  updateCVEDatabase: jest.fn().mockResolvedValue(undefined)
} as unknown as VulnerabilityScanner;

const mockLicenseAnalyzer = {
  generateLicenseReport: jest.fn().mockResolvedValue({
    repositoryId: 'test-repo',
    licenses: [],
    compatibility: { compatible: true, issues: [], recommendations: [] },
    compliance: { compliant: true, violations: [], warnings: [], recommendations: [], overallRisk: 'low' as RiskLevel },
    summary: {
      totalPackages: 10,
      licensedPackages: 8,
      unlicensedPackages: 2,
      riskBreakdown: { 'low': 8, 'medium': 2, 'high': 0, 'critical': 0, 'unknown': 0 } as Record<RiskLevel, number>,
      copyleftPackages: 0
    },
    generatedAt: new Date()
  }),
  detectLicense: jest.fn().mockResolvedValue({
    id: 'test-license-id',
    name: 'MIT',
    spdxId: 'MIT',
    osiApproved: true,
    fsfApproved: true,
    commercialUseAllowed: true,
    attributionRequired: true,
    copyleftScope: 'none',
    riskLevel: 'low' as RiskLevel
  }),
  analyzeLicenseCompatibility: jest.fn().mockResolvedValue({
    compatible: true,
    issues: [],
    recommendations: []
  }),
  validateCompliance: jest.fn().mockResolvedValue({
    compliant: true,
    violations: [],
    warnings: [],
    recommendations: [],
    overallRisk: 'low' as RiskLevel
  })
} as unknown as LicenseAnalyzer;

describe('EnhancedDependencyAnalysisService', () => {
  let service: EnhancedDependencyAnalysisService;
  const mockRepositoryId = 'test-repo-123';

  beforeEach(() => {
    jest.clearAllMocks();
    service = new EnhancedDependencyAnalysisService(
      mockDb,
      mockParser,
      mockVulnScanner,
      mockLicenseAnalyzer
    );

    // Setup default mock return values
    (mockDb.selectFrom as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          execute: jest.fn().mockResolvedValue([
            {
              target_package: 'express',
              resolved_version: '4.18.0',
              language: 'typescript',
              dependency_type: 'direct'
            },
            {
              target_package: 'lodash',
              resolved_version: '4.17.21',
              language: 'typescript',
              dependency_type: 'direct'
            }
          ]),
          distinct: jest.fn().mockReturnValue({
            execute: jest.fn().mockResolvedValue([
              { target_package: 'express', resolved_version: '4.18.0', language: 'typescript' },
              { target_package: 'lodash', resolved_version: '4.17.21', language: 'typescript' }
            ])
          })
        })
      })
    });
  });

  describe('buildDependencyGraph', () => {
    it('should build basic dependency graph with nodes and edges', async () => {
      // Mock finding manifest files
      jest.spyOn(service as any, 'findManifestFiles').mockResolvedValue(['package.json']);
      jest.spyOn(service as any, 'parseManifestFile').mockResolvedValue([
        {
          name: 'express',
          version_constraint: { resolved_version: '4.18.0' },
          ecosystem: 'npm',
          type: 'production'
        },
        {
          name: 'lodash', 
          version_constraint: { resolved_version: '4.17.21' },
          ecosystem: 'npm',
          type: 'production'
        }
      ]);

      jest.spyOn(service as any, 'detectCircularDependencies').mockResolvedValue([]);
      jest.spyOn(service as any, 'enhanceNodesWithSecurityData').mockResolvedValue(undefined);
      jest.spyOn(service as any, 'storeDependencyGraph').mockResolvedValue(undefined);

      const graph = await service.buildDependencyGraph(mockRepositoryId);

      expect(graph).toBeDefined();
      expect(graph.repositoryId).toBe(mockRepositoryId);
      expect(graph.nodes).toHaveLength(2);
      expect(graph.nodes[0].packageName).toBe('express');
      expect(graph.nodes[1].packageName).toBe('lodash');
      expect(graph.totalPackages).toBe(2);
    });

    it('should detect circular dependencies', async () => {
      const mockCircularDeps = [{
        id: 'circular-1',
        packages: ['pkg-a', 'pkg-b', 'pkg-a'],
        severity: 'warning' as const,
        affectedFiles: [],
        suggestedFix: 'Break circular dependency'
      }];

      jest.spyOn(service as any, 'findManifestFiles').mockResolvedValue(['package.json']);
      jest.spyOn(service as any, 'parseManifestFile').mockResolvedValue([]);
      jest.spyOn(service as any, 'detectCircularDependencies').mockResolvedValue(mockCircularDeps);
      jest.spyOn(service as any, 'enhanceNodesWithSecurityData').mockResolvedValue(undefined);
      jest.spyOn(service as any, 'storeDependencyGraph').mockResolvedValue(undefined);

      const graph = await service.buildDependencyGraph(mockRepositoryId);

      expect(graph.circularDependencies).toHaveLength(1);
      expect(graph.circularDependencies[0].packages).toEqual(['pkg-a', 'pkg-b', 'pkg-a']);
      expect(graph.stats.circularCount).toBe(1);
    });

    it('should handle transitive dependencies when requested', async () => {
      const options = { includeTransitive: true, maxDepth: 3 };
      
      jest.spyOn(service as any, 'findManifestFiles').mockResolvedValue(['package.json']);
      jest.spyOn(service as any, 'parseManifestFile').mockResolvedValue([]);
      jest.spyOn(service as any, 'buildTransitiveDependencies').mockResolvedValue(undefined);
      jest.spyOn(service as any, 'detectCircularDependencies').mockResolvedValue([]);
      jest.spyOn(service as any, 'enhanceNodesWithSecurityData').mockResolvedValue(undefined);
      jest.spyOn(service as any, 'storeDependencyGraph').mockResolvedValue(undefined);

      await service.buildDependencyGraph(mockRepositoryId, options);

      expect(service['buildTransitiveDependencies']).toHaveBeenCalledWith(
        expect.any(Map),
        expect.any(Array),
        3
      );
    });
  });

  describe('analyzeDependencyDepth', () => {
    it('should analyze dependency depth distribution', async () => {
      (mockDb.selectFrom as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            execute: jest.fn().mockResolvedValue([
              { target_package: 'express', depth: 0 },
              { target_package: 'lodash', depth: 1 },
              { target_package: 'debug', depth: 2 }
            ])
          })
        })
      });

      const analysis = await service.analyzeDependencyDepth(mockRepositoryId);

      expect(analysis.repositoryId).toBe(mockRepositoryId);
      expect(analysis.maxDepth).toBe(2);
      expect(analysis.averageDepth).toBeCloseTo(1.0);
      expect(analysis.depthDistribution).toEqual({ 0: 1, 1: 1, 2: 1 });
      expect(analysis.deepestPackages).toHaveLength(3);
    });
  });

  describe('analyzeImpact', () => {
    it('should analyze impact of dependency changes', async () => {
      const changes: DependencyChange[] = [{
        packageName: 'express',
        fromVersion: '4.17.0',
        toVersion: '4.18.0',
        changeType: 'minor' as UpdateType,
        isBreaking: false
      }];

      const mockAffectedFiles = [
        {
          filePath: '/src/app.ts',
          functionNames: ['startServer'],
          classNames: [],
          importStatements: ['express'],
          confidenceScore: 0.9
        }
      ];

      jest.spyOn(service, 'findAffectedFiles').mockResolvedValue(mockAffectedFiles);
      jest.spyOn(service as any, 'analyzeFileImpact').mockImplementation((file) => Promise.resolve(file));
      jest.spyOn(service, 'assessRisk').mockResolvedValue({
        overallRisk: 'low' as RiskLevel,
        factors: { vulnerabilities: 0, licenseIssues: 0, outdatedPackages: 0, circularDependencies: 0 },
        recommendations: [],
        priorityActions: []
      });

      const impact = await service.analyzeImpact(mockRepositoryId, changes);

      expect(impact.repositoryId).toBe(mockRepositoryId);
      expect(impact.changes).toEqual(changes);
      expect(impact.affectedFiles).toHaveLength(1);
      expect(impact.riskAssessment).toBe('low' as RiskLevel);
    });

    it('should handle breaking changes with higher risk assessment', async () => {
      const changes: DependencyChange[] = [{
        packageName: 'express',
        fromVersion: '4.18.0', 
        toVersion: '5.0.0',
        changeType: 'major' as UpdateType,
        isBreaking: true
      }];

      jest.spyOn(service, 'findAffectedFiles').mockResolvedValue([]);
      jest.spyOn(service, 'assessRisk').mockResolvedValue({
        overallRisk: 'critical' as RiskLevel,
        factors: { vulnerabilities: 0, licenseIssues: 0, outdatedPackages: 1, circularDependencies: 0 },
        recommendations: ['Major version update for express may contain breaking changes'],
        priorityActions: ['Review breaking changes in express before updating']
      });

      const impact = await service.analyzeImpact(mockRepositoryId, changes);

      expect(impact.riskAssessment).toBe('critical' as RiskLevel);
      expect(impact.recommendations).toContain('Major version update for express may contain breaking changes');
    });
  });

  describe('findAffectedFiles', () => {
    it('should find files that import the dependency', async () => {
      (mockDb.selectFrom as jest.Mock).mockReturnValue({
        innerJoin: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              where: jest.fn().mockReturnValue({
                execute: jest.fn().mockResolvedValue([
                  {
                    file_path: '/src/server.ts',
                    imported_symbols: ['express'],
                    import_path: 'express'
                  }
                ])
              })
            })
          })
        })
      });

      const affectedFiles = await service.findAffectedFiles('express', mockRepositoryId);

      expect(affectedFiles).toHaveLength(1);
      expect(affectedFiles[0].filePath).toBe('/src/server.ts');
      expect(affectedFiles[0].importStatements).toEqual(['express']);
    });
  });

  describe('scanVulnerabilities', () => {
    it('should scan repository for vulnerabilities', async () => {
      const mockScanResult = {
        repositoryId: mockRepositoryId,
        totalPackages: 5,
        packagesScanned: 5,
        vulnerabilities: [
          {
            id: 'vuln-1',
            packageName: 'lodash',
            severity: 'high' as VulnerabilitySeverity,
            title: 'Prototype Pollution',
            description: 'Vulnerability in lodash',
            affectedVersions: ['< 4.17.12'],
            fixedVersion: '4.17.12',
            references: [],
            publishedDate: new Date(),
            cvssScore: 7.5
          }
        ],
        summary: {
          criticalCount: 0,
          highCount: 1,
          mediumCount: 0,
          lowCount: 0,
          infoCount: 0
        },
        scanDuration: 2000,
        sources: ['osv', 'github']
      };

      (mockVulnScanner.scanRepository as jest.Mock).mockResolvedValue(mockScanResult);

      const result = await service.scanVulnerabilities(mockRepositoryId);

      expect(result).toEqual(mockScanResult);
      expect(result.summary.highCount).toBe(1);
      expect(result.vulnerabilities).toHaveLength(1);
    });
  });

  describe('getSecurityScore', () => {
    it('should calculate comprehensive security score', async () => {
      const score = await service.getSecurityScore(mockRepositoryId);

      expect(score.repositoryId).toBe(mockRepositoryId);
      expect(score.overallScore).toBeGreaterThan(0);
      expect(score.overallScore).toBeLessThanOrEqual(1);
      expect(score.breakdown).toBeDefined();
      expect(score.calculatedAt).toBeInstanceOf(Date);
    });
  });

  describe('analyzeLicenses', () => {
    it('should analyze repository licenses', async () => {
      const report = await service.analyzeLicenses(mockRepositoryId);

      expect(report.repositoryId).toBe(mockRepositoryId);
      expect(report.licenses).toBeDefined();
      expect(report.compatibility).toBeDefined();
      expect(report.compliance).toBeDefined();
      expect(report.summary).toBeDefined();
    });
  });

  describe('optimizeDependencies', () => {
    it('should suggest optimization improvements', async () => {
      jest.spyOn(service, 'findUnusedDependencies').mockResolvedValue([
        {
          name: 'unused-lib',
          version: '1.0.0',
          type: 'direct' as any,
          reasonUnused: 'No import statements found',
          potentialSavings: { bundleSize: 50000, securityIssues: 0 }
        }
      ]);

      jest.spyOn(service, 'suggestUpdates').mockResolvedValue([
        {
          packageName: 'old-lib',
          currentVersion: '1.0.0',
          suggestedVersion: '2.0.0',
          updateType: 'major' as UpdateType,
          priority: 'high' as RiskLevel,
          hasBreakingChanges: true,
          hasSecurityFixes: true,
          compatibilityScore: 0.5,
          effort: 'high'
        }
      ]);

      jest.spyOn(service as any, 'findDuplicateDependencies').mockResolvedValue([]);

      const suggestions = await service.optimizeDependencies(mockRepositoryId);

      expect(suggestions).toHaveLength(2);
      expect(suggestions[0].type).toBe('update_version'); // Security fixes prioritized
      expect(suggestions[1].type).toBe('remove_unused');
    });
  });

  describe('findUnusedDependencies', () => {
    it('should identify dependencies not used in code', async () => {
      // Mock dependency graph query
      (mockDb.selectFrom as jest.Mock)
        .mockReturnValueOnce({
          select: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              where: jest.fn().mockReturnValue({
                execute: jest.fn().mockResolvedValue([
                  { target_package: 'express', resolved_version: '4.18.0', dependency_type: 'direct' },
                  { target_package: 'unused-lib', resolved_version: '1.0.0', dependency_type: 'direct' }
                ])
              })
            })
          })
        })
        // Mock code dependencies query  
        .mockReturnValueOnce({
          select: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              distinct: jest.fn().mockReturnValue({
                execute: jest.fn().mockResolvedValue([
                  { dependency_path: 'express' }
                ])
              })
            })
          })
        });

      const unused = await service.findUnusedDependencies(mockRepositoryId);

      expect(unused).toHaveLength(1);
      expect(unused[0].name).toBe('unused-lib');
      expect(unused[0].reasonUnused).toBe('No import statements found in code');
    });
  });

  describe('suggestUpdates', () => {
    it('should suggest package updates based on available versions', async () => {
      (mockDb.selectFrom as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              distinct: jest.fn().mockReturnValue({
                execute: jest.fn().mockResolvedValue([
                  { target_package: 'express', resolved_version: '4.17.0' }
                ])
              })
            })
          })
        })
      });

      jest.spyOn(service as any, 'getLatestVersion').mockResolvedValue('4.18.2');
      jest.spyOn(service as any, 'isNewerVersion').mockReturnValue(true);
      jest.spyOn(service as any, 'determineUpdateType').mockReturnValue('minor' as UpdateType);
      jest.spyOn(service as any, 'checkForSecurityFixes').mockResolvedValue(true);

      const suggestions = await service.suggestUpdates(mockRepositoryId);

      expect(suggestions).toHaveLength(1);
      expect(suggestions[0].packageName).toBe('express');
      expect(suggestions[0].currentVersion).toBe('4.17.0');
      expect(suggestions[0].suggestedVersion).toBe('4.18.2');
      expect(suggestions[0].hasSecurityFixes).toBe(true);
    });
  });

  describe('cleanupOldAnalysis', () => {
    it('should remove old analysis data', async () => {
      await service.cleanupOldAnalysis(30);

      expect(mockDb.deleteFrom).toHaveBeenCalledTimes(3);
      expect(mockDb.deleteFrom).toHaveBeenCalledWith('dependency_analysis_sessions');
      expect(mockDb.deleteFrom).toHaveBeenCalledWith('vulnerability_scan');
      expect(mockDb.deleteFrom).toHaveBeenCalledWith('license_analysis');
    });
  });

  describe('error handling', () => {
    it('should handle database connection errors gracefully', async () => {
      (mockDb.selectFrom as jest.Mock).mockImplementation(() => {
        throw new Error('Database connection failed');
      });

      await expect(service.analyzeDependencyDepth(mockRepositoryId))
        .rejects.toThrow('Database connection failed');
    });

    it('should handle vulnerability scanner errors gracefully', async () => {
      (mockVulnScanner.scanRepository as jest.Mock).mockRejectedValue(
        new Error('Vulnerability scan failed')
      );

      await expect(service.scanVulnerabilities(mockRepositoryId))
        .rejects.toThrow('Vulnerability scan failed');
    });

    it('should handle license analyzer errors gracefully', async () => {
      (mockLicenseAnalyzer.generateLicenseReport as jest.Mock).mockRejectedValue(
        new Error('License analysis failed')
      );

      await expect(service.analyzeLicenses(mockRepositoryId))
        .rejects.toThrow('License analysis failed');
    });
  });

  describe('performance considerations', () => {
    it('should limit package processing for performance', async () => {
      // Mock a large number of dependencies
      const largeDependencyList = Array.from({ length: 100 }, (_, i) => ({
        target_package: `pkg-${i}`,
        resolved_version: '1.0.0',
        dependency_type: 'direct'
      }));

      (mockDb.selectFrom as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              distinct: jest.fn().mockReturnValue({
                execute: jest.fn().mockResolvedValue(largeDependencyList)
              })
            })
          })
        })
      });

      jest.spyOn(service as any, 'getLatestVersion').mockResolvedValue('1.1.0');
      jest.spyOn(service as any, 'isNewerVersion').mockReturnValue(true);
      jest.spyOn(service as any, 'determineUpdateType').mockReturnValue('minor' as UpdateType);
      jest.spyOn(service as any, 'checkForSecurityFixes').mockResolvedValue(false);

      const suggestions = await service.suggestUpdates(mockRepositoryId);

      // Should be limited to first 10 packages for performance
      expect(suggestions).toHaveLength(10);
    });
  });

  describe('analysis session tracking', () => {
    it('should create and track analysis sessions', async () => {
      jest.spyOn(service as any, 'findManifestFiles').mockResolvedValue(['package.json']);
      jest.spyOn(service as any, 'parseManifestFile').mockResolvedValue([]);
      jest.spyOn(service as any, 'detectCircularDependencies').mockResolvedValue([]);
      jest.spyOn(service as any, 'enhanceNodesWithSecurityData').mockResolvedValue(undefined);
      jest.spyOn(service as any, 'storeDependencyGraph').mockResolvedValue(undefined);

      await service.buildDependencyGraph(mockRepositoryId);

      expect(mockDb.insertInto).toHaveBeenCalledWith('dependency_analysis_sessions');
      expect(mockDb.updateTable).toHaveBeenCalledWith('dependency_analysis_sessions');
    });

    it('should track failed analysis sessions', async () => {
      jest.spyOn(service as any, 'findManifestFiles').mockRejectedValue(
        new Error('Failed to find manifest files')
      );

      await expect(service.buildDependencyGraph(mockRepositoryId))
        .rejects.toThrow('Failed to find manifest files');

      expect(mockDb.updateTable).toHaveBeenCalledWith('dependency_analysis_sessions');
    });
  });
});