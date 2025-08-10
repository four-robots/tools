import {
  FilterTree,
  FilterCondition,
  BooleanOperator,
  FilterOperator,
  FilterDataType,
  FilterMetadata
} from '../../shared/types/filter-builder.js';

export interface FilterTreeBuilderOptions {
  maxDepth?: number;
  maxConditions?: number;
}

/**
 * Service for building and manipulating filter trees
 */
export class FilterTreeBuilder {
  private options: FilterTreeBuilderOptions;

  constructor(options: FilterTreeBuilderOptions = {}) {
    this.options = {
      maxDepth: 10,
      maxConditions: 100,
      ...options
    };
  }

  /**
   * Create an empty filter tree
   */
  createEmptyTree(): FilterTree {
    return {
      id: crypto.randomUUID(),
      type: 'group',
      operator: 'AND',
      children: [],
      metadata: {
        label: 'Root Filter Group',
        collapsed: false
      }
    };
  }

  /**
   * Create a filter condition
   */
  createCondition(
    field: string,
    operator: FilterOperator,
    value: any,
    dataType: FilterDataType,
    options?: {
      label?: string;
      description?: string;
      caseSensitive?: boolean;
    }
  ): FilterTree {
    const condition: FilterCondition = {
      id: crypto.randomUUID(),
      field,
      operator,
      value,
      dataType,
      label: options?.label,
      description: options?.description,
      caseSensitive: options?.caseSensitive ?? false,
      isRequired: false
    };

    return {
      id: crypto.randomUUID(),
      type: 'condition',
      condition,
      metadata: {
        label: options?.label || `${field} ${operator} ${value}`,
        collapsed: false
      }
    };
  }

  /**
   * Create a filter group
   */
  createGroup(
    operator: BooleanOperator = 'AND',
    children: FilterTree[] = [],
    metadata?: FilterMetadata
  ): FilterTree {
    return {
      id: crypto.randomUUID(),
      type: 'group',
      operator,
      children: [...children],
      metadata: {
        label: `${operator} Group`,
        collapsed: false,
        ...metadata
      }
    };
  }

  /**
   * Add a child node to a group
   */
  addChild(parentTree: FilterTree, child: FilterTree, index?: number): FilterTree {
    if (parentTree.type !== 'group') {
      throw new Error('Can only add children to group nodes');
    }

    const depth = this.calculateDepth(parentTree);
    const conditionCount = this.countConditions(parentTree);

    if (depth >= this.options.maxDepth!) {
      throw new Error(`Maximum depth of ${this.options.maxDepth} exceeded`);
    }

    if (conditionCount >= this.options.maxConditions!) {
      throw new Error(`Maximum conditions of ${this.options.maxConditions} exceeded`);
    }

    const newTree = this.deepClone(parentTree);
    if (!newTree.children) {
      newTree.children = [];
    }

    if (index !== undefined) {
      newTree.children.splice(index, 0, child);
    } else {
      newTree.children.push(child);
    }

    return newTree;
  }

  /**
   * Remove a child node from a group
   */
  removeChild(parentTree: FilterTree, childId: string): FilterTree {
    const newTree = this.deepClone(parentTree);
    
    const removeRecursive = (node: FilterTree): boolean => {
      if (node.type === 'group' && node.children) {
        const childIndex = node.children.findIndex(child => child.id === childId);
        if (childIndex !== -1) {
          node.children.splice(childIndex, 1);
          return true;
        }
        
        for (const child of node.children) {
          if (removeRecursive(child)) {
            return true;
          }
        }
      }
      return false;
    };

    removeRecursive(newTree);
    return newTree;
  }

  /**
   * Update a node in the tree
   */
  updateNode(tree: FilterTree, nodeId: string, updates: Partial<FilterTree>): FilterTree {
    const newTree = this.deepClone(tree);
    
    const updateRecursive = (node: FilterTree): boolean => {
      if (node.id === nodeId) {
        Object.assign(node, updates);
        return true;
      }
      
      if (node.type === 'group' && node.children) {
        for (const child of node.children) {
          if (updateRecursive(child)) {
            return true;
          }
        }
      }
      
      return false;
    };

    updateRecursive(newTree);
    return newTree;
  }

  /**
   * Move a node to a new position
   */
  moveNode(
    tree: FilterTree,
    nodeId: string,
    newParentId: string,
    newIndex?: number
  ): FilterTree {
    const nodeToMove = this.findNode(tree, nodeId);
    if (!nodeToMove) {
      throw new Error('Node to move not found');
    }

    const newParent = this.findNode(tree, newParentId);
    if (!newParent || newParent.type !== 'group') {
      throw new Error('New parent must be a group node');
    }

    // Remove node from current location
    let treeWithoutNode = this.removeChild(tree, nodeId);
    
    // Add node to new location
    return this.addChild(treeWithoutNode, nodeToMove, newIndex);
  }

  /**
   * Duplicate a node
   */
  duplicateNode(tree: FilterTree, nodeId: string): FilterTree {
    const nodeToDuplicate = this.findNode(tree, nodeId);
    if (!nodeToDuplicate) {
      throw new Error('Node to duplicate not found');
    }

    const duplicatedNode = this.deepClone(nodeToDuplicate);
    this.assignNewIds(duplicatedNode);

    // Find parent and add duplicated node after the original
    const parent = this.findParent(tree, nodeId);
    if (!parent) {
      throw new Error('Cannot duplicate root node');
    }

    const siblingIndex = parent.children!.findIndex(child => child.id === nodeId);
    return this.addChild(tree, duplicatedNode, siblingIndex + 1);
  }

  /**
   * Convert tree to nested parentheses string
   */
  toParenthesesString(tree: FilterTree): string {
    const convert = (node: FilterTree): string => {
      if (node.type === 'condition' && node.condition) {
        const { field, operator, value } = node.condition;
        return `${field} ${operator} ${JSON.stringify(value)}`;
      } else if (node.type === 'group' && node.children) {
        if (node.children.length === 0) {
          return '';
        }
        if (node.children.length === 1) {
          return convert(node.children[0]);
        }
        
        const childStrings = node.children
          .map(convert)
          .filter(str => str.length > 0);
          
        if (childStrings.length === 0) {
          return '';
        }
        
        const joined = childStrings.join(` ${node.operator} `);
        return node.operator === 'NOT' ? `NOT (${joined})` : `(${joined})`;
      }
      
      return '';
    };

    return convert(tree);
  }

  /**
   * Find a node by ID
   */
  findNode(tree: FilterTree, nodeId: string): FilterTree | null {
    if (tree.id === nodeId) {
      return tree;
    }
    
    if (tree.type === 'group' && tree.children) {
      for (const child of tree.children) {
        const found = this.findNode(child, nodeId);
        if (found) {
          return found;
        }
      }
    }
    
    return null;
  }

  /**
   * Find the parent of a node
   */
  findParent(tree: FilterTree, nodeId: string): FilterTree | null {
    if (tree.type === 'group' && tree.children) {
      for (const child of tree.children) {
        if (child.id === nodeId) {
          return tree;
        }
        
        const parent = this.findParent(child, nodeId);
        if (parent) {
          return parent;
        }
      }
    }
    
    return null;
  }

  /**
   * Get all condition nodes
   */
  getConditions(tree: FilterTree): FilterTree[] {
    const conditions: FilterTree[] = [];
    
    const traverse = (node: FilterTree): void => {
      if (node.type === 'condition') {
        conditions.push(node);
      } else if (node.type === 'group' && node.children) {
        node.children.forEach(traverse);
      }
    };
    
    traverse(tree);
    return conditions;
  }

  /**
   * Get all group nodes
   */
  getGroups(tree: FilterTree): FilterTree[] {
    const groups: FilterTree[] = [];
    
    const traverse = (node: FilterTree): void => {
      if (node.type === 'group') {
        groups.push(node);
        node.children?.forEach(traverse);
      }
    };
    
    traverse(tree);
    return groups;
  }

  /**
   * Calculate tree depth
   */
  calculateDepth(tree: FilterTree): number {
    if (tree.type === 'condition') {
      return 1;
    }
    
    if (tree.type === 'group' && tree.children) {
      if (tree.children.length === 0) {
        return 1;
      }
      
      return 1 + Math.max(...tree.children.map(child => this.calculateDepth(child)));
    }
    
    return 1;
  }

  /**
   * Count total conditions in tree
   */
  countConditions(tree: FilterTree): number {
    if (tree.type === 'condition') {
      return 1;
    }
    
    if (tree.type === 'group' && tree.children) {
      return tree.children.reduce((count, child) => count + this.countConditions(child), 0);
    }
    
    return 0;
  }

  /**
   * Validate tree structure
   */
  validateStructure(tree: FilterTree): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    const validate = (node: FilterTree, depth: number = 0): void => {
      if (depth > this.options.maxDepth!) {
        errors.push(`Maximum depth of ${this.options.maxDepth} exceeded`);
      }
      
      if (node.type === 'condition') {
        if (!node.condition) {
          errors.push(`Condition node ${node.id} missing condition data`);
        }
      } else if (node.type === 'group') {
        if (!node.operator) {
          errors.push(`Group node ${node.id} missing operator`);
        }
        
        if (node.children) {
          if (node.children.length === 0) {
            errors.push(`Group node ${node.id} has no children`);
          }
          
          node.children.forEach(child => validate(child, depth + 1));
        }
      } else {
        errors.push(`Invalid node type: ${node.type}`);
      }
    };
    
    validate(tree);
    
    const conditionCount = this.countConditions(tree);
    if (conditionCount > this.options.maxConditions!) {
      errors.push(`Too many conditions: ${conditionCount} (max: ${this.options.maxConditions})`);
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Deep clone a tree node
   */
  private deepClone(node: FilterTree): FilterTree {
    const cloned = JSON.parse(JSON.stringify(node));
    return cloned;
  }

  /**
   * Assign new UUIDs to all nodes in a tree
   */
  private assignNewIds(tree: FilterTree): void {
    tree.id = crypto.randomUUID();
    
    if (tree.condition) {
      tree.condition.id = crypto.randomUUID();
    }
    
    if (tree.children) {
      tree.children.forEach(child => this.assignNewIds(child));
    }
  }

  /**
   * Simplify tree by removing unnecessary groups
   */
  simplify(tree: FilterTree): FilterTree {
    const simplified = this.deepClone(tree);
    
    const simplifyRecursive = (node: FilterTree): FilterTree | null => {
      if (node.type === 'condition') {
        return node;
      }
      
      if (node.type === 'group' && node.children) {
        // Recursively simplify children
        const simplifiedChildren = node.children
          .map(simplifyRecursive)
          .filter((child): child is FilterTree => child !== null);
        
        // Remove empty children
        node.children = simplifiedChildren;
        
        // If group has no children, remove it
        if (node.children.length === 0) {
          return null;
        }
        
        // If group has only one child, replace with child (unless it's root)
        if (node.children.length === 1 && node.id !== simplified.id) {
          return node.children[0];
        }
        
        return node;
      }
      
      return node;
    };
    
    const result = simplifyRecursive(simplified);
    return result || this.createEmptyTree();
  }

  /**
   * Flatten nested groups with the same operator
   */
  flatten(tree: FilterTree): FilterTree {
    const flattened = this.deepClone(tree);
    
    const flattenRecursive = (node: FilterTree): void => {
      if (node.type === 'group' && node.children) {
        // First, recursively flatten children
        node.children.forEach(flattenRecursive);
        
        // Then flatten this level
        const newChildren: FilterTree[] = [];
        
        for (const child of node.children) {
          if (child.type === 'group' && child.operator === node.operator) {
            // Merge children of same-operator groups
            if (child.children) {
              newChildren.push(...child.children);
            }
          } else {
            newChildren.push(child);
          }
        }
        
        node.children = newChildren;
      }
    };
    
    flattenRecursive(flattened);
    return flattened;
  }
}