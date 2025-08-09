/**
 * Search Page Route
 * 
 * Main search page with URL parameter handling and SEO optimization
 */

import { Metadata } from 'next';
import { Suspense } from 'react';
import { SearchPage } from '@/components/search/SearchPage';
import { PageWrapper } from '@/components/PageWrapper';
import { SearchLoading } from '@/components/search/common';
import { extractSearchParams } from '@/hooks/useSearchParams';

interface SearchPageProps {
  searchParams: { [key: string]: string | string[] | undefined };
}

// Generate metadata based on search parameters
export function generateMetadata({ searchParams }: SearchPageProps): Metadata {
  const extracted = extractSearchParams(searchParams);
  const query = extracted.q;
  
  const title = query 
    ? `Search results for "${query}" - MCP Tools`
    : 'Search - MCP Tools';
    
  const description = query
    ? `Search results for "${query}" across kanban cards, wiki pages, memory thoughts, and web content.`
    : 'Search across all your content - kanban cards, wiki pages, memory thoughts, and scraped content.';
  
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      siteName: 'MCP Tools',
    },
    twitter: {
      card: 'summary',
      title,
      description,
    },
    robots: {
      index: true,
      follow: true,
    },
    alternates: {
      canonical: query ? `/search?q=${encodeURIComponent(query)}` : '/search',
    },
  };
}

// Page component with proper error boundaries and loading states
function SearchPageContent({ searchParams }: SearchPageProps) {
  const extracted = extractSearchParams(searchParams);
  
  return (
    <SearchPage 
      initialParams={{
        query: extracted.q || '',
        filters: {
          content_types: extracted.type ? extracted.type.split(',') : undefined,
          date_range: (extracted.date_from || extracted.date_to) ? {
            from: extracted.date_from,
            to: extracted.date_to
          } : undefined,
          quality_min: extracted.quality ? parseFloat(extracted.quality) : undefined,
          tags: extracted.tags ? extracted.tags.split(',') : undefined,
        },
        sort: (['relevance', 'date_desc', 'date_asc', 'quality_desc'].includes(extracted.sort || '') 
          ? extracted.sort 
          : 'relevance') as any,
        page: extracted.page ? Math.max(1, parseInt(extracted.page, 10)) : 1,
        pageSize: extracted.per_page ? Math.max(10, Math.min(100, parseInt(extracted.per_page, 10))) : 20,
        view: (extracted.view === 'grid' || extracted.view === 'list') ? extracted.view : undefined,
      }}
    />
  );
}

export default function SearchRoutePage({ searchParams }: SearchPageProps) {
  return (
    <PageWrapper
      loadingFallback={
        <SearchLoading message="Initializing search..." />
      }
    >
      <Suspense fallback={<SearchLoading message="Loading search interface..." />}>
        <SearchPageContent searchParams={searchParams} />
      </Suspense>
    </PageWrapper>
  );
}

// Enable static generation for empty search page
export const dynamic = 'force-dynamic'; // Due to search params
export const revalidate = false;