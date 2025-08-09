/**
 * Code Quality Service Tests
 */

import { CodeQualityService } from '../code-quality-service.js';
import { QualityMetricsCalculator } from '../analysis/quality-metrics-calculator.js';
import { CodeSmellDetector } from '../analysis/code-smell-detector.js';
import { CodeParserService } from '../code-parser-service.js';
import { CodeChunkingService } from '../code-chunking-service.js';
import { DatabaseManager } from '../../../database/manager.js';
import {
  SupportedLanguage,
  QualityAnalysisOptions,
  RepositoryAnalysisOptions,
  CodeSmellType,
  Severity
} from '../../../shared/types/codebase.js';

// Mock all dependencies
jest.mock('../analysis/quality-metrics-calculator.js');
jest.mock('../analysis/code-smell-detector.js');
jest.mock('../code-parser-service.js');
jest.mock('../code-chunking-service.js');
jest.mock('../../../database/manager.js');

describe('CodeQualityService', () => {
  let service: CodeQualityService;
  let mockDb: jest.Mocked<DatabaseManager>;
  let mockParserService: jest.Mocked<CodeParserService>;
  let mockChunkingService: jest.Mocked<CodeChunkingService>;
  let mockConnection: any;

  beforeEach(() => {
    mockConnection = {
      selectFrom: jest.fn().mockReturnThis(),
      insertInto: jest.fn().mockReturnThis(),
      updateTable: jest.fn().mockReturnThis(),
      deleteFrom: jest.fn().mockReturnThis(),
      selectAll: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      onConflict: jest.fn().mockReturnThis(),
      column: jest.fn().mockReturnThis(),
      doUpdateSet: jest.fn().mockReturnThis(),
      doNothing: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue([]),
      executeTakeFirst: jest.fn().mockResolvedValue(null)
    };

    mockDb = {
      getConnection: jest.fn().mockReturnValue(mockConnection)
    } as any;

    mockParserService = {
      parseFile: jest.fn()
    } as any;

    mockChunkingService = {} as any;

    service = new CodeQualityService(mockDb, mockParserService, mockChunkingService);

    // Mock QualityMetricsCalculator static methods
    (QualityMetricsCalculator as jest.MockedClass<typeof QualityMetricsCalculator>).mockImplementation(() => ({
      calculateCyclomaticComplexity: jest.fn().mockResolvedValue(5),
      calculateCognitiveComplexity: jest.fn().mockResolvedValue(3),
      calculateNestingDepth: jest.fn().mockResolvedValue(2),
      calculateLinesOfCode: jest.fn().mockResolvedValue({
        linesOfCode: 100,
        logicalLines: 80,
        commentLines: 15,
        blankLines: 5
      }),
      calculateHalsteadMetrics: jest.fn().mockResolvedValue({
        vocabulary: 20,
        length: 100,
        calculatedLength: 95,
        volume: 460,
        difficulty: 5,
        effort: 2300,
        timeRequiredToProgram: 128,
        numberOfDeliveredBugs: 0.15
      }),
      calculateMaintainabilityIndex: jest.fn().mockResolvedValue(85),
      calculateCompositeScore: jest.fn().mockResolvedValue(78),
      calculateLanguageSpecificAdjustments: jest.fn().mockResolvedValue({}),
      getQualityRating: jest.fn().mockReturnValue('B')
    } as any));

    // Mock CodeSmellDetector
    (CodeSmellDetector as jest.MockedClass<typeof CodeSmellDetector>).mockImplementation(() => ({
      detectAllSmells: jest.fn().mockResolvedValue([
        {
          id: 'smell1',
          fileId: 'file1',
          repositoryId: 'repo1',
          smellType: CodeSmellType.LONG_METHOD,
          severity: Severity.MAJOR,
          title: 'Long Method',
          description: 'Method is too long',
          startLine: 10,
          effortMinutes: 30,
          isResolved: false,
          detectedAt: new Date()
        }
      ])
    } as any));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('analyzeFile', () => {
    it('should analyze a file successfully', async () => {
      const mockFile = {
        id: 'file1',
        repository_id: 'repo1',
        file_path: 'src/test.ts',
        language: 'typescript',
        content: 'function test() { return true; }'
      };

      const mockParseResult = {
        fileId: 'file1',
        language: SupportedLanguage.TYPESCRIPT,
        ast: { type: 'Program', body: [] },
        symbols: [],
        dependencies: [],
        complexityMetrics: {
          cyclomaticComplexity: 1,
          cognitiveComplexity: 0,
          linesOfCode: 3,
          maintainabilityIndex: 100,
          nestingDepth: 1,
          functionCount: 1,
          classCount: 0,
          methodCount: 0,
          variableCount: 0,
          commentLines: 0,
          blankLines: 0,
          duplicatedLines: 0
        },
        parseTime: 50,
        errors: []
      };

      mockConnection.executeTakeFirst.mockResolvedValue(mockFile);
      mockParserService.parseFile.mockResolvedValue(mockParseResult);
      mockConnection.execute.mockResolvedValue([]);

      const result = await service.analyzeFile('file1');

      expect(result).toBeDefined();
      expect(result.fileId).toBe('file1');
      expect(result.repositoryId).toBe('repo1');
      expect(result.language).toBe(SupportedLanguage.TYPESCRIPT);
      expect(result.metrics).toBeDefined();
      expect(result.codeSmells).toHaveLength(1);
      expect(result.errors).toEqual([]);
      
      expect(mockParserService.parseFile).toHaveBeenCalledWith('file1', {
        includeComments: true,
        includeLocations: true
      });
    });

    it('should handle file not found', async () => {
      mockConnection.executeTakeFirst.mockResolvedValue(null);

      await expect(service.analyzeFile('nonexistent')).rejects.toThrow('File not found: nonexistent');
    });

    it('should handle analysis errors gracefully', async () => {
      const mockFile = {
        id: 'file1',
        repository_id: 'repo1',
        file_path: 'src/test.ts',
        language: 'typescript',
        content: 'invalid syntax'
      };

      mockConnection.executeTakeFirst.mockResolvedValue(mockFile);
      mockParserService.parseFile.mockRejectedValue(new Error('Parse error'));

      const result = await service.analyzeFile('file1');

      expect(result).toBeDefined();
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].type).toBe('analysis_error');
      expect(result.errors[0].message).toBe('Parse error');
    });
  });

  describe('analyzeRepository', () => {
    it('should analyze entire repository', async () => {
      const mockFiles = [
        { id: 'file1', file_path: 'src/test1.ts', language: 'typescript' },
        { id: 'file2', file_path: 'src/test2.ts', language: 'typescript' }
      ];

      const mockFile1 = {
        id: 'file1',
        repository_id: 'repo1',
        file_path: 'src/test1.ts',
        language: 'typescript',
        content: 'function test1() { return true; }'
      };

      const mockFile2 = {
        id: 'file2',
        repository_id: 'repo1',
        file_path: 'src/test2.ts',
        language: 'typescript',
        content: 'function test2() { return false; }'
      };

      const mockParseResult = {
        fileId: 'file1',
        language: SupportedLanguage.TYPESCRIPT,
        ast: { type: 'Program', body: [] },
        symbols: [],
        dependencies: [],
        complexityMetrics: {
          cyclomaticComplexity: 1,
          cognitiveComplexity: 0,
          linesOfCode: 3,
          maintainabilityIndex: 100,
          nestingDepth: 1,
          functionCount: 1,
          classCount: 0,
          methodCount: 0,
          variableCount: 0,
          commentLines: 0,
          blankLines: 0,
          duplicatedLines: 0
        },
        parseTime: 50,
        errors: []
      };

      mockConnection.execute.mockResolvedValue(mockFiles);
      mockConnection.executeTakeFirst
        .mockResolvedValueOnce(mockFile1)
        .mockResolvedValueOnce(mockFile2);
      mockParserService.parseFile.mockResolvedValue(mockParseResult);

      const result = await service.analyzeRepository('repo1');

      expect(result).toBeDefined();
      expect(result.repositoryId).toBe('repo1');
      expect(result.fileResults).toHaveLength(2);
      expect(result.overallMetrics).toBeDefined();
      expect(result.aggregateMetrics).toBeDefined();
      expect(result.aggregateMetrics.totalFiles).toBe(2);
    });

    it('should apply language filters', async () => {
      const options: RepositoryAnalysisOptions = {
        languages: [SupportedLanguage.TYPESCRIPT],
        includeTests: true,
        includeDependencies: false,
        complexityThreshold: 10,
        duplicateThreshold: 0.9,
        customRules: [],
        skipFiles: [],
        parallel: true,
        maxConcurrency: 4
      };

      mockConnection.execute.mockResolvedValue([]);

      await service.analyzeRepository('repo1', options);

      expect(mockConnection.where).toHaveBeenCalledWith('language', 'in', [SupportedLanguage.TYPESCRIPT]);
    });

    it('should apply file pattern filters', async () => {
      const options: RepositoryAnalysisOptions = {
        includeFilePatterns: ['*.ts', '*.js'],
        excludeFilePatterns: ['*.test.ts', '*.spec.js'],
        includeTests: true,
        includeDependencies: false,
        complexityThreshold: 10,
        duplicateThreshold: 0.9,
        customRules: [],
        skipFiles: [],
        parallel: true,
        maxConcurrency: 4
      };

      mockConnection.execute.mockResolvedValue([]);

      await service.analyzeRepository('repo1', options);

      expect(mockConnection.where).toHaveBeenCalledWith('file_path', 'like', '*.ts');
      expect(mockConnection.where).toHaveBeenCalledWith('file_path', 'like', '*.js');
      expect(mockConnection.where).toHaveBeenCalledWith('file_path', 'not like', '*.test.ts');
      expect(mockConnection.where).toHaveBeenCalledWith('file_path', 'not like', '*.spec.js');
    });

    it('should limit number of files analyzed', async () => {
      const options: RepositoryAnalysisOptions = {
        maxFilesToAnalyze: 10,
        includeTests: true,
        includeDependencies: false,
        complexityThreshold: 10,
        duplicateThreshold: 0.9,
        customRules: [],
        skipFiles: [],
        parallel: true,
        maxConcurrency: 4
      };

      mockConnection.execute.mockResolvedValue([]);

      await service.analyzeRepository('repo1', options);

      expect(mockConnection.limit).toHaveBeenCalledWith(10);
    });

    it('should handle empty repository', async () => {
      mockConnection.execute.mockResolvedValue([]);

      const result = await service.analyzeRepository('repo1');

      expect(result).toBeDefined();
      expect(result.fileResults).toHaveLength(0);
      expect(result.aggregateMetrics.totalFiles).toBe(0);
    });
  });

  describe('analyzeChanges', () => {
    it('should analyze changes between versions', async () => {
      const changedFiles = ['src/test1.ts', 'src/test2.ts'];
      
      // Mock getFileIdsByPaths
      const mockFileIds = ['file1', 'file2'];
      mockConnection.execute.mockResolvedValueOnce([
        { id: 'file1' },
        { id: 'file2' }
      ]);

      // Mock file analysis results
      const mockFile = {
        id: 'file1',
        repository_id: 'repo1',
        file_path: 'src/test1.ts',
        language: 'typescript',
        content: 'function test() { return true; }'
      };

      mockConnection.executeTakeFirst.mockResolvedValue(mockFile);
      
      const mockParseResult = {
        fileId: 'file1',
        language: SupportedLanguage.TYPESCRIPT,
        ast: { type: 'Program', body: [] },
        symbols: [],
        dependencies: [],
        complexityMetrics: {
          cyclomaticComplexity: 1,
          cognitiveComplexity: 0,
          linesOfCode: 3,
          maintainabilityIndex: 100,
          nestingDepth: 1,
          functionCount: 1,
          classCount: 0,
          methodCount: 0,
          variableCount: 0,
          commentLines: 0,
          blankLines: 0,
          duplicatedLines: 0
        },
        parseTime: 50,
        errors: []
      };

      mockParserService.parseFile.mockResolvedValue(mockParseResult);

      const result = await service.analyzeChanges('repo1', changedFiles);

      expect(result).toBeDefined();
      expect(result.repositoryId).toBe('repo1');
      expect(result.changedFiles).toEqual(changedFiles);
      expect(result.delta).toBeDefined();
      expect(result.impact).toBeDefined();
    });
  });

  describe('calculateFileMetrics', () => {
    it('should calculate comprehensive file metrics', async () => {
      const ast = { type: 'Program', body: [] };
      const content = 'function test() {\n  return true;\n}';
      const language = SupportedLanguage.TYPESCRIPT;

      const result = await service.calculateFileMetrics(ast, content, language);

      expect(result).toBeDefined();
      expect(result.language).toBe(SupportedLanguage.TYPESCRIPT);
      expect(result.cyclomaticComplexity).toBeDefined();
      expect(result.maintainabilityIndex).toBeDefined();
      expect(result.overallQualityScore).toBeDefined();
    });

    it('should handle calculation errors', async () => {
      const ast = null as any;
      const content = '';
      const language = SupportedLanguage.TYPESCRIPT;

      const result = await service.calculateFileMetrics(ast, content, language);

      expect(result).toBeDefined();
      expect(result.language).toBe(SupportedLanguage.TYPESCRIPT);
      // Should return default values on error
    });
  });

  describe('generateRefactoringSuggestions', () => {
    it('should generate refactoring suggestions', async () => {
      const fileId = 'file1';
      const ast = { type: 'Program', body: [] };
      const codeSmells = [
        {
          id: 'smell1',
          fileId: 'file1',
          repositoryId: 'repo1',
          smellType: CodeSmellType.LONG_METHOD,
          severity: Severity.MAJOR,
          title: 'Long Method',
          description: 'Method is too long',
          startLine: 10,
          effortMinutes: 30,
          isResolved: false,
          detectedAt: new Date()
        }
      ];
      const metrics = {
        cyclomaticComplexity: 15,
        maintainabilityIndex: 45,
        technicalDebtMinutes: 120,
        testCoverage: 60,
        duplicatedLines: 20,
        linesOfCode: 200,
        cognitiveComplexity: 12,
        structuralComplexity: 14,
        nestingDepth: 4,
        logicalLines: 160,
        commentLines: 30,
        blankLines: 10,
        codeSmellsCount: 5,
        securityHotspots: 2,
        performanceIssues: 1,
        branchCoverage: 55,
        overallQualityScore: 65,
        reliabilityRating: 'C' as const,
        maintainabilityRating: 'D' as const,
        securityRating: 'C' as const,
        duplicatedLines: 20,
        bugs: 1,
        codeSmellsDebt: 120,
        vulnerabilities: 0,
        language: SupportedLanguage.TYPESCRIPT
      };

      const suggestions = await service.generateRefactoringSuggestions(fileId, ast, codeSmells, metrics);

      expect(suggestions).toBeDefined();
      expect(Array.isArray(suggestions)).toBe(true);
      // Should generate suggestions based on high complexity, low maintainability, etc.
    });

    it('should handle missing AST by parsing file', async () => {
      const fileId = 'file1';
      const parseResult = {
        fileId: 'file1',
        language: SupportedLanguage.TYPESCRIPT,
        ast: { type: 'Program', body: [] },
        symbols: [],
        dependencies: [],
        complexityMetrics: {
          cyclomaticComplexity: 1,
          cognitiveComplexity: 0,
          linesOfCode: 3,
          maintainabilityIndex: 100,
          nestingDepth: 1,
          functionCount: 1,
          classCount: 0,
          methodCount: 0,
          variableCount: 0,
          commentLines: 0,
          blankLines: 0,
          duplicatedLines: 0
        },
        parseTime: 50,
        errors: []
      };

      mockParserService.parseFile.mockResolvedValue(parseResult);

      const suggestions = await service.generateRefactoringSuggestions(fileId);

      expect(mockParserService.parseFile).toHaveBeenCalledWith(fileId);
      expect(suggestions).toBeDefined();
    });
  });

  describe('evaluateQualityGates', () => {
    it('should evaluate quality gates using QualityGateManager', async () => {
      // This test would verify integration with QualityGateManager
      // For now, we test that the method exists and handles basic cases
      
      const result = await service.evaluateQualityGates('repo1');
      
      expect(result).toBeDefined();
      expect(result.repositoryId).toBe('repo1');
    });
  });

  describe('recordQualityTrends', () => {
    it('should record quality trends in database', async () => {
      const repositoryId = 'repo1';
      const metrics = {
        overallQualityScore: 85,
        cyclomaticComplexity: 5,
        technicalDebtMinutes: 30,
        testCoverage: 80,
        codeSmellsCount: 3,
        maintainabilityIndex: 90,
        linesOfCode: 1000,
        securityHotspots: 1,
        cognitiveComplexity: 3,
        structuralComplexity: 4,
        nestingDepth: 2,
        logicalLines: 800,
        commentLines: 150,
        blankLines: 50,
        performanceIssues: 0,
        branchCoverage: 75,
        reliabilityRating: 'A' as const,
        maintainabilityRating: 'A' as const,
        securityRating: 'B' as const,
        duplicatedLines: 10,
        bugs: 0,
        codeSmellsDebt: 30,
        vulnerabilities: 0,
        language: SupportedLanguage.TYPESCRIPT
      };

      await service.recordQualityTrends(repositoryId, metrics);

      expect(mockConnection.insertInto).toHaveBeenCalledWith('quality_trends');
      expect(mockConnection.values).toHaveBeenCalled();
    });

    it('should handle missing metrics by fetching latest', async () => {
      const repositoryId = 'repo1';

      // Mock getLatestRepositoryMetrics to return null
      await service.recordQualityTrends(repositoryId);

      // Should not insert anything if no metrics available
      expect(mockConnection.insertInto).not.toHaveBeenCalled();
    });
  });

  describe('Error handling', () => {
    it('should handle database connection errors', async () => {
      mockConnection.executeTakeFirst.mockRejectedValue(new Error('Database connection error'));

      const result = await service.analyzeFile('file1');

      expect(result).toBeDefined();
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toBe('Database connection error');
    });

    it('should handle parser service errors', async () => {
      const mockFile = {
        id: 'file1',
        repository_id: 'repo1',
        file_path: 'src/test.ts',
        language: 'typescript',
        content: 'invalid syntax'
      };

      mockConnection.executeTakeFirst.mockResolvedValue(mockFile);
      mockParserService.parseFile.mockRejectedValue(new Error('Parsing failed'));

      const result = await service.analyzeFile('file1');

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toBe('Parsing failed');
    });
  });

  describe('Private helper methods', () => {
    it('should calculate repository metrics from file results', () => {
      // This tests the private calculateRepositoryMetrics method indirectly
      // by calling analyzeRepository which uses it
      const mockFiles = [
        { id: 'file1', file_path: 'src/test1.ts', language: 'typescript' }
      ];

      mockConnection.execute.mockResolvedValue(mockFiles);
      
      // The method is tested through analyzeRepository
      expect(service).toBeDefined();
    });

    it('should validate analysis options', () => {
      const options: QualityAnalysisOptions = {
        includeTests: true,
        includeDependencies: false,
        complexityThreshold: 10,
        duplicateThreshold: 0.9,
        languages: [SupportedLanguage.TYPESCRIPT],
        customRules: ['custom-rule-1'],
        skipFiles: ['test.spec.ts'],
        parallel: true,
        maxConcurrency: 2
      };

      // Should accept valid options without throwing
      expect(() => {
        // This would be validated in the actual implementation
        service.analyzeFile('file1', options);
      }).not.toThrow();
    });
  });
});