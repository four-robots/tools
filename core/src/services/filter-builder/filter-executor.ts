import {
  FilterTree,
  FilterCondition,
  SearchQuery,
  FilterOperator,
  BooleanOperator
} from '../../shared/types/filter-builder.js';
import { DatabaseConnection } from '../../utils/database.js';

export interface ExecutionContext {
  tableName?: string;
  fieldMappings?: Record<string, string>;
  parameters?: Record<string, any>;
}

/**
 * Service for executing filters against different data sources
 */
export class FilterExecutor {
  private database: DatabaseConnection;
  private sqlOperatorMap: Record<FilterOperator, string>;
  private parameterCounter = 0;

  // SECURITY: Whitelist of allowed field names to prevent SQL injection
  private static readonly ALLOWED_FIELDS = new Set([
    'title', 'content', 'created_at', 'updated_at', 'priority', 'status',
    'tags', 'category', 'author', 'metadata.type', 'metadata.source',
    'description', 'name', 'id', 'user_id', 'project_id', 'task_id',
    'board_id', 'column_id', 'label', 'due_date', 'completed_at',
    'search_text', 'search_vector', 'full_text', 'summary'
  ]);

  // SECURITY: Whitelist of allowed table names to prevent SQL injection
  private static readonly ALLOWED_TABLES = new Set([
    'search_results', 'kanban_cards', 'kanban_boards', 'kanban_columns',
    'wiki_pages', 'memory_nodes', 'memory_connections', 'users',
    'projects', 'tasks', 'documents', 'search_index'
  ]);

  constructor(database: DatabaseConnection) {
    this.database = database;
    this.initializeSqlOperatorMap();
  }

  /**
   * Convert filter tree to SQL query
   */
  async toSQL(filterTree: FilterTree, context: ExecutionContext = {}): Promise<SearchQuery> {
    const { tableName = 'search_results', fieldMappings = {} } = context;
    
    // SECURITY: Validate table name against whitelist to prevent SQL injection
    if (!FilterExecutor.ALLOWED_TABLES.has(tableName)) {
      throw new Error(`Invalid table name: ${tableName}. Table not in allowed list.`);
    }
    
    this.parameterCounter = 0;
    const parameters: Record<string, any> = {};

    const buildCondition = (node: FilterTree): string => {
      if (node.type === 'condition' && node.condition) {
        return this.buildSqlCondition(node.condition, fieldMappings, parameters);
      } else if (node.type === 'group' && node.children) {
        if (node.children.length === 0) {
          return '1=1'; // Always true for empty groups
        }

        const childConditions = node.children
          .map(buildCondition)
          .filter(condition => condition.length > 0);

        if (childConditions.length === 0) {
          return '1=1';
        }

        const joined = childConditions.join(` ${node.operator} `);
        
        if (node.operator === 'NOT') {
          return `NOT (${joined})`;
        } else if (childConditions.length > 1) {
          return `(${joined})`;
        } else {
          return joined;
        }
      }

      return '1=1';
    };

    const whereClause = buildCondition(filterTree);
    const sql = `SELECT * FROM ${tableName} WHERE ${whereClause}`;

    return {
      sql,
      parameters,
      metadata: {
        complexity: this.calculateComplexity(filterTree),
        indexHints: this.generateIndexHints(filterTree),
        optimizationNotes: []
      }
    };
  }

  /**
   * Convert filter tree to Elasticsearch query
   */
  async toElasticsearch(filterTree: FilterTree, context: ExecutionContext = {}): Promise<SearchQuery> {
    const buildQuery = (node: FilterTree): any => {
      if (node.type === 'condition' && node.condition) {
        return this.buildElasticsearchCondition(node.condition);
      } else if (node.type === 'group' && node.children) {
        if (node.children.length === 0) {
          return { match_all: {} };
        }

        const childQueries = node.children
          .map(buildQuery)
          .filter(query => query !== null);

        if (childQueries.length === 0) {
          return { match_all: {} };
        }

        switch (node.operator) {
          case 'AND':
            return childQueries.length === 1 
              ? childQueries[0] 
              : { bool: { must: childQueries } };
          
          case 'OR':
            return childQueries.length === 1 
              ? childQueries[0] 
              : { bool: { should: childQueries, minimum_should_match: 1 } };
          
          case 'NOT':
            return { bool: { must_not: childQueries } };
          
          default:
            return { bool: { must: childQueries } };
        }
      }

      return { match_all: {} };
    };

    const query = buildQuery(filterTree);
    
    return {
      sql: '', // Not applicable for Elasticsearch
      elasticsearch: {
        query,
        size: 100, // Default size
        from: 0
      },
      parameters: {},
      metadata: {
        complexity: this.calculateComplexity(filterTree),
        indexHints: [],
        optimizationNotes: ['Consider using specific field mappings for better performance']
      }
    };
  }

  /**
   * Convert filter tree to MongoDB query
   */
  async toMongoDB(filterTree: FilterTree, context: ExecutionContext = {}): Promise<SearchQuery> {
    const buildQuery = (node: FilterTree): any => {
      if (node.type === 'condition' && node.condition) {
        return this.buildMongoCondition(node.condition);
      } else if (node.type === 'group' && node.children) {
        if (node.children.length === 0) {
          return {};
        }

        const childQueries = node.children
          .map(buildQuery)
          .filter(query => Object.keys(query).length > 0);

        if (childQueries.length === 0) {
          return {};
        }

        switch (node.operator) {
          case 'AND':
            return childQueries.length === 1 
              ? childQueries[0] 
              : { $and: childQueries };
          
          case 'OR':
            return childQueries.length === 1 
              ? childQueries[0] 
              : { $or: childQueries };
          
          case 'NOT':
            return { $not: childQueries.length === 1 ? childQueries[0] : { $and: childQueries } };
          
          default:
            return { $and: childQueries };
        }
      }

      return {};
    };

    const query = buildQuery(filterTree);
    
    return {
      sql: '', // Not applicable for MongoDB
      mongodb: query,
      parameters: {},
      metadata: {
        complexity: this.calculateComplexity(filterTree),
        indexHints: this.generateMongoIndexHints(filterTree),
        optimizationNotes: ['Consider compound indexes for complex queries']
      }
    };
  }

  /**
   * Execute SQL query against database
   */
  async executeSQL(searchQuery: SearchQuery): Promise<any[]> {
    const { sql, parameters } = searchQuery;
    
    // Build parameterized query for Kysely
    let query = this.database.selectFrom('search_results' as any);
    
    // This is a simplified implementation - in reality, you'd need to parse
    // the generated SQL and apply it properly with Kysely's query builder
    const results = await query
      .selectAll()
      .execute();
    
    return results;
  }

  /**
   * Initialize SQL operator mappings
   */
  private initializeSqlOperatorMap(): void {
    this.sqlOperatorMap = {
      equals: '=',
      not_equals: '!=',
      greater_than: '>',
      less_than: '<',
      greater_equal: '>=',
      less_equal: '<=',
      contains: 'ILIKE',
      not_contains: 'NOT ILIKE',
      starts_with: 'ILIKE',
      ends_with: 'ILIKE',
      in: 'IN',
      not_in: 'NOT IN',
      is_null: 'IS NULL',
      is_not_null: 'IS NOT NULL',
      between: 'BETWEEN',
      matches_regex: '~*',
      fuzzy_match: 'ILIKE'
    };
  }

  /**
   * Build SQL condition from filter condition
   */
  private buildSqlCondition(
    condition: FilterCondition,
    fieldMappings: Record<string, string>,
    parameters: Record<string, any>
  ): string {
    const { field, operator, value } = condition;
    const mappedField = fieldMappings[field] || field;
    
    // SECURITY: Validate field names against whitelist to prevent SQL injection
    if (!FilterExecutor.ALLOWED_FIELDS.has(mappedField)) {
      throw new Error(`Invalid field name: ${mappedField}. Field not in allowed list.`);
    }
    
    const sqlOperator = this.sqlOperatorMap[operator];

    if (!sqlOperator) {
      throw new Error(`Unsupported operator: ${operator}`);
    }

    // Handle special operators
    switch (operator) {
      case 'is_null':
        return `${mappedField} IS NULL`;
      
      case 'is_not_null':
        return `${mappedField} IS NOT NULL`;
      
      case 'between':
        if (!Array.isArray(value) || value.length !== 2) {
          throw new Error('Between operator requires array with exactly 2 values');
        }
        const param1 = this.addParameter(parameters, value[0]);
        const param2 = this.addParameter(parameters, value[1]);
        return `${mappedField} BETWEEN $${param1} AND $${param2}`;
      
      case 'in':
      case 'not_in':
        if (!Array.isArray(value)) {
          throw new Error(`${operator} requires an array value`);
        }
        const paramName = this.addParameter(parameters, value);
        return `${mappedField} ${sqlOperator} ($${paramName})`;
      
      case 'contains':
      case 'fuzzy_match':
        const containsParam = this.addParameter(parameters, `%${value}%`);
        return `${mappedField} ${sqlOperator} $${containsParam}`;
      
      case 'not_contains':
        const notContainsParam = this.addParameter(parameters, `%${value}%`);
        return `${mappedField} ${sqlOperator} $${notContainsParam}`;
      
      case 'starts_with':
        const startsParam = this.addParameter(parameters, `${value}%`);
        return `${mappedField} ${sqlOperator} $${startsParam}`;
      
      case 'ends_with':
        const endsParam = this.addParameter(parameters, `%${value}`);
        return `${mappedField} ${sqlOperator} $${endsParam}`;
      
      default:
        const param = this.addParameter(parameters, value);
        return `${mappedField} ${sqlOperator} $${param}`;
    }
  }

  /**
   * Build Elasticsearch condition
   */
  private buildElasticsearchCondition(condition: FilterCondition): any {
    const { field, operator, value } = condition;

    switch (operator) {
      case 'equals':
        return { term: { [field]: value } };
      
      case 'not_equals':
        return { bool: { must_not: { term: { [field]: value } } } };
      
      case 'greater_than':
        return { range: { [field]: { gt: value } } };
      
      case 'less_than':
        return { range: { [field]: { lt: value } } };
      
      case 'greater_equal':
        return { range: { [field]: { gte: value } } };
      
      case 'less_equal':
        return { range: { [field]: { lte: value } } };
      
      case 'between':
        if (!Array.isArray(value) || value.length !== 2) {
          throw new Error('Between operator requires array with exactly 2 values');
        }
        return { range: { [field]: { gte: value[0], lte: value[1] } } };
      
      case 'contains':
        return { wildcard: { [field]: `*${value}*` } };
      
      case 'not_contains':
        return { bool: { must_not: { wildcard: { [field]: `*${value}*` } } } };
      
      case 'starts_with':
        return { prefix: { [field]: value } };
      
      case 'ends_with':
        return { wildcard: { [field]: `*${value}` } };
      
      case 'in':
        return { terms: { [field]: Array.isArray(value) ? value : [value] } };
      
      case 'not_in':
        return { bool: { must_not: { terms: { [field]: Array.isArray(value) ? value : [value] } } } };
      
      case 'is_null':
        return { bool: { must_not: { exists: { field } } } };
      
      case 'is_not_null':
        return { exists: { field } };
      
      case 'matches_regex':
        return { regexp: { [field]: value } };
      
      case 'fuzzy_match':
        return { fuzzy: { [field]: { value, fuzziness: 'AUTO' } } };
      
      default:
        throw new Error(`Unsupported Elasticsearch operator: ${operator}`);
    }
  }

  /**
   * Build MongoDB condition
   */
  private buildMongoCondition(condition: FilterCondition): any {
    const { field, operator, value } = condition;

    switch (operator) {
      case 'equals':
        return { [field]: value };
      
      case 'not_equals':
        return { [field]: { $ne: value } };
      
      case 'greater_than':
        return { [field]: { $gt: value } };
      
      case 'less_than':
        return { [field]: { $lt: value } };
      
      case 'greater_equal':
        return { [field]: { $gte: value } };
      
      case 'less_equal':
        return { [field]: { $lte: value } };
      
      case 'between':
        if (!Array.isArray(value) || value.length !== 2) {
          throw new Error('Between operator requires array with exactly 2 values');
        }
        return { [field]: { $gte: value[0], $lte: value[1] } };
      
      case 'contains':
        return { [field]: { $regex: value, $options: 'i' } };
      
      case 'not_contains':
        return { [field]: { $not: { $regex: value, $options: 'i' } } };
      
      case 'starts_with':
        return { [field]: { $regex: `^${this.escapeRegex(value)}`, $options: 'i' } };
      
      case 'ends_with':
        return { [field]: { $regex: `${this.escapeRegex(value)}$`, $options: 'i' } };
      
      case 'in':
        return { [field]: { $in: Array.isArray(value) ? value : [value] } };
      
      case 'not_in':
        return { [field]: { $nin: Array.isArray(value) ? value : [value] } };
      
      case 'is_null':
        return { [field]: null };
      
      case 'is_not_null':
        return { [field]: { $ne: null } };
      
      case 'matches_regex':
        return { [field]: { $regex: value } };
      
      case 'fuzzy_match':
        // MongoDB doesn't have built-in fuzzy matching, so we use regex approximation
        return { [field]: { $regex: value.split('').join('.*'), $options: 'i' } };
      
      default:
        throw new Error(`Unsupported MongoDB operator: ${operator}`);
    }
  }

  /**
   * Add parameter to parameters object and return parameter name
   */
  private addParameter(parameters: Record<string, any>, value: any): string {
    this.parameterCounter++;
    const paramName = `param${this.parameterCounter}`;
    parameters[paramName] = value;
    return paramName;
  }

  /**
   * Calculate filter complexity
   */
  private calculateComplexity(tree: FilterTree): number {
    let complexity = 0;
    
    const traverse = (node: FilterTree, depth = 0): void => {
      if (node.type === 'condition') {
        complexity += 1 + (depth * 0.2);
        
        // Add complexity for expensive operations
        if (node.condition) {
          const expensiveOps = ['matches_regex', 'fuzzy_match', 'contains', 'not_contains'];
          if (expensiveOps.includes(node.condition.operator)) {
            complexity += 0.5;
          }
        }
      } else if (node.type === 'group' && node.children) {
        complexity += 0.1;
        if (node.operator === 'NOT') {
          complexity += 0.3;
        }
        node.children.forEach(child => traverse(child, depth + 1));
      }
    };
    
    traverse(tree);
    return Math.min(10, Math.max(1, Math.ceil(complexity)));
  }

  /**
   * Generate SQL index hints
   */
  private generateIndexHints(tree: FilterTree): string[] {
    const hints = new Set<string>();
    
    const traverse = (node: FilterTree): void => {
      if (node.type === 'condition' && node.condition) {
        const { field, operator } = node.condition;
        hints.add(`CREATE INDEX IF NOT EXISTS idx_${field} ON table_name (${field})`);
        
        // Suggest partial indexes for specific operators
        if (['contains', 'starts_with', 'ends_with'].includes(operator)) {
          hints.add(`CREATE INDEX IF NOT EXISTS idx_${field}_text ON table_name USING gin (${field} gin_trgm_ops)`);
        }
        
        if (['greater_than', 'less_than', 'between'].includes(operator)) {
          hints.add(`CREATE INDEX IF NOT EXISTS idx_${field}_btree ON table_name (${field})`);
        }
      } else if (node.children) {
        node.children.forEach(traverse);
      }
    };
    
    traverse(tree);
    return Array.from(hints);
  }

  /**
   * Generate MongoDB index hints
   */
  private generateMongoIndexHints(tree: FilterTree): string[] {
    const hints = new Set<string>();
    
    const traverse = (node: FilterTree): void => {
      if (node.type === 'condition' && node.condition) {
        const { field, operator } = node.condition;
        hints.add(`db.collection.createIndex({ "${field}": 1 })`);
        
        // Suggest text indexes for text operations
        if (['contains', 'starts_with', 'ends_with', 'matches_regex'].includes(operator)) {
          hints.add(`db.collection.createIndex({ "${field}": "text" })`);
        }
      } else if (node.children) {
        node.children.forEach(traverse);
      }
    };
    
    traverse(tree);
    return Array.from(hints);
  }

  /**
   * Escape regex special characters
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}