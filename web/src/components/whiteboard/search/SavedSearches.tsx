import React, { useState, useEffect, useCallback } from 'react';
import {
  BookmarkIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  XMarkIcon,
  PencilIcon,
  TrashIcon,
  ShareIcon,
  BellIcon,
  ClockIcon,
  EyeIcon,
  GlobeAltIcon,
  LockClosedIcon,
} from '@heroicons/react/24/outline';
import { BookmarkIcon as BookmarkIconSolid } from '@heroicons/react/24/solid';

interface SavedSearch {
  id: string;
  name: string;
  description?: string;
  searchQuery: string;
  searchFilters: Record<string, any>;
  sortConfig?: {
    field: string;
    direction: 'asc' | 'desc';
  };
  isPublic: boolean;
  isAlert: boolean;
  alertFrequency?: 'immediate' | 'daily' | 'weekly';
  lastExecutedAt?: string;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
}

interface SavedSearchesProps {
  workspaceId: string;
  userId: string;
  onSearchSelect: (savedSearch: SavedSearch) => void;
  className?: string;
  variant?: 'full' | 'compact';
  showCreateButton?: boolean;
}

const SavedSearches: React.FC<SavedSearchesProps> = ({
  workspaceId,
  userId,
  onSearchSelect,
  className = '',
  variant = 'full',
  showCreateButton = true,
}) => {
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingSearch, setEditingSearch] = useState<SavedSearch | null>(null);
  const [sortBy, setSortBy] = useState<'name' | 'usage' | 'created' | 'updated'>('updated');
  const [filterBy, setFilterBy] = useState<'all' | 'mine' | 'public' | 'alerts'>('all');

  const isCompact = variant === 'compact';

  // Load saved searches
  const loadSavedSearches = useCallback(async () => {
    setIsLoading(true);
    try {
      // Simulate API call - replace with actual implementation
      const response = await fetch(`/api/workspaces/${workspaceId}/saved-searches?userId=${userId}`);
      const data = await response.json();
      setSavedSearches(data.savedSearches || []);
    } catch (error) {
      console.error('Failed to load saved searches:', error);
      setSavedSearches([]);
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId, userId]);

  // Save search
  const saveSearch = useCallback(async (searchData: Partial<SavedSearch>) => {
    try {
      const method = editingSearch ? 'PUT' : 'POST';
      const url = editingSearch 
        ? `/api/workspaces/${workspaceId}/saved-searches/${editingSearch.id}`
        : `/api/workspaces/${workspaceId}/saved-searches`;
      
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...searchData, userId }),
      });
      
      if (response.ok) {
        await loadSavedSearches();
        setShowCreateForm(false);
        setEditingSearch(null);
      }
    } catch (error) {
      console.error('Failed to save search:', error);
    }
  }, [workspaceId, userId, editingSearch, loadSavedSearches]);

  // Delete search
  const deleteSearch = useCallback(async (searchId: string) => {
    if (!confirm('Are you sure you want to delete this saved search?')) {
      return;
    }
    
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/saved-searches/${searchId}`, {
        method: 'DELETE',
      });
      
      if (response.ok) {
        await loadSavedSearches();
      }
    } catch (error) {
      console.error('Failed to delete search:', error);
    }
  }, [workspaceId, loadSavedSearches]);

  // Toggle alert
  const toggleAlert = useCallback(async (search: SavedSearch) => {
    await saveSearch({
      ...search,
      isAlert: !search.isAlert,
      alertFrequency: !search.isAlert ? 'daily' : undefined,
    });
  }, [saveSearch]);

  // Filter and sort searches
  const filteredAndSortedSearches = React.useMemo(() => {
    let filtered = savedSearches;

    // Apply filters
    switch (filterBy) {
      case 'mine':
        // filtered = filtered.filter(search => search.createdBy === userId);
        break;
      case 'public':
        filtered = filtered.filter(search => search.isPublic);
        break;
      case 'alerts':
        filtered = filtered.filter(search => search.isAlert);
        break;
      default:
        // Show all
        break;
    }

    // Apply sorting
    return filtered.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'usage':
          return b.usageCount - a.usageCount;
        case 'created':
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case 'updated':
        default:
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      }
    });
  }, [savedSearches, sortBy, filterBy]);

  // Effects
  useEffect(() => {
    loadSavedSearches();
  }, [loadSavedSearches]);

  // Render create/edit form
  const renderForm = () => {
    const [formData, setFormData] = useState({
      name: editingSearch?.name || '',
      description: editingSearch?.description || '',
      isPublic: editingSearch?.isPublic || false,
      isAlert: editingSearch?.isAlert || false,
      alertFrequency: editingSearch?.alertFrequency || 'daily',
    });

    const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (!formData.name.trim()) return;

      saveSearch({
        ...formData,
        searchQuery: editingSearch?.searchQuery || '',
        searchFilters: editingSearch?.searchFilters || {},
        sortConfig: editingSearch?.sortConfig,
      });
    };

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
          <form onSubmit={handleSubmit}>
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium text-gray-900">
                  {editingSearch ? 'Edit Saved Search' : 'Save Search'}
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateForm(false);
                    setEditingSearch(null);
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <XMarkIcon className="h-6 w-6" />
                </button>
              </div>
            </div>

            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter search name"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Optional description"
                  rows={3}
                />
              </div>

              <div className="space-y-3">
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={formData.isPublic}
                    onChange={(e) => setFormData(prev => ({ ...prev, isPublic: e.target.checked }))}
                    className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-900">Make public</span>
                </label>

                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={formData.isAlert}
                    onChange={(e) => setFormData(prev => ({ ...prev, isAlert: e.target.checked }))}
                    className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-900">Enable alerts</span>
                </label>

                {formData.isAlert && (
                  <div className="ml-6">
                    <select
                      value={formData.alertFrequency}
                      onChange={(e) => setFormData(prev => ({ ...prev, alertFrequency: e.target.value as any }))}
                      className="px-3 py-1 border border-gray-300 rounded text-sm"
                    >
                      <option value="immediate">Immediate</option>
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                    </select>
                  </div>
                )}
              </div>
            </div>

            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => {
                  setShowCreateForm(false);
                  setEditingSearch(null);
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700"
              >
                {editingSearch ? 'Update' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  // Render search item
  const renderSearchItem = (search: SavedSearch) => (
    <div
      key={search.id}
      className="group p-4 hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onSearchSelect(search)}>
          <div className="flex items-center space-x-2">
            <BookmarkIconSolid className="h-4 w-4 text-blue-500 flex-shrink-0" />
            <h4 className="text-sm font-medium text-gray-900 truncate">
              {search.name}
            </h4>
            {search.isPublic && (
              <GlobeAltIcon className="h-3 w-3 text-green-500" title="Public" />
            )}
            {!search.isPublic && (
              <LockClosedIcon className="h-3 w-3 text-gray-400" title="Private" />
            )}
            {search.isAlert && (
              <BellIcon className="h-3 w-3 text-orange-500" title={`Alert: ${search.alertFrequency}`} />
            )}
          </div>

          {search.description && !isCompact && (
            <p className="mt-1 text-sm text-gray-600 line-clamp-2">
              {search.description}
            </p>
          )}

          <div className="mt-2 flex items-center space-x-4 text-xs text-gray-500">
            <span className="flex items-center space-x-1">
              <MagnifyingGlassIcon className="h-3 w-3" />
              <span>"{search.searchQuery.substring(0, 30)}{search.searchQuery.length > 30 ? '...' : ''}"</span>
            </span>
            
            {!isCompact && (
              <>
                <span className="flex items-center space-x-1">
                  <EyeIcon className="h-3 w-3" />
                  <span>{search.usageCount} uses</span>
                </span>
                
                {search.lastExecutedAt && (
                  <span className="flex items-center space-x-1">
                    <ClockIcon className="h-3 w-3" />
                    <span>Last used {new Date(search.lastExecutedAt).toLocaleDateString()}</span>
                  </span>
                )}
              </>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => toggleAlert(search)}
            className={`p-1 rounded hover:bg-gray-200 transition-colors ${
              search.isAlert ? 'text-orange-500' : 'text-gray-400'
            }`}
            title={search.isAlert ? 'Disable alerts' : 'Enable alerts'}
          >
            <BellIcon className="h-4 w-4" />
          </button>
          
          <button
            onClick={() => setEditingSearch(search)}
            className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors"
            title="Edit search"
          >
            <PencilIcon className="h-4 w-4" />
          </button>
          
          <button
            onClick={() => deleteSearch(search.id)}
            className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-red-600 transition-colors"
            title="Delete search"
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );

  // Render loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-sm text-gray-500">Loading saved searches...</div>
      </div>
    );
  }

  return (
    <div className={`saved-searches bg-white border border-gray-200 rounded-lg ${className}`}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <BookmarkIcon className="h-5 w-5 text-gray-500" />
            <h3 className="text-sm font-medium text-gray-900">Saved Searches</h3>
            {savedSearches.length > 0 && (
              <span className="text-xs text-gray-500">({savedSearches.length})</span>
            )}
          </div>

          {showCreateButton && (
            <button
              onClick={() => setShowCreateForm(true)}
              className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
              title="Create new saved search"
            >
              <PlusIcon className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Filters and Sort */}
        {!isCompact && savedSearches.length > 0 && (
          <div className="mt-3 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <select
                value={filterBy}
                onChange={(e) => setFilterBy(e.target.value as any)}
                className="text-xs border-gray-300 rounded px-2 py-1"
              >
                <option value="all">All Searches</option>
                <option value="mine">My Searches</option>
                <option value="public">Public</option>
                <option value="alerts">With Alerts</option>
              </select>
            </div>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="text-xs border-gray-300 rounded px-2 py-1"
            >
              <option value="updated">Recently Updated</option>
              <option value="created">Recently Created</option>
              <option value="name">Name</option>
              <option value="usage">Most Used</option>
            </select>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="max-h-96 overflow-y-auto">
        {filteredAndSortedSearches.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <BookmarkIcon className="h-8 w-8 mx-auto mb-2 text-gray-300" />
            <p className="text-sm">No saved searches yet</p>
            {showCreateButton && (
              <button
                onClick={() => setShowCreateForm(true)}
                className="mt-2 text-sm text-blue-600 hover:text-blue-800"
              >
                Save your first search
              </button>
            )}
          </div>
        ) : (
          <div>
            {filteredAndSortedSearches.map(renderSearchItem)}
          </div>
        )}
      </div>

      {/* Form Modal */}
      {(showCreateForm || editingSearch) && renderForm()}
    </div>
  );
};

export default SavedSearches;