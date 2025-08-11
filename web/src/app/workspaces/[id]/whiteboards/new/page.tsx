'use client';

import React, { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useWhiteboard } from '@/components/whiteboard/hooks/useWhiteboard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import { useToast } from '@/hooks/use-toast';
import { PageWrapper } from '@/components/PageWrapper';

export default function NewWhiteboardPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const workspaceId = params.id as string;
  
  const { createWhiteboard } = useWhiteboard(workspaceId);
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    visibility: 'workspace' as 'workspace' | 'members' | 'public',
  });
  const [isCreating, setIsCreating] = useState(false);

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      toast({
        variant: 'destructive',
        title: 'Validation Error',
        description: 'Whiteboard name is required',
      });
      return;
    }

    setIsCreating(true);
    try {
      const newWhiteboard = await createWhiteboard({
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
        visibility: formData.visibility,
      });

      if (newWhiteboard) {
        toast({
          title: 'Whiteboard Created',
          description: `"${newWhiteboard.name}" has been created successfully`,
        });
        
        // Navigate to the new whiteboard
        router.push(`/workspaces/${workspaceId}/whiteboards/${newWhiteboard.id}`);
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Creation Failed',
        description: 'Failed to create whiteboard. Please try again.',
      });
    } finally {
      setIsCreating(false);
    }
  };

  // Handle back navigation
  const handleBack = () => {
    router.push(`/workspaces/${workspaceId}/whiteboards`);
  };

  return (
    <PageWrapper title="Create New Whiteboard">
      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center space-x-4 mb-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBack}
            className="flex items-center"
          >
            <ArrowLeftIcon className="w-4 h-4 mr-2" />
            Back to Whiteboards
          </Button>
        </div>

        {/* Form */}
        <Card>
          <CardHeader>
            <CardTitle>Create New Whiteboard</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Name */}
              <div className="space-y-2">
                <Label htmlFor="name">Whiteboard Name *</Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="Enter whiteboard name..."
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  maxLength={255}
                />
              </div>

              {/* Description */}
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Enter a description for this whiteboard..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                  maxLength={1000}
                />
              </div>

              {/* Visibility */}
              <div className="space-y-2">
                <Label htmlFor="visibility">Visibility</Label>
                <Select
                  value={formData.visibility}
                  onValueChange={(value: 'workspace' | 'members' | 'public') => 
                    setFormData({ ...formData, visibility: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select visibility" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="workspace">
                      <div>
                        <div className="font-medium">Workspace</div>
                        <div className="text-sm text-gray-500">All workspace members can access</div>
                      </div>
                    </SelectItem>
                    <SelectItem value="members">
                      <div>
                        <div className="font-medium">Members Only</div>
                        <div className="text-sm text-gray-500">Only invited members can access</div>
                      </div>
                    </SelectItem>
                    <SelectItem value="public">
                      <div>
                        <div className="font-medium">Public</div>
                        <div className="text-sm text-gray-500">Anyone with the link can access</div>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Form actions */}
              <div className="flex items-center justify-end space-x-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleBack}
                  disabled={isCreating}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isCreating || !formData.name.trim()}
                >
                  {isCreating ? 'Creating...' : 'Create Whiteboard'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Info section */}
        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="font-medium text-blue-900 mb-2">Getting Started</h3>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• Use the drawing tools to create shapes, lines, and text</li>
            <li>• Your work is automatically saved as you draw</li>
            <li>• Export your whiteboard as PNG, SVG, or PDF</li>
            <li>• Collaborate in real-time with other workspace members (Phase 5.1.3)</li>
          </ul>
        </div>
      </div>
    </PageWrapper>
  );
}