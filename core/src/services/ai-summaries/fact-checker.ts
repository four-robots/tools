/**
 * Fact Checker
 * 
 * Validates factual accuracy and detects potential hallucinations
 * in AI-generated summaries.
 */

import { LLMService } from '../nlp/llm-service.js';
import type {
  ContentSource,
  FactCheck,
  HallucinationCheck,
  FactualAccuracy,
  VerificationMethod,
  HallucinationType,
  RiskLevel,
  Recommendation
} from '../../shared/types/ai-summaries.js';

/**
 * Configuration for fact checking
 */
interface FactCheckerConfig {
  enableFactChecking: boolean;
  enableHallucinationCheck: boolean;
  defaultLLMProvider: string;
  confidenceThreshold: number;
  maxClaimsToCheck: number;
}

/**
 * Fact checking prompts
 */
class FactCheckingPrompts {
  static getFactCheckPrompt(): string {
    return `You are an expert fact-checker analyzing AI-generated content for accuracy.
    Your task is to verify claims against the provided source material.

    For each claim in the summary, determine:
    1. Whether it is supported by the source material
    2. The level of factual accuracy
    3. Your confidence in this assessment

    Accuracy levels:
    - "verified": Directly confirmed by multiple sources
    - "likely_true": Supported by available evidence
    - "uncertain": Insufficient evidence to confirm
    - "likely_false": Contradicted by available evidence  
    - "contradicted": Directly contradicted by sources

    Respond in JSON format with an array of fact checks:
    [
      {
        "claim": "The specific claim text",
        "startIndex": 0,
        "endIndex": 50,
        "accuracy": "verified",
        "confidence": 0.95,
        "method": "source_cross_reference",
        "supportingEvidence": ["evidence from sources"],
        "contradictingEvidence": [],
        "notes": "Explanation of assessment"
      }
    ]`;
  }

  static getHallucinationCheckPrompt(): string {
    return `You are an expert at detecting AI hallucinations and fabricated information.
    Analyze the summary for content that is not supported by the provided sources.

    Look for:
    - Claims not found in any source material
    - Specific details that appear to be fabricated
    - Information that contradicts the sources
    - Claims that are outside the scope of source material
    - Incorrect attributions or quotes

    Hallucination types:
    - "unsupported_claim": Statement not backed by sources
    - "contradicted_fact": Contradicts source information
    - "fabricated_detail": Made-up specific details
    - "out_of_scope": Information beyond source coverage
    - "temporal_confusion": Incorrect time references
    - "false_attribution": Wrong attribution of ideas/quotes

    Risk levels:
    - "low": Minor inaccuracy, unlikely to mislead
    - "medium": Noticeable error, could confuse users  
    - "high": Significant error, likely to mislead
    - "critical": Dangerous misinformation

    Respond in JSON format with an array of hallucination checks:
    [
      {
        "flaggedText": "The problematic text",
        "startIndex": 0,
        "endIndex": 50,
        "type": "unsupported_claim",
        "riskLevel": "medium",
        "confidence": 0.85,
        "detectionMethod": "source_verification",
        "hasSourceSupport": false,
        "recommendation": "remove",
        "alternativeText": "Suggested correction",
        "notes": "Explanation of the issue"
      }
    ]`;
  }

  static getConsistencyCheckPrompt(): string {
    return `You are analyzing text for internal consistency and logical coherence.
    Check for contradictions within the summary itself, regardless of source material.

    Look for:
    - Contradictory statements within the same document
    - Logical inconsistencies
    - Conflicting data points
    - Contradictory recommendations

    Return a JSON array of consistency issues found:
    [
      {
        "issue": "Description of the inconsistency",
        "conflictingStatements": ["Statement 1", "Statement 2"],
        "severity": "high",
        "recommendation": "clarify"
      }
    ]`;
  }
}

export class FactChecker {
  constructor(
    private llmService: LLMService,
    private config: FactCheckerConfig
  ) {}

  /**
   * Check factual accuracy of summary against sources
   */
  async checkFactualAccuracy(
    summary: string,
    sources: ContentSource[]
  ): Promise<FactCheck[]> {
    if (!this.config.enableFactChecking) {
      return [];
    }

    try {
      console.log('🔍 Performing fact checking on generated summary');

      // Extract claims from summary
      const claims = this.extractClaims(summary);
      
      if (claims.length === 0) {
        return [];
      }

      // Check claims against sources using LLM
      const factChecks = await this.performLLMFactCheck(summary, sources, claims);

      // Validate and clean results
      const validatedChecks = this.validateFactChecks(factChecks);

      console.log(`✅ Fact checking completed: ${validatedChecks.length} claims checked`);
      return validatedChecks;

    } catch (error) {
      console.error('❌ Fact checking failed:', error);
      return [];
    }
  }

  /**
   * Detect potential hallucinations in summary
   */
  async detectHallucinations(
    summary: string,
    sources: ContentSource[]
  ): Promise<HallucinationCheck[]> {
    if (!this.config.enableHallucinationCheck) {
      return [];
    }

    try {
      console.log('🕵️ Detecting potential hallucinations in summary');

      // Use LLM to detect hallucinations
      const hallucinationChecks = await this.performLLMHallucinationCheck(summary, sources);

      // Cross-reference with source content
      const verifiedChecks = await this.crossReferenceWithSources(hallucinationChecks, sources);

      // Check for internal consistency
      const consistencyIssues = await this.checkInternalConsistency(summary);
      
      // Convert consistency issues to hallucination checks
      const consistencyHallucinations = this.convertConsistencyToHallucinations(consistencyIssues);

      // Combine all checks
      const allChecks = [...verifiedChecks, ...consistencyHallucinations];

      // Sort by risk level
      const sortedChecks = this.sortByRisk(allChecks);

      console.log(`✅ Hallucination detection completed: ${sortedChecks.length} potential issues found`);
      return sortedChecks;

    } catch (error) {
      console.error('❌ Hallucination detection failed:', error);
      return [];
    }
  }

  /**
   * Extract factual claims from summary text
   */
  private extractClaims(summary: string): Array<{text: string, startIndex: number, endIndex: number}> {
    const claims: Array<{text: string, startIndex: number, endIndex: number}> = [];
    
    // Split into sentences
    const sentences = summary.split(/[.!?]+/).filter(s => s.trim().length > 10);
    let currentIndex = 0;

    sentences.forEach(sentence => {
      const trimmedSentence = sentence.trim();
      if (trimmedSentence.length > 0) {
        // Find the sentence in the original text
        const startIndex = summary.indexOf(trimmedSentence, currentIndex);
        const endIndex = startIndex + trimmedSentence.length;
        
        // Filter out sentences that are likely not factual claims
        if (this.isFactualClaim(trimmedSentence)) {
          claims.push({
            text: trimmedSentence,
            startIndex,
            endIndex
          });
        }
        
        currentIndex = endIndex;
      }
    });

    // Limit number of claims to check
    return claims.slice(0, this.config.maxClaimsToCheck);
  }

  /**
   * Determine if a sentence contains a factual claim
   */
  private isFactualClaim(sentence: string): boolean {
    const lowerSentence = sentence.toLowerCase();
    
    // Skip questions, suggestions, and subjective statements
    if (lowerSentence.includes('?') || 
        lowerSentence.startsWith('you should') ||
        lowerSentence.startsWith('consider') ||
        lowerSentence.includes('in my opinion') ||
        lowerSentence.includes('it seems')) {
      return false;
    }

    // Look for factual indicators
    const factualIndicators = [
      'is', 'are', 'was', 'were', 'has', 'have', 'does', 'did',
      'provides', 'offers', 'supports', 'includes', 'contains',
      'allows', 'enables', 'requires', 'costs', 'measures'
    ];

    return factualIndicators.some(indicator => lowerSentence.includes(indicator));
  }

  /**
   * Perform LLM-based fact checking
   */
  private async performLLMFactCheck(
    summary: string,
    sources: ContentSource[],
    claims: Array<{text: string, startIndex: number, endIndex: number}>
  ): Promise<FactCheck[]> {
    try {
      const sourcesText = this.formatSourcesForFactCheck(sources);
      const claimsText = claims.map((claim, index) => `${index + 1}. ${claim.text}`).join('\n');

      const prompt = `Summary to fact-check:
${summary}

Source Material:
${sourcesText}

Claims to verify:
${claimsText}

Please fact-check each claim against the source material.`;

      const response = await this.llmService.generateCompletion(
        prompt,
        FactCheckingPrompts.getFactCheckPrompt(),
        this.config.defaultLLMProvider as any,
        0.1
      );

      // Parse LLM response
      const parsed = JSON.parse(response.content);
      
      if (!Array.isArray(parsed)) {
        throw new Error('LLM response is not an array');
      }

      // Convert to FactCheck objects
      return parsed.map(item => this.parseFactCheck(item));

    } catch (error) {
      console.error('LLM fact checking failed:', error);
      return [];
    }
  }

  /**
   * Perform LLM-based hallucination detection
   */
  private async performLLMHallucinationCheck(
    summary: string,
    sources: ContentSource[]
  ): Promise<HallucinationCheck[]> {
    try {
      const sourcesText = this.formatSourcesForFactCheck(sources);

      const prompt = `Summary to check for hallucinations:
${summary}

Source Material:
${sourcesText}

Please identify any content in the summary that is not supported by the source material.`;

      const response = await this.llmService.generateCompletion(
        prompt,
        FactCheckingPrompts.getHallucinationCheckPrompt(),
        this.config.defaultLLMProvider as any,
        0.1
      );

      // Parse LLM response
      const parsed = JSON.parse(response.content);
      
      if (!Array.isArray(parsed)) {
        throw new Error('LLM response is not an array');
      }

      // Convert to HallucinationCheck objects
      return parsed.map(item => this.parseHallucinationCheck(item));

    } catch (error) {
      console.error('LLM hallucination detection failed:', error);
      return [];
    }
  }

  /**
   * Check internal consistency of summary
   */
  private async checkInternalConsistency(summary: string): Promise<any[]> {
    try {
      const prompt = `Summary to check for internal consistency:
${summary}

Please identify any internal contradictions or logical inconsistencies.`;

      const response = await this.llmService.generateCompletion(
        prompt,
        FactCheckingPrompts.getConsistencyCheckPrompt(),
        this.config.defaultLLMProvider as any,
        0.1
      );

      const parsed = JSON.parse(response.content);
      return Array.isArray(parsed) ? parsed : [];

    } catch (error) {
      console.error('Consistency checking failed:', error);
      return [];
    }
  }

  /**
   * Cross-reference hallucination checks with source content
   */
  private async crossReferenceWithSources(
    checks: HallucinationCheck[],
    sources: ContentSource[]
  ): Promise<HallucinationCheck[]> {
    return checks.map(check => {
      // Simple keyword matching to verify if text appears in sources
      const hasSupport = sources.some(source => 
        source.content.toLowerCase().includes(check.flaggedText.toLowerCase())
      );

      return {
        ...check,
        hasSourceSupport: hasSupport,
        // Adjust confidence based on source support
        confidence: hasSupport ? Math.max(check.confidence - 0.2, 0) : check.confidence
      };
    });
  }

  /**
   * Convert consistency issues to hallucination checks
   */
  private convertConsistencyToHallucinations(consistencyIssues: any[]): HallucinationCheck[] {
    return consistencyIssues.map(issue => ({
      flaggedText: issue.conflictingStatements?.join(' vs ') || issue.issue,
      startIndex: 0, // Would need more sophisticated parsing
      endIndex: 0,
      type: 'contradicted_fact' as HallucinationType,
      riskLevel: issue.severity as RiskLevel || 'medium',
      confidence: 0.8,
      detectionMethod: 'consistency_check' as VerificationMethod,
      hasSourceSupport: false,
      recommendation: issue.recommendation as Recommendation || 'clarify',
      notes: `Internal consistency issue: ${issue.issue}`,
      resolved: false
    }));
  }

  /**
   * Parse fact check result from LLM response
   */
  private parseFactCheck(item: any): FactCheck {
    return {
      claim: item.claim || '',
      startIndex: item.startIndex || 0,
      endIndex: item.endIndex || 0,
      accuracy: this.validateAccuracy(item.accuracy),
      confidence: Math.min(Math.max(item.confidence || 0.5, 0), 1),
      method: this.validateVerificationMethod(item.method),
      supportingEvidence: Array.isArray(item.supportingEvidence) ? item.supportingEvidence : [],
      contradictingEvidence: Array.isArray(item.contradictingEvidence) ? item.contradictingEvidence : [],
      notes: item.notes || ''
    };
  }

  /**
   * Parse hallucination check result from LLM response
   */
  private parseHallucinationCheck(item: any): HallucinationCheck {
    return {
      flaggedText: item.flaggedText || '',
      startIndex: item.startIndex || 0,
      endIndex: item.endIndex || 0,
      type: this.validateHallucinationType(item.type),
      riskLevel: this.validateRiskLevel(item.riskLevel),
      confidence: Math.min(Math.max(item.confidence || 0.5, 0), 1),
      detectionMethod: this.validateVerificationMethod(item.detectionMethod),
      hasSourceSupport: Boolean(item.hasSourceSupport),
      recommendation: this.validateRecommendation(item.recommendation),
      alternativeText: item.alternativeText || undefined,
      notes: item.notes || undefined,
      resolved: false
    };
  }

  /**
   * Format sources for fact checking prompt
   */
  private formatSourcesForFactCheck(sources: ContentSource[]): string {
    return sources
      .map((source, index) => `[Source ${index + 1}] ${source.title}
Content: ${source.content.substring(0, 1500)}${source.content.length > 1500 ? '...' : ''}
---`)
      .join('\n\n');
  }

  /**
   * Validation methods
   */

  private validateAccuracy(accuracy: string): FactualAccuracy {
    const validAccuracies: FactualAccuracy[] = [
      'verified', 'likely_true', 'uncertain', 'likely_false', 'contradicted'
    ];
    return validAccuracies.includes(accuracy as FactualAccuracy) ? 
      accuracy as FactualAccuracy : 'uncertain';
  }

  private validateVerificationMethod(method: string): VerificationMethod {
    const validMethods: VerificationMethod[] = [
      'source_cross_reference', 'external_validation', 'llm_reasoning',
      'consistency_check', 'knowledge_base_lookup'
    ];
    return validMethods.includes(method as VerificationMethod) ? 
      method as VerificationMethod : 'llm_reasoning';
  }

  private validateHallucinationType(type: string): HallucinationType {
    const validTypes: HallucinationType[] = [
      'unsupported_claim', 'contradicted_fact', 'fabricated_detail',
      'out_of_scope', 'temporal_confusion', 'false_attribution'
    ];
    return validTypes.includes(type as HallucinationType) ? 
      type as HallucinationType : 'unsupported_claim';
  }

  private validateRiskLevel(level: string): RiskLevel {
    const validLevels: RiskLevel[] = ['low', 'medium', 'high', 'critical'];
    return validLevels.includes(level as RiskLevel) ? 
      level as RiskLevel : 'medium';
  }

  private validateRecommendation(rec: string): Recommendation {
    const validRecs: Recommendation[] = ['remove', 'flag', 'verify', 'rewrite', 'clarify'];
    return validRecs.includes(rec as Recommendation) ? 
      rec as Recommendation : 'verify';
  }

  /**
   * Validate fact check results
   */
  private validateFactChecks(factChecks: FactCheck[]): FactCheck[] {
    return factChecks
      .filter(check => 
        check.claim.length > 0 && 
        check.confidence >= this.config.confidenceThreshold
      )
      .slice(0, this.config.maxClaimsToCheck);
  }

  /**
   * Sort hallucination checks by risk level
   */
  private sortByRisk(checks: HallucinationCheck[]): HallucinationCheck[] {
    const riskOrder = { 'critical': 4, 'high': 3, 'medium': 2, 'low': 1 };
    
    return checks.sort((a, b) => {
      const aRisk = riskOrder[a.riskLevel] || 0;
      const bRisk = riskOrder[b.riskLevel] || 0;
      
      if (aRisk !== bRisk) {
        return bRisk - aRisk; // Higher risk first
      }
      
      return b.confidence - a.confidence; // Higher confidence first
    });
  }

  /**
   * Get fact checking statistics
   */
  getFactCheckStats(factChecks: FactCheck[]): {
    totalChecks: number;
    accuracyBreakdown: Record<FactualAccuracy, number>;
    averageConfidence: number;
    verificationMethods: Record<VerificationMethod, number>;
  } {
    const accuracyBreakdown: Record<FactualAccuracy, number> = {
      'verified': 0, 'likely_true': 0, 'uncertain': 0, 'likely_false': 0, 'contradicted': 0
    };
    
    const verificationMethods: Record<VerificationMethod, number> = {
      'source_cross_reference': 0, 'external_validation': 0, 'llm_reasoning': 0,
      'consistency_check': 0, 'knowledge_base_lookup': 0
    };

    factChecks.forEach(check => {
      accuracyBreakdown[check.accuracy]++;
      verificationMethods[check.method]++;
    });

    const averageConfidence = factChecks.length > 0 ? 
      factChecks.reduce((sum, check) => sum + check.confidence, 0) / factChecks.length : 0;

    return {
      totalChecks: factChecks.length,
      accuracyBreakdown,
      averageConfidence,
      verificationMethods
    };
  }

  /**
   * Get hallucination detection statistics
   */
  getHallucinationStats(checks: HallucinationCheck[]): {
    totalFlags: number;
    riskBreakdown: Record<RiskLevel, number>;
    typeBreakdown: Record<HallucinationType, number>;
    averageConfidence: number;
    resolvedCount: number;
  } {
    const riskBreakdown: Record<RiskLevel, number> = {
      'low': 0, 'medium': 0, 'high': 0, 'critical': 0
    };
    
    const typeBreakdown: Record<HallucinationType, number> = {
      'unsupported_claim': 0, 'contradicted_fact': 0, 'fabricated_detail': 0,
      'out_of_scope': 0, 'temporal_confusion': 0, 'false_attribution': 0
    };

    checks.forEach(check => {
      riskBreakdown[check.riskLevel]++;
      typeBreakdown[check.type]++;
    });

    const averageConfidence = checks.length > 0 ? 
      checks.reduce((sum, check) => sum + check.confidence, 0) / checks.length : 0;

    const resolvedCount = checks.filter(check => check.resolved).length;

    return {
      totalFlags: checks.length,
      riskBreakdown,
      typeBreakdown,
      averageConfidence,
      resolvedCount
    };
  }
}