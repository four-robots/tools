'use client';

import React, { useState, useMemo } from 'react';
import { 
  Play, 
  Star, 
  Edit, 
  Trash2, 
  Share2, 
  Clock, 
  BarChart3, 
  Calendar,
  Tag,
  MoreVertical,
  Eye,
  Copy,
  History
} from 'lucide-react';
import { Card } from '../../ui/card';
import { Button } from '../../ui/button';
import { Badge } from '../../ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../../ui/dropdown-menu';
import { sanitizePlainText, sanitizeRichText } from '../../../lib/sanitization';
import type { SavedSearch } from '@mcp-tools/core';

interface SavedSearchCardProps {
  search: SavedSearch;
  viewMode: 'grid' | 'list';
  onExecute: () => void;
  onDelete: () => void;
  onToggleFavorite: () => void;
  onTagClick: (tag: string) => void;
  className?: string;
}

const SavedSearchCard: React.FC<SavedSearchCardProps> = ({
  search,
  viewMode,
  onExecute,
  onDelete,
  onToggleFavorite,
  onTagClick,
  className = '',
}) => {
  const [showFullDescription, setShowFullDescription] = useState(false);

  // Sanitize and memoize content to prevent XSS attacks
  const sanitizedContent = useMemo(() => ({
    name: sanitizePlainText(search.name || ''),
    description: search.description ? sanitizeRichText(search.description) : undefined,
    tags: search.tags.map(tag => sanitizePlainText(tag)).filter(Boolean),
    queryPreview: sanitizePlainText(
      typeof search.queryData.query === 'string' 
        ? search.queryData.query 
        : JSON.stringify(search.queryData.query)
    ).substring(0, 100)
  }), [search]);

  // Format dates
  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(date));
  };

  // Truncate description for grid view
  const truncatedDescription = sanitizedContent.description && sanitizedContent.description.length > 100
    ? `${sanitizedContent.description.substring(0, 100)}...`
    : sanitizedContent.description;

  const displayDescription = showFullDescription || viewMode === 'list' 
    ? sanitizedContent.description 
    : truncatedDescription;

  if (viewMode === 'list') {
    return (
      <Card className={`p-4 hover:shadow-md transition-shadow ${className}`}>
        <div className="flex items-start justify-between">
          {/* Main content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-3">
              {/* Favorite star */}
              <Button
                variant="ghost"
                size="sm"
                onClick={onToggleFavorite}
                className={`p-1 mt-1 ${search.isFavorite ? 'text-yellow-500' : 'text-gray-400'}`}
              >
                <Star className={`h-4 w-4 ${search.isFavorite ? 'fill-current' : ''}`} />
              </Button>

              <div className="flex-1 min-w-0">
                {/* Title and query */}
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-gray-900 truncate">
                      {sanitizedContent.name}
                    </h3>
                    <p className="text-sm text-gray-600 mt-1 font-mono bg-gray-50 px-2 py-1 rounded">
                      {sanitizedContent.queryPreview}
                    </p>
                  </div>
                  
                  {/* Action buttons */}
                  <div className="flex items-center gap-2 ml-4">
                    <Button
                      onClick={onExecute}
                      size="sm"
                      className="gap-2"
                    >
                      <Play className="h-4 w-4" />
                      Execute
                    </Button>
                    
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="p-2">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem className="gap-2">
                          <Eye className="h-4 w-4" />
                          View Details
                        </DropdownMenuItem>
                        <DropdownMenuItem className="gap-2">
                          <Edit className="h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem className="gap-2">
                          <Copy className="h-4 w-4" />
                          Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuItem className="gap-2">
                          <Share2 className="h-4 w-4" />
                          Share
                        </DropdownMenuItem>
                        <DropdownMenuItem className="gap-2">
                          <History className="h-4 w-4" />
                          Version History
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          className="gap-2 text-red-600"
                          onClick={onDelete}
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                {/* Description */}
                {search.description && (
                  <p className="text-sm text-gray-600 mt-2 leading-relaxed">
                    {displayDescription}
                  </p>
                )}

                {/* Tags and metadata */}
                <div className="flex items-center justify-between mt-3">
                  <div className="flex items-center gap-4 text-sm text-gray-500">
                    <div className="flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      {formatDate(search.createdAt)}
                    </div>
                    <div className="flex items-center gap-1">
                      <BarChart3 className="h-4 w-4" />
                      {search.executionCount} executions
                    </div>
                    {search.lastExecutedAt && (
                      <div className="flex items-center gap-1">
                        <Clock className="h-4 w-4" />
                        Last run {formatDate(search.lastExecutedAt)}
                      </div>
                    )}
                    {search.isPublic && (
                      <Badge variant="outline" className="text-xs">
                        Public
                      </Badge>
                    )}
                  </div>

                  {/* Tags */}
                  {sanitizedContent.tags.length > 0 && (
                    <div className="flex items-center gap-1 flex-wrap">
                      {sanitizedContent.tags.slice(0, 3).map(tag => (
                        <Badge
                          key={tag}
                          variant="secondary"
                          className="text-xs cursor-pointer hover:bg-blue-100"
                          onClick={() => onTagClick(tag)}
                        >
                          {tag}
                        </Badge>
                      ))}
                      {sanitizedContent.tags.length > 3 && (
                        <Badge variant="outline" className="text-xs">
                          +{sanitizedContent.tags.length - 3}
                        </Badge>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </Card>
    );
  }

  // Grid view
  return (
    <Card className={`p-4 hover:shadow-md transition-shadow h-full flex flex-col ${className}`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-start gap-2 flex-1 min-w-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleFavorite}
            className={`p-1 ${search.isFavorite ? 'text-yellow-500' : 'text-gray-400'}`}
          >
            <Star className={`h-4 w-4 ${search.isFavorite ? 'fill-current' : ''}`} />
          </Button>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-gray-900 truncate">
              {sanitizedContent.name}
            </h3>
          </div>
        </div>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="p-2">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem className="gap-2">
              <Eye className="h-4 w-4" />
              View Details
            </DropdownMenuItem>
            <DropdownMenuItem className="gap-2">
              <Edit className="h-4 w-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem className="gap-2">
              <Copy className="h-4 w-4" />
              Duplicate
            </DropdownMenuItem>
            <DropdownMenuItem className="gap-2">
              <Share2 className="h-4 w-4" />
              Share
            </DropdownMenuItem>
            <DropdownMenuItem className="gap-2">
              <History className="h-4 w-4" />
              Version History
            </DropdownMenuItem>
            <DropdownMenuItem 
              className="gap-2 text-red-600"
              onClick={onDelete}
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Query preview */}
      <div className="mb-3">
        <p className="text-xs text-gray-500 mb-1">Query:</p>
        <p className="text-sm text-gray-800 font-mono bg-gray-50 px-2 py-1 rounded text-xs break-words">
          {sanitizedContent.queryPreview}
        </p>
      </div>

      {/* Description */}
      {search.description && (
        <div className="mb-3 flex-1">
          <p className="text-sm text-gray-600 leading-relaxed">
            {displayDescription}
            {search.description.length > 100 && !showFullDescription && (
              <button
                onClick={() => setShowFullDescription(true)}
                className="text-blue-600 hover:text-blue-800 ml-1"
              >
                Show more
              </button>
            )}
          </p>
        </div>
      )}

      {/* Tags */}
      {sanitizedContent.tags.length > 0 && (
        <div className="mb-3">
          <div className="flex items-center gap-1 flex-wrap">
            <Tag className="h-3 w-3 text-gray-400" />
            {sanitizedContent.tags.slice(0, 2).map(tag => (
              <Badge
                key={tag}
                variant="secondary"
                className="text-xs cursor-pointer hover:bg-blue-100"
                onClick={() => onTagClick(tag)}
              >
                {tag}
              </Badge>
            ))}
            {sanitizedContent.tags.length > 2 && (
              <Badge variant="outline" className="text-xs">
                +{sanitizedContent.tags.length - 2}
              </Badge>
            )}
          </div>
        </div>
      )}

      {/* Metadata */}
      <div className="space-y-2 mb-4 text-xs text-gray-500">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {new Intl.DateTimeFormat('en-US', { 
              month: 'short', 
              day: 'numeric' 
            }).format(new Date(search.createdAt))}
          </div>
          <div className="flex items-center gap-1">
            <BarChart3 className="h-3 w-3" />
            {search.executionCount}
          </div>
        </div>
        
        {search.lastExecutedAt && (
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Last run {new Intl.DateTimeFormat('en-US', { 
              month: 'short', 
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            }).format(new Date(search.lastExecutedAt))}
          </div>
        )}

        {search.isPublic && (
          <Badge variant="outline" className="text-xs">
            Public
          </Badge>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2 mt-auto">
        <Button
          onClick={onExecute}
          size="sm"
          className="flex-1 gap-2"
        >
          <Play className="h-4 w-4" />
          Execute
        </Button>
      </div>
    </Card>
  );
};

export default SavedSearchCard;