'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { 
  Users, 
  Activity, 
  Settings, 
  BarChart3, 
  Puzzle, 
  FileText,
  Brain,
  Kanban,
  PenTool,
  Wifi,
  WifiOff,
  Eye,
  EyeOff,
} from 'lucide-react';

import { useWorkspace } from './hooks/useWorkspace';
import { useWorkspaceRealtime } from './hooks/useWorkspaceRealtime';
import { WorkspaceDashboard } from './WorkspaceDashboard';
import { MemberList } from './MemberList';
import { ActivityFeed } from './ActivityFeed';
import { WorkspaceSettings } from './WorkspaceSettings';
import { WorkspaceAnalytics } from './WorkspaceAnalytics';
import { IntegrationManager } from './IntegrationManager';
import { MemberPresence } from './MemberPresence';
import { CollaborationToolbar } from './CollaborationToolbar';
import { RealtimeIndicator } from './RealtimeIndicator';

interface WorkspaceLayoutProps {
  workspaceId: string;
  children?: React.ReactNode;
}

export function WorkspaceLayout({ workspaceId, children }: WorkspaceLayoutProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState(searchParams?.get('tab') || 'dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showPresence, setShowPresence] = useState(true);

  // Workspace data and real-time connection
  const { 
    workspace, 
    loading: workspaceLoading, 
    error: workspaceError,
    refreshWorkspace 
  } = useWorkspace(workspaceId);

  const {
    connected,
    session,
    members: onlineMembers,
    activities: realtimeActivities,
    joinWorkspace,
    leaveWorkspace,
    updatePresence,
    updateActivity
  } = useWorkspaceRealtime(workspaceId);

  // Join workspace on mount
  useEffect(() => {
    if (workspaceId) {
      joinWorkspace({
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
    }

    return () => {
      leaveWorkspace();
    };
  }, [workspaceId, joinWorkspace, leaveWorkspace]);

  // Update presence periodically
  useEffect(() => {
    const interval = setInterval(() => {
      updatePresence({
        isActive: document.hasFocus(),
        isOnline: navigator.onLine,
        lastSeen: new Date().toISOString(),
        currentPage: window.location.pathname,
        currentTool: activeTab,
      });
    }, 10000); // Update every 10 seconds

    return () => clearInterval(interval);
  }, [activeTab, updatePresence]);

  // Handle tab changes
  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    updateActivity({
      activeTool: tab,
      action: 'content_viewed' as any,
      resourceType: 'workspace_tab',
      resourceId: tab,
      details: { tab },
    });

    // Update URL
    const url = new URL(window.location.href);
    url.searchParams.set('tab', tab);
    router.push(url.pathname + url.search, { scroll: false });
  };

  if (workspaceLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading workspace...</p>
        </div>
      </div>
    );
  }

  if (workspaceError || !workspace) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="p-6 max-w-md">
          <div className="text-center">
            <div className="text-red-600 text-4xl mb-4">⚠️</div>
            <h2 className="text-xl font-semibold mb-2">Workspace not found</h2>
            <p className="text-gray-600 mb-4">
              {workspaceError || 'The workspace you\'re looking for doesn\'t exist or you don\'t have access to it.'}
            </p>
            <Button onClick={() => router.push('/workspace')}>
              Back to Workspaces
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            {sidebarOpen ? <EyeOff size={20} /> : <Eye size={20} />}
          </Button>
          
          <div>
            <h1 className="text-xl font-semibold text-gray-900">
              {workspace.name}
            </h1>
            <div className="flex items-center space-x-2 text-sm text-gray-500">
              <Badge variant={workspace.visibility === 'public' ? 'default' : 'secondary'}>
                {workspace.visibility}
              </Badge>
              <span>•</span>
              <span>{workspace.currentMembers} members</span>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          {/* Real-time connection indicator */}
          <RealtimeIndicator connected={connected} />

          {/* Presence toggle */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowPresence(!showPresence)}
          >
            {showPresence ? <Users size={20} /> : <Users size={20} className="text-gray-400" />}
          </Button>

          {/* Collaboration toolbar */}
          <CollaborationToolbar 
            workspaceId={workspaceId}
            onlineMembers={onlineMembers}
          />
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        {sidebarOpen && (
          <aside className="w-64 bg-white border-r border-gray-200 overflow-y-auto">
            <div className="p-4">
              {/* Navigation Tabs */}
              <Tabs 
                value={activeTab} 
                onValueChange={handleTabChange}
                orientation="vertical"
                className="w-full"
              >
                <TabsList className="grid w-full grid-cols-1 gap-1">
                  <TabsTrigger 
                    value="dashboard" 
                    className="justify-start"
                  >
                    <BarChart3 size={16} className="mr-2" />
                    Dashboard
                  </TabsTrigger>
                  <TabsTrigger 
                    value="members" 
                    className="justify-start"
                  >
                    <Users size={16} className="mr-2" />
                    Members ({workspace.currentMembers})
                  </TabsTrigger>
                  <TabsTrigger 
                    value="activity" 
                    className="justify-start"
                  >
                    <Activity size={16} className="mr-2" />
                    Activity
                    {realtimeActivities.length > 0 && (
                      <Badge variant="secondary" className="ml-auto">
                        {realtimeActivities.length}
                      </Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger 
                    value="tools" 
                    className="justify-start"
                  >
                    <Puzzle size={16} className="mr-2" />
                    Tools
                  </TabsTrigger>
                  <TabsTrigger 
                    value="analytics" 
                    className="justify-start"
                  >
                    <BarChart3 size={16} className="mr-2" />
                    Analytics
                  </TabsTrigger>
                  <TabsTrigger 
                    value="settings" 
                    className="justify-start"
                  >
                    <Settings size={16} className="mr-2" />
                    Settings
                  </TabsTrigger>
                </TabsList>

                {/* Quick access tools */}
                <div className="mt-6 space-y-2">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Quick Access
                  </h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start"
                    onClick={() => {
                      // Navigate to kanban integration
                      updateActivity({
                        activeTool: 'kanban',
                        activeResource: `workspace:${workspaceId}:kanban`,
                      });
                    }}
                  >
                    <Kanban size={16} className="mr-2" />
                    Kanban Boards
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start"
                    onClick={() => {
                      // Navigate to wiki integration
                      updateActivity({
                        activeTool: 'wiki',
                        activeResource: `workspace:${workspaceId}:wiki`,
                      });
                    }}
                  >
                    <FileText size={16} className="mr-2" />
                    Wiki Pages
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start"
                    onClick={() => {
                      // Navigate to memory integration
                      updateActivity({
                        activeTool: 'memory',
                        activeResource: `workspace:${workspaceId}:memory`,
                      });
                    }}
                  >
                    <Brain size={16} className="mr-2" />
                    Memory Graph
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start"
                    onClick={() => {
                      // Navigate to whiteboard integration
                      router.push(`/workspaces/${workspaceId}/whiteboards`);
                      updateActivity({
                        activeTool: 'whiteboard',
                        activeResource: `workspace:${workspaceId}:whiteboard`,
                      });
                    }}
                  >
                    <PenTool size={16} className="mr-2" />
                    Whiteboards
                  </Button>
                </div>
              </Tabs>

              {/* Online members presence */}
              {showPresence && onlineMembers.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                    Online Now ({onlineMembers.length})
                  </h3>
                  <MemberPresence members={onlineMembers} />
                </div>
              )}
            </div>
          </aside>
        )}

        {/* Main content area */}
        <main className="flex-1 overflow-y-auto">
          <Tabs value={activeTab} onValueChange={handleTabChange}>
            <TabsContent value="dashboard" className="p-6 m-0">
              <WorkspaceDashboard 
                workspace={workspace} 
                realtimeData={{
                  onlineMembers,
                  recentActivities: realtimeActivities,
                  connected,
                }}
              />
            </TabsContent>

            <TabsContent value="members" className="p-6 m-0">
              <MemberList 
                workspaceId={workspaceId} 
                currentUserId={session?.userId}
              />
            </TabsContent>

            <TabsContent value="activity" className="p-6 m-0">
              <ActivityFeed 
                workspaceId={workspaceId}
                realtimeActivities={realtimeActivities}
              />
            </TabsContent>

            <TabsContent value="tools" className="p-6 m-0">
              <IntegrationManager 
                workspaceId={workspaceId}
                onIntegrationChange={(type, action) => {
                  updateActivity({
                    activeTool: 'integrations',
                    action: action === 'created' ? 'integration_added' : 
                           action === 'updated' ? 'integration_configured' :
                           'integration_removed',
                    resourceType: 'integration',
                    resourceId: type,
                    details: { integrationType: type, action },
                  } as any);
                }}
              />
            </TabsContent>

            <TabsContent value="analytics" className="p-6 m-0">
              <WorkspaceAnalytics 
                workspaceId={workspaceId}
                workspace={workspace}
              />
            </TabsContent>

            <TabsContent value="settings" className="p-6 m-0">
              <WorkspaceSettings 
                workspace={workspace}
                onWorkspaceUpdated={refreshWorkspace}
                onSettingsChanged={(setting, value) => {
                  updateActivity({
                    activeTool: 'settings',
                    action: 'workspace_settings_changed' as any,
                    resourceType: 'workspace_setting',
                    resourceId: setting,
                    details: { setting, value },
                  });
                }}
              />
            </TabsContent>

            {/* Custom content area for integrations */}
            {children && (
              <div className="p-6">
                {children}
              </div>
            )}
          </Tabs>
        </main>
      </div>

      {/* Connection status toast */}
      {!connected && (
        <div className="fixed bottom-4 right-4 bg-red-600 text-white px-4 py-2 rounded-lg shadow-lg flex items-center space-x-2">
          <WifiOff size={16} />
          <span>Connection lost. Reconnecting...</span>
        </div>
      )}
    </div>
  );
}