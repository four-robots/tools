/**
 * SummaryControls Component
 * 
 * Controls for generating and configuring AI summaries.
 */

import React, { useState } from 'react';
import { Bot, Settings, Zap } from 'lucide-react';
import { Button } from '../../ui/button';
import { Select } from '../../ui/select';
import { Input } from '../../ui/input';
import { Checkbox } from '../../ui/checkbox';
import styles from './SummaryControls.module.css';

interface SummaryControlsProps {
  searchQuery: string;
  resultsCount: number;
  onGenerate: (options: SummaryGenerationOptions) => void;
  disabled?: boolean;
  isRegeneration?: boolean;
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

export function SummaryControls({
  searchQuery,
  resultsCount,
  onGenerate,
  disabled = false,
  isRegeneration = false,
  className = ''
}: SummaryControlsProps) {

  const [summaryType, setSummaryType] = useState<SummaryGenerationOptions['summaryType']>('general_summary');
  const [summaryLength, setSummaryLength] = useState<SummaryGenerationOptions['summaryLength']>('medium');
  const [question, setQuestion] = useState('');
  const [includeFactChecking, setIncludeFactChecking] = useState(true);
  const [includeKeyPoints, setIncludeKeyPoints] = useState(true);
  const [includeCitations, setIncludeCitations] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleGenerate = () => {
    const options: SummaryGenerationOptions = {
      summaryType,
      summaryLength,
      question: summaryType === 'answer_generation' ? question : undefined,
      includeFactChecking,
      includeKeyPoints,
      includeCitations
    };
    onGenerate(options);
  };

  return (
    <div className={`${styles.summaryControls} ${className}`}>
      <div className={styles.mainControls}>
        <div className={styles.typeSelector}>
          <label className={styles.label}>Summary Type</label>
          <select 
            value={summaryType} 
            onChange={(e) => setSummaryType(e.target.value as any)}
            className={styles.select}
          >
            <option value="general_summary">General Summary</option>
            <option value="answer_generation">Answer Generation</option>
            <option value="key_points">Key Points</option>
            <option value="synthesis">Content Synthesis</option>
            <option value="comparison">Comparison</option>
            <option value="explanation">Detailed Explanation</option>
          </select>
        </div>

        <div className={styles.lengthSelector}>
          <label className={styles.label}>Length</label>
          <select 
            value={summaryLength} 
            onChange={(e) => setSummaryLength(e.target.value as any)}
            className={styles.select}
          >
            <option value="brief">Brief</option>
            <option value="short">Short</option>
            <option value="medium">Medium</option>
            <option value="detailed">Detailed</option>
            <option value="comprehensive">Comprehensive</option>
          </select>
        </div>
      </div>

      {summaryType === 'answer_generation' && (
        <div className={styles.questionInput}>
          <label className={styles.label}>Specific Question</label>
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="What specific question would you like answered?"
            className={styles.input}
          />
        </div>
      )}

      <button
        onClick={() => setShowAdvanced(!showAdvanced)}
        className={styles.advancedToggle}
      >
        <Settings size={14} />
        Advanced Options
      </button>

      {showAdvanced && (
        <div className={styles.advancedOptions}>
          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={includeFactChecking}
              onChange={(e) => setIncludeFactChecking(e.target.checked)}
              className={styles.checkbox}
            />
            Include Fact Checking
          </label>
          
          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={includeKeyPoints}
              onChange={(e) => setIncludeKeyPoints(e.target.checked)}
              className={styles.checkbox}
            />
            Extract Key Points
          </label>
          
          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={includeCitations}
              onChange={(e) => setIncludeCitations(e.target.checked)}
              className={styles.checkbox}
            />
            Include Source Citations
          </label>
        </div>
      )}

      <div className={styles.generateSection}>
        <div className={styles.resultInfo}>
          <span className={styles.resultCount}>
            {resultsCount} search results
          </span>
        </div>
        
        <Button
          onClick={handleGenerate}
          disabled={disabled || (summaryType === 'answer_generation' && !question.trim())}
          className={styles.generateButton}
        >
          <Bot size={16} />
          {isRegeneration ? 'Regenerate' : 'Generate'} Summary
          <Zap size={16} />
        </Button>
      </div>
    </div>
  );
}