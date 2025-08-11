/**
 * Whiteboard Presence Integration Example
 * 
 * Complete example showing how to integrate the WB-002 User Presence Indicators
 * with Avatars system in a real whiteboard application.
 * 
 * This example demonstrates:
 * - Setting up the enhanced presence system
 * - Integrating with existing cursor tracking
 * - Using the presence panel and components
 * - Activity awareness and status tracking
 * - Performance optimization for 25+ users
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { 
  WhiteboardPresencePanel,
  WhiteboardPresence,
  UserAvatar,
  UserAvatarGroup,
  PresenceTooltip,
  useEnhancedPresence,
  useActivityAwareness,
  useWhiteboardPresence // existing cursor tracking hook
} from '@/components/whiteboard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { 
  Users, 
  Settings, 
  Eye, 
  EyeOff, 
  Activity,
  Minimize2,
  Maximize2
} from 'lucide-react';

// Mock current user (in real app, get from auth context)
const CURRENT_USER = {
  userId: 'current-user-123',
  userName: 'Current User',
  userEmail: 'user@example.com',
  avatar: '/avatars/current-user.jpg',
};

const MOCK_WHITEBOARD_ID = 'whiteboard-abc-123';

export default function WhiteboardPresenceIntegrationExample() {
  // UI state
  const [showPresencePanel, setShowPresencePanel] = useState(true);
  const [presencePanelCollapsed, setPresencePanelCollapsed] = useState(false);
  const [showCursors, setShowCursors] = useState(true);
  const [showActivityHistory, setShowActivityHistory] = useState(true);
  
  // Canvas reference (in real app, get from whiteboard provider)
  const [canvasElement, setCanvasElement] = useState<HTMLElement | null>(null);
  
  // Mock viewport state (in real app, get from tldraw or canvas state)
  const [viewport, setViewport] = useState({
    x: 0,
    y: 0,
    width: 1920,
    height: 1080,
    zoom: 1,
  });

  // Enhanced presence hook - main integration point
  const {
    presences,
    currentPresence,
    isConnected,
    setStatus,
    updateActivity,
    followUser,
    unfollowUser,
    followingUserId,
    connect,
    disconnect,
    stats,
  } = useEnhancedPresence({
    whiteboardId: MOCK_WHITEBOARD_ID,
    currentUser: CURRENT_USER,
    heartbeatInterval: 30000,
    idleTimeout: 5 * 60 * 1000, // 5 minutes
    awayTimeout: 15 * 60 * 1000, // 15 minutes
  });

  // Activity awareness hook - automatic activity detection
  const {
    currentActivity,
    isActive,
    setActivity,
    activityHistory,
    detectionStatus,
  } = useActivityAwareness({
    enableDrawingDetection: true,
    enableTypingDetection: true,
    enableSelectionDetection: true,
    enableCommentingDetection: true,
    canvasElement,
    onActivityChange: (activity) => {
      // Forward activity to presence system
      updateActivity(activity);
    },
  });

  // Existing cursor tracking hook integration
  const {
    updateSelection,
    updateViewport,
  } = useWhiteboardPresence({
    canvasElement,
    viewport,
    onPresenceUpdate: (presenceData) => {
      // Handle legacy cursor updates
      if (presenceData.cursor) {
        updateActivity({
          type: 'selecting',
          timestamp: Date.now(),
          description: 'Moving cursor',
        });
      }
    },
  });

  // Performance optimization: memoize expensive computations
  const presenceStats = useMemo(() => ({
    totalUsers: presences.length + (currentPresence ? 1 : 0),
    onlineUsers: presences.filter(p => p.isOnline).length + (currentPresence?.isOnline ? 1 : 0),
    activeUsers: presences.filter(p => p.isActive).length + (isActive ? 1 : 0),
    activities: {
      drawing: presences.filter(p => p.lastActivity.type === 'drawing').length,
      typing: presences.filter(p => p.lastActivity.type === 'typing').length,
      commenting: presences.filter(p => p.lastActivity.type === 'commenting').length,
    },
  }), [presences, currentPresence, isActive]);

  // Handle user interactions
  const handleUserClick = useCallback((userId: string) => {
    console.log('User clicked:', userId);
    // Optional: Show user profile or focus on their cursor
  }, []);

  const handleUserFollow = useCallback((userId: string) => {
    followUser(userId);
    console.log('Following user:', userId);
    // Optional: Animate viewport to user's location
  }, [followUser]);

  const handleStatusChange = useCallback((status: 'online' | 'idle' | 'away' | 'busy', customStatus?: string) => {
    setStatus(status, customStatus);
  }, [setStatus]);

  // Activity simulation for demo purposes
  const simulateActivity = useCallback((type: 'drawing' | 'typing' | 'selecting' | 'commenting') => {
    setActivity(type, `element-${Date.now()}`, `Simulated ${type} activity`);
  }, [setActivity]);

  // Canvas setup effect
  useEffect(() => {
    // In real app, this would get the actual canvas element from tldraw
    const canvas = document.getElementById('whiteboard-canvas');
    if (canvas) {
      setCanvasElement(canvas);
    }
  }, []);

  // Connection management
  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Main whiteboard area */}
      <div className="flex-1 flex flex-col">
        {/* Top toolbar */}
        <div className="bg-white border-b p-3">
          <div className="flex items-center justify-between">
            {/* Left side - presence summary */}
            <div className="flex items-center gap-4">
              {/* Current user avatar and status */}
              {currentPresence && (
                <div className="flex items-center gap-3">
                  <UserAvatar
                    userId={currentPresence.userId}
                    userName={currentPresence.userName}
                    userEmail={currentPresence.userEmail}
                    avatar={currentPresence.avatar}
                    status={currentPresence.status}
                    customStatus={currentPresence.customStatus}
                    showStatus={true}
                    size="md"
                    onClick={() => console.log('Current user clicked')}
                  />
                  <div>
                    <div className="font-medium text-sm">{currentPresence.userName}</div>
                    <div className="text-xs text-muted-foreground">
                      {currentActivity.description || currentActivity.type}
                    </div>
                  </div>
                </div>
              )}

              <Separator orientation="vertical" className="h-8" />

              {/* Other users avatars */}
              <UserAvatarGroup
                users={presences.slice(0, 8).map(p => ({
                  userId: p.userId,
                  userName: p.userName,
                  userEmail: p.userEmail,
                  avatar: p.avatar,
                  status: p.status,
                  color: p.color,
                }))}
                size="sm"
                maxVisible={6}
                showStatus={true}
                onUserClick={handleUserClick}
              />

              {presenceStats.totalUsers > 0 && (
                <div className="text-sm text-muted-foreground">
                  {presenceStats.totalUsers} users • {presenceStats.onlineUsers} online
                </div>
              )}
            </div>

            {/* Right side - controls */}
            <div className="flex items-center gap-2">
              {/* Connection status */}
              <div className={`flex items-center gap-2 px-2 py-1 rounded-full text-xs ${
                isConnected ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
              }`}>
                <div className={`w-2 h-2 rounded-full ${
                  isConnected ? 'bg-green-500' : 'bg-red-500'
                }`} />
                {isConnected ? 'Connected' : 'Disconnected'}
              </div>

              {/* Activity status */}
              {isActive && (
                <div className="flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs">
                  <Activity className="h-3 w-3" />
                  {currentActivity.type}
                </div>
              )}

              {/* Cursor visibility toggle */}
              <Button
                variant={showCursors ? "default" : "outline"}
                size="sm"
                onClick={() => setShowCursors(!showCursors)}
                className="h-8 px-3"
              >
                {showCursors ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                <span className="ml-1 hidden sm:inline">Cursors</span>
              </Button>

              {/* Presence panel toggle */}
              <Button
                variant={showPresencePanel ? "default" : "outline"}
                size="sm"
                onClick={() => setShowPresencePanel(!showPresencePanel)}
                className="h-8 px-3"
              >
                <Users className="h-4 w-4" />
                <span className="ml-1 hidden sm:inline">Participants</span>
              </Button>
            </div>
          </div>
        </div>

        {/* Canvas area with presence overlay */}
        <div className="flex-1 relative overflow-hidden">
          {/* Mock canvas */}
          <div
            id="whiteboard-canvas"
            className="w-full h-full bg-white"
            style={{
              backgroundImage: 'radial-gradient(circle, #e5e7eb 1px, transparent 1px)',
              backgroundSize: '20px 20px',
            }}
          >
            <div className="absolute inset-4 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center text-gray-500">
              <div className="text-center">
                <div className="text-xl mb-2">🎨</div>
                <div className="font-medium">Whiteboard Canvas</div>
                <div className="text-sm">Presence indicators would overlay here</div>
              </div>
            </div>
          </div>

          {/* Presence cursors overlay */}
          <WhiteboardPresence
            presences={presences.map(p => ({
              userId: p.userId,
              userName: p.userName,
              cursor: { x: Math.random() * 800 + 100, y: Math.random() * 400 + 100 },
              viewport,
              selection: [],
              color: p.color,
              timestamp: new Date().toISOString(),
            }))}
            canvasElement={canvasElement}
            viewport={viewport}
            showCursors={showCursors}
            onToggleCursors={() => setShowCursors(!showCursors)}
            className="absolute top-4 left-4"
          />

          {/* Following indicator */}
          {followingUserId && (
            <div className="absolute top-4 right-4 bg-blue-500 text-white px-3 py-2 rounded-lg shadow-lg">
              <div className="flex items-center gap-2">
                <Eye className="h-4 w-4" />
                <span>Following {presences.find(p => p.userId === followingUserId)?.userName}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={unfollowUser}
                  className="h-6 w-6 p-0 text-white hover:bg-blue-600"
                >
                  ×
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Bottom status bar */}
        <div className="bg-white border-t p-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-4">
              <span>Activity: {currentActivity.type}</span>
              <span>•</span>
              <span>{presenceStats.onlineUsers} online</span>
              {presenceStats.activities.drawing > 0 && (
                <>
                  <span>•</span>
                  <span>{presenceStats.activities.drawing} drawing</span>
                </>
              )}
              {presenceStats.activities.typing > 0 && (
                <>
                  <span>•</span>
                  <span>{presenceStats.activities.typing} typing</span>
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => simulateActivity('drawing')}
                className="h-6 px-2 text-xs"
              >
                Draw
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => simulateActivity('typing')}
                className="h-6 px-2 text-xs"
              >
                Type
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => simulateActivity('commenting')}
                className="h-6 px-2 text-xs"
              >
                Comment
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Presence panel */}
      {showPresencePanel && (
        <div className="border-l bg-white">
          <WhiteboardPresencePanel
            presences={presences}
            currentUserId={CURRENT_USER.userId}
            isCollapsed={presencePanelCollapsed}
            onToggleCollapse={() => setPresencePanelCollapsed(!presencePanelCollapsed)}
            showActivityHistory={showActivityHistory}
            onUserClick={handleUserClick}
            onUserFollow={handleUserFollow}
            className="h-full"
          />
        </div>
      )}

      {/* Demo controls (remove in production) */}
      <div className="absolute bottom-4 left-4">
        <Card className="w-64">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Demo Controls</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleStatusChange('online')}
                className="text-xs"
              >
                Online
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleStatusChange('busy', 'In meeting')}
                className="text-xs"
              >
                Busy
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleStatusChange('away')}
                className="text-xs"
              >
                Away
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleStatusChange('idle')}
                className="text-xs"
              >
                Idle
              </Button>
            </div>
            <Separator />
            <div className="text-xs space-y-1">
              <div>Users: {presenceStats.totalUsers}</div>
              <div>Online: {presenceStats.onlineUsers}</div>
              <div>Active: {presenceStats.activeUsers}</div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// Usage in a real whiteboard application:
/*
import WhiteboardPresenceIntegration from './examples/whiteboard-presence-integration';

// In your whiteboard component:
function MyWhiteboardApp() {
  return (
    <WhiteboardProvider>
      <div className="h-screen">
        {/* Your existing whiteboard components */}
        <TldrawCanvas />
        
        {/* Add the presence integration */}
        <WhiteboardPresenceIntegration />
      </div>
    </WhiteboardProvider>
  );
}
*/