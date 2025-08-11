'use client';

import React, { useState, useCallback } from 'react';
import { 
  CubeIcon,
  TagIcon,
  ShareIcon,
  LinkIcon,
  SyncIcon,
  EyeIcon,
  EyeSlashIcon,
  ArrowsPointingOutIcon,
  PuzzlePieceIcon
} from '@heroicons/react/24/outline';
import type { MemoryNodeElementData, ResourceAttachment } from '@shared/types/whiteboard';

interface MemoryNodeElementProps {
  data: MemoryNodeElementData;
  attachment: ResourceAttachment;
  isSelected: boolean;
  isHovered: boolean;
  onSync?: () => Promise<void>;
  onOpenInMemory?: (nodeId: string) => void;
  onToggleConnections?: (nodeId: string, showConnections: boolean) => void;
  onShowNodeNetwork?: (nodeId: string) => void;
  className?: string;
}

const SYNC_STATUS_COLORS = {
  active: 'text-green-600',
  broken: 'text-red-600', 
  outdated: 'text-yellow-600',
  conflict: 'text-orange-600',
} as const;

const NODE_TYPE_COLORS = {
  concept: 'bg-blue-100 text-blue-800 border-blue-200',
  person: 'bg-green-100 text-green-800 border-green-200',
  event: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  location: 'bg-purple-100 text-purple-800 border-purple-200',
  document: 'bg-gray-100 text-gray-800 border-gray-200',
  idea: 'bg-pink-100 text-pink-800 border-pink-200',
  project: 'bg-orange-100 text-orange-800 border-orange-200',
  task: 'bg-cyan-100 text-cyan-800 border-cyan-200',
} as const;

const CONNECTION_STRENGTH_COLORS = {
  weak: 'text-gray-400',
  medium: 'text-yellow-500',
  strong: 'text-green-600',
} as const;

export default function MemoryNodeElement({
  data,
  attachment,
  isSelected,
  isHovered,
  onSync,
  onOpenInMemory,
  onToggleConnections,
  onShowNodeNetwork,
  className = '',
}: MemoryNodeElementProps) {
  const [isSyncing, setIsSyncing] = useState(false);

  const handleSync = useCallback(async () => {
    if (!onSync || isSyncing) return;
    
    setIsSyncing(true);
    try {
      await onSync();
    } catch (error) {
      console.error('Failed to sync Memory node:', error);
    } finally {
      setIsSyncing(false);
    }
  }, [onSync, isSyncing]);

  const handleOpenInMemory = useCallback(() => {
    if (onOpenInMemory) {
      onOpenInMemory(data.nodeId);
    }
  }, [onOpenInMemory, data.nodeId]);

  const handleToggleConnections = useCallback(() => {
    if (onToggleConnections) {
      onToggleConnections(data.nodeId, !data.showConnections);
    }
  }, [onToggleConnections, data.nodeId, data.showConnections]);

  const handleShowNodeNetwork = useCallback(() => {
    if (onShowNodeNetwork) {
      onShowNodeNetwork(data.nodeId);
    }
  }, [onShowNodeNetwork, data.nodeId]);

  const syncStatusColor = SYNC_STATUS_COLORS[attachment.syncStatus];
  const nodeTypeColor = data.nodeType && NODE_TYPE_COLORS[data.nodeType as keyof typeof NODE_TYPE_COLORS] 
    ? NODE_TYPE_COLORS[data.nodeType as keyof typeof NODE_TYPE_COLORS]
    : NODE_TYPE_COLORS.concept;

  const getConnectionStrengthLevel = (strength: number): 'weak' | 'medium' | 'strong' => {
    if (strength >= 0.7) return 'strong';
    if (strength >= 0.4) return 'medium';
    return 'weak';
  };

  return (
    <div
      className={`
        group relative bg-white rounded-lg shadow-sm border-2 p-4 min-w-[300px] max-w-[450px]
        ${isSelected ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-200'}
        ${isHovered ? 'shadow-md border-gray-300' : ''}
        transition-all duration-200 
        ${className}
      `}
    >
      {/* Node Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center space-x-2 flex-1 min-w-0">
          <div className="flex-shrink-0 p-1.5 bg-purple-50 rounded-lg">
            <CubeIcon className="h-4 w-4 text-purple-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-gray-900 truncate" title={data.title}>
              {data.title}
            </h3>
            {/* Node Type */}
            {data.nodeType && (
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border mt-1 ${nodeTypeColor}`}>
                {data.nodeType}
              </span>
            )}
          </div>
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

      {/* Node Content */}
      {data.content && (
        <div className="mb-3">
          <p className="text-sm text-gray-700 line-clamp-4">
            {data.content}
          </p>
        </div>
      )}

      {/* Connection Status */}
      {data.connections.length > 0 && (
        <div className="mb-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-2">
              <ShareIcon className="h-4 w-4 text-gray-500" />
              <span className="text-sm font-medium text-gray-700">
                Connections ({data.connections.length})
              </span>
            </div>
            
            {/* Toggle Connections Visibility */}
            <button
              onClick={handleToggleConnections}
              className="p-1 rounded-md hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-1"
              title={data.showConnections ? 'Hide connections' : 'Show connections'}
            >
              {data.showConnections ? (
                <EyeSlashIcon className="h-4 w-4 text-gray-500" />
              ) : (
                <EyeIcon className="h-4 w-4 text-gray-500" />
              )}
            </button>
          </div>

          {/* Connection List (if visible) */}
          {data.showConnections && (
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {data.connections.slice(0, 5).map((connection, index) => {
                const strengthLevel = getConnectionStrengthLevel(connection.strength);
                const strengthColor = CONNECTION_STRENGTH_COLORS[strengthLevel];
                
                return (
                  <div key={index} className="flex items-center justify-between text-xs bg-gray-50 rounded px-2 py-1">
                    <div className="flex items-center space-x-2 flex-1 min-w-0">
                      <PuzzlePieceIcon className={`h-3 w-3 flex-shrink-0 ${strengthColor}`} />
                      <span className="text-gray-700 truncate">{connection.relationship}</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <div 
                        className={`h-2 w-2 rounded-full ${strengthColor.replace('text-', 'bg-')}`}
                        title={`Connection strength: ${Math.round(connection.strength * 100)}%`}
                      />
                      <span className={`${strengthColor} font-mono`}>
                        {Math.round(connection.strength * 100)}%
                      </span>
                    </div>
                  </div>
                );
              })}
              
              {data.connections.length > 5 && (
                <div className="text-center pt-1">
                  <button
                    onClick={handleShowNodeNetwork}
                    className="text-xs text-purple-600 hover:text-purple-800 font-medium"
                  >
                    View all {data.connections.length} connections
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tags */}
      {data.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          <TagIcon className="h-3 w-3 text-gray-400 mt-0.5 flex-shrink-0" />
          {data.tags.slice(0, 4).map((tag, index) => (
            <span
              key={index}
              className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-purple-100 text-purple-700"
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

      {/* Connection Display Settings */}
      {data.syncEnabled && (
        <div className="flex items-center justify-between text-xs text-gray-500 border-t pt-2">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-1">
              <span>Connections:</span>
              <div className="flex items-center space-x-1">
                {data.showConnections ? (
                  <EyeIcon className="h-3 w-3 text-green-600" />
                ) : (
                  <EyeSlashIcon className="h-3 w-3 text-gray-400" />
                )}
                <span className="text-xs">
                  {data.showConnections ? 'Visible' : 'Hidden'}
                </span>
              </div>
            </div>
          </div>

          {/* Last Sync */}
          <div className="flex items-center space-x-1 text-gray-400">
            <SyncIcon className="h-3 w-3" />
            <span>{new Date(attachment.lastSyncAt).toLocaleTimeString()}</span>
          </div>
        </div>
      )}

      {/* Action Buttons - Show on Hover */}
      <div className={`
        absolute top-2 right-2 flex space-x-1 transition-opacity duration-200
        ${isHovered || isSelected ? 'opacity-100' : 'opacity-0'}
      `}>
        {/* Show Network Button */}
        {data.connections.length > 0 && onShowNodeNetwork && (
          <button
            onClick={handleShowNodeNetwork}
            className="p-1.5 bg-white border border-gray-200 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-1"
            title="Show node network"
          >
            <ArrowsPointingOutIcon className="h-3 w-3 text-gray-600" />
          </button>
        )}

        {/* Sync Button */}
        {data.syncEnabled && onSync && (
          <button
            onClick={handleSync}
            disabled={isSyncing}
            className="p-1.5 bg-white border border-gray-200 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-1 disabled:opacity-50"
            title="Sync with Memory service"
          >
            <SyncIcon className={`h-3 w-3 text-gray-600 ${isSyncing ? 'animate-spin' : ''}`} />
          </button>
        )}

        {/* Open in Memory Button */}
        {onOpenInMemory && (
          <button
            onClick={handleOpenInMemory}
            className="p-1.5 bg-white border border-gray-200 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-1"
            title="Open in Memory"
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

      {/* Connection Lines Overlay (if connections are shown) */}
      {data.showConnections && data.connections.length > 0 && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-lg">
          <svg className="absolute inset-0 w-full h-full">
            {/* Simple connection visualization - could be enhanced */}
            {data.connections.slice(0, 3).map((connection, index) => {
              const strengthLevel = getConnectionStrengthLevel(connection.strength);
              const opacity = strengthLevel === 'strong' ? 0.6 : strengthLevel === 'medium' ? 0.4 : 0.2;
              
              return (
                <line
                  key={index}
                  x1="50%"
                  y1="50%"
                  x2={`${50 + (index - 1) * 30}%`}
                  y2="20%"
                  stroke="#7c3aed"
                  strokeWidth="1"
                  opacity={opacity}
                  strokeDasharray="2,2"
                />
              );
            })}
          </svg>
        </div>
      )}
    </div>
  );
}