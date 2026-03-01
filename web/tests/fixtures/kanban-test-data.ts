/**
 * Test data fixtures for Kanban board testing
 * Provides sample data, test scenarios, and data generators
 */

export interface TestKanbanCard {
  id: string;
  title: string;
  description?: string;
  assignee?: string;
  priority: 'low' | 'medium' | 'high';
  dueDate?: string;
  labels?: string[];
  columnId: string;
  position?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface TestKanbanColumn {
  id: string;
  name: string;
  color: string;
  position: number;
  cards: TestKanbanCard[];
  maxCards?: number;
}

export interface TestKanbanBoard {
  id: string;
  name: string;
  description?: string;
  columns: TestKanbanColumn[];
  members?: string[];
  settings?: {
    allowComments: boolean;
    enableDueDates: boolean;
    cardLimit?: number;
  };
  createdAt?: string;
  updatedAt?: string;
}

// Sample test boards
export const TEST_BOARDS: TestKanbanBoard[] = [
  {
    id: 'board-1',
    name: 'Software Development',
    description: 'Main development board for tracking features and bugs',
    columns: [
      {
        id: 'col-todo',
        name: 'To Do',
        color: '#6b7280',
        position: 0,
        cards: [
          {
            id: 'card-1',
            title: 'Implement user authentication',
            description: 'Add login and signup functionality',
            priority: 'high',
            assignee: 'John Doe',
            dueDate: '2025-02-15',
            labels: ['backend', 'security'],
            columnId: 'col-todo',
            position: 0,
          },
          {
            id: 'card-2',
            title: 'Design landing page mockups',
            description: 'Create wireframes and visual designs',
            priority: 'medium',
            assignee: 'Jane Smith',
            labels: ['design', 'frontend'],
            columnId: 'col-todo',
            position: 1,
          },
        ],
      },
      {
        id: 'col-progress',
        name: 'In Progress',
        color: '#3b82f6',
        position: 1,
        cards: [
          {
            id: 'card-3',
            title: 'API endpoint development',
            description: 'Building REST endpoints for user management',
            priority: 'high',
            assignee: 'John Doe',
            dueDate: '2025-02-10',
            labels: ['backend', 'api'],
            columnId: 'col-progress',
            position: 0,
          },
        ],
      },
      {
        id: 'col-done',
        name: 'Done',
        color: '#10b981',
        position: 2,
        cards: [
          {
            id: 'card-4',
            title: 'Project setup and configuration',
            description: 'Initial project structure and tooling',
            priority: 'medium',
            assignee: 'Admin',
            labels: ['setup', 'devops'],
            columnId: 'col-done',
            position: 0,
          },
        ],
      },
    ],
    members: ['John Doe', 'Jane Smith', 'Admin'],
    settings: {
      allowComments: true,
      enableDueDates: true,
      cardLimit: 20,
    },
  },
  {
    id: 'board-2',
    name: 'Marketing Campaign',
    description: 'Q1 2025 Marketing initiatives',
    columns: [
      {
        id: 'col-ideas',
        name: 'Ideas',
        color: '#8b5cf6',
        position: 0,
        cards: [],
      },
      {
        id: 'col-planning',
        name: 'Planning',
        color: '#f59e0b',
        position: 1,
        cards: [],
      },
      {
        id: 'col-execution',
        name: 'In Execution',
        color: '#ef4444',
        position: 2,
        cards: [],
      },
      {
        id: 'col-completed',
        name: 'Completed',
        color: '#22c55e',
        position: 3,
        cards: [],
      },
    ],
    members: ['Marketing Team'],
    settings: {
      allowComments: true,
      enableDueDates: true,
    },
  },
];

// Empty board for testing board creation
export const EMPTY_BOARD: Partial<TestKanbanBoard> = {
  name: '',
  description: '',
  columns: [
    {
      id: 'col-todo',
      name: 'To Do',
      color: '#6b7280',
      position: 0,
      cards: [],
    },
    {
      id: 'col-progress',
      name: 'In Progress',
      color: '#3b82f6',
      position: 1,
      cards: [],
    },
    {
      id: 'col-done',
      name: 'Done',
      color: '#10b981',
      position: 2,
      cards: [],
    },
  ],
};

// Large board for performance testing
export const LARGE_BOARD: TestKanbanBoard = {
  id: 'board-large',
  name: 'Performance Test Board',
  description: 'Board with many cards for performance testing',
  columns: [
    {
      id: 'col-backlog',
      name: 'Backlog',
      color: '#6b7280',
      position: 0,
      cards: Array.from({ length: 50 }, (_, i) => ({
        id: `card-backlog-${i}`,
        title: `Backlog Task ${i + 1}`,
        description: `Description for backlog task ${i + 1}`,
        priority: (['low', 'medium', 'high'] as const)[i % 3],
        assignee: `User ${(i % 5) + 1}`,
        labels: [`label-${i % 3}`, `category-${i % 4}`],
        columnId: 'col-backlog',
        position: i,
      })),
    },
    {
      id: 'col-active',
      name: 'Active',
      color: '#3b82f6',
      position: 1,
      cards: Array.from({ length: 30 }, (_, i) => ({
        id: `card-active-${i}`,
        title: `Active Task ${i + 1}`,
        description: `Description for active task ${i + 1}`,
        priority: (['low', 'medium', 'high'] as const)[i % 3],
        assignee: `User ${(i % 5) + 1}`,
        dueDate: new Date(Date.now() + i * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        labels: [`urgent-${i % 2}`, `feature-${i % 3}`],
        columnId: 'col-active',
        position: i,
      })),
    },
    {
      id: 'col-review',
      name: 'Review',
      color: '#f59e0b',
      position: 2,
      cards: Array.from({ length: 20 }, (_, i) => ({
        id: `card-review-${i}`,
        title: `Review Task ${i + 1}`,
        priority: (['low', 'medium', 'high'] as const)[i % 3],
        columnId: 'col-review',
        position: i,
      })),
    },
    {
      id: 'col-completed',
      name: 'Completed',
      color: '#10b981',
      position: 3,
      cards: Array.from({ length: 40 }, (_, i) => ({
        id: `card-completed-${i}`,
        title: `Completed Task ${i + 1}`,
        priority: (['low', 'medium', 'high'] as const)[i % 3],
        columnId: 'col-completed',
        position: i,
      })),
    },
  ],
  members: ['User 1', 'User 2', 'User 3', 'User 4', 'User 5'],
  settings: {
    allowComments: true,
    enableDueDates: true,
    cardLimit: 200,
  },
};

// Test card templates
export const CARD_TEMPLATES = {
  minimal: {
    title: 'Test Card',
    priority: 'medium' as const,
    columnId: 'col-todo',
  },
  complete: {
    title: 'Complete Test Card',
    description: 'This is a fully populated test card with all fields',
    priority: 'high' as const,
    assignee: 'Test User',
    dueDate: '2025-03-01',
    labels: ['test', 'automation', 'important'],
    columnId: 'col-todo',
  },
  overdue: {
    title: 'Overdue Card',
    description: 'This card is past its due date',
    priority: 'high' as const,
    dueDate: '2024-12-01',
    columnId: 'col-progress',
  },
};

// Validation test cases
export const VALIDATION_TEST_CASES = {
  invalidCardTitle: [
    { title: '', expectedError: 'Title is required' },
    { title: '   ', expectedError: 'Title is required' },
    { title: 'x'.repeat(256), expectedError: 'Title too long' },
  ],
  invalidBoardName: [
    { name: '', expectedError: 'Board name is required' },
    { name: '   ', expectedError: 'Board name is required' },
    { name: 'x'.repeat(101), expectedError: 'Board name too long' },
  ],
  invalidDates: [
    { dueDate: '2024-13-01', expectedError: 'Invalid date format' },
    { dueDate: '2024-02-30', expectedError: 'Invalid date' },
    { dueDate: 'not-a-date', expectedError: 'Invalid date format' },
  ],
};

// Real-time collaboration scenarios
export const COLLABORATION_SCENARIOS = {
  simultaneousEdit: {
    description: 'Two users editing the same card simultaneously',
    users: ['user1', 'user2'],
    actions: [
      { user: 'user1', action: 'edit_card', cardId: 'card-1', field: 'title', value: 'Updated by User 1' },
      { user: 'user2', action: 'edit_card', cardId: 'card-1', field: 'description', value: 'Updated by User 2' },
    ],
  },
  cardMoving: {
    description: 'Multiple users moving cards',
    users: ['user1', 'user2'],
    actions: [
      { user: 'user1', action: 'move_card', cardId: 'card-1', from: 'col-todo', to: 'col-progress' },
      { user: 'user2', action: 'move_card', cardId: 'card-2', from: 'col-todo', to: 'col-done' },
    ],
  },
  conflictResolution: {
    description: 'Handling conflicts when users perform conflicting actions',
    users: ['user1', 'user2'],
    actions: [
      { user: 'user1', action: 'delete_card', cardId: 'card-1' },
      { user: 'user2', action: 'edit_card', cardId: 'card-1', field: 'title', value: 'Should not work' },
    ],
  },
};

// Performance benchmarks
export const PERFORMANCE_BENCHMARKS = {
  dragDropLatency: {
    maxLatency: 100, // milliseconds
    description: 'Maximum acceptable latency for drag and drop operations',
  },
  boardLoadTime: {
    maxTime: 2000, // milliseconds
    description: 'Maximum time to load a board with 100+ cards',
  },
  realtimeUpdateDelay: {
    maxDelay: 500, // milliseconds
    description: 'Maximum delay for real-time updates to appear',
  },
};

// Accessibility test scenarios
export const ACCESSIBILITY_SCENARIOS = {
  keyboardNavigation: [
    'Tab through all interactive elements',
    'Arrow keys to navigate between cards',
    'Enter/Space to activate drag mode',
    'Escape to cancel drag operation',
  ],
  screenReaderAnnouncements: [
    'Card moved from column to column',
    'New card created',
    'Card deleted',
    'Board loaded with X cards',
  ],
  ariaLabels: [
    'Cards have descriptive aria-labels',
    'Columns have proper role and labels',
    'Drag handles are properly labeled',
    'Drop zones announce valid drop targets',
  ],
};

// Data generators
export class KanbanDataGenerator {
  static createBoard(overrides: Partial<TestKanbanBoard> = {}): TestKanbanBoard {
    const id = overrides.id || `board-${Date.now()}`;
    return {
      id,
      name: overrides.name || `Test Board ${id}`,
      description: overrides.description || 'Generated test board',
      columns: overrides.columns || this.createDefaultColumns(),
      members: overrides.members || ['Test User'],
      settings: overrides.settings || {
        allowComments: true,
        enableDueDates: true,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...overrides,
    };
  }

  static createCard(overrides: Partial<TestKanbanCard> = {}): TestKanbanCard {
    const id = overrides.id || `card-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    return {
      id,
      title: overrides.title || `Test Card ${id}`,
      description: overrides.description || 'Generated test card',
      priority: overrides.priority || 'medium',
      columnId: overrides.columnId || 'col-todo',
      position: overrides.position || 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...overrides,
    };
  }

  static createColumn(overrides: Partial<TestKanbanColumn> = {}): TestKanbanColumn {
    const id = overrides.id || `col-${Date.now()}`;
    return {
      id,
      name: overrides.name || `Test Column ${id}`,
      color: overrides.color || '#6b7280',
      position: overrides.position || 0,
      cards: overrides.cards || [],
      ...overrides,
    };
  }

  static createDefaultColumns(): TestKanbanColumn[] {
    return [
      this.createColumn({ id: 'col-todo', name: 'To Do', color: '#6b7280', position: 0 }),
      this.createColumn({ id: 'col-progress', name: 'In Progress', color: '#3b82f6', position: 1 }),
      this.createColumn({ id: 'col-done', name: 'Done', color: '#10b981', position: 2 }),
    ];
  }

  static createBulkCards(count: number, columnId: string = 'col-todo'): TestKanbanCard[] {
    return Array.from({ length: count }, (_, i) => 
      this.createCard({
        title: `Bulk Card ${i + 1}`,
        description: `Generated card ${i + 1} for bulk testing`,
        priority: (['low', 'medium', 'high'] as const)[i % 3],
        columnId,
        position: i,
      })
    );
  }
}

// Export commonly used test data
export const SAMPLE_BOARD = TEST_BOARDS[0];
export const EMPTY_COLUMN = EMPTY_BOARD.columns![0];
export const SAMPLE_CARD = SAMPLE_BOARD.columns[0].cards[0];