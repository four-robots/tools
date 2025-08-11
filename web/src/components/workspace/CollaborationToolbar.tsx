'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Users, 
  MessageCircle, 
  Share2, 
  Settings,
  Bell,
  MoreHorizontal,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MemberPresence } from './MemberPresence';

interface CollaborationToolbarProps {
  workspaceId: string;
  onlineMembers: any[];
  onInviteMembers?: () => void;
  onShareWorkspace?: () => void;
  onOpenSettings?: () => void;
}

export function CollaborationToolbar({ 
  workspaceId, 
  onlineMembers, 
  onInviteMembers,
  onShareWorkspace,
  onOpenSettings 
}: CollaborationToolbarProps) {
  const [showMembersPopover, setShowMembersPopover] = useState(false);

  return (
    <div className="flex items-center space-x-2">
      {/* Online members indicator */}
      <DropdownMenu open={showMembersPopover} onOpenChange={setShowMembersPopover}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="relative">
            <Users size={16} className="mr-1" />
            <span>{onlineMembers.length}</span>
            {onlineMembers.length > 0 && (
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-400 border-2 border-white rounded-full"></div>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <div className="p-3">
            <h4 className="font-medium text-sm mb-3">
              Online Members ({onlineMembers.length})
            </h4>
            <MemberPresence members={onlineMembers} showStatus={false} />
            {onlineMembers.length === 0 && (
              <p className="text-sm text-gray-500 text-center py-4">
                No one else is online
              </p>
            )}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Quick actions */}
      <Button variant="ghost" size="sm" onClick={onInviteMembers}>
        <Users size={16} className="mr-1" />
        Invite
      </Button>

      <Button variant="ghost" size="sm" onClick={onShareWorkspace}>
        <Share2 size={16} className="mr-1" />
        Share
      </Button>

      {/* More actions */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm">
            <MoreHorizontal size={16} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => {/* Open notifications */}}>
            <Bell size={16} className="mr-2" />
            Notifications
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onOpenSettings}>
            <Settings size={16} className="mr-2" />
            Settings
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}