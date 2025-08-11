"use client"

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Settings, Users, Activity, MessageSquare, FileText, Database, Grid3x3 } from 'lucide-react';
import { WorkspaceLayout } from '@/components/workspace/WorkspaceLayout';

interface WorkspaceData {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'archived';
  role: 'owner' | 'admin' | 'member' | 'viewer';
  memberCount: number;
  createdAt: string;
  lastActivity: string;
}

interface RecentActivity {
  id: string;
  type: 'board_created' | 'page_updated' | 'memory_added' | 'member_joined';
  description: string;
  user: string;
  timestamp: string;
}

export default function WorkspaceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const workspaceId = params.id as string;
  
  const [workspace, setWorkspace] = useState<WorkspaceData | null>(null);
  const [activities, setActivities] = useState<RecentActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Mock data for demonstration
    setTimeout(() => {
      setWorkspace({
        id: workspaceId,
        name: 'Product Development',
        description: 'Main workspace for product development team collaboration',
        status: 'active',
        role: 'admin',
        memberCount: 12,
        createdAt: '2024-01-15T10:00:00Z',
        lastActivity: '2 hours ago'
      });

      setActivities([
        {
          id: '1',
          type: 'board_created',
          description: 'Created new Kanban board "Sprint Planning"',
          user: 'Sarah Johnson',
          timestamp: '2 hours ago'
        },
        {
          id: '2',
          type: 'page_updated',
          description: 'Updated wiki page "API Documentation"',
          user: 'Mike Chen',
          timestamp: '4 hours ago'
        },
        {
          id: '3',
          type: 'memory_added',
          description: 'Added new memory node "User Feedback Analysis"',
          user: 'Emily Davis',
          timestamp: '1 day ago'
        },
        {
          id: '4',
          type: 'member_joined',
          description: 'Joined the workspace',
          user: 'Alex Rodriguez',
          timestamp: '2 days ago'
        }
      ]);

      setLoading(false);
    }, 1000);
  }, [workspaceId]);

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/3 mb-6"></div>
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <div className="h-64 bg-gray-200 rounded-lg"></div>
            </div>
            <div className="h-64 bg-gray-200 rounded-lg"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !workspace) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-red-800 mb-2">Error Loading Workspace</h2>
          <p className="text-red-600">{error || 'Workspace not found'}</p>
          <button
            onClick={() => router.push('/workspaces')}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Back to Workspaces
          </button>
        </div>
      </div>
    );
  }

  return (
    <WorkspaceLayout workspaceId={workspaceId}>
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => router.push('/workspaces')}
              className="flex items-center text-gray-600 hover:text-gray-900"
            >
              <ArrowLeft className="w-5 h-5 mr-2" />
              Back to Workspaces
            </button>
          </div>
          <div className="flex items-center space-x-2">
            <button className="flex items-center px-4 py-2 text-gray-600 hover:text-gray-900">
              <Users className="w-5 h-5 mr-2" />
              Manage Members
            </button>
            <button className="flex items-center px-4 py-2 text-gray-600 hover:text-gray-900">
              <Settings className="w-5 h-5 mr-2" />
              Settings
            </button>
          </div>
        </div>

        {/* Workspace Info */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-8">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">{workspace.name}</h1>
              <p className="text-gray-600 mb-4">{workspace.description}</p>
              <div className="flex items-center space-x-6 text-sm text-gray-500">
                <div className="flex items-center">
                  <Users className="w-4 h-4 mr-1" />
                  {workspace.memberCount} members
                </div>
                <div className="flex items-center">
                  <Activity className="w-4 h-4 mr-1" />
                  Last activity {workspace.lastActivity}
                </div>
                <div>
                  Created {new Date(workspace.createdAt).toLocaleDateString()}
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <span className="px-3 py-1 text-sm font-medium text-blue-800 bg-blue-100 rounded-full">
                {workspace.role}
              </span>
              <span className="px-3 py-1 text-sm font-medium text-green-800 bg-green-100 rounded-full">
                {workspace.status}
              </span>
            </div>
          </div>
        </div>

        <div className="grid gap-8 lg:grid-cols-3">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-8">
            {/* Quick Actions */}
            <section className="bg-white rounded-lg border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <button className="flex items-center p-4 text-left border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-colors">
                  <Grid3x3 className="w-8 h-8 text-blue-600 mr-3" />
                  <div>
                    <h3 className="font-medium text-gray-900">Kanban Boards</h3>
                    <p className="text-sm text-gray-600">Manage tasks and workflows</p>
                  </div>
                </button>
                <button className="flex items-center p-4 text-left border border-gray-200 rounded-lg hover:border-green-300 hover:bg-green-50 transition-colors">
                  <FileText className="w-8 h-8 text-green-600 mr-3" />
                  <div>
                    <h3 className="font-medium text-gray-900">Wiki Pages</h3>
                    <p className="text-sm text-gray-600">Document knowledge and processes</p>
                  </div>
                </button>
                <button className="flex items-center p-4 text-left border border-gray-200 rounded-lg hover:border-purple-300 hover:bg-purple-50 transition-colors">
                  <Database className="w-8 h-8 text-purple-600 mr-3" />
                  <div>
                    <h3 className="font-medium text-gray-900">Memory Graph</h3>
                    <p className="text-sm text-gray-600">Explore connected insights</p>
                  </div>
                </button>
                <button className="flex items-center p-4 text-left border border-gray-200 rounded-lg hover:border-yellow-300 hover:bg-yellow-50 transition-colors">
                  <MessageSquare className="w-8 h-8 text-yellow-600 mr-3" />
                  <div>
                    <h3 className="font-medium text-gray-900">Discussions</h3>
                    <p className="text-sm text-gray-600">Team conversations</p>
                  </div>
                </button>
              </div>
            </section>

            {/* Workspace Statistics */}
            <section className="bg-white rounded-lg border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Workspace Overview</h2>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="text-center p-4 bg-blue-50 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">8</div>
                  <div className="text-sm text-gray-600">Active Boards</div>
                </div>
                <div className="text-center p-4 bg-green-50 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">24</div>
                  <div className="text-sm text-gray-600">Wiki Pages</div>
                </div>
                <div className="text-center p-4 bg-purple-50 rounded-lg">
                  <div className="text-2xl font-bold text-purple-600">156</div>
                  <div className="text-sm text-gray-600">Memory Nodes</div>
                </div>
              </div>
            </section>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Recent Activity */}
            <section className="bg-white rounded-lg border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                <Activity className="w-5 h-5 mr-2" />
                Recent Activity
              </h2>
              <div className="space-y-4">
                {activities.map((activity) => (
                  <div key={activity.id} className="flex items-start space-x-3">
                    <div className="flex-shrink-0 w-2 h-2 bg-blue-600 rounded-full mt-2"></div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900">{activity.description}</p>
                      <p className="text-xs text-gray-500">
                        {activity.user} • {activity.timestamp}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Active Members */}
            <section className="bg-white rounded-lg border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                <Users className="w-5 h-5 mr-2" />
                Active Members
              </h2>
              <div className="space-y-3">
                {['Sarah Johnson', 'Mike Chen', 'Emily Davis', 'Alex Rodriguez'].map((name, index) => (
                  <div key={index} className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-gradient-to-br from-blue-400 to-purple-600 rounded-full flex items-center justify-center text-white text-sm font-medium">
                      {name.split(' ').map(n => n[0]).join('')}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">{name}</p>
                    </div>
                    <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>
    </WorkspaceLayout>
  );
}