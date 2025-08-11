'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Users, 
  Activity, 
  FileText, 
  Brain,
  Kanban,
  TrendingUp,
  Clock,
  Zap,
} from 'lucide-react';
import type { CollaborativeWorkspace } from '@shared/types/workspace';

interface WorkspaceDashboardProps {
  workspace: CollaborativeWorkspace;
  realtimeData: {
    onlineMembers: any[];
    recentActivities: any[];
    connected: boolean;
  };
}

export function WorkspaceDashboard({ workspace, realtimeData }: WorkspaceDashboardProps) {
  const { onlineMembers, recentActivities, connected } = realtimeData;

  const quickStats = [
    {
      label: 'Total Members',
      value: workspace.currentMembers,
      icon: Users,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
    },
    {
      label: 'Online Now',
      value: onlineMembers.length,
      icon: Zap,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
    },
    {
      label: 'Recent Activity',
      value: recentActivities.length,
      icon: Activity,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
    },
    {
      label: 'Status',
      value: connected ? 'Connected' : 'Disconnected',
      icon: TrendingUp,
      color: connected ? 'text-green-600' : 'text-red-600',
      bgColor: connected ? 'bg-green-50' : 'bg-red-50',
    },
  ];

  const quickActions = [
    {
      label: 'Invite Members',
      description: 'Add new team members to collaborate',
      icon: Users,
      action: 'invite_members',
      color: 'border-blue-200 hover:border-blue-300',
    },
    {
      label: 'Create Kanban Board',
      description: 'Start a new project board',
      icon: Kanban,
      action: 'create_kanban',
      color: 'border-green-200 hover:border-green-300',
    },
    {
      label: 'New Wiki Page',
      description: 'Document knowledge and processes',
      icon: FileText,
      action: 'create_wiki',
      color: 'border-purple-200 hover:border-purple-300',
    },
    {
      label: 'Add Memory',
      description: 'Capture insights and connections',
      icon: Brain,
      action: 'create_memory',
      color: 'border-orange-200 hover:border-orange-300',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
        <p className="mt-1 text-gray-600">
          Welcome back to {workspace.name}. Here's what's happening in your workspace.
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {quickStats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label} className="p-6">
              <div className="flex items-center">
                <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                  <Icon size={20} className={stat.color} />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">{stat.label}</p>
                  <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Quick Actions */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
          <div className="space-y-4">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <div
                  key={action.action}
                  className={`p-4 border-2 rounded-lg cursor-pointer transition-colors ${action.color}`}
                >
                  <div className="flex items-center">
                    <Icon size={20} className="text-gray-600" />
                    <div className="ml-3">
                      <p className="font-medium text-gray-900">{action.label}</p>
                      <p className="text-sm text-gray-600">{action.description}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Recent Activity */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Recent Activity</h3>
            <Badge variant={connected ? 'default' : 'secondary'}>
              {connected ? 'Live' : 'Offline'}
            </Badge>
          </div>
          
          {recentActivities.length > 0 ? (
            <div className="space-y-4">
              {recentActivities.slice(0, 5).map((activity, index) => (
                <div key={index} className="flex items-center space-x-3">
                  <div className="flex-shrink-0 w-2 h-2 bg-blue-600 rounded-full"></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900 truncate">
                      <span className="font-medium">{activity.user?.name}</span>
                      {' '}
                      <span className="text-gray-600">
                        {getActivityDescription(activity.action)}
                      </span>
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatTime(activity.timestamp)}
                    </p>
                  </div>
                </div>
              ))}
              {recentActivities.length > 5 && (
                <Button variant="ghost" size="sm" className="w-full">
                  View all activity
                </Button>
              )}
            </div>
          ) : (
            <div className="text-center py-8">
              <Activity size={32} className="mx-auto text-gray-400 mb-4" />
              <p className="text-gray-600">No recent activity</p>
              <p className="text-sm text-gray-500">
                Activity will appear here when team members start collaborating
              </p>
            </div>
          )}
        </Card>

        {/* Online Members */}
        {onlineMembers.length > 0 && (
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Online Members ({onlineMembers.length})
            </h3>
            <div className="space-y-3">
              {onlineMembers.map((member) => (
                <div key={member.id} className="flex items-center space-x-3">
                  <div className="relative">
                    <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                      <span className="text-white text-sm font-medium">
                        {member.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-400 border-2 border-white rounded-full"></div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {member.name}
                    </p>
                    <p className="text-xs text-gray-500">
                      Active {formatTime(member.lastActive)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Workspace Info */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Workspace Info</h3>
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium text-gray-700">Visibility</p>
              <Badge variant={workspace.visibility === 'public' ? 'default' : 'secondary'}>
                {workspace.visibility}
              </Badge>
            </div>
            
            <div>
              <p className="text-sm font-medium text-gray-700">Created</p>
              <p className="text-sm text-gray-600">
                {new Date(workspace.createdAt).toLocaleDateString()}
              </p>
            </div>
            
            <div>
              <p className="text-sm font-medium text-gray-700">Last Updated</p>
              <p className="text-sm text-gray-600">
                {new Date(workspace.updatedAt).toLocaleDateString()}
              </p>
            </div>

            {workspace.description && (
              <div>
                <p className="text-sm font-medium text-gray-700">Description</p>
                <p className="text-sm text-gray-600">{workspace.description}</p>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

// Helper functions
function getActivityDescription(action: string): string {
  const descriptions: Record<string, string> = {
    'workspace_created': 'created the workspace',
    'member_added': 'joined the workspace',
    'member_removed': 'left the workspace',
    'content_created': 'created content',
    'content_updated': 'updated content',
    'session_started': 'started a session',
    'session_ended': 'ended a session',
    'integration_added': 'added an integration',
    'integration_configured': 'configured an integration',
    'workspace_settings_changed': 'updated workspace settings',
  };
  
  return descriptions[action] || 'performed an action';
}

function formatTime(timestamp: string): string {
  const now = new Date();
  const time = new Date(timestamp);
  const diffMs = now.getTime() - time.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  
  return time.toLocaleDateString();
}