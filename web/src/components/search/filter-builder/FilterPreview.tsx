'use client';

import React, { useState, useEffect } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { FilterTree, QueryValidation, SearchQuery } from '@mcp-tools/core';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui/tabs';
import { Badge } from '../../ui/badge';
import { Button } from '../../ui/button';
import { 
  Eye, 
  Database, 
  AlertTriangle, 
  CheckCircle, 
  Info,
  Copy,
  Gauge,
  Clock,
  Layers
} from 'lucide-react';

interface FilterPreviewProps {
  filterTree: FilterTree;
  validation?: QueryValidation;
  generatedQuery?: SearchQuery;
  onQueryGenerate?: (format: 'sql' | 'elasticsearch' | 'mongodb') => void;
  onQueryCopy?: (query: string) => void;
  onQueryExport?: (query: SearchQuery) => void;
}

export const FilterPreview: React.FC<FilterPreviewProps> = ({
  filterTree,
  validation,
  generatedQuery,
  onQueryGenerate,
  onQueryCopy,
  onQueryExport
}) => {
  const [selectedFormat, setSelectedFormat] = useState<'sql' | 'elasticsearch' | 'mongodb'>('sql');
  const [queryCache, setQueryCache] = useState<Record<string, SearchQuery>>({});

  // Generate human-readable filter description
  const generateDescription = (tree: FilterTree): string => {
    if (tree.type === 'condition' && tree.condition) {
      const { field, operator, value } = tree.condition;
      const valueStr = Array.isArray(value) ? value.join(', ') : String(value);
      return `${field} ${operator.replace(/_/g, ' ')} ${valueStr}`;
    } else if (tree.type === 'group' && tree.children) {
      if (tree.children.length === 0) {
        return 'Empty group';
      }
      
      const childDescriptions = tree.children.map(generateDescription);
      const operator = tree.operator || 'AND';
      
      if (tree.children.length === 1) {
        return operator === 'NOT' ? `NOT (${childDescriptions[0]})` : childDescriptions[0];
      }
      
      const joined = childDescriptions.join(` ${operator} `);
      return `(${joined})`;
    }
    
    return 'Invalid filter';
  };

  // Generate parentheses string for technical preview
  const generateParenthesesString = (tree: FilterTree): string => {
    if (tree.type === 'condition' && tree.condition) {
      const { field, operator, value } = tree.condition;
      const valueStr = Array.isArray(value) ? `[${value.join(', ')}]` : JSON.stringify(value);
      return `${field} ${operator} ${valueStr}`;
    } else if (tree.type === 'group' && tree.children) {
      if (tree.children.length === 0) {
        return '()';
      }
      
      const childStrings = tree.children.map(generateParenthesesString);
      const operator = tree.operator || 'AND';
      
      if (tree.children.length === 1) {
        return operator === 'NOT' ? `NOT (${childStrings[0]})` : childStrings[0];
      }
      
      return `(${childStrings.join(` ${operator} `)})`;
    }
    
    return '';
  };

  // Calculate filter statistics
  const getFilterStats = () => {
    let conditions = 0;
    let groups = 0;
    let depth = 0;
    
    const traverse = (node: FilterTree, currentDepth = 0): void => {
      depth = Math.max(depth, currentDepth);
      
      if (node.type === 'condition') {
        conditions++;
      } else if (node.type === 'group') {
        groups++;
        node.children?.forEach(child => traverse(child, currentDepth + 1));
      }
    };
    
    traverse(filterTree);
    
    return { conditions, groups, depth };
  };

  // Get complexity color
  const getComplexityColor = (complexity: number) => {
    if (complexity <= 3) return 'text-green-600';
    if (complexity <= 6) return 'text-yellow-600';
    return 'text-red-600';
  };

  // Get performance color
  const getPerformanceColor = (ms: number) => {
    if (ms <= 50) return 'text-green-600';
    if (ms <= 200) return 'text-yellow-600';
    return 'text-red-600';
  };

  const stats = getFilterStats();
  const description = generateDescription(filterTree);
  const parenthesesString = generateParenthesesString(filterTree);

  // Mock SQL generation for preview
  const mockGenerateSQL = (): string => {
    const buildWhere = (tree: FilterTree): string => {
      if (tree.type === 'condition' && tree.condition) {
        const { field, operator, value } = tree.condition;
        
        switch (operator) {
          case 'equals':
            return `${field} = '${value}'`;
          case 'contains':
            return `${field} LIKE '%${value}%'`;
          case 'greater_than':
            return `${field} > ${value}`;
          case 'in':
            const values = Array.isArray(value) ? value.map(v => `'${v}'`).join(', ') : `'${value}'`;
            return `${field} IN (${values})`;
          case 'is_null':
            return `${field} IS NULL`;
          default:
            return `${field} = '${value}'`;
        }
      } else if (tree.type === 'group' && tree.children) {
        if (tree.children.length === 0) return '1=1';
        
        const conditions = tree.children.map(buildWhere);
        const operator = tree.operator === 'NOT' ? 'NOT' : tree.operator;
        
        if (operator === 'NOT') {
          return `NOT (${conditions.join(' AND ')})`;
        }
        
        return `(${conditions.join(` ${operator} `)})`;
      }
      
      return '1=1';
    };

    const whereClause = buildWhere(filterTree);
    return `SELECT *\nFROM search_results\nWHERE ${whereClause}`;
  };

  // Mock Elasticsearch query generation
  const mockGenerateElasticsearch = (): object => {
    const buildQuery = (tree: FilterTree): any => {
      if (tree.type === 'condition' && tree.condition) {
        const { field, operator, value } = tree.condition;
        
        switch (operator) {
          case 'equals':
            return { term: { [field]: value } };
          case 'contains':
            return { wildcard: { [field]: `*${value}*` } };
          case 'greater_than':
            return { range: { [field]: { gt: value } } };
          case 'in':
            return { terms: { [field]: Array.isArray(value) ? value : [value] } };
          default:
            return { match: { [field]: value } };
        }
      } else if (tree.type === 'group' && tree.children) {
        const childQueries = tree.children.map(buildQuery);
        
        switch (tree.operator) {
          case 'AND':
            return { bool: { must: childQueries } };
          case 'OR':
            return { bool: { should: childQueries } };
          case 'NOT':
            return { bool: { must_not: childQueries } };
          default:
            return { bool: { must: childQueries } };
        }
      }
      
      return { match_all: {} };
    };

    return {
      query: buildQuery(filterTree),
      size: 100
    };
  };

  return (
    <Card className="filter-preview">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Eye size={18} />
          Filter Preview
          {validation && (
            <Badge variant={validation.isValid ? 'default' : 'destructive'}>
              {validation.isValid ? (
                <CheckCircle size={12} className="mr-1" />
              ) : (
                <AlertTriangle size={12} className="mr-1" />
              )}
              {validation.isValid ? 'Valid' : 'Invalid'}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent>
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="query">Query</TabsTrigger>
            <TabsTrigger value="validation">Validation</TabsTrigger>
            <TabsTrigger value="performance">Performance</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-4">
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">Description</h3>
              <p className="text-sm bg-gray-50 p-3 rounded-lg border">
                {description}
              </p>
            </div>

            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">Technical Structure</h3>
              <div className="rounded-lg overflow-hidden">
                <SyntaxHighlighter
                  language="text"
                  style={oneDark}
                  customStyle={{
                    margin: 0,
                    padding: '12px',
                    fontSize: '12px',
                    lineHeight: '1.4'
                  }}
                >
                  {parenthesesString}
                </SyntaxHighlighter>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-3 bg-blue-50 rounded-lg">
                <div className="text-2xl font-bold text-blue-600">{stats.conditions}</div>
                <div className="text-xs text-gray-600">Conditions</div>
              </div>
              <div className="text-center p-3 bg-green-50 rounded-lg">
                <div className="text-2xl font-bold text-green-600">{stats.groups}</div>
                <div className="text-xs text-gray-600">Groups</div>
              </div>
              <div className="text-center p-3 bg-purple-50 rounded-lg">
                <div className="text-2xl font-bold text-purple-600">{stats.depth}</div>
                <div className="text-xs text-gray-600">Max Depth</div>
              </div>
            </div>
          </TabsContent>

          {/* Query Tab */}
          <TabsContent value="query" className="space-y-4">
            <div className="flex items-center gap-2 mb-4">
              <select
                value={selectedFormat}
                onChange={(e) => setSelectedFormat(e.target.value as any)}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="sql">SQL</option>
                <option value="elasticsearch">Elasticsearch</option>
                <option value="mongodb">MongoDB</option>
              </select>
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const query = selectedFormat === 'sql' 
                    ? mockGenerateSQL()
                    : JSON.stringify(mockGenerateElasticsearch(), null, 2);
                  onQueryCopy?.(query);
                }}
              >
                <Copy size={14} className="mr-1" />
                Copy
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  // Generate and export query
                  onQueryGenerate?.(selectedFormat);
                }}
              >
                <Download size={14} className="mr-1" />
                Export
              </Button>
            </div>

            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                <Database size={16} />
                {selectedFormat.toUpperCase()} Query
              </h3>
              
              <div className="relative rounded-lg overflow-hidden">
                <SyntaxHighlighter
                  language={selectedFormat === 'sql' ? 'sql' : 'json'}
                  style={oneDark}
                  customStyle={{
                    margin: 0,
                    padding: '16px',
                    fontSize: '12px',
                    lineHeight: '1.4'
                  }}
                  showLineNumbers={true}
                >
                  {selectedFormat === 'sql' 
                    ? mockGenerateSQL()
                    : JSON.stringify(mockGenerateElasticsearch(), null, 2)
                  }
                </SyntaxHighlighter>
              </div>
            </div>

            {generatedQuery?.metadata && (
              <div className="bg-blue-50 p-3 rounded-lg">
                <h4 className="text-sm font-medium text-blue-800 mb-2">Query Metadata</h4>
                <div className="text-xs text-blue-700 space-y-1">
                  <div>Complexity: {generatedQuery.metadata.complexity}/10</div>
                  {generatedQuery.metadata.indexHints.length > 0 && (
                    <div>Suggested indexes: {generatedQuery.metadata.indexHints.join(', ')}</div>
                  )}
                </div>
              </div>
            )}
          </TabsContent>

          {/* Validation Tab */}
          <TabsContent value="validation" className="space-y-4">
            {validation ? (
              <>
                {/* Errors */}
                {validation.errors.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-red-700 mb-2 flex items-center gap-2">
                      <AlertTriangle size={16} />
                      Issues Found ({validation.errors.length})
                    </h3>
                    <div className="space-y-2">
                      {validation.errors.map((error, index) => (
                        <div
                          key={index}
                          className={`p-3 rounded-lg border-l-4 ${
                            error.severity === 'error'
                              ? 'bg-red-50 border-red-400 text-red-800'
                              : error.severity === 'warning'
                              ? 'bg-yellow-50 border-yellow-400 text-yellow-800'
                              : 'bg-blue-50 border-blue-400 text-blue-800'
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            <Badge variant="outline" className="text-xs">
                              {error.severity.toUpperCase()}
                            </Badge>
                            <div className="flex-1">
                              <p className="text-sm font-medium">{error.message}</p>
                              <p className="text-xs opacity-75">Path: {error.path}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Suggestions */}
                {validation.suggestions.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-blue-700 mb-2 flex items-center gap-2">
                      <Info size={16} />
                      Suggestions ({validation.suggestions.length})
                    </h3>
                    <div className="space-y-2">
                      {validation.suggestions.map((suggestion, index) => (
                        <div key={index} className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                          <div className="flex items-start gap-2">
                            <Badge variant="outline" className="text-xs bg-blue-100 text-blue-800">
                              {suggestion.type.toUpperCase()}
                            </Badge>
                            <p className="text-sm text-blue-800">{suggestion.message}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* All valid */}
                {validation.isValid && validation.errors.length === 0 && (
                  <div className="text-center py-8">
                    <CheckCircle size={48} className="mx-auto text-green-600 mb-4" />
                    <h3 className="text-lg font-medium text-green-800">Filter is Valid!</h3>
                    <p className="text-sm text-green-600">No issues found with your filter configuration.</p>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <Gauge size={48} className="mx-auto mb-4 opacity-50" />
                <p className="text-sm">Validation results will appear here</p>
              </div>
            )}
          </TabsContent>

          {/* Performance Tab */}
          <TabsContent value="performance" className="space-y-4">
            {validation?.estimatedPerformance ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-white border rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Layers size={16} className="text-gray-500" />
                      <span className="text-sm font-medium text-gray-700">Complexity</span>
                    </div>
                    <div className={`text-2xl font-bold ${getComplexityColor(validation.estimatedPerformance.complexity)}`}>
                      {validation.estimatedPerformance.complexity}/10
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                      <div
                        className={`h-2 rounded-full ${
                          validation.estimatedPerformance.complexity <= 3
                            ? 'bg-green-500'
                            : validation.estimatedPerformance.complexity <= 6
                            ? 'bg-yellow-500'
                            : 'bg-red-500'
                        }`}
                        style={{ width: `${(validation.estimatedPerformance.complexity / 10) * 100}%` }}
                      />
                    </div>
                  </div>

                  <div className="p-4 bg-white border rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Clock size={16} className="text-gray-500" />
                      <span className="text-sm font-medium text-gray-700">Est. Execution Time</span>
                    </div>
                    <div className={`text-2xl font-bold ${getPerformanceColor(validation.estimatedPerformance.estimatedExecutionTimeMs)}`}>
                      {validation.estimatedPerformance.estimatedExecutionTimeMs}ms
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {validation.estimatedPerformance.estimatedExecutionTimeMs <= 50
                        ? 'Excellent'
                        : validation.estimatedPerformance.estimatedExecutionTimeMs <= 200
                        ? 'Good'
                        : 'Needs optimization'
                      }
                    </div>
                  </div>
                </div>

                {validation.estimatedPerformance.indexUsage.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 mb-2">Recommended Indexes</h3>
                    <div className="space-y-1">
                      {validation.estimatedPerformance.indexUsage.map((index, i) => (
                        <div key={i} className="text-xs bg-gray-100 px-2 py-1 rounded font-mono">
                          {index}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <Clock size={48} className="mx-auto mb-4 opacity-50" />
                <p className="text-sm">Performance metrics will appear here</p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default FilterPreview;