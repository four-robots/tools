import React, { useMemo } from 'react';
import { 
  DocumentIcon, 
  ChatBubbleLeftIcon, 
  RectangleStackIcon,
  UserIcon,
  CalendarIcon,
  EyeIcon,
  PencilIcon,
  ShareIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline';
import { 
  StarIcon as StarIconSolid,
  DocumentIcon as DocumentIconSolid 
} from '@heroicons/react/24/solid';
import { 
  PaginatedSearchResults, 
  SearchResultWithHighlights 
} from '@shared/types/whiteboard';

interface SearchResultsProps {
  results?: PaginatedSearchResults;
  isLoading: boolean;
  onResultSelect: (result: SearchResultWithHighlights) => void;
  onPageChange: (page: number) => void;
  currentPage: number;
  variant?: 'full' | 'compact';
  showPreviews?: boolean;
  showMetadata?: boolean;
  maxResults?: number;
  className?: string;
}

const SearchResults: React.FC<SearchResultsProps> = ({
  results,
  isLoading,
  onResultSelect,
  onPageChange,
  currentPage,
  variant = 'full',
  showPreviews = true,
  showMetadata = true,
  maxResults = 20,
  className = '',
}) => {
  const isCompact = variant === 'compact';

  // Compute pagination info
  const paginationInfo = useMemo(() => {
    if (!results) {
      return { totalPages: 0, startItem: 0, endItem: 0 };
    }

    const totalPages = Math.ceil(results.total / results.limit);
    const startItem = results.offset + 1;
    const endItem = Math.min(results.offset + results.items.length, results.total);

    return { totalPages, startItem, endItem };
  }, [results]);

  // Get icon for result type
  const getResultIcon = (result: SearchResultWithHighlights) => {
    const iconClass = isCompact ? 'h-4 w-4' : 'h-5 w-5';
    
    switch (result.type) {
      case 'whiteboard':
        return <RectangleStackIcon className={`${iconClass} text-blue-500`} />;
      case 'element':
        return <DocumentIcon className={`${iconClass} text-green-500`} />;
      case 'comment':
        return <ChatBubbleLeftIcon className={`${iconClass} text-orange-500`} />;
      case 'template':
        return <DocumentIconSolid className={`${iconClass} text-purple-500`} />;
      default:
        return <DocumentIcon className={`${iconClass} text-gray-500`} />;
    }
  };

  // Get result type label
  const getResultTypeLabel = (result: SearchResultWithHighlights): string => {
    switch (result.type) {
      case 'whiteboard':
        return 'Whiteboard';
      case 'element':
        return 'Element';
      case 'comment':
        return 'Comment';
      case 'template':
        return 'Template';
      default:
        return 'Unknown';
    }
  };

  // Highlight search terms in text
  const highlightText = (text: string, highlights: any[] = []): React.ReactNode => {
    if (!highlights.length) {
      return text;
    }

    let lastIndex = 0;
    const parts: React.ReactNode[] = [];

    highlights.forEach((highlight, index) => {
      if (highlight.startIndex > lastIndex) {
        parts.push(text.substring(lastIndex, highlight.startIndex));
      }

      parts.push(
        <mark 
          key={index}
          className="bg-yellow-200 px-0.5 rounded text-gray-900"
        >
          {text.substring(highlight.startIndex, highlight.endIndex)}
        </mark>
      );

      lastIndex = highlight.endIndex;
    });

    if (lastIndex < text.length) {
      parts.push(text.substring(lastIndex));
    }

    return <>{parts}</>;
  };

  // Format relevance score as percentage
  const formatRelevanceScore = (score: number): string => {
    return `${Math.round(score * 100)}%`;
  };

  // Format date in relative format
  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return 'Today';
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  // Render loading skeleton
  const renderLoadingSkeleton = () => (
    <div className="space-y-4">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="animate-pulse">
          <div className={`bg-gray-200 rounded-lg p-4 ${isCompact ? 'h-16' : 'h-24'}`}>
            <div className="flex items-start space-x-3">
              <div className="w-5 h-5 bg-gray-300 rounded"></div>
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-gray-300 rounded w-3/4"></div>
                {!isCompact && (
                  <>
                    <div className="h-3 bg-gray-300 rounded w-full"></div>
                    <div className="h-3 bg-gray-300 rounded w-2/3"></div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  // Render empty state
  const renderEmptyState = () => (
    <div className="text-center py-12">
      <DocumentIcon className="mx-auto h-12 w-12 text-gray-400" />
      <h3 className="mt-2 text-sm font-medium text-gray-900">No results found</h3>
      <p className="mt-1 text-sm text-gray-500">
        Try adjusting your search query or filters
      </p>
    </div>
  );

  // Render individual search result
  const renderResult = (result: SearchResultWithHighlights, index: number) => (
    <div
      key={result.id}
      onClick={() => onResultSelect(result)}
      className={`
        group cursor-pointer border border-gray-200 rounded-lg p-4 hover:shadow-md 
        hover:border-gray-300 transition-all duration-200
        ${isCompact ? 'p-3' : 'p-4'}
      `}
    >
      <div className="flex items-start space-x-3">
        {/* Result Type Icon */}
        <div className="flex-shrink-0 mt-0.5">
          {getResultIcon(result)}
        </div>

        {/* Result Content */}
        <div className="flex-1 min-w-0">
          {/* Title and Type */}
          <div className="flex items-center space-x-2">
            <h3 className={`font-medium text-gray-900 truncate ${isCompact ? 'text-sm' : 'text-base'}`}>
              {highlightText(result.title, result.highlights.filter(h => h.field === 'title'))}
            </h3>
            <span className={`
              inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium
              ${result.type === 'whiteboard' ? 'bg-blue-100 text-blue-800' :
                result.type === 'element' ? 'bg-green-100 text-green-800' :
                result.type === 'comment' ? 'bg-orange-100 text-orange-800' :
                'bg-purple-100 text-purple-800'}
            `}>
              {getResultTypeLabel(result)}
            </span>
            {!isCompact && (
              <span className="text-xs text-gray-500">
                {formatRelevanceScore(result.relevanceScore)} match
              </span>
            )}
          </div>

          {/* Description/Preview */}
          {showPreviews && result.preview && (
            <p className={`mt-1 text-gray-600 ${isCompact ? 'text-xs' : 'text-sm'} line-clamp-2`}>
              {highlightText(result.preview, result.highlights.filter(h => h.field === 'description'))}
            </p>
          )}

          {/* Metadata */}
          {showMetadata && (
            <div className={`mt-2 flex items-center space-x-4 text-xs text-gray-500`}>
              <span className="flex items-center space-x-1">
                <CalendarIcon className="h-3 w-3" />
                <span>{formatDate(result.updatedAt)}</span>
              </span>
              
              {result.metadata.elementCount !== undefined && (
                <span className="flex items-center space-x-1">
                  <RectangleStackIcon className="h-3 w-3" />
                  <span>{result.metadata.elementCount} elements</span>
                </span>
              )}
              
              {result.metadata.collaboratorCount !== undefined && result.metadata.collaboratorCount > 0 && (
                <span className="flex items-center space-x-1">
                  <UserIcon className="h-3 w-3" />
                  <span>{result.metadata.collaboratorCount} collaborators</span>
                </span>
              )}
              
              {result.metadata.commentCount !== undefined && result.metadata.commentCount > 0 && (
                <span className="flex items-center space-x-1">
                  <ChatBubbleLeftIcon className="h-3 w-3" />
                  <span>{result.metadata.commentCount} comments</span>
                </span>
              )}

              {result.metadata.visibility && (
                <span className={`
                  inline-flex items-center px-2 py-0.5 rounded text-xs
                  ${result.metadata.visibility === 'public' ? 'bg-green-100 text-green-700' :
                    result.metadata.visibility === 'members' ? 'bg-blue-100 text-blue-700' :
                    'bg-gray-100 text-gray-700'}
                `}>
                  {result.metadata.visibility}
                </span>
              )}
            </div>
          )}

          {/* Matched Fields */}
          {!isCompact && result.matchedFields.length > 0 && (
            <div className="mt-2">
              <div className="flex flex-wrap gap-1">
                {result.matchedFields.map((field, fieldIndex) => (
                  <span
                    key={fieldIndex}
                    className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600"
                  >
                    {field}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="flex items-center space-x-1">
            <button
              className="p-1 text-gray-400 hover:text-gray-600 rounded"
              title="View"
              onClick={(e) => {
                e.stopPropagation();
                onResultSelect(result);
              }}
            >
              <EyeIcon className="h-4 w-4" />
            </button>
            {result.type === 'whiteboard' && (
              <button
                className="p-1 text-gray-400 hover:text-gray-600 rounded"
                title="Edit"
                onClick={(e) => {
                  e.stopPropagation();
                  // Handle edit action
                }}
              >
                <PencilIcon className="h-4 w-4" />
              </button>
            )}
            <button
              className="p-1 text-gray-400 hover:text-gray-600 rounded"
              title="Share"
              onClick={(e) => {
                e.stopPropagation();
                // Handle share action
              }}
            >
              <ShareIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  // Render pagination controls
  const renderPagination = () => {
    if (!results || paginationInfo.totalPages <= 1) {
      return null;
    }

    const { totalPages, startItem, endItem } = paginationInfo;

    return (
      <div className="flex items-center justify-between border-t border-gray-200 bg-white px-4 py-3 sm:px-6">
        <div className="flex flex-1 justify-between sm:hidden">
          <button
            onClick={() => onPageChange(Math.max(0, currentPage - 1))}
            disabled={currentPage === 0}
            className="relative inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <button
            onClick={() => onPageChange(Math.min(totalPages - 1, currentPage + 1))}
            disabled={currentPage >= totalPages - 1}
            className="relative ml-3 inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
        
        <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-gray-700">
              Showing <span className="font-medium">{startItem}</span> to{' '}
              <span className="font-medium">{endItem}</span> of{' '}
              <span className="font-medium">{results.total}</span> results
            </p>
          </div>
          
          <div>
            <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
              <button
                onClick={() => onPageChange(Math.max(0, currentPage - 1))}
                disabled={currentPage === 0}
                className="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="sr-only">Previous</span>
                <ChevronLeftIcon className="h-5 w-5" aria-hidden="true" />
              </button>
              
              {/* Page numbers */}
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                const pageNumber = totalPages <= 7 ? i : 
                  currentPage < 3 ? i :
                  currentPage > totalPages - 4 ? totalPages - 7 + i :
                  currentPage - 3 + i;
                
                return (
                  <button
                    key={pageNumber}
                    onClick={() => onPageChange(pageNumber)}
                    className={`relative inline-flex items-center px-4 py-2 text-sm font-semibold ${
                      currentPage === pageNumber
                        ? 'z-10 bg-blue-600 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600'
                        : 'text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0'
                    }`}
                  >
                    {pageNumber + 1}
                  </button>
                );
              })}
              
              <button
                onClick={() => onPageChange(Math.min(totalPages - 1, currentPage + 1))}
                disabled={currentPage >= totalPages - 1}
                className="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="sr-only">Next</span>
                <ChevronRightIcon className="h-5 w-5" aria-hidden="true" />
              </button>
            </nav>
          </div>
        </div>
      </div>
    );
  };

  // Main render
  return (
    <div className={`search-results ${className}`}>
      {isLoading && renderLoadingSkeleton()}
      
      {!isLoading && results && results.items.length === 0 && renderEmptyState()}
      
      {!isLoading && results && results.items.length > 0 && (
        <>
          <div className="space-y-3">
            {results.items.map((result, index) => renderResult(result, index))}
          </div>
          
          {renderPagination()}
        </>
      )}
    </div>
  );
};

export default SearchResults;