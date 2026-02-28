/**
 * Search Helper Utilities
 * 
 * Helper functions and utilities for search operations
 */

import { 
  SearchResult, 
  SearchFilters, 
  ContentType,
  SearchSort
} from '@mcp-tools/core';
import { 
  SearchSuggestion, 
  PaginationData, 
  CONTENT_TYPE_LABELS,
  DateRange
} from '../types';

// ============================================================================
// Query Processing
// ============================================================================

/**
 * Debounce function for search input
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  waitMs: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout;
  
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(null, args), waitMs);
  };
}

/**
 * Clean and normalize search query
 */
export function normalizeQuery(query: string): string {
  return query
    .trim()
    .replace(/\s+/g, ' ') // Replace multiple spaces with single space
    .replace(/[^\w\s\-_.@]/g, '') // Remove special characters except common ones
    .toLowerCase();
}

/**
 * Extract search terms from query
 */
export function extractSearchTerms(query: string): string[] {
  return normalizeQuery(query)
    .split(' ')
    .filter(term => term.length > 1) // Filter out single character terms
    .filter(term => !isStopWord(term));
}

/**
 * Check if a word is a stop word
 */
export function isStopWord(word: string): boolean {
  const stopWords = new Set([
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 
    'from', 'has', 'he', 'in', 'is', 'it', 'its', 'of', 'on',
    'that', 'the', 'to', 'was', 'will', 'with', 'the'
  ]);
  
  return stopWords.has(word.toLowerCase());
}

/**
 * Generate search suggestions based on query
 */
export function generateQuerySuggestions(
  query: string, 
  existingSuggestions: SearchSuggestion[] = []
): SearchSuggestion[] {
  const suggestions: SearchSuggestion[] = [];
  const queryLower = query.toLowerCase();
  
  // Add completion suggestions
  if (query.length >= 2) {
    const completions = [
      `${query} tutorial`,
      `${query} example`,
      `${query} documentation`,
      `${query} guide`,
      `how to ${query}`,
      `${query} best practices`
    ];
    
    completions.forEach((completion, index) => {
      suggestions.push({
        id: `completion_${index}`,
        query: completion,
        type: 'completion',
        confidence: Math.max(0.8 - (index * 0.1), 0.3)
      });
    });
  }
  
  // Merge with existing suggestions, avoiding duplicates
  const existingQueries = new Set(existingSuggestions.map(s => s.query.toLowerCase()));
  const uniqueSuggestions = suggestions.filter(s => !existingQueries.has(s.query.toLowerCase()));
  
  return [...existingSuggestions, ...uniqueSuggestions];
}

// ============================================================================
// Result Processing
// ============================================================================

/**
 * Calculate result relevance score
 */
export function calculateRelevance(result: SearchResult, query: string): number {
  const terms = extractSearchTerms(query);
  if (terms.length === 0) return result.score.relevance;
  
  let relevance = result.score.relevance;
  
  // Boost for title matches
  const titleMatches = terms.filter(term => 
    result.title.toLowerCase().includes(term)
  ).length;
  relevance += (titleMatches / terms.length) * 0.2;
  
  // Boost for preview matches
  if (result.preview) {
    const previewMatches = terms.filter(term =>
      result.preview!.text.toLowerCase().includes(term)
    ).length;
    relevance += (previewMatches / terms.length) * 0.1;
  }
  
  // Quality boost
  if (result.score.quality_score) {
    relevance += result.score.quality_score * 0.1;
  }
  
  return Math.min(relevance, 1);
}

/**
 * Group results by content type
 */
export function groupResultsByType(results: SearchResult[]): Record<ContentType, SearchResult[]> {
  const grouped: Record<string, SearchResult[]> = {};
  
  results.forEach(result => {
    if (!grouped[result.type]) {
      grouped[result.type] = [];
    }
    grouped[result.type].push(result);
  });
  
  return grouped as Record<ContentType, SearchResult[]>;
}

/**
 * Sort results by various criteria
 */
export function sortResults(results: SearchResult[], sortBy: SearchSort): SearchResult[] {
  const sortedResults = [...results];
  
  switch (sortBy) {
    case 'relevance':
      return sortedResults.sort((a, b) => b.score.relevance - a.score.relevance);
    
    case 'date_desc':
      return sortedResults.sort((a, b) => 
        new Date(b.metadata.created_at).getTime() - new Date(a.metadata.created_at).getTime()
      );
    
    case 'date_asc':
      return sortedResults.sort((a, b) => 
        new Date(a.metadata.created_at).getTime() - new Date(b.metadata.created_at).getTime()
      );
    
    case 'title_asc':
      return sortedResults.sort((a, b) => a.title.localeCompare(b.title));
    
    case 'title_desc':
      return sortedResults.sort((a, b) => b.title.localeCompare(a.title));
    
    case 'quality_desc':
      return sortedResults.sort((a, b) => 
        (b.score.quality_score || 0) - (a.score.quality_score || 0)
      );
    
    default:
      return sortedResults;
  }
}

/**
 * Filter results based on criteria
 */
export function filterResults(
  results: SearchResult[], 
  filters: SearchFilters
): SearchResult[] {
  return results.filter(result => {
    // Filter by content types
    if (filters.content_types && filters.content_types.length > 0) {
      if (!filters.content_types.includes(result.type)) {
        return false;
      }
    }
    
    // Filter by date range
    if (filters.date_from || filters.date_to) {
      const createdAt = new Date(result.metadata.created_at);
      
      if (filters.date_from && createdAt < new Date(filters.date_from)) {
        return false;
      }
      
      if (filters.date_to && createdAt > new Date(filters.date_to)) {
        return false;
      }
    }
    
    // Filter by tags
    if (filters.tags && filters.tags.length > 0) {
      const resultTags = result.metadata.tags || [];
      const hasMatchingTag = filters.tags.some(tag => 
        resultTags.includes(tag)
      );
      
      if (!hasMatchingTag) {
        return false;
      }
    }
    
    // Filter by minimum quality
    if (filters.min_quality) {
      const quality = result.score.quality_score || 0;
      if (quality < filters.min_quality) {
        return false;
      }
    }
    
    // Filter by language (for code content)
    if (filters.language && result.metadata.language) {
      if (result.metadata.language !== filters.language) {
        return false;
      }
    }
    
    // Filter by repository (for code content)
    if (filters.repository && result.metadata.repository) {
      if (result.metadata.repository !== filters.repository) {
        return false;
      }
    }
    
    return true;
  });
}

// ============================================================================
// Pagination Utilities
// ============================================================================

/**
 * Calculate pagination data
 */
export function calculatePagination(
  totalItems: number,
  currentPage: number,
  itemsPerPage: number
): PaginationData {
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  
  return {
    currentPage: Math.max(1, Math.min(currentPage, totalPages)),
    totalPages,
    totalItems,
    itemsPerPage,
    hasNext: currentPage < totalPages,
    hasPrev: currentPage > 1
  };
}

/**
 * Generate pagination links
 */
export function generatePaginationLinks(
  currentPage: number,
  totalPages: number,
  maxLinks: number = 7
): number[] {
  if (totalPages <= maxLinks) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  
  const halfMax = Math.floor(maxLinks / 2);
  let start = Math.max(1, currentPage - halfMax);
  let end = Math.min(totalPages, start + maxLinks - 1);
  
  // Adjust start if we're near the end
  if (end - start + 1 < maxLinks) {
    start = Math.max(1, end - maxLinks + 1);
  }
  
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

// ============================================================================
// Formatting Utilities
// ============================================================================

/**
 * Format content type for display
 */
export function formatContentType(type: ContentType): string {
  return CONTENT_TYPE_LABELS[type] || type;
}

/**
 * Format file size
 */
export function formatFileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  
  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

/**
 * Format date relative to now
 */
export function formatRelativeDate(date: string | Date): string {
  const now = new Date();
  const targetDate = typeof date === 'string' ? new Date(date) : date;
  const diffMs = now.getTime() - targetDate.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) {
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours === 0) {
      const diffMinutes = Math.floor(diffMs / (1000 * 60));
      return `${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''} ago`;
    }
    return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
  } else if (diffDays < 7) {
    return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
  } else if (diffDays < 30) {
    const diffWeeks = Math.floor(diffDays / 7);
    return `${diffWeeks} week${diffWeeks !== 1 ? 's' : ''} ago`;
  } else if (diffDays < 365) {
    const diffMonths = Math.floor(diffDays / 30);
    return `${diffMonths} month${diffMonths !== 1 ? 's' : ''} ago`;
  } else {
    const diffYears = Math.floor(diffDays / 365);
    return `${diffYears} year${diffYears !== 1 ? 's' : ''} ago`;
  }
}

/**
 * Highlight search terms in text
 */
export function highlightSearchTerms(
  text: string,
  terms: string[],
  className: string = 'search-highlight'
): string {
  if (!terms.length) return text;

  // Escape HTML in the text to prevent XSS
  let highlightedText = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  terms.forEach(term => {
    const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escapedTerm})`, 'gi');
    highlightedText = highlightedText.replace(
      regex,
      `<mark class="${className}">$1</mark>`
    );
  });
  
  return highlightedText;
}

/**
 * Truncate text with ellipsis
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  
  // Try to break at word boundary
  const truncated = text.substring(0, maxLength);
  const lastSpaceIndex = truncated.lastIndexOf(' ');
  
  if (lastSpaceIndex > maxLength * 0.8) {
    return truncated.substring(0, lastSpaceIndex) + '...';
  }
  
  return truncated + '...';
}

// ============================================================================
// URL and Navigation Helpers
// ============================================================================

/**
 * Build search URL with parameters
 */
export function buildSearchURL(
  query: string,
  filters?: SearchFilters,
  page?: number
): string {
  const params = new URLSearchParams();
  
  if (query) params.set('q', query);
  if (page && page > 1) params.set('page', page.toString());
  
  if (filters?.content_types?.length) {
    params.set('types', filters.content_types.join(','));
  }
  
  if (filters?.tags?.length) {
    params.set('tags', filters.tags.join(','));
  }
  
  if (filters?.date_from) {
    params.set('from', filters.date_from);
  }
  
  if (filters?.date_to) {
    params.set('to', filters.date_to);
  }
  
  const queryString = params.toString();
  return `/search${queryString ? `?${queryString}` : ''}`;
}

/**
 * Parse search URL parameters
 */
export function parseSearchURL(searchParams: URLSearchParams): {
  query: string;
  filters: SearchFilters;
  page: number;
} {
  const query = searchParams.get('q') || '';
  const page = parseInt(searchParams.get('page') || '1', 10);
  
  const filters: SearchFilters = {};
  
  const types = searchParams.get('types');
  if (types) {
    filters.content_types = types.split(',') as ContentType[];
  }
  
  const tags = searchParams.get('tags');
  if (tags) {
    filters.tags = tags.split(',');
  }
  
  const dateFrom = searchParams.get('from');
  if (dateFrom) {
    filters.date_from = dateFrom;
  }
  
  const dateTo = searchParams.get('to');
  if (dateTo) {
    filters.date_to = dateTo;
  }
  
  return { query, filters, page };
}