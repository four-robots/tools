import React, { useState, useCallback } from 'react';
import { X, Star, Tag } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

export interface TemplateFiltersProps {
  selectedTags: string[];
  onTagsChange: (tags: string[]) => void;
  minRating: number;
  onMinRatingChange: (rating: number) => void;
  minUsage?: number;
  onMinUsageChange?: (usage: number) => void;
  createdAfter?: Date;
  onCreatedAfterChange?: (date: Date | undefined) => void;
  createdBefore?: Date;
  onCreatedBeforeChange?: (date: Date | undefined) => void;
  workspaceOnly?: boolean;
  onWorkspaceOnlyChange?: (workspaceOnly: boolean) => void;
  publicOnly?: boolean;
  onPublicOnlyChange?: (publicOnly: boolean) => void;
  onClear: () => void;
  className?: string;
}

// Common template tags for suggestions
const COMMON_TAGS = [
  'productivity',
  'collaboration',
  'planning',
  'design',
  'analysis',
  'meeting',
  'project',
  'research',
  'creative',
  'strategy',
  'workflow',
  'documentation',
  'presentation',
  'brainstorming',
  'retrospective',
  'agile',
  'scrum',
  'kanban',
  'wireframe',
  'user-journey',
  'mind-map',
  'flowchart',
  'diagram',
  'prototype',
  'feedback'
];

export function TemplateFilters({
  selectedTags,
  onTagsChange,
  minRating,
  onMinRatingChange,
  minUsage = 0,
  onMinUsageChange,
  createdAfter,
  onCreatedAfterChange,
  createdBefore,
  onCreatedBeforeChange,
  workspaceOnly = false,
  onWorkspaceOnlyChange,
  publicOnly = false,
  onPublicOnlyChange,
  onClear,
  className = ''
}: TemplateFiltersProps) {
  const [tagInput, setTagInput] = useState('');
  const [suggestedTags, setSuggestedTags] = useState<string[]>([]);

  // Handle tag input change with suggestions
  const handleTagInputChange = useCallback((value: string) => {
    setTagInput(value);
    
    if (value.trim()) {
      const filtered = COMMON_TAGS
        .filter(tag => 
          tag.toLowerCase().includes(value.toLowerCase()) &&
          !selectedTags.includes(tag)
        )
        .slice(0, 8);
      setSuggestedTags(filtered);
    } else {
      setSuggestedTags([]);
    }
  }, [selectedTags]);

  // Handle tag addition
  const handleAddTag = useCallback((tag: string) => {
    const trimmedTag = tag.trim().toLowerCase();
    if (trimmedTag && !selectedTags.includes(trimmedTag)) {
      onTagsChange([...selectedTags, trimmedTag]);
    }
    setTagInput('');
    setSuggestedTags([]);
  }, [selectedTags, onTagsChange]);

  // Handle tag removal
  const handleRemoveTag = useCallback((tag: string) => {
    onTagsChange(selectedTags.filter(t => t !== tag));
  }, [selectedTags, onTagsChange]);

  // Handle tag input key press
  const handleTagInputKeyPress = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && tagInput.trim()) {
      e.preventDefault();
      handleAddTag(tagInput);
    } else if (e.key === 'Escape') {
      setTagInput('');
      setSuggestedTags([]);
    }
  }, [tagInput, handleAddTag]);

  // Handle date formatting for input
  const formatDateForInput = (date: Date | undefined): string => {
    return date ? date.toISOString().split('T')[0] : '';
  };

  // Handle date parsing from input
  const parseDateFromInput = (value: string): Date | undefined => {
    return value ? new Date(value) : undefined;
  };

  // Check if any filters are active
  const hasActiveFilters = 
    selectedTags.length > 0 ||
    minRating > 0 ||
    (minUsage && minUsage > 0) ||
    createdAfter ||
    createdBefore ||
    workspaceOnly ||
    publicOnly;

  // Render star rating selector
  const renderRatingSelector = () => (
    <div className="space-y-3">
      <Label className="text-sm font-medium">Minimum Rating</Label>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => onMinRatingChange(star === minRating ? 0 : star)}
                className={cn(
                  "p-1 rounded hover:bg-gray-100 transition-colors",
                  star <= minRating ? "text-yellow-400" : "text-gray-300"
                )}
              >
                <Star
                  className={cn(
                    "h-4 w-4",
                    star <= minRating && "fill-current"
                  )}
                />
              </button>
            ))}
          </div>
          <span className="text-sm text-gray-600">
            {minRating > 0 ? `${minRating}+ stars` : 'Any rating'}
          </span>
        </div>
      </div>
    </div>
  );

  return (
    <Card className={cn("template-filters", className)}>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">Filters</CardTitle>
            <CardDescription>
              Refine your template search
            </CardDescription>
          </div>
          {hasActiveFilters && (
            <Button
              variant="outline"
              size="sm"
              onClick={onClear}
              className="text-xs"
            >
              Clear All
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Tags Filter */}
        <div className="space-y-3">
          <Label className="text-sm font-medium flex items-center gap-2">
            <Tag className="h-4 w-4" />
            Tags
          </Label>
          
          {/* Tag Input */}
          <div className="relative">
            <Input
              placeholder="Add tag..."
              value={tagInput}
              onChange={(e) => handleTagInputChange(e.target.value)}
              onKeyDown={handleTagInputKeyPress}
              className="pr-8"
            />
            {tagInput && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setTagInput('');
                  setSuggestedTags([]);
                }}
                className="absolute right-1 top-1 h-6 w-6 p-0"
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>

          {/* Tag Suggestions */}
          {suggestedTags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {suggestedTags.map((tag) => (
                <Button
                  key={tag}
                  size="sm"
                  variant="outline"
                  onClick={() => handleAddTag(tag)}
                  className="text-xs h-6 px-2"
                >
                  {tag}
                </Button>
              ))}
            </div>
          )}

          {/* Selected Tags */}
          {selectedTags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {selectedTags.map((tag) => (
                <Badge
                  key={tag}
                  variant="default"
                  className="flex items-center gap-1 text-xs"
                >
                  {tag}
                  <button
                    onClick={() => handleRemoveTag(tag)}
                    className="hover:bg-black hover:bg-opacity-20 rounded-full p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>

        <Separator />

        {/* Rating Filter */}
        {renderRatingSelector()}

        {/* Usage Filter */}
        {onMinUsageChange && (
          <>
            <Separator />
            <div className="space-y-3">
              <Label className="text-sm font-medium">Minimum Usage</Label>
              <div className="space-y-2">
                <Slider
                  value={[minUsage || 0]}
                  onValueChange={([value]) => onMinUsageChange(value)}
                  max={100}
                  min={0}
                  step={5}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-gray-500">
                  <span>0 uses</span>
                  <span className="font-medium">
                    {minUsage || 0}+ uses
                  </span>
                  <span>100+ uses</span>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Date Range Filters */}
        {(onCreatedAfterChange || onCreatedBeforeChange) && (
          <>
            <Separator />
            <div className="space-y-3">
              <Label className="text-sm font-medium">Created Date Range</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {onCreatedAfterChange && (
                  <div className="space-y-2">
                    <Label className="text-xs text-gray-600">From</Label>
                    <Input
                      type="date"
                      value={formatDateForInput(createdAfter)}
                      onChange={(e) => onCreatedAfterChange(parseDateFromInput(e.target.value))}
                      className="text-sm"
                    />
                  </div>
                )}
                {onCreatedBeforeChange && (
                  <div className="space-y-2">
                    <Label className="text-xs text-gray-600">To</Label>
                    <Input
                      type="date"
                      value={formatDateForInput(createdBefore)}
                      onChange={(e) => onCreatedBeforeChange(parseDateFromInput(e.target.value))}
                      className="text-sm"
                    />
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* Visibility Filters */}
        {(onWorkspaceOnlyChange || onPublicOnlyChange) && (
          <>
            <Separator />
            <div className="space-y-3">
              <Label className="text-sm font-medium">Visibility</Label>
              <div className="space-y-2">
                {onWorkspaceOnlyChange && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={workspaceOnly}
                      onChange={(e) => onWorkspaceOnlyChange(e.target.checked)}
                      className="rounded border-gray-300"
                    />
                    <span className="text-sm">Workspace templates only</span>
                  </label>
                )}
                {onPublicOnlyChange && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={publicOnly}
                      onChange={(e) => onPublicOnlyChange(e.target.checked)}
                      className="rounded border-gray-300"
                    />
                    <span className="text-sm">Public templates only</span>
                  </label>
                )}
              </div>
            </div>
          </>
        )}

        {/* Quick Filters */}
        <Separator />
        <div className="space-y-3">
          <Label className="text-sm font-medium">Quick Filters</Label>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={minRating >= 4 ? "default" : "outline"}
              onClick={() => onMinRatingChange(minRating >= 4 ? 0 : 4)}
              className="text-xs"
            >
              <Star className="h-3 w-3 mr-1" />
              Highly Rated
            </Button>
            
            {onMinUsageChange && (
              <Button
                size="sm"
                variant={(minUsage || 0) >= 10 ? "default" : "outline"}
                onClick={() => onMinUsageChange((minUsage || 0) >= 10 ? 0 : 10)}
                className="text-xs"
              >
                Popular
              </Button>
            )}

            <Button
              size="sm"
              variant={selectedTags.includes('recent') ? "default" : "outline"}
              onClick={() => {
                if (selectedTags.includes('recent')) {
                  handleRemoveTag('recent');
                } else {
                  handleAddTag('recent');
                }
              }}
              className="text-xs"
            >
              Recent
            </Button>
          </div>
        </div>

        {/* Active Filters Summary */}
        {hasActiveFilters && (
          <>
            <Separator />
            <div className="space-y-2">
              <Label className="text-sm font-medium">Active Filters</Label>
              <div className="text-xs text-gray-600 space-y-1">
                {selectedTags.length > 0 && (
                  <div>Tags: {selectedTags.join(', ')}</div>
                )}
                {minRating > 0 && (
                  <div>Rating: {minRating}+ stars</div>
                )}
                {(minUsage || 0) > 0 && (
                  <div>Usage: {minUsage}+ times</div>
                )}
                {createdAfter && (
                  <div>Created after: {createdAfter.toLocaleDateString()}</div>
                )}
                {createdBefore && (
                  <div>Created before: {createdBefore.toLocaleDateString()}</div>
                )}
                {workspaceOnly && <div>Workspace templates only</div>}
                {publicOnly && <div>Public templates only</div>}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}