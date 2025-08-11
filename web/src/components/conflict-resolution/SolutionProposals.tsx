/**
 * Solution Proposals Component
 * 
 * Displays and manages solution proposals in conflict resolution sessions
 * with voting interface and real-time updates.
 */

'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { ThumbsUp, ThumbsDown, Minus, MessageSquare, Clock } from 'lucide-react';

interface SolutionProposal {
  id: string;
  userId: string;
  strategy: string;
  content: string;
  rationale: string;
  votes: Array<{
    userId: string;
    vote: 'approve' | 'reject' | 'abstain';
    timestamp: string;
    comment?: string;
  }>;
  createdAt: string;
}

interface SolutionProposalsProps {
  solutions: SolutionProposal[];
  currentUserId: string;
  canVote: boolean;
  onVote: (solutionId: string, vote: 'approve' | 'reject' | 'abstain', comment?: string) => Promise<void>;
  votingTimer?: number;
}

export const SolutionProposals: React.FC<SolutionProposalsProps> = ({
  solutions,
  currentUserId,
  canVote,
  onVote,
  votingTimer = 0
}) => {
  const [expandedSolutions, setExpandedSolutions] = useState<Set<string>>(new Set());
  const [voteComments, setVoteComments] = useState<Record<string, string>>({});
  const [votingInProgress, setVotingInProgress] = useState<Set<string>>(new Set());

  const toggleSolutionExpanded = (solutionId: string) => {
    const newExpanded = new Set(expandedSolutions);
    if (newExpanded.has(solutionId)) {
      newExpanded.delete(solutionId);
    } else {
      newExpanded.add(solutionId);
    }
    setExpandedSolutions(newExpanded);
  };

  const handleVote = async (solutionId: string, vote: 'approve' | 'reject' | 'abstain') => {
    const comment = voteComments[solutionId];
    setVotingInProgress(prev => new Set(prev).add(solutionId));
    
    try {
      await onVote(solutionId, vote, comment);
      setVoteComments(prev => ({ ...prev, [solutionId]: '' }));
    } catch (error) {
      console.error('Failed to cast vote:', error);
    } finally {
      setVotingInProgress(prev => {
        const newSet = new Set(prev);
        newSet.delete(solutionId);
        return newSet;
      });
    }
  };

  const getVoteSummary = (solution: SolutionProposal) => {
    const approvals = solution.votes.filter(v => v.vote === 'approve').length;
    const rejections = solution.votes.filter(v => v.vote === 'reject').length;
    const abstains = solution.votes.filter(v => v.vote === 'abstain').length;
    
    return { approvals, rejections, abstains, total: solution.votes.length };
  };

  const getUserVote = (solution: SolutionProposal) => {
    return solution.votes.find(v => v.userId === currentUserId);
  };

  const formatTimeRemaining = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  if (solutions.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center text-gray-500">
            No solutions proposed yet
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {votingTimer > 0 && (
        <Card className="border-orange-200">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-orange-500" />
                <span className="text-sm font-medium">Voting in progress</span>
              </div>
              <div className="text-sm text-orange-600">
                Time remaining: {formatTimeRemaining(votingTimer)}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {solutions.map((solution) => {
        const voteSummary = getVoteSummary(solution);
        const userVote = getUserVote(solution);
        const isExpanded = expandedSolutions.has(solution.id);
        const isVoting = votingInProgress.has(solution.id);
        
        return (
          <Card key={solution.id} className="overflow-hidden">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  Solution by User {solution.userId.substring(0, 8)}
                  <Badge variant="outline">{solution.strategy.replace('_', ' ')}</Badge>
                </CardTitle>
                
                <div className="flex items-center gap-2">
                  {voteSummary.total > 0 && (
                    <div className="flex items-center gap-1 text-sm text-gray-500">
                      <ThumbsUp className="w-3 h-3 text-green-600" />
                      <span>{voteSummary.approvals}</span>
                      <ThumbsDown className="w-3 h-3 text-red-600 ml-2" />
                      <span>{voteSummary.rejections}</span>
                      {voteSummary.abstains > 0 && (
                        <>
                          <Minus className="w-3 h-3 text-gray-600 ml-2" />
                          <span>{voteSummary.abstains}</span>
                        </>
                      )}
                    </div>
                  )}
                  
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleSolutionExpanded(solution.id)}
                  >
                    {isExpanded ? 'Collapse' : 'Expand'}
                  </Button>
                </div>
              </div>
              
              <p className="text-sm text-gray-600">{solution.rationale}</p>
            </CardHeader>
            
            <CardContent className="space-y-4">
              {/* Solution Content Preview */}
              <div className="bg-gray-50 rounded p-3">
                <div className="font-mono text-sm">
                  {isExpanded ? (
                    <pre className="whitespace-pre-wrap">{solution.content}</pre>
                  ) : (
                    <div>
                      {solution.content.split('\n').slice(0, 3).join('\n')}
                      {solution.content.split('\n').length > 3 && (
                        <span className="text-gray-500">... (click expand to see more)</span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Vote Progress */}
              {voteSummary.total > 0 && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Approval Rate</span>
                    <span>{Math.round((voteSummary.approvals / voteSummary.total) * 100)}%</span>
                  </div>
                  <Progress 
                    value={(voteSummary.approvals / voteSummary.total) * 100}
                    className="h-2"
                  />
                </div>
              )}

              {/* User's Vote Status */}
              {userVote && (
                <div className="bg-blue-50 border border-blue-200 rounded p-3">
                  <div className="flex items-center gap-2">
                    {userVote.vote === 'approve' && <ThumbsUp className="w-4 h-4 text-green-600" />}
                    {userVote.vote === 'reject' && <ThumbsDown className="w-4 h-4 text-red-600" />}
                    {userVote.vote === 'abstain' && <Minus className="w-4 h-4 text-gray-600" />}
                    <span className="text-sm">
                      You voted to <strong>{userVote.vote}</strong> this solution
                    </span>
                  </div>
                  {userVote.comment && (
                    <p className="text-sm text-gray-600 mt-2">{userVote.comment}</p>
                  )}
                </div>
              )}

              {/* Voting Interface */}
              {canVote && !userVote && (
                <div className="border-t pt-4">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleVote(solution.id, 'approve')}
                        disabled={isVoting}
                        className="flex items-center gap-1"
                      >
                        <ThumbsUp className="w-3 h-3" />
                        Approve
                      </Button>
                      
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleVote(solution.id, 'reject')}
                        disabled={isVoting}
                        className="flex items-center gap-1"
                      >
                        <ThumbsDown className="w-3 h-3" />
                        Reject
                      </Button>
                      
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleVote(solution.id, 'abstain')}
                        disabled={isVoting}
                        className="flex items-center gap-1"
                      >
                        <Minus className="w-3 h-3" />
                        Abstain
                      </Button>
                    </div>
                    
                    <Textarea
                      placeholder="Add a comment to your vote (optional)..."
                      value={voteComments[solution.id] || ''}
                      onChange={(e) => setVoteComments(prev => ({
                        ...prev,
                        [solution.id]: e.target.value
                      }))}
                      rows={2}
                      disabled={isVoting}
                    />
                  </div>
                </div>
              )}

              {/* Expanded: Show All Votes */}
              {isExpanded && solution.votes.length > 0 && (
                <div className="border-t pt-4">
                  <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <MessageSquare className="w-4 h-4" />
                    All Votes ({solution.votes.length})
                  </h4>
                  <div className="space-y-2">
                    {solution.votes.map((vote, index) => (
                      <div key={index} className="flex items-start justify-between p-2 bg-gray-50 rounded">
                        <div className="flex items-center gap-2">
                          {vote.vote === 'approve' && <ThumbsUp className="w-3 h-3 text-green-600" />}
                          {vote.vote === 'reject' && <ThumbsDown className="w-3 h-3 text-red-600" />}
                          {vote.vote === 'abstain' && <Minus className="w-3 h-3 text-gray-600" />}
                          <span className="text-sm font-medium">
                            User {vote.userId.substring(0, 8)}
                          </span>
                          <span className="text-xs text-gray-500">
                            {new Date(vote.timestamp).toLocaleString()}
                          </span>
                        </div>
                        {vote.comment && (
                          <div className="text-sm text-gray-600 max-w-xs">
                            "{vote.comment}"
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};