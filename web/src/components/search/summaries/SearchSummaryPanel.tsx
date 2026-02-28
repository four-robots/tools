/**
 * SearchSummaryPanel Component
 * 
 * Main component for displaying AI-generated search summaries with
 * comprehensive analysis, fact checking, and source attribution.
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { sanitizeHtml, SanitizationProfiles } from '../../../lib/sanitization';
import {
  Bot,
  Brain,
  Lightbulb,
  Shield,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  Zap,
  Star,
  BookOpen,
  TrendingUp,
  FileText,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  ThumbsUp,
  ThumbsDown,
  Info
} from 'lucide-react';
import { Button } from '../../ui/button';
import { Card } from '../../ui/card';
import { Badge } from '../../ui/badge';
import { Progress } from '../../ui/progress';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../ui/tabs';
import { Alert } from '../../ui/alert';
import { GeneratedAnswerCard } from './GeneratedAnswerCard';
import { KeyPointsList } from './KeyPointsList';
import { SourceCitationList } from './SourceCitationList';
import { ConfidenceIndicator } from './ConfidenceIndicator';
import { SummaryControls } from './SummaryControls';
import styles from './SearchSummaryPanel.module.css';

// Types for search summary
interface SearchSummary {
  id: string;
  content: string;
  summaryType: 'general_summary' | 'answer_generation' | 'key_points' | 'synthesis' | 'comparison' | 'explanation';
  overallConfidence: number;
  sources: {
    totalSources: number;
    primarySources: string[];
    diversityScore: number;
  };
  keyPoints: Array<{
    text: string;
    importance: number;
    confidence: number;
    category?: string;
  }>;
  factChecks: Array<{
    claim: string;
    accuracy: 'verified' | 'likely_true' | 'uncertain' | 'likely_false' | 'contradicted';
    confidence: number;
  }>;
  hallucinationChecks: Array<{
    flaggedText: string;
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    recommendation: string;
  }>;
  qualityMetrics: {
    accuracy: number;
    completeness: number;
    relevance: number;
    clarity: number;
    conciseness: number;
  };
  generatedAnswer?: {
    question: string;
    answer: string;
    confidence: number;
    followUpQuestions: string[];
  };
  processingTimeMs: number;
  createdAt: string;
}

interface SearchSummaryPanelProps {
  searchQuery: string;
  searchResults: any[];
  isGenerating?: boolean;
  summary?: SearchSummary;
  onGenerateSummary: (options: SummaryGenerationOptions) => void;
  onRegenerateSummary: (options: SummaryGenerationOptions) => void;
  onSubmitFeedback: (feedback: SummaryFeedback) => void;
  className?: string;
}

interface SummaryGenerationOptions {
  summaryType: 'general_summary' | 'answer_generation' | 'key_points' | 'synthesis' | 'comparison' | 'explanation';
  summaryLength: 'brief' | 'short' | 'medium' | 'detailed' | 'comprehensive';
  question?: string;
  includeFactChecking: boolean;
  includeKeyPoints: boolean;
  includeCitations: boolean;
}

interface SummaryFeedback {
  feedbackType: 'helpful' | 'not_helpful' | 'inaccurate' | 'incomplete' | 'too_long' | 'too_short' | 'unclear' | 'excellent';
  rating?: number;
  specificIssues?: string[];
  feedbackText?: string;
}

export function SearchSummaryPanel({
  searchQuery,
  searchResults,
  isGenerating = false,
  summary,
  onGenerateSummary,
  onRegenerateSummary,
  onSubmitFeedback,
  className = ''
}: SearchSummaryPanelProps) {

  // ========================================================================
  // State
  // ========================================================================

  const [activeTab, setActiveTab] = useState('summary');
  const [showAdvancedMetrics, setShowAdvancedMetrics] = useState(false);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['main']));

  // ========================================================================
  // Computed Values
  // ========================================================================

  const hasResults = useMemo(() => {
    return searchResults && searchResults.length > 0;
  }, [searchResults]);

  const canGenerateSummary = useMemo(() => {
    return hasResults && !isGenerating && searchQuery.trim().length > 0;
  }, [hasResults, isGenerating, searchQuery]);

  const qualityLevel = useMemo(() => {
    if (!summary) return 'unknown';
    const avgQuality = Object.values(summary.qualityMetrics).reduce((sum, val) => sum + val, 0) / 5;
    if (avgQuality >= 0.8) return 'high';
    if (avgQuality >= 0.6) return 'medium';
    return 'low';
  }, [summary]);

  const riskLevel = useMemo(() => {
    if (!summary) return 'unknown';
    const criticalIssues = summary.hallucinationChecks.filter(h => h.riskLevel === 'critical').length;
    const highIssues = summary.hallucinationChecks.filter(h => h.riskLevel === 'high').length;
    
    if (criticalIssues > 0) return 'critical';
    if (highIssues > 2) return 'high';
    if (highIssues > 0 || summary.hallucinationChecks.length > 3) return 'medium';
    return 'low';
  }, [summary]);

  // ========================================================================
  // Event Handlers
  // ========================================================================

  const handleGenerateSummary = useCallback((options: SummaryGenerationOptions) => {
    onGenerateSummary(options);
  }, [onGenerateSummary]);

  const handleRegenerateSummary = useCallback((options: SummaryGenerationOptions) => {
    onRegenerateSummary(options);
    setFeedbackSubmitted(false);
  }, [onRegenerateSummary]);

  const handleSubmitFeedback = useCallback((feedback: SummaryFeedback) => {
    onSubmitFeedback(feedback);
    setFeedbackSubmitted(true);
  }, [onSubmitFeedback]);

  const toggleSection = useCallback((sectionId: string) => {
    setExpandedSections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(sectionId)) {
        newSet.delete(sectionId);
      } else {
        newSet.add(sectionId);
      }
      return newSet;
    });
  }, []);

  // ========================================================================
  // Render Helpers
  // ========================================================================

  const renderGenerationPrompt = useCallback(() => {
    if (summary || isGenerating) return null;

    return (
      <Card className={`${styles.promptCard} ${className}`}>
        <div className={styles.promptContent}>
          <div className={styles.promptIcon}>
            <Bot size={48} className="text-blue-500" />
          </div>
          <div className={styles.promptText}>
            <h3 className={styles.promptTitle}>
              Generate AI Summary
            </h3>
            <p className={styles.promptDescription}>
              Create an intelligent summary of your search results with fact checking, 
              key points extraction, and comprehensive source attribution.
            </p>
          </div>
        </div>
        
        <SummaryControls
          searchQuery={searchQuery}
          resultsCount={searchResults.length}
          onGenerate={handleGenerateSummary}
          disabled={!canGenerateSummary}
          className={styles.promptControls}
        />

        {!canGenerateSummary && (
          <Alert className={styles.promptWarning}>
            <AlertTriangle size={16} />
            <div>
              {!hasResults && "No search results to summarize. Please perform a search first."}
              {hasResults && !searchQuery.trim() && "Please enter a search query to generate a summary."}
            </div>
          </Alert>
        )}
      </Card>
    );
  }, [
    summary, 
    isGenerating, 
    className, 
    searchQuery, 
    searchResults.length, 
    handleGenerateSummary, 
    canGenerateSummary, 
    hasResults
  ]);

  const renderLoadingState = useCallback(() => {
    if (!isGenerating) return null;

    return (
      <Card className={`${styles.loadingCard} ${className}`}>
        <div className={styles.loadingContent}>
          <div className={styles.loadingIcon}>
            <Brain className="animate-pulse text-blue-500" size={32} />
          </div>
          <div className={styles.loadingText}>
            <h3 className={styles.loadingTitle}>
              Generating AI Summary...
            </h3>
            <p className={styles.loadingDescription}>
              Analyzing {searchResults.length} search results, performing fact checking, 
              and generating comprehensive summary with source attribution.
            </p>
            <div className={styles.loadingSteps}>
              <div className={styles.loadingStep}>
                <CheckCircle size={16} className="text-green-500" />
                Content analysis complete
              </div>
              <div className={styles.loadingStep}>
                <RefreshCw size={16} className="animate-spin text-blue-500" />
                Generating summary with LLM
              </div>
              <div className={styles.loadingStep}>
                <Clock size={16} className="text-gray-400" />
                Fact checking and verification
              </div>
            </div>
          </div>
        </div>
      </Card>
    );
  }, [isGenerating, className, searchResults.length]);

  const renderSummaryHeader = useCallback(() => {
    if (!summary) return null;

    return (
      <div className={styles.summaryHeader}>
        <div className={styles.summaryTitleRow}>
          <div className={styles.summaryTypeIcon}>
            <Bot size={24} className="text-blue-500" />
          </div>
          <div className={styles.summaryTitleContent}>
            <h2 className={styles.summaryTitle}>
              AI-Generated Summary
            </h2>
            <div className={styles.summaryMeta}>
              <Badge variant={summary.summaryType === 'general_summary' ? 'default' : 'secondary'}>
                {summary.summaryType.replace('_', ' ')}
              </Badge>
              <span className={styles.processingTime}>
                <Zap size={14} />
                Generated in {Math.round(summary.processingTimeMs / 1000)}s
              </span>
              <span className={styles.sourceCount}>
                <BookOpen size={14} />
                {summary.sources.totalSources} sources
              </span>
            </div>
          </div>
        </div>

        <ConfidenceIndicator 
          confidence={summary.overallConfidence}
          qualityMetrics={summary.qualityMetrics}
          riskLevel={riskLevel}
          className={styles.headerConfidence}
        />
      </div>
    );
  }, [summary, riskLevel]);

  const renderSummaryContent = useCallback(() => {
    if (!summary) return null;

    return (
      <Tabs value={activeTab} onValueChange={setActiveTab} className={styles.summaryTabs}>
        <TabsList className={styles.tabsList}>
          <TabsTrigger value="summary" className={styles.tabTrigger}>
            <FileText size={16} />
            Summary
          </TabsTrigger>
          {summary.keyPoints.length > 0 && (
            <TabsTrigger value="key-points" className={styles.tabTrigger}>
              <Lightbulb size={16} />
              Key Points ({summary.keyPoints.length})
            </TabsTrigger>
          )}
          {summary.generatedAnswer && (
            <TabsTrigger value="answer" className={styles.tabTrigger}>
              <MessageSquare size={16} />
              Answer
            </TabsTrigger>
          )}
          <TabsTrigger value="sources" className={styles.tabTrigger}>
            <BookOpen size={16} />
            Sources ({summary.sources.totalSources})
          </TabsTrigger>
          <TabsTrigger value="quality" className={styles.tabTrigger}>
            <Shield size={16} />
            Quality Check
          </TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className={styles.tabContent}>
          <div className={styles.summaryText}>
            <div 
              className={styles.summaryContent}
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(summary.content, SanitizationProfiles.RICH_TEXT).replace(/\n/g, '<br/>') }}
            />
            {summary.hallucinationChecks.length > 0 && (
              <Alert className={styles.qualityAlert}>
                <AlertTriangle size={16} />
                <div>
                  <strong>Quality Check:</strong> {summary.hallucinationChecks.length} potential issues detected.
                  Check the Quality tab for details.
                </div>
              </Alert>
            )}
          </div>
        </TabsContent>

        {summary.keyPoints.length > 0 && (
          <TabsContent value="key-points" className={styles.tabContent}>
            <KeyPointsList
              keyPoints={summary.keyPoints}
              className={styles.keyPointsList}
            />
          </TabsContent>
        )}

        {summary.generatedAnswer && (
          <TabsContent value="answer" className={styles.tabContent}>
            <GeneratedAnswerCard
              answer={summary.generatedAnswer}
              className={styles.answerCard}
            />
          </TabsContent>
        )}

        <TabsContent value="sources" className={styles.tabContent}>
          <SourceCitationList
            sources={summary.sources}
            searchResults={searchResults}
            className={styles.sourcesList}
          />
        </TabsContent>

        <TabsContent value="quality" className={styles.tabContent}>
          <div className={styles.qualitySection}>
            <div className={styles.qualityMetrics}>
              <h4 className={styles.qualityTitle}>Quality Metrics</h4>
              <div className={styles.metricsGrid}>
                <div className={styles.metric}>
                  <span className={styles.metricLabel}>Accuracy</span>
                  <Progress 
                    value={summary.qualityMetrics.accuracy * 100} 
                    className={styles.metricProgress}
                  />
                  <span className={styles.metricValue}>
                    {Math.round(summary.qualityMetrics.accuracy * 100)}%
                  </span>
                </div>
                <div className={styles.metric}>
                  <span className={styles.metricLabel}>Completeness</span>
                  <Progress 
                    value={summary.qualityMetrics.completeness * 100} 
                    className={styles.metricProgress}
                  />
                  <span className={styles.metricValue}>
                    {Math.round(summary.qualityMetrics.completeness * 100)}%
                  </span>
                </div>
                <div className={styles.metric}>
                  <span className={styles.metricLabel}>Relevance</span>
                  <Progress 
                    value={summary.qualityMetrics.relevance * 100} 
                    className={styles.metricProgress}
                  />
                  <span className={styles.metricValue}>
                    {Math.round(summary.qualityMetrics.relevance * 100)}%
                  </span>
                </div>
              </div>

              {summary.factChecks.length > 0 && (
                <div className={styles.factChecks}>
                  <h4 className={styles.qualityTitle}>Fact Checking Results</h4>
                  <div className={styles.factChecksList}>
                    {summary.factChecks.slice(0, 3).map((check, index) => (
                      <div key={index} className={styles.factCheck}>
                        <div className={styles.factCheckIcon}>
                          {check.accuracy === 'verified' && <CheckCircle className="text-green-500" size={16} />}
                          {check.accuracy === 'likely_true' && <CheckCircle className="text-blue-500" size={16} />}
                          {check.accuracy === 'uncertain' && <AlertTriangle className="text-yellow-500" size={16} />}
                          {check.accuracy === 'likely_false' && <XCircle className="text-orange-500" size={16} />}
                          {check.accuracy === 'contradicted' && <XCircle className="text-red-500" size={16} />}
                        </div>
                        <div className={styles.factCheckContent}>
                          <div className={styles.factCheckClaim}>
                            {check.claim.substring(0, 100)}...
                          </div>
                          <div className={styles.factCheckStatus}>
                            {check.accuracy} ({Math.round(check.confidence * 100)}% confidence)
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    );
  }, [summary, activeTab, searchResults]);

  const renderSummaryActions = useCallback(() => {
    if (!summary) return null;

    return (
      <div className={styles.summaryActions}>
        <div className={styles.actionButtons}>
          <SummaryControls
            searchQuery={searchQuery}
            resultsCount={searchResults.length}
            onGenerate={handleRegenerateSummary}
            disabled={isGenerating}
            isRegeneration={true}
            className={styles.regenerateControls}
          />
        </div>

        <div className={styles.feedbackSection}>
          <div className={styles.feedbackButtons}>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleSubmitFeedback({ feedbackType: 'helpful' })}
              disabled={feedbackSubmitted}
              className={styles.feedbackButton}
            >
              <ThumbsUp size={16} />
              Helpful
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleSubmitFeedback({ feedbackType: 'not_helpful' })}
              disabled={feedbackSubmitted}
              className={styles.feedbackButton}
            >
              <ThumbsDown size={16} />
              Not Helpful
            </Button>
          </div>
          {feedbackSubmitted && (
            <span className={styles.feedbackConfirmation}>
              <CheckCircle size={14} className="text-green-500" />
              Thank you for your feedback!
            </span>
          )}
        </div>
      </div>
    );
  }, [
    summary, 
    searchQuery, 
    searchResults.length, 
    handleRegenerateSummary, 
    isGenerating, 
    handleSubmitFeedback, 
    feedbackSubmitted
  ]);

  // ========================================================================
  // Main Render
  // ========================================================================

  const panelClasses = [
    styles.summaryPanel,
    className
  ].filter(Boolean).join(' ');

  return (
    <div className={panelClasses}>
      {renderGenerationPrompt()}
      {renderLoadingState()}
      
      {summary && (
        <Card className={styles.summaryCard}>
          {renderSummaryHeader()}
          {renderSummaryContent()}
          {renderSummaryActions()}
        </Card>
      )}
    </div>
  );
}