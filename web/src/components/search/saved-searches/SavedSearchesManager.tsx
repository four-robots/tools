'use client';

import React, { useState, useEffect, useMemo, useCallback, memo } from 'react';
import { Plus, Search, Filter, Grid, List, Star, Clock, Share2, Folder, MoreVertical } from 'lucide-react';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Badge } from '../../ui/badge';
import { Card } from '../../ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui/tabs';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../../ui/dropdown-menu';
import SavedSearchCard from './SavedSearchCard';
import SearchCollectionTree from './SearchCollectionTree';
import SaveSearchDialog from './SaveSearchDialog';
import { useApi } from '../../../hooks/use-api';
import { useDebounce } from '../../../hooks/useDebounce';
import type { 
  SavedSearch, 
  SearchCollection, 
  SearchListOptions, 
  PaginatedResponse,
  CollectionTreeNode 
} from '@mcp-tools/core';

// Memoized search card component for performance
const MemoizedSearchCard = memo<{
  search: SavedSearch;
  viewMode: 'grid' | 'list';
  onExecute: (id: string) => void;
  onDelete: (id: string) => void;
  onToggleFavorite: (id: string, isFavorite: boolean) => void;
  onTagClick: (tag: string) => void;
}>(({ search, viewMode, onExecute, onDelete, onToggleFavorite, onTagClick }) => (
  <SavedSearchCard
    search={search}
    viewMode={viewMode}
    onExecute={() => onExecute(search.id)}
    onDelete={() => onDelete(search.id)}
    onToggleFavorite={() => onToggleFavorite(search.id, search.isFavorite)}
    onTagClick={onTagClick}
  />
));

MemoizedSearchCard.displayName = 'MemoizedSearchCard';

interface SavedSearchesManagerProps {
  userId?: string;
  className?: string;
}

const SavedSearchesManagerComponent: React.FC<SavedSearchesManagerProps> = ({
  userId,
  className = '',
}) => {
  // State management
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [collections, setCollections] = useState<CollectionTreeNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCollection, setSelectedCollection] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [activeTab, setActiveTab] = useState('all');
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [sortBy, setSortBy] = useState<'name' | 'createdAt' | 'updatedAt' | 'executionCount'>('updatedAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [filterTags, setFilterTags] = useState<string[]>([]);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const pageSize = 20;

  const { apiCall } = useApi();

  // Debounce search query for performance
  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  // Memoize filtered searches to prevent unnecessary re-renders
  const filteredSearches = useMemo(() => {
    return savedSearches.filter(search => {
      if (activeTab === 'favorites' && !search.isFavorite) return false;
      if (filterTags.length > 0 && !filterTags.some(tag => search.tags.includes(tag))) return false;
      return true;
    });
  }, [savedSearches, activeTab, filterTags]);

  // Memoize unique tags computation
  const allTags = useMemo(() => {
    return Array.from(
      new Set(savedSearches.flatMap(search => search.tags))
    ).sort();
  }, [savedSearches]);

  // Memoize stats to prevent unnecessary calculations
  const stats = useMemo(() => ({
    totalItems,
    totalCollections: collections.length,
    favoriteCount: savedSearches.filter(s => s.isFavorite).length,
  }), [totalItems, collections.length, savedSearches]);

  // Fetch saved searches
  const fetchSavedSearches = useCallback(async (options: Partial<SearchListOptions> = {}) => {
    if (!userId) return;
    
    setLoading(true);
    setError(null);

    try {
      const queryOptions: SearchListOptions = {
        page: currentPage,
        limit: pageSize,
        sortBy,
        sortOrder,
        query: debouncedSearchQuery || undefined,
        collectionId: selectedCollection || undefined,
        tags: filterTags.length > 0 ? filterTags : undefined,
        isFavorite: activeTab === 'favorites' ? true : undefined,
        ...options,
      };

      const response = await apiCall<PaginatedResponse<SavedSearch>>(
        'GET',
        '/api/v1/saved-searches',
        undefined,
        queryOptions
      );

      setSavedSearches(response.items);
      setCurrentPage(response.currentPage);
      setTotalPages(response.totalPages);
      setTotalItems(response.totalItems);
    } catch (err) {
      console.error('Failed to fetch saved searches:', err);
      setError('Failed to load saved searches');
    } finally {
      setLoading(false);
    }
  }, [userId, currentPage, pageSize, sortBy, sortOrder, debouncedSearchQuery, selectedCollection, filterTags, activeTab]);

  // Fetch collections
  const fetchCollections = useCallback(async () => {
    if (!userId) return;

    try {
      const response = await apiCall<{ collections: CollectionTreeNode[] }>(
        'GET',
        '/api/v1/saved-searches/collections'
      );
      setCollections(response.collections);
    } catch (err) {
      console.error('Failed to fetch collections:', err);
    }
  }, [userId, apiCall]);

  // Load data on mount and when filters change
  useEffect(() => {
    fetchSavedSearches();
  }, [fetchSavedSearches]);

  // Load collections on mount
  useEffect(() => {
    fetchCollections();
  }, [fetchCollections]);

  // Event handlers with useCallback for performance
  const handleSearchExecute = useCallback(async (searchId: string) => {
    try {
      await apiCall('POST', `/api/v1/saved-searches/${searchId}/execute`);
      // Refresh the search list to update execution count
      fetchSavedSearches();
    } catch (err) {
      console.error('Failed to execute search:', err);
      setError('Failed to execute search');
    }
  }, [apiCall, fetchSavedSearches]);

  const handleSearchDelete = useCallback(async (searchId: string) => {
    try {
      await apiCall('DELETE', `/api/v1/saved-searches/${searchId}`);
      // Remove from local state
      setSavedSearches(prev => prev.filter(s => s.id !== searchId));
      setTotalItems(prev => prev - 1);
    } catch (err) {
      console.error('Failed to delete search:', err);
      setError('Failed to delete search');
    }
  };

  const handleToggleFavorite = async (searchId: string, isFavorite: boolean) => {
    try {
      const updatedSearch = await apiCall<{ search: SavedSearch }>(
        'PUT',
        `/api/v1/saved-searches/${searchId}`,
        { isFavorite: !isFavorite }
      );
      
      // Update local state
      setSavedSearches(prev =>
        prev.map(s => s.id === searchId ? updatedSearch.search : s)
      );
    } catch (err) {
      console.error('Failed to toggle favorite:', err);
      setError('Failed to update favorite status');
    }
  }, [apiCall]);

  const handleCollectionSelect = useCallback((collectionId: string | null) => {
    setSelectedCollection(collectionId);
    setCurrentPage(1);
  }, []);

  const handleTagFilter = useCallback((tag: string) => {
    if (filterTags.includes(tag)) {
      setFilterTags(prev => prev.filter(t => t !== tag));
    } else {
      setFilterTags(prev => [...prev, tag]);
    }
    setCurrentPage(1);
  }, [filterTags]);

  return (
    <div className={`saved-searches-manager ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Saved Searches</h1>
          <p className="text-sm text-gray-600 mt-1">
            Organize and manage your search queries
          </p>
        </div>
        <Button onClick={() => setShowSaveDialog(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Save Search
        </Button>
      </div>

      {/* Search and Filters */}
      <div className="space-y-4 mb-6">
        <div className="flex items-center gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Search saved searches..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2">
                <Filter className="h-4 w-4" />
                Sort
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => setSortBy('name')}>
                Name {sortBy === 'name' && (sortOrder === 'asc' ? '↑' : '↓')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortBy('updatedAt')}>
                Updated {sortBy === 'updatedAt' && (sortOrder === 'asc' ? '↑' : '↓')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortBy('createdAt')}>
                Created {sortBy === 'createdAt' && (sortOrder === 'asc' ? '↑' : '↓')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortBy('executionCount')}>
                Usage {sortBy === 'executionCount' && (sortOrder === 'asc' ? '↑' : '↓')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="flex items-center gap-2">
            <Button
              variant={viewMode === 'grid' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('grid')}
            >
              <Grid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'list' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('list')}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Tag filters */}
        {allTags.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-gray-700">Tags:</span>
            {allTags.slice(0, 10).map(tag => (
              <Badge
                key={tag}
                variant={filterTags.includes(tag) ? 'default' : 'outline'}
                className="cursor-pointer hover:bg-blue-50"
                onClick={() => handleTagFilter(tag)}
              >
                {tag}
              </Badge>
            ))}
            {allTags.length > 10 && (
              <Badge variant="outline" className="cursor-pointer">
                +{allTags.length - 10} more
              </Badge>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar - Collections */}
        <div className="lg:col-span-1">
          <Card className="p-4">
            <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Folder className="h-4 w-4" />
              Collections
            </h3>
            <SearchCollectionTree
              collections={collections}
              selectedCollectionId={selectedCollection}
              onCollectionSelect={handleCollectionSelect}
              onCollectionUpdate={fetchCollections}
              className="space-y-1"
            />
          </Card>

          {/* Quick stats */}
          <Card className="p-4 mt-4">
            <h3 className="font-semibold text-gray-900 mb-3">Quick Stats</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Total Searches:</span>
                <span className="font-medium">{stats.totalItems}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Collections:</span>
                <span className="font-medium">{stats.totalCollections}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Favorites:</span>
                <span className="font-medium">{stats.favoriteCount}</span>
              </div>
            </div>
          </Card>
        </div>

        {/* Main Content */}
        <div className="lg:col-span-3">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="all" className="gap-2">
                <Search className="h-4 w-4" />
                All
              </TabsTrigger>
              <TabsTrigger value="favorites" className="gap-2">
                <Star className="h-4 w-4" />
                Favorites
              </TabsTrigger>
              <TabsTrigger value="recent" className="gap-2">
                <Clock className="h-4 w-4" />
                Recent
              </TabsTrigger>
              <TabsTrigger value="shared" className="gap-2">
                <Share2 className="h-4 w-4" />
                Shared
              </TabsTrigger>
            </TabsList>

            <TabsContent value={activeTab} className="mt-6">
              {loading && (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  <span className="ml-2 text-gray-600">Loading searches...</span>
                </div>
              )}

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-4">
                  <p className="text-red-800">{error}</p>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => fetchSavedSearches()}
                    className="mt-2"
                  >
                    Retry
                  </Button>
                </div>
              )}

              {!loading && !error && savedSearches.length === 0 && (
                <div className="text-center py-12">
                  <Search className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    No saved searches found
                  </h3>
                  <p className="text-gray-600 mb-4">
                    {searchQuery || selectedCollection || filterTags.length > 0
                      ? 'No searches match your current filters'
                      : 'Start by saving your first search query'
                    }
                  </p>
                  <Button onClick={() => setShowSaveDialog(true)} className="gap-2">
                    <Plus className="h-4 w-4" />
                    Save Your First Search
                  </Button>
                </div>
              )}

              {!loading && !error && savedSearches.length > 0 && (
                <>
                  <div className={
                    viewMode === 'grid' 
                      ? 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4'
                      : 'space-y-3'
                  }>
                    {filteredSearches.map(search => (
                      <MemoizedSearchCard
                        key={search.id}
                        search={search}
                        viewMode={viewMode}
                        onExecute={handleSearchExecute}
                        onDelete={handleSearchDelete}
                        onToggleFavorite={handleToggleFavorite}
                        onTagClick={handleTagFilter}
                      />
                    ))}
                  </div>

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-center space-x-2 mt-8">
                      <Button
                        variant="outline"
                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                        disabled={currentPage === 1}
                      >
                        Previous
                      </Button>
                      <span className="px-4 py-2 text-sm text-gray-600">
                        Page {currentPage} of {totalPages}
                      </span>
                      <Button
                        variant="outline"
                        onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                        disabled={currentPage === totalPages}
                      >
                        Next
                      </Button>
                    </div>
                  )}
                </>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Save Search Dialog */}
      {showSaveDialog && (
        <SaveSearchDialog
          onClose={() => setShowSaveDialog(false)}
          onSave={fetchSavedSearches}
          collections={collections}
        />
      )}
    </div>
  );
};

// Memoize the main component for performance
const SavedSearchesManager = memo(SavedSearchesManagerComponent);
SavedSearchesManager.displayName = 'SavedSearchesManager';

export default SavedSearchesManager;