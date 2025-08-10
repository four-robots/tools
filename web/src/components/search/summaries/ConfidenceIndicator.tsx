/**
 * ConfidenceIndicator Component
 * 
 * Displays confidence and quality metrics for AI summaries.
 */

import React from 'react';
import { Shield, TrendingUp } from 'lucide-react';
import { Progress } from '../../ui/progress';
import { Badge } from '../../ui/badge';
import styles from './ConfidenceIndicator.module.css';

interface ConfidenceIndicatorProps {
  confidence: number;
  qualityMetrics: {
    accuracy: number;
    completeness: number;
    relevance: number;
    clarity: number;
    conciseness: number;
  };
  riskLevel: 'low' | 'medium' | 'high' | 'critical' | 'unknown';
  className?: string;
}

export function ConfidenceIndicator({ 
  confidence, 
  qualityMetrics, 
  riskLevel, 
  className = '' 
}: ConfidenceIndicatorProps) {
  
  const confidenceLevel = confidence >= 0.8 ? 'high' : confidence >= 0.6 ? 'medium' : 'low';
  const averageQuality = Object.values(qualityMetrics).reduce((sum, val) => sum + val, 0) / 5;

  return (
    <div className={`${styles.confidenceIndicator} ${className}`}>
      <div className={styles.confidenceSection}>
        <div className={styles.confidenceIcon}>
          <TrendingUp size={16} className="text-blue-500" />
        </div>
        <div className={styles.confidenceContent}>
          <div className={styles.confidenceLabel}>Overall Confidence</div>
          <div className={styles.confidenceValue}>
            <Progress 
              value={confidence * 100} 
              className={`${styles.confidenceBar} ${styles[confidenceLevel]}`}
            />
            <span className={styles.confidenceText}>
              {Math.round(confidence * 100)}%
            </span>
          </div>
        </div>
      </div>

      <div className={styles.qualitySection}>
        <div className={styles.qualityIcon}>
          <Shield size={16} className="text-green-500" />
        </div>
        <div className={styles.qualityContent}>
          <div className={styles.qualityLabel}>Quality Score</div>
          <div className={styles.qualityValue}>
            <Progress 
              value={averageQuality * 100} 
              className={styles.qualityBar}
            />
            <span className={styles.qualityText}>
              {Math.round(averageQuality * 100)}%
            </span>
          </div>
        </div>
      </div>

      <div className={styles.riskSection}>
        <Badge 
          variant={riskLevel === 'low' ? 'default' : riskLevel === 'critical' ? 'destructive' : 'secondary'}
          className={styles.riskBadge}
        >
          {riskLevel === 'unknown' ? 'Checking...' : `${riskLevel} risk`}
        </Badge>
      </div>
    </div>
  );
}