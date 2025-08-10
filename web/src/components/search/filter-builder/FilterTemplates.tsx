'use client';

import React, { useState, useMemo } from 'react';
import { FilterTemplate, FilterPreset } from '@mcp-tools/core';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Badge } from '../../ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui/tabs';
import { Dialog } from '../../ui/dialog';
import { 
  Template, 
  Star, 
  Search,
  Save,
  Trash2,
  Globe,
  Lock,
  Clock,
  Tag,
  Users
} from 'lucide-react';

interface FilterTemplatesProps {
  templates?: FilterTemplate[];
  presets?: FilterPreset[];
  onTemplateApply?: (template: FilterTemplate) => void;
  onPresetApply?: (preset: FilterPreset) => void;
  onTemplateSave?: (name: string, description?: string, category?: string, tags?: string[]) => void;
  onTemplateDelete?: (templateId: string) => void;
  onPresetDelete?: (presetId: string) => void;
  onTemplateShare?: (templateId: string) => void;
}

export const FilterTemplates: React.FC<FilterTemplatesProps> = ({
  templates = [],
  presets = [],
  onTemplateApply,
  onPresetApply,
  onTemplateSave,
  onTemplateDelete,
  onPresetDelete,
  onTemplateShare
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveForm, setSaveForm] = useState({
    name: '',
    description: '',
    category: 'general',
    tags: ''
  });

  // Get all available categories
  const categories = useMemo(() => {
    const cats = new Set(['all', 'general']);
    templates.forEach(t => t.category && cats.add(t.category));
    return Array.from(cats);
  }, [templates]);

  // Filter templates based on search and category
  const filteredTemplates = useMemo(() => {
    return templates.filter(template => {
      const matchesSearch = !searchTerm || 
        template.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        template.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        template.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()));
      
      const matchesCategory = selectedCategory === 'all' || template.category === selectedCategory;
      
      return matchesSearch && matchesCategory;
    });
  }, [templates, searchTerm, selectedCategory]);

  // Filter presets based on search
  const filteredPresets = useMemo(() => {
    return presets.filter(preset => {
      return !searchTerm || preset.name.toLowerCase().includes(searchTerm.toLowerCase());
    });
  }, [presets, searchTerm]);

  // Handle template save
  const handleSave = () => {
    const tags = saveForm.tags.split(',').map(t => t.trim()).filter(Boolean);
    onTemplateSave?.(saveForm.name, saveForm.description, saveForm.category, tags);
    setShowSaveDialog(false);
    setSaveForm({ name: '', description: '', category: 'general', tags: '' });
  };

  // Get category color
  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'search': return 'bg-blue-100 text-blue-800';
      case 'analytics': return 'bg-purple-100 text-purple-800';
      case 'reports': return 'bg-green-100 text-green-800';
      case 'automation': return 'bg-orange-100 text-orange-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  // Template card component
  const TemplateCard: React.FC<{ template: FilterTemplate }> = ({ template }) => (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-base flex items-center gap-2">
              <Template size={16} />
              {template.name}
              {template.isPublic ? (
                <Globe size={12} className="text-blue-500" />
              ) : (
                <Lock size={12} className="text-gray-500" />
              )}
            </CardTitle>
            {template.description && (
              <p className="text-sm text-gray-600 mt-1">{template.description}</p>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onTemplateShare?.(template.id)}
          >
            <Users size={14} />
          </Button>
        </div>
        
        <div className="flex items-center gap-2 mt-2">
          {template.category && (
            <Badge className={getCategoryColor(template.category)}>
              {template.category}
            </Badge>
          )}
          <Badge variant="outline" className="text-xs">
            <Clock size={10} className="mr-1" />
            {template.usageCount} uses
          </Badge>
        </div>
        
        {template.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {template.tags.map(tag => (
              <Badge key={tag} variant="outline" className="text-xs">
                <Tag size={8} className="mr-1" />
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </CardHeader>
      
      <CardContent className="pt-0">
        <div className="flex items-center justify-between">
          <div className="text-xs text-gray-500">
            Created: {new Date(template.createdAt).toLocaleDateString()}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onTemplateApply?.(template)}
            >
              Apply
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onTemplateDelete?.(template.id)}
              className="text-red-600 hover:text-red-700"
            >
              <Trash2 size={14} />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  // Preset card component
  const PresetCard: React.FC<{ preset: FilterPreset }> = ({ preset }) => (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <Star size={16} className={preset.isDefault ? 'text-yellow-500 fill-current' : 'text-gray-400'} />
              <h3 className="font-medium">{preset.name}</h3>
              {preset.shortcutKey && (
                <Badge variant="outline" className="text-xs">
                  {preset.shortcutKey}
                </Badge>
              )}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Used {preset.usageCount} times
            </div>
          </div>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPresetApply?.(preset)}
            >
              Load
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onPresetDelete?.(preset.id)}
              className="text-red-600 hover:text-red-700"
            >
              <Trash2 size={14} />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="filter-templates space-y-4">
      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-3 text-gray-400" />
            <Input
              placeholder="Search templates and presets..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>
        
        <div className="flex gap-2">
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm"
          >
            {categories.map(cat => (
              <option key={cat} value={cat}>
                {cat === 'all' ? 'All Categories' : cat.charAt(0).toUpperCase() + cat.slice(1)}
              </option>
            ))}
          </select>
          
          <Button onClick={() => setShowSaveDialog(true)}>
            <Save size={16} className="mr-2" />
            Save Current
          </Button>
        </div>
      </div>

      <Tabs defaultValue="templates" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="templates">
            Templates ({filteredTemplates.length})
          </TabsTrigger>
          <TabsTrigger value="presets">
            My Presets ({filteredPresets.length})
          </TabsTrigger>
        </TabsList>

        {/* Templates Tab */}
        <TabsContent value="templates" className="space-y-4 mt-6">
          {filteredTemplates.length === 0 ? (
            <div className="text-center py-12">
              <Template size={48} className="mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Templates Found</h3>
              <p className="text-gray-500">
                {searchTerm ? 'Try adjusting your search terms' : 'Create your first template by saving a filter'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredTemplates.map(template => (
                <TemplateCard key={template.id} template={template} />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Presets Tab */}
        <TabsContent value="presets" className="space-y-4 mt-6">
          {filteredPresets.length === 0 ? (
            <div className="text-center py-12">
              <Star size={48} className="mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Presets Found</h3>
              <p className="text-gray-500">
                {searchTerm ? 'Try adjusting your search terms' : 'Save frequently used filters as presets for quick access'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredPresets.map(preset => (
                <PresetCard key={preset.id} preset={preset} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Save Template Dialog */}
      {showSaveDialog && (
        <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md">
              <h3 className="text-lg font-medium mb-4">Save Filter Template</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Name *
                  </label>
                  <Input
                    value={saveForm.name}
                    onChange={(e) => setSaveForm(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Enter template name"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <Input
                    value={saveForm.description}
                    onChange={(e) => setSaveForm(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Optional description"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Category
                  </label>
                  <select
                    value={saveForm.category}
                    onChange={(e) => setSaveForm(prev => ({ ...prev, category: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  >
                    <option value="general">General</option>
                    <option value="search">Search</option>
                    <option value="analytics">Analytics</option>
                    <option value="reports">Reports</option>
                    <option value="automation">Automation</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tags
                  </label>
                  <Input
                    value={saveForm.tags}
                    onChange={(e) => setSaveForm(prev => ({ ...prev, tags: e.target.value }))}
                    placeholder="Comma-separated tags"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Separate multiple tags with commas
                  </p>
                </div>
              </div>
              
              <div className="flex justify-end gap-3 mt-6">
                <Button
                  variant="outline"
                  onClick={() => setShowSaveDialog(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={!saveForm.name.trim()}
                >
                  Save Template
                </Button>
              </div>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
};

export default FilterTemplates;