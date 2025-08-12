import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Search, Grid3X3, List, Filter, Star, Users, Clock, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TemplateCard } from './TemplateCard';
import { TemplateFilters } from './TemplateFilters';
import { SystemTemplates } from './SystemTemplates';
import { useTemplates } from './hooks/useTemplates';
import { useTemplateSearch } from './hooks/useTemplateSearch';
import { WhiteboardTemplate } from '@/types/whiteboard';

export interface TemplateGalleryProps {
  workspaceId?: string;
  onSelectTemplate?: (template: WhiteboardTemplate) => void;
  onCreateTemplate?: () => void;
  className?: string;
}

type ViewMode = 'grid' | 'list';
type TabMode = 'all' | 'workspace' | 'public' | 'favorites';

const TEMPLATE_CATEGORIES = [
  'All Categories',
  'Brainstorming',
  'Project Planning',
  'User Journey',
  'Wireframes',
  'Retrospectives',
  'Analysis',
  'Business Model',
  'Flowcharts',
  'Meeting Notes',
  'Design System',
  'Custom'
];

export function TemplateGallery({
  workspaceId,
  onSelectTemplate,
  onCreateTemplate,
  className = ''
}: TemplateGalleryProps) {
  // State management
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [activeTab, setActiveTab] = useState<TabMode>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All Categories');
  const [sortBy, setSortBy] = useState('rating');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [minRating, setMinRating] = useState(0);

  // Template management hooks
  const {
    templates,
    loading,
    error,
    total,
    hasMore,
    loadMore,
    refresh,
    favorites,
    toggleFavorite,
  } = useTemplates(workspaceId);

  const {
    searchResults,
    searchLoading,
    searchError,
    search,
    clearSearch,
  } = useTemplateSearch(workspaceId);

  // Filter templates based on current tab and filters
  const filteredTemplates = useMemo(() => {
    let items = searchTerm ? searchResults : templates;
    
    // Filter by tab
    switch (activeTab) {
      case 'workspace':
        items = items.filter(t => t.workspaceId === workspaceId);
        break;
      case 'public':
        items = items.filter(t => t.isPublic);
        break;
      case 'favorites':
        items = items.filter(t => favorites.has(t.id));
        break;
      default:
        // 'all' - no filtering
        break;
    }

    // Filter by category
    if (selectedCategory !== 'All Categories') {
      items = items.filter(t => t.category === selectedCategory);
    }

    // Filter by tags
    if (selectedTags.length > 0) {
      items = items.filter(t => 
        selectedTags.some(tag => t.tags.includes(tag))
      );
    }

    // Filter by rating
    if (minRating > 0) {
      items = items.filter(t => (t.rating || 0) >= minRating);
    }

    // Sort templates
    const sortedItems = [...items].sort((a, b) => {
      let aValue, bValue;
      
      switch (sortBy) {
        case 'name':
          aValue = a.name.toLowerCase();
          bValue = b.name.toLowerCase();
          break;
        case 'rating':
          aValue = a.rating || 0;
          bValue = b.rating || 0;
          break;
        case 'usage':
          aValue = a.usageCount || 0;
          bValue = b.usageCount || 0;
          break;
        case 'created':
          aValue = new Date(a.createdAt).getTime();
          bValue = new Date(b.createdAt).getTime();
          break;
        case 'updated':
          aValue = new Date(a.updatedAt).getTime();
          bValue = new Date(b.updatedAt).getTime();
          break;
        default:
          return 0;
      }

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return sortedItems;
  }, [
    templates,
    searchResults,
    searchTerm,
    activeTab,
    selectedCategory,
    selectedTags,
    minRating,
    sortBy,
    sortDirection,
    workspaceId,
    favorites
  ]);

  // Search handler with debouncing
  const debouncedSearch = useCallback(
    useMemo(() => {
      const timeout = setTimeout(() => {
        if (searchTerm.trim()) {
          search({
            query: searchTerm,
            filters: {
              category: selectedCategory !== 'All Categories' ? [selectedCategory] : undefined,
              tags: selectedTags.length > 0 ? selectedTags : undefined,
              minRating: minRating > 0 ? minRating : undefined,
            },
            sort: {
              field: sortBy as any,
              direction: sortDirection,
            },
          });
        } else {
          clearSearch();
        }
      }, 300);

      return () => clearTimeout(timeout);
    }, [searchTerm, selectedCategory, selectedTags, minRating, sortBy, sortDirection]),
    [search, clearSearch, searchTerm, selectedCategory, selectedTags, minRating, sortBy, sortDirection]
  );

  // Effect for search debouncing
  useEffect(() => {
    return debouncedSearch;
  }, [debouncedSearch]);

  // Handle template selection
  const handleSelectTemplate = useCallback((template: WhiteboardTemplate) => {
    onSelectTemplate?.(template);
  }, [onSelectTemplate]);

  // Handle template favoriting
  const handleToggleFavorite = useCallback((templateId: string, isFavorite: boolean) => {
    toggleFavorite(templateId, isFavorite);
  }, [toggleFavorite]);

  // Get tab counts
  const getTabCount = (tab: TabMode): number => {
    switch (tab) {
      case 'all':
        return templates.length;
      case 'workspace':
        return templates.filter(t => t.workspaceId === workspaceId).length;
      case 'public':
        return templates.filter(t => t.isPublic).length;
      case 'favorites':
        return favorites.size;
      default:
        return 0;
    }
  };

  // Render template grid or list
  const renderTemplates = () => {
    const isLoading = loading || searchLoading;
    const currentError = error || searchError;

    if (isLoading && filteredTemplates.length === 0) {
      return (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p className="text-gray-500">Loading templates...</p>
          </div>
        </div>
      );
    }

    if (currentError) {
      return (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <p className="text-red-500 mb-4">Error loading templates: {currentError.message}</p>
            <Button onClick={refresh} variant="outline">
              Try Again
            </Button>
          </div>
        </div>
      );
    }

    if (filteredTemplates.length === 0) {
      return (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <p className="text-gray-500 mb-4">
              {searchTerm ? 'No templates found matching your search.' : 'No templates available.'}
            </p>
            {onCreateTemplate && (
              <Button onClick={onCreateTemplate}>
                Create Your First Template
              </Button>
            )}
          </div>
        </div>
      );
    }

    const containerClass = viewMode === 'grid' 
      ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6'
      : 'space-y-4';

    return (
      <div className={containerClass}>
        {filteredTemplates.map((template) => (
          <TemplateCard
            key={template.id}
            template={template}
            viewMode={viewMode}
            isFavorite={favorites.has(template.id)}
            onSelect={() => handleSelectTemplate(template)}
            onToggleFavorite={(isFavorite) => handleToggleFavorite(template.id, isFavorite)}
            className="cursor-pointer hover:shadow-md transition-shadow"
          />
        ))}
      </div>
    );
  };

  return (
    <div className={`template-gallery ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Template Gallery</h2>
          <p className="text-gray-600 mt-1">
            Choose from {total} professional templates or create your own
          </p>
        </div>
        {onCreateTemplate && (
          <Button onClick={onCreateTemplate}>
            Create Template
          </Button>
        )}
      </div>

      {/* Search and Filters Bar */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search templates..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Category Filter */}
        <Select value={selectedCategory} onValueChange={setSelectedCategory}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TEMPLATE_CATEGORIES.map((category) => (
              <SelectItem key={category} value={category}>
                {category}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Sort By */}
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="rating">
              <div className="flex items-center gap-2">
                <Star className="h-4 w-4" />
                Rating
              </div>
            </SelectItem>
            <SelectItem value="usage">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Usage
              </div>
            </SelectItem>
            <SelectItem value="name">Name</SelectItem>
            <SelectItem value="created">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Created
              </div>
            </SelectItem>
            <SelectItem value="updated">Updated</SelectItem>
          </SelectContent>
        </Select>

        {/* View Mode Toggle */}
        <div className="flex border border-gray-200 rounded-md">
          <Button
            size="sm"
            variant={viewMode === 'grid' ? 'default' : 'ghost'}
            onClick={() => setViewMode('grid')}
            className="rounded-r-none"
          >
            <Grid3X3 className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant={viewMode === 'list' ? 'default' : 'ghost'}
            onClick={() => setViewMode('list')}
            className="rounded-l-none border-l-0"
          >
            <List className="h-4 w-4" />
          </Button>
        </div>

        {/* Filters Toggle */}
        <Button
          variant="outline"
          onClick={() => setShowFilters(!showFilters)}
          className="flex items-center gap-2"
        >
          <Filter className="h-4 w-4" />
          Filters
          {(selectedTags.length > 0 || minRating > 0) && (
            <Badge variant="secondary" className="ml-1">
              {selectedTags.length + (minRating > 0 ? 1 : 0)}
            </Badge>
          )}
        </Button>
      </div>

      {/* Advanced Filters Panel */}
      {showFilters && (
        <TemplateFilters
          selectedTags={selectedTags}
          onTagsChange={setSelectedTags}
          minRating={minRating}
          onMinRatingChange={setMinRating}
          onClear={() => {
            setSelectedTags([]);
            setMinRating(0);
          }}
          className="mb-6"
        />
      )}

      {/* Template Tabs */}
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as TabMode)} className="mb-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="all" className="flex items-center gap-2">
            All Templates
            <Badge variant="secondary">{getTabCount('all')}</Badge>
          </TabsTrigger>
          {workspaceId && (
            <TabsTrigger value="workspace" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Workspace
              <Badge variant="secondary">{getTabCount('workspace')}</Badge>
            </TabsTrigger>
          )}
          <TabsTrigger value="public" className="flex items-center gap-2">
            Public
            <Badge variant="secondary">{getTabCount('public')}</Badge>
          </TabsTrigger>
          <TabsTrigger value="favorites" className="flex items-center gap-2">
            <Star className="h-4 w-4" />
            Favorites
            <Badge variant="secondary">{getTabCount('favorites')}</Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-6">
          {activeTab === 'all' && (
            <>
              <SystemTemplates onSelectTemplate={handleSelectTemplate} className="mb-8" />
              {renderTemplates()}
            </>
          )}
        </TabsContent>

        <TabsContent value="workspace" className="mt-6">
          {activeTab === 'workspace' && renderTemplates()}
        </TabsContent>

        <TabsContent value="public" className="mt-6">
          {activeTab === 'public' && renderTemplates()}
        </TabsContent>

        <TabsContent value="favorites" className="mt-6">
          {activeTab === 'favorites' && renderTemplates()}
        </TabsContent>
      </Tabs>

      {/* Load More Button */}
      {hasMore && !searchTerm && (
        <div className="flex justify-center mt-8">
          <Button 
            variant="outline" 
            onClick={loadMore}
            disabled={loading}
          >
            {loading ? 'Loading...' : 'Load More Templates'}
          </Button>
        </div>
      )}
    </div>
  );
}