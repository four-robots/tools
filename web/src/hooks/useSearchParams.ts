/**
 * URL Search Parameters Management Hook
 * 
 * Manages synchronization between search state and URL parameters,
 * providing shareable URLs and browser navigation support
 */

'use client';

import { useCallback, useMemo } from 'react';
import { useRouter, useSearchParams as useNextSearchParams } from 'next/navigation';
import { SearchFilters, SearchSort } from '@mcp-tools/core';
import { DEFAULT_SEARCH_FILTERS, DEFAULT_PAGINATION } from '@/components/search/types';

// URL parameter names
const URL_PARAMS = {
  query: 'q',
  contentTypes: 'type',
  dateFrom: 'date_from', 
  dateTo: 'date_to',
  qualityMin: 'quality',
  tags: 'tags',
  page: 'page',
  sort: 'sort',
  pageSize: 'per_page',
  view: 'view'
} as const;

export interface SearchParams {
  q?: string;
  type?: string;
  date_from?: string;
  date_to?: string;
  quality?: string;
  tags?: string;
  page?: string;
  sort?: string;
  per_page?: string;
  view?: string;
}

export interface ParsedSearchParams {
  query: string;
  filters: SearchFilters;
  sort: SearchSort;
  page: number;
  pageSize: number;
  view?: 'grid' | 'list';
}

export interface UseSearchParamsReturn {
  // Current parsed parameters
  searchParams: ParsedSearchParams;
  
  // URL building helpers
  buildSearchUrl: (params: Partial<ParsedSearchParams>) => string;
  
  // Individual parameter updates
  updateQuery: (query: string) => void;
  updateFilters: (filters: SearchFilters) => void;
  updateSort: (sort: SearchSort) => void;
  updatePagination: (page: number, pageSize?: number) => void;
  updateView: (view: 'grid' | 'list') => void;
  
  // Bulk updates
  updateParams: (params: Partial<ParsedSearchParams>) => void;
  resetSearch: () => void;
  
  // URL string for sharing
  shareableUrl: string;
}

/**
 * Parse URL search parameters into structured search state
 */
function parseUrlParams(searchParams: URLSearchParams): ParsedSearchParams {
  const query = searchParams.get(URL_PARAMS.query) || '';
  
  // Parse content types
  const contentTypesParam = searchParams.get(URL_PARAMS.contentTypes);
  const contentTypes = contentTypesParam ? contentTypesParam.split(',') : undefined;
  
  // Parse date range
  const dateFromParam = searchParams.get(URL_PARAMS.dateFrom);
  const dateToParam = searchParams.get(URL_PARAMS.dateTo);
  const dateRange = (dateFromParam || dateToParam) ? {
    from: dateFromParam || undefined,
    to: dateToParam || undefined
  } : undefined;
  
  // Parse quality minimum
  const qualityParam = searchParams.get(URL_PARAMS.qualityMin);
  const qualityMin = qualityParam ? parseFloat(qualityParam) : undefined;
  
  // Parse tags
  const tagsParam = searchParams.get(URL_PARAMS.tags);
  const tags = tagsParam ? tagsParam.split(',') : undefined;
  
  // Parse pagination
  const pageParam = searchParams.get(URL_PARAMS.page);
  const pageSizeParam = searchParams.get(URL_PARAMS.pageSize);
  const page = pageParam ? Math.max(1, parseInt(pageParam, 10)) : 1;
  const pageSize = pageSizeParam ? Math.max(10, Math.min(100, parseInt(pageSizeParam, 10))) : DEFAULT_PAGINATION.itemsPerPage;
  
  // Parse sort
  const sortParam = searchParams.get(URL_PARAMS.sort) as SearchSort;
  const sort: SearchSort = ['relevance', 'date_desc', 'date_asc', 'quality_desc'].includes(sortParam) 
    ? sortParam 
    : 'relevance';
    
  // Parse view
  const viewParam = searchParams.get(URL_PARAMS.view);
  const view = (viewParam === 'grid' || viewParam === 'list') ? viewParam : undefined;
  
  return {
    query,
    filters: {
      ...DEFAULT_SEARCH_FILTERS,
      content_types: contentTypes,
      date_range: dateRange,
      quality_min: qualityMin,
      tags
    },
    sort,
    page,
    pageSize,
    view
  };
}

/**
 * Convert search parameters to URL search string
 */
function buildUrlParams(params: Partial<ParsedSearchParams>): URLSearchParams {
  const urlParams = new URLSearchParams();
  
  // Add query
  if (params.query && params.query.trim()) {
    urlParams.set(URL_PARAMS.query, params.query.trim());
  }
  
  // Add content types
  if (params.filters?.content_types?.length) {
    urlParams.set(URL_PARAMS.contentTypes, params.filters.content_types.join(','));
  }
  
  // Add date range
  if (params.filters?.date_range?.from) {
    urlParams.set(URL_PARAMS.dateFrom, params.filters.date_range.from);
  }
  if (params.filters?.date_range?.to) {
    urlParams.set(URL_PARAMS.dateTo, params.filters.date_range.to);
  }
  
  // Add quality minimum
  if (params.filters?.quality_min !== undefined && params.filters.quality_min > 0) {
    urlParams.set(URL_PARAMS.qualityMin, params.filters.quality_min.toString());
  }
  
  // Add tags
  if (params.filters?.tags?.length) {
    urlParams.set(URL_PARAMS.tags, params.filters.tags.join(','));
  }
  
  // Add pagination (only if not default)
  if (params.page && params.page > 1) {
    urlParams.set(URL_PARAMS.page, params.page.toString());
  }
  if (params.pageSize && params.pageSize !== DEFAULT_PAGINATION.itemsPerPage) {
    urlParams.set(URL_PARAMS.pageSize, params.pageSize.toString());
  }
  
  // Add sort (only if not default)
  if (params.sort && params.sort !== 'relevance') {
    urlParams.set(URL_PARAMS.sort, params.sort);
  }
  
  // Add view
  if (params.view) {
    urlParams.set(URL_PARAMS.view, params.view);
  }
  
  return urlParams;
}

/**
 * Hook for managing URL search parameters
 */
export function useSearchParams(initialParams?: SearchParams): UseSearchParamsReturn {
  const router = useRouter();
  const nextSearchParams = useNextSearchParams();
  
  // Parse current URL parameters
  const searchParams = useMemo(() => {
    // If we have initial params (from server-side), use them
    if (initialParams) {
      const params = new URLSearchParams();
      Object.entries(initialParams).forEach(([key, value]) => {
        if (value) params.set(key, value);
      });
      return parseUrlParams(params);
    }
    
    // Otherwise parse from current URL
    return parseUrlParams(nextSearchParams);
  }, [initialParams, nextSearchParams]);
  
  // Build URL with new parameters
  const buildSearchUrl = useCallback((params: Partial<ParsedSearchParams>): string => {
    const urlParams = buildUrlParams({
      ...searchParams,
      ...params
    });
    
    const searchString = urlParams.toString();
    return searchString ? `/search?${searchString}` : '/search';
  }, [searchParams]);
  
  // Navigate to new URL
  const navigateToUrl = useCallback((params: Partial<ParsedSearchParams>) => {
    const url = buildSearchUrl(params);
    router.push(url);
  }, [buildSearchUrl, router]);
  
  // Individual parameter update functions
  const updateQuery = useCallback((query: string) => {
    navigateToUrl({ query, page: 1 }); // Reset to first page on new query
  }, [navigateToUrl]);
  
  const updateFilters = useCallback((filters: SearchFilters) => {
    navigateToUrl({ filters, page: 1 }); // Reset to first page on filter change
  }, [navigateToUrl]);
  
  const updateSort = useCallback((sort: SearchSort) => {
    navigateToUrl({ sort, page: 1 }); // Reset to first page on sort change
  }, [navigateToUrl]);
  
  const updatePagination = useCallback((page: number, pageSize?: number) => {
    const updates: Partial<ParsedSearchParams> = { page };
    if (pageSize !== undefined) {
      updates.pageSize = pageSize;
      updates.page = 1; // Reset to first page when changing page size
    }
    navigateToUrl(updates);
  }, [navigateToUrl]);
  
  const updateView = useCallback((view: 'grid' | 'list') => {
    navigateToUrl({ view });
  }, [navigateToUrl]);
  
  // Bulk parameter update
  const updateParams = useCallback((params: Partial<ParsedSearchParams>) => {
    navigateToUrl(params);
  }, [navigateToUrl]);
  
  // Reset search to defaults
  const resetSearch = useCallback(() => {
    router.push('/search');
  }, [router]);
  
  // Generate shareable URL
  const shareableUrl = useMemo(() => {
    if (typeof window !== 'undefined') {
      const url = buildSearchUrl(searchParams);
      return `${window.location.origin}${url}`;
    }
    return buildSearchUrl(searchParams);
  }, [buildSearchUrl, searchParams]);
  
  return {
    searchParams,
    buildSearchUrl,
    updateQuery,
    updateFilters,
    updateSort,
    updatePagination,
    updateView,
    updateParams,
    resetSearch,
    shareableUrl
  };
}

/**
 * Helper function to extract search params from Next.js page props
 */
export function extractSearchParams(params: { [key: string]: string | string[] | undefined }): SearchParams {
  const extracted: SearchParams = {};
  
  Object.entries(URL_PARAMS).forEach(([key, urlParam]) => {
    const value = params[urlParam];
    if (typeof value === 'string') {
      extracted[urlParam as keyof SearchParams] = value;
    }
  });
  
  return extracted;
}