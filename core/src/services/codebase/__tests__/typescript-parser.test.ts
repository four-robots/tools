/**
 * TypeScript Parser Tests
 * 
 * Tests for TypeScript/JavaScript parser including AST generation,
 * symbol extraction, dependency analysis, and complexity calculations.
 */

import { TypeScriptParser } from '../parsers/typescript-parser.js';
import {
  SupportedLanguage,
  SymbolType,
  DependencyType,
  Visibility,
  SymbolScope
} from '../../../shared/types/codebase.js';

describe('TypeScriptParser', () => {
  let parser: TypeScriptParser;

  beforeEach(() => {
    parser = new TypeScriptParser();
  });

  describe('basic properties', () => {
    it('should have correct language and extensions', () => {
      expect(parser.language).toBe(SupportedLanguage.TYPESCRIPT);
      expect(parser.supportedExtensions).toContain('.ts');
      expect(parser.supportedExtensions).toContain('.tsx');
      expect(parser.supportedExtensions).toContain('.js');
      expect(parser.supportedExtensions).toContain('.jsx');
    });
  });

  describe('parse', () => {
    it('should parse simple TypeScript code', async () => {
      const code = `
        interface User {
          id: string;
          name: string;
        }

        class UserService {
          getUser(id: string): User {
            return { id, name: 'Test' };
          }
        }
      `;

      const result = await parser.parse(code);
      
      expect(result.language).toBe(SupportedLanguage.TYPESCRIPT);
      expect(result.ast).toBeDefined();
      expect(result.symbols).toBeDefined();
      expect(result.dependencies).toBeDefined();
      expect(result.complexityMetrics).toBeDefined();
      expect(result.parseTime).toBeGreaterThan(0);
    });

    it('should parse simple JavaScript code', async () => {
      const code = `
        function greet(name) {
          return 'Hello ' + name;
        }

        const message = greet('World');
        console.log(message);
      `;

      const result = await parser.parse(code);
      
      expect(result.language).toBe(SupportedLanguage.JAVASCRIPT);
      expect(result.ast).toBeDefined();
      expect(result.symbols.length).toBeGreaterThan(0);
    });

    it('should detect TypeScript vs JavaScript correctly', async () => {
      const typescriptCode = 'interface User { id: string; }';
      const javascriptCode = 'function test() { return true; }';

      const tsResult = await parser.parse(typescriptCode);
      const jsResult = await parser.parse(javascriptCode);

      expect(tsResult.language).toBe(SupportedLanguage.TYPESCRIPT);
      expect(jsResult.language).toBe(SupportedLanguage.JAVASCRIPT);
    });

    it('should handle parsing errors', async () => {
      const invalidCode = 'const invalid = {{{ broken syntax';

      await expect(parser.parse(invalidCode)).rejects.toThrow();
    });
  });

  describe('extractSymbols', () => {
    it('should extract function symbols', async () => {
      const code = `
        function regularFunction(param: string): string {
          return param;
        }

        const arrowFunction = (x: number): number => x * 2;

        async function asyncFunction(): Promise<void> {
          await Promise.resolve();
        }
      `;

      const result = await parser.parse(code);
      const functions = result.symbols.filter(s => s.symbolType === SymbolType.FUNCTION);
      
      expect(functions).toHaveLength(3);
      
      const regularFn = functions.find(f => f.name === 'regularFunction');
      expect(regularFn).toBeDefined();
      expect(regularFn?.returnType).toBe('string');
      expect(regularFn?.isAsync).toBe(false);

      const asyncFn = functions.find(f => f.name === 'asyncFunction');
      expect(asyncFn?.isAsync).toBe(true);
    });

    it('should extract class symbols with methods', async () => {
      const code = `
        class User {
          private id: string;
          public name: string;

          constructor(id: string, name: string) {
            this.id = id;
            this.name = name;
          }

          public getName(): string {
            return this.name;
          }

          private getId(): string {
            return this.id;
          }

          static create(name: string): User {
            return new User(crypto.randomUUID(), name);
          }
        }
      `;

      const result = await parser.parse(code);
      
      const classes = result.symbols.filter(s => s.symbolType === SymbolType.CLASS);
      expect(classes).toHaveLength(1);
      expect(classes[0].name).toBe('User');

      const methods = result.symbols.filter(s => s.symbolType === SymbolType.METHOD);
      expect(methods.length).toBeGreaterThan(0);

      const constructor = result.symbols.find(s => s.symbolType === SymbolType.CONSTRUCTOR);
      expect(constructor).toBeDefined();

      const staticMethod = methods.find(m => m.isStatic);
      expect(staticMethod).toBeDefined();
      expect(staticMethod?.name).toBe('create');
    });

    it('should extract interface symbols', async () => {
      const code = `
        interface ApiResponse<T> {
          data: T;
          success: boolean;
          error?: string;
        }

        interface UserRepository extends Repository<User> {
          findByEmail(email: string): Promise<User | null>;
        }
      `;

      const result = await parser.parse(code);
      
      const interfaces = result.symbols.filter(s => s.symbolType === SymbolType.INTERFACE);
      expect(interfaces).toHaveLength(2);
      
      const apiResponse = interfaces.find(i => i.name === 'ApiResponse');
      expect(apiResponse).toBeDefined();
      expect(apiResponse?.genericParameters?.length).toBeGreaterThan(0);
    });

    it('should extract variable and constant symbols', async () => {
      const code = `
        let userName = 'john';
        const API_URL = 'https://api.example.com';
        var legacyVar = 42;
      `;

      const result = await parser.parse(code);
      
      const variables = result.symbols.filter(s => s.symbolType === SymbolType.VARIABLE);
      const constants = result.symbols.filter(s => s.symbolType === SymbolType.CONSTANT);
      
      expect(variables.length).toBeGreaterThan(0);
      expect(constants.length).toBeGreaterThan(0);
      
      const constant = constants.find(c => c.name === 'API_URL');
      expect(constant).toBeDefined();
    });

    it('should extract enum and type alias symbols', async () => {
      const code = `
        enum UserRole {
          ADMIN = 'admin',
          USER = 'user',
          GUEST = 'guest'
        }

        type UserId = string;
        type UserPreferences = {
          theme: 'light' | 'dark';
          language: string;
        };
      `;

      const result = await parser.parse(code);
      
      const enums = result.symbols.filter(s => s.symbolType === SymbolType.ENUM);
      const typeAliases = result.symbols.filter(s => s.symbolType === SymbolType.TYPE_ALIAS);
      
      expect(enums).toHaveLength(1);
      expect(enums[0].name).toBe('UserRole');
      
      expect(typeAliases).toHaveLength(2);
      expect(typeAliases.map(t => t.name)).toContain('UserId');
      expect(typeAliases.map(t => t.name)).toContain('UserPreferences');
    });

    it('should track symbol visibility and exports', async () => {
      const code = `
        export interface PublicInterface {
          id: string;
        }

        interface PrivateInterface {
          data: any;
        }

        export default class DefaultExport {
          method() {}
        }

        class InternalClass {
          private _privateMethod() {}
          public publicMethod() {}
        }
      `;

      const result = await parser.parse(code);
      
      const exportedSymbols = result.symbols.filter(s => s.isExported);
      expect(exportedSymbols.length).toBeGreaterThan(0);
      
      const publicInterface = result.symbols.find(s => s.name === 'PublicInterface');
      expect(publicInterface?.isExported).toBe(true);
      
      const privateInterface = result.symbols.find(s => s.name === 'PrivateInterface');
      expect(privateInterface?.isExported).toBe(false);
    });
  });

  describe('extractDependencies', () => {
    it('should extract import dependencies', async () => {
      const code = `
        import React from 'react';
        import { Component } from 'react';
        import * as utils from './utils';
        import type { User } from './types';
        import './styles.css';
      `;

      const result = await parser.parse(code);
      
      expect(result.dependencies).toHaveLength(5);
      
      const reactImport = result.dependencies.find(d => d.dependencyPath === 'react');
      expect(reactImport).toBeDefined();
      expect(reactImport?.dependencyType).toBe(DependencyType.IMPORT);
      expect(reactImport?.isExternal).toBe(true);
      expect(reactImport?.importedSymbols).toContain('Component');
      
      const typeImport = result.dependencies.find(d => d.dependencyPath === './types');
      expect(typeImport?.isTypeOnly).toBe(true);
      expect(typeImport?.isExternal).toBe(false);
    });

    it('should extract require dependencies', async () => {
      const code = `
        const express = require('express');
        const fs = require('fs');
        const localModule = require('./local-module');
      `;

      const result = await parser.parse(code);
      
      const requires = result.dependencies.filter(d => d.dependencyType === DependencyType.REQUIRE);
      expect(requires).toHaveLength(3);
      
      const expressRequire = requires.find(d => d.dependencyPath === 'express');
      expect(expressRequire?.isExternal).toBe(true);
      
      const localRequire = requires.find(d => d.dependencyPath === './local-module');
      expect(localRequire?.isExternal).toBe(false);
    });

    it('should extract export dependencies', async () => {
      const code = `
        export { User } from './models/user';
        export * from './utils';
        export { default as Component } from 'some-library';
      `;

      const result = await parser.parse(code);
      
      const exportDeps = result.dependencies.filter(d => d.dependencyType === DependencyType.FROM);
      expect(exportDeps).toHaveLength(3);
      
      const libExport = exportDeps.find(d => d.dependencyPath === 'some-library');
      expect(libExport?.isExternal).toBe(true);
    });
  });

  describe('calculateComplexity', () => {
    it('should calculate basic complexity metrics', async () => {
      const simpleCode = `
        function simpleFunction(x: number): number {
          return x * 2;
        }
        
        class SimpleClass {
          value: number = 0;
        }
      `;

      const result = await parser.parse(simpleCode);
      const metrics = result.complexityMetrics;
      
      expect(metrics.cyclomaticComplexity).toBe(1); // No decision points
      expect(metrics.functionCount).toBe(1);
      expect(metrics.classCount).toBe(1);
      expect(metrics.linesOfCode).toBeGreaterThan(0);
      expect(metrics.maintainabilityIndex).toBeGreaterThan(0);
    });

    it('should calculate complex control flow', async () => {
      const complexCode = `
        function complexFunction(data: any[]): number {
          let result = 0;
          
          if (!data || data.length === 0) {
            return 0;
          }
          
          for (const item of data) {
            if (item.active && item.value > 0) {
              result += item.value;
            } else if (item.fallback) {
              result += item.fallback;
            }
            
            while (item.children && item.children.length > 0) {
              const child = item.children.pop();
              if (child.valid) {
                result += child.score || 0;
              }
            }
          }
          
          switch (result) {
            case 0:
              return -1;
            case 1:
              return 1;
            default:
              return result > 100 ? 100 : result;
          }
        }
      `;

      const result = await parser.parse(complexCode);
      const metrics = result.complexityMetrics;
      
      expect(metrics.cyclomaticComplexity).toBeGreaterThan(5); // Multiple decision points
      expect(metrics.cognitiveComplexity).toBeGreaterThan(0);
      expect(metrics.nestingDepth).toBeGreaterThan(1);
    });

    it('should count async and generator functions', async () => {
      const asyncCode = `
        async function fetchUser(id: string): Promise<User> {
          const response = await fetch(\`/users/\${id}\`);
          return response.json();
        }
        
        function* numberGenerator(): Generator<number> {
          let i = 0;
          while (true) {
            yield i++;
          }
        }
      `;

      const result = await parser.parse(asyncCode);
      
      const asyncFn = result.symbols.find(s => s.name === 'fetchUser');
      const generatorFn = result.symbols.find(s => s.name === 'numberGenerator');
      
      expect(asyncFn?.isAsync).toBe(true);
      expect(generatorFn?.isGenerator).toBe(true);
    });
  });

  describe('canParse', () => {
    it('should validate parseable TypeScript code', () => {
      const validTS = 'interface User { id: string; }';
      expect(parser.canParse(validTS)).toBe(true);
    });

    it('should validate parseable JavaScript code', () => {
      const validJS = 'function test() { return true; }';
      expect(parser.canParse(validJS)).toBe(true);
    });

    it('should reject invalid syntax', () => {
      const invalid = 'this is not valid code {{{';
      expect(parser.canParse(invalid)).toBe(false);
    });

    it('should handle JSX syntax when enabled', () => {
      const jsxCode = `
        const Component = () => {
          return <div>Hello World</div>;
        };
      `;
      
      expect(parser.canParse(jsxCode)).toBe(true);
    });
  });

  describe('advanced features', () => {
    it('should handle generic types and constraints', async () => {
      const genericCode = `
        interface Repository<T extends { id: string }> {
          find(id: string): Promise<T | null>;
          save(entity: T): Promise<T>;
        }
        
        class UserRepository implements Repository<User> {
          async find(id: string): Promise<User | null> {
            // implementation
          }
          
          async save(user: User): Promise<User> {
            // implementation  
          }
        }
      `;

      const result = await parser.parse(genericCode);
      
      const repository = result.symbols.find(s => s.name === 'Repository');
      expect(repository?.genericParameters?.length).toBeGreaterThan(0);
      expect(repository?.genericParameters?.[0]?.constraint).toBeTruthy();
    });

    it('should handle decorators', async () => {
      const decoratorCode = `
        @Entity('users')
        class User {
          @PrimaryGeneratedColumn()
          id: number;
          
          @Column()
          name: string;
          
          @BeforeInsert()
          generateId() {
            this.id = Math.random();
          }
        }
      `;

      const result = await parser.parse(decoratorCode);
      
      const userClass = result.symbols.find(s => s.name === 'User');
      expect(userClass?.decorators?.length).toBeGreaterThan(0);
    });

    it('should handle module declarations', async () => {
      const moduleCode = `
        declare module 'external-lib' {
          export function doSomething(): void;
        }
        
        namespace MyNamespace {
          export interface Config {
            apiUrl: string;
          }
          
          export function initialize(config: Config): void {
            // implementation
          }
        }
      `;

      const result = await parser.parse(moduleCode);
      
      const namespaceSymbol = result.symbols.find(s => s.symbolType === SymbolType.NAMESPACE);
      expect(namespaceSymbol).toBeDefined();
    });
  });
});