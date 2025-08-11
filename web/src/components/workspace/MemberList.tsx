'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users, Plus } from 'lucide-react';

interface MemberListProps {
  workspaceId: string;
  currentUserId?: string;
}

export function MemberList({ workspaceId, currentUserId }: MemberListProps) {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Members</h2>
        <Button>
          <Plus size={16} className="mr-2" />
          Invite Members
        </Button>
      </div>

      <Card className="p-6">
        <div className="text-center py-12">
          <Users size={48} className="mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Member Management</h3>
          <p className="text-gray-600 mb-6">
            View and manage workspace members, their roles, and permissions.
          </p>
          <Button variant="outline">
            Coming Soon
          </Button>
        </div>
      </Card>
    </div>
  );
}