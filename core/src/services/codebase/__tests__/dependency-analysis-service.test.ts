/**
 * Tests for DependencyAnalysisService
 */

import { jest } from '@jest/globals';
import { DependencyAnalysisService } from '../dependency-analysis-service.js';
import * as fs from 'fs/promises';

// Mock fs module
jest.mock('fs/promises');
const mockFs = fs as jest.Mocked<typeof fs>;

describe('DependencyAnalysisService', () => {
  let service: DependencyAnalysisService;

  beforeEach(() => {
    service = new DependencyAnalysisService();
    jest.clearAllMocks();
  });

  describe('analyzeRepository', () => {
    it('should analyze a repository with package.json', async () => {
      // Mock directory structure
      mockFs.readdir.mockResolvedValueOnce([
        { name: 'package.json', isFile: () => true, isDirectory: () => false } as any,
        { name: 'src', isFile: () => false, isDirectory: () => true } as any,
        { name: 'node_modules', isFile: () => false, isDirectory: () => true } as any
      ]);

      // Mock package.json content
      const packageJson = {
        name: 'test-project',
        dependencies: {
          'express': '^4.18.0',
          'lodash': '~4.17.0'
        },
        devDependencies: {
          'jest': '^29.0.0',
          'typescript': '^4.8.0'
        }
      };

      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(packageJson));

      const result = await service.analyzeRepository('/test/repo');

      expect(result.dependencies).toHaveLength(4);
      expect(result.dependencies[0]).toMatchObject({
        name: 'express',
        ecosystem: 'npm',
        type: 'production'
      });
      expect(result.dependencies[2]).toMatchObject({
        name: 'jest',
        ecosystem: 'npm',
        type: 'development'
      });
      expect(result.statistics.totalDependencies).toBe(4);
      expect(result.statistics.ecosystemCounts.npm).toBe(4);
    });

    it('should handle requirements.txt for Python projects', async () => {
      mockFs.readdir.mockResolvedValueOnce([
        { name: 'requirements.txt', isFile: () => true, isDirectory: () => false } as any
      ]);

      const requirementsTxt = `
django>=3.2.0
requests==2.28.1
pytest>=6.0.0
# This is a comment
-e git+https://github.com/user/repo.git#egg=mypackage
numpy~=1.21.0
      `.trim();

      mockFs.readFile.mockResolvedValueOnce(requirementsTxt);

      const result = await service.analyzeRepository('/test/python-repo');

      expect(result.dependencies).toHaveLength(4);
      expect(result.dependencies.find(d => d.name === 'django')).toMatchObject({
        name: 'django',
        ecosystem: 'pypi',
        type: 'production'
      });
      expect(result.dependencies.find(d => d.name === 'numpy')).toBeDefined();
    });

    it('should handle Cargo.toml for Rust projects', async () => {
      mockFs.readdir.mockResolvedValueOnce([
        { name: 'Cargo.toml', isFile: () => true, isDirectory: () => false } as any
      ]);

      const cargoToml = `
[package]
name = "my-rust-project"
version = "0.1.0"

[dependencies]
serde = "1.0"
tokio = { version = "1.0", features = ["full"] }

[dev-dependencies]
criterion = "0.4"
      `.trim();

      mockFs.readFile.mockResolvedValueOnce(cargoToml);

      const result = await service.analyzeRepository('/test/rust-repo');

      expect(result.dependencies).toHaveLength(3);
      expect(result.dependencies.find(d => d.name === 'serde')).toMatchObject({
        name: 'serde',
        ecosystem: 'crates',
        type: 'production'
      });
      expect(result.dependencies.find(d => d.name === 'criterion')).toMatchObject({
        name: 'criterion',
        ecosystem: 'crates',
        type: 'development'
      });
    });

    it('should handle go.mod for Go projects', async () => {
      mockFs.readdir.mockResolvedValueOnce([
        { name: 'go.mod', isFile: () => true, isDirectory: () => false } as any
      ]);

      const goMod = `
module github.com/user/myproject

go 1.19

require (
    github.com/gin-gonic/gin v1.9.1
    github.com/stretchr/testify v1.8.4
)
      `.trim();

      mockFs.readFile.mockResolvedValueOnce(goMod);

      const result = await service.analyzeRepository('/test/go-repo');

      expect(result.dependencies).toHaveLength(2);
      expect(result.dependencies.find(d => d.name === 'github.com/gin-gonic/gin')).toMatchObject({
        name: 'github.com/gin-gonic/gin',
        ecosystem: 'go',
        type: 'production'
      });
    });

    it('should handle errors gracefully', async () => {
      mockFs.readdir.mockRejectedValueOnce(new Error('Permission denied'));

      const result = await service.analyzeRepository('/inaccessible/repo');

      expect(result.dependencies).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('REPOSITORY_ANALYSIS_ERROR');
    });

    it('should skip node_modules and other ignored directories', async () => {
      mockFs.readdir
        .mockResolvedValueOnce([
          { name: 'package.json', isFile: () => true, isDirectory: () => false } as any,
          { name: 'node_modules', isFile: () => false, isDirectory: () => true } as any,
          { name: '.git', isFile: () => false, isDirectory: () => true } as any,
          { name: 'src', isFile: () => false, isDirectory: () => true } as any
        ])
        .mockResolvedValueOnce([
          { name: 'index.js', isFile: () => true, isDirectory: () => false } as any
        ]);

      const packageJson = {
        dependencies: { 'lodash': '^4.17.0' }
      };

      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(packageJson));

      const result = await service.analyzeRepository('/test/repo');

      // Should only read package.json and src directory, not node_modules or .git
      expect(mockFs.readdir).toHaveBeenCalledTimes(2);
      expect(result.dependencies).toHaveLength(1);
    });
  });

  describe('version constraint parsing', () => {
    it('should parse various version constraint formats', async () => {
      mockFs.readdir.mockResolvedValueOnce([
        { name: 'package.json', isFile: () => true, isDirectory: () => false } as any
      ]);

      const packageJson = {
        dependencies: {
          'exact': '1.2.3',
          'caret': '^1.2.3',
          'tilde': '~1.2.3',
          'latest': '*',
          'range': '>=1.0.0 <2.0.0'
        }
      };

      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(packageJson));

      const result = await service.analyzeRepository('/test/repo');

      const exact = result.dependencies.find(d => d.name === 'exact');
      expect(exact?.version_constraint.type).toBe('exact');
      expect(exact?.version_constraint.resolved_version).toBe('1.2.3');

      const caret = result.dependencies.find(d => d.name === 'caret');
      expect(caret?.version_constraint.type).toBe('caret');
      expect(caret?.version_constraint.min_version).toBe('1.2.3');

      const tilde = result.dependencies.find(d => d.name === 'tilde');
      expect(tilde?.version_constraint.type).toBe('tilde');

      const latest = result.dependencies.find(d => d.name === 'latest');
      expect(latest?.version_constraint.type).toBe('latest');

      const range = result.dependencies.find(d => d.name === 'range');
      expect(range?.version_constraint.type).toBe('range');
    });
  });
});