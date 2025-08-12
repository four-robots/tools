import React, { useState, useCallback, useEffect } from 'react';
import { 
  X, 
  Play, 
  Star, 
  Users, 
  TrendingUp, 
  Clock, 
  Tag,
  Download,
  Share,
  Copy,
  Settings,
  Eye,
  ChevronLeft,
  ChevronRight,
  Maximize,
  ZoomIn,
  ZoomOut
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ScrollArea } from '@/components/ui/scroll-area';
import { WhiteboardTemplate } from '@/types/whiteboard';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

export interface TemplatePreviewProps {
  template: WhiteboardTemplate | null;
  isOpen: boolean;
  onClose: () => void;
  onApply?: (template: WhiteboardTemplate, options?: TemplateApplicationOptions) => void;
  onDuplicate?: (template: WhiteboardTemplate) => void;
  onShare?: (template: WhiteboardTemplate) => void;
  onExport?: (template: WhiteboardTemplate) => void;
  onEdit?: (template: WhiteboardTemplate) => void;
  relatedTemplates?: WhiteboardTemplate[];
  className?: string;
}

export interface TemplateApplicationOptions {
  customizations?: Record<string, any>;
  replaceCanvas?: boolean;
  preserveElements?: boolean;
}

export function TemplatePreview({
  template,
  isOpen,
  onClose,
  onApply,
  onDuplicate,
  onShare,
  onExport,
  onEdit,
  relatedTemplates = [],
  className = ''
}: TemplatePreviewProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'preview' | 'elements' | 'related'>('overview');
  const [imageError, setImageError] = useState(false);
  const [isImageExpanded, setIsImageExpanded] = useState(false);
  const [previewZoom, setPreviewZoom] = useState(1);
  const [applicationOptions, setApplicationOptions] = useState<TemplateApplicationOptions>({
    replaceCanvas: true,
    preserveElements: false,
  });

  // Reset state when template changes
  useEffect(() => {
    if (template) {
      setImageError(false);
      setIsImageExpanded(false);
      setPreviewZoom(1);
      setActiveTab('overview');
    }
  }, [template]);

  // Handle template application
  const handleApplyTemplate = useCallback(() => {
    if (template && onApply) {
      onApply(template, applicationOptions);
      onClose();
    }
  }, [template, onApply, onClose, applicationOptions]);

  // Handle template duplication
  const handleDuplicate = useCallback(() => {
    if (template && onDuplicate) {
      onDuplicate(template);
    }
  }, [template, onDuplicate]);

  // Handle template sharing
  const handleShare = useCallback(() => {
    if (template && onShare) {
      onShare(template);
    }
  }, [template, onShare]);

  // Handle template export
  const handleExport = useCallback(() => {
    if (template && onExport) {
      onExport(template);
    }
  }, [template, onExport]);

  // Handle template editing
  const handleEdit = useCallback(() => {
    if (template && onEdit) {
      onEdit(template);
    }
  }, [template, onEdit]);

  // Handle image error
  const handleImageError = useCallback(() => {
    setImageError(true);
  }, []);

  // Handle zoom controls
  const handleZoomIn = useCallback(() => {
    setPreviewZoom(prev => Math.min(prev + 0.25, 3));
  }, []);

  const handleZoomOut = useCallback(() => {
    setPreviewZoom(prev => Math.max(prev - 0.25, 0.5));
  }, []);

  const handleResetZoom = useCallback(() => {
    setPreviewZoom(1);
  }, []);

  if (!template) return null;

  // Render template stats
  const renderStats = () => (
    <div className="flex items-center gap-4 text-sm text-gray-600">
      {template.rating && (
        <div className="flex items-center gap-1">
          <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
          <span>{template.rating.toFixed(1)}</span>
        </div>
      )}
      
      <div className="flex items-center gap-1">
        <TrendingUp className="h-4 w-4" />
        <span>{template.usageCount || 0} uses</span>
      </div>

      <div className="flex items-center gap-1">
        <Clock className="h-4 w-4" />
        <span>
          {formatDistanceToNow(new Date(template.updatedAt), { addSuffix: true })}
        </span>
      </div>

      {template.isPublic && (
        <div className="flex items-center gap-1">
          <Users className="h-4 w-4" />
          <span>Public</span>
        </div>
      )}
    </div>
  );

  // Render template thumbnail/preview
  const renderPreview = () => {
    if (imageError || !template.thumbnail) {
      return (
        <div className="w-full h-64 bg-gradient-to-br from-gray-100 to-gray-200 rounded-lg flex items-center justify-center">
          <div className="text-center text-gray-500">
            <div className="text-4xl mb-2">📋</div>
            <div className="text-sm">No preview available</div>
          </div>
        </div>
      );
    }

    return (
      <div className="relative w-full h-64 rounded-lg overflow-hidden bg-gray-100">
        <img
          src={template.thumbnail}
          alt={template.name}
          className={cn(
            "w-full h-full object-contain transition-transform",
            `scale-${Math.round(previewZoom * 100)}`
          )}
          style={{ transform: `scale(${previewZoom})` }}
          onError={handleImageError}
        />
        
        {/* Zoom Controls */}
        <div className="absolute top-2 right-2 flex items-center gap-1 bg-black bg-opacity-50 rounded-lg p-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={handleZoomOut}
            disabled={previewZoom <= 0.5}
            className="h-6 w-6 p-0 text-white hover:bg-white hover:bg-opacity-20"
          >
            <ZoomOut className="h-3 w-3" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleResetZoom}
            className="h-6 w-6 p-0 text-white hover:bg-white hover:bg-opacity-20 text-xs"
          >
            {Math.round(previewZoom * 100)}%
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleZoomIn}
            disabled={previewZoom >= 3}
            className="h-6 w-6 p-0 text-white hover:bg-white hover:bg-opacity-20"
          >
            <ZoomIn className="h-3 w-3" />
          </Button>
        </div>

        {/* Full Screen Button */}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setIsImageExpanded(true)}
          className="absolute bottom-2 right-2 h-8 w-8 p-0 bg-black bg-opacity-50 text-white hover:bg-white hover:bg-opacity-20"
        >
          <Maximize className="h-4 w-4" />
        </Button>
      </div>
    );
  };

  // Render template elements list
  const renderElements = () => {
    const elements = template.templateData?.defaultElements || [];
    
    if (elements.length === 0) {
      return (
        <div className="text-center py-8 text-gray-500">
          <div className="text-2xl mb-2">📦</div>
          <div>No elements defined for this template</div>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {elements.map((element, index) => (
          <Card key={index} className="p-3">
            <div className="flex items-start gap-3">
              <Badge variant="outline" className="text-xs">
                {element.elementType}
              </Badge>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900">
                  Element {index + 1}
                </div>
                {element.elementData && (
                  <div className="text-xs text-gray-600 mt-1">
                    Position: ({element.elementData.position?.x || 0}, {element.elementData.position?.y || 0})
                    {element.elementData.size && (
                      <>
                        {' '}• Size: {element.elementData.size.width} × {element.elementData.size.height}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>
    );
  };

  // Render related templates
  const renderRelatedTemplates = () => {
    if (relatedTemplates.length === 0) {
      return (
        <div className="text-center py-8 text-gray-500">
          <div className="text-2xl mb-2">🔍</div>
          <div>No related templates found</div>
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {relatedTemplates.map((relatedTemplate) => (
          <Card
            key={relatedTemplate.id}
            className="cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => {/* Handle related template click */}}
          >
            <CardContent className="p-4">
              <div className="flex gap-3">
                <div className="w-16 h-12 bg-gray-100 rounded flex-shrink-0 flex items-center justify-center">
                  {relatedTemplate.thumbnail ? (
                    <img
                      src={relatedTemplate.thumbnail}
                      alt={relatedTemplate.name}
                      className="w-full h-full object-cover rounded"
                    />
                  ) : (
                    <div className="text-gray-400 text-xs">📋</div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-sm text-gray-900 truncate">
                    {relatedTemplate.name}
                  </h4>
                  <p className="text-xs text-gray-600 line-clamp-2 mt-1">
                    {relatedTemplate.description}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge variant="secondary" className="text-xs">
                      {relatedTemplate.category}
                    </Badge>
                    {relatedTemplate.rating && (
                      <div className="flex items-center gap-1 text-xs text-gray-500">
                        <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                        <span>{relatedTemplate.rating.toFixed(1)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  };

  // Render application options
  const renderApplicationOptions = () => (
    <Card className="mt-4 p-4">
      <h4 className="font-medium text-sm text-gray-900 mb-3 flex items-center gap-2">
        <Settings className="h-4 w-4" />
        Application Options
      </h4>
      <div className="space-y-3">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="radio"
            name="canvasMode"
            checked={applicationOptions.replaceCanvas}
            onChange={(e) => setApplicationOptions(prev => ({
              ...prev,
              replaceCanvas: e.target.checked,
              preserveElements: !e.target.checked
            }))}
            className="rounded border-gray-300"
          />
          <div className="text-sm">
            <div className="font-medium">Replace entire canvas</div>
            <div className="text-gray-600 text-xs">Clear current content and apply template</div>
          </div>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="radio"
            name="canvasMode"
            checked={applicationOptions.preserveElements}
            onChange={(e) => setApplicationOptions(prev => ({
              ...prev,
              preserveElements: e.target.checked,
              replaceCanvas: !e.target.checked
            }))}
            className="rounded border-gray-300"
          />
          <div className="text-sm">
            <div className="font-medium">Add to existing canvas</div>
            <div className="text-gray-600 text-xs">Keep current elements and add template</div>
          </div>
        </label>
      </div>
    </Card>
  );

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className={cn("template-preview-modal max-w-4xl w-full max-h-[90vh]", className)}>
          <DialogHeader className="pb-4">
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0 mr-4">
                <DialogTitle className="text-xl font-semibold text-gray-900 line-clamp-2">
                  {template.name}
                </DialogTitle>
                {template.description && (
                  <p className="text-gray-600 mt-1 line-clamp-2">
                    {template.description}
                  </p>
                )}
                <div className="mt-3">
                  {renderStats()}
                </div>
              </div>
              
              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                {onEdit && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button size="sm" variant="outline" onClick={handleEdit}>
                          <Settings className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Edit Template</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
                
                {onDuplicate && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button size="sm" variant="outline" onClick={handleDuplicate}>
                          <Copy className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Duplicate Template</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
                
                {onShare && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button size="sm" variant="outline" onClick={handleShare}>
                          <Share className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Share Template</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
                
                {onExport && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button size="sm" variant="outline" onClick={handleExport}>
                          <Download className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Export Template</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
            </div>

            {/* Template Tags */}
            {template.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-3">
                {template.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-xs">
                    <Tag className="h-3 w-3 mr-1" />
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
          </DialogHeader>

          {/* Template Content Tabs */}
          <div className="flex-1 min-h-0">
            <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as any)} className="h-full flex flex-col">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="preview">Preview</TabsTrigger>
                <TabsTrigger value="elements">
                  Elements ({template.templateData?.defaultElements?.length || 0})
                </TabsTrigger>
                <TabsTrigger value="related">
                  Related ({relatedTemplates.length})
                </TabsTrigger>
              </TabsList>

              <div className="flex-1 min-h-0 mt-4">
                <TabsContent value="overview" className="mt-0 h-full">
                  <ScrollArea className="h-full pr-4">
                    <div className="space-y-6">
                      {/* Template Preview */}
                      <div>
                        <h3 className="font-medium text-gray-900 mb-3">Template Preview</h3>
                        {renderPreview()}
                      </div>

                      {/* Template Details */}
                      <div>
                        <h3 className="font-medium text-gray-900 mb-3">Details</h3>
                        <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <span className="text-gray-600">Category:</span>
                              <Badge variant="outline" className="ml-2">
                                {template.category}
                              </Badge>
                            </div>
                            <div>
                              <span className="text-gray-600">Visibility:</span>
                              <span className="ml-2 font-medium">
                                {template.isPublic ? 'Public' : 'Private'}
                              </span>
                            </div>
                            <div>
                              <span className="text-gray-600">Created:</span>
                              <span className="ml-2">
                                {new Date(template.createdAt).toLocaleDateString()}
                              </span>
                            </div>
                            <div>
                              <span className="text-gray-600">Updated:</span>
                              <span className="ml-2">
                                {new Date(template.updatedAt).toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Application Options */}
                      {onApply && renderApplicationOptions()}
                    </div>
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="preview" className="mt-0 h-full">
                  <ScrollArea className="h-full">
                    <div className="flex items-center justify-center h-full min-h-[400px]">
                      {renderPreview()}
                    </div>
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="elements" className="mt-0 h-full">
                  <ScrollArea className="h-full pr-4">
                    {renderElements()}
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="related" className="mt-0 h-full">
                  <ScrollArea className="h-full pr-4">
                    {renderRelatedTemplates()}
                  </ScrollArea>
                </TabsContent>
              </div>
            </Tabs>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-between pt-4 border-t">
            <div className="text-sm text-gray-500">
              Template ID: {template.id}
            </div>
            
            <div className="flex items-center gap-3">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              {onApply && (
                <Button onClick={handleApplyTemplate} className="flex items-center gap-2">
                  <Play className="h-4 w-4" />
                  Use This Template
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Expanded Image Modal */}
      {isImageExpanded && template.thumbnail && (
        <Dialog open={isImageExpanded} onOpenChange={setIsImageExpanded}>
          <DialogContent className="max-w-6xl w-full max-h-[95vh] p-2">
            <div className="relative w-full h-full">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setIsImageExpanded(false)}
                className="absolute top-2 right-2 z-10 bg-black bg-opacity-50 text-white hover:bg-white hover:bg-opacity-20"
              >
                <X className="h-4 w-4" />
              </Button>
              <img
                src={template.thumbnail}
                alt={template.name}
                className="w-full h-full object-contain"
                style={{ maxHeight: 'calc(95vh - 4rem)' }}
              />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}