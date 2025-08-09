/**
 * SearchResultCard Component
 * 
 * Individual search result display component
 */

import React, { useState, useCallback, useMemo } from 'react';
import { 
  Globe, 
  BookOpen, 
  Kanban, 
  Brain, 
  FileText, 
  Code,
  Calendar,
  User,
  Star,
  Link,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { SearchResult, ContentType } from '@mcp-tools/core';
import { SearchResultCardProps } from '../types';
import { formatRelativeDate, formatContentType } from '../utils/searchHelpers';
import styles from './SearchResultCard.module.css';

/**
 * SearchResultCard component for displaying individual search results
 */
export function SearchResultCard({
  result,
  onClick,
  className = '',
  showPreview = true,
  showMetadata = true,
  showRelationships = false,
  isSelected = false,
  onSelect
}: SearchResultCardProps) {

  // ========================================================================
  // State
  // ========================================================================

  const [isExpanded, setIsExpanded] = useState(false);
  const [showFullPreview, setShowFullPreview] = useState(false);

  // ========================================================================
  // Computed Values
  // ========================================================================

  const contentTypeIcon = useMemo(() => {
    const iconProps = { 
      className: `${styles.contentTypeIcon} ${styles[result.type]}`, 
      size: 16 
    };

    switch (result.type) {
      case 'scraped_page':
        return <Globe {...iconProps} />;
      case 'wiki_page':
        return <BookOpen {...iconProps} />;
      case 'kanban_card':
        return <Kanban {...iconProps} />;
      case 'memory_thought':
        return <Brain {...iconProps} />;
      case 'code_file':
        return <FileText {...iconProps} />;
      case 'code_chunk':
        return <Code {...iconProps} />;
      default:
        return <FileText {...iconProps} />;
    }
  }, [result.type]);

  const qualityLevel = useMemo(() => {
    const quality = result.score.quality_score || 0;
    if (quality >= 0.8) return 'high';
    if (quality >= 0.5) return 'medium';
    return 'low';
  }, [result.score.quality_score]);

  const relevanceLevel = useMemo(() => {
    const relevance = result.score.relevance;
    if (relevance >= 0.8) return 'high';
    if (relevance >= 0.5) return 'medium';
    return 'low';
  }, [result.score.relevance]);

  // ========================================================================
  // Event Handlers
  // ========================================================================

  const handleCardClick = useCallback((event: React.MouseEvent) => {
    // Don't trigger card click if clicking on interactive elements
    if (
      event.target instanceof HTMLElement &&
      (event.target.closest('input') || 
       event.target.closest('button') ||
       event.target.closest('a'))
    ) {
      return;
    }
    
    onClick(result);
  }, [onClick, result]);

  const handleSelectChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    event.stopPropagation();
    onSelect?.(result, event.target.checked);
  }, [onSelect, result]);

  const handleExpandToggle = useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
    setIsExpanded(!isExpanded);
  }, [isExpanded]);

  const handlePreviewToggle = useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
    setShowFullPreview(!showFullPreview);
  }, [showFullPreview]);

  // ========================================================================
  // Render Helpers
  // ========================================================================

  const renderQualityBadge = useCallback(() => {
    if (!result.score.quality_score) return null;

    const quality = Math.round(result.score.quality_score * 100);
    return (
      <span className={`${styles.qualityBadge} ${styles[qualityLevel]}`}>
        <Star size={12} className="mr-1" />
        {quality}%
      </span>
    );
  }, [result.score.quality_score, qualityLevel]);

  const renderLanguageBadge = useCallback(() => {
    if (!result.metadata.language) return null;

    return (
      <span className={styles.languageBadge}>
        <Code size={12} className="mr-1" />
        {result.metadata.language}
      </span>
    );
  }, [result.metadata.language]);

  const renderRepositoryBadge = useCallback(() => {
    if (!result.metadata.repository) return null;

    return (
      <span className={styles.repositoryBadge}>
        <FileText size={12} className="mr-1" />
        {result.metadata.repository}
      </span>
    );
  }, [result.metadata.repository]);

  const renderLineRange = useCallback(() => {
    if (!result.metadata.line_range) return null;

    return (
      <span className={styles.lineRange}>
        Lines {result.metadata.line_range.start}-{result.metadata.line_range.end}
      </span>
    );
  }, [result.metadata.line_range]);

  const renderPreview = useCallback(() => {
    if (!showPreview || !result.preview) return null;

    const previewText = showFullPreview || result.preview.text.length <= 200 
      ? result.preview.text 
      : result.preview.text.substring(0, 200);

    const needsExpansion = result.preview.text.length > 200;

    return (
      <div className={styles.resultPreview}>
        <div 
          className={styles.previewText}
          dangerouslySetInnerHTML={{ 
            __html: result.preview.highlights 
              ? previewText.replace(
                  new RegExp(`(${result.preview.highlights.map(h => h.match).join('|')})`, 'gi'),
                  `<mark class="${styles.highlight}">$1</mark>`
                )
              : previewText
          }}
        />
        {needsExpansion && (
          <button
            onClick={handlePreviewToggle}
            className={styles.expandButton}
            aria-label={showFullPreview ? 'Show less' : 'Show more'}
          >
            {showFullPreview ? 'Show less' : 'Show more'}
          </button>
        )}
      </div>
    );
  }, [
    showPreview, 
    result.preview, 
    showFullPreview, 
    handlePreviewToggle,
    styles.highlight
  ]);

  const renderTags = useCallback(() => {
    if (!result.metadata.tags || result.metadata.tags.length === 0) return null;

    return (
      <div className={styles.tagsList}>
        {result.metadata.tags.map(tag => (
          <span 
            key={tag} 
            className={`${styles.tag} ${isSelected ? styles.selected : ''}`}
          >
            {tag}
          </span>
        ))}
      </div>
    );
  }, [result.metadata.tags, isSelected]);

  const renderRelationships = useCallback(() => {
    if (!showRelationships || !result.relationships || result.relationships.length === 0) {
      return null;
    }

    return (
      <div className={styles.relationships}>
        <div className={styles.relationshipsTitle}>
          Related Content
        </div>
        <div className={styles.relationshipsList}>
          {result.relationships.map(rel => (
            <span key={rel.id} className={styles.relationshipItem}>
              <Link className={styles.relationshipIcon} size={12} />
              {rel.title}
            </span>
          ))}
        </div>
      </div>
    );
  }, [showRelationships, result.relationships]);

  const renderMetadata = useCallback(() => {
    if (!showMetadata) return null;

    return (
      <div className={styles.resultMeta}>
        <div className={styles.contentType}>
          {contentTypeIcon}
          {formatContentType(result.type)}
        </div>
        
        <div className={styles.dateInfo}>
          <Calendar size={14} className="mr-1" />
          {formatRelativeDate(result.metadata.created_at)}
        </div>
        
        {result.metadata.created_by && (
          <div className={styles.authorInfo}>
            <User size={14} className="mr-1" />
            Author
          </div>
        )}

        {renderLanguageBadge()}
        {renderRepositoryBadge()}
        {renderLineRange()}
      </div>
    );
  }, [
    showMetadata,
    contentTypeIcon,
    result.type,
    result.metadata,
    renderLanguageBadge,
    renderRepositoryBadge,
    renderLineRange
  ]);

  // ========================================================================
  // Main Render
  // ========================================================================

  const cardClasses = [
    styles.resultCard,
    isSelected && styles.selected,
    className
  ].filter(Boolean).join(' ');

  const titleClasses = [
    styles.resultTitle,
    isSelected && styles.selected
  ].filter(Boolean).join(' ');

  return (
    <div 
      className={cardClasses}
      onClick={handleCardClick}
      role="article"
      aria-selected={isSelected}
    >
      {/* Header */}
      <div className={styles.resultHeader}>
        <div className={styles.resultInfo}>
          <h3 className={titleClasses}>
            {result.title}
          </h3>
          {renderMetadata()}
        </div>
        
        <div className={styles.resultActions}>
          {renderQualityBadge()}
          
          <div className={styles.scoreIndicator}>
            <span className="text-xs mr-1">
              {Math.round(result.score.relevance * 100)}%
            </span>
            <div className={styles.scoreBar}>
              <div 
                className={`${styles.scoreFill} ${styles[relevanceLevel]}`}
                style={{ width: `${result.score.relevance * 100}%` }}
              />
            </div>
          </div>
          
          {onSelect && (
            <input
              type="checkbox"
              checked={isSelected}
              onChange={handleSelectChange}
              className={styles.selectCheckbox}
              aria-label={`Select ${result.title}`}
            />
          )}
        </div>
      </div>

      {/* Preview */}
      {renderPreview()}

      {/* Footer */}
      <div className={styles.resultFooter}>
        {renderTags()}
        
        {(result.relationships && result.relationships.length > 0) && (
          <button
            onClick={handleExpandToggle}
            className={styles.expandButton}
            aria-expanded={isExpanded}
          >
            Related ({result.relationships.length})
            {isExpanded ? (
              <ChevronUp size={12} className="ml-1" />
            ) : (
              <ChevronDown size={12} className="ml-1" />
            )}
          </button>
        )}
      </div>

      {/* Relationships (when expanded) */}
      {isExpanded && renderRelationships()}
    </div>
  );
}