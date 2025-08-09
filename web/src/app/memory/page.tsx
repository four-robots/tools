'use client';

import { useState } from 'react';
import { useMemories, useMemoryMutations, useMemorySearch } from '@/hooks/use-api';
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
  Brain, 
  Filter,
  Calendar,
  Tag,
  MoreHorizontal,
  Edit3,
  Trash2,
  Star,
  Clock
} from 'lucide-react';
import Link from 'next/link';

interface Memory {
  id: string;
  title: string;
  content: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  category?: string;
  isStarred?: boolean;
  type: 'text' | 'link' | 'note' | 'idea';
}

function MemoryPageContent() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingMemory, setEditingMemory] = useState<Memory | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [newMemory, setNewMemory] = useState<{
    title: string;
    content: string;
    tags: string;
    category: string;
    type: 'text' | 'link' | 'note' | 'idea';
  }>({
    title: '',
    content: '',
    tags: '',
    category: '',
    type: 'note',
  });

  const { data: memoriesData, isLoading, error } = useMemories();
  const { data: searchData } = useMemorySearch(searchQuery, { category: selectedCategory !== 'all' ? selectedCategory : undefined });
  const { createMemory, updateMemory, deleteMemory } = useMemoryMutations();

  const handleCreateMemory = async () => {
    if (!newMemory.title.trim() || !newMemory.content.trim()) return;
    
    try {
      const memoryData = {
        ...newMemory,
        tags: newMemory.tags.split(',').map(tag => tag.trim()).filter(tag => tag),
      };

      if (editingMemory) {
        await updateMemory.mutateAsync({
          id: editingMemory.id,
          updates: memoryData,
        });
      } else {
        await createMemory.mutateAsync(memoryData);
      }
      
      setNewMemory({ title: '', content: '', tags: '', category: '', type: 'note' });
      setEditingMemory(null);
      setIsCreateOpen(false);
    } catch (error) {
      // Error handled by hook
    }
  };

  const handleEditMemory = (memory: Memory) => {
    setEditingMemory(memory);
    setNewMemory({
      title: memory.title,
      content: memory.content,
      tags: memory.tags.join(', '),
      category: memory.category || '',
      type: memory.type,
    });
    setIsCreateOpen(true);
  };

  const handleDeleteMemory = async (memoryId: string) => {
    try {
      await deleteMemory.mutateAsync(memoryId);
    } catch (error) {
      // Error handled by hook
    }
  };

  const memories: Memory[] = searchQuery ? (searchData?.data || []) : (memoriesData?.data || []);
  const filteredMemories = selectedCategory === 'all' 
    ? memories 
    : memories.filter(memory => memory.category === selectedCategory);

  const categories = ['all', 'work', 'personal', 'ideas', 'research', 'notes'];

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'link': return '🔗';
      case 'idea': return '💡';
      case 'note': return '📝';
      case 'text': return '📄';
      default: return '📝';
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'link': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'idea': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'note': return 'bg-green-100 text-green-800 border-green-200';
      case 'text': return 'bg-gray-100 text-gray-800 border-gray-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Brain className="w-12 h-12 text-purple-500 mx-auto mb-4 animate-pulse" />
          <p className="text-gray-600">Loading your memories...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center mx-auto mb-4">
            <Brain className="w-6 h-6 text-red-600" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Failed to load memories</h2>
          <p className="text-gray-600 mb-4">There was an error loading your memory collection.</p>
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
                <Brain className="w-8 h-8 mr-2" />
                <span className="font-semibold">Memory Management</span>
              </Link>
            </div>
            
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  New Memory
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>
                    {editingMemory ? 'Edit Memory' : 'Create New Memory'}
                  </DialogTitle>
                  <DialogDescription>
                    {editingMemory 
                      ? 'Update your memory with new information.'
                      : 'Save important information, ideas, or notes for future reference.'
                    }
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="memoryTitle">Title</Label>
                    <Input
                      id="memoryTitle"
                      placeholder="Enter memory title"
                      value={newMemory.title}
                      onChange={(e) => setNewMemory({ ...newMemory, title: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="memoryContent">Content</Label>
                    <Textarea
                      id="memoryContent"
                      placeholder="Enter memory content"
                      value={newMemory.content}
                      onChange={(e) => setNewMemory({ ...newMemory, content: e.target.value })}
                      rows={4}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="memoryType">Type</Label>
                      <select
                        id="memoryType"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                        value={newMemory.type}
                        onChange={(e) => setNewMemory({ ...newMemory, type: e.target.value as any })}
                      >
                        <option value="note">Note</option>
                        <option value="idea">Idea</option>
                        <option value="link">Link</option>
                        <option value="text">Text</option>
                      </select>
                    </div>
                    <div>
                      <Label htmlFor="memoryCategory">Category</Label>
                      <select
                        id="memoryCategory"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                        value={newMemory.category}
                        onChange={(e) => setNewMemory({ ...newMemory, category: e.target.value })}
                      >
                        <option value="">No category</option>
                        <option value="work">Work</option>
                        <option value="personal">Personal</option>
                        <option value="ideas">Ideas</option>
                        <option value="research">Research</option>
                        <option value="notes">Notes</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="memoryTags">Tags (comma-separated)</Label>
                    <Input
                      id="memoryTags"
                      placeholder="e.g., important, project, meeting"
                      value={newMemory.tags}
                      onChange={(e) => setNewMemory({ ...newMemory, tags: e.target.value })}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                    Cancel
                  </Button>
                  <Button 
                    onClick={handleCreateMemory}
                    disabled={!newMemory.title.trim() || !newMemory.content.trim() || (editingMemory ? updateMemory.isPending : createMemory.isPending)}
                  >
                    {editingMemory 
                      ? (updateMemory.isPending ? 'Updating...' : 'Update Memory')
                      : (createMemory.isPending ? 'Creating...' : 'Create Memory')
                    }
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </header>

      {/* Search and Filters */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              placeholder="Search memories..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex gap-2">
            <select
              className="px-3 py-2 border border-gray-300 rounded-md"
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
        </div>

        {/* Memory Grid */}
        {filteredMemories.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-24 h-24 bg-purple-50 rounded-full flex items-center justify-center mx-auto mb-6">
              <Brain className="w-12 h-12 text-purple-500" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              {searchQuery ? 'No memories found' : 'No memories yet'}
            </h2>
            <p className="text-gray-600 mb-6 max-w-md mx-auto">
              {searchQuery 
                ? 'Try adjusting your search terms or filters.'
                : 'Start building your knowledge base by creating your first memory.'
              }
            </p>
            {!searchQuery && (
              <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                <DialogTrigger asChild>
                  <Button size="lg">
                    <Plus className="w-5 h-5 mr-2" />
                    Create Your First Memory
                  </Button>
                </DialogTrigger>
              </Dialog>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredMemories.map((memory: Memory) => (
              <Card key={memory.id} className="hover:shadow-lg transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center mb-2">
                        <span className="text-lg mr-2">{getTypeIcon(memory.type)}</span>
                        <span className={`px-2 py-1 text-xs rounded-full border ${getTypeColor(memory.type)}`}>
                          {memory.type}
                        </span>
                        {memory.category && (
                          <span className="ml-2 px-2 py-1 text-xs bg-gray-100 text-gray-800 rounded-full">
                            {memory.category}
                          </span>
                        )}
                      </div>
                      <CardTitle className="text-lg leading-tight">
                        {memory.title}
                      </CardTitle>
                    </div>
                    <div className="flex items-center space-x-1">
                      {memory.isStarred && (
                        <Star className="w-4 h-4 text-yellow-500 fill-current" />
                      )}
                      <Button 
                        variant="ghost" 
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => {/* Handle menu */}}
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-600 mb-4 line-clamp-3">
                    {memory.content}
                  </p>
                  
                  {memory.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {memory.tags.slice(0, 3).map((tag, index) => (
                        <span key={index} className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full">
                          #{tag}
                        </span>
                      ))}
                      {memory.tags.length > 3 && (
                        <span className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded-full">
                          +{memory.tags.length - 3} more
                        </span>
                      )}
                    </div>
                  )}
                  
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <div className="flex items-center">
                      <Clock className="w-3 h-3 mr-1" />
                      {new Date(memory.createdAt).toLocaleDateString()}
                    </div>
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2"
                        onClick={() => handleEditMemory(memory)}
                      >
                        <Edit3 className="w-3 h-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-red-600 hover:text-red-700"
                        onClick={() => handleDeleteMemory(memory.id)}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function MemoryPage() {
  return (
    <PageWrapper>
      <MemoryPageContent />
    </PageWrapper>
  );
}