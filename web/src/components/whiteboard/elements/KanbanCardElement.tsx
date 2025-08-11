'use client';

import React, { useState, useCallback } from 'react';
import { 
  Square3Stack3DIcon,
  UserIcon,
  CalendarDaysIcon,
  TagIcon,
  CheckCircleIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  LinkIcon,
  SyncIcon
} from '@heroicons/react/24/outline';
import type { KanbanCardElementData, ResourceAttachment } from '@shared/types/whiteboard';

interface KanbanCardElementProps {
  data: KanbanCardElementData;
  attachment: ResourceAttachment;
  isSelected: boolean;
  isHovered: boolean;
  onSync?: () => Promise<void>;
  onOpenInKanban?: (cardId: string) => void;
  className?: string;
}

const PRIORITY_COLORS = {
  low: 'bg-green-100 text-green-800 border-green-200',
  medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  high: 'bg-orange-100 text-orange-800 border-orange-200',
  urgent: 'bg-red-100 text-red-800 border-red-200',
} as const;

const STATUS_COLORS = {
  'todo': 'bg-gray-100 text-gray-800',
  'in-progress': 'bg-blue-100 text-blue-800', 
  'in_progress': 'bg-blue-100 text-blue-800',
  'review': 'bg-purple-100 text-purple-800',
  'done': 'bg-green-100 text-green-800',
  'completed': 'bg-green-100 text-green-800',
  'blocked': 'bg-red-100 text-red-800',
  'cancelled': 'bg-gray-100 text-gray-500',
} as const;

const SYNC_STATUS_COLORS = {
  active: 'text-green-600',
  broken: 'text-red-600', 
  outdated: 'text-yellow-600',
  conflict: 'text-orange-600',
} as const;

export default function KanbanCardElement({
  data,
  attachment,
  isSelected,
  isHovered,
  onSync,
  onOpenInKanban,
  className = '',
}: KanbanCardElementProps) {
  const [isSyncing, setIsSyncing] = useState(false);

  const handleSync = useCallback(async () => {
    if (!onSync || isSyncing) return;
    
    setIsSyncing(true);
    try {
      await onSync();
    } catch (error) {
      console.error('Failed to sync Kanban card:', error);
    } finally {
      setIsSyncing(false);
    }
  }, [onSync, isSyncing]);

  const handleOpenInKanban = useCallback(() => {
    if (onOpenInKanban) {
      onOpenInKanban(data.cardId);
    }
  }, [onOpenInKanban, data.cardId]);

  const priorityColor = data.priority ? PRIORITY_COLORS[data.priority] || PRIORITY_COLORS.medium : null;
  const statusColor = STATUS_COLORS[data.status.toLowerCase() as keyof typeof STATUS_COLORS] || 'bg-gray-100 text-gray-800';
  const syncStatusColor = SYNC_STATUS_COLORS[attachment.syncStatus];

  const isOverdue = data.dueDate && new Date(data.dueDate) < new Date();
  const isDueSoon = data.dueDate && 
    !isOverdue && 
    new Date(data.dueDate) < new Date(Date.now() + 24 * 60 * 60 * 1000);

  return (
    <div
      className={`
        group relative bg-white rounded-lg shadow-sm border-2 p-4 min-w-[280px] max-w-[400px]
        ${isSelected ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-200'}
        ${isHovered ? 'shadow-md border-gray-300' : ''}
        transition-all duration-200 
        ${className}
      `}
    >
      {/* Card Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center space-x-2 flex-1 min-w-0">
          <div className="flex-shrink-0 p-1.5 bg-blue-50 rounded-lg">
            <Square3Stack3DIcon className="h-4 w-4 text-blue-600" />
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

      {/* Card Description */}
      {data.description && (
        <p className="text-sm text-gray-600 mb-3 line-clamp-3">
          {data.description}
        </p>
      )}

      {/* Status and Priority */}
      <div className="flex items-center space-x-2 mb-3">
        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${statusColor}`}>
          {data.status}
        </span>
        
        {data.priority && (
          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border ${priorityColor}`}>
            {data.priority}
          </span>
        )}
      </div>

      {/* Metadata Row */}
      <div className="flex items-center justify-between text-xs text-gray-500 mb-3">
        <div className="flex items-center space-x-3">
          {/* Assignee */}
          {data.assignee && (
            <div className="flex items-center space-x-1">
              <UserIcon className="h-3 w-3" />
              <span>{data.assignee}</span>
            </div>
          )}

          {/* Due Date */}
          {data.dueDate && (
            <div className={`flex items-center space-x-1 ${
              isOverdue ? 'text-red-600' : isDueSoon ? 'text-orange-600' : ''
            }`}>
              <CalendarDaysIcon className="h-3 w-3" />
              <span>{new Date(data.dueDate).toLocaleDateString()}</span>
              {isOverdue && <ExclamationTriangleIcon className="h-3 w-3 text-red-600" />}
              {isDueSoon && !isOverdue && <ClockIcon className="h-3 w-3 text-orange-600" />}
            </div>
          )}
        </div>

        {/* Last Sync */}
        <div className="flex items-center space-x-1 text-gray-400">
          <ClockIcon className="h-3 w-3" />
          <span>{new Date(attachment.lastSyncAt).toLocaleTimeString()}</span>
        </div>
      </div>

      {/* Tags */}
      {data.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          <TagIcon className="h-3 w-3 text-gray-400 mt-0.5 flex-shrink-0" />
          {data.tags.slice(0, 3).map((tag, index) => (
            <span
              key={index}
              className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-700"
            >
              {tag}
            </span>
          ))}
          {data.tags.length > 3 && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-500">
              +{data.tags.length - 3}
            </span>
          )}
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
            className="p-1.5 bg-white border border-gray-200 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 disabled:opacity-50"
            title="Sync with Kanban service"
          >
            <SyncIcon className={`h-3 w-3 text-gray-600 ${isSyncing ? 'animate-spin' : ''}`} />
          </button>
        )}

        {/* Open in Kanban Button */}
        {onOpenInKanban && (
          <button
            onClick={handleOpenInKanban}
            className="p-1.5 bg-white border border-gray-200 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
            title="Open in Kanban"
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