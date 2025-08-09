/**
 * Quality Metrics Calculator
 * 
 * Advanced code quality metrics calculation including complexity, maintainability,
 * and technical debt analysis for multiple programming languages.
 */

import { 
  AST, 
  ComplexityMetrics, 
  QualityMetrics, 
  SupportedLanguage,
  SizeMetrics,
  HalsteadMetrics,
  CodeSmell
} from '../../../shared/types/codebase.js';

/**
 * Core quality metrics calculator with language-specific analysis
 */
export class QualityMetricsCalculator {
  
  // ===================
  // COMPLEXITY CALCULATIONS
  // ===================
  
  /**
   * Calculate cyclomatic complexity from AST
   * McCabe's cyclomatic complexity metric
   */
  async calculateCyclomaticComplexity(ast: AST): Promise<number> {
    if (!ast) return 0;
    
    let complexity = 1; // Base complexity
    
    const complexityNodes = new Set([
      // Control flow statements
      'IfStatement', 'WhileStatement', 'ForStatement', 'DoWhileStatement',
      'SwitchCase', 'CatchClause', 'ConditionalExpression',
      
      // Logical operators
      'LogicalExpression',
      
      // Function/method declarations
      'FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression',
      'MethodDefinition',
      
      // Language-specific nodes
      'for_statement', 'while_statement', 'if_statement', 'match_statement',
      'try_statement', 'except_clause', 'elif_clause'
    ]);
    
    const traverse = (node: any): void => {
      if (!node || typeof node !== 'object') return;
      
      // Check current node type
      if (node.type && complexityNodes.has(node.type)) {
        if (node.type === 'LogicalExpression' && (node.operator === '&&' || node.operator === '||')) {
          complexity += 1;
        } else if (node.type === 'SwitchCase') {
          complexity += 1;
        } else if (!node.type.includes('Declaration') && !node.type.includes('Expression')) {
          complexity += 1;
        }
      }
      
      // Special handling for switch statements
      if (node.type === 'SwitchStatement') {
        const cases = node.cases || [];
        complexity += Math.max(1, cases.length - 1); // -1 for default case
      }
      
      // Recursively traverse children
      if (node.children) {
        node.children.forEach((child: any) => traverse(child));
      }
      
      // Handle other properties that might contain nodes
      Object.values(node).forEach((value) => {
        if (Array.isArray(value)) {
          value.forEach((item) => {
            if (item && typeof item === 'object' && item.type) {
              traverse(item);
            }
          });
        } else if (value && typeof value === 'object' && value.type) {
          traverse(value);
        }
      });
    };
    
    traverse(ast);
    return Math.max(1, complexity);
  }
  
  /**
   * Calculate cognitive complexity from AST
   * Measures how difficult code is to understand
   */
  async calculateCognitiveComplexity(ast: AST): Promise<number> {
    if (!ast) return 0;
    
    let complexity = 0;
    let nestingLevel = 0;
    
    const cognitiveNodes = {
      // Base complexity +1
      'IfStatement': 1,
      'SwitchStatement': 1,
      'ForStatement': 1,
      'WhileStatement': 1,
      'DoWhileStatement': 1,
      'CatchClause': 1,
      'ConditionalExpression': 1,
      
      // Nesting increment nodes
      'IfStatement_nested': true,
      'ForStatement_nested': true,
      'WhileStatement_nested': true,
      'DoWhileStatement_nested': true,
      'SwitchStatement_nested': true,
      'TryStatement': true,
      
      // Language-specific
      'for_statement': 1,
      'while_statement': 1,
      'if_statement': 1,
      'match_statement': 1,
      'try_statement': 1
    };
    
    const traverse = (node: any, depth: number = 0): void => {
      if (!node || typeof node !== 'object') return;
      
      const nodeType = node.type;
      if (!nodeType) return;
      
      // Increase nesting for certain constructs
      let newDepth = depth;
      const isNestingNode = [
        'IfStatement', 'ForStatement', 'WhileStatement', 'DoWhileStatement',
        'SwitchStatement', 'TryStatement', 'CatchClause',
        'if_statement', 'for_statement', 'while_statement', 'try_statement'
      ].includes(nodeType);
      
      if (isNestingNode) {
        newDepth = depth + 1;
      }
      
      // Add base complexity
      if (cognitiveNodes[nodeType as keyof typeof cognitiveNodes]) {
        const baseComplexity = typeof cognitiveNodes[nodeType as keyof typeof cognitiveNodes] === 'number' 
          ? cognitiveNodes[nodeType as keyof typeof cognitiveNodes] as number
          : 1;
        complexity += baseComplexity + Math.max(0, newDepth - 1);
      }
      
      // Handle logical operators
      if (nodeType === 'LogicalExpression') {
        if (node.operator === '&&' || node.operator === '||') {
          complexity += 1;
        }
      }
      
      // Handle break statements (reduce complexity)
      if (nodeType === 'BreakStatement' || nodeType === 'ContinueStatement') {
        complexity += 1;
      }
      
      // Recursively traverse children with updated depth
      if (node.children) {
        node.children.forEach((child: any) => traverse(child, newDepth));
      }
      
      Object.values(node).forEach((value) => {
        if (Array.isArray(value)) {
          value.forEach((item) => {
            if (item && typeof item === 'object' && item.type) {
              traverse(item, newDepth);
            }
          });
        } else if (value && typeof value === 'object' && value.type) {
          traverse(value, newDepth);
        }
      });
    };
    
    traverse(ast);
    return complexity;
  }
  
  /**
   * Calculate maximum nesting depth
   */
  async calculateNestingDepth(ast: AST): Promise<number> {
    if (!ast) return 0;
    
    let maxDepth = 0;
    
    const nestingNodes = new Set([
      'IfStatement', 'ForStatement', 'WhileStatement', 'DoWhileStatement',
      'SwitchStatement', 'TryStatement', 'CatchClause', 'BlockStatement',
      'FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression',
      'if_statement', 'for_statement', 'while_statement', 'try_statement',
      'function_definition', 'class_definition', 'with_statement'
    ]);
    
    const traverse = (node: any, depth: number = 0): void => {
      if (!node || typeof node !== 'object') return;
      
      let currentDepth = depth;
      
      if (node.type && nestingNodes.has(node.type)) {
        currentDepth = depth + 1;
        maxDepth = Math.max(maxDepth, currentDepth);
      }
      
      // Traverse children
      if (node.children) {
        node.children.forEach((child: any) => traverse(child, currentDepth));
      }
      
      Object.values(node).forEach((value) => {
        if (Array.isArray(value)) {
          value.forEach((item) => {
            if (item && typeof item === 'object' && item.type) {
              traverse(item, currentDepth);
            }
          });
        } else if (value && typeof value === 'object' && value.type) {
          traverse(value, currentDepth);
        }
      });
    };
    
    traverse(ast);
    return maxDepth;
  }
  
  // ===================
  // SIZE METRICS
  // ===================
  
  /**
   * Calculate comprehensive lines of code metrics
   */
  async calculateLinesOfCode(content: string): Promise<SizeMetrics> {
    if (!content) {
      return {
        linesOfCode: 0,
        logicalLines: 0,
        commentLines: 0,
        blankLines: 0
      };
    }
    
    const lines = content.split('\n');
    let logicalLines = 0;
    let commentLines = 0;
    let blankLines = 0;
    
    // Regular expressions for different comment styles
    const commentPatterns = {
      singleLine: /^\s*(\/\/|#|--|%|;)/,
      blockStart: /\/\*|\(\*|<!--|\"{3}|'{3}/,
      blockEnd: /\*\/|\*\)|-->|\"{3}|'{3}/,
      pythonDocstring: /^\s*('''|"""|r'''|r"""|u'''|u"""|f'''|f""")/
    };
    
    let inBlockComment = false;
    let blockCommentType = '';
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // Empty line
      if (trimmedLine === '') {
        blankLines++;
        continue;
      }
      
      // Check for block comment start/end
      if (!inBlockComment) {
        for (const [type, pattern] of Object.entries(commentPatterns)) {
          if (type.includes('Start') || type.includes('python')) {
            const match = trimmedLine.match(pattern as RegExp);
            if (match) {
              inBlockComment = true;
              blockCommentType = type;
              commentLines++;
              break;
            }
          }
        }
      }
      
      if (inBlockComment) {
        if (!commentLines || trimmedLine !== lines[lines.indexOf(line)]) {
          commentLines++;
        }
        
        // Check for block comment end
        if (blockCommentType === 'blockStart' && commentPatterns.blockEnd.test(trimmedLine)) {
          inBlockComment = false;
        } else if (blockCommentType === 'pythonDocstring' && commentPatterns.pythonDocstring.test(trimmedLine) && lines.indexOf(line) > 0) {
          inBlockComment = false;
        }
        continue;
      }
      
      // Single line comment
      if (commentPatterns.singleLine.test(trimmedLine)) {
        commentLines++;
        continue;
      }
      
      // Logical line (contains actual code)
      logicalLines++;
    }
    
    return {
      linesOfCode: lines.length,
      logicalLines,
      commentLines,
      blankLines
    };
  }
  
  /**
   * Calculate Halstead complexity metrics
   */
  async calculateHalsteadMetrics(ast: AST): Promise<HalsteadMetrics> {
    if (!ast) {
      return {
        vocabulary: 0,
        length: 0,
        calculatedLength: 0,
        volume: 0,
        difficulty: 0,
        effort: 0,
        timeRequiredToProgram: 0,
        numberOfDeliveredBugs: 0
      };
    }
    
    const operators = new Set<string>();
    const operands = new Set<string>();
    let operatorCount = 0;
    let operandCount = 0;
    
    // Define operators and operands for different languages
    const operatorPatterns = new Set([
      // Arithmetic
      '+', '-', '*', '/', '%', '**', '//',
      // Comparison
      '==', '!=', '<', '>', '<=', '>=', '===', '!==',
      // Logical
      '&&', '||', '!', 'and', 'or', 'not',
      // Bitwise
      '&', '|', '^', '~', '<<', '>>',
      // Assignment
      '=', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=',
      // Unary
      '++', '--',
      // Membership
      'in', 'instanceof', 'typeof',
      // Control flow
      'if', 'else', 'elif', 'for', 'while', 'do', 'switch', 'case', 'default',
      'try', 'catch', 'finally', 'throw', 'return', 'break', 'continue',
      // Function/method calls
      '()', '[]', '{}', '.', '->', '=>',
      // Keywords
      'var', 'let', 'const', 'function', 'class', 'new', 'this', 'super',
      'import', 'export', 'from', 'as', 'default'
    ]);
    
    const traverse = (node: any): void => {
      if (!node || typeof node !== 'object') return;
      
      const nodeType = node.type;
      
      // Count operators
      if (nodeType && (
        nodeType.includes('Operator') ||
        nodeType.includes('Statement') ||
        nodeType.includes('Expression') ||
        nodeType.includes('Declaration')
      )) {
        const operator = node.operator || nodeType;
        if (operatorPatterns.has(operator) || operatorPatterns.has(nodeType)) {
          operators.add(operator);
          operatorCount++;
        }
      }
      
      // Count operands (identifiers, literals)
      if (nodeType === 'Identifier' || nodeType === 'Literal' || 
          nodeType.includes('Literal') || nodeType === 'identifier' ||
          nodeType === 'number' || nodeType === 'string') {
        const operand = node.name || node.value || node.raw || 'literal';
        operands.add(String(operand));
        operandCount++;
      }
      
      // Traverse children
      if (node.children) {
        node.children.forEach((child: any) => traverse(child));
      }
      
      Object.values(node).forEach((value) => {
        if (Array.isArray(value)) {
          value.forEach((item) => {
            if (item && typeof item === 'object' && item.type) {
              traverse(item);
            }
          });
        } else if (value && typeof value === 'object' && value.type) {
          traverse(value);
        }
      });
    };
    
    traverse(ast);
    
    // Calculate Halstead metrics
    const n1 = operators.size; // Number of distinct operators
    const n2 = operands.size;  // Number of distinct operands
    const N1 = operatorCount;  // Total operators
    const N2 = operandCount;   // Total operands
    
    const vocabulary = n1 + n2;
    const length = N1 + N2;
    const calculatedLength = n1 * Math.log2(n1) + n2 * Math.log2(n2);
    const volume = length * Math.log2(vocabulary);
    const difficulty = (n1 / 2) * (N2 / n2);
    const effort = difficulty * volume;
    const timeRequiredToProgram = effort / 18; // Assuming 18 elementary mental discriminations per second
    const numberOfDeliveredBugs = Math.pow(effort, 2/3) / 3000;
    
    return {
      vocabulary,
      length,
      calculatedLength,
      volume: isFinite(volume) ? volume : 0,
      difficulty: isFinite(difficulty) ? difficulty : 0,
      effort: isFinite(effort) ? effort : 0,
      timeRequiredToProgram: isFinite(timeRequiredToProgram) ? timeRequiredToProgram : 0,
      numberOfDeliveredBugs: isFinite(numberOfDeliveredBugs) ? numberOfDeliveredBugs : 0
    };
  }
  
  // ===================
  // MAINTAINABILITY CALCULATIONS
  // ===================
  
  /**
   * Calculate maintainability index
   * Based on original Microsoft maintainability index formula
   */
  async calculateMaintainabilityIndex(
    complexity: ComplexityMetrics, 
    sizeMetrics: SizeMetrics,
    halstead?: HalsteadMetrics
  ): Promise<number> {
    const { cyclomaticComplexity } = complexity;
    const { linesOfCode, commentLines } = sizeMetrics;
    const halsteadVolume = halstead?.volume || 0;
    
    // Avoid division by zero
    if (linesOfCode === 0) return 171; // Maximum maintainability index
    
    // Microsoft's Maintainability Index formula
    // MI = 171 - 5.2 * ln(Halstead Volume) - 0.23 * Cyclomatic Complexity - 16.2 * ln(Lines of Code) + 50 * sin(sqrt(2.4 * Percent Comments))
    
    const percentComments = (commentLines / linesOfCode) * 100;
    const logHalsteadVolume = halsteadVolume > 0 ? Math.log(halsteadVolume) : 0;
    const logLinesOfCode = Math.log(linesOfCode);
    const commentFactor = 50 * Math.sin(Math.sqrt(2.4 * percentComments));
    
    let maintainabilityIndex = 171 
      - (5.2 * logHalsteadVolume)
      - (0.23 * cyclomaticComplexity)
      - (16.2 * logLinesOfCode)
      + commentFactor;
    
    // Normalize to 0-171 range
    maintainabilityIndex = Math.max(0, Math.min(171, maintainabilityIndex));
    
    return maintainabilityIndex;
  }
  
  /**
   * Calculate technical debt from code smells
   */
  async calculateTechnicalDebt(codeSmells: CodeSmell[]): Promise<number> {
    if (!codeSmells || codeSmells.length === 0) return 0;
    
    // Sum up effort estimates from all code smells
    const totalDebt = codeSmells.reduce((total, smell) => {
      const effort = smell.effortMinutes || 0;
      
      // Apply multiplier based on severity
      let multiplier = 1;
      switch (smell.severity) {
        case 'critical':
          multiplier = 3;
          break;
        case 'major':
          multiplier = 2;
          break;
        case 'minor':
          multiplier = 1;
          break;
        case 'info':
          multiplier = 0.5;
          break;
      }
      
      return total + (effort * multiplier);
    }, 0);
    
    return totalDebt;
  }
  
  // ===================
  // QUALITY SCORING
  // ===================
  
  /**
   * Calculate composite quality score
   */
  async calculateCompositeScore(metrics: QualityMetrics): Promise<number> {
    const weights = {
      maintainability: 0.25,
      complexity: 0.20,
      coverage: 0.20,
      duplication: 0.15,
      issues: 0.20
    };
    
    // Normalize maintainability index (0-171 -> 0-100)
    const maintainabilityScore = Math.min(100, (metrics.maintainabilityIndex / 171) * 100);
    
    // Complexity score (lower is better)
    const complexityScore = Math.max(0, 100 - (metrics.cyclomaticComplexity * 2));
    
    // Coverage score (direct percentage)
    const coverageScore = metrics.testCoverage;
    
    // Duplication score (lower duplication is better)
    const duplicationScore = Math.max(0, 100 - (metrics.duplicatedLines / metrics.linesOfCode * 100));
    
    // Issues score (fewer issues is better)
    const issuesScore = Math.max(0, 100 - (metrics.codeSmellsCount * 5));
    
    const compositeScore = 
      (maintainabilityScore * weights.maintainability) +
      (complexityScore * weights.complexity) +
      (coverageScore * weights.coverage) +
      (duplicationScore * weights.duplication) +
      (issuesScore * weights.issues);
    
    return Math.max(0, Math.min(100, compositeScore));
  }
  
  /**
   * Normalize score based on metric type
   */
  async normalizeScore(rawScore: number, metric: string): Promise<number> {
    const normalizations: Record<string, (score: number) => number> = {
      'cyclomatic_complexity': (score) => Math.max(0, 100 - (score * 5)),
      'cognitive_complexity': (score) => Math.max(0, 100 - (score * 3)),
      'nesting_depth': (score) => Math.max(0, 100 - (score * 10)),
      'maintainability_index': (score) => (score / 171) * 100,
      'technical_debt_minutes': (score) => Math.max(0, 100 - (score / 60)), // Assuming 1 hour = 0 score
      'test_coverage': (score) => score, // Already a percentage
      'code_smells_count': (score) => Math.max(0, 100 - (score * 2))
    };
    
    const normalizer = normalizations[metric];
    if (normalizer) {
      return Math.max(0, Math.min(100, normalizer(rawScore)));
    }
    
    return Math.max(0, Math.min(100, rawScore));
  }
  
  // ===================
  // LANGUAGE-SPECIFIC METRICS
  // ===================
  
  /**
   * Calculate language-specific quality adjustments
   */
  async calculateLanguageSpecificAdjustments(
    metrics: QualityMetrics, 
    language: SupportedLanguage
  ): Promise<Partial<QualityMetrics>> {
    const adjustments: Partial<QualityMetrics> = {};
    
    switch (language) {
      case SupportedLanguage.TYPESCRIPT:
      case SupportedLanguage.JAVASCRIPT:
        // JavaScript/TypeScript specific adjustments
        // Higher complexity tolerance due to callback patterns
        if (metrics.cyclomaticComplexity > 15) {
          adjustments.cyclomaticComplexity = metrics.cyclomaticComplexity * 0.9;
        }
        break;
        
      case SupportedLanguage.PYTHON:
        // Python specific adjustments
        // Lower complexity tolerance due to readability emphasis
        if (metrics.cyclomaticComplexity > 8) {
          adjustments.cyclomaticComplexity = metrics.cyclomaticComplexity * 1.1;
        }
        break;
        
      case SupportedLanguage.JAVA:
        // Java specific adjustments
        // Account for verbose nature
        adjustments.linesOfCode = metrics.linesOfCode * 0.8;
        break;
        
      case SupportedLanguage.GO:
        // Go specific adjustments
        // Lower tolerance for complexity due to simplicity philosophy
        if (metrics.cyclomaticComplexity > 10) {
          adjustments.cyclomaticComplexity = metrics.cyclomaticComplexity * 1.2;
        }
        break;
        
      case SupportedLanguage.RUST:
        // Rust specific adjustments
        // Account for ownership system complexity
        adjustments.cognitiveComplexity = metrics.cognitiveComplexity * 0.9;
        break;
        
      case SupportedLanguage.CPP:
        // C++ specific adjustments
        // Higher tolerance due to template complexity
        adjustments.cyclomaticComplexity = metrics.cyclomaticComplexity * 0.85;
        break;
    }
    
    return adjustments;
  }
  
  // ===================
  // UTILITY METHODS
  // ===================
  
  /**
   * Validate metrics for consistency
   */
  async validateMetrics(metrics: QualityMetrics): Promise<boolean> {
    // Basic validation checks
    if (metrics.cyclomaticComplexity < 1) return false;
    if (metrics.linesOfCode < 0) return false;
    if (metrics.testCoverage < 0 || metrics.testCoverage > 100) return false;
    if (metrics.overallQualityScore < 0 || metrics.overallQualityScore > 100) return false;
    
    // Logical consistency checks
    const totalLines = metrics.linesOfCode;
    const componentLines = metrics.logicalLines + metrics.commentLines + metrics.blankLines;
    
    // Allow some tolerance for parsing differences
    if (Math.abs(totalLines - componentLines) > totalLines * 0.1) {
      return false;
    }
    
    return true;
  }
  
  /**
   * Get quality rating from score
   */
  getQualityRating(score: number): 'A' | 'B' | 'C' | 'D' | 'E' {
    if (score >= 90) return 'A';
    if (score >= 75) return 'B';
    if (score >= 60) return 'C';
    if (score >= 40) return 'D';
    return 'E';
  }
  
  /**
   * Calculate percentile ranking
   */
  async calculatePercentileRank(score: number, benchmarkScores: number[]): Promise<number> {
    if (benchmarkScores.length === 0) return 50; // Default to median
    
    const sorted = benchmarkScores.sort((a, b) => a - b);
    const rank = sorted.findIndex(s => s >= score);
    
    if (rank === -1) return 100; // Score is higher than all benchmarks
    
    return (rank / sorted.length) * 100;
  }
}