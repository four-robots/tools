'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Settings, Save } from 'lucide-react';
import type { CollaborativeWorkspace } from '@shared/types/workspace';

interface WorkspaceSettingsProps {
  workspace: CollaborativeWorkspace;
  onWorkspaceUpdated: () => void;
  onSettingsChanged: (setting: string, value: any) => void;
}

export function WorkspaceSettings({ workspace, onWorkspaceUpdated, onSettingsChanged }: WorkspaceSettingsProps) {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Settings</h2>
        <Button>
          <Save size={16} className="mr-2" />
          Save Changes
        </Button>
      </div>

      <Card className="p-6">
        <div className="text-center py-12">
          <Settings size={48} className="mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Workspace Settings</h3>
          <p className="text-gray-600 mb-6">
            Configure workspace settings, permissions, and integrations.
          </p>
          <div className="text-sm text-gray-500">
            <p>Current workspace: {workspace.name}</p>
            <p>Visibility: {workspace.visibility}</p>
            <p>Members: {workspace.currentMembers}</p>
          </div>
        </div>
      </Card>
    </div>
  );
}