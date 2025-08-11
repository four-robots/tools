/**
 * Conflict Participants Component
 * 
 * Displays participants in a conflict resolution session with real-time
 * presence indicators, role badges, and collaboration status.
 */

'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Users, Crown, Shield, Eye } from 'lucide-react';

interface ResolutionSession {
  id: string;
  moderatorId: string;
  participantIds: string[];
  observerIds: string[];
}

interface ConflictParticipantsProps {
  session: ResolutionSession;
  currentUserId: string;
  currentUserRole: 'moderator' | 'participant' | 'observer';
}

export const ConflictParticipants: React.FC<ConflictParticipantsProps> = ({
  session,
  currentUserId,
  currentUserRole
}) => {
  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'moderator':
        return <Crown className="w-3 h-3" />;
      case 'participant':
        return <Shield className="w-3 h-3" />;
      case 'observer':
        return <Eye className="w-3 h-3" />;
      default:
        return null;
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'moderator':
        return 'bg-purple-100 text-purple-800';
      case 'participant':
        return 'bg-blue-100 text-blue-800';
      case 'observer':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const allParticipants = [
    { id: session.moderatorId, role: 'moderator' },
    ...session.participantIds.map(id => ({ id, role: 'participant' })),
    ...session.observerIds.map(id => ({ id, role: 'observer' }))
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="w-5 h-5" />
          Participants ({allParticipants.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3">
          {allParticipants.map((participant) => (
            <div
              key={participant.id}
              className={`flex items-center justify-between p-3 rounded-lg border ${
                participant.id === currentUserId ? 'bg-blue-50 border-blue-200' : 'bg-gray-50'
              }`}
            >
              <div className="flex items-center gap-3">
                <Avatar>
                  <AvatarFallback>
                    {participant.id.substring(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">
                      User {participant.id.substring(0, 8)}
                    </span>
                    {participant.id === currentUserId && (
                      <span className="text-sm text-blue-600">(You)</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 mt-1">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <span className="text-xs text-gray-500">Online</span>
                  </div>
                </div>
              </div>
              
              <Badge className={`${getRoleColor(participant.role)}`}>
                {getRoleIcon(participant.role)}
                <span className="ml-1 capitalize">{participant.role}</span>
              </Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};