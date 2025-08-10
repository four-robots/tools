'use client';

import React, { useState } from 'react';
import { 
  Folder, 
  FolderOpen, 
  Plus, 
  Edit,
  Trash2,
  ChevronRight,
  ChevronDown,
  Search
} from 'lucide-react';
import { Button } from '../../ui/button';
import { Badge } from '../../ui/badge';
import type { CollectionTreeNode } from '@mcp-tools/core';

interface SearchCollectionTreeProps {
  collections: CollectionTreeNode[];
  selectedCollectionId: string | null;
  onCollectionSelect: (collectionId: string | null) => void;
  onCollectionUpdate: () => void;
  className?: string;
}

interface CollectionNodeProps {
  collection: CollectionTreeNode;
  level: number;
  selectedCollectionId: string | null;
  onCollectionSelect: (collectionId: string | null) => void;
  onCollectionUpdate: () => void;
  expandedNodes: Set<string>;
  onToggleExpanded: (collectionId: string) => void;
}

const CollectionNode: React.FC<CollectionNodeProps> = ({
  collection,
  level,
  selectedCollectionId,
  onCollectionSelect,
  onCollectionUpdate,
  expandedNodes,
  onToggleExpanded,
}) => {
  const isExpanded = expandedNodes.has(collection.id);
  const isSelected = selectedCollectionId === collection.id;
  const hasChildren = collection.children && collection.children.length > 0;
  const searchCount = collection.searchCount || 0;

  const handleToggleExpanded = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (hasChildren) {
      onToggleExpanded(collection.id);
    }
  };

  const handleSelect = () => {
    onCollectionSelect(collection.id);
  };

  return (
    <div>
      {/* Current collection */}
      <div
        className={`
          flex items-center gap-2 py-2 px-2 rounded-md cursor-pointer
          hover:bg-gray-50 transition-colors
          ${isSelected ? 'bg-blue-50 border border-blue-200' : ''}
        `}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
      >
        {/* Expand/collapse button */}
        <button
          onClick={handleToggleExpanded}
          className="flex-shrink-0 p-0.5 hover:bg-gray-200 rounded"
          disabled={!hasChildren}
        >
          {hasChildren ? (
            isExpanded ? (
              <ChevronDown className="h-3 w-3 text-gray-600" />
            ) : (
              <ChevronRight className="h-3 w-3 text-gray-600" />
            )
          ) : (
            <div className="h-3 w-3" />
          )}
        </button>

        {/* Folder icon */}
        <div
          className="flex-shrink-0"
          style={{ color: collection.color || '#6B7280' }}
        >
          {isExpanded ? (
            <FolderOpen className="h-4 w-4" />
          ) : (
            <Folder className="h-4 w-4" />
          )}
        </div>

        {/* Collection name and count */}
        <div 
          className="flex-1 flex items-center justify-between min-w-0"
          onClick={handleSelect}
        >
          <span className="text-sm font-medium text-gray-900 truncate">
            {collection.name}
          </span>
          {searchCount > 0 && (
            <Badge variant="secondary" className="text-xs ml-2">
              {searchCount}
            </Badge>
          )}
        </div>

        {/* Actions - show on hover */}
        <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button variant="ghost" size="sm" className="p-1 h-6 w-6">
            <Plus className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="sm" className="p-1 h-6 w-6">
            <Edit className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="sm" className="p-1 h-6 w-6 text-red-500 hover:text-red-700">
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Children collections */}
      {hasChildren && isExpanded && (
        <div>
          {collection.children!.map(child => (
            <CollectionNode
              key={child.id}
              collection={child}
              level={level + 1}
              selectedCollectionId={selectedCollectionId}
              onCollectionSelect={onCollectionSelect}
              onCollectionUpdate={onCollectionUpdate}
              expandedNodes={expandedNodes}
              onToggleExpanded={onToggleExpanded}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const SearchCollectionTree: React.FC<SearchCollectionTreeProps> = ({
  collections,
  selectedCollectionId,
  onCollectionSelect,
  onCollectionUpdate,
  className = '',
}) => {
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  const handleToggleExpanded = (collectionId: string) => {
    setExpandedNodes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(collectionId)) {
        newSet.delete(collectionId);
      } else {
        newSet.add(collectionId);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    onCollectionSelect(null);
  };

  return (
    <div className={`collection-tree ${className}`}>
      {/* All Searches option */}
      <div
        className={`
          flex items-center gap-2 py-2 px-2 rounded-md cursor-pointer mb-2
          hover:bg-gray-50 transition-colors
          ${selectedCollectionId === null ? 'bg-blue-50 border border-blue-200' : ''}
        `}
        onClick={handleSelectAll}
      >
        <Search className="h-4 w-4 text-gray-600" />
        <span className="text-sm font-medium text-gray-900">
          All Searches
        </span>
      </div>

      {/* Collections */}
      <div className="space-y-1">
        {collections.length === 0 ? (
          <div className="text-center py-6 text-gray-500">
            <Folder className="h-8 w-8 mx-auto mb-2 text-gray-300" />
            <p className="text-sm">No collections yet</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2 gap-2"
              onClick={onCollectionUpdate}
            >
              <Plus className="h-4 w-4" />
              Create Collection
            </Button>
          </div>
        ) : (
          collections.map(collection => (
            <div key={collection.id} className="group">
              <CollectionNode
                collection={collection}
                level={0}
                selectedCollectionId={selectedCollectionId}
                onCollectionSelect={onCollectionSelect}
                onCollectionUpdate={onCollectionUpdate}
                expandedNodes={expandedNodes}
                onToggleExpanded={handleToggleExpanded}
              />
            </div>
          ))
        )}
      </div>

      {/* Add collection button */}
      {collections.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-2"
            onClick={() => {
              // TODO: Open create collection dialog
              console.log('Create new collection');
            }}
          >
            <Plus className="h-4 w-4" />
            New Collection
          </Button>
        </div>
      )}
    </div>
  );
};

export default SearchCollectionTree;