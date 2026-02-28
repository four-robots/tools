'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import WhiteboardCanvas from './WhiteboardCanvas';
import WhiteboardToolbar from './WhiteboardToolbar';
import { WhiteboardProvider } from './WhiteboardProvider';
import { useWhiteboard } from './hooks/useWhiteboard';
import { applyWorkspaceTheme, getWorkspaceTheme } from './utils/workspace-theming';
import { exportAsPng, exportAsSvg, exportAsPdf, downloadFile } from './utils/canvas-export';
import { Button } from '@/components/ui/button';
import { ArrowLeftIcon, ShareIcon } from '@heroicons/react/24/outline';
import { useToast } from '@/hooks/use-toast';

interface WhiteboardEditorProps {
  whiteboardId: string;
  workspaceId: string;
  workspaceName: string;
  userId: string;
  userName: string;
  userRole?: 'owner' | 'admin' | 'editor' | 'commenter' | 'viewer';
}

const WhiteboardEditor: React.FC<WhiteboardEditorProps> = ({
  whiteboardId,
  workspaceId,
  workspaceName,
  userId,
  userName,
  userRole = 'viewer',
}) => {
  const router = useRouter();
  const { toast } = useToast();
  const { getWhiteboard, error } = useWhiteboard(workspaceId);
  
  const [whiteboard, setWhiteboard] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [editorRef, setEditorRef] = useState<any>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Determine if user has edit permissions
  const isReadOnly = !['owner', 'admin', 'editor'].includes(userRole);

  // Load whiteboard data
  useEffect(() => {
    const loadWhiteboard = async () => {
      setIsLoading(true);
      try {
        const data = await getWhiteboard(whiteboardId);
        if (data) {
          setWhiteboard(data);
          
          // Apply workspace theming
          const theme = getWorkspaceTheme(data.workspace?.settings);
          applyWorkspaceTheme(theme);
        }
      } catch (err) {
        console.error('Failed to load whiteboard:', err);
        toast({
          variant: 'destructive',
          title: 'Error',
          description: 'Failed to load whiteboard',
        });
      } finally {
        setIsLoading(false);
      }
    };

    loadWhiteboard();
  }, [whiteboardId, getWhiteboard, toast]);

  // Handle canvas editor reference
  const handleEditorMount = useCallback((editor: any) => {
    setEditorRef(editor);
  }, []);

  // Handle export operations
  const handleExport = useCallback(async (format: 'png' | 'svg' | 'pdf') => {
    if (!editorRef) {
      toast({
        variant: 'destructive',
        title: 'Export Error',
        description: 'Canvas not ready for export',
      });
      return;
    }

    try {
      let result;
      switch (format) {
        case 'png':
          result = await exportAsPng(editorRef, { scale: 2 });
          break;
        case 'svg':
          result = await exportAsSvg(editorRef);
          break;
        case 'pdf':
          result = await exportAsPdf(editorRef);
          break;
        default:
          throw new Error('Unsupported export format');
      }

      if (result.success && result.data && result.filename) {
        downloadFile(result.data as Blob, result.filename);
        toast({
          title: 'Export Successful',
          description: `Whiteboard exported as ${format.toUpperCase()}`,
        });
      } else {
        throw new Error(result.error || 'Export failed');
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Export Error',
        description: error instanceof Error ? error.message : 'Export failed',
      });
    }
  }, [editorRef, toast]);

  // Handle sharing
  const handleShare = useCallback(async () => {
    // TODO: Implement sharing functionality
    toast({
      title: 'Share Feature',
      description: 'Sharing functionality will be implemented in Phase 5.1.3',
    });
  }, [toast]);

  // Toggle fullscreen mode
  const toggleFullscreen = useCallback(() => {
    setIsFullscreen(!isFullscreen);
    if (!isFullscreen) {
      document.documentElement.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  }, [isFullscreen]);

  // Handle back navigation
  const handleBack = useCallback(() => {
    router.push(`/workspaces/${workspaceId}/whiteboards`);
  }, [router, workspaceId]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="text-red-600 text-xl font-semibold mb-4">Error Loading Whiteboard</div>
          <div className="text-gray-600 mb-6">{error}</div>
          <Button onClick={handleBack} variant="outline">
            <ArrowLeftIcon className="w-4 h-4 mr-2" />
            Back to Whiteboards
          </Button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
          <div className="text-gray-600">Loading Whiteboard...</div>
        </div>
      </div>
    );
  }

  return (
    <WhiteboardProvider
      whiteboardId={whiteboardId}
      workspaceId={workspaceId}
      userId={userId}
      userName={userName}
      isReadOnly={isReadOnly}
    >
      <div className={`whiteboard-editor ${isFullscreen ? 'fullscreen' : ''}`}>
        {/* Header */}
        {!isFullscreen && (
          <header className="bg-white border-b border-gray-200 px-4 py-2 flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleBack}
                className="flex items-center"
              >
                <ArrowLeftIcon className="w-4 h-4 mr-2" />
                Back
              </Button>
              
              <div>
                <h1 className="text-lg font-semibold text-gray-900">
                  {whiteboard?.name || 'Untitled Whiteboard'}
                </h1>
                <p className="text-sm text-gray-500">{workspaceName}</p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              {/* Export options */}
              <div className="hidden md:flex space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleExport('png')}
                  disabled={!editorRef}
                >
                  Export PNG
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleExport('svg')}
                  disabled={!editorRef}
                >
                  Export SVG
                </Button>
              </div>

              {/* Share button */}
              <Button
                variant="outline"
                size="sm"
                onClick={handleShare}
              >
                <ShareIcon className="w-4 h-4 mr-2" />
                Share
              </Button>

              {/* Fullscreen toggle */}
              <Button
                variant="outline"
                size="sm"
                onClick={toggleFullscreen}
              >
                {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
              </Button>
            </div>
          </header>
        )}

        {/* Main content */}
        <div className="flex-1 flex flex-col relative">
          {/* Custom toolbar */}
          <WhiteboardToolbar
            isReadOnly={isReadOnly}
            onExport={handleExport}
            onToggleFullscreen={toggleFullscreen}
            isFullscreen={isFullscreen}
            editor={editorRef}
          />

          {/* Canvas */}
          <div className="flex-1 relative">
            <WhiteboardCanvas
              whiteboardId={whiteboardId}
              workspaceId={workspaceId}
              isReadOnly={isReadOnly}
              onMount={handleEditorMount}
              className="absolute inset-0 w-full h-full tldraw-workspace-branding"
            />
          </div>
        </div>

        {/* Footer - only show in non-fullscreen mode */}
        {!isFullscreen && (
          <footer className="bg-gray-50 border-t border-gray-200 px-4 py-2">
            <div className="flex items-center justify-between text-sm text-gray-500">
              <div>
                {isReadOnly ? (
                  <span className="text-amber-600">Read-only mode</span>
                ) : (
                  <span className="text-green-600">Editing enabled</span>
                )}
              </div>
              <div>
                Last saved: Auto-save enabled
              </div>
            </div>
          </footer>
        )}
      </div>
    </WhiteboardProvider>
  );
};

export default WhiteboardEditor;