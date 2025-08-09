# Phase 2: Codebase Analysis & Search Feature Roadmap

## Overview

Extend the unified search system to analyze and index entire codebases, providing intelligent code search, dependency analysis, and technical documentation insights.

**Timeline**: 8-10 weeks  
**Prerequisites**: Phase 1 (Unified Search Foundation) completed  
**Team**: Backend engineers, fullstack developers, DevOps engineers

## Goals

- **Primary**: Enable comprehensive code search across repositories
- **Secondary**: Provide intelligent code analysis and insights
- **Tertiary**: Integrate code search with existing unified search

## Architecture Overview

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Git Repos     │───▶│  Code Parser &   │───▶│  Code Embeddings│
│   - GitHub      │    │  AST Service     │    │  & Vector Store │
│   - GitLab      │    │  - Multi-lang    │    │  - Qdrant       │
│   - Local       │    │  - Symbol Extract│    │  - Code-specific│
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│ Repository      │    │  Dependency      │    │  Code Search    │
│ Management      │    │  Analysis        │    │  Frontend       │
│ - Webhooks      │    │  - Import/Export │    │  - Syntax Highlight│
│ - Sync Status   │    │  - Impact Graph  │    │  - Symbol Nav   │
│ - Access Control│    │  - Security Scan │    │  - File Explorer│
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## Work Items

### 2.1 API Documentation Recommendation Engine

#### 2.1.1 Dependency-Based API Discovery Service
**Agent**: @agent-nodejs-backend-engineer  
**Estimated Time**: 2 weeks  
**Priority**: Critical

#### Technical Requirements
- Automated analysis of package.json, requirements.txt, Cargo.toml, etc.
- Version-specific API documentation discovery and recommendation
- Integration with popular documentation sources (docs.rs, npmjs.com, PyPI, etc.)
- Intelligent version matching with compatibility analysis
- API documentation health scoring and relevance ranking

#### Database Schema Extensions
```sql
-- API Documentation Sources
CREATE TABLE api_documentation_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL UNIQUE, -- 'npm', 'pypi', 'docs.rs', 'golang.org'
    base_url VARCHAR(500) NOT NULL,
    documentation_pattern VARCHAR(500) NOT NULL, -- URL pattern with placeholders
    version_pattern VARCHAR(200), -- Regex for version extraction
    supported_languages VARCHAR(100)[] NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_updated TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    INDEX idx_api_doc_sources_language USING GIN(supported_languages)
);

-- Discovered API Documentation
CREATE TABLE discovered_api_docs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    package_name VARCHAR(255) NOT NULL,
    package_version VARCHAR(100) NOT NULL,
    language VARCHAR(50) NOT NULL,
    source_id UUID NOT NULL REFERENCES api_documentation_sources(id),
    documentation_url VARCHAR(1000) NOT NULL,
    api_reference_url VARCHAR(1000),
    examples_url VARCHAR(1000),
    changelog_url VARCHAR(1000),
    repository_url VARCHAR(1000),
    health_score INTEGER NOT NULL DEFAULT 0, -- 0-100 scoring
    last_scraped TIMESTAMP WITH TIME ZONE,
    scrape_status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'success', 'failed', 'stale'
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(package_name, package_version, language, source_id),
    INDEX idx_discovered_api_docs_package (package_name),
    INDEX idx_discovered_api_docs_language (language),
    INDEX idx_discovered_api_docs_source (source_id),
    INDEX idx_discovered_api_docs_health (health_score DESC)
);

-- Repository Dependencies with API Documentation
CREATE TABLE repository_api_recommendations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    repository_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    discovered_doc_id UUID NOT NULL REFERENCES discovered_api_docs(id),
    dependency_type VARCHAR(50) NOT NULL, -- 'direct', 'dev', 'peer', 'optional'
    usage_confidence DECIMAL(3,2) NOT NULL DEFAULT 0.0, -- 0.0-1.0 confidence score
    recommendation_reason VARCHAR(200) NOT NULL,
    file_references TEXT[], -- Files where this dependency is used
    recommendation_status VARCHAR(50) NOT NULL DEFAULT 'recommended', -- 'recommended', 'approved', 'rejected', 'indexed'
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(repository_id, discovered_doc_id),
    INDEX idx_repo_api_recommendations_repo (repository_id),
    INDEX idx_repo_api_recommendations_status (recommendation_status),
    INDEX idx_repo_api_recommendations_confidence (usage_confidence DESC)
);
```

#### Implementation Files

**API Documentation Discovery Service**
```typescript
// core/src/services/codebase/api-documentation-discovery.ts
import { DependencyAnalysisService } from './dependency-analysis-service';
import { RepositoryService } from './repository-service';

export interface PackageDependency {
  name: string;
  version: string;
  type: 'direct' | 'dev' | 'peer' | 'optional';
  language: string;
  usageFiles: string[];
  importStatements: string[];
}

export interface APIDocumentationRecommendation {
  id: string;
  packageName: string;
  packageVersion: string;
  language: string;
  documentationUrl: string;
  apiReferenceUrl?: string;
  examplesUrl?: string;
  changelogUrl?: string;
  repositoryUrl?: string;
  healthScore: number;
  relevanceScore: number;
  recommendationReason: string;
  usageConfidence: number;
  fileReferences: string[];
  estimatedIndexingTime: number; // minutes
  estimatedStorageSize: number; // MB
}

export class APIDocumentationDiscoveryService {
  private dependencyAnalysis: DependencyAnalysisService;
  private repositoryService: RepositoryService;
  private documentationSources: Map<string, APIDocumentationSource> = new Map();

  constructor(
    dependencyAnalysis: DependencyAnalysisService,
    repositoryService: RepositoryService
  ) {
    this.dependencyAnalysis = dependencyAnalysis;
    this.repositoryService = repositoryService;
    this.initializeDocumentationSources();
  }

  async analyzeRepositoryForAPIDocumentation(
    repositoryId: string
  ): Promise<APIDocumentationRecommendation[]> {
    const repository = await this.repositoryService.getRepository(repositoryId);
    if (!repository) {
      throw new Error('Repository not found');
    }

    // Analyze dependencies from all manifest files
    const dependencies = await this.dependencyAnalysis.analyzeDependencies(repositoryId);
    
    // Discover API documentation for each dependency
    const recommendations: APIDocumentationRecommendation[] = [];
    
    for (const dependency of dependencies) {
      const docRecommendations = await this.discoverDocumentationForPackage(
        dependency,
        repositoryId
      );
      recommendations.push(...docRecommendations);
    }

    // Score and rank recommendations
    const rankedRecommendations = this.rankRecommendations(recommendations);
    
    // Save recommendations to database
    await this.saveRecommendations(repositoryId, rankedRecommendations);
    
    return rankedRecommendations;
  }

  private async discoverDocumentationForPackage(
    dependency: PackageDependency,
    repositoryId: string
  ): Promise<APIDocumentationRecommendation[]> {
    const relevantSources = Array.from(this.documentationSources.values())
      .filter(source => source.supportedLanguages.includes(dependency.language));

    const recommendations: APIDocumentationRecommendation[] = [];

    for (const source of relevantSources) {
      try {
        const documentation = await this.fetchDocumentationInfo(
          dependency,
          source
        );

        if (documentation) {
          const recommendation: APIDocumentationRecommendation = {
            id: crypto.randomUUID(),
            packageName: dependency.name,
            packageVersion: dependency.version,
            language: dependency.language,
            documentationUrl: documentation.documentationUrl,
            apiReferenceUrl: documentation.apiReferenceUrl,
            examplesUrl: documentation.examplesUrl,
            changelogUrl: documentation.changelogUrl,
            repositoryUrl: documentation.repositoryUrl,
            healthScore: await this.calculateHealthScore(documentation),
            relevanceScore: this.calculateRelevanceScore(dependency),
            recommendationReason: this.generateRecommendationReason(dependency, source),
            usageConfidence: this.calculateUsageConfidence(dependency),
            fileReferences: dependency.usageFiles,
            estimatedIndexingTime: this.estimateIndexingTime(documentation),
            estimatedStorageSize: this.estimateStorageSize(documentation)
          };

          recommendations.push(recommendation);
        }
      } catch (error) {
        console.warn(`Failed to fetch documentation for ${dependency.name}:`, error);
      }
    }

    return recommendations;
  }

  private async fetchDocumentationInfo(
    dependency: PackageDependency,
    source: APIDocumentationSource
  ): Promise<APIDocumentationInfo | null> {
    switch (source.name) {
      case 'npm':
        return this.fetchNPMDocumentation(dependency);
      case 'pypi':
        return this.fetchPyPIDocumentation(dependency);
      case 'docs.rs':
        return this.fetchDocsRsDocumentation(dependency);
      case 'golang.org':
        return this.fetchGolangDocumentation(dependency);
      case 'maven':
        return this.fetchMavenDocumentation(dependency);
      case 'nuget':
        return this.fetchNuGetDocumentation(dependency);
      default:
        return this.fetchGenericDocumentation(dependency, source);
    }
  }

  private async fetchNPMDocumentation(
    dependency: PackageDependency
  ): Promise<APIDocumentationInfo | null> {
    try {
      // Fetch package metadata from npm registry
      const response = await fetch(`https://registry.npmjs.org/${dependency.name}`);
      const packageData = await response.json();
      
      if (packageData.error) return null;

      const version = dependency.version === 'latest' ? 
        packageData['dist-tags'].latest : 
        dependency.version;

      const versionData = packageData.versions[version];
      if (!versionData) return null;

      return {
        documentationUrl: this.findBestDocumentationUrl([
          versionData.homepage,
          `https://www.npmjs.com/package/${dependency.name}`,
          packageData.repository?.url
        ]),
        apiReferenceUrl: this.findAPIReferenceUrl(versionData),
        examplesUrl: this.findExamplesUrl(versionData),
        changelogUrl: this.findChangelogUrl(versionData),
        repositoryUrl: packageData.repository?.url,
        metadata: {
          description: versionData.description,
          keywords: versionData.keywords || [],
          maintainers: versionData.maintainers || [],
          lastPublished: packageData.time[version],
          weeklyDownloads: await this.fetchNPMDownloads(dependency.name),
          hasTypings: !!versionData.types || !!versionData.typings,
          license: versionData.license
        }
      };
    } catch (error) {
      return null;
    }
  }

  private async fetchPyPIDocumentation(
    dependency: PackageDependency
  ): Promise<APIDocumentationInfo | null> {
    try {
      const response = await fetch(`https://pypi.org/pypi/${dependency.name}/json`);
      const packageData = await response.json();
      
      const versionData = dependency.version === 'latest' ?
        packageData.info :
        packageData.releases[dependency.version]?.[0];

      if (!versionData) return null;

      return {
        documentationUrl: this.findBestDocumentationUrl([
          packageData.info.project_urls?.Documentation,
          packageData.info.home_page,
          `https://pypi.org/project/${dependency.name}/`,
          packageData.info.project_urls?.Homepage
        ]),
        apiReferenceUrl: packageData.info.project_urls?.['API Reference'],
        examplesUrl: packageData.info.project_urls?.Examples,
        changelogUrl: packageData.info.project_urls?.Changelog,
        repositoryUrl: packageData.info.project_urls?.['Source Code'] || 
                      packageData.info.project_urls?.Repository,
        metadata: {
          description: packageData.info.summary,
          keywords: packageData.info.keywords?.split(',') || [],
          author: packageData.info.author,
          license: packageData.info.license,
          requiresPython: packageData.info.requires_python,
          lastPublished: versionData?.upload_time
        }
      };
    } catch (error) {
      return null;
    }
  }

  private calculateHealthScore(documentation: APIDocumentationInfo): number {
    let score = 50; // Base score

    // Documentation URL availability (+20)
    if (documentation.documentationUrl && 
        !documentation.documentationUrl.includes('npmjs.com') &&
        !documentation.documentationUrl.includes('pypi.org')) {
      score += 20;
    }

    // API Reference availability (+15)
    if (documentation.apiReferenceUrl) score += 15;

    // Examples availability (+10)
    if (documentation.examplesUrl) score += 10;

    // Changelog availability (+5)
    if (documentation.changelogUrl) score += 5;

    // Repository availability (+5)
    if (documentation.repositoryUrl) score += 5;

    // Metadata quality bonuses
    const metadata = documentation.metadata;
    if (metadata?.description && metadata.description.length > 50) score += 5;
    if (metadata?.keywords && metadata.keywords.length > 0) score += 5;
    if (metadata?.weeklyDownloads && metadata.weeklyDownloads > 1000) score += 10;
    if (metadata?.hasTypings) score += 10;

    // Recency bonus (published within last year)
    if (metadata?.lastPublished) {
      const publishDate = new Date(metadata.lastPublished);
      const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
      if (publishDate > oneYearAgo) score += 10;
    }

    return Math.min(100, Math.max(0, score));
  }

  private calculateRelevanceScore(dependency: PackageDependency): number {
    let score = 50; // Base relevance

    // Direct dependencies are more relevant (+30)
    if (dependency.type === 'direct') score += 30;
    else if (dependency.type === 'dev') score += 10;

    // Usage frequency bonus
    const usageFiles = dependency.usageFiles.length;
    if (usageFiles > 10) score += 20;
    else if (usageFiles > 5) score += 15;
    else if (usageFiles > 1) score += 10;

    // Import statement analysis
    const importCount = dependency.importStatements.length;
    if (importCount > 20) score += 15;
    else if (importCount > 10) score += 10;
    else if (importCount > 5) score += 5;

    return Math.min(100, Math.max(0, score));
  }

  private calculateUsageConfidence(dependency: PackageDependency): number {
    const fileCount = dependency.usageFiles.length;
    const importCount = dependency.importStatements.length;
    
    let confidence = 0.3; // Base confidence
    
    if (dependency.type === 'direct') confidence += 0.4;
    if (fileCount > 0) confidence += Math.min(0.3, fileCount * 0.05);
    if (importCount > 0) confidence += Math.min(0.2, importCount * 0.01);

    return Math.min(1.0, confidence);
  }

  private generateRecommendationReason(
    dependency: PackageDependency,
    source: APIDocumentationSource
  ): string {
    const reasons: string[] = [];

    if (dependency.type === 'direct') {
      reasons.push('Direct dependency');
    }
    
    if (dependency.usageFiles.length > 5) {
      reasons.push(`Used in ${dependency.usageFiles.length} files`);
    }
    
    if (dependency.importStatements.length > 10) {
      reasons.push(`${dependency.importStatements.length} import statements`);
    }

    reasons.push(`Available on ${source.name}`);

    return reasons.join(', ');
  }

  private estimateIndexingTime(documentation: APIDocumentationInfo): number {
    // Base time: 5 minutes
    let timeMinutes = 5;

    // Additional time based on available documentation types
    if (documentation.apiReferenceUrl) timeMinutes += 10;
    if (documentation.examplesUrl) timeMinutes += 5;
    if (documentation.changelogUrl) timeMinutes += 2;

    // Estimate based on package popularity (more docs = more time)
    const weeklyDownloads = documentation.metadata?.weeklyDownloads || 0;
    if (weeklyDownloads > 100000) timeMinutes += 15;
    else if (weeklyDownloads > 10000) timeMinutes += 10;
    else if (weeklyDownloads > 1000) timeMinutes += 5;

    return timeMinutes;
  }

  private estimateStorageSize(documentation: APIDocumentationInfo): number {
    // Base size: 2MB
    let sizeMB = 2;

    // Additional size estimates
    if (documentation.apiReferenceUrl) sizeMB += 5;
    if (documentation.examplesUrl) sizeMB += 3;
    if (documentation.changelogUrl) sizeMB += 1;

    const weeklyDownloads = documentation.metadata?.weeklyDownloads || 0;
    if (weeklyDownloads > 100000) sizeMB += 10;
    else if (weeklyDownloads > 10000) sizeMB += 5;

    return sizeMB;
  }

  private async saveRecommendations(
    repositoryId: string,
    recommendations: APIDocumentationRecommendation[]
  ): Promise<void> {
    for (const recommendation of recommendations) {
      await this.db.query(`
        INSERT INTO repository_api_recommendations (
          repository_id, discovered_doc_id, dependency_type,
          usage_confidence, recommendation_reason, file_references
        ) VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (repository_id, discovered_doc_id)
        DO UPDATE SET
          usage_confidence = $4,
          recommendation_reason = $5,
          file_references = $6,
          updated_at = now()
      `, [
        repositoryId,
        recommendation.id,
        recommendation.language,
        recommendation.usageConfidence,
        recommendation.recommendationReason,
        recommendation.fileReferences
      ]);
    }
  }

  async getRecommendationsForRepository(
    repositoryId: string,
    status: string = 'recommended'
  ): Promise<APIDocumentationRecommendation[]> {
    const query = `
      SELECT 
        rar.*,
        dad.package_name,
        dad.package_version,
        dad.language,
        dad.documentation_url,
        dad.api_reference_url,
        dad.examples_url,
        dad.changelog_url,
        dad.repository_url,
        dad.health_score,
        dad.metadata
      FROM repository_api_recommendations rar
      JOIN discovered_api_docs dad ON rar.discovered_doc_id = dad.id
      WHERE rar.repository_id = $1
        AND rar.recommendation_status = $2
      ORDER BY rar.usage_confidence DESC, dad.health_score DESC
    `;

    const result = await this.db.query(query, [repositoryId, status]);
    
    return result.rows.map(row => ({
      id: row.discovered_doc_id,
      packageName: row.package_name,
      packageVersion: row.package_version,
      language: row.language,
      documentationUrl: row.documentation_url,
      apiReferenceUrl: row.api_reference_url,
      examplesUrl: row.examples_url,
      changelogUrl: row.changelog_url,
      repositoryUrl: row.repository_url,
      healthScore: row.health_score,
      relevanceScore: this.calculateRelevanceScore({
        name: row.package_name,
        version: row.package_version,
        type: row.dependency_type,
        language: row.language,
        usageFiles: row.file_references || [],
        importStatements: []
      }),
      recommendationReason: row.recommendation_reason,
      usageConfidence: parseFloat(row.usage_confidence),
      fileReferences: row.file_references || [],
      estimatedIndexingTime: this.estimateIndexingTime({
        documentationUrl: row.documentation_url,
        apiReferenceUrl: row.api_reference_url,
        examplesUrl: row.examples_url,
        changelogUrl: row.changelog_url,
        repositoryUrl: row.repository_url,
        metadata: row.metadata
      }),
      estimatedStorageSize: this.estimateStorageSize({
        documentationUrl: row.documentation_url,
        apiReferenceUrl: row.api_reference_url,
        examplesUrl: row.examples_url,
        changelogUrl: row.changelog_url,
        repositoryUrl: row.repository_url,
        metadata: row.metadata
      })
    }));
  }
}
```

#### Acceptance Criteria
- [ ] Automatically discovers API documentation for all project dependencies
- [ ] Supports major package ecosystems (npm, PyPI, Rust, Go, Maven, NuGet)
- [ ] Provides health scoring and relevance ranking for documentation
- [ ] Estimates indexing time and storage requirements
- [ ] Integrates with existing repository analysis workflow
- [ ] Handles version-specific documentation discovery
- [ ] Provides confidence scoring for usage recommendations

---

#### 2.1.2 API Documentation Recommendation UI
**Agent**: @agent-fullstack-feature-developer  
**Estimated Time**: 1 week  
**Priority**: High

#### Technical Requirements
- Interactive dashboard for reviewing API documentation recommendations  
- Bulk approval/rejection workflow for multiple documentation sources
- Integration with existing scraper service for approved recommendations
- Real-time status updates during documentation indexing process
- Filtering and sorting by confidence score, health score, and dependency type

#### React Components

**API Documentation Recommendations Dashboard**
```typescript
// web/src/components/codebase/ApiDocumentationRecommendations.tsx
import React, { useState, useEffect } from 'react';
import { 
  CheckIcon, 
  XMarkIcon, 
  ClockIcon, 
  DocumentTextIcon,
  ArrowTopRightOnSquareIcon,
  ChartBarIcon
} from '@heroicons/react/24/outline';
import { APIDocumentationRecommendation } from '@types/codebase';

interface ApiDocumentationRecommendationsProps {
  repositoryId: string;
  onApprove: (recommendationIds: string[]) => Promise<void>;
  onReject: (recommendationIds: string[]) => Promise<void>;
}

export function ApiDocumentationRecommendations({ 
  repositoryId, 
  onApprove, 
  onReject 
}: ApiDocumentationRecommendationsProps) {
  const [recommendations, setRecommendations] = useState<APIDocumentationRecommendation[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'high-confidence' | 'direct-deps'>('all');
  const [sortBy, setSortBy] = useState<'confidence' | 'health' | 'relevance'>('confidence');

  useEffect(() => {
    loadRecommendations();
  }, [repositoryId, filter, sortBy]);

  const loadRecommendations = async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/repositories/${repositoryId}/api-documentation-recommendations?filter=${filter}&sort=${sortBy}`
      );
      const data = await response.json();
      setRecommendations(data.recommendations);
    } catch (error) {
      console.error('Failed to load API documentation recommendations:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(recommendations.map(r => r.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleApproveSelected = async () => {
    if (selectedIds.size === 0) return;
    
    await onApprove(Array.from(selectedIds));
    setSelectedIds(new Set());
    loadRecommendations();
  };

  const handleRejectSelected = async () => {
    if (selectedIds.size === 0) return;
    
    await onReject(Array.from(selectedIds));
    setSelectedIds(new Set());
    loadRecommendations();
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'text-green-600 bg-green-50';
    if (confidence >= 0.6) return 'text-yellow-600 bg-yellow-50';
    return 'text-red-600 bg-red-50';
  };

  const getHealthScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const filteredRecommendations = recommendations.filter(rec => {
    switch (filter) {
      case 'high-confidence':
        return rec.usageConfidence >= 0.7;
      case 'direct-deps':
        return rec.recommendationReason.includes('Direct dependency');
      default:
        return true;
    }
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">
          API Documentation Recommendations
        </h2>
        <div className="flex items-center space-x-4">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as any)}
            className="form-select"
          >
            <option value="all">All Recommendations</option>
            <option value="high-confidence">High Confidence</option>
            <option value="direct-deps">Direct Dependencies</option>
          </select>
          
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="form-select"
          >
            <option value="confidence">Sort by Confidence</option>
            <option value="health">Sort by Health Score</option>
            <option value="relevance">Sort by Relevance</option>
          </select>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card p-4">
          <div className="flex items-center">
            <DocumentTextIcon className="h-8 w-8 text-blue-600" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Total Recommendations</p>
              <p className="text-2xl font-bold text-gray-900">{recommendations.length}</p>
            </div>
          </div>
        </div>
        
        <div className="card p-4">
          <div className="flex items-center">
            <CheckIcon className="h-8 w-8 text-green-600" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">High Confidence</p>
              <p className="text-2xl font-bold text-gray-900">
                {recommendations.filter(r => r.usageConfidence >= 0.7).length}
              </p>
            </div>
          </div>
        </div>
        
        <div className="card p-4">
          <div className="flex items-center">
            <ClockIcon className="h-8 w-8 text-yellow-600" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Est. Indexing Time</p>
              <p className="text-2xl font-bold text-gray-900">
                {Math.round(recommendations.reduce((sum, r) => sum + r.estimatedIndexingTime, 0))}m
              </p>
            </div>
          </div>
        </div>
        
        <div className="card p-4">
          <div className="flex items-center">
            <ChartBarIcon className="h-8 w-8 text-purple-600" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Est. Storage</p>
              <p className="text-2xl font-bold text-gray-900">
                {Math.round(recommendations.reduce((sum, r) => sum + r.estimatedStorageSize, 0))}MB
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Bulk Actions */}
      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg p-4">
          <span className="text-sm font-medium text-blue-900">
            {selectedIds.size} recommendation{selectedIds.size > 1 ? 's' : ''} selected
          </span>
          <div className="flex space-x-3">
            <button
              onClick={handleApproveSelected}
              className="btn btn-sm btn-success"
            >
              <CheckIcon className="h-4 w-4 mr-2" />
              Approve & Index
            </button>
            <button
              onClick={handleRejectSelected}
              className="btn btn-sm btn-danger"
            >
              <XMarkIcon className="h-4 w-4 mr-2" />
              Reject
            </button>
          </div>
        </div>
      )}

      {/* Recommendations Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === filteredRecommendations.length}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    className="form-checkbox"
                  />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Package
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Confidence
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Health Score
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Documentation
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Impact
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredRecommendations.map((recommendation) => (
                <tr key={recommendation.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(recommendation.id)}
                      onChange={(e) => {
                        const newSelected = new Set(selectedIds);
                        if (e.target.checked) {
                          newSelected.add(recommendation.id);
                        } else {
                          newSelected.delete(recommendation.id);
                        }
                        setSelectedIds(newSelected);
                      }}
                      className="form-checkbox"
                    />
                  </td>
                  
                  <td className="px-6 py-4">
                    <div className="flex items-center">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {recommendation.packageName}
                        </div>
                        <div className="text-sm text-gray-500">
                          v{recommendation.packageVersion} • {recommendation.language}
                        </div>
                      </div>
                    </div>
                  </td>
                  
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getConfidenceColor(recommendation.usageConfidence)}`}>
                      {Math.round(recommendation.usageConfidence * 100)}%
                    </span>
                  </td>
                  
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`text-sm font-medium ${getHealthScoreColor(recommendation.healthScore)}`}>
                      {recommendation.healthScore}/100
                    </span>
                  </td>
                  
                  <td className="px-6 py-4">
                    <div className="flex items-center space-x-2">
                      <a
                        href={recommendation.documentationUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 text-sm"
                      >
                        Documentation
                        <ArrowTopRightOnSquareIcon className="h-3 w-3 ml-1 inline" />
                      </a>
                      {recommendation.apiReferenceUrl && (
                        <span className="text-gray-300">•</span>
                      )}
                      {recommendation.apiReferenceUrl && (
                        <a
                          href={recommendation.apiReferenceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-800 text-sm"
                        >
                          API Reference
                          <ArrowTopRightOnSquareIcon className="h-3 w-3 ml-1 inline" />
                        </a>
                      )}
                    </div>
                  </td>
                  
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <div>
                      {recommendation.estimatedIndexingTime}min • {recommendation.estimatedStorageSize}MB
                    </div>
                    <div className="text-xs">
                      {recommendation.fileReferences.length} files
                    </div>
                  </td>
                  
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                    <button
                      onClick={() => onApprove([recommendation.id])}
                      className="text-green-600 hover:text-green-900"
                      title="Approve and index this documentation"
                    >
                      <CheckIcon className="h-5 w-5" />
                    </button>
                    <button
                      onClick={() => onReject([recommendation.id])}
                      className="text-red-600 hover:text-red-900"
                      title="Reject this recommendation"
                    >
                      <XMarkIcon className="h-5 w-5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
```

**Integration with Scraper Service**
```typescript
// gateway/src/routes/api-documentation-recommendations.routes.ts
import { Router } from 'express';
import { APIDocumentationDiscoveryService } from '@mcp-tools/core';
import { ScraperService } from '@mcp-tools/core';

const router = Router();

// Get API documentation recommendations for a repository
router.get('/repositories/:repositoryId/api-documentation-recommendations', async (req, res) => {
  try {
    const { repositoryId } = req.params;
    const { filter = 'all', sort = 'confidence', status = 'recommended' } = req.query;
    
    const discoveryService = req.app.get('apiDocumentationDiscovery') as APIDocumentationDiscoveryService;
    const recommendations = await discoveryService.getRecommendationsForRepository(
      repositoryId, 
      status as string
    );
    
    // Apply filtering and sorting
    let filtered = recommendations;
    
    if (filter === 'high-confidence') {
      filtered = filtered.filter(r => r.usageConfidence >= 0.7);
    } else if (filter === 'direct-deps') {
      filtered = filtered.filter(r => r.recommendationReason.includes('Direct dependency'));
    }
    
    // Sort recommendations
    filtered.sort((a, b) => {
      switch (sort) {
        case 'health':
          return b.healthScore - a.healthScore;
        case 'relevance':
          return b.relevanceScore - a.relevanceScore;
        case 'confidence':
        default:
          return b.usageConfidence - a.usageConfidence;
      }
    });
    
    res.json({
      recommendations: filtered,
      total: filtered.length,
      stats: {
        totalRecommendations: recommendations.length,
        highConfidence: recommendations.filter(r => r.usageConfidence >= 0.7).length,
        estimatedIndexingTime: recommendations.reduce((sum, r) => sum + r.estimatedIndexingTime, 0),
        estimatedStorageSize: recommendations.reduce((sum, r) => sum + r.estimatedStorageSize, 0)
      }
    });
  } catch (error) {
    console.error('Error fetching API documentation recommendations:', error);
    res.status(500).json({ error: 'Failed to fetch recommendations' });
  }
});

// Approve API documentation recommendations for indexing
router.post('/repositories/:repositoryId/api-documentation-recommendations/approve', async (req, res) => {
  try {
    const { repositoryId } = req.params;
    const { recommendationIds } = req.body;
    
    if (!Array.isArray(recommendationIds) || recommendationIds.length === 0) {
      return res.status(400).json({ error: 'Invalid recommendation IDs' });
    }
    
    const discoveryService = req.app.get('apiDocumentationDiscovery') as APIDocumentationDiscoveryService;
    const scraperService = req.app.get('scraperService') as ScraperService;
    
    // Update recommendation status to 'approved'
    await discoveryService.updateRecommendationStatus(recommendationIds, 'approved');
    
    // Get approved recommendations
    const recommendations = await discoveryService.getRecommendationsByIds(recommendationIds);
    
    // Schedule scraping for each approved documentation
    const scrapingTasks = [];
    for (const recommendation of recommendations) {
      const scrapingTask = {
        url: recommendation.documentationUrl,
        type: 'api-documentation' as const,
        metadata: {
          packageName: recommendation.packageName,
          packageVersion: recommendation.packageVersion,
          language: recommendation.language,
          repositoryId,
          recommendationId: recommendation.id
        },
        vectorOptions: {
          enabled: true,
          chunkingOptions: {
            strategy: 'paragraph' as const,
            target_size: 1000,
            max_size: 1500,
            min_size: 200,
            overlap_size: 100
          }
        }
      };
      
      scrapingTasks.push(scrapingTask);
      
      // Also scrape API reference and examples if available
      if (recommendation.apiReferenceUrl) {
        scrapingTasks.push({
          ...scrapingTask,
          url: recommendation.apiReferenceUrl,
          metadata: {
            ...scrapingTask.metadata,
            documentationType: 'api-reference'
          }
        });
      }
      
      if (recommendation.examplesUrl) {
        scrapingTasks.push({
          ...scrapingTask,
          url: recommendation.examplesUrl,
          metadata: {
            ...scrapingTask.metadata,
            documentationType: 'examples'
          }
        });
      }
    }
    
    // Submit scraping tasks
    const scrapeResults = await Promise.all(
      scrapingTasks.map(task => scraperService.scrapeUrl(task))
    );
    
    // Update recommendation status to 'indexed'
    await discoveryService.updateRecommendationStatus(recommendationIds, 'indexed');
    
    res.json({
      message: `Successfully approved and scheduled indexing for ${recommendationIds.length} recommendations`,
      approvedRecommendations: recommendationIds,
      scrapingTasks: scrapeResults.length,
      estimatedCompletionTime: recommendations.reduce((sum, r) => sum + r.estimatedIndexingTime, 0)
    });
    
  } catch (error) {
    console.error('Error approving API documentation recommendations:', error);
    res.status(500).json({ error: 'Failed to approve recommendations' });
  }
});

// Reject API documentation recommendations
router.post('/repositories/:repositoryId/api-documentation-recommendations/reject', async (req, res) => {
  try {
    const { recommendationIds } = req.body;
    
    if (!Array.isArray(recommendationIds) || recommendationIds.length === 0) {
      return res.status(400).json({ error: 'Invalid recommendation IDs' });
    }
    
    const discoveryService = req.app.get('apiDocumentationDiscovery') as APIDocumentationDiscoveryService;
    
    // Update recommendation status to 'rejected'
    await discoveryService.updateRecommendationStatus(recommendationIds, 'rejected');
    
    res.json({
      message: `Successfully rejected ${recommendationIds.length} recommendations`,
      rejectedRecommendations: recommendationIds
    });
    
  } catch (error) {
    console.error('Error rejecting API documentation recommendations:', error);
    res.status(500).json({ error: 'Failed to reject recommendations' });
  }
});

export default router;
```

#### Acceptance Criteria
- [ ] Interactive dashboard displays all API documentation recommendations with filtering and sorting
- [ ] Bulk approval workflow automatically schedules documentation indexing via scraper service
- [ ] Real-time status updates show indexing progress and completion
- [ ] Integration with existing scraper service includes vector embeddings generation
- [ ] Confidence and health scoring visually guides approval decisions
- [ ] Estimation of indexing time and storage requirements helps resource planning
- [ ] Complete audit trail of approved, rejected, and indexed recommendations

---

### 2.2 Code Repository Management

#### 2.1.1 Repository Service Implementation

**Agent**: nodejs-backend-engineer  
**Estimated Time**: 2 weeks  
**Priority**: Critical

**Description**  
Create comprehensive service for managing code repositories with Git integration, webhook support, and real-time synchronization.

**Technical Requirements**
- Git repository cloning and management
- Support for GitHub, GitLab, Bitbucket APIs
- Webhook integration for real-time updates
- Repository metadata storage and indexing
- Branch/tag management and history tracking
- Access control and permission management

**Database Schema Extensions**
```sql
-- Repository management tables
CREATE TABLE code_repositories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  url TEXT NOT NULL,
  provider VARCHAR(50) NOT NULL, -- github, gitlab, bitbucket, local
  access_token_encrypted TEXT,
  default_branch VARCHAR(100) DEFAULT 'main',
  last_sync_at TIMESTAMP,
  sync_status VARCHAR(20) DEFAULT 'pending', -- pending, syncing, completed, failed
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE repository_branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id UUID NOT NULL REFERENCES code_repositories(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  commit_hash VARCHAR(40) NOT NULL,
  last_commit_at TIMESTAMP,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(repository_id, name)
);

CREATE TABLE repository_sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id UUID NOT NULL REFERENCES code_repositories(id) ON DELETE CASCADE,
  branch_name VARCHAR(255),
  sync_type VARCHAR(20) NOT NULL, -- full, incremental, webhook
  status VARCHAR(20) NOT NULL, -- started, completed, failed
  files_processed INTEGER DEFAULT 0,
  errors_encountered INTEGER DEFAULT 0,
  duration_ms INTEGER,
  error_details JSONB,
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);
```

**API Implementation**
```typescript
interface RepositoryService {
  // Repository management
  addRepository(config: RepositoryConfig): Promise<Repository>;
  updateRepository(id: string, updates: Partial<Repository>): Promise<Repository>;
  removeRepository(id: string): Promise<void>;
  getRepository(id: string): Promise<Repository>;
  listRepositories(filters?: RepositoryFilters): Promise<Repository[]>;
  
  // Synchronization
  syncRepository(id: string, options?: SyncOptions): Promise<SyncResult>;
  getSyncStatus(id: string): Promise<SyncStatus>;
  getSyncHistory(id: string, limit?: number): Promise<SyncLog[]>;
  
  // Webhook handling
  handleWebhook(provider: string, payload: any): Promise<void>;
  setupWebhook(repositoryId: string): Promise<WebhookConfig>;
  
  // Branch management
  getBranches(repositoryId: string): Promise<Branch[]>;
  switchBranch(repositoryId: string, branchName: string): Promise<void>;
}
```

**Key Features**
- **Git Integration**: Clone, fetch, and sync repositories
- **Multi-Provider Support**: GitHub, GitLab, Bitbucket APIs
- **Webhook Support**: Real-time updates on commits/PRs
- **Access Control**: Repository-level permissions
- **Sync Management**: Full and incremental sync strategies
- **Error Handling**: Comprehensive error tracking and recovery

**Acceptance Criteria**
1. ✅ Support for GitHub, GitLab, Bitbucket repositories
2. ✅ Webhook integration with < 30s update latency
3. ✅ Repository metadata stored and searchable
4. ✅ Access control with user/team permissions
5. ✅ Incremental sync with change detection
6. ✅ Error handling and sync status monitoring
7. ✅ Repository management UI components

---

#### 2.1.2 Code Parser & AST Service

**Agent**: nodejs-backend-engineer  
**Estimated Time**: 2 weeks  
**Priority**: Critical

**Description**  
Implement multi-language code parsing with Abstract Syntax Tree (AST) generation, symbol extraction, and code structure analysis.

**Technical Requirements**
- Multi-language parser support (JavaScript/TypeScript, Python, Go, Rust, Java)
- AST generation and traversal
- Symbol extraction (functions, classes, variables, imports)
- Code structure analysis and metrics
- Performance optimization for large codebases

**Supported Languages & Parsers**
```typescript
interface LanguageParser {
  language: string;
  extensions: string[];
  parser: 'tree-sitter' | 'babel' | 'acorn' | 'custom';
  astGenerator: (code: string) => Promise<AST>;
  symbolExtractor: (ast: AST) => Promise<Symbol[]>;
}

const SUPPORTED_LANGUAGES: LanguageParser[] = [
  {
    language: 'javascript',
    extensions: ['.js', '.jsx', '.mjs'],
    parser: 'babel',
    astGenerator: generateJavaScriptAST,
    symbolExtractor: extractJavaScriptSymbols
  },
  {
    language: 'typescript',
    extensions: ['.ts', '.tsx', '.d.ts'],
    parser: 'typescript',
    astGenerator: generateTypeScriptAST,
    symbolExtractor: extractTypeScriptSymbols
  },
  {
    language: 'python',
    extensions: ['.py', '.pyw'],
    parser: 'tree-sitter',
    astGenerator: generatePythonAST,
    symbolExtractor: extractPythonSymbols
  }
  // ... additional languages
];
```

**Symbol Extraction Schema**
```sql
CREATE TABLE code_symbols (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID NOT NULL REFERENCES code_files(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL, -- function, class, variable, interface, etc.
  signature TEXT,
  start_line INTEGER NOT NULL,
  end_line INTEGER NOT NULL,
  start_column INTEGER,
  end_column INTEGER,
  visibility VARCHAR(20), -- public, private, protected
  is_exported BOOLEAN DEFAULT FALSE,
  parent_symbol_id UUID REFERENCES code_symbols(id),
  documentation TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  
  -- Search indexes
  CONSTRAINT code_symbols_name_idx UNIQUE(file_id, name, type, start_line)
);

CREATE INDEX idx_code_symbols_name ON code_symbols(name);
CREATE INDEX idx_code_symbols_type ON code_symbols(type);
CREATE INDEX idx_code_symbols_file ON code_symbols(file_id);
CREATE INDEX idx_code_symbols_parent ON code_symbols(parent_symbol_id);

CREATE TABLE code_dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID NOT NULL REFERENCES code_files(id) ON DELETE CASCADE,
  dependency_type VARCHAR(50) NOT NULL, -- import, require, include
  dependency_path TEXT NOT NULL,
  dependency_name VARCHAR(255),
  is_external BOOLEAN DEFAULT FALSE,
  is_dynamic BOOLEAN DEFAULT FALSE,
  line_number INTEGER,
  resolved_file_id UUID REFERENCES code_files(id),
  created_at TIMESTAMP DEFAULT NOW()
);
```

**AST Processing Service**
```typescript
interface CodeParserService {
  // File processing
  parseFile(filePath: string, content: string): Promise<ParseResult>;
  parseFiles(files: FileInput[]): Promise<ParseResult[]>;
  
  // Symbol extraction
  extractSymbols(ast: AST, filePath: string): Promise<Symbol[]>;
  buildSymbolIndex(repositoryId: string): Promise<SymbolIndex>;
  
  // Dependency analysis
  extractDependencies(ast: AST, filePath: string): Promise<Dependency[]>;
  buildDependencyGraph(repositoryId: string): Promise<DependencyGraph>;
  
  // Code metrics
  calculateMetrics(ast: AST): Promise<CodeMetrics>;
  analyzeComplexity(ast: AST): Promise<ComplexityMetrics>;
}

interface ParseResult {
  success: boolean;
  ast?: AST;
  symbols: Symbol[];
  dependencies: Dependency[];
  metrics: CodeMetrics;
  errors: ParseError[];
}
```

**Key Features**
- **Multi-Language Support**: JavaScript/TS, Python, Go, Rust, Java
- **AST Generation**: Language-specific AST parsing
- **Symbol Extraction**: Functions, classes, variables, interfaces
- **Dependency Tracking**: Import/export analysis
- **Code Metrics**: Complexity, maintainability scores
- **Performance**: Parallel processing and caching

**Acceptance Criteria**
1. ✅ Support for 5+ programming languages
2. ✅ Symbol extraction with 95%+ accuracy
3. ✅ Dependency graph generation
4. ✅ Parse large files (>10k lines) in <5 seconds
5. ✅ Incremental parsing for changed files
6. ✅ Error handling for malformed code
7. ✅ Symbol search API with filtering

---

### 2.2 Code Indexing & Analysis

#### 2.2.1 Code Chunking Strategy

**Agent**: nodejs-backend-engineer  
**Estimated Time**: 1.5 weeks  
**Priority**: High

**Description**  
Implement intelligent code-aware chunking strategies that preserve semantic boundaries and context for optimal search and embedding generation.

**Technical Requirements**
- Function/method-level chunking with context
- Class/module-level chunking strategies
- Import/dependency preservation in chunks
- Comment and documentation extraction
- Test file association and analysis

**Code Chunking Strategies**
```typescript
interface CodeChunkingService {
  // Main chunking methods
  chunkByFunction(file: CodeFile): Promise<CodeChunk[]>;
  chunkByClass(file: CodeFile): Promise<CodeChunk[]>;
  chunkByModule(file: CodeFile): Promise<CodeChunk[]>;
  chunkByLogicalBlocks(file: CodeFile): Promise<CodeChunk[]>;
  
  // Context preservation
  addContextToChunk(chunk: CodeChunk, context: ChunkContext): Promise<CodeChunk>;
  preserveImports(chunk: CodeChunk, imports: ImportStatement[]): Promise<CodeChunk>;
  associateComments(chunk: CodeChunk, comments: Comment[]): Promise<CodeChunk>;
  
  // Chunking analysis
  analyzeChunkQuality(chunk: CodeChunk): Promise<ChunkQualityMetrics>;
  optimizeChunking(file: CodeFile, strategy: ChunkingStrategy): Promise<CodeChunk[]>;
}

enum ChunkingStrategy {
  FUNCTION_BASED = 'function',
  CLASS_BASED = 'class',
  MODULE_BASED = 'module',
  SEMANTIC_BLOCKS = 'semantic',
  HYBRID = 'hybrid'
}

interface CodeChunk {
  id: string;
  fileId: string;
  strategy: ChunkingStrategy;
  startLine: number;
  endLine: number;
  content: string;
  symbols: Symbol[];
  dependencies: string[];
  imports: ImportStatement[];
  comments: Comment[];
  context: ChunkContext;
  quality: ChunkQualityMetrics;
  embeddingId?: string;
}
```

**Language-Specific Chunking Rules**
```typescript
interface LanguageChunkingConfig {
  language: string;
  preferredStrategy: ChunkingStrategy;
  minChunkSize: number;
  maxChunkSize: number;
  contextLines: number;
  preserveImports: boolean;
  includeComments: boolean;
  splitLargeFunctions: boolean;
}

const CHUNKING_CONFIGS: LanguageChunkingConfig[] = [
  {
    language: 'javascript',
    preferredStrategy: ChunkingStrategy.FUNCTION_BASED,
    minChunkSize: 50,
    maxChunkSize: 2000,
    contextLines: 5,
    preserveImports: true,
    includeComments: true,
    splitLargeFunctions: true
  },
  {
    language: 'python',
    preferredStrategy: ChunkingStrategy.CLASS_BASED,
    minChunkSize: 100,
    maxChunkSize: 1500,
    contextLines: 3,
    preserveImports: true,
    includeComments: true,
    splitLargeFunctions: false
  }
  // ... additional languages
];
```

**Database Schema for Code Chunks**
```sql
CREATE TABLE code_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID NOT NULL REFERENCES code_files(id) ON DELETE CASCADE,
  chunk_type VARCHAR(50) NOT NULL, -- function, class, module, block
  start_line INTEGER NOT NULL,
  end_line INTEGER NOT NULL,
  content TEXT NOT NULL,
  content_hash VARCHAR(64) NOT NULL, -- For change detection
  embedding_id TEXT, -- Reference to vector store
  symbols JSONB DEFAULT '[]',
  dependencies JSONB DEFAULT '[]',
  imports JSONB DEFAULT '[]',
  comments JSONB DEFAULT '[]',
  context JSONB DEFAULT '{}',
  quality_score DECIMAL(3,2),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_code_chunks_file ON code_chunks(file_id);
CREATE INDEX idx_code_chunks_type ON code_chunks(chunk_type);
CREATE INDEX idx_code_chunks_hash ON code_chunks(content_hash);
CREATE INDEX idx_code_chunks_quality ON code_chunks(quality_score);
```

**Key Features**
- **Semantic Chunking**: Function, class, module-level chunks
- **Context Preservation**: Import statements and dependencies
- **Comment Integration**: Documentation and inline comments
- **Quality Scoring**: Chunk completeness and semantic value
- **Language Awareness**: Language-specific chunking rules
- **Change Detection**: Efficient re-chunking on updates

**Acceptance Criteria**
1. ✅ Language-specific chunking strategies
2. ✅ Semantic boundary detection with 90%+ accuracy
3. ✅ Context preservation in chunks
4. ✅ Chunk quality scoring system
5. ✅ Efficient incremental re-chunking
6. ✅ Performance: 1000 lines/second chunking
7. ✅ Chunk search and retrieval API

---

#### 2.2.2 Code Embeddings & Semantic Search

**Agent**: nodejs-backend-engineer  
**Estimated Time**: 2 weeks  
**Priority**: High

**Description**  
Generate specialized embeddings optimized for code search, including symbol names, documentation, usage patterns, and cross-references.

**Technical Requirements**
- Code-specific embedding models (CodeBERT, GraphCodeBERT)
- Symbol name and identifier embeddings
- Documentation and comment embeddings
- Usage pattern and context embeddings
- Cross-reference and dependency embeddings

**Code Embedding Service**
```typescript
interface CodeEmbeddingService {
  // Embedding generation
  generateCodeEmbedding(chunk: CodeChunk): Promise<Embedding>;
  generateSymbolEmbedding(symbol: Symbol): Promise<Embedding>;
  generateDocEmbedding(documentation: string): Promise<Embedding>;
  
  // Batch processing
  generateEmbeddingsBatch(chunks: CodeChunk[]): Promise<Embedding[]>;
  processRepository(repositoryId: string): Promise<EmbeddingResult>;
  
  // Search operations
  searchSimilarCode(query: string, filters?: CodeSearchFilters): Promise<CodeSearchResult[]>;
  searchSymbols(symbolName: string, type?: SymbolType): Promise<SymbolSearchResult[]>;
  findUsagePatterns(pattern: string): Promise<UsagePattern[]>;
  
  // Embedding management
  updateEmbeddings(fileIds: string[]): Promise<void>;
  getEmbeddingStats(): Promise<EmbeddingStats>;
}

interface CodeEmbeddingModel {
  name: string;
  type: 'code' | 'symbol' | 'documentation';
  dimensions: number;
  maxTokens: number;
  languages: string[];
  generateEmbedding: (input: string) => Promise<number[]>;
}
```

**Embedding Types and Strategies**
```typescript
enum EmbeddingType {
  CODE_SEMANTIC = 'code_semantic',     // Full code understanding
  SYMBOL_NAME = 'symbol_name',         // Identifier similarity
  DOCUMENTATION = 'documentation',     // Comment and docstring
  USAGE_PATTERN = 'usage_pattern',     // How code is used
  CROSS_REFERENCE = 'cross_reference'  // Dependency relationships
}

interface EmbeddingStrategy {
  type: EmbeddingType;
  model: string;
  preprocessing: (input: string) => string;
  postprocessing: (embedding: number[]) => number[];
  weight: number; // For hybrid search
}

const CODE_EMBEDDING_STRATEGIES: EmbeddingStrategy[] = [
  {
    type: EmbeddingType.CODE_SEMANTIC,
    model: 'microsoft/codebert-base',
    preprocessing: normalizeCode,
    postprocessing: normalizeVector,
    weight: 0.4
  },
  {
    type: EmbeddingType.SYMBOL_NAME,
    model: 'fasttext-symbols',
    preprocessing: extractIdentifiers,
    postprocessing: identityTransform,
    weight: 0.3
  },
  {
    type: EmbeddingType.DOCUMENTATION,
    model: 'sentence-transformers/all-MiniLM-L6-v2',
    preprocessing: extractComments,
    postprocessing: normalizeVector,
    weight: 0.2
  },
  {
    type: EmbeddingType.USAGE_PATTERN,
    model: 'custom-usage-model',
    preprocessing: extractUsageContext,
    postprocessing: patternNormalize,
    weight: 0.1
  }
];
```

**Vector Store Schema for Code**
```typescript
// Qdrant collection configuration for code embeddings
interface CodeVectorCollection {
  name: string;
  vectors: {
    size: number;
    distance: 'Cosine' | 'Euclid' | 'Dot';
  };
  payload_schema: {
    file_id: 'keyword';
    chunk_id: 'keyword';
    repository_id: 'keyword';
    language: 'keyword';
    symbol_type: 'keyword';
    embedding_type: 'keyword';
    content_hash: 'keyword';
    quality_score: 'float';
    created_at: 'datetime';
  };
}

const CODE_COLLECTIONS: CodeVectorCollection[] = [
  {
    name: 'code_semantic',
    vectors: { size: 768, distance: 'Cosine' },
    payload_schema: { /* ... */ }
  },
  {
    name: 'code_symbols',
    vectors: { size: 300, distance: 'Cosine' },
    payload_schema: { /* ... */ }
  },
  {
    name: 'code_documentation',
    vectors: { size: 384, distance: 'Cosine' },
    payload_schema: { /* ... */ }
  }
];
```

**Key Features**
- **Multi-Model Embeddings**: CodeBERT, FastText, custom models
- **Hybrid Search**: Combine semantic, syntactic, and pattern search
- **Symbol Understanding**: Identifier and naming pattern recognition
- **Documentation Integration**: Comments and docstring embeddings
- **Usage Patterns**: Code usage context and patterns
- **Performance**: Batch processing and caching

**Acceptance Criteria**
1. ✅ Code-specific embedding models integrated
2. ✅ Multi-type embedding generation (code, symbols, docs)
3. ✅ Hybrid search with weighted ranking
4. ✅ Symbol similarity search with 85%+ accuracy
5. ✅ Batch processing for repository indexing
6. ✅ Performance: 100 embeddings/second
7. ✅ Integration with existing vector store

---

### 2.3 Code Intelligence Features

#### 2.3.1 Dependency Analysis Service

**Agent**: fullstack-feature-developer  
**Estimated Time**: 2 weeks  
**Priority**: High

**Description**  
Build comprehensive dependency analysis system with import/export tracking, dependency graphs, impact analysis, and security vulnerability detection.

**Technical Requirements**
- Import/export relationship tracking
- Dependency tree visualization
- Circular dependency detection
- Version compatibility analysis
- Security vulnerability scanning
- Impact analysis for changes

**Dependency Analysis Service**
```typescript
interface DependencyAnalysisService {
  // Dependency graph operations
  buildDependencyGraph(repositoryId: string): Promise<DependencyGraph>;
  analyzeDependencies(fileId: string): Promise<DependencyAnalysis>;
  findCircularDependencies(repositoryId: string): Promise<CircularDependency[]>;
  
  // Impact analysis
  analyzeImpact(fileId: string, changeType: ChangeType): Promise<ImpactAnalysis>;
  findAffectedFiles(fileId: string): Promise<string[]>;
  calculateChangeRadius(changes: FileChange[]): Promise<ChangeRadius>;
  
  // Security analysis
  scanVulnerabilities(repositoryId: string): Promise<VulnerabilityReport>;
  checkPackageSecurity(packageName: string, version: string): Promise<SecurityInfo>;
  
  // Visualization data
  getDependencyGraphData(repositoryId: string): Promise<GraphData>;
  getTreeMapData(repositoryId: string): Promise<TreeMapData>;
}

interface DependencyGraph {
  nodes: DependencyNode[];
  edges: DependencyEdge[];
  metrics: GraphMetrics;
  cycles: CircularDependency[];
}

interface DependencyNode {
  id: string;
  type: 'file' | 'package' | 'module';
  name: string;
  path: string;
  size: number;
  complexity: number;
  isExternal: boolean;
  version?: string;
  vulnerabilities: Vulnerability[];
}

interface DependencyEdge {
  from: string;
  to: string;
  type: 'import' | 'require' | 'include';
  weight: number;
  isConditional: boolean;
  isDynamic: boolean;
}
```

**Database Schema for Dependencies**
```sql
CREATE TABLE dependency_graphs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id UUID NOT NULL REFERENCES code_repositories(id) ON DELETE CASCADE,
  version_hash VARCHAR(64) NOT NULL,
  total_nodes INTEGER,
  total_edges INTEGER,
  circular_dependencies INTEGER,
  max_depth INTEGER,
  complexity_score DECIMAL(5,2),
  generated_at TIMESTAMP DEFAULT NOW(),
  graph_data JSONB NOT NULL
);

CREATE TABLE dependency_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id UUID NOT NULL REFERENCES code_repositories(id) ON DELETE CASCADE,
  from_file_id UUID NOT NULL REFERENCES code_files(id) ON DELETE CASCADE,
  to_file_id UUID REFERENCES code_files(id) ON DELETE CASCADE,
  dependency_type VARCHAR(50) NOT NULL,
  dependency_name VARCHAR(255) NOT NULL,
  dependency_path TEXT,
  is_external BOOLEAN DEFAULT FALSE,
  is_conditional BOOLEAN DEFAULT FALSE,
  is_dynamic BOOLEAN DEFAULT FALSE,
  line_number INTEGER,
  import_statement TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE vulnerability_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id UUID NOT NULL REFERENCES code_repositories(id) ON DELETE CASCADE,
  scan_type VARCHAR(50) NOT NULL, -- dependencies, code, secrets
  vulnerabilities_found INTEGER DEFAULT 0,
  critical_count INTEGER DEFAULT 0,
  high_count INTEGER DEFAULT 0,
  medium_count INTEGER DEFAULT 0,
  low_count INTEGER DEFAULT 0,
  scan_duration_ms INTEGER,
  scanned_at TIMESTAMP DEFAULT NOW(),
  results JSONB DEFAULT '{}'
);
```

**Impact Analysis System**
```typescript
interface ImpactAnalysisEngine {
  // Change impact calculation
  calculateDirectImpact(fileId: string): Promise<string[]>;
  calculateTransitiveImpact(fileId: string, depth: number): Promise<ImpactResult>;
  analyzeTestCoverage(fileId: string): Promise<TestCoverageImpact>;
  
  // Risk assessment
  assessChangeRisk(changes: FileChange[]): Promise<RiskAssessment>;
  identifyHighRiskChanges(changes: FileChange[]): Promise<HighRiskChange[]>;
  
  // Recommendations
  generateChangeRecommendations(analysis: ImpactAnalysis): Promise<Recommendation[]>;
  suggestTestingStrategy(impact: ImpactResult): Promise<TestingStrategy>;
}

interface ImpactResult {
  directlyAffected: FileImpact[];
  transitivelyAffected: FileImpact[];
  testFilesAffected: FileImpact[];
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  changeRadius: number;
  estimatedEffort: number; // in hours
  recommendations: Recommendation[];
}
```

**Key Features**
- **Dependency Graphing**: Visual dependency relationships
- **Circular Detection**: Identify and resolve dependency cycles
- **Impact Analysis**: Change impact calculation and risk assessment
- **Security Scanning**: Vulnerability detection in dependencies
- **Version Management**: Compatibility and upgrade analysis
- **Performance**: Large codebase handling

**Acceptance Criteria**
1. ✅ Dependency graph generation for repositories
2. ✅ Circular dependency detection with resolution suggestions
3. ✅ Impact analysis with risk assessment
4. ✅ Security vulnerability scanning integration
5. ✅ Visual dependency explorer UI
6. ✅ Performance: 10k+ file analysis in <30 seconds
7. ✅ Integration with existing search results

---

#### 2.3.2 Code Quality & Metrics Service

**Agent**: nodejs-backend-engineer  
**Estimated Time**: 1.5 weeks  
**Priority**: Medium

**Description**  
Implement comprehensive code quality analysis with complexity metrics, technical debt calculation, code smell detection, and best practices validation.

**Technical Requirements**
- Complexity metrics (cyclomatic, cognitive)
- Code coverage integration
- Technical debt calculation
- Code smell detection
- Best practices validation
- Quality trending over time

**Code Quality Service**
```typescript
interface CodeQualityService {
  // Metrics calculation
  calculateComplexityMetrics(fileId: string): Promise<ComplexityMetrics>;
  calculateMaintainabilityIndex(fileId: string): Promise<MaintainabilityMetrics>;
  analyzeCouplingCohesion(fileId: string): Promise<CouplingCohesionMetrics>;
  
  // Quality assessment
  assessCodeQuality(fileId: string): Promise<QualityAssessment>;
  detectCodeSmells(fileId: string): Promise<CodeSmell[]>;
  validateBestPractices(fileId: string): Promise<BestPracticeViolation[]>;
  
  // Technical debt
  calculateTechnicalDebt(repositoryId: string): Promise<TechnicalDebtReport>;
  identifyDebtHotspots(repositoryId: string): Promise<DebtHotspot[]>;
  prioritizeDebtItems(debt: TechnicalDebtReport): Promise<PrioritizedDebtItem[]>;
  
  // Trends and history
  getQualityTrends(repositoryId: string, timeRange: TimeRange): Promise<QualityTrend[]>;
  compareQualityMetrics(beforeId: string, afterId: string): Promise<QualityComparison>;
}

interface ComplexityMetrics {
  cyclomaticComplexity: number;
  cognitiveComplexity: number;
  halsteadMetrics: HalsteadMetrics;
  linesOfCode: {
    total: number;
    blank: number;
    comment: number;
    source: number;
  };
  nestingDepth: number;
  parameterCount: number;
}

interface QualityAssessment {
  overallScore: number; // 0-100
  maintainabilityIndex: number;
  testability: number;
  reliability: number;
  security: number;
  performance: number;
  recommendations: QualityRecommendation[];
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
}
```

**Code Smell Detection**
```typescript
interface CodeSmellDetector {
  // Common code smells
  detectLongMethods(ast: AST): Promise<LongMethodSmell[]>;
  detectLargeClasses(ast: AST): Promise<LargeClassSmell[]>;
  detectDuplicatedCode(repository: Repository): Promise<DuplicationSmell[]>;
  detectDeadCode(repository: Repository): Promise<DeadCodeSmell[]>;
  detectGodClasses(ast: AST): Promise<GodClassSmell[]>;
  
  // Language-specific smells
  detectLanguageSpecificSmells(ast: AST, language: string): Promise<CodeSmell[]>;
  
  // Custom rules
  applyCustomRules(ast: AST, rules: QualityRule[]): Promise<RuleViolation[]>;
}

enum CodeSmellType {
  LONG_METHOD = 'long_method',
  LARGE_CLASS = 'large_class',
  DUPLICATED_CODE = 'duplicated_code',
  DEAD_CODE = 'dead_code',
  GOD_CLASS = 'god_class',
  FEATURE_ENVY = 'feature_envy',
  DATA_CLUMPS = 'data_clumps',
  PRIMITIVE_OBSESSION = 'primitive_obsession'
}

interface CodeSmell {
  type: CodeSmellType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  location: SourceLocation;
  metrics: Record<string, number>;
  suggestions: string[];
  effort: number; // estimated hours to fix
  priority: number;
}
```

**Database Schema for Quality Metrics**
```sql
CREATE TABLE code_quality_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id UUID NOT NULL REFERENCES code_repositories(id) ON DELETE CASCADE,
  file_id UUID REFERENCES code_files(id) ON DELETE CASCADE,
  report_type VARCHAR(50) NOT NULL, -- file, repository, diff
  overall_score DECIMAL(5,2),
  maintainability_index DECIMAL(5,2),
  complexity_score DECIMAL(5,2),
  technical_debt_hours DECIMAL(8,2),
  code_smells_count INTEGER DEFAULT 0,
  violations_count INTEGER DEFAULT 0,
  test_coverage_percentage DECIMAL(5,2),
  metrics JSONB DEFAULT '{}',
  generated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE code_smells (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id UUID NOT NULL REFERENCES code_repositories(id) ON DELETE CASCADE,
  file_id UUID NOT NULL REFERENCES code_files(id) ON DELETE CASCADE,
  smell_type VARCHAR(50) NOT NULL,
  severity VARCHAR(20) NOT NULL,
  description TEXT NOT NULL,
  start_line INTEGER,
  end_line INTEGER,
  metrics JSONB DEFAULT '{}',
  suggestions JSONB DEFAULT '[]',
  effort_hours DECIMAL(5,2),
  priority_score INTEGER,
  status VARCHAR(20) DEFAULT 'open', -- open, acknowledged, fixed, wontfix
  detected_at TIMESTAMP DEFAULT NOW(),
  resolved_at TIMESTAMP
);

CREATE TABLE quality_trends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id UUID NOT NULL REFERENCES code_repositories(id) ON DELETE CASCADE,
  metric_name VARCHAR(100) NOT NULL,
  metric_value DECIMAL(10,4),
  commit_hash VARCHAR(40),
  measured_at TIMESTAMP DEFAULT NOW(),
  
  INDEX idx_quality_trends_repo_metric (repository_id, metric_name),
  INDEX idx_quality_trends_time (measured_at)
);
```

**Key Features**
- **Complexity Analysis**: Cyclomatic, cognitive, Halstead metrics
- **Code Smell Detection**: Automated detection of common issues
- **Technical Debt**: Quantified debt calculation and prioritization
- **Quality Scoring**: Overall quality assessment (A-F grades)
- **Trend Analysis**: Quality changes over time
- **Best Practices**: Language-specific rule validation

**Acceptance Criteria**
1. ✅ Complexity metrics calculation for all supported languages
2. ✅ Code smell detection with 90%+ accuracy
3. ✅ Technical debt quantification in hours
4. ✅ Quality score calculation (0-100 scale)
5. ✅ Quality trend tracking over time
6. ✅ Integration with search results (quality filtering)
7. ✅ Performance: 1000 LOC analysis in <2 seconds

---

### 2.4 Frontend Code Search Features

#### 2.4.1 Code Search Components

**Agent**: fullstack-feature-developer  
**Estimated Time**: 2 weeks  
**Priority**: High

**Description**  
Create specialized React components for code search with syntax highlighting, file navigation, symbol search, dependency visualization, and code diff viewing.

**Technical Requirements**
- Monaco Editor integration for syntax highlighting
- File tree navigation component
- Symbol search and navigation interface
- Dependency graph visualization
- Code diff and comparison viewer
- Responsive design for mobile code viewing

**Core Code Search Components**

```typescript
// Code Search Input with advanced syntax
interface CodeSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (query: CodeSearchQuery) => void;
  language?: string;
  repository?: string;
  placeholder?: string;
  suggestions?: CodeSearchSuggestion[];
  syntaxHighlighting?: boolean;
  autoComplete?: boolean;
  searchHistory?: string[];
}

export const CodeSearchInput: React.FC<CodeSearchInputProps> = ({
  value,
  onChange,
  onSubmit,
  suggestions = [],
  syntaxHighlighting = true,
  autoComplete = true,
  ...props
}) => {
  // Advanced search syntax support
  // repo:myrepo file:*.ts function:handleClick
  // lang:javascript class:Component
  // path:src/components/ symbols:export
};

// Code Result Card with syntax highlighting
interface CodeResultCardProps {
  result: CodeSearchResult;
  query: string;
  onNavigate: (location: CodeLocation) => void;
  onShowContext: (fileId: string, lineNumber: number) => void;
  highlightLines?: number[];
  showLineNumbers?: boolean;
  maxLines?: number;
}

export const CodeResultCard: React.FC<CodeResultCardProps> = ({
  result,
  query,
  onNavigate,
  highlightLines = [],
  showLineNumbers = true,
  maxLines = 10
}) => {
  // Monaco editor integration for syntax highlighting
  // Line highlighting for search matches
  // Code folding and expansion
  // Symbol navigation
  // Copy code functionality
};
```

**File Explorer Component**
```typescript
interface FileExplorerProps {
  repository: Repository;
  selectedPath?: string;
  onSelectFile: (filePath: string) => void;
  onExpandFolder: (folderPath: string) => void;
  searchQuery?: string;
  showOnlyMatches?: boolean;
  fileFilters?: FileFilter[];
}

export const FileExplorer: React.FC<FileExplorerProps> = ({
  repository,
  selectedPath,
  onSelectFile,
  searchQuery,
  showOnlyMatches = false
}) => {
  // Virtual scrolling for large repositories
  // File type icons and syntax highlighting
  // Search highlighting in file names
  // Folder collapsing/expanding
  // File statistics (size, last modified)
  // Right-click context menu
  
  return (
    <div className="file-explorer">
      <div className="explorer-header">
        <h3>{repository.name}</h3>
        <div className="explorer-controls">
          <button onClick={toggleView}>
            <Icon name={view === 'tree' ? 'list' : 'tree'} />
          </button>
        </div>
      </div>
      
      <div className="explorer-content">
        {view === 'tree' ? (
          <FileTree
            files={filteredFiles}
            selectedPath={selectedPath}
            onSelect={onSelectFile}
            onExpand={onExpandFolder}
            highlightQuery={searchQuery}
          />
        ) : (
          <FileList
            files={flatFiles}
            selectedPath={selectedPath}
            onSelect={onSelectFile}
            highlightQuery={searchQuery}
          />
        )}
      </div>
    </div>
  );
};
```

**Symbol Navigation Component**
```typescript
interface SymbolNavigatorProps {
  fileId: string;
  symbols: Symbol[];
  currentSymbol?: string;
  onSymbolSelect: (symbol: Symbol) => void;
  onJumpToDefinition: (symbol: Symbol) => void;
  onFindReferences: (symbol: Symbol) => void;
  groupByType?: boolean;
}

export const SymbolNavigator: React.FC<SymbolNavigatorProps> = ({
  symbols,
  currentSymbol,
  onSymbolSelect,
  onJumpToDefinition,
  onFindReferences,
  groupByType = true
}) => {
  const groupedSymbols = useMemo(() => {
    if (!groupByType) return { all: symbols };
    
    return symbols.reduce((groups, symbol) => {
      const type = symbol.type;
      if (!groups[type]) groups[type] = [];
      groups[type].push(symbol);
      return groups;
    }, {} as Record<string, Symbol[]>);
  }, [symbols, groupByType]);

  return (
    <div className="symbol-navigator">
      <div className="navigator-header">
        <h4>Symbols</h4>
        <div className="navigator-controls">
          <button onClick={() => setGroupByType(!groupByType)}>
            <Icon name={groupByType ? 'ungroup' : 'group'} />
          </button>
        </div>
      </div>
      
      <div className="navigator-content">
        {Object.entries(groupedSymbols).map(([type, typeSymbols]) => (
          <div key={type} className="symbol-group">
            {groupByType && (
              <div className="symbol-group-header">
                <Icon name={getSymbolTypeIcon(type)} />
                <span>{type}s ({typeSymbols.length})</span>
              </div>
            )}
            
            <div className="symbol-list">
              {typeSymbols.map(symbol => (
                <div
                  key={symbol.id}
                  className={`symbol-item ${currentSymbol === symbol.id ? 'active' : ''}`}
                  onClick={() => onSymbolSelect(symbol)}
                >
                  <Icon name={getSymbolIcon(symbol)} />
                  <span className="symbol-name">{symbol.name}</span>
                  <span className="symbol-signature">{symbol.signature}</span>
                  
                  <div className="symbol-actions">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onJumpToDefinition(symbol);
                      }}
                      title="Go to definition"
                    >
                      <Icon name="goto" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onFindReferences(symbol);
                      }}
                      title="Find references"
                    >
                      <Icon name="references" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
```

**Dependency Graph Visualization**
```typescript
interface DependencyGraphViewerProps {
  graph: DependencyGraph;
  focusNode?: string;
  onNodeSelect: (nodeId: string) => void;
  onNodeDoubleClick: (nodeId: string) => void;
  showLabels?: boolean;
  layoutType?: 'force' | 'circular' | 'hierarchical';
  filterOptions?: GraphFilterOptions;
}

export const DependencyGraphViewer: React.FC<DependencyGraphViewerProps> = ({
  graph,
  focusNode,
  onNodeSelect,
  layoutType = 'force',
  showLabels = true
}) => {
  // D3.js or vis.js integration for graph visualization
  // Node filtering and highlighting
  // Zoom and pan functionality
  // Legend and controls
  // Export options (PNG, SVG)
  
  const [selectedNodes, setSelectedNodes] = useState<string[]>([]);
  const [zoomLevel, setZoomLevel] = useState(1);
  
  return (
    <div className="dependency-graph-viewer">
      <div className="graph-controls">
        <div className="layout-controls">
          <label>Layout:</label>
          <select 
            value={layoutType} 
            onChange={(e) => setLayoutType(e.target.value as LayoutType)}
          >
            <option value="force">Force</option>
            <option value="circular">Circular</option>
            <option value="hierarchical">Hierarchical</option>
          </select>
        </div>
        
        <div className="view-controls">
          <button onClick={() => fitToScreen()}>
            <Icon name="fit" /> Fit to Screen
          </button>
          <button onClick={() => centerOnNode(focusNode)}>
            <Icon name="center" /> Center
          </button>
        </div>
        
        <div className="zoom-controls">
          <button onClick={() => zoomIn()}>
            <Icon name="plus" />
          </button>
          <span>{Math.round(zoomLevel * 100)}%</span>
          <button onClick={() => zoomOut()}>
            <Icon name="minus" />
          </button>
        </div>
      </div>
      
      <div className="graph-canvas" ref={canvasRef}>
        {/* D3.js visualization */}
      </div>
      
      <div className="graph-legend">
        <div className="legend-item">
          <div className="node-example internal"></div>
          <span>Internal Files</span>
        </div>
        <div className="legend-item">
          <div className="node-example external"></div>
          <span>External Packages</span>
        </div>
        <div className="legend-item">
          <div className="edge-example"></div>
          <span>Dependencies</span>
        </div>
      </div>
    </div>
  );
};
```

**Key Features**
- **Monaco Editor**: Full-featured code editor with syntax highlighting
- **File Navigation**: Virtual scrolling tree and list views
- **Symbol Search**: Symbol types, definitions, and references
- **Graph Visualization**: Interactive dependency graphs
- **Code Diff**: Side-by-side and inline diff views
- **Responsive**: Mobile-optimized code viewing

**Acceptance Criteria**
1. ✅ Monaco editor integration with syntax highlighting
2. ✅ File explorer with virtual scrolling for large repos
3. ✅ Symbol navigation with jump-to-definition
4. ✅ Interactive dependency graph visualization
5. ✅ Responsive design for mobile code viewing
6. ✅ Code search with advanced syntax support
7. ✅ Performance: <2s load time for large files

---

#### 2.4.2 Code Search Page & Navigation

**Agent**: fullstack-feature-developer  
**Estimated Time**: 2 weeks  
**Priority**: High

**Description**  
Implement dedicated code search experience with repository selector, advanced filtering, search syntax support, and deep linking to code locations.

**Technical Requirements**
- Repository selector and management
- Advanced code search filters (language, path, symbol type)
- Search syntax support (regex, glob patterns)
- Code search history and saved searches
- Deep linking to specific code lines
- Integration with main search interface

**Code Search Page Implementation**
```typescript
// Main Code Search Page
export default function CodeSearchPage({ searchParams }: CodeSearchPageProps) {
  const {
    query,
    repository,
    language,
    path,
    symbolType,
    page
  } = parseCodeSearchParams(searchParams);

  const {
    results,
    totalCount,
    isLoading,
    error,
    facets,
    performSearch,
    refineSearch
  } = useCodeSearch({
    initialQuery: query,
    initialRepository: repository,
    initialFilters: {
      language,
      path,
      symbolType
    }
  });

  return (
    <div className="code-search-page">
      <Head>
        <title>
          {query ? `"${query}" - Code Search` : 'Code Search'} - MCP Tools
        </title>
        <meta
          name="description"
          content={`Search code across ${repository || 'all repositories'}`}
        />
      </Head>

      <div className="search-header">
        <CodeSearchInput
          value={query}
          onChange={setQuery}
          onSubmit={performSearch}
          repository={repository}
          placeholder="Search code... (e.g., function:handleClick lang:typescript)"
        />
        
        <div className="search-stats">
          {totalCount > 0 && (
            <span>
              {totalCount.toLocaleString()} results
              {repository && ` in ${repository}`}
              {language && ` (${language})`}
            </span>
          )}
        </div>
      </div>

      <div className="search-body">
        <aside className="search-sidebar">
          <RepositorySelector
            selectedRepository={repository}
            onRepositoryChange={setRepository}
            availableRepositories={availableRepositories}
          />
          
          <CodeSearchFilters
            filters={{
              language,
              path,
              symbolType,
              fileType,
              dateRange,
              fileSize
            }}
            facets={facets}
            onChange={handleFiltersChange}
          />
          
          <SearchHistory
            recentSearches={recentCodeSearches}
            onSearchSelect={performSearch}
          />
        </aside>

        <main className="search-results">
          {isLoading ? (
            <CodeSearchLoading />
          ) : error ? (
            <CodeSearchError 
              error={error} 
              onRetry={performSearch}
            />
          ) : results.length === 0 ? (
            <CodeSearchEmpty 
              query={query}
              suggestions={getEmptyStateSuggestions(query)}
            />
          ) : (
            <>
              <div className="results-toolbar">
                <div className="view-controls">
                  <button
                    className={viewMode === 'list' ? 'active' : ''}
                    onClick={() => setViewMode('list')}
                  >
                    <Icon name="list" /> List
                  </button>
                  <button
                    className={viewMode === 'tree' ? 'active' : ''}
                    onClick={() => setViewMode('tree')}
                  >
                    <Icon name="tree" /> Tree
                  </button>
                </div>
                
                <div className="sort-controls">
                  <label>Sort by:</label>
                  <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                    <option value="relevance">Relevance</option>
                    <option value="path">File Path</option>
                    <option value="modified">Last Modified</option>
                    <option value="size">File Size</option>
                  </select>
                </div>
              </div>

              <div className={`results-content ${viewMode}`}>
                {results.map(result => (
                  <CodeResultCard
                    key={result.id}
                    result={result}
                    query={query}
                    onNavigate={handleNavigateToCode}
                    onShowContext={handleShowContext}
                  />
                ))}
              </div>

              <CodeSearchPagination
                currentPage={page}
                totalPages={Math.ceil(totalCount / RESULTS_PER_PAGE)}
                totalCount={totalCount}
                onPageChange={handlePageChange}
              />
            </>
          )}
        </main>
      </div>
    </div>
  );
}
```

**Advanced Code Search Filters**
```typescript
interface CodeSearchFiltersProps {
  filters: CodeSearchFilters;
  facets: SearchFacets;
  onChange: (filters: CodeSearchFilters) => void;
  onReset: () => void;
}

export const CodeSearchFilters: React.FC<CodeSearchFiltersProps> = ({
  filters,
  facets,
  onChange,
  onReset
}) => {
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);

  return (
    <div className="code-search-filters">
      <div className="filters-header">
        <h3>Filters</h3>
        <button onClick={onReset} className="reset-filters">
          Reset
        </button>
      </div>

      {/* Language Filter */}
      <div className="filter-group">
        <label>Language</label>
        <div className="filter-options">
          {facets.languages.map(({ language, count }) => (
            <label key={language} className="filter-checkbox">
              <input
                type="checkbox"
                checked={filters.languages?.includes(language)}
                onChange={(e) => {
                  const newLanguages = e.target.checked
                    ? [...(filters.languages || []), language]
                    : filters.languages?.filter(l => l !== language) || [];
                  onChange({ ...filters, languages: newLanguages });
                }}
              />
              <span>{language} ({count})</span>
            </label>
          ))}
        </div>
      </div>

      {/* Path Filter */}
      <div className="filter-group">
        <label>Path Pattern</label>
        <input
          type="text"
          placeholder="e.g., src/components/"
          value={filters.pathPattern || ''}
          onChange={(e) => onChange({ ...filters, pathPattern: e.target.value })}
        />
      </div>

      {/* Symbol Type Filter */}
      <div className="filter-group">
        <label>Symbol Type</label>
        <select
          value={filters.symbolType || ''}
          onChange={(e) => onChange({ ...filters, symbolType: e.target.value || undefined })}
        >
          <option value="">All Symbols</option>
          <option value="function">Functions</option>
          <option value="class">Classes</option>
          <option value="interface">Interfaces</option>
          <option value="variable">Variables</option>
          <option value="constant">Constants</option>
        </select>
      </div>

      {/* Advanced Filters */}
      <div className="advanced-filters">
        <button
          className="toggle-advanced"
          onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
        >
          <Icon name={isAdvancedOpen ? 'chevron-up' : 'chevron-down'} />
          Advanced Filters
        </button>

        {isAdvancedOpen && (
          <div className="advanced-content">
            {/* File Size Filter */}
            <div className="filter-group">
              <label>File Size</label>
              <div className="range-inputs">
                <input
                  type="number"
                  placeholder="Min KB"
                  value={filters.fileSizeMin || ''}
                  onChange={(e) => onChange({
                    ...filters,
                    fileSizeMin: e.target.value ? parseInt(e.target.value) : undefined
                  })}
                />
                <span>to</span>
                <input
                  type="number"
                  placeholder="Max KB"
                  value={filters.fileSizeMax || ''}
                  onChange={(e) => onChange({
                    ...filters,
                    fileSizeMax: e.target.value ? parseInt(e.target.value) : undefined
                  })}
                />
              </div>
            </div>

            {/* Date Range Filter */}
            <div className="filter-group">
              <label>Last Modified</label>
              <div className="date-inputs">
                <input
                  type="date"
                  value={filters.dateFrom || ''}
                  onChange={(e) => onChange({ ...filters, dateFrom: e.target.value || undefined })}
                />
                <span>to</span>
                <input
                  type="date"
                  value={filters.dateTo || ''}
                  onChange={(e) => onChange({ ...filters, dateTo: e.target.value || undefined })}
                />
              </div>
            </div>

            {/* Quality Score Filter */}
            <div className="filter-group">
              <label>Code Quality</label>
              <select
                value={filters.qualityThreshold || ''}
                onChange={(e) => onChange({
                  ...filters,
                  qualityThreshold: e.target.value ? parseFloat(e.target.value) : undefined
                })}
              >
                <option value="">Any Quality</option>
                <option value="0.8">High Quality (80%+)</option>
                <option value="0.6">Good Quality (60%+)</option>
                <option value="0.4">Fair Quality (40%+)</option>
              </select>
            </div>

            {/* Complexity Filter */}
            <div className="filter-group">
              <label>Complexity</label>
              <select
                value={filters.complexityLevel || ''}
                onChange={(e) => onChange({
                  ...filters,
                  complexityLevel: e.target.value || undefined
                })}
              >
                <option value="">Any Complexity</option>
                <option value="low">Low Complexity</option>
                <option value="medium">Medium Complexity</option>
                <option value="high">High Complexity</option>
              </select>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
```

**Code Search URL Management**
```typescript
interface CodeSearchParams {
  q?: string;           // Search query
  repo?: string;        // Repository ID or name
  lang?: string;        // Programming language
  path?: string;        // File path pattern
  symbol?: string;      // Symbol type
  file?: string;        // Specific file ID
  line?: string;        // Line number
  startLine?: string;   // Line range start
  endLine?: string;     // Line range end
  sort?: string;        // Sort order
  page?: string;        // Page number
  view?: string;        // View mode (list, tree)
}

const parseCodeSearchParams = (searchParams: any): CodeSearchState => {
  return {
    query: searchParams.q || '',
    repository: searchParams.repo,
    language: searchParams.lang,
    pathPattern: searchParams.path,
    symbolType: searchParams.symbol,
    fileId: searchParams.file,
    lineNumber: searchParams.line ? parseInt(searchParams.line) : undefined,
    lineRange: searchParams.startLine && searchParams.endLine
      ? [parseInt(searchParams.startLine), parseInt(searchParams.endLine)]
      : undefined,
    sortBy: searchParams.sort || 'relevance',
    page: searchParams.page ? parseInt(searchParams.page) : 1,
    viewMode: searchParams.view || 'list'
  };
};

// Deep linking to code locations
const generateCodeURL = (params: {
  repository: string;
  filePath: string;
  lineNumber?: number;
  lineRange?: [number, number];
  highlightQuery?: string;
}): string => {
  const urlParams = new URLSearchParams();
  urlParams.set('repo', params.repository);
  urlParams.set('file', params.filePath);
  
  if (params.lineNumber) {
    urlParams.set('line', params.lineNumber.toString());
  }
  
  if (params.lineRange) {
    urlParams.set('startLine', params.lineRange[0].toString());
    urlParams.set('endLine', params.lineRange[1].toString());
  }
  
  if (params.highlightQuery) {
    urlParams.set('highlight', params.highlightQuery);
  }

  return `/code/search?${urlParams.toString()}`;
};
```

**Key Features**
- **Repository Management**: Multi-repository search and selection
- **Advanced Filtering**: Language, path, symbol type, quality, complexity
- **Search Syntax**: Support for complex search queries with operators
- **Deep Linking**: Direct URLs to specific code lines and files
- **Search History**: Recent searches and saved search functionality
- **Integration**: Seamless integration with main search interface

**Acceptance Criteria**
1. ✅ Multi-repository search interface
2. ✅ Advanced search syntax with operators support
3. ✅ Deep linking to specific code locations
4. ✅ Search history and saved searches
5. ✅ Integration with main unified search
6. ✅ Mobile-responsive code search interface
7. ✅ URL state management for all search parameters

---

## Success Metrics

### Performance Targets
- **Code Parsing**: 1,000 lines/second
- **Symbol Extraction**: 95%+ accuracy
- **Search Response**: <500ms for symbol search
- **Repository Indexing**: 1M+ lines of code support
- **Dependency Analysis**: <30s for large repositories

### Quality Targets
- **Search Relevance**: 90%+ for code search queries  
- **Symbol Recognition**: 95%+ accuracy across languages
- **Dependency Detection**: 98%+ accuracy for imports/exports
- **Code Quality Assessment**: Correlation with manual review >80%

### User Experience Targets
- **Component Loading**: <2s for large files in Monaco editor
- **Graph Visualization**: <3s for dependency graphs (1000+ nodes)
- **Mobile Experience**: Full functionality on mobile devices
- **Accessibility**: WCAG 2.1 AA compliance

### Integration Targets
- **Language Support**: JavaScript/TS, Python, Go, Rust, Java
- **Repository Providers**: GitHub, GitLab, Bitbucket APIs
- **Version Control**: Git integration with webhook support
- **Security**: Vulnerability scanning integration

## Implementation Timeline

### Week 1-2: Foundation
- Repository Service Implementation (2.1.1)
- Database schema setup
- Git integration and webhook handling

### Week 3-4: Code Analysis
- Code Parser & AST Service (2.1.2)
- Multi-language parser integration
- Symbol extraction and indexing

### Week 5-6: Intelligence Features  
- Code Chunking Strategy (2.2.1)
- Code Embeddings & Semantic Search (2.2.2)
- Vector store integration

### Week 7-8: Advanced Analysis
- Dependency Analysis Service (2.3.1)  
- Code Quality & Metrics Service (2.3.2)
- Impact analysis and visualization

### Week 9-10: Frontend Implementation
- Code Search Components (2.4.1)
- Code Search Page & Navigation (2.4.2)
- Integration testing and optimization

## Dependencies

### Technical Dependencies
- **Phase 1 Completion**: Unified search infrastructure
- **Vector Store**: Qdrant with code-specific collections
- **Message Queue**: NATS for async processing
- **Database**: PostgreSQL with additional tables

### External Dependencies
- **Git Providers**: GitHub, GitLab, Bitbucket API access
- **Language Parsers**: Tree-sitter, Babel, TypeScript compiler
- **ML Models**: CodeBERT, GraphCodeBERT for embeddings
- **Visualization**: D3.js or vis.js for dependency graphs

### Team Dependencies
- **Backend Engineers**: 2-3 engineers for services and analysis
- **Frontend Engineers**: 1-2 engineers for React components  
- **DevOps Engineers**: 1 engineer for infrastructure and deployment

This comprehensive Phase 2 roadmap transforms the MCP Tools platform into a powerful code intelligence and search platform, enabling developers to understand, navigate, and analyze codebases at scale.