'use client';

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface OnlineMember {
  id: string;
  name: string;
  avatar?: string;
  sessionId: string;
  presenceData: {
    isOnline: boolean;
    isActive: boolean;
    lastSeen: string;
    currentTool?: string;
  };
  lastActive: string;
}

interface MemberPresenceProps {
  members: OnlineMember[];
  compact?: boolean;
  showStatus?: boolean;
}

export function MemberPresence({ members, compact = false, showStatus = true }: MemberPresenceProps) {
  if (members.length === 0) {
    return (
      <div className="text-center py-4">
        <p className="text-sm text-gray-500">No one else is online</p>
      </div>
    );
  }

  const getStatusColor = (member: OnlineMember) => {
    if (!member.presenceData.isOnline) return 'bg-gray-400';
    if (member.presenceData.isActive) return 'bg-green-400';
    return 'bg-yellow-400';
  };

  const getStatusText = (member: OnlineMember) => {
    if (!member.presenceData.isOnline) return 'Offline';
    if (member.presenceData.isActive) return 'Active';
    return 'Away';
  };

  const formatLastSeen = (timestamp: string) => {
    const now = new Date();
    const lastSeen = new Date(timestamp);
    const diffMs = now.getTime() - lastSeen.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'now';
    if (diffMins < 60) return `${diffMins}m ago`;
    return lastSeen.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (compact) {
    return (
      <div className="flex -space-x-2">
        {members.slice(0, 5).map((member) => (
          <TooltipProvider key={member.id}>
            <Tooltip>
              <TooltipTrigger>
                <div className="relative">
                  <div className="w-8 h-8 bg-blue-600 rounded-full border-2 border-white flex items-center justify-center">
                    {member.avatar ? (
                      <img 
                        src={member.avatar} 
                        alt={member.name}
                        className="w-full h-full rounded-full object-cover"
                      />
                    ) : (
                      <span className="text-white text-xs font-medium">
                        {member.name.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 border-2 border-white rounded-full ${getStatusColor(member)}`}></div>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <div className="text-center">
                  <p className="font-medium">{member.name}</p>
                  <p className="text-sm text-gray-300">{getStatusText(member)}</p>
                  <p className="text-xs text-gray-400">
                    Last seen {formatLastSeen(member.presenceData.lastSeen)}
                  </p>
                  {member.presenceData.currentTool && (
                    <p className="text-xs text-gray-400">
                      Using {member.presenceData.currentTool}
                    </p>
                  )}
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ))}
        {members.length > 5 && (
          <div className="w-8 h-8 bg-gray-200 rounded-full border-2 border-white flex items-center justify-center">
            <span className="text-gray-600 text-xs font-medium">
              +{members.length - 5}
            </span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {members.map((member) => (
        <div key={member.id} className="flex items-center space-x-3">
          <div className="relative flex-shrink-0">
            <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center">
              {member.avatar ? (
                <img 
                  src={member.avatar} 
                  alt={member.name}
                  className="w-full h-full rounded-full object-cover"
                />
              ) : (
                <span className="text-white text-sm font-medium">
                  {member.name.charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 border-2 border-white rounded-full ${getStatusColor(member)}`}></div>
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center space-x-2">
              <p className="text-sm font-medium text-gray-900 truncate">
                {member.name}
              </p>
              {showStatus && (
                <Badge 
                  variant={member.presenceData.isActive ? 'default' : 'secondary'}
                  className="text-xs"
                >
                  {getStatusText(member)}
                </Badge>
              )}
            </div>
            
            <div className="flex items-center space-x-2 text-xs text-gray-500">
              <span>Last seen {formatLastSeen(member.presenceData.lastSeen)}</span>
              {member.presenceData.currentTool && (
                <>
                  <span>•</span>
                  <span>Using {member.presenceData.currentTool}</span>
                </>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}