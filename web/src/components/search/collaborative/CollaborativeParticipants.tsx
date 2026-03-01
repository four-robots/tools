/**
 * CollaborativeParticipants Component
 * 
 * Displays and manages participants in a collaborative search session,
 * showing their roles, activity status, and current search context.
 */

import React, { useState, useCallback } from 'react';
import { 
  User, 
  Crown, 
  Shield, 
  Eye, 
  UserPlus, 
  MoreVertical,
  Search,
  Filter,
  MessageSquare,
  Clock
} from 'lucide-react';
import { Button } from '../../ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '../../ui/avatar';
import { Badge } from '../../ui/badge';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from '../../ui/dropdown-menu';
import { toast } from '../../ui/toast';
import styles from './CollaborativeParticipants.module.css';

export interface SearchSessionParticipant {
  id: string;
  user_id: string;
  role: 'searcher' | 'observer' | 'moderator';
  joined_at: string;
  last_search_at: string;
  is_active: boolean;
  current_query?: string;
  active_filters: Record<string, any>;
  selected_results: string[];
  search_query_count: number;
  filter_change_count: number;
  annotation_count: number;
  // User info (would be populated from user service)
  user_name?: string;
  user_email?: string;
  user_avatar?: string;
}

export interface CollaborativeParticipantsProps {
  participants: SearchSessionParticipant[];
  currentUserId: string;
  onInviteParticipant?: () => void;
  onUpdateParticipant?: (participantId: string, updates: Partial<SearchSessionParticipant>) => void;
  onRemoveParticipant?: (participantId: string) => void;
  className?: string;
}

export function CollaborativeParticipants({
  participants,
  currentUserId,
  onInviteParticipant,
  onUpdateParticipant,
  onRemoveParticipant,
  className = ''
}: CollaborativeParticipantsProps) {

  // ========================================================================
  // State Management
  // ========================================================================

  const [expandedParticipant, setExpandedParticipant] = useState<string | null>(null);

  // ========================================================================
  // Helper Functions
  // ========================================================================

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'moderator':
        return <Crown size={12} className={styles.roleIcon} />;
      case 'searcher':
        return <Search size={12} className={styles.roleIcon} />;
      case 'observer':
        return <Eye size={12} className={styles.roleIcon} />;
      default:
        return <User size={12} className={styles.roleIcon} />;
    }
  };

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'moderator':
        return 'destructive';
      case 'searcher':
        return 'default';
      case 'observer':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  const getActivityStatus = (participant: SearchSessionParticipant) => {
    if (!participant.is_active) return 'offline';
    
    const lastActivity = new Date(participant.last_search_at);
    const now = new Date();
    const timeDiff = now.getTime() - lastActivity.getTime();
    const minutesAgo = Math.floor(timeDiff / (1000 * 60));
    
    if (minutesAgo < 2) return 'active';
    if (minutesAgo < 10) return 'idle';
    return 'away';
  };

  const formatLastSeen = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const timeDiff = now.getTime() - date.getTime();
    const minutesAgo = Math.floor(timeDiff / (1000 * 60));
    
    if (minutesAgo < 1) return 'just now';
    if (minutesAgo < 60) return `${minutesAgo}m ago`;
    
    const hoursAgo = Math.floor(minutesAgo / 60);
    if (hoursAgo < 24) return `${hoursAgo}h ago`;
    
    const daysAgo = Math.floor(hoursAgo / 24);
    return `${daysAgo}d ago`;
  };

  const getUserInitials = (name?: string, email?: string) => {
    if (name) {
      return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    }
    if (email) {
      return email.slice(0, 2).toUpperCase();
    }
    return 'U';
  };

  // ========================================================================
  // Event Handlers
  // ========================================================================

  const handleInviteParticipant = useCallback(() => {
    onInviteParticipant?.();
  }, [onInviteParticipant]);

  const handleUpdateRole = useCallback(async (participantId: string, newRole: string) => {
    try {
      onUpdateParticipant?.(participantId, { role: newRole as any });
      toast({
        title: 'Role updated',
        description: `Participant role changed to ${newRole}`,
      });
    } catch (error) {
      toast({
        title: 'Failed to update role',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive'
      });
    }
  }, [onUpdateParticipant]);

  const handleRemoveParticipant = useCallback(async (participantId: string) => {
    if (!confirm('Are you sure you want to remove this participant?')) return;

    try {
      onRemoveParticipant?.(participantId);
      toast({
        title: 'Participant removed',
        description: 'Participant has been removed from the session',
      });
    } catch (error) {
      toast({
        title: 'Failed to remove participant',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive'
      });
    }
  }, [onRemoveParticipant]);

  const toggleParticipantDetails = useCallback((participantId: string) => {
    setExpandedParticipant(prev => prev === participantId ? null : participantId);
  }, []);

  // ========================================================================
  // Current User Logic
  // ========================================================================

  const currentParticipant = participants.find(p => p.user_id === currentUserId);
  const canModerate = currentParticipant?.role === 'moderator';

  // ========================================================================
  // Render
  // ========================================================================

  return (
    <div className={`${styles.participantsContainer} ${className}`}>
      {/* Header */}
      <div className={styles.participantsHeader}>
        <div className={styles.headerTitle}>
          <User size={16} />
          <span>Participants ({participants.length})</span>
        </div>
        
        {canModerate && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleInviteParticipant}
            className={styles.inviteButton}
            title="Invite participant"
          >
            <UserPlus size={14} />
          </Button>
        )}
      </div>

      {/* Participants List */}
      <div className={styles.participantsList}>
        {participants.map((participant) => {
          const isCurrentUser = participant.user_id === currentUserId;
          const activityStatus = getActivityStatus(participant);
          const isExpanded = expandedParticipant === participant.id;
          
          return (
            <div
              key={participant.id}
              className={`${styles.participantCard} ${isCurrentUser ? styles.currentUser : ''}`}
            >
              {/* Main Participant Info */}
              <div 
                className={styles.participantMain}
                onClick={() => toggleParticipantDetails(participant.id)}
              >
                {/* Avatar */}
                <div className={styles.avatarContainer}>
                  <Avatar className={styles.avatar}>
                    <AvatarImage 
                      src={participant.user_avatar} 
                      alt={participant.user_name || participant.user_email || 'User'} 
                    />
                    <AvatarFallback>
                      {getUserInitials(participant.user_name, participant.user_email)}
                    </AvatarFallback>
                  </Avatar>
                  
                  {/* Activity Status Indicator */}
                  <div className={`${styles.statusIndicator} ${styles[activityStatus]}`} />
                </div>

                {/* User Info */}
                <div className={styles.participantInfo}>
                  <div className={styles.participantName}>
                    {participant.user_name || participant.user_email || 'Anonymous'}
                    {isCurrentUser && <span className={styles.youLabel}>(You)</span>}
                  </div>
                  
                  <div className={styles.participantMeta}>
                    <Badge 
                      variant={getRoleBadgeVariant(participant.role)}
                      className={styles.roleBadge}
                    >
                      {getRoleIcon(participant.role)}
                      {participant.role}
                    </Badge>
                    
                    <span className={styles.lastSeen}>
                      {formatLastSeen(participant.last_search_at)}
                    </span>
                  </div>
                </div>

                {/* Actions Menu */}
                {canModerate && !isCurrentUser && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className={styles.actionsButton}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MoreVertical size={14} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem onClick={() => handleUpdateRole(participant.id, 'moderator')}>
                        <Crown size={14} className="mr-2" />
                        Make Moderator
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleUpdateRole(participant.id, 'searcher')}>
                        <Search size={14} className="mr-2" />
                        Make Searcher
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleUpdateRole(participant.id, 'observer')}>
                        <Eye size={14} className="mr-2" />
                        Make Observer
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem 
                        onClick={() => handleRemoveParticipant(participant.id)}
                        className="text-destructive"
                      >
                        Remove from Session
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>

              {/* Expanded Details */}
              {isExpanded && (
                <div className={styles.participantDetails}>
                  {/* Current Search Context */}
                  {participant.current_query && (
                    <div className={styles.detailSection}>
                      <div className={styles.detailLabel}>
                        <Search size={12} />
                        Current Query
                      </div>
                      <div className={styles.detailValue} title={participant.current_query}>
                        "{participant.current_query}"
                      </div>
                    </div>
                  )}

                  {/* Active Filters */}
                  {Object.keys(participant.active_filters).length > 0 && (
                    <div className={styles.detailSection}>
                      <div className={styles.detailLabel}>
                        <Filter size={12} />
                        Active Filters
                      </div>
                      <div className={styles.detailValue}>
                        {Object.keys(participant.active_filters).length} filters applied
                      </div>
                    </div>
                  )}

                  {/* Selected Results */}
                  {participant.selected_results.length > 0 && (
                    <div className={styles.detailSection}>
                      <div className={styles.detailLabel}>
                        <MessageSquare size={12} />
                        Selected Results
                      </div>
                      <div className={styles.detailValue}>
                        {participant.selected_results.length} results selected
                      </div>
                    </div>
                  )}

                  {/* Activity Stats */}
                  <div className={styles.activityStats}>
                    <div className={styles.statItem}>
                      <Search size={12} />
                      <span>{participant.search_query_count} searches</span>
                    </div>
                    <div className={styles.statItem}>
                      <Filter size={12} />
                      <span>{participant.filter_change_count} filter changes</span>
                    </div>
                    <div className={styles.statItem}>
                      <MessageSquare size={12} />
                      <span>{participant.annotation_count} annotations</span>
                    </div>
                  </div>

                  {/* Session Duration */}
                  <div className={styles.detailSection}>
                    <div className={styles.detailLabel}>
                      <Clock size={12} />
                      Joined
                    </div>
                    <div className={styles.detailValue}>
                      {formatLastSeen(participant.joined_at)}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Empty State */}
      {participants.length === 0 && (
        <div className={styles.emptyState}>
          <User size={32} className={styles.emptyIcon} />
          <p>No participants in this session</p>
          {canModerate && (
            <Button onClick={handleInviteParticipant} size="sm" variant="outline">
              <UserPlus size={14} className="mr-2" />
              Invite Someone
            </Button>
          )}
        </div>
      )}
    </div>
  );
}