import React, { useState, useCallback } from 'react';
import { 
  Star, 
  Users, 
  TrendingUp, 
  Clock, 
  MoreHorizontal, 
  Edit, 
  Copy, 
  Trash2,
  Download,
  Share,
  Eye,
  Heart
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from '@/components/ui/dropdown-menu';
import { WhiteboardTemplate } from '@/types/whiteboard';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

export interface TemplateCardProps {
  template: WhiteboardTemplate;
  viewMode?: 'grid' | 'list';
  isFavorite?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  onSelect?: () => void;
  onEdit?: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
  onShare?: () => void;
  onExport?: () => void;
  onToggleFavorite?: (isFavorite: boolean) => void;
  className?: string;
}

export function TemplateCard({
  template,
  viewMode = 'grid',
  isFavorite = false,
  canEdit = false,
  canDelete = false,
  onSelect,
  onEdit,
  onDuplicate,
  onDelete,
  onShare,
  onExport,
  onToggleFavorite,
  className = ''
}: TemplateCardProps) {
  const [imageError, setImageError] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  // Handle thumbnail image error
  const handleImageError = useCallback(() => {
    setImageError(true);
  }, []);

  // Handle favorite toggle
  const handleFavoriteToggle = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onToggleFavorite?.(!isFavorite);
  }, [isFavorite, onToggleFavorite]);

  // Handle actions menu clicks
  const handleActionClick = useCallback((e: React.MouseEvent, action: () => void) => {
    e.preventDefault();
    e.stopPropagation();
    action();
  }, []);

  // Render star rating
  const renderRating = () => {
    if (!template.rating) return null;
    
    const stars = [];
    const rating = Math.round(template.rating * 2) / 2; // Round to nearest 0.5
    
    for (let i = 1; i <= 5; i++) {
      if (i <= rating) {
        stars.push(<Star key={i} className="h-3 w-3 fill-yellow-400 text-yellow-400" />);
      } else if (i - 0.5 <= rating) {
        stars.push(
          <div key={i} className="relative h-3 w-3">
            <Star className="absolute inset-0 h-3 w-3 text-gray-300" />
            <div className="absolute inset-0 w-1/2 overflow-hidden">
              <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
            </div>
          </div>
        );
      } else {
        stars.push(<Star key={i} className="h-3 w-3 text-gray-300" />);
      }
    }
    
    return (
      <div className="flex items-center gap-1">
        {stars}
        <span className="text-xs text-gray-600 ml-1">
          {template.rating.toFixed(1)}
        </span>
      </div>
    );
  };

  // Render template thumbnail
  const renderThumbnail = () => {
    if (imageError || !template.thumbnail) {
      return (
        <div className="w-full h-32 bg-gradient-to-br from-gray-100 to-gray-200 rounded-lg flex items-center justify-center">
          <div className="text-center text-gray-500">
            <div className="text-2xl mb-1">📋</div>
            <div className="text-xs">{template.category}</div>
          </div>
        </div>
      );
    }

    return (
      <div className="relative w-full h-32 rounded-lg overflow-hidden bg-gray-100">
        <img
          src={template.thumbnail}
          alt={template.name}
          className="w-full h-full object-cover"
          onError={handleImageError}
          loading="lazy"
        />
        {isHovered && (
          <div className="absolute inset-0 bg-black bg-opacity-20 flex items-center justify-center">
            <Button size="sm" className="bg-white text-gray-900 hover:bg-gray-100">
              <Eye className="h-4 w-4 mr-1" />
              Preview
            </Button>
          </div>
        )}
      </div>
    );
  };

  // Render template info
  const renderInfo = () => (
    <div className="space-y-3">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 truncate">{template.name}</h3>
          {template.description && (
            <p className="text-sm text-gray-600 line-clamp-2 mt-1">
              {template.description}
            </p>
          )}
        </div>
        
        <div className="flex items-center gap-1 ml-2">
          {onToggleFavorite && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleFavoriteToggle}
                    className={cn(
                      "h-8 w-8 p-0",
                      isFavorite ? "text-red-500 hover:text-red-600" : "text-gray-400 hover:text-red-500"
                    )}
                  >
                    <Heart className={cn("h-4 w-4", isFavorite && "fill-current")} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onEdit && canEdit && (
                <DropdownMenuItem onClick={(e) => handleActionClick(e, onEdit)}>
                  <Edit className="h-4 w-4 mr-2" />
                  Edit Template
                </DropdownMenuItem>
              )}
              {onDuplicate && (
                <DropdownMenuItem onClick={(e) => handleActionClick(e, onDuplicate)}>
                  <Copy className="h-4 w-4 mr-2" />
                  Duplicate
                </DropdownMenuItem>
              )}
              {onShare && (
                <DropdownMenuItem onClick={(e) => handleActionClick(e, onShare)}>
                  <Share className="h-4 w-4 mr-2" />
                  Share
                </DropdownMenuItem>
              )}
              {onExport && (
                <DropdownMenuItem onClick={(e) => handleActionClick(e, onExport)}>
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </DropdownMenuItem>
              )}
              {onDelete && canDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    onClick={(e) => handleActionClick(e, onDelete)}
                    className="text-red-600 focus:text-red-600"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Template Tags */}
      {template.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {template.tags.slice(0, 3).map((tag) => (
            <Badge key={tag} variant="secondary" className="text-xs">
              {tag}
            </Badge>
          ))}
          {template.tags.length > 3 && (
            <Badge variant="outline" className="text-xs">
              +{template.tags.length - 3}
            </Badge>
          )}
        </div>
      )}

      {/* Template Stats */}
      <div className="flex items-center justify-between text-xs text-gray-500">
        <div className="flex items-center gap-4">
          {/* Rating */}
          {renderRating()}
          
          {/* Usage Count */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1">
                  <TrendingUp className="h-3 w-3" />
                  <span>{template.usageCount || 0}</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>Used {template.usageCount || 0} times</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Visibility */}
          {template.isPublic ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    <span>Public</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>Public template</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <Badge variant="outline" className="text-xs">
              Private
            </Badge>
          )}
        </div>

        {/* Last Updated */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                <span>
                  {formatDistanceToNow(new Date(template.updatedAt), { addSuffix: true })}
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              Last updated {new Date(template.updatedAt).toLocaleDateString()}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Category Badge */}
      <div className="flex items-center justify-between">
        <Badge variant="outline" className="text-xs">
          {template.category}
        </Badge>
        
        {/* Creator Info - Only show for public templates */}
        {template.isPublic && (
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <Avatar className="h-4 w-4">
              <AvatarImage src={`/api/users/${template.createdBy}/avatar`} />
              <AvatarFallback className="text-xs">
                {template.createdBy.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span>by User</span>
          </div>
        )}
      </div>
    </div>
  );

  // Grid view (default card layout)
  if (viewMode === 'grid') {
    return (
      <Card
        className={cn(
          "template-card cursor-pointer hover:shadow-lg transition-all duration-200",
          isHovered && "shadow-md scale-[1.02]",
          className
        )}
        onClick={onSelect}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <CardHeader className="pb-2">
          {renderThumbnail()}
        </CardHeader>
        <CardContent>
          {renderInfo()}
        </CardContent>
      </Card>
    );
  }

  // List view (horizontal layout)
  return (
    <Card
      className={cn(
        "template-card cursor-pointer hover:shadow-md transition-all duration-200",
        className
      )}
      onClick={onSelect}
    >
      <CardContent className="p-4">
        <div className="flex gap-4">
          {/* Thumbnail */}
          <div className="flex-shrink-0 w-24">
            <div className="w-24 h-16 rounded-lg overflow-hidden bg-gray-100">
              {!imageError && template.thumbnail ? (
                <img
                  src={template.thumbnail}
                  alt={template.name}
                  className="w-full h-full object-cover"
                  onError={handleImageError}
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
                  <div className="text-center text-gray-500">
                    <div className="text-sm">📋</div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0 mr-4">
                <h3 className="font-semibold text-gray-900 truncate">{template.name}</h3>
                {template.description && (
                  <p className="text-sm text-gray-600 line-clamp-1 mt-1">
                    {template.description}
                  </p>
                )}
                
                {/* Tags for list view */}
                {template.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {template.tags.slice(0, 2).map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                    {template.tags.length > 2 && (
                      <Badge variant="outline" className="text-xs">
                        +{template.tags.length - 2}
                      </Badge>
                    )}
                  </div>
                )}
              </div>

              {/* Actions and stats */}
              <div className="flex items-center gap-2">
                <div className="text-right text-xs text-gray-500">
                  <div className="flex items-center gap-3 mb-1">
                    {renderRating()}
                    <div className="flex items-center gap-1">
                      <TrendingUp className="h-3 w-3" />
                      <span>{template.usageCount || 0}</span>
                    </div>
                  </div>
                  <div>
                    {formatDistanceToNow(new Date(template.updatedAt), { addSuffix: true })}
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-1">
                  {onToggleFavorite && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={handleFavoriteToggle}
                      className={cn(
                        "h-8 w-8 p-0",
                        isFavorite ? "text-red-500 hover:text-red-600" : "text-gray-400 hover:text-red-500"
                      )}
                    >
                      <Heart className={cn("h-4 w-4", isFavorite && "fill-current")} />
                    </Button>
                  )}
                  
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {onEdit && canEdit && (
                        <DropdownMenuItem onClick={(e) => handleActionClick(e, onEdit)}>
                          <Edit className="h-4 w-4 mr-2" />
                          Edit Template
                        </DropdownMenuItem>
                      )}
                      {onDuplicate && (
                        <DropdownMenuItem onClick={(e) => handleActionClick(e, onDuplicate)}>
                          <Copy className="h-4 w-4 mr-2" />
                          Duplicate
                        </DropdownMenuItem>
                      )}
                      {onShare && (
                        <DropdownMenuItem onClick={(e) => handleActionClick(e, onShare)}>
                          <Share className="h-4 w-4 mr-2" />
                          Share
                        </DropdownMenuItem>
                      )}
                      {onExport && (
                        <DropdownMenuItem onClick={(e) => handleActionClick(e, onExport)}>
                          <Download className="h-4 w-4 mr-2" />
                          Export
                        </DropdownMenuItem>
                      )}
                      {onDelete && canDelete && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            onClick={(e) => handleActionClick(e, onDelete)}
                            className="text-red-600 focus:text-red-600"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}