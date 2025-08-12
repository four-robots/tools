import React, { useState, useCallback, useEffect } from 'react';
import { 
  X, 
  Save, 
  Camera, 
  Tag, 
  Globe, 
  Lock, 
  Users,
  AlertCircle,
  Check,
  Upload,
  Loader2
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { WhiteboardTemplate, WhiteboardElement, Whiteboard } from '@/types/whiteboard';
import { useTemplates } from './hooks/useTemplates';
import { cn } from '@/lib/utils';

interface TemplateCreatorProps {
  isOpen: boolean;
  onClose: () => void;
  whiteboard?: Whiteboard;
  elements?: WhiteboardElement[];
  workspaceId?: string;
  onTemplateCreated?: (template: WhiteboardTemplate) => void;
  className?: string;
}

interface TemplateFormData {
  name: string;
  description: string;
  category: string;
  tags: string[];
  isPublic: boolean;
  includeElements: boolean;
  includeSettings: boolean;
  customThumbnail?: string;
}

const TEMPLATE_CATEGORIES = [
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

const COMMON_TAGS = [
  'collaboration',
  'planning',
  'design',
  'analysis',
  'meeting',
  'project',
  'creative',
  'strategy',
  'workflow',
  'documentation'
];

export function TemplateCreator({
  isOpen,
  onClose,
  whiteboard,
  elements = [],
  workspaceId,
  onTemplateCreated,
  className = ''
}: TemplateCreatorProps) {
  // State
  const [activeTab, setActiveTab] = useState<'details' | 'content' | 'preview'>('details');
  const [formData, setFormData] = useState<TemplateFormData>({
    name: '',
    description: '',
    category: 'Custom',
    tags: [],
    isPublic: false,
    includeElements: true,
    includeSettings: false,
  });
  const [tagInput, setTagInput] = useState('');
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [isCreating, setIsCreating] = useState(false);
  const [thumbnailProgress, setThumbnailProgress] = useState(0);
  const [thumbnailError, setThumbnailError] = useState<string | null>(null);
  
  // Hooks
  const { createTemplate } = useTemplates(workspaceId);

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (isOpen) {
      setFormData({
        name: whiteboard ? `${whiteboard.name} Template` : '',
        description: whiteboard?.description ? `Template based on: ${whiteboard.description}` : '',
        category: 'Custom',
        tags: [],
        isPublic: false,
        includeElements: true,
        includeSettings: false,
      });
      setTagInput('');
      setValidationErrors({});
      setIsCreating(false);
      setThumbnailProgress(0);
      setThumbnailError(null);
      setActiveTab('details');
    }
  }, [isOpen, whiteboard]);

  // Form validation
  const validateForm = useCallback((): boolean => {
    const errors: Record<string, string> = {};

    if (!formData.name.trim()) {
      errors.name = 'Template name is required';
    } else if (formData.name.length < 3) {
      errors.name = 'Template name must be at least 3 characters';
    } else if (formData.name.length > 255) {
      errors.name = 'Template name must be less than 255 characters';
    }

    if (formData.description && formData.description.length > 1000) {
      errors.description = 'Description must be less than 1000 characters';
    }

    if (formData.tags.length > 10) {
      errors.tags = 'Maximum 10 tags allowed';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  }, [formData]);

  // Handle form field changes
  const updateFormData = useCallback((updates: Partial<TemplateFormData>) => {
    setFormData(prev => ({ ...prev, ...updates }));
  }, []);

  // Handle tag input
  const handleTagInput = useCallback((value: string) => {
    setTagInput(value);
  }, []);

  // Add tag
  const addTag = useCallback((tag: string) => {
    const trimmedTag = tag.trim().toLowerCase();
    if (trimmedTag && !formData.tags.includes(trimmedTag) && formData.tags.length < 10) {
      updateFormData({ tags: [...formData.tags, trimmedTag] });
    }
    setTagInput('');
  }, [formData.tags, updateFormData]);

  // Remove tag
  const removeTag = useCallback((tag: string) => {
    updateFormData({ tags: formData.tags.filter(t => t !== tag) });
  }, [formData.tags, updateFormData]);

  // Handle tag input key press
  const handleTagKeyPress = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && tagInput.trim()) {
      e.preventDefault();
      addTag(tagInput);
    } else if (e.key === 'Escape') {
      setTagInput('');
    }
  }, [tagInput, addTag]);

  // Generate thumbnail from whiteboard
  const generateThumbnail = useCallback(async (): Promise<string | null> => {
    if (!whiteboard) return null;

    try {
      setThumbnailProgress(10);
      setThumbnailError(null);

      // Simulate thumbnail generation progress
      const progressInterval = setInterval(() => {
        setThumbnailProgress(prev => Math.min(prev + 10, 90));
      }, 200);

      // In a real implementation, this would call the thumbnail service
      // For now, we'll simulate with a timeout
      await new Promise(resolve => setTimeout(resolve, 2000));

      clearInterval(progressInterval);
      setThumbnailProgress(100);

      // Return a placeholder thumbnail data URL
      const canvas = document.createElement('canvas');
      canvas.width = 400;
      canvas.height = 300;
      const ctx = canvas.getContext('2d');
      
      if (ctx) {
        // Draw a simple gradient background
        const gradient = ctx.createLinearGradient(0, 0, 400, 300);
        gradient.addColorStop(0, '#f3f4f6');
        gradient.addColorStop(1, '#e5e7eb');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 400, 300);

        // Draw some placeholder elements
        ctx.fillStyle = '#3b82f6';
        ctx.fillRect(50, 50, 100, 60);
        ctx.fillRect(200, 100, 120, 80);
        ctx.fillRect(100, 180, 80, 50);

        // Add text
        ctx.fillStyle = '#374151';
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Template Preview', 200, 250);
      }

      return canvas.toDataURL('image/png', 0.8);
    } catch (error) {
      console.error('Failed to generate thumbnail:', error);
      setThumbnailError('Failed to generate thumbnail');
      return null;
    } finally {
      setThumbnailProgress(0);
    }
  }, [whiteboard]);

  // Handle thumbnail upload
  const handleThumbnailUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setThumbnailError('Please upload an image file');
      return;
    }

    if (file.size > 5 * 1024 * 1024) { // 5MB limit
      setThumbnailError('Image must be smaller than 5MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      updateFormData({ customThumbnail: result });
      setThumbnailError(null);
    };
    reader.onerror = () => {
      setThumbnailError('Failed to read image file');
    };
    reader.readAsDataURL(file);
  }, [updateFormData]);

  // Create template
  const handleCreateTemplate = useCallback(async () => {
    if (!validateForm()) {
      setActiveTab('details'); // Go back to details tab if validation fails
      return;
    }

    try {
      setIsCreating(true);

      // Generate thumbnail if not provided
      let thumbnail = formData.customThumbnail;
      if (!thumbnail) {
        thumbnail = await generateThumbnail();
      }

      // Prepare template data
      const templateData = {
        canvasData: formData.includeSettings ? (whiteboard?.canvasData || {}) : {},
        defaultElements: formData.includeElements 
          ? elements.map(element => ({
              elementType: element.elementType,
              elementData: element.elementData,
              styleData: element.styleData,
              layerIndex: element.layerIndex,
            }))
          : [],
        defaultSettings: formData.includeSettings ? (whiteboard?.settings || {}) : {},
        placeholders: [], // TODO: Allow users to define placeholders
      };

      // Create the template
      const template = await createTemplate({
        name: formData.name.trim(),
        description: formData.description?.trim() || undefined,
        category: formData.category,
        templateData,
        tags: formData.tags,
        isPublic: formData.isPublic,
        thumbnail,
      });

      // Notify parent component
      onTemplateCreated?.(template);
      
      // Close dialog
      onClose();

    } catch (error) {
      console.error('Failed to create template:', error);
      setValidationErrors({ 
        general: error instanceof Error ? error.message : 'Failed to create template' 
      });
    } finally {
      setIsCreating(false);
    }
  }, [
    validateForm,
    formData,
    whiteboard,
    elements,
    generateThumbnail,
    createTemplate,
    onTemplateCreated,
    onClose
  ]);

  if (!whiteboard) {
    return null;
  }

  // Render template details form
  const renderDetailsForm = () => (
    <div className="space-y-6">
      {/* Basic Information */}
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="template-name">Template Name *</Label>
          <Input
            id="template-name"
            value={formData.name}
            onChange={(e) => updateFormData({ name: e.target.value })}
            placeholder="Enter template name..."
            className={validationErrors.name ? 'border-red-500' : ''}
          />
          {validationErrors.name && (
            <p className="text-sm text-red-500">{validationErrors.name}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="template-description">Description</Label>
          <Textarea
            id="template-description"
            value={formData.description}
            onChange={(e) => updateFormData({ description: e.target.value })}
            placeholder="Describe what this template is for..."
            rows={3}
            className={validationErrors.description ? 'border-red-500' : ''}
          />
          {validationErrors.description && (
            <p className="text-sm text-red-500">{validationErrors.description}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="template-category">Category</Label>
          <Select value={formData.category} onValueChange={(value) => updateFormData({ category: value })}>
            <SelectTrigger>
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
        </div>
      </div>

      {/* Tags */}
      <div className="space-y-3">
        <Label>Tags</Label>
        <div className="space-y-2">
          <Input
            value={tagInput}
            onChange={(e) => handleTagInput(e.target.value)}
            onKeyDown={handleTagKeyPress}
            placeholder="Add tags to help others find your template..."
            disabled={formData.tags.length >= 10}
          />
          
          {/* Suggested Tags */}
          <div className="flex flex-wrap gap-1">
            {COMMON_TAGS
              .filter(tag => !formData.tags.includes(tag) && tag.toLowerCase().includes(tagInput.toLowerCase()))
              .slice(0, 6)
              .map((tag) => (
                <Button
                  key={tag}
                  size="sm"
                  variant="outline"
                  onClick={() => addTag(tag)}
                  className="text-xs h-6"
                >
                  {tag}
                </Button>
              ))}
          </div>

          {/* Selected Tags */}
          {formData.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {formData.tags.map((tag) => (
                <Badge key={tag} variant="default" className="flex items-center gap-1">
                  <Tag className="h-3 w-3" />
                  {tag}
                  <button
                    onClick={() => removeTag(tag)}
                    className="hover:bg-black hover:bg-opacity-20 rounded-full p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
          
          {validationErrors.tags && (
            <p className="text-sm text-red-500">{validationErrors.tags}</p>
          )}
        </div>
      </div>

      {/* Visibility */}
      <div className="space-y-3">
        <Label>Visibility</Label>
        <div className="space-y-2">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="radio"
              name="visibility"
              checked={!formData.isPublic}
              onChange={() => updateFormData({ isPublic: false })}
              className="rounded border-gray-300"
            />
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-gray-500" />
              <div>
                <div className="font-medium">Private</div>
                <div className="text-sm text-gray-600">Only you and your workspace can use this template</div>
              </div>
            </div>
          </label>
          
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="radio"
              name="visibility"
              checked={formData.isPublic}
              onChange={() => updateFormData({ isPublic: true })}
              className="rounded border-gray-300"
            />
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-gray-500" />
              <div>
                <div className="font-medium">Public</div>
                <div className="text-sm text-gray-600">Anyone can discover and use this template</div>
              </div>
            </div>
          </label>
        </div>
      </div>
    </div>
  );

  // Render content options
  const renderContentOptions = () => (
    <div className="space-y-6">
      <div className="space-y-4">
        <h3 className="font-medium text-gray-900">What to include in the template?</h3>
        
        <div className="space-y-3">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.includeElements}
              onChange={(e) => updateFormData({ includeElements: e.target.checked })}
              className="mt-1"
            />
            <div>
              <div className="font-medium">Whiteboard Elements ({elements.length})</div>
              <div className="text-sm text-gray-600">
                Include all shapes, text, images, and other elements from the current whiteboard
              </div>
            </div>
          </label>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.includeSettings}
              onChange={(e) => updateFormData({ includeSettings: e.target.checked })}
              className="mt-1"
            />
            <div>
              <div className="font-medium">Canvas Settings</div>
              <div className="text-sm text-gray-600">
                Include canvas background, grid settings, and other configuration
              </div>
            </div>
          </label>
        </div>
      </div>

      {/* Element Summary */}
      {formData.includeElements && elements.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Elements to Include</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Object.entries(
                elements.reduce((acc, element) => {
                  acc[element.elementType] = (acc[element.elementType] || 0) + 1;
                  return acc;
                }, {} as Record<string, number>)
              ).map(([type, count]) => (
                <div key={type} className="flex items-center justify-between text-sm">
                  <span className="capitalize">{type.replace('_', ' ')}</span>
                  <Badge variant="secondary">{count}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );

  // Render preview
  const renderPreview = () => (
    <div className="space-y-6">
      {/* Thumbnail Section */}
      <div className="space-y-4">
        <h3 className="font-medium text-gray-900 flex items-center gap-2">
          <Camera className="h-4 w-4" />
          Template Thumbnail
        </h3>
        
        <div className="space-y-3">
          {formData.customThumbnail ? (
            <div className="relative">
              <img
                src={formData.customThumbnail}
                alt="Template thumbnail"
                className="w-full h-48 object-cover rounded-lg border"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => updateFormData({ customThumbnail: undefined })}
                className="absolute top-2 right-2"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="w-full h-48 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center">
              <div className="text-center">
                <Camera className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                <div className="text-sm text-gray-600">No custom thumbnail</div>
                <div className="text-xs text-gray-500">One will be generated automatically</div>
              </div>
            </div>
          )}

          {thumbnailProgress > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Generating thumbnail...</span>
                <span>{thumbnailProgress}%</span>
              </div>
              <Progress value={thumbnailProgress} />
            </div>
          )}

          {thumbnailError && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{thumbnailError}</AlertDescription>
            </Alert>
          )}

          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={generateThumbnail}
              disabled={!whiteboard || thumbnailProgress > 0}
            >
              {thumbnailProgress > 0 ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Camera className="h-4 w-4 mr-2" />
              )}
              Generate from Canvas
            </Button>
            
            <div className="relative">
              <input
                type="file"
                accept="image/*"
                onChange={handleThumbnailUpload}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <Button size="sm" variant="outline">
                <Upload className="h-4 w-4 mr-2" />
                Upload Image
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Template Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{formData.name || 'Untitled Template'}</CardTitle>
          <CardDescription>
            {formData.description || 'No description provided'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4 text-sm text-gray-600">
            <div className="flex items-center gap-1">
              <Badge variant="outline">{formData.category}</Badge>
            </div>
            <div className="flex items-center gap-1">
              {formData.isPublic ? (
                <>
                  <Globe className="h-4 w-4" />
                  Public
                </>
              ) : (
                <>
                  <Lock className="h-4 w-4" />
                  Private
                </>
              )}
            </div>
          </div>

          {formData.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {formData.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          )}

          <div className="pt-2 border-t space-y-2 text-sm">
            <div className="flex justify-between">
              <span>Elements:</span>
              <span>{formData.includeElements ? elements.length : 0}</span>
            </div>
            <div className="flex justify-between">
              <span>Settings:</span>
              <span>{formData.includeSettings ? 'Included' : 'Not included'}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className={cn("template-creator max-w-4xl w-full max-h-[90vh]", className)}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Save className="h-5 w-5" />
            Create Template
          </DialogTitle>
          <p className="text-sm text-gray-600">
            Save your whiteboard as a reusable template
          </p>
        </DialogHeader>

        {/* General Error */}
        {validationErrors.general && (
          <Alert className="border-red-200 bg-red-50">
            <AlertCircle className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-red-600">
              {validationErrors.general}
            </AlertDescription>
          </Alert>
        )}

        {/* Tab Navigation */}
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as any)} className="flex-1">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="details" className="flex items-center gap-2">
              <div className={cn(
                "w-2 h-2 rounded-full",
                activeTab === 'details' ? 'bg-blue-500' : 'bg-gray-300'
              )} />
              Details
            </TabsTrigger>
            <TabsTrigger value="content" className="flex items-center gap-2">
              <div className={cn(
                "w-2 h-2 rounded-full",
                activeTab === 'content' ? 'bg-blue-500' : 'bg-gray-300'
              )} />
              Content
            </TabsTrigger>
            <TabsTrigger value="preview" className="flex items-center gap-2">
              <div className={cn(
                "w-2 h-2 rounded-full",
                activeTab === 'preview' ? 'bg-blue-500' : 'bg-gray-300'
              )} />
              Preview
            </TabsTrigger>
          </TabsList>

          <div className="mt-6 flex-1 min-h-0">
            <TabsContent value="details" className="mt-0 space-y-0">
              <div className="max-h-[60vh] overflow-y-auto pr-4">
                {renderDetailsForm()}
              </div>
            </TabsContent>

            <TabsContent value="content" className="mt-0 space-y-0">
              <div className="max-h-[60vh] overflow-y-auto pr-4">
                {renderContentOptions()}
              </div>
            </TabsContent>

            <TabsContent value="preview" className="mt-0 space-y-0">
              <div className="max-h-[60vh] overflow-y-auto pr-4">
                {renderPreview()}
              </div>
            </TabsContent>
          </div>
        </Tabs>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-4 border-t">
          <div className="text-sm text-gray-500">
            {elements.length} elements • {formData.tags.length} tags
          </div>
          
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={onClose} disabled={isCreating}>
              Cancel
            </Button>
            <Button 
              onClick={handleCreateTemplate} 
              disabled={isCreating || !formData.name.trim()}
              className="flex items-center gap-2"
            >
              {isCreating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" />
                  Create Template
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}