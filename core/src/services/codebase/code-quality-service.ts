/**
 * Code Quality Service
 * 
 * Main orchestrator for comprehensive code quality analysis including complexity metrics,
 * code smell detection, refactoring suggestions, quality gates, and trend analysis.
 */

import { 
  QualityMetrics,
  QualityAnalysisResult,
  RepositoryQualityResult,
  QualityDelta,
  QualityAnalysisOptions,
  RepositoryAnalysisOptions,
  QualityGate,
  QualityGateResult,
  QualityGateEvaluation,
  QualityGateStatus,
  QualityGateConfig,
  RefactoringSuggestion,
  EnhancedRefactoringSuggestion,
  RefactoringPriority,
  EffortEstimate,
  QualityTrend,
  QualityPrediction,
  TechnicalDebtMetrics,
  QualityScore,
  QualityComparison,
  CodeSmell,
  TimeRange,
  AST,
  SupportedLanguage,
  ComplexityMetrics,
  Severity,
  ComparisonOperator
} from '../../shared/types/codebase.js';
import { QualityMetricsCalculator } from './analysis/quality-metrics-calculator.js';
import { CodeSmellDetector } from './analysis/code-smell-detector.js';
import { CodeParserService } from './code-parser-service.js';
import { CodeChunkingService } from './code-chunking-service.js';
import { DatabaseManager } from '../../database/manager.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Comprehensive code quality analysis service
 */
export class CodeQualityService {
  private readonly db: DatabaseManager;
  private readonly parserService: CodeParserService;
  private readonly chunkingService: CodeChunkingService;
  private readonly metricsCalculator: QualityMetricsCalculator;
  
  constructor(
    db: DatabaseManager,
    parserService: CodeParserService,
    chunkingService: CodeChunkingService
  ) {
    this.db = db;
    this.parserService = parserService;
    this.chunkingService = chunkingService;
    this.metricsCalculator = new QualityMetricsCalculator();
  }
  
  // ===================
  // MAIN ANALYSIS METHODS
  // ===================
  
  /**
   * Analyze a single file for quality metrics and issues
   */
  async analyzeFile(fileId: string, options: QualityAnalysisOptions = {}): Promise<QualityAnalysisResult> {
    const startTime = Date.now();
    
    try {
      // Get file information
      const file = await this.db.getConnection()
        .selectFrom('code_files')
        .selectAll()
        .where('id', '=', fileId)
        .executeTakeFirst();
      
      if (!file) {
        throw new Error(`File not found: ${fileId}`);
      }
      
      const language = file.language as SupportedLanguage;
      const content = file.content || '';
      
      // Parse the file to get AST
      const parseResult = await this.parserService.parseFile(fileId, {
        includeComments: true,
        includeLocations: true
      });
      
      // Calculate metrics
      const metrics = await this.calculateFileMetrics(
        parseResult.ast, 
        content, 
        language,
        parseResult.complexityMetrics
      );
      
      // Detect code smells
      const smellDetector = new CodeSmellDetector(language);
      const codeSmells = await smellDetector.detectAllSmells(
        parseResult.ast,
        content,
        fileId,
        file.repository_id
      );
      
      // Generate refactoring suggestions
      const refactoringSuggestions = await this.generateRefactoringSuggestions(
        fileId,
        parseResult.ast,
        codeSmells,
        metrics
      );
      
      // Store results in database
      await this.storeQualityMetrics(fileId, file.repository_id, metrics, language);
      await this.storeCodeSmells(codeSmells);
      
      const analysisTime = Date.now() - startTime;
      
      return {
        fileId,
        repositoryId: file.repository_id,
        language,
        metrics,
        codeSmells,
        refactoringSuggestions,
        analysisTime,
        analysisDate: new Date(),
        version: '1.0',
        errors: parseResult.errors
      };
      
    } catch (error) {
      console.error(`Error analyzing file ${fileId}:`, error);
      
      return {
        fileId,
        repositoryId: '',
        language: SupportedLanguage.TYPESCRIPT, // Default fallback
        metrics: this.getDefaultMetrics(SupportedLanguage.TYPESCRIPT),
        codeSmells: [],
        refactoringSuggestions: [],
        analysisTime: Date.now() - startTime,
        analysisDate: new Date(),
        version: '1.0',
        errors: [{ type: 'analysis_error', message: error instanceof Error ? error.message : String(error) }]
      };
    }
  }
  
  /**
   * Analyze an entire repository for quality metrics
   */
  async analyzeRepository(
    repositoryId: string, 
    options: RepositoryAnalysisOptions = {}
  ): Promise<RepositoryQualityResult> {
    const startTime = Date.now();
    
    try {
      // Get all files in repository
      let query = this.db.getConnection()
        .selectFrom('code_files')
        .select(['id', 'file_path', 'language'])
        .where('repository_id', '=', repositoryId);
      
      // Apply filters
      if (options.languages) {
        query = query.where('language', 'in', options.languages);
      }
      
      if (options.includeFilePatterns) {
        for (const pattern of options.includeFilePatterns) {
          query = query.where('file_path', 'like', pattern);
        }
      }
      
      if (options.excludeFilePatterns) {
        for (const pattern of options.excludeFilePatterns) {
          query = query.where('file_path', 'not like', pattern);
        }
      }
      
      if (options.maxFilesToAnalyze) {
        query = query.limit(options.maxFilesToAnalyze);
      }
      
      const files = await query.execute();
      
      // Analyze files in parallel (with concurrency control)
      const concurrency = Math.min(options.maxConcurrency || 4, files.length);
      const fileResults: QualityAnalysisResult[] = [];
      
      for (let i = 0; i < files.length; i += concurrency) {
        const batch = files.slice(i, i + concurrency);
        const batchResults = await Promise.all(
          batch.map(file => this.analyzeFile(file.id, options))
        );
        fileResults.push(...batchResults);
      }
      
      // Calculate repository-wide metrics
      const overallMetrics = this.calculateRepositoryMetrics(fileResults);
      const aggregateMetrics = this.calculateAggregateMetrics(fileResults);
      
      // Evaluate quality gates if configured
      let qualityGateStatus: QualityGateEvaluation | undefined;
      try {
        qualityGateStatus = await this.evaluateQualityGates(repositoryId);
      } catch (error) {
        console.warn('Could not evaluate quality gates:', error);
      }
      
      // Record quality trends
      await this.recordQualityTrends(repositoryId, overallMetrics);
      
      const processingTime = Date.now() - startTime;
      
      return {
        repositoryId,
        overallMetrics,
        fileResults,
        aggregateMetrics,
        qualityGateStatus,
        analysisDate: new Date(),
        processingTime,
        version: '1.0'
      };
      
    } catch (error) {
      console.error(`Error analyzing repository ${repositoryId}:`, error);
      throw error;
    }
  }
  
  /**
   * Analyze changes between versions (delta analysis)
   */
  async analyzeChanges(repositoryId: string, changedFiles: string[]): Promise<QualityDelta> {
    try {
      // Get previous quality metrics
      const previousMetrics = await this.getLatestRepositoryMetrics(repositoryId);
      
      // Analyze only changed files
      const changedFileIds = await this.getFileIdsByPaths(repositoryId, changedFiles);
      const currentResults = await Promise.all(
        changedFileIds.map(fileId => this.analyzeFile(fileId))
      );
      
      // Calculate current metrics
      const currentMetrics = this.calculateRepositoryMetrics(currentResults);
      
      // Calculate delta
      const delta = this.calculateQualityDelta(previousMetrics, currentMetrics);
      
      // Identify new and resolved issues
      const { newIssues, resolvedIssues } = await this.compareCodeSmells(
        repositoryId, 
        changedFileIds
      );
      
      return {
        repositoryId,
        changedFiles,
        before: {
          overallQualityScore: previousMetrics?.overallQualityScore || 0,
          codeSmellsCount: previousMetrics?.codeSmellsCount || 0,
          technicalDebtMinutes: previousMetrics?.technicalDebtMinutes || 0,
          testCoverage: previousMetrics?.testCoverage || 0
        },
        after: {
          overallQualityScore: currentMetrics.overallQualityScore,
          codeSmellsCount: currentMetrics.codeSmellsCount,
          technicalDebtMinutes: currentMetrics.technicalDebtMinutes,
          testCoverage: currentMetrics.testCoverage
        },
        delta,
        impact: this.determineImpact(delta),
        newIssues,
        resolvedIssues,
        comparedAt: new Date()
      };
      
    } catch (error) {
      console.error(`Error analyzing changes for repository ${repositoryId}:`, error);
      throw error;
    }
  }
  
  // ===================
  // METRICS CALCULATION
  // ===================
  
  /**
   * Calculate comprehensive metrics for a file
   */
  async calculateFileMetrics(
    ast: AST, 
    content: string, 
    language: SupportedLanguage,
    complexityMetrics?: ComplexityMetrics
  ): Promise<QualityMetrics> {
    try {
      // Calculate basic complexity metrics
      const cyclomaticComplexity = await this.metricsCalculator.calculateCyclomaticComplexity(ast);
      const cognitiveComplexity = await this.metricsCalculator.calculateCognitiveComplexity(ast);
      const nestingDepth = await this.metricsCalculator.calculateNestingDepth(ast);
      
      // Calculate size metrics
      const sizeMetrics = await this.metricsCalculator.calculateLinesOfCode(content);
      
      // Calculate Halstead metrics
      const halsteadMetrics = await this.metricsCalculator.calculateHalsteadMetrics(ast);
      
      // Calculate maintainability index
      const maintainabilityIndex = await this.metricsCalculator.calculateMaintainabilityIndex(
        { cyclomaticComplexity, cognitiveComplexity, structuralComplexity: 0, nestingDepth: 0 },
        sizeMetrics,
        halsteadMetrics
      );
      
      // Create base metrics object
      const metrics: QualityMetrics = {
        // Complexity metrics
        cyclomaticComplexity,
        cognitiveComplexity,
        structuralComplexity: complexityMetrics?.cyclomaticComplexity || cyclomaticComplexity,
        nestingDepth,
        
        // Size metrics
        linesOfCode: sizeMetrics.linesOfCode,
        logicalLines: sizeMetrics.logicalLines,
        commentLines: sizeMetrics.commentLines,
        blankLines: sizeMetrics.blankLines,
        
        // Quality metrics
        maintainabilityIndex,
        technicalDebtMinutes: 0, // Will be calculated after smell detection
        codeSmellsCount: 0,      // Will be updated after smell detection
        
        // Security & performance (placeholder for now)
        securityHotspots: 0,
        performanceIssues: 0,
        
        // Coverage (would need integration with test frameworks)
        testCoverage: 0,
        branchCoverage: 0,
        
        // Additional metrics
        duplicatedLines: 0,
        bugs: 0,
        codeSmellsDebt: 0,
        vulnerabilities: 0,
        
        // Halstead metrics
        halsteadVolume: halsteadMetrics.volume,
        halsteadDifficulty: halsteadMetrics.difficulty,
        halsteadEffort: halsteadMetrics.effort,
        
        // Language
        language,
        
        // Composite scores (calculated at the end)
        overallQualityScore: 0,
        reliabilityRating: 'D',
        maintainabilityRating: 'D',
        securityRating: 'D'
      };
      
      // Apply language-specific adjustments
      const adjustments = await this.metricsCalculator.calculateLanguageSpecificAdjustments(
        metrics, 
        language
      );
      Object.assign(metrics, adjustments);
      
      // Calculate composite quality score
      metrics.overallQualityScore = await this.metricsCalculator.calculateCompositeScore(metrics);
      
      // Assign quality ratings
      metrics.reliabilityRating = this.metricsCalculator.getQualityRating(
        this.calculateReliabilityScore(metrics)
      );
      metrics.maintainabilityRating = this.metricsCalculator.getQualityRating(
        (metrics.maintainabilityIndex / 171) * 100
      );
      metrics.securityRating = this.metricsCalculator.getQualityRating(
        Math.max(0, 100 - metrics.securityHotspots * 10)
      );
      
      return metrics;
      
    } catch (error) {
      console.error('Error calculating file metrics:', error);
      return this.getDefaultMetrics(language);
    }
  }
  
  /**
   * Calculate repository-wide metrics from file results
   */
  private calculateRepositoryMetrics(fileResults: QualityAnalysisResult[]): QualityMetrics {
    if (fileResults.length === 0) {
      return this.getDefaultMetrics(SupportedLanguage.TYPESCRIPT);
    }
    
    // Aggregate metrics across all files
    const totals = fileResults.reduce((acc, result) => {
      const m = result.metrics;
      return {
        cyclomaticComplexity: acc.cyclomaticComplexity + m.cyclomaticComplexity,
        cognitiveComplexity: acc.cognitiveComplexity + m.cognitiveComplexity,
        linesOfCode: acc.linesOfCode + m.linesOfCode,
        logicalLines: acc.logicalLines + m.logicalLines,
        commentLines: acc.commentLines + m.commentLines,
        blankLines: acc.blankLines + m.blankLines,
        technicalDebtMinutes: acc.technicalDebtMinutes + m.technicalDebtMinutes,
        codeSmellsCount: acc.codeSmellsCount + m.codeSmellsCount,
        securityHotspots: acc.securityHotspots + m.securityHotspots,
        performanceIssues: acc.performanceIssues + m.performanceIssues,
        testCoverage: acc.testCoverage + m.testCoverage,
        branchCoverage: acc.branchCoverage + m.branchCoverage,
        duplicatedLines: acc.duplicatedLines + m.duplicatedLines,
        bugs: acc.bugs + m.bugs,
        vulnerabilities: acc.vulnerabilities + m.vulnerabilities,
        overallQualityScore: acc.overallQualityScore + m.overallQualityScore
      };
    }, {
      cyclomaticComplexity: 0,
      cognitiveComplexity: 0,
      linesOfCode: 0,
      logicalLines: 0,
      commentLines: 0,
      blankLines: 0,
      technicalDebtMinutes: 0,
      codeSmellsCount: 0,
      securityHotspots: 0,
      performanceIssues: 0,
      testCoverage: 0,
      branchCoverage: 0,
      duplicatedLines: 0,
      bugs: 0,
      vulnerabilities: 0,
      overallQualityScore: 0
    });
    
    const fileCount = fileResults.length;
    const mostCommonLanguage = this.getMostCommonLanguage(fileResults);
    
    // Calculate averages and weighted metrics
    const avgMaintainabilityIndex = fileResults.reduce((acc, r) => 
      acc + r.metrics.maintainabilityIndex, 0) / fileCount;
    
    const avgNestingDepth = fileResults.reduce((acc, r) => 
      acc + r.metrics.nestingDepth, 0) / fileCount;
    
    return {
      // Average complexity metrics
      cyclomaticComplexity: totals.cyclomaticComplexity / fileCount,
      cognitiveComplexity: totals.cognitiveComplexity / fileCount,
      structuralComplexity: totals.cyclomaticComplexity / fileCount, // Use cyclomatic as proxy
      nestingDepth: avgNestingDepth,
      
      // Sum totals for size metrics
      linesOfCode: totals.linesOfCode,
      logicalLines: totals.logicalLines,
      commentLines: totals.commentLines,
      blankLines: totals.blankLines,
      
      // Average maintainability
      maintainabilityIndex: avgMaintainabilityIndex,
      
      // Sum totals for issues
      technicalDebtMinutes: totals.technicalDebtMinutes,
      codeSmellsCount: totals.codeSmellsCount,
      securityHotspots: totals.securityHotspots,
      performanceIssues: totals.performanceIssues,
      
      // Average coverage
      testCoverage: totals.testCoverage / fileCount,
      branchCoverage: totals.branchCoverage / fileCount,
      
      // Sum totals
      duplicatedLines: totals.duplicatedLines,
      bugs: totals.bugs,
      codeSmellsDebt: totals.technicalDebtMinutes, // Same as technical debt
      vulnerabilities: totals.vulnerabilities,
      
      // Optional Halstead metrics (averaged)
      halsteadVolume: 0,
      halsteadDifficulty: 0,
      halsteadEffort: 0,
      
      // Average quality score
      overallQualityScore: totals.overallQualityScore / fileCount,
      
      // Calculate ratings based on overall scores
      reliabilityRating: this.metricsCalculator.getQualityRating(
        Math.max(0, 100 - (totals.bugs + totals.vulnerabilities) * 5)
      ),
      maintainabilityRating: this.metricsCalculator.getQualityRating(
        (avgMaintainabilityIndex / 171) * 100
      ),
      securityRating: this.metricsCalculator.getQualityRating(
        Math.max(0, 100 - totals.securityHotspots * 2)
      ),
      
      language: mostCommonLanguage
    };
  }
  
  /**
   * Calculate aggregate statistics
   */
  private calculateAggregateMetrics(fileResults: QualityAnalysisResult[]) {
    const languageBreakdown: Record<string, number> = {};
    let totalComplexity = 0;
    
    for (const result of fileResults) {
      const lang = result.language;
      languageBreakdown[lang] = (languageBreakdown[lang] || 0) + 1;
      totalComplexity += result.metrics.cyclomaticComplexity;
    }
    
    return {
      totalFiles: fileResults.length,
      totalLines: fileResults.reduce((sum, r) => sum + r.metrics.linesOfCode, 0),
      averageComplexity: fileResults.length > 0 ? totalComplexity / fileResults.length : 0,
      totalCodeSmells: fileResults.reduce((sum, r) => sum + r.codeSmells.length, 0),
      totalTechnicalDebt: fileResults.reduce((sum, r) => sum + r.metrics.technicalDebtMinutes, 0),
      languageBreakdown
    };
  }
  
  // ===================
  // REFACTORING SUGGESTIONS
  // ===================
  
  /**
   * Generate comprehensive refactoring suggestions
   */
  async generateRefactoringSuggestions(
    fileId: string,
    ast?: AST,
    codeSmells: CodeSmell[] = [],
    metrics?: QualityMetrics
  ): Promise<EnhancedRefactoringSuggestion[]> {
    const suggestions: EnhancedRefactoringSuggestion[] = [];
    
    try {
      // Get file content if AST not provided
      if (!ast) {
        const parseResult = await this.parserService.parseFile(fileId);
        ast = parseResult.ast;
      }
      
      // Generate suggestions based on code smells
      for (const smell of codeSmells) {
        const suggestion = await this.generateSmellBasedSuggestion(smell, ast);
        if (suggestion) {
          suggestions.push(suggestion);
        }
      }
      
      // Generate suggestions based on metrics
      if (metrics) {
        const metricSuggestions = await this.generateMetricBasedSuggestions(fileId, metrics, ast);
        suggestions.push(...metricSuggestions);
      }
      
      // Sort by priority and impact
      return suggestions.sort((a, b) => {
        const priorityOrder = { 'critical': 4, 'high': 3, 'medium': 2, 'low': 1 };
        const aPriority = priorityOrder[a.priority];
        const bPriority = priorityOrder[b.priority];
        
        if (aPriority !== bPriority) {
          return bPriority - aPriority;
        }
        
        const impactOrder = { 'critical': 4, 'high': 3, 'medium': 2, 'low': 1 };
        const aImpact = impactOrder[a.impact];
        const bImpact = impactOrder[b.impact];
        
        return bImpact - aImpact;
      });
      
    } catch (error) {
      console.error('Error generating refactoring suggestions:', error);
      return [];
    }
  }
  
  /**
   * Prioritize refactoring suggestions based on multiple factors
   */
  async prioritizeRefactoring(repositoryId: string): Promise<RefactoringPriority[]> {
    try {
      // Get all refactoring suggestions for repository
      const suggestions = await this.getRefactoringSuggestions(repositoryId);
      
      const priorities: RefactoringPriority[] = [];
      
      for (const suggestion of suggestions) {
        const priority = await this.calculateRefactoringPriority(suggestion);
        priorities.push(priority);
      }
      
      return priorities.sort((a, b) => b.score - a.score);
      
    } catch (error) {
      console.error('Error prioritizing refactoring:', error);
      return [];
    }
  }
  
  /**
   * Estimate effort for refactoring suggestions
   */
  async estimateRefactoringEffort(suggestions: RefactoringSuggestion[]): Promise<EffortEstimate> {
    const totalMinutes = suggestions.reduce((sum, s) => sum + s.estimatedEffort, 0);
    
    // Break down effort by category
    const analysisTime = Math.ceil(totalMinutes * 0.2); // 20% analysis
    const implementationTime = Math.ceil(totalMinutes * 0.5); // 50% implementation
    const testingTime = Math.ceil(totalMinutes * 0.2); // 20% testing
    const reviewTime = Math.ceil(totalMinutes * 0.1); // 10% review
    
    // Calculate confidence based on suggestion quality
    const confidence = suggestions.length > 0 
      ? suggestions.reduce((sum, s) => sum + s.confidenceScore, 0) / suggestions.length
      : 0.5;
    
    // Risk multiplier based on complexity
    const avgComplexity = suggestions.reduce((sum, s) => {
      const complexityScore = s.impact === 'critical' ? 4 : s.impact === 'high' ? 3 : 
                            s.impact === 'medium' ? 2 : 1;
      return sum + complexityScore;
    }, 0) / Math.max(1, suggestions.length);
    
    const riskMultiplier = 1 + (avgComplexity - 1) * 0.3;
    
    return {
      totalMinutes: Math.ceil(totalMinutes * riskMultiplier),
      breakdown: {
        analysis: analysisTime,
        implementation: implementationTime,
        testing: testingTime,
        review: reviewTime
      },
      confidence,
      riskMultiplier,
      complexity: avgComplexity > 3 ? 'VERY_HIGH' : avgComplexity > 2.5 ? 'HIGH' : 
                 avgComplexity > 1.5 ? 'MEDIUM' : 'LOW',
      assumptions: [
        'Developer is familiar with the codebase',
        'Adequate test coverage exists',
        'No major architectural changes required'
      ],
      dependencies: [],
      estimatedAt: new Date()
    };
  }
  
  // ===================
  // QUALITY GATES
  // ===================
  
  /**
   * Evaluate quality gates for a repository
   */
  async evaluateQualityGates(repositoryId: string): Promise<QualityGateEvaluation> {
    try {
      // Get configured quality gates
      const gates = await this.db.getConnection()
        .selectFrom('quality_gates')
        .selectAll()
        .where('repository_id', '=', repositoryId)
        .where('is_active', '=', true)
        .execute();
      
      if (gates.length === 0) {
        // Return default passing status if no gates configured
        return {
          repositoryId,
          overallStatus: 'PASSED',
          gateResults: [],
          blockerIssues: 0,
          criticalIssues: 0,
          majorIssues: 0,
          minorIssues: 0,
          evaluatedAt: new Date(),
          processingTime: 0,
          canDeploy: true
        };
      }
      
      // Get latest repository metrics
      const metrics = await this.getLatestRepositoryMetrics(repositoryId);
      
      if (!metrics) {
        throw new Error('No metrics available for quality gate evaluation');
      }
      
      // Evaluate each gate
      const gateResults: QualityGateResult[] = [];
      let blockerIssues = 0;
      let criticalIssues = 0;
      let majorIssues = 0;
      let minorIssues = 0;
      
      for (const gate of gates) {
        const result = this.evaluateIndividualGate(gate, metrics);
        gateResults.push(result);
        
        if (result.status === 'FAILED') {
          if (gate.is_blocking) {
            blockerIssues++;
          } else {
            switch (gate.severity) {
              case Severity.CRITICAL:
                criticalIssues++;
                break;
              case Severity.MAJOR:
                majorIssues++;
                break;
              case Severity.MINOR:
                minorIssues++;
                break;
            }
          }
        }
      }
      
      // Determine overall status
      const overallStatus = blockerIssues > 0 ? 'FAILED' : 'PASSED';
      const canDeploy = blockerIssues === 0;
      
      return {
        repositoryId,
        overallStatus,
        gateResults,
        blockerIssues,
        criticalIssues,
        majorIssues,
        minorIssues,
        evaluatedAt: new Date(),
        processingTime: 0,
        canDeploy
      };
      
    } catch (error) {
      console.error('Error evaluating quality gates:', error);
      
      return {
        repositoryId,
        overallStatus: 'ERROR',
        gateResults: [],
        blockerIssues: 0,
        criticalIssues: 0,
        majorIssues: 0,
        minorIssues: 0,
        evaluatedAt: new Date(),
        processingTime: 0,
        canDeploy: false
      };
    }
  }
  
  /**
   * Configure a quality gate
   */
  async configureQualityGate(repositoryId: string, config: QualityGateConfig): Promise<QualityGate> {
    const gate: QualityGate = {
      id: uuidv4(),
      repositoryId,
      ...config,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    await this.db.getConnection()
      .insertInto('quality_gates')
      .values({
        id: gate.id,
        repository_id: gate.repositoryId,
        gate_name: gate.gateName,
        metric_name: gate.metricName,
        operator: gate.operator,
        threshold_value: gate.thresholdValue,
        is_blocking: gate.isBlocking,
        severity: gate.severity,
        is_active: gate.isActive,
        description: gate.description || null,
        created_at: gate.createdAt,
        updated_at: gate.updatedAt
      })
      .execute();
    
    return gate;
  }
  
  /**
   * Get quality gate status
   */
  async getQualityGateStatus(repositoryId: string): Promise<QualityGateStatus> {
    try {
      const evaluation = await this.evaluateQualityGates(repositoryId);
      
      const blockers = evaluation.gateResults
        .filter(r => r.status === 'FAILED' && evaluation.blockerIssues > 0)
        .map(r => `${r.gateName}: ${r.message || 'Failed'}`);
      
      const warnings = evaluation.gateResults
        .filter(r => r.status === 'FAILED' && evaluation.blockerIssues === 0)
        .map(r => `${r.gateName}: ${r.message || 'Failed'}`);
      
      return {
        repositoryId,
        status: evaluation.overallStatus === 'PASSED' ? 'PASSED' : 'FAILED',
        gates: evaluation.gateResults,
        blockers,
        warnings,
        canProceed: evaluation.canDeploy,
        lastEvaluation: evaluation.evaluatedAt
      };
      
    } catch (error) {
      console.error('Error getting quality gate status:', error);
      
      return {
        repositoryId,
        status: 'ERROR',
        gates: [],
        blockers: [],
        warnings: ['Error evaluating quality gates'],
        canProceed: false,
        message: error instanceof Error ? error.message : String(error),
        lastEvaluation: new Date()
      };
    }
  }
  
  // ===================
  // TREND ANALYSIS
  // ===================
  
  /**
   * Record quality trends for historical analysis
   */
  async recordQualityTrends(repositoryId: string, metrics?: QualityMetrics): Promise<void> {
    if (!metrics) {
      metrics = await this.getLatestRepositoryMetrics(repositoryId);
      if (!metrics) return;
    }
    
    const trends = [
      { metric_name: 'overall_quality_score', metric_value: metrics.overallQualityScore },
      { metric_name: 'cyclomatic_complexity', metric_value: metrics.cyclomaticComplexity },
      { metric_name: 'technical_debt_minutes', metric_value: metrics.technicalDebtMinutes },
      { metric_name: 'test_coverage', metric_value: metrics.testCoverage },
      { metric_name: 'code_smells_count', metric_value: metrics.codeSmellsCount },
      { metric_name: 'maintainability_index', metric_value: metrics.maintainabilityIndex },
      { metric_name: 'lines_of_code', metric_value: metrics.linesOfCode },
      { metric_name: 'security_hotspots', metric_value: metrics.securityHotspots }
    ];
    
    await this.db.getConnection()
      .insertInto('quality_trends')
      .values(trends.map(trend => ({
        id: uuidv4(),
        repository_id: repositoryId,
        metric_name: trend.metric_name,
        metric_value: trend.metric_value,
        recorded_at: new Date(),
        file_count: null,
        total_loc: metrics!.linesOfCode
      })))
      .execute();
  }
  
  /**
   * Get quality trends for a time range
   */
  async getQualityTrends(repositoryId: string, timeRange: TimeRange): Promise<QualityTrend[]> {
    const { startDate, endDate } = this.getDateRange(timeRange);
    
    const trends = await this.db.getConnection()
      .selectFrom('quality_trends')
      .select(['metric_name', 'metric_value', 'recorded_at'])
      .where('repository_id', '=', repositoryId)
      .where('recorded_at', '>=', startDate)
      .where('recorded_at', '<=', endDate)
      .orderBy('recorded_at', 'asc')
      .execute();
    
    // Group by metric name
    const metricGroups = new Map<string, typeof trends>();
    for (const trend of trends) {
      const metricName = trend.metric_name;
      if (!metricGroups.has(metricName)) {
        metricGroups.set(metricName, []);
      }
      metricGroups.get(metricName)!.push(trend);
    }
    
    // Calculate trends for each metric
    const qualityTrends: QualityTrend[] = [];
    for (const [metricName, data] of metricGroups.entries()) {
      if (data.length < 2) continue; // Need at least 2 points for trend
      
      const dataPoints = data.map(d => ({
        timestamp: new Date(d.recorded_at),
        metricName: d.metric_name,
        value: d.metric_value,
        repositoryId
      }));
      
      const trend = this.calculateTrend(dataPoints);
      const changeRate = this.calculateChangeRate(dataPoints);
      
      qualityTrends.push({
        repositoryId,
        metricName,
        dataPoints,
        trend,
        changeRate,
        confidence: this.calculateTrendConfidence(dataPoints),
        startDate,
        endDate
      });
    }
    
    return qualityTrends;
  }
  
  /**
   * Predict quality trend
   */
  async predictQualityTrend(repositoryId: string): Promise<QualityPrediction> {
    // Get recent trends
    const recentTrends = await this.getQualityTrends(repositoryId, TimeRange.LAST_MONTH);
    
    // For now, return a simple linear extrapolation
    // In practice, you'd use more sophisticated ML models
    const primaryMetric = recentTrends.find(t => t.metricName === 'overall_quality_score');
    
    if (!primaryMetric || primaryMetric.dataPoints.length < 3) {
      throw new Error('Insufficient data for quality prediction');
    }
    
    const currentValue = primaryMetric.dataPoints[primaryMetric.dataPoints.length - 1].value;
    const changeRate = primaryMetric.changeRate;
    
    // Generate predictions for next 30 days
    const predictedValues = [];
    const now = new Date();
    
    for (let days = 1; days <= 30; days++) {
      const futureDate = new Date(now);
      futureDate.setDate(now.getDate() + days);
      
      const predictedValue = Math.max(0, Math.min(100, currentValue + (changeRate * days)));
      const confidence = Math.max(0.1, 0.9 - (days * 0.02)); // Confidence decreases over time
      
      predictedValues.push({
        timestamp: futureDate,
        value: predictedValue,
        confidence
      });
    }
    
    return {
      repositoryId,
      metricName: 'overall_quality_score',
      currentValue,
      predictedValues,
      model: 'linear_extrapolation',
      accuracy: primaryMetric.confidence,
      predictionHorizon: '30_days',
      generatedAt: new Date()
    };
  }
  
  // ===================
  // COMPARISON & BENCHMARKING
  // ===================
  
  /**
   * Compare quality between versions
   */
  async compareQuality(repositoryId: string, baseRef?: string): Promise<QualityComparison> {
    const currentScore = await this.calculateQualityScore(repositoryId);
    let baselineScore: QualityScore;
    
    if (baseRef) {
      // Get metrics for specific reference
      baselineScore = await this.getQualityScoreForRef(repositoryId, baseRef);
    } else {
      // Get metrics from 30 days ago as baseline
      baselineScore = await this.getHistoricalQualityScore(repositoryId, 30);
    }
    
    const improvement = currentScore.overallScore - baselineScore.overallScore;
    const degradation = improvement < 0 ? Math.abs(improvement) : 0;
    const netChange = improvement;
    
    // Identify significant changes
    const significantChanges = [];
    for (const [component, currentValue] of Object.entries(currentScore.components)) {
      const baselineValue = baselineScore.components[component as keyof typeof baselineScore.components];
      const change = currentValue - baselineValue;
      
      if (Math.abs(change) > 5) { // Threshold for significance
        significantChanges.push({
          metric: component,
          oldValue: baselineValue,
          newValue: currentValue,
          change,
          isImprovement: change > 0
        });
      }
    }
    
    return {
      repositoryId,
      baselineScore,
      currentScore,
      improvement: Math.max(0, improvement),
      degradation,
      netChange,
      significantChanges,
      comparisonDate: new Date(),
      baseReference: baseRef
    };
  }
  
  // ===================
  // PRIVATE HELPER METHODS
  // ===================
  
  /**
   * Store quality metrics in database
   */
  private async storeQualityMetrics(
    fileId: string, 
    repositoryId: string, 
    metrics: QualityMetrics,
    language: SupportedLanguage
  ): Promise<void> {
    await this.db.getConnection()
      .insertInto('code_quality_metrics')
      .values({
        id: uuidv4(),
        file_id: fileId,
        repository_id: repositoryId,
        analysis_timestamp: new Date(),
        cyclomatic_complexity: metrics.cyclomaticComplexity,
        cognitive_complexity: metrics.cognitiveComplexity,
        structural_complexity: metrics.structuralComplexity,
        nesting_depth: metrics.nestingDepth,
        lines_of_code: metrics.linesOfCode,
        logical_lines: metrics.logicalLines,
        comment_lines: metrics.commentLines,
        blank_lines: metrics.blankLines,
        maintainability_index: metrics.maintainabilityIndex,
        technical_debt_minutes: metrics.technicalDebtMinutes,
        code_smells_count: metrics.codeSmellsCount,
        security_hotspots: metrics.securityHotspots,
        performance_issues: metrics.performanceIssues,
        test_coverage: metrics.testCoverage,
        branch_coverage: metrics.branchCoverage,
        overall_quality_score: metrics.overallQualityScore,
        reliability_rating: metrics.reliabilityRating,
        maintainability_rating: metrics.maintainabilityRating,
        security_rating: metrics.securityRating,
        language: language
      })
      .onConflict(oc => oc.column('file_id').doUpdateSet({
        analysis_timestamp: new Date(),
        cyclomatic_complexity: metrics.cyclomaticComplexity,
        cognitive_complexity: metrics.cognitiveComplexity,
        overall_quality_score: metrics.overallQualityScore
      }))
      .execute();
  }
  
  /**
   * Store code smells in database
   */
  private async storeCodeSmells(codeSmells: CodeSmell[]): Promise<void> {
    if (codeSmells.length === 0) return;
    
    await this.db.getConnection()
      .insertInto('code_smells')
      .values(codeSmells.map(smell => ({
        id: smell.id,
        file_id: smell.fileId,
        repository_id: smell.repositoryId,
        smell_type: smell.smellType,
        severity: smell.severity,
        title: smell.title,
        description: smell.description,
        start_line: smell.startLine,
        end_line: smell.endLine || null,
        start_column: smell.startColumn || null,
        end_column: smell.endColumn || null,
        effort_minutes: smell.effortMinutes,
        rule_key: smell.ruleKey || null,
        suggested_fix: smell.suggestedFix || null,
        is_resolved: smell.isResolved,
        resolved_by: smell.resolvedBy || null,
        resolved_at: smell.resolvedAt || null,
        detected_at: smell.detectedAt
      })))
      .onConflict(oc => oc.column('id').doNothing())
      .execute();
  }
  
  /**
   * Get default metrics for a language
   */
  private getDefaultMetrics(language: SupportedLanguage): QualityMetrics {
    return {
      cyclomaticComplexity: 1,
      cognitiveComplexity: 0,
      structuralComplexity: 1,
      nestingDepth: 0,
      linesOfCode: 0,
      logicalLines: 0,
      commentLines: 0,
      blankLines: 0,
      maintainabilityIndex: 171,
      technicalDebtMinutes: 0,
      codeSmellsCount: 0,
      securityHotspots: 0,
      performanceIssues: 0,
      testCoverage: 0,
      branchCoverage: 0,
      overallQualityScore: 100,
      reliabilityRating: 'A',
      maintainabilityRating: 'A',
      securityRating: 'A',
      duplicatedLines: 0,
      bugs: 0,
      codeSmellsDebt: 0,
      vulnerabilities: 0,
      language
    };
  }
  
  /**
   * Calculate reliability score from metrics
   */
  private calculateReliabilityScore(metrics: QualityMetrics): number {
    const bugScore = Math.max(0, 100 - metrics.bugs * 10);
    const vulnerabilityScore = Math.max(0, 100 - metrics.vulnerabilities * 15);
    const complexityScore = Math.max(0, 100 - (metrics.cyclomaticComplexity - 1) * 5);
    
    return (bugScore + vulnerabilityScore + complexityScore) / 3;
  }
  
  /**
   * Get most common language from file results
   */
  private getMostCommonLanguage(fileResults: QualityAnalysisResult[]): SupportedLanguage {
    const languageCounts = new Map<SupportedLanguage, number>();
    
    for (const result of fileResults) {
      languageCounts.set(result.language, (languageCounts.get(result.language) || 0) + 1);
    }
    
    let mostCommon = SupportedLanguage.TYPESCRIPT;
    let maxCount = 0;
    
    for (const [language, count] of languageCounts.entries()) {
      if (count > maxCount) {
        mostCommon = language;
        maxCount = count;
      }
    }
    
    return mostCommon;
  }
  
  /**
   * Placeholder methods that would need full implementation
   */
  private async getLatestRepositoryMetrics(repositoryId: string): Promise<QualityMetrics | null> {
    // Implementation would query database for latest metrics
    return null;
  }
  
  private async getFileIdsByPaths(repositoryId: string, paths: string[]): Promise<string[]> {
    const files = await this.db.getConnection()
      .selectFrom('code_files')
      .select('id')
      .where('repository_id', '=', repositoryId)
      .where('file_path', 'in', paths)
      .execute();
    
    return files.map(f => f.id);
  }
  
  private calculateQualityDelta(
    previous: QualityMetrics | null, 
    current: QualityMetrics
  ): {
    qualityScoreChange: number;
    codeSmellsChange: number;
    technicalDebtChange: number;
    coverageChange: number;
  } {
    if (!previous) {
      return {
        qualityScoreChange: current.overallQualityScore,
        codeSmellsChange: current.codeSmellsCount,
        technicalDebtChange: current.technicalDebtMinutes,
        coverageChange: current.testCoverage
      };
    }
    
    return {
      qualityScoreChange: current.overallQualityScore - previous.overallQualityScore,
      codeSmellsChange: current.codeSmellsCount - previous.codeSmellsCount,
      technicalDebtChange: current.technicalDebtMinutes - previous.technicalDebtMinutes,
      coverageChange: current.testCoverage - previous.testCoverage
    };
  }
  
  private determineImpact(delta: any): 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL' {
    const totalChange = delta.qualityScoreChange - (delta.codeSmellsChange * 2) + 
                       delta.coverageChange - (delta.technicalDebtChange / 60);
    
    if (totalChange > 5) return 'POSITIVE';
    if (totalChange < -5) return 'NEGATIVE';
    return 'NEUTRAL';
  }
  
  private async compareCodeSmells(repositoryId: string, fileIds: string[]): Promise<{
    newIssues: CodeSmell[];
    resolvedIssues: CodeSmell[];
  }> {
    // Implementation would compare current vs previous smells
    return { newIssues: [], resolvedIssues: [] };
  }
  
  private async generateSmellBasedSuggestion(smell: CodeSmell, ast: AST): Promise<EnhancedRefactoringSuggestion | null> {
    // Implementation would generate specific suggestions based on smell type
    return null;
  }
  
  private async generateMetricBasedSuggestions(
    fileId: string, 
    metrics: QualityMetrics, 
    ast: AST
  ): Promise<EnhancedRefactoringSuggestion[]> {
    // Implementation would generate suggestions based on metric thresholds
    return [];
  }
  
  private async getRefactoringSuggestions(repositoryId: string): Promise<RefactoringSuggestion[]> {
    // Implementation would query stored suggestions
    return [];
  }
  
  private async calculateRefactoringPriority(suggestion: RefactoringSuggestion): Promise<RefactoringPriority> {
    // Implementation would calculate priority scores based on multiple factors
    return {
      suggestionId: suggestion.id,
      priority: suggestion.priority,
      score: 50,
      factors: {
        businessValue: 5,
        technicalImpact: 5,
        riskLevel: 5,
        effortRequired: 5,
        urgency: 5
      },
      reasoning: 'Placeholder priority calculation',
      calculatedAt: new Date()
    };
  }
  
  private evaluateIndividualGate(gate: any, metrics: QualityMetrics): QualityGateResult {
    const metricValue = this.getMetricValue(metrics, gate.metric_name);
    const operator = gate.operator as ComparisonOperator;
    const threshold = gate.threshold_value;
    
    let passed = false;
    switch (operator) {
      case ComparisonOperator.GT:
        passed = metricValue > threshold;
        break;
      case ComparisonOperator.LT:
        passed = metricValue < threshold;
        break;
      case ComparisonOperator.GTE:
        passed = metricValue >= threshold;
        break;
      case ComparisonOperator.LTE:
        passed = metricValue <= threshold;
        break;
      case ComparisonOperator.EQ:
        passed = metricValue === threshold;
        break;
      case ComparisonOperator.NE:
        passed = metricValue !== threshold;
        break;
    }
    
    return {
      gateId: gate.id,
      gateName: gate.gate_name,
      status: passed ? 'PASSED' : 'FAILED',
      metricName: gate.metric_name,
      actualValue: metricValue,
      expectedOperator: operator,
      expectedValue: threshold,
      message: passed ? 'Gate passed' : `Expected ${gate.metric_name} ${operator} ${threshold}, got ${metricValue}`,
      evaluatedAt: new Date()
    };
  }
  
  private getMetricValue(metrics: QualityMetrics, metricName: string): number {
    const metricMap: Record<string, keyof QualityMetrics> = {
      'overall_quality_score': 'overallQualityScore',
      'cyclomatic_complexity': 'cyclomaticComplexity',
      'technical_debt_minutes': 'technicalDebtMinutes',
      'test_coverage': 'testCoverage',
      'code_smells_count': 'codeSmellsCount',
      'maintainability_index': 'maintainabilityIndex',
      'security_hotspots': 'securityHotspots'
    };
    
    const key = metricMap[metricName];
    if (key && typeof metrics[key] === 'number') {
      return metrics[key] as number;
    }
    
    return 0;
  }
  
  private getDateRange(timeRange: TimeRange): { startDate: Date; endDate: Date } {
    const endDate = new Date();
    const startDate = new Date(endDate);
    
    switch (timeRange) {
      case TimeRange.LAST_DAY:
        startDate.setDate(endDate.getDate() - 1);
        break;
      case TimeRange.LAST_WEEK:
        startDate.setDate(endDate.getDate() - 7);
        break;
      case TimeRange.LAST_MONTH:
        startDate.setMonth(endDate.getMonth() - 1);
        break;
      case TimeRange.LAST_QUARTER:
        startDate.setMonth(endDate.getMonth() - 3);
        break;
      case TimeRange.LAST_YEAR:
        startDate.setFullYear(endDate.getFullYear() - 1);
        break;
      case TimeRange.ALL_TIME:
        startDate.setFullYear(2020); // Reasonable start date
        break;
    }
    
    return { startDate, endDate };
  }
  
  private calculateTrend(dataPoints: any[]): 'IMPROVING' | 'STABLE' | 'DEGRADING' {
    if (dataPoints.length < 2) return 'STABLE';
    
    const first = dataPoints[0].value;
    const last = dataPoints[dataPoints.length - 1].value;
    const change = last - first;
    
    if (Math.abs(change) < 2) return 'STABLE';
    return change > 0 ? 'IMPROVING' : 'DEGRADING';
  }
  
  private calculateChangeRate(dataPoints: any[]): number {
    if (dataPoints.length < 2) return 0;
    
    const timeSpan = dataPoints[dataPoints.length - 1].timestamp.getTime() - 
                    dataPoints[0].timestamp.getTime();
    const valueChange = dataPoints[dataPoints.length - 1].value - dataPoints[0].value;
    
    // Rate per day
    return (valueChange / timeSpan) * (1000 * 60 * 60 * 24);
  }
  
  private calculateTrendConfidence(dataPoints: any[]): number {
    // Simple implementation - in practice would use statistical methods
    return Math.max(0.1, Math.min(0.9, dataPoints.length / 10));
  }
  
  private async calculateQualityScore(repositoryId: string): Promise<QualityScore> {
    // Implementation would calculate current quality score
    throw new Error('Not implemented');
  }
  
  private async getQualityScoreForRef(repositoryId: string, ref: string): Promise<QualityScore> {
    // Implementation would get quality score for specific git ref
    throw new Error('Not implemented');
  }
  
  private async getHistoricalQualityScore(repositoryId: string, daysAgo: number): Promise<QualityScore> {
    // Implementation would get historical quality score
    throw new Error('Not implemented');
  }
}