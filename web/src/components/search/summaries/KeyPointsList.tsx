/**
 * KeyPointsList Component
 * 
 * Displays extracted key points with importance indicators and categories.
 */

import React from 'react';
import { Lightbulb, Star, TrendingUp } from 'lucide-react';
import { Badge } from '../../ui/badge';
import { Progress } from '../../ui/progress';
import styles from './KeyPointsList.module.css';

interface KeyPoint {
  text: string;
  importance: number;
  confidence: number;
  category?: string;
}

interface KeyPointsListProps {
  keyPoints: KeyPoint[];
  className?: string;
}

export function KeyPointsList({ keyPoints, className = '' }: KeyPointsListProps) {
  const sortedKeyPoints = [...keyPoints].sort((a, b) => b.importance - a.importance);

  return (
    <div className={`${styles.keyPointsList} ${className}`}>
      <div className={styles.keyPointsHeader}>
        <Lightbulb size={20} className="text-yellow-500" />
        <h3 className={styles.keyPointsTitle}>
          Key Points ({keyPoints.length})
        </h3>
      </div>
      
      <div className={styles.keyPointsContainer}>
        {sortedKeyPoints.map((point, index) => (
          <div key={index} className={styles.keyPointItem}>
            <div className={styles.keyPointHeader}>
              <div className={styles.keyPointRank}>
                <Star size={16} className="text-yellow-500" />
                <span className={styles.rankNumber}>{index + 1}</span>
              </div>
              
              {point.category && (
                <Badge variant="secondary" className={styles.categoryBadge}>
                  {point.category}
                </Badge>
              )}
              
              <div className={styles.importanceIndicator}>
                <TrendingUp size={14} />
                <Progress value={point.importance * 100} className={styles.importanceBar} />
                <span className={styles.importanceText}>
                  {Math.round(point.importance * 100)}%
                </span>
              </div>
            </div>
            
            <div className={styles.keyPointText}>
              {point.text}
            </div>
            
            <div className={styles.keyPointFooter}>
              <span className={styles.confidence}>
                Confidence: {Math.round(point.confidence * 100)}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}