/**
 * SearchInput Component
 * 
 * Main search input with autocomplete, suggestions, and keyboard shortcuts
 */

import React, { 
  useState, 
  useRef, 
  useEffect, 
  useCallback,
  KeyboardEvent,
  ChangeEvent,
  FocusEvent
} from 'react';
import { Search, X, Loader2, Command } from 'lucide-react';
import { SearchInputProps, SearchSuggestion } from '../types';
import { SearchSuggestions } from '../SearchSuggestions';
import { useSearchSuggestions } from '../hooks';
import { normalizeQuery } from '../utils/searchHelpers';
import styles from './SearchInput.module.css';

/**
 * SearchInput component with autocomplete and suggestions
 */
export function SearchInput({
  value,
  onChange,
  onSubmit,
  placeholder = 'Search across all content...',
  suggestions: externalSuggestions,
  isLoading = false,
  disabled = false,
  autoFocus = false,
  showSuggestions = true,
  className = '',
  onSuggestionSelect,
  onClear,
  maxLength = 1000
}: SearchInputProps) {
  
  // ========================================================================
  // State and Refs
  // ========================================================================

  const [isFocused, setIsFocused] = useState(false);
  const [showSuggestionsDropdown, setShowSuggestionsDropdown] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  const [showShortcutHint, setShowShortcutHint] = useState(true);

  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Use internal suggestions hook if external suggestions not provided
  const {
    suggestions: internalSuggestions,
    isLoading: suggestionsLoading,
    fetchSuggestions,
    clearSuggestions
  } = useSearchSuggestions({
    debounceMs: 200,
    maxSuggestions: 8,
    includePopular: true,
    includeGenerated: true
  });

  const activeSuggestions = externalSuggestions || internalSuggestions;
  const showLoader = isLoading || suggestionsLoading;

  // ========================================================================
  // Event Handlers
  // ========================================================================

  const handleInputChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const newValue = event.target.value;
    
    if (newValue.length <= maxLength) {
      onChange(newValue);
      
      // Fetch suggestions if showing suggestions and value is not empty
      if (showSuggestions && !externalSuggestions) {
        if (newValue.trim()) {
          fetchSuggestions(newValue);
        } else {
          clearSuggestions();
        }
      }
      
      // Show suggestions dropdown if we have a query
      setShowSuggestionsDropdown(newValue.trim().length > 0 && showSuggestions);
      setSelectedSuggestionIndex(-1);
    }
  }, [
    onChange, 
    maxLength, 
    showSuggestions, 
    externalSuggestions, 
    fetchSuggestions, 
    clearSuggestions
  ]);

  const handleInputFocus = useCallback((event: FocusEvent<HTMLInputElement>) => {
    setIsFocused(true);
    setShowShortcutHint(false);
    
    // Show suggestions if we have a query
    if (value.trim() && showSuggestions) {
      setShowSuggestionsDropdown(true);
    }
  }, [value, showSuggestions]);

  const handleInputBlur = useCallback((event: FocusEvent<HTMLInputElement>) => {
    setIsFocused(false);
    
    // Delay hiding suggestions to allow for suggestion clicks
    setTimeout(() => {
      setShowSuggestionsDropdown(false);
      setSelectedSuggestionIndex(-1);
      if (!value.trim()) {
        setShowShortcutHint(true);
      }
    }, 150);
  }, [value]);

  const handleSubmit = useCallback(() => {
    const query = normalizeQuery(value);
    if (query) {
      onSubmit(query);
      setShowSuggestionsDropdown(false);
      setSelectedSuggestionIndex(-1);
      inputRef.current?.blur();
    }
  }, [value, onSubmit]);

  const handleClear = useCallback(() => {
    onChange('');
    setShowSuggestionsDropdown(false);
    setSelectedSuggestionIndex(-1);
    clearSuggestions();
    onClear?.();
    inputRef.current?.focus();
  }, [onChange, clearSuggestions, onClear]);

  const handleSuggestionSelect = useCallback((suggestion: SearchSuggestion) => {
    onChange(suggestion.query);
    onSuggestionSelect?.(suggestion);
    setShowSuggestionsDropdown(false);
    setSelectedSuggestionIndex(-1);
    
    // Auto-submit the suggestion
    setTimeout(() => {
      onSubmit(suggestion.query);
    }, 100);
  }, [onChange, onSuggestionSelect, onSubmit]);

  // ========================================================================
  // Keyboard Handling
  // ========================================================================

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case 'Enter':
        event.preventDefault();
        if (selectedSuggestionIndex >= 0 && activeSuggestions[selectedSuggestionIndex]) {
          handleSuggestionSelect(activeSuggestions[selectedSuggestionIndex]);
        } else {
          handleSubmit();
        }
        break;
      
      case 'ArrowDown':
        event.preventDefault();
        if (showSuggestionsDropdown && activeSuggestions.length > 0) {
          setSelectedSuggestionIndex(prev => 
            prev < activeSuggestions.length - 1 ? prev + 1 : 0
          );
        }
        break;
      
      case 'ArrowUp':
        event.preventDefault();
        if (showSuggestionsDropdown && activeSuggestions.length > 0) {
          setSelectedSuggestionIndex(prev => 
            prev > 0 ? prev - 1 : activeSuggestions.length - 1
          );
        }
        break;
      
      case 'Escape':
        event.preventDefault();
        if (showSuggestionsDropdown) {
          setShowSuggestionsDropdown(false);
          setSelectedSuggestionIndex(-1);
        } else {
          inputRef.current?.blur();
        }
        break;
      
      case 'Tab':
        if (selectedSuggestionIndex >= 0 && activeSuggestions[selectedSuggestionIndex]) {
          event.preventDefault();
          onChange(activeSuggestions[selectedSuggestionIndex].query);
        }
        break;
    }
  }, [
    selectedSuggestionIndex,
    activeSuggestions,
    showSuggestionsDropdown,
    handleSuggestionSelect,
    handleSubmit,
    onChange
  ]);

  // ========================================================================
  // Keyboard Shortcuts
  // ========================================================================

  useEffect(() => {
    const handleGlobalKeyDown = (event: globalThis.KeyboardEvent) => {
      // Cmd/Ctrl + K to focus search
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault();
        inputRef.current?.focus();
      }
      
      // Escape to clear and blur if input is focused
      if (event.key === 'Escape' && document.activeElement === inputRef.current) {
        if (value) {
          handleClear();
        } else {
          inputRef.current?.blur();
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [value, handleClear]);

  // ========================================================================
  // Auto Focus
  // ========================================================================

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  // ========================================================================
  // Outside Click Handler
  // ========================================================================

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowSuggestionsDropdown(false);
        setSelectedSuggestionIndex(-1);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ========================================================================
  // Render
  // ========================================================================

  const inputClasses = [
    styles.searchInput,
    showLoader && styles.loading,
    className
  ].filter(Boolean).join(' ');

  return (
    <div ref={containerRef} className={`${styles.searchInputContainer} ${className}`}>
      <div className={styles.searchInputWrapper}>
        {/* Search Icon */}
        <Search 
          className={`${styles.searchIcon} ${isFocused ? styles.searchIconActive : ''}`}
          size={20}
        />
        
        {/* Input Field */}
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          maxLength={maxLength}
          className={inputClasses}
          aria-label="Search input"
          aria-expanded={showSuggestionsDropdown}
          aria-autocomplete="list"
          role="combobox"
          aria-describedby="search-suggestions"
        />
        
        {/* Loading Spinner */}
        {showLoader && (
          <Loader2 
            className={styles.loadingSpinner}
            size={20}
            aria-label="Loading suggestions"
          />
        )}
        
        {/* Clear Button */}
        {value && !showLoader && (
          <button
            onClick={handleClear}
            className={`${styles.clearButton} ${showLoader ? styles.loading : ''}`}
            aria-label="Clear search"
            type="button"
          >
            <X size={20} />
          </button>
        )}
        
        {/* Keyboard Shortcut Hint */}
        {showShortcutHint && !value && !isFocused && (
          <div className={styles.shortcutHint}>
            <Command size={12} className="inline mr-1" />
            K
          </div>
        )}
      </div>
      
      {/* Suggestions Dropdown */}
      {showSuggestionsDropdown && activeSuggestions.length > 0 && (
        <SearchSuggestions
          query={value}
          suggestions={activeSuggestions}
          isVisible={showSuggestionsDropdown}
          isLoading={suggestionsLoading}
          onSuggestionSelect={handleSuggestionSelect}
          onClose={() => setShowSuggestionsDropdown(false)}
          selectedIndex={selectedSuggestionIndex}
        />
      )}
    </div>
  );
}