'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
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
  Target,
  Calendar,
  CheckSquare,
  Edit3,
  Trash2,
  Flag,
  Clock,
  TrendingUp,
  Users,
  AlertCircle
} from 'lucide-react';

export interface Milestone {
  id: string;
  name: string;
  description?: string;
  due_date?: string;
  position: number;
  color: string;
  is_completed: boolean;
  completion_date?: string;
  progress: number;
  assigned_cards: number;
  completed_cards: number;
  created_at: string;
  updated_at: string;
}

interface MilestoneManagerProps {
  boardId: string;
  milestones: Milestone[];
  onCreateMilestone: (milestone: Omit<Milestone, 'id' | 'created_at' | 'updated_at' | 'progress' | 'assigned_cards' | 'completed_cards'>) => void;
  onUpdateMilestone: (milestoneId: string, updates: Partial<Milestone>) => void;
  onDeleteMilestone: (milestoneId: string) => void;
  onCompleteMilestone: (milestoneId: string, isCompleted: boolean) => void;
}

const defaultColors = [
  '#3b82f6', // blue
  '#10b981', // green
  '#f59e0b', // yellow
  '#ef4444', // red
  '#8b5cf6', // purple
  '#06b6d4', // cyan
  '#f97316', // orange
  '#84cc16', // lime
];

export function MilestoneManager({
  boardId,
  milestones,
  onCreateMilestone,
  onUpdateMilestone,
  onDeleteMilestone,
  onCompleteMilestone,
}: MilestoneManagerProps) {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingMilestone, setEditingMilestone] = useState<Milestone | null>(null);
  const [newMilestone, setNewMilestone] = useState({
    name: '',
    description: '',
    due_date: '',
    color: defaultColors[0],
    position: milestones.length,
    is_completed: false,
  });

  const handleCreateMilestone = () => {
    if (!newMilestone.name.trim()) return;

    onCreateMilestone({
      ...newMilestone,
      position: milestones.length,
    });

    setNewMilestone({
      name: '',
      description: '',
      due_date: '',
      color: defaultColors[0],
      position: milestones.length + 1,
      is_completed: false,
    });
    setIsCreateDialogOpen(false);
  };

  const handleUpdateMilestone = () => {
    if (!editingMilestone?.id || !editingMilestone.name.trim()) return;

    onUpdateMilestone(editingMilestone.id, editingMilestone);
    setEditingMilestone(null);
  };

  const handleToggleComplete = (milestone: Milestone) => {
    onCompleteMilestone(milestone.id, !milestone.is_completed);
  };

  const getStatusColor = (milestone: Milestone) => {
    if (milestone.is_completed) return 'text-green-600';
    if (milestone.due_date && new Date(milestone.due_date) < new Date()) return 'text-red-600';
    return 'text-gray-600';
  };

  const getDaysUntilDue = (dueDate: string): number => {
    const due = new Date(dueDate);
    const today = new Date();
    const diffTime = due.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const sortedMilestones = [...milestones].sort((a, b) => {
    if (a.is_completed !== b.is_completed) {
      return a.is_completed ? 1 : -1; // Incomplete first
    }
    return a.position - b.position;
  });

  const completedMilestones = milestones.filter(m => m.is_completed).length;
  const overallProgress = milestones.length > 0 ? (completedMilestones / milestones.length) * 100 : 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <CardTitle className="flex items-center">
              <Target className="w-5 h-5 mr-2" />
              Milestones
            </CardTitle>
            {milestones.length > 0 && (
              <Badge variant="outline">
                {completedMilestones}/{milestones.length} completed
              </Badge>
            )}
          </div>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="w-4 h-4 mr-2" />
                Add Milestone
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Milestone</DialogTitle>
                <DialogDescription>
                  Add a new milestone to track major project goals
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="milestoneName">Milestone Name</Label>
                  <Input
                    id="milestoneName"
                    placeholder="Enter milestone name"
                    value={newMilestone.name}
                    onChange={(e) => setNewMilestone({ ...newMilestone, name: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="milestoneDescription">Description (optional)</Label>
                  <Textarea
                    id="milestoneDescription"
                    placeholder="Describe this milestone"
                    value={newMilestone.description}
                    onChange={(e) => setNewMilestone({ ...newMilestone, description: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="milestoneDueDate">Due Date (optional)</Label>
                  <Input
                    id="milestoneDueDate"
                    type="date"
                    value={newMilestone.due_date}
                    onChange={(e) => setNewMilestone({ ...newMilestone, due_date: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="milestoneColor">Color</Label>
                  <div className="flex items-center space-x-2 mt-2">
                    {defaultColors.map((color) => (
                      <button
                        key={color}
                        type="button"
                        className={`w-8 h-8 rounded-full border-2 ${
                          newMilestone.color === color ? 'border-gray-400' : 'border-gray-200'
                        }`}
                        style={{ backgroundColor: color }}
                        onClick={() => setNewMilestone({ ...newMilestone, color })}
                      />
                    ))}
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreateMilestone} disabled={!newMilestone.name.trim()}>
                  Create Milestone
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
        
        {milestones.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm text-gray-600">
              <span>Overall Progress</span>
              <span>{Math.round(overallProgress)}%</span>
            </div>
            <Progress value={overallProgress} className="h-2" />
          </div>
        )}
      </CardHeader>
      <CardContent>
        {milestones.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Target className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No milestones yet</p>
            <p className="text-sm">Create milestones to track major project goals</p>
          </div>
        ) : (
          <div className="space-y-4">
            {sortedMilestones.map((milestone) => {
              const daysUntilDue = milestone.due_date ? getDaysUntilDue(milestone.due_date) : null;
              
              return (
                <div
                  key={milestone.id}
                  className="border rounded-lg p-4 hover:shadow-sm transition-shadow"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-start space-x-3">
                      <div className="flex items-center space-x-2 mt-1">
                        <input
                          type="checkbox"
                          checked={milestone.is_completed}
                          onChange={() => handleToggleComplete(milestone)}
                          className="rounded"
                        />
                        <div
                          className="w-4 h-4 rounded-full"
                          style={{ backgroundColor: milestone.color }}
                        />
                      </div>
                      <div className="flex-1">
                        <h4 className={`font-medium ${milestone.is_completed ? 'line-through text-gray-500' : ''}`}>
                          {milestone.name}
                        </h4>
                        {milestone.description && (
                          <p className="text-sm text-gray-600 mt-1">{milestone.description}</p>
                        )}
                        
                        <div className="flex items-center space-x-4 mt-2 text-sm text-gray-500">
                          {milestone.due_date && (
                            <div className={`flex items-center space-x-1 ${getStatusColor(milestone)}`}>
                              <Calendar className="w-4 h-4" />
                              <span>
                                {new Date(milestone.due_date).toLocaleDateString()}
                                {daysUntilDue !== null && !milestone.is_completed && (
                                  <>
                                    {' • '}
                                    {daysUntilDue > 0 ? (
                                      <span>{daysUntilDue} days left</span>
                                    ) : daysUntilDue === 0 ? (
                                      <span className="text-orange-600 font-medium">Due today</span>
                                    ) : (
                                      <span className="text-red-600 font-medium">
                                        {Math.abs(daysUntilDue)} days overdue
                                      </span>
                                    )}
                                  </>
                                )}
                              </span>
                            </div>
                          )}
                          <div className="flex items-center space-x-1">
                            <Flag className="w-4 h-4" />
                            <span>{milestone.assigned_cards} cards</span>
                          </div>
                          {milestone.is_completed && milestone.completion_date && (
                            <div className="flex items-center space-x-1 text-green-600">
                              <CheckSquare className="w-4 h-4" />
                              <span>Completed {new Date(milestone.completion_date).toLocaleDateString()}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditingMilestone(milestone)}
                      >
                        <Edit3 className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onDeleteMilestone(milestone.id)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  
                  {milestone.assigned_cards > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm text-gray-600">
                        <span>Progress</span>
                        <span>{milestone.completed_cards}/{milestone.assigned_cards} cards completed</span>
                      </div>
                      <Progress value={milestone.progress} className="h-2" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Edit Milestone Dialog */}
        <Dialog open={!!editingMilestone} onOpenChange={() => setEditingMilestone(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Milestone</DialogTitle>
              <DialogDescription>
                Update the milestone details
              </DialogDescription>
            </DialogHeader>
            {editingMilestone && (
              <div className="space-y-4">
                <div>
                  <Label htmlFor="editMilestoneName">Milestone Name</Label>
                  <Input
                    id="editMilestoneName"
                    placeholder="Enter milestone name"
                    value={editingMilestone.name}
                    onChange={(e) =>
                      setEditingMilestone({ ...editingMilestone, name: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="editMilestoneDescription">Description (optional)</Label>
                  <Textarea
                    id="editMilestoneDescription"
                    placeholder="Describe this milestone"
                    value={editingMilestone.description || ''}
                    onChange={(e) =>
                      setEditingMilestone({ ...editingMilestone, description: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="editMilestoneDueDate">Due Date (optional)</Label>
                  <Input
                    id="editMilestoneDueDate"
                    type="date"
                    value={editingMilestone.due_date || ''}
                    onChange={(e) =>
                      setEditingMilestone({ ...editingMilestone, due_date: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="editMilestoneColor">Color</Label>
                  <div className="flex items-center space-x-2 mt-2">
                    {defaultColors.map((color) => (
                      <button
                        key={color}
                        type="button"
                        className={`w-8 h-8 rounded-full border-2 ${
                          editingMilestone.color === color ? 'border-gray-400' : 'border-gray-200'
                        }`}
                        style={{ backgroundColor: color }}
                        onClick={() => setEditingMilestone({ ...editingMilestone, color })}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingMilestone(null)}>
                Cancel
              </Button>
              <Button onClick={handleUpdateMilestone} disabled={!editingMilestone?.name.trim()}>
                Update Milestone
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}