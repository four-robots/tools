'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { Activity, RefreshCw } from 'lucide-react';

interface ActivityFeedProps {
  workspaceId: string;
  realtimeActivities: any[];
}

export function ActivityFeed({ workspaceId, realtimeActivities }: ActivityFeedProps) {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Activity Feed</h2>
        <div className="flex items-center space-x-2 text-sm text-gray-500">
          <RefreshCw size={16} className="animate-spin" />
          <span>Live updates</span>
        </div>
      </div>

      <Card className="p-6">
        <div className="text-center py-12">
          <Activity size={48} className="mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Activity Feed</h3>
          <p className="text-gray-600 mb-6">
            Real-time activity feed showing all workspace interactions and updates.
          </p>
          {realtimeActivities.length > 0 && (
            <p className="text-sm text-blue-600">
              {realtimeActivities.length} live activities detected
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}