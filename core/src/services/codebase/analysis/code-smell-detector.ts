/**
 * Code Smell Detector
 * 
 * Advanced code smell detection system with language-specific rules
 * and patterns for identifying maintainability issues in codebases.
 */

import { 
  AST, 
  CodeSmell, 
  CodeSmellType, 
  Severity, 
  SupportedLanguage,
  UsageInfo,
  DependencyInfo
} from '../../../shared/types/codebase.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Configuration for code smell detection thresholds
 */
interface SmellThresholds {
  longMethodLines: number;
  largeClassLines: number;
  longParameterList: number;
  cyclomaticComplexity: number;
  nestingDepth: number;
  duplicateCodeTokens: number;
  magicNumberOccurrences: number;
  commentToCodeRatio: number;
}

/**
 * Language-specific thresholds for code smells
 */
const LANGUAGE_THRESHOLDS: Record<SupportedLanguage, SmellThresholds> = {
  [SupportedLanguage.TYPESCRIPT]: {
    longMethodLines: 25,
    largeClassLines: 300,
    longParameterList: 5,
    cyclomaticComplexity: 10,
    nestingDepth: 4,
    duplicateCodeTokens: 50,
    magicNumberOccurrences: 3,
    commentToCodeRatio: 0.2
  },
  [SupportedLanguage.JAVASCRIPT]: {
    longMethodLines: 25,
    largeClassLines: 300,
    longParameterList: 5,
    cyclomaticComplexity: 10,
    nestingDepth: 4,
    duplicateCodeTokens: 50,
    magicNumberOccurrences: 3,
    commentToCodeRatio: 0.2
  },
  [SupportedLanguage.PYTHON]: {
    longMethodLines: 30,
    largeClassLines: 400,
    longParameterList: 4,
    cyclomaticComplexity: 8,
    nestingDepth: 4,
    duplicateCodeTokens: 40,
    magicNumberOccurrences: 3,
    commentToCodeRatio: 0.25
  },
  [SupportedLanguage.JAVA]: {
    longMethodLines: 30,
    largeClassLines: 500,
    longParameterList: 6,
    cyclomaticComplexity: 12,
    nestingDepth: 5,
    duplicateCodeTokens: 60,
    magicNumberOccurrences: 3,
    commentToCodeRatio: 0.3
  },
  [SupportedLanguage.GO]: {
    longMethodLines: 20,
    largeClassLines: 200,
    longParameterList: 3,
    cyclomaticComplexity: 8,
    nestingDepth: 3,
    duplicateCodeTokens: 30,
    magicNumberOccurrences: 2,
    commentToCodeRatio: 0.15
  },
  [SupportedLanguage.RUST]: {
    longMethodLines: 25,
    largeClassLines: 300,
    longParameterList: 4,
    cyclomaticComplexity: 10,
    nestingDepth: 4,
    duplicateCodeTokens: 45,
    magicNumberOccurrences: 3,
    commentToCodeRatio: 0.2
  },
  [SupportedLanguage.CPP]: {
    longMethodLines: 35,
    largeClassLines: 600,
    longParameterList: 7,
    cyclomaticComplexity: 15,
    nestingDepth: 5,
    duplicateCodeTokens: 70,
    magicNumberOccurrences: 4,
    commentToCodeRatio: 0.25
  },
  [SupportedLanguage.C]: {
    longMethodLines: 40,
    largeClassLines: 800,
    longParameterList: 8,
    cyclomaticComplexity: 15,
    nestingDepth: 5,
    duplicateCodeTokens: 80,
    magicNumberOccurrences: 4,
    commentToCodeRatio: 0.2
  }
};

/**
 * Advanced code smell detector with language-specific analysis
 */
export class CodeSmellDetector {
  private readonly language: SupportedLanguage;
  private readonly thresholds: SmellThresholds;
  
  constructor(language: SupportedLanguage) {
    this.language = language;
    this.thresholds = LANGUAGE_THRESHOLDS[language];
  }
  
  // ===================
  // MAIN DETECTION METHODS
  // ===================
  
  /**
   * Detect all code smells in the given AST and content
   */
  async detectAllSmells(
    ast: AST, 
    content: string, 
    fileId: string,
    repositoryId: string,
    usage?: UsageInfo,
    dependencies?: DependencyInfo
  ): Promise<CodeSmell[]> {
    const smells: CodeSmell[] = [];
    
    try {
      // Size-based smells
      smells.push(...await this.detectLongMethods(ast, content));
      smells.push(...await this.detectLargeClasses(ast));
      smells.push(...await this.detectLongParameterLists(ast));
      
      // Complexity smells
      smells.push(...await this.detectComplexConditions(ast));
      smells.push(...await this.detectDeepNesting(ast));
      
      // Data smells
      smells.push(...await this.detectMagicNumbers(ast, content));
      smells.push(...await this.detectDataClumps(ast));
      smells.push(...await this.detectPrimitiveObsession(ast));
      
      // Object-oriented smells
      smells.push(...await this.detectGodClasses(ast, dependencies));
      smells.push(...await this.detectFeatureEnvy(ast, dependencies));
      smells.push(...await this.detectDataClasses(ast));
      smells.push(...await this.detectRefusedBequest(ast));
      
      // General smells
      smells.push(...await this.detectDuplicateCode([content]));
      smells.push(...await this.detectDeadCode(ast, usage));
      smells.push(...await this.detectLazyClasses(ast));
      smells.push(...await this.detectSpeculativeGenerality(ast, usage));
      smells.push(...await this.detectComments(ast, content));
      
      // Language-specific smells
      smells.push(...await this.detectLanguageSpecificSmells(ast, content));
      
      // Set common properties for all detected smells
      return smells.map(smell => ({
        ...smell,
        id: uuidv4(),
        fileId,
        repositoryId,
        detectedAt: new Date()
      }));
      
    } catch (error) {
      console.error('Error detecting code smells:', error);
      return [];
    }
  }
  
  // ===================
  // SIZE-BASED SMELLS
  // ===================
  
  /**
   * Detect long methods/functions
   */
  async detectLongMethods(ast: AST, content: string): Promise<Partial<CodeSmell>[]> {
    const smells: Partial<CodeSmell>[] = [];
    const lines = content.split('\n');
    
    const traverse = (node: any): void => {
      if (!node || typeof node !== 'object') return;
      
      const isFunctionNode = this.isFunctionNode(node);
      
      if (isFunctionNode) {
        const startLine = this.getNodeStartLine(node);
        const endLine = this.getNodeEndLine(node);
        const methodLines = endLine - startLine + 1;
        
        if (methodLines > this.thresholds.longMethodLines) {
          const functionName = this.getFunctionName(node) || 'anonymous';
          const severity = this.getSeverityByLineCount(methodLines);
          
          smells.push({
            smellType: CodeSmellType.LONG_METHOD,
            severity,
            title: `Long Method: ${functionName}`,
            description: `Method '${functionName}' has ${methodLines} lines, exceeding the threshold of ${this.thresholds.longMethodLines} lines.`,
            startLine,
            endLine,
            effortMinutes: this.calculateRefactoringEffort(methodLines, 'method'),
            suggestedFix: this.generateLongMethodFix(functionName, methodLines),
            ruleKey: 'long-method'
          });
        }
      }
      
      // Recursively traverse children
      this.traverseNode(node, traverse);
    };
    
    traverse(ast);
    return smells;
  }
  
  /**
   * Detect large classes
   */
  async detectLargeClasses(ast: AST): Promise<Partial<CodeSmell>[]> {
    const smells: Partial<CodeSmell>[] = [];
    
    const traverse = (node: any): void => {
      if (!node || typeof node !== 'object') return;
      
      const isClassNode = this.isClassNode(node);
      
      if (isClassNode) {
        const startLine = this.getNodeStartLine(node);
        const endLine = this.getNodeEndLine(node);
        const classLines = endLine - startLine + 1;
        
        if (classLines > this.thresholds.largeClassLines) {
          const className = this.getClassName(node) || 'anonymous';
          const methodCount = this.countMethods(node);
          const fieldCount = this.countFields(node);
          
          smells.push({
            smellType: CodeSmellType.LARGE_CLASS,
            severity: this.getSeverityByLineCount(classLines),
            title: `Large Class: ${className}`,
            description: `Class '${className}' has ${classLines} lines (${methodCount} methods, ${fieldCount} fields), exceeding the threshold of ${this.thresholds.largeClassLines} lines.`,
            startLine,
            endLine,
            effortMinutes: this.calculateRefactoringEffort(classLines, 'class'),
            suggestedFix: this.generateLargeClassFix(className, methodCount, fieldCount),
            ruleKey: 'large-class'
          });
        }
      }
      
      this.traverseNode(node, traverse);
    };
    
    traverse(ast);
    return smells;
  }
  
  /**
   * Detect long parameter lists
   */
  async detectLongParameterLists(ast: AST): Promise<Partial<CodeSmell>[]> {
    const smells: Partial<CodeSmell>[] = [];
    
    const traverse = (node: any): void => {
      if (!node || typeof node !== 'object') return;
      
      const isFunctionNode = this.isFunctionNode(node);
      
      if (isFunctionNode) {
        const parameters = this.getFunctionParameters(node);
        const paramCount = parameters.length;
        
        if (paramCount > this.thresholds.longParameterList) {
          const functionName = this.getFunctionName(node) || 'anonymous';
          const startLine = this.getNodeStartLine(node);
          
          smells.push({
            smellType: CodeSmellType.LONG_PARAMETER_LIST,
            severity: paramCount > this.thresholds.longParameterList * 1.5 ? Severity.MAJOR : Severity.MINOR,
            title: `Long Parameter List: ${functionName}`,
            description: `Function '${functionName}' has ${paramCount} parameters, exceeding the threshold of ${this.thresholds.longParameterList}.`,
            startLine,
            effortMinutes: paramCount * 5,
            suggestedFix: `Consider using parameter objects, builder pattern, or breaking the function into smaller functions.`,
            ruleKey: 'long-parameter-list'
          });
        }
      }
      
      this.traverseNode(node, traverse);
    };
    
    traverse(ast);
    return smells;
  }
  
  // ===================
  // COMPLEXITY SMELLS
  // ===================
  
  /**
   * Detect complex conditions
   */
  async detectComplexConditions(ast: AST): Promise<Partial<CodeSmell>[]> {
    const smells: Partial<CodeSmell>[] = [];
    
    const traverse = (node: any): void => {
      if (!node || typeof node !== 'object') return;
      
      if (this.isConditionalNode(node)) {
        const complexity = this.calculateConditionComplexity(node);
        
        if (complexity > 5) { // Threshold for complex conditions
          const startLine = this.getNodeStartLine(node);
          const conditionText = this.getNodeText(node);
          
          smells.push({
            smellType: CodeSmellType.COMPLEX_CONDITION,
            severity: complexity > 10 ? Severity.MAJOR : Severity.MINOR,
            title: 'Complex Condition',
            description: `Complex conditional expression with complexity score of ${complexity}. Consider simplifying.`,
            startLine,
            effortMinutes: complexity * 3,
            suggestedFix: 'Break down complex conditions using intermediate boolean variables or extract methods.',
            ruleKey: 'complex-condition'
          });
        }
      }
      
      this.traverseNode(node, traverse);
    };
    
    traverse(ast);
    return smells;
  }
  
  /**
   * Detect deep nesting
   */
  async detectDeepNesting(ast: AST): Promise<Partial<CodeSmell>[]> {
    const smells: Partial<CodeSmell>[] = [];
    
    const traverse = (node: any, depth: number = 0): void => {
      if (!node || typeof node !== 'object') return;
      
      const isNestingNode = this.isNestingNode(node);
      const currentDepth = isNestingNode ? depth + 1 : depth;
      
      if (currentDepth > this.thresholds.nestingDepth) {
        const startLine = this.getNodeStartLine(node);
        const nodeType = node.type || 'unknown';
        
        smells.push({
          smellType: CodeSmellType.COMPLEX_CONDITION,
          severity: currentDepth > this.thresholds.nestingDepth * 1.5 ? Severity.MAJOR : Severity.MINOR,
          title: `Deep Nesting (Level ${currentDepth})`,
          description: `Code nesting level ${currentDepth} exceeds recommended maximum of ${this.thresholds.nestingDepth}.`,
          startLine,
          effortMinutes: currentDepth * 5,
          suggestedFix: 'Reduce nesting by using early returns, extracting methods, or guard clauses.',
          ruleKey: 'deep-nesting'
        });
      }
      
      // Traverse children with updated depth
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
    return smells;
  }
  
  // ===================
  // DATA SMELLS
  // ===================
  
  /**
   * Detect magic numbers
   */
  async detectMagicNumbers(ast: AST, content: string): Promise<Partial<CodeSmell>[]> {
    const smells: Partial<CodeSmell>[] = [];
    const numberCounts = new Map<string, { count: number; lines: number[] }>();
    
    const traverse = (node: any): void => {
      if (!node || typeof node !== 'object') return;
      
      if (this.isNumericLiteral(node)) {
        const value = String(node.value || node.raw);
        
        // Skip common acceptable numbers
        if (this.isAcceptableNumber(value)) {
          this.traverseNode(node, traverse);
          return;
        }
        
        const startLine = this.getNodeStartLine(node);
        
        if (!numberCounts.has(value)) {
          numberCounts.set(value, { count: 0, lines: [] });
        }
        
        const entry = numberCounts.get(value)!;
        entry.count++;
        entry.lines.push(startLine);
        
        if (entry.count >= this.thresholds.magicNumberOccurrences) {
          smells.push({
            smellType: CodeSmellType.MAGIC_NUMBER,
            severity: Severity.MINOR,
            title: `Magic Number: ${value}`,
            description: `Number ${value} appears ${entry.count} times without clear meaning.`,
            startLine,
            effortMinutes: 10,
            suggestedFix: `Replace magic number ${value} with a named constant that explains its purpose.`,
            ruleKey: 'magic-number'
          });
        }
      }
      
      this.traverseNode(node, traverse);
    };
    
    traverse(ast);
    return smells;
  }
  
  /**
   * Detect data clumps
   */
  async detectDataClumps(ast: AST): Promise<Partial<CodeSmell>[]> {
    const smells: Partial<CodeSmell>[] = [];
    const parameterGroups = new Map<string, { functions: string[]; lines: number[] }>();
    
    const traverse = (node: any): void => {
      if (!node || typeof node !== 'object') return;
      
      if (this.isFunctionNode(node)) {
        const parameters = this.getFunctionParameters(node);
        if (parameters.length >= 3) {
          const parameterSignature = parameters.slice().sort().join(',');
          const functionName = this.getFunctionName(node) || 'anonymous';
          const startLine = this.getNodeStartLine(node);
          
          if (!parameterGroups.has(parameterSignature)) {
            parameterGroups.set(parameterSignature, { functions: [], lines: [] });
          }
          
          const group = parameterGroups.get(parameterSignature)!;
          group.functions.push(functionName);
          group.lines.push(startLine);
          
          if (group.functions.length >= 3) {
            smells.push({
              smellType: CodeSmellType.DATA_CLUMPS,
              severity: Severity.MINOR,
              title: 'Data Clumps',
              description: `Parameter group (${parameters.join(', ')}) appears together in ${group.functions.length} functions.`,
              startLine,
              effortMinutes: 20,
              suggestedFix: 'Consider introducing a parameter object or data structure to group related parameters.',
              ruleKey: 'data-clumps'
            });
          }
        }
      }
      
      this.traverseNode(node, traverse);
    };
    
    traverse(ast);
    return smells;
  }
  
  /**
   * Detect primitive obsession
   */
  async detectPrimitiveObsession(ast: AST): Promise<Partial<CodeSmell>[]> {
    const smells: Partial<CodeSmell>[] = [];
    const primitiveUsage = new Map<string, number>();
    
    const traverse = (node: any): void => {
      if (!node || typeof node !== 'object') return;
      
      if (this.isPrimitiveType(node)) {
        const primitiveType = this.getPrimitiveType(node);
        primitiveUsage.set(primitiveType, (primitiveUsage.get(primitiveType) || 0) + 1);
      }
      
      this.traverseNode(node, traverse);
    };
    
    traverse(ast);
    
    // Check for excessive primitive usage
    for (const [type, count] of primitiveUsage.entries()) {
      if (count > 20) { // Threshold for excessive primitive usage
        smells.push({
          smellType: CodeSmellType.PRIMITIVE_OBSESSION,
          severity: Severity.MINOR,
          title: `Primitive Obsession: ${type}`,
          description: `Excessive use of primitive type '${type}' (${count} occurrences). Consider using domain objects.`,
          startLine: 1,
          effortMinutes: Math.min(60, count * 2),
          suggestedFix: `Replace primitive ${type} with domain-specific classes or value objects.`,
          ruleKey: 'primitive-obsession'
        });
      }
    }
    
    return smells;
  }
  
  // ===================
  // OBJECT-ORIENTED SMELLS
  // ===================
  
  /**
   * Detect god classes (classes with too many responsibilities)
   */
  async detectGodClasses(ast: AST, dependencies?: DependencyInfo): Promise<Partial<CodeSmell>[]> {
    const smells: Partial<CodeSmell>[] = [];
    
    const traverse = (node: any): void => {
      if (!node || typeof node !== 'object') return;
      
      if (this.isClassNode(node)) {
        const className = this.getClassName(node) || 'anonymous';
        const methodCount = this.countMethods(node);
        const fieldCount = this.countFields(node);
        const startLine = this.getNodeStartLine(node);
        const endLine = this.getNodeEndLine(node);
        const classLines = endLine - startLine + 1;
        
        // God class heuristics
        const isGodClass = (
          methodCount > 20 ||
          fieldCount > 15 ||
          classLines > this.thresholds.largeClassLines * 1.5 ||
          (dependencies && dependencies.imports.length > 10)
        );
        
        if (isGodClass) {
          smells.push({
            smellType: CodeSmellType.GOD_CLASS,
            severity: Severity.MAJOR,
            title: `God Class: ${className}`,
            description: `Class '${className}' has too many responsibilities (${methodCount} methods, ${fieldCount} fields, ${classLines} lines).`,
            startLine,
            endLine,
            effortMinutes: Math.min(240, (methodCount + fieldCount) * 5),
            suggestedFix: 'Break down the class into smaller, more focused classes with single responsibilities.',
            ruleKey: 'god-class'
          });
        }
      }
      
      this.traverseNode(node, traverse);
    };
    
    traverse(ast);
    return smells;
  }
  
  /**
   * Detect feature envy (methods using more features from other classes)
   */
  async detectFeatureEnvy(ast: AST, dependencies?: DependencyInfo): Promise<Partial<CodeSmell>[]> {
    const smells: Partial<CodeSmell>[] = [];
    
    const traverse = (node: any): void => {
      if (!node || typeof node !== 'object') return;
      
      if (this.isFunctionNode(node)) {
        const externalCalls = this.countExternalCalls(node);
        const internalCalls = this.countInternalCalls(node);
        
        if (externalCalls > internalCalls && externalCalls > 5) {
          const functionName = this.getFunctionName(node) || 'anonymous';
          const startLine = this.getNodeStartLine(node);
          
          smells.push({
            smellType: CodeSmellType.FEATURE_ENVY,
            severity: Severity.MINOR,
            title: `Feature Envy: ${functionName}`,
            description: `Method '${functionName}' uses more external features (${externalCalls}) than internal ones (${internalCalls}).`,
            startLine,
            effortMinutes: 15,
            suggestedFix: 'Consider moving this method to the class it envies, or extracting shared functionality.',
            ruleKey: 'feature-envy'
          });
        }
      }
      
      this.traverseNode(node, traverse);
    };
    
    traverse(ast);
    return smells;
  }
  
  /**
   * Detect data classes (classes with only getters/setters)
   */
  async detectDataClasses(ast: AST): Promise<Partial<CodeSmell>[]> {
    const smells: Partial<CodeSmell>[] = [];
    
    const traverse = (node: any): void => {
      if (!node || typeof node !== 'object') return;
      
      if (this.isClassNode(node)) {
        const className = this.getClassName(node) || 'anonymous';
        const methods = this.getMethods(node);
        const getterSetterCount = methods.filter(m => this.isGetterOrSetter(m)).length;
        const totalMethods = methods.length;
        
        // Data class if most methods are just getters/setters
        if (totalMethods > 0 && getterSetterCount / totalMethods > 0.8) {
          const startLine = this.getNodeStartLine(node);
          
          smells.push({
            smellType: CodeSmellType.DATA_CLASS,
            severity: Severity.MINOR,
            title: `Data Class: ${className}`,
            description: `Class '${className}' appears to be a data container with ${getterSetterCount}/${totalMethods} getter/setter methods.`,
            startLine,
            effortMinutes: 20,
            suggestedFix: 'Consider adding behavior to this class or using a simple data structure instead.',
            ruleKey: 'data-class'
          });
        }
      }
      
      this.traverseNode(node, traverse);
    };
    
    traverse(ast);
    return smells;
  }
  
  /**
   * Detect refused bequest (subclasses not using inherited methods)
   */
  async detectRefusedBequest(ast: AST): Promise<Partial<CodeSmell>[]> {
    const smells: Partial<CodeSmell>[] = [];
    
    const traverse = (node: any): void => {
      if (!node || typeof node !== 'object') return;
      
      if (this.isClassNode(node) && this.hasInheritance(node)) {
        const className = this.getClassName(node) || 'anonymous';
        const overriddenMethods = this.getOverriddenMethods(node);
        const throwingMethods = overriddenMethods.filter(m => this.throwsException(m));
        
        if (throwingMethods.length > 0) {
          const startLine = this.getNodeStartLine(node);
          
          smells.push({
            smellType: CodeSmellType.REFUSED_BEQUEST,
            severity: Severity.MINOR,
            title: `Refused Bequest: ${className}`,
            description: `Class '${className}' refuses inherited behavior by throwing exceptions in ${throwingMethods.length} methods.`,
            startLine,
            effortMinutes: throwingMethods.length * 15,
            suggestedFix: 'Consider composition over inheritance or redesign the class hierarchy.',
            ruleKey: 'refused-bequest'
          });
        }
      }
      
      this.traverseNode(node, traverse);
    };
    
    traverse(ast);
    return smells;
  }
  
  // ===================
  // GENERAL SMELLS
  // ===================
  
  /**
   * Detect duplicate code blocks
   */
  async detectDuplicateCode(contents: string[]): Promise<Partial<CodeSmell>[]> {
    const smells: Partial<CodeSmell>[] = [];
    
    if (contents.length < 2) return smells;
    
    // Simple token-based duplicate detection
    for (let i = 0; i < contents.length; i++) {
      for (let j = i + 1; j < contents.length; j++) {
        const similarity = this.calculateSimilarity(contents[i], contents[j]);
        
        if (similarity > 0.9) { // 90% similarity threshold
          smells.push({
            smellType: CodeSmellType.DUPLICATE_CODE,
            severity: Severity.MINOR,
            title: 'Duplicate Code',
            description: `High code similarity (${Math.round(similarity * 100)}%) detected.`,
            startLine: 1,
            effortMinutes: 30,
            suggestedFix: 'Extract common code into shared methods or modules.',
            ruleKey: 'duplicate-code'
          });
        }
      }
    }
    
    return smells;
  }
  
  /**
   * Detect dead code (unused methods, variables)
   */
  async detectDeadCode(ast: AST, usage?: UsageInfo): Promise<Partial<CodeSmell>[]> {
    const smells: Partial<CodeSmell>[] = [];
    
    if (!usage) return smells;
    
    const traverse = (node: any): void => {
      if (!node || typeof node !== 'object') return;
      
      if (this.isFunctionNode(node) || this.isVariableDeclaration(node)) {
        const name = this.getDeclarationName(node);
        
        if (name && !usage.calledBy.includes(name) && !usage.referencedIn.includes(name)) {
          const startLine = this.getNodeStartLine(node);
          const nodeType = this.isFunctionNode(node) ? 'function' : 'variable';
          
          smells.push({
            smellType: CodeSmellType.DEAD_CODE,
            severity: Severity.MINOR,
            title: `Dead Code: ${name}`,
            description: `${nodeType} '${name}' appears to be unused.`,
            startLine,
            effortMinutes: 5,
            suggestedFix: `Remove unused ${nodeType} '${name}' if it's truly not needed.`,
            ruleKey: 'dead-code'
          });
        }
      }
      
      this.traverseNode(node, traverse);
    };
    
    traverse(ast);
    return smells;
  }
  
  /**
   * Detect lazy classes (classes with minimal functionality)
   */
  async detectLazyClasses(ast: AST): Promise<Partial<CodeSmell>[]> {
    const smells: Partial<CodeSmell>[] = [];
    
    const traverse = (node: any): void => {
      if (!node || typeof node !== 'object') return;
      
      if (this.isClassNode(node)) {
        const className = this.getClassName(node) || 'anonymous';
        const methodCount = this.countMethods(node);
        const fieldCount = this.countFields(node);
        const startLine = this.getNodeStartLine(node);
        
        // Lazy class has very few methods and fields
        if (methodCount <= 2 && fieldCount <= 1) {
          smells.push({
            smellType: CodeSmellType.LAZY_CLASS,
            severity: Severity.MINOR,
            title: `Lazy Class: ${className}`,
            description: `Class '${className}' has minimal functionality (${methodCount} methods, ${fieldCount} fields).`,
            startLine,
            effortMinutes: 10,
            suggestedFix: 'Consider merging this class with related classes or converting to a simple function.',
            ruleKey: 'lazy-class'
          });
        }
      }
      
      this.traverseNode(node, traverse);
    };
    
    traverse(ast);
    return smells;
  }
  
  /**
   * Detect speculative generality (over-engineered code)
   */
  async detectSpeculativeGenerality(ast: AST, usage?: UsageInfo): Promise<Partial<CodeSmell>[]> {
    const smells: Partial<CodeSmell>[] = [];
    
    const traverse = (node: any): void => {
      if (!node || typeof node !== 'object') return;
      
      // Look for abstract classes/interfaces with only one implementation
      if (this.isAbstractClass(node) || this.isInterface(node)) {
        const name = this.getDeclarationName(node);
        const implementationCount = usage?.referencedIn.length || 0;
        
        if (implementationCount <= 1) {
          const startLine = this.getNodeStartLine(node);
          const nodeType = this.isInterface(node) ? 'interface' : 'abstract class';
          
          smells.push({
            smellType: CodeSmellType.SPECULATIVE_GENERALITY,
            severity: Severity.MINOR,
            title: `Speculative Generality: ${name}`,
            description: `${nodeType} '${name}' has only ${implementationCount} implementation(s).`,
            startLine,
            effortMinutes: 15,
            suggestedFix: 'Consider removing unnecessary abstraction if there\'s only one implementation.',
            ruleKey: 'speculative-generality'
          });
        }
      }
      
      this.traverseNode(node, traverse);
    };
    
    traverse(ast);
    return smells;
  }
  
  /**
   * Detect inappropriate comments (comments explaining obvious code)
   */
  async detectComments(ast: AST, content: string): Promise<Partial<CodeSmell>[]> {
    const smells: Partial<CodeSmell>[] = [];
    const lines = content.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();
      
      // Detect obvious comments
      if (this.isComment(trimmedLine)) {
        const commentText = this.extractCommentText(trimmedLine);
        
        if (this.isObviousComment(commentText, i, lines)) {
          smells.push({
            smellType: CodeSmellType.COMMENTS,
            severity: Severity.INFO,
            title: 'Obvious Comment',
            description: 'Comment explains obvious code that should be self-explanatory.',
            startLine: i + 1,
            effortMinutes: 2,
            suggestedFix: 'Remove obvious comments and make code more self-documenting.',
            ruleKey: 'obvious-comment'
          });
        }
      }
    }
    
    return smells;
  }
  
  // ===================
  // LANGUAGE-SPECIFIC SMELLS
  // ===================
  
  /**
   * Detect language-specific code smells
   */
  async detectLanguageSpecificSmells(ast: AST, content: string): Promise<Partial<CodeSmell>[]> {
    const smells: Partial<CodeSmell>[] = [];
    
    switch (this.language) {
      case SupportedLanguage.TYPESCRIPT:
      case SupportedLanguage.JAVASCRIPT:
        smells.push(...await this.detectJavaScriptSmells(ast, content));
        break;
      case SupportedLanguage.PYTHON:
        smells.push(...await this.detectPythonSmells(ast, content));
        break;
      case SupportedLanguage.JAVA:
        smells.push(...await this.detectJavaSmells(ast, content));
        break;
      case SupportedLanguage.GO:
        smells.push(...await this.detectGoSmells(ast, content));
        break;
      case SupportedLanguage.RUST:
        smells.push(...await this.detectRustSmells(ast, content));
        break;
    }
    
    return smells;
  }
  
  /**
   * JavaScript/TypeScript specific smells
   */
  private async detectJavaScriptSmells(ast: AST, content: string): Promise<Partial<CodeSmell>[]> {
    const smells: Partial<CodeSmell>[] = [];
    
    // Detect callback hell
    const callbackDepth = this.calculateCallbackDepth(ast);
    if (callbackDepth > 3) {
      smells.push({
        smellType: CodeSmellType.COMPLEX_CONDITION,
        severity: Severity.MINOR,
        title: 'Callback Hell',
        description: `Excessive callback nesting (depth ${callbackDepth}).`,
        startLine: 1,
        effortMinutes: callbackDepth * 10,
        suggestedFix: 'Consider using Promises, async/await, or extracting functions.',
        ruleKey: 'callback-hell'
      });
    }
    
    // Detect console.log usage (should be logging framework)
    if (content.includes('console.log')) {
      const matches = content.match(/console\.log/g);
      smells.push({
        smellType: CodeSmellType.COMMENTS,
        severity: Severity.INFO,
        title: 'Console Logging',
        description: `Found ${matches?.length} console.log statements.`,
        startLine: 1,
        effortMinutes: 5,
        suggestedFix: 'Replace console.log with proper logging framework.',
        ruleKey: 'console-logging'
      });
    }
    
    return smells;
  }
  
  /**
   * Python specific smells
   */
  private async detectPythonSmells(ast: AST, content: string): Promise<Partial<CodeSmell>[]> {
    const smells: Partial<CodeSmell>[] = [];
    
    // Detect missing docstrings
    const functionsWithoutDocstrings = this.findFunctionsWithoutDocstrings(ast, content);
    for (const func of functionsWithoutDocstrings) {
      smells.push({
        smellType: CodeSmellType.COMMENTS,
        severity: Severity.MINOR,
        title: `Missing Docstring: ${func.name}`,
        description: `Function '${func.name}' is missing a docstring.`,
        startLine: func.line,
        effortMinutes: 5,
        suggestedFix: 'Add docstring to describe function purpose, parameters, and return value.',
        ruleKey: 'missing-docstring'
      });
    }
    
    return smells;
  }
  
  /**
   * Java specific smells
   */
  private async detectJavaSmells(ast: AST, content: string): Promise<Partial<CodeSmell>[]> {
    const smells: Partial<CodeSmell>[] = [];
    
    // Detect excessive imports
    const importCount = (content.match(/^import\s+/gm) || []).length;
    if (importCount > 15) {
      smells.push({
        smellType: CodeSmellType.GOD_CLASS,
        severity: Severity.MINOR,
        title: 'Excessive Imports',
        description: `File has ${importCount} imports, indicating possible god class.`,
        startLine: 1,
        effortMinutes: importCount,
        suggestedFix: 'Consider breaking down the class or using package imports.',
        ruleKey: 'excessive-imports'
      });
    }
    
    return smells;
  }
  
  /**
   * Go specific smells
   */
  private async detectGoSmells(ast: AST, content: string): Promise<Partial<CodeSmell>[]> {
    const smells: Partial<CodeSmell>[] = [];
    
    // Detect missing error handling
    const errorChecks = (content.match(/if\s+err\s*!=\s*nil/g) || []).length;
    const errorReturns = (content.match(/return.*,\s*err/g) || []).length;
    
    if (errorReturns > errorChecks * 2) {
      smells.push({
        smellType: CodeSmellType.COMMENTS,
        severity: Severity.MAJOR,
        title: 'Missing Error Handling',
        description: `Potential missing error handling (${errorReturns} error returns vs ${errorChecks} checks).`,
        startLine: 1,
        effortMinutes: (errorReturns - errorChecks) * 5,
        suggestedFix: 'Add proper error handling for all functions that return errors.',
        ruleKey: 'missing-error-handling'
      });
    }
    
    return smells;
  }
  
  /**
   * Rust specific smells
   */
  private async detectRustSmells(ast: AST, content: string): Promise<Partial<CodeSmell>[]> {
    const smells: Partial<CodeSmell>[] = [];
    
    // Detect excessive unwrap() usage
    const unwrapCount = (content.match(/\.unwrap\(\)/g) || []).length;
    if (unwrapCount > 5) {
      smells.push({
        smellType: CodeSmellType.COMMENTS,
        severity: Severity.MINOR,
        title: 'Excessive Unwrap Usage',
        description: `Found ${unwrapCount} .unwrap() calls, consider proper error handling.`,
        startLine: 1,
        effortMinutes: unwrapCount * 3,
        suggestedFix: 'Replace .unwrap() with proper error handling using match or if let.',
        ruleKey: 'excessive-unwrap'
      });
    }
    
    return smells;
  }
  
  // ===================
  // UTILITY METHODS
  // ===================
  
  /**
   * Generic node traversal helper
   */
  private traverseNode(node: any, callback: (node: any) => void): void {
    if (node.children) {
      node.children.forEach((child: any) => callback(child));
    }
    
    Object.values(node).forEach((value) => {
      if (Array.isArray(value)) {
        value.forEach((item) => {
          if (item && typeof item === 'object' && item.type) {
            callback(item);
          }
        });
      } else if (value && typeof value === 'object' && value.type) {
        callback(value);
      }
    });
  }
  
  /**
   * Get severity based on line count
   */
  private getSeverityByLineCount(lines: number): Severity {
    const threshold = this.thresholds.longMethodLines;
    if (lines > threshold * 3) return Severity.CRITICAL;
    if (lines > threshold * 2) return Severity.MAJOR;
    if (lines > threshold * 1.5) return Severity.MINOR;
    return Severity.INFO;
  }
  
  /**
   * Calculate refactoring effort based on size and type
   */
  private calculateRefactoringEffort(size: number, type: 'method' | 'class'): number {
    const baseEffort = type === 'method' ? 15 : 30;
    const sizeMultiplier = type === 'method' ? 0.5 : 1;
    return Math.min(240, baseEffort + (size * sizeMultiplier));
  }
  
  /**
   * Generate fix suggestions for long methods
   */
  private generateLongMethodFix(methodName: string, lines: number): string {
    if (lines > 100) {
      return `Method '${methodName}' is very long (${lines} lines). Consider breaking it into multiple smaller methods with single responsibilities.`;
    } else if (lines > 50) {
      return `Method '${methodName}' is long (${lines} lines). Look for opportunities to extract helper methods.`;
    }
    return `Method '${methodName}' exceeds recommended length. Consider extracting some logic into separate methods.`;
  }
  
  /**
   * Generate fix suggestions for large classes
   */
  private generateLargeClassFix(className: string, methods: number, fields: number): string {
    if (methods > 30) {
      return `Class '${className}' has too many methods (${methods}). Consider using composition or extracting related methods into separate classes.`;
    }
    if (fields > 20) {
      return `Class '${className}' has too many fields (${fields}). Consider grouping related fields into separate objects.`;
    }
    return `Class '${className}' is large. Consider breaking it down into smaller, more focused classes.`;
  }
  
  /**
   * Calculate similarity between two code strings
   */
  private calculateSimilarity(code1: string, code2: string): number {
    // Simple implementation - in practice, use more sophisticated algorithms
    const tokens1 = this.tokenize(code1);
    const tokens2 = this.tokenize(code2);
    
    const commonTokens = tokens1.filter(token => tokens2.includes(token)).length;
    const totalTokens = Math.max(tokens1.length, tokens2.length);
    
    return totalTokens > 0 ? commonTokens / totalTokens : 0;
  }
  
  /**
   * Simple tokenization for similarity calculation
   */
  private tokenize(code: string): string[] {
    return code
      .replace(/[^\w\s]/g, ' ')
      .toLowerCase()
      .split(/\s+/)
      .filter(token => token.length > 2);
  }
  
  // ===================
  // NODE TYPE DETECTION METHODS
  // ===================
  
  private isFunctionNode(node: any): boolean {
    const functionTypes = [
      'FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression',
      'MethodDefinition', 'function_definition', 'method_definition'
    ];
    return functionTypes.includes(node.type);
  }
  
  private isClassNode(node: any): boolean {
    const classTypes = ['ClassDeclaration', 'class_definition', 'ClassDefinition'];
    return classTypes.includes(node.type);
  }
  
  private isConditionalNode(node: any): boolean {
    const conditionalTypes = [
      'IfStatement', 'ConditionalExpression', 'SwitchStatement',
      'if_statement', 'conditional_expression', 'switch_statement'
    ];
    return conditionalTypes.includes(node.type);
  }
  
  private isNestingNode(node: any): boolean {
    const nestingTypes = [
      'IfStatement', 'ForStatement', 'WhileStatement', 'DoWhileStatement',
      'SwitchStatement', 'TryStatement', 'CatchClause', 'BlockStatement',
      'if_statement', 'for_statement', 'while_statement', 'try_statement'
    ];
    return nestingTypes.includes(node.type);
  }
  
  private isNumericLiteral(node: any): boolean {
    return node.type === 'Literal' && typeof node.value === 'number' ||
           node.type === 'number' || node.type === 'NumericLiteral';
  }
  
  private isVariableDeclaration(node: any): boolean {
    const varTypes = ['VariableDeclaration', 'VariableDeclarator', 'variable_declaration'];
    return varTypes.includes(node.type);
  }
  
  private isPrimitiveType(node: any): boolean {
    const primitiveTypes = ['string', 'number', 'boolean', 'StringLiteral', 'NumericLiteral', 'BooleanLiteral'];
    return primitiveTypes.includes(node.type) || 
           (node.type === 'Literal' && ['string', 'number', 'boolean'].includes(typeof node.value));
  }
  
  private isAbstractClass(node: any): boolean {
    return node.type === 'ClassDeclaration' && node.abstract === true;
  }
  
  private isInterface(node: any): boolean {
    return node.type === 'TSInterfaceDeclaration' || node.type === 'InterfaceDeclaration';
  }
  
  private isComment(line: string): boolean {
    return /^\s*(\/\/|#|--|%|;|\*)/.test(line);
  }
  
  private isGetterOrSetter(method: any): boolean {
    return method.kind === 'get' || method.kind === 'set' ||
           /^(get|set)[A-Z]/.test(method.name || '');
  }
  
  // ===================
  // NODE INFORMATION EXTRACTION
  // ===================
  
  private getNodeStartLine(node: any): number {
    return node.loc?.start?.line || node.start?.line || 1;
  }
  
  private getNodeEndLine(node: any): number {
    return node.loc?.end?.line || node.end?.line || this.getNodeStartLine(node);
  }
  
  private getNodeText(node: any): string {
    return node.raw || node.value || node.name || String(node);
  }
  
  private getFunctionName(node: any): string | null {
    return node.id?.name || node.key?.name || node.name || null;
  }
  
  private getClassName(node: any): string | null {
    return node.id?.name || node.name || null;
  }
  
  private getDeclarationName(node: any): string | null {
    if (node.id?.name) return node.id.name;
    if (node.declarations && node.declarations[0]?.id?.name) {
      return node.declarations[0].id.name;
    }
    return node.name || null;
  }
  
  private getFunctionParameters(node: any): string[] {
    if (node.params) {
      return node.params.map((param: any) => param.name || param.id?.name || 'param').filter(Boolean);
    }
    return [];
  }
  
  private getPrimitiveType(node: any): string {
    if (node.type === 'Literal') {
      return typeof node.value;
    }
    return node.type.toLowerCase();
  }
  
  private getMethods(node: any): any[] {
    if (node.body?.body) {
      return node.body.body.filter((member: any) => 
        member.type === 'MethodDefinition' || member.type === 'FunctionDeclaration'
      );
    }
    return [];
  }
  
  private countMethods(node: any): number {
    return this.getMethods(node).length;
  }
  
  private countFields(node: any): number {
    if (node.body?.body) {
      return node.body.body.filter((member: any) => 
        member.type === 'PropertyDefinition' || member.type === 'FieldDefinition'
      ).length;
    }
    return 0;
  }
  
  private countExternalCalls(node: any): number {
    let count = 0;
    // This would need more sophisticated analysis
    // For now, return a placeholder
    return count;
  }
  
  private countInternalCalls(node: any): number {
    let count = 0;
    // This would need more sophisticated analysis
    // For now, return a placeholder
    return count;
  }
  
  private calculateConditionComplexity(node: any): number {
    let complexity = 1;
    
    const traverse = (n: any): void => {
      if (n.type === 'LogicalExpression') {
        complexity++;
        if (n.left) traverse(n.left);
        if (n.right) traverse(n.right);
      } else if (n.type === 'BinaryExpression') {
        complexity++;
      }
    };
    
    traverse(node);
    return complexity;
  }
  
  private calculateCallbackDepth(ast: AST): number {
    let maxDepth = 0;
    
    const traverse = (node: any, depth: number = 0): void => {
      if (!node || typeof node !== 'object') return;
      
      let currentDepth = depth;
      
      // Check for callback patterns
      if (node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression') {
        currentDepth = depth + 1;
        maxDepth = Math.max(maxDepth, currentDepth);
      }
      
      this.traverseNode(node, (child) => traverse(child, currentDepth));
    };
    
    traverse(ast);
    return maxDepth;
  }
  
  private findFunctionsWithoutDocstrings(ast: AST, content: string): Array<{ name: string; line: number }> {
    const functions: Array<{ name: string; line: number }> = [];
    const lines = content.split('\n');
    
    const traverse = (node: any): void => {
      if (!node || typeof node !== 'object') return;
      
      if (this.isFunctionNode(node)) {
        const name = this.getFunctionName(node) || 'anonymous';
        const startLine = this.getNodeStartLine(node);
        
        // Check if previous lines contain docstring
        const hasDocstring = this.hasDocstringBefore(lines, startLine - 1);
        
        if (!hasDocstring) {
          functions.push({ name, line: startLine });
        }
      }
      
      this.traverseNode(node, traverse);
    };
    
    traverse(ast);
    return functions;
  }
  
  private hasDocstringBefore(lines: string[], lineIndex: number): boolean {
    if (lineIndex <= 0) return false;
    
    const prevLine = lines[lineIndex - 1]?.trim();
    return /^('''|""")/.test(prevLine || '');
  }
  
  private hasInheritance(node: any): boolean {
    return node.superClass !== null || node.extends !== null;
  }
  
  private getOverriddenMethods(node: any): any[] {
    // This would need more sophisticated analysis
    // For now, return empty array
    return [];
  }
  
  private throwsException(method: any): boolean {
    // Simple check for throw statements in method body
    const hasThrow = (n: any): boolean => {
      if (n.type === 'ThrowStatement') return true;
      if (n.body) return hasThrow(n.body);
      return false;
    };
    
    return hasThrow(method);
  }
  
  private isAcceptableNumber(value: string): boolean {
    const acceptable = new Set(['0', '1', '-1', '2', '10', '100', '1000']);
    return acceptable.has(value);
  }
  
  private extractCommentText(line: string): string {
    return line.replace(/^\s*(\/\/|#|--|%|;|\*)\s*/, '').trim();
  }
  
  private isObviousComment(comment: string, lineIndex: number, lines: string[]): boolean {
    if (lineIndex + 1 >= lines.length) return false;
    
    const nextLine = lines[lineIndex + 1]?.trim().toLowerCase();
    const commentLower = comment.toLowerCase();
    
    // Check if comment just repeats what the code says
    return nextLine?.includes(commentLower) || commentLower.includes(nextLine || '');
  }
}