/**
 * SourceCitationList Component
 * 
 * Displays source citations with attribution and links.
 */

import React from 'react';
import { BookOpen, ExternalLink } from 'lucide-react';
import { Badge } from '../../ui/badge';
import styles from './SourceCitationList.module.css';

interface SourceCitationListProps {
  sources: {
    totalSources: number;
    primarySources: string[];
    diversityScore: number;
  };
  searchResults: any[];
  className?: string;
}

export function SourceCitationList({ sources, searchResults, className = '' }: SourceCitationListProps) {
  return (
    <div className={`${styles.citationList} ${className}`}>
      <div className={styles.citationHeader}>
        <BookOpen size={20} className="text-blue-500" />
        <h3 className={styles.citationTitle}>
          Sources ({sources.totalSources})
        </h3>
        <Badge variant="secondary">
          Diversity: {Math.round(sources.diversityScore * 100)}%
        </Badge>
      </div>
      
      <div className={styles.sourcesList}>
        {searchResults.slice(0, sources.totalSources).map((result, index) => (
          <div key={index} className={styles.sourceItem}>
            <div className={styles.sourceNumber}>{index + 1}</div>
            <div className={styles.sourceContent}>
              <h4 className={styles.sourceTitle}>{result.title}</h4>
              <p className={styles.sourceType}>{result.type?.replace('_', ' ')}</p>
              {result.url && (
                <a href={result.url} className={styles.sourceLink} target="_blank" rel="noopener noreferrer">
                  <ExternalLink size={14} />
                  View Source
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}