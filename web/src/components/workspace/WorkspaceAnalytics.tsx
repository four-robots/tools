'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { BarChart3, TrendingUp } from 'lucide-react';
import type { CollaborativeWorkspace } from '@shared/types/workspace';

interface WorkspaceAnalyticsProps {
  workspaceId: string;
  workspace: CollaborativeWorkspace;
}

export function WorkspaceAnalytics({ workspaceId, workspace }: WorkspaceAnalyticsProps) {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Analytics</h2>
      </div>

      <Card className="p-6">
        <div className="text-center py-12">
          <BarChart3 size={48} className="mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Workspace Analytics</h3>
          <p className="text-gray-600 mb-6">
            Detailed analytics about workspace usage, member activity, and collaboration patterns.
          </p>
          <div className="text-sm text-gray-500">
            <p>Workspace: {workspace.name}</p>
            <p>Created: {new Date(workspace.createdAt).toLocaleDateString()}</p>
          </div>
        </div>
      </Card>
    </div>
  );
}