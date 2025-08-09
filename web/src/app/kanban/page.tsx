'use client';

import { useState } from 'react';
import { useKanbanBoards, useKanbanMutations } from '@/hooks/use-api';
import { usePageTracking, useInteractionTracking } from '@/hooks/use-analytics';
import { PageWrapper } from '@/components/PageWrapper';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { 
  Plus, 
  KanbanSquare, 
  Users, 
  Calendar,
  MoreHorizontal,
  Trash2,
  Edit3
} from 'lucide-react';
import Link from 'next/link';

function KanbanPageContent() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newBoardName, setNewBoardName] = useState('');
  const [newBoardDescription, setNewBoardDescription] = useState('');
  
  // Analytics tracking - wrapped in try-catch to prevent suspension
  try {
    usePageTracking('kanban_boards_list');
  } catch (error) {
    console.error('Analytics tracking failed:', error);
  }
  const { trackClick, trackFormSubmit } = useInteractionTracking();
  
  const { data: boardsData, isLoading, error } = useKanbanBoards();
  const { createBoard } = useKanbanMutations();

  const handleCreateBoard = async () => {
    if (!newBoardName.trim()) return;
    
    try {
      await createBoard.mutateAsync({
        name: newBoardName,
        description: newBoardDescription,
        columns: [
          { name: 'To Do', color: '#gray-500' },
          { name: 'In Progress', color: '#blue-500' },
          { name: 'Done', color: '#green-500' }
        ]
      });
      
      // Track successful board creation
      trackFormSubmit('create_board_form', 'kanban', true, {
        boardName: newBoardName,
        hasDescription: !!newBoardDescription.trim()
      });
      
      setNewBoardName('');
      setNewBoardDescription('');
      setIsCreateOpen(false);
    } catch (error) {
      // Track failed board creation
      trackFormSubmit('create_board_form', 'kanban', false, {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };

  const boards = boardsData?.data || [];

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <KanbanSquare className="w-12 h-12 text-blue-500 mx-auto mb-4 animate-pulse" />
          <p className="text-gray-600">Loading your kanban boards...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center mx-auto mb-4">
            <KanbanSquare className="w-6 h-6 text-red-600" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Failed to load boards</h2>
          <p className="text-gray-600 mb-4">There was an error loading your kanban boards.</p>
          <Button onClick={() => window.location.reload()}>
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <Link href="/dashboard" className="flex items-center text-gray-600 hover:text-gray-900 mr-6">
                <KanbanSquare className="w-8 h-8 mr-2" />
                <span className="font-semibold">Kanban Boards</span>
              </Link>
            </div>
            
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  New Board
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create New Board</DialogTitle>
                  <DialogDescription>
                    Create a new kanban board to organize your tasks and projects.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="boardName">Board Name</Label>
                    <Input
                      id="boardName"
                      placeholder="Enter board name"
                      value={newBoardName}
                      onChange={(e) => setNewBoardName(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="boardDescription">Description (optional)</Label>
                    <Input
                      id="boardDescription"
                      placeholder="Enter board description"
                      value={newBoardDescription}
                      onChange={(e) => setNewBoardDescription(e.target.value)}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                    Cancel
                  </Button>
                  <Button 
                    onClick={handleCreateBoard}
                    disabled={!newBoardName.trim() || createBoard.isPending}
                  >
                    {createBoard.isPending ? 'Creating...' : 'Create Board'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {boards.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-24 h-24 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-6">
              <KanbanSquare className="w-12 h-12 text-blue-500" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              No boards yet
            </h2>
            <p className="text-gray-600 mb-6 max-w-md mx-auto">
              Get started by creating your first kanban board to organize your tasks and projects.
            </p>
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                <Button size="lg">
                  <Plus className="w-5 h-5 mr-2" />
                  Create Your First Board
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create New Board</DialogTitle>
                  <DialogDescription>
                    Create a new kanban board to organize your tasks and projects.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="boardName">Board Name</Label>
                    <Input
                      id="boardName"
                      placeholder="Enter board name"
                      value={newBoardName}
                      onChange={(e) => setNewBoardName(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="boardDescription">Description (optional)</Label>
                    <Input
                      id="boardDescription"
                      placeholder="Enter board description"
                      value={newBoardDescription}
                      onChange={(e) => setNewBoardDescription(e.target.value)}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                    Cancel
                  </Button>
                  <Button 
                    onClick={handleCreateBoard}
                    disabled={!newBoardName.trim() || createBoard.isPending}
                  >
                    {createBoard.isPending ? 'Creating...' : 'Create Board'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {boards.map((board: any) => (
              <Link key={board.id} href={`/kanban/${board.id}`}>
                <Card className="hover:shadow-lg transition-shadow cursor-pointer group">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-lg group-hover:text-blue-600 transition-colors">
                          {board.name}
                        </CardTitle>
                        {board.description && (
                          <CardDescription className="mt-1">
                            {board.description}
                          </CardDescription>
                        )}
                      </div>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => {
                          e.preventDefault();
                          // Handle board menu actions
                        }}
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between text-sm text-gray-600">
                      <div className="flex items-center">
                        <Users className="w-4 h-4 mr-1" />
                        <span>{board.members?.length || 1} member{(board.members?.length || 1) > 1 ? 's' : ''}</span>
                      </div>
                      <div className="flex items-center">
                        <Calendar className="w-4 h-4 mr-1" />
                        <span>{board.cards?.length || 0} cards</span>
                      </div>
                    </div>
                    
                    {board.columns && (
                      <div className="flex space-x-2 mt-3">
                        {board.columns.slice(0, 3).map((column: any, index: number) => (
                          <div
                            key={index}
                            className="flex-1 h-2 rounded-full bg-gray-200"
                            style={{ backgroundColor: column.color + '20' }}
                          >
                            <div
                              className="h-full rounded-full"
                              style={{ 
                                backgroundColor: column.color,
                                width: `${Math.random() * 100}%` // Placeholder progress
                              }}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

export default function KanbanPage() {
  return (
    <PageWrapper>
      <KanbanPageContent />
    </PageWrapper>
  );
}