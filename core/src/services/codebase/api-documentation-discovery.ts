/**
 * API Documentation Discovery Service
 * 
 * Main service for analyzing repositories, discovering dependencies,
 * and recommending API documentation for indexing in the unified search system.
 */

import { DatabaseConnectionManager } from '../../utils/database.js';
import { validateInput } from '../../utils/validation.js';
import { DependencyAnalysisService } from './dependency-analysis-service.js';
import { DocumentationFetcherFactory } from './documentation-fetchers.js';
import type {
  RepositoryAnalysisInput,
  RepositoryAnalysisResult,
  PackageDiscoveryInput,
  PackageDependency,
  DiscoveredAPIDoc,
  APIDocumentationRecommendation,
  APIDocumentationSource,
  RecommendationStatus,
  DependencyType,
  APIDiscoveryError,
  RepositoryAnalysisInputSchema,
  PackageDiscoveryInputSchema
} from '../../shared/types/api-documentation.js';
import type { Kysely } from 'kysely';

interface DatabaseSchema {
  api_documentation_sources: any;
  discovered_api_docs: any;
  repository_api_recommendations: any;
  code_repositories: any;
}

export interface APIDocumentationDiscoveryConfig {
  database: DatabaseConnectionManager<DatabaseSchema>;
  maxConcurrentRequests?: number;
  defaultTimeout?: number;
  enableRateLimit?: boolean;
}

/**
 * Main API Documentation Discovery Service
 */
export class APIDocumentationDiscoveryService {
  private dependencyAnalyzer: DependencyAnalysisService;
  private documentationSources: Map<string, APIDocumentationSource> = new Map();
  private processingQueue = new Map<string, Promise<RepositoryAnalysisResult>>();

  constructor(private config: APIDocumentationDiscoveryConfig) {
    this.dependencyAnalyzer = new DependencyAnalysisService();
  }

  /**
   * Initialize the service by loading documentation sources
   */
  async initialize(): Promise<void> {
    console.log('🔄 Initializing API Documentation Discovery Service...');
    
    try {
      await this.loadDocumentationSources();
      console.log(`✅ Loaded ${this.documentationSources.size} documentation sources`);
    } catch (error) {
      console.error('❌ Failed to initialize API Documentation Discovery Service:', error);
      throw error;
    }
  }

  /**
   * Analyze a repository for API documentation opportunities
   */
  async analyzeRepositoryForAPIDocumentation(input: RepositoryAnalysisInput): Promise<RepositoryAnalysisResult> {
    const validatedInput = validateInput(RepositoryAnalysisInputSchema, input);
    const startTime = Date.now();

    // Prevent concurrent analysis of the same repository
    const existingAnalysis = this.processingQueue.get(validatedInput.repository_id);
    if (existingAnalysis && !validatedInput.force_refresh) {
      console.log(`📋 Returning existing analysis for repository ${validatedInput.repository_id}`);
      return existingAnalysis;
    }

    const analysisPromise = this.performRepositoryAnalysis(validatedInput, startTime);
    this.processingQueue.set(validatedInput.repository_id, analysisPromise);

    try {
      const result = await analysisPromise;
      return result;
    } finally {
      this.processingQueue.delete(validatedInput.repository_id);
    }
  }

  /**
   * Perform the actual repository analysis
   */
  private async performRepositoryAnalysis(
    input: RepositoryAnalysisInput, 
    startTime: number
  ): Promise<RepositoryAnalysisResult> {
    console.log(`🔍 Analyzing repository ${input.repository_id} for API documentation...`);

    try {
      // Get repository information
      const repository = await this.getRepository(input.repository_id);
      if (!repository) {
        throw new Error(`Repository ${input.repository_id} not found`);
      }

      // Analyze dependencies
      console.log(`📦 Analyzing dependencies in ${repository.path}...`);
      const dependencyAnalysis = await this.dependencyAnalyzer.analyzeRepository(repository.path);

      // Filter dependencies based on input criteria
      const filteredDependencies = this.filterDependencies(
        dependencyAnalysis.dependencies,
        input
      );

      console.log(`🎯 Found ${filteredDependencies.length} relevant dependencies from ${dependencyAnalysis.dependencies.length} total`);

      // Discover documentation for each dependency
      const recommendations: APIDocumentationRecommendation[] = [];
      const concurrencyLimit = this.config.maxConcurrentRequests || 5;
      
      for (let i = 0; i < filteredDependencies.length; i += concurrencyLimit) {
        const batch = filteredDependencies.slice(i, i + concurrencyLimit);
        const batchPromises = batch.map(dep => 
          this.discoverDocumentationForPackage(dep, input.repository_id)
        );
        
        const batchResults = await Promise.allSettled(batchPromises);
        
        for (const result of batchResults) {
          if (result.status === 'fulfilled' && result.value) {
            recommendations.push(result.value);
          } else if (result.status === 'rejected') {
            console.warn('Failed to process dependency:', result.reason);
          }
        }

        // Brief pause between batches to be respectful of external APIs
        if (i + concurrencyLimit < filteredDependencies.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      // Sort recommendations by priority
      const sortedRecommendations = recommendations.sort((a, b) => 
        (b.priority_score || 0) - (a.priority_score || 0)
      );

      // Limit to max recommendations
      const finalRecommendations = sortedRecommendations.slice(0, input.max_recommendations);

      // Calculate statistics
      const processingTime = Date.now() - startTime;
      const statistics = {
        total_dependencies: dependencyAnalysis.dependencies.length,
        dependencies_with_recommendations: finalRecommendations.length,
        high_confidence_recommendations: finalRecommendations.filter(r => r.usage_confidence >= 0.7).length,
        estimated_total_indexing_time: finalRecommendations.reduce((sum, r) => sum + (r.estimated_indexing_time || 0), 0),
        estimated_total_storage_mb: finalRecommendations.reduce((sum, r) => sum + (r.estimated_storage_mb || 0), 0),
        processing_time_ms: processingTime
      };

      console.log(`✅ Analysis complete for repository ${input.repository_id}:`);
      console.log(`   - ${statistics.total_dependencies} total dependencies`);
      console.log(`   - ${statistics.dependencies_with_recommendations} with recommendations`);
      console.log(`   - ${statistics.high_confidence_recommendations} high-confidence recommendations`);
      console.log(`   - ${Math.round(processingTime / 1000)}s processing time`);

      const result: RepositoryAnalysisResult = {
        repository_id: input.repository_id,
        dependencies: filteredDependencies,
        recommendations: finalRecommendations,
        statistics,
        analyzed_at: new Date().toISOString()
      };

      // Store results in database
      await this.storeAnalysisResults(result);

      return result;

    } catch (error) {
      console.error(`❌ Failed to analyze repository ${input.repository_id}:`, error);
      throw error;
    }
  }

  /**
   * Discover documentation for a specific package
   */
  async discoverDocumentationForPackage(
    dependency: PackageDependency, 
    repositoryId: string
  ): Promise<APIDocumentationRecommendation | null> {
    try {
      // Check if we already have this documentation cached
      const existingDoc = await this.findExistingDocumentation(dependency);
      
      let discoveredDoc: DiscoveredAPIDoc;
      
      if (existingDoc && this.isDocumentationFresh(existingDoc)) {
        discoveredDoc = existingDoc;
      } else {
        // Fetch fresh documentation
        const fetcher = DocumentationFetcherFactory.createFetcher(dependency.ecosystem, {
          timeout: this.config.defaultTimeout || 10000,
          retries: 3,
          rateLimit: this.config.enableRateLimit ? { requestsPerSecond: 5, burstLimit: 10 } : undefined
        });

        const fetchResult = await fetcher.fetchDocumentation(dependency);
        
        if (!fetchResult.success || !fetchResult.documentation) {
          console.warn(`⚠️  Failed to fetch documentation for ${dependency.name}:`, fetchResult.error?.message);
          return null;
        }

        // Get the appropriate source ID
        const source = this.getDocumentationSource(dependency.ecosystem);
        if (!source) {
          console.warn(`⚠️  No documentation source found for ecosystem: ${dependency.ecosystem}`);
          return null;
        }

        fetchResult.documentation.source_id = source.id;
        discoveredDoc = fetchResult.documentation;

        // Store the discovered documentation
        await this.storeDiscoveredDocumentation(discoveredDoc);
      }

      // Create recommendation
      const recommendation = this.createRecommendation(dependency, discoveredDoc, repositoryId);
      
      return recommendation;

    } catch (error) {
      console.error(`Failed to discover documentation for ${dependency.name}:`, error);
      return null;
    }
  }

  /**
   * Filter dependencies based on analysis criteria
   */
  private filterDependencies(
    dependencies: PackageDependency[], 
    input: RepositoryAnalysisInput
  ): PackageDependency[] {
    return dependencies.filter(dep => {
      // Filter by ecosystems if specified
      if (input.ecosystems.length > 0 && !input.ecosystems.includes(dep.ecosystem)) {
        return false;
      }

      // Filter by minimum confidence
      if (dep.usage_confidence < input.min_confidence) {
        return false;
      }

      // Skip test-only dependencies unless they're high confidence
      if (dep.type === 'test' && dep.usage_confidence < 0.8) {
        return false;
      }

      return true;
    });
  }

  /**
   * Create a documentation recommendation
   */
  private createRecommendation(
    dependency: PackageDependency,
    discoveredDoc: DiscoveredAPIDoc,
    repositoryId: string
  ): APIDocumentationRecommendation {
    const usageConfidence = this.calculateUsageConfidence(dependency);
    const priorityScore = this.calculatePriorityScore(dependency, discoveredDoc);
    const estimatedIndexingTime = this.estimateIndexingTime(discoveredDoc);
    const estimatedStorageMb = this.estimateStorageRequirements(discoveredDoc);

    return {
      id: crypto.randomUUID(),
      repository_id: repositoryId,
      discovered_doc_id: discoveredDoc.id,
      dependency_type: dependency.type,
      usage_confidence: usageConfidence,
      recommendation_reason: this.generateRecommendationReason(dependency, discoveredDoc),
      file_references: dependency.file_references,
      recommendation_status: 'recommended',
      estimated_indexing_time: estimatedIndexingTime,
      estimated_storage_mb: estimatedStorageMb,
      priority_score: priorityScore,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  }

  /**
   * Calculate usage confidence based on dependency analysis
   */
  private calculateUsageConfidence(dependency: PackageDependency): number {
    let confidence = dependency.usage_confidence;

    // Boost confidence for production dependencies
    if (dependency.type === 'production') {
      confidence *= 1.2;
    }

    // Boost confidence if we found actual usage
    if (dependency.file_references.length > 0) {
      confidence *= 1.1;
    }

    // Boost confidence if we found import statements
    if (dependency.import_statements.length > 0) {
      confidence *= 1.15;
    }

    // Penalize optional dependencies
    if (dependency.type === 'optional') {
      confidence *= 0.8;
    }

    return Math.min(1.0, confidence);
  }

  /**
   * Calculate priority score for indexing order
   */
  private calculatePriorityScore(dependency: PackageDependency, discoveredDoc: DiscoveredAPIDoc): number {
    let score = 0;

    // Base score from usage confidence
    score += dependency.usage_confidence * 0.4;

    // Health score contribution
    score += (discoveredDoc.health_score / 100) * 0.3;

    // Dependency type weighting
    const typeWeights: Record<DependencyType, number> = {
      production: 0.3,
      development: 0.1,
      test: 0.05,
      optional: 0.05,
      peer: 0.15,
      build: 0.1,
      plugin: 0.1
    };
    score += typeWeights[dependency.type] || 0;

    // Popularity boost from metadata
    if (discoveredDoc.metadata.popularity?.weekly_downloads) {
      const downloads = discoveredDoc.metadata.popularity.weekly_downloads;
      if (downloads > 100000) score += 0.1;
      else if (downloads > 10000) score += 0.05;
    }

    return Math.min(1.0, score);
  }

  /**
   * Generate human-readable recommendation reason
   */
  private generateRecommendationReason(dependency: PackageDependency, discoveredDoc: DiscoveredAPIDoc): string {
    const reasons = [];

    if (dependency.type === 'production') {
      reasons.push('Production dependency');
    }

    if (dependency.usage_confidence > 0.8) {
      reasons.push('High usage confidence');
    }

    if (discoveredDoc.health_score > 80) {
      reasons.push('High-quality documentation');
    }

    if (discoveredDoc.metadata.popularity?.weekly_downloads && discoveredDoc.metadata.popularity.weekly_downloads > 10000) {
      reasons.push('Popular package');
    }

    if (dependency.file_references.length > 1) {
      reasons.push(`Used in ${dependency.file_references.length} files`);
    }

    return reasons.join(', ') || 'Standard dependency recommendation';
  }

  /**
   * Estimate indexing time in minutes
   */
  private estimateIndexingTime(discoveredDoc: DiscoveredAPIDoc): number {
    let baseTime = 2; // Base 2 minutes per package

    // Adjust based on documentation quality
    if (discoveredDoc.health_score > 80) {
      baseTime *= 1.5; // More content to index
    }

    // Adjust based on package complexity (rough estimate)
    const apiCount = discoveredDoc.metadata.structure?.documented_apis || 10;
    baseTime += Math.min(apiCount / 10, 5); // Up to 5 additional minutes

    return Math.round(baseTime);
  }

  /**
   * Estimate storage requirements in MB
   */
  private estimateStorageRequirements(discoveredDoc: DiscoveredAPIDoc): number {
    let baseSizeMb = 1; // Base 1MB per package

    // Adjust based on documentation completeness
    if (discoveredDoc.metadata.structure?.has_api_reference) baseSizeMb += 2;
    if (discoveredDoc.metadata.structure?.has_examples) baseSizeMb += 1;
    if (discoveredDoc.metadata.structure?.has_getting_started) baseSizeMb += 0.5;

    // Adjust based on API count
    const apiCount = discoveredDoc.metadata.structure?.documented_apis || 10;
    baseSizeMb += Math.min(apiCount / 100, 3); // Up to 3MB for API docs

    return Math.round(baseSizeMb * 10) / 10; // Round to 1 decimal place
  }

  /**
   * Check if documentation is fresh enough to reuse
   */
  private isDocumentationFresh(doc: DiscoveredAPIDoc): boolean {
    if (!doc.last_scraped) return false;
    
    const lastScraped = new Date(doc.last_scraped);
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    
    return lastScraped > weekAgo;
  }

  // Database operations

  /**
   * Load documentation sources from database
   */
  private async loadDocumentationSources(): Promise<void> {
    const db = this.config.database.kysely;
    const sources = await db
      .selectFrom('api_documentation_sources')
      .selectAll()
      .where('is_active', '=', true)
      .execute();

    for (const source of sources) {
      this.documentationSources.set(source.name, {
        id: source.id,
        name: source.name,
        base_url: source.base_url,
        documentation_pattern: source.documentation_pattern,
        version_pattern: source.version_pattern,
        supported_languages: source.supported_languages,
        is_active: source.is_active,
        last_updated: source.last_updated
      });
    }
  }

  /**
   * Get documentation source for ecosystem
   */
  private getDocumentationSource(ecosystem: string): APIDocumentationSource | undefined {
    // Map ecosystem to source name
    const sourceMapping: Record<string, string> = {
      npm: 'npm',
      pypi: 'pypi',
      crates: 'docs.rs',
      go: 'golang.org',
      maven: 'maven',
      nuget: 'nuget'
    };

    const sourceName = sourceMapping[ecosystem];
    return sourceName ? this.documentationSources.get(sourceName) : undefined;
  }

  /**
   * Get repository information
   */
  private async getRepository(repositoryId: string): Promise<{ id: string; name: string; path: string } | null> {
    const db = this.config.database.kysely;
    const repository = await db
      .selectFrom('code_repositories')
      .select(['id', 'name', 'path'])
      .where('id', '=', repositoryId)
      .executeTakeFirst();

    return repository || null;
  }

  /**
   * Find existing documentation in database
   */
  private async findExistingDocumentation(dependency: PackageDependency): Promise<DiscoveredAPIDoc | null> {
    const db = this.config.database.kysely;
    const existing = await db
      .selectFrom('discovered_api_docs')
      .selectAll()
      .where('package_name', '=', dependency.name)
      .where('language', '=', this.getLanguageForEcosystem(dependency.ecosystem))
      .orderBy('created_at', 'desc')
      .executeTakeFirst();

    if (!existing) return null;

    return {
      id: existing.id,
      package_name: existing.package_name,
      package_version: existing.package_version,
      language: existing.language,
      source_id: existing.source_id,
      documentation_url: existing.documentation_url,
      api_reference_url: existing.api_reference_url || undefined,
      examples_url: existing.examples_url || undefined,
      changelog_url: existing.changelog_url || undefined,
      repository_url: existing.repository_url || undefined,
      health_score: existing.health_score,
      last_scraped: existing.last_scraped || undefined,
      scrape_status: existing.scrape_status,
      metadata: existing.metadata,
      created_at: existing.created_at
    };
  }

  /**
   * Store discovered documentation
   */
  private async storeDiscoveredDocumentation(doc: DiscoveredAPIDoc): Promise<void> {
    const db = this.config.database.kysely;
    
    await db
      .insertInto('discovered_api_docs')
      .values({
        id: doc.id,
        package_name: doc.package_name,
        package_version: doc.package_version,
        language: doc.language,
        source_id: doc.source_id,
        documentation_url: doc.documentation_url,
        api_reference_url: doc.api_reference_url,
        examples_url: doc.examples_url,
        changelog_url: doc.changelog_url,
        repository_url: doc.repository_url,
        health_score: doc.health_score,
        last_scraped: new Date().toISOString(),
        scrape_status: doc.scrape_status,
        metadata: JSON.stringify(doc.metadata),
        created_at: doc.created_at
      })
      .onConflict((oc) => 
        oc.columns(['package_name', 'package_version', 'language', 'source_id'])
          .doUpdateSet({
            health_score: doc.health_score,
            last_scraped: new Date().toISOString(),
            scrape_status: doc.scrape_status,
            metadata: JSON.stringify(doc.metadata)
          })
      )
      .execute();
  }

  /**
   * Store analysis results
   */
  private async storeAnalysisResults(result: RepositoryAnalysisResult): Promise<void> {
    const db = this.config.database.kysely;
    
    // Store recommendations
    for (const recommendation of result.recommendations) {
      await db
        .insertInto('repository_api_recommendations')
        .values({
          id: recommendation.id,
          repository_id: recommendation.repository_id,
          discovered_doc_id: recommendation.discovered_doc_id,
          dependency_type: recommendation.dependency_type,
          usage_confidence: recommendation.usage_confidence,
          recommendation_reason: recommendation.recommendation_reason,
          file_references: recommendation.file_references,
          recommendation_status: recommendation.recommendation_status,
          created_at: recommendation.created_at,
          updated_at: recommendation.updated_at
        })
        .onConflict((oc) =>
          oc.columns(['repository_id', 'discovered_doc_id'])
            .doUpdateSet({
              usage_confidence: recommendation.usage_confidence,
              recommendation_reason: recommendation.recommendation_reason,
              file_references: recommendation.file_references,
              updated_at: recommendation.updated_at
            })
        )
        .execute();
    }
  }

  /**
   * Map ecosystem to primary language
   */
  private getLanguageForEcosystem(ecosystem: string): string {
    const languageMapping: Record<string, string> = {
      npm: 'javascript',
      pypi: 'python',
      crates: 'rust',
      go: 'go',
      maven: 'java',
      nuget: 'csharp'
    };

    return languageMapping[ecosystem] || ecosystem;
  }

  /**
   * Get recommendations for a specific repository
   */
  async getRecommendationsForRepository(repositoryId: string, status?: string): Promise<APIDocumentationRecommendation[]> {
    const db = this.config.database.kysely;
    let query = db
      .selectFrom('repository_api_recommendations as rec')
      .innerJoin('discovered_api_docs as doc', 'rec.discovered_doc_id', 'doc.id')
      .select([
        'rec.id',
        'rec.repository_id',
        'rec.discovered_doc_id',
        'rec.dependency_type',
        'rec.usage_confidence',
        'rec.recommendation_reason',
        'rec.file_references',
        'rec.recommendation_status',
        'rec.estimated_indexing_time',
        'rec.estimated_storage_mb',
        'rec.created_at',
        'rec.updated_at',
        'doc.package_name',
        'doc.package_version',
        'doc.language',
        'doc.documentation_url',
        'doc.api_reference_url',
        'doc.examples_url',
        'doc.changelog_url',
        'doc.repository_url',
        'doc.health_score',
        'doc.metadata'
      ])
      .where('rec.repository_id', '=', repositoryId);

    if (status) {
      query = query.where('rec.recommendation_status', '=', status as RecommendationStatus);
    }

    const results = await query.execute();

    return results.map(row => ({
      id: row.id,
      packageName: row.package_name,
      packageVersion: row.package_version,
      language: row.language,
      documentationUrl: row.documentation_url,
      apiReferenceUrl: row.api_reference_url || undefined,
      examplesUrl: row.examples_url || undefined,
      changelogUrl: row.changelog_url || undefined,
      repositoryUrl: row.repository_url || undefined,
      healthScore: row.health_score,
      relevanceScore: 85, // Calculate based on usage confidence and health score
      recommendationReason: row.recommendation_reason,
      usageConfidence: row.usage_confidence,
      fileReferences: row.file_references,
      estimatedIndexingTime: row.estimated_indexing_time || 0,
      estimatedStorageSize: row.estimated_storage_mb || 0
    }));
  }

  /**
   * Update recommendation status
   */
  async updateRecommendationStatus(recommendationIds: string[], status: RecommendationStatus): Promise<void> {
    const db = this.config.database.kysely;
    await db
      .updateTable('repository_api_recommendations')
      .set({
        recommendation_status: status,
        updated_at: new Date().toISOString()
      })
      .where('id', 'in', recommendationIds)
      .execute();
  }

  /**
   * Get recommendations by IDs
   */
  async getRecommendationsByIds(recommendationIds: string[]): Promise<APIDocumentationRecommendation[]> {
    const db = this.config.database.kysely;
    const results = await db
      .selectFrom('repository_api_recommendations as rec')
      .innerJoin('discovered_api_docs as doc', 'rec.discovered_doc_id', 'doc.id')
      .select([
        'rec.id',
        'rec.repository_id',
        'rec.discovered_doc_id',
        'rec.dependency_type',
        'rec.usage_confidence',
        'rec.recommendation_reason',
        'rec.file_references',
        'rec.recommendation_status',
        'rec.estimated_indexing_time',
        'rec.estimated_storage_mb',
        'rec.created_at',
        'rec.updated_at',
        'doc.package_name',
        'doc.package_version',
        'doc.language',
        'doc.documentation_url',
        'doc.api_reference_url',
        'doc.examples_url',
        'doc.changelog_url',
        'doc.repository_url',
        'doc.health_score',
        'doc.metadata'
      ])
      .where('rec.id', 'in', recommendationIds)
      .execute();

    return results.map(row => ({
      id: row.id,
      packageName: row.package_name,
      packageVersion: row.package_version,
      language: row.language,
      documentationUrl: row.documentation_url,
      apiReferenceUrl: row.api_reference_url || undefined,
      examplesUrl: row.examples_url || undefined,
      changelogUrl: row.changelog_url || undefined,
      repositoryUrl: row.repository_url || undefined,
      healthScore: row.health_score,
      relevanceScore: 85, // Calculate based on usage confidence and health score
      recommendationReason: row.recommendation_reason,
      usageConfidence: row.usage_confidence,
      fileReferences: row.file_references,
      estimatedIndexingTime: row.estimated_indexing_time || 0,
      estimatedStorageSize: row.estimated_storage_mb || 0
    }));
  }
}