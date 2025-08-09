/**
 * Code Smell Detector Tests
 */

import { CodeSmellDetector } from '../code-smell-detector.js';
import { SupportedLanguage, CodeSmellType, Severity } from '../../../../shared/types/codebase.js';

describe('CodeSmellDetector', () => {
  let detector: CodeSmellDetector;

  beforeEach(() => {
    detector = new CodeSmellDetector(SupportedLanguage.TYPESCRIPT);
  });

  describe('detectAllSmells', () => {
    it('should detect multiple types of code smells', async () => {
      const ast = {
        type: 'Program',
        body: [
          {
            type: 'FunctionDeclaration',
            id: { name: 'longFunction' },
            params: [
              { name: 'param1' },
              { name: 'param2' },
              { name: 'param3' },
              { name: 'param4' },
              { name: 'param5' },
              { name: 'param6' } // This should trigger long parameter list
            ],
            body: {
              type: 'BlockStatement',
              body: Array(30).fill({ // This should trigger long method
                type: 'ExpressionStatement',
                expression: { type: 'CallExpression' }
              })
            },
            loc: {
              start: { line: 1, column: 0 },
              end: { line: 32, column: 0 }
            }
          }
        ]
      };

      const content = `function longFunction(param1, param2, param3, param4, param5, param6) {
        // 30+ lines of code
        ${Array(28).fill('  console.log("line");').join('\n')}
      }`;

      const smells = await detector.detectAllSmells(
        ast,
        content,
        'file1',
        'repo1'
      );

      expect(smells.length).toBeGreaterThan(0);
      
      // Should detect long method
      const longMethodSmell = smells.find(s => s.smellType === CodeSmellType.LONG_METHOD);
      expect(longMethodSmell).toBeDefined();
      
      // Should detect long parameter list
      const longParamSmell = smells.find(s => s.smellType === CodeSmellType.LONG_PARAMETER_LIST);
      expect(longParamSmell).toBeDefined();
    });

    it('should handle empty AST', async () => {
      const ast = { type: 'Program', body: [] };
      const content = '';

      const smells = await detector.detectAllSmells(
        ast,
        content,
        'file1',
        'repo1'
      );

      expect(smells).toEqual([]);
    });

    it('should handle errors gracefully', async () => {
      const invalidAst = null as any;
      const content = 'some content';

      const smells = await detector.detectAllSmells(
        invalidAst,
        content,
        'file1',
        'repo1'
      );

      expect(smells).toEqual([]);
    });
  });

  describe('detectLongMethods', () => {
    it('should detect long methods', async () => {
      const ast = {
        type: 'Program',
        body: [
          {
            type: 'FunctionDeclaration',
            id: { name: 'veryLongFunction' },
            body: {
              type: 'BlockStatement'
            },
            loc: {
              start: { line: 1, column: 0 },
              end: { line: 30, column: 0 } // 30 lines - should exceed threshold
            }
          }
        ]
      };

      const content = Array(30).fill('console.log("line");').join('\n');

      const smells = await detector.detectLongMethods(ast, content);

      expect(smells.length).toBe(1);
      expect(smells[0].smellType).toBe(CodeSmellType.LONG_METHOD);
      expect(smells[0].title).toContain('veryLongFunction');
      expect(smells[0].severity).toBeDefined();
    });

    it('should not detect short methods', async () => {
      const ast = {
        type: 'Program',
        body: [
          {
            type: 'FunctionDeclaration',
            id: { name: 'shortFunction' },
            body: {
              type: 'BlockStatement'
            },
            loc: {
              start: { line: 1, column: 0 },
              end: { line: 5, column: 0 } // Only 5 lines
            }
          }
        ]
      };

      const content = 'function shortFunction() {\n  return true;\n}';

      const smells = await detector.detectLongMethods(ast, content);

      expect(smells.length).toBe(0);
    });
  });

  describe('detectLargeClasses', () => {
    it('should detect large classes', async () => {
      const ast = {
        type: 'Program',
        body: [
          {
            type: 'ClassDeclaration',
            id: { name: 'HugeClass' },
            body: {
              type: 'ClassBody',
              body: Array(25).fill({
                type: 'MethodDefinition',
                key: { name: 'method' },
                value: { type: 'FunctionExpression' }
              })
            },
            loc: {
              start: { line: 1, column: 0 },
              end: { line: 350, column: 0 } // Very large class
            }
          }
        ]
      };

      const smells = await detector.detectLargeClasses(ast);

      expect(smells.length).toBe(1);
      expect(smells[0].smellType).toBe(CodeSmellType.LARGE_CLASS);
      expect(smells[0].title).toContain('HugeClass');
    });
  });

  describe('detectLongParameterLists', () => {
    it('should detect functions with too many parameters', async () => {
      const ast = {
        type: 'Program',
        body: [
          {
            type: 'FunctionDeclaration',
            id: { name: 'manyParamsFunction' },
            params: [
              { name: 'p1' },
              { name: 'p2' },
              { name: 'p3' },
              { name: 'p4' },
              { name: 'p5' },
              { name: 'p6' },
              { name: 'p7' } // 7 parameters - should exceed threshold
            ],
            loc: {
              start: { line: 1, column: 0 },
              end: { line: 3, column: 0 }
            }
          }
        ]
      };

      const smells = await detector.detectLongParameterLists(ast);

      expect(smells.length).toBe(1);
      expect(smells[0].smellType).toBe(CodeSmellType.LONG_PARAMETER_LIST);
      expect(smells[0].title).toContain('manyParamsFunction');
    });
  });

  describe('detectComplexConditions', () => {
    it('should detect complex conditional expressions', async () => {
      const ast = {
        type: 'Program',
        body: [
          {
            type: 'IfStatement',
            test: {
              type: 'LogicalExpression',
              operator: '&&',
              left: {
                type: 'LogicalExpression',
                operator: '||',
                left: {
                  type: 'BinaryExpression',
                  operator: '===',
                  left: { type: 'Identifier' },
                  right: { type: 'Literal' }
                },
                right: {
                  type: 'BinaryExpression',
                  operator: '>',
                  left: { type: 'Identifier' },
                  right: { type: 'Literal' }
                }
              },
              right: {
                type: 'LogicalExpression',
                operator: '&&',
                left: {
                  type: 'BinaryExpression',
                  operator: '<',
                  left: { type: 'Identifier' },
                  right: { type: 'Literal' }
                },
                right: {
                  type: 'CallExpression'
                }
              }
            },
            loc: {
              start: { line: 1, column: 0 },
              end: { line: 1, column: 50 }
            }
          }
        ]
      };

      const smells = await detector.detectComplexConditions(ast);

      expect(smells.length).toBe(1);
      expect(smells[0].smellType).toBe(CodeSmellType.COMPLEX_CONDITION);
    });
  });

  describe('detectMagicNumbers', () => {
    it('should detect magic numbers', async () => {
      const ast = {
        type: 'Program',
        body: [
          {
            type: 'VariableDeclaration',
            declarations: [
              {
                type: 'VariableDeclarator',
                init: {
                  type: 'Literal',
                  value: 42,
                  raw: '42'
                }
              }
            ],
            loc: { start: { line: 1 } }
          },
          {
            type: 'VariableDeclaration',
            declarations: [
              {
                type: 'VariableDeclarator',
                init: {
                  type: 'Literal',
                  value: 42,
                  raw: '42'
                }
              }
            ],
            loc: { start: { line: 2 } }
          },
          {
            type: 'VariableDeclaration',
            declarations: [
              {
                type: 'VariableDeclarator',
                init: {
                  type: 'Literal',
                  value: 42,
                  raw: '42'
                }
              }
            ],
            loc: { start: { line: 3 } }
          }
        ]
      };

      const content = 'const a = 42;\nconst b = 42;\nconst c = 42;';

      const smells = await detector.detectMagicNumbers(ast, content);

      expect(smells.length).toBe(1);
      expect(smells[0].smellType).toBe(CodeSmellType.MAGIC_NUMBER);
      expect(smells[0].title).toContain('42');
    });

    it('should not flag acceptable numbers', async () => {
      const ast = {
        type: 'Program',
        body: [
          {
            type: 'VariableDeclaration',
            declarations: [
              {
                type: 'VariableDeclarator',
                init: {
                  type: 'Literal',
                  value: 0,
                  raw: '0'
                }
              }
            ],
            loc: { start: { line: 1 } }
          },
          {
            type: 'VariableDeclaration',
            declarations: [
              {
                type: 'VariableDeclarator',
                init: {
                  type: 'Literal',
                  value: 1,
                  raw: '1'
                }
              }
            ],
            loc: { start: { line: 2 } }
          }
        ]
      };

      const content = 'const a = 0;\nconst b = 1;';

      const smells = await detector.detectMagicNumbers(ast, content);

      expect(smells.length).toBe(0);
    });
  });

  describe('detectDuplicateCode', () => {
    it('should detect highly similar code blocks', async () => {
      const contents = [
        'function processA() { console.log("processing"); return true; }',
        'function processB() { console.log("processing"); return true; }' // Very similar
      ];

      const smells = await detector.detectDuplicateCode(contents);

      expect(smells.length).toBe(1);
      expect(smells[0].smellType).toBe(CodeSmellType.DUPLICATE_CODE);
    });

    it('should not detect different code as duplicate', async () => {
      const contents = [
        'function add(a, b) { return a + b; }',
        'function multiply(x, y) { return x * y; }'
      ];

      const smells = await detector.detectDuplicateCode(contents);

      expect(smells.length).toBe(0);
    });

    it('should handle single content array', async () => {
      const contents = ['function test() { return true; }'];

      const smells = await detector.detectDuplicateCode(contents);

      expect(smells.length).toBe(0);
    });
  });

  describe('detectDeadCode', () => {
    it('should detect unused functions', async () => {
      const ast = {
        type: 'Program',
        body: [
          {
            type: 'FunctionDeclaration',
            id: { name: 'unusedFunction' },
            loc: { start: { line: 1 } }
          }
        ]
      };

      const usage = {
        isUsed: false,
        usageCount: 0,
        calledBy: [],
        referencedIn: []
      };

      const smells = await detector.detectDeadCode(ast, usage);

      expect(smells.length).toBe(1);
      expect(smells[0].smellType).toBe(CodeSmellType.DEAD_CODE);
      expect(smells[0].title).toContain('unusedFunction');
    });

    it('should not detect used functions as dead code', async () => {
      const ast = {
        type: 'Program',
        body: [
          {
            type: 'FunctionDeclaration',
            id: { name: 'usedFunction' },
            loc: { start: { line: 1 } }
          }
        ]
      };

      const usage = {
        isUsed: true,
        usageCount: 5,
        calledBy: ['otherFunction'],
        referencedIn: ['file1.ts']
      };

      const smells = await detector.detectDeadCode(ast, usage);

      expect(smells.length).toBe(0);
    });

    it('should handle missing usage info', async () => {
      const ast = {
        type: 'Program',
        body: [
          {
            type: 'FunctionDeclaration',
            id: { name: 'someFunction' },
            loc: { start: { line: 1 } }
          }
        ]
      };

      const smells = await detector.detectDeadCode(ast, undefined);

      expect(smells.length).toBe(0);
    });
  });

  describe('detectGodClasses', () => {
    it('should detect god classes with many methods and fields', async () => {
      const ast = {
        type: 'Program',
        body: [
          {
            type: 'ClassDeclaration',
            id: { name: 'GodClass' },
            body: {
              type: 'ClassBody',
              body: [
                // Many methods
                ...Array(25).fill(null).map((_, i) => ({
                  type: 'MethodDefinition',
                  key: { name: `method${i}` },
                  value: { type: 'FunctionExpression' }
                })),
                // Many fields
                ...Array(20).fill(null).map((_, i) => ({
                  type: 'PropertyDefinition',
                  key: { name: `field${i}` }
                }))
              ]
            },
            loc: {
              start: { line: 1, column: 0 },
              end: { line: 500, column: 0 } // Very large class
            }
          }
        ]
      };

      const dependencies = {
        imports: Array(15).fill('someImport'), // Many imports
        exports: [],
        internalDependencies: [],
        externalDependencies: []
      };

      const smells = await detector.detectGodClasses(ast, dependencies);

      expect(smells.length).toBe(1);
      expect(smells[0].smellType).toBe(CodeSmellType.GOD_CLASS);
      expect(smells[0].title).toContain('GodClass');
    });
  });

  describe('detectDataClasses', () => {
    it('should detect classes with mostly getters and setters', async () => {
      const ast = {
        type: 'Program',
        body: [
          {
            type: 'ClassDeclaration',
            id: { name: 'DataClass' },
            body: {
              type: 'ClassBody',
              body: [
                {
                  type: 'MethodDefinition',
                  kind: 'get',
                  key: { name: 'getName' },
                  value: { type: 'FunctionExpression' }
                },
                {
                  type: 'MethodDefinition',
                  kind: 'set',
                  key: { name: 'setName' },
                  value: { type: 'FunctionExpression' }
                },
                {
                  type: 'MethodDefinition',
                  kind: 'get',
                  key: { name: 'getAge' },
                  value: { type: 'FunctionExpression' }
                },
                {
                  type: 'MethodDefinition',
                  kind: 'set',
                  key: { name: 'setAge' },
                  value: { type: 'FunctionExpression' }
                }
              ]
            },
            loc: { start: { line: 1 } }
          }
        ]
      };

      const smells = await detector.detectDataClasses(ast);

      expect(smells.length).toBe(1);
      expect(smells[0].smellType).toBe(CodeSmellType.DATA_CLASS);
    });
  });

  describe('detectComments', () => {
    it('should detect obvious comments', async () => {
      const ast = { type: 'Program', body: [] };
      const content = `// Increment counter
      counter++;
      
      // Check if user exists
      if (user) {`;

      const smells = await detector.detectComments(ast, content);

      expect(smells.length).toBeGreaterThan(0);
      const commentSmell = smells.find(s => s.smellType === CodeSmellType.COMMENTS);
      expect(commentSmell).toBeDefined();
      expect(commentSmell?.severity).toBe(Severity.INFO);
    });
  });

  describe('Language-specific detection', () => {
    it('should detect JavaScript specific smells', async () => {
      const jsDetector = new CodeSmellDetector(SupportedLanguage.JAVASCRIPT);
      const ast = { type: 'Program', body: [] };
      const content = 'console.log("debug"); console.log("test");';

      const smells = await jsDetector.detectAllSmells(ast, content, 'file1', 'repo1');

      // Should detect console.log usage
      const consoleSmell = smells.find(s => s.title.includes('Console Logging'));
      expect(consoleSmell).toBeDefined();
    });

    it('should detect Python specific smells', async () => {
      const pythonDetector = new CodeSmellDetector(SupportedLanguage.PYTHON);
      const ast = {
        type: 'Program',
        body: [
          {
            type: 'FunctionDeclaration',
            id: { name: 'test_function' },
            loc: { start: { line: 1 } }
          }
        ]
      };
      const content = 'def test_function():\n    pass';

      const smells = await pythonDetector.detectAllSmells(ast, content, 'file1', 'repo1');

      // Should detect missing docstring
      const docstringSmell = smells.find(s => s.title.includes('Missing Docstring'));
      expect(docstringSmell).toBeDefined();
    });
  });

  describe('Smell severity and effort calculation', () => {
    it('should assign appropriate severity based on smell size', async () => {
      const ast = {
        type: 'Program',
        body: [
          {
            type: 'FunctionDeclaration',
            id: { name: 'hugeFunction' },
            body: { type: 'BlockStatement' },
            loc: {
              start: { line: 1, column: 0 },
              end: { line: 100, column: 0 } // Very large function
            }
          }
        ]
      };

      const content = Array(100).fill('console.log("line");').join('\n');

      const smells = await detector.detectLongMethods(ast, content);

      expect(smells.length).toBe(1);
      expect(smells[0].severity).toBe(Severity.CRITICAL); // Should be critical for very long method
      expect(smells[0].effortMinutes).toBeGreaterThan(30); // Should require significant effort
    });

    it('should calculate effort based on complexity', async () => {
      const smallAst = {
        type: 'Program',
        body: [
          {
            type: 'FunctionDeclaration',
            id: { name: 'smallFunction' },
            body: { type: 'BlockStatement' },
            loc: {
              start: { line: 1, column: 0 },
              end: { line: 30, column: 0 } // Moderately long
            }
          }
        ]
      };

      const largeAst = {
        type: 'Program',
        body: [
          {
            type: 'FunctionDeclaration',
            id: { name: 'largeFunction' },
            body: { type: 'BlockStatement' },
            loc: {
              start: { line: 1, column: 0 },
              end: { line: 80, column: 0 } // Very long
            }
          }
        ]
      };

      const smallContent = Array(30).fill('console.log("line");').join('\n');
      const largeContent = Array(80).fill('console.log("line");').join('\n');

      const smallSmells = await detector.detectLongMethods(smallAst, smallContent);
      const largeSmells = await detector.detectLongMethods(largeAst, largeContent);

      expect(largeSmells[0].effortMinutes).toBeGreaterThan(smallSmells[0].effortMinutes);
    });
  });
});