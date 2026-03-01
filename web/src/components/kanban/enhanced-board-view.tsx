'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Search,
  Filter,
  Plus,
  Settings,
  MoreHorizontal,
  Users,
  Target,
  Clock,
  BarChart3,
  Eye,
  EyeOff,
  Maximize2,
  Grid3X3,
  List,
  Calendar,
  Timer,
  AlertTriangle,
  TrendingUp,
  Activity
} from 'lucide-react';
import { EnhancedCard, type EnhancedKanbanCard } from './enhanced-card';
import { CardDetailModal } from './card-detail-modal';
import { BoardSettings } from './board-config';
import { MilestoneTimeline } from './milestones';
import { DependencyGraph } from './card-links';
import { TimeReports } from './time-tracking';
import type { CustomField } from './custom-fields';
import type { Milestone } from './milestones';

interface EnhancedBoardColumn {
  id: string;
  name: string;
  color: string;
  position: number;
  cards: EnhancedKanbanCard[];
  wip_limit?: number;
}

interface EnhancedBoardData {
  id: string;
  name: string;
  description?: string;
  color: string;
  columns: EnhancedBoardColumn[];
  customFields: CustomField[];
  milestones: Milestone[];
  settings: {
    enable_time_tracking: boolean;
    enable_subtasks: boolean;
    enable_card_links: boolean;
    allow_comments: boolean;
    enable_wip_limits: boolean;
  };
  members: Array<{
    id: string;
    name: string;
    email: string;
    avatar?: string;
  }>;
}

interface BoardStats {
  totalCards: number;
  completedCards: number;
  overdueCards: number;
  blockedCards: number;
  totalTimeSpent: number;
  averageCardAge: number;
  activeTimers: number;
}

interface EnhancedBoardViewProps {
  board: EnhancedBoardData;
  stats: BoardStats;
  onUpdateBoard: (updates: Partial<EnhancedBoardData>) => void;
  onCreateCard: (columnId: string, card: Partial<EnhancedKanbanCard>) => void;
  onUpdateCard: (cardId: string, updates: Partial<EnhancedKanbanCard>) => void;
  onDeleteCard: (cardId: string) => void;
  onMoveCard: (cardId: string, fromColumn: string, toColumn: string, position: number) => void;
}

export function EnhancedBoardView({
  board,
  stats,
  onUpdateBoard,
  onCreateCard,
  onUpdateCard,
  onDeleteCard,
  onMoveCard,
}: EnhancedBoardViewProps) {
  const [viewMode, setViewMode] = useState<'board' | 'list' | 'timeline' | 'dependencies' | 'reports'>('board');
  const [selectedCard, setSelectedCard] = useState<EnhancedKanbanCard | null>(null);
  const [isCardDetailOpen, setIsCardDetailOpen] = useState(false);
  const [isBoardSettingsOpen, setIsBoardSettingsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState({
    assignee: '',
    priority: '',
    milestone: '',
    dueDate: '',
    hasLinks: false,
    hasSubtasks: false,
    isBlocked: false,
    activeTimer: false,
  });
  const [showFilters, setShowFilters] = useState(false);
  const [isCompactView, setIsCompactView] = useState(false);

  // Filter cards based on search and filters
  const getFilteredCards = (cards: EnhancedKanbanCard[]) => {
    return cards.filter(card => {
      // Search query
      if (searchQuery && !card.title.toLowerCase().includes(searchQuery.toLowerCase()) &&
          !card.description?.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }

      // Assignee filter
      if (filters.assignee && card.assignee !== filters.assignee) {
        return false;
      }

      // Priority filter
      if (filters.priority && card.priority !== filters.priority) {
        return false;
      }

      // Milestone filter
      if (filters.milestone && card.milestone?.id !== filters.milestone) {
        return false;
      }

      // Due date filter
      if (filters.dueDate) {
        const cardDueDate = card.dueDate ? new Date(card.dueDate) : null;
        const filterDate = new Date(filters.dueDate);
        if (!cardDueDate || cardDueDate.toDateString() !== filterDate.toDateString()) {
          return false;
        }
      }

      // Boolean filters
      if (filters.hasLinks && (!card.links || card.links.length === 0)) {
        return false;
      }

      if (filters.hasSubtasks && (!card.subtasks || card.subtasks.length === 0)) {
        return false;
      }

      if (filters.isBlocked && !card.isBlocked) {
        return false;
      }

      if (filters.activeTimer && !card.activeTimeEntry) {
        return false;
      }

      return true;
    });
  };

  const handleCardClick = (card: EnhancedKanbanCard) => {
    setSelectedCard(card);
    setIsCardDetailOpen(true);
  };

  const handleCardUpdate = (cardId: string, updates: Partial<EnhancedKanbanCard>) => {
    onUpdateCard(cardId, updates);
    if (selectedCard && selectedCard.id === cardId) {
      setSelectedCard({ ...selectedCard, ...updates });
    }
  };

  const clearFilters = () => {
    setFilters({
      assignee: '',
      priority: '',
      milestone: '',
      dueDate: '',
      hasLinks: false,
      hasSubtasks: false,
      isBlocked: false,
      activeTimer: false,
    });
    setSearchQuery('');
  };

  const hasActiveFilters = searchQuery || Object.values(filters).some(value => 
    typeof value === 'boolean' ? value : value !== ''
  );

  const formatDuration = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    return hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
  };

  const completedPercentage = stats.totalCards > 0 ? (stats.completedCards / stats.totalCards) * 100 : 0;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b sticky top-0 z-40">
        <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <div>
                <h1 className="text-xl font-semibold text-gray-900">{board.name}</h1>
                {board.description && (
                  <p className="text-sm text-gray-600">{board.description}</p>
                )}
              </div>

              {/* Quick stats */}
              <div className="hidden lg:flex items-center space-x-4 text-sm text-gray-600">
                <div className="flex items-center space-x-1">
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                  <span>{stats.completedCards}/{stats.totalCards} cards</span>
                </div>
                {stats.overdueCards > 0 && (
                  <div className="flex items-center space-x-1 text-red-600">
                    <AlertTriangle className="w-4 h-4" />
                    <span>{stats.overdueCards} overdue</span>
                  </div>
                )}
                {stats.blockedCards > 0 && (
                  <div className="flex items-center space-x-1 text-orange-600">
                    <AlertTriangle className="w-4 h-4" />
                    <span>{stats.blockedCards} blocked</span>
                  </div>
                )}
                {stats.activeTimers > 0 && (
                  <div className="flex items-center space-x-1 text-green-600">
                    <Timer className="w-4 h-4" />
                    <span>{stats.activeTimers} active</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center space-x-2">
              {/* Search */}
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <Input
                  placeholder="Search cards..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 w-64"
                />
              </div>

              {/* Filters */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowFilters(!showFilters)}
                className={hasActiveFilters ? 'border-blue-500 text-blue-600' : ''}
              >
                <Filter className="w-4 h-4 mr-2" />
                Filters
                {hasActiveFilters && (
                  <Badge className="ml-2 bg-blue-500 text-white">
                    {Object.values(filters).filter(v => typeof v === 'boolean' ? v : v !== '').length}
                  </Badge>
                )}
              </Button>

              {/* View mode selector */}
              <Tabs value={viewMode} onValueChange={(value: any) => setViewMode(value)}>
                <TabsList className="h-9">
                  <TabsTrigger value="board" className="px-3">
                    <Grid3X3 className="w-4 h-4 mr-1" />
                    Board
                  </TabsTrigger>
                  <TabsTrigger value="list" className="px-3">
                    <List className="w-4 h-4 mr-1" />
                    List
                  </TabsTrigger>
                  <TabsTrigger value="timeline" className="px-3">
                    <Target className="w-4 h-4 mr-1" />
                    Timeline
                  </TabsTrigger>
                  <TabsTrigger value="dependencies" className="px-3">
                    <Activity className="w-4 h-4 mr-1" />
                    Dependencies
                  </TabsTrigger>
                  <TabsTrigger value="reports" className="px-3">
                    <BarChart3 className="w-4 h-4 mr-1" />
                    Reports
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              {/* View options */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Eye className="w-4 h-4 mr-2" />
                    View
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setIsCompactView(!isCompactView)}>
                    {isCompactView ? <EyeOff className="w-4 h-4 mr-2" /> : <Eye className="w-4 h-4 mr-2" />}
                    {isCompactView ? 'Detailed View' : 'Compact View'}
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Maximize2 className="w-4 h-4 mr-2" />
                    Full Screen
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Board settings */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsBoardSettingsOpen(true)}
              >
                <Settings className="w-4 h-4 mr-2" />
                Settings
              </Button>

              {/* Board members */}
              <div className="flex items-center -space-x-1">
                {board.members.slice(0, 3).map((member) => (
                  <div
                    key={member.id}
                    className="w-8 h-8 rounded-full bg-gray-200 border-2 border-white flex items-center justify-center text-xs font-medium"
                    title={member.name}
                  >
                    {member.avatar ? (
                      <img src={member.avatar} alt={member.name} className="w-full h-full rounded-full object-cover" />
                    ) : (
                      member.name.charAt(0).toUpperCase()
                    )}
                  </div>
                ))}
                {board.members.length > 3 && (
                  <div className="w-8 h-8 rounded-full bg-gray-100 border-2 border-white flex items-center justify-center text-xs text-gray-600">
                    +{board.members.length - 3}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Filters panel */}
          {showFilters && (
            <div className="border-t bg-gray-50 p-4">
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
                <div>
                  <label className="text-xs font-medium text-gray-700">Assignee</label>
                  <select
                    value={filters.assignee}
                    onChange={(e) => setFilters({ ...filters, assignee: e.target.value })}
                    className="w-full px-2 py-1 text-sm border rounded"
                  >
                    <option value="">All</option>
                    {board.members.map((member) => (
                      <option key={member.id} value={member.name}>
                        {member.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700">Priority</label>
                  <select
                    value={filters.priority}
                    onChange={(e) => setFilters({ ...filters, priority: e.target.value })}
                    className="w-full px-2 py-1 text-sm border rounded"
                  >
                    <option value="">All</option>
                    <option value="urgent">Urgent</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700">Milestone</label>
                  <select
                    value={filters.milestone}
                    onChange={(e) => setFilters({ ...filters, milestone: e.target.value })}
                    className="w-full px-2 py-1 text-sm border rounded"
                  >
                    <option value="">All</option>
                    {board.milestones.map((milestone) => (
                      <option key={milestone.id} value={milestone.id}>
                        {milestone.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700">Due Date</label>
                  <input
                    type="date"
                    value={filters.dueDate}
                    onChange={(e) => setFilters({ ...filters, dueDate: e.target.value })}
                    className="w-full px-2 py-1 text-sm border rounded"
                  />
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={filters.hasLinks}
                    onChange={(e) => setFilters({ ...filters, hasLinks: e.target.checked })}
                    className="rounded"
                  />
                  <label className="text-xs font-medium text-gray-700">Has Links</label>
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={filters.hasSubtasks}
                    onChange={(e) => setFilters({ ...filters, hasSubtasks: e.target.checked })}
                    className="rounded"
                  />
                  <label className="text-xs font-medium text-gray-700">Has Subtasks</label>
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={filters.isBlocked}
                    onChange={(e) => setFilters({ ...filters, isBlocked: e.target.checked })}
                    className="rounded"
                  />
                  <label className="text-xs font-medium text-gray-700">Blocked</label>
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={filters.activeTimer}
                    onChange={(e) => setFilters({ ...filters, activeTimer: e.target.checked })}
                    className="rounded"
                  />
                  <label className="text-xs font-medium text-gray-700">Active Timer</label>
                </div>
              </div>
              {hasActiveFilters && (
                <div className="mt-4 flex justify-end">
                  <Button variant="outline" size="sm" onClick={clearFilters}>
                    Clear All Filters
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Main content */}
      <main className="p-6">
        {viewMode === 'board' && (
          <div className="flex space-x-6 overflow-x-auto pb-6">
            {board.columns.map((column) => {
              const filteredCards = getFilteredCards(column.cards);
              const isOverWipLimit = column.wip_limit && filteredCards.length > column.wip_limit;

              return (
                <div key={column.id} className="flex-shrink-0 w-80">
                  <Card className={`h-full ${isOverWipLimit ? 'border-red-300' : ''}`}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="flex items-center space-x-2">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: column.color }}
                          />
                          <span>{column.name}</span>
                          <Badge variant="outline">
                            {filteredCards.length}
                          </Badge>
                        </CardTitle>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onCreateCard(column.id, {})}
                        >
                          <Plus className="w-4 h-4" />
                        </Button>
                      </div>
                      {column.wip_limit && (
                        <div className="text-xs text-gray-500">
                          WIP Limit: {filteredCards.length}/{column.wip_limit}
                          {isOverWipLimit && <span className="text-red-600 ml-1">(Over limit!)</span>}
                        </div>
                      )}
                    </CardHeader>
                    <CardContent className="space-y-3 max-h-96 overflow-y-auto">
                      {filteredCards.map((card) => (
                        <EnhancedCard
                          key={card.id}
                          card={card}
                          onClick={() => handleCardClick(card)}
                          isCompact={isCompactView}
                          onQuickEdit={() => handleCardClick(card)}
                          onStartTimer={() => {
                            // Handle start timer
                          }}
                          onStopTimer={() => {
                            // Handle stop timer
                          }}
                        />
                      ))}
                      {filteredCards.length === 0 && (
                        <div className="text-center py-8 text-gray-500">
                          <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center mx-auto mb-2">
                            <Plus className="w-6 h-6" />
                          </div>
                          <p className="text-sm">No cards</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              );
            })}
          </div>
        )}

        {viewMode === 'timeline' && (
          <MilestoneTimeline
            milestones={board.milestones}
            onMilestoneClick={(milestone) => {
              // Handle milestone click
            }}
          />
        )}

        {viewMode === 'dependencies' && (
          <DependencyGraph
            boardId={board.id}
            cards={board.columns.flatMap(col => col.cards.map(card => ({
              id: card.id,
              title: card.title,
              column: col.name,
              priority: card.priority,
              isCompleted: false, // This should come from card status
            })))}
            links={board.columns.flatMap(col => col.cards.flatMap(card => card.links || []))}
            onCardClick={handleCardClick}
          />
        )}

        {viewMode === 'reports' && (
          <TimeReports
            boardId={board.id}
            onGenerateReport={() => {
              // Handle generate report
            }}
            onExportReport={() => {
              // Handle export report
            }}
          />
        )}
      </main>

      {/* Card Detail Modal */}
      <CardDetailModal
        card={selectedCard}
        isOpen={isCardDetailOpen}
        onClose={() => {
          setIsCardDetailOpen(false);
          setSelectedCard(null);
        }}
        boardCustomFields={board.customFields}
        onUpdateCard={handleCardUpdate}
      />

      {/* Board Settings Modal */}
      <BoardSettings
        board={board as any}
        isOpen={isBoardSettingsOpen}
        onClose={() => setIsBoardSettingsOpen(false)}
        onUpdateBoard={onUpdateBoard}
        onExportBoard={() => {}}
        onImportBoard={() => {}}
        onDeleteBoard={() => {}}
        onInviteMember={() => {}}
        onUpdateMemberRole={() => {}}
        onRemoveMember={() => {}}
      />
    </div>
  );
}