"use client"

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Users, Activity, Settings, Archive } from 'lucide-react';

interface Workspace {
  id: string;
  name: string;
  description?: string;
  status: 'active' | 'archived';
  memberCount: number;
  lastActivity: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  createdAt: string;
}

export default function WorkspacesPage() {
  const router = useRouter();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Mock data for demonstration
    // In a real app, this would fetch from the API
    setTimeout(() => {
      setWorkspaces([
        {
          id: '1',
          name: 'Product Development',
          description: 'Main workspace for product development team',
          status: 'active',
          memberCount: 12,
          lastActivity: '2 hours ago',
          role: 'owner',
          createdAt: '2024-01-15T10:00:00Z'
        },
        {
          id: '2',
          name: 'Marketing Campaign',
          description: 'Q1 2024 marketing initiatives',
          status: 'active',
          memberCount: 6,
          lastActivity: '1 day ago',
          role: 'admin',
          createdAt: '2024-02-01T10:00:00Z'
        },
        {
          id: '3',
          name: 'Research Project',
          description: 'User experience research and insights',
          status: 'archived',
          memberCount: 4,
          lastActivity: '2 weeks ago',
          role: 'member',
          createdAt: '2024-01-05T10:00:00Z'
        }
      ]);
      setLoading(false);
    }, 1000);
  }, []);

  const handleCreateWorkspace = () => {
    router.push('/workspaces/new');
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-48 bg-gray-200 rounded-lg"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-red-800 mb-2">Error Loading Workspaces</h2>
          <p className="text-red-600">{error}</p>
        </div>
      </div>
    );
  }

  const activeWorkspaces = workspaces.filter(w => w.status === 'active');
  const archivedWorkspaces = workspaces.filter(w => w.status === 'archived');

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Workspaces</h1>
          <p className="text-gray-600 mt-2">Collaborate with your team in shared workspaces</p>
        </div>
        <button
          onClick={handleCreateWorkspace}
          className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-5 h-5 mr-2" />
          New Workspace
        </button>
      </div>

      {activeWorkspaces.length === 0 && archivedWorkspaces.length === 0 ? (
        <div className="text-center py-12">
          <div className="mx-auto w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mb-4">
            <Users className="w-12 h-12 text-gray-400" />
          </div>
          <h3 className="text-xl font-medium text-gray-900 mb-2">No workspaces yet</h3>
          <p className="text-gray-600 mb-6">Create your first workspace to start collaborating with your team</p>
          <button
            onClick={handleCreateWorkspace}
            className="inline-flex items-center px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-5 h-5 mr-2" />
            Create Workspace
          </button>
        </div>
      ) : (
        <div className="space-y-8">
          {activeWorkspaces.length > 0 && (
            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Active Workspaces</h2>
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {activeWorkspaces.map((workspace) => (
                  <WorkspaceCard key={workspace.id} workspace={workspace} />
                ))}
              </div>
            </section>
          )}

          {archivedWorkspaces.length > 0 && (
            <section>
              <h2 className="text-xl font-semibold text-gray-500 mb-4 flex items-center">
                <Archive className="w-5 h-5 mr-2" />
                Archived Workspaces
              </h2>
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {archivedWorkspaces.map((workspace) => (
                  <WorkspaceCard key={workspace.id} workspace={workspace} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

interface WorkspaceCardProps {
  workspace: Workspace;
}

function WorkspaceCard({ workspace }: WorkspaceCardProps) {
  const getRoleColor = (role: string) => {
    switch (role) {
      case 'owner':
        return 'bg-purple-100 text-purple-800';
      case 'admin':
        return 'bg-blue-100 text-blue-800';
      case 'member':
        return 'bg-green-100 text-green-800';
      case 'viewer':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <Link href={`/workspaces/${workspace.id}`}>
      <div className={`border rounded-lg p-6 hover:shadow-md transition-shadow cursor-pointer ${
        workspace.status === 'archived' ? 'bg-gray-50 border-gray-200' : 'bg-white border-gray-200 hover:border-blue-300'
      }`}>
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <h3 className={`text-lg font-semibold mb-2 ${
              workspace.status === 'archived' ? 'text-gray-600' : 'text-gray-900'
            }`}>
              {workspace.name}
            </h3>
            {workspace.description && (
              <p className={`text-sm ${workspace.status === 'archived' ? 'text-gray-500' : 'text-gray-600'}`}>
                {workspace.description}
              </p>
            )}
          </div>
          <span className={`px-2 py-1 text-xs font-medium rounded-full capitalize ${getRoleColor(workspace.role)}`}>
            {workspace.role}
          </span>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center text-gray-500">
              <Users className="w-4 h-4 mr-1" />
              <span>{workspace.memberCount} members</span>
            </div>
            <div className="flex items-center text-gray-500">
              <Activity className="w-4 h-4 mr-1" />
              <span>{workspace.lastActivity}</span>
            </div>
          </div>

          {workspace.status === 'archived' && (
            <div className="flex items-center text-sm text-gray-500">
              <Archive className="w-4 h-4 mr-1" />
              <span>Archived</span>
            </div>
          )}
        </div>

        <div className="mt-4 pt-4 border-t border-gray-100">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">
              Created {new Date(workspace.createdAt).toLocaleDateString()}
            </span>
            <div className="flex items-center space-x-2">
              <Settings className="w-4 h-4 text-gray-400 hover:text-gray-600" />
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}