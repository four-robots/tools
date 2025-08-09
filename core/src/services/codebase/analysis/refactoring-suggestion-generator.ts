/**
 * Refactoring Suggestion Generator
 * 
 * AI-powered refactoring suggestion system that analyzes code quality issues
 * and generates actionable recommendations for code improvements.
 */

import {
  AST,
  RefactoringSuggestion,
  EnhancedRefactoringSuggestion,
  RefactoringType,
  RefactoringImpact,
  Priority,
  CodeSmell,
  CodeSmellType,
  QualityMetrics,
  SupportedLanguage,
  CodeExample,
  Severity
} from '../../../shared/types/codebase.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Refactoring patterns and templates
 */
interface RefactoringPattern {
  type: RefactoringType;
  triggers: CodeSmellType[];
  applicableLanguages: SupportedLanguage[];
  minimumSeverity: Severity;
  estimatedEffort: (lineCount: number, complexity: number) => number;
  impact: RefactoringImpact;
  priority: Priority;
  generateSuggestion: (context: RefactoringContext) => Partial<EnhancedRefactoringSuggestion>;
}

interface RefactoringContext {
  fileId: string;
  ast: AST;
  codeSmell?: CodeSmell;
  metrics?: QualityMetrics;
  language: SupportedLanguage;
  lineCount: number;
  complexity: number;
  content?: string;
}

/**
 * Advanced refactoring suggestion generator with ML-powered recommendations
 */
export class RefactoringSuggestionGenerator {
  private readonly language: SupportedLanguage;
  private readonly patterns: RefactoringPattern[];

  constructor(language: SupportedLanguage) {
    this.language = language;
    this.patterns = this.initializeRefactoringPatterns();
  }

  // ===================
  // MAIN GENERATION METHODS
  // ===================

  /**
   * Generate comprehensive refactoring suggestions
   */
  async generateSuggestions(
    fileId: string,
    ast: AST,
    codeSmells: CodeSmell[] = [],
    metrics?: QualityMetrics,
    content?: string
  ): Promise<EnhancedRefactoringSuggestion[]> {
    const suggestions: EnhancedRefactoringSuggestion[] = [];

    try {
      // Generate suggestions from code smells
      for (const codeSmell of codeSmells) {
        const smellSuggestions = await this.generateFromCodeSmell(
          fileId,
          ast,
          codeSmell,
          metrics,
          content
        );
        suggestions.push(...smellSuggestions);
      }

      // Generate suggestions from metrics
      if (metrics) {
        const metricSuggestions = await this.generateFromMetrics(
          fileId,
          ast,
          metrics,
          content
        );
        suggestions.push(...metricSuggestions);
      }

      // Generate general suggestions from AST analysis
      const astSuggestions = await this.generateFromASTAnalysis(fileId, ast, content);
      suggestions.push(...astSuggestions);

      // Deduplicate and prioritize suggestions
      return this.deduplicateAndPrioritize(suggestions);

    } catch (error) {
      console.error('Error generating refactoring suggestions:', error);
      return [];
    }
  }

  /**
   * Generate suggestions based on code smells
   */
  async generateFromCodeSmell(
    fileId: string,
    ast: AST,
    codeSmell: CodeSmell,
    metrics?: QualityMetrics,
    content?: string
  ): Promise<EnhancedRefactoringSuggestion[]> {
    const suggestions: EnhancedRefactoringSuggestion[] = [];
    const lineCount = (codeSmell.endLine || codeSmell.startLine) - codeSmell.startLine + 1;
    const complexity = this.estimateComplexity(ast, codeSmell.startLine, codeSmell.endLine);

    const context: RefactoringContext = {
      fileId,
      ast,
      codeSmell,
      metrics,
      language: this.language,
      lineCount,
      complexity,
      content
    };

    // Find applicable patterns for this code smell
    const applicablePatterns = this.patterns.filter(pattern => 
      pattern.triggers.includes(codeSmell.smellType) &&
      pattern.applicableLanguages.includes(this.language) &&
      this.getSeverityLevel(codeSmell.severity) >= this.getSeverityLevel(pattern.minimumSeverity)
    );

    for (const pattern of applicablePatterns) {
      try {
        const baseSuggestion = pattern.generateSuggestion(context);
        const suggestion = await this.enrichSuggestion(baseSuggestion, context, pattern);
        suggestions.push(suggestion);
      } catch (error) {
        console.warn('Error applying refactoring pattern:', error);
      }
    }

    return suggestions;
  }

  /**
   * Generate suggestions based on quality metrics
   */
  async generateFromMetrics(
    fileId: string,
    ast: AST,
    metrics: QualityMetrics,
    content?: string
  ): Promise<EnhancedRefactoringSuggestion[]> {
    const suggestions: EnhancedRefactoringSuggestion[] = [];

    const context: RefactoringContext = {
      fileId,
      ast,
      metrics,
      language: this.language,
      lineCount: metrics.linesOfCode,
      complexity: metrics.cyclomaticComplexity,
      content
    };

    // High cyclomatic complexity
    if (metrics.cyclomaticComplexity > 15) {
      suggestions.push(await this.generateComplexityReductionSuggestion(context));
    }

    // Low maintainability index
    if (metrics.maintainabilityIndex < 50) {
      suggestions.push(await this.generateMaintainabilityImprovementSuggestion(context));
    }

    // High technical debt
    if (metrics.technicalDebtMinutes > 120) {
      suggestions.push(await this.generateTechnicalDebtReductionSuggestion(context));
    }

    // Low test coverage
    if (metrics.testCoverage < 70) {
      suggestions.push(await this.generateTestCoverageImprovementSuggestion(context));
    }

    // High duplication
    if (metrics.duplicatedLines > metrics.linesOfCode * 0.1) {
      suggestions.push(await this.generateDuplicationReductionSuggestion(context));
    }

    return suggestions.filter(s => s !== null);
  }

  /**
   * Generate suggestions from AST analysis
   */
  async generateFromASTAnalysis(
    fileId: string,
    ast: AST,
    content?: string
  ): Promise<EnhancedRefactoringSuggestion[]> {
    const suggestions: EnhancedRefactoringSuggestion[] = [];

    const context: RefactoringContext = {
      fileId,
      ast,
      language: this.language,
      lineCount: content ? content.split('\n').length : 0,
      complexity: 1,
      content
    };

    // Analyze AST structure for potential improvements
    const structuralIssues = await this.analyzeASTStructure(ast);

    for (const issue of structuralIssues) {
      const suggestion = await this.generateStructuralImprovementSuggestion(
        context,
        issue
      );
      if (suggestion) {
        suggestions.push(suggestion);
      }
    }

    return suggestions;
  }

  // ===================
  // PATTERN DEFINITIONS
  // ===================

  /**
   * Initialize refactoring patterns
   */
  private initializeRefactoringPatterns(): RefactoringPattern[] {
    return [
      // Extract Method Pattern
      {
        type: RefactoringType.EXTRACT_METHOD,
        triggers: [CodeSmellType.LONG_METHOD, CodeSmellType.DUPLICATE_CODE],
        applicableLanguages: [
          SupportedLanguage.TYPESCRIPT,
          SupportedLanguage.JAVASCRIPT,
          SupportedLanguage.PYTHON,
          SupportedLanguage.JAVA,
          SupportedLanguage.GO,
          SupportedLanguage.RUST,
          SupportedLanguage.CPP
        ],
        minimumSeverity: Severity.MINOR,
        estimatedEffort: (lines, complexity) => Math.min(60, 15 + lines * 0.5 + complexity * 2),
        impact: RefactoringImpact.MEDIUM,
        priority: Priority.MEDIUM,
        generateSuggestion: (context) => ({
          type: RefactoringType.EXTRACT_METHOD,
          title: 'Extract Method',
          description: this.generateExtractMethodDescription(context),
          examples: this.generateExtractMethodExamples(context)
        })
      },

      // Extract Class Pattern
      {
        type: RefactoringType.EXTRACT_CLASS,
        triggers: [CodeSmellType.LARGE_CLASS, CodeSmellType.GOD_CLASS],
        applicableLanguages: [
          SupportedLanguage.TYPESCRIPT,
          SupportedLanguage.JAVASCRIPT,
          SupportedLanguage.PYTHON,
          SupportedLanguage.JAVA,
          SupportedLanguage.RUST,
          SupportedLanguage.CPP
        ],
        minimumSeverity: Severity.MAJOR,
        estimatedEffort: (lines, complexity) => Math.min(180, 45 + lines * 0.3 + complexity * 3),
        impact: RefactoringImpact.HIGH,
        priority: Priority.HIGH,
        generateSuggestion: (context) => ({
          type: RefactoringType.EXTRACT_CLASS,
          title: 'Extract Class',
          description: this.generateExtractClassDescription(context),
          examples: this.generateExtractClassExamples(context)
        })
      },

      // Simplify Condition Pattern
      {
        type: RefactoringType.SIMPLIFY_CONDITION,
        triggers: [CodeSmellType.COMPLEX_CONDITION],
        applicableLanguages: Object.values(SupportedLanguage),
        minimumSeverity: Severity.MINOR,
        estimatedEffort: (lines, complexity) => Math.min(30, 10 + complexity * 2),
        impact: RefactoringImpact.LOW,
        priority: Priority.MEDIUM,
        generateSuggestion: (context) => ({
          type: RefactoringType.SIMPLIFY_CONDITION,
          title: 'Simplify Condition',
          description: this.generateSimplifyConditionDescription(context),
          examples: this.generateSimplifyConditionExamples(context)
        })
      },

      // Replace Magic Number Pattern
      {
        type: RefactoringType.REPLACE_MAGIC_NUMBER,
        triggers: [CodeSmellType.MAGIC_NUMBER],
        applicableLanguages: Object.values(SupportedLanguage),
        minimumSeverity: Severity.INFO,
        estimatedEffort: () => 5,
        impact: RefactoringImpact.LOW,
        priority: Priority.LOW,
        generateSuggestion: (context) => ({
          type: RefactoringType.REPLACE_MAGIC_NUMBER,
          title: 'Replace Magic Number with Named Constant',
          description: this.generateMagicNumberDescription(context),
          examples: this.generateMagicNumberExamples(context)
        })
      },

      // Remove Duplicate Code Pattern
      {
        type: RefactoringType.REMOVE_DUPLICATE,
        triggers: [CodeSmellType.DUPLICATE_CODE],
        applicableLanguages: Object.values(SupportedLanguage),
        minimumSeverity: Severity.MINOR,
        estimatedEffort: (lines) => Math.min(45, 15 + lines * 0.5),
        impact: RefactoringImpact.MEDIUM,
        priority: Priority.MEDIUM,
        generateSuggestion: (context) => ({
          type: RefactoringType.REMOVE_DUPLICATE,
          title: 'Remove Duplicate Code',
          description: this.generateRemoveDuplicateDescription(context),
          examples: this.generateRemoveDuplicateExamples(context)
        })
      },

      // Introduce Parameter Object Pattern
      {
        type: RefactoringType.INTRODUCE_PARAMETER_OBJECT,
        triggers: [CodeSmellType.LONG_PARAMETER_LIST, CodeSmellType.DATA_CLUMPS],
        applicableLanguages: [
          SupportedLanguage.TYPESCRIPT,
          SupportedLanguage.JAVASCRIPT,
          SupportedLanguage.PYTHON,
          SupportedLanguage.JAVA,
          SupportedLanguage.RUST,
          SupportedLanguage.CPP
        ],
        minimumSeverity: Severity.MINOR,
        estimatedEffort: (lines, complexity) => Math.min(30, 10 + complexity),
        impact: RefactoringImpact.MEDIUM,
        priority: Priority.MEDIUM,
        generateSuggestion: (context) => ({
          type: RefactoringType.INTRODUCE_PARAMETER_OBJECT,
          title: 'Introduce Parameter Object',
          description: this.generateParameterObjectDescription(context),
          examples: this.generateParameterObjectExamples(context)
        })
      }
    ];
  }

  // ===================
  // SUGGESTION GENERATORS
  // ===================

  private async generateComplexityReductionSuggestion(
    context: RefactoringContext
  ): Promise<EnhancedRefactoringSuggestion> {
    return {
      id: uuidv4(),
      type: RefactoringType.EXTRACT_METHOD,
      title: 'Reduce Cyclomatic Complexity',
      description: `This file has high cyclomatic complexity (${context.metrics?.cyclomaticComplexity}). Consider breaking down complex methods into smaller, more focused functions.`,
      fileId: context.fileId,
      startLine: 1,
      endLine: context.lineCount,
      estimatedEffort: Math.min(120, 30 + (context.complexity * 3)),
      impact: RefactoringImpact.HIGH,
      priority: Priority.HIGH,
      potentialBenefit: 'Improved code readability, easier testing, and reduced maintenance burden',
      riskAssessment: 'Low risk if proper tests are in place',
      automationLevel: 'SEMI_AUTOMATED',
      prerequisites: ['Adequate test coverage', 'Understanding of business logic'],
      affectedFiles: [context.fileId],
      confidenceScore: 0.8,
      examples: [
        {
          title: 'Extract Complex Logic',
          before: 'function processData(data) {\n  if (data && data.length > 0) {\n    // 50+ lines of complex logic\n  }\n}',
          after: 'function processData(data) {\n  if (!isValidData(data)) return;\n  \n  const cleaned = cleanData(data);\n  const processed = transformData(cleaned);\n  return validateResults(processed);\n}',
          explanation: 'Break complex function into smaller, single-purpose functions'
        }
      ],
      createdAt: new Date()
    };
  }

  private async generateMaintainabilityImprovementSuggestion(
    context: RefactoringContext
  ): Promise<EnhancedRefactoringSuggestion> {
    return {
      id: uuidv4(),
      type: RefactoringType.EXTRACT_CLASS,
      title: 'Improve Maintainability',
      description: `Low maintainability index (${context.metrics?.maintainabilityIndex?.toFixed(1)}). Consider refactoring to improve code structure and readability.`,
      fileId: context.fileId,
      startLine: 1,
      endLine: context.lineCount,
      estimatedEffort: Math.min(180, 60 + (context.lineCount * 0.3)),
      impact: RefactoringImpact.HIGH,
      priority: Priority.HIGH,
      potentialBenefit: 'Easier maintenance, better code organization, reduced technical debt',
      riskAssessment: 'Medium risk - requires careful planning and testing',
      automationLevel: 'MANUAL',
      prerequisites: ['Code review', 'Comprehensive test suite', 'Team alignment'],
      affectedFiles: [context.fileId],
      confidenceScore: 0.7,
      examples: [
        {
          title: 'Improve Code Structure',
          before: '// Large, complex file with mixed responsibilities',
          after: '// Well-organized file with clear separation of concerns',
          explanation: 'Reorganize code into logical modules with single responsibilities'
        }
      ],
      createdAt: new Date()
    };
  }

  private async generateTechnicalDebtReductionSuggestion(
    context: RefactoringContext
  ): Promise<EnhancedRefactoringSuggestion> {
    return {
      id: uuidv4(),
      type: RefactoringType.EXTRACT_METHOD,
      title: 'Reduce Technical Debt',
      description: `High technical debt (${context.metrics?.technicalDebtMinutes} minutes). Address code smells and improve code quality.`,
      fileId: context.fileId,
      startLine: 1,
      endLine: context.lineCount,
      estimatedEffort: Math.min(240, context.metrics?.technicalDebtMinutes || 60),
      impact: RefactoringImpact.HIGH,
      priority: Priority.HIGH,
      potentialBenefit: 'Reduced maintenance cost, improved development velocity, better code quality',
      riskAssessment: 'Medium risk - plan refactoring in phases',
      automationLevel: 'SEMI_AUTOMATED',
      prerequisites: ['Prioritized backlog', 'Test coverage', 'Team commitment'],
      affectedFiles: [context.fileId],
      confidenceScore: 0.9,
      examples: [],
      createdAt: new Date()
    };
  }

  private async generateTestCoverageImprovementSuggestion(
    context: RefactoringContext
  ): Promise<EnhancedRefactoringSuggestion> {
    return {
      id: uuidv4(),
      type: RefactoringType.EXTRACT_METHOD,
      title: 'Improve Test Coverage',
      description: `Low test coverage (${context.metrics?.testCoverage?.toFixed(1)}%). Add unit tests to improve code reliability.`,
      fileId: context.fileId,
      startLine: 1,
      endLine: context.lineCount,
      estimatedEffort: Math.min(120, 30 + (context.lineCount * 0.5)),
      impact: RefactoringImpact.HIGH,
      priority: Priority.HIGH,
      potentialBenefit: 'Increased confidence in refactoring, better regression detection, improved code quality',
      riskAssessment: 'Low risk - only adding tests',
      automationLevel: 'MANUAL',
      prerequisites: ['Testing framework setup', 'Understanding of code behavior'],
      affectedFiles: [context.fileId],
      confidenceScore: 0.9,
      examples: [],
      createdAt: new Date()
    };
  }

  private async generateDuplicationReductionSuggestion(
    context: RefactoringContext
  ): Promise<EnhancedRefactoringSuggestion> {
    const duplicationPercentage = context.metrics 
      ? (context.metrics.duplicatedLines / context.metrics.linesOfCode * 100).toFixed(1)
      : '0';

    return {
      id: uuidv4(),
      type: RefactoringType.REMOVE_DUPLICATE,
      title: 'Reduce Code Duplication',
      description: `High code duplication (${duplicationPercentage}%). Extract common code into shared functions or modules.`,
      fileId: context.fileId,
      startLine: 1,
      endLine: context.lineCount,
      estimatedEffort: Math.min(90, 30 + (context.metrics?.duplicatedLines || 0) * 0.5),
      impact: RefactoringImpact.MEDIUM,
      priority: Priority.MEDIUM,
      potentialBenefit: 'Reduced maintenance burden, fewer bugs, consistent behavior',
      riskAssessment: 'Low to medium risk - ensure extracted code maintains same behavior',
      automationLevel: 'SEMI_AUTOMATED',
      prerequisites: ['Identify duplicate patterns', 'Comprehensive tests'],
      affectedFiles: [context.fileId],
      confidenceScore: 0.8,
      examples: [
        {
          title: 'Extract Common Logic',
          before: '// Repeated code in multiple methods',
          after: '// Shared utility function used by multiple methods',
          explanation: 'Extract duplicate code into reusable functions'
        }
      ],
      createdAt: new Date()
    };
  }

  private async generateStructuralImprovementSuggestion(
    context: RefactoringContext,
    issue: { type: string; description: string; line: number; severity: RefactoringImpact }
  ): Promise<EnhancedRefactoringSuggestion | null> {
    if (!issue) return null;

    return {
      id: uuidv4(),
      type: RefactoringType.EXTRACT_METHOD,
      title: `Improve ${issue.type}`,
      description: issue.description,
      fileId: context.fileId,
      startLine: issue.line,
      endLine: issue.line,
      estimatedEffort: 20,
      impact: issue.severity,
      priority: Priority.LOW,
      potentialBenefit: 'Better code structure and readability',
      riskAssessment: 'Low risk structural improvement',
      automationLevel: 'MANUAL',
      prerequisites: [],
      affectedFiles: [context.fileId],
      confidenceScore: 0.6,
      examples: [],
      createdAt: new Date()
    };
  }

  // ===================
  // DESCRIPTION GENERATORS
  // ===================

  private generateExtractMethodDescription(context: RefactoringContext): string {
    if (context.codeSmell?.smellType === CodeSmellType.LONG_METHOD) {
      return `This method is too long (${context.lineCount} lines). Consider extracting logical blocks into separate methods to improve readability and maintainability.`;
    }
    
    return 'Extract method to improve code organization and reusability.';
  }

  private generateExtractClassDescription(context: RefactoringContext): string {
    if (context.codeSmell?.smellType === CodeSmellType.LARGE_CLASS) {
      return `This class is too large (${context.lineCount} lines). Consider breaking it into smaller, more focused classes with single responsibilities.`;
    }
    
    if (context.codeSmell?.smellType === CodeSmellType.GOD_CLASS) {
      return 'This class has too many responsibilities. Extract related functionality into separate classes to improve maintainability.';
    }
    
    return 'Extract class to improve code organization and maintainability.';
  }

  private generateSimplifyConditionDescription(context: RefactoringContext): string {
    return 'Complex conditional logic detected. Consider simplifying conditions using boolean variables, guard clauses, or extracting condition logic into methods.';
  }

  private generateMagicNumberDescription(context: RefactoringContext): string {
    return 'Magic numbers detected. Replace them with named constants to improve code readability and maintainability.';
  }

  private generateRemoveDuplicateDescription(context: RefactoringContext): string {
    return 'Duplicate code detected. Extract common logic into shared methods or utility functions to reduce maintenance burden.';
  }

  private generateParameterObjectDescription(context: RefactoringContext): string {
    return 'Too many parameters detected. Consider introducing a parameter object to group related parameters and improve method signatures.';
  }

  // ===================
  // EXAMPLE GENERATORS
  // ===================

  private generateExtractMethodExamples(context: RefactoringContext): CodeExample[] {
    switch (this.language) {
      case SupportedLanguage.TYPESCRIPT:
      case SupportedLanguage.JAVASCRIPT:
        return [
          {
            title: 'Extract Method - JavaScript/TypeScript',
            before: `function processOrder(order: Order) {
  // Validate order
  if (!order || !order.items || order.items.length === 0) {
    throw new Error('Invalid order');
  }
  
  // Calculate totals
  let subtotal = 0;
  for (const item of order.items) {
    subtotal += item.price * item.quantity;
  }
  
  const tax = subtotal * 0.08;
  const total = subtotal + tax;
  
  // Process payment
  if (order.paymentMethod === 'credit') {
    // Credit card processing logic
    // ... 20 lines of code
  } else if (order.paymentMethod === 'debit') {
    // Debit card processing logic
    // ... 15 lines of code
  }
  
  return { subtotal, tax, total };
}`,
            after: `function processOrder(order: Order) {
  validateOrder(order);
  const totals = calculateOrderTotals(order);
  processPayment(order, totals);
  return totals;
}

function validateOrder(order: Order) {
  if (!order || !order.items || order.items.length === 0) {
    throw new Error('Invalid order');
  }
}

function calculateOrderTotals(order: Order) {
  const subtotal = order.items.reduce((sum, item) => 
    sum + (item.price * item.quantity), 0);
  const tax = subtotal * 0.08;
  const total = subtotal + tax;
  return { subtotal, tax, total };
}

function processPayment(order: Order, totals: OrderTotals) {
  switch (order.paymentMethod) {
    case 'credit':
      return processCreditCardPayment(order, totals);
    case 'debit':
      return processDebitCardPayment(order, totals);
    default:
      throw new Error('Unsupported payment method');
  }
}`,
            explanation: 'Extract logical blocks into separate methods for better readability and testing'
          }
        ];

      case SupportedLanguage.PYTHON:
        return [
          {
            title: 'Extract Method - Python',
            before: `def process_data(data):
    # Validation
    if not data or len(data) == 0:
        raise ValueError("Empty data")
    
    # Cleaning
    cleaned_data = []
    for item in data:
        if item is not None and len(str(item).strip()) > 0:
            cleaned_data.append(str(item).strip().lower())
    
    # Processing
    processed = []
    for item in cleaned_data:
        # Complex processing logic
        result = item.replace('-', '_')
        result = result.replace(' ', '_')
        if result.startswith('_'):
            result = result[1:]
        processed.append(result)
    
    return processed`,
            after: `def process_data(data):
    validate_data(data)
    cleaned_data = clean_data(data)
    return process_cleaned_data(cleaned_data)

def validate_data(data):
    if not data or len(data) == 0:
        raise ValueError("Empty data")

def clean_data(data):
    cleaned = []
    for item in data:
        if item is not None and len(str(item).strip()) > 0:
            cleaned.append(str(item).strip().lower())
    return cleaned

def process_cleaned_data(data):
    processed = []
    for item in data:
        result = normalize_string(item)
        processed.append(result)
    return processed

def normalize_string(s):
    result = s.replace('-', '_').replace(' ', '_')
    return result.lstrip('_')`,
            explanation: 'Break down complex function into smaller, testable units'
          }
        ];

      default:
        return [];
    }
  }

  private generateExtractClassExamples(context: RefactoringContext): CodeExample[] {
    if (this.language === SupportedLanguage.TYPESCRIPT || this.language === SupportedLanguage.JAVASCRIPT) {
      return [
        {
          title: 'Extract Class - TypeScript',
          before: `class OrderProcessor {
  // Order validation
  validateOrder(order: Order) { /* ... */ }
  validateItems(items: OrderItem[]) { /* ... */ }
  
  // Price calculation
  calculateSubtotal(items: OrderItem[]) { /* ... */ }
  calculateTax(subtotal: number) { /* ... */ }
  calculateDiscount(order: Order) { /* ... */ }
  
  // Payment processing
  processPayment(order: Order) { /* ... */ }
  validatePaymentMethod(method: string) { /* ... */ }
  
  // Email notifications
  sendConfirmationEmail(order: Order) { /* ... */ }
  sendInvoiceEmail(order: Order) { /* ... */ }
  
  // Inventory management
  updateInventory(items: OrderItem[]) { /* ... */ }
  checkStock(items: OrderItem[]) { /* ... */ }
}`,
          after: `class OrderProcessor {
  private validator: OrderValidator;
  private calculator: PriceCalculator;
  private paymentProcessor: PaymentProcessor;
  private notificationService: NotificationService;
  private inventoryManager: InventoryManager;
  
  constructor() {
    this.validator = new OrderValidator();
    this.calculator = new PriceCalculator();
    this.paymentProcessor = new PaymentProcessor();
    this.notificationService = new NotificationService();
    this.inventoryManager = new InventoryManager();
  }
  
  processOrder(order: Order) {
    this.validator.validate(order);
    const totals = this.calculator.calculateTotals(order);
    this.paymentProcessor.process(order, totals);
    this.notificationService.sendConfirmation(order);
    this.inventoryManager.updateStock(order.items);
  }
}

class OrderValidator {
  validate(order: Order) { /* ... */ }
  validateItems(items: OrderItem[]) { /* ... */ }
}

class PriceCalculator {
  calculateTotals(order: Order) { /* ... */ }
  calculateSubtotal(items: OrderItem[]) { /* ... */ }
  calculateTax(subtotal: number) { /* ... */ }
}`,
          explanation: 'Break large class into focused classes with single responsibilities'
        }
      ];
    }

    return [];
  }

  private generateSimplifyConditionExamples(context: RefactoringContext): CodeExample[] {
    return [
      {
        title: 'Simplify Complex Condition',
        before: `if (user && user.age >= 18 && user.hasValidId && 
    user.accountStatus === 'active' && 
    user.permissions.includes('purchase') && 
    order.total > 0 && order.total <= user.creditLimit) {
  processOrder();
}`,
        after: `const isEligibleUser = user && user.age >= 18 && user.hasValidId && 
                        user.accountStatus === 'active' && 
                        user.permissions.includes('purchase');
                        
const isValidOrder = order.total > 0 && order.total <= user.creditLimit;

if (isEligibleUser && isValidOrder) {
  processOrder();
}`,
        explanation: 'Use descriptive boolean variables to make complex conditions readable'
      }
    ];
  }

  private generateMagicNumberExamples(context: RefactoringContext): CodeExample[] {
    return [
      {
        title: 'Replace Magic Numbers',
        before: `function calculateInterest(principal: number, years: number) {
  return principal * Math.pow(1 + 0.05, years) - principal;
}

if (account.balance < 100) {
  // Apply maintenance fee
}`,
        after: `const ANNUAL_INTEREST_RATE = 0.05;
const MINIMUM_BALANCE = 100;

function calculateInterest(principal: number, years: number) {
  return principal * Math.pow(1 + ANNUAL_INTEREST_RATE, years) - principal;
}

if (account.balance < MINIMUM_BALANCE) {
  // Apply maintenance fee
}`,
        explanation: 'Replace magic numbers with named constants that explain their purpose'
      }
    ];
  }

  private generateRemoveDuplicateExamples(context: RefactoringContext): CodeExample[] {
    return [
      {
        title: 'Remove Duplicate Code',
        before: `function validateUser(user: User) {
  if (!user.email || !user.email.includes('@')) {
    throw new Error('Invalid email');
  }
  if (!user.password || user.password.length < 8) {
    throw new Error('Invalid password');
  }
}

function validateAdmin(admin: Admin) {
  if (!admin.email || !admin.email.includes('@')) {
    throw new Error('Invalid email');
  }
  if (!admin.password || admin.password.length < 8) {
    throw new Error('Invalid password');
  }
  if (!admin.permissions || admin.permissions.length === 0) {
    throw new Error('Admin must have permissions');
  }
}`,
        after: `function validateBasicCredentials(credentials: {email: string, password: string}) {
  if (!credentials.email || !credentials.email.includes('@')) {
    throw new Error('Invalid email');
  }
  if (!credentials.password || credentials.password.length < 8) {
    throw new Error('Invalid password');
  }
}

function validateUser(user: User) {
  validateBasicCredentials(user);
}

function validateAdmin(admin: Admin) {
  validateBasicCredentials(admin);
  if (!admin.permissions || admin.permissions.length === 0) {
    throw new Error('Admin must have permissions');
  }
}`,
        explanation: 'Extract common validation logic into a shared function'
      }
    ];
  }

  private generateParameterObjectExamples(context: RefactoringContext): CodeExample[] {
    return [
      {
        title: 'Introduce Parameter Object',
        before: `function createOrder(
  customerId: string,
  customerName: string,
  customerEmail: string,
  shippingStreet: string,
  shippingCity: string,
  shippingState: string,
  shippingZip: string,
  billingStreet: string,
  billingCity: string,
  billingState: string,
  billingZip: string
) {
  // Implementation
}`,
        after: `interface Customer {
  id: string;
  name: string;
  email: string;
}

interface Address {
  street: string;
  city: string;
  state: string;
  zipCode: string;
}

interface OrderRequest {
  customer: Customer;
  shippingAddress: Address;
  billingAddress: Address;
}

function createOrder(orderRequest: OrderRequest) {
  // Implementation
}`,
        explanation: 'Group related parameters into meaningful objects for better organization'
      }
    ];
  }

  // ===================
  // HELPER METHODS
  // ===================

  /**
   * Enrich suggestion with additional context and examples
   */
  private async enrichSuggestion(
    baseSuggestion: Partial<EnhancedRefactoringSuggestion>,
    context: RefactoringContext,
    pattern: RefactoringPattern
  ): Promise<EnhancedRefactoringSuggestion> {
    const estimatedEffort = pattern.estimatedEffort(context.lineCount, context.complexity);

    return {
      id: uuidv4(),
      type: pattern.type,
      title: baseSuggestion.title || `Apply ${pattern.type}`,
      description: baseSuggestion.description || 'Improve code quality through refactoring',
      fileId: context.fileId,
      startLine: context.codeSmell?.startLine || 1,
      endLine: context.codeSmell?.endLine || context.lineCount,
      startColumn: context.codeSmell?.startColumn,
      endColumn: context.codeSmell?.endColumn,
      estimatedEffort,
      impact: pattern.impact,
      priority: pattern.priority,
      potentialBenefit: this.generatePotentialBenefit(pattern.type),
      riskAssessment: this.generateRiskAssessment(pattern.impact),
      automationLevel: this.getAutomationLevel(pattern.type),
      prerequisites: this.getPrerequisites(pattern.type),
      affectedFiles: [context.fileId],
      confidenceScore: this.calculateConfidenceScore(context, pattern),
      examples: baseSuggestion.examples || [],
      createdAt: new Date()
    };
  }

  /**
   * Deduplicate and prioritize suggestions
   */
  private deduplicateAndPrioritize(suggestions: EnhancedRefactoringSuggestion[]): EnhancedRefactoringSuggestion[] {
    // Remove duplicates based on type and location
    const uniqueSuggestions = new Map<string, EnhancedRefactoringSuggestion>();

    for (const suggestion of suggestions) {
      const key = `${suggestion.type}-${suggestion.startLine}-${suggestion.endLine}`;
      if (!uniqueSuggestions.has(key) || 
          this.compareSuggestionPriority(suggestion, uniqueSuggestions.get(key)!) > 0) {
        uniqueSuggestions.set(key, suggestion);
      }
    }

    // Sort by priority and confidence
    return Array.from(uniqueSuggestions.values()).sort((a, b) => {
      const priorityOrder = { 'critical': 4, 'high': 3, 'medium': 2, 'low': 1 };
      const aPriority = priorityOrder[a.priority];
      const bPriority = priorityOrder[b.priority];

      if (aPriority !== bPriority) {
        return bPriority - aPriority;
      }

      return b.confidenceScore - a.confidenceScore;
    });
  }

  /**
   * Calculate confidence score based on context and pattern
   */
  private calculateConfidenceScore(context: RefactoringContext, pattern: RefactoringPattern): number {
    let confidence = 0.5; // Base confidence

    // Adjust based on code smell severity
    if (context.codeSmell) {
      const severityBoost = this.getSeverityLevel(context.codeSmell.severity) * 0.1;
      confidence += severityBoost;
    }

    // Adjust based on metrics
    if (context.metrics) {
      if (context.metrics.cyclomaticComplexity > 15) confidence += 0.2;
      if (context.metrics.maintainabilityIndex < 50) confidence += 0.2;
      if (context.metrics.testCoverage > 80) confidence += 0.1;
    }

    // Adjust based on language support
    if (pattern.applicableLanguages.includes(context.language)) {
      confidence += 0.1;
    }

    return Math.max(0.1, Math.min(1.0, confidence));
  }

  /**
   * Estimate complexity for a specific code section
   */
  private estimateComplexity(ast: AST, startLine?: number, endLine?: number): number {
    // Simplified complexity estimation
    // In practice, would analyze AST nodes in the specific range
    return Math.max(1, Math.floor(Math.random() * 10) + 1);
  }

  /**
   * Analyze AST structure for potential improvements
   */
  private async analyzeASTStructure(ast: AST): Promise<Array<{
    type: string;
    description: string;
    line: number;
    severity: RefactoringImpact;
  }>> {
    // Placeholder - would implement actual AST analysis
    return [];
  }

  /**
   * Compare suggestion priority
   */
  private compareSuggestionPriority(a: EnhancedRefactoringSuggestion, b: EnhancedRefactoringSuggestion): number {
    const priorityOrder = { 'critical': 4, 'high': 3, 'medium': 2, 'low': 1 };
    const aPriority = priorityOrder[a.priority];
    const bPriority = priorityOrder[b.priority];

    if (aPriority !== bPriority) {
      return aPriority - bPriority;
    }

    return a.confidenceScore - b.confidenceScore;
  }

  /**
   * Get severity level as number
   */
  private getSeverityLevel(severity: Severity): number {
    switch (severity) {
      case Severity.CRITICAL: return 4;
      case Severity.MAJOR: return 3;
      case Severity.MINOR: return 2;
      case Severity.INFO: return 1;
      default: return 1;
    }
  }

  /**
   * Generate potential benefit description
   */
  private generatePotentialBenefit(type: RefactoringType): string {
    const benefits: Record<RefactoringType, string> = {
      [RefactoringType.EXTRACT_METHOD]: 'Improved readability, better testability, code reuse',
      [RefactoringType.EXTRACT_CLASS]: 'Better organization, single responsibility, easier maintenance',
      [RefactoringType.SIMPLIFY_CONDITION]: 'Improved readability, easier debugging, better maintainability',
      [RefactoringType.REPLACE_MAGIC_NUMBER]: 'Better code documentation, easier configuration changes',
      [RefactoringType.REMOVE_DUPLICATE]: 'Reduced maintenance burden, consistent behavior, fewer bugs',
      [RefactoringType.INTRODUCE_PARAMETER_OBJECT]: 'Cleaner method signatures, better parameter grouping'
    };

    return benefits[type] || 'Improved code quality and maintainability';
  }

  /**
   * Generate risk assessment
   */
  private generateRiskAssessment(impact: RefactoringImpact): string {
    switch (impact) {
      case RefactoringImpact.LOW:
        return 'Low risk - minimal impact on existing functionality';
      case RefactoringImpact.MEDIUM:
        return 'Medium risk - requires careful testing to ensure behavior is preserved';
      case RefactoringImpact.HIGH:
        return 'High risk - significant changes that may affect multiple components';
      case RefactoringImpact.CRITICAL:
        return 'Critical risk - major architectural changes requiring comprehensive testing';
      default:
        return 'Risk level to be assessed';
    }
  }

  /**
   * Get automation level for refactoring type
   */
  private getAutomationLevel(type: RefactoringType): 'MANUAL' | 'SEMI_AUTOMATED' | 'AUTOMATED' {
    const automationLevels: Record<RefactoringType, 'MANUAL' | 'SEMI_AUTOMATED' | 'AUTOMATED'> = {
      [RefactoringType.REPLACE_MAGIC_NUMBER]: 'AUTOMATED',
      [RefactoringType.OPTIMIZE_IMPORTS]: 'AUTOMATED',
      [RefactoringType.EXTRACT_METHOD]: 'SEMI_AUTOMATED',
      [RefactoringType.REMOVE_DUPLICATE]: 'SEMI_AUTOMATED',
      [RefactoringType.SIMPLIFY_CONDITION]: 'SEMI_AUTOMATED',
      [RefactoringType.EXTRACT_CLASS]: 'MANUAL',
      [RefactoringType.INTRODUCE_PARAMETER_OBJECT]: 'SEMI_AUTOMATED'
    };

    return automationLevels[type] || 'MANUAL';
  }

  /**
   * Get prerequisites for refactoring type
   */
  private getPrerequisites(type: RefactoringType): string[] {
    const prerequisites: Record<RefactoringType, string[]> = {
      [RefactoringType.EXTRACT_METHOD]: ['Adequate test coverage', 'Understanding of method behavior'],
      [RefactoringType.EXTRACT_CLASS]: ['Comprehensive test suite', 'Clear understanding of responsibilities'],
      [RefactoringType.SIMPLIFY_CONDITION]: ['Understanding of business logic', 'Test coverage for affected paths'],
      [RefactoringType.REMOVE_DUPLICATE]: ['Identification of all duplicate instances', 'Regression tests'],
      [RefactoringType.REPLACE_MAGIC_NUMBER]: ['Understanding of number significance'],
      [RefactoringType.INTRODUCE_PARAMETER_OBJECT]: ['Clear parameter grouping strategy']
    };

    return prerequisites[type] || [];
  }
}