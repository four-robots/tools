/**
 * Conflict Resolution Modal
 * 
 * Main interactive modal for conflict resolution with support for multiple merge
 * strategies, real-time collaboration, voting mechanisms, and AI-assisted suggestions.
 * Provides a comprehensive interface for users to resolve conflicts collaboratively.
 */

'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { DiffViewer } from './DiffViewer';
import { MergeInterface } from './MergeInterface';
import { ConflictParticipants } from './ConflictParticipants';
import { SolutionProposals } from './SolutionProposals';
import { ConflictMetrics } from './ConflictMetrics';
import { 
  Clock, 
  Users, 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  ArrowRight,
  Brain,
  GitMerge,
  MessageSquare,
  ThumbsUp,
  ThumbsDown,
  Lightbulb
} from 'lucide-react';

interface ConflictDetection {
  id: string;
  conflictType: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  complexityScore: number;
  canAutoResolve: boolean;
  recommendedStrategy: string;
  confidence: number;
  involvedUsers: string[];
  detectedAt: string;
  resolutionDeadline?: string;
  conflictRegions: Array<{
    start: number;
    end: number;
    type: string;
    description: string;
  }>;
  baseVersion: ContentVersion;
  versionA: ContentVersion;
  versionB: ContentVersion;
}

interface ContentVersion {
  id: string;
  content: string;
  userId: string;
  createdAt: string;
  contentType: string;
}

interface ResolutionSession {
  id: string;
  conflictId: string;
  moderatorId: string;
  participantIds: string[];
  observerIds: string[];
  status: string;
  currentStep: string;
  proposedSolutions: SolutionProposal[];
  settings: {
    allowVoting: boolean;
    requireUnanimous: boolean;
    votingTimeoutMs: number;
  };
  createdAt: string;
  expiresAt?: string;
}

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

interface MergeSuggestion {
  strategy: string;
  content: string;
  rationale: string;
  confidence: number;
  metadata: {
    processingTime: number;
    modelVersion: string;
  };
}

interface ConflictResolutionModalProps {
  isOpen: boolean;
  onClose: () => void;
  conflict: ConflictDetection;
  currentUserId: string;
  onResolutionComplete: (result: any) => void;
}

export const ConflictResolutionModal: React.FC<ConflictResolutionModalProps> = ({
  isOpen,
  onClose,
  conflict,
  currentUserId,
  onResolutionComplete
}) => {
  const { toast } = useToast();
  const wsRef = useRef<WebSocket | null>(null);
  
  // State management
  const [resolutionSession, setResolutionSession] = useState<ResolutionSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedStrategy, setSelectedStrategy] = useState<string>('');
  const [mergeSuggestions, setMergeSuggestions] = useState<MergeSuggestion[]>([]);
  const [isGeneratingSuggestions, setIsGeneratingSuggestions] = useState(false);
  const [currentUserRole, setCurrentUserRole] = useState<'moderator' | 'participant' | 'observer'>('participant');
  const [votingTimer, setVotingTimer] = useState<number>(0);
  const [resolutionProgress, setResolutionProgress] = useState(0);

  // Real-time WebSocket connection
  useEffect(() => {
    if (isOpen && conflict.id) {
      connectWebSocket();
      initializeResolutionSession();
    }
    
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [isOpen, conflict.id]);

  // Voting timer countdown
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (votingTimer > 0) {
      interval = setInterval(() => {
        setVotingTimer(prev => Math.max(0, prev - 1000));
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [votingTimer]);

  // WebSocket connection for real-time updates
  const connectWebSocket = useCallback(() => {
    if (wsRef.current) return;

    const token = localStorage.getItem('auth_token');
    const wsUrl = `${process.env.NEXT_PUBLIC_WS_URL}/collaboration?token=${token}`;
    
    wsRef.current = new WebSocket(wsUrl);

    wsRef.current.onopen = () => {
      console.log('Connected to conflict resolution WebSocket');
      // Join the conflict resolution room
      wsRef.current?.send(JSON.stringify({
        type: 'join',
        sessionId: conflict.id,
        data: { conflictId: conflict.id, role: currentUserRole }
      }));
    };

    wsRef.current.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        handleRealtimeUpdate(message);
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };

    wsRef.current.onerror = (error) => {
      console.error('WebSocket error:', error);
      toast({
        title: 'Connection Error',
        description: 'Lost connection to real-time updates. Some features may be unavailable.',
        variant: 'destructive'
      });
    };

    wsRef.current.onclose = () => {
      console.log('WebSocket connection closed');
      // Attempt to reconnect after a delay
      setTimeout(() => {
        if (isOpen) connectWebSocket();
      }, 3000);
    };
  }, [isOpen, conflict.id, currentUserRole, toast]);

  // Handle real-time updates from WebSocket
  const handleRealtimeUpdate = useCallback((message: any) => {
    if (message.data?.conflictResolution) {
      const notification = message.data.conflictResolution;
      
      switch (notification.type) {
        case 'conflict_resolution_started':
          setResolutionSession(notification.data);
          setActiveTab('collaboration');
          break;

        case 'conflict_solution_proposed':
          if (resolutionSession) {
            const updatedSolutions = [...resolutionSession.proposedSolutions, notification.data.solution];
            setResolutionSession({
              ...resolutionSession,
              proposedSolutions: updatedSolutions
            });
          }
          toast({
            title: 'New Solution Proposed',
            description: `${notification.data.proposerName} proposed a ${notification.data.strategy} solution.`
          });
          break;

        case 'conflict_vote_cast':
          if (resolutionSession) {
            const updatedSolutions = resolutionSession.proposedSolutions.map(sol => 
              sol.id === notification.data.solutionId 
                ? { ...sol, votes: [...sol.votes, notification.data.vote] }
                : sol
            );
            setResolutionSession({
              ...resolutionSession,
              proposedSolutions: updatedSolutions
            });
          }
          setVotingTimer(notification.data.votingDeadline ? 
            new Date(notification.data.votingDeadline).getTime() - Date.now() : 0);
          break;

        case 'conflict_resolution_completed':
          handleResolutionComplete(notification.data);
          break;

        case 'conflict_auto_resolved':
          setResolutionProgress(100);
          toast({
            title: 'Conflict Auto-Resolved',
            description: `Conflict resolved using ${notification.data.strategy} with ${Math.round(notification.data.confidence * 100)}% confidence.`,
            variant: 'default'
          });
          setTimeout(() => {
            onResolutionComplete(notification.data);
          }, 2000);
          break;
      }
    }
  }, [resolutionSession, toast, onResolutionComplete]);

  // Initialize resolution session
  const initializeResolutionSession = async () => {
    setLoading(true);
    try {
      // Check if a resolution session already exists
      const response = await fetch(`/api/conflicts/${conflict.id}/resolution-session`);
      
      if (response.ok) {
        const session = await response.json();
        setResolutionSession(session);
        
        // Determine user role
        if (session.moderatorId === currentUserId) {
          setCurrentUserRole('moderator');
        } else if (session.participantIds.includes(currentUserId)) {
          setCurrentUserRole('participant');
        } else {
          setCurrentUserRole('observer');
        }
      } else {
        // No session exists, check if user can start one
        if (conflict.involvedUsers.includes(currentUserId)) {
          setCurrentUserRole('participant');
        }
      }

      // Generate AI suggestions if applicable
      if (conflict.canAutoResolve || conflict.confidence > 0.7) {
        await generateAISuggestions();
      }

    } catch (error) {
      console.error('Failed to initialize resolution session:', error);
      toast({
        title: 'Initialization Error',
        description: 'Failed to load conflict resolution data.',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  // Generate AI-powered merge suggestions
  const generateAISuggestions = async () => {
    if (isGeneratingSuggestions) return;
    
    setIsGeneratingSuggestions(true);
    try {
      const response = await fetch(`/api/conflicts/${conflict.id}/ai-suggestions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contentType: conflict.baseVersion.contentType,
          conflictType: conflict.conflictType
        })
      });

      if (response.ok) {
        const suggestions = await response.json();
        setMergeSuggestions(suggestions);
        
        if (suggestions.length > 0) {
          toast({
            title: 'AI Suggestions Ready',
            description: `Generated ${suggestions.length} intelligent merge suggestions.`
          });
        }
      }
    } catch (error) {
      console.error('Failed to generate AI suggestions:', error);
    } finally {
      setIsGeneratingSuggestions(false);
    }
  };

  // Start resolution session
  const startResolutionSession = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/conflicts/${conflict.id}/start-resolution`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          moderatorId: currentUserId
        })
      });

      if (response.ok) {
        const session = await response.json();
        setResolutionSession(session);
        setCurrentUserRole('moderator');
        setActiveTab('collaboration');
        
        toast({
          title: 'Resolution Session Started',
          description: 'Collaborative resolution session is now active.'
        });
      } else {
        throw new Error('Failed to start resolution session');
      }
    } catch (error) {
      console.error('Failed to start resolution session:', error);
      toast({
        title: 'Start Session Error',
        description: 'Failed to start the resolution session.',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  // Propose a solution
  const proposeSolution = async (strategy: string, content: string, rationale: string) => {
    if (!resolutionSession) return;

    try {
      const response = await fetch(`/api/conflicts/${conflict.id}/propose-solution`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sessionId: resolutionSession.id,
          strategy,
          content,
          rationale
        })
      });

      if (response.ok) {
        const result = await response.json();
        toast({
          title: 'Solution Proposed',
          description: 'Your solution has been submitted for review.'
        });
        return result.solutionId;
      }
    } catch (error) {
      console.error('Failed to propose solution:', error);
      toast({
        title: 'Proposal Error',
        description: 'Failed to submit your solution proposal.',
        variant: 'destructive'
      });
    }
  };

  // Cast a vote on a solution
  const castVote = async (solutionId: string, vote: 'approve' | 'reject' | 'abstain', comment?: string) => {
    if (!resolutionSession) return;

    try {
      const response = await fetch(`/api/conflicts/${conflict.id}/vote`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sessionId: resolutionSession.id,
          solutionId,
          vote,
          comment
        })
      });

      if (response.ok) {
        toast({
          title: 'Vote Cast',
          description: `You voted to ${vote} this solution.`
        });
      }
    } catch (error) {
      console.error('Failed to cast vote:', error);
      toast({
        title: 'Voting Error',
        description: 'Failed to submit your vote.',
        variant: 'destructive'
      });
    }
  };

  // Auto-resolve using recommended strategy
  const autoResolve = async () => {
    setLoading(true);
    setResolutionProgress(0);

    try {
      const response = await fetch(`/api/conflicts/${conflict.id}/auto-resolve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          strategy: conflict.recommendedStrategy
        })
      });

      if (response.ok) {
        const result = await response.json();
        
        // Simulate progress for user feedback
        const progressInterval = setInterval(() => {
          setResolutionProgress(prev => {
            if (prev >= 90) {
              clearInterval(progressInterval);
              return 100;
            }
            return prev + 10;
          });
        }, 200);

        setTimeout(() => {
          handleResolutionComplete(result);
        }, 2500);
      }
    } catch (error) {
      console.error('Auto-resolution failed:', error);
      toast({
        title: 'Auto-Resolution Failed',
        description: 'Automatic resolution failed. Manual intervention required.',
        variant: 'destructive'
      });
      setResolutionProgress(0);
    } finally {
      setLoading(false);
    }
  };

  // Handle resolution completion
  const handleResolutionComplete = (result: any) => {
    toast({
      title: 'Conflict Resolved',
      description: `Successfully resolved using ${result.strategy} with ${Math.round(result.confidence * 100)}% confidence.`
    });
    
    setTimeout(() => {
      onResolutionComplete(result);
      onClose();
    }, 1500);
  };

  // Get severity color and icon
  const getSeverityDisplay = (severity: string) => {
    const displays = {
      low: { color: 'bg-green-100 text-green-800', icon: CheckCircle },
      medium: { color: 'bg-yellow-100 text-yellow-800', icon: AlertTriangle },
      high: { color: 'bg-orange-100 text-orange-800', icon: AlertTriangle },
      critical: { color: 'bg-red-100 text-red-800', icon: XCircle }
    };
    return displays[severity as keyof typeof displays] || displays.medium;
  };

  const severityDisplay = getSeverityDisplay(conflict.severity);
  const SeverityIcon = severityDisplay.icon;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitMerge className="w-5 h-5" />
            Conflict Resolution
            <Badge className={`ml-2 ${severityDisplay.color}`}>
              <SeverityIcon className="w-3 h-3 mr-1" />
              {conflict.severity.toUpperCase()}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            Resolve conflicts in {conflict.baseVersion.contentType} content with intelligent merge strategies
          </DialogDescription>
        </DialogHeader>

        {loading && resolutionProgress > 0 && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Resolving conflict...</span>
              <span className="text-sm text-gray-500">{resolutionProgress}%</span>
            </div>
            <Progress value={resolutionProgress} className="w-full" />
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="diff">Differences</TabsTrigger>
            <TabsTrigger value="merge">Merge</TabsTrigger>
            <TabsTrigger value="collaboration">Collaboration</TabsTrigger>
            <TabsTrigger value="ai-assist">AI Assist</TabsTrigger>
          </TabsList>

          <div className="mt-4 h-[60vh] overflow-y-auto">
            <TabsContent value="overview" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Conflict Type</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-lg font-semibold">{conflict.conflictType.replace('_', ' ')}</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Complexity Score</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2">
                      <Progress value={conflict.complexityScore * 100} className="flex-1" />
                      <span className="text-sm">{Math.round(conflict.complexityScore * 100)}%</span>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Auto-Resolve</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2">
                      {conflict.canAutoResolve ? (
                        <CheckCircle className="w-4 h-4 text-green-600" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-600" />
                      )}
                      <span className="text-sm">
                        {conflict.canAutoResolve ? 'Available' : 'Manual Required'}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {conflict.canAutoResolve && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Brain className="w-5 h-5" />
                      Recommended Auto-Resolution
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{conflict.recommendedStrategy.replace('_', ' ')}</p>
                        <p className="text-sm text-gray-600">
                          Confidence: {Math.round(conflict.confidence * 100)}%
                        </p>
                      </div>
                      <Button 
                        onClick={autoResolve}
                        disabled={loading}
                        className="flex items-center gap-2"
                      >
                        <CheckCircle className="w-4 h-4" />
                        Auto-Resolve
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              <ConflictMetrics conflict={conflict} />
            </TabsContent>

            <TabsContent value="diff" className="space-y-4">
              <DiffViewer 
                baseContent={conflict.baseVersion.content}
                versionA={conflict.versionA}
                versionB={conflict.versionB}
                conflictRegions={conflict.conflictRegions}
              />
            </TabsContent>

            <TabsContent value="merge" className="space-y-4">
              <MergeInterface
                conflict={conflict}
                onStrategySelect={setSelectedStrategy}
                onMergePropose={proposeSolution}
                disabled={currentUserRole === 'observer'}
              />
            </TabsContent>

            <TabsContent value="collaboration" className="space-y-4">
              {resolutionSession ? (
                <div className="space-y-4">
                  <ConflictParticipants
                    session={resolutionSession}
                    currentUserId={currentUserId}
                    currentUserRole={currentUserRole}
                  />
                  
                  <SolutionProposals
                    solutions={resolutionSession.proposedSolutions}
                    currentUserId={currentUserId}
                    canVote={currentUserRole !== 'observer' && resolutionSession.settings.allowVoting}
                    onVote={castVote}
                    votingTimer={votingTimer}
                  />
                </div>
              ) : (
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-center space-y-4">
                      <Users className="w-12 h-12 mx-auto text-gray-400" />
                      <h3 className="text-lg font-semibold">No Active Resolution Session</h3>
                      <p className="text-gray-600">
                        Start a collaborative resolution session to work with other participants.
                      </p>
                      {conflict.involvedUsers.includes(currentUserId) && (
                        <Button onClick={startResolutionSession} disabled={loading}>
                          Start Resolution Session
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="ai-assist" className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Brain className="w-5 h-5" />
                  AI-Powered Suggestions
                </h3>
                <Button 
                  onClick={generateAISuggestions}
                  disabled={isGeneratingSuggestions}
                  variant="outline"
                >
                  {isGeneratingSuggestions ? (
                    <>Generating...</>
                  ) : (
                    <>
                      <Lightbulb className="w-4 h-4 mr-2" />
                      Generate Suggestions
                    </>
                  )}
                </Button>
              </div>

              {mergeSuggestions.length > 0 ? (
                <div className="space-y-4">
                  {mergeSuggestions.map((suggestion, index) => (
                    <Card key={index}>
                      <CardHeader>
                        <CardTitle className="flex items-center justify-between">
                          <span>{suggestion.strategy.replace('_', ' ')}</span>
                          <Badge variant="secondary">
                            {Math.round(suggestion.confidence * 100)}% confidence
                          </Badge>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <p className="text-sm text-gray-600">{suggestion.rationale}</p>
                        <div className="bg-gray-50 p-3 rounded text-sm font-mono">
                          {suggestion.content.substring(0, 200)}
                          {suggestion.content.length > 200 && '...'}
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="text-xs text-gray-500">
                            Model: {suggestion.metadata.modelVersion} • 
                            Time: {suggestion.metadata.processingTime}ms
                          </div>
                          <Button 
                            size="sm"
                            onClick={() => proposeSolution(suggestion.strategy, suggestion.content, suggestion.rationale)}
                            disabled={currentUserRole === 'observer' || !resolutionSession}
                          >
                            Use This Suggestion
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-center space-y-4">
                      <Brain className="w-12 h-12 mx-auto text-gray-400" />
                      <h4 className="text-lg font-semibold">AI Suggestions</h4>
                      <p className="text-gray-600">
                        Generate intelligent merge suggestions using advanced AI analysis.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </div>
        </Tabs>

        <div className="flex items-center justify-between pt-4 border-t">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Clock className="w-4 h-4" />
            {conflict.resolutionDeadline ? (
              <>Deadline: {new Date(conflict.resolutionDeadline).toLocaleString()}</>
            ) : (
              <>Detected: {new Date(conflict.detectedAt).toLocaleString()}</>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
            {resolutionSession && currentUserRole === 'moderator' && (
              <Button 
                onClick={() => {/* Implement manual finalization */}}
                disabled={loading}
              >
                Finalize Resolution
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};