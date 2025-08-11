/**
 * SQL Security Utilities
 * 
 * Provides secure SQL query utilities to prevent injection attacks,
 * particularly for LIKE patterns and input sanitization.
 */

/**
 * Input sanitization utility to prevent injection attacks
 */
export const sanitizeInput = (input: string): string => {
  if (!input || typeof input !== 'string') {
    return '';
  }
  // Remove potential SQL injection characters and normalize
  return input
    .replace(/[\x00\x08\x09\x1a\n\r"'\\]/g, '') // Note: % and _ are handled in LIKE escaping
    .trim()
    .substring(0, 1000); // Limit length to prevent DoS
};

/**
 * Escapes LIKE pattern special characters to prevent SQL injection
 * PostgreSQL LIKE patterns: % (any characters), _ (single character), \ (escape character)
 * 
 * @param pattern - The search pattern to escape
 * @param escapeChar - The escape character to use (default: '\')
 * @returns Escaped pattern safe for use in LIKE queries
 */
export const escapeLikePattern = (pattern: string, escapeChar: string = '\\'): string => {
  if (!pattern || typeof pattern !== 'string') {
    return '';
  }
  
  // Escape the escape character first (must be done first)
  // Then escape % and _ characters that have special meaning in LIKE
  return pattern
    .replace(new RegExp(escapeChar.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), escapeChar + escapeChar)
    .replace(/\%/g, escapeChar + '%')     // Escape percent: % -> \%  
    .replace(/\_/g, escapeChar + '_');    // Escape underscore: _ -> \_
};

/**
 * Creates a safe search pattern for LIKE queries with wildcards
 * 
 * @param searchTerm - The user input to search for
 * @param options - Configuration options
 * @returns Object with escaped pattern and SQL clause
 */
export const createSafeSearchPattern = (
  searchTerm: string,
  options: {
    prefix?: boolean;     // Add % at start (default: true)
    suffix?: boolean;     // Add % at end (default: true) 
    escapeChar?: string;  // Escape character (default: '\')
    caseSensitive?: boolean; // Use LIKE vs ILIKE (default: false)
  } = {}
): {
  pattern: string;
  sqlClause: string;
  escapedTerm: string;
} => {
  const {
    prefix = true,
    suffix = true,
    escapeChar = '\\',
    caseSensitive = false
  } = options;
  
  // First sanitize, then escape for LIKE
  const sanitized = sanitizeInput(searchTerm);
  const escaped = escapeLikePattern(sanitized, escapeChar);
  
  // Build pattern with wildcards
  const prefixWildcard = prefix ? '%' : '';
  const suffixWildcard = suffix ? '%' : '';
  const pattern = prefixWildcard + escaped + suffixWildcard;
  
  // Create SQL clause with proper escape syntax
  const operator = caseSensitive ? 'LIKE' : 'ILIKE';
  const sqlClause = `${operator} ? ESCAPE '${escapeChar}'`;
  
  return {
    pattern,
    sqlClause,
    escapedTerm: escaped
  };
};

/**
 * Validates and sanitizes SQL column names to prevent injection
 * Only allows alphanumeric characters, underscores, and dots
 */
export const sanitizeColumnName = (columnName: string): string => {
  if (!columnName || typeof columnName !== 'string') {
    throw new Error('Invalid column name');
  }
  
  // Only allow safe characters for column names
  const sanitized = columnName.replace(/[^a-zA-Z0-9_.]/g, '');
  
  if (sanitized !== columnName || sanitized.length === 0) {
    throw new Error(`Invalid column name: ${columnName}`);
  }
  
  return sanitized;
};

/**
 * Validates and sanitizes SQL table names to prevent injection
 */
export const sanitizeTableName = (tableName: string): string => {
  if (!tableName || typeof tableName !== 'string') {
    throw new Error('Invalid table name');
  }
  
  // Only allow safe characters for table names
  const sanitized = tableName.replace(/[^a-zA-Z0-9_]/g, '');
  
  if (sanitized !== tableName || sanitized.length === 0) {
    throw new Error(`Invalid table name: ${tableName}`);
  }
  
  return sanitized;
};

/**
 * Creates parameterized WHERE conditions for common patterns
 */
export class SafeWhereBuilder {
  private conditions: string[] = [];
  private values: any[] = [];
  private paramIndex: number = 1;
  
  constructor(startingParamIndex: number = 1) {
    this.paramIndex = startingParamIndex;
  }
  
  /**
   * Adds a safe search condition for multiple columns
   */
  addSearchCondition(
    searchTerm: string,
    columns: string[],
    options: {
      caseSensitive?: boolean;
      escapeChar?: string;
      operator?: 'AND' | 'OR';
    } = {}
  ): this {
    if (!searchTerm || !columns.length) {
      return this;
    }
    
    const { caseSensitive = false, escapeChar = '\\', operator = 'OR' } = options;
    const safePattern = createSafeSearchPattern(searchTerm, { escapeChar, caseSensitive });
    
    // Validate column names
    const safeColumns = columns.map(col => sanitizeColumnName(col));
    
    // Build condition with multiple columns
    const likeOperator = caseSensitive ? 'LIKE' : 'ILIKE';
    const columnConditions = safeColumns.map(col => 
      `${col} ${likeOperator} $${this.paramIndex++} ESCAPE '${escapeChar}'`
    );
    
    this.conditions.push(`(${columnConditions.join(` ${operator} `)})`);
    
    // Add parameter values for each column
    safeColumns.forEach(() => {
      this.values.push(safePattern.pattern);
    });
    
    return this;
  }
  
  /**
   * Adds an equality condition
   */
  addEqualCondition(column: string, value: any): this {
    const safeColumn = sanitizeColumnName(column);
    this.conditions.push(`${safeColumn} = $${this.paramIndex++}`);
    this.values.push(value);
    return this;
  }
  
  /**
   * Adds an IN condition
   */
  addInCondition(column: string, values: any[]): this {
    if (!values || values.length === 0) {
      return this;
    }
    
    const safeColumn = sanitizeColumnName(column);
    this.conditions.push(`${safeColumn} = ANY($${this.paramIndex++})`);
    this.values.push(values);
    return this;
  }
  
  /**
   * Gets the WHERE clause and values
   */
  build(): { whereClause: string; values: any[]; nextParamIndex: number } {
    return {
      whereClause: this.conditions.length > 0 ? this.conditions.join(' AND ') : '',
      values: this.values,
      nextParamIndex: this.paramIndex
    };
  }
}