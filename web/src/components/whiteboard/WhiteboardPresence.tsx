/**
 * Whiteboard Presence Component
 * 
 * Displays user presence indicators including cursors, avatars, and selection indicators.
 */

'use client';

import React, { useEffect, useRef, useMemo } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Users, Eye, EyeOff, MousePointer } from 'lucide-react';
import { WhiteboardPresence as WhiteboardPresenceType } from './utils/collaboration-events';
import { 
  calculateClientCursorPosition, 
  getUserColor, 
  getContrastingTextColor,
  generateCursorLabel,
  getAccessibleCursorStyle,
} from './utils/presence-utils';

interface WhiteboardPresenceProps {
  presences: WhiteboardPresenceType[];
  canvasElement: HTMLElement | null;
  viewport: {
    x: number;
    y: number;
    width: number;
    height: number;
    zoom: number;
  };
  showCursors: boolean;
  onToggleCursors: () => void;
  highContrastMode?: boolean;
  className?: string;
}

interface CursorProps {
  presence: WhiteboardPresenceType;
  canvasElement: HTMLElement;
  viewport: {
    x: number;
    y: number;
    width: number;
    height: number;
    zoom: number;
  };
  highContrastMode?: boolean;
}

// Individual cursor component
const PresenceCursor: React.FC<CursorProps> = ({ 
  presence, 
  canvasElement, 
  viewport,
  highContrastMode = false
}) => {
  const cursorRef = useRef<HTMLDivElement>(null);
  
  const clientPosition = useMemo(() => {
    return calculateClientCursorPosition(
      presence.cursor.x,
      presence.cursor.y,
      canvasElement,
      viewport
    );
  }, [presence.cursor, canvasElement, viewport]);

  const cursorStyle = useMemo(() => {
    const color = presence.color || getUserColor(presence.userId);
    return getAccessibleCursorStyle(color, highContrastMode);
  }, [presence.color, presence.userId, highContrastMode]);

  // Check if cursor is within visible area
  const isVisible = useMemo(() => {
    if (!canvasElement) return false;
    
    const rect = canvasElement.getBoundingClientRect();
    return (
      clientPosition.x >= rect.left - 50 &&
      clientPosition.x <= rect.right + 50 &&
      clientPosition.y >= rect.top - 50 &&
      clientPosition.y <= rect.bottom + 50
    );
  }, [clientPosition, canvasElement]);

  if (!isVisible) return null;

  return (
    <div
      ref={cursorRef}
      className="fixed pointer-events-none z-50 transition-all duration-200 ease-out"
      style={{
        left: clientPosition.x - 2,
        top: clientPosition.y - 2,
        transform: 'translate(0, 0)',
      }}
      role="img"
      aria-label={generateCursorLabel(presence)}
    >
      {/* Cursor SVG */}
      <svg
        width="20"
        height="20"
        viewBox="0 0 20 20"
        fill="none"
        className="drop-shadow-sm"
      >
        <path
          d="M3 3L16 8L10 10L8 16L3 3Z"
          fill={cursorStyle.backgroundColor}
          stroke={cursorStyle.borderColor}
          strokeWidth="1"
        />
      </svg>
      
      {/* User name label */}
      <div
        className="absolute top-5 left-3 px-2 py-1 text-xs font-medium rounded shadow-lg whitespace-nowrap max-w-32 truncate"
        style={{
          backgroundColor: cursorStyle.backgroundColor,
          color: cursorStyle.textColor,
          border: `1px solid ${cursorStyle.borderColor}`,
        }}
        title={presence.userName}
      >
        {presence.userName}
      </div>
      
      {/* Selection indicator */}
      {presence.selection.length > 0 && (
        <div
          className="absolute top-0 left-5 w-2 h-2 rounded-full animate-pulse"
          style={{
            backgroundColor: cursorStyle.backgroundColor,
            border: `1px solid ${cursorStyle.borderColor}`,
          }}
          title={`${presence.userName} has ${presence.selection.length} item(s) selected`}
        />
      )}
    </div>
  );
};

// Main presence component
export const WhiteboardPresence: React.FC<WhiteboardPresenceProps> = ({
  presences,
  canvasElement,
  viewport,
  showCursors,
  onToggleCursors,
  highContrastMode = false,
  className = '',
}) => {
  const presenceListRef = useRef<HTMLDivElement>(null);

  // Filter out stale presences
  const activePresences = useMemo(() => {
    const now = Date.now();
    const staleThreshold = 30000; // 30 seconds
    
    return presences.filter(presence => {
      const presenceTime = new Date(presence.timestamp).getTime();
      return now - presenceTime <= staleThreshold;
    });
  }, [presences]);

  // Stats for display
  const stats = useMemo(() => {
    const totalUsers = activePresences.length;
    const usersWithSelection = activePresences.filter(p => p.selection.length > 0).length;
    
    return {
      totalUsers,
      usersWithSelection,
    };
  }, [activePresences]);

  return (
    <TooltipProvider>
      <div className={`flex items-center gap-2 ${className}`}>
        {/* Active users indicator */}
        <div className="flex items-center gap-2 bg-white/90 backdrop-blur-sm border border-gray-200 rounded-lg px-3 py-2 shadow-sm">
          <Users className="h-4 w-4 text-gray-600" />
          <span className="text-sm font-medium text-gray-700">
            {stats.totalUsers} {stats.totalUsers === 1 ? 'user' : 'users'}
          </span>
          
          {stats.usersWithSelection > 0 && (
            <Badge variant="secondary" className="text-xs">
              {stats.usersWithSelection} selecting
            </Badge>
          )}
        </div>

        {/* User avatars */}
        {activePresences.length > 0 && (
          <div className="flex items-center -space-x-2">
            {activePresences.slice(0, 5).map(presence => (
              <Tooltip key={presence.userId}>
                <TooltipTrigger asChild>
                  <Avatar className="h-8 w-8 border-2 border-white shadow-sm hover:z-10 transition-all duration-200">
                    <AvatarImage 
                      src={`/api/avatars/${presence.userId}`} 
                      alt={presence.userName}
                    />
                    <AvatarFallback 
                      className="text-xs font-medium"
                      style={{
                        backgroundColor: presence.color || getUserColor(presence.userId),
                        color: getContrastingTextColor(presence.color || getUserColor(presence.userId)),
                      }}
                    >
                      {presence.userName.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <div className="text-sm">
                    <div className="font-medium">{presence.userName}</div>
                    {presence.selection.length > 0 && (
                      <div className="text-muted-foreground">
                        {presence.selection.length} item(s) selected
                      </div>
                    )}
                  </div>
                </TooltipContent>
              </Tooltip>
            ))}
            
            {activePresences.length > 5 && (
              <div className="h-8 w-8 bg-gray-100 border-2 border-white rounded-full flex items-center justify-center text-xs font-medium text-gray-600 shadow-sm">
                +{activePresences.length - 5}
              </div>
            )}
          </div>
        )}

        {/* Cursor visibility toggle */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={showCursors ? "default" : "outline"}
              size="sm"
              onClick={onToggleCursors}
              className="h-8 w-8 p-0"
            >
              {showCursors ? (
                <Eye className="h-4 w-4" />
              ) : (
                <EyeOff className="h-4 w-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {showCursors ? 'Hide cursors' : 'Show cursors'}
          </TooltipContent>
        </Tooltip>

        {/* Cursor count indicator */}
        {showCursors && activePresences.length > 0 && (
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <MousePointer className="h-3 w-3" />
            <span>{activePresences.length}</span>
          </div>
        )}
      </div>

      {/* Render cursors */}
      {showCursors && canvasElement && (
        <>
          {activePresences.map(presence => (
            <PresenceCursor
              key={presence.userId}
              presence={presence}
              canvasElement={canvasElement}
              viewport={viewport}
              highContrastMode={highContrastMode}
            />
          ))}
        </>
      )}
    </TooltipProvider>
  );
};

export default WhiteboardPresence;