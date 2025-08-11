'use client';

import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import {
  ArrowDownTrayIcon,
  ArrowsPointingOutIcon,
  ArrowsPointingInIcon,
  EyeIcon,
  EyeSlashIcon,
  PhotoIcon,
  DocumentIcon,
  Cog6ToothIcon,
} from '@heroicons/react/24/outline';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface WhiteboardToolbarProps {
  isReadOnly: boolean;
  onExport: (format: 'png' | 'svg' | 'pdf') => void;
  onToggleFullscreen: () => void;
  isFullscreen: boolean;
  editor?: any;
}

const WhiteboardToolbar: React.FC<WhiteboardToolbarProps> = ({
  isReadOnly,
  onExport,
  onToggleFullscreen,
  isFullscreen,
  editor,
}) => {
  const [showGrid, setShowGrid] = useState(true);
  const [showRulers, setShowRulers] = useState(false);
  const [snapToGrid, setSnapToGrid] = useState(true);

  // Handle grid toggle
  const handleToggleGrid = useCallback(() => {
    if (editor) {
      const newShowGrid = !showGrid;
      setShowGrid(newShowGrid);
      
      // Update editor grid visibility
      editor.updateUserPreferences({
        ...editor.user.userPreferences,
        showGrid: newShowGrid,
      });
    }
  }, [editor, showGrid]);

  // Handle snap to grid toggle
  const handleToggleSnapToGrid = useCallback(() => {
    if (editor) {
      const newSnapToGrid = !snapToGrid;
      setSnapToGrid(newSnapToGrid);
      
      // Update editor snap settings
      editor.updateUserPreferences({
        ...editor.user.userPreferences,
        snapToGrid: newSnapToGrid,
      });
    }
  }, [editor, snapToGrid]);

  // Handle zoom operations
  const handleZoomIn = useCallback(() => {
    if (editor) {
      editor.zoomIn();
    }
  }, [editor]);

  const handleZoomOut = useCallback(() => {
    if (editor) {
      editor.zoomOut();
    }
  }, [editor]);

  const handleZoomToFit = useCallback(() => {
    if (editor) {
      editor.zoomToFit();
    }
  }, [editor]);

  const handleZoomToSelection = useCallback(() => {
    if (editor) {
      editor.zoomToSelection();
    }
  }, [editor]);

  // Handle undo/redo
  const handleUndo = useCallback(() => {
    if (editor && !isReadOnly) {
      editor.undo();
    }
  }, [editor, isReadOnly]);

  const handleRedo = useCallback(() => {
    if (editor && !isReadOnly) {
      editor.redo();
    }
  }, [editor, isReadOnly]);

  // Handle clear canvas
  const handleClearCanvas = useCallback(() => {
    if (editor && !isReadOnly) {
      if (confirm('Are you sure you want to clear the entire canvas? This action cannot be undone.')) {
        editor.selectAll();
        editor.deleteShapes();
      }
    }
  }, [editor, isReadOnly]);

  return (
    <div className="whiteboard-toolbar bg-white border-b border-gray-200 px-4 py-2">
      <div className="flex items-center justify-between">
        {/* Left side - Canvas controls */}
        <div className="flex items-center space-x-2">
          {/* Undo/Redo */}
          {!isReadOnly && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleUndo}
                disabled={!editor}
                title="Undo (Ctrl+Z)"
              >
                ↶
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRedo}
                disabled={!editor}
                title="Redo (Ctrl+Y)"
              >
                ↷
              </Button>
              <div className="w-px h-6 bg-gray-300 mx-2" />
            </>
          )}

          {/* Zoom controls */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleZoomOut}
            disabled={!editor}
            title="Zoom Out (-)"
          >
            −
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleZoomIn}
            disabled={!editor}
            title="Zoom In (+)"
          >
            +
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleZoomToFit}
            disabled={!editor}
            title="Zoom to Fit"
          >
            ⌂
          </Button>
          
          <div className="w-px h-6 bg-gray-300 mx-2" />

          {/* View options */}
          <Button
            variant={showGrid ? "default" : "ghost"}
            size="sm"
            onClick={handleToggleGrid}
            disabled={!editor}
            title="Toggle Grid"
          >
            #
          </Button>
          
          <Button
            variant={snapToGrid ? "default" : "ghost"}
            size="sm"
            onClick={handleToggleSnapToGrid}
            disabled={!editor}
            title="Snap to Grid"
          >
            ⊞
          </Button>
        </div>

        {/* Center - Canvas info */}
        <div className="flex items-center space-x-4 text-sm text-gray-500">
          {isReadOnly && (
            <div className="flex items-center space-x-1 text-amber-600">
              <EyeIcon className="w-4 h-4" />
              <span>Read Only</span>
            </div>
          )}
        </div>

        {/* Right side - Actions */}
        <div className="flex items-center space-x-2">
          {/* Canvas actions dropdown */}
          {!isReadOnly && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm">
                  <Cog6ToothIcon className="w-4 h-4 mr-2" />
                  Actions
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleZoomToSelection}>
                  Zoom to Selection
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem 
                  onClick={handleClearCanvas}
                  className="text-red-600 hover:text-red-700"
                >
                  Clear Canvas
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Export dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                <ArrowDownTrayIcon className="w-4 h-4 mr-2" />
                Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onExport('png')}>
                <PhotoIcon className="w-4 h-4 mr-2" />
                Export as PNG
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onExport('svg')}>
                <DocumentIcon className="w-4 h-4 mr-2" />
                Export as SVG
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onExport('pdf')}>
                <DocumentIcon className="w-4 h-4 mr-2" />
                Export as PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Fullscreen toggle */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleFullscreen}
            title={isFullscreen ? "Exit Fullscreen (Esc)" : "Enter Fullscreen (F11)"}
          >
            {isFullscreen ? (
              <ArrowsPointingInIcon className="w-4 h-4" />
            ) : (
              <ArrowsPointingOutIcon className="w-4 h-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default WhiteboardToolbar;