/**
 * GeneratedAnswerCard Component
 * 
 * Displays AI-generated answers with confidence indicators,
 * follow-up questions, and interactive elements.
 */

import React, { useState, useCallback, useMemo } from 'react';
import { sanitizeHtml, SanitizationProfiles } from '../../../lib/sanitization';
import {
  MessageSquare,
  HelpCircle,
  TrendingUp,
  Copy,
  Share,
  ChevronDown,
  ChevronUp,
  CheckCircle
} from 'lucide-react';
import { Card } from '../../ui/card';
import { Button } from '../../ui/button';
import { Badge } from '../../ui/badge';
import { Progress } from '../../ui/progress';
import styles from './GeneratedAnswerCard.module.css';

interface GeneratedAnswer {
  question: string;
  answer: string;
  answerType: string;
  confidence: number;
  completeness: number;
  followUpQuestions: string[];
  alternativePhrasings?: string[];
  caveats?: string[];
}

interface GeneratedAnswerCardProps {
  answer: GeneratedAnswer;
  className?: string;
  onFollowUpQuestion?: (question: string) => void;
  onCopyAnswer?: (answer: string) => void;
  onShareAnswer?: (answer: GeneratedAnswer) => void;
}

export function GeneratedAnswerCard({
  answer,
  className = '',
  onFollowUpQuestion,
  onCopyAnswer,
  onShareAnswer
}: GeneratedAnswerCardProps) {

  // ========================================================================
  // State
  // ========================================================================

  const [showFollowUps, setShowFollowUps] = useState(false);
  const [showCaveats, setShowCaveats] = useState(false);
  const [copied, setCopied] = useState(false);

  // ========================================================================
  // Event Handlers
  // ========================================================================

  const handleCopyAnswer = useCallback(async () => {
    if (onCopyAnswer) {
      onCopyAnswer(answer.answer);
    } else {
      try {
        await navigator.clipboard.writeText(answer.answer);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (error) {
        console.error('Failed to copy answer:', error);
      }
    }
  }, [answer.answer, onCopyAnswer]);

  const handleShareAnswer = useCallback(() => {
    if (onShareAnswer) {
      onShareAnswer(answer);
    }
  }, [answer, onShareAnswer]);

  const handleFollowUpClick = useCallback((question: string) => {
    if (onFollowUpQuestion) {
      onFollowUpQuestion(question);
    }
  }, [onFollowUpQuestion]);

  // ========================================================================
  // Render Helpers
  // ========================================================================

  const renderConfidenceIndicator = useCallback(() => {
    const confidenceLevel = answer.confidence >= 0.8 ? 'high' : 
                           answer.confidence >= 0.6 ? 'medium' : 'low';

    return (
      <div className={styles.confidenceIndicator}>
        <div className={styles.confidenceLabel}>
          <TrendingUp size={14} />
          Confidence
        </div>
        <div className={styles.confidenceValue}>
          <Progress 
            value={answer.confidence * 100} 
            className={`${styles.confidenceBar} ${styles[confidenceLevel]}`}
          />
          <span className={styles.confidenceText}>
            {Math.round(answer.confidence * 100)}%
          </span>
        </div>
      </div>
    );
  }, [answer.confidence]);

  const renderCompletenessIndicator = useCallback(() => {
    const completenessLevel = answer.completeness >= 0.8 ? 'high' : 
                             answer.completeness >= 0.6 ? 'medium' : 'low';

    return (
      <div className={styles.completenessIndicator}>
        <div className={styles.completenessLabel}>
          Completeness
        </div>
        <div className={styles.completenessValue}>
          <Progress 
            value={answer.completeness * 100} 
            className={`${styles.completenessBar} ${styles[completenessLevel]}`}
          />
          <span className={styles.completenessText}>
            {Math.round(answer.completeness * 100)}%
          </span>
        </div>
      </div>
    );
  }, [answer.completeness]);

  const renderAnswerType = useCallback(() => {
    const typeDisplayNames: Record<string, string> = {
      direct_answer: 'Direct Answer',
      explanation: 'Explanation',
      step_by_step: 'Step-by-Step',
      comparison: 'Comparison',
      definition: 'Definition',
      troubleshooting: 'Troubleshooting',
      opinion_synthesis: 'Opinion Synthesis'
    };

    const displayName = typeDisplayNames[answer.answerType] || answer.answerType;

    return (
      <Badge variant="secondary" className={styles.answerTypeBadge}>
        {displayName}
      </Badge>
    );
  }, [answer.answerType]);

  const renderFollowUpQuestions = useCallback(() => {
    if (!answer.followUpQuestions || answer.followUpQuestions.length === 0) {
      return null;
    }

    return (
      <div className={styles.followUpSection}>
        <button
          className={styles.followUpToggle}
          onClick={() => setShowFollowUps(!showFollowUps)}
          aria-expanded={showFollowUps}
        >
          <HelpCircle size={16} />
          Follow-up Questions ({answer.followUpQuestions.length})
          {showFollowUps ? (
            <ChevronUp size={16} />
          ) : (
            <ChevronDown size={16} />
          )}
        </button>

        {showFollowUps && (
          <div className={`${styles.followUpList} ${styles.slideDown}`}>
            {answer.followUpQuestions.map((question, index) => (
              <button
                key={index}
                className={styles.followUpQuestion}
                onClick={() => handleFollowUpClick(question)}
                disabled={!onFollowUpQuestion}
              >
                <HelpCircle size={14} />
                {question}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }, [
    answer.followUpQuestions, 
    showFollowUps, 
    handleFollowUpClick, 
    onFollowUpQuestion
  ]);

  const renderCaveats = useCallback(() => {
    if (!answer.caveats || answer.caveats.length === 0) {
      return null;
    }

    return (
      <div className={styles.caveatsSection}>
        <button
          className={styles.caveatsToggle}
          onClick={() => setShowCaveats(!showCaveats)}
          aria-expanded={showCaveats}
        >
          <MessageSquare size={16} />
          Important Notes ({answer.caveats.length})
          {showCaveats ? (
            <ChevronUp size={16} />
          ) : (
            <ChevronDown size={16} />
          )}
        </button>

        {showCaveats && (
          <div className={`${styles.caveatsList} ${styles.slideDown}`}>
            {answer.caveats.map((caveat, index) => (
              <div key={index} className={styles.caveatItem}>
                <div className={styles.caveatIcon}>
                  <MessageSquare size={14} />
                </div>
                <div className={styles.caveatText}>
                  {caveat}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }, [answer.caveats, showCaveats]);

  const renderActions = useCallback(() => {
    return (
      <div className={styles.answerActions}>
        <Button
          variant="outline"
          size="sm"
          onClick={handleCopyAnswer}
          className={styles.actionButton}
        >
          {copied ? (
            <CheckCircle size={16} className="text-green-500" />
          ) : (
            <Copy size={16} />
          )}
          {copied ? 'Copied!' : 'Copy Answer'}
        </Button>

        {onShareAnswer && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleShareAnswer}
            className={styles.actionButton}
          >
            <Share size={16} />
            Share
          </Button>
        )}
      </div>
    );
  }, [handleCopyAnswer, copied, onShareAnswer, handleShareAnswer]);

  // ========================================================================
  // Main Render
  // ========================================================================

  const cardClasses = [
    styles.answerCard,
    className
  ].filter(Boolean).join(' ');

  return (
    <Card className={cardClasses}>
      {/* Header */}
      <div className={styles.answerHeader}>
        <div className={styles.questionSection}>
          <div className={styles.questionIcon}>
            <MessageSquare size={20} className="text-blue-500" />
          </div>
          <h3 className={styles.question}>
            {answer.question}
          </h3>
        </div>
        
        <div className={styles.answerMeta}>
          {renderAnswerType()}
          <div className={styles.qualityIndicators}>
            {renderConfidenceIndicator()}
            {renderCompletenessIndicator()}
          </div>
        </div>
      </div>

      {/* Answer Content */}
      <div className={styles.answerContent}>
        <div 
          className={styles.answerText}
          dangerouslySetInnerHTML={{
            __html: sanitizeHtml(answer.answer, SanitizationProfiles.RICH_TEXT).replace(/\n/g, '<br/>')
          }}
        />
      </div>

      {/* Follow-up Questions */}
      {renderFollowUpQuestions()}

      {/* Caveats */}
      {renderCaveats()}

      {/* Actions */}
      {renderActions()}
    </Card>
  );
}