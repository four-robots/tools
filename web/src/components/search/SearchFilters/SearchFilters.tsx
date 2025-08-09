/**
 * SearchFilters Component
 * 
 * Advanced filtering interface for search results
 */

import React, { useState, useCallback, useMemo, KeyboardEvent } from 'react';
import { Filter, ChevronDown, ChevronUp, Calendar, X, Tag } from 'lucide-react';
import { SearchFilters as SearchFiltersType, ContentType } from '@mcp-tools/core';
import { 
  SearchFiltersProps, 
  CONTENT_TYPE_LABELS,
  DEFAULT_SEARCH_FILTERS 
} from '../types';
import styles from './SearchFilters.module.css';

/**
 * SearchFilters component for advanced filtering
 */
export function SearchFilters({
  filters,
  onChange,
  availableTypes,
  isLoading = false,
  showAdvanced = false,
  onToggleAdvanced,
  className = '',
  onReset
}: SearchFiltersProps) {

  // ========================================================================
  // State Management
  // ========================================================================

  const [isAdvancedOpen, setIsAdvancedOpen] = useState(showAdvanced);
  const [tagInput, setTagInput] = useState('');
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);

  // ========================================================================
  // Filter Presets
  // ========================================================================

  const filterPresets = useMemo(() => ([
    {
      key: 'recent',
      label: 'Recent (7 days)',
      filters: {
        date_from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      }
    },
    {
      key: 'this_month',
      label: 'This Month',
      filters: {
        date_from: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
      }
    },
    {
      key: 'high_quality',
      label: 'High Quality',
      filters: {
        min_quality: 0.8
      }
    },
    {
      key: 'code_only',
      label: 'Code Only',
      filters: {
        content_types: ['code_file', 'code_chunk'] as ContentType[]
      }
    },
    {
      key: 'documents',
      label: 'Documents',
      filters: {
        content_types: ['wiki_page', 'scraped_page'] as ContentType[]
      }
    }
  ]), []);

  // ========================================================================
  // Active Filters Count
  // ========================================================================

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (filters.content_types?.length) count++;
    if (filters.date_from) count++;
    if (filters.date_to) count++;
    if (filters.tags?.length) count++;
    if (filters.min_quality && filters.min_quality > 0) count++;
    if (filters.language) count++;
    if (filters.repository) count++;
    return count;
  }, [filters]);

  // ========================================================================
  // Event Handlers
  // ========================================================================

  const handleContentTypeChange = useCallback((type: ContentType, checked: boolean) => {
    const currentTypes = filters.content_types || [];
    const newTypes = checked
      ? [...currentTypes, type]
      : currentTypes.filter(t => t !== type);

    onChange({
      ...filters,
      content_types: newTypes.length > 0 ? newTypes : undefined
    });
  }, [filters, onChange]);

  const handleDateChange = useCallback((field: 'date_from' | 'date_to', value: string) => {
    onChange({
      ...filters,
      [field]: value || undefined
    });
  }, [filters, onChange]);

  const handleQualityChange = useCallback((value: number) => {
    onChange({
      ...filters,
      min_quality: value > 0 ? value : undefined
    });
  }, [filters, onChange]);

  const handleTagInputKeyDown = useCallback((event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && tagInput.trim()) {
      event.preventDefault();
      const newTag = tagInput.trim().toLowerCase();
      const currentTags = filters.tags || [];
      
      if (!currentTags.includes(newTag)) {
        onChange({
          ...filters,
          tags: [...currentTags, newTag]
        });
      }
      
      setTagInput('');
    }
  }, [tagInput, filters, onChange]);

  const handleTagRemove = useCallback((tagToRemove: string) => {
    const currentTags = filters.tags || [];
    const newTags = currentTags.filter(tag => tag !== tagToRemove);
    
    onChange({
      ...filters,
      tags: newTags.length > 0 ? newTags : undefined
    });
  }, [filters, onChange]);

  const handlePresetSelect = useCallback((presetKey: string) => {
    const preset = filterPresets.find(p => p.key === presetKey);
    if (preset) {
      onChange({ ...filters, ...preset.filters });
      setSelectedPreset(presetKey);
    }
  }, [filterPresets, filters, onChange]);

  const handleReset = useCallback(() => {
    onChange(DEFAULT_SEARCH_FILTERS);
    setSelectedPreset(null);
    onReset?.();
  }, [onChange, onReset]);

  const handleToggleAdvanced = useCallback(() => {
    const newState = !isAdvancedOpen;
    setIsAdvancedOpen(newState);
    onToggleAdvanced?.();
  }, [isAdvancedOpen, onToggleAdvanced]);

  // ========================================================================
  // Render Helpers
  // ========================================================================

  const renderContentTypeFilters = useCallback(() => (
    <div className={styles.filterGroup}>
      <label className={styles.filterLabel}>
        Content Types
      </label>
      <div className={styles.checkboxGroup}>
        {availableTypes.map(type => {
          const isChecked = filters.content_types?.includes(type) || false;
          const typeCount = 0; // This would come from aggregations in a real implementation
          
          return (
            <div key={type} className={styles.checkboxItem}>
              <input
                type="checkbox"
                id={`content-type-${type}`}
                checked={isChecked}
                onChange={(e) => handleContentTypeChange(type, e.target.checked)}
                className={styles.checkbox}
                disabled={isLoading}
              />
              <label 
                htmlFor={`content-type-${type}`}
                className={styles.checkboxLabel}
              >
                {CONTENT_TYPE_LABELS[type]}
                {typeCount > 0 && (
                  <span className={styles.checkboxCount}>{typeCount}</span>
                )}
              </label>
            </div>
          );
        })}
      </div>
    </div>
  ), [availableTypes, filters.content_types, handleContentTypeChange, isLoading]);

  const renderDateRangeFilters = useCallback(() => (
    <div className={styles.filterGroup}>
      <label className={styles.filterLabel}>
        <Calendar className="inline w-4 h-4 mr-1" />
        Date Range
      </label>
      <div className={styles.dateRange}>
        <div>
          <label htmlFor="date-from" className="sr-only">From date</label>
          <input
            type="date"
            id="date-from"
            value={filters.date_from ? filters.date_from.split('T')[0] : ''}
            onChange={(e) => handleDateChange('date_from', e.target.value)}
            className={styles.dateInput}
            disabled={isLoading}
            placeholder="From date"
          />
        </div>
        <div>
          <label htmlFor="date-to" className="sr-only">To date</label>
          <input
            type="date"
            id="date-to"
            value={filters.date_to ? filters.date_to.split('T')[0] : ''}
            onChange={(e) => handleDateChange('date_to', e.target.value)}
            className={styles.dateInput}
            disabled={isLoading}
            placeholder="To date"
          />
        </div>
      </div>
    </div>
  ), [filters.date_from, filters.date_to, handleDateChange, isLoading]);

  const renderQualityFilter = useCallback(() => (
    <div className={styles.filterGroup}>
      <label className={styles.filterLabel}>
        Minimum Quality: {Math.round((filters.min_quality || 0) * 100)}%
      </label>
      <div className={styles.sliderContainer}>
        <input
          type="range"
          min="0"
          max="1"
          step="0.1"
          value={filters.min_quality || 0}
          onChange={(e) => handleQualityChange(parseFloat(e.target.value))}
          className={styles.sliderTrack}
          disabled={isLoading}
          aria-label="Minimum quality threshold"
        />
      </div>
    </div>
  ), [filters.min_quality, handleQualityChange, isLoading]);

  const renderTagsFilter = useCallback(() => (
    <div className={styles.filterGroup}>
      <label className={styles.filterLabel}>
        <Tag className="inline w-4 h-4 mr-1" />
        Tags
      </label>
      <input
        type="text"
        value={tagInput}
        onChange={(e) => setTagInput(e.target.value)}
        onKeyDown={handleTagInputKeyDown}
        placeholder="Type a tag and press Enter"
        className={styles.tagInput}
        disabled={isLoading}
        aria-label="Add tags filter"
      />
      {filters.tags && filters.tags.length > 0 && (
        <div className={styles.tagList}>
          {filters.tags.map(tag => (
            <span key={tag} className={styles.tag}>
              {tag}
              <button
                onClick={() => handleTagRemove(tag)}
                className={styles.tagRemove}
                aria-label={`Remove ${tag} tag`}
                disabled={isLoading}
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  ), [tagInput, filters.tags, handleTagInputKeyDown, handleTagRemove, isLoading]);

  const renderAdvancedFilters = useCallback(() => (
    <div className={`${styles.advancedFilters} ${!isAdvancedOpen ? styles.collapsed : ''}`}>
      <div className={styles.filterGroup}>
        <label className={styles.filterLabel}>Language (for code)</label>
        <input
          type="text"
          value={filters.language || ''}
          onChange={(e) => onChange({ ...filters, language: e.target.value || undefined })}
          placeholder="e.g., typescript, python, java"
          className={styles.tagInput}
          disabled={isLoading}
        />
      </div>
      
      <div className={styles.filterGroup}>
        <label className={styles.filterLabel}>Repository (for code)</label>
        <input
          type="text"
          value={filters.repository || ''}
          onChange={(e) => onChange({ ...filters, repository: e.target.value || undefined })}
          placeholder="e.g., my-project, github.com/user/repo"
          className={styles.tagInput}
          disabled={isLoading}
        />
      </div>
    </div>
  ), [isAdvancedOpen, filters, onChange, isLoading]);

  // ========================================================================
  // Main Render
  // ========================================================================

  return (
    <div className={`${styles.filtersContainer} ${className}`}>
      {/* Header */}
      <div className={styles.filtersHeader}>
        <div className={styles.filtersTitle}>
          <Filter className={styles.filtersIcon} size={16} />
          Filters
          {activeFiltersCount > 0 && (
            <span className={styles.activeFiltersCount}>
              ({activeFiltersCount})
            </span>
          )}
        </div>
        <div className="flex items-center">
          {activeFiltersCount > 0 && (
            <button 
              onClick={handleReset} 
              className={styles.resetButton}
              disabled={isLoading}
            >
              Reset All
            </button>
          )}
          <button
            onClick={handleToggleAdvanced}
            className={styles.toggleButton}
            disabled={isLoading}
            aria-expanded={isAdvancedOpen}
          >
            {isAdvancedOpen ? (
              <>
                Less <ChevronUp className="inline w-3 h-3 ml-1" />
              </>
            ) : (
              <>
                More <ChevronDown className="inline w-3 h-3 ml-1" />
              </>
            )}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className={styles.filtersContent}>
        {/* Filter Presets */}
        <div className={styles.filterGroup}>
          <div className={styles.presetButtons}>
            {filterPresets.map(preset => (
              <button
                key={preset.key}
                onClick={() => handlePresetSelect(preset.key)}
                className={`${styles.presetButton} ${
                  selectedPreset === preset.key ? styles.active : ''
                }`}
                disabled={isLoading}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* Basic Filters */}
        {renderContentTypeFilters()}
        {renderDateRangeFilters()}
        {renderQualityFilter()}
        {renderTagsFilter()}

        {/* Advanced Filters */}
        {renderAdvancedFilters()}
      </div>

      {/* Loading Overlay */}
      {isLoading && (
        <div className={styles.loadingOverlay}>
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500" />
        </div>
      )}
    </div>
  );
}