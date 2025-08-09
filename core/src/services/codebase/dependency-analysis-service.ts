/**
 * Dependency Analysis Service
 * 
 * Analyzes project dependencies from various package manifest files
 * across different programming language ecosystems.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { validateInput } from '../../utils/validation.js';
import type {
  PackageDependency,
  DependencyType,
  PackageEcosystem,
  VersionConstraint,
  APIDiscoveryError
} from '../../shared/types/api-documentation.js';

export interface DependencyAnalysisResult {
  dependencies: PackageDependency[];
  manifestFiles: string[];
  errors: APIDiscoveryError[];
  statistics: {
    totalDependencies: number;
    ecosystemCounts: Record<PackageEcosystem, number>;
    dependencyTypeCounts: Record<DependencyType, number>;
  };
}

/**
 * Manifest file patterns for different ecosystems
 */
const MANIFEST_PATTERNS = {
  npm: ['package.json', 'package-lock.json', 'yarn.lock'],
  python: ['requirements.txt', 'Pipfile', 'pyproject.toml', 'setup.py', 'setup.cfg'],
  rust: ['Cargo.toml', 'Cargo.lock'],
  go: ['go.mod', 'go.sum'],
  java: ['pom.xml', 'build.gradle', 'build.gradle.kts'],
  dotnet: ['*.csproj', '*.fsproj', '*.vbproj', 'packages.config'],
  php: ['composer.json', 'composer.lock'],
  ruby: ['Gemfile', 'Gemfile.lock', '*.gemspec'],
  haskell: ['*.cabal', 'stack.yaml', 'package.yaml']
} as const;

export class DependencyAnalysisService {
  constructor() {}

  /**
   * Analyze dependencies in a repository directory
   */
  async analyzeRepository(repositoryPath: string): Promise<DependencyAnalysisResult> {
    const result: DependencyAnalysisResult = {
      dependencies: [],
      manifestFiles: [],
      errors: [],
      statistics: {
        totalDependencies: 0,
        ecosystemCounts: {} as Record<PackageEcosystem, number>,
        dependencyTypeCounts: {} as Record<DependencyType, number>
      }
    };

    try {
      // Find all manifest files in the repository
      const manifestFiles = await this.findManifestFiles(repositoryPath);
      result.manifestFiles = manifestFiles;

      // Parse each manifest file
      for (const manifestFile of manifestFiles) {
        try {
          const dependencies = await this.parseManifestFile(manifestFile, repositoryPath);
          result.dependencies.push(...dependencies);
        } catch (error) {
          result.errors.push({
            code: 'MANIFEST_PARSE_ERROR',
            message: `Failed to parse ${manifestFile}: ${error instanceof Error ? error.message : 'Unknown error'}`,
            details: { file: manifestFile },
            timestamp: new Date().toISOString()
          });
        }
      }

      // Calculate statistics
      result.statistics = this.calculateStatistics(result.dependencies);

      return result;
    } catch (error) {
      result.errors.push({
        code: 'REPOSITORY_ANALYSIS_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
      
      // Calculate statistics even if there are errors
      result.statistics = this.calculateStatistics(result.dependencies);
      
      return result;
    }
  }

  /**
   * Find all manifest files in a repository
   */
  private async findManifestFiles(repositoryPath: string): Promise<string[]> {
    const manifestFiles: string[] = [];
    
    try {
      await this.searchManifestFiles(repositoryPath, manifestFiles);
      return manifestFiles.sort();
    } catch (error) {
      console.error('Error finding manifest files:', error);
      // Re-throw the error so it can be handled by the caller
      throw error;
    }
  }

  /**
   * Recursively search for manifest files
   */
  private async searchManifestFiles(dir: string, manifestFiles: string[], depth: number = 0): Promise<void> {
    // Limit search depth to avoid infinite recursion
    if (depth > 10) return;

    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
          // Skip common directories that shouldn't contain relevant manifests
          if (this.shouldSkipDirectory(entry.name)) continue;
          
          await this.searchManifestFiles(fullPath, manifestFiles, depth + 1);
        } else if (entry.isFile()) {
          if (this.isManifestFile(entry.name)) {
            manifestFiles.push(fullPath);
          }
        }
      }
    } catch (error) {
      // For the root directory (depth 0), propagate the error
      if (depth === 0) {
        throw error;
      }
      // Skip subdirectories we can't read
      console.warn(`Cannot read directory ${dir}:`, error);
    }
  }

  /**
   * Check if a directory should be skipped during manifest search
   */
  private shouldSkipDirectory(dirName: string): boolean {
    const skipDirs = [
      'node_modules', '.git', '.svn', '.hg',
      'target', 'build', 'dist', 'out',
      '__pycache__', '.pytest_cache',
      'vendor', '.bundle',
      '.vs', '.vscode', '.idea',
      'tmp', 'temp', 'cache'
    ];
    return skipDirs.includes(dirName) || dirName.startsWith('.');
  }

  /**
   * Check if a filename is a manifest file
   */
  private isManifestFile(filename: string): boolean {
    const allPatterns = Object.values(MANIFEST_PATTERNS).flat();
    return allPatterns.some(pattern => {
      if (pattern.includes('*')) {
        const regex = new RegExp(pattern.replace('*', '.*'));
        return regex.test(filename);
      }
      return filename === pattern;
    });
  }

  /**
   * Parse a specific manifest file
   */
  private async parseManifestFile(manifestPath: string, repositoryPath: string): Promise<PackageDependency[]> {
    const filename = path.basename(manifestPath);
    const relativePath = path.relative(repositoryPath, manifestPath);

    switch (filename) {
      case 'package.json':
        return this.parsePackageJson(manifestPath, relativePath);
      
      case 'requirements.txt':
        return this.parseRequirementsTxt(manifestPath, relativePath);
      
      case 'pyproject.toml':
        return this.parsePyprojectToml(manifestPath, relativePath);
      
      case 'Cargo.toml':
        return this.parseCargoToml(manifestPath, relativePath);
      
      case 'go.mod':
        return this.parseGoMod(manifestPath, relativePath);
      
      case 'pom.xml':
        return this.parsePomXml(manifestPath, relativePath);
      
      default:
        if (filename.endsWith('.csproj') || filename.endsWith('.fsproj')) {
          return this.parseDotnetProject(manifestPath, relativePath);
        }
        return [];
    }
  }

  /**
   * Parse package.json (npm/Node.js)
   */
  private async parsePackageJson(manifestPath: string, relativePath: string): Promise<PackageDependency[]> {
    const content = await fs.readFile(manifestPath, 'utf-8');
    const packageJson = JSON.parse(content);
    const dependencies: PackageDependency[] = [];

    // Parse dependencies
    if (packageJson.dependencies) {
      for (const [name, version] of Object.entries(packageJson.dependencies)) {
        dependencies.push(this.createPackageDependency({
          name,
          version: version as string,
          ecosystem: 'npm',
          type: 'production',
          sourceFile: relativePath
        }));
      }
    }

    // Parse devDependencies
    if (packageJson.devDependencies) {
      for (const [name, version] of Object.entries(packageJson.devDependencies)) {
        dependencies.push(this.createPackageDependency({
          name,
          version: version as string,
          ecosystem: 'npm',
          type: 'development',
          sourceFile: relativePath
        }));
      }
    }

    // Parse peerDependencies
    if (packageJson.peerDependencies) {
      for (const [name, version] of Object.entries(packageJson.peerDependencies)) {
        dependencies.push(this.createPackageDependency({
          name,
          version: version as string,
          ecosystem: 'npm',
          type: 'peer',
          sourceFile: relativePath
        }));
      }
    }

    // Parse optionalDependencies
    if (packageJson.optionalDependencies) {
      for (const [name, version] of Object.entries(packageJson.optionalDependencies)) {
        dependencies.push(this.createPackageDependency({
          name,
          version: version as string,
          ecosystem: 'npm',
          type: 'optional',
          sourceFile: relativePath
        }));
      }
    }

    return dependencies;
  }

  /**
   * Parse requirements.txt (Python)
   */
  private async parseRequirementsTxt(manifestPath: string, relativePath: string): Promise<PackageDependency[]> {
    const content = await fs.readFile(manifestPath, 'utf-8');
    const lines = content.split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('#'));
    const dependencies: PackageDependency[] = [];

    for (const line of lines) {
      // Skip editable installs and options
      if (line.startsWith('-e') || line.startsWith('--') || line.startsWith('-')) continue;
      
      // Parse package name and version constraint
      const match = line.match(/^([a-zA-Z0-9_-]+)([>=<~!]+.*)?$/);
      if (match) {
        const [, name, versionSpec = ''] = match;
        dependencies.push(this.createPackageDependency({
          name,
          version: versionSpec || '*',
          ecosystem: 'pypi',
          type: 'production',
          sourceFile: relativePath
        }));
      }
    }

    return dependencies;
  }

  /**
   * Parse pyproject.toml (Python)
   */
  private async parsePyprojectToml(manifestPath: string, relativePath: string): Promise<PackageDependency[]> {
    try {
      const content = await fs.readFile(manifestPath, 'utf-8');
      // Basic TOML parsing for dependencies
      // In production, you'd want to use a proper TOML parser
      const dependencies: PackageDependency[] = [];
      
      // Look for [tool.poetry.dependencies] or [project.dependencies] sections
      const dependencyMatches = content.match(/\[(?:tool\.poetry\.dependencies|project\.dependencies)\]([\s\S]*?)(?:\[|$)/);
      if (dependencyMatches) {
        const depSection = dependencyMatches[1];
        const depLines = depSection.split('\n').filter(line => line.includes('='));
        
        for (const line of depLines) {
          const match = line.match(/(\w+)\s*=\s*["']([^"']+)["']/);
          if (match) {
            const [, name, version] = match;
            if (name !== 'python') { // Skip python version constraint
              dependencies.push(this.createPackageDependency({
                name,
                version,
                ecosystem: 'pypi',
                type: 'production',
                sourceFile: relativePath
              }));
            }
          }
        }
      }

      return dependencies;
    } catch (error) {
      console.warn('Failed to parse pyproject.toml:', error);
      return [];
    }
  }

  /**
   * Parse Cargo.toml (Rust)
   */
  private async parseCargoToml(manifestPath: string, relativePath: string): Promise<PackageDependency[]> {
    try {
      const content = await fs.readFile(manifestPath, 'utf-8');
      const dependencies: PackageDependency[] = [];
      
      // Parse [dependencies] section
      const dependencyMatches = content.match(/\[dependencies\]([\s\S]*?)(?:\[|$)/);
      if (dependencyMatches) {
        const depSection = dependencyMatches[1];
        const depLines = depSection.split('\n').filter(line => line.includes('='));
        
        for (const line of depLines) {
          const match = line.match(/(\w+)\s*=\s*["']([^"']+)["']/);
          if (match) {
            const [, name, version] = match;
            dependencies.push(this.createPackageDependency({
              name,
              version,
              ecosystem: 'crates',
              type: 'production',
              sourceFile: relativePath
            }));
          }
        }
      }

      // Parse [dev-dependencies] section
      const devDependencyMatches = content.match(/\[dev-dependencies\]([\s\S]*?)(?:\[|$)/);
      if (devDependencyMatches) {
        const depSection = devDependencyMatches[1];
        const depLines = depSection.split('\n').filter(line => line.includes('='));
        
        for (const line of depLines) {
          const match = line.match(/(\w+)\s*=\s*["']([^"']+)["']/);
          if (match) {
            const [, name, version] = match;
            dependencies.push(this.createPackageDependency({
              name,
              version,
              ecosystem: 'crates',
              type: 'development',
              sourceFile: relativePath
            }));
          }
        }
      }

      return dependencies;
    } catch (error) {
      console.warn('Failed to parse Cargo.toml:', error);
      return [];
    }
  }

  /**
   * Parse go.mod (Go)
   */
  private async parseGoMod(manifestPath: string, relativePath: string): Promise<PackageDependency[]> {
    const content = await fs.readFile(manifestPath, 'utf-8');
    const lines = content.split('\n').map(line => line.trim());
    const dependencies: PackageDependency[] = [];
    
    let inRequireBlock = false;
    
    for (const line of lines) {
      if (line.startsWith('require (')) {
        inRequireBlock = true;
        continue;
      }
      
      if (inRequireBlock && line === ')') {
        inRequireBlock = false;
        continue;
      }
      
      // Parse direct require statements or requires within block
      if (line.startsWith('require ') || (inRequireBlock && line.trim() && !line.startsWith(')'))){
        let requireLine = line.replace('require ', '').trim();
        
        // Handle parentheses in require block
        if (inRequireBlock) {
          requireLine = line.trim();
        }
        
        const match = requireLine.match(/^([^\s]+)\s+([^\s]+)/);
        
        if (match) {
          const [, name, version] = match;
          // Include packages that look like valid Go modules (contain slash but not local paths)
          if (name.includes('/') && !name.startsWith('.') && !name.startsWith('/')) {
            dependencies.push(this.createPackageDependency({
              name,
              version,
              ecosystem: 'go',
              type: 'production',
              sourceFile: relativePath
            }));
          }
        }
      }
    }

    return dependencies;
  }

  /**
   * Parse pom.xml (Maven/Java)
   */
  private async parsePomXml(manifestPath: string, relativePath: string): Promise<PackageDependency[]> {
    try {
      const content = await fs.readFile(manifestPath, 'utf-8');
      const dependencies: PackageDependency[] = [];
      
      // Simple regex-based XML parsing (in production, use a proper XML parser)
      const dependencyMatches = content.match(/<dependency>([\s\S]*?)<\/dependency>/g);
      
      if (dependencyMatches) {
        for (const depMatch of dependencyMatches) {
          const groupMatch = depMatch.match(/<groupId>(.*?)<\/groupId>/);
          const artifactMatch = depMatch.match(/<artifactId>(.*?)<\/artifactId>/);
          const versionMatch = depMatch.match(/<version>(.*?)<\/version>/);
          const scopeMatch = depMatch.match(/<scope>(.*?)<\/scope>/);
          
          if (groupMatch && artifactMatch) {
            const groupId = groupMatch[1];
            const artifactId = artifactMatch[1];
            const version = versionMatch?.[1] || '*';
            const scope = scopeMatch?.[1] || 'compile';
            
            let dependencyType: DependencyType = 'production';
            if (scope === 'test') dependencyType = 'test';
            else if (scope === 'provided') dependencyType = 'optional';
            
            dependencies.push(this.createPackageDependency({
              name: `${groupId}:${artifactId}`,
              version,
              ecosystem: 'maven',
              type: dependencyType,
              sourceFile: relativePath,
              scope: groupId
            }));
          }
        }
      }

      return dependencies;
    } catch (error) {
      console.warn('Failed to parse pom.xml:', error);
      return [];
    }
  }

  /**
   * Parse .csproj/.fsproj (dotnet)
   */
  private async parseDotnetProject(manifestPath: string, relativePath: string): Promise<PackageDependency[]> {
    try {
      const content = await fs.readFile(manifestPath, 'utf-8');
      const dependencies: PackageDependency[] = [];
      
      // Parse PackageReference elements
      const packageMatches = content.match(/<PackageReference\s+[^>]*>/g);
      
      if (packageMatches) {
        for (const packageMatch of packageMatches) {
          const includeMatch = packageMatch.match(/Include="([^"]+)"/);
          const versionMatch = packageMatch.match(/Version="([^"]+)"/);
          
          if (includeMatch) {
            const name = includeMatch[1];
            const version = versionMatch?.[1] || '*';
            
            dependencies.push(this.createPackageDependency({
              name,
              version,
              ecosystem: 'nuget',
              type: 'production',
              sourceFile: relativePath
            }));
          }
        }
      }

      return dependencies;
    } catch (error) {
      console.warn('Failed to parse dotnet project file:', error);
      return [];
    }
  }

  /**
   * Create a standardized PackageDependency object
   */
  private createPackageDependency(params: {
    name: string;
    version: string;
    ecosystem: PackageEcosystem;
    type: DependencyType;
    sourceFile: string;
    scope?: string;
  }): PackageDependency {
    const versionConstraint = this.parseVersionConstraint(params.version);
    
    return {
      name: params.name,
      ecosystem: params.ecosystem,
      type: params.type,
      version_constraint: versionConstraint,
      is_used: true,
      usage_confidence: 0.8, // Default confidence, can be refined later
      file_references: [params.sourceFile],
      import_statements: [],
      scope: params.scope,
      source_file: params.sourceFile
    };
  }

  /**
   * Parse version constraint string into structured format
   */
  private parseVersionConstraint(versionStr: string): VersionConstraint {
    if (!versionStr || versionStr === '*') {
      return {
        raw: versionStr,
        type: 'latest'
      };
    }

    // Exact version
    if (/^[0-9]/.test(versionStr) && !versionStr.includes('~') && !versionStr.includes('^')) {
      return {
        raw: versionStr,
        type: 'exact',
        resolved_version: versionStr
      };
    }

    // Caret range (^1.2.3)
    if (versionStr.startsWith('^')) {
      return {
        raw: versionStr,
        type: 'caret',
        min_version: versionStr.substring(1)
      };
    }

    // Tilde range (~1.2.3)
    if (versionStr.startsWith('~')) {
      return {
        raw: versionStr,
        type: 'tilde',
        min_version: versionStr.substring(1)
      };
    }

    // Range (>=1.0.0, <2.0.0)
    if (versionStr.includes('>=') || versionStr.includes('<=') || versionStr.includes('<') || versionStr.includes('>')) {
      return {
        raw: versionStr,
        type: 'range'
      };
    }

    // Default to range type
    return {
      raw: versionStr,
      type: 'range'
    };
  }

  /**
   * Calculate statistics for discovered dependencies
   */
  private calculateStatistics(dependencies: PackageDependency[]): DependencyAnalysisResult['statistics'] {
    const ecosystemCounts = {} as Record<PackageEcosystem, number>;
    const dependencyTypeCounts = {} as Record<DependencyType, number>;

    for (const dep of dependencies) {
      ecosystemCounts[dep.ecosystem] = (ecosystemCounts[dep.ecosystem] || 0) + 1;
      dependencyTypeCounts[dep.type] = (dependencyTypeCounts[dep.type] || 0) + 1;
    }

    return {
      totalDependencies: dependencies.length,
      ecosystemCounts,
      dependencyTypeCounts
    };
  }
}