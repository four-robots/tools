'use client';

import { useState } from 'react';
import { useWikiPages, useWikiMutations } from '@/hooks/use-api';
import { PageWrapper } from '@/components/PageWrapper';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { 
  Plus, 
  Search, 
  BookOpen, 
  Filter,
  Calendar,
  Tag,
  MoreHorizontal,
  Edit3,
  Trash2,
  FileText,
  Folder,
  Home,
  ChevronRight
} from 'lucide-react';
import Link from 'next/link';
import { useRealtimeWiki } from '@/hooks/use-realtime';

interface WikiPage {
  id: string;
  title: string;
  content: string;
  slug: string;
  category: string;
  tags: string[];
  parent?: string;
  children?: WikiPage[];
  createdAt: string;
  updatedAt: string;
  author?: string;
  isPublished: boolean;
}

function WikiPageContent() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [showTree, setShowTree] = useState(true);
  const [newPage, setNewPage] = useState({
    title: '',
    content: '',
    category: '',
    tags: '',
    parent: '',
  });

  const { data: pagesData, isLoading, error } = useWikiPages();
  const { createPage, updatePage, deletePage } = useWikiMutations();
  
  // Real-time updates for wiki
  useRealtimeWiki();

  const handleCreatePage = async () => {
    if (!newPage.title.trim() || !newPage.content.trim()) return;
    
    try {
      const pageData = {
        ...newPage,
        slug: newPage.title.toLowerCase().replace(/\s+/g, '-'),
        tags: newPage.tags.split(',').map(tag => tag.trim()).filter(tag => tag),
        isPublished: true,
      };

      await createPage.mutateAsync(pageData);
      
      setNewPage({ title: '', content: '', category: '', tags: '', parent: '' });
      setIsCreateOpen(false);
    } catch (error) {
      // Error handled by hook
    }
  };

  const pages: WikiPage[] = pagesData?.data || [];
  const filteredPages = pages.filter(page => {
    const matchesSearch = !searchQuery || 
      page.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      page.content.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || page.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const categories = ['all', 'documentation', 'guides', 'api', 'tutorials', 'reference'];

  // Build page tree structure
  const buildPageTree = (pages: WikiPage[]): WikiPage[] => {
    const pageMap = new Map<string, WikiPage>();
    const rootPages: WikiPage[] = [];

    // First pass: create map
    pages.forEach(page => {
      pageMap.set(page.id, { ...page, children: [] });
    });

    // Second pass: build tree
    pages.forEach(page => {
      const currentPage = pageMap.get(page.id)!;
      if (page.parent && pageMap.has(page.parent)) {
        const parentPage = pageMap.get(page.parent)!;
        parentPage.children = parentPage.children || [];
        parentPage.children.push(currentPage);
      } else {
        rootPages.push(currentPage);
      }
    });

    return rootPages;
  };

  const pageTree = buildPageTree(filteredPages);

  const PageTreeItem = ({ page, level = 0 }: { page: WikiPage; level?: number }) => (
    <div className={`${level > 0 ? 'ml-6' : ''}`}>
      <Link href={`/wiki/${page.id}`}>
        <div className="flex items-center py-2 px-3 hover:bg-gray-50 rounded-lg transition-colors group">
          <div className="flex items-center flex-1">
            {page.children && page.children.length > 0 ? (
              <Folder className="w-4 h-4 text-gray-400 mr-2" />
            ) : (
              <FileText className="w-4 h-4 text-gray-400 mr-2" />
            )}
            <span className="text-sm font-medium text-gray-900 group-hover:text-blue-600">
              {page.title}
            </span>
          </div>
          <ChevronRight className="w-4 h-4 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </Link>
      {page.children && page.children.map(child => (
        <PageTreeItem key={child.id} page={child} level={level + 1} />
      ))}
    </div>
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <BookOpen className="w-12 h-12 text-green-500 mx-auto mb-4 animate-pulse" />
          <p className="text-gray-600">Loading wiki pages...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center mx-auto mb-4">
            <BookOpen className="w-6 h-6 text-red-600" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Failed to load wiki</h2>
          <p className="text-gray-600 mb-4">There was an error loading the wiki pages.</p>
          <Button onClick={() => window.location.reload()}>
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <Link href="/dashboard" className="flex items-center text-gray-600 hover:text-gray-900 mr-6">
                <BookOpen className="w-8 h-8 mr-2" />
                <span className="font-semibold">Wiki Documentation</span>
              </Link>
            </div>
            
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  New Page
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Create New Wiki Page</DialogTitle>
                  <DialogDescription>
                    Create documentation, guides, or reference material.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="pageTitle">Title</Label>
                    <Input
                      id="pageTitle"
                      placeholder="Enter page title"
                      value={newPage.title}
                      onChange={(e) => setNewPage({ ...newPage, title: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="pageContent">Content</Label>
                    <Textarea
                      id="pageContent"
                      placeholder="Write your documentation in Markdown format..."
                      value={newPage.content}
                      onChange={(e) => setNewPage({ ...newPage, content: e.target.value })}
                      rows={8}
                      className="font-mono text-sm"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="pageCategory">Category</Label>
                      <select
                        id="pageCategory"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                        value={newPage.category}
                        onChange={(e) => setNewPage({ ...newPage, category: e.target.value })}
                      >
                        <option value="">Select category</option>
                        <option value="documentation">Documentation</option>
                        <option value="guides">Guides</option>
                        <option value="api">API</option>
                        <option value="tutorials">Tutorials</option>
                        <option value="reference">Reference</option>
                      </select>
                    </div>
                    <div>
                      <Label htmlFor="pageParent">Parent Page (optional)</Label>
                      <select
                        id="pageParent"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                        value={newPage.parent}
                        onChange={(e) => setNewPage({ ...newPage, parent: e.target.value })}
                      >
                        <option value="">No parent (root page)</option>
                        {pages.map(page => (
                          <option key={page.id} value={page.id}>{page.title}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="pageTags">Tags (comma-separated)</Label>
                    <Input
                      id="pageTags"
                      placeholder="e.g., setup, configuration, advanced"
                      value={newPage.tags}
                      onChange={(e) => setNewPage({ ...newPage, tags: e.target.value })}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                    Cancel
                  </Button>
                  <Button 
                    onClick={handleCreatePage}
                    disabled={!newPage.title.trim() || !newPage.content.trim() || createPage.isPending}
                  >
                    {createPage.isPending ? 'Creating...' : 'Create Page'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex gap-6">
          {/* Sidebar */}
          <aside className={`${showTree ? 'w-80' : 'w-0'} transition-all duration-300 overflow-hidden`}>
            <div className="bg-white rounded-lg shadow-sm border">
              <div className="p-4 border-b">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-semibold text-gray-900">Page Structure</h2>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowTree(!showTree)}
                  >
                    {showTree ? '←' : '→'}
                  </Button>
                </div>
                
                {/* Category Filter */}
                <select
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                >
                  {categories.map(category => (
                    <option key={category} value={category}>
                      {category === 'all' ? 'All Categories' : category.charAt(0).toUpperCase() + category.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
              
              <div className="p-4 max-h-[calc(100vh-200px)] overflow-y-auto">
                {pageTree.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-4">No pages found</p>
                ) : (
                  <div className="space-y-1">
                    {pageTree.map(page => (
                      <PageTreeItem key={page.id} page={page} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </aside>

          {/* Main Content Area */}
          <main className="flex-1">
            {/* Search Bar */}
            <div className="mb-6">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input
                  placeholder="Search wiki pages..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            {/* Page Grid */}
            {filteredPages.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-24 h-24 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-6">
                  <BookOpen className="w-12 h-12 text-green-500" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">
                  {searchQuery ? 'No pages found' : 'No wiki pages yet'}
                </h2>
                <p className="text-gray-600 mb-6 max-w-md mx-auto">
                  {searchQuery 
                    ? 'Try adjusting your search terms.'
                    : 'Start building your knowledge base by creating the first page.'
                  }
                </p>
                {!searchQuery && (
                  <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                    <DialogTrigger asChild>
                      <Button size="lg">
                        <Plus className="w-5 h-5 mr-2" />
                        Create Your First Page
                      </Button>
                    </DialogTrigger>
                  </Dialog>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredPages.map((page: WikiPage) => (
                  <Link key={page.id} href={`/wiki/${page.id}`}>
                    <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <CardTitle className="text-lg line-clamp-2">
                              {page.title}
                            </CardTitle>
                            <div className="flex items-center mt-2 space-x-2">
                              {page.category && (
                                <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">
                                  {page.category}
                                </span>
                              )}
                              {page.parent && (
                                <span className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full">
                                  Has parent
                                </span>
                              )}
                            </div>
                          </div>
                          <FileText className="w-5 h-5 text-gray-400 flex-shrink-0" />
                        </div>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-gray-600 line-clamp-3 mb-4">
                          {page.content.substring(0, 150)}...
                        </p>
                        
                        {page.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-3">
                            {page.tags.slice(0, 3).map((tag, index) => (
                              <span key={index} className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded-full">
                                #{tag}
                              </span>
                            ))}
                            {page.tags.length > 3 && (
                              <span className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded-full">
                                +{page.tags.length - 3}
                              </span>
                            )}
                          </div>
                        )}
                        
                        <div className="flex items-center justify-between text-xs text-gray-500">
                          <div className="flex items-center">
                            <Calendar className="w-3 h-3 mr-1" />
                            {new Date(page.updatedAt).toLocaleDateString()}
                          </div>
                          {page.author && (
                            <span className="text-gray-600">{page.author}</span>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

export default function WikiPage() {
  return (
    <PageWrapper>
      <WikiPageContent />
    </PageWrapper>
  );
}