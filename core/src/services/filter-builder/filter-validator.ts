import {
  FilterTree,
  FilterCondition,
  QueryValidation,
  FilterOperator,
  FilterDataType
} from '../../shared/types/filter-builder.js';

export interface ValidationRule {
  name: string;
  description: string;
  severity: 'error' | 'warning' | 'info';
  validate: (tree: FilterTree) => ValidationResult[];
}

export interface ValidationResult {
  path: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
  suggestion?: string;
}

export interface OptimizationRule {
  name: string;
  description: string;
  optimize: (tree: FilterTree) => FilterTree;
}

/**
 * Service for validating and optimizing filter trees
 */
export class FilterValidator {
  private validationRules: ValidationRule[] = [];
  private optimizationRules: OptimizationRule[] = [];

  constructor() {
    this.initializeValidationRules();
    this.initializeOptimizationRules();
  }

  /**
   * Validate a filter tree
   */
  async validate(tree: FilterTree): Promise<QueryValidation> {
    const errors: ValidationResult[] = [];
    const suggestions: any[] = [];

    // Run all validation rules
    for (const rule of this.validationRules) {
      const ruleResults = rule.validate(tree);
      errors.push(...ruleResults);
    }

    // Generate optimization suggestions
    const originalComplexity = this.calculateComplexity(tree);
    const optimizedTree = await this.optimize(tree);
    const optimizedComplexity = this.calculateComplexity(optimizedTree);

    if (optimizedComplexity < originalComplexity) {
      suggestions.push({
        type: 'optimize',
        message: `Filter complexity can be reduced from ${originalComplexity} to ${optimizedComplexity}`,
        proposedChange: optimizedTree
      });
    }

    // Check for common patterns that can be simplified
    const simplificationSuggestions = this.generateSimplificationSuggestions(tree);
    suggestions.push(...simplificationSuggestions);

    const hasErrors = errors.some(e => e.severity === 'error');

    return {
      isValid: !hasErrors,
      errors: errors.map(e => ({
        path: e.path,
        message: e.message,
        severity: e.severity
      })),
      suggestions,
      estimatedPerformance: {
        complexity: originalComplexity,
        estimatedExecutionTimeMs: this.estimateExecutionTime(tree),
        indexUsage: this.suggestIndexes(tree)
      }
    };
  }

  /**
   * Optimize a filter tree
   */
  async optimize(tree: FilterTree): Promise<FilterTree> {
    let optimized = this.deepClone(tree);

    // Apply all optimization rules
    for (const rule of this.optimizationRules) {
      optimized = rule.optimize(optimized);
    }

    return optimized;
  }

  /**
   * Initialize validation rules
   */
  private initializeValidationRules(): void {
    // Rule: Empty groups should be removed
    this.validationRules.push({
      name: 'no-empty-groups',
      description: 'Groups should not be empty',
      severity: 'warning',
      validate: (tree) => {
        const results: ValidationResult[] = [];
        
        const traverse = (node: FilterTree, path: string): void => {
          if (node.type === 'group' && (!node.children || node.children.length === 0)) {
            results.push({
              path,
              message: 'Empty group found - consider removing it',
              severity: 'warning',
              suggestion: 'Remove this empty group to simplify the filter'
            });
          }
          
          if (node.children) {
            node.children.forEach((child, index) => {
              traverse(child, `${path}.children[${index}]`);
            });
          }
        };
        
        traverse(tree, 'root');
        return results;
      }
    });

    // Rule: Single-child groups should be flattened
    this.validationRules.push({
      name: 'flatten-single-child-groups',
      description: 'Groups with only one child should be flattened',
      severity: 'info',
      validate: (tree) => {
        const results: ValidationResult[] = [];
        
        const traverse = (node: FilterTree, path: string): void => {
          if (node.type === 'group' && node.children?.length === 1 && path !== 'root') {
            results.push({
              path,
              message: 'Group with single child can be simplified',
              severity: 'info',
              suggestion: 'Replace this group with its child to simplify the structure'
            });
          }
          
          if (node.children) {
            node.children.forEach((child, index) => {
              traverse(child, `${path}.children[${index}]`);
            });
          }
        };
        
        traverse(tree, 'root');
        return results;
      }
    });

    // Rule: Validate condition operators match data types
    this.validationRules.push({
      name: 'validate-operator-datatype',
      description: 'Operators should be compatible with field data types',
      severity: 'error',
      validate: (tree) => {
        const results: ValidationResult[] = [];
        
        const traverse = (node: FilterTree, path: string): void => {
          if (node.type === 'condition' && node.condition) {
            const { operator, dataType, value } = node.condition;
            
            // Validate operator-datatype compatibility
            const incompatibility = this.checkOperatorDataTypeCompatibility(operator, dataType);
            if (incompatibility) {
              results.push({
                path,
                message: incompatibility,
                severity: 'error'
              });
            }
            
            // Validate value type
            const valueValidation = this.validateValueType(value, dataType);
            if (valueValidation) {
              results.push({
                path,
                message: valueValidation,
                severity: 'error'
              });
            }
          }
          
          if (node.children) {
            node.children.forEach((child, index) => {
              traverse(child, `${path}.children[${index}]`);
            });
          }
        };
        
        traverse(tree, 'root');
        return results;
      }
    });

    // Rule: Check for contradictory conditions
    this.validationRules.push({
      name: 'detect-contradictions',
      description: 'Detect contradictory conditions in the same AND group',
      severity: 'warning',
      validate: (tree) => {
        const results: ValidationResult[] = [];
        
        const traverse = (node: FilterTree, path: string): void => {
          if (node.type === 'group' && node.operator === 'AND' && node.children) {
            const contradictions = this.findContradictions(node.children);
            contradictions.forEach(contradiction => {
              results.push({
                path,
                message: contradiction,
                severity: 'warning',
                suggestion: 'Review these conditions as they may never match any results'
              });
            });
          }
          
          if (node.children) {
            node.children.forEach((child, index) => {
              traverse(child, `${path}.children[${index}]`);
            });
          }
        };
        
        traverse(tree, 'root');
        return results;
      }
    });

    // Rule: Maximum depth check (stack overflow prevention)
    this.validationRules.push({
      name: 'max-depth-check',
      description: 'Filter tree should not exceed maximum depth to prevent stack overflow',
      severity: 'error',
      validate: (tree) => {
        const maxDepthError = 20; // Hard limit to prevent stack overflow
        const maxDepthWarning = 8; // Recommended limit for performance
        const depth = this.calculateDepthWithLimit(tree, maxDepthError + 1);
        
        if (depth > maxDepthError) {
          return [{
            path: 'root',
            message: `Filter tree depth (${depth}) exceeds maximum allowed (${maxDepthError}). This could cause stack overflow.`,
            severity: 'error',
            suggestion: 'Reduce nesting depth to prevent system instability'
          }];
        } else if (depth > maxDepthWarning) {
          return [{
            path: 'root',
            message: `Filter tree depth (${depth}) exceeds recommended maximum (${maxDepthWarning}) but is within safe limits`,
            severity: 'warning',
            suggestion: 'Consider simplifying the filter structure for better performance'
          }];
        }
        
        return [];
      }
    });

    // Rule: Maximum node count check (prevent memory exhaustion)
    this.validationRules.push({
      name: 'max-node-count-check',
      description: 'Filter tree should not have too many nodes to prevent memory issues',
      severity: 'error',
      validate: (tree) => {
        const maxNodes = 1000; // Hard limit for total nodes
        const nodeCount = this.countTotalNodes(tree);
        
        if (nodeCount > maxNodes) {
          return [{
            path: 'root',
            message: `Filter tree has ${nodeCount} nodes, exceeding maximum allowed (${maxNodes})`,
            severity: 'error',
            suggestion: 'Simplify the filter by reducing the number of conditions and groups'
          }];
        }
        
        return [];
      }
    });
  }

  /**
   * Initialize optimization rules
   */
  private initializeOptimizationRules(): void {
    // Rule: Remove empty groups
    this.optimizationRules.push({
      name: 'remove-empty-groups',
      description: 'Remove groups that have no children',
      optimize: (tree) => {
        const optimized = this.deepClone(tree);
        
        const removeEmpty = (node: FilterTree): FilterTree | null => {
          if (node.type === 'condition') {
            return node;
          }
          
          if (node.type === 'group' && node.children) {
            // Recursively process children
            const filteredChildren = node.children
              .map(removeEmpty)
              .filter((child): child is FilterTree => child !== null);
            
            // If no children remain, remove this group
            if (filteredChildren.length === 0) {
              return null;
            }
            
            node.children = filteredChildren;
            return node;
          }
          
          return node;
        };
        
        return removeEmpty(optimized) || this.createEmptyTree();
      }
    });

    // Rule: Flatten single-child groups
    this.optimizationRules.push({
      name: 'flatten-single-child',
      description: 'Replace groups with single children with the child itself',
      optimize: (tree) => {
        const optimized = this.deepClone(tree);
        
        const flatten = (node: FilterTree, isRoot: boolean = true): FilterTree => {
          if (node.type === 'condition') {
            return node;
          }
          
          if (node.type === 'group' && node.children) {
            // Recursively process children
            node.children = node.children.map(child => flatten(child, false));
            
            // If this group has only one child and is not root, return the child
            if (node.children.length === 1 && !isRoot) {
              return node.children[0];
            }
          }
          
          return node;
        };
        
        return flatten(optimized);
      }
    });

    // Rule: Merge adjacent groups with same operator
    this.optimizationRules.push({
      name: 'merge-same-operator-groups',
      description: 'Merge groups with the same operator',
      optimize: (tree) => {
        const optimized = this.deepClone(tree);
        
        const merge = (node: FilterTree): FilterTree => {
          if (node.type === 'condition') {
            return node;
          }
          
          if (node.type === 'group' && node.children) {
            // Recursively process children first
            node.children = node.children.map(merge);
            
            // Merge children with same operator
            const newChildren: FilterTree[] = [];
            
            for (const child of node.children) {
              if (child.type === 'group' && child.operator === node.operator && child.children) {
                // Merge child's children into this group
                newChildren.push(...child.children);
              } else {
                newChildren.push(child);
              }
            }
            
            node.children = newChildren;
          }
          
          return node;
        };
        
        return merge(optimized);
      }
    });

    // Rule: Optimize redundant NOT operations
    this.optimizationRules.push({
      name: 'optimize-not-operations',
      description: 'Simplify double negations and optimize NOT groups',
      optimize: (tree) => {
        const optimized = this.deepClone(tree);
        
        const optimizeNot = (node: FilterTree): FilterTree => {
          if (node.type === 'condition') {
            return node;
          }
          
          if (node.type === 'group' && node.children) {
            // Recursively process children
            node.children = node.children.map(optimizeNot);
            
            // Handle NOT group optimizations
            if (node.operator === 'NOT' && node.children.length === 1) {
              const child = node.children[0];
              
              // Double negation: NOT(NOT(X)) = X
              if (child.type === 'group' && child.operator === 'NOT' && child.children?.length === 1) {
                return child.children[0];
              }
              
              // De Morgan's laws: NOT(A AND B) = (NOT A) OR (NOT B)
              if (child.type === 'group' && (child.operator === 'AND' || child.operator === 'OR')) {
                const newOperator = child.operator === 'AND' ? 'OR' : 'AND';
                const negatedChildren = child.children?.map(grandchild => ({
                  ...this.createEmptyTree(),
                  id: crypto.randomUUID(),
                  type: 'group' as const,
                  operator: 'NOT' as const,
                  children: [grandchild]
                })) || [];
                
                return {
                  ...node,
                  operator: newOperator,
                  children: negatedChildren
                };
              }
            }
          }
          
          return node;
        };
        
        return optimizeNot(optimized);
      }
    });
  }

  /**
   * Check operator and data type compatibility
   */
  private checkOperatorDataTypeCompatibility(
    operator: FilterOperator,
    dataType: FilterDataType
  ): string | null {
    const numericOperators = ['greater_than', 'less_than', 'greater_equal', 'less_equal', 'between'];
    const stringOperators = ['contains', 'not_contains', 'starts_with', 'ends_with', 'matches_regex'];
    const arrayOperators = ['in', 'not_in'];

    if (numericOperators.includes(operator) && !['number', 'date'].includes(dataType)) {
      return `Operator '${operator}' is not compatible with data type '${dataType}'`;
    }

    if (stringOperators.includes(operator) && dataType !== 'string') {
      return `Operator '${operator}' is only compatible with string data type`;
    }

    if (operator === 'between' && !['number', 'date'].includes(dataType)) {
      return `Between operator requires number or date data type`;
    }

    return null;
  }

  /**
   * Validate value type matches expected data type
   */
  private validateValueType(value: any, dataType: FilterDataType): string | null {
    switch (dataType) {
      case 'number':
        if (typeof value !== 'number' && !Array.isArray(value)) {
          return 'Value must be a number';
        }
        if (Array.isArray(value) && !value.every(v => typeof v === 'number')) {
          return 'Array values must all be numbers';
        }
        break;
      
      case 'string':
        if (typeof value !== 'string' && !Array.isArray(value)) {
          return 'Value must be a string';
        }
        if (Array.isArray(value) && !value.every(v => typeof v === 'string')) {
          return 'Array values must all be strings';
        }
        break;
      
      case 'boolean':
        if (typeof value !== 'boolean') {
          return 'Value must be a boolean';
        }
        break;
      
      case 'date':
        if (!(value instanceof Date) && typeof value !== 'string' && !Array.isArray(value)) {
          return 'Value must be a date or date string';
        }
        break;
      
      case 'array':
        if (!Array.isArray(value)) {
          return 'Value must be an array';
        }
        break;
    }

    return null;
  }

  /**
   * Find contradictory conditions in an AND group
   */
  private findContradictions(children: FilterTree[]): string[] {
    const contradictions: string[] = [];
    const conditions = children.filter(child => child.type === 'condition');

    // Check for direct contradictions (same field, opposing conditions)
    for (let i = 0; i < conditions.length; i++) {
      for (let j = i + 1; j < conditions.length; j++) {
        const cond1 = conditions[i].condition;
        const cond2 = conditions[j].condition;

        if (cond1 && cond2 && cond1.field === cond2.field) {
          const contradiction = this.detectContradiction(cond1, cond2);
          if (contradiction) {
            contradictions.push(contradiction);
          }
        }
      }
    }

    return contradictions;
  }

  /**
   * Detect if two conditions on the same field are contradictory
   */
  private detectContradiction(cond1: FilterCondition, cond2: FilterCondition): string | null {
    const { operator: op1, value: val1 } = cond1;
    const { operator: op2, value: val2 } = cond2;

    // equals vs not_equals with same value
    if ((op1 === 'equals' && op2 === 'not_equals') || (op1 === 'not_equals' && op2 === 'equals')) {
      if (JSON.stringify(val1) === JSON.stringify(val2)) {
        return `Field '${cond1.field}' cannot be both equal to and not equal to '${val1}'`;
      }
    }

    // Multiple equals with different values
    if (op1 === 'equals' && op2 === 'equals' && JSON.stringify(val1) !== JSON.stringify(val2)) {
      return `Field '${cond1.field}' cannot equal both '${val1}' and '${val2}'`;
    }

    // Numeric contradictions
    if (cond1.dataType === 'number' || cond1.dataType === 'date') {
      if (op1 === 'greater_than' && op2 === 'less_than' && val1 >= val2) {
        return `Field '${cond1.field}' cannot be both > ${val1} and < ${val2}`;
      }
      
      if (op1 === 'greater_equal' && op2 === 'less_equal' && val1 > val2) {
        return `Field '${cond1.field}' cannot be both >= ${val1} and <= ${val2}`;
      }
    }

    return null;
  }

  /**
   * Generate simplification suggestions
   */
  private generateSimplificationSuggestions(tree: FilterTree): any[] {
    const suggestions: any[] = [];

    // Count conditions and groups
    const conditionCount = this.countConditions(tree);
    const groupCount = this.countGroups(tree);

    if (groupCount > conditionCount * 0.5) {
      suggestions.push({
        type: 'simplify',
        message: 'Filter has many nested groups relative to conditions - consider flattening',
        proposedChange: this.flattenTree(tree)
      });
    }

    // Look for redundant parentheses
    const hasRedundantParens = this.hasRedundantParentheses(tree);
    if (hasRedundantParens) {
      suggestions.push({
        type: 'simplify',
        message: 'Filter contains redundant grouping - can be simplified',
        proposedChange: this.removeRedundantParentheses(tree)
      });
    }

    return suggestions;
  }

  /**
   * Calculate filter complexity (1-10 scale)
   */
  private calculateComplexity(tree: FilterTree): number {
    let complexity = 0;
    
    const traverse = (node: FilterTree, depth: number = 0): void => {
      if (node.type === 'condition') {
        complexity += 1 + (depth * 0.2); // Base + depth penalty
        
        // Add complexity for certain operators
        if (node.condition) {
          const expensiveOps = ['matches_regex', 'fuzzy_match', 'contains'];
          if (expensiveOps.includes(node.condition.operator)) {
            complexity += 0.5;
          }
        }
      } else if (node.type === 'group') {
        complexity += 0.1; // Small overhead for grouping
        
        if (node.operator === 'NOT') {
          complexity += 0.3; // NOT operations are more expensive
        }
        
        if (node.children) {
          node.children.forEach(child => traverse(child, depth + 1));
        }
      }
    };
    
    traverse(tree);
    return Math.min(10, Math.max(1, Math.ceil(complexity)));
  }

  /**
   * Estimate execution time in milliseconds
   */
  private estimateExecutionTime(tree: FilterTree): number {
    const complexity = this.calculateComplexity(tree);
    const conditionCount = this.countConditions(tree);
    
    // Base time + complexity factor + condition count
    return Math.ceil(10 + (complexity * 5) + (conditionCount * 2));
  }

  /**
   * Suggest database indexes that would improve performance
   */
  private suggestIndexes(tree: FilterTree): string[] {
    const indexes = new Set<string>();
    
    const traverse = (node: FilterTree): void => {
      if (node.type === 'condition' && node.condition) {
        indexes.add(node.condition.field);
        
        // Composite indexes for range queries
        const rangeOps = ['greater_than', 'less_than', 'between', 'greater_equal', 'less_equal'];
        if (rangeOps.includes(node.condition.operator)) {
          indexes.add(`${node.condition.field}_range_idx`);
        }
      } else if (node.children) {
        node.children.forEach(traverse);
      }
    };
    
    traverse(tree);
    return Array.from(indexes);
  }

  /**
   * Helper methods
   */
  private deepClone(obj: any): any {
    return JSON.parse(JSON.stringify(obj));
  }

  private createEmptyTree(): FilterTree {
    return {
      id: crypto.randomUUID(),
      type: 'group',
      operator: 'AND',
      children: []
    };
  }

  private calculateDepth(tree: FilterTree): number {
    if (tree.type === 'condition') {
      return 1;
    }
    
    if (tree.children && tree.children.length > 0) {
      return 1 + Math.max(...tree.children.map(child => this.calculateDepth(child)));
    }
    
    return 1;
  }

  private calculateDepthWithLimit(tree: FilterTree, maxDepth: number, currentDepth: number = 0): number {
    // Prevent stack overflow by limiting recursive depth
    if (currentDepth > maxDepth) {
      return currentDepth;
    }
    
    if (tree.type === 'condition') {
      return currentDepth + 1;
    }
    
    if (tree.children && tree.children.length > 0) {
      return 1 + Math.max(...tree.children.map(child => 
        this.calculateDepthWithLimit(child, maxDepth, currentDepth + 1)
      ));
    }
    
    return currentDepth + 1;
  }

  private countTotalNodes(tree: FilterTree): number {
    let count = 1; // Count this node
    
    if (tree.children) {
      count += tree.children.reduce((sum, child) => sum + this.countTotalNodes(child), 0);
    }
    
    return count;
  }

  private countConditions(tree: FilterTree): number {
    if (tree.type === 'condition') {
      return 1;
    }
    
    if (tree.children) {
      return tree.children.reduce((count, child) => count + this.countConditions(child), 0);
    }
    
    return 0;
  }

  private countGroups(tree: FilterTree): number {
    let count = tree.type === 'group' ? 1 : 0;
    
    if (tree.children) {
      count += tree.children.reduce((sum, child) => sum + this.countGroups(child), 0);
    }
    
    return count;
  }

  private hasRedundantParentheses(tree: FilterTree): boolean {
    // Simple heuristic: if a group has only one child that's also a group
    return tree.type === 'group' && 
           tree.children?.length === 1 && 
           tree.children[0].type === 'group';
  }

  private removeRedundantParentheses(tree: FilterTree): FilterTree {
    // Implementation would flatten unnecessary nested single-child groups
    return tree; // Simplified for now
  }

  private flattenTree(tree: FilterTree): FilterTree {
    // Implementation would flatten nested groups with same operators
    return tree; // Simplified for now
  }
}