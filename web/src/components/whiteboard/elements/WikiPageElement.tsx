'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { 
  DocumentTextIcon,
  UserIcon,
  CalendarDaysIcon,
  TagIcon,
  EyeIcon,
  EyeSlashIcon,
  LinkIcon,
  SyncIcon,
  ChevronDownIcon,
  ChevronUpIcon
} from '@heroicons/react/24/outline';
import type { WikiPageElementData, ResourceAttachment } from '@shared/types/whiteboard';

interface WikiPageElementProps {
  data: WikiPageElementData;
  attachment: ResourceAttachment;
  isSelected: boolean;
  isHovered: boolean;
  onSync?: () => Promise<void>;
  onOpenInWiki?: (pageId: string) => void;
  onToggleContent?: (pageId: string, showFull: boolean) => void;
  className?: string;
}

const SYNC_STATUS_COLORS = {
  active: 'text-green-600',
  broken: 'text-red-600', 
  outdated: 'text-yellow-600',
  conflict: 'text-orange-600',
} as const;

export default function WikiPageElement({
  data,
  attachment,
  isSelected,
  isHovered,
  onSync,
  onOpenInWiki,
  onToggleContent,
  className = '',
}: WikiPageElementProps) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [isExpanded, setIsExpanded] = useState(data.showFullContent || false);
  const [contentHeight, setContentHeight] = useState<number | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const handleSync = useCallback(async () => {
    if (!onSync || isSyncing) return;
    
    setIsSyncing(true);
    try {
      await onSync();
    } catch (error) {
      console.error('Failed to sync Wiki page:', error);
    } finally {
      setIsSyncing(false);
    }
  }, [onSync, isSyncing]);

  const handleOpenInWiki = useCallback(() => {
    if (onOpenInWiki) {
      onOpenInWiki(data.pageId);
    }
  }, [onOpenInWiki, data.pageId]);

  const handleToggleContent = useCallback(() => {
    const newShowFull = !isExpanded;
    setIsExpanded(newShowFull);
    
    if (onToggleContent) {
      onToggleContent(data.pageId, newShowFull);
    }
  }, [isExpanded, onToggleContent, data.pageId]);

  const syncStatusColor = SYNC_STATUS_COLORS[attachment.syncStatus];

  // Measure content height for animation
  useEffect(() => {
    if (contentRef.current) {
      setContentHeight(contentRef.current.scrollHeight);
    }
  }, [data.contentPreview, isExpanded]);

  const hasContent = data.contentPreview || data.excerpt;
  const displayContent = isExpanded ? data.contentPreview : data.excerpt;

  return (
    <div
      className={`
        group relative bg-white rounded-lg shadow-sm border-2 p-4 min-w-[320px] max-w-[500px]
        ${isSelected ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-200'}
        ${isHovered ? 'shadow-md border-gray-300' : ''}
        transition-all duration-200 
        ${className}
      `}
    >
      {/* Page Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center space-x-2 flex-1 min-w-0">
          <div className="flex-shrink-0 p-1.5 bg-green-50 rounded-lg">
            <DocumentTextIcon className="h-4 w-4 text-green-600" />
          </div>
          <h3 className="font-medium text-gray-900 truncate" title={data.title}>
            {data.title}
          </h3>
        </div>

        {/* Sync Status Indicator */}
        <div className={`flex-shrink-0 ml-2 ${syncStatusColor}`}>
          {isSyncing ? (
            <div className="animate-spin h-4 w-4">
              <SyncIcon className="h-4 w-4" />
            </div>
          ) : (
            <div className="h-4 w-4 rounded-full bg-current opacity-75" title={`Sync status: ${attachment.syncStatus}`} />
          )}
        </div>
      </div>

      {/* Page Content */}
      {hasContent && (
        <div className="mb-3">
          <div 
            ref={contentRef}
            className={`
              text-sm text-gray-700 transition-all duration-300 ease-in-out overflow-hidden
              ${isExpanded ? 'max-h-96 overflow-y-auto' : 'max-h-20'}
            `}
          >
            <div className={`${isExpanded ? '' : 'line-clamp-3'}`}>
              {displayContent}
            </div>
          </div>

          {/* Content Toggle Button */}
          {data.contentPreview && data.excerpt && data.contentPreview !== data.excerpt && (
            <button
              onClick={handleToggleContent}
              className="mt-2 flex items-center space-x-1 text-xs text-blue-600 hover:text-blue-800 transition-colors duration-200"
            >
              {isExpanded ? (
                <>
                  <ChevronUpIcon className="h-3 w-3" />
                  <span>Show less</span>
                </>
              ) : (
                <>
                  <ChevronDownIcon className="h-3 w-3" />
                  <span>Show full content</span>
                </>
              )}
            </button>
          )}
        </div>
      )}

      {/* Metadata Row */}
      <div className="flex items-center justify-between text-xs text-gray-500 mb-3">
        <div className="flex items-center space-x-3">
          {/* Author */}
          {data.author && (
            <div className="flex items-center space-x-1">
              <UserIcon className="h-3 w-3" />
              <span>{data.author}</span>
            </div>
          )}

          {/* Last Modified */}
          <div className="flex items-center space-x-1">
            <CalendarDaysIcon className="h-3 w-3" />
            <span>{new Date(data.lastModified).toLocaleDateString()}</span>
          </div>
        </div>

        {/* Last Sync */}
        <div className="flex items-center space-x-1 text-gray-400">
          <SyncIcon className="h-3 w-3" />
          <span>{new Date(attachment.lastSyncAt).toLocaleTimeString()}</span>
        </div>
      </div>

      {/* Tags */}
      {data.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          <TagIcon className="h-3 w-3 text-gray-400 mt-0.5 flex-shrink-0" />
          {data.tags.slice(0, 4).map((tag, index) => (
            <span
              key={index}
              className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700"
            >
              {tag}
            </span>
          ))}
          {data.tags.length > 4 && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-500">
              +{data.tags.length - 4}
            </span>
          )}
        </div>
      )}

      {/* Content Display Settings */}
      {data.syncEnabled && (
        <div className="flex items-center justify-between text-xs text-gray-500 border-t pt-2">
          <div className="flex items-center space-x-2">
            <span>Display:</span>
            <div className="flex items-center space-x-1">
              {isExpanded || data.showFullContent ? (
                <EyeIcon className="h-3 w-3 text-green-600" />
              ) : (
                <EyeSlashIcon className="h-3 w-3 text-gray-400" />
              )}
              <span className="text-xs">
                {isExpanded || data.showFullContent ? 'Full content' : 'Excerpt only'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons - Show on Hover */}
      <div className={`
        absolute top-2 right-2 flex space-x-1 transition-opacity duration-200
        ${isHovered || isSelected ? 'opacity-100' : 'opacity-0'}
      `}>
        {/* Sync Button */}
        {data.syncEnabled && onSync && (
          <button
            onClick={handleSync}
            disabled={isSyncing}
            className="p-1.5 bg-white border border-gray-200 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-1 disabled:opacity-50"
            title="Sync with Wiki service"
          >
            <SyncIcon className={`h-3 w-3 text-gray-600 ${isSyncing ? 'animate-spin' : ''}`} />
          </button>
        )}

        {/* Open in Wiki Button */}
        {onOpenInWiki && (
          <button
            onClick={handleOpenInWiki}
            className="p-1.5 bg-white border border-gray-200 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-1"
            title="Open in Wiki"
          >
            <LinkIcon className="h-3 w-3 text-gray-600" />
          </button>
        )}
      </div>

      {/* Sync Status Banner */}
      {attachment.syncStatus !== 'active' && (
        <div className={`
          absolute -top-1 -right-1 px-2 py-0.5 rounded-full text-xs font-medium
          ${attachment.syncStatus === 'broken' ? 'bg-red-100 text-red-800' : ''}
          ${attachment.syncStatus === 'outdated' ? 'bg-yellow-100 text-yellow-800' : ''}
          ${attachment.syncStatus === 'conflict' ? 'bg-orange-100 text-orange-800' : ''}
          shadow-sm border
        `}>
          {attachment.syncStatus}
        </div>
      )}
    </div>
  );
}