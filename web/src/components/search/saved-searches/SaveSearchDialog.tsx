'use client';

import React, { useState, useCallback } from 'react';
import { X, Save, Tag } from 'lucide-react';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Textarea } from '../../ui/textarea';
import { Badge } from '../../ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../ui/dialog';
import { useApi } from '../../../hooks/use-api';
import { sanitizeSavedSearch, sanitizePlainText } from '../../../lib/sanitization';
import type { SaveSearchRequest, CollectionTreeNode } from '@mcp-tools/core';

interface SaveSearchDialogProps {
  onClose: () => void;
  onSave: () => void;
  collections: CollectionTreeNode[];
  initialQuery?: any;
  className?: string;
}

const SaveSearchDialog: React.FC<SaveSearchDialogProps> = ({
  onClose,
  onSave,
  collections,
  initialQuery,
  className = '',
}) => {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    tags: [] as string[],
    isPublic: false,
    collectionIds: [] as string[],
  });
  
  const [tagInput, setTagInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { apiCall } = useApi();

  // Handle form field changes
  const handleInputChange = (field: keyof typeof formData, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  // Handle tag input
  const handleTagKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag();
    }
  };

  const addTag = () => {
    const sanitizedTag = sanitizePlainText(tagInput.trim());
    if (sanitizedTag && sanitizedTag.length > 0 && !formData.tags.includes(sanitizedTag)) {
      setFormData(prev => ({
        ...prev,
        tags: [...prev.tags, sanitizedTag],
      }));
      setTagInput('');
    }
  };

  const removeTag = (tagToRemove: string) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.filter(tag => tag !== tagToRemove),
    }));
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      setError('Search name is required');
      return;
    }

    if (!initialQuery) {
      setError('No search query provided');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Sanitize all user input before sending to server
      const rawRequest: SaveSearchRequest = {
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
        queryData: initialQuery,
        tags: formData.tags,
        isPublic: formData.isPublic,
        collectionIds: formData.collectionIds.length > 0 ? formData.collectionIds : undefined,
      };

      // Apply comprehensive sanitization
      const saveRequest = sanitizeSavedSearch(rawRequest);

      await apiCall('POST', '/api/v1/saved-searches', saveRequest);
      
      // Success - call the onSave callback and close dialog
      onSave();
      onClose();
      
    } catch (err: any) {
      console.error('Failed to save search:', err);
      setError(err.message || 'Failed to save search');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Save className="h-5 w-5" />
            Save Search
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Search Name */}
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
              Search Name *
            </label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => handleInputChange('name', e.target.value)}
              placeholder="Enter a name for this search..."
              required
              autoFocus
            />
          </div>

          {/* Description */}
          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => handleInputChange('description', e.target.value)}
              placeholder="Optional description..."
              rows={3}
            />
          </div>

          {/* Tags */}
          <div>
            <label htmlFor="tags" className="block text-sm font-medium text-gray-700 mb-1">
              Tags
            </label>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Tag className="h-4 w-4 text-gray-400" />
                <Input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyPress={handleTagKeyPress}
                  onBlur={addTag}
                  placeholder="Type tags and press Enter..."
                  className="flex-1"
                />
              </div>
              
              {formData.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {formData.tags.map(tag => (
                    <Badge
                      key={tag}
                      variant="secondary"
                      className="cursor-pointer hover:bg-red-100"
                      onClick={() => removeTag(tag)}
                    >
                      {tag}
                      <X className="h-3 w-3 ml-1" />
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Collections */}
          {collections.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Add to Collections
              </label>
              <div className="max-h-32 overflow-y-auto border rounded-md p-2 space-y-1">
                {collections.map(collection => (
                  <label
                    key={collection.id}
                    className="flex items-center gap-2 p-1 hover:bg-gray-50 rounded cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={formData.collectionIds.includes(collection.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          handleInputChange('collectionIds', [...formData.collectionIds, collection.id]);
                        } else {
                          handleInputChange('collectionIds', formData.collectionIds.filter(id => id !== collection.id));
                        }
                      }}
                      className="rounded border-gray-300"
                    />
                    <span className="text-sm">{collection.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Public toggle */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isPublic"
              checked={formData.isPublic}
              onChange={(e) => handleInputChange('isPublic', e.target.checked)}
              className="rounded border-gray-300"
            />
            <label htmlFor="isPublic" className="text-sm text-gray-700">
              Make this search public (visible to other users)
            </label>
          </div>

          {/* Query preview */}
          {initialQuery && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Query Preview
              </label>
              <div className="bg-gray-50 p-2 rounded-md">
                <pre className="text-xs text-gray-800 whitespace-pre-wrap">
                  {typeof initialQuery === 'string' 
                    ? initialQuery 
                    : JSON.stringify(initialQuery, null, 2).substring(0, 200)
                  }
                  {JSON.stringify(initialQuery).length > 200 && '...'}
                </pre>
              </div>
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading || !formData.name.trim()}
              className="gap-2"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  Save Search
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default SaveSearchDialog;