/**
 * Quality Metrics Calculator Tests
 */

import { QualityMetricsCalculator } from '../quality-metrics-calculator.js';
import { SupportedLanguage } from '../../../../shared/types/codebase.js';

describe('QualityMetricsCalculator', () => {
  let calculator: QualityMetricsCalculator;

  beforeEach(() => {
    calculator = new QualityMetricsCalculator();
  });

  describe('calculateCyclomaticComplexity', () => {
    it('should calculate basic cyclomatic complexity', async () => {
      const ast = {
        type: 'Program',
        body: [
          {
            type: 'FunctionDeclaration',
            id: { name: 'simpleFunction' },
            body: {
              type: 'BlockStatement',
              body: [
                {
                  type: 'IfStatement',
                  test: { type: 'BinaryExpression' },
                  consequent: { type: 'BlockStatement' }
                }
              ]
            }
          }
        ]
      };

      const complexity = await calculator.calculateCyclomaticComplexity(ast);
      expect(complexity).toBeGreaterThan(1);
    });

    it('should return 1 for empty AST', async () => {
      const ast = { type: 'Program', body: [] };
      const complexity = await calculator.calculateCyclomaticComplexity(ast);
      expect(complexity).toBe(1);
    });

    it('should handle null AST', async () => {
      const complexity = await calculator.calculateCyclomaticComplexity(null as any);
      expect(complexity).toBe(0);
    });
  });

  describe('calculateCognitiveComplexity', () => {
    it('should calculate cognitive complexity with nesting', async () => {
      const ast = {
        type: 'Program',
        body: [
          {
            type: 'FunctionDeclaration',
            body: {
              type: 'BlockStatement',
              body: [
                {
                  type: 'IfStatement',
                  consequent: {
                    type: 'BlockStatement',
                    body: [
                      {
                        type: 'ForStatement',
                        body: {
                          type: 'BlockStatement',
                          body: [
                            {
                              type: 'IfStatement',
                              consequent: { type: 'BlockStatement' }
                            }
                          ]
                        }
                      }
                    ]
                  }
                }
              ]
            }
          }
        ]
      };

      const complexity = await calculator.calculateCognitiveComplexity(ast);
      expect(complexity).toBeGreaterThan(0);
    });
  });

  describe('calculateNestingDepth', () => {
    it('should calculate maximum nesting depth', async () => {
      const ast = {
        type: 'Program',
        body: [
          {
            type: 'FunctionDeclaration',
            body: {
              type: 'BlockStatement', // depth 1
              body: [
                {
                  type: 'IfStatement',
                  consequent: {
                    type: 'BlockStatement', // depth 2
                    body: [
                      {
                        type: 'ForStatement',
                        body: {
                          type: 'BlockStatement' // depth 3
                        }
                      }
                    ]
                  }
                }
              ]
            }
          }
        ]
      };

      const depth = await calculator.calculateNestingDepth(ast);
      expect(depth).toBeGreaterThan(2);
    });

    it('should return 0 for flat structure', async () => {
      const ast = {
        type: 'Program',
        body: [
          { type: 'VariableDeclaration' },
          { type: 'ExpressionStatement' }
        ]
      };

      const depth = await calculator.calculateNestingDepth(ast);
      expect(depth).toBe(0);
    });
  });

  describe('calculateLinesOfCode', () => {
    it('should calculate lines of code correctly', async () => {
      const content = `function test() {
  // This is a comment
  console.log("Hello");
  
  return true;
}`;

      const metrics = await calculator.calculateLinesOfCode(content);
      
      expect(metrics.linesOfCode).toBe(6);
      expect(metrics.commentLines).toBeGreaterThan(0);
      expect(metrics.blankLines).toBeGreaterThan(0);
      expect(metrics.logicalLines).toBeGreaterThan(0);
    });

    it('should handle empty content', async () => {
      const metrics = await calculator.calculateLinesOfCode('');
      
      expect(metrics.linesOfCode).toBe(0);
      expect(metrics.commentLines).toBe(0);
      expect(metrics.blankLines).toBe(0);
      expect(metrics.logicalLines).toBe(0);
    });

    it('should detect Python comments correctly', async () => {
      const content = `# This is a Python comment
def hello_world():
    """This is a docstring"""
    print("Hello, World!")
    # Another comment
    return True`;

      const metrics = await calculator.calculateLinesOfCode(content);
      
      expect(metrics.linesOfCode).toBe(6);
      expect(metrics.commentLines).toBeGreaterThan(1);
    });
  });

  describe('calculateHalsteadMetrics', () => {
    it('should calculate Halstead metrics', async () => {
      const ast = {
        type: 'Program',
        body: [
          {
            type: 'FunctionDeclaration',
            id: { type: 'Identifier', name: 'add' },
            params: [
              { type: 'Identifier', name: 'a' },
              { type: 'Identifier', name: 'b' }
            ],
            body: {
              type: 'BlockStatement',
              body: [
                {
                  type: 'ReturnStatement',
                  argument: {
                    type: 'BinaryExpression',
                    operator: '+',
                    left: { type: 'Identifier', name: 'a' },
                    right: { type: 'Identifier', name: 'b' }
                  }
                }
              ]
            }
          }
        ]
      };

      const metrics = await calculator.calculateHalsteadMetrics(ast);
      
      expect(metrics.vocabulary).toBeGreaterThan(0);
      expect(metrics.length).toBeGreaterThan(0);
      expect(metrics.volume).toBeGreaterThanOrEqual(0);
    });

    it('should handle empty AST for Halstead metrics', async () => {
      const metrics = await calculator.calculateHalsteadMetrics(null as any);
      
      expect(metrics.vocabulary).toBe(0);
      expect(metrics.length).toBe(0);
      expect(metrics.volume).toBe(0);
    });
  });

  describe('calculateMaintainabilityIndex', () => {
    it('should calculate maintainability index', async () => {
      const complexity = {
        cyclomaticComplexity: 5,
        cognitiveComplexity: 3,
        structuralComplexity: 4,
        nestingDepth: 2
      };

      const sizeMetrics = {
        linesOfCode: 100,
        logicalLines: 80,
        commentLines: 15,
        blankLines: 5
      };

      const halstead = {
        vocabulary: 20,
        length: 100,
        calculatedLength: 95,
        volume: 460,
        difficulty: 5,
        effort: 2300,
        timeRequiredToProgram: 128,
        numberOfDeliveredBugs: 0.15
      };

      const index = await calculator.calculateMaintainabilityIndex(
        complexity,
        sizeMetrics,
        halstead
      );

      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThanOrEqual(171);
    });

    it('should handle zero lines of code', async () => {
      const complexity = { cyclomaticComplexity: 1, cognitiveComplexity: 0, structuralComplexity: 1, nestingDepth: 0 };
      const sizeMetrics = { linesOfCode: 0, logicalLines: 0, commentLines: 0, blankLines: 0 };

      const index = await calculator.calculateMaintainabilityIndex(complexity, sizeMetrics);
      expect(index).toBe(171); // Maximum maintainability for empty code
    });
  });

  describe('calculateTechnicalDebt', () => {
    it('should calculate technical debt from code smells', async () => {
      const codeSmells = [
        {
          id: '1',
          fileId: 'file1',
          repositoryId: 'repo1',
          smellType: 'LONG_METHOD' as any,
          severity: 'major' as any,
          title: 'Long method',
          description: 'Method too long',
          startLine: 10,
          effortMinutes: 30,
          isResolved: false,
          detectedAt: new Date()
        },
        {
          id: '2',
          fileId: 'file1',
          repositoryId: 'repo1',
          smellType: 'COMPLEX_CONDITION' as any,
          severity: 'minor' as any,
          title: 'Complex condition',
          description: 'Condition too complex',
          startLine: 20,
          effortMinutes: 15,
          isResolved: false,
          detectedAt: new Date()
        }
      ];

      const debt = await calculator.calculateTechnicalDebt(codeSmells);
      
      // Major (30 * 2) + Minor (15 * 1) = 75 minutes
      expect(debt).toBe(75);
    });

    it('should handle empty code smells array', async () => {
      const debt = await calculator.calculateTechnicalDebt([]);
      expect(debt).toBe(0);
    });
  });

  describe('calculateCompositeScore', () => {
    it('should calculate composite quality score', async () => {
      const metrics = {
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
        codeSmellsCount: 3,
        securityHotspots: 1,
        performanceIssues: 0,
        testCoverage: 75,
        branchCoverage: 70,
        overallQualityScore: 0,
        reliabilityRating: 'B' as any,
        maintainabilityRating: 'B' as any,
        securityRating: 'C' as any,
        duplicatedLines: 5,
        bugs: 0,
        codeSmellsDebt: 30,
        vulnerabilities: 0,
        language: SupportedLanguage.TYPESCRIPT
      };

      const score = await calculator.calculateCompositeScore(metrics);
      
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });
  });

  describe('calculateLanguageSpecificAdjustments', () => {
    it('should apply TypeScript adjustments', async () => {
      const metrics = {
        cyclomaticComplexity: 20,
        cognitiveComplexity: 15,
        structuralComplexity: 18,
        nestingDepth: 4,
        linesOfCode: 200,
        logicalLines: 160,
        commentLines: 30,
        blankLines: 10,
        maintainabilityIndex: 65,
        technicalDebtMinutes: 45,
        codeSmellsCount: 5,
        securityHotspots: 2,
        performanceIssues: 1,
        testCoverage: 80,
        branchCoverage: 75,
        overallQualityScore: 72,
        reliabilityRating: 'B' as any,
        maintainabilityRating: 'C' as any,
        securityRating: 'C' as any,
        duplicatedLines: 8,
        bugs: 1,
        codeSmellsDebt: 45,
        vulnerabilities: 0,
        language: SupportedLanguage.TYPESCRIPT
      };

      const adjustments = await calculator.calculateLanguageSpecificAdjustments(
        metrics,
        SupportedLanguage.TYPESCRIPT
      );

      expect(adjustments).toBeDefined();
      // TypeScript should get complexity adjustment for high complexity
      if (adjustments.cyclomaticComplexity) {
        expect(adjustments.cyclomaticComplexity).toBeLessThan(metrics.cyclomaticComplexity);
      }
    });

    it('should apply Python adjustments', async () => {
      const metrics = {
        cyclomaticComplexity: 10,
        cognitiveComplexity: 8,
        structuralComplexity: 9,
        nestingDepth: 3,
        linesOfCode: 150,
        logicalLines: 120,
        commentLines: 25,
        blankLines: 5,
        maintainabilityIndex: 75,
        technicalDebtMinutes: 20,
        codeSmellsCount: 2,
        securityHotspots: 0,
        performanceIssues: 0,
        testCoverage: 90,
        branchCoverage: 85,
        overallQualityScore: 85,
        reliabilityRating: 'A' as any,
        maintainabilityRating: 'B' as any,
        securityRating: 'A' as any,
        duplicatedLines: 3,
        bugs: 0,
        codeSmellsDebt: 20,
        vulnerabilities: 0,
        language: SupportedLanguage.PYTHON
      };

      const adjustments = await calculator.calculateLanguageSpecificAdjustments(
        metrics,
        SupportedLanguage.PYTHON
      );

      expect(adjustments).toBeDefined();
      // Python should get complexity penalty for complexity > 8
      if (adjustments.cyclomaticComplexity) {
        expect(adjustments.cyclomaticComplexity).toBeGreaterThan(metrics.cyclomaticComplexity);
      }
    });
  });

  describe('validateMetrics', () => {
    it('should validate correct metrics', async () => {
      const validMetrics = {
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
        codeSmellsCount: 3,
        securityHotspots: 1,
        performanceIssues: 0,
        testCoverage: 75,
        branchCoverage: 70,
        overallQualityScore: 72,
        reliabilityRating: 'B' as any,
        maintainabilityRating: 'B' as any,
        securityRating: 'C' as any,
        duplicatedLines: 5,
        bugs: 0,
        codeSmellsDebt: 30,
        vulnerabilities: 0,
        language: SupportedLanguage.TYPESCRIPT
      };

      const isValid = await calculator.validateMetrics(validMetrics);
      expect(isValid).toBe(true);
    });

    it('should reject invalid metrics', async () => {
      const invalidMetrics = {
        cyclomaticComplexity: 0, // Should be >= 1
        cognitiveComplexity: 3,
        structuralComplexity: 4,
        nestingDepth: 2,
        linesOfCode: -10, // Should be >= 0
        logicalLines: 80,
        commentLines: 15,
        blankLines: 5,
        maintainabilityIndex: 85,
        technicalDebtMinutes: 30,
        codeSmellsCount: 3,
        securityHotspots: 1,
        performanceIssues: 0,
        testCoverage: 150, // Should be <= 100
        branchCoverage: 70,
        overallQualityScore: 72,
        reliabilityRating: 'B' as any,
        maintainabilityRating: 'B' as any,
        securityRating: 'C' as any,
        duplicatedLines: 5,
        bugs: 0,
        codeSmellsDebt: 30,
        vulnerabilities: 0,
        language: SupportedLanguage.TYPESCRIPT
      };

      const isValid = await calculator.validateMetrics(invalidMetrics);
      expect(isValid).toBe(false);
    });
  });

  describe('getQualityRating', () => {
    it('should return correct ratings', () => {
      expect(calculator.getQualityRating(95)).toBe('A');
      expect(calculator.getQualityRating(85)).toBe('B');
      expect(calculator.getQualityRating(65)).toBe('C');
      expect(calculator.getQualityRating(45)).toBe('D');
      expect(calculator.getQualityRating(25)).toBe('E');
    });
  });

  describe('calculatePercentileRank', () => {
    it('should calculate percentile rank correctly', async () => {
      const benchmarkScores = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
      
      const rank75 = await calculator.calculatePercentileRank(75, benchmarkScores);
      expect(rank75).toBe(80); // 75 is better than 8 out of 10 scores
      
      const rank25 = await calculator.calculatePercentileRank(25, benchmarkScores);
      expect(rank25).toBe(20); // 25 is better than 2 out of 10 scores
      
      const rank150 = await calculator.calculatePercentileRank(150, benchmarkScores);
      expect(rank150).toBe(100); // 150 is better than all scores
    });

    it('should handle empty benchmark array', async () => {
      const rank = await calculator.calculatePercentileRank(50, []);
      expect(rank).toBe(50); // Default to median
    });
  });
});