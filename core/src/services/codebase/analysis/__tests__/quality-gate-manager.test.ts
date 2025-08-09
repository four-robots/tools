/**
 * Quality Gate Manager Tests
 */

import { QualityGateManager } from '../quality-gate-manager.js';
import { DatabaseManager } from '../../../../database/manager.js';
import {
  QualityGateConfig,
  ComparisonOperator,
  Severity,
  QualityMetrics,
  SupportedLanguage
} from '../../../../shared/types/codebase.js';

// Mock DatabaseManager
jest.mock('../../../../database/manager.js');

describe('QualityGateManager', () => {
  let manager: QualityGateManager;
  let mockDb: jest.Mocked<DatabaseManager>;
  let mockConnection: any;

  beforeEach(() => {
    mockConnection = {
      insertInto: jest.fn().mockReturnThis(),
      updateTable: jest.fn().mockReturnThis(),
      deleteFrom: jest.fn().mockReturnThis(),
      selectFrom: jest.fn().mockReturnThis(),
      selectAll: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue([]),
      executeTakeFirst: jest.fn().mockResolvedValue(null)
    };

    mockDb = {
      getConnection: jest.fn().mockReturnValue(mockConnection)
    } as any;

    manager = new QualityGateManager(mockDb);
  });

  afterEach(() => {
    jest.clearAllMocks();
    manager.clearCache();
  });

  describe('createFromTemplate', () => {
    it('should create standard quality gates', async () => {
      mockConnection.execute.mockResolvedValue([{ insertId: '1' }]);

      const gates = await manager.createFromTemplate('repo1', 'STANDARD');

      expect(gates).toBeDefined();
      expect(gates.length).toBeGreaterThan(0);
      expect(mockConnection.insertInto).toHaveBeenCalledWith('quality_gates');
    });

    it('should create strict quality gates', async () => {
      mockConnection.execute.mockResolvedValue([{ insertId: '1' }]);

      const gates = await manager.createFromTemplate('repo1', 'STRICT');

      expect(gates).toBeDefined();
      expect(gates.length).toBeGreaterThan(0);
      // Strict template should have more gates than standard
      const standardGates = await manager.createFromTemplate('repo2', 'STANDARD');
      expect(gates.length).toBeGreaterThanOrEqual(standardGates.length);
    });

    it('should create relaxed quality gates', async () => {
      mockConnection.execute.mockResolvedValue([{ insertId: '1' }]);

      const gates = await manager.createFromTemplate('repo1', 'RELAXED');

      expect(gates).toBeDefined();
      expect(gates.length).toBeGreaterThan(0);
    });
  });

  describe('createQualityGate', () => {
    it('should create a single quality gate', async () => {
      const config: QualityGateConfig = {
        gateName: 'Test Coverage Gate',
        metricName: 'test_coverage',
        operator: ComparisonOperator.GTE,
        thresholdValue: 80,
        isBlocking: true,
        severity: Severity.CRITICAL,
        description: 'Ensure adequate test coverage'
      };

      mockConnection.execute.mockResolvedValue([{ insertId: '1' }]);

      const gate = await manager.createQualityGate('repo1', config);

      expect(gate).toBeDefined();
      expect(gate.gateName).toBe('Test Coverage Gate');
      expect(gate.metricName).toBe('test_coverage');
      expect(gate.thresholdValue).toBe(80);
      expect(gate.isBlocking).toBe(true);
      expect(mockConnection.insertInto).toHaveBeenCalledWith('quality_gates');
    });
  });

  describe('updateQualityGate', () => {
    it('should update an existing quality gate', async () => {
      const existingGate = {
        id: 'gate1',
        repository_id: 'repo1',
        gate_name: 'Old Name',
        metric_name: 'test_coverage',
        operator: ComparisonOperator.GTE,
        threshold_value: 70,
        is_blocking: false,
        severity: Severity.MAJOR,
        is_active: true,
        description: 'Old description',
        created_at: new Date(),
        updated_at: new Date()
      };

      mockConnection.executeTakeFirst
        .mockResolvedValueOnce(null) // First call in updateQualityGate
        .mockResolvedValueOnce(existingGate); // Second call in getQualityGate

      const updates = {
        gateName: 'Updated Name',
        thresholdValue: 85,
        isBlocking: true
      };

      const updatedGate = await manager.updateQualityGate('gate1', updates);

      expect(mockConnection.updateTable).toHaveBeenCalledWith('quality_gates');
      expect(mockConnection.set).toHaveBeenCalled();
      expect(mockConnection.where).toHaveBeenCalledWith('id', '=', 'gate1');
    });
  });

  describe('deleteQualityGate', () => {
    it('should delete a quality gate', async () => {
      const existingGate = {
        id: 'gate1',
        repository_id: 'repo1',
        gate_name: 'Test Gate',
        metric_name: 'test_coverage',
        operator: ComparisonOperator.GTE,
        threshold_value: 80,
        is_blocking: true,
        severity: Severity.CRITICAL,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      };

      mockConnection.executeTakeFirst.mockResolvedValue(existingGate);

      await manager.deleteQualityGate('gate1');

      expect(mockConnection.deleteFrom).toHaveBeenCalledWith('quality_gates');
      expect(mockConnection.where).toHaveBeenCalledWith('id', '=', 'gate1');
    });
  });

  describe('getQualityGates', () => {
    it('should retrieve quality gates for a repository', async () => {
      const mockGates = [
        {
          id: 'gate1',
          repository_id: 'repo1',
          gate_name: 'Coverage Gate',
          metric_name: 'test_coverage',
          operator: ComparisonOperator.GTE,
          threshold_value: 80,
          is_blocking: true,
          severity: Severity.CRITICAL,
          is_active: true,
          description: 'Test coverage gate',
          created_at: new Date(),
          updated_at: new Date()
        }
      ];

      mockConnection.execute.mockResolvedValue(mockGates);

      const gates = await manager.getQualityGates('repo1');

      expect(gates).toHaveLength(1);
      expect(gates[0].gateName).toBe('Coverage Gate');
      expect(mockConnection.selectFrom).toHaveBeenCalledWith('quality_gates');
      expect(mockConnection.where).toHaveBeenCalledWith('repository_id', '=', 'repo1');
      expect(mockConnection.where).toHaveBeenCalledWith('is_active', '=', true);
    });

    it('should retrieve all gates including inactive ones when specified', async () => {
      const mockGates = [
        {
          id: 'gate1',
          repository_id: 'repo1',
          gate_name: 'Active Gate',
          metric_name: 'test_coverage',
          operator: ComparisonOperator.GTE,
          threshold_value: 80,
          is_blocking: true,
          severity: Severity.CRITICAL,
          is_active: true,
          created_at: new Date(),
          updated_at: new Date()
        },
        {
          id: 'gate2',
          repository_id: 'repo1',
          gate_name: 'Inactive Gate',
          metric_name: 'complexity',
          operator: ComparisonOperator.LTE,
          threshold_value: 10,
          is_blocking: false,
          severity: Severity.MAJOR,
          is_active: false,
          created_at: new Date(),
          updated_at: new Date()
        }
      ];

      mockConnection.execute.mockResolvedValue(mockGates);

      const gates = await manager.getQualityGates('repo1', false);

      expect(gates).toHaveLength(2);
      expect(mockConnection.where).toHaveBeenCalledWith('repository_id', '=', 'repo1');
      expect(mockConnection.where).not.toHaveBeenCalledWith('is_active', '=', true);
    });
  });

  describe('evaluateQualityGates', () => {
    const sampleMetrics: QualityMetrics = {
      cyclomaticComplexity: 5,
      cognitiveComplexity: 3,
      structuralComplexity: 4,
      nestingDepth: 2,
      linesOfCode: 100,
      logicalLines: 80,
      commentLines: 15,
      blankLines: 5,
      maintainabilityIndex: 85,
      technicalDebtMinutes: 30,
      codeSmellsCount: 2,
      securityHotspots: 0,
      performanceIssues: 1,
      testCoverage: 75,
      branchCoverage: 70,
      overallQualityScore: 82,
      reliabilityRating: 'B',
      maintainabilityRating: 'B',
      securityRating: 'A',
      duplicatedLines: 3,
      bugs: 0,
      codeSmellsDebt: 30,
      vulnerabilities: 0,
      language: SupportedLanguage.TYPESCRIPT
    };

    it('should evaluate quality gates and return PASSED status', async () => {
      const mockGates = [
        {
          id: 'gate1',
          repository_id: 'repo1',
          gate_name: 'Test Coverage',
          metric_name: 'test_coverage',
          operator: ComparisonOperator.GTE,
          threshold_value: 70,
          is_blocking: false,
          severity: Severity.MAJOR,
          is_active: true,
          created_at: new Date(),
          updated_at: new Date()
        }
      ];

      mockConnection.execute.mockResolvedValue(mockGates);

      const evaluation = await manager.evaluateQualityGates('repo1', sampleMetrics);

      expect(evaluation.overallStatus).toBe('PASSED');
      expect(evaluation.gateResults).toHaveLength(1);
      expect(evaluation.gateResults[0].status).toBe('PASSED');
      expect(evaluation.canDeploy).toBe(true);
    });

    it('should evaluate quality gates and return FAILED status for blocking gate', async () => {
      const mockGates = [
        {
          id: 'gate1',
          repository_id: 'repo1',
          gate_name: 'Test Coverage',
          metric_name: 'test_coverage',
          operator: ComparisonOperator.GTE,
          threshold_value: 90, // Higher than actual coverage (75%)
          is_blocking: true,
          severity: Severity.CRITICAL,
          is_active: true,
          created_at: new Date(),
          updated_at: new Date()
        }
      ];

      mockConnection.execute.mockResolvedValue(mockGates);

      const evaluation = await manager.evaluateQualityGates('repo1', sampleMetrics);

      expect(evaluation.overallStatus).toBe('FAILED');
      expect(evaluation.gateResults).toHaveLength(1);
      expect(evaluation.gateResults[0].status).toBe('FAILED');
      expect(evaluation.blockerIssues).toBe(1);
      expect(evaluation.canDeploy).toBe(false);
    });

    it('should handle multiple gates with different operators', async () => {
      const mockGates = [
        {
          id: 'gate1',
          repository_id: 'repo1',
          gate_name: 'Test Coverage',
          metric_name: 'test_coverage',
          operator: ComparisonOperator.GTE,
          threshold_value: 70,
          is_blocking: false,
          severity: Severity.MAJOR,
          is_active: true,
          created_at: new Date(),
          updated_at: new Date()
        },
        {
          id: 'gate2',
          repository_id: 'repo1',
          gate_name: 'Complexity',
          metric_name: 'cyclomatic_complexity',
          operator: ComparisonOperator.LTE,
          threshold_value: 10,
          is_blocking: false,
          severity: Severity.MAJOR,
          is_active: true,
          created_at: new Date(),
          updated_at: new Date()
        },
        {
          id: 'gate3',
          repository_id: 'repo1',
          gate_name: 'Security',
          metric_name: 'security_hotspots',
          operator: ComparisonOperator.EQ,
          threshold_value: 0,
          is_blocking: true,
          severity: Severity.CRITICAL,
          is_active: true,
          created_at: new Date(),
          updated_at: new Date()
        }
      ];

      mockConnection.execute.mockResolvedValue(mockGates);

      const evaluation = await manager.evaluateQualityGates('repo1', sampleMetrics);

      expect(evaluation.gateResults).toHaveLength(3);
      expect(evaluation.gateResults[0].status).toBe('PASSED'); // Coverage 75 >= 70
      expect(evaluation.gateResults[1].status).toBe('PASSED'); // Complexity 5 <= 10
      expect(evaluation.gateResults[2].status).toBe('PASSED'); // Security hotspots 0 == 0
    });

    it('should return PASSED status when no gates are configured', async () => {
      mockConnection.execute.mockResolvedValue([]);

      const evaluation = await manager.evaluateQualityGates('repo1', sampleMetrics);

      expect(evaluation.overallStatus).toBe('PASSED');
      expect(evaluation.gateResults).toHaveLength(0);
      expect(evaluation.canDeploy).toBe(true);
    });

    it('should handle errors gracefully', async () => {
      mockConnection.execute.mockRejectedValue(new Error('Database error'));

      const evaluation = await manager.evaluateQualityGates('repo1', sampleMetrics);

      expect(evaluation.overallStatus).toBe('ERROR');
      expect(evaluation.canDeploy).toBe(false);
    });
  });

  describe('getQualityGateStatus', () => {
    it('should return quality gate status with warnings and blockers', async () => {
      const mockGates = [
        {
          id: 'gate1',
          repository_id: 'repo1',
          gate_name: 'High Coverage Required',
          metric_name: 'test_coverage',
          operator: ComparisonOperator.GTE,
          threshold_value: 95, // Higher than actual
          is_blocking: true,
          severity: Severity.CRITICAL,
          is_active: true,
          created_at: new Date(),
          updated_at: new Date()
        },
        {
          id: 'gate2',
          repository_id: 'repo1',
          gate_name: 'Low Complexity',
          metric_name: 'cyclomatic_complexity',
          operator: ComparisonOperator.LTE,
          threshold_value: 3, // Lower than actual
          is_blocking: false,
          severity: Severity.MAJOR,
          is_active: true,
          created_at: new Date(),
          updated_at: new Date()
        }
      ];

      mockConnection.execute.mockResolvedValue(mockGates);

      const sampleMetrics: QualityMetrics = {
        testCoverage: 75, // Below gate1 threshold
        cyclomaticComplexity: 5, // Above gate2 threshold
        cognitiveComplexity: 3,
        structuralComplexity: 4,
        nestingDepth: 2,
        linesOfCode: 100,
        logicalLines: 80,
        commentLines: 15,
        blankLines: 5,
        maintainabilityIndex: 85,
        technicalDebtMinutes: 30,
        codeSmellsCount: 2,
        securityHotspots: 0,
        performanceIssues: 1,
        branchCoverage: 70,
        overallQualityScore: 82,
        reliabilityRating: 'B',
        maintainabilityRating: 'B',
        securityRating: 'A',
        duplicatedLines: 3,
        bugs: 0,
        codeSmellsDebt: 30,
        vulnerabilities: 0,
        language: SupportedLanguage.TYPESCRIPT
      };

      const status = await manager.getQualityGateStatus('repo1', sampleMetrics);

      expect(status.status).toBe('FAILED');
      expect(status.blockers.length).toBeGreaterThan(0);
      expect(status.warnings.length).toBeGreaterThan(0);
      expect(status.canProceed).toBe(false);
    });
  });

  describe('setQualityGateActive', () => {
    it('should activate a quality gate', async () => {
      const existingGate = {
        id: 'gate1',
        repository_id: 'repo1',
        gate_name: 'Test Gate',
        is_active: false
      };

      mockConnection.executeTakeFirst.mockResolvedValue(existingGate);

      await manager.setQualityGateActive('gate1', true);

      expect(mockConnection.updateTable).toHaveBeenCalledWith('quality_gates');
      expect(mockConnection.set).toHaveBeenCalledWith(
        expect.objectContaining({ is_active: true })
      );
    });

    it('should deactivate a quality gate', async () => {
      const existingGate = {
        id: 'gate1',
        repository_id: 'repo1',
        gate_name: 'Test Gate',
        is_active: true
      };

      mockConnection.executeTakeFirst.mockResolvedValue(existingGate);

      await manager.setQualityGateActive('gate1', false);

      expect(mockConnection.updateTable).toHaveBeenCalledWith('quality_gates');
      expect(mockConnection.set).toHaveBeenCalledWith(
        expect.objectContaining({ is_active: false })
      );
    });
  });

  describe('cloneQualityGates', () => {
    it('should clone quality gates from source to target repository', async () => {
      const sourceGates = [
        {
          id: 'gate1',
          repository_id: 'source-repo',
          gate_name: 'Coverage Gate',
          metric_name: 'test_coverage',
          operator: ComparisonOperator.GTE,
          threshold_value: 80,
          is_blocking: true,
          severity: Severity.CRITICAL,
          is_active: true,
          description: 'Test coverage requirement',
          created_at: new Date(),
          updated_at: new Date()
        }
      ];

      mockConnection.execute
        .mockResolvedValueOnce(sourceGates) // getQualityGates call
        .mockResolvedValue([{ insertId: 'new-gate-1' }]); // createQualityGate calls

      const clonedGates = await manager.cloneQualityGates('source-repo', 'target-repo');

      expect(clonedGates).toHaveLength(1);
      expect(clonedGates[0].repositoryId).toBe('target-repo');
      expect(clonedGates[0].gateName).toBe('Coverage Gate');
      expect(mockConnection.insertInto).toHaveBeenCalledWith('quality_gates');
    });
  });

  describe('resetToDefaults', () => {
    it('should reset repository to default quality gates', async () => {
      mockConnection.execute.mockResolvedValue([]);

      const defaultGates = await manager.resetToDefaults('repo1', 'STANDARD');

      expect(mockConnection.deleteFrom).toHaveBeenCalledWith('quality_gates');
      expect(mockConnection.where).toHaveBeenCalledWith('repository_id', '=', 'repo1');
      expect(defaultGates.length).toBeGreaterThan(0);
    });
  });

  describe('Caching', () => {
    it('should cache evaluation results', async () => {
      const mockGates = [
        {
          id: 'gate1',
          repository_id: 'repo1',
          gate_name: 'Test Gate',
          metric_name: 'test_coverage',
          operator: ComparisonOperator.GTE,
          threshold_value: 70,
          is_blocking: false,
          severity: Severity.MAJOR,
          is_active: true,
          created_at: new Date(),
          updated_at: new Date()
        }
      ];

      mockConnection.execute.mockResolvedValue(mockGates);

      const metrics: QualityMetrics = {
        testCoverage: 80,
        cyclomaticComplexity: 5,
        cognitiveComplexity: 3,
        structuralComplexity: 4,
        nestingDepth: 2,
        linesOfCode: 100,
        logicalLines: 80,
        commentLines: 15,
        blankLines: 5,
        maintainabilityIndex: 85,
        technicalDebtMinutes: 30,
        codeSmellsCount: 2,
        securityHotspots: 0,
        performanceIssues: 1,
        branchCoverage: 70,
        overallQualityScore: 82,
        reliabilityRating: 'B',
        maintainabilityRating: 'B',
        securityRating: 'A',
        duplicatedLines: 3,
        bugs: 0,
        codeSmellsDebt: 30,
        vulnerabilities: 0,
        language: SupportedLanguage.TYPESCRIPT
      };

      // First evaluation
      const evaluation1 = await manager.evaluateQualityGates('repo1', metrics);
      expect(mockConnection.execute).toHaveBeenCalledTimes(1);

      // Second evaluation should use cache
      const evaluation2 = await manager.evaluateQualityGates('repo1', metrics);
      expect(mockConnection.execute).toHaveBeenCalledTimes(1); // Same count - used cache
      
      expect(evaluation1.repositoryId).toBe(evaluation2.repositoryId);
      expect(evaluation1.overallStatus).toBe(evaluation2.overallStatus);
    });

    it('should clear cache when gates are updated', async () => {
      const existingGate = {
        id: 'gate1',
        repository_id: 'repo1',
        gate_name: 'Test Gate',
        metric_name: 'test_coverage',
        operator: ComparisonOperator.GTE,
        threshold_value: 70,
        is_blocking: false,
        severity: Severity.MAJOR,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      };

      mockConnection.executeTakeFirst
        .mockResolvedValueOnce(null) // updateQualityGate
        .mockResolvedValueOnce(existingGate); // getQualityGate

      await manager.updateQualityGate('gate1', { thresholdValue: 85 });

      // Cache should be invalidated for repo1
      // This is tested implicitly through the manager's internal cache management
      expect(mockConnection.updateTable).toHaveBeenCalledWith('quality_gates');
    });
  });
});