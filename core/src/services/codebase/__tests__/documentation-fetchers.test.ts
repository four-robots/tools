/**
 * Tests for Documentation Fetchers
 */

import { jest } from '@jest/globals';
import { 
  NPMDocumentationFetcher, 
  PyPIDocumentationFetcher, 
  DocumentationFetcherFactory 
} from '../documentation-fetchers.js';
import type { PackageDependency } from '../../../shared/types/api-documentation.js';

// Mock global fetch
global.fetch = jest.fn();
const mockFetch = fetch as jest.MockedFunction<typeof fetch>;

describe('Documentation Fetchers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('NPMDocumentationFetcher', () => {
    let fetcher: NPMDocumentationFetcher;

    beforeEach(() => {
      fetcher = new NPMDocumentationFetcher({ timeout: 5000 });
    });

    it('should fetch NPM package documentation successfully', async () => {
      const mockPackageData = {
        'dist-tags': { latest: '4.18.2' },
        versions: {
          '4.18.2': {
            name: 'express',
            version: '4.18.2',
            description: 'Fast, unopinionated, minimalist web framework',
            keywords: ['framework', 'web', 'rest', 'restful', 'router', 'app', 'api'],
            license: 'MIT',
            repository: {
              type: 'git',
              url: 'git+https://github.com/expressjs/express.git'
            },
            homepage: 'http://expressjs.com/',
            readme: 'Fast, unopinionated, minimalist web framework for node.\n\n## Installation\n\n```bash\n$ npm install express\n```\n\n## Quick Start\n\n```javascript\nconst express = require(\'express\')\nconst app = express()\n```'
          }
        },
        time: {
          created: '2010-01-03T21:21:22.681Z',
          '4.18.2': '2022-10-08T21:21:22.681Z'
        },
        maintainers: [
          { name: 'dougwilson', email: 'doug@somethingdoug.com' }
        ]
      };

      const mockDownloadsData = {
        downloads: 25000000,
        package: 'express'
      };

      const mockGitHubData = {
        stargazers_count: 60000,
        full_name: 'expressjs/express'
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockPackageData)
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockDownloadsData)
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockGitHubData)
        } as Response);

      const dependency: PackageDependency = {
        name: 'express',
        ecosystem: 'npm',
        type: 'production',
        version_constraint: {
          raw: '^4.18.0',
          type: 'caret',
          min_version: '4.18.0'
        },
        is_used: true,
        usage_confidence: 0.9,
        file_references: ['src/app.js'],
        import_statements: ['const express = require("express")'],
        source_file: 'package.json'
      };

      const result = await fetcher.fetchDocumentation(dependency);

      expect(result.success).toBe(true);
      expect(result.documentation).toBeDefined();
      expect(result.documentation?.package_name).toBe('express');
      expect(result.documentation?.package_version).toBe('4.18.2');
      expect(result.documentation?.language).toBe('javascript');
      expect(result.documentation?.health_score).toBeGreaterThan(50);
      expect(result.documentation?.metadata.popularity?.weekly_downloads).toBe(25000000);
      expect(result.documentation?.metadata.popularity?.github_stars).toBe(60000);
    });

    it('should handle NPM API failures gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const dependency: PackageDependency = {
        name: 'nonexistent-package',
        ecosystem: 'npm',
        type: 'production',
        version_constraint: { raw: '1.0.0', type: 'exact' },
        is_used: true,
        usage_confidence: 0.5,
        file_references: [],
        import_statements: [],
        source_file: 'package.json'
      };

      const result = await fetcher.fetchDocumentation(dependency);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('NPM_FETCH_ERROR');
      expect(result.error?.package_name).toBe('nonexistent-package');
    });

    it('should handle packages without versions', async () => {
      const mockPackageData = {
        'dist-tags': {},
        versions: {},
        time: {},
        maintainers: []
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockPackageData)
      } as Response);

      const dependency: PackageDependency = {
        name: 'empty-package',
        ecosystem: 'npm',
        type: 'production',
        version_constraint: { raw: '1.0.0', type: 'exact' },
        is_used: true,
        usage_confidence: 0.5,
        file_references: [],
        import_statements: [],
        source_file: 'package.json'
      };

      const result = await fetcher.fetchDocumentation(dependency);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('VERSION_NOT_FOUND');
    });
  });

  describe('PyPIDocumentationFetcher', () => {
    let fetcher: PyPIDocumentationFetcher;

    beforeEach(() => {
      fetcher = new PyPIDocumentationFetcher({ timeout: 5000 });
    });

    it('should fetch PyPI package documentation successfully', async () => {
      const mockPyPIData = {
        info: {
          name: 'requests',
          version: '2.28.1',
          summary: 'Python HTTP for Humans.',
          description: 'Requests is an elegant and simple HTTP library for Python, built for human beings.',
          keywords: 'http,web,api,requests',
          license: 'Apache 2.0',
          home_page: 'https://requests.readthedocs.io',
          project_url: 'https://github.com/psf/requests',
          maintainer: 'Kenneth Reitz',
          classifiers: [
            'Development Status :: 5 - Production/Stable',
            'Topic :: Internet :: WWW/HTTP',
            'License :: OSI Approved :: Apache Software License'
          ]
        },
        releases: {
          '2.28.1': [{
            upload_time: '2022-06-29T17:31:21.000Z'
          }]
        }
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockPyPIData)
      } as Response);

      const dependency: PackageDependency = {
        name: 'requests',
        ecosystem: 'pypi',
        type: 'production',
        version_constraint: { raw: '>=2.28.0', type: 'range' },
        is_used: true,
        usage_confidence: 0.8,
        file_references: ['src/api.py'],
        import_statements: ['import requests'],
        source_file: 'requirements.txt'
      };

      const result = await fetcher.fetchDocumentation(dependency);

      expect(result.success).toBe(true);
      expect(result.documentation).toBeDefined();
      expect(result.documentation?.package_name).toBe('requests');
      expect(result.documentation?.language).toBe('python');
      expect(result.documentation?.documentation_url).toBe('https://pypi.org/project/requests/');
      expect(result.documentation?.metadata.categories).toContain('Web Framework');
    });

    it('should handle PyPI API failures', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      } as Response);

      const dependency: PackageDependency = {
        name: 'nonexistent-python-package',
        ecosystem: 'pypi',
        type: 'production',
        version_constraint: { raw: '1.0.0', type: 'exact' },
        is_used: true,
        usage_confidence: 0.5,
        file_references: [],
        import_statements: [],
        source_file: 'requirements.txt'
      };

      const result = await fetcher.fetchDocumentation(dependency);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('PYPI_FETCH_ERROR');
    });
  });

  describe('DocumentationFetcherFactory', () => {
    it('should create correct fetcher for each ecosystem', () => {
      const npmFetcher = DocumentationFetcherFactory.createFetcher('npm');
      expect(npmFetcher).toBeInstanceOf(NPMDocumentationFetcher);

      const pypiFetcher = DocumentationFetcherFactory.createFetcher('pypi');
      expect(pypiFetcher).toBeInstanceOf(PyPIDocumentationFetcher);
    });

    it('should throw error for unsupported ecosystem', () => {
      expect(() => {
        DocumentationFetcherFactory.createFetcher('unsupported');
      }).toThrow('Unsupported ecosystem: unsupported');
    });
  });

  describe('Rate Limiting', () => {
    it('should respect rate limits', async () => {
      const fetcher = new NPMDocumentationFetcher({
        rateLimit: { requestsPerSecond: 2, burstLimit: 2 }
      });

      // Mock successful responses
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ 'dist-tags': { latest: '1.0.0' }, versions: {} })
      } as Response);

      const dependency: PackageDependency = {
        name: 'test-package',
        ecosystem: 'npm',
        type: 'production',
        version_constraint: { raw: '1.0.0', type: 'exact' },
        is_used: true,
        usage_confidence: 0.5,
        file_references: [],
        import_statements: [],
        source_file: 'package.json'
      };

      const startTime = Date.now();
      
      // Make 3 rapid requests
      const promises = [
        fetcher.fetchDocumentation(dependency),
        fetcher.fetchDocumentation(dependency),
        fetcher.fetchDocumentation(dependency)
      ];

      await Promise.all(promises);
      
      const elapsedTime = Date.now() - startTime;
      
      // Should take at least 500ms for 3 requests with 2 req/sec limit
      expect(elapsedTime).toBeGreaterThan(400);
    }, 15000); // Increase timeout to 15 seconds
  });
});