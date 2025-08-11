/**
 * Whiteboard Collaboration Bar Component
 * 
 * Top bar component that displays collaboration controls and status.
 */

'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { 
  Users, 
  MessageCircle, 
  Wifi, 
  WifiOff, 
  Loader2, 
  AlertCircle,
  Eye,
  EyeOff,
  MousePointer,
} from 'lucide-react';
import { WhiteboardPresence as WhiteboardPresenceType, WhiteboardComment } from './utils/collaboration-events';
import WhiteboardPresence from './WhiteboardPresence';

interface WhiteboardCollaborationBarProps {
  // Connection state
  isConnected: boolean;
  isConnecting: boolean;
  connectionError: string | null;
  
  // Presence data
  presences: WhiteboardPresenceType[];
  showCursors: boolean;
  onToggleCursors: () => void;
  
  // Comments data
  comments: WhiteboardComment[];
  showComments: boolean;
  onToggleComments: () => void;
  
  // Canvas data
  canvasElement: HTMLElement | null;
  viewport: {
    x: number;
    y: number;
    width: number;
    height: number;
    zoom: number;
  };
  
  // Sync status
  canvasVersion: number;
  onRequestSync?: () => void;
  
  className?: string;
}

export const WhiteboardCollaborationBar: React.FC<WhiteboardCollaborationBarProps> = ({
  isConnected,
  isConnecting,
  connectionError,
  presences,
  showCursors,
  onToggleCursors,
  comments,
  showComments,
  onToggleComments,
  canvasElement,
  viewport,
  canvasVersion,
  onRequestSync,
  className = '',
}) => {
  // Calculate comment stats
  const commentStats = React.useMemo(() => {
    const total = comments.length;
    const unresolved = comments.filter(c => !c.resolved).length;
    return { total, unresolved };
  }, [comments]);

  // Connection status component
  const ConnectionStatus = () => {
    if (isConnecting) {
      return (
        <div className="flex items-center gap-2 text-orange-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm font-medium">Connecting...</span>
        </div>
      );
    }

    if (connectionError) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-2 text-red-600 cursor-help">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm font-medium">Connection Error</span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <div className="max-w-xs">
              <p className="font-medium">Connection failed</p>
              <p className="text-xs text-muted-foreground mt-1">{connectionError}</p>
              {onRequestSync && (
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="mt-2 h-6 text-xs"
                  onClick={onRequestSync}
                >
                  Retry Connection
                </Button>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      );
    }

    if (isConnected) {
      return (
        <div className="flex items-center gap-2 text-green-600">
          <Wifi className="h-4 w-4" />
          <span className="text-sm font-medium">Connected</span>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-2 text-gray-400">
        <WifiOff className="h-4 w-4" />
        <span className="text-sm font-medium">Offline</span>
      </div>
    );
  };

  return (
    <TooltipProvider>
      <div className={`flex items-center justify-between bg-white border-b border-gray-200 px-4 py-2 ${className}`}>
        {/* Left side - Connection status and sync info */}
        <div className="flex items-center gap-4">
          <ConnectionStatus />
          
          {/* Canvas version info */}
          {isConnected && (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <span>v{canvasVersion}</span>
              {onRequestSync && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={onRequestSync}
                      className="h-6 px-2 text-xs"
                    >
                      Sync
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    Request full canvas synchronization
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          )}
        </div>

        {/* Center - Presence information */}
        <div className="flex-1 flex justify-center">
          <WhiteboardPresence
            presences={presences}
            canvasElement={canvasElement}
            viewport={viewport}
            showCursors={showCursors}
            onToggleCursors={onToggleCursors}
            className="max-w-md"
          />
        </div>

        {/* Right side - Collaboration controls */}
        <div className="flex items-center gap-2">
          {/* Comments toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={showComments ? "default" : "outline"}
                size="sm"
                onClick={onToggleComments}
                className="relative"
              >
                <MessageCircle className="h-4 w-4 mr-2" />
                Comments
                {commentStats.total > 0 && (
                  <Badge 
                    variant={commentStats.unresolved > 0 ? "destructive" : "secondary"}
                    className="ml-2 px-1 text-xs h-4"
                  >
                    {commentStats.unresolved > 0 ? commentStats.unresolved : commentStats.total}
                  </Badge>
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <div>
                <p>{showComments ? 'Hide' : 'Show'} comments panel</p>
                {commentStats.total > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {commentStats.total} total, {commentStats.unresolved} unresolved
                  </p>
                )}
              </div>
            </TooltipContent>
          </Tooltip>

          {/* Additional collaboration info */}
          {presences.length > 0 && (
            <div className="flex items-center gap-1 text-xs text-gray-500 ml-2">
              <Users className="h-3 w-3" />
              <span>{presences.length} online</span>
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
};

export default WhiteboardCollaborationBar;