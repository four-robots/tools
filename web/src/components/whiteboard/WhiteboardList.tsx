'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useWhiteboard } from './hooks/useWhiteboard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  PlusIcon,
  MagnifyingGlassIcon,
  EllipsisVerticalIcon,
  PencilSquareIcon,
  TrashIcon,
  EyeIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';

interface WhiteboardListProps {
  workspaceId: string;
  workspaceName: string;
  userRole?: 'owner' | 'admin' | 'editor' | 'commenter' | 'viewer';
}

const WhiteboardList: React.FC<WhiteboardListProps> = ({
  workspaceId,
  workspaceName,
  userRole = 'viewer',
}) => {
  const router = useRouter();
  const { toast } = useToast();
  const {
    whiteboards,
    isLoading,
    error,
    createWhiteboard,
    deleteWhiteboard,
    loadWhiteboards,
  } = useWhiteboard(workspaceId);

  const [searchQuery, setSearchQuery] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // Check if user can create/edit whiteboards
  const canEdit = ['owner', 'admin', 'editor'].includes(userRole);

  // Load whiteboards on mount
  useEffect(() => {
    loadWhiteboards();
  }, [loadWhiteboards]);

  // Filter whiteboards based on search query
  const filteredWhiteboards = whiteboards.filter(whiteboard =>
    whiteboard.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    whiteboard.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Handle create whiteboard
  const handleCreateWhiteboard = useCallback(async () => {
    if (!canEdit) {
      toast({
        variant: 'destructive',
        title: 'Permission Denied',
        description: 'You do not have permission to create whiteboards',
      });
      return;
    }

    setIsCreating(true);
    try {
      const newWhiteboard = await createWhiteboard({
        name: `New Whiteboard ${whiteboards.length + 1}`,
        description: 'A new collaborative whiteboard',
        visibility: 'workspace',
      });

      if (newWhiteboard) {
        router.push(`/workspaces/${workspaceId}/whiteboards/${newWhiteboard.id}`);
      }
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Creation Failed',
        description: 'Failed to create whiteboard',
      });
    } finally {
      setIsCreating(false);
    }
  }, [canEdit, createWhiteboard, whiteboards.length, router, workspaceId, toast]);

  // Handle delete whiteboard
  const handleDeleteWhiteboard = useCallback(async (whiteboardId: string, whiteboardName: string) => {
    if (!canEdit) {
      toast({
        variant: 'destructive',
        title: 'Permission Denied',
        description: 'You do not have permission to delete whiteboards',
      });
      return;
    }

    if (!confirm(`Are you sure you want to delete "${whiteboardName}"? This action cannot be undone.`)) {
      return;
    }

    try {
      const success = await deleteWhiteboard(whiteboardId);
      if (success) {
        toast({
          title: 'Whiteboard Deleted',
          description: `"${whiteboardName}" has been deleted successfully`,
        });
      }
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Deletion Failed',
        description: 'Failed to delete whiteboard',
      });
    }
  }, [canEdit, deleteWhiteboard, toast]);

  // Get visibility badge variant
  const getVisibilityBadge = (visibility: string) => {
    switch (visibility) {
      case 'public':
        return <Badge variant="default">Public</Badge>;
      case 'members':
        return <Badge variant="secondary">Members</Badge>;
      case 'workspace':
        return <Badge variant="outline">Workspace</Badge>;
      default:
        return <Badge variant="outline">Private</Badge>;
    }
  };

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-64 bg-red-50 rounded-lg border border-red-200">
        <div className="text-center">
          <div className="text-red-600 font-semibold mb-2">Error Loading Whiteboards</div>
          <div className="text-red-500 text-sm mb-4">{error}</div>
          <Button onClick={loadWhiteboards} variant="outline">
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="whiteboard-list">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Whiteboards</h1>
          <p className="text-gray-600">{workspaceName}</p>
        </div>

        {canEdit && (
          <Button
            onClick={handleCreateWhiteboard}
            disabled={isCreating || isLoading}
            className="flex items-center"
          >
            <PlusIcon className="w-4 h-4 mr-2" />
            {isCreating ? 'Creating...' : 'New Whiteboard'}
          </Button>
        )}
      </div>

      {/* Search and filters */}
      <div className="flex items-center space-x-4 mb-6">
        <div className="relative flex-1">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
            type="text"
            placeholder="Search whiteboards..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Loading state */}
      {isLoading && whiteboards.length === 0 && (
        <div className="flex items-center justify-center min-h-64">
          <div className="text-center">
            <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
            <div className="text-gray-600">Loading whiteboards...</div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && whiteboards.length === 0 && (
        <div className="flex items-center justify-center min-h-64 bg-gray-50 rounded-lg border border-gray-200">
          <div className="text-center">
            <div className="text-gray-500 text-lg font-semibold mb-2">No whiteboards yet</div>
            <div className="text-gray-400 mb-4">Create your first collaborative whiteboard to get started</div>
            {canEdit && (
              <Button onClick={handleCreateWhiteboard} disabled={isCreating}>
                <PlusIcon className="w-4 h-4 mr-2" />
                Create Whiteboard
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Whiteboards grid */}
      {filteredWhiteboards.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredWhiteboards.map((whiteboard) => (
            <Card key={whiteboard.id} className="whiteboard-card hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-lg font-semibold text-gray-900 line-clamp-2">
                    {whiteboard.name}
                  </CardTitle>
                  
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        <EllipsisVerticalIcon className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem asChild>
                        <Link href={`/workspaces/${workspaceId}/whiteboards/${whiteboard.id}`}>
                          {canEdit ? (
                            <>
                              <PencilSquareIcon className="w-4 h-4 mr-2" />
                              Edit
                            </>
                          ) : (
                            <>
                              <EyeIcon className="w-4 h-4 mr-2" />
                              View
                            </>
                          )}
                        </Link>
                      </DropdownMenuItem>
                      
                      {canEdit && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => handleDeleteWhiteboard(whiteboard.id, whiteboard.name)}
                            className="text-red-600 hover:text-red-700"
                          >
                            <TrashIcon className="w-4 h-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>

              <CardContent className="pt-0">
                {/* Description */}
                {whiteboard.description && (
                  <p className="text-sm text-gray-600 mb-3 line-clamp-2">
                    {whiteboard.description}
                  </p>
                )}

                {/* Metadata */}
                <div className="flex items-center justify-between text-xs text-gray-500 mb-3">
                  <div className="flex items-center space-x-1">
                    <ClockIcon className="w-3 h-3" />
                    <span>
                      {whiteboard.updatedAt 
                        ? formatDistanceToNow(new Date(whiteboard.updatedAt), { addSuffix: true })
                        : 'Never updated'
                      }
                    </span>
                  </div>
                  {getVisibilityBadge(whiteboard.visibility)}
                </div>

                {/* Action button */}
                <Link href={`/workspaces/${workspaceId}/whiteboards/${whiteboard.id}`}>
                  <Button variant="outline" size="sm" className="w-full">
                    {canEdit ? 'Open & Edit' : 'View'}
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Search results info */}
      {searchQuery && (
        <div className="mt-6 text-sm text-gray-500">
          {filteredWhiteboards.length === 0 
            ? `No whiteboards found matching "${searchQuery}"`
            : `Found ${filteredWhiteboards.length} whiteboard${filteredWhiteboards.length === 1 ? '' : 's'} matching "${searchQuery}"`
          }
        </div>
      )}
    </div>
  );
};

export default WhiteboardList;